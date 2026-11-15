"""weather_actionable: the weather element's work-face sliver, or null when nothing is actionable
(SPEC 5.1: "rain in 20 min", "-20 C, dress for it"; hidden when nothing actionable).

First match wins:

    precipitating now (condition rain/storm/snow)
        rain   -> "Raining now"   ("Drizzle now" when intensity < drizzle_below)
        snow   -> "Snow now"
        storm  -> "Thunderstorm now"
    precipitation within precip_window
        "Rain in 20 min", "Snow in 1 h", "Thunderstorm in 45 min", "Rain soon" (< 1 min)
        (minutes counted down from the weather signal's own timestamp, so it stays right
        between fetches; kind from precip.kind, else snow at <= 0 °C, else rain)
    feels-like <= cold_c   -> "-24 °C, dress for it"
    feels-like >= hot_c    -> "32 °C, heat"
    otherwise              -> null

Strings match frontend/js/core.js WEATHER presets. Feels-like falls back to the air temperature.

Config [rules.weather_actionable] (all optional):

    enabled       = true
    source        = "weather"      # input ids are "<source>.now.temp_c" etc.
    observed      = "ec"           # optional: station observations; rain they report counts as now
                                   #   (a forecast model's "now" can miss rain that is falling)
    precip_window = "60m"
    drizzle_below = 0.3            # rain intensity below this = drizzle
    cold_c        = -15
    hot_c         = 30
    [rules.weather_actionable.ids] # per-input overrides: temp, feels_like, condition, intensity,
    temp = "weather.now.temp_c"    #   wind, precip_minutes, precip_kind

Output: key "weather.actionable", value string | null.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from ..pool_view import PoolView
from ..util import parse_duration
from ._common import (PRECIP_CONDITIONS, fresh_signal, fresh_value, now_condition, num,
                      round_half_away, weather_ids)
from .base import rule

NAME = "weather_actionable"

_KIND_LABELS = {
    "rain": "Rain", "drizzle": "Drizzle", "showers": "Showers", "shower": "Showers",
    "freezing_rain": "Freezing rain", "freezing_drizzle": "Freezing drizzle",
    "snow": "Snow", "flurries": "Flurries", "snow_showers": "Snow", "sleet": "Sleet",
    "ice_pellets": "Ice pellets", "hail": "Hail", "mixed": "Rain and snow",
    "storm": "Thunderstorm", "thunderstorm": "Thunderstorm", "thunder": "Thunderstorm",
}


def kind_label(kind: Any, temp_c: float | None) -> str:
    if isinstance(kind, str) and kind.strip():
        k = kind.strip().lower().replace(" ", "_").replace("-", "_")
        return _KIND_LABELS.get(k, k.replace("_", " ").capitalize())
    return "Snow" if temp_c is not None and temp_c <= 0 else "Rain"


def fmt_lead(minutes: float) -> str:
    m = round_half_away(minutes)
    if m < 60:
        return f"{m} min"
    h = m / 60
    return f"{int(h)} h" if h.is_integer() else f"{h:.1f} h"


def fmt_temp(t: float) -> str:
    v = round_half_away(t)
    return f"{v} °C"


def precip_onset(pool: PoolView, ids: dict[str, str], now: datetime) -> datetime | None:
    """When precipitation starts: the weather signal's own ts + precip.next_minutes (stable between fetches)."""
    sig = fresh_signal(pool, ids["precip_minutes"], now)
    if sig is None:
        return None
    mins = num(sig.value)
    if mins is None:
        return None
    return min(sig.ts, now) + timedelta(minutes=mins)


def minutes_until_precip(pool: PoolView, ids: dict[str, str], now: datetime) -> float | None:
    """precip.next_minutes counted down from when it was observed."""
    onset = precip_onset(pool, ids, now)
    return None if onset is None else (onset - now).total_seconds() / 60


def actionable(pool: PoolView, now: datetime, cfg: dict[str, Any]) -> str | None:
    """The sliver for the current pool. Pure; the wall projection uses it as a fallback."""
    ids = weather_ids(cfg)
    cond, intensity = now_condition(pool, ids, now)
    intensity = num(intensity)
    temp = num(fresh_value(pool, ids["temp"], now))
    feels = num(fresh_value(pool, ids["feels_like"], now))
    if feels is None:
        feels = temp

    if cond in PRECIP_CONDITIONS:
        if cond == "snow":
            return "Snow now"
        if cond == "storm":
            return "Thunderstorm now"
        if intensity is not None and intensity < float(cfg.get("drizzle_below", 0.3)):
            return "Drizzle now"
        return "Raining now"

    window_min = (parse_duration(cfg.get("precip_window", "60m")) or 0) / 60
    mins = minutes_until_precip(pool, ids, now)
    if mins is not None and mins <= window_min:
        label = kind_label(fresh_value(pool, ids["precip_kind"], now), temp)
        return f"{label} soon" if mins < 0.5 else f"{label} in {fmt_lead(mins)}"

    if feels is not None:
        if feels <= float(cfg.get("cold_c", -15)):
            return f"{fmt_temp(feels)}, dress for it"
        if feels >= float(cfg.get("hot_c", 30)):
            return f"{fmt_temp(feels)}, heat"
    return None


@rule(NAME, inputs=["weather.*"], every=60)
def weather_actionable(pool: PoolView, now: datetime, cfg: dict[str, Any]):
    if cfg.get("enabled", True) is False:
        return []
    return [{"key": "weather.actionable", "value": actionable(pool, now, cfg), "type": "string"}]
