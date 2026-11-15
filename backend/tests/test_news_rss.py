"""rss adapter: RSS 2.0 / RSS 1.0 / Atom parsing against fixtures (one real CBC response), safety
(entity expansion, XXE, oversize, timeouts), conditional GET, options. No live network."""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pytest

from ambient.adapters._shared import OptionError, SourceError
from ambient.adapters.base import REGISTRY, AdapterContext
from ambient.adapters.rss import FeedError, Rss, clean_text, parse_date, parse_feed
from ambient.signal import coerce

FIX = Path(__file__).parent / "fixtures"
TZ = ZoneInfo("America/Toronto")
SETTINGS = {"location": {"lat": 45.898, "lon": -77.283, "timezone": "America/Toronto"}}
URL = "https://feeds.example/private-path/rss?token=SEKRET"


def fixture(name: str) -> bytes:
    return (FIX / name).read_bytes()


def make(handler, name="news-test", **opts) -> Rss:
    ctx = AdapterContext(http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
                         log=logging.getLogger("test"), data_dir=Path("."), settings=SETTINGS)
    return Rss(name, {"url": URL, **opts}, ctx)


def serve(body: bytes, status=200, headers=None, seen=None):
    def handler(req: httpx.Request):
        if seen is not None:
            seen.append(req)
        return httpx.Response(status, content=body, headers=headers or {"content-type": "application/rss+xml"})
    return handler


def assert_plain(text: str):
    assert "<" not in re.sub(r" < \d", "", text) and ">" not in text, text
    assert not re.search(r"&[#A-Za-z0-9]+;", text), text
    assert text == text.strip() and "  " not in text and "\n" not in text


# ------------------------------------------------------------------------------ real CBC response

def test_cbc_fixture_parses_newest_first_with_local_offsets():
    title, items = parse_feed(fixture("rss_cbc_ottawa.xml"), tz=TZ, label="CBC Ottawa")
    assert title == "CBC | Ottawa News"
    assert len(items) == 20
    pubs = [datetime.fromisoformat(i["published"]) for i in items]
    assert all(p.tzinfo is not None and p.utcoffset() == timedelta(hours=-4) for p in pubs)
    assert pubs == sorted(pubs, reverse=True)          # the feed itself is not in date order
    first = items[0]
    assert first["title"] == "B.C. Lions secure playoff spot with 41-20 decision over winless Ottawa Redblacks"
    assert first["published"] == "2026-10-10T09:14:20-04:00"           # "Sat, 10 Oct 2026 09:14:20 EDT"
    assert first["source"] == "CBC Ottawa"
    assert first["link"].startswith("https://www.cbc.ca/news/canada/ottawa/")
    for it in items:
        assert set(it) <= {"title", "link", "published", "source", "summary"}
        assert_plain(it["title"])
        assert it["link"].startswith("https://")
        if "summary" in it:
            assert_plain(it["summary"])
            assert "img src" not in it["summary"] and len(it["summary"]) <= 281
    # typographic characters survive (curly apostrophe, accented letters)
    assert any("’" in i["title"] for i in items)
    assert any("Québécois" in i.get("summary", "") for i in items)


def test_max_items_keeps_the_newest_and_label_defaults_to_feed_title():
    _, all_items = parse_feed(fixture("rss_cbc_ottawa.xml"), tz=TZ)
    title, items = parse_feed(fixture("rss_cbc_ottawa.xml"), tz=TZ, max_items=5)
    assert items == all_items[:5]
    assert {i["source"] for i in items} == {"CBC | Ottawa News"}
    _, no_summary = parse_feed(fixture("rss_cbc_ottawa.xml"), tz=TZ, summary_chars=0)
    assert all("summary" not in i for i in no_summary)


# ------------------------------------------------------------------------------ synthetic feeds

def test_atom_titles_links_and_dates():
    title, items = parse_feed(fixture("atom_synthetic.xml"), tz=TZ)
    assert title == "Valley Alerts"
    by_title = {i["title"]: i for i in items}
    assert list(by_title) == [
        "Road closures on Hwy. 17",                                  # updated 13:00Z = 09:00 EDT
        "Boil water advisory lifted for Petawawa & area",            # published 08:30 EDT
        "Council meeting moved to Tuesday",                          # date-only = local midnight
        "Library hours change for the long weekend",                 # undated: last
    ]                                                                # whitespace-only title: skipped
    boil = by_title["Boil water advisory lifted for Petawawa & area"]
    assert boil["link"] == "https://alerts.example/a1"               # rel=alternate, not the enclosure
    assert boil["published"] == "2026-10-10T08:30:00-04:00"          # published wins over updated
    assert boil["summary"] == "The Town of Petawawa lifted the advisory at 8 a.m."
    road = by_title["Road closures on Hwy. 17"]
    assert road["published"] == "2026-10-10T09:00:00-04:00"          # 7-digit fraction tolerated
    assert road["link"] == "https://alerts.example/a2"               # link with no rel = alternate
    assert road["summary"] == "Eastbound lanes closed near Doran Road."
    assert by_title["Council meeting moved to Tuesday"]["published"] == "2026-10-09T00:00:00-04:00"
    lib = by_title["Library hours change for the long weekend"]
    assert lib["published"] is None and lib["link"] is None          # javascript: link dropped


def test_rss_html_titles_entities_namespaces_and_odd_dates():
    title, items = parse_feed(fixture("rss_html_titles.xml"), tz=TZ)  # leading whitespace before <?xml
    assert title == "The Valley Gazette"
    t = {i["title"]: i for i in items}
    brk =t["Breaking: Pembroke & Petawawa merge fire services"]
    assert brk["published"] == "2026-10-10T08:15:00-04:00"
    assert brk["summary"] == "Councils voted 7–2."              # img + script dropped, &ndash; resolved
    cafe = t["Café owner wins “best” award — again"]   # bare HTML entities, not in CDATA
    assert cafe["published"] == "2026-10-10T11:45:00-04:00"          # dc:date
    assert cafe["summary"] == "Third year running."                  # content:encoded
    esc = t["Escaped markup in a title, 5 < 6"]
    assert esc["link"] == "https://gazette.example/escaped"           # permalink guid
    assert esc["published"] == "2026-10-10T10:00:00-04:00"
    assert t["European zone abbreviation"]["published"] == "2026-10-10T10:00:00-04:00"
    assert t["No date on this one"]["published"] is None
    assert t["Garbage date on this one"]["published"] is None
    assert len(items) == 6                                            # the untitled item is skipped


def test_rss_html_titles_exact_order():
    _, items = parse_feed(fixture("rss_html_titles.xml"), tz=TZ)
    assert [i["title"] for i in items] == [
        "Café owner wins “best” award — again",   # 11:45 EDT
        "Escaped markup in a title, 5 < 6",                    # 10:00 EDT (14:00 +0000), feed position 3
        "European zone abbreviation",                          # 10:00 EDT (16:00 CEST), feed position 6
        "Breaking: Pembroke & Petawawa merge fire services",   # 08:15 EDT
        "No date on this one",                                 # undated, feed order
        "Garbage date on this one",
    ]


def test_rss1_rdf_latin1_with_plain_doctype():
    title, items = parse_feed(fixture("rss1_rdf.xml"), tz=TZ)
    assert title == "RDF Times"
    assert [(i["title"], i["published"], i["link"]) for i in items] == [
        ("Québec election results certified", "2026-10-10T09:00:00-04:00", "https://rdf.example/2"),
        ("Montréal transit strike ends", "2026-10-10T07:00:00-04:00", "https://rdf.example/1"),
    ]


# ------------------------------------------------------------------------------ safety

@pytest.mark.parametrize("name", ["rss_billion_laughs.xml", "rss_xxe.xml"])
def test_entity_declarations_are_refused(name):
    with pytest.raises(FeedError, match="unsafe XML"):
        parse_feed(fixture(name))


@pytest.mark.parametrize("name", ["rss_billion_laughs.xml", "rss_xxe.xml"])
async def test_adapter_refuses_entity_attacks_quickly(name):
    a = make(serve(fixture(name)))
    loop = asyncio.get_running_loop()
    t0 = loop.time()
    with pytest.raises(SourceError, match="unsafe XML") as e:
        await a.fetch()
    assert loop.time() - t0 < 2
    assert "SEKRET" not in str(e.value) and "private-path" not in str(e.value)


async def test_malformed_feed_is_an_error():
    with pytest.raises(SourceError, match="not well-formed"):
        await make(serve(fixture("rss_malformed.xml"))).fetch()


@pytest.mark.parametrize("body", [b"<html><body>Not a feed</body></html>", b'{"items": []}', b""])
async def test_not_a_feed(body):
    with pytest.raises(SourceError, match="not an RSS or Atom feed|not well-formed"):
        await make(serve(body)).fetch()


def oversize_body(n_bytes: int) -> bytes:
    item = b"<item><title>Filler headline</title><link>https://x.example/</link></item>"
    head, tail = b'<?xml version="1.0"?><rss version="2.0"><channel><title>Big</title>', b"</channel></rss>"
    return head + item * (n_bytes // len(item) + 1) + tail


async def test_oversize_feed_refused_by_content_length():
    body = oversize_body(2_100_000)
    with pytest.raises(SourceError, match="over max_bytes"):
        await make(serve(body)).fetch()                       # default 2 MB limit
    _, items = parse_feed(body, max_items=3)                  # the same body is a valid feed
    assert len(items) == 3


async def test_oversize_feed_refused_while_streaming_without_content_length():
    body = oversize_body(300_000)

    async def chunks():
        for i in range(0, len(body), 16384):
            yield body[i:i + 16384]

    a = make(lambda req: httpx.Response(200, content=chunks()), max_bytes=100_000)
    with pytest.raises(SourceError, match=r"over max_bytes \(100000\)"):
        await a.fetch()
    ok = make(lambda req: httpx.Response(200, content=body), max_bytes=400_000)
    assert len((await ok.fetch())[0]["value"]) == 20


async def test_total_timeout_covers_a_slow_body():
    async def slow():
        yield b'<?xml version="1.0"?><rss version="2.0"><channel><title>Slow</title>'
        await asyncio.sleep(5)
        yield b"</channel></rss>"

    a = make(lambda req: httpx.Response(200, content=slow()), timeout="200ms")
    loop = asyncio.get_running_loop()
    t0 = loop.time()
    with pytest.raises(SourceError, match="timed out after 0.2 s"):
        await a.fetch()
    assert loop.time() - t0 < 2


async def test_http_errors_name_only_the_host():
    with pytest.raises(SourceError, match=r"GET https://feeds\.example/\.\.\. returned HTTP 404") as e:
        await make(serve(b"", status=404)).fetch()
    assert "SEKRET" not in str(e.value)

    def boom(req):
        raise httpx.ConnectError(f"cannot connect to {req.url}")
    with pytest.raises(SourceError, match="failed: ConnectError") as e:
        await make(boom).fetch()
    assert "SEKRET" not in str(e.value)

    def slow(req):
        raise httpx.ReadTimeout("read timed out")
    with pytest.raises(SourceError, match="timed out"):
        await make(slow).fetch()


# ------------------------------------------------------------------------------ adapter behaviour

async def test_signal_shape_and_pull_only_request():
    seen = []
    a = make(serve(fixture("rss_cbc_ottawa.xml"), seen=seen), label="CBC Ottawa", priority=2, max_items=8)
    items = await a.fetch()
    assert len(items) == 1
    it = items[0]
    assert it["key"] == "items" and it["type"] == "series" and it["visibility"] == "ask"
    assert it["meta"] == {"priority": 2, "label": "CBC Ottawa", "feed_title": "CBC | Ottawa News"}
    assert len(it["value"]) == 8 and all(v["source"] == "CBC Ottawa" for v in it["value"])
    sig = coerce(it, source="news-test", ttl_s=a.ttl_s, visibility=a.visibility)
    assert sig.id == "news-test.items" and sig.ttl_s == 2700          # 3 x 15 min
    # pull only: a plain GET of the configured URL, nothing added
    (req,) = seen
    assert req.method == "GET" and str(req.url) == URL and req.content == b""
    assert "rss+xml" in req.headers["accept"] and "cookie" not in req.headers
    assert a.status.extra["items"] == 8 and a.status.extra["feed_title"] == "CBC | Ottawa News"
    wall = make(serve(fixture("rss_cbc_ottawa.xml")), visibility="wall")
    assert (await wall.fetch())[0]["visibility"] == "wall"


async def test_conditional_get_reuses_items_on_304():
    seen, calls = [], []

    def handler(req):
        seen.append(dict(req.headers))
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(200, content=fixture("rss_cbc_ottawa.xml"),
                                  headers={"ETag": '"abc"', "Last-Modified": "Sat, 10 Oct 2026 13:14:20 GMT"})
        assert req.headers["if-none-match"] == '"abc"'
        assert req.headers["if-modified-since"] == "Sat, 10 Oct 2026 13:14:20 GMT"
        return httpx.Response(304)

    a = make(handler)
    first = await a.fetch()
    second = await a.fetch()
    assert "if-none-match" not in seen[0]
    assert second == first and a.status.extra["not_modified"] is True


async def test_registered_and_default_every():
    assert REGISTRY["rss"] is Rss
    a = make(serve(b""))
    assert a.every == 900 and a.max_items == 20 and a.priority == 0 and a.max_bytes == 2_000_000
    assert make(serve(b""), every="5m").every == 300


def test_options_are_validated():
    ok = make(serve(b""), url="feed://www.cbc.ca/webfeed/rss/rss-topstories")
    assert ok.url == "https://www.cbc.ca/webfeed/rss/rss-topstories"
    bad = [
        ({"url": None}, "url.*required"),
        ({"url": "ftp://x.example/feed"}, "http"),
        ({"url": "https://"}, "http"),
        ({"url": 5}, "url.*str"),
        ({"priority": "high"}, "priority"),
        ({"priority": True}, "priority"),
        ({"max_items": 0}, "max_items"),
        ({"max_items": 1.5}, "max_items"),
        ({"max_bytes": 10}, "max_bytes"),
        ({"summary_chars": -1}, "summary_chars"),
        ({"label": "  "}, "label"),
        ({"timeout": "soon"}, "timeout"),
        ({"priorty": 3}, "unknown option.*priorty"),
    ]
    for opts, msg in bad:
        with pytest.raises(OptionError, match=msg):
            make(serve(b""), **opts)


# ------------------------------------------------------------------------------ helpers

@pytest.mark.parametrize("raw, expected", [
    ("Sat, 10 Oct 2026 09:14:20 EDT", "2026-10-10T09:14:20-04:00"),
    ("Sat, 10 Oct 2026 09:14:20 GMT", "2026-10-10T09:14:20+00:00"),
    ("Sat, 10 Oct 2026 09:14:20 +0130", "2026-10-10T09:14:20+01:30"),
    ("Sat, 10 Oct 2026 09:14:20 -0000", "2026-10-10T09:14:20+00:00"),
    ("Sat, 10 Oct 2026 09:14:20 ADT", "2026-10-10T09:14:20-03:00"),
    ("Sat, 10 Oct 2026 09:14:20 NDT", "2026-10-10T09:14:20-02:30"),
    ("10 Oct 2026 09:14 EST", "2026-10-10T09:14:00-05:00"),
    ("Saturday, 10 Oct 2026 09:14:20 GMT", "2026-10-10T09:14:20+00:00"),
    ("Sat,  10 Oct 2026\n 09:14:20 PDT", "2026-10-10T09:14:20-07:00"),
    ("2026-10-10T09:14:20Z", "2026-10-10T09:14:20+00:00"),
    ("2026-10-10T09:14:20.123456789+02:00", "2026-10-10T09:14:20.123456+02:00"),
    ("2026-10-10 09:14:20+0200", "2026-10-10T09:14:20+02:00"),
    ("20261010T091420Z", "2026-10-10T09:14:20+00:00"),
    ("2026-10-10T09:14:20", "2026-10-10T09:14:20-04:00"),                  # naive = local
    ("2026-10-10", "2026-10-10T00:00:00-04:00"),
])
def test_parse_date(raw, expected):
    dt = parse_date(raw, TZ)
    assert dt is not None and dt.tzinfo is not None
    assert dt == datetime.fromisoformat(expected)
    assert dt.utcoffset() == datetime.fromisoformat(expected).utcoffset()


@pytest.mark.parametrize("raw", [None, "", "   ", "yesterday", "32 Foo 2026", "0001-01-01T00:00:00Z", 12345])
def test_parse_date_garbage_is_none(raw):
    assert parse_date(raw, TZ) is None


def test_parse_date_naive_without_tz_is_utc():
    assert parse_date("2026-10-10T09:14:20") == datetime(2026, 10, 10, 9, 14, 20, tzinfo=timezone.utc)


def test_clean_text():
    assert clean_text("<p>Hello&nbsp;<b>world</b></p>") == "Hello world"
    assert clean_text("&lt;b&gt;Escaped&lt;/b&gt; &amp;amp; double") == "Escaped & double"
    assert clean_text("a <script>evil()</script> b <!-- c --> d") == "a b d"
    assert clean_text("5 < 6 and 7 > 3") == "5 < 6 and 7 > 3"
    assert clean_text("zero​width\x07bell") == "zerowidthbell"
    assert clean_text("one two three four", limit=9) == "one two…"
    assert clean_text(None) == ""
