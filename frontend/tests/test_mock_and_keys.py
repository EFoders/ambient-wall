"""Mock signals (incl. the news presets), the mock fallback on file://, dev keys and the HUD."""
import pytest

from conftest import poll, real_errors

WORK = "mode=work&at=2026-10-09T11:20"
NEWS_KEYS = {"headline", "source", "published", "critical", "rank", "count"}
NEWS = """(() => { const n = __AW_FRAME.signals.news; if (!n) return null;
  return { ...n, published: n.published instanceof Date ? 'Date' : typeof n.published,
           ageMin: (__AW_FRAME.now - n.published) / 60000 }; })()"""


def news(pg):
    pg.wait_for_timeout(60)
    return pg.evaluate(NEWS)


# ---------------------------------------------------------------- news mock
def test_news_default_shape(open_page):
    pg = open_page(WORK)
    n = news(pg)
    assert set(n) - {"ageMin"} == NEWS_KEYS
    assert n["published"] == "Date"
    assert isinstance(n["headline"], str) and n["headline"] and isinstance(n["source"], str) and n["source"]
    assert n["critical"] is False and n["rank"] == 1 and n["count"] >= 1
    assert 30 < n["ageMin"] < 40


@pytest.mark.parametrize("param,check", [
    ("top", lambda n: n and not n["critical"] and "transit" in n["headline"]),
    ("critical", lambda n: n and n["critical"] is True and "Tornado" in n["headline"] and n["ageMin"] < 10),
    ("long", lambda n: n and not n["critical"] and len(n["headline"]) > 100),
    ("0", lambda n: n is None),
    ("none", lambda n: n is None),
    ("nonsense", lambda n: n and "transit" in n["headline"]),  # unknown = the default preset
])
def test_news_url_param(open_page, param, check):
    pg = open_page(f"{WORK}&news={param}")
    n = news(pg)
    assert check(n), n
    if n:
        assert n["published"] == "Date"
    assert real_errors(pg) == []


def test_b_cycles_news_presets(open_page):
    pg = open_page(WORK)
    seq = []
    for _ in range(5):
        n = news(pg)
        seq.append(None if n is None else ("critical" if n["critical"] else ("long" if len(n["headline"]) > 100 else "top")))
        pg.keyboard.press("b")
    assert seq == ["top", "critical", "long", None, "top"]
    assert pg.evaluate("AW._debug.mock.newsIdx") == 1


def test_mock_news_panel_follows_preset(open_page):
    pg = open_page(WORK + "&news=critical")
    items = pg.evaluate("AW._debug.overlay.mock('news').items")
    assert len(items) == 5 and items[0]["critical"] is True and sum(i["critical"] for i in items) == 1
    pg.keyboard.press("b")
    items = pg.evaluate("AW._debug.overlay.mock('news').items")
    assert not any(i["critical"] for i in items)


# ---------------------------------------------------------------- mock panels match the wire shapes
SHAPES = {
    "forecast": ("days", {"date", "label", "hiC", "loC", "condition"}, {"pop", "precipMm"}),
    "calendar": ("events", {"title", "start", "end", "allDay"}, {"location"}),
    "pulse": ("repos", {"name", "lastCommit", "pushedAt", "status"}, {"message"}),
    "news": ("items", {"headline", "source", "published", "critical"}, set()),
    "warnings": ("items", {"headline"}, {"severity", "issued", "expires"}),
}
ISO = r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$"


@pytest.mark.parametrize("panel", ["forecast", "calendar", "pulse", "finance", "news", "warnings"])
def test_mock_panel_shapes(open_page, panel):
    import re
    pg = open_page(WORK)
    d = pg.evaluate(f"AW._debug.overlay.mock({panel!r})")
    assert d["panel"] == panel and isinstance(d["title"], str) and re.match(ISO, d["ts"])
    if panel == "finance":
        assert {"income", "spent", "net", "balance", "mood", "month", "categories"} <= set(d)
        assert d["net"] == d["income"] - d["spent"] and d["mood"] in ("calm", "drift", "warning")
        assert re.match(r"^\d{4}-\d\d$", d["month"])
        assert all(set(c) == {"name", "amount", "kind"} for c in d["categories"])
        assert len([c for c in d["categories"] if c["kind"] == "expense"]) >= 6
        return
    key, req, opt = SHAPES[panel]
    rows = d[key]
    assert rows and all(req <= set(r) <= req | opt for r in rows), rows
    for r in rows:
        for k in ("start", "end", "published", "issued", "expires", "lastCommit", "pushedAt"):
            if k in r:
                assert re.match(ISO, r[k]), (k, r[k])
    limits = {"forecast": 7, "calendar": 6, "pulse": 5, "news": 5, "warnings": 3}
    assert len(rows) <= limits[panel]
    if panel == "forecast":
        assert len(rows) == 7 and all(r["condition"] in ("clear", "cloudy", "fog", "rain", "storm", "snow") for r in rows)
    if panel == "pulse":
        assert {r["status"] for r in rows} == {"alive", "dormant"}


def test_shown_panel_dates_are_revived(open_page):
    pg = open_page(WORK)
    pg.keyboard.press("o")
    pg.keyboard.press("o")  # calendar
    r = pg.evaluate("AW._debug.overlay.data.events.map((e) => e.start instanceof Date && e.end instanceof Date)")
    assert r and all(r)


def test_mock_finance_panel_follows_n(open_page):
    pg = open_page(WORK)
    assert pg.evaluate("AW._debug.overlay.mock('finance').mood") == "calm"
    pg.keyboard.press("n")
    assert pg.evaluate("AW._debug.overlay.mock('finance').mood") == "drift"


# ---------------------------------------------------------------- regression: mock fallback + keys + HUD
def test_file_url_falls_back_to_mock(open_page):
    pg = open_page(WORK)
    assert pg.evaluate("AW._debug.live.url") is None
    assert pg.evaluate("AW._debug.source()") == "mock"
    s = pg.evaluate("Object.keys(__AW_FRAME.signals)")
    for k in ("time", "daylight", "calendar", "heartbeat", "finances", "weather", "news"):
        assert k in s
    assert pg.evaluate("__AW_FRAME.signals.time instanceof Date && __AW_FRAME.signals.daylight.sunrise instanceof Date")
    assert real_errors(pg) == []


def test_d_w_c_n_l_keys(open_page):
    pg = open_page(WORK)
    sig = lambda e: pg.evaluate(f"(() => {{ const s = __AW_FRAME.signals; return {e}; }})()")
    assert sig("s.heartbeat[0].up") is True
    pg.keyboard.press("d"); pg.wait_for_timeout(60)
    assert sig("s.heartbeat[0].up") is False and sig("s.heartbeat[0].downSince instanceof Date")
    assert sig("s.weather.condition") == "cloudy"
    pg.keyboard.press("w"); pg.wait_for_timeout(60)
    assert sig("s.weather.condition") == "clear" and sig("s.weather.actionable") is None
    assert sig("s.calendar.next && s.calendar.next.title") == "Ops sync"
    pg.keyboard.press("c"); pg.wait_for_timeout(60)
    assert sig("s.calendar.next") is None
    assert sig("s.finances.mood") == "calm"
    pg.keyboard.press("n"); pg.wait_for_timeout(60)
    assert sig("s.finances.mood") == "drift"
    pg.keyboard.press("l"); pg.wait_for_timeout(60)  # no backend on file://: L does nothing
    assert pg.evaluate("AW._debug.source()") == "mock"
    assert real_errors(pg) == []


def test_mode_and_theme_keys(open_page):
    pg = open_page(WORK + "&theme=cyberpunk")
    pg.keyboard.press("m")  # override cycle starts from ?mode=work: work -> ambient
    assert pg.evaluate("AW._debug.modeState.override") == "ambient"
    pg.keyboard.press("2")
    assert poll(pg, "AW._debug.theme() === AW._debug.themes[1].id", timeout=3)
    pg.keyboard.press("t")
    assert poll(pg, "AW._debug.theme() === AW._debug.themes[2 % AW._debug.themes.length].id", timeout=3)


def test_hud(open_page):
    pg = open_page(WORK + "&hud=1&theme=cyberpunk&news=critical")
    text = pg.evaluate("document.getElementById('hud').textContent")
    assert pg.evaluate("getComputedStyle(document.getElementById('hud')).display") == "block"
    first = text.splitlines()[0]
    assert first.startswith("mock | cyberpunk | work (override)"), first
    assert "news CRITICAL 1/3" in first and "overlay -" in first, first
    pg.keyboard.press("b"); pg.keyboard.press("b"); pg.wait_for_timeout(80)
    assert "news none" in pg.evaluate("document.getElementById('hud').textContent")
    pg.keyboard.press("h"); pg.wait_for_timeout(60)
    assert pg.evaluate("getComputedStyle(document.getElementById('hud')).display") == "none"
