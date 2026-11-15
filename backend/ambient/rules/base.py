"""Rules: plain functions that read the pool and publish derived signals (source "rules"). SPEC 2.4.

    from ambient.rules.base import rule

    @rule("finance_mood", inputs=["finances.*"])
    def finance_mood(pool, now, cfg):
        m = pool.get("finances.month")
        if not m:
            return []
        return [{"key": "finances.mood", "value": "warning" if m.value["net"] < 0 else "calm"}]

A rule re-runs whenever a signal matching one of its `inputs` globs changes, and also every
`every` seconds (for time-based rules like "heartbeat missing for > N min"). `cfg` is that rule's
[rules.<name>] config table ({} if absent). Rules may be disabled with `enabled = false` there.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Iterable

from ..pool_view import PoolView
from ..signal import SignalLike

RuleFn = Callable[[PoolView, datetime, dict[str, Any]], Iterable[SignalLike]]


@dataclass
class Rule:
    name: str
    inputs: list[str]
    fn: RuleFn
    every: float | None = 30.0


RULES: dict[str, Rule] = {}


def rule(name: str, *, inputs: list[str], every: float | None = 30.0):
    def deco(fn: RuleFn) -> RuleFn:
        if name in RULES:
            raise ValueError(f"rule {name!r} registered twice")
        RULES[name] = Rule(name, inputs, fn, every)
        return fn
    return deco
