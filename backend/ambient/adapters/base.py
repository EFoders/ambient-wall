"""Adapter base class + registry. One adapter type per file; one config [[source]] entry per instance.

Writing a Python adapter:

    from ambient.adapters.base import Adapter, register

    @register("my_thing")
    class MyThing(Adapter):
        default_every = 300          # seconds between fetches (config `every` overrides)

        async def fetch(self):
            r = await self.ctx.http.get(self.options["url"])
            return [{"key": "count", "value": r.json()["count"]}]

Long-running / push adapters override run() instead of fetch().
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable, ClassVar, Iterable

import httpx

from ..signal import SignalLike, utcnow
from ..util import parse_duration

Emit = Callable[[Iterable[SignalLike]], Awaitable[None]]


@dataclass
class AdapterContext:
    http: httpx.AsyncClient          # shared client. Pull only: never send personal data out (SPEC 1.4).
    log: logging.Logger
    data_dir: Path                   # backend/data, for caches and file sources
    settings: dict[str, Any]         # global config (location, mode, ...), read-only by convention


@dataclass
class AdapterStatus:
    last_ok: datetime | None = None
    last_error: str | None = None
    last_error_at: datetime | None = None
    signals_emitted: int = 0
    extra: dict[str, Any] = field(default_factory=dict)


class Adapter:
    type_name: ClassVar[str] = ""
    default_every: ClassVar[float | None] = 60.0

    def __init__(self, name: str, options: dict[str, Any], ctx: AdapterContext):
        self.name = name                       # becomes Signal.source
        self.options = options                 # the raw [[source]] table minus name/type/common keys
        self.ctx = ctx
        self.every = parse_duration(options.get("every")) or self.default_every
        # default ttl: three missed fetches and the signal goes stale
        ttl = options.get("ttl")
        self.ttl_s = parse_duration(ttl) if ttl is not None else (self.every * 3 if self.every else None)
        self.visibility = options.get("visibility", "wall")
        self.status = AdapterStatus()

    async def start(self) -> None:
        """Optional setup before the first fetch."""

    async def stop(self) -> None:
        """Optional cleanup."""

    async def fetch(self) -> Iterable[SignalLike]:
        """Polled adapters: return this cycle's signals."""
        raise NotImplementedError

    async def run(self, emit: Emit) -> None:
        """Default loop: fetch every `self.every` seconds, forever. Errors are recorded and retried
        with backoff (capped at the poll interval); the scheduler never dies because one source did."""
        backoff = 5.0
        while True:
            try:
                items = list(await self.fetch())
                await emit(items)
                self.status.last_ok = utcnow()
                self.status.signals_emitted += len(items)
                backoff = 5.0
                wait = self.every
            except asyncio.CancelledError:
                raise
            except Exception as e:  # noqa: BLE001 - adapters are untrusted plugins
                self.status.last_error = f"{type(e).__name__}: {e}"
                self.status.last_error_at = utcnow()
                self.ctx.log.warning("source %s failed: %s", self.name, self.status.last_error)
                wait = min(backoff, self.every or 300)
                backoff = min(backoff * 2, 600)
            if not wait:
                return
            await asyncio.sleep(wait)


REGISTRY: dict[str, type[Adapter]] = {}


def register(type_name: str):
    def deco(cls: type[Adapter]) -> type[Adapter]:
        if type_name in REGISTRY and REGISTRY[type_name] is not cls:
            raise ValueError(f"adapter type {type_name!r} registered twice")
        cls.type_name = type_name
        REGISTRY[type_name] = cls
        return cls
    return deco
