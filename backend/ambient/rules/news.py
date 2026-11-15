"""news: fuse every headline feed into one ranked list, and flag the rare item that matters now.

Inputs: every fresh `*.items` signal matching `inputs` (default "news*.items": rss sources whose
name starts with "news", e.g. news, news-ottawa, news_cbc). Each is a list of
{title, link?, published?, source?, summary?, priority?}; the feed's priority comes from the
signal's meta (the rss adapter puts its `priority` option there), an item's own `priority` wins.

Steps (pure: same pool + now + cfg -> same output, so a re-run never reports a change):

1. drop items with no title, and items published more than `max_age` ago (undated items stay)
2. rank: higher priority first, then local relevance (a `local_terms` match in the title beats one
   in the summary only, which beats none), then newest first (undated last), then title
3. dedupe near-identical titles, across feeds and within one: titles are normalised to token sets
   (casefolded, accents and punctuation stripped, possessive 's and simple plurals/-ed/-ing
   folded, stop words removed); similarity = mean of Jaccard (|A&B| / |A|B|) and the overlap
   coefficient (|A&B| / min(|A|,|B|)). At >= `dedupe_threshold` the lower-ranked item is merged
   into the higher-ranked one (its source is listed in `also`; critical is OR-ed)
4. critical = the title matches a `critical_terms` phrase (whole words, case-insensitive, plural ok)
   or the item's priority >= `critical_priority`; either way only while the item is younger than
   `critical_max_age` (undated items: priority only)
5. keep the best `keep`; critical items that ranked lower replace the lowest non-critical ones, so
   a critical headline is never cut. `rank` = 1-based position in the result

Outputs (source "rules"):
  news.top       [{title, source, link, published (ISO, local offset) | null, summary?, critical,
                   priority, local, rank, also?}, ...]   ([] when no fresh items)
  news.critical  true when any item in news.top is critical

The wall projection (wall.py `news`) shows one of news.top: the highest-ranked critical item pinned,
else it rotates through the first `rotate_top` every `rotate_s` seconds (a pure function of time).

Config [rules.news] (all optional; defaults shown):

    enabled           = true
    inputs            = ["news*.items"]
    every             = "60s"          # re-run so max_age / critical_max_age apply between fetches
    max_age           = "12h"
    keep              = 5
    dedupe_threshold  = 0.75           # 0..1; 1 = only identical token sets
    local_terms       = []               # place names that rank a headline up, e.g. ["Ottawa", "Gatineau"]
    critical_terms    = ["warning", "evacuation", "evacuate", "emergency", "tornado", "lockdown",
                         "boil water", "state of emergency", "amber alert", "shelter in place",
                         "hold and secure"]
    critical_priority = 10             # a source with priority >= this is critical (an alerts feed)
    critical_max_age  = "3h"           # an older item is never critical (no all-day pinned flare)
    rotate_top        = 3              # projection: rotate through this many
    rotate_s          = 60             # projection: seconds per headline
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from ..pool_view import PoolView
from ..util import parse_duration
from ._common import iso_local, num, parse_dt
from .base import rule

NAME = "news"
DEFAULT_INPUTS = ["news*.items"]
DEFAULT_LOCAL_TERMS: list[str] = []
DEFAULT_CRITICAL_TERMS = ["warning", "evacuation", "evacuate", "emergency", "tornado", "lockdown",
                          "boil water", "state of emergency", "amber alert", "shelter in place",
                          "hold and secure"]

_STOP = frozenset("""a an the of in on at to for and or but by with from as is are was were be been
it its this that these those into over after before about than then up down out off new says say""".split())


class NewsConfigError(ValueError):
    pass


@dataclass(frozen=True)
class Settings:
    inputs: tuple[str, ...]
    max_age_s: float
    keep: int
    dedupe_threshold: float
    local_terms: tuple[str, ...]
    critical_terms: tuple[str, ...]
    critical_priority: float
    critical_max_age_s: float
    rotate_top: int
    rotate_s: float


def _dur(cfg: dict[str, Any], key: str, default: str) -> float:
    try:
        v = parse_duration(cfg.get(key, default))
    except (TypeError, ValueError):
        raise NewsConfigError(f"[rules.news] {key}: bad duration {cfg.get(key)!r} (use e.g. 12h)") from None
    if v is None or v <= 0:
        raise NewsConfigError(f"[rules.news] {key} must be > 0")
    return v


def _int(cfg: dict[str, Any], key: str, default: int, lo: int) -> int:
    v = cfg.get(key, default)
    if isinstance(v, bool) or not isinstance(v, int) or v < lo:
        raise NewsConfigError(f"[rules.news] {key} must be an integer >= {lo}, got {v!r}")
    return v


def _terms(cfg: dict[str, Any], key: str, default: list[str]) -> tuple[str, ...]:
    v = cfg.get(key, default)
    if not isinstance(v, list) or not all(isinstance(t, str) for t in v):
        raise NewsConfigError(f"[rules.news] {key} must be a list of strings")
    return tuple(t.strip() for t in v if t.strip())


def settings(cfg: dict[str, Any] | None) -> Settings:
    """[rules.news] -> validated Settings (defaults filled). Raises NewsConfigError naming the key."""
    cfg = cfg or {}
    inputs = cfg.get("inputs") or DEFAULT_INPUTS
    if isinstance(inputs, str):
        inputs = [inputs]
    if not isinstance(inputs, list) or not all(isinstance(g, str) and g for g in inputs):
        raise NewsConfigError("[rules.news] inputs must be a list of signal id globs")
    thr = cfg.get("dedupe_threshold", 0.75)
    if isinstance(thr, bool) or not isinstance(thr, (int, float)) or not 0 < thr <= 1:
        raise NewsConfigError(f"[rules.news] dedupe_threshold must be a number in (0, 1], got {thr!r}")
    cp = cfg.get("critical_priority", 10)
    if isinstance(cp, bool) or not isinstance(cp, (int, float)):
        raise NewsConfigError(f"[rules.news] critical_priority must be a number, got {cp!r}")
    rot = cfg.get("rotate_s", 60)
    try:
        rot_s = parse_duration(rot) if isinstance(rot, str) else rot
    except ValueError:
        rot_s = None
    if isinstance(rot_s, bool) or not isinstance(rot_s, (int, float)) or rot_s <= 0:
        raise NewsConfigError(f"[rules.news] rotate_s must be > 0 seconds, got {rot!r}")
    return Settings(
        inputs=tuple(inputs),
        max_age_s=_dur(cfg, "max_age", "12h"),
        keep=_int(cfg, "keep", 5, 1),
        dedupe_threshold=float(thr),
        local_terms=_terms(cfg, "local_terms", DEFAULT_LOCAL_TERMS),
        critical_terms=_terms(cfg, "critical_terms", DEFAULT_CRITICAL_TERMS),
        critical_priority=float(cp),
        critical_max_age_s=_dur(cfg, "critical_max_age", "3h"),
        rotate_top=_int(cfg, "rotate_top", 3, 1),
        rotate_s=float(rot_s),
    )


# ------------------------------------------------------------------------------- text matching

def _fold(s: str) -> str:
    """casefold + strip accents: 'Montréal' -> 'montreal'."""
    s = unicodedata.normalize("NFKD", s.casefold())
    return "".join(c for c in s if not unicodedata.combining(c))


def _stem(t: str) -> str:
    """Crude suffix folding so 'issues' / 'issued' / 'issue' and 'warnings' / 'warning' compare equal."""
    if len(t) <= 3 or t.isdigit():
        return t
    if t.endswith("ies") and len(t) > 4:
        t = t[:-3] + "y"
    elif t.endswith(("sses", "xes", "zes", "ches", "shes")):
        t = t[:-2]
    elif t.endswith("s") and not t.endswith(("ss", "us", "is")):
        t = t[:-1]
    for suf in ("ing", "ed"):
        if t.endswith(suf) and len(t) - len(suf) >= 3:
            t = t[: -len(suf)]
            break
    if len(t) > 3 and t.endswith("e"):
        t = t[:-1]
    return t


def tokens(title: str) -> frozenset[str]:
    """Normalised token set for dedupe."""
    s = _fold(title)
    s = re.sub(r"['’]s\b", "", s)                    # possessive
    s = re.sub(r"[^\w]+", " ", s)
    toks = {_stem(t) for t in s.split() if t not in _STOP}
    return frozenset(t for t in toks if t)


def similarity(a: frozenset[str], b: frozenset[str]) -> float:
    """Mean of Jaccard and the overlap coefficient over token sets (0..1)."""
    if not a or not b:
        return 1.0 if a == b else 0.0
    inter = len(a & b)
    return (inter / len(a | b) + inter / min(len(a), len(b))) / 2


def _phrase_re(terms: tuple[str, ...]) -> re.Pattern | None:
    if not terms:
        return None
    parts = [r"[\s\-]+".join(re.escape(_fold(w)) for w in t.split()) for t in terms]
    parts.sort(key=len, reverse=True)
    return re.compile(r"(?<!\w)(?:" + "|".join(parts) + r")(?:s|es)?(?!\w)")


def _matches(pattern: re.Pattern | None, text: str | None) -> bool:
    return bool(pattern and text and pattern.search(_fold(text)))


# ------------------------------------------------------------------------------- the rule

def gather(pool: PoolView, now: datetime, inputs: tuple[str, ...]) -> list[tuple[dict[str, Any], float]]:
    """(item, feed priority) for every item of every fresh input signal, in id order."""
    seen: set[str] = set()
    out = []
    for glob in inputs:
        for sig in pool.query(glob, include_stale=True):
            if sig.id in seen or sig.is_stale(now) or not isinstance(sig.value, list):
                continue
            seen.add(sig.id)
            feed_pri = num((sig.meta or {}).get("priority")) or 0
            label = (sig.meta or {}).get("label")
            for it in sig.value:
                if isinstance(it, dict):
                    if label and not it.get("source"):
                        it = {**it, "source": label}
                    out.append((it, feed_pri))
    return out


def rank(pool: PoolView, now: datetime, cfg: dict[str, Any] | None) -> list[dict[str, Any]]:
    """The ranked, deduped, flagged list (news.top). Pure."""
    st = settings(cfg)
    tz = now.tzinfo
    local_re, crit_re = _phrase_re(st.local_terms), _phrase_re(st.critical_terms)
    oldest = now - timedelta(seconds=st.max_age_s)
    crit_oldest = now - timedelta(seconds=st.critical_max_age_s)

    cands = []
    for it, feed_pri in gather(pool, now, st.inputs):
        title = it.get("title") if isinstance(it.get("title"), str) else it.get("headline")
        if not isinstance(title, str) or not title.strip():
            continue
        title = " ".join(title.split())
        pub = parse_dt(it.get("published"), tz)
        if pub is not None and pub < oldest:
            continue
        item_pri = num(it.get("priority"))
        pri = item_pri if item_pri is not None else feed_pri
        summary = it.get("summary") if isinstance(it.get("summary"), str) else None
        local = 2 if _matches(local_re, title) else 1 if _matches(local_re, summary) else 0
        fresh_enough = pub is None or pub >= crit_oldest
        critical = (pri >= st.critical_priority and fresh_enough) or \
                   (pub is not None and fresh_enough and _matches(crit_re, title))
        source = it.get("source") if isinstance(it.get("source"), str) and it.get("source").strip() else None
        link = it.get("link") if isinstance(it.get("link"), str) else None
        recency = min(pub, now).timestamp() if pub is not None else float("-inf")
        out = {"title": title, "source": source, "link": link,
               "published": iso_local(pub, tz) if pub is not None else None}
        if summary:
            out["summary"] = summary
        out.update({"critical": bool(critical), "priority": pri, "local": local})
        cands.append(((-pri, -local, -recency, title.casefold(), source or "", link or ""), out))
    cands.sort(key=lambda c: c[0])

    kept: list[tuple[frozenset[str], dict[str, Any]]] = []
    for _, item in cands:
        toks = tokens(item["title"])
        dup = next((k for k in kept if similarity(toks, k[0]) >= st.dedupe_threshold), None)
        if dup is None:
            kept.append((toks, item))
            continue
        best = dup[1]
        best["critical"] = best["critical"] or item["critical"]
        if item["source"] and item["source"] != best["source"] and item["source"] not in best.get("also", []):
            best.setdefault("also", []).append(item["source"])
    ranked = [k[1] for k in kept]

    top = ranked[: st.keep]
    late_critical = [i for i in ranked[st.keep:] if i["critical"]]
    if late_critical:
        idx = {id(i): n for n, i in enumerate(ranked)}
        normal = [i for i in top if not i["critical"]]
        for c in late_critical:
            if not normal:
                break
            top.remove(normal.pop())          # lowest-ranked non-critical goes
            top.append(c)
        top.sort(key=lambda i: idx[id(i)])
    return [{**i, "rank": n + 1} for n, i in enumerate(top)]


@rule(NAME, inputs=list(DEFAULT_INPUTS), every=60)
def news(pool: PoolView, now: datetime, cfg: dict[str, Any]):
    if cfg.get("enabled", True) is False:
        return []
    top = rank(pool, now, cfg)
    return [
        {"key": "news.top", "value": top, "type": "series"},
        {"key": "news.critical", "value": any(i["critical"] for i in top), "type": "status"},
    ]


# ------------------------------------------------------------------------------- projection helper

def pick(items: list[Any], now: datetime, cfg: dict[str, Any] | None) -> tuple[dict[str, Any], int] | None:
    """The one headline the wall shows: (item, index). Highest-ranked critical item pinned; otherwise
    rotate through the first rotate_top items, rotate_s seconds each, as a pure function of `now`."""
    valid = [i for i in items if isinstance(i, dict)
             and isinstance(i.get("title") or i.get("headline"), str)
             and (i.get("title") or i.get("headline")).strip()]
    if not valid:
        return None
    try:
        st = settings(cfg)
        rotate_top, rotate_s = st.rotate_top, st.rotate_s
    except NewsConfigError:
        rotate_top, rotate_s = 3, 60.0
    for n, it in enumerate(valid):
        if it.get("critical") is True:
            return it, n
    pool = valid[: rotate_top]
    n = int(now.timestamp() // rotate_s) % len(pool)
    return pool[n], n
