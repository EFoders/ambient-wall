"""demo `music` part: spotify `now` shape, progress advances with the clock, the playlist loops, one
paused gap (under the default idle, so the wall keeps showing it), `music = "none"`; and the zero-setup
example config puts a non-null nowPlaying on the wall end to end."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

from ambient import wall
from ambient.adapters._shared import OptionError
from ambient.adapters.base import AdapterContext
from ambient.adapters.demo import (MUSIC_CYCLE_S, MUSIC_PAUSE_AT, MUSIC_PAUSE_S, MUSIC_PAUSE_TRACK,
                                   MUSIC_START_S, PLAYLIST, Demo, music_at)
from ambient.adapters.spotify import to_now
from ambient.config import load_config
from ambient.loader import load_builtins
from ambient.pool import Pool
from ambient.rules import heartbeat_down as hb
from ambient.scheduler import Scheduler
from ambient.signal import coerce

REPO = Path(__file__).resolve().parents[2]
SETTINGS = {"location": {"lat": 45.898, "lon": -77.283, "timezone": "America/Toronto"}}
T0 = datetime(2026, 10, 10, 13, 0, tzinfo=timezone.utc)
SPOTIFY_KEYS = {"title", "artist", "album", "is_playing", "progress_ms", "duration_ms", "track_id", "art_url", "kind",
                "anchor_at"}


def ctx():
    return AdapterContext(http=httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(599))),
                          log=logging.getLogger("test"), data_dir=Path("."), settings=SETTINGS)


class Clock:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


async def at(d, clock, seconds):
    clock.t = T0 + timedelta(seconds=seconds)
    items = {i["key"]: i for i in await d.fetch()}
    return items["now"]


def extrapolate(v, at_time):
    """What the browser shows: progress_ms + (now - anchor_at) while playing."""
    if not v["is_playing"]:
        return v["progress_ms"]
    return v["progress_ms"] + round((at_time - datetime.fromisoformat(v["anchor_at"])).total_seconds() * 1000)


async def test_music_part_shape_and_progress():
    clock = Clock(T0)
    d = Demo("music", {}, ctx())
    d.now = clock
    first = await at(d, clock, 0)
    sig = coerce(first, source="music")
    assert sig.id == "music.now" and sig.meta == {"provider": "demo"} and sig.type == "object"
    v = sig.value
    assert set(v) == SPOTIFY_KEYS                                     # what spotify emits
    assert v["title"] == PLAYLIST[0][0] and v["is_playing"] is True
    # anchored at the track start: progress 0 at T0 - 81 s, i.e. 81 s in at T0
    assert v["progress_ms"] == 0 and datetime.fromisoformat(v["anchor_at"]) == T0 - timedelta(seconds=MUSIC_START_S)
    assert extrapolate(v, T0) == MUSIC_START_S * 1000 and v["duration_ms"] == PLAYLIST[0][3] * 1000
    assert v["art_url"] is None and v["kind"] == "track"
    for s in (5, 30, 120):                                            # steady playback: identical value
        later = (await at(d, clock, s))["value"]
        assert later == v and extrapolate(later, T0 + timedelta(seconds=s)) == (MUSIC_START_S + s) * 1000
    t_next = PLAYLIST[0][3] - MUSIC_START_S
    nxt = (await at(d, clock, t_next + 5))["value"]
    assert nxt["title"] == PLAYLIST[1][0] and nxt["progress_ms"] == 0
    assert datetime.fromisoformat(nxt["anchor_at"]) == T0 + timedelta(seconds=t_next)
    assert extrapolate(nxt, T0 + timedelta(seconds=t_next + 5)) == 5000
    # shape agrees with the real mapping (+ the anchor the adapter adds)
    real = to_now({"is_playing": True, "progress_ms": 1, "currently_playing_type": "track",
                   "item": {"name": "x", "duration_ms": 2, "id": "i", "artists": [{"name": "a"}],
                            "album": {"name": "b", "images": []}}})
    assert set(real) | {"anchor_at"} == set(v)


async def test_one_paused_gap_then_resume_and_loop():
    assert 5 <= len(PLAYLIST) <= 6
    clock = Clock(T0)
    d = Demo("music", {}, ctx())
    d.now = clock
    await at(d, clock, 0)
    offset = sum(t[3] for t in PLAYLIST[:MUSIC_PAUSE_TRACK]) - MUSIC_START_S   # start of the pause track
    before = (await at(d, clock, offset + 50))["value"]
    assert datetime.fromisoformat(before["anchor_at"]) == T0 + timedelta(seconds=offset)
    paused = (await at(d, clock, offset + MUSIC_PAUSE_AT + 30))["value"]
    assert paused["title"] == PLAYLIST[MUSIC_PAUSE_TRACK][0] and paused["is_playing"] is False
    assert paused["progress_ms"] == MUSIC_PAUSE_AT * 1000
    pause_start = T0 + timedelta(seconds=offset + MUSIC_PAUSE_AT)
    assert datetime.fromisoformat(paused["paused_since"]) == pause_start          # re-anchored at the pause
    assert datetime.fromisoformat(paused["anchor_at"]) == pause_start
    same = (await at(d, clock, offset + MUSIC_PAUSE_AT + 60))["value"]
    assert same == paused                                             # constant while paused
    resumed = (await at(d, clock, offset + MUSIC_PAUSE_AT + MUSIC_PAUSE_S + 10))["value"]
    assert resumed["is_playing"] is True and resumed["progress_ms"] == MUSIC_PAUSE_AT * 1000
    assert datetime.fromisoformat(resumed["anchor_at"]) == pause_start + timedelta(seconds=MUSIC_PAUSE_S)
    assert extrapolate(resumed, clock.t) == (MUSIC_PAUSE_AT + 10) * 1000
    assert "paused_since" not in resumed
    looped = (await at(d, clock, MUSIC_CYCLE_S))["value"]
    first = (await at(d, clock, 0))["value"]
    assert {k: v for k, v in looped.items() if k != "anchor_at"} == {k: v for k, v in first.items() if k != "anchor_at"}
    assert extrapolate(looped, T0 + timedelta(seconds=MUSIC_CYCLE_S)) == extrapolate(first, T0)
    # exactly one pause per cycle, and it is shorter than the wall's 2 min idle
    states = [music_at(s * 1000)[2] for s in range(0, MUSIC_CYCLE_S, 5)]
    assert states.count(False) * 5 == pytest.approx(MUSIC_PAUSE_S, abs=5) and MUSIC_PAUSE_S < 120


async def test_demo_only_changes_value_at_anchor_points(tmp_path):
    """Over a whole cycle polled every 5 s, the pool sees one change per track plus the pause and
    the resume: not one per poll."""
    clock = Clock(T0)
    d = Demo("music", {}, ctx())
    d.now = clock
    pool = Pool()
    changes = 0
    for s in range(0, MUSIC_CYCLE_S, 5):
        item = await at(d, clock, s)
        changes += len(await pool.publish([coerce(item, source="music", ttl_s=d.ttl_s)]))   # real ts: fresh
    assert changes == len(PLAYLIST) + 2 + 1          # 6 tracks + pause + resume, + the loop back to track 1


async def test_wall_shows_the_demo_while_paused():
    clock = Clock(T0)
    d = Demo("music", {}, ctx())
    d.now = clock
    await at(d, clock, 0)
    offset = sum(t[3] for t in PLAYLIST[:MUSIC_PAUSE_TRACK]) - MUSIC_START_S
    pool = Pool()
    cfg = {"location": SETTINGS["location"]}
    for s in (MUSIC_PAUSE_AT + 1, MUSIC_PAUSE_AT + MUSIC_PAUSE_S - 1):   # first and last second of the pause
        item = await at(d, clock, offset + s)
        await pool.publish([coerce(dict(item, ts=clock.t), source="music", ttl_s=d.ttl_s)])
        np = wall.project(pool, clock.t, cfg)["nowPlaying"]
        assert np is not None and np["isPlaying"] is False and np["source"] == "demo"


async def test_music_none_and_bad_option():
    d = Demo("music", {"music": "none"}, ctx())
    d.now = lambda: T0
    assert {i["key"]: i for i in await d.fetch()}["now"]["value"] is None
    with pytest.raises(OptionError, match="music"):
        Demo("music", {"music": "loud"}, ctx())
    d = Demo("everything", {}, ctx())
    d.now = lambda: T0
    assert "now" in {i["key"] for i in await d.fetch()}
    d = Demo("weather", {}, ctx())
    d.now = lambda: T0
    assert "now" not in {i["key"] for i in await d.fetch()}


async def test_example_config_shows_now_playing(tmp_path):
    load_builtins()
    hb.reset_state()
    cfg = load_config(tmp_path, text=(REPO / "config" / "config.example.toml").read_text(encoding="utf-8"))
    assert {s.name: s.type for s in cfg.sources}["music"] == "demo"
    pool = Pool()
    sch = Scheduler(cfg, pool, data_dir=tmp_path, rule_start_delay_s=0)
    await sch.start()
    try:
        loop = asyncio.get_running_loop()
        end = loop.time() + 5
        while wall.project(pool, sch.now(), cfg)["nowPlaying"] is None:
            assert loop.time() < end, "nowPlaying never appeared"
            await asyncio.sleep(0.02)
        out = wall.project(pool, sch.now(), cfg)
        np = out["nowPlaying"]
        assert list(np) == ["title", "artist", "album", "isPlaying", "progressMs", "durationMs", "updatedAt",
                            "source", "art"]
        assert np["title"] == PLAYLIST[0][0] and np["isPlaying"] is True and np["source"] == "demo"
        assert np["art"] is None and "nowPlaying" not in out["stale"]
    finally:
        await sch.stop()
        hb.reset_state()
