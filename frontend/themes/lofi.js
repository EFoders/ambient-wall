// Lofi: a small apartment window on a rainy city night.
// Work = a clean, calm desk HUD in cold cyan. A soft rounded mono-line clock sits inside the faint outline of
//   the window (the only trace of the room), the date and an actionable weather sliver under it, the day as a
//   bar along the sill (sunrise, sunset, the light that is left), and to the right the next meeting, the
//   month's money with its mood, and the hosts as a row of quiet rings. A host down is the one loud thing.
// Ambient = the view from inside a small apartment at night. A tall two-pane window looks across the street at
//   a mid-rise city: windows warm and cool, rooftop water tanks, a radio mast blinking, an elevated train
//   sliding past now and then. Inside, silhouettes in lamplight: a cat asleep on the sill (breathing, the odd
//   ear twitch), a mug with a thread of steam, a snake plant, fairy lights along the curtain rod, records, a
//   desk lamp's warm pool, and a retro alarm clock glowing amber-pink. The hosts are LEDs on the stereo.
// Weather is real and is the star: rain beads and runs down the glass, each bead holding a tiny upside-down
//   city, the runners wiping clear tracks through the blurred bokeh behind; a storm streams and slants and now
//   and then dim lightning shows the skyline; snow drifts past and piles on the outer sill; fog dissolves the
//   city into soft glowing blobs; cloud is a low deck lit pink from below; a clear night has stars and the moon.
// Over the evening the city goes to sleep window by window, the lamp dims a touch, the tea goes cold (the
//   steam is gone by the hour) and the cat shifts once or twice.
// The exhale: the HUD fades in a staggered cascade, the lamp clicks on, the city and the rain come up out of
//   the dark, the fairy lights catch one by one, and last of all the cat is there. Back to work: reverse.
(function () {
  const U = AW.util;
  const TAU = Math.PI * 2, PI = Math.PI;
  const SANS = '"Nunito", "Quicksand", "Varela Round", "Inter", "Segoe UI", "DejaVu Sans", system-ui, sans-serif';
  const MONO = 'ui-monospace, "DejaVu Sans Mono", "Cascadia Mono", Consolas, monospace';
  const HOUR = 3600;

  const C = {
    // work: a cool, quiet desk
    ice: U.hex("#6cc6d4"),       // the hero
    iceMid: U.hex("#4f9cae"),
    iceDim: U.hex("#3a7282"),
    frost: U.hex("#2e5a6a"),     // the window remembered
    mint: U.hex("#5cc29e"),      // calm money, hosts up
    amber: U.hex("#d8a04c"),     // drift, a meeting close
    alarm: U.hex("#e05a46"),     // the rare loud flare
    // ambient: the apartment
    lamp: U.hex("#dea050"),
    lampHot: U.hex("#e6b266"),
    rose: U.hex("#c87488"),
    peach: U.hex("#dc9472"),
    dusk: U.hex("#6c5490"),
    lav: U.hex("#8a82c2"),       // city glow on the silhouettes
    clock: U.hex("#ec8a70"),     // the alarm clock: dim amber-pink
    led: U.hex("#5cba96"),
    ledDown: U.hex("#d8503e"),
    radio: U.hex("#4aa8a0"),
    steam: U.hex("#9a90b6"),
    // outside
    rain: U.hex("#8890c4"),
    snow: U.hex("#a0a8d0"),
    flash: U.hex("#7270b8"),     // lightning: dim violet, never white
    murk: U.hex("#6c6898"),
    moon: U.hex("#bab4da"),
    star: U.hex("#949cd2"),
    mast: U.hex("#d05866"),
    street: U.hex("#d88a52"),
    trainLit: U.hex("#b8acd0"),
    // the sky by the sun
    skyNightTop: U.hex("#10163c"), skyNightLow: U.hex("#4c3072"),
    skyDuskTop: U.hex("#3a3274"), skyDuskLow: U.hex("#d07a6c"),
    skyDayTop: U.hex("#5a7cb0"), skyDayLow: U.hex("#98a4c4"),
    cloudTop: U.hex("#4c3c66"), cloudLow: U.hex("#b06a8a"),       // night deck lit pink from below
    cloudDuskLow: U.hex("#c87a68"), cloudDay: U.hex("#7c8498"), cloudDayTop: U.hex("#868892"),
  };
  // city windows: sodium amber, soft gold, peach, lavender, tv blue, pale teal
  const WINPAL = ["#d6a058", "#dab070", "#d68c7c", "#9084ce", "#6886ca", "#76acb2"].map(U.hex);
  const WINCSS = WINPAL.map((c) => U.rgba(U.safe(c), 1));
  const WINCUM = [0.36, 0.56, 0.7, 0.82, 0.92, 1];

  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DOTTED = [1.5, 5], SOLID = [];

  // ------------------------------------------------------------------ canvases + sprites
  let dpr = 1, W = 0, H = 0, S = 1, built = "";
  let mctx = null;
  const sprites = new Map(), dots = new Map(), discs = new Map();

  function mk(wCss, hCss) {
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.ceil(wCss * dpr)); cv.height = Math.max(1, Math.ceil(hCss * dpr));
    const c = cv.getContext("2d"); c.scale(dpr, dpr);
    return { cv, c, w: wCss, h: hCss };
  }
  const spacingOk = (c) => "letterSpacing" in c;
  const colKey = (c) => `${c.r | 0},${c.g | 0},${c.b | 0}`;
  const fontOf = (o) => `${o.style || "normal"} ${o.weight || 400} ${Math.round(o.px)}px ${o.mono ? MONO : SANS}`;
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const fade = (b, a0, a1) => 1 - U.smoothstep(a0, a1, b);

  // o: { px, weight, style, spacing (em), color, glow, core, mono }. Glow baked once, then blitted.
  function sprite(str, o) {
    const key = `${str}|${o.px | 0}|${o.weight || 400}|${o.style || ""}|${o.spacing || 0}|${colKey(o.color)}|${o.glow || 0}|${o.core || 0}|${o.mono ? 1 : 0}`;
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
    if (sprites.size > 160) sprites.delete(sprites.keys().next().value);
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

  // soft round glow, radial gradient baked once per colour
  function dotSprite(col) {
    const key = colKey(col);
    let d = dots.get(key);
    if (d) return d;
    if (dots.size > 32) dots.clear();
    d = mk(64, 64);
    const c = U.safe(col), g = d.c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, U.rgba(c, 0.5)); g.addColorStop(0.25, U.rgba(c, 0.2));
    g.addColorStop(0.6, U.rgba(c, 0.05)); g.addColorStop(1, U.rgba(c, 0));
    d.c.fillStyle = g; d.c.fillRect(0, 0, 64, 64);
    dots.set(key, d);
    return d;
  }
  function glowDot(ctx, col, x, y, r, a, ry) {
    if (a <= 0.004 || r <= 0) return;
    const r2 = ry || r;
    ctx.globalAlpha = U.clamp(a);
    ctx.drawImage(dotSprite(col).cv, x - r, y - r2, r * 2, r2 * 2);
    ctx.globalAlpha = 1;
  }
  // a bokeh disc: flat-ish, with the faint bright rim of an out-of-focus light
  function discSprite(col) {
    const key = colKey(col);
    let d = discs.get(key);
    if (d) return d;
    d = mk(64, 64);
    const c = U.safe(col), g = d.c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, U.rgba(c, 0.34)); g.addColorStop(0.6, U.rgba(c, 0.4)); g.addColorStop(0.82, U.rgba(c, 0.48));
    g.addColorStop(0.93, U.rgba(c, 0.16)); g.addColorStop(1, U.rgba(c, 0));
    d.c.fillStyle = g; d.c.fillRect(0, 0, 64, 64);
    discs.set(key, d);
    return d;
  }

  // a soft rim of light along the current path: a wide faint halo and a fine core
  function rim(c, col, a, lw) {
    if (a <= 0.004) return;
    const cc = U.safe(col);
    c.lineWidth = lw * 3.2; c.strokeStyle = U.rgba(cc, a * 0.13); c.stroke();
    c.lineWidth = lw; c.strokeStyle = U.rgba(cc, a); c.stroke();
  }
  const blk = (c) => { c.fillStyle = RDAY ? MATF : "#000"; c.fill(); };
  // The room's day pass (RDAY, baked once): every silhouette gets its material and the rims become soft
  // daylight highlights. mat() and INK() are no-ops at night.
  let RDAY = false, MATF = "#000", MATH = null;
  function mat(r, g, b) { if (!RDAY) return; const c = { r, g, b }; MATF = U.rgba(U.safe(c), 1); MATH = U.safe(U.scale(c, 1.55)); }
  const INK = () => (RDAY ? MATF : "#000");
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
  }
  // path from [op, ...coords] in units u, mirrored by m, about the origin
  function segPath(c, segs, u, m) {
    for (const s of segs) {
      if (s[0] === "M") c.moveTo(m * s[1] * u, s[2] * u);
      else if (s[0] === "L") c.lineTo(m * s[1] * u, s[2] * u);
      else if (s[0] === "C") c.bezierCurveTo(m * s[1] * u, s[2] * u, m * s[3] * u, s[4] * u, m * s[5] * u, s[6] * u);
      else c.closePath();
    }
  }

  // ------------------------------------------------------------------ the stage
  // S is the height of the 16:9 stage that fits the screen; X/Y place things on it, centred.
  const X = (k) => W / 2 + k * S, Y = (k) => H / 2 + (k - 0.5) * S;
  let G = null, LAMP = null, CK = null, SH = null, MUG = null, FAIRY = null;
  function layout() {
    G = { x0: X(-0.8), x1: X(0.12), y0: Y(0.075), y1: Y(0.645), mx: X(-0.34), mw: 0.014 * S, f: 0.02 * S };
    G.w = G.x1 - G.x0; G.h = G.y1 - G.y0;
    G.l1 = G.mx - G.mw / 2; G.r0 = G.mx + G.mw / 2;
    const pad = 0.05 * S;
    G.vx = G.x0 - pad; G.vy = G.y0 - pad; G.vw = G.w + 2 * pad; G.vh = G.h + 2 * pad;
    const ax = -0.55, ay = 0.835;
    LAMP = { bx: X(0.835), by: Y(0.76), ex: X(0.878), ey: Y(0.53), px: X(0.752), py: Y(0.438), ax, ay, L: 0.09 * S, R0: 0.05 * S, r0: 0.015 * S };
    LAMP.ox = LAMP.px + ax * LAMP.L; LAMP.oy = LAMP.py + ay * LAMP.L;
    CK = { x0: X(0.255), x1: X(0.645), y0: Y(0.586), y1: Y(0.758), dh: 0.11 * S };
    CK.cx = (CK.x0 + CK.x1) / 2; CK.cy = (CK.y0 + CK.y1) / 2 + 0.004 * S;
    SH = { y: Y(0.36), x0: X(0.3), x1: X(0.84), sx0: X(0.42), sx1: X(0.6), sy0: Y(0.288) };
    MUG = { x: X(-0.035), y: G.y1, w: 0.05 * S, h: 0.058 * S };
    // fairy lights: scallops hung from the curtain rod, a bulb every quarter scallop
    FAIRY = [];
    const r = U.rng(808), ry = Y(0.036), n = 7, xa = X(-0.86), xb = X(0.25), sw = (xb - xa) / n;
    const FC = [C.lampHot, C.rose, C.peach, C.lamp];
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < 4; j++) {
        const u = (j + 0.5) / 4, x = xa + (k + u) * sw, sag = 0.042 * S * (0.85 + 0.3 * hash(k));
        FAIRY.push({ x, y: ry + sag * 4 * u * (1 - u) + 0.004 * S, col: FC[(k * 4 + j) % 4], ph: r() * TAU, sp: 0.4 + r() * 0.5 });
      }
    }
    FAIRY.wire = { xa, sw, n, ry };
  }
  // the two lights of the window as one path (for clipping the view to it)
  function panes(c) { c.rect(G.x0, G.y0, G.l1 - G.x0, G.h); c.rect(G.r0, G.y0, G.x1 - G.r0, G.h); }
  function paneX(rnd) {
    const lw = G.l1 - G.x0, rw = G.x1 - G.r0, u = rnd() * (lw + rw);
    return u < lw ? G.x0 + u : G.r0 + (u - lw);
  }

  // ------------------------------------------------------------------ the work clock: rounded mono-line numerals
  // Drawn as strokes with round caps and joins, so the face is soft and rounded on any machine.
  const GW = 0.54; // glyph width, in glyph heights
  function arcFrom(c, cx, cy, r, a0, a1, ccw) { c.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r); c.arc(cx, cy, r, a0, a1, !!ccw); }
  function glyphPath(c, ch, x, y, h) {
    const w = GW * h, r = w / 2, L = x, R = x + w, T = y, B = y + h, cx = x + r;
    switch (ch) {
      case "0": c.moveTo(L, T + r); c.arc(cx, T + r, r, PI, TAU); c.lineTo(R, B - r); c.arc(cx, B - r, r, 0, PI); c.closePath(); break;
      case "1": c.moveTo(L + w * 0.16, T + h * 0.17); c.lineTo(L + w * 0.58, T); c.lineTo(L + w * 0.58, B); break;
      case "2": {
        arcFrom(c, cx, T + r, r, PI, PI * 2.15);
        const ex = cx + Math.cos(PI * 0.15) * r, ey = T + r + Math.sin(PI * 0.15) * r;
        c.bezierCurveTo(ex - 0.454 * h * 0.22, ey + 0.891 * h * 0.22, L + w * 0.12, B - h * 0.2, L, B); c.lineTo(R, B);
        break;
      }
      case "3": arcFrom(c, cx, T + 0.235 * h, 0.235 * h, PI * 1.12, PI * 2.5); c.arc(cx, B - 0.265 * h, 0.265 * h, PI * 1.5, PI * 2.88); break;
      case "4": c.moveTo(L + w * 0.74, B); c.lineTo(L + w * 0.74, T); c.lineTo(L - w * 0.02, T + h * 0.68); c.lineTo(R + w * 0.06, T + h * 0.68); break;
      case "5":
        c.moveTo(R - w * 0.02, T); c.lineTo(L + w * 0.1, T); c.lineTo(L + w * 0.03, T + h * 0.47);
        c.quadraticCurveTo(L + w * 0.24, B - 2 * r - h * 0.02, cx, B - 2 * r);
        c.arc(cx, B - r, r, PI * 1.5, PI * 2.82);
        break;
      case "6": c.moveTo(R - w * 0.1, T); c.bezierCurveTo(L + w * 0.3, T + h * 0.08, L, T + h * 0.38, L, B - r); c.arc(cx, B - r, r, PI, PI * 3); break;
      case "7": c.moveTo(L, T); c.lineTo(R, T); c.lineTo(L + w * 0.28, B); break;
      case "8": arcFrom(c, cx, T + 0.225 * h, 0.225 * h, 0, TAU); arcFrom(c, cx, B - 0.275 * h, 0.275 * h, PI * 1.5, PI * 3.5); break;
      case "9": c.moveTo(R, T + r); c.arc(cx, T + r, r, 0, TAU); c.bezierCurveTo(R, T + h * 0.62, R - w * 0.3, B - h * 0.03, L + w * 0.1, B); break;
      case ":": c.moveTo(x, T + h * 0.3); c.lineTo(x + 0.001, T + h * 0.3); c.moveTo(x, T + h * 0.76); c.lineTo(x + 0.001, T + h * 0.76); break;
    }
  }
  const glyphAdv = (ch, h) => (ch === ":" ? 0.3 * h : (GW + 0.17) * h);
  function glyphSprite(ch, h, col, glow) {
    const key = `g|${ch}|${h | 0}|${colKey(col)}|${glow}`;
    let s = sprites.get(key);
    if (s) return s;
    const lw = 0.068 * h, pad = Math.ceil(glow * 2.4 + lw + 4);
    const gw = ch === ":" ? 0 : GW * h, w = Math.ceil(gw + pad * 2), hh = Math.ceil(h + pad * 2);
    const { cv, c } = mk(w, hh), cc = U.safe(col);
    c.lineCap = "round"; c.lineJoin = "round"; c.lineWidth = lw;
    c.beginPath(); glyphPath(c, ch, pad, pad, h);
    c.shadowColor = U.rgba(cc, 0.8);
    c.shadowBlur = glow * 2 * dpr; c.strokeStyle = U.rgba(cc, 0.22); c.stroke();
    c.shadowBlur = glow * dpr; c.strokeStyle = U.rgba(cc, 0.3); c.stroke();
    c.shadowBlur = 0; c.strokeStyle = U.rgba(cc, 0.92); c.stroke();
    s = { cv, w, h: hh, pad, gw };
    sprites.set(key, s);
    return s;
  }
  // centred on (cx, cy); k scales the baked sprite
  function glyphClock(ctx, str, cx, cy, h, k, col, glow, a) {
    if (a <= 0.004) return;
    let tw = 0;
    for (let i = 0; i < str.length; i++) tw += glyphAdv(str[i], h) - (i === str.length - 1 && str[i] !== ":" ? 0.17 * h : 0);
    let x = cx - tw * k / 2;
    ctx.globalAlpha = U.clamp(a);
    for (let i = 0; i < str.length; i++) {
      const ch = str[i], adv = glyphAdv(ch, h);
      if (ch !== " ") {
        const s = glyphSprite(ch, h, col, glow);
        const gx = ch === ":" ? x + adv / 2 * k : x;
        ctx.drawImage(s.cv, gx - s.pad * k, cy - (h / 2 + s.pad) * k, s.w * k, s.h * k);
      }
      x += adv * k;
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ the alarm clock: seven segments, ghosts and all
  const SEG7 = { "0": 0x3f, "1": 0x06, "2": 0x5b, "3": 0x4f, "4": 0x66, "5": 0x6d, "6": 0x7d, "7": 0x07, "8": 0x7f, "9": 0x6f, " ": 0 };
  function segSprite(ch, h, col) {
    const key = `s|${ch}|${h | 0}|${colKey(col)}`;
    let s = sprites.get(key);
    if (s) return s;
    const w = 0.5 * h, th = 0.11 * h, pad = Math.ceil(h * 0.22), sl = 0.09 * h;
    const { cv, c } = mk(w + sl + pad * 2, h + pad * 2), cc = U.safe(col);
    // segment endpoints in a w x h box, slanted a little like the old LED clocks
    const xs = (x, y) => pad + x + sl * (1 - y / h), ys = (y) => pad + y;
    const a0 = th / 2, a1 = w - th / 2, b0 = th / 2, bm = h / 2, b1 = h - th / 2, g = th * 0.75;
    const SEGS = [
      [a0 + g, b0, a1 - g, b0], [a1, b0 + g, a1, bm - g], [a1, bm + g, a1, b1 - g], [a0 + g, b1, a1 - g, b1],
      [a0, bm + g, a0, b1 - g], [a0, b0 + g, a0, bm - g], [a0 + g, bm, a1 - g, bm],
    ];
    const bits = SEG7[ch] || 0;
    c.lineCap = "round"; c.lineWidth = th;
    const seg = (i) => { const p = SEGS[i]; c.moveTo(xs(p[0], p[1]), ys(p[1])); c.lineTo(xs(p[2], p[3]), ys(p[3])); };
    // the unlit segments, barely there
    c.beginPath(); for (let i = 0; i < 7; i++) if (!(bits & (1 << i))) seg(i);
    c.strokeStyle = U.rgba(cc, 0.05); c.stroke();
    c.beginPath(); for (let i = 0; i < 7; i++) if (bits & (1 << i)) seg(i);
    c.shadowColor = U.rgba(cc, 0.85);
    c.shadowBlur = h * 0.16 * dpr; c.strokeStyle = U.rgba(cc, 0.3); c.stroke();
    c.shadowBlur = h * 0.06 * dpr; c.strokeStyle = U.rgba(cc, 0.4); c.stroke();
    c.shadowBlur = 0; c.lineWidth = th * 0.8; c.strokeStyle = U.rgba(cc, 0.9); c.stroke();
    s = { cv, w: w + sl + pad * 2, h: h + pad * 2, pad };
    sprites.set(key, s);
    return s;
  }

  // ------------------------------------------------------------------ weather (eased between conditions)
  // Each condition has a presence weight eased toward 1 (the current one) or 0 (the rest) over a few
  // seconds, plus its own intensity, so the window never snaps from one sky to another. null = clear.
  const WXC = ["clear", "cloudy", "fog", "rain", "storm", "snow"];
  const WXP = new Float32Array(6), WXI = new Float32Array(6);
  const WX = { cover: 0, fog: 0, rain: 0, storm: 0, snow: 0, wind: 0, lean: 0, drift: 0, pile: 0, wet: 0 };
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
    WX.cover = U.clamp(WXP[1] * (0.15 + 0.95 * WXI[1]) + WXP[2] * 0.7 + WXP[3] * (0.75 + 0.25 * WXI[3]) + WXP[4] + WXP[5] * 0.9);
    WX.fog = WXP[2] * (0.45 + 0.55 * WXI[2]);
    WX.rain = WXP[3] * WXI[3] + WXP[4] * Math.max(0.85, WXI[4]);
    WX.storm = WXP[4];
    WX.snow = WXP[5] * (0.25 + 0.75 * WXI[5]);
    WX.wind = U.clamp(wxWind / 50);
    WX.lean = WX.wind * (0.85 + 0.3 * U.noise1(t * 0.37) + 0.12 * U.noise1(t * 1.3 + 4));
    WX.drift += WX.lean * dt;   // accumulated wind travel, so flakes never jump when the wind changes
    // the glass wets fast and dries slowly; snow piles on the sill and melts more slowly still
    const wetT = U.clamp(WX.rain * 1.4);
    WX.wet = first ? wetT : WX.wet + (wetT - WX.wet) * (1 - Math.exp(-dt / (wetT > WX.wet ? 2.5 : 16)));
    WX.pile = first ? WX.snow : WX.pile + (WX.snow - WX.pile) * (1 - Math.exp(-dt / (WX.snow > WX.pile ? 6 : 30)));
  }

  // a storm: now and then the sky lights up behind the skyline (rare, dim, deterministic in real time)
  // Each strike has a distance (lnD, 0 near .. 1 far): the far ones flash dimmer and their thunder comes later.
  let lnNext = -1, lnT0 = -100, lnX = 0.5, lnD = 0.5;
  const lrng = U.rng(5150);
  function lightning(t) {
    if (WX.storm < 0.02) { lnNext = -1; return 0; }
    if (lnNext < 0) lnNext = t + 1.5 + lrng() * 4;
    if (t >= lnNext) { lnT0 = t; lnNext = t + 8 + lrng() * 16; lnX = 0.15 + lrng() * 0.7; lnD = hash(t * 1.37 + 0.5); }
    const u = t - lnT0;
    if (u > 1.4) return 0;
    const env = Math.exp(-u * 9) + (u > 0.16 ? 0.75 * Math.exp(-(u - 0.16) * 10) : 0) + (u > 0.45 ? 0.45 * Math.exp(-(u - 0.45) * 8) : 0);
    return U.clamp(env) * WX.storm * (1 - 0.5 * lnD);
  }

  // ------------------------------------------------------------------ the city across the street
  // Three depths: far towers, a row of mid-rises (water tanks, a mast), and the two buildings across the
  // street with the elevated line between them. Every window has its own evening: most are lit at dusk and
  // go dark one by one as people turn in, a few come on late, a few are night owls. A handful are restless
  // (drawn live) and two have a television on.
  let BLD = [], TANKS = [], ACS = [], MAST = null, BEACONS = [], TRACK = 0, STREET = [];
  let NWIN = 0, WXa, WYa, WWa, WHa, WCa, WAa, WONa, WOFFa, WLa, WFLa, WDAYa, WVa;
  let backL = null, frontL = null, viewL = null, bokehL = null, glowL = null, skyL = null, cloudT = null, cloudB = null, cloudF = null;
  let cityKey = "", skyKey = "", cloudKey = "", viewPat = null, bokehPat = null;

  function genCity() {
    const r = U.rng(4242);
    BLD = []; TANKS = []; ACS = []; BEACONS = []; STREET = [];
    const xa = G.vx, xb = G.vx + G.vw;
    // far towers: downtown, hazy, a couple with red aircraft lights
    for (let x = xa - 0.02 * S; x < xb;) {
      const w = (0.034 + r() * 0.05) * S, top = Y(0.205 + r() * 0.13);
      BLD.push({ L: 0, x0: x, x1: x + w, top, bot: Y(0.62), spire: r() < 0.3 });
      x += w + (r() * 0.04 - 0.01) * S;
    }
    const far = BLD.filter((b) => b.L === 0).sort((a, b) => a.top - b.top);
    for (let i = 0; i < 2 && i < far.length; i++) BEACONS.push({ x: (far[i].x0 + far[i].x1) / 2, y: far[i].top - (far[i].spire ? 0.03 * S : 0), ph: i * 0.9 });
    // the mid-rise row
    for (let x = xa - 0.03 * S; x < xb;) {
      const w = (0.075 + r() * 0.1) * S, top = Y(0.335 + r() * 0.095);
      const b = { L: 1, x0: x, x1: x + w, top, bot: Y(0.72), step: r() < 0.3 };
      BLD.push(b);
      if (r() < 0.45) TANKS.push({ x: b.x0 + (0.25 + r() * 0.5) * w, y: top, s: (0.03 + r() * 0.012) * S });
      if (r() < 0.6) ACS.push({ x: b.x0 + r() * w * 0.7, y: top, w: (0.012 + r() * 0.01) * S, h: (0.007 + r() * 0.006) * S });
      x += w + (r() < 0.3 ? r() * 0.025 * S : -0.004 * S);
    }
    // the radio mast rides the mid-rise nearest the left third of the window
    let best = null;
    for (const b of BLD) if (b.L === 1 && (!best || Math.abs((b.x0 + b.x1) / 2 - X(-0.6)) < Math.abs((best.x0 + best.x1) / 2 - X(-0.6)))) best = b;
    if (best) MAST = { x: (best.x0 + best.x1) / 2 + 0.01 * S, base: best.top, top: Y(0.165) };
    // across the street
    BLD.push({ L: 2, x0: xa - 0.02 * S, x1: X(-0.555), top: Y(0.425), bot: Y(0.8), fire: true });
    BLD.push({ L: 2, x0: X(-0.075), x1: xb + 0.02 * S, top: Y(0.372), bot: Y(0.8) });
    TRACK = Y(0.535);
    // street lamps below the sill line: their glow comes up into the bottom of the view
    for (let i = 0; i < 6; i++) STREET.push({ x: G.x0 + (i + 0.3 + r() * 0.4) / 6 * G.w, y: G.y1 + (0.005 + r() * 0.02) * S });

    // windows
    const L0 = { ww: 0.0045, wh: 0.0055, sx: 0.012, sy: 0.016, p: 0.2, m: 0.008 };
    const L1 = { ww: 0.012, wh: 0.015, sx: 0.022, sy: 0.03, p: 0.62, m: 0.01 };
    const L2 = { ww: 0.036, wh: 0.05, sx: 0.064, sy: 0.088, p: 0.8, m: 0.022 };
    const win = [];
    for (const b of BLD) {
      const P = b.L === 0 ? L0 : b.L === 1 ? L1 : L2;
      const ylim = Math.min(b.bot, G.y1 + 0.01 * S);
      for (let y = b.top + P.m * S; y + P.wh * S < ylim; y += P.sy * S) {
        // the track hides the mid-rises behind it; no point lighting what nobody sees
        for (let x = b.x0 + P.m * S; x + P.ww * S < b.x1 - P.m * S * 0.6; x += P.sx * S) {
          if (x + P.ww * S < G.vx || x > G.vx + G.vw) continue;
          if (r() > P.p) continue;
          const q = r();
          let ci = 0; while (ci < 5 && q > WINCUM[ci]) ci++;
          if (b.L === 2 && ci >= 3 && r() < 0.6) ci = 0; // across the street: mostly lamplit rooms
          let on = 0, off;
          const s = r();
          if (s < 0.1) off = 1e9;                                          // night owls and stairwells
          else if (s < 0.75) off = HOUR * (0.4 + Math.pow(r(), 0.8) * 7.5); // turns in
          else { on = HOUR * r() * 2.5; off = on + HOUR * (0.5 + r() * 4); } // comes home late
          win.push([x, y, P.ww * S, P.wh * S, ci, (b.L === 0 ? 0.3 : b.L === 1 ? 0.42 : 0.3) + r() * 0.3, on, off, b.L,
            0, r() < 0.2 ? 1.01 : 0.12 + r() * 0.8, (r() * 5) | 0]);
        }
      }
    }
    NWIN = win.length;
    WXa = new Float32Array(NWIN); WYa = new Float32Array(NWIN); WWa = new Float32Array(NWIN); WHa = new Float32Array(NWIN);
    WCa = new Uint8Array(NWIN); WAa = new Float32Array(NWIN); WONa = new Float32Array(NWIN); WOFFa = new Float32Array(NWIN);
    WLa = new Uint8Array(NWIN); WFLa = new Uint8Array(NWIN); WDAYa = new Float32Array(NWIN); WVa = new Uint8Array(NWIN);
    for (let i = 0; i < NWIN; i++) {
      const w = win[i];
      WXa[i] = w[0]; WYa[i] = w[1]; WWa[i] = w[2]; WHa[i] = w[3]; WCa[i] = w[4]; WAa[i] = w[5];
      WONa[i] = w[6]; WOFFa[i] = w[7]; WLa[i] = w[8]; WDAYa[i] = w[10]; WVa[i] = w[11];
    }
    // the restless ones (on and off all evening) and two televisions, drawn live rather than baked
    let picked = 0;
    for (let tries = 0; tries < 400 && picked < 12; tries++) {
      const i = (r() * NWIN) | 0;
      if (WLa[i] === 0 || WFLa[i]) continue;
      WFLa[i] = picked < 2 ? 2 : 1;
      if (picked < 2) { WCa[i] = 4; WONa[i] = 0; WOFFa[i] = HOUR * (4 + picked * 2); }
      picked++;
    }
  }
  const isLit = (i, el, dayK) => el >= WONa[i] && el < WOFFa[i] && dayK < WDAYa[i];
  // a cheap signature of the baked window set: changes exactly when a window goes on or off
  function litSig(el, dayK) {
    let h = 7;
    for (let i = 0; i < NWIN; i++) if (!WFLa[i] && isLit(i, el, dayK)) h = (Math.imul(h, 31) + i) | 0;
    return h;
  }

  function tank(c, x, y, s, dust) {
    const lw = s * 0.5, bw = s * 0.8, bh = s * 0.75, by = y - lw;
    c.beginPath();
    c.moveTo(x - bw * 0.42, y); c.lineTo(x - bw * 0.36, by); c.moveTo(x + bw * 0.42, y); c.lineTo(x + bw * 0.36, by);
    c.moveTo(x, y); c.lineTo(x, by); c.moveTo(x - bw * 0.4, y - lw * 0.45); c.lineTo(x + bw * 0.4, y - lw * 0.45);
    c.lineWidth = 1.2; c.strokeStyle = "#000"; c.stroke();
    rim(c, C.lav, 0.12, 0.8);
    c.beginPath();
    c.moveTo(x - bw / 2, by); c.lineTo(x - bw / 2, by - bh); c.lineTo(x, by - bh - s * 0.3); c.lineTo(x + bw / 2, by - bh); c.lineTo(x + bw / 2, by); c.closePath();
    blk(c); rim(c, C.lav, 0.24, 1);
    c.beginPath(); c.moveTo(x, by - bh - s * 0.3); c.lineTo(x, by - bh - s * 0.42); rim(c, C.lav, 0.2, 0.8);
    c.beginPath(); for (const f of [0.3, 0.62]) { c.moveTo(x - bw / 2, by - bh * f); c.lineTo(x + bw / 2, by - bh * f); }
    c.lineWidth = 0.8; c.strokeStyle = U.rgba(U.safe(C.lav), 0.1); c.stroke();
    if (dust > 0) {
      c.beginPath(); c.moveTo(x - bw / 2 - 1, by - bh); c.lineTo(x, by - bh - s * 0.3); c.lineTo(x + bw / 2 + 1, by - bh);
      c.lineWidth = 1 + 1.6 * dust; c.strokeStyle = U.rgba(U.safe(C.snow), 0.4 * dust); c.stroke();
    }
  }

  function building(c, b, dust) {
    c.beginPath(); c.rect(b.x0, b.top, b.x1 - b.x0, b.bot - b.top);
    if (b.step) { const w = b.x1 - b.x0; c.rect(b.x0 + w * 0.22, b.top - 0.025 * S, w * 0.5, 0.026 * S); }
    if (b.spire) { const m = (b.x0 + b.x1) / 2; c.rect(m - 0.0015 * S, b.top - 0.03 * S, 0.003 * S, 0.031 * S); }
    blk(c);
    // the far towers stand in the city's haze: a shade lighter than the street, a shade darker than the sky
    if (b.L === 0) { c.fillStyle = U.rgba(U.safe(C.dusk), 0.075); c.fill(); }
    // the roofline catches the sky glow; the edges barely
    const rc = b.L === 0 ? C.dusk : C.lav, ra = b.L === 0 ? 0.16 : b.L === 1 ? 0.26 : 0.3;
    c.beginPath();
    if (b.step) {
      const w = b.x1 - b.x0, s0 = b.x0 + w * 0.22, s1 = s0 + w * 0.5, st = b.top - 0.025 * S;
      c.moveTo(b.x0, b.top); c.lineTo(s0, b.top); c.lineTo(s0, st); c.lineTo(s1, st); c.lineTo(s1, b.top); c.lineTo(b.x1, b.top);
    } else { c.moveTo(b.x0, b.top); c.lineTo(b.x1, b.top); }
    rim(c, rc, ra, 1);
    const g = c.createLinearGradient(0, b.top, 0, b.top + 0.12 * S);
    g.addColorStop(0, U.rgba(U.safe(rc), ra * 0.5)); g.addColorStop(1, U.rgba(U.safe(rc), 0));
    c.strokeStyle = g; c.lineWidth = 1;
    c.beginPath(); c.moveTo(b.x0 + 0.5, b.top); c.lineTo(b.x0 + 0.5, b.top + 0.12 * S); c.moveTo(b.x1 - 0.5, b.top); c.lineTo(b.x1 - 0.5, b.top + 0.12 * S); c.stroke();
    if (dust > 0 && b.L > 0) {
      c.beginPath(); c.moveTo(b.x0, b.top - 0.5); c.lineTo(b.x1, b.top - 0.5);
      c.lineWidth = 1 + 2.2 * dust; c.strokeStyle = U.rgba(U.safe(C.snow), 0.4 * dust); c.stroke();
    }
  }

  // a lit window across the street: light, and the life in it
  function nearWindow(c, i) {
    const x = WXa[i], y = WYa[i], w = WWa[i], h = WHa[i], a = WAa[i], col = U.safe(WINPAL[WCa[i]]), v = WVa[i];
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, U.rgba(col, a * 0.55)); g.addColorStop(1, U.rgba(col, a));
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.fillStyle = "#000";
    if (v === 1) {
      // a blind half down, its slats lit through
      const bh = h * (0.3 + 0.25 * hash(i));
      c.globalAlpha = 0.7; c.fillRect(x, y, w, bh); c.globalAlpha = 1;
      c.fillStyle = U.rgba(col, a * 0.35);
      for (let yy = y + 2; yy < y + bh - 1; yy += 3) c.fillRect(x, yy, w, 1);
    } else if (v === 2) {
      // curtains drawn to the sides
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + w * 0.3, y); c.quadraticCurveTo(x + w * 0.12, y + h * 0.5, x + w * 0.22, y + h); c.lineTo(x, y + h); c.fill();
      c.beginPath(); c.moveTo(x + w, y); c.lineTo(x + w * 0.72, y); c.quadraticCurveTo(x + w * 0.88, y + h * 0.5, x + w * 0.8, y + h); c.lineTo(x + w, y + h); c.fill();
    } else if (v === 3) {
      // a plant on the sill
      const px = x + w * (0.25 + 0.5 * hash(i + 3)), py = y + h;
      c.fillRect(px - w * 0.08, py - h * 0.14, w * 0.16, h * 0.14);
      for (let k = 0; k < 5; k++) {
        const an = -PI / 2 + (k - 2) * 0.45;
        c.beginPath(); c.ellipse(px + Math.cos(an) * h * 0.14, py - h * 0.14 + Math.sin(an) * h * 0.14, h * 0.1, h * 0.04, an, 0, TAU); c.fill();
      }
    } else if (v === 4) {
      // a pendant lamp hanging into the room
      const px = x + w * 0.5;
      c.fillRect(px - 0.5, y, 1, h * 0.3);
      c.beginPath(); c.moveTo(px - w * 0.14, y + h * 0.42); c.lineTo(px - w * 0.05, y + h * 0.3); c.lineTo(px + w * 0.05, y + h * 0.3); c.lineTo(px + w * 0.14, y + h * 0.42); c.fill();
      c.fillStyle = U.rgba(U.safe(C.lampHot), a * 0.8); c.fillRect(px - w * 0.1, y + h * 0.42, w * 0.2, 1.5);
    }
    // the window's own frame
    c.fillStyle = "#000";
    c.fillRect(x + w / 2 - 0.75, y, 1.5, h); c.fillRect(x, y + h * 0.4, w, 1.5);
  }

  function bakeCity(el, dayK, dust) {
    const xa = G.vx, xb = G.vx + G.vw;
    // ---- behind the line: the far towers, the mid-rises, the street's glow coming up between them
    let c = backL.c;
    c.clearRect(G.vx, G.vy, G.vw, G.vh);
    c.lineCap = "round"; c.lineJoin = "round";
    for (const b of BLD) if (b.L === 0) building(c, b, dust);
    for (let ci = 0; ci < 6; ci++) {
      c.fillStyle = WINCSS[ci];
      for (let i = 0; i < NWIN; i++) {
        if (WLa[i] !== 0 || WCa[i] !== ci || WFLa[i] || !isLit(i, el, dayK)) continue;
        c.globalAlpha = WAa[i]; c.fillRect(WXa[i], WYa[i], WWa[i], WHa[i]);
      }
    }
    c.globalAlpha = 1;
    for (const b of BLD) if (b.L === 1) building(c, b, dust);
    if (MAST) {
      // a lattice mast: two legs closing to a point, braced in a zigzag
      const m = MAST, hw = 0.011 * S, n = 9;
      c.beginPath(); c.moveTo(m.x - hw, m.base); c.lineTo(m.x, m.top); c.lineTo(m.x + hw, m.base);
      for (let k = 0; k < n; k++) {
        const y0 = U.lerp(m.base, m.top, k / n), y1 = U.lerp(m.base, m.top, (k + 1) / n);
        const w0 = hw * (1 - k / n), w1 = hw * (1 - (k + 1) / n);
        c.moveTo(m.x - w0, y0); c.lineTo(m.x + w1, y1);
      }
      c.lineWidth = 1.1; c.strokeStyle = "#000"; c.stroke(); rim(c, C.lav, 0.2, 0.8);
    }
    for (const a of ACS) { c.beginPath(); c.rect(a.x, a.y - a.h, a.w, a.h); blk(c); rim(c, C.lav, 0.18, 0.8); }
    for (const tk of TANKS) tank(c, tk.x, tk.y, tk.s, dust);
    for (let ci = 0; ci < 6; ci++) {
      c.fillStyle = WINCSS[ci];
      for (let i = 0; i < NWIN; i++) {
        if (WLa[i] !== 1 || WCa[i] !== ci || WFLa[i] || !isLit(i, el, dayK)) continue;
        c.globalAlpha = WAa[i]; c.fillRect(WXa[i], WYa[i], WWa[i], WHa[i]);
      }
    }
    c.globalAlpha = 1;
    {
      const sc = U.safe(C.street), g = c.createLinearGradient(0, G.y1 + 0.03 * S, 0, Y(0.5));
      g.addColorStop(0, U.rgba(sc, 0.12)); g.addColorStop(0.45, U.rgba(sc, 0.04)); g.addColorStop(1, U.rgba(sc, 0));
      c.fillStyle = g; c.fillRect(xa, Y(0.5), xb - xa, G.y1 + 0.05 * S - Y(0.5));
    }
    // ---- in front: the elevated line on its pillars, and the two buildings across the street
    c = frontL.c;
    c.clearRect(G.vx, G.vy, G.vw, G.vh);
    c.lineCap = "round"; c.lineJoin = "round";
    {
      const th = 0.014 * S;
      for (let x = xa + 0.06 * S; x < xb; x += 0.21 * S) {
        c.beginPath(); c.rect(x, TRACK + th, 0.012 * S, G.vy + G.vh - TRACK); blk(c);
        c.beginPath(); c.moveTo(x, TRACK + th); c.lineTo(x, G.y1 + 0.02 * S); rim(c, C.lav, 0.1, 0.8);
      }
      c.beginPath(); c.rect(xa, TRACK, xb - xa, th); blk(c);
      c.beginPath(); c.moveTo(xa, TRACK); c.lineTo(xb, TRACK); rim(c, C.lav, 0.24, 1);
      c.beginPath(); c.moveTo(xa, TRACK + th); c.lineTo(xb, TRACK + th); rim(c, C.street, 0.16, 0.9);
      if (dust > 0) { c.beginPath(); c.moveTo(xa, TRACK - 0.5); c.lineTo(xb, TRACK - 0.5); c.lineWidth = 1 + 2 * dust; c.strokeStyle = U.rgba(U.safe(C.snow), 0.38 * dust); c.stroke(); }
    }
    for (const b of BLD) {
      if (b.L !== 2) continue;
      building(c, b, dust);
      if (b.fire) {
        // a fire escape zigzagging down the face: landings under each row, a stair between them
        const fx0 = b.x1 - 0.13 * S, fx1 = b.x1 - 0.015 * S;
        c.beginPath();
        for (let y = b.top + 0.075 * S, k = 0; y < G.y1 + 0.02 * S; y += 0.088 * S, k++) {
          c.moveTo(fx0, y); c.lineTo(fx1, y);
          c.moveTo(fx0, y - 0.022 * S); c.lineTo(fx1, y - 0.022 * S);
          for (let x = fx0; x <= fx1 + 0.5; x += 0.0118 * S) { c.moveTo(x, y); c.lineTo(x, y - 0.022 * S); }
          if (k % 2) { c.moveTo(fx0 + 0.01 * S, y); c.lineTo(fx1 - 0.03 * S, y + 0.088 * S); }
          else { c.moveTo(fx1 - 0.01 * S, y); c.lineTo(fx0 + 0.03 * S, y + 0.088 * S); }
        }
        c.lineWidth = 1; c.strokeStyle = U.rgba(U.safe(C.lav), 0.16); c.stroke();
      }
    }
    for (let i = 0; i < NWIN; i++) if (WLa[i] === 2 && !WFLa[i] && isLit(i, el, dayK)) nearWindow(c, i);
    if (dust > 0) for (const b of BLD) if (b.L === 2 && b.fire) {
      const fx0 = b.x1 - 0.13 * S, fx1 = b.x1 - 0.015 * S;
      c.beginPath();
      for (let y = b.top + 0.075 * S; y < G.y1 + 0.02 * S; y += 0.088 * S) { c.moveTo(fx0, y - 0.5); c.lineTo(fx1, y - 0.5); }
      c.lineWidth = 1 + 1.4 * dust; c.strokeStyle = U.rgba(U.safe(C.snow), 0.3 * dust); c.stroke();
    }
    // ---- the sharp view, both depths together: what the beads on the glass refract
    c = viewL.c;
    c.clearRect(G.vx, G.vy, G.vw, G.vh);
    c.drawImage(backL.cv, G.vx, G.vy, G.vw, G.vh); c.drawImage(frontL.cv, G.vx, G.vy, G.vw, G.vh);
    // ---- fog: the near lights as big soft blobs, the far city all but gone
    c = glowL.c;
    c.clearRect(G.vx, G.vy, G.vw, G.vh);
    for (let i = 0; i < NWIN; i++) {
      if (WFLa[i] || !isLit(i, el, dayK)) continue;
      const L = WLa[i], rad = (L === 0 ? 0.012 : L === 1 ? 0.034 : 0.07) * S * (0.8 + 0.5 * hash(i * 3.3));
      c.globalAlpha = U.clamp(WAa[i] * (L === 0 ? 0.15 : L === 1 ? 0.9 : 1.2));
      c.drawImage(dotSprite(WINPAL[WCa[i]]).cv, WXa[i] + WWa[i] / 2 - rad, WYa[i] + WHa[i] / 2 - rad, rad * 2, rad * 2);
    }
    for (const s of STREET) { const rad = 0.11 * S; c.globalAlpha = 0.7; c.drawImage(dotSprite(C.street).cv, s.x - rad, s.y - rad, rad * 2, rad * 2); }
    c.globalAlpha = 1;
    // ---- the bokeh: every lit window as a soft out-of-focus disc, and the street lamps below
    c = bokehL.c;
    c.clearRect(G.vx, G.vy, G.vw, G.vh);
    for (let i = 0; i < NWIN; i++) {
      if (WFLa[i] || !isLit(i, el, dayK)) continue;
      const L = WLa[i], rad = (L === 0 ? 0.006 : L === 1 ? 0.0125 : 0.03) * S * (0.8 + 0.5 * hash(i * 7.1));
      const d = discSprite(WINPAL[WCa[i]]);
      c.globalAlpha = WAa[i] * (L === 2 ? 0.5 : 0.75);
      c.drawImage(d.cv, WXa[i] + WWa[i] / 2 - rad, WYa[i] + WHa[i] / 2 - rad, rad * 2, rad * 2);
    }
    for (const s of STREET) {
      const rad = 0.045 * S, d = discSprite(C.street);
      c.globalAlpha = 0.4; c.drawImage(d.cv, s.x - rad, s.y - rad, rad * 2, rad * 2);
    }
    c.globalAlpha = 1;
    {
      const sc = U.safe(C.street), g = c.createLinearGradient(0, G.y1 + 0.03 * S, 0, Y(0.42));
      g.addColorStop(0, U.rgba(sc, 0.1)); g.addColorStop(1, U.rgba(sc, 0));
      c.fillStyle = g; c.fillRect(xa, Y(0.42), xb - xa, G.y1 + 0.05 * S - Y(0.42));
    }
  }

  // ------------------------------------------------------------------ the sky (cached by sun, cloud and moon)
  function moonPhase(now) {
    const syn = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14);
    const d = (now.getTime() - ref) / 86400000;
    return ((d % syn) + syn) % syn / syn; // 0 new, 0.5 full
  }
  function paintSky(elev, cover, fog, phase) {
    const c = skyL.c;
    c.clearRect(G.vx, G.vy, G.vw, G.vh);
    const night = 1 - U.smoothstep(-12, -3, elev), day = U.smoothstep(-1, 8, elev), dusk = U.clamp(1 - night - day);
    const mix3 = (a, b, d) => ({ r: a.r * night + b.r * dusk + d.r * day, g: a.g * night + b.g * dusk + d.g * day, b: a.b * night + b.b * dusk + d.b * day });
    let top = mix3(C.skyNightTop, C.skyDuskTop, C.skyDayTop), low = mix3(C.skyNightLow, C.skyDuskLow, C.skyDayLow);
    // cloud and fog flatten the sky toward a dull lid
    top = U.mix(top, C.cloudTop, cover * 0.6); low = U.mix(low, U.mix(C.murk, C.cloudLow, 0.5), Math.max(cover * 0.4, fog * 0.7));
    const hz = (Y(0.47) - G.vy) / G.vh;
    const g = c.createLinearGradient(0, G.vy, 0, G.vy + G.vh);
    g.addColorStop(0, U.rgba(U.safe(top), 0.08)); g.addColorStop(hz * 0.55, U.rgba(U.safe(U.mix(top, low, 0.4)), 0.09));
    g.addColorStop(hz, U.rgba(U.safe(low), 0.12)); g.addColorStop(1, U.rgba(U.safe(low), 0.11));
    c.fillStyle = g; c.fillRect(G.vx, G.vy, G.vw, G.vh);
    const clear = Math.pow(1 - cover, 1.5) * (1 - fog) * (1 - day);
    if (clear > 0.01) {
      // stars over the rooftops
      const r = U.rng(2207), sc = U.safe(C.star);
      for (let i = 0; i < 70; i++) {
        const sx = G.x0 + r() * G.w, sy = G.y0 + Math.pow(r(), 1.25) * (Y(0.4) - G.y0), s = 0.5 + r() * 0.9;
        c.fillStyle = U.rgba(sc, (0.2 + 0.45 * r()) * clear * (night + 0.3 * dusk));
        c.beginPath(); c.arc(sx, sy, s, 0, TAU); c.fill();
      }
      // the moon, its real phase (never quite gone: a new moon shows the slimmest crescent)
      const mx = X(-0.13), my = Y(0.205), mr = 0.021 * S, mc = U.safe(C.moon);
      const p = phase < 0.5 ? U.clamp(phase, 0.13, 0.5) : U.clamp(phase, 0.5, 0.87), kk = Math.cos(TAU * p);
      const mg = c.createRadialGradient(mx, my, 0, mx, my, mr * 7);
      mg.addColorStop(0, U.rgba(mc, 0.1 * clear * (1 - 0.4 * kk))); mg.addColorStop(1, U.rgba(mc, 0));
      c.fillStyle = mg; c.fillRect(mx - mr * 7, my - mr * 7, mr * 14, mr * 14);
      c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.fillStyle = U.rgba(mc, 0.06 * clear); c.fill();
      c.save(); c.translate(mx, my); if (p > 0.5) c.scale(-1, 1);
      c.beginPath(); c.arc(0, 0, mr, -PI / 2, PI / 2, false);
      if (kk > 0) c.ellipse(0, 0, mr * kk, mr, 0, PI / 2, -PI / 2, true);
      else c.ellipse(0, 0, -mr * kk, mr, 0, PI / 2, PI * 1.5, false);
      c.closePath(); c.fillStyle = U.rgba(mc, 0.72 * clear); c.fill();
      c.restore();
    }
  }

  // Clouds: one small seamless (in x) noise field, tinted into a low-res canvas per cover / sun state and
  // stretched over the sky. A low deck: thickest and lit pinkest at its underside, from the city below.
  const CT_W = 320, CT_H = 80;
  function cloudField() {
    cloudF = new Float32Array(CT_W * CT_H);
    let lo = 1e9, hi = -1e9;
    for (let y = 0; y < CT_H; y++) {
      for (let x = 0; x < CT_W; x++) {
        const u = x / CT_W, fx = x * 0.035, fy = y * 0.07;
        const a = U.fbm2(fx, fy, 5), b = U.fbm2(fx - CT_W * 0.035, fy, 5);
        const v = a * (1 - u) + b * u;
        cloudF[y * CT_W + x] = v; if (v < lo) lo = v; if (v > hi) hi = v;
      }
    }
    for (let i = 0; i < cloudF.length; i++) cloudF[i] = (cloudF[i] - lo) / (hi - lo || 1);
    cloudT = document.createElement("canvas"); cloudT.width = CT_W; cloudT.height = CT_H;
    cloudB = document.createElement("canvas"); cloudB.width = CT_W * 4; cloudB.height = CT_H * 4;
  }
  function paintClouds(cover, elev) {
    const c = cloudT.getContext("2d"), img = c.createImageData(CT_W, CT_H), d = img.data;
    const day = U.smoothstep(-1, 8, elev), dusk = U.clamp(1 - (1 - U.smoothstep(-12, -3, elev)) - day);
    const lowC = U.safe(U.mix(U.mix(C.cloudLow, C.cloudDuskLow, dusk), C.cloudDay, day)), topC = U.safe(U.mix(U.mix(C.cloudTop, C.cloudDay, day * 0.7), C.cloudDayTop, day * day));
    const th = 1 - cover * 0.95;
    for (let y = 0; y < CT_H; y++) {
      const v = y / (CT_H - 1), lit = 0.35 + 0.65 * Math.pow(v, 1.4), edge = U.smoothstep(0, 0.12, v) * (1 - U.smoothstep(0.8, 1, v));
      const yb = Math.min(CT_H - 1, y + 3);
      for (let x = 0; x < CT_W; x++) {
        const n = cloudF[y * CT_W + x] + (v - 0.5) * 0.12;
        // where a billow thins going down is its underside: that is where the city's glow catches it
        const under = U.clamp((cloudF[y * CT_W + x] - cloudF[yb * CT_W + x]) * 6);
        const dens = U.smoothstep(th - 0.22, th + 0.3, n);
        const k = U.clamp(v * 0.6 + under * 0.7), br = U.lerp(0.6 + 0.4 * n + 0.5 * under, 0.92 + 0.32 * n - 0.2 * under, day);
        const a = dens * edge * (0.3 + 0.7 * lit) * (0.5 + 0.5 * cover);
        const o = (y * CT_W + x) * 4;
        d[o] = Math.min(215, U.lerp(topC.r, lowC.r, k) * br); d[o + 1] = Math.min(215, U.lerp(topC.g, lowC.g, k) * br);
        d[o + 2] = Math.min(215, U.lerp(topC.b, lowC.b, k) * br); d[o + 3] = Math.round(255 * U.clamp(a * (0.5 + 0.35 * day)));
      }
    }
    c.putImageData(img, 0, 0);
    // soften once into a bigger canvas, so the stretch over the sky never shows the texels
    const b = cloudB.getContext("2d");
    b.clearRect(0, 0, cloudB.width, cloudB.height);
    b.filter = "blur(3px)"; b.imageSmoothingEnabled = true;
    for (const ox of [-1, 0, 1]) b.drawImage(cloudT, ox * CT_W * 4, 0, CT_W * 4, CT_H * 4); // wrapped, so the seam blurs too
    b.filter = "none";
  }

  // ------------------------------------------------------------------ rain on the glass
  // Beads sit on the glass and grow; now and then one gets heavy and runs down in fits and starts, eating
  // the beads in its path and leaving a clear wet track through the blur. Each bead is a little lens: it holds
  // the city behind it small and upside down (a pattern fill of the sharp view, inverted about the bead).
  const NB = 90, NS = 260, NR = 64;
  const BX = new Float32Array(NB), BY = new Float32Array(NB), BR = new Float32Array(NB), B0 = new Float32Array(NB), B1 = new Float32Array(NB);
  const SX = new Float32Array(NS), SY = new Float32Array(NS), SR = new Float32Array(NS), S0 = new Float32Array(NS), S1 = new Float32Array(NS);
  const RX = new Float32Array(NR), RY = new Float32Array(NR), RR = new Float32Array(NR), RV = new Float32Array(NR);
  const RP = new Float32Array(NR), RT = new Float32Array(NR), RS = new Uint8Array(NR);
  let glassInit = false;
  const grng = U.rng(9091);
  const PM = typeof DOMMatrix !== "undefined" ? new DOMMatrix() : null;
  function bead(i, t, delay) {
    BX[i] = paneX(grng); BY[i] = G.y0 + grng() * G.h; BR[i] = (0.0045 + Math.pow(grng(), 2.2) * 0.011) * S;
    B0[i] = t + delay; B1[i] = B0[i] + 12 + grng() * 40;
  }
  function speck(i, t, delay) {
    SX[i] = paneX(grng); SY[i] = G.y0 + grng() * G.h; SR[i] = (0.0011 + grng() * 0.0026) * S;
    S0[i] = t + delay; S1[i] = S0[i] + 15 + grng() * 50;
  }
  function runner(i, t, nb) {
    // most runners start as a bead that got too heavy
    let j = -1;
    for (let k = 0; k < 5 && nb > 0; k++) {
      const q = (grng() * nb) | 0;
      if (t > B0[q] + 1.2 && t < B1[q] && BY[q] < G.y0 + G.h * 0.75) { j = q; break; }
    }
    if (j >= 0) { RX[i] = BX[j]; RY[i] = BY[j]; RR[i] = Math.max(0.0055 * S, BR[j] * 1.1); B1[j] = t; }
    else { RX[i] = paneX(grng); RY[i] = G.y0 + grng() * G.h * 0.5; RR[i] = (0.0055 + grng() * 0.004) * S; }
    RV[i] = (0.05 + grng() * 0.09) * S; RT[i] = 0; RP[i] = 0; RS[i] = 1;
  }
  function seedGlass(t) {
    for (let i = 0; i < NB; i++) bead(i, t, -grng() * 30);
    for (let i = 0; i < NS; i++) speck(i, t, -grng() * 40);
    for (let i = 0; i < NR; i++) {
      runner(i, t, 0);
      if (grng() < 0.5) { RT[i] = grng() * 0.12 * S; } else { RS[i] = 0; RP[i] = grng() * 3; }
    }
    glassInit = true;
  }
  // the pattern shows source point (qx, qy) of the view at (cx, cy), scaled by k (negative = inverted)
  function patAt(pat, k, cx, cy, qx, qy) {
    PM.a = k / dpr; PM.b = 0; PM.c = 0; PM.d = k / dpr;
    PM.e = cx + k * (G.vx - qx); PM.f = cy + k * (G.vy - qy);
    pat.setTransform(PM);
    return pat;
  }

  const MIST_CSS = U.rgba(U.safe(C.dusk), 1), BLACK = "#000";
  const MIST_DAY = "rgb(118,122,128)", GLINT_DAY = "rgb(150,156,166)", SNOW_DAY = "rgb(118,126,142)", FOG_D = { r: 128, g: 130, b: 132 };
  let fogDayG = null;
  const LAV_CSS = U.rgba(U.safe(C.lav), 1), LAMP_CSS = U.rgba(U.safe(C.lampHot), 1);
  function drawGlass(ctx, t, dt, a, nk) {
    const rk = U.clamp(WX.rain), wet = WX.wet;
    if (a <= 0.004 || (wet < 0.01 && rk < 0.01)) return;
    if (!glassInit) seedGlass(t);
    const nbF = NB * U.clamp(wet * 1.05), nsF = NS * U.clamp(wet * 1.15), nr = Math.round(NR * U.clamp(Math.pow(rk, 1.8) * 1.12));
    const nb = Math.ceil(nbF), ns = Math.floor(nsF);
    const px = S / 1080;
    // beads come and go; the gone come back somewhere else
    for (let i = 0; i < nb; i++) if (t > B1[i] + 0.05) bead(i, t, 0.4 + grng() * 3 / (0.25 + rk));
    for (let i = 0; i < ns; i++) if (t > S1[i] + 0.05) speck(i, t, 0.3 + grng() * 2 / (0.25 + rk));
    // runners: sit, slide, catch, slide; faster and slanted in a storm
    const sp = (1 + 1.5 * WX.storm) * (0.7 + 0.6 * rk), maxT = (0.16 + 0.2 * WX.storm) * S, slant = WX.lean * 0.35;
    const wf = 0.03 / px, WA = 0.1; // runners meander: dx/dy = slant + WA sin(wf y + i)
    for (let i = 0; i < nr; i++) {
      if (RS[i] === 0) { RP[i] -= dt; if (RP[i] <= 0) runner(i, t, nb); continue; }
      let moving = false;
      if (RP[i] > 0) { RP[i] -= dt; RT[i] = Math.max(0, RT[i] - 0.012 * S * dt); }
      else {
        const d = RV[i] * sp * dt;
        RY[i] += d; RT[i] = Math.min(maxT, RT[i] + d); RX[i] += d * (slant + WA * Math.sin(RY[i] * wf + i));
        if (grng() < dt * (0.9 - 0.6 * WX.storm)) RP[i] = 0.15 + grng() * 1.3 * (1 - 0.7 * WX.storm);
        moving = true;
      }
      if (moving) {
        const r = RR[i];
        for (let j = 0; j < nb; j++) {
          if (t < B0[j] || t >= B1[j]) continue;
          const dy = BY[j] - RY[i];
          if (dy < r * 0.8 && dy > -r * 3 && Math.abs(BX[j] - RX[i]) < r + BR[j] * 0.8) { B1[j] = t; RR[i] = Math.min(0.0135 * S, r + BR[j] * 0.12); }
        }
        for (let j = 0; j < ns; j++) {
          if (t < S0[j] || t >= S1[j]) continue;
          const dy = SY[j] - RY[i];
          if (dy < r && dy > -r * 3 && Math.abs(SX[j] - RX[i]) < r + SR[j]) S1[j] = t;
        }
      }
      if (RY[i] > G.y1 + RR[i] * 2) { RS[i] = 0; RP[i] = grng() * 2.5 / Math.max(0.15, rk); }
    }

    // the glass mists over in the wet
    ctx.globalAlpha = a * 0.035 * wet * nk; ctx.fillStyle = MIST_CSS; ctx.fillRect(G.x0, G.y0, G.w, G.h);
    if (DAY > 0.004) { ctx.globalAlpha = a * 0.08 * wet * DAY; ctx.fillStyle = MIST_DAY; ctx.fillRect(G.x0, G.y0, G.w, G.h); }
    // The sharp view and the bokeh are added with "lighter": the buildings' black adds nothing, so a bead or
    // a wiped track only ever brings light through, never punches a hole in the glow.
    const refrN = !!(PM && viewPat && bokehPat) && nk > 0.001, refrD = !!(PM && dayViewPat) && DAY > 0.004, refr = refrN || refrD;
    // runner tracks: wiped clear, so the sharp city shows through the blur (a touch darker: less scatter)
    if (refr) {
      ctx.beginPath();
      for (let i = 0; i < nr; i++) {
        if (RS[i] === 0 || RT[i] < 2) continue;
        // the track follows the runner's own meander back up the glass
        const c0 = Math.cos(wf * RY[i] + i), y1 = RY[i] - RR[i] * 0.6;
        for (let q = 0; q <= 7; q++) {
          const yy = U.lerp(y1, RY[i] - RT[i], q / 7), xx = RX[i] - slant * (RY[i] - yy) - WA / wf * (Math.cos(wf * yy + i) - c0);
          q ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
        }
      }
      // a stream of water is a long thin lens: dark at its edges, and down its middle the lights above it
      const tw = (0.0062 + 0.002 * WX.storm) * S;
      ctx.lineCap = "round"; ctx.lineWidth = tw + 2.2 * px;
      ctx.strokeStyle = BLACK; ctx.globalAlpha = a * 0.26 * wet; ctx.stroke();
      if (refrN) {
        ctx.globalCompositeOperation = "lighter"; ctx.lineWidth = tw * 0.7;
        ctx.strokeStyle = patAt(bokehPat, 1, 0, -0.03 * S, 0, 0); ctx.globalAlpha = a * 0.42 * nk; ctx.stroke();
        ctx.strokeStyle = patAt(viewPat, 1, 0, -0.012 * S, 0, 0); ctx.globalAlpha = a * 0.36 * nk; ctx.stroke();
        ctx.strokeStyle = LAV_CSS; ctx.lineWidth = 0.9 * px; ctx.globalAlpha = a * 0.05 * nk; ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
      if (refrD) {
        // by day the stream is a clear lens on the day behind the blur
        ctx.lineWidth = tw * 0.7; ctx.strokeStyle = patAt(dayViewPat, 1, 0, -0.012 * S, 0, 0); ctx.globalAlpha = a * 0.7 * DAY; ctx.stroke();
      }
    }
    // specks: tiny clear lenses
    ctx.beginPath();
    for (let i = 0; i < ns; i++) {
      if (t < S0[i]) continue;
      const g = U.smoothstep(S0[i], S0[i] + 1, t) * (1 - U.smoothstep(S1[i] - 1.2, S1[i], t)), r = SR[i] * g;
      if (r < 0.3) continue;
      ctx.moveTo(SX[i] + r, SY[i]); ctx.arc(SX[i], SY[i], r, 0, TAU);
    }
    ctx.fillStyle = BLACK; ctx.globalAlpha = a * 0.16; ctx.fill();
    if (refrN) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = patAt(bokehPat, 1, 0, -0.008 * S, 0, 0); ctx.globalAlpha = a * 0.45 * nk; ctx.fill();
      ctx.fillStyle = patAt(viewPat, 1, 0, -0.005 * S, 0, 0); ctx.globalAlpha = a * 0.5 * nk; ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
    if (refrD) { ctx.fillStyle = patAt(dayViewPat, 1, 0, -0.005 * S, 0, 0); ctx.globalAlpha = a * 0.6 * DAY; ctx.fill(); }
    // their glints: the lamp in the room, caught on the upper edge
    ctx.beginPath();
    for (let i = 0; i < ns; i++) {
      if (t < S0[i] || SR[i] < 0.002 * S) continue;
      const g = U.smoothstep(S0[i], S0[i] + 1, t) * (1 - U.smoothstep(S1[i] - 1.2, S1[i], t));
      const r = 0.7 * px * g + 0.3;
      ctx.moveTo(SX[i] + SR[i] * 0.3 + r, SY[i] - SR[i] * 0.4); ctx.arc(SX[i] + SR[i] * 0.3, SY[i] - SR[i] * 0.4, r, 0, TAU);
    }
    ctx.fillStyle = LAMP_CSS; ctx.globalAlpha = a * 0.28 * nk; ctx.fill();
    if (DAY > 0.004) { ctx.fillStyle = GLINT_DAY; ctx.globalAlpha = a * 0.3 * DAY; ctx.fill(); }

    const lensY = Y(0.5);
    // beads: darken a little, then the lens: a soft wide glow of the bokeh and the sharp city, both upside down
    const drop = (x, y, r, ry, al) => {
      ctx.beginPath(); ctx.ellipse(x, y, r, ry, 0, 0, TAU);
      if (!refr) { ctx.fillStyle = LAV_CSS; ctx.globalAlpha = a * al * 0.12; ctx.fill(); return; }
      // a bead on a vertical pane sees wide: aim it at the lit city below the skyline, not the sky behind it
      const qy = U.lerp(y, lensY, 0.6);
      if (refrN) {
        ctx.fillStyle = patAt(bokehPat, -0.22, x, y, x, qy); ctx.globalAlpha = a * al * 0.38 * nk; ctx.fill();
        ctx.fillStyle = patAt(viewPat, -0.13, x, y, x, qy); ctx.globalAlpha = a * al * 0.55 * nk; ctx.fill();
      }
      if (refrD) {
        // by day each bead holds the sky and the street, small and upside down
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = patAt(dayViewPat, -0.16, x, y, x, U.lerp(y, Y(0.4), 0.5)); ctx.globalAlpha = a * al * 0.8 * DAY; ctx.fill();
        ctx.globalCompositeOperation = "lighter";
      }
    };
    const beadR = (i) => BR[i] * U.smoothstep(B0[i], B0[i] + 1.4, t) * (1 - U.smoothstep(B1[i] - 1.5, B1[i], t));
    ctx.beginPath();
    for (let i = 0; i < nb; i++) {
      const r = beadR(i);
      if (r < 0.5) continue;
      ctx.moveTo(BX[i] + r, BY[i]); ctx.ellipse(BX[i], BY[i], r, r * 1.08, 0, 0, TAU);
    }
    for (let i = 0; i < nr; i++) {
      if (RS[i] === 0) continue;
      ctx.moveTo(RX[i] + RR[i], RY[i]); ctx.ellipse(RX[i], RY[i], RR[i], RR[i] * 1.3, 0, 0, TAU);
    }
    ctx.fillStyle = BLACK; ctx.globalAlpha = a * 0.18; ctx.fill();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < nb; i++) {
      const r = beadR(i);
      if (r < 0.5) continue;
      drop(BX[i], BY[i], r, r * 1.08, U.clamp(nbF - i));
    }
    for (let i = 0; i < nr; i++) if (RS[i]) drop(RX[i], RY[i], RR[i], RR[i] * 1.3, 1);
    ctx.globalCompositeOperation = "source-over";
    // the dark refraction edge, thickest at the bottom, and a warm glint from the lamp
    ctx.beginPath();
    const rims = (x, y, r, ry) => { ctx.moveTo(x + r, y); ctx.ellipse(x, y, r, ry, 0, 0, TAU); };
    for (let i = 0; i < nb; i++) { const r = beadR(i); if (r >= 1.5) rims(BX[i], BY[i], r, r * 1.08); }
    for (let i = 0; i < nr; i++) if (RS[i]) rims(RX[i], RY[i], RR[i], RR[i] * 1.3);
    ctx.strokeStyle = BLACK; ctx.lineWidth = 1.1 * px; ctx.globalAlpha = a * 0.4; ctx.stroke();
    ctx.beginPath();
    const lower = (x, y, r, ry) => { ctx.moveTo(x + Math.cos(0.1 * PI) * r * 0.9, y + Math.sin(0.1 * PI) * ry * 0.9); ctx.ellipse(x, y, r * 0.9, ry * 0.9, 0, 0.1 * PI, 0.9 * PI); };
    for (let i = 0; i < nb; i++) { const r = beadR(i); if (r >= 2.5) lower(BX[i], BY[i], r, r * 1.08); }
    for (let i = 0; i < nr; i++) if (RS[i]) lower(RX[i], RY[i], RR[i], RR[i] * 1.3);
    ctx.lineWidth = 1.5 * px; ctx.globalAlpha = a * 0.28; ctx.stroke();
    ctx.beginPath();
    const glint = (x, y, r) => { const gx = x + r * 0.32, gy = y - r * 0.42, gr = Math.max(0.6, r * 0.16); ctx.moveTo(gx + gr, gy); ctx.arc(gx, gy, gr, 0, TAU); };
    for (let i = 0; i < nb; i++) { const r = beadR(i); if (r >= 2.5) glint(BX[i], BY[i], r); }
    for (let i = 0; i < nr; i++) if (RS[i]) glint(RX[i], RY[i] - RR[i] * 0.2, RR[i]);
    ctx.fillStyle = LAMP_CSS; ctx.globalAlpha = a * 0.42 * nk; ctx.fill();
    if (DAY > 0.004) { ctx.fillStyle = GLINT_DAY; ctx.globalAlpha = a * 0.45 * DAY; ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  // rain falling past outside, snow drifting past (typed arrays, capped)
  let RAIN = null, FLAKES = null;
  const RAIN_CSS = U.rgba(U.safe(C.rain), 1), SNOW_CSS = U.rgba(U.safe(C.snow), 1);
  function drawFalling(ctx, t, a) {
    const rk = U.clamp(WX.rain), sk = U.clamp(WX.snow);
    if (rk > 0.004) {
      const slant = 0.06 + 0.6 * WX.lean, n = Math.ceil((RAIN.length / 4) * Math.pow(rk, 1.1)), lk = 0.8 + 0.7 * rk;
      ctx.beginPath();
      for (let j = 0; j < n; j++) {
        const i = j * 4, len = RAIN[i + 3] * S * lk;
        const y = G.y0 + ((RAIN[i + 1] + t * RAIN[i + 2] * (0.8 + 0.5 * rk)) % 1) * (G.h + len) - len;
        const x = G.x0 + RAIN[i] * (G.w + slant * G.h) - slant * (y - G.y0);
        ctx.moveTo(x, y); ctx.lineTo(x - len * slant, y + len);
      }
      ctx.lineWidth = 0.9; ctx.strokeStyle = RAIN_CSS; ctx.globalAlpha = (0.14 + 0.12 * rk) * (1 - 0.4 * WX.wet) * a; ctx.stroke();
    }
    if (sk > 0.004) {
      const n = Math.ceil(FLAKES.length / 5 * sk), ww = G.w * 1.3;
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let j = pass; j < n; j += 2) {
          const i = j * 5, sp = FLAKES[i + 2], near = pass === 0;
          const y = G.y0 - 6 + ((FLAKES[i + 1] + t * sp * (near ? 1.4 : 0.8)) % 1) * (G.h + 12);
          const xo = FLAKES[i] * ww + WX.drift * 0.09 * S * (0.6 + sp * 4) + Math.sin(t * 0.8 + FLAKES[i + 4]) * 0.012 * S;
          const x = G.x0 - G.w * 0.15 + (((xo % ww) + ww) % ww), s = FLAKES[i + 3] * (near ? 1.6 : 0.85) * S / 1080;
          ctx.moveTo(x + s, y); ctx.arc(x, y, s, 0, TAU);
        }
        ctx.fillStyle = SNOW_CSS; ctx.globalAlpha = (pass ? 0.32 : 0.55) * a; ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // the elevated train: every so often a lit train slides along the line, behind the buildings across the street
  function drawTrain(ctx, t, el, a, wet) {
    if (a <= 0.004) return;
    const P = el < 2 * HOUR ? 80 : el < 4.5 * HOUR ? 115 : 170, dur = 13;
    const tt = t + 6.5; // the first one is crossing as the wall wakes
    const k = Math.floor(tt / P), ph = tt - k * P;
    if (ph > dur) return;
    const L = 0.62 * S, n = 5, gap = 0.006 * S, cl = (L - gap * (n - 1)) / n, hh = 0.032 * S;
    const s = (ph / dur) * (G.w + L + 0.2 * S), dir = (k & 1) ? -1 : 1;
    const x0 = dir > 0 ? G.x0 - L - 0.1 * S + s : G.x1 + 0.1 * S - s;
    const y1 = TRACK - 0.002 * S, y0 = y1 - hh;
    ctx.globalAlpha = a; ctx.fillStyle = BLACK;
    ctx.beginPath();
    for (let c = 0; c < n; c++) rr(ctx, x0 + c * (cl + gap), y0, cl, hh, 0.006 * S);
    ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = LAV_CSS; ctx.globalAlpha = a * 0.22; ctx.stroke();
    // a row of lit windows in every carriage
    const tl = U.safe(C.trainLit), ww = 0.012 * S, wh = 0.011 * S;
    ctx.fillStyle = U.rgba(tl, 1); ctx.globalAlpha = a * 0.5;
    for (let c = 0; c < n; c++) {
      const cx = x0 + c * (cl + gap);
      for (let j = 0; j < 7; j++) ctx.fillRect(cx + 0.012 * S + j * (cl - 0.024 * S - ww) / 6, y0 + hh * 0.28, ww, wh);
    }
    ctx.globalAlpha = 1;
    if (wet > 0.05) for (let c = 0; c < n; c++) glowDot(ctx, C.trainLit, x0 + c * (cl + gap) + cl / 2, y0 + hh * 0.45, cl * 0.42, a * 0.3 * wet, hh * 0.9);
    const front = dir > 0 ? x0 + L : x0, back = dir > 0 ? x0 : x0 + L;
    glowDot(ctx, C.lamp, front, y0 + hh * 0.55, 0.035 * S, a * 0.55);
    glowDot(ctx, C.mast, back, y0 + hh * 0.55, 0.018 * S, a * 0.45);
  }

  // the restless windows and the televisions, the mast's blink and the aircraft lights
  function drawLiveLights(ctx, t, el, dayK, sharpA, bokA) {
    for (let i = 0; i < NWIN; i++) {
      const fl = WFLa[i];
      if (!fl || !isLit(i, el, dayK)) continue;
      let k;
      if (fl === 1) {
        const per = 50 + hash(i) * 110, n = Math.floor((t + hash(i + 1) * per) / per);
        k = hash(i * 13 + n) > 0.4 ? 1 : 0;
      } else {
        k = 0.55 + 0.3 * U.noise1(t * 2.3 + i) + 0.15 * U.noise1(t * 9 + i * 3);
      }
      if (k <= 0.01) continue;
      const col = WINPAL[WCa[i]];
      if (sharpA > 0.004) { ctx.globalAlpha = sharpA * WAa[i] * k; ctx.fillStyle = WINCSS[WCa[i]]; ctx.fillRect(WXa[i], WYa[i], WWa[i], WHa[i]); }
      if (bokA > 0.004) {
        const rad = (WLa[i] === 1 ? 0.0125 : 0.03) * S;
        ctx.globalAlpha = bokA * WAa[i] * k * 0.6; ctx.drawImage(discSprite(col).cv, WXa[i] + WWa[i] / 2 - rad, WYa[i] + WHa[i] / 2 - rad, rad * 2, rad * 2);
      }
    }
    ctx.globalAlpha = 1;
    const a = Math.max(sharpA, bokA * 0.8);
    if (MAST) {
      const ph = (t % 2.4) / 2.4, on = ph < 0.45 ? Math.sin(ph / 0.45 * PI) : 0;
      glowDot(ctx, C.mast, MAST.x, MAST.top, 0.026 * S, a * 0.45 * on);
      ctx.globalAlpha = a * 0.8 * on; ctx.fillStyle = U.rgba(U.safe(C.mast), 1);
      ctx.beginPath(); ctx.arc(MAST.x, MAST.top, 1.4 * S / 1080, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    for (const bc of BEACONS) {
      const on = 0.5 + 0.5 * Math.sin(t * 1.3 + bc.ph);
      glowDot(ctx, C.mast, bc.x, bc.y, 0.012 * S, a * 0.3 * on * (1 - WX.fog));
    }
  }

  // the snow piling on the outer sill, seen through the bottom of the glass
  function drawPile(ctx, a) {
    const p = WX.pile;
    if (p < 0.01 || a <= 0.004) return;
    const hs = 0.04 * S * p, sc = U.safe(C.snow);
    for (const [x0, x1] of [[G.x0, G.l1], [G.r0, G.x1]]) {
      ctx.beginPath(); ctx.moveTo(x0 - 2, G.y1 + 2);
      for (let k = 0; k <= 24; k++) {
        const u = k / 24, x = U.lerp(x0, x1, u), corner = Math.pow(Math.abs(u - 0.5) * 2, 4);
        ctx.lineTo(x, G.y1 - hs * (0.55 + 0.45 * corner + 0.12 * Math.sin(u * 11 + x0 * 0.01)));
      }
      ctx.lineTo(x1 + 2, G.y1 + 2); ctx.closePath();
      // it hides the street behind it, catches the city's glow on its crest
      ctx.globalAlpha = a * U.clamp(p * 1.5) * (1 - DAY); ctx.fillStyle = BLACK; ctx.fill();
      if (DAY > 0.004) { ctx.globalAlpha = a * U.clamp(p * 1.5) * DAY; ctx.fillStyle = SNOW_DAY; ctx.fill(); }
      const g = ctx.createLinearGradient(0, G.y1 - hs, 0, G.y1);
      g.addColorStop(0, U.rgba(sc, 0.26 * p)); g.addColorStop(1, U.rgba(sc, 0.08 * p));
      ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = U.rgba(sc, 0.6 * p); ctx.stroke();
      // frost creeping in from the corners of the pane
      glowDot(ctx, C.snow, x0, G.y1, 0.09 * S, 0.22 * p * a, 0.07 * S);
      glowDot(ctx, C.snow, x1, G.y1, 0.09 * S, 0.22 * p * a, 0.07 * S);
    }
    ctx.globalAlpha = 1;
  }

  // The view, clipped to the glass: sky, clouds, the city (sharp, or wet and blurred into bokeh, or dissolved
  // in fog), the train, the weather falling past, the snow on the sill, and the rain on the glass itself.
  let murkG = null, flashG = null, gradKey = "", FLASH = 0;
  function drawView(ctx, f, t, dt, el, elev, cityA, glassA, bk) {
    const dayK = U.smoothstep(-4, 6, elev), flash = lightning(t);
    const D = DAY, nk = 1 - D, night = nk > 0.001;   // full daylight: the night sky and city are not painted at all
    const qc = Math.round(WX.cover * 10), qf = Math.round(WX.fog * 8), mp = Math.round(moonPhase(f.now) * 24);
    const ek = Math.round(U.clamp(elev, -16, 12) * 2);
    const sk = `${ek}|${qc}|${qf}|${mp}`;
    if (night && sk !== skyKey) { skyKey = sk; paintSky(ek / 2, qc / 10, qf / 8, mp / 24); }
    const ck = `${qc}|${Math.round(ek / 2)}`;
    if (ck !== cloudKey) { cloudKey = ck; paintClouds(qc / 10, ek / 2); }
    if (night) {
      const qd = Math.round(WX.pile * 6), qday = Math.round(dayK * 8) / 8;
      const kk = `${litSig(el, qday)}|${qd}`;
      if (kk !== cityKey) { cityKey = kk; bakeCity(el, qday, qd / 6); viewPat = bokehPat = null; }
      if (!viewPat) { viewPat = ctx.createPattern(viewL.cv, "no-repeat"); bokehPat = ctx.createPattern(bokehL.cv, "no-repeat"); }
    }
    if (gradKey !== built) {
      gradKey = built;
      const mc = U.safe(C.murk);
      murkG = ctx.createLinearGradient(0, G.y0, 0, G.y1);
      murkG.addColorStop(0, U.rgba(mc, 0.04)); murkG.addColorStop(0.55, U.rgba(mc, 0.08)); murkG.addColorStop(1, U.rgba(mc, 0.12));
      const fc = U.safe(C.flash);
      flashG = ctx.createLinearGradient(0, G.y0, 0, Y(0.5));
      flashG.addColorStop(0, U.rgba(fc, 0.05)); flashG.addColorStop(0.7, U.rgba(fc, 0.16)); flashG.addColorStop(1, U.rgba(fc, 0.1));
    }
    const wet = WX.wet, fog = WX.fog;
    // a flash shows the skyline: the sharp silhouettes come through the blur for a moment
    const sharpA = cityA * Math.max((1 - 0.93 * wet) * U.clamp(1 - 1.12 * fog), 0.75 * flash);
    const bokA = cityA * U.clamp(0.16 + 0.75 * wet) * (1 - 0.8 * fog);

    ctx.save(); ctx.beginPath(); panes(ctx); ctx.clip();
    if (night) { ctx.globalAlpha = cityA * (1 - 0.35 * fog) * nk; ctx.drawImage(skyL.cv, G.vx, G.vy, G.vw, G.vh); }
    // the day: its sky (settled), or the whole day view as one image while the exhale brings it forward
    const dA = 1 - (1 - cityA * D) * (1 - bk), settled = cityA >= 0.999;
    if (D > 0.004) { ctx.globalAlpha = dA; ctx.drawImage((settled ? daySkyL : dayViewL).cv, G.vx, G.vy, G.vw, G.vh); }
    // a low deck of cloud, drifting with the wind
    if (WX.cover > 0.02) {
      const tw = G.w * 1.6, th = Y(0.37) - G.y0, off = ((t * (0.004 + WX.wind * 0.03) * S) % tw + tw) % tw;
      ctx.globalAlpha = U.clamp(cityA * (1 - 0.85 * fog) * U.clamp(WX.cover * 1.6) * (1 + 0.6 * D));
      ctx.drawImage(cloudB, G.x0 - off, G.y0, tw, th); ctx.drawImage(cloudB, G.x0 - off + tw, G.y0, tw, th);
      if (flash > 0.004) {
        // the deck lights from inside
        ctx.globalAlpha = cityA * flash * 0.9; ctx.drawImage(cloudB, G.x0 - off, G.y0, tw, th); ctx.drawImage(cloudB, G.x0 - off + tw, G.y0, tw, th);
      }
    }
    if (flash > 0.004) {
      ctx.globalAlpha = cityA * flash; ctx.fillStyle = flashG; ctx.fillRect(G.x0, G.y0, G.w, Y(0.55) - G.y0);
      glowDot(ctx, C.flash, G.x0 + lnX * G.w, Y(0.33), 0.5 * S, cityA * flash * 0.35, 0.3 * S);
    }
    // a few stars twinkle (the rest are baked)
    const clear = Math.pow(1 - WX.cover, 1.5) * (1 - fog) * (1 - dayK);
    if (clear > 0.02) {
      for (let i = 0; i < 6; i++) {
        const sx = G.x0 + hash(i * 3.3) * G.w, sy = G.y0 + 0.07 * S + hash(i * 5.1) * (Y(0.3) - G.y0 - 0.07 * S);
        const tw = 0.5 + 0.5 * Math.sin(t * (0.6 + hash(i) * 0.9) + i * 2.1);
        glowDot(ctx, C.star, sx, sy, 0.006 * S, cityA * clear * 0.4 * tw);
      }
    }
    if (night) {
      const nl = settled ? 1 : nk;
      ctx.globalAlpha = sharpA * nl; ctx.drawImage(backL.cv, G.vx, G.vy, G.vw, G.vh);
      drawTrain(ctx, t, el, (sharpA * (0.4 + 0.6 * (1 - wet)) + 0.0) * nl, wet * cityA * nl);
      ctx.globalAlpha = sharpA * nl; ctx.drawImage(frontL.cv, G.vx, G.vy, G.vw, G.vh);
      drawLiveLights(ctx, t, el, Math.round(dayK * 8) / 8, sharpA * nl, bokA * nl);
      // wet glass and fog both soften the city to bokeh; in fog it spreads into big soft blobs
      ctx.globalAlpha = bokA * nl; ctx.drawImage(bokehL.cv, G.vx, G.vy, G.vw, G.vh);
      if (fog > 0.01) {
        ctx.globalAlpha = cityA * fog * nl; ctx.drawImage(glowL.cv, G.vx, G.vy, G.vw, G.vh);
        ctx.globalAlpha = cityA * fog * nl; ctx.fillStyle = murkG; ctx.fillRect(G.x0, G.y0, G.w, G.h);
        for (let i = 0; i < 3; i++) {
          const u = (t * (0.005 + i * 0.003) + i * 0.37) % 1;
          glowDot(ctx, C.murk, G.x0 - 0.1 * S + u * (G.w + 0.2 * S), G.y0 + G.h * (0.45 + 0.18 * i), 0.22 * S, 0.22 * fog * cityA * nl, 0.12 * S);
        }
      }
    }
    if (D > 0.004) {
      // the city by day (settled: the sky and its clouds behind it, the train between the rows)
      if (settled) {
        ctx.globalAlpha = dA; ctx.drawImage(dBackL.cv, G.vx, G.vy, G.vw, G.vh);
        drawTrainDay(ctx, t, el, dA);
        ctx.globalAlpha = dA; ctx.drawImage(dFrontL.cv, G.vx, G.vy, G.vw, G.vh);
      }
      // wet glass blurs the day; fog turns it milky, the far city first
      const bw = dA * U.clamp(0.9 * wet) * (1 - 0.5 * fog);
      if (bw > 0.004) { ctx.globalAlpha = bw; ctx.drawImage(dayBlurL, G.vx, G.vy, G.vw, G.vh); }
      if (fog > 0.01 && fogDayG) {
        ctx.globalAlpha = dA * U.clamp(fog * 1.1); ctx.fillStyle = fogDayG; ctx.fillRect(G.x0, G.y0, G.w, G.h);
        for (let i = 0; i < 3; i++) {
          const u = (t * (0.005 + i * 0.003) + i * 0.37) % 1;
          glowDot(ctx, FOG_D, G.x0 - 0.1 * S + u * (G.w + 0.2 * S), G.y0 + G.h * (0.45 + 0.18 * i), 0.24 * S, 0.3 * fog * dA, 0.12 * S);
        }
      }
    }
    drawFalling(ctx, t, cityA);
    drawPile(ctx, cityA);
    drawGlass(ctx, t, dt, glassA, nk);
    if (flash > 0.004) { ctx.globalAlpha = 0.035 * flash * cityA; ctx.fillStyle = U.rgba(U.safe(C.flash), 1); ctx.fillRect(G.x0, G.y0, G.w, G.h); }
    ctx.restore();
    ctx.globalAlpha = 1;
    FLASH = flash;
    return flash;
  }

  // ------------------------------------------------------------------ the day
  // frame.day (0 = night, 1 = full daylight) brings the apartment into the day: a real sky in the window (blue,
  // hazy, bright overcast, storm-dark) with the sun where it is (it crosses the view right to left and sets
  // behind the towers on the left), the city across the street in its own brick and stone with its windows
  // dark, the room in daylight (plaster, wood, the plants green), the lamp off, and the sun through the glass:
  // a warm strip along the sill where the cat sleeps, and a soft parallelogram of the two panes that falls
  // below the sill at midday and stretches long and warm across the wall in the golden hour. Weather reads in
  // daylight: grey rain on the glass, snow on the sill, milky fog, a dark storm sky.
  // The static day layers are baked lazily the first time it is light; the lit ones (sky, the city's tint, the
  // wall, the sunbeam) are re-baked per 0.5 deg of sun and per weather step, and each bake meters the scene so
  // it never runs past the day budget. At night every day path is skipped and the room is exactly as it was.
  let DAY = 0, dayBuilt = false;
  let dCityBack = null, dCityFront = null, dBackL = null, dFrontL = null, daySkyL = null, dayViewL = null, dayBlurL = null;
  let roomDay = null, wallDay = null, beamA = null, beamB = null, CATD = null, CATG = null, dayViewPat = null, meterC = null;
  const BOOKS = [[112, 56, 46], [52, 76, 100], [106, 90, 54], [64, 88, 66], [98, 72, 94]];
  const SLEEVES = [[124, 72, 44], [48, 72, 104], [108, 98, 80]];
  const DAY_TARGET = 39.5;
  const MW = 320, MH = 180;   // the meter: big enough to live on the GPU, small enough to read back cheaply   // mean luminance the day scene may reach (the budget is 45; the clock and life sit on top)
  // the clear sky by the sun's elevation: [elev, zenith, horizon, the sun's light]; mornings rosier
  const LSKY_PM = [
    [-6, [16, 20, 46], [54, 38, 72], [96, 52, 72]],
    [-2, [30, 36, 74], [128, 72, 74], [176, 84, 60]],
    [2, [44, 62, 108], [168, 110, 78], [212, 124, 62]],
    [6, [56, 90, 138], [164, 138, 112], [214, 152, 82]],
    [12, [62, 106, 156], [136, 150, 166], [214, 188, 128]],
    [24, [58, 112, 168], [118, 150, 182], [212, 200, 156]],
  ];
  const LSKY_AM = [
    LSKY_PM[0],
    [-2, [30, 36, 76], [132, 78, 92], [176, 96, 92]],
    [2, [46, 64, 112], [166, 114, 104], [212, 140, 112]],
    [6, [58, 92, 142], [158, 140, 132], [214, 166, 120]],
    [12, [62, 106, 158], [134, 150, 170], [214, 192, 140]],
    LSKY_PM[5],
  ];
  const LWX = {   // zenith, horizon at full light
    ov: [[104, 110, 120], [124, 128, 134]],
    fog: [[116, 118, 120], [130, 130, 128]],
    rain: [[66, 72, 82], [86, 90, 98]],
    storm: [[30, 32, 44], [52, 52, 62]],
    snow: [[118, 124, 136], [138, 142, 148]],
  };
  const LD = { key: "", zen: [0, 0, 0], hor: [0, 0, 0], sun: [0, 0, 0], t1: [0, 0, 0], t2: [0, 0, 0], wall: [0, 0, 0], sunX: 0, sunY: 0,
    sunA: 0, glareA: 0, low: 0, dir: 0, beam: 0, light: 1, fog: 0, wet: 0, snow: 0, expo: 9, expoT: 1 };
  function lskyAt(tab, e, i, out) {
    let k = 0;
    while (k < tab.length - 2 && e > tab[k + 1][0]) k++;
    const a = tab[k], b = tab[k + 1], u = U.smoothstep(a[0], b[0], e);
    for (let j = 0; j < 3; j++) out[j] = U.lerp(a[i][j], b[i][j], u);
    return out;
  }
  const rgbA = (a, al) => "rgba(" + (a[0] | 0) + "," + (a[1] | 0) + "," + (a[2] | 0) + "," + (al == null ? 1 : U.clamp(al)) + ")";
  const rgbOf = (c) => "rgb(" + (c.r | 0) + "," + (c.g | 0) + "," + (c.b | 0) + ")";
  // The day's light from the sun and the weather, quantised so a bake is a pure function of its key.
  function dayParams(d, now) {
    const P = LD, e0 = d && d.elevation != null ? d.elevation : 30;
    let u = 0.5;
    if (d && d.sunrise && d.sunset) {
      const fa = (d.sunrise.getHours() * 60 + d.sunrise.getMinutes()) / 1440, fb = (d.sunset.getHours() * 60 + d.sunset.getMinutes()) / 1440;
      u = U.clamp((d.dayFraction - fa) / Math.max(0.01, fb - fa), -0.1, 1.1);
    }
    const q = (v, n) => Math.round(U.clamp(v) * n) / n;
    const e = Math.round(e0 * 2) / 2, qu = Math.round(u * 200) / 200, am = q(U.smoothstep(0.56, 0.44, u), 10);
    const wOv = q(WXP[1] * U.smoothstep(0.15, 0.85, WXI[1]), 10), wFog = q(WX.fog, 10), wRain = q(WXP[3] * (0.5 + 0.5 * WXI[3]), 10);
    const wSt = q(WX.storm, 10), wSn = q(WX.snow, 10), wet = q(WX.wet, 10);
    const key = e + "|" + qu + "|" + am + "|" + wOv + "|" + wFog + "|" + wRain + "|" + wSt + "|" + wSn + "|" + wet;
    if (key === P.key) return false;
    // re-bake at most twice a second: a change of weather eases in over a few steps instead of every frame
    if (P.key && now - P.bakedAt < 0.5) return false;
    P.bakedAt = now;
    P.key = key;
    const cols = [P.zen, P.hor, P.sun];
    for (let i = 0; i < 3; i++) {
      lskyAt(LSKY_PM, e, i + 1, P.t1); lskyAt(LSKY_AM, e, i + 1, P.t2);
      for (let j = 0; j < 3; j++) cols[i][j] = U.lerp(P.t1[j], P.t2[j], am);
    }
    const wl = U.lerp(0.22, 1, U.smoothstep(-6, 14, e));
    const wmix = (T, w) => { if (w > 0) for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) cols[i][j] = U.lerp(cols[i][j], T[i][j] * wl, w); };
    wmix(LWX.ov, wOv); wmix(LWX.fog, wFog); wmix(LWX.rain, wRain); wmix(LWX.storm, wSt); wmix(LWX.snow, wSn);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) cols[i][j] *= 1.0;
    const clearW = (1 - 0.85 * wOv) * (1 - 0.9 * wFog) * (1 - wRain) * (1 - wSt) * (1 - 0.9 * wSn);
    P.low = 1 - U.smoothstep(3, 28, e);
    P.sunX = G.x0 + G.w * U.lerp(1.45, 0.12, qu);
    P.sunY = Y(0.44) - S * 0.95 * Math.sin(Math.max(-0.1, e * PI / 180));
    P.sunA = U.smoothstep(-2.5, 1, e) * Math.pow(clearW, 3);
    P.glareA = U.smoothstep(-5, 0, e) * (0.08 + 0.92 * clearW);
    // the light comes in away from the sun: right when it is on the left of the window
    P.dir = U.clamp((G.mx - P.sunX) / (0.55 * G.w), -1, 1);
    P.beam = U.smoothstep(-1, 3, e) * Math.pow(clearW, 1.5);
    // the room's light: how bright it is outside, a touch warmer in the golden hour
    P.light = wl * (1 - 0.25 * wOv - 0.35 * wRain - 0.55 * wSt - 0.2 * wFog + 0.05 * wSn);
    const warmth = P.low * clearW;
    P.wall[0] = 25 + 8 * warmth; P.wall[1] = 23 + 1 * warmth; P.wall[2] = 23 - 5 * warmth;
    P.fog = wFog; P.wet = wet; P.snow = wSn;
    return true;
  }

  // ---- the city across the street, by day (baked once): brick, stone, concrete, the windows dark glass
  const DB1 = [[124, 78, 62], [136, 118, 96], [98, 98, 104], [140, 130, 112], [110, 70, 62], [86, 96, 110]].map((a) => ({ r: a[0], g: a[1], b: a[2] }));
  function dayBuilding(c, b, i) {
    const k = 0.86;
    let col = b.L === 0 ? { r: 134, g: 146, b: 164 } : b.L === 1 ? DB1[(i * 7 + 3) % DB1.length] : b.fire ? { r: 112, g: 64, b: 52 } : { r: 128, g: 116, b: 98 };
    col = U.safe(U.scale(col, k));
    c.beginPath(); c.rect(b.x0, b.top, b.x1 - b.x0, b.bot - b.top);
    if (b.step) { const w = b.x1 - b.x0; c.rect(b.x0 + w * 0.22, b.top - 0.025 * S, w * 0.5, 0.026 * S); }
    if (b.spire) { const m = (b.x0 + b.x1) / 2; c.rect(m - 0.0015 * S, b.top - 0.03 * S, 0.003 * S, 0.031 * S); }
    c.fillStyle = rgbOf(col); c.fill();
    // the light from above: the top of the facade a little brighter, the foot in the street's shade
    const g = c.createLinearGradient(0, b.top, 0, b.bot);
    g.addColorStop(0, "rgba(255,240,220,0.06)"); g.addColorStop(0.5, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.25)");
    c.fillStyle = g; c.fill();
    // the cornice catches the sky
    c.fillStyle = rgbOf(U.safe(U.scale(col, 1.35))); c.fillRect(b.x0, b.top, b.x1 - b.x0, Math.max(1, (b.L === 0 ? 0.0015 : 0.003) * S));
    // windows: the same grid the night lights, every one of them, dark glass with a sill
    const P = b.L === 0 ? { ww: 0.0045, wh: 0.0055, sx: 0.012, sy: 0.016, m: 0.008 } : b.L === 1 ? { ww: 0.012, wh: 0.015, sx: 0.022, sy: 0.03, m: 0.01 } : { ww: 0.036, wh: 0.05, sx: 0.064, sy: 0.088, m: 0.022 };
    const ylim = Math.min(b.bot, G.y1 + 0.01 * S), glass = new Path2D(), sky = new Path2D(), sill = new Path2D();
    let n = 0;
    for (let y = b.top + P.m * S; y + P.wh * S < ylim; y += P.sy * S) {
      for (let x = b.x0 + P.m * S; x + P.ww * S < b.x1 - P.m * S * 0.6; x += P.sx * S) {
        n++;
        (hash(n * 3.1 + i * 17) < 0.14 ? sky : glass).rect(x, y, P.ww * S, P.wh * S);
        if (b.L > 0) sill.rect(x - 0.001 * S, y + P.wh * S, P.ww * S + 0.002 * S, Math.max(1, 0.0025 * S));
      }
    }
    c.fillStyle = b.L === 2 ? "rgba(18,18,22,0.92)" : "rgba(22,26,34,0.85)"; c.fill(glass);
    c.fillStyle = "rgba(96,118,140,0.5)"; c.fill(sky);
    if (b.L === 2) {
      // across the street the rooms show: curtains, a blind half down, a plant; the window frames
      let m = 0;
      for (let y = b.top + P.m * S; y + P.wh * S < ylim; y += P.sy * S) {
        for (let x = b.x0 + P.m * S; x + P.ww * S < b.x1 - P.m * S * 0.6; x += P.sx * S) {
          m++;
          const v = hash(m * 5.7 + i), w = P.ww * S, h = P.wh * S;
          if (v < 0.3) {
            const cc = [[110, 60, 52], [70, 92, 70], [120, 104, 70], [84, 74, 104]][(m + i) % 4];
            c.fillStyle = rgbA(cc); c.fillRect(x, y, w * 0.26, h); c.fillRect(x + w * 0.74, y, w * 0.26, h);
          } else if (v < 0.5) {
            c.fillStyle = "rgb(112,104,90)"; c.fillRect(x, y, w, h * (0.3 + 0.3 * hash(m)));
          } else if (v < 0.58) {
            c.fillStyle = "rgb(40,72,44)"; c.beginPath(); c.ellipse(x + w / 2, y + h * 0.85, w * 0.18, h * 0.16, 0, 0, TAU); c.fill();
          }
          c.fillStyle = rgbOf(U.safe(U.scale(col, 1.3))); c.fillRect(x + w / 2 - 0.75, y, 1.5, h); c.fillRect(x, y + h * 0.4, w, 1.5);
        }
      }
    }
    if (b.L > 0) { c.fillStyle = rgbOf(U.safe(U.scale(col, 1.4))); c.fill(sill); }
  }
  function bakeDayCity() {
    const mkV = () => { const L = mk(G.vw, G.vh); L.c.translate(-G.vx, -G.vy); return L; };
    dCityBack = mkV(); dCityFront = mkV();
    let c = dCityBack.c;
    c.lineCap = "round"; c.lineJoin = "round";
    BLD.forEach((b, i) => { if (b.L === 0) dayBuilding(c, b, i); });
    BLD.forEach((b, i) => { if (b.L === 1) dayBuilding(c, b, i); });
    if (MAST) {
      const m = MAST, hw = 0.011 * S, n = 9;
      c.beginPath(); c.moveTo(m.x - hw, m.base); c.lineTo(m.x, m.top); c.lineTo(m.x + hw, m.base);
      for (let k = 0; k < n; k++) {
        const y0 = U.lerp(m.base, m.top, k / n), y1 = U.lerp(m.base, m.top, (k + 1) / n);
        c.moveTo(m.x - hw * (1 - k / n), y0); c.lineTo(m.x + hw * (1 - (k + 1) / n), y1);
      }
      c.lineWidth = 1.2; c.strokeStyle = "rgb(44,44,48)"; c.stroke();
    }
    for (const a of ACS) { c.fillStyle = "rgb(84,84,82)"; c.fillRect(a.x, a.y - a.h, a.w, a.h); c.fillStyle = "rgb(54,54,54)"; c.fillRect(a.x + a.w * 0.15, a.y - a.h * 0.7, a.w * 0.7, a.h * 0.4); }
    for (const tk of TANKS) {
      const x = tk.x, y = tk.y, s = tk.s, lw = s * 0.5, bw = s * 0.8, bh = s * 0.75, by = y - lw;
      c.beginPath();
      c.moveTo(x - bw * 0.42, y); c.lineTo(x - bw * 0.36, by); c.moveTo(x + bw * 0.42, y); c.lineTo(x + bw * 0.36, by);
      c.moveTo(x, y); c.lineTo(x, by); c.moveTo(x - bw * 0.4, y - lw * 0.45); c.lineTo(x + bw * 0.4, y - lw * 0.45);
      c.lineWidth = 1.2; c.strokeStyle = "rgb(40,36,34)"; c.stroke();
      c.beginPath(); c.moveTo(x - bw / 2, by); c.lineTo(x - bw / 2, by - bh); c.lineTo(x + bw / 2, by - bh); c.lineTo(x + bw / 2, by); c.closePath();
      c.fillStyle = "rgb(88,64,46)"; c.fill();
      c.beginPath(); c.moveTo(x - bw / 2 - 1, by - bh); c.lineTo(x, by - bh - s * 0.3); c.lineTo(x + bw / 2 + 1, by - bh); c.closePath();
      c.fillStyle = "rgb(62,54,50)"; c.fill();
      c.fillStyle = "rgb(56,40,30)"; for (const f of [0.3, 0.62]) c.fillRect(x - bw / 2, by - bh * f, bw, Math.max(1, 0.002 * S));
    }
    // in front: the elevated line, the two buildings across the street, the fire escape in black iron
    c = dCityFront.c;
    c.lineCap = "round"; c.lineJoin = "round";
    const xa = G.vx, xb = G.vx + G.vw, th = 0.014 * S;
    c.fillStyle = "rgb(70,70,68)";
    for (let x = xa + 0.06 * S; x < xb; x += 0.21 * S) c.fillRect(x, TRACK + th, 0.012 * S, G.vy + G.vh - TRACK);
    c.fillStyle = "rgb(82,82,78)"; c.fillRect(xa, TRACK, xb - xa, th);
    c.fillStyle = "rgb(110,110,104)"; c.fillRect(xa, TRACK, xb - xa, Math.max(1, 0.002 * S));
    c.fillStyle = "rgb(40,40,40)"; c.fillRect(xa, TRACK + th - Math.max(1, 0.003 * S), xb - xa, Math.max(1, 0.003 * S));
    BLD.forEach((b, i) => {
      if (b.L !== 2) return;
      dayBuilding(c, b, i);
      if (b.fire) {
        const fx0 = b.x1 - 0.13 * S, fx1 = b.x1 - 0.015 * S;
        c.beginPath();
        for (let y = b.top + 0.075 * S, k = 0; y < G.y1 + 0.02 * S; y += 0.088 * S, k++) {
          c.moveTo(fx0, y); c.lineTo(fx1, y);
          c.moveTo(fx0, y - 0.022 * S); c.lineTo(fx1, y - 0.022 * S);
          for (let x = fx0; x <= fx1 + 0.5; x += 0.0118 * S) { c.moveTo(x, y); c.lineTo(x, y - 0.022 * S); }
          if (k % 2) { c.moveTo(fx0 + 0.01 * S, y); c.lineTo(fx1 - 0.03 * S, y + 0.088 * S); }
          else { c.moveTo(fx1 - 0.01 * S, y); c.lineTo(fx0 + 0.03 * S, y + 0.088 * S); }
        }
        c.lineWidth = 1.3; c.strokeStyle = "rgb(30,28,28)"; c.stroke();
      }
    });
  }
  // the lit copies of the city: the sun's colour over the facades, the haze of the weather
  function tintCity(dst, src, front) {
    const P = LD, c = dst.c;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, dst.cv.width, dst.cv.height); c.restore();
    c.globalCompositeOperation = "source-over"; c.globalAlpha = 1; c.drawImage(src.cv, G.vx, G.vy, G.vw, G.vh);
    c.globalCompositeOperation = "source-atop";
    if (P.light < 0.999) { c.fillStyle = "rgba(0,0,0," + (1 - P.light) + ")"; c.fillRect(G.vx, G.vy, G.vw, G.vh); }
    const warmA = 0.22 * P.low * P.sunA;
    if (warmA > 0.004) { c.fillStyle = rgbA(P.sun, warmA); c.fillRect(G.vx, G.vy, G.vw, G.vh); }
    const hazeA = 0.12 + 0.5 * P.fog;
    c.fillStyle = rgbA(P.hor, hazeA * 0.6); c.fillRect(G.vx, G.vy, G.vw, G.vh);
    c.globalCompositeOperation = "source-over";
    // snow on the roofs, the tanks and the track
    if (P.snow > 0.02) {
      c.beginPath();
      for (const b of BLD) {
        if ((b.L === 2) !== front || b.L === 0) continue;
        c.moveTo(b.x0, b.top - 0.5); c.lineTo(b.x1, b.top - 0.5);
      }
      if (front) { c.moveTo(G.vx, TRACK - 0.5); c.lineTo(G.vx + G.vw, TRACK - 0.5); }
      else for (const tk of TANKS) { const bw = tk.s * 0.8, by = tk.y - tk.s * 0.5 - tk.s * 0.75; c.moveTo(tk.x - bw / 2 - 1, by); c.lineTo(tk.x, by - tk.s * 0.3); c.lineTo(tk.x + bw / 2 + 1, by); }
      c.lineCap = "round"; c.lineWidth = (front ? 2.4 : 1.8) * (0.4 + 0.6 * P.snow) * S / 1080 * 1.6;
      c.strokeStyle = "rgba(150,158,178," + (0.85 * P.snow) + ")"; c.stroke();
    }
  }
  function paintDaySky(c) {
    const P = LD;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, daySkyL.cv.width, daySkyL.cv.height); c.restore();
    let g = c.createLinearGradient(0, G.vy, 0, Y(0.5));
    g.addColorStop(0, rgbA(P.zen)); g.addColorStop(1, rgbA(P.hor));
    c.globalAlpha = 1; c.fillStyle = g; c.fillRect(G.vx, G.vy, G.vw, G.vh);
    if (P.glareA > 0.004) {
      const R = 0.6 * S * (1 + 0.4 * P.low);
      g = c.createRadialGradient(P.sunX, P.sunY, 0, P.sunX, P.sunY, R);
      g.addColorStop(0, rgbA(P.sun, 0.55 * P.glareA)); g.addColorStop(0.12, rgbA(P.sun, 0.3 * P.glareA));
      g.addColorStop(0.45, rgbA(P.sun, 0.08 * P.glareA)); g.addColorStop(1, rgbA(P.sun, 0));
      c.fillStyle = g; c.fillRect(P.sunX - R, P.sunY - R, R * 2, R * 2);
    }
    if (P.sunA > 0.004) {
      const r = 0.022 * S, disc = U.safe(U.mix({ r: P.sun[0], g: P.sun[1], b: P.sun[2] }, { r: 214, g: 206, b: 170 }, 0.45 * (1 - P.low)));
      c.globalAlpha = 0.92 * P.sunA; c.fillStyle = rgbOf(disc);
      c.beginPath(); c.arc(P.sunX, P.sunY, r, 0, TAU); c.fill();
      c.globalAlpha = 1;
    }
  }
  // the room's daylight: plaster lit from the window, the ceiling dimmer, a wooden floor; the panes left open
  function paintWall(c) {
    const P = LD, k = P.light;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, wallDay.cv.width, wallDay.cv.height); c.restore();
    const wc = [P.wall[0] * k, P.wall[1] * k, P.wall[2] * k];
    c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.fillStyle = rgbA(wc); c.fillRect(0, 0, W, H);
    // the light bouncing in off the sill and the street: brightest around the window, gone by the far corner
    let g = c.createRadialGradient(G.mx, G.y1, 0, G.mx, G.y1, 1.5 * S);
    g.addColorStop(0, rgbA([wc[0] * 3.6, wc[1] * 3.5, wc[2] * 3.3], 1)); g.addColorStop(0.22, rgbA([wc[0] * 2.2, wc[1] * 2.15, wc[2] * 2.05], 1));
    g.addColorStop(0.5, rgbA(wc, 0.5)); g.addColorStop(1, "rgba(0,0,0,0.5)");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    g = c.createLinearGradient(0, 0, 0, Y(0.2));
    g.addColorStop(0, "rgba(0,0,0,0.3)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(0, 0, W, Y(0.2));
    // the floor: boards, darker toward us; a skirting board
    const fy = Y(0.915);
    g = c.createLinearGradient(0, fy, 0, H);
    g.addColorStop(0, rgbA([58 * k, 42 * k, 32 * k])); g.addColorStop(1, rgbA([30 * k, 22 * k, 18 * k]));
    c.fillStyle = g; c.fillRect(0, fy, W, H - fy);
    c.fillStyle = rgbA([wc[0] * 1.15, wc[1] * 1.12, wc[2] * 1.1]); c.fillRect(0, fy - 0.012 * S, W, 0.012 * S);
    c.fillStyle = "rgba(0,0,0,0.3)"; c.fillRect(0, fy, W, Math.max(1, 0.002 * S));
    c.beginPath();
    for (let i = 1; i < 6; i++) { const yy = fy + (H - fy) * (i / 6) * (i / 6) * 1.2; c.moveTo(0, yy); c.lineTo(W, yy); }
    c.lineWidth = 1; c.strokeStyle = "rgba(0,0,0,0.18)"; c.stroke();
    c.globalCompositeOperation = "destination-out"; c.beginPath(); panes(c); c.fill();
    c.globalCompositeOperation = "source-over";
  }
  // The sunbeam: the two panes (below the blind) thrown onto the wall: a short patch under the sill when the sun
  // is high, a long sheared one across the wall in the golden hour; the sill itself lit along its length.
  // Baked small and blurred (soft edges for free), laid on with "lighter".
  function paintBeam() {
    const P = LD, q = 0.25, w = Math.ceil(W * q), h = Math.ceil(H * q);
    let c = beamA.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
    const cb = beamB.getContext("2d");
    cb.setTransform(1, 0, 0, 1, 0, 0); cb.clearRect(0, 0, w, h);
    if (P.beam <= 0.004) return;
    c.setTransform(q, 0, 0, q, 0, 0);
    const yb = Y(0.14) + 0.008 * S, right = Math.max(0, P.dir), lo = P.low;
    const up = lo * right;                                       // golden hour, light going right: up onto the wall
    const Dx = P.dir * U.lerp(0.12, 1.05, lo) * S * (P.dir < 0 ? 0.35 : 1);
    const Py0 = U.lerp(G.y1 + 0.05 * S, G.y0 + 0.1 * S, up), Ph = U.lerp(0.1 * S, 0.44 * S, Math.max(up, 0.35 * lo));
    const sh = P.dir * U.lerp(0.08, 0.32, lo) * S, sx = U.lerp(0.88, 1.3, lo);
    const map = (x, y) => {
      const v = (y - yb) / (G.y1 - yb);                             // 0 = the top of the light, 1 = the sill
      return [G.mx + (x - G.mx) * sx + Dx + sh * (1 - v), Py0 + (1 - v) * Ph];
    };
    const col = [U.lerp(P.sun[0], 220, 0.55), U.lerp(P.sun[1], 150, 0.55), U.lerp(P.sun[2], 78, 0.55)];   // sunlight indoors reads warm
    const g = c.createLinearGradient(0, Py0, 0, Py0 + Ph);
    g.addColorStop(0, rgbA(col, 0.95)); g.addColorStop(1, rgbA(col, 0.3));
    c.fillStyle = g; c.beginPath();
    const mg = 0.012 * S;   // the mullion and the frame cast their shadows into it
    for (const [x0, x1] of [[G.x0 + mg * 0.5, G.l1 - mg], [G.r0 + mg, G.x1 - mg * 0.5]]) {
      const a = map(x0, yb), b = map(x1, yb), d = map(x1, G.y1), e = map(x0, G.y1);
      c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.lineTo(e[0], e[1]); c.closePath();
    }
    c.fill();
    // the sill, lit along the glass
    c.fillStyle = rgbA(col, 0.9); c.fillRect(G.x0, G.y1 - 0.002 * S, G.w, 0.02 * S);
    c.setTransform(1, 0, 0, 1, 0, 0);
    cb.filter = "blur(" + Math.max(2, Math.round(2.6 * dpr)) + "px)"; cb.drawImage(beamA, 0, 0); cb.filter = "none";
  }
  // the cat by day: still a black cat, backlit by the window, the sun catching the fur along its back
  // sun = false: the cat in daylight (black fur, a cool sheen of sky along its back); sun = true: only the sun's
  // part (a warm glow through the fur and a gold rim), laid over it as much as the sun is out
  function bakeCatDay(pose, m, sun) {
    const u = 0.3 * S, w = 1.9 * u, h = 0.6 * u, ox = w / 2, oy = 0.48 * u;
    const sp = mk(w, h), c = sp.c, gold = { r: 214, g: 168, b: 104 }, sky = { r: 110, g: 124, b: 150 };
    c.translate(ox, oy); c.lineCap = "round"; c.lineJoin = "round";
    if (!sun) { c.beginPath(); segPath(c, pose.body, u, m); c.fillStyle = "rgb(22,20,22)"; c.fill(); }
    c.save(); c.beginPath(); segPath(c, pose.body, u, m); c.clip();
    const g = c.createLinearGradient(0, -0.38 * u, 0, -0.1 * u);
    if (sun) { g.addColorStop(0, "rgba(140,94,60,0.4)"); g.addColorStop(0.5, "rgba(80,54,38,0.14)"); g.addColorStop(1, "rgba(0,0,0,0)"); }
    else { g.addColorStop(0, "rgba(60,64,76,0.35)"); g.addColorStop(1, "rgba(0,0,0,0)"); }
    c.fillStyle = g; c.fillRect(-w, -h, 2 * w, h);
    c.restore();
    c.save(); c.beginPath(); c.rect(-w, -h, 2 * w, h - 0.08 * u); c.clip();
    c.beginPath(); segPath(c, pose.body, u, m); rim(c, sun ? gold : sky, sun ? 0.85 : 0.35, sun ? 1.8 : 1.2);
    c.restore();
    c.beginPath(); segPath(c, pose.tail, u, m); rim(c, sun ? gold : sky, sun ? 0.45 : 0.2, 1.2);
    return { cv: sp.cv };
  }
  // dust in the light: a few motes drifting slowly through the sunlit air by the window
  function drawMotes(ctx, t, a) {
    if (a <= 0.004) return;
    const col = rgbA(LD.sun);
    ctx.fillStyle = col;
    for (let i = 0; i < 26; i++) {
      const hx = hash(i * 1.7), hy = hash(i * 2.9 + 1);
      const x = G.x0 + G.w * (0.1 + 0.95 * ((hx + t * 0.004 * (0.5 + hash(i))) % 1)) + Math.sin(t * 0.21 + i) * 0.02 * S;
      const y = G.y1 - 0.25 * S + ((hy + t * 0.006 * (0.4 + hash(i + 9))) % 1) * 0.42 * S + Math.sin(t * 0.33 + i * 2) * 0.01 * S;
      const tw = 0.5 + 0.5 * Math.sin(t * (0.7 + hash(i + 3)) + i);
      ctx.globalAlpha = a * (0.18 + 0.32 * tw);
      ctx.beginPath(); ctx.arc(x, y, (0.0011 + 0.0012 * hash(i + 5)) * S, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // the static day layers, the first time it is light
  function buildDay() {
    dayBuilt = true; LD.key = ""; LD.first = true; LD.stage = 0; LD.meterDue = false; LD.meteredAt = -1e9;
    bakeDayCity();
    const mkV = () => { const L = mk(G.vw, G.vh); L.c.translate(-G.vx, -G.vy); return L; };
    dBackL = mkV(); dFrontL = mkV(); daySkyL = mkV(); dayViewL = mkV();
    dayBlurL = document.createElement("canvas"); dayBlurL.width = Math.ceil(G.vw / 4); dayBlurL.height = Math.ceil(G.vh / 4);
    roomDay = mk(W, H); wallDay = mk(W, H);
    RDAY = true; paintRoom(roomDay.c, false); RDAY = false;
    beamA = document.createElement("canvas"); beamB = document.createElement("canvas");
    beamA.width = beamB.width = Math.ceil(W * 0.25); beamA.height = beamB.height = Math.ceil(H * 0.25);
    CATD = [bakeCatDay(CURL, 1, false), bakeCatDay(STRETCH, 1, false), bakeCatDay(CURL, -1, false)];
    CATG = [bakeCatDay(CURL, 1, true), bakeCatDay(STRETCH, 1, true), bakeCatDay(CURL, -1, true)];
    dayViewPat = null;
  }
  // the lit layers, when the light or the weather moves a step; then meter the whole
  function bakeDay(ctx) {
    paintDaySky(daySkyL.c);
    tintCity(dBackL, dCityBack, false); tintCity(dFrontL, dCityFront, true);
    let c = dayViewL.c;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, dayViewL.cv.width, dayViewL.cv.height); c.restore();
    c.globalAlpha = 1;
    c.drawImage(daySkyL.cv, G.vx, G.vy, G.vw, G.vh); c.drawImage(dBackL.cv, G.vx, G.vy, G.vw, G.vh); c.drawImage(dFrontL.cv, G.vx, G.vy, G.vw, G.vh);
    dayViewPat = ctx.createPattern(dayViewL.cv, "no-repeat");
    paintWall(wallDay.c);
    const fc = [Math.min(150, LD.hor[0] * 1.15 + 10), Math.min(150, LD.hor[1] * 1.15 + 10), Math.min(150, LD.hor[2] * 1.15 + 10)];
    fogDayG = ctx.createLinearGradient(0, G.y0, 0, G.y1);
    fogDayG.addColorStop(0, rgbA(fc, 0.5)); fogDayG.addColorStop(0.55, rgbA(fc, 0.72)); fogDayG.addColorStop(1, rgbA(fc, 0.6));
    LD.stage = 1;
  }
  // the rest of a bake, one step per frame so no frame carries all of it: the wet blur and the sunbeam, then the meter
  function bakeDayStep() {
    if (LD.stage === 1) {
      // the day through wet glass: a small soft copy of the view, stretched back over it
      const c = dayBlurL.getContext("2d");
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, dayBlurL.width, dayBlurL.height);
      c.filter = "blur(2px)"; c.drawImage(dayViewL.cv, 0, 0, dayBlurL.width, dayBlurL.height); c.filter = "none";
      paintBeam();
      LD.stage = 0; LD.meterDue = true;
    }
  }
  // meter: the wall, the view, the room and the sunbeam, small; the exposure eases toward what it says
  function meterDay() {
    if (!meterC) { meterC = document.createElement("canvas"); meterC.width = MW; meterC.height = MH; }
    const m = meterC.getContext("2d"), k = MW / W;   // (a GPU canvas: the big layers scale down on the GPU, only the small copy comes back)
    m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = "source-over"; m.globalAlpha = 1;
    m.imageSmoothingEnabled = true; m.imageSmoothingQuality = "high";
    m.fillStyle = "#000"; m.fillRect(0, 0, MW, MH);
    m.drawImage(wallDay.cv, 0, 0, MW, MH);
    m.drawImage(dayViewL.cv, G.vx * k, G.vy * k, G.vw * k, G.vh * k);
    if (WX.fog > 0.01) { m.setTransform(k, 0, 0, k, 0, 0); m.globalAlpha = U.clamp(WX.fog * 1.1); m.fillStyle = fogDayG; m.fillRect(G.x0, G.y0, G.w, G.h); m.setTransform(1, 0, 0, 1, 0, 0); m.globalAlpha = 1; }
    m.drawImage(roomDay.cv, 0, 0, MW, MH);
    m.globalCompositeOperation = "lighter"; m.globalAlpha = U.lerp(0.42, 0.36, LD.low) * LD.beam; m.drawImage(beamB, 0, 0, MW, MH);
    m.globalCompositeOperation = "source-over"; m.globalAlpha = 1;
    const p = m.getImageData(0, 0, MW, MH).data;
    let s = 0;
    for (let i = 0; i < p.length; i += 4) s += 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
    LD.expoT = Math.min(1, DAY_TARGET / Math.max(1, s / (MW * MH)));
    if (!(LD.expo < 1.5)) LD.expo = LD.expoT;
  }
  // the day through the glass, before it is settled (the exhale) or behind the work face: one composite
  function drawDayViewFlat(ctx, a) {
    if (a <= 0.004) return;
    ctx.save(); ctx.beginPath(); panes(ctx); ctx.clip();
    ctx.globalAlpha = a; ctx.drawImage(dayViewL.cv, G.vx, G.vy, G.vw, G.vh);
    ctx.restore(); ctx.globalAlpha = 1;
  }
  // the train by day: pale carriages, dark windows
  function drawTrainDay(ctx, t, el, a) {
    if (a <= 0.004) return;
    const P = el < 2 * HOUR ? 80 : el < 4.5 * HOUR ? 115 : 170, dur = 13;
    const tt = t + 6.5, k = Math.floor(tt / P), ph = tt - k * P;
    if (ph > dur) return;
    const L = 0.62 * S, n = 5, gap = 0.006 * S, cl = (L - gap * (n - 1)) / n, hh = 0.032 * S;
    const s = (ph / dur) * (G.w + L + 0.2 * S), dir = (k & 1) ? -1 : 1;
    const x0 = dir > 0 ? G.x0 - L - 0.1 * S + s : G.x1 + 0.1 * S - s;
    const y1 = TRACK - 0.002 * S, y0 = y1 - hh;
    ctx.globalAlpha = a; ctx.fillStyle = "rgb(" + ((112 * LD.light) | 0) + "," + ((116 * LD.light) | 0) + "," + ((118 * LD.light) | 0) + ")";
    ctx.beginPath();
    for (let c = 0; c < n; c++) rr(ctx, x0 + c * (cl + gap), y0, cl, hh, 0.006 * S);
    ctx.fill();
    ctx.fillStyle = "rgb(24,28,34)";
    for (let c = 0; c < n; c++) {
      const cx = x0 + c * (cl + gap);
      for (let j = 0; j < 7; j++) ctx.fillRect(cx + 0.012 * S + j * (cl - 0.024 * S - 0.012 * S) / 6, y0 + hh * 0.28, 0.012 * S, 0.011 * S);
    }
    ctx.fillStyle = "rgb(150,60,50)"; ctx.fillRect(x0, y0 + hh * 0.72, L, Math.max(1, 0.003 * S));
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ the room (baked: silhouettes, rims)
  // Painted twice: the base pass is black silhouettes with the cool rims the city puts on them; the warm pass
  // repeats the silhouettes (so near things hide far rims) with the lamplight's rims, masked by distance from
  // the lamp. The lamp's level then decides each frame how much of the warm pass the room gets.
  function paintRoom(c, warm) {
    c.lineCap = "round"; c.lineJoin = "round";
    const lav = warm ? null : C.lav, lmp = warm ? C.lamp : null;
    const cool = (a, lw) => { if (!warm) rim(c, RDAY ? MATH : C.lav, RDAY ? a * 0.9 : a, lw || 1); };
    const hot = (a, lw) => { if (warm) rim(c, C.lamp, a, lw || 1); else if (RDAY) rim(c, MATH, a * 0.55, lw || 1); };
    void lav; void lmp;

    // ---- the curtain rod
    {
      const y = Y(0.03), x0 = X(-0.88), x1 = X(0.25);
      mat(46, 38, 32);
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.lineWidth = 0.006 * S; c.strokeStyle = INK(); c.stroke();
      c.beginPath(); c.moveTo(x0, y - 0.003 * S); c.lineTo(x1, y - 0.003 * S); cool(0.1); hot(0.16);
      for (const x of [x0, x1]) { c.beginPath(); c.arc(x, y, 0.007 * S, 0, TAU); blk(c); cool(0.16); hot(0.3); }
      // the fairy-light wire, scalloped
      const fw = FAIRY.wire;
      c.beginPath();
      for (let k = 0; k < fw.n; k++) {
        const xa = fw.xa + k * fw.sw, sag = 0.042 * S * (0.85 + 0.3 * hash(k));
        c.moveTo(xa, fw.ry + 0.004 * S); c.quadraticCurveTo(xa + fw.sw / 2, fw.ry + 0.004 * S + sag * 2, xa + fw.sw, fw.ry + 0.004 * S);
      }
      c.lineWidth = 0.8; c.strokeStyle = U.rgba(U.safe(warm ? C.lamp : C.dusk), warm ? 0.14 : 0.1); c.stroke();
    }
    // ---- the roller blind, a third of the way down the top of the glass
    {
      const x0 = G.x0 - 0.004 * S, x1 = G.x1 + 0.004 * S, y0 = G.y0 - 0.004 * S, yb = Y(0.14), bh = 0.008 * S;
      mat(108, 96, 78);
      c.beginPath(); c.rect(x0, y0, x1 - x0, yb - y0 + bh); blk(c);
      if (RDAY) {
        // linen, lit through from the day behind it: brighter toward its hem
        const g = c.createLinearGradient(0, y0, 0, yb);
        g.addColorStop(0, "rgb(84,74,62)"); g.addColorStop(1, "rgb(118,104,84)");
        c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, yb - y0);
        c.beginPath(); for (let y = y0 + 0.012 * S; y < yb - 2; y += 0.011 * S) { c.moveTo(x0 + 2, y); c.lineTo(x1 - 2, y); }
        c.lineWidth = 1; c.strokeStyle = "rgba(56,46,38,0.3)"; c.stroke();
        c.fillStyle = "rgb(66,50,38)"; c.fillRect(x0, yb, x1 - x0, bh);
        const cx = X(-0.06), cy = Y(0.205);
        c.beginPath(); c.moveTo(cx, yb + bh); c.lineTo(cx, cy); c.lineWidth = 1.2; c.strokeStyle = "rgb(70,60,50)"; c.stroke();
        c.beginPath(); c.arc(cx, cy + 0.007 * S, 0.007 * S, 0, TAU); c.lineWidth = 2.5; c.stroke();
      } else if (!warm) {
        // the fabric, faintly lit through from the city behind
        c.fillStyle = U.rgba(U.safe(C.dusk), 0.045); c.fillRect(x0, y0, x1 - x0, yb - y0);
        c.beginPath(); for (let y = y0 + 0.012 * S; y < yb - 2; y += 0.011 * S) { c.moveTo(x0 + 2, y); c.lineTo(x1 - 2, y); }
        c.lineWidth = 1; c.strokeStyle = U.rgba(U.safe(C.dusk), 0.07); c.stroke();
        c.beginPath(); c.moveTo(x0, yb + bh); c.lineTo(x1, yb + bh); rim(c, C.lav, 0.34, 1);
        const cx = X(-0.06), cy = Y(0.205);
        c.beginPath(); c.moveTo(cx, yb + bh); c.lineTo(cx, cy); rim(c, C.lav, 0.22, 0.9);
        c.beginPath(); c.arc(cx, cy + 0.007 * S, 0.007 * S, 0, TAU); c.lineWidth = 2.5; c.strokeStyle = "#000"; c.stroke(); rim(c, C.lav, 0.32, 1);
      } else {
        c.beginPath(); c.moveTo(x0, yb); c.lineTo(x1, yb); rim(c, C.lamp, 0.14, 1);
      }
    }
    // ---- the window frame: casing and mullion
    {
      const f = G.f;
      c.beginPath();
      c.rect(G.x0 - f, G.y0 - f, G.w + 2 * f, G.h + f);
      c.rect(G.x0, G.y0, G.l1 - G.x0, G.h); c.rect(G.r0, G.y0, G.x1 - G.r0, G.h);
      mat(82, 78, 72);
      c.fillStyle = INK(); c.fill("evenodd");
      c.beginPath();
      c.moveTo(G.x0, G.y1); c.lineTo(G.x0, G.y0); c.lineTo(G.l1, G.y0); c.lineTo(G.l1, G.y1);
      c.moveTo(G.r0, G.y1); c.lineTo(G.r0, G.y0); c.lineTo(G.x1, G.y0); c.lineTo(G.x1, G.y1);
      cool(0.34);
      c.beginPath(); c.moveTo(G.x0 - f, G.y1); c.lineTo(G.x0 - f, G.y0 - f); c.lineTo(G.x1 + f, G.y0 - f); c.lineTo(G.x1 + f, G.y1);
      cool(0.12); hot(0.18);
      c.beginPath(); c.moveTo(G.x1 + f, G.y0 - f); c.lineTo(G.x1 + f, G.y1); c.moveTo(G.r0 - 0.5, G.y0 + 0.08 * S); c.lineTo(G.r0 - 0.5, G.y1);
      hot(0.3);
      // the latch on the mullion
      const ly = Y(0.43);
      mat(70, 64, 56);
      c.beginPath(); rr(c, G.mx - 0.008 * S, ly - 0.016 * S, 0.016 * S, 0.032 * S, 0.004 * S); blk(c); cool(0.22); hot(0.32);
    }
    // ---- the sill: its top catching the city, its front edge the lamp
    {
      const sx0 = X(-0.86), sx1 = X(0.19), top = G.y1, mid = G.y1 + 0.016 * S, bot = G.y1 + 0.036 * S;
      mat(88, 82, 74);
      c.beginPath(); c.moveTo(G.x0 - G.f, top); c.lineTo(G.x1 + G.f, top); c.lineTo(sx1, mid); c.lineTo(sx0, mid); c.closePath(); blk(c);
      if (!warm && !RDAY) {
        const g = c.createLinearGradient(0, top, 0, mid);
        g.addColorStop(0, U.rgba(U.safe(C.lav), 0.1)); g.addColorStop(1, U.rgba(U.safe(C.lav), 0.02));
        c.fillStyle = g; c.fill();
      }
      c.beginPath(); c.moveTo(G.x0 - G.f, top); c.lineTo(G.x1 + G.f, top); cool(0.24);
      mat(64, 58, 52);
      c.beginPath(); c.rect(sx0, mid, sx1 - sx0, bot - mid); blk(c);
      c.beginPath(); c.moveTo(sx0, mid); c.lineTo(sx1, mid); cool(0.14); hot(0.36);
      c.beginPath(); c.moveTo(sx1, mid); c.lineTo(sx1, bot); c.lineTo(sx0, bot); hot(0.2); cool(0.05);
    }
    // ---- a snake plant at the left end of the sill, a pothos tumbling over the edge
    {
      const px = X(-0.75), pb = G.y1, pt = pb - 0.062 * S, tw = 0.048 * S, bw = 0.036 * S;
      const BL = [[-0.5, 0.2, -0.012, 0.022], [-0.2, 0.25, -0.004, 0.026], [0.15, 0.23, 0.01, 0.024], [0.45, 0.17, 0.02, 0.02], [-0.05, 0.15, 0.03, 0.02], [0.3, 0.12, -0.02, 0.018]];
      mat(38, 70, 44);
      for (const [o, hgt, lean, wd] of BL) {
        const bx = px + o * tw * 0.8, h = hgt * S, w = wd * S, tx = bx + lean * S * 2, ty = pt - h;
        c.beginPath(); c.moveTo(bx - w / 2, pt + 2);
        c.quadraticCurveTo(bx - w * 0.7 + lean * S, pt - h * 0.55, tx, ty);
        c.quadraticCurveTo(bx + w * 0.7 + lean * S, pt - h * 0.55, bx + w / 2, pt + 2); c.closePath();
        blk(c); cool(0.3, 0.9); hot(0.1, 0.9);
        // the banding on the leaf, barely
        c.beginPath(); c.moveTo(bx, pt - 2); c.quadraticCurveTo(bx + lean * S, pt - h * 0.55, tx, ty + h * 0.12); cool(0.08, 0.7);
      }
      mat(102, 60, 42);
      c.beginPath(); c.moveTo(px - tw / 2, pt); c.lineTo(px + tw / 2, pt); c.lineTo(px + bw / 2, pb); c.lineTo(px - bw / 2, pb); c.closePath(); blk(c);
      cool(0.22); hot(0.16);
      c.beginPath(); c.moveTo(px - tw / 2 - 1, pt + 0.01 * S); c.lineTo(px + tw / 2 + 1, pt + 0.01 * S); cool(0.14); hot(0.14);
      // the pothos: a vine from the pot over the front of the sill, heart leaves along it
      const vine = [px + tw * 0.4, pt + 0.004 * S, px + 0.07 * S, pt - 0.01 * S, px + 0.1 * S, G.y1 + 0.02 * S, px + 0.085 * S, G.y1 + 0.13 * S];
      c.beginPath(); c.moveTo(vine[0], vine[1]); c.bezierCurveTo(vine[2], vine[3], vine[4], vine[5], vine[6], vine[7]);
      mat(36, 66, 40);
      c.lineWidth = 1.6; c.strokeStyle = INK(); c.stroke(); cool(0.14, 0.8); hot(0.12, 0.8);
      mat(44, 88, 50);
      const bz = (p, t) => { const u = 1 - t; return [u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6], u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7]]; };
      for (let k = 1; k <= 7; k++) {
        const tt = k / 7.6, [lx, ly] = bz(vine, tt), side = k % 2 ? 1 : -1, sz = 0.016 * S * (1 - tt * 0.25);
        c.save(); c.translate(lx, ly); c.rotate(side * 0.9 + 0.3);
        c.beginPath(); c.moveTo(0, 0);
        c.bezierCurveTo(-sz * 0.7, -sz * 0.1, -sz * 0.6, -sz * 0.75, 0, -sz * 0.55);
        c.bezierCurveTo(sz * 0.6, -sz * 0.75, sz * 0.7, -sz * 0.1, 0, 0);
        c.restore(); blk(c); cool(0.2, 0.8); hot(0.16, 0.8);
      }
    }
    // ---- the mug, by the right-hand pane
    {
      const { x, y, w, h } = MUG, top = y - h;
      mat(120, 92, 56);
      c.beginPath(); c.ellipse(x + w * 0.5, top + h * 0.45, w * 0.24, h * 0.27, 0, 0, TAU); c.ellipse(x + w * 0.5, top + h * 0.45, w * 0.13, h * 0.16, 0, 0, TAU);
      c.fillStyle = INK(); c.fill("evenodd");
      if (warm) rim(c, C.lamp, 0.34, 1); else rim(c, C.lav, 0.1, 1);
      c.beginPath(); c.moveTo(x - w / 2, top); c.lineTo(x - w * 0.46, y - 0.006 * S); c.quadraticCurveTo(x - w * 0.46, y, x - w * 0.38, y);
      c.lineTo(x + w * 0.38, y); c.quadraticCurveTo(x + w * 0.46, y, x + w * 0.46, y - 0.006 * S); c.lineTo(x + w / 2, top); c.closePath(); blk(c);
      c.beginPath(); c.moveTo(x - w / 2, top); c.lineTo(x - w * 0.46, y - 0.006 * S); cool(0.36);
      c.beginPath(); c.moveTo(x + w / 2, top); c.lineTo(x + w * 0.46, y - 0.006 * S); hot(0.38);
      mat(40, 30, 24);
      c.beginPath(); c.ellipse(x, top, w / 2, w * 0.11, 0, 0, TAU); blk(c); cool(0.3); hot(0.24);
    }
    // ---- the curtain, gathered at the right of the window
    {
      const x0 = X(0.075), x1 = X(0.215), top = Y(0.03), bot = Y(0.73);
      mat(94, 64, 70);
      c.beginPath();
      c.moveTo(x0 + 0.012 * S, top);
      c.bezierCurveTo(x0 - 0.014 * S, Y(0.26), x0 + 0.022 * S, Y(0.5), x0 + 0.004 * S, bot);
      c.quadraticCurveTo((x0 + x1) / 2, bot + 0.012 * S, x1, bot - 0.004 * S);
      c.lineTo(x1 + 0.004 * S, top); c.closePath(); blk(c);
      c.beginPath(); c.moveTo(x0 + 0.012 * S, top); c.bezierCurveTo(x0 - 0.014 * S, Y(0.26), x0 + 0.022 * S, Y(0.5), x0 + 0.004 * S, bot);
      cool(0.32); hot(0.08);
      // folds: ridges catch the lamp on their right, the window on their left
      for (let k = 1; k <= 5; k++) {
        const u = k / 6, fx = U.lerp(x0 + 0.01 * S, x1, u), sw = (k % 2 ? 1 : -1) * 0.008 * S;
        c.beginPath(); c.moveTo(fx, top + 0.01 * S); c.bezierCurveTo(fx + sw, Y(0.28), fx - sw, Y(0.52), fx + sw * 0.5, bot - 0.004 * S);
        if (warm) rim(c, C.lamp, 0.1 + 0.16 * u, 0.9); else if (RDAY) rim(c, MATH, 0.06 + 0.18 * (1 - u), 0.9); else rim(c, C.dusk, 0.12 * (1 - u), 0.9);
      }
      c.beginPath(); c.moveTo(x0 + 0.004 * S, bot); c.quadraticCurveTo((x0 + x1) / 2, bot + 0.012 * S, x1, bot - 0.004 * S); hot(0.22); cool(0.06);
    }
    // ---- the wall shelf: a small stereo (the hosts are its LEDs), a few books, a trailing plant
    {
      const y = SH.y, th = 0.012 * S;
      // the plant at the left end, vines hanging below the board
      const pp = X(0.335), pt = y - 0.045 * S;
      mat(100, 96, 90);
      c.beginPath(); c.moveTo(pp - 0.024 * S, pt); c.lineTo(pp + 0.024 * S, pt); c.lineTo(pp + 0.018 * S, y); c.lineTo(pp - 0.018 * S, y); c.closePath(); blk(c); hot(0.3); cool(0.08);
      for (let k = 0; k < 3; k++) {
        const vx = pp - 0.02 * S + k * 0.02 * S, len = (0.07 + k * 0.045 + hash(k + 40) * 0.03) * S;
        const p = [vx, pt + 0.004 * S, vx - 0.03 * S + k * 0.02 * S, pt, vx + (k - 1) * 0.02 * S, y + len * 0.5, vx + (k - 1) * 0.01 * S, y + len];
        mat(36, 66, 40);
        c.beginPath(); c.moveTo(p[0], p[1]); c.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]); c.lineWidth = 1.2; c.strokeStyle = INK(); c.stroke(); hot(0.16, 0.7);
        mat(46, 92, 52);
        for (let j = 1; j <= 5; j++) {
          const tt = j / 5.4, u = 1 - tt;
          const lx = u * u * u * p[0] + 3 * u * u * tt * p[2] + 3 * u * tt * tt * p[4] + tt * tt * tt * p[6];
          const ly = u * u * u * p[1] + 3 * u * u * tt * p[3] + 3 * u * tt * tt * p[5] + tt * tt * tt * p[7];
          c.beginPath(); c.ellipse(lx + (j % 2 ? 3 : -3), ly, 0.006 * S, 0.0035 * S, (j % 2 ? 0.5 : -0.5), 0, TAU); blk(c); hot(0.24, 0.8);
        }
      }
      // the stereo
      const s0 = SH.sx0, s1 = SH.sx1, sy = SH.sy0;
      mat(72, 72, 78);
      c.beginPath(); rr(c, s0, sy, s1 - s0, y - sy, 0.006 * S); blk(c); hot(0.34); cool(0.06);
      c.beginPath(); c.arc(X(0.445), (sy + y) / 2, 0.016 * S, 0, TAU); blk(c); hot(0.3);
      c.beginPath(); c.arc(X(0.445), (sy + y) / 2, 0.01 * S, 0, TAU); hot(0.14, 0.8);
      c.beginPath(); c.moveTo(X(0.445), (sy + y) / 2); c.lineTo(X(0.445) + 0.008 * S, (sy + y) / 2 - 0.009 * S); hot(0.3, 0.9);
      c.beginPath(); rr(c, X(0.475), sy + 0.012 * S, X(0.565) - X(0.475), 0.02 * S, 0.003 * S); hot(0.2, 0.8);
      c.beginPath(); for (let k = 0; k < 6; k++) { c.moveTo(X(0.575), sy + 0.012 * S + k * 0.006 * S); c.lineTo(X(0.59), sy + 0.012 * S + k * 0.006 * S); } hot(0.12, 0.7);
      // books, one leaning
      const BK = [[0.64, 0.021, 0.072], [0.661, 0.017, 0.082], [0.678, 0.023, 0.066], [0.701, 0.019, 0.076]];
      let bi = 0;
      for (const [bx, bw, bh] of BK) {
        mat(...BOOKS[bi++ % BOOKS.length]);
        c.beginPath(); c.rect(X(bx), y - bh * S, bw * S, bh * S); blk(c); hot(0.3, 0.9);
        c.beginPath(); c.moveTo(X(bx) + 2, y - bh * S * 0.8); c.lineTo(X(bx) + bw * S - 2, y - bh * S * 0.8); hot(0.14, 0.7);
      }
      mat(...BOOKS[4]);
      c.save(); c.translate(X(0.722), y); c.rotate(0.32);
      c.beginPath(); c.rect(0, -0.074 * S, 0.02 * S, 0.074 * S); blk(c); hot(0.3, 0.9); c.restore();
      // the board and its brackets
      mat(86, 62, 44);
      c.beginPath(); c.rect(SH.x0, y, SH.x1 - SH.x0, th); blk(c);
      c.beginPath(); c.moveTo(SH.x0, y); c.lineTo(SH.x1, y); hot(0.4); cool(0.06);
      c.beginPath(); c.moveTo(SH.x0, y + th); c.lineTo(SH.x1, y + th); hot(0.16);
      mat(36, 34, 34);
      for (const bxp of [SH.x0 + 0.06 * S, SH.x1 - 0.06 * S]) {
        c.beginPath(); c.moveTo(bxp, y + th); c.lineTo(bxp, y + th + 0.035 * S); c.lineTo(bxp + 0.03 * S, y + th); c.closePath(); blk(c); hot(0.2, 0.9);
      }
    }
    // ---- the sideboard
    {
      const x0 = X(0.22), x1 = X(0.89), y0 = Y(0.76), th = 0.013 * S, fy = Y(0.875);
      mat(66, 46, 34);
      c.beginPath(); c.rect(x0, y0, x1 - x0, fy - y0); blk(c);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y0); hot(0.5, 1.1); cool(0.05);
      c.beginPath(); c.moveTo(x0, y0 + th); c.lineTo(x1, y0 + th); hot(0.2);
      c.beginPath(); c.moveTo(x1, y0); c.lineTo(x1, fy); c.moveTo(x0, fy); c.lineTo(x1, fy); hot(0.14);
      c.beginPath(); c.moveTo((x0 + x1) / 2, y0 + th + 0.008 * S); c.lineTo((x0 + x1) / 2, fy - 0.008 * S); hot(0.1);
      for (const kx of [(x0 + x1) / 2 - 0.035 * S, (x0 + x1) / 2 + 0.035 * S]) { c.beginPath(); c.arc(kx, Y(0.82), 0.004 * S, 0, TAU); hot(0.3, 0.9); }
      for (const lx of [x0 + 0.04 * S, x1 - 0.04 * S]) {
        c.beginPath(); c.moveTo(lx - 0.006 * S, fy); c.lineTo(lx - 0.002 * S, fy + 0.05 * S); c.lineTo(lx + 0.002 * S, fy + 0.05 * S); c.lineTo(lx + 0.006 * S, fy); c.closePath();
        blk(c); hot(0.12, 0.8);
      }
    }
    // ---- records leaning behind the clock, one half out of its sleeve
    {
      const yb = Y(0.758), sz = 0.115 * S, REC = [[0.69, -0.05], [0.725, 0.06], [0.758, -0.13]];
      for (let k = 0; k < REC.length; k++) {
        const [rx, rot] = REC[k];
        c.save(); c.translate(X(rx), yb); c.rotate(rot);
        mat(26, 24, 24);
        if (k === 1) {
          c.beginPath(); c.arc(0, -sz + 0.004 * S, sz * 0.45, 0, TAU); blk(c); hot(0.42);
          c.beginPath(); c.arc(0, -sz + 0.004 * S, sz * 0.36, PI * 1.05, PI * 1.95); c.moveTo(sz * 0.27 * Math.cos(PI * 1.1), -sz + 0.004 * S + sz * 0.27 * Math.sin(PI * 1.1)); c.arc(0, -sz + 0.004 * S, sz * 0.27, PI * 1.1, PI * 1.9); hot(0.16, 0.7);
          c.beginPath(); c.arc(0, -sz + 0.004 * S, sz * 0.14, 0, TAU);
          if (warm) { c.fillStyle = U.rgba(U.safe(C.rose), 0.1); c.fill(); rim(c, C.rose, 0.3, 0.8); }
        }
        mat(...SLEEVES[k]);
        c.beginPath(); c.rect(-sz / 2, -sz, sz, sz); blk(c); hot(0.42); cool(0.04);
        // sleeve art, barely: a sun, stripes, a ring
        c.beginPath();
        if (k === 0) { c.arc(0, -sz * 0.55, sz * 0.2, 0, TAU); }
        else if (k === 1) { for (let j = 1; j < 5; j++) { c.moveTo(-sz / 2 + 2, -sz * j / 5); c.lineTo(sz / 2 - 2, -sz * j / 5 - sz * 0.08); } }
        else { c.arc(sz * 0.12, -sz * 0.4, sz * 0.28, 0, TAU); c.moveTo(sz * 0.12 + sz * 0.1, -sz * 0.4); c.arc(sz * 0.12, -sz * 0.4, sz * 0.1, 0, TAU); }
        hot(0.12, 0.8);
        c.restore();
      }
    }
    // ---- the alarm clock body: rounded, a snooze bar on top, a dark face
    {
      const { x0, x1, y0, y1 } = CK, r = 0.034 * S;
      mat(60, 90, 88);
      c.beginPath(); rr(c, X(0.405), y0 - 0.008 * S, X(0.495) - X(0.405), 0.012 * S, 0.004 * S); blk(c); hot(0.34); cool(0.06);
      for (const fx of [x0 + 0.04 * S, x1 - 0.06 * S]) { c.beginPath(); rr(c, fx, y1 - 0.004 * S, 0.02 * S, 0.006 * S, 0.002 * S); blk(c); hot(0.16, 0.8); }
      c.beginPath(); rr(c, x0, y0, x1 - x0, y1 - y0 - 0.002 * S, r); blk(c);
      c.beginPath(); c.moveTo(x0 + r, y0); c.lineTo(x1 - r, y0); c.arcTo(x1, y0, x1, y0 + r, r); c.lineTo(x1, y1 - r); hot(0.46, 1.1);
      c.beginPath(); c.moveTo(x0, y1 - r); c.lineTo(x0, y0 + r); c.arcTo(x0, y0, x0 + r, y0, r); cool(0.14); hot(0.12);
      const ins = 0.018 * S;
      c.beginPath(); rr(c, x0 + ins, y0 + ins, x1 - x0 - ins * 2, y1 - y0 - ins * 2 - 0.004 * S, r * 0.55);
      if (RDAY) { c.fillStyle = "rgb(16,16,18)"; c.fill(); }
      hot(0.16, 0.9); cool(0.03, 0.9);
    }
    // ---- the desk lamp: base, two arms, a cone shade pointing down at the clock
    {
      const L = LAMP, aw = 0.0075 * S;
      mat(46, 54, 56);
      c.beginPath(); c.ellipse(L.bx, L.by - 0.006 * S, 0.048 * S, 0.011 * S, 0, PI, TAU); c.lineTo(L.bx + 0.048 * S, L.by); c.lineTo(L.bx - 0.048 * S, L.by); c.closePath(); blk(c); hot(0.4); cool(0.05);
      c.beginPath(); c.moveTo(L.bx, L.by - 0.012 * S); c.lineTo(L.ex, L.ey); c.lineTo(L.px, L.py);
      c.lineWidth = aw; c.strokeStyle = INK(); c.stroke();
      c.beginPath(); c.moveTo(L.bx - aw * 0.4, L.by - 0.012 * S); c.lineTo(L.ex - aw * 0.4, L.ey); c.lineTo(L.px, L.py - aw * 0.45); hot(0.34, 0.9); cool(0.05, 0.9);
      for (const [jx, jy] of [[L.ex, L.ey], [L.bx, L.by - 0.012 * S]]) { c.beginPath(); c.arc(jx, jy, 0.008 * S, 0, TAU); blk(c); hot(0.36, 0.9); }
      // the shade
      const nx = -L.ay, ny = L.ax, rot = Math.atan2(ny, nx);
      c.beginPath();
      c.moveTo(L.px + nx * L.r0, L.py + ny * L.r0); c.lineTo(L.ox + nx * L.R0, L.oy + ny * L.R0);
      c.ellipse(L.ox, L.oy, L.R0, L.R0 * 0.3, rot, 0, PI, false);
      c.lineTo(L.px - nx * L.r0, L.py - ny * L.r0);
      c.arc(L.px, L.py, L.r0, rot + PI, rot, false); c.closePath(); blk(c);
      c.beginPath(); c.moveTo(L.px + nx * L.r0, L.py + ny * L.r0); c.lineTo(L.ox + nx * L.R0, L.oy + ny * L.R0); hot(0.3); cool(0.08);
      c.beginPath(); c.moveTo(L.px - nx * L.r0, L.py - ny * L.r0); c.lineTo(L.ox - nx * L.R0, L.oy - ny * L.R0); hot(0.44);
      c.beginPath(); c.arc(L.px, L.py, L.r0, rot + PI, rot, false); hot(0.3);
    }
  }

  // the lamp's warm pool on the wall and the sideboard (baked; the lamp's level is its alpha)
  function paintPool(c) {
    const L = LAMP, lc = U.safe(C.lamp);
    let g = c.createRadialGradient(L.ox, L.oy, 0, L.ox, L.oy, 0.62 * S);
    g.addColorStop(0, U.rgba(lc, 0.11)); g.addColorStop(0.22, U.rgba(lc, 0.055)); g.addColorStop(0.55, U.rgba(lc, 0.018)); g.addColorStop(1, U.rgba(lc, 0));
    c.fillStyle = g; c.fillRect(L.ox - 0.62 * S, L.oy - 0.62 * S, 1.24 * S, 1.24 * S);
    // the cone of light in the air, falling toward the sideboard
    const nx = -L.ay, ny = L.ax, far = 0.32 * S;
    c.save();
    c.beginPath();
    c.moveTo(L.ox + nx * L.R0 * 0.9, L.oy + ny * L.R0 * 0.9); c.lineTo(L.ox - nx * L.R0 * 0.9, L.oy - ny * L.R0 * 0.9);
    c.lineTo(L.ox + L.ax * far - nx * 0.16 * S, L.oy + L.ay * far - ny * 0.16 * S); c.lineTo(L.ox + L.ax * far + nx * 0.16 * S, L.oy + L.ay * far + ny * 0.16 * S); c.closePath();
    g = c.createLinearGradient(L.ox, L.oy, L.ox + L.ax * far, L.oy + L.ay * far);
    g.addColorStop(0, U.rgba(lc, 0.05)); g.addColorStop(1, U.rgba(lc, 0));
    c.fillStyle = g; c.fill(); c.restore();
    // where it lands on the sideboard top
    const px = X(0.555), py = Y(0.764);
    c.save(); c.translate(px, py); c.scale(1, 0.11);
    g = c.createRadialGradient(0, 0, 0, 0, 0, 0.3 * S);
    g.addColorStop(0, U.rgba(lc, 0.12)); g.addColorStop(0.5, U.rgba(lc, 0.05)); g.addColorStop(1, U.rgba(lc, 0));
    c.fillStyle = g; c.fillRect(-0.3 * S, -0.3 * S, 0.6 * S, 0.6 * S); c.restore();
  }

  // ------------------------------------------------------------------ the cat
  // Three poses over the evening: curled with its head to the right, stretched out with its head on its paws,
  // curled the other way. Each pose is a baked silhouette with the city's rim along its back; the breathing
  // is a slow scale of the sprite, the ears are drawn live so they can twitch.
  const CURL = {
    body: [["M", -0.46, 0], ["C", -0.56, -0.12, -0.42, -0.36, -0.18, -0.36], ["C", 0.0, -0.36, 0.1, -0.32, 0.15, -0.245],
      ["C", 0.17, -0.27, 0.23, -0.287, 0.29, -0.284], ["C", 0.37, -0.28, 0.43, -0.22, 0.435, -0.15], ["C", 0.44, -0.1, 0.42, -0.07, 0.395, -0.05],
      ["C", 0.42, -0.03, 0.425, -0.01, 0.41, 0], ["Z"]],
    tail: [["M", -0.45, -0.06], ["C", -0.28, -0.01, 0.08, -0.02, 0.28, -0.065], ["C", 0.33, -0.075, 0.37, -0.06, 0.355, -0.04]],
    ears: [[0.212, -0.262, 0.27, -0.283, 0.222, -0.358], [0.31, -0.283, 0.37, -0.26, 0.37, -0.35]],
  };
  const STRETCH = {
    body: [["M", 0.52, 0], ["C", 0.58, -0.08, 0.52, -0.2, 0.36, -0.215], ["C", 0.14, -0.235, -0.08, -0.23, -0.22, -0.2],
      ["C", -0.27, -0.24, -0.33, -0.27, -0.39, -0.265], ["C", -0.47, -0.26, -0.52, -0.2, -0.51, -0.14], ["C", -0.5, -0.1, -0.47, -0.08, -0.45, -0.075],
      ["C", -0.55, -0.06, -0.62, -0.05, -0.64, -0.025], ["C", -0.645, -0.005, -0.62, 0, -0.6, 0], ["Z"],
      ["M", 0.5, -0.055], ["C", 0.64, -0.045, 0.74, -0.045, 0.82, -0.058], ["C", 0.855, -0.062, 0.865, -0.033, 0.835, -0.024], ["C", 0.74, -0.012, 0.62, -0.008, 0.5, 0], ["Z"]],
    tail: [["M", -0.47, -0.074], ["C", -0.5, -0.05, -0.56, -0.045, -0.62, -0.03]],
    ears: [[-0.36, -0.262, -0.305, -0.248, -0.335, -0.335], [-0.445, -0.252, -0.39, -0.266, -0.44, -0.34]],
  };
  let CATS = null;
  const CAT_GOLD = "rgb(214,168,104)";
  function bakeCat(pose, m) {
    const u = 0.3 * S, w = 1.9 * u, h = 0.6 * u, ox = w / 2, oy = 0.48 * u;
    const sp = mk(w, h), c = sp.c;
    c.translate(ox, oy); c.lineCap = "round"; c.lineJoin = "round";
    c.beginPath(); segPath(c, pose.body, u, m); blk(c);
    // backlit by the city: a cool rim along the top of the silhouette
    c.save(); c.beginPath(); c.rect(-w, -h, 2 * w, h - 0.07 * u); c.clip();
    c.beginPath(); segPath(c, pose.body, u, m);
    rim(c, C.lav, 0.5, 1.4);
    c.restore();
    // the lamp, far off to the right, warms the side that faces it
    c.save(); c.beginPath(); c.rect(0.1 * u, -h, w, h); c.clip();
    c.beginPath(); segPath(c, pose.body, u, m);
    const g = c.createLinearGradient(0.1 * u, 0, 0.9 * u, 0);
    g.addColorStop(0, U.rgba(U.safe(C.lamp), 0)); g.addColorStop(1, U.rgba(U.safe(C.lamp), 0.3));
    c.lineWidth = 1.2; c.strokeStyle = g; c.stroke();
    c.restore();
    c.beginPath(); segPath(c, pose.tail, u, m); rim(c, C.lav, 0.2, 1);
    return { cv: sp.cv, w, h, ox, oy, u, m, ears: pose.ears };
  }
  function drawCat(ctx, t, el, a) {
    if (a <= 0.004 || !CATS) return;
    // which pose: shifts at about 2.3 h and 4.6 h into the evening, each shuffle taking half a minute
    const s1 = U.smoothstep(2.3 * HOUR, 2.3 * HOUR + 30, el), s2 = U.smoothstep(4.6 * HOUR, 4.6 * HOUR + 30, el);
    const ws = [1 - s1, s1 * (1 - s2), s2];
    const br = 0.5 - 0.5 * Math.cos(TAU * t / 3.9); // a slow breath
    // now and then an ear flicks, twice, quick
    const per = 14, k = Math.floor(t / per), u = t - (k * per + hash(k) * 9);
    const tw = u > 0 && u < 0.5 ? Math.sin(u / 0.5 * TAU) * 0.38 : 0, which = hash(k * 3.7) < 0.65 ? 1 : 0;
    for (let i = 0; i < 3; i++) {
      if (ws[i] <= 0.004) continue;
      const P = CATS[i], sy = 1 + 0.026 * br;
      ctx.globalAlpha = a * ws[i];
      if (DAY < 0.999) ctx.drawImage(P.cv, P.x - P.ox, P.y - P.oy * sy, P.w, P.h * sy);
      if (DAY > 0.004 && CATD) {
        ctx.globalAlpha = a * ws[i] * DAY; ctx.drawImage(CATD[i].cv, P.x - P.ox, P.y - P.oy * sy, P.w, P.h * sy);
        const sa = a * ws[i] * DAY * LD.beam;
        if (sa > 0.004) { ctx.globalAlpha = sa; ctx.drawImage(CATG[i].cv, P.x - P.ox, P.y - P.oy * sy, P.w, P.h * sy); }
      }
      ctx.beginPath();
      for (let e = 0; e < 2; e++) {
        const E = P.ears[e], m = P.m, uu = P.u;
        const bx1 = P.x + m * E[0] * uu, by1 = P.y + E[1] * uu * sy, bx2 = P.x + m * E[2] * uu, by2 = P.y + E[3] * uu * sy;
        let tx = P.x + m * E[4] * uu, ty = P.y + E[5] * uu * sy;
        if (e === which && tw !== 0) {
          const cx = (bx1 + bx2) / 2, cy = (by1 + by2) / 2, an = tw * m, dx = tx - cx, dy = ty - cy;
          tx = cx + dx * Math.cos(an) - dy * Math.sin(an); ty = cy + dx * Math.sin(an) + dy * Math.cos(an);
        }
        ctx.moveTo(bx1, by1 + 1); ctx.lineTo(tx, ty); ctx.lineTo(bx2, by2 + 1); ctx.closePath();
      }
      ctx.fillStyle = BLACK; ctx.globalAlpha = a * ws[i]; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = LAV_CSS; ctx.globalAlpha = a * ws[i] * 0.45 * (1 - DAY); ctx.stroke();
      if (DAY > 0.004) { ctx.strokeStyle = CAT_GOLD; ctx.globalAlpha = a * ws[i] * 0.7 * DAY * (0.25 + 0.75 * LD.beam); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ the shared cat (K)
  // When the viewer turns the cat on (K) it takes the sleeping silhouette's place on the sill: inside the room, in
  // front of the glass (the rain runs down the pane behind it), seen from behind looking out at the city, its tail
  // hanging over the sill. The city glow through the window edges it in lavender, the desk lamp warms its right
  // side; by day the sky and the sun through the glass rim it gold and it sits in its patch of sun. As the night
  // wears on it loafs, then curls up asleep on the sill.
  let KITTY = null;
  const KOFF = { alpha: 0 };
  const KO = { x: 0, y: 0, size: 0, facing: 1, pose: "back", light: 0.25, tint: null, tintAmt: 0.45, rim: null, glow: 0, shadow: 0, alpha: 1 };
  const K_LAV = U.safe(C.lav), K_LAMP = U.safe(C.lampHot), K_SKY = U.safe(U.hex("#8a9cc8"));
  const kRims = [{ color: K_LAV, a: 0, dx: -0.45, dy: -1 }, { color: K_LAMP, a: 0, dx: 1, dy: -0.25 }, { color: K_LAV, a: 0, dx: -1, dy: -0.2, width: 0.025 }];
  const kTint = { r: 0, g: 0, b: 0 };
  function drawKitty(ctx, f, a, lampK) {
    if (!KITTY) return;
    if (!f.cat || a <= 0.004 || !CATS) { KITTY.draw(ctx, f, KOFF); return; }
    const D = DAY, nk = 1 - D, o = KO;
    o.x = CATS[0].x + 0.03 * S; o.y = G.y1 + 0.009 * S; o.size = 0.145 * S;   // halfway back on the sill top
    o.pose = AW.cat.autoPose(f, "back");
    o.facing = 1;
    // night: the room is dark, the coat barely lit by the lamp; day: the room light, warmer in the sun
    o.light = U.lerp(0.17 + 0.1 * lampK, 0.55 + 0.27 * U.clamp(LD.light), D);
    const sun = LD.sun;
    kTint.r = U.lerp(U.lerp(150, 214, lampK), U.lerp(170, sun[0], 0.5 * LD.beam), D);
    kTint.g = U.lerp(U.lerp(140, 160, lampK), U.lerp(160, sun[1], 0.5 * LD.beam), D);
    kTint.b = U.lerp(U.lerp(190, 110, lampK), U.lerp(150, sun[2], 0.5 * LD.beam), D);
    o.tint = kTint; o.tintAmt = U.lerp(0.45, 0.35, D);
    // backlit by the window: the city (night) or the sky and sun (day) along the top and the window side,
    // the lamp's warmth from the right, a lightning flash outlining it all
    const day = U.safe({ r: U.lerp(K_SKY.r, sun[0], LD.beam), g: U.lerp(K_SKY.g, sun[1], LD.beam), b: U.lerp(K_SKY.b, sun[2], LD.beam) }, 205);
    kRims[0].color = D > 0.004 ? U.mix(K_LAV, day, D) : K_LAV;
    kRims[0].a = U.clamp(U.lerp(0.6, 0.45 + 0.4 * LD.beam, D) + 0.5 * FLASH);
    kRims[0].dx = D > 0.004 ? U.lerp(-0.45, -0.6 * LD.dir, D) : -0.45;
    kRims[1].a = 0.42 * lampK;
    kRims[2].color = kRims[0].color; kRims[2].a = 0.35 * nk + 0.2 * D;
    o.rim = kRims;
    o.glow = 0.5 * nk;
    o.shadow = 0.12 + 0.45 * D;
    o.alpha = a;
    KITTY.draw(ctx, f, o);
  }

  // ------------------------------------------------------------------ the live parts of the room
  // the lamp: the inside of the shade glowing, the bulb
  function drawLampGlow(ctx, k) {
    if (k <= 0.003) return;
    const L = LAMP, nx = -L.ay, ny = L.ax, rot = Math.atan2(ny, nx);
    ctx.globalAlpha = k * 0.42; ctx.fillStyle = U.rgba(U.safe(C.lampHot), 1);
    ctx.beginPath(); ctx.ellipse(L.ox, L.oy, L.R0 * 0.94, L.R0 * 0.26, rot, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    glowDot(ctx, C.lampHot, L.ox - L.ax * 0.008 * S, L.oy - L.ay * 0.008 * S, 0.05 * S, 0.55 * k);
    glowDot(ctx, C.lamp, L.ox + L.ax * 0.03 * S, L.oy + L.ay * 0.03 * S, 0.14 * S, 0.22 * k);
  }

  function steam(ctx, x, y, t, len, amp, a) {
    if (a <= 0.004) return;
    const c = U.safe(C.steam), g = ctx.createLinearGradient(x, y, x, y - len);
    g.addColorStop(0, U.rgba(c, 0)); g.addColorStop(0.15, U.rgba(c, a)); g.addColorStop(0.6, U.rgba(c, a * 0.4)); g.addColorStop(1, U.rgba(c, 0));
    ctx.strokeStyle = g; ctx.lineWidth = 1.4 * S / 1080;
    for (let s = 0; s < 2; s++) {
      ctx.beginPath(); ctx.moveTo(x + (s - 0.5) * 0.01 * S, y);
      for (let i = 1; i <= 36; i++) {
        const u = i / 36;
        const dx = (U.noise2(u * 2 + s * 4.1, t * 0.22 - u * 0.9) * amp + Math.sin(u * 6 - t * 0.8 + s * 1.9) * amp * 0.4) * Math.pow(u, 1.1);
        ctx.lineTo(x + (s - 0.5) * 0.01 * S + dx, y - u * len);
      }
      ctx.stroke();
    }
  }

  function drawFairy(ctx, t, b, lampK) {
    const n = FAIRY.length;
    for (let i = 0; i < n; i++) {
      const F = FAIRY[i], s0 = 0.48 + 0.34 * i / n;
      const on = U.smoothstep(s0, s0 + 0.05, b) * (1 - 0.85 * DAY);
      if (on <= 0.004) continue;
      const tw = 0.72 + 0.28 * Math.sin(t * F.sp + F.ph) * (0.6 + 0.4 * U.noise1(t * 0.3 + i));
      const k = on * tw * (0.85 + 0.15 * lampK);
      glowDot(ctx, F.col, F.x, F.y, 0.026 * S, 0.3 * k);
      ctx.globalAlpha = 0.62 * k; ctx.fillStyle = U.rgba(U.safe(F.col), 1);
      ctx.beginPath(); ctx.arc(F.x, F.y, 0.0024 * S, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // the alarm clock's face: seven-segment digits, a slowly breathing colon, its glow on the sideboard
  function drawAlarm(ctx, f, a) {
    if (a <= 0.004) return;
    let str = U.fmtTime(f.now, { hour24: !AW.config.clock || AW.config.clock.hour24 !== false });
    if (str.length === 4) str = " " + str; // 12 h mode only ("9:05"); 24 h keeps its leading zero
    const h = CK.dh, dw = 0.5 * h + 0.09 * h, gap = 0.024 * S, colW = 0.045 * S;
    const total = dw * 4 + gap * 2 + colW;
    let x = CK.cx - total / 2 + 0.006 * S;
    const y = CK.cy - h / 2;
    ctx.globalAlpha = U.clamp(a);
    for (let i = 0; i < 5; i++) {
      const ch = str[i];
      if (ch === ":") {
        const br = 0.6 + 0.4 * Math.cos(TAU * ((f.now.getSeconds() + f.now.getMilliseconds() / 1000) % 2) / 2);
        const cx = x + colW / 2 + 0.006 * S, d = 0.011 * S;
        ctx.globalAlpha = a * br; ctx.fillStyle = U.rgba(U.safe(C.clock), 0.9);
        ctx.beginPath(); rr(ctx, cx - d / 2, y + h * 0.28 - d / 2, d, d, d * 0.3); rr(ctx, cx - d / 2 - 0.004 * S, y + h * 0.72 - d / 2, d, d, d * 0.3); ctx.fill();
        glowDot(ctx, C.clock, cx, y + h * 0.28, d * 2.2, a * br * 0.5);
        glowDot(ctx, C.clock, cx - 0.004 * S, y + h * 0.72, d * 2.2, a * br * 0.5);
        ctx.globalAlpha = U.clamp(a);
        x += colW;
        continue;
      }
      const s = segSprite(ch, h, C.clock);
      ctx.drawImage(s.cv, x - s.pad, y - s.pad, s.w, s.h);
      x += dw + (i === 0 || i === 3 ? gap : 0);
    }
    ctx.globalAlpha = 1;
    // its light on the face, and on the sideboard below
    glowDot(ctx, C.clock, CK.cx, CK.cy, 0.2 * S, 0.12 * a, 0.07 * S);
    glowDot(ctx, C.clock, CK.cx, CK.y1 + 0.006 * S, 0.17 * S, 0.14 * a, 0.012 * S);
  }

  // ------------------------------------------------------------------ hosts: work rings that become LEDs
  function drawHosts(ctx, f, b, aTxt, ov) {
    const hb = Array.isArray(f.signals.heartbeat) ? f.signals.heartbeat : [];
    const n = hb.length;
    if (!n) return;
    const t = f.t, now = f.now;
    const e = U.easeInOut(U.smoothstep(0.1, 0.8, b)), k = U.smoothstep(0.35, 0.82, b);
    const sp = Math.min(0.02 * S, 0.075 * S / Math.max(1, n - 1));
    let whisper = 0;
    for (let i = 0; i < n; i++) {
      const h = hb[i], down = !h.up, name = String(h.host);
      const wx = X(0.3) + i * 0.22 * S, wy = Y(0.668);
      const lx = X(0.5) + i * sp, ly = SH.y - 0.014 * S;
      const x = U.lerp(wx, lx, e), y = U.lerp(wy, ly, e) - Math.sin(PI * e) * 0.04 * S;
      if (k < 0.996) {
        // work: a quiet ring; down: a red disc with a ripple going out from it
        const a = (1 - k) * ov, r = 0.011 * S * U.lerp(1, 0.35, e), col = down ? C.alarm : C.mint, cc = U.safe(col);
        if (down) {
          const ph = (t % 1.8) / 1.8;
          ctx.beginPath(); ctx.arc(x, y, r * (1.3 + ph * 2.4), 0, TAU);
          ctx.lineWidth = 1.3; ctx.strokeStyle = U.rgba(cc, a * 0.55 * (1 - ph)); ctx.stroke();
          glowDot(ctx, C.alarm, x, y, r * 4.5, a * (0.42 + 0.14 * Math.sin(t * 3.4)));
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = U.rgba(cc, a * 0.85); ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
          ctx.lineWidth = 4; ctx.strokeStyle = U.rgba(cc, a * 0.1); ctx.stroke();
          ctx.lineWidth = 1.4; ctx.strokeStyle = U.rgba(cc, a * 0.8); ctx.stroke();
          ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, TAU); ctx.fillStyle = U.rgba(cc, a * 0.7); ctx.fill();
        }
      }
      if (aTxt > 0.004) {
        const o = { px: 0.026 * S, weight: 400, color: down ? C.alarm : C.iceMid, glow: down ? 5 : 2 };
        const tw = text(ctx, name, wx + 0.022 * S, wy, o, "left", 1, aTxt * (down ? 1 : 0.8));
        if (down) {
          const since = h.downSince ? `down ${U.fmtMinutes((now - h.downSince) / 60000)}` : "down";
          text(ctx, since, wx + 0.022 * S, wy + 0.034 * S, { px: 0.022 * S, weight: 400, color: C.alarm, glow: 4 }, "left", 1, aTxt * 0.9);
        }
        void tw;
      }
      if (k > 0.004) {
        // ambient: an LED on the stereo. Up: calm and steady. Down: a soft red blink, the name whispered
        if (down) {
          const on = 0.5 + 0.5 * Math.cos(TAU * (t % 1.6) / 1.6);
          glowDot(ctx, C.ledDown, x, y, 0.03 * S, k * 0.38 * on);
          ctx.globalAlpha = k * (0.3 + 0.6 * on); ctx.fillStyle = U.rgba(U.safe(C.ledDown), 1);
          ctx.beginPath(); ctx.arc(x, y, 0.0036 * S, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
          text(ctx, name, SH.sx0 + 0.004 * S, SH.y + 0.036 * S + whisper * 0.03 * S, { px: 0.022 * S, weight: 400, style: "italic", color: C.rose, glow: 3 }, "left", 1, ov * k * (0.42 + 0.14 * on));
          whisper++;
        } else {
          const breathe = 0.9 + 0.1 * Math.sin(t * TAU / 11 + i * 2);
          glowDot(ctx, C.led, x, y, 0.014 * S, k * 0.22 * breathe);
          ctx.globalAlpha = k * 0.62 * breathe; ctx.fillStyle = U.rgba(U.safe(C.led), 1);
          ctx.beginPath(); ctx.arc(x, y, 0.0032 * S, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        }
      }
    }
  }

  // ------------------------------------------------------------------ the work desk HUD
  function drawOutline(ctx, a) {
    if (a <= 0.004) return;
    const c = U.safe(C.frost), r = 0.014 * S, f = G.f * 0.6;
    ctx.beginPath(); rr(ctx, G.x0 - f, G.y0 - f, G.w + 2 * f, G.h + 2 * f, r);
    ctx.lineWidth = 1; ctx.strokeStyle = U.rgba(c, 0.6 * a); ctx.stroke();
    // where the mullion meets the frame: two short ticks, the window remembered
    ctx.beginPath(); ctx.moveTo(G.mx, G.y0 - f); ctx.lineTo(G.mx, G.y0 - f + 0.022 * S); ctx.moveTo(G.mx, G.y1 + f); ctx.lineTo(G.mx, G.y1 + f - 0.022 * S);
    ctx.strokeStyle = U.rgba(c, 0.45 * a); ctx.stroke();
  }

  function drawWorkClock(ctx, f, b, ov) {
    const a = fade(b, 0.14, 0.52) * ov;
    if (a <= 0.004) return;
    const str = U.fmtTime(f.now, { hour24: !AW.config.clock || AW.config.clock.hour24 !== false });
    // as it fades it drifts down toward the alarm clock, where the time is going to live
    const e = U.easeInOut(U.smoothstep(0.06, 0.62, b));
    const h0 = 0.235 * S, k = U.lerp(1, CK.dh / h0, e);
    const cx = U.lerp(G.mx, CK.cx, e), cy = U.lerp(Y(0.29), CK.cy, e);
    glyphClock(ctx, str, cx, cy, h0, k, C.ice, 10, a * 0.92);
  }

  function drawDate(ctx, f, a) {
    if (a <= 0.004) return;
    const d = f.now, s = `${DAYS[d.getDay()]}  ·  ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    text(ctx, s, G.mx, Y(0.47) + (1 - a / OV) * 0.012 * S, { px: 0.036 * S, weight: 400, spacing: 0.04, color: C.iceMid, glow: 4 }, "center", 1, a * 0.85);
  }

  function wxIcon(ctx, cond, x, y, s, col, a) {
    const cc = U.rgba(U.safe(col), a);
    ctx.save(); ctx.translate(x, y); ctx.lineWidth = Math.max(1.2, s * 0.08); ctx.strokeStyle = cc; ctx.fillStyle = cc; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const cloud = (dy) => {
      ctx.beginPath(); ctx.moveTo(-0.42 * s, 0.1 * s + dy);
      ctx.arc(-0.24 * s, -0.02 * s + dy, 0.16 * s, 0.75 * PI, 1.55 * PI);
      ctx.arc(0.04 * s, -0.1 * s + dy, 0.24 * s, 1.1 * PI, 1.95 * PI);
      ctx.arc(0.27 * s, 0.0 * s + dy, 0.13 * s, 1.5 * PI, 0.5 * PI);
      ctx.closePath(); ctx.stroke();
    };
    if (cond === "fog") {
      ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(-0.4 * s + i * 0.06 * s, (-0.2 + i * 0.2) * s); ctx.lineTo(0.4 * s - (2 - i) * 0.06 * s, (-0.2 + i * 0.2) * s); } ctx.stroke();
    } else if (cond === "clear") {
      ctx.beginPath(); ctx.arc(0, 0, 0.2 * s, 0, TAU); ctx.stroke();
      ctx.beginPath(); for (let i = 0; i < 8; i++) { const q = i / 8 * TAU; ctx.moveTo(Math.cos(q) * 0.32 * s, Math.sin(q) * 0.32 * s); ctx.lineTo(Math.cos(q) * 0.42 * s, Math.sin(q) * 0.42 * s); } ctx.stroke();
    } else {
      cloud(cond === "cloudy" ? 0.05 * s : -0.1 * s);
      ctx.beginPath();
      if (cond === "rain") for (let i = 0; i < 3; i++) { const xx = (-0.2 + i * 0.18) * s; ctx.moveTo(xx, 0.16 * s); ctx.lineTo(xx - 0.06 * s, 0.38 * s); }
      else if (cond === "storm") { ctx.moveTo(0.02 * s, 0.12 * s); ctx.lineTo(-0.08 * s, 0.28 * s); ctx.lineTo(0.06 * s, 0.28 * s); ctx.lineTo(-0.04 * s, 0.44 * s); }
      else if (cond === "snow") for (let i = 0; i < 3; i++) { const xx = (-0.2 + i * 0.18) * s, yy = (0.24 + (i % 2) * 0.1) * s; ctx.moveTo(xx + 0.02 * s, yy); ctx.arc(xx, yy, 0.02 * s, 0, TAU); }
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawWeather(ctx, f, a) {
    const wx = f.signals.weather;
    if (!wx || !wx.actionable || a <= 0.004) return;
    const s = wx.tempC != null ? `${wx.actionable}  ·  ${Math.round(wx.tempC)}°` : wx.actionable;
    const o = { px: 0.032 * S, weight: 400, color: C.iceMid, glow: 4 }, tw = sprite(s, o).tw, is = 0.04 * S;
    const y = Y(0.54) + (1 - a / OV) * 0.012 * S, x0 = G.mx - (tw + is * 1.3) / 2;
    wxIcon(ctx, wx.condition, x0 + is / 2, y, is, C.iceMid, a * 0.85);
    text(ctx, s, x0 + is * 1.3, y, o, "left", 1, a * 0.85);
  }

  // the day as a bar along the sill: midnight to midnight, the daylight solid, what is left of it bright
  function drawDaylight(ctx, f, a) {
    const dl = f.signals.daylight;
    if (!dl || !dl.sunrise || !dl.sunset || a <= 0.004) return;
    const y = Y(0.71), x0 = G.x0, x1 = G.x1, k = U.easeOut(a / OV), mid = (x0 + x1) / 2, half = (x1 - x0) / 2 * k;
    const clipL = mid - half, clipR = mid + half;
    const midnight = f.now.getTime() - dl.dayFraction * 86400000;
    const xAt = (ms) => x0 + U.clamp((ms - midnight) / 86400000) * (x1 - x0);
    const xr = xAt(dl.sunrise.getTime()), xs = xAt(dl.sunset.getTime()), xn = xAt(f.now.getTime());
    const seg = (a0, a1, col, al, lw, dash) => {
      a0 = Math.max(a0, clipL); a1 = Math.min(a1, clipR);
      if (a1 <= a0) return;
      ctx.setLineDash(dash || SOLID);
      ctx.beginPath(); ctx.moveTo(a0, y); ctx.lineTo(a1, y);
      if (lw > 1.4) { ctx.lineWidth = lw * 3; ctx.strokeStyle = U.rgba(U.safe(col), al * 0.14); ctx.stroke(); }
      ctx.lineWidth = lw; ctx.strokeStyle = U.rgba(U.safe(col), al); ctx.stroke();
      ctx.setLineDash(SOLID);
    };
    seg(x0, xr, C.iceDim, 0.4 * a, 1, DOTTED);
    seg(xs, x1, C.iceDim, 0.4 * a, 1, DOTTED);
    seg(xr, xs, C.iceMid, 0.5 * a, 1.1);
    if (dl.isDay) seg(Math.max(xn, xr), xs, C.ice, 0.85 * a, 2.2);
    ctx.beginPath();
    for (const x of [xr, xs]) if (x >= clipL && x <= clipR) { ctx.moveTo(x, y - 0.008 * S); ctx.lineTo(x, y + 0.008 * S); }
    ctx.lineWidth = 1; ctx.strokeStyle = U.rgba(U.safe(C.iceMid), 0.6 * a); ctx.stroke();
    const lo = { px: 0.022 * S, weight: 400, color: C.iceDim, glow: 2 };
    if (xr >= clipL) text(ctx, U.fmtTime(dl.sunrise), xr, y + 0.028 * S, lo, "center", 1, a * 0.8);
    if (xs <= clipR) text(ctx, U.fmtTime(dl.sunset), xs, y + 0.028 * S, lo, "center", 1, a * 0.8);
    if (xn >= clipL && xn <= clipR) {
      const r = 0.008 * S, cc = U.safe(dl.isDay ? C.ice : C.iceMid);
      if (dl.isDay) {
        glowDot(ctx, C.ice, xn, y, r * 4, a * 0.4);
        ctx.beginPath(); ctx.arc(xn, y, r, 0, TAU); ctx.fillStyle = "#000"; ctx.fill();
        ctx.lineWidth = 1.4; ctx.strokeStyle = U.rgba(cc, a); ctx.stroke();
        ctx.beginPath(); ctx.arc(xn, y, r * 0.4, 0, TAU); ctx.fillStyle = U.rgba(cc, a * 0.85); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(xn, y, r, 0.6, TAU - 0.6, false); ctx.arc(xn + r * 0.55, y, r * 0.8, TAU - 0.9, 0.9, true);
        ctx.closePath(); ctx.fillStyle = "#000"; ctx.fill(); ctx.lineWidth = 1.1; ctx.strokeStyle = U.rgba(cc, 0.8 * a); ctx.stroke();
      }
    }
    let msg;
    const now = f.now.getTime();
    if (dl.isDay && dl.lightLeftMin != null) msg = `${U.fmtMinutes(dl.lightLeftMin)} of light left`;
    else if (now < dl.sunrise.getTime()) msg = `sunrise in ${U.fmtMinutes((dl.sunrise.getTime() - now) / 60000)}`;
    else msg = `dark  ·  sunrise ${U.fmtTime(new Date(dl.sunrise.getTime() + 86400000))}`;
    text(ctx, msg, mid, y + 0.07 * S, { px: 0.03 * S, weight: 400, color: dl.isDay ? C.ice : C.iceMid, glow: 5 }, "center", 1, a * 0.85);
  }

  function drawCalendar(ctx, f, a, ambA) {
    const next = f.signals.calendar && f.signals.calendar.next;
    if (!next) return;
    const mins = next.minutesUntil, soon = U.smoothstep(15, 3, mins);
    const cd = mins < 1 ? "now" : `in ${U.fmtMinutes(mins)}`;
    if (a > 0.004) {
      const x0 = X(0.3), dy = (1 - a / OV) * 0.012 * S;
      text(ctx, "NEXT", x0, Y(0.115) + dy, { px: 0.02 * S, weight: 500, spacing: 0.24, color: C.iceDim, glow: 2 }, "left", 1, a * 0.85);
      text(ctx, String(next.title), x0, Y(0.17) + dy, { px: 0.054 * S, weight: 400, color: C.ice, glow: 7 }, "left", 1, a * 0.92);
      const beat = soon > 0 ? 0.82 + 0.18 * Math.sin(f.t * 2.4) : 1;
      text(ctx, cd, x0, Y(0.232) + dy, { px: 0.036 * S, weight: 400, color: soon > 0.5 ? C.amber : C.iceMid, glow: 5 }, "left", 1, a * 0.9 * beat);
    }
    // ambient: a single whisper over the alarm clock, only when it is close
    if (mins < 30 && ambA > 0.004) {
      text(ctx, `${next.title}  ·  ${cd}`, CK.cx, CK.y0 - 0.034 * S, { px: 0.024 * S, weight: 400, style: "italic", color: C.clock, glow: 4 }, "center", 1, ambA * 0.5);
    }
  }

  const agoH = (d, now) => { const h = (now - d) / 3600000; return h >= 1 && h < 48 ? `${Math.round(h)} h ago` : U.fmtAgo(d, now); };
  function drawFinance(ctx, f, a) {
    const fin = f.signals.finances;
    if (!fin || a <= 0.004 || fin.income == null || fin.spent == null) return;
    const mood = fin.mood || "calm", warn = mood === "warning", drift = mood === "drift";
    const pulse = warn ? 0.75 + 0.25 * Math.sin(f.t * 2.2) : 1;
    const moodC = warn ? C.alarm : drift ? C.amber : C.mint;
    const x0 = X(0.3), x1 = X(0.8), dy = (1 - a / OV) * 0.012 * S;
    text(ctx, MONTHS[f.now.getMonth()].toUpperCase(), x0, Y(0.33) + dy, { px: 0.02 * S, weight: 500, spacing: 0.24, color: C.iceDim, glow: 2 }, "left", 1, a * 0.85);
    const lab = { px: 0.028 * S, weight: 400, color: C.iceDim, glow: 2 }, fig = { px: 0.034 * S, weight: 400, color: C.iceMid, glow: 4 };
    text(ctx, "made", x0, Y(0.385) + dy, lab, "left", 1, a * 0.85);
    text(ctx, U.fmtMoney(fin.income), x1, Y(0.385) + dy, fig, "right", 1, a * 0.9);
    text(ctx, "spent", x0, Y(0.43) + dy, lab, "left", 1, a * 0.85);
    text(ctx, U.fmtMoney(fin.spent), x1, Y(0.43) + dy, warn ? { px: 0.034 * S, weight: 400, color: C.alarm, glow: 5 } : fig, "right", 1, a * (warn ? pulse : 0.9));
    // a hairline: what came in, and how much of it has gone out
    const by = Y(0.461) + dy, fr = fin.income > 0 ? U.clamp(fin.spent / fin.income) : 1;
    ctx.beginPath(); ctx.moveTo(x0, by); ctx.lineTo(x1, by); ctx.lineWidth = 1; ctx.strokeStyle = U.rgba(U.safe(C.iceDim), 0.4 * a); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, by); ctx.lineTo(x0 + (x1 - x0) * fr, by); ctx.lineWidth = 2; ctx.strokeStyle = U.rgba(U.safe(moodC), 0.75 * a * pulse); ctx.stroke();
    const net = fin.net != null ? fin.net : fin.income - fin.spent;
    text(ctx, "net", x0, Y(0.51) + dy, lab, "left", 1, a * 0.85);
    text(ctx, U.fmtMoney(net, { sign: true }), x1, Y(0.51) + dy, { px: 0.048 * S, weight: 400, color: moodC, glow: warn ? 10 : 6 }, "right", 1, a * pulse * 0.92);
    if (fin.lastUpdated) text(ctx, `updated ${agoH(fin.lastUpdated, f.now)}`, x1, Y(0.556) + dy, { px: 0.02 * S, weight: 400, color: C.iceDim, glow: 2 }, "right", 1, a * 0.65);
  }

  // ------------------------------------------------------------------ news: one headline on the desk
  // Under the hosts in the right-hand column: the source and its age as a spaced-caps header (like NEXT and the
  // month), the headline beneath on one line, two for a long one, cut at a word with the real font's width.
  // Critical = the desk's one alarm language: a red disc with a ripple, the lines in alarm red, a slow pulse.
  // Ambient: gone; a critical item whispers once, faintly, above the radio, like a bulletin.
  let OV = 1; // the overlay dimming this frame: HUD alphas carry it, their drift (alpha / OV) does not
  const newsAge = (pub, now) => {
    const m = Math.max(0, (now - pub) / 60000);
    if (m < 60) return `${Math.max(1, Math.round(m))} min`;
    const h = m / 60;
    return h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`;
  };
  function fitCtx(o) {
    mctx.font = fontOf(o);
    if (spacingOk(mctx)) mctx.letterSpacing = `${(o.spacing || 0) * o.px}px`;
    return mctx;
  }
  // first line: as many words as fit; second (if needed): the rest, ellipsized at a word
  function wrap2(str, maxW, c) {
    if (c.measureText(str).width <= maxW) return [str];
    const words = str.split(" ");
    let l1 = "", i = 0;
    for (; i < words.length; i++) { const nx = l1 ? l1 + " " + words[i] : words[i]; if (c.measureText(nx).width > maxW) break; l1 = nx; }
    if (!l1) return [U.ellipsize(str, maxW, c)];
    return [l1, U.ellipsize(words.slice(i).join(" "), maxW, c)];
  }
  // laid out only when the item, its age (once a minute) or the stage changes; the strings then hit the sprite cache
  const NL = { key: "", lines: [], src: "", whisper: "", oHead: null, oSrc: null, oWh: null };
  function newsLayout(n, now) {
    const pub = n.published instanceof Date ? n.published : new Date(n.published);
    const age = isNaN(pub) ? "" : newsAge(pub, now), crit = !!n.critical;
    const key = `${n.headline}|${n.source || ""}|${age}|${crit ? 1 : 0}|${S}`;
    if (NL.key === key) return NL;
    NL.key = key;
    const head = String(n.headline).replace(/\s+/g, " ").trim();
    NL.oHead = { px: 0.03 * S, weight: 400, color: crit ? C.alarm : C.iceMid, glow: crit ? 6 : 4 };
    NL.oSrc = { px: 0.02 * S, weight: 500, spacing: 0.24, color: crit ? C.alarm : C.iceDim, glow: crit ? 4 : 2 };
    NL.oWh = { px: 0.022 * S, weight: 400, style: "italic", color: C.rose, glow: 3 };
    const colW = X(0.8) - X(0.3);
    NL.lines = wrap2(head, colW, fitCtx(NL.oHead));
    const src = [n.source, age].filter(Boolean).join("  ·  ").toUpperCase();
    NL.src = src ? U.ellipsize(src, colW - (crit ? 0.022 * S : 0), fitCtx(NL.oSrc)) : "";
    NL.whisper = crit ? U.ellipsize(head, 0.4 * S, fitCtx(NL.oWh)) : "";
    if (spacingOk(mctx)) mctx.letterSpacing = "0px";
    return NL;
  }
  function drawNews(ctx, f, a, ambA) {
    const n = f.signals.news;
    if (!n || !n.headline || (a <= 0.004 && ambA <= 0.004)) return;
    const L = newsLayout(n, f.now), crit = !!n.critical, t = f.t;
    if (a > 0.004) {
      const x0 = X(0.3), dy = (1 - a / OV) * 0.012 * S, yS = Y(0.765) + dy;
      const pulse = crit ? 0.82 + 0.18 * Math.sin(t * TAU / 3.6) : 1;
      let sx = x0;
      if (crit) {
        // the desk's alarm: a red disc, a slow ripple going out from it
        const r = 0.0075 * S, cc = U.safe(C.alarm), ph = (t % 3.6) / 3.6;
        ctx.beginPath(); ctx.arc(x0, yS, r * (1.3 + ph * 2.6), 0, TAU);
        ctx.lineWidth = 1.2; ctx.strokeStyle = U.rgba(cc, a * 0.5 * (1 - ph)); ctx.stroke();
        glowDot(ctx, C.alarm, x0, yS, r * 4.5, a * 0.36 * pulse);
        ctx.beginPath(); ctx.arc(x0, yS, r, 0, TAU); ctx.fillStyle = U.rgba(cc, a * 0.8 * pulse); ctx.fill();
        sx = x0 + 0.022 * S;
      }
      text(ctx, L.src, sx, yS, L.oSrc, "left", 1, a * (crit ? 0.9 * pulse : 0.8));
      for (let i = 0; i < L.lines.length; i++) text(ctx, L.lines[i], x0, Y(0.81 + i * 0.042) + dy, L.oHead, "left", 1, a * 0.9 * pulse);
    }
    // ambient: only a critical item, once, faintly, above the radio
    if (crit && L.whisper && ambA > 0.004) {
      const br = 0.85 + 0.15 * Math.sin(t * TAU / 9);
      text(ctx, L.whisper, (X(0.475) + X(0.565)) / 2, SH.sy0 - 0.032 * S, L.oWh, "center", 1, ambA * 0.36 * br);
    }
  }

  // ------------------------------------------------------------------ now playing
  // Work: one small line centred under the day bar ("title — artist", ellipsized in the real font), a play or
  // pause glyph before it, a progress hairline under it; paused dims. Ambient: the stereo on the shelf is playing
  // it: the title scrolls across its LCD (where "98.3" was; paused, it holds and blinks), its level LEDs pulse
  // gently, and the album art (when there is one) stands on the shelf beside it as a tiny record sleeve.
  // Null: nothing at all (the stereo shows 98.3, as before). Layouts are cached per track; glyphs are sprites.
  const ART = { url: null, img: null, ok: false };
  function artImg(np) {   // same-origin (or data:) only, loaded once per URL; a failed load just means no sleeve
    const u = np && typeof np.art === "string" ? np.art : null;
    if (!u) return null;
    if (u !== ART.url) {
      ART.url = u; ART.img = null; ART.ok = false;
      let ok = false;
      try { ok = /^data:image\//.test(u) || (location.protocol !== "file:" && new URL(u, location.href).origin === location.origin); } catch (e) { ok = false; }
      if (ok && typeof Image !== "undefined") {
        const img = new Image();
        img.onload = () => { if (ART.url === u && img.naturalWidth > 0) { ART.img = img; ART.ok = true; } };
        img.onerror = () => { if (ART.url === u) ART.ok = false; };
        img.src = u;
      }
    }
    return ART.ok ? ART.img : null;
  }
  const npOk = (np) => !!(np && (np.title || np.artist));
  const npFrac = (np) => (typeof np.progressMs === "number" && typeof np.durationMs === "number" && np.durationMs > 0 ? U.clamp(np.progressMs / np.durationMs) : -1);
  const npJoin = (np, sep) => [np.title, np.artist].filter(Boolean).map((s) => String(s).replace(/\s+/g, " ").trim()).join(sep);
  const NPW = { key: "", line: "", o: null };
  function drawNowPlaying(ctx, f, a) {
    const np = f.signals.nowPlaying;
    if (!npOk(np) || a <= 0.004) return;
    const key = `${np.title}|${np.artist}|${S}`;
    if (NPW.key !== key) {
      NPW.key = key;
      NPW.o = { px: 0.022 * S, weight: 400, color: C.iceMid, glow: 2 };
      NPW.line = U.ellipsize(npJoin(np, "  —  "), G.w * 0.6, fitCtx(NPW.o)).replace(/\s*—\s*…$/, "…");
      if (spacingOk(mctx)) mctx.letterSpacing = "0px";
    }
    const k = np.isPlaying ? 1 : 0.55, y = Y(0.84) + (1 - a / OV) * 0.012 * S;
    const tw = sprite(NPW.line, NPW.o).tw, gs = 0.0105 * S, gap = 0.013 * S;
    const x0 = G.mx - (tw + gs + gap) / 2, tx = x0 + gs + gap, cc = U.rgba(U.safe(C.iceMid), 1);
    ctx.globalAlpha = a * 0.55 * k; ctx.fillStyle = cc;
    if (!np.isPlaying) { ctx.fillRect(x0, y - gs * 0.5, gs * 0.34, gs); ctx.fillRect(x0 + gs * 0.62, y - gs * 0.5, gs * 0.34, gs); }
    else { ctx.beginPath(); ctx.moveTo(x0, y - gs * 0.55); ctx.lineTo(x0 + gs, y); ctx.lineTo(x0, y + gs * 0.55); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 1;
    text(ctx, NPW.line, tx, y, NPW.o, "left", 1, a * 0.62 * k);
    const fr = npFrac(np);
    if (fr >= 0) {
      const hy = y + 0.022 * S;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(tx, hy); ctx.lineTo(tx + tw, hy); ctx.lineWidth = 1; ctx.strokeStyle = U.rgba(U.safe(C.iceDim), 0.3 * a * k); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx, hy); ctx.lineTo(tx + tw * fr, hy); ctx.lineWidth = 1.4; ctx.strokeStyle = U.rgba(U.safe(C.iceMid), 0.65 * a * k); ctx.stroke();
    }
  }
  // the stereo: its LCD, its level LEDs, the sleeve beside it. k = how much of the room is up (ambient).
  const LCD = { key: "", str: "", o: null };
  const VU_CSS = [C.radio, C.radio, C.radio, C.radio, C.radio, C.lampHot, C.rose].map((c) => U.rgba(U.safe(c), 1));
  function drawStereo(ctx, f, k) {
    const np = f.signals.nowPlaying, cx = (X(0.475) + X(0.565)) / 2;
    if (!npOk(np)) {
      // the stereo is on, low: a lofi station in dim teal
      text(ctx, "98.3", cx, SH.sy0 + 0.022 * S, { px: 0.017 * S, mono: true, weight: 400, spacing: 0.08, color: C.radio, glow: 3 }, "center", 1, 0.42 * k);
      return;
    }
    if (k <= 0.004) return;
    const t = f.t, playing = !!np.isPlaying, key = `${np.title}|${np.artist}|${S}`;
    if (LCD.key !== key) {
      LCD.key = key;
      LCD.str = npJoin(np, " — ").toUpperCase() + "   ·   ";
      LCD.o = { px: 0.017 * S, mono: true, weight: 400, spacing: 0.08, color: C.radio, glow: 3 };
    }
    // the LCD: the track scrolling past (paused: it holds at the start and blinks, slowly)
    const lx0 = X(0.475) + 0.003 * S, lx1 = X(0.565) - 0.003 * S, ly0 = SH.sy0 + 0.0125 * S, lh = 0.019 * S, y = SH.sy0 + 0.022 * S;
    const sp = sprite(LCD.str, LCD.o), per = Math.max(1, sp.tw);
    const off = playing ? (t * 0.03 * S) % per : 0;
    const al = 0.42 * k * (playing ? 1 : 0.5 + 0.35 * (0.5 + 0.5 * Math.cos(t * PI)));
    ctx.save(); ctx.beginPath(); ctx.rect(lx0, ly0, lx1 - lx0, lh); ctx.clip();
    text(ctx, LCD.str, lx0 + 0.004 * S - off, y, LCD.o, "left", 1, al);
    if (playing) text(ctx, LCD.str, lx0 + 0.004 * S - off + per, y, LCD.o, "left", 1, al);
    ctx.restore();
    // the level LEDs under it: two short rows, breathing with the music (dark when paused)
    const sw = 0.0042 * S, sh = 0.0026 * S, step = 0.0062 * S, vx = X(0.477);
    for (let ch = 0; ch < 2; ch++) {
      const vy = SH.sy0 + (0.039 + ch * 0.0065) * S;
      const lit = playing ? 7 * U.clamp(0.45 + 0.22 * U.noise1(t * 1.6 + ch * 7.3) + 0.12 * U.noise1(t * 4.7 + ch * 3.1)) : 0;
      for (let j = 0; j < 7; j++) {
        ctx.globalAlpha = k * (0.06 + 0.5 * U.clamp(lit - j)); ctx.fillStyle = VU_CSS[j];
        ctx.fillRect(vx + j * step, vy, sw, sh);
      }
    }
    if (playing) glowDot(ctx, C.radio, vx + 0.02 * S, SH.sy0 + 0.042 * S, 0.03 * S, 0.12 * k, 0.012 * S);
    // the sleeve, leaning on the books
    const art = artImg(np);
    if (art) {
      const s = 0.034 * S, nw = art.naturalWidth, nh = art.naturalHeight, s0 = Math.min(nw, nh);
      ctx.save(); ctx.translate(X(0.604) + s, SH.y); ctx.rotate(0.1);
      ctx.globalAlpha = k; ctx.fillStyle = BLACK; ctx.fillRect(-s, -s, s, s);
      ctx.globalAlpha = k * (0.36 + 0.3 * DAY) * (playing ? 1 : 0.7);
      ctx.drawImage(art, (nw - s0) / 2, (nh - s0) / 2, s0, s0, -s, -s, s, s);
      ctx.globalAlpha = k * 0.3; ctx.strokeStyle = LAMP_CSS; ctx.lineWidth = 1; ctx.strokeRect(-s, -s, s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ sound: cues on the room's own events
  // Once per frame after the view is drawn, against the previous frame's time: the train when a new one enters the
  // window (the cue peaks ~7 s in, as it passes the middle), thunder on the flash (the engine lags it by distance),
  // and late at night now and then a page turned. Never every frame; ignored by the engine while sound is off.
  const SND = { t: -1, trainK: null, lnT0: -100, pageAt: -1 };
  function soundCues(f, b, cityA) {
    const t = f.t, t0 = SND.t, el = f.ambientElapsed || 0;
    SND.t = t;
    const ok = !!AW.audio && t0 >= 0 && t > t0 && t - t0 <= 1 && cityA > 0.5;
    // the elevated train: the same timetable as drawTrain / drawTrainDay
    const P = el < 2 * HOUR ? 80 : el < 4.5 * HOUR ? 115 : 170, tt = t + 6.5, k = Math.floor(tt / P), ph = tt - k * P;
    if (ok && SND.trainK !== null && k !== SND.trainK && ph < 1.5) AW.audio.cue("train", { pan: 0.6 * ((k & 1) ? -1 : 1), distance: 0.55, gain: 0.7 });
    SND.trainK = k;
    // thunder: a new strike since last frame
    if (lnT0 !== SND.lnT0) {
      if (ok && t - lnT0 < 0.5) AW.audio.cue("thunder", { distance: 0.15 + 0.8 * lnD, pan: (lnX - 0.5) * 1.4, gain: 0.6 + 0.4 * U.clamp(WXI[4]) });
      SND.lnT0 = lnT0;
    }
    // late at night, a page now and then (every few minutes)
    if (ok && b > 0.9 && DAY < 0.2 && el > 1.5 * HOUR) {
      if (SND.pageAt < 0) SND.pageAt = t + 60 + hash(t) * 120;
      else if (t >= SND.pageAt) { AW.audio.cue("page", { gain: 0.35, distance: 0.35, pan: 0.35 }); SND.pageAt = t + 150 + hash(t * 0.71) * 240; }
    } else SND.pageAt = -1;
  }

  // ------------------------------------------------------------------ the shared info overlay, in this room's voice
  // Work: the desk HUD's rounded sans in ice cyan. Ambient: the apartment's lamp amber and rose. Cached per step.
  const OVS = { k: -1, v: null };
  function overlayStyle(f) {
    const b = U.clamp(f.blend || 0), k = Math.round(b * 32) / 32;
    if (OVS.k === k && OVS.v) return OVS.v;
    const m = (w, a) => U.safe(U.mix(w, a, k));
    OVS.k = k;
    OVS.v = {
      font: SANS,
      ink: m(C.ice, C.lamp), dim: m(C.iceDim, U.scale(C.rose, 0.72)), accent: m(C.mint, C.peach),
      alarm: m(C.alarm, C.ledDown), glow: U.lerp(0.5, 0.35, k), rule: "hairline", caps: false,
    };
    return OVS.v;
  }

  // ------------------------------------------------------------------ build
  let roomBase = null, roomWarm = null, poolL = null;
  function build() {
    if (!mctx) mctx = document.createElement("canvas").getContext("2d");
    sprites.clear(); dots.clear(); discs.clear();
    S = Math.min(H, W / 1.8);
    layout();
    // the room
    roomBase = mk(W, H); roomWarm = mk(W, H); poolL = mk(W, H);
    paintRoom(roomBase.c, false);
    paintRoom(roomWarm.c, true);
    {
      // the lamplight falls off with distance from the shade
      const c = roomWarm.c, L = LAMP, R = 1.25 * S;
      c.globalCompositeOperation = "destination-in";
      const g = c.createRadialGradient(L.ox, L.oy, 0, L.ox, L.oy, R);
      g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.35, "rgba(0,0,0,0.75)"); g.addColorStop(0.7, "rgba(0,0,0,0.3)"); g.addColorStop(1, "rgba(0,0,0,0.1)");
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = "source-over";
    }
    paintPool(poolL.c);
    // the city
    const mkV = () => { const L = mk(G.vw, G.vh); L.c.translate(-G.vx, -G.vy); return L; };
    backL = mkV(); frontL = mkV(); viewL = mkV(); bokehL = mkV(); glowL = mkV(); skyL = mkV();
    genCity();
    if (!cloudF) cloudField();
    cityKey = skyKey = cloudKey = ""; viewPat = bokehPat = null;
    // the cat, three ways
    CATS = [bakeCat(CURL, 1), bakeCat(STRETCH, 1), bakeCat(CURL, -1)];
    CATS[0].x = X(-0.42); CATS[1].x = X(-0.47); CATS[2].x = X(-0.4);
    for (const P of CATS) P.y = G.y1;
    const r = U.rng(4711);
    // rain past the window: [x, phase, speed (heights/s), length (of S)]; a downpour uses all of them
    RAIN = new Float32Array(180 * 4);
    for (let i = 0; i < RAIN.length; i += 4) { RAIN[i] = r(); RAIN[i + 1] = r(); RAIN[i + 2] = 0.9 + r() * 0.6; RAIN[i + 3] = 0.014 + r() * 0.02; }
    // flakes drifting past: [x, phase, speed (heights/s), size (px at 1080), sway phase]
    FLAKES = new Float32Array(140 * 5);
    for (let i = 0; i < FLAKES.length; i += 5) { FLAKES[i] = r(); FLAKES[i + 1] = r(); FLAKES[i + 2] = 0.05 + r() * 0.08; FLAKES[i + 3] = 1.1 + r() * 1.4; FLAKES[i + 4] = r() * 100; }
    glassInit = false;
    dayBuilt = false; dCityBack = dCityFront = dBackL = dFrontL = daySkyL = dayViewL = dayBlurL = roomDay = wallDay = null; dayViewPat = null;
    built = `${W}x${H}@${dpr}`;
  }

  // ------------------------------------------------------------------ theme
  AW.registerTheme({
    id: "lofi",
    name: "Lofi",
    init(ctx, env) { dpr = env.dpr || 1; W = env.width; H = env.height; build(); if (!KITTY && AW.cat) KITTY = AW.cat.create(23); },
    resize(env) { dpr = env.dpr || 1; W = env.width; H = env.height; build(); },
    destroy() {
      sprites.clear(); dots.clear(); discs.clear();
      roomBase = roomWarm = poolL = backL = frontL = viewL = bokehL = glowL = skyL = null; viewPat = bokehPat = null; built = "";
      NL.key = ""; OVS.k = -1; NPW.key = ""; LCD.key = ""; SND.t = -1; SND.trainK = null;
      dayBuilt = false; dCityBack = dCityFront = dBackL = dFrontL = daySkyL = dayViewL = dayBlurL = roomDay = wallDay = null; dayViewPat = null;
    },
    overlayStyle,

    render(ctx, f) {
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.width, f.height);
      if (f.width !== W || f.height !== H || (f.dpr || 1) !== dpr || !built) {
        dpr = f.dpr || 1; W = f.width; H = f.height; build();
      }
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      const b = U.clamp(f.blend || 0), t = f.t, dt = Math.min(0.1, f.dt || 0.016), Sg = f.signals || {};
      const el = f.ambientElapsed || 0;
      // the shared info overlay is up: the HUD and the readouts step back so the panel reads (the room lives on)
      const ov = f.overlay ? 1 - 0.7 * U.clamp(+f.overlay.a || 0) : 1;
      OV = ov;
      // the real weather, eased between conditions (null = clear); the window shows it
      updateWeather(Sg.weather, dt, t);

      // ---------------------------------------------------- the apartment (ambient)
      const cityA = U.smoothstep(0.28, 0.85, b), roomA = U.smoothstep(0.18, 0.7, b), glassA = U.smoothstep(0.4, 0.92, b);
      // the lamp clicks on (or off) at the same point of the exhale either way, with a stutter in it
      const click = U.smoothstep(0.36, 0.4, b);
      let lampK = click < 1 && click > 0 ? click * (U.noise1(t * 37) > -0.15 ? 1 : 0.35) : click;
      lampK *= (1 - 0.2 * U.smoothstep(0, 6 * HOUR, el)) * (0.985 + 0.015 * U.noise1(t * 0.6));
      // daylight: 0 at night (every day path is skipped, the night is exactly as it was). By day the lamp is off.
      DAY = U.clamp(f.day || 0);
      const D = DAY, bk = 0.18 * D * (1 - U.smoothstep(0.7, 1, b));   // the work face's faint day backdrop
      if (D > 0.004) {
        if (!dayBuilt) buildDay();
        if (dayParams(Sg.daylight, t)) bakeDay(ctx);
        else if (LD.stage) bakeDayStep();
        // the meter reads pixels back (a GPU sync), so it runs at most every 3 s, on a frame of its own
        else if (LD.meterDue && t - LD.meteredAt >= 3) { meterDay(); LD.meterDue = false; LD.meteredAt = t; }
        if (LD.first) { while (LD.stage) bakeDayStep(); meterDay(); LD.meterDue = false; LD.meteredAt = t; LD.first = false; }   // the very first light: all at once
        LD.expo += (LD.expoT - LD.expo) * (1 - Math.exp(-dt / 2));   // exposure never steps
        lampK *= 1 - D;
      }
      FLASH = 0;
      if (b > 0.004 || bk > 0.004) {
        const dl = Sg.daylight, elev = dl && dl.elevation != null ? dl.elevation : -20;
        let flash = 0;
        // by day: the plaster wall behind it all (the work face keeps it faint)
        const wA = D > 0.004 ? 1 - (1 - roomA * D) * (1 - bk) : 0;
        if (wA > 0.004) { ctx.globalAlpha = wA; ctx.drawImage(wallDay.cv, 0, 0, W, H); }
        if (cityA > 0.004) flash = drawView(ctx, f, t, dt, el, elev, cityA, glassA, bk);
        else if (bk > 0.004) drawDayViewFlat(ctx, bk);
      }
      if (b > 0.004) {
        if (lampK > 0.003) { ctx.globalAlpha = lampK; ctx.drawImage(poolL.cv, 0, 0, W, H); }
        if (D < 0.999) { ctx.globalAlpha = roomA; ctx.drawImage(roomBase.cv, 0, 0, W, H); }
        if (FLASH > 0.004 && D < 0.999) { ctx.globalAlpha = roomA * FLASH * 0.7 * (1 - D); ctx.drawImage(roomBase.cv, 0, 0, W, H); }
        if (lampK > 0.003) { ctx.globalAlpha = roomA * lampK; ctx.drawImage(roomWarm.cv, 0, 0, W, H); }
        if (D > 0.004) {
          ctx.globalAlpha = roomA * D; ctx.drawImage(roomDay.cv, 0, 0, W, H);
          // the sun through the glass: on the sill, and thrown across the wall (never on the glass itself)
          const ba = roomA * D * LD.beam;
          if (ba > 0.004) {
            ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); panes(ctx); ctx.clip("evenodd");
            ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = U.lerp(0.42, 0.36, LD.low) * ba; ctx.drawImage(beamB, 0, 0, W, H);
            ctx.restore(); ctx.globalCompositeOperation = "source-over";
            // the cat's patch of sun, and the dust turning in the light
            glowDot(ctx, { r: LD.sun[0], g: LD.sun[1], b: LD.sun[2] }, CATS[0].x, G.y1 - 0.02 * S, 0.4 * S, 0.5 * ba * U.smoothstep(0.74, 1, b), 0.13 * S);
            drawMotes(ctx, t, 0.9 * ba);
          }
        }
        ctx.globalAlpha = 1;
        drawLampGlow(ctx, lampK * roomA);
        // the tea goes cold: the steam is gone by about the hour
        const steamK = (1 - U.smoothstep(0.35 * HOUR, HOUR, el)) * U.smoothstep(0.55, 1, b);
        steam(ctx, MUG.x, MUG.y - MUG.h - 0.006 * S, t, 0.14 * S, 0.018 * S, 0.2 * steamK);
        drawFairy(ctx, t, b, lampK);
        // the shared cat (K), on the sill in front of the glass; it takes the sleeping silhouette's place
        drawKitty(ctx, f, U.smoothstep(0.74, 1, b), lampK * roomA);
        // exposure: if this light and weather would run the day past the budget, settle it under
        if (D > 0.004 && LD.expo < 0.999) { ctx.globalAlpha = (1 - LD.expo) * D; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
        drawAlarm(ctx, f, U.smoothstep(0.38, 0.78, b) * ov);
        // the stereo is on, low: a lofi station (98.3), or the track that is playing
        drawStereo(ctx, f, U.smoothstep(0.5, 0.9, b));
        drawCat(ctx, t, el, U.smoothstep(0.74, 1, b) * (1 - (f.cat ? U.clamp(f.cat.a) : 0)));
      } else {
        if (KITTY) KITTY.draw(ctx, f, KOFF);
        if (bk > 0.004 && LD.expo < 0.999) { ctx.globalAlpha = (1 - LD.expo) * D; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
      }

      // ---------------------------------------------------- the desk HUD (work), fading in a cascade
      drawOutline(ctx, fade(b, 0.2, 0.6) * ov);
      drawFinance(ctx, f, fade(b, 0.0, 0.24) * ov);
      drawNews(ctx, f, fade(b, 0.02, 0.26) * ov, U.smoothstep(0.6, 0.95, b) * ov);
      drawWeather(ctx, f, fade(b, 0.08, 0.33) * ov);
      drawDaylight(ctx, f, fade(b, 0.1, 0.36) * ov);
      drawDate(ctx, f, fade(b, 0.12, 0.4) * ov);
      drawCalendar(ctx, f, fade(b, 0.05, 0.3) * ov, U.smoothstep(0.45, 0.85, b) * ov);
      drawWorkClock(ctx, f, b, ov);
      drawHosts(ctx, f, b, fade(b, 0.03, 0.27) * ov, ov);
      drawNowPlaying(ctx, f, fade(b, 0.06, 0.32) * ov);
      ctx.globalAlpha = 1;
      soundCues(f, b, cityA);
    },
    // The apartment as sound: room tone, the city muffled behind the glass (quieter as it goes to sleep), the rain
    // on the window as the hero, the wind through the frame, a few birds by day. No crickets (urban), nothing for
    // the cat. Work mode is core's master level.
    soundscape(f) {
      const day = U.clamp(f.day || 0), el = f.ambientElapsed || 0, w = f.signals && f.signals.weather;
      const T = w && typeof w.tempC === "number" ? w.tempC : 12;
      const rain = U.clamp(WXP[3] * (0.35 + 0.65 * WXI[3]) + WXP[4] * (0.85 + 0.15 * WXI[4]));
      return {
        room: 0.25,
        city: 0.3 * (1 - 0.3 * U.smoothstep(0, 5 * HOUR, el) * (1 - day)) * (1 - 0.3 * WX.snow),
        rain,
        wind: 0.6 * U.clamp(0.85 * U.smoothstep(6, 55, wxWind) + 0.15 * WXP[4]),
        birds: 0.25 * day * U.smoothstep(4, 9, T) * (1 - 0.85 * U.clamp(rain * 1.2)),
        crickets: 0,
      };
    },
  });
})();
