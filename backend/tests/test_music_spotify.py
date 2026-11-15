"""spotify adapter against fixtures + httpx.MockTransport (no live Spotify): mapping of track / episode /
local / ad items, 204, token caching + refresh on expiry and on 401, 429 Retry-After, malformed JSON,
adaptive interval, options, and that no credential reaches an error, a status or a log line."""
from __future__ import annotations

import asyncio
import base64
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs

import httpx
import pytest

from ambient.adapters._shared import OptionError, SourceError
from ambient.adapters.base import REGISTRY, AdapterContext
from ambient.adapters.spotify import (PLAYER_URL, TOKEN_URL, RateLimited, Spotify, largest_image,
                                      retry_after_s, to_now)
from ambient.signal import coerce

FIX = Path(__file__).parent / "fixtures"
CID, SECRET, REFRESH = "cid-1234567890", "csecret-TOPSECRET-abcdef", "rtoken-REFRESHSECRET-xyz"
SECRETS = (SECRET, REFRESH, "access-SECRET-1", "access-SECRET-2", "access-SECRET-3")
T0 = datetime(2026, 10, 10, 13, 0, tzinfo=timezone.utc)


def fx(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


class Api:
    """Fake accounts.spotify.com + api.spotify.com. `player` is a list of responses served in order
    (the last one repeats); each is (status, body|None, headers)."""

    def __init__(self, *player, token_status=200, token_body=None, expires_in=3600):
        self.player = list(player) or [(204, None, {})]
        self.token_status = token_status
        self.token_body = token_body
        self.expires_in = expires_in
        self.tokens_issued = 0
        self.requests: list[httpx.Request] = []
        self.player_calls = 0

    def __call__(self, req: httpx.Request) -> httpx.Response:
        self.requests.append(req)
        if str(req.url) == TOKEN_URL:
            if self.token_status != 200:
                return httpx.Response(self.token_status, json=self.token_body or {"error": "invalid_grant",
                                                                                  "error_description": "Invalid refresh token"})
            self.tokens_issued += 1
            return httpx.Response(200, json=self.token_body or {
                "access_token": f"access-SECRET-{self.tokens_issued}", "token_type": "Bearer",
                "expires_in": self.expires_in, "scope": "user-read-currently-playing user-read-playback-state"})
        assert str(req.url).startswith(PLAYER_URL)
        status, body, headers = self.player[min(self.player_calls, len(self.player) - 1)]
        self.player_calls += 1
        if isinstance(body, (bytes, str)):
            return httpx.Response(status, content=body, headers=headers)
        if body is None:
            return httpx.Response(status, headers=headers)
        return httpx.Response(status, json=body, headers=headers)

    def player_requests(self):
        return [r for r in self.requests if str(r.url).startswith(PLAYER_URL)]

    def token_requests(self):
        return [r for r in self.requests if str(r.url) == TOKEN_URL]


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def make(api, **opts) -> Spotify:
    ctx = AdapterContext(http=httpx.AsyncClient(transport=httpx.MockTransport(api)),
                         log=logging.getLogger("test.spotify"), data_dir=Path("."), settings={})
    s = Spotify("music", {"client_id": CID, "client_secret": SECRET, "refresh_token": REFRESH, **opts}, ctx)
    s.clock = Clock()
    s.now = lambda: T0
    return s


def assert_no_secrets(*texts):
    for t in texts:
        for sec in SECRETS:
            assert sec not in str(t), f"secret leaked: {t}"


# ------------------------------------------------------------------------------ mapping

async def test_playing_track():
    api = Api((200, fx("spotify_track.json"), {}))
    s = make(api)
    items = await s.fetch()
    assert len(items) == 1
    sig = coerce(items[0], source="music", ttl_s=s.ttl_s)
    assert sig.id == "music.now" and sig.type == "object" and sig.meta == {"provider": "spotify"}
    assert sig.value == {
        "title": "Teardrop", "artist": "Massive Attack, Elizabeth Fraser", "album": "Mezzanine",
        "is_playing": True, "progress_ms": 81000, "duration_ms": 330773, "track_id": "67Hna13dNDkZvBpTXRIaOJ",
        "art_url": "https://i.scdn.co/image/ab67616d0000b273mezzanine640",          # the 640 px one
        "kind": "track", "anchor_at": "2026-10-10T13:00:00.000+00:00"}
    assert s.next_wait == 5 and sig.ttl_s == 15                                  # playing: 5 s poll, ttl 3x
    req = api.player_requests()[0]
    assert req.headers["authorization"] == "Bearer access-SECRET-1"
    assert parse_qs(req.url.query.decode())["additional_types"] == ["episode"]
    tok = api.token_requests()[0]
    assert tok.headers["authorization"] == "Basic " + base64.b64encode(f"{CID}:{SECRET}".encode()).decode()
    assert parse_qs(tok.content.decode()) == {"grant_type": ["refresh_token"], "refresh_token": [REFRESH]}
    assert s.status.extra["state"] == "playing"


async def test_episode():
    s = make(Api((200, fx("spotify_episode.json"), {})))
    v = (await s.fetch())[0]["value"]
    assert v == {"title": "The River Remembers", "artist": "Valley Stories", "album": "Upper Ottawa Radio",
                 "is_playing": True, "progress_ms": 1204000, "duration_ms": 2873000,
                 "track_id": "512ojhOuo1ktJprKbVcKyQ", "art_url": "https://i.scdn.co/image/ep640",
                 "kind": "episode", "anchor_at": "2026-10-10T13:00:00.000+00:00"}


async def test_local_file_paused_has_no_art_and_paused_since():
    doc = fx("spotify_local.json")
    s = make(Api((200, doc, {})))
    v = (await s.fetch())[0]["value"]
    assert v["title"] == "Song For The Lake" and v["artist"] == "The Garage Band"
    assert v["album"] == "Basement Tapes 2009" and v["kind"] == "local" and v["art_url"] is None
    assert v["track_id"].startswith("spotify:local:") and v["is_playing"] is False
    # paused: Spotify's state-change timestamp (in the past) is used; poll slows to idle_every
    assert v["paused_since"] == datetime.fromtimestamp(doc["timestamp"] / 1000, timezone.utc).isoformat(timespec="seconds")
    assert s.next_wait == 30 and s.status.extra["state"] == "paused"


async def test_paused_since_is_stable_and_resets_on_play():
    doc = dict(fx("spotify_track.json"), is_playing=False, timestamp=None)
    api = Api((200, doc, {}))
    s = make(api)
    first = (await s.fetch())[0]["value"]["paused_since"]
    assert first == T0.isoformat(timespec="seconds")                  # no usable timestamp: first seen
    s.now = lambda: T0 + timedelta(minutes=5)
    assert (await s.fetch())[0]["value"]["paused_since"] == first       # same pause, same value
    api.player = [(200, fx("spotify_track.json"), {})]
    assert "paused_since" not in (await s.fetch())[0]["value"]
    api.player = [(200, doc, {})]
    assert (await s.fetch())[0]["value"]["paused_since"] == (T0 + timedelta(minutes=5)).isoformat(timespec="seconds")


async def test_204_and_empty_body_mean_nothing_playing():
    s = make(Api((204, None, {})))
    items = await s.fetch()
    assert items[0]["value"] is None and items[0]["ttl_s"] == 90 and s.next_wait == 30
    assert s.status.extra["state"] == "idle"
    s = make(Api((200, b"", {})))
    assert (await s.fetch())[0]["value"] is None


async def test_ad_is_hidden_but_polled_fast():
    s = make(Api((200, fx("spotify_ad.json"), {})))
    assert (await s.fetch())[0]["value"] is None
    assert s.next_wait == 5                                     # an ad is playing: catch the next track


def test_pure_helpers():
    assert to_now(None) is None
    assert to_now({"item": {"name": "  "}, "currently_playing_type": "track"}) is None
    assert to_now({"is_playing": True, "item": {"name": "X", "artists": "garbage", "album": 7}}) == {
        "title": "X", "artist": None, "album": None, "is_playing": True, "progress_ms": None,
        "duration_ms": None, "track_id": None, "art_url": None, "kind": "track"}
    assert to_now(dict(fx("spotify_track.json"), device={"name": "Office"}))["device"] == "Office"
    assert largest_image([{"url": "javascript:x", "width": 999, "height": 999},
                          {"url": "https://a/1", "width": 1, "height": 1}]) == "https://a/1"
    assert largest_image(None) is None


# ------------------------------------------------------------------------------ tokens

async def test_token_is_cached_and_refreshed_on_expiry():
    api = Api((200, fx("spotify_track.json"), {}), expires_in=3600)
    s = make(api)
    await s.fetch()
    await s.fetch()
    assert len(api.token_requests()) == 1                       # cached
    s.clock.t += 3600 - 59                                      # within 60 s of expiry: refresh early
    await s.fetch()
    assert len(api.token_requests()) == 2
    assert api.player_requests()[-1].headers["authorization"] == "Bearer access-SECRET-2"


async def test_401_refreshes_and_retries_once():
    api = Api((401, {"error": {"status": 401, "message": "The access token expired"}}, {}),
              (200, fx("spotify_track.json"), {}))
    s = make(api)
    v = (await s.fetch())[0]["value"]
    assert v["title"] == "Teardrop"
    assert len(api.token_requests()) == 2 and len(api.player_requests()) == 2
    assert [r.headers["authorization"] for r in api.player_requests()] == ["Bearer access-SECRET-1",
                                                                           "Bearer access-SECRET-2"]


async def test_401_twice_is_an_error_not_a_loop():
    api = Api((401, {"error": {"status": 401, "message": "Invalid access token"}}, {}))
    s = make(api)
    with pytest.raises(SourceError, match="401 after a token refresh") as e:
        await s.fetch()
    assert len(api.player_requests()) == 2
    assert_no_secrets(e.value)


async def test_rotated_refresh_token_is_used_next_time():
    api = Api((200, fx("spotify_track.json"), {}), token_body={"access_token": "access-SECRET-1",
                                                               "expires_in": 3600, "refresh_token": "rt-NEW-ROTATED"})
    s = make(api)
    await s.fetch()
    api.token_body = None
    s._token = None
    await s.fetch()
    assert parse_qs(api.token_requests()[1].content.decode())["refresh_token"] == ["rt-NEW-ROTATED"]


async def test_bad_refresh_token_error_names_host_only(caplog):
    api = Api(token_status=400)
    s = make(api)
    with pytest.raises(SourceError) as e:
        await s.fetch()
    msg = str(e.value)
    assert "accounts.spotify.com" in msg and "HTTP 400" in msg and "invalid_grant" in msg
    assert "spotify_auth.py" in msg
    assert_no_secrets(msg)


# ------------------------------------------------------------------------------ 429, errors

def test_retry_after_parsing():
    assert retry_after_s("7") == 7
    assert retry_after_s(None) == 60 and retry_after_s("soon") == 60
    assert retry_after_s("0") == 1 and retry_after_s("999999") == 86400
    when = datetime(2026, 10, 10, 13, 2, tzinfo=timezone.utc)
    assert retry_after_s("Sat, 10 Oct 2026 13:02:00 GMT", now=when - timedelta(seconds=90)) == 90


async def test_429_respects_retry_after():
    api = Api((429, None, {"Retry-After": "17"}), (200, fx("spotify_track.json"), {}))
    s = make(api)
    with pytest.raises(RateLimited) as e:
        await s.fetch()
    assert e.value.retry_after == 17 and "429" in str(e.value)
    # in run(): the next request waits exactly Retry-After
    s2 = make(Api((429, None, {"Retry-After": "17"}), (200, fx("spotify_track.json"), {})))
    waits, emitted = [], []

    async def sleep(t):
        waits.append(t)
        if len(waits) >= 2:
            raise asyncio.CancelledError
    s2.sleep = sleep

    async def emit(items):
        emitted.append(items)
    with pytest.raises(asyncio.CancelledError):
        await s2.run(emit)
    assert waits == [17, 5]                                     # Retry-After, then the playing interval
    assert len(emitted) == 1 and emitted[0][0]["value"]["title"] == "Teardrop"
    assert "rate limited" in s2.status.last_error


async def test_malformed_json_and_other_errors():
    for body, match in ((b"{not json", "not JSON"), (b"[1, 2]", "not an object")):
        s = make(Api((200, body, {"content-type": "application/json"})))
        with pytest.raises(SourceError, match=match) as e:
            await s.fetch()
        assert "api.spotify.com" in str(e.value)
    s = make(Api((503, None, {})))
    with pytest.raises(SourceError, match="HTTP 503"):
        await s.fetch()
    s = make(Api((403, {"error": {"status": 403, "message": "User not registered"}}, {})))
    with pytest.raises(SourceError, match="User Management"):
        await s.fetch()

    def boom(req):
        raise httpx.ConnectError(f"connect failed for {req.url} with {REFRESH}")
    s = make(boom)
    with pytest.raises(SourceError, match="ConnectError") as e:
        await s.fetch()
    assert_no_secrets(e.value)

    def slow(req):
        raise httpx.ReadTimeout("timed out")
    s = make(slow)
    with pytest.raises(SourceError, match="timed out"):
        await s.fetch()


# ------------------------------------------------------------------------------ adaptive run loop

async def test_adaptive_interval_and_error_backoff():
    playing = (200, fx("spotify_track.json"), {})
    api = Api(playing, playing, (204, None, {}), (500, None, {}), (500, None, {}), playing)
    s = make(api)
    waits, emitted = [], []

    async def sleep(t):
        waits.append(t)
        if len(waits) >= 6:
            raise asyncio.CancelledError
    s.sleep = sleep

    async def emit(items):
        emitted.append(items[0])
    with pytest.raises(asyncio.CancelledError):
        await s.run(emit)
    #        playing playing idle  error error(x2)  playing
    assert waits == [5, 5, 30, 30, 60, 5]
    assert [e["ttl_s"] for e in emitted] == [15, 15, 90, 15]
    assert s.status.signals_emitted == 4 and s.status.last_ok is not None


async def test_custom_intervals_and_fixed_ttl():
    s = make(Api((204, None, {})), every="3s", idle_every="1m", ttl="10m")
    items = await s.fetch()
    assert s.next_wait == 60 and items[0]["ttl_s"] == 600
    assert s.playing_every == 3


# ------------------------------------------------------------------------------ secrets in logs

async def test_secrets_never_in_errors_status_or_logs(caplog):
    caplog.set_level(logging.DEBUG)
    # the server echoes our credentials back in its error (worst case)
    api = Api(token_status=400, token_body={"error": "invalid_client",
                                            "error_description": f"bad {SECRET} / {REFRESH} / {CID}"})
    s = make(api)
    waits = []

    async def sleep(t):
        waits.append(t)
        if len(waits) >= 2:
            raise asyncio.CancelledError
    s.sleep = sleep
    with pytest.raises(asyncio.CancelledError):
        await s.run(lambda items: None)
    assert s.status.last_error and "invalid_client" in s.status.last_error
    assert waits == [30, 60]                                  # auth errors back off, no hammering
    assert_no_secrets(s.status.last_error, caplog.text, repr(s))
    assert CID not in s.status.last_error

    # a 401 path, a 429 path and a successful one log nothing secret either
    api = Api((401, None, {}), (429, None, {"Retry-After": "3"}))
    s = make(api)
    with pytest.raises(SourceError) as e:
        await s.fetch()
    assert_no_secrets(e.value, caplog.text)


# ------------------------------------------------------------------------------ options

def test_registered_and_option_validation():
    assert REGISTRY["spotify"] is Spotify
    ctx = AdapterContext(http=httpx.AsyncClient(), log=logging.getLogger("t"), data_dir=Path("."), settings={})
    base = {"client_id": CID, "client_secret": SECRET, "refresh_token": REFRESH}
    for bad, match in (({}, "client_id"), ({**base, "client_secret": " "}, "empty"),
                       ({**base, "refresh_token": 5}, "refresh_token"),
                       ({**base, "every": "0.5s"}, "at least 1s"),
                       ({**base, "every": "10s", "idle_every": "5s"}, "idle_every"),
                       ({**base, "idle_every": "soon"}, "idle_every"),
                       ({**base, "token": "x"}, "unknown option")):
        with pytest.raises(OptionError, match=match) as e:
            Spotify("music", bad, ctx)
        assert_no_secrets(e.value)
    s = Spotify("music", base, ctx)
    assert s.every == 5 and s.idle_every == 30 and s.timeout == 10


# ------------------------------------------------------------------------------ progress anchor

class Live:
    """A player whose progress follows the adapter's clock (plus optional jitter / seeks)."""

    def __init__(self):
        self.doc = fx("spotify_track.json")
        self.t = T0
        self.start_progress = 81000          # progress at T0
        self.jitter_ms = 0

    def handler(self, req):
        if str(req.url) == TOKEN_URL:
            return httpx.Response(200, json={"access_token": "access-SECRET-1", "expires_in": 3600})
        doc = dict(self.doc)
        if doc["is_playing"]:
            doc["progress_ms"] = int(self.start_progress + (self.t - T0).total_seconds() * 1000 + self.jitter_ms)
        else:
            doc["progress_ms"] = self.start_progress
        return httpx.Response(200, json=doc)


async def poll(s, live, pool, seconds, jitter_ms=0):
    live.t = T0 + timedelta(seconds=seconds)
    live.jitter_ms = jitter_ms
    s.now = lambda: live.t
    items = await s.fetch()
    changed = await pool.publish([coerce(items[0], source="music", ttl_s=s.ttl_s)])   # real ts: fresh
    return items[0]["value"], len(changed)


@pytest.fixture
async def history_pool(tmp_path):
    from ambient.pool import Pool
    pool = Pool(tmp_path, flush_delay_s=0)
    await pool.start()
    yield pool
    await pool.close()


async def test_steady_playback_gives_no_pool_change_and_no_history(history_pool):
    live = Live()
    s = make(live.handler)
    first, n = await poll(s, live, history_pool, 0)
    assert n == 1 and first["progress_ms"] == 81000
    assert first["anchor_at"] == "2026-10-10T13:00:00.000+00:00"
    for i in range(1, 25):                                    # 2 minutes of 5 s polls, network jitter
        v, n = await poll(s, live, history_pool, 5 * i, jitter_ms=(-800, 600, 1200, -300)[i % 4])
        assert n == 0 and v == first                          # identical value: ts refresh only
    rows = await history_pool.history("music.now")
    assert len(rows) == 1                                     # one history row, not 25


async def test_seek_reanchors_once(history_pool):
    live = Live()
    s = make(live.handler)
    await poll(s, live, history_pool, 0)
    await poll(s, live, history_pool, 5)
    live.start_progress += 60000                              # the user skips ahead a minute
    v, n = await poll(s, live, history_pool, 10)
    assert n == 1 and v["progress_ms"] == 81000 + 60000 + 10000
    assert v["anchor_at"] == "2026-10-10T13:00:10.000+00:00"
    for t in (15, 20, 25):
        v2, n = await poll(s, live, history_pool, t)
        assert n == 0 and v2 == v                             # anchored again: no further changes
    # buffering: the position stalls by more than 2.5 s -> one re-anchor
    live.start_progress -= 3000
    v3, n = await poll(s, live, history_pool, 30)
    assert n == 1 and v3["anchor_at"] == "2026-10-10T13:00:30.000+00:00"
    assert len(await history_pool.history("music.now")) == 3


async def test_pause_resume_track_and_duration_changes_reanchor(history_pool):
    live = Live()
    s = make(live.handler)
    await poll(s, live, history_pool, 0)
    live.start_progress = 81000 + 20000                       # pause at 20 s in
    live.doc = dict(live.doc, is_playing=False, timestamp=None)
    paused, n = await poll(s, live, history_pool, 20)
    assert n == 1 and paused["is_playing"] is False and paused["progress_ms"] == 101000
    assert paused["anchor_at"] == "2026-10-10T13:00:20.000+00:00"
    same, n = await poll(s, live, history_pool, 50)
    assert n == 0 and same == paused                          # still paused: unchanged
    live.doc = dict(live.doc, is_playing=True)                # resume at 101 s, at T0 + 60 s
    live.start_progress = 101000 - 60000
    resumed, n = await poll(s, live, history_pool, 60)
    assert n == 1 and resumed["progress_ms"] == 101000
    assert resumed["anchor_at"] == "2026-10-10T13:01:00.000+00:00"
    # duration change (same track id, e.g. a re-mastered version swapped in)
    item = dict(live.doc["item"], duration_ms=331000)
    live.doc = dict(live.doc, item=item)
    v, n = await poll(s, live, history_pool, 65)
    assert n == 1 and v["duration_ms"] == 331000 and v["anchor_at"] == "2026-10-10T13:01:05.000+00:00"
    # next track
    live.doc = dict(live.doc, item=dict(item, id="nexttrack", name="Angel", duration_ms=379000))
    live.start_progress = 2000 - 70000                        # 2 s into the new track at T0 + 70 s
    v, n = await poll(s, live, history_pool, 70)
    assert n == 1 and v["title"] == "Angel" and v["progress_ms"] == 2000
    assert v["anchor_at"] == "2026-10-10T13:01:10.000+00:00"
