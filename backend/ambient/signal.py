"""The data contract (SPEC 2.2). Every source emits this shape; the pool never cares where it came from."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Union

from pydantic import BaseModel, Field

SignalType = Literal["number", "string", "status", "event", "series", "object"]
Visibility = Literal["wall", "ask"]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Signal(BaseModel):
    source: str                      # adapter instance name, e.g. "heartbeat"
    key: str                         # namespaced by source, e.g. "host.homelab"
    value: Any
    type: SignalType = "object"
    ts: datetime = Field(default_factory=utcnow)   # when observed; always timezone-aware
    ttl_s: float | None = None       # None = never goes stale
    visibility: Visibility = "wall"
    meta: dict[str, Any] = Field(default_factory=dict)

    @property
    def id(self) -> str:
        """Pool identity: "<source>.<key>"."""
        return f"{self.source}.{self.key}"

    def expires_at(self) -> datetime | None:
        return None if self.ttl_s is None else self.ts + timedelta(seconds=self.ttl_s)

    def is_stale(self, now: datetime | None = None) -> bool:
        exp = self.expires_at()
        return exp is not None and (now or utcnow()) >= exp


# What adapters and rules may return: a full Signal, or a plain dict with at least "key" and "value".
SignalLike = Union[Signal, dict[str, Any]]


def infer_type(value: Any) -> SignalType:
    if isinstance(value, bool):
        return "status"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "series"
    return "object"


def coerce(item: SignalLike, *, source: str, ttl_s: float | None = None,
           visibility: Visibility = "wall") -> Signal:
    """Turn adapter/rule output into a Signal, filling source, ts, type, ttl and visibility defaults.

    A dict's own fields win over the defaults, except `source`, which is always the emitter's name
    (an adapter cannot publish into another source's namespace).
    """
    if isinstance(item, Signal):
        data = item.model_dump()
    elif isinstance(item, dict):
        if "key" not in item or "value" not in item:
            raise ValueError(f"signal from {source!r} needs 'key' and 'value': {item!r}")
        data = dict(item)
    else:
        raise TypeError(f"signal from {source!r} must be a Signal or dict, got {type(item).__name__}")
    data["source"] = source
    data.setdefault("type", infer_type(data["value"]))
    if data.get("ttl_s") is None:
        data["ttl_s"] = ttl_s
    data.setdefault("visibility", visibility)
    if data.get("ts") is None:
        data.pop("ts", None)
    sig = Signal(**data)
    if sig.ts.tzinfo is None:
        sig.ts = sig.ts.replace(tzinfo=timezone.utc)
    return sig
