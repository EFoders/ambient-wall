"""demo: no network, no credentials. Reproduces the frontend mocks (frontend/js/core.js) through the
real pipeline, so every theme state and every ask panel can be tested end to end.

    [[source]]                  # one instance per wall element, so the default [wall] bindings match
    name = "weather"
    type = "demo"
    weather = "cycle"           # overcast|clear|partly|fog|drizzle|rain|storm|snow|cold|cycle
    cycle_every = "60s"

`parts` picks what to emit (calendar, heartbeat, finances, weather, news, pulse, music). Default: the
part named like the source ("calendar", "heartbeat", "finances", "weather", "news", "pulse", "music"),
else all.
Each part emits exactly the keys and value shapes of the real adapter for that data:

    calendar   next, today (ask)                                  = ical
    heartbeat  host.<name>                                        = ping
    finances   month, detail.expenses / detail.income (ask)       = google_sheet_finances, detail = true
    weather    now.*, precip.*, forecast.daily (ask, 7 days)      = open_meteo
               warnings (ask, list of description strings)        = envcanada
    news       items (ask): 9 headlines from two feeds            = rss
    pulse      repo.<owner>/<name>, pulse (ask), 3 repos          = github
    music      now: a 6-track playlist that loops (~29 min), anchored like spotify (progress_ms at
               anchor_at = the track start; re-anchored at the pause and the resume), so the value only
               changes at those points; track 3 pauses for 90 s part-way (paused_since set)
               = spotify (art_url null)

Options: weather, cycle_every, finance (calm|drift|warning), homelab_down, calendar (false = no
events at all: next null, no today), calendar_lead_min, warnings (true = one active weather warning),
news (normal|critical|none: critical adds a tornado-warning headline, none = an empty feed),
music (playlist|none: none = nothing playing, now null).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from ..signal import utcnow
from ._shared import OptionError, iso, iso_ms, local_tz, opt, opt_choice, opt_duration
from .base import Adapter, register

PARTS = ("calendar", "heartbeat", "finances", "weather", "news", "pulse", "music")

# Same presets, same order as core.js WEATHER (the W key). feels_like / summary / precip are extra
# fields the real adapters also emit; `precip` = (next_minutes, kind) for the "Rain in 20 min" sliver.
WEATHER = [
    {"name": "overcast", "condition": "cloudy", "intensity": 0.8, "wind_kph": 12, "temp_c": 6,
     "feels_like_c": 3, "summary": "Overcast", "precip": (20, "rain")},
    {"name": "clear", "condition": "clear", "intensity": 0.0, "wind_kph": 5, "temp_c": 8,
     "feels_like_c": 7, "summary": "Clear", "precip": (None, None)},
    {"name": "partly", "condition": "cloudy", "intensity": 0.35, "wind_kph": 10, "temp_c": 7,
     "feels_like_c": 5, "summary": "Partly cloudy", "precip": (None, None)},
    {"name": "fog", "condition": "fog", "intensity": 0.7, "wind_kph": 2, "temp_c": 4,
     "feels_like_c": 4, "summary": "Fog", "precip": (None, None)},
    {"name": "drizzle", "condition": "rain", "intensity": 0.2, "wind_kph": 8, "temp_c": 7,
     "feels_like_c": 5, "summary": "Drizzle", "precip": (None, "rain")},
    {"name": "rain", "condition": "rain", "intensity": 0.6, "wind_kph": 18, "temp_c": 6,
     "feels_like_c": 2, "summary": "Rain", "precip": (None, "rain")},
    {"name": "storm", "condition": "storm", "intensity": 0.95, "wind_kph": 45, "temp_c": 14,
     "feels_like_c": 14, "summary": "Thunderstorm", "precip": (None, "storm")},
    {"name": "snow", "condition": "snow", "intensity": 0.6, "wind_kph": 10, "temp_c": -6,
     "feels_like_c": -11, "summary": "Snow", "precip": (None, "snow")},
    {"name": "cold", "condition": "clear", "intensity": 0.0, "wind_kph": 20, "temp_c": -24,
     "feels_like_c": -35, "summary": "Clear and bitterly cold", "precip": (None, None)},
]
PRESETS = {w["name"]: w for w in WEATHER}

# income / spent per finance mood, as core.js; balance = 18240 + net
FINANCE = {"calm": (6420, 3985), "drift": (6420, 5870), "warning": (6420, 7310)}

# Category "Monthly totals" per mood (google_sheet_finances detail shape); each list sums to `spent`.
_EXPENSES_CALM = [("Housing", 1650), ("Groceries", 620), ("Transportation", 410), ("Utilities", 285),
                  ("Dining out", 240), ("Health", 180), ("Subscriptions", 95), ("Other", 505)]
EXPENSES = {"calm": _EXPENSES_CALM,
            "drift": _EXPENSES_CALM + [("Car repair", 1885)],
            "warning": _EXPENSES_CALM + [("Car repair", 1885), ("Travel", 1440)]}
INCOME = [("Salary", 5800), ("Side projects", 420), ("Interest", 200)]

# Today's fixed events (local clock time, minutes long, location); the "Ops sync" `next` event joins
# them when it falls on the same local day.
TODAY = [("Standup", "08:30", 15, "Teams"), ("Lunch with Sam", "12:00", 60, "Mill Street Cafe"),
         ("Design review", "14:00", 60, None)]

# Envcanada-style warning descriptions, picked by the weather preset / condition.
WARNINGS = {"storm": "SEVERE THUNDERSTORM WARNING IN EFFECT", "snow": "SNOWFALL WARNING IN EFFECT",
            "cold": "EXTREME COLD WARNING IN EFFECT", "default": "RAINFALL WARNING IN EFFECT"}

# Headlines: (minutes old, feed, title, summary). Two feeds; one cross-feed near-duplicate (the news
# rule folds it); local Ottawa Valley items. Ages count from an anchor that moves every 3 h, so the
# list stays inside the rule's 12 h max_age without changing on every 5 s fetch.
NEWS_FEEDS = ("CBC Ottawa", "CBC News")
NEWS = [
    (14, 0, "Ottawa council approves new transit line to Kanata after marathon debate",
     "Councillors voted 18-7 to move the Kanata LRT extension into detailed design."),
    (38, 1, "Bank of Canada holds key interest rate at 2.75%",
     "The central bank says inflation is close to target but trade uncertainty persists."),
    (55, 1, "Council approves new Kanata transit line in Ottawa after marathon debate",
     "The extension would add six stations west of Moodie."),
    (95, 0, "Ottawa hospital opens new wing with 14 treatment spaces",
     "The hospital expansion opens to patients on Monday."),
    (130, 1, "Canada's jobless rate dips to 6.6% as hiring picks up in services",
     "Statistics Canada says employers added 48,000 jobs last month."),
    (185, 0, "OC Transpo adds late-night buses for Thanksgiving weekend",
     "Extra trips run on routes 6, 7 and 11 until Monday."),
    (260, 1, "Federal budget to be tabled Nov. 4, finance minister says",
     "The fall budget will include new housing measures."),
    (340, 0, "Ottawa Senators beat Philadelphia 2-1 in home opener",
     "A late goal sealed the win in front of a sellout crowd."),
    (430, 1, "Wildfire season ends with fewer hectares burned than last year",
     "Fire agencies credit a wet August across much of the country."),
]
NEWS_CRITICAL = (4, 0, "Tornado warning issued for Ottawa, take shelter",
                 "Environment Canada says a severe thunderstorm capable of producing a tornado is "
                 "moving east toward the city.")

# Project pulse: (repo, days since the last push, commit message, private, open issues).
REPOS = [("demo/ambient-wall", 0.2, "Add news headline feed", False, 4),
         ("demo/homelab", 6.4, "Bump backup retention to 30 days", True, 1),
         ("demo/dotfiles", 74.0, "Tidy zsh prompt", False, 0)]


# Now playing: (title, artist, album, seconds). Invented but plausible; loops forever. The demo starts
# 81 s into track 1; track 3 (index 2) pauses for MUSIC_PAUSE_S after MUSIC_PAUSE_AT s, then resumes.
PLAYLIST = [
    ("Low Tide Static", "Harbour Lights", "Signals at Dusk", 252),
    ("Northern Relay", "The Quiet Array", "Grid Lines", 303),
    ("Glasshouse", "Mara Vey", "Glasshouse", 228),
    ("Paper Satellites", "Kites Over Kanata", "Long Range", 271),
    ("Slow Weather", "Ottawa Valley Sound", "Riverlight", 237),
    ("Ember Hours", "Lantern Field", "Campfire Tapes", 362),
]
MUSIC_START_S = 81
MUSIC_PAUSE_TRACK, MUSIC_PAUSE_AT, MUSIC_PAUSE_S = 2, 100, 90
MUSIC_CYCLE_S = sum(t[3] for t in PLAYLIST) + MUSIC_PAUSE_S


def music_at(elapsed_ms: int) -> tuple[int, int, bool, int, int]:
    """Milliseconds since the demo started -> (track index, position ms, playing, anchor progress ms,
    ms since that anchor). Anchors: each track's start (progress 0); on the pause track also the pause
    start and the resume (progress MUSIC_PAUSE_AT). Integer maths, so anchor times are exact."""
    pos = (elapsed_ms + MUSIC_START_S * 1000) % (MUSIC_CYCLE_S * 1000)
    pause_at, pause = MUSIC_PAUSE_AT * 1000, MUSIC_PAUSE_S * 1000
    for i, (_, _, _, dur) in enumerate(PLAYLIST):
        length = (dur + (MUSIC_PAUSE_S if i == MUSIC_PAUSE_TRACK else 0)) * 1000
        if pos < length:
            if i == MUSIC_PAUSE_TRACK and pos >= pause_at:
                if pos < pause_at + pause:
                    return i, pause_at, False, pause_at, pos - pause_at          # paused
                return i, pos - pause, True, pause_at, pos - pause_at - pause    # resumed
            return i, pos, True, 0, pos                                          # from track start
        pos -= length
    return 0, 0, True, 0, 0                                     # unreachable (pos < cycle)


@register("demo")
class Demo(Adapter):
    default_every = 5.0

    def __init__(self, name: str, options: dict[str, Any], ctx):
        super().__init__(name, options, ctx)
        parts = opt(options, "parts", list, None, source=name)
        if parts is None:
            parts = [name] if name in PARTS else list(PARTS)
        bad = [p for p in parts if p not in PARTS]
        if bad:
            raise OptionError(f"source {name!r}: unknown parts {bad}; use {', '.join(PARTS)}")
        self.parts = parts
        self.weather = opt_choice(options, "weather", [*PRESETS, "cycle"], "overcast", source=name)
        self.cycle_every = opt_duration(options, "cycle_every", 60.0, source=name)
        self.finance = opt_choice(options, "finance", FINANCE, "calm", source=name)
        self.homelab_down = opt(options, "homelab_down", bool, False, source=name)
        self.calendar_on = opt(options, "calendar", bool, True, source=name)
        self.calendar_lead_min = float(opt(options, "calendar_lead_min", float, 47, source=name))
        self.warnings = opt(options, "warnings", bool, False, source=name)
        self.news = opt_choice(options, "news", ["normal", "critical", "none"], "normal", source=name)
        self.music = opt_choice(options, "music", ["playlist", "none"], "playlist", source=name)
        self.tz = local_tz(ctx.settings)
        self._t0: datetime | None = None
        self._anchor: datetime | None = None
        self._news_anchor: datetime | None = None

    def now(self) -> datetime:
        return utcnow()

    def preset(self, now: datetime) -> dict[str, Any]:
        if self.weather != "cycle":
            return PRESETS[self.weather]
        step = int((now - self._t0).total_seconds() // self.cycle_every)
        return WEATHER[step % len(WEATHER)]

    async def fetch(self):
        now = self.now().astimezone(self.tz)
        if self._t0 is None:
            self._t0 = now
        out: list[dict[str, Any]] = []

        if "calendar" in self.parts:
            # fixed anchor so the countdown counts down; rolls 95 min ahead once it passes (as core.js)
            if self._anchor is None:
                self._anchor = now + timedelta(minutes=self.calendar_lead_min)
            if self._anchor < now:
                self._anchor = now + timedelta(minutes=95)
            nxt = None
            if self.calendar_on:
                nxt = {"title": "Ops sync", "start": iso(self._anchor),
                       "end": iso(self._anchor + timedelta(minutes=30)), "location": "Teams",
                       "all_day": False}
            out.append({"key": "next", "value": nxt, "type": "object"})
            if self.calendar_on:
                out.append({"key": "today", "value": self.today(now, nxt), "type": "series",
                            "visibility": "ask"})

        if "heartbeat" in self.parts:
            down_since = self._t0 - timedelta(minutes=4)   # "down for 4 min" -> past the 2 min threshold
            out.append({"key": "host.homelab", "type": "status",
                        "value": {"up": False, "rtt_ms": None, "last_seen": iso(down_since)}
                        if self.homelab_down else {"up": True, "rtt_ms": 0.6, "last_seen": iso(now)}})
            out.append({"key": "host.main-pc", "type": "status",
                        "value": {"up": True, "rtt_ms": 1.2, "last_seen": iso(now)}})

        if "finances" in self.parts:
            income, spent = FINANCE[self.finance]
            out.append({"key": "month", "type": "object", "value": {
                "income": income, "spent": spent, "net": income - spent,
                "balance": 18240 + income - spent, "month": now.strftime("%Y-%m"),
                "last_updated": iso(self._t0 - timedelta(hours=26))}})
            out.append({"key": "detail.expenses", "type": "series", "visibility": "ask",
                        "value": [{"group": g, "amount": a} for g, a in EXPENSES[self.finance]]})
            out.append({"key": "detail.income", "type": "series", "visibility": "ask",
                        "value": [{"group": g, "amount": a} for g, a in INCOME]})

        if "weather" in self.parts:
            w = self.preset(now)
            nm, kind = w["precip"]
            out += [
                {"key": "now.temp_c", "value": w["temp_c"], "type": "number"},
                {"key": "now.feels_like_c", "value": w["feels_like_c"], "type": "number"},
                {"key": "now.condition", "value": w["condition"], "type": "string"},
                {"key": "now.intensity", "value": w["intensity"], "type": "number"},
                {"key": "now.wind_kph", "value": w["wind_kph"], "type": "number"},
                {"key": "now.summary", "value": w["summary"], "type": "string"},
                {"key": "precip.next_minutes", "value": nm, "type": "number"},
                {"key": "precip.kind", "value": kind, "type": "string"},
                {"key": "forecast.daily", "type": "series", "visibility": "ask",
                 "value": [{"date": (now + timedelta(days=i)).date().isoformat(),
                            "condition": c, "summary": s, "t_max": hi, "t_min": lo, "precip_mm": mm,
                            "pop": pop, "wind_max_kph": wk}
                           for i, (c, hi, lo, pop, mm, wk, s) in enumerate([
                               (w["condition"], w["temp_c"] + 3, w["temp_c"] - 4, 60, 4.2,
                                w["wind_kph"] + 8, w["summary"]),
                               ("cloudy", 9, 1, 30, 0.4, 18, "Cloudy periods"),
                               ("clear", 11, 0, 10, 0.0, 12, "Sunny"),
                               ("rain", 8, 3, 70, 9.5, 30, "Showers"),
                               ("cloudy", 6, -1, 20, 0.2, 15, "A mix of sun and cloud"),
                               ("snow", 1, -5, 60, 3.1, 25, "Flurries"),
                               ("clear", -2, -9, 0, 0.0, 10, "Clear"),
                           ])]},
                {"key": "warnings", "type": "series", "visibility": "ask",
                 "value": [WARNINGS.get(w["name"]) or WARNINGS.get(w["condition"]) or WARNINGS["default"]]
                 if self.warnings else []},
            ]

        if "news" in self.parts:
            out.append({"key": "items", "type": "series", "visibility": "ask",
                        "meta": {"priority": 0, "label": None, "feed_title": None},
                        "value": self.headlines(now)})

        if "pulse" in self.parts:
            pulse = self.repos(now)
            out += [{"key": f"repo.{r['repo'].lower()}", "value": r, "type": "object", "visibility": "ask"}
                    for r in pulse]
            out.append({"key": "pulse", "value": pulse, "type": "series", "visibility": "ask"})

        if "music" in self.parts:
            out.append({"key": "now", "type": "object", "meta": {"provider": "demo"},
                        "value": self.now_playing(now)})
        return out

    def now_playing(self, now: datetime) -> dict[str, Any] | None:
        """spotify `now` shape, a pure function of the time since the demo started."""
        if self.music == "none":
            return None
        elapsed_ms = (now - self._t0) // timedelta(milliseconds=1)
        idx, _, playing, anchor_ms, since_anchor_ms = music_at(elapsed_ms)
        anchor_at = self._t0 + timedelta(milliseconds=elapsed_ms - since_anchor_ms)
        title, artist, album, dur = PLAYLIST[idx]
        value = {"title": title, "artist": artist, "album": album, "is_playing": playing,
                 "progress_ms": anchor_ms, "anchor_at": iso_ms(anchor_at), "duration_ms": dur * 1000,
                 "track_id": f"demo:{idx + 1}", "art_url": None, "kind": "track"}
        if not playing:
            value["paused_since"] = iso(anchor_at)
        return value

    # ------------------------------------------------------------------ ask-panel parts
    def today(self, now: datetime, nxt: dict[str, Any] | None) -> list[dict[str, Any]]:
        """Today's events in the ical `today` shape: [{title, start, end, all_day, location?}], sorted."""
        day = now.date()
        evs = []
        for title, hhmm, minutes, loc in TODAY:
            h, m = (int(x) for x in hhmm.split(":"))
            start = datetime(day.year, day.month, day.day, h, m, tzinfo=self.tz)
            ev = {"title": title, "start": start, "end": start + timedelta(minutes=minutes), "all_day": False}
            if loc:
                ev["location"] = loc
            evs.append(ev)
        if nxt is not None and self._anchor is not None and self._anchor.date() == day:
            evs.append({"title": nxt["title"], "start": self._anchor,
                        "end": self._anchor + timedelta(minutes=30), "all_day": False,
                        "location": nxt["location"]})
        evs.sort(key=lambda e: (e["start"], not e["all_day"], e["title"]))
        return [{**e, "start": iso(e["start"]), "end": iso(e["end"])} for e in evs]

    def headlines(self, now: datetime) -> list[dict[str, Any]]:
        """rss `items` shape, newest first: [{title, link, published, source, summary}]."""
        if self.news == "none":
            return []
        if self._news_anchor is None or now - self._news_anchor >= timedelta(hours=3):
            self._news_anchor = now
        rows = ([NEWS_CRITICAL] if self.news == "critical" else []) + NEWS
        return [{"title": title, "link": f"https://news.example/demo/{i + 1}",
                 "published": iso(self._news_anchor - timedelta(minutes=age)),
                 "source": NEWS_FEEDS[feed], "summary": summary}
                for i, (age, feed, title, summary) in enumerate(rows)]

    def repos(self, now: datetime) -> list[dict[str, Any]]:
        """github `repo.*` values, most recently active first (the github `pulse` order)."""
        out = []
        for i, (repo, days, message, private, issues) in enumerate(REPOS):
            pushed = self._t0 - timedelta(days=days)
            committed = pushed - timedelta(minutes=3)
            since = round((now - pushed).total_seconds() / 86400, 1)
            dormant = since > 30
            out.append({"repo": repo, "url": f"https://github.com/{repo}", "pushed_at": iso(pushed),
                        "last_commit": {"sha": f"{0x4f2a9c1 + 7919 * i:07x}", "message": message,
                                        "date": iso(committed), "author": "Demo"},
                        "days_since": since, "alive": not dormant, "dormant": dormant,
                        "private": private, "open_issues": issues})
        out.sort(key=lambda p: p["days_since"])
        return out
