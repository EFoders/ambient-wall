# Ambient Wall: Project Spec

Scattered signals from one person's day (calendar, weather, machines, money, news) fused onto one glowing surface, projected on an office wall. Not a dashboard. An installation that happens to be useful.

This is the original design spec. It is written in the first person: read "I" and "my" as the wall's owner. Status: v1 spec, settled 2026-10-09. Most of it is built (see the [README](../README.md)); voice and the local LLM router (section 6, build order steps 8-9) are not built yet, and the wall grew ten themes, daytime scenes, sound and a cat beyond what is described here.

---

## 1. Core principles (non-negotiable)

1. **Ingest wide, display narrow.** Many signals flow into a central pool. A ruthless display layer decides what actually glows. Richness lives underneath; the wall stays sparse.
2. **The wall filter.** An element earns wall space only if glancing at it changes what I do next, or makes me feel something. Five or six elements, not ten. Installation, not dashboard.
3. **Glowing on void.** Near-total black background (`#000` or within a few points of it). Only active elements emit light. In a dark room, projector black is effectively nothing, so elements float on the wall. Never bright. **No white.** Inactive or unused elements are not rendered at all.
4. **My data stays on my network.** Data may *enter* the network; my data never *leaves* it. Outbound requests are allowed only to pull data in. No adapter ever sends personal data out in a request body, query, or upload. Pull, never push. No cloud AI, no external AI APIs. Auth tokens and credentials are stored locally only.
5. **Hardware decoupled.** Runs full-screen in a browser on any machine. The projector is a dumb display added later. Driving machine (homelab, mini PC, current PC) is not a v1 decision.
6. **Easy to add sources.** Adding a data source must mean writing one small adapter and nothing else. No changes to the core.

---

## 2. Architecture: three independent layers

| Layer | Question it answers | Examples |
|---|---|---|
| **Data pool** | What is known? | time, calendar, finances, heartbeat, weather |
| **Mode** | What is the wall's job right now? | work, ambient |
| **Theme** | How do facts get rendered? | cyberpunk, nature, classical |

Any combination is valid: cyberpunk + work, nature + ambient, classical + ambient. The layers must not know about each other's internals.

```
 [Source adapters] --publish--> [Signal pool] --> [Rules engine] --derived signals--> [Signal pool]
                                      |
                                      +--subscribe--> [Display layer: mode x theme] --> browser full-screen
                                      |
                                      +--query--> [Local AI: voice + LLM router] --> tools (show/switch/query)
```

### 2.1 Spine: publish-subscribe

Sources **publish** signals to the pool. The display **subscribes** to what it cares about. A future phone app or networked device is just another publisher (TAK-style extensibility). Design v1 with this shape even though v1 sources are all local.

### 2.2 Data contract

Every source emits the same shape, no matter what it is. The pool never knows or cares where a signal came from.

```json
{
  "source": "finances",
  "key": "month.net",
  "value": 412.50,
  "type": "number",
  "ts": "2026-10-09T21:14:00-04:00",
  "ttl_s": 3600,
  "visibility": "wall",
  "meta": { "last_updated": "2026-10-08" }
}
```

| Field | Meaning |
|---|---|
| `source` | Adapter name |
| `key` | Signal identifier, namespaced by source |
| `value` | The payload (number, string, object) |
| `type` | `number`, `string`, `status`, `event`, `series`, `object` |
| `ts` | When the value was observed |
| `ttl_s` | How long it stays valid; stale signals are flagged or dropped |
| `visibility` | `wall` (eligible to glow) or `ask` (pool only, surfaced on request) |
| `meta` | Free-form extras |

### 2.3 Adapters

One adapter per source. Each adapter:
- fetches or receives raw data its own way,
- normalizes to the contract,
- publishes on a schedule or on push,
- is registered via config, not code changes to the core.

Adding a source = drop in an adapter file + one config entry.

### 2.4 Fusion: rules first, not AI

Most fused insights are plain rules. Rules read signals from the pool and publish **derived signals** back into it (same contract, `source: "rules"`). Fast, free, predictable, no model.

Example rules:
- Calendar event in < 60 min AND precipitation expected around then -> "leave early"
- Machine heartbeat missing for > N min -> heartbeat flares
- Month spend > month income -> finance mood shifts to warning colour

Rules are the fusion backbone. The LLM is not.

---

## 3. Modes

The axis between modes is **temperature and behaviour, not brightness.** Both modes live on near-total black, both sparse, neither ever bright.

### 3.1 Work mode
- **Job:** situational awareness. Glance and know the state of the day and systems.
- **Palette:** cool. Cyan, cold green. No white.
- **Behaviour:** thin sharp lines, elements hold still and report. Command post. Purposeful.
- **Emphasis:** a rare flare of amber or red for something genuinely urgent. Used almost never; rarity is what makes it register.

### 3.2 Ambient mode
- **Job:** be beautiful. The wall stops informing and starts breathing.
- **Content:** information drops to almost nothing (time, faintest state). Motion and atmosphere take over. Day shape and daylight are the star.
- **Palette:** warm or deep. Amber, deep blue.
- **Behaviour:** dynamic, slow drifting, alive. A living painting that knows the time.

### 3.3 Switching
- Time-based automatic switch. **Mode hours are configurable** (config file), e.g. work 07:00 to 17:00.
- Manual override, which persists until the next scheduled boundary or until cleared.
- **Override UI is configurable**: voice command always available; additional triggers (hotkey, etc.) set in config.
- **The transition is a moment.** At cutoff the wall exhales: elements fade, palette warms, motion slows over several seconds. It should tell me work is over.

### 3.4 Two faces per element
Every element is designed twice: a work face and an ambient face. Example: heartbeat is a status dot in work mode, a slow pulse in ambient.

---

## 4. Themes

- A theme is purely a rendering layer. Same fact, different skin. The clock is a digital readout in cyberpunk, carved numerals in classical, vines forming digits in nature.
- Themes must be pluggable: a new theme is a new module implementing the render interface for each element x mode. No data or mode logic inside themes.
- **Nature theme (ambient), "reclaiming":** time-driven growth. Vines and nature overgrow the wall over the evening; growth is a function of elapsed time in ambient mode. Switching to work mode clears it, sharp and ordered again.
- Planned themes: **cyberpunk**, **nature**, **classical**. More later.

---

## 5. Signals: v1 scope

### 5.1 On the wall

| Element | What shows | Source | Notes |
|---|---|---|---|
| **Clock** | Current time | System | Primary element. Big. First build milestone. |
| **Time and daylight** | Where I am in the day, daylight remaining | Local computation (sunrise/sunset from lat/long, no API needed) | Carries ambient mode. |
| **Calendar** | Next thing up | Google Calendar (read-only API) | The anchor. Pull only. |
| **Machine/server heartbeat** | One pulse per host: calm when fine, flares when down | Local network ping | v1 hosts: homelab server + main PC. **Down = no ping response for ~2 min** (threshold configurable). Host list in config. No CPU graphs. |
| **Finances** | Made vs spent this month, current month balance, last updated, mood colour | Google Sheet (read-only API) | Colour = state. Deeper detail is ask-only. Pull only. |
| **Weather** | Actionable sliver only ("rain in 20 min", "-20 C, dress for it") | Any free source. Default: Environment Canada public feed (free, no key). Open-Meteo as fallback. | Metric/Celsius. Hidden when nothing actionable. |

### 5.2 Ask-only (in the pool, never glowing unless requested)

| Signal | Behaviour on ask |
|---|---|
| Full weather | 7-day forecast displayed temporarily |
| News | Top critical item only. Never a ticker, never ambient. |
| Project pulse | **GitHub activity** on a configurable list of repos: last commit, recent pushes, alive or dormant. Read-only; token stored locally. Non-git projects out of scope. |
| Finance detail | Exact figures, breakdowns |

Ask-only displays appear temporarily, then fade back to the base wall.

### 5.3 Parked (not v1)
- Phone data: location, phone state. Realistic path is a phone app that **pushes** to the backend.
- Networked device push/pull (TAK-style) as a general mechanism.
- Fitness / biometrics: out.

---

### 5.4 Finance source layout

Workbook: "Annual budget <year>" Google Sheet. A new file each year: **the location (file ID) changes, the format does not.** The file ID lives in config (`finances.sheet_id`), so a new year is a one-line config change.

Adapter reads the **Summary** sheet only for wall values:

| Row | Label (col C) | Use |
|---|---|---|
| 22 | month headers (D-O) | Jan to Dec, used to locate the current month column |
| 23 | Income | made this month |
| 24 | Expenses | spent this month |
| 25 | Net savings | made minus spent |
| 26 | Ending balance | current month balance |

- Month columns: D (Jan) through O (Dec). P = Total, Q = Average.
- Current month column = D + (month - 1).
- **Last updated** = the file's Drive modified time (read-only metadata), not a cell.
- **Mood colour:** net >= 0 and on pace = calm; net < 0 = warning. Exact thresholds in config.
- Ask-only detail reads the **Expenses** and **Income** sheets (category groups with a "Monthly totals" row, same D-O month columns).
- Row/column positions are in config too, in case the template ever shifts.

---

## 6. AI: fully local

| Component | Choice | Role |
|---|---|---|
| Wake word | Local wake-word engine (e.g. openWakeWord) | Wakes the system; nothing recorded or sent before wake |
| Speech to text | Local Whisper variant (e.g. faster-whisper) | Ears |
| Talk to the wall | Small local LLM, 7-8B class (e.g. via Ollama) | Router, not a brain |

- The LLM is a **tool-using agent**: understand intent, pull context from the pool (RAG-style), call defined tools.
- v1 tools: `show_weather_forecast`, `show_news_top`, `query_finances`, `show_project_pulse`, `set_mode`, `set_theme`, `clear_override`.
- It does not need to reason deeply. Occasional misreads are acceptable.
- **Hardware:** 7-8B wants roughly 8 GB VRAM to be responsive. If the driving box can't (e.g. a Pi), drop the LLM and run voice + command grammar + rules. Still a complete product.
- No thinking model hosted locally. No cloud fallback.

---

## 7. Proposed tech stack (defaults, confirm before building)

- **Backend:** Python, FastAPI. Signal pool in memory with SQLite persistence for history.
- **Transport:** WebSocket push from backend to front end.
- **Front end:** single full-screen web page. Plain HTML + Canvas/SVG + JS. No heavy framework. Kiosk-mode browser.
- **Config:** one YAML/TOML file for sources, schedules, mode hours, override triggers, theme, monitored hosts and down threshold, GitHub repo list, location (lat/long for daylight and weather).
- **AI:** faster-whisper, Ollama.
- **Deployment:** runs on any box on the LAN; front end can be opened from a different machine than the backend.

---

## 8. Build order

1. **Glowing clock on black, full-screen.** Proves the front end, the aesthetic, and the projection look with zero data plumbing.
   - Acceptance: full-screen, pure black, large glowing time, updates every second, no visible UI chrome, cursor hidden, looks good in a dark room.
2. **Spine + data contract.** Pool, publish/subscribe, WebSocket to front end. Clock moves to being a signal.
3. **First real adapter.** Machine heartbeat or Google Sheet finances.
4. **Mode controller.** Work/ambient, time-based, override, transition animation.
5. **Theme layer.** One theme end to end (cyberpunk recommended first), then make it pluggable. Then nature with the reclaiming mechanic.
6. **Remaining v1 sources.** Daylight, calendar, weather.
7. **Rules engine.** Derived signals.
8. **Voice.** Local wake word (always listening, fully local, e.g. openWakeWord), then local Whisper for the command.
9. **Local LLM router** with the v1 tool set.

---

## 9. Display rules (for whoever writes the front end)

- Background black, always.
- Legible from across the room: big glyphs, few elements, no dense tables.
- Elements with no current value are not rendered (no empty frames, no placeholders).
- Motion draws the eye; use it sparingly in work mode, freely in ambient.
- No white. Brightest colour in normal operation is a mid cyan (work) or amber (ambient).
- Units: metric, Celsius, 24 h clock (confirm).

---

## 10. Decisions log (resolved 2026-10-09)

| # | Question | Decision |
|---|---|---|
| 1 | What does "local" mean? | My data never leaves the network. Inbound pulls are fine; outbound requests only to fetch. No adapter pushes personal data out. |
| 2 | Calendar source | Google Calendar, read-only. |
| 3 | Weather source | Any free source. Default Environment Canada, Open-Meteo fallback. |
| 4 | Heartbeat | Homelab server + main PC to start. Down = no ping for ~2 min. Both configurable. |
| 5 | Project pulse | GitHub activity on a configurable repo list. |
| 6 | Voice trigger | Wake word, fully local. |
| 7 | Mode hours and override | Both configurable. |

## 11. Still open

1. Driving machine (deferred; does not block v1).
2. Wake word phrase.
