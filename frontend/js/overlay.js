// Ambient Wall - info overlay: the ask-only detail panels (forecast, calendar, pulse, finance, news, warnings)
// drawn by core AFTER theme.render(). See THEMES.md "Info overlay". Core owns the state (show / dismiss /
// timing); this file owns the timing curve, layout and drawing.
//
//   AW.overlay.PANELS               panel ids, in O-key order
//   AW.overlay.step(st, now)        advance a state object (core's) to real time `now` (s); returns the level
//   AW.overlay.show(st, panel, data, {duration, now, instant})   start/replace a panel (alpha stays continuous)
//   AW.overlay.dismiss(st, now)     fade out from wherever it is
//   AW.overlay.render(ctx, frame, theme)   theme.renderOverlay() first; the shared renderer unless it returns true
//   AW.overlay.info                 what the last draw laid out: {panel, empty, rows, box, style} (tests, HUD)
//
// Drawing is cheap: every string and glyph becomes a cached sprite when a panel is laid out, so a frame is a
// handful of drawImage calls. Layout is rebuilt only when the panel, data, size or (throttled) style changes.
window.AW = window.AW || {};

(function () {
  const U = AW.util;

  const PANELS = ["forecast", "calendar", "pulse", "finance", "news", "warnings"];
  const FADE_IN = 0.6, FADE_OUT = 1.2, DURATION = 20;
  const TITLES = {
    forecast: "7-day forecast", calendar: "Today", pulse: "Project pulse",
    finance: "Finances", news: "Headlines", warnings: "Weather warnings",
  };
  // A panel with nothing to say shows one quiet line instead of an empty frame.
  const QUIET = {
    forecast: "No forecast right now", calendar: "Nothing today", pulse: "No recent activity",
    finance: "No figures yet", news: "No headlines right now", warnings: "No active warnings",
  };
  const LIMITS = { forecast: 7, calendar: 6, pulse: 5, finance: 6, news: 5, warnings: 3 };
  const SANS = '"Inter", "Segoe UI", "DejaVu Sans", system-ui, sans-serif';
  const VEIL = 0.95; // black veil opacity at full alpha; black is free on a projector

  // ---------------------------------------------------------------- timing
  // st: { panel, data, duration, start, outAt, outFrom, lv, a, t, phase, id }   (times in real seconds)
  // Level lv is linear 0..1: fade in over FADE_IN, hold `duration`, fade out over FADE_OUT (scaled by the
  // level it fades from). a = smoothstep(lv) is what themes and the renderer see.
  const ease = (x) => x * x * (3 - 2 * x);
  function step(st, now) {
    if (!st.panel) { st.phase = "idle"; st.lv = st.a = 0; return 0; }
    const t = now - st.start;
    if (st.outAt === null && t >= FADE_IN + st.duration) { st.outAt = st.start + FADE_IN + st.duration; st.outFrom = 1; }
    let lv, phase;
    if (st.outAt !== null) { lv = st.outFrom - Math.max(0, now - st.outAt) / FADE_OUT; phase = "out"; }
    else if (t < FADE_IN) { lv = Math.max(0, t) / FADE_IN; phase = "in"; }
    else { lv = 1; phase = "hold"; }
    if (lv <= 0 && phase === "out") {
      st.panel = null; st.data = null; st.phase = "idle"; st.lv = st.a = 0; st.t = 0;
      return 0;
    }
    st.lv = U.clamp(lv); st.a = ease(st.lv); st.t = Math.max(0, t); st.phase = phase;
    return st.lv;
  }
  function show(st, panel, data, opts = {}) {
    const now = opts.now;
    const cur = st.panel ? step(st, now) : 0; // replacing a visible panel keeps the veil where it is
    st.panel = panel; st.data = data === undefined ? null : data;
    st.duration = opts.duration > 0 ? opts.duration : DURATION;
    st.outAt = null; st.outFrom = 1;
    st.start = opts.instant ? now - FADE_IN : now - cur * FADE_IN;
    st.id = (st.id || 0) + 1;
    step(st, now);
    return true;
  }
  function dismiss(st, now) {
    if (!st.panel) return false;
    const lv = step(st, now);
    if (!st.panel) return false;
    if (st.outAt === null) { st.outAt = now; st.outFrom = lv; st.phase = "out"; }
    return true;
  }

  // ---------------------------------------------------------------- style
  const WORK = {
    font: SANS,
    ink: { r: 96, g: 196, b: 206 }, dim: { r: 46, g: 112, b: 122 }, accent: { r: 92, g: 204, b: 156 },
    alarm: { r: 226, g: 92, b: 60 }, glow: 0.35, rule: "hairline", caps: false,
  };
  const AMBIENT = {
    font: SANS,
    ink: { r: 214, g: 150, b: 84 }, dim: { r: 128, g: 84, b: 46 }, accent: { r: 206, g: 128, b: 70 },
    alarm: { r: 222, g: 84, b: 56 }, glow: 0.45, rule: "hairline", caps: false,
  };
  const isColor = (c) => c && typeof c === "object" && isFinite(c.r) && isFinite(c.g) && isFinite(c.b);
  const RULES = { hairline: 1, double: 1, none: 1 };
  const warned = new Set();
  function resolveStyle(theme, frame) {
    const b = U.clamp(frame.blend || 0);
    const d = {};
    for (const k of ["ink", "dim", "accent", "alarm"]) d[k] = U.mix(WORK[k], AMBIENT[k], b);
    d.font = SANS; d.glow = U.lerp(WORK.glow, AMBIENT.glow, b); d.rule = "hairline"; d.caps = false; d.place = null;
    d.custom = false;
    if (theme && typeof theme.overlayStyle === "function") {
      let s = null;
      try { s = theme.overlayStyle(frame); }
      catch (e) { if (!warned.has(theme.id)) { warned.add(theme.id); console.error(`overlayStyle (${theme.id}):`, e); } }
      if (s && typeof s === "object") {
        d.custom = true;
        if (typeof s.font === "string" && s.font.trim()) d.font = s.font;
        for (const k of ["ink", "dim", "accent", "alarm"]) if (isColor(s[k])) d[k] = { r: +s[k].r, g: +s[k].g, b: +s[k].b };
        if (isFinite(s.glow)) d.glow = U.clamp(+s.glow);
        if (RULES[s.rule]) d.rule = s.rule;
        if (typeof s.caps === "boolean") d.caps = s.caps;
        if (s.place && isFinite(s.place.x) && isFinite(s.place.y)) d.place = { x: U.clamp(+s.place.x), y: U.clamp(+s.place.y) };
      }
    }
    for (const k of ["ink", "dim", "accent", "alarm"]) d[k] = U.safe(d[k]); // rule 2, whatever the theme said
    const q = (c) => `${c.r >> 2},${c.g >> 2},${c.b >> 2}`;
    d.key = [d.font, d.rule, d.caps, Math.round(d.glow * 20), q(d.ink), q(d.dim), q(d.accent), q(d.alarm),
      d.place ? `${d.place.x.toFixed(3)},${d.place.y.toFixed(3)}` : ""].join("|");
    return d;
  }

  // ---------------------------------------------------------------- sprites
  const sprites = new Map();
  const mc = document.createElement("canvas").getContext("2d"); // measuring only
  const hasLS = "letterSpacing" in mc;
  const fontOf = (px, weight, family) => `${weight} ${Math.round(px)}px ${family}`;
  function setFont(g, px, weight, family, spaced) {
    g.font = fontOf(px, weight, family);
    if (hasLS) g.letterSpacing = spaced ? `${(px * 0.08).toFixed(1)}px` : "0px";
  }
  function measure(text, px, weight, family, spaced) {
    setFont(mc, px, weight, family, spaced);
    return mc.measureText(text).width;
  }
  function fit(text, maxW, px, weight, family, spaced) {
    setFont(mc, px, weight, family, spaced);
    return U.ellipsize(String(text || ""), maxW, mc);
  }
  function cacheSprite(key, make) {
    let s = sprites.get(key);
    if (!s) {
      if (sprites.size > 600) sprites.clear();
      s = make(); sprites.set(key, s);
    }
    return s;
  }
  // A string drawn once (glow pass + crisp pass) into its own canvas.
  function textSprite(text, px, weight, family, color, glow, spaced, dpr) {
    const key = `t|${text}|${px.toFixed(1)}|${weight}|${family}|${color.r | 0},${color.g | 0},${color.b | 0}|${glow.toFixed(2)}|${spaced}|${dpr}`;
    return cacheSprite(key, () => {
      const tw = Math.ceil(measure(text, px, weight, family, spaced));
      const blur = glow > 0 ? px * 0.3 * glow : 0;
      const pad = Math.ceil(blur * 1.6 + 3);
      const w = tw + pad * 2, h = Math.ceil(px * 1.5) + pad * 2;
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.ceil(w * dpr)); c.height = Math.max(1, Math.ceil(h * dpr));
      const g = c.getContext("2d");
      g.scale(dpr, dpr);
      setFont(g, px, weight, family, spaced);
      g.textBaseline = "middle"; g.textAlign = "left";
      if (blur) {
        g.shadowColor = U.rgba(color, 0.7); g.shadowBlur = blur * dpr;
        g.fillStyle = U.rgba(color, 0.45); g.fillText(text, pad, h / 2);
        g.shadowBlur = 0; g.shadowColor = "rgba(0,0,0,0)";
      }
      g.fillStyle = U.rgba(color, 0.96); g.fillText(text, pad, h / 2);
      return { c, w, h, pad, tw };
    });
  }

  // ---------------------------------------------------------------- glyphs (drawn, not emoji)
  // Each draws centred on (0,0) in a box of size s, stroked/filled in `col`.
  function cloud(g, s, dy) {
    const r = s * 0.17;
    g.beginPath();
    g.moveTo(-s * 0.34, dy + r);
    g.arc(-s * 0.2, dy + r * 0.1, r * 0.95, Math.PI * 0.55, Math.PI * 1.45);
    g.arc(s * 0.02, dy - r * 0.55, r * 1.35, Math.PI * 1.08, Math.PI * 1.95);
    g.arc(s * 0.24, dy + r * 0.2, r * 0.85, Math.PI * 1.5, Math.PI * 0.5);
    g.closePath();
  }
  const GLYPHS = {
    clear(g, s, col) {
      g.strokeStyle = U.rgba(col, 1);
      g.beginPath(); g.arc(0, 0, s * 0.17, 0, U.TAU); g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * U.TAU, r0 = s * 0.27, r1 = s * 0.38;
        g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke();
      }
    },
    cloudy(g, s, col) { g.strokeStyle = U.rgba(col, 1); cloud(g, s, 0); g.stroke(); },
    fog(g, s, col) {
      g.strokeStyle = U.rgba(col, 1);
      for (let i = 0; i < 3; i++) {
        const y = (i - 1) * s * 0.15, w = s * (0.36 - (i === 1 ? 0.06 : 0));
        g.beginPath();
        for (let x = -w; x <= w + 0.1; x += w / 6) g.lineTo(x, y + Math.sin(x / s * 14 + i) * s * 0.02);
        g.stroke();
      }
    },
    rain(g, s, col) {
      g.strokeStyle = U.rgba(col, 1); cloud(g, s, -s * 0.1); g.stroke();
      for (let i = -1; i <= 1; i++) {
        const x = i * s * 0.14;
        g.beginPath(); g.moveTo(x + s * 0.03, s * 0.16); g.lineTo(x - s * 0.03, s * 0.34); g.stroke();
      }
    },
    storm(g, s, col) {
      g.strokeStyle = U.rgba(col, 1); cloud(g, s, -s * 0.12); g.stroke();
      g.beginPath();
      g.moveTo(s * 0.04, s * 0.1); g.lineTo(-s * 0.07, s * 0.26); g.lineTo(s * 0.03, s * 0.26); g.lineTo(-s * 0.06, s * 0.42);
      g.stroke();
    },
    snow(g, s, col) {
      g.strokeStyle = U.rgba(col, 1); cloud(g, s, -s * 0.1); g.stroke();
      g.fillStyle = U.rgba(col, 1);
      for (const [x, y] of [[-0.15, 0.22], [0, 0.32], [0.15, 0.22], [-0.07, 0.4], [0.08, 0.41]]) {
        g.beginPath(); g.arc(x * s, y * s, s * 0.028, 0, U.TAU); g.fill();
      }
    },
    // finance mood marks
    calm(g, s, col) {
      g.strokeStyle = U.rgba(col, 1);
      g.beginPath(); g.arc(0, 0, s * 0.3, 0, U.TAU); g.stroke();
      g.fillStyle = U.rgba(col, 1); g.beginPath(); g.arc(0, 0, s * 0.11, 0, U.TAU); g.fill();
    },
    drift(g, s, col) {
      g.strokeStyle = U.rgba(col, 1);
      g.beginPath(); g.arc(0, 0, s * 0.3, 0, U.TAU); g.stroke();
      g.beginPath();
      for (let x = -0.17; x <= 0.171; x += 0.02) g.lineTo(x * s, Math.sin(x * 18) * s * 0.06);
      g.stroke();
    },
    warning(g, s, col) {
      g.strokeStyle = U.rgba(col, 1); g.lineJoin = "round";
      g.beginPath(); g.moveTo(0, -s * 0.34); g.lineTo(s * 0.34, s * 0.27); g.lineTo(-s * 0.34, s * 0.27); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(0, -s * 0.12); g.lineTo(0, s * 0.07); g.stroke();
      g.fillStyle = U.rgba(col, 1); g.beginPath(); g.arc(0, s * 0.16, s * 0.03, 0, U.TAU); g.fill();
    },
    // news + warnings marks
    critical(g, s, col) {
      g.fillStyle = U.rgba(col, 1);
      g.beginPath(); g.moveTo(0, -s * 0.3); g.lineTo(s * 0.3, 0); g.lineTo(0, s * 0.3); g.lineTo(-s * 0.3, 0); g.closePath(); g.fill();
    },
    item(g, s, col) {
      g.fillStyle = U.rgba(col, 1); g.beginPath(); g.arc(0, 0, s * 0.1, 0, U.TAU); g.fill();
    },
    // pulse marks
    alive(g, s, col) {
      g.fillStyle = U.rgba(col, 1); g.beginPath(); g.arc(0, 0, s * 0.16, 0, U.TAU); g.fill();
      g.strokeStyle = U.rgba(col, 0.6); g.beginPath(); g.arc(0, 0, s * 0.32, 0, U.TAU); g.stroke();
    },
    dormant(g, s, col) {
      g.strokeStyle = U.rgba(col, 1); g.beginPath(); g.arc(0, 0, s * 0.18, 0, U.TAU); g.stroke();
    },
    now(g, s, col) {
      g.fillStyle = U.rgba(col, 1); g.beginPath(); g.arc(0, 0, s * 0.18, 0, U.TAU); g.fill();
    },
  };
  function glyphSprite(name, size, color, glow, dpr) {
    if (!GLYPHS[name]) name = "cloudy";
    const key = `g|${name}|${size.toFixed(1)}|${color.r | 0},${color.g | 0},${color.b | 0}|${glow.toFixed(2)}|${dpr}`;
    return cacheSprite(key, () => {
      const blur = glow > 0 ? size * 0.12 * glow : 0;
      const pad = Math.ceil(blur * 1.6 + 3);
      const w = Math.ceil(size) + pad * 2;
      const c = document.createElement("canvas");
      c.width = c.height = Math.ceil(w * dpr);
      const g = c.getContext("2d");
      g.scale(dpr, dpr); g.translate(w / 2, w / 2);
      g.lineWidth = Math.max(1.5, size * 0.055); g.lineCap = "round"; g.lineJoin = "round";
      if (blur) { g.shadowColor = U.rgba(color, 0.6); g.shadowBlur = blur * dpr; }
      GLYPHS[name](g, size, color);
      return { c, w, h: w, pad, tw: size };
    });
  }

  // ---------------------------------------------------------------- data helpers
  const toDate = (v) => {
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v)) { const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d); }
    if (typeof v === "string" || typeof v === "number") { const d = new Date(v); return isNaN(d) ? null : d; }
    return null;
  };
  const num = (v) => (v === null || v === undefined || v === "" || !isFinite(+v) ? null : +v);
  const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
  const deg = (v) => (num(v) === null ? "" : `${Math.round(num(v))}°`);
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // Is there anything to show? (null data, or an empty list, = the quiet line)
  function isEmpty(panel, data) {
    if (!data || typeof data !== "object") return true;
    switch (panel) {
      case "forecast": return !list(data.days).length;
      case "calendar": return !list(data.events).length;
      case "pulse": return !list(data.repos).length;
      case "news": case "warnings": return !list(data.items).length;
      case "finance": return num(data.income) === null && num(data.spent) === null && num(data.net) === null
        && num(data.balance) === null && !list(data.categories).length;
      default: return true;
    }
  }

  // ---------------------------------------------------------------- layout
  // Builds a list of ops relative to the panel's top-left: {s: sprite, x, y, al, pulse} (x = text left edge,
  // y = centre line), {line: [x1,y1,x2,y2], c, al, lw}, {rect: [x,y,w,h], c, al}.
  function build(o, frame, st) {
    const W = frame.width, H = frame.height, dpr = frame.dpr || 1;
    const S = Math.max(0.45, Math.min(H / 1080, W / 1720));
    const PW = Math.round(Math.min(W - 80 * S, 1320 * S));
    const P = Math.round(54 * S), IW = PW - 2 * P;
    const ops = [];
    const fam = st.font, gl = st.glow, sp = st.caps;
    const cfg = AW.config || {};
    const h24 = !(cfg.clock && cfg.clock.hour24 === false);
    const now = frame.now instanceof Date ? frame.now : new Date();
    const cap = (s) => (st.caps ? String(s).toUpperCase() : String(s));

    // text at (x, y): align "l" | "r" | "c"
    const T = (text, x, y, px, color, { w = 400, al = 1, align = "l", spaced = false, pulse = false } = {}) => {
      if (text === null || text === undefined || text === "") return 0;
      const s = textSprite(String(text), px * S, w, fam, color, gl, spaced && sp, dpr);
      const left = align === "r" ? x - s.tw : align === "c" ? x - s.tw / 2 : x;
      ops.push({ s, x: left, y, al, pulse });
      return s.tw;
    };
    const G = (name, x, y, size, color, { al = 1, pulse = false } = {}) => {
      const s = glyphSprite(name, size * S, color, gl, dpr);
      ops.push({ s, x: x - s.tw / 2, y, al, pulse });
    };
    const M = (text, px, w = 400, spaced = false) => measure(String(text), px * S, w, fam, spaced && sp);
    const F = (text, maxW, px, w = 400) => fit(text, maxW, px * S, w, fam, false);
    const rule = (y) => {
      if (st.rule === "none") return;
      ops.push({ line: [P, y, PW - P, y], c: st.dim, al: 0.7, lw: 1 });
      if (st.rule === "double") ops.push({ line: [P, y + 4 * S, PW - P, y + 4 * S], c: st.dim, al: 0.45, lw: 1 });
    };

    const data = o.data && typeof o.data === "object" ? o.data : null;
    const panel = o.panel;
    const title = cap((data && typeof data.title === "string" && data.title) || TITLES[panel] || panel);
    const yT = P + 24 * S;
    T(title, P, yT, 44, st.accent, { w: 600, spaced: true });
    const sub = (text, color = st.dim) => T(text, PW - P, yT + 4 * S, 30, color, { align: "r", spaced: true });
    const yR = P + 66 * S;
    rule(yR);
    let y = yR + 40 * S;
    let rows = 0;
    const empty = isEmpty(panel, data);

    if (empty) {
      if (panel === "calendar") sub(cap(U.fmtDate(now)));
      T(QUIET[panel] || "Nothing today", PW / 2, y + 30 * S, 38, st.dim, { align: "c" });
      y += 80 * S;
    } else if (panel === "forecast") {
      const days = list(data.days).slice(0, LIMITS.forecast);
      const colW = IW / Math.max(days.length, 5);
      const x0 = P + (IW - colW * days.length) / 2;
      days.forEach((d, i) => {
        const cx = x0 + colW * (i + 0.5);
        const dt = toDate(d.date);
        const label = cap(d.label || (dt ? dt.toLocaleDateString("en-CA", { weekday: "short" }) : ""));
        T(F(label, colW - 10 * S, 30, 500), cx, y + 14 * S, 30, i === 0 ? st.accent : st.dim, { w: 500, align: "c", spaced: true });
        G(String(d.condition || "cloudy"), cx, y + 92 * S, 78, st.ink);
        T(deg(d.hiC), cx, y + 176 * S, 52, st.ink, { w: 500, align: "c" });
        T(deg(d.loC), cx, y + 228 * S, 36, st.dim, { align: "c" });
        let pop = num(d.pop);
        const mm = num(d.precipMm);
        if (pop !== null && pop > 0 && pop < 1) pop *= 100; // a fraction, not a percentage
        const wet = pop !== null && pop >= 10 ? `${Math.round(pop)}%` : mm !== null && mm >= 1 ? `${Math.round(mm)} mm` : "";
        T(wet, cx, y + 272 * S, 27, st.dim, { align: "c" });
        rows++;
      });
      y += 300 * S;
    } else if (panel === "calendar") {
      sub(cap(U.fmtDate(now)));
      const ev = list(data.events).slice().sort((a, b) =>
        (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0) || ((toDate(a.start) || 0) - (toDate(b.start) || 0)));
      const more = ev.length > LIMITS.calendar ? ev.length - (LIMITS.calendar - 1) : 0;
      const shown = more ? ev.slice(0, LIMITS.calendar - 1) : ev;
      const timeW = Math.max(M("00:00", 40, 500), M("All day", 34, 500), h24 ? 0 : M("12:00 pm", 40, 500)) + 36 * S;
      const rowH = 68 * S;
      const next = shown.find((e) => !e.allDay && toDate(e.start) && toDate(e.start) > now);
      for (const e of shown) {
        const yc = y + rowH / 2;
        const s = toDate(e.start), en = toDate(e.end);
        const past = en ? en < now : s ? s < now && !e.allDay : false;
        const current = !e.allDay && s && s <= now && (!en || en > now);
        const al = past ? 0.42 : 1;
        if (current) G("now", P - 22 * S, yc, 30, st.accent);
        const tt = e.allDay ? cap("All day") : s ? U.fmtTime(s, { hour24: h24 }) : "";
        T(tt, P, yc, e.allDay ? 34 : 40, current || e === next ? st.accent : st.dim, { w: 500, al });
        const loc = typeof e.location === "string" && e.location ? F(e.location, IW * 0.3, 28) : "";
        const locW = loc ? M(loc, 28) + 30 * S : 0;
        T(F(e.title || "(untitled)", IW - timeW - locW, 42), P + timeW, yc, 42, st.ink, { al });
        if (loc) T(loc, PW - P, yc + 2 * S, 28, st.dim, { align: "r", al });
        y += rowH; rows++;
      }
      if (more) { T(`+${more} more`, P + timeW, y + 26 * S, 30, st.dim); y += 56 * S; }
    } else if (panel === "pulse") {
      const repos = list(data.repos).slice(0, LIMITS.pulse);
      const rowH = 84 * S, nameW = IW * 0.34, ageW = 190 * S, markW = 52 * S;
      for (const r of repos) {
        const yc = y + rowH / 2;
        const alive = r.status !== "dormant";
        G(alive ? "alive" : "dormant", P + 16 * S, yc, 40, alive ? st.accent : st.dim);
        const name = F(String(r.name || "").replace(/^[^/]+\//, ""), nameW - 24 * S, 40, 500);
        T(name, P + markW, yc, 40, alive ? st.ink : st.dim, { w: 500 });
        const when = toDate(r.pushedAt) || toDate(r.lastCommit && typeof r.lastCommit === "object" ? r.lastCommit.date : r.lastCommit);
        T(when ? U.fmtAgo(when, now) : "", PW - P, yc, 28, st.dim, { align: "r" });
        const msg = r.message || (r.lastCommit && typeof r.lastCommit === "object" && r.lastCommit.message) || "";
        const firstLine = String(msg).split("\n")[0];
        T(F(firstLine, IW - markW - nameW - ageW, 29), P + markW + nameW, yc + 2 * S, 29, st.dim);
        y += rowH; rows++;
      }
    } else if (panel === "finance") {
      const m = String(data.month || "");
      const mm = /^(\d{4})-(\d\d)/.exec(m);
      sub(cap(mm ? `${MONTHS[+mm[2] - 1]} ${mm[1]}` : m));
      const mood = ["calm", "drift", "warning"].includes(data.mood) ? data.mood : null;
      const moodCol = mood === "warning" ? st.alarm : mood === "drift" ? U.safe(U.mix(st.ink, st.alarm, 0.55)) : st.accent;
      const net = num(data.net) !== null ? num(data.net)
        : num(data.income) !== null && num(data.spent) !== null ? num(data.income) - num(data.spent) : null;
      const cols = [
        ["Income", num(data.income), st.ink, false],
        ["Spent", num(data.spent), st.ink, false],
        ["Net", net, moodCol, true],
        ["Balance", num(data.balance), st.dim, false],
      ].filter((c) => c[1] !== null);
      const gx = mood ? 84 * S : 0;
      if (mood) G(mood, P + 30 * S, y + 52 * S, 62, moodCol, { pulse: mood === "warning" });
      const cw = (IW - gx) / Math.max(1, cols.length);
      cols.forEach(([label, v, col, signed], i) => {
        const x = P + gx + cw * i;
        T(cap(label), x, y + 14 * S, 26, st.dim, { w: 500, spaced: true });
        T(U.fmtMoney(v, { sign: signed }), x, y + 66 * S, 52, col, { w: 500 });
      });
      y += 112 * S;
      let cats = list(data.categories).filter((c) => num(c.amount) !== null);
      const spend = cats.filter((c) => c.kind !== "income");
      if (spend.length) cats = spend;
      cats = cats.slice().sort((a, b) => Math.abs(num(b.amount)) - Math.abs(num(a.amount))).slice(0, LIMITS.finance);
      if (cats.length) {
        rule(y); y += 26 * S;
        const max = Math.max(...cats.map((c) => Math.abs(num(c.amount)))) || 1;
        const half = (IW - 60 * S) / 2, rowH = 70 * S;
        cats.forEach((c, i) => {
          const col = i % 2, row = Math.floor(i / 2);
          const x = P + col * (half + 60 * S), yc = y + row * rowH + 24 * S;
          const amt = U.fmtMoney(num(c.amount), { sign: c.kind === "income" });
          const aw = M(amt, 34);
          T(F(c.name || "", half - aw - 24 * S, 34), x, yc, 34, st.ink);
          T(amt, x + half, yc, 34, c.kind === "income" ? st.accent : st.dim, { align: "r" });
          ops.push({ rect: [x, yc + 24 * S, half * Math.abs(num(c.amount)) / max, Math.max(2, 4 * S)], c: st.dim, al: 0.55 });
          rows++;
        });
        y += Math.ceil(cats.length / 2) * rowH;
      }
    } else if (panel === "news") {
      const items = list(data.items).slice(0, LIMITS.news);
      const rowH = 100 * S, markW = 46 * S;
      for (const it of items) {
        const crit = !!it.critical;
        const y1 = y + 30 * S, y2 = y + 70 * S;
        G(crit ? "critical" : "item", P + 12 * S, y1, crit ? 34 : 30, crit ? st.alarm : st.dim, { pulse: crit });
        T(F(it.headline || "", IW - markW, 38, crit ? 500 : 400), P + markW, y1, 38, crit ? st.alarm : st.ink, { w: crit ? 500 : 400 });
        const pub = toDate(it.published);
        const meta = [it.source, pub ? U.fmtAgo(pub, now) : ""].filter(Boolean).join("  ·  ");
        T(F(meta, IW - markW, 26), P + markW, y2, 26, st.dim);
        y += rowH; rows++;
      }
      y -= 6 * S;
    } else if (panel === "warnings") {
      const items = list(data.items).slice(0, LIMITS.warnings);
      const rowH = 112 * S, markW = 62 * S;
      for (const it of items) {
        const sev = String(it.severity || "warning").toLowerCase();
        const hot = sev === "warning" || sev === "red" || sev === "severe";
        const col = hot ? st.alarm : sev === "watch" || sev === "orange" ? U.safe(U.mix(st.ink, st.alarm, 0.55)) : st.accent;
        const y1 = y + 34 * S, y2 = y + 78 * S;
        G("warning", P + 20 * S, y1, 46, col, { pulse: hot });
        T(F(it.headline || "", IW - markW, 40, 500), P + markW, y1, 40, hot ? col : st.ink, { w: 500 });
        const iss = toDate(it.issued), exp = toDate(it.expires);
        const sameDay = (d) => d.toDateString() === now.toDateString();
        const when = (d) => (sameDay(d) ? "" : d.toLocaleDateString("en-CA", { weekday: "short" }) + " ") + U.fmtTime(d, { hour24: h24 });
        const meta = [it.severity ? cap(sev[0].toUpperCase() + sev.slice(1)) : "", iss ? `issued ${when(iss)}` : "", exp ? `until ${when(exp)}` : ""]
          .filter(Boolean).join("  ·  ");
        T(F(meta, IW - markW, 27), P + markW, y2, 27, st.dim);
        y += rowH; rows++;
      }
    }
    const PH = Math.round(y + P * 0.8);
    return { ops, PW, PH, S, rows, empty, title, quiet: empty ? QUIET[panel] || "Nothing today" : null };
  }

  // Black rounded veil with a soft edge, cached per size.
  let veil = { key: "", c: null, m: 0 };
  function veilSprite(PW, PH, S, dpr) {
    const key = `${PW}|${PH}|${S.toFixed(3)}|${dpr}`;
    if (veil.key === key) return veil;
    const m = Math.round(70 * S), r = 34 * S, f = 46 * S;
    const w = PW + m * 2, h = PH + m * 2;
    const c = veil.c && veil.key ? veil.c : document.createElement("canvas");
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const inset = m - f * 0.25;
    g.fillStyle = "#000"; g.shadowColor = "#000"; g.shadowBlur = f * dpr;
    for (let i = 0; i < 2; i++) {
      g.beginPath();
      if (g.roundRect) g.roundRect(inset, inset, w - inset * 2, h - inset * 2, r);
      else g.rect(inset, inset, w - inset * 2, h - inset * 2);
      g.fill();
    }
    veil = { key, c, m, w, h };
    return veil;
  }

  // ---------------------------------------------------------------- draw
  const cache = { id: -1, data: null, panel: null, w: 0, h: 0, dpr: 0, key: "", at: -1, L: null };
  const info = { panel: null, empty: false, quiet: null, rows: 0, box: null, style: null, title: null, builds: 0, custom: false };

  function draw(ctx, frame, theme) {
    const o = frame.overlay;
    if (!o || !(o.a > 0)) return;
    const st = resolveStyle(theme, frame);
    const same = cache.id === o.id && cache.data === o.data && cache.panel === o.panel &&
      cache.w === frame.width && cache.h === frame.height && cache.dpr === frame.dpr;
    // style drifts with blend during the exhale: re-lay out at most twice a second for that
    if (!same || (cache.key !== st.key && frame.t - cache.at > 0.5)) {
      cache.L = build(o, frame, st);
      Object.assign(cache, { id: o.id, data: o.data, panel: o.panel, w: frame.width, h: frame.height, dpr: frame.dpr, key: st.key, at: frame.t });
      info.builds++;
    }
    const L = cache.L;
    const W = frame.width, H = frame.height;
    const place = st.place || { x: 0.5, y: 0.5 };
    const bx = Math.round(U.clamp(W * place.x - L.PW / 2, 8, Math.max(8, W - L.PW - 8)));
    const by = Math.round(U.clamp(H * place.y - L.PH / 2, 8, Math.max(8, H - L.PH - 8)));
    Object.assign(info, { panel: o.panel, empty: L.empty, quiet: L.quiet, rows: L.rows, title: L.title, box: { x: bx, y: by, w: L.PW, h: L.PH }, style: st });

    const v = veilSprite(L.PW, L.PH, L.S, frame.dpr || 1);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowBlur = 0; ctx.shadowColor = "rgba(0,0,0,0)"; ctx.filter = "none";
    ctx.globalAlpha = U.clamp(o.a * VEIL);
    ctx.drawImage(v.c, bx - v.m, by - v.m, v.w, v.h);
    const pulse = 0.78 + 0.22 * Math.sin((frame.t || 0) * 2.4);
    for (const op of L.ops) {
      const al = o.a * (op.al === undefined ? 1 : op.al) * (op.pulse ? pulse : 1);
      if (al <= 0.003) continue;
      ctx.globalAlpha = U.clamp(al);
      if (op.s) ctx.drawImage(op.s.c, bx + op.x - op.s.pad, by + op.y - op.s.h / 2, op.s.w, op.s.h);
      else if (op.line) {
        ctx.strokeStyle = U.rgba(op.c, 1); ctx.lineWidth = op.lw || 1;
        ctx.beginPath(); ctx.moveTo(bx + op.line[0], by + op.line[1] + 0.5); ctx.lineTo(bx + op.line[2], by + op.line[3] + 0.5); ctx.stroke();
      } else if (op.rect) {
        ctx.fillStyle = U.rgba(op.c, 1); ctx.fillRect(bx + op.rect[0], by + op.rect[1], op.rect[2], op.rect[3]);
      }
    }
    ctx.restore();
  }

  // Core calls this after theme.render() (and after the theme-switch fade) whenever frame.overlay is set.
  function render(ctx, frame, theme) {
    if (!frame.overlay) return;
    let custom = false;
    if (theme && typeof theme.renderOverlay === "function") {
      ctx.save();
      try { custom = theme.renderOverlay(ctx, frame) === true; }
      catch (e) { console.error(`renderOverlay (${theme.id}):`, e); custom = false; }
      ctx.restore();
    }
    info.custom = custom;
    if (!custom) draw(ctx, frame, theme);
  }

  AW.overlay = {
    PANELS, TITLES, QUIET, LIMITS, FADE_IN, FADE_OUT, DURATION,
    step, show, dismiss, render, draw, resolveStyle, isEmpty, info,
    _sprites: sprites,
  };
})();
