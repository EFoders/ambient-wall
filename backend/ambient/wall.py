"""Wall projection: pool -> exactly the `signals` object frontend themes consume (THEMES.md, core.js
`signals()`), minus `time` and `daylight`, which the browser computes locally.

    project(pool, now, cfg) -> {
      "calendar":  {"next": {"title", "start"}} | {"next": None},
      "heartbeat": [{"host", "up", "downSince"}],
      "finances":  {"income", "spent", "net", "balance", "lastUpdated", "mood"} | None,
      "weather":   {"tempC", "actionable", "condition", "intensity", "windKph"} | None,
      "nowPlaying": {"title", "artist", "album", "isPlaying", "progressMs", "durationMs", "updatedAt",
                     "source", "art"} | None,
      "news":      {"headline", "source", "published", "critical", "rank", "count"} | None,
      "stale":     [element names whose inputs exist but are stale],
    }

Rules of the projection (SPEC 9: a missing value is not drawn):
- Missing, stale (at `now`) or visibility="ask" inputs count as absent -> null / {"next": None} /
  host omitted. Never placeholders. Stale elements are also named in `stale`.
- Dates are ISO 8601 strings with the local offset of [location] timezone
  (calendar.next.start, heartbeat[].downSince, finances.lastUpdated); the browser revives them.
- calendar: an event is dropped once it is over (end passed; no end = start passed). An in-progress
  event stays, and U.fmtMinutes renders its negative countdown as "now".
- heartbeat: rule outputs (`[wall] heartbeat`, default rules.heartbeat.*); any host the rule has not
  covered yet is computed from the raw probes (`[wall] heartbeat_raw`, default heartbeat.host.*) with
  the same grace period ([rules.heartbeat_down] after). Order: [rules.heartbeat_down] hosts, then the
  hosts of the [[source]] named like the raw glob's source, then by name.
- finances: mood from `[wall] finance_mood`, falling back to the sign of net.
- weather: non-null when any raw weather input is fresh. condition / intensity: rules._common.merge_now
  of the model (weather_condition / weather_intensity) and the optional station observation
  (weather_obs_condition / weather_obs_intensity): precipitation either reports wins. condition is one of the six scene
  conditions ("clear" if unknown), intensity clamped to 0..1 (default 0 clear / 0.5 otherwise),
  windKph defaults to 0, tempC may be null. actionable = fresh calendar advice (leave_early) if any,
  else the weather_actionable rule output, else computed directly with the same rule logic (unless
  that rule is disabled), else null.
- news: one headline from `[wall] news` (default rules.news.top, the news rule's ranked list).
  The highest-ranked critical item is pinned; otherwise it rotates through the first
  [rules.news] rotate_top (3) items every rotate_s (60) seconds, as a pure function of `now`.
  published is local ISO (null if the feed had no date); rank = the item's rank in the list,
  count = the list's length. null when the list is missing, stale or empty.
- nowPlaying: the `now` object from `[wall] now_playing` (default music.now; spotify / lastfm / push /
  demo). null when the value is null, has no title, or is stale; also null once playback has been
  paused for longer than `[wall] now_playing_idle` (default "2m"), counted from the value's
  `paused_since` (adapters set it), else its `anchor_at`, else the signal's ts. Progress is an anchor:
  progressMs = the value's progress_ms, the position at updatedAt = the value's `anchor_at` (else, for
  plain pushes, the signal's ts), local ISO with milliseconds. Adapters keep both fixed during steady
  playback, so the projection does not change between polls; the browser extrapolates
  progressMs + (now - updatedAt) while isPlaying. progressMs is clamped to durationMs. source = the value's `source`, else the signal's meta `provider`, else the source name.
  art = the local `/api/art/<id>` path once the art cache holds the value's art_url (the `art`
  callable passed to project()), else null: the browser never contacts the music service.

Pure and deterministic: no clock, no I/O; same pool + now + cfg -> same dict.
"""
from __future__ import annotations

from datetime import datetime, tzinfo
from typing import Any, Callable

from .pool_view import PoolView
from .util import parse_duration
from .rules import heartbeat_down as hb
from .rules import news as nw
from .rules import weather_actionable as wxa
from .rules._common import iso_local, merge_now, normalize_condition, num, parse_dt, resolve_tz
from .signal import Signal

ELEMENTS = ("calendar", "heartbeat", "finances", "weather", "nowPlaying", "news")

DEFAULT_BINDINGS: dict[str, str] = {
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
    "weather_obs_condition": "",    # station observations (e.g. "ec.now.condition"); "" = none
    "weather_obs_intensity": "",
    "news": "rules.news.top",
    "now_playing": "music.now",
}
NOW_PLAYING_IDLE_S = 120.0          # [wall] now_playing_idle default ("2m")
MOODS = ("calm", "drift", "warning")
_WEATHER_RAW = ("weather_temp", "weather_condition", "weather_intensity", "weather_wind",
                "weather_obs_condition", "weather_obs_intensity")


def _raw_cfg(cfg: Any) -> dict[str, Any]:
    if cfg is None:
        return {}
    raw = getattr(cfg, "raw", cfg)          # accept ambient.config.Config too
    return raw if isinstance(raw, dict) else {}


def bindings(cfg: Any) -> dict[str, str]:
    b = dict(DEFAULT_BINDINGS)
    for k, v in (_raw_cfg(cfg).get("wall") or {}).items():
        if isinstance(v, str) or v is None:
            b[k] = v or ""
    return b


def describe(cfg: Any = None) -> dict[str, list[str]]:
    """Element -> the input ids/globs it is built from (for /api introspection and docs)."""
    b = bindings(cfg)
    want = {
        "calendar": ["calendar", "calendar_advice"],
        "heartbeat": ["heartbeat", "heartbeat_raw"],
        "finances": ["finances", "finance_mood"],
        "weather": ["weather_temp", "weather_condition", "weather_intensity", "weather_wind",
                    "weather_obs_condition", "weather_obs_intensity", "weather_actionable", "calendar_advice"],
        "nowPlaying": ["now_playing"],
        "news": ["news"],
    }
    return {el: [b[k] for k in keys if b.get(k)] for el, keys in want.items()}


class _Reader:
    """Reads inputs at `now`, hiding stale and ask-only signals and remembering which were stale."""

    def __init__(self, pool: PoolView, now: datetime):
        self.pool, self.now = pool, now
        self.stale_ids: set[str] = set()

    def get(self, signal_id: str | None) -> Signal | None:
        if not signal_id:
            return None
        sig = self.pool.get(signal_id, include_stale=True)
        if sig is None or sig.visibility == "ask":
            return None
        if sig.is_stale(self.now):
            self.stale_ids.add(signal_id)
            return None
        return sig

    def value(self, signal_id: str | None) -> Any:
        sig = self.get(signal_id)
        return None if sig is None else sig.value

    def query(self, glob: str | None, *, include_stale: bool = False) -> list[Signal]:
        if not glob:
            return []
        out = []
        for s in self.pool.query(glob, include_stale=True):
            if s.visibility == "ask":
                continue
            if s.is_stale(self.now):
                self.stale_ids.add(s.id)
                if not include_stale:
                    continue
            out.append(s)
        return out

    def was_stale(self, *ids: str | None) -> bool:
        return any(i in self.stale_ids for i in ids if i)


# ---------------------------------------------------------------------------------------- elements

def _calendar(r: _Reader, b: dict[str, str], tz: tzinfo) -> tuple[dict[str, Any], bool]:
    v = r.value(b["calendar"])
    stale = r.was_stale(b["calendar"])
    if not isinstance(v, dict):
        return {"next": None}, stale
    start = parse_dt(v.get("start"), tz)
    if start is None:
        return {"next": None}, stale
    end = parse_dt(v.get("end"), tz)
    if (end if end is not None and end > start else start) <= r.now:
        return {"next": None}, stale        # over (in-progress events stay; themes show "now")
    title = v.get("title")
    title = str(title).strip() if title is not None and str(title).strip() else "Busy"
    return {"next": {"title": title, "start": iso_local(start, tz)}}, stale


def _host_order(raw: dict[str, Any], b: dict[str, str]) -> list[str]:
    order: list[str] = [str(h) for h in ((raw.get("rules") or {}).get(hb.NAME) or {}).get("hosts") or []]
    src_name = (b.get("heartbeat_raw") or "").split(".", 1)[0]
    for src in raw.get("source") or []:
        if isinstance(src, dict) and src.get("name") == src_name:
            hosts = src.get("hosts")
            if isinstance(hosts, dict):
                order += [str(h) for h in hosts]
            elif isinstance(hosts, list):
                order += [str(h.get("name") if isinstance(h, dict) else h) for h in hosts]
    return order


def _heartbeat(r: _Reader, b: dict[str, str], raw: dict[str, Any], tz: tzinfo) -> tuple[list, bool]:
    hosts: dict[str, dict[str, Any]] = {}
    for s in r.query(b["heartbeat"]):
        v = s.value
        if isinstance(v, dict) and v.get("host"):
            host = str(v["host"])
            up = bool(v.get("up"))
            since = None if up else parse_dt(v.get("downSince"), tz)
            hosts[host] = {"host": host, "up": up, "downSince": iso_local(since, tz)}

    raw_glob = b.get("heartbeat_raw")
    raw_sigs = r.query(raw_glob, include_stale=True)
    if raw_sigs:
        after_s = hb.after_seconds((raw.get("rules") or {}).get(hb.NAME) or {})
        prefix = hb.input_prefix(raw_glob)
        for s in raw_sigs:
            host = s.id[len(prefix):] if s.id.startswith(prefix) else s.id.rsplit(".", 1)[-1]
            if not host or host in hosts or not isinstance(s.value, dict):
                continue
            up, since = hb.host_status(s, r.now, after_s)
            hosts[host] = {"host": host, "up": up, "downSince": None if up else iso_local(since, tz)}

    order = hb.ordered_hosts(list(hosts), _host_order(raw, b))
    stale = any(s.is_stale(r.now) for s in raw_sigs)
    return [hosts[h] for h in order if h in hosts], stale


def _finances(r: _Reader, b: dict[str, str], tz: tzinfo) -> tuple[dict[str, Any] | None, bool]:
    v = r.value(b["finances"])
    stale = r.was_stale(b["finances"])
    if not isinstance(v, dict):
        return None, stale
    income, spent, net, balance = (num(v.get(k)) for k in ("income", "spent", "net", "balance"))
    if net is None and income is not None and spent is not None:
        net = num(round(income - spent, 2))
    if income is None and spent is None and net is None and balance is None:
        return None, stale
    mood = r.value(b.get("finance_mood"))
    if mood not in MOODS:
        mood = "warning" if net is not None and net < 0 else "calm"
    updated = parse_dt(v.get("last_updated") or v.get("lastUpdated"), tz)
    return {"income": income, "spent": spent, "net": net, "balance": balance,
            "lastUpdated": iso_local(updated, tz), "mood": mood}, stale


def _weather(r: _Reader, b: dict[str, str], raw: dict[str, Any]) -> tuple[dict[str, Any] | None, bool]:
    sigs = {k: r.get(b.get(k)) for k in _WEATHER_RAW}
    stale = r.was_stale(*(b.get(k) for k in _WEATHER_RAW))
    if all(s is None for s in sigs.values()):
        return None, stale
    val = {k: (s.value if s is not None else None) for k, s in sigs.items()}

    cond, intensity = merge_now(normalize_condition(val["weather_condition"]), val["weather_intensity"],
                                normalize_condition(val["weather_obs_condition"]), val["weather_obs_intensity"])
    cond = cond or "clear"
    intensity = num(intensity)
    intensity = (0.0 if cond == "clear" else 0.5) if intensity is None else min(1.0, max(0.0, float(intensity)))
    wind = num(val["weather_wind"])

    actionable = None
    advice = r.value(b.get("calendar_advice"))
    if isinstance(advice, str) and advice.strip():
        actionable = advice.strip()
    else:
        act_id = b.get("weather_actionable")
        act_sig = r.get(act_id)
        rule_cfg = (raw.get("rules") or {}).get(wxa.NAME) or {}
        if act_sig is not None:
            actionable = act_sig.value if isinstance(act_sig.value, str) and act_sig.value.strip() else None
        elif act_id and rule_cfg.get("enabled", True) is not False:
            actionable = wxa.actionable(r.pool, r.now, rule_cfg)   # rule has not produced yet
    return {"tempC": num(val["weather_temp"]), "actionable": actionable, "condition": cond,
            "intensity": intensity, "windKph": wind if wind is not None and wind >= 0 else 0}, stale


def _news(r: _Reader, b: dict[str, str], raw: dict[str, Any], tz: tzinfo) -> tuple[dict[str, Any] | None, bool]:
    v = r.value(b.get("news"))
    stale = r.was_stale(b.get("news"))
    if not isinstance(v, list):
        return None, stale
    picked = nw.pick(v, r.now, (raw.get("rules") or {}).get(nw.NAME) or {})
    if picked is None:
        return None, stale
    item, idx = picked
    headline = " ".join(str(item.get("title") or item.get("headline")).split())
    source = item.get("source")
    rank = item.get("rank")
    rank = rank if isinstance(rank, int) and not isinstance(rank, bool) and rank > 0 else idx + 1
    count = sum(1 for i in v if isinstance(i, dict))
    return {"headline": headline,
            "source": source.strip() if isinstance(source, str) and source.strip() else None,
            "published": iso_local(parse_dt(item.get("published"), tz), tz),
            "critical": item.get("critical") is True, "rank": rank, "count": count}, stale


def _idle_s(raw: dict[str, Any]) -> float:
    v = (raw.get("wall") or {}).get("now_playing_idle")
    try:
        d = parse_duration(v) if v is not None and not isinstance(v, bool) else None
    except (ValueError, TypeError):
        d = None
    return d if d is not None and d >= 0 else NOW_PLAYING_IDLE_S


def _text(v: Any) -> str | None:
    if isinstance(v, list):                         # ["Artist A", "Artist B"]
        v = ", ".join(str(x).strip() for x in v if isinstance(x, (str, int, float)) and str(x).strip())
    if not isinstance(v, (str, int, float)) or isinstance(v, bool):
        return None
    t = " ".join(str(v).split())
    return t or None


def _playing(v: Any) -> bool:
    if v is None:
        return True                                 # a pushed track without the flag is playing
    if isinstance(v, str):
        return v.strip().lower() in ("true", "1", "yes", "playing")
    return bool(v)


def _ms(v: Any) -> int | None:
    n = num(v)
    return int(n) if n is not None and n >= 0 else None


def _now_playing(r: _Reader, b: dict[str, str], raw: dict[str, Any], tz: tzinfo,
                 art: Callable[[str], str | None] | None) -> tuple[dict[str, Any] | None, bool]:
    sid = b.get("now_playing")
    sig = r.get(sid)
    stale = r.was_stale(sid)
    if sig is None or not isinstance(sig.value, dict):
        return None, stale
    v = sig.value
    title = _text(v.get("title"))
    if title is None:
        return None, stale
    playing = _playing(v.get("is_playing", v.get("isPlaying")))
    anchor = parse_dt(v.get("anchor_at"), tz)
    if anchor is None or anchor > sig.ts:           # no anchor, or one from a skewed clock: observation time
        anchor = sig.ts
    if not playing:
        since = parse_dt(v.get("paused_since"), tz) or anchor
        if (r.now - min(since, r.now)).total_seconds() > _idle_s(raw):
            return None, stale                       # paused too long: the element disappears
    progress = _ms(v.get("progress_ms", v.get("progressMs")))
    duration = _ms(v.get("duration_ms", v.get("durationMs")))
    if duration == 0:
        duration = None
    if progress is not None and duration is not None:
        progress = min(progress, duration)
    art_path = None
    art_url = v.get("art_url")
    if art is not None and isinstance(art_url, str) and art_url:
        try:
            art_path = art(art_url)
        except Exception:  # noqa: BLE001 - art is decoration; never break the projection
            art_path = None
    source = _text(v.get("source")) or _text((sig.meta or {}).get("provider")) or sig.source
    return {"title": title, "artist": _text(v.get("artist")), "album": _text(v.get("album")),
            "isPlaying": playing, "progressMs": progress, "durationMs": duration,
            "updatedAt": anchor.astimezone(tz).isoformat(timespec="milliseconds"),
            "source": source, "art": art_path}, stale


# ---------------------------------------------------------------------------------------- project

def project(pool: PoolView, now: datetime, cfg: Any = None, *,
            art: Callable[[str], str | None] | None = None) -> dict[str, Any]:
    """`art(url) -> "/api/art/<id>" | None` looks up the album-art cache (the server passes it);
    without it nowPlaying.art is always null."""
    raw = _raw_cfg(cfg)
    b = bindings(cfg)
    tz = resolve_tz((raw.get("location") or {}).get("timezone"), now)
    r = _Reader(pool, now)

    calendar, cal_stale = _calendar(r, b, tz)
    heartbeat, hb_stale = _heartbeat(r, b, raw, tz)
    finances, fin_stale = _finances(r, b, tz)
    weather, wx_stale = _weather(r, b, raw)
    now_playing, np_stale = _now_playing(r, b, raw, tz, art)
    news, news_stale = _news(r, b, raw, tz)
    stale_flags = {"calendar": cal_stale, "heartbeat": hb_stale, "finances": fin_stale, "weather": wx_stale,
                   "nowPlaying": np_stale, "news": news_stale}
    return {
        "calendar": calendar,
        "heartbeat": heartbeat,
        "finances": finances,
        "weather": weather,
        "nowPlaying": now_playing,
        "news": news,
        "stale": [el for el in ELEMENTS if stale_flags[el]],
    }
