"""ical: an iCalendar feed (Google Calendar's "secret address in iCal format": read-only, no OAuth)
or a local .ics file. Recurring events are expanded; times are converted to [location] timezone.

    [[source]]
    name = "calendar"
    type = "ical"
    url = "${CALENDAR_ICS_URL}"       # or: path = "calendar.ics" (relative to the data dir)
    every = "5m"
    # include_all_day = false
    # horizon = "14d"                 # how far ahead to look for `next`

Keys:
  next   {title, start, end, location?, all_day} of the next event starting after now, or null
  today  [{title, start, end, location?, all_day}, ...] for the local day (ask-only)

The secret URL is a credential: keep it in secrets.toml. It never appears in logs or status
(only the host does).
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime, time, timedelta, tzinfo
from typing import Any

import icalendar
import recurring_ical_events

from ..signal import utcnow
from ._shared import OptionError, SourceError, http_get, iso, local_tz, opt, opt_duration, resolve_data_path
from .base import Adapter, register


def _as_dt(v: date | datetime, tz: tzinfo) -> tuple[datetime, bool]:
    """(aware datetime in tz, all_day). Floating times are taken as local."""
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=tz)
        return v.astimezone(tz), False
    return datetime.combine(v, time(0), tzinfo=tz), True


def events_between(cal: icalendar.Calendar, start: datetime, end: datetime, tz: tzinfo) -> list[dict[str, Any]]:
    out = []
    for ev in recurring_ical_events.of(cal).between(start, end):
        if str(ev.get("STATUS", "")).upper() == "CANCELLED":
            continue
        dtstart = ev.get("DTSTART")
        if dtstart is None:
            continue
        s, all_day = _as_dt(dtstart.dt, tz)
        dtend = ev.get("DTEND")
        if dtend is not None:
            e, _ = _as_dt(dtend.dt, tz)
        elif ev.get("DURATION") is not None:
            e = s + ev.get("DURATION").dt
        else:
            e = s + (timedelta(days=1) if all_day else timedelta(0))
        item = {"title": str(ev.get("SUMMARY", "") or "(no title)").strip(),
                "start": s, "end": e, "all_day": all_day}
        loc = str(ev.get("LOCATION", "") or "").strip()
        if loc:
            item["location"] = loc
        out.append(item)
    out.sort(key=lambda x: (x["start"], not x["all_day"], x["title"]))
    return out


def _public(ev: dict[str, Any]) -> dict[str, Any]:
    return {**ev, "start": iso(ev["start"]), "end": iso(ev["end"])}


def compute(cal: icalendar.Calendar, now: datetime, tz: tzinfo, *, include_all_day: bool = False,
            horizon: timedelta = timedelta(days=14)) -> list[dict[str, Any]]:
    now = now.astimezone(tz)
    day0 = datetime.combine(now.date(), time(0), tzinfo=tz)
    day1 = day0 + timedelta(days=1)
    span_end = max(now + horizon, day1)
    evs = events_between(cal, day0 - timedelta(days=1), span_end, tz)
    nxt = next((e for e in evs if now < e["start"] <= now + horizon
                and (include_all_day or not e["all_day"])), None)
    today = [_public(e) for e in evs if e["start"] < day1 and e["end"] > day0]
    return [
        {"key": "next", "value": _public(nxt) if nxt else None, "type": "object"},
        {"key": "today", "value": today, "type": "series", "visibility": "ask"},
    ]


@register("ical")
class ICal(Adapter):
    default_every = 300.0

    def __init__(self, name: str, options: dict[str, Any], ctx):
        super().__init__(name, options, ctx)
        self.url = opt(options, "url", str, None, source=name)
        path = opt(options, "path", str, None, source=name)
        if bool(self.url) == bool(path):
            raise OptionError(f"source {name!r}: set exactly one of url (iCal address) or path (.ics file)")
        if self.url:
            if self.url.startswith("webcal://"):
                self.url = "https://" + self.url[len("webcal://"):]
            if not self.url.startswith(("http://", "https://")):
                raise OptionError(f"source {name!r}: url must be http(s):// or webcal://")
        self.path = resolve_data_path(path, ctx.data_dir) if path else None
        self.include_all_day = opt(options, "include_all_day", bool, False, source=name)
        self.horizon = timedelta(seconds=opt_duration(options, "horizon", 14 * 86400.0, source=name))
        self.timeout = opt_duration(options, "timeout", 20.0, source=name)
        self.tz = local_tz(ctx.settings)

    def now(self) -> datetime:
        return utcnow()

    async def load(self) -> bytes:
        if self.url:
            return (await http_get(self.ctx.http, self.url, timeout=self.timeout)).content
        try:
            return self.path.read_bytes()
        except FileNotFoundError:
            raise SourceError(f"calendar file not found: {self.path}") from None

    async def fetch(self):
        raw = await self.load()
        now = self.now()

        def work():     # recurrence expansion is CPU-bound; keep it off the event loop
            try:
                cal = icalendar.Calendar.from_ical(raw)
            except ValueError as e:
                raise SourceError(f"not a valid iCalendar feed: {str(e)[:120]}") from None
            return compute(cal, now, self.tz, include_all_day=self.include_all_day, horizon=self.horizon)
        return await asyncio.to_thread(work)
