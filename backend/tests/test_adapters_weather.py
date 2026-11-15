"""open_meteo and envcanada adapters against recorded / synthetic responses. No live network."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

from ambient.adapters._shared import CONDITIONS, OptionError, SourceError, rate_intensity
from ambient.adapters.base import AdapterContext
from ambient.adapters.envcanada import EnvCanada, classify, parse_citypage
from ambient.adapters.open_meteo import WMO, OpenMeteo, wmo_condition
from ambient.signal import coerce

FIX = Path(__file__).parent / "fixtures"
SETTINGS = {"location": {"lat": 45.898, "lon": -77.283, "timezone": "America/Toronto"}}


def make_ctx(handler=None) -> AdapterContext:
    transport = httpx.MockTransport(handler or (lambda r: httpx.Response(599)))
    return AdapterContext(http=httpx.AsyncClient(transport=transport), log=logging.getLogger("test"),
                          data_dir=Path("."), settings=SETTINGS)


def vals(items):
    return {i["key"]: i["value"] for i in items}


def ts(dt: datetime) -> int:
    return int(dt.timestamp())


# ---------------------------------------------------------------------- shared vocabulary
def test_every_mapping_lands_on_the_six_conditions():
    for code in WMO:
        for t in (-5, 5):
            assert wmo_condition(code, t)[0] in CONDITIONS
    for icon in range(0, 49):
        for t in (-5, 5):
            assert classify(icon, None, t)[0] in CONDITIONS
    assert rate_intensity(0.5, "rain") == 0.2 and rate_intensity(4, "rain") == 0.6
    assert rate_intensity(40, "rain") == 1.0 and rate_intensity(0.1, "storm") == 0.8


# ---------------------------------------------------------------------- open_meteo
async def test_open_meteo_recorded_petawawa():
    doc = json.loads((FIX / "open_meteo_petawawa.json").read_text())
    now = datetime.fromtimestamp(doc["current"]["time"], tz=timezone.utc)
    seen = {}

    def handler(req):
        seen["params"] = dict(req.url.params)
        return httpx.Response(200, json=doc)
    a = OpenMeteo("weather", {}, make_ctx(handler))
    a.now = lambda: now
    items = await a.fetch()
    for it in items:
        coerce(it, source="weather")
    v = vals(items)
    assert v["now.condition"] == "clear" and v["now.intensity"] == 0.0
    assert v["now.temp_c"] == 3.0 and v["now.feels_like_c"] == -0.4 and v["now.wind_kph"] == 8.0
    assert v["now.summary"] == "Clear"
    assert v["precip.next_minutes"] is None and v["precip.kind"] is None
    assert len(v["forecast.daily"]) == 7 and v["forecast.daily"][0]["date"] == "2026-10-09"
    daily = next(i for i in items if i["key"] == "forecast.daily")
    assert daily["visibility"] == "ask"
    # only rounded coordinates leave the network
    assert seen["params"]["latitude"] == "45.9" and seen["params"]["longitude"] == "-77.28"


def om_doc(now, code, cover=None, temp=6.0, slots=(), hourly=None):
    """slots: [(minutes_after_now_of_slot_end, mm_in_15min, code)]"""
    d = {"utc_offset_seconds": -14400,
         "current": {"time": ts(now), "temperature_2m": temp, "apparent_temperature": temp - 3,
                     "weather_code": code, "cloud_cover": cover, "wind_speed_10m": 12.0, "precipitation": 0}}
    if slots:
        d["minutely_15"] = {"time": [ts(now + timedelta(minutes=m)) for m, _, _ in slots],
                            "precipitation": [p for _, p, _ in slots],
                            "weather_code": [c for _, _, c in slots],
                            "snowfall": [0 for _ in slots]}
    if hourly:
        d["hourly"] = hourly
    return d


def test_open_meteo_rain_in_15_minutes():
    now = datetime(2026, 10, 9, 20, 0, tzinfo=timezone.utc)
    a = OpenMeteo("weather", {}, make_ctx())
    v = vals(a.parse(om_doc(now, 3, cover=85, slots=[(0, 0, 3), (15, 0, 3), (30, 0.5, 61), (45, 1.0, 63)]), now))
    assert v["now.condition"] == "cloudy" and v["now.intensity"] == 0.85
    assert v["precip.next_minutes"] == 15 and v["precip.kind"] == "rain"


def test_open_meteo_raining_now_uses_rate_and_snow_by_temperature():
    now = datetime(2026, 10, 9, 20, 7, tzinfo=timezone.utc)
    a = OpenMeteo("weather", {}, make_ctx())
    v = vals(a.parse(om_doc(now, 63, slots=[(8, 1.0, 63), (23, 1.0, 63)]), now))
    assert v["now.condition"] == "rain" and v["now.intensity"] == 0.6      # 4 mm/h
    assert v["precip.next_minutes"] is None and v["precip.kind"] == "rain"
    # freezing rain at -3 C -> snow; drizzle with no rate -> code default 0.2
    assert vals(a.parse(om_doc(now, 66, temp=-3.0), now))["now.condition"] == "snow"
    assert vals(a.parse(om_doc(now, 66, temp=1.0), now))["now.condition"] == "rain"
    v = vals(a.parse(om_doc(now, 53), now))
    assert v["now.condition"] == "rain" and v["now.intensity"] == 0.2
    v = vals(a.parse(om_doc(now, 95), now))
    assert v["now.condition"] == "storm" and v["now.intensity"] >= 0.85 and v["precip.kind"] == "storm"
    v = vals(a.parse(om_doc(now, 45), now))
    assert v["now.condition"] == "fog" and 0 < v["now.intensity"] <= 1


def test_open_meteo_hourly_fallback_and_horizon():
    now = datetime(2026, 10, 9, 20, 0, tzinfo=timezone.utc)
    hourly = {"time": [ts(now + timedelta(hours=h)) for h in (1, 2, 3)],
              "precipitation": [0, 0.8, 2.0], "weather_code": [3, 71, 73]}
    a = OpenMeteo("weather", {}, make_ctx())
    v = vals(a.parse(om_doc(now, 3, cover=100, temp=-1.0, hourly=hourly), now))
    assert v["precip.next_minutes"] == 60 and v["precip.kind"] == "snow"
    short = OpenMeteo("weather", {"precip_horizon": "30m"}, make_ctx())
    assert vals(short.parse(om_doc(now, 3, cover=100, hourly=hourly), now))["precip.next_minutes"] is None


async def test_open_meteo_errors_and_options():
    with pytest.raises(SourceError, match="HTTP 400"):
        await OpenMeteo("w", {}, make_ctx(lambda r: httpx.Response(400, json={"reason": "bad"}))).fetch()
    with pytest.raises(SourceError, match="unexpected"):
        await OpenMeteo("w", {}, make_ctx(lambda r: httpx.Response(200, json={"error": True}))).fetch()
    ctx = make_ctx()
    ctx.settings = {}
    with pytest.raises(OptionError, match="lat"):
        OpenMeteo("w", {}, ctx)
    with pytest.raises(OptionError, match="range"):
        OpenMeteo("w", {"lat": 95, "lon": 0}, make_ctx())


# ---------------------------------------------------------------------- envcanada
def test_envcanada_petawawa_has_no_station_uses_hourly():
    xml = (FIX / "envcanada_petawawa_en.xml").read_bytes()
    now = datetime(2026, 10, 10, 3, 30, tzinfo=timezone.utc)
    items = parse_citypage(xml, now)
    for it in items:
        coerce(it, source="weather")
    v = vals(items)
    assert v["now.condition"] == "clear" and v["now.intensity"] == 0.0
    assert v["now.temp_c"] == 3 and v["now.feels_like_c"] == 3 and v["now.wind_kph"] == 10
    assert v["now.summary"] == "Clear"
    assert v["precip.next_minutes"] is None and v["precip.kind"] is None
    assert items[0]["meta"]["from"] == "hourly"
    assert len(v["forecast.daily"]) == 12
    first = v["forecast.daily"][0]
    assert first["period"] == "Tonight" and first["pop"] == 40 and first["condition"] == "rain"
    assert v["warnings"] == []


def test_envcanada_ottawa_observation():
    xml = (FIX / "envcanada_ottawa_en.xml").read_bytes()
    now = datetime(2026, 10, 10, 3, 30, tzinfo=timezone.utc)
    items = parse_citypage(xml, now)
    v = vals(items)
    assert v["now.condition"] == "clear" and v["now.temp_c"] == 5.5 and v["now.wind_kph"] == 5
    assert items[0]["meta"]["from"] == "observation"
    assert items[0]["ts"] == datetime(2026, 10, 10, 3, 0, tzinfo=timezone.utc)


SYNTH = """<?xml version="1.0" encoding="UTF-8"?>
<siteData>
  <warnings><event type="warning" priority="high" description="RAINFALL WARNING IN EFFECT"/></warnings>
  <currentConditions>
    <dateTime name="observation" zone="UTC" UTCOffset="0"><timeStamp>20261010030000</timeStamp></dateTime>
    <condition>{cond}</condition><iconCode format="gif">{icon}</iconCode>
    <temperature unitType="metric" units="C">{temp}</temperature>
    <windChill unitType="metric">{chill}</windChill>
    <wind><speed unitType="metric" units="km/h">22</speed></wind>
  </currentConditions>
  <hourlyForecastGroup>
    <hourlyForecast dateTimeUTC="202610100400"><condition>Cloudy</condition><iconCode format="png">10</iconCode>
      <temperature unitType="metric" units="C">4</temperature><lop category="Low" units="%">20</lop></hourlyForecast>
    <hourlyForecast dateTimeUTC="202610100500"><condition>{hcond}</condition><iconCode format="png">{hicon}</iconCode>
      <temperature unitType="metric" units="C">{htemp}</temperature><lop category="High" units="%">70</lop></hourlyForecast>
  </hourlyForecastGroup>
</siteData>"""


def synth(cond="Mostly Cloudy", icon="03", temp=4, chill="", hcond="Rain", hicon="12", htemp=4):
    return SYNTH.format(cond=cond, icon=icon, temp=temp, chill=chill, hcond=hcond, hicon=hicon, htemp=htemp)


def test_envcanada_rain_coming_and_kinds():
    now = datetime(2026, 10, 10, 3, 40, tzinfo=timezone.utc)
    v = vals(parse_citypage(synth(), now))
    assert v["now.condition"] == "cloudy" and v["now.intensity"] == 0.7
    assert v["precip.next_minutes"] == 80 and v["precip.kind"] == "rain"
    assert v["warnings"] == ["RAINFALL WARNING IN EFFECT"]
    # freezing rain in an hour at -3 -> snow; wind chill becomes feels-like
    v = vals(parse_citypage(synth(temp=-2, chill=-9, hcond="Freezing rain", hicon="14", htemp=-3), now))
    assert v["precip.kind"] == "snow" and v["now.feels_like_c"] == -9
    # raining now: no countdown, kind = current
    v = vals(parse_citypage(synth(cond="Light Rain", icon="12"), now))
    assert v["now.condition"] == "rain" and v["now.intensity"] == 0.3
    assert v["precip.next_minutes"] is None and v["precip.kind"] == "rain"
    v = vals(parse_citypage(synth(cond="Thunderstorm with Heavy Rain", icon="19"), now))
    assert v["now.condition"] == "storm" and v["now.intensity"] == 0.95
    v = vals(parse_citypage(synth(cond="Fog", icon="24"), now))
    assert v["now.condition"] == "fog"
    # no icon: text fallback
    v = vals(parse_citypage(synth(cond="Heavy Snow", icon=""), now))
    assert v["now.condition"] == "snow" and v["now.intensity"] == 0.95


def test_envcanada_malformed():
    now = datetime(2026, 10, 10, 3, 40, tzinfo=timezone.utc)
    with pytest.raises(SourceError, match="malformed"):
        parse_citypage(b"<siteData><oops", now)
    with pytest.raises(SourceError, match="not a citypage"):
        parse_citypage(b"<html/>", now)
    with pytest.raises(SourceError, match="neither"):
        parse_citypage(b"<siteData><currentConditions/></siteData>", now)


async def test_envcanada_locates_newest_file_falling_back_an_hour():
    listing = (FIX / "envcanada_listing.html").read_text()
    xml = (FIX / "envcanada_petawawa_en.xml").read_bytes()
    requested = []

    def handler(req: httpx.Request):
        u = str(req.url)
        requested.append(u)
        if u == "https://dd.weather.gc.ca/today/citypage_weather/ON/04/":
            return httpx.Response(404)
        if u == "https://dd.weather.gc.ca/today/citypage_weather/ON/03/":
            return httpx.Response(200, text=listing)
        if u.endswith("Z_MSC_CitypageWeather_s0000729_en.xml"):
            return httpx.Response(200, content=xml)
        return httpx.Response(404)

    a = EnvCanada("weather", {"site": "s0000729", "province": "ON"}, make_ctx(handler))
    a.now = lambda: datetime(2026, 10, 10, 4, 2, tzinfo=timezone.utc)
    v = vals(await a.fetch())
    assert v["now.condition"] == "clear"
    assert requested[-1] == ("https://dd.weather.gc.ca/today/citypage_weather/ON/03/"
                             "20261010T030504.476Z_MSC_CitypageWeather_s0000729_en.xml")
    assert a.status.extra["file"].endswith("s0000729_en.xml")


async def test_envcanada_crosses_midnight_via_dated_tree():
    a = EnvCanada("weather", {"site": "s0000729"}, make_ctx())
    dirs = a.hour_dirs(datetime(2026, 10, 10, 0, 10, tzinfo=timezone.utc), back=1)
    assert dirs == ["https://dd.weather.gc.ca/today/citypage_weather/ON/00/",
                    "https://dd.weather.gc.ca/20261010/WXO-DD/citypage_weather/ON/00/",
                    "https://dd.weather.gc.ca/20261009/WXO-DD/citypage_weather/ON/23/"]
    nothing = EnvCanada("weather", {"site": "s0000729"}, make_ctx(lambda r: httpx.Response(404)))
    with pytest.raises(SourceError, match="no citypage file"):
        await nothing.fetch()


def test_envcanada_options():
    with pytest.raises(OptionError, match="site"):
        EnvCanada("w", {}, make_ctx())
    with pytest.raises(OptionError, match="site"):
        EnvCanada("w", {"site": "Petawawa"}, make_ctx())
    with pytest.raises(OptionError, match="province"):
        EnvCanada("w", {"site": "s0000729", "province": "ZZ"}, make_ctx())
    EnvCanada("w", {"url": "https://example.org/x.xml"}, make_ctx())
