// Dark Academia: the Book of Hours by day, the candlelit study by night.
// Work = an illuminated manuscript page floating on black. Hairline ruling, a serif clock whose first
//   figure is a gilt-framed initial with vine-work, the calendar as a rubricated entry, the canonical
//   hours of the day along the bottom rule with the sun riding it, marginal seals (hosts), a ledger.
//   Cool moonlit ink; gilt and red ochre only as rubrication.
// Ambient = the study by candlelight. One candle in fine engraved line burns down over the evening
//   (tall at dusk, a stub by ~6 h) and the room it lights recedes with it: shelved books, an open
//   folio, quill and inkwell, a lancet window that carries the sky (daylight, dusk) and the real weather:
//   moon and stars when clear, a flat dark lid of cloud, fog pressing pale on the glass, rain falling
//   past and running down the panes (slanted by the wind), a storm's rare dim lightning throwing the
//   leading across the desk, snow drifting past and banking in the bottom of the lights. A draught in
//   a storm or wind makes the candle waver.
// The exhale: the inscriptions fade like old iron-gall ink in a staggered cascade, the ruling retracts,
//   the candle catches and the study emerges around it. Back to work: the candle is snuffed (a wisp of
//   smoke), the room goes dark, the page is written again.
(function () {
  const U = AW.util;
  const TAU = Math.PI * 2;
  const SERIF = '"Cormorant Garamond", "EB Garamond", Garamond, "TeX Gyre Pagella", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "DejaVu Serif", serif';

  const C = {
    ink: U.hex("#8fb0cc"),       // work hero: cool moonlit ink, pale slate-blue
    inkMid: U.hex("#7593b0"),
    inkDim: U.hex("#56708a"),
    gilt: U.hex("#caa257"),      // restrained shell gold
    giltDim: U.hex("#9c7c44"),
    rubric: U.hex("#c4553a"),    // red ochre: the pilcrow, and the rare alarm
    alarm: U.hex("#d85a38"),
    sepia: U.hex("#8c6a46"),     // iron-gall ink gone brown: where a fading inscription ends up
    candle: U.hex("#e0a24a"),
    flame: U.hex("#d06a28"),
    core: U.hex("#e8b450"),
    blueFoot: U.hex("#3a58b0"),
    wax: U.hex("#c8a676"),
    brass: U.hex("#bc8c40"),
    oxblood: U.hex("#963a2c"),
    green: U.hex("#3a7656"),
    brown: U.hex("#94704a"),
    paper: U.hex("#bca078"),
    smoke: U.hex("#7c6e64"),
    navy: U.hex("#2a3a6e"),      // by day only: a navy cloth binding among the browns
    warmRed: U.hex("#cc5a40"),
    // window glass by sky state
    glassNight: U.hex("#24407a"),
    glassDuskTop: U.hex("#4c4c8c"),
    glassDuskLow: U.hex("#c8784a"),
    glassDay: U.hex("#6a88b0"),
    glassDayLow: U.hex("#8a9cb8"),
    leadNight: U.hex("#4a6496"),
    leadDusk: U.hex("#7c6c8c"),
    leadDay: U.hex("#8aa0c0"),
    rain: U.hex("#7890b8"),
    // the weather in the window
    cloud: U.hex("#2e3646"),     // a flat lid of cloud
    star: U.hex("#8a9cd0"),
    moon: U.hex("#aab4d0"),
    murk: U.hex("#6c84a8"),      // fog pressing on the glass: pale blue
    snow: U.hex("#8e9cbc"),
    flash: U.hex("#7072b4"),     // lightning: dim violet, never white
  };

  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
    "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth"];
  for (let i = 21; i <= 29; i++) ORD[i] = "twenty-" + ORD[i - 20];
  ORD[30] = "thirtieth"; ORD[31] = "thirty-first";

  const BURN = 5.75 * 3600; // seconds of evening from a tall candle to a stub
  const DOTTED = [1.5, 5], SOLID = [];

  // ------------------------------------------------------------------ canvases + sprites
  let dpr = 1, W = 0, H = 0, built = "";
  let studyL = null, litL = null, winL = null, litKey = "", winKey = "";
  let CK = null;                       // hero clock metrics
  let flameS = null, lightS = null;    // smoothed exhale states (no snap if the mode flips mid-exhale)
  let RAIN = null, DRIPS = null, FLAKES = null, BEADS = null, paneL = null, infoL = null;
  const LIT = { x: 0, y: 0, R: 1, k: 0 }; // where the candlelight is this frame (seals read it)
  let DAYK = 0;                            // how much of the ambient day look is up (0 at night)
  const sprites = new Map(), initials = new Map(), dots = new Map();
  let mctx = null;

  function mk(wCss, hCss) {
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.ceil(wCss * dpr)); cv.height = Math.max(1, Math.ceil(hCss * dpr));
    const c = cv.getContext("2d"); c.scale(dpr, dpr);
    return { cv, c };
  }
  const spacingOk = (c) => "letterSpacing" in c;
  const colKey = (c) => `${c.r | 0},${c.g | 0},${c.b | 0}`;
  const fontOf = (o) => `${o.style || "normal"} ${o.caps ? "small-caps" : "normal"} 400 ${Math.round(o.px)}px ${SERIF}`;

  // o: { px, style, caps, spacing (em), color, glow, core }. Glow baked once, then blitted.
  function sprite(str, o) {
    const key = `${str}|${o.px | 0}|${o.style || ""}|${o.caps ? 1 : 0}|${o.spacing || 0}|${colKey(o.color)}|${o.glow || 0}|${o.core || 0}`;
    let s = sprites.get(key);
    if (s) { sprites.delete(key); sprites.set(key, s); return s; }
    const font = fontOf(o), sp = (o.spacing || 0) * o.px;
    mctx.font = font; if (spacingOk(mctx)) mctx.letterSpacing = `${sp}px`;
    const tw = Math.max(1, mctx.measureText(str).width - (spacingOk(mctx) ? sp : 0));
    const glow = o.glow || 0;
    const pad = Math.ceil(glow * 2.4 + o.px * 0.12 + 4);
    const w = Math.ceil(tw + pad * 2 + sp), h = Math.ceil(o.px * 1.5 + pad * 2);
    const { cv, c } = mk(w, h);
    c.font = font; if (spacingOk(c)) c.letterSpacing = `${sp}px`;
    c.textAlign = "left"; c.textBaseline = "middle";
    const col = U.safe(o.color), x = pad, y = h / 2;
    if (glow > 0) {
      c.shadowColor = U.rgba(col, 0.8);
      c.shadowBlur = glow * 2 * dpr; c.fillStyle = U.rgba(col, 0.2); c.fillText(str, x, y);
      c.shadowBlur = glow * dpr; c.fillStyle = U.rgba(col, 0.28); c.fillText(str, x, y);
      c.shadowBlur = 0;
    }
    c.fillStyle = U.rgba(col, o.core || 0.92); c.fillText(str, x, y);
    s = { cv, w, h, pad, tw };
    sprites.set(key, s);
    if (sprites.size > 140) sprites.delete(sprites.keys().next().value);
    return s;
  }
  // returns the drawn advance width
  function text(ctx, str, x, y, o, align, scale, alpha) {
    if (!str) return 0;
    const s = sprite(str, o), k = scale || 1;
    if (alpha <= 0.004) return s.tw * k;
    const dx = align === "left" ? x - s.pad * k : align === "right" ? x - (s.pad + s.tw) * k : x - (s.pad + s.tw / 2) * k;
    ctx.globalAlpha = U.clamp(alpha);
    ctx.drawImage(s.cv, dx, y - s.h * k / 2, s.w * k, s.h * k);
    ctx.globalAlpha = 1;
    return s.tw * k;
  }

  // News: the headline laid out once per (text, font, width) into one line, or two with the second cut at
  // a word boundary, measured in the sprite's own font. Re-laid only when the headline changes.
  const NL = { key: "", lines: null }, NW = { key: "", line: "" };
  function measureIn(o) { mctx.font = fontOf(o); if (spacingOk(mctx)) mctx.letterSpacing = "0px"; }
  function newsLines(str, o, maxW) {
    const key = `${str}|${fontOf(o)}|${Math.round(maxW)}`;
    if (NL.key === key) return NL.lines;
    measureIn(o);
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
  function newsWhisper(str, o, maxW) {
    const key = `${str}|${fontOf(o)}|${Math.round(maxW)}`;
    if (NW.key === key) return NW.line;
    measureIn(o);
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

  // Now playing: "title — artist" cut to its width once per (track, font, width) with U.ellipsize in the
  // sprite's own font, one slot per face (the margin note, the card on the desk). Sprites are cached.
  const NPS = { work: { t: null, a: null, f: "", w: 0, s: "" }, amb: { t: null, a: null, f: "", w: 0, s: "" } };
  function npText(slot, np, o, maxW) {
    const c = NPS[slot], w = Math.round(maxW), font = fontOf(o);
    if (c.t === np.title && c.a === np.artist && c.f === font && c.w === w) return c.s;
    const title = np.title != null ? String(np.title).trim() : "", artist = np.artist != null ? String(np.artist).trim() : "";
    const full = title && artist ? `${title} — ${artist}` : title || artist;
    measureIn(o);
    c.t = np.title; c.a = np.artist; c.f = font; c.w = w;
    c.s = full ? U.ellipsize(full, w, mctx) : "";
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

  // Sound (THEMES.md "Sound"): render() leaves the candle's state here and cues the window's lightning;
  // soundscape() turns it into layer levels after render and keeps the rare sound-only events (a page
  // turned, the college bell on the hour, an owl).
  const SND = { candle: 0, pageAt: -1, owlAt: -1, hour: -1 };
  const LV = { room: 0.3, rain: 0, wind: 0, fire: 0, birds: 0 };
  const cue = (name, o) => { const a = AW.audio; if (a && a.cue) a.cue(name, o); };
  const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);

  // soft round glow, radial gradient baked once per colour
  function dotSprite(col) {
    const key = colKey(col);
    let d = dots.get(key);
    if (d) return d;
    if (dots.size > 24) dots.clear();
    d = mk(64, 64);
    const c = U.safe(col), g = d.c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, U.rgba(c, 0.5)); g.addColorStop(0.25, U.rgba(c, 0.2));
    g.addColorStop(0.6, U.rgba(c, 0.05)); g.addColorStop(1, U.rgba(c, 0));
    d.c.fillStyle = g; d.c.fillRect(0, 0, 64, 64);
    dots.set(key, d);
    return d;
  }
  function glowDot(ctx, col, x, y, r, a) {
    if (a <= 0.004 || r <= 0) return;
    ctx.globalAlpha = U.clamp(a);
    ctx.drawImage(dotSprite(col).cv, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  // engraved stroke of the current path: soft halo + crisp core. By day (DAYP, the daylit study bake) the same
  // path is an edge: a dark line on the material, or a light one for gilt, brass and paper.
  function eng(c, col, a, lw) {
    if (DAYP) {
      const light = col === C.brass || col === C.gilt || col === C.paper || col === C.candle || col === C.giltDim;
      c.lineWidth = lw; c.strokeStyle = U.rgba(light ? capC(U.scale(col, 1.08)) : U.scale(mat(col), 0.42), Math.min(1, a * 1.1)); c.stroke();
      return;
    }
    const cc = U.safe(col);
    c.lineWidth = lw * 3; c.strokeStyle = U.rgba(cc, a * 0.12); c.stroke();
    c.lineWidth = lw; c.strokeStyle = U.rgba(cc, a); c.stroke();
  }
  // a silhouette: black at night (near things hide far lines); by day the object's own material
  function blackFill(c, col) {
    if (DAYP && col) { c.fillStyle = U.rgba(mat(col), 1); c.fill(); return; }
    c.fillStyle = "#000"; c.fill();
  }
  let DAYP = false;   // true only while the daylit study is being baked
  const capC = (c) => ({ r: Math.min(215, c.r), g: Math.min(215, c.g), b: Math.min(215, c.b) });
  // the materials by day (full colour; the room is laid down dimmed): real cloth, oak, brass, parchment
  function mat(col) {
    if (col === C.oxblood) return MATC.oxblood;
    if (col === C.green) return MATC.green;
    if (col === C.brown) return MATC.brown;
    if (col === C.navy) return MATC.navy;
    if (col === C.brass) return MATC.brass;
    if (col === C.paper) return MATC.paper;
    return capC(U.scale(col, 0.9));
  }
  const bez = (p, t) => {
    const u = 1 - t;
    return [u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6],
      u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7]];
  };
  const fade = (b, a0, a1) => 1 - U.smoothstep(a0, a1, b);
  // iron-gall ink browns as an inscription fades (quantised so the sprite cache stays small)
  const aged = (col, a) => { const k = Math.round(U.clamp(1 - a) * 4) / 4 * 0.85; return k ? U.mix(col, C.sepia, k) : col; };
  // stage coordinates for the study: centred, in units of screen height, so any aspect keeps the room
  const X = (k) => W / 2 + k * H, Y = (k) => k * H;

  // light falloff from the flame (same curve as the mask), s = distance / radius
  const MS = [0, 0.12, 0.3, 0.5, 0.72, 1], MA = [1, 0.86, 0.52, 0.24, 0.07, 0];
  function falloff(s) {
    if (s >= 1) return 0;
    for (let i = 1; i < MS.length; i++) if (s <= MS[i]) return U.lerp(MA[i - 1], MA[i], (s - MS[i - 1]) / (MS[i] - MS[i - 1]));
    return 0;
  }

  // ------------------------------------------------------------------ the illuminated initial
  function buildClock() {
    const px = Math.round(0.25 * H);
    const o = { px, color: C.ink, glow: 10, core: 0.9 };
    mctx.font = fontOf(o); if (spacingOk(mctx)) mctx.letterSpacing = "0px";
    mctx.textBaseline = "middle";
    const m = mctx.measureText("0123456789");
    CK = { px, asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent, o };
    initials.clear();
  }

  function leaf(c, x, y, nx, ny, sz) {
    const sx = x + nx * sz * 0.45, sy = y + ny * sz * 0.45;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + nx * sz * 0.1 - ny * sz * 0.15, y + ny * sz * 0.1 + nx * sz * 0.15, sx, sy);
    eng(c, C.inkMid, 0.5, 1);
    c.save(); c.translate(sx, sy); c.rotate(Math.atan2(nx, -ny));
    // ivy leaf: heart-shaped with a drawn-out point, local -y is outward
    c.beginPath(); c.moveTo(0, 0);
    c.bezierCurveTo(-0.62 * sz, 0.08 * sz, -0.66 * sz, -0.58 * sz, -0.08 * sz, -0.86 * sz);
    c.quadraticCurveTo(0, -0.95 * sz, 0, -1.1 * sz);
    c.quadraticCurveTo(0, -0.95 * sz, 0.08 * sz, -0.86 * sz);
    c.bezierCurveTo(0.66 * sz, -0.58 * sz, 0.62 * sz, 0.08 * sz, 0, 0);
    c.fillStyle = U.rgba(U.safe(C.gilt), 0.16); c.fill();
    eng(c, C.gilt, 0.75, 1);
    c.beginPath(); c.moveTo(0, -0.05 * sz); c.lineTo(0, -0.8 * sz); eng(c, C.gilt, 0.35, 0.8);
    c.restore();
  }
  // a hairline that leaves the stem and winds into a tightening spiral, ending in a gilt bezant
  function tendril(c, x, y, nx, ny, sz, side) {
    let h = Math.atan2(ny, nx), px = x, py = y;
    const n = 36, ds = sz * 1.7 / n;
    c.beginPath(); c.moveTo(x, y);
    for (let i = 0; i < n; i++) { h += side * (0.04 + i * 0.0125); px += Math.cos(h) * ds; py += Math.sin(h) * ds; c.lineTo(px, py); }
    eng(c, C.inkMid, 0.45, 0.9);
    c.beginPath(); c.arc(px, py, 1.7, 0, TAU); c.fillStyle = U.rgba(U.safe(C.gilt), 0.8); c.fill();
  }
  function vine(c, p, rnd, sz) {
    c.beginPath(); c.moveTo(p[0], p[1]); c.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
    eng(c, C.inkMid, 0.6, 1.1);
    let side = rnd() < 0.5 ? 1 : -1;
    for (let i = 1; i <= 4; i++) {
      const t = i / 4.7 + (rnd() - 0.5) * 0.05;
      const [x, y] = bez(p, t), [x2, y2] = bez(p, t + 0.01);
      const tx = x2 - x, ty = y2 - y, tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl * side, ny = tx / tl * side;
      if (i % 2) leaf(c, x, y, nx, ny, sz * (0.85 + rnd() * 0.3));
      else tendril(c, x, y, nx, ny, sz * (0.75 + rnd() * 0.3), side);
      side = -side;
    }
    const [x, y] = bez(p, 0.985), tx = p[6] - x, ty = p[7] - y, tl = Math.hypot(tx, ty) || 1;
    tendril(c, p[6], p[7], tx / tl, ty / tl, sz * 0.9, side);
    // three gilt bezants scattered along the run, as in the margins of a Book of Hours
    const g = U.safe(C.gilt);
    for (let k = 0; k < 3; k++) {
      const [bx, by] = bez(p, 0.25 + k * 0.28);
      const ox = (rnd() - 0.5) * sz * 1.4, oy = (rnd() - 0.5) * sz * 1.4;
      c.beginPath(); c.arc(bx + ox, by + oy, 1.6 + rnd() * 1.2, 0, TAU); c.fillStyle = U.rgba(g, 0.55); c.fill();
    }
  }

  // ornament only (frame, diapered ground, vine-work); the figure itself is a normal gilt sprite
  function initial(d) {
    let s = initials.get(d);
    if (s) return s;
    const { asc, desc } = CK;
    const gh = asc + desc, side = gh * 1.3;
    mctx.font = fontOf(CK.o); if (spacingOk(mctx)) mctx.letterSpacing = "0px";
    const dw = mctx.measureText(d).width;
    const bw = Math.max(side * 0.84, dw * 1.5), bh = side;
    const mL = side * 0.46, mR = side * 0.08, mT = side * 0.4, mB = side * 0.62;
    const w = bw + mL + mR, h = bh + mT + mB;
    const { cv, c } = mk(w, h);
    const bx = mL, by = mT, g = U.safe(C.gilt), gd = U.safe(C.giltDim);
    // diapered ground: faint gilt lattice, bezants at the crossings
    c.save(); c.beginPath(); c.rect(bx + 6, by + 6, bw - 12, bh - 12); c.clip();
    const step = bh / 6;
    c.beginPath();
    for (let k = -bh; k < bw + bh; k += step) { c.moveTo(bx + k, by); c.lineTo(bx + k + bh, by + bh); c.moveTo(bx + k + bh, by); c.lineTo(bx + k, by + bh); }
    c.lineWidth = 1; c.strokeStyle = U.rgba(gd, 0.12); c.stroke();
    c.fillStyle = U.rgba(g, 0.2);
    for (let i = 0; i <= Math.ceil(bw / (step / 2)); i++) {
      for (let j = 0; j <= Math.ceil(bh / (step / 2)); j++) {
        if ((i + j) & 1) continue;
        c.beginPath(); c.arc(bx + i * step / 2, by + j * step / 2, 1.3, 0, TAU); c.fill();
      }
    }
    c.restore();
    // frame: double gilt hairline, corner bosses
    c.beginPath(); c.rect(bx, by, bw, bh); eng(c, C.gilt, 0.78, 1.3);
    c.beginPath(); c.rect(bx + 5, by + 5, bw - 10, bh - 10); eng(c, C.gilt, 0.32, 1);
    c.fillStyle = U.rgba(g, 0.8);
    for (const [cx, cy] of [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]]) {
      c.beginPath(); c.moveTo(cx, cy - 4); c.lineTo(cx + 4, cy); c.lineTo(cx, cy + 4); c.lineTo(cx - 4, cy); c.closePath(); c.fill();
    }
    // vine-work: one run climbs out of the top-left, one falls from the lower left into the margin
    const rnd = U.rng(97 + d.charCodeAt(0) * 13), sz = side * 0.1;
    vine(c, [bx, by + bh * 0.3, bx - side * 0.3, by + bh * 0.18, bx - side * 0.34, by - side * 0.16, bx - side * 0.02, by - side * 0.3], rnd, sz);
    vine(c, [bx, by + bh * 0.74, bx - side * 0.32, by + bh * 0.86, bx - side * 0.26, by + bh + side * 0.26, bx - side * 0.02, by + bh + side * 0.5], rnd, sz);
    s = { cv, w, h, ax: bx, ay: by + bh / 2 - (desc - asc) / 2, bw };
    initials.set(d, s);
    return s;
  }

  // ------------------------------------------------------------------ the study (static linework)
  // Drawn once at full strength in warm inks with black silhouettes (so near objects hide far lines);
  // the candle's light mask decides each frame how much of it the room gets to see.
  function spine(c, x, yb, w, h, col, rnd, rot) {
    c.save(); c.translate(x, yb); if (rot) c.rotate(rot);
    const fc = DAYP && col === C.brown && ((x * 0.0137) % 1) < 0.5 ? C.navy : col;
    c.beginPath(); c.rect(0, -h, w, h); blackFill(c, fc); eng(c, fc, 0.8, 1.1);
    if (DAYP) {
      // the window is to the right: the spine's left side in shade, its right edge catching the light
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, "rgba(0,0,0,0.42)"); g.addColorStop(0.55, "rgba(0,0,0,0.04)"); g.addColorStop(0.9, "rgba(230,200,160,0.05)"); g.addColorStop(1, "rgba(230,200,160,0.22)");
      c.fillStyle = g; c.fillRect(0, -h, w, h);
    }
    // the candle is to the right: hatch the left of each spine
    c.beginPath();
    for (let k = 1; k <= 3; k++) { const xx = w * 0.085 * k; c.moveTo(xx, -h + 3); c.lineTo(xx, -3); }
    c.lineWidth = 0.8; c.strokeStyle = U.rgba(U.safe(col), 0.28); c.stroke();
    // raised bands in gilt, older books get the full set
    const old = rnd() < 0.45;
    const bands = old ? [0.1, 0.27, 0.44, 0.61, 0.9] : [0.08, 0.92];
    c.beginPath();
    for (const f of bands) { const yy = -h * (1 - f); c.moveTo(1, yy - 1.5); c.lineTo(w - 1, yy - 1.5); c.moveTo(1, yy + 1.5); c.lineTo(w - 1, yy + 1.5); }
    eng(c, C.brass, old ? 0.45 : 0.55, 0.9);
    if (!old && rnd() < 0.75) { c.beginPath(); c.rect(w * 0.2, -h * 0.74, w * 0.6, h * 0.13); eng(c, C.brass, 0.4, 0.9); }
    c.restore();
  }

  function lyingBook(c, x, yb, len, th, col, foreEdge, rnd) {
    const dx = 0.011 * H, dy = 0.014 * H;
    // top cover
    c.beginPath(); c.moveTo(x, yb - th); c.lineTo(x + dx, yb - th - dy); c.lineTo(x + len + dx, yb - th - dy); c.lineTo(x + len, yb - th); c.closePath();
    blackFill(c, col); eng(c, col, 0.7, 1);
    // end
    c.beginPath(); c.moveTo(x + len, yb); c.lineTo(x + len + dx, yb - dy); c.lineTo(x + len + dx, yb - th - dy); c.lineTo(x + len, yb - th); c.closePath();
    blackFill(c, col); eng(c, col, 0.55, 1);
    // front face
    c.beginPath(); c.rect(x, yb - th, len, th); blackFill(c, col); eng(c, col, 0.8, 1.1);
    if (foreEdge) {
      // the fore-edge: boards top and bottom, the leaves as fine engraved lines between
      c.beginPath();
      for (let yy = yb - th + 3.5; yy < yb - 2.5; yy += 1.9) { c.moveTo(x + 4, yy); c.lineTo(x + len - 3, yy); }
      c.lineWidth = 0.7; c.strokeStyle = U.rgba(U.safe(C.paper), 0.3); c.stroke();
      c.beginPath(); c.moveTo(x + 3, yb - th + 2.5); c.lineTo(x + 3, yb - 2); eng(c, C.paper, 0.4, 0.8);
    } else {
      c.beginPath();
      for (const f of [0.1, 0.14, 0.86, 0.9]) { c.moveTo(x + len * f, yb - th + 2); c.lineTo(x + len * f, yb - 2); }
      eng(c, C.brass, 0.5, 0.9);
      c.beginPath(); c.rect(x + len * 0.36, yb - th * 0.72, len * 0.28, th * 0.44); eng(c, C.brass, 0.4, 0.9);
    }
  }

  function shelf(c, x0, x1, y, rnd, off, stack) {
    const th = 0.012 * H, PAL = [C.oxblood, C.green, C.brown, C.oxblood, C.brown, C.green, C.brown];
    const end = x1 - 0.012 * H, stackAt = stack ? end - 0.15 * H : end - 0.04 * H;
    let x = x0 + 0.016 * H, i = 0, lastH = 0.15 * H;
    for (;;) {
      const w = (0.019 + rnd() * 0.02) * H, h = (0.11 + rnd() * 0.08) * H;
      if (x + w > stackAt - 0.035 * H) break;
      spine(c, x, y, w, h, PAL[(i + off) % PAL.length], rnd, 0);
      x += w + (rnd() < 0.25 ? 0.002 * H : 0); lastH = h; i++;
    }
    // the last one leans on the row
    {
      const w = 0.025 * H, h = Math.min(lastH * 0.95, 0.16 * H), rot = -0.22;
      spine(c, x + h * Math.sin(-rot) * 0.82, y, w, h, PAL[(i + off + 1) % PAL.length], rnd, rot);
    }
    if (stack) {
      let yb = y, sx = stackAt;
      for (let k = 0; k < 3; k++) {
        const len = (0.12 + rnd() * 0.025) * H, bt = (0.018 + rnd() * 0.008) * H;
        lyingBook(c, sx, yb, len, bt, PAL[(k + off + 2) % PAL.length], k !== 1, rnd);
        yb -= bt + 0.004 * H; sx += (rnd() - 0.3) * 0.01 * H;
      }
    }
    // the board, its shadow, two brackets
    c.beginPath(); c.rect(x0, y, x1 - x0, th); blackFill(c, C.brown); eng(c, C.brown, 0.75, 1.1);
    c.beginPath(); c.moveTo(x0 + 2, y + th * 0.45); c.lineTo(x1 - 2, y + th * 0.45); eng(c, C.brown, 0.25, 0.8);
    for (let k = 1; k <= 4; k++) {
      c.beginPath(); c.moveTo(x0 + k * 6, y + th + k * 3); c.lineTo(x1 - k * 6, y + th + k * 3);
      c.lineWidth = 0.8; c.strokeStyle = U.rgba(U.safe(C.brown), 0.3 / k); c.stroke();
    }
    for (const bxp of [x0 + 0.07 * H, x1 - 0.07 * H]) {
      c.beginPath(); c.moveTo(bxp - 0.006 * H, y + th); c.lineTo(bxp - 0.006 * H, y + th + 0.03 * H);
      c.bezierCurveTo(bxp - 0.006 * H, y + th + 0.05 * H, bxp + 0.006 * H, y + th + 0.05 * H, bxp + 0.006 * H, y + th + 0.03 * H);
      c.lineTo(bxp + 0.006 * H, y + th); blackFill(c, C.brown); eng(c, C.brown, 0.55, 1);
    }
  }

  function inkwell(c, x, yb) {
    const r = 0.032 * H, hg = 0.04 * H, nk = r * 0.34, top = yb - hg - 0.009 * H;
    c.beginPath();
    c.moveTo(x - r, yb);
    c.bezierCurveTo(x - r * 1.08, yb - hg * 0.55, x - r * 0.62, yb - hg * 0.98, x - nk, yb - hg);
    c.lineTo(x - nk, top); c.lineTo(x + nk, top); c.lineTo(x + nk, yb - hg);
    c.bezierCurveTo(x + r * 0.62, yb - hg * 0.98, x + r * 1.08, yb - hg * 0.55, x + r, yb);
    c.ellipse(x, yb, r, r * 0.2, 0, 0, Math.PI, false);
    c.closePath(); blackFill(c, C.green); eng(c, C.green, 0.8, 1.1);
    c.beginPath(); c.ellipse(x, top, nk * 1.15, nk * 0.32, 0, 0, TAU); blackFill(c, C.green); eng(c, C.green, 0.7, 1);
    c.beginPath(); c.ellipse(x, yb - hg, nk * 1.05, nk * 0.28, 0, 0, Math.PI); eng(c, C.green, 0.4, 0.8);
    // curved hatching on the shadow side, a glint on the lit shoulder
    c.beginPath();
    for (let k = 0; k < 4; k++) {
      const f = 0.86 - k * 0.12;
      c.moveTo(x - r * f, yb - 2);
      c.bezierCurveTo(x - r * f * 1.04, yb - hg * 0.5, x - r * f * 0.62, yb - hg * 0.86, x - r * f * 0.42, yb - hg * 0.94);
    }
    c.lineWidth = 0.8; c.strokeStyle = U.rgba(U.safe(C.green), 0.35); c.stroke();
    c.beginPath(); c.arc(x + r * 0.42, yb - hg * 0.62, r * 0.32, -1.2, -0.3); eng(c, C.candle, 0.55, 1.1);
  }

  function quill(c, x0, y0, x1, y1, rnd) {
    const p = [x0, y0, x0 - 0.012 * H, y0 - 0.12 * H, x1 + 0.035 * H, y1 + 0.08 * H, x1, y1];
    // vane silhouette first so the shelf behind it is hidden
    const N = 80, L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const t = 0.3 + 0.7 * i / N;
      const [x, y] = bez(p, t), [xa, ya] = bez(p, Math.min(1, t + 0.01)), [xb, yb] = bez(p, Math.max(0, t - 0.01));
      const tx = xa - xb, ty = ya - yb, tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
      const prof = Math.pow(Math.sin(Math.PI * Math.min(1, (t - 0.3) / 0.72)), 0.65) * 0.03 * H;
      const gapL = rnd() < 0.06 ? 0.55 : 1, gapR = rnd() < 0.05 ? 0.6 : 1;
      // barbs sweep toward the tip; the leading vane is narrower, as on a flight feather
      L.push([x, y, x + (-uy * 0.75 + ux * 0.66) * prof * gapL, y + (ux * 0.75 + uy * 0.66) * prof * gapL]);
      R.push([x, y, x + (uy * 0.75 + ux * 0.66) * prof * 0.55 * gapR, y + (-ux * 0.75 + uy * 0.66) * prof * 0.55 * gapR]);
    }
    c.beginPath(); c.moveTo(L[0][0], L[0][1]);
    for (const b of L) c.lineTo(b[2], b[3]);
    for (let i = R.length - 1; i >= 0; i--) c.lineTo(R[i][2], R[i][3]);
    c.closePath(); blackFill(c, C.paper);
    c.beginPath();
    for (const b of L) { c.moveTo(b[0], b[1]); c.lineTo(b[2], b[3]); }
    for (const b of R) { c.moveTo(b[0], b[1]); c.lineTo(b[2], b[3]); }
    c.lineWidth = 0.75; c.strokeStyle = U.rgba(U.safe(C.paper), 0.3); c.stroke();
    c.beginPath(); for (let i = 0; i < L.length; i++) i ? c.lineTo(L[i][2], L[i][3]) : c.moveTo(L[i][2], L[i][3]);
    eng(c, C.paper, 0.45, 0.8);
    c.beginPath(); for (let i = 0; i < R.length; i++) i ? c.lineTo(R[i][2], R[i][3]) : c.moveTo(R[i][2], R[i][3]);
    eng(c, C.paper, 0.4, 0.8);
    c.beginPath(); c.moveTo(p[0], p[1]); c.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
    eng(c, C.paper, 0.7, 1.3);
  }

  function openBook(c, sx, yb, pw, ph, rnd) {
    const lift = 0.008 * H;
    // page edges: bottom and top curves for one side (s = -1 left, +1 right)
    const bot = (s) => [sx, yb, sx + s * pw * 0.12, yb - 0.036 * H, sx + s * pw * 0.5, yb - 0.02 * H, sx + s * pw, yb - 0.01 * H];
    const top = (s) => [sx, yb - ph, sx + s * pw * 0.12, yb - ph - 0.034 * H, sx + s * pw * 0.48, yb - ph - 0.018 * H, sx + s * pw * 0.95, yb - ph - 0.008 * H];
    // the cover boards beneath
    c.beginPath();
    c.moveTo(sx, yb + lift * 0.9);
    c.lineTo(sx - pw - 0.01 * H, yb + lift * 0.2); c.lineTo(sx - pw * 0.95 - 0.006 * H, yb - ph - 0.004 * H);
    c.lineTo(sx + pw * 0.95 + 0.006 * H, yb - ph - 0.004 * H); c.lineTo(sx + pw + 0.01 * H, yb + lift * 0.2);
    c.closePath(); blackFill(c, C.oxblood); eng(c, C.oxblood, 0.55, 1);
    for (const s of [-1, 1]) {
      const B = bot(s), T = top(s);
      c.beginPath(); c.moveTo(B[0], B[1]); c.bezierCurveTo(B[2], B[3], B[4], B[5], B[6], B[7]);
      c.lineTo(T[6], T[7]); c.bezierCurveTo(T[4], T[5], T[2], T[3], T[0], T[1]); c.closePath();
      blackFill(c, C.paper); eng(c, C.paper, 0.75, 1.1);
      // the page block thickness under the outer edge
      c.beginPath();
      for (let k = 1; k <= 3; k++) {
        const o = k * lift / 3.2;
        c.moveTo(sx + s * pw * 0.35, yb - 0.022 * H + o); c.bezierCurveTo(sx + s * pw * 0.6, yb - 0.018 * H + o, sx + s * pw * 0.85, yb - 0.012 * H + o, sx + s * pw, yb - 0.01 * H + o);
        c.lineTo(sx + s * pw * 0.95, yb - ph - 0.008 * H + o * 0.3);
      }
      c.lineWidth = 0.7; c.strokeStyle = U.rgba(U.safe(C.paper), 0.25); c.stroke();
      // the text: broken hairlines that follow the curl of the page
      const rows = 8;
      for (let r = 0; r < rows; r++) {
        const v = 0.16 + r / (rows - 1) * 0.68;
        const rub = s < 0 && r === 0;
        let u = 0.14 + (s < 0 && r < 2 ? 0.1 : 0);
        const uEnd = (r === rows - 1 || rnd() < 0.15) ? 0.4 + rnd() * 0.35 : 0.88;
        c.beginPath();
        while (u < uEnd) {
          const wl = Math.min(uEnd - u, 0.04 + rnd() * 0.09);
          for (let q = 0; q <= 3; q++) {
            const uu = u + wl * q / 3;
            const [bx, by] = bez(B, uu), [tx, ty] = bez(T, uu);
            const px = U.lerp(bx, tx, v), py = U.lerp(by, ty, v);
            q ? c.lineTo(px, py) : c.moveTo(px, py);
          }
          u += wl + 0.016;
        }
        c.lineWidth = 0.9; c.strokeStyle = U.rgba(U.safe(rub ? C.oxblood : C.brown), rub ? 0.6 : 0.42); c.stroke();
      }
      if (s < 0) {
        // a small rubricated initial at the head of the left page
        const [bx, by] = bez(B, 0.16), [tx, ty] = bez(T, 0.16);
        const px = U.lerp(bx, tx, 0.86), py = U.lerp(by, ty, 0.86);
        c.beginPath(); c.rect(px - 1, py - 1, 0.016 * H, 0.016 * H); eng(c, C.oxblood, 0.7, 1);
      }
    }
    // the gutter, and a ribbon marker hanging over the desk edge
    c.beginPath(); c.moveTo(sx, yb); c.lineTo(sx, yb - ph); eng(c, C.paper, 0.4, 0.9);
    const rw = 0.0055 * H, ry1 = Y(0.905);
    c.beginPath();
    c.moveTo(sx - rw, yb - 2); c.bezierCurveTo(sx + 0.01 * H, yb + 0.03 * H, sx - 0.012 * H, ry1 - 0.035 * H, sx + 0.004 * H - rw, ry1);
    c.lineTo(sx + 0.004 * H, ry1 - 0.008 * H); c.lineTo(sx + 0.004 * H + rw, ry1);
    c.bezierCurveTo(sx - 0.012 * H + rw * 2, ry1 - 0.035 * H, sx + 0.01 * H + rw * 2, yb + 0.03 * H, sx + rw, yb - 2);
    blackFill(c, C.oxblood); eng(c, C.oxblood, 0.65, 1);
  }

  function holder(c, g) {
    const { x, foot, dishY, sockTop, cw } = g;
    const rx = 0.082 * H, ry = 0.017 * H, sw = cw / 2 + 0.006 * H;
    // handle ring to the right, behind the dish rim
    const hx = x + rx + 0.011 * H, hy = dishY - 0.006 * H;
    c.beginPath(); c.arc(hx, hy, 0.017 * H, 0, TAU); eng(c, C.brass, 0.7, 1.3);
    c.beginPath(); c.arc(hx, hy, 0.011 * H, 0, TAU); eng(c, C.brass, 0.4, 1);
    c.beginPath(); c.ellipse(hx + 0.004 * H, hy - 0.019 * H, 0.008 * H, 0.004 * H, -0.3, 0, TAU); blackFill(c, C.brass); eng(c, C.brass, 0.6, 1);
    // dish: underside bowl, then the rim
    c.beginPath(); c.moveTo(x - rx, dishY); c.bezierCurveTo(x - rx * 0.92, foot + 0.002 * H, x + rx * 0.92, foot + 0.002 * H, x + rx, dishY);
    c.ellipse(x, dishY, rx, ry, 0, 0, Math.PI, true); c.closePath(); blackFill(c, C.brass); eng(c, C.brass, 0.7, 1.1);
    c.beginPath();
    for (let k = 1; k <= 3; k++) {
      const f = 1 - k * 0.17;
      c.moveTo(x - rx * f, dishY + 0.002 * H + k * 1.2); c.bezierCurveTo(x - rx * f * 0.9, foot - (1 - f) * 6, x - rx * 0.2, foot - (1 - f) * 4, x - rx * 0.05, foot - (1 - f) * 3);
    }
    c.lineWidth = 0.8; c.strokeStyle = U.rgba(U.safe(C.brass), 0.3); c.stroke();
    c.beginPath(); c.ellipse(x, dishY, rx, ry, 0, 0, TAU); blackFill(c, C.brass); eng(c, C.brass, 0.8, 1.2);
    c.beginPath(); c.ellipse(x, dishY + 1, rx * 0.86, ry * 0.72, 0, 0, TAU); eng(c, C.brass, 0.35, 0.9);
    // socket
    c.beginPath(); c.moveTo(x - sw * 1.35, dishY); c.quadraticCurveTo(x - sw, dishY - 0.004 * H, x - sw, dishY - 0.012 * H);
    c.lineTo(x - sw, sockTop); c.lineTo(x + sw, sockTop); c.lineTo(x + sw, dishY - 0.012 * H);
    c.quadraticCurveTo(x + sw, dishY - 0.004 * H, x + sw * 1.35, dishY); c.closePath(); blackFill(c, C.brass); eng(c, C.brass, 0.8, 1.1);
    c.beginPath(); c.moveTo(x - sw, sockTop + 0.012 * H); c.lineTo(x + sw, sockTop + 0.012 * H); eng(c, C.brass, 0.4, 0.9);
    c.beginPath(); c.moveTo(x - sw * 0.7, sockTop + 3); c.lineTo(x - sw * 0.7, dishY - 0.008 * H); eng(c, C.brass, 0.25, 0.8);
    c.beginPath(); c.ellipse(x, sockTop, sw * 1.12, sw * 0.26, 0, 0, TAU); blackFill(c, C.brass); eng(c, C.brass, 0.8, 1.1);
  }

  function candleGeo(el) {
    const p = U.clamp(el / BURN);
    const x = X(-0.1), foot = Y(0.818), cw = 0.036 * H;
    const dishY = foot - 0.012 * H, sockTop = dishY - 0.036 * H;
    const hgt = 0.3 * H * (1 - 0.9 * p);
    const top = sockTop - hgt, wickTip = top - 0.013 * H;
    return { p, x, foot, dishY, sockTop, cw, hgt, top, wickTip, fy: wickTip - 0.026 * H };
  }

  function paintStudy(c) {
    const rnd = U.rng(1871);
    c.lineCap = "round"; c.lineJoin = "round";
    // the far shelf first: it only shows while the candle is tall
    shelf(c, X(-0.82), X(-0.44), Y(0.215), rnd, 3, false);
    shelf(c, X(-0.84), X(-0.37), Y(0.475), rnd, 0, true);
    // the back edge of the desk where it meets the wall
    c.beginPath(); c.moveTo(X(-0.95), Y(0.772)); c.lineTo(X(0.95), Y(0.772)); eng(c, C.brown, 0.3, 0.9);
    // books lying on the desk: fore-edges, one spine
    {
      let yb = Y(0.81), x = X(-0.56);
      const L = [[0.2, 0.03, C.brown, true], [0.18, 0.026, C.oxblood, false], [0.16, 0.022, C.green, true]];
      for (const [len, th, col, fe] of L) { lyingBook(c, x, yb, len * H, th * H, col, fe, rnd); yb -= th * H + 0.004 * H; x += 0.009 * H; }
    }
    quill(c, X(-0.262), Y(0.762), X(-0.35), Y(0.505), rnd);
    inkwell(c, X(-0.258), Y(0.814));
    holder(c, candleGeo(0));
    openBook(c, X(0.235), Y(0.818), 0.2 * H, 0.1 * H, rnd);
    // the front edge of the desk, with a little grain
    c.beginPath(); c.moveTo(X(-0.95), Y(0.868)); c.lineTo(X(0.95), Y(0.868)); eng(c, C.brown, 0.6, 1.1);
    c.beginPath(); c.moveTo(X(-0.95), Y(0.881)); c.lineTo(X(0.95), Y(0.881)); eng(c, C.brown, 0.35, 0.9);
    c.beginPath();
    for (let k = 0; k < 7; k++) {
      const y = Y(0.895 + k * 0.012 + rnd() * 0.005), xs = X(-0.9 + rnd() * 0.5), xe = X(0.2 + rnd() * 0.7);
      c.moveTo(xs, y);
      for (let xx = xs; xx < xe; xx += 0.03 * H) c.lineTo(xx, y + Math.sin(xx * 0.011 + k) * 1.4);
    }
    c.lineWidth = 0.7; c.strokeStyle = U.rgba(U.safe(C.brown), 0.16); c.stroke();
  }

  // ------------------------------------------------------------------ the window (lit by the sky)
  function winGeo() {
    const x0 = X(0.53), x1 = X(0.77), w = x1 - x0;
    return { x0, x1, w, mid: (x0 + x1) / 2, spring: Y(0.275), sill: Y(0.6), f: 0.016 * H, mull: 0.008 * H };
  }
  // pointed (equilateral) arch: two arcs struck from the opposite springing points
  function lancet(c, x0, x1, ys, yspr) {
    const w = x1 - x0, ang = Math.PI / 3;
    c.moveTo(x0, ys); c.lineTo(x0, yspr);
    c.arc(x1, yspr, w, Math.PI, Math.PI + ang, false);
    c.arc(x0, yspr, w, -ang, 0, false);
    c.lineTo(x1, ys); c.closePath();
  }
  // the glass of the window as one path: both lights and the oculus (for clipping the weather to it)
  function panes(c, G) {
    lancet(c, G.x0, G.mid - G.mull / 2, G.sill, G.spring);
    lancet(c, G.mid + G.mull / 2, G.x1, G.sill, G.spring);
    const ocY = G.spring - G.w * 0.54, ocR = G.w * 0.15;
    c.moveTo(G.mid + ocR, ocY); c.arc(G.mid, ocY, ocR, 0, TAU);
  }
  function quarries(c, G, a, b2) {
    const apex = G.spring - G.w * 0.866, hh = G.sill - apex, q = 0.034 * H;
    for (let k = -hh; k < (b2 - a) + hh; k += q) {
      c.moveTo(a + k, apex); c.lineTo(a + k + hh * 0.62, G.sill);
      c.moveTo(a + k, apex); c.lineTo(a + k - hh * 0.62, G.sill);
    }
  }
  // The window as it stands: the sky's glass, the weather that sits in it (a flat lid of cloud, stars and
  // the moon on a clear night, fog pressing on the glass, snow banked in the bottom of the lights), then
  // the leading over it. Repainted only when the sky or the (quantised) weather changes.
  function paintWindow(elev, cover, fog, dust) {
    const c = winL.c, G = winGeo();
    c.clearRect(0, 0, W, H);
    c.lineCap = "round"; c.lineJoin = "round";
    const night = 1 - U.smoothstep(-12, -3, elev), day = U.smoothstep(-1, 8, elev), dusk = U.clamp(1 - night - day);
    const mix3 = (a, b2, d) => ({ r: a.r * night + b2.r * dusk + d.r * day, g: a.g * night + b2.g * dusk + d.g * day, b: a.b * night + b2.b * dusk + d.b * day });
    const gTop = U.safe(mix3(C.glassNight, C.glassDuskTop, C.glassDay)), gLow = U.safe(mix3(C.glassNight, C.glassDuskLow, C.glassDayLow));
    const lead = mix3(C.leadNight, C.leadDusk, C.leadDay);
    // cloud, fog and snow take the colour out of the sky
    const ga = (0.06 * night + 0.09 * dusk + 0.1 * day) * (1 - 0.55 * cover), la = 0.32 * night + 0.42 * dusk + 0.5 * day;
    const apex = G.spring - G.w * 0.866, hh = G.sill - apex;
    const lights = [[G.x0, G.mid - G.mull / 2], [G.mid + G.mull / 2, G.x1]];
    const ocY = G.spring - G.w * 0.54, ocR = G.w * 0.15;
    const glass = c.createLinearGradient(0, apex, 0, G.sill);
    glass.addColorStop(0, U.rgba(gTop, ga)); glass.addColorStop(0.55, U.rgba(gTop, ga * 0.9)); glass.addColorStop(1, U.rgba(gLow, ga * 1.1));
    // glass
    c.fillStyle = glass;
    for (const [a, b2] of lights) { c.beginPath(); lancet(c, a, b2, G.sill, G.spring); c.fill(); }
    c.beginPath(); c.arc(G.mid, ocY, ocR, 0, TAU); c.fill();
    // the weather in the glass
    c.save(); c.beginPath(); panes(c, G); c.clip();
    if (cover > 0.01) {
      // overcast: a flat, dark, featureless sky
      const cc = U.safe(U.mix(C.cloud, C.glassDayLow, 0.55 * day));
      c.fillStyle = U.rgba(cc, (0.05 + 0.03 * day) * cover); c.fillRect(G.x0 - 2, apex - 2, G.w + 4, hh + 4);
    }
    const clear = Math.pow(1 - cover, 1.5) * night;
    if (clear > 0.01) {
      // a clear night: stars, and the moon riding high in the right light
      const r = U.rng(2207), sc = U.safe(C.star);
      for (let i = 0; i < 34; i++) {
        const sx = G.x0 + r() * G.w, sy = apex + Math.pow(r(), 1.3) * hh * 0.9, s = 0.7 + r() * 0.8;
        c.fillStyle = U.rgba(sc, (0.25 + 0.45 * r()) * clear);
        c.beginPath(); c.arc(sx, sy, s, 0, TAU); c.fill();
      }
      const mx = G.mid + G.mull / 2 + (G.x1 - G.mid) * 0.58, my = G.spring - 0.01 * H, mr = 0.013 * H, mc = U.safe(C.moon);
      const mg = c.createRadialGradient(mx, my, 0, mx, my, mr * 6);
      mg.addColorStop(0, U.rgba(mc, 0.1 * clear)); mg.addColorStop(1, U.rgba(mc, 0));
      c.fillStyle = mg; c.fillRect(mx - mr * 6, my - mr * 6, mr * 12, mr * 12);
      // a crescent: the disc less the dark of the moon
      c.save(); c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.clip();
      c.beginPath(); c.rect(mx - mr * 2, my - mr * 2, mr * 4, mr * 4);
      c.moveTo(mx + mr * 1.47, my - mr * 0.2); c.arc(mx + mr * 0.55, my - mr * 0.2, mr * 0.92, 0, TAU);
      c.fillStyle = U.rgba(mc, 0.55 * clear); c.fill("evenodd");
      c.restore();
    }
    if (fog > 0.01) {
      // fog pressing on the glass: a pale murk, thickest low down
      const mc = U.safe(C.murk), fg = c.createLinearGradient(0, apex, 0, G.sill);
      fg.addColorStop(0, U.rgba(mc, 0.035 * fog)); fg.addColorStop(0.6, U.rgba(mc, 0.075 * fog)); fg.addColorStop(1, U.rgba(mc, 0.11 * fog));
      c.fillStyle = fg; c.fillRect(G.x0 - 2, apex - 2, G.w + 4, hh + 4);
    }
    if (dust > 0.01) {
      // snow banked into the bottom of each light, deeper in the corners
      const sc = U.safe(C.snow), hs = 0.03 * H * (0.4 + 0.6 * dust);
      for (const [a, b2] of lights) {
        c.beginPath(); c.moveTo(a - 2, G.sill + 2);
        for (let k = 0; k <= 20; k++) {
          const u = k / 20, x = a + (b2 - a) * u, corner = Math.pow(Math.abs(u - 0.5) * 2, 3);
          c.lineTo(x, G.sill - hs * (0.45 + 0.55 * corner + 0.1 * Math.sin(u * 9 + a * 0.01)));
        }
        c.lineTo(b2 + 2, G.sill + 2); c.closePath();
        c.fillStyle = U.rgba(sc, 0.12 * dust); c.fill();
        c.lineWidth = 1.2; c.strokeStyle = U.rgba(sc, 0.45 * dust); c.stroke();
      }
    }
    c.restore();
    // diamond quarries, clipped to each light
    const lc = U.safe(lead);
    for (const [a, b2] of lights) {
      c.save(); c.beginPath(); lancet(c, a, b2, G.sill, G.spring); c.clip();
      c.beginPath(); quarries(c, G, a, b2);
      c.lineWidth = 0.9; c.strokeStyle = U.rgba(lc, la * 0.5); c.stroke();
      c.restore();
      c.beginPath(); lancet(c, a, b2, G.sill, G.spring); eng(c, lead, la, 1.1);
    }
    // oculus with a quatrefoil
    c.beginPath(); c.arc(G.mid, ocY, ocR, 0, TAU); eng(c, lead, la, 1.1);
    c.beginPath();
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; c.moveTo(G.mid + Math.cos(a) * ocR * 0.42 + ocR * 0.4, ocY + Math.sin(a) * ocR * 0.42); c.arc(G.mid + Math.cos(a) * ocR * 0.42, ocY + Math.sin(a) * ocR * 0.42, ocR * 0.4, 0, TAU); }
    c.lineWidth = 0.9; c.strokeStyle = U.rgba(lc, la * 0.6); c.stroke();
    // the stone: double outline of the opening, the mullion, the sill
    c.beginPath(); lancet(c, G.x0 - G.f, G.x1 + G.f, G.sill, G.spring); eng(c, lead, la * 0.75, 1.1);
    c.beginPath(); lancet(c, G.x0, G.x1, G.sill, G.spring); eng(c, lead, la * 0.45, 0.9);
    c.beginPath(); c.moveTo(G.x0 - G.f * 2.2, G.sill); c.lineTo(G.x1 + G.f * 2.2, G.sill);
    c.lineTo(G.x1 + G.f * 2.2, G.sill + 0.014 * H); c.lineTo(G.x0 - G.f * 2.2, G.sill + 0.014 * H); c.closePath();
    eng(c, lead, la * 0.7, 1);
    c.beginPath(); c.moveTo(G.x0 - G.f * 1.6, G.sill + 0.024 * H); c.lineTo(G.x1 + G.f * 1.6, G.sill + 0.024 * H); eng(c, lead, la * 0.3, 0.8);
    if (dust > 0.01) {
      // and a soft ridge of it along the sill
      const sc = U.safe(C.snow), x0 = G.x0 - G.f * 2, x1 = G.x1 + G.f * 2;
      c.beginPath(); c.moveTo(x0, G.sill);
      for (let k = 0; k <= 24; k++) { const u = k / 24; c.lineTo(U.lerp(x0, x1, u), G.sill - (1.2 + 2.2 * dust) * (0.7 + 0.3 * Math.sin(u * 13))); }
      c.lineTo(x1, G.sill); c.closePath();
      c.fillStyle = U.rgba(sc, 0.25 * dust); c.fill();
      c.lineWidth = 1; c.strokeStyle = U.rgba(sc, 0.45 * dust); c.stroke();
    }
    // the sky's light on the wall around the opening, barely there
    const sa = (0.018 * night + 0.03 * dusk + 0.035 * day) * (1 - 0.4 * cover), cy = (apex + G.sill) / 2, rr = (G.sill - apex) * 0.8;
    const sh = c.createRadialGradient(G.mid, cy, 0, G.mid, cy, rr);
    sh.addColorStop(0, U.rgba(gTop, sa)); sh.addColorStop(1, U.rgba(gTop, 0));
    c.fillStyle = sh; c.fillRect(G.mid - rr, cy - rr, rr * 2, rr * 2);
  }

  // The panes as light: glass filled, the leading cut out. Lightning flashes it over the window and casts it
  // (foreshortened onto the desk) as a pattern of light with the leading's shadow in it.
  function paintPanes() {
    const G = winGeo(), apex = G.spring - G.w * 0.866;
    const bx = G.x0 - 4, by = apex - 4, bw = G.w + 8, bh = G.sill - apex + 8;
    paneL = mk(bw, bh); paneL.x = bx; paneL.y = by; paneL.w = bw; paneL.h = bh;
    const c = paneL.c;
    c.translate(-bx, -by);
    c.fillStyle = U.rgba(U.safe(C.flash), 1);
    c.beginPath(); panes(c, G); c.fill();
    c.globalCompositeOperation = "destination-out";
    c.lineCap = "round"; c.strokeStyle = "#000";
    for (const [a, b2] of [[G.x0, G.mid - G.mull / 2], [G.mid + G.mull / 2, G.x1]]) {
      c.save(); c.beginPath(); lancet(c, a, b2, G.sill, G.spring); c.clip();
      c.beginPath(); quarries(c, G, a, b2); c.lineWidth = 2.2; c.stroke();
      c.restore();
      c.beginPath(); lancet(c, a, b2, G.sill, G.spring); c.lineWidth = 3; c.stroke();
    }
    const ocY = G.spring - G.w * 0.54, ocR = G.w * 0.15;
    c.beginPath(); c.arc(G.mid, ocY, ocR, 0, TAU); c.lineWidth = 3; c.stroke();
    c.beginPath();
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; c.moveTo(G.mid + Math.cos(a) * ocR * 0.42 + ocR * 0.4, ocY + Math.sin(a) * ocR * 0.42); c.arc(G.mid + Math.cos(a) * ocR * 0.42, ocY + Math.sin(a) * ocR * 0.42, ocR * 0.4, 0, TAU); }
    c.lineWidth = 2; c.stroke();
    c.globalCompositeOperation = "source-over";
  }
  // the panes' light thrown down through the window onto the desk: flipped, foreshortened, raked left
  function castPanes(ctx, a) {
    if (a <= 0.003 || !paneL) return;
    const G = winGeo(), sq = 0.17, sk = 0.36, deskY = Y(0.776);
    // x' = x + sk * (y - sill) - 0.02H, y' = deskY + sq * (sill - y)
    ctx.setTransform(dpr, 0, dpr * sk, -dpr * sq, dpr * (-sk * G.sill - 0.02 * H), dpr * (deskY + sq * G.sill));
    ctx.globalAlpha = U.clamp(a);
    ctx.drawImage(paneL.cv, paneL.x, paneL.y, paneL.w, paneL.h);
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ------------------------------------------------------------------ weather (eased between conditions)
  // Each condition has a presence weight eased toward 1 (the current one) or 0 (the rest) over a few
  // seconds, plus its own intensity, so the window never snaps from one sky to another. null = clear.
  const WXC = ["clear", "cloudy", "fog", "rain", "storm", "snow"];
  const WXP = new Float32Array(6), WXI = new Float32Array(6);
  const WX = { cover: 0, fog: 0, rain: 0, storm: 0, snow: 0, wind: 0, lean: 0, dust: 0, drift: 0 };
  let wxWind = 0, wxInit = false, draught = 0;
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
    WX.cover = U.clamp(WXP[1] * (0.15 + 0.95 * WXI[1]) + WXP[2] + WXP[3] + WXP[4] + WXP[5]);
    WX.fog = WXP[2] * (0.45 + 0.55 * WXI[2]);
    WX.rain = WXP[3] * WXI[3] + WXP[4] * Math.max(0.85, WXI[4]);
    WX.storm = WXP[4];
    WX.snow = WXP[5] * (0.25 + 0.75 * WXI[5]);
    WX.wind = U.clamp(wxWind / 50);
    WX.lean = WX.wind * (0.85 + 0.3 * U.noise1(t * 0.37) + 0.12 * U.noise1(t * 1.3 + 4));
    WX.drift += WX.lean * dt;   // accumulated wind travel, so flakes never jump when the wind changes
    // snow banks up and melts away more slowly than the sky changes
    WX.dust = first ? WX.snow : WX.dust + (WX.snow - WX.dust) * (1 - Math.exp(-dt / 5));
    // a draught gets under the door in a storm or a wind: the candle wavers
    draught = U.clamp(0.7 * U.smoothstep(0.15, 0.9, WX.wind) + 0.45 * WX.storm);
  }

  // drops on the glass: each sits, then runs down in fits and starts, leaving a thin wet trail
  const RUN = 40;
  const RUX = new Float32Array(RUN), RUY = new Float32Array(RUN), RUV = new Float32Array(RUN), RUP = new Float32Array(RUN), RUT = new Float32Array(RUN);
  let runInit = false;
  const rrng = U.rng(9091);
  function runner(i, G, apex, hh, anywhere) {
    RUX[i] = G.x0 + rrng() * G.w; RUY[i] = apex + (anywhere ? rrng() : rrng() * 0.6) * hh;
    RUV[i] = (0.05 + rrng() * 0.1) * H; RUP[i] = rrng() * 2.5; RUT[i] = 0;
  }
  let lnNext = -1, lnT0 = -100, lnD = 0.6;
  const RAIN_CSS = U.rgba(U.safe(C.rain), 1), SNOW_CSS = U.rgba(U.safe(C.snow), 1), SNOW_DAY = "rgb(176,182,198)";
  const lrng = U.rng(5150);

  // the weather that moves in the window: rain outside and on the glass, flakes drifting past, the murk
  // shifting, and in a storm the rare lightning
  function weatherInWindow(ctx, t, dt, a) {
    const G = winGeo(), apex = G.spring - G.w * 0.866, hh = G.sill - apex;
    const rk = U.clamp(WX.rain), sk = U.clamp(WX.snow), fk = WX.fog;
    if (rk > 0.004 || sk > 0.004 || fk > 0.01) {
      ctx.save(); ctx.beginPath(); panes(ctx, G); ctx.clip();
      if (rk > 0.004) {
        // rain falling past: more and longer with the downpour, slanted by the wind
        const slant = 0.08 + 0.55 * WX.lean, n = Math.ceil((RAIN.length / 4) * Math.pow(rk, 1.2)), lk = 0.8 + 0.6 * rk;
        ctx.beginPath();
        for (let j = 0; j < n; j++) {
          const i = j * 4, len = RAIN[i + 3] * H * lk;
          const y = apex + ((RAIN[i + 1] + t * RAIN[i + 2] * (0.8 + 0.4 * rk)) % 1) * (hh + len) - len;
          const x = G.x0 + RAIN[i] * (G.w + slant * hh) - slant * (y - apex);
          ctx.moveTo(x, y); ctx.lineTo(x - len * slant, y + len);
        }
        ctx.lineWidth = 0.9 + 0.4 * DAYK; ctx.strokeStyle = RAIN_CSS; ctx.globalAlpha = (0.2 + 0.16 * rk) * a * (1 + 0.9 * DAYK); ctx.stroke();
        // beads on the glass
        const nb = Math.ceil(BEADS.length / 2 * rk);
        ctx.beginPath();
        for (let j = 0; j < nb; j++) { const bx = G.x0 + BEADS[j * 2] * G.w, by = apex + BEADS[j * 2 + 1] * hh; ctx.moveTo(bx + 1.1, by); ctx.arc(bx, by, 1.1, 0, TAU); }
        ctx.fillStyle = RAIN_CSS; ctx.globalAlpha = 0.3 * a * (1 + 0.6 * DAYK); ctx.fill();
        // runners
        if (!runInit) { for (let i = 0; i < RUN; i++) runner(i, G, apex, hh, true); runInit = true; }
        const nr = Math.ceil(RUN * U.clamp(rk * 1.15));
        ctx.beginPath();
        for (let i = 0; i < nr; i++) {
          if (RUP[i] > 0) { RUP[i] -= dt; RUT[i] = Math.max(0, RUT[i] - 0.004 * H * dt); }
          else {
            const d = RUV[i] * dt;
            RUY[i] += d; RUT[i] = Math.min(0.07 * H, RUT[i] + d); RUX[i] -= d * WX.lean * 0.25;
            if (rrng() < dt * 0.9) RUP[i] = 0.2 + rrng() * 1.4;   // it catches and stops
          }
          if (RUY[i] > G.sill + 2) { runner(i, G, apex, hh, false); continue; }
          if (RUT[i] > 1) { ctx.moveTo(RUX[i], RUY[i] - RUT[i]); ctx.lineTo(RUX[i] + RUT[i] * WX.lean * 0.25, RUY[i]); }
        }
        ctx.lineWidth = 1; ctx.globalAlpha = 0.2 * a; ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < nr; i++) { ctx.moveTo(RUX[i] + 1.7, RUY[i]); ctx.arc(RUX[i], RUY[i], 1.7, 0, TAU); }
        ctx.globalAlpha = 0.5 * a; ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (sk > 0.004) {
        // flakes drifting past, slow, swaying, carried by the wind
        const n = Math.ceil(FLAKES.length / 5 * sk), ww = G.w * 1.3;
        for (let pass = 0; pass < 2; pass++) {
          ctx.beginPath();
          for (let j = pass; j < n; j += 2) {
            const i = j * 5, sp = FLAKES[i + 2];
            const y = apex - 6 + ((FLAKES[i + 1] + t * sp) % 1) * (hh + 12);
            const xo = FLAKES[i] * ww + WX.drift * 0.09 * H * (0.6 + sp * 4) + Math.sin(t * 0.8 + FLAKES[i + 4]) * 0.012 * H;
            const x = G.x0 - G.w * 0.15 + (((xo % ww) + ww) % ww), s = FLAKES[i + 3] * (1 + 0.7 * DAYK);
            ctx.rect(x - s / 2, y - s / 2, s, s);
          }
          ctx.fillStyle = SNOW_CSS; ctx.globalAlpha = (pass ? 0.4 : 0.6) * a; ctx.fill();
          // by day the flakes are pale against a grey sky
          if (DAYK > 0.01) { ctx.fillStyle = SNOW_DAY; ctx.globalAlpha = (pass ? 0.45 : 0.7) * a * DAYK; ctx.fill(); }
        }
        ctx.globalAlpha = 1;
      }
      if (fk > 0.01) {
        // the murk shifts against the glass
        for (let i = 0; i < 3; i++) {
          const u = (t * (0.006 + i * 0.003) + i * 0.37) % 1;
          glowDot(ctx, C.murk, G.x0 - 0.1 * H + u * (G.w + 0.2 * H), apex + hh * (0.35 + 0.22 * i), 0.13 * H, 0.22 * fk * a);
        }
      }
      ctx.restore();
    }
    // a storm: now and then the sky lights the window, the leading glints, and its pattern falls across the desk
    if (WX.storm < 0.02) { lnNext = -1; return 0; }
    if (lnNext < 0) lnNext = t + 2 + lrng() * 5;
    if (t >= lnNext) {
      lnT0 = t; lnNext = t + 9 + lrng() * 17;
      // the thunder, on the flash (the engine lags it by distance x 5 s); a farther strike flashes dimmer
      lnD = 0.35 + 0.55 * Math.random();
      if (a > 0.2) cue("thunder", { distance: lnD, gain: 0.5 + 0.45 * WX.storm * (1.2 - lnD), pan: 0.5 });
    }
    const u = t - lnT0;
    if (u > 1.4) return 0;
    const env = Math.exp(-u * 9) + (u > 0.16 ? 0.75 * Math.exp(-(u - 0.16) * 10) : 0) + (u > 0.45 ? 0.45 * Math.exp(-(u - 0.45) * 8) : 0);
    return U.clamp(env) * WX.storm * a * (1.15 - 0.35 * lnD);
  }

  // ------------------------------------------------------------------ the candle (per frame)
  function wax(ctx, g, a) {
    if (a <= 0.004) return;
    const { x, cw, top, sockTop, p } = g, hw = cw / 2, ry = cw * 0.17, wc = U.safe(C.wax);
    ctx.beginPath(); ctx.moveTo(x - hw, sockTop); ctx.lineTo(x - hw, top);
    ctx.ellipse(x, top, hw, ry, 0, Math.PI, TAU, false); ctx.lineTo(x + hw, sockTop); ctx.closePath();
    ctx.fillStyle = "#000"; ctx.fill();
    // the wax glows faintly where the flame shines down into it, as a turned cylinder
    const gx = ctx.createLinearGradient(x - hw, 0, x + hw, 0);
    gx.addColorStop(0, U.rgba(wc, 0.02 * a)); gx.addColorStop(0.42, U.rgba(wc, 0.11 * a)); gx.addColorStop(1, U.rgba(wc, 0.03 * a));
    ctx.fillStyle = gx; ctx.fill();
    const gy = ctx.createLinearGradient(0, top - ry, 0, top + 0.1 * H);
    gy.addColorStop(0, U.rgba(U.safe(C.candle), 0.2 * a)); gy.addColorStop(1, U.rgba(U.safe(C.candle), 0));
    ctx.fillStyle = gy; ctx.fill();
    ctx.lineWidth = 1.1; ctx.strokeStyle = U.rgba(wc, a * 0.8);
    ctx.beginPath(); ctx.moveTo(x - hw, sockTop); ctx.lineTo(x - hw, top); ctx.moveTo(x + hw, sockTop); ctx.lineTo(x + hw, top); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, top, hw, ry, 0, 0, Math.PI, false); ctx.stroke();
    ctx.strokeStyle = U.rgba(wc, a * 0.4);
    ctx.beginPath(); ctx.ellipse(x, top, hw, ry, 0, Math.PI, TAU, false); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, top + 1, hw * 0.62, ry * 0.5, 0, 0, TAU); ctx.stroke();
    // cylinder shading: hairlines crowding toward the edges
    ctx.lineWidth = 0.8; ctx.strokeStyle = U.rgba(wc, a * 0.22);
    ctx.beginPath();
    for (const f of [0.82, 0.66]) { ctx.moveTo(x - hw * f, top + ry + 3); ctx.lineTo(x - hw * f, sockTop - 2); ctx.moveTo(x + hw * f, top + ry + 3); ctx.lineTo(x + hw * f, sockTop - 2); }
    ctx.stroke();
    // drips: each starts at its own hour and lengthens as the evening goes
    ctx.lineWidth = 1; ctx.strokeStyle = U.rgba(wc, a * 0.7);
    for (const d of DRIPS) {
      if (p <= d.p0) continue;
      const len = Math.min(1, (p - d.p0) * 4) * d.len * H, dx = x + d.u * hw * 0.85, w2 = 0.0028 * H;
      const y0 = top + ry * Math.sqrt(1 - d.u * d.u) * 0.9;
      const yl = Math.min(y0 + len, sockTop - 2);
      ctx.beginPath(); ctx.moveTo(dx - w2, y0); ctx.lineTo(dx - w2, yl - w2); ctx.arc(dx, yl - w2, w2, Math.PI, 0, true); ctx.lineTo(dx + w2, y0); ctx.stroke();
    }
    // spent wax pooled on the dish
    if (p > 0.45) {
      const k = U.smoothstep(0.45, 1, p);
      ctx.beginPath(); ctx.ellipse(x - cw * 0.95, g.dishY - 1, 0.016 * H * k, 0.004 * H * k, 0, 0, TAU);
      ctx.strokeStyle = U.rgba(wc, a * 0.5); ctx.stroke();
    }
  }

  function tear(ctx, x, by, w, tipX, tipY) {
    const h = by - tipY, mx = U.lerp(x, tipX, 0.45);
    ctx.beginPath();
    ctx.moveTo(x, by + w * 0.3);
    ctx.bezierCurveTo(x - w * 1.2, by + w * 0.1, mx - w * 0.8, by - h * 0.55, tipX, tipY);
    ctx.bezierCurveTo(mx + w * 0.8, by - h * 0.55, x + w * 1.2, by + w * 0.1, x, by + w * 0.3);
  }
  function drawFlame(ctx, x, y, hgt, wid, t, k, gut) {
    const n1 = U.noise1(t * 2.1), n2 = U.noise1(t * 5.3 + 7.7), n3 = U.noise1(t * 0.8 + 3.1);
    // a draught (storm, wind) makes it gutter and lean this way and that
    const h = hgt * k * (1 + 0.07 * n1 + 0.035 * n2 + Math.max(gut, draught * 0.6) * 0.14 * U.noise1(t * 9.5 + 1.3));
    const w = wid * (0.45 + 0.55 * k);
    const by = y + w * 0.45, tipX = x + (0.1 * n3 + 0.05 * n2 + draught * 0.2 * U.noise1(t * 1.7 + 21)) * h, tipY = by - h;
    const cc = U.safe(C.core), ca = U.safe(C.candle), cf = U.safe(C.flame);
    tear(ctx, x, by, w, tipX, tipY);
    const gr = ctx.createRadialGradient(x, by - h * 0.2, 0, x, by - h * 0.3, h * 0.8);
    gr.addColorStop(0, U.rgba(cc, 0.95 * k)); gr.addColorStop(0.35, U.rgba(ca, 0.8 * k)); gr.addColorStop(1, U.rgba(cf, 0.28 * k));
    ctx.fillStyle = gr; ctx.fill();
    ctx.lineWidth = 0.9; ctx.strokeStyle = U.rgba(ca, 0.5 * k); ctx.stroke();
    tear(ctx, x, by - w * 0.1, w * 0.48, U.lerp(x, tipX, 0.5), by - h * 0.48);
    ctx.fillStyle = U.rgba(cc, 0.7 * k); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, by - w * 0.05, w * 0.55, w * 0.32, 0, 0, TAU);
    ctx.fillStyle = U.rgba(U.safe(C.blueFoot), 0.25 * k); ctx.fill();
  }

  function smoke(ctx, x, y, t, len, amp, a) {
    if (a <= 0.004) return;
    const c = U.safe(C.smoke), g = ctx.createLinearGradient(x, y, x, y - len);
    g.addColorStop(0, U.rgba(c, a)); g.addColorStop(0.55, U.rgba(c, a * 0.45)); g.addColorStop(1, U.rgba(c, 0));
    ctx.strokeStyle = g; ctx.lineWidth = 1.1;
    for (let s = 0; s < 2; s++) {
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let i = 1; i <= 40; i++) {
        const u = i / 40;
        const dx = (U.noise2(u * 2.2 + s * 4.1, t * 0.25 - u * 0.9) * amp + Math.sin(u * 7 - t * 0.9 + s * 1.7) * amp * 0.35) * Math.pow(u, 1.2);
        ctx.lineTo(x + dx + s * u * 3, y - u * len);
      }
      ctx.stroke();
    }
  }

  function relight(cx, cy, R) {
    const key = `${cx | 0}|${cy | 0}|${R | 0}`;
    if (key === litKey) return;
    litKey = key;
    const c = litL.c;
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, W, H);
    c.drawImage(studyL.cv, 0, 0, W, H);
    c.globalCompositeOperation = "destination-in";
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, R);
    for (let i = 0; i < MS.length; i++) g.addColorStop(MS[i], `rgba(0,0,0,${MA[i]})`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "source-over";
  }

  function drawStudy(ctx, f, b, el, t, S, flameK, lightK, ember, snuff) {
    const g = candleGeo(el), dl = S.daylight;
    // the window carries the sky, whatever the candle is doing
    const winA = U.smoothstep(0.35, 1, b);
    if (winA > 0.004) {
      const elev = dl ? dl.elevation : -20;
      // the baked window follows the sky and the slow parts of the weather (quantised, so it repaints rarely)
      const qc = Math.round(WX.cover * 8), qf = Math.round(WX.fog * 8), qd = Math.round(WX.dust * 8);
      const key = ((Math.round(elev * 2) + 500) * 9 + qc) * 81 + qf * 9 + qd;
      if (key !== winKey) { winKey = key; paintWindow(elev, qc / 8, qf / 8, qd / 8); }
      ctx.globalAlpha = winA * (1 - 0.75 * DAYK); ctx.drawImage(winL.cv, 0, 0, W, H); ctx.globalAlpha = 1;
      const flash = weatherInWindow(ctx, t, Math.min(0.1, f.dt || 0.016), winA);
      if (flash > 0.004) {
        // lightning: the glass lights violet between the leads, the leading glints, the wall catches it,
        // and the pattern of the panes falls faintly across the desk
        const G = winGeo();
        ctx.globalAlpha = 0.12 * flash; ctx.drawImage(paneL.cv, paneL.x, paneL.y, paneL.w, paneL.h);
        ctx.globalAlpha = 0.7 * flash; ctx.drawImage(winL.cv, 0, 0, W, H);
        ctx.globalAlpha = 1;
        glowDot(ctx, C.flash, G.mid, G.spring, 0.5 * H, 0.22 * flash);
        castPanes(ctx, 0.12 * flash);
      }
      // a clear night: moonlight lays the panes faintly across the desk
      castPanes(ctx, 0.05 * (1 - WX.cover) * (1 - U.smoothstep(-10, -4, elev)) * winA);
    }
    const gut = U.smoothstep(0.85, 1, g.p);
    const fl = 0.93 + 0.045 * U.noise1(t * 1.9) + 0.025 * U.noise1(t * 4.7 + 9.1) + gut * 0.05 * U.noise1(t * 8.3 + 2)
      + draught * 0.04 * U.noise1(t * 6.3 + 4.4);
    const R = H * U.lerp(1.0, 0.5, g.p) * (0.12 + 0.88 * lightK);
    LIT.x = g.x; LIT.y = g.fy; LIT.R = R; LIT.k = lightK * fl;
    if (lightK > 0.003) {
      const pr = R * 0.9, cc = U.safe(C.candle);
      const pg = ctx.createRadialGradient(g.x, g.fy, 0, g.x, g.fy, pr);
      pg.addColorStop(0, U.rgba(cc, 0.1 * lightK * fl)); pg.addColorStop(0.2, U.rgba(cc, 0.045 * lightK * fl));
      pg.addColorStop(0.55, U.rgba(cc, 0.014 * lightK)); pg.addColorStop(1, U.rgba(cc, 0));
      ctx.fillStyle = pg; ctx.fillRect(g.x - pr, g.fy - pr, pr * 2, pr * 2);
      relight(g.x, g.fy, R);
      ctx.globalAlpha = U.clamp(lightK * fl); ctx.drawImage(litL.cv, 0, 0, W, H); ctx.globalAlpha = 1;
      wax(ctx, g, 0.85 * Math.sqrt(lightK) * fl);
    }
    // wick, and its ember when the flame is not quite there
    const wa = Math.max(lightK, ember);
    if (wa > 0.004) {
      ctx.beginPath(); ctx.moveTo(g.x, g.top); ctx.quadraticCurveTo(g.x + 0.001 * H, g.top - 0.008 * H, g.x + 0.003 * H, g.wickTip);
      ctx.lineWidth = 1.3; ctx.strokeStyle = U.rgba(U.safe(C.brown), 0.7 * wa); ctx.stroke();
    }
    if (ember > 0.004) {
      glowDot(ctx, C.flame, g.x + 0.003 * H, g.wickTip, 0.014 * H, ember * (0.8 + 0.2 * U.noise1(t * 6)));
      ctx.beginPath(); ctx.arc(g.x + 0.003 * H, g.wickTip, 1.6, 0, TAU); ctx.fillStyle = U.rgba(U.safe(C.flame), 0.9 * ember); ctx.fill();
    }
    if (flameK > 0.003) {
      glowDot(ctx, C.candle, g.x, g.fy, 0.2 * H * (0.5 + 0.5 * flameK), 0.42 * flameK * fl);
      glowDot(ctx, C.core, g.x, g.fy + 0.006 * H, 0.055 * H, 0.55 * flameK);
      drawFlame(ctx, g.x + 0.002 * H, g.wickTip, 0.07 * H * (1 - 0.3 * gut), 0.0115 * H, t, flameK, gut);
    }
    // now and then a thread of smoke leaves the flame; a snuffed wick gives a fuller wisp
    const ph = (t % 53) / 13;
    const curl = ph < 1 ? Math.sin(Math.PI * ph) : 0;
    smoke(ctx, g.x + 0.002 * H, g.wickTip - 0.07 * H * flameK, t, 0.18 * H, 0.02 * H, 0.14 * curl * flameK * lightK);
    smoke(ctx, g.x + 0.003 * H, g.wickTip, t, 0.26 * H, 0.03 * H, 0.32 * snuff);
  }

  // ------------------------------------------------------------------ the page (work)
  function pageGeo() {
    return {
      x0: 0.04 * W, x1: 0.96 * W, y0: 0.045 * H, y1: 0.955 * H, top: 0.1 * H, band: 0.875 * H,
      l1: 0.128 * W, l2: 0.136 * W, r1: 0.708 * W, r2: 0.716 * W,
      tx: 0.17 * W, mx: 0.758 * W, mr: 0.935 * W,
    };
  }

  // hairline ruling; as it fades each rule retracts toward its middle
  function drawRules(ctx, P, a) {
    if (a <= 0.004) return;
    const k = U.easeOut(a), c = U.safe(C.inkDim);
    ctx.beginPath();
    for (const x of [P.l1, P.l2, P.r1, P.r2]) { const m = (P.y0 + P.y1) / 2, h = (P.y1 - P.y0) / 2 * k; ctx.moveTo(x, m - h); ctx.lineTo(x, m + h); }
    { const m = (P.x0 + P.x1) / 2, h = (P.x1 - P.x0) / 2 * k; ctx.moveTo(m - h, P.top); ctx.lineTo(m + h, P.top); }
    ctx.lineWidth = 1; ctx.strokeStyle = U.rgba(c, 0.2 * a); ctx.stroke();
  }

  let hoursKey = "", HOURS = null;
  function canonical(dl) {
    const key = dl.sunrise.getTime() + "|" + dl.sunset.getTime();
    if (key === hoursKey) return HOURS;
    hoursKey = key;
    const rise = dl.sunrise.getTime(), set = dl.sunset.getTime(), T = (set - rise) / 12, HR = 3600000;
    // the offices on unequal (temporal) hours: Prime at sunrise, Sext at solar noon, None at the ninth hour
    HOURS = [
      ["Matins", rise - 2 * HR], ["Lauds", rise - 0.75 * HR], ["Prime", rise], ["Terce", rise + 3 * T],
      ["Sext", rise + 6 * T], ["None", rise + 9 * T], ["Vespers", rise + 11 * T], ["Compline", set + 1.5 * HR],
    ];
    HOURS.t0 = HOURS[0][1] - 0.6 * HR; HOURS.t1 = HOURS[7][1] + 0.6 * HR;
    return HOURS;
  }

  function sunMark(ctx, x, y, r, a) {
    const c = U.safe(C.gilt);
    glowDot(ctx, C.gilt, x, y, r * 4, a * 0.5);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = "#000"; ctx.fill();
    ctx.lineWidth = 1.3; ctx.strokeStyle = U.rgba(c, a); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, TAU); ctx.fillStyle = U.rgba(c, a * 0.85); ctx.fill();
    // alternating straight and flame-like rays, as suns are drawn in the margins
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const q = i / 12 * TAU, r0 = r * 1.4, r1 = r * (i % 2 ? 1.95 : 2.4);
      const cx = Math.cos(q), sy = Math.sin(q);
      if (i % 2) { ctx.moveTo(x + cx * r0, y + sy * r0); ctx.lineTo(x + cx * r1, y + sy * r1); }
      else {
        const qn = q + 0.22;
        ctx.moveTo(x + cx * r0, y + sy * r0);
        ctx.quadraticCurveTo(x + Math.cos(qn) * r * 1.9, y + Math.sin(qn) * r * 1.9, x + cx * r1, y + sy * r1);
      }
    }
    ctx.lineWidth = 1; ctx.strokeStyle = U.rgba(c, a * 0.8); ctx.stroke();
  }

  // the bottom rule of the page is the day: the canonical hours on it, the sun riding it
  function drawHours(ctx, f, P, a) {
    const dl = f.signals.daylight;
    if (!dl || !dl.sunrise || !dl.sunset || a <= 0.004) return;
    const HS = canonical(dl), now = f.now.getTime();
    const xAt = (tm) => P.x0 + U.clamp((tm - HS.t0) / (HS.t1 - HS.t0)) * (P.x1 - P.x0);
    const y = P.band, k = U.easeOut(a), mid = (P.x0 + P.x1) / 2, half = (P.x1 - P.x0) / 2 * k;
    const ci = U.safe(C.inkDim), cm = U.safe(C.inkMid), cg = U.safe(C.gilt);
    const clipL = mid - half, clipR = mid + half;
    const seg = (x0, x1, col, al, lw, dash) => {
      x0 = Math.max(x0, clipL); x1 = Math.min(x1, clipR);
      if (x1 <= x0) return;
      ctx.setLineDash(dash || SOLID);
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y);
      if (lw > 1.4) { ctx.lineWidth = lw * 3; ctx.strokeStyle = U.rgba(col, al * 0.14); ctx.stroke(); }
      ctx.lineWidth = lw; ctx.strokeStyle = U.rgba(col, al); ctx.stroke();
      ctx.setLineDash(SOLID);
    };
    const xr = xAt(dl.sunrise.getTime()), xs = xAt(dl.sunset.getTime()), xn = xAt(now);
    seg(P.x0, xr, ci, 0.3 * a, 1, DOTTED);
    seg(xs, P.x1, ci, 0.3 * a, 1, DOTTED);
    seg(xr, xs, cm, 0.42 * a, 1.1);
    if (dl.isDay) seg(Math.max(xn, xr), xs, cg, 0.75 * a, 2);
    // the offices: a tick and a faint small-caps name; the one we are in is gilt
    const lp = Math.max(11, 0.0155 * H);
    let cur = -1;
    for (let i = 0; i < HS.length; i++) if (now >= HS[i][1]) cur = i;
    ctx.beginPath();
    for (let i = 0; i < HS.length; i++) {
      const x = xAt(HS[i][1]);
      if (x < clipL || x > clipR) continue;
      const tk = i === 4 ? 0.012 * H : 0.008 * H;
      ctx.moveTo(x, y - tk); ctx.lineTo(x, y + tk);
    }
    ctx.lineWidth = 1; ctx.strokeStyle = U.rgba(cm, 0.55 * a); ctx.stroke();
    const sunY = y, sunX = xn;
    let lastR = -1e9;
    for (let i = 0; i < HS.length; i++) {
      const x = xAt(HS[i][1]);
      if (x < clipL || x > clipR) continue;
      const on = i === cur;
      // on a narrow wall Lauds and Prime crowd each other: skip a name that would touch the last one
      const lo = { px: lp, caps: true, spacing: 0.12, color: C.inkDim, glow: 0, core: 0.9 };
      const hw = sprite(HS[i][0], lo).tw / 2 + lp * 0.4;
      const nextOn = i + 1 === cur && i + 1 < HS.length && xAt(HS[i + 1][1]) - x < hw * 2;
      if (x - hw < lastR || nextOn) continue;
      lastR = x + hw;
      text(ctx, HS[i][0], x, y + 0.03 * H, { px: lp, caps: true, spacing: 0.12, color: on ? C.gilt : C.inkDim, glow: on ? 3 : 0, core: 0.9 }, "center", 1, a * (on ? 0.8 : 0.5));
    }
    // the sun (or a crescent, out of hours), and the light that is left
    const inBand = now > HS.t0 && now < HS.t1;
    if (inBand && sunX >= clipL && sunX <= clipR) {
      const r = 0.0085 * H;
      if (dl.isDay) sunMark(ctx, sunX, sunY, r, a);
      else {
        const cc = U.safe(C.inkMid);
        ctx.beginPath(); ctx.arc(sunX, sunY, r, 0.6, TAU - 0.6, false); ctx.arc(sunX + r * 0.55, sunY, r * 0.8, TAU - 0.9, 0.9, true);
        ctx.closePath(); ctx.fillStyle = "#000"; ctx.fill(); ctx.lineWidth = 1.1; ctx.strokeStyle = U.rgba(cc, 0.8 * a); ctx.stroke();
      }
    }
    let msg = null;
    if (dl.isDay && dl.lightLeftMin != null) msg = `${U.fmtMinutes(dl.lightLeftMin)} of light left`;
    else if (now < dl.sunrise.getTime()) msg = `sunrise in ${U.fmtMinutes((dl.sunrise.getTime() - now) / 60000)}`;
    else msg = `night  ·  sunrise ${U.fmtTime(new Date(dl.sunrise.getTime() + 86400000))}`;
    const mo = { px: 0.028 * H, style: "italic", color: dl.isDay ? C.gilt : C.inkMid, glow: 5, core: 0.9 };
    const mw = sprite(msg, mo).tw;
    const ax = U.clamp(sunX, P.x0, P.x1);
    const right = ax + 0.016 * H + mw > P.x1;
    text(ctx, msg, right ? ax - 0.016 * H : ax + 0.016 * H, y - 0.034 * H, mo, right ? "right" : "left", 1, a * 0.9);
  }

  function drawClock(ctx, f, b, P, aOrn, flick) {
    const now = f.now;
    const str = U.fmtTime(now, { hour24: !AW.config.clock || AW.config.clock.hour24 !== false });
    const d0 = str[0], rest = str.slice(1);
    const wA = fade(b, 0.22, 0.66), aA = U.smoothstep(0.38, 0.88, b);
    const e = U.easeInOut(U.smoothstep(0.1, 0.9, b));
    const orn = initial(d0);
    const restO = { px: CK.px, color: aged(C.ink, wA), glow: 10, core: 0.9 };
    const d0O = { px: CK.px, color: aged(C.gilt, wA), glow: 12, core: 0.9 };
    const restW = sprite(rest, restO).tw;
    // as it travels, the initial's box and gap close up to the plain figure, so the work letters land
    // exactly on the ambient lettering and the crossfade reads as a change of ink, not a double image
    const boxW = U.lerp(orn.bw, sprite(d0, d0O).tw, e), gap = CK.px * 0.07 * (1 - e);
    const left = P.tx, cy = 0.3 * H;
    const GW = boxW + gap + restW, gcx = left + GW / 2;
    const pxA = Math.round(0.115 * H), oA = { px: pxA, color: C.gilt, glow: 9, core: 0.9 };
    const acx = X(0.19), acy = Y(0.2);
    const k = U.lerp(1, pxA / CK.px, e);
    const cx = U.lerp(gcx, acx, e), y = U.lerp(cy, acy, e);
    const lx = cx + (left - gcx) * k;
    if (aOrn > 0.004) {
      ctx.globalAlpha = U.clamp(aOrn);
      ctx.drawImage(orn.cv, lx + (boxW - orn.bw) * k / 2 - orn.ax * k, y - orn.ay * k, orn.w * k, orn.h * k);
      ctx.globalAlpha = 1;
    }
    // the illuminated figure in gilt, the rest in ink
    text(ctx, d0, lx + boxW * k / 2, y, d0O, "center", k, wA * 0.95);
    text(ctx, rest, lx + (boxW + gap) * k, y, restO, "left", k, wA);
    // ambient: gilt lettering on the wall above the desk, breathing a little with the flame
    text(ctx, str, cx, y, oA, "center", CK.px * k / pxA, aA * 0.82 * flick);
    // an engraved gilt rule with a lozenge under it, like the plate on a library case
    if (aA > 0.004) {
      const ry = acy + 0.072 * H, rw = 0.13 * H * U.easeOut(aA), d = 0.006 * H, c = U.safe(C.giltDim);
      ctx.beginPath();
      ctx.moveTo(acx - rw, ry); ctx.lineTo(acx - d * 2.2, ry); ctx.moveTo(acx + d * 2.2, ry); ctx.lineTo(acx + rw, ry);
      ctx.moveTo(acx - d * 1.6, ry); ctx.lineTo(acx, ry - d); ctx.lineTo(acx + d * 1.6, ry); ctx.lineTo(acx, ry + d); ctx.closePath();
      ctx.lineWidth = 1; ctx.strokeStyle = U.rgba(c, 0.5 * aA * flick); ctx.stroke();
    }
    return { acx, acy, aA };
  }

  function drawDate(ctx, f, P, a) {
    if (a <= 0.004) return;
    const d = f.now;
    const s = `${DAYS[d.getDay()]}, the ${ORD[d.getDate()]} of ${MONTHS[d.getMonth()]}`;
    text(ctx, s, P.tx, 0.505 * H + (1 - a) * 0.012 * H, { px: 0.031 * H, caps: true, spacing: 0.06, color: aged(C.inkMid, a), glow: 4, core: 0.9 }, "left", 1, a * 0.9);
  }

  function drawCalendar(ctx, f, P, a, clk) {
    const next = f.signals.calendar && f.signals.calendar.next;
    if (!next) return;
    const mins = next.minutesUntil, soon = U.smoothstep(15, 3, mins);
    const cd = mins < 1 ? "now" : `in ${U.fmtMinutes(mins)}`;
    if (a > 0.004) {
      const y = 0.615 * H + (1 - a) * 0.012 * H;
      const beat = soon > 0 ? 0.85 + 0.15 * Math.sin(f.t * 2.4) : 1;
      text(ctx, "¶", P.tx, y + 0.002 * H, { px: 0.058 * H, color: aged(C.rubric, a), glow: 6, core: 0.92 }, "left", 1, a * beat);
      const x1 = P.tx + 0.048 * H;
      const tw = text(ctx, String(next.title), x1, y, { px: 0.05 * H, caps: true, spacing: 0.05, color: aged(C.ink, a), glow: 7, core: 0.9 }, "left", 1, a);
      text(ctx, cd, x1 + tw + 0.024 * H, y + 0.003 * H,
        { px: 0.044 * H, style: "italic", color: aged(soon > 0.5 ? C.gilt : C.inkMid, a), glow: 6, core: 0.9 }, "left", 1, a);
    }
    // ambient: a single whisper under the gilt clock, only when it is close
    if (mins < 30 && clk.aA > 0.004) {
      text(ctx, `${next.title}  ·  ${cd}`, clk.acx, clk.acy + 0.112 * H,
        { px: 0.026 * H, style: "italic", color: C.giltDim, glow: 4, core: 0.85 }, "center", 1, clk.aA * 0.55);
    }
  }

  function drawWeather(ctx, f, P, a) {
    const wx = f.signals.weather;
    if (!wx || !wx.actionable || a <= 0.004) return;
    const s = wx.tempC != null ? `${wx.actionable}  ·  ${Math.round(wx.tempC)}°` : wx.actionable;
    text(ctx, s, P.tx + 0.048 * H, 0.69 * H + (1 - a) * 0.012 * H, { px: 0.032 * H, style: "italic", color: aged(C.inkDim, a), glow: 4, core: 0.92 }, "left", 1, a * 0.9);
  }

  // News: a gloss in the main column under the calendar entry, the way a scribe adds a note: the headline
  // in the book hand, the attribution in a small italic, a gilt lozenge in the column's margin. Critical is
  // rubricated: red ochre, a slow pulse, and the lozenge becomes a red seal that breathes.
  function drawNews(ctx, f, P, a, clk) {
    const n = f.signals.news;
    if (!n || !n.headline) return;
    const crit = !!n.critical, pulse = crit ? 0.5 + 0.5 * Math.sin(f.t * TAU / 3.6) : 0;
    if (a > 0.004) {
      const x = P.tx + 0.048 * H, y0 = 0.745 * H + (1 - a) * 0.012 * H, lh = 0.032 * H;
      const ho = { px: 0.027 * H, color: aged(crit ? C.alarm : C.inkMid, a), glow: crit ? 6 : 4, core: 0.9 };
      const lines = newsLines(String(n.headline), ho, P.r1 - 0.03 * W - x);
      const ha = a * (crit ? 0.74 + 0.26 * pulse : 0.88);
      for (let i = 0; i < lines.length; i++) text(ctx, lines[i], x, y0 + i * lh, ho, "left", 1, ha);
      // the mark, hung in the margin of the column like the calendar's pilcrow
      const mx = P.tx + 0.02 * H, d = 0.0062 * H, c = U.safe(crit ? C.rubric : C.giltDim);
      if (crit) glowDot(ctx, C.alarm, mx, y0, 0.032 * H, a * (0.3 + 0.3 * pulse));
      ctx.beginPath(); ctx.moveTo(mx, y0 - d * 1.4); ctx.lineTo(mx + d, y0); ctx.lineTo(mx, y0 + d * 1.4); ctx.lineTo(mx - d, y0); ctx.closePath();
      if (crit) { ctx.fillStyle = U.rgba(c, a * (0.5 + 0.35 * pulse)); ctx.fill(); }
      ctx.lineWidth = 1.1; ctx.strokeStyle = U.rgba(c, a * 0.8); ctx.stroke();
      const age = newsAge(n.published, f.now), src = n.source ? String(n.source) : "";
      const at = src + (src && age ? "  ·  " : "") + (age || "");
      if (at) {
        text(ctx, at, x, y0 + (lines.length - 1) * lh + 0.029 * H,
          { px: 0.021 * H, style: "italic", color: aged(crit ? C.rubric : C.inkDim, a), glow: 2, core: 0.9 }, "left", 1, a * (crit ? 0.85 : 0.75));
      }
    }
    // ambient: a critical item whispers once under the gilt clock, faint and warm red
    if (crit && clk.aA > 0.004) {
      const next = f.signals.calendar && f.signals.calendar.next;
      const dy = next && next.minutesUntil < 30 ? 0.152 : 0.112;
      const wo = { px: 0.023 * H, style: "italic", color: C.warmRed, glow: 3, core: 0.82 };
      text(ctx, newsWhisper(String(n.headline), wo, 0.32 * W), clk.acx, clk.acy + dy * H, wo, "center", 1, clk.aA * (0.26 + 0.08 * pulse));
    }
  }

  // Now playing. Work: a marginal note in the right column under the ledger, the line in the book's italic,
  // the album art as a small dim miniature before it, the column's hairline under it with the played part
  // inked and a gilt lozenge at the head; paused = a pause mark hung in the margin and the note dimmed.
  // Ambient: the same line written by hand on a card lying on the desk in front of the open book, faint,
  // catching the candle (by day, ink on a pale card).
  function pauseMark(ctx, x, y, h, col, a) {
    if (a <= 0.004) return;
    const w = h * 0.3, g = h * 0.28;
    ctx.globalAlpha = U.clamp(a); ctx.fillStyle = U.rgba(U.safe(col), 1);
    ctx.fillRect(x, y - h / 2, w, h); ctx.fillRect(x + w + g, y - h / 2, w, h);
    ctx.globalAlpha = 1;
  }
  const CARD_INK = U.hex("#2e2216");   // iron-gall ink on the card by day
  function drawNowPlaying(ctx, f, P, a, aAmb) {
    const np = hasTrack(f.signals.nowPlaying) ? f.signals.nowPlaying : null;
    if (!np) return;
    const paused = !np.isPlaying;
    if (a > 0.004) {
      const y = 0.772 * H + (1 - a) * 0.012 * H, pa = a * (paused ? 0.55 : 1);
      const o = { px: 0.025 * H, style: "italic", color: aged(C.inkMid, a), glow: 3, core: 0.9 };
      const as = Math.round(0.038 * H), th = artThumb(np.art, as);
      const x = th ? P.mx + as + 0.012 * H : P.mx;
      text(ctx, npText("work", np, o, P.mr - x), x, y, o, "left", 1, pa * 0.9);
      if (th) {
        ctx.globalAlpha = pa * 0.5; ctx.drawImage(th, P.mx, y - as / 2, as, as);
        ctx.strokeStyle = U.rgba(U.safe(C.giltDim), 1); ctx.lineWidth = 1;
        ctx.strokeRect(P.mx - 1.5, y - as / 2 - 1.5, as + 3, as + 3);
        ctx.globalAlpha = 1;
      }
      if (paused) pauseMark(ctx, P.mx - 0.03 * H, y, 0.018 * H, C.inkDim, a * 0.85);
      const dur = np.durationMs, pr = np.progressMs;
      if (pr != null && dur != null && dur > 0) {
        const ry = y + 0.03 * H, xe = U.lerp(P.mx, P.mr, U.clamp(pr / dur)), d = 0.0045 * H;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(P.mx, ry); ctx.lineTo(P.mr, ry); ctx.strokeStyle = U.rgba(U.safe(C.inkDim), 0.35 * pa); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(P.mx, ry); ctx.lineTo(xe, ry); ctx.strokeStyle = U.rgba(U.safe(C.inkMid), 0.75 * pa); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xe, ry - d * 1.3); ctx.lineTo(xe + d, ry); ctx.lineTo(xe, ry + d * 1.3); ctx.lineTo(xe - d, ry); ctx.closePath();
        ctx.fillStyle = "#000"; ctx.fill(); ctx.strokeStyle = U.rgba(U.safe(C.gilt), 0.85 * pa); ctx.stroke();
      }
    }
    if (aAmb > 0.004) {
      // the card: left edge fixed beside the ribbon, as wide as the line needs
      const oN = { px: 0.021 * H, style: "italic", color: C.paper, glow: 2, core: 0.85 };
      const str = npText("amb", np, oN, 0.3 * H), tw = sprite(str, oN).tw;
      const cw = tw + 0.036 * H, ch = 0.036 * H, cx = X(0.268) + cw / 2, cy = Y(0.847);
      const lit = LIT.k * falloff(Math.hypot(cx - LIT.x, cy - LIT.y) / LIT.R);
      const ka = aAmb * (paused ? 0.6 : 1), night = 1 - DAYK;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.028);
      ctx.beginPath(); ctx.rect(-cw / 2, -ch / 2, cw, ch);
      ctx.globalAlpha = U.clamp(aAmb); ctx.fillStyle = "#000"; ctx.fill();
      if (DAYK > 0.004) {
        ctx.globalAlpha = U.clamp(aAmb * DAYK); ctx.fillStyle = U.rgba(capC(U.scale(MATC.paper, ROOM_FILL * 1.25)), 1); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
      ctx.strokeStyle = U.rgba(U.safe(C.paper), aAmb * (0.22 + 0.25 * lit) * night + aAmb * 0.3 * DAYK); ctx.stroke();
      // an index card's red rule along the top
      ctx.beginPath(); ctx.moveTo(-cw / 2 + 2, -ch * 0.3); ctx.lineTo(cw / 2 - 2, -ch * 0.3);
      ctx.strokeStyle = U.rgba(U.safe(C.oxblood), aAmb * (0.25 * night + 0.35 * DAYK)); ctx.stroke();
      const tx = -cw / 2 + 0.018 * H, ty = ch * 0.08;
      if (night > 0.004) text(ctx, str, tx, ty, oN, "left", 1, ka * night * (0.45 + 0.3 * lit));
      if (DAYK > 0.004) text(ctx, str, tx, ty, { px: 0.021 * H, style: "italic", color: CARD_INK, glow: 0, core: 0.9 }, "left", 1, ka * DAYK * 0.9);
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }

  const agoH = (d, now) => {
    const h = (now - d) / 3600000;
    return h >= 1 && h < 48 ? `${Math.round(h)} h ago` : U.fmtAgo(d, now);
  };
  function drawLedger(ctx, f, P, a) {
    const fin = f.signals.finances;
    if (!fin || a <= 0.004 || fin.income == null || fin.spent == null) return;
    const mood = fin.mood || "calm", warn = mood === "warning", drift = mood === "drift";
    const pulse = warn ? 0.78 + 0.22 * Math.sin(f.t * 2.2) : 1;
    const moodC = warn ? C.alarm : drift ? C.gilt : C.ink;
    const sk = (1 - a) * 0.012 * H, x0 = P.mx, x1 = P.mr, lp = 0.027 * H;
    const lab = { px: lp, style: "italic", color: aged(C.inkDim, a), glow: 3, core: 0.92 };
    const fig = { px: lp, color: aged(C.inkMid, a), glow: 4, core: 0.9 };
    text(ctx, MONTHS[f.now.getMonth()], x0, 0.465 * H + sk, { px: 0.019 * H, caps: true, spacing: 0.2, color: aged(C.inkDim, a), glow: 2, core: 0.9 }, "left", 1, a * 0.8);
    text(ctx, "made", x0, 0.515 * H + sk, lab, "left", 1, a * 0.85);
    text(ctx, U.fmtMoney(fin.income), x1, 0.515 * H + sk, fig, "right", 1, a * 0.9);
    text(ctx, "spent", x0, 0.56 * H + sk, lab, "left", 1, a * 0.85);
    text(ctx, U.fmtMoney(fin.spent), x1, 0.56 * H + sk, warn ? { px: lp, color: aged(C.alarm, a), glow: 5, core: 0.9 } : fig, "right", 1, a * (warn ? pulse : 0.9));
    // a single rule above the sum, the accountant's double rule beneath it
    const cr = U.safe(C.inkDim), rx0 = x0 + (x1 - x0) * 0.42;
    ctx.beginPath();
    ctx.moveTo(rx0, 0.586 * H + sk); ctx.lineTo(x1, 0.586 * H + sk);
    ctx.moveTo(rx0, 0.66 * H + sk); ctx.lineTo(x1, 0.66 * H + sk);
    ctx.moveTo(rx0, 0.666 * H + sk); ctx.lineTo(x1, 0.666 * H + sk);
    ctx.lineWidth = 1; ctx.strokeStyle = U.rgba(cr, 0.6 * a); ctx.stroke();
    const net = fin.net != null ? fin.net : fin.income - fin.spent;
    text(ctx, "net", x0, 0.623 * H + sk, lab, "left", 1, a * 0.85);
    text(ctx, U.fmtMoney(net, { sign: true }), x1, 0.623 * H + sk, { px: 0.042 * H, color: aged(moodC, a), glow: warn ? 10 : 7, core: 0.92 }, "right", 1, a * pulse);
    if (fin.lastUpdated) {
      text(ctx, `entered ${agoH(fin.lastUpdated, f.now)}`, x1, 0.695 * H + sk, { px: 0.019 * H, style: "italic", color: aged(C.inkDim, a), glow: 2, core: 0.9 }, "right", 1, a * 0.7);
    }
  }

  function wobble(ctx, x, y, rx, ry, amp, n, ph) {
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const q = i / 72 * TAU, k = 1 + amp * (0.6 * Math.sin(q * n + ph) + 0.4 * Math.sin(q * (n + 3) + ph * 2.1));
      const px = x + Math.cos(q) * rx * k, py = y + Math.sin(q) * ry * k;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  // work: a marginal roundel with the host's initial; down = a red-ochre wax seal that keeps flaring
  function roundel(ctx, x, y, r, a, letter, t, down) {
    const col = down ? C.alarm : C.inkMid, c = U.safe(col);
    if (down) {
      const ph = (t % 1.8) / 1.8;
      ctx.beginPath(); ctx.arc(x, y, r * (1.2 + ph * 1.9), 0, TAU);
      ctx.lineWidth = 1.3; ctx.strokeStyle = U.rgba(c, a * 0.55 * (1 - ph)); ctx.stroke();
      glowDot(ctx, C.alarm, x, y, r * 3.4, a * (0.4 + 0.15 * Math.sin(t * 3.4)));
      wobble(ctx, x, y, r * 1.1, r * 1.1, 0.06, 9, 0.7);
      ctx.fillStyle = U.rgba(c, a * 0.22); ctx.fill();
      ctx.lineWidth = 1.3; ctx.strokeStyle = U.rgba(c, a * 0.9); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      ctx.lineWidth = 4; ctx.strokeStyle = U.rgba(c, a * 0.1); ctx.stroke();
      ctx.lineWidth = 1.2; ctx.strokeStyle = U.rgba(c, a * 0.8); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, r * 0.74, 0, TAU); ctx.lineWidth = 1; ctx.strokeStyle = U.rgba(c, a * 0.4); ctx.stroke();
    ctx.fillStyle = U.rgba(c, a * 0.5);
    for (let i = 0; i < 12; i++) { const q = i / 12 * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(q) * r * 0.87, y + Math.sin(q) * r * 0.87, 0.9, 0, TAU); ctx.fill(); }
    text(ctx, letter, x, y + r * 0.03, { px: Math.round(r * 0.95), color: col, glow: 3, core: 0.92 }, "center", 1, a * 0.95);
  }
  // ambient: a wax seal lying on the desk, seen at a slant, lit by the candle
  function waxSeal(ctx, x, y, r, a, down, t, seed) {
    const c = U.safe(down ? C.warmRed : C.oxblood);
    if (down) glowDot(ctx, C.warmRed, x, y, r * 5, (0.5 + 0.35 * Math.sin(t * 1.7)) * Math.min(1, a * 1.6));
    wobble(ctx, x, y, r, r * 0.48, 0.07, 7, seed);
    ctx.fillStyle = U.rgba(c, a * 0.25); ctx.fill();
    ctx.lineWidth = 1.1; ctx.strokeStyle = U.rgba(c, a * 0.85); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.58, r * 0.27, 0, 0, TAU); ctx.lineWidth = 0.9; ctx.strokeStyle = U.rgba(c, a * 0.5); ctx.stroke();
    // the glint where the flame catches the raised rim
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.86, r * 0.4, 0, -2.6, -1.7);
    ctx.lineWidth = 1.1; ctx.strokeStyle = U.rgba(U.safe(C.candle), a * 0.5); ctx.stroke();
  }

  function drawHosts(ctx, f, b, P, aTxt) {
    const hb = Array.isArray(f.signals.heartbeat) ? f.signals.heartbeat : [];
    const n = hb.length;
    if (!n) return;
    const t = f.t, now = f.now;
    const e = U.easeInOut(U.smoothstep(0.12, 0.85, b)), k = U.smoothstep(0.3, 0.8, b);
    const lp = Math.max(12, 0.0165 * H);
    for (let i = 0; i < n; i++) {
      const h = hb[i], down = !h.up;
      const wx = (P.mx + P.mr) / 2 + (i - (n - 1) / 2) * 0.075 * W, wy = 0.2 * H;
      const ax = X(0.085) + i * 0.065 * H, ay = Y(0.85);
      // drift down into the room on a gentle arc
      const x = U.lerp(wx, ax, e), y = U.lerp(wy, ay, e) - Math.sin(Math.PI * e) * 0.05 * H;
      const name = String(h.host);
      if (k < 0.996) {
        roundel(ctx, x, y, 0.024 * H * U.lerp(1, 0.75, e), (1 - k) * (down ? 1 : 0.85), name.charAt(0).toUpperCase(), t + i * 1.3, down);
      }
      if (aTxt > 0.004) {
        const ly = wy + 0.024 * H + lp * 1.1;
        text(ctx, name, wx, ly, { px: lp, caps: true, spacing: 0.14, color: aged(down ? C.alarm : C.inkDim, aTxt), glow: down ? 5 : 2, core: 0.9 }, "center", 1, aTxt * (down ? 1 : 0.8));
        if (down) {
          const since = h.downSince ? `down ${U.fmtMinutes((now - h.downSince) / 60000)}` : "down";
          text(ctx, since, wx, ly + lp * 1.35, { px: lp * 1.1, style: "italic", color: aged(C.alarm, aTxt), glow: 5, core: 0.92 }, "center", 1, aTxt);
        }
      }
      if (k > 0.004) {
        const lit = LIT.k * falloff(Math.hypot(x - LIT.x, y - LIT.y) / LIT.R);
        const breathe = 0.85 + 0.15 * Math.sin(t * TAU / 9 + i * 2);
        const a = k * (down ? 0.85 : Math.max(0.16 * breathe, Math.min(0.85, lit * 1.4), 0.6 * DAYK));
        waxSeal(ctx, x, y, 0.019 * H, a, down, t + i, i * 1.9 + 0.4);
        if (down) {
          text(ctx, name, x, y + 0.03 * H, { px: 0.019 * H, style: "italic", color: C.warmRed, glow: 4, core: 0.85 }, "center", 1, k * (0.4 + 0.15 * Math.sin(t * 1.7)));
        }
      }
    }
  }

  // ------------------------------------------------------------------ the study by day
  // By day the room is lit from the window: warm plaster, oak panelling, the books in their real cloth
  // (oxblood, bottle green, navy, brown) with gilt bands, brass, parchment. The window shows the real sky;
  // when the sun is out it throws a beam through the leaded lights, with the lattice laid across the desk and
  // the books (short and pale at noon, long and gold toward evening) and dust turning in it. The candle
  // stands unlit with a thin wick; dusk lights it and hands over to the night study.
  // The room is baked once (full colour) and re-tinted offscreen only when its finely quantised light changes;
  // the sky, the beam and the motes are live. Large fills are laid down at <= 0.4 (rule 2).
  const ROOM_FILL = 0.38;          // the room: a little under the 0.4 large-fill ceiling
  const WIN_FILL = 0.7;            // the sky in the glass: a small, bright element
  const MATC = {
    oxblood: U.hex("#8c2e24"), green: U.hex("#22603e"), brown: U.hex("#7c5634"), navy: U.hex("#2a3a72"),
    brass: U.hex("#b48c44"), paper: U.hex("#c8b48c"),
  };
  const DCOL = {
    wall: U.hex("#8c6e52"), wallLit: U.hex("#b08a66"), wallDark: U.hex("#4c3a2c"),
    panel: U.hex("#5c4030"), panelLit: U.hex("#7c5a40"), panelDark: U.hex("#2c1e16"),
    stone: U.hex("#9a8c74"), stoneLit: U.hex("#b8a888"), reveal: U.hex("#7a6c58"), lead: U.hex("#1c1a1a"),
    desk: U.hex("#8e6440"), deskLit: U.hex("#a8784c"), deskDark: U.hex("#5a3c24"), apron: U.hex("#4c3220"),
    wax: U.hex("#d2c098"), waxShade: U.hex("#8c7c60"), wick: U.hex("#1c1814"),
    sun: U.hex("#d6c890"), gold: U.hex("#d69a48"), mote: U.hex("#d6c8a0"),
  };
  // the sky in the glass by the sun's elevation: [elev, top, horizon]
  const WSKY = [
    [-8, U.hex("#10162e"), U.hex("#2a2238")],
    [-3, U.hex("#2c346e"), U.hex("#b05434")],
    [1, U.hex("#46589e"), U.hex("#d6823a")],
    [5, U.hex("#4a78bc"), U.hex("#d6a050")],
    [12, U.hex("#3c8cd0"), U.hex("#a8c4cc")],
    [28, U.hex("#2e88cc"), U.hex("#94c0d4")],
  ];
  const WSKY_WX = {   // [top, horizon]: bright overcast, grey rain, storm-dark, milky fog, snow
    over: [U.hex("#8a909a"), U.hex("#9a9ea4")], rain: [U.hex("#5e646e"), U.hex("#70747a")],
    storm: [U.hex("#222a3e"), U.hex("#3a3a46")], fog: [U.hex("#9a9ea2"), U.hex("#a4a6a8")], snow: [U.hex("#8a92a2"), U.hex("#9ea2aa")],
  };
  const DSKY = [{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }];
  // frame.day can be pinned (tests): then the sun's elevation follows the pinned light, not the clock
  function sunElev(dl, day) {
    const el = dl ? dl.elevation : -30, li = dl ? dl.light : 0;
    if (Math.abs(li - day) < 0.002) return el;
    if (day <= 0) return Math.min(el, -8);
    if (day >= 1) return Math.max(el, 30);
    return -6 + 14 * (0.5 - Math.sin(Math.asin(1 - 2 * day) / 3));   // inverse of the civil-twilight ramp
  }

  let roomB = null, roomC = null, roomKey = -1, paneD = null, paneG = null;
  // the daylit room, baked once at full colour
  function paintDayRoom(c) {
    const G = winGeo(), apex = G.spring - G.w * 0.866, cy = (apex + G.sill) / 2;
    const rgb = (col, a) => U.rgba(capC(col), a == null ? 1 : a);
    // plaster, lit by the window and falling off into the far corner
    c.fillStyle = rgb(DCOL.wall); c.fillRect(0, 0, W, H);
    const lg = c.createRadialGradient(G.mid - 0.05 * H, cy + 0.05 * H, 0.05 * H, G.mid - 0.05 * H, cy + 0.05 * H, 1.15 * H);
    lg.addColorStop(0, rgb(DCOL.wallLit, 0.9)); lg.addColorStop(0.45, rgb(DCOL.wall, 0.4)); lg.addColorStop(1, rgb(DCOL.wallDark, 0.85));
    c.fillStyle = lg; c.fillRect(0, 0, W, H);
    // the ceiling's shadow along the top
    const tg = c.createLinearGradient(0, 0, 0, 0.22 * H);
    tg.addColorStop(0, "rgba(0,0,0,0.38)"); tg.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = tg; c.fillRect(0, 0, W, 0.22 * H);
    // a little texture in the plaster
    const r = U.rng(5309);
    for (let i = 0; i < 500; i++) {
      const x = r() * W, y = r() * 0.62 * H, rr = (6 + r() * 26) * H / 1080;
      c.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.012)" : "rgba(220,190,150,0.014)";
      c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
    }
    // oak panelling below the shelves and the window
    const py0 = Y(0.625), py1 = Y(0.772);
    const pg = c.createLinearGradient(0, py0, 0, py1);
    pg.addColorStop(0, rgb(DCOL.panelLit)); pg.addColorStop(1, rgb(DCOL.panel));
    c.fillStyle = pg; c.fillRect(0, py0, W, py1 - py0);
    c.fillStyle = rgb(DCOL.panelDark, 0.9); c.fillRect(0, py0 - 0.006 * H, W, 0.008 * H);           // the dado rail's shadow
    c.fillStyle = rgb(DCOL.panelLit, 1); c.fillRect(0, py0 - 0.012 * H, W, 0.007 * H);              // the rail
    const pw = 0.2 * H;
    for (let x = ((W / 2) % pw) - pw; x < W + pw; x += pw) {
      c.strokeStyle = rgb(DCOL.panelDark, 0.8); c.lineWidth = 2;
      c.strokeRect(x + 0.02 * H, py0 + 0.025 * H, pw - 0.04 * H, py1 - py0 - 0.05 * H);
      c.strokeStyle = rgb(DCOL.panelLit, 0.5); c.lineWidth = 1;
      c.beginPath(); c.moveTo(x + 0.02 * H + 2, py1 - 0.025 * H); c.lineTo(x + pw - 0.02 * H, py1 - 0.025 * H); c.lineTo(x + pw - 0.02 * H, py0 + 0.025 * H + 2); c.stroke();
    }
    // the window: a dressed-stone surround, the deep reveal, the sill
    c.fillStyle = rgb(DCOL.stone);
    c.beginPath(); lancet(c, G.x0 - G.f * 1.6, G.x1 + G.f * 1.6, G.sill + 0.002 * H, G.spring); c.fill();
    c.strokeStyle = rgb(U.scale(DCOL.stone, 0.6), 0.9); c.lineWidth = 1.5; c.stroke();
    c.fillStyle = rgb(DCOL.reveal);
    c.beginPath(); lancet(c, G.x0, G.x1, G.sill, G.spring); c.fill();
    // the reveal's left splay catches the light coming in
    const rg = c.createLinearGradient(G.x0, 0, G.x0 + G.w * 0.25, 0);
    rg.addColorStop(0, rgb(DCOL.stoneLit, 0.8)); rg.addColorStop(1, rgb(DCOL.stoneLit, 0));
    c.save(); c.beginPath(); lancet(c, G.x0, G.x1, G.sill, G.spring); c.clip(); c.fillStyle = rg; c.fillRect(G.x0, apex, G.w, G.sill - apex); c.restore();
    c.fillStyle = rgb(DCOL.stoneLit);
    c.fillRect(G.x0 - G.f * 2.2, G.sill, G.w + G.f * 4.4, 0.014 * H);
    c.fillStyle = rgb(U.scale(DCOL.stone, 0.55)); c.fillRect(G.x0 - G.f * 2.2, G.sill + 0.014 * H, G.w + G.f * 4.4, 0.01 * H);
    // the desk: an oak top in perspective, its front edge, the apron
    const dg = c.createLinearGradient(0, Y(0.772), 0, Y(0.868));
    dg.addColorStop(0, rgb(DCOL.deskDark)); dg.addColorStop(0.6, rgb(DCOL.desk)); dg.addColorStop(1, rgb(DCOL.deskLit));
    c.fillStyle = dg; c.fillRect(0, Y(0.772), W, Y(0.868) - Y(0.772));
    c.strokeStyle = rgb(DCOL.deskDark, 0.35); c.lineWidth = 1;
    for (let k = 0; k < 9; k++) {
      const y = Y(0.778 + k * 0.0105);
      c.beginPath(); c.moveTo(0, y);
      for (let x = 0; x <= W; x += 0.04 * H) c.lineTo(x, y + Math.sin(x * 0.006 + k * 1.7) * 1.2);
      c.stroke();
    }
    c.fillStyle = rgb(DCOL.apron); c.fillRect(0, Y(0.868), W, H - Y(0.868));
    c.fillStyle = rgb(DCOL.deskLit, 0.8); c.fillRect(0, Y(0.866), W, 0.006 * H);
    // the objects in their materials
    DAYP = true;
    try { paintStudy(c); } finally { DAYP = false; }
    // the shadow each object casts on the wall and desk, soft, away from the window
    // (kept generic: the beam itself is drawn live)
    // the glass: cut out (the live sky shows through), then the leading laid over it, dark against the light
    c.save();
    c.globalCompositeOperation = "destination-out";
    c.beginPath(); panes(c, G); c.fillStyle = "#000"; c.fill();
    c.restore();
    c.lineCap = "round";
    c.strokeStyle = rgb(DCOL.lead);
    for (const [a, b2] of [[G.x0, G.mid - G.mull / 2], [G.mid + G.mull / 2, G.x1]]) {
      c.save(); c.beginPath(); lancet(c, a, b2, G.sill, G.spring); c.clip();
      c.beginPath(); quarries(c, G, a, b2); c.lineWidth = 2.2; c.stroke();
      c.restore();
      c.beginPath(); lancet(c, a, b2, G.sill, G.spring); c.lineWidth = 3; c.stroke();
    }
    const ocY = G.spring - G.w * 0.54, ocR = G.w * 0.15;
    c.beginPath(); c.arc(G.mid, ocY, ocR, 0, TAU); c.lineWidth = 3; c.stroke();
    c.beginPath();
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; c.moveTo(G.mid + Math.cos(a) * ocR * 0.42 + ocR * 0.4, ocY + Math.sin(a) * ocR * 0.42); c.arc(G.mid + Math.cos(a) * ocR * 0.42, ocY + Math.sin(a) * ocR * 0.42, ocR * 0.4, 0, TAU); }
    c.lineWidth = 2; c.stroke();
  }
  function buildDay() {
    roomB = mk(W, H); roomC = mk(W, H); roomKey = -1;
    paintDayRoom(roomB.c);
    // the panes as sunlight (pale, and gold), the leading cut out: cast across the desk by the beam
    const mkPane = (col) => {
      const G = winGeo(), apex = G.spring - G.w * 0.866;
      const bx = G.x0 - 4, by = apex - 4, bw = G.w + 8, bh = G.sill - apex + 8;
      const L = mk(bw, bh); L.x = bx; L.y = by; L.w = bw; L.h = bh;
      const c = L.c; c.translate(-bx, -by);
      c.fillStyle = U.rgba(capC(col), 1); c.beginPath(); panes(c, G); c.fill();
      c.globalCompositeOperation = "destination-out"; c.lineCap = "round"; c.strokeStyle = "#000";
      for (const [a, b2] of [[G.x0, G.mid - G.mull / 2], [G.mid + G.mull / 2, G.x1]]) {
        c.save(); c.beginPath(); lancet(c, a, b2, G.sill, G.spring); c.clip();
        c.beginPath(); quarries(c, G, a, b2); c.lineWidth = 3; c.stroke();
        c.restore();
        c.beginPath(); lancet(c, a, b2, G.sill, G.spring); c.lineWidth = 4.5; c.stroke();
      }
      c.globalCompositeOperation = "source-over";
      return L;
    };
    paneD = mkPane(DCOL.sun); paneG = mkPane(DCOL.gold);
  }
  // re-tint the room for its light: warm at a low sun, cool and dim under cloud and rain, darker toward dusk
  function composeRoom(warm, cool, dark) {
    const q = (v, n) => Math.round(U.clamp(v) * n);
    const key = (q(warm, 32) * 33 + q(cool, 32)) * 41 + q(dark, 40);
    if (key === roomKey) return;
    roomKey = key;
    const c = roomC.c, cw = roomC.cv.width, ch = roomC.cv.height;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
    c.clearRect(0, 0, cw, ch); c.drawImage(roomB.cv, 0, 0);
    c.globalCompositeOperation = "source-atop";
    const w = q(warm, 32) / 32, k = q(cool, 32) / 32, d = q(dark, 40) / 40;
    if (w > 0) { c.fillStyle = `rgba(170,96,40,${0.3 * w})`; c.fillRect(0, 0, cw, ch); }
    if (k > 0) { c.fillStyle = `rgba(70,80,96,${0.3 * k})`; c.fillRect(0, 0, cw, ch); }
    c.fillStyle = `rgba(0,0,0,${1 - ROOM_FILL * (1 - 0.6 * d)})`; c.fillRect(0, 0, cw, ch);
    c.globalCompositeOperation = "source-over"; c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // where the sun is (0 = rising .. 1 = setting) and how it falls through the window
  const BEAM = { sk: 0, sq: 0, sunK: 0, warm: 0 };
  const MOTE = new Float32Array(60 * 4);
  (function seedMotes() { const r = U.rng(4243); for (let i = 0; i < MOTE.length; i++) MOTE[i] = r(); })();
  // The day: room, sky in the glass, beam, lattice on the desk, motes, the unlit candle.
  function drawDay(ctx, f, dS, dAmb, el, sunU, t, candle, unlitK) {
    const G = winGeo(), apex = G.spring - G.w * 0.866, deskY = Y(0.776);
    const over = WXP[1] * U.smoothstep(0.3, 0.95, WXI[1]);
    const low = 1 - U.smoothstep(3, 16, el);
    const sunK = U.smoothstep(-1, 3, el) * (1 - U.smoothstep(0.3, 0.75, WX.cover));
    const warm = low * (1 - 0.8 * U.smoothstep(0.4, 0.85, WX.cover));
    const cool = U.clamp(over * 0.8 + WXP[3] + WXP[4] + WXP[5] * 0.7 + WXP[2] * 0.6);
    const dark = U.clamp(0.25 * over + 0.4 * WXP[3] + 0.6 * WXP[4] + 0.15 * WXP[2] + 0.7 * (1 - U.smoothstep(-5, 8, el)));
    // the sky in the glass (under the room, which has the panes cut out of it)
    {
      let i = 0; while (i < WSKY.length - 2 && el > WSKY[i + 1][0]) i++;
      const u = U.clamp((el - WSKY[i][0]) / (WSKY[i + 1][0] - WSKY[i][0]));
      for (let j = 0; j < 2; j++) { const a = WSKY[i][j + 1], b2 = WSKY[i + 1][j + 1]; DSKY[j].r = U.lerp(a.r, b2.r, u); DSKY[j].g = U.lerp(a.g, b2.g, u); DSKY[j].b = U.lerp(a.b, b2.b, u); }
      const ws = over + WXP[2] + WXP[3] + WXP[4] + WXP[5];
      if (ws > 0.001) {
        const lk = 0.45 + 0.55 * U.smoothstep(-5, 10, el);
        for (let j = 0; j < 2; j++) {
          const o = DSKY[j], K = WSKY_WX, m = Math.min(1, ws);
          const tr = (over * K.over[j].r + WXP[2] * K.fog[j].r + WXP[3] * K.rain[j].r + WXP[4] * K.storm[j].r + WXP[5] * K.snow[j].r) / ws * lk;
          const tg = (over * K.over[j].g + WXP[2] * K.fog[j].g + WXP[3] * K.rain[j].g + WXP[4] * K.storm[j].g + WXP[5] * K.snow[j].g) / ws * lk;
          const tb = (over * K.over[j].b + WXP[2] * K.fog[j].b + WXP[3] * K.rain[j].b + WXP[4] * K.storm[j].b + WXP[5] * K.snow[j].b) / ws * lk;
          o.r += (tr - o.r) * m; o.g += (tg - o.g) * m; o.b += (tb - o.b) * m;
        }
      }
      ctx.save(); ctx.beginPath(); panes(ctx, G); ctx.clip();
      const sg = ctx.createLinearGradient(0, apex, 0, G.sill);
      sg.addColorStop(0, U.rgba(capC(DSKY[0]), 1)); sg.addColorStop(1, U.rgba(capC(DSKY[1]), 1));
      ctx.globalAlpha = WIN_FILL * dS; ctx.fillStyle = sg; ctx.fillRect(G.x0 - 2, apex - 2, G.w + 4, G.sill - apex + 4);
      // the sun's glare high in the glass (it is out there, over the sill)
      if (sunK > 0.01) glowDot(ctx, U.mix(DCOL.sun, DCOL.gold, warm), G.mid + G.w * 0.15, U.lerp(apex + 0.05 * H, G.sill - 0.06 * H, low), 0.2 * H, 0.9 * sunK * dS);
      if (WX.dust > 0.01) {
        // snow banked into the bottom of each light, deeper in the corners
        const hs = 0.034 * H * (0.4 + 0.6 * WX.dust);
        ctx.globalAlpha = WIN_FILL * dS * WX.dust; ctx.fillStyle = "rgb(176,182,198)";
        for (const [a, b2] of [[G.x0, G.mid - G.mull / 2], [G.mid + G.mull / 2, G.x1]]) {
          ctx.beginPath(); ctx.moveTo(a - 2, G.sill + 2);
          for (let k = 0; k <= 20; k++) {
            const u2 = k / 20, x = a + (b2 - a) * u2, corner = Math.pow(Math.abs(u2 - 0.5) * 2, 3);
            ctx.lineTo(x, G.sill - hs * (0.45 + 0.55 * corner + 0.1 * Math.sin(u2 * 9 + a * 0.01)));
          }
          ctx.lineTo(b2 + 2, G.sill + 2); ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // the room
    composeRoom(warm, cool, dark);
    ctx.globalAlpha = dS; ctx.drawImage(roomC.cv, 0, 0, W, H); ctx.globalAlpha = 1;
    // daylight off the sky: a soft pool on the desk below the window
    glowDot(ctx, U.mix(DSKY[1], DCOL.sun, 0.5), G.mid - 0.08 * H, Y(0.8), 0.45 * H, 0.35 * dS * (1 - 0.5 * dark));
    // the unlit candle: a cream column, a thin black wick
    if (candle) {
      const g = candle, hw = g.cw / 2, ry = g.cw * 0.17, ca = dS * (1 - 0.6 * dark) * unlitK;
      const k = ROOM_FILL * 1.25;
      const wg = ctx.createLinearGradient(g.x - hw, 0, g.x + hw, 0);
      wg.addColorStop(0, U.rgba(U.scale(DCOL.waxShade, k), 1)); wg.addColorStop(0.6, U.rgba(U.scale(DCOL.wax, k), 1)); wg.addColorStop(1, U.rgba(U.scale(DCOL.wax, k * 1.1), 1));
      ctx.globalAlpha = U.clamp(ca);
      ctx.beginPath(); ctx.moveTo(g.x - hw, g.sockTop); ctx.lineTo(g.x - hw, g.top);
      ctx.ellipse(g.x, g.top, hw, ry, 0, Math.PI, TAU, false); ctx.lineTo(g.x + hw, g.sockTop); ctx.closePath();
      ctx.fillStyle = wg; ctx.fill();
      ctx.beginPath(); ctx.ellipse(g.x, g.top, hw, ry, 0, 0, TAU); ctx.fillStyle = U.rgba(U.scale(DCOL.wax, k * 1.15), 1); ctx.fill();
      ctx.beginPath(); ctx.moveTo(g.x, g.top); ctx.quadraticCurveTo(g.x + 0.001 * H, g.top - 0.008 * H, g.x + 0.003 * H, g.wickTip);
      ctx.lineWidth = 1.4; ctx.strokeStyle = U.rgba(DCOL.wick, 0.95); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // the beam: the sun through the leaded lights, the lattice across the desk and books, dust turning in it
    const bA = sunK * dS;
    BEAM.sunK = sunK; BEAM.warm = warm;
    if (bA > 0.004) {
      const tanE = Math.tan(U.clamp(el, 2.5, 75) * Math.PI / 180);
      // short and steep under a high sun; as it sinks the patch stretches long across the desk (the window
      // looks south-west: the evening sun comes in from the side)
      BEAM.sq = U.clamp(0.065 / tanE, 0.06, 0.17);
      BEAM.sk = U.lerp(-0.25, 0.55, U.clamp(sunU)) + 1.05 * low * U.smoothstep(0.35, 0.6, sunU);
      // the shaft of lit air: the panes carried along the light from the glass to the desk, in faint slices
      // (each slice is the window moved part-way along its rays), so the beam has the lattice in it and soft edges
      const sc = U.mix(DCOL.sun, DCOL.gold, warm);
      const ce = -BEAM.sk * G.sill - 0.02 * H, cf = deskY + BEAM.sq * G.sill;
      ctx.globalCompositeOperation = "lighter";
      const NS = 14;
      for (let i = 0; i < NS; i++) {
        const u = 0.1 + 0.88 * (i + 0.5) / NS;
        ctx.setTransform(dpr, 0, dpr * BEAM.sk * u, dpr * (1 - u * (1 + BEAM.sq)), dpr * ce * u, dpr * cf * u);
        const sa = 0.022 * bA * (1 - 0.35 * u);
        if (warm < 0.99) { ctx.globalAlpha = sa * (1 - warm); ctx.drawImage(paneD.cv, paneD.x, paneD.y, paneD.w, paneD.h); }
        if (warm > 0.01) { ctx.globalAlpha = sa * warm; ctx.drawImage(paneG.cv, paneG.x, paneG.y, paneG.w, paneG.h); }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
      // the lattice laid on the desk (and the books on it): flipped, foreshortened, raked
      ctx.save();
      ctx.beginPath(); ctx.rect(0, Y(0.772), W, Y(0.869) - Y(0.772)); ctx.clip();
      ctx.setTransform(dpr, 0, dpr * BEAM.sk, -dpr * BEAM.sq, dpr * (-BEAM.sk * G.sill - 0.02 * H), dpr * (deskY + BEAM.sq * G.sill));
      const pa = (0.55 - 0.15 * warm) * bA;
      if (warm < 0.99) { ctx.globalAlpha = pa * (1 - warm); ctx.drawImage(paneD.cv, paneD.x, paneD.y, paneD.w, paneD.h); }
      if (warm > 0.01) { ctx.globalAlpha = pa * warm; ctx.drawImage(paneG.cv, paneG.x, paneG.y, paneG.w, paneG.h); }
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      // dust: motes drifting in the shaft, glinting as they turn
      const mc = U.rgba(capC(U.mix(DCOL.mote, DCOL.gold, warm * 0.6)), 1);
      ctx.fillStyle = mc;
      for (let i = 0; i < 60; i++) {
        const m = i * 4, v = MOTE[m], w2 = MOTE[m + 1], ph = MOTE[m + 3] * 100;
        const u = (MOTE[m + 2] + t * 0.006 * (0.5 + MOTE[m + 3])) % 1;
        const wx = U.lerp(G.x0, G.x1, v), wy = U.lerp(apex + 0.1 * (G.sill - apex), G.sill, w2);
        const x = U.lerp(wx, wx + BEAM.sk * (wy - G.sill) - 0.02 * H, u) + U.noise1(t * 0.13 + ph) * 0.02 * H;
        const y = U.lerp(wy, deskY + BEAM.sq * (G.sill - wy), u) + U.noise1(t * 0.11 + ph + 7) * 0.02 * H;
        const tw = Math.max(0, Math.sin(t * (0.6 + MOTE[m + 3]) + ph));
        const a = bA * dAmb * (0.12 + 0.55 * tw * tw) * Math.sin(Math.PI * u);
        if (a < 0.01) continue;
        ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, (0.8 + 1.1 * MOTE[m + 1]) * H / 1080, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ the cat (THEMES.md "The cat")
  // The study's cat sits on the window sill with its back to the room, watching the rain run down the glass
  // (the weather is out there, behind it). As the night wears on it settles into a loaf on the sill, turned to
  // the candle, and in the small hours curls up asleep there. The window backlights it (moon and sky by night,
  // the sun by day); the candle, far across the desk, lays a warm flickering edge on its room side while it
  // still burns tall.
  let cat = null;
  const CAT_RIM = [{ color: null, a: 0, dx: 0, dy: -1 }, { color: null, a: 0, dx: -1, dy: 0.2 }];
  const CAT_O = { x: 0, y: 0, size: 0, facing: -1, light: 0, tint: null, tintAmt: 0, rim: CAT_RIM, glow: 0, shadow: 0, alpha: 0, hang: true };
  function drawCat(ctx, f, b, day) {
    const G = winGeo(), o = CAT_O;
    o.size = 0.13 * H;
    o.x = X(0.585); o.y = G.sill + 0.004 * H;   // the left light, clear of the moon in the right one
    o.pose = AW.cat.autoPose(f, "back");
    const my = o.y - 0.5 * o.size;
    // the window behind it: a cool edge of moon and sky (less under cloud), or the sun's bright edge by day
    const win = CAT_RIM[0];
    win.dx = 0.35; win.dy = -1;
    win.color = U.mix(C.moon, DCOL.sun, day);
    win.a = U.lerp(0.26 + 0.14 * (1 - WX.cover), 0.3 + 0.35 * BEAM.sunK, day);
    // the candle, across the desk: strong while it is tall and its light reaches the window, flickering with it
    const can = CAT_RIM[1], dx = LIT.x - o.x, dy = LIT.y - my, reach = U.clamp(1.25 - Math.hypot(dx, dy) / Math.max(1, LIT.R));
    can.dx = dx; can.dy = dy; can.color = C.candle;
    can.a = LIT.k * (0.3 + 0.55 * reach) * (1 - day);
    o.light = U.lerp(0.18 + 0.12 * LIT.k * reach, 0.42 + 0.14 * BEAM.sunK, day);
    o.tint = U.mix(C.candle, DCOL.wallLit, day); o.tintAmt = U.lerp(0.45, 0.15, day);
    o.glow = 0.55 * (1 - day);
    o.shadow = 0.6 * day;
    o.alpha = U.smoothstep(0.35, 1, b);   // with the study (the ambient face); gone behind the work page
    cat.draw(ctx, f, o);
  }

  // ------------------------------------------------------------------ build
  function build() {
    if (!mctx) mctx = document.createElement("canvas").getContext("2d");
    sprites.clear(); initials.clear(); dots.clear();
    buildClock();
    studyL = mk(W, H); litL = mk(W, H); winL = mk(W, H); infoL = null;
    NL.key = NW.key = "";
    paintStudy(studyL.c);
    litKey = ""; winKey = "";
    paintPanes();
    buildDay();
    const r = U.rng(4711);
    // rain past the window: [x, phase, speed (heights/s), length (of H)]; a downpour uses all of them
    RAIN = new Float32Array(140 * 4);
    for (let i = 0; i < RAIN.length; i += 4) { RAIN[i] = r(); RAIN[i + 1] = r(); RAIN[i + 2] = 0.9 + r() * 0.6; RAIN[i + 3] = 0.012 + r() * 0.016; }
    // beads standing on the glass: [x, y] (of the window)
    BEADS = new Float32Array(70 * 2);
    for (let i = 0; i < BEADS.length; i++) BEADS[i] = r();
    // flakes drifting past: [x, phase, speed (heights/s), size (px), sway phase]
    FLAKES = new Float32Array(80 * 5);
    for (let i = 0; i < FLAKES.length; i += 5) { FLAKES[i] = r(); FLAKES[i + 1] = r(); FLAKES[i + 2] = 0.05 + r() * 0.08; FLAKES[i + 3] = 1.3 + r() * 1.5; FLAKES[i + 4] = r() * 100; }
    runInit = false;
    const d = U.rng(77);
    DRIPS = [];
    for (let i = 0; i < 5; i++) DRIPS.push({ u: (d() - 0.5) * 1.5, p0: 0.06 + i * 0.16 + d() * 0.06, len: 0.02 + d() * 0.05 });
    built = `${W}x${H}@${dpr}`;
  }

  // ------------------------------------------------------------------ theme
  AW.registerTheme({
    id: "academia",
    name: "Dark Academia",
    init(ctx, env) {
      dpr = env.dpr || 1; W = env.width; H = env.height; flameS = lightS = null; build();
      if (AW.cat) cat = AW.cat.create(47);
      SND.pageAt = SND.owlAt = SND.hour = -1;
    },
    resize(env) { dpr = env.dpr || 1; W = env.width; H = env.height; build(); },
    destroy() { sprites.clear(); initials.clear(); dots.clear(); studyL = litL = winL = paneL = infoL = null; roomB = roomC = paneD = paneG = null; built = ""; },

    // The shared info overlay in the theme's hand: by day the manuscript page (Garamond, moonlit ink,
    // gilt for what matters, red ochre for alarm, small-caps headings, the accountant's double rule);
    // by candlelight the same hand in parchment and gilt, warm red for alarm.
    overlayStyle(f) {
      const b = U.clamp(f.blend || 0), w = U.smoothstep(0.4, 0.6, b);
      const m = (a, c) => U.safe(U.mix(a, c, w));
      return {
        font: SERIF,
        ink: m(C.ink, C.paper),
        dim: m(C.inkDim, C.giltDim),
        accent: m(C.gilt, C.candle),
        alarm: m(C.alarm, C.warmRed),
        glow: U.lerp(0.35, 0.55, w),
        rule: "double",
        caps: true,
      };
    },

    // The study as sound: the near-silence of the room, rain on the window (the hero when it rains: the
    // weather eased between conditions with the glass), the wind outside, the candle's faint hush at night,
    // birds beyond the window by day. Rare sound-only events: a page turned (there is no page-turn on the
    // wall, so they are random, a few minutes apart), the hour struck by a distant college bell (by day and
    // evening, 07:00-22:00), an owl outside at night. Core's master level does the work / ambient mix.
    soundscape(f) {
      const w = (f.signals && f.signals.weather) || {};
      const day = U.clamp(f.day || 0), T = num(w.tempC, 12), wind = num(+w.windKph, 5);
      const rain = U.clamp(WXP[3] * (0.3 + 0.7 * WXI[3]) + WXP[4] * (0.85 + 0.15 * WXI[4]));
      const wet = U.clamp(rain * 1.2), storm = WXP[4];
      LV.room = 0.3;
      LV.rain = rain;
      LV.wind = U.clamp(0.7 * U.smoothstep(8, 55, wind) + 0.2 * storm + 0.08 * WXP[5]);
      LV.fire = 0.08 * SND.candle;
      LV.birds = 0.2 * day * (0.55 + 0.45 * U.smoothstep(0, 10, T)) * (1 - 0.9 * wet) * (1 - 0.5 * U.smoothstep(25, 50, wind));
      const t = num(f.t, 0), amb = (f.blend || 0) > 0.9;
      // a page turned at the desk, now and then
      if (amb) {
        if (SND.pageAt < 0) SND.pageAt = t + 60 + Math.random() * 150;
        else if (t >= SND.pageAt) {
          SND.pageAt = t + 150 + Math.random() * 270;
          cue("page", { gain: 0.5 + 0.3 * Math.random(), distance: 0.15, pan: 0.2 + 0.15 * Math.random() });
        }
      } else SND.pageAt = -1;
      // the hour, struck by a distant college bell (not at night): only on the hour's own minute
      const now = f.now, hr = now ? now.getHours() : -1;
      if (SND.hour < 0) SND.hour = hr;
      else if (hr !== SND.hour) {
        SND.hour = hr;
        if (now.getMinutes() === 0 && hr >= 7 && hr <= 22) cue("distant_bell", { count: hr % 12 || 12, distance: 0.75, gain: 0.9, pan: 0.45, freq: 415 });
      }
      // an owl outside the window, rarely (not in a downpour or a storm)
      if (amb && day < 0.08 && rain < 0.5 && storm < 0.2) {
        if (SND.owlAt < 0) SND.owlAt = t + 60 + Math.random() * 240;
        else if (t >= SND.owlAt) {
          SND.owlAt = t + 360 + Math.random() * 540;
          cue("owl", { gain: 0.8, distance: 0.6 + 0.3 * Math.random(), pan: 0.45 + 0.4 * Math.random() });
        }
      } else SND.owlAt = -1;
      return LV;
    },

    render(ctx, f) {
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.width, f.height);
      if (f.width !== W || f.height !== H || (f.dpr || 1) !== dpr || !built) {
        dpr = f.dpr || 1; W = f.width; H = f.height; build();
      }
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      const b = U.clamp(f.blend || 0), t = f.t, S = f.signals || {};
      const dl = S.daylight;
      // daylight: day = the light out there (frame.day); dS = how much of the day scene is up (the whole room
      // in ambient, a faint 0.18 of it behind the page in work, so the exhale brings it forward); 0 at night
      const day = U.clamp(f.day || 0), sEl = sunElev(dl, day);
      const dS = day * U.lerp(0.18, 1, U.smoothstep(0.1, 0.9, b));
      DAYK = day * U.smoothstep(0.25, 1, b);
      let sunU = 0.45;
      if (dl && dl.sunrise && dl.sunset && Math.abs(dl.light - day) < 0.002) sunU = (f.now - dl.sunrise) / (dl.sunset - dl.sunrise);
      // The candle's evening: ambientElapsed; over a long ambient stretch (a weekend) it runs from the candle
      // being lit at dusk (20 min before sunset), eased in. By day a fresh candle stands ready.
      let el = Math.max(0, f.ambientElapsed || 0);
      if (el > 36000 && dl && dl.sunset) {
        let sr = (f.now.getTime() - (dl.sunset.getTime() - 1200000)) / 1000;
        if (sr < 0) sr += 86400;
        el = U.lerp(el, sr, U.smoothstep(36000, 50400, el));
      }
      if (day > 0) el *= 1 - U.smoothstep(0, 8, sEl);
      // dusk lights the candle (the sun ~3.5 deg up), and the morning puts it out
      const litC = day > 0 ? 1 - U.smoothstep(3.0, 4.2, sEl) : 1;
      const P = pageGeo();
      // the real weather, eased between conditions (null = clear); the window shows it
      updateWeather(S.weather, Math.min(0.1, f.dt || 0.016), t);

      // Lighting and snuffing are different gestures, so the candle reads the direction of the exhale.
      let flameT, lightT, ember, snuff;
      if (f.mode === "ambient") {
        flameT = U.smoothstep(0.3, 0.52, b) * litC; lightT = U.smoothstep(0.32, 1, b) * litC;
        ember = U.smoothstep(0.16, 0.3, b) * (1 - flameT) * litC; snuff = 0;
      } else {
        flameT = U.smoothstep(0.76, 0.92, b); lightT = U.smoothstep(0.58, 0.92, b);
        ember = U.smoothstep(0.4, 0.76, b) * (1 - flameT);
        snuff = U.smoothstep(0.16, 0.5, b) * (1 - U.smoothstep(0.82, 0.94, b));
      }
      if (flameS === null || !f.transitioning) { flameS = flameT; lightS = lightT; }
      else { const k = Math.min(1, (f.dt || 0.016) * 5); flameS += (flameT - flameS) * k; lightS += (lightT - lightS) * k; }
      SND.candle = U.clamp(flameS);   // the candle's hush follows the flame (none by day: it stands unlit)

      // ---------------------------------------------------- the study by day (and faintly behind the page)
      if (dS > 0.004) drawDay(ctx, f, dS, DAYK, sEl, sunU, t, candleGeo(el), 1 - litC * U.smoothstep(0.3, 0.6, b));

      // ---------------------------------------------------- the study (ambient)
      LIT.k = 0;
      if (b > 0.004) drawStudy(ctx, f, b, el, t, S, flameS, lightS, ember, snuff);
      const flick = LIT.k > 0 ? 0.94 + 0.06 * U.noise1(t * 1.9) : 1;

      // ---------------------------------------------------- the cat on the window sill (in front of the glass and its weather)
      if (cat) drawCat(ctx, f, b, day);

      // ---------------------------------------------------- the page (work), fading in a cascade
      // While the shared info overlay is up, the inscriptions (not the study) step back: they are written
      // on a layer of their own and laid down at 1 - 0.7 * overlay.a.
      const od = f.overlay ? 1 - 0.7 * U.clamp(+f.overlay.a || 0) : 1;
      let ic = ctx;
      if (od < 0.999) {
        if (!infoL) infoL = mk(W, H);
        ic = infoL.c;
        ic.globalCompositeOperation = "source-over"; ic.globalAlpha = 1;
        ic.clearRect(0, 0, W, H);
        ic.lineCap = "round"; ic.lineJoin = "round";
      }
      drawRules(ic, P, fade(b, 0.04, 0.5));
      drawHours(ic, f, P, fade(b, 0.0, 0.34));
      drawLedger(ic, f, P, fade(b, 0.02, 0.3));
      drawWeather(ic, f, P, fade(b, 0.06, 0.36));
      drawDate(ic, f, P, fade(b, 0.16, 0.48));
      const clk = drawClock(ic, f, b, P, fade(b, 0.08, 0.44), flick);
      drawCalendar(ic, f, P, fade(b, 0.1, 0.42), clk);
      drawNews(ic, f, P, fade(b, 0.12, 0.46), clk);
      drawNowPlaying(ic, f, P, fade(b, 0.14, 0.44), U.smoothstep(0.5, 0.95, b));
      drawHosts(ic, f, b, P, fade(b, 0.03, 0.3));
      if (ic !== ctx) {
        ic.globalAlpha = 1;
        ctx.globalAlpha = od; ctx.drawImage(infoL.cv, 0, 0, W, H);
      }
      ctx.globalAlpha = 1;
    },
  });
})();
