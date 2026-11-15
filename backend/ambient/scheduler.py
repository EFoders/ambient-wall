"""Runs the configured sources and the rules engine.

Sources: one asyncio task per enabled [[source]] running `adapter.run(emit)`. `emit` coerces each item
with the source's name / ttl / visibility and publishes it to the pool.

Rules: a rule runs when a *changed* signal id matches one of its `inputs` globs, and every
`rule.every` seconds. [rules.<name>] may override `inputs` (list of globs), `every`, `ttl` and set
`enabled = false`; the whole table is also passed to the rule as `cfg`. Outputs are coerced with source="rules" and published, which can trigger
further rules (a cascade). Loop guard: within one cascade a rule never runs again on signals that
descend from its own outputs (its ancestry chain), and cascades stop at `max_cascade` levels.
A rule that raises is logged and recorded; the others keep running.

Push sources (type = "push") are handled here, not by an adapter: `push(name, items)`.
"""
from __future__ import annotations

import asyncio
import inspect
import logging
from dataclasses import dataclass, field
from datetime import datetime
from fnmatch import fnmatchcase
from pathlib import Path
from typing import Any, Iterable

import httpx

from .adapters.base import REGISTRY, Adapter, AdapterContext, AdapterStatus
from .config import Config, SourceConfig, redact
from .pool import Pool
from .rules.base import RULES, Rule
from .signal import Signal, SignalLike, coerce, utcnow
from .util import parse_duration

log = logging.getLogger("ambient.scheduler")

USER_AGENT = "AmbientWall/0.2 (pull-only home display)"
HTTP_TIMEOUT = httpx.Timeout(15.0, connect=5.0)
MAX_CASCADE = 6
MAX_PUSH_ITEMS = 500


class UnknownSource(KeyError):
    pass


class NotPushSource(ValueError):
    pass


@dataclass
class SourceRuntime:
    cfg: SourceConfig
    adapter: Adapter | None = None
    status: AdapterStatus = field(default_factory=AdapterStatus)
    task: asyncio.Task | None = None

    @property
    def every(self) -> float | None:
        return self.adapter.every if self.adapter is not None else self.cfg.every


@dataclass
class RuleRuntime:
    rule: Rule
    inputs: list[str]                    # decorator globs, or [rules.<name>] inputs override
    cfg: dict[str, Any]
    every: float | None
    ttl_s: float | None
    status: AdapterStatus = field(default_factory=AdapterStatus)
    runs: int = 0


def _status_dict(st: AdapterStatus) -> dict[str, Any]:
    return {
        "last_ok": st.last_ok.isoformat() if st.last_ok else None,
        "last_error": redact(st.last_error) if st.last_error else None,
        "last_error_at": st.last_error_at.isoformat() if st.last_error_at else None,
        "signals_emitted": st.signals_emitted,
        **({"extra": st.extra} if st.extra else {}),
    }


class Scheduler:
    def __init__(self, cfg: Config, pool: Pool, *, data_dir: Path | str = "data",
                 http: httpx.AsyncClient | None = None,
                 registry: dict[str, type[Adapter]] | None = None,
                 rules: dict[str, Rule] | None = None, max_cascade: int = MAX_CASCADE,
                 rule_start_delay_s: float = 1.0):
        self.cfg = cfg
        self.pool = pool
        self.data_dir = Path(data_dir)
        self._http = http
        self._own_http = http is None
        self.registry = REGISTRY if registry is None else registry
        self.rule_defs = RULES if rules is None else rules
        self.max_cascade = max_cascade
        self.rule_start_delay_s = rule_start_delay_s
        self.sources: dict[str, SourceRuntime] = {}
        self.rules: dict[str, RuleRuntime] = {}
        self._tasks: list[asyncio.Task] = []
        self.started = False

    # ------------------------------------------------------------------ time
    def now(self) -> datetime:
        tz = self.cfg.tz
        return datetime.now(tz) if tz else datetime.now().astimezone()

    # ------------------------------------------------------------------ lifecycle
    async def start(self) -> None:
        if self.started:
            return
        self.started = True
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True,
                                           headers={"User-Agent": USER_AGENT})
        ctx_log = logging.getLogger("ambient.source")
        settings = self.cfg.adapter_settings()

        for sc in self.cfg.sources:
            rt = SourceRuntime(cfg=sc)
            self.sources[sc.name] = rt
            if not sc.enabled:
                log.info("source %s (%s) disabled: %s", sc.name, sc.type, sc.disabled_reason)
                continue
            cls = self.registry.get(sc.type)
            if cls is None:
                if sc.type != "push":
                    rt.status.last_error = f"no adapter registered for type {sc.type!r}"
                    log.error("source %s: %s", sc.name, rt.status.last_error)
                continue
            try:
                ctx = AdapterContext(http=self._http, log=ctx_log.getChild(sc.name),
                                     data_dir=self.data_dir, settings=settings)
                rt.adapter = cls(sc.name, dict(sc.options), ctx)
                rt.status = rt.adapter.status
            except Exception as e:  # noqa: BLE001
                rt.status.last_error = f"{type(e).__name__}: {e}"
                rt.status.last_error_at = utcnow()
                log.error("source %s (%s) failed to initialise: %s", sc.name, sc.type,
                          redact(rt.status.last_error))
                continue
            if sc.type == "push":       # push data arrives via push(); the core owns that path
                continue
            rt.task = asyncio.create_task(self._run_source(rt), name=f"source:{sc.name}")
            self._tasks.append(rt.task)
            log.info("source %s (%s) started, every %s s", sc.name, sc.type, rt.every)

        for name, r in self.rule_defs.items():
            rcfg = self.cfg.rule_cfg(name)
            if rcfg.get("enabled", True) is False:
                log.info("rule %s disabled", name)
                continue
            every = parse_duration(rcfg["every"]) if "every" in rcfg else r.every
            ttl = parse_duration(rcfg["ttl"]) if "ttl" in rcfg else (every * 3 if every else None)
            inputs = list(rcfg["inputs"]) if rcfg.get("inputs") else list(r.inputs)
            rr = RuleRuntime(rule=r, inputs=inputs, cfg=rcfg, every=every, ttl_s=ttl)
            self.rules[name] = rr
            if every:
                self._tasks.append(asyncio.create_task(self._rule_loop(rr), name=f"rule:{name}"))
        log.info("scheduler: %d sources running, %d rules active",
                 sum(1 for s in self.sources.values() if s.task), len(self.rules))

    async def stop(self) -> None:
        for t in self._tasks:
            t.cancel()
        for t in self._tasks:
            try:
                await t
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        self._tasks.clear()
        for rt in self.sources.values():
            if rt.adapter is not None:
                try:
                    await rt.adapter.stop()
                except Exception:  # noqa: BLE001
                    log.exception("source %s stop() failed", rt.cfg.name)
        if self._own_http and self._http is not None:
            await self._http.aclose()
            self._http = None
        self.started = False

    # ------------------------------------------------------------------ sources
    def _emitter(self, rt: SourceRuntime):
        adapter = rt.adapter
        assert adapter is not None

        async def emit(items: Iterable[SignalLike]) -> None:
            sigs = [coerce(i, source=rt.cfg.name, ttl_s=adapter.ttl_s, visibility=adapter.visibility)
                    for i in items]
            if sigs:
                await self.ingest(sigs)
        return emit

    async def _run_source(self, rt: SourceRuntime) -> None:
        adapter = rt.adapter
        assert adapter is not None
        emit = self._emitter(rt)
        backoff = 10.0
        while True:
            try:
                await adapter.start()
                await adapter.run(emit)
                log.info("source %s finished", rt.cfg.name)
                return
            except asyncio.CancelledError:
                raise
            except Exception as e:  # noqa: BLE001 - adapters are untrusted plugins
                adapter.status.last_error = f"{type(e).__name__}: {e}"
                adapter.status.last_error_at = utcnow()
                log.warning("source %s crashed (%s); restarting in %.0f s", rt.cfg.name,
                            redact(adapter.status.last_error), backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 600.0)

    async def push(self, source_name: str, items: list[Any]) -> list[Signal]:
        """Publish items POSTed to /api/publish/<source_name>. Raises UnknownSource, NotPushSource,
        or ValueError/TypeError (pydantic ValidationError is a ValueError) for bad items."""
        sc = self.cfg.source(source_name)
        if sc is None:
            raise UnknownSource(source_name)
        if sc.type != "push":
            raise NotPushSource(source_name)
        if not sc.enabled:
            raise NotPushSource(f"{source_name} is disabled")
        if len(items) > MAX_PUSH_ITEMS:
            raise ValueError(f"too many items ({len(items)} > {MAX_PUSH_ITEMS})")
        rt = self.sources.get(source_name) or SourceRuntime(cfg=sc)
        self.sources.setdefault(source_name, rt)
        if sc.ttl is not None:
            ttl = sc.ttl
        elif rt.adapter is not None:
            ttl = rt.adapter.ttl_s
        else:
            ttl = None
        vis = rt.adapter.visibility if rt.adapter is not None else sc.visibility
        norm = getattr(rt.adapter, "normalize", None)     # optional helper on the push adapter
        if callable(norm):
            items = norm(items)
        sigs = [coerce(i, source=source_name, ttl_s=ttl, visibility=vis) for i in items]
        changed = await self.ingest(sigs)
        rt.status.last_ok = utcnow()
        rt.status.signals_emitted += len(sigs)
        return changed

    # ------------------------------------------------------------------ pool + rules
    async def ingest(self, signals: list[Signal], *, chain: frozenset[str] = frozenset(),
                     depth: int = 0) -> list[Signal]:
        """Publish to the pool, then run the rules whose inputs match what changed.
        `chain` = rules whose outputs (transitively) produced these signals; they are not re-run."""
        changed = await self.pool.publish(signals)
        if changed and self.rules:
            await self._trigger(changed, chain, depth)
        return changed

    async def _trigger(self, changed: list[Signal], chain: frozenset[str], depth: int) -> None:
        ids = [s.id for s in changed]
        due = [rr for name, rr in self.rules.items()
               if name not in chain
               and any(fnmatchcase(i, g) for g in rr.inputs for i in ids)]
        if not due:
            return
        if depth >= self.max_cascade:
            log.warning("rule cascade depth %d reached (chain: %s); not running %s",
                        depth, " -> ".join(sorted(chain)), ", ".join(r.rule.name for r in due))
            return
        for rr in due:
            await self.run_rule(rr.rule.name, chain=chain | {rr.rule.name}, depth=depth + 1)

    async def run_rule(self, name: str, *, chain: frozenset[str] | None = None, depth: int = 1) -> list[Signal]:
        rr = self.rules[name]
        chain = frozenset({name}) if chain is None else chain
        try:
            out = rr.rule.fn(self.pool, self.now(), rr.cfg)
            if inspect.isawaitable(out):
                out = await out
            sigs = [coerce(i, source="rules", ttl_s=rr.ttl_s) for i in (out or [])]
        except Exception as e:  # noqa: BLE001 - one bad rule must not stop the others
            rr.status.last_error = f"{type(e).__name__}: {e}"
            rr.status.last_error_at = utcnow()
            log.exception("rule %s failed", name)
            return []
        rr.runs += 1
        rr.status.last_ok = utcnow()
        rr.status.signals_emitted += len(sigs)
        if not sigs:
            return []
        return await self.ingest(sigs, chain=chain, depth=depth)

    async def _rule_loop(self, rr: RuleRuntime) -> None:
        await asyncio.sleep(self.rule_start_delay_s)    # let sources publish their first values
        while True:
            await self.run_rule(rr.rule.name)
            await asyncio.sleep(rr.every or 30.0)

    # ------------------------------------------------------------------ status
    def sources_status(self) -> list[dict[str, Any]]:
        out = []
        for sc in self.cfg.sources:
            rt = self.sources.get(sc.name)
            out.append({
                "name": sc.name,
                "type": sc.type,
                "enabled": sc.enabled,
                "every": rt.every if rt else sc.every,
                "running": bool(rt and rt.task and not rt.task.done()),
                **({"disabled_reason": sc.disabled_reason} if not sc.enabled else {}),
                "status": _status_dict(rt.status if rt else AdapterStatus()),
            })
        return out

    def rules_status(self) -> dict[str, Any]:
        return {name: {"inputs": rr.inputs, "every": rr.every, "runs": rr.runs,
                       **_status_dict(rr.status)} for name, rr in self.rules.items()}
