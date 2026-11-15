# Adding data to the wall

Everything the wall knows is a **signal**: `<source>.<key>` = value, e.g. `weather.now.temp_c = 6`.
A *source* is one `[[source]]` table in `config/config.toml`; its `name` becomes the first part of
every signal id, its `type` picks the adapter. Signals land in the pool; the wall shows only the few
that are bound to wall elements (see [Getting it onto the wall](#getting-it-onto-the-wall)). Everything
else is still there for rules, `/api/signals` and (later) voice questions.

Common keys every source accepts:

| key | default | |
|---|---|---|
| `every` | per type (table below) | how often to fetch: `"30s"`, `"5m"`, `"1h"` |
| `ttl` | 3 x `every` | how long a value counts as fresh; stale values are dimmed or dropped |
| `visibility` | `"wall"` | `"ask"` = pool only, never glows unless asked for |
| `enabled` | `true` | |

Privacy rule for every source (SPEC 1.4): data may come *in*; personal data never goes *out*.
Adapters only pull. Credentials live in `config/`, never in logs.

## Quick start: your first data source

Most data needs no code at all: a file, a push, any JSON API or a script in any language (the
[five ways](#five-ways-to-add-a-source) below). When you want a real adapter, it is one Python file in
`plugins/`, imported at startup:

```python
# plugins/countdown.py
from datetime import date
from ambient.adapters.base import Adapter, register

@register("countdown")                       # the `type` used in config
class Countdown(Adapter):
    default_every = 3600                     # seconds between fetch() calls; config `every` overrides

    def __init__(self, name, options, ctx):
        super().__init__(name, options, ctx)
        self.target = date.fromisoformat(options["date"])   # bad options raise: the source shows as failed

    async def fetch(self):                   # return this cycle's signals; name, ts and ttl are filled in
        return [{"key": "days", "value": (self.target - date.today()).days}]
```

```toml
# config/config.toml
[[source]]
name = "holiday"
type = "countdown"
date = "2026-12-24"
```

Restart the backend (`docker compose restart`, or `uv run ambient` in `backend/`) and check
`GET /api/sources` (status, last error) and `GET /api/signals?pattern=holiday.*` (the signal
`holiday.days`). A new signal lives in the pool; to make it glow, bind it to a wall element or write a
rule (see [Getting it onto the wall](#getting-it-onto-the-wall)). A fuller example is
`plugins/example_plugin.py`; tests for adapters live in `backend/tests/` (`cd backend && uv run pytest`).

## Five ways to add a source

### 1. A file (no code)

Write JSON, CSV or TOML into the data dir (`/data` in the container, `backend/data/` in dev). It is
re-read when it changes.

```toml
[[source]]
name = "notes"
type = "file"
path = "notes.json"          # relative to the data dir unless absolute
```

```json
{"plants.watered": "2026-10-08", "guests": 2}
```

or a list, when you want per-signal options: `[{"key": "guests", "value": 2, "ttl": "1d", "visibility": "ask"}]`.
CSV: header `key,value[,type][,visibility]`, numbers and true/false are parsed. TOML: `guests = 2`
(quote dotted keys: `"plants.watered" = "..."`). A broken file marks the source as errored and keeps the
last good values. File values never go stale unless you set `ttl`.

### 2. Push (no code)

Declare it, then POST from anything on the LAN (phone shortcut, cron job, another box):

```toml
[[source]]
name = "phone"
type = "push"
ttl = "30m"
```

```sh
curl -X POST http://<box>:8700/api/publish/phone \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $PUSH_TOKEN" \
     -d '{"key": "battery", "value": 81}'
```

The body is one `{"key", "value"}` object or a list of them (optional `type`, `ttl`, `visibility`,
`meta`). The `Authorization` header is needed only when `[server] push_token` is set.

### 3. Any JSON API (no code)

```toml
[[source]]
name = "solar"
type = "http_json"
url = "http://192.168.1.50/api/status"
every = "1m"
map = { "power.now" = "data.watts", "battery.pct" = "data.batteries.0.percent" }
# headers = { Authorization = "Bearer ${SOLAR_TOKEN}" }
# types = { "power.now" = "number" }
```

`map` is signal key -> dotted path into the response (`.0.` indexes a list). Without `map` the whole
response becomes the key `value`. Non-2xx, timeouts (`timeout`, default 10 s) and non-JSON are errors.

### 4. A script in any language (no adapter code)

Put a program in `scripts/` (`/app/scripts` in the container; it runs *inside* the container, so it
can use Python or anything you add to the image). Print one JSON object per line:

```toml
[[source]]
name = "backup"
type = "command"
command = ["python", "example_status.py"]   # argv list, no shell; cwd = scripts/
every = "15m"
timeout = "30s"
# env = { BACKUP_ROOT = "/data/backups" }
```

```python
print(json.dumps({"key": "last_ok", "value": "2026-10-09T03:00:00Z"}))
print(json.dumps({"key": "free_gb", "value": 412}))
```

One JSON document (`{"key","value"}`, a list of them, or a plain `{key: value}` object) also works.
Non-zero exit = error, with the end of stderr shown in `/api/sources`. `"python"` means the backend's
own interpreter. See `scripts/example_status.py`.

### 5. A Python adapter (full control)

One file in `plugins/` (`/app/plugins` in the container), imported at startup. See
`plugins/example_plugin.py`:

```python
from ambient.adapters.base import Adapter, register

@register("my_thing")
class MyThing(Adapter):
    default_every = 300

    async def fetch(self):
        r = await self.ctx.http.get(self.options["url"])     # shared client; pull only
        return [{"key": "count", "value": r.json()["count"]}]
```

Raise from `fetch()` on failure (the scheduler records it and retries with backoff). Validate options
in `__init__`. Long-running or push-style adapters override `run(emit)` instead. `self.ctx` has
`http`, `log`, `data_dir` and `settings` (`location`, `mode`, `display`).

## Built-in types

| type | options (required in bold) | keys | every / ttl |
|---|---|---|---|
| `demo` | `parts` (`calendar` `heartbeat` `finances` `weather` `news` `pulse` `music`), `weather` (`overcast` `clear` `partly` `fog` `drizzle` `rain` `storm` `snow` `cold` `cycle`), `cycle_every` (60s), `finance` (`calm` `drift` `warning`), `homelab_down`, `calendar` (bool), `calendar_lead_min` (47), `warnings` (false), `news` (`normal` `critical` `none`), `music` (`playlist` `none`) | the real adapters' keys for each part (see [Demo parts](#demo-parts)). `parts` defaults to the part named like the source, else all seven | 5s / 15s |
| `file` | **`path`**, `format` | whatever the file holds | 10s / never |
| `push` | | whatever is posted | n/a / never |
| `http_json` | **`url`**, `map`, `types`, `headers`, `timeout` | `map` keys, or `value` | 1m / 3m |
| `command` | **`command`**, `timeout` (30s), `env`, `cwd` | whatever it prints | 5m / 15m |
| `ping` | **`hosts`** (`{name = "addr"}` or `{name = {address, tcp_port}}`), `tcp_port`, `timeout` (1s) | `host.<name>` | 30s / 90s |
| `open_meteo` | `lat`/`lon` (default `[location]`), `precip_horizon` (2h), `precip_threshold_mm_h` (0.2), `forecast_days` (7) | weather keys | 10m / 30m |
| `envcanada` | **`site`**, `province` (ON), `pop_threshold` (40), `precip_horizon` (2h), `lang`, `url` | weather keys + `warnings` (ask) | 10m / 30m |
| `ical` | **`url`** or **`path`**, `include_all_day`, `horizon` (14d) | `next`, `today` (ask) | 5m / 15m |
| `google_sheet_finances` | **`sheet_id`**, **`credentials_file`**, `sheet` (Summary), `header_row` 22, `income_row` 23, `expenses_row` 24, `net_row` 25, `balance_row` 26, `first_col` D, `last_col` O, `detail` | `month`, `detail.expenses` / `detail.income` (ask, with `detail = true`) | 15m / 45m |
| `github` | **`repos`**, `token`, `dormant_days` (30) | `repo.<owner>/<name>`, `pulse` (all ask) | 30m / 90m |
| `spotify` | **`client_id`**, **`client_secret`**, **`refresh_token`** (all `${SPOTIFY_*}` secrets), `every` (5s, while playing), `idle_every` (30s), `timeout` (10s) | `now` | adaptive / 3 x current poll |
| `lastfm` | **`api_key`**, **`user`**, `timeout` (10s) | `now` | 15s / 45s |
| `rss` | **`url`**, `label` (feed title), `priority` (0), `max_items` (20), `summary_chars` (280), `timeout` (15s), `max_bytes` (2000000) | `items` (ask) | 15m / 45m |

### Keys in detail

**Calendar** (`ical`, `demo`)
- `next`: `{title, start, end, location?, all_day}` (ISO 8601 with offset, local timezone) for the next
  event *starting* after now; `null` when nothing is upcoming, so the wall clears it. Cancelled events
  are skipped; all-day events only with `include_all_day = true`. Recurring events are expanded.
- `today` (ask): every event overlapping the local day, same shape.

Google Calendar: Settings -> your calendar -> *Integrate calendar* -> **Secret address in iCal
format**. It is read-only and needs no OAuth, but it *is* a credential: put it in `secrets.toml` as
`CALENDAR_ICS_URL` and use `url = "${CALENDAR_ICS_URL}"`. Only its host ever appears in logs/status.

**Heartbeat** (`ping`, `demo`)
- `host.<name>`: `{up, rtt_ms, last_seen}`, type `status`. Raw result of this probe; `last_seen` is the
  last successful probe (ISO, `null` = not seen since the backend started). "Down after 2 min" is the
  `heartbeat_down` rule's job, not the adapter's. ICMP via the system `ping`; with `tcp_port` a TCP
  connect instead (a refused connection still counts as up: the host answered).

**Finances** (`google_sheet_finances`, `demo`)
- `month`: `{income, spent, net, balance, month: "YYYY-MM", last_updated}` from the Summary sheet's
  current-month column (header text in row 22 wins, else `D + month - 1`); `net` is computed if its
  cell is empty. `last_updated` = the file's Drive modified time.
- Setup: Google Cloud project -> enable Sheets API + Drive API -> create a service account -> JSON key
  into `config/` -> share the sheet with the service account's email as Viewer. Scopes are read-only.
  Needs `uv sync --extra google` (the Docker image includes it).
  Tested against fixtures only; not yet run against a live sheet.

**Weather** (`envcanada`, `open_meteo`, `demo`)

| key | |
|---|---|
| `now.temp_c`, `now.feels_like_c`, `now.wind_kph` | numbers (feels-like = wind chill / humidex / apparent temperature) |
| `now.condition` | exactly one of `clear` `cloudy` `fog` `rain` `storm` `snow` |
| `now.intensity` | 0..1, see below |
| `now.summary` | provider's words, e.g. "Light rain", "Mainly sunny" |
| `precip.next_minutes` | minutes until precipitation starts within `precip_horizon`; `null` if none expected *or already precipitating* |
| `precip.kind` | `rain` / `snow` / `storm` for what's coming (or what's falling now); `null` if dry |
| `forecast.daily` (ask) | list of days/periods: date or period, condition, summary, temps, pop |

Condition mapping: drizzle and showers -> `rain`; thunder -> `storm`; freezing rain/drizzle, sleet, ice
pellets and rain/snow mixes -> `snow` at or below 0 C, else `rain`; mist/haze/smoke -> `fog`.
Intensity: for `clear`/`cloudy` it is the cloud-cover fraction (0 clear sky, ~0.35 partly, ~0.8
overcast). For `rain`/`snow` it scales with precipitation rate: rain 0.2 drizzle (~0.5 mm/h), 0.6
moderate (~4 mm/h), 1.0 downpour (16+ mm/h); snow 0.3 light, 0.6 moderate, 1.0 heavy (4+ mm/h water).
Without a rate it comes from the provider's code/words ("light" ~0.3, "heavy" ~0.95). `storm` >= 0.8.
`fog` is a density guess (0.4 mist/haze, 0.7 fog).

Environment Canada: find a site code in
<https://dd.weather.gc.ca/today/citypage_weather/siteList.xml> (e.g. Ottawa (Kanata - Orleans) =
`s0000430`, `ON`). Towns without an observing station have no current
conditions; "now" then comes from the current hour of the hourly forecast, and precipitation timing is
hour-resolution. The adapter finds the newest file in the Datamart's hourly directories; if MSC changes
the layout again, set `url` to a fixed XML URL. Open-Meteo: 15-minute precipitation, only the
coordinates (rounded to ~1 km) are sent.

**Project pulse** (`github`): `repo.<owner>/<name>` = `{repo, url, pushed_at, last_commit {sha,
message, date, author}, days_since, alive, dormant, private, open_issues}`; `pulse` = all of them, most
recently active first. `dormant` = no push or commit for more than `dormant_days`.

**News** (`rss`, `demo`)
- `items` (ask): `[{title, link, published, source, summary?}, ...]`, newest first (undated items
  last), at most `max_items`. `title` / `summary` are plain text: CDATA, HTML tags (escaped or not)
  and HTML entities such as `&nbsp;` are resolved. `published` is ISO 8601 with the `[location]`
  offset, from RSS `pubDate` (RFC 822, incl. `EDT`-style zones), Atom `published`/`updated` or
  `dc:date` (ISO 8601); `null` if the feed has no usable date. `source` = `label`, else the feed's
  title. `link` is http(s) only. Signal meta: `{priority, label, feed_title}`.
- RSS 2.0, RSS 1.0 (RDF) and Atom, namespaces ignored. Parsed with defusedxml: a feed declaring
  entities (billion-laughs, XXE) is refused; responses over `max_bytes` (default 2 MB) are cut off and
  refused; `timeout` bounds the whole download. Conditional GET (ETag / Last-Modified): a `304`
  re-emits the previous items. Unknown options are an error (typos don't silently do nothing).
- Name news sources `news...` (`news`, `news-ottawa`, `news_cbc`): the `news` rule reads every
  `news*.items` signal by default (`[rules.news] inputs` to change that).
- Feeds that work today (checked 2026-10-10): CBC Ottawa
  `https://www.cbc.ca/webfeed/rss/rss-canada-ottawa`, CBC top stories
  `https://www.cbc.ca/webfeed/rss/rss-topstories`. Other CBC regions: `rss-canada-<region>`; list at
  <https://www.cbc.ca/rss/>.

**Now playing** (`spotify`, `lastfm`, `push`, `demo`; name the source `music` so the default
`[wall] now_playing = "music.now"` binding finds it)
- `now`: `{title, artist, album, is_playing, progress_ms, anchor_at, duration_ms, track_id, art_url,
  kind, paused_since?, device?}` or `null` when nothing is playing. `progress_ms` is the position at
  `anchor_at`; both stay fixed during steady playback (so polling every 5 s adds no history rows and
  no wall updates) and change only on a track change, play/pause, a duration change or a seek of more
  than 2.5 s. `kind` = `track` / `episode` / `local`.
  Podcasts: `artist` = the show, `album` = the publisher. `paused_since` (ISO) is set while paused;
  the wall hides the element once it has been paused for longer than `[wall] now_playing_idle`
  (default `"2m"`). Signal meta `{"provider": "spotify" | "lastfm" | "demo"}` (shown as `source`).
- Wall element `nowPlaying`: `{title, artist, album, isPlaying, progressMs, durationMs, updatedAt,
  source, art}`; `updatedAt` = when the value was observed, so the browser advances the progress bar
  itself between polls. `art` = `/api/art/<id>` once the backend has cached the cover, else `null`.
- **Album art**: the backend (never the browser) downloads `art_url` in the background: max 2 MB,
  JPEG/PNG/WebP only (Content-Type and the file's magic bytes must agree), cached in
  `/data/art/<sha1 of the URL>.<ext>` (at most 200 files / 50 MB, least recently used dropped),
  served at `GET /api/art/<id>` with a one-year immutable cache header. A failed URL is retried after
  10 minutes at the earliest.

**Spotify** (`type = "spotify"`). Polls `GET /v1/me/player/currently-playing?additional_types=episode`
every 5 s while playing and every 30 s otherwise; 204 = nothing playing; ads show as nothing playing;
401 refreshes the access token and retries once; 429 waits for `Retry-After`; other errors back off
(30 s doubling to 10 min). Only the OAuth credentials Spotify requires are sent, and none of them ever
appear in logs or `/api/sources`. One-time setup, on a PC with a browser (not in the container):

1. <https://developer.spotify.com/dashboard> -> **Create app**. Any name/description. **Redirect URI:
   `http://127.0.0.1:8888/callback`** (exactly). Tick **Web API**. Save, then *Settings* -> copy the
   **Client ID** and **Client secret**.
2. While the app is in *Development mode* only allow-listed accounts can use it: *User Management* ->
   add the name and email of your own Spotify account.
3. From the repo root: `python scripts/spotify_auth.py --client-id <client id>` (standard library
   only; it prompts for the secret, or reads `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`). It opens
   the consent page, listens on `127.0.0.1:8888` for the redirect (a random `state` guards against
   CSRF), exchanges the code and prints:

   ```toml
   SPOTIFY_CLIENT_ID = "..."
   SPOTIFY_CLIENT_SECRET = "..."
   SPOTIFY_REFRESH_TOKEN = "..."
   ```
4. Paste those into `config/secrets.toml`, replace the demo `music` source in `config/config.toml`
   with:

   ```toml
   [[source]]
   name = "music"
   type = "spotify"
   client_id = "${SPOTIFY_CLIENT_ID}"
   client_secret = "${SPOTIFY_CLIENT_SECRET}"
   refresh_token = "${SPOTIFY_REFRESH_TOKEN}"
   ```
   and `docker compose up -d`. Check `GET /api/sources` (`music` -> `status.extra.state`).

Scopes: `user-read-currently-playing user-read-playback-state` (read-only). Revoke any time at
<https://www.spotify.com/account/apps/>.

**Last.fm** (`type = "lastfm"`): works with any player that scrobbles. Get an API key at
<https://www.last.fm/api/account/create> (put it in `secrets.toml` as `LASTFM_API_KEY`), then
`api_key = "${LASTFM_API_KEY}"`, `user = "<your username>"`. Polls `user.getrecenttracks` every 15 s;
the track flagged *now playing* becomes `now` (always `is_playing: true`, no progress or duration:
Last.fm does not know them), anything else is `null`. `art_url` is the largest image (the grey star
placeholder counts as none). The request carries the key and your public username.

**Push** (`type = "push"`): anything that knows what is playing can POST it.

```toml
[[source]]
name = "music"
type = "push"
ttl = "1m"            # re-push at least this often; a player that goes quiet disappears
```

```sh
curl -X POST http://<box>:8700/api/publish/music -H "Content-Type: application/json" \
     -d '{"key":"now","value":{"title":"Teardrop","artist":"Massive Attack","album":"Mezzanine",
          "is_playing":true,"progress_ms":81000,"duration_ms":330000}}'
curl -X POST http://<box>:8700/api/publish/music -H "Content-Type: application/json" \
     -d '{"key":"now","value":null}'                              # stopped
```

```powershell
$now = @{ key = "now"; value = @{ title = "Teardrop"; artist = "Massive Attack"; is_playing = $true } }
Invoke-RestMethod -Method Post -Uri http://<box>:8700/api/publish/music `
  -ContentType "application/json" -Body ($now | ConvertTo-Json -Depth 4)
# with [server] push_token set, add:  -Headers @{ Authorization = "Bearer $env:PUSH_TOKEN" }
```

`title` and `is_playing` are what matter; `artist`, `album`, `progress_ms`, `anchor_at` (when
`progress_ms` was true; default = the push time), `duration_ms`, `art_url`, `paused_since` and
`source` (shown as the element's `source`) are optional. Without `paused_since`, a paused value counts
as paused since its `anchor_at` / push. A pusher that re-sends often should keep `progress_ms` +
`anchor_at` fixed while playback is continuous, so re-sends are identical.

*Windows, any player (optional, best effort)*: `scripts/nowplaying_windows.py` reads the Windows media
session (the media-key overlay: Spotify desktop, browsers, foobar2000, VLC, Apple Music...) and pushes
it whenever the track or play state changes, plus every 20 s:

```powershell
uv run --with winsdk scripts/nowplaying_windows.py --wall http://<box>:8700
# if [server] push_token is set: --token <token>, or $env:AMBIENT_PUSH_TOKEN
```

It sends no album art (Windows exposes only a thumbnail stream).

**The `news` rule** (`[rules.news]`, outputs `rules.news.top` and `rules.news.critical`)

Drops items older than `max_age` (12h), ranks by priority (the source's `priority`, or an item's own
`priority`), then local relevance (`local_terms` in the title beats the summary only), then recency;
folds near-identical titles across feeds (normalised token sets, similarity = mean of Jaccard and
overlap coefficient >= `dedupe_threshold`, 0.75; the folded sources are listed in `also`); flags an
item `critical` when its title matches `critical_terms` (whole words, plural ok) or its priority is
`>= critical_priority` (10), and only while it is younger than `critical_max_age` (3h). `rules.news.top`
= the best `keep` (5) items, critical ones never cut: `[{title, source, link, published, summary?,
critical, priority, local, rank, also?}]` (`[]` when no fresh feed). `rules.news.critical` = any of
them critical. The wall's `news` element shows one: the top critical item pinned, else it rotates
through the first `rotate_top` (3) every `rotate_s` (60) seconds. Defaults:

| key | default |
|---|---|
| `inputs` | `["news*.items"]` |
| `every` | `"60s"` (outputs ttl 3 min) |
| `max_age` | `"12h"` |
| `keep` | `5` |
| `dedupe_threshold` | `0.75` |
| `local_terms` | none (list your town and region, e.g. `["Ottawa", "Gatineau"]`) |
| `critical_terms` | warning, evacuation, evacuate, emergency, tornado, lockdown, boil water, state of emergency, amber alert, shelter in place, hold and secure |
| `critical_priority` | `10` |
| `critical_max_age` | `"3h"` |
| `rotate_top` / `rotate_s` | `3` / `60` |

### Demo parts

The `demo` type emits, per part, exactly the keys and value shapes of the real adapter, so every wall
element and every ask panel has data with zero setup (`config.example.toml` runs one demo source per
part):

| part | source name in the example | keys (shape = real adapter) |
|---|---|---|
| `calendar` | `calendar` | `next`, `today` (ask, 3 fixed events today + the `next` event when it is today) = `ical` |
| `heartbeat` | `heartbeat` | `host.homelab`, `host.main-pc` = `ping` |
| `finances` | `finances` | `month`; `detail.expenses`, `detail.income` (ask, `[{group, amount}]`, expenses sum to `spent`) = `google_sheet_finances` with `detail = true` |
| `weather` | `weather` | `now.*`, `precip.*`, `forecast.daily` (ask, 7 days, open_meteo keys), `warnings` (ask, `[]`, or one envcanada-style description with `warnings = true`) |
| `news` | `news` | `items` (ask): 9 headlines from "CBC Ottawa" and "CBC News" (one cross-feed duplicate, local items); `news = "critical"` adds a tornado warning = `rss` |
| `music` | `music` | `now`: a 6-track playlist that loops (~29 min), progress advancing with the clock; track 3 pauses for 90 s (under the 2 min idle, so the wall shows it paused); `art_url` null; `music = "none"` = nothing playing = `spotify` |
| `pulse` | `github` (`parts = ["pulse"]`) | `repo.demo/ambient-wall`, `repo.demo/homelab`, `repo.demo/dotfiles`, `pulse` (all ask; one dormant) = `github` |

## Secrets

Never put a token in `config.toml`. Put it in `config/secrets.toml` (gitignored, a flat table):

```toml
CALENDAR_ICS_URL = "https://calendar.google.com/calendar/ical/.../basic.ics"
GITHUB_TOKEN = "github_pat_..."
SPOTIFY_CLIENT_ID = "..."             # printed by scripts/spotify_auth.py
SPOTIFY_CLIENT_SECRET = "..."
SPOTIFY_REFRESH_TOKEN = "..."
```

and reference it as `"${GITHUB_TOKEN}"` anywhere in a string value. Environment variables work too
(secrets.toml wins). A source whose `${NAME}` is missing is disabled with a warning naming the
variable; resolved values are scrubbed from logs and `/api/sources`. Credential *files* (the Google
service-account key) go in `config/` and are referenced by name.

## Getting it onto the wall

A new source fills the pool; check it with `GET /api/signals?pattern=solar.*` and `GET /api/sources`
(status, last error). The wall itself stays deliberately sparse: an element glows only if it is bound in
`[wall]` (e.g. `weather_condition = "weather.now.condition"`; rename a source -> update its binding)
or if a rule turns your signal into one of the wall's derived signals. To make something new
*actionable* ("backup failed" -> flare), write a rule (`ambient/rules/`, or a `@rule` in a plugin file)
that reads your signal and publishes into an existing wall element. New wall elements need a theme
change too; see `docs/THEMES.md`.
