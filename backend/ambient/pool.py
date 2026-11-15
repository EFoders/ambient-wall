"""The signal pool: in-memory latest value per signal id, change notification, SQLite history.

    pool = Pool(data_dir=Path("data"), history_max_age_s=14 * 86400)
    await pool.start()                       # opens <data_dir>/history.db, starts writer + pruner
    changed = await pool.publish([sig, ...]) # -> the signals that actually changed
    unsub = pool.subscribe(lambda changed: ...)   # sync or async callback(list[Signal])
    await pool.close()

A published signal counts as a *change* when there was no previous signal with that id, the previous
one was stale, or value / type / visibility differ. A refresh with the same value only updates the
stored signal (ts, ttl, meta) so it stays fresh; it is not reported, not sent to subscribers and not
written to history.
"""
from __future__ import annotations

import asyncio
import inspect
import json
import logging
import sqlite3
from datetime import datetime, timedelta
from fnmatch import fnmatchcase
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterable

from .signal import Signal, utcnow

log = logging.getLogger("ambient.pool")

Subscriber = Callable[[list[Signal]], "Awaitable[None] | None"]

_SCHEMA = """
CREATE TABLE IF NOT EXISTS history (
    id         TEXT NOT NULL,
    source     TEXT NOT NULL,
    key        TEXT NOT NULL,
    ts         REAL NOT NULL,          -- unix seconds (UTC) of the observation
    type       TEXT NOT NULL,
    visibility TEXT NOT NULL,
    ttl_s      REAL,
    value      TEXT NOT NULL,          -- JSON
    meta       TEXT NOT NULL           -- JSON
);
CREATE INDEX IF NOT EXISTS history_id_ts ON history (id, ts);
CREATE INDEX IF NOT EXISTS history_ts ON history (ts);
"""


def _is_change(prev: Signal | None, new: Signal, now: datetime) -> bool:
    if prev is None or prev.is_stale(now):
        return True
    return prev.value != new.value or prev.type != new.type or prev.visibility != new.visibility


class Pool:
    """Implements PoolView (get/query) plus publish/subscribe and optional SQLite history."""

    def __init__(self, data_dir: Path | str | None = None, *, history: bool = True,
                 history_max_age_s: float | None = 14 * 86400, prune_every_s: float = 3600,
                 flush_delay_s: float = 1.0):
        self._signals: dict[str, Signal] = {}
        self._subs: list[Subscriber] = []
        self.version = 0                              # bumps on every publish that changed something
        self.data_dir = Path(data_dir) if data_dir is not None else None
        self.history_enabled = history and self.data_dir is not None
        self.history_max_age_s = history_max_age_s
        self.prune_every_s = prune_every_s
        self.flush_delay_s = flush_delay_s
        self._db: sqlite3.Connection | None = None
        self._db_lock = asyncio.Lock()               # one thread touches the connection at a time
        self._pending: list[Signal] = []
        self._wake = asyncio.Event()
        self._tasks: list[asyncio.Task] = []

    # ------------------------------------------------------------------ PoolView
    def get(self, signal_id: str, *, include_stale: bool = False) -> Signal | None:
        s = self._signals.get(signal_id)
        if s is None or (not include_stale and s.is_stale()):
            return None
        return s

    def query(self, pattern: str = "*", *, include_stale: bool = False,
              visibility: str | None = None) -> list[Signal]:
        now = utcnow()
        out = [s for sid, s in self._signals.items()
               if fnmatchcase(sid, pattern)
               and (include_stale or not s.is_stale(now))
               and (visibility is None or s.visibility == visibility)]
        out.sort(key=lambda s: s.id)
        return out

    def __len__(self) -> int:
        return len(self._signals)

    # ------------------------------------------------------------------ publish / subscribe
    async def publish(self, signals: Iterable[Signal]) -> list[Signal]:
        now = utcnow()
        changed: dict[str, Signal] = {}
        for sig in signals:
            if not isinstance(sig, Signal):
                raise TypeError(f"pool.publish takes Signal objects (use signal.coerce), got {type(sig).__name__}")
            prev = self._signals.get(sig.id)
            self._signals[sig.id] = sig
            if _is_change(prev, sig, now):
                changed[sig.id] = sig
        if not changed:
            return []
        result = list(changed.values())
        self.version += 1
        if self.history_enabled:
            self._pending.extend(result)
            self._wake.set()
        await self._notify(result)
        return result

    def subscribe(self, callback: Subscriber) -> Callable[[], None]:
        """callback(changed: list[Signal]) runs after every publish that changed something.
        It may be sync or async; it is awaited inline, so keep it cheap (set an event, queue work).
        Returns an unsubscribe function."""
        self._subs.append(callback)

        def unsubscribe() -> None:
            try:
                self._subs.remove(callback)
            except ValueError:
                pass
        return unsubscribe

    async def _notify(self, changed: list[Signal]) -> None:
        for cb in list(self._subs):
            try:
                r = cb(changed)
                if inspect.isawaitable(r):
                    await r
            except Exception:  # noqa: BLE001 - one bad subscriber must not break publishing
                log.exception("pool subscriber %r failed", cb)

    # ------------------------------------------------------------------ lifecycle
    async def start(self) -> None:
        if not self.history_enabled or self._db is not None:
            return
        assert self.data_dir is not None
        self.data_dir.mkdir(parents=True, exist_ok=True)
        path = self.data_dir / "history.db"
        self._db = await asyncio.to_thread(self._open, path)
        await self.prune()
        self._tasks = [asyncio.create_task(self._writer(), name="pool-history-writer"),
                       asyncio.create_task(self._pruner(), name="pool-history-pruner")]
        log.info("history at %s (keep %s s)", path, self.history_max_age_s)

    async def close(self) -> None:
        for t in self._tasks:
            t.cancel()
        for t in self._tasks:
            try:
                await t
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        self._tasks = []
        if self._db is not None:
            await self.flush()
            db, self._db = self._db, None
            async with self._db_lock:
                await asyncio.to_thread(db.close)

    # ------------------------------------------------------------------ history
    @staticmethod
    def _open(path: Path) -> sqlite3.Connection:
        db = sqlite3.connect(path, check_same_thread=False)
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=NORMAL")
        db.executescript(_SCHEMA)
        db.commit()
        return db

    async def flush(self) -> None:
        """Write pending history rows now."""
        if self._db is None or not self._pending:
            return
        batch, self._pending = self._pending, []
        rows = [self._row(s) for s in batch]
        db = self._db
        async with self._db_lock:
            try:
                await asyncio.to_thread(self._write, db, rows)
            except Exception:  # noqa: BLE001 - history is best effort; the live pool keeps working
                log.exception("history write failed (%d rows dropped)", len(rows))

    @staticmethod
    def _row(s: Signal) -> tuple:
        d = s.model_dump(mode="json")
        return (s.id, s.source, s.key, s.ts.timestamp(), s.type, s.visibility, s.ttl_s,
                json.dumps(d["value"]), json.dumps(d["meta"]))

    @staticmethod
    def _write(db: sqlite3.Connection, rows: list[tuple]) -> None:
        with db:
            db.executemany("INSERT INTO history (id, source, key, ts, type, visibility, ttl_s, value, meta)"
                           " VALUES (?,?,?,?,?,?,?,?,?)", rows)

    async def _writer(self) -> None:
        while True:
            await self._wake.wait()
            self._wake.clear()
            await asyncio.sleep(self.flush_delay_s)     # batch bursts into one transaction
            await self.flush()

    async def prune(self) -> int:
        """Delete history older than history_max_age_s. Returns rows deleted."""
        if self._db is None or not self.history_max_age_s:
            return 0
        cutoff = (utcnow() - timedelta(seconds=self.history_max_age_s)).timestamp()
        db = self._db

        def _prune() -> int:
            with db:
                return db.execute("DELETE FROM history WHERE ts < ?", (cutoff,)).rowcount

        async with self._db_lock:
            n = await asyncio.to_thread(_prune)
        if n:
            log.info("pruned %d history rows", n)
        return n

    async def _pruner(self) -> None:
        while True:
            await asyncio.sleep(self.prune_every_s)
            try:
                await self.prune()
            except Exception:  # noqa: BLE001
                log.exception("history prune failed")

    async def history(self, signal_id: str, *, since: datetime | None = None,
                      limit: int = 1000) -> list[dict[str, Any]]:
        """Recorded changes for one signal id, oldest first (pending rows are flushed first)."""
        if self._db is None:
            return []
        await self.flush()
        db = self._db
        lo = since.timestamp() if since else 0.0

        def _q() -> list[tuple]:
            return db.execute("SELECT ts, type, visibility, value, meta FROM history"
                              " WHERE id = ? AND ts >= ? ORDER BY ts DESC, rowid DESC LIMIT ?",
                              (signal_id, lo, limit)).fetchall()

        async with self._db_lock:
            rows = await asyncio.to_thread(_q)
        return [{"ts": ts, "type": t, "visibility": v, "value": json.loads(val), "meta": json.loads(m)}
                for ts, t, v, val, m in reversed(rows)]
