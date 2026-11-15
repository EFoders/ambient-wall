"""OPTIONAL, best effort: push "now playing" from ANY Windows media player to the wall.

Reads the Windows media session (GlobalSystemMediaTransportControls: the overlay you see when you
press a media key) so it works with Spotify desktop, browsers (YouTube, SoundCloud...), foobar2000,
VLC, Apple Music, etc. Runs on the Windows PC that plays the music, not in the container:

    uv run --with winsdk scripts/nowplaying_windows.py --wall http://<box>:8700
    # with [server] push_token set:  set AMBIENT_PUSH_TOKEN=...  (or --token)

Wall side, one push source (config/config.toml):

    [[source]]
    name = "music"
    type = "push"
    ttl = "1m"          # the helper re-pushes every 20 s; if the PC sleeps the element goes away

It POSTs {"key": "now", "value": {title, artist, album, is_playing, progress_ms, anchor_at,
duration_ms, paused_since?, source}, "ttl": "60s"} to /api/publish/<source> when the value changes,
and every --heartbeat seconds otherwise (an identical value: the wall only refreshes its ts).
progress_ms is the position at anchor_at (the session's last_updated_time); the anchor is kept while
playback is continuous (re-anchored on a track / play-state / duration change or a > 2.5 s jump); {"key": "now", "value": null} when nothing is playing.
No album art (Windows exposes a thumbnail stream, not a URL). Only your own LAN is contacted.
Needs `winsdk` (or the `winrt-Windows.Media.Control` packages); everything else is standard library.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any


def _secs(v: Any) -> float | None:
    if isinstance(v, timedelta):
        return v.total_seconds()
    if isinstance(v, (int, float)):
        return float(v)
    return None


def build_value(*, title: str | None, artist: str | None, album: str | None, playing: bool,
                position: Any = None, end_time: Any = None, last_updated: datetime | None = None,
                now: datetime | None = None, app: str | None = None) -> dict[str, Any] | None:
    """Media-session fields -> the wall's `now` value (None when there is no title). Pure.
    progress_ms = the position as of `last_updated` (= anchor_at; `now` when not given)."""
    title = " ".join((title or "").split())
    if not title:
        return None
    now = now or datetime.now(timezone.utc)
    pos = _secs(position)
    dur = _secs(end_time)
    anchor = now
    if isinstance(last_updated, datetime) and last_updated.year > 1601:     # 1601 = WinRT "never"
        anchor = last_updated if last_updated.tzinfo else last_updated.replace(tzinfo=timezone.utc)
        anchor = min(anchor, now)
    if dur is not None and dur <= 0:
        dur = None
    if pos is not None and dur is not None:
        pos = min(pos, dur)
    src = (app or "windows").rsplit("!", 1)[-1].removesuffix(".exe") or "windows"
    return {"title": title, "artist": " ".join((artist or "").split()) or None,
            "album": " ".join((album or "").split()) or None, "is_playing": bool(playing),
            "progress_ms": int(pos * 1000) if pos is not None and pos >= 0 else None,
            "anchor_at": anchor.astimezone(timezone.utc).isoformat(timespec="milliseconds"),
            "duration_ms": int(dur * 1000) if dur is not None else None, "source": src.lower()}


SEEK_TOLERANCE_MS = 2500


def stabilise(prev: dict[str, Any] | None, value: dict[str, Any] | None) -> dict[str, Any] | None:
    """Keep the previous anchor (progress_ms + anchor_at) while playback is continuous, so a player
    that refreshes its timeline often still produces an identical value."""
    if prev is None or value is None:
        return value
    same = all(prev.get(k) == value.get(k) for k in ("title", "artist", "is_playing", "duration_ms"))
    if not same or prev.get("progress_ms") is None or value.get("progress_ms") is None:
        return value
    elapsed = 0.0
    if value["is_playing"]:
        elapsed = (datetime.fromisoformat(value["anchor_at"])
                   - datetime.fromisoformat(prev["anchor_at"])).total_seconds() * 1000
    if abs(value["progress_ms"] - (prev["progress_ms"] + elapsed)) <= SEEK_TOLERANCE_MS:
        return dict(value, progress_ms=prev["progress_ms"], anchor_at=prev["anchor_at"])
    return value


class Tracker:
    """Adds paused_since and decides when to push (state change, or a heartbeat)."""

    def __init__(self, heartbeat_s: float = 20.0):
        self.heartbeat_s = heartbeat_s
        self._key: Any = None
        self._prev: dict[str, Any] | None = None
        self._paused: tuple[tuple, str] | None = None
        self._last_push = 0.0

    def update(self, value: dict[str, Any] | None, now: datetime, mono: float) -> dict[str, Any] | None | bool:
        """Returns the value to push, or False when nothing needs sending."""
        value = stabilise(self._prev, value)
        self._prev = value
        if value is not None and not value["is_playing"]:
            track = (value["title"], value["artist"])
            if self._paused is None or self._paused[0] != track:
                self._paused = (track, now.isoformat(timespec="seconds"))
            value = dict(value, paused_since=self._paused[1])
        else:
            self._paused = None
        key = None if value is None else json.dumps(value, sort_keys=True)
        if key != self._key or mono - self._last_push >= self.heartbeat_s:
            self._key = key
            self._last_push = mono
            return value
        return False


def push(wall: str, source: str, value: dict[str, Any] | None, token: str | None, ttl: str) -> None:
    body = json.dumps({"key": "now", "value": value, "ttl": ttl}).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{wall.rstrip('/')}/api/publish/{source}", data=body, headers=headers,
                                 method="POST")
    with urllib.request.urlopen(req, timeout=5) as r:
        r.read()


def _media_api():
    try:
        from winsdk.windows.media.control import (  # type: ignore[import-not-found]
            GlobalSystemMediaTransportControlsSessionManager as Manager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status)
    except ImportError:
        try:
            from winrt.windows.media.control import (  # type: ignore[import-not-found]
                GlobalSystemMediaTransportControlsSessionManager as Manager,
                GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status)
        except ImportError:
            sys.exit("needs winsdk:  uv run --with winsdk scripts/nowplaying_windows.py ...")
    return Manager, Status


async def read_session(manager, status_enum) -> dict[str, Any] | None:
    session = manager.get_current_session()
    if session is None:
        return None
    props = await session.try_get_media_properties_async()
    info = session.get_playback_info()
    tl = session.get_timeline_properties()
    return build_value(title=props.title, artist=props.artist, album=props.album_title,
                       playing=info.playback_status == status_enum.PLAYING, position=tl.position,
                       end_time=tl.end_time, last_updated=tl.last_updated_time,
                       app=session.source_app_user_model_id)


async def loop(a: argparse.Namespace) -> None:
    Manager, Status = _media_api()
    manager = await Manager.request_async()
    tracker = Tracker(a.heartbeat)
    while True:
        try:
            value = await read_session(manager, Status)
        except Exception as e:  # noqa: BLE001 - players come and go
            print(f"media session read failed: {type(e).__name__}", file=sys.stderr)
            value = None
        out = tracker.update(value, datetime.now(timezone.utc), time.monotonic())
        if out is not False:
            try:
                push(a.wall, a.source, out, a.token, a.ttl)
                if a.verbose:
                    print("pushed", "nothing playing" if out is None else f"{out['title']} - {out['artist']}")
            except (urllib.error.URLError, OSError) as e:
                print(f"push to the wall failed: {getattr(e, 'code', '') or type(e).__name__}", file=sys.stderr)
                tracker._key = None                    # retry on the next tick
        await asyncio.sleep(a.every)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Push Windows 'now playing' to the Ambient Wall.")
    ap.add_argument("--wall", default=os.environ.get("AMBIENT_WALL", "http://localhost:8700"))
    ap.add_argument("--source", default="music", help="the wall's type = \"push\" source name")
    ap.add_argument("--token", default=os.environ.get("AMBIENT_PUSH_TOKEN"), help="[server] push_token, if set")
    ap.add_argument("--every", type=float, default=2.0, help="seconds between media-session reads")
    ap.add_argument("--heartbeat", type=float, default=20.0, help="re-push unchanged state this often")
    ap.add_argument("--ttl", default="60s", help="how long each push stays fresh on the wall")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)
    try:
        asyncio.run(loop(a))
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
