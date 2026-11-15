"""ical adapter against tests/fixtures/calendar.ics. No live network."""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pytest

from ambient.adapters._shared import OptionError, SourceError
from ambient.adapters.base import AdapterContext
from ambient.adapters.ical import ICal

FIX = Path(__file__).parent / "fixtures"
TZ = ZoneInfo("America/Toronto")
SETTINGS = {"location": {"lat": 45.898, "lon": -77.283, "timezone": "America/Toronto"}}


def make_ctx(handler=None, data_dir=FIX) -> AdapterContext:
    transport = httpx.MockTransport(handler or (lambda r: httpx.Response(599)))
    return AdapterContext(http=httpx.AsyncClient(transport=transport), log=logging.getLogger("test"),
                          data_dir=data_dir, settings=SETTINGS)


async def run(at: datetime, **opts):
    a = ICal("calendar", {"path": "calendar.ics", **opts}, make_ctx())
    a.now = lambda: at
    items = await a.fetch()
    return {i["key"]: i for i in items}


async def test_next_and_today_on_a_friday_afternoon():
    k = await run(datetime(2026, 10, 9, 14, 0, tzinfo=TZ))
    nxt = k["next"]["value"]
    # cancelled 14:30 event skipped; Ops sync 16:00 is EXDATE'd today; Dentist is 19:00Z = 15:00 EDT
    assert nxt == {"title": "Dentist", "start": "2026-10-09T15:00:00-04:00",
                   "end": "2026-10-09T16:00:00-04:00", "all_day": False, "location": "Main St Clinic"}
    today = k["today"]
    assert today["visibility"] == "ask" and today["type"] == "series"
    assert [e["title"] for e in today["value"]] == ["Payday", "Dentist"]


async def test_all_day_skipped_unless_asked_and_floating_time_is_local():
    at = datetime(2026, 10, 9, 15, 30, tzinfo=TZ)
    k = await run(at)
    assert k["next"]["value"]["title"] == "Floating breakfast"
    assert k["next"]["value"]["start"] == "2026-10-10T09:00:00-04:00"
    k = await run(at, include_all_day=True)
    assert k["next"]["value"]["title"] == "Long weekend" and k["next"]["value"]["all_day"] is True


async def test_recurrence_and_dst():
    k = await run(datetime(2026, 10, 12, 10, 0, tzinfo=TZ))
    assert k["next"]["value"]["title"] == "Ops sync"
    assert k["next"]["value"]["start"] == "2026-10-12T16:00:00-04:00"
    # after DST ends (Nov 1) the same 16:00 local is -05:00
    k = await run(datetime(2026, 11, 2, 10, 0, tzinfo=TZ))
    assert k["next"]["value"]["start"] == "2026-11-02T16:00:00-05:00"


async def test_nothing_upcoming_emits_null():
    k = await run(datetime(2026, 10, 9, 14, 0, tzinfo=TZ), horizon="1m")
    # Dentist is an hour away, beyond a 1-minute horizon
    assert k["next"]["value"] is None


async def test_url_fetch_redacts_secret_address():
    ics = (FIX / "calendar.ics").read_bytes()
    url = "webcal://calendar.google.com/calendar/ical/me%40gmail.com/private-SEKRET/basic.ics"
    seen = []

    def ok(req):
        seen.append(str(req.url))
        return httpx.Response(200, content=ics)
    a = ICal("calendar", {"url": url}, make_ctx(ok))
    a.now = lambda: datetime(2026, 10, 9, 14, 0, tzinfo=TZ)
    items = await a.fetch()
    assert seen[0].startswith("https://calendar.google.com/")
    assert items[0]["value"]["title"] == "Dentist"

    bad = ICal("calendar", {"url": url}, make_ctx(lambda r: httpx.Response(404)))
    with pytest.raises(SourceError) as ei:
        await bad.fetch()
    assert "SEKRET" not in str(ei.value) and "404" in str(ei.value)

    junk = ICal("calendar", {"url": url}, make_ctx(lambda r: httpx.Response(200, text="<html>nope</html>")))
    with pytest.raises(SourceError, match="iCalendar"):
        await junk.fetch()


def test_options():
    with pytest.raises(OptionError, match="exactly one"):
        ICal("c", {}, make_ctx())
    with pytest.raises(OptionError, match="exactly one"):
        ICal("c", {"url": "https://x/y.ics", "path": "a.ics"}, make_ctx())
    with pytest.raises(OptionError, match="http"):
        ICal("c", {"url": "file:///etc/passwd"}, make_ctx())


async def test_missing_file(tmp_path):
    a = ICal("c", {"path": "nope.ics"}, make_ctx(data_dir=tmp_path))
    with pytest.raises(SourceError, match="not found"):
        await a.fetch()
