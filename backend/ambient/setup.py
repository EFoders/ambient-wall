"""First-run setup wizard, backend half (the page is frontend/setup.html; docs/SETUP.md).

While <config_dir>/config.toml does not exist the wall runs config.example.toml (demo data), and:

  - the WebSocket hello carries "setup": {"needed": true}, so a wall page served by this box opens the
    wizard (frontend/js/core.js),
  - GET  /api/setup                 state for the wizard (never any secret)
  - POST /api/setup/geocode         {"q": "Ottawa"} -> places, via Open-Meteo geocoding (fixed host)
  - POST /api/setup/ec-site         {"lat", "lon"} -> nearest Environment Canada citypage sites
  - POST /api/setup/test-feed       {"url"} -> one fetch of an RSS / Atom feed: its title + first headline
  - POST /api/setup/preview         the wizard's answers -> {"ok", "errors", "config_toml", "secrets"}
  - POST /api/setup                 the same answers -> writes config.toml (+ secrets.toml) and applies them

Once config.toml exists every POST above answers 409 (the wizard never overwrites a configuration), and
AMBIENT_SETUP=0 turns the whole wizard off. The POSTs pass the shared guard (server.json_post) first.

This module is the logic: `parse_form` (bounded, field-level errors), `render_config` / `secrets_of`
(the files), `check` (the very same load_config the server runs, plus a dry construction of every adapter
so option errors surface here and not at startup), `write_files` (atomic), and the two lookups.

Answers (POST body), every part optional except location:

    {"location": {"name", "lat", "lon", "timezone", "region"?},
     "envcanada": {"site": "s0000430", "province": "ON", "name": "Ottawa (Kanata - Orléans)"} | null,
     "schedule": {"work_start": "07:00", "work_end": "17:00", "work_days": [1,2,3,4,5], "hour24": true},
     "look": {"theme": "cyberpunk", "cat": false, "cat_coat": "tabby", "sound": false, "boost": 0},
     "news": [{"url", "label"?, "local"?: bool}],
     "calendar": {"url"} | null,                                   -> secrets.toml CALENDAR_ICS_URL
     "hosts": [{"name", "address"}],
     "spotify": {"client_id", "client_secret", "refresh_token"} | null}   -> secrets.toml SPOTIFY_*

Errors are [{"field": "hosts.1.address", "message": "..."}]; field ids follow the answer paths
("review" when a problem can't be pinned to one field).
"""
from __future__ import annotations

import csv
import io
import ipaddress
import json
import logging
import math
import os
import re
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from .config import CAT_COATS, CONFIG_FILE, SECRETS_FILE, ConfigError, load_config

log = logging.getLogger("ambient.setup")

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
EC_SITES_URL = "https://dd.weather.gc.ca/today/citypage_weather/docs/site_list_en.csv"
EC_PROVINCES = ("AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT")
EC_SITES_TTL_S = 86400.0              # the site list changes a few times a year
EC_SITES_MAX_BYTES = 1_000_000        # ~33 KB today
UPSTREAM_TIMEOUT = 10.0

MAX_NAME = 80                         # place / feed label lengths
MAX_LABEL = 60
MAX_URL = 2000
MAX_FEEDS = 8
MAX_HOSTS = 16
MAX_SECRET = 2000
MAX_QUERY = 60                        # geocoder search text

_HHMM_RE = re.compile(r"^([01]?\d|2[0-3]):[0-5]\d$")
_CTRL_RE = re.compile(r"[\x00-\x1f\x7f]")
_HOST_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$")
_HOSTNAME_RE = re.compile(r"^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
                          r"(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.?$")
_SITE_RE = re.compile(r"^s\d{7}$")
_THEME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
_TOKEN_RE = re.compile(r"^[A-Za-z0-9_\-.~+/=]{8,%d}$" % MAX_SECRET)

# secrets.toml names the generated config.toml references
SECRET_NAMES = {"calendar": ("CALENDAR_ICS_URL",),
                "spotify": ("SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REFRESH_TOKEN")}


class SetupError(Exception):
    """A lookup failed (upstream down, bad answer). The message is safe to show."""


class WriteError(Exception):
    """config/ could not be written. `hint` says how to fix it (permissions, a read-only mount)."""

    def __init__(self, message: str, hint: str):
        super().__init__(message)
        self.hint = hint


# ---------------------------------------------------------------------- state
def enabled() -> bool:
    """AMBIENT_SETUP=0 (or false/no/off) turns the wizard off, e.g. for a public demo box."""
    return os.environ.get("AMBIENT_SETUP", "1").strip().lower() not in ("0", "false", "no", "off")


def needed(config_dir: Path) -> bool:
    """First run: the wizard is on and there is no config.toml yet (checked live, never cached)."""
    return enabled() and not (Path(config_dir) / CONFIG_FILE).exists()


def writable(config_dir: Path) -> bool:
    d = Path(config_dir)
    return d.is_dir() and os.access(d, os.W_OK)


def secret_names_present(config_dir: Path) -> list[str]:
    """Which of the wizard's secret NAMES an existing secrets.toml already sets (names only, never values)."""
    try:
        text = _read(Path(config_dir) / SECRETS_FILE) or ""
    except WriteError:
        return []
    return sorted(n for names in SECRET_NAMES.values() for n in names
                  if re.search(rf"(?m)^[ \t]*{n}[ \t]*=", text))


# ---------------------------------------------------------------------- answers -> form
class _Errors(list):
    def add(self, field: str, message: str) -> None:
        self.append({"field": field, "message": message})


def _text(v: Any, field: str, errs: _Errors, *, limit: int, required: bool = False) -> str | None:
    if v is None or (isinstance(v, str) and not v.strip()):
        if required:
            errs.add(field, "required")
        return None
    if not isinstance(v, str):
        errs.add(field, "must be text")
        return None
    v = v.strip()
    if len(v) > limit:
        errs.add(field, f"at most {limit} characters")
        return None
    if _CTRL_RE.search(v):
        errs.add(field, "contains control characters")
        return None
    return v


def _number(v: Any, field: str, errs: _Errors, lo: float, hi: float) -> float | None:
    if isinstance(v, str):
        try:
            v = float(v.strip().replace(",", "."))
        except ValueError:
            errs.add(field, "must be a number")
            return None
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        errs.add(field, "must be a number")
        return None
    if not lo <= v <= hi:
        errs.add(field, f"must be between {lo:g} and {hi:g}")
        return None
    return float(v)


def _bool(v: Any, field: str, errs: _Errors, default: bool) -> bool:
    if v is None:
        return default
    if not isinstance(v, bool):
        errs.add(field, "must be true or false")
        return default
    return v


def _url(v: Any, field: str, errs: _Errors, *, required: bool = True) -> str | None:
    """An http(s) URL (feed:// and webcal:// are rewritten to https://), no spaces, bounded."""
    u = _text(v, field, errs, limit=MAX_URL, required=required)
    if u is None:
        return None
    for alias in ("feed://", "webcal://"):
        if u.lower().startswith(alias):
            u = "https://" + u[len(alias):]
    try:
        parts = urlsplit(u)
        host = parts.hostname
    except ValueError:
        parts, host = None, None
    if parts is None or parts.scheme not in ("http", "https") or not host or re.search(r"\s", u):
        errs.add(field, "must be an http:// or https:// address")
        return None
    return u


def valid_address(a: str) -> bool:
    """An IP address or a hostname (what the ping source accepts, a bit stricter)."""
    try:
        ipaddress.ip_address(a)
        return True
    except ValueError:
        return bool(_HOSTNAME_RE.match(a))


def parse_form(body: Any, *, themes: set[str] | None = None) -> tuple[dict[str, Any], list[dict[str, str]]]:
    """The wizard's answers -> (clean form, field errors). Bounded: every string, list and number is checked
    here, before anything is rendered or fetched."""
    errs = _Errors()
    if not isinstance(body, dict):
        errs.add("review", "send the answers as one JSON object")
        return {}, errs

    def section(key: str) -> dict[str, Any] | None:
        v = body.get(key)
        if v is None:
            return None
        if not isinstance(v, dict):
            errs.add(key, "must be an object")
            return None
        return v

    form: dict[str, Any] = {}

    loc = section("location") or {}
    form["location"] = {
        "name": _text(loc.get("name"), "location.name", errs, limit=MAX_NAME, required=True),
        "lat": _number(loc.get("lat"), "location.lat", errs, -90, 90),
        "lon": _number(loc.get("lon"), "location.lon", errs, -180, 180),
        "timezone": _text(loc.get("timezone"), "location.timezone", errs, limit=64, required=True),
        "region": _text(loc.get("region"), "location.region", errs, limit=MAX_NAME),
    }
    tz = form["location"]["timezone"]
    if tz:
        try:
            ZoneInfo(tz)
        except (ZoneInfoNotFoundError, ValueError):
            errs.add("location.timezone", f"unknown timezone {tz!r} (an IANA name like America/Toronto)")

    ec = section("envcanada")
    form["envcanada"] = None
    if ec:
        site = _text(ec.get("site"), "envcanada", errs, limit=8, required=True)
        prov = ec.get("province")
        if site and not _SITE_RE.match(site):
            errs.add("envcanada", "site must be a citypage code like s0000430")
        elif prov not in EC_PROVINCES:
            errs.add("envcanada", f"province must be one of {', '.join(EC_PROVINCES)}")
        else:
            form["envcanada"] = {"site": site, "province": prov,
                                 "name": _text(ec.get("name"), "envcanada", errs, limit=MAX_NAME)}

    sch = section("schedule") or {}
    sched: dict[str, Any] = {}
    for k, default in (("work_start", "07:00"), ("work_end", "17:00")):
        v = sch.get(k, default)
        if not isinstance(v, str) or not _HHMM_RE.match(v.strip()):
            errs.add(f"schedule.{k}", "use HH:MM, 24 h (e.g. 07:30)")
            v = default
        h, m = v.strip().split(":")
        sched[k] = f"{int(h):02d}:{m}"
    days = sch.get("work_days", [1, 2, 3, 4, 5])
    if not isinstance(days, list) or len(days) > 7 or \
            not all(isinstance(d, int) and not isinstance(d, bool) and 0 <= d <= 6 for d in days):
        errs.add("schedule.work_days", "pick days 0-6 (0 = Sunday)")
        days = [1, 2, 3, 4, 5]
    sched["work_days"] = sorted(set(days))
    sched["hour24"] = _bool(sch.get("hour24"), "schedule.hour24", errs, True)
    form["schedule"] = sched

    look = section("look") or {}
    theme = look.get("theme", "cyberpunk")
    if not isinstance(theme, str) or not _THEME_RE.match(theme) or (themes and theme not in themes):
        errs.add("look.theme", "pick one of the themes")
        theme = "cyberpunk"
    coat = look.get("cat_coat", "tabby")
    if coat not in CAT_COATS:
        errs.add("look.cat_coat", f"one of {', '.join(CAT_COATS)}")
        coat = "tabby"
    boost = look.get("boost", 0)
    if isinstance(boost, bool) or not isinstance(boost, int) or not 0 <= boost <= 3:
        errs.add("look.boost", "0 (off) to 3 (high)")
        boost = 0
    form["look"] = {"theme": theme, "cat": _bool(look.get("cat"), "look.cat", errs, False), "cat_coat": coat,
                    "sound": _bool(look.get("sound"), "look.sound", errs, False), "boost": boost}

    feeds = body.get("news") or []
    form["news"] = []
    if not isinstance(feeds, list):
        errs.add("news", "must be a list of feeds")
    elif len(feeds) > MAX_FEEDS:
        errs.add("news", f"at most {MAX_FEEDS} feeds")
    else:
        seen: set[str] = set()
        for i, f in enumerate(feeds):
            if not isinstance(f, dict):
                errs.add(f"news.{i}.url", "must be an object")
                continue
            url = _url(f.get("url"), f"news.{i}.url", errs)
            label = _text(f.get("label"), f"news.{i}.label", errs, limit=MAX_LABEL)
            local = _bool(f.get("local"), f"news.{i}.local", errs, False)
            if url and url in seen:
                errs.add(f"news.{i}.url", "this feed is already in the list")
                continue
            if url:
                seen.add(url)
                form["news"].append({"url": url, "label": label, "local": local, "index": i})

    cal = section("calendar")
    form["calendar"] = None
    if cal:
        url = _url(cal.get("url"), "calendar.url", errs)
        if url:
            form["calendar"] = {"url": url}

    hosts = body.get("hosts") or []
    form["hosts"] = []
    if not isinstance(hosts, list):
        errs.add("hosts", "must be a list of computers")
    elif len(hosts) > MAX_HOSTS:
        errs.add("hosts", f"at most {MAX_HOSTS} computers")
    else:
        names: set[str] = set()
        for i, h in enumerate(hosts):
            if not isinstance(h, dict):
                errs.add(f"hosts.{i}.name", "must be an object")
                continue
            name = _text(h.get("name"), f"hosts.{i}.name", errs, limit=32, required=True)
            addr = _text(h.get("address"), f"hosts.{i}.address", errs, limit=253, required=True)
            if name and not _HOST_NAME_RE.match(name):
                errs.add(f"hosts.{i}.name", "letters, digits, - and _ only (e.g. homelab, main-pc)")
                name = None
            elif name and name.lower() in names:
                errs.add(f"hosts.{i}.name", "two computers with the same name")
                name = None
            if addr and not valid_address(addr):
                errs.add(f"hosts.{i}.address", "an IP address (192.168.1.10) or a hostname (nas.local)")
                addr = None
            if name and addr:
                names.add(name.lower())
                form["hosts"].append({"name": name, "address": addr})

    sp = section("spotify")
    form["spotify"] = None
    if sp and any(sp.get(k) for k in ("client_id", "client_secret", "refresh_token")):
        vals = {}
        for k in ("client_id", "client_secret", "refresh_token"):
            v = _text(sp.get(k), f"spotify.{k}", errs, limit=MAX_SECRET, required=True)
            if v and not _TOKEN_RE.match(v):
                errs.add(f"spotify.{k}", "doesn't look right: paste exactly what spotify_auth.py printed")
                v = None
            vals[k] = v
        if all(vals.values()):
            form["spotify"] = vals
    return form, list(errs)


# ---------------------------------------------------------------------- form -> files
def toml_str(s: str) -> str:
    """A TOML basic string. JSON's escapes (\\" \\\\ \\n \\uXXXX ...) are all valid TOML; DEL is not allowed raw."""
    return json.dumps(s, ensure_ascii=False).replace("\x7f", "\\u007f")


def _kv(key: str, value: str, comment: str | None = None, width: int = 33) -> str:
    line = f"{key} = {value}"
    return f"{line:<{width}} # {comment}" if comment else line


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:24].strip("-")


def news_sources(form: dict[str, Any]) -> list[dict[str, Any]]:
    """Each feed as a source named news-<label or host> (unique), so the news rule's news*.items finds it."""
    out, used = [], set()
    for f in form.get("news") or []:
        host = re.sub(r"^(www|feeds?|rss)\.", "", urlsplit(f["url"]).hostname or "")
        base = (_slug(f.get("label") or "") or _slug(host) or "feed").removeprefix("news-")
        base = base if base not in ("", "news") else "feed"
        name, n = f"news-{base}", 2
        while name in used:
            name, n = f"news-{base}-{n}", n + 1
        used.add(name)
        out.append({**f, "name": name})
    return out


def secrets_of(form: dict[str, Any]) -> dict[str, str]:
    """The secrets.toml entries these answers need (only what was given)."""
    out: dict[str, str] = {}
    if form.get("calendar"):
        out["CALENDAR_ICS_URL"] = form["calendar"]["url"]
    sp = form.get("spotify")
    if sp:
        out.update(SPOTIFY_CLIENT_ID=sp["client_id"], SPOTIFY_CLIENT_SECRET=sp["client_secret"],
                   SPOTIFY_REFRESH_TOKEN=sp["refresh_token"])
    return out


def source_fields(form: dict[str, Any]) -> dict[str, str]:
    """source name -> the wizard field its problems belong to (for check())."""
    m = {"weather": "location", "ec": "envcanada", "heartbeat": "hosts", "calendar": "calendar.url",
         "music": "spotify.client_id"}
    for s in news_sources(form):
        m[s["name"]] = f"news.{s['index']}.url"
    return m


_RULE = "# " + "=" * 101


def render_config(form: dict[str, Any], *, themes: list[str] | None = None, now: datetime | None = None) -> str:
    """config.toml for these answers, commented in the style of config.example.toml so it reads well when
    edited by hand later. Secrets appear only as ${NAME} references."""
    loc, sch, look = form["location"], form["schedule"], form["look"]
    ec, hosts, cal, sp = form.get("envcanada"), form.get("hosts") or [], form.get("calendar"), form.get("spotify")
    feeds = news_sources(form)
    when = (now or datetime.now()).strftime("%Y-%m-%d")
    theme_list = " ".join(themes) if themes else "cyberpunk nature classical boreal campfire academia"
    L: list[str] = []
    a = L.append

    a(f"# Ambient Wall configuration, written by the setup wizard on {when}. Yours to edit: the wizard only runs")
    a("# while this file does not exist (delete it to run the wizard again; config.example.toml is never touched).")
    a("# After editing this file or secrets.toml, restart the wall:  docker compose restart wall  (or stop and start")
    a("# `uv run ambient`). config.example.toml has every option with comments; docs/SOURCES.md explains each source.")
    a("#")
    a('# Secrets (calendar address, Spotify keys) live in config/secrets.toml and appear here as "${NAME}".')
    a('# Durations: "250ms", "30s", "5m", "1h", "2d" or a bare number of seconds.')
    a("")
    a("[server]")
    a(_kv("host", toml_str("0.0.0.0"), "in-container bind; change the published port in compose.yaml"))
    a("port = 8700")
    a('# push_token = "${PUSH_TOKEN}"    # if set, every POST /api/... needs  Authorization: Bearer <token>')
    a('# allowed_origins = ["null"]      # extra browser origins allowed on the WebSocket (see config.example.toml)')
    a("")
    a("[location]                        # daylight (browser), weather, and local time everywhere")
    a(_kv("name", toml_str(loc["name"])))
    a(_kv("lat", repr(round(loc["lat"], 4))))
    a(_kv("lon", repr(round(loc["lon"], 4))))
    a(_kv("timezone", toml_str(loc["timezone"])))
    a("")
    a("[mode]                            # outside work hours (and on other days) the wall is ambient")
    a(_kv("work_start", toml_str(sch["work_start"])))
    a(_kv("work_end", toml_str(sch["work_end"])))
    a(_kv("work_days", "[" + ", ".join(str(d) for d in sch["work_days"]) + "]",
          "0 = Sunday ... 6 = Saturday"))
    a(_kv("transition_seconds", "8", 'the "exhale" between work and ambient'))
    a("")
    a("[display]")
    a(_kv("theme", toml_str(look["theme"]), theme_list))
    a(_kv("hour24", "true" if sch["hour24"] else "false"))
    a(_kv("sound", "true" if look["sound"] else "false", "ambient sound at startup (S on the wall toggles)"))
    a(_kv("volume", "0.4", "0..1, ambient mode"))
    a(_kv("sound_work", "0.0", "0..1 volume during work mode (0 = silent while working)"))
    a(_kv("boost", str(look["boost"]), "projector boost for a dim projector: 0 off, 1 low, 2 medium, 3 high"))
    a(_kv("cat", "true" if look["cat"] else "false", "a cat in every scene (K on the wall toggles)"))
    a(_kv("cat_coat", toml_str(look["cat_coat"]), " ".join(CAT_COATS)))
    a("")
    a("[history]")
    a(_kv("keep", toml_str("14d"), "SQLite history of changes in /data/history.db, pruned past this age"))
    a("")
    a("")
    a(_RULE)
    a("# Sources: one [[source]] table per instance. `name` becomes the signal namespace (\"<name>.<key>\"),")
    a("# `type` picks the adapter. Every source also takes every, ttl, visibility (\"wall\" | \"ask\") and enabled.")
    a(_RULE)
    a("")
    a("# Weather: Open-Meteo, free, no key. Only the rounded coordinates leave the network.")
    a("[[source]]")
    a('name = "weather"')
    a('type = "open_meteo"')
    a('every = "10m"')
    a("")
    if ec:
        where = f"{ec['name']} ({ec['province']})" if ec.get("name") else ec["province"]
        a("# Environment Canada: station observations (rain the model misses still rains on the wall, see [wall]")
        a("# weather_obs_* and observed = \"ec\" below) and official warnings for the warnings panel.")
        a("# Site list: https://dd.weather.gc.ca/today/citypage_weather/docs/site_list_en.csv")
        a("[[source]]")
        a('name = "ec"')
        a('type = "envcanada"')
        a(_kv("site", toml_str(ec["site"]), where))
        a(_kv("province", toml_str(ec["province"])))
        a('every = "15m"')
        a(_kv("ttl", toml_str("90m"), "observations are hourly: keep the last one until the next arrives"))
        a("")
    if hosts:
        a("# Computers to watch: ICMP ping per host (the container has NET_RAW for this).")
        a("[[source]]")
        a('name = "heartbeat"')
        a('type = "ping"')
        a('every = "30s"')
        a("hosts = { " + ", ".join(f"{h['name']} = {toml_str(h['address'])}" for h in hosts) + " }")
        a(_kv("# tcp_port", "22", "TCP-connect check instead of ICMP"))
    else:
        a("# Computers to watch: ICMP ping per host.")
        a("# [[source]]")
        a('# name = "heartbeat"')
        a('# type = "ping"')
        a('# every = "30s"')
        a('# hosts = { homelab = "192.168.1.10", main-pc = "192.168.1.20" }')
    a("")
    a('# Calendar: Google Calendar "Secret address in iCal format" (read-only, no OAuth), in secrets.toml.')
    if cal:
        a("[[source]]")
        a('name = "calendar"')
        a('type = "ical"')
        a('url = "${CALENDAR_ICS_URL}"')
        a('every = "5m"')
    else:
        a('#   secrets.toml:  CALENDAR_ICS_URL = "https://calendar.google.com/calendar/ical/.../basic.ics"')
        a("# [[source]]")
        a('# name = "calendar"')
        a('# type = "ical"')
        a('# url = "${CALENDAR_ICS_URL}"')
        a('# every = "5m"')
    a("")
    a("# News headlines: any RSS / Atom feed. Name each source \"news...\" so [rules.news] picks it up.")
    if feeds:
        for f in feeds:
            a("[[source]]")
            a(f'name = "{f["name"]}"')
            a('type = "rss"')
            a(_kv("url", toml_str(f["url"])))
            if f.get("label"):
                a(_kv("label", toml_str(f["label"]), "display name (default: the feed's own title)"))
            if f.get("local"):
                a(_kv("priority", "1", "local news ranks above the other feeds"))
            a('every = "15m"')
            a("")
    else:
        a("# [[source]]")
        a('# name = "news-top"')
        a('# type = "rss"')
        a('# url = "https://www.cbc.ca/webfeed/rss/rss-topstories"')
        a('# label = "CBC News"')
        a('# every = "15m"')
        a("")
    a("# Now playing: one source named \"music\" (spotify, lastfm or push; see docs/SOURCES.md).")
    if sp:
        a("[[source]]")
        a('name = "music"')
        a('type = "spotify"')
        a('client_id = "${SPOTIFY_CLIENT_ID}"')
        a('client_secret = "${SPOTIFY_CLIENT_SECRET}"')
        a('refresh_token = "${SPOTIFY_REFRESH_TOKEN}"')
    else:
        a("# Spotify: run  python scripts/spotify_auth.py --client-id <id>  once and paste its 3 lines into")
        a("# secrets.toml, then uncomment:")
        a("# [[source]]")
        a('# name = "music"')
        a('# type = "spotify"')
        a('# client_id = "${SPOTIFY_CLIENT_ID}"')
        a('# client_secret = "${SPOTIFY_CLIENT_SECRET}"')
        a('# refresh_token = "${SPOTIFY_REFRESH_TOKEN}"')
    a("")
    a("# ---- more sources (set up here by hand; config.example.toml and docs/SOURCES.md have the details) ------")
    a("#")
    a("# Finances: the \"Annual budget <year>\" Google Sheet via a read-only service account")
    a("# [[source]]")
    a('# name = "finances"')
    a('# type = "google_sheet_finances"')
    a('# sheet_id = "${FINANCE_SHEET_ID}"')
    a('# credentials_file = "/config/google-service-account.json"')
    a('# every = "15m"')
    a("#")
    a("# Project pulse (ask panel): GitHub activity on your repos")
    a("# [[source]]")
    a('# name = "github"')
    a('# type = "github"')
    a('# repos = ["owner/repo"]')
    a('# token = "${GITHUB_TOKEN}"        # optional, read-only')
    a('# every = "30m"')
    a("#")
    a("# Also: lastfm (now playing from any scrobbling player), push (POST /api/publish/<name> from phones and")
    a("# scripts), http_json (any JSON API), file (a JSON / CSV / TOML file), command (any program), plugins.")
    a("")
    a("")
    a(_RULE)
    a("# Rules: derived signals (source \"rules\"). Every table is optional; every rule also takes enabled, every,")
    a("# ttl and inputs (see config.example.toml).")
    a(_RULE)
    a("")
    a("[rules.heartbeat_down]")
    a(_kv("after", toml_str("2m"), "no successful ping for this long = down"))
    a("")
    a("[rules.finance_mood]")
    a(_kv("drift_ratio", "0.85", "spent/income above this = drift"))
    a(_kv("warning_ratio", "1.0", "above this (or net < 0) = warning"))
    a("")
    a("[rules.weather_actionable]")
    if ec:
        a(_kv("observed", toml_str("ec"), "rain the station reports = \"Raining now\", even if the model says dry"))
    a(_kv("precip_window", toml_str("60m"), "\"Rain in 20 min\" only within this window"))
    a(_kv("cold_c", "-15", "feels-like at or below = \"dress for it\""))
    a("")
    a("[rules.leave_early]")
    if ec:
        a(_kv("observed", toml_str("ec")))
    a(_kv("lead", toml_str("60m"), "event with a location starting within this..."))
    a(_kv("around", toml_str("30m"), "...and precipitation by its start + this = \"Leave early\""))
    a("")
    terms = [t for t in (loc["name"], loc.get("region")) if t]
    a("[rules.news]                      # rank, dedupe and flag headlines from every news*.items feed")
    a(_kv("max_age", toml_str("12h"), "older items are dropped"))
    a(_kv("keep", "5", "length of rules.news.top"))
    a(_kv("local_terms", "[" + ", ".join(toml_str(t) for t in terms) + "]", "headlines naming these rank up"))
    a(_kv("critical_priority", "10", "a source with priority >= this is always critical"))
    a(_kv("rotate_top", "3", "the wall rotates through the top 3 headlines..."))
    a(_kv("rotate_s", "60", "...one every 60 s (a critical headline is pinned instead)"))
    a("")
    a("")
    a(_RULE)
    a("# Wall bindings: which pool signals feed which wall element. Change them when you rename a source.")
    a(_RULE)
    a("")
    a("[wall]")
    a('calendar = "calendar.next"')
    a('heartbeat = "rules.heartbeat.*"')
    a('finances = "finances.month"')
    a('finance_mood = "rules.finances.mood"')
    a('weather_temp = "weather.now.temp_c"')
    a('weather_actionable = "rules.weather.actionable"')
    a(_kv("weather_condition", toml_str("weather.now.condition"), "clear|cloudy|fog|rain|storm|snow", 47))
    a(_kv("weather_intensity", toml_str("weather.now.intensity"), "0..1", 47))
    a('weather_wind = "weather.now.wind_kph"')
    if ec:
        a(_kv("weather_obs_condition", toml_str("ec.now.condition"), "station observations: precipitation they", 47))
        a(_kv("weather_obs_intensity", toml_str("ec.now.intensity"), "report wins over the model's \"now\"", 47))
    a(_kv("calendar_advice", toml_str("rules.calendar.advice"), "\"Leave early\" replaces the weather sliver; \"\" = off", 47))
    a(_kv("heartbeat_raw", toml_str("heartbeat.host.*"), "raw probes, for hosts the rule hasn't covered yet", 47))
    a(_kv("news", toml_str("rules.news.top"), "ranked headlines from [rules.news]; \"\" = off", 47))
    a(_kv("now_playing", toml_str("music.now"), "current track from the \"music\" source; \"\" = off", 47))
    a(_kv("now_playing_idle", toml_str("2m"), "paused longer than this = hidden", 47))
    if ec:
        a("")
        a("[ask.warnings]                    # the warnings panel reads Environment Canada (the \"ec\" source)")
        a('warnings = "ec.warnings"')
    a("")
    return "\n".join(L)


def render_secrets(values: dict[str, str], existing: str | None = None) -> str:
    """secrets.toml with these values: a new file, or `existing` with each NAME line replaced / appended
    (anything else the user already keeps there stays as it is)."""
    text = existing if existing is not None else (
        "# Ambient Wall secrets (gitignored; never commit or share this file). A flat table of NAME = \"value\",\n"
        "# referenced from config.toml as \"${NAME}\". Written by the setup wizard; edit freely.\n")
    added = []
    for name, value in values.items():
        line = f"{name} = {toml_str(value)}"
        pat = re.compile(rf"(?m)^[ \t]*{re.escape(name)}[ \t]*=.*$")
        if pat.search(text):
            text = pat.sub(lambda _m: line, text, count=1)
        else:
            added.append(line)
    if added:
        if text and not text.endswith("\n"):
            text += "\n"
        text += "\n".join(added) + "\n"
    return text


# ---------------------------------------------------------------------- validation
def check(form: dict[str, Any], config_dir: Path, *, themes: list[str] | None = None,
          registry: dict[str, type] | None = None) -> tuple[str, str, list[dict[str, str]]]:
    """Render and validate exactly like startup does: load_config() on a scratch copy of the files, then
    construct every enabled source's adapter (option checks live in the adapters' __init__).
    -> (config_toml, secrets_toml, errors)."""
    from .adapters.base import REGISTRY, AdapterContext

    reg = REGISTRY if registry is None else registry
    text = render_config(form, themes=themes)
    sec_path = Path(config_dir) / SECRETS_FILE
    existing = _read(sec_path)
    secrets_text = render_secrets(secrets_of(form), existing)
    errs = _Errors()
    fields = source_fields(form)
    with tempfile.TemporaryDirectory(prefix="ambient-setup-") as tmp:
        t = Path(tmp)
        (t / CONFIG_FILE).write_text(text, encoding="utf-8")
        (t / SECRETS_FILE).write_text(secrets_text, encoding="utf-8")
        try:
            cfg = load_config(t)
        except ConfigError as e:
            for line in str(e).splitlines()[1:] or [str(e)]:
                errs.add(_field_for(line, fields), line.strip().lstrip("- "))
            return text, secrets_text, list(errs)
    for sc in cfg.sources:
        if not sc.enabled:
            errs.add(fields.get(sc.name, "review"), f"source {sc.name!r}: {sc.disabled_reason}")
            continue
        cls = reg.get(sc.type)
        if cls is None:
            continue
        ctx = AdapterContext(http=None, log=log, data_dir=Path(tempfile.gettempdir()),  # type: ignore[arg-type]
                             settings=cfg.adapter_settings())
        try:
            cls(sc.name, dict(sc.options), ctx)
        except Exception as e:  # noqa: BLE001 - an adapter's own option check
            errs.add(fields.get(sc.name, "review"), str(e))
    return text, secrets_text, list(errs)


def _field_for(line: str, fields: dict[str, str]) -> str:
    m = re.search(r"source '([^']+)'", line)
    if m:
        return fields.get(m.group(1), "review")
    for prefix, field in (("[location] lat", "location.lat"), ("[location] lon", "location.lon"),
                          ("[location]", "location.timezone"), ("[mode] work_start", "schedule.work_start"),
                          ("[mode] work_end", "schedule.work_end"), ("[mode] work_days", "schedule.work_days"),
                          ("[display] theme", "look.theme"), ("[display] boost", "look.boost"),
                          ("[display] cat_coat", "look.cat_coat")):
        if prefix in line:
            return field
    return "review"


def _read(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    except OSError as e:
        raise WriteError(f"cannot read {path.name}: {e.strerror}", _hint(path.parent, e)) from None


# ---------------------------------------------------------------------- writing
def _hint(config_dir: Path, e: OSError) -> str:
    if getattr(e, "errno", None) == 30:            # EROFS
        return ("config/ is mounted read-only. In compose.yaml change  ./config:/config:ro  to  ./config:/config,"
                " run  docker compose up -d  and press Save again. Or copy config.toml below into config/ yourself"
                " and restart the wall.")
    uid = os.getuid() if hasattr(os, "getuid") else None
    who = f" (uid {uid})" if uid is not None else ""
    return (f"The wall's user{who} may not write to {config_dir}. On the Docker host, from the repo root:"
            f"  sudo chown -R {uid if uid is not None else 10001} config   (or: chmod o+w config)"
            "  and press Save again. Or copy config.toml below into config/ yourself and restart the wall.")


def write_atomic(path: Path, text: str, mode: int = 0o644) -> None:
    """Write via a temp file in the same directory + os.replace: a reader never sees half a file."""
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        try:
            os.chmod(tmp, mode)
        except OSError:
            pass
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def write_files(config_dir: Path, config_text: str, secrets_text: str | None) -> list[str]:
    """secrets.toml first (only when there are secrets), then config.toml: config.toml's existence is what
    ends first-run mode, so it is written last. Raises WriteError with a fix-it hint."""
    d = Path(config_dir)
    written = []
    try:
        if not d.is_dir():
            d.mkdir(parents=True, exist_ok=True)
        if secrets_text is not None:
            write_atomic(d / SECRETS_FILE, secrets_text, 0o600)
            written.append(SECRETS_FILE)
        if (d / CONFIG_FILE).exists():
            raise FileExistsError(str(d / CONFIG_FILE))
        write_atomic(d / CONFIG_FILE, config_text, 0o644)
        written.append(CONFIG_FILE)
    except FileExistsError:
        raise
    except OSError as e:
        log.error("setup: writing to %s failed: %s", d, e.strerror or type(e).__name__)
        raise WriteError(f"could not write to {d}: {e.strerror or type(e).__name__}", _hint(d, e)) from None
    log.info("setup: wrote %s in %s", " and ".join(written), d)
    return written


# ---------------------------------------------------------------------- lookups (fixed upstream hosts)
def clean_query(q: Any) -> str:
    if not isinstance(q, str):
        raise ValueError("q must be text")
    q = " ".join(q.split())
    if not 2 <= len(q) <= MAX_QUERY or _CTRL_RE.search(q):
        raise ValueError(f"type 2 to {MAX_QUERY} characters")
    return q


async def geocode(http: httpx.AsyncClient, q: str, *, count: int = 10) -> list[dict[str, Any]]:
    """Open-Meteo geocoding (no key): place name -> [{name, region, admin1, country, country_code, lat, lon,
    timezone}]. Only the typed text goes out."""
    try:
        r = await http.get(GEOCODE_URL, params={"name": q, "count": count, "language": "en", "format": "json"},
                           timeout=UPSTREAM_TIMEOUT)
    except httpx.HTTPError as e:
        raise SetupError(f"place search failed ({type(e).__name__}); enter the coordinates by hand") from None
    if r.status_code != 200:
        raise SetupError(f"place search answered HTTP {r.status_code}; enter the coordinates by hand")
    try:
        results = r.json().get("results") or []
    except (ValueError, AttributeError):
        raise SetupError("place search sent something unexpected; enter the coordinates by hand") from None
    out = []
    for p in results[:count]:
        if not isinstance(p, dict):
            continue
        lat, lon, name = p.get("latitude"), p.get("longitude"), p.get("name")
        if not isinstance(name, str) or not all(isinstance(v, (int, float)) for v in (lat, lon)):
            continue
        s = lambda k: str(p[k])[:MAX_NAME] if isinstance(p.get(k), str) else None  # noqa: E731
        out.append({"name": name[:MAX_NAME], "region": s("admin2"), "admin1": s("admin1"), "country": s("country"),
                    "country_code": s("country_code"), "lat": float(lat), "lon": float(lon),
                    "timezone": s("timezone")})
    return out


_EC_CACHE: dict[str, Any] = {"at": 0.0, "sites": None}


def parse_site_list(text: str) -> list[dict[str, Any]]:
    """site_list_en.csv (two header lines; "45.89N","77.27W") -> [{code, name, province, lat, lon}].
    Highway entries without coordinates are skipped."""
    out = []
    for row in csv.reader(io.StringIO(text)):
        if len(row) < 5 or not _SITE_RE.match(row[0].strip()):
            continue
        code, name, prov, la, lo = (c.strip() for c in row[:5])
        m1, m2 = re.match(r"^([\d.]+)([NS])$", la), re.match(r"^([\d.]+)([EW])$", lo)
        if not (m1 and m2) or prov not in EC_PROVINCES:
            continue
        lat = float(m1.group(1)) * (1 if m1.group(2) == "N" else -1)
        lon = float(m2.group(1)) * (1 if m2.group(2) == "E" else -1)
        out.append({"code": code, "name": name, "province": prov, "lat": lat, "lon": lon})
    return out


async def ec_sites(http: httpx.AsyncClient) -> list[dict[str, Any]]:
    now = time.monotonic()
    if _EC_CACHE["sites"] is not None and now - _EC_CACHE["at"] < EC_SITES_TTL_S:
        return _EC_CACHE["sites"]
    try:
        async with http.stream("GET", EC_SITES_URL, timeout=UPSTREAM_TIMEOUT) as r:
            if r.status_code != 200:
                raise SetupError(f"Environment Canada's site list answered HTTP {r.status_code}")
            buf = bytearray()
            async for chunk in r.aiter_bytes():
                buf += chunk
                if len(buf) > EC_SITES_MAX_BYTES:
                    raise SetupError("Environment Canada's site list is unexpectedly large")
    except httpx.HTTPError as e:
        raise SetupError(f"Environment Canada's site list could not be fetched ({type(e).__name__})") from None
    sites = parse_site_list(bytes(buf).decode("utf-8", errors="replace"))
    if not sites:
        raise SetupError("Environment Canada's site list had no sites in it")
    _EC_CACHE.update(at=now, sites=sites)
    return sites


def km_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(min(1.0, math.sqrt(h)))


def nearest_sites(sites: list[dict[str, Any]], lat: float, lon: float, n: int = 3) -> list[dict[str, Any]]:
    ranked = sorted(({**s, "km": round(km_between(lat, lon, s["lat"], s["lon"]), 1)} for s in sites),
                    key=lambda s: s["km"])
    return ranked[:n]


async def test_feed(http: httpx.AsyncClient, url: str) -> dict[str, Any]:
    """Fetch a feed once with the rss adapter's own download + parser (size and time bounded)."""
    from .adapters._shared import OptionError, SourceError
    from .adapters.base import AdapterContext
    from .adapters.rss import FeedError, Rss, parse_feed

    ctx = AdapterContext(http=http, log=log, data_dir=Path(tempfile.gettempdir()), settings={})
    try:
        feed = Rss("setup-test", {"url": url, "timeout": "10s", "max_bytes": 2_000_000}, ctx)
    except OptionError as e:
        return {"ok": False, "error": str(e).split(": ", 1)[-1]}
    try:
        data = await feed.download()
        title, items = parse_feed(data or b"", max_items=3, summary_chars=0)
    except (SourceError, FeedError) as e:
        return {"ok": False, "error": str(e)}
    if not items:
        return {"ok": False, "title": title, "error": "the feed has no headlines right now"}
    return {"ok": True, "title": title, "headline": items[0]["title"], "count": len(items)}
