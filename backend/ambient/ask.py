"""Ask panels: the detail the wall shows briefly when asked (SPEC 5.2), e.g. the 7-day forecast.

    build_panel("forecast", pool, now, cfg) -> {"panel", "title", "ts", "days": [...]} | None
    panel_availability(pool, now, cfg)      -> [{"panel": "forecast", "available": True}, ...]

| panel    | body                                                                    | default inputs |
|----------|-------------------------------------------------------------------------|----------------|
| forecast | days: [{date, label, hiC, loC, condition, pop?, precipMm?}] (<= 7)      | daily = weather.forecast.daily |
| calendar | events: [{title, start, end, allDay, location?}] (today, local)         | today = calendar.today |
| pulse    | repos: [{name, lastCommit, message?, pushedAt, status}]                 | pulse = github.pulse, repos = github.repo.* |
| finance  | income, spent, net, balance, mood, month, lastUpdated, categories       | month = finances.month, detail = finances.detail.*, mood = rules.finances.mood |
| news     | items: [{headline, source, published, critical}] (top 5)                | top = rules.news.top |
| warnings | items: [{headline, severity?, issued?, expires?}]                       | warnings = weather.warnings |

Rules:
- Panels MAY read visibility="ask" signals (that is their purpose); the wall projection never does.
- A panel is None when its main input is missing or stale at `now`, or holds nothing usable.
  An empty list is "nothing usable" for forecast / pulse / news, but a real answer for calendar
  ("nothing on today") and warnings ("no active warnings"): those return the panel with an empty list.
- `ts` is the observation time of the newest input signal used. All dates are ISO 8601 with the local
  offset of [location] timezone (same helper as the wall projection).
- forecast: one entry per local date from today on. Accepts per-date items ({date, condition, t_max,
  t_min, pop, precip_mm, ...}, Open-Meteo / demo) and Environment Canada day/night periods ({period:
  "Tonight"|"Saturday"|"Saturday night", temp, temp_class, condition, pop}), which are merged per date.
  label = short English weekday ("Mon"); condition is always one of clear, cloudy, fog, rain, storm, snow.
- calendar: events overlapping the local day of `now` (midnight to next midnight in [location]
  timezone, so 23 h / 25 h DST days are right), sorted by start, all-day first.
- finance: categories from every `detail` signal (`detail.expenses` -> kind "expense", `detail.income`
  -> "income"), sorted by amount, largest first. mood from the mood rule, else from the sign of net.

Each panel's inputs and options are configurable like [wall] bindings (an empty string turns an input off):

    [ask.forecast]
    daily = "weather.forecast.daily"
    days = 7
    [ask.news]
    top = "rules.news.top"
    max_items = 5
    [ask.pulse]
    enabled = false          # any panel: hide it (GET /api/ask reports it unavailable)

Plugins may add panels with @panel(name, title=..., inputs={...}). Pure: no clock, no I/O.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, tzinfo
from typing import Any, Callable

from .pool_view import PoolView
from .rules._common import iso_local, normalize_condition, num, parse_dt, resolve_tz, round_half_away
from .signal import Signal

log = logging.getLogger("ambient.ask")

MOODS = ("calm", "drift", "warning")
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


class UnknownPanel(KeyError):
    """No panel registered under that name."""


# ---------------------------------------------------------------------------------------- registry

BuildFn = Callable[["Reader", dict[str, Any], datetime, tzinfo], "dict[str, Any] | None"]


@dataclass
class Panel:
    name: str
    title: str
    build: BuildFn
    inputs: dict[str, str] = field(default_factory=dict)      # input name -> default signal id / glob
    options: dict[str, Any] = field(default_factory=dict)     # option name -> default value


PANELS: dict[str, Panel] = {}


def panel(name: str, *, title: str, inputs: dict[str, str], **options: Any) -> Callable[[BuildFn], BuildFn]:
    """Register a panel builder: fn(reader, pcfg, now, tz) -> body dict | None. `pcfg` holds the
    resolved input ids (by input name) and options (defaults overridden by [ask.<name>])."""
    def deco(fn: BuildFn) -> BuildFn:
        PANELS[name] = Panel(name=name, title=title, build=fn, inputs=dict(inputs), options=dict(options))
        return fn
    return deco


def _raw_cfg(cfg: Any) -> dict[str, Any]:
    raw = getattr(cfg, "raw", cfg)          # accept ambient.config.Config or a plain dict
    return raw if isinstance(raw, dict) else {}


def panel_config(name: str, cfg: Any = None) -> dict[str, Any]:
    """Defaults for panel `name` merged with [ask.<name>]. Input ids are str ("" = off -> None)."""
    p = PANELS.get(name)
    if p is None:
        raise UnknownPanel(name)
    table = ((_raw_cfg(cfg).get("ask") or {}).get(name)) or {}
    if not isinstance(table, dict):
        table = {}
    out: dict[str, Any] = {"enabled": True, "title": p.title}
    for k, default in p.inputs.items():
        v = table.get(k, default)
        out[k] = v if isinstance(v, str) and v else (None if v in ("", None) else default)
    for k, default in p.options.items():
        v = table.get(k, default)
        if isinstance(default, bool):
            out[k] = v if isinstance(v, bool) else default
        elif isinstance(default, (int, float)):
            out[k] = v if isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0 else default
        else:
            out[k] = v
    if isinstance(table.get("enabled"), bool):
        out["enabled"] = table["enabled"]
    if isinstance(table.get("title"), str) and table["title"].strip():
        out["title"] = table["title"].strip()
    return out


def describe(cfg: Any = None) -> dict[str, dict[str, str | None]]:
    """Panel -> {input name: signal id/glob} after config (for introspection and docs)."""
    out = {}
    for name, p in PANELS.items():
        pc = panel_config(name, cfg)
        out[name] = {k: pc[k] for k in p.inputs}
    return out


# ---------------------------------------------------------------------------------------- reading

class Reader:
    """Reads inputs at `now`: stale signals are hidden, ask-only ones are allowed. Remembers the newest
    `ts` among the signals it handed out (the panel's `ts`)."""

    def __init__(self, pool: PoolView, now: datetime):
        self.pool, self.now = pool, now
        self.newest: datetime | None = None

    def _use(self, s: Signal) -> Signal:
        if self.newest is None or s.ts > self.newest:
            self.newest = s.ts
        return s

    def get(self, signal_id: str | None) -> Signal | None:
        if not signal_id:
            return None
        s = self.pool.get(signal_id, include_stale=True)
        if s is None or s.is_stale(self.now):
            return None
        return self._use(s)

    def query(self, glob: str | None) -> list[Signal]:
        if not glob:
            return []
        return [self._use(s) for s in self.pool.query(glob, include_stale=True) if not s.is_stale(self.now)]


# ---------------------------------------------------------------------------------------- api

def build_panel(name: str, pool: PoolView, now: datetime, cfg: Any = None) -> dict[str, Any] | None:
    """The panel's data at `now`, or None (inputs missing / stale / empty, or panel disabled).
    Raises UnknownPanel for a name not in PANELS. A builder that raises is logged and yields None."""
    p = PANELS.get(name)
    if p is None:
        raise UnknownPanel(name)
    pc = panel_config(name, cfg)
    if not pc["enabled"]:
        return None
    tz = resolve_tz((_raw_cfg(cfg).get("location") or {}).get("timezone"), now)
    r = Reader(pool, now)
    try:
        body = p.build(r, pc, now, tz)
    except Exception:  # noqa: BLE001 - odd provider data must never take the server down
        log.exception("ask panel %r failed", name)
        return None
    if body is None:
        return None
    return {"panel": name, "title": pc["title"], "ts": iso_local(r.newest or now, tz), **body}


def panel_availability(pool: PoolView, now: datetime, cfg: Any = None) -> list[dict[str, Any]]:
    """[{"panel": name, "available": bool}] in registry order."""
    return [{"panel": name, "available": build_panel(name, pool, now, cfg) is not None} for name in PANELS]


# ---------------------------------------------------------------------------------------- helpers

def _text(v: Any) -> str | None:
    if v is None or isinstance(v, (dict, list)):
        return None
    s = str(v).strip()
    return s or None


def _first(d: dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if d.get(k) is not None:
            return d[k]
    return None


def _local_date(v: Any, tz: tzinfo) -> date | None:
    if isinstance(v, datetime):
        return v.astimezone(tz).date() if v.tzinfo else v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        s = v.strip()
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
            try:
                return date.fromisoformat(s)
            except ValueError:
                return None
        dt = parse_dt(s, tz)
        return dt.astimezone(tz).date() if dt else None
    return None


def _day_bounds(d: date, tz: tzinfo) -> tuple[datetime, datetime]:
    """Local midnight to the next local midnight (23 h or 25 h on DST days)."""
    return (datetime.combine(d, time(0), tzinfo=tz),
            datetime.combine(d + timedelta(days=1), time(0), tzinfo=tz))


# Keyword fallback for provider words that are not a known condition name ("Chance of showers").
_COND_WORDS = (
    ("storm", ("thunder", "storm", "orage")),
    ("snow", ("snow", "flurr", "sleet", "ice pellet", "freezing", "blizzard", "hail", "neige")),
    ("rain", ("rain", "shower", "drizzle", "pluie", "averse", "bruine")),
    ("fog", ("fog", "mist", "haze", "smoke", "brouillard", "brume")),
    ("cloudy", ("cloud", "overcast", "nuage", "couvert")),
    ("clear", ("sun", "clear", "fair", "soleil", "dégagé")),
)


def condition_of(*candidates: Any) -> str | None:
    """One of the six scene conditions from a condition code or provider words, else None."""
    for c in candidates:
        n = normalize_condition(c)
        if n:
            return n
    for c in candidates:
        if isinstance(c, str):
            s = c.lower()
            for cond, words in _COND_WORDS:
                if any(w in s for w in words):
                    return cond
    return None


def _temp(v: Any) -> int | None:
    x = num(v)
    return None if x is None else round_half_away(float(x))


# ---------------------------------------------------------------------------------------- forecast

_DAY_NAMES = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6,
    "lundi": 0, "mardi": 1, "mercredi": 2, "jeudi": 3, "vendredi": 4, "samedi": 5, "dimanche": 6,
    "mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6,
}
_TODAY_WORDS = ("today", "tonight", "this ", "aujourd", "ce soir", "cet ", "cette ")
_NIGHT_WORDS = ("night", "tonight", "evening", "overnight", "soir", "nuit")


def _period_date(name: str, base: date, cursor: date) -> date | None:
    """Environment Canada period name -> local date. Weekday names map to the first such date on or
    after `cursor` (periods arrive in order, so "Saturday night" lands on the same date as "Saturday")."""
    n = name.strip().lower()
    if not n:
        return None
    if n.startswith(_TODAY_WORDS):
        return base
    wd = _DAY_NAMES.get(re.split(r"[\s,]+", n)[0])
    if wd is None:
        return None
    return cursor + timedelta(days=(wd - cursor.weekday()) % 7)


@panel("forecast", title="Forecast", inputs={"daily": "weather.forecast.daily"}, days=7)
def _forecast(r: Reader, pc: dict[str, Any], now: datetime, tz: tzinfo) -> dict[str, Any] | None:
    sig = r.get(pc["daily"])
    if sig is None or not isinstance(sig.value, list):
        return None
    today = now.astimezone(tz).date()
    base = sig.ts.astimezone(tz).date()              # "Tonight" means the day the forecast was fetched
    cursor = base
    days: dict[date, dict[str, Any]] = {}
    for it in sig.value:
        if not isinstance(it, dict):
            continue
        d = _local_date(it.get("date"), tz)
        period = _text(it.get("period")) or ""
        if d is None and period:
            d = _period_date(period, base, cursor)
            if d is not None:
                cursor = d
        if d is None:
            continue
        cls = str(it.get("temp_class") or "").lower()
        night = cls == "low" or (cls != "high" and any(w in period.lower() for w in _NIGHT_WORDS))
        hi = _temp(_first(it, "hiC", "hi_c", "t_max", "temp_max", "high", "max"))
        lo = _temp(_first(it, "loC", "lo_c", "t_min", "temp_min", "low", "min"))
        t = _temp(it.get("temp"))
        if t is not None:
            if night:
                lo = t if lo is None else lo
            else:
                hi = t if hi is None else hi
        cond = condition_of(it.get("condition"), it.get("summary"), it.get("text"))
        pop = num(_first(it, "pop", "precip_probability"))
        mm = num(_first(it, "precipMm", "precip_mm", "precipitation_sum"))

        e = days.setdefault(d, {"hiC": None, "loC": None, "condition": None, "cond_from_night": False,
                                "pop": None, "precipMm": None})
        if hi is not None and e["hiC"] is None:
            e["hiC"] = hi
        if lo is not None and e["loC"] is None:
            e["loC"] = lo
        if cond and (e["condition"] is None or (e["cond_from_night"] and not night)):
            e["condition"], e["cond_from_night"] = cond, night
        if pop is not None:
            p = max(0, min(100, round_half_away(float(pop))))
            e["pop"] = p if e["pop"] is None else max(e["pop"], p)
        if mm is not None and mm >= 0 and e["precipMm"] is None:
            e["precipMm"] = round(float(mm), 1)

    out = []
    for d in sorted(days):
        if d < today:
            continue
        e = days[d]
        if e["hiC"] is None and e["loC"] is None and e["condition"] is None:
            continue
        day = {"date": d.isoformat(), "label": WEEKDAYS[d.weekday()], "hiC": e["hiC"], "loC": e["loC"],
               "condition": e["condition"] or "clear"}
        if e["pop"] is not None:
            day["pop"] = e["pop"]
        if e["precipMm"] is not None:
            day["precipMm"] = e["precipMm"]
        out.append(day)
        if len(out) >= int(pc["days"]):
            break
    return {"days": out} if out else None


# ---------------------------------------------------------------------------------------- calendar

@panel("calendar", title="Today", inputs={"today": "calendar.today"})
def _calendar(r: Reader, pc: dict[str, Any], now: datetime, tz: tzinfo) -> dict[str, Any] | None:
    sig = r.get(pc["today"])
    if sig is None or not isinstance(sig.value, list):
        return None
    day0, day1 = _day_bounds(now.astimezone(tz).date(), tz)
    events = []
    for ev in sig.value:
        if not isinstance(ev, dict):
            continue
        all_day = bool(_first(ev, "allDay", "all_day"))
        start = parse_dt(ev.get("start"), tz)
        if start is None:
            continue
        end = parse_dt(ev.get("end"), tz)
        if end is None or end < start:
            end = start + timedelta(days=1) if all_day else start
        overlaps = start < day1 and (end > day0 if end > start else start >= day0)
        if not overlaps:
            continue
        item = {"title": _text(_first(ev, "title", "summary")) or "Busy",
                "start": iso_local(start, tz), "end": iso_local(end, tz), "allDay": all_day}
        loc = _text(ev.get("location"))
        if loc:
            item["location"] = loc
        events.append((start, not all_day, item["title"], item))
    events.sort(key=lambda e: e[:3])
    return {"events": [e[3] for e in events]}


# ---------------------------------------------------------------------------------------- pulse

@panel("pulse", title="Project pulse", inputs={"pulse": "github.pulse", "repos": "github.repo.*"},
       dormant_days=30)
def _pulse(r: Reader, pc: dict[str, Any], now: datetime, tz: tzinfo) -> dict[str, Any] | None:
    sig = r.get(pc["pulse"])
    if sig is not None and isinstance(sig.value, list):
        raw = [v for v in sig.value if isinstance(v, dict)]
    else:
        raw = [s.value for s in r.query(pc["repos"]) if isinstance(s.value, dict)]
    repos, seen = [], set()
    for v in raw:
        name = _text(_first(v, "repo", "name", "full_name"))
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        last = v.get("last_commit") if isinstance(v.get("last_commit"), dict) else {}
        committed = parse_dt(_first(last, "date") or v.get("lastCommit"), tz)
        pushed = parse_dt(_first(v, "pushed_at", "pushedAt"), tz)
        if isinstance(v.get("dormant"), bool):
            dormant = v["dormant"]
        elif isinstance(v.get("alive"), bool):
            dormant = not v["alive"]
        elif isinstance(v.get("status"), str) and v["status"] in ("alive", "dormant"):
            dormant = v["status"] == "dormant"
        else:
            latest = max([d for d in (pushed, committed) if d], default=None)
            dormant = latest is None or (now - latest) > timedelta(days=float(pc["dormant_days"]))
        item = {"name": name, "lastCommit": iso_local(committed, tz)}
        msg = _text(_first(last, "message") or v.get("message"))
        if msg:
            item["message"] = msg.splitlines()[0][:120]
        item["pushedAt"] = iso_local(pushed, tz)
        item["status"] = "dormant" if dormant else "alive"
        latest = max([d for d in (pushed, committed) if d], default=None)
        repos.append((latest is None, -(latest.timestamp() if latest else 0), name.lower(), item))
    repos.sort(key=lambda x: x[:3])                 # most recently active first, never-active last
    return {"repos": [x[3] for x in repos]} if repos else None


# ---------------------------------------------------------------------------------------- finance

_KIND = {"expenses": "expense", "expense": "expense", "income": "income", "incomes": "income"}


@panel("finance", title="Finances",
       inputs={"month": "finances.month", "detail": "finances.detail.*", "mood": "rules.finances.mood"})
def _finance(r: Reader, pc: dict[str, Any], now: datetime, tz: tzinfo) -> dict[str, Any] | None:
    sig = r.get(pc["month"])
    if sig is None or not isinstance(sig.value, dict):
        return None
    v = sig.value
    income, spent, net, balance = (num(v.get(k)) for k in ("income", "spent", "net", "balance"))
    if net is None and income is not None and spent is not None:
        net = num(round(income - spent, 2))
    if income is None and spent is None and net is None and balance is None:
        return None
    mood_sig = r.get(pc["mood"])
    mood = mood_sig.value if mood_sig is not None else None
    if mood not in MOODS:
        mood = "warning" if net is not None and net < 0 else "calm"
    month = _text(v.get("month"))
    if not month or not re.fullmatch(r"\d{4}-\d{2}", month):
        month = now.astimezone(tz).strftime("%Y-%m")

    cats = []
    for s in r.query(pc["detail"]):
        if not isinstance(s.value, list):
            continue
        suffix = s.id.rsplit(".", 1)[-1].lower()
        for c in s.value:
            if not isinstance(c, dict):
                continue
            name = _text(_first(c, "name", "group", "category", "label"))
            amount = num(c.get("amount"))
            if not name or amount is None:
                continue
            kind = c.get("kind") if c.get("kind") in ("expense", "income") else _KIND.get(suffix, suffix)
            cats.append({"name": name, "amount": amount, "kind": kind})
    cats.sort(key=lambda c: (-abs(c["amount"]), c["kind"], c["name"].lower()))
    return {"income": income, "spent": spent, "net": net, "balance": balance, "mood": mood, "month": month,
            "lastUpdated": iso_local(parse_dt(_first(v, "last_updated", "lastUpdated"), tz), tz),
            "categories": cats}


# ---------------------------------------------------------------------------------------- news

@panel("news", title="News", inputs={"top": "rules.news.top"}, max_items=5)
def _news(r: Reader, pc: dict[str, Any], now: datetime, tz: tzinfo) -> dict[str, Any] | None:
    sig = r.get(pc["top"])
    if sig is None or not isinstance(sig.value, list):
        return None
    items = []
    for it in sig.value:
        if not isinstance(it, dict):
            continue
        headline = _text(_first(it, "headline", "title"))
        if not headline:
            continue
        items.append({"headline": headline, "source": _text(_first(it, "source", "label", "feed")),
                      "published": iso_local(parse_dt(it.get("published"), tz), tz),
                      "critical": bool(it.get("critical"))})
        if len(items) >= int(pc["max_items"]):
            break
    return {"items": items} if items else None


# ---------------------------------------------------------------------------------------- warnings

_SEVERITY_WORDS = (("warning", ("warning", "avertissement")), ("watch", ("watch", "veille")),
                   ("advisory", ("advisory", "avis")), ("statement", ("statement", "bulletin")))


def _severity(text: str) -> str | None:
    s = text.lower()
    for sev, words in _SEVERITY_WORDS:
        if any(re.search(rf"\b{w}\b", s) for w in words):
            return sev
    return None


@panel("warnings", title="Weather warnings", inputs={"warnings": "weather.warnings"})
def _warnings(r: Reader, pc: dict[str, Any], now: datetime, tz: tzinfo) -> dict[str, Any] | None:
    sig = r.get(pc["warnings"])
    if sig is None:
        return None
    vals = sig.value if isinstance(sig.value, list) else [sig.value] if sig.value else []
    items, seen = [], set()
    for w in vals:
        if isinstance(w, str):
            w = {"headline": w}
        if not isinstance(w, dict):
            continue
        headline = _text(_first(w, "headline", "description", "title", "text"))
        if not headline or headline.lower() in seen:
            continue
        expires = parse_dt(_first(w, "expires", "expiry"), tz)
        if expires is not None and expires <= now:
            continue                                  # lapsed while the source was still fresh
        seen.add(headline.lower())
        item: dict[str, Any] = {"headline": headline}
        sev = _text(_first(w, "severity", "type", "priority"))
        sev = sev.lower() if sev else _severity(headline)
        if sev:
            item["severity"] = sev
        issued = parse_dt(_first(w, "issued", "issued_at"), tz)
        if issued is not None:
            item["issued"] = iso_local(issued, tz)
        if expires is not None:
            item["expires"] = iso_local(expires, tz)
        items.append(item)
    return {"items": items}
