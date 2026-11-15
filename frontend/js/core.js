// Ambient Wall - core: theme registry, sim clock, mock + live signals, mode controller, render loop, dev keys.
// Themes never touch any of this; they only receive a `frame` in render(). See THEMES.md.
window.AW = window.AW || {};

(function () {
  const U = AW.util;
  const cfg = AW.config;
  const qs = new URLSearchParams(location.search);
  // ?preview=1: a thumbnail (the setup wizard's theme previews). Mock data only, and nothing chosen through the URL
  // (?cat=, ?boost=) is remembered on the device, so a preview never changes how the real wall looks.
  const PREVIEW = qs.get("preview") === "1";
  // sound settings (config.js has the file:// defaults; the backend's hello overrides them)
  cfg.display = Object.assign({ sound: false, volume: 0.5, sound_work: 0, samples: true }, cfg.display || {});

  // ---------------------------------------------------------------- themes
  const themes = [];
  AW.registerTheme = (t) => {
    if (!t || !t.id || typeof t.render !== "function") throw new Error("bad theme");
    themes.push(t);
  };

  // ---------------------------------------------------------------- sim clock
  // Real time by default. ?at=2026-10-09T21:30 pins a start time, ?warp=60 speeds it up.
  const realStart = performance.now();
  const simStart = qs.get("at") ? new Date(qs.get("at")).getTime() : Date.now();
  let warp = parseFloat(qs.get("warp") || "1");
  let simOffsetMs = 0; // dev keys nudge time
  const simNow = () => new Date(simStart + (performance.now() - realStart) * warp + simOffsetMs);

  // ---------------------------------------------------------------- sun
  // NOAA-style approximation. Good to a minute or two, which is plenty for a wall.
  function solar(date, lat, lon) {
    const rad = Math.PI / 180;
    const jd = date.getTime() / 86400000 + 2440587.5;
    const n = jd - 2451545.0;
    const L = (280.46 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * rad;
    const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
    const eps = (23.439 - 0.0000004 * n) * rad;
    const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
    const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
    const lst = (gmst * 15 + lon) * rad;
    const ha = lst - ra;
    const el = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha));
    return { elevation: el / rad, dec };
  }
  function sunTimes(date, lat, lon) {
    // scan the local day in 2-minute steps for the -0.833 deg crossings
    const d0 = new Date(date); d0.setHours(0, 0, 0, 0);
    let rise = null, set = null, prev = solar(d0, lat, lon).elevation;
    for (let m = 2; m <= 1440; m += 2) {
      const t = new Date(d0.getTime() + m * 60000);
      const e = solar(t, lat, lon).elevation;
      if (prev < -0.833 && e >= -0.833 && !rise) rise = t;
      if (prev >= -0.833 && e < -0.833) set = t;
      prev = e;
    }
    return { rise, set };
  }
  let sunCache = { key: "", rise: null, set: null };
  function daylight(now) {
    const { lat, lon } = cfg.location;
    const key = now.toDateString();
    if (sunCache.key !== key) sunCache = { key, ...sunTimes(now, lat, lon) };
    const elev = solar(now, lat, lon).elevation;
    const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    const dayFraction = (now - midnight) / 86400000;
    const isDay = elev > -0.833;
    const lightLeftMin = isDay && sunCache.set ? Math.max(0, (sunCache.set - now) / 60000) : null;
    // Civil twilight band gives a soft 0..1 "how much light is out there".
    const light = U.smoothstep(-6, 8, elev);
    return { sunrise: sunCache.rise, sunset: sunCache.set, elevation: elev, light, dayFraction, isDay, lightLeftMin };
  }

  // ---------------------------------------------------------------- mock signals
  // Weather presets the W key cycles through (and ?wx=<name> picks). Mirrors the backend projection:
  // condition = clear | cloudy | fog | rain | storm | snow; intensity 0..1 (drizzle -> downpour,
  // a few clouds -> overcast); actionable = the work-face sliver (null = no sliver).
  const WEATHER = [
    { name: "overcast", condition: "cloudy", intensity: 0.8, windKph: 12, tempC: 6, actionable: "Rain in 20 min" },
    { name: "clear", condition: "clear", intensity: 0, windKph: 5, tempC: 8, actionable: null },
    { name: "partly", condition: "cloudy", intensity: 0.35, windKph: 10, tempC: 7, actionable: null },
    { name: "fog", condition: "fog", intensity: 0.7, windKph: 2, tempC: 4, actionable: null },
    { name: "drizzle", condition: "rain", intensity: 0.2, windKph: 8, tempC: 7, actionable: "Drizzle now" },
    { name: "rain", condition: "rain", intensity: 0.6, windKph: 18, tempC: 6, actionable: "Raining now" },
    { name: "storm", condition: "storm", intensity: 0.95, windKph: 45, tempC: 14, actionable: "Thunderstorm now" },
    { name: "snow", condition: "snow", intensity: 0.6, windKph: 10, tempC: -6, actionable: "Snow now" },
    { name: "cold", condition: "clear", intensity: 0, windKph: 20, tempC: -24, actionable: "-24 °C, dress for it" },
  ];
  const wxParam = qs.get("wx");
  // News presets the B key cycles through (and ?news=<name> picks). Mirrors the backend `news` element:
  // one headline for the work face; `critical` = the rare flare treatment. null = no news element.
  const NEWS = [
    { name: "top", headline: "Ottawa council approves new transit line to Kanata after marathon debate", source: "CBC Ottawa", ageMin: 35, critical: false },
    { name: "critical", headline: "Tornado warning issued for Ottawa, take shelter", source: "Environment Canada", ageMin: 4, critical: true },
    { name: "long", headline: "Federal government announces sweeping changes to how provinces receive health transfer payments starting next fiscal year", source: "CBC News", ageMin: 120, critical: false },
    { name: "none" },
  ];
  const newsParam = qs.get("news");
  // Now-playing presets the P key cycles through (and ?music=<name> picks; ?music=0 = none). Mirrors the backend
  // `nowPlaying` element; "playing" advances in real time, "paused" holds, "long" stresses truncation.
  const NOWPLAYING = [
    { name: "playing", title: "Teardrop", artist: "Massive Attack", album: "Mezzanine", isPlaying: true, progressMs: 81000, durationMs: 330000 },
    { name: "paused", title: "Avril 14th", artist: "Aphex Twin", album: "Drukqs", isPlaying: false, progressMs: 47000, durationMs: 125000 },
    { name: "long", title: "Concerto for Two Violins, Strings and Continuo in D Minor, BWV 1043: I. Vivace (Remastered 2019 Anniversary Edition)",
      artist: "Academy of St Martin in the Fields, Sir Neville Marriner, Iona Brown and Henryk Szeryng", album: "Bach: Violin Concertos",
      isPlaying: true, progressMs: 12000, durationMs: 1260000 },
    { name: "none" },
  ];
  const musicParam = qs.get("music");
  // Placeholder data when there is no backend (file://, ?mock=1, nothing received yet). Dev keys flip these.
  const mock = {
    calendarOn: qs.get("cal") !== "0",
    calendarLeadMin: parseFloat(qs.get("calmin") || "47"),
    heartbeatDown: qs.get("down") === "1",
    weatherIdx: wxParam === "0" ? 1 : Math.max(0, WEATHER.findIndex((w) => w.name === wxParam)),
    financeMood: qs.get("fin") || "calm", // calm | drift | warning
    newsIdx: newsParam === "0" ? NEWS.length - 1 : Math.max(0, NEWS.findIndex((n) => n.name === newsParam)),
    musicIdx: musicParam === "0" ? NOWPLAYING.length - 1 : Math.max(0, NOWPLAYING.findIndex((n) => n.name === musicParam)),
    musicAt: Date.now(), // real time the preset was picked: its updatedAt (progress anchor)
  };
  function mockNowPlaying() {
    const n = NOWPLAYING[mock.musicIdx];
    if (!n.title) return null;
    const el = n.isPlaying ? Math.max(0, Date.now() - mock.musicAt) : 0;
    return {
      title: n.title, artist: n.artist, album: n.album, isPlaying: n.isPlaying,
      progressMs: (n.progressMs + el) % n.durationMs, durationMs: n.durationMs,
      updatedAt: new Date(mock.musicAt), source: "demo", art: null,
    };
  }
  let calendarAnchor = null; // fixed event time so the countdown actually counts down
  function mockNews(now) {
    const n = NEWS[mock.newsIdx];
    if (!n.headline) return null;
    return { headline: n.headline, source: n.source, published: new Date(now - n.ageMin * 60000), critical: n.critical, rank: 1, count: 3 };
  }
  function mockSignals(now) {
    if (!calendarAnchor) calendarAnchor = new Date(now.getTime() + mock.calendarLeadMin * 60000);
    if (calendarAnchor < now) calendarAnchor = new Date(now.getTime() + 95 * 60000);
    const minutesUntil = (calendarAnchor - now) / 60000;

    const fin = {
      calm: { income: 6420, spent: 3985 },
      drift: { income: 6420, spent: 5870 },
      warning: { income: 6420, spent: 7310 },
    }[mock.financeMood];

    return {
      time: now,
      daylight: daylight(now),
      calendar: mock.calendarOn
        ? { next: { title: "Ops sync", start: calendarAnchor, minutesUntil } }
        : { next: null },
      heartbeat: [
        { host: "homelab", up: !mock.heartbeatDown, downSince: mock.heartbeatDown ? new Date(now - 4 * 60000) : null },
        { host: "main-pc", up: true, downSince: null },
      ],
      finances: {
        income: fin.income,
        spent: fin.spent,
        net: fin.income - fin.spent,
        balance: 18240 + (fin.income - fin.spent),
        lastUpdated: new Date(now - 26 * 3600000),
        mood: mock.financeMood,
      },
      weather: (({ name, ...w }) => w)(WEATHER[mock.weatherIdx]),
      nowPlaying: mockNowPlaying(),
      news: mockNews(now),
    };
  }

  // Ask-panel mocks (the O key, ?show=, and the fallback when GET /api/ask/<panel> fails). Wire format, exactly
  // the shapes in docs/ARCHITECTURE.md "Ask panels" (dates are local-offset ISO strings); showPanel()
  // revives them like any live payload. They follow the mock state: W drives today's forecast, N the finance
  // mood, B a critical headline.
  const pad2 = (n) => String(n).padStart(2, "0");
  function isoLocal(d) {
    const off = -d.getTimezoneOffset(), a = Math.abs(off);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}` +
      `${off >= 0 ? "+" : "-"}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`;
  }
  const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const atToday = (now, hh, mm) => { const d = new Date(now); d.setHours(hh, mm, 0, 0); return d; };
  const MOCK_PANELS = {
    forecast(now) {
      const w = WEATHER[mock.weatherIdx];
      const rows = [
        [w.condition, w.tempC + 3, w.tempC - 4, w.condition === "clear" ? 0 : 60, w.condition === "rain" ? 6 : 0],
        ["cloudy", 9, 1, 30, 0], ["clear", 11, 0, 10, 0], ["rain", 8, 3, 70, 9],
        ["cloudy", 6, -1, 20, 0], ["snow", 1, -5, 60, 4], ["clear", -2, -9, 0, 0],
      ];
      return {
        panel: "forecast", title: "7-day forecast", ts: isoLocal(now),
        days: rows.map(([condition, hiC, loC, pop, precipMm], i) => {
          const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + i);
          const day = { date: isoDate(d), label: i === 0 ? "Today" : d.toLocaleDateString("en-CA", { weekday: "short" }), hiC, loC, condition, pop };
          if (precipMm) day.precipMm = precipMm;
          return day;
        }),
      };
    },
    calendar(now) {
      const ev = (title, h1, m1, h2, m2, location) => {
        const e = { title, start: isoLocal(atToday(now, h1, m1)), end: isoLocal(atToday(now, h2, m2)), allDay: false };
        if (location) e.location = location;
        return e;
      };
      const d0 = atToday(now, 0, 0), d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
      return {
        panel: "calendar", title: "Today", ts: isoLocal(now),
        events: [
          { title: "Recycling day", start: isoLocal(d0), end: isoLocal(d1), allDay: true },
          ev("Standup", 8, 30, 8, 45, "Teams"),
          ev("Ops sync", 10, 0, 10, 30, "Room 2"),
          ev("Lunch with Sam", 12, 0, 13, 0, "Mill Street Grill"),
          ev("Design review: wall overlay", 14, 0, 15, 0),
          ev("1:1 with Priya", 16, 30, 17, 0, "Room 4"),
        ],
      };
    },
    pulse(now) {
      const ago = (h) => isoLocal(new Date(now - h * 3600000));
      return {
        panel: "pulse", title: "Project pulse", ts: isoLocal(now),
        repos: [
          { name: "you/ambient-wall", lastCommit: ago(0.6), message: "overlay: ask panels with cached text sprites", pushedAt: ago(0.5), status: "alive" },
          { name: "you/homelab", lastCommit: ago(27), message: "ansible: rotate backup keys", pushedAt: ago(26), status: "alive" },
          { name: "you/garden-sensors", lastCommit: ago(24 * 6), message: "fix soil probe calibration drift", pushedAt: ago(24 * 6), status: "alive" },
          { name: "you/dotfiles", lastCommit: ago(24 * 41), message: "nvim: drop unused plugins", pushedAt: ago(24 * 41), status: "dormant" },
          { name: "you/lab-notes", lastCommit: ago(24 * 95), pushedAt: ago(24 * 95), status: "dormant" },
        ],
      };
    },
    finance(now) {
      const spent = { calm: 3985, drift: 5870, warning: 7310 }[mock.financeMood] || 3985;
      const k = spent / 3985;
      const exp = [["Rent", 1850], ["Groceries", 612], ["Dining out", 284], ["Transport", 241], ["Utilities", 198], ["Subscriptions", 87], ["Pharmacy", 64]];
      return {
        panel: "finance", title: "Finances", ts: isoLocal(now),
        income: 6420, spent, net: 6420 - spent, balance: 18240 + 6420 - spent, mood: mock.financeMood,
        month: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`,
        categories: [
          ...exp.map(([name, amount]) => ({ name, amount: Math.round(amount * (name === "Rent" ? 1 : k)), kind: "expense" })),
          { name: "Salary", amount: 6100, kind: "income" },
          { name: "Side work", amount: 320, kind: "income" },
        ],
      };
    },
    news(now) {
      const ago = (m) => isoLocal(new Date(now - m * 60000));
      const items = [
        { headline: "Ottawa council approves new transit line to Kanata after marathon debate", source: "CBC Ottawa", published: ago(35), critical: false },
        { headline: "City opens new recreation centre ahead of schedule", source: "Ottawa Citizen", published: ago(80), critical: false },
        { headline: "Bank of Canada holds rate steady, signals cuts possible next year", source: "CBC News", published: ago(150), critical: false },
        { headline: "Ottawa River levels expected to stay below flood stage this fall", source: "Ottawa Citizen", published: ago(210), critical: false },
        { headline: "Algonquin Park sees record autumn visitors as colours peak early", source: "CBC Ottawa", published: ago(300), critical: false },
      ];
      if (NEWS[mock.newsIdx].critical) {
        items.unshift({ headline: NEWS[mock.newsIdx].headline, source: NEWS[mock.newsIdx].source, published: ago(4), critical: true });
        items.pop();
      }
      return { panel: "news", title: "Headlines", ts: isoLocal(now), items };
    },
    warnings(now) {
      const at = (h) => isoLocal(new Date(now.getTime() + h * 3600000));
      return {
        panel: "warnings", title: "Weather warnings", ts: isoLocal(now),
        items: [
          { headline: "Wind warning in effect for City of Ottawa", severity: "warning", issued: at(-2), expires: at(9) },
          { headline: "Frost advisory: temperatures near minus 3 overnight", severity: "advisory", issued: at(-5), expires: at(16) },
          { headline: "Special weather statement: heavy rain possible Sunday", severity: "statement", issued: at(-7), expires: at(40) },
        ],
      };
    },
  };

  // ---------------------------------------------------------------- live signals
  // Served over http(s) (the backend serves frontend/ at /) or given ?backend=host:port: listen on /ws.
  // "hello" carries settings, "wall" the projection (docs/ARCHITECTURE.md). ?mock=1 never connects.
  // Until the first projection arrives, or after a dev key (D W C N) switched to mock, the mocks above run.
  const DROP_MS = 10 * 60000;  // disconnected this long: stop showing old data (time + daylight stay)
  const SILENT_MS = 90000;     // backend sends at least every 30 s; this much silence = dead socket
  const live = {
    url: wsUrl(),              // null = mock only
    ws: null, connected: false,
    backoff: 1,                // seconds until the next reconnect: 1, 2, 4 ... 30
    sig: null,                 // latest projection with dates revived; reused every frame
    heardAt: 0, dataAt: 0,     // Date.now() of the last open/message, of the last wall message
    forceMock: false,          // a dev key switched to mock (L goes back)
    userTheme: qs.has("theme"), // ?theme= or a theme key wins over the backend's display.theme
  };
  function wsUrl() {
    if (qs.get("mock") === "1" || PREVIEW) return null;
    const b = qs.get("backend");
    if (cfg.demo && !b) return null; // static demo hosting: mock data only, never look for a backend
    const secure = location.protocol === "https:" || /^https:/.test(b || "");
    if (b) return `${secure ? "wss" : "ws"}://${b.replace(/^\w+:\/\//, "").replace(/\/.*$/, "")}/ws`;
    return /^https?:$/.test(location.protocol) ? `${secure ? "wss" : "ws"}://${location.host}/ws` : null;
  }

  function connect() {
    let ws;
    try { ws = new WebSocket(live.url); } catch (e) { console.error(e); return lost(null); }
    live.ws = ws;
    ws.onopen = () => { live.connected = true; live.heardAt = Date.now(); };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      live.heardAt = Date.now(); live.backoff = 1;
      if (msg.type === "hello") { applySettings(msg.settings || {}); firstRun(msg.setup); }
      else if (msg.type === "wall" && msg.signals) { live.sig = project(msg.signals, msg.ts); live.dataAt = live.heardAt; }
      else if (msg.type === "command") command(msg.name, msg.args || {});
    };
    ws.onclose = () => lost(ws);
  }
  // Forget this socket and schedule the next attempt. The last data stays up (see signals()).
  function lost(ws) {
    if (live.ws !== ws) return;
    if (ws) { ws.onopen = ws.onmessage = ws.onclose = null; try { ws.close(); } catch (e) { /* already gone */ } }
    live.ws = null; live.connected = false;
    setTimeout(connect, live.backoff * 1000);
    live.backoff = Math.min(30, live.backoff * 2);
  }
  // A half-open socket never fires close; drop it ourselves when the backend goes quiet.
  function watchdog() {
    if (live.connected && Date.now() - live.heardAt > SILENT_MS) lost(live.ws);
  }

  // First run: the backend has no config/config.toml yet (it runs the demo config) and its hello says
  // setup.needed. A wall page served by that backend then opens the setup wizard (setup.html, docs/SETUP.md).
  // Never from file:// or ?backend= (the wizard lives on the backend's own origin), and never with ?mock=1,
  // ?preview=1 or static demo hosting (those don't connect at all). "Skip" on the wizard is remembered on this
  // device (the wall stays on demo data and a faint hint says where the wizard is); ?setup=0 skips it once.
  const SETUP_SKIP_KEY = "ambient-wall.setup-skipped";
  function firstRun(setup) {
    const needed = !!(setup && setup.needed);
    const hintEl = document.getElementById("setup-hint");
    if (!needed) {
      if (hintEl) hintEl.style.display = "none";
      try { localStorage.removeItem(SETUP_SKIP_KEY); } catch (e) { /* no storage */ }
      return;
    }
    if (qs.has("backend") || !/^https?:$/.test(location.protocol)) return;
    let skipped = qs.get("setup") === "0";
    try { skipped = skipped || localStorage.getItem(SETUP_SKIP_KEY) === "1"; } catch (e) { /* no storage */ }
    if (!skipped) { location.replace("setup.html?from=wall"); return; }
    if (hintEl && hintEl.style.display !== "block") {
      hintEl.textContent = `demo data · set up this wall: ${location.host}/setup.html`;
      hintEl.style.display = "block";
      setTimeout(() => { hintEl.style.display = "none"; }, 60000); // a minute after each (re)connect, then gone
    }
  }

  // hello: the backend's config.toml wins over config.js. Mutated in place: themes read AW.config live.
  function applySettings(s) {
    const loc = s.location, mode = s.mode, disp = s.display;
    if (loc && typeof loc.lat === "number" && typeof loc.lon === "number") {
      Object.assign(cfg.location, loc);
      sunCache.key = ""; // sunrise/sunset for the new place
    }
    if (mode) {
      const pick = (a, b) => (mode[a] !== undefined ? mode[a] : mode[b]); // camelCase or the TOML's snake_case
      const hhmm = /^\d{1,2}:\d{2}$/;
      const ws = pick("workStart", "work_start"), we = pick("workEnd", "work_end");
      const wd = pick("workDays", "work_days"), tr = pick("transitionSeconds", "transition_seconds");
      if (hhmm.test(ws)) cfg.mode.workStart = ws;
      if (hhmm.test(we)) cfg.mode.workEnd = we;
      if (Array.isArray(wd)) cfg.mode.workDays = wd.map((d) => +d % 7); // 7 = Sunday, ISO style
      if (typeof tr === "number" && tr >= 0) cfg.mode.transitionSeconds = tr;
    }
    if (disp) {
      if (typeof disp.hour24 === "boolean") (cfg.clock = cfg.clock || {}).hour24 = disp.hour24;
      // sound: sound_work always applies; sound / volume only until the user chose (S, + / -, ?sound=, set_sound)
      const sw = disp.sound_work !== undefined ? disp.sound_work : disp.soundWork;
      if (typeof sw === "number" && isFinite(sw)) cfg.display.sound_work = U.clamp(sw);
      if (typeof disp.volume === "number" && isFinite(disp.volume)) {
        cfg.display.volume = U.clamp(disp.volume);
        if (!snd.userVol) setVolume(cfg.display.volume);
      }
      if (typeof disp.sound === "boolean") {
        cfg.display.sound = disp.sound;
        if (!snd.user) setSound(disp.sound);
      }
      // projector boost: the config default, unless this device already chose one (G / ?boost=)
      if (typeof disp.boost === "number" && isFinite(disp.boost)) {
        cfg.display.boost = disp.boost;
        if (!boost.user) setBoost(disp.boost);
      }
      // the cat: config default, unless this device already chose (K / ?cat=)
      if (typeof disp.cat === "boolean") { cfg.display.cat = disp.cat; if (!kitty.user) setCat(disp.cat); }
      const coat = disp.cat_coat !== undefined ? disp.cat_coat : disp.catCoat;
      if (typeof coat === "string") { cfg.display.cat_coat = coat; if (!kitty.user) setCat(undefined, coat); }
      if (disp.theme) {
        cfg.theme = disp.theme;
        const i = themes.findIndex((t) => t.id === disp.theme);
        const showing = fade.dir > 0 ? fade.next : themeIdx;
        if (!live.userTheme && i >= 0 && (i !== showing || !theme)) switchTheme(i);
      }
    }
  }

  // wall: revive ISO strings to Date once per message, not per frame.
  const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:?\d\d)?$/;
  function revive(v) {
    if (typeof v === "string") {
      if (!ISO.test(v)) return v;
      const d = new Date(v);
      return isNaN(d) ? v : d;
    }
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = revive(v[i]); }
    else if (v && typeof v === "object") { for (const k in v) v[k] = revive(v[k]); }
    return v;
  }
  // Every key of the projection passes through (revived), so a new backend element reaches themes without a
  // core change; the known ones are normalised to null when absent.
  const ELEMENTS = ["calendar", "heartbeat", "finances", "weather", "nowPlaying", "news"];
  function project(p, ts) {
    revive(p);
    const s = Object.assign({}, p);
    for (const k of ELEMENTS) if (s[k] === undefined) s[k] = null;
    s.stale = Array.isArray(p.stale) ? p.stale : [];
    s.time = null; s.daylight = null; // filled per frame
    anchorNowPlaying(s.nowPlaying, ts);
    return s;
  }
  // nowPlaying: progress advances locally while isPlaying (progressMs + (now - updatedAt), clamped to durationMs),
  // so themes read a smooth progressMs every frame. updatedAt is the backend's progress anchor and may be well in
  // the past; "now" is the message's own `ts` (backend clock, so no browser/backend clock skew) plus the real time
  // since it arrived. A null progressMs (Last.fm) stays null: no progress bar.
  const npAnchor = new WeakMap();
  function anchorNowPlaying(np, ts) {
    if (!np || typeof np !== "object") return;
    let lag = 0;
    if (np.isPlaying && np.updatedAt instanceof Date) {
      const sent = ts ? new Date(ts).getTime() : NaN;
      lag = Math.max(0, (isNaN(sent) ? Date.now() : sent) - np.updatedAt.getTime());
    }
    npAnchor.set(np, { p: typeof np.progressMs === "number" ? np.progressMs : null, lag, at: performance.now() });
  }
  function advanceNowPlaying(np) {
    const a = np && npAnchor.get(np);
    if (!a || a.p === null) return;
    let v = a.p + (np.isPlaying ? a.lag + (performance.now() - a.at) : 0);
    if (typeof np.durationMs === "number" && np.durationMs >= 0) v = Math.min(v, np.durationMs);
    np.progressMs = Math.max(0, v);
  }
  // Disconnected too long: nothing the backend said is trustworthy any more. The clock and sky still are.
  const dropped = { time: null, daylight: null, calendar: null, heartbeat: null, finances: null, weather: null, nowPlaying: null, news: null, stale: [] };

  const usingLive = () => !!live.sig && !live.forceMock;
  function source() {
    if (!live.url || live.forceMock) return "mock";
    if (!live.sig) return "mock (connecting)";
    return live.connected ? "live" : "live (reconnecting)";
  }

  // Time and daylight are always local (from the possibly backend-supplied location). minutesUntil is
  // derived from start every frame so the countdown moves between wall messages.
  function signals(now) {
    if (!usingLive()) return mockSignals(now);
    const s = !live.connected && Date.now() - live.dataAt > DROP_MS ? dropped : live.sig;
    s.time = now;
    s.daylight = daylight(now);
    const next = s.calendar && s.calendar.next;
    if (next && next.start instanceof Date) next.minutesUntil = Math.max(0, (next.start - now) / 60000);
    advanceNowPlaying(s.nowPlaying);
    return s;
  }

  // ---------------------------------------------------------------- mode controller
  const hm = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  function scheduledMode(now) {
    const { workStart, workEnd, workDays } = cfg.mode;
    if (!workDays.includes(now.getDay())) return "ambient";
    const m = now.getHours() * 60 + now.getMinutes();
    return m >= hm(workStart) && m < hm(workEnd) ? "work" : "ambient";
  }
  // When did the current scheduled ambient period start? (deterministic, survives reloads)
  function ambientSince(now) {
    const t = new Date(now);
    for (let i = 0; i < 60 * 24 * 4; i += 5) { // walk back up to 4 days in 5-min steps
      const p = new Date(now.getTime() - i * 60000);
      if (scheduledMode(p) === "work") return new Date(p.getTime() + 5 * 60000);
    }
    return new Date(t.getTime() - 4 * 86400000);
  }

  const modeState = {
    override: qs.get("mode") || null,       // null | "work" | "ambient"
    overrideSince: null,
    blend: null,                            // 0 = work, 1 = ambient (linear, eased on output)
    elapsedOverride: qs.has("elapsed") ? parseFloat(qs.get("elapsed")) : null,
    elapsedNudge: 0,
  };
  function updateMode(now, dt) {
    const target = modeState.override || scheduledMode(now);
    const tv = target === "ambient" ? 1 : 0;
    if (modeState.blend === null) modeState.blend = tv;
    const step = dt / Math.max(0.1, cfg.mode.transitionSeconds);
    if (modeState.blend < tv) modeState.blend = Math.min(tv, modeState.blend + step);
    if (modeState.blend > tv) modeState.blend = Math.max(tv, modeState.blend - step);

    let ambientElapsed = 0;
    if (target === "ambient") {
      if (modeState.elapsedOverride !== null) {
        ambientElapsed = modeState.elapsedOverride + (now - simStart) / 1000;
      } else if (modeState.override) {
        ambientElapsed = (now - (modeState.overrideSince || now)) / 1000;
      } else {
        ambientElapsed = (now - ambientSince(now)) / 1000;
      }
      ambientElapsed = Math.max(0, ambientElapsed + modeState.elapsedNudge);
      modeState.lastAmbientElapsed = ambientElapsed;
    } else if (modeState.blend > 0 && modeState.lastAmbientElapsed) {
      // hold the evening's state while the wall exhales back to work, so overgrowth can recede
      ambientElapsed = modeState.lastAmbientElapsed;
    }
    return {
      mode: target,
      blend: U.easeInOut(modeState.blend),
      transitioning: modeState.blend !== tv,
      ambientElapsed,
      override: modeState.override,
    };
  }

  // ---------------------------------------------------------------- info overlay (ask panels)
  // State lives here; timing curve + drawing in js/overlay.js. Triggers: WebSocket `command` show/dismiss,
  // the O key (cycle; Esc dismisses), ?show=<panel> (&showfor=<s> overrides every duration).
  // Real time, not sim time: a warped clock must not rush the panel.
  //   idle --show--> in (0.6 s) --> hold (duration) --> out (1.2 s) --> idle
  //   show while visible: content swaps, alpha carries on from where it is (no flash through black)
  //   dismiss in in/hold: out from the current alpha; dismiss while idle: nothing
  // js/overlay.js loads after this file (index.html order), so it is looked up when used, not here.
  const PANELS = ["forecast", "calendar", "pulse", "finance", "news", "warnings"]; // = AW.overlay.PANELS
  const showFor = parseFloat(qs.get("showfor"));
  const ov = {
    panel: null, data: null, duration: 20, start: 0, outAt: null, outFrom: 1,
    lv: 0, a: 0, t: 0, phase: "idle", id: 0,
    origin: null,        // "command" | "ask" | "mock" | "mock (ask failed)" | "url" | "debug"
    cycle: -1,           // index into PANELS of the last panel shown (O continues from it)
    asks: 0,             // fetches of /api/ask started (tests)
  };
  const realNow = () => performance.now() / 1000;
  function showPanel(panel, data, opts = {}) {
    if (!AW.overlay || !PANELS.includes(panel)) { console.warn(`overlay: unknown panel ${JSON.stringify(panel)} ignored`); return false; }
    const duration = showFor > 0 ? showFor : opts.duration > 0 ? +opts.duration : AW.overlay.DURATION;
    AW.overlay.show(ov, panel, data && typeof data === "object" ? revive(data) : null, { duration, now: realNow(), instant: !!opts.instant });
    ov.origin = opts.origin || "debug";
    ov.cycle = PANELS.indexOf(panel);
    return true;
  }
  const dismissPanel = () => !!AW.overlay && AW.overlay.dismiss(ov, realNow());
  const mockPanel = (panel, now = simNow()) => (MOCK_PANELS[panel] ? MOCK_PANELS[panel](now) : null);

  // The backend's REST base, derived from the socket URL (null = no backend).
  const apiBase = () => (live.url ? live.url.replace(/^ws/, "http").replace(/\/ws$/, "") : null);
  let askSeq = 0;
  // Show one panel locally (no broadcast): GET /api/ask/<panel> when there is a backend, else (or if that
  // fails) the mock. A 200 with null is real "no data" and shows the quiet line.
  async function askPanel(panel, opts = {}) {
    if (!PANELS.includes(panel)) return showPanel(panel, null);
    const seq = ++askSeq;
    const base = live.forceMock ? null : apiBase();
    let data, origin;
    if (base) {
      ov.asks++;
      const ctl = typeof AbortController === "function" ? new AbortController() : null;
      const timer = ctl && setTimeout(() => ctl.abort(), 4000);
      try {
        const r = await fetch(`${base}/api/ask/${encodeURIComponent(panel)}`, { cache: "no-store", signal: ctl && ctl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        data = await r.json(); origin = "ask";
      } catch (e) {
        console.warn(`overlay: /api/ask/${panel} failed (${e.message || e}); showing mock data`);
        data = mockPanel(panel); origin = "mock (ask failed)";
      } finally { if (timer) clearTimeout(timer); }
      if (seq !== askSeq) return false; // a newer O press won
    } else { data = mockPanel(panel); origin = "mock"; }
    return showPanel(panel, data, { origin, duration: opts.duration });
  }
  // Live: GET /api/ask lists [{panel, available}]; O skips panels with nothing to say. Cached 30 s; any failure
  // = no skipping (askPanel's own fallback still applies).
  const avail = { at: -1e9, set: null, pending: null };
  async function availability() {
    if (performance.now() - avail.at < 30000) return avail.set;
    if (!avail.pending) {
      avail.pending = (async () => {
        try {
          const ctl = typeof AbortController === "function" ? new AbortController() : null;
          const timer = ctl && setTimeout(() => ctl.abort(), 2500);
          const r = await fetch(`${apiBase()}/api/ask`, { cache: "no-store", signal: ctl && ctl.signal });
          if (timer) clearTimeout(timer);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const list = await r.json();
          avail.set = Array.isArray(list) ? new Set(list.filter((x) => x && x.available).map((x) => x.panel)) : null;
        } catch (e) { avail.set = null; }
        avail.at = performance.now(); avail.pending = null;
        return avail.set;
      })();
    }
    return avail.pending;
  }
  async function cyclePanel() {
    const cur = ov.panel ? PANELS.indexOf(ov.panel) : ov.cycle;
    // mock: synchronous (no await before askPanel); live: consult the availability list
    const okSet = !live.forceMock && apiBase() ? await availability() : null;
    let next = PANELS[(cur + 1) % PANELS.length];
    if (okSet && okSet.size) {
      for (let i = 1; i <= PANELS.length; i++) {
        const p = PANELS[(cur + i) % PANELS.length];
        if (okSet.has(p)) { next = p; break; }
      }
    }
    ov.cycle = PANELS.indexOf(next);
    return askPanel(next);
  }
  Object.assign(ov, {
    show: (panel, data, opts = {}) => showPanel(panel, data === undefined ? mockPanel(panel) : data, { origin: "debug", ...opts }),
    dismiss: dismissPanel, ask: askPanel, cycleNext: cyclePanel, mock: mockPanel,
  });
  Object.defineProperty(ov, "info", { get: () => (AW.overlay ? AW.overlay.info : null) });

  // WebSocket `command` messages (docs/ARCHITECTURE.md).
  function command(name, args) {
    if (name === "show") {
      const panel = args.panel;
      if (!PANELS.includes(panel)) { console.warn("command show: unknown panel", panel); return; }
      showPanel(panel, args.data === undefined ? null : args.data, { duration: args.duration, origin: "command" });
    } else if (name === "dismiss") dismissPanel();
    else if (name === "set_theme") {
      const i = themes.findIndex((t) => t.id === args.theme);
      if (i < 0) { console.warn("command set_theme: unknown theme", args.theme); return; }
      live.userTheme = true; // a spoken/REST choice is a user choice: hello's display.theme no longer wins
      const showing = fade.dir > 0 ? fade.next : themeIdx;
      if (i !== showing || !theme) switchTheme(i);
    } else if (name === "set_mode") {
      const m = args.mode;
      if (m === "work" || m === "ambient") {
        if (modeState.override !== m) modeState.overrideSince = simNow();
        modeState.override = m; modeState.elapsedOverride = null; modeState.elapsedNudge = 0;
      } else if (m === "auto") { modeState.override = null; modeState.elapsedOverride = null; modeState.elapsedNudge = 0; }
      else console.warn("command set_mode: unknown mode", m);
    } else if (name === "set_sound") {
      // args carries only the keys sent ({on}, {volume} or both): merge with the current state
      let did = false;
      if (typeof args.volume === "number" && isFinite(args.volume)) { setVolume(args.volume, true); did = true; }
      if (typeof args.on === "boolean") { setSound(args.on, true); did = true; }
      if (!did) console.warn("command set_sound: nothing to apply", args);
    } else if (name === "set_cat") {
      if (typeof args.on !== "boolean" && typeof args.coat !== "string") console.warn("command set_cat: nothing to apply", args);
      else setCat(typeof args.on === "boolean" ? args.on : undefined, typeof args.coat === "string" ? args.coat : undefined, true);
    } else console.warn("command: unknown", name);
  }

  // ---------------------------------------------------------------- sound (THEMES.md "Sound")
  // Engine in js/audio.js (loads after this file, looked up when used). Every frame, while sound is on, the theme's
  // soundscape(frame) (or the weather/daylight default, which also schedules storm thunder) feeds AW.audio.update;
  // audio.js applies master = volume x (work: display.sound_work .. ambient: 1, on frame.blend).
  // Controls: S (off -> the first press both unlocks and enables), + / -, ?sound=1|0, hello display.sound /
  // volume / sound_work, the set_sound command. Autoplay: while on but locked, a hint shows until a key or click.
  const snd = {
    override: null,              // tests: {layer: level} used instead of any soundscape
    levels: null, from: null,    // the last levels fed to AW.audio and their origin: theme | default | override
    user: false, userVol: false, // the user chose (key, URL, command): hello's sound / volume no longer win
    lockedSince: null, errTheme: null,
  };
  const audio = () => AW.audio || null;
  function setSound(on, user) {
    const a = audio();
    if (user) snd.user = true;
    return a ? a.setEnabled(!!on) : false;
  }
  function setVolume(v, user) {
    const a = audio();
    if (user) snd.userVol = true;
    return a ? a.setVolume(v) : null;
  }
  function toggleSound() {
    const a = audio();
    if (!a) return;
    if (a.enabled() && a.locked()) return; // on but locked: this key press was the unlocking gesture
    setSound(!a.enabled(), true);
  }
  // any key or click: browsers only let audio start inside a user gesture
  function soundGesture() { const a = audio(); if (a && a.enabled()) a.unlock(); }
  function soundFrame(frame) {
    const a = audio();
    if (!a || !a.enabled()) { snd.levels = snd.from = null; return; }
    let lv = null, from = null;
    if (snd.override) { lv = snd.override; from = "override"; }
    else if (theme && typeof theme.soundscape === "function") {
      try { lv = theme.soundscape(frame); from = "theme"; }
      catch (e) { if (snd.errTheme !== theme.id) { snd.errTheme = theme.id; console.error(`soundscape (${theme.id}):`, e); } }
    }
    if (!lv || typeof lv !== "object") { lv = a.defaultSoundscape(frame); from = "default"; a.defaultCues(frame); }
    else if (a.storm) a.storm.next = null; // a theme with its own soundscape owns its thunder
    snd.levels = lv; snd.from = from;
    a.update(frame, lv);
  }
  const hintEl = document.getElementById("hint");
  function soundHint() {
    const a = audio(), locked = !!a && a.locked();
    if (!locked) snd.lockedSince = null;
    else if (snd.lockedSince === null) snd.lockedSince = performance.now();
    // a context normally starts within a few ms; only a real autoplay block shows the hint
    const show = locked && performance.now() - snd.lockedSince > 400;
    if (!hintEl) return;
    if (show && hintEl.style.display !== "block") { hintEl.textContent = "sound on: press any key or click to start it"; hintEl.style.display = "block"; }
    else if (!show && hintEl.style.display !== "none") hintEl.style.display = "none";
  }

  // ---------------------------------------------------------------- canvas + loop
  const canvas = document.getElementById("wall");
  const ctx = canvas.getContext("2d");
  const env = { width: 0, height: 0, dpr: 1 };
  let theme = null, themeIdx = 0;
  let fade = { a: 0, dir: 0, next: null }; // theme-switch fade through black

  function resize() {
    env.dpr = Math.min(2, window.devicePixelRatio || 1);
    env.width = window.innerWidth; env.height = window.innerHeight;
    canvas.width = Math.round(env.width * env.dpr); canvas.height = Math.round(env.height * env.dpr);
    canvas.style.width = env.width + "px"; canvas.style.height = env.height + "px";
    ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    if (theme && theme.resize) theme.resize(env);
  }

  // ---------------------------------------------------------------- projector boost
  // A dim projector swallows everything near black. Boost lifts the shadows with a gamma curve, applied as a
  // GPU filter on the canvas element (no per-frame cost, no theme changes): true black stays black, so the wall
  // still floats with no grey rectangle; dark tones rise a lot, mid-tones a little, highlights hardly at all.
  // Levels 0 off .. 3 high. G cycles; ?boost=0-3; config [display] boost (hello). A choice made on the wall
  // itself (G or ?boost=) is remembered per device, because it belongs to that projector.
  const BOOST = [null, { e: 0.8, a: 1 }, { e: 0.65, a: 1.03 }, { e: 0.5, a: 1.06 }]; // gamma exponent, gain
  const BOOST_NAMES = ["off", "low", "medium", "high"];
  const BOOST_KEY = "ambient-wall.boost";
  const boost = { level: 0, user: false };
  let boostFuncs = null;
  function boostFilter() {
    if (boostFuncs) return boostFuncs;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    const filter = document.createElementNS(NS, "filter");
    filter.id = "aw-boost";
    filter.setAttribute("color-interpolation-filters", "sRGB"); // curve on the values as displayed, not linear light
    const ct = document.createElementNS(NS, "feComponentTransfer");
    boostFuncs = ["feFuncR", "feFuncG", "feFuncB"].map((n) => {
      const fn = document.createElementNS(NS, n);
      fn.setAttribute("type", "gamma"); fn.setAttribute("offset", "0");
      ct.appendChild(fn);
      return fn;
    });
    filter.appendChild(ct); svg.appendChild(filter); document.body.appendChild(svg);
    return boostFuncs;
  }
  function setBoost(level, user) {
    level = Math.max(0, Math.min(3, Math.round(+level) || 0));
    boost.level = level;
    if (user && !PREVIEW) {
      boost.user = true;
      try { localStorage.setItem(BOOST_KEY, String(level)); } catch (e) { /* storage blocked: still applies */ }
    }
    const p = BOOST[level];
    if (p) {
      for (const fn of boostFilter()) { fn.setAttribute("exponent", String(p.e)); fn.setAttribute("amplitude", String(p.a)); }
      canvas.style.filter = "url(#aw-boost)";
    } else {
      canvas.style.filter = "";
    }
  }
  (function initBoost() {
    const q = qs.get("boost");
    if (q !== null && /^[0-3]$/.test(q)) return setBoost(+q, true);
    let saved = null;
    try { if (!PREVIEW) saved = localStorage.getItem(BOOST_KEY); } catch (e) { /* no storage */ }
    if (saved !== null && /^[0-3]$/.test(saved)) { boost.user = true; return setBoost(+saved); }
    setBoost(cfg.display && cfg.display.boost);
  })();

  // ---------------------------------------------------------------- the cat (js/cat.js, THEMES.md "The cat")
  // K toggles, Shift+K changes the coat (and turns it on); ?cat=1|0|<coat>; config [display] cat / cat_coat (hello);
  // the set_cat command. A choice made on the wall is remembered on that device. frame.cat = { a, coat } | null.
  const CAT_KEY = "ambient-wall.cat";
  // the coats js/cat.js draws (it loads after core, so the list lives here too; tests/test_cat.py keeps them equal)
  const CAT_COATS = ["tabby", "ginger", "black", "grey", "tuxedo", "calico", "siamese", "white"];
  const coatIds = () => CAT_COATS;
  const kitty = { on: false, coat: "tabby", a: 0, user: false };
  function setCat(on, coat, user) {
    if (typeof on === "boolean") kitty.on = on;
    if (typeof coat === "string") {
      const c = coat.trim().toLowerCase();
      if (coatIds().includes(c)) kitty.coat = c; else console.warn("cat: unknown coat", coat);
    }
    if (user && !PREVIEW) {
      kitty.user = true;
      try { localStorage.setItem(CAT_KEY, JSON.stringify({ on: kitty.on, coat: kitty.coat })); } catch (e) { /* no storage */ }
    }
    return { on: kitty.on, coat: kitty.coat };
  }
  (function initCat() {
    setCat(!!(cfg.display && cfg.display.cat), cfg.display && cfg.display.cat_coat);
    try {
      const saved = PREVIEW ? null : JSON.parse(localStorage.getItem(CAT_KEY) || "null");
      if (saved && typeof saved.on === "boolean") { kitty.user = true; setCat(saved.on, saved.coat); }
    } catch (e) { /* no storage / bad value */ }
    const q = qs.get("cat");
    if (q === "1" || q === "0") setCat(q === "1", undefined, true);
    else if (q) setCat(true, q, true);
    kitty.a = kitty.on ? 1 : 0; // on at load = already there, no fade-in
  })();

  function activate(idx) {
    if (theme && theme.destroy) theme.destroy();
    themeIdx = (idx + themes.length) % themes.length;
    theme = themes[themeIdx];
    ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, env.width, env.height);
    if (theme.init) theme.init(ctx, env);
  }
  function switchTheme(idx) {
    if (!themes.length) return;
    if (!theme) return activate(idx);
    fade = { a: fade.a, dir: 1, next: (idx + themes.length) % themes.length };
  }

  let last = performance.now();
  const t0 = last;
  const ovPerf = new Float32Array(120); let ovPerfI = 0; // overlay draw ms, for tests
  function loop(nowMs) {
    const dt = Math.min(0.1, (nowMs - last) / 1000); last = nowMs;
    const now = simNow();
    const m = updateMode(now, dt); // the exhale runs in real time even when the clock is warped
    if (AW.overlay) AW.overlay.step(ov, nowMs / 1000);
    const sig = signals(now);
    const frame = {
      t: (nowMs - t0) / 1000, dt, now,
      mode: m.mode, blend: m.blend, transitioning: m.transitioning,
      ambientElapsed: m.ambientElapsed, override: m.override,
      width: env.width, height: env.height, dpr: env.dpr,
      signals: sig, config: cfg,
      // 0 = night, 1 = full daylight (civil twilight ramp). Drives day scenes, the work backdrop and the
      // brightness budget: mean luminance limit = 25 + 20 * day (THEMES.md rule 2).
      // (tests: AW._debug.forceDay = 0..1 pins it; null = real)
      day: AW._debug.forceDay != null ? U.clamp(+AW._debug.forceDay || 0) : sig.daylight ? sig.daylight.light : 0,
      overlay: ov.panel ? { panel: ov.panel, data: ov.data, a: ov.a, t: ov.t, phase: ov.phase, duration: ov.duration, id: ov.id } : null,
      cat: null,
    };
    // the cat fades in and out over ~1.2 s
    kitty.a = U.clamp(kitty.a + (kitty.on ? 1 : -1) * dt / 1.2);
    if (kitty.a > 0) frame.cat = { a: U.easeInOut(kitty.a), coat: kitty.coat };
    ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    try { theme && theme.render(ctx, frame); }
    catch (e) { console.error(e); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, env.width, env.height); }

    // theme switch fade
    if (fade.dir) {
      fade.a = U.clamp(fade.a + fade.dir * dt / 0.6);
      if (fade.dir > 0 && fade.a >= 1) { activate(fade.next); fade.dir = -1; }
      else if (fade.dir < 0 && fade.a <= 0) fade.dir = 0;
    }
    if (fade.a > 0) { ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0); ctx.fillStyle = `rgba(0,0,0,${fade.a})`; ctx.fillRect(0, 0, env.width, env.height); }

    // the overlay sits on top of everything, including a theme switch (the panel holds while the theme
    // behind it fades through black)
    if (frame.overlay) {
      const o0 = performance.now();
      ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
      try { AW.overlay.render(ctx, frame, theme); } catch (e) { console.error(e); }
      ovPerf[ovPerfI++ % ovPerf.length] = performance.now() - o0;
    }

    // after render, so a theme can cue sounds from its own events (lightning, a passing train) in render()
    try { soundFrame(frame); } catch (e) { console.error(e); }
    soundHint();
    hud(frame);
    window.__AW_FRAME = frame; // for screenshot tooling
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- dev HUD + keys
  const hudEl = document.getElementById("hud");
  let hudOn = qs.get("hud") === "1";
  function hud(f) {
    if (!hudOn) { hudEl.style.display = "none"; return; }
    hudEl.style.display = "block";
    const wx = f.signals.weather;
    const wxName = !usingLive() ? WEATHER[mock.weatherIdx].name : wx ? `${wx.condition} ${(+wx.intensity || 0).toFixed(1)}` : "none";
    const n = f.signals.news;
    const newsTxt = n ? `${n.critical ? "CRITICAL " : ""}${n.rank || "?"}/${n.count || "?"}` : "none";
    const o = f.overlay;
    const ovTxt = o ? `${o.panel} ${o.phase} ${o.a.toFixed(2)}` : "-";
    const np = f.signals.nowPlaying;
    const mmss = (ms) => (typeof ms === "number" ? `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}` : "-");
    const npTxt = np ? `${np.isPlaying ? "playing" : "paused"} ${mmss(np.progressMs)}/${mmss(np.durationMs)}` : "none";
    const a = audio(), as = a ? a.state() : null;
    const sndTxt = !as ? "n/a" : `${!as.enabled ? "off" : as.locked ? "locked" : "on"} ${Math.round(as.volume * 100)}%` +
      (as.enabled && !as.locked ? ` x${as.mode.toFixed(2)} ${snd.from || ""} [${as.active.map((n) => (as.layers[n].source === "sampled" ? n + "*" : n)).join(" ")}]` +
        (as.samples && as.samples.allowed ? ` rec ${as.samples.status} ${(as.samples.decodedBytes / 1048576).toFixed(0)}MB` : "") : "");
    hudEl.textContent =
      `${source()} | ${theme ? theme.id : "-"} | ${f.mode}${f.override ? " (override)" : ""} | blend ${f.blend.toFixed(2)} | ` +
      `ambient ${(f.ambientElapsed / 60).toFixed(0)} min | wx ${wxName} | news ${newsTxt} | overlay ${ovTxt} | ` +
      `music ${npTxt} | sound ${sndTxt} | boost ${BOOST_NAMES[boost.level]} | cat ${kitty.on ? kitty.coat : "off"}${AW.cat && AW.cat.last ? " " + AW.cat.last.pose : ""} | ${U.fmtTime(f.now, { seconds: true })} | warp ${warp}x\n` +
      `keys: 1-9 theme  T next  M mode  [ ] ambient -/+30m  D down  W weather  C cal  N fin  B news  P music  O panels  Esc dismiss  ` +
      `S sound  + - volume  G projector boost  K cat (shift: coat)  L live/mock  F full  H hud`;
  }

  window.addEventListener("pointerdown", soundGesture);
  window.addEventListener("keydown", (e) => {
    soundGesture();
    // overlay keys are for everyone (not only dev installs): O cycles the panels, Esc dismisses
    if (e.key === "Escape") { dismissPanel(); return; }
    if (e.key === "o" || e.key === "O") { if (!e.repeat) cyclePanel(); return; }
    // sound keys are for everyone too: S toggles, + / - volume (not with Ctrl/Cmd: that is browser zoom)
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === "s" || e.key === "S") { if (!e.repeat) toggleSound(); return; }
      const a = audio();
      if (a && (e.key === "+" || e.key === "=")) { setVolume(a.volume() + 0.1, true); return; }
      if (a && (e.key === "-" || e.key === "_")) { setVolume(a.volume() - 0.1, true); return; }
      // projector boost is a setup key, so it works with devKeys off too
      if (e.key === "g" || e.key === "G") { if (!e.repeat) setBoost((boost.level + 1) % BOOST.length, true); return; }
      // the cat, for everyone: K toggles, Shift+K next coat
      if (e.key === "k" || e.key === "K") {
        if (e.repeat) return;
        if (e.shiftKey) { const ids = coatIds(); setCat(true, ids[(ids.indexOf(kitty.coat) + 1) % ids.length], true); }
        else setCat(!kitty.on, undefined, true);
        return;
      }
    }
    if (!cfg.devKeys) return;
    const k = e.key.toLowerCase();
    if ("dwcnbp".includes(k) && k.length === 1) live.forceMock = true; // mock keys act on mock data
    if (/^[1-9]$/.test(k) && +k <= themes.length) { live.userTheme = true; switchTheme(+k - 1); }
    else if (k === "t") { live.userTheme = true; switchTheme(themeIdx + 1); }
    else if (k === "m") {
      const order = [null, "work", "ambient"];
      modeState.override = order[(order.indexOf(modeState.override) + 1) % 3];
      modeState.overrideSince = simNow(); modeState.elapsedOverride = null; modeState.elapsedNudge = 0;
    }
    else if (k === "]") modeState.elapsedNudge += 1800;
    else if (k === "[") modeState.elapsedNudge -= 1800;
    else if (k === "0") modeState.elapsedNudge = 0;
    else if (k === "d") mock.heartbeatDown = !mock.heartbeatDown;
    else if (k === "w") mock.weatherIdx = (mock.weatherIdx + 1) % WEATHER.length;
    else if (k === "c") { mock.calendarOn = !mock.calendarOn; calendarAnchor = null; }
    else if (k === "n") { const o = ["calm", "drift", "warning"]; mock.financeMood = o[(o.indexOf(mock.financeMood) + 1) % 3]; }
    else if (k === "b") mock.newsIdx = (mock.newsIdx + 1) % NEWS.length;
    else if (k === "p") { mock.musicIdx = (mock.musicIdx + 1) % NOWPLAYING.length; mock.musicAt = Date.now(); }
    else if (k === "l" && live.url) live.forceMock = !live.forceMock;
    else if (k === "h") hudOn = !hudOn;
    else if (k === "f") { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
  });

  // ---------------------------------------------------------------- boot
  AW.boot = () => {
    resize();
    window.addEventListener("resize", resize);
    if (!themes.length) { console.error("no themes registered"); return; }
    const want = qs.get("theme") || cfg.theme;
    const idx = Math.max(0, themes.findIndex((t) => t.id === want));
    activate(idx);
    // sound: ?sound=1|0 is a user choice; otherwise config (file:// default off; hello may switch it on)
    setVolume(cfg.display.volume);
    const qsnd = qs.get("sound");
    if (qsnd === "1" || qsnd === "0") setSound(qsnd === "1", true);
    else if (cfg.display.sound) setSound(true);
    requestAnimationFrame(loop);
    if (live.url) { connect(); setInterval(watchdog, 5000); }
    const want0 = qs.get("show");
    if (want0) {
      if (PANELS.includes(want0)) askPanel(want0).then((ok) => { if (ok) ov.origin = `url (${ov.origin})`; });
      else console.warn(`?show=${want0}: unknown panel, ignored`);
    }
  };
  AW._debug = {
    mock, modeState, solar, sunTimes, themes, live, source, NEWS, WEATHER, NOWPLAYING, MOCK_PANELS,
    overlay: ov, overlayPerf: ovPerf, command, project,
    // sound plumbing: override (levels for tests), levels / from (last fed), user / userVol; engine state, meter
    audio: Object.assign(snd, {
      state: () => (AW.audio ? AW.audio.state() : null),
      meter: (ms) => (AW.audio ? AW.audio.meter(ms) : Promise.resolve(null)),
      setSound, setVolume, toggle: toggleSound,
    }),
    forceDay: null, // tests: pin frame.day (0..1); null = the real daylight
    // projector boost: level 0-3, names, setBoost(level, rememberAsUserChoice)
    boost: Object.assign(boost, { names: BOOST_NAMES, presets: BOOST, set: setBoost }),
    // the cat: on, coat, a (fade), user; set(on?, coat?, rememberAsUserChoice)
    cat: Object.assign(kitty, { set: setCat, coats: CAT_COATS }),

    theme: () => (theme ? theme.id : null),
    // tests: switch theme by id; instant = no fade
    setTheme(id, instant) {
      const i = themes.findIndex((t) => t.id === id);
      if (i < 0) return false;
      live.userTheme = true;
      if (instant) { fade = { a: 0, dir: 0, next: null }; activate(i); } else switchTheme(i);
      return true;
    },
    // tests: jump the simulated clock to a local time
    warpTo(iso) { simOffsetMs += new Date(iso).getTime() - simNow().getTime(); },
  };
})();
