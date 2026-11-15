"""ambient.wall.project: pool -> the exact `signals` shape the frontend themes consume."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from fnmatch import fnmatchcase
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from ambient import wall
from ambient.rules import finance_mood as fm
from ambient.rules import heartbeat_down as hb
from ambient.rules import leave_early as le
from ambient.rules import weather_actionable as wa
from ambient.signal import Signal, coerce

TZ = ZoneInfo("America/Toronto")
NOW = datetime(2026, 10, 29, 15, 40, tzinfo=TZ)
UTC = timezone.utc

CFG = {
    "location": {"name": "Petawawa", "lat": 45.898, "lon": -77.283, "timezone": "America/Toronto"},
    "source": [{"name": "heartbeat", "type": "ping", "hosts": {"homelab": "192.168.1.10",
                                                               "main-pc": "192.168.1.20"}}],
    "rules": {},
}

# Built from frontend/js/core.js mock signals(): calendar 47 min out, homelab down 4 min, finance "calm",
# weather preset "overcast". Dates carry the local offset.
GOLDEN = json.loads("""
{
  "calendar":  {"next": {"title": "Ops sync", "start": "2026-10-29T16:27:00-04:00"}},
  "heartbeat": [{"host": "homelab", "up": false, "downSince": "2026-10-29T15:36:00-04:00"},
                {"host": "main-pc", "up": true, "downSince": null}],
  "finances":  {"income": 6420, "spent": 3985, "net": 2435, "balance": 20675,
                "lastUpdated": "2026-10-28T13:40:00-04:00", "mood": "calm"},
  "weather":   {"tempC": 6, "actionable": "Rain in 20 min", "condition": "cloudy", "intensity": 0.8, "windKph": 12},
  "nowPlaying": null,
  "news":      null,
  "stale":     []
}
""")


class FakePool:
    def __init__(self, now: datetime):
        self.now = now
        self.sigs: dict[str, Signal] = {}

    def add(self, sid, value, *, age=0, ttl=None, vis="wall", ts=None):
        source, key = sid.split(".", 1)
        s = Signal(source=source, key=key, value=value, ts=ts or self.now - timedelta(seconds=age),
                   ttl_s=ttl, visibility=vis)
        self.sigs[s.id] = s
        return s

    def publish(self, sig: Signal):
        self.sigs[sig.id] = sig

    def get(self, signal_id, *, include_stale=False):
        s = self.sigs.get(signal_id)
        if s is None or (not include_stale and s.is_stale(self.now)):
            return None
        return s

    def query(self, pattern="*", *, include_stale=False, visibility=None):
        return [s for i, s in sorted(self.sigs.items())
                if fnmatchcase(i, pattern) and (include_stale or not s.is_stale(self.now))
                and (visibility is None or s.visibility == visibility)]


@pytest.fixture(autouse=True)
def _fresh_hb_state():
    hb.reset_state()
    yield
    hb.reset_state()


def utc(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def run_rules(pool, now, cfg=CFG):
    """What the scheduler does: run every built-in rule, publish outputs as source "rules"."""
    for name, fn, every in (("heartbeat_down", hb.heartbeat_down, 15), ("finance_mood", fm.finance_mood, 300),
                            ("weather_actionable", wa.weather_actionable, 60), ("leave_early", le.leave_early, 60)):
        rcfg = (cfg.get("rules") or {}).get(name) or {}
        for item in fn(pool, now, rcfg):
            pool.publish(coerce(dict(item, ts=now), source="rules", ttl_s=every * 3))


def mock_pool(now=NOW, *, location=None):
    p = FakePool(now)
    ev = {"title": "Ops sync", "start": utc(now + timedelta(minutes=47)),
          "end": utc(now + timedelta(minutes=77))}
    if location:
        ev["location"] = location
    p.add("calendar.next", ev, ttl=900)
    p.add("heartbeat.host.homelab", {"up": False, "rtt_ms": None, "last_seen": utc(now - timedelta(minutes=4))}, ttl=90)
    p.add("heartbeat.host.main-pc", {"up": True, "rtt_ms": 0.8, "last_seen": utc(now)}, ttl=90)
    p.add("finances.month", {"income": 6420, "spent": 3985, "net": 2435, "balance": 20675, "month": "2026-10",
                             "last_updated": utc(now - timedelta(hours=26))}, ttl=3600)
    for key, v in {"now.temp_c": 6, "now.feels_like_c": 3, "now.condition": "cloudy", "now.intensity": 0.8,
                   "now.wind_kph": 12, "precip.next_minutes": 20, "precip.kind": "rain"}.items():
        p.add(f"weather.{key}", v, ttl=1800)
    return p


def empty():
    return {"calendar": {"next": None}, "heartbeat": [], "finances": None, "weather": None, "nowPlaying": None,
            "news": None,
            "stale": []}


# ------------------------------------------------------------------------------------ golden

def test_golden_shape_from_core_js_mock():
    p = mock_pool()
    run_rules(p, NOW)
    rules_out = {i: s.value for i, s in p.sigs.items() if i.startswith("rules.") and not s.is_stale(NOW)}
    assert rules_out == {
        "rules.heartbeat.homelab": {"host": "homelab", "up": False, "downSince": "2026-10-29T19:36:00+00:00"},
        "rules.heartbeat.main-pc": {"host": "main-pc", "up": True, "downSince": None},
        "rules.finances.mood": "calm",
        "rules.weather.actionable": "Rain in 20 min",
        "rules.calendar.advice": None,                 # the mock event has no location
    }
    out = wall.project(p, NOW, CFG)
    assert json.loads(json.dumps(out)) == GOLDEN       # JSON-clean and exact


def test_shape_matches_frontend_signals_keys():
    p = mock_pool()
    run_rules(p, NOW)
    out = wall.project(p, NOW, CFG)
    assert list(out) == ["calendar", "heartbeat", "finances", "weather", "nowPlaying", "news", "stale"]
    assert set(out["calendar"]["next"]) == {"title", "start"}          # minutesUntil is the browser's
    assert all(set(h) == {"host", "up", "downSince"} for h in out["heartbeat"])
    assert set(out["finances"]) == {"income", "spent", "net", "balance", "lastUpdated", "mood"}
    assert set(out["weather"]) == {"tempC", "actionable", "condition", "intensity", "windKph"}


def test_deterministic_and_pure():
    p = mock_pool()
    run_rules(p, NOW)
    before = {k: v.model_dump() for k, v in p.sigs.items()}
    assert wall.project(p, NOW, CFG) == wall.project(p, NOW, CFG)
    assert {k: v.model_dump() for k, v in p.sigs.items()} == before


def test_empty_pool():
    assert wall.project(FakePool(NOW), NOW, CFG) == empty()
    assert wall.project(FakePool(NOW), NOW, {}) == empty()
    assert wall.project(FakePool(NOW), NOW, None) == empty()


def test_accepts_config_object():
    p = mock_pool()
    run_rules(p, NOW)
    assert wall.project(p, NOW, SimpleNamespace(raw=CFG)) == GOLDEN


# ------------------------------------------------------------------------------------ advice

def test_leave_early_replaces_weather_actionable():
    p = mock_pool(location="HQ, room 4")
    run_rules(p, NOW)
    out = wall.project(p, NOW, CFG)
    assert out["weather"]["actionable"] == "Leave early: rain at 16:00"
    assert out["calendar"]["next"] == GOLDEN["calendar"]["next"]          # calendar untouched
    off = dict(CFG, wall={"calendar_advice": ""})
    assert wall.project(p, NOW, off)["weather"]["actionable"] == "Rain in 20 min"


# ------------------------------------------------------------------------------------ null / stale

def test_stale_inputs_are_null_and_listed():
    later = NOW + timedelta(hours=2)          # finances (1 h) and weather (30 min) and calendar go stale
    p = mock_pool()
    run_rules(p, NOW)
    p.now = later
    out = wall.project(p, later, CFG)
    assert out["calendar"] == {"next": None}
    assert out["finances"] is None
    assert out["weather"] is None
    assert out["stale"] == ["calendar", "heartbeat", "finances", "weather"]
    # heartbeat still reported: stale probes = down 2 min after their last success
    assert [(h["host"], h["up"]) for h in out["heartbeat"]] == [("homelab", False), ("main-pc", False)]
    assert out["heartbeat"][1]["downSince"] == "2026-10-29T15:40:00-04:00"


def test_ask_signals_never_shown():
    p = FakePool(NOW)
    p.add("finances.month", {"income": 1, "spent": 0, "net": 1, "balance": 1}, vis="ask")
    p.add("calendar.next", {"title": "Secret", "start": utc(NOW + timedelta(minutes=5))}, vis="ask")
    p.add("weather.now.temp_c", 5, vis="ask")
    p.add("heartbeat.host.x", {"up": True, "last_seen": utc(NOW)}, vis="ask")
    assert wall.project(p, NOW, CFG) == empty()


def test_calendar_null_and_past_events():
    p = FakePool(NOW)
    p.add("calendar.next", None)
    assert wall.project(p, NOW, CFG)["calendar"] == {"next": None}
    p.add("calendar.next", {"title": "Done", "start": utc(NOW - timedelta(hours=1)), "end": utc(NOW - timedelta(minutes=1))})
    assert wall.project(p, NOW, CFG)["calendar"] == {"next": None}
    p.add("calendar.next", {"title": "In progress", "start": utc(NOW - timedelta(minutes=5)),
                            "end": utc(NOW + timedelta(minutes=25))})
    assert wall.project(p, NOW, CFG)["calendar"]["next"]["title"] == "In progress"
    p.add("calendar.next", {"title": "No start"})
    assert wall.project(p, NOW, CFG)["calendar"] == {"next": None}


def test_finances_mood_fallback_and_number_cleanup():
    p = FakePool(NOW)
    p.add("finances.month", {"income": "6,420.00", "spent": 7310.0, "balance": 17350, "month": "2026-10"})
    out = wall.project(p, NOW, CFG)["finances"]
    assert out == {"income": 6420, "spent": 7310, "net": -890, "balance": 17350, "lastUpdated": None,
                   "mood": "warning"}
    p.add("rules.finances.mood", "drift")
    assert wall.project(p, NOW, CFG)["finances"]["mood"] == "drift"
    p.add("rules.finances.mood", "purple")                         # garbage -> net sign
    assert wall.project(p, NOW, CFG)["finances"]["mood"] == "warning"
    p.add("finances.month", {"income": 100.1, "spent": 50.2})
    assert wall.project(p, NOW, CFG)["finances"]["net"] == 49.9
    p.add("finances.month", {"note": "nothing numeric"})
    assert wall.project(p, NOW, CFG)["finances"] is None


# ------------------------------------------------------------------------------------ heartbeat

def test_heartbeat_falls_back_to_raw_before_rule_runs():
    p = mock_pool()
    out = wall.project(p, NOW, CFG)                          # no rules.* yet
    assert out["heartbeat"] == GOLDEN["heartbeat"]


def test_heartbeat_raw_single_failed_probe_is_not_down():
    p = FakePool(NOW)
    p.add("heartbeat.host.homelab", {"up": False, "rtt_ms": None, "last_seen": utc(NOW - timedelta(seconds=30))}, ttl=90)
    assert wall.project(p, NOW, CFG)["heartbeat"] == [{"host": "homelab", "up": True, "downSince": None}]
    cfg = dict(CFG, rules={"heartbeat_down": {"after": "10s"}})
    assert wall.project(p, NOW, cfg)["heartbeat"][0]["up"] is False


def test_heartbeat_merges_rule_and_raw_and_orders():
    p = FakePool(NOW)
    p.add("rules.heartbeat.main-pc", {"host": "main-pc", "up": True, "downSince": None}, ttl=45)
    p.add("heartbeat.host.main-pc", {"up": True, "last_seen": utc(NOW)}, ttl=90)
    p.add("heartbeat.host.homelab", {"up": True, "last_seen": utc(NOW)}, ttl=90)
    p.add("heartbeat.host.aaa", {"up": True, "last_seen": utc(NOW)}, ttl=90)
    hosts = [h["host"] for h in wall.project(p, NOW, CFG)["heartbeat"]]
    assert hosts == ["homelab", "main-pc", "aaa"]            # source config order, then by name
    cfg = dict(CFG, rules={"heartbeat_down": {"hosts": ["aaa", "main-pc"]}})
    assert [h["host"] for h in wall.project(p, NOW, cfg)["heartbeat"]] == ["aaa", "main-pc", "homelab"]
    assert [h["host"] for h in wall.project(p, NOW, {})["heartbeat"]] == ["aaa", "homelab", "main-pc"]


def test_heartbeat_rule_output_wins_and_stale_rule_output_ignored():
    p = FakePool(NOW)
    p.add("heartbeat.host.homelab", {"up": True, "last_seen": utc(NOW)}, ttl=90)
    p.add("rules.heartbeat.homelab", {"host": "homelab", "up": False, "downSince": utc(NOW - timedelta(minutes=3))}, ttl=45)
    assert wall.project(p, NOW, CFG)["heartbeat"] == [
        {"host": "homelab", "up": False, "downSince": "2026-10-29T15:37:00-04:00"}]
    p.add("rules.heartbeat.homelab", {"host": "homelab", "up": False, "downSince": None}, ttl=45, age=60)
    assert wall.project(p, NOW, CFG)["heartbeat"] == [{"host": "homelab", "up": True, "downSince": None}]


# ------------------------------------------------------------------------------------ weather

def test_weather_partial_inputs_and_defaults():
    p = FakePool(NOW)
    p.add("weather.now.condition", "rain", ttl=600)
    out = wall.project(p, NOW, CFG)["weather"]
    # rule not run yet: actionable computed directly with the same logic
    assert out == {"tempC": None, "actionable": "Raining now", "condition": "rain", "intensity": 0.5, "windKph": 0}
    p = FakePool(NOW)
    p.add("weather.now.temp_c", 4.5)
    assert wall.project(p, NOW, CFG)["weather"] == {"tempC": 4.5, "actionable": None, "condition": "clear",
                                                     "intensity": 0.0, "windKph": 0}


@pytest.mark.parametrize("raw,cond,intensity", [
    ("Overcast", "cloudy", 1.0), ("tornado", "clear", 1.0), ("fog", "fog", 1.0)])
def test_weather_condition_normalised_and_intensity_clamped(raw, cond, intensity):
    p = FakePool(NOW)
    p.add("weather.now.temp_c", 3)
    p.add("weather.now.condition", raw)
    p.add("weather.now.intensity", 1.7)
    out = wall.project(p, NOW, CFG)["weather"]
    assert out["condition"] == cond and out["intensity"] == intensity
    p.add("weather.now.intensity", -0.3)
    assert wall.project(p, NOW, CFG)["weather"]["intensity"] == 0.0


def test_weather_actionable_null_still_renders_scene_and_disabled_rule_has_no_fallback():
    p = FakePool(NOW)
    p.add("weather.now.condition", "snow")
    p.add("rules.weather.actionable", None, ttl=180)
    out = wall.project(p, NOW, CFG)["weather"]
    assert out["condition"] == "snow" and out["actionable"] is None
    p.sigs.pop("rules.weather.actionable")
    assert wall.project(p, NOW, CFG)["weather"]["actionable"] == "Snow now"
    cfg = dict(CFG, rules={"weather_actionable": {"enabled": False}})
    assert wall.project(p, NOW, cfg)["weather"]["actionable"] is None


def test_weather_stale_actionable_rule_output_falls_back():
    p = FakePool(NOW)
    p.add("weather.now.condition", "cloudy", ttl=600)
    p.add("rules.weather.actionable", "Raining now", ttl=180, age=600)    # old rule output
    assert wall.project(p, NOW, CFG)["weather"]["actionable"] is None


# ------------------------------------------------------------------------------------ timezone

def test_timezone_formatting():
    p = FakePool(NOW)
    p.add("calendar.next", {"title": "Winter", "start": "2026-12-01T14:00:00Z"})
    assert wall.project(p, NOW, CFG)["calendar"]["next"]["start"] == "2026-12-01T09:00:00-05:00"   # EST
    p.add("calendar.next", {"title": "Naive", "start": "2026-10-29T18:00:00"})                      # local
    assert wall.project(p, NOW, CFG)["calendar"]["next"]["start"] == "2026-10-29T18:00:00-04:00"
    paris = dict(CFG, location={"timezone": "Europe/Paris"})
    p.add("calendar.next", {"title": "Paris", "start": "2026-10-29T20:00:00Z"})
    assert wall.project(p, NOW, paris)["calendar"]["next"]["start"] == "2026-10-29T21:00:00+01:00"
    # no timezone configured: the tz of `now`
    now_utc = NOW.astimezone(UTC)
    assert wall.project(p, now_utc, {})["calendar"]["next"]["start"] == "2026-10-29T20:00:00+00:00"


# ------------------------------------------------------------------------------------ bindings

def test_custom_wall_bindings():
    p = FakePool(NOW)
    p.add("gcal.next", {"title": "Dentist", "start": utc(NOW + timedelta(minutes=30))})
    p.add("ping.nas", {"up": True, "last_seen": utc(NOW)}, ttl=90)
    p.add("sheet.month", {"income": 10, "spent": 4, "net": 6, "balance": 100, "last_updated": "2026-10-29"})
    p.add("sheet.mood", "drift")
    p.add("envcan.temp", -3)
    p.add("envcan.sky", "snow")
    p.add("envcan.amount", 0.4)
    p.add("envcan.wind", 22)
    p.add("my.sliver", "Snow now")
    cfg = dict(CFG, wall={
        "calendar": "gcal.next", "heartbeat": "rules.hb.*", "heartbeat_raw": "ping.*",
        "finances": "sheet.month", "finance_mood": "sheet.mood",
        "weather_temp": "envcan.temp", "weather_condition": "envcan.sky", "weather_intensity": "envcan.amount",
        "weather_wind": "envcan.wind", "weather_actionable": "my.sliver",
    })
    out = wall.project(p, NOW, cfg)
    assert out == {
        "calendar": {"next": {"title": "Dentist", "start": "2026-10-29T16:10:00-04:00"}},
        "heartbeat": [{"host": "nas", "up": True, "downSince": None}],
        "finances": {"income": 10, "spent": 4, "net": 6, "balance": 100,
                     "lastUpdated": "2026-10-29T00:00:00-04:00", "mood": "drift"},
        "weather": {"tempC": -3, "actionable": "Snow now", "condition": "snow", "intensity": 0.4, "windKph": 22},
        "nowPlaying": None,
        "news": None,
        "stale": [],
    }


def test_describe():
    d = wall.describe()
    assert d["calendar"] == ["calendar.next", "rules.calendar.advice"]
    assert d["heartbeat"] == ["rules.heartbeat.*", "heartbeat.host.*"]
    assert d["finances"] == ["finances.month", "rules.finances.mood"]
    assert "weather.now.condition" in d["weather"]
    assert wall.describe({"wall": {"calendar": "gcal.next", "calendar_advice": ""}})["calendar"] == ["gcal.next"]


def test_weather_observed_rain_wins_over_the_model():
    """[wall] weather_obs_condition / _intensity: a station reporting rain makes the scene rain even while
    the forecast model says overcast; without the bindings the model alone decides."""
    p = FakePool(NOW)
    p.add("weather.now.condition", "cloudy", ttl=1800)
    p.add("weather.now.intensity", 1.0, ttl=1800)
    p.add("ec.now.condition", "rain", ttl=5400, age=40 * 60)       # hourly observation, 40 min old
    p.add("ec.now.intensity", 0.3, ttl=5400, age=40 * 60)
    assert wall.project(p, NOW, CFG)["weather"]["condition"] == "cloudy"
    cfg = dict(CFG, wall={"weather_obs_condition": "ec.now.condition", "weather_obs_intensity": "ec.now.intensity"},
               rules={"weather_actionable": {"observed": "ec"}})
    out = wall.project(p, NOW, cfg)["weather"]
    assert out["condition"] == "rain" and out["intensity"] == 0.3 and out["actionable"] == "Raining now"
    p.add("ec.now.condition", "cloudy", ttl=5400)                    # the station: rain over
    p.add("ec.now.intensity", 0.8, ttl=5400)
    out = wall.project(p, NOW, cfg)["weather"]
    assert out["condition"] == "cloudy" and out["intensity"] == 1.0  # back to the model's cloud cover
    assert "ec.now.condition" in wall.describe(cfg)["weather"]
