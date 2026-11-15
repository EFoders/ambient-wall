// Classical: an engraved plate. Work = the instrument maker's bench in blue moonlight: a steel dial
// of the day, the engraved serif clock, roman date, inscriptions, roundels and a balance.
// Ambient = "Temple under the moon": a ruined Doric temple (fluted columns with entasis and drum
// joints, a broken entablature with triglyphs, guttae, mutules and worn metope reliefs, a pediment
// fragment, jointed steps, fallen drums and rubble, ivy and grass in the cracks), cypresses and
// olives, engraved in fine line on black and lit by the real moon (or the low sun) for the wall's location.
// The moon sits at its true altitude and azimuth with its true phase; columns are hatched on the
// side that faces it and throw shadows across the stippled ground and the stylobate, so the scene
// turns through the night like a sundial at architectural scale. Weather is real (clouds cross the
// moon, fog swallows the bases, rain, storm with distant lightning, snow settling on the stones).
// Mist pools as the evening deepens, stars resolve as the sky darkens, hosts are oil lamps on the
// steps, and the time is the plate's caption.
// By day (frame.day) the plate becomes a hand-coloured engraving under the Mediterranean sun: ultramarine sky,
// terra-rossa earth, sunlit limestone with hatched shade and real cast shadows, swallows; golden hour turns the
// stone amber and dusk hands back to the moon. Behind the work face it shows faintly (see "daytime" below).
// Caches: static linework baked once per size at device resolution; the lit scene (stipple, shadow
// cut-outs, hatching) rebuilt only when the light moves meaningfully, at most about once a second.
(function () {
  const U = AW.util;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const SERIF = '"Cormorant Garamond", "EB Garamond", Garamond, "TeX Gyre Pagella", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "DejaVu Serif", serif';

  const C = {
    steel: U.hex("#8cc2d8"),     // work hero, pale steel / silver-cyan
    steelMid: U.hex("#6d9fbe"),
    steelDim: U.hex("#527f9e"),
    candle: U.hex("#d9a552"),    // ambient clock + lamps
    amber: U.hex("#c98a3a"),
    ember: U.hex("#d27a3c"),
    alarm: U.hex("#e8703a"),
    rose: U.hex("#d8664a"),
    straw: U.hex("#c4b787"),
    bone: U.hex("#d6c7a0"),      // moonlight on stone
    slate: U.hex("#5f7896"),     // shade, starlight
    starGold: U.hex("#d6b57a"),
    starBlue: U.hex("#93abd2"),
  };

  // ------------------------------------------------------------------ astronomy
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
    return { lst, sunDec, sunH: lst - sunRa, moonDec, moonH: lst - moonRa, illum: (1 - Math.cos(el)) / 2, waxing: el < Math.PI };
  }
  // equatorial (dec, hour angle) -> horizontal (alt, az from north through east), degrees
  function horiz(dec, Hh, phi) {
    const sa = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(Hh);
    let az = Math.atan2(-Math.cos(dec) * Math.sin(Hh), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(Hh));
    if (az < 0) az += TAU;
    return { alt: Math.asin(U.clamp(sa, -1, 1)) / RAD, az: az / RAD };
  }
  const enu = (p) => {
    const a = p.alt * RAD, A = p.az * RAD;
    return [Math.cos(a) * Math.sin(A), Math.cos(a) * Math.cos(A), Math.sin(a)];
  };
  // screen angle of the moon's bright limb: the great circle toward the sun, in the sky's local frame
  function limbAngle(moon, sun) {
    const m = enu(moon), s = enu(sun);
    const d = s[0] * m[0] + s[1] * m[1] + s[2] * m[2];
    const t = [s[0] - d * m[0], s[1] - d * m[1], s[2] - d * m[2]];
    const a = moon.alt * RAD, A = moon.az * RAD;
    const uAz = [Math.cos(A), -Math.sin(A), 0];
    const uAlt = [-Math.sin(a) * Math.sin(A), -Math.sin(a) * Math.cos(A), Math.cos(a)];
    const right = t[0] * uAz[0] + t[1] * uAz[1];
    const up = t[0] * uAlt[0] + t[1] * uAlt[1] + t[2] * uAlt[2];
    return Math.atan2(-up, right);
  }

  const roman = (n) => {
    const t = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let s = ""; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s;
  };
  const fadeOut = (b, a0, a1) => 1 - U.smoothstep(a0, a1, b);

  // ------------------------------------------------------------------ canvases + sprites
  let dpr = 1, W = 0, H = 0, built = "";
  let LWU = 1;         // line-width unit: hairlines stay hairlines at 4K but do not vanish
  let L = {};          // cached layers
  let T = null;        // temple geometry
  const sprites = new Map();
  let mctx = null;

  function mk(wCss, hCss) {
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.ceil(wCss * dpr)); cv.height = Math.max(1, Math.ceil(hCss * dpr));
    const c = cv.getContext("2d"); c.scale(dpr, dpr);
    return { cv, c };
  }
  const spacingOk = (c) => "letterSpacing" in c;
  const colKey = (c) => `${c.r | 0},${c.g | 0},${c.b | 0}`;

  // o: { px, style, spacing (em), color, glow, engrave, core }
  function sprite(text, o) {
    const key = `${text}|${o.px | 0}|${o.style || ""}|${o.spacing || 0}|${colKey(o.color)}|${o.glow || 0}|${o.engrave ? 1 : 0}|${o.core || 0}`;
    let s = sprites.get(key);
    if (s) { sprites.delete(key); sprites.set(key, s); return s; }
    const font = `${o.style || ""} 400 ${Math.round(o.px)}px ${SERIF}`;
    const sp = (o.spacing || 0) * o.px;
    if (!mctx) mctx = document.createElement("canvas").getContext("2d");
    mctx.font = font; if (spacingOk(mctx)) mctx.letterSpacing = `${sp}px`;
    const tw = mctx.measureText(text).width - (spacingOk(mctx) ? sp : 0);
    const glow = o.glow || 0;
    const pad = Math.ceil(glow * 2.4 + o.px * 0.12 + 4);
    const w = Math.ceil(tw + pad * 2 + sp), h = Math.ceil(o.px * 1.45 + pad * 2);
    const { cv, c } = mk(w, h);
    c.font = font; if (spacingOk(c)) c.letterSpacing = `${sp}px`;
    c.textAlign = "left"; c.textBaseline = "middle";
    const col = U.safe(o.color);
    const x = pad, y = h / 2;
    if (glow > 0) {
      c.shadowColor = U.rgba(col, 0.8);
      c.shadowBlur = glow * 2 * dpr; c.fillStyle = U.rgba(col, 0.22); c.fillText(text, x, y);
      c.shadowBlur = glow * dpr; c.fillStyle = U.rgba(col, 0.3); c.fillText(text, x, y);
      c.shadowBlur = 0;
    }
    if (o.engrave) {
      c.fillStyle = U.rgba(col, o.core || 0.5); c.fillText(text, x, y);
      c.lineWidth = Math.max(1.1, o.px * 0.007); c.strokeStyle = U.rgba(col, 0.95); c.strokeText(text, x, y);
    } else {
      c.fillStyle = U.rgba(col, o.core || 0.92); c.fillText(text, x, y);
    }
    s = { cv, w, h, pad, tw };
    sprites.set(key, s);
    if (sprites.size > 64) sprites.delete(sprites.keys().next().value);
    return s;
  }
  function drawSprite(ctx, s, x, y, align, scale, alpha) {
    if (alpha <= 0.004) return;
    const k = scale || 1, w = s.w * k, h = s.h * k;
    const dx = align === "left" ? x - s.pad * k : align === "right" ? x - (s.pad + s.tw) * k : x - w / 2;
    ctx.globalAlpha = U.clamp(alpha);
    ctx.drawImage(s.cv, dx, y - h / 2, w, h);
    ctx.globalAlpha = 1;
  }
  function text(ctx, str, x, y, o, align, scale, alpha) {
    drawSprite(ctx, sprite(str, o), x, y, align || "center", scale, alpha);
  }

  // engraved stroke: soft halo + crisp core
  function eng(c, path, col, a, lw) {
    const cc = U.safe(col);
    path(); c.lineWidth = lw * 3.4; c.strokeStyle = U.rgba(cc, a * 0.14); c.stroke();
    c.lineWidth = lw; c.strokeStyle = U.rgba(cc, a); c.stroke();
  }
  const circ = (c, x, y, r) => () => { c.beginPath(); c.arc(x, y, r, 0, TAU); };
  const pol = (r, a) => [r * Math.sin(a), -r * Math.cos(a)]; // angle from top, clockwise
  function polyPath(c, pts) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  }
  function lineTo(c, pts) {
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  }
  function radialSprite(size, col, stops) {
    const { cv, c } = mk(size, size);
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    const cc = U.safe(col);
    for (const [p, a] of stops) g.addColorStop(p, U.rgba(cc, a));
    c.fillStyle = g; c.fillRect(0, 0, size, size);
    return cv;
  }

  // ------------------------------------------------------------------ work layout
  const WORK = () => ({ cx: 0.735 * W, cy: 0.40 * H, R: 0.27 * H });

  // ------------------------------------------------------------------ temple geometry (facade plane)
  // Built with the intact entablature on the left, then mirrored so the ruin stands broken to the
  // east (screen left), where the evening moon climbs: it is seen over the fallen columns.
  // World model for light: X = west (screen right), Z = north (toward the viewer), ground plane seen
  // obliquely (depth z maps to screen y by kz). Everything is in CSS px, scaled from H.
  function buildTemple() {
    const D = 0.06 * H;                 // lower column diameter
    const ax = 2.4 * D;                 // interaxial
    const tcx = 0.56 * W;
    const Sy = 0.625 * H;               // column bases (stylobate top)
    const tread = 0.009 * H, riser = 0.016 * H;
    const kz = 0.42;                    // ground foreshortening (depth -> screen y)
    const plat = kz * 1.2 * D;          // the stylobate floor in front of the columns, seen from above
    const Gy = Sy + plat + 2 * tread + 3 * riser; // ground at the foot of the steps
    const Hy = 0.56 * H, Bg = 0.83 * H;  // far horizon, near edge of the ground
    const hc = 5.2 * D;
    const capTop = Sy - hc;
    const shaftTop = capTop + 0.4 * D;
    const r0 = D / 2, r1 = 0.79 * r0;
    const colX = []; for (let i = 0; i < 6; i++) colX.push(tcx + (i - 2.5) * ax);
    const rnd = U.rng(7071);
    const M = (x) => 2 * tcx - x, mp = (p) => [M(p[0]), p[1]];

    const rAt = (y) => { const u = U.clamp((Sy - y) / (Sy - shaftTop)); return r0 + (r1 - r0) * u + 0.035 * r0 * Math.sin(Math.PI * u); };
    const fracs = [0.24, 1, 0.58, 1, 1, 1];
    const drumH = (Sy - shaftTop) / 5;
    const cols = colX.map((x, i) => {
      const f = fracs[i], cap = f >= 1;
      const yt = cap ? shaftTop : Sy - (Sy - shaftTop) * f;
      const left = [], right = [];
      for (let k = 0; k <= 14; k++) { const y = U.lerp(Sy, yt, k / 14), r = rAt(y); left.push([x - r, y]); right.push([x + r, y]); }
      let jag = null, back = null, crack = null;
      if (!cap) {
        const rt = rAt(yt), tilt = (i === 2 ? 1 : -1) * 0.35 * D;
        jag = []; back = [];
        for (let k = 0; k <= 8; k++) {
          const u = k / 8, xx = x - rt + 2 * rt * u;
          const base = yt + tilt * (u - 0.5);
          const j = (k === 0 || k === 8) ? 0 : (rnd() - 0.5) * 0.3 * D;
          jag.push([xx, base + j]);
          back.push([xx, base - rt * 0.32 * Math.sin(Math.PI * u) + (k === 0 || k === 8 ? 0 : (rnd() - 0.5) * 0.18 * D)]);
        }
        // chipped edges: bites out of the silhouette just under the break
        for (const side of [left, right]) {
          const n = side.length, sg = side === left ? 1 : -1;
          side[n - 2][0] += sg * (0.05 + 0.08 * rnd()) * D; side[n - 3][0] += sg * (0.02 + 0.05 * rnd()) * D;
          side[n - 1] = [side[n - 1][0], side === left ? jag[0][1] : jag[8][1]];
        }
        // a crack running down from the break
        crack = []; let cx = x + (rnd() - 0.3) * rt * 0.8, cy = jag[4][1] + 2;
        const len = (Sy - yt) * (0.35 + 0.3 * rnd());
        crack.push([cx, cy]);
        while (cy < jag[4][1] + len) { cx += (rnd() - 0.5) * 0.14 * D; cx = U.clamp(cx, x - rt * 0.85, x + rt * 0.85); cy += (0.08 + 0.12 * rnd()) * D; crack.push([cx, cy]); }
      }
      const sil = left.slice();
      if (cap) sil.push([x - 0.62 * D, shaftTop - 0.2 * D], [x - 0.62 * D, capTop], [x + 0.62 * D, capTop], [x + 0.62 * D, shaftTop - 0.2 * D]);
      else for (const p of back) sil.push(p);
      for (let k = right.length - 1; k >= 0; k--) sil.push(right[k]);
      const joints = []; for (let j = 1; j < 5; j++) { const y = Sy - j * drumH * (0.92 + 0.16 * rnd()); if (y > yt + 0.15 * D) joints.push(y); }
      return { x, i, cap, yt, left, right, jag, back, sil, crack, joints };
    });

    // (unmirrored frame) entablature over c0..c2, broken in a stepped line to the right
    const ux = (i) => colX[i];
    const xL = ux(0) - 0.62 * D;
    const yArch = capTop - 0.72 * D, yFr = capTop - 1.44 * D, yCor = capTop - 1.74 * D;
    const xA = ux(2) + 0.62 * D + 0.32 * ax, xF = ux(2) + 0.3 * ax, xC = ux(2) + 0.12 * ax;
    const jagV = (x, y0, y1, n, amp) => { const p = []; for (let k = 0; k <= n; k++) { const u = k / n; p.push([x + (k === 0 || k === n ? 0 : (rnd() - 0.5) * amp), U.lerp(y0, y1, u)]); } return p; };
    const brA = jagV(xA, capTop, yArch, 5, 0.24 * D);
    const brF = jagV(xF, yArch, yFr, 5, 0.24 * D);
    const brC = jagV(xC, yFr, yCor, 3, 0.14 * D);
    const cornL = xL - 0.18 * D;
    // a chunk missing from the corner of the architrave, low on the outer face
    const ent = [[xL, capTop - 0.0], [xA, capTop], ...brA.slice(1), [xA, yArch], ...brF, [xF, yFr], ...brC, [cornL, yCor], [cornL, yFr], [xL, yFr], [xL, yArch - 0.1 * D], [xL + 0.16 * D, yArch + 0.12 * D], [xL + 0.05 * D, capTop - 0.25 * D]];
    const slope = Math.tan(12.5 * RAD);
    const xP = ux(2) - 0.12 * ax;
    const yRake = (x) => yCor - (x - cornL) * slope;
    const rakeTh = 0.3 * D;
    const brP = jagV(xP, yRake(xP) - rakeTh, yCor, 7, 0.32 * D);
    const ped = [[cornL, yCor], [cornL, yRake(cornL) - rakeTh], ...brP];
    // detail lines (unmirrored)
    const lines = [], faint = [], dots = [];
    lines.push([[xL, yArch], [Math.min(xA, xF), yArch]]);
    lines.push([[xL + 0.16 * D, yArch + 0.1 * D], [xA - 2, yArch + 0.1 * D]]);              // taenia
    lines.push([[cornL, yFr + 0.1 * D], [xC, yFr + 0.1 * D]]);                               // corona soffit
    lines.push([[cornL, yCor + 0.08 * D], [xC, yCor + 0.08 * D]]);                           // cymatium
    lines.push([[cornL + 0.2 * D, yRake(cornL + 0.2 * D)], [xP - 0.1 * D, yRake(xP - 0.1 * D)]]);
    lines.push([[cornL + 0.3 * D, yRake(cornL + 0.3 * D) + 0.1 * D], [xP - 0.12 * D, yRake(xP - 0.12 * D) + 0.1 * D]]);
    // architrave + frieze block joints at the column centres
    for (const i of [1, 2]) { lines.push([[ux(i), capTop], [ux(i), yArch]]); faint.push([[ux(i) - 0.5 * ax, yArch], [ux(i) - 0.5 * ax, yFr + 0.1 * D]]); }
    // tympanum courses
    for (let k = 1; k <= 2; k++) {
      const y = yCor - k * 0.32 * D, xEnd = Math.min(xP - 0.1 * D, cornL + (yCor - y - rakeTh) / slope);
      if (xEnd > cornL + 0.6 * D) {
        faint.push([[cornL + 0.4 * D, y], [xEnd, y]]);
        for (let x = cornL + 0.9 * D + k * 0.4 * D; x < xEnd - 0.2 * D; x += 1.3 * D) faint.push([[x, y], [x, y + 0.32 * D]]);
      }
    }
    const tw = 0.5 * D;
    const trig = [];
    for (let k = 0; k < 12; k++) {
      const x = k === 0 ? xL + tw / 2 : ux(0) + k * ax / 2;
      if (x + tw / 2 >= xF - 0.12 * D) break;
      trig.push(x);
      lines.push([[x - tw / 2, yArch], [x - tw / 2, yFr], [x + tw / 2, yFr], [x + tw / 2, yArch]]);
      for (const f2 of [1 / 3, 2 / 3]) {
        const gx = x - tw / 2 + tw * f2;
        lines.push([[gx, yFr + 0.08 * D], [gx, yArch - 0.02 * D]]);
        faint.push([[gx - 0.05 * D, yFr + 0.1 * D], [gx - 0.05 * D, yArch - 0.04 * D]]);
      }
      lines.push([[x - tw / 2, yArch + 0.1 * D], [x - tw / 2, yArch + 0.16 * D], [x + tw / 2, yArch + 0.16 * D], [x + tw / 2, yArch + 0.1 * D]]); // regula
      for (let g = 0; g < 6; g++) dots.push([x - tw / 2 + tw * (g + 0.5) / 6, yArch + 0.21 * D, 0.032 * D]);              // guttae
      // mutule over each triglyph and metope, on the cornice soffit
      for (const mx of [x, x + ax / 4]) {
        if (mx + 0.22 * D > xC) continue;
        lines.push([[mx - 0.22 * D, yFr], [mx - 0.22 * D, yFr + 0.07 * D], [mx + 0.22 * D, yFr + 0.07 * D], [mx + 0.22 * D, yFr]]);
        for (let g = 0; g < 3; g++) dots.push([mx - 0.15 * D + 0.15 * D * g, yFr + 0.1 * D, 0.025 * D]);
      }
    }
    // worn relief in two metopes: a rearing horse and a standing figure, half erased
    const reliefs = [];
    if (trig.length >= 3) {
      const m1 = (trig[0] + trig[1]) / 2, m2 = (trig[1] + trig[2]) / 2, my = (yFr + yArch) / 2, s = 0.3 * D;
      reliefs.push([[m1 - s * 0.9, my + s * 0.7], [m1 - s * 0.6, my + s * 0.1], [m1 - s * 0.1, my - s * 0.15], [m1 + s * 0.5, my - s * 0.1], [m1 + s * 0.8, my - s * 0.75]]);
      reliefs.push([[m1 + s * 0.5, my - s * 0.1], [m1 + s * 0.7, my + s * 0.75]]);
      reliefs.push([[m1 - s * 0.1, my - s * 0.15], [m1 - s * 0.25, my + s * 0.75]]);
      reliefs.push([[m1 + s * 0.8, my - s * 0.75], [m1 + s * 1.0, my - s * 0.55]]);
      reliefs.push([[m2, my - s * 0.85], [m2 + s * 0.1, my - s * 0.2], [m2 - s * 0.05, my + s * 0.8]]);
      reliefs.push([[m2 + s * 0.1, my - s * 0.45], [m2 + s * 0.6, my - s * 0.15], [m2 + s * 0.75, my - s * 0.55]]);
      reliefs.push([[m2 + s * 0.1, my - s * 0.2], [m2 - s * 0.5, my + s * 0.05]]);
    }
    // the architrave block left on a lone column, slightly askew
    const bx0 = ux(4) - 0.62 * D - 0.22 * ax, bx1 = ux(4) + 0.62 * D + 0.06 * ax;
    const rot = -2.2 * RAD, pcx = ux(4), pcy = capTop;
    const rp = (x, y) => { const dx = x - pcx, dy = y - pcy; return [pcx + dx * Math.cos(rot) - dy * Math.sin(rot), pcy + dx * Math.sin(rot) + dy * Math.cos(rot)]; };
    const brB = jagV(bx0, capTop, yArch, 4, 0.2 * D).map(([x, y]) => rp(x, y));
    const block = [rp(bx1, capTop), ...brB, rp(bx1, yArch)];
    lines.push([rp(bx0 + 0.08 * D, yArch + 0.1 * D), rp(bx1, yArch + 0.1 * D)]);

    // fallen drums (unmirrored)
    const drumsU = [
      { x0: ux(4) + 0.5 * ax - 0.5 * D, len: 0.92 * D, d: 0.86 * D, yb: Sy + plat * 0.45, endLeft: true },
      { x0: ux(5) + 0.42 * ax, len: 1.15 * D, d: 0.98 * D, yb: Gy + 0.045 * H, endLeft: true },
      { x0: ux(0) - 0.62 * ax, len: 0.7 * D, d: 0.8 * D, yb: Gy + 0.06 * H, endLeft: false },
    ];
    const drums = drumsU.map((d) => ({ ...d, x0: M(d.x0 + d.len), endLeft: !d.endLeft }));
    // stylobate steps (k = 0 is the floor the columns stand on)
    const halfW = (colX[5] - colX[0]) / 2 + 0.78 * D;
    const steps = [];
    for (let k = 0, y0 = Sy; k < 3; k++) {
      const hw = halfW + k * 0.34 * D, tr = k === 0 ? plat : tread;
      // worn front edge: small dips and chips
      const edge = []; for (let x = tcx - hw; x <= tcx + hw + 0.1; x += 0.25 * D) edge.push([Math.min(x, tcx + hw), y0 + tr + (rnd() < 0.18 ? (0.5 + rnd()) * 0.04 * D : 0)]);
      const jo = []; let x = tcx - hw + (0.4 + 0.6 * rnd()) * D; while (x < tcx + hw - 0.3 * D) { jo.push(x); x += (1.0 + 0.6 * rnd()) * D; }
      steps.push({ y0, y1: y0 + tr, y2: y0 + tr + riser, x0: tcx - hw, x1: tcx + hw, edge, jo });
      y0 += tr + riser;
    }
    // rubble: fallen blocks with three visible faces
    const blk = (x0, yb, w, h, dep, tilt) => {
      const c = Math.cos(tilt * RAD), s2 = Math.sin(tilt * RAD);
      const p = (dx, dy) => [x0 + dx * c - dy * s2, yb + dx * s2 + dy * c];
      const ox = dep * 0.22, oy = -dep * kz;
      const BL = p(0, 0), BR = p(w, 0), TR = p(w, -h), TL = p(0, -h);
      const sh = (q) => [q[0] + ox, q[1] + oy];
      return { BL, BR, TR, TL, TR2: sh(TR), TL2: sh(TL), BR2: sh(BR), sil: [BL, BR, sh(BR), sh(TR), sh(TL), TL], base: yb };
    };
    const rubble = [
      blk(tcx + halfW + 0.72 * ax, Gy + 0.03 * H, 1.9 * D, 0.62 * D, 0.8 * D, -4),
      blk(tcx - halfW - 1.75 * ax, Gy + 0.085 * H, 0.95 * D, 0.5 * D, 0.7 * D, 6),
      blk(colX[4] - 0.25 * ax, steps[1].y1 + 0.004 * H, 0.5 * D, 0.28 * D, 0.4 * D, 0),
      blk(tcx + 0.95 * ax, Gy + 0.072 * H, 1.1 * D, 0.34 * D, 0.6 * D, -7),
      blk(tcx - halfW + 0.25 * ax, Gy + 0.088 * H, 0.6 * D, 0.32 * D, 0.5 * D, 3),
    ];
    const pebbles = []; for (let k = 0; k < 14; k++) pebbles.push([U.lerp(tcx - halfW - 2 * ax, tcx + halfW + 2 * ax, rnd()), U.lerp(Gy + 0.01 * H, Bg - 0.02 * H, rnd()), (0.06 + 0.1 * rnd()) * D]);

    // ivy on the broken column and the stump
    const ivy = [];
    for (const [ci, h0, ph0] of [[2, 0.95, 0.6], [0, 1.0, 2.2]]) {
      const c = cols[ci], top = c.yt + 0.1 * D, hv = (Sy - top) * h0;
      const vine = [], leaves = [];
      for (let k = 0; k <= 60; k++) {
        const s = k / 60, y = Sy - s * hv, ph = ph0 + s * TAU * 1.4 + Math.sin(s * 9) * 0.3;
        const r = rAt(y) * 1.02;
        vine.push([c.x + r * Math.sin(ph), y, Math.cos(ph)]);
        if (k % 2 === 1 && Math.cos(ph) > -0.1) { const side = k % 4 === 1 ? 1 : -1; leaves.push([c.x + r * Math.sin(ph) + side * (0.06 + 0.1 * rnd()) * D, y + (rnd() - 0.5) * 0.12 * D, (0.06 + 0.06 * rnd()) * D, side * (0.5 + 0.6 * rnd())]); }
      }
      // a few leaves trailing over the floor at the base
      for (let k = 0; k < 4; k++) leaves.push([c.x + (rnd() - 0.2) * 0.9 * D, Sy + (0.1 + 0.6 * rnd()) * plat, (0.09 + 0.05 * rnd()) * D, (rnd() - 0.5) * 2]);
      ivy.push({ vine, leaves });
    }
    // grass tufts and wildflowers in the cracks
    const tufts = [];
    const tuft = (x, y, s, flower) => {
      const blades = []; const n = 4 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 1.3, l = s * (0.5 + 0.6 * rnd()); blades.push([x + (rnd() - 0.5) * s * 0.3, y, x + Math.cos(a) * l, y + Math.sin(a) * l, (rnd() - 0.5) * s * 0.4]); }
      tufts.push({ blades, flower: flower ? [x + (rnd() - 0.5) * s * 0.4, y - s * (1.0 + 0.4 * rnd()), s * 0.13] : null });
    };
    for (let k = 0; k < 12; k++) tuft(U.lerp(steps[2].x0, steps[2].x1, rnd()), Gy + rnd() * 0.004 * H, (0.22 + 0.2 * rnd()) * D, rnd() < 0.35);
    for (const c of cols) if (rnd() < 0.75) tuft(c.x + (rnd() < 0.5 ? -1 : 1) * (r0 + 0.05 * D), Sy + 0.15 * plat, (0.18 + 0.15 * rnd()) * D, rnd() < 0.3);
    for (const st of steps) for (const jx of st.jo) if (rnd() < 0.22) tuft(jx, st.y1, (0.15 + 0.12 * rnd()) * D, rnd() < 0.4);
    for (const d of drums) tuft(d.x0 + d.len * (0.2 + 0.6 * rnd()), d.yb + 1, (0.2 + 0.15 * rnd()) * D, true);
    for (const b of rubble.slice(0, 2)) tuft(b.BL[0] + 0.1 * D, b.BL[1] + 1, 0.25 * D, rnd() < 0.5);

    // cypresses (behind the temple plane): a pair to the west, one lone tree far to the east, clear of
    // the band where the evening moon rises
    const cyp = [
      { x: colX[5] + 1.55 * ax, h: 0.46 * H, w: 0.062 * H, seed: 37 },
      { x: colX[5] + 1.55 * ax + 0.06 * H, h: 0.34 * H, w: 0.052 * H, seed: 41 },
      { x: 0.085 * W, h: 0.36 * H, w: 0.056 * H, seed: 11 },
    ].map((cp) => buildCypress(cp, Hy + 0.035 * H));
    const olives = [buildOlive(0.235 * W, Hy + 0.03 * H, 0.13 * H, 5), buildOlive(0.835 * W, Hy + 0.018 * H, 0.085 * H, 9)];

    // upward-facing edges where snow settles (final, mirrored frame)
    const tops = [
      [mp([cornL, yCor]), mp([xC, yCor])],
      [mp([cornL + 0.1 * D, yRake(cornL + 0.1 * D) - rakeTh]), mp([xP, yRake(xP) - rakeTh])],
      [mp(brB[brB.length - 1]), mp(rp(bx1, yArch))],
    ];
    for (const st of steps) tops.push([[st.x0, st.y0], [st.x1, st.y0]]);
    for (const c of cols) if (!c.cap) tops.push(c.back);
    for (const d of drums) tops.push([[d.x0 + d.d * 0.1, d.yb - d.d], [d.x0 + d.len, d.yb - d.d]]);
    for (const b of rubble) tops.push([b.TL, b.TR, b.TR2, b.TL2]);

    T = { D, ax, tcx, Sy, Gy, Hy, Bg, tread, riser, plat, hc, capTop, shaftTop, r0, r1, kz, colX, cols, rAt,
      yArch, yFr, yCor, ent: ent.map(mp), ped: ped.map(mp), block: block.map(mp),
      lines: lines.map((l) => l.map(mp)), faint: faint.map((l) => l.map(mp)), dots: dots.map((d) => [M(d[0]), d[1], d[2]]),
      reliefs: reliefs.map((l) => l.map(mp)), corniceTop: [mp([cornL, yCor]), mp([xC, yCor])],
      drums, steps, rubble, pebbles, ivy, tufts, cyp, olives, halfW, tops };
  }

  function buildCypress(cp, yb) {
    const rnd = U.rng(cp.seed);
    const n = 30, left = [], right = [];
    const hwAt = (u) => (u < 0.04 ? cp.w * 0.07 : cp.w / 2 * Math.pow(1 - u, 0.8) * (0.55 + 0.45 * U.smoothstep(0, 0.22, u)));
    for (let k = 0; k <= n; k++) {
      const u = k / n, y = yb - cp.h * u, hw = hwAt(u);
      const jl = 1 + (k && k < n ? (rnd() - 0.4) * 0.26 : 0), jr = 1 + (k && k < n ? (rnd() - 0.4) * 0.26 : 0);
      left.push([cp.x - hw * jl, y]); right.push([cp.x + hw * jr, y]);
    }
    right[n] = left[n] = [cp.x + cp.w * 0.02, yb - cp.h * 1.02];
    const sil = left.concat(right.slice().reverse());
    // layered flame-shaped tufts, top rows first so lower ones overlap them
    const tufts = [];
    const rows = Math.round(cp.h / (cp.w * 0.2));
    for (let k = rows - 1; k >= 1; k--) {
      const u = k / rows, y = yb - cp.h * (0.04 + 0.92 * u);
      const hw = hwAt(0.04 + 0.92 * u) * 0.92;
      const m = Math.max(1, Math.round(hw * 2 / (cp.w * 0.2)));
      for (let j = 0; j < m; j++) {
        const s = m === 1 ? (rnd() - 0.5) * 0.4 : -0.85 + 1.7 * (j + 0.3 + 0.4 * rnd()) / m;
        const sz = cp.w * (0.17 + 0.07 * rnd()) * (0.55 + 0.45 * (1 - u));
        tufts.push({ x: cp.x + s * hw, y: y + (rnd() - 0.5) * cp.w * 0.06, s: U.clamp(s, -1, 1), w: sz * 0.55, h: sz * 1.35, lean: (s * 0.25 + (rnd() - 0.5) * 0.3) * sz });
      }
    }
    return { ...cp, yb, sil, tufts, left, right };
  }

  function buildOlive(x, yb, h, seed) {
    const rnd = U.rng(seed * 101);
    const tw = h * 0.07;
    const trunkL = [], trunkR = [];
    for (let k = 0; k <= 6; k++) {
      const u = k / 6, y = yb - u * h * 0.42, sway = Math.sin(u * 4 + seed) * h * 0.04;
      const w2 = tw * (1 - 0.35 * u) * (k === 0 ? 1.5 : 1);
      trunkL.push([x + sway - w2, y]); trunkR.push([x + sway + w2, y]);
    }
    const fork = [x + Math.sin(4 + seed) * h * 0.04, yb - h * 0.42];
    const branches = [];
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k - 1) * 0.65 + (rnd() - 0.5) * 0.3, l = h * (0.22 + 0.1 * rnd());
      branches.push([fork, [fork[0] + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * h * 0.05, fork[1] + Math.sin(a) * l * 0.5], [fork[0] + Math.cos(a) * l, fork[1] + Math.sin(a) * l]]);
    }
    const clumps = [];
    const cw = h * 0.75, cy0 = yb - h * 0.7;
    for (let k = 0; k < 7; k++) {
      const u = k / 6;
      clumps.push({ x: x + (u - 0.5) * cw * (0.8 + 0.3 * rnd()), y: cy0 + (rnd() - 0.5) * h * 0.22 - Math.sin(u * Math.PI) * h * 0.12, rx: h * (0.15 + 0.08 * rnd()), ry: h * (0.1 + 0.05 * rnd()), ph: rnd() * 6 });
    }
    clumps.sort((a, b2) => a.y - b2.y);
    const flecks = [];
    for (const c of clumps) for (let k = 0; k < 9; k++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * 0.8; flecks.push([c.x + Math.cos(a) * c.rx * r, c.y + Math.sin(a) * c.ry * r, (rnd() - 0.5) * 1.2, h * (0.03 + 0.02 * rnd())]); }
    const trunk = trunkL.concat(trunkR.slice().reverse());
    return { x, yb, h, trunk, trunkL, trunkR, branches, clumps, flecks };
  }
  const clumpPath = (c, k) => {
    c.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a = i / 28 * TAU, bump = 1 + 0.09 * Math.sin(a * 7 + k.ph) + 0.05 * Math.sin(a * 13 + k.ph * 2);
      const x = k.x + Math.cos(a) * k.rx * bump, y = k.y + Math.sin(a) * k.ry * bump;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
  };
  const flamePath = (c, tf) => {
    c.beginPath();
    c.moveTo(tf.x - tf.w, tf.y);
    c.quadraticCurveTo(tf.x - tf.w * 0.9, tf.y - tf.h * 0.6, tf.x + tf.lean, tf.y - tf.h);
    c.quadraticCurveTo(tf.x + tf.w * 0.9, tf.y - tf.h * 0.6, tf.x + tf.w, tf.y);
    c.quadraticCurveTo(tf.x, tf.y + tf.h * 0.12, tf.x - tf.w, tf.y);
    c.closePath();
  };
  const leafPath = (c, x, y, s, a) => {
    // an ivy leaf: three soft lobes
    c.save(); c.translate(x, y); c.rotate(a);
    c.beginPath(); c.moveTo(0, s * 0.45);
    c.quadraticCurveTo(-s * 0.9, s * 0.3, -s * 0.55, -s * 0.15);
    c.quadraticCurveTo(-s * 0.35, -s * 0.75, 0, -s * 0.6);
    c.quadraticCurveTo(s * 0.35, -s * 0.75, s * 0.55, -s * 0.15);
    c.quadraticCurveTo(s * 0.9, s * 0.3, 0, s * 0.45);
    c.closePath(); c.restore();
  };

  // ------------------------------------------------------------------ static linework (baked once per size)
  // Light-independent lines in a neutral white, alpha carrying the weight. Tinted by the light at
  // scene build. Objects are drawn far to near; each one first erases what it hides.
  function bakeStatic() {
    const c = L.static.c, D = T.D, u = LWU;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    c.lineJoin = "round"; c.lineCap = "round";
    const st = (a, lw) => { c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = (lw || 1) * u; c.stroke(); };
    const eng2 = (a, lw) => { st(a * 0.12, (lw || 1) * 3); st(a, lw); };
    const hide = (pts) => { c.globalCompositeOperation = "destination-out"; polyPath(c, pts); c.fillStyle = "#000"; c.fill(); c.globalCompositeOperation = "source-over"; };
    const hidePath = () => { c.globalCompositeOperation = "destination-out"; c.fillStyle = "#000"; c.fill(); c.globalCompositeOperation = "source-over"; };

    // far hills, with a little slanted hatching under the crests
    for (const [pts, a] of [[L.hillB, 0.28], [L.hillA, 0.5]]) { c.beginPath(); lineTo(c, pts); st(a, 1); }
    {
      const rnd = U.rng(77);
      c.beginPath();
      for (let k = 0; k < L.hillA.length - 1; k += 2) {
        if (rnd() < 0.45) continue;
        const [x, y] = L.hillA[k];
        for (let q = 0; q < 3; q++) { const yy = y + (0.004 + q * 0.005) * H; if (yy > T.Hy - 1) break; c.moveTo(x + q * 2, yy); c.lineTo(x + q * 2 + 0.006 * H, yy + 0.002 * H); }
      }
      st(0.16, 1);
    }
    // olives (far, faint)
    for (const o of T.olives) {
      for (const k of o.clumps) { clumpPath(c, k); hidePath(); clumpPath(c, k); st(0.42, 1); }
      hide(o.trunk); c.beginPath(); lineTo(c, o.trunkL); lineTo(c, o.trunkR); st(0.42, 1);
      c.beginPath(); for (const br of o.branches) { c.moveTo(br[0][0], br[0][1]); c.quadraticCurveTo(br[1][0], br[1][1], br[2][0], br[2][1]); } st(0.35, 1);
      c.beginPath(); for (const [x, y, a, l] of o.flecks) { c.moveTo(x - Math.cos(a) * l / 2, y - Math.sin(a) * l / 2); c.lineTo(x + Math.cos(a) * l / 2, y + Math.sin(a) * l / 2); } st(0.22, 1);
    }
    // cypresses: outline, then layered flame tufts
    for (const cp of T.cyp) {
      hide(cp.sil); polyPath(c, cp.sil); eng2(0.75, 1.1);
      for (const tf of cp.tufts) { flamePath(c, tf); hidePath(); flamePath(c, tf); st(0.42, 1); }
      // the trunk at the foot
      c.beginPath(); c.moveTo(cp.x - cp.w * 0.06, cp.yb); c.lineTo(cp.x - cp.w * 0.05, cp.yb - cp.h * 0.05); c.moveTo(cp.x + cp.w * 0.06, cp.yb); c.lineTo(cp.x + cp.w * 0.05, cp.yb - cp.h * 0.05); st(0.6, 1);
    }

    // stylobate and steps: worn edges, staggered joints, chips
    for (const s of T.steps) {
      c.beginPath(); c.moveTo(s.x0, s.y0); c.lineTo(s.x1, s.y0); eng2(0.85, 1.1);
      c.beginPath(); lineTo(c, s.edge); eng2(0.85, 1.1);
      c.beginPath(); c.moveTo(s.x0, s.y0); c.lineTo(s.x0, s.y2); c.moveTo(s.x1, s.y0); c.lineTo(s.x1, s.y2); eng2(0.8, 1.1);
      c.beginPath(); for (const x of s.jo) { c.moveTo(x, s.y1 + 1); c.lineTo(x, s.y2 - 1); c.moveTo(x + 0.4 * D, s.y0 + 1); c.lineTo(x + 0.4 * D - 0.05 * D, s.y1 - 1); } st(0.45, 1);
    }
    { const s = T.steps[2]; c.beginPath(); c.moveTo(s.x0, s.y2); c.lineTo(s.x1, s.y2); eng2(0.85, 1.1); }

    // columns
    for (const col of T.cols) {
      hide(col.sil);
      c.beginPath(); lineTo(c, col.left); eng2(0.95, 1.2);
      c.beginPath(); lineTo(c, col.right); eng2(0.95, 1.2);
      // drum joints: front halves of the joint circles, seen a little from above
      c.beginPath();
      for (const y of col.joints) { const r = T.rAt(y); c.moveTo(col.x - r, y); c.ellipse(col.x, y, r, r * 0.1, 0, Math.PI, 0, true); }
      st(0.4, 1);
      if (col.cap) {
        const x = col.x, s2 = T.shaftTop, ct = T.capTop;
        c.beginPath();
        for (const dy of [0.04, 0.08, 0.12]) { const r = T.rAt(s2 + dy * D); c.moveTo(x - r, s2 + dy * D); c.ellipse(x, s2 + dy * D, r, r * 0.08, 0, Math.PI, 0, true); }
        const rn = T.rAt(s2 + 0.3 * D); c.moveTo(x - rn, s2 + 0.3 * D); c.ellipse(x, s2 + 0.3 * D, rn, rn * 0.1, 0, Math.PI, 0, true);
        st(0.6, 1);
        c.beginPath();
        c.moveTo(x - T.r1, s2); c.quadraticCurveTo(x - 0.66 * D, s2 - 0.04 * D, x - 0.6 * D, s2 - 0.2 * D);
        c.lineTo(x + 0.6 * D, s2 - 0.2 * D);
        c.quadraticCurveTo(x + 0.66 * D, s2 - 0.04 * D, x + T.r1, s2);
        eng2(0.95, 1.2);
        c.beginPath(); c.rect(x - 0.62 * D, ct, 1.24 * D, s2 - 0.2 * D - ct); eng2(0.95, 1.2);
      } else {
        c.beginPath(); lineTo(c, col.jag); eng2(0.9, 1.1);
        c.beginPath(); lineTo(c, col.back); eng2(0.75, 1.0);
        c.beginPath(); for (let m = 1; m < col.jag.length - 1; m++) { const a0 = col.jag[m], a1 = col.back[m]; c.moveTo(a0[0], a0[1]); c.lineTo(U.lerp(a0[0], a1[0], 0.7), U.lerp(a0[1], a1[1], 0.7)); } st(0.4, 1);
        if (col.crack) { c.beginPath(); lineTo(c, col.crack); st(0.7, 1); c.beginPath(); lineTo(c, col.crack.map(([x, y]) => [x + 1.4 * u, y + 0.6 * u])); st(0.22, 1); }
      }
    }

    // entablature, pediment fragment, the lone block
    for (const p of [T.ent, T.ped, T.block]) hide(p);
    for (const p of [T.ent, T.ped, T.block]) { polyPath(c, p); eng2(0.95, 1.2); }
    c.beginPath(); for (const l of T.lines) lineTo(c, l); st(0.75, 1);
    c.beginPath(); for (const l of T.faint) lineTo(c, l); st(0.35, 1);
    c.beginPath(); for (const [x, y, r] of T.dots) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); } c.fillStyle = "rgba(255,255,255,0.55)"; c.fill();
    // worn relief: dashed, half there
    c.setLineDash([3 * u, 2.5 * u]); c.beginPath(); for (const l of T.reliefs) lineTo(c, l); st(0.45, 1.1); c.setLineDash([]);
    // chips along the cornice and architrave edges
    {
      const rnd = U.rng(99); c.beginPath();
      const [a, b2] = T.corniceTop;
      for (let k = 0; k < 7; k++) { const x = U.lerp(a[0], b2[0], 0.05 + 0.9 * rnd()), y = a[1]; c.moveTo(x - 0.06 * D, y); c.lineTo(x, y + 0.07 * D); c.lineTo(x + 0.05 * D, y); }
      st(0.6, 1);
    }

    // fallen drums
    for (const d of T.drums) {
      const x1 = d.x0 + d.len, ry = d.d / 2, rx = d.d * 0.22, cy = d.yb - ry;
      const ex = d.endLeft ? d.x0 : x1, fx = d.endLeft ? x1 : d.x0;
      c.globalCompositeOperation = "destination-out"; c.fillStyle = "#000";
      c.beginPath(); c.rect(d.x0, d.yb - d.d, d.len, d.d); c.fill(); c.beginPath(); c.ellipse(ex, cy, rx, ry, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(fx, cy, rx, ry, 0, 0, TAU); c.fill();
      c.globalCompositeOperation = "source-over";
      c.beginPath(); c.moveTo(d.x0, d.yb - d.d); c.lineTo(x1, d.yb - d.d); c.moveTo(d.x0, d.yb); c.lineTo(x1, d.yb);
      c.moveTo(fx, d.yb - d.d); c.ellipse(fx, cy, rx, ry, 0, -Math.PI / 2, Math.PI / 2, !d.endLeft); eng2(0.85, 1.1);
      c.beginPath(); c.ellipse(ex, cy, rx, ry, 0, 0, TAU); eng2(0.9, 1.1);
      c.beginPath();
      for (let k = 0; k < 20; k++) { const q = k / 20 * TAU; c.moveTo(ex + Math.cos(q) * rx, cy + Math.sin(q) * ry); c.lineTo(ex + Math.cos(q) * rx * 0.86, cy + Math.sin(q) * ry * 0.86); }
      c.moveTo(ex + rx * 0.25, cy); c.arc(ex, cy, rx * 0.25, 0, TAU);
      st(0.5, 1);
    }
    // rubble blocks
    for (const b of T.rubble) {
      hide(b.sil);
      polyPath(c, b.sil); eng2(0.85, 1.1);
      c.beginPath(); c.moveTo(b.TL[0], b.TL[1]); c.lineTo(b.TR[0], b.TR[1]); c.lineTo(b.BR[0], b.BR[1]); c.moveTo(b.TR[0], b.TR[1]); c.lineTo(b.TR2[0], b.TR2[1]); st(0.75, 1);
    }
    c.beginPath(); for (const [x, y, r] of T.pebbles) { c.moveTo(x + r, y); c.ellipse(x, y, r, r * 0.55, 0, 0, TAU); } st(0.45, 1);
  }

  // ------------------------------------------------------------------ the scene (cached by light)
  function paintScene(Ls) {
    const s = L.scene.c, D = T.D, u = LWU;
    s.setTransform(dpr, 0, 0, dpr, 0, 0); s.clearRect(0, 0, W, H);
    s.globalCompositeOperation = "source-over"; s.globalAlpha = 1; s.lineJoin = "round"; s.lineCap = "butt";
    const litCol = Ls.warm ? U.mix(C.candle, C.straw, 0.35) : C.bone;
    const I = Ls.I, amb = Ls.amb;
    const src = Ls.src && I > 0.02 ? Ls.src : null;
    const alt = src ? src.alt : 0, Az = src ? src.az * RAD : 0;
    const ca = Math.cos(Math.max(0, alt) * RAD);
    const sinA = Math.sin(Az), cosA = Math.cos(Az);
    const lamFront = src ? Math.max(0, cosA * ca) : 0;
    const lamTop = src ? Math.sin(U.clamp(alt, 0, 90) * RAD) * 0.7 + 0.3 * U.smoothstep(-1, 6, alt) : 0;
    const rim = src ? Math.max(0, -cosA) * I : 0;
    const outCol = U.mix(C.slate, litCol, U.clamp(0.25 + 0.55 * I + 0.25 * Ls.warm * I));
    const outA = U.clamp(0.6 + 0.2 * amb + 0.16 * I);
    const lc = U.safe(litCol), oc = U.safe(outCol);
    const stroke = (col, a, lw) => { s.strokeStyle = U.rgba(col, U.clamp(a)); s.lineWidth = (lw || 1) * u; s.stroke(); };
    const lamAt = (th) => (src ? Math.max(0, Math.cos(th + Az) * ca) : 0);

    // ---- surfaces lit from above: stippled ground, step treads and risers
    const gLit = 0.07 + 0.12 * amb + 0.42 * I * (0.6 + 0.4 * lamTop);
    {
      const rnd = U.rng(313);
      s.save();
      s.beginPath(); s.rect(0, T.Hy, W, T.Bg - T.Hy + 2);
      const st2 = T.steps[2];
      s.rect(st2.x1, T.Sy - 1, st2.x0 - st2.x1, T.Gy - T.Sy + 1);
      s.clip("evenodd");
      // fine stipple, denser toward the viewer and the temple; four alpha buckets, one fill each
      const N = Math.round(12000 * (W * H) / (1600 * 900));
      const buckets = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      const ds = 0.9 * u;
      for (let k = 0; k < N; k++) {
        const v = Math.pow(rnd(), 0.75), y = T.Hy + (T.Bg - T.Hy) * v, x = rnd() * W;
        const dxm = (x - T.tcx) / (0.45 * W), env = Math.exp(-dxm * dxm) * (1 - U.smoothstep(0.85, 1, v));
        const p = env * (0.4 + 0.6 * v);
        if (rnd() > p) continue;
        buckets[Math.min(3, Math.floor(rnd() * 4))].rect(x, y, ds, ds);
      }
      for (let q = 0; q < 4; q++) { s.fillStyle = U.rgba(lc, gLit * (0.3 + 0.17 * q)); s.fill(buckets[q]); }
      // a few long engraved strokes give the plane its lie
      s.beginPath();
      for (let k = 1; k <= 16; k++) {
        const v = k / 16, y = T.Hy + (T.Bg - T.Hy) * Math.pow(v, 1.4);
        let x = -rnd() * 0.05 * W;
        while (x < W) { const len = W * (0.01 + 0.03 * rnd()), gap = W * (0.02 + 0.06 * rnd()); const dxm = (x - T.tcx) / (0.42 * W); if (rnd() < Math.exp(-dxm * dxm)) { s.moveTo(x, y); s.lineTo(x + len, y + (rnd() - 0.5) * 1.2); } x += len + gap; }
      }
      stroke(lc, gLit * 0.6, 1);
      s.restore();
      // treads lit from above, risers from the front: parallel hatching, cross-hatched when bright
      const tA = 0.06 + 0.12 * amb + 0.5 * I * (0.45 + 0.55 * lamTop), rA = 0.05 + 0.1 * amb + 0.55 * I * lamFront;
      for (const stp of T.steps) {
        const nq = Math.max(2, Math.round((stp.y1 - stp.y0) / (3 * u)));
        s.beginPath();
        for (let q = 1; q <= nq; q++) { const y = stp.y0 + (stp.y1 - stp.y0) * q / (nq + 1); s.moveTo(stp.x0 + 2, y); s.lineTo(stp.x1 - 2, y); }
        stroke(lc, tA * 0.75, 1);
        s.beginPath();
        const nr = I * lamFront > 0.35 ? 5 : 3;
        for (let q = 1; q <= nr; q++) { const y = stp.y1 + (stp.y2 - stp.y1) * q / (nr + 1); s.moveTo(stp.x0 + 2, y); s.lineTo(stp.x1 - 2, y); }
        stroke(lc, rA * 0.8, 1);
        if (I * lamFront > 0.5) { s.beginPath(); for (let x = stp.x0 + 3; x < stp.x1; x += 0.13 * D) { s.moveTo(x, stp.y1 + 1); s.lineTo(x + 0.05 * D, stp.y2 - 1); } stroke(lc, rA * 0.35, 1); }
      }
      // cut the shadows out
      if (src && alt > 0.3) {
        const cc = Math.min(1 / Math.tan(Math.max(alt, 0.3) * RAD), 12);
        const dX = sinA, dZ = -cosA, kz = T.kz;
        const sh = (x, y, base) => { const h = base - y; return [x + dX * cc * h, base + dZ * kz * cc * h]; };
        s.save();
        s.beginPath(); s.rect(0, T.Hy, W, H - T.Hy); s.clip();
        s.globalCompositeOperation = "destination-out";
        s.fillStyle = "#000"; s.strokeStyle = "#000"; s.lineJoin = "round";
        s.lineWidth = Math.max(2, T.kz * D);
        const cast = (pts, base) => { polyPath(s, pts.map(([x, y]) => sh(x, y, base))); s.fill(); s.stroke(); };
        for (const col of T.cols) cast(col.sil, T.Sy);
        cast(T.ent, T.Sy); cast(T.ped, T.Sy); cast(T.block, T.Sy);
        s.lineWidth = Math.max(2, T.kz * D * 0.8);
        for (const d of T.drums) { const x1 = d.x0 + d.len; cast([[d.x0, d.yb], [x1, d.yb], [x1, d.yb - d.d], [d.x0, d.yb - d.d]], d.yb); }
        for (const b of T.rubble) cast([b.BL, b.BR, b.TR, b.TL], b.base);
        s.restore();
      }
    }

    // ---- black fills (far to near) so the sky, stars and ground never show through stone
    s.fillStyle = "#000";
    for (const o of T.olives) { for (const k of o.clumps) { clumpPath(s, k); s.fill(); } polyPath(s, o.trunk); s.fill(); }
    for (const cp of T.cyp) { polyPath(s, cp.sil); s.fill(); }
    for (const col of T.cols) { polyPath(s, col.sil); s.fill(); }
    for (const p of [T.ent, T.ped, T.block]) { polyPath(s, p); s.fill(); }
    for (const d of T.drums) { s.beginPath(); s.rect(d.x0, d.yb - d.d, d.len, d.d); s.fill(); for (const ex of [d.x0, d.x0 + d.len]) { s.beginPath(); s.ellipse(ex, d.yb - d.d / 2, d.d * 0.22, d.d / 2, 0, 0, TAU); s.fill(); } }
    for (const b of T.rubble) { polyPath(s, b.sil); s.fill(); }

    // ---- the static linework, tinted by the light
    {
      const tc = L.tint.c;
      tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalCompositeOperation = "source-over"; tc.clearRect(0, 0, L.tint.cv.width, L.tint.cv.height);
      tc.drawImage(L.static.cv, 0, 0);
      tc.globalCompositeOperation = "source-in"; tc.fillStyle = U.rgba(oc, 1); tc.fillRect(0, 0, L.tint.cv.width, L.tint.cv.height);
      tc.globalCompositeOperation = "source-over";
      s.globalAlpha = outA; s.drawImage(L.tint.cv, 0, 0, W, H); s.globalAlpha = 1;
    }

    // ---- light-dependent hatching
    // cypresses: inner strokes in the tufts that face the light
    {
      s.beginPath();
      for (const cp of T.cyp) for (const tf of cp.tufts) {
        const lam = lamAt(Math.asin(U.clamp(tf.s * 0.95, -0.95, 0.95)));
        const v = 0.15 * amb + I * lam;
        if (v < 0.12) continue;
        const n = v > 0.5 ? 3 : v > 0.28 ? 2 : 1;
        for (let k = 1; k <= n; k++) { const f2 = k / (n + 1), xx = tf.x - tf.w * 0.7 + tf.w * 1.4 * f2; s.moveTo(xx, tf.y - tf.h * 0.05); s.quadraticCurveTo(xx + tf.lean * 0.3, tf.y - tf.h * 0.5, tf.x + tf.lean * 0.8, tf.y - tf.h * 0.85); }
      }
      stroke(U.safe(U.mix(C.slate, litCol, 0.25 + 0.6 * I)), 0.12 + 0.45 * I + 0.12 * amb, 1);
    }
    // olives: lit flecks
    if (I > 0.05) { s.beginPath(); for (const o of T.olives) for (const [x, y, a, l] of o.flecks) { if (Math.sign(x - o.x) * -sinA < -0.2 && lamTop < 0.5) continue; s.moveTo(x, y - l * 0.3); s.lineTo(x + l * 0.6, y - l * 0.6); } stroke(lc, 0.3 * I, 1); }

    // columns: arrises bright where they face the light; flutes hatched densely on the lit side;
    // curved contour cross-hatching where the light is strongest
    const fl = lc;
    for (const col of T.cols) {
      const yTop = col.cap ? T.shaftTop + 0.32 * D : null;
      const topAt = (xx) => {
        if (col.cap) return yTop;
        let jy = col.jag[0][1];
        for (let m = 1; m < col.jag.length; m++) if (col.jag[m][0] >= xx) { const p0 = col.jag[m - 1], p1 = col.jag[m]; jy = U.lerp(p0[1], p1[1], (xx - p0[0]) / Math.max(1e-3, p1[0] - p0[0])); break; }
        return jy + 2;
      };
      const vline = (th, a, lw) => {
        const sn = Math.sin(th);
        s.beginPath();
        const y1 = topAt(col.x + T.r0 * sn) + (!col.cap && Math.abs(sn) > 0.7 ? 0.3 * D : 0);
        for (let q = 0; q <= 10; q++) { const y = U.lerp(T.Sy - 1, y1, q / 10); const x = col.x + T.rAt(y) * sn; q ? s.lineTo(x, y) : s.moveTo(x, y); }
        stroke(fl, a, lw);
      };
      const nF = 10;
      for (let k = 1; k < nF * 2; k++) {
        const th = (-90 + k * 180 / (nF * 2)) * RAD;
        const lam = lamAt(th), v = I * lam;
        if (k % 2 === 0) vline(th, 0.08 + 0.12 * amb + 0.62 * v, v > 0.55 ? 1.35 : 1);         // arris
        else {
          // the flute channel between arrises: 0-3 hatch lines by brightness
          const n = v > 0.6 ? 3 : v > 0.35 ? 2 : v > 0.15 ? 1 : 0;
          for (let q = 1; q <= n; q++) vline(th + (q / (n + 1) - 0.5) * (9 * RAD), 0.3 * v + 0.05, 1);
        }
      }
      // contour hatching: short curved strokes round the lit flank
      if (I > 0.1) {
        let a0 = null, a1 = null;
        for (let k = 0; k <= 36; k++) { const th = (-90 + k * 5) * RAD; if (lamAt(th) * I > 0.42) { if (a0 === null) a0 = th; a1 = th; } }
        if (a0 !== null) {
          s.beginPath();
          const yT = topAt(col.x);
          for (let y = T.Sy - 0.12 * D; y > yT + 0.1 * D; y -= 0.13 * D) {
            const r = T.rAt(y);
            for (let k = 0; k <= 6; k++) { const th = U.lerp(a0, a1, k / 6), x = col.x + r * Math.sin(th), yy = y + r * 0.1 * Math.cos(th); k ? s.lineTo(x, yy) : s.moveTo(x, yy); }
          }
          stroke(fl, 0.22 * I, 1);
        }
      }
      // edges: brighter on the lit side and when back-lit
      const lamL = lamAt(-Math.PI / 2), lamR = lamAt(Math.PI / 2);
      if (I * lamL > 0.05 || rim > 0.05) { s.beginPath(); lineTo(s, col.left); stroke(fl, 0.4 * I * lamL + 0.35 * rim, 1.2); }
      if (I * lamR > 0.05 || rim > 0.05) { s.beginPath(); lineTo(s, col.right); stroke(fl, 0.4 * I * lamR + 0.35 * rim, 1.2); }
      if (col.cap) {
        // echinus and abacus faces
        const x = col.x, st2 = T.shaftTop;
        s.beginPath();
        for (let q = 1; q <= 3; q++) { const yy = st2 - 0.2 * D * q / 4; const rr = U.lerp(T.r1, 0.6 * D, q / 4); s.moveTo(x - rr, yy); s.ellipse(x, yy, rr, rr * 0.08, 0, Math.PI, 0, true); }
        stroke(fl, 0.05 + 0.5 * I * Math.max(lamFront, lamTop * 0.6) + 0.08 * amb, 1);
        if (I * lamFront > 0.2) { s.beginPath(); for (let yy = T.capTop + 0.05 * D; yy < st2 - 0.22 * D; yy += 0.06 * D) { s.moveTo(x - 0.6 * D, yy); s.lineTo(x + 0.6 * D, yy); } stroke(fl, 0.4 * I * lamFront, 1); }
      } else {
        s.beginPath(); for (let m = 1; m < col.jag.length - 1; m++) { const a0 = col.jag[m], a1 = col.back[m]; s.moveTo(U.lerp(a0[0], a1[0], 0.2), U.lerp(a0[1], a1[1], 0.2)); s.lineTo(U.lerp(a0[0], a1[0], 0.8), U.lerp(a0[1], a1[1], 0.8)); }
        stroke(fl, 0.05 + 0.55 * I * lamTop, 1);
      }
    }

    // entablature: horizontal hatching on the front faces, cross-hatched when brightly lit
    {
      const v = I * lamFront;
      const hA = 0.03 + 0.07 * amb + 0.45 * v;
      s.save(); s.beginPath();
      for (const p of [T.ent, T.ped, T.block]) { s.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) s.lineTo(p[i][0], p[i][1]); s.closePath(); }
      s.clip();
      const step = v > 0.4 ? 0.075 * D : 0.12 * D;
      s.beginPath(); for (let y = T.yCor - 1.6 * D; y < T.capTop + 0.3 * D; y += step) { s.moveTo(0, y); s.lineTo(W, y); }
      stroke(fl, hA * 0.65, 1);
      if (v > 0.45) { s.beginPath(); for (let x = 0; x < W; x += 0.1 * D) { s.moveTo(x, T.yCor - 1.6 * D); s.lineTo(x, T.capTop + 0.3 * D); } stroke(fl, (v - 0.45) * 0.5, 1); }
      // soffits and the underside of the cornice stay dark; the triglyph grooves catch a little light
      s.restore();
      s.beginPath(); lineTo(s, T.corniceTop); stroke(fl, 0.05 + 0.5 * I * lamTop, 1.2);
    }

    // drums and rubble: each face by its own light
    for (const d of T.drums) {
      const x1 = d.x0 + d.len, ry = d.d / 2, rx = d.d * 0.22, cy = d.yb - ry, ex = d.endLeft ? d.x0 : x1;
      s.beginPath();
      for (let k = 1; k < 7; k++) { const y = d.yb - d.d + d.d * k / 7; const t2 = (y - cy) / ry; const lam = Math.max(0, -t2) * lamTop + 0.3 * lamFront; if (lam * I < 0.08) continue; const inset = d.endLeft ? rx * Math.sqrt(Math.max(0, 1 - t2 * t2)) : 0; s.moveTo(d.x0 + inset, y); s.lineTo(x1 - (d.endLeft ? 0 : rx * Math.sqrt(Math.max(0, 1 - t2 * t2))), y); }
      stroke(fl, 0.06 + 0.45 * I, 1);
      // end face: radial hatching when it faces the light
      const endLam = d.endLeft ? lamAt(-Math.PI / 2) : lamAt(Math.PI / 2);
      if (I * endLam > 0.15) { s.beginPath(); for (let k = 0; k < 12; k++) { const q = k / 12 * TAU; s.moveTo(ex + Math.cos(q) * rx * 0.3, cy + Math.sin(q) * ry * 0.3); s.lineTo(ex + Math.cos(q) * rx * 0.8, cy + Math.sin(q) * ry * 0.8); } stroke(fl, 0.35 * I * endLam, 1); }
    }
    for (const b of T.rubble) {
      const faces = [
        [[b.TL, b.TR, b.TR2, b.TL2], 0.05 + 0.5 * I * lamTop, "h"],
        [[b.BL, b.BR, b.TR, b.TL], 0.04 + 0.5 * I * lamFront, "h"],
        [[b.BR, b.BR2, b.TR2, b.TR], 0.04 + 0.5 * I * lamAt(Math.PI / 2), "v"],
      ];
      for (const [poly, a, dir] of faces) {
        if (a < 0.06) continue;
        s.save(); polyPath(s, poly); s.clip();
        const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const gap = a > 0.35 ? 0.06 * D : 0.1 * D;
        s.beginPath();
        if (dir === "h") for (let y = y0; y < y1; y += gap) { s.moveTo(x0, y); s.lineTo(x1, y + (x1 - x0) * 0.04); }
        else for (let x = x0; x < x1; x += gap) { s.moveTo(x, y0); s.lineTo(x, y1); }
        stroke(fl, a * 0.7, 1);
        if (a > 0.4) { s.beginPath(); for (let x = x0; x < x1; x += gap * 1.6) { s.moveTo(x, y0); s.lineTo(x + (y1 - y0) * 0.5, y1); } stroke(fl, (a - 0.4) * 0.6, 1); }
        s.restore();
      }
    }

    // ---- life: ivy, grass and wildflowers (over the hatching)
    {
      const ivyCol = U.safe(U.mix(U.hex("#5f7262"), litCol, 0.12 + 0.35 * I));
      for (const iv of T.ivy) {
        s.beginPath();
        let pen = false;
        for (const [x, y, front] of iv.vine) { if (front > -0.15) { pen ? s.lineTo(x, y) : s.moveTo(x, y); pen = true; } else pen = false; }
        stroke(ivyCol, 0.55 + 0.25 * I, 1.1);
        for (const [x, y, sz, a] of iv.leaves) {
          leafPath(s, x, y, sz, a); s.fillStyle = "#000"; s.fill();
          leafPath(s, x, y, sz, a); stroke(ivyCol, 0.6 + 0.3 * I, 1);
          s.beginPath(); s.moveTo(x - Math.sin(a) * sz * 0.4, y + Math.cos(a) * sz * 0.4); s.lineTo(x + Math.sin(a) * sz * 0.4, y - Math.cos(a) * sz * 0.4); stroke(ivyCol, 0.3 + 0.3 * I, 1);
        }
      }
      const gc = U.safe(U.mix(U.hex("#6f806a"), litCol, 0.18 + 0.35 * I));
      s.beginPath();
      for (const tf of T.tufts) for (const [x0, y0, x1, y1, bend] of tf.blades) { s.moveTo(x0, y0); s.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1); }
      stroke(gc, 0.45 + 0.3 * I, 1);
      const pc = U.safe(U.mix(C.straw, C.bone, 0.4));
      s.beginPath();
      for (const tf of T.tufts) if (tf.flower) { const [x, y, r] = tf.flower; s.moveTo(x, y + r * 3); s.lineTo(x, y); }
      stroke(gc, 0.45, 1);
      for (const tf of T.tufts) if (tf.flower) {
        const [x, y, r] = tf.flower;
        s.beginPath(); for (let k = 0; k < 5; k++) { const q = k / 5 * TAU; s.moveTo(x + Math.cos(q) * r * 1.6 + r * 0.5, y + Math.sin(q) * r * 1.6); s.arc(x + Math.cos(q) * r * 1.6, y + Math.sin(q) * r * 1.6, r * 0.5, 0, TAU); }
        s.fillStyle = U.rgba(pc, 0.4 + 0.3 * I); s.fill();
      }
    }
  }

  // ------------------------------------------------------------------ moon sprite (true pixel size)
  // north up; maria roughly where they sit on the near side, as seen from the northern hemisphere
  const MARIA = [
    [-0.36, -0.36, 0.26, 0.22, 0.3], [0.13, -0.4, 0.17, 0.15, 0.1], [0.3, -0.07, 0.21, 0.17, -0.3], [0.66, -0.3, 0.11, 0.09, 0.2],
    [0.55, 0.16, 0.13, 0.17, 0.4], [0.36, 0.36, 0.09, 0.08, 0], [-0.17, 0.44, 0.16, 0.12, 0.5], [-0.62, -0.02, 0.18, 0.36, 0.2],
    [-0.47, 0.42, 0.1, 0.09, 0], [0.0, -0.64, 0.36, 0.08, 0], [-0.08, 0.04, 0.08, 0.07, 0],
  ];
  function moonSprite(r, illum, ang) {
    const key = `${Math.round(illum * 90)}|${Math.round(ang / RAD / 2)}|${Math.round(r * dpr)}`;
    if (key === L.moonKey && L.moon) return L.moon;
    const S = Math.ceil(r * 2 + 8);
    const { cv, c } = mk(S, S); c.translate(S / 2, S / 2);
    const bc = U.safe(C.bone);
    const rnd = U.rng(606);
    c.fillStyle = U.rgba(U.safe(C.slate), 0.07); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
    c.strokeStyle = U.rgba(U.safe(C.slate), 0.32); c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
    if (illum > 0.01) {
      c.save(); c.rotate(ang);
      const k = 1 - 2 * illum;
      c.beginPath();
      c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
      c.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
      c.closePath(); c.rotate(-ang); c.clip();
      const g = c.createRadialGradient(-r * 0.15, -r * 0.15, 0, 0, 0, r);
      g.addColorStop(0, U.rgba(bc, 0.86)); g.addColorStop(0.85, U.rgba(bc, 0.74)); g.addColorStop(1, U.rgba(bc, 0.58));
      c.fillStyle = g; c.fillRect(-r, -r, 2 * r, 2 * r);
      // maria: soft irregular darks
      for (const [x, y, a, b2, rot] of MARIA) {
        c.save(); c.translate(x * r, y * r); c.rotate(rot);
        c.fillStyle = "rgba(0,0,0,0.12)";
        c.beginPath();
        for (let i = 0; i <= 16; i++) { const q = i / 16 * TAU, w = 1 + 0.18 * Math.sin(q * 3 + x * 9) + 0.1 * Math.sin(q * 5 + y * 7); const px = Math.cos(q) * a * r * w, py = Math.sin(q) * b2 * r * w; i ? c.lineTo(px, py) : c.moveTo(px, py); }
        c.fill();
        c.fillStyle = "rgba(0,0,0,0.06)"; c.beginPath(); c.ellipse(0, 0, a * r * 1.25, b2 * r * 1.3, 0, 0, TAU); c.fill();
        c.fillStyle = "rgba(0,0,0,0.05)"; c.beginPath(); c.ellipse(0, 0, a * r * 0.7, b2 * r * 0.7, 0, 0, TAU); c.fill();
        c.restore();
      }
      // stipple and a few craters; Tycho and Copernicus bright with faint rays
      for (let i = 0; i < r * r * 0.5; i++) { const q = rnd() * TAU, d = Math.sqrt(rnd()) * r; c.fillStyle = rnd() < 0.5 ? "rgba(0,0,0,0.14)" : U.rgba(bc, 0.16); c.fillRect(Math.cos(q) * d, Math.sin(q) * d, 0.7, 0.7); }
      c.strokeStyle = "rgba(0,0,0,0.18)"; c.lineWidth = 0.6;
      for (let i = 0; i < 9; i++) { const q = rnd() * TAU, d = Math.sqrt(rnd()) * r * 0.85, cr = r * (0.025 + 0.04 * rnd()); c.beginPath(); c.arc(Math.cos(q) * d, Math.sin(q) * d, cr, 0, TAU); c.stroke(); }
      for (const [x, y, rr] of [[-0.12, 0.72, 0.045], [-0.3, -0.06, 0.035]]) {
        c.fillStyle = U.rgba(bc, 0.5); c.beginPath(); c.arc(x * r, y * r, rr * r, 0, TAU); c.fill();
        c.strokeStyle = U.rgba(bc, 0.12); c.lineWidth = 0.7; c.beginPath();
        for (let i = 0; i < 9; i++) { const q = i / 9 * TAU + 0.3; c.moveTo(x * r, y * r); c.lineTo(x * r + Math.cos(q) * r * 0.4, y * r + Math.sin(q) * r * 0.4); }
        c.stroke();
      }
      c.restore();
      c.strokeStyle = U.rgba(bc, 0.5); c.lineWidth = 1;
      c.save(); c.rotate(ang); c.beginPath(); c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false); c.stroke(); c.restore();
    }
    L.moonKey = key; L.moon = { cv, S };
    return L.moon;
  }

  // ------------------------------------------------------------------ static layers
  function build() {
    LWU = Math.max(1, H / 1100);
    buildTemple();
    const Rw = WORK().R;
    const numPx = Math.max(14, 0.021 * H);

    // --- work limb: cool, exact
    {
      const S = Rw * 2.5;
      const { cv, c } = mk(S, S); c.translate(S / 2, S / 2);
      const col = C.steelMid;
      eng(c, circ(c, 0, 0, Rw), col, 0.8, 1.4);
      eng(c, circ(c, 0, 0, Rw * 0.94), col, 0.45, 1.0);
      for (let i = 0; i < 96; i++) {
        const a = i / 96 * TAU, hour = i % 4 === 0, six = i % 24 === 0;
        const r0 = six ? 0.905 : hour ? 0.94 : 0.972;
        const [x0, y0] = pol(Rw * r0, a), [x1, y1] = pol(Rw, a);
        eng(c, () => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); }, col, hour ? 0.7 : 0.35, hour ? 1.2 : 1.0);
      }
      c.font = `400 ${Math.round(numPx)}px ${SERIF}`; c.textAlign = "center"; c.textBaseline = "middle";
      const cc = U.safe(C.steelMid);
      [["XII", 0], ["VI", 90], ["XII", 180], ["VI", 270]].forEach(([s, d]) => {
        const [x, y] = pol(Rw * 1.1, d * RAD);
        c.shadowColor = U.rgba(cc, 0.7); c.shadowBlur = 6 * dpr; c.fillStyle = U.rgba(cc, 0.75); c.fillText(s, x, y);
      });
      c.shadowBlur = 0;
      eng(c, circ(c, 0, 0, 4.5), col, 0.7, 1.2);
      eng(c, circ(c, 0, 0, 10), col, 0.3, 1.0);
      L.limbW = { cv, S };
    }

    // --- stars: two tiers that resolve over the evening (seeded)
    const starLayer = (seed, count, rMin, rMax, aMin, aMax, marks) => {
      const o = mk(W, T.Hy), c = o.c, rnd = U.rng(seed);
      for (let i = 0; i < count; i++) {
        const x = rnd() * W, y = T.Hy * (0.02 + 0.9 * Math.pow(rnd(), 1.25));
        const col = U.safe(rnd() < 0.3 ? C.starBlue : C.starGold);
        const r = rMin + rnd() * (rMax - rMin), a = aMin + rnd() * (aMax - aMin);
        c.fillStyle = U.rgba(col, a); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
        if (marks && i < 7) {
          c.strokeStyle = U.rgba(col, a * 0.45); c.lineWidth = 0.9; const k = r * 3.4;
          c.beginPath(); c.moveTo(x - k, y); c.lineTo(x + k, y); c.moveTo(x, y - k); c.lineTo(x, y + k); c.stroke();
        }
      }
      return o.cv;
    };
    L.stars1 = starLayer(4242, 60, 0.9, 1.6, 0.4, 0.75, true);
    L.stars2 = starLayer(9191, 150, 0.6, 1.05, 0.2, 0.48, false);
    const tr = U.rng(5150); L.twinkle = [];
    for (let i = 0; i < 9; i++) L.twinkle.push({ x: tr() * W, y: T.Hy * (0.04 + 0.8 * tr()), r: 1 + tr() * 0.7, ph: tr() * 10, sp: 0.4 + tr() * 0.6 });

    // --- glow sprites
    L.halo = radialSprite(256, C.bone, [[0, 1], [0.18, 0.55], [0.45, 0.16], [1, 0]]);
    L.duskGlow = radialSprite(256, C.ember, [[0, 1], [0.4, 0.45], [1, 0]]);
    L.lampGlow = radialSprite(128, C.candle, [[0, 1], [0.25, 0.45], [1, 0]]);
    L.alarmGlow = radialSprite(128, C.rose, [[0, 1], [0.3, 0.4], [1, 0]]);
    L.mist = radialSprite(256, U.hex("#ffffff"), [[0, 1], [0.5, 0.55], [1, 0]]); // tinted at draw time via a tint canvas
    L.mistTint = mk(256, 256); L.mistTintKey = "";

    // --- hills: far skyline at the horizon (static)
    {
      const hill = (amp, freq, seed, yoff) => { const p = []; const st = W / 220; for (let x = 0; x <= W + st; x += st) p.push([x, T.Hy + yoff - amp * (0.5 + 0.5 * U.fbm2(x / W * freq, seed, 3))]); return p; };
      L.hillA = hill(0.035 * H, 3.4, 3.7, 0);
      L.hillB = hill(0.06 * H, 2.1, 8.1, -0.012 * H);
    }

    // --- scene canvases (rebuilt on light change)
    L.scene = mk(W, H); L.static = mk(W, H); L.tint = mk(W, H); L.sceneKey = ""; L.sceneT = -9;
    bakeStatic();
    // --- day plates (baked on demand, by day only) and where the snow lies
    const plate = () => Object.assign(mk(W, H), { key: "", t: -9 });
    L.dS = [plate(), plate()]; L.dSi = 0; L.dSt = -9; L.dF = plate();
    bakeSnowGround();
    L.moonKey = ""; L.moon = null;
    buildWeather();
    built = `${W}x${H}@${dpr}`;
  }

  function drawLayer(ctx, Lr, cx, cy, scale, rot, alpha) {
    if (!Lr || alpha <= 0.004) return;
    ctx.save();
    ctx.globalAlpha = U.clamp(alpha);
    ctx.translate(cx, cy); if (rot) ctx.rotate(rot);
    const s = Lr.S * scale;
    ctx.drawImage(Lr.cv, -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  // ------------------------------------------------------------------ light
  // The brighter of sun and moon is the key light; starlight and twilight fill the rest.
  function lightState(now) {
    const loc = AW.config.location, phi = loc.lat * RAD;
    const A = astro(now, loc.lon);
    const sun = horiz(A.sunDec, A.sunH, phi), moon = horiz(A.moonDec, A.moonH, phi);
    const sI = U.smoothstep(-0.8, 5, sun.alt);
    const mI = U.smoothstep(-0.5, 8, moon.alt) * (0.15 + 0.85 * A.illum);
    const useSun = sI >= mI;
    const src = Math.max(sI, mI) > 0.02 ? (useSun ? sun : moon) : null;
    const I = src ? Math.max(sI, mI) : 0;
    const twi = U.smoothstep(-12, 0, sun.alt), day = U.smoothstep(0, 25, sun.alt);
    const amb = 0.24 + 0.22 * twi + 0.2 * day + 0.12 * mI;
    const warm = src && useSun ? 1 : 0;
    return { A, sun, moon, sI, mI, src, I, amb, warm, illum: A.illum,
      dusk: U.smoothstep(-14, -1, sun.alt) * (1 - U.smoothstep(4, 14, sun.alt)),
      night: 1 - U.smoothstep(-16, -4, sun.alt) };
  }
  const skyX = (az) => U.clamp(W * (0.5 + (az - 180) / 300), 0.03 * W, 0.97 * W);
  // altitude eases up quickly so the moon clears the ruin for most of its arc
  const skyY = (alt) => T.Hy - (T.Hy - 0.05 * H) * Math.pow(U.clamp(alt / 75, 0, 1.05), 0.72) + (alt < 0 ? -alt * 0.01 * H : 0);

  // ------------------------------------------------------------------ dynamic pieces
  function sunGlyph(ctx, x, y, r, col, a) {
    const c = U.safe(col);
    ctx.save();
    ctx.strokeStyle = U.rgba(c, a * 0.18); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = U.rgba(c, a); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.fillStyle = U.rgba(c, a * 0.9); ctx.beginPath(); ctx.arc(x, y, Math.max(1.6, r * 0.25), 0, TAU); ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = U.rgba(c, a * 0.8); ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const q = i / 8 * TAU, r0 = r * 1.45, r1 = r * (i % 2 ? 1.8 : 2.15);
      ctx.moveTo(x + Math.cos(q) * r0, y + Math.sin(q) * r0); ctx.lineTo(x + Math.cos(q) * r1, y + Math.sin(q) * r1);
    }
    ctx.stroke();
    ctx.restore();
  }

  function roundel(ctx, x, y, r, col, a, t, down) {
    const c = U.safe(col);
    if (down) {
      const ph = (t % 1.8) / 1.8;
      const pr = r * (1 + ph * 1.9);
      ctx.strokeStyle = U.rgba(c, a * 0.55 * (1 - ph)); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(x, y, pr, 0, TAU); ctx.stroke();
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, U.rgba(c, a * 0.11 * (0.7 + 0.3 * Math.sin(t * 3.4))));
      g.addColorStop(1, U.rgba(c, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, TAU); ctx.fill();
    }
    const breathe = down ? 0.75 + 0.25 * Math.sin(t * 3.4) : 0.82 + 0.18 * Math.sin(t * TAU / 7);
    ctx.strokeStyle = U.rgba(c, a * 0.16); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = U.rgba(c, a * 0.85); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = U.rgba(c, a * 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r * 0.68, 0, TAU); ctx.stroke();
    ctx.fillStyle = U.rgba(c, a * breathe * (down ? 1 : 0.8));
    ctx.beginPath(); ctx.arc(x, y, r * (down ? 0.42 : 0.3), 0, TAU); ctx.fill();
  }

  // an oil lamp on the steps: engraved bowl, a small flame, a soft glow and a pool of light on the stone
  function lamp(ctx, x, y, a, t, i, down, dk) {
    if (a <= 0.004) return;
    const sunK = down ? 1 : 1 - 0.75 * (dk || 0); // in sunlight an oil lamp's glow is all but lost
    const s = 0.016 * H;
    const fl = down
      ? 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3.2 + i))
      : 0.84 + 0.1 * U.noise1(t * 2.3 + i * 7.1) + 0.06 * U.noise1(t * 6.1 + i * 3.3);
    const col = down ? C.rose : C.candle;
    const fx = x - s * 0.8, fy = y - s * 0.25;
    const glow = down ? L.alarmGlow : L.lampGlow;
    // pool on the floor, flattened
    const pw = (down ? 0.2 : 0.15) * H * (0.9 + 0.1 * fl), ph = pw * 0.2;
    ctx.globalAlpha = U.clamp(a * (down ? 0.2 : 0.16) * fl * sunK);
    ctx.drawImage(glow, fx - pw / 2, y - ph / 2, pw, ph);
    // halo round the flame
    const glowR = (down ? 0.085 : 0.05) * H * (down ? 0.8 + 0.35 * fl : 0.95 + 0.1 * fl);
    ctx.globalAlpha = U.clamp(a * (down ? 0.3 : 0.2) * fl * sunK);
    ctx.drawImage(glow, fx - glowR, fy - s * 0.6 - glowR, glowR * 2, glowR * 2);
    ctx.globalAlpha = 1;
    // bowl
    const bc = U.safe(U.mix(C.amber, C.bone, 0.3));
    ctx.strokeStyle = U.rgba(bc, a * 0.62); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.ellipse(x, y - s * 0.15, s * 1.1, s * 0.36, 0, 0, Math.PI); ctx.moveTo(x - s * 1.1, y - s * 0.15); ctx.lineTo(x + s * 1.1, y - s * 0.15);
    ctx.moveTo(x + s * 1.1, y - s * 0.15); ctx.quadraticCurveTo(x + s * 1.6, y - s * 0.35, x + s * 1.5, y - s * 0.65);
    ctx.stroke();
    // flame: a teardrop from the nozzle
    const fh = s * (down ? 1.6 + 0.7 * fl : 1.35 + 0.2 * fl), fw = s * (down ? 0.44 : 0.34);
    const sway = U.noise1(t * 1.3 + i * 5) * s * 0.2;
    const cc = U.safe(col);
    ctx.fillStyle = U.rgba(cc, a * (down ? 0.82 : 0.74) * fl);
    ctx.beginPath(); ctx.moveTo(fx + sway, fy - fh);
    ctx.quadraticCurveTo(fx + fw * 1.4, fy - fh * 0.3, fx, fy);
    ctx.quadraticCurveTo(fx - fw * 1.4, fy - fh * 0.3, fx + sway, fy - fh);
    ctx.fill();
    ctx.fillStyle = U.rgba(U.safe(U.mix(col, C.straw, 0.45)), a * 0.85 * fl);
    ctx.beginPath(); ctx.ellipse(fx, fy - fh * 0.3, fw * 0.42, fw * 0.62, 0, 0, TAU); ctx.fill();
  }

  const agoH = (d, now) => {
    const h = (now - d) / 3600000;
    return h >= 1 && h < 48 ? `${Math.round(h)} h ago` : U.fmtAgo(d, now);
  };

  // ------------------------------------------------------------------ news: a line of print above the clock
  // Layout (word wrap + ellipsis in the real face) is cached per (text, size, width); the runs themselves
  // are cached text sprites, so a steady headline costs a few blits per frame.
  const lays = new Map();
  function wrap2(str, o, maxW, two) {
    const px = Math.round(o.px);
    const key = `${str}|${px}|${o.style || ""}|${o.spacing || 0}|${Math.round(maxW)}|${two ? 2 : 1}`;
    let l = lays.get(key);
    if (l) return l;
    if (lays.size > 12) lays.clear();
    if (!mctx) mctx = document.createElement("canvas").getContext("2d");
    mctx.font = `${o.style || ""} 400 ${px}px ${SERIF}`;
    if (spacingOk(mctx)) mctx.letterSpacing = `${(o.spacing || 0) * o.px}px`;
    const q = String(str).replace(/\s+/g, " ").trim(), fits = (x) => mctx.measureText(x).width <= maxW;
    if (fits(q)) l = [q];
    else if (!two) l = [U.ellipsize(q, maxW, mctx)];
    else {
      const words = q.split(" ");
      // fits on two lines: split where the two lines balance best (no orphan word)
      l = null;
      let best = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(" "), z = words.slice(i).join(" ");
        const wa = mctx.measureText(a).width, wz = mctx.measureText(z).width;
        if (wa <= maxW && wz <= maxW && Math.max(wa, wz) < best) { best = Math.max(wa, wz); l = [a, z]; }
      }
      if (!l) {
        // too long for two: fill the first line, cut the second at a word with an ellipsis
        let l1 = "", i = 0;
        for (; i < words.length; i++) { const nx = l1 ? l1 + " " + words[i] : words[i]; if (!fits(nx)) break; l1 = nx; }
        l = l1 ? [l1, U.ellipsize(words.slice(i).join(" "), maxW, mctx)] : [U.ellipsize(q, maxW, mctx)];
      }
    }
    lays.set(key, l);
    return l;
  }
  const newsAge = (d, now) => {
    if (!(d instanceof Date)) return "";
    const m = Math.max(0, (now - d) / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${Math.round(m)} min`;
    if (m < 48 * 60) return `${Math.round(m / 60)} h`;
    return `${Math.round(m / 1440)} d`;
  };
  // critical: an engraved alarm seal (ring, lozenge, a slow breath and one ring spreading per breath)
  function seal(ctx, x, y, r, a, t, p) {
    const c = U.safe(C.alarm);
    const ph = ((t / 3.2) + 0.25) % 1;
    ctx.strokeStyle = U.rgba(c, a * 0.45 * (1 - ph) * (1 - ph)); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(x, y, r * (1.2 + 1.8 * ph), 0, TAU); ctx.stroke();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.8);
    g.addColorStop(0, U.rgba(c, a * (0.08 + 0.08 * p))); g.addColorStop(1, U.rgba(c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.8, 0, TAU); ctx.fill();
    ctx.strokeStyle = U.rgba(c, a * 0.16); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = U.rgba(c, a * (0.65 + 0.3 * p)); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    const k = r * 0.55;
    ctx.beginPath(); ctx.moveTo(x, y - k); ctx.lineTo(x + k * 0.7, y); ctx.lineTo(x, y + k); ctx.lineTo(x - k * 0.7, y); ctx.closePath();
    ctx.fillStyle = U.rgba(c, a * (0.45 + 0.4 * p)); ctx.fill();
  }
  function drawNews(ctx, n, now, t, a, x, dy) {
    if (!n || !n.headline || a <= 0.004) return;
    const crit = !!n.critical, p = crit ? 0.5 + 0.5 * Math.sin(t * TAU / 3.2) : 0;
    const ho = crit ? { px: 0.029 * H, color: C.alarm, glow: 7, core: 0.9 }
                    : { px: 0.029 * H, color: C.steelMid, glow: 4, core: 0.88 };
    const lines = wrap2(n.headline, ho, 0.42 * W, true);
    const lh = 0.037 * H, y0 = (lines.length > 1 ? 0.07 : 0.088) * H + dy;
    for (let i = 0; i < lines.length; i++) {
      const sp = sprite(lines[i], ho);
      drawSprite(ctx, sp, x, y0 + i * lh, "center", 1, a * (crit ? 0.72 + 0.26 * p : 0.85));
      if (!i && crit) seal(ctx, x - sp.tw / 2 - 0.03 * H, y0, 0.011 * H, a, t, p);
    }
    const age = newsAge(n.published, now);
    const src = String(n.source || "") + (age ? `  ·  ${age}` : "");
    text(ctx, src, x, y0 + (lines.length - 1) * lh + 0.04 * H,
      { px: Math.max(13, 0.02 * H), style: "italic", color: crit ? C.rose : C.steelDim, glow: crit ? 4 : 2, core: 0.85 }, "center", 1, a * (crit ? 0.85 : 0.9));
  }

  // Overlay dimming: while an info panel is up, the instrument and its inscriptions are drawn into one
  // layer and laid down at 1 - 0.7 * overlay.a. No layer and no extra cost when no overlay is showing.
  let dimL = null;
  function dimBegin(ctx, k) {
    if (k >= 0.999) return ctx;
    if (!dimL) dimL = mk(W, H);
    const c = dimL.c;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, dimL.cv.width, dimL.cv.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }
  function dimEnd(ctx, c, k) {
    if (c === ctx) return;
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = U.clamp(k);
    ctx.drawImage(dimL.cv, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ ambient scene drawing
  function drawSky(ctx, f, Ls, b, dk) {
    let skyA = U.smoothstep(0.45, 1, b);
    if (skyA <= 0.004) return;
    const el = f.ambientElapsed || 0;
    // dusk: a warm breath on the horizon on the sunset side
    if (Ls.dusk > 0.01) {
      const sx = skyX(Ls.sun.az), gw = 0.62 * W, gh = 0.26 * H;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, T.Hy + 0.015 * H); ctx.clip();
      ctx.globalAlpha = U.clamp(0.1 * Ls.dusk * skyA);
      ctx.drawImage(L.duskGlow, sx - gw / 2, T.Hy - gh / 2 - Math.max(0, Ls.sun.alt) * 0.004 * H, gw, gh);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // stars
    const glare = 1 - 0.5 * Ls.mI * Ls.illum;
    const sA = skyA * Ls.night * glare * (1 - U.smoothstep(0.25, 0.85, WX.cloud)) * (1 - 0.6 * WX.fog);
    if (sA > 0.01) {
      ctx.globalAlpha = U.clamp(sA * (0.35 + 0.65 * U.smoothstep(0, 3600, el)));
      ctx.drawImage(L.stars1, 0, 0, W, T.Hy);
      const a2 = sA * U.smoothstep(1200, 4 * 3600, el);
      if (a2 > 0.01) { ctx.globalAlpha = U.clamp(a2); ctx.drawImage(L.stars2, 0, 0, W, T.Hy); }
      ctx.globalAlpha = 1;
      const gc = U.safe(C.starGold);
      for (const s of L.twinkle) {
        const tw = 0.5 + 0.5 * Math.sin(f.t * s.sp + s.ph) * Math.sin(f.t * s.sp * 0.37 + s.ph * 2);
        ctx.fillStyle = U.rgba(gc, sA * (0.25 + 0.5 * tw));
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      }
    }
    // sun (the night plate's engraved glyph; by day the real sun is drawn with the day sky)
    if (Ls.sun.alt > -1 && skyA * (1 - dk) > 0.01) {
      skyA *= 1 - dk;
      const x = skyX(Ls.sun.az), y = skyY(Ls.sun.alt);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, T.Hy); ctx.clip();
      const gr = 0.12 * H;
      ctx.globalAlpha = U.clamp(0.1 * skyA); ctx.drawImage(L.duskGlow, x - gr, y - gr, gr * 2, gr * 2); ctx.globalAlpha = 1;
      sunGlyph(ctx, x, y, 0.014 * H, U.mix(C.candle, C.ember, Ls.dusk * 0.6), 0.8 * skyA * (1 - 0.9 * U.smoothstep(0.5, 0.92, WX.cloud)));
      ctx.restore();
    }
  }

  function drawMoon(ctx, Ls, b, dk) {
    const mA = U.smoothstep(0.6, 1, b);
    const m = Ls.moon;
    if (mA <= 0.004 || m.alt < -2 || Ls.illum < 0.015) return; // a new moon is not seen
    const x = skyX(m.az), y = skyY(m.alt), r = 0.027 * H;
    const dayDim = (1 - 0.45 * U.smoothstep(-2, 8, Ls.sun.alt)) * (1 - 0.55 * dk); // by day: a pale ghost in the blue
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, T.Hy); ctx.clip();
    // halo: two soft baked sprites, dim
    const veil = (1 - 0.93 * U.smoothstep(0.5, 0.92, WX.cloud)) * (1 - 0.5 * WX.fog);
    const hv = mA * dayDim * (0.25 + 0.75 * Ls.illum) * (1 - 0.55 * U.smoothstep(0.6, 1, WX.cloud));
    const h1 = 0.2 * H, h2 = 0.075 * H;
    ctx.globalAlpha = U.clamp(0.1 * hv); ctx.drawImage(L.halo, x - h1, y - h1, h1 * 2, h1 * 2);
    ctx.globalAlpha = U.clamp(0.16 * hv); ctx.drawImage(L.halo, x - h2, y - h2, h2 * 2, h2 * 2);
    const ms = moonSprite(r, Ls.illum, limbAngle(m, Ls.sun));
    ctx.globalAlpha = U.clamp(mA * dayDim * veil);
    ctx.drawImage(ms.cv, x - ms.S / 2, y - ms.S / 2, ms.S, ms.S);
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawScene(ctx, Ls, b, t, dk) {
    const p = U.smoothstep(0.34, 0.95, b), nA = 1 - dk;
    if (p <= 0.004 || nA <= 0.004) { return; }
    const key = Ls.src && Ls.I > 0.02 ? `${Ls.warm}|${Math.round(Ls.src.az / 2)}|${Math.round(Ls.src.alt)}|${Math.round(Ls.I * 16)}|${Math.round(Ls.amb * 16)}` : `n|${Math.round(Ls.amb * 16)}`;
    // rebuilt when the light moves meaningfully, at most about once a second (weather eases I smoothly)
    if (key !== L.sceneKey && (L.sceneT < 0 || t - L.sceneT > 1.2 || t < L.sceneT)) { L.sceneKey = key; L.sceneT = t; paintScene(Ls); }
    if (p >= 0.999) { ctx.globalAlpha = nA; ctx.drawImage(L.scene.cv, 0, 0, W, H); ctx.globalAlpha = 1; return; }
    // the exhale: the plate is drawn up out of the dark from the ground line, with a soft leading edge
    const e = U.easeOut(p);
    const ry = U.lerp(T.Bg + 0.02 * H, -0.04 * H, e);
    const band = 0.1 * H;
    const a = U.smoothstep(0, 0.5, p) * nA;
    const blit = (y0, y1, al) => {
      if (y1 <= y0 || al <= 0.004) return;
      ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, y1 - y0); ctx.clip();
      ctx.globalAlpha = U.clamp(al); ctx.drawImage(L.scene.cv, 0, 0, W, H); ctx.restore();
    };
    blit(ry, H, a);
    blit(ry - band * 0.5, ry, a * 0.55);
    blit(ry - band, ry - band * 0.5, a * 0.22);
    ctx.globalAlpha = 1;
  }

  function drawMist(ctx, f, Ls, b, dk) {
    const el = f.ambientElapsed || 0;
    const amt = U.smoothstep(0.7, 1, b) * Math.max((0.12 + 0.88 * U.smoothstep(400, 3.2 * 3600, el)) * (1 - dk), U.clamp(WX.fog * 1.3));
    if (amt <= 0.01) return;
    const t = f.t;
    const mc = U.mix(U.mix(C.slate, C.bone, 0.4 + 0.5 * Ls.I * (1 - Ls.warm)), C.amber, 0.45 * Ls.warm * Ls.I);
    // tint the soft sprite once per colour
    const tk = colKey(mc);
    if (tk !== L.mistTintKey) {
      L.mistTintKey = tk;
      const c = L.mistTint.c; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, 256, 256);
      c.globalCompositeOperation = "source-over"; c.drawImage(L.mist, 0, 0, 256, 256);
      c.globalCompositeOperation = "source-in"; c.fillStyle = U.rgba(U.safe(mc), 1); c.fillRect(0, 0, 256, 256);
      c.globalCompositeOperation = "source-over";
    }
    const lvl = 0.7 + 0.3 * Math.max(Ls.I, Ls.amb);
    // pools: soft wide ellipses hugging the stylobate and the ground
    const pools = [
      [0.5, T.Gy - 0.01 * H, 0.62, 0.075, 0.055], [0.3, T.Gy + 0.03 * H, 0.42, 0.06, 0.045],
      [0.7, T.Gy + 0.025 * H, 0.46, 0.065, 0.045], [0.5, T.Sy + 0.005 * H, 0.5, 0.05, 0.035],
      [0.12, T.Hy + 0.07 * H, 0.36, 0.05, 0.03], [0.88, T.Hy + 0.07 * H, 0.36, 0.05, 0.03],
    ];
    pools.forEach(([px, py, pw, ph, pa], i) => {
      const dx = Math.sin(t * 0.021 * (0.7 + i * 0.13) + i * 1.9) * 0.05 * W + Math.sin(t * 0.0071 + i) * 0.03 * W;
      const w = pw * W, h = ph * H * (1 + 0.25 * amt);
      ctx.globalAlpha = U.clamp(pa * 1.9 * amt * lvl);
      ctx.drawImage(L.mistTint.cv, T.tcx + (px - 0.5) * W + dx - w / 2, py - h / 2, w, h);
    });
    ctx.globalAlpha = 1;
    // drifting wisps: thin horizontal strokes threading the column bases
    const wc = U.safe(mc);
    const rnd = U.rng(808);
    ctx.lineCap = "round";
    const nW = Math.round(6 + 18 * amt);
    for (let i = 0; i < 24; i++) {
      const low = rnd() < 0.62;
      const y0 = low ? U.lerp(T.Sy - 0.04 * H, T.Gy + 0.012 * H, rnd()) : U.lerp(T.Gy, T.Bg - 0.01 * H, rnd());
      const len = (0.05 + 0.12 * rnd()) * W, sp = (rnd() - 0.4) * 0.005, ph = rnd() * TAU, r4 = rnd();
      const span = W + len * 2;
      const x0 = ((rnd() * span + t * sp * W) % span + span) % span - len;
      if (i >= nW) continue;
      const dx = (x0 + len / 2 - T.tcx) / (0.42 * W);
      const yy = y0 + Math.sin(t * 0.05 + ph) * 0.004 * H;
      const al = amt * lvl * (0.2 + 0.22 * r4) * (0.6 + 0.4 * Math.sin(t * 0.09 + ph)) * (0.3 + 0.7 * Math.exp(-dx * dx));
      if (al < 0.01) continue;
      // three segments, the middle stronger, so the ends dissolve
      for (const [u0, u1, k] of [[0, 0.25, 0.4], [0.25, 0.75, 1], [0.75, 1, 0.4]]) {
        ctx.strokeStyle = U.rgba(wc, al * k); ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x0 + len * u0, yy + Math.sin(u0 * 3 + ph) * 2);
        ctx.quadraticCurveTo(x0 + len * (u0 + u1) / 2, yy + Math.sin((u0 + u1) * 1.5 + ph) * 3, x0 + len * u1, yy + Math.sin(u1 * 3 + ph) * 2);
        ctx.stroke();
      }
    }
    ctx.lineCap = "butt";
  }

  // ------------------------------------------------------------------ weather (eased, never snapped)
  // WX holds the eased amount of each ingredient; targets come from signals.weather.
  const WX = { cloud: 0, fog: 0, rain: 0, storm: 0, snow: 0, wind: 6, acc: 0, init: false };
  let FLASH = 0;       // current lightning brightness, 0..1
  function wxTargets(w) {
    const c = (w && w.condition) || "clear";
    const k = w ? U.clamp(w.intensity == null ? 0.5 : w.intensity) : 0;
    const t = { cloud: 0, fog: 0, rain: 0, storm: 0, snow: 0 };
    if (c === "cloudy") t.cloud = 0.12 + 0.88 * k;
    else if (c === "fog") { t.fog = 0.4 + 0.6 * k; t.cloud = 0.3; }
    else if (c === "rain") { t.rain = 0.06 + 0.94 * k; t.cloud = 0.62 + 0.38 * k; }
    else if (c === "storm") { t.rain = Math.max(0.75, k); t.storm = 1; t.cloud = 1; }
    else if (c === "snow") { t.snow = 0.15 + 0.85 * k; t.cloud = 0.6 + 0.3 * k; }
    return t;
  }
  function wxUpdate(f) {
    const w = f.signals && f.signals.weather;
    const t = wxTargets(w), wind = w && w.windKph != null ? w.windKph : 6;
    if (!WX.init) { Object.assign(WX, t); WX.wind = wind; WX.acc = t.snow; WX.init = true; return; }
    const dt = Math.min(0.1, f.dt || 0.016);
    const k = 1 - Math.exp(-dt / 1.5);          // settles in a few seconds
    for (const n of ["cloud", "fog", "rain", "storm", "snow"]) WX[n] += (t[n] - WX[n]) * k;
    WX.wind += (wind - WX.wind) * k;
    WX.acc += (t.snow - WX.acc) * (1 - Math.exp(-dt / 25)); // snow settles and melts slowly
  }
  // overcast flattens the key light; fog softens it
  function wxLight(Ls) {
    const flat = (1 - 0.88 * U.smoothstep(0.45, 0.95, WX.cloud)) * (1 - 0.45 * WX.fog);
    Ls.I *= flat; Ls.mI *= flat;
    Ls.amb = Math.min(1, Ls.amb + 0.05 * WX.cloud + 0.08 * WX.fog);
  }

  function buildWeather() {
    // engraved clouds. Each has a soft black occluder (so it can cross the moon and hide stars) and a
    // line layer: billowed cumulus with scalloped crowns and contour hatching following each lobe, or
    // long stratus bands of broken horizontal strokes. The lines are tinted by the light at draw time.
    L.clouds = [];
    const rnd = U.rng(2718);
    const u = LWU;
    for (let i = 0; i < 10; i++) {
      const cumulus = i % 3 !== 2;
      const w = (cumulus ? 0.22 + 0.16 * rnd() : 0.42 + 0.3 * rnd()) * W, h = (cumulus ? 0.08 + 0.05 * rnd() : 0.04 + 0.025 * rnd()) * H;
      const occ = mk(w, h), lin = mk(w, h);
      const lobes = [];
      if (cumulus) {
        const n = 5 + Math.floor(rnd() * 4), base = h * 0.82;
        for (let k = 0; k < n; k++) {
          const t2 = (k + 0.5) / n, r = h * (0.22 + 0.28 * Math.sin(Math.PI * t2) * (0.7 + 0.5 * rnd()));
          lobes.push([w * (0.08 + 0.84 * t2) + (rnd() - 0.5) * w * 0.04, base - r * (0.6 + 0.3 * rnd()), r]);
        }
        lobes.sort((a, b2) => b2[2] - a[2]); // big lobes behind, small in front
      } else {
        for (let k = 0; k < 6; k++) lobes.push([w * (0.1 + 0.8 * rnd()), h * (0.5 + 0.15 * (rnd() - 0.5)), h * (0.3 + 0.15 * rnd())]);
      }
      const base = h * 0.82;
      // occluder
      {
        const c = occ.c;
        for (const [x, y, r] of lobes) {
          c.save(); c.translate(x, y); c.scale(cumulus ? r * 1.25 : r * 3.2, r * 1.25);
          const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
          g.addColorStop(0, "rgba(0,0,0,0.94)"); g.addColorStop(0.72, "rgba(0,0,0,0.8)"); g.addColorStop(1, "rgba(0,0,0,0)");
          c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill(); c.restore();
        }
        if (cumulus) { c.fillStyle = "rgba(0,0,0,0.85)"; c.fillRect(w * 0.08, base - h * 0.2, w * 0.84, h * 0.2); }
      }
      // linework
      {
        const c = lin.c; c.lineCap = "round";
        const col = (a) => `rgba(255,255,255,${a})`;
        if (cumulus) {
          // each lobe: erase what it covers, then its crown and contour hatching (denser up and to the left, toward the light)
          for (const [x, y, r] of lobes) {
            c.globalCompositeOperation = "destination-out"; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.globalCompositeOperation = "source-over";
            c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.rect(0, base, w, h); c.clip("evenodd");
            c.beginPath(); c.arc(x, y, r, Math.PI * 1.02, Math.PI * 1.98); c.strokeStyle = col(0.7); c.lineWidth = 1.1 * u; c.stroke();
            for (let q = 1; q <= 5; q++) {
              const rr = r * (1 - q * 0.15); if (rr <= 1) break;
              c.beginPath(); c.arc(x - r * 0.08 * q, y + r * 0.04 * q, rr, Math.PI * (1.05 + q * 0.04), Math.PI * (1.6 - q * 0.05));
              c.strokeStyle = col(0.42 - q * 0.06); c.lineWidth = u; c.stroke();
            }
            c.restore();
          }
          // flat shaded underside: a few long strokes
          c.beginPath();
          for (let q = 0; q < 4; q++) { const y = base - q * h * 0.05; let x = w * (0.1 + 0.05 * rnd()); while (x < w * 0.88) { const l = w * (0.04 + 0.1 * rnd()); c.moveTo(x, y); c.lineTo(Math.min(x + l, w * 0.9), y); x += l + w * (0.02 + 0.04 * rnd()); } }
          c.strokeStyle = col(0.3); c.lineWidth = u; c.stroke();
        } else {
          c.save(); c.beginPath(); for (const [x, y, r] of lobes) { c.moveTo(x + r * 3.2, y); c.ellipse(x, y, r * 3.2, r, 0, 0, TAU); } c.clip();
          for (let y = 2; y < h; y += 3.2 * u) {
            let x = rnd() * 10;
            while (x < w) {
              const len = 14 + rnd() * 60, a = 0.2 + 0.5 * rnd() * (1 - Math.abs(y / h - 0.4));
              c.strokeStyle = col(a); c.lineWidth = u;
              c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + len / 2, y + (rnd() - 0.5) * 2, x + len, y); c.stroke();
              x += len + 4 + rnd() * 16;
            }
          }
          c.restore();
        }
      }
      // by day: the same cloud as a soft body lit from above, its engraving in grey ink over it; a fair-weather
      // version and a grey one for rain (draws no rng: the night clouds stay exactly as they were)
      const dayBody = (lit, under) => {
        const o = mk(w, h), c = o.c;
        for (const [x, y, r] of lobes) {
          c.save(); c.translate(x, y); c.scale(cumulus ? r : r * 3.2, r);
          const g = c.createRadialGradient(0, 0, 0, 0, 0, 1.08);
          g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.78, "rgba(255,255,255,0.92)"); g.addColorStop(1, "rgba(255,255,255,0)");
          c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1.08, 0, TAU); c.fill(); c.restore();
        }
        if (cumulus) {
          // the flat base, its ends dissolving
          const g = c.createLinearGradient(w * 0.06, 0, w * 0.94, 0);
          g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.12, "rgba(255,255,255,0.95)"); g.addColorStop(0.88, "rgba(255,255,255,0.95)"); g.addColorStop(1, "rgba(255,255,255,0)");
          c.fillStyle = g; c.fillRect(w * 0.06, base - h * 0.22, w * 0.88, h * 0.2);
        }
        c.globalCompositeOperation = "source-in";
        const sh = c.createLinearGradient(0, 0, 0, h);
        sh.addColorStop(0, rgb(lit)); sh.addColorStop(0.55, rgb(U.mix(lit, under, 0.35))); sh.addColorStop(1, rgb(under));
        c.fillStyle = sh; c.fillRect(0, 0, w, h);
        c.globalCompositeOperation = "source-atop"; c.globalAlpha = 0.5; c.drawImage(ink.cv, 0, 0, w, h);
        c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
        return o;
      };
      const ink = mk(w, h);
      ink.c.drawImage(lin.cv, 0, 0, w, h);
      ink.c.globalCompositeOperation = "source-in"; ink.c.fillStyle = "rgb(46,52,66)"; ink.c.fillRect(0, 0, w, h);
      const day = dayBody(U.hex("#9ea6b4"), U.hex("#5c6476")), dayG = dayBody(U.hex("#46484c"), U.hex("#2a2c30"));
      { const c = lin.c; c.globalCompositeOperation = "source-in"; c.fillStyle = U.rgba(U.safe(U.mix(C.slate, C.bone, 0.35)), 1); c.fillRect(0, 0, w, h); c.globalCompositeOperation = "source-over"; }
      L.clouds.push({ occ, lin, day, dayG, w, h, y: H * (0.03 + 0.38 * rnd()), x0: rnd(), sp: 0.6 + 0.8 * rnd() });
    }
    // precipitation pools (state persists while drawn)
    L.rain = { n: 420, x: new Float32Array(420), y: new Float32Array(420), v: new Float32Array(420), land: new Float32Array(420) };
    L.snow = { n: 340, x: new Float32Array(340), y: new Float32Array(340), v: new Float32Array(340), r: new Float32Array(340), ph: new Float32Array(340), land: new Float32Array(340) };
    L.splash = { n: 90, x: new Float32Array(90), y: new Float32Array(90), age: new Float32Array(90).fill(9), i: 0 };
    L.prng = U.rng(4321);
    const r = L.prng;
    for (let i = 0; i < L.rain.n; i++) { L.rain.x[i] = r() * W * 1.3 - 0.15 * W; L.rain.y[i] = r() * H; L.rain.v[i] = (0.85 + 0.4 * r()) * H; L.rain.land[i] = U.lerp(T.Hy - 0.02 * H, T.Bg, r()); }
    for (let i = 0; i < L.snow.n; i++) { L.snow.x[i] = r() * W * 1.2 - 0.1 * W; L.snow.y[i] = r() * H; L.snow.v[i] = (0.03 + 0.05 * r()) * H; L.snow.r[i] = (1.1 + 1.7 * r()) * LWU; L.snow.ph[i] = r() * TAU; L.snow.land[i] = U.lerp(T.Hy, T.Bg, r()); }
    L.boltGlow = radialSprite(256, U.hex("#8f9fd6"), [[0, 1], [0.35, 0.4], [1, 0]]);
    L.fogBlack = radialSprite(256, U.hex("#000000"), [[0, 1], [0.55, 0.9], [1, 0]]);
  }

  function drawClouds(ctx, f, Ls, b, dk) {
    const a0 = U.smoothstep(0.45, 1, b);
    if (a0 <= 0.004 || WX.cloud < 0.01) return;
    const lit = (0.35 + 0.45 * Math.max(Ls.mI, Ls.amb) + 0.2 * Ls.dusk) * (1 - 0.3 * WX.storm) + 0.6 * FLASH;
    const speed = (6 + WX.wind * 0.9) * (W / 1600);
    const n = L.clouds.length;
    for (let i = 0; i < n; i++) {
      const cl = L.clouds[i];
      const on = U.smoothstep(i / n * 0.9, i / n * 0.9 + 0.16, WX.cloud);
      if (on <= 0.004) continue;
      const span = W + cl.w;
      const x = ((cl.x0 * span + f.t * speed * cl.sp) % span + span) % span - cl.w;
      const y = cl.y + Math.sin(f.t * 0.01 + i) * 0.006 * H;
      const nA = a0 * on * (1 - dk), dA = a0 * on * dk * (1 - U.smoothstep(0.1, 0.6, WX.fog));
      if (nA > 0.004) {
        ctx.globalAlpha = U.clamp(nA); ctx.drawImage(cl.occ.cv, x, y, cl.w, cl.h);
        ctx.globalAlpha = U.clamp(nA * lit); ctx.drawImage(cl.lin.cv, x, y, cl.w, cl.h);
      }
      if (dA > 0.004) {
        // by day: pale bodies, greyed by rain and darkened by a storm
        const grey = U.clamp(U.smoothstep(0.35, 0.9, WX.cloud) + 0.6 * WX.rain + WX.storm + 0.6 * WX.snow);
        // under a full deck the banks are only modelling in the grey, not bright shapes on it
        const ca = dA * (0.9 - 0.45 * U.smoothstep(0.5, 1, WX.cloud));
        if (grey < 0.995) { ctx.globalAlpha = U.clamp(ca * (1 - grey)); ctx.drawImage(cl.day.cv, x, y, cl.w, cl.h); }
        if (grey > 0.005) { ctx.globalAlpha = U.clamp(ca * grey); ctx.drawImage(cl.dayG.cv, x, y, cl.w, cl.h); }
      }
    }
    ctx.globalAlpha = 1;
  }

  // lightning: rare, dim, distant. Deterministic from time slots of 9 s. Each strike has a distance d (0.4..1):
  // the farther, the dimmer the flash, and its thunder (cued on the flash) arrives d x 5 s later.
  function lightning(t) {
    if (WX.storm < 0.02) return null;
    const slot = Math.floor(t / 9), r = U.rng(slot * 7919 + 13);
    if (r() > 0.3) return null;
    const t0 = slot * 9 + 1 + r() * 6, u = t - t0;
    if (u < 0 || u > 1.2) return null;
    const fl = Math.exp(-u * 9) + (u > 0.16 ? 0.7 * Math.exp(-(u - 0.16) * 7) : 0);
    const side = r() < 0.5 ? 0.05 + 0.25 * r() : 0.72 + 0.23 * r();
    const d = 0.4 + 0.6 * r();
    return { fl: U.clamp(fl) * WX.storm * (1 - 0.45 * (d - 0.4) / 0.6), x: side * W, seed: slot, u, d };
  }
  function drawLightning(ctx, Lt, b) {
    const a = U.smoothstep(0.7, 1, b) * Lt.fl;
    if (a <= 0.01) return;
    // the far sky glows behind the clouds
    const gr = 0.42 * H;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, T.Hy + 0.02 * H); ctx.clip();
    ctx.globalAlpha = U.clamp(0.11 * a); ctx.drawImage(L.boltGlow, Lt.x - gr, T.Hy - 0.2 * H - gr, gr * 2, gr * 2);
    // a thin, distant fork down to the horizon
    const r = U.rng(Lt.seed * 31 + 5), bc = U.safe(U.hex("#9aa8d8"));
    let x = Lt.x + (r() - 0.5) * 0.04 * W, y = 0.12 * H;
    ctx.globalAlpha = 1; ctx.strokeStyle = U.rgba(bc, 0.5 * a); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(x, y);
    while (y < T.Hy - 0.01 * H) { x += (r() - 0.5) * 0.025 * W; y += (0.03 + 0.04 * r()) * H; ctx.lineTo(x, Math.min(y, T.Hy - 0.01 * H)); }
    ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawFog(ctx, Ls, b, dk, dA) {
    // by day: a milky veil that swallows the distance first, the column bases after
    const md = WX.fog * dA;
    if (md > 0.01) {
      const mc = U.safe(SKYH ? U.scale(SKYH, 1.08) : U.hex("#3e4248")), y0 = T.Hy - 0.3 * H;
      const g = ctx.createLinearGradient(0, y0, 0, H);
      // the far plain and its trees go first, the temple's upper half softens, the foreground keeps its ink
      ctx.globalAlpha = U.clamp(md);
      ctx.fillStyle = U.rgba(mc, 0.62); for (const cp of T.cyp) { polyPath(ctx, cp.sil); ctx.fill(); }
      for (const ol of T.olives) { for (const k of ol.clumps) { clumpPath(ctx, k); ctx.fill(); } polyPath(ctx, ol.trunk); ctx.fill(); }
      ctx.fillStyle = U.rgba(mc, 0.7);
      for (const pts of [L.hillB, L.hillA]) { ctx.beginPath(); ctx.moveTo(pts[0][0], T.Hy + 2); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.lineTo(pts[pts.length - 1][0], T.Hy + 2); ctx.closePath(); ctx.fill(); }
      g.addColorStop(0, U.rgba(mc, 0.35)); g.addColorStop(0.3, U.rgba(mc, 0.62)); g.addColorStop(0.44, U.rgba(mc, 0.88)); g.addColorStop(0.56, U.rgba(mc, 0.6)); g.addColorStop(0.75, U.rgba(mc, 0.3)); g.addColorStop(1, U.rgba(mc, 0.08));
      ctx.fillStyle = g; ctx.fillRect(0, y0, W, H - y0);
      ctx.globalAlpha = 1;
    }
    const a = U.smoothstep(0.6, 1, b) * WX.fog * (1 - dk);
    if (a <= 0.01) return;
    // the far cypresses fade into it
    ctx.fillStyle = `rgba(0,0,0,${U.clamp(0.62 * a)})`;
    for (const cp of T.cyp) { polyPath(ctx, cp.sil); ctx.fill(); }
    // the column bases are swallowed: a soft dark veil (no edges anywhere), then the lit haze over it
    ctx.globalAlpha = U.clamp(0.95 * a);
    ctx.drawImage(L.fogBlack, T.tcx - 0.8 * W, T.Sy - 0.16 * H, 1.6 * W, 0.42 * H);
    ctx.globalAlpha = U.clamp(0.07 * a);
    ctx.drawImage(L.mistTint.cv, T.tcx - 0.85 * W, T.Sy - 0.18 * H, 1.7 * W, 0.44 * H);
    ctx.globalAlpha = U.clamp(0.05 * a);
    ctx.drawImage(L.mistTint.cv, T.tcx - 0.45 * W, T.Sy - 0.07 * H, 0.9 * W, 0.2 * H);
    ctx.globalAlpha = 1;
  }

  function drawPrecip(ctx, f, Ls, b, dk) {
    const a0 = U.smoothstep(0.6, 1, b);
    if (a0 <= 0.004) return;
    const dt = Math.min(0.05, f.dt || 0.016), r = L.prng;
    const slant = U.clamp(WX.wind / 55, 0, 0.85);
    const lit = 0.45 + 0.35 * Math.max(Ls.I, Ls.amb);
    // ---- rain
    if (WX.rain > 0.01) {
      const R = L.rain, n = Math.round(R.n * Math.pow(WX.rain, 0.85));
      const len = (0.016 + 0.02 * WX.rain) * H;
      const rc = U.safe(U.mix(C.slate, C.bone, 0.3 + 0.3 * Ls.I));
      ctx.lineWidth = 1;
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let i = pass; i < n; i += 2) {
          R.y[i] += R.v[i] * dt; R.x[i] += R.v[i] * slant * dt;
          if (R.y[i] > R.land[i]) {
            if (R.land[i] > T.Sy - 0.01 * H && R.x[i] > 0 && R.x[i] < W) { const s = L.splash; s.x[s.i] = R.x[i]; s.y[s.i] = R.land[i]; s.age[s.i] = 0; s.i = (s.i + 1) % s.n; }
            R.y[i] = -len - r() * 0.2 * H; R.x[i] = r() * W * 1.3 - 0.3 * W * slant - 0.05 * W;
            R.land[i] = U.lerp(T.Hy - 0.02 * H, T.Bg, r());
          }
          const x = R.x[i], y = R.y[i];
          ctx.moveTo(x, y); ctx.lineTo(x - slant * len, y - len);
        }
        ctx.strokeStyle = U.rgba(rc, a0 * lit * (0.05 + 0.2 * WX.rain) * (pass ? 0.65 : 1));
        ctx.stroke();
      }
      // splashes: tiny crowns on the steps and the ground
      const s = L.splash;
      ctx.beginPath();
      for (let i = 0; i < s.n; i++) {
        if (s.age[i] > 0.3) continue;
        s.age[i] += dt;
        const k = s.age[i] / 0.3, rr = 1.5 + 3 * k;
        ctx.moveTo(s.x[i] - rr, s.y[i]); ctx.quadraticCurveTo(s.x[i] - rr * 0.5, s.y[i] - rr * 0.9, s.x[i], s.y[i] - 0.3);
        ctx.moveTo(s.x[i] + rr, s.y[i]); ctx.quadraticCurveTo(s.x[i] + rr * 0.5, s.y[i] - rr * 0.9, s.x[i], s.y[i] - 0.3);
      }
      ctx.strokeStyle = U.rgba(rc, a0 * lit * 0.28 * WX.rain); ctx.stroke();
    }
    // ---- snow
    if (WX.snow > 0.01) {
      const S = L.snow, n = Math.round(S.n * WX.snow);
      const drift = WX.wind * 0.9 * (W / 1600);
      let sc = U.safe(U.mix(C.slate, C.bone, 0.45 + 0.3 * Ls.I));
      if (dk > 0) sc = U.mix(sc, U.hex("#a4acba"), dk); // by day: cool and pale against the grey
      ctx.fillStyle = U.rgba(sc, a0 * lit * 0.95);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        S.y[i] += S.v[i] * dt; S.x[i] += (drift + Math.sin(f.t * 0.7 + S.ph[i]) * 12) * dt;
        if (S.y[i] > S.land[i]) { S.y[i] = -4 - r() * 0.1 * H; S.x[i] = r() * W * 1.2 - 0.1 * W; S.land[i] = U.lerp(T.Hy, T.Bg, r()); }
        if (S.x[i] > W + 10) S.x[i] -= W + 20;
        const rr = S.r[i];
        ctx.moveTo(S.x[i] + rr, S.y[i]); ctx.arc(S.x[i], S.y[i], rr, 0, TAU);
      }
      ctx.fill();
      // by day each flake is a soft tuft, not a point of light
      if (dk > 0.01) {
        ctx.fillStyle = U.rgba(sc, a0 * lit * 0.3 * dk); ctx.beginPath();
        for (let i = 0; i < n; i++) { const rr = S.r[i] * 2.1; ctx.moveTo(S.x[i] + rr, S.y[i]); ctx.arc(S.x[i], S.y[i], rr, 0, TAU); }
        ctx.fill();
      }
    }
  }

  // snow settling on the upward faces of the ruin
  function drawSnowAcc(ctx, Ls, b) {
    const a = U.smoothstep(0.6, 1, b) * U.smoothstep(0.05, 0.6, WX.acc);
    if (a <= 0.01) return;
    const sc = U.safe(U.mix(C.slate, C.bone, 0.5 + 0.3 * Ls.I));
    ctx.beginPath();
    for (const e of T.tops) { ctx.moveTo(e[0][0], e[0][1] - 1.2); for (let i = 1; i < e.length; i++) ctx.lineTo(e[i][0], e[i][1] - 1.2); }
    ctx.lineCap = "round"; ctx.lineWidth = 2.6 * LWU; ctx.strokeStyle = U.rgba(sc, 0.62 * a); ctx.stroke(); ctx.lineCap = "butt";
  }

  // ------------------------------------------------------------------ the ruin cat (THEMES.md "The cat")
  // One of the temple's cats, close to the viewer in the left foreground: it sits on a fluted column drum set on
  // end (a stool of marble the excavators left), the ruin behind it. The drum appears with the cat. By night both
  // are engraved in the moonlight like the rest of the plate and the cat is rim-lit from the moon's real place in
  // the sky (its eyes catch it); by day the stone is washed limestone, sun-warmed, the cat lit by the sun with a
  // warm rim at golden hour and a contact shadow. As the night wears on it loafs, then curls up asleep on the stone.
  let CAT = null;
  function catPlace() {
    const R = 0.1 * H, x = Math.max(0.155 * W, 0.2 * H + R * 0.35);
    return { x, R, ry: 0.3 * R, ty: 0.905 * H, h: 0.08 * H, size: 0.125 * H };
  }
  function drawCat(ctx, f, Ls, P, b, dk, dA) {
    const fc = f.cat;
    const aN = U.smoothstep(0.34, 0.95, b) * (1 - dk);   // the night plate's presence (as drawScene)
    const a = U.clamp(aN + dA);                          // plus the day plate (and its faint work backdrop)
    const pa = (fc ? fc.a : 0) * a;
    if (pa > 0.004) drawPerch(ctx, Ls, P, aN * (fc.a), dA * (fc.a), pa, dk, dA);
    // the light on the cat
    const p = catPlace();
    const src = Ls.src && Ls.I > 0.02 ? Ls.src : null, I = Ls.I;
    const Az = src ? src.az * RAD : 0, alt = src ? Math.max(0, src.alt) : 0;
    const back = src ? Math.max(0, -Math.cos(Az)) : 0;                // the light behind the ruin: a strong rim
    const front = src ? Math.max(0, Math.cos(Az) * Math.cos(alt * RAD)) : 0;
    const top = src ? Math.sin(U.clamp(alt, 0, 90) * RAD) : 0;
    const cy = p.ty - 0.5 * p.size;
    let dx = 0.3, dy = -1;
    if (src) { dx = skyX(src.az) - p.x; dy = Math.min(-0.15 * H, skyY(src.alt) - cy); }
    const litCol = Ls.warm ? U.mix(C.candle, C.straw, 0.35) : C.bone;
    const wet = U.clamp(0.12 * WX.rain + 0.25 * WX.storm + 0.3 * WX.fog);
    const sunW = U.smoothstep(-0.5, 3, Ls.sun.alt) * (1 - 0.88 * U.smoothstep(0.45, 0.95, WX.cloud)) * (1 - 0.9 * U.smoothstep(0.1, 0.7, WX.fog));
    // night: moonlight (or starlight) on a dark coat; day: the sun-warmed afternoon
    const lightN = 0.17 + 0.08 * Ls.amb + 0.16 * I * (0.5 + 0.5 * Math.max(front, 0.7 * top));
    const lightD = (0.58 + 0.3 * sunW) * (P ? P.k : 1) * (1 - 0.5 * wet);
    const sunCol = P ? U.mix(P.glow, P.stoneL, 0.4) : litCol;
    const rims = [];
    if (src) {
      // the key light's edge: moonlight by night; by day the sun, a warm gold rim when it is low
      const low = 1 - U.smoothstep(4, 22, Ls.sun.alt);
      const rimN = 0.34 + 0.56 * I * (0.45 + 0.55 * back), rimD = sunW * (0.22 + 0.28 * back + 0.3 * low);
      const rc = Ls.warm ? U.mix(sunCol, C.candle, 0.5 * low) : litCol;
      rims.push({ color: U.safe(rc), a: U.clamp(U.lerp(rimN, rimD, dk)), dx, dy, width: U.lerp(0.04, 0.03 + 0.008 * low, dk) });
    }
    // the open sky: a cool edge along the top and back, all night (what keeps a black cat on a black wall)
    rims.push({ color: U.safe(U.mix(C.slate, C.starBlue, 0.4)), a: (0.3 + 0.22 * (1 - I)) * (1 - dk), dx: -0.35, dy: -1, width: 0.03 });
    if (!CAT) CAT = AW.cat.create(4207);
    CAT.draw(ctx, f, {
      x: p.x, y: p.ty + 0.12 * p.ry, size: p.size, facing: 1,
      light: U.lerp(lightN, lightD, dk),
      tint: U.mix(litCol, sunCol, dk), tintAmt: U.lerp(0.3, 0.22, dk),
      rim: rims,
      glow: (1 - dk) * (0.32 + 0.5 * Ls.mI),
      shadow: dk * (0.35 + 0.5 * sunW),
      alpha: a,
    });
    // fog: the near air is a little milky too
    if (WX.fog > 0.02 && pa > 0.004) {
      const mc = U.safe(U.mix(U.mix(C.slate, C.bone, 0.4 + 0.4 * I), SKYH || C.slate, dk));
      const g = ctx.createRadialGradient(p.x, p.ty - 0.3 * p.size, 0, p.x, p.ty - 0.3 * p.size, 1.6 * p.size);
      g.addColorStop(0, U.rgba(mc, 0.16 * WX.fog * pa)); g.addColorStop(1, U.rgba(mc, 0));
      ctx.fillStyle = g; ctx.fillRect(p.x - 1.6 * p.size, p.ty - 1.9 * p.size, 3.2 * p.size, 3.2 * p.size);
    }
  }
  // the drum the cat sits on: a fluted marble drum standing on end, a chip out of its rim, grass at its foot
  function drawPerch(ctx, Ls, P, aN, aD, a, dk, dA) {
    const p = catPlace(), x = p.x, R = p.R, ry = p.ry, ty = p.ty, by = ty + p.h, u = LWU;
    const src = Ls.src && Ls.I > 0.02 ? Ls.src : null, I = Ls.I;
    const Az = src ? src.az * RAD : 0, ca = Math.cos((src ? Math.max(0, src.alt) : 0) * RAD);
    const lamAt = (th) => (src ? Math.max(0, Math.cos(th + Az) * ca) : 0);
    const lamTop = src ? Math.sin(U.clamp(src.alt, 0, 90) * RAD) * 0.7 + 0.3 * U.smoothstep(-1, 6, src.alt) : 0;
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(x - R, ty); ctx.lineTo(x - R, by); ctx.ellipse(x, by, R, ry, 0, Math.PI, 0, true); ctx.lineTo(x + R, ty);
      ctx.ellipse(x, ty, R, ry, 0, 0, Math.PI, true); ctx.closePath();
    };
    const topE = () => { ctx.beginPath(); ctx.ellipse(x, ty, R, ry, 0, 0, TAU); };
    ctx.save();
    // by day the drum and its cat throw a shadow across the ground, away from the sun (as the ruin's own shadows)
    if (aD > 0.004 && P && Ls.sun.alt > 0.3) {
      const sunny = U.smoothstep(0.3, 4, Ls.sun.alt) * (1 - 0.88 * U.smoothstep(0.45, 0.95, WX.cloud)) * (1 - 0.9 * U.smoothstep(0.1, 0.7, WX.fog));
      if (sunny > 0.01) {
        const sAz = Ls.sun.az * RAD, cc = Math.min(1 / Math.tan(Math.max(Ls.sun.alt, 0.3) * RAD), 12);
        const vx = Math.sin(sAz) * cc, vy = -Math.cos(sAz) * T.kz * cc;   // per px of height
        const hc = 0.85 * p.size;                                         // the cat above the stone
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) { const k = i / 12 * p.h; ctx.moveTo(x + vx * k + R, by + vy * k); ctx.ellipse(x + vx * k, by + vy * k, R, ry, 0, 0, TAU); }
        for (let i = 0; i <= 10; i++) {
          const k = p.h + i / 10 * hc, w = 0.3 * p.size * (1 - 0.55 * Math.pow(i / 10, 2));
          ctx.moveTo(x + vx * k + w, by + vy * k); ctx.ellipse(x + vx * k, by + vy * k, w, w * 0.4, 0, 0, TAU);
        }
        ctx.globalAlpha = U.clamp(0.42 * sunny * aD); ctx.fillStyle = "rgb(8,7,14)"; ctx.fill();
      }
    }
    // the stone hides the plain behind it
    ctx.globalAlpha = U.clamp(a); ctx.fillStyle = "#000"; body(); ctx.fill();
    const NF = 20, fl = [];
    for (let k = 0; k < NF; k++) { const th = -Math.PI / 2 + (k + 0.5) * Math.PI / NF; fl.push(th); }
    // ---- by day: the limestone wash, then sepia ink
    if (aD > 0.004 && P) {
      const sunny = U.smoothstep(-0.5, 4, Ls.sun.alt) * (1 - 0.88 * U.smoothstep(0.45, 0.95, WX.cloud)) * (1 - 0.9 * U.smoothstep(0.1, 0.7, WX.fog));
      const sAz = Ls.sun.az * RAD, sca = Math.cos(Math.max(0, Ls.sun.alt) * RAD);
      const lamD = (th) => sunny * Math.max(0, Math.cos(th + sAz) * sca);
      const lTop = sunny * (Math.sin(U.clamp(Ls.sun.alt, 0, 90) * RAD) * 0.75 + 0.25 * U.smoothstep(-1, 6, Ls.sun.alt));
      const wet = 1 - U.clamp(0.18 * U.smoothstep(0.45, 0.95, WX.cloud) + 0.3 * WX.fog + 0.12 * WX.rain + 0.25 * WX.storm + 0.3 * WX.snow);
      // the near foreground stays a little in its own shade (it keeps the day inside the budget)
      const stone = (ae, lam) => U.scale(U.mix(P.stoneS, P.stoneL, U.clamp(0.3 * ae + 0.72 * lam + 0.16 * lTop)), 0.74 * wet);
      ctx.globalAlpha = U.clamp(aD);
      // the round of the drum: each flank by its own light, turning darker toward the silhouette
      const g = ctx.createLinearGradient(x - R, 0, x + R, 0);
      for (let k = 0; k <= 8; k++) { const th = -Math.PI / 2 + k * Math.PI / 8; g.addColorStop((Math.sin(th) + 1) / 2, rgb(U.scale(stone(0.6, lamD(th)), 0.72 + 0.28 * Math.cos(th)))); }
      ctx.fillStyle = g; body(); ctx.fill();
      ctx.fillStyle = rgb(stone(1, lTop)); topE(); ctx.fill();
      const ink = U.safe(INK);
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.strokeStyle = U.rgba(ink, 0.85); ctx.lineWidth = 1.3 * u; body(); ctx.stroke(); topE(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, ty, R * 0.86, ry * 0.86, 0, 0, TAU); ctx.strokeStyle = U.rgba(ink, 0.3); ctx.lineWidth = u; ctx.stroke();
      // flutes: arrises in ink, the ones turned from the sun hatched
      ctx.beginPath();
      for (const th of fl) { const fx = x + R * Math.sin(th), oy = ry * Math.cos(th); ctx.moveTo(fx, ty + oy + 1); ctx.lineTo(fx, by + oy - 1); }
      ctx.strokeStyle = U.rgba(ink, 0.42); ctx.lineWidth = u; ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < NF - 1; k++) {
        const th = (fl[k] + fl[k + 1]) / 2;
        if (lamD(th) > 0.3 || Math.abs(Math.sin(th)) < 0.55) continue;
        const fx = x + R * Math.sin(th), oy = ry * Math.cos(th);
        for (let y = ty + oy + 5 * u; y < by + oy - 2; y += 6 * u) { ctx.moveTo(fx - 1.4 * u, y); ctx.lineTo(fx + 1.4 * u, y + 2 * u); }
      }
      ctx.strokeStyle = U.rgba(ink, 0.28); ctx.stroke();
    }
    // ---- by night: engraved lines, the light the lines carry
    if (aN > 0.004) {
      const litCol = Ls.warm ? U.mix(C.candle, C.straw, 0.35) : C.bone;
      const lc = U.safe(litCol), oc = U.safe(U.mix(C.slate, litCol, U.clamp(0.25 + 0.55 * I + 0.25 * Ls.warm * I)));
      const outA = U.clamp(0.6 + 0.2 * Ls.amb + 0.16 * I);
      const st = (col, al, lw) => { ctx.strokeStyle = U.rgba(col, U.clamp(al)); ctx.lineWidth = (lw || 1) * u; ctx.stroke(); };
      ctx.globalAlpha = U.clamp(aN); ctx.lineJoin = "round"; ctx.lineCap = "round";
      // the top, lit from above: tread-like hatching inside the rim
      const tA = 0.06 + 0.12 * Ls.amb + 0.5 * I * (0.45 + 0.55 * lamTop);
      ctx.save(); topE(); ctx.clip();
      ctx.beginPath(); for (let y = ty - ry + 3 * u; y < ty + ry; y += 3.2 * u) { ctx.moveTo(x - R, y); ctx.lineTo(x + R, y); }
      st(lc, tA * 0.7, 1); ctx.restore();
      // flutes: the lit flank bright, the far one barely there
      ctx.beginPath();
      for (const th of fl) {
        const v = 0.12 + 0.1 * Ls.amb + 0.8 * I * lamAt(th);
        if (v < 0.16) continue;
        const fx = x + R * Math.sin(th), oy = ry * Math.cos(th); ctx.moveTo(fx, ty + oy + 2); ctx.lineTo(fx, by + oy - 2);
      }
      st(lc, 0.35, 1);
      ctx.beginPath();
      for (const th of fl) { const fx = x + R * Math.sin(th), oy = ry * Math.cos(th); ctx.moveTo(fx, ty + oy + 2); ctx.lineTo(fx, by + oy - 2); }
      st(oc, 0.16 * outA, 1);
      // outline: soft halo + crisp core, as the rest of the plate
      body(); st(oc, outA * 0.12, 3.3); st(oc, outA * 0.9, 1.1);
      topE(); st(oc, outA * 0.12, 3.3); st(oc, outA * 0.95, 1.1);
      ctx.beginPath(); ctx.ellipse(x, ty, R * 0.86, ry * 0.86, 0, 0, TAU); st(oc, outA * 0.35, 1);
    }
    // ---- shared detail: a chip out of the rim, a crack, grass and a poppy at the foot
    {
      const ink = U.mix(U.safe(U.mix(C.slate, Ls.warm ? C.candle : C.bone, 0.3 + 0.5 * I)), U.safe(INK), dk);
      ctx.globalAlpha = U.clamp(a);
      ctx.beginPath();
      const cx0 = x - 0.62 * R, cyy = ty + ry * 0.78;
      ctx.moveTo(cx0 - 0.1 * R, cyy + 0.02 * R); ctx.lineTo(cx0 - 0.02 * R, cyy + 0.12 * R); ctx.lineTo(cx0 + 0.12 * R, cyy + 0.1 * R); ctx.lineTo(cx0 + 0.16 * R, cyy - 0.01 * R);
      ctx.moveTo(x + 0.3 * R, ty + ry * 0.95); ctx.lineTo(x + 0.27 * R, ty + ry + 0.25 * p.h); ctx.lineTo(x + 0.33 * R, ty + ry + 0.5 * p.h); ctx.lineTo(x + 0.3 * R, ty + ry + 0.66 * p.h);
      ctx.strokeStyle = U.rgba(ink, 0.6); ctx.lineWidth = u; ctx.stroke();
      // a tuft of dry grass at the foot, a poppy by day
      const gc = U.mix(U.safe(U.mix(C.slate, C.straw, 0.35 + 0.4 * I)), P ? U.safe(P.dry) : C.straw, dk);
      ctx.beginPath();
      const gx = x + 0.82 * R, gy = by + ry * 0.55;
      for (let k = 0; k < 7; k++) { const an = -Math.PI / 2 + (k - 3) * 0.2, l = (0.22 + 0.08 * ((k * 5) % 3)) * R; ctx.moveTo(gx + (k - 3) * 1.6 * u, gy); ctx.quadraticCurveTo(gx + (k - 3) * 2.4 * u, gy - l * 0.6, gx + Math.cos(an) * l, gy + Math.sin(an) * l); }
      ctx.strokeStyle = U.rgba(gc, 0.6 + 0.25 * dk); ctx.lineWidth = u; ctx.stroke();
      if (dk > 0.05 && P) { ctx.fillStyle = U.rgba(U.safe(U.scale(U.hex("#b8342a"), P.k)), dk * 0.9); ctx.beginPath(); ctx.arc(gx + 0.05 * R, gy - 0.36 * R, 0.035 * R, 0, TAU); ctx.fill(); }
    }
    // ---- snow lies on the drum's top
    const sn = U.smoothstep(0.05, 0.6, WX.acc);
    if (sn > 0.01) {
      let sc = U.safe(U.mix(C.slate, C.bone, 0.5 + 0.3 * I));
      if (dk > 0) sc = U.mix(sc, U.scale(U.hex("#a4acba"), P ? P.k : 1), dk);
      // a soft cap, thicker in the middle, with a drift line along the front lip
      ctx.globalAlpha = U.clamp(a * sn * (0.16 + 0.12 * dk)); ctx.fillStyle = rgb(sc);
      ctx.beginPath(); ctx.ellipse(x, ty + 0.04 * ry, R * 0.96, ry * 0.9, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x - 0.05 * R, ty - 0.02 * ry, R * 0.7, ry * 0.62, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, ty, R * 0.97, ry * 0.95, 0, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.strokeStyle = rgb(sc); ctx.lineWidth = 2.4 * u; ctx.lineCap = "round";
      ctx.globalAlpha = U.clamp(a * sn * (0.5 + 0.1 * dk)); ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ daytime: the temple under the Mediterranean sun
  // By day the plate is a hand-coloured engraving: a light watercolour wash (warm limestone, ochre earth, deep
  // cypress green, silvery olives) under dark sepia linework, the shade sides hatched, the cast shadows hatched
  // and washed cool. The wash is baked offscreen twice: lit by the real sun (keyed by its position, cross-faded
  // on re-bake) and lit only by the open sky (for overcast); weather cross-fades between them. The sky and its
  // weather are drawn live. Everything rides on frame.day (dk): at night dk = 0 and none of this runs.
  // Keyframes by sun altitude (deg): sky zenith and horizon, the sun's glow, sunlit and shaded limestone, sunlit
  // earth, the far haze, and an overall daylight level k. Dim by design (rule 2: mean under 25 + 20 * day).
  // The hues are chosen for the budget: a deep ultramarine sky and terra-rossa earth read as strong daylight while
  // costing little luminance (blue and red weigh least in it); the sunlit limestone is the one bright thing.
  const DKF = [
    // alt   top            hor              glow            gA    stoneL           stoneS          earth           far            k
    [-6, [5, 8, 30], [24, 22, 48], [130, 64, 76], 0.2, [76, 62, 74], [28, 28, 40], [22, 14, 20], [26, 24, 42], 0.42],
    [-1, [10, 14, 56], [86, 48, 46], [204, 98, 54], 0.38, [180, 106, 62], [54, 40, 44], [62, 32, 26], [58, 42, 50], 0.66],
    [4, [10, 20, 76], [104, 66, 56], [214, 138, 66], 0.4, [212, 142, 76], [74, 56, 48], [96, 50, 28], [76, 60, 62], 0.84],
    [12, [9, 22, 86], [48, 58, 96], [212, 176, 110], 0.3, [210, 168, 108], [78, 64, 58], [100, 52, 28], [56, 60, 82], 0.95],
    [25, [8, 22, 92], [36, 54, 104], [214, 196, 140], 0.24, [208, 176, 122], [82, 68, 62], [104, 54, 28], [50, 60, 86], 1],
    [45, [8, 22, 94], [34, 54, 106], [214, 200, 150], 0.22, [208, 180, 128], [84, 70, 64], [106, 54, 28], [48, 60, 88], 1],
  ];
  const EXPO = 0.88;                      // the day palette's exposure (the keyframes are tuned against the budget)
  const DAY_WORK = 0.18;                  // the work backdrop: this much of the ambient day scene
  const INK = U.hex("#1c140e");           // sepia engraving ink
  const rgb = (c) => `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`;
  const arr = (a) => ({ r: a[0], g: a[1], b: a[2] });
  function dayPal(alt) {
    let i = 0;
    while (i < DKF.length - 2 && alt > DKF[i + 1][0]) i++;
    const A = DKF[i], B = DKF[i + 1], u = U.smoothstep(A[0], B[0], alt);
    const m = (j, k) => U.scale(U.mix(arr(A[j]), arr(B[j]), u), k == null ? EXPO : k);
    const k = U.lerp(A[9], B[9], u);
    return {
      alt, k, top: m(1), hor: m(2), glow: m(3, 1), gA: U.lerp(A[4], B[4], u),
      stoneL: m(5), stoneS: m(6), earth: m(7), far: m(8),
      cyp: U.scale(U.hex("#16301e"), k), cypL: U.scale(U.hex("#4a6c34"), k),
      olive: U.scale(U.hex("#5e6c58"), k), oliveL: U.scale(U.hex("#a8b08c"), k),
      bark: U.scale(U.hex("#4e463c"), k), green: U.scale(U.hex("#567436"), k), dry: U.scale(U.hex("#a89a58"), k),
    };
  }
  // the sky colour for this sun and this weather: overcast greys it, rain darkens, a storm goes slate, fog milky
  let SKYH = null; // the day horizon's colour as last drawn (the fog veil matches it)
  function daySky(P) {
    const cov = U.smoothstep(0.3, 0.95, WX.cloud), k = P.k * EXPO;
    let top = U.mix(P.top, U.scale(U.hex("#282a2e"), k), cov), hor = U.mix(P.hor, U.scale(U.hex("#36383c"), k), cov);
    const wet = U.clamp(WX.rain * 0.8 + WX.storm);
    top = U.mix(top, U.scale(top, 0.74), wet * (1 - WX.storm)); hor = U.mix(hor, U.scale(hor, 0.78), wet * (1 - WX.storm));
    top = U.mix(top, U.scale(U.hex("#141822"), k), WX.storm); hor = U.mix(hor, U.scale(U.hex("#262a34"), k), WX.storm);
    const sn = U.clamp(WX.snow * 1.4);
    top = U.mix(top, U.scale(U.hex("#2e2f32"), k), sn); hor = U.mix(hor, U.scale(U.hex("#38393c"), k), sn);
    const milk = U.scale(U.hex("#38393c"), k);
    const fg = U.smoothstep(0.1, 0.6, WX.fog);
    top = U.mix(top, U.scale(milk, 0.92), fg); hor = U.mix(hor, milk, fg);
    SKYH = hor;
    return { top, hor, cov };
  }

  // the day plate. sunny: lit by the sun at its real azimuth and altitude, with cast shadows; else by the sky alone
  function paintDay(o, Ls, P, sunny) {
    const s = o.c, D = T.D, u = LWU;
    s.setTransform(dpr, 0, 0, dpr, 0, 0); s.globalCompositeOperation = "source-over"; s.globalAlpha = 1;
    s.clearRect(0, 0, W, H); s.lineJoin = "round"; s.lineCap = "round";
    const sun = Ls.sun, I = sunny ? U.smoothstep(-0.5, 4, sun.alt) : 0;
    const alt = Math.max(0, sun.alt), Az = sun.az * RAD;
    const ca = Math.cos(alt * RAD), sinA = Math.sin(Az), cosA = Math.cos(Az);
    const lamFront = I * Math.max(0, cosA * ca);
    const lamTop = I * (Math.sin(U.clamp(alt, 0, 90) * RAD) * 0.75 + 0.25 * U.smoothstep(-1, 6, sun.alt));
    const lamAt = (th) => I * Math.max(0, Math.cos(th + Az) * ca);
    const rim = I * Math.max(0, -cosA);
    const bounce = 0.2 * lamTop;             // the sunlit ground throws warm light back up into the shade
    const amb = sunny ? 0.3 : 0.38;
    const stone = (ae, lam) => U.mix(P.stoneS, P.stoneL, U.clamp(amb * ae + 0.8 * lam + bounce));
    const ink = U.safe(INK);
    const st = (c, a, lw) => { s.strokeStyle = U.rgba(c, U.clamp(a)); s.lineWidth = (lw || 1) * u; s.stroke(); };

    // ---- the earth: sunlit terra rossa, hazing to the far horizon, darker toward the viewer's feet
    if (!sunny) P = Object.assign({}, P, { far: U.mix(P.far, U.scale(U.hex("#50555e"), P.k * EXPO), 0.6), hor: U.mix(P.hor, U.scale(U.hex("#50555e"), P.k * EXPO), 0.7), top: U.scale(U.hex("#30353e"), P.k * EXPO) });
    const earthS = U.mix(U.scale(P.earth, 0.52), P.top, 0.22);
    const earth = U.mix(earthS, P.earth, U.clamp(amb + 0.85 * lamTop));
    {
      const g = s.createLinearGradient(0, T.Hy, 0, H);
      g.addColorStop(0, rgb(U.mix(P.far, earth, 0.2))); g.addColorStop(0.1, rgb(U.mix(P.far, earth, 0.75)));
      g.addColorStop(0.28, rgb(earth)); g.addColorStop(0.55, rgb(U.scale(earth, 0.66))); g.addColorStop(0.8, rgb(U.scale(earth, 0.36))); g.addColorStop(1, rgb(U.scale(earth, 0.2)));
      s.fillStyle = g; s.fillRect(0, T.Hy - 1, W, H - T.Hy + 1);
      // the stipple of the plate, in ink, with a few sun glints
      const rnd = U.rng(3131), N = Math.round(16000 * (W * H) / (1600 * 900));
      const p0 = new Path2D(), p1 = new Path2D(), p2 = new Path2D(), ds = 0.9 * u;
      for (let k = 0; k < N; k++) {
        const v = Math.pow(rnd(), 0.75), y = T.Hy + (H - T.Hy) * v, x = rnd() * W;
        const dxm = (x - T.tcx) / (0.5 * W), p = Math.exp(-dxm * dxm) * (0.35 + 0.65 * v), r = rnd();
        if (rnd() > p) continue;
        (r < 0.45 ? p0 : r < 0.9 ? p1 : p2).rect(x, y, ds, ds);
      }
      s.fillStyle = U.rgba(ink, 0.4); s.fill(p0); s.fillStyle = U.rgba(ink, 0.7); s.fill(p1);
      s.fillStyle = U.rgba(U.safe(P.stoneL), 0.08 + 0.3 * I); s.fill(p2);
      s.beginPath();
      for (let k = 1; k <= 18; k++) {
        const v = k / 18, y = T.Hy + (H - T.Hy) * Math.pow(v, 1.4);
        let x = -rnd() * 0.05 * W;
        while (x < W) { const len = W * (0.01 + 0.03 * rnd()), gap = W * (0.02 + 0.05 * rnd()); s.moveTo(x, y); s.lineTo(x + len, y + (rnd() - 0.5) * 1.2); x += len + gap; }
      }
      st(ink, 0.2, 1);
    }

    // ---- cast shadows: one mask (no double darkening where they overlap). Laid on after the steps (below) as
    // translucent shade: a cool multiply (about half the lit ground, the stipple showing through), a sky-blue
    // wash, ink hatching carrying the dark, the edge sharp at the caster and softening with distance
    let shadowMask = false;
    if (sunny && I > 0.02 && sun.alt > 0.3) {
      const m = L.tint.c;
      m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = "source-over"; m.globalAlpha = 1; m.filter = "none"; m.clearRect(0, 0, L.tint.cv.width, L.tint.cv.height);
      m.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cc = Math.min(1 / Math.tan(Math.max(sun.alt, 0.3) * RAD), 12);
      const dX = sinA, dZ = -cosA, kz = T.kz;
      const sh = (x, y, base) => { const h = base - y; return [x + dX * cc * h, base + dZ * kz * cc * h]; };
      m.fillStyle = "#000"; m.strokeStyle = "#000"; m.lineJoin = "round";
      const cast = (pts, base) => { polyPath(m, pts.map(([x, y]) => sh(x, y, base))); m.fill(); m.stroke(); };
      m.lineWidth = Math.max(2, kz * D);
      for (const col of T.cols) cast(col.sil, T.Sy);
      cast(T.ent, T.Sy); cast(T.ped, T.Sy); cast(T.block, T.Sy);
      m.lineWidth = Math.max(2, kz * D * 0.8);
      for (const d of T.drums) { const x1 = d.x0 + d.len; cast([[d.x0, d.yb], [x1, d.yb], [x1, d.yb - d.d], [d.x0, d.yb - d.d]], d.yb); }
      for (const b2 of T.rubble) cast([b2.BL, b2.BR, b2.TR, b2.TL], b2.base);
      // the trees stand far back on the plain: their shadows lie on the ground from the foot of the trunk,
      // foreshortened by the distance, along the sun's azimuth, long only when the sun is low (squat at noon)
      {
        const fz = 0.13, gl = Math.hypot(dX, dZ) || 1, ux = dX / gl, uz = dZ / gl;
        const G = (bx, by, along, across) => [bx + (ux * along - uz * across), by + (uz * along + ux * across) * kz * fz];
        const poly = (pts) => { polyPath(m, pts); m.fill(); };
        for (const cp of T.cyp) {
          const len = cc * cp.h * gl, hw = cp.w * 0.5, L2 = [], R2 = [];
          for (let q = 0; q <= 12; q++) {
            const u2 = q / 12, w = hw * (u2 < 0.25 ? 0.55 + 0.45 * Math.sin(u2 / 0.25 * Math.PI / 2) : Math.pow((1 - u2) / 0.75, 0.85));
            L2.push(G(cp.x, cp.yb, u2 * len, -w)); R2.push(G(cp.x, cp.yb, u2 * len, w));
          }
          poly(L2.concat(R2.reverse()));
          m.beginPath(); m.ellipse(cp.x, cp.yb + 1, hw * 0.9, hw * 0.9 * kz * fz * 1.6 + 1, 0, 0, TAU); m.fill();
        }
        for (const ol of T.olives) {
          const R = 0.37 * ol.h, reach = cc * 0.7 * ol.h * gl, tw = ol.h * 0.07;
          poly([G(ol.x, ol.yb, 0, -tw), G(ol.x, ol.yb, reach, -tw * 0.6), G(ol.x, ol.yb, reach, tw * 0.6), G(ol.x, ol.yb, 0, tw)]);
          const pts = [], st = 1 + 0.35 * Math.min(cc, 3);
          for (let q = 0; q < 24; q++) { const a = q / 24 * TAU, wob = 1 + 0.08 * Math.sin(a * 5 + ol.x); pts.push(G(ol.x, ol.yb, reach + Math.cos(a) * R * st * wob, Math.sin(a) * R * wob)); }
          poly(pts);
          m.beginPath(); m.ellipse(ol.x, ol.yb + 1, tw * 2.2, tw * 2.2 * kz * fz * 1.6 + 1, 0, 0, TAU); m.fill();
        }
      }
      // penumbra: sharp at the caster, softer and lighter toward the far end
      {
        if (!L.dTmp) L.dTmp = mk(W, H);
        const tq = L.dTmp.c, cw = L.tint.cv.width, ch = L.tint.cv.height;
        const hc = T.Sy - T.capTop, vx = dX * cc * hc, vy = dZ * kz * cc * hc, vl = Math.hypot(vx, vy) || 1;
        const len = Math.max(0.08 * H, 2.2 * vl), nx = vx / vl, ny = vy / vl;
        const gr = (c) => c.createLinearGradient(T.tcx, T.Sy, T.tcx + nx * len, T.Sy + ny * len);
        tq.setTransform(1, 0, 0, 1, 0, 0); tq.globalCompositeOperation = "source-over"; tq.globalAlpha = 1; tq.clearRect(0, 0, cw, ch);
        tq.filter = `blur(${Math.max(2, 0.011 * H * dpr).toFixed(1)}px)`; tq.drawImage(L.tint.cv, 0, 0); tq.filter = "none";
        tq.setTransform(dpr, 0, 0, dpr, 0, 0);
        const gf = gr(tq); gf.addColorStop(0, "rgba(0,0,0,0)"); gf.addColorStop(0.4, "rgba(0,0,0,0.3)"); gf.addColorStop(1, "rgba(0,0,0,0.6)");
        tq.globalCompositeOperation = "destination-in"; tq.fillStyle = gf; tq.fillRect(0, 0, W, H); tq.globalCompositeOperation = "source-over";
        const gn = gr(m); gn.addColorStop(0, "rgba(0,0,0,0)"); gn.addColorStop(0.4, "rgba(0,0,0,0.4)"); gn.addColorStop(1, "rgba(0,0,0,0.75)");
        m.globalCompositeOperation = "destination-out"; m.fillStyle = gn; m.fillRect(0, 0, W, H);
        m.globalCompositeOperation = "source-over"; m.setTransform(1, 0, 0, 1, 0, 0); m.drawImage(L.dTmp.cv, 0, 0);
        // a little softening everywhere, so even the near edge is not cut with a knife
        tq.setTransform(1, 0, 0, 1, 0, 0); tq.clearRect(0, 0, cw, ch); tq.filter = `blur(${Math.max(1, 0.0016 * H * dpr).toFixed(1)}px)`; tq.drawImage(L.tint.cv, 0, 0); tq.filter = "none";
        m.clearRect(0, 0, cw, ch); m.drawImage(L.dTmp.cv, 0, 0); m.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      shadowMask = true;
    }
    // the shade itself, laid once the ground, the trees and the steps are down
    const layShade = () => {
      if (!shadowMask) return;
      const m = L.tint.c, cw = L.tint.cv.width, ch = L.tint.cv.height;
      const put = (op, a) => { s.save(); s.beginPath(); s.rect(0, T.Hy, W, H - T.Hy); s.clip(); s.globalCompositeOperation = op; s.globalAlpha = U.clamp(a); s.drawImage(L.tint.cv, 0, 0, W, H); s.restore(); };
      const fill = (op, style) => { m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = op; m.fillStyle = style; m.fillRect(0, 0, cw, ch); m.globalCompositeOperation = "source-over"; m.setTransform(dpr, 0, 0, dpr, 0, 0); };
      // keep the shape for the hatching
      const tq = L.dTmp.c; tq.setTransform(1, 0, 0, 1, 0, 0); tq.globalCompositeOperation = "source-over"; tq.clearRect(0, 0, cw, ch); tq.drawImage(L.tint.cv, 0, 0);
      // 1. the cool multiply: shade at roughly half the sunlit value, the texture under it intact
      fill("source-in", "rgb(112,118,176)"); put("multiply", I);
      // 2. the open sky's blue-violet in it
      fill("source-in", "rgb(78,88,150)"); put("source-over", 0.14 * I);
      // 3. ink hatching, only inside the shade
      m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, cw, ch); m.drawImage(L.dTmp.cv, 0, 0); m.setTransform(dpr, 0, 0, dpr, 0, 0);
      m.globalCompositeOperation = "source-in"; m.beginPath();
      for (let x = -H; x < W; x += 0.07 * D) { m.moveTo(x, H); m.lineTo(x + H * 0.6, 0); }
      m.strokeStyle = rgb(ink); m.lineWidth = u; m.stroke(); m.globalCompositeOperation = "source-over";
      put("source-over", 0.3 * I);
    };

    // ---- far hills: violet-blue haze behind, a warmer olive ridge in front
    for (const [pts, c] of [[L.hillB, U.mix(P.far, P.hor, 0.42)], [L.hillA, U.mix(P.far, P.olive, 0.4)]]) {
      s.beginPath(); s.moveTo(pts[0][0], T.Hy + 2);
      for (const p of pts) s.lineTo(p[0], p[1]);
      s.lineTo(pts[pts.length - 1][0], T.Hy + 2); s.closePath(); s.fillStyle = rgb(c); s.fill();
    }

    // ---- olives: silvery crowns, lit on the sun's side
    const sideLit = (x0, w, dark, lite, ae) => {
      const g = s.createLinearGradient(x0 - w, 0, x0 + w, 0);
      for (let k = 0; k <= 4; k++) { const q = k / 4, th = Math.asin(2 * q - 1); g.addColorStop(q, rgb(U.mix(dark, lite, U.clamp(amb * ae * (0.6 + 0.4 * Math.cos(th)) + 0.85 * lamAt(th) + bounce)))); }
      return g;
    };
    for (const ol of T.olives) {
      polyPath(s, ol.trunk); s.fillStyle = rgb(P.bark); s.fill();
      for (const k of ol.clumps) { clumpPath(s, k); s.fillStyle = sideLit(k.x, k.rx, P.olive, P.oliveL, 1); s.fill(); }
    }
    // ---- cypresses: deep green flames
    for (const cp of T.cyp) { polyPath(s, cp.sil); s.fillStyle = sideLit(cp.x, cp.w / 2, P.cyp, P.cypL, 0.8); s.fill(); }

    // ---- stylobate and steps: treads lit from above, risers from the front
    for (const sp of T.steps) {
      s.fillStyle = rgb(stone(1, lamTop)); s.fillRect(sp.x0, sp.y0, sp.x1 - sp.x0, sp.y1 - sp.y0 + 0.5);
      s.fillStyle = rgb(stone(0.62, lamFront)); s.fillRect(sp.x0, sp.y1, sp.x1 - sp.x0, sp.y2 - sp.y1 + 0.5);
    }
    layShade();

    // ---- columns: round, by the light on each flank; capitals and the broken tops
    for (const col of T.cols) {
      const g = s.createLinearGradient(col.x - T.r0, 0, col.x + T.r0, 0);
      for (let k = 0; k <= 10; k++) { const q = k / 10, th = Math.asin(2 * q - 1); g.addColorStop(q, rgb(stone(0.42 + 0.42 * Math.cos(th), lamAt(th)))); }
      polyPath(s, col.sil); s.fillStyle = g; s.fill();
      if (col.cap) {
        const x = col.x, s2 = T.shaftTop;
        s.fillStyle = rgb(stone(0.72, lamFront)); s.fillRect(x - 0.62 * D, T.capTop, 1.24 * D, s2 - 0.2 * D - T.capTop);
        s.fillStyle = rgb(stone(0.9, Math.max(lamTop * 0.7, lamFront))); s.beginPath();
        s.moveTo(x - T.r1, s2); s.quadraticCurveTo(x - 0.66 * D, s2 - 0.04 * D, x - 0.6 * D, s2 - 0.2 * D);
        s.lineTo(x + 0.6 * D, s2 - 0.2 * D); s.quadraticCurveTo(x + 0.66 * D, s2 - 0.04 * D, x + T.r1, s2); s.closePath(); s.fill();
      } else {
        polyPath(s, col.jag.concat(col.back.slice().reverse())); s.fillStyle = rgb(stone(1, lamTop)); s.fill();
      }
    }
    // ---- entablature, pediment, the lone block: front faces; the cornice's soffit in shade
    {
      s.save(); s.beginPath();
      for (const p of [T.ent, T.ped, T.block]) { s.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) s.lineTo(p[i][0], p[i][1]); s.closePath(); }
      s.fillStyle = rgb(stone(0.7, lamFront)); s.fill();
      s.clip();
      s.fillStyle = rgb(stone(0.25, 0.2 * lamFront)); s.fillRect(0, T.yFr, W, 0.12 * D);
      s.fillStyle = rgb(stone(1, lamTop)); s.fillRect(0, T.yCor - 0.02 * D, W, 0.1 * D);
      s.restore();
    }
    // ---- fallen drums and rubble, each face by its own light
    for (const d of T.drums) {
      const x1 = d.x0 + d.len, ry = d.d / 2, rx = d.d * 0.22, cy = d.yb - ry, ex = d.endLeft ? d.x0 : x1, fx = d.endLeft ? x1 : d.x0;
      const g = s.createLinearGradient(0, d.yb - d.d, 0, d.yb);
      g.addColorStop(0, rgb(stone(1, lamTop))); g.addColorStop(0.5, rgb(stone(0.7, 0.5 * lamTop + 0.4 * lamFront))); g.addColorStop(1, rgb(stone(0.3, 0.4 * lamFront)));
      s.fillStyle = g; s.beginPath(); s.rect(d.x0, d.yb - d.d, d.len, d.d); s.fill();
      s.beginPath(); s.ellipse(fx, cy, rx, ry, 0, 0, TAU); s.fill();
      const endLam = d.endLeft ? lamAt(-Math.PI / 2) : lamAt(Math.PI / 2);
      s.fillStyle = rgb(stone(0.6, endLam)); s.beginPath(); s.ellipse(ex, cy, rx, ry, 0, 0, TAU); s.fill();
    }
    for (const b2 of T.rubble) {
      for (const [poly, c] of [[[b2.TL, b2.TR, b2.TR2, b2.TL2], stone(1, lamTop)], [[b2.BL, b2.BR, b2.TR, b2.TL], stone(0.62, lamFront)], [[b2.BR, b2.BR2, b2.TR2, b2.TR], stone(0.55, lamAt(Math.PI / 2))]]) {
        polyPath(s, poly); s.fillStyle = rgb(c); s.fill();
      }
    }

    // ---- the engraving itself: the static linework in sepia
    {
      const tc = L.tint.c;
      tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalCompositeOperation = "source-over"; tc.globalAlpha = 1; tc.clearRect(0, 0, L.tint.cv.width, L.tint.cv.height);
      tc.drawImage(L.static.cv, 0, 0);
      tc.globalCompositeOperation = "source-in"; tc.fillStyle = rgb(ink); tc.fillRect(0, 0, L.tint.cv.width, L.tint.cv.height);
      tc.globalCompositeOperation = "source-over";
      s.globalAlpha = 0.85; s.drawImage(L.tint.cv, 0, 0, W, H); s.globalAlpha = 1;
    }
    // ---- shade hatching: the flutes turned from the light, the entablature's face, risers in shade
    for (const col of T.cols) {
      const yTop = col.cap ? T.shaftTop + 0.3 * D : null;
      const topAt = (xx) => {
        if (col.cap) return yTop;
        let jy = col.jag[0][1];
        for (let m = 1; m < col.jag.length; m++) if (col.jag[m][0] >= xx) { const p0 = col.jag[m - 1], p1 = col.jag[m]; jy = U.lerp(p0[1], p1[1], (xx - p0[0]) / Math.max(1e-3, p1[0] - p0[0])); break; }
        return jy + 3;
      };
      for (let k = 1; k < 40; k++) {
        const th = (-90 + k * 4.5) * RAD, sn = Math.sin(th);
        const v = U.clamp(amb * (0.42 + 0.42 * Math.cos(th)) + 0.8 * lamAt(th) + bounce);
        const a = (k % 2 === 0 ? 0.42 : 0.26) * U.smoothstep(0.62, 0.12, v);
        if (a < 0.03) continue;
        s.beginPath();
        const y1 = topAt(col.x + T.r0 * sn) + (!col.cap && Math.abs(sn) > 0.7 ? 0.3 * D : 0);
        for (let q = 0; q <= 8; q++) { const y = U.lerp(T.Sy - 1, y1, q / 8), x = col.x + T.rAt(y) * sn; q ? s.lineTo(x, y) : s.moveTo(x, y); }
        st(ink, a, 1);
      }
      if (rim > 0.05) { s.beginPath(); lineTo(s, col.left); lineTo(s, col.right); st(U.safe(P.stoneL), 0.55 * rim, 1.4); }
    }
    {
      const v = U.clamp(amb * 0.7 + 0.8 * lamFront + bounce), a = 0.32 * U.smoothstep(0.7, 0.15, v);
      if (a > 0.03) {
        s.save(); s.beginPath();
        for (const p of [T.ent, T.ped, T.block]) { s.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) s.lineTo(p[i][0], p[i][1]); s.closePath(); }
        s.clip(); s.beginPath();
        for (let y = T.yCor - 1.6 * D; y < T.capTop + 0.3 * D; y += 0.1 * D) { s.moveTo(0, y); s.lineTo(W, y); }
        st(ink, a, 1); s.restore();
      }
      const vr = U.clamp(amb * 0.62 + 0.8 * lamFront + bounce), ar = 0.3 * U.smoothstep(0.6, 0.15, vr);
      if (ar > 0.03) { s.beginPath(); for (const sp of T.steps) for (let q = 1; q <= 3; q++) { const y = sp.y1 + (sp.y2 - sp.y1) * q / 4; s.moveTo(sp.x0 + 2, y); s.lineTo(sp.x1 - 2, y); } st(ink, ar, 1); }
    }
    // sun along the upward edges
    if (lamTop > 0.05) {
      s.beginPath(); lineTo(s, T.corniceTop); for (const sp of T.steps) { s.moveTo(sp.x0, sp.y0 + 0.5); s.lineTo(sp.x1, sp.y0 + 0.5); }
      st(U.safe(P.stoneL), 0.5 * lamTop, 1.3);
    }

    // ---- life: ivy, dry grass, poppies and broom in the cracks
    {
      const ivy = U.safe(U.mix(P.green, P.stoneL, 0.1 + 0.2 * I));
      for (const iv of T.ivy) {
        s.beginPath(); let pen = false;
        for (const [x, y, front] of iv.vine) { if (front > -0.15) { pen ? s.lineTo(x, y) : s.moveTo(x, y); pen = true; } else pen = false; }
        st(U.scale(ivy, 0.6), 0.8, 1.1);
        for (const [x, y, sz, a] of iv.leaves) { leafPath(s, x, y, sz, a); s.fillStyle = rgb(ivy); s.fill(); leafPath(s, x, y, sz, a); st(ink, 0.5, 1); }
      }
      s.beginPath();
      for (const tf of T.tufts) for (const [x0, y0, x1, y1, bend] of tf.blades) { s.moveTo(x0, y0); s.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1); }
      st(U.safe(U.mix(P.dry, P.stoneL, 0.2 * I)), 0.85, 1.1);
      let n = 0;
      for (const tf of T.tufts) if (tf.flower) {
        const [x, y, r] = tf.flower, red = n++ % 3 !== 2;
        s.fillStyle = rgb(U.scale(red ? U.hex("#c2402e") : U.hex("#d2a838"), EXPO * P.k * 1.05));
        s.beginPath(); for (let k = 0; k < 5; k++) { const q = k / 5 * TAU; s.moveTo(x + Math.cos(q) * r * 1.4 + r * 0.6, y + Math.sin(q) * r * 1.4); s.arc(x + Math.cos(q) * r * 1.4, y + Math.sin(q) * r * 1.4, r * 0.6, 0, TAU); }
        s.fill();
      }
    }
  }

  // where snow lies by day: the open ground and the treads (baked once per size)
  function bakeSnowGround() {
    const o = L.dGround = mk(W, H), c = o.c, sc = U.safe(U.hex("#565c6c"));
    const g = c.createLinearGradient(0, T.Hy - 0.06 * H, 0, H);
    g.addColorStop(0, U.rgba(sc, 0)); g.addColorStop(0.12, U.rgba(sc, 0.75)); g.addColorStop(0.4, U.rgba(sc, 1)); g.addColorStop(0.75, U.rgba(sc, 0.75)); g.addColorStop(1, U.rgba(sc, 0.25));
    c.fillStyle = g; c.fillRect(0, T.Hy - 0.06 * H, W, H);
    c.globalCompositeOperation = "destination-out"; c.fillStyle = "#000";
    for (const ol of T.olives) { for (const k of ol.clumps) { clumpPath(c, k); c.fill(); } polyPath(c, ol.trunk); c.fill(); }
    for (const cp of T.cyp) { polyPath(c, cp.sil); c.fill(); }
    for (const col of T.cols) { polyPath(c, col.sil); c.fill(); }
    for (const p of [T.ent, T.ped, T.block]) { polyPath(c, p); c.fill(); }
    for (const sp of T.steps) c.fillRect(sp.x0, sp.y1 + 1, sp.x1 - sp.x0, sp.y2 - sp.y1 - 1);
    for (const d of T.drums) { c.fillRect(d.x0, d.yb - d.d * 0.75, d.len, d.d * 0.75); for (const ex of [d.x0, d.x0 + d.len]) { c.beginPath(); c.ellipse(ex, d.yb - d.d / 2, d.d * 0.22, d.d / 2, 0, 0, TAU); c.fill(); } }
    for (const b2 of T.rubble) { polyPath(c, [b2.BL, b2.BR, b2.TR, b2.TL]); c.fill(); polyPath(c, [b2.BR, b2.BR2, b2.TR2, b2.TR]); c.fill(); }
    // drifts and thin places: a soft low-resolution noise field scaled up (bilinear), never blobs
    {
      const nw = 192, nh = 108, pc = document.createElement("canvas"); pc.width = nw; pc.height = nh;
      const q = pc.getContext("2d"), id = q.createImageData(nw, nh);
      for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
        const n = 0.5 + 0.5 * U.fbm2(i / nw * 9 + 3.1, j / nh * 14 + 7.7, 4);
        id.data[(j * nw + i) * 4 + 3] = Math.round(255 * (0.78 + 0.22 * U.smoothstep(0.3, 0.62, n)));
      }
      q.putImageData(id, 0, 0);
      c.globalCompositeOperation = "destination-in"; c.imageSmoothingEnabled = true;
      c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(pc, 0, 0, o.cv.width, o.cv.height); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    c.globalCompositeOperation = "source-over";
    // the hills take a light dusting along their crests
    c.beginPath(); lineTo(c, L.hillA); lineTo(c, L.hillB); c.strokeStyle = U.rgba(sc, 0.6); c.lineWidth = 2 * LWU; c.stroke();
  }

  // the day plates, re-baked when the sun has moved (at most one bake a frame, a couple of seconds apart)
  function dayPlates(Ls, P, t, needS, needF) {
    const sun = Ls.sun;
    let baked = false;
    if (needS) {
      const key = `${Math.round(sun.az)}|${Math.round(sun.alt * 2)}`, cur = L.dS[L.dSi];
      if (key !== cur.key && (!cur.key || t - L.dSt > 2 || t < L.dSt)) {
        if (cur.key) { L.dSi ^= 1; L.dSt = t; } else L.dSt = -9;
        const nx = L.dS[L.dSi]; paintDay(nx, Ls, P, true); nx.key = key; baked = true;
      }
    }
    if (needF && !baked) {
      const key = `${Math.round(sun.alt)}`, F = L.dF;
      if (key !== F.key && (!F.key || t - F.t > 2 || t < F.t)) { paintDay(F, Ls, P, false); F.key = key; F.t = t; }
    }
  }
  // the day plate on the wall: the flat (sky-lit) plate under the sunny one, by how much sun gets through
  function drawDayPlate(ctx, Ls, P, t, a) {
    const sunW = U.smoothstep(-0.5, 3, Ls.sun.alt) * (1 - 0.88 * U.smoothstep(0.45, 0.95, WX.cloud)) * (1 - 0.9 * U.smoothstep(0.1, 0.7, WX.fog));
    const needS = sunW > 0.002, needF = sunW < 0.998;
    dayPlates(Ls, P, t, needS, needF);
    if (needF && L.dF.key) { ctx.globalAlpha = U.clamp(a); ctx.drawImage(L.dF.cv, 0, 0, W, H); }
    if (needS) {
      const cur = L.dS[L.dSi], prev = L.dS[L.dSi ^ 1], fd = U.clamp((t - L.dSt) / 1.6);
      const aS = needF && L.dF.key ? a * sunW : a;
      if (fd < 1 && prev.key) { ctx.globalAlpha = U.clamp(aS); ctx.drawImage(prev.cv, 0, 0, W, H); }
      if (cur.key) { ctx.globalAlpha = U.clamp(aS * (fd < 1 && prev.key ? fd : 1)); ctx.drawImage(cur.cv, 0, 0, W, H); }
    }
    ctx.globalAlpha = 1;
  }
  // weather on the day plate: rain and storm darken and wet it, snow lies on the ground
  function drawDayWeather(ctx, a) {
    // a dull day dims the land: overcast, fog, rain, snow, a storm
    const wet = 0.18 * U.smoothstep(0.45, 0.95, WX.cloud) + 0.3 * WX.fog + 0.12 * WX.rain + 0.25 * WX.storm + 0.42 * WX.snow;
    if (wet > 0.01) {
      const y0 = T.Hy - 0.12 * H, g = ctx.createLinearGradient(0, y0, 0, T.Hy);
      g.addColorStop(0, "rgba(6,9,16,0)"); g.addColorStop(1, "rgba(6,9,16,1)");
      ctx.globalAlpha = U.clamp(wet * a); ctx.fillStyle = g; ctx.fillRect(0, y0, W, T.Hy - y0);
      ctx.fillStyle = "rgb(6,9,16)"; ctx.fillRect(0, T.Hy, W, H - T.Hy); ctx.globalAlpha = 1;
    }
    const sn = U.smoothstep(0.05, 0.6, WX.acc);
    if (sn > 0.01 && L.dGround) { ctx.globalAlpha = U.clamp(0.5 * sn * a); ctx.drawImage(L.dGround.cv, 0, 0, W, H); ctx.globalAlpha = 1; }
  }

  // the day sky: zenith to horizon, the sun's warmth spreading round it, the sun itself (warm, never white)
  function drawDaySky(ctx, Ls, P, a, b) {
    const S = daySky(P), y1 = T.Hy + 2;
    const g = ctx.createLinearGradient(0, 0, 0, y1);
    g.addColorStop(0, rgb(S.top)); g.addColorStop(0.55, rgb(U.mix(S.top, S.hor, 0.45))); g.addColorStop(1, rgb(S.hor));
    ctx.globalAlpha = U.clamp(a); ctx.fillStyle = g; ctx.fillRect(0, 0, W, y1);
    const sun = Ls.sun, clear = (1 - 0.9 * S.cov) * (1 - 0.7 * WX.fog) * (1 - WX.storm);
    if (sun.alt > -8 && clear > 0.01) {
      const x = skyX(sun.az), y = skyY(sun.alt), gc = U.safe(P.glow);
      // the wide warmth along the horizon on the sun's side (strongest when it is low)
      const low = 1 - U.smoothstep(2, 22, sun.alt);
      if (low > 0.01) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, y1); ctx.clip();
        ctx.translate(x, T.Hy); ctx.scale(1, 0.32);
        const r = 0.85 * W, hg = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        hg.addColorStop(0, U.rgba(gc, 0.42 * low * P.gA * 2)); hg.addColorStop(0.5, U.rgba(gc, 0.12 * low * P.gA * 2)); hg.addColorStop(1, U.rgba(gc, 0));
        ctx.globalAlpha = U.clamp(a * clear); ctx.fillStyle = hg; ctx.fillRect(-r, -r, 2 * r, 2 * r);
        ctx.restore();
      }
      if (sun.alt > -1) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, T.Hy); ctx.clip();
        const r = 0.5 * H, sg = ctx.createRadialGradient(x, y, 0, x, y, r);
        sg.addColorStop(0, U.rgba(gc, P.gA * 1.2)); sg.addColorStop(0.07, U.rgba(gc, P.gA * 0.6)); sg.addColorStop(0.3, U.rgba(gc, P.gA * 0.14)); sg.addColorStop(1, U.rgba(gc, 0));
        ctx.globalAlpha = U.clamp(a * clear); ctx.fillStyle = sg; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
        const dc = U.safe(U.mix(P.glow, U.hex("#dcc896"), 0.55)), rr = 0.016 * H;
        // behind the work face only its warmth shows (the disc would crowd the clock)
        ctx.globalAlpha = U.clamp(a * U.smoothstep(0.15, 0.7, b) * (1 - U.smoothstep(0.25, 0.75, S.cov)) * (1 - 0.55 * WX.fog) * (1 - WX.storm) * (1 - U.clamp(WX.snow * 2)));
        ctx.fillStyle = U.rgba(dc, 0.92); ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
        // the engraver's sun: the disc ringed, short rays (in fog only the pale disc shows)
        ctx.globalAlpha *= 1 - U.smoothstep(0.1, 0.5, WX.fog);
        ctx.strokeStyle = U.rgba(U.safe(U.mix(P.glow, INK, 0.25)), 0.55); ctx.lineWidth = 1.2 * LWU; ctx.beginPath();
        for (let i = 0; i < 12; i++) { const q = i / 12 * TAU, r0 = rr * 1.5, r1 = rr * (i % 2 ? 2.0 : 2.5); ctx.moveTo(x + Math.cos(q) * r0, y + Math.sin(q) * r0); ctx.lineTo(x + Math.cos(q) * r1, y + Math.sin(q) * r1); }
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  // swallows over the ruin at noon: a few dark ticks wheeling slowly
  function drawSwallows(ctx, f, a) {
    if (a <= 0.01) return;
    const t = f.t, s = 0.0085 * H;
    ctx.strokeStyle = U.rgba(U.safe(INK), 0.75 * a); ctx.lineWidth = 1.3 * LWU; ctx.lineCap = "round"; ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const sp = 0.045 + 0.011 * i, ph = i * 1.9;
      const x = W * (0.5 + 0.42 * Math.sin(t * sp + ph) * Math.cos(t * sp * 0.31 + i));
      const y = T.Hy * (0.24 + 0.16 * Math.sin(t * sp * 1.7 + ph * 2) + 0.06 * i);
      const vx = Math.cos(t * sp + ph) * Math.cos(t * sp * 0.31 + i) - 0.31 * Math.sin(t * sp + ph) * Math.sin(t * sp * 0.31 + i);
      const dir = vx >= 0 ? 1 : -1, beat = Math.sin(t * 7 + i * 2.3), w = 0.25 + 0.45 * (0.5 + 0.5 * beat) * (Math.sin(t * 0.6 + i) > 0.2 ? 1 : 0.3);
      ctx.moveTo(x - s, y - s * w); ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.15, x, y);
      ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.15, x + s, y - s * w);
      ctx.moveTo(x, y); ctx.lineTo(x - dir * s * 0.55, y + s * 0.18); ctx.moveTo(x, y); ctx.lineTo(x - dir * s * 0.5, y + s * 0.38);
    }
    ctx.stroke(); ctx.lineCap = "butt";
  }

  // ------------------------------------------------------------------ now playing
  // Work: one small line at the foot of the dial's column, "title — artist" in italic, a hairline of progress
  // beneath it, a little note mark before it (two bars and dimmed when paused) and, if the track has art, a small
  // thumbnail inked in steel. Ambient: an inscription under the date, "♪ title — artist", faint amber italic.
  // Lines are fitted (ellipsized in the real face) once per track and size; the strings are cached sprites.
  let NPK = -1;        // eased 0..1: is something playing (-1 = not yet known); the caption makes room for it
  let npHold = null;   // the last track, kept while the line fades out
  const npLays = new Map();
  const npClean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  function npFit(np, o, maxW, prefix) {
    const key = `${np.title}|${np.artist || ""}|${prefix}|${Math.round(o.px)}|${o.style || ""}|${Math.round(maxW)}`;
    let s = npLays.get(key);
    if (s !== undefined) return s;
    if (npLays.size > 8) npLays.clear();
    if (!mctx) mctx = document.createElement("canvas").getContext("2d");
    mctx.font = `${o.style || ""} 400 ${Math.round(o.px)}px ${SERIF}`;
    if (spacingOk(mctx)) mctx.letterSpacing = "0px";
    const m = (x) => mctx.measureText(x).width, sep = " — ";
    const title = npClean(np.title), artist = npClean(np.artist), room = maxW - (prefix ? m(prefix) : 0);
    let line;
    if (!artist) line = U.ellipsize(title, room, mctx);
    else if (m(title + sep + artist) <= room) line = title + sep + artist;
    else {
      // too long: the artist keeps at most ~40% of the line, the title takes the rest
      const a = m(sep + artist) <= room * 0.4 ? artist : U.ellipsize(artist, room * 0.4 - m(sep), mctx);
      line = U.ellipsize(title, room - m(sep + a), mctx) + sep + a;
    }
    s = (prefix || "") + line;
    npLays.set(key, s);
    return s;
  }
  // album art: loaded once per URL (same origin), a failed load is remembered and never drawn; baked at the drawn
  // size as a duotone in the instrument's ink (multiplied, so it can never reach white)
  const arts = new Map();
  function artThumb(url, size, tint) {
    if (!url || typeof url !== "string") return null;
    let e = arts.get(url);
    if (!e) {
      if (arts.size > 6) arts.clear();
      e = { img: new Image(), ok: false, bad: false, cv: null, key: "" };
      e.img.onload = () => { e.ok = e.img.naturalWidth > 0; e.bad = !e.ok; };
      e.img.onerror = () => { e.bad = true; };
      e.img.src = url;
      arts.set(url, e);
    }
    if (!e.ok || e.bad) return null;
    const key = `${Math.round(size)}|${colKey(tint)}|${dpr}`;
    if (e.key !== key) {
      try {
        const o = mk(size, size), c = o.c, im = e.img, iw = im.naturalWidth, ih = im.naturalHeight, q = Math.min(iw, ih);
        c.drawImage(im, (iw - q) / 2, (ih - q) / 2, q, q, 0, 0, size, size);
        c.globalCompositeOperation = "saturation"; c.fillStyle = "#000"; c.fillRect(0, 0, size, size);
        c.globalCompositeOperation = "multiply"; c.fillStyle = U.rgba(U.safe(tint), 1); c.fillRect(0, 0, size, size);
        c.globalCompositeOperation = "destination-in"; c.drawImage(im, (iw - q) / 2, (ih - q) / 2, q, q, 0, 0, size, size);
        e.cv = o.cv; e.key = key;
      } catch (err) { e.bad = true; return null; }
    }
    return e.cv;
  }
  // a small eighth note (playing) or two bars (paused), centred on (x, y), s = its height
  function npMark(ctx, x, y, s, col, a, paused) {
    const c = U.safe(col);
    ctx.fillStyle = U.rgba(c, a); ctx.strokeStyle = U.rgba(c, a);
    if (paused) {
      const w = s * 0.24;
      ctx.fillRect(x - s * 0.3, y - s * 0.42, w, s * 0.84); ctx.fillRect(x + s * 0.3 - w, y - s * 0.42, w, s * 0.84);
      return;
    }
    const hx = x - s * 0.12, hy = y + s * 0.3;
    ctx.beginPath(); ctx.ellipse(hx, hy, s * 0.24, s * 0.17, -0.45, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(1, s * 0.09); ctx.lineCap = "round"; ctx.beginPath();
    ctx.moveTo(hx + s * 0.21, hy - s * 0.05); ctx.lineTo(hx + s * 0.21, y - s * 0.5);
    ctx.quadraticCurveTo(hx + s * 0.32, y - s * 0.18, hx + s * 0.52, y - s * 0.08);
    ctx.stroke(); ctx.lineCap = "butt";
  }
  function drawNowPlayingWork(ctx, np, x, y, maxW, a) {
    if (a <= 0.004) return;
    const paused = !np.isPlaying, k = a * (paused ? 0.55 : 1);
    const o = { px: Math.max(13, 0.021 * H), style: "italic", color: C.steelMid, glow: 3, core: 0.85 };
    const sp = sprite(npFit(np, o, maxW, ""), o);
    const ms = 0.017 * H, gap = 0.011 * H, as = Math.round(0.034 * H);
    const art = artThumb(np.art, as, C.steel);
    const tot = (art ? as + gap : 0) + ms + gap + sp.tw;
    let x0 = x - tot / 2;
    if (art) {
      ctx.globalAlpha = U.clamp(0.6 * k); ctx.drawImage(art, x0, y - as / 2, as, as); ctx.globalAlpha = 1;
      ctx.strokeStyle = U.rgba(U.safe(C.steelDim), 0.6 * k); ctx.lineWidth = LWU; ctx.strokeRect(x0 - 0.5, y - as / 2 - 0.5, as + 1, as + 1);
      x0 += as + gap;
    }
    npMark(ctx, x0 + ms / 2, y, ms, C.steelMid, 0.8 * k, paused);
    x0 += ms + gap;
    drawSprite(ctx, sp, x0, y, "left", 1, 0.9 * k);
    // progress: a hairline under the words, the played part brighter, a dot at the head
    const pm = np.progressMs, dm = np.durationMs;
    if (pm != null && dm != null && dm > 0) {
      const p = U.clamp(pm / dm), hy = y + 0.021 * H, w = Math.max(sp.tw, 0.06 * W), hx = x0;
      ctx.lineWidth = LWU;
      ctx.strokeStyle = U.rgba(U.safe(C.steelDim), 0.4 * k); ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + w, hy); ctx.stroke();
      ctx.strokeStyle = U.rgba(U.safe(C.steelMid), 0.85 * k); ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + w * p, hy); ctx.stroke();
      ctx.fillStyle = U.rgba(U.safe(C.steel), 0.85 * k); ctx.beginPath(); ctx.arc(hx + w * p, hy, 1.7 * LWU, 0, TAU); ctx.fill();
    }
  }

  // ------------------------------------------------------------------ sound
  // The temple's world as sound (THEMES.md "Sound"). By day a hot still Mediterranean noon: cicadas (the crickets
  // layer, wanting heat and sun), a dry breeze, swallows. By night crickets (none in the cold), a soft wind and the
  // faintest air; the crickets thin out as the night wears on. Rain hisses on the stone. Cues follow what is seen:
  // thunder on the flash (lagging by the strike's distance), a lamp's oil popping now and then at night, a little
  // owl, and a village chapel far off striking the hour by day and in the evening.
  const sstep = (a, b2, x) => U.smoothstep(a, b2, x);
  const numOr = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
  function soundscape(f) {
    const w = (f.signals && f.signals.weather) || {};
    const cond = w.condition || "clear", I = U.clamp(numOr(w.intensity, 0.5)), wind = numOr(w.windKph, 6), T = numOr(w.tempC, 18);
    const day = U.clamp(f.day || 0), night = 1 - day, el = f.ambientElapsed || 0;
    const rain = cond === "rain" ? 0.2 + 0.8 * I : cond === "storm" ? 0.8 + 0.2 * I : 0;
    const wet = U.clamp(rain * 1.3), snow = cond === "snow" ? 1 : 0, fog = cond === "fog" ? 1 : 0;
    const sun = cond === "clear" ? 1 : cond === "cloudy" ? 1 - 0.75 * I : 0;
    // cicadas sing in the heat of a clear day; crickets on nights above about 5 C, thinning in the small hours
    const cicadas = 0.5 * day * sstep(16, 25, T) * (0.3 + 0.7 * sun) * (1 - wet) * (1 - snow);
    const crickets = 0.45 * night * sstep(5, 12, T) * (1 - wet) * (1 - snow) * (1 - 0.3 * fog) * (1 - 0.35 * sstep(3 * 3600, 7 * 3600, el));
    const gusts = 0.85 * sstep(6, 55, wind) + (cond === "storm" ? 0.15 : 0) + 0.08 * snow;
    const breeze = (0.3 * day + 0.16 * night * (1 - 0.3 * sstep(4 * 3600, 8 * 3600, el))) * (1 - 0.5 * fog);
    const birds = 0.25 * day * sstep(4, 9, T) * (1 - 0.85 * wet) * (1 - 0.5 * fog) * (1 - 0.5 * sstep(25, 50, wind));
    return {
      crickets: U.clamp(cicadas + crickets),
      wind: U.clamp(Math.max(breeze, gusts)),
      birds,
      room: 0.1 * night,
      rain,
    };
  }
  // cue state: reset whenever sound is off, so turning it on never fires a stale event
  const LAMPX = [];
  const SFX = { live: false, hour: -1, ms: 0, bolt: -1, popAt: 0, owlAt: 0 };
  const expo = (mean) => -Math.log(1 - Math.random()) * mean;
  function sfx(f, Lt, b, dk, lampXs) {
    const A = AW.audio;
    if (!A || !A.enabled()) { SFX.live = false; return; }
    const t = f.t, now = f.now, ms = now.getTime(), hour = now.getHours();
    if (!SFX.live) {
      SFX.live = true; SFX.hour = hour; SFX.ms = ms; SFX.bolt = Lt ? Lt.seed : -1;
      SFX.popAt = t + expo(40); SFX.owlAt = t + 60 + expo(300);
      return;
    }
    // thunder, cued on the frame the flash begins; the engine delays it by distance x 5 s
    if (Lt && Lt.seed !== SFX.bolt) {
      SFX.bolt = Lt.seed;
      if (Lt.u < 0.25) A.cue("thunder", { distance: Lt.d, gain: 0.55 + 0.45 * WX.storm, pan: U.clamp(Lt.x / W * 2 - 1, -0.9, 0.9) });
    }
    // the village chapel strikes the hour, far off, by day and in the evening (07:00 - 22:00)
    if (hour !== SFX.hour) {
      const fwd = ms - SFX.ms;
      if (fwd > 0 && fwd < 600000 && now.getMinutes() < 2 && hour >= 7 && hour <= 22) {
        A.cue("distant_bell", { count: hour % 12 || 12, freq: 610, distance: 0.92, gain: 0.7, pan: -0.55 });
      }
      SFX.hour = hour;
    }
    SFX.ms = ms;
    const amb = U.smoothstep(0.6, 0.95, b), dark = 1 - U.smoothstep(0.15, 0.5, dk);
    // the oil lamps on the steps pop now and then at night (one per host)
    if (t >= SFX.popAt) {
      SFX.popAt = t + 12 + expo(40);
      if (lampXs.length && amb * dark > 0.5) {
        const x = lampXs[(Math.random() * lampXs.length) | 0];
        A.cue("pop", { gain: 0.22 + 0.2 * Math.random(), distance: 0.3, pan: U.clamp(x / W * 2 - 1, -0.9, 0.9) });
      }
    }
    // a little owl in the olives, rarely, on a night without rain
    if (t >= SFX.owlAt) {
      SFX.owlAt = t + 120 + expo(360);
      if (amb * dark > 0.5 && WX.rain + WX.storm < 0.3) {
        A.cue("owl", { freq: 400 + 60 * Math.random(), distance: 0.55 + 0.35 * Math.random(), gain: 0.8, pan: Math.random() < 0.5 ? -0.7 : 0.75 });
      }
    }
  }

  // ------------------------------------------------------------------ theme
  AW.registerTheme({
    id: "classical",
    name: "Classical",
    init(ctx, env) { dpr = env.dpr || 1; W = env.width; H = env.height; sprites.clear(); lays.clear(); dimL = null; build(); CAT = AW.cat.create(4207); },
    resize(env) { dpr = env.dpr || 1; W = env.width; H = env.height; sprites.clear(); lays.clear(); dimL = null; build(); },
    destroy() { sprites.clear(); lays.clear(); npLays.clear(); dimL = null; L = {}; T = null; built = ""; NPK = -1; npHold = null; SFX.live = false; },
    soundscape,

    // the shared info overlay, dressed as this theme: steel and brass engraving in work, candlelight in ambient
    overlayStyle(f) {
      const s = U.smoothstep(0.3, 0.7, U.clamp(f.blend || 0));
      return {
        font: SERIF,
        ink: U.safe(U.mix(C.steel, C.candle, s)),
        dim: U.safe(U.mix(C.steelDim, U.scale(C.amber, 0.72), s)),
        accent: U.safe(U.mix(C.straw, C.bone, s)),
        alarm: U.safe(U.mix(C.alarm, C.rose, s)),
        glow: U.lerp(0.4, 0.5, s),
        rule: "double",
        caps: true,
      };
    },

    render(ctx, f) {
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.width, f.height);
      if (f.width !== W || f.height !== H || (f.dpr || 1) !== dpr || !built) {
        dpr = f.dpr || 1; W = f.width; H = f.height; sprites.clear(); lays.clear(); dimL = null; build();
      }
      const b = U.clamp(f.blend), t = f.t, now = f.now, S = f.signals || {};
      const dl = S.daylight;
      const A = astro(now, AW.config.location.lon);
      const G = WORK();
      const ambA = U.smoothstep(0.55, 1, b);
      // now playing: eased presence (the ambient caption rises a little to make room for its inscription)
      const npNow = S.nowPlaying && S.nowPlaying.title ? S.nowPlaying : null;
      if (npNow) npHold = npNow;
      NPK = NPK < 0 ? (npNow ? 1 : 0) : NPK + ((npNow ? 1 : 0) - NPK) * (1 - Math.exp(-Math.min(0.1, f.dt || 0.016) / 0.7));
      if (!npNow && NPK < 0.004) npHold = null;
      const npRise = npHold ? NPK * 0.026 * H : 0;

      // ---------------------------------------------------- ambient: temple under the moon (or the sun)
      // dk: how much day there is. By day the day plate and sky come forward from a faint backdrop behind the
      // work face (DAY_WORK) to the full scene as the wall exhales; at night (dk = 0) none of it is drawn.
      wxUpdate(f);
      const dk = U.clamp(f.day || 0);
      const dA = dk * U.lerp(DAY_WORK, 1, U.smoothstep(0.06, 0.8, b));
      if (b > 0.004 || dA > 0.004) {
        const Ls = lightState(now);
        wxLight(Ls);
        const Lt = lightning(t); FLASH = Lt ? Lt.fl : 0;
        const P = dA > 0.004 ? dayPal(Ls.sun.alt) : null;
        if (P) drawDaySky(ctx, Ls, P, dA, b);
        drawSky(ctx, f, Ls, b, dk);
        drawMoon(ctx, Ls, b, dk);
        if (Lt) drawLightning(ctx, Lt, b);
        drawClouds(ctx, f, Ls, b, dk);
        if (P) drawSwallows(ctx, f, dk * U.smoothstep(0.6, 1, b) * U.smoothstep(2, 10, Ls.sun.alt) * (1 - U.smoothstep(0.2, 0.6, WX.rain + WX.storm + WX.snow + WX.fog)));
        drawScene(ctx, Ls, b, t, dk);
        if (P) { drawDayPlate(ctx, Ls, P, t, dA); drawDayWeather(ctx, dA); }
        if (Lt && b > 0.9 && dk < 0.999) {
          // the flash rim-lights the ruin: the engraved lines brighten for a beat (kept under the cap)
          ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = U.clamp(0.16 * Lt.fl * (1 - dk));
          ctx.drawImage(L.scene.cv, 0, 0, W, H);
          ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        }
        drawSnowAcc(ctx, Ls, b);
        drawFog(ctx, Ls, b, dk, dA);
        // the cat, in the near foreground: in front of the ruin and the far fog, behind the mist and the rain
        drawCat(ctx, f, Ls, P, b, dk, dA);
        drawMist(ctx, f, Ls, b, dk);
        drawPrecip(ctx, f, Ls, b, dk);
        // a snowy day is a dim one: the whole day scene steps down a little (keeps it inside the day budget)
        const dim = dA * (0.16 * WX.snow + 0.04 * U.smoothstep(0.45, 0.95, WX.cloud));
        if (dim > 0.004) { ctx.fillStyle = `rgba(0,0,0,${U.clamp(dim)})`; ctx.fillRect(0, 0, W, H); }
      }

      // ---------------------------------------------------- info: straight to the plate, or into the dim layer
      const ov = f.overlay, dimK = ov ? 1 - 0.7 * U.clamp(ov.a || 0) : 1;
      const out = ctx;
      ctx = dimBegin(out, dimK);

      // ---------------------------------------------------- work instrument (fades + drifts up in a cascade)
      const limbA = fadeOut(b, 0.04, 0.48), arcA = fadeOut(b, 0.0, 0.36), sunA = fadeOut(b, 0.1, 0.52);
      const cx = G.cx + b * 0.02 * W, cy = G.cy - U.easeIn(b) * 0.08 * H;
      const R = G.R * (1 + 0.1 * b);
      drawLayer(ctx, L.limbW, cx, cy, R / G.R, -b * 0.12, limbA);

      const sunAng = A.sunH;
      const [sx0, sy0] = pol(R * 0.97, sunAng);
      const sx = cx + sx0, sy = cy + sy0;
      const instC = C.steel;

      // the rule (alidade): reads the sun's hour on the limb
      if (sunA > 0.01) {
        const [ex, ey] = pol(R * 0.97 - 14, sunAng);
        const c = U.safe(instC);
        ctx.strokeStyle = U.rgba(c, 0.28 * 0.25 * sunA); ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + ex, cy + ey); ctx.stroke();
        ctx.strokeStyle = U.rgba(c, 0.28 * sunA); ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + ex, cy + ey); ctx.stroke();
      }

      // work face of the dial: daylight arc, horizon chord, light left
      if (dl && dl.sunrise && dl.sunset && arcA > 0.01) {
        const workA = arcA;
        const dayMs = 86400000;
        const angAt = (d) => sunAng + (d - now) / dayMs * TAU;
        const aR = angAt(dl.sunrise), aS = angAt(dl.sunset), aN = sunAng;
        const sc = U.safe(C.steel), mc = U.safe(C.steelMid);
        const arc = (r, a0, a1, col, a, lw) => {
          if (a1 <= a0) return;
          ctx.strokeStyle = U.rgba(col, a * 0.16); ctx.lineWidth = lw * 4;
          ctx.beginPath(); ctx.arc(cx, cy, r, a0 - Math.PI / 2, a1 - Math.PI / 2); ctx.stroke();
          ctx.strokeStyle = U.rgba(col, a); ctx.lineWidth = lw;
          ctx.beginPath(); ctx.arc(cx, cy, r, a0 - Math.PI / 2, a1 - Math.PI / 2); ctx.stroke();
        };
        const rr = R * 0.97;
        arc(rr, aR, aS, mc, 0.35 * workA, 1.2);
        if (dl.isDay) arc(rr, Math.max(aN, aR), aS, sc, 0.85 * workA, 2.4);
        const [rx, ry] = pol(R * 0.94, aR), [tx, ty] = pol(R * 0.94, aS);
        for (const a of [aR, aS]) {
          const [x0, y0] = pol(R * 0.86, a), [x1, y1] = pol(R * 1.04, a);
          ctx.strokeStyle = U.rgba(sc, 0.8 * workA); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(cx + x0, cy + y0); ctx.lineTo(cx + x1, cy + y1); ctx.stroke();
        }
        ctx.setLineDash([2, 7]);
        ctx.strokeStyle = U.rgba(mc, 0.55 * workA); ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(cx + rx, cy + ry); ctx.lineTo(cx + tx, cy + ty); ctx.stroke();
        ctx.setLineDash([]);
        const lp = Math.max(13, 0.019 * H);
        const lblO = { px: lp, color: C.steelMid, glow: 4, core: 0.85 };
        text(ctx, U.fmtTime(dl.sunrise), cx + rx * 0.8, cy + ry + lp * 1.3, lblO, "center", 1, workA * 0.85);
        text(ctx, U.fmtTime(dl.sunset), cx + tx * 0.8, cy + ty + lp * 1.3, lblO, "center", 1, workA * 0.85);
        let big = null, cap = null;
        if (dl.isDay && dl.lightLeftMin != null) { big = U.fmtMinutes(dl.lightLeftMin); cap = "OF LIGHT REMAINING"; }
        else {
          let rise = dl.sunrise.getTime(); if (rise < now.getTime()) rise += 86400000;
          big = U.fmtMinutes((rise - now.getTime()) / 60000); cap = "UNTIL SUNRISE";
        }
        const chordY = (ry + ty) / 2;
        const ly = chordY > R * 0.12 ? cy - R * 0.2 : cy + R * 0.42;
        const bigA = dl.isDay ? 0.95 : 0.7;
        text(ctx, big, cx, ly, { px: 0.05 * H, color: C.steel, glow: 8, core: 0.9 }, "center", 1, workA * bigA);
        text(ctx, cap, cx, ly + R * 0.16, { px: lp * 0.92, spacing: 0.32, color: C.steelMid, glow: 3, core: 0.8 }, "center", 1, workA * 0.8);
      }
      if (sunA > 0.01) sunGlyph(ctx, sx, sy, 0.024 * H * 0.42, instC, 0.95 * sunA);

      // ---------------------------------------------------- clock + date
      const nowStr = U.fmtTime(now, { hour24: AW.config.clock ? AW.config.clock.hour24 !== false : true });
      const ckW = { x: 0.285 * W, y: 0.335 * H, px: 0.28 * H };
      const ckA = { x: T.tcx, y: 0.905 * H - npRise, px: 0.122 * H };
      const mvY = U.smoothstep(0.2, 0.64, b), mvX = U.smoothstep(0.36, 0.86, b);
      // descend first (left of the temple), then slide along the foot of the plate into the caption
      const ckx = U.lerp(ckW.x, ckA.x, mvX), cky = U.lerp(ckW.y, ckA.y, mvY), ckp = U.lerp(ckW.px, ckA.px, mvY);
      const xf = U.smoothstep(0.3, 0.75, b);
      text(ctx, nowStr, ckx, cky, { px: ckW.px, color: C.steel, glow: 14, engrave: true, core: 0.62 }, "center", ckp / ckW.px, 1 - xf);
      text(ctx, nowStr, ckx, cky, { px: ckA.px, color: C.candle, glow: 10, core: 0.82 }, "center", ckp / ckA.px, xf * 0.86);

      const wd = now.toLocaleDateString("en-CA", { weekday: "long" }).toUpperCase();
      const mo = now.toLocaleDateString("en-CA", { month: "long" }).toUpperCase();
      const dateStr = `${wd}  ·  ${roman(now.getDate())} ${mo}  ·  ${roman(now.getFullYear())}`;
      const dpx = Math.max(15, 0.024 * H);
      const dateWA = fadeOut(b, 0.0, 0.26);
      text(ctx, dateStr, ckW.x, 0.505 * H - (1 - dateWA) * 0.03 * H, { px: dpx, spacing: 0.22, color: C.steelMid, glow: 4, core: 0.85 }, "center", 1, dateWA * 0.9);
      const dateA = `${roman(now.getDate())}  ·  ${roman(now.getMonth() + 1)}  ·  ${roman(now.getFullYear())}`;
      text(ctx, dateA, ckA.x, 0.972 * H - npRise, { px: Math.max(13, 0.02 * H), spacing: 0.32, color: C.amber, glow: 3, core: 0.75 }, "center", 1, ambA * 0.5);
      // now playing, ambient: an inscription under the date
      if (npHold && ambA * NPK > 0.004) {
        const io = { px: Math.max(13, 0.019 * H), style: "italic", color: C.amber, glow: 3, core: 0.78 };
        const paused = !npHold.isPlaying;
        text(ctx, npFit(npHold, io, 0.42 * W, paused ? "‖  " : "♪  "), ckA.x, 0.972 * H - npRise + 0.031 * H, io, "center", 1,
          ambA * NPK * 0.44 * (paused ? 0.65 : 1));
      }

      // engraved rule with lozenge
      const ruleA = fadeOut(b, 0.0, 0.3);
      if (ruleA > 0.01) {
        const ry = 0.565 * H - (1 - ruleA) * 0.02 * H, rw = 0.085 * W * (0.6 + 0.4 * ruleA), c = U.safe(C.steelMid);
        ctx.strokeStyle = U.rgba(c, 0.55 * ruleA); ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(ckW.x - rw, ry); ctx.lineTo(ckW.x - 12, ry); ctx.moveTo(ckW.x + 12, ry); ctx.lineTo(ckW.x + rw, ry); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ckW.x - 7, ry); ctx.lineTo(ckW.x, ry - 5); ctx.lineTo(ckW.x + 7, ry); ctx.lineTo(ckW.x, ry + 5); ctx.closePath(); ctx.stroke();
      }

      // ---------------------------------------------------- news: a line of print above the clock
      const nw = S.news;
      {
        const na = fadeOut(b, 0.02, 0.28);
        drawNews(ctx, nw, now, t, na, ckW.x, -(1 - na) * 0.03 * H);
      }

      // ---------------------------------------------------- calendar inscription
      const next = S.calendar && S.calendar.next;
      if (next) {
        const mins = next.minutesUntil;
        const soon = U.smoothstep(20, 5, mins);
        const calA = fadeOut(b, 0.03, 0.3);
        const cyT = 0.635 * H - (1 - calA) * 0.04 * H;
        const ia = calA * (0.88 + 0.12 * soon);
        if (ia > 0.004) {
          text(ctx, String(next.title).toUpperCase(), ckW.x, cyT,
            { px: 0.046 * H, spacing: 0.24, color: C.steel, glow: 8, core: 0.9 }, "center", 1, ia);
          text(ctx, mins < 1 ? "now" : `in ${U.fmtMinutes(mins)}`, ckW.x, cyT + 0.068 * H,
            { px: 0.044 * H, style: "italic", color: soon > 0.5 ? C.steel : C.steelMid, glow: 7, core: 0.9 }, "center", 1, ia);
        }
        if (mins < 30) {
          text(ctx, `${next.title}  ·  ${U.fmtMinutes(mins)}`, 0.2 * W, ckA.y,
            { px: 0.025 * H, style: "italic", color: C.amber, glow: 4, core: 0.8 }, "center", 1, ambA * 0.55);
        }
      }
      // a critical headline whispers once, faintly, in rose at the foot of the plate
      if (nw && nw.critical && nw.headline && ambA > 0.004) {
        const wo = { px: 0.022 * H, style: "italic", color: C.rose, glow: 4, core: 0.8 };
        const wy = next && next.minutesUntil < 30 ? ckA.y + 0.04 * H : ckA.y;
        text(ctx, wrap2(nw.headline, wo, 0.3 * W, false)[0], 0.2 * W, wy, wo, "center", 1, ambA * 0.42 * (0.8 + 0.2 * Math.sin(t * TAU / 3.2)));
      }

      // ---------------------------------------------------- weather sliver
      const wx = S.weather;
      if (wx && wx.actionable) {
        const s = wx.tempC != null ? `${wx.actionable}  ·  ${Math.round(wx.tempC)}°` : wx.actionable;
        const wA = fadeOut(b, 0.06, 0.32);
        if (wA > 0.01) text(ctx, s, ckW.x, 0.79 * H - (1 - wA) * 0.03 * H, { px: 0.027 * H, style: "italic", color: C.steelMid, glow: 4, core: 0.85 }, "center", 1, wA * 0.85);
        text(ctx, wx.actionable, 0.83 * W, ckA.y, { px: 0.023 * H, style: "italic", color: C.straw, glow: 3, core: 0.75 }, "center", 1, ambA * 0.36);
      }

      // ---------------------------------------------------- heartbeat: roundels -> lamps on the steps
      const hb = Array.isArray(S.heartbeat) ? S.heartbeat : [];
      if (hb.length) {
        const n = hb.length;
        const gapW = 0.075 * W;
        const hx0 = ckW.x - gapW * (n - 1) / 2;
        const hyW = 0.895 * H;
        const rA = fadeOut(b, 0.05, 0.38);
        const lampA = U.smoothstep(0.55, 0.95, b);
        const stp = T.steps[0];
        hb.forEach((h, i) => {
          const down = !h.up;
          const wxp = hx0 + i * gapW;
          const lx = T.tcx + (i - (n - 1) / 2) * T.ax * 2;
          const ly = stp.y0 + (stp.y1 - stp.y0) * 0.78;
          if (rA > 0.01) {
            const mvx = U.lerp(wxp, lx, U.smoothstep(0, 0.5, b) * 0.35), mvy = hyW - (1 - rA) * 0.02 * H;
            const col = down ? C.alarm : C.steelMid;
            roundel(ctx, mvx, mvy, 0.017 * H, col, (down ? 1 : 0.8) * rA, t + i * 1.7, down);
            const lp = Math.max(13, 0.0175 * H);
            text(ctx, String(h.host).toUpperCase(), mvx, mvy + 0.017 * H + lp * 1.15,
              { px: lp, spacing: 0.25, color: down ? C.alarm : C.steelDim, glow: down ? 6 : 2, core: 0.85 }, "center", 1, rA * (down ? 1 : 0.85));
            if (down) {
              const since = h.downSince ? `down ${U.fmtMinutes((now - h.downSince) / 60000)}` : "down";
              text(ctx, since, mvx, mvy + 0.017 * H + lp * 2.5, { px: lp * 1.05, style: "italic", color: C.alarm, glow: 5, core: 0.9 }, "center", 1, rA);
            }
          }
          if (lampA > 0.01) {
            lamp(ctx, lx, ly, lampA * (down ? 1 : 0.85), t, i, down, dk);
            if (down) {
              text(ctx, String(h.host), lx + 0.016 * H, ly - 0.03 * H, { px: 0.02 * H, style: "italic", color: C.rose, glow: 4, core: 0.8 }, "left", 1,
                lampA * (0.55 + 0.2 * Math.sin(t * 1.6)));
            }
          }
        });
      }

      // ---------------------------------------------------- ledger (finances)
      const fin = S.finances;
      const ledA = fadeOut(b, 0.0, 0.32);
      if (fin && ledA > 0.01 && fin.income != null && fin.spent != null) {
        const mood = fin.mood || "calm";
        const warn = mood === "warning";
        const pulse = warn ? 0.8 + 0.2 * Math.sin(t * 2.2) : 1;
        const mc = warn ? C.alarm : mood === "drift" ? U.mix(C.steelMid, C.straw, 0.75) : C.steelMid;
        const r = 0.05 * H;
        const ly = 0.835 * H + (1 - ledA) * 0.03 * H;
        const lx = G.cx - 0.075 * W;
        const a = ledA;
        const base = -0.75 * Math.PI; // 270-degree track, open at the bottom
        const span = 1.5 * Math.PI;
        const arcS = (rad, a0, a1, col, al, lw) => {
          const c = U.safe(col);
          ctx.strokeStyle = U.rgba(c, al * 0.16); ctx.lineWidth = lw * 4;
          ctx.beginPath(); ctx.arc(lx, ly, rad, a0 - Math.PI / 2, a1 - Math.PI / 2); ctx.stroke();
          ctx.strokeStyle = U.rgba(c, al); ctx.lineWidth = lw;
          ctx.beginPath(); ctx.arc(lx, ly, rad, a0 - Math.PI / 2, a1 - Math.PI / 2); ctx.stroke();
        };
        const ratio = fin.income > 0 ? fin.spent / fin.income : 1;
        arcS(r, base, base + span, C.steelMid, 0.55 * a, 1.2); // made
        arcS(r * 0.78, base, base + span * Math.min(1, ratio), mc, 0.85 * a * pulse, 2.2); // spent
        if (ratio > 1) arcS(r * 0.78, base + span, base + span + Math.min(0.25 * Math.PI, span * (ratio - 1)), C.alarm, 0.95 * a * pulse, 2.6);
        for (const q of [base, base + span]) {
          const [x0, y0] = pol(r * 0.66, q), [x1, y1] = pol(r * 1.1, q);
          ctx.strokeStyle = U.rgba(U.safe(C.steelMid), 0.6 * a); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(lx + x0, ly + y0); ctx.lineTo(lx + x1, ly + y1); ctx.stroke();
        }
        // centre: an engraved balance, beam tipping toward whichever side is heavier
        {
          const bc = U.safe(mc), tilt = U.clamp((ratio - 1) * 1.2, -0.3, 0.3);
          const top = ly - r * 0.24, arm = r * 0.42, hang = r * 0.26, pan = r * 0.12;
          ctx.strokeStyle = U.rgba(bc, 0.75 * a); ctx.lineWidth = 1.2; ctx.beginPath();
          ctx.moveTo(lx, ly + r * 0.36); ctx.lineTo(lx, top);
          ctx.moveTo(lx - r * 0.13, ly + r * 0.36); ctx.lineTo(lx + r * 0.13, ly + r * 0.36);
          const ex = Math.cos(tilt) * arm, ey = Math.sin(tilt) * arm;
          ctx.moveTo(lx - ex, top - ey); ctx.lineTo(lx + ex, top + ey);
          for (const sg of [-1, 1]) {
            const px = lx + sg * ex, py = top + sg * ey;
            ctx.moveTo(px, py); ctx.lineTo(px - pan, py + hang); ctx.moveTo(px, py); ctx.lineTo(px + pan, py + hang);
            ctx.moveTo(px - pan * 1.15, py + hang); ctx.arc(px, py + hang, pan * 1.15, Math.PI, 0, true);
          }
          ctx.stroke();
          ctx.fillStyle = U.rgba(bc, 0.8 * a); ctx.beginPath(); ctx.arc(lx, top, 2, 0, TAU); ctx.fill();
        }

        const tx = lx + r + 0.02 * W;
        const net = fin.net != null ? fin.net : fin.income - fin.spent;
        text(ctx, U.fmtMoney(net, { sign: true }), tx, ly - 0.022 * H,
          { px: 0.044 * H, color: warn ? C.alarm : mood === "drift" ? mc : C.steel, glow: warn ? 10 : 7, core: 0.9 }, "left", 1, a * pulse);
        const lp = Math.max(13, 0.0175 * H);
        text(ctx, `${U.fmtMoney(fin.income)} made  ·  ${U.fmtMoney(fin.spent)} spent`, tx, ly + 0.022 * H,
          { px: lp, color: C.steelMid, glow: 3, core: 0.85 }, "left", 1, a * 0.85);
        if (fin.lastUpdated) {
          text(ctx, `updated ${agoH(fin.lastUpdated, now)}`, tx, ly + 0.047 * H,
            { px: lp * 0.95, style: "italic", color: C.steelDim, glow: 2, core: 0.85 }, "left", 1, a * 0.8);
        }
      }
      // ---------------------------------------------------- now playing (work): the foot of the dial's column
      if (npHold) {
        const npA = fadeOut(b, 0.02, 0.3) * NPK;
        drawNowPlayingWork(ctx, npHold, G.cx, 0.945 * H + (1 - fadeOut(b, 0.02, 0.3)) * 0.03 * H, 0.3 * W, npA);
      }
      dimEnd(out, ctx, dimK);
      ctx = out;
      ctx.globalAlpha = 1;
      // sound cues from what was drawn: the flash, the lamps (one per host), the hour
      const nh = Array.isArray(S.heartbeat) ? S.heartbeat.length : 0;
      if (LAMPX.length !== nh) { LAMPX.length = 0; for (let i = 0; i < nh; i++) LAMPX.push(T.tcx + (i - (nh - 1) / 2) * T.ax * 2); }
      sfx(f, lightning(t), b, dk, LAMPX);
    },
  });
})();
