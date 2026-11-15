"""Built-in rules: heartbeat_down, finance_mood, weather_actionable, leave_early."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from fnmatch import fnmatchcase
from zoneinfo import ZoneInfo

import pytest

from ambient.rules import finance_mood as fm
from ambient.rules import heartbeat_down as hb
from ambient.rules import leave_early as le
from ambient.rules import weather_actionable as wa
from ambient.rules.base import RULES
from ambient.signal import Signal

TZ = ZoneInfo("America/Toronto")
NOW = datetime(2026, 10, 9, 15, 40, tzinfo=TZ)


class FakePool:
    """In-memory PoolView: exact get, fnmatch query, staleness judged at self.now."""

    def __init__(self, now: datetime):
        self.now = now
        self.sigs: dict[str, Signal] = {}

    def add(self, sid: str, value, *, age: float = 0, ts: datetime | None = None, ttl: float | None = None,
            vis: str = "wall") -> Signal:
        source, key = sid.split(".", 1)
        s = Signal(source=source, key=key, value=value, ts=ts or self.now - timedelta(seconds=age),
                   ttl_s=ttl, visibility=vis)
        self.sigs[s.id] = s
        return s

    def remove(self, sid: str) -> None:
        self.sigs.pop(sid, None)

    def get(self, signal_id, *, include_stale=False):
        s = self.sigs.get(signal_id)
        if s is None or (not include_stale and s.is_stale(self.now)):
            return None
        return s

    def query(self, pattern="*", *, include_stale=False, visibility=None):
        return [s for i, s in sorted(self.sigs.items())
                if fnmatchcase(i, pattern) and (include_stale or not s.is_stale(self.now))
                and (visibility is None or s.visibility == visibility)]


def by_key(out):
    return {o["key"]: o["value"] for o in out}


# ------------------------------------------------------------------------------------ registry

def test_rules_registered_with_inputs():
    for name in ("heartbeat_down", "finance_mood", "weather_actionable", "leave_early"):
        assert name in RULES
    assert RULES["heartbeat_down"].every == 15
    assert RULES["heartbeat_down"].inputs == ["heartbeat.host.*"]
    assert RULES["finance_mood"].inputs == ["finances.month"]


@pytest.mark.parametrize("fn", [hb.heartbeat_down, fm.finance_mood, wa.weather_actionable, le.leave_early])
def test_disabled_rules_emit_nothing(fn):
    assert list(fn(FakePool(NOW), NOW, {"enabled": False})) == []


# ------------------------------------------------------------------------------------ heartbeat_down

@pytest.fixture(autouse=True)
def _fresh_hb_state():
    hb.reset_state()
    yield
    hb.reset_state()


def probe(pool, host, up, last_seen, *, age=0, ttl=90, ts=None):
    return pool.add(f"heartbeat.host.{host}", {"up": up, "rtt_ms": 1.2 if up else None,
                                               "last_seen": last_seen.isoformat() if last_seen else None},
                    age=age, ttl=ttl, ts=ts)


def run_hb(pool, now, cfg=None):
    pool.now = now
    return by_key(hb.heartbeat_down(pool, now, cfg or {}))


def test_heartbeat_up():
    p = FakePool(NOW)
    probe(p, "homelab", True, NOW)
    assert run_hb(p, NOW) == {"heartbeat.homelab": {"host": "homelab", "up": True, "downSince": None}}


@pytest.mark.parametrize("gap,up", [(119, True), (120, True), (121, False)])
def test_heartbeat_down_after_edge(gap, up):
    p = FakePool(NOW)
    last = NOW - timedelta(seconds=gap)
    probe(p, "homelab", False, last)
    out = run_hb(p, NOW)["heartbeat.homelab"]
    assert out["up"] is up
    assert out["downSince"] == (None if up else last.astimezone(timezone.utc).isoformat())


def test_heartbeat_after_is_configurable():
    p = FakePool(NOW)
    probe(p, "homelab", False, NOW - timedelta(seconds=40))
    assert run_hb(p, NOW, {"after": "30s"})["heartbeat.homelab"]["up"] is False
    assert run_hb(p, NOW, {"after": "1m"})["heartbeat.homelab"]["up"] is True


def test_heartbeat_never_seen_uses_first_failure():
    p = FakePool(NOW)
    t0 = NOW
    probe(p, "nas", False, None, ts=None)
    assert run_hb(p, t0)["heartbeat.nas"]["up"] is True
    # later failing probes keep the first failure as the reference
    for k in range(1, 6):
        p.now = t0 + timedelta(seconds=30 * k)
        p.add("heartbeat.host.nas", {"up": False, "rtt_ms": None, "last_seen": None}, ttl=90)
        out = run_hb(p, p.now)["heartbeat.nas"]
        assert out["up"] is (30 * k <= 120)
    assert out == {"host": "nas", "up": False, "downSince": t0.astimezone(timezone.utc).isoformat()}


def test_heartbeat_flapping_stays_up_and_recovers():
    p = FakePool(NOW)
    t = NOW
    last_ok = t
    for k in range(12):                       # alternate up/down every 30 s for 6 minutes
        t = NOW + timedelta(seconds=30 * k)
        p.now = t
        up = k % 2 == 0
        if up:
            last_ok = t
        p.add("heartbeat.host.pc", {"up": up, "rtt_ms": None, "last_seen": last_ok.isoformat()}, ttl=90)
        assert run_hb(p, t)["heartbeat.pc"]["up"] is True
    # goes down for good: down 2 min after the last success, then back up instantly
    last_ok_final = t - timedelta(seconds=30)
    for k in range(1, 6):
        t2 = t + timedelta(seconds=30 * k)
        p.add("heartbeat.host.pc", {"up": False, "rtt_ms": None, "last_seen": last_ok_final.isoformat()},
              ts=t2, ttl=90)
        out = run_hb(p, t2)["heartbeat.pc"]
    assert out["up"] is False and out["downSince"] == last_ok_final.astimezone(timezone.utc).isoformat()
    t3 = t2 + timedelta(seconds=30)
    p.add("heartbeat.host.pc", {"up": True, "rtt_ms": 1.0, "last_seen": t3.isoformat()}, ts=t3, ttl=90)
    assert run_hb(p, t3)["heartbeat.pc"] == {"host": "pc", "up": True, "downSince": None}


def test_heartbeat_stale_input_goes_down_after_grace():
    p = FakePool(NOW)
    probe(p, "homelab", True, NOW, ttl=60)      # last successful probe at NOW, then the adapter dies
    assert run_hb(p, NOW + timedelta(seconds=90))["heartbeat.homelab"]["up"] is True   # stale, within 2m
    out = run_hb(p, NOW + timedelta(seconds=121))["heartbeat.homelab"]
    assert out["up"] is False and out["downSince"] == NOW.astimezone(timezone.utc).isoformat()


def test_heartbeat_vanished_input_remembered():
    p = FakePool(NOW)
    probe(p, "homelab", True, NOW)
    run_hb(p, NOW)
    p.remove("heartbeat.host.homelab")
    assert run_hb(p, NOW + timedelta(seconds=60))["heartbeat.homelab"]["up"] is True
    assert run_hb(p, NOW + timedelta(seconds=180))["heartbeat.homelab"]["up"] is False


def test_heartbeat_configured_host_never_reporting():
    p = FakePool(NOW)
    probe(p, "homelab", True, NOW)
    cfg = {"hosts": ["main-pc", "homelab"]}
    out = hb.heartbeat_down(p, NOW, cfg)
    assert [o["key"] for o in out] == ["heartbeat.main-pc", "heartbeat.homelab"]   # config order
    assert out[0]["value"]["up"] is True
    later = NOW + timedelta(minutes=3)
    probe(p, "homelab", True, later, ts=later)
    out = by_key(hb.heartbeat_down(p, later, cfg))
    assert out["heartbeat.main-pc"] == {"host": "main-pc", "up": False,
                                        "downSince": NOW.astimezone(timezone.utc).isoformat()}


def test_heartbeat_order_and_idempotence():
    p = FakePool(NOW)
    for h in ("zeta", "alpha", "mid"):
        probe(p, h, True, NOW)
    a = hb.heartbeat_down(p, NOW, {})
    b = hb.heartbeat_down(p, NOW, {})
    assert [o["key"] for o in a] == ["heartbeat.alpha", "heartbeat.mid", "heartbeat.zeta"]
    assert a == b
    probe(p, "mid", False, NOW - timedelta(minutes=5))
    x = hb.heartbeat_down(p, NOW + timedelta(seconds=5), {})
    y = hb.heartbeat_down(p, NOW + timedelta(seconds=50), {})
    assert by_key(x)["heartbeat.mid"] == by_key(y)["heartbeat.mid"]      # downSince fixed, not "now"


def test_heartbeat_custom_input_and_forget():
    p = FakePool(NOW)
    p.add("ping.box", {"up": True, "rtt_ms": 1, "last_seen": NOW.isoformat()}, ttl=60)
    assert by_key(hb.heartbeat_down(p, NOW, {"input": "ping.*"}))["heartbeat.box"]["up"] is True
    later = NOW + timedelta(hours=25)
    p.now = later
    assert hb.heartbeat_down(p, later, {"input": "ping.*"}) == []          # removed from the source


# ------------------------------------------------------------------------------------ finance_mood

def fin(income, spent, net=None, month="2026-10"):
    return {"income": income, "spent": spent, "net": income - spent if net is None else net,
            "balance": 18240 + income - spent, "month": month, "last_updated": "2026-10-08T21:00:00Z"}


@pytest.mark.parametrize("value,now,mood", [
    (fin(6420, 3985), datetime(2026, 10, 29, 12, tzinfo=TZ), "calm"),     # core.js calm
    (fin(6420, 5870), datetime(2026, 10, 29, 12, tzinfo=TZ), "drift"),    # core.js drift (0.91 > 0.85)
    (fin(6420, 7310), datetime(2026, 10, 29, 12, tzinfo=TZ), "warning"),  # core.js warning (net < 0)
    (fin(1000, 850), datetime(2026, 10, 31, 12, tzinfo=TZ), "calm"),      # exactly 0.85 = not above
    (fin(1000, 851), datetime(2026, 10, 31, 12, tzinfo=TZ), "drift"),
    (fin(1000, 500, net=-1), datetime(2026, 10, 31, 12, tzinfo=TZ), "warning"),
    # pace: day 9 of 31 -> 0.290 + 0.15 = 0.440
    (fin(1000, 440), datetime(2026, 10, 9, 12, tzinfo=TZ), "calm"),
    (fin(1000, 450), datetime(2026, 10, 9, 12, tzinfo=TZ), "drift"),
    (fin(1000, 450, month="2026-09"), datetime(2026, 10, 9, 12, tzinfo=TZ), "calm"),   # past month: full pace
    (fin(0, 0), datetime(2026, 10, 9, 12, tzinfo=TZ), "calm"),
    (fin(0, 10, net=0), datetime(2026, 10, 9, 12, tzinfo=TZ), "drift"),
])
def test_finance_mood(value, now, mood):
    p = FakePool(now)
    p.add("finances.month", value)
    assert by_key(fm.finance_mood(p, now, {})) == {"finances.mood": mood}


def test_finance_mood_pace_uses_local_day():
    # 2026-11-01T02:00Z is still Oct 31 in Toronto: pace = 1.0, so 0.9 spent is only drift by ratio
    now = datetime(2026, 11, 1, 2, tzinfo=timezone.utc)
    assert fm.mood_for(fin(1000, 800), now, {"timezone": "America/Toronto"})[0] == "calm"
    assert fm.mood_for(fin(1000, 800, month="2026-11"), now, {"timezone": "UTC"})[0] == "drift"


def test_finance_mood_config_and_missing():
    p = FakePool(NOW)
    assert by_key(fm.finance_mood(p, NOW, {})) == {"finances.mood": None}
    p.add("sheet.month", fin(1000, 300))
    assert by_key(fm.finance_mood(p, NOW, {"input": "sheet.month"})) == {"finances.mood": "calm"}
    assert by_key(fm.finance_mood(p, NOW, {"input": "sheet.month", "drift_ratio": 0.2}))["finances.mood"] == "drift"
    assert by_key(fm.finance_mood(p, NOW, {"input": "sheet.month", "pace_tolerance": 0}))["finances.mood"] == "drift"
    p.add("sheet.month", {"income": "$6,420.00", "spent": "3,985", "month": "2026-10"})
    assert fm.mood_for(p.get("sheet.month").value, datetime(2026, 10, 30, tzinfo=TZ), {})[0] == "calm"


# ------------------------------------------------------------------------------------ weather_actionable

def weather(pool, *, cond="cloudy", intensity=0.5, temp=6, feels=None, wind=10, precip=None, kind=None,
            age=0, ttl=1800, source="weather"):
    pool.add(f"{source}.now.temp_c", temp, age=age, ttl=ttl)
    pool.add(f"{source}.now.feels_like_c", temp if feels is None else feels, age=age, ttl=ttl)
    pool.add(f"{source}.now.condition", cond, age=age, ttl=ttl)
    pool.add(f"{source}.now.intensity", intensity, age=age, ttl=ttl)
    pool.add(f"{source}.now.wind_kph", wind, age=age, ttl=ttl)
    pool.add(f"{source}.precip.next_minutes", precip, age=age, ttl=ttl)
    pool.add(f"{source}.precip.kind", kind, age=age, ttl=ttl)


@pytest.mark.parametrize("kw,expected", [
    (dict(cond="rain", intensity=0.2), "Drizzle now"),
    (dict(cond="rain", intensity=0.6), "Raining now"),
    (dict(cond="rain", intensity=None), "Raining now"),
    (dict(cond="snow", intensity=0.6, temp=-6), "Snow now"),
    (dict(cond="storm", intensity=0.95), "Thunderstorm now"),
    (dict(cond="Thunderstorm", intensity=0.95), "Thunderstorm now"),
    (dict(cond="cloudy", precip=20, kind="rain"), "Rain in 20 min"),
    (dict(cond="cloudy", precip=60, kind="snow", temp=-3), "Snow in 1 h"),
    (dict(cond="cloudy", precip=45, kind="thunderstorm"), "Thunderstorm in 45 min"),
    (dict(cond="cloudy", precip=15, kind=None, temp=-2), "Snow in 15 min"),
    (dict(cond="cloudy", precip=0, kind="rain"), "Rain soon"),
    (dict(cond="cloudy", precip=61, kind="rain"), None),
    (dict(cond="clear", intensity=0, temp=-20, feels=-24), "-24 °C, dress for it"),
    (dict(cond="clear", intensity=0, temp=-15), "-15 °C, dress for it"),
    (dict(cond="clear", intensity=0, temp=-14.4), None),
    (dict(cond="clear", intensity=0, temp=28, feels=32), "32 °C, heat"),
    (dict(cond="clear", intensity=0, temp=29.4), None),
    (dict(cond="cloudy", intensity=0.8), None),
    (dict(cond="snow", temp=-30, precip=None), "Snow now"),                  # precipitation beats cold
    (dict(cond="cloudy", temp=-30, precip=10, kind="snow"), "Snow in 10 min"),
])
def test_weather_strings(kw, expected):
    p = FakePool(NOW)
    weather(p, **kw)
    assert by_key(wa.weather_actionable(p, NOW, {})) == {"weather.actionable": expected}


def test_weather_strings_match_core_js_presets():
    presets = {   # frontend/js/core.js WEATHER
        "overcast": (dict(cond="cloudy", intensity=0.8, wind=12, temp=6, precip=20, kind="rain"), "Rain in 20 min"),
        "clear": (dict(cond="clear", intensity=0, wind=5, temp=8), None),
        "partly": (dict(cond="cloudy", intensity=0.35, wind=10, temp=7), None),
        "fog": (dict(cond="fog", intensity=0.7, wind=2, temp=4), None),
        "drizzle": (dict(cond="rain", intensity=0.2, wind=8, temp=7), "Drizzle now"),
        "rain": (dict(cond="rain", intensity=0.6, wind=18, temp=6), "Raining now"),
        "storm": (dict(cond="storm", intensity=0.95, wind=45, temp=14), "Thunderstorm now"),
        "snow": (dict(cond="snow", intensity=0.6, wind=10, temp=-6), "Snow now"),
        "cold": (dict(cond="clear", intensity=0, wind=20, temp=-24), "-24 °C, dress for it"),
    }
    for name, (kw, expected) in presets.items():
        p = FakePool(NOW)
        weather(p, **kw)
        assert wa.actionable(p, NOW, {}) == expected, name


def test_weather_countdown_from_signal_ts_and_window():
    p = FakePool(NOW)
    weather(p, precip=20, kind="rain", age=7 * 60)          # observed 7 min ago
    assert wa.actionable(p, NOW, {}) == "Rain in 13 min"
    weather(p, precip=90, kind="rain")
    assert wa.actionable(p, NOW, {}) is None
    assert wa.actionable(p, NOW, {"precip_window": "2h"}) == "Rain in 1.5 h"


def test_weather_thresholds_and_ids_configurable():
    p = FakePool(NOW)
    weather(p, cond="clear", temp=-8, source="envcan")
    assert wa.actionable(p, NOW, {"source": "envcan"}) is None
    assert wa.actionable(p, NOW, {"source": "envcan", "cold_c": -5}) == "-8 °C, dress for it"
    weather(p, cond="rain", intensity=0.4, source="envcan")
    assert wa.actionable(p, NOW, {"source": "envcan", "drizzle_below": 0.5}) == "Drizzle now"
    p.add("mystation.feels", 35)
    assert wa.actionable(p, NOW, {"ids": {"feels_like": "mystation.feels"}}) == "35 °C, heat"


def test_weather_stale_or_missing_is_null():
    p = FakePool(NOW)
    assert wa.actionable(p, NOW, {}) is None
    weather(p, cond="rain", intensity=0.6, age=3600, ttl=1800)
    assert by_key(wa.weather_actionable(p, NOW, {})) == {"weather.actionable": None}


# ------------------------------------------------------------------------------------ leave_early

def event(pool, minutes, *, location="Office", title="Ops sync", age=0):
    start = NOW + timedelta(minutes=minutes)
    v = {"title": title, "start": start.isoformat(), "end": (start + timedelta(minutes=30)).isoformat()}
    if location is not None:
        v["location"] = location
    pool.add("calendar.next", v, age=age, ttl=900)
    return start


def test_leave_early_rain_at_time():
    p = FakePool(NOW)                           # 15:40
    event(p, 40)                                # 16:20
    weather(p, precip=40, kind="rain")
    assert by_key(le.leave_early(p, NOW, {})) == {"calendar.advice": "Leave early: rain at 16:20"}
    # idempotent across the countdown
    later = NOW + timedelta(minutes=3)
    p.now = later
    assert le.advice(p, later, {}) == "Leave early: rain at 16:20"


def test_leave_early_conditions():
    p = FakePool(NOW)
    event(p, 40)
    weather(p, precip=65, kind="snow", temp=-2)                 # 16:45 <= 16:20 + 30 min
    assert le.advice(p, NOW, {}) == "Leave early: snow at 16:45"
    weather(p, precip=75, kind="rain")                          # 16:55 > 16:50
    assert le.advice(p, NOW, {}) is None
    assert le.advice(p, NOW, {"around": "40m"}) == "Leave early: rain at 16:55"
    weather(p, cond="rain", intensity=0.6, precip=None)
    assert le.advice(p, NOW, {}) == "Leave early: rain now"
    weather(p, cond="storm", intensity=0.9, precip=None)
    assert le.advice(p, NOW, {}) == "Leave early: storm now"
    weather(p, cond="cloudy", precip=None)
    assert le.advice(p, NOW, {}) is None


@pytest.mark.parametrize("minutes,location,expected", [
    (40, None, None),             # no location: nowhere to go
    (40, "  ", None),
    (40, "Microsoft Teams Meeting", None),   # virtual: nowhere to travel
    (40, "https://zoom.us/j/123", None),
    (59, "Office", "Leave early: rain at 15:50"),
    (60, "Office", None),         # not < 60 min
    (-5, "Office", None),         # already started
])
def test_leave_early_event_window(minutes, location, expected):
    p = FakePool(NOW)
    event(p, minutes, location=location)
    weather(p, precip=10, kind="rain")
    assert le.advice(p, NOW, {}) == expected


def test_leave_early_missing_inputs_and_custom_ids():
    p = FakePool(NOW)
    assert by_key(le.leave_early(p, NOW, {})) == {"calendar.advice": None}
    p.add("gcal.next", {"title": "Dentist", "start": (NOW + timedelta(minutes=30)).isoformat(),
                        "location": "Main St"})
    weather(p, precip=10, kind="rain", source="envcan")
    assert le.advice(p, NOW, {"calendar": "gcal.next", "source": "envcan"}) == "Leave early: rain at 15:50"
    p.add("gcal.next", {"title": "Holiday", "start": "2026-10-09", "location": "Home"})
    assert le.advice(p, NOW, {"calendar": "gcal.next", "source": "envcan"}) is None


def test_leave_early_virtual_list_configurable():
    p = FakePool(NOW)
    event(p, 40, location="Online store pickup, 12 Main St")
    weather(p, precip=10, kind="rain")
    assert le.advice(p, NOW, {}) is None
    assert le.advice(p, NOW, {"virtual": ["zoom"]}) == "Leave early: rain at 15:50"


# ------------------------------------------------------------------------------------ observed weather
# A forecast model's "now" can miss rain that is falling (seen in practice: Open-Meteo "Overcast,
# rain soon" while the station reported Light Rain). `observed` adds the station's now.condition.

@pytest.mark.parametrize("model,obs,expected", [
    (("cloudy", 1.0), ("rain", 0.3), ("rain", 0.3)),     # the station sees rain the model misses
    (("rain", 0.6), ("cloudy", 0.8), ("rain", 0.6)),     # the model's nowcast sees rain the hourly obs missed
    (("rain", 0.6), ("snow", 0.4), ("snow", 0.4)),       # both precipitating: the station knows which kind
    (("cloudy", 0.4), ("fog", 0.7), ("fog", 0.7)),       # fog only the station knows
    (("cloudy", 0.4), ("clear", 0.0), ("cloudy", 0.4)),  # otherwise the model (fresher, real cloud cover)
    ((None, None), ("cloudy", 0.5), ("cloudy", 0.5)),    # no model: the observation
    (("clear", 0.1), (None, None), ("clear", 0.1)),      # no observation: the model
])
def test_merge_now(model, obs, expected):
    from ambient.rules._common import merge_now
    assert merge_now(model[0], model[1], obs[0], obs[1]) == expected


def test_weather_observed_rain_is_raining_now():
    p = FakePool(NOW)
    weather(p, cond="cloudy", intensity=1.0, precip=0, kind="rain")
    assert wa.actionable(p, NOW, {}) == "Rain soon"                      # the model alone
    weather(p, cond="rain", intensity=0.3, source="ec")
    assert wa.actionable(p, NOW, {}) == "Rain soon"                      # not configured: ignored
    assert wa.actionable(p, NOW, {"observed": "ec"}) == "Raining now"
    weather(p, cond="rain", intensity=0.15, source="ec")
    assert wa.actionable(p, NOW, {"observed": "ec"}) == "Drizzle now"
    weather(p, cond="rain", intensity=0.3, source="ec", age=3 * 3600, ttl=5400)   # stale observation
    assert wa.actionable(p, NOW, {"observed": "ec"}) == "Rain soon"


def test_leave_early_counts_observed_rain():
    p = FakePool(NOW)
    p.add("calendar.next", {"title": "Dentist", "location": "Pembroke",
                            "start": (NOW + timedelta(minutes=40)).isoformat()}, ttl=900)
    weather(p, cond="cloudy", intensity=1.0)
    weather(p, cond="rain", intensity=0.3, source="ec")
    assert le.advice(p, NOW, {"observed": "ec"}).startswith("Leave early: rain now")
