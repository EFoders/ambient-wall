"""Read-only view of the signal pool, handed to rules and the wall projection."""
from __future__ import annotations

from typing import Protocol

from .signal import Signal


class PoolView(Protocol):
    def get(self, signal_id: str, *, include_stale: bool = False) -> Signal | None:
        """Exact id, e.g. "finances.month". Stale signals are hidden unless include_stale."""

    def query(self, pattern: str = "*", *, include_stale: bool = False,
              visibility: str | None = None) -> list[Signal]:
        """fnmatch glob over ids, e.g. "heartbeat.host.*". Sorted by id."""
