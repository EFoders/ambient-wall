"""lastfm adapter against fixtures + MockTransport: nowplaying vs not, largest image (placeholder star
ignored), single-track object, API errors (host only, key scrubbed), options."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from urllib.parse import parse_qs

import httpx
import pytest

from ambient.adapters._shared import OptionError, SourceError
from ambient.adapters.base import REGISTRY, AdapterContext
from ambient.adapters.lastfm import LastFm, largest_image, to_now
from ambient.signal import coerce

FIX = Path(__file__).parent / "fixtures"
KEY = "lfmkey-SECRET-0123456789abcdef"


def fx(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def make(handler, **opts) -> LastFm:
    ctx = AdapterContext(http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
                         log=logging.getLogger("test.lastfm"), data_dir=Path("."), settings={})
    return LastFm("music", {"api_key": KEY, "user": "valleylistener", **opts}, ctx)


def serve(body, status=200, seen=None):
    def handler(req):
        if seen is not None:
            seen.append(req)
        if isinstance(body, bytes):
            return httpx.Response(status, content=body)
        return httpx.Response(status, json=body)
    return handler


async def test_nowplaying_track_becomes_now():
    seen = []
    s = make(serve(fx("lastfm_nowplaying.json"), seen=seen))
    items = await s.fetch()
    sig = coerce(items[0], source="music", ttl_s=s.ttl_s)
    assert sig.id == "music.now" and sig.meta == {"provider": "lastfm"} and sig.ttl_s == 45
    assert sig.value == {"title": "Teardrop", "artist": "Massive Attack", "album": "Mezzanine",
                         "is_playing": True, "progress_ms": None, "duration_ms": None,
                         "track_id": "https://www.last.fm/music/Massive+Attack/_/Teardrop",
                         "art_url": "https://lastfm.freetls.fastly.net/i/u/300x300/3f9a2c.jpg",
                         "kind": "track"}
    q = parse_qs(seen[0].url.query.decode())
    assert q == {"method": ["user.getrecenttracks"], "user": ["valleylistener"], "api_key": [KEY],
                 "format": ["json"], "limit": ["1"]}
    assert str(seen[0].url).startswith("https://ws.audioscrobbler.com/2.0/")
    assert s.status.extra["state"] == "playing"


async def test_no_nowplaying_means_null():
    s = make(serve(fx("lastfm_recent.json")))                       # single track object, not a list
    assert (await s.fetch())[0]["value"] is None
    assert s.status.extra["state"] == "idle"
    doc = fx("lastfm_nowplaying.json")
    doc["recenttracks"]["track"] = doc["recenttracks"]["track"][1:]  # only the scrobbled one left
    assert to_now(doc) is None
    assert to_now({"recenttracks": {"track": []}}) is None


def test_largest_image_skips_placeholder_and_empty():
    imgs = fx("lastfm_nowplaying.json")["recenttracks"]["track"][1]["image"]
    assert largest_image(imgs) is None                               # only the grey star
    assert largest_image([{"size": "mega", "#text": ""}, {"size": "large", "#text": "https://x/l.jpg"},
                          {"size": "small", "#text": "https://x/s.jpg"}]) == "https://x/l.jpg"
    assert largest_image("nope") is None
    np = fx("lastfm_nowplaying.json")
    np["recenttracks"]["track"][0]["image"] = []
    assert to_now(np)["art_url"] is None


async def test_api_errors_name_host_and_scrub_key(caplog):
    s = make(serve({"error": 10, "message": f"Invalid API key {KEY} - You must be granted a valid key"}, 403))
    with pytest.raises(SourceError, match="Last.fm error 10") as e:
        await s.fetch()
    assert KEY not in str(e.value) and "ws.audioscrobbler.com" in str(e.value)
    s = make(serve({"error": 6, "message": "User not found"}, 404))
    with pytest.raises(SourceError, match="User not found"):
        await s.fetch()
    s = make(serve(b"<html>bad gateway</html>", 502))
    with pytest.raises(SourceError, match="HTTP 502") as e:
        await s.fetch()
    assert KEY not in str(e.value)
    s = make(serve(b"{nope", 200))
    with pytest.raises(SourceError, match="not JSON"):
        await s.fetch()
    s = make(serve({"something": "else"}, 200))
    with pytest.raises(SourceError, match="recenttracks"):
        await s.fetch()

    def boom(req):
        raise httpx.ConnectError(f"failed {req.url}")
    s = make(boom)
    with pytest.raises(SourceError, match="ConnectError") as e:
        await s.fetch()
    assert KEY not in str(e.value) and KEY not in caplog.text


def test_options():
    assert REGISTRY["lastfm"] is LastFm
    ctx = AdapterContext(http=httpx.AsyncClient(), log=logging.getLogger("t"), data_dir=Path("."), settings={})
    for bad, match in (({"user": "u"}, "api_key"), ({"api_key": KEY}, "user"),
                       ({"api_key": KEY, "user": " "}, "empty"),
                       ({"api_key": KEY, "user": "u", "every": "1s"}, "at least 5s"),
                       ({"api_key": KEY, "user": "u", "username": "u"}, "unknown option")):
        with pytest.raises(OptionError, match=match) as e:
            LastFm("music", bad, ctx)
        assert KEY not in str(e.value)
    s = LastFm("music", {"api_key": KEY, "user": "u"}, ctx)
    assert s.every == 15 and s.ttl_s == 45 and KEY not in repr(s)
