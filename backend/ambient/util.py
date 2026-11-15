"""Small shared helpers."""
from __future__ import annotations

import re

_DUR = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?\s*$")
_UNIT = {"ms": 0.001, "s": 1, "m": 60, "h": 3600, "d": 86400, None: 1}


def parse_duration(v: str | int | float | None) -> float | None:
    """'30s', '5m', '1.5h', '2d', '250ms', or a bare number of seconds -> seconds. None passes through."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = _DUR.match(v)
    if not m:
        raise ValueError(f"bad duration {v!r} (use e.g. 30s, 5m, 1h)")
    return float(m.group(1)) * _UNIT[m.group(2)]
