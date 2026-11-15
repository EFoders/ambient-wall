"""Helpers shared by the built-in rules and the wall projection (no rule is registered here)."""
from __future__ import annotations

import math
import re
from datetime import date, datetime, timezone, tzinfo
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

CONDITIONS = ("clear", "cloudy", "fog", "rain", "storm", "snow")
PRECIP_CONDITIONS = ("rain", "storm", "snow")

# Words adapters (or people pushing data) might use, mapped onto the six wall conditions.
_CONDITION_ALIASES = {
    "sunny": "clear", "fair": "clear", "clear_sky": "clear", "mainly_clear": "clear",
    "cloud": "cloudy", "clouds": "cloudy", "overcast": "cloudy", "partly_cloudy": "cloudy",
    "mostly_cloudy": "cloudy", "partly": "cloudy",
    "mist": "fog", "haze": "fog", "smoke": "fog", "foggy": "fog",
    "drizzle": "rain", "showers": "rain", "shower": "rain", "rainy": "rain", "freezing_rain": "rain",
    "freezing_drizzle": "rain",
    "thunderstorm": "storm", "thunder": "storm", "tstorm": "storm", "lightning": "storm",
    "snowy": "snow", "flurries": "snow", "snow_showers": "snow", "sleet": "snow", "ice_pellets": "snow",
    "hail": "snow", "blizzard": "snow",
}

# Default weather input ids, relative to the weather source name.
WEATHER_KEYS = {
    "temp": "now.temp_c",
    "feels_like": "now.feels_like_c",
    "condition": "now.condition",
    "intensity": "now.intensity",
    "wind": "now.wind_kph",
    "precip_minutes": "precip.next_minutes",
    "precip_kind": "precip.kind",
}


def weather_ids(cfg: dict[str, Any]) -> dict[str, str]:
    """Input ids for weather: "<source>.<key>" from `source` (default "weather"), overridden per id by an
    `ids` table, e.g. [rules.weather_actionable.ids] temp = "envcan.temp". `observed` names a source of
    station observations (e.g. "ec") whose now.condition / now.intensity become obs_condition /
    obs_intensity (see merge_now)."""
    src = cfg.get("source") or "weather"
    ids = {k: f"{src}.{v}" for k, v in WEATHER_KEYS.items()}
    obs = cfg.get("observed")
    if isinstance(obs, str) and obs.strip():
        ids["obs_condition"] = f"{obs.strip()}.now.condition"
        ids["obs_intensity"] = f"{obs.strip()}.now.intensity"
    ids.update({k: v for k, v in (cfg.get("ids") or {}).items() if isinstance(v, str)})
    return ids


def merge_now(model_cond: str | None, model_int: Any, obs_cond: str | None, obs_int: Any) -> tuple[str | None, Any]:
    """The weather happening now, from a forecast model (Open-Meteo: fresh every few minutes, real cloud
    cover, but its "now" is a model run and can miss rain that is falling) and a station observation
    (Environment Canada: what the station reports, but hourly). Conditions already normalized.

    Precipitation reported by either wins, the observation first (it is falling there, and it knows
    rain from snow); fog only the observation knows; otherwise the model (fresher, real cloud cover).
    Returns (condition, intensity) of the chosen side."""
    if obs_cond in PRECIP_CONDITIONS:
        return obs_cond, obs_int
    if model_cond in PRECIP_CONDITIONS:
        return model_cond, model_int
    if obs_cond is not None and (obs_cond == "fog" or model_cond is None):
        return obs_cond, obs_int
    return model_cond, model_int


def now_condition(pool: Any, ids: dict[str, str], now: Any) -> tuple[str | None, Any]:
    """merge_now over the fresh pool values named by weather_ids (observation ids optional)."""
    return merge_now(normalize_condition(fresh_value(pool, ids["condition"], now)),
                     fresh_value(pool, ids["intensity"], now),
                     normalize_condition(fresh_value(pool, ids["obs_condition"], now)) if ids.get("obs_condition") else None,
                     fresh_value(pool, ids["obs_intensity"], now) if ids.get("obs_intensity") else None)


def num(v: Any) -> int | float | None:
    """A number from a number or a sheet-ish string ("$6,420.00", "(12.50)"); None if not a number.
    Integral values come back as int so the projection's JSON stays clean (6420, not 6420.0)."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        x = float(v)
    elif isinstance(v, str):
        s = v.strip().replace(",", "").replace("$", "").replace(" ", "")
        neg = s.startswith("(") and s.endswith(")")
        s = s.strip("()")
        try:
            x = float(s)
        except ValueError:
            return None
        if neg:
            x = -x
    else:
        return None
    if not math.isfinite(x):
        return None
    return int(x) if x.is_integer() else x


def round_half_away(x: float) -> int:
    return int(math.floor(abs(x) + 0.5)) * (1 if x >= 0 else -1)


def resolve_tz(name: str | None, now: datetime | None = None) -> tzinfo:
    """ZoneInfo(name) if valid; else the tz of `now` (the scheduler passes local time); else system local."""
    if name:
        try:
            return ZoneInfo(name)
        except (ZoneInfoNotFoundError, ValueError):
            pass
    if now is not None and now.tzinfo is not None:
        return now.tzinfo
    return datetime.now().astimezone().tzinfo or timezone.utc


def parse_dt(v: Any, tz: tzinfo | None = None) -> datetime | None:
    """datetime or ISO 8601 string ("...Z" ok, date-only = local midnight) -> aware datetime.
    Naive values are taken to be in `tz` (UTC if not given). Anything else -> None."""
    if v is None:
        return None
    if isinstance(v, datetime):
        dt = v
    elif isinstance(v, date):
        dt = datetime(v.year, v.month, v.day)
    elif isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        if s.endswith(("Z", "z")):
            s = s[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            return None
    else:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz or timezone.utc)
    return dt


def iso_local(dt: datetime | None, tz: tzinfo) -> str | None:
    """ISO 8601 with the local offset, to the second: 2026-10-09T16:27:00-04:00."""
    if dt is None:
        return None
    return dt.astimezone(tz).isoformat(timespec="seconds")


def iso_utc(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def normalize_condition(v: Any) -> str | None:
    if not isinstance(v, str):
        return None
    s = re.sub(r"[\s\-]+", "_", v.strip().lower())
    if s in CONDITIONS:
        return s
    return _CONDITION_ALIASES.get(s)


def fresh_value(pool, signal_id: str | None, now: datetime, *, wall_only: bool = False) -> Any:
    """Value of a fresh signal, or None (missing, stale at `now`, or ask-only when wall_only)."""
    sig = fresh_signal(pool, signal_id, now, wall_only=wall_only)
    return None if sig is None else sig.value


def fresh_signal(pool, signal_id: str | None, now: datetime, *, wall_only: bool = False):
    if not signal_id:
        return None
    sig = pool.get(signal_id, include_stale=True)
    if sig is None or sig.is_stale(now):
        return None
    if wall_only and sig.visibility == "ask":
        return None
    return sig
