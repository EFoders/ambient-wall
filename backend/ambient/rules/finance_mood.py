"""finance_mood: the finance element's colour, calm / drift / warning (SPEC 5.4, 2.4).

    warning  net < 0, or spent / income > warning_ratio (spending more than came in)
    drift    spent / income > drift_ratio, or spending ahead of the month's pace:
             spent / income > day_of_month / days_in_month + pace_tolerance
             (current month only; a past month counts as fully elapsed)
    calm     otherwise

Income 0 with any spending = drift (or warning if net < 0). Day of month is taken in the local
timezone (`timezone`, else the tz of `now`, which the scheduler passes as local time).

Config [rules.finance_mood] (all optional):

    enabled        = true
    input          = "finances.month"
    drift_ratio    = 0.85
    warning_ratio  = 1.0
    pace_tolerance = 0.15     # set >= 1 to switch the pace check off
    timezone       = "America/Toronto"

Input value: {income, spent, net, balance, month: "YYYY-MM", last_updated: ISO}
Output: key "finances.mood", value "calm" | "drift" | "warning" | null (input missing),
meta {"reason": ...}.
"""
from __future__ import annotations

import calendar
from datetime import datetime
from typing import Any

from ..pool_view import PoolView
from ._common import fresh_value, num, resolve_tz
from .base import rule

NAME = "finance_mood"
DEFAULT_INPUT = "finances.month"


def month_fraction(month: Any, now_local: datetime) -> float | None:
    """How far through `month` ("YYYY-MM") we are: day/days for the current month, 1.0 for a past
    month, None for a future or unparseable one. Missing month = the current month."""
    y, m = now_local.year, now_local.month
    if isinstance(month, str) and month.strip():
        try:
            yy, mm = (int(p) for p in month.strip()[:7].split("-"))
        except ValueError:
            return None
        if (yy, mm) < (y, m):
            return 1.0
        if (yy, mm) > (y, m):
            return None
    days = calendar.monthrange(y, m)[1]
    return now_local.day / days


def mood_for(value: Any, now: datetime, cfg: dict[str, Any]) -> tuple[str | None, str]:
    """(mood, reason). Pure."""
    if not isinstance(value, dict):
        return None, "no data"
    income, spent, net = num(value.get("income")), num(value.get("spent")), num(value.get("net"))
    if net is None and income is not None and spent is not None:
        net = income - spent
    if net is None and (income is None or spent is None):
        return None, "no data"
    if net is not None and net < 0:
        return "warning", "net < 0"
    if income is None or spent is None:
        return "calm", "net >= 0"
    drift_ratio = float(cfg.get("drift_ratio", 0.85))
    warning_ratio = float(cfg.get("warning_ratio", 1.0))
    tol = float(cfg.get("pace_tolerance", 0.15))
    if income <= 0:
        return ("drift", "spending with no income") if spent > 0 else ("calm", "nothing in or out")
    ratio = spent / income
    if ratio > warning_ratio:
        return "warning", f"spent/income {ratio:.2f} > {warning_ratio}"
    if ratio > drift_ratio:
        return "drift", f"spent/income {ratio:.2f} > {drift_ratio}"
    frac = month_fraction(value.get("month"), now.astimezone(resolve_tz(cfg.get("timezone"), now)))
    if frac is not None and ratio > frac + tol:
        return "drift", f"spent/income {ratio:.2f} ahead of pace {frac:.2f} + {tol}"
    return "calm", f"spent/income {ratio:.2f}"


@rule(NAME, inputs=[DEFAULT_INPUT], every=300)
def finance_mood(pool: PoolView, now: datetime, cfg: dict[str, Any]):
    if cfg.get("enabled", True) is False:
        return []
    value = fresh_value(pool, cfg.get("input") or DEFAULT_INPUT, now)
    mood, reason = mood_for(value, now, cfg)
    return [{"key": "finances.mood", "value": mood, "type": "string", "meta": {"reason": reason}}]
