"""wall.project `news` element: rotation as a pure function of now, critical pinning, null / stale,
custom binding, golden shape (matches frontend/js/core.js mockNews)."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from fnmatch import fnmatchcase
from zoneinfo import ZoneInfo

from ambient import wall
from ambient.rules import news as nw
from ambient.signal import Signal, coerce

TZ = ZoneInfo("America/Toronto")
# 2026-10-10 13:30:00 UTC = epoch 1791639000, a multiple of 60 -> rotation slot 29860650
NOW = datetime(2026, 10, 10, 9, 30, tzinfo=TZ)
CFG = {"location": {"timezone": "America/Toronto"}, "rules": {}}
KEYS = {"headline", "source", "published", "critical", "rank", "count"}


class FakePool:
    def __init__(self, now):
        self.now = now
        self.sigs: dict[str, Signal] = {}

    def add(self, sid, value, *, age=0, ttl=None, vis="wall", meta=None):
        source, key = sid.split(".", 1)
        s = Signal(source=source, key=key, value=value, ts=self.now - timedelta(seconds=age), ttl_s=ttl,
                   visibility=vis, meta=meta or {})
        self.sigs[s.id] = s
        return s

    def get(self, signal_id, *, include_stale=False):
        s = self.sigs.get(signal_id)
        if s is None or (not include_stale and s.is_stale(self.now)):
            return None
        return s

    def query(self, pattern="*", *, include_stale=False, visibility=None):
        return [s for i, s in sorted(self.sigs.items())
                if fnmatchcase(i, pattern) and (include_stale or not s.is_stale(self.now))
                and (visibility is None or s.visibility == visibility)]


def top_item(n, title, *, critical=False, source="CBC News", minutes=10):
    return {"title": title, "source": source, "link": f"https://news.example/{n}",
            "published": (NOW - timedelta(minutes=minutes)).astimezone(timezone.utc).isoformat(),
            "critical": critical, "priority": 0, "local": 0, "rank": n}


def five(critical_at=None):
    return [top_item(n, f"Headline {n}", critical=(n == critical_at)) for n in range(1, 6)]


def news_at(pool, now, cfg=CFG):
    return wall.project(pool, now, cfg)["news"]


# ------------------------------------------------------------------------------ rotation

def test_rotates_through_top_three_every_minute():
    p = FakePool(NOW)
    p.add("rules.news.top", five(), ttl=600)
    assert NOW.timestamp() % 60 == 0
    slot0 = int(NOW.timestamp() // 60) % 3                   # which headline this minute starts on
    seen = []
    for k in range(7):
        t = NOW + timedelta(seconds=60 * k)
        p.now = t
        seen.append(news_at(p, t)["rank"])
    expect = [((slot0 + k) % 3) + 1 for k in range(7)]
    assert seen == expect and set(seen) == {1, 2, 3}         # only the top 3, in order, wrapping
    # stable within the minute
    a = news_at(p, NOW + timedelta(seconds=1))
    b = news_at(p, NOW + timedelta(seconds=59))
    assert a == b


def test_rotation_settings_from_rules_news():
    p = FakePool(NOW)
    p.add("rules.news.top", five())
    cfg = dict(CFG, rules={"news": {"rotate_top": 5, "rotate_s": 10}})
    ranks = [news_at(p, NOW + timedelta(seconds=10 * k), cfg)["rank"] for k in range(10)]
    assert set(ranks) == {1, 2, 3, 4, 5}
    assert all(b == a % 5 + 1 for a, b in zip(ranks, ranks[1:]))
    one = dict(CFG, rules={"news": {"rotate_top": 1}})
    assert {news_at(p, NOW + timedelta(minutes=k), one)["rank"] for k in range(5)} == {1}


def test_rotation_with_fewer_items_than_rotate_top():
    p = FakePool(NOW)
    p.add("rules.news.top", five()[:2])
    ranks = {news_at(p, NOW + timedelta(minutes=k))["rank"] for k in range(6)}
    assert ranks == {1, 2}


def test_bad_rotation_config_falls_back_to_defaults():
    p = FakePool(NOW)
    p.add("rules.news.top", five())
    bad = dict(CFG, rules={"news": {"rotate_s": "never", "rotate_top": -1}})
    assert news_at(p, NOW, bad) == news_at(p, NOW, CFG)


# ------------------------------------------------------------------------------ critical

def test_critical_is_pinned_highest_ranked_first():
    p = FakePool(NOW)
    items = five(critical_at=4)
    items[4]["critical"] = True                               # rank 5 also critical
    p.add("rules.news.top", items)
    shown = {json.dumps(news_at(p, NOW + timedelta(seconds=37 * k))) for k in range(20)}
    assert len(shown) == 1
    n = json.loads(shown.pop())
    assert n["rank"] == 4 and n["critical"] is True and n["headline"] == "Headline 4"


# ------------------------------------------------------------------------------ null / stale

def test_null_when_missing_empty_or_garbage():
    p = FakePool(NOW)
    assert news_at(p, NOW) is None
    for v in ([], None, "Headline", {"title": "x"}, [None, 3, {"title": "  "}, {"link": "x"}]):
        p.add("rules.news.top", v)
        assert news_at(p, NOW) is None, v
    assert wall.project(p, NOW, CFG)["stale"] == []


def test_stale_list_is_null_and_reported():
    p = FakePool(NOW)
    p.add("rules.news.top", five(), age=200, ttl=180)
    out = wall.project(p, NOW, CFG)
    assert out["news"] is None and out["stale"] == ["news"]


def test_ask_only_signal_is_never_shown():
    p = FakePool(NOW)
    p.add("rules.news.top", five(), vis="ask")
    assert news_at(p, NOW) is None


def test_binding_off():
    p = FakePool(NOW)
    p.add("rules.news.top", five())
    assert news_at(p, NOW, dict(CFG, wall={"news": ""})) is None
    assert wall.describe(CFG)["news"] == ["rules.news.top"]
    assert wall.describe(dict(CFG, wall={"news": ""}))["news"] == []


def test_custom_binding_and_headline_items_without_rank():
    p = FakePool(NOW)
    p.add("phone.headlines", [{"headline": "  Pushed   from a phone  ", "published": "2026-10-10T13:00:00Z"},
                              {"headline": "Second pushed headline"}])
    p.add("rules.news.top", five())
    cfg = dict(CFG, wall={"news": "phone.headlines"}, rules={"news": {"rotate_top": 1}})
    assert news_at(p, NOW, cfg) == {"headline": "Pushed from a phone", "source": None,
                                    "published": "2026-10-10T09:00:00-04:00", "critical": False,
                                    "rank": 1, "count": 2}


# ------------------------------------------------------------------------------ golden

GOLDEN_NEWS = {"headline": "Ottawa council approves new transit line to Kanata after marathon debate",
               "source": "CBC Ottawa", "published": "2026-10-10T08:55:00-04:00", "critical": False,
               "rank": 1, "count": 3}


def test_golden_shape_from_the_rule():
    """Feed items -> news rule -> projection, as the scheduler does it. Shape = core.js mockNews()."""
    p = FakePool(NOW)
    p.add("news-ottawa.items", [
        {"title": "Ottawa council approves new transit line to Kanata after marathon debate",
         "link": "https://www.cbc.ca/1", "published": "2026-10-10T08:55:00-04:00", "source": "CBC Ottawa"},
        {"title": "OPP launch Thanksgiving road safety blitz", "link": "https://www.cbc.ca/2",
         "published": "2026-10-10T07:00:00-04:00", "source": "CBC Ottawa"}],
        vis="ask", ttl=2700, meta={"priority": 1})
    p.add("news-top.items", [
        {"title": "Council approves Ottawa's new transit line to Kanata", "link": "https://www.cbc.ca/3",
         "published": "2026-10-10T09:20:00-04:00", "source": "CBC News"},
        {"title": "Bank of Canada holds key interest rate", "link": "https://www.cbc.ca/4",
         "published": "2026-10-10T09:10:00-04:00", "source": "CBC News"}],
        vis="ask", ttl=2700)
    for it in nw.news(p, NOW, {}):
        p.sigs[f"rules.{it['key']}"] = coerce(dict(it, ts=NOW), source="rules", ttl_s=180)
    top = p.sigs["rules.news.top"].value
    assert [i["title"] for i in top] == ["Ottawa council approves new transit line to Kanata after marathon debate",
                                         "OPP launch Thanksgiving road safety blitz",
                                         "Bank of Canada holds key interest rate"]
    cfg = dict(CFG, rules={"news": {"rotate_top": 1}})
    out = wall.project(p, NOW, cfg)
    assert list(out) == ["calendar", "heartbeat", "finances", "weather", "nowPlaying", "news", "stale"]
    assert set(out["news"]) == KEYS
    assert json.loads(json.dumps(out["news"])) == GOLDEN_NEWS
    # the raw ask-only feeds never reach the wall themselves; only the rule's output does
    p.sigs.pop("rules.news.top")
    assert wall.project(p, NOW, cfg)["news"] is None


def test_published_is_local_iso_and_null_when_undated():
    p = FakePool(NOW)
    p.add("rules.news.top", [dict(top_item(1, "Dated"), published="2026-10-10T12:00:00+00:00"),
                             dict(top_item(2, "Undated"), published=None)])
    cfg = dict(CFG, rules={"news": {"rotate_s": 60}})
    shown = {news_at(p, NOW + timedelta(minutes=k), cfg)["headline"]: news_at(p, NOW + timedelta(minutes=k), cfg)
             for k in range(4)}
    assert shown["Dated"]["published"] == "2026-10-10T08:00:00-04:00"
    assert shown["Undated"]["published"] is None


def test_pure():
    p = FakePool(NOW)
    p.add("rules.news.top", five(critical_at=2))
    before = {k: v.model_dump() for k, v in p.sigs.items()}
    assert wall.project(p, NOW, CFG) == wall.project(p, NOW, CFG)
    assert {k: v.model_dump() for k, v in p.sigs.items()} == before
