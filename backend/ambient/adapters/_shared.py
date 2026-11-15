"""Helpers shared by the built-in adapters (not an adapter itself; registers nothing).

Option validation, secret-safe HTTP, dotted-path lookup, item normalisation for the simple
formats (file / command / push), timezone, and the weather vocabulary every weather adapter maps onto.
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timezone, tzinfo
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from ..util import parse_duration


class OptionError(ValueError):
    """Bad [[source]] options. Raised from __init__ so the scheduler reports it at startup."""


class SourceError(RuntimeError):
    """A fetch failed in a way worth one clear line in /api/sources (never contains secrets)."""


# ---------------------------------------------------------------------- options
_MISSING = object()


def opt(options: dict[str, Any], key: str, kind: type | tuple[type, ...] | None = None,
        default: Any = _MISSING, *, source: str = "") -> Any:
    """Read an option, checking its type. Missing + no default = OptionError."""
    if key not in options or options[key] is None:
        if default is _MISSING:
            raise OptionError(f"source {source!r}: option {key!r} is required")
        return default
    v = options[key]
    if kind is not None:
        kinds = kind if isinstance(kind, tuple) else (kind,)
        # bool is an int subclass: don't let `true` pass as a number
        if isinstance(v, bool) and bool not in kinds:
            ok = False
        elif float in kinds and isinstance(v, int) and not isinstance(v, bool):
            ok = True
        else:
            ok = isinstance(v, kinds)
        if not ok:
            names = " or ".join(k.__name__ for k in kinds)
            raise OptionError(f"source {source!r}: option {key!r} must be {names}, got {v!r}")
    return v


def opt_duration(options: dict[str, Any], key: str, default: float, *, source: str = "") -> float:
    v = options.get(key)
    if v is None:
        return default
    try:
        d = parse_duration(v)
    except ValueError as e:
        raise OptionError(f"source {source!r}: option {key!r}: {e}") from None
    if d is None or d <= 0:
        raise OptionError(f"source {source!r}: option {key!r} must be > 0")
    return d


def opt_choice(options: dict[str, Any], key: str, choices: Iterable[str], default: str, *,
               source: str = "") -> str:
    v = opt(options, key, str, default, source=source)
    choices = list(choices)
    if v not in choices:
        raise OptionError(f"source {source!r}: option {key!r} must be one of {', '.join(choices)}; got {v!r}")
    return v


# ---------------------------------------------------------------------- paths
def resolve_data_path(path: str, data_dir: Path) -> Path:
    p = Path(path).expanduser()
    return p if p.is_absolute() else Path(data_dir) / p


def _repo_dir(name: str) -> Path:
    """Dev/container fallback for a top-level dir: /app/<name> in the image, <repo>/<name> in dev."""
    here = Path(__file__).resolve()
    for base in (here.parents[2], here.parents[3]):      # backend/ (= /app), then the repo root
        if (base / name).is_dir():
            return base / name
    return here.parents[3] / name


def scripts_dir() -> Path:
    return Path(os.environ.get("AMBIENT_SCRIPTS_DIR") or _repo_dir("scripts"))


def config_dir() -> Path:
    return Path(os.environ.get("AMBIENT_CONFIG_DIR") or _repo_dir("config"))


# ---------------------------------------------------------------------- time
def local_tz(settings: dict[str, Any] | None) -> tzinfo:
    name = ((settings or {}).get("location") or {}).get("timezone") or os.environ.get("TZ")
    if name:
        try:
            return ZoneInfo(name)
        except (ZoneInfoNotFoundError, ValueError):
            pass
    return datetime.now().astimezone().tzinfo or timezone.utc


def iso(dt: datetime | None) -> str | None:
    return None if dt is None else dt.isoformat(timespec="seconds")


# ---------------------------------------------------------------------- http (secret-safe)
def redact_url(url: str) -> str:
    """Scheme + host only. Paths and query strings can carry secrets (Google's iCal secret address,
    ?token=...), so neither ever reaches a log line or a status string."""
    try:
        u = urlsplit(str(url))
        host = u.hostname or "?"
        if u.port:
            host = f"{host}:{u.port}"
        return f"{u.scheme}://{host}/..." if u.scheme else "<url>"
    except Exception:  # noqa: BLE001
        return "<url>"


async def http_get(http: httpx.AsyncClient, url: str, *, headers: dict[str, str] | None = None,
                   params: dict[str, Any] | None = None, timeout: float = 15.0) -> httpx.Response:
    """GET with a timeout; any failure or non-2xx becomes a SourceError naming only the host."""
    shown = redact_url(url)
    try:
        r = await http.get(url, headers=headers, params=params, timeout=timeout)
    except httpx.TimeoutException:
        raise SourceError(f"GET {shown} timed out after {timeout:g} s") from None
    except httpx.HTTPError as e:
        raise SourceError(f"GET {shown} failed: {type(e).__name__}") from None
    if not 200 <= r.status_code < 300:
        raise SourceError(f"GET {shown} returned HTTP {r.status_code}{error_reason(r)}")
    return r


_URLISH = re.compile(r"\S*(?:https?://|www\.|[?&][\w.-]+=)\S*")


def error_reason(r: httpx.Response, limit: int = 160) -> str:
    """A short, secret-safe reason from a JSON error body (Google: {"error": {"status", "message"}}; OAuth:
    {"error", "error_description"}), e.g. ': PERMISSION_DENIED: The caller does not have permission'.
    URLs and query-ish fragments are stripped (an API could echo a key back), and it is length-capped.
    Empty when the body isn't a recognisable JSON error."""
    try:
        body = r.json()
    except Exception:  # noqa: BLE001 - HTML error pages, empty bodies
        return ""
    err = body.get("error") if isinstance(body, dict) else None
    if isinstance(err, dict):
        parts = [err.get("status"), err.get("message")]
    elif isinstance(err, str):
        parts = [err, body.get("error_description")]
    else:
        return ""
    text = ": ".join(str(p).strip() for p in parts if p)
    text = _URLISH.sub("<link>", text).replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"
    return f": {text}" if text else ""


async def http_get_json(http: httpx.AsyncClient, url: str, **kw: Any) -> Any:
    r = await http_get(http, url, **kw)
    try:
        return r.json()
    except ValueError:
        raise SourceError(f"GET {redact_url(url)}: response is not JSON") from None


# ---------------------------------------------------------------------- dotted paths
def dotted_get(doc: Any, path: str) -> Any:
    """'a.b.0.c' -> doc["a"]["b"][0]["c"]. Raises KeyError naming the failing segment."""
    cur = doc
    if path in ("", "."):
        return cur
    for part in path.split("."):
        if isinstance(cur, dict):
            if part not in cur:
                raise KeyError(part)
            cur = cur[part]
        elif isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError):
                raise KeyError(part) from None
        else:
            raise KeyError(part)
    return cur


# ---------------------------------------------------------------------- simple-format items
_ITEM_FIELDS = {"key", "value", "type", "ts", "ttl_s", "visibility", "meta"}
_TYPES = {"number", "string", "status", "event", "series", "object"}


def normalize_item(item: Any, where: str = "item") -> dict[str, Any]:
    """A {"key", "value", ...} dict from a file/command/push payload -> a clean SignalLike dict.

    Accepts `ttl` as a duration ("5m") as well as `ttl_s`; unknown fields go into meta.
    """
    if not isinstance(item, dict):
        raise ValueError(f"{where}: expected an object with 'key' and 'value', got {type(item).__name__}")
    if "key" not in item or "value" not in item:
        raise ValueError(f"{where}: needs 'key' and 'value'")
    key = item["key"]
    if not isinstance(key, str) or not key.strip():
        raise ValueError(f"{where}: 'key' must be a non-empty string")
    out: dict[str, Any] = {"key": key.strip(), "value": item["value"]}
    meta = dict(item.get("meta") or {}) if isinstance(item.get("meta"), dict) else {}
    for k, v in item.items():
        if k in ("key", "value", "meta"):
            continue
        if k == "ttl":
            out["ttl_s"] = parse_duration(v)
        elif k == "type":
            if v not in _TYPES:
                raise ValueError(f"{where}: type must be one of {sorted(_TYPES)}, got {v!r}")
            out["type"] = v
        elif k == "visibility":
            if v not in ("wall", "ask"):
                raise ValueError(f"{where}: visibility must be wall or ask, got {v!r}")
            out["visibility"] = v
        elif k in _ITEM_FIELDS:
            out[k] = v
        else:
            meta[k] = v
    if meta:
        out["meta"] = meta
    return out


def parse_scalar(text: str) -> Any:
    """CSV cell -> int / float / bool / None / str."""
    s = text.strip()
    if s == "":
        return None
    low = s.lower()
    if low in ("true", "false"):
        return low == "true"
    if low in ("null", "none"):
        return None
    if _NUM.match(s):
        n = s.replace(",", "")
        return int(n) if "." not in n and "e" not in n.lower() else float(n)
    return s


_NUM = re.compile(r"^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?([eE][+-]?\d+)?$|^[+-]?\.\d+$")


# ---------------------------------------------------------------------- weather vocabulary
CONDITIONS = ("clear", "cloudy", "fog", "rain", "storm", "snow")
PRECIP_CONDITIONS = ("rain", "storm", "snow")


def rain_or_snow(temp_c: float | None) -> str:
    """Sleet / freezing / mixed precipitation: snow at or below 0 C, rain above (rain if unknown)."""
    return "snow" if temp_c is not None and temp_c <= 0 else "rain"


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def _interp(x: float, pts: list[tuple[float, float]]) -> float:
    if x <= pts[0][0]:
        return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return pts[-1][1]


# Precipitation rate (mm/h of water) -> intensity 0..1.
#   rain:  0.2 drizzle (~0.5 mm/h), 0.6 moderate rain (~4 mm/h), 1.0 downpour (>= 16 mm/h)
#   snow:  0.3 light (~0.3 mm/h w.e., ~3 mm/h of snow), 0.6 moderate (~1.5 mm/h), 1.0 heavy (>= 4 mm/h)
_RAIN_SCALE = [(0.0, 0.1), (0.5, 0.2), (4.0, 0.6), (16.0, 1.0)]
_SNOW_SCALE = [(0.0, 0.15), (0.3, 0.3), (1.5, 0.6), (4.0, 1.0)]


def rate_intensity(rate_mm_h: float, condition: str) -> float:
    scale = _SNOW_SCALE if condition == "snow" else _RAIN_SCALE
    v = _interp(max(0.0, rate_mm_h), scale)
    if condition == "storm":
        v = max(v, 0.8)
    return round(clamp01(v), 2)


# ---------------------------------------------------------------------- now-playing progress anchor
SEEK_TOLERANCE_MS = 2500


def iso_ms(dt: datetime) -> str:
    return dt.isoformat(timespec="milliseconds")


class ProgressAnchor:
    """Keeps a `now` value's playback position as an anchor: `progress_ms` is the position at
    `anchor_at`, and both stay the same while playback is continuous, so steady playback re-emits an
    identical value (the pool refreshes ts only: no history row, no wall broadcast). The browser
    extrapolates progress_ms + (now - anchor_at) itself.

    Re-anchors (new progress_ms + anchor_at = this observation) when the track (track_id, else
    title + artist), is_playing or duration_ms changes, or when the observed progress is more than
    `tolerance_ms` away from the extrapolated one (a seek, buffering, a stall)."""

    def __init__(self, tolerance_ms: float = SEEK_TOLERANCE_MS):
        self.tolerance_ms = tolerance_ms
        self.state: tuple[Any, bool, Any, int | None, datetime] | None = None   # key, playing, dur, progress, at

    def apply(self, value: dict[str, Any] | None, observed_at: datetime) -> dict[str, Any] | None:
        if not isinstance(value, dict):
            self.state = None
            return value
        key = (value.get("track_id") or value.get("title"), value.get("artist"))
        playing = bool(value.get("is_playing"))
        dur = value.get("duration_ms")
        prog = value.get("progress_ms")
        st = self.state
        keep = st is not None and st[0] == key and st[1] == playing and st[2] == dur
        if keep:
            a_prog, a_at = st[3], st[4]
            if prog is None or a_prog is None:
                keep = prog is None and a_prog is None
            else:
                expected = a_prog + ((observed_at - a_at).total_seconds() * 1000 if playing else 0)
                keep = abs(prog - expected) <= self.tolerance_ms
        if not keep:
            self.state = (key, playing, dur, prog, observed_at)
        assert self.state is not None
        return dict(value, progress_ms=self.state[3], anchor_at=iso_ms(self.state[4]))
