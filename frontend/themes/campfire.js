// Ambient Wall - CAMPFIRE theme: "a fire that burns down over the evening".
// Work: the cold camp. A moonlit blue-grey field notebook: a clean hero clock, the sun's arc with the
//       light left, the next entry, the ledger, a weather sliver. At the bottom centre an unlit fire
//       lay in hairline: logs, a ring of stones, grey-blue ash. The hosts are two coals in that ash.
//       It holds still: a quiet promise of the evening.
// Ambient: the fire is the painting. Struck at the exhale (a spark, a catch, flames spreading from the
//       kindling), then its size is a pure function of frame.ambientElapsed: full and lively early in
//       the evening, settling over hours, down to a bed of breathing coals and a thin wisp of smoke by
//       ~5-6 h. Layered noise-driven tongues (rendered small and upscaled for softness), charred logs
//       with glowing cracks that collapse as they burn, rising sparks, curling smoke, a dim warm light
//       pool and stones rim-lit by the flames. The clock floats above, lit by it.
//       The real weather is over it: stars on a clear night, none under cloud (the smoke flattens), a
//       haze ring catching the firelight in fog, rain streaking through the light and hissing to steam on
//       the coals, a storm's wind bowing the flames with dim lightning far off, snow melting as it falls
//       into the light and dusting the cooler stones. Wind leans flames, sparks and smoke in all of it.
// The exhale: everything interpolates on frame.blend. The notebook fades and drifts in a staggered
//       cascade, the lay catches, blue-grey warms to ember. Back to work the fire collapses to grey ash
//       quickly and the cold notebook returns.
(function () {
  const U = AW.util;
  const TAU = Math.PI * 2;
  const MONO = 'ui-monospace, "DejaVu Sans Mono", "Cascadia Mono", Consolas, monospace';
  const SANS = '"Inter", "Segoe UI", "DejaVu Sans", system-ui, sans-serif';
  const SERIF = '"Cormorant Garamond", "EB Garamond", Garamond, Georgia, "DejaVu Serif", serif';
  const FAM = { mono: MONO, sans: SANS, serif: SERIF };
  const hex = U.hex;

  const C = {
    // work: moonlit cold camp
    moon: hex("#7cb8ca"),      // hero work colour: moonlit cold cyan
    cold: hex("#5e9aae"),
    coldDim: hex("#40707f"),
    coldFaint: hex("#2c4c5a"),
    ash: hex("#5a6e7a"),       // grey-blue ash
    frost: hex("#6cd0dc"),
    pine: hex("#58c2a6"),      // calm money: cold green
    straw: hex("#a8a86c"),
    alarm: hex("#e0582a"),
    flare: hex("#e07c36"),
    // ambient: ember
    amber: hex("#d4904e"),     // ambient clock
    whisper: hex("#b8784a"),
    ovDim: hex("#86563a"),     // overlay secondary text by the fire: a dim ember brown
    fOuter: hex("#6c1a0c"),
    fMid: hex("#a8381a"),
    fInner: hex("#c65a1e"),
    fCore: hex("#d6802e"),     // the brightest point on the wall: deep amber, never yellow-white
    coalHot: hex("#d4722a"),
    coalWarm: hex("#a03614"),
    coalDim: hex("#3c1208"),
    pool: hex("#8a3410"),
    halo: hex("#7a2a10"),
    rim: hex("#b4562a"),
    crack: hex("#d06a26"),
    host: hex("#d88a3a"),
    hostDown: hex("#e0502a"),
    smokeLo: hex("#5e4c48"),
    smokeHi: hex("#30384a"),
    star: hex("#6878b4"),
    duskRose: hex("#4a1e40"),
    duskEmber: hex("#5a2414"),
    nightBlue: hex("#14204a"),
    dayBlue: hex("#1c3a5a"),
    rain: hex("#4a6284"),
    steam: hex("#5c6270"),
    // weather
    rainMid: hex("#6c5a5c"),   // a drop half in the firelight
    rainLit: hex("#a8663a"),   // a drop streaking right past the flames
    steamLit: hex("#6c5446"),
    snow: hex("#7c8aa8"),      // cold flake / dusting: dim blue-grey, never white
    snowLit: hex("#b07c58"),   // a flake caught in the firelight just before it melts
    fogWarm: hex("#6e3a1e"),   // haze catching the fire
    fogCool: hex("#26303e"),
    flash: hex("#45427e"),     // distant lightning: dim violet, never white
    bolt: hex("#7470a8"),
  };
  const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const NODASH = [], DASH = [0, 0];

  let W = 0, H = 0, dpr = 1, S = 1, built = "";
  let mctx = null, LS = false;

  // ------------------------------------------------------------------ offscreen helpers
  function mk(wCss, hCss, scale) {
    const k = scale || dpr;
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.ceil(wCss * k)); cv.height = Math.max(1, Math.ceil(hCss * k));
    const c = cv.getContext("2d"); c.setTransform(k, 0, 0, k, 0, 0);
    return { cv, c, w: wCss, h: hCss };
  }
  const ck = (c) => `${c.r | 0},${c.g | 0},${c.b | 0}`;
  const fade = (b, a0, a1) => 1 - U.smoothstep(a0, a1, b);
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const pad2 = (n) => (n < 10 ? "0" : "") + n;

  // Precomputed css colour ramps (no per-frame string building in the hot loops).
  function ramp(stops, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(u));
      out.push(U.rgba(U.safe(U.mix(stops[k], stops[k + 1], u - k)), 1));
    }
    return out;
  }
  const RN = 32;
  const COAL_R = ramp([C.coalDim, C.coalWarm, C.coalHot], RN);
  const SPARK_R = ramp([hex("#4a1206"), hex("#a8381a"), hex("#d27e2e")], RN);
  const SPARK_H = ramp([hex("#5a1006"), hex("#c03a1a"), hex("#e0602c")], RN);
  const ASH_CSS = U.rgba(U.safe(C.ash), 1);
  const ASH_WARM = "rgb(46,38,36)";  // grey skin of ash on a live coal (lit warm, kept dim)

  // Text sprites: glow rendered once per (text, size, colour), then blitted. No per-frame shadowBlur.
  const sprites = new Map();
  function sprite(str, o) {
    const px = Math.round(o.px);
    const fam = o.font || "sans";
    const key = `${str}|${px}|${o.weight || 400}|${fam}|${o.italic ? 1 : 0}|${o.spacing || 0}|${ck(o.color)}|${o.glow || 0}|${o.core || 0}`;
    let s = sprites.get(key);
    if (s) { sprites.delete(key); sprites.set(key, s); return s; }
    const font = `${o.italic ? "italic " : ""}${o.weight || 400} ${px}px ${FAM[fam]}`;
    const sp = (o.spacing || 0) * px;
    if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); LS = "letterSpacing" in mctx; }
    mctx.font = font; if (LS) mctx.letterSpacing = `${sp}px`;
    const tw = Math.max(1, mctx.measureText(str).width - (LS ? sp : 0));
    const g = o.glow || 0;
    const pad = Math.ceil(g * 2.3 + px * 0.08 + 4);
    const w = Math.ceil(tw + pad * 2 + sp), h = Math.ceil(px * 1.3 + pad * 2);
    const { cv, c } = mk(w, h);
    c.font = font; if (LS) c.letterSpacing = `${sp}px`;
    c.textAlign = "left"; c.textBaseline = "middle";
    const col = U.safe(o.color);
    const x = pad, y = h / 2 + px * 0.03;
    if (g > 0) {
      c.shadowColor = U.rgba(col, 0.85);
      c.shadowBlur = g * 2 * dpr; c.fillStyle = U.rgba(col, 0.2); c.fillText(str, x, y);
      c.shadowBlur = g * dpr; c.fillStyle = U.rgba(col, 0.3); c.fillText(str, x, y);
      c.shadowBlur = 0;
    }
    c.fillStyle = U.rgba(col, o.core || 0.9); c.fillText(str, x, y);
    s = { cv, w, h, pad, tw };
    sprites.set(key, s);
    if (sprites.size > 72) sprites.delete(sprites.keys().next().value);
    return s;
  }
  // align: "left" | "center" | "right"; x,y = anchor, y = vertical middle
  function text(ctx, str, x, y, o, align, alpha) {
    if (!str || alpha <= 0.004) return 0;
    const s = sprite(str, o);
    const dx = align === "left" ? x - s.pad : align === "right" ? x - s.pad - s.tw : x - s.w / 2;
    ctx.globalAlpha = U.clamp(alpha);
    ctx.drawImage(s.cv, dx, y - s.h / 2, s.w, s.h);
    ctx.globalAlpha = 1;
    return s.tw;
  }

  // News: the headline laid out once per (text, size, width) into one line, or two with the second cut
  // at a word boundary, measured in the sprite's own font. Re-laid only when the headline changes.
  const NL = { key: "", lines: null };
  function newsLines(str, o, maxW) {
    const px = Math.round(o.px), font = `${o.italic ? "italic " : ""}${o.weight || 400} ${px}px ${FAM[o.font || "sans"]}`;
    const key = `${str}|${font}|${Math.round(maxW)}`;
    if (NL.key === key) return NL.lines;
    if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); LS = "letterSpacing" in mctx; }
    mctx.font = font; if (LS) mctx.letterSpacing = "0px";
    let lines;
    if (mctx.measureText(str).width <= maxW) lines = [str];
    else {
      const words = str.split(/\s+/);
      let l1 = "", i = 0;
      for (; i < words.length; i++) {
        const nx = l1 ? l1 + " " + words[i] : words[i];
        if (mctx.measureText(nx).width > maxW) break;
        l1 = nx;
      }
      if (!l1) lines = [U.ellipsize(str, maxW, mctx)];
      else {
        const rest = words.slice(i).join(" "), wOf = (a, z) => mctx.measureText(words.slice(a, z).join(" ")).width;
        if (mctx.measureText(rest).width <= maxW) {
          // both fit: move the break back toward the middle so the two lines balance (no orphan word)
          let best = i, bestD = Infinity;
          for (let j = 1; j <= i; j++) {
            const w2 = wOf(j, words.length), dd = Math.abs(wOf(0, j) - w2);
            if (w2 <= maxW && dd < bestD) { bestD = dd; best = j; }
          }
          lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
        } else lines = [l1, U.ellipsize(rest, maxW, mctx)];
      }
    }
    NL.key = key; NL.lines = lines;
    return lines;
  }
  // a short whisper of the headline (ambient, critical only): one line, cut at a word
  const NW = { key: "", line: "" };
  function newsWhisper(str, o, maxW) {
    const px = Math.round(o.px), font = `${o.italic ? "italic " : ""}${o.weight || 400} ${px}px ${FAM[o.font || "sans"]}`;
    const key = `${str}|${font}|${Math.round(maxW)}`;
    if (NW.key === key) return NW.line;
    if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); LS = "letterSpacing" in mctx; }
    mctx.font = font; if (LS) mctx.letterSpacing = "0px";
    NW.key = key; NW.line = U.ellipsize(str, maxW, mctx);
    return NW.line;
  }
  // "35 min", "2 h", "just now"; null when there is no usable date
  function newsAge(pub, now) {
    const p = pub instanceof Date ? pub.getTime() : Date.parse(pub);
    if (!isFinite(p)) return null;
    const m = Math.max(0, Math.round((now.getTime() - p) / 60000));
    if (m < 1) return "just now";
    return m < 48 * 60 ? U.fmtMinutes(m) : `${Math.round(m / 1440)} d`;
  }

  // Now playing: "title — artist" cut to its width once per (track, font, width, prefix) with U.ellipsize in
  // the sprite's own font, one slot per face (the notebook line, the whisper by the seat). The sprites are
  // cached, so a frame only blits.
  const NPS = { work: { t: null, a: null, f: "", w: 0, p: "", s: "" }, amb: { t: null, a: null, f: "", w: 0, p: "", s: "" } };
  function npText(slot, np, o, maxW, prefix) {
    const c = NPS[slot], w = Math.round(maxW), px = Math.round(o.px);
    const font = `${o.italic ? "italic " : ""}${o.weight || 400} ${px}px ${FAM[o.font || "sans"]}`;
    if (c.t === np.title && c.a === np.artist && c.f === font && c.w === w && c.p === prefix) return c.s;
    const title = np.title != null ? String(np.title).trim() : "", artist = np.artist != null ? String(np.artist).trim() : "";
    const full = title && artist ? `${title} — ${artist}` : title || artist;
    if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); LS = "letterSpacing" in mctx; }
    mctx.font = font; if (LS) mctx.letterSpacing = "0px";
    c.t = np.title; c.a = np.artist; c.f = font; c.w = w; c.p = prefix;
    c.s = full ? U.ellipsize(prefix + full, w, mctx) : "";
    return c.s;
  }
  const hasTrack = (np) => !!(np && (np.title || np.artist));
  // Album art (same-origin URL): loaded once per URL, a failure remembered, baked once into a small square.
  const ART = new Map();
  function artThumb(url, size) {
    if (!url || typeof url !== "string") return null;
    let a = ART.get(url);
    if (!a) {
      if (ART.size >= 8) ART.clear();
      a = { ok: false, bad: false, img: new Image(), cv: null, px: 0 };
      a.img.onload = () => { a.ok = a.img.naturalWidth > 0 && a.img.naturalHeight > 0; a.bad = !a.ok; };
      a.img.onerror = () => { a.bad = true; };
      a.img.src = url;
      ART.set(url, a);
    }
    if (!a.ok || a.bad) return null;
    const px = Math.max(1, Math.round(size * dpr));
    if (a.px !== px) {
      try {
        const cv = document.createElement("canvas"); cv.width = cv.height = px;
        const c = cv.getContext("2d"), iw = a.img.naturalWidth, ih = a.img.naturalHeight, m = Math.min(iw, ih);
        c.imageSmoothingQuality = "high";
        c.drawImage(a.img, (iw - m) / 2, (ih - m) / 2, m, m, 0, 0, px, px);   // centre-cropped square
        a.cv = cv; a.px = px;
      } catch (e) { a.bad = true; return null; }
    }
    return a.cv;
  }
  // the pause mark: two short bars, left edge at x, centred on y
  function pauseMark(ctx, x, y, h, col, a) {
    if (a <= 0.004) return;
    const w = h * 0.3, g = h * 0.28;
    ctx.globalAlpha = U.clamp(a); ctx.fillStyle = U.rgba(U.safe(col), 1);
    ctx.fillRect(x, y - h / 2, w, h); ctx.fillRect(x + w + g, y - h / 2, w, h);
    ctx.globalAlpha = 1;
  }

  // Sound (THEMES.md "Sound"): render() leaves what the fire is doing here and cues its own events (a log
  // settling, a host's coal popping, the strike, lightning); soundscape() turns it into layer levels after
  // render and keeps the rare sound-only events (an owl, a drip off the kettle).
  const SND = { fire: 0, settle: 0, strike: 0, armed: false, owlAt: -1, dripAt: -1 };
  const LV = { fire: 0, rain: 0, wind: 0, forest: 0, crickets: 0, birds: 0 };
  const cue = (name, o) => { const a = AW.audio; if (a && a.cue) a.cue(name, o); };
  const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);

  // Radial glow sprites, one per quantised colour. "soft" is a wide, gentle falloff for pools and washes.
  const glows = new Map();
  function glowSprite(col, soft) {
    const c = U.safe(col);
    const key = `${(c.r / 6) | 0},${(c.g / 6) | 0},${(c.b / 6) | 0}|${soft ? 1 : 0}`;
    let s = glows.get(key);
    if (s) return s;
    s = document.createElement("canvas"); s.width = s.height = 128;
    const x = s.getContext("2d");
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    if (soft) {
      g.addColorStop(0, U.rgba(c, 1)); g.addColorStop(0.3, U.rgba(c, 0.62));
      g.addColorStop(0.62, U.rgba(c, 0.2)); g.addColorStop(1, U.rgba(c, 0));
    } else {
      g.addColorStop(0, U.rgba(c, 1)); g.addColorStop(0.14, U.rgba(c, 0.6));
      g.addColorStop(0.4, U.rgba(c, 0.16)); g.addColorStop(1, U.rgba(c, 0));
    }
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    if (glows.size > 60) glows.clear();
    glows.set(key, s);
    return s;
  }
  function glow(ctx, col, x, y, rx, ry, a, soft) {
    if (a <= 0.003) return;
    ctx.globalAlpha = U.clamp(a);
    ctx.drawImage(glowSprite(col, soft), x - rx, y - ry, rx * 2, ry * 2);
    ctx.globalAlpha = 1;
  }
  // An annulus: light scattered in a ring (fog around the fire) or a pale ground ring (snow outside the heat).
  const rings = new Map();
  function ring(ctx, col, x, y, rx, ry, a) {
    if (a <= 0.003) return;
    const key = ck(col);
    let s = rings.get(key);
    if (!s) {
      const c = U.safe(col);
      s = document.createElement("canvas"); s.width = s.height = 256;
      const x2 = s.getContext("2d"), g = x2.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, U.rgba(c, 0.22)); g.addColorStop(0.3, U.rgba(c, 0.55)); g.addColorStop(0.52, U.rgba(c, 1));
      g.addColorStop(0.72, U.rgba(c, 0.4)); g.addColorStop(1, U.rgba(c, 0));
      x2.fillStyle = g; x2.fillRect(0, 0, 256, 256);
      rings.set(key, s);
    }
    ctx.globalAlpha = U.clamp(a);
    ctx.drawImage(s, x - rx, y - ry, rx * 2, ry * 2);
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ seeded fire geometry (local units)
  // Local frame: origin at the centre of the bed on the ground, +y down, 100 units = the fire scale FS.
  // The whole fire is drawn under one transform, so the cold lay and the lit fire are the same objects.
  const LOGS = [
    { ax: -86, ay: -14, bx: 84, by: -19, r: 8.5, lean: false },  // back log, lying
    { ax: -100, ay: 4, bx: 16, by: -66, r: 8, lean: true },      // leaning in from the left
    { ax: 102, ay: 6, bx: -12, by: -62, r: 7.5, lean: true },    // leaning in from the right
    { ax: -76, ay: 3, bx: 72, by: -1, r: 10.5, lean: false },    // front log
  ];
  // charred cracks per log: [u along, v across (-1..1 of r), length (of r), along-grain flag, phase]
  const CRN = 18, CRK = [];
  // the bed: coals (lit) / ash (cold)
  const CN = 90;
  const CX = new Float32Array(CN), CY = new Float32Array(CN), CR = new Float32Array(CN), CP = new Float32Array(CN);
  const CFRONT = new Uint8Array(CN), CHOT = new Float32Array(CN), CROT = new Float32Array(CN), CASP = new Float32Array(CN);
  // flame tongues
  const TN = 11;
  const TB = new Float32Array(TN), TW = new Float32Array(TN), TH = new Float32Array(TN), TS = new Float32Array(TN), TP = new Float32Array(TN);
  const GX = new Float32Array(TN), GY = new Float32Array(TN), GH = new Float32Array(TN), GW = new Float32Array(TN);
  const GSW = new Float32Array(TN), GMID = new Float32Array(TN), GA = new Float32Array(TN), GQ = new Float32Array(TN);
  // stones of the fire ring
  const STONES = [];
  // smoke wisps: [base x (units), height (of H), seed, speed]
  const WISPS = [[-8, 0.72, 11, 1], [7, 0.58, 23, 1.3], [18, 0.8, 37, 0.85], [-22, 0.5, 51, 1.15]];

  (function seedGeometry() {
    const r = U.rng(19720609);
    for (let li = 0; li < LOGS.length; li++) {
      const a = new Float32Array(CRN * 5);
      for (let k = 0; k < CRN; k++) {
        const along = r() < 0.28;
        a[k * 5] = 0.06 + r() * 0.88;
        a[k * 5 + 1] = (r() * 2 - 1) * (along ? 0.55 : 0.35);
        a[k * 5 + 2] = along ? 1.6 + r() * 2.4 : 0.7 + r() * 0.8;
        a[k * 5 + 3] = along ? 1 : 0;
        a[k * 5 + 4] = r() * 100;
      }
      CRK.push(a);
    }
    for (let i = 0; i < CN; i++) {
      let x, y;
      for (let tries = 0; tries < 8; tries++) {
        const ang = r() * TAU, rad = Math.pow(r(), 0.65);
        x = Math.cos(ang) * rad * 90; y = 6 + Math.sin(ang) * rad * 13;
        if (Math.hypot(x + 46, (y - 15) * 2) > 9 && Math.hypot(x - 46, (y - 15) * 2) > 9) break;
      }
      CX[i] = x; CY[i] = y; CR[i] = 1.3 + r() * 2.4; CP[i] = r() * 100;
      CFRONT[i] = y > 9 ? 1 : 0;
      const q = r();
      CHOT[i] = (1 - 0.55 * (x / 90) * (x / 90)) * (0.35 + 0.65 * q * q * (2 - q));
      CROT[i] = (r() - 0.5) * 1.2; CASP[i] = 0.42 + r() * 0.4;
    }
    for (let i = 0; i < TN; i++) {
      TB[i] = -1 + 2 * (i + 0.5) / TN + (r() - 0.5) * 0.08;
      TW[i] = r(); TH[i] = 0.5 + 0.5 * r(); TS[i] = 0.75 + 0.55 * r(); TP[i] = r() * 100;
    }
    // stones: an ellipse around the bed; rough polygons, bigger toward the viewer
    const SN = 13;
    for (let k = 0; k < SN; k++) {
      const ang = (k + 0.5) / SN * TAU + (r() - 0.5) * 0.18;
      const sy = Math.sin(ang), x = Math.cos(ang) * 122, y = 10 + sy * 26;
      const persp = 0.8 + 0.3 * (sy + 1) / 2;
      const w = (12 + r() * 7) * persp, h = (7 + r() * 4) * persp;
      const pts = new Float32Array(20);
      for (let j = 0; j < 10; j++) {
        const a = j / 10 * TAU, rr = 0.74 + r() * 0.4;
        const flat = Math.sin(a) > 0 ? 0.75 : 1; // flatter underneath: sits on the ground
        pts[j * 2] = x + Math.cos(a) * w * rr; pts[j * 2 + 1] = y + Math.sin(a) * h * rr * flat;
      }
      STONES.push({ x, y, front: sy > 0.05, pts });
    }
  })();

  // ------------------------------------------------------------------ static layers
  let starsL = null, stoneL = null, FL = null, FLB = null, FB = null, SM = null, smokeGrad = null;
  const ST_X0 = -150, ST_Y0 = -40, ST_W = 300, ST_H = 90;           // stone bake region (units)
  const FL_X0 = -130, FL_Y0 = -235, FL_W = 260, FL_H = 255, FLK = 0.8; // flame canvas region (units), px per unit
  let SM_X0 = 0, SM_W = 0, SM_H = 0; const SMK = 0.1;                // smoke canvas (screen), px per css px

  function buildStars() {
    starsL = mk(W, H * 0.55);
    const x = starsL.c, r = U.rng(4242);
    const sc = U.safe(C.star);
    for (let i = 0; i < 60; i++) {
      const sx = r() * W, sy = Math.pow(r(), 1.2) * H * 0.52;
      // keep the middle column (above the fire, behind the clock) emptier
      if (Math.abs(sx - W / 2) < W * 0.12 && r() < 0.7) continue;
      const a = 0.1 + r() * 0.3, s = (r() < 0.1 ? 1.6 : 1) * S;
      x.fillStyle = U.rgba(sc, a); x.beginPath(); x.arc(sx, sy, s, 0, TAU); x.fill();
    }
  }

  function stonePath(c, st) {
    const p = st.pts;
    c.beginPath(); c.moveTo((p[0] + p[18]) / 2, (p[1] + p[19]) / 2);
    for (let j = 0; j < 10; j++) {
      const nx = p[((j + 1) % 10) * 2], ny = p[((j + 1) % 10) * 2 + 1];
      c.quadraticCurveTo(p[j * 2], p[j * 2 + 1], (p[j * 2] + nx) / 2, (p[j * 2 + 1] + ny) / 2);
    }
    c.closePath();
  }
  // Stones baked at the ambient fire scale: black mass, cold hairline outline, warm fire-facing rim.
  function buildStones() {
    const kA = 0.3 * H / 100;  // css px per unit at the ambient scale
    stoneL = {};
    for (const set of ["back", "front"]) {
      for (const kind of ["black", "cold", "warm", "snow", "day"]) {
        const L = mk(ST_W * kA, ST_H * kA);
        const c = L.c;
        c.setTransform(dpr * kA, 0, 0, dpr * kA, -ST_X0 * kA * dpr, -ST_Y0 * kA * dpr);
        for (const st of STONES) {
          if (st.front !== (set === "front")) continue;
          if (kind === "black") { stonePath(c, st); c.fillStyle = "#000"; c.fill(); continue; }
          if (kind === "day") {
            // in daylight: weathered grey granite, lit from the sky above, sooted on the side facing the fire
            const p = st.pts;
            let y0 = 1e9, y1 = -1e9;
            for (let j = 0; j < 10; j++) { y0 = Math.min(y0, p[j * 2 + 1]); y1 = Math.max(y1, p[j * 2 + 1]); }
            const g = c.createLinearGradient(0, y0, 0, y1);
            g.addColorStop(0, U.rgba(dc(DC.stoneLit), 1)); g.addColorStop(0.45, U.rgba(dc(DC.stone), 1)); g.addColorStop(1, U.rgba(dc(DC.stoneDark), 1));
            c.save(); stonePath(c, st); c.fillStyle = g; c.fill(); c.clip();
            const sy = st.front ? y0 - 4 : y1 + 2;
            c.globalAlpha = 0.75; c.drawImage(glowSprite(hex("#141010"), true), st.x * 0.65 - 26, sy - 12, 52, 24);
            c.globalAlpha = 1;
            c.restore();
            stonePath(c, st); c.strokeStyle = U.rgba(dc(DC.stoneDark), 0.7); c.lineWidth = 1.1 * S / kA; c.stroke();
            // a lichen fleck
            c.fillStyle = U.rgba(U.safe(hex("#7a8a5a")), 0.45);
            c.beginPath(); c.ellipse(st.x - 3, y0 + (y1 - y0) * 0.35, 2.2, 1.1, 0.3, 0, TAU); c.fill();
            continue;
          }
          if (kind === "snow") {
            // a dusting on the top of the stone, only where the stone is away from the heat
            const away = U.smoothstep(45, 112, Math.hypot(st.x, (st.y - 8) * 2.2));
            if (away < 0.05) continue;
            const sc = U.safe(C.snow);
            c.save(); stonePath(c, st); c.clip();
            c.fillStyle = U.rgba(sc, 0.4 * away); c.fill();
            c.strokeStyle = U.rgba(sc, 0.6 * away); c.lineWidth = 2.4 * S / kA; c.stroke();
            // the copy shifted down eats everything but a cap along the top edge
            c.globalCompositeOperation = "destination-out";
            c.translate(0, 3.2); stonePath(c, st); c.fillStyle = "#000"; c.fill();
            c.restore();
            continue;
          }
          if (kind === "cold") {
            stonePath(c, st);
            c.strokeStyle = U.rgba(U.safe(C.coldDim), 0.85); c.lineWidth = 1.2 * S / kA; c.stroke();
            // one facet line: a hint of form
            const p = st.pts;
            c.beginPath(); c.moveTo(p[10] * 0.6 + st.x * 0.4, p[11] * 0.6 + st.y * 0.4);
            c.quadraticCurveTo(st.x, st.y - 1, p[2] * 0.55 + st.x * 0.45, p[3] * 0.55 + st.y * 0.45);
            c.strokeStyle = U.rgba(U.safe(C.coldFaint), 0.8); c.lineWidth = 1 * S / kA; c.stroke();
            continue;
          }
          // warm: light from the fire; the copy shifted away from the light leaves a lit crescent
          const lx = 0, ly = st.front ? -30 : 12;
          let dx = lx - st.x, dy = ly - st.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
          const near = U.clamp(1.25 - dl / 150, 0.35, 1);
          c.save(); stonePath(c, st); c.clip();
          c.fillStyle = U.rgba(U.safe(C.rim), 0.14 * near); c.fill();
          c.fillStyle = U.rgba(U.safe(C.rim), 0.5 * near);
          c.fillRect(st.x - 30, st.y - 30, 60, 60);
          // the shadowing copy is slightly larger so no lit hairline survives on the far side
          c.translate(st.x - dx * 3.2, st.y - dy * 3.2 * (st.front ? 1.3 : 1));
          c.scale(1.08, 1.12);
          c.translate(-st.x, -st.y);
          stonePath(c, st); c.fillStyle = "#000"; c.fill();
          c.restore();
          // keep the dark body faintly lit on the fire side
          c.save(); stonePath(c, st); c.clip();
          c.globalAlpha = 0.1 * near;
          c.drawImage(glowSprite(C.rim, true), st.x + dx * 8 - 22, st.y + dy * 8 - 14, 44, 28);
          c.restore();
        }
        stoneL[set + kind] = L;
      }
    }
  }
  function drawStones(ctx, set, coldA, warmA, snowA, dayA) {
    const b = stoneL[set + "black"], cl = stoneL[set + "cold"], wm = stoneL[set + "warm"];
    ctx.globalAlpha = 1; ctx.drawImage(b.cv, ST_X0, ST_Y0, ST_W, ST_H);
    if (dayA > 0.004) { ctx.globalAlpha = U.clamp(dayA); ctx.drawImage(stoneL[set + "day"].cv, ST_X0, ST_Y0, ST_W, ST_H); }
    if (coldA > 0.004) { ctx.globalAlpha = U.clamp(coldA); ctx.drawImage(cl.cv, ST_X0, ST_Y0, ST_W, ST_H); }
    if (warmA > 0.004) { ctx.globalAlpha = U.clamp(warmA); ctx.drawImage(wm.cv, ST_X0, ST_Y0, ST_W, ST_H); }
    if (snowA > 0.004) { ctx.globalAlpha = U.clamp(snowA); ctx.drawImage(stoneL[set + "snow"].cv, ST_X0, ST_Y0, ST_W, ST_H); }
    ctx.globalAlpha = 1;
  }

  function buildFire() {
    FL = mk(FL_W * FLK, FL_H * FLK, 1);
    FLB = mk(FL_W * FLK, FL_H * FLK, 1);
    FB = mk(FL_W * FLK / 5, FL_H * FLK / 5, 1);
    // smoke: a band above the fire, painted small and upscaled (the softness is free)
    SM_W = 0.62 * W; SM_X0 = 0.5 * W - SM_W / 2; SM_H = 0.86 * H;
    SM = mk(SM_W * SMK, SM_H * SMK, 1);
    SMG.length = 0;
    smokeGrad = smokeGradFor(0);
  }
  // the smoke's colour: brown-grey in the dark, pale blue-grey in the sun (16 steps, cached)
  const SMG = [];
  function smokeGradFor(q) {
    if (SMG[q]) return SMG[q];
    const lo = U.mix(C.smokeLo, DC.smokeDayLo, q / 16), hi = U.mix(C.smokeHi, DC.smokeDayHi, q / 16);
    const g = SM.c.createLinearGradient(0, SM_H * SMK, 0, 0);
    g.addColorStop(0, U.rgba(lo, 0));
    g.addColorStop(0.18, U.rgba(lo, 0.9));
    g.addColorStop(0.5, U.rgba(U.mix(lo, hi, 0.6), 0.5));
    g.addColorStop(0.85, U.rgba(hi, 0.12));
    g.addColorStop(1, U.rgba(hi, 0));
    SMG[q] = g;
    return g;
  }

  // ------------------------------------------------------------------ hero clock canvas
  const CLK_Q = 40;
  let clk = null, clkKey = "", clkPx = 0;
  function clockCanvas(str, wq) {
    const key = str + "|" + wq;
    if (key === clkKey && clk) return clk;
    if (!clk) {
      clkPx = Math.round(0.24 * H);
      if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); LS = "letterSpacing" in mctx; }
      mctx.font = `200 ${clkPx}px ${SANS}`;
      let tw = mctx.measureText("00:00").width;
      mctx.font = `400 ${clkPx}px ${SERIF}`;
      tw = Math.max(tw, mctx.measureText("00:00").width);
      const pad = Math.ceil(clkPx * 0.3);
      clk = mk(tw * 1.1 + pad * 2, clkPx * 1.3 + pad * 2);
    }
    clkKey = key;
    const w = wq / CLK_Q, c = clk.c, cx = clk.w / 2, cy = clk.h / 2 + clkPx * 0.03;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, clk.w, clk.h);
    c.textAlign = "center"; c.textBaseline = "middle";
    // two passes crossfade rather than one mixed colour: the midpoint of cyan and amber is a muddy grey
    const colW = U.safe(U.mix(C.moon, C.amber, w * 0.2)), colA = U.safe(U.mix(C.moon, C.amber, 0.8 + 0.2 * w));
    const g = U.lerp(14, 26, w) * S * dpr;
    const pass = (font, a, col) => {
      if (a <= 0.01) return;
      c.font = font;
      c.shadowColor = U.rgba(col, 0.85);
      c.shadowBlur = g * 2; c.fillStyle = U.rgba(col, 0.2 * a); c.fillText(str, cx, cy);
      c.shadowBlur = g; c.fillStyle = U.rgba(col, 0.3 * a); c.fillText(str, cx, cy);
      c.shadowBlur = 0; c.fillStyle = U.rgba(col, U.lerp(0.9, 0.8, w) * a); c.fillText(str, cx, cy);
    };
    // the notebook's thin sans becomes a warm old serif as the fire takes over
    const wb = U.smoothstep(0.3, 0.7, w);
    pass(`200 ${clkPx}px ${SANS}`, 1 - wb, colW);
    pass(`400 ${Math.round(clkPx * 1.06)}px ${SERIF}`, wb, colA);
    return clk;
  }

  // ------------------------------------------------------------------ build
  function build() {
    S = H / 1080;
    sprites.clear(); glows.clear();
    NL.key = NW.key = "";
    buildStars();
    buildStones();
    buildFire();
    landB = landC = snowB = null; landKey = -1; composeKey = -1; seasonDay = -1;   // the day land is baked on first daylight
    buildDapple(); buildClouds();
    propLayout();   // the seat's place (the cat sits on it at night too, before any daylight has baked the land)
    clk = null; clkKey = "";
    for (let i = 0; i < SPN; i++) SL[i] = 0;
    built = `${W}x${H}@${dpr}`;
  }

  // ------------------------------------------------------------------ the burn (pure functions of elapsed)
  // A log settles every ~25-45 min: a short brightening and a burst of sparks (deterministic schedule).
  function settleBump(e) {
    const P = 1900, k = Math.floor(e / P);
    let v = 0;
    for (let j = k - 1; j <= k; j++) {
      if (j < 1) continue;
      const ej = j * P + hash(j) * 1100, d = e - ej;
      if (d > 0 && d < 12) v = Math.max(v, Math.min(1, d * 3) * Math.exp(-d * 0.45));
    }
    return v;
  }

  // ------------------------------------------------------------------ logs
  const capPath = (c, x0, y0, x1, y1, r) => {
    const a = Math.atan2(y1 - y0, x1 - x0);
    c.beginPath();
    c.ellipse(x0, y0, r * 0.38, r, a, Math.PI / 2, Math.PI * 1.5, false);
    c.ellipse(x1, y1, r * 0.38, r, a, -Math.PI / 2, Math.PI / 2, false);
    c.closePath();
  };
  // Draw piece [u0,u1] of the (deformed) log a->b. glowA/glowB: that end is burning (ember) vs sawn.
  let rimK = 1; // how much the flames (not just the coals) light the log outlines
  let logDay = 0; // daylight on the logs: bark colour over the char
  function logPiece(ctx, li, ax, ay, bx, by, r, u0, u1, glowA, glowB, heat, coldA, t, inv) {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    const tx = dx / len, ty = dy / len, nx = -ty, ny = tx;
    const x0 = ax + dx * u0, y0 = ay + dy * u0, x1 = ax + dx * u1, y1 = ay + dy * u1;
    capPath(ctx, x0, y0, x1, y1, r);
    ctx.globalAlpha = 1; ctx.fillStyle = "#050302"; ctx.fill();
    if (logDay > 0.004) {
      // by day: grey-brown bark, charred toward the burnt ends, sky light along the top, shade beneath
      ctx.globalAlpha = logDay; ctx.fillStyle = BARK_CSS; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.lineCap = "round";
      ctx.globalAlpha = logDay * 0.8; ctx.strokeStyle = BARK_DARK; ctx.lineWidth = r * 0.7;
      ctx.beginPath();
      ctx.moveTo(x0 + tx * r * 0.3 + nx * r * 0.62, y0 + ty * r * 0.3 + ny * r * 0.62); ctx.lineTo(x1 - tx * r * 0.3 + nx * r * 0.62, y1 - ty * r * 0.3 + ny * r * 0.62);
      ctx.stroke();
      ctx.globalAlpha = logDay * 0.7; ctx.strokeStyle = BARK_LIT; ctx.lineWidth = r * 0.28;
      const up = ny > 0 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(x0 + tx * r * 0.5 + nx * r * 0.55 * up, y0 + ty * r * 0.5 + ny * r * 0.55 * up); ctx.lineTo(x1 - tx * r * 0.5 + nx * r * 0.55 * up, y1 - ty * r * 0.5 + ny * r * 0.55 * up);
      ctx.stroke();
      for (let side = 0; side < 2; side++) {
        if (!(side ? glowB : glowA)) continue;
        const ex = side ? x1 : x0, ey = side ? y1 : y0, sg = side ? -1 : 1;
        ctx.globalAlpha = logDay * 0.55; ctx.fillStyle = "#0c0806";
        ctx.beginPath(); ctx.ellipse(ex + tx * r * 0.9 * sg, ey + ty * r * 0.9 * sg, r * 1.3, r * 1.05, Math.atan2(dy, dx), 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      capPath(ctx, x0, y0, x1, y1, r);   // the outline strokes below expect the log's own path
    }
    if (coldA > 0.004) {
      const cc = U.safe(C.coldDim);
      ctx.globalAlpha = coldA * 0.85; ctx.strokeStyle = U.rgba(cc, 1); ctx.lineWidth = 1.2 * S * inv; ctx.stroke();
      // grain: one long hairline and the end rings of the sawn ends
      ctx.globalAlpha = coldA * 0.4; ctx.lineWidth = 1 * S * inv;
      ctx.beginPath();
      ctx.moveTo(x0 + tx * r * 0.8 + nx * r * 0.35, y0 + ty * r * 0.8 + ny * r * 0.35);
      ctx.lineTo(x0 + (x1 - x0) * 0.62 + nx * r * 0.3, y0 + (y1 - y0) * 0.62 + ny * r * 0.3);
      ctx.stroke();
      const a = Math.atan2(dy, dx);
      ctx.beginPath();
      if (!glowA) ctx.ellipse(x0, y0, r * 0.16, r * 0.5, a, 0, TAU);
      if (!glowB) { ctx.moveTo(x1 + Math.cos(a) * r * 0.16, y1 + Math.sin(a) * r * 0.16); ctx.ellipse(x1, y1, r * 0.16, r * 0.5, a, 0, TAU); }
      ctx.stroke();
    }
    if (heat > 0.01) {
      // the outline catches the light
      ctx.globalAlpha = heat * 0.4 * rimK; ctx.strokeStyle = COAL_R[Math.round(RN * 0.7)]; ctx.lineWidth = 1.5 * S * inv;
      capPath(ctx, x0, y0, x1, y1, r); ctx.stroke();
      // underside: coal light from below
      ctx.globalAlpha = heat * 0.5; ctx.lineWidth = 2.2 * S * inv;
      ctx.beginPath();
      ctx.moveTo(x0 + tx * r * 0.3 + nx * r * 0.92, y0 + ty * r * 0.3 + ny * r * 0.92);
      ctx.lineTo(x1 - tx * r * 0.3 + nx * r * 0.92, y1 - ty * r * 0.3 + ny * r * 0.92);
      ctx.strokeStyle = COAL_R[Math.round(RN * 0.55)]; ctx.stroke();
      // charred cracks, glowing and breathing
      const cr = CRK[li];
      ctx.lineCap = "round"; ctx.lineWidth = 1.5 * S * inv;
      for (let k = 0; k < CRN; k++) {
        const u = cr[k * 5];
        if (u < u0 + 0.02 || u > u1 - 0.02) continue;
        const v = cr[k * 5 + 1], L = cr[k * 5 + 2] * r, along = cr[k * 5 + 3], ph = cr[k * 5 + 4];
        if (along && (u - L * 0.5 / len < u0 + 0.01 || u + L * 0.5 / len > u1 - 0.01)) continue; // stay on the wood
        const fk = 0.5 + 0.5 * U.noise1(t * 0.45 + ph);
        // cracks nearer the burning ends run hotter
        const endNear = Math.max(glowA ? 1 - (u - u0) * 3 : 0, glowB ? 1 - (u1 - u) * 3 : 0, 0.45);
        const a = heat * fk * endNear;
        if (a < 0.03) continue;
        const px = ax + dx * u + nx * v * r, py = ay + dy * u + ny * v * r;
        const sk = (ph - Math.floor(ph) - 0.5) * 0.9, sg = (ph | 0) % 2 ? 1 : -1;   // each crack its own slant and jog
        const bx0 = along ? tx : nx, by0 = along ? ty : ny, ox = along ? nx : tx, oy = along ? ny : ty;
        const ex = bx0 + ox * sk, ey = by0 + oy * sk;
        const jx = ox, jy = oy, jog = sg * ((fk - 0.5) * 0.3 * r + 0.15 * r);
        ctx.globalAlpha = U.clamp(a * 0.95);
        ctx.strokeStyle = COAL_R[Math.min(RN, Math.round(RN * (0.55 + 0.45 * a)))];
        ctx.beginPath();
        ctx.moveTo(px - ex * L * 0.5, py - ey * L * 0.5);
        ctx.lineTo(px + jx * jog, py + jy * jog);
        ctx.lineTo(px + ex * L * 0.5, py + ey * L * 0.5);
        ctx.stroke();
      }
      // burning ends: an ember face and a small glow
      const a = Math.atan2(dy, dx);
      for (let side = 0; side < 2; side++) {
        if (!(side ? glowB : glowA)) continue;
        const ex = side ? x1 : x0, ey = side ? y1 : y0;
        const fk = 0.75 + 0.25 * U.noise1(t * 0.8 + li * 9 + side * 4);
        glow(ctx, C.coalHot, ex, ey, r * 2.8, r * 2.4, heat * 0.45 * fk, true);
        // the burnt face: a ragged ember, not a clean disc
        ctx.globalAlpha = U.clamp(heat * 0.6 * fk);
        ctx.fillStyle = COAL_R[Math.round(RN * (0.5 + 0.45 * heat * fk))];
        ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.22, r * 0.7, a, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  // The log as the evening has left it: thinner, the leaners collapsed, the middles burnt through.
  function drawLog(ctx, li, fuel, heat, coldA, t, inv) {
    const L = LOGS[li];
    const fw = Math.pow(fuel, 0.7);
    const r = L.r * (0.5 + 0.5 * fw);
    const sinkY = (1 - fuel) * 4;
    if (L.lean) {
      const stand = U.smoothstep(0.3, 0.75, fuel);
      const by = U.lerp(-22, L.by, stand), bx = L.bx;
      const keep = 0.5 + 0.5 * U.smoothstep(0.15, 0.85, fuel);
      logPiece(ctx, li, L.ax, L.ay + sinkY * 0.5, bx, by + sinkY, r, 0, keep, false, keep < 0.995, heat, coldA, t, inv);
    } else {
      const gap = 0.44 * (1 - U.smoothstep(0.12, 0.55, fuel));
      const ay = L.ay + sinkY, by = L.by + sinkY;
      if (gap < 0.01) logPiece(ctx, li, L.ax, ay, L.bx, by, r, 0, 1, false, false, heat, coldA, t, inv);
      else {
        logPiece(ctx, li, L.ax, ay, L.bx, by, r, 0, 0.5 - gap / 2, false, true, heat, coldA, t, inv);
        logPiece(ctx, li, L.ax, ay, L.bx, by, r * 0.92, 0.5 + gap / 2, 1, true, false, heat, coldA, t, inv);
      }
    }
  }

  // ------------------------------------------------------------------ flames
  function tonguePath(c, bx, by, h, w, sway, mid) {
    const tx = bx + sway * h, ty = by - h;
    c.beginPath();
    c.moveTo(bx - w, by);
    c.bezierCurveTo(bx - w * 1.3, by - h * 0.3, bx + mid - w * 0.6, by - h * 0.62, tx, ty);
    c.bezierCurveTo(bx + mid + w * 0.6, by - h * 0.62, bx + w * 1.3, by - h * 0.3, bx + w, by);
    c.quadraticCurveTo(bx, by + w * 0.7, bx - w, by);
  }
  const HAS_FILTER = "filter" in document.createElement("canvas").getContext("2d");
  const FCOL = [C.fOuter, C.fMid, C.fInner, C.fCore].map((c) => U.rgba(U.safe(c), 1));
  const LH = [1, 0.7, 0.44, 0.22], LW = [1, 0.86, 0.84, 0.92], LSW = [1, 0.7, 0.45, 0.2], LA = [0.42, 0.5, 0.55, 0.7];
  let fwLean = 0, fwWet = 0;  // weather on the flames: wind lean (tip offset per height), rain raggedness 0..1
  // Paint the tongues into the small flame canvas. level: 0..~1.2, ign: 0..1 how far the catch has spread.
  function paintFlames(level, ign, t) {
    const c = FL.c;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
    c.clearRect(0, 0, FL.cv.width, FL.cv.height);
    c.setTransform(FLK, 0, 0, FLK, -FL_X0 * FLK, -FL_Y0 * FLK);
    const lvlH = Math.pow(level, 0.75), spread = 56 * (0.5 + 0.5 * Math.min(1, level * 1.4));
    const low = 1 - U.smoothstep(0.08, 0.3, level);  // late: little flames come and go on the coals
    const maxH = 185;
    for (let i = 0; i < TN; i++) {
      const tb = TB[i], sp = TS[i], ph = TP[i];
      // rain makes the tongues ragged: a fast stutter on top of the flicker
      const flick = 0.7 + 0.22 * U.noise1(t * sp * 1.7 + ph) + 0.14 * U.noise1(t * sp * 4.1 + ph * 1.7) + fwWet * 0.2 * U.noise1(t * sp * 7.3 + ph * 2.3);
      const q = (t * sp * 0.5 + ph * 0.37) % 1;
      const lick = 1 + 0.22 * U.smoothstep(0.35, 0.7, q) * (1 - U.smoothstep(0.7, 0.78, q));
      let act = U.smoothstep(Math.abs(tb) * 0.6, Math.abs(tb) * 0.6 + 0.4, ign);
      if (low > 0) act *= 1 - low * (1 - U.smoothstep(-0.05, 0.35, U.noise1(t * 0.23 + ph)));
      // and some of them gutter out for a moment under the drops
      if (fwWet > 0.01) act *= 1 - fwWet * 0.55 * (1 - U.smoothstep(-0.15, 0.35, U.noise1(t * 0.9 * sp + ph * 3.1)));
      GA[i] = act;
      GQ[i] = q;
      GX[i] = tb * spread + fwLean * 14;
      GY[i] = -3 + 4 * tb * tb;
      GH[i] = maxH * lvlH * (1 - 0.62 * tb * tb) * TH[i] * flick * lick * (0.25 + 0.75 * act);
      GW[i] = (15 + 10 * TW[i]) * (0.45 + 0.55 * Math.min(1, level)) * (0.85 + 0.15 * flick) * (0.5 + 0.5 * act);
      GSW[i] = 0.26 * U.noise1(t * sp * 0.9 + ph + 13) * (1 - 0.4 * Math.min(1, fwLean * 3)) + tb * 0.08;
      GMID[i] = U.noise1(t * sp * 1.1 + ph + 5) * GW[i] * 0.9;
    }
    const coreK = U.smoothstep(0.12, 0.5, level);
    for (let L = 0; L < 4; L++) {
      const la = LA[L] * (L === 3 ? coreK : L === 2 ? 0.4 + 0.6 * coreK : 1);
      if (la < 0.01) continue;
      c.fillStyle = FCOL[L];
      for (let i = 0; i < TN; i++) {
        const a = GA[i] * la;
        if (a < 0.01 || GH[i] < 2) continue;
        c.globalAlpha = a;
        // inner layers sway on their own so they never nest as chevrons inside the outer tongue
        const own = L ? U.noise1(t * TS[i] * 1.3 + TP[i] + L * 17) * 0.16 : 0;
        // the wind leans every layer together (the core a little less), so the whole flame bows
        const lean = fwLean * (1 - 0.08 * L);
        tonguePath(c, GX[i] + own * 14, GY[i], GH[i] * LH[L], GW[i] * LW[L], GSW[i] * LSW[L] + own + lean, GMID[i] * LSW[L]);
        c.fill();
        // a lick tears off the tip and rises away (downwind)
        if (L < 2 && GQ[i] > 0.72 && GH[i] > 30) {
          const u = (GQ[i] - 0.72) / 0.28, h = GH[i] * 0.26 * (1 - u);
          if (h > 1.5) {
            c.globalAlpha = a * (1 - u) * 0.9;
            const tx = GX[i] + GSW[i] * GH[i] + lean * GH[i] * (LH[L] + 0.4 * u);
            tonguePath(c, tx, GY[i] - GH[i] * (0.82 + 0.5 * u) * LH[L], h * LH[L], GW[i] * 0.3 * (1 - u * 0.5) * LW[L], GSW[i] * 0.5 + lean, 0);
            c.fill();
          }
        }
      }
    }
    c.globalAlpha = 1;
    // melt the layer steps into a gradient: one small blur pass on a ~200 px canvas
    const lb = FLB.c;
    lb.setTransform(1, 0, 0, 1, 0, 0);
    lb.clearRect(0, 0, FLB.cv.width, FLB.cv.height);
    if (HAS_FILTER) lb.filter = "blur(1.6px)";
    lb.drawImage(FL.cv, 0, 0);
    if (HAS_FILTER) lb.filter = "none";
    // bloom source: the same flames, five times smaller
    const bc = FB.c;
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.clearRect(0, 0, FB.cv.width, FB.cv.height);
    bc.drawImage(FLB.cv, 0, 0, FB.cv.width, FB.cv.height);
  }

  // ------------------------------------------------------------------ sparks (capped pool, typed arrays)
  const SPN = 200;
  const SX = new Float32Array(SPN), SY = new Float32Array(SPN), SVX = new Float32Array(SPN), SVY = new Float32Array(SPN);
  const SL = new Float32Array(SPN), SML = new Float32Array(SPN), SSZ = new Float32Array(SPN), SK = new Uint8Array(SPN);
  let spHead = 0, spAcc = 0;
  const srng = U.rng(777);
  function spark(x, y, vx, vy, life, sz, kind) {
    const i = spHead; spHead = (spHead + 1) % SPN;
    SX[i] = x; SY[i] = y; SVX[i] = vx; SVY[i] = vy; SL[i] = life; SML[i] = life; SSZ[i] = sz; SK[i] = kind;
  }
  // wind: px/s^2 pushing sparks downwind; quench: rain kills them faster (extra life lost per second)
  function drawSparks(ctx, dt, t, wind, quench) {
    ctx.lineCap = "round";
    for (let i = 0; i < SPN; i++) {
      if (SL[i] <= 0) continue;
      SL[i] -= dt * (1 + quench);
      if (SL[i] <= 0) continue;
      const lf = SL[i] / SML[i];
      SVY[i] -= 34 * S * dt * lf;                                   // buoyant while hot
      SVX[i] += U.noise1(SY[i] * 0.006 + i * 7.3 + t * 0.4) * 150 * S * dt + wind * dt;
      const drag = 1 - 0.5 * dt;
      SVX[i] *= drag; SVY[i] *= drag;
      SX[i] += SVX[i] * dt; SY[i] += SVY[i] * dt;
      const tw = 0.7 + 0.3 * Math.sin(t * 21 + i * 1.7);
      const a = Math.pow(lf, 0.75) * tw;
      if (a < 0.02) continue;
      const rr = SK[i] ? SPARK_H : SPARK_R;
      const idx = Math.round(lf * RN);
      ctx.globalAlpha = a;
      ctx.strokeStyle = rr[idx];
      ctx.lineWidth = SSZ[i] * (0.55 + 0.45 * lf);
      ctx.beginPath(); ctx.moveTo(SX[i], SY[i]); ctx.lineTo(SX[i] - SVX[i] * 0.04, SY[i] - SVY[i] * 0.04); ctx.stroke();
      if (lf > 0.55 && (i & 3) === 0) glow(ctx, SK[i] ? C.hostDown : C.coalHot, SX[i], SY[i], 7 * S, 7 * S, a * 0.35);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ weather (the real sky over the fire)
  // Each condition has a presence weight eased toward 1 (the current one) or 0 (the rest) over a few
  // seconds, plus its own intensity, so a change of weather crossfades instead of snapping. null = clear.
  const WXC = ["clear", "cloudy", "fog", "rain", "storm", "snow"];
  const WXP = new Float32Array(6), WXI = new Float32Array(6);
  const WX = { cover: 0, cloudy: 0, fog: 0, rain: 0, storm: 0, snow: 0, wind: 0, lean: 0, dust: 0 };
  let wxWind = 0, wxInit = false;
  function updateWeather(w, dt, t) {
    let ci = w ? WXC.indexOf(w.condition) : 0;
    if (ci < 0) ci = 0;
    const it = w && w.intensity != null ? U.clamp(+w.intensity || 0) : (ci ? 0.6 : 0);
    const wk = w && w.windKph != null ? Math.max(0, +w.windKph || 0) : 0;
    const first = !wxInit;
    if (first) { WXP.fill(0); WXP[ci] = 1; WXI[ci] = it; wxWind = wk; wxInit = true; }
    if (WXP[ci] < 0.02) WXI[ci] = it;
    const k = 1 - Math.exp(-dt / 1.4);
    for (let i = 0; i < 6; i++) WXP[i] += ((i === ci ? 1 : 0) - WXP[i]) * k;
    WXI[ci] += (it - WXI[ci]) * k;
    wxWind += (wk - wxWind) * k;
    WX.cloudy = WXP[1] * (0.2 + 0.8 * WXI[1]);
    WX.cover = U.clamp(WX.cloudy + WXP[2] + WXP[3] * (0.75 + 0.25 * WXI[3]) + WXP[4] + WXP[5] * 0.9);
    WX.fog = WXP[2] * (0.45 + 0.55 * WXI[2]);
    WX.rain = WXP[3] * WXI[3] + WXP[4] * Math.max(0.8, WXI[4]);
    WX.storm = WXP[4];
    WX.snow = WXP[5] * (0.25 + 0.75 * WXI[5]);
    WX.wind = U.clamp(wxWind / 50);
    // gusts: the lean breathes but never reverses (the wind blows left to right across the wall)
    WX.lean = WX.wind * (0.85 + 0.3 * U.noise1(t * 0.37) + 0.12 * U.noise1(t * 1.3 + 4));
    // the dusting on the stones settles and melts more slowly than the sky changes
    WX.dust = first ? WX.snow : WX.dust + (WX.snow - WX.dust) * (1 - Math.exp(-dt / 5));
  }

  // the firelight this frame (screen space): drops and flakes are seen only where it reaches them
  let LX = 0, LY = 0, LR = 1, LRY = 1, LK = 0;
  function litAt(x, y) {
    const dx = (x - LX) / LR, dy = (y - LY) / LRY, d = dx * dx + dy * dy;
    return d >= 1 ? 0 : LK * (1 - d) * (1 - d);
  }
  let HX = 0, HY = 0, HRX = 1, HRY = 1;  // the heat: flakes melt away inside this ellipse

  // ---- rain: drops streak through the firelight, hiss and steam on the coals
  const DRN = 170;
  const DX = new Float32Array(DRN), DY = new Float32Array(DRN), DZ = new Float32Array(DRN), DV = new Float32Array(DRN);
  const DB = new Uint8Array(DRN);
  const STN = 32;
  const PX = new Float32Array(STN), PY = new Float32Array(STN), PL = new Float32Array(STN), PM = new Float32Array(STN), PR = new Float32Array(STN);
  const QN = 24;
  const QX = new Float32Array(QN), QY = new Float32Array(QN), QL = new Float32Array(QN);
  let stHead = 0, qHead = 0, rainInit = false, steamAcc = 0;
  const RAIN_CSS = [C.rain, C.rainMid, C.rainLit].map((c) => U.rgba(U.safe(c), 1));
  const RAIN_A = [0.13, 0.3, 0.5];
  function dropSpawn(i, cx, gy, k, slant, top) {
    DY[i] = top ? -srng() * 0.25 * H : srng() * gy;
    DZ[i] = gy + (srng() * 62 - 14) * k;                      // where it meets the ground (depth)
    DV[i] = (950 + srng() * 350) * S;
    DX[i] = cx + (srng() + srng() + srng() - 1.5) * 0.62 * W - slant * (DZ[i] - DY[i]); // lands where aimed
  }
  function puff(x, y, size) {
    const i = stHead; stHead = (stHead + 1) % STN;
    PX[i] = x; PY[i] = y; PL[i] = PM[i] = 1.1 + srng() * 0.9; PR[i] = size;
  }
  const RAIN_DAY = U.rgba(U.safe(hex("#8c96a6")), 1), SNOW_DAY = U.rgba(U.safe(hex("#aab0c2")), 1);
  function drawRain(ctx, dt, a, cx, gy, k, bedHot, dayL) {
    const rk = U.clamp(WX.rain), slant = 0.04 + 0.42 * WX.lean;
    if (!rainInit) { for (let i = 0; i < DRN; i++) dropSpawn(i, cx, gy, k, slant, false); rainInit = true; }
    const n = Math.ceil(DRN * Math.pow(rk, 1.4));   // drizzle is barely there, a downpour fills the light
    const len = (13 + 17 * rk) * S;
    for (let i = 0; i < n; i++) {
      DY[i] += DV[i] * dt; DX[i] += DV[i] * slant * dt;
      if (DY[i] >= DZ[i]) {
        const x = DX[i], y = DZ[i], ux = Math.abs(x - cx) / k;
        if (ux < 86 && y > gy - 10 * k && y < gy + 24 * k && bedHot > 0.05) {
          // it lands on the coals: a hiss of steam, now and then a spit of ember
          if (srng() < 0.4) puff(x, y - 4 * k, 0.6 + srng() * 0.6);
          if (srng() < 0.14 * bedHot) spark(x, y - 3 * k, (srng() - 0.5) * 40 * S, -(50 + srng() * 70) * S, 0.25 + srng() * 0.3, 0.9 * S, 0);
        } else if (litAt(x, y) > 0.1) {
          const q = qHead; qHead = (qHead + 1) % QN; QX[q] = x; QY[q] = y; QL[q] = 0.2;
        }
        dropSpawn(i, cx, gy, k, slant, true);
      }
      const l = litAt(DX[i], DY[i]);
      DB[i] = l > 0.38 ? 2 : l > 0.1 ? 1 : 0;
    }
    // three passes: far from the fire a drop is a cold hairline, in the light it streaks amber
    ctx.lineCap = "round";
    if (n > 0) {
      for (let band = 0; band < 3; band++) {
        ctx.globalAlpha = a * RAIN_A[band]; ctx.strokeStyle = RAIN_CSS[band]; ctx.lineWidth = (band ? 1.3 : 1.1) * S;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          if (DB[i] !== band) continue;
          ctx.moveTo(DX[i], DY[i]); ctx.lineTo(DX[i] - slant * len, DY[i] - len);
        }
        ctx.stroke();
      }
      if (dayL > 0.004) {
        // in daylight every drop shows: a grey streak against the trees and the grass
        ctx.globalAlpha = a * dayL * 0.3; ctx.strokeStyle = RAIN_DAY; ctx.lineWidth = 1.3 * S;
        ctx.beginPath();
        for (let i = 0; i < n; i++) { ctx.moveTo(DX[i], DY[i]); ctx.lineTo(DX[i] - slant * len, DY[i] - len); }
        ctx.stroke();
      }
    }
    // splashes on the lit ground: two tiny flung droplets
    ctx.globalAlpha = a * 0.38; ctx.strokeStyle = RAIN_CSS[1]; ctx.lineWidth = 1 * S;
    ctx.beginPath();
    for (let q = 0; q < QN; q++) {
      if (QL[q] <= 0) continue;
      QL[q] -= dt;
      if (QL[q] <= 0) continue;
      const u = 1 - QL[q] / 0.2, r = (2.5 + 5 * u) * S, h = r * (0.9 - 0.7 * u);
      ctx.moveTo(QX[q] - r * 0.35, QY[q]); ctx.lineTo(QX[q] - r, QY[q] - h);
      ctx.moveTo(QX[q] + r * 0.35, QY[q]); ctx.lineTo(QX[q] + r, QY[q] - h);
    }
    ctx.stroke();
    // steam: grey breaths rising off the wet coals, pushed downwind
    steamAcc += dt * 6 * rk * bedHot;
    let guard = 0;
    while (steamAcc >= 1 && guard++ < 4) { steamAcc -= 1; puff(cx + (srng() - 0.5) * 150 * k, gy + (srng() * 14 - 4) * k, 1 + srng() * 0.8); }
    for (let i = 0; i < STN; i++) {
      if (PL[i] <= 0) continue;
      PL[i] -= dt;
      if (PL[i] <= 0) continue;
      PY[i] -= 30 * S * dt; PX[i] += (WX.lean * 70 + 6) * S * dt;
      const u = 1 - PL[i] / PM[i], r = (7 + 24 * u) * S * PR[i];
      glow(ctx, litAt(PX[i], PY[i]) > 0.2 ? C.steamLit : C.steam, PX[i], PY[i], r, r * 0.8, a * 0.2 * Math.sin(Math.PI * u), true);
    }
    ctx.globalAlpha = 1;
  }

  // ---- snow: slow flakes, faint in the dark, lit as they near the fire, gone before they reach it
  const FN = 140;
  const FX = new Float32Array(FN), FY = new Float32Array(FN), FZ = new Float32Array(FN), FV = new Float32Array(FN);
  const FP = new Float32Array(FN), FSZ = new Float32Array(FN);
  let snowInit = false;
  const SNOW_CSS = U.rgba(U.safe(C.snow), 1), SNOW_LIT = U.rgba(U.safe(C.snowLit), 1);
  function flakeSpawn(i, gy, k, top) {
    FX[i] = srng() * W; FY[i] = top ? -4 - srng() * 0.08 * H : srng() * gy;
    FZ[i] = gy + (srng() * 70 - 14) * k;
    FV[i] = (30 + srng() * 38) * S; FP[i] = srng() * 100; FSZ[i] = (1.8 + srng() * 1.9) * S;
  }
  function drawSnow(ctx, dt, t, a, gy, k, dayL) {
    if (!snowInit) { for (let i = 0; i < FN; i++) flakeSpawn(i, gy, k, false); snowInit = true; }
    const n = Math.ceil(FN * Math.pow(U.clamp(WX.snow), 1.1));
    const drift = (WX.lean * 80 + 4) * S;
    let lastLit = -1;
    for (let i = 0; i < n; i++) {
      FY[i] += FV[i] * dt;
      FX[i] += (drift + Math.sin(t * 0.8 + FP[i]) * 16 * S) * dt;
      if (FX[i] > W + 10) FX[i] -= W + 20; else if (FX[i] < -10) FX[i] += W + 20;
      const hx = (FX[i] - HX) / HRX, hy = (FY[i] - HY) / HRY;
      const melt = U.smoothstep(1, 1.8, Math.sqrt(hx * hx + hy * hy));
      if (FY[i] >= FZ[i] || melt <= 0.01) { flakeSpawn(i, gy, k, true); continue; }
      const l = litAt(FX[i], FY[i]), isLit = l > 0.18 ? 1 : 0;
      if (isLit !== lastLit) { ctx.fillStyle = isLit ? SNOW_LIT : SNOW_CSS; lastLit = isLit; }
      ctx.globalAlpha = a * melt * (0.32 + 0.55 * l) * (0.8 + 0.2 * Math.sin(FP[i] + t * 2.1));
      const s = FSZ[i] * (0.6 + 0.4 * melt);
      ctx.fillRect(FX[i] - s / 2, FY[i] - s / 2, s, s);
    }
    if (dayL > 0.004) {
      // by day: pale flakes everywhere, not just in the firelight
      ctx.fillStyle = SNOW_DAY;
      for (let i = 0; i < n; i++) {
        const hx = (FX[i] - HX) / HRX, hy = (FY[i] - HY) / HRY;
        const melt = U.smoothstep(1, 1.8, Math.sqrt(hx * hx + hy * hy));
        if (melt <= 0.01) continue;
        ctx.globalAlpha = a * dayL * melt * 0.62 * (0.8 + 0.2 * Math.sin(FP[i] + t * 2.1));
        const s = FSZ[i] * (0.8 + 0.5 * melt);
        ctx.beginPath(); ctx.arc(FX[i], FY[i], s, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- storm: rare, dim, distant lightning low on the horizon (violet, never white)
  let lnNext = -1, lnT0 = -100, lnX = 0, lnD = 0.7;
  const BOLT = new Float32Array(22);
  const BOLT_CSS = U.rgba(U.safe(C.bolt), 1);
  function drawLightning(ctx, t, a, up) {
    if (WX.storm < 0.02) { lnNext = -1; return; }
    if (lnNext < 0) lnNext = t + 2 + srng() * 5;
    if (t >= lnNext) {
      lnT0 = t; lnNext = t + 9 + srng() * 17;
      // off to one side, so the fire never hides it
      lnX = (srng() < 0.5 ? 0.1 + srng() * 0.22 : 0.68 + srng() * 0.22) * W;
      let x = lnX + (srng() - 0.5) * 0.04 * W, y = 0.5 * H;
      for (let j = 0; j < 11; j++) { BOLT[j * 2] = x; BOLT[j * 2 + 1] = y; x += (srng() - 0.5) * 0.016 * W; y += 0.016 * H * (0.6 + srng() * 0.8); }
      // the thunder, on the flash: it is all far off (the engine lags it by distance x 5 s); a farther
      // strike flashes a little dimmer
      lnD = 0.5 + 0.45 * Math.random();
      if (a > 0.2) cue("thunder", { distance: lnD, gain: 0.5 + 0.45 * WX.storm * (1.2 - lnD), pan: U.clamp((lnX / W - 0.5) * 1.6, -0.9, 0.9) });
    }
    const u = t - lnT0;
    if (u > 1.4) return;
    // a flash, a stutter, an afterglow
    const env = Math.exp(-u * 9) + (u > 0.16 ? 0.75 * Math.exp(-(u - 0.16) * 10) : 0) + (u > 0.45 ? 0.45 * Math.exp(-(u - 0.45) * 8) : 0);
    const e = U.clamp(env) * WX.storm * a * (1.2 - 0.4 * lnD);
    if (e < 0.004) return;
    const hy = 0.66 * H - up;
    glow(ctx, C.flash, lnX, hy, 0.3 * W, 0.17 * H, 0.1 * e, true);
    glow(ctx, C.flash, lnX, hy + 0.02 * H, 0.11 * W, 0.06 * H, 0.12 * e, true);
    if (u < 0.6) {
      ctx.globalAlpha = 0.42 * e; ctx.strokeStyle = BOLT_CSS; ctx.lineWidth = 1.2 * S; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(BOLT[0], BOLT[1] - up);
      for (let j = 1; j < 11; j++) ctx.lineTo(BOLT[j * 2], BOLT[j * 2 + 1] - up);
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ smoke
  // weather on the smoke: wander (curl, 1 = default), drift (px downwind at the top), flat (spreads out
  // under a low lid of cloud), low (fraction of the column's height lost to wind, fog and cloud)
  let smWander = 1, smDrift = 0, smFlat = 0, smLow = 0;
  function paintSmoke(t, cx, baseY, k, thick) {
    const c = SM.c;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, SM.cv.width, SM.cv.height);
    c.strokeStyle = smokeGrad; c.lineCap = "round"; c.lineJoin = "round";
    const N = 36;
    const nw = 1 + Math.round(3 * U.clamp(thick * 1.3));
    for (let w = 0; w < nw; w++) {
      const Wp = WISPS[w], ox = Wp[0], hf = Wp[1], seed = Wp[2], spd = Wp[3];
      const x0 = cx + ox * k - SM_X0, y0 = baseY, top = y0 - hf * H * (1 - smLow);
      const lean = U.noise1(t * 0.013 + seed) * 0.07 * W * smWander;
      const side = w === 0 ? 0 : (w & 1) ? 1 : -1;   // under a lid the outer wisps fan out
      for (let seg = 0; seg < 3; seg++) {
        const v0 = seg / 3, v1 = (seg + 1) / 3;
        c.lineWidth = (U.lerp(4, 7, thick) + (v0 + v1) * 0.5 * U.lerp(16, 34, thick) * (1 + 1.3 * smFlat * v1 * v1)) * S * SMK;
        c.globalAlpha = w === 0 ? 0.42 : 0.26;
        c.beginPath();
        for (let j = 0; j <= N / 3; j++) {
          const v = v0 + (v1 - v0) * j / (N / 3);
          const vv = Math.pow(v, 0.95), fl = smFlat * v * v * v;
          const x = x0 + vv * (0.08 * W * U.noise2(v * 2.6 - t * 0.09 * spd, seed) + 0.025 * W * U.noise2(v * 6 - t * 0.21 * spd, seed + 9)) * smWander
            + lean * v * v + smDrift * v * Math.sqrt(v) + side * fl * 0.11 * W;
          const y = U.lerp(y0, top, v - fl * 0.3);
          if (j === 0) c.moveTo(x * SMK, y * SMK); else c.lineTo(x * SMK, y * SMK);
        }
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ daytime: the campsite by day
  // By day the camera pulls back a little: a clearing at the forest edge, a real sky, a log seat, a kettle on
  // a stone, the fire banked to coals under a thin column of smoke, now and then a blue jay. Everything is a
  // function of frame.day and the sun's elevation (deterministic, interpolated, never snapping). Large fills
  // are painted at full day colour and laid down at <= 0.4 alpha (rule 2), so the wall stays a dim painting.
  // The land (forest, clearing, seat, kettle) is baked once per season at half resolution and re-tinted
  // offscreen only when its (finely quantised) light changes; sky, sun, clouds, dapple and weather are live.
  const DLK = 0.5;                 // day layers: px per css px (soft, painterly, cheap)
  const HZ = 0.6;                  // where the forest meets the clearing (of H)
  const DAY_FILL = 0.4;            // large-fill alpha at full daylight (0.12 + 0.28 * day at day = 1)
  const LAND_FILL = 0.34;
  const SKY_FILL = 0.385;          // the sky: the brightest large area, just under the ceiling          // the land a touch under it: the sky is the brightest thing out there
  // sky keyframes by solar elevation: [elev, top, middle, horizon] (full day colour, before DAY_FILL)
  const SKY_K = [
    [-8, hex("#10162e"), hex("#1e1e3c"), hex("#2e2438")],
    [-3, hex("#2c346e"), hex("#784e78"), hex("#b05434")],
    [1, hex("#44569a"), hex("#bc8266"), hex("#cc7c38")],
    [5, hex("#4874b6"), hex("#bc9a80"), hex("#cc984c")],
    [12, hex("#3c8cd0"), hex("#72b4d6"), hex("#b8cccc")],
    [28, hex("#3290d0"), hex("#5eaed4"), hex("#a4ccd4")],
  ];
  // weather skies: [top, middle, horizon] (bright overcast, grey rain, storm-dark, milky fog, snow)
  const SKY_OVER = [hex("#767c86"), hex("#7e848c"), hex("#868a8e")];
  const SKY_RAIN = [hex("#5e646e"), hex("#686e76"), hex("#70747a")];
  const SKY_STORM = [hex("#1e2436"), hex("#2a3042"), hex("#3a3a46")];
  const SKY_FOG = [hex("#686c70"), hex("#6c7074"), hex("#707276")];
  const SKY_SNOW = [hex("#7a8292"), hex("#848a96"), hex("#8c909a")];
  const SUN_K = [[-2, hex("#d05a2c")], [2, hex("#d6823a")], [8, hex("#d6a04c")], [20, hex("#d6b866")], [40, hex("#d6c070")]];
  const DC = {
    ridge: hex("#5c7a8c"), ridgeAut: hex("#6a7480"),
    spruce: hex("#1e3a26"), spruceLit: hex("#3e6a40"), spruceFar: hex("#2e4a50"),
    leaf: hex("#3e6a2c"), leafLit: hex("#6c9a40"), leafSpring: hex("#78a848"),
    autOrange: hex("#c86e22"), autRed: hex("#a83a1c"), autGold: hex("#c8a030"), autRust: hex("#8c4c20"),
    bare: hex("#5e5048"), trunk: hex("#2a221c"), birch: hex("#a49e90"), birchMark: hex("#2e2a26"),
    grass: hex("#345a16"), grassAut: hex("#4a581a"), grassWin: hex("#4e4c40"), grassShade: hex("#121a0a"),
    earth: hex("#a0805a"), earthAsh: hex("#7e766c"),
    bark: hex("#4a3e36"), barkLit: hex("#6e6050"), barkDark: hex("#1a1412"), endGrain: hex("#a88a62"), rings: hex("#76583a"),
    stone: hex("#5e5b56"), stoneLit: hex("#7e7a72"), stoneDark: hex("#2c2a28"),
    kettle: hex("#2e5088"), kettleLit: hex("#6a90c8"), kettleDark: hex("#14223e"), wire: hex("#3c3c40"),
    snow: hex("#a2aabc"), snowShade: hex("#7e8698"),
    fog: hex("#62666a"), rainDay: hex("#8c96a6"), snowDay: hex("#aab0c2"),
    dapple: hex("#d2b464"), shadow: hex("#000000"),
    ash: hex("#6e6a66"), ashDark: hex("#3a3634"),
    smokeDayLo: hex("#8a8a90"), smokeDayHi: hex("#8490a2"),
    jayBlue: hex("#3c74c0"), jayDeep: hex("#284e8c"), jayBelly: hex("#8e939c"), jayTip: hex("#868c96"), jayBlack: hex("#14161c"),
  };
  // day colours are laid down dimmed (fills at <= 0.4), so they only need capping, not U.safe's chroma pull
  const dc = (c) => ({ r: Math.min(215, c.r), g: Math.min(215, c.g), b: Math.min(215, c.b) });
  const BARK_CSS = U.rgba(dc(DC.bark), 1), BARK_LIT = U.rgba(dc(DC.barkLit), 1), BARK_DARK = U.rgba(dc(DC.barkDark), 1);
  const lerpKeys = (K, el, out, n) => {
    let i = 0;
    while (i < K.length - 2 && el > K[i + 1][0]) i++;
    const u = U.clamp((el - K[i][0]) / (K[i + 1][0] - K[i][0]));
    for (let j = 0; j < n; j++) { const a = K[i][j + 1], b = K[i + 1][j + 1]; out[j].r = U.lerp(a.r, b.r, u); out[j].g = U.lerp(a.g, b.g, u); out[j].b = U.lerp(a.b, b.b, u); }
  };
  const SKY = [{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }], SUNC = [{ r: 0, g: 0, b: 0 }];
  const mixInto = (o, c, k) => { o.r += (c.r - o.r) * k; o.g += (c.g - o.g) * k; o.b += (c.b - o.b) * k; };
  // frame.day can be pinned (tests): then the sun's elevation follows the pinned light, not the clock
  function sunElev(dl, day) {
    const el = dl ? dl.elevation : -30, li = dl ? dl.light : 0;
    if (Math.abs(li - day) < 0.002) return el;
    if (day <= 0) return Math.min(el, -8);
    if (day >= 1) return Math.max(el, 30);
    return -6 + 14 * (0.5 - Math.sin(Math.asin(1 - 2 * day) / 3));   // inverse of the civil-twilight ramp
  }
  // the season, smooth over the days: [spring green, autumn colour, bare winter]
  function season(now) {
    const y0 = new Date(now.getFullYear(), 0, 1), d = (now - y0) / 86400000;
    const ss = U.smoothstep;
    const aut = ss(244, 268, d) * (1 - ss(298, 314, d));
    const bare = Math.max(ss(300, 318, d), 1 - ss(100, 128, d));
    const spring = ss(100, 128, d) * (1 - ss(150, 172, d));
    return [spring, aut, bare];
  }

  let propB = null, propSnowB = null;
  let landB = null, landC = null, snowB = null, dappleB = null, cloudS = null, landKey = -1, composeKey = -1, seasonDay = -1, seasonQ = null, seasonKey = -1;
  const LAND = { seat: null, kettle: null };
  // ground-plane layout of the day props (css px, built with the land)
  function propLayout() {
    LAND.seat = { x0: 0.105 * W, x1: 0.318 * W, y: 0.765 * H, r: 0.034 * H };
    LAND.kettle = { x: 0.5 * W + 0.56 * H, y: 0.805 * H, s: 0.05 * H };
  }

  // a dab of paint
  const dab = (c, x, y, r, col, a) => { c.fillStyle = U.rgba(dc(col), a); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
  // spruce: ragged tiers of drooping boughs, sky-lit along their upper edges
  function spruce(c, x, by, h, w, col, lit, rnd, caps) {
    const n = 8 + ((rnd() * 3) | 0);
    c.fillStyle = U.rgba(dc(DC.trunk), 1); c.fillRect(x - w * 0.04, by - h * 0.12, w * 0.08, h * 0.12);
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = Math.min(1, (i + 1.7) / n);
      const yb = by - h * (0.08 + 0.92 * u0), yt = by - h * (0.08 + 0.92 * u1);
      const ww = w * Math.pow(1 - u0, 0.9) * 0.5 * (0.85 + rnd() * 0.3);
      const P = new Path2D(); P.moveTo(x, yt);
      // left bough edge, ragged: a few drooping tips
      const k = 3;
      for (let j = 1; j <= k; j++) {
        const f = j / k, px = x - ww * f, py = yt + (yb - yt) * f;
        P.lineTo(px + ww * 0.12, py - (yb - yt) * 0.18); P.lineTo(px - ww * 0.06 * rnd(), py + (yb - yt) * 0.06);
      }
      P.quadraticCurveTo(x, yb - (yb - yt) * 0.05, x + ww, yb + (yb - yt) * 0.04);
      for (let j = k; j >= 1; j--) {
        const f = j / k, px = x + ww * f, py = yt + (yb - yt) * f;
        P.lineTo(px + ww * 0.06 * rnd(), py + (yb - yt) * 0.06); P.lineTo(px - ww * 0.12, py - (yb - yt) * 0.18);
      }
      P.closePath();
      // a little lighter toward the top of the tree, where the sky reaches it
      c.fillStyle = U.rgba(dc(U.mix(col, lit, 0.35 * (1 - u0))), 1); c.fill(P);
      if (caps) caps.push(x, yt + (yb - yt) * 0.45, ww * 0.7);
    }
  }
  // a broadleaf crown, painted in dabs: shadowed inside, the season's colour, sunlit on top
  function crown(c, cx, cy, rx, ry, cols, rnd, caps) {
    const inE = () => { const a = rnd() * TAU, q = Math.sqrt(rnd()); return [cx + Math.cos(a) * q * rx, cy + Math.sin(a) * q * ry]; };
    for (let k = 0; k < 34; k++) { const [x, y] = inE(); dab(c, x, y, rx * (0.16 + rnd() * 0.14), U.scale(cols[(rnd() * cols.length) | 0], 0.5), 1); }
    for (let k = 0; k < 90; k++) {
      const [x, y] = inE(), v = (y - (cy - ry)) / (2 * ry), col = cols[(rnd() * cols.length) | 0];
      dab(c, x, y, rx * (0.07 + rnd() * 0.09), U.scale(col, 1.12 - 0.5 * v), 1);
    }
    for (let k = 0; k < 40; k++) {
      const [x, y] = inE();
      if (y > cy) continue;
      dab(c, x - rx * 0.08, y - ry * 0.12, rx * (0.04 + rnd() * 0.05), U.scale(cols[(rnd() * cols.length) | 0], 1.35), 0.9);
    }
    if (caps) for (let k = 0; k < 3; k++) caps.push(cx + (k - 1) * rx * 0.45, cy - ry * (0.75 - Math.abs(k - 1) * 0.25), rx * 0.32);
  }
  function decid(c, x, by, h, w, cols, rnd, caps, bare) {
    c.strokeStyle = U.rgba(dc(DC.trunk), 1); c.lineCap = "round";
    c.lineWidth = w * 0.07; c.beginPath(); c.moveTo(x, by); c.lineTo(x + w * 0.03, by - h * 0.55); c.stroke();
    c.lineWidth = w * 0.03; c.beginPath(); c.moveTo(x + w * 0.02, by - h * 0.35); c.lineTo(x - w * 0.2, by - h * 0.6);
    c.moveTo(x + w * 0.03, by - h * 0.42); c.lineTo(x + w * 0.22, by - h * 0.66); c.stroke();
    if (bare > 0.5) {
      // winter: a fan of bare limbs
      c.lineWidth = Math.max(1, w * 0.025); c.strokeStyle = U.rgba(dc(DC.bare), 1);
      c.beginPath();
      for (let k = 0; k < 14; k++) {
        const a = -Math.PI / 2 + (rnd() - 0.5) * 1.9, L = h * (0.3 + rnd() * 0.4);
        const sx = x + w * 0.03, sy = by - h * (0.35 + rnd() * 0.25);
        c.moveTo(sx, sy); c.quadraticCurveTo(sx + Math.cos(a) * L * 0.5, sy + Math.sin(a) * L * 0.6, sx + Math.cos(a) * L, sy + Math.sin(a) * L);
      }
      c.stroke();
      return;
    }
    // two or three lobes
    const nl = 2 + ((rnd() * 2) | 0);
    for (let k = 0; k < nl; k++) {
      const ox = (k - (nl - 1) / 2) * w * 0.28 + (rnd() - 0.5) * w * 0.1, oy = (rnd() - 0.5) * h * 0.12;
      crown(c, x + ox, by - h * 0.66 + oy, w * (0.32 + rnd() * 0.08), h * (0.24 + rnd() * 0.06), cols, rnd, k === 0 ? caps : null);
    }
  }
  function birch(c, x, by, h, w, cols, rnd) {
    c.fillStyle = U.rgba(dc(DC.birch), 1); c.fillRect(x - w * 0.025, by - h * 0.8, w * 0.05, h * 0.8);
    c.fillStyle = U.rgba(dc(DC.birchMark), 0.9);
    for (let k = 0; k < 8; k++) c.fillRect(x - w * 0.025, by - h * (0.1 + rnd() * 0.65), w * (0.02 + rnd() * 0.03), Math.max(1, h * 0.007));
    crown(c, x, by - h * 0.82, w * 0.3, h * 0.16, cols, rnd, null);
  }

  // The land: distant ridge, the forest edge, the clearing, the log seat and the kettle on its stone.
  function buildLand(seas) {
    const [spring, aut, bare] = seas;
    propLayout();
    landB = mk(W, H, DLK); snowB = mk(W, H, DLK);
    const c = landB.c, sc = snowB.c, r = U.rng(31337), caps = [];
    // the season's leaves
    const leafSummer = [DC.leaf, DC.leafLit, U.mix(DC.leaf, DC.leafLit, 0.5)];
    const leafSpring = [DC.leafSpring, DC.leafLit, U.mix(DC.leafSpring, DC.leaf, 0.4)];
    const leafAut = [DC.autOrange, DC.autRed, DC.autGold, DC.autRust, U.mix(DC.autGold, DC.leaf, 0.5)];
    const leaves = aut > 0.5 ? leafAut : spring > 0.5 ? leafSpring : leafSummer;
    const hz = HZ * H;
    // distant hills, blue with the air between
    c.beginPath(); c.moveTo(0, hz);
    for (let x = 0; x <= W + 20; x += 20) c.lineTo(x, hz - 0.19 * H - 0.04 * H * U.noise1(x * 0.003 + 3) - 0.015 * H * U.noise1(x * 0.011));
    c.lineTo(W, hz + 4); c.lineTo(0, hz + 4); c.closePath();
    c.fillStyle = U.rgba(dc(U.mix(DC.ridge, DC.ridgeAut, aut * 0.5)), 1); c.fill();
    // back row: small spruce, hazed toward the sky
    for (let x = -30; x < W + 30; x += 12 + r() * 16) {
      const h = (0.14 + r() * 0.1) * H, w = h * (0.34 + r() * 0.1);
      spruce(c, x, hz + 0.004 * H, h, w, U.mix(DC.spruceFar, DC.ridge, 0.25 + r() * 0.2), U.mix(DC.spruceFar, DC.ridge, 0.8), r, null);
    }
    // front row: the forest edge, lower in the middle so the clock keeps open sky; taller at the sides
    for (let x = -40; x < W + 40; x += 28 + r() * 42) {
      const mid = (1 - 0.3 * Math.exp(-Math.pow((x - W / 2) / (0.18 * W), 2))) * (1 - 0.5 * Math.exp(-Math.pow((x - 0.885 * W) / (0.06 * W), 2)));
      const kind = r(), by = hz + (0.004 + r() * 0.01) * H;
      if (kind < 0.5) {
        const h = (0.26 + r() * 0.16) * H * mid, w = h * (0.3 + r() * 0.08);
        spruce(c, x, by, h, w, U.mix(DC.spruce, DC.spruceFar, r() * 0.2), DC.spruceLit, r, caps);
      } else if (kind < 0.86) {
        const h = (0.22 + r() * 0.1) * H * mid, w = h * (0.7 + r() * 0.25);
        decid(c, x, by, h, w, leaves, r, caps, bare);
      } else {
        const h = (0.2 + r() * 0.08) * H * mid, w = h * 0.5;
        birch(c, x, by, h, w, aut > 0.5 ? [DC.autGold, DC.autGold, U.mix(DC.autGold, DC.autOrange, 0.5)] : leaves, r);
      }
    }
    // the clearing: shade under the trees, sun in the open, a little darker toward the viewer
    const gcol = U.mix(U.mix(DC.grass, DC.grassAut, aut), DC.grassWin, bare);
    const gg = c.createLinearGradient(0, hz - 4, 0, H);
    gg.addColorStop(0, U.rgba(dc(DC.grassShade), 1)); gg.addColorStop(0.12, U.rgba(dc(U.mix(DC.grassShade, gcol, 0.6)), 1));
    gg.addColorStop(0.35, U.rgba(dc(gcol), 1)); gg.addColorStop(1, U.rgba(dc(U.scale(gcol, 0.72)), 1));
    c.fillStyle = gg;
    c.beginPath(); c.moveTo(0, hz + 2);
    for (let x = 0; x <= W + 16; x += 16) c.lineTo(x, hz - 0.004 * H + 0.006 * H * U.noise1(x * 0.03 + 9));
    c.lineTo(W, H); c.lineTo(0, H); c.closePath(); c.fill();
    // the sun on the open glade, warm and green
    {
      const gx = 0.5 * W, gy2 = 0.7 * H, gr = 0.55 * W, lit = U.mix(U.scale(gcol, 1.9), hex("#b8b040"), 0.3);
      const lg = c.createRadialGradient(gx, gy2, 0, gx, gy2, gr);
      lg.addColorStop(0, U.rgba(dc(lit), 0.34)); lg.addColorStop(0.6, U.rgba(dc(lit), 0.14)); lg.addColorStop(1, U.rgba(dc(lit), 0));
      c.save(); c.translate(gx, gy2); c.scale(1, 0.22); c.translate(-gx, -gy2);
      c.fillStyle = lg; c.fillRect(gx - gr, gy2 - gr, gr * 2, gr * 2); c.restore();
    }
    // the forest's own shade, scalloped along its edge
    c.fillStyle = U.rgba(dc(DC.grassShade), 0.55);
    for (let x = 0; x < W; x += 30 + r() * 40) {
      const w = (0.03 + r() * 0.05) * W;
      c.beginPath(); c.ellipse(x, hz + 0.004 * H, w, (0.012 + r() * 0.02) * H, 0, 0, TAU); c.fill();
    }
    // tufts of grass: short strokes, longer toward the viewer
    c.lineCap = "round";
    for (let i = 0; i < 1600; i++) {
      const y = hz + Math.pow(r(), 0.8) * (H - hz), x = r() * W, d = (y - hz) / (H - hz);
      const len = (2 + 9 * d) * (0.6 + r() * 0.8), lean = (r() - 0.5) * len * 0.6;
      const lc = r() < 0.5 ? U.scale(gcol, 1.25) : U.scale(gcol, 0.7);
      c.strokeStyle = U.rgba(dc(lc), 0.5 + r() * 0.3); c.lineWidth = 1 + d;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + lean, y - len); c.stroke();
    }
    // worn earth around the fire ring (the ring itself is drawn live)
    {
      const cx = 0.5 * W, cy = 0.812 * H, rx = 0.46 * H, ry = 0.105 * H;
      const eg = c.createRadialGradient(cx, cy, 0, cx, cy, rx);
      eg.addColorStop(0, U.rgba(dc(DC.earthAsh), 1)); eg.addColorStop(0.55, U.rgba(dc(DC.earth), 0.95));
      eg.addColorStop(0.8, U.rgba(dc(DC.earth), 0.5)); eg.addColorStop(1, U.rgba(dc(DC.earth), 0));
      c.save(); c.translate(cx, cy); c.scale(1, ry / rx); c.translate(-cx, -cy);
      c.fillStyle = eg; c.beginPath(); c.arc(cx, cy, rx, 0, TAU); c.fill(); c.restore();
      // a path worn off toward the log seat
      c.strokeStyle = U.rgba(dc(DC.earth), 0.35); c.lineWidth = 0.035 * H;
      c.beginPath(); c.moveTo(cx - 0.3 * H, cy - 0.02 * H); c.quadraticCurveTo(0.33 * W, 0.79 * H, 0.22 * W, 0.8 * H); c.stroke();
    }
    // fallen leaves in autumn
    if (aut > 0.3) {
      for (let i = 0; i < 260; i++) {
        const y = hz + Math.pow(r(), 0.7) * (H - hz), x = r() * W, d = (y - hz) / (H - hz), s = (1.5 + 3 * d) * (0.6 + r() * 0.6);
        c.fillStyle = U.rgba(dc(leafAut[(r() * 4) | 0]), 0.7 * aut);
        c.beginPath(); c.ellipse(x, y, s, s * 0.55, r() * 3, 0, TAU); c.fill();
      }
    }
    // the props sit on their own layer, above the snow blanket
    propB = mk(W, H, DLK); propSnowB = mk(W, H, DLK);
    const pcaps = [];
    // the log seat: a felled trunk, bark lit from above, the sawn end toward the fire
    {
      const c = propB.c, caps = pcaps;
      const L = LAND.seat, len = L.x1 - L.x0, rr = L.r;
      c.fillStyle = "rgba(0,0,0,0.35)";
      c.beginPath(); c.ellipse(L.x0 + len / 2, L.y + rr * 0.95, len * 0.55, rr * 0.35, 0, 0, TAU); c.fill();
      const bg = c.createLinearGradient(0, L.y - rr, 0, L.y + rr);
      bg.addColorStop(0, U.rgba(dc(DC.barkLit), 1)); bg.addColorStop(0.45, U.rgba(dc(DC.bark), 1)); bg.addColorStop(1, U.rgba(dc(DC.barkDark), 1));
      c.fillStyle = bg;
      c.beginPath(); c.moveTo(L.x0, L.y - rr); c.lineTo(L.x1, L.y - rr * 0.92); c.ellipse(L.x1, L.y + rr * 0.04, rr * 0.36, rr * 0.96, 0, -Math.PI / 2, Math.PI / 2);
      c.lineTo(L.x0, L.y + rr); c.ellipse(L.x0, L.y, rr * 0.36, rr, 0, Math.PI / 2, Math.PI * 1.5); c.closePath(); c.fill();
      // bark furrows
      c.strokeStyle = U.rgba(dc(DC.barkDark), 0.55); c.lineWidth = 1.3;
      c.beginPath();
      for (let k = 0; k < 16; k++) {
        const yy = L.y - rr * 0.8 + r() * rr * 1.6, xs = L.x0 + r() * len * 0.8, xl = len * (0.1 + r() * 0.25);
        c.moveTo(xs, yy); c.lineTo(Math.min(L.x1 - rr * 0.2, xs + xl), yy + (r() - 0.5) * 3);
      }
      c.stroke();
      // a broken-off branch stub
      c.fillStyle = U.rgba(dc(DC.bark), 1);
      c.beginPath(); c.ellipse(L.x0 + len * 0.36, L.y - rr * 1.05, rr * 0.22, rr * 0.3, -0.5, 0, TAU); c.fill();
      // the sawn end: pale wood, rings, a crack
      c.fillStyle = U.rgba(dc(DC.endGrain), 1);
      c.beginPath(); c.ellipse(L.x1, L.y + rr * 0.04, rr * 0.34, rr * 0.9, 0, 0, TAU); c.fill();
      c.strokeStyle = U.rgba(dc(DC.rings), 0.8); c.lineWidth = 1;
      for (let k = 1; k <= 4; k++) { c.beginPath(); c.ellipse(L.x1, L.y + rr * 0.04, rr * 0.34 * k / 5, rr * 0.9 * k / 5, 0, 0, TAU); c.stroke(); }
      c.beginPath(); c.moveTo(L.x1, L.y + rr * 0.04); c.lineTo(L.x1 + rr * 0.05, L.y - rr * 0.6); c.stroke();
      if (caps) caps.push(L.x0 + len / 2, L.y - rr * 0.72, len * 0.5);
    }
    // the kettle on its flat stone, spout toward the fire
    {
      const c = propB.c, caps = pcaps;
      const K = LAND.kettle, s = K.s, x = K.x, y = K.y;
      c.fillStyle = "rgba(0,0,0,0.35)";
      c.beginPath(); c.ellipse(x + s * 0.1, y + s * 0.42, s * 1.15, s * 0.22, 0, 0, TAU); c.fill();
      const sg = c.createLinearGradient(0, y - s * 0.1, 0, y + s * 0.42);
      sg.addColorStop(0, U.rgba(dc(DC.stoneLit), 1)); sg.addColorStop(1, U.rgba(dc(DC.stoneDark), 1));
      c.fillStyle = sg;
      c.beginPath(); c.moveTo(x - s * 1.0, y + s * 0.18); c.quadraticCurveTo(x - s * 0.9, y - s * 0.08, x - s * 0.2, y - s * 0.1);
      c.quadraticCurveTo(x + s * 0.8, y - s * 0.12, x + s * 1.05, y + s * 0.12); c.quadraticCurveTo(x + s * 0.9, y + s * 0.42, x, y + s * 0.4);
      c.quadraticCurveTo(x - s * 0.95, y + s * 0.42, x - s * 1.0, y + s * 0.18); c.closePath(); c.fill();
      // body: a squat enamel kettle
      const ky = y - s * 0.08, kg = c.createLinearGradient(x - s * 0.6, 0, x + s * 0.6, 0);
      kg.addColorStop(0, U.rgba(dc(DC.kettleDark), 1)); kg.addColorStop(0.35, U.rgba(dc(DC.kettleLit), 1)); kg.addColorStop(1, U.rgba(dc(DC.kettleDark), 1));
      // spout (toward the fire, to the left)
      c.fillStyle = U.rgba(dc(DC.kettle), 1);
      c.beginPath(); c.moveTo(x - s * 0.45, ky - s * 0.25); c.quadraticCurveTo(x - s * 0.75, ky - s * 0.3, x - s * 0.95, ky - s * 0.62);
      c.lineTo(x - s * 0.86, ky - s * 0.66); c.quadraticCurveTo(x - s * 0.72, ky - s * 0.42, x - s * 0.42, ky - s * 0.42); c.closePath(); c.fill();
      c.fillStyle = kg;
      c.beginPath(); c.moveTo(x - s * 0.58, ky); c.bezierCurveTo(x - s * 0.66, ky - s * 0.42, x - s * 0.4, ky - s * 0.62, x, ky - s * 0.62);
      c.bezierCurveTo(x + s * 0.4, ky - s * 0.62, x + s * 0.66, ky - s * 0.42, x + s * 0.58, ky); c.closePath(); c.fill();
      c.fillStyle = U.rgba(dc(DC.kettleDark), 1);
      c.beginPath(); c.ellipse(x, ky, s * 0.58, s * 0.08, 0, 0, TAU); c.fill();
      // lid and knob
      c.fillStyle = U.rgba(dc(DC.kettle), 1); c.beginPath(); c.ellipse(x, ky - s * 0.62, s * 0.3, s * 0.07, 0, 0, TAU); c.fill();
      c.fillStyle = U.rgba(dc(DC.kettleDark), 1); c.beginPath(); c.ellipse(x, ky - s * 0.7, s * 0.07, s * 0.05, 0, 0, TAU); c.fill();
      // a glint of sky on the shoulder
      c.strokeStyle = U.rgba(dc(DC.kettleLit), 0.9); c.lineWidth = Math.max(1, s * 0.05);
      c.beginPath(); c.arc(x - s * 0.1, ky - s * 0.3, s * 0.38, -2.5, -1.9); c.stroke();
      // the wire handle
      c.strokeStyle = U.rgba(dc(DC.wire), 1); c.lineWidth = Math.max(1, s * 0.04);
      c.beginPath(); c.moveTo(x - s * 0.42, ky - s * 0.5); c.quadraticCurveTo(x, ky - s * 1.25, x + s * 0.42, ky - s * 0.5); c.stroke();
      if (caps) caps.push(x, ky - s * 0.64, s * 0.3);
    }
    // the snow layer: the clearing blanketed, caps on the trees, the seat and the kettle
    {
      const sn = dc(DC.snow), sd = dc(DC.snowShade);
      const g2 = sc.createLinearGradient(0, hz, 0, H);
      g2.addColorStop(0, U.rgba(sd, 0.9)); g2.addColorStop(0.3, U.rgba(sn, 0.92)); g2.addColorStop(1, U.rgba(U.mix(sn, sd, 0.5), 0.92));
      sc.fillStyle = g2; sc.fillRect(0, hz - 0.004 * H, W, H - hz + 0.004 * H);
      sc.fillStyle = U.rgba(sn, 0.85);
      for (let i = 0; i < caps.length; i += 3) {
        sc.beginPath(); sc.ellipse(caps[i], caps[i + 1], caps[i + 2], Math.max(1.5, caps[i + 2] * 0.22), 0, Math.PI, TAU); sc.fill();
      }
      // soft drifts
      for (let i = 0; i < 40; i++) {
        const y = hz + r() * (H - hz), x = r() * W, w = (0.02 + r() * 0.06) * W;
        sc.fillStyle = U.rgba(sd, 0.25); sc.beginPath(); sc.ellipse(x, y, w, w * 0.06, 0, 0, TAU); sc.fill();
      }
      const ps = propSnowB.c;
      ps.fillStyle = U.rgba(sn, 0.9);
      for (let i = 0; i < pcaps.length; i += 3) {
        ps.beginPath(); ps.ellipse(pcaps[i], pcaps[i + 1], pcaps[i + 2], Math.max(2, Math.min(pcaps[i + 2] * 0.3, 0.012 * H)), 0, Math.PI, TAU); ps.fill();
      }
    }
    landC = mk(W, H, DLK);
    composeKey = -1;
  }

  // dappled light: soft warm blotches, thick under the trees' edge and at the sides, sparse in the open
  function buildDapple() {
    dappleB = mk(W, H * (1 - HZ) + 2, DLK);
    const c = dappleB.c, r = U.rng(8081), dpc = dc(DC.dapple), h = H * (1 - HZ);
    for (let i = 0; i < 150; i++) {
      const x = r() * W, yy = Math.pow(r(), 1.6) * h;
      const side = Math.abs(x - W / 2) / (W / 2);
      if (r() > 0.25 + 0.75 * Math.max(side, 1 - yy / h * 1.6)) continue;
      const d = yy / h, rx = (6 + 18 * d) * (0.6 + r() * 0.9), ry = rx * (0.35 + 0.1 * d);
      const g = c.createRadialGradient(x, yy, 0, x, yy, rx);
      g.addColorStop(0, U.rgba(dpc, 0.9)); g.addColorStop(0.6, U.rgba(dpc, 0.4)); g.addColorStop(1, U.rgba(dpc, 0));
      c.save(); c.translate(x, yy); c.scale(1, ry / rx); c.translate(-x, -yy);
      c.fillStyle = g; c.fillRect(x - rx, yy - rx, rx * 2, rx * 2); c.restore();
    }
  }
  // fair-weather clouds: a few soft cumulus sprites, lit from above
  function buildClouds() {
    cloudS = [];
    const r = U.rng(6262);
    for (let k = 0; k < 4; k++) {
      const w = (0.14 + r() * 0.1) * W, h = w * 0.34;
      const P = mk(w, h, DLK), c = P.c;
      const top = dc(hex("#c6cad2")), base = dc(hex("#8a92a2"));
      // a heap of puffs on a flat base: big in the middle, smaller toward the ends
      for (let i = 0; i < 34; i++) {
        const u = r(), x = w * (0.12 + 0.76 * u), bump = Math.sin(Math.PI * u);
        const rr = h * (0.1 + 0.2 * bump * (0.6 + r() * 0.6)), y = h * 0.74 - rr * (0.4 + 0.5 * r()) - bump * h * 0.12;
        const g = c.createRadialGradient(x - rr * 0.2, y - rr * 0.45, rr * 0.1, x, y, rr);
        g.addColorStop(0, U.rgba(top, 0.95)); g.addColorStop(0.75, U.rgba(U.mix(top, base, 0.55), 0.85)); g.addColorStop(1, U.rgba(base, 0));
        c.fillStyle = g; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
      }
      // a flat, shaded base
      c.fillStyle = U.rgba(base, 0.55); c.beginPath(); c.ellipse(w * 0.5, h * 0.74, w * 0.36, h * 0.07, 0, 0, TAU); c.fill();
      // soften: blur it into the sprite; a second copy lit by a low sun (gold on top, rose underneath)
      const L = mk(w, h, DLK);
      if (HAS_FILTER) L.c.filter = "blur(2px)";
      L.c.setTransform(1, 0, 0, 1, 0, 0); L.c.drawImage(P.cv, 0, 0);
      if (HAS_FILTER) L.c.filter = "none";
      const Wm = mk(w, h, DLK);
      Wm.c.setTransform(1, 0, 0, 1, 0, 0); Wm.c.drawImage(L.cv, 0, 0);
      Wm.c.globalCompositeOperation = "source-atop";
      const wg = Wm.c.createLinearGradient(0, 0, 0, Wm.cv.height);
      wg.addColorStop(0, "rgba(214,150,84,0.92)"); wg.addColorStop(1, "rgba(168,86,96,0.92)");
      Wm.c.fillStyle = wg; Wm.c.fillRect(0, 0, Wm.cv.width, Wm.cv.height);
      L.warm = Wm;
      cloudS.push(L);
    }
  }
  // Re-tint the land offscreen when its light changes: warm low sun, the grey of cloud, the dark of rain,
  // the snow blanket. Each knob is quantised finely enough that a step is invisible.
  function composeLand(warm, grey, dark, snow, fog) {
    const q = (v, n) => Math.round(U.clamp(v) * n);
    const key = (((q(warm, 32) * 33 + q(grey, 32)) * 33 + q(dark, 32)) * 25 + q(snow, 24)) * 33 + q(fog, 32);
    if (key === composeKey) return;
    composeKey = key;
    const c = landC.c;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
    c.clearRect(0, 0, landC.cv.width, landC.cv.height);
    c.drawImage(landB.cv, 0, 0);
    const sn = q(snow, 24) / 24;
    if (sn > 0) { c.globalAlpha = sn; c.drawImage(snowB.cv, 0, 0); c.globalAlpha = 1; }
    c.drawImage(propB.cv, 0, 0);
    if (sn > 0) { c.globalAlpha = sn; c.drawImage(propSnowB.cv, 0, 0); c.globalAlpha = 1; }
    c.globalCompositeOperation = "source-atop";
    const w = q(warm, 32) / 32, g = q(grey, 32) / 32, d = q(dark, 32) / 32;
    if (w > 0) { c.fillStyle = `rgba(150,84,34,${0.42 * w})`; c.fillRect(0, 0, landC.cv.width, landC.cv.height); }
    if (g > 0) { c.fillStyle = `rgba(66,70,76,${0.34 * g})`; c.fillRect(0, 0, landC.cv.width, landC.cv.height); }
    if (d > 0) { c.fillStyle = `rgba(4,6,10,${0.55 * d})`; c.fillRect(0, 0, landC.cv.width, landC.cv.height); }
    const fg = q(fog, 32) / 32;
    if (fg > 0) {
      // fog: the far trees all but gone, the clearing softened
      const k = DLK, hz = HZ * H * k, fl = landC.c.createLinearGradient(0, 0, 0, landC.cv.height);
      const fc = "114,118,122";
      fl.addColorStop(0, `rgba(${fc},${0.88 * fg})`); fl.addColorStop(hz / landC.cv.height * 0.85, `rgba(${fc},${0.8 * fg})`);
      fl.addColorStop(hz / landC.cv.height, `rgba(${fc},${0.62 * fg})`); fl.addColorStop(1, `rgba(${fc},${0.3 * fg})`);
      c.fillStyle = fl; c.fillRect(0, 0, landC.cv.width, landC.cv.height);
    }
    // laid down opaque (the land hides the sky) but at the large-fill level: DAY_FILL of its full colour
    c.fillStyle = `rgba(0,0,0,${1 - LAND_FILL})`; c.fillRect(0, 0, landC.cv.width, landC.cv.height);
    c.globalCompositeOperation = "source-over";
  }

  // where the sun is on the wall: rises at the left, highest right of the clock at noon, sets into the trees at the right
  const SUNP = { x: 0, y: 0, u: 0.5 };
  function sunPos(el, u) {
    const x = u < 0.5 ? U.lerp(0.1, 0.72, U.clamp(u / 0.5)) : U.lerp(0.72, 0.9, U.clamp((u - 0.5) / 0.5));
    const s = Math.sin(U.clamp(el, -20, 90) * Math.PI / 180), f = Math.sign(s) * Math.pow(Math.abs(s), 0.6);
    SUNP.x = x * W; SUNP.y = (0.44 - 0.38 * f) * H; SUNP.u = u;
  }

  // the blue jay: hops between perches on the seat and the ground in front of it, pecks, now and then away
  const JP = [[0.82, -1.0, 1], [0.42, -1.0, -1], [0.55, 1.9, 1]];  // [along seat, height in seat radii (- = on top), facing]
  function jayAt(nowS, out) {
    const cyc = 150, ph = ((nowS % cyc) + cyc) % cyc;
    const seg = [[0, 38], [38, 80], [80, 128]];
    let a = 1, i = 0, hop = 0;
    if (ph >= 128) { a = 0; } else {
      for (let k = 0; k < 3; k++) if (ph >= seg[k][0]) i = k;
      const into = ph - seg[i][0];
      if (into < 0.45 && i > 0) hop = 1 - into / 0.45;   // landing from the previous perch
      if (ph > 124) a = 1 - (ph - 124) / 4;
      if (ph < 4) a = ph / 4;
    }
    const L = LAND.seat, P = JP[i], Q = JP[Math.max(0, i - 1)];
    const px = (p) => L.x0 + (L.x1 - L.x0) * p[0], py = (p) => L.y + L.r * p[1];
    const u = 1 - hop;
    out.x = U.lerp(px(Q), px(P), u); out.y = U.lerp(py(Q), py(P), u) - Math.sin(Math.PI * u) * L.r * 1.2 * (hop > 0 ? 1 : 0);
    out.dir = P[2]; out.a = a;
    out.peck = hop > 0 ? 0 : Math.max(0, Math.sin(nowS * 2.3 + i) * 3 - 2.2);
    return out;
  }
  const JAY = { x: 0, y: 0, dir: 1, a: 0, peck: 0 };
  const JAYC = {
    blue: U.rgba(dc(DC.jayBlue), 1), deep: U.rgba(dc(DC.jayDeep), 1), belly: U.rgba(dc(DC.jayBelly), 1),
    tip: U.rgba(dc(DC.jayTip), 1), black: U.rgba(dc(DC.jayBlack), 1),
  };
  function drawJay(ctx, x, y, s, dir, peck, a) {
    if (a <= 0.01) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * s / 40, s / 40); ctx.globalAlpha = U.clamp(a);
    // tail
    ctx.fillStyle = JAYC.deep;
    ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(-30, -6); ctx.lineTo(-31, -2); ctx.lineTo(-4, -9); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = JAYC.tip; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-30, -6); ctx.lineTo(-31, -2); ctx.stroke();
    // legs
    ctx.strokeStyle = JAYC.black; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(1, -8); ctx.lineTo(0, 0); ctx.moveTo(4, -8); ctx.lineTo(4, 0); ctx.stroke();
    // body: blue back, pale belly
    ctx.fillStyle = JAYC.belly; ctx.beginPath(); ctx.ellipse(2, -14, 12, 8.5, -0.25, 0, TAU); ctx.fill();
    ctx.fillStyle = JAYC.blue; ctx.beginPath(); ctx.ellipse(0, -17, 12, 6.5, -0.3, Math.PI * 0.95, Math.PI * 2.1); ctx.fill();
    // wing with its black bars and pale tips
    ctx.fillStyle = JAYC.deep; ctx.beginPath(); ctx.ellipse(-3, -15, 10, 5, -0.25, 0, TAU); ctx.fill();
    ctx.strokeStyle = JAYC.black; ctx.lineWidth = 1;
    ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.moveTo(-9 + k * 3.5, -18 + k * 0.6); ctx.lineTo(-8 + k * 3.5, -12 + k * 0.6); } ctx.stroke();
    ctx.fillStyle = JAYC.tip; ctx.beginPath(); ctx.ellipse(-8, -12.5, 3, 1.2, -0.25, 0, TAU); ctx.fill();
    // head, crest, beak, eye, the black necklace (the head dips when it pecks)
    ctx.translate(10, -23); ctx.rotate(peck * 0.6);
    ctx.fillStyle = JAYC.blue; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(-7, -11); ctx.lineTo(1, -5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = JAYC.belly; ctx.beginPath(); ctx.ellipse(2.5, 2.5, 4, 3, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = JAYC.black; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(1, 1, 6, 0.2, 2.2); ctx.stroke();
    ctx.fillStyle = JAYC.black; ctx.beginPath(); ctx.moveTo(5.5, -1.5); ctx.lineTo(11, 0.5); ctx.lineTo(5.5, 1.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(2.5, -1.5, 1.3, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // the day's sky: a gradient by the sun's elevation, greyed by the weather; the sun; fair-weather clouds.
  // Returns how much direct sun there is (0..1) for the shadows, the dapple and the land's warmth.
  let cloudDrift = 0;
  const WXSKY = [{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }];
  function drawDaySky(ctx, dt, dA, el, sunU, disc) {
    lerpKeys(SKY_K, el, SKY, 3);
    const over = WXP[1] * U.smoothstep(0.3, 0.95, WXI[1]);
    const ws = over + WXP[2] + WXP[3] + WXP[4] + WXP[5];
    if (ws > 0.001) {
      // the weather's own sky, dimmer when the sun is low behind it
      const lk = 0.45 + 0.55 * U.smoothstep(-5, 10, el);
      for (let j = 0; j < 3; j++) {
        const o = WXSKY[j];
        o.r = (over * SKY_OVER[j].r + WXP[2] * SKY_FOG[j].r + WXP[3] * SKY_RAIN[j].r + WXP[4] * SKY_STORM[j].r + WXP[5] * SKY_SNOW[j].r) / ws * lk;
        o.g = (over * SKY_OVER[j].g + WXP[2] * SKY_FOG[j].g + WXP[3] * SKY_RAIN[j].g + WXP[4] * SKY_STORM[j].g + WXP[5] * SKY_SNOW[j].g) / ws * lk;
        o.b = (over * SKY_OVER[j].b + WXP[2] * SKY_FOG[j].b + WXP[3] * SKY_RAIN[j].b + WXP[4] * SKY_STORM[j].b + WXP[5] * SKY_SNOW[j].b) / ws * lk;
        mixInto(SKY[j], o, Math.min(1, ws));
      }
    }
    const hz = HZ * H;
    const g = ctx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, U.rgba(dc(SKY[0]), 1)); g.addColorStop(0.38, U.rgba(dc(SKY[1]), 1)); g.addColorStop(0.62, U.rgba(dc(SKY[2]), 1)); g.addColorStop(1, U.rgba(dc(SKY[2]), 1));
    ctx.globalAlpha = SKY_FILL * dA; ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz + 4);
    ctx.globalAlpha = 1;
    // the sun
    sunPos(el, sunU);
    const sunK = U.smoothstep(-2.5, 1.5, el) * (1 - U.smoothstep(0.35, 0.8, WX.cover));
    if (sunK * dA > 0.004) {
      lerpKeys(SUN_K, el, SUNC, 1);
      const sc = SUNC[0], low = 1 - U.smoothstep(2, 14, el);
      // the glare: a wide warm brightening of the sky, a bloom, and a small hot disc that is all light
      ctx.globalCompositeOperation = "lighter";
      glow(ctx, sc, SUNP.x, SUNP.y, (0.62 + 0.4 * low) * H, (0.5 + 0.16 * low) * H, (0.1 + 0.13 * low) * dA * sunK, true);
      glow(ctx, sc, SUNP.x, SUNP.y, 0.16 * H, 0.16 * H, 0.42 * dA * sunK, true);
      ctx.globalCompositeOperation = "source-over";
      glow(ctx, sc, SUNP.x, SUNP.y, 0.12 * H, 0.12 * H, dA * sunK * (0.3 + 0.7 * disc));
      glow(ctx, U.mix(sc, hex("#d6cc96"), 0.6), SUNP.x, SUNP.y, 0.065 * H, 0.065 * H, dA * sunK * disc);
      ctx.globalAlpha = dA * sunK * disc; ctx.fillStyle = U.rgba(U.safe(U.mix(sc, hex("#d6cc96"), 0.7)), 1);
      ctx.beginPath(); ctx.arc(SUNP.x, SUNP.y, 0.019 * H, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    // fair-weather cumulus drifting with the wind (more of them as the cloud builds, fewer once it closes over)
    cloudDrift += (5 + 26 * WX.wind) * S * dt;
    const cAmt = WXP[1] * (1 - 0.65 * U.smoothstep(0.55, 1, WXI[1])) + 0.7 * WXP[0];
    if (cAmt * dA > 0.004 && cloudS) {
      const n = (1.5 + 5 * WXI[1]) * WXP[1] + 2.2 * WXP[0];
      for (let i = 0; i < 7; i++) {
        const a = U.clamp(n - i) * cAmt;
        if (a < 0.01) continue;
        const L = cloudS[i & 3], sc = 0.7 + 0.6 * hash(i + 31), cw = L.w * sc, ch = L.h * sc;
        const span = W + cw * 2;
        const x = ((hash(i + 5) * span + cloudDrift * (0.6 + 0.8 * hash(i + 9))) % span) - cw;
        const y = (0.03 + 0.24 * hash(i + 17)) * H;
        const ca = DAY_FILL * 1.6 * dA * a * (0.55 + 0.45 * U.smoothstep(-4, 8, el)), lowc = 1 - U.smoothstep(2, 14, el);
        if (lowc < 0.99) { ctx.globalAlpha = ca * (1 - lowc); ctx.drawImage(L.cv, x, y, cw, ch); }
        if (lowc > 0.01) { ctx.globalAlpha = ca * lowc; ctx.drawImage(L.warm.cv, x, y, cw, ch); }
      }
      ctx.globalAlpha = 1;
    }
    return sunK;
  }

  // the land, re-tinted for the light, then dapple, long shadows and the jay
  function drawDayLand(ctx, t, dA, dAmb, el, sunK, now) {
    // the season (looked at once a day), quantised: the land is re-baked a handful of times a year
    const dn = now.getFullYear() * 400 + now.getMonth() * 32 + now.getDate();
    if (dn !== seasonDay) { seasonDay = dn; seasonQ = season(now).map((v) => Math.round(v * 8) / 8); seasonKey = seasonQ[0] * 648 + seasonQ[1] * 72 + seasonQ[2] * 8; }
    if (!landB || seasonKey !== landKey) { landKey = seasonKey; buildLand(seasonQ); }
    const over = WXP[1] * U.smoothstep(0.3, 0.95, WXI[1]);
    const warm = (1 - U.smoothstep(3, 16, el)) * (1 - 0.8 * U.smoothstep(0.45, 0.9, WX.cover));
    const grey = U.clamp(over * 0.8 + WXP[2] * 0.7 + WXP[3] * 0.9 + WXP[4] + WXP[5] * 0.5);
    const dark = U.clamp(0.22 * WXP[3] + 0.55 * WXP[4] + 0.1 * over + 0.6 * (1 - U.smoothstep(-5, 10, el)));
    composeLand(warm, grey * (1 - 0.7 * WXP[2]), dark, WX.dust, WX.fog);
    ctx.globalAlpha = dA; ctx.drawImage(landC.cv, 0, 0, W, H); ctx.globalAlpha = 1;
    const hz = HZ * H;
    // dappled light where the leaves break the sun, shifting slowly
    const da = 0.12 * dA * sunK * (1 - 0.4 * warm) * (1 - WX.dust * 0.6);
    if (da > 0.004 && dappleB) {
      ctx.globalCompositeOperation = "lighter";
      const ox = 14 * S * Math.sin(t * 0.07), oy = 3 * S * Math.sin(t * 0.05 + 1);
      ctx.globalAlpha = da; ctx.drawImage(dappleB.cv, ox, hz + oy, W, H * (1 - HZ) + 2);
      ctx.globalAlpha = da * 0.6; ctx.drawImage(dappleB.cv, -ox * 1.3 + 9 * S, hz - oy, W, H * (1 - HZ) + 2);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }
    // long shadows of the seat and the kettle, away from the sun
    if (sunK * dA > 0.01) {
      const sl = U.clamp(0.6 / Math.tan(Math.max(4, el) * Math.PI / 180), 0.4, 3.5);
      const L = LAND.seat, K = LAND.kettle;
      for (let i = 0; i < 2; i++) {
        const ox = i ? K.x : (L.x0 + L.x1) / 2, oy = i ? K.y + K.s * 0.35 : L.y + L.r * 0.95;
        const hgt = i ? K.s * 1.1 : L.r * 2, wd = i ? K.s * 1.1 : (L.x1 - L.x0) * 0.55;
        const sd = U.clamp((SUNP.x - ox) / (0.4 * W), -1, 1), len = hgt * sl;
        glow(ctx, DC.shadow, ox - sd * len * 0.6, oy + len * 0.12, wd + len * 0.45 * Math.abs(sd), hgt * 0.32 + len * 0.06, 0.28 * dA * sunK, true);
      }
    }
    // a blue jay on the seat, in fair weather
    const ja = dAmb * (1 - U.smoothstep(0.03, 0.25, WX.rain)) * (1 - WX.storm) * U.smoothstep(1, 6, el) * (1 - CATA);
    if (ja > 0.01) {
      jayAt(now.getTime() / 1000, JAY);
      if (JAY.a > 0.01) drawJay(ctx, JAY.x, JAY.y, 0.046 * H, JAY.dir, JAY.peck, ja * JAY.a);
    }
  }
  // milky daytime fog: thickest at the treeline, thinning toward the viewer
  function drawDayFog(ctx, k) {
    const fc = dc(DC.fog), hz = HZ * H;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, U.rgba(fc, 0)); g.addColorStop(hz / H, U.rgba(fc, 0.1 * k));
    g.addColorStop(0.8, U.rgba(fc, 0.22 * k)); g.addColorStop(1, U.rgba(fc, 0.12 * k));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------------ the cat (THEMES.md "The cat")
  // It lives on the log seat, at the end nearest the fire and facing it: warm and flickering on the fire side,
  // its eyes catching the firelight. It loafs as the evening settles and curls up asleep by the coals in the
  // small hours (cats love the warmth). By day it sits in the sun on the seat, and the jay keeps away. At night
  // the seat is only a firelit edge in the dark, so the cat still sits on something.
  let cat = null, CATA = 0;
  const CATP = { x: 0, y: 0, size: 0 };
  const CAT_RIM = [{ color: null, a: 0, dx: 1, dy: 0 }, { color: null, a: 0, dx: -0.5, dy: -1 }];
  const CAT_O = { x: 0, y: 0, size: 0, facing: 1, light: 0, tint: null, tintAmt: 0, rim: CAT_RIM, glow: 0, shadow: 0, alpha: 0 };
  function catSeat() {
    const L = LAND.seat, u = 0.7;
    CATP.x = L.x0 + (L.x1 - L.x0) * u;
    CATP.y = L.y - L.r * (1 - 0.08 * u) + 0.003 * H;   // on top of the trunk (it tapers 1 -> 0.92 r), paws sunk in a touch
    CATP.size = 0.13 * H;
  }
  // the seat at night: its top edge and the sawn end turned to the fire catch the light, the rest is dark
  function drawSeatNight(ctx, a) {
    if (a <= 0.003) return;
    const L = LAND.seat, rr = L.r, col = U.safe(C.rim);
    const g = ctx.createLinearGradient(L.x0, 0, L.x1 + rr * 0.3, 0);
    g.addColorStop(0, U.rgba(col, 0)); g.addColorStop(0.55, U.rgba(col, 0.25 * a)); g.addColorStop(1, U.rgba(col, 0.75 * a));
    ctx.strokeStyle = g; ctx.lineCap = "round"; ctx.lineWidth = 1.6 * S;
    ctx.beginPath(); ctx.moveTo(L.x0 + rr * 0.3, L.y - rr); ctx.lineTo(L.x1, L.y - rr * 0.92);
    ctx.ellipse(L.x1, L.y + rr * 0.04, rr * 0.36, rr * 0.96, 0, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.globalAlpha = 0.2 * a; ctx.fillStyle = U.rgba(U.safe(C.coalDim), 1);
    ctx.beginPath(); ctx.ellipse(L.x1, L.y + rr * 0.04, rr * 0.34, rr * 0.9, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.45 * a; ctx.strokeStyle = U.rgba(col, 1); ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.ellipse(L.x1, L.y + rr * 0.04, rr * 0.2, rr * 0.54, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ heartbeat bookkeeping
  const HMAX = 8;
  const HPOP = new Float32Array(HMAX);
  const hostPos = (i, n) => {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const x = n === 1 ? 30 : U.lerp(-46, 46, u) + (hash(i + 3) - 0.5) * 6;
    return x;
  };

  // ------------------------------------------------------------------ theme
  AW.registerTheme({
    id: "campfire",
    name: "Campfire",
    init(ctx, env) {
      dpr = env.dpr || 1; W = env.width; H = env.height; build();
      if (AW.cat) cat = AW.cat.create(31);
      SND.armed = false; SND.settle = SND.strike = 0; SND.owlAt = SND.dripAt = -1;
    },
    resize(env) { dpr = env.dpr || 1; W = env.width; H = env.height; build(); },
    destroy() { sprites.clear(); glows.clear(); built = ""; clk = null; clkKey = ""; stoneL = null; FL = FB = SM = null; landB = landC = snowB = dappleB = cloudS = null; landKey = -1; },

    // The shared info overlay in the theme's hand: the cold notebook (light sans, moonlit cyan, mono-caps
    // labels, hairline rules) by day; by the fire, warm old serif in ember and amber. The palettes swap
    // over a short window around the middle of the exhale (the midpoint of cyan and amber is a muddy grey).
    overlayStyle(f) {
      const b = U.clamp(f.blend || 0), w = U.smoothstep(0.4, 0.6, b);
      const m = (a, c) => U.safe(U.mix(a, c, w));
      return {
        font: b < 0.5 ? SANS : SERIF,
        ink: m(C.moon, C.amber),
        dim: m(C.coldDim, C.ovDim),
        accent: m(C.frost, C.coalHot),
        alarm: m(C.alarm, C.hostDown),
        glow: U.lerp(0.3, 0.55, w),
        rule: "hairline",
        caps: b < 0.5,
      };
    },

    // The clearing as sound: the fire (its burn-down, left by render()), rain from the real weather (eased
    // between conditions with the picture), the wind and the forest's rustle with it, crickets on warm nights,
    // birds by day. Rare sound-only events: an owl at night, by day a drip off the kettle's spout.
    // Core's master level does the work / ambient mix; this only describes the world.
    soundscape(f) {
      const w = (f.signals && f.signals.weather) || {};
      const day = U.clamp(f.day || 0), T = num(w.tempC, 12), wind = num(+w.windKph, 5);
      const rain = U.clamp(WXP[3] * (0.2 + 0.8 * WXI[3]) + WXP[4] * (0.75 + 0.25 * WXI[4]));
      const wet = U.clamp(rain * 1.2), snow = WXP[5], storm = WXP[4];
      LV.fire = SND.fire;
      LV.rain = rain;
      LV.wind = U.clamp(0.8 * U.smoothstep(10, 60, wind) + 0.15 * storm);
      LV.forest = (0.14 + 0.46 * U.smoothstep(6, 40, wind)) * (1 - 0.5 * snow) * (1 - 0.3 * wet);
      LV.crickets = 0.5 * (1 - day) * U.smoothstep(5, 15, T) * (1 - wet) * (1 - snow);
      LV.birds = 0.45 * day * (0.55 + 0.45 * U.smoothstep(0, 10, T)) * (1 - 0.85 * wet) * (1 - 0.5 * U.smoothstep(25, 50, wind));
      const t = num(f.t, 0), amb = (f.blend || 0) > 0.9;
      // an owl, rarely, somewhere off in the dark trees (not in a downpour or a storm)
      if (amb && day < 0.08 && rain < 0.45 && storm < 0.2) {
        if (SND.owlAt < 0) SND.owlAt = t + 40 + Math.random() * 200;
        else if (t >= SND.owlAt) {
          SND.owlAt = t + 300 + Math.random() * 540;
          cue("owl", { gain: 0.85, distance: 0.5 + 0.4 * Math.random(), pan: (Math.random() < 0.5 ? -1 : 1) * (0.35 + 0.5 * Math.random()) });
        }
      } else SND.owlAt = -1;
      // by day the kettle by the fire drips now and then
      if (amb && day > 0.6 && rain < 0.05) {
        if (SND.dripAt < 0) SND.dripAt = t + 15 + Math.random() * 45;
        else if (t >= SND.dripAt) { SND.dripAt = t + 35 + Math.random() * 70; cue("drip", { gain: 0.3, distance: 0.35, pan: 0.55 }); }
      } else SND.dripAt = -1;
      return LV;
    },

    render(ctx, f) {
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.width, f.height);
      if (f.width !== W || f.height !== H || (f.dpr || 1) !== dpr || !built) {
        dpr = f.dpr || 1; W = f.width; H = f.height; build();
      }
      const b = U.clamp(f.blend), t = f.t, now = f.now, Sg = f.signals || {};
      const dt = Math.min(0.05, f.dt || 0.016);
      const amb = f.mode === "ambient";
      const workA = 1 - U.smoothstep(0, 0.55, b);
      const ambA = U.smoothstep(0.25, 1, b);
      const sink = b * 0.03 * H; // info drifts as it fades
      CATA = f.cat ? U.clamp(+f.cat.a || 0) : 0;   // the cat is about (the jay keeps away)
      // the shared info overlay is up: the notebook and the whispers step back (the fire does not)
      const od = f.overlay ? 1 - 0.7 * U.clamp(+f.overlay.a || 0) : 1;
      const dl = Sg.daylight;
      // the real weather, eased between conditions (null = clear)
      const wx = Sg.weather;
      updateWeather(wx, Math.min(0.1, f.dt || 0.016), t);
      const wet = wx && (wx.condition === "rain" || wx.condition === "storm");

      // ---------------------------------------------------- daylight
      // day: the light out there (frame.day). dS: how much of the day scene is up (ambient: all of it; behind
      // the work notebook a faint 0.18 of it, so the exhale brings the scene forward). 0 at night.
      const day = U.clamp(f.day || 0);
      const sEl = sunElev(dl, day);
      const dS = day * U.lerp(0.18, 1, U.smoothstep(0.1, 0.9, b));
      const dAmb = day * ambA;                          // the ambient day look (props, jay, banked fire)
      // how much light falls on the things in the clearing: less under cloud and rain, less as the sun sinks
      const dLit = dS > 0 ? dS * U.clamp(1 - 0.3 * WXP[1] * U.smoothstep(0.3, 0.95, WXI[1]) - 0.4 * WXP[3] - 0.55 * WXP[4] - 0.2 * WXP[2]
        - 0.45 * (1 - U.smoothstep(-5, 10, sEl))) : 0;
      let sunU = 0.45;
      if (dl && dl.sunrise && dl.sunset && Math.abs(dl.light - day) < 0.002) sunU = (now - dl.sunrise) / (dl.sunset - dl.sunrise);

      // ---------------------------------------------------- the fire's state
      // Shape over the evening is a pure function of ambientElapsed (reload at 22:30 = same fire);
      // only the fast flicker, sparks and smoke curls come from real time.
      // A long ambient stretch (a weekend, a night into the next morning) has no single "evening": then the
      // fire's evening runs from its relight in the late afternoon (100 min before sunset), eased in so it never jumps.
      let e = Math.max(0, f.ambientElapsed || 0);
      if (e > 36000 && dl && dl.sunset) {
        let sr = (now.getTime() - (dl.sunset.getTime() - 6000000)) / 1000;
        if (sr < 0) sr += 86400;
        e = U.lerp(e, sr, U.smoothstep(36000, 50400, e));
      }
      const hr = e / 3600;
      // lighting it (the exhale) vs. letting it collapse to ash (back to work: fast)
      const lit = amb ? U.smoothstep(0.36, 0.92, b) : U.smoothstep(0.7, 0.98, b);
      const ign = amb ? U.smoothstep(0.34, 0.8, b) : 1;
      const bedLit = amb ? U.smoothstep(0.5, 1, b) : U.smoothstep(0.42, 0.92, b);
      const grow = U.smoothstep(0, 420, e);
      // by day the fire is banked: a bed of coals under ash, a lick of flame, a thin smoke. It is relit in the
      // late afternoon and, as the sun goes down (12 deg -> 2 deg), grows into the evening fire.
      const dF = day > 0 ? U.smoothstep(2, 11, sEl) * U.smoothstep(0, 0.35, day) : 0;
      const settle = settleBump(e) * (1 - dF);
      const breath = 1 + 0.09 * U.noise1(e / 240 + 3.3);
      const flameFuel = Math.pow(1 - U.smoothstep(0.35, 5.6, hr), 0.8);   // lively -> settling -> gone by ~5.5 h
      const residual = 0.075 * (1 - U.smoothstep(6.5, 9.5, hr));          // little flames on the coals
      // rain and snow hold the fire down a little; a storm makes it struggle
      const damp = 1 - 0.22 * U.clamp(WX.rain) - 0.12 * WX.storm - 0.07 * WX.snow;
      let flame = lit * Math.max(flameFuel * (0.55 + 0.45 * grow) * breath * (1 + 0.25 * settle), residual) * damp;
      if (dF > 0) flame = U.lerp(flame, lit * (0.055 + 0.02 * U.noise1(t * 0.13 + 2)) * damp, dF);
      const fl = 1 + 0.07 * U.noise1(t * 2.3) + 0.05 * U.noise1(t * 5.7 + 3) + 0.08 * U.noise1(t * 0.35 + 7)
        + 0.1 * WX.storm * U.noise1(t * 3.1 + 11);
      let bed = bedLit * (0.4 + 0.6 * U.smoothstep(0, 3000, e)) * (1 - 0.6 * U.smoothstep(4.5, 10, hr)) * (1 - 0.15 * U.clamp(WX.rain));
      if (dF > 0) bed = U.lerp(bed, bedLit * 0.3 * (1 - 0.15 * U.clamp(WX.rain)), dF);
      const light = flame * fl + 0.22 * bed;
      // sound: the fire's voice follows the burn-down (full ~0.85 early, ~0.2 as coals, a banked ~0.15 by day);
      // a log settling is a pop (the deterministic settle schedule, once per rising edge)
      {
        const fz = U.clamp(flame);
        let fs = 0.85 * Math.pow(fz, 0.9) + 0.2 * U.clamp(bed) * (1 - fz);
        if (dF > 0) fs = U.lerp(fs, 0.15 * Math.max(lit, bedLit), dF);
        SND.fire = U.clamp(fs);
        if (SND.armed && settle > 0.3 && SND.settle <= 0.3 && lit > 0.5) cue("pop", { gain: 1.3, distance: 0.12, pan: (Math.random() - 0.5) * 0.6 });
        SND.settle = settle; SND.armed = true;
      }
      // logs: geometry follows the evening; back in work it re-lays itself once the fire is out
      const eG = amb ? e : e * U.smoothstep(0.05, 0.45, b);
      let fuel = 1 - U.smoothstep(0.3, 6.2, eG / 3600);
      if (dF > 0) fuel = U.lerp(fuel, 0.42, dF * U.smoothstep(0.05, 0.45, b));
      const coldA = fade(b, 0.3, 0.8);

      // fire placement: a small lay in the notebook, close and large in the evening
      const gk = U.smoothstep(0.15, 0.9, b);
      const pull = U.smoothstep(0.25, 0.85, day);   // by day the view pulls back to show the clearing
      const FS = H * U.lerp(0.2, U.lerp(0.3, 0.25, pull), gk), cx = 0.5 * W, gy = H * U.lerp(0.825, U.lerp(0.83, 0.808, pull), gk);
      const k = FS / 100, inv = 1 / k;
      // where the firelight reaches (drops and flakes show only there) and where the heat melts snow
      {
        const fc = U.clamp(flame);
        LX = cx; LY = gy - (20 + 40 * fc) * k; LR = (110 + 250 * fc + 50 * bed) * k; LRY = LR * 0.85;
        LK = ambA * (0.35 + 0.65 * U.clamp(light));
        HX = cx; HY = gy - (25 + 45 * fc) * k; HRX = (60 + 100 * fc + 30 * bed) * k; HRY = (50 + 150 * fc + 20 * bed) * k;
      }
      // wind leans the flames; rain makes them ragged
      fwLean = Math.min(0.36, WX.lean * 0.34); fwWet = U.clamp(WX.rain * 1.1);

      // ---------------------------------------------------- the day sky: gradient, sun, clouds (behind all)
      const sunK = dS > 0.004 ? drawDaySky(ctx, dt, dS, sEl, sunU, U.smoothstep(0.2, 0.8, b)) : 0;

      // ---------------------------------------------------- sky (ambient): faint tint + few stars
      if (ambA > 0.005) {
        const elev = dl ? dl.elevation : -30;
        const dusk = U.smoothstep(-12, -1, elev) * (1 - U.smoothstep(4, 12, elev));
        const night = 1 - U.smoothstep(-16, -6, elev);
        const day = dl ? dl.light : 0;
        glow(ctx, C.dayBlue, 0.5 * W, -0.2 * H, 0.75 * W, 0.55 * H, ambA * 0.06 * day * (1 - dusk), true);
        if (dusk > 0.01) {
          glow(ctx, C.duskRose, 0.5 * W, -0.22 * H, 0.8 * W, 0.55 * H, ambA * 0.09 * dusk, true);
          glow(ctx, C.duskEmber, 0.5 * W, -0.26 * H, 0.5 * W, 0.4 * H, ambA * 0.07 * dusk * U.smoothstep(-8, 0, elev), true);
        }
        glow(ctx, C.nightBlue, 0.5 * W, -0.15 * H, 0.85 * W, 0.55 * H, ambA * 0.07 * night, true);
        // cloud, fog, rain and snow put the stars out
        const starA = ambA * U.smoothstep(-3, -12, elev) * (0.85 - 0.25 * U.clamp(light)) * (1 - WX.cover);
        if (starA > 0.01) { ctx.globalAlpha = starA; ctx.drawImage(starsL.cv, 0, 0, W, H * 0.55); ctx.globalAlpha = 1; }
        drawLightning(ctx, t, ambA, 0.3 * H * U.smoothstep(0.2, 0.8, day));
        // fog: a dim haze ring catching the firelight, and a cold murk lying on the ground
        if (WX.fog > 0.01) {
          const fc = U.clamp(flame), lt = U.clamp(light);
          ring(ctx, C.fogWarm, cx, gy - (40 + 50 * fc) * k, (250 + 160 * fc) * k, (150 + 130 * fc) * k, ambA * WX.fog * (0.025 + 0.065 * lt));
          glow(ctx, C.fogCool, cx, gy - 0.08 * H, 0.75 * W, 0.3 * H, ambA * WX.fog * 0.06, true);
        }
      }

      // ---------------------------------------------------- the day land: forest edge, clearing, seat, kettle
      if (dS > 0.004) drawDayLand(ctx, t, dS, dAmb, sEl, sunK, now);

      // ---------------------------------------------------- smoke (behind the fire and the clock)
      // calm: it rises straight; wind bends it over; a lid of cloud flattens it; fog swallows its top
      smWander = 0.35 + 0.65 * U.clamp(WX.wind * 1.8) + 0.2 * WX.cloudy;
      smDrift = WX.lean * 0.24 * W;
      smFlat = U.clamp(0.75 * WX.cloudy + 0.25 * WX.fog + 0.3 * WX.rain);
      smLow = U.clamp(0.12 * WX.cloudy + 0.3 * WX.wind + 0.35 * WX.fog + 0.1 * WX.rain, 0, 0.6);
      let smokeA = Math.max(lit, bedLit * 0.8) * (0.4 + 0.45 * U.smoothstep(1.5, 5, hr)) * ambA * (1 + 0.35 * U.clamp(WX.rain)) * (1 - 0.35 * WX.fog);
      // by day: one thin column, pale in the sun
      if (dF > 0) smokeA = U.lerp(smokeA, Math.max(lit, bedLit * 0.8) * ambA * 0.55 * (1 - 0.4 * WX.fog), dF);
      const smq = Math.round(U.smoothstep(0, 0.6, dAmb) * 16);
      if (smokeA > 0.01) {
        smokeGrad = smokeGradFor(smq);
        paintSmoke(t, cx, gy - 18 * k, k, U.clamp(flame));
        ctx.globalAlpha = U.clamp(smokeA);
        ctx.drawImage(SM.cv, SM_X0, 0, SM_W, SM_H);
        ctx.globalAlpha = 1;
      }

      // ---------------------------------------------------- the cat on the log seat, facing the fire
      // (behind the fire's plane, before the sparks, the rain and the fog). Lit by the fire at night: a warm
      // rim on the fire side that flickers with it, a cool edge of starlight, eyeshine; by day by the sun.
      if (cat) {
        catSeat();
        const fireLit = U.clamp(0.25 + 0.7 * U.clamp(flame) * fl + 0.25 * bed);
        const nightK = (1 - day) * ambA;
        drawSeatNight(ctx, CATA * nightK * (0.35 + 0.65 * fireLit));
        const sz = CATP.size, x = CATP.x, y = CATP.y, my = y - 0.5 * sz;
        const sunLit = dS > 0.004 ? dLit / dS : 0;   // how much sun reaches the clearing (cloud, rain, a low sun)
        const fireR = CAT_RIM[0], skyR = CAT_RIM[1];
        // the fire: from the flames' heart, its colour and strength flickering with them; by day it hardly shows
        fireR.dx = cx - x; fireR.dy = (gy - (25 + 45 * U.clamp(flame)) * k) - my;
        fireR.color = U.mix(C.fInner, C.fCore, U.clamp(0.5 + 0.5 * U.noise1(t * 3.1 + 5)) * fireLit);
        fireR.a = (0.4 + 0.55 * fireLit) * U.clamp(fl, 0.75, 1.25) * (1 - 0.8 * day);
        // night: a cool edge of starlight from above; by day the sun from where it is in the sky
        if (day > 0.01) {
          skyR.dx = SUNP.x - x; skyR.dy = Math.min(-0.3 * Math.abs(SUNP.x - x), SUNP.y - my);
          skyR.color = U.mix(C.star, SUNC[0].r > 0 ? SUNC[0] : C.amber, day);
          skyR.a = U.lerp(0.22 * (1 - 0.6 * WX.cover), 0.5 * sunK * sunLit, day);
        } else {
          skyR.dx = -0.5; skyR.dy = -1; skyR.color = C.star; skyR.a = 0.22 * (1 - 0.6 * WX.cover);
        }
        const o = CAT_O;
        o.x = x; o.y = y; o.size = sz; o.facing = 1;
        o.pose = AW.cat.autoPose(f);
        o.light = U.lerp(0.2 + 0.14 * fireLit * fl, 0.45 + 0.22 * sunLit, day);
        o.tint = U.mix(C.fCore, sunK > 0.01 && SUNC[0].r > 0 ? SUNC[0] : C.ash, 0.8 * U.smoothstep(0.2, 0.8, day));
        o.tintAmt = U.lerp(0.6, 0.18, day);
        o.glow = 0.6 * (1 - day) * (0.5 + 0.5 * fireLit);
        o.shadow = 0.9 * day * sunLit;
        o.alpha = ambA;   // the ambient face only: behind the work notebook it would sit among the text
        cat.draw(ctx, f, o);
      }

      // ---------------------------------------------------- the fire group (local units)
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * cx, dpr * gy);
      // light pool on the ground and a halo behind the flames: very dim, shrinking with the fire
      if (light > 0.005) {
        const pr = 110 + 120 * U.clamp(flame);
        const sunOut = 1 - 0.75 * dAmb;   // in daylight the fire lights nothing around it
        glow(ctx, C.pool, 0, 8, pr * 1.25, pr * 0.3, Math.min(0.12, 0.09 * flame * fl + 0.05 * bed) * sunOut, true);
        glow(ctx, C.halo, 0, -45 * U.clamp(flame) - 10, 95 + 55 * U.clamp(flame), 80 + 90 * U.clamp(flame), Math.min(0.09, 0.08 * flame * fl + 0.025 * bed) * sunOut, true);
      }
      const stoneWarm = U.clamp(light * 0.9) * U.smoothstep(0.3, 0.9, b);
      // snow: a pale ring of settled snow on the ground outside the heat, a dusting on the cooler stones
      const snowA = ambA * WX.dust;
      if (snowA > 0.01) ring(ctx, C.snow, 0, 14, 330, 62, snowA * 0.07);
      // by day: the ring's shadow on the earth, then the stones in daylight
      if (dS > 0.004 && sunK > 0.01) {
        const sl = U.clamp(0.6 / Math.tan(Math.max(4, sEl) * Math.PI / 180), 0.4, 3.5), sd = U.clamp((SUNP.x - cx) / (0.4 * W), -1, 1);
        glow(ctx, DC.shadow, -sd * sl * 14, 20 + sl * 3, 150 + sl * 10, 38, 0.3 * dS * sunK, true);
      }
      drawStones(ctx, "back", coldA, stoneWarm, snowA, dLit);

      // the bed: grey-blue ash cold, coals when lit (the back part, behind the front log)
      const drawBed = (front) => {
        for (let i = 0; i < CN; i++) {
          if (CFRONT[i] !== front) continue;
          const x = CX[i], y = CY[i], r = CR[i];
          if (coldA > 0.01) {
            ctx.globalAlpha = coldA * 0.45; ctx.fillStyle = ASH_CSS;
            ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, TAU); ctx.fill();
          }
          if (bed > 0.01) {
            const hb = bed * CHOT[i] * (0.6 + 0.4 * (0.5 + 0.5 * U.noise1(t * 0.22 + CP[i])));
            if (hb > 0.25) glow(ctx, C.coalWarm, x, y, r * 4.5, r * 3, hb * 0.32, true);
            // a dark crust, the glowing heart showing through, and on some a grey skin of ash
            ctx.globalAlpha = U.clamp(bed * 0.75); ctx.fillStyle = "#120504";
            ctx.beginPath(); ctx.ellipse(x, y, r * 1.05, r * CASP[i] * 1.1, CROT[i], 0, TAU); ctx.fill();
            ctx.globalAlpha = U.clamp(0.3 + 0.7 * hb);
            ctx.fillStyle = COAL_R[Math.min(RN, Math.round(hb * RN))];
            ctx.beginPath(); ctx.ellipse(x, y, r * 0.86, r * CASP[i] * 0.86, CROT[i], 0, TAU); ctx.fill();
            if (i % 3 === 0) {
              ctx.globalAlpha = 0.5 * bedLit; ctx.fillStyle = ASH_WARM;
              ctx.beginPath(); ctx.ellipse(x + r * 0.35, y - r * 0.15, r * 0.5, r * CASP[i] * 0.45, CROT[i], 0, TAU); ctx.fill();
            }
          }
        }
        ctx.globalAlpha = 1;
      };
      // by day the bed is a mound of grey ash with the coals banked under it
      if (dS > 0.004) {
        glow(ctx, DC.ashDark, 0, 7, 112, 24, 0.85 * dS, true);
        glow(ctx, DC.ash, 2, 4, 86, 15, 0.8 * dLit, true);
      }
      // the bed as one glowing mass under the separate coals
      if (bed > 0.01) glow(ctx, C.coalWarm, 0, 5, 100, 18, 0.34 * bed * (0.92 + 0.08 * fl), true);
      drawBed(0);
      rimK = U.clamp(0.04 + flame * 1.6);

      // logs behind the flames
      logDay = dLit * 0.95;
      const logHeat = lit * U.clamp(0.25 + 0.55 * flame * fl + 0.4 * bed) + (1 - lit) * bedLit * 0.3 * bed;
      for (let li = 0; li < 3; li++) drawLog(ctx, li, fuel, logHeat, coldA, t, inv);

      // flames: painted small, upscaled with a soft bloom underneath
      if (flame > 0.004) {
        paintFlames(flame, ign, t);
        ctx.globalAlpha = 0.7;
        ctx.drawImage(FB.cv, FL_X0 - 10, FL_Y0 - 14, FL_W + 20, FL_H + 14);
        ctx.globalAlpha = 0.95;
        ctx.drawImage(FLB.cv, FL_X0, FL_Y0, FL_W, FL_H);
        ctx.globalAlpha = 0.3;  // a touch of the crisp tongues for definition
        ctx.drawImage(FL.cv, FL_X0, FL_Y0, FL_W, FL_H);
        ctx.globalAlpha = 1;
      }
      // the strike: a small amber point flares in the kindling and catches
      if (amb && b > 0.2 && b < 0.62) {
        const m = U.smoothstep(0.24, 0.3, b) * (1 - U.smoothstep(0.44, 0.6, b));
        const mf = 0.8 + 0.2 * U.noise1(t * 9);
        const md = 1 - 0.7 * dF;   // by day the lay is banked rather than struck
        glow(ctx, C.fInner, -4, -10, 26, 26, m * 0.45 * mf * md, true);
        glow(ctx, C.fCore, -4, -10, 9, 9, m * 0.9 * mf * md);
        if (m > 0.3) { spAcc += dt * 14 * m; }
        // the catch: one crackling pop as the kindling takes (the fire layer swells in behind it)
        if (m > 0.3 && SND.strike <= 0.3) cue("pop", { gain: 0.9 * md, distance: 0.1, pan: -0.05 });
        SND.strike = m;
      } else SND.strike = 0;

      // front log
      drawLog(ctx, 3, fuel, logHeat * 0.9, coldA, t, inv);
      drawBed(1);

      // heartbeat: hosts are particular coals in the bed
      const hb = Array.isArray(Sg.heartbeat) ? Sg.heartbeat : [];
      const hn = Math.min(HMAX, hb.length);
      const hostScreen = [];
      for (let i = 0; i < hn; i++) {
        const h = hb[i], down = !h.up;
        const x = hostPos(i, hn), y = 15 + (hash(i + 11) - 0.5) * 3;
        hostScreen.push(cx + x * k, gy + y * k);
        const br = 0.5 + 0.5 * Math.sin(t * TAU / 6.5 + i * 2.3);
        if (!down) {
          // work: a small cold ring in the ash, barely breathing
          if (coldA > 0.01) {
            const cc = U.safe(C.cold);
            ctx.globalAlpha = coldA * (0.55 + 0.2 * br); ctx.strokeStyle = U.rgba(cc, 1); ctx.lineWidth = 1.2 * S * inv;
            ctx.beginPath(); ctx.arc(x, y, 4.2, 0, TAU); ctx.stroke();
            ctx.globalAlpha = coldA * 0.8; ctx.fillStyle = U.rgba(cc, 1);
            ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
          }
          // ambient: a coal that breathes calmly
          const ha = Math.max(bedLit, 0) * ambA;
          if (ha > 0.01) {
            glow(ctx, C.host, x, y, 11, 8, ha * (0.28 + 0.22 * br), true);
            ctx.globalAlpha = ha * (0.6 + 0.3 * br);
            ctx.fillStyle = COAL_R[Math.round(RN * (0.7 + 0.3 * br))];
            ctx.beginPath(); ctx.ellipse(x, y, 3.2, 2.1, 0, 0, TAU); ctx.fill();
          }
        } else {
          // down: the coal flares and pops, red-orange; in work it is the one loud thing
          const per = U.lerp(1.8, 3.2, b);
          const ph = (t % per) / per, pulse = 0.5 + 0.5 * Math.sin(t * TAU / per);
          const big = U.lerp(1.5, 1.35, b);
          glow(ctx, C.hostDown, x, y, 30 * big, 22 * big, U.lerp(0.55, 0.5, b) * (0.45 + 0.55 * pulse), true);
          glow(ctx, C.flare, x, y, 12, 9, U.lerp(0.8, 0.75, b) * (0.6 + 0.4 * pulse));
          const pop = (1 - ph) * (1 - ph) * (1 - ph);  // the pop: a sharp flash at the top of each cycle
          glow(ctx, C.hostDown, x, y, 22, 16, 0.75 * pop, true);
          ctx.globalAlpha = U.lerp(0.75, 0.6, b) * (1 - ph) * (1 - ph);
          ctx.strokeStyle = U.rgba(U.safe(C.hostDown), 1); ctx.lineWidth = 1.5 * S * inv;
          ctx.beginPath(); ctx.ellipse(x, y, 5 + ph * 26, (5 + ph * 26) * 0.62, 0, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 0.85 + 0.15 * pulse;
          ctx.fillStyle = U.rgba(U.safe(U.mix(C.hostDown, C.flare, pulse * 0.5)), 1);
          ctx.beginPath(); ctx.ellipse(x, y, 3.6, 2.4, 0, 0, TAU); ctx.fill();
          // pops: a burst of sparks each cycle, plus a thin trickle
          if (HPOP[i] > ph + 0.5) {
            cue("pop", { gain: 0.6, distance: 0.15, pan: U.clamp(x * k / (0.5 * W), -1, 1) });
            const n = 5 + ((t * 7) | 0) % 3;
            for (let s = 0; s < n; s++) spark(cx + x * k, gy + (y - 2) * k, (srng() - 0.5) * 120 * S, -(110 + srng() * 160) * S, 0.9 + srng() * 1.4, (1.3 + srng()) * S, 1);
          }
          HPOP[i] = ph;
          if (srng() < dt * 3) spark(cx + x * k, gy + (y - 2) * k, (srng() - 0.5) * 40 * S, -(80 + srng() * 90) * S, 1 + srng() * 1.2, (1 + srng()) * S, 1);
        }
        ctx.globalAlpha = 1;
      }

      drawStones(ctx, "front", coldA, stoneWarm, snowA, dLit);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;

      // ---------------------------------------------------- sparks (screen space)
      {
        // rain quenches the sparks (fewer, shorter-lived); wind carries them off
        const rate = (26 * U.clamp(flame) * fl + 1.2 * bed * (amb ? 1 : 0) + 70 * settle * lit) * (1 - 0.65 * U.clamp(WX.rain * 1.2)) * (1 - 0.25 * WX.snow);
        spAcc += rate * dt;
        const spreadU = 50 * (0.5 + 0.5 * U.clamp(flame));
        const fh = 185 * Math.pow(U.clamp(flame), 0.75);
        let guard = 0;
        while (spAcc >= 1 && guard++ < 12) {
          spAcc -= 1;
          const lx = (srng() - 0.5) * 2 * spreadU, ly = -12 - srng() * fh * 0.55;
          const up = (70 + srng() * 170) * S * (0.6 + 0.4 * U.clamp(flame));
          spark(cx + lx * k, gy + ly * k, (srng() - 0.5) * 50 * S, -up, 1.1 + srng() * 2.3, (1.1 + srng() * 1.4) * S, 0);
        }
        if (spAcc > 4) spAcc = 0;
        drawSparks(ctx, dt, t, WX.lean * 150 * S, 2.5 * U.clamp(WX.rain));
      }

      // ---------------------------------------------------- weather in the firelight (ambient)
      if (ambA > 0.01) {
        if (WX.rain > 0.004) drawRain(ctx, dt, ambA, cx, gy, k, U.clamp(bed + flame), dAmb);
        if (WX.snow > 0.004) drawSnow(ctx, dt, t, ambA, gy, k, dAmb);
        // fog in front of the fire: a faint veil low on the ground
        if (WX.fog > 0.01) glow(ctx, C.fogCool, cx, gy + 0.02 * H, 0.6 * W, 0.12 * H, ambA * WX.fog * 0.07, true);
      }
      // by day the fog is milky: thick over the far trees, thinner toward the viewer
      if (dS > 0.004 && WX.fog > 0.01) drawDayFog(ctx, dS * WX.fog);

      // ---------------------------------------------------- work: the field notebook
      const cold = U.safe(C.cold), cdim = U.safe(C.coldDim);
      // daylight: the sun's arc, light left (top centre, drifts up as it fades)
      const dA = fade(b, 0.0, 0.4) * od;
      if (dl && dA > 0.004) {
        const y = 0.135 * H - sink * 0.8, x0 = 0.5 * W - 0.15 * W, x1 = 0.5 * W + 0.15 * W, span = x1 - x0;
        const arcH = 0.06 * H;
        ctx.lineCap = "round";
        ctx.globalAlpha = dA * 0.5; ctx.strokeStyle = U.rgba(cdim, 1); ctx.lineWidth = 1.1 * S;
        ctx.beginPath(); ctx.moveTo(x0 - 0.02 * W, y); ctx.lineTo(x1 + 0.02 * W, y); ctx.stroke();
        let u = null;
        if (dl.sunrise && dl.sunset) u = (now - dl.sunrise) / (dl.sunset - dl.sunrise);
        const P = (v) => y - arcH * Math.sin(Math.PI * U.clamp(v));
        if (u != null) {
          const uc = U.clamp(u);
          // remaining path: dotted
          DASH[0] = 1.5 * S; DASH[1] = 6 * S; ctx.setLineDash(DASH);
          ctx.globalAlpha = dA * 0.55; ctx.strokeStyle = U.rgba(cdim, 1); ctx.lineWidth = 1.3 * S;
          ctx.beginPath();
          for (let j = 0; j <= 40; j++) { const v = uc + (1 - uc) * j / 40; j ? ctx.lineTo(x0 + span * v, P(v)) : ctx.moveTo(x0 + span * v, P(v)); }
          ctx.stroke(); ctx.setLineDash(NODASH);
          // travelled: solid
          if (uc > 0) {
            ctx.globalAlpha = dA * 0.75; ctx.strokeStyle = U.rgba(cold, 1); ctx.lineWidth = 1.4 * S;
            ctx.beginPath();
            for (let j = 0; j <= 40; j++) { const v = uc * j / 40; j ? ctx.lineTo(x0 + span * v, P(v)) : ctx.moveTo(x0, P(0)); }
            ctx.stroke();
          }
          if (u >= 0 && u <= 1) {
            const sx = x0 + span * u, sy = P(u);
            glow(ctx, C.moon, sx, sy, 0.03 * H, 0.03 * H, dA * 0.4);
            ctx.globalAlpha = dA * 0.95; ctx.fillStyle = U.rgba(U.safe(C.moon), 1);
            ctx.beginPath(); ctx.arc(sx, sy, 4 * S, 0, TAU); ctx.fill();
          } else {
            ctx.globalAlpha = dA * 0.6; ctx.strokeStyle = U.rgba(cold, 1); ctx.lineWidth = 1.2 * S;
            ctx.beginPath(); ctx.arc(u > 1 ? x1 : x0, y + 7 * S, 3.5 * S, 0, TAU); ctx.stroke();
          }
          const lp = Math.max(12, 0.018 * H);
          text(ctx, U.fmtTime(dl.sunrise), x0, y + 0.026 * H, { px: lp, font: "mono", color: C.coldDim, glow: 2, core: 0.95 }, "center", dA * 0.9);
          text(ctx, U.fmtTime(dl.sunset), x1, y + 0.026 * H, { px: lp, font: "mono", color: C.coldDim, glow: 2, core: 0.95 }, "center", dA * 0.9);
        }
        let big = null;
        if (dl.isDay && dl.lightLeftMin != null) big = `${U.fmtMinutes(dl.lightLeftMin)} of light left`;
        else if (dl.sunrise) {
          let rise = dl.sunrise.getTime(); if (rise < now.getTime()) rise += 86400000;
          big = `first light in ${U.fmtMinutes((rise - now.getTime()) / 60000)}`;
        }
        if (big) text(ctx, big, 0.5 * W, y + 0.06 * H, { px: 0.03 * H, weight: 300, color: C.cold, glow: 5, core: 0.92 }, "center", dA * 0.95);
      }

      // date + place under the clock
      const dateA = fade(b, 0.05, 0.45) * od;
      if (dateA > 0.004) {
        const s = `${DAYS[now.getDay()]}  ${now.getDate()} ${MONTHS[now.getMonth()]}` + (AW.config.location && AW.config.location.name ? `  ·  ${AW.config.location.name.toUpperCase()}` : "");
        text(ctx, s, 0.5 * W, 0.535 * H + sink, { px: 0.021 * H, font: "mono", spacing: 0.22, color: C.coldDim, glow: 3, core: 0.95 }, "center", dateA * 0.95);
      }

      // calendar (left): the next entry, with a fuse that shortens as it nears
      const next = Sg.calendar && Sg.calendar.next;
      const lx = 0.07 * W;
      const calA = fade(b, 0.06, 0.48) * od;
      if (next && calA > 0.004) {
        const mins = next.minutesUntil, soon = U.smoothstep(20, 5, mins);
        const y = 0.705 * H + sink;
        text(ctx, `NEXT  ·  ${String(next.title).toUpperCase()}`, lx, y, { px: 0.021 * H, font: "mono", spacing: 0.2, color: C.coldDim, glow: 3, core: 0.95 }, "left", calA);
        text(ctx, mins < 1 ? "now" : `in ${U.fmtMinutes(mins)}`, lx, y + 0.056 * H,
          { px: 0.05 * H, weight: 300, color: soon > 0.5 ? C.frost : C.cold, glow: soon > 0.5 ? 9 : 6, core: 0.92 }, "left", calA);
        const len = 0.15 * W * U.clamp(mins / 60, 0.05, 1);
        const fc = U.safe(soon > 0.5 ? C.frost : C.coldDim);
        ctx.globalAlpha = calA * 0.6; ctx.strokeStyle = U.rgba(fc, 1); ctx.lineWidth = 1.1 * S;
        ctx.beginPath(); ctx.moveTo(lx, y + 0.098 * H); ctx.lineTo(lx + len, y + 0.098 * H); ctx.stroke();
        ctx.globalAlpha = calA * 0.9; ctx.fillStyle = U.rgba(fc, 1);
        ctx.beginPath(); ctx.arc(lx + len, y + 0.098 * H, 2.2 * S, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // weather sliver (left, under the calendar)
      const wxA = fade(b, 0.1, 0.5) * od;
      if (wx && wx.actionable && wxA > 0.004) {
        const y = (next ? 0.86 : 0.72) * H + sink;
        let gx = lx;
        if (wet) {
          ctx.globalAlpha = wxA * 0.7; ctx.strokeStyle = U.rgba(cold, 1); ctx.lineWidth = 1.3 * S; ctx.lineCap = "round";
          ctx.beginPath();
          for (let j = 0; j < 3; j++) { ctx.moveTo(lx + j * 7 * S + 4 * S, y - 8 * S); ctx.lineTo(lx + j * 7 * S, y + 8 * S); }
          ctx.stroke(); ctx.globalAlpha = 1;
          gx = lx + 32 * S;
        }
        const s = wx.tempC != null ? `${wx.actionable}  ·  ${Math.round(wx.tempC)}°` : wx.actionable;
        text(ctx, s, gx, y, { px: 0.026 * H, weight: 400, color: C.cold, glow: 3, core: 0.92 }, "left", wxA * 0.92);
      }

      // finances (right): the month's ledger
      const fin = Sg.finances;
      const finA = fade(b, 0.03, 0.42) * od;
      if (fin && finA > 0.004 && fin.income != null && fin.spent != null) {
        const mood = fin.mood || "calm", warn = mood === "warning", drift = mood === "drift";
        const pulse = warn ? 0.82 + 0.18 * Math.sin(t * 2.2) : 1;
        const mc = warn ? C.alarm : drift ? C.straw : C.pine;
        const rx = 0.93 * W, y = 0.705 * H + sink, a = finA;
        const net = fin.net != null ? fin.net : fin.income - fin.spent;
        text(ctx, `${MONTHS[now.getMonth()]}  LEDGER`, rx, y, { px: 0.021 * H, font: "mono", spacing: 0.2, color: C.coldDim, glow: 3, core: 0.95 }, "right", a);
        text(ctx, U.fmtMoney(net, { sign: true }), rx, y + 0.056 * H, { px: 0.05 * H, weight: 300, color: mc, glow: warn ? 9 : 6, core: 0.92 }, "right", a * pulse);
        const L = 0.13 * W, bx0 = rx - L, by = y + 0.1 * H;
        const ratio = fin.income > 0 ? fin.spent / fin.income : 1;
        ctx.lineCap = "round";
        ctx.globalAlpha = a * 0.6; ctx.strokeStyle = U.rgba(cdim, 1); ctx.lineWidth = 1.1 * S;
        ctx.beginPath(); ctx.moveTo(bx0, by); ctx.lineTo(rx, by); ctx.stroke();
        const mcs = U.safe(mc), sl = L * Math.min(1, ratio);
        ctx.globalAlpha = a * 0.85 * pulse; ctx.strokeStyle = U.rgba(mcs, 1); ctx.lineWidth = 2 * S;
        ctx.beginPath(); ctx.moveTo(bx0, by + 0.012 * H); ctx.lineTo(bx0 + sl, by + 0.012 * H); ctx.stroke();
        if (ratio > 1) {
          const ac = U.safe(C.alarm), ex = Math.min(0.04 * W, L * (ratio - 1));
          ctx.globalAlpha = a * 0.95 * pulse; ctx.strokeStyle = U.rgba(ac, 1); ctx.lineWidth = 2.4 * S;
          ctx.beginPath(); ctx.moveTo(rx, by + 0.012 * H); ctx.lineTo(rx + ex, by + 0.012 * H); ctx.stroke();
          glow(ctx, C.alarm, rx + ex, by + 0.012 * H, 0.022 * H, 0.022 * H, a * 0.35 * pulse);
        }
        ctx.globalAlpha = 1;
        const lp = Math.max(12, 0.02 * H);
        text(ctx, `${U.fmtMoney(fin.income)} in  ·  ${U.fmtMoney(fin.spent)} out`, rx, by + 0.042 * H, { px: lp, color: C.cold, glow: 2, core: 0.9 }, "right", a * 0.9);
        if (fin.lastUpdated) {
          const hrs = (now - fin.lastUpdated) / 3600000;
          const ago = hrs >= 1 && hrs < 48 ? `${Math.round(hrs)} h ago` : U.fmtAgo(fin.lastUpdated, now);
          text(ctx, `updated ${ago}`, rx, by + 0.074 * H, { px: lp * 0.92, font: "mono", color: C.coldDim, glow: 2, core: 0.9 }, "right", a * 0.85);
        }
      }

      // host labels under the lay (work); a down host gets the loud label, a whisper in ambient
      const hlA = fade(b, 0.12, 0.55) * od;
      for (let i = 0; i < hn; i++) {
        const h = hb[i], down = !h.up, x = hostScreen[i * 2], y = hostScreen[i * 2 + 1];
        const lp = Math.max(12, 0.018 * H);
        const ly = gy + 48 * k;
        if (hlA > 0.004) {
          text(ctx, String(h.host).toUpperCase(), x, ly, { px: lp, font: "mono", spacing: 0.2, color: down ? C.alarm : C.coldDim, glow: down ? 6 : 2, core: 0.95 }, "center", hlA * (down ? 1 : 0.85));
          if (down) {
            const since = h.downSince ? `down ${U.fmtMinutes((now - h.downSince) / 60000)}` : "down";
            text(ctx, since, x, ly + lp * 1.45, { px: lp * 1.1, color: C.flare, glow: 5, core: 0.92 }, "center", hlA);
          }
        }
        if (down && ambA > 0.01) {
          const p = 0.5 + 0.5 * Math.sin(t * TAU / 3.2);
          text(ctx, `${h.host}  ·  down`, x, Math.min(gy + 44 * k, 0.965 * H), { px: 0.021 * H, font: "serif", italic: true, color: C.flare, glow: 4, core: 0.85 }, "center", ambA * od * (0.4 + 0.12 * p));
        }
      }

      // news (centre, in the open ground between the date and the lay): one dispatch, as the notebook
      // would log it: source and age in the mono label hand, the headline in the light sans under it.
      // A critical item is the rare flare: ember-red, a slow pulse and a live coal beside the label.
      const news = Sg.news && Sg.news.headline ? Sg.news : null;
      const crit = !!(news && news.critical);
      const nPulse = crit ? 0.5 + 0.5 * Math.sin(t * TAU / 3.6) : 0;
      const nwA = fade(b, 0.08, 0.5) * od;
      if (news && nwA > 0.004) {
        const y0 = 0.592 * H + sink, lpx = 0.0165 * H;
        const ho = { px: 0.027 * H, weight: 300, color: crit ? C.alarm : C.cold, glow: crit ? 7 : 4, core: 0.92 };
        const lines = newsLines(String(news.headline), ho, 0.52 * W);
        const age = newsAge(news.published, now);
        const src = news.source ? String(news.source).toUpperCase() : "";
        const lab = (crit ? "ALERT  ·  " : "") + src + (src && age ? "  ·  " : "") + (age ? age.toUpperCase() : "");
        const lo = { px: lpx, font: "mono", spacing: 0.2, color: crit ? C.flare : C.coldDim, glow: crit ? 4 : 2, core: 0.95 };
        const lw = text(ctx, lab, 0.5 * W + (crit ? 0.012 * H : 0), y0, lo, "center", nwA * (crit ? 0.8 + 0.2 * nPulse : 0.9));
        if (crit) {
          // the coal: breathes slowly beside the label, never brighter than the fire's own core
          const cxn = 0.5 * W + 0.012 * H - lw / 2 - 0.021 * H, r = 0.0042 * H;
          glow(ctx, C.alarm, cxn, y0, r * 6, r * 6, nwA * (0.25 + 0.3 * nPulse));
          ctx.globalAlpha = nwA * (0.65 + 0.35 * nPulse); ctx.fillStyle = U.rgba(U.safe(C.alarm), 1);
          ctx.beginPath(); ctx.arc(cxn, y0, r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        }
        const ha = nwA * (crit ? 0.72 + 0.28 * nPulse : 0.9);
        for (let i = 0; i < lines.length; i++) text(ctx, lines[i], 0.5 * W, y0 + (0.034 + i * 0.032) * H, ho, "center", ha);
      }

      // now playing (bottom left, the notebook's last line): "title — artist" in the light hand, the album
      // art as a small dim print beside it, a progress hairline like the calendar's fuse. Paused: a pause
      // mark hung in the margin and the line dimmed.
      const np = hasTrack(Sg.nowPlaying) ? Sg.nowPlaying : null;
      const npA = fade(b, 0.1, 0.5) * od;
      if (np && npA > 0.004) {
        const y = 0.925 * H + sink, paused = !np.isPlaying, pa = npA * (paused ? 0.55 : 1);
        const no = { px: 0.024 * H, weight: 300, color: C.cold, glow: 3, core: 0.9 };
        const as = Math.round(0.04 * H), th = artThumb(np.art, as);
        const tx = th ? lx + as + 0.012 * H : lx;
        const str = npText("work", np, no, 0.34 * W - tx, "");
        const tw = text(ctx, str, tx, y, no, "left", pa * 0.9);
        if (th) {
          ctx.globalAlpha = pa * 0.5; ctx.drawImage(th, lx, y - as / 2, as, as);
          ctx.globalAlpha = pa * 0.5; ctx.strokeStyle = U.rgba(cdim, 1); ctx.lineWidth = 1;
          ctx.strokeRect(lx - 0.5, y - as / 2 - 0.5, as + 1, as + 1);
          ctx.globalAlpha = 1;
        }
        if (paused) pauseMark(ctx, lx - 0.026 * H, y, 0.017 * H, C.coldDim, npA * 0.85);
        const dur = np.durationMs, pr = np.progressMs;
        if (pr != null && dur != null && dur > 0 && tw > 0) {
          const hy = y + 0.025 * H, xe = tx + tw * U.clamp(pr / dur);
          ctx.lineCap = "round"; ctx.lineWidth = 1 * S;
          ctx.globalAlpha = pa * 0.45; ctx.strokeStyle = U.rgba(U.safe(C.coldFaint), 1);
          ctx.beginPath(); ctx.moveTo(tx, hy); ctx.lineTo(tx + tw, hy); ctx.stroke();
          ctx.globalAlpha = pa * 0.8; ctx.strokeStyle = U.rgba(cold, 1);
          ctx.beginPath(); ctx.moveTo(tx, hy); ctx.lineTo(xe, hy); ctx.stroke();
          ctx.globalAlpha = pa * 0.9; ctx.fillStyle = U.rgba(cold, 1);
          ctx.beginPath(); ctx.arc(xe, hy, 1.8 * S, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // ---------------------------------------------------- clock: hero in the notebook, lit by the fire in the evening
      const eb = U.easeInOut(b);
      const clX = 0.5 * W, clY = U.lerp(0.385 * H, 0.2 * H, eb), clPx = U.lerp(0.24 * H, 0.125 * H, eb);
      {
        const str = U.fmtTime(now, { hour24: AW.config.clock ? AW.config.clock.hour24 !== false : true });
        const wq = Math.round(U.smoothstep(0.1, 0.85, b) * CLK_Q);
        const cv = clockCanvas(str, wq);
        const kk = clPx / clkPx;
        // in the evening its brightness follows the fire: a soft flicker, dimmer once it is coals
        const fireLit = U.clamp(0.25 + 0.7 * U.clamp(flame) * fl + 0.25 * bed);
        ctx.globalAlpha = U.lerp(1, U.lerp(0.42 + 0.48 * fireLit, 0.8, dAmb), ambA) * od;
        ctx.drawImage(cv.cv, clX - cv.w * kk / 2, clY - cv.h * kk / 2, cv.w * kk, cv.h * kk);
        ctx.globalAlpha = 1;
      }

      // ---------------------------------------------------- ambient whispers
      if (ambA > 0.01) {
        const wa = ambA * od;
        let wy = clY + 0.105 * H;
        if (next && next.minutesUntil < 30) {
          text(ctx, `${next.title}  ·  ${U.fmtMinutes(next.minutesUntil)}`, clX, wy,
            { px: 0.028 * H, font: "serif", italic: true, color: C.whisper, glow: 4, core: 0.85 }, "center", wa * 0.45);
          wy += 0.045 * H;
        }
        // a critical headline whispers once, faint and ember-red, breathing slowly with the label's coal
        if (crit) {
          const wo = { px: 0.023 * H, font: "serif", italic: true, color: C.flare, glow: 3, core: 0.8 };
          text(ctx, newsWhisper(String(news.headline), wo, 0.4 * W), clX, wy, wo, "center", wa * (0.26 + 0.08 * nPulse));
          wy += 0.04 * H;
        }
        // rain, storm and snow are already in the painting; anything else gets a whisper
        if (wx && wx.actionable && !wet && wx.condition !== "snow") {
          text(ctx, wx.actionable.toLowerCase(), clX, wy, { px: 0.024 * H, font: "serif", italic: true, color: C.whisper, glow: 3, core: 0.8 }, "center", wa * 0.28);
        }
        // now playing: a faint line drifting low by the log seat, as if from a little radio left on it
        if (np) {
          const paused = !np.isPlaying;
          const wo = { px: 0.024 * H, font: "serif", italic: true, color: C.whisper, glow: 3, core: 0.82 };
          const str = npText("amb", np, wo, 0.2 * W, paused ? "" : "♪  ");
          const nx = 0.18 * W + Math.sin(t * 0.045) * 0.006 * W, ny = 0.878 * H + Math.sin(t * 0.07 + 1) * 0.004 * H;
          const na = wa * U.lerp(0.34, 0.6, dAmb) * (paused ? 0.55 : 1);
          const tw = text(ctx, str, nx, ny, wo, "center", na);
          if (paused) pauseMark(ctx, nx - tw / 2 - 0.026 * H, ny, 0.015 * H, C.whisper, na * 0.9);
        }
      }
      ctx.globalAlpha = 1;
    },
  });
})();
