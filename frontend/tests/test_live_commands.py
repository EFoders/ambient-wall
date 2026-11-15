"""Live mode against the fake backend (tests/fake_backend.py): the wall projection (news + unknown keys pass
through, dates revived), WebSocket `command` messages, and the O key's GET /api/ask/<panel>. One optional test
drives the real container on localhost:8700 if it is up."""
import json
import time
import urllib.request

import pytest

from conftest import PANELS, poll, real_errors

LIVE = "AW._debug.source() === 'live'"


def live_page(open_page, fake, query="mode=work&at=2026-10-09T11:20"):
    pg = open_page(query, base=fake.base + "/", wait=0)
    assert poll(pg, LIVE, timeout=10), pg.evaluate("AW._debug.source()")
    return pg


# ---------------------------------------------------------------- projection
def test_projection_news_dates_and_unknown_keys(open_page, fake):
    p = {
        "calendar": {"next": None}, "heartbeat": [], "finances": None, "weather": None,
        "news": {"headline": "Tornado warning issued for Ottawa", "source": "Environment Canada",
                 "published": "2026-10-09T15:05:00-04:00", "critical": True, "rank": 1, "count": 2},
        "solar": {"watts": 512, "since": "2026-10-09T09:00:00-04:00", "note": "2026 was a good year"},
        "stale": ["solar"],
    }
    pg = live_page(open_page, fake)
    fake.ctl(projection=p)
    assert poll(pg, "__AW_FRAME.signals.news && __AW_FRAME.signals.news.critical === true", timeout=5)
    r = pg.evaluate("""(() => { const s = __AW_FRAME.signals; return {
        pub: s.news.published instanceof Date, pubIso: s.news.published.toISOString(), head: s.news.headline,
        rank: s.news.rank, count: s.news.count, solar: !!s.solar, watts: s.solar && s.solar.watts,
        since: s.solar && s.solar.since instanceof Date, note: s.solar && s.solar.note, stale: s.stale,
        fin: s.finances, time: s.time instanceof Date, dl: !!s.daylight }; })()""")
    assert r["pub"] and r["pubIso"] == "2026-10-09T19:05:00.000Z", r
    assert r["head"].startswith("Tornado") and r["rank"] == 1 and r["count"] == 2
    assert r["solar"] and r["watts"] == 512 and r["since"] and r["note"] == "2026 was a good year", r
    assert r["stale"] == ["solar"] and r["fin"] is None and r["time"] and r["dl"]
    # a projection without news: null, not undefined / stale
    p2 = {k: v for k, v in p.items() if k != "news"}
    fake.ctl(projection=p2)
    assert poll(pg, "__AW_FRAME.signals.news === null", timeout=5)
    assert real_errors(pg) == []


def test_default_projection_goes_live_with_news(open_page, fake):
    pg = live_page(open_page, fake)
    assert pg.evaluate("__AW_FRAME.signals.news.published instanceof Date")
    assert pg.evaluate("AW._debug.live.connected") is True


# ---------------------------------------------------------------- commands
NEWS_PANEL = {"panel": "news", "title": "Fake headlines", "ts": "2026-10-09T11:20:00-04:00",
              "items": [{"headline": "From the command channel", "source": "Test", "published": "2026-10-09T11:00:00-04:00",
                         "critical": False}]}


def test_command_show_uses_args_data(open_page, fake):
    pg = live_page(open_page, fake)
    fake.command("show", panel="news", duration=30, data=NEWS_PANEL)
    assert poll(pg, "AW._debug.overlay.panel === 'news'", timeout=5)
    r = pg.evaluate("""(() => { const o = AW._debug.overlay; return { title: o.data.title, origin: o.origin,
        d: o.duration, pub: o.data.items[0].published instanceof Date }; })()""")
    assert r == {"title": "Fake headlines", "origin": "command", "d": 30, "pub": True}, r
    assert poll(pg, "__AW_FRAME.overlay && __AW_FRAME.overlay.a === 1", timeout=2)
    assert pg.evaluate("AW.overlay.info.rows") == 1
    assert real_errors(pg) == []


def test_command_show_replaces_visible_panel(open_page, fake):
    pg = live_page(open_page, fake)
    fake.command("show", panel="news", duration=30, data=NEWS_PANEL)
    assert poll(pg, "__AW_FRAME.overlay && __AW_FRAME.overlay.a === 1", timeout=3)
    # a replay right after (re)connect, shortened duration, different panel
    fake.command("show", panel="warnings", duration=5, data={"panel": "warnings", "title": "W", "ts": "2026-10-09T11:20:00-04:00", "items": []})
    assert poll(pg, "AW._debug.overlay.panel === 'warnings'", timeout=3)
    r = pg.evaluate("({a: AW._debug.overlay.a, d: AW._debug.overlay.duration})")
    assert r["a"] > 0.9 and r["d"] == 5, r  # replaced in place: no fade through black
    pg.wait_for_timeout(100)
    assert pg.evaluate("AW.overlay.info.quiet") == "No active warnings"


def test_command_dismiss(open_page, fake):
    pg = live_page(open_page, fake)
    fake.command("show", panel="news", duration=30, data=NEWS_PANEL)
    assert poll(pg, "__AW_FRAME.overlay && __AW_FRAME.overlay.a === 1", timeout=3)
    fake.ctl(send={"type": "command", "name": "dismiss", "args": {}})
    assert poll(pg, "AW._debug.overlay.phase === 'out'", timeout=2)
    assert poll(pg, "__AW_FRAME.overlay === null", timeout=2.5)
    assert real_errors(pg) == []


def test_command_show_unknown_panel_and_unknown_command_ignored(open_page, fake):
    pg = live_page(open_page, fake)
    fake.command("show", panel="horoscope", duration=30, data={"panel": "horoscope"})
    fake.command("make_coffee", strength=11)
    fake.ctl(send={"type": "command"})
    time.sleep(0.5)
    assert pg.evaluate("__AW_FRAME.overlay") is None
    assert pg.evaluate("AW._debug.source()") == "live"
    assert real_errors(pg) == []


def test_command_show_without_data_shows_quiet_line(open_page, fake):
    pg = live_page(open_page, fake)
    fake.command("show", panel="calendar", duration=30)
    assert poll(pg, "AW._debug.overlay.panel === 'calendar'", timeout=3)
    pg.wait_for_timeout(100)
    assert pg.evaluate("AW.overlay.info.quiet") == "Nothing today"


def test_command_set_theme_is_a_user_choice(open_page, fake):
    pg = live_page(open_page, fake, query="mode=work")  # no ?theme: hello's display.theme (cyberpunk) applies
    assert poll(pg, "AW._debug.theme() === 'cyberpunk'", timeout=3)
    fake.command("set_theme", theme="nature")
    assert poll(pg, "AW._debug.theme() === 'nature'", timeout=4)
    assert pg.evaluate("AW._debug.live.userTheme") is True
    # a reconnect re-sends hello with display.theme = cyberpunk; the user's choice stands
    before = fake.ctl()["connects"]
    fake.ctl(kick=True)
    end = time.time() + 10
    while fake.ctl()["connects"] <= before and time.time() < end:
        time.sleep(0.2)
    assert poll(pg, LIVE, timeout=5)
    pg.wait_for_timeout(1500)
    assert pg.evaluate("AW._debug.theme()") == "nature"
    fake.command("set_theme", theme="no-such-theme")
    pg.wait_for_timeout(300)
    assert pg.evaluate("AW._debug.theme()") == "nature"
    assert real_errors(pg) == []


def test_command_set_mode(open_page, fake):
    pg = live_page(open_page, fake, query="at=2026-10-09T11:20")  # a weekday 11:20: scheduled work
    assert pg.evaluate("[__AW_FRAME.mode, AW._debug.modeState.override]") == ["work", None]
    fake.command("set_mode", mode="ambient")
    assert poll(pg, "__AW_FRAME.mode === 'ambient'", timeout=3)
    assert pg.evaluate("AW._debug.modeState.override") == "ambient"
    assert poll(pg, "__AW_FRAME.transitioning === true", timeout=2)  # the usual exhale, not a snap
    fake.command("set_mode", mode="work")
    assert poll(pg, "__AW_FRAME.mode === 'work' && AW._debug.modeState.override === 'work'", timeout=3)
    fake.command("set_mode", mode="ambient")
    fake.command("set_mode", mode="auto")
    assert poll(pg, "AW._debug.modeState.override === null && __AW_FRAME.mode === 'work'", timeout=3)
    fake.command("set_mode", mode="party")
    pg.wait_for_timeout(200)
    assert pg.evaluate("AW._debug.modeState.override") is None
    assert real_errors(pg) == []


# ---------------------------------------------------------------- O key in live mode
def test_o_key_fetches_ask_locally(open_page, fake):
    a = live_page(open_page, fake)
    b = live_page(open_page, fake)
    asks0 = fake.ctl()["asks"]["forecast"]
    a.keyboard.press("o")
    assert poll(a, "AW._debug.overlay.panel === 'forecast' && AW._debug.overlay.origin === 'ask'", timeout=5)
    d = a.evaluate("AW._debug.overlay.data")
    assert d["title"] == "Fake forecast" and d["days"][0]["label"] == "Tonight" and d["days"][0]["hiC"] is None
    assert isinstance(d["days"][0]["date"], str) and len(d["days"][0]["date"]) == 10  # plain date, not revived
    assert fake.ctl()["asks"]["forecast"] == asks0 + 1
    a.wait_for_timeout(300)
    assert a.evaluate("AW.overlay.info.rows") == 7  # a null hiC column still renders
    assert b.evaluate("__AW_FRAME.overlay") is None, "O must not broadcast"
    assert real_errors(a) == [] and real_errors(b) == []


def test_o_key_skips_unavailable_panels(open_page, fake):
    fake.ctl(avail={"calendar": False, "pulse": False})
    pg = live_page(open_page, fake)
    seen = []
    for _ in range(4):
        pg.keyboard.press("o")
        pg.wait_for_timeout(400)
        seen.append(pg.evaluate("AW._debug.overlay.panel"))
    assert seen == ["forecast", "finance", "news", "warnings"], seen


def test_o_key_falls_back_to_mock_when_ask_fails(open_page, fake):
    fake.ctl(ask_fail=True)
    pg = live_page(open_page, fake)
    pg.keyboard.press("o")
    assert poll(pg, "AW._debug.overlay.panel === 'forecast'", timeout=6)
    r = pg.evaluate("({o: AW._debug.overlay.origin, t: AW._debug.overlay.data.title, n: AW._debug.overlay.data.days.length})")
    assert r == {"o": "mock (ask failed)", "t": "7-day forecast", "n": 7}, r
    assert real_errors(pg) == [] or all("500" in e for e in real_errors(pg))  # the browser logs the failed GET


def test_o_key_null_answer_shows_quiet_line(open_page, fake):
    fake.ctl(ask={"forecast": None})
    pg = live_page(open_page, fake)
    pg.keyboard.press("o")
    assert poll(pg, "AW._debug.overlay.panel === 'forecast' && AW._debug.overlay.origin === 'ask'", timeout=5)
    pg.wait_for_timeout(200)
    assert pg.evaluate("AW.overlay.info.empty") is True


def test_url_show_fetches_in_live_mode(open_page, fake):
    pg = open_page("mode=work&show=pulse&showfor=600", base=fake.base + "/", wait=0)
    assert poll(pg, "AW._debug.overlay.panel === 'pulse'", timeout=5)
    assert poll(pg, "AW._debug.overlay.origin === 'url (ask)'", timeout=3)
    assert pg.evaluate("AW._debug.overlay.data.title") == "Fake pulse"


def test_mock_keys_and_l_on_a_live_wall(open_page, fake):
    pg = live_page(open_page, fake)
    pg.keyboard.press("d")
    assert pg.evaluate("AW._debug.source()") == "mock"
    pg.wait_for_timeout(80)
    assert pg.evaluate("__AW_FRAME.signals.heartbeat[0].up") is False
    pg.keyboard.press("l")
    assert poll(pg, LIVE, timeout=2)
    pg.keyboard.press("l")
    assert pg.evaluate("AW._debug.source()") == "mock"
    pg.keyboard.press("o")  # forced mock: panels come from the mocks, no fetch
    assert pg.evaluate("AW._debug.overlay.origin") == "mock"


# ---------------------------------------------------------------- the real container (optional)
REAL = "http://localhost:8700"


def _real_up():
    try:
        return json.loads(urllib.request.urlopen(REAL + "/api/health", timeout=1.5).read()).get("ok") is True
    except Exception:
        return False


@pytest.mark.skipif(not _real_up(), reason="backend container not reachable on localhost:8700")
def test_real_backend_show_forecast(open_page):
    pg = open_page("mode=work", base=REAL + "/", wait=0)
    assert poll(pg, LIVE, timeout=15), pg.evaluate("AW._debug.source()")
    req = urllib.request.Request(REAL + "/api/show/forecast", data=json.dumps({"duration": 30}).encode(),
                                 method="POST", headers={"Content-Type": "application/json"})
    try:
        res = json.loads(urllib.request.urlopen(req, timeout=5).read())
    except urllib.error.HTTPError as e:
        pytest.skip(f"/api/show refused ({e.code}); push_token set?")
    if res.get("shown") is False:
        pytest.skip(f"backend has no forecast: {res}")
    assert poll(pg, "AW._debug.overlay.panel === 'forecast' && AW._debug.overlay.origin === 'command'", timeout=5)
    assert poll(pg, "__AW_FRAME.overlay && __AW_FRAME.overlay.a === 1", timeout=3)
    pg.wait_for_timeout(200)
    info = pg.evaluate("({...AW.overlay.info, style: null})")
    assert info["panel"] == "forecast" and (info["rows"] > 0 or info["empty"]), info
    req = urllib.request.Request(REAL + "/api/dismiss", data=b"{}", method="POST", headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=5)
    assert poll(pg, "__AW_FRAME.overlay === null", timeout=4)
    assert real_errors(pg) == []
