"""ambient.ask: the six ask panels, built from a real Pool with published signals."""
from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from ambient import ask
from ambient.adapters.envcanada import parse_citypage
from ambient.config import build_config
from ambient.pool import Pool
from ambient.signal import Signal, coerce

TZ = ZoneInfo("America/Toronto")
UTC = timezone.utc
NOW = datetime(2026, 10, 10, 9, 30, tzinfo=TZ)           # Saturday
CFG = {"location": {"timezone": "America/Toronto"}}
FIX = Path(__file__).parent / "fixtures"


def sig(sid: str, value, *, ts: datetime | None = None, age: float = 0, ttl: float | None = None,
        vis: str = "ask", now: datetime = NOW) -> Signal:
    source, key = sid.split(".", 1)
    return Signal(source=source, key=key, value=value, ts=ts or now - timedelta(seconds=age), ttl_s=ttl,
                  visibility=vis)


def pool_of(*sigs: Signal) -> Pool:
    p = Pool(None, history=False)
    asyncio.run(p.publish(list(sigs)))
    return p


def cfg_with(**ask_tables) -> dict:
    return {**CFG, "ask": ask_tables}


def build(name, *sigs, now=NOW, cfg=CFG):
    return ask.build_panel(name, pool_of(*sigs), now, cfg)


# ============================================================================== registry / general

def test_registry_has_the_six_panels_in_order():
    assert list(ask.PANELS) == ["forecast", "calendar", "pulse", "finance", "news", "warnings"]
    assert ask.describe()["finance"] == {"month": "finances.month", "detail": "finances.detail.*",
                                         "mood": "rules.finances.mood"}


def test_unknown_panel_raises():
    with pytest.raises(ask.UnknownPanel):
        ask.build_panel("horoscope", pool_of(), NOW, CFG)
    with pytest.raises(KeyError):
        ask.panel_config("horoscope")


def test_every_panel_is_none_on_an_empty_pool():
    p = pool_of()
    for name in ask.PANELS:
        assert ask.build_panel(name, p, NOW, CFG) is None, name
    assert ask.panel_availability(p, NOW, CFG) == [{"panel": n, "available": False} for n in ask.PANELS]


def test_common_fields_and_ts_is_newest_input_local():
    p = build("finance",
              sig("finances.month", {"income": 10, "spent": 5}, ts=datetime(2026, 10, 10, 12, 0, tzinfo=UTC), vis="wall"),
              sig("rules.finances.mood", "drift", ts=datetime(2026, 10, 10, 13, 15, tzinfo=UTC), vis="wall"))
    assert p["panel"] == "finance" and p["title"] == "Finances"
    assert p["ts"] == "2026-10-10T09:15:00-04:00"


def test_title_override_and_disable():
    s = sig("weather.warnings", [])
    assert build("warnings", s, cfg=cfg_with(warnings={"title": "Alerts"}))["title"] == "Alerts"
    assert build("warnings", s, cfg=cfg_with(warnings={"enabled": False})) is None
    avail = ask.panel_availability(pool_of(s), NOW, cfg_with(warnings={"enabled": False}))
    assert {"panel": "warnings", "available": False} in avail


def test_accepts_config_object_and_none_cfg():
    s = sig("envcan.warnings", ["RAINFALL WARNING IN EFFECT"])
    cfg = build_config({"location": {"timezone": "America/Toronto"},
                        "ask": {"warnings": {"warnings": "envcan.warnings"}}}, known_types=set())
    assert build("warnings", s, cfg=cfg)["items"][0]["headline"] == "RAINFALL WARNING IN EFFECT"
    assert build("warnings", sig("weather.warnings", ["X WARNING"]), cfg=None)["items"][0]["severity"] == "warning"


def test_input_set_to_empty_string_turns_it_off():
    assert build("warnings", sig("weather.warnings", ["x"]), cfg=cfg_with(warnings={"warnings": ""})) is None


def test_bad_option_types_fall_back_to_defaults():
    pc = ask.panel_config("forecast", cfg_with(forecast={"days": "lots", "daily": 7}))
    assert pc["days"] == 7 and pc["daily"] == "weather.forecast.daily"


def test_builder_exception_yields_none(monkeypatch):
    def boom(r, pc, now, tz):
        raise RuntimeError("provider sent something odd")
    monkeypatch.setitem(ask.PANELS, "forecast", ask.Panel("forecast", "Forecast", boom,
                                                          {"daily": "weather.forecast.daily"}))
    assert build("forecast", sig("weather.forecast.daily", [{"date": "2026-10-10"}])) is None


def test_plugin_panel_registration(monkeypatch):
    monkeypatch.setattr(ask, "PANELS", dict(ask.PANELS))

    @ask.panel("solar", title="Solar", inputs={"now": "solar.power.now"})
    def _solar(r, pc, now, tz):
        s = r.get(pc["now"])
        return None if s is None else {"watts": s.value}

    p = build("solar", sig("solar.power.now", 812, vis="wall"))
    assert p == {"panel": "solar", "title": "Solar", "ts": "2026-10-10T09:30:00-04:00", "watts": 812}


def test_panels_are_json_serializable():
    p = build("forecast", sig("weather.forecast.daily", [{"date": "2026-10-10", "t_max": 1, "t_min": 0}]))
    json.dumps(p)


# ============================================================================== forecast

def om_days(start: date, n: int) -> list[dict]:
    """Open-Meteo adapter shape (open_meteo._daily)."""
    return [{"date": (start + timedelta(days=i)).isoformat(), "condition": "rain" if i == 0 else "clear",
             "summary": "Rain" if i == 0 else "Clear sky", "t_max": 12.5 - i, "t_min": 3.5 - i,
             "precip_mm": 4.23 if i == 0 else 0.0, "pop": 80 if i == 0 else None, "wind_max_kph": 20}
            for i in range(n)]


def test_forecast_open_meteo_shape():
    p = build("forecast", sig("weather.forecast.daily", om_days(date(2026, 10, 10), 7)))
    assert p["panel"] == "forecast" and p["title"] == "Forecast"
    days = p["days"]
    assert len(days) == 7
    assert days[0] == {"date": "2026-10-10", "label": "Sat", "hiC": 13, "loC": 4, "condition": "rain",
                       "pop": 80, "precipMm": 4.2}
    assert days[1] == {"date": "2026-10-11", "label": "Sun", "hiC": 12, "loC": 3, "condition": "clear",
                       "precipMm": 0.0}                                  # pop None -> omitted
    assert [d["label"] for d in days] == ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]


def test_forecast_caps_at_seven_and_custom_days():
    s = sig("weather.forecast.daily", om_days(date(2026, 10, 10), 16))
    assert len(build("forecast", s)["days"]) == 7
    assert len(build("forecast", s, cfg=cfg_with(forecast={"days": 3}))["days"]) == 3


def test_forecast_drops_days_before_local_today():
    s = sig("weather.forecast.daily", om_days(date(2026, 10, 8), 5), age=3600)
    assert [d["date"] for d in build("forecast", s)["days"]] == ["2026-10-10", "2026-10-11", "2026-10-12"]
    # now given in UTC: 02:00Z on Oct 10 is still Oct 9 in Toronto
    p = build("forecast", s, now=datetime(2026, 10, 10, 2, 0, tzinfo=UTC))
    assert p["days"][0]["date"] == "2026-10-09" and p["days"][0]["label"] == "Fri"


def test_forecast_unsorted_input_is_sorted_and_conditions_normalized():
    items = [
        {"date": "2026-10-12", "condition": "Overcast", "hi": 9, "lo": 1},
        {"date": "2026-10-10", "summary": "Chance of showers", "hiC": 10, "loC": 2},
        {"date": "2026-10-11", "condition": "thunderstorm", "t_max": 11},
        {"date": "2026-10-13", "condition": "???", "t_max": 8, "t_min": -1},
        {"date": "2026-10-14", "summary": "Periods of snow", "t_max": -2.5, "t_min": -7.5},
        {"date": "2026-10-15", "summary": "Mist", "t_max": 4},
    ]
    days = build("forecast", sig("weather.forecast.daily", items))["days"]
    assert [d["date"] for d in days] == ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13",
                                         "2026-10-14", "2026-10-15"]
    assert [d["condition"] for d in days] == ["rain", "storm", "cloudy", "clear", "snow", "fog"]
    assert days[1]["loC"] is None
    assert days[4]["hiC"] == -3 and days[4]["loC"] == -8                # half away from zero
    for d in days:
        assert d["condition"] in ("clear", "cloudy", "fog", "rain", "storm", "snow")


def test_forecast_envcanada_periods_merged_per_day():
    fetched = datetime(2026, 10, 9, 21, 0, tzinfo=TZ)                    # Friday evening
    periods = [
        {"period": "Tonight", "condition": "cloudy", "summary": "Cloudy", "pop": None, "temp": 3.0, "temp_class": "low"},
        {"period": "Saturday", "condition": "rain", "summary": "Showers", "pop": 60, "temp": 12.0, "temp_class": "high"},
        {"period": "Saturday night", "condition": "snow", "summary": "Flurries", "pop": 30, "temp": -1.0, "temp_class": "low"},
        {"period": "Sunday", "condition": "clear", "summary": "Sunny", "pop": None, "temp": 9.0, "temp_class": "high"},
    ]
    s = sig("weather.forecast.daily", periods, ts=fetched)
    days = build("forecast", s, now=fetched)["days"]
    assert days == [
        {"date": "2026-10-09", "label": "Fri", "hiC": None, "loC": 3, "condition": "cloudy"},
        {"date": "2026-10-10", "label": "Sat", "hiC": 12, "loC": -1, "condition": "rain", "pop": 60},
        {"date": "2026-10-11", "label": "Sun", "hiC": 9, "loC": None, "condition": "clear"},
    ]
    # after midnight the same (still fresh) forecast no longer shows Friday
    after = datetime(2026, 10, 10, 0, 20, tzinfo=TZ)
    assert [d["label"] for d in build("forecast", s, now=after)["days"]] == ["Sat", "Sun"]


def test_forecast_envcanada_real_fixture():
    now = datetime(2026, 10, 10, 3, 30, tzinfo=UTC)                     # Fri 23:30 local
    items = {i["key"]: coerce(i, source="weather", ttl_s=1800) for i in
             parse_citypage((FIX / "envcanada_petawawa_en.xml").read_bytes(), now)}
    s = items["forecast.daily"].model_copy(update={"ts": now})
    p = ask.build_panel("forecast", pool_of(s), now, CFG)
    days = p["days"]
    assert [d["label"] for d in days] == ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"]
    assert days[0]["date"] == "2026-10-09" and days[0]["hiC"] is None and days[0]["loC"] is not None
    assert all(d["hiC"] is not None for d in days[1:])
    assert all(d["condition"] in ("clear", "cloudy", "fog", "rain", "storm", "snow") for d in days)
    assert days[0]["pop"] == 40


def test_forecast_french_period_names():
    fetched = datetime(2026, 10, 9, 21, 0, tzinfo=TZ)
    periods = [{"period": "Ce soir et cette nuit", "temp": 3, "temp_class": "low", "summary": "Nuageux"},
               {"period": "samedi", "temp": 12, "temp_class": "high", "summary": "Averses"}]
    days = build("forecast", sig("weather.forecast.daily", periods, ts=fetched), now=fetched)["days"]
    assert [(d["label"], d["condition"]) for d in days] == [("Fri", "cloudy"), ("Sat", "rain")]


def test_forecast_missing_stale_empty_and_junk():
    assert build("forecast") is None
    stale = sig("weather.forecast.daily", om_days(date(2026, 10, 10), 3), age=3600, ttl=1800)
    assert build("forecast", stale) is None
    assert build("forecast", sig("weather.forecast.daily", [])) is None
    assert build("forecast", sig("weather.forecast.daily", "sunny")) is None
    assert build("forecast", sig("weather.forecast.daily", [1, "x", {"no": "date"}, {"period": "Someday"}])) is None
    # a day with neither temps nor condition is skipped
    assert build("forecast", sig("weather.forecast.daily", [{"date": "2026-10-10"}])) is None


def test_forecast_wall_visibility_and_custom_id():
    s = sig("envcan.forecast.daily", om_days(date(2026, 10, 10), 2), vis="wall")
    assert build("forecast", s) is None
    p = build("forecast", s, cfg=cfg_with(forecast={"daily": "envcan.forecast.daily"}))
    assert len(p["days"]) == 2


# ============================================================================== calendar

def ev(title, start, end=None, *, all_day=False, location=None):
    e = {"title": title, "start": start, "end": end, "all_day": all_day}
    if location is not None:
        e["location"] = location
    return e


def test_calendar_today_local_sorted():
    events = [
        ev("Dentist", "2026-10-10T15:00:00-04:00", "2026-10-10T16:00:00-04:00", location="Pembroke"),
        ev("Standup", "2026-10-10T13:00:00Z", "2026-10-10T13:15:00Z", location="  "),   # 09:00 local
        ev("Thanksgiving prep", "2026-10-10T00:00:00-04:00", "2026-10-11T00:00:00-04:00", all_day=True),
        ev("Early run", "2026-10-10T06:00:00-04:00", "2026-10-10T07:00:00-04:00"),       # over, still today
        ev("Yesterday", "2026-10-09T10:00:00-04:00", "2026-10-09T11:00:00-04:00"),
        ev("Tomorrow", "2026-10-11T10:00:00-04:00", "2026-10-11T11:00:00-04:00"),
        ev("Tomorrow all day", "2026-10-11", "2026-10-12", all_day=True),
        ev("Trip", "2026-10-08T09:00:00-04:00", "2026-10-12T17:00:00-04:00"),              # spans today
        ev(None, "2026-10-10T20:00:00-04:00", "2026-10-10T21:00:00-04:00"),
    ]
    p = build("calendar", sig("calendar.today", events, age=60))
    assert p["title"] == "Today"
    assert [e["title"] for e in p["events"]] == ["Trip", "Thanksgiving prep", "Early run", "Standup",
                                                 "Dentist", "Busy"]
    standup = p["events"][3]
    assert standup == {"title": "Standup", "start": "2026-10-10T09:00:00-04:00",
                       "end": "2026-10-10T09:15:00-04:00", "allDay": False}            # blank location dropped
    assert p["events"][4]["location"] == "Pembroke"
    assert p["events"][1]["allDay"] is True and p["events"][1]["start"] == "2026-10-10T00:00:00-04:00"


def test_calendar_date_only_all_day_and_missing_end():
    events = [ev("Holiday", "2026-10-10", None, all_day=True), {"title": "Ping", "start": "2026-10-10T12:00:00"}]
    p = build("calendar", sig("calendar.today", events))
    assert p["events"][0] == {"title": "Holiday", "start": "2026-10-10T00:00:00-04:00",
                              "end": "2026-10-11T00:00:00-04:00", "allDay": True}
    assert p["events"][1]["start"] == p["events"][1]["end"] == "2026-10-10T12:00:00-04:00"   # naive = local


def test_calendar_now_in_utc_uses_local_day():
    events = [ev("Late call", "2026-10-09T21:00:00-04:00", "2026-10-09T21:30:00-04:00"),
              ev("Breakfast", "2026-10-10T08:00:00-04:00", "2026-10-10T09:00:00-04:00")]
    p = build("calendar", sig("calendar.today", events, now=datetime(2026, 10, 10, 2, 0, tzinfo=UTC)),
              now=datetime(2026, 10, 10, 2, 0, tzinfo=UTC))
    assert [e["title"] for e in p["events"]] == ["Late call"]


def test_calendar_other_timezone_config():
    events = [ev("Call", "2026-10-10T02:00:00Z", "2026-10-10T03:00:00Z")]       # Oct 10 in London, Oct 9 in Toronto
    now = datetime(2026, 10, 10, 9, 0, tzinfo=UTC)
    s = sig("calendar.today", events, now=now)
    assert build("calendar", s, now=now, cfg={"location": {"timezone": "Europe/London"}})["events"][0]["start"] \
        == "2026-10-10T03:00:00+01:00"
    assert build("calendar", s, now=now)["events"] == []


def test_calendar_dst_fall_back_day_is_25_hours():
    now = datetime(2026, 11, 1, 10, 0, tzinfo=TZ)                         # Sunday, clocks went back at 02:00
    events = [ev("Night shift", "2026-11-01T01:30:00-04:00", "2026-11-01T01:45:00-04:00"),
              ev("Late", "2026-11-01T23:30:00-05:00", "2026-11-01T23:50:00-05:00"),
              ev("Next day", "2026-11-02T00:30:00-05:00", "2026-11-02T01:00:00-05:00"),
              ev("Day before", "2026-10-31T23:30:00-04:00", "2026-10-31T23:59:00-04:00")]
    p = build("calendar", sig("calendar.today", events, now=now), now=now)
    assert [(e["title"], e["start"]) for e in p["events"]] == [
        ("Night shift", "2026-11-01T01:30:00-04:00"), ("Late", "2026-11-01T23:30:00-05:00")]


def test_calendar_dst_spring_forward_day_is_23_hours():
    now = datetime(2026, 3, 8, 12, 0, tzinfo=TZ)                          # Sunday, clocks went forward at 02:00
    events = [ev("Sat late", "2026-03-07T23:30:00-05:00", "2026-03-07T23:45:00-05:00"),
              ev("Sun early", "2026-03-08T00:30:00-05:00", "2026-03-08T01:00:00-05:00"),
              ev("Sun late", "2026-03-08T23:30:00-04:00", "2026-03-08T23:45:00-04:00"),
              ev("Mon", "2026-03-09T00:15:00-04:00", "2026-03-09T00:45:00-04:00"),
              ev("All day", "2026-03-08", "2026-03-09", all_day=True)]
    p = build("calendar", sig("calendar.today", events, now=now), now=now)
    assert [e["title"] for e in p["events"]] == ["All day", "Sun early", "Sun late"]
    assert p["events"][0]["end"] == "2026-03-09T00:00:00-04:00"


def test_calendar_empty_is_an_answer_missing_or_stale_is_none():
    p = build("calendar", sig("calendar.today", []))
    assert p["events"] == []
    assert build("calendar") is None
    assert build("calendar", sig("calendar.today", [], age=1000, ttl=900)) is None
    assert build("calendar", sig("calendar.today", {"not": "a list"})) is None


def test_calendar_custom_id_and_junk_items():
    s = sig("gcal.today", [None, "x", {"title": "No start"}, ev("Ok", "2026-10-10T10:00:00-04:00",
                                                                  "2026-10-10T11:00:00-04:00")])
    assert build("calendar", s) is None
    p = build("calendar", s, cfg=cfg_with(calendar={"today": "gcal.today"}))
    assert [e["title"] for e in p["events"]] == ["Ok"]


# ============================================================================== pulse

def repo(name, pushed, commit_date=None, message="Fix the thing\n\nlong body", *, dormant=False):
    return {"repo": name, "url": f"https://github.com/{name}", "pushed_at": pushed,
            "last_commit": None if commit_date is None else {"sha": "abc1234", "message": message,
                                                             "date": commit_date, "author": "E"},
            "days_since": 1.0, "alive": not dormant, "dormant": dormant, "private": False, "open_issues": 0}


def test_pulse_from_pulse_signal():
    pulse = [repo("me/old", "2026-07-01T12:00:00Z", "2026-07-01T11:00:00Z", dormant=True),
             repo("me/wall", "2026-10-09T18:00:00Z", "2026-10-09T17:55:00Z"),
             repo("me/empty", None, None, dormant=True)]
    p = build("pulse", sig("github.pulse", pulse))
    assert p["title"] == "Project pulse"
    assert [r["name"] for r in p["repos"]] == ["me/wall", "me/old", "me/empty"]
    assert p["repos"][0] == {"name": "me/wall", "lastCommit": "2026-10-09T13:55:00-04:00",
                             "message": "Fix the thing", "pushedAt": "2026-10-09T14:00:00-04:00",
                             "status": "alive"}
    assert p["repos"][1]["status"] == "dormant"
    assert p["repos"][2] == {"name": "me/empty", "lastCommit": None, "pushedAt": None, "status": "dormant"}


def test_pulse_falls_back_to_repo_signals_and_skips_stale():
    a = sig("github.repo.me/wall", repo("me/wall", "2026-10-09T18:00:00Z", "2026-10-09T18:00:00Z"))
    b = sig("github.repo.me/stale", repo("me/stale", "2026-10-10T08:00:00Z"), age=10000, ttl=5400)
    p = build("pulse", a, b)
    assert [r["name"] for r in p["repos"]] == ["me/wall"]


def test_pulse_status_computed_when_flags_absent():
    pulse = [{"repo": "me/a", "pushed_at": "2026-10-01T00:00:00Z"},
             {"repo": "me/b", "pushed_at": "2026-08-01T00:00:00Z"},
             {"name": "me/c", "status": "dormant", "pushedAt": "2026-10-10T00:00:00Z"}]
    p = build("pulse", sig("github.pulse", pulse))
    assert {r["name"]: r["status"] for r in p["repos"]} == {"me/a": "alive", "me/b": "dormant", "me/c": "dormant"}
    p = build("pulse", sig("github.pulse", pulse), cfg=cfg_with(pulse={"dormant_days": 5}))
    assert {r["name"]: r["status"] for r in p["repos"]}["me/a"] == "dormant"


def test_pulse_missing_stale_empty_custom():
    assert build("pulse") is None
    assert build("pulse", sig("github.pulse", [])) is None
    assert build("pulse", sig("github.pulse", [repo("me/x", "2026-10-09T00:00:00Z")], age=6000, ttl=5400)) is None
    s = sig("gh.pulse", [repo("me/x", "2026-10-09T00:00:00Z")])
    assert build("pulse", s) is None
    assert build("pulse", s, cfg=cfg_with(pulse={"pulse": "gh.pulse", "repos": "gh.repo.*"}))["repos"][0]["name"] == "me/x"


# ============================================================================== finance

MONTH = {"income": 6420, "spent": 3985, "net": 2435, "balance": 20675, "month": "2026-10",
         "last_updated": "2026-10-08T21:00:00Z"}


def test_finance_full():
    p = build("finance",
              sig("finances.month", MONTH, vis="wall"),
              sig("finances.detail.expenses", [{"group": "Housing", "amount": 1800}, {"group": "Food", "amount": "$612.40"},
                                               {"group": "Fun", "amount": None}, {"group": "", "amount": 5},
                                               {"group": "Car", "amount": 1800}]),
              sig("finances.detail.income", [{"group": "Salary", "amount": 6000}, {"group": "Interest", "amount": 20}]),
              sig("rules.finances.mood", "drift", vis="wall"))
    assert {k: p[k] for k in ("income", "spent", "net", "balance", "mood", "month", "lastUpdated")} == {
        "income": 6420, "spent": 3985, "net": 2435, "balance": 20675, "mood": "drift", "month": "2026-10",
        "lastUpdated": "2026-10-08T17:00:00-04:00"}
    assert p["categories"] == [
        {"name": "Salary", "amount": 6000, "kind": "income"},
        {"name": "Car", "amount": 1800, "kind": "expense"},
        {"name": "Housing", "amount": 1800, "kind": "expense"},
        {"name": "Food", "amount": 612.4, "kind": "expense"},
        {"name": "Interest", "amount": 20, "kind": "income"},
    ]
    amounts = [c["amount"] for c in p["categories"]]
    assert amounts == sorted(amounts, reverse=True)


def test_finance_mood_fallback_net_computed_month_default():
    p = build("finance", sig("finances.month", {"income": "1,000", "spent": 1250.5}))
    assert p["net"] == -250.5 and p["mood"] == "warning" and p["categories"] == []
    assert p["month"] == "2026-10" and p["lastUpdated"] is None
    p = build("finance", sig("finances.month", {"income": 10, "spent": 5}), sig("rules.finances.mood", "bogus"))
    assert p["mood"] == "calm"


def test_finance_stale_inputs():
    month = sig("finances.month", MONTH, age=4000, ttl=2700)
    assert build("finance", month) is None
    fresh = sig("finances.month", MONTH)
    stale_detail = sig("finances.detail.expenses", [{"group": "Food", "amount": 5}], age=4000, ttl=2700)
    stale_mood = sig("rules.finances.mood", "warning", age=4000, ttl=2700)
    p = build("finance", fresh, stale_detail, stale_mood)
    assert p["categories"] == [] and p["mood"] == "calm"


def test_finance_missing_and_empty():
    assert build("finance") is None
    assert build("finance", sig("finances.month", {})) is None
    assert build("finance", sig("finances.month", None)) is None
    assert build("finance", sig("finances.detail.expenses", [{"group": "Food", "amount": 5}])) is None


def test_finance_custom_ids():
    p = build("finance", sig("budget.month", MONTH), sig("budget.cats.expenses", [{"name": "Food", "amount": 5}]),
              cfg=cfg_with(finance={"month": "budget.month", "detail": "budget.cats.*", "mood": ""}))
    assert p["categories"] == [{"name": "Food", "amount": 5, "kind": "expense"}]


# ============================================================================== news

def news_items(n, **extra):
    return [{"title": f"Headline {i}", "link": f"https://x/{i}", "published": "2026-10-10T12:00:00Z",
             "source": "CBC Ottawa", "critical": i == 0, "rank": i + 1, **extra} for i in range(n)]


def test_news_top_five():
    p = build("news", sig("rules.news.top", news_items(7), vis="wall"))
    assert p["title"] == "News"
    assert len(p["items"]) == 5
    assert p["items"][0] == {"headline": "Headline 0", "source": "CBC Ottawa",
                             "published": "2026-10-10T08:00:00-04:00", "critical": True}
    assert p["items"][1]["critical"] is False


def test_news_shapes_and_custom():
    items = [{"headline": "Already a headline", "label": "Pembroke Today"}, {"title": "  "}, "junk",
             {"title": "No date"}]
    p = build("news", sig("rules.news.top", items))
    assert p["items"] == [
        {"headline": "Already a headline", "source": "Pembroke Today", "published": None, "critical": False},
        {"headline": "No date", "source": None, "published": None, "critical": False}]
    p = build("news", sig("feeds.top", news_items(4)), cfg=cfg_with(news={"top": "feeds.top", "max_items": 2}))
    assert len(p["items"]) == 2


def test_news_missing_stale_empty():
    assert build("news") is None
    assert build("news", sig("rules.news.top", [])) is None
    assert build("news", sig("rules.news.top", news_items(2), age=4000, ttl=2700)) is None


# ============================================================================== warnings

def test_warnings_envcanada_strings():
    p = build("warnings", sig("weather.warnings", ["RAINFALL WARNING IN EFFECT", "SPECIAL WEATHER STATEMENT IN EFFECT",
                                                    "rainfall warning in effect", "Frost advisory", "Something odd"]))
    assert p["title"] == "Weather warnings"
    assert p["items"] == [
        {"headline": "RAINFALL WARNING IN EFFECT", "severity": "warning"},
        {"headline": "SPECIAL WEATHER STATEMENT IN EFFECT", "severity": "statement"},
        {"headline": "Frost advisory", "severity": "advisory"},
        {"headline": "Something odd"},
    ]


def test_warnings_dicts_with_times_and_expired_dropped():
    vals = [{"headline": "Tornado watch", "severity": "Watch", "issued": "2026-10-10T12:00:00Z",
             "expires": "2026-10-10T20:00:00Z"},
            {"description": "Old fog advisory", "expires": "2026-10-10T13:00:00Z"}]      # 09:00 local < now
    p = build("warnings", sig("weather.warnings", vals))
    assert p["items"] == [{"headline": "Tornado watch", "severity": "watch",
                           "issued": "2026-10-10T08:00:00-04:00", "expires": "2026-10-10T16:00:00-04:00"}]


def test_warnings_empty_is_an_answer_missing_or_stale_is_none():
    assert build("warnings", sig("weather.warnings", []))["items"] == []
    assert ask.panel_availability(pool_of(sig("weather.warnings", [])), NOW, CFG)[-1] == \
        {"panel": "warnings", "available": True}
    assert build("warnings") is None
    assert build("warnings", sig("weather.warnings", ["X WARNING"], age=2000, ttl=1800)) is None


# ============================================================================== availability

def test_panel_availability_mixed():
    p = pool_of(sig("weather.forecast.daily", om_days(date(2026, 10, 10), 3)),
                sig("calendar.today", []),
                sig("finances.month", MONTH, age=4000, ttl=2700))
    assert ask.panel_availability(p, NOW, CFG) == [
        {"panel": "forecast", "available": True}, {"panel": "calendar", "available": True},
        {"panel": "pulse", "available": False}, {"panel": "finance", "available": False},
        {"panel": "news", "available": False}, {"panel": "warnings", "available": False}]
