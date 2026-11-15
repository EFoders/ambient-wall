"""lastfm: now playing from any player that scrobbles to Last.fm (Spotify, Apple Music via a scrobbler,
foobar2000, Plex, phones...). Read-only `user.getrecenttracks`.

    [[source]]
    name = "music"                      # the default [wall] now_playing binding is "music.now"
    type = "lastfm"
    api_key = "${LASTFM_API_KEY}"       # https://www.last.fm/api/account/create (read-only key)
    user = "your-lastfm-username"
    # every = "15s"
    # timeout = "10s"

Key:
  now   {title, artist, album, is_playing: true, progress_ms: null, duration_ms: null, track_id,
         art_url, kind: "track"} for the track Last.fm flags `@attr.nowplaying`, else null.
        Last.fm has no progress or pause state: a track simply stops being "now playing".
        art_url = the largest image Last.fm has (its grey star placeholder counts as none).
        Signal meta {"provider": "lastfm"}.

Privacy (SPEC 1.4): pull only. The request carries the API key and your (public) Last.fm username,
which the API needs to answer; errors and logs name the host only.
"""
from __future__ import annotations

from typing import Any

import httpx

from ._shared import OptionError, SourceError, opt, opt_duration, redact_url
from .base import Adapter, register

API = "https://ws.audioscrobbler.com/2.0/"
ALLOWED_OPTIONS = {"api_key", "user", "every", "ttl", "visibility", "timeout"}
SIZES = {"small": 1, "medium": 2, "large": 3, "extralarge": 4, "mega": 5}
PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f"      # Last.fm's "no image" star


def _text(v: Any) -> str | None:
    if isinstance(v, dict):
        v = v.get("#text") or v.get("name")
    if not isinstance(v, str):
        return None
    s = " ".join(v.split())
    return s or None


def largest_image(images: Any) -> str | None:
    best, rank = None, -1
    for img in images if isinstance(images, list) else []:
        if not isinstance(img, dict):
            continue
        url = img.get("#text")
        if not isinstance(url, str) or not url.startswith(("https://", "http://")) or PLACEHOLDER in url:
            continue
        r = SIZES.get(str(img.get("size")), 0)
        if r > rank:
            best, rank = url, r
    return best


def to_now(doc: Any) -> dict[str, Any] | None:
    """A user.getrecenttracks JSON document -> the `now` value, or None. Pure."""
    rt = doc.get("recenttracks") if isinstance(doc, dict) else None
    if not isinstance(rt, dict):
        raise ValueError("no recenttracks in the response")
    tracks = rt.get("track")
    if isinstance(tracks, dict):                       # a single track comes back as an object
        tracks = [tracks]
    for t in tracks if isinstance(tracks, list) else []:
        if not isinstance(t, dict):
            continue
        attr = t.get("@attr") if isinstance(t.get("@attr"), dict) else {}
        if str(attr.get("nowplaying", "")).lower() != "true":
            continue
        title = _text(t.get("name"))
        if title is None:
            return None
        return {"title": title, "artist": _text(t.get("artist")), "album": _text(t.get("album")),
                "is_playing": True, "progress_ms": None, "duration_ms": None,
                "track_id": _text(t.get("mbid")) or _text(t.get("url")),
                "art_url": largest_image(t.get("image")), "kind": "track"}
    return None


@register("lastfm")
class LastFm(Adapter):
    default_every = 15.0

    def __init__(self, name: str, options: dict[str, Any], ctx):
        super().__init__(name, options, ctx)
        unknown = sorted(set(options) - ALLOWED_OPTIONS)
        if unknown:
            raise OptionError(f"source {name!r}: unknown option(s) {', '.join(unknown)}; lastfm takes "
                              f"api_key, user, every, timeout")
        self._api_key = opt(options, "api_key", str, source=name).strip()
        self.user = opt(options, "user", str, source=name).strip()
        if not self._api_key or not self.user:
            raise OptionError(f"source {name!r}: api_key and user must not be empty")
        if self.every is not None and self.every < 5:
            raise OptionError(f"source {name!r}: every must be at least 5s (Last.fm rate limits)")
        self.timeout = opt_duration(options, "timeout", 10.0, source=name)

    def __repr__(self) -> str:
        return f"<LastFm source {self.name!r}>"

    def scrub(self, text: str) -> str:
        return text.replace(self._api_key, "***") if len(self._api_key) >= 4 else text

    async def fetch(self):
        shown = redact_url(API)
        params = {"method": "user.getrecenttracks", "user": self.user, "api_key": self._api_key,
                  "format": "json", "limit": 1}
        try:
            r = await self.ctx.http.get(API, params=params, timeout=self.timeout)
        except httpx.TimeoutException:
            raise SourceError(f"GET {shown} timed out after {self.timeout:g} s") from None
        except httpx.HTTPError as e:
            raise SourceError(f"GET {shown} failed: {type(e).__name__}") from None
        try:
            doc = r.json()
        except ValueError:
            doc = None
        if isinstance(doc, dict) and "error" in doc:     # Last.fm reports errors as JSON
            msg = str(doc.get("message") or "")[:160]
            raise SourceError(self.scrub(f"GET {shown}: Last.fm error {doc.get('error')}"
                                         f"{': ' + msg if msg else ''} (HTTP {r.status_code})"))
        if not 200 <= r.status_code < 300:
            raise SourceError(f"GET {shown} returned HTTP {r.status_code}")
        if doc is None:
            raise SourceError(f"GET {shown}: response is not JSON")
        try:
            now = to_now(doc)
        except ValueError as e:
            raise SourceError(f"GET {shown}: {e}") from None
        self.status.extra["state"] = "playing" if now else "idle"
        return [{"key": "now", "value": now, "type": "object", "meta": {"provider": "lastfm"}}]
