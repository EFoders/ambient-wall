# Writing a theme

A theme is a pure rendering layer. It gets a `frame` of facts every animation frame and paints the entire canvas. It owns no data, no mode logic, no timers. A theme is one JavaScript file in `frontend/themes/`: Canvas 2D, no dependencies, no network.

## Quick start: your first theme

1. Create `frontend/themes/ember.js`:

   ```js
   // A minimal theme: a clock that is cool for work and warms for the evening.
   (function () {
     const U = AW.util;
     const COOL = U.hex("#2ad4e0"), WARM = U.hex("#e0a24a");
     AW.registerTheme({
       id: "ember",
       name: "Ember",
       render(ctx, f) {
         ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.width, f.height);      // rule 1: start from the black void
         const c = U.safe(U.mix(COOL, WARM, f.blend));                        // rule 2: chroma-safe, never white
         const px = Math.round(f.height * U.lerp(0.22, 0.12, f.blend));       // the hero clock recedes in ambient
         U.glowText(ctx, U.fmtTime(f.now), f.width / 2, f.height / 2, { font: `${px}px ui-monospace, monospace`, color: c, glow: 12 });
         const next = f.signals.calendar && f.signals.calendar.next;          // a missing value is not drawn
         if (next) U.glowText(ctx, `${next.title} · ${Math.round(next.minutesUntil)} min`, f.width / 2, f.height * 0.68,
           { font: `${Math.round(f.height * 0.035)}px ui-monospace, monospace`, color: c, alpha: 1 - f.blend, glow: 4 });
       },
     });
   })();
   ```

2. Load it in `frontend/index.html` (and `frontend/demo.html`), after the other themes and before `AW.boot()`:
   `<script src="themes/ember.js"></script>`.
3. Open `frontend/index.html?theme=ember` in a browser. Press `M` to flip between work and ambient (watch the 8 s exhale), `[` / `]` to move through the evening, `W` to cycle the weather, `H` for the debug HUD.
4. Check it: `uv run --with playwright --with pillow --with numpy python frontend/tools/shoot.py --channel msedge --theme ember` screenshots every state and checks the brightness rules; the test suite (see "Testing" below) picks up every registered theme automatically.

From there, the rest of this page is the contract: the `frame`, the hard design rules, the elements every theme renders, daytime, sound and the cat. The ten existing themes are full references (each is 1,600 to 3,200 lines); `stainedglass.js` and `orbit.js` are the shortest.

## Registering

```js
(function () {
  const U = AW.util;
  AW.registerTheme({
    id: "nature",            // used in ?theme=nature
    name: "Nature",
    init(ctx, env) {},       // env: { width, height, dpr }; build caches, offscreen canvases, seeds
    resize(env) {},          // rebuild size-dependent caches
    render(ctx, frame) {},   // paint EVERYTHING, every frame
    destroy() {},            // optional
  });
})();
```

`ctx` is a 2D context already scaled for devicePixelRatio. Work in CSS pixels (`frame.width`, `frame.height`).
**Start every render by filling the canvas** (opaque `#000`, or a translucent black for deliberate trails).

## The frame

| field | meaning |
|---|---|
| `t`, `dt` | real seconds since start, seconds since last frame. Use for animation. |
| `day` | 0 = night, 1 = full daylight (`daylight.light`, a civil-twilight ramp). Drives the day scene, the work backdrop and the brightness budget (rules 1-2). |
| `now` | `Date`, the (possibly simulated) current time. Use for clock and anything time-of-day. |
| `mode` | `"work"` or `"ambient"` (the target mode) |
| `blend` | 0 = fully work, 1 = fully ambient, eased. **Every element interpolates on this.** During the ~8 s transition it sweeps smoothly; this is the "exhale". |
| `transitioning` | true while blend is moving |
| `ambientElapsed` | seconds spent in the current ambient period (0 in work). Drives slow evolution such as overgrowth. Deterministic: reloading at 22:00 gives the same value. |
| `signals` | the facts, below |

### signals

```
time        Date
daylight    { sunrise: Date, sunset: Date, elevation: deg, light: 0..1, dayFraction: 0..1, isDay, lightLeftMin: number|null }
calendar    { next: { title, start: Date, minutesUntil } | null }
heartbeat   [ { host, up: bool, downSince: Date|null } ]
finances    { income, spent, net, balance, lastUpdated: Date, mood: "calm"|"drift"|"warning" }
weather     { tempC, actionable: string|null, condition: "clear"|"cloudy"|"fog"|"rain"|"storm"|"snow", intensity: 0..1, windKph } | null
news        { headline, source, published: Date, critical: bool, rank, count } | null   (one headline at a time; the backend rotates through the top few)
nowPlaying  { title, artist, album, isPlaying, progressMs, durationMs, updatedAt: Date, source: "spotify"|"lastfm"|..., art: url|null } | null   (core already advances `progressMs` every frame while isPlaying; read it directly, do NOT add elapsed time again. progressMs/durationMs may be null = no progress hairline)
```

**A missing value means the element is not drawn.** No empty frames, no placeholders. If `calendar.next` is null, no calendar. If `weather.actionable` is null, no weather text (the conditions still drive the ambient scene). If every host is up, the heartbeat is a quiet presence, never an alarm.

## Hard design rules

1. **Black void at night, real daylight by day.** At night (`frame.day` = 0) the background is pure black: only elements emit light, and on a projector in a dark room black is literally nothing. By day the room is lit and projector black reads grey anyway, so the scene may fill the wall with a real daytime sky and sunlit world (see "Daytime" below), easing back to the void through dusk.
2. **No white. Never bright.** Run every colour through `AW.util.safe()` (or stay under ~215 on any channel with real chroma); no pixel above 225, no near-white pixels, ever. Brightest resting colour: mid cyan in work (cyberpunk: orange-amber), amber in ambient. **Brightness budget** (mean luminance 0-255): `25 + 20 * frame.day`, i.e. under 25 at night and under 45 in full daylight. Large filled areas: alpha <= 0.12 at night, up to `0.12 + 0.28 * day` by day.
3. **Across-the-room legibility.** Big glyphs, few elements, no dense text, no tables. Clock is the hero (roughly 18-28% of screen height in work mode).
4. **Sparse.** A handful of elements, each earning its place (work face: clock, daylight, calendar, hosts, finances, weather sliver, one news line). Negative space is the design.
5. **Two faces per element.**
   - **Work mode:** situational awareness. Cool palette (cyan, cold green); cyberpunk is the deliberate exception (corporate amber/red/yellow, alarms stay hot red and pulse). Thin precise lines. Elements hold still and report. Command post. Urgent = a rare amber/red flare (heartbeat down, finance warning). Rarity is the point.
   - **Ambient mode:** be beautiful. Warm or deep palette (amber, deep blue). Information recedes to almost nothing: time plus the faintest state. Motion and atmosphere take over. Daylight and the shape of the day become the star. A living painting that knows the time. Calendar/finance/weather text should fade out or shrink to a whisper; a heartbeat failure still gets a soft warm pulse.
   - **Ambient weather is real.** The ambient scene shows what is actually happening outside, from `weather.condition` / `intensity` / `windKph`: clear, cloudy (intensity = few clouds to overcast), fog, rain (drizzle to downpour; wind slants it), storm (heavy rain + rare, dim, distant lightning; never a white flash), snow. Render it in the theme's own language (rain on the city, snow on the spruce, mist in the ruin, rain hissing on the fire, rain on the study window). Transitions between conditions ease over a few seconds, never snap. `weather` null = treat as clear.
6. **The transition is a moment.** As `blend` goes 0 to 1, the wall exhales: info elements fade and drift, palette warms, motion slows. Interpolate everything on `blend`, never snap.
7. **System fonts only** (no network). Mono: `ui-monospace, "DejaVu Sans Mono", "Cascadia Mono", Consolas, monospace`. Serif: `"Cormorant Garamond", "EB Garamond", Garamond, Georgia, "DejaVu Serif", serif`. Sans: `"Inter", "Segoe UI", "DejaVu Sans", system-ui, sans-serif`.
8. **Performance.** Must hold 60 fps on modest hardware for hours. Pre-render static layers to offscreen canvases; avoid per-frame allocation in hot loops; cap particle counts; shadowBlur is expensive, use it on few draws.
9. **No dependencies, no network, no DOM.** Canvas 2D only, one file in `themes/`.

## Elements every theme renders

| element | work face | ambient face |
|---|---|---|
| Clock | Hero. `U.fmtTime(now)` | Still present, softer, part of the painting |
| Daylight | Where we are in the day, light left (`lightLeftMin`) | The star: sky/light/atmosphere driven by `daylight` |
| Calendar | Next event + countdown ("Ops sync · 47 min") | Faded out, or a single whisper if < 30 min |
| Heartbeat | One mark per host; calm when up, amber/red flare when down | Faint slow pulse; warm soft flare if down |
| Finances | Made vs spent this month, net, last updated, mood colour | Gone, or a single faint mood glyph |
| Weather | Actionable sliver only, when present | Faint whisper or gone |
| Now playing | One small line "title — artist" (+ a progress hairline). Hidden when nothing is playing | A faint whisper, or a diegetic placement (the stereo display, a billboard, a bard's ballad) |
| News | One headline line + source and age (small). Truncate with `U.ellipsize` at word boundaries, never wrap past 2 lines. `critical` = the rare flare treatment (alarm colour, a slow pulse) | Gone. A `critical` item may whisper once, faintly |

## Testing

Open `index.html` (file:// = mock signals), or the backend's `http://<box>:8700/` (live signals over `/ws`; mocks until the first `wall` message). `?mock=1` forces mocks, `?backend=host:port` points at another backend. Dev keys `D W C N` switch a live wall to mock so every state stays testable; `L` toggles back. The HUD (`H`) starts with the source: `live`, `live (reconnecting)`, `mock`, or `mock (connecting)`. Other URL params: `?theme=<id>&mode=work|ambient&at=2026-10-09T21:30&warp=60&elapsed=<seconds in ambient>&hud=1&down=1&wx=0&cal=0&fin=calm|drift|warning`.
Dev keys: `1-9` theme, `T` next, `M` cycle mode override, `[ ]` ambient elapsed -/+30 min, `D` heartbeat down, `W` cycle weather (overcast, clear, partly, fog, drizzle, rain, storm, snow, cold; `?wx=<name>` picks one, `?wx=0` = clear), `C` calendar, `N` finance mood, `L` live/mock, `H` HUD, `F` fullscreen.

Projector boost: `G` cycles off / low / medium / high (a gamma shadow lift on the canvas for dim projectors; true black stays black; themes need nothing). `?boost=0-3`, config `[display] boost`; a choice made on the wall is remembered on that device.

Now playing: `P` cycles the mock track (playing, paused, long title, none; `?music=<name>`, `?music=0` = none); like `B` it switches a live wall to mock. Core advances `nowPlaying.progressMs` every frame while playing (clamped to `durationMs`), so read `progressMs` as is. Sound: `S` toggles (the first press also unlocks audio), `+`/`-` volume in steps of 0.1, `?sound=1` (`?sound=0` forces it off); like `O`, these work with `devKeys` off. The HUD shows `music playing 1:21/5:30` and `sound on 50% x1.00 default [rain room]` (state, volume, mode factor, level source: `theme` / `default` / `override`, active layers). `AW._debug.audio`: `override` (a `{layer: level}` object that replaces any soundscape), `levels` / `from` (what was fed last), `state()`, `meter(ms)` (master RMS / peak); `AW.audio.cue(name, opts)` plays a cue now; `AW.audio.renderOffline({seconds, levels, cues, samples})` renders the engine offline. In the HUD a layer marked `*` plays recordings ("Recordings" below).

News and overlay: `B` cycles the mock headline (top, critical, long, none; `?news=<name>` picks one, `?news=0` = none). `O` cycles the info overlay panels (live: `GET /api/ask/<panel>`, skipping panels `GET /api/ask` reports unavailable, mock data if the request fails; mock: mock data), `Esc` dismisses; both work even with `devKeys` off. `?show=<panel>` shows a panel on load, `?showfor=<seconds>` overrides every panel's hold. `AW._debug.overlay` is the overlay state (`panel`, `a`, `phase`, `show(panel, data?, {duration, instant})`, `dismiss()`, `mock(panel)`); `AW.overlay.info` is the last layout (`box`, `rows`, `empty`, resolved `style`).

Screenshots: `python3 tools/shoot.py --theme <id>` (no system Python: `uv run --with playwright --with pillow --with numpy python tools/shoot.py --channel msedge --theme <id>`) writes PNGs for work, ambient (early/late), the transition, the weather scenes, daytime (`day-morning|noon|golden|overcast|rain|snow|fog`, `work-day`, `work-dusk`), the news states (`work-news-critical`, `work-news-long`, `work-no-news`) and the overlay (`overlay-forecast|calendar|finance|news|pulse|warnings` in work, `overlay-ambient`) into `shots/`.

Automated suite (from `frontend/`, headless installed Edge, about 15 min): `uv run --with pytest --with pytest-timeout --with playwright --with pillow --with numpy pytest tests -q` (`-k <theme>` for one theme). It includes a smoke row per registered theme × {work, work + critical news, ambient, overlay over work, overlay over ambient, work at night, ambient day noon / golden / overcast / rain, work by day}: no page errors, max channel <= 225, no white, mean < `25 + 20 * day`, `render()` median < 8 ms, and HUD contrast over the day backdrop. It also checks that night work faces are unchanged with `day` forced to 0 (`AW._debug.forceDay`). The per-theme table prints at the end of the run. `tests/test_audio.py` covers the sound engine (every layer audible, level 0 silent, every cue a transient, the limiter ceiling, volume, the work-mode exhale, the default soundscape, storm thunder, a theme's `soundscape()`, the S / + / - keys, autoplay unlock, `?sound=`, hello and `set_sound`, and a CPU check); `tests/test_audio_samples.py` covers the recordings (manifest and files, every file decodes, sampled layers, lazy loading, release, live rotation, fallback, crossfade continuity, cue takes, thunder near / far, loon kind, bell count, the limiter, CPU); `tests/test_now_playing.py` covers `nowPlaying` (presets, P, live progress). `tests/test_boost.py` covers the projector boost (black stays black, darks lift, levels monotonic, G cycles and is remembered, works with dev keys off, render cost unchanged).

## Info overlay (ask-only panels)

The wall can briefly show detail it normally keeps underneath: the 7-day forecast, today's calendar, project pulse, finance detail, the top headlines and weather warnings. Core owns it (`js/overlay.js`). It is triggered by the backend (`POST /api/show/<panel>`, a WebSocket `command`, later voice), the `O` key (cycle panels; `Esc` dismisses) or `?show=<panel>`. It fades in, holds about 20 s, then fades out. Every frame it arrives as:

```
frame.overlay   { panel: "forecast"|"calendar"|"pulse"|"finance"|"news"|"warnings", data: {...}, a: 0..1 eased alpha, t: seconds shown } | null
```

Core draws the overlay AFTER `theme.render()`: a black veil over the panel region (black is free on a projector) and then the panel's text and glyphs. Themes do not draw the panels, but they make the overlay look native:

- **`overlayStyle(frame)`** (optional, recommended): returns `{ font: "<css family>", ink: {r,g,b}, dim: {r,g,b}, accent: {r,g,b}, alarm: {r,g,b}, glow: 0..1, rule: "hairline"|"double"|"none", caps: bool, place?: {x, y} }`. `place` is the panel centre as a fraction of the screen (default centred); use it when the theme has a natural spot for the panel, e.g. inside a window or on a plate. Colours obey rule 2 (`U.safe`). Pick the theme's own work-face type and palette in work mode, and its ambient palette in ambient (`frame.blend`). Missing = core defaults (sans, cool cyan / amber).
- **`renderOverlay(ctx, frame)`** (optional, rare): fully custom panel drawing. Return `true` to suppress the shared renderer.
- While `frame.overlay` is non-null, themes may dim their own info elements (multiply by `1 - 0.7 * frame.overlay.a`) so the panel reads cleanly. The ambient scene keeps living underneath.

## Daytime

Every theme looks like the day during the day. "Day" is `frame.day` (0..1), not the clock: a winter 16:30 is dusk, a June 21:00 is still light.

- **Ambient by day** (weekends, early mornings before work, light summer evenings): the full scene in daylight. That means a real sky for the season and weather (blue, hazy, overcast grey, storm-dark), the sun in its real position (`daylight.elevation`, `dayFraction`, sunrise/sunset), sunlit surfaces and shadows, day colours, and life that belongs to the day (for example the city's lights off, the fire banked low, the forest green and dappled). Use the day budget: mean up to `25 + 20 * day`, still no white. Weather reads in daylight too: bright overcast, grey rain, white-ish (but chroma-safe, capped) snow, milky fog.
- **Transitions:** morning and evening are their own moments (golden hour, blue hour). Everything interpolates on `frame.day` and elevation and never snaps, and the scene stays deterministic for a given time.
- **Work backdrop:** behind the work HUD, draw the theme's own daytime scene very faintly, at about `0.18 * day` of its ambient intensity: dimmed, simplified if needed, and kept clear of the text. It is 0 at night, so night work faces are unchanged. The HUD must stay fully legible: keep the backdrop low-contrast behind text. The exhale then becomes the scene coming forward rather than appearing from nothing.
- **Checks:** shoot.py's `day-*` states (morning, noon, golden, overcast, rain, snow, fog) and `work-day` / `work-dusk` apply the day budget automatically.

## Sound (background soundscape)

Fitting background sound effects, never music. Core owns the engine (`js/audio.js`, Web Audio). Served over http(s) (the backend serves `frontend/`), it plays real recordings from `sounds/` (see "Recordings" below); anything without a recording, or on `file://`, uses the procedural voices (synthesised: no files, no network), so every name below always works. Each layer is a 0..1 level, and the engine smooths every change.

**Layers** (what `soundscape()` returns):

| name | plays (recording slot in `sounds/layers/`) | procedural stand-in |
|---|---|---|
| `rain` | `rain-light` below about 0.5, crossfading into `rain-heavy` above (equal power, 0.35..0.65) | rain |
| `rain-light`, `rain-heavy` | that slot only (send either and `rain`'s automatic split is off) | rain |
| `rain-window` | rain on glass / a skylight | rain x 0.8 |
| `wind` | `wind-gentle`, with `wind-strong` blended in above about 0.6 (gentle eases to 0.7 at 1) | wind |
| `wind-gentle`, `wind-strong` | that slot only (send either and `wind`'s split is off) | wind |
| `city` | `city-night` or `city-day` by `frame.day` (crossfade over day 0.3..0.7) | city |
| `city-night`, `city-day` | that slot only (send either and `city`'s day split is off) | city |
| `birds` | `birds-forest` (a woodland chorus) | birds |
| `birds-light` | sparse early birds at a city's edge | birds x 0.6 |
| `crickets` | crickets | crickets |
| `cicadas` | cicadas (a hot day) | crickets x 0.6 |
| `forest` | `forest-rustle` (wind in leaves) | forest |
| `fire`, `water`, `room`, `space`, `magic` | the slot of the same name | the same |
| `town` | a medieval market / village (the busy OGsoundFX clip at rotation weight 0.25) | none (silent) |
| `cathedral` | the hush of a vast stone interior | room |
| `neon` | `neon-buzz` (a sign's hum) | none (silent) |

**One-shot cues** (`AW.audio.cue(name, opts)`, recording slot in `sounds/cues/`): `thunder` (`thunder-near` when `distance` < 0.45, else `thunder-far`), `train` (`train-pass`), `loon` (`kind: "wail"` or `"tremolo"` prefers takes labelled so, any take otherwise), `owl`, `pop` (`fire-pop`: a spark, coal or wick), `chime`, `drip`, `page` (`page-turn`), `distant_bell` (`bell-small` when `freq` >= 550 or `small: true`, else `bell-strike`; `count` plays a ready-made N-strike file when one exists, else one single strike repeated every ~2.4 s, ~2.0 s for the small bell; `kind: "peal"` = a swinging peal), `hover` (`hover-pass`: an AV or ship pass), `ward` (`ward-crackle`: a magical ward crackling, an arc tamed).

- **`soundscape(frame)`** (optional, recommended): returns `{ layer: level, ... }` for this frame, in the theme's own world. For example, campfire: fire (follows the burn-down), crickets at night, birds by day, wind, rain. Missing = a core default derived from weather and `frame.day`.
- **`AW.audio.cue(name, { gain, pan, distance, delay, kind, count, notes, freq, small })`**: call it on the theme's own events, so sound matches what is seen (thunder when the theme's lightning flashes: with no `delay` it arrives `distance` x 5 s later; the train when it crosses; a loon on the lake). Distance makes a cue quieter, darker and more reverberant. A recorded cue never plays the same take twice in a row (when the slot has two or more).
- **Control:** `S` toggles (off by default), `+` / `-` volume, `?sound=1`, config `display.sound` / `display.volume` / `display.sound_work` (work-mode level; default 0 = silent during work), and the backend command `set_sound {on, volume}`. The master level follows the mode and ramps through the exhale. A soft limiter keeps it from ever getting loud.
- **Autoplay:** browsers need one user gesture before sound plays. Any key or click unlocks it. For a kiosk, launch Chrome/Edge with `--autoplay-policy=no-user-gesture-required`.

### Recordings

`sounds/` holds `layers/<slot>/<n>.mp3`, `cues/<slot>/<n>.mp3`, `manifest.json` and `CREDITS.md` (the licence and attribution of every file: keep it with the files). `tools/process_sounds.py` rebuilds them all from `sound-source/` (`uv run --no-project --with numpy --with imageio-ffmpeg python frontend/tools/process_sounds.py [--only slot,... | layers | cues]`): loops are clean excerpts (at most 120 s, two from long recordings) normalised to -24 LUFS with 1 s fades at 112 kbps; cues are trimmed, split into single takes and peak-normalised. The manifest's per-file `gain` sets each slot's level and `weight` its rotation share; cues may carry `kind` (loon `wail` / `tremolo` / `unknown`, bell `strike` / `strikes` / `peal`) and `count`.

- **Loops:** two buffer sources play alternately with a 3 s equal-power crossfade scheduled ahead on the audio clock, so a join is seamless whatever the file's edges. At each join (every file length, at most about 2 min) the next file is a weighted random pick, never the current one; a slot with one file continues from a random point. A layer starts at a random point of its file.
- **Lazy and bounded:** nothing is fetched until a layer that maps to a slot rises above 0.01 (or a cue of that slot fires). Until its file is decoded the procedural stand-in plays, then the recording crossfades in. A playing slot keeps one decoded file (two around a join: the next one is fetched and decoded 20 s ahead); a slot silent for 5 minutes drops its buffers. A cue slot keeps at most 6 decoded takes. The first cue of a slot may sound a few hundred ms late while it loads (thunder's distance delay usually hides it).
- **Falling back:** a missing manifest or file, a decode error, or `file://` means the procedural voice, silently. `?samples=0` (or config `display.samples = false`) keeps the wall procedural; `?samples=1` tries recordings even on `file://` (it needs a browser that allows file access).
- **Debugging:** `AW.audio.state()` reports per layer `source` (`sampled` / `procedural` / `off`), `samples` (`status`, `loadedBytes`, `decodedBytes`, `fetches`, per-slot `decoded` files, `playing`, the last `segments`) and `cueLog` (`sampled`, `slot`, `file`, `kind`, `count`). The HUD sound field marks sampled layers with `*` and shows `rec <status> <decoded MB>`. `AW.audio.samples` exposes `opts` (`xfade`, `prep`, `segment`, `releaseAfter`, `keepCues`), `setManifest(m, base)`, `force` and `pickEntry` for tests. `AW.audio.renderOffline({samples: true, levels, cues, preload, clip, segment, xfade})` renders with the recordings (decoded first, outside the timed render).

## The cat

Every theme has a cat living in its ambient scene, shown when the viewer wants it. Core owns the switch and `js/cat.js` owns the cat; the theme only decides **where it sits and how the scene lights it**.

- **Switch:** `K` toggles (works with `devKeys` off), `Shift+K` cycles the coat (tabby, ginger, black, grey, tuxedo, calico, siamese, white) and turns the cat on. `?cat=1|0|<coat>`, config `[display] cat` / `cat_coat` (hello), the `set_cat {on?, coat?}` command. A choice made on the wall is remembered on that device. The HUD shows `cat <coat> <pose>`.
- **Frame:** `frame.cat` is `{ a: 0..1 eased fade, coat }` while the cat is on or fading, `null` while it is off.
- **Drawing:** keep one cat per theme (`this.cat = AW.cat.create(seed)` in `init`) and call `cat.draw(ctx, frame, opts)` **every frame** at the right point in the paint order (after what is behind it, before what is in front of it: rain on the glass, foreground leaves, the overlay). It draws nothing while `frame.cat` is null, and it keeps its own animation clock: blinks (sometimes a slow blink), ear flicks, head tilts, tail sway and swish, breathing.
- **Options:**
  - Position and size: `x, y` (the ground point under the cat, CSS px) and `size` (sitting height in px; about 9-16% of the screen height reads across a room). `facing` is 1 (right) or -1.
  - `pose`: `"sit" | "loaf" | "curl" | "back"`, or leave it out for `AW.cat.autoPose(frame)`. That is awake by day and early in the evening, a loaf after about 45 min of ambient, and curled up asleep after about 2.5 h. `AW.cat.autoPose(frame, "back")` uses the back view as the awake pose (a cat on a sill looking out). `hang` (back pose) lets the tail hang over a ledge (default true).
  - Light: `light` (0..1, how lit the coat is: about 0.2-0.35 at night, 0.8-1 by day) plus `tint` / `tintAmt` (the colour of the scene's light on the coat).
  - `rim`: `{color, a, dx, dy, width?}`, or an array of them for two light sources. It is a lit edge on the side facing a light at direction (dx, dy): the fire, the moon, neon, a lamp. At night the rim is what makes the cat readable on a black wall.
  - Night and contact: `glow` (0..1, eyeshine at night), `shadow` (0..1, a contact shadow, mostly by day).
  - `alpha`: fade it with the scene, normally `frame.blend` (the cat belongs to the ambient face; it may also show in the faint work backdrop by day).
- **Rules:** the cat obeys rule 2 like everything else (coats are capped under ~190; pass rim colours that are already theme-safe). It must not cover the clock or the now-playing line, and should sit on something real in the scene (a sill, a ledge, a log, a cushion, a step), with weather in front of it where the scene has weather in front.
- **Debugging:** `AW.cat.last` is the box drawn this frame (`x, y, w, h, pose, size, coat, alpha, t`; `t` equals the frame's `t` when drawn this frame), `AW._debug.cat` the switch state (`on, coat, a, user, set(on, coat, user)`). shoot.py: add `--extra cat=1` to see the cat in every state. `tests/test_cat.py` checks every registered theme: the cat is drawn in ambient by night and day, inside the screen, a sensible size, visible against the scene, within the brightness rules, and gone in work mode at night.
