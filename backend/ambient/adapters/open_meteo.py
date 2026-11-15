"""open_meteo: Open-Meteo forecast API (free, no key). Location from [location] lat/lon.

    [[source]]
    name = "weather"
    type = "open_meteo"
    every = "10m"
    # precip_horizon = "2h"     # how far ahead precip.next_minutes looks
    # lat = 45.9  lon = -77.28  # override [location]

Only the coordinates leave the network, rounded to 2 decimals (~1 km). Times are requested as unix
timestamps so no timezone parsing is involved.

Keys: now.temp_c, now.feels_like_c, now.condition, now.intensity, now.wind_kph, now.summary,
precip.next_minutes, precip.kind, forecast.daily (ask). See SOURCES.md for the condition/intensity scale.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from ..signal import utcnow
from ._shared import (PRECIP_CONDITIONS, OptionError, SourceError, clamp01, http_get_json, opt,
                      opt_duration, rain_or_snow, rate_intensity)
from .base import Adapter, register

URL = "https://api.open-meteo.com/v1/forecast"

# WMO weather code -> (condition, default intensity, description). Mixed/freezing codes use None and
# are resolved by temperature (rain_or_snow).
WMO: dict[int, tuple[str | None, float, str]] = {
    0: ("clear", 0.0, "Clear"), 1: ("clear", 0.2, "Mainly clear"),
    2: ("cloudy", 0.5, "Partly cloudy"), 3: ("cloudy", 0.9, "Overcast"),
    45: ("fog", 0.6, "Fog"), 48: ("fog", 0.8, "Freezing fog"),
    51: ("rain", 0.15, "Light drizzle"), 53: ("rain", 0.2, "Drizzle"), 55: ("rain", 0.3, "Heavy drizzle"),
    56: (None, 0.2, "Freezing drizzle"), 57: (None, 0.3, "Heavy freezing drizzle"),
    61: ("rain", 0.35, "Light rain"), 63: ("rain", 0.6, "Rain"), 65: ("rain", 0.9, "Heavy rain"),
    66: (None, 0.4, "Freezing rain"), 67: (None, 0.8, "Heavy freezing rain"),
    71: ("snow", 0.3, "Light snow"), 73: ("snow", 0.6, "Snow"), 75: ("snow", 0.9, "Heavy snow"),
    77: ("snow", 0.25, "Snow grains"),
    80: ("rain", 0.4, "Rain showers"), 81: ("rain", 0.65, "Heavy showers"), 82: ("rain", 0.95, "Violent showers"),
    85: ("snow", 0.5, "Snow showers"), 86: ("snow", 0.85, "Heavy snow showers"),
    95: ("storm", 0.85, "Thunderstorm"), 96: ("storm", 0.95, "Thunderstorm with hail"),
    99: ("storm", 1.0, "Thunderstorm with heavy hail"),
}


def wmo_condition(code: int | None, temp_c: float | None) -> tuple[str, float, str]:
    """WMO code -> (condition, default intensity, description). Unknown codes -> cloudy."""
    if code is None:
        return "cloudy", 0.5, "Unknown"
    cond, inten, desc = WMO.get(int(code), ("cloudy", 0.5, f"Weather code {code}"))
    return (cond or rain_or_snow(temp_c)), inten, desc


def _col(block: dict[str, Any] | None, name: str) -> list[Any]:
    return list((block or {}).get(name) or [])


@register("open_meteo")
class OpenMeteo(Adapter):
    default_every = 600.0

    def __init__(self, name: str, options: dict[str, Any], ctx):
        super().__init__(name, options, ctx)
        loc = (ctx.settings or {}).get("location") or {}
        lat = opt(options, "lat", float, loc.get("lat"), source=name)
        lon = opt(options, "lon", float, loc.get("lon"), source=name)
        if lat is None or lon is None:
            raise OptionError(f"source {name!r}: needs [location] lat/lon (or lat/lon options)")
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise OptionError(f"source {name!r}: lat/lon out of range")
        self.lat, self.lon = round(float(lat), 2), round(float(lon), 2)
        self.horizon_min = opt_duration(options, "precip_horizon", 7200.0, source=name) / 60
        self.threshold_mm_h = float(opt(options, "precip_threshold_mm_h", float, 0.2, source=name))
        self.days = int(opt(options, "forecast_days", int, 7, source=name))
        self.timeout = opt_duration(options, "timeout", 15.0, source=name)

    def now(self) -> datetime:
        return utcnow()

    def params(self) -> dict[str, Any]:
        return {
            "latitude": self.lat, "longitude": self.lon,
            "current": "temperature_2m,apparent_temperature,weather_code,cloud_cover,wind_speed_10m,precipitation",
            "minutely_15": "precipitation,snowfall,weather_code",
            "hourly": "precipitation,weather_code,temperature_2m",
            "daily": ("weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,"
                      "precipitation_probability_max,wind_speed_10m_max"),
            "forecast_days": self.days, "forecast_minutely_15": 12, "past_minutely_15": 1,
            "forecast_hours": 6, "past_hours": 1,
            "wind_speed_unit": "kmh", "temperature_unit": "celsius", "precipitation_unit": "mm",
            "timeformat": "unixtime", "timezone": "auto",
        }

    async def fetch(self):
        doc = await http_get_json(self.ctx.http, URL, params=self.params(), timeout=self.timeout)
        if not isinstance(doc, dict) or "current" not in doc:
            reason = doc.get("reason") if isinstance(doc, dict) else None
            raise SourceError(f"open-meteo: unexpected response{': ' + str(reason) if reason else ''}")
        return self.parse(doc, self.now())

    # ------------------------------------------------------------------ parsing (pure, tested)
    def parse(self, doc: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
        cur = doc.get("current") or {}
        temp = cur.get("temperature_2m")
        cond, inten, desc = wmo_condition(cur.get("weather_code"), temp)
        cover = cur.get("cloud_cover")

        # slots: (start, end, mm_per_h, code, snowfall) from minutely_15, else hourly
        slots = self._slots(doc.get("minutely_15"), 15) or self._slots(doc.get("hourly"), 60)
        rate_now = next((s[2] for s in slots if s[0] <= now < s[1]), None)

        if cond in ("clear", "cloudy"):
            intensity = clamp01(cover / 100) if isinstance(cover, (int, float)) else inten
        elif cond in PRECIP_CONDITIONS:
            intensity = rate_intensity(rate_now, cond) if rate_now else inten
            if cond == "storm":
                intensity = max(intensity, inten)
        else:   # fog
            intensity = inten

        precipitating = cond in PRECIP_CONDITIONS
        next_min, kind = None, (cond if precipitating else None)
        if not precipitating:
            for start, end, rate, code, snow in slots:
                if end <= now or rate < self.threshold_mm_h:
                    continue
                mins = (start - now).total_seconds() / 60
                if mins > self.horizon_min:
                    break
                next_min = max(0, round(mins))
                c = wmo_condition(code, temp)[0] if code is not None else None
                kind = c if c in PRECIP_CONDITIONS else ("snow" if snow else rain_or_snow(temp))
                break

        out = [
            {"key": "now.temp_c", "value": _round(temp), "type": "number"},
            {"key": "now.feels_like_c", "value": _round(cur.get("apparent_temperature")), "type": "number"},
            {"key": "now.condition", "value": cond, "type": "string"},
            {"key": "now.intensity", "value": round(intensity, 2), "type": "number"},
            {"key": "now.wind_kph", "value": _round(cur.get("wind_speed_10m")), "type": "number"},
            {"key": "now.summary", "value": desc, "type": "string"},
            {"key": "precip.next_minutes", "value": next_min, "type": "number"},
            {"key": "precip.kind", "value": kind, "type": "string"},
        ]
        daily = self._daily(doc)
        if daily:
            out.append({"key": "forecast.daily", "value": daily, "type": "series", "visibility": "ask"})
        ts = cur.get("time")
        if isinstance(ts, (int, float)):
            obs = datetime.fromtimestamp(ts, tz=timezone.utc)
            for it in out[:6]:
                it["ts"] = obs if obs <= now else now
        return out

    @staticmethod
    def _slots(block: dict[str, Any] | None, minutes: int) -> list[tuple]:
        """Open-Meteo precipitation is the sum over the *preceding* interval, so a value stamped t
        covers [t - interval, t). Returns (start, end, mm/h, weather_code, snowfall)."""
        times = _col(block, "time")
        if not times:
            return []
        precip, codes, snow = _col(block, "precipitation"), _col(block, "weather_code"), _col(block, "snowfall")
        out = []
        for i, t in enumerate(times):
            end = datetime.fromtimestamp(t, tz=timezone.utc)
            p = precip[i] if i < len(precip) and precip[i] is not None else 0.0
            out.append((end - timedelta(minutes=minutes), end, p * 60 / minutes,
                        codes[i] if i < len(codes) else None, (snow[i] or 0) if i < len(snow) else 0))
        return out

    @staticmethod
    def _daily(doc: dict[str, Any]) -> list[dict[str, Any]]:
        d = doc.get("daily") or {}
        times = _col(d, "time")
        off = timedelta(seconds=doc.get("utc_offset_seconds") or 0)
        out = []
        for i, t in enumerate(times):
            def g(k):
                col = _col(d, k)
                return col[i] if i < len(col) else None
            tmax = g("temperature_2m_max")
            cond, _, desc = wmo_condition(g("weather_code"), tmax)
            out.append({
                "date": (datetime.fromtimestamp(t, tz=timezone.utc) + off).date().isoformat(),
                "condition": cond, "summary": desc, "t_max": _round(tmax),
                "t_min": _round(g("temperature_2m_min")), "precip_mm": g("precipitation_sum"),
                "pop": g("precipitation_probability_max"), "wind_max_kph": _round(g("wind_speed_10m_max")),
            })
        return out


def _round(v: Any) -> Any:
    return round(v, 1) if isinstance(v, float) else v
