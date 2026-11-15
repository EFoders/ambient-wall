"""demo parts for the ask panels: each must emit the same keys and value shapes as the real adapter
for the same logical data (ical today, google_sheet_finances detail, open_meteo forecast, envcanada
warnings, rss items, github pulse)."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import icalendar
import pytest

from ambient.adapters._shared import OptionError
from ambient.adapters.base import AdapterContext
from ambient.adapters.demo import EXPENSES, FINANCE, INCOME, PARTS, Demo
from ambient.adapters.envcanada import parse_citypage
from ambient.adapters.github import GitHub
from ambient.adapters.google_sheet_finances import monthly_totals
from ambient.adapters.ical import compute
from ambient.adapters.open_meteo import OpenMeteo
from ambient.adapters.rss import parse_feed
from ambient.rules import news as nw
from ambient.signal import coerce

FIX = Path(__file__).parent / "fixtures"
TZ = ZoneInfo("America/Toronto")
SETTINGS = {"location": {"lat": 45.898, "lon": -77.283, "timezone": "America/Toronto"}}
T0 = datetime(2026, 10, 10, 13, 0, tzinfo=timezone.utc)          # 09:00 local


def ctx(handler=None):
    return AdapterContext(http=httpx.AsyncClient(transport=httpx.MockTransport(handler or (lambda r: httpx.Response(599)))),
                          log=logging.getLogger("test"), data_dir=FIX, settings=SETTINGS)


async def demo(name, at=T0, **opts):
    d = Demo(name, opts, ctx())
    d.now = lambda: at
    items = await d.fetch()
    for it in items:
        coerce(it, source=name)
    return d, {i["key"]: i for i in items}


def shape(v):
    """Structural shape of a JSON value: dict keys -> shapes, lists -> shape of first element."""
    if isinstance(v, dict):
        return {k: shape(x) for k, x in v.items()}
    if isinstance(v, list):
        return [shape(v[0])] if v else []
    return type(v).__name__ if v is not None else "null"


# ------------------------------------------------------------------------------ parts / defaults

async def test_parts_default_to_source_name_and_all():
    assert PARTS == ("calendar", "heartbeat", "finances", "weather", "news", "pulse", "music")
    _, k = await demo("news")
    assert list(k) == ["items"]
    _, k = await demo("pulse")
    assert set(k) == {"pulse", "repo.demo/ambient-wall", "repo.demo/homelab", "repo.demo/dotfiles"}
    _, k = await demo("github", parts=["pulse"])
    assert "pulse" in k
    _, k = await demo("everything")
    assert {"next", "today", "host.homelab", "month", "detail.expenses", "detail.income", "forecast.daily",
            "warnings", "items", "pulse"} <= set(k)


def test_bad_new_options():
    with pytest.raises(OptionError, match="news"):
        Demo("news", {"news": "loud"}, ctx())
    with pytest.raises(OptionError, match="warnings"):
        Demo("weather", {"warnings": "yes"}, ctx())


# ------------------------------------------------------------------------------ calendar today = ical

def ics(events):
    cal = icalendar.Calendar()
    cal.add("prodid", "-//test//")
    cal.add("version", "2.0")
    for i, (title, start, end, loc) in enumerate(events):
        ev = icalendar.Event()
        ev.add("uid", f"e{i}@test")
        ev.add("summary", title)
        ev.add("dtstart", start)
        ev.add("dtend", end)
        if loc:
            ev.add("location", loc)
        cal.add_component(ev)
    return cal


async def test_calendar_today_equals_ical_for_the_same_events():
    d, k = await demo("calendar")
    assert k["today"]["visibility"] == "ask" and k["today"]["type"] == "series"
    today = k["today"]["value"]
    assert 3 <= len(today) <= 4
    local = T0.astimezone(TZ)
    day = local.date()

    def at(h, m):
        return datetime(day.year, day.month, day.day, h, m, tzinfo=TZ)
    ops = local + timedelta(minutes=47)
    cal = ics([("Standup", at(8, 30), at(8, 45), "Teams"),
               ("Lunch with Sam", at(12, 0), at(13, 0), "Mill Street Cafe"),
               ("Design review", at(14, 0), at(15, 0), None),
               ("Ops sync", ops, ops + timedelta(minutes=30), "Teams")])
    real = {i["key"]: i for i in compute(cal, T0, TZ)}
    assert today == real["today"]["value"]                         # identical, not just similar
    assert [e["title"] for e in today] == ["Standup", "Ops sync", "Lunch with Sam", "Design review"]
    assert k["next"]["value"] == real["next"]["value"]             # next agrees with ical too
    assert real["today"]["visibility"] == k["today"]["visibility"]


async def test_calendar_today_without_ops_sync_when_it_is_tomorrow_and_off():
    late = datetime(2026, 10, 11, 3, 50, tzinfo=timezone.utc)      # 23:50 local: Ops sync is tomorrow
    _, k = await demo("calendar", at=late)
    assert [e["title"] for e in k["today"]["value"]] == ["Standup", "Lunch with Sam", "Design review"]
    assert all(e["start"].startswith("2026-10-10T") for e in k["today"]["value"])
    _, k = await demo("calendar", calendar=False)
    assert list(k) == ["next"] and k["next"]["value"] is None


# ------------------------------------------------------------------------------ finances = sheet

@pytest.mark.parametrize("mood", ["calm", "drift", "warning"])
async def test_finance_detail_equals_google_sheet_monthly_totals(mood):
    _, k = await demo("finances", finance=mood)
    income, spent = FINANCE[mood]
    month = 10
    off = month - 1

    def sheet(groups):          # an Expenses/Income tab, columns C..O: group header, rows, Monthly totals
        rows = []
        for g, amt in groups:
            rows.append([g])
            rows.append(["Item"] + [amt if i == off else 0 for i in range(12)])
            rows.append(["Monthly totals"] + [amt if i == off else 0 for i in range(12)])
        return rows
    for key, groups in (("detail.expenses", EXPENSES[mood]), ("detail.income", INCOME)):
        it = k[key]
        assert it["type"] == "series" and it["visibility"] == "ask"
        assert it["value"] == monthly_totals(sheet(groups), off)
    assert sum(g["amount"] for g in k["detail.expenses"]["value"]) == spent == k["month"]["value"]["spent"]
    assert sum(g["amount"] for g in k["detail.income"]["value"]) == income == k["month"]["value"]["income"]


# ------------------------------------------------------------------------------ weather = open_meteo + envcanada

async def test_forecast_has_7_days_with_open_meteo_keys():
    _, k = await demo("weather")
    om = OpenMeteo("weather", {}, ctx())
    doc = json.loads((FIX / "open_meteo_petawawa.json").read_text())
    real = {i["key"]: i for i in om.parse(doc, datetime(2026, 10, 10, 3, 30, tzinfo=timezone.utc))}
    daily = k["forecast.daily"]["value"]
    assert len(daily) == 7
    assert [d["date"] for d in daily] == [(T0.astimezone(TZ).date() + timedelta(days=i)).isoformat() for i in range(7)]
    real_keys = set(real["forecast.daily"]["value"][0])
    assert all(set(d) == real_keys for d in daily)
    assert k["forecast.daily"]["visibility"] == real["forecast.daily"]["visibility"] == "ask"
    for d in daily:
        assert d["condition"] in ("clear", "cloudy", "fog", "rain", "storm", "snow")
        assert d["t_min"] <= d["t_max"] and 0 <= d["pop"] <= 100 and d["precip_mm"] >= 0


async def test_warnings_match_envcanada_shape():
    real = {i["key"]: i for i in parse_citypage(
        (FIX / "envcanada_petawawa_en.xml").read_bytes(), datetime(2026, 10, 10, 3, 30, tzinfo=timezone.utc))}
    _, k = await demo("weather")
    w = k["warnings"]
    assert (w["type"], w["visibility"]) == (real["warnings"]["type"], real["warnings"]["visibility"])
    assert w["value"] == [] == real["warnings"]["value"]
    _, k = await demo("weather", warnings=True)
    assert k["warnings"]["value"] == ["RAINFALL WARNING IN EFFECT"]          # same string envcanada emits
    _, k = await demo("weather", warnings=True, weather="storm")
    assert k["warnings"]["value"] == ["SEVERE THUNDERSTORM WARNING IN EFFECT"]
    _, k = await demo("weather", warnings=True, weather="cold")
    assert k["warnings"]["value"] == ["EXTREME COLD WARNING IN EFFECT"]


# ------------------------------------------------------------------------------ news = rss

async def test_news_items_match_rss_shape_and_feed_the_rule():
    d, k = await demo("news")
    it = k["items"]
    assert it["type"] == "series" and it["visibility"] == "ask"
    items = it["value"]
    _, real = parse_feed((FIX / "rss_cbc_ottawa.xml").read_bytes(), tz=TZ, label="CBC Ottawa")
    assert all(shape(i) == shape(real[0]) for i in items)                 # same keys and value types
    assert 8 <= len(items) <= 10 and {i["source"] for i in items} == {"CBC Ottawa", "CBC News"}
    pubs = [datetime.fromisoformat(i["published"]) for i in items]
    assert pubs == sorted(pubs, reverse=True)
    assert all(T0 - timedelta(hours=8) <= p <= T0 for p in pubs)
    assert len({i["link"] for i in items}) == len(items)

    from tests.test_news_rule import FakePool
    pool = FakePool(T0.astimezone(TZ))
    pool.sigs["news.items"] = coerce(it, source="news", ttl_s=15)
    from tests.test_news_rule import LOCAL
    top, crit = (o["value"] for o in nw.news(pool, pool.now, {"local_terms": LOCAL}))
    assert crit is False and len(top) == 5 and not any(i["critical"] for i in top)
    assert top[0]["title"].startswith("Ottawa council approves")          # local (Ottawa) + newest
    assert [i["local"] for i in top[:3]] == [2, 2, 2]                    # local items lead
    folded = next(i for i in top if "transit line" in i["title"])
    assert folded["also"] == ["CBC News"]                                 # cross-feed duplicate folded


async def test_news_critical_option_and_none():
    _, k = await demo("news", news="critical")
    items = k["items"]["value"]
    assert items[0]["title"] == "Tornado warning issued for Ottawa, take shelter"
    from tests.test_news_rule import FakePool
    pool = FakePool(T0.astimezone(TZ))
    pool.sigs["news.items"] = coerce(k["items"], source="news", ttl_s=15)
    top, crit = (o["value"] for o in nw.news(pool, pool.now, {}))
    assert crit is True and top[0]["critical"] is True and top[0]["title"].startswith("Tornado warning")
    _, k = await demo("news", news="none")
    assert k["items"]["value"] == []


async def test_news_is_stable_between_fetches_and_reanchors():
    d = Demo("news", {}, ctx())
    d.now = lambda: T0
    first = (await d.fetch())[0]["value"]
    d.now = lambda: T0 + timedelta(minutes=90)
    assert (await d.fetch())[0]["value"] == first                         # no churn every 5 s
    d.now = lambda: T0 + timedelta(hours=3, minutes=1)
    moved = (await d.fetch())[0]["value"]
    newest = datetime.fromisoformat(moved[0]["published"])
    assert newest == T0 + timedelta(hours=3, minutes=1) - timedelta(minutes=14)


# ------------------------------------------------------------------------------ pulse = github

async def test_pulse_matches_github_adapter_shape():
    repo = json.loads((FIX / "github_repo.json").read_text())
    commits = json.loads((FIX / "github_commits.json").read_text())

    def handler(req):
        if req.url.path.endswith("/commits"):
            return httpx.Response(200, json=commits)
        return httpx.Response(200, json=repo)
    gh = GitHub("github", {"repos": ["you/ambient-wall"]}, ctx(handler))
    gh.now = lambda: T0
    real = {i["key"]: i for i in await gh.fetch()}
    _, k = await demo("github", parts=["pulse"])

    assert {key.split(".", 1)[0] for key in k} == {key.split(".", 1)[0] for key in real} == {"repo", "pulse"}
    real_repo = real["repo.you/ambient-wall"]
    for key in ("repo.demo/ambient-wall", "repo.demo/homelab", "repo.demo/dotfiles"):
        it = k[key]
        assert (it["type"], it["visibility"]) == (real_repo["type"], real_repo["visibility"]) == ("object", "ask")
        assert shape(it["value"]) == shape(real_repo["value"])
        assert key == f"repo.{it['value']['repo'].lower()}"
    pulse = k["pulse"]
    assert (pulse["type"], pulse["visibility"]) == (real["pulse"]["type"], real["pulse"]["visibility"])
    assert [p["repo"] for p in pulse["value"]] == ["demo/ambient-wall", "demo/homelab", "demo/dotfiles"]
    assert pulse["value"] == [k[f"repo.{p['repo']}"]["value"] for p in pulse["value"]]
    assert [(p["alive"], p["dormant"]) for p in pulse["value"]] == [(True, False), (True, False), (False, True)]
    days = [p["days_since"] for p in pulse["value"]]
    assert days == sorted(days) and days == [0.2, 6.4, 74.0]
