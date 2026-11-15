"""rss: an RSS 2.0 / RSS 1.0 (RDF) / Atom headline feed. Pull only; nothing about you is sent.

    [[source]]
    name = "news-ottawa"            # start the name with "news" so the news rule picks it up
    type = "rss"
    url = "https://www.cbc.ca/webfeed/rss/rss-canada-ottawa"
    label = "CBC Ottawa"            # display name; default = the feed's own <title>
    priority = 1                    # ranking weight for the news rule; >= [rules.news] critical_priority = critical
    every = "15m"
    # max_items = 20                # newest N kept
    # summary_chars = 280           # 0 = no summary
    # timeout = "15s"               # whole download, connect to last byte
    # max_bytes = 2000000           # larger responses are refused

Key (visibility "ask" unless the source sets visibility = "wall"):
  items  [{title, link, published, source, summary?}, ...] newest first (undated items last).
         title/summary are plain text (CDATA, HTML tags and entities resolved); published is ISO 8601
         with the [location] offset, or null when the feed gives no usable date; source = label.
         Signal meta: {priority, label, feed_title}.

Safety: the XML is parsed with defusedxml (entity declarations, i.e. "billion laughs" and external
entity/XXE tricks, are refused; a plain DOCTYPE is tolerated), the body is capped at `max_bytes`
while streaming and the whole fetch at `timeout`. Conditional GET (ETag / Last-Modified) keeps
polling cheap: a 304 re-emits the previous items.
"""
from __future__ import annotations

import asyncio
import html
import html.entities
import re
import unicodedata
from datetime import datetime, timedelta, timezone, tzinfo
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlsplit
from xml.etree.ElementTree import Element, ParseError

import httpx
from defusedxml import DefusedXmlException
from defusedxml.ElementTree import fromstring as safe_fromstring

from ._shared import OptionError, SourceError, iso, local_tz, opt, opt_duration, redact_url
from .base import Adapter, register

ALLOWED_OPTIONS = {"url", "label", "priority", "max_items", "summary_chars", "timeout", "max_bytes",
                   "every", "ttl", "visibility"}
DEFAULT_MAX_BYTES = 2_000_000
ACCEPT = "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5"

# RFC 822 zone names email.utils does not know (it knows UT/GMT/Z and the US zones).
_EXTRA_TZ = {
    "AST": -4, "ADT": -3, "NST": -3.5, "NDT": -2.5, "AKST": -9, "AKDT": -8, "HST": -10,
    "BST": 1, "IST": 1, "WET": 0, "WEST": 1, "CET": 1, "CEST": 2, "EET": 2, "EEST": 3, "MSK": 3,
    "JST": 9, "KST": 9, "AEST": 10, "AEDT": 11, "ACST": 9.5, "AWST": 8, "NZST": 12, "NZDT": 13,
    "UTC": 0,
}
_XML_ENTITIES = {b"amp", b"lt", b"gt", b"quot", b"apos"}
_NAMED_ENTITY = re.compile(rb"&([A-Za-z][A-Za-z0-9]{1,31});")
_TAG = re.compile(r"</?[A-Za-z][^<>]*>|<!--.*?-->", re.S)
_BLOCK = re.compile(r"<(script|style)\b[^>]*>.*?</\1\s*>", re.S | re.I)
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f​-‏  ﻿]")
_WS = re.compile(r"\s+")
_FRACTION = re.compile(r"(\.\d{6})\d+")


# ---------------------------------------------------------------------------------- text helpers

def clean_text(s: str | None, *, limit: int | None = None) -> str:
    """Feed text -> one line of plain text: HTML tags (escaped or not) and entities resolved."""
    if not s:
        return ""
    s = _BLOCK.sub(" ", s)
    s = _TAG.sub(" ", s)
    s = html.unescape(s)
    s = _BLOCK.sub(" ", s)          # HTML that was entity-escaped inside the XML
    s = _TAG.sub(" ", s)
    if "&" in s:                    # double-escaped entities ("&amp;amp;"), common in html titles
        s = html.unescape(s)
    s = unicodedata.normalize("NFC", _CTRL.sub("", s.replace(" ", " ")))
    s = _WS.sub(" ", s).strip()
    if limit is not None and len(s) > limit:
        cut = s[:limit].rsplit(" ", 1)[0] if " " in s[:limit] else s[:limit]
        s = cut.rstrip(" ,;:.-") + "…"
    return s


def _html_entities_to_numeric(data: bytes) -> bytes:
    """`&nbsp;` and friends are not XML; plenty of feeds use them anyway. Rewrite the ones HTML
    defines as numeric references so expat accepts them (no DTD involved)."""
    def sub(m: re.Match) -> bytes:
        name = m.group(1)
        if name in _XML_ENTITIES:
            return m.group(0)
        cp = html.entities.name2codepoint.get(name.decode("ascii"))
        return f"&#{cp};".encode("ascii") if cp is not None else m.group(0)
    return _NAMED_ENTITY.sub(sub, data)


# ---------------------------------------------------------------------------------- dates

def parse_date(s: str | None, tz: tzinfo | None = None) -> datetime | None:
    """RFC 822 (RSS pubDate) or ISO 8601 / RFC 3339 (Atom, dc:date) -> aware datetime, else None.
    Naive values (no offset given) are taken to be in `tz` (UTC if not given); "-0000" means UTC."""
    if not s or not isinstance(s, str):
        return None
    s = _WS.sub(" ", s).strip()
    if not s:
        return None
    dt: datetime | None = None
    if re.match(r"^\d{4}-?\d{2}-?\d{2}", s):                       # ISO 8601
        iso_s = _FRACTION.sub(r"\1", s.replace(" ", "T", 1) if re.match(r"^\d{4}-\d{2}-\d{2} \d", s) else s)
        if iso_s[-1:] in ("Z", "z"):
            iso_s = iso_s[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(iso_s)
        except ValueError:
            dt = None
        if dt is not None and dt.tzinfo is None:
            dt = dt.replace(tzinfo=tz or timezone.utc)
    if dt is None:                                                  # RFC 822 and friends
        try:
            dt = parsedate_to_datetime(s)
        except (TypeError, ValueError, IndexError, OverflowError):
            dt = None
        if dt is not None and dt.tzinfo is None:
            zone = s.rsplit(" ", 1)[-1].upper()
            off = _EXTRA_TZ.get(zone)
            dt = dt.replace(tzinfo=timezone(timedelta(hours=off)) if off is not None else timezone.utc)
    if dt is None or not (1990 <= dt.year <= 2200):
        return None
    return dt


# ---------------------------------------------------------------------------------- parsing

def _local(tag: Any) -> str:
    if not isinstance(tag, str):
        return ""
    return tag.rsplit("}", 1)[-1].lower() if "}" in tag else tag.lower().rsplit(":", 1)[-1]


def _children(el: Element, name: str) -> list[Element]:
    return [c for c in el if _local(c.tag) == name]


def _child(el: Element, *names: str) -> Element | None:
    for name in names:
        for c in el:
            if _local(c.tag) == name:
                return c
    return None


def _text(el: Element | None) -> str:
    return "" if el is None else "".join(el.itertext())


def _link(el: Element) -> str | None:
    """RSS <link>text</link>, or Atom <link rel="alternate" href=...> (rel defaults to alternate)."""
    best = None
    for c in _children(el, "link"):
        href = c.get("href")
        if href:
            rel = (c.get("rel") or "alternate").lower()
            if rel == "alternate" and best is None:
                best = href
        elif (c.text or "").strip():
            best = best or c.text.strip()
    if best is None:
        guid = _child(el, "guid")
        if guid is not None and (guid.get("isPermaLink") or "true").lower() == "true":
            best = (guid.text or "").strip() or None
    if best and urlsplit(best).scheme in ("http", "https"):
        return best
    return None


class FeedError(ValueError):
    pass


def parse_feed(data: bytes, *, tz: tzinfo | None = None, label: str | None = None, max_items: int = 20,
               summary_chars: int = 280) -> tuple[str | None, list[dict[str, Any]]]:
    """Bytes of an RSS/Atom document -> (feed title, items newest first). Pure; raises FeedError."""
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]
    if not data.startswith((b"\xff\xfe", b"\xfe\xff")):
        data = _html_entities_to_numeric(data.lstrip())
    try:
        root = safe_fromstring(data, forbid_dtd=False, forbid_entities=True, forbid_external=True)
    except DefusedXmlException as e:
        raise FeedError(f"feed refused: unsafe XML ({type(e).__name__})") from None
    except ParseError as e:
        raise FeedError(f"not well-formed XML ({e})") from None

    kind = _local(root.tag)
    if kind == "rss":
        channel = _child(root, "channel")
        if channel is None:
            raise FeedError("RSS document has no <channel>")
        entries, title_el = _children(channel, "item"), _child(channel, "title")
    elif kind == "rdf":                                  # RSS 1.0: items are siblings of the channel
        channel = _child(root, "channel")
        entries = _children(root, "item")
        title_el = _child(channel, "title") if channel is not None else None
    elif kind == "feed":                                 # Atom
        entries, title_el = _children(root, "entry"), _child(root, "title")
    else:
        raise FeedError(f"not an RSS or Atom feed (root element <{kind or '?'}>)")

    feed_title = clean_text(_text(title_el)) or None
    source = label or feed_title
    items: list[tuple[datetime | None, int, dict[str, Any]]] = []
    for i, e in enumerate(entries):
        title = clean_text(_text(_child(e, "title")), limit=300)
        if not title:
            continue
        published = None
        for name in ("pubdate", "published", "date", "issued", "updated", "modified"):
            d = _child(e, name)
            if d is not None:
                published = parse_date(_text(d), tz)
                if published is not None:
                    break
        item: dict[str, Any] = {"title": title, "link": _link(e),
                                "published": iso(published.astimezone(tz) if tz else published)
                                if published else None,
                                "source": source}
        if summary_chars > 0:
            summary = clean_text(_text(_child(e, "description", "summary", "encoded", "content")),
                                 limit=summary_chars)
            if summary and summary != title:
                item["summary"] = summary
        items.append((published, i, item))
    # newest first; undated keep feed order, after the dated ones
    dated = sorted((x for x in items if x[0] is not None), key=lambda x: (-x[0].timestamp(), x[1]))
    undated = [x for x in items if x[0] is None]
    return feed_title, [x[2] for x in (dated + undated)[:max_items]]


# ---------------------------------------------------------------------------------- adapter

@register("rss")
class Rss(Adapter):
    default_every = 900.0

    def __init__(self, name: str, options: dict[str, Any], ctx):
        super().__init__(name, options, ctx)
        unknown = sorted(set(options) - ALLOWED_OPTIONS)
        if unknown:
            raise OptionError(f"source {name!r}: unknown option(s) {', '.join(unknown)}; "
                              f"rss takes {', '.join(sorted(ALLOWED_OPTIONS - {'every', 'ttl', 'visibility'}))}")
        self.url = opt(options, "url", str, source=name).strip()
        if self.url.startswith("feed://"):
            self.url = "https://" + self.url[len("feed://"):]
        u = urlsplit(self.url)
        if u.scheme not in ("http", "https") or not u.hostname:
            raise OptionError(f"source {name!r}: url must be an http:// or https:// feed address")
        label = opt(options, "label", str, None, source=name)
        if label is not None and not label.strip():
            raise OptionError(f"source {name!r}: label must not be empty (leave it out to use the feed title)")
        self.label = label.strip() if label else None
        self.priority = opt(options, "priority", int, 0, source=name)
        self.max_items = opt(options, "max_items", int, 20, source=name)
        if not 1 <= self.max_items <= 200:
            raise OptionError(f"source {name!r}: max_items must be 1..200")
        self.summary_chars = opt(options, "summary_chars", int, 280, source=name)
        if not 0 <= self.summary_chars <= 4000:
            raise OptionError(f"source {name!r}: summary_chars must be 0..4000")
        self.max_bytes = opt(options, "max_bytes", int, DEFAULT_MAX_BYTES, source=name)
        if not 1024 <= self.max_bytes <= 50_000_000:
            raise OptionError(f"source {name!r}: max_bytes must be 1024..50000000")
        self.timeout = opt_duration(options, "timeout", 15.0, source=name)
        self.visibility = options.get("visibility", "ask")
        self.tz = local_tz(ctx.settings)
        self._validators: dict[str, str] = {}
        self._last: tuple[str | None, list[dict[str, Any]]] | None = None

    async def download(self) -> bytes | None:
        """The feed body (None = 304 Not Modified). Size- and time-limited; errors name only the host."""
        shown = redact_url(self.url)
        headers = {"Accept": ACCEPT}
        if self._last is not None:
            if "etag" in self._validators:
                headers["If-None-Match"] = self._validators["etag"]
            if "last-modified" in self._validators:
                headers["If-Modified-Since"] = self._validators["last-modified"]
        try:
            async with asyncio.timeout(self.timeout):
                async with self.ctx.http.stream("GET", self.url, headers=headers,
                                                timeout=self.timeout) as r:
                    if r.status_code == 304 and self._last is not None:
                        return None
                    if not 200 <= r.status_code < 300:
                        raise SourceError(f"GET {shown} returned HTTP {r.status_code}")
                    declared = r.headers.get("content-length")
                    if declared and declared.isdigit() and int(declared) > self.max_bytes:
                        raise SourceError(f"GET {shown}: feed is {int(declared)} bytes, over max_bytes "
                                          f"({self.max_bytes})")
                    buf = bytearray()
                    async for chunk in r.aiter_bytes():
                        buf += chunk
                        if len(buf) > self.max_bytes:
                            raise SourceError(f"GET {shown}: feed is over max_bytes ({self.max_bytes})")
                    self._validators = {k: r.headers[k] for k in ("etag", "last-modified") if r.headers.get(k)}
                    return bytes(buf)
        except TimeoutError:
            raise SourceError(f"GET {shown} timed out after {self.timeout:g} s") from None
        except httpx.TimeoutException:
            raise SourceError(f"GET {shown} timed out after {self.timeout:g} s") from None
        except httpx.HTTPError as e:
            raise SourceError(f"GET {shown} failed: {type(e).__name__}") from None

    def emit(self, feed_title: str | None, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        self.status.extra.update({"feed_title": feed_title, "items": len(items)})
        return [{"key": "items", "value": items, "type": "series", "visibility": self.visibility,
                 "meta": {"priority": self.priority, "label": self.label or feed_title,
                          "feed_title": feed_title}}]

    async def fetch(self):
        data = await self.download()
        if data is None:
            self.status.extra["not_modified"] = True
            return self.emit(*self._last)
        self.status.extra["not_modified"] = False
        try:
            parsed = await asyncio.to_thread(parse_feed, data, tz=self.tz, label=self.label,
                                             max_items=self.max_items, summary_chars=self.summary_chars)
        except FeedError as e:
            raise SourceError(f"{redact_url(self.url)}: {e}") from None
        self._last = parsed
        return self.emit(*parsed)
