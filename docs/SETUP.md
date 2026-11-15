# First-run setup wizard

A fresh install has no `config/config.toml`, so the backend runs `config/config.example.toml`: every element is
fed by the offline `demo` source. Rather than hand-editing that 300-line file, open the wall in a browser: the page
sends you to the **setup wizard** (`http://<box>:8700/setup.html`), which writes a working, commented
`config/config.toml` (and `config/secrets.toml` for anything secret) and starts the wall with it. You don't need
to restart anything.

The wizard only exists until `config/config.toml` does. After that every setup endpoint answers `409` and the
page says "Already set up". To change things later, edit `config/config.toml` / `config/secrets.toml` and
restart the wall (`docker compose restart wall`). To run the wizard again, delete (or rename) `config/config.toml`
and restart.

## The steps

Everything after the first step has defaults; Back/Next move between steps, and the step bar jumps to any of them.

1. **Place**: type a town. The backend looks it up through Open-Meteo's geocoder (only the text you typed is
   sent) and you pick a result, which fills in the name, latitude, longitude and time zone. You can also enter or
   adjust these by hand. Add the province or country to narrow the search, e.g. "Pembroke, Ontario". For a place
   in Canada the wizard offers the nearest Environment Canada citypage sites (from
   <https://dd.weather.gc.ca/today/citypage_weather/docs/site_list_en.csv>). When one is ticked, the config gets
   an `ec` envcanada source (`ttl = "90m"`), the `[wall] weather_obs_condition / weather_obs_intensity`
   bindings, `observed = "ec"` in `[rules.weather_actionable]` and `[rules.leave_early]`, and
   `[ask.warnings] warnings = "ec.warnings"`. The weather itself always comes from `open_meteo`.
2. **Hours**: when work hours start and end, which days are work days, and 24- or 12-hour clock.
3. **Look**: pick a theme from live previews, set the cat (on/off and coat), ambient sound, and projector boost.
   The previews are `index.html?mock=1&preview=1&mode=ambient&theme=<id>` in sandboxed iframes. They only load
   while they are on screen on this step. `preview=1` means mock data only and nothing is remembered on the device.
4. **Data** (all optional): news feeds (a few presets, or any RSS/Atom address with an optional name and a
   "local" flag that ranks it first; **test** fetches the feed once through the backend and shows its first
   headline), a calendar (the Google Calendar **secret** iCal address, which goes into `secrets.toml` as
   `CALENDAR_ICS_URL`; the page warns if you paste the public one), computers to watch (name + IP or hostname,
   pinged), and Spotify now-playing (the three values `scripts/spotify_auth.py` prints, which go into
   `secrets.toml`; see [SOURCES.md](SOURCES.md#keys-in-detail), "Spotify"). Finances (Google Sheet), GitHub,
   Last.fm, push and custom sources are set up by hand in `config.toml` afterwards. The generated file has
   commented examples.
5. **Review**: a summary, plus the exact `config.toml` the backend will write (secrets appear only as
   `${NAME}`). **Save and start** saves it. Any problem is shown under its field, and the wizard jumps to that step.

**Skip — keep the demo for now** (on the first step) is remembered in that browser
(`localStorage["ambient-wall.setup-skipped"]`). The wall then stays on demo data and, for a minute after it
connects, shows a faint `demo data · set up this wall: <box>:8700/setup.html` in the corner. `/?setup=0` skips
the wizard once without remembering anything. The flag clears itself once the backend is configured.

If the wall's own browser (the projector) was sent to the wizard and someone finishes the setup from a phone, the
projector's page notices within a few seconds and goes back to the wall.

## When does the wall open the wizard?

When the WebSocket `hello` says `"setup": {"needed": true}` (`frontend/js/core.js`, `firstRun()`), and only for a
wall page served by that backend over http(s). Never from `file://` (including the single-file `dist/` build),
with `?backend=` (a different origin), `?mock=1`, `?preview=1`, or static demo hosting (`AW.config.demo`); those
never connect, or connect to a backend that isn't theirs.

## What gets written

- `config/config.toml`: `[server]`, `[location]`, `[mode]`, `[display]`, `[history]`, the chosen sources
  (`weather` open_meteo always; `ec`, `heartbeat`, `calendar`, `news-<name>` rss feeds, `music` spotify when
  chosen), commented templates for the ones not chosen, `[rules.*]` (with `[rules.news] local_terms` = your place
  and its county/region), `[wall]` and, with Environment Canada, `[ask.warnings]`. It's commented in the style of
  `config.example.toml` so it's easy to edit by hand.
- `config/secrets.toml`: only the secrets you gave (`CALENDAR_ICS_URL`, `SPOTIFY_CLIENT_ID`,
  `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`). If the file already exists, only those lines are replaced or
  appended; everything else in it is kept. Mode 0600.

Both are written atomically (a temp file in `config/`, then a rename): `secrets.toml` first, `config.toml` last,
because the existence of `config.toml` is what ends first-run mode.

The answers are validated by the same `load_config()` startup uses (run on a scratch copy of the two files), and
then each source's adapter is constructed once, so its own option checks (an rss URL, a ping host) run as well. A
config the wizard writes always loads.

## How it is applied

In process. The backend tells every connected wall to reconnect (WebSocket close code 1013), stops the running
sources, rules, pool and album-art cache, loads the new `config.toml`, and starts them again. The pool starts
empty, so no demo data lingers. Reconnecting walls get the new `hello` and live data. This works the same under
Docker and `uv run ambient`. If applying fails even though the files were written (it shouldn't), the response
says `"applied": false` and a restart picks the files up.

`[server] host/port` are not changed by the wizard (they need a restart anyway).

## Docker: config/ must be writable

`compose.yaml` mounts `./config:/config` read-write (it used to be `:ro`) so the wizard can save. The image runs
as the non-root user `wall` (uid 10001). On Docker Desktop (Windows, macOS) bind mounts are writable as-is. On a
Linux host the directory's owner matters. Give the container user write access once, from the repo root:

```sh
sudo chown -R 10001 config        # or, looser:  chmod o+w config
```

If saving fails anyway (permission denied, or a leftover `:ro` mount), the wizard doesn't leave you stuck. It shows
the exact fix and hands you the generated `config.toml` (and `secrets.toml`) to **copy** or **download**. Put them
in `config/` yourself and run `docker compose restart wall`.

Files the wizard writes belong to uid 10001. To edit them on a Linux host later, use `sudo`, or
`sudo chown $USER config/config.toml` (the container only needs to *read* `config.toml`; keep `secrets.toml`
readable by uid 10001).

`TZ` in `compose.yaml` is now `${TZ:-UTC}`. It only affects log timestamps, since the wall uses
`[location] timezone` for everything it shows. Set `TZ=America/Toronto` in a `.env` file next to `compose.yaml`
(or in your shell) if you want local times in `docker compose logs`.

**Turning the wizard off**: set `AMBIENT_SETUP=0` (e.g. for a public demo box that should keep running the
example config). `hello` then never asks for setup, `GET /api/setup` says `"enabled": false`, and every setup
POST answers 409.

## Endpoints

All live in `backend/ambient/server.py`; the logic is in `backend/ambient/setup.py`. Every POST goes through the
shared POST guard (bearer `push_token` if set, `Content-Type: application/json` → 415, 64 KB body limit → 413,
JSON → 400). After that, it only works while there is no `config.toml` (else **409**).

| method | path | body → answer |
|---|---|---|
| GET | `/api/setup` | `{"needed", "enabled", "running": "config.example.toml"\|"config.toml"\|null, "config_dir", "writable", "themes": [ids], "coats": [...], "secrets_present": [NAMES]}`. Never a secret value; `secrets_present` lists which of the wizard's secret names an existing `secrets.toml` already sets (only while setup is needed) |
| POST | `/api/setup/geocode` | `{"q": "Pembroke, Ontario"}` (2–60 chars) → `{"results": [{name, region, admin1, country, country_code, lat, lon, timezone}]}` (≤ 10). Calls only `geocoding-api.open-meteo.com`. 422 bad query, 502 upstream failed |
| POST | `/api/setup/ec-site` | `{"lat", "lon"}` → `{"sites": [{code, name, province, lat, lon, km}]}`, the 3 nearest. Calls only `dd.weather.gc.ca` (the site list, ≤ 1 MB, cached a day) |
| POST | `/api/setup/test-feed` | `{"url"}` (http/https, ≤ 2000 chars) → `{"ok": true, "title", "headline", "count"}` or `{"ok": false, "error"}`. One fetch through the rss adapter's own size- and time-limited download |
| POST | `/api/setup/preview` | the answers → `{"ok", "errors": [{field, message}], "config_toml", "secrets": [NAMES]}`. Writes nothing |
| POST | `/api/setup` | the answers → 200 `{"ok": true, "applied", "written": ["secrets.toml"?, "config.toml"], "note", "sources": [names]}`; 422 `{"ok": false, "errors": [...]}`; 500 `{"ok": false, "write_error", "hint", "config_toml", "secrets_toml", "config_dir"}` when `config/` isn't writable (the files go back only to the requester who just sent those values) |

The answers (every part except `location` optional, all bounded: names ≤ 80 chars, URLs ≤ 2000 and http(s)
only, ≤ 8 feeds, ≤ 16 computers, host names `[A-Za-z0-9_-]`, addresses an IP or a hostname):

```json
{"location": {"name": "Pembroke", "lat": 45.8168, "lon": -77.1162, "timezone": "America/Toronto", "region": "Renfrew County"},
 "envcanada": {"site": "s0000730", "province": "ON", "name": "Pembroke"},
 "schedule": {"work_start": "08:30", "work_end": "17:00", "work_days": [1, 2, 3, 4, 5], "hour24": true},
 "look": {"theme": "nature", "cat": false, "cat_coat": "tabby", "sound": false, "boost": 0},
 "news": [{"url": "https://feeds.bbci.co.uk/news/rss.xml", "label": "BBC News", "local": false}],
 "calendar": {"url": "https://calendar.google.com/calendar/ical/.../private-.../basic.ics"},
 "hosts": [{"name": "homelab", "address": "192.168.1.10"}],
 "spotify": {"client_id": "...", "client_secret": "...", "refresh_token": "..."}}
```

Error `field`s follow those paths (`location.lat`, `news.2.url`, `hosts.0.address`, `spotify.client_secret`;
`review` for anything that can't be tied to one field).

The WebSocket `hello` carries `"setup": {"needed": true}` while setup is needed. The key is absent otherwise.
This is checked on each connection, so a `config.toml` created by hand takes effect at the next restart and stops
the redirect immediately.

Secrets are never logged and never returned by a GET. The wizard's log lines name only the files written.
