"""signals.nowPlaying: the mock presets (P key, ?music=), the live projection (dates revived, progress advanced
locally from the backend's anchor while playing, frozen when paused, clamped to the duration, null passes through)."""
from datetime import datetime, timedelta

import pytest

from conftest import poll, real_errors

WORK = "mode=work&at=2026-10-09T11:20"
KEYS = {"title", "artist", "album", "isPlaying", "progressMs", "durationMs", "updatedAt", "source", "art"}
NP = """(() => { const n = __AW_FRAME.signals.nowPlaying; if (!n) return null;
  return { ...n, updatedAt: n.updatedAt instanceof Date ? n.updatedAt.toISOString() : 'not a Date: ' + n.updatedAt }; })()"""


def np(pg):
    pg.wait_for_timeout(40)
    return pg.evaluate(NP)


def kind(n):
    if n is None:
        return None
    if not n["isPlaying"]:
        return "paused"
    return "long" if len(n["title"]) > 80 else "playing"


# ---------------------------------------------------------------- mock
def test_mock_default_is_an_advancing_track(open_page):
    pg = open_page(WORK)
    a = np(pg)
    assert set(a) == KEYS and a["isPlaying"] is True and a["title"] == "Teardrop"
    assert not a["updatedAt"].startswith("not a Date")
    pg.wait_for_timeout(1000)
    b = np(pg)
    assert 800 < b["progressMs"] - a["progressMs"] < 1600, (a["progressMs"], b["progressMs"])
    assert b["updatedAt"] == a["updatedAt"]  # the anchor does not move
    assert 0 <= b["progressMs"] <= b["durationMs"]
    assert real_errors(pg) == []


@pytest.mark.parametrize("param,want", [("playing", "playing"), ("paused", "paused"), ("long", "long"),
                                        ("none", None), ("0", None), ("nonsense", "playing")])
def test_music_url_param(open_page, param, want):
    pg = open_page(f"{WORK}&music={param}")
    n = np(pg)
    assert kind(n) == want, n
    if want == "long":
        assert len(n["artist"]) > 60
    if want == "paused":
        p0 = n["progressMs"]
        pg.wait_for_timeout(600)
        assert np(pg)["progressMs"] == p0  # frozen


def test_p_cycles_presets(open_page):
    pg = open_page(WORK + "&hud=1")
    seq = []
    for _ in range(5):
        seq.append(kind(np(pg)))
        pg.keyboard.press("p")
    assert seq == ["playing", "paused", "long", None, "playing"]
    pg.wait_for_timeout(80)  # the last press left it on paused (0:47 of 2:05)
    assert "music paused 0:47/2:05" in pg.evaluate("document.getElementById('hud').textContent")


# ---------------------------------------------------------------- live
def live_page(open_page, fake, query=WORK):
    pg = open_page(query, base=fake.base + "/", wait=0)
    assert poll(pg, "AW._debug.source() === 'live'", timeout=10), pg.evaluate("AW._debug.source()")
    return pg


def iso_ms(dt):
    return dt.isoformat(timespec="milliseconds")


def projection(now_playing, **extra):
    p = {"calendar": {"next": None}, "heartbeat": [], "finances": None, "weather": None}
    if now_playing is not ...:
        p["nowPlaying"] = now_playing
    p.update({"news": None, "stale": [], **extra})
    return p


def track(progress, playing=True, anchor_ago=0.0, duration=330000, **kw):
    now = datetime.now().astimezone()
    t = {"title": "Teardrop", "artist": "Massive Attack", "album": "Mezzanine", "isPlaying": playing,
         "progressMs": progress, "durationMs": duration, "updatedAt": iso_ms(now - timedelta(seconds=anchor_ago)),
         "source": "spotify", "art": None}
    t.update(kw)
    return t


def test_live_default_projection_advances_from_the_anchor(open_page, fake):
    pg = live_page(open_page, fake)  # fake default: 81 000 ms, anchored 3 s before the projection was built
    a = np(pg)
    assert set(a) == KEYS and not a["updatedAt"].startswith("not a Date"), a
    assert a["updatedAt"].endswith("Z") and "." in a["updatedAt"]
    assert 83500 < a["progressMs"] < 81000 + 3000 + 15000, a["progressMs"]
    pg.wait_for_timeout(1000)
    b = np(pg)
    assert 700 < b["progressMs"] - a["progressMs"] < 1800, (a["progressMs"], b["progressMs"])
    assert real_errors(pg) == []


def test_live_anchor_far_in_the_past(open_page, fake):
    pg = live_page(open_page, fake)
    fake.ctl(projection=projection(track(10000, anchor_ago=60)))  # updatedAt is the anchor, not "now"
    assert poll(pg, "__AW_FRAME.signals.nowPlaying && __AW_FRAME.signals.nowPlaying.progressMs > 60000", timeout=4)
    p = np(pg)["progressMs"]
    assert 69500 < p < 75000, p


def test_live_paused_is_frozen_and_end_is_clamped(open_page, fake):
    pg = live_page(open_page, fake)
    fake.ctl(projection=projection(track(5000, playing=False, anchor_ago=60, title="Paused one")))
    assert poll(pg, "__AW_FRAME.signals.nowPlaying && __AW_FRAME.signals.nowPlaying.title === 'Paused one'", timeout=4)
    assert np(pg)["progressMs"] == 5000
    pg.wait_for_timeout(1200)  # the fake resends every second
    assert np(pg)["progressMs"] == 5000
    fake.ctl(projection=projection(track(329000, anchor_ago=10, title="Ending")))
    assert poll(pg, "__AW_FRAME.signals.nowPlaying && __AW_FRAME.signals.nowPlaying.title === 'Ending'", timeout=4)
    assert np(pg)["progressMs"] == 330000


def test_live_lastfm_without_progress(open_page, fake):
    pg = live_page(open_page, fake)
    fake.ctl(projection=projection(track(None, duration=None, album=None, source="lastfm", title="Scrobbled")))
    assert poll(pg, "__AW_FRAME.signals.nowPlaying && __AW_FRAME.signals.nowPlaying.title === 'Scrobbled'", timeout=4)
    n = np(pg)
    assert n["progressMs"] is None and n["durationMs"] is None and n["album"] is None and n["source"] == "lastfm"
    assert real_errors(pg) == []


def test_live_null_and_missing_pass_through(open_page, fake):
    pg = live_page(open_page, fake)
    assert np(pg) is not None
    fake.ctl(projection=projection(None, stale=["nowPlaying"]))
    assert poll(pg, "__AW_FRAME.signals.nowPlaying === null", timeout=4)
    assert pg.evaluate("__AW_FRAME.signals.stale") == ["nowPlaying"]
    fake.ctl(projection=projection(track(1000, art="/api/art/" + "a" * 40)))
    assert poll(pg, "__AW_FRAME.signals.nowPlaying && __AW_FRAME.signals.nowPlaying.art", timeout=4)
    assert np(pg)["art"] == "/api/art/" + "a" * 40
    fake.ctl(projection=projection(...))  # key absent: null, not undefined
    assert poll(pg, "__AW_FRAME.signals.nowPlaying === null", timeout=4)
    assert real_errors(pg) == []


def test_project_without_ts_uses_local_clock(open_page):
    pg = open_page(WORK)
    r = pg.evaluate("""(() => {
      const iso = new Date(Date.now() - 5000).toISOString();
      const s = AW._debug.project({ nowPlaying: { title: "x", isPlaying: true, progressMs: 0, durationMs: 600000, updatedAt: iso } });
      return { d: s.nowPlaying.updatedAt instanceof Date, keys: Object.keys(s) };
    })()""")
    assert r["d"] is True and "nowPlaying" in r["keys"] and "news" in r["keys"]


def test_p_on_a_live_wall_switches_to_mock(open_page, fake):
    pg = live_page(open_page, fake)
    pg.keyboard.press("p")
    assert pg.evaluate("AW._debug.source()") == "mock"
    assert kind(np(pg)) == "paused"  # the mock preset after one P
