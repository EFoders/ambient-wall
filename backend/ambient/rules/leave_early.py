"""leave_early: next calendar event with a location starts soon and the weather will be wet around then
(SPEC 2.4: "Calendar event in < 60 min AND precipitation expected around then -> leave early").

Fires when all hold:
    calendar.next has a non-empty, physical `location` (not a meeting link / "Teams" / "Zoom", see
    `virtual`) and a start time with 0 < start - now < lead
    and either it is precipitating now (condition rain/storm/snow)   -> "Leave early: rain now"
    or precipitation starts no later than start + around             -> "Leave early: rain at 16:20"
       (onset = weather signal ts + precip.next_minutes, local 24 h time)
Kind word: precip.kind (rain, snow, storm, ...) or, when precipitating now, the condition.

Config [rules.leave_early] (all optional):

    enabled  = true
    calendar = "calendar.next"
    lead     = "60m"
    around   = "30m"
    virtual  = ["http://", "https://", "teams", "zoom", "meet.google", "webex", "online", "virtual"]
                                 # case-insensitive substrings marking a location you don't travel to
    source   = "weather"         # + optional [rules.leave_early.ids] like weather_actionable
    timezone = "America/Toronto" # for the HH:MM; default = tz of `now` (scheduler passes local time)

Output: key "calendar.advice", value string | null.

Projection (wall.py): a fresh advice REPLACES weather.actionable on the wall. The frontend has no
calendar-advice slot, every theme already shows the weather sliver, and the advice carries the rain
time itself, so "Rain in 20 min" becomes "Leave early: rain at 16:20". Themes that look for
/rain|storm/ in the sliver to wet their scene still match. Set [wall] calendar_advice = "" to keep
the plain weather sliver.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from ..pool_view import PoolView
from ..util import parse_duration
from ._common import (PRECIP_CONDITIONS, fresh_value, normalize_condition, now_condition, num, parse_dt,
                      resolve_tz, weather_ids)
from .base import rule
from .weather_actionable import precip_onset

NAME = "leave_early"
DEFAULT_VIRTUAL = ["http://", "https://", "teams", "zoom", "meet.google", "webex", "online", "virtual"]
DEFAULT_CALENDAR = "calendar.next"

_KIND_WORDS = {
    "rain": "rain", "drizzle": "rain", "showers": "rain", "shower": "rain",
    "freezing_rain": "freezing rain", "freezing_drizzle": "freezing rain",
    "snow": "snow", "flurries": "snow", "snow_showers": "snow", "sleet": "sleet",
    "ice_pellets": "sleet", "hail": "hail", "mixed": "rain and snow",
    "storm": "storm", "thunderstorm": "storm", "thunder": "storm",
}


def kind_word(kind: Any, fallback: str = "rain") -> str:
    if isinstance(kind, str) and kind.strip():
        k = kind.strip().lower().replace(" ", "_").replace("-", "_")
        return _KIND_WORDS.get(k, k.replace("_", " "))
    return fallback


def advice(pool: PoolView, now: datetime, cfg: dict[str, Any]) -> str | None:
    tz = resolve_tz(cfg.get("timezone"), now)
    ev = fresh_value(pool, cfg.get("calendar") or DEFAULT_CALENDAR, now)
    if not isinstance(ev, dict):
        return None
    loc = ev.get("location")
    if not isinstance(loc, str) or not loc.strip():
        return None
    virtual = cfg.get("virtual", DEFAULT_VIRTUAL) or []
    if any(str(v).lower() in loc.lower() for v in virtual):
        return None
    raw_start = ev.get("start")
    if isinstance(raw_start, str) and "T" not in raw_start:
        return None                                   # all-day event: nowhere to be at a time
    start = parse_dt(raw_start, tz)
    if start is None:
        return None
    lead_s = parse_duration(cfg.get("lead", "60m")) or 0
    until = (start - now).total_seconds()
    if not 0 < until < lead_s:
        return None

    ids = weather_ids(cfg)
    temp = num(fresh_value(pool, ids["temp"], now))
    kind = fresh_value(pool, ids["precip_kind"], now)
    cond = now_condition(pool, ids, now)[0]
    if cond in PRECIP_CONDITIONS:
        return f"Leave early: {kind_word(kind, cond)} now"
    onset = precip_onset(pool, ids, now)
    if onset is None:
        return None
    around_s = parse_duration(cfg.get("around", "30m")) or 0
    if onset > start + timedelta(seconds=around_s):
        return None
    word = kind_word(kind, "snow" if temp is not None and temp <= 0 else "rain")
    if onset <= now:
        return f"Leave early: {word} soon"           # due already; the next fetch will say "now"
    shown = (onset + timedelta(seconds=30)).astimezone(tz)   # nearest minute
    return f"Leave early: {word} at {shown:%H:%M}"


@rule(NAME, inputs=["calendar.*", "weather.*"], every=60)
def leave_early(pool: PoolView, now: datetime, cfg: dict[str, Any]):
    if cfg.get("enabled", True) is False:
        return []
    return [{"key": "calendar.advice", "value": advice(pool, now, cfg), "type": "string"}]
