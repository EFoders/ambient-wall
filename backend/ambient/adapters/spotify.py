"""spotify: what is playing on your Spotify account right now (Web API, read-only scopes).

    [[source]]
    name = "music"                         # the default [wall] now_playing binding is "music.now"
    type = "spotify"
    client_id = "${SPOTIFY_CLIENT_ID}"
    client_secret = "${SPOTIFY_CLIENT_SECRET}"
    refresh_token = "${SPOTIFY_REFRESH_TOKEN}"
    # every = "5s"                         # poll interval while something is playing
    # idle_every = "30s"                   # poll interval when paused / nothing playing
    # timeout = "10s"

One-time setup (on a PC with a browser, not in the container): create an app at
https://developer.spotify.com/dashboard with the redirect URI http://127.0.0.1:8888/callback, then run
`python scripts/spotify_auth.py` and paste the three lines it prints into config/secrets.toml.

Key:
  now   {title, artist, album, is_playing, progress_ms, anchor_at, duration_ms, track_id, art_url,
         kind, paused_since?, device?} or null (nothing playing, an ad, or no active device).
        progress_ms is the position AT anchor_at (ISO, ms): both stay fixed while playback is
        continuous, so steady playback re-emits an identical value (no history row, no wall push);
        the browser extrapolates. Re-anchored on a track change, play/pause, a duration change, or a
        position more than 2.5 s off the extrapolation (seek / buffering).
        kind = track | episode | local. Episodes: artist = the show, album = the publisher.
        paused_since (ISO) is set while paused: the wall hides the element after [wall] now_playing_idle.
        Signal meta {"provider": "spotify"}; ttl = 3 x the current poll interval (or `ttl`).

Polling is adaptive: `every` (5 s) while playing, `idle_every` (30 s) otherwise. 204 = nothing
playing. 401 = the cached access token is refreshed and the request retried once. 429 = wait for
Retry-After before the next request. Other errors back off (idle_every, doubling, max 10 min).

Privacy (SPEC 1.4): pull only. The only things sent are what Spotify requires: the client id/secret
and refresh token to the token endpoint, the access token to the API. None of them, nor any URL with
a query, ever appears in a log line or /api/sources (errors name the host only).
"""
from __future__ import annotations

import asyncio
import base64
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Callable

import httpx

from ..signal import utcnow
from ._shared import OptionError, ProgressAnchor, SourceError, iso, opt, opt_duration
from .base import Adapter, register

TOKEN_URL = "https://accounts.spotify.com/api/token"
PLAYER_URL = "https://api.spotify.com/v1/me/player/currently-playing"
SCOPES = "user-read-currently-playing user-read-playback-state"
ALLOWED_OPTIONS = {"client_id", "client_secret", "refresh_token", "every", "idle_every", "timeout", "ttl",
                   "visibility"}
TOKEN_HOST = "https://accounts.spotify.com/..."
API_HOST = "https://api.spotify.com/..."
MAX_BACKOFF = 600.0
DEFAULT_RETRY_AFTER = 60.0


class RateLimited(SourceError):
    def __init__(self, host: str, retry_after: float):
        super().__init__(f"{host} rate limited (HTTP 429); next try in {retry_after:g} s")
        self.retry_after = retry_after


def retry_after_s(value: str | None, now: datetime | None = None) -> float:
    """Retry-After header (seconds or an HTTP date) -> seconds, clamped to 1 s .. 24 h (default 60)."""
    if not value:
        return DEFAULT_RETRY_AFTER
    v = value.strip()
    try:
        secs = float(v)
    except ValueError:
        try:
            when = parsedate_to_datetime(v)
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
            secs = (when - (now or utcnow())).total_seconds()
        except (TypeError, ValueError, IndexError):
            return DEFAULT_RETRY_AFTER
    if secs != secs:            # NaN
        return DEFAULT_RETRY_AFTER
    return max(1.0, min(86400.0, secs))


def largest_image(images: Any) -> str | None:
    """URL of the biggest image in a Spotify `images` list ([{url, width, height}]), http(s) only."""
    best, best_area = None, -1
    for img in images if isinstance(images, list) else []:
        if not isinstance(img, dict):
            continue
        url = img.get("url")
        if not isinstance(url, str) or not url.startswith(("https://", "http://")):
            continue
        w, h = img.get("width"), img.get("height")
        area = (w if isinstance(w, int) else 0) * (h if isinstance(h, int) else 0)
        if area > best_area:
            best, best_area = url, area
    return best


def _str(v: Any) -> str | None:
    if not isinstance(v, str):
        return None
    s = " ".join(v.split())
    return s or None


def _ms(v: Any) -> int | None:
    return int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and v >= 0 else None


def to_now(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    """A currently-playing response (None = 204) -> the `now` value, or None. Pure."""
    if not isinstance(doc, dict):
        return None
    item = doc.get("item")
    kind = doc.get("currently_playing_type")
    if kind == "ad" or not isinstance(item, dict):
        return None                                        # ads / unknown: nothing worth showing
    title = _str(item.get("name"))
    if title is None:
        return None
    if item.get("type") == "episode" or kind == "episode":
        show = item.get("show") if isinstance(item.get("show"), dict) else {}
        artist = _str(show.get("name"))
        album = _str(show.get("publisher"))
        art = largest_image(item.get("images")) or largest_image(show.get("images"))
        out_kind = "episode"
    else:
        names = [_str(a.get("name")) for a in item.get("artists") or [] if isinstance(a, dict)]
        artist = ", ".join(n for n in names if n) or None
        album_obj = item.get("album") if isinstance(item.get("album"), dict) else {}
        album = _str(album_obj.get("name"))
        art = largest_image(album_obj.get("images"))
        out_kind = "local" if item.get("is_local") else "track"
    value: dict[str, Any] = {
        "title": title, "artist": artist, "album": album, "is_playing": doc.get("is_playing") is True,
        "progress_ms": _ms(doc.get("progress_ms")), "duration_ms": _ms(item.get("duration_ms")),
        "track_id": _str(item.get("id")) or _str(item.get("uri")), "art_url": art, "kind": out_kind,
    }
    device = doc.get("device")
    if isinstance(device, dict) and _str(device.get("name")):
        value["device"] = _str(device.get("name"))
    return value


@register("spotify")
class Spotify(Adapter):
    default_every = 5.0

    def __init__(self, name: str, options: dict[str, Any], ctx):
        super().__init__(name, options, ctx)
        unknown = sorted(set(options) - ALLOWED_OPTIONS)
        if unknown:
            raise OptionError(f"source {name!r}: unknown option(s) {', '.join(unknown)}; spotify takes "
                              f"client_id, client_secret, refresh_token, every, idle_every, timeout")
        for k in ("client_id", "client_secret", "refresh_token"):
            v = opt(options, k, str, source=name)
            if not v.strip():
                raise OptionError(f"source {name!r}: option {k!r} is empty")
        self.client_id = options["client_id"].strip()
        self._client_secret = options["client_secret"].strip()
        self._refresh_token = options["refresh_token"].strip()
        self.playing_every = opt_duration(options, "every", self.default_every, source=name)
        self.idle_every = opt_duration(options, "idle_every", 30.0, source=name)
        if self.playing_every < 1:
            raise OptionError(f"source {name!r}: every must be at least 1s")
        if self.idle_every < self.playing_every:
            raise OptionError(f"source {name!r}: idle_every must be >= every")
        self.timeout = opt_duration(options, "timeout", 10.0, source=name)
        self.fixed_ttl = opt_duration(options, "ttl", 0.0, source=name) if options.get("ttl") is not None else None
        self.every = self.playing_every
        self.next_wait = self.idle_every
        self._token: tuple[str, float] | None = None
        self._paused: tuple[str, str] | None = None        # (track key, paused_since ISO)
        self.anchor = ProgressAnchor()
        self.clock: Callable[[], float] = time.monotonic
        self.sleep = asyncio.sleep

    def now(self) -> datetime:
        return utcnow()

    # ------------------------------------------------------------------ secrets
    def scrub(self, text: str) -> str:
        """Defence in depth: no credential ever survives into a message, even if a server echoes it."""
        for s in (self._client_secret, self._refresh_token, self._token[0] if self._token else None,
                  self.client_id):
            if s and len(s) >= 4:
                text = text.replace(s, "***")
        return text

    def __repr__(self) -> str:
        return f"<Spotify source {self.name!r}>"

    # ------------------------------------------------------------------ auth
    async def token(self, *, force: bool = False) -> str:
        if not force and self._token is not None and self._token[1] > self.clock() + 60:
            return self._token[0]
        basic = base64.b64encode(f"{self.client_id}:{self._client_secret}".encode()).decode()
        try:
            r = await self.ctx.http.post(TOKEN_URL, timeout=self.timeout,
                                         headers={"Authorization": f"Basic {basic}"},
                                         data={"grant_type": "refresh_token",
                                               "refresh_token": self._refresh_token})
        except httpx.TimeoutException:
            raise SourceError(f"POST {TOKEN_HOST} timed out after {self.timeout:g} s") from None
        except httpx.HTTPError as e:
            raise SourceError(f"POST {TOKEN_HOST} failed: {type(e).__name__}") from None
        if r.status_code == 429:
            raise RateLimited(TOKEN_HOST, retry_after_s(r.headers.get("retry-after")))
        try:
            body = r.json()
        except ValueError:
            body = None
        if r.status_code != 200:
            err = ""
            if isinstance(body, dict):
                code = body.get("error")
                desc = body.get("error_description")
                err = ": " + " ".join(str(x) for x in (code, f"({desc})" if desc else None) if x)[:200]
            hint = " (re-run scripts/spotify_auth.py)" if r.status_code in (400, 401) else ""
            raise SourceError(self.scrub(f"POST {TOKEN_HOST} returned HTTP {r.status_code}{err}{hint}"))
        if not isinstance(body, dict) or not isinstance(body.get("access_token"), str):
            raise SourceError(f"POST {TOKEN_HOST}: response has no access_token")
        expires = body.get("expires_in")
        expires = float(expires) if isinstance(expires, (int, float)) and not isinstance(expires, bool) else 3600.0
        new_refresh = body.get("refresh_token")
        if isinstance(new_refresh, str) and new_refresh and new_refresh != self._refresh_token:
            # Spotify may rotate it. Kept in memory only; secrets.toml is read-only to the wall.
            self._refresh_token = new_refresh
            self.ctx.log.info("source %s: Spotify issued a new refresh token (kept in memory)", self.name)
        self._token = (body["access_token"], self.clock() + max(60.0, expires))
        return self._token[0]

    # ------------------------------------------------------------------ player
    async def _get(self, token: str) -> httpx.Response:
        try:
            return await self.ctx.http.get(PLAYER_URL, params={"additional_types": "episode"},
                                           headers={"Authorization": f"Bearer {token}"}, timeout=self.timeout)
        except httpx.TimeoutException:
            raise SourceError(f"GET {API_HOST} timed out after {self.timeout:g} s") from None
        except httpx.HTTPError as e:
            raise SourceError(f"GET {API_HOST} failed: {type(e).__name__}") from None

    async def poll(self) -> dict[str, Any] | None:
        """The currently-playing document, or None for 204 / an empty body."""
        r = await self._get(await self.token())
        if r.status_code == 401:                               # expired or revoked: refresh, retry once
            self._token = None
            r = await self._get(await self.token(force=True))
            if r.status_code == 401:
                raise SourceError(f"GET {API_HOST} returned HTTP 401 after a token refresh "
                                  f"(re-run scripts/spotify_auth.py)")
        if r.status_code == 429:
            raise RateLimited(API_HOST, retry_after_s(r.headers.get("retry-after")))
        if r.status_code == 204:
            return None
        if r.status_code == 403:
            raise SourceError(f"GET {API_HOST} returned HTTP 403 (in development mode, add your Spotify "
                              f"account under User Management in the app's dashboard)")
        if not 200 <= r.status_code < 300:
            raise SourceError(f"GET {API_HOST} returned HTTP {r.status_code}")
        if not r.content.strip():
            return None
        try:
            doc = r.json()
        except ValueError:
            raise SourceError(f"GET {API_HOST}: response is not JSON") from None
        if not isinstance(doc, dict):
            raise SourceError(f"GET {API_HOST}: unexpected response (not an object)")
        return doc

    async def fetch(self):
        doc = await self.poll()
        now = to_now(doc)
        active = (now is not None and now["is_playing"]) or \
                 (isinstance(doc, dict) and doc.get("currently_playing_type") == "ad" and doc.get("is_playing") is True)
        self.next_wait = self.playing_every if active else self.idle_every
        if now is not None and not now["is_playing"]:
            key = now["track_id"] or now["title"]
            if self._paused is None or self._paused[0] != key:
                at = self.now()
                ts = doc.get("timestamp") if isinstance(doc, dict) else None
                if isinstance(ts, (int, float)) and not isinstance(ts, bool) and ts > 0:
                    try:
                        changed = datetime.fromtimestamp(ts / 1000, timezone.utc)
                        if changed < at:
                            at = changed                       # Spotify's "state last changed" time
                    except (OverflowError, OSError, ValueError):
                        pass
                self._paused = (key, iso(at))
            now["paused_since"] = self._paused[1]
        else:
            self._paused = None
        now = self.anchor.apply(now, self.now())
        ttl = self.fixed_ttl or 3 * self.next_wait
        self.status.extra.update({"state": "playing" if active else ("paused" if now else "idle"),
                                  "next_poll_s": self.next_wait})
        return [{"key": "now", "value": now, "type": "object", "ttl_s": ttl, "meta": {"provider": "spotify"}}]

    async def run(self, emit) -> None:
        """Adaptive loop: next_wait after a good poll, Retry-After after a 429, backoff after errors."""
        backoff: float | None = None
        while True:
            try:
                items = list(await self.fetch())
                await emit(items)
                self.status.last_ok = utcnow()
                self.status.signals_emitted += len(items)
                backoff = None
                wait = self.next_wait
            except asyncio.CancelledError:
                raise
            except RateLimited as e:
                wait = e.retry_after
                self._fail(e)
            except Exception as e:  # noqa: BLE001 - recorded, retried; the scheduler never dies
                backoff = self.idle_every if backoff is None else min(backoff * 2, MAX_BACKOFF)
                wait = backoff
                self._fail(e)
            await self.sleep(wait)

    def _fail(self, e: Exception) -> None:
        msg = self.scrub(str(e)) if isinstance(e, SourceError) else f"{type(e).__name__}: {self.scrub(str(e))}"
        self.status.last_error = msg
        self.status.last_error_at = utcnow()
        self.ctx.log.warning("source %s failed: %s", self.name, msg)
