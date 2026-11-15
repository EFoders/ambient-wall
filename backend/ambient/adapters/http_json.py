"""http_json: any JSON endpoint, no code. GET it, pick values out by dotted path.

    [[source]]
    name = "solar"
    type = "http_json"
    url = "http://192.168.1.50/api/status"
    every = "1m"
    headers = { Authorization = "Bearer ${SOLAR_TOKEN}" }      # optional
    map = { "power.now" = "data.watts", "battery.pct" = "data.batteries.0.percent" }
    types = { "power.now" = "number" }                        # optional, else inferred

Without `map` the whole document is published as key "value". A path that is missing in a response
is skipped (listed in the source status); if none resolve, the fetch is an error. Non-2xx = error.
"""
from __future__ import annotations

from typing import Any

from ._shared import OptionError, SourceError, _TYPES, dotted_get, http_get_json, opt, opt_duration
from .base import Adapter, register


@register("http_json")
class HttpJson(Adapter):
    default_every = 60.0

    def __init__(self, name: str, options: dict[str, Any], ctx):
        super().__init__(name, options, ctx)
        self.url = opt(options, "url", str, source=name)
        if not self.url.startswith(("http://", "https://")):
            raise OptionError(f"source {name!r}: url must start with http:// or https://")
        headers = opt(options, "headers", dict, {}, source=name)
        self.headers = {str(k): str(v) for k, v in headers.items()}
        self.map: dict[str, str] | None = opt(options, "map", dict, None, source=name)
        if self.map is not None:
            if not self.map:
                raise OptionError(f"source {name!r}: map is empty")
            for k, p in self.map.items():
                if not isinstance(p, str):
                    raise OptionError(f"source {name!r}: map.{k} must be a dotted path string")
        self.types: dict[str, str] = opt(options, "types", dict, {}, source=name)
        for k, t in self.types.items():
            if t not in _TYPES:
                raise OptionError(f"source {name!r}: types.{k} must be one of {sorted(_TYPES)}")
        self.timeout = opt_duration(options, "timeout", 10.0, source=name)

    async def fetch(self):
        doc = await http_get_json(self.ctx.http, self.url, headers=self.headers, timeout=self.timeout)
        if self.map is None:
            return [self._item("value", doc)]
        out, missing = [], []
        for key, path in self.map.items():
            try:
                out.append(self._item(key, dotted_get(doc, path)))
            except KeyError:
                missing.append(key)
        self.status.extra["missing"] = missing
        if missing and not out:
            raise SourceError(f"none of the mapped paths were in the response ({', '.join(missing)})")
        return out

    def _item(self, key: str, value: Any) -> dict[str, Any]:
        it = {"key": key, "value": value}
        if key in self.types:
            it["type"] = self.types[key]
        return it
