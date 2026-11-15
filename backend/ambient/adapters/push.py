"""push: data arrives over HTTP instead of being fetched. Declaring the source is all it takes:

    [[source]]
    name = "phone"
    type = "push"
    ttl = "30m"                 # optional: pushed values go stale if not refreshed

    curl -X POST http://<box>:8700/api/publish/phone \
         -H "Content-Type: application/json" \
         -H "Authorization: Bearer $PUSH_TOKEN" \
         -d '{"key": "battery", "value": 81}'

The body is one {"key", "value", ...} object or a list of them. The scheduler/server own the
endpoint; this adapter only exists so the type is registered and its options validated. Its run()
waits forever.
"""
from __future__ import annotations

import asyncio
from typing import Any

from ._shared import normalize_item
from .base import Adapter, register


@register("push")
class PushSource(Adapter):
    default_every = None

    def __init__(self, name: str, options: dict[str, Any], ctx):
        super().__init__(name, options, ctx)
        if options.get("ttl") is None:
            self.ttl_s = None

    @staticmethod
    def normalize(body: Any) -> list[dict[str, Any]]:
        """Helper for the push endpoint: a POST body -> clean SignalLike dicts (ValueError if bad)."""
        items = body if isinstance(body, list) else [body]
        return [normalize_item(it, f"item {i}") for i, it in enumerate(items)]

    async def fetch(self):
        return []

    async def run(self, emit) -> None:
        await asyncio.Event().wait()
