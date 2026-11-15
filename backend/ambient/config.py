"""Load and validate config.toml (see ARCHITECTURE.md "config.toml").

    cfg = load_config(Path("/config"))                 # config.toml, else config.example.toml
    cfg.sources        -> [SourceConfig(name, type, enabled, options, disabled_reason)]
    cfg.settings()     -> {"location", "mode", "display"} for the WebSocket hello (no secrets)
    cfg.rule_cfg(name) -> the [rules.<name>] table ({} if absent)

`${NAME}` anywhere in a string value is replaced from config/secrets.toml (a flat table), then from
environment variables. A [[source]] with an unresolved `${NAME}` is disabled with a warning naming
the variable (never its value); elsewhere the value becomes None. Resolved secret values are
registered with `redact()` so they never reach logs or API error strings.
"""
from __future__ import annotations

import copy
import logging
import os
import re
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .util import parse_duration

log = logging.getLogger("ambient.config")

CONFIG_FILE = "config.toml"
EXAMPLE_FILE = "config.example.toml"
SECRETS_FILE = "secrets.toml"

# Source types the core itself understands, whether or not an adapter module exists for them.
CORE_TYPES = {"push"}
# Keys every [[source]] accepts; name/type/enabled are stripped before the adapter sees its options
# (every/ttl/visibility stay in options because Adapter.__init__ reads them from there).
COMMON_KEYS = {"name", "type", "enabled", "every", "ttl", "visibility"}
RESERVED_SOURCE_NAMES = {"rules"}
_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_VAR_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")
_HHMM_RE = re.compile(r"^([01]?\d|2[0-3]):[0-5]\d$")
# the cat's coats (frontend/js/cat.js COATS)
CAT_COATS = ("tabby", "ginger", "black", "grey", "tuxedo", "calico", "siamese", "white")

DEFAULTS: dict[str, dict[str, Any]] = {
    "server": {"host": "0.0.0.0", "port": 8700, "push_token": None, "max_body_bytes": 65536,
               "allowed_origins": []},
    "location": {"name": "Ottawa", "lat": 45.4215, "lon": -75.6972, "timezone": "America/Toronto"},
    "mode": {"work_start": "07:00", "work_end": "17:00", "work_days": [1, 2, 3, 4, 5],
             "transition_seconds": 8},
    # sound: whether the wall plays its ambient sound at all; volume 0..1 in ambient mode;
    # sound_work 0..1 = volume in work mode (0 = silent while working). Sent to the browser in hello.
    "display": {"theme": "cyberpunk", "hour24": True, "sound": False, "volume": 0.4, "sound_work": 0.0,
                "boost": 0,   # projector boost (shadow lift for dim projectors): 0 off, 1 low, 2 medium, 3 high
                "cat": False, "cat_coat": "tabby"},  # the cat in every scene (K on the wall), and its coat
    "history": {"keep": "14d"},
    "wall": {
        "calendar": "calendar.next",
        "calendar_advice": "rules.calendar.advice",
        "heartbeat": "rules.heartbeat.*",
        "heartbeat_raw": "heartbeat.host.*",
        "finances": "finances.month",
        "finance_mood": "rules.finances.mood",
        "weather_temp": "weather.now.temp_c",
        "weather_actionable": "rules.weather.actionable",
        "weather_condition": "weather.now.condition",
        "weather_intensity": "weather.now.intensity",
        "weather_wind": "weather.now.wind_kph",
    },
}


class ConfigError(Exception):
    """Invalid configuration. The message lists every problem found, one per line."""


# ---------------------------------------------------------------------- redaction
_SECRETS: set[str] = set()


def redact(text: str) -> str:
    """Replace any resolved secret value in `text` with ***."""
    if not text or not _SECRETS:
        return text
    for s in sorted(_SECRETS, key=len, reverse=True):
        if s in text:
            text = text.replace(s, "***")
    return text


class RedactFilter(logging.Filter):
    """Logging filter (attach to handlers) that scrubs secret values from records."""

    def filter(self, record: logging.LogRecord) -> bool:
        if _SECRETS:
            try:
                msg = record.getMessage()
            except Exception:  # noqa: BLE001
                return True
            clean = redact(msg)
            if clean != msg:
                record.msg, record.args = clean, None
            if record.exc_info and record.exc_info[1] is not None:
                record.exc_text = redact(logging.Formatter().formatException(record.exc_info))
                record.exc_info = None
        return True


# ---------------------------------------------------------------------- model
@dataclass
class SourceConfig:
    name: str
    type: str
    enabled: bool
    options: dict[str, Any]                   # the [[source]] table minus name/type/enabled
    every: float | None = None                # parsed, for status display (None = adapter default)
    ttl: float | None = None
    visibility: str = "wall"
    disabled_reason: str | None = None


@dataclass
class Config:
    path: Path | None
    raw: dict[str, Any]                        # interpolated, defaults merged
    server: dict[str, Any]
    location: dict[str, Any]
    mode: dict[str, Any]
    display: dict[str, Any]
    history: dict[str, Any]
    wall: dict[str, Any]
    rules: dict[str, dict[str, Any]]
    sources: list[SourceConfig]
    push_token: str | None = None
    push_token_unresolved: bool = False        # configured but ${...} missing: push is refused
    _settings: dict[str, Any] = field(default_factory=dict, repr=False)

    def settings(self) -> dict[str, Any]:
        """location / mode / display for the browser. Built from the *uninterpolated* tables with any
        value that referenced ${...} removed, so no secret can ever reach the hello message."""
        return copy.deepcopy(self._settings)

    def rule_cfg(self, name: str) -> dict[str, Any]:
        return dict(self.rules.get(name) or {})

    def source(self, name: str) -> SourceConfig | None:
        return next((s for s in self.sources if s.name == name), None)

    @property
    def tz(self) -> ZoneInfo | None:
        name = self.location.get("timezone") or os.environ.get("TZ")
        if not name:
            return None
        try:
            return ZoneInfo(name)
        except (ZoneInfoNotFoundError, ValueError):
            return None

    @property
    def history_max_age_s(self) -> float | None:
        return parse_duration(self.history.get("keep"))

    def adapter_settings(self) -> dict[str, Any]:
        """Global settings handed to adapters (AdapterContext.settings)."""
        return {"location": dict(self.location), "mode": dict(self.mode), "display": dict(self.display)}


# ---------------------------------------------------------------------- interpolation
def _load_secrets(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    try:
        with path.open("rb") as f:
            data = tomllib.load(f)
    except tomllib.TOMLDecodeError as e:
        raise ConfigError(f"{path}: {e}") from e
    out: dict[str, str] = {}
    for k, v in data.items():
        if isinstance(v, (str, int, float, bool)):
            out[k] = str(v)
        else:
            log.warning("%s: %r is not a plain value (secrets.toml is a flat table); ignored", path.name, k)
    return out


class _Interp:
    def __init__(self, secrets: dict[str, str]):
        self.secrets = secrets
        self.used: set[str] = set()

    def lookup(self, name: str) -> str | None:
        if name in self.secrets:
            return self.secrets[name]
        return os.environ.get(name)

    def apply(self, obj: Any, path: str, missing: list[tuple[str, str]]) -> Any:
        """Recursively interpolate. Unresolved strings become None; (path, var) is appended to missing."""
        if isinstance(obj, str):
            if "${" not in obj:
                return obj
            unresolved: list[str] = []

            def sub(m: re.Match) -> str:
                v = self.lookup(m.group(1))
                if v is None:
                    unresolved.append(m.group(1))
                    return m.group(0)
                if v:
                    self.used.add(v)
                return v

            out = _VAR_RE.sub(sub, obj)
            if unresolved:
                missing.extend((path, n) for n in unresolved)
                return None
            return out
        if isinstance(obj, dict):
            return {k: self.apply(v, f"{path}.{k}" if path else str(k), missing) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self.apply(v, f"{path}[{i}]", missing) for i, v in enumerate(obj)]
        return obj


def _strip_refs(obj: Any) -> Any:
    """Drop every value that references ${...} (used to build browser settings)."""
    if isinstance(obj, dict):
        return {k: _strip_refs(v) for k, v in obj.items() if not (isinstance(v, str) and "${" in v)}
    if isinstance(obj, list):
        return [_strip_refs(v) for v in obj if not (isinstance(v, str) and "${" in v)]
    return obj


# ---------------------------------------------------------------------- loading
def find_config_file(config_dir: Path) -> Path | None:
    for name in (CONFIG_FILE, EXAMPLE_FILE):
        p = config_dir / name
        if p.is_file():
            return p
    return None


def _known_types() -> set[str]:
    from .adapters.base import REGISTRY
    return set(REGISTRY) | CORE_TYPES


def load_config(config_dir: Path | str, *, known_types: Iterable[str] | None = None,
                text: str | None = None) -> Config:
    """Load <config_dir>/config.toml (else config.example.toml). `text` overrides the file (tests).
    Call after loader.load_all() so the adapter registry is populated, or pass known_types."""
    config_dir = Path(config_dir)
    path: Path | None = None
    if text is None:
        path = find_config_file(config_dir)
        if path is None:
            log.warning("no %s or %s in %s; running with defaults and no sources",
                        CONFIG_FILE, EXAMPLE_FILE, config_dir)
            text = ""
        else:
            text = path.read_text(encoding="utf-8")
            if path.name == EXAMPLE_FILE:
                log.info("no %s; using %s", CONFIG_FILE, path)
    try:
        doc = tomllib.loads(text)
    except tomllib.TOMLDecodeError as e:
        raise ConfigError(f"{path or 'config'}: {e}") from e
    secrets = _load_secrets(config_dir / SECRETS_FILE)
    return build_config(doc, secrets=secrets, path=path,
                        known_types=set(known_types) if known_types is not None else _known_types())


def build_config(doc: dict[str, Any], *, secrets: dict[str, str] | None = None, path: Path | None = None,
                 known_types: set[str] | None = None) -> Config:
    known = set(known_types) if known_types is not None else _known_types()
    known |= CORE_TYPES
    errors: list[str] = []
    interp = _Interp(secrets or {})

    def table(name: str) -> dict[str, Any]:
        v = doc.get(name, {})
        if not isinstance(v, dict):
            errors.append(f"[{name}] must be a table")
            return {}
        return v

    # global tables: defaults, then the file; interpolate (unresolved -> None with a warning)
    raw_tables: dict[str, dict[str, Any]] = {}
    tables: dict[str, dict[str, Any]] = {}
    for name, defaults in DEFAULTS.items():
        merged = {**defaults, **table(name)}
        raw_tables[name] = merged
        missing: list[tuple[str, str]] = []
        tables[name] = interp.apply(merged, name, missing)
        for p, var in missing:
            log.warning("config %s: ${%s} is not set (secrets.toml or env); value ignored", p, var)

    push_token_unresolved = raw_tables["server"].get("push_token") is not None and \
        tables["server"].get("push_token") is None
    push_token = tables["server"].get("push_token") or None
    if push_token_unresolved:
        log.warning("server.push_token references an unset secret: POST /api/publish is refused until it is set")

    _validate_globals(tables, errors)

    # rules
    rules_raw = table("rules")
    rules: dict[str, dict[str, Any]] = {}
    for rname, rcfg in rules_raw.items():
        if not isinstance(rcfg, dict):
            errors.append(f"[rules.{rname}] must be a table")
            continue
        missing = []
        rules[rname] = interp.apply(rcfg, f"rules.{rname}", missing)
        for p, var in missing:
            log.warning("config %s: ${%s} is not set; value ignored", p, var)
        if "every" in rcfg:
            _check_duration(rcfg["every"], f"[rules.{rname}] every", errors)
        if "ttl" in rcfg:
            _check_duration(rcfg["ttl"], f"[rules.{rname}] ttl", errors)
        if "inputs" in rcfg and (not isinstance(rcfg["inputs"], list)
                                 or not all(isinstance(g, str) and g for g in rcfg["inputs"])):
            errors.append(f"[rules.{rname}] inputs must be a list of signal id globs")

    # sources
    sources: list[SourceConfig] = []
    src_list = doc.get("source", [])
    if not isinstance(src_list, list):
        errors.append("`source` must be an array of tables: use [[source]]")
        src_list = []
    seen: set[str] = set()
    for i, entry in enumerate(src_list):
        where = f"[[source]] #{i + 1}"
        if not isinstance(entry, dict):
            errors.append(f"{where} must be a table")
            continue
        name, typ = entry.get("name"), entry.get("type")
        if not isinstance(name, str) or not name:
            errors.append(f"{where}: missing `name`")
            continue
        where = f"source {name!r}"
        if not _NAME_RE.match(name):
            errors.append(f"{where}: name may only contain letters, digits, '_' and '-'")
        elif name in RESERVED_SOURCE_NAMES:
            errors.append(f"{where}: name {name!r} is reserved")
        if name in seen:
            errors.append(f"{where}: duplicate name (each [[source]] needs a unique name)")
        seen.add(name)
        if not isinstance(typ, str) or not typ:
            errors.append(f"{where}: missing `type` (known types: {', '.join(sorted(known))})")
            continue
        if typ not in known:
            errors.append(f"{where}: unknown type {typ!r} (known types: {', '.join(sorted(known))})")
            continue
        enabled = entry.get("enabled", True)
        if not isinstance(enabled, bool):
            errors.append(f"{where}: `enabled` must be true or false")
            enabled = True
        every = _check_duration(entry.get("every"), f"{where} every", errors)
        ttl = _check_duration(entry.get("ttl"), f"{where} ttl", errors)
        vis = entry.get("visibility", "wall")
        if vis not in ("wall", "ask"):
            errors.append(f"{where}: visibility must be \"wall\" or \"ask\", got {vis!r}")

        missing = []
        opts = interp.apply({k: v for k, v in entry.items() if k not in ("name", "type", "enabled")},
                            f"source.{name}", missing)
        reason = None
        if missing:
            vars_ = ", ".join(sorted({v for _, v in missing}))
            reason = f"unresolved secret ${{{vars_}}}" if len(missing) == 1 else f"unresolved secrets: {vars_}"
            if enabled:
                log.warning("source %r disabled: %s not set in secrets.toml or environment",
                            name, vars_)
            enabled = False
        elif not enabled:
            reason = "enabled = false"
        sources.append(SourceConfig(name=name, type=typ, enabled=enabled, options=opts, every=every,
                                    ttl=ttl, visibility=vis if vis in ("wall", "ask") else "wall",
                                    disabled_reason=reason))

    if errors:
        where = f"{path}: " if path else ""
        raise ConfigError(f"{where}invalid config:\n  - " + "\n  - ".join(errors))

    _SECRETS.update(s for s in interp.used if len(s) >= 4)

    settings = {k: _strip_refs(copy.deepcopy(raw_tables[k])) for k in ("location", "mode", "display")}
    raw = dict(doc)
    raw.update(tables)
    raw["rules"] = rules
    return Config(path=path, raw=raw, server=tables["server"], location=tables["location"],
                  mode=tables["mode"], display=tables["display"], history=tables["history"],
                  wall=tables["wall"], rules=rules, sources=sources, push_token=push_token,
                  push_token_unresolved=push_token_unresolved, _settings=settings)


def _check_duration(v: Any, what: str, errors: list[str]) -> float | None:
    if v is None:
        return None
    try:
        return parse_duration(v)
    except (ValueError, TypeError):
        errors.append(f"{what}: bad duration {v!r} (use e.g. 30s, 5m, 1h)")
        return None


def _validate_globals(t: dict[str, dict[str, Any]], errors: list[str]) -> None:
    s = t["server"]
    if not isinstance(s.get("port"), int) or not (0 < s["port"] < 65536):
        errors.append(f"[server] port must be an integer 1-65535, got {s.get('port')!r}")
    if not isinstance(s.get("host"), str):
        errors.append("[server] host must be a string")
    if not isinstance(s.get("max_body_bytes"), int) or s["max_body_bytes"] <= 0:
        errors.append("[server] max_body_bytes must be a positive integer")
    loc = t["location"]
    for k, lo, hi in (("lat", -90, 90), ("lon", -180, 180)):
        v = loc.get(k)
        if not isinstance(v, (int, float)) or isinstance(v, bool) or not (lo <= v <= hi):
            errors.append(f"[location] {k} must be a number in {lo}..{hi}, got {v!r}")
    tz = loc.get("timezone")
    if tz:
        try:
            ZoneInfo(tz)
        except (ZoneInfoNotFoundError, ValueError):
            errors.append(f"[location] unknown timezone {tz!r} (use an IANA name like America/Toronto)")
    m = t["mode"]
    for k in ("work_start", "work_end"):
        if not isinstance(m.get(k), str) or not _HHMM_RE.match(m[k]):
            errors.append(f"[mode] {k} must be \"HH:MM\", got {m.get(k)!r}")
    wd = m.get("work_days")
    if not isinstance(wd, list) or not all(isinstance(d, int) and 0 <= d <= 6 for d in wd):
        errors.append("[mode] work_days must be a list of 0-6 (0 = Sunday, as in JS getDay)")
    _check_duration(t["history"].get("keep"), "[history] keep", errors)
    d = t["display"]
    if not isinstance(d.get("sound"), bool):
        errors.append(f"[display] sound must be true or false, got {d.get('sound')!r}")
    for k in ("volume", "sound_work"):
        v = d.get(k)
        if not isinstance(v, (int, float)) or isinstance(v, bool) or not (0 <= v <= 1):
            errors.append(f"[display] {k} must be a number in 0..1, got {v!r}")
    b = d.get("boost")
    if not isinstance(b, int) or isinstance(b, bool) or not (0 <= b <= 3):
        errors.append(f"[display] boost must be 0 (off), 1 (low), 2 (medium) or 3 (high), got {b!r}")
    if not isinstance(d.get("cat"), bool):
        errors.append(f"[display] cat must be true or false, got {d.get('cat')!r}")
    if d.get("cat_coat") not in CAT_COATS:
        errors.append(f"[display] cat_coat must be one of {', '.join(CAT_COATS)}, got {d.get('cat_coat')!r}")
    for k, v in t["wall"].items():
        if k == "now_playing_idle":                 # a duration, not a signal id
            if v is not None and (isinstance(v, bool) or not isinstance(v, (str, int, float))):
                errors.append(f"[wall] now_playing_idle must be a duration like \"2m\", got {v!r}")
            elif v is not None:
                _check_duration(v, "[wall] now_playing_idle", errors)
            continue
        if v is not None and not isinstance(v, str):
            errors.append(f"[wall] {k} must be a signal id or glob string")
