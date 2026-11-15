"""Album-art cache: the backend pulls `art_url` once, keeps it under <data_dir>/art/, and serves it as
`GET /api/art/<id>`, so the browser never contacts Spotify / Last.fm (SPEC 1.4).

    cache = ArtCache(data_dir / "art", http, on_ready=wall_hub.mark_dirty)
    cache.scan()                                 # index files already on disk
    pool.subscribe(cache.watch("music.now"))     # new art_url on a matching signal -> background fetch
    cache.url_for(art_url)  -> "/api/art/<sha1>" once cached, else None   (pure in-memory lookup)
    cache.open(art_id)      -> (path, content_type) | None                (LRU touch)

- id = sha1(art_url) as 40 hex chars; the file is <id>.jpg / .png / .webp.
- A download is capped at `max_bytes` (2 MB, enforced while streaming) and `timeout`; the
  Content-Type must be image/jpeg, image/png or image/webp AND the bytes must start with that format's
  magic number. Anything else is refused and remembered for `retry_after_s` (no hammering).
- LRU: at most `max_files` files and `max_total_bytes` in total; the least recently used go first.
  Use time = the file's mtime (touched when served), so the order survives restarts.
- Fetches run as background tasks: nothing here ever blocks an adapter or the projection. When a
  file lands, `on_ready()` is called (the server marks the wall dirty so `art` appears).
- Only http(s) URLs. Errors name the host only. Nothing about the user is sent: a plain GET.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import time
from fnmatch import fnmatchcase
from pathlib import Path
from typing import Any, Callable, Iterable
from urllib.parse import urlsplit

import httpx

from .adapters._shared import redact_url

log = logging.getLogger("ambient.art")

ID_RE = re.compile(r"^[0-9a-f]{40}$")
TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
EXT_TYPES = {v: k for k, v in TYPES.items()}
MAX_BYTES = 2_000_000
MAX_FILES = 200
MAX_TOTAL_BYTES = 50_000_000
ROUTE = "/api/art/"


class ArtError(RuntimeError):
    """A refused or failed download (message names the host only)."""


def art_id(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()


def sniff(data: bytes) -> str | None:
    """Content type from the magic number, or None."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


class ArtCache:
    def __init__(self, directory: Path | str, http: httpx.AsyncClient | None = None, *,
                 max_bytes: int = MAX_BYTES, max_files: int = MAX_FILES,
                 max_total_bytes: int = MAX_TOTAL_BYTES, timeout: float = 10.0,
                 retry_after_s: float = 600.0, on_ready: Callable[[], Any] | None = None,
                 clock: Callable[[], float] = time.monotonic):
        self.dir = Path(directory)
        self.http = http
        self.max_bytes = max_bytes
        self.max_files = max_files
        self.max_total_bytes = max_total_bytes
        self.timeout = timeout
        self.retry_after_s = retry_after_s
        self.on_ready = on_ready
        self.clock = clock
        # id -> (filename, size, last use as unix time)
        self.index: dict[str, tuple[str, int, float]] = {}
        self._inflight: dict[str, asyncio.Task] = {}
        self._failed: dict[str, float] = {}           # id -> monotonic time of the failure
        self.errors: list[str] = []                   # recent failures (host only), newest last
        self._last_use = 0.0

    def _use_time(self) -> float:
        """Wall-clock use time, strictly increasing (so two uses in the same tick still order)."""
        self._last_use = max(time.time(), self._last_use + 1e-6)
        return self._last_use

    # ------------------------------------------------------------------ index
    def scan(self) -> int:
        """(Re)build the index from the files on disk; returns how many are cached."""
        self.index.clear()
        try:
            self.dir.mkdir(parents=True, exist_ok=True)
            entries = list(os.scandir(self.dir))
        except OSError as e:
            log.warning("art cache dir %s unusable: %s", self.dir, type(e).__name__)
            return 0
        for e in entries:
            stem, _, ext = e.name.partition(".")
            if e.is_file() and ID_RE.match(stem) and ext in EXT_TYPES:
                st = e.stat()
                self.index[stem] = (e.name, st.st_size, st.st_mtime)
                self._last_use = max(self._last_use, st.st_mtime)
            elif e.is_file() and e.name.endswith(".part"):
                try:
                    os.unlink(e.path)                    # leftover from a crash mid-write
                except OSError:
                    pass
        self.evict()
        return len(self.index)

    def url_for(self, url: str | None) -> str | None:
        """The local path for `url` if it is cached, else None. Pure lookup; never fetches."""
        if not url or not isinstance(url, str):
            return None
        i = art_id(url)
        return f"{ROUTE}{i}" if i in self.index else None

    def open(self, ident: str) -> tuple[Path, str] | None:
        """(path, content type) for a cached id, touching it for the LRU. None for anything else."""
        if not isinstance(ident, str) or not ID_RE.match(ident):
            return None
        entry = self.index.get(ident)
        if entry is None:
            return None
        name, size, _ = entry
        path = self.dir / name
        if not path.is_file():
            self.index.pop(ident, None)
            return None
        now = self._use_time()
        self.index[ident] = (name, size, now)
        try:
            os.utime(path, (now, now))
        except OSError:
            pass
        return path, EXT_TYPES[name.rsplit(".", 1)[-1]]

    def total_bytes(self) -> int:
        return sum(size for _, size, _ in self.index.values())

    def evict(self) -> list[str]:
        """Drop least-recently-used files until within max_files and max_total_bytes."""
        removed: list[str] = []
        order = sorted(self.index.items(), key=lambda kv: kv[1][2])
        total = self.total_bytes()
        count = len(self.index)
        for ident, (name, size, _) in order:
            if count <= self.max_files and total <= self.max_total_bytes:
                break
            try:
                (self.dir / name).unlink(missing_ok=True)
            except OSError:
                continue
            self.index.pop(ident, None)
            removed.append(ident)
            count -= 1
            total -= size
        return removed

    # ------------------------------------------------------------------ fetching
    def want(self, url: Any) -> asyncio.Task | None:
        """Start a background fetch for `url` unless it is cached, in flight, recently failed or not
        http(s). Returns the task (tests await it) or None. Never blocks, never raises."""
        if not isinstance(url, str) or not url or len(url) > 2048:
            return None
        u = urlsplit(url)
        if u.scheme not in ("http", "https") or not u.hostname:
            return None
        ident = art_id(url)
        if ident in self.index:
            return None
        if ident in self._inflight:
            return self._inflight[ident]
        failed = self._failed.get(ident)
        if failed is not None and self.clock() - failed < self.retry_after_s:
            return None
        try:
            task = asyncio.get_running_loop().create_task(self._fetch_task(url, ident), name=f"art:{ident[:8]}")
        except RuntimeError:                           # no loop (sync caller): nothing to do
            return None
        self._inflight[ident] = task
        return task

    async def _fetch_task(self, url: str, ident: str) -> str | None:
        try:
            await self.fetch(url)
            self._failed.pop(ident, None)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001 - art is decoration; record and move on
            self._failed[ident] = self.clock()
            msg = str(e) if isinstance(e, ArtError) else f"{redact_url(url)}: {type(e).__name__}"
            self.errors = (self.errors + [msg])[-10:]
            log.info("album art not cached: %s", msg)
            return None
        finally:
            self._inflight.pop(ident, None)
        if self.on_ready is not None:
            try:
                self.on_ready()
            except Exception:  # noqa: BLE001
                log.exception("art on_ready callback failed")
        return ident

    async def fetch(self, url: str) -> str:
        """Download, check and store `url`; returns its id. Raises ArtError (host-only message)."""
        if self.http is None:
            raise ArtError("no HTTP client for the art cache")
        shown = redact_url(url)
        ident = art_id(url)
        try:
            async with asyncio.timeout(self.timeout):
                async with self.http.stream("GET", url, timeout=self.timeout,
                                            headers={"Accept": "image/webp,image/jpeg,image/png"}) as r:
                    if not 200 <= r.status_code < 300:
                        raise ArtError(f"GET {shown} returned HTTP {r.status_code}")
                    ctype = r.headers.get("content-type", "").split(";")[0].strip().lower()
                    if ctype not in TYPES:
                        raise ArtError(f"GET {shown}: not a jpeg/png/webp image ({ctype or 'no type'})")
                    declared = r.headers.get("content-length")
                    if declared and declared.isdigit() and int(declared) > self.max_bytes:
                        raise ArtError(f"GET {shown}: image is {int(declared)} bytes, over {self.max_bytes}")
                    buf = bytearray()
                    async for chunk in r.aiter_bytes():
                        buf += chunk
                        if len(buf) > self.max_bytes:
                            raise ArtError(f"GET {shown}: image is over {self.max_bytes} bytes")
        except (TimeoutError, httpx.TimeoutException):
            raise ArtError(f"GET {shown} timed out after {self.timeout:g} s") from None
        except httpx.HTTPError as e:
            raise ArtError(f"GET {shown} failed: {type(e).__name__}") from None
        data = bytes(buf)
        if sniff(data) != ctype:
            raise ArtError(f"GET {shown}: content does not match {ctype}")
        name = f"{ident}.{TYPES[ctype]}"
        await asyncio.to_thread(self._write, name, data)
        self.index[ident] = (name, len(data), self._use_time())
        self.evict()
        return ident

    def _write(self, name: str, data: bytes) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        tmp = self.dir / f"{name}.part"
        tmp.write_bytes(data)
        os.replace(tmp, self.dir / name)

    # ------------------------------------------------------------------ pool hook
    def watch(self, patterns: str | Iterable[str] | Callable[[], Iterable[str]]):
        """A pool subscriber: for every changed signal whose id matches one of `patterns` (a glob, a
        list, or a callable returning them) and whose value is an object with `art_url`, start a fetch."""
        def current() -> list[str]:
            p = patterns() if callable(patterns) else patterns
            return [p] if isinstance(p, str) else [x for x in p if x]

        def on_change(changed: list[Any]) -> None:
            globs = current()
            if not globs:
                return
            for s in changed:
                if not any(fnmatchcase(s.id, g) for g in globs):
                    continue
                v = s.value
                if isinstance(v, dict):
                    self.want(v.get("art_url"))
        return on_change

    async def close(self) -> None:
        tasks = list(self._inflight.values())
        for t in tasks:
            t.cancel()
        for t in tasks:
            try:
                await t
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        self._inflight.clear()

    def status(self) -> dict[str, Any]:
        return {"files": len(self.index), "bytes": self.total_bytes(), "max_files": self.max_files,
                "max_bytes": self.max_total_bytes, "inflight": len(self._inflight),
                "recent_errors": list(self.errors)}
