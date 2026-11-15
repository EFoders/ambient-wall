"""wall.project `nowPlaying`: playing; paused under idle (shown, isPlaying false); paused over idle (null);
stale; custom binding and idle; source / art / progress rules; golden shape; config validation."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from fnmatch import fnmatchcase
from zoneinfo import ZoneInfo

import pytest

from ambient import wall
from ambient.config import ConfigError, build_config
from ambient.signal import Signal

TZ = ZoneInfo("America/Toronto")
NOW = datetime(2026, 10, 9, 21, 14, 5, 250000, tzinfo=TZ)
CFG = {"location": {"timezone": "America/Toronto"}, "rules": {}}
KEYS = ["title", "artist", "album", "isPlaying", "progressMs", "durationMs", "updatedAt", "source", "art"]
ART_ID = "3f9a" + "0" * 36


class FakePool:
    def __init__(self, now):
        self.now = now
        self.sigs: dict[str, Signal] = {}

    def add(self, sid, value, *, age=0.0, ttl=15, vis="wall", meta=None):
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


def track(**kw):
    v = {"title": "Teardrop", "artist": "Massive Attack", "album": "Mezzanine", "is_playing": True,
         "progress_ms": 81000, "duration_ms": 330000, "track_id": "67Hna13dNDkZvBpTXRIaOJ",
         "art_url": "https://i.scdn.co/image/ab67616d0000b273mezzanine640", "kind": "track"}
    v.update(kw)
    return v


def art_lookup(url):
    return f"/api/art/{ART_ID}" if url == "https://i.scdn.co/image/ab67616d0000b273mezzanine640" else None


def np_at(pool, now=NOW, cfg=CFG, **kw):
    out = wall.project(pool, now, cfg, **kw)
    return out["nowPlaying"], out["stale"]


# ------------------------------------------------------------------------------ golden

GOLDEN = {"title": "Teardrop", "artist": "Massive Attack", "album": "Mezzanine", "isPlaying": True,
          "progressMs": 81000, "durationMs": 330000, "updatedAt": "2026-10-09T21:14:05.250-04:00",
          "source": "spotify", "art": f"/api/art/{ART_ID}"}


def test_golden_shape():
    p = FakePool(NOW)
    p.add("music.now", track(), meta={"provider": "spotify"})
    out = wall.project(p, NOW, CFG, art=art_lookup)
    assert list(out) == ["calendar", "heartbeat", "finances", "weather", "nowPlaying", "news", "stale"]
    assert json.loads(json.dumps(out["nowPlaying"])) == GOLDEN
    assert list(out["nowPlaying"]) == KEYS
    assert out["stale"] == []
    # updatedAt revives to the signal's observation time (ms precision) so the browser can advance progress
    assert datetime.fromisoformat(out["nowPlaying"]["updatedAt"]) == NOW


def test_art_is_null_until_cached_or_without_lookup():
    p = FakePool(NOW)
    p.add("music.now", track(art_url="https://i.scdn.co/image/other"))
    assert np_at(p, art=art_lookup)[0]["art"] is None
    p.add("music.now", track())
    assert np_at(p)[0]["art"] is None                               # no art cache passed

    def broken(url):
        raise OSError("disk gone")
    assert np_at(p, art=broken)[0]["art"] is None                   # never breaks the projection


# ------------------------------------------------------------------------------ playing / paused / idle

def test_playing_then_paused_under_idle_then_over_idle():
    p = FakePool(NOW)
    p.add("music.now", track(), meta={"provider": "spotify"})
    np, _ = np_at(p)
    assert np["isPlaying"] is True and np["progressMs"] == 81000

    paused_at = NOW + timedelta(seconds=40)
    paused = track(is_playing=False, progress_ms=121000, paused_since=paused_at.isoformat())
    for later in (paused_at, paused_at + timedelta(seconds=119)):    # under the 2 min default
        p.now = later
        p.add("music.now", paused, ttl=90)                          # re-polled: ts refreshes, value same
        np, stale = np_at(p, later)
        assert np is not None and np["isPlaying"] is False and np["progressMs"] == 121000 and stale == []
    later = paused_at + timedelta(seconds=121)                      # over idle: the element disappears
    p.now = later
    p.add("music.now", paused, ttl=90)
    assert np_at(p, later) == (None, [])
    # resumes: back
    p.add("music.now", track(progress_ms=121500))
    assert np_at(p, later)[0]["isPlaying"] is True


def test_paused_without_paused_since_counts_from_signal_ts():
    p = FakePool(NOW)
    p.add("music.now", track(is_playing=False), age=60, ttl=600)    # e.g. one push, then silence
    assert np_at(p)[0]["isPlaying"] is False
    p.add("music.now", track(is_playing=False), age=121, ttl=600)
    assert np_at(p)[0] is None
    # a paused_since in the future (clock skew) is not "paused for a negative time" forever
    p.add("music.now", track(is_playing=False, paused_since=(NOW + timedelta(hours=1)).isoformat()), ttl=600)
    assert np_at(p)[0] is not None


def test_custom_idle():
    p = FakePool(NOW)
    p.add("music.now", track(is_playing=False, paused_since=(NOW - timedelta(seconds=45)).isoformat()), ttl=90)
    assert np_at(p)[0] is not None
    assert np_at(p, cfg=dict(CFG, wall={"now_playing_idle": "30s"}))[0] is None
    assert np_at(p, cfg=dict(CFG, wall={"now_playing_idle": 60}))[0] is not None
    assert np_at(p, cfg=dict(CFG, wall={"now_playing_idle": "0s"}))[0] is None       # hide as soon as paused
    assert np_at(p, cfg=dict(CFG, wall={"now_playing_idle": "garbage"}))[0] is not None   # default 2m


# ------------------------------------------------------------------------------ null / stale

def test_null_cases():
    p = FakePool(NOW)
    assert np_at(p) == (None, [])                                    # nothing bound
    p.add("music.now", None)
    assert np_at(p) == (None, [])                                    # nothing playing
    for bad in ("Teardrop", 7, [], {"artist": "No title"}, {"title": "  "}, {"title": None}):
        p.add("music.now", bad)
        assert np_at(p) == (None, []), bad
    p.add("music.now", track(), vis="ask")                           # ask-only never glows
    assert np_at(p) == (None, [])


def test_stale_is_null_and_listed():
    p = FakePool(NOW)
    p.add("music.now", track(), age=16, ttl=15)
    assert np_at(p) == (None, ["nowPlaying"])
    p.add("music.now", None, age=100, ttl=90)                        # a stale "nothing playing" too
    assert np_at(p) == (None, ["nowPlaying"])


# ------------------------------------------------------------------------------ binding / fields

def test_custom_binding():
    p = FakePool(NOW)
    p.add("music.now", track(title="Wrong one"))
    p.add("spot.now", track(title="Right one"))
    cfg = dict(CFG, wall={"now_playing": "spot.now"})
    assert np_at(p, cfg=cfg)[0]["title"] == "Right one"
    assert np_at(p, cfg=dict(CFG, wall={"now_playing": ""}))[0] is None            # "" = off
    assert wall.describe(cfg)["nowPlaying"] == ["spot.now"]
    assert wall.describe()["nowPlaying"] == ["music.now"]


def test_field_normalisation_and_source():
    p = FakePool(NOW)
    p.add("music.now", {"title": "  Roads  ", "artist": ["Portishead", "Beth Gibbons"]}, meta={"provider": "lastfm"})
    np, _ = np_at(p)
    assert np == {"title": "Roads", "artist": "Portishead, Beth Gibbons", "album": None, "isPlaying": True,
                  "progressMs": None, "durationMs": None, "updatedAt": "2026-10-09T21:14:05.250-04:00",
                  "source": "lastfm", "art": None}
    # push: no provider meta -> the value's source, else the source name
    p.add("music.now", track(source="foobar2000"))
    assert np_at(p)[0]["source"] == "foobar2000"
    p.add("music.now", track())
    assert np_at(p)[0]["source"] == "music"
    # progress clamped to duration; junk numbers dropped; string flags understood
    p.add("music.now", track(progress_ms=999999, duration_ms=200000))
    assert np_at(p)[0]["progressMs"] == 200000
    p.add("music.now", track(progress_ms=-5, duration_ms="long", is_playing="false"))
    np, _ = np_at(p)
    assert np["progressMs"] is None and np["durationMs"] is None and np["isPlaying"] is False
    p.add("music.now", track(is_playing=None, isPlaying=None))
    assert np_at(p)[0]["isPlaying"] is True


# ------------------------------------------------------------------------------ config

def test_config_validation_for_new_keys():
    cfg = build_config({}, known_types=set())
    assert cfg.display["sound"] is False and cfg.display["volume"] == 0.4 and cfg.display["sound_work"] == 0
    st = cfg.settings()["display"]
    assert st["sound"] is False and st["volume"] == 0.4 and st["sound_work"] == 0
    ok = build_config({"display": {"sound": True, "volume": 1, "sound_work": 0.25},
                       "wall": {"now_playing": "spot.now", "now_playing_idle": "5m"}}, known_types=set())
    assert ok.settings()["display"]["sound"] is True and ok.wall["now_playing_idle"] == "5m"
    build_config({"wall": {"now_playing_idle": 90}}, known_types=set())
    for bad, match in (({"display": {"sound": "yes"}}, "sound must be"),
                       ({"display": {"volume": 1.5}}, "volume must be"),
                       ({"display": {"volume": True}}, "volume must be"),
                       ({"display": {"sound_work": -0.1}}, "sound_work must be"),
                       ({"wall": {"now_playing_idle": "soon"}}, "now_playing_idle"),
                       ({"wall": {"now_playing_idle": [1]}}, "now_playing_idle"),
                       ({"wall": {"now_playing": 5}}, "now_playing must be")):
        with pytest.raises(ConfigError, match=match):
            build_config(bad, known_types=set())


# ------------------------------------------------------------------------------ progress anchor

def shown_progress(np, at):
    """What the browser draws: progressMs + (now - updatedAt) while playing."""
    if not np["isPlaying"]:
        return np["progressMs"]
    return np["progressMs"] + round((at - datetime.fromisoformat(np["updatedAt"])).total_seconds() * 1000)


def test_updated_at_comes_from_anchor_at():
    p = FakePool(NOW)
    anchor = NOW - timedelta(seconds=37, milliseconds=125)
    p.add("music.now", track(progress_ms=44000, anchor_at=anchor.astimezone(timezone.utc).isoformat()),
          meta={"provider": "spotify"})
    np, _ = np_at(p)
    assert datetime.fromisoformat(np["updatedAt"]) == anchor
    assert np["updatedAt"] == "2026-10-09T21:13:28.125-04:00"            # local offset, ms precision
    assert np["progressMs"] == 44000                                    # the anchored progress, as sent
    assert shown_progress(np, NOW) == 44000 + 37125


def test_extrapolated_progress_is_continuous_across_ts_only_refresh():
    p = FakePool(NOW)
    value = track(progress_ms=81000, anchor_at=NOW.isoformat())
    p.add("music.now", value)
    a, _ = np_at(p, NOW)
    seen = []
    for k in range(1, 13):                                              # a minute of 5 s re-polls
        t = NOW + timedelta(seconds=5 * k)
        p.now = t
        p.add("music.now", value)                                       # same value, fresh ts
        b, stale = np_at(p, t)
        assert b == a and stale == []                                   # projection unchanged
        seen.append(shown_progress(b, t))
    assert seen == [81000 + 5000 * k for k in range(1, 13)]              # no jumps back to the anchor


def test_push_without_anchor_uses_ts_and_future_anchor_is_ignored():
    p = FakePool(NOW)
    p.add("music.now", track(), age=3)                                  # plain push: ts is the anchor
    assert datetime.fromisoformat(np_at(p)[0]["updatedAt"]) == NOW - timedelta(seconds=3)
    p.add("music.now", track(anchor_at=(NOW + timedelta(minutes=5)).isoformat()))   # skewed clock
    assert datetime.fromisoformat(np_at(p)[0]["updatedAt"]) == NOW
    p.add("music.now", track(anchor_at="not a date"))
    assert datetime.fromisoformat(np_at(p)[0]["updatedAt"]) == NOW


def test_paused_without_paused_since_counts_from_anchor():
    p = FakePool(NOW)
    p.add("music.now", track(is_playing=False, anchor_at=(NOW - timedelta(seconds=130)).isoformat()), ttl=90)
    assert np_at(p)[0] is None                                          # paused 130 s ago > 2 min
    p.add("music.now", track(is_playing=False, anchor_at=(NOW - timedelta(seconds=30)).isoformat()), ttl=90)
    assert np_at(p)[0]["isPlaying"] is False
