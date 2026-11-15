// Stained Glass: a cathedral rose window, lit from behind by the real sky.
// Work = the window as the architect's elevation, standing on the right of the wall: the tracery in
//   cool silver hairline (every stone bar double-lined, the glazing pattern faint, dashed setting-out
//   lines), ringed by a 24-hour dial (noon at the top) with sunrise and sunset ticks and the light that
//   is left. The serif clock, date, calendar, weather sliver and the month's ledger stand in a column
//   to its left; hosts are small roundels in the spandrels, a down host the rare ruby flare.
// Ambient = the window built and glazed, centred on the wall between two lancets: a twelve-petal rose
//   (a cusped oculus, radiating petals with pointed heads, twelve quatrefoil roundels, a beaded border,
//   glazed spandrels in a square frame), every piece a cell of jewel glass (ruby, cobalt, emerald, amber,
//   violet) between black leads and faint grey-blue stone. The real sky lights it from behind (the
//   window faces south: east is screen left, west is screen right):
//   dusk blazes warm on the sunset side and cools to cobalt on the other; at night the panes go nearly
//   dark and the moon (true position and phase) lays a pale wash through a few of them; on a weekend
//   day the glass is rich and luminous. Weather: clear = sharp directional light; cloud dims and
//   flattens it; fog turns it milky and diffuse; rain runs down the outside in rivulets that bend the
//   colours behind them; a storm adds rare lightning that lights every pane at once (dimly, in its own
//   colour); snow banks on the ledges of the tracery and darkens the lower panes. A faint coloured
//   pattern falls on the floor below.
// Over the evening: one petal per hour glows a little brighter (the window is a clock face, twelve at
//   the top), and as the night deepens candles inside catch the lowest panes with a warm flicker.
// The exhale: the inscriptions fade in a cascade, the drawing slides to the centre and becomes stone,
//   then the glass fills with light pane by pane, spiralling out from the oculus. Back to work, the light
//   drains from the rim inward and the drawing returns.
// Caches: tracery, leads, stone, snow, the lightning layer and the candle layers are baked once per size
//   at device resolution; the lit glass (and its blurred glow) is rebuilt only when the sky, the weather,
//   the hour or the reveal moves meaningfully.
(function () {
  const U = AW.util;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const SERIF = '"Cormorant Garamond", "EB Garamond", Garamond, "TeX Gyre Pagella", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "DejaVu Serif", serif';

  const C = {
    silver: U.hex("#a6bed2"),    // work hero: the draughtsman's silver
    silverMid: U.hex("#7d9ab4"),
    silverDim: U.hex("#587690"),
    cyan: U.hex("#6cc0d0"),      // what is live on the work face: light left, hosts up
    alarm: U.hex("#e05a3a"),
    drift: U.hex("#c8b07a"),
    stone: U.hex("#56688a"),     // the tracery in ambient: a faint grey-blue line
    gilt: U.hex("#caa04e"),
    giltDim: U.hex("#9a7a42"),
    ruby: U.hex("#c0283c"),
    rubyLit: U.hex("#d0413b"),  // ruby as text: the overlay's alarm by the lit window
    teal: U.hex("#2a9c8c"),
    candle: U.hex("#e0a04a"),
    snow: U.hex("#9aaccc"),
    rain: U.hex("#8ca2c8"),
    rainDay: U.hex("#a8bad8"),  // rain on the glass by day: the streams catch the sky
    murk: U.hex("#7488a8"),
    stoneDay: U.hex("#7a7266"),  // the tracery's inner face by day, lit by the room
  };
  // glass at full transmission (0-255); the sky decides how much of it comes through
  const GL = {
    ruby: [190, 20, 45], rose: [172, 36, 106], amber: [214, 138, 28], gold: [205, 166, 58],
    emerald: [18, 148, 88], teal: [18, 128, 150], cobalt: [34, 68, 212], sapph: [26, 44, 156], violet: [118, 44, 190],
  };

  // geometry, in units of the rose's radius, y down, angles from the top clockwise
  const OC = 0.155, RS = 0.47, RM = 0.575, RO = 0.875, RF = 1.0;   // oculus, springing, mid ring, outer ring, frame
  const SQ = 1.06;                                                // half-side of the square frame
  const SLOT = 0.86, SLOT_R = 0.15;                               // spandrel roundels (hosts)
  const LX = 1.68, LHW = 0.165, LSPR = -0.48, LSILL = 1.0;        // lancets
  const LEADW = 0.0045;
  const SLOTS = [[-1, 1], [1, 1], [-1, -1], [1, -1]];             // hosts take BL, BR, TL, TR

  // ------------------------------------------------------------------ canvases + sprites
  let dpr = 1, W = 0, H = 0, built = "";
  let RA = 1, cxA = 0, cyA = 0, Rw = 1, cxW = 0, cyW = 0, lancetsOn = true;
  let GEO = null, compL = null, glowL = null, flashL = null, floorL = null, stoneL = null, snowL = null, workL = null, infoL = null;
  // by day: the interior wall (baked plain, relit per sky into roomL), the tracery's lit stone, snow in daylight
  let wallL = null, roomL = null, stoneDayL = null, snowDayL = null, texL = null, roomKey = "";
  let CANDLES = [], ROSETTE = null;
  const GLOW = { cv: null, x0: 0, y0: 0, w: 1, h: 1, cx: 0, cy: 0, R: 1 };   // the glow, placed like the glass
  let compKey = "", relightT = -1;
  const sprites = new Map(), dots = new Map();
  let mctx = null;

  function mk(wCss, hCss) {
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.ceil(wCss * dpr)); cv.height = Math.max(1, Math.ceil(hCss * dpr));
    const c = cv.getContext("2d"); c.scale(dpr, dpr);
    return { cv, c };
  }
  // a layer covering the unit-space box [ux0, ux1] x [uy0, uy1] of a window of radius R centred at (cx, cy)
  function layer(ux0, uy0, ux1, uy1, R, cx, cy) {
    const x0 = Math.floor(cx + ux0 * R) - 2, y0 = Math.floor(cy + uy0 * R) - 2;
    const w = Math.ceil((ux1 - ux0) * R) + 4, h = Math.ceil((uy1 - uy0) * R) + 4;
    const L = mk(w, h);
    L.x0 = x0; L.y0 = y0; L.w = w; L.h = h; L.R = R; L.cx = cx; L.cy = cy;
    return L;
  }
  // draw in unit space on a layer
  function unit(L) {
    L.c.setTransform(dpr * L.R, 0, 0, dpr * L.R, dpr * (L.cx - L.x0), dpr * (L.cy - L.y0));
    L.c.lineCap = "round"; L.c.lineJoin = "round";
  }
  function clearL(L) { L.c.setTransform(1, 0, 0, 1, 0, 0); L.c.globalCompositeOperation = "source-over"; L.c.clearRect(0, 0, L.cv.width, L.cv.height); }

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
  const fade = (b, a0, a1) => 1 - U.smoothstep(a0, a1, b);
  const css = (c, a) => U.rgba(U.safe(c), a);

  // ------------------------------------------------------------------ astronomy (from classical)
  function astro(date, lon) {
    const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
    const L = (280.46 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
    const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
    const eps = (23.439 - 0.0000004 * n) * RAD;
    const sunDec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const sunRa = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    const gmst = (((18.697374558 + 24.06570982441908 * n) % 24) + 24) % 24;
    const lst = (gmst * 15 + lon) * RAD;
    const Lm = (218.316 + 13.176396 * n) * RAD, Mm = (134.963 + 13.064993 * n) * RAD, F = (93.272 + 13.22935 * n) * RAD;
    const lamM = Lm + 6.289 * RAD * Math.sin(Mm), betM = 5.128 * RAD * Math.sin(F);
    const moonRa = Math.atan2(Math.sin(lamM) * Math.cos(eps) - Math.tan(betM) * Math.sin(eps), Math.cos(lamM));
    const moonDec = Math.asin(Math.sin(betM) * Math.cos(eps) + Math.cos(betM) * Math.sin(eps) * Math.sin(lamM));
    let el = (lamM - lam) % TAU; if (el < 0) el += TAU;
    return { sunDec, sunH: lst - sunRa, moonDec, moonH: lst - moonRa, illum: (1 - Math.cos(el)) / 2 };
  }
  // equatorial (dec, hour angle) -> horizontal (alt, az from north through east), degrees
  function horiz(dec, Hh, phi) {
    const sa = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(Hh);
    let az = Math.atan2(-Math.cos(dec) * Math.sin(Hh), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(Hh));
    if (az < 0) az += TAU;
    return { alt: Math.asin(U.clamp(sa, -1, 1)) / RAD, az: az / RAD };
  }

  // ------------------------------------------------------------------ geometry helpers (unit space)
  const pol = (r, a) => [r * Math.sin(a), -r * Math.cos(a)];
  function polyPath(pts) {
    const p = new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
    return p;
  }
  function arcPts(cx, cy, r, a0, a1, out) {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (3 * RAD)));
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]); }
    return out;
  }
  function sector(cx, cy, r0, r1, a0, a1) {
    const pts = arcPts(cx, cy, r1, a0, a1, []);
    if (r0 > 0) arcPts(cx, cy, r0, a1, a0, pts); else pts.push([cx, cy]);
    return pts;
  }
  function circPath(cx, cy, r) { const p = new Path2D(); p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, TAU); return p; }
  // a cusped foil: the outer boundary of n overlapping lobes (radius rho, centred d from the middle)
  function foilR(a, n, d, rho, rot) {
    let best = 0;
    for (let k = 0; k < n; k++) {
      const da = a - (rot + k * TAU / n), s = d * Math.sin(da);
      if (Math.abs(s) > rho) continue;
      const r = d * Math.cos(da) + Math.sqrt(rho * rho - s * s);
      if (r > best) best = r;
    }
    return best;
  }
  // a lobe of a foil: from radius r0 out to the foil, between two cusps
  function foilPts(cx, cy, r0, a0, a1, n, d, rho, rot) {
    const pts = [], m = 16;
    for (let i = 0; i <= m; i++) { const a = a0 + (a1 - a0) * i / m, r = foilR(a, n, d, rho, rot); pts.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]); }
    if (r0 > 0) arcPts(cx, cy, r0, a1, a0, pts); else pts.push([cx, cy]);
    return pts;
  }
  function foilOutline(cx, cy, n, d, rho, rot) {
    const pts = [], sub = 16;
    for (let j = 0; j < n * sub; j++) {
      const a = rot + (j / sub - 0.5) * TAU / n, r = foilR(a, n, d, rho, rot);
      pts.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]);
    }
    return polyPath(pts);
  }
  function lancetPath(p, x0, x1, ys, yspr) {
    const w = x1 - x0, ang = Math.PI / 3;
    p.moveTo(x0, ys); p.lineTo(x0, yspr);
    p.arc(x1, yspr, w, Math.PI, Math.PI + ang, false);
    p.arc(x0, yspr, w, -ang, 0, false);
    p.lineTo(x1, ys); p.closePath();
  }
  const quad = (p0, p1, p2, t) => {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  };

  // ------------------------------------------------------------------ the window (pieces, leads, stone)
  // Every piece of glass is a path with a centroid, a glass colour, a paint layer (later layers sit on
  // earlier ones, and each layer's outlines are its leads), a reveal order for the spiral, and the hour
  // petal it belongs to. Stone is grouped by bar width so it can be outlined and cut in one pass each.
  function buildGeo() {
    const pieces = [];
    const stone = { rose: new Map(), frame: new Map(), lan: new Map() };
    const rnd = U.rng(1163);
    let set = "rose";
    const st = (w) => { const m = stone[set]; let p = m.get(w); if (!p) { p = new Path2D(); m.set(w, p); } return p; };
    const ringS = (cx, cy, r, w) => { const p = st(w); p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, TAU); };
    const lineS = (a, b2, w) => { const p = st(w); p.moveTo(a[0], a[1]); p.lineTo(b2[0], b2[1]); };
    const add = (path, x, y, g, L, extra) => {
      const p = { path, x, y, g, L, k: 0.86 + 0.26 * rnd(), w: 1, hr: -1, sp: -1, ros: false, lan: 0, rose: set === "rose", o: 0 };
      if (extra) Object.assign(p, extra);
      pieces.push(p);
      return p;
    };
    const addPts = (pts, g, L, extra) => {
      let x = 0, y = 0;
      for (const q of pts) { x += q[0]; y += q[1]; }
      return add(polyPath(pts), x / pts.length, y / pts.length, g, L, extra);
    };

    // --- the oculus: an eight-foil with a gilt eye, cusp-ground between the foils
    for (let k = 0; k < 8; k++) addPts(sector(0, 0, 0, OC + 0.012, (k - 0.5) * 45 * RAD, (k + 0.5) * 45 * RAD), k % 2 ? GL.emerald : GL.teal, 0);
    for (let k = 0; k < 8; k++) {
      const a0 = (k - 0.5) * 45 * RAD, a1 = (k + 0.5) * 45 * RAD;
      addPts(sector(0, 0, 0.04, 0.086, a0, a1), GL.ruby, 1);
      addPts(foilPts(0, 0, 0.086, a0, a1, 8, 0.096, 0.042, 0), k % 2 ? GL.violet : GL.cobalt, 1);
    }
    add(circPath(0, 0, 0.04), 0, 0, GL.gold, 2);
    ringS(0, 0, OC, 0.02); ringS(0, 0, 0.04, 0.008);
    { const p = st(0.009); p.addPath(foilOutline(0, 0, 8, 0.096, 0.042, 0)); }

    // --- twelve petals: radiating lights with pointed heads; a lozenge in each, a roundel in the head
    const HW = 15 * RAD;
    for (let k = 0; k < 12; k++) {
      const ac = k * 30 * RAD, par = k % 2;
      const map = (u, v) => pol(OC + v * (RS - OC), ac + u * HW);
      const uv = (poly) => {
        const pts = [];
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b2 = poly[(i + 1) % poly.length];
          for (let s = 0; s < 5; s++) { const tt = s / 5; pts.push(map(a[0] + (b2[0] - a[0]) * tt, a[1] + (b2[1] - a[1]) * tt)); }
        }
        return pts;
      };
      const band = par ? GL.violet : GL.emerald, dia = par ? GL.ruby : GL.amber, dia2 = par ? GL.rose : GL.gold;
      const ex = { hr: k };
      addPts(uv([[-1, 0], [0, 0], [0, 0.16], [-1, 0.16]]), band, 1, ex);
      addPts(uv([[0, 0], [1, 0], [1, 0.16], [0, 0.16]]), band, 1, ex);
      addPts(uv([[-1, 0.16], [0, 0.16], [-1, 0.5]]), GL.cobalt, 1, ex);
      addPts(uv([[0, 0.16], [1, 0.16], [1, 0.5]]), GL.cobalt, 1, ex);
      addPts(uv([[-1, 0.5], [0, 0.84], [-1, 0.84]]), GL.sapph, 1, ex);
      addPts(uv([[1, 0.5], [1, 0.84], [0, 0.84]]), GL.sapph, 1, ex);
      addPts(uv([[0, 0.16], [0, 0.5], [-1, 0.5]]), dia, 1, ex);
      addPts(uv([[0, 0.16], [1, 0.5], [0, 0.5]]), dia2, 1, ex);
      addPts(uv([[-1, 0.5], [0, 0.5], [0, 0.84]]), dia2, 1, ex);
      addPts(uv([[0, 0.5], [1, 0.5], [0, 0.84]]), dia, 1, ex);
      addPts(uv([[-1, 0.84], [0, 0.84], [0, 1], [-1, 1]]), GL.sapph, 1, ex);
      addPts(uv([[0, 0.84], [1, 0.84], [1, 1], [0, 1]]), GL.sapph, 1, ex);
      // the pointed head
      const SL = pol(RS, ac - HW), SR = pol(RS, ac + HW), A = pol(RM, ac), CL = pol(0.548, ac - 9 * RAD), CR = pol(0.548, ac + 9 * RAD);
      const head = [];
      for (let i = 0; i <= 10; i++) head.push(quad(SL, CL, A, i / 10));
      for (let i = 1; i <= 10; i++) head.push(quad(A, CR, SR, i / 10));
      arcPts(0, 0, RS, ac + HW, ac - HW, head);
      // spandrel ground first (layer 0), the head over it
      addPts(sector(0, 0, 0.455, RM + 0.012, ac, ac + 30 * RAD), GL.sapph, 0, { w: 0.85 });
      addPts(head, par ? GL.amber : GL.ruby, 1, ex);
      const hc = pol(0.511, ac);
      add(circPath(hc[0], hc[1], 0.026), hc[0], hc[1], par ? GL.emerald : GL.gold, 2, ex);
      const scc = pol(0.533, ac + HW);
      add(circPath(scc[0], scc[1], 0.02), scc[0], scc[1], GL.ruby, 2);
      // stone: the mullion, the arch, the two little roundels
      lineS(pol(OC, ac + HW), pol(RS, ac + HW), 0.016);
      { const p = st(0.013); p.moveTo(SL[0], SL[1]); p.quadraticCurveTo(CL[0], CL[1], A[0], A[1]); p.quadraticCurveTo(CR[0], CR[1], SR[0], SR[1]); }
      ringS(hc[0], hc[1], 0.026, 0.008); ringS(scc[0], scc[1], 0.02, 0.008);
    }
    ringS(0, 0, RM, 0.02);

    // --- twelve compartments, each a roundel with a quatrefoil
    const RQ = 0.725, RR = 0.118;
    for (let k = 0; k < 12; k++) {
      const ac = k * 30 * RAD, par = k % 2, ex = { hr: k };
      addPts(sector(0, 0, RM - 0.01, RQ, ac - HW, ac), par ? GL.violet : GL.sapph, 0, ex);
      addPts(sector(0, 0, RM - 0.01, RQ, ac, ac + HW), par ? GL.violet : GL.sapph, 0, ex);
      addPts(sector(0, 0, RQ, RO + 0.01, ac - HW, ac), GL.cobalt, 0, ex);
      addPts(sector(0, 0, RQ, RO + 0.01, ac, ac + HW), GL.cobalt, 0, ex);
      const q = pol(RQ, ac);
      for (let j = 0; j < 4; j++) addPts(sector(q[0], q[1], 0, RR + 0.01, ac + j * 90 * RAD, ac + (j + 1) * 90 * RAD), GL.ruby, 1, ex);
      for (let j = 0; j < 4; j++) {
        const a0 = ac + (j - 0.5) * 90 * RAD, a1 = ac + (j + 0.5) * 90 * RAD;
        const g = j % 2 ? (par ? GL.gold : GL.violet) : (par ? GL.emerald : GL.cobalt);
        addPts(foilPts(q[0], q[1], 0.024, a0, a1, 4, 0.05, 0.042, ac), g, 2, ex);
      }
      add(circPath(q[0], q[1], 0.024), q[0], q[1], GL.amber, 2, ex);
      ringS(q[0], q[1], RR, 0.012);
      { const p = st(0.007); p.addPath(foilOutline(q[0], q[1], 4, 0.05, 0.042, ac)); }
      lineS(pol(RM, ac + HW), pol(RO, ac + HW), 0.016);
    }
    ringS(0, 0, RO, 0.022);

    // --- the beaded border
    for (let j = 0; j < 24; j++) {
      const a0 = j * 15 * RAD, a1 = (j + 1) * 15 * RAD;
      addPts(sector(0, 0, RO, RF, a0, a1), j % 2 ? GL.cobalt : GL.ruby, 0);
      const c = pol(0.9345, (j + 0.5) * 15 * RAD);
      add(circPath(c[0], c[1], 0.034), c[0], c[1], j % 2 ? GL.gold : GL.emerald, 1);
      ringS(c[0], c[1], 0.034, 0.008);
    }
    ringS(0, 0, RF, 0.034);

    // --- the square frame: solid spandrels pierced by a rosette each (or a host's roundel)
    set = "frame";
    for (let s = 0; s < 4; s++) {
      const [sx, sy] = SLOTS[s];
      const a0 = sy < 0 ? (sx < 0 ? 270 : 0) : (sx < 0 ? 180 : 90);
      const cx = sx * SLOT, cy = sy * SLOT;
      for (let j = 0; j < 6; j++) {
        addPts(sector(cx, cy, 0.042, SLOT_R + 0.008, (a0 + j * 60) * RAD, (a0 + (j + 1) * 60) * RAD), j % 2 ? GL.ruby : GL.violet, 1, { sp: s, ros: true, w: 0.75 });
      }
      add(circPath(cx, cy, 0.042), cx, cy, GL.gold, 2, { sp: s, ros: true, w: 0.75 });
      ringS(cx, cy, SLOT_R, 0.012); ringS(cx, cy, 0.042, 0.007);
    }
    { const p = st(0.022); p.rect(-SQ, -SQ, 2 * SQ, 2 * SQ); }

    // --- the lancets: four panels of medallions with pearled borders, a trefoil in the head
    set = "lan";
    if (lancetsOn) {
      for (const side of [-1, 1]) {
        const X = side * LX, x0 = X - LHW, x1 = X + LHW, BW = 0.034, PH = (LSILL - LSPR) / 4;
        const ex = { lan: side };
        const hp = new Path2D();
        hp.moveTo(x0, LSPR); hp.arc(x1, LSPR, 2 * LHW, Math.PI, Math.PI + Math.PI / 3, false); hp.arc(x0, LSPR, 2 * LHW, -Math.PI / 3, 0, false); hp.closePath();
        add(hp, X, LSPR - 0.12, GL.violet, 0, ex);
        const tc = [X, LSPR - 0.105];
        for (let j = 0; j < 3; j++) addPts(sector(tc[0], tc[1], 0, 0.06, (j * 120 - 60) * RAD, (j * 120 + 60) * RAD), j ? GL.cobalt : GL.ruby, 1, ex);
        { const p = st(0.008); p.addPath(circPath(tc[0], tc[1], 0.06)); }
        for (let j = 0; j < 4; j++) {
          const yb = LSILL - j * PH, yt = yb - PH, ym = (yb + yt) / 2, par = j % 2;
          // the field behind the medallion
          const fx0 = x0 + BW, fx1 = x1 - BW;
          addPts([[fx0, yt], [X, yt], [X, ym], [fx0, ym]], GL.cobalt, 0, ex);
          addPts([[X, yt], [fx1, yt], [fx1, ym], [X, ym]], GL.sapph, 0, ex);
          addPts([[fx0, ym], [X, ym], [X, yb], [fx0, yb]], GL.sapph, 0, ex);
          addPts([[X, ym], [fx1, ym], [fx1, yb], [X, yb]], GL.cobalt, 0, ex);
          // pearled borders
          for (let s = 0; s < 5; s++) {
            const ya = yt + PH * s / 5, yz = yt + PH * (s + 1) / 5, g = (j * 5 + s) % 2 ? GL.gold : GL.ruby;
            addPts([[x0 - 0.01, ya], [x0 + BW, ya], [x0 + BW, yz], [x0 - 0.01, yz]], g, 1, ex);
            addPts([[x1 - BW, ya], [x1 + 0.01, ya], [x1 + 0.01, yz], [x1 - BW, yz]], g, 1, ex);
          }
          // the medallion
          const rot = par ? 45 * RAD : 0, MR = 0.112;
          for (let q = 0; q < 4; q++) addPts(sector(X, ym, 0, MR + 0.008, rot + q * 90 * RAD, rot + (q + 1) * 90 * RAD), par ? GL.emerald : GL.ruby, 1, ex);
          for (let q = 0; q < 4; q++) {
            const a0 = rot + (q - 0.5) * 90 * RAD, a1 = rot + (q + 0.5) * 90 * RAD;
            addPts(foilPts(X, ym, 0.022, a0, a1, 4, 0.047, 0.04, rot), q % 2 ? GL.violet : GL.amber, 2, ex);
          }
          add(circPath(X, ym, 0.022), X, ym, GL.gold, 2, ex);
          { const p = st(0.009); p.addPath(circPath(X, ym, MR)); }
          { const p = st(0.006); p.addPath(foilOutline(X, ym, 4, 0.047, 0.04, rot)); }
          if (j > 0) lineS([x0, yb], [x1, yb], 0.008);
        }
        lineS([x0, LSPR], [x1, LSPR], 0.008);
        { const p = st(0.028); lancetPath(p, x0, x1, LSILL, LSPR); }
      }
    }

    // reveal order: a spiral out of the oculus, then the spandrels, the lancets rising from their sills
    for (const p of pieces) {
      if (p.lan) p.o = 0.46 + 0.44 * U.clamp((LSILL - p.y) / (LSILL - LSPR + 0.29));
      else if (p.sp >= 0) p.o = 0.78 + 0.03 * p.sp + (p.ros ? 0.04 : 0);
      else {
        const rn = Math.min(1, Math.hypot(p.x, p.y));
        let a = Math.atan2(p.x, -p.y); if (a < 0) a += TAU;
        p.o = 0.03 + 0.72 * (rn * 3 + a / TAU) / 4;
      }
    }

    // leads: each paint layer's outlines; the rose's alone for the drawing
    const lead = [new Path2D(), new Path2D(), new Path2D()], leadRose = [new Path2D(), new Path2D(), new Path2D()];
    const fillRose = [new Path2D(), new Path2D(), new Path2D()];
    for (const p of pieces) {
      lead[p.L].addPath(p.path);
      if (p.rose) { leadRose[p.L].addPath(p.path); fillRose[p.L].addPath(p.path); }
    }
    const byL = [[], [], []];
    for (const p of pieces) byL[p.L].push(p);
    // the glass, for clipping the weather to it
    const clip = new Path2D();
    clip.rect(-SQ, -SQ, 2 * SQ, 2 * SQ);
    if (lancetsOn) for (const side of [-1, 1]) lancetPath(clip, side * LX - LHW, side * LX + LHW, LSILL, LSPR);
    // the glazed openings alone (the rose, the spandrel roundels, the lancets): by day the solid spandrels
    // between them are stone, lit like the wall
    const cut = circPath(0, 0, RF + 0.017);
    for (const [sx, sy] of SLOTS) cut.addPath(circPath(sx * SLOT, sy * SLOT, SLOT_R + 0.006));
    if (lancetsOn) for (const side of [-1, 1]) lancetPath(cut, side * LX - LHW, side * LX + LHW, LSILL, LSPR);
    return { pieces, byL, lead, leadRose, fillRose, stone, clip, cut };
  }

  // the host roundel, drawn live: six petals and an eye, unit radius
  function buildRosette() {
    const petals = [], lead = new Path2D();
    for (let j = 0; j < 6; j++) { const p = polyPath(sector(0, 0, 0.28, 1.05, (j * 60 - 30) * RAD, (j * 60 + 30) * RAD)); petals.push(p); lead.addPath(p); }
    const eye = circPath(0, 0, 0.28); lead.addPath(eye);
    return { petals, eye, lead, rim: circPath(0, 0, 1.02) };
  }

  // ------------------------------------------------------------------ baking
  const allStone = (fn) => { for (const k of ["rose", "frame", "lan"]) for (const [w, p] of GEO.stone[k]) fn(p, w); };

  // the glass of the whole window painted through colourOf(piece) -> css or null, leads and stone cut out
  function paintGlass(L, colourOf) {
    const c = L.c;
    clearL(L); unit(L);
    for (let l = 0; l < 3; l++) {
      for (const p of GEO.byL[l]) {
        const col = colourOf(p);
        if (col) { c.fillStyle = col; c.fill(p.path); }
      }
      c.globalCompositeOperation = "destination-out";
      c.lineWidth = LEADW; c.strokeStyle = "#000"; c.stroke(GEO.lead[l]);
      c.globalCompositeOperation = "source-over";
    }
    c.globalCompositeOperation = "destination-out";
    allStone((p, w) => { c.lineWidth = w; c.stroke(p); });
    c.globalCompositeOperation = "source-over";
  }

  // a soft, downsampled copy of a layer (glow, the pattern thrown on the floor)
  function blurInto(dst, src, px) {
    const c = dst.c;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, dst.cv.width, dst.cv.height);
    if ("filter" in c) c.filter = `blur(${px}px)`;
    c.drawImage(src.cv, 0, 0, dst.cv.width, dst.cv.height);
    if ("filter" in c) c.filter = "none";
  }

  // the stone: every bar outlined with a faint grey-blue hairline each side (joins merge), a breath of body
  function paintStone(L, col, e, body, sets) {
    const c = L.c, cc = U.rgba(U.safe(col), 1);
    unit(L);
    const each = (fn) => { for (const k of sets) for (const [w, p] of GEO.stone[k]) fn(p, w); };
    c.strokeStyle = cc;
    each((p, w) => { c.lineWidth = w + 2 * e; c.stroke(p); });
    c.globalCompositeOperation = "destination-out";
    each((p, w) => { c.lineWidth = w; c.stroke(p); });
    c.globalCompositeOperation = "source-over";
    if (body > 0) { c.strokeStyle = U.rgba(U.safe(col), body); each((p, w) => { c.lineWidth = w; c.stroke(p); }); }
  }

  // snow on the ledges: caps on the tops of rings, banks in the bottoms of openings, ridges on bars
  function paintSnow(L, fillA = 0.3, edgeA = 0.4) {
    const c = L.c, sc = U.safe(C.snow), rnd = U.rng(4049);
    unit(L);
    const shape = (pts, surf) => {
      c.fillStyle = U.rgba(sc, fillA); c.fill(polyPath(pts));
      c.beginPath(); c.moveTo(surf[0][0], surf[0][1]);
      for (let i = 1; i < surf.length; i++) c.lineTo(surf[i][0], surf[i][1]);
      c.lineWidth = 0.003; c.strokeStyle = U.rgba(sc, edgeA); c.stroke();
    };
    // cap: on the outer edge of the top half; bank: on the inner edge of the bottom half
    const arcSnow = (cx, cy, re, dmax, cap) => {
      const ph = rnd() * 10, edge = [], surf = [], n = 36;
      for (let i = 0; i <= n; i++) {
        const a = (cap ? -90 : 90) * RAD + Math.PI * i / n;
        const k = Math.pow(Math.abs(Math.cos(a)), cap ? 3 : 2.4) * (0.8 + 0.14 * Math.sin(a * 9 + ph) + 0.06 * Math.sin(a * 23 + ph * 2));
        const r2 = cap ? re + dmax * k : re - dmax * k;
        edge.push([cx + re * Math.sin(a), cy - re * Math.cos(a)]);
        surf.push([cx + r2 * Math.sin(a), cy - r2 * Math.cos(a)]);
      }
      shape(edge.concat(surf.slice().reverse()), surf);
    };
    const ring = (cx, cy, r, w, dmax, capK) => {
      if (capK) arcSnow(cx, cy, r + w / 2, dmax * capK, true);
      arcSnow(cx, cy, r - w / 2, dmax, false);
    };
    ring(0, 0, OC, 0.02, 0.03, 0.5); ring(0, 0, RM, 0.02, 0.04, 0.5); ring(0, 0, RO, 0.022, 0.04, 0.5); ring(0, 0, RF, 0.034, 0.06, 0.6);
    ring(0, 0, 0.04, 0.008, 0.012, 0);
    for (let k = 0; k < 12; k++) {
      const ac = k * 30 * RAD, q = pol(0.725, ac), hc = pol(0.511, ac), scc = pol(0.533, ac + 15 * RAD);
      ring(q[0], q[1], 0.118, 0.012, 0.04, 0.45); ring(hc[0], hc[1], 0.026, 0.008, 0.012, 0); ring(scc[0], scc[1], 0.02, 0.008, 0.01, 0);
      // ridges on the near-horizontal mullions
      const am = ac + 15 * RAD, s = Math.abs(Math.sin(am));
      if (s > 0.5) {
        for (const [r0, r1, w] of [[OC, RS, 0.016], [RM, RO, 0.016]]) {
          const u = [Math.sin(am), -Math.cos(am)], nv = Math.cos(am) * (Math.sin(am) > 0 ? 1 : -1) < 0 ? [Math.cos(am), Math.sin(am)] : [-Math.cos(am), -Math.sin(am)];
          const d = 0.022 * Math.pow(s, 3), edge = [], surf = [];
          for (let i = 0; i <= 12; i++) {
            const r = U.lerp(r0 + 0.01, r1 - 0.01, i / 12), taper = Math.sin(Math.PI * i / 12) * (0.85 + 0.15 * rnd());
            const bx = u[0] * r + nv[0] * w / 2, by = u[1] * r + nv[1] * w / 2;
            edge.push([bx, by]); surf.push([bx + nv[0] * d * taper, by + nv[1] * d * taper]);
          }
          shape(edge.concat(surf.slice().reverse()), surf);
        }
      }
    }
    for (let j = 0; j < 24; j++) { const c2 = pol(0.9345, (j + 0.5) * 15 * RAD); ring(c2[0], c2[1], 0.034, 0.008, 0.014, 0); }
    for (let s = 0; s < 4; s++) { const [sx, sy] = SLOTS[s]; ring(sx * SLOT, sy * SLOT, SLOT_R, 0.012, 0.045, 0.5); }
    // sills: drifts along the bottom of the frame and of each lancet panel, a cap on the top bar
    const drift = (x0, x1, y, d) => {
      const edge = [], surf = [];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24, x = U.lerp(x0, x1, u), corner = Math.pow(Math.abs(u - 0.5) * 2, 3);
        edge.push([x, y]); surf.push([x, y - d * (0.5 + 0.5 * corner + 0.12 * Math.sin(u * 17 + x * 3))]);
      }
      shape(edge.concat(surf.slice().reverse()), surf);
    };
    drift(-SQ + 0.011, SQ - 0.011, SQ - 0.011, 0.05);
    drift(-SQ - 0.011, SQ + 0.011, -SQ - 0.011, 0.02);
    if (lancetsOn) {
      for (const side of [-1, 1]) {
        const X = side * LX, PH = (LSILL - LSPR) / 4;
        for (let j = 0; j < 4; j++) drift(X - LHW + 0.014, X + LHW - 0.014, LSILL - j * PH - (j ? 0.004 : 0.014), j ? 0.026 : 0.05);
        drift(X - LHW + 0.014, X + LHW - 0.014, LSPR - 0.004, 0.02);
      }
    }
  }

  // The interior wall by day, in plain limestone (relit per sky in relightRoom): coursed ashlar, each block its
  // own tone, a splayed reveal round each opening, a string course under the windows and the flagged floor below.
  const FLOOR_Y = SQ + 0.17;   // where the wall meets the floor, unit space
  function paintWall(L) {
    const c = L.c, rnd = U.rng(2711);
    unit(L);
    const ux0 = (L.x0 - L.cx) / L.R - 0.05, uy0 = (L.y0 - L.cy) / L.R - 0.05;
    const ux1 = ux0 + L.w / L.R + 0.1, uy1 = uy0 + L.h / L.R + 0.1;
    const stone = (k) => `rgb(${(138 * k) | 0},${(128 * k) | 0},${(112 * k) | 0})`;
    c.fillStyle = stone(0.7); c.fillRect(ux0, uy0, ux1 - ux0, uy1 - uy0);
    // the courses, laid up from the floor
    const ch = 0.118, mort = 0.007;
    for (let y = FLOOR_Y - ch; y > uy0 - ch; y -= ch) {
      let x = ux0 - rnd() * 0.3;
      while (x < ux1) {
        const len = 0.2 + rnd() * 0.28;
        c.fillStyle = stone(0.82 + 0.2 * rnd());
        c.fillRect(x + mort / 2, y + mort / 2, len - mort, ch - mort);
        x += len;
      }
    }
    // the reveals: the splay round each opening catches the light
    c.fillStyle = stone(1.08);
    c.fillRect(-SQ - 0.08, -SQ - 0.08, 2 * SQ + 0.16, 2 * SQ + 0.16);
    if (lancetsOn) {
      for (const side of [-1, 1]) {
        const p = new Path2D(); lancetPath(p, side * LX - LHW, side * LX + LHW, LSILL, LSPR);
        c.lineWidth = 0.15; c.strokeStyle = stone(1.08); c.stroke(p);
      }
    }
    // the string course: a moulded band with a lit top and a shadow under it
    const sy = SQ + 0.05;
    c.fillStyle = stone(1.12); c.fillRect(ux0, sy - 0.012, ux1 - ux0, 0.03);
    c.fillStyle = stone(0.45); c.fillRect(ux0, sy + 0.018, ux1 - ux0, 0.014);
    // the floor: flags in perspective, darker than the wall
    c.fillStyle = stone(0.62); c.fillRect(ux0, FLOOR_Y, ux1 - ux0, uy1 - FLOOR_Y);
    c.fillStyle = stone(0.32); c.fillRect(ux0, FLOOR_Y, ux1 - ux0, 0.012);
    c.strokeStyle = stone(0.38); c.lineWidth = 0.006;
    c.beginPath();
    for (const d of [0.07, 0.17, 0.3, 0.47, 0.7]) { c.moveTo(ux0, FLOOR_Y + d); c.lineTo(ux1, FLOOR_Y + d); }
    for (let x = -4.2; x <= 4.2; x += 0.42) { c.moveTo(x, FLOOR_Y); c.lineTo(x * 1.9, FLOOR_Y + 1.2); }
    c.stroke();
  }

  // the elevation drawing: setting-out lines, the glazing faint, every stone bar double-lined
  function paintDrawing(L) {
    const c = L.c, px = 1 / L.R, sd = U.safe(C.silverDim), sm = U.safe(C.silverMid);
    unit(L);
    c.setLineDash([7 * px, 6 * px]); c.lineWidth = px;
    c.strokeStyle = U.rgba(sd, 0.5);
    c.beginPath(); c.moveTo(-1.32, 0); c.lineTo(1.32, 0); c.moveTo(0, -1.32); c.lineTo(0, 1.32); c.stroke();
    c.strokeStyle = U.rgba(sd, 0.32);
    c.beginPath();
    for (const r of [RS, 0.725]) { c.moveTo(r, 0); c.arc(0, 0, r, 0, TAU); }
    for (let k = 0; k < 12; k++) { const a = pol(OC, k * 30 * RAD), b2 = pol(RO, k * 30 * RAD); c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); }
    c.stroke();
    c.setLineDash([]);
    // the glazing, each layer hiding what it covers
    for (let l = 0; l < 3; l++) {
      if (l) { c.globalCompositeOperation = "destination-out"; c.fillStyle = "#000"; c.fill(GEO.fillRose[l]); c.globalCompositeOperation = "source-over"; }
      c.lineWidth = 0.8 * px; c.strokeStyle = U.rgba(sd, 0.42); c.stroke(GEO.leadRose[l]);
    }
    paintStone(L, C.silver, 1.05 * px, 0, ["rose"]);
    // the 24-hour dial: a tick each hour, longer at the quarters
    c.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU, q = i % 6 === 0, r0 = q ? 1.085 : 1.105, r1 = q ? 1.165 : 1.135;
      const p0 = pol(r0, a), p1 = pol(r1, a);
      c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]);
    }
    c.lineWidth = px; c.strokeStyle = U.rgba(sm, 0.7); c.stroke();
  }

  // ------------------------------------------------------------------ build
  function layout() {
    RA = 0.36 * H; cxA = W / 2; cyA = 0.405 * H;
    lancetsOn = cxA - (LX + LHW + 0.04) * RA > 0.012 * W;
    // on a narrow wall the drawing gives way so the clock column keeps about a fifth of the height
    Rw = Math.max(0.17 * H, Math.min(0.29 * H, (0.865 * W - 0.52 * H) / 2.85)); cyW = 0.43 * H;
    cxW = Math.min(W - 1.45 * Rw - 0.035 * W, 0.69 * W);
  }

  function build() {
    if (!mctx) mctx = document.createElement("canvas").getContext("2d");
    sprites.clear(); dots.clear(); infoL = null; NL.key = NW.key = "";
    layout();
    GEO = buildGeo();
    ROSETTE = buildRosette();
    GLOW.cx = cxA; GLOW.cy = cyA; GLOW.R = RA;
    const bx = lancetsOn ? LX + LHW + 0.05 : SQ + 0.06, by0 = -SQ - 0.07, by1 = SQ + 0.07;
    compL = layer(-bx, by0, bx, by1, RA, cxA, cyA);
    // the glow: a sixth of the size, blurred (cheap halation; milky in fog)
    glowL = mk(compL.w / 6, compL.h / 6); glowL.cv.width = Math.ceil(compL.w / 6); glowL.cv.height = Math.ceil(compL.h / 6);
    flashL = layer(-bx, by0, bx, by1, RA, cxA, cyA);
    paintGlass(flashL, (p) => (p.ros ? null : `rgb(${(p.g[0] * 0.55 * p.k) | 0},${(p.g[1] * 0.55 * p.k) | 0},${(p.g[2] * 0.55 * p.k) | 0})`));
    floorL = mk(compL.w / 10, compL.h / 10); floorL.cv.width = Math.ceil(compL.w / 10); floorL.cv.height = Math.ceil(compL.h / 10);
    blurInto(floorL, flashL, 3);
    stoneL = layer(-bx, by0, bx, by1 + 0.05, RA, cxA, cyA);
    const e = Math.max(1, 0.0026 * RA) / RA;
    paintStone(stoneL, C.stone, e, 0.06, ["rose", "frame", "lan"]);
    {
      // a string course under the windows ties them to the wall
      const c = stoneL.c, y = SQ + 0.05;
      c.beginPath(); c.moveTo(-bx + 0.04, y); c.lineTo(bx - 0.04, y);
      c.lineWidth = e; c.strokeStyle = U.rgba(U.safe(C.stone), 0.7); c.stroke();
      c.beginPath(); c.moveTo(-bx + 0.06, y + 0.018); c.lineTo(bx - 0.06, y + 0.018);
      c.strokeStyle = U.rgba(U.safe(C.stone), 0.35); c.stroke();
    }
    snowL = layer(-bx, by0 - 0.05, bx, by1, RA, cxA, cyA);
    paintSnow(snowL);
    // by day: snow lit by the daylight, the tracery's stone lit by the room, and the room itself
    snowDayL = layer(-bx, by0 - 0.05, bx, by1, RA, cxA, cyA);
    paintSnow(snowDayL, 0.62, 0.8);
    buildGlassTexture();
    stoneDayL = layer(-bx, by0, bx, by1 + 0.05, RA, cxA, cyA);
    paintStone(stoneDayL, C.stoneDay, e, 0.85, ["rose", "frame", "lan"]);
    {
      const wx0 = (-0.12 * W - cxA) / RA, wx1 = (1.12 * W - cxA) / RA, wy0 = (-0.05 * H - cyA) / RA, wy1 = (1.05 * H - cyA) / RA;
      wallL = layer(wx0, wy0, wx1, wy1, RA, cxA, cyA);
      paintWall(wallL);
      roomL = layer(wx0, wy0, wx1, wy1, RA, cxA, cyA);
      roomKey = "";
    }
    workL = layer(-1.3, -1.3, 1.3, 1.3, Rw, cxW, cyW);
    paintDrawing(workL);
    // candles inside, below each window: the light they throw on the lowest panes, one layer each
    CANDLES = [];
    const spots = [[-0.5, 1.12], [0, 1.16], [0.5, 1.12]];
    if (lancetsOn) spots.push([-LX, 1.16], [LX, 1.16]);
    const cc = C.candle;
    for (const [x, y] of spots) {
      const L = layer(x - 0.7, 0.15, x + 0.7, 1.08, RA, cxA, cyA);
      paintGlass(L, (p) => {
        const d2 = (p.x - x) * (p.x - x) * 1.3 + (p.y - y) * (p.y - y), f = Math.exp(-d2 / 0.15);
        if (f < 0.02 || p.ros) return null;
        const g = p.g, k = 0.7 * f * p.k;
        return `rgb(${((g[0] * 0.55 + cc.r * 0.45) * k) | 0},${((g[1] * 0.55 + cc.g * 0.45) * k) | 0},${((g[2] * 0.55 + cc.b * 0.45) * k) | 0})`;
      });
      L.ux = x; L.uy = y;
      CANDLES.push(L);
    }
    initRain();
    compKey = ""; relightT = -1;
    built = `${W}x${H}@${dpr}`;
  }

  // ------------------------------------------------------------------ weather (eased between conditions)
  // Each condition has a presence weight eased toward 1 (the current one) or 0 (the rest) over a few
  // seconds, plus its own intensity, so the window never snaps from one sky to another. null = clear.
  const WXC = ["clear", "cloudy", "fog", "rain", "storm", "snow"];
  const WXP = new Float32Array(6), WXI = new Float32Array(6);
  const WX = { cover: 0, fog: 0, rain: 0, storm: 0, snow: 0, dust: 0, wind: 0, lean: 0, drift: 0 };
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
    WX.cover = U.clamp(WXP[1] * (0.12 + 0.88 * WXI[1]) + WXP[2] * 0.5 + WXP[3] * (0.6 + 0.35 * WXI[3]) + WXP[4] + WXP[5] * (0.6 + 0.3 * WXI[5]));
    WX.fog = WXP[2] * (0.45 + 0.55 * WXI[2]);
    WX.rain = WXP[3] * (0.12 + 0.88 * WXI[3]) + WXP[4] * Math.max(0.85, WXI[4]);
    WX.storm = WXP[4];
    WX.snow = WXP[5] * (0.25 + 0.75 * WXI[5]);
    WX.wind = U.clamp(wxWind / 50);
    WX.lean = WX.wind * (0.85 + 0.3 * U.noise1(t * 0.37) + 0.12 * U.noise1(t * 1.3 + 4));
    WX.drift += WX.lean * dt;   // accumulated wind travel, so flakes never jump when the wind changes
    // snow banks up and melts away more slowly than the sky changes
    WX.dust = first ? WX.snow : WX.dust + (WX.snow - WX.dust) * (1 - Math.exp(-dt / 5));
  }

  // lightning: rare, dim, distant. Deterministic from time slots of 9 s.
  function lightning(t) {
    if (WX.storm < 0.02) return 0;
    const slot = Math.floor(t / 9), r = U.rng(slot * 7919 + 13);
    if (r() > 0.32) return 0;
    const t0 = slot * 9 + 1 + r() * 6, u = t - t0;
    if (u < 0 || u > 1.3) return 0;
    const fl = Math.exp(-u * 9) + (u > 0.16 ? 0.7 * Math.exp(-(u - 0.16) * 7) : 0) + (u > 0.5 ? 0.35 * Math.exp(-(u - 0.5) * 9) : 0);
    return U.clamp(fl) * WX.storm;
  }

  // ------------------------------------------------------------------ the sky behind the glass
  const SKY = { amb: [0, 0, 0], duskW: 0, duskC: 0, dayD: 0, sx: 0, moon: 0, mx: 0, my: 0, emph: 0, hw: new Float32Array(12), dust: 0, fog: 0, rev: 1, night: 0, beam: 0, beamX: 0 };
  function skyState(f, el, rev) {
    const S = SKY, loc = AW.config.location, phi = loc.lat * RAD, now = f.now;
    const A = astro(now, loc.lon);
    const sun = horiz(A.sunDec, A.sunH, phi), moon = horiz(A.moonDec, A.moonH, phi);
    const e = sun.alt;
    const night = 1 - U.smoothstep(-13, -3, e), day = U.smoothstep(-1, 14, e);
    const dusk = U.smoothstep(-11, -1, e) * (1 - U.smoothstep(6, 22, e));
    const cov = WX.cover, fog = WX.fog;
    // cloud and fog take the direction out of the light, then some of the light itself
    const flat = (1 - 0.85 * cov) * (1 - 0.9 * fog), dim = (1 - 0.42 * cov) * (1 - 0.25 * fog);
    const nl = 0.075 * dim + 0.03 * fog, dl = 0.44 * day * dim, du = 0.07 * dusk * dim;
    S.amb[0] = 0.3 * nl + dl + 0.75 * du + 0.09 * fog;
    S.amb[1] = 0.38 * nl + 0.95 * dl + 0.6 * du + 0.1 * fog;
    S.amb[2] = 0.72 * nl + 0.86 * dl + 0.72 * du + 0.115 * fog;
    // the window faces south: the low sun lights the side it stands on (east = left, west = right)
    S.sx = Math.sin((sun.az - 180) * RAD);
    const front = 0.6 + 0.4 * U.clamp(Math.cos((sun.az - 180) * RAD));
    S.duskW = 1.25 * dusk * front * flat; S.duskC = 0.5 * dusk * flat;
    S.dayD = 0.16 * day * flat;
    S.dusk = dusk * flat;
    // the moon, where it stands in the window, as a pale wash through a few panes
    const mf = 0.5 + 0.5 * U.clamp(Math.cos((moon.az - 180) * RAD));
    S.moon = U.smoothstep(-1, 10, moon.alt) * (0.2 + 0.8 * A.illum) * mf * (1 - 0.85 * cov) * (1 - 0.7 * fog) * (1 - 0.85 * day) * 0.8;
    S.mx = U.clamp(1.25 * Math.sin((moon.az - 180) * RAD), -1.3, 1.3);
    S.my = 0.95 - 1.9 * U.clamp(moon.alt / 55);
    // the hour petal (twelve at the top), handing over to the next in the last minutes of the hour
    const h = now.getHours() % 12, m = now.getMinutes() + now.getSeconds() / 60;
    const x = U.smoothstep(52, 60, m);
    S.hw.fill(0); S.hw[h] = 1 - x; S.hw[(h + 1) % 12] += x;
    S.hourKey = h * 10 + Math.round(x * 10);
    S.emph = 0.45 + 0.55 * U.smoothstep(0, 5400, el);
    S.dust = WX.dust; S.fog = fog; S.rev = rev; S.night = night; S.day = day;
    // the strongest beam through the glass and which way it throws the pattern on the floor
    const sunBeam = U.smoothstep(-4, 3, e) * flat * (0.5 + 0.5 * front);
    S.beam = Math.max(sunBeam * 0.9, S.moon * 1.4, 0.28 * (1 - day));
    S.beamX = sunBeam * 0.9 > S.moon * 1.4 ? S.sx : S.mx * 0.7;
    dayLight(S, f, e, sunBeam, front, flat, cov, fog);
    return S;
  }

  // Daylight through the glass (frame.day = D; every term is 0 at night, so the night window is untouched):
  // a diffuse skylight and the direct sun, warm when it is low and lighting the window's sun side first (the
  // window faces south: east = left in the morning, west = right in the afternoon); overcast is flatter and paler,
  // rain and storm darker, fog milky; under a clear sun the jewel colours run rich.
  const SKYC = [0.86, 0.93, 1.05], OVC = [0.94, 0.97, 1.0], SUNHI = [1.0, 0.95, 0.84], SUNLO = [1.0, 0.64, 0.32];
  function dayLight(S, f, e, sunBeam, front, flat, cov, fog) {
    const D = S.D = U.clamp(+f.day || 0);
    if (!S.dsk) { S.dsk = [0, 0, 0]; S.sun = [0, 0, 0]; S.lc = [0, 0, 0]; }
    S.dayKey = "";
    if (D <= 0) { S.dirK = S.shadeK = S.warm = S.pale = S.milk = S.sat = S.capUp = S.sunK = S.floor = 0; return; }
    const hi = U.smoothstep(2, 32, e), low = 1 - U.smoothstep(4, 26, e);
    const dim = (1 - 0.2 * cov) * (1 - 0.3 * WX.rain) * (1 - 0.4 * WX.storm) * (1 - 0.12 * fog);
    const skyK = D * (0.13 + 0.1 * hi) * dim;
    for (let i = 0; i < 3; i++) S.dsk[i] = skyK * U.lerp(SKYC[i], OVC[i], U.clamp(cov + fog));
    S.sunK = D * sunBeam * (0.2 + 0.16 * hi);
    for (let i = 0; i < 3; i++) S.sun[i] = S.sunK * U.lerp(SUNHI[i], SUNLO[i], low);
    S.dirK = 0.8 * Math.abs(S.sx) * flat;
    S.shadeK = D * 0.55 * Math.abs(S.sx) * flat;
    S.pale = D * U.clamp((0.42 * cov + 0.2 * WX.rain) * (1 - fog), 0, 0.5);
    S.milk = D * 0.5 * fog;
    S.milkL = 70 + 70 * hi;
    S.sat = D * (0.14 * flat + 0.2 * low * flat) * (1 - S.pale);
    S.capUp = 8 * D;
    S.warm = D * low * flat * U.smoothstep(-2, 2, e);
    // the room: how much light, of what colour, and the pattern thrown on the floor
    const roomK = (0.55 + 0.45 * hi) * dim * (0.75 + 0.25 * flat);
    for (let i = 0; i < 3; i++) S.lc[i] = roomK * U.lerp(U.lerp(1.0, [1.0, 0.72, 0.46][i], low * flat), [0.86, 0.9, 0.98][i], U.clamp(cov + fog) * 0.8) * (i === 1 ? 0.97 : i === 2 ? 0.9 : 1);
    S.floor = D * sunBeam * (0.6 + 0.4 * front);
    S.low = low;
    const q = (v, n) => Math.round(v * n);
    S.dayKey = `${q(D, 40)}|${q(skyK, 200)}|${q(S.sunK, 200)}|${q(low, 20)}|${q(S.dirK, 20)}|${q(S.shadeK, 20)}|${q(S.warm, 20)}|${q(S.pale, 20)}|${q(S.milk, 20)}|${q(S.sat, 20)}`;
  }

  function glassColour(p, S, nh) {
    if (p.ros && p.sp < nh) return null;
    let rv = S.rev >= 1 ? 1 : U.smoothstep(p.o - 0.035, p.o + 0.035, S.rev * 1.07 - 0.035);
    if (S.bd > 0) rv = S.bd + (1 - S.bd) * rv;   // the work backdrop: every pane at 0.18 * day, filling from there
    if (rv <= 0.002) return null;
    const g = p.g;
    const side = U.clamp(0.5 + 0.5 * S.sx * p.x / 1.2);
    let lr = S.amb[0], lg = S.amb[1], lb = S.amb[2];
    const ws = S.duskW * Math.pow(side, 2.2), cs = S.duskC * Math.pow(1 - side, 1.4), ds = S.dayD * side;
    lr += ws + cs * 0.4 + ds; lg += ws * 0.52 + cs * 0.5 + ds * 0.9; lb += ws * 0.2 + cs * 1.0 + ds * 0.76;
    if (S.D > 0) {
      // the sun's side of the window takes the direct light; the far side, in the reveal's shadow, dims
      const dw = 1 + S.dirK * (2 * side - 1), sh = 1 - S.shadeK * (1 - side);
      lr = (lr + S.dsk[0] + S.sun[0] * dw) * sh; lg = (lg + S.dsk[1] + S.sun[1] * dw) * sh; lb = (lb + S.dsk[2] + S.sun[2] * dw) * sh;
      if (S.warm > 0) { lr *= 1 + 0.1 * S.warm; lg *= 1 - 0.04 * S.warm; lb *= 1 - 0.24 * S.warm; }   // golden hour: everything warms
    }
    if (p.hr >= 0 && S.hw[p.hr] > 0) {
      const e = S.emph * S.hw[p.hr];
      lr = lr * (1 + 0.22 * e) + 0.1 * e; lg = lg * (1 + 0.22 * e) + 0.085 * e; lb = lb * (1 + 0.22 * e) + 0.07 * e;
    }
    let r = g[0] * lr, gg = g[1] * lg, bb = g[2] * lb;
    if (S.moon > 0.004) {
      const dx = p.x - S.mx, dy = p.y - S.my, m = S.moon * Math.exp(-(dx * dx + dy * dy) / 0.16);
      r += m * (0.3 * g[0] + 62); gg += m * (0.34 * g[1] + 72); bb += m * (0.4 * g[2] + 92);
    }
    if (S.fog > 0.01) {
      const l = 0.3 * r + 0.59 * gg + 0.11 * bb, k = 0.6 * S.fog;
      r += (l * 0.92 - r) * k; gg += (l * 0.98 - gg) * k; bb += (l * 1.12 - bb) * k;
    }
    if (S.D > 0) {
      const l = 0.3 * r + 0.59 * gg + 0.11 * bb;
      if (S.sat > 0) { const k = 1 + S.sat; r = Math.max(0, l + (r - l) * k); gg = Math.max(0, l + (gg - l) * k); bb = Math.max(0, l + (bb - l) * k); }
      if (S.pale > 0) { const k = S.pale; r += (l * 0.97 - r) * k; gg += (l * 1.0 - gg) * k; bb += (l * 1.1 - bb) * k; }
      if (S.milk > 0) { const k = S.milk, m = S.milkL; r += (m * 0.9 - r) * k; gg += (m * 0.96 - gg) * k; bb += (m * 1.06 - bb) * k; }
    }
    let w = p.k * p.w * rv;
    if (S.dust > 0.01) w *= 1 - 0.7 * S.dust * U.smoothstep(0.25, 1.0, p.y);
    r *= w; gg *= w; bb *= w;
    if (Math.max(r, gg, bb) < 1.2) return null;
    const c = U.safe({ r, g: gg, b: bb }, 192 + S.capUp);
    return `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`;
  }

  // rebuild the lit glass only when the light has moved meaningfully
  function relight(f, S, nh) {
    const q = (v, n) => Math.round(v * n);
    const key = `${q(S.amb[0], 400)}|${q(S.amb[2], 400)}|${q(S.duskW, 60)}|${q(S.duskC, 60)}|${q(S.dayD, 60)}|${q(S.sx, 20)}|` +
      `${q(S.moon, 40)}|${q(S.mx, 20)}|${q(S.my, 20)}|${S.hourKey}|${q(S.emph, 20)}|${q(S.dust, 20)}|${q(S.fog, 20)}|${q(S.rev, 250)}|${nh}|` +
      `${S.dayKey}|${q(S.bd, 200)}`;
    if (key === compKey) return;
    // while the window is filling, a few rebuilds a second is plenty
    if (S.rev > 0 && S.rev < 1 && f.t - relightT < 0.03) return;
    compKey = key; relightT = f.t;
    paintGlass(compL, (p) => glassColour(p, S, nh));
    if (S.D > 0) {
      // in daylight the glass shows its making: seeds, streaks and the uneven thickness of each sheet
      const c = compL.c;
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = "source-atop"; c.globalAlpha = S.D;
      c.drawImage(texL.cv, 0, 0, compL.cv.width, compL.cv.height);
      c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
    }
    blurInto(glowL, compL, 2.5);
  }

  // the glass texture: a streaky, seedy mottle in translucent black, laid over the lit glass by day
  function buildGlassTexture() {
    const w = Math.ceil(compL.cv.width / 4), h = Math.ceil(compL.cv.height / 4);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const c = cv.getContext("2d"), img = c.createImageData(w, h), d = img.data, sc = 4 / (dpr * RA);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const x = i * sc, y = j * sc;
        const n = U.fbm2(x * 9, y * 26, 3) + 0.45 * U.noise2(x * 40 + 3, y * 41) + 0.3 * U.fbm2(x * 3 + 7, y * 3, 2);
        const o = (j * w + i) * 4;
        d[o] = d[o + 1] = d[o + 2] = 0; d[o + 3] = 255 * U.clamp(0.1 + 0.32 * n, 0, 0.3);
      }
    }
    c.putImageData(img, 0, 0);
    texL = { cv };
  }

  // By day, the room: the wall relit for the sky (brightest round the window and over the floor where the sun
  // lands, falling into dark corners, warm when the sun is low, grey under cloud) with the openings cut out, and
  // the sun's shafts slanting down through the air to the floor. Rebuilt only when the daylight moves.
  function relightRoom(S) {
    const q = (v, n) => Math.round(v * n);
    const key = `${S.dayKey}|${q(S.sx, 20)}|${q(S.lc[0], 40)}|${q(S.lc[1], 40)}|${q(S.lc[2], 40)}|${q(S.floor, 20)}`;
    if (key === roomKey) return;
    roomKey = key;
    const L = roomL, c = L.c;
    clearL(L);
    c.drawImage(wallL.cv, 0, 0);
    unit(L);
    const ux0 = (L.x0 - L.cx) / L.R, uy0 = (L.y0 - L.cy) / L.R, uw = L.w / L.R, uh = L.h / L.R;
    const pool = -S.sx * (0.45 + 0.5 * S.low) * S.floor;   // the sun throws its light away from its own side
    const col = (k) => `rgb(${Math.min(255, 255 * S.lc[0] * k) | 0},${Math.min(255, 255 * S.lc[1] * k) | 0},${Math.min(255, 255 * S.lc[2] * k) | 0})`;
    c.globalCompositeOperation = "multiply";
    const gr = c.createRadialGradient(pool * 0.5, 0.35, 0.1, pool * 0.5, 0.35, 2.7);
    gr.addColorStop(0, col(1)); gr.addColorStop(0.35, col(0.72)); gr.addColorStop(0.7, col(0.3)); gr.addColorStop(1, col(0.1));
    c.fillStyle = gr; c.fillRect(ux0, uy0, uw, uh);
    // the sun's shafts: one broad slant of lit air and a few brighter beams through single lights
    c.globalCompositeOperation = "lighter";
    if (S.floor > 0.02) {
      const sh = pool * 1.6, yb = FLOOR_Y + 0.32, a = 0.3 * S.floor;
      const sc = U.safe({ r: 255 * S.lc[0], g: 235 * S.lc[1], b: 205 * S.lc[2] });
      const beam = (xa, xb, wTop, wBot, al) => {
        const g2 = c.createLinearGradient(0, -0.4, 0, yb);
        g2.addColorStop(0, U.rgba(sc, 0)); g2.addColorStop(0.55, U.rgba(sc, al)); g2.addColorStop(1, U.rgba(sc, al * 0.35));
        c.fillStyle = g2;
        c.beginPath(); c.moveTo(xa - wTop, -0.4); c.lineTo(xa + wTop, -0.4); c.lineTo(xb + wBot, yb); c.lineTo(xb - wBot, yb); c.closePath(); c.fill();
      };
      beam(0, sh, 0.9, 1.15, a * 0.5);
      const rnd = U.rng(77);
      for (let i = 0; i < 6; i++) { const x = (rnd() - 0.5) * 1.5; beam(x, x * 1.15 + sh, 0.04 + 0.05 * rnd(), 0.07 + 0.08 * rnd(), a * (0.35 + 0.4 * rnd())); }
    }
    // the openings (the glass is laid over them; its leads and bars must stay dark)
    c.globalCompositeOperation = "destination-out"; c.fillStyle = "#000"; c.fill(GEO.cut);
    c.globalCompositeOperation = "source-over";
  }

  // ------------------------------------------------------------------ rain on the glass
  // Rivulets run down the outside in fits and starts; each bends the colours behind it (a narrow strip of
  // the lit glass redrawn a pixel or two aside) and carries a faint bright edge and a bead at its head.
  const RUN = 44;
  const RX = new Float32Array(RUN), RY = new Float32Array(RUN), RV = new Float32Array(RUN), RP = new Float32Array(RUN), RT = new Float32Array(RUN);
  const SH = 60, SHX = new Float32Array(SH), SHY = new Float32Array(SH), SHV = new Float32Array(SH), SHL = new Float32Array(SH);
  const FL = 70, FX = new Float32Array(FL), FY = new Float32Array(FL), FV = new Float32Array(FL), FS = new Float32Array(FL), FP = new Float32Array(FL);
  const rrng = U.rng(9091);
  function spawn(i, anywhere) {
    if (lancetsOn && rrng() < 0.28) { RX[i] = (rrng() < 0.5 ? -LX : LX) + (rrng() - 0.5) * LHW * 1.7; RY[i] = -0.7 + rrng() * (anywhere ? 1.6 : 0.9); }
    else { const a = rrng() * TAU, r = Math.sqrt(rrng()) * 0.98; RX[i] = Math.sin(a) * r; RY[i] = anywhere ? -Math.cos(a) * r : -0.95 + rrng() * 1.1; }
    RV[i] = 0.06 + rrng() * 0.12; RP[i] = rrng() * 2.5; RT[i] = 0;
  }
  function initRain() {
    for (let i = 0; i < RUN; i++) spawn(i, true);
    for (let i = 0; i < SH; i++) { SHX[i] = (rrng() * 2 - 1) * (lancetsOn ? LX + LHW : SQ); SHY[i] = rrng() * 2.4 - 1.2; SHV[i] = 0.7 + rrng() * 0.6; SHL[i] = 0.04 + rrng() * 0.08; }
    for (let i = 0; i < FL; i++) { FX[i] = rrng(); FY[i] = rrng(); FV[i] = 0.05 + rrng() * 0.07; FS[i] = 1.1 + rrng() * 1.4; FP[i] = rrng() * 100; }
  }

  // drawn in ambient space (the caller has set the window transform and the glass clip)
  function drawRain(ctx, t, dt, a, D = 0) {
    const rk = U.clamp(WX.rain), R = RA, ox = cxA, oy = cyA, rc = D > 0 ? U.safe(U.mix(C.rain, C.rainDay, D)) : U.safe(C.rain), vk = 1 + 1.3 * D;   // by day the streams catch the sky
    const span = lancetsOn ? LX + LHW : SQ;
    // sheeting streaks, slanted a little by the wind
    const ns = Math.ceil(SH * Math.pow(rk, 0.9)), slant = 0.04 + 0.25 * WX.lean;
    ctx.beginPath();
    for (let i = 0; i < ns; i++) {
      SHY[i] += SHV[i] * (0.6 + 0.6 * rk) * dt; SHX[i] += SHV[i] * slant * 0.3 * dt;
      if (SHY[i] > 1.15) { SHY[i] = -1.15 - rrng() * 0.2; SHX[i] = (rrng() * 2 - 1) * span; }
      const x = ox + SHX[i] * R, y = oy + SHY[i] * R, l = SHL[i] * R * (0.7 + 0.6 * rk);
      ctx.moveTo(x, y); ctx.lineTo(x - l * slant, y - l);
    }
    ctx.lineWidth = 0.9; ctx.strokeStyle = U.rgba(rc, (0.08 + 0.12 * rk) * a * vk); ctx.stroke();
    // rivulets
    const nr = Math.ceil(RUN * U.clamp(0.25 + rk)), sw = Math.max(4, 0.016 * R);
    for (let i = 0; i < nr; i++) {
      if (RP[i] > 0) { RP[i] -= dt; RT[i] = Math.max(0, RT[i] - 0.01 * dt); }
      else {
        const d = RV[i] * dt;
        RY[i] += d; RT[i] = Math.min(0.2, RT[i] + d); RX[i] += d * WX.lean * 0.12;
        if (rrng() < dt * 0.8) RP[i] = 0.2 + rrng() * 1.6;   // it catches and stops
      }
      if (RY[i] > 1.05 || (Math.abs(RX[i]) < 1.1 && Math.hypot(RX[i], RY[i]) > 1.0)) { spawn(i, false); continue; }
      const len = RT[i] * R;
      if (len < 2) continue;
      const x = ox + RX[i] * R, y1 = oy + RY[i] * R, y0 = y1 - len;
      // the lens: a narrow strip of the glass behind, magnified and pushed aside, so leads and colours kink
      const ss = sw * 0.55, sx = (x - ss / 2 - compL.x0) * dpr, sy = (y0 - compL.y0) * dpr;
      const wob = 2 + 1.5 * Math.sin(t * 2.3 + i * 1.7);
      if (sx > 0 && sy > 0 && sx + ss * dpr < compL.cv.width && sy + len * dpr < compL.cv.height) {
        ctx.fillStyle = "#000"; ctx.globalAlpha = 0.9 * a; ctx.fillRect(x - sw / 2 + wob, y0, sw, len);
        ctx.drawImage(compL.cv, sx, sy, ss * dpr, len * dpr, x - sw / 2 + wob, y0 + 1, sw, len);
        ctx.globalAlpha = 1;
      }
      ctx.beginPath(); ctx.moveTo(x - sw * 0.45 + wob, y0); ctx.lineTo(x - sw * 0.45 + wob, y1);
      ctx.lineWidth = 0.9 + 0.6 * D; ctx.strokeStyle = U.rgba(rc, 0.26 * a * vk); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + wob * 0.6, y1, Math.max(1.4, 0.005 * R), 0, TAU);
      ctx.fillStyle = U.rgba(rc, 0.42 * a * (1 + 0.6 * D)); ctx.fill();
    }
  }

  // flakes drifting past outside, faint against the glass
  function drawFlakes(ctx, t, a, D = 0) {
    const sk = U.clamp(WX.snow), span = (lancetsOn ? LX + LHW : SQ) * RA, n = Math.ceil(FL * sk);
    const ww = span * 2.4, top = cyA - SQ * RA - 10, hh = 2 * SQ * RA + 20;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const y = top + ((FY[i] + t * FV[i] * 0.35) % 1) * hh;
      const xo = FX[i] * ww + WX.drift * 0.09 * H * (0.6 + FV[i] * 4) + Math.sin(t * 0.8 + FP[i]) * 0.012 * H;
      const x = cxA - ww / 2 + (((xo % ww) + ww) % ww), s = FS[i];
      ctx.moveTo(x + s, y); ctx.arc(x, y, s, 0, TAU);
    }
    ctx.fillStyle = U.rgba(U.safe(C.snow), 0.45 * a * (1 + 0.5 * D)); ctx.fill();
  }

  // ------------------------------------------------------------------ hosts
  function hostSlot(i, cx, cy, R) {
    if (i < 4) { const [sx, sy] = SLOTS[i]; return [cx + sx * SLOT * R, cy + sy * SLOT * R, sx]; }
    // more than four: small roundels along the foot of the frame
    const k = i - 4, x = (k % 2 ? 1 : -1) * (0.3 + 0.22 * Math.floor(k / 2));
    return [cx + x * R, cy + (SQ + 0.13) * R, x < 0 ? -1 : 1];
  }

  function drawHosts(ctx, f, b, cx, cy, R, aW, aA) {
    const hb = Array.isArray(f.signals.heartbeat) ? f.signals.heartbeat : [];
    const t = f.t, now = f.now;
    for (let i = 0; i < hb.length; i++) {
      const h = hb[i], down = !h.up, name = String(h.host);
      const [x, y, sd] = hostSlot(i, cx, cy, R);
      const r = (i < 4 ? SLOT_R : 0.07) * R;
      // ambient: a glass roundel in the tracery, steady when up, a ruby pulse when down
      if (aA > 0.004) {
        const pulse = down ? 0.55 + 0.45 * Math.sin(t * 1.9) : 1;
        if (down) glowDot(ctx, C.ruby, x, y, r * 4.2, aA * (0.3 + 0.25 * pulse));
        else glowDot(ctx, C.teal, x, y, r * 2.6, aA * 0.1);
        const dD = U.clamp(+f.day || 0), dk = 1 + 1.2 * dD * (1 - 0.7 * WX.fog) * (1 - 0.35 * WX.cover);   // by day the roundels are lit glass like the rest
        const pc = down ? GL.ruby : GL.teal, ec = down ? GL.rose : GL.emerald, lv = (down ? 0.42 + 0.48 * pulse : 0.3) * (down ? 1 : dk);
        ctx.save(); ctx.translate(x, y); ctx.scale(r, r);
        ctx.globalAlpha = aA;
        for (let j = 0; j < 6; j++) {
          const g = j % 2 ? pc : ec, k = lv * (j % 2 ? 1 : 0.8);
          ctx.fillStyle = `rgb(${(g[0] * k) | 0},${(g[1] * k) | 0},${(g[2] * k) | 0})`; ctx.fill(ROSETTE.petals[j]);
        }
        const gk = down ? 0.3 + 0.4 * pulse : 0.36 * dk;
        ctx.fillStyle = `rgb(${(GL.gold[0] * gk) | 0},${(GL.gold[1] * gk) | 0},${(GL.gold[2] * gk) | 0})`; ctx.fill(ROSETTE.eye);
        ctx.lineWidth = 0.05; ctx.strokeStyle = "#000"; ctx.stroke(ROSETTE.lead);
        ctx.lineWidth = 0.1; ctx.stroke(ROSETTE.rim);
        if (dD > 0) { ctx.globalAlpha = aA * 0.55 * dD; ctx.strokeStyle = css(C.stoneDay, 1); ctx.lineWidth = 0.07; ctx.stroke(ROSETTE.rim); }   // its stone ring, lit by day
        ctx.restore(); ctx.globalAlpha = 1;
        // the name, whispered beside it, outside the frame
        const lx = x + sd * (r + (SQ - SLOT) * R + 0.022 * H);
        text(ctx, name, lx, y, { px: Math.max(12, 0.0195 * H), style: "italic", color: down ? C.ruby : C.stone, glow: down ? 4 : 2, core: 0.9 },
          sd < 0 ? "right" : "left", 1, aA * (down ? 0.45 + 0.3 * pulse : 0.5));
      }
      // work: a silver roundel, a cyan eye when up; down flares ruby and says for how long
      if (aW > 0.004) {
        const c = U.safe(down ? C.alarm : C.silverMid), rw = r * 0.78;
        if (down) {
          const ph = (t % 1.8) / 1.8;
          ctx.beginPath(); ctx.arc(x, y, rw * (1.15 + ph * 1.6), 0, TAU);
          ctx.lineWidth = 1.4; ctx.strokeStyle = U.rgba(c, aW * 0.6 * (1 - ph)); ctx.stroke();
          glowDot(ctx, C.alarm, x, y, rw * 3.4, aW * (0.45 + 0.15 * Math.sin(t * 3.4)));
        }
        ctx.beginPath(); ctx.arc(x, y, rw, 0, TAU); ctx.fillStyle = "#000"; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = U.rgba(c, aW * 0.12); ctx.stroke();
        ctx.lineWidth = 1.2; ctx.strokeStyle = U.rgba(c, aW * 0.85); ctx.stroke();
        ctx.beginPath();
        for (let j = 0; j < 6; j++) { const q = (j * 60 - 30) * RAD; ctx.moveTo(x + Math.sin(q) * rw * 0.3, y - Math.cos(q) * rw * 0.3); ctx.lineTo(x + Math.sin(q) * rw, y - Math.cos(q) * rw); }
        ctx.moveTo(x + rw * 0.3, y); ctx.arc(x, y, rw * 0.3, 0, TAU);
        ctx.lineWidth = 0.8; ctx.strokeStyle = U.rgba(c, aW * 0.4); ctx.stroke();
        const ec = U.safe(down ? C.alarm : C.cyan);
        ctx.beginPath(); ctx.arc(x, y, rw * (down ? 0.3 : 0.2), 0, TAU);
        ctx.fillStyle = U.rgba(ec, aW * (down ? 0.75 + 0.25 * Math.sin(t * 3.4) : 0.8)); ctx.fill();
        const lp = Math.max(12, 0.0175 * H), lx = x + sd * (rw + 0.018 * H), al = sd < 0 ? "right" : "left";
        text(ctx, name, lx, y - (down ? lp * 0.6 : 0), { px: lp, caps: true, spacing: 0.14, color: down ? C.alarm : C.silverDim, glow: down ? 5 : 2, core: 0.9 }, al, 1, aW * (down ? 1 : 0.85));
        if (down) {
          const since = h.downSince ? `down ${U.fmtMinutes((now - h.downSince) / 60000)}` : "down";
          text(ctx, since, lx, y + lp * 0.75, { px: lp * 1.05, style: "italic", color: C.alarm, glow: 5, core: 0.92 }, al, 1, aW);
        }
      }
    }
  }

  // ------------------------------------------------------------------ work: the dial around the drawing
  function sunMark(ctx, x, y, r, a) {
    const c = U.safe(C.cyan);
    glowDot(ctx, C.cyan, x, y, r * 4, a * 0.45);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = "#000"; ctx.fill();
    ctx.lineWidth = 1.3; ctx.strokeStyle = U.rgba(c, a); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, TAU); ctx.fillStyle = U.rgba(c, a * 0.85); ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const q = i / 8 * TAU, r0 = r * 1.45, r1 = r * (i % 2 ? 1.85 : 2.25); ctx.moveTo(x + Math.cos(q) * r0, y + Math.sin(q) * r0); ctx.lineTo(x + Math.cos(q) * r1, y + Math.sin(q) * r1); }
    ctx.lineWidth = 1; ctx.strokeStyle = U.rgba(c, a * 0.8); ctx.stroke();
  }

  function drawDial(ctx, f, cx, cy, R, a) {
    const dl = f.signals.daylight;
    if (!dl || !dl.sunrise || !dl.sunset || a <= 0.004) return;
    const now = f.now, rd = 1.125 * R;
    const ang = (d) => { const m = new Date(d); return ((m.getHours() + m.getMinutes() / 60 + m.getSeconds() / 3600) - 12) / 24 * TAU; };
    const aR = ang(dl.sunrise), aS = ang(dl.sunset), aN = ang(now);
    const sv = U.safe(C.silverMid), cy2 = U.safe(C.cyan), sd = U.safe(C.silverDim);
    const arc = (a0, a1, col, al, lw, dash) => {
      if (a1 <= a0) return;
      ctx.setLineDash(dash || []);
      ctx.beginPath(); ctx.arc(cx, cy, rd, a0 - Math.PI / 2, a1 - Math.PI / 2);
      if (lw > 1.5) { ctx.lineWidth = lw * 3.5; ctx.strokeStyle = U.rgba(col, al * 0.14); ctx.stroke(); }
      ctx.lineWidth = lw; ctx.strokeStyle = U.rgba(col, al); ctx.stroke();
      ctx.setLineDash([]);
    };
    arc(aS, aR + TAU, sd, 0.45 * a, 1, [1.5, 6]);
    arc(aR, aS, sv, 0.6 * a, 1.2);
    if (dl.isDay) arc(Math.max(aN, aR), aS, cy2, 0.85 * a, 2.4);
    // sunrise and sunset ticks, their times outside
    const lp = Math.max(12, 0.0185 * H);
    for (const [q, d] of [[aR, dl.sunrise], [aS, dl.sunset]]) {
      const p0 = pol(rd - 0.06 * R, q), p1 = pol(rd + 0.07 * R, q), pl = pol(rd + 0.15 * R, q);
      ctx.beginPath(); ctx.moveTo(cx + p0[0], cy + p0[1]); ctx.lineTo(cx + p1[0], cy + p1[1]);
      ctx.lineWidth = 1.5; ctx.strokeStyle = U.rgba(U.safe(C.silver), 0.85 * a); ctx.stroke();
      text(ctx, U.fmtTime(d), cx + pl[0], cy + pl[1], { px: lp, color: C.silverMid, glow: 3, core: 0.9 }, pl[0] < -2 ? "right" : pl[0] > 2 ? "left" : "center", 1, a * 0.85);
    }
    const pn = pol(rd, aN);
    if (dl.isDay) sunMark(ctx, cx + pn[0], cy + pn[1], 0.0085 * H, a);
    else {
      const c = U.safe(C.silverMid), x = cx + pn[0], y = cy + pn[1], r = 0.0075 * H;
      ctx.beginPath(); ctx.arc(x, y, r, 0.6, TAU - 0.6, false); ctx.arc(x + r * 0.55, y, r * 0.8, TAU - 0.9, 0.9, true);
      ctx.closePath(); ctx.fillStyle = "#000"; ctx.fill(); ctx.lineWidth = 1.1; ctx.strokeStyle = U.rgba(c, 0.8 * a); ctx.stroke();
    }
    // the light that is left, as the caption of the drawing
    let msg;
    if (dl.isDay && dl.lightLeftMin != null) msg = `${U.fmtMinutes(dl.lightLeftMin)} of light left`;
    else if (now < dl.sunrise) msg = `sunrise in ${U.fmtMinutes((dl.sunrise - now) / 60000)}`;
    else msg = `night  ·  sunrise ${U.fmtTime(new Date(dl.sunrise.getTime() + 86400000))}`;
    text(ctx, msg, cx, cy + 1.33 * R, { px: 0.03 * H, style: "italic", color: dl.isDay ? C.cyan : C.silverMid, glow: 5, core: 0.9 }, "center", 1, a * 0.9);
  }

  // ------------------------------------------------------------------ work: the column of inscriptions
  const agoH = (d, now) => {
    const h = (now - d) / 3600000;
    return h >= 1 && h < 48 ? `${Math.round(h)} h ago` : U.fmtAgo(d, now);
  };
  function colX() { return 0.07 * W; }

  function drawDate(ctx, f, y, a) {
    if (a <= 0.004) return;
    const d = f.now;
    const s = `${d.toLocaleDateString("en-CA", { weekday: "long" })}  ·  ${d.getDate()} ${d.toLocaleDateString("en-CA", { month: "long" })}`;
    text(ctx, s, colX(), y + (1 - a) * 0.012 * H, { px: 0.03 * H, caps: true, spacing: 0.08, color: C.silverMid, glow: 4, core: 0.9 }, "left", 1, a * 0.9);
    // an engraved rule with a lozenge
    const ry = y + 0.045 * H, x0 = colX(), rw = 0.2 * H * (0.5 + 0.5 * a), c = U.safe(C.silverDim), d2 = 0.005 * H;
    ctx.beginPath();
    ctx.moveTo(x0, ry); ctx.lineTo(x0 + rw, ry);
    ctx.moveTo(x0 + rw + d2 * 1.6, ry - d2); ctx.lineTo(x0 + rw + d2 * 3.2, ry); ctx.lineTo(x0 + rw + d2 * 1.6, ry + d2); ctx.lineTo(x0 + rw, ry); ctx.closePath();
    ctx.lineWidth = 1; ctx.strokeStyle = U.rgba(c, 0.6 * a); ctx.stroke();
  }

  function drawCalendar(ctx, f, a, ambA, ambY) {
    const next = f.signals.calendar && f.signals.calendar.next;
    if (!next) return;
    const mins = next.minutesUntil, soon = U.smoothstep(15, 3, mins);
    const cd = mins < 1 ? "now" : `in ${U.fmtMinutes(mins)}`;
    if (a > 0.004) {
      const y = 0.6 * H + (1 - a) * 0.012 * H, beat = soon > 0 ? 0.85 + 0.15 * Math.sin(f.t * 2.4) : 1;
      const tw = text(ctx, String(next.title), colX(), y, { px: 0.05 * H, caps: true, spacing: 0.05, color: C.silver, glow: 7, core: 0.9 }, "left", 1, a);
      text(ctx, cd, colX() + tw + 0.024 * H, y + 0.003 * H,
        { px: 0.044 * H, style: "italic", color: soon > 0.5 ? C.cyan : C.silverMid, glow: 6, core: 0.9 }, "left", 1, a * beat);
    }
    // ambient: a single whisper under the gilt clock, only when it is close
    if (mins < 30 && ambA > 0.004) {
      text(ctx, `${next.title}  ·  ${cd}`, cxA, ambY + 0.075 * H, { px: 0.024 * H, style: "italic", color: C.giltDim, glow: 4, core: 0.85 }, "center", 1, ambA * 0.55);
    }
  }

  function drawWeather(ctx, f, a) {
    const wx = f.signals.weather;
    if (!wx || !wx.actionable || a <= 0.004) return;
    const s = wx.tempC != null ? `${wx.actionable}  ·  ${Math.round(wx.tempC)}°` : wx.actionable;
    text(ctx, s, colX(), 0.67 * H + (1 - a) * 0.012 * H, { px: 0.032 * H, style: "italic", color: C.silverMid, glow: 4, core: 0.92 }, "left", 1, a * 0.9);
  }

  function drawLedger(ctx, f, a) {
    const fin = f.signals.finances;
    if (!fin || a <= 0.004 || fin.income == null || fin.spent == null) return;
    const mood = fin.mood || "calm", warn = mood === "warning", drift = mood === "drift";
    const pulse = warn ? 0.78 + 0.22 * Math.sin(f.t * 2.2) : 1;
    const moodC = warn ? C.alarm : drift ? C.drift : C.silver;
    const sk = (1 - a) * 0.012 * H, x0 = colX(), lp = Math.max(13, 0.026 * H);
    text(ctx, f.now.toLocaleDateString("en-CA", { month: "long" }), x0, 0.775 * H + sk, { px: Math.max(12, 0.019 * H), caps: true, spacing: 0.22, color: C.silverDim, glow: 2, core: 0.9 }, "left", 1, a * 0.85);
    let x = x0;
    x += text(ctx, U.fmtMoney(fin.income), x, 0.82 * H + sk, { px: lp, color: C.silverMid, glow: 3, core: 0.9 }, "left", 1, a * 0.9);
    x += text(ctx, " made  ·  ", x, 0.82 * H + sk, { px: lp, style: "italic", color: C.silverDim, glow: 2, core: 0.9 }, "left", 1, a * 0.85);
    x += text(ctx, U.fmtMoney(fin.spent), x, 0.82 * H + sk, warn ? { px: lp, color: C.alarm, glow: 5, core: 0.9 } : { px: lp, color: C.silverMid, glow: 3, core: 0.9 }, "left", 1, a * (warn ? pulse : 0.9));
    text(ctx, " spent", x, 0.82 * H + sk, { px: lp, style: "italic", color: C.silverDim, glow: 2, core: 0.9 }, "left", 1, a * 0.85);
    // the net, with a small mood roundel before it
    const ny = 0.875 * H + sk, mr = 0.009 * H, mc = U.safe(moodC);
    if (warn) glowDot(ctx, C.alarm, x0 + mr, ny, mr * 5, a * 0.4 * pulse);
    ctx.beginPath(); ctx.arc(x0 + mr, ny, mr, 0, TAU); ctx.lineWidth = 1.2; ctx.strokeStyle = U.rgba(mc, a * 0.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(x0 + mr, ny, mr * 0.45, 0, TAU); ctx.fillStyle = U.rgba(mc, a * 0.8 * pulse); ctx.fill();
    const net = fin.net != null ? fin.net : fin.income - fin.spent;
    const nw = text(ctx, `net ${U.fmtMoney(net, { sign: true })}`, x0 + mr * 2 + 0.012 * H, ny, { px: 0.042 * H, color: moodC, glow: warn ? 10 : 7, core: 0.92 }, "left", 1, a * pulse);
    if (fin.lastUpdated) {
      text(ctx, `updated ${agoH(fin.lastUpdated, f.now)}`, x0 + mr * 2 + 0.03 * H + nw, ny + 0.004 * H, { px: Math.max(12, 0.019 * H), style: "italic", color: C.silverDim, glow: 2, core: 0.9 }, "left", 1, a * 0.7);
    }
  }

  // News: an inscription at the head of the column, above the clock, like the dedication cut over a window:
  // the source and age in spaced small caps after a small lozenge, the headline in the roman hand under it.
  // Critical is the rare flare: the headline in alarm red with a slow pulse, the lozenge a ruby that breathes.
  // Ambient: only a critical item whispers, once and faint, on the wall under the left lancet like a plaque
  // (under the clock when the wall is too narrow for lancets).
  function drawNews(ctx, f, a, ambA, ambY) {
    const n = f.signals.news;
    if (!n || !n.headline) return;
    const crit = !!n.critical, pulse = crit ? 0.5 + 0.5 * Math.sin(f.t * TAU / 3.6) : 0;
    if (a > 0.004) {
      const x0 = colX(), sk = (1 - a) * 0.012 * H, y0 = 0.062 * H + sk, d = 0.0052 * H;
      // the lozenge
      const lc = U.safe(crit ? C.alarm : C.silverDim), mx = x0 + d;
      if (crit) glowDot(ctx, C.ruby, mx, y0, 0.03 * H, a * (0.35 + 0.3 * pulse));
      ctx.beginPath(); ctx.moveTo(mx, y0 - d * 1.4); ctx.lineTo(mx + d, y0); ctx.lineTo(mx, y0 + d * 1.4); ctx.lineTo(mx - d, y0); ctx.closePath();
      if (crit) { ctx.fillStyle = U.rgba(lc, a * (0.5 + 0.4 * pulse)); ctx.fill(); }
      ctx.lineWidth = 1.1; ctx.strokeStyle = U.rgba(lc, a * 0.8); ctx.stroke();
      const age = newsAge(n.published, f.now), src = n.source ? String(n.source) : "";
      const lab = src + (src && age ? "  ·  " : "") + (age || "");
      if (lab) text(ctx, lab, x0 + d * 2 + 0.012 * H, y0, { px: Math.max(12, 0.019 * H), caps: true, spacing: 0.14, color: crit ? C.alarm : C.silverDim, glow: crit ? 3 : 2, core: 0.9 }, "left", 1, a * (crit ? 0.8 + 0.2 * pulse : 0.85));
      const ho = { px: 0.026 * H, color: crit ? C.alarm : C.silverMid, glow: crit ? 6 : 4, core: 0.9 };
      const lines = newsLines(String(n.headline), ho, Math.max(0.2 * W, cxW - 1.05 * Rw - 0.02 * W - x0));
      const ha = a * (crit ? 0.74 + 0.26 * pulse : 0.88);
      for (let i = 0; i < lines.length; i++) text(ctx, lines[i], x0, y0 + (0.035 + i * 0.031) * H, ho, "left", 1, ha);
    }
    if (crit && ambA > 0.004) {
      const wo = { px: 0.022 * H, style: "italic", color: C.ruby, glow: 3, core: 0.85 };
      const wa = ambA * (0.3 + 0.1 * pulse);
      if (lancetsOn) {
        const lx = cxA - LX * RA, half = Math.min((LX - SQ) * RA - 0.02 * W, lx - 0.02 * W);
        text(ctx, newsWhisper(String(n.headline), wo, Math.max(0.12 * W, half * 2)), lx, ambY, wo, "center", 1, wa);
      } else {
        const next = f.signals.calendar && f.signals.calendar.next;
        const dy = next && next.minutesUntil < 30 ? 0.106 : 0.075;
        text(ctx, newsWhisper(String(n.headline), wo, 0.5 * W), cxA, ambY + dy * H, wo, "center", 1, wa);
      }
    }
  }

  // Now playing. Work: one small italic line under the drawing's caption ("title — artist", cut at a word in
  // the sprite's own font), a pause glyph when paused (and the line dims), and a thin progress hairline when the
  // track knows its position: silver track, the cyan of what is live for the part played. Ambient: a faint
  // italic line cut in the stone under the right-hand lancet like a plaque (mirroring the news whisper under the
  // left one), with a faint engraved rule under it; under the clock when the wall is too narrow for lancets.
  // Laid out only when the track, the font or the width changes; the strings then hit the sprite cache.
  const NPL = { work: { key: "", line: "" }, amb: { key: "", line: "" } };
  function npLine(slot, np, o, maxW) {
    const s = slot === "amb" ? NPL.amb : NPL.work;
    const title = String(np.title || "").replace(/\s+/g, " ").trim(), artist = String(np.artist || "").replace(/\s+/g, " ").trim();
    const key = `${title}|${artist}|${fontOf(o)}|${Math.round(maxW)}`;
    if (s.key === key) return s.line;
    measureIn(o);
    s.key = key; s.line = U.ellipsize(artist ? `${title} — ${artist}` : title, maxW, mctx);
    return s.line;
  }
  const npFrac = (np) => (typeof np.progressMs === "number" && typeof np.durationMs === "number" && np.durationMs > 0
    ? U.clamp(np.progressMs / np.durationMs) : null);
  // a tiny play mark (a pointed lozenge) or a pause mark (two bars), centred on (x, y), height h
  function npGlyph(ctx, x, y, h, paused, col, a) {
    if (a <= 0.004) return;
    ctx.fillStyle = U.rgba(U.safe(col), a);
    if (paused) { const w = h * 0.22; ctx.fillRect(x - w * 1.6, y - h / 2, w, h); ctx.fillRect(x + w * 0.6, y - h / 2, w, h); }
    else { ctx.beginPath(); ctx.moveTo(x - h * 0.38, y - h / 2); ctx.lineTo(x + h * 0.48, y); ctx.lineTo(x - h * 0.38, y + h / 2); ctx.closePath(); ctx.fill(); }
  }
  function drawNowPlaying(ctx, f, a, cx, cy, R) {
    const np = f.signals.nowPlaying;
    if (!np || !np.title || a <= 0.004) return;
    const paused = !np.isPlaying, k = a * (paused ? 0.5 : 1);
    const o = { px: Math.max(13, 0.022 * H), style: "italic", color: C.silverMid, glow: 3, core: 0.9 };
    const gh = 0.011 * H, gap = 0.012 * H;
    const maxW = Math.max(0.16 * W, Math.min(2.5 * R, 2 * (W - cx) - 0.06 * W)) - gh - gap;
    const line = npLine("work", np, o, maxW);
    const tw = sprite(line, o).tw, total = gh + gap + tw;
    const y = cy + 1.33 * R + 0.052 * H + (1 - a) * 0.012 * H, x0 = cx - total / 2;
    npGlyph(ctx, x0 + gh / 2, y, gh, paused, paused ? C.silverDim : C.cyan, k * 0.85);
    text(ctx, line, x0 + gh + gap, y, o, "left", 1, k * 0.85);
    const p = npFrac(np);
    if (p === null) return;
    const hy = Math.round(y + 0.022 * H) + 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, hy); ctx.lineTo(x0 + total, hy); ctx.strokeStyle = U.rgba(U.safe(C.silverDim), k * 0.5); ctx.stroke();
    if (p > 0) { ctx.beginPath(); ctx.moveTo(x0, hy); ctx.lineTo(x0 + total * p, hy); ctx.strokeStyle = U.rgba(U.safe(paused ? C.silverMid : C.cyan), k * 0.8); ctx.stroke(); }
  }
  function drawPlaque(ctx, f, a, ambY) {
    const np = f.signals.nowPlaying;
    if (!np || !np.title || a <= 0.004) return;
    const paused = !np.isPlaying, k = a * (paused ? 0.6 : 1);
    const o = { px: Math.max(12, 0.021 * H), style: "italic", color: C.giltDim, glow: 3, core: 0.85 };
    let x, y, maxW;
    if (lancetsOn) {
      x = cxA + LX * RA; y = ambY;
      maxW = Math.max(0.12 * W, 2 * Math.min((LX - SQ) * RA - 0.02 * W, W - x - 0.02 * W));
    } else {
      const next = f.signals.calendar && f.signals.calendar.next, n = f.signals.news;
      x = cxA; y = ambY + (0.075 + (next && next.minutesUntil < 30 ? 0.031 : 0) + (n && n.headline && n.critical ? 0.031 : 0)) * H;
      maxW = 0.5 * W;
      if (y > 0.98 * H) return;   // a narrow wall already full of whispers: the plaque gives way
    }
    const line = npLine("amb", np, o, maxW - (paused ? 0.02 * H : 0));
    const tw = sprite(line, o).tw;
    if (paused) npGlyph(ctx, x - tw / 2 - 0.016 * H, y, 0.009 * H, true, C.giltDim, k * 0.3);
    text(ctx, line, x, y, o, "center", 1, k * (0.36 + 0.14 * U.clamp(+f.day || 0)));   // by day the lit stone wants a touch more
    // the engraved rule under it; the part played a touch brighter
    const p = npFrac(np);
    const rw = Math.min(tw, 0.14 * H), ry = Math.round(y + 0.021 * H) + 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - rw / 2, ry); ctx.lineTo(x + rw / 2, ry); ctx.strokeStyle = U.rgba(U.safe(C.giltDim), k * 0.14); ctx.stroke();
    if (p && ry < H - 1) { ctx.beginPath(); ctx.moveTo(x - rw / 2, ry); ctx.lineTo(x - rw / 2 + rw * p, ry); ctx.strokeStyle = U.rgba(U.safe(C.gilt), k * 0.24); ctx.stroke(); }
  }

  // ------------------------------------------------------------------ sound: inside the cathedral
  // The bed (soundscape) is a vast stone hush, rain on the glass and the lead roof, wind moaning round the
  // tracery, birds faint outside by day and the candles' faint breath once they are lit. Cues come from the
  // theme's own events: the tower bell on the hour (7:00 to 22:00, deep, hour % 12 strokes), a soft chime as the
  // hour petal starts to hand over (:52), thunder on the frame the lightning lights the panes, a drip now and
  // then in the rain. Cues are ignored while sound is off, so they are called unconditionally, once per event.
  const SND = { cand: 0, h: -1, m: -1, ms: 0, thSlot: -1, drip: 0 };
  const cue = (name, o) => { if (AW.audio) AW.audio.cue(name, o); };
  const bellHour = (h) => h >= 7 && h <= 22;
  function soundEvents(f, t) {
    const now = f.now, h = now.getHours(), m = now.getMinutes(), ms = now.getTime();
    // a jump of the clock (a warp, a test) is not an hour passing
    const live = SND.h >= 0 && Math.abs(ms - SND.ms) < 5 * 60000;
    if (live && h !== SND.h && m < 2 && bellHour(h)) cue("distant_bell", { count: h % 12 || 12, freq: 196, gain: 1.1, distance: 0.3, pan: 0.15 });
    if (live && h === SND.h && SND.m < 52 && m >= 52 && bellHour((h + 1) % 24)) cue("chime", { notes: 1, freq: 1174.66, gain: 0.3, distance: 0.6, pan: -0.2 });
    SND.h = h; SND.m = m; SND.ms = ms;
    // rain finds its way in: a drip into the stone now and then
    if (WX.rain > 0.15) {
      if (SND.drip <= 0) SND.drip = t + 6 + Math.random() * 20;
      else if (t >= SND.drip) { cue("drip", { gain: 0.45 + 0.3 * Math.random(), pan: Math.random() * 1.4 - 0.7, distance: 0.4 + 0.4 * Math.random() }); SND.drip = t + (12 + Math.random() * 30) / (0.6 + WX.rain); }
    } else SND.drip = 0;
  }
  function soundscape(f) {
    const w = (f.signals && f.signals.weather) || null;
    const T = w && typeof w.tempC === "number" ? w.tempC : 12;
    const day = U.clamp(+f.day || 0);
    const rain = WX.rain > 0.005 ? U.clamp(0.1 + 0.9 * WX.rain) * U.smoothstep(0, 0.08, WX.rain) : 0;
    const wind = Math.min(0.4, 0.3 * U.smoothstep(8, 40, wxWind) + 0.1 * WX.storm);
    const birds = 0.15 * day * U.smoothstep(4, 9, T) * (1 - 0.85 * U.clamp(rain * 1.2)) * (1 - 0.8 * WX.snow);
    return { room: 0.35, rain, wind, birds, fire: 0.06 * SND.cand };
  }

  // the hero: silver and large in the column; under the window, gilt and smaller. The window travels
  // between them, so the two faces cross-fade in place rather than fly through the glass.
  function drawClock(ctx, f, b, flick) {
    const str = U.fmtTime(f.now, { hour24: !AW.config.clock || AW.config.clock.hour24 !== false });
    const avail = cxW - 1.4 * Rw - colX() - 0.03 * W;
    const pxW = Math.round(Math.min(0.245 * H, avail / 2.6)), pxA = Math.round(0.122 * H);
    const oW = { px: pxW, color: C.silver, glow: 12, core: 0.9 }, oA = { px: pxA, color: C.gilt, glow: 9, core: 0.9 };
    const wy = 0.3 * H, ay = cyA + (SQ + 0.24) * RA;
    const aw = fade(b, 0.1, 0.42), aa = U.smoothstep(0.5, 0.9, b);
    text(ctx, str, colX(), wy + U.easeIn(1 - aw) * 0.04 * H, oW, "left", 1, aw);
    text(ctx, str, cxA, ay + (1 - aa) * 0.025 * H, oA, "center", 1, aa * 0.85 * flick);
    return { wy, ay, pxW };
  }

  // ------------------------------------------------------------------ the cat (THEMES.md "The cat")
  // The cathedral cat sits on the deep stone sill of the left lancet, seen from behind, looking up into the glass,
  // its tail hanging over the edge. The window lights it from behind: a rim of ruby-gold from the pearled border on
  // one side and of cobalt from the field on the other, stronger by day when the glass is full of sun; the moon
  // adds a pale edge, the candles below warm its back. Late at night it loafs and then curls up asleep on the sill.
  // (On a narrow wall without lancets it sits on the frame's sill below the rose, at the left spandrel.)
  let CAT = null;
  const CAT_RUBY = { r: 214, g: 96, b: 74 }, CAT_GOLD = { r: 208, g: 160, b: 74 }, CAT_COBALT = { r: 96, g: 120, b: 226 };
  function drawCat(ctx, f, sk, cx, cy, R, alpha, cand) {
    if (!CAT) CAT = AW.cat.create(9137);
    const k = R / RA, D = sk.D || 0;
    const ux = lancetsOn ? -LX : -0.62, uy = lancetsOn ? LSILL + 0.045 : SQ + 0.035;
    const x = cx + ux * R, y = cy + uy * R, size = 0.105 * H * k;
    const fc = f.cat, pa = (fc ? fc.a : 0) * alpha;
    // the sill's front edge under the cat catches the candle and the glass (by night the wall itself is not drawn)
    if (pa > 0.004 && D < 0.999) {
      const hw = lancetsOn ? (LHW + 0.06) * R : 0.3 * R, ey = y + 0.012 * R;
      const lc = U.safe(U.mix(C.stone, C.candle, U.clamp(cand * 0.7)));
      ctx.globalAlpha = U.clamp(pa * (1 - D) * (0.3 + 0.25 * cand));
      ctx.strokeStyle = U.rgba(lc, 1); ctx.lineWidth = Math.max(1, 0.004 * R);
      ctx.beginPath(); ctx.moveTo(x - hw, ey); ctx.lineTo(x + hw, ey); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // how much light the lowest panes pass: night sky + moon + candles; by day the sun and the open sky
    const glass = U.clamp(0.25 + 1.4 * sk.moon + 0.35 * cand + D * (0.55 + 1.2 * (sk.sunK || 0)) * (1 - 0.35 * WX.cover));
    const side = U.clamp(0.5 - 0.5 * sk.sx);   // the sun's side (east = left in the morning): its rim is stronger
    const rimA = U.clamp(0.4 + 0.45 * glass);
    const fogK = 1 - 0.35 * WX.fog;
    const warmEdge = U.mix(CAT_RUBY, CAT_GOLD, 0.3 + 0.4 * D);
    const rims = [
      { color: U.safe(warmEdge), a: rimA * fogK * (0.85 + 0.3 * side * D), dx: -0.75, dy: -0.65, width: 0.034 },
      { color: U.safe(CAT_COBALT), a: rimA * fogK * (0.85 + 0.3 * (1 - side) * D), dx: 0.75, dy: -0.65, width: 0.034 },
    ];
    if (sk.moon > 0.02) rims.push({ color: U.safe(U.mix(C.snow, { r: 190, g: 196, b: 214 }, 0.4)), a: U.clamp(1.6 * sk.moon), dx: U.clamp(sk.mx, -1, 1), dy: -1, width: 0.026 });
    // the coat: the room's light by day (with a breath of the glass colour), candlelight by night
    const room = D > 0 && sk.lc ? { r: 230 * sk.lc[0], g: 220 * sk.lc[1], b: 205 * sk.lc[2] } : C.stone;
    const tint = U.mix(U.mix(C.stone, C.candle, U.clamp(cand)), U.mix(room, CAT_COBALT, 0.22), D);
    CAT.draw(ctx, f, {
      x, y, size, facing: 1,
      pose: AW.cat.autoPose(f, "back"), hang: true,
      light: U.clamp(0.2 + 0.1 * cand + D * (0.42 + 0.1 * (sk.sunK || 0) * 4)),
      tint: U.safe(tint), tintAmt: U.lerp(0.25 + 0.25 * cand, 0.3, D),
      rim: rims,
      glow: (1 - D) * (0.3 + 0.4 * sk.moon + 0.3 * cand),
      shadow: 0.45 * D,
      alpha,
    });
  }

  // ------------------------------------------------------------------ theme
  AW.registerTheme({
    id: "stainedglass",
    name: "Stained Glass",
    init(ctx, env) { dpr = env.dpr || 1; W = env.width; H = env.height; wxInit = false; build(); CAT = AW.cat.create(9137); },
    resize(env) { dpr = env.dpr || 1; W = env.width; H = env.height; build(); },
    destroy() { sprites.clear(); dots.clear(); GEO = compL = glowL = flashL = floorL = stoneL = snowL = workL = infoL = wallL = roomL = stoneDayL = snowDayL = null; CANDLES = []; built = ""; NPL.work.key = NPL.amb.key = ""; SND.h = -1; SND.cand = 0; SND.drip = 0; },
    soundscape,

    // The shared info overlay in the theme's hand: by day the architect's sheet (Garamond, silver ink,
    // cyan for what is live, small-caps headings, a double rule); with the window lit, gilt lettering,
    // candle-amber accents and a ruby alarm.
    overlayStyle(f) {
      const b = U.clamp(f.blend || 0), w = U.smoothstep(0.4, 0.6, b);
      const m = (a, c) => U.safe(U.mix(a, c, w));
      return {
        font: SERIF,
        ink: m(C.silver, C.gilt),
        dim: m(C.silverDim, C.giltDim),
        accent: m(C.cyan, C.candle),
        alarm: m(C.alarm, C.rubyLit),
        glow: U.lerp(0.35, 0.5, w),
        rule: "double",
        caps: true,
      };
    },

    render(ctx, f) {
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.width, f.height);
      if (f.width !== W || f.height !== H || (f.dpr || 1) !== dpr || !built) {
        dpr = f.dpr || 1; W = f.width; H = f.height; build();
      }
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      const b = U.clamp(f.blend || 0), t = f.t, S = f.signals || {}, el = f.ambientElapsed || 0;
      const dt = Math.min(0.1, f.dt || 0.016);
      updateWeather(S.weather, dt, t);
      const hb = Array.isArray(S.heartbeat) ? S.heartbeat : [];
      const nh = Math.min(4, hb.length);
      SND.cand = 0;

      // the window's place and size: the drawing on the right in work, the window centred in ambient
      const e = U.easeInOut(U.smoothstep(0.08, 0.72, b));
      const cx = U.lerp(cxW, cxA, e), cy = U.lerp(cyW, cyA, e), R = U.lerp(Rw, RA, e), k = R / RA, kw = R / Rw;
      const put = (L, a, op) => {
        if (a <= 0.004) return;
        ctx.globalAlpha = U.clamp(a); if (op) ctx.globalCompositeOperation = op;
        ctx.drawImage(L.cv, cx + (L.x0 - L.cx) * (R / L.R), cy + (L.y0 - L.cy) * (R / L.R), L.w * R / L.R, L.h * R / L.R);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      };
      const toAmb = () => ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (cx - cxA * k), dpr * (cy - cyA * k));
      const stoneA = U.smoothstep(0.2, 0.55, b), rev = U.smoothstep(0.42, 1, b), wxA = U.smoothstep(0.5, 1, b);
      // By day the work face keeps the lit window faintly behind the drawing: every pane at bdK = 0.18 * day of
      // its ambient light (0 at night, so the night work face is untouched), and the exhale fills it from there.
      const D = U.clamp(+f.day || 0), bdK = 0.18 * D;
      const lvl = bdK + (1 - bdK) * rev, wxL = wxA + (1 - wxA) * bdK, sA = stoneA + (1 - stoneA) * bdK;
      let flick = 1;

      // ---------------------------------------------------- the window, lit from behind (ambient)
      if (b > 0.004 || bdK > 0.004) {
        const sk = skyState(f, el, rev);
        sk.bd = bdK;
        if (lvl > 0) {
          relight(f, sk, nh);
          // by day: the room around the window, lit by it, and the sun's coloured pattern on the floor
          if (sk.D > 0) {
            relightRoom(sk);
            put(roomL, 0.38 * sk.D * lvl);
            const fd = 0.34 * sk.floor * lvl * (1 - 0.6 * WX.fog);
            if (fd > 0.004) {
              ctx.save(); toAmb();
              ctx.beginPath(); ctx.rect(cxA - 3 * RA, cyA + (SQ + 0.09) * RA, 6 * RA, 2 * RA); ctx.clip();
              const lo = sk.low, sh = -sk.sx * (0.45 + 0.5 * lo);
              const fw = compL.w * (0.9 + 0.25 * lo), fh = compL.h * (0.12 + 0.12 * lo);
              ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = U.clamp(fd);
              ctx.transform(1, 0, sh * 0.9, 1, cxA + sh * RA, cyA + (FLOOR_Y + 0.13 + 0.12 * lo) * RA);   // sheared along the sun's bearing
              ctx.drawImage(glowL.cv, -fw / 2, -fh / 2, fw, fh);
              ctx.restore();
            }
          }
          // the pattern thrown on the floor below, faint (alpha <= 0.12); by day the sun's own pattern takes over
          const fa = 0.12 * U.clamp(sk.beam) * lvl * (1 - 0.6 * WX.fog) * (1 - D);
          if (fa > 0.004) {
            const fw = compL.w * k * 1.05, fh = compL.h * k * 0.13;
            const fx = cx - fw / 2 - sk.beamX * 0.3 * R, fy = cy + (SQ + 0.42) * R - fh / 2;
            ctx.globalAlpha = fa; ctx.drawImage(floorL.cv, fx, fy, fw, fh); ctx.globalAlpha = 1;
          }
          put(compL, (1 - 0.35 * WX.fog));
          GLOW.cv = glowL.cv; GLOW.x0 = compL.x0; GLOW.y0 = compL.y0; GLOW.w = compL.w; GLOW.h = compL.h;
          put(GLOW, (0.2 + 0.1 * WX.cover + 0.6 * WX.fog) * (1 - 0.35 * sk.day) * lvl * (1 - 0.55 * D), "lighter");
          if (WX.fog > 0.02) {
            // fog: the light spreads milky into the murk beyond the glass
            const s = 1.12, gx = GLOW.x0, gy = GLOW.y0;
            GLOW.x0 = cxA + (gx - cxA) * s; GLOW.y0 = cyA + (gy - cyA) * s; GLOW.w *= s; GLOW.h *= s;
            put(GLOW, 0.55 * WX.fog * lvl * (1 - 0.5 * D), "lighter");
            glowDot(ctx, C.murk, cx, cy, 1.8 * R, 0.32 * WX.fog * lvl);
          }
          // the low sun beyond the glass, a warm breath on the wall at the sunset edge
          if (sk.dusk > 0.02) glowDot(ctx, C.candle, cx + sk.sx * 1.15 * R, cy + 0.2 * R, 1.1 * R, 0.1 * sk.dusk * Math.abs(sk.sx) * lvl);
          // candles inside catch the lowest panes as the night deepens
          const cand = U.smoothstep(1800, 3 * 3600, el) * Math.max(sk.night, 0.25) * rev;
          if (cand > 0.004) {
            for (let i = 0; i < CANDLES.length; i++) {
              const L = CANDLES[i];
              const fl = 0.8 + 0.12 * U.noise1(t * 1.7 + i * 3.1) + 0.08 * U.noise1(t * 4.3 + i * 7.7);
              put(L, cand * fl, "lighter");
              const p = [cx + L.ux * R, cy + (L.uy + 0.02) * R];
              glowDot(ctx, C.candle, p[0], p[1], 0.22 * R, 0.13 * cand * fl);
            }
            flick = 1 - 0.05 * cand + 0.05 * cand * U.noise1(t * 1.9);
          }
          SND.cand = U.clamp(cand);
          // rain on the glass, snow drifting past
          if (wxL > 0.004 && (WX.rain > 0.01 || WX.snow > 0.01)) {
            ctx.save(); toAmb();
            ctx.translate(cxA, cyA); ctx.scale(RA, RA); ctx.clip(GEO.clip); toAmb();
            if (WX.rain > 0.01) drawRain(ctx, t, dt, wxL * U.clamp(WX.rain * 1.5), D);
            if (WX.snow > 0.01) drawFlakes(ctx, t, wxL * WX.snow, D);
            ctx.restore();
          }
          // a storm: now and then every pane lights at once, dimly, in its own colour
          const fl = lightning(t) * wxL;
          if (fl > 0.004) {
            // its thunder, cued once on the frame the panes light (the engine lags it by distance x 5 s)
            const slot = Math.floor(t / 9);
            if (slot !== SND.thSlot) {
              SND.thSlot = slot;
              const r = U.rng(slot * 131 + 7);
              cue("thunder", { distance: 0.45 + 0.5 * r(), gain: 0.55 + 0.4 * WX.storm, pan: (r() - 0.5) * 0.8 });
            }
            put(flashL, 0.6 * fl, "lighter");
            put(stoneL, 0.8 * fl, "lighter");
          }
        }
        put(stoneL, stoneA * (0.55 + 0.1 * sk.night) * (1 - 0.4 * WX.fog));
        // by day the tracery reads as stone, lit by the room; snow on the ledges lies bright in the daylight
        if (D > 0) put(stoneDayL, 0.6 * D * sA * (1 - 0.3 * WX.fog));
        const dustA = U.smoothstep(0.03, 0.5, WX.dust);
        put(snowL, dustA * sA * (1 - D));
        if (D > 0) put(snowDayL, dustA * sA * D);
        // the cat on the sill: in front of the glass, the rain outside and the tracery; gone with the window
        const cand = U.smoothstep(1800, 3 * 3600, el) * Math.max(sk.night, 0.25) * rev;
        drawCat(ctx, f, sk, cx, cy, R, lvl, cand);
      }

      // ---------------------------------------------------- the elevation drawing (work)
      const silverA = fade(b, 0.18, 0.52);
      if (silverA > 0.004) put(workL, 0.8 * silverA);

      // While the shared info overlay is up, the information (dial, hosts, inscriptions; not the window)
      // steps back: it is drawn on a layer of its own and laid down at 1 - 0.7 * overlay.a.
      const od = f.overlay ? 1 - 0.7 * U.clamp(+f.overlay.a || 0) : 1;
      let ic = ctx;
      if (od < 0.999) {
        if (!infoL) infoL = mk(W, H);
        ic = infoL.c;
        ic.globalCompositeOperation = "source-over"; ic.globalAlpha = 1;
        ic.clearRect(0, 0, W, H);
        ic.lineCap = "round"; ic.lineJoin = "round";
      }
      drawDial(ic, f, cx, cy, R, fade(b, 0.0, 0.34));

      // ---------------------------------------------------- hosts in the spandrels
      drawHosts(ic, f, b, cx, cy, R, fade(b, 0.04, 0.36), U.smoothstep(0.5, 0.92, b));

      // ---------------------------------------------------- the inscriptions, fading in a cascade
      drawLedger(ic, f, fade(b, 0.02, 0.3));
      drawWeather(ic, f, fade(b, 0.05, 0.33));
      const ck = drawClock(ic, f, b, flick);
      drawDate(ic, f, ck.wy + ck.pxW * 0.58, fade(b, 0.12, 0.42));
      drawCalendar(ic, f, fade(b, 0.08, 0.38), U.smoothstep(0.55, 0.95, b), ck.ay);
      drawNews(ic, f, fade(b, 0.06, 0.36), U.smoothstep(0.55, 0.95, b), ck.ay);
      drawNowPlaying(ic, f, fade(b, 0.03, 0.32), cx, cy, R);
      drawPlaque(ic, f, U.smoothstep(0.6, 0.97, b), ck.ay);
      if (ic !== ctx) {
        ic.globalAlpha = 1;
        ctx.globalAlpha = od; ctx.drawImage(infoL.cv, 0, 0, W, H);
      }
      ctx.globalAlpha = 1;
      soundEvents(f, t);
    },
  });
})();
