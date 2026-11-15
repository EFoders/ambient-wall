"""envcanada: Environment and Climate Change Canada "citypage" XML from the MSC Datamart (free, no key).

    [[source]]
    name = "weather"
    type = "envcanada"
    site = "s0000430"           # Ottawa (Kanata - Orleans)
    province = "ON"
    every = "10m"

Finding a site code: https://dd.weather.gc.ca/today/citypage_weather/siteList.xml (or
docs/site_list_en.csv next to it); search for the town (Ottawa = s0000430, ON). Small towns often
have no observing station: their <currentConditions/> is empty, and the
"now" values then come from the first hour of the hourly forecast (meta.from = "hourly").

Datamart layout (verified 2026-10): files are published per UTC hour with a timestamped name,
    https://dd.weather.gc.ca/today/citypage_weather/ON/03/20261010T030504.476Z_MSC_CitypageWeather_s0000430_en.xml
so the adapter lists the current hour's directory (then earlier hours, crossing midnight through the
dated tree /YYYYMMDD/WXO-DD/citypage_weather/...) and takes the newest file for the site. If MSC moves
things again, set `url` to a fixed XML URL.

Keys as open_meteo: now.temp_c, now.feels_like_c, now.condition, now.intensity, now.wind_kph,
now.summary, precip.next_minutes (hourly resolution), precip.kind, forecast.daily (ask), plus
warnings (ask, list of active warning descriptions).
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Any

from ..signal import utcnow
from ._shared import (PRECIP_CONDITIONS, OptionError, SourceError, http_get, opt, opt_choice,
                      opt_duration, rain_or_snow)
from .base import Adapter, register

BASE = "https://dd.weather.gc.ca"
PROVINCES = ("AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT", "HEF")

# EC icon code -> (condition, intensity). None = mixed/freezing, resolved by temperature.
# From docs/current_conditions_icon_code_descriptions_e.csv and forecast_..._e.csv on the Datamart.
ICONS: dict[int, tuple[str | None, float]] = {
    0: ("clear", 0.0), 1: ("clear", 0.2), 30: ("clear", 0.0), 31: ("clear", 0.2),
    5: ("clear", 0.3), 35: ("clear", 0.3),                                     # clearing
    2: ("cloudy", 0.4), 22: ("cloudy", 0.4), 32: ("cloudy", 0.4),               # partly / mix
    3: ("cloudy", 0.7), 33: ("cloudy", 0.95), 10: ("cloudy", 0.95),             # mostly / cloudy
    4: ("cloudy", 0.6), 34: ("cloudy", 0.6), 43: ("cloudy", 0.5),               # increasing; windy
    6: ("rain", 0.3), 36: ("rain", 0.3), 11: ("rain", 0.5), 12: ("rain", 0.5),
    13: ("rain", 0.8), 28: ("rain", 0.2),                                      # 28 drizzle
    7: (None, 0.3), 37: (None, 0.3), 14: (None, 0.5), 15: (None, 0.6), 27: (None, 0.5),
    8: ("snow", 0.3), 38: ("snow", 0.3), 16: ("snow", 0.4), 17: ("snow", 0.6), 18: ("snow", 0.95),
    25: ("snow", 0.4), 26: ("snow", 0.2), 40: ("snow", 0.8),
    9: ("storm", 0.85), 19: ("storm", 0.9), 39: ("storm", 0.85), 41: ("storm", 1.0),
    42: ("storm", 1.0), 46: ("storm", 1.0), 47: ("storm", 1.0), 48: ("storm", 1.0),
    20: ("fog", 0.7), 21: ("fog", 0.7), 24: ("fog", 0.7), 23: ("fog", 0.4), 44: ("fog", 0.5), 45: ("fog", 0.6),
}

# Text fallback (English), first match wins: (substring, condition, intensity)
TEXT = [
    ("thunder", "storm", 0.9), ("tornado", "storm", 1.0), ("funnel", "storm", 1.0),
    ("freezing", None, 0.5), ("ice pellet", None, 0.5), ("sleet", None, 0.5),
    ("rain and snow", None, 0.6), ("snow mixed with rain", None, 0.6), ("rain or snow", None, 0.6),
    ("flurries or rain", None, 0.3), ("rain showers or flurries", None, 0.3),
    ("blizzard", "snow", 1.0), ("blowing snow", "snow", 0.8), ("snow", "snow", 0.6), ("flurr", "snow", 0.35),
    ("drizzle", "rain", 0.2), ("shower", "rain", 0.4), ("rain", "rain", 0.6), ("precipitation", "rain", 0.5),
    ("fog", "fog", 0.7), ("mist", "fog", 0.4), ("haze", "fog", 0.4), ("smoke", "fog", 0.5),
    ("overcast", "cloudy", 0.95), ("mostly cloudy", "cloudy", 0.7), ("partly cloudy", "cloudy", 0.4),
    ("mix of sun and cloud", "cloudy", 0.4), ("cloudy periods", "cloudy", 0.4),
    ("increasing cloudiness", "cloudy", 0.6), ("cloud", "cloudy", 0.9),
    ("a few clouds", "clear", 0.2), ("mainly", "clear", 0.2), ("clearing", "clear", 0.3),
    ("sunny", "clear", 0.0), ("clear", "clear", 0.0),
]


def classify(icon: int | None, text: str | None, temp_c: float | None) -> tuple[str, float]:
    """(condition, intensity) from an EC icon code and/or condition text."""
    t = (text or "").lower()
    cond: str | None
    if icon is not None and icon in ICONS:
        cond, inten = ICONS[icon]
    else:
        for needle, c, i in TEXT:
            if needle in t:
                cond, inten = c, i
                break
        else:
            return "cloudy", 0.5
    cond = cond or rain_or_snow(temp_c)
    if cond in PRECIP_CONDITIONS:
        if "heavy" in t or "at times heavy" in t:
            inten = max(inten, 0.95)
        elif "drizzle" in t and cond == "rain":
            inten = min(inten, 0.25)
        elif "light" in t or "few" in t or "chance" in t:
            inten = min(inten, 0.3)
    return cond, round(inten, 2)


def _f(el: ET.Element | None) -> float | None:
    if el is None or el.text is None or not el.text.strip():
        return None
    try:
        return float(el.text.strip())
    except ValueError:
        return None


def _i(el: ET.Element | None) -> int | None:
    v = _f(el)
    return None if v is None else int(v)


def _txt(el: ET.Element | None) -> str | None:
    return el.text.strip() if el is not None and el.text and el.text.strip() else None


def _utc(stamp: str | None) -> datetime | None:
    """'202610100400' or '20261010030000' -> aware UTC datetime."""
    if not stamp:
        return None
    s = stamp.strip()
    for fmt in ("%Y%m%d%H%M%S", "%Y%m%d%H%M"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def parse_citypage(xml: str | bytes, now: datetime, *, pop_threshold: int = 40,
                   horizon_min: float = 120) -> list[dict[str, Any]]:
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as e:
        raise SourceError(f"citypage XML is malformed: {e}") from None
    if root.tag != "siteData":
        raise SourceError(f"not a citypage document (root <{root.tag}>)")

    hourly = []
    for h in root.findall("hourlyForecastGroup/hourlyForecast"):
        t = _utc(h.get("dateTimeUTC"))
        if t is None:
            continue
        lop = h.find("lop")
        hourly.append({"t": t, "text": _txt(h.find("condition")), "icon": _i(h.find("iconCode")),
                       "temp": _f(h.find("temperature")), "lop": _i(lop),
                       "wind": _f(h.find("wind/speed")), "chill": _f(h.find("windChill")),
                       "humidex": _f(h.find("humidex"))})
    hourly.sort(key=lambda h: h["t"])

    cc = root.find("currentConditions")
    meta: dict[str, Any] = {}
    temp = _f(cc.find("temperature")) if cc is not None else None
    if cc is not None and (temp is not None or _txt(cc.find("condition"))):
        text, icon = _txt(cc.find("condition")), _i(cc.find("iconCode"))
        wind = _f(cc.find("wind/speed"))
        chill, humidex = _f(cc.find("windChill")), _f(cc.find("humidex"))
        obs = None
        for dt in cc.findall("dateTime"):
            if dt.get("zone") == "UTC":
                obs = _utc(_txt(dt.find("timeStamp")))
        meta = {"from": "observation", "station": _txt(cc.find("station"))}
    elif hourly:
        # no observing station: use the forecast hour we're in (or the first one)
        h = next((h for h in reversed(hourly) if h["t"] <= now), hourly[0])
        text, icon, temp, wind = h["text"], h["icon"], h["temp"], h["wind"]
        chill, humidex, obs = h["chill"], h["humidex"], None
        meta = {"from": "hourly"}
    else:
        raise SourceError("citypage has neither current conditions nor an hourly forecast")

    cond, intensity = classify(icon, text, temp)
    feels = chill if chill is not None else humidex if humidex is not None else temp

    # precipitation timing from the hourly forecast (hour resolution)
    next_min, kind = None, (cond if cond in PRECIP_CONDITIONS else None)
    if kind is None:
        for h in hourly:
            if h["t"] + timedelta(hours=1) <= now:
                continue
            mins = (h["t"] - now).total_seconds() / 60
            if mins > horizon_min:
                break
            hc, _ = classify(h["icon"], h["text"], h["temp"])
            likely = h["lop"] >= pop_threshold if h["lop"] is not None else hc in PRECIP_CONDITIONS
            if likely:
                next_min = max(0, round(mins))
                kind = hc if hc in PRECIP_CONDITIONS else rain_or_snow(h["temp"])
                break

    daily = []
    for fc in root.findall("forecastGroup/forecast"):
        period = fc.find("period")
        abbr = fc.find("abbreviatedForecast")
        temps = fc.findall("temperatures/temperature")
        t = temps[0] if temps else None
        summary = _txt(abbr.find("textSummary")) if abbr is not None else None
        icon_f = _i(abbr.find("iconCode")) if abbr is not None else None
        temp_f = _f(t)
        daily.append({
            "period": (period.get("textForecastName") if period is not None else None) or _txt(period),
            "condition": classify(icon_f, summary, temp_f)[0],
            "summary": summary,
            "pop": _i(abbr.find("pop")) if abbr is not None else None,
            "temp": temp_f, "temp_class": t.get("class") if t is not None else None,
            "text": _txt(fc.find("textSummary")),
        })

    warnings = [w.get("description") for w in root.findall("warnings/event") if w.get("description")]

    out = [
        {"key": "now.temp_c", "value": temp, "type": "number"},
        {"key": "now.feels_like_c", "value": feels, "type": "number"},
        {"key": "now.condition", "value": cond, "type": "string"},
        {"key": "now.intensity", "value": intensity, "type": "number"},
        {"key": "now.wind_kph", "value": wind, "type": "number"},
        {"key": "now.summary", "value": text or cond.capitalize(), "type": "string"},
        {"key": "precip.next_minutes", "value": next_min, "type": "number"},
        {"key": "precip.kind", "value": kind, "type": "string"},
        {"key": "forecast.daily", "value": daily, "type": "series", "visibility": "ask"},
        {"key": "warnings", "value": warnings, "type": "series", "visibility": "ask"},
    ]
    for it in out[:6]:
        it["meta"] = dict(meta)
        if obs is not None and obs <= now:
            it["ts"] = obs
    return out


_HREF = re.compile(r'href="([^"]+)"')


@register("envcanada")
class EnvCanada(Adapter):
    default_every = 600.0

    def __init__(self, name: str, options: dict[str, Any], ctx):
        super().__init__(name, options, ctx)
        self.url = opt(options, "url", str, None, source=name)
        self.site = opt(options, "site", str, None, source=name)
        if not self.url:
            if not self.site or not re.fullmatch(r"s\d{7}", self.site):
                raise OptionError(f"source {name!r}: site must be a citypage code like \"s0000430\" "
                                  f"(see siteList.xml), or set url")
        self.province = opt_choice(options, "province", PROVINCES, "ON", source=name)
        self.lang = opt_choice(options, "lang", ("en", "fr"), "en", source=name)
        self.pop_threshold = int(opt(options, "pop_threshold", int, 40, source=name))
        self.horizon_min = opt_duration(options, "precip_horizon", 7200.0, source=name) / 60
        self.timeout = opt_duration(options, "timeout", 20.0, source=name)
        self.base = opt(options, "base_url", str, BASE, source=name).rstrip("/")
        self._last_file: str | None = None

    def now(self) -> datetime:
        return utcnow()

    def hour_dirs(self, now: datetime, back: int = 3) -> list[str]:
        """Directory listing URLs to try, newest first: today/<prov>/<HH>/ for the current UTC day,
        the dated tree for earlier days."""
        out = []
        for k in range(back + 1):
            t = now - timedelta(hours=k)
            sub = f"citypage_weather/{self.province}/{t:%H}/"
            if t.date() == now.date():
                out.append(f"{self.base}/today/{sub}")
            out.append(f"{self.base}/{t:%Y%m%d}/WXO-DD/{sub}")
        return list(dict.fromkeys(out))

    async def locate(self, now: datetime) -> str:
        suffix = f"_MSC_CitypageWeather_{self.site}_{self.lang}.xml"
        tried = 0
        for d in self.hour_dirs(now):
            tried += 1
            try:
                r = await http_get(self.ctx.http, d, timeout=self.timeout)
            except SourceError:
                continue
            files = sorted({h for h in _HREF.findall(r.text) if h.endswith(suffix)})
            if files:
                return d + files[-1].rsplit("/", 1)[-1]
            # the current hour's directory may exist but not contain this site yet; keep going
        raise SourceError(f"no citypage file for {self.site} in the last {tried} hourly directories "
                          f"under {self.base}; check site/province or set url")

    async def fetch(self):
        now = self.now()
        url = self.url or await self.locate(now)
        r = await http_get(self.ctx.http, url, timeout=self.timeout)
        self._last_file = url.rsplit("/", 1)[-1]
        self.status.extra["file"] = self._last_file
        return parse_citypage(r.content, now, pop_threshold=self.pop_threshold, horizon_min=self.horizon_min)
