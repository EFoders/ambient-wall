"""The command channel: show / dismiss an ask panel, set the theme, the mode, the sound (SPEC 5.2, 6).

Every command becomes one WebSocket frame sent to every connected wall (ARCHITECTURE "WebSocket /ws"):

    {"type":"command","name":"show","args":{"panel":"forecast","duration":20,"data":{...panel...}}}
    {"type":"command","name":"dismiss","args":{}}
    {"type":"command","name":"set_theme","args":{"theme":"nature"}}
    {"type":"command","name":"set_mode","args":{"mode":"work"|"ambient"|"auto"}}
    {"type":"command","name":"set_sound","args":{"on":true,"volume":0.4}}   (either key may be absent)
    {"type":"command","name":"set_cat","args":{"on":true,"coat":"ginger"}}  (either key may be absent)

REST (/api/show, /api/dismiss, /api/command) and, later, the voice router call the same functions:

    from ambient import commands
    await commands.show("forecast", 20)      # -> {"shown": True, "panel": "forecast", "duration": 20, ...}
    await commands.dismiss()
    await commands.set_theme("nature")       # SPEC 6 set_theme
    await commands.set_mode("work")          # SPEC 6 set_mode; clear_override == set_mode("auto")
    await commands.set_sound(on=True, volume=0.3)   # either or both; volume 0..1
    await commands.set_cat(on=True, coat="tabby")    # the cat in every scene; either or both

The module-level functions use the hub the server bound at startup (`bind(hub)`); a router running in
the server process (on its event loop) needs nothing else. Bad input raises CommandError (a ValueError) or
ask.UnknownPanel (a KeyError).

Fan-out never blocks and never fails because of one client: each WebSocket gets a bounded queue that
`broadcast` fills with put_nowait; the client's own task does the (possibly slow or failing) send.
A client whose queue is full is cut off (its connection closes and the browser reconnects).

Replay: the last `show` is kept until it expires (or a dismiss / newer show replaces it). A client that
connects while it is active, e.g. a reloaded wall, receives it right after hello + wall, with
`duration` reduced to the seconds remaining.
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import re
import time
from typing import Any, Callable

from . import ask

log = logging.getLogger("ambient.commands")

DEFAULT_DURATION = 20
MIN_DURATION = 5
MAX_DURATION = 120
MODES = ("work", "ambient", "auto")
THEME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
QUEUE_MAX = 32


class CommandError(ValueError):
    """Invalid command name or arguments (HTTP 422)."""


def clamp_duration(v: Any) -> int:
    """Seconds to show a panel: default 20, clamped to 5..120. Non-numbers raise CommandError."""
    if v is None:
        return DEFAULT_DURATION
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        if isinstance(v, str):
            try:
                v = float(v.strip())
            except ValueError:
                raise CommandError(f"duration must be a number of seconds, got {v!r}") from None
        else:
            raise CommandError(f"duration must be a number of seconds, got {type(v).__name__}")
    if not math.isfinite(v):
        raise CommandError("duration must be finite")
    return int(max(MIN_DURATION, min(MAX_DURATION, round(v))))


def validate_theme(theme: Any, known: set[str] | None = None) -> str:
    if not isinstance(theme, str) or not THEME_RE.match(theme.strip().lower()):
        raise CommandError("theme must be a theme id like \"nature\" (letters, digits, '-', '_')")
    t = theme.strip().lower()
    if known and t not in known:
        raise CommandError(f"unknown theme {t!r} (known: {', '.join(sorted(known))})")
    return t


def validate_mode(mode: Any) -> str:
    m = mode.strip().lower() if isinstance(mode, str) else None
    if m not in MODES:
        raise CommandError(f"mode must be one of {', '.join(MODES)}")
    return m


def validate_sound(on: Any = None, volume: Any = None) -> dict[str, Any]:
    """set_sound args: `on` (bool) and/or `volume` (number 0..1). At least one is required; only the
    given keys are returned (the browser keeps the other setting as it is)."""
    out: dict[str, Any] = {}
    if on is not None:
        if not isinstance(on, bool):
            raise CommandError("on must be true or false")
        out["on"] = on
    if volume is not None:
        if isinstance(volume, bool) or not isinstance(volume, (int, float)) or not math.isfinite(volume):
            raise CommandError("volume must be a number from 0 to 1")
        if not 0 <= volume <= 1:
            raise CommandError(f"volume must be from 0 to 1, got {volume!r}")
        out["volume"] = round(float(volume), 3)
    if not out:
        raise CommandError('set_sound needs "on" (true/false) and/or "volume" (0..1)')
    return out


def validate_cat(on: Any = None, coat: Any = None) -> dict[str, Any]:
    """set_cat args: `on` (bool) and/or `coat` (one of config.CAT_COATS). At least one is required; only the
    given keys are returned."""
    from .config import CAT_COATS
    out: dict[str, Any] = {}
    if on is not None:
        if not isinstance(on, bool):
            raise CommandError("on must be true or false")
        out["on"] = on
    if coat is not None:
        c = coat.strip().lower() if isinstance(coat, str) else None
        if c not in CAT_COATS:
            raise CommandError(f"coat must be one of {', '.join(CAT_COATS)}")
        out["coat"] = c
    if not out:
        raise CommandError('set_cat needs "on" (true/false) and/or "coat"')
    return out


def message(name: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"type": "command", "name": name, "args": args or {}}


class Client:
    """One connected wall: a bounded outbox the WebSocket task drains. `closed` = cut off by the hub."""

    def __init__(self, maxsize: int = QUEUE_MAX):
        self.queue: asyncio.Queue[str | None] = asyncio.Queue(maxsize=maxsize)
        self.closed = False

    def offer(self, msg: str) -> bool:
        if self.closed:
            return False
        try:
            self.queue.put_nowait(msg)
            return True
        except asyncio.QueueFull:
            self.kick()
            return False

    def kick(self) -> None:
        """Drop pending frames and tell the client task to close."""
        self.closed = True
        while not self.queue.empty():
            self.queue.get_nowait()
        self.queue.put_nowait(None)


class CommandHub:
    """Builds command messages and fans them out to every registered client.

    build_panel(name) -> panel dict | None (bound to the live pool and config by the server).
    clock() -> monotonic seconds (injectable for tests). known_themes: if non-empty, set_theme
    only accepts these ids."""

    def __init__(self, build_panel: Callable[[str], dict[str, Any] | None], *,
                 clock: Callable[[], float] = time.monotonic, known_themes: set[str] | None = None,
                 dumps: Callable[[Any], str] | None = None):
        self.build_panel = build_panel
        self.clock = clock
        self.known_themes = set(known_themes or ())
        self.dumps = dumps or (lambda o: json.dumps(o, separators=(",", ":")))
        self.clients: set[Client] = set()
        self._show: tuple[dict[str, Any], float, float] | None = None     # (msg, started, expires)

    # ------------------------------------------------------------------ clients
    def register(self, maxsize: int = QUEUE_MAX) -> Client:
        c = Client(maxsize)
        self.clients.add(c)
        return c

    def unregister(self, client: Client) -> None:
        self.clients.discard(client)

    def broadcast(self, msg: dict[str, Any]) -> int:
        """Queue `msg` for every client without awaiting anyone. Returns how many clients took it."""
        text = self.dumps(msg)
        n = 0
        for c in list(self.clients):
            try:
                if c.offer(text):
                    n += 1
                else:
                    self.clients.discard(c)
            except Exception:  # noqa: BLE001 - one broken client never stops the others
                log.exception("dropping a websocket client")
                self.clients.discard(c)
        return n

    def replay(self) -> str | None:
        """The active `show` (remaining duration), or None if nothing is showing."""
        if self._show is None:
            return None
        msg, _, expires = self._show
        left = expires - self.clock()
        if left <= 0:
            self._show = None
            return None
        args = dict(msg["args"], duration=max(1, math.ceil(left)))
        return self.dumps({**msg, "args": args})

    @property
    def showing(self) -> str | None:
        return None if self.replay() is None else self._show[0]["args"]["panel"]  # type: ignore[index]

    # ------------------------------------------------------------------ commands
    def show(self, panel: str, duration: Any = None) -> dict[str, Any]:
        if panel not in ask.PANELS:
            raise ask.UnknownPanel(panel)
        secs = clamp_duration(duration)
        data = self.build_panel(panel)
        if data is None:
            return {"shown": False, "panel": panel, "reason": "no data"}
        msg = message("show", {"panel": panel, "duration": secs, "data": data})
        now = self.clock()
        self._show = (msg, now, now + secs)
        n = self.broadcast(msg)
        return {"shown": True, "panel": panel, "duration": secs, "clients": n}

    def dismiss(self) -> dict[str, Any]:
        self._show = None
        return {"ok": True, "name": "dismiss", "clients": self.broadcast(message("dismiss"))}

    def set_theme(self, theme: Any) -> dict[str, Any]:
        t = validate_theme(theme, self.known_themes)
        args = {"theme": t}
        return {"ok": True, "name": "set_theme", "args": args,
                "clients": self.broadcast(message("set_theme", args))}

    def set_mode(self, mode: Any) -> dict[str, Any]:
        args = {"mode": validate_mode(mode)}
        return {"ok": True, "name": "set_mode", "args": args,
                "clients": self.broadcast(message("set_mode", args))}

    def set_sound(self, on: Any = None, volume: Any = None) -> dict[str, Any]:
        args = validate_sound(on, volume)
        return {"ok": True, "name": "set_sound", "args": args,
                "clients": self.broadcast(message("set_sound", args))}

    def set_cat(self, on: Any = None, coat: Any = None) -> dict[str, Any]:
        args = validate_cat(on, coat)
        return {"ok": True, "name": "set_cat", "args": args,
                "clients": self.broadcast(message("set_cat", args))}

    def command(self, name: Any, args: Any = None) -> dict[str, Any]:
        """Generic entry for POST /api/command: set_theme {theme}, set_mode {mode}, set_sound {on?, volume?},
        set_cat {on?, coat?}."""
        if args is None:
            args = {}
        if not isinstance(args, dict):
            raise CommandError("args must be an object")
        if name == "set_theme":
            return self.set_theme(args.get("theme"))
        if name == "set_mode":
            return self.set_mode(args.get("mode"))
        if name == "set_sound":
            return self.set_sound(args.get("on"), args.get("volume"))
        if name == "set_cat":
            return self.set_cat(args.get("on"), args.get("coat"))
        raise CommandError("name must be \"set_theme\", \"set_mode\", \"set_sound\" or \"set_cat\"")


# ---------------------------------------------------------------------- module-level (voice router)
_hub: CommandHub | None = None


def bind(hub: CommandHub | None) -> None:
    """Set (or clear, with None) the hub the module-level functions use. The server does this."""
    global _hub
    _hub = hub


def hub() -> CommandHub:
    if _hub is None:
        raise RuntimeError("no command hub bound (the server binds one at startup)")
    return _hub


async def show(panel: str, duration: Any = None) -> dict[str, Any]:
    """Show ask panel `panel` on every wall for `duration` s (default 20, clamped 5..120)."""
    return hub().show(panel, duration)


async def dismiss() -> dict[str, Any]:
    return hub().dismiss()


async def set_theme(theme: str) -> dict[str, Any]:
    return hub().set_theme(theme)


async def set_mode(mode: str) -> dict[str, Any]:
    return hub().set_mode(mode)


async def set_sound(on: bool | None = None, volume: float | None = None) -> dict[str, Any]:
    """Sound on/off and/or volume (0..1) on every wall."""
    return hub().set_sound(on, volume)


async def set_cat(on: bool | None = None, coat: str | None = None) -> dict[str, Any]:
    """The cat on/off and/or its coat on every wall."""
    return hub().set_cat(on, coat)


async def clear_override() -> dict[str, Any]:
    """SPEC 6 clear_override: back to the scheduled mode."""
    return hub().set_mode("auto")
