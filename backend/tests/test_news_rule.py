"""news rule: age cutoff, cross-feed dedupe, ranking, local boost, critical flags, keep, inputs,
empty/stale inputs, idempotence, config validation."""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from fnmatch import fnmatchcase
from zoneinfo import ZoneInfo

import pytest

from ambient.rules import news as nw
from ambient.rules.base import RULES
from ambient.signal import Signal

TZ = ZoneInfo("America/Toronto")
NOW = datetime(2026, 10, 10, 9, 30, tzinfo=TZ)


class FakePool:
    def __init__(self, now: datetime):
        self.now = now
        self.sigs: dict[str, Signal] = {}

    def feed(self, sid: str, items: list, *, priority=None, label=None, age_s: float = 0, ttl=2700,
             vis="ask") -> Signal:
        source, key = sid.split(".", 1)
        meta = {}
        if priority is not None:
            meta["priority"] = priority
        if label is not None:
            meta["label"] = label
        s = Signal(source=source, key=key, value=items, ts=self.now - timedelta(seconds=age_s), ttl_s=ttl,
                   visibility=vis, meta=meta, type="series")
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


def item(title, age_min=None, source="CBC News", summary=None, **extra):
    it = {"title": title, "link": f"https://news.example/{abs(hash(title)) % 10000}",
          "published": None if age_min is None else (NOW - timedelta(minutes=age_min)).isoformat(),
          "source": source}
    if summary:
        it["summary"] = summary
    it.update(extra)
    return it


# local_terms defaults to none; these tests rank with a fixed set of place names unless a test overrides it
LOCAL = ["Petawawa", "Pembroke", "Renfrew", "Ottawa Valley", "Ottawa"]


def run(pool, cfg=None, now=NOW):
    out = {o["key"]: o for o in nw.news(pool, now, {"local_terms": LOCAL, **(cfg or {})})}
    return out["news.top"]["value"], out["news.critical"]["value"]


def titles(top):
    return [i["title"] for i in top]


# ------------------------------------------------------------------------------ registry / shape

def test_registered_with_default_inputs_and_interval():
    r = RULES["news"]
    assert r.inputs == ["news*.items"] and r.every == 60
    for sid in ("news.items", "news-ottawa.items", "news_cbc.items"):
        assert fnmatchcase(sid, r.inputs[0])
    assert not fnmatchcase("rules.news.top", r.inputs[0])


def test_output_shape():
    p = FakePool(NOW)
    p.feed("news.items", [item("Bank of Canada holds rate", 30, summary="Rate stays at 2.75%.")])
    out = nw.news(p, NOW, {})
    assert [o["key"] for o in out] == ["news.top", "news.critical"]
    assert out[0]["type"] == "series" and out[1]["type"] == "status"
    (top,) = out[0]["value"]
    assert top == {"title": "Bank of Canada holds rate", "source": "CBC News", "link": top["link"],
                   "published": "2026-10-10T09:00:00-04:00", "summary": "Rate stays at 2.75%.",
                   "critical": False, "priority": 0, "local": 0, "rank": 1}
    assert out[1]["value"] is False
    json.dumps(out)                                                    # JSON-clean


# ------------------------------------------------------------------------------ age cutoff

def test_age_cutoff_default_12h_and_custom():
    p = FakePool(NOW)
    p.feed("news.items", [item("Fresh story here", 60), item("Eleven hours old story", 11 * 60),
                          item("Thirteen hours old story", 13 * 60), item("Undated story stays", None)])
    top, _ = run(p)
    assert titles(top) == ["Fresh story here", "Eleven hours old story", "Undated story stays"]
    top, _ = run(p, {"max_age": "2h"})
    assert titles(top) == ["Fresh story here", "Undated story stays"]


def test_age_is_judged_at_now():
    p = FakePool(NOW)
    p.feed("news.items", [item("Story from this morning", 60)], ttl=None)
    assert titles(run(p)[0]) == ["Story from this morning"]
    later = NOW + timedelta(hours=11, minutes=30)
    assert run(p, now=later)[0] == []


# ------------------------------------------------------------------------------ dedupe

def test_cross_feed_dedupe_keeps_the_better_ranked_copy():
    p = FakePool(NOW)
    p.feed("news-ottawa.items", [item("Ottawa council approves new transit line to Kanata", 20, "CBC Ottawa")],
           priority=1)
    p.feed("news-top.items", [item("Council approves Ottawa's new transit line to Kanata", 5, "CBC News"),
                              item("Environment Canada issues tornado warning for Ottawa Valley", 10, "CBC News")])
    p.feed("news-wx.items", [item("Tornado warning issued for Ottawa Valley", 12, "Weather Network")])
    top, _ = run(p)
    assert titles(top) == ["Ottawa council approves new transit line to Kanata",       # priority 1 wins
                           "Environment Canada issues tornado warning for Ottawa Valley"]
    assert top[0]["source"] == "CBC Ottawa" and top[0]["also"] == ["CBC News"]
    assert top[1]["also"] == ["Weather Network"]


def test_dedupe_within_a_feed_and_distinct_stories_survive():
    p = FakePool(NOW)
    p.feed("news.items", [item("Senators beat Leafs 3-2 in overtime", 10),
                          item("Senators lose to Leafs 4-1", 20),
                          item("Senators beat Leafs 3-2 in overtime", 30),          # repeated in the feed
                          item("Rate cut expected next week", 40)])
    top, _ = run(p)
    assert titles(top) == ["Senators beat Leafs 3-2 in overtime", "Senators lose to Leafs 4-1",
                           "Rate cut expected next week"]
    assert "also" not in top[0]                                       # same source isn't listed twice


def test_similarity_and_tokens():
    t = nw.tokens
    assert t("Ottawa's new transit line") == t("ottawa new TRANSIT lines")
    assert t("Montréal votes") == t("Montreal vote")
    assert nw.similarity(t("Tornado warning issued for Ottawa Valley"),
                         t("Environment Canada issues tornado warning for Ottawa Valley")) >= 0.75
    assert nw.similarity(t("Senators beat Leafs"), t("Senators lose to Leafs")) < 0.75
    assert nw.similarity(t("a b"), t("")) == 0.0
    assert nw.similarity(frozenset(), frozenset()) == 1.0


def test_dedupe_threshold_is_configurable():
    p = FakePool(NOW)
    p.feed("news.items", [item("Senators beat Leafs in overtime", 10), item("Senators lose to Leafs", 20)])
    assert len(run(p)[0]) == 2
    assert len(run(p, {"dedupe_threshold": 0.5})[0]) == 1
    p.feed("news.items", [item("Senators beat Leafs", 10), item("Leafs beat Senators", 20)])
    assert len(run(p, {"dedupe_threshold": 1.0})[0]) == 1                # identical token sets


# ------------------------------------------------------------------------------ ranking

def test_ranking_priority_then_local_then_recency():
    p = FakePool(NOW)
    p.feed("news-a.items", [item("National story newest", 5, "A"),
                            item("Pembroke story older", 120, "A"),
                            item("National story older", 60, "A"),
                            item("Undated national story", None, "A")])
    p.feed("news-b.items", [item("Priority feed old story", 600, "B")], priority=3)
    top, _ = run(p, {"keep": 10})
    assert titles(top) == ["Priority feed old story",       # priority first, however old
                           "Pembroke story older",          # then local relevance
                           "National story newest",         # then recency
                           "National story older",
                           "Undated national story"]        # undated last
    assert [i["rank"] for i in top] == [1, 2, 3, 4, 5]
    assert top[0]["priority"] == 3 and top[1]["local"] == 2


def test_local_boost_title_beats_summary_beats_none():
    p = FakePool(NOW)
    p.feed("news.items", [item("Hospital opens new wing", 5),
                          item("Bridge repairs begin", 50, summary="Work starts near Renfrew on Monday."),
                          item("Petawawa base hosts open house", 90),
                          item("Ottawa Valley farmers report bumper crop", 100)])
    top, _ = run(p)
    assert [(i["title"], i["local"]) for i in top] == [
        ("Petawawa base hosts open house", 2), ("Ottawa Valley farmers report bumper crop", 2),
        ("Bridge repairs begin", 1), ("Hospital opens new wing", 0)]
    top, _ = run(p, {"local_terms": ["Hospital"]})
    assert top[0]["title"] == "Hospital opens new wing"
    top, _ = run(p, {"local_terms": []})
    assert titles(top)[0] == "Hospital opens new wing" and all(i["local"] == 0 for i in top)


def test_item_priority_overrides_feed_and_label_fills_source():
    p = FakePool(NOW)
    p.feed("news.items", [{"title": "Plain item", "published": NOW.isoformat()},
                          {"title": "Pushed alert", "published": NOW.isoformat(), "priority": 5}],
           priority=1, label="My Feed")
    top, _ = run(p)
    assert [(i["title"], i["priority"], i["source"]) for i in top] == [
        ("Pushed alert", 5, "My Feed"), ("Plain item", 1, "My Feed")]


def test_future_dated_items_do_not_outrank_as_newest_forever():
    p = FakePool(NOW)
    p.feed("news.items", [item("Scheduled post from the future", -600), item("Just published", 1)])
    top, _ = run(p)
    assert titles(top) == ["Scheduled post from the future", "Just published"]   # clamped to now: tie
    p.feed("news.items", [item("Scheduled post from the future", -600), item("Published just now", 0)])
    assert titles(run(p)[0]) == ["Published just now", "Scheduled post from the future"]  # title order on tie


# ------------------------------------------------------------------------------ critical

def test_critical_by_term():
    p = FakePool(NOW)
    p.feed("news.items", [item("Bank of Canada holds rate", 5),
                          item("Tornado warning issued for Renfrew County, take shelter", 10),
                          item("Heat warnings in effect across Ontario", 15),
                          item("Boil-water advisory lifted in Arnprior", 20),
                          item("Forewarned is forearmed, says coach", 25),
                          item("Old evacuation order story", 4 * 60)])
    top, crit = run(p, {"keep": 10})
    flags = {i["title"]: i["critical"] for i in top}
    assert flags == {"Bank of Canada holds rate": False,
                     "Tornado warning issued for Renfrew County, take shelter": True,
                     "Heat warnings in effect across Ontario": True,              # plural
                     "Boil-water advisory lifted in Arnprior": True,              # hyphen = space
                     "Forewarned is forearmed, says coach": False,                # whole words only
                     "Old evacuation order story": False}                         # older than 3h
    assert crit is True
    top, _ = run(p, {"keep": 10, "critical_max_age": "5h"})
    assert {i["title"]: i["critical"] for i in top}["Old evacuation order story"] is True


def test_critical_terms_configurable_and_undated_not_critical_by_term():
    p = FakePool(NOW)
    p.feed("news.items", [item("Tornado warning issued", 5), item("Power outage hits Pembroke", 10),
                          item("Undated tornado warning", None)])
    top, _ = run(p, {"critical_terms": ["power outage"]})
    assert {i["title"]: i["critical"] for i in top} == {
        "Tornado warning issued": False, "Power outage hits Pembroke": True, "Undated tornado warning": False}


def test_critical_by_priority():
    p = FakePool(NOW)
    p.feed("news.items", [item("Ordinary headline", 1)])
    p.feed("news-alerts.items", [item("Alert from the alerts feed", 30, "Alerts"),
                                 item("Undated alert", None, "Alerts")], priority=10)
    top, crit = run(p)
    assert [(i["title"], i["critical"]) for i in top] == [
        ("Alert from the alerts feed", True), ("Undated alert", True), ("Ordinary headline", False)]
    assert crit is True
    top, crit = run(p, {"critical_priority": 11})
    assert crit is False and not any(i["critical"] for i in top)


def test_critical_is_never_cut_by_keep():
    p = FakePool(NOW)
    p.feed("news-a.items", [item(f"Priority story number {n}", n, "A") for n in range(1, 6)], priority=2)
    p.feed("news-b.items", [item("Lockdown at Renfrew high school lifted", 50, "B"),
                            item("Another ordinary story", 2, "B")])
    top, crit = run(p, {"keep": 3})
    assert titles(top) == ["Priority story number 1", "Priority story number 2",
                           "Lockdown at Renfrew high school lifted"]
    assert [i["rank"] for i in top] == [1, 2, 3] and crit is True


def test_critical_flag_merges_through_dedupe():
    p = FakePool(NOW)
    p.feed("news-a.items", [item("Evacuation ordered near Renfrew wildfire", 200, "A")], priority=1)
    p.feed("news-b.items", [item("Evacuation ordered near Renfrew wildfire", 30, "B")])
    top, crit = run(p)                    # the kept copy is too old to be critical; the dupe is fresh
    assert len(top) == 1 and top[0]["source"] == "A" and top[0]["critical"] is True and crit is True


# ------------------------------------------------------------------------------ keep / inputs

def test_keep_limits_the_list():
    p = FakePool(NOW)
    subjects = ["Budget", "Hockey", "Transit", "Weather", "Housing", "Schools", "Hospital", "Election", "Wildfire"]
    p.feed("news.items", [item(f"{s} update {n}", n) for n, s in enumerate(subjects)])
    assert len(run(p)[0]) == 5
    assert len(run(p, {"keep": 2})[0]) == 2


def test_inputs_override_and_non_matching_sources_ignored():
    p = FakePool(NOW)
    p.feed("news.items", [item("From the news source", 5)])
    p.feed("headlines.items", [item("From the headlines source", 5)])
    p.feed("weather.items", [item("Not a news feed", 5)])
    assert titles(run(p)[0]) == ["From the news source"]
    assert titles(run(p, {"inputs": ["headlines.items"]})[0]) == ["From the headlines source"]
    both = run(p, {"inputs": ["news*.items", "headlines.items", "news.items"]})[0]
    assert sorted(titles(both)) == ["From the headlines source", "From the news source"]   # no double count


# ------------------------------------------------------------------------------ empty / stale

def test_empty_inputs():
    assert run(FakePool(NOW)) == ([], False)
    p = FakePool(NOW)
    p.feed("news.items", [])
    assert run(p) == ([], False)
    p.feed("news.items", "not a list")
    assert run(p) == ([], False)
    p.feed("news.items", [None, 3, {"title": "   "}, {"link": "https://x.example"}, {"headline": "Pushed headline"}])
    assert titles(run(p)[0]) == ["Pushed headline"]


def test_stale_inputs_are_ignored():
    p = FakePool(NOW)
    p.feed("news-old.items", [item("From a feed that stopped updating", 5)], age_s=3600, ttl=2700)
    p.feed("news.items", [item("From a live feed", 5)])
    assert titles(run(p)[0]) == ["From a live feed"]
    p.sigs.pop("news.items")
    assert run(p) == ([], False)


def test_disabled():
    p = FakePool(NOW)
    p.feed("news.items", [item("Story", 5)])
    assert nw.news(p, NOW, {"enabled": False}) == []


# ------------------------------------------------------------------------------ idempotence

def test_idempotent_and_pure():
    p = FakePool(NOW)
    p.feed("news-ottawa.items", [item("Ottawa council approves new transit line", 20, "CBC Ottawa"),
                                 item("Tornado warning for Renfrew County", 3, "CBC Ottawa")], priority=1)
    p.feed("news-top.items", [item("Council approves new Ottawa transit line", 5, "CBC News"),
                              item("Jobless rate dips", 50, "CBC News")])
    before = {k: v.model_dump() for k, v in p.sigs.items()}
    a = nw.news(p, NOW, {})
    b = nw.news(p, NOW, {})
    assert a == b
    assert {k: v.model_dump() for k, v in p.sigs.items()} == before            # inputs untouched
    # a later run with nothing new (and nothing crossing an age limit) is the same value
    assert nw.news(p, NOW + timedelta(minutes=10), {}) == a
    assert json.loads(json.dumps(a)) == a


def test_bad_config_is_a_clear_error():
    p = FakePool(NOW)
    for cfg, key in (({"max_age": "soon"}, "max_age"), ({"keep": 0}, "keep"), ({"keep": "5"}, "keep"),
                     ({"dedupe_threshold": 1.5}, "dedupe_threshold"), ({"local_terms": "Ottawa"}, "local_terms"),
                     ({"critical_priority": "high"}, "critical_priority"), ({"rotate_s": 0}, "rotate_s"),
                     ({"inputs": [""]}, "inputs"), ({"critical_max_age": 0}, "critical_max_age")):
        with pytest.raises(nw.NewsConfigError, match=key):
            nw.news(p, NOW, cfg)


def test_settings_defaults():
    st = nw.settings({})
    assert st.inputs == ("news*.items",) and st.max_age_s == 12 * 3600 and st.keep == 5
    assert st.dedupe_threshold == 0.75 and st.critical_priority == 10 and st.critical_max_age_s == 3 * 3600
    assert st.rotate_top == 3 and st.rotate_s == 60
    assert st.local_terms == () and "tornado" in st.critical_terms and "boil water" in st.critical_terms
    assert nw.settings({"rotate_s": "2m"}).rotate_s == 120
