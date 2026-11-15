"""Example drop-in adapter. Any *.py in plugins/ is imported at startup; @register makes its type usable
from config. Use it with:

    [[source]]
    name = "moon"
    type = "example_moon"
    every = "1h"

It computes the moon phase locally (no network), publishing:
    moon.phase        0..1   (0 = new, 0.5 = full)
    moon.illuminated  0..100 percent lit
    moon.name         "Waxing gibbous", ...
"""
import math
from datetime import datetime, timezone

from ambient.adapters.base import Adapter, register

SYNODIC_DAYS = 29.530588853
KNOWN_NEW_MOON = datetime(2000, 1, 6, 18, 14, tzinfo=timezone.utc)
NAMES = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous",
         "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"]


@register("example_moon")                 # the `type` used in config; must be unique
class MoonPhase(Adapter):
    default_every = 3600                  # seconds between fetch() calls unless config sets `every`

    def __init__(self, name, options, ctx):
        super().__init__(name, options, ctx)
        # Validate options here and raise ValueError with a clear message; the source then shows
        # as failed in /api/sources and the rest of the wall keeps running.
        self.precision = int(options.get("precision", 2))

    async def fetch(self):
        # Return a list of {"key", "value"} dicts (or Signal objects). The source name, timestamp,
        # ttl and visibility are filled in for you; add "type", "visibility" or "meta" to override.
        # Network calls go through self.ctx.http (shared httpx.AsyncClient). Pull only: never send
        # personal data out.
        days = (datetime.now(timezone.utc) - KNOWN_NEW_MOON).total_seconds() / 86400
        phase = (days % SYNODIC_DAYS) / SYNODIC_DAYS
        lit = (1 - math.cos(2 * math.pi * phase)) / 2 * 100
        return [
            {"key": "phase", "value": round(phase, self.precision)},
            {"key": "illuminated", "value": round(lit)},
            {"key": "name", "value": NAMES[int(phase * 8 + 0.5) % 8], "visibility": "ask"},
        ]
