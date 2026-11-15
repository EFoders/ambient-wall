# Backend architecture

```
[sources] --emit--> [pool] --change--> [rules] --derived signals--> [pool]
                       |
                       +--change (debounced)--> [wall projection] --WebSocket--> browser (frontend/)
                       +--REST (/api/signals, /api/wall, /api/sources)
[anyone on the LAN] --POST /api/publish/<source>--> [pool]      (push sources)
```

## Everything runs in containers

Run: `docker compose up -d --build` from the repo root. The wall is `http://<box>:8700/` (the backend serves `frontend/`).

| path (host) | in container | what |
|---|---|---|
| `compose.yaml` (repo root) | | service `wall`; later services (ollama, voice) are added here, never installed on the host |
| `backend/Dockerfile` | | build context = repo root. uv-based slim Python image, non-root user, `iputils-ping`, copies `backend/` to `/app` and `frontend/` to `/app/frontend` |
| `config/` | `/config` (rw: the setup wizard writes it once) | `config.toml` + `secrets.toml` (gitignored, like everything in `config/` but the example), `config.example.toml` (committed). Missing `config.toml` = run on the example with the `demo` source and offer the setup wizard |
| `plugins/` | `/app/plugins` (ro) | drop-in Python adapters/rules |
| `scripts/` | `/app/scripts` (ro) | programs for `type = "command"` sources (Python is in the image; other runtimes = extend the image) |
| named volume `wall-data` | `/data` | SQLite history, caches, `file` sources (`/data/...`) |

Env inside the container: `AMBIENT_CONFIG_DIR=/config`, `AMBIENT_DATA_DIR=/data`, `AMBIENT_FRONTEND_DIR=/app/frontend`, `AMBIENT_PLUGINS_DIR=/app/plugins`, `TZ` from config/compose. Paths in config are relative to `/data` unless absolute.
`cap_add: [NET_RAW]` for ICMP ping. Healthcheck hits `/api/health`. `restart: unless-stopped`. A `compose.dev.yaml` override bind-mounts `frontend/` and `backend/ambient/` and runs uvicorn with `--reload` for live editing.

Dev without Docker (fast inner loop, tests): `cd backend && uv run pytest`, `uv run ambient` (same env vars, defaulting to `../config`, `./data`, `../frontend`, `../plugins`).

## Fixed interfaces (do not change without updating every caller)

| module | what |
|---|---|
| `ambient/signal.py` | `Signal`, `SignalLike`, `coerce()`, `infer_type()` — the data contract (SPEC 2.2) |
| `ambient/pool_view.py` | `PoolView` protocol: `get(id)`, `query(glob)` (stale hidden by default) |
| `ambient/adapters/base.py` | `Adapter`, `AdapterContext`, `AdapterStatus`, `@register(type)`, `REGISTRY` |
| `ambient/rules/base.py` | `@rule(name, inputs=[globs], every=s)`, `RULES` |
| `ambient/util.py` | `parse_duration("5m")` |

Signal id = `"<source>.<key>"`. Keys are dotted, lowercase, e.g. `host.homelab`, `month`, `next`.

## Module ownership

| module | owns |
|---|---|
| `ambient/pool.py` | in-memory pool (implements PoolView + `publish()` + `subscribe()`), SQLite history in `data/history.db` (append-only, prune by age) |
| `ambient/config.py` | load TOML, `${NAME}` secret interpolation (from `secrets.toml`, then env vars), validation with clear errors |
| `ambient/loader.py` | import built-in adapters/rules + every `*.py` in the plugins dir |
| `ambient/scheduler.py` | instantiate adapters from config, run each as a task, record status, run rules on change + on their interval |
| `ambient/server.py`, `__main__.py` | FastAPI app, WebSocket, REST, push endpoint, static frontend |
| `ambient/adapters/*.py` | built-in source types |
| `ambient/rules/*.py` | built-in rules |
| `ambient/wall.py` | projection: pool -> the exact `signals` object the frontend themes consume |
| `ambient/art.py` | album-art cache (`/data/art`, LRU) behind `GET /api/art/{id}` |

## config.toml

```toml
[server]                          # in-container bind; publish a different host port in compose if needed
host = "0.0.0.0"
port = 8700
push_token = "${PUSH_TOKEN}"     # optional; if set, POST /api/publish needs header  Authorization: Bearer <token>

[location]
name = "Ottawa"
lat = 45.4215
lon = -75.6972
timezone = "America/Toronto"

[mode]                            # mirrors frontend/js/config.js; sent to the browser in "hello"
work_start = "07:00"
work_end = "17:00"
work_days = [1, 2, 3, 4, 5]
transition_seconds = 8

[display]
theme = "cyberpunk"
hour24 = true

# ---- sources: one table per instance. name = Signal.source. type = adapter type.
# Common keys every source accepts: every (duration), ttl (duration), visibility ("wall"|"ask"), enabled (bool)

[[source]]
name = "heartbeat"
type = "ping"
every = "30s"
hosts = { homelab = "192.168.1.10", main-pc = "192.168.1.20" }

[[source]]
name = "weather"
type = "open_meteo"
every = "10m"

[[source]]
name = "calendar"
type = "ical"
url = "${CALENDAR_ICS_URL}"       # Google Calendar "secret address in iCal format": read-only, no OAuth
every = "5m"

[[source]]                        # any JSON API, no code: map dotted paths to keys
name = "solar"
type = "http_json"
url = "http://192.168.1.50/api/status"
every = "1m"
map = { "power.now" = "data.watts", "battery.pct" = "data.battery.percent" }

[[source]]                        # a file anyone can write by hand or from a script (.json / .csv / .toml), relative to /data
name = "notes"
type = "file"
path = "notes.json"                # relative to /data

[[source]]                        # any program in any language that prints JSON lines
name = "backup"
type = "command"
command = ["python", "backup_status.py"]   # runs in /app/scripts; "python" = the backend interpreter
every = "15m"

[[source]]                        # phones, other boxes, scripts: POST /api/publish/phone
name = "phone"
type = "push"
ttl = "30m"

# ---- rules: per-rule config. Common keys every [rules.<name>] accepts: enabled (bool), every (duration),
# ttl (duration, default 3 x every), inputs (list of globs; overrides the decorator, e.g. after renaming a source)
[rules.heartbeat_down]
after = "2m"

[rules.finance_mood]
drift_ratio = 0.85                # spent/income above this = drift; above 1.0 = warning

# ---- wall bindings: which pool signals feed which wall element (defaults shown)
[wall]
calendar = "calendar.next"
calendar_advice = "rules.calendar.advice"       # leave_early advice; replaces weather.actionable when fresh ("" = off)
heartbeat = "rules.heartbeat.*"
heartbeat_raw = "heartbeat.host.*"              # raw probes, used for hosts the rule hasn't covered yet
finances = "finances.month"
finance_mood = "rules.finances.mood"
weather_temp = "weather.now.temp_c"
weather_actionable = "rules.weather.actionable"
weather_condition = "weather.now.condition"     # clear|cloudy|fog|rain|storm|snow
weather_intensity = "weather.now.intensity"     # 0..1
weather_wind = "weather.now.wind_kph"
news = "rules.news.top"                 # ranked headline list from the news rule; the projection picks one
now_playing = "music.now"            # current track from a spotify / lastfm / push source named "music"
```

## Simple formats for adding a source (no Python needed for the first four)

1. **file** — drop JSON/CSV/TOML in `data/`. JSON: `{"key": value, ...}` or `[{"key":..., "value":...}]`. CSV: `key,value[,type]`. Re-read when the file changes.
2. **push** — `POST /api/publish/<name>` with `{"key": "battery", "value": 81}` or a list of those.
3. **http_json** — any JSON endpoint + a `map` of `key = "dotted.path"`.
4. **command** — any program printing one JSON object per line (`{"key":..., "value":...}`) or one JSON object/array.
5. **Python adapter** — one file in `plugins/` with `@register("type")`. See `adapters/base.py` docstring.

## Wall projection (`ambient/wall.py`)

`project(pool: PoolView, now: datetime, cfg: dict) -> dict` returns exactly the shape `frontend/js/core.js` builds in `signals()`, minus `time` and `daylight` (the browser computes those locally from location). Dates are ISO 8601 strings with offset; the browser revives them to `Date`.

```json
{
  "calendar":  { "next": { "title": "Ops sync", "start": "2026-10-09T16:27:00-04:00" } },
  "heartbeat": [ { "host": "homelab", "up": false, "downSince": "2026-10-09T15:36:00-04:00" } ],
  "finances":  { "income": 6420, "spent": 3985, "net": 2435, "balance": 20675,
                 "lastUpdated": "2026-10-08T17:00:00-04:00", "mood": "calm" },
  "weather":   { "tempC": 6, "actionable": "Rain in 20 min", "condition": "cloudy", "intensity": 0.8, "windKph": 12 },
  "nowPlaying": { "title": "Teardrop", "artist": "Massive Attack", "album": "Mezzanine", "isPlaying": true,
                 "progressMs": 81000, "durationMs": 330000, "updatedAt": "2026-10-09T21:14:05-04:00",
                 "source": "spotify", "art": "/api/art/3f9a…" },
  "news":      { "headline": "Ottawa council approves new transit line", "source": "CBC Ottawa",
                 "published": "2026-10-09T15:05:00-04:00", "critical": false, "rank": 1, "count": 3 },
  "stale":     ["finances"]
}
```

- A missing element is `null` (`calendar.next` null when nothing upcoming), never a placeholder (THEMES.md: missing value = not drawn).
- `weather.condition` is always one of clear, cloudy, fog, rain, storm, snow (adapters map their own codes onto these); it drives the ambient scenes, so `weather` is non-null whenever any weather input is fresh, even with `actionable` null.
- `minutesUntil` is NOT sent: the browser derives it from `start` every frame.
- `stale` lists elements whose newest input signal is stale (themes may dim them; optional).

## WebSocket `/ws`

Server -> client, JSON text frames:

| type | when | body |
|---|---|---|
| `hello` | on connect | `{"type":"hello","version":1,"settings":{"location":{...},"mode":{...},"display":{...}}}`, plus `"setup":{"needed":true}` while there is no `config.toml` (the wall then opens the setup wizard) |
| `wall` | on connect, then on any change (debounced 250 ms), and at least every 30 s | `{"type":"wall","ts":"...","signals":{...projection...}}` |
| `command` | when triggered (REST below, later voice) | `show`: `{"type":"command","name":"show","args":{"panel":"forecast","duration":20,"data":{...panel...}}}` · `dismiss`: `{"name":"dismiss"}` · `set_theme`: `{"args":{"theme":"nature"}}` · `set_mode`: `{"args":{"mode":"work"|"ambient"|"auto"}}` · `set_sound`: `{"args":{"on":true,"volume":0.4}}` · `set_cat`: `{"args":{"on":true,"coat":"ginger"}}` |

Client -> server: nothing required. Clients reconnect with backoff.

## REST

| method | path | |
|---|---|---|
| GET | `/api/health` | `{"ok":true}` |
| GET | `/api/wall` | current projection (same as the `wall` message) |
| GET | `/api/signals?pattern=heartbeat.*&stale=1&visibility=ask` | raw signals |
| GET | `/api/sources` | each source: type, every, status (last_ok, last_error, signals_emitted) |
| POST | `/api/publish/{source}` | push; `source` must be a configured `type = "push"` source |
| GET | `/api/ask` | panel list with availability: `[{"panel":"forecast","available":true}, ...]` |
| GET | `/api/ask/{panel}` | one panel's data (404 unknown panel, 200 with `null` if no data) |
| POST | `/api/show/{panel}` | build the panel and broadcast `show` to every client. Body optional `{"duration": 20}`. 404 unknown; 200 `{"shown": false, "reason": "no data"}` if empty |
| POST | `/api/dismiss` | broadcast `dismiss` |
| POST | `/api/command` | `{"name": "set_theme"|"set_mode"|"set_sound"|"set_cat", "args": {...}}`, validated, broadcast. `set_sound` args: `on` (bool) and/or `volume` (0..1), at least one; only the given keys are broadcast. `set_cat` args: `on` (bool) and/or `coat` (tabby, ginger, black, grey, tuxedo, calico, siamese, white), likewise |
| GET | `/api/setup` | first-run state: whether setup is needed, which secret names already exist (never values) |
| POST | `/api/setup/geocode` · `/api/setup/ec-site` · `/api/setup/test-feed` · `/api/setup/preview` | wizard helpers: city search (Open-Meteo geocoder), nearest Environment Canada sites, one test fetch of a feed, the config it would write. First run only (409 after) |
| POST | `/api/setup` | validate (the same `load_config`), write `config.toml` + `secrets.toml` atomically, hot-reload the runtime. First run only (409 after). See [SETUP.md](SETUP.md) |
| GET | `/api/art/{id}` | cached album art (`id` = 40 hex chars, sha1 of the source URL); 404 otherwise. `Cache-Control: public, max-age=31536000, immutable` |

All POSTs (incl. `/api/publish`) share one guard, in order: bearer `push_token` if set (401; 503 if the secret is unresolved) → `Content-Type: application/json` required even for an empty body (415; forces a CORS preflight) → 64 KB body limit (413) → JSON parse (400). Auth runs before any 404. GETs need no token.

**Show replay:** the server keeps the last `show` until it expires, is dismissed or is replaced, and replays it to a client that connects in that window (right after `hello` + `wall`, with `duration` reduced to the time left). `set_theme` / `set_mode` are not replayed. **Fan-out:** each socket has a bounded outbox (32 frames); a client that falls behind is closed with code 1013 and reconnects. Voice and other in-process callers use `ambient/commands.py` (`show`, `dismiss`, `set_theme`, `set_mode`, `clear_override`) instead of HTTP.


## News (`type = "rss"` sources + the `news` rule)

- **rss adapter**: RSS 2.0, RSS 1.0 (RDF) and Atom, parsed with defusedxml (entity declarations refused). Options `url` (required), `label` (defaults to the feed title), `priority` (0), `max_items` (20), `summary_chars` (280), `timeout` ("15s"), `max_bytes` (2000000, enforced while streaming), `every` ("15m"). Conditional GET (304 re-emits the last items). Emits `items` (series, visibility "ask"): `[{title, link, published ISO, source, summary?}]`, newest first. Errors name only the host. Pull only.
- **news rule** (`[rules.news]`): inputs every `*.items` signal from rss sources (glob `news*.items` by default; source names starting with `news`). Drops items older than `max_age` ("12h"), dedupes near-identical titles across feeds, ranks by priority, then local relevance (`local_terms`, place names, default none), then recency. `critical` when a title matches `critical_terms` (default: warning, evacuation, emergency, tornado, lockdown, boil water, state of emergency, amber alert…) or comes from a source with `priority >= critical_priority` (default 10). Emits `news.top` = ranked list (max `keep`, default 5; a critical item is never cut, it replaces the lowest non-critical one) and `news.critical` (bool). `critical_max_age` ("3h") stops an old item staying pinned. `rotate_top` / `rotate_s` for the projection also live in `[rules.news]`.
- **projection**: `news` = one item. A critical item is pinned. Otherwise rotate through the top `rotate_top` (3) every `rotate_s` (60 s), as a pure function of `now`. `null` when no fresh items.

## Ask panels (`ambient/ask.py`)

`PANELS` registry; `build_panel(name, pool, now, cfg) -> dict | None`. Every panel: `{"panel", "title", "ts", ...}`.

| panel | body | source signals |
|---|---|---|
| forecast | `days: [{date, label, hiC, loC, condition, pop?, precipMm?}]` (up to 7) | `weather.forecast.daily` |
| calendar | `events: [{title, start, end, allDay, location?}]` (today, local) | `calendar.today` |
| pulse | `repos: [{name, lastCommit, message?, pushedAt, status: "alive"\|"dormant"}]` | `github.*` |
| finance | `income, spent, net, balance, mood, month, categories: [{name, amount, kind}]` | `finances.month`, `finances.detail.*`, `rules.finances.mood` |
| news | `items: [{headline, source, published, critical}]` (top 5) | `rules.news.top` |
| warnings | `items: [{headline, severity?, issued?, expires?}]` | `weather.warnings` |

Panel input ids are configurable under `[ask.<panel>]` the same way `[wall]` bindings are (an id set to `""` is off; any panel also takes `enabled = false` and `title`). A panel is `null` when its main input is missing or stale. Empty lists: forecast, pulse and news return `null`; calendar and warnings return the panel with `[]` ("nothing today" and "no warnings" are real answers). `forecast.days[].date` is a plain local `YYYY-MM-DD` (do not parse as UTC); `hiC`/`loC` may be null. `finance` also carries `lastUpdated`. Plugins can add panels with `@ask.panel(...)`. Other dates are local-offset ISO. Ask panels MAY read `visibility="ask"` signals (that's their purpose); the wall projection never does.



## Now playing (`type = "spotify"` / `"lastfm"` / push)

- **spotify adapter**: Spotify Web API `GET /v1/me/player/currently-playing` with the OAuth refresh-token flow. Secrets: `client_id`, `client_secret`, `refresh_token` (`${SPOTIFY_*}` in secrets.toml). Scopes: `user-read-currently-playing user-read-playback-state`. Polls adaptively (about 5 s while playing, 30 s when idle). Handles 204 (nothing playing), 401 (refresh and retry once) and 429 (honours Retry-After). Emits `now` = `{title, artist, album, is_playing, progress_ms, anchor_at, duration_ms, track_id, art_url, kind, paused_since?, device?}` or `null` (`paused_since` while paused; meta `{"provider": "spotify"}`). Pull only: the only things sent out are the auth tokens Spotify requires.
- **One-time login**: `scripts/spotify_auth.py` prints the authorise URL, catches the callback on `http://127.0.0.1:8888/callback`, exchanges the code and prints the refresh token to paste into `config/secrets.toml`.
- **lastfm adapter** (works with any player that scrobbles): `user.getrecenttracks` with `api_key` + `user`; the item flagged `nowplaying` becomes `now` (no progress data).
- **Push**: any player or script can `POST /api/publish/music` `{"key":"now","value":{title, artist, album?, is_playing, progress_ms?, anchor_at?, duration_ms?}}`. Without `anchor_at`, the push time is the anchor.
- **Progress is an anchor, not a live value**: `progress_ms` is the position at `anchor_at` (ISO, ms). Both stay fixed while playback is continuous, so steady playback re-emits an identical value: the pool only refreshes ts (no history row, no wall broadcast; the 30 s keepalive resend carries the same anchor). Adapters (spotify, demo, the Windows push helper) re-anchor, i.e. emit a new value, only when the track changes, `is_playing` flips, `duration_ms` changes, or the observed position is more than 2.5 s from `progress_ms + (now - anchor_at)` (a seek, buffering). Shared helper: `adapters/_shared.ProgressAnchor`.
- **Album art**: the backend fetches `art_url` (pull), caches it under `/data/art/<sha1>.jpg` (size-capped, LRU), and serves `GET /api/art/<id>`. The projection's `art` is that local path, so the browser never contacts Spotify.
- **projection**: `nowPlaying` from `[wall] now_playing`. `isPlaying` false for more than `[wall] now_playing_idle` (default "2m", counted from the value's `paused_since`, else `anchor_at`, else the signal's ts) → `null` (the element disappears); stale → `null` and listed in `stale`. `progressMs` = the anchored `progress_ms` and `updatedAt` = the value's `anchor_at` (else the signal's ts; an `anchor_at` later than the ts is ignored), local ISO with milliseconds. The browser draws `progressMs + (now - updatedAt)` while `isPlaying`, clamped to `durationMs`. `source` = the value's `source`, else meta `provider`, else the source name.
- **sound**: `[display] sound` (false), `volume` (0.4), `sound_work` (0.0, the work-mode volume) go to the browser in `hello`; `set_sound` changes them live.
- **cat**: `[display] cat` (false) and `cat_coat` ("tabby") go to the browser in `hello` (a wall where someone pressed K keeps its own choice); `set_cat` changes them live on every wall.

## Setup wizard

On a fresh install (no `config/config.toml`) the wall page opens a first-run setup wizard (`frontend/setup.html`, `backend/ambient/setup.py`) that writes `config/config.toml` and `config/secrets.toml` and then hot-reloads the runtime in process (`server.py` `reload_runtime`: walls are told to reconnect, the scheduler, pool and hub restart on the new config). Once `config.toml` exists every setup write endpoint answers 409. `AMBIENT_SETUP=0` disables the wizard. Details: [SETUP.md](SETUP.md).

## Privacy (SPEC 1.4)

Pull only. Adapters never put personal data in outbound requests. Credentials live in `config/secrets.toml` / env, never in `config.toml`, never logged. Everything in `config/` except `config.example.toml`, and `backend/data/`, is gitignored.
