// Wizard's Tower: the view from a high tower window over a moonlit city of spires.
// Work = the arcanist's desk: the window arch drawn as a silver-blue hairline with faint rune ticks, the clock as
//   the hero inside it, the date and the next event beneath, daylight as a sun/moon arc with the light left, the
//   ledger with an alchemical mood mark, hosts as small labelled ward-rune sigils along the sill. It holds still;
//   a down host is the one loud flare.
// Ambient = the window itself: a gently pointed arch in a deep splayed stone reveal, a carved sill with a sleeping
//   raven, the time on a brass plate let into the parapet. Beyond it a walled city on a river plain, modelled as
//   small convex solids and baked once at device resolution: a crenellated ring wall with round towers and a
//   gatehouse, a castle on its crag, a cathedral with flying buttresses and spires, an academy dome, slender
//   wizards' towers with conical roofs and a sky-bridge, a few hundred steep-roofed houses, arched bridges over
//   the river, and three mountain ranges with snowfields beyond. The sky is real: the moon at its true altitude,
//   azimuth and phase for the wall's location (seen only while it stands in the window), dusk on the west side, stars
//   resolving over the evening. Moonlight is baked twice (from the east, from the west) and cross-faded by where
//   the moon really is. Weather is real: cloud banks cross the moon, fog drowns the lower city so only the spires
//   pierce it, rain curtains sweep the view with wet glints on the roofs and splashes on the sill, a storm's dim
//   lightning silhouettes the spires and flares on the ward, snow drifts past and settles on roofs and sill.
// Magic, sparingly: window lights wink on over the evening (amber first, arcane teal and violet later) and many
//   amber ones go dark after midnight; a ward-dome shimmers over the city with slow rune bands; lanterns and
//   motes drift up from the streets; once an evening a comet crosses the sky over a few minutes; now and then a
//   wyvern or a griffin glides across the moon. Hosts are ward-runes on the gatehouse towers: a calm slow pulse,
//   or a red flicker that fails, with the host's name whispered beside it.
// By day (frame.day) the window shows the city in its true colours under a real sky: slate roofs, honey stone, the
//   gilded dome, banners, boats and birds, the spell-lights out and the ward all but gone; the room's stone is lit by
//   the daylight. Golden hour warms it, dusk hands over to the night magic. Faint behind the work face by day.
// The exhale: the desk fades in a cascade, the hairline arch thickens into stone, the night unveils from the
//   horizon line outward, and the ward and its lights come last. Back to work: the reverse.
(function () {
  const U = AW.util;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const SERIF = '"Cormorant Garamond", "EB Garamond", Garamond, "TeX Gyre Pagella", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "DejaVu Serif", serif';

  const C = {
    steel: U.hex("#8cc2d8"),     // work hero: silver-blue
    steelMid: U.hex("#6d9fbe"),
    steelDim: U.hex("#527f9e"),
    rune: U.hex("#5fb6c6"),
    alarm: U.hex("#e8703a"),
    rose: U.hex("#d8604a"),
    ward: U.hex("#d64a3a"),      // a failing ward
    gilt: U.hex("#dcaa58"),      // the ambient clock
    brass: U.hex("#a8803e"),
    amber: U.hex("#c98a3a"),
    straw: U.hex("#c4b787"),
    candle: U.hex("#e2a24c"),    // windows
    lamp: U.hex("#d8893c"),      // street and bridge lamps
    teal: U.hex("#46c6bc"),      // arcane
    violet: U.hex("#9c82e4"),
    bone: U.hex("#d6c7a0"),      // the moon
    moonLit: U.hex("#a9bad6"),   // moonlight on stone
    sunLit: U.hex("#dca874"),
    slate: U.hex("#5f7896"),
    ink: U.hex("#7088b0"),
    skyNight: U.hex("#4c5296"),
    skyZen: U.hex("#20264e"),
    skyDusk: U.hex("#c86a4c"),
    skyDuskHi: U.hex("#6a5a9a"),
    skyDay: U.hex("#7896c8"),
    mist: U.hex("#8e98bc"),
    glow: U.hex("#c88a5a"),      // the city's light on the haze
    starGold: U.hex("#d6b57a"),
    starBlue: U.hex("#93abd2"),
    snow: U.hex("#c6d2e6"),
    rain: U.hex("#8fa2c8"),
    bolt: U.hex("#a0a8e0"),
  };
  const DOMEC = U.mix(C.teal, C.violet, 0.3);

  // ------------------------------------------------------------------ astronomy (as classical)
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
  const fadeOut = (b, a0, a1) => 1 - U.smoothstep(a0, a1, b);

  // ------------------------------------------------------------------ canvases + sprites
  let dpr = 1, W = 0, H = 0, built = "";
  let LWU = 1;          // line-width unit: hairlines stay hairlines at 4K but do not vanish
  let V = null;         // the view: window opening, horizon, camera
  let L = {};           // baked layers
  let CITY = null;      // the world model: solids, wards, lantern sources
  const sprites = new Map();
  const glows = new Map();
  let mctx = null;

  function mk(wCss, hCss) {
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.ceil(wCss * dpr)); cv.height = Math.max(1, Math.ceil(hCss * dpr));
    const c = cv.getContext("2d"); c.scale(dpr, dpr);
    return { cv, c };
  }
  // a layer covering the box (x, y, w, h) of the screen, drawn in screen coordinates
  function layer(x, y, w, h) {
    const o = mk(w, h);
    o.c.setTransform(dpr, 0, 0, dpr, -x * dpr, -y * dpr);
    o.x = x; o.y = y; o.w = w; o.h = h;
    return o;
  }
  const blit = (ctx, o, a) => { if (a > 0.004) { ctx.globalAlpha = U.clamp(a); ctx.drawImage(o.cv, o.x, o.y, o.w, o.h); } };
  // retint a monochrome layer in place (its alpha is the picture, so this is lossless)
  function tint(o, col) {
    const k = colKey(col);
    if (o.tk === k) return;
    o.tk = k;
    const c = o.c; c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-in"; c.fillStyle = U.rgba(U.safe(col), 1); c.fillRect(0, 0, o.cv.width, o.cv.height);
    c.restore();
  }
  const spacingOk = (c) => "letterSpacing" in c;
  const colKey = (c) => `${c.r | 0},${c.g | 0},${c.b | 0}`;

  // o: { px, style, spacing (em), color, glow, core }
  function sprite(str, o) {
    const key = `${str}|${o.px | 0}|${o.style || ""}|${o.spacing || 0}|${colKey(o.color)}|${o.glow || 0}|${o.core || 0}`;
    let s = sprites.get(key);
    if (s) { sprites.delete(key); sprites.set(key, s); return s; }
    const font = `${o.style || ""} 400 ${Math.round(o.px)}px ${SERIF}`;
    const sp = (o.spacing || 0) * o.px;
    if (!mctx) mctx = document.createElement("canvas").getContext("2d");
    mctx.font = font; if (spacingOk(mctx)) mctx.letterSpacing = `${sp}px`;
    const tw = mctx.measureText(str).width - (spacingOk(mctx) ? sp : 0);
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
      c.shadowBlur = glow * 2 * dpr; c.fillStyle = U.rgba(col, 0.22); c.fillText(str, x, y);
      c.shadowBlur = glow * dpr; c.fillStyle = U.rgba(col, 0.3); c.fillText(str, x, y);
      c.shadowBlur = 0;
    }
    c.fillStyle = U.rgba(col, o.core || 0.92); c.fillText(str, x, y);
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
  function radialSprite(size, col, stops) {
    const { cv, c } = mk(size, size);
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    const cc = U.safe(col);
    for (const [p, a] of stops) g.addColorStop(p, U.rgba(cc, a));
    c.fillStyle = g; c.fillRect(0, 0, size, size);
    return cv;
  }
  function glow(col) {
    const k = colKey(col);
    let g = glows.get(k);
    if (!g) { g = radialSprite(64, col, [[0, 1], [0.18, 0.5], [0.5, 0.12], [1, 0]]); glows.set(k, g); }
    return g;
  }
  function polyPath(c, pts) {
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  }

  // runes: strokes in a unit box (y down). Hosts and the ward bands use them.
  const RUNES = [
    [[0, -0.5, 0, 0.5], [0, -0.28, 0.34, -0.5], [0, -0.02, 0.34, -0.24]],                                    // fehu
    [[0, -0.5, 0, 0.5], [0, -0.08, -0.34, -0.5], [0, -0.08, 0.34, -0.5]],                                    // algiz
    [[0, -0.5, 0, 0.5], [0, -0.5, 0.3, -0.26], [0.3, -0.26, 0, -0.02], [0, -0.02, 0.32, 0.5]],               // raido
    [[0, -0.5, 0, 0.5], [0, -0.5, -0.3, -0.18], [0, -0.5, 0.3, -0.18]],                                      // tiwaz
    [[-0.32, 0.5, 0, 0.06], [0, 0.06, 0.32, 0.5], [0, 0.06, -0.24, -0.22], [-0.24, -0.22, 0, -0.5], [0, -0.5, 0.24, -0.22], [0.24, -0.22, 0, 0.06]], // othala
    [[0, -0.5, 0, 0.5], [0, -0.24, 0.3, 0], [0.3, 0, 0, 0.24]],                                              // thurisaz
    [[-0.22, -0.5, 0.2, -0.14], [0.2, -0.14, -0.2, 0.16], [-0.2, 0.16, 0.22, 0.5]],                          // sowilo
    [[-0.26, -0.5, -0.26, 0.5], [0.26, -0.5, 0.26, 0.5], [-0.26, -0.5, 0.26, -0.04], [0.26, -0.5, -0.26, -0.04]], // mannaz
  ];
  const runeFor = (s) => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return RUNES[h % RUNES.length]; };
  function runePath(ctx, R, x, y, s) { for (const [a, b2, c2, d] of R) { ctx.moveTo(x + a * s, y + b2 * s); ctx.lineTo(x + c2 * s, y + d * s); } }

  // ------------------------------------------------------------------ the view
  // A gently pointed two-centred arch: each side struck from a centre just past the middle. The camera sits in
  // the window looking south; the horizon is at eye level, the city spreads below it.
  function geom() {
    const span = Math.min(0.58 * W, 1.04 * H);
    const cx = W / 2, x0 = cx - span / 2, x1 = cx + span / 2;
    const R = 0.56 * span, apex = 0.055 * H;
    const rise = Math.sqrt(R * R - (R - span / 2) * (R - span / 2));
    const ys = apex + rise, sill = 0.8 * H;
    V = {
      span, cx, x0, x1, R, apex, ys, sill, cl: x0 + R, cr: x1 - R,
      D: 0.055 * span,                       // the splay of the reveal
      sillIn: sill + 0.036 * H, sillFront: sill + 0.052 * H,
      plateY: 0.915 * H,
      hz: 0.445 * H, f: 1.02 * H, Hc: 0.55, cz: 1.05, // horizon, focal length, eye height and position (world units)
      bx: Math.floor(x0 - 2), by: Math.floor(apex - 2), bw: Math.ceil(span + 4), bh: Math.ceil(sill - apex + 4),
    };
  }
  // the opening (off = 0) or an offset of it (off > 0 grows it about the same centres), closed at yBot
  function archPath(c, off, yBot) {
    const r = V.R + off, ax = V.cx - V.cl, ay = Math.sqrt(Math.max(0, r * r - ax * ax));
    c.moveTo(V.x0 - off, yBot); c.lineTo(V.x0 - off, V.ys);
    c.arc(V.cl, V.ys, r, Math.PI, Math.atan2(-ay, ax) + TAU, false);
    c.arc(V.cr, V.ys, r, Math.atan2(-ay, -ax), 0, false);
    c.lineTo(V.x1 + off, yBot); c.closePath();
  }
  // just the curve and jambs (no closing line), for strokes
  function archLine(c, off, yBot) {
    const r = V.R + off, ax = V.cx - V.cl, ay = Math.sqrt(Math.max(0, r * r - ax * ax));
    c.moveTo(V.x0 - off, yBot); c.lineTo(V.x0 - off, V.ys);
    c.arc(V.cl, V.ys, r, Math.PI, Math.atan2(-ay, ax) + TAU, false);
    c.arc(V.cr, V.ys, r, Math.atan2(-ay, -ax), 0, false);
    c.lineTo(V.x1 + off, yBot);
  }
  const archTop = (x) => { const d = x - (x < V.cx ? V.cl : V.cr); return V.ys - Math.sqrt(Math.max(0, V.R * V.R - d * d)); };
  const inOpening = (x, y, m) => x > V.x0 + m && x < V.x1 - m && y < V.sill && y > archTop(x) + m;
  // world -> screen. X across (+ right), Y up, Z away from the window.
  const PX = (X, Z) => V.cx + V.f * X / (Z - V.cz);
  const PY = (Y, Z) => V.hz + V.f * (V.Hc - Y) / (Z - V.cz);

  // ------------------------------------------------------------------ the world model
  const CITY_C = [0.3, 4.65], CITY_R = 1.5;
  // the river's centreline (X, Z), far to near: down from the western mountains, past the castle's crag, then
  // across the foreground as the moat under the near wall, out to the east
  const RIV = [[-15, 45], [-8, 24], [-5.2, 14], [-3.8, 9.5], [-2.5, 7.0], [-1.8, 5.6], [-1.6, 4.6], [-1.45, 3.7], [-1.08, 3.04], [-0.3, 2.84], [0.6, 2.81], [1.5, 2.85], [2.4, 2.96], [3.4, 3.2], [5, 3.8]];
  const riverW = (Z) => 0.2 + 0.3 * U.smoothstep(6, 30, Z);
  // distance from (x, z) to the centreline
  function riverDist(x, z) {
    let best = 1e9;
    for (let i = 1; i < RIV.length; i++) {
      const [ax, az] = RIV[i - 1], [bx, bz] = RIV[i], dx = bx - ax, dz = bz - az;
      const u = U.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
      best = Math.min(best, Math.hypot(x - ax - u * dx, z - az - u * dz));
    }
    return best;
  }
  const onRiver = (x, z, m) => riverDist(x, z) < riverW(z) / 2 + m;
  // the centreline subdivided, with unit normals, for the water's outline
  function riverSamples() {
    const out = [];
    for (let i = 1; i < RIV.length; i++) {
      const [ax, az] = RIV[i - 1], [bx, bz] = RIV[i], n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.12));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const u = k / n, x = U.lerp(ax, bx, u), z = U.lerp(az, bz, u);
        out.push([x, z]);
      }
    }
    // smooth the corners a little
    for (let pass = 0; pass < 3; pass++) for (let i = 1; i < out.length - 1; i++) { out[i][0] = (out[i - 1][0] + 2 * out[i][0] + out[i + 1][0]) / 4; out[i][1] = (out[i - 1][1] + 2 * out[i][1] + out[i + 1][1]) / 4; }
    return out.map((p, i) => {
      const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      return [p[0], p[1], -dz / l, dx / l];
    });
  }
  const HF = 0.27; // the fog's height: only towers and spires stand above it

  // a convex solid from world vertices and faces; normals oriented away from the centroid.
  // face: index list, or { ix, edges: [edge indices to engrave], line: 0 (no edges) }
  function solid(v, faces, o) {
    let cx = 0, cy = 0, cz = 0, ymin = 1e9;
    for (const p of v) { cx += p[0]; cy += p[1]; cz += p[2]; ymin = Math.min(ymin, p[1]); }
    cx /= v.length; cy /= v.length; cz /= v.length;
    const f = faces.map((fc) => {
      const ix = fc.ix || fc;
      let nx = 0, ny = 0, nz = 0, mx = 0, my = 0, mz = 0;
      for (let i = 0; i < ix.length; i++) {
        const a = v[ix[i]], b = v[ix[(i + 1) % ix.length]];
        nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
        mx += a[0]; my += a[1]; mz += a[2];
      }
      mx /= ix.length; my /= ix.length; mz /= ix.length;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if ((mx - cx) * nx + (my - cy) * ny + (mz - cz) * nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      return { ix, n: [nx, ny, nz], c: [mx, my, mz], edges: fc.edges || null, line: fc.line == null ? 1 : fc.line };
    });
    // painter's key: far first; within a stack, the higher part last
    const s = { v, f, mat: "stone", lights: [], ymin };
    Object.assign(s, o || {});
    if (s.key == null) s.key = cz - 1e-3 * ymin;
    return s;
  }
  function box(X, Z, w, d, y0, h, rot, o) {
    const c = Math.cos(rot || 0), s = Math.sin(rot || 0), v = [];
    for (const [a, b] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) v.push([X + a * c - b * s, y0, Z + a * s + b * c]);
    for (let i = 0; i < 4; i++) v.push([v[i][0], y0 + h, v[i][2]]);
    return solid(v, [{ ix: [0, 1, 2, 3], line: 0 }, [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], o);
  }
  // pitched roof, ridge along the local x axis
  function gable(X, Z, w, d, y0, rh, rot, ov, o) {
    const c = Math.cos(rot || 0), s = Math.sin(rot || 0), hw = w / 2 + ov, hd = d / 2 + ov;
    const P = (a, b, y) => [X + a * c - b * s, y, Z + a * s + b * c];
    const v = [P(-hw, -hd, y0), P(hw, -hd, y0), P(hw, hd, y0), P(-hw, hd, y0), P(-hw * 0.98, 0, y0 + rh), P(hw * 0.98, 0, y0 + rh)];
    return solid(v, [[0, 1, 5, 4], [3, 2, 5, 4], [0, 4, 3], [1, 5, 2], { ix: [0, 1, 2, 3], line: 0 }], Object.assign({ mat: "roof" }, o));
  }
  function pyramid(X, Z, w, d, y0, rh, rot, o) {
    const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
    const P = (a, b, y) => [X + a * c - b * s, y, Z + a * s + b * c];
    const v = [P(-w / 2, -d / 2, y0), P(w / 2, -d / 2, y0), P(w / 2, d / 2, y0), P(-w / 2, d / 2, y0), [X, y0 + rh, Z]];
    return solid(v, [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], { ix: [0, 1, 2, 3], line: 0 }], Object.assign({ mat: "roof" }, o));
  }
  // a beam of rectangular section between two points (flying buttresses, the sky-bridge)
  function beam(p0, p1, w, t, o) {
    const dx = p1[0] - p0[0], dz = p1[2] - p0[2], l = Math.hypot(dx, dz) || 1;
    const sx = -dz / l * w / 2, sz = dx / l * w / 2;
    const v = [];
    for (const p of [p0, p1]) { v.push([p[0] - sx, p[1], p[2] - sz], [p[0] + sx, p[1], p[2] + sz]); }
    for (const p of [p0, p1]) { v.push([p[0] - sx, p[1] + t, p[2] - sz], [p[0] + sx, p[1] + t, p[2] + sz]); }
    return solid(v, [[0, 1, 3, 2], [4, 5, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6]], o);
  }
  // a solid of revolution: profile [[r, y], ...] bottom up; o.rings flags which rings are engraved, o.seams every
  // how many facets a vertical rib is engraved, o.jit(j, i) roughens the radius (crags, firs)
  function revolve(X, Z, prof, n, o) {
    o = o || {};
    const v = [], faces = [], ph = o.ph || 0, rs = [];
    for (let j = 0; j < prof.length; j++) {
      const [r, y] = prof[j];
      rs.push(v.length);
      if (r <= 1e-6) { v.push([X, y, Z]); continue; }
      for (let i = 0; i < n; i++) {
        const a = ph + i / n * TAU, rr = r * (o.jit ? o.jit(j, i) : 1);
        v.push([X + Math.sin(a) * rr, y, Z - Math.cos(a) * rr]);
      }
    }
    const feat = (j) => (o.rings ? !!o.rings[j] : true), K = o.seams || 0;
    for (let j = 0; j < prof.length - 1; j++) {
      const a0 = rs[j], a1 = rs[j + 1], p0 = prof[j][0] <= 1e-6, p1 = prof[j + 1][0] <= 1e-6;
      for (let i = 0; i < n; i++) {
        const i2 = (i + 1) % n, seam = K && i % K === 0;
        if (p1) faces.push({ ix: [a0 + i, a0 + i2, a1], edges: [feat(j) ? 0 : -1, seam ? 2 : -1] });
        else if (p0) faces.push({ ix: [a0, a1 + i2, a1 + i], edges: [feat(j + 1) ? 1 : -1, seam ? 2 : -1] });
        else faces.push({ ix: [a0 + i, a0 + i2, a1 + i2, a1 + i], edges: [feat(j) ? 0 : -1, feat(j + 1) ? 2 : -1, seam ? 3 : -1] });
      }
    }
    if (prof[0][0] > 1e-6) { const ix = []; for (let i = n - 1; i >= 0; i--) ix.push(rs[0] + i); faces.push({ ix, line: 0 }); }
    const last = prof.length - 1;
    if (prof[last][0] > 1e-6) { const ix = []; for (let i = 0; i < n; i++) ix.push(rs[last] + i); faces.push({ ix }); }
    const so = Object.assign({}, o); delete so.jit; delete so.rings; delete so.seams; delete so.ph;
    return solid(v, faces, so);
  }
  // a window light on a solid: world point, outward normal, world size, kind
  // kinds: 0 amber window, 1 warm lamp-lit window, 2 arcane teal, 3 arcane violet, 4 street / bridge lamp,
  //        5 tower-top orb, 6 the rose window
  const lit = (s, p, n, size, k) => { s.lights.push({ p, n, s: size, k }); };

  function buildCity() {
    const S = [], wards = [], sources = [];
    const add = (s) => { S.push(s); return s; };
    const rnd = U.rng(31337);
    const [cX, cZ] = CITY_C;
    const keep = [];          // footprints houses keep out of: [x, z, r]
    const winOnBox = (s, X, Z, w, d, y0, h, rot, prob, kinds, storey) => {
      const c = Math.cos(rot), sn = Math.sin(rot);
      for (const [nl, ml] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const len = nl ? d : w, n = Math.max(1, Math.round(len / 0.034));
        const wn = [nl * c - ml * sn, 0, nl * sn + ml * c];
        const floors = Math.max(1, Math.floor(h / storey));
        for (let fl = 0; fl < floors; fl++) for (let k = 0; k < n; k++) {
          if (rnd() > prob) continue;
          const u = ((k + 0.5) / n - 0.5) * len * 0.8;
          const a = nl ? nl * (w / 2 + 0.003) : u, b = ml ? ml * (d / 2 + 0.003) : u;
          lit(s, [X + a * c - b * sn, y0 + (fl + 0.55) * storey, Z + a * sn + b * c], wn, 0.011, kinds());
        }
      }
    };

    // ---- the ring wall: crenellated segments, round towers, a gatehouse to the north (toward us), water gates
    const ring = (th) => [cX + CITY_R * Math.sin(th), cZ + CITY_R * Math.cos(th)];
    const NSEG = 56, wallH = 0.11, wallT = 0.045;
    const gateTh = Math.PI, gateW = 0.07;
    const towerAt = [];
    for (let i = 0; i < NSEG; i++) {
      const a0 = i / NSEG * TAU, a1 = (i + 1) / NSEG * TAU, am = (a0 + a1) / 2;
      const [xa, za] = ring(a0), [xb, zb] = ring(a1), xm = (xa + xb) / 2, zm = (za + zb) / 2;
      if (Math.abs(((am - gateTh + Math.PI) % TAU + TAU) % TAU - Math.PI) < gateW) continue;
      const len = Math.hypot(xb - xa, zb - za) + 0.012, rot = Math.atan2(zb - za, xb - xa);
      if (onRiver(xm, zm, 0.05)) {
        // a water gate: the wall carried over the river on a low arch
        add(box(xm, zm, len, wallT, 0.06, wallH - 0.06, rot, { mat: "wall" }));
        continue;
      }
      const seg = add(box(xm, zm, len, wallT, 0, wallH, rot, { mat: "wall" }));
      // arrow slits along the wall-walk, a few with a guard's lamp behind them
      if (rnd() < 0.35) { const u = (rnd() - 0.5) * len * 0.6, nx = -Math.sin(rot), nz = Math.cos(rot), sg = (xm - cX) * nx + (zm - cZ) * nz > 0 ? 1 : -1; lit(seg, [xm + u * Math.cos(rot) + sg * nx * (wallT / 2 + 0.003), wallH * 0.62, zm + u * Math.sin(rot) + sg * nz * (wallT / 2 + 0.003)], [sg * nx, 0, sg * nz], 0.008, 1); }
      for (let k = 0; k < 4; k++) {
        const u = ((k + 0.5) / 4 - 0.5) * len;
        add(box(xm + u * Math.cos(rot), zm + u * Math.sin(rot), len / 4 * 0.5, wallT * 0.9, wallH, 0.024, rot, { mat: "wall", key: seg.key - 1e-4 * (k + 1) }));
      }
      if (i % 4 === 2) towerAt.push(a0);
    }
    const roundTower = (x, z, r, h, rh, o) => {
      o = o || {};
      const sh = add(revolve(x, z, [[r, 0], [r, h * 0.5], [r, h]], 12, { rings: [1, 0, 1], mat: "stone" }));
      let top = h;
      if (o.corbel) { add(revolve(x, z, [[r, h], [r * 1.2, h + 0.012], [r * 1.2, h + 0.03], [r * 1.02, h + 0.03]], 12, { mat: "stone" })); top = h + 0.03; }
      const roof = add(revolve(x, z, o.flare ? [[r * 1.32, top - 0.005], [r * 0.95, top + rh * 0.2], [0, top + rh]] : [[r * 1.16, top], [0, top + rh]], 12, { seams: 2, mat: "roof", rings: [1, 0, 0] }));
      return { sh, roof, top };
    };
    for (const th of towerAt) {
      const [x, z] = ring(th);
      if (onRiver(x, z, 0.1)) continue;
      const t = roundTower(x, z, 0.058, 0.19, 0.085);
      if (rnd() < 0.6) lit(t.sh, [x, 0.12, z - 0.06], [0, 0, -1], 0.008, 1);
      if (rnd() < 0.5) lit(t.sh, [x - 0.04, 0.08, z - 0.042], [-0.7, 0, -0.7], 0.007, 1);
    }
    // the gatehouse across the moat from the window: two drum towers carrying the hosts' wards, the gate between
    // them glowing, a causeway with lamps over the water
    {
      const [gx, gz] = ring(gateTh);
      const pts = [ring(gateTh - gateW * 0.92), ring(gateTh + gateW * 0.92)];
      const gw = Math.abs(pts[1][0] - pts[0][0]);
      const blk = add(box(gx, gz, gw, 0.07, 0, 0.16, 0, { mat: "wall" }));
      for (let k = 0; k < 4; k++) add(box(gx + (k - 1.5) * gw / 4, gz - 0.025, gw / 9, 0.02, 0.16, 0.022, 0, { mat: "wall", key: blk.key - 1e-4 * (k + 1) }));
      lit(blk, [gx, 0.035, gz - 0.037], [0, 0, -1], 0.03, 1);
      lit(blk, [gx - gw * 0.3, 0.1, gz - 0.037], [0, 0, -1], 0.008, 4);
      lit(blk, [gx + gw * 0.3, 0.1, gz - 0.037], [0, 0, -1], 0.008, 4);
      for (const [x, z] of pts) {
        const r = 0.052;
        const t = roundTower(x, z, r, 0.22, 0.1, { corbel: true });
        lit(t.sh, [x + (x < gx ? -0.02 : 0.02), 0.19, z - r - 0.002], [x < gx ? -0.35 : 0.35, 0, -0.94], 0.009, 0);
        wards.push({ p: [x, 0.105, z - r - 0.004] });
      }
      // the quay along the moat: lamp posts between the wall's foot and the water, doubled in it
      for (let x = -0.95; x < 1.95; x += 0.17) {
        const z = 3.03 + 0.04 * Math.sin(x * 2.1);
        if (Math.abs(x - gx) < 0.08) continue;
        const post = add(box(x, z, 0.0045, 0.0045, 0, 0.055, 0, { mat: "wall" }));
        lit(post, [x, 0.062, z - 0.005], [0, 0, -1], 0.007, 4);
      }
      keep.push([gx, gz, 0.16]);
    }

    // ---- the castle on its crag (north-west of the centre)
    {
      const X = -0.62, Z = 5.45, base = 0.12;
      const jr = U.rng(77);
      const jit = [];
      for (let j = 0; j < 5; j++) { const row = []; for (let i = 0; i < 16; i++) row.push(0.78 + 0.4 * jr()); jit.push(row); }
      add(revolve(X, Z, [[0.44, 0], [0.4, 0.04], [0.33, 0.08], [0.27, 0.11], [0.24, base]], 16, { seams: 1, mat: "rock", jit: (j, i) => jit[j][i], key: Z + 0.6 }));
      keep.push([X, Z, 0.46]);
      const hw = 0.19, hd = 0.16;
      const walls = [[X, Z + hd, 2 * hw, 0], [X - hw, Z, 2 * hd, Math.PI / 2], [X + hw, Z, 2 * hd, Math.PI / 2], [X, Z - hd, 2 * hw, 0]];
      for (const [x, z, l, r] of walls) {
        const w = add(box(x, z, l, 0.03, base, 0.075, r, { mat: "wall" }));
        for (let k = 0; k < 6; k++) { const u = ((k + 0.5) / 6 - 0.5) * l; add(box(x + u * Math.cos(r), z + u * Math.sin(r), l / 6 * 0.5, 0.028, base + 0.075, 0.02, r, { mat: "wall", key: w.key - 1e-4 * (k + 1) })); }
      }
      for (const [x, z] of [[X - hw, Z + hd], [X + hw, Z + hd], [X - hw, Z - hd], [X + hw, Z - hd]]) {
        add(revolve(x, z, [[0.036, base], [0.036, base + 0.13]], 10, { mat: "stone" }));
        add(revolve(x, z, [[0.044, base + 0.13], [0, base + 0.2]], 10, { seams: 2, mat: "roof" }));
      }
      // the keep, with corner bartizans and a crown of merlons
      const kx = X + 0.03, kz = Z + 0.02, kw = 0.16, kd = 0.13, kh = 0.34;
      const k = add(box(kx, kz, kw, kd, base, kh, 0, { mat: "stone" }));
      winOnBox(k, kx, kz, kw, kd, base, kh, 0, 0.32, () => (rnd() < 0.8 ? 0 : 1), 0.06);
      for (let q = 0; q < 5; q++) add(box(kx - kw / 2 + (q + 0.5) * kw / 5, kz - kd / 2 + 0.008, 0.014, 0.016, base + kh, 0.022, 0, { mat: "stone", key: k.key - 1e-4 * (q + 1) }));
      for (const [x, z] of [[kx - kw / 2, kz - kd / 2], [kx + kw / 2, kz - kd / 2], [kx - kw / 2, kz + kd / 2], [kx + kw / 2, kz + kd / 2]]) {
        add(revolve(x, z, [[0.006, base + kh - 0.06], [0.022, base + kh - 0.03], [0.022, base + kh + 0.03]], 8, { mat: "stone" }));
        add(revolve(x, z, [[0.027, base + kh + 0.03], [0, base + kh + 0.1]], 8, { seams: 2, mat: "roof" }));
      }
      // the donjon: a slender tower rising behind the keep, a violet light at its top
      const dx = X - 0.09, dz = Z + 0.08;
      const dj = add(revolve(dx, dz, [[0.038, base], [0.038, base + 0.3], [0.034, base + 0.52]], 12, { rings: [1, 1, 1], mat: "stone" }));
      add(revolve(dx, dz, [[0.034, base + 0.52], [0.05, base + 0.54], [0.05, base + 0.56], [0.036, base + 0.56]], 12, { mat: "stone" }));
      const djr = add(revolve(dx, dz, [[0.046, base + 0.56], [0.03, base + 0.6], [0, base + 0.76]], 12, { seams: 2, mat: "roof", rings: [1, 0, 0] }));
      lit(dj, [dx, base + 0.47, dz - 0.04], [0, 0, -1], 0.012, 3);
      lit(dj, [dx - 0.03, base + 0.33, dz - 0.026], [-0.7, 0, -0.7], 0.01, 0);
      lit(djr, [dx, base + 0.785, dz], [0, 0, -1], 0.02, 5);
      sources.push([dx, base + 0.78, dz]);
    }

    // ---- the cathedral (nave along X, the west front toward the middle of the view)
    {
      const X = 1.02, Z = 4.95, len = 0.6, nd = 0.12, nh = 0.22;
      keep.push([X, Z, 0.4], [X - 0.22, Z, 0.16], [X + 0.22, Z, 0.16]);
      add(box(X + 0.02, Z + 0.095, len - 0.08, 0.07, 0, 0.12, 0, { mat: "stone" }));
      add(gable(X + 0.02, Z + 0.095, len - 0.08, 0.07, 0.12, 0.03, 0, 0.004));
      const nave = add(box(X, Z, len, nd, 0, nh, 0, { mat: "stone" }));
      add(gable(X, Z, len, nd, nh, 0.1, 0, 0.005));
      // clerestory windows: stained glass, faint violet and amber
      for (let q = 0; q < 6; q++) lit(nave, [X - len / 2 + 0.08 + q * 0.09, nh - 0.045, Z - nd / 2 - 0.003], [0, 0, -1], 0.014, q % 3 ? 0 : 3);
      const front = add(box(X + 0.02, Z - 0.095, len - 0.08, 0.07, 0, 0.12, 0, { mat: "stone" }));
      add(gable(X + 0.02, Z - 0.095, len - 0.08, 0.07, 0.12, 0.03, 0, 0.004));
      for (let q = 0; q < 6; q++) lit(front, [X - len / 2 + 0.1 + q * 0.085, 0.06, Z - 0.13 - 0.003], [0, 0, -1], 0.01, 0);
      // buttress piers along the south aisle, pinnacles, and flying buttresses up to the clerestory
      for (let q = 0; q < 6; q++) {
        const bx = X - len / 2 + 0.11 + q * 0.085, bz = Z - 0.15;
        const pier = add(box(bx, bz, 0.018, 0.03, 0, 0.16, 0, { mat: "stone" }));
        add(pyramid(bx, bz, 0.02, 0.03, 0.16, 0.05, 0, { mat: "stone", key: pier.key - 1e-4 }));
        add(beam([bx, 0.15, bz + 0.01], [bx, nh - 0.02, Z - nd / 2], 0.012, 0.012, { mat: "stone", key: pier.key - 2e-4 }));
      }
      // west front: two towers with spires, a rose window between them; an apse to the east
      const wx = X - len / 2 - 0.035;
      for (const dz of [0.055, -0.055]) {
        const tw = add(box(wx, Z + dz, 0.085, 0.085, 0, 0.42, 0, { mat: "stone" }));
        winOnBox(tw, wx, Z + dz, 0.085, 0.085, 0, 0.42, 0, 0.18, () => 0, 0.08);
        add(box(wx, Z + dz, 0.095, 0.095, 0.42, 0.02, 0, { mat: "stone" }));
        const sp = add(revolve(wx, Z + dz, [[0.045, 0.44], [0, 0.7]], 8, { seams: 1, mat: "roof", ph: Math.PI / 8 }));
        for (const [ox, oz] of [[-0.04, -0.04], [0.04, -0.04], [-0.04, 0.04], [0.04, 0.04]]) add(revolve(wx + ox, Z + dz + oz, [[0.008, 0.44], [0, 0.5]], 6, { mat: "roof", key: sp.key + 1e-4 }));
      }
      const westWall = add(box(wx, Z, 0.05, 0.03, 0, 0.3, 0, { mat: "stone", key: Z - 0.06 }));
      lit(westWall, [wx - 0.027, 0.2, Z], [-1, 0, 0], 0.05, 6);
      lit(westWall, [wx - 0.027, 0.05, Z], [-1, 0, 0], 0.03, 1);
      const cr = add(box(X - 0.04, Z, 0.09, 0.09, nh, 0.15, 0, { mat: "stone" }));
      winOnBox(cr, X - 0.04, Z, 0.09, 0.09, nh, 0.15, 0, 0.25, () => 3, 0.07);
      const cs = add(revolve(X - 0.04, Z, [[0.05, nh + 0.15], [0, nh + 0.5]], 8, { seams: 1, mat: "roof", ph: Math.PI / 8 }));
      lit(cs, [X - 0.04, nh + 0.52, Z], [0, 0, -1], 0.014, 5);
      add(revolve(X + len / 2, Z, [[0.06, 0], [0.06, 0.19]], 12, { mat: "stone" }));
      add(revolve(X + len / 2, Z, [[0.066, 0.19], [0, 0.29]], 12, { seams: 2, mat: "roof" }));
      sources.push([X - 0.04, nh + 0.5, Z]);
    }

    // ---- the academy: podium, drum of lit arcane windows, ribbed dome, lantern; four minarets
    {
      const X = 0.12, Z = 4.5;
      keep.push([X, Z, 0.33]);
      const pod = add(box(X, Z, 0.42, 0.38, 0, 0.07, 0, { mat: "stone" }));
      winOnBox(pod, X, Z, 0.42, 0.38, 0, 0.07, 0, 0.4, () => 0, 0.07);
      const drum = add(revolve(X, Z, [[0.15, 0.07], [0.15, 0.2], [0.162, 0.21]], 20, { seams: 2, mat: "stone" }));
      for (let q = 0; q < 20; q++) { const a = (q + 0.5) / 20 * TAU; lit(drum, [X + Math.sin(a) * 0.152, 0.14, Z - Math.cos(a) * 0.152], [Math.sin(a), 0, -Math.cos(a)], 0.016, q % 4 === 1 ? 3 : 2); }
      const prof = [];
      for (let q = 0; q <= 6; q++) { const p = q / 6 * Math.PI / 2; prof.push([q === 6 ? 0.03 : 0.158 * Math.cos(p), 0.21 + 0.17 * Math.sin(p)]); }
      add(revolve(X, Z, prof, 20, { seams: 2, mat: "dome", rings: [1, 0, 0, 0, 0, 0, 1] }));
      const lan = add(revolve(X, Z, [[0.028, 0.38], [0.028, 0.42], [0.034, 0.425], [0, 0.48]], 10, { seams: 2, mat: "stone" }));
      lit(lan, [X, 0.4, Z - 0.03], [0, 0, -1], 0.02, 2);
      lit(lan, [X, 0.5, Z], [0, 0, -1], 0.024, 5);
      sources.push([X, 0.48, Z]);
      for (const [ox, oz] of [[-0.19, -0.17], [0.19, -0.17], [-0.19, 0.17], [0.19, 0.17]]) {
        const m = add(revolve(X + ox, Z + oz, [[0.02, 0.07], [0.017, 0.3]], 10, { mat: "stone" }));
        add(revolve(X + ox, Z + oz, [[0.017, 0.3], [0.027, 0.31], [0.027, 0.32], [0.018, 0.32]], 10, { mat: "stone" }));
        add(revolve(X + ox, Z + oz, [[0.02, 0.32], [0, 0.39]], 10, { seams: 2, mat: "roof" }));
        lit(m, [X + ox, 0.27, Z + oz - 0.018], [0, 0, -1], 0.008, 2);
      }
    }

    // ---- wizards' towers: slender, conical (some witch-hat flared), lit high up, an orb at the top of a few
    const WT = [
      [-0.35, 3.82, 0.044, 0.44, 0.17, 2, true], [1.25, 3.95, 0.04, 0.4, 0.15, 3, false], [1.55, 5.2, 0.038, 0.5, 0.18, 2, true],
      [0.2, 5.75, 0.042, 0.56, 0.2, 3, true], [0.78, 3.62, 0.034, 0.34, 0.14, 0, false], [-0.78, 4.4, 0.04, 0.38, 0.15, 3, false],
      [1.65, 4.45, 0.034, 0.34, 0.13, 2, false], [0.0, 6.02, 0.035, 0.44, 0.15, 2, true], [0.85, 5.85, 0.03, 0.38, 0.13, 0, false],
    ];
    const towerTops = [], towerWards = [], spires = [];
    for (const [x, z, r, h, rh, kind, orb] of WT) {
      keep.push([x, z, r + 0.07]);
      const t = roundTower(x, z, r, h, rh, { corbel: true, flare: rnd() < 0.5 });
      for (let q = 0; q < 5; q++) {
        const a = -1.1 + rnd() * 2.2, y = h * (0.25 + 0.7 * q / 5) + rnd() * 0.02;
        lit(t.sh, [x + Math.sin(a) * (r + 0.002), y, z - Math.cos(a) * (r + 0.002)], [Math.sin(a), 0, -Math.cos(a)], 0.011, q >= 3 && kind ? kind : rnd() < 0.8 ? 0 : 1);
      }
      if (orb) { lit(t.roof, [x, t.top + rh + 0.02, z], [0, 0, -1], 0.018, 5); sources.push([x, t.top + rh, z]); }
      towerTops.push([x, z, h]);
      spires.push([x, t.top + rh, z]);
      // hosts keep their wards on the nearer towers, a rune at mid-height facing the window
      if ([0, 1, 4, 6].indexOf(towerTops.length - 1) >= 0) towerWards.push({ p: [x, h * 0.42, z - r - 0.004] });
    }
    for (const w of towerWards) wards.push(w); // a third host and beyond
    // a sky-bridge between two of them
    {
      const a = WT[3], b2 = WT[7];
      const y = 0.4;
      const br = add(beam([a[0], y, a[1]], [b2[0], y, b2[1]], 0.024, 0.026, { mat: "stone", key: (a[1] + b2[1]) / 2 + 0.02 }));
      for (let q = 1; q < 5; q++) { const u = q / 5; lit(br, [U.lerp(a[0], b2[0], u), y + 0.013, U.lerp(a[1], b2[1], u) - 0.013], [0, 0, -1], 0.006, 2); }
    }

    // ---- the great bridge from the west gate over the river, and the viaduct far out on the plain
    const bridge = (xc, Zb, len, nArch, deckY, lamps) => {
      const x0 = xc - len / 2;
      const deck = add(box(xc, Zb, len, 0.05, deckY, 0.022, 0, { mat: "wall" }));
      for (let q = 0; q <= nArch; q++) add(box(x0 + q * len / nArch, Zb, 0.022, 0.054, 0, deckY, 0, { mat: "wall", key: deck.key + 1e-4 }));
      deck.arches = { x0, len, n: nArch, Zf: Zb - 0.025, y: deckY };
      for (let q = 0; q < lamps; q++) lit(deck, [x0 + (q + 0.5) * len / lamps, deckY + 0.04, Zb - 0.026], [0, 0, -1], 0.008, 4);
      keep.push([x0, Zb, 0.08], [x0 + len, Zb, 0.08]);
    };
    bridge(-1.42, 4.58, 0.56, 4, 0.06, 4);
    bridge(-4.55, 12, 1.5, 9, 0.08, 6);

    // ---- houses: a jittered grid inside the walls, kept out of the river, the landmarks and the main street
    const blocked = (x, z) => {
      if ((x - cX) * (x - cX) + (z - cZ) * (z - cZ) > (CITY_R - 0.12) * (CITY_R - 0.12)) return true;
      if (onRiver(x, z, 0.075)) return true;
      if (Math.abs(x - cX) < 0.05 && z < cZ - 0.25) return true;
      for (const k of keep) if (Math.hypot(x - k[0], z - k[1]) < k[2]) return true;
      return false;
    };
    const house = (x, z) => {
      const w = 0.07 + 0.05 * rnd(), d = 0.07 + 0.05 * rnd();
      const tall = rnd() < 0.2, h = (tall ? 0.095 : 0.045) + 0.045 * rnd();
      const rot = (rnd() - 0.5) * 0.5;
      const b = add(box(x, z, w, d, 0, h, rot, { mat: "house" }));
      const rk = rnd();
      let roof;
      if (rk < 0.42) {
        const rh = (0.45 + 0.4 * rnd()) * d;
        roof = gable(x, z, w, d, h, rh, rot, 0.005);
        // a lit dormer or skylight on the slope that faces the window
        if (rnd() < 0.3) {
          const c = Math.cos(rot), sn = Math.sin(rot), u = (rnd() - 0.5) * w * 0.5, b0 = -d * 0.24;
          const nl = Math.hypot(d / 2, rh), ny = (d / 2) / nl, nz = -rh / nl;
          lit(roof, [x + u * c - b0 * sn, h + rh * 0.5 + 0.004, z + u * sn + b0 * c], [-nz * sn, ny, nz * c], 0.009, rnd() < 0.85 ? 0 : 1);
        }
      }
      else if (rk < 0.86) roof = gable(x, z, d, w, h, (0.6 + 0.5 * rnd()) * w, rot + Math.PI / 2, 0.005);
      else roof = pyramid(x, z, w * 1.05, d * 1.05, h, (0.8 + 0.6 * rnd()) * Math.min(w, d), rot);
      add(roof);
      if (rnd() < 0.3) add(box(x + (rnd() - 0.5) * w * 0.5, z + (rnd() - 0.2) * d * 0.4, 0.012, 0.012, h, 0.05 + 0.03 * rnd(), rot, { mat: "house", key: roof.key - 1e-4 }));
      const arcane = rnd() < 0.05;
      winOnBox(b, x, z, w, d, 0, h, rot, 0.3, () => (arcane ? (rnd() < 0.5 ? 2 : 3) : rnd() < 0.78 ? 0 : 1), 0.042);
    };
    for (let z = cZ - CITY_R; z < cZ + CITY_R; z += 0.118) {
      for (let x = cX - CITY_R; x < cX + CITY_R; x += 0.112) {
        const xx = x + (rnd() - 0.5) * 0.05, zz = z + (rnd() - 0.5) * 0.05;
        if (blocked(xx, zz) || rnd() < 0.06) { rnd(); continue; }
        house(xx, zz);
      }
    }

    // ---- out on the plain: hamlets, an observatory on its hill, a lone far spire
    for (const [hx, hz, n] of [[-2.6, 8.8, 6], [4.6, 12.5, 5], [-5.2, 15, 5], [1.2, 13.5, 4], [-3.6, 11.5, 4], [3.0, 7.0, 4]]) {
      for (let q = 0; q < n; q++) {
        const x = hx + (rnd() - 0.5) * 0.7, z = hz + (rnd() - 0.5) * 0.9;
        if (onRiver(x, z, 0.1)) continue;
        const w = 0.09 + 0.05 * rnd(), h = 0.05 + 0.04 * rnd();
        const b = add(box(x, z, w, w, 0, h, rnd(), { mat: "house" }));
        add(gable(x, z, w, w, h, 0.06, b.rot || 0, 0.005));
        if (rnd() < 0.55) lit(b, [x, h * 0.5, z - w / 2 - 0.003], [0, 0, -1], 0.03, 0);
      }
    }
    {
      const ox = 3.7, oz = 8.3;
      add(revolve(ox, oz, [[0.6, -0.02], [0.4, 0.06], [0.2, 0.11], [0.08, 0.13]], 14, { mat: "rock", key: oz + 0.7 }));
      const ob = add(revolve(ox, oz, [[0.05, 0.12], [0.05, 0.42]], 10, { mat: "stone" }));
      const pr = [];
      for (let q = 0; q <= 4; q++) { const p = q / 4 * Math.PI / 2; pr.push([q === 4 ? 0 : 0.07 * Math.cos(p), 0.42 + 0.06 * Math.sin(p)]); }
      add(revolve(ox, oz, pr, 12, { seams: 3, mat: "dome" }));
      lit(ob, [ox, 0.38, oz - 0.05], [0, 0, -1], 0.03, 2);
      lit(ob, [ox, 0.25, oz - 0.05], [0, 0, -1], 0.025, 0);
    }
    {
      const sx = -4.8, sz = 17;
      const sp = add(revolve(sx, sz, [[0.08, 0], [0.06, 0.9]], 10, { mat: "stone" }));
      add(revolve(sx, sz, [[0.075, 0.9], [0, 1.18]], 10, { mat: "roof" }));
      lit(sp, [sx, 0.85, sz - 0.07], [0, 0, -1], 0.05, 3);
    }


    // painter's order, far to near
    S.sort((a, b) => b.key - a.key);
    // the castle's donjon and the cathedral's crossing spire fly banners too
    spires.push([-0.62 - 0.09, 0.12 + 0.76, 5.45 + 0.08], [1.02 - 0.04, 0.22 + 0.5, 4.95]);
    CITY = { S, wards, sources, towerTops, spires };
  }

  // ------------------------------------------------------------------ baking: sky, mountains
  function bakeSky() {
    const h = V.hz - V.apex + 4;
    const starLayer = (seed, count, rMin, rMax, aMin, aMax, marks) => {
      const o = layer(V.bx, V.apex - 2, V.bw, h), c = o.c, rnd = U.rng(seed);
      for (let i = 0; i < count; i++) {
        const x = V.bx + rnd() * V.bw, y = V.apex + (V.hz - V.apex) * Math.pow(rnd(), 1.2);
        const col = U.safe(rnd() < 0.3 ? C.starBlue : C.starGold);
        const r = (rMin + rnd() * (rMax - rMin)) * LWU, a = aMin + rnd() * (aMax - aMin);
        c.fillStyle = U.rgba(col, a); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
        if (marks && i < 6) {
          c.strokeStyle = U.rgba(col, a * 0.4); c.lineWidth = 0.8 * LWU; const k = r * 3.6;
          c.beginPath(); c.moveTo(x - k, y); c.lineTo(x + k, y); c.moveTo(x, y - k); c.lineTo(x, y + k); c.stroke();
        }
      }
      return o;
    };
    L.stars1 = starLayer(4243, 55, 0.85, 1.5, 0.4, 0.75, true);
    L.stars2 = starLayer(9192, 190, 0.5, 1.0, 0.16, 0.42, false);
    // the galaxy: a faint mottled band rising from the south-west horizon
    {
      const c = L.stars2.c, rnd = U.rng(1618);
      const ax = V.x0 + 0.15 * V.span, ay = V.apex, bx = V.x1 - 0.05 * V.span, by = V.hz;
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
      const sc = U.safe(U.mix(C.starBlue, C.bone, 0.4));
      for (let i = 0; i < 2600; i++) {
        const u = rnd(), off = (rnd() + rnd() + rnd() - 1.5) * 0.11 * V.span;
        const x = ax + dx * u + nx * off, y = ay + dy * u + ny * off;
        const dens = 0.5 + 0.5 * U.fbm2(x / V.span * 6, y / V.span * 6, 3);
        if (rnd() > dens) continue;
        c.fillStyle = U.rgba(sc, 0.05 + 0.12 * rnd()); c.fillRect(x, y, 0.8 * LWU, 0.8 * LWU);
      }
      for (let i = 0; i < 14; i++) {
        const u = (i + 0.5) / 14, x = ax + dx * u, y = ay + dy * u, r = 0.07 * V.span * (0.7 + 0.6 * rnd());
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, U.rgba(sc, 0.022)); g.addColorStop(1, U.rgba(sc, 0));
        c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
    }
    const tr = U.rng(5151); L.twinkle = [];
    for (let i = 0; i < 9; i++) L.twinkle.push({ x: V.x0 + tr() * V.span, y: V.apex + (V.hz - V.apex) * (0.05 + 0.7 * tr()), r: (1 + tr() * 0.6) * LWU, ph: tr() * 10, sp: 0.4 + tr() * 0.6 });
    L.halo = radialSprite(256, C.bone, [[0, 1], [0.18, 0.55], [0.45, 0.16], [1, 0]]);
    L.duskGlow = radialSprite(256, C.skyDusk, [[0, 1], [0.4, 0.45], [1, 0]]);
    L.cityGlow = radialSprite(256, C.glow, [[0, 1], [0.45, 0.4], [1, 0]]);
    L.boltGlow = radialSprite(256, C.bolt, [[0, 1], [0.35, 0.4], [1, 0]]);
    L.mist = radialSprite(256, U.hex("#ffffff"), [[0, 1], [0.5, 0.55], [1, 0]]);
    L.mistTint = mk(256, 256); L.mistTintKey = "";
  }

  // Three ranges, far to near, each a filled silhouette with luminous valley haze at its foot, and two engraved
  // light layers (snowfields hatched down the fall line, lit from the east or the west).
  function bakeMountains() {
    const top = V.apex - 2, h = V.hz + 0.03 * H - top;
    L.mtn = layer(V.bx, top, V.bw, h); L.mtnL = layer(V.bx, top, V.bw, h); L.mtnR = layer(V.bx, top, V.bw, h);
    L.mtnD = layer(V.bx, top, V.bw, h);
    const c = L.mtn.c, cl = L.mtnL.c, cr = L.mtnR.c, md = L.mtnD.c;
    const xs = V.span / 520, bot = V.hz + 0.03 * H;
    // massifs: [centre (of span), height (of H), half-width, skew]; ridged noise carves the arêtes and cols
    const ranges = [
      { mass: [[-0.42, 0.1, 0.2, 0.3], [-0.2, 0.15, 0.13, -0.4], [0.05, 0.11, 0.12, 0.2], [0.3, 0.135, 0.13, -0.3], [0.58, 0.09, 0.16, 0.2]],
        base: 0.012, rough: 0.78, fill: [8, 9, 16], haze: 0.55, snow: 0.07, seed: 3.3, freq: 5 },
      { mass: [[-0.55, 0.05, 0.14, 0.2], [-0.33, 0.07, 0.12, -0.3], [-0.08, 0.055, 0.1, 0.4], [0.16, 0.065, 0.11, -0.2], [0.44, 0.03, 0.08, 0], [0.6, 0.06, 0.12, 0.3]],
        base: 0.008, rough: 0.7, fill: [6, 6, 12], haze: 0.45, snow: 0.05, seed: 7.7, freq: 8 },
      { mass: [[-0.5, 0.022, 0.2, 0], [-0.15, 0.016, 0.16, 0], [0.18, 0.014, 0.14, 0], [0.52, 0.024, 0.2, 0]],
        base: 0.003, rough: 0.3, fill: [4, 4, 8], haze: 0.35, snow: 1, seed: 11.1, freq: 12, forest: true },
    ];
    const haze = U.hex("#161a2e");
    const ridged = (u, seed, fq) => {
      let s = 0, a = 0.55, f = fq;
      for (let o = 0; o < 6; o++) { const n = U.clamp(1 - Math.abs(U.noise2(u * f + seed * 3.1, seed * 1.7 + o * 5.3) * 1.5)); s += a * n * n * n; f *= 2.1; a *= 0.5; }
      return s;
    };
    ranges.forEach((rg, ri) => {
      const pts = [];
      for (let x = V.bx - 4; x <= V.bx + V.bw + 4; x += xs) {
        const u = (x - V.cx) / V.span;
        let env = 0;
        for (const [px, ph, pw, sk] of rg.mass) {
          const d = (u - px) / (pw * (u < px ? 1 - sk * 0.5 : 1 + sk * 0.5));
          env = Math.max(env, ph * Math.exp(-Math.pow(Math.abs(d), 1.15) * 2.4));
        }
        let hgt = rg.base + env * (1 - rg.rough + rg.rough * ridged(u, rg.seed, rg.freq));
        if (rg.forest) hgt += 0.0024 * Math.abs(Math.sin(u * 900 + rg.seed)) * (0.5 + 0.5 * U.noise2(u * 60, 3));
        pts.push([x, V.hz - hgt * H]);
      }
      const shape = (cc) => { cc.beginPath(); cc.moveTo(pts[0][0], bot); for (const p of pts) cc.lineTo(p[0], p[1]); cc.lineTo(pts[pts.length - 1][0], bot); cc.closePath(); };
      // occlude what lies behind, in every layer
      for (const cc of [c, cl, cr, md]) { cc.globalCompositeOperation = "destination-out"; shape(cc); cc.fillStyle = "#000"; cc.fill(); cc.globalCompositeOperation = "source-over"; }
      // by day: aerial blue, snowfields above the snow line, haze in the valleys, the ridge in ink
      {
        shape(md); md.fillStyle = rgb(DMTN[ri]); md.fill();
        md.save(); shape(md); md.clip();
        if (ri < 2) {
          const ys = V.hz - (rg.snow + 0.012) * H, g = md.createLinearGradient(0, ys - 0.07 * H, 0, ys + 0.012 * H);
          g.addColorStop(0, U.rgba(DSNOW, 0.9)); g.addColorStop(0.6, U.rgba(DSNOW, 0.45)); g.addColorStop(1, U.rgba(DSNOW, 0));
          md.fillStyle = g; md.fillRect(V.bx, top, V.bw, ys + 0.012 * H - top);
        }
        const hg = md.createLinearGradient(0, V.hz - 0.055 * H, 0, V.hz + 0.004 * H);
        hg.addColorStop(0, U.rgba(DHAZE, 0)); hg.addColorStop(1, U.rgba(DHAZE, 0.8 - 0.15 * ri));
        md.fillStyle = hg; md.fillRect(V.bx, V.hz - 0.055 * H, V.bw, 0.06 * H);
        md.restore();
        md.beginPath(); for (let i = 0; i < pts.length; i++) i ? md.lineTo(pts[i][0], pts[i][1]) : md.moveTo(pts[i][0], pts[i][1]);
        md.strokeStyle = U.rgba(DINK, 0.28 - 0.06 * ri); md.lineWidth = 0.8 * LWU; md.stroke();
      }
      shape(c); c.fillStyle = `rgb(${rg.fill[0]},${rg.fill[1]},${rg.fill[2]})`; c.fill();
      // valley haze at the foot
      c.save(); shape(c); c.clip();
      const hg = c.createLinearGradient(0, V.hz - 0.06 * H, 0, V.hz + 0.004 * H);
      hg.addColorStop(0, U.rgba(haze, 0)); hg.addColorStop(1, U.rgba(haze, rg.haze));
      c.fillStyle = hg; c.fillRect(V.bx, V.hz - 0.06 * H, V.bw, 0.07 * H);
      c.restore();
      // ridge line, faint in the base
      c.beginPath(); for (let i = 0; i < pts.length; i++) i ? c.lineTo(pts[i][0], pts[i][1]) : c.moveTo(pts[i][0], pts[i][1]);
      c.strokeStyle = U.rgba(U.safe(C.ink), 0.12 + 0.06 * ri); c.lineWidth = 0.8 * LWU; c.stroke();
      // lit layers: snowfields hatched down the fall line on the faces toward each light, the crest itself
      const rnd = U.rng(900 + ri);
      for (let i = 2; i < pts.length - 2; i += ri === 2 ? 3 : 1) {
        const [x, y] = pts[i], sl = (pts[i + 2][1] - pts[i - 2][1]) / (pts[i + 2][0] - pts[i - 2][0]);
        const hgt = (V.hz - y) / H;
        const snowy = U.smoothstep(rg.snow, rg.snow + 0.05, hgt);
        const steep = U.clamp(Math.abs(sl) * 1.2);
        for (const [cc, sg] of [[cl, -1], [cr, 1]]) {
          if (sl * sg <= 0.08) continue;
          const face = U.clamp(Math.abs(sl) * 0.9);
          // crest
          cc.strokeStyle = `rgba(255,255,255,${0.55 * face * (0.6 + 0.4 * (1 - ri / 2))})`; cc.lineWidth = 1.1 * LWU;
          cc.beginPath(); cc.moveTo(pts[i - 1][0], pts[i - 1][1]); cc.lineTo(pts[i + 1][0], pts[i + 1][1]); cc.stroke();
          if (ri === 2 || (i % 2 && snowy < 0.3)) continue;
          // hatching: longer and brighter in the snow, broken in the rock below
          const len = (0.006 + 0.03 * snowy * (0.6 + 0.4 * rnd())) * H * (0.5 + 0.5 * steep);
          const dx = sg * 0.42, l = Math.hypot(dx, 1);
          const a = (0.12 + 0.38 * snowy) * face * (0.7 + 0.3 * rnd()) * (1 - 0.25 * ri);
          cc.strokeStyle = `rgba(255,255,255,${a})`; cc.lineWidth = 0.75 * LWU;
          cc.beginPath(); cc.moveTo(x, y + 1); cc.lineTo(x + dx / l * len, y + 1 + len / l); cc.stroke();
        }
      }
    });
  }

  // ------------------------------------------------------------------ baking: the city
  const MAT = {
    house: [5, 5, 8], roof: [5, 6, 10], stone: [6, 7, 10], wall: [6, 7, 10], rock: [5, 5, 7], tree: [3, 5, 6], dome: [6, 9, 12],
  };
  const HAZE = [14, 15, 26];
  const LINEK = { house: 0.5, roof: 0.55, wall: 0.85, stone: 1, rock: 0.55, tree: 0.25, dome: 1 };
  const hazeAt = (Z) => { const d = Z - V.cz; return U.clamp(0.1 + 0.5 * U.smoothstep(1.6, 6.5, d) + 0.3 * U.smoothstep(6.5, 20, d)); };
  function hull2(px, py, n) {
    const idx = []; for (let i = 0; i < n; i++) idx.push(i);
    idx.sort((a, b) => (px[a] - px[b]) || (py[a] - py[b]));
    const cross = (o, a, b) => (px[a] - px[o]) * (py[b] - py[o]) - (py[a] - py[o]) * (px[b] - px[o]);
    const lo = [], up = [];
    for (const i of idx) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], i) <= 0) lo.pop(); lo.push(i); }
    for (let k = idx.length - 1; k >= 0; k--) { const i = idx[k]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], i) <= 0) up.pop(); up.push(i); }
    lo.pop(); up.pop();
    return lo.concat(up).map((i) => [px[i], py[i]]);
  }
  const inHull = (hl, x, y) => {
    let sg = 0;
    for (let i = 0; i < hl.length; i++) {
      const a = hl[i], b = hl[(i + 1) % hl.length];
      const cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (cr !== 0) { const s = cr > 0 ? 1 : -1; if (!sg) sg = s; else if (s !== sg) return false; }
    }
    return true;
  };

  function bakeCity() {
    const lay = () => layer(V.bx, V.by, V.bw, V.bh);
    const cb = lay(), cf = lay(), ll = lay(), lr = lay(), sn = lay(), wt = lay(), rm = lay();
    L.city = cb; L.cityFog = cf; L.litL = ll; L.litR = lr; L.snowL = sn; L.wetL = wt;
    // by day: the city in its own colours (and drowned in milky fog), and where the sun falls from the east,
    // the west and high in the south (white masks, tinted by the sun's colour at draw time)
    const cd = lay(), cdf = lay(), sL = lay(), sR = lay(), sC = lay(), gs = lay();
    L.cityD = cd; L.cityDF = cdf; L.sunL = sL; L.sunR = sR; L.sunC = sC; L.snowG = gs;
    const yBot = V.by + V.bh, xL = V.bx, xR = V.bx + V.bw;
    // ---- the ground: the plain greying into haze toward the horizon
    {
      const c = cb.c;
      const g = c.createLinearGradient(0, V.hz, 0, yBot);
      g.addColorStop(0, "rgb(15,16,27)"); g.addColorStop(0.05, "rgb(9,10,17)"); g.addColorStop(0.3, "rgb(5,6,10)"); g.addColorStop(1, "rgb(3,3,6)");
      c.fillStyle = g; c.fillRect(xL, V.hz - 1, V.bw, yBot - V.hz + 1);
      const rnd = U.rng(2024), ink = U.safe(C.ink);
      // fields: furrows converging on the vanishing point, broken into patches
      c.lineWidth = 0.7 * LWU;
      for (let p = 0; p < 34; p++) {
        const X = (rnd() - 0.5) * 22, Z = 6.6 + Math.pow(rnd(), 1.6) * 26, w = 0.6 + rnd() * 1.6, d = 0.5 + rnd() * 1.8;
        if (onRiver(X, Z, w / 2 + 0.3)) continue;
        const a = 0.05 * (1 - hazeAt(Z) * 0.6), n = 4 + Math.floor(rnd() * 5), along = rnd() < 0.5;
        c.strokeStyle = U.rgba(ink, a); c.beginPath();
        for (let q = 0; q <= n; q++) {
          const u = q / n - 0.5;
          if (along) { c.moveTo(PX(X + u * w, Z), PY(0, Z)); c.lineTo(PX(X + u * w, Z + d), PY(0, Z + d)); }
          else { c.moveTo(PX(X - w / 2, Z + (u + 0.5) * d), PY(0, Z + (u + 0.5) * d)); c.lineTo(PX(X + w / 2, Z + (u + 0.5) * d), PY(0, Z + (u + 0.5) * d)); }
        }
        c.stroke();
      }
      // roads: from the far gate toward the hills, from the gatehouse down toward the tower
      c.strokeStyle = U.rgba(ink, 0.08); c.lineWidth = 1.1 * LWU; c.beginPath();
      for (let z = 6.12; z < 60; z *= 1.08) { const x = Math.sin(z * 0.35) * 0.4 * U.smoothstep(6, 14, z); z === 6.12 ? c.moveTo(PX(x, z), PY(0, z)) : c.lineTo(PX(x, z), PY(0, z)); }
      c.stroke();
      // woods: clumps of tiny firs
      const fc = "rgb(4,5,8)";
      for (const [X, Z, r, n] of [[-3.2, 7.4, 0.9, 40], [-6, 12, 1.6, 50], [2.2, 7.6, 0.7, 26], [5.6, 9.5, 1.2, 40], [-1.6, 10.5, 0.8, 30], [7, 16, 2, 50], [-9, 20, 3, 60], [3.5, 18, 2.2, 40]]) {
        for (let q = 0; q < n; q++) {
          const x = X + (rnd() - 0.5) * 2 * r, z = Z + (rnd() - 0.5) * r;
          if (onRiver(x, z, 0.1)) continue;
          const sx = PX(x, z), sy = PY(0, z), th = V.f * (0.07 + 0.05 * rnd()) / z, tw = th * 0.32;
          c.beginPath(); c.moveTo(sx - tw, sy); c.lineTo(sx, sy - th); c.lineTo(sx + tw, sy); c.closePath();
          c.fillStyle = fc; c.fill();
          c.strokeStyle = U.rgba(ink, 0.07 * (1 - hazeAt(z) * 0.5)); c.lineWidth = 0.6 * LWU; c.stroke();
        }
      }
      // the river: sky-coloured, a shade lighter than the land, with faint banks
      const riv = [], RS = riverSamples();
      for (const [x, z, nx, nz] of RS) { const w = riverW(z) / 2; riv.push([PX(x + nx * w, z + nz * w), PY(0, z + nz * w)]); }
      for (let i = RS.length - 1; i >= 0; i--) { const [x, z, nx, nz] = RS[i], w = riverW(z) / 2; riv.push([PX(x - nx * w, z - nz * w), PY(0, z - nz * w)]); }
      c.beginPath(); polyPath(c, riv);
      const rg = c.createLinearGradient(0, V.hz, 0, yBot);
      rg.addColorStop(0, "rgb(20,22,36)"); rg.addColorStop(0.15, "rgb(12,13,22)"); rg.addColorStop(1, "rgb(8,9,15)");
      c.fillStyle = rg; c.fill();
      c.strokeStyle = U.rgba(ink, 0.13); c.lineWidth = 0.8 * LWU; c.stroke();
      rm.c.beginPath(); polyPath(rm.c, riv); rm.c.fillStyle = "#fff"; rm.c.fill();
      // the water's grain: faint ripple strokes along the flow, the sky's sheen on the far reaches
      c.save(); c.beginPath(); polyPath(c, riv); c.clip();
      {
        const wr = U.rng(3131), ic = U.safe(U.mix(C.ink, C.bone, 0.3));
        c.lineWidth = 0.7 * LWU; c.lineCap = "round";
        for (const [x, z, nx, nz] of RS) {
          if (z > 14) continue;
          const d = z - V.cz, k = V.f / d, w = riverW(z) / 2;
          for (let q = 0; q < 5; q++) {
            const o = (wr() - 0.5) * 2 * w, xx = x + nx * o, zz = z + nz * o, l = (0.03 + 0.05 * wr()) * k * 0.5;
            const sx = PX(xx, zz), sy = PY(0, zz);
            c.strokeStyle = U.rgba(ic, (0.05 + 0.07 * wr()) * (1 - hazeAt(z) * 0.6));
            c.beginPath(); c.moveTo(sx - l * Math.abs(nz) , sy); c.lineTo(sx + l * Math.abs(nz), sy); c.stroke();
          }
        }
      }
      c.restore();
      L.riverPoly = riv; L.RS = RS;
      // the near crag falling away under the window
      c.fillStyle = "rgb(3,3,5)"; c.beginPath(); c.moveTo(xL, yBot);
      for (let x = xL; x <= xR; x += 6) c.lineTo(x, PY(0, 2.25) + 0.012 * H * (0.5 + 0.5 * U.noise1(x * 0.02)) + Math.max(0, (V.cx - x) / V.span) * 0.03 * H);
      c.lineTo(xR, yBot); c.closePath(); c.fill();
    }
    // the fog copy starts from the same ground, drowned
    cf.c.save(); cf.c.setTransform(1, 0, 0, 1, 0, 0); cf.c.drawImage(cb.cv, 0, 0); cf.c.restore();
    bakeDayGround(cd.c);
    {
      // where snow lies on the open ground by day: the plain and the town, not the water; solids erase it below
      const c = gs.c, g = c.createLinearGradient(0, V.hz, 0, yBot);
      g.addColorStop(0, "rgba(255,255,255,0.35)"); g.addColorStop(0.15, "rgba(255,255,255,0.85)"); g.addColorStop(1, "rgba(255,255,255,1)");
      c.fillStyle = g; c.fillRect(xL, V.hz, V.bw, yBot - V.hz);
      c.globalCompositeOperation = "destination-out"; c.beginPath(); polyPath(c, L.riverPoly); c.fillStyle = "#000"; c.fill(); c.globalCompositeOperation = "source-over";
    }
    cdf.c.save(); cdf.c.setTransform(1, 0, 0, 1, 0, 0); cdf.c.drawImage(cd.cv, 0, 0); cdf.c.restore();
    const mistAt = (Z) => U.mix({ r: 13, g: 15, b: 24 }, { r: 21, g: 23, b: 36 }, U.smoothstep(2, 9, Z));
    const paintFog = (Z) => {
      const c = cf.c, y = PY(HF, Z), soft = 0.014 * H, m = mistAt(Z);
      const g = c.createLinearGradient(0, y - soft, 0, y + soft);
      g.addColorStop(0, U.rgba(m, 0)); g.addColorStop(1, U.rgba(m, 0.9));
      c.fillStyle = g; c.fillRect(xL, y - soft, V.bw, 2 * soft);
      c.fillStyle = U.rgba(m, 0.9); c.fillRect(xL, y + soft, V.bw, Math.max(0, yBot - y - soft));
      // and the day's milky fog, the same depth by depth
      const d = cdf.c, md = U.mix(DMILK, DMILK2, U.smoothstep(2, 9, Z));
      const g2 = d.createLinearGradient(0, y - soft, 0, y + soft);
      g2.addColorStop(0, U.rgba(md, 0)); g2.addColorStop(1, U.rgba(md, 0.9));
      d.fillStyle = g2; d.fillRect(xL, y - soft, V.bw, 2 * soft);
      d.fillStyle = U.rgba(md, 0.9); d.fillRect(xL, y + soft, V.bw, Math.max(0, yBot - y - soft));
    };
    paintFog(60);
    // ---- the solids
    const cam = [0, V.Hc, V.cz];
    const n3 = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
    const LdL = n3(-0.62, 0.6, 0.5), LdR = n3(0.62, 0.6, 0.5);
    const l2L = [-0.62, -0.78], l2R = [0.62, -0.78];
    const ink = U.safe(C.ink);
    const lights = [];
    let fogZ = 60, mistBand = 0;
    const bands = [7.5, 5.6, 4.4, 3.4, 2.6];
    const S = CITY.S;
    let rbb = [1e9, 1e9, -1e9, -1e9];
    for (const p of L.riverPoly) { rbb[0] = Math.min(rbb[0], p[0]); rbb[1] = Math.min(rbb[1], p[1]); rbb[2] = Math.max(rbb[2], p[0]); rbb[3] = Math.max(rbb[3], p[1]); }
    const px = new Float64Array(512), py = new Float64Array(512);
    const erase = (c, hl) => { c.globalCompositeOperation = "destination-out"; c.beginPath(); polyPath(c, hl); c.fillStyle = "#000"; c.fill(); c.globalCompositeOperation = "source-over"; };
    for (let si = 0; si < S.length; si++) {
      const s = S[si], n = s.v.length;
      let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
      for (let i = 0; i < n; i++) {
        const p = s.v[i];
        px[i] = PX(p[0], p[2]); py[i] = PY(p[1], p[2]);
        minx = Math.min(minx, px[i]); maxx = Math.max(maxx, px[i]); miny = Math.min(miny, py[i]); maxy = Math.max(maxy, py[i]);
      }
      s.hull = null;
      if (maxx < xL || minx > xR || maxy < V.by || miny > yBot) continue;
      // the fog swallows everything beyond this depth up to its height; faint luminous bands separate depths
      if (s.key < fogZ - 0.12) { paintFog(fogZ); fogZ = s.key; }
      while (mistBand < bands.length && s.key < bands[mistBand]) {
        const y = PY(0, bands[mistBand]), c = cb.c, hh = 0.03 * H;
        const g = c.createLinearGradient(0, y - hh, 0, y + 0.004 * H);
        g.addColorStop(0, "rgba(18,20,34,0)"); g.addColorStop(1, `rgba(18,20,34,${0.5 - mistBand * 0.06})`);
        c.fillStyle = g; c.fillRect(xL, y - hh, V.bw, hh + 0.004 * H);
        mistBand++;
      }
      const hl = hull2(px, py, n);
      s.hull = hl; s.bb = [minx, miny, maxx, maxy];
      const hz = hazeAt(s.key), near = 1 - hz;
      // depth staging: the rooftops right under the window fall into shadow; landmarks keep their crisp rims
      const stage = 0.28 + 0.72 * U.smoothstep(1.2, 2.6, s.key - V.cz);
      const rimK = (s.mat === "house" || s.mat === "roof" ? 0.55 : 1.15) * stage;
      for (const c of [ll.c, lr.c, sn.c, wt.c, sL.c, sR.c, sC.c, gs.c]) erase(c, hl);
      const dm = dayMat(s, si);
      if (maxx > rbb[0] && minx < rbb[2] && maxy > rbb[1] && miny < rbb[3]) erase(rm.c, hl);
      const m = MAT[s.mat] || MAT.stone;
      const lines = new Path2D();
      let any = false;
      for (const fc of s.f) {
        const nn = fc.n, cc = fc.c;
        if (nn[0] * (cc[0] - cam[0]) + nn[1] * (cc[1] - cam[1]) + nn[2] * (cc[2] - cam[2]) >= 0) continue;
        const path = new Path2D();
        const ix = fc.ix;
        path.moveTo(px[ix[0]], py[ix[0]]);
        for (let i = 1; i < ix.length; i++) path.lineTo(px[ix[i]], py[ix[i]]);
        path.closePath();
        const up = Math.max(0, nn[1]), sd = Math.abs(nn[0]);
        const k = 1 + 0.45 * up + 0.25 * sd;
        const r = U.lerp(m[0] * k, HAZE[0], hz), g = U.lerp(m[1] * k, HAZE[1], hz), b = U.lerp(m[2] * k, HAZE[2], hz);
        const col = `rgb(${r | 0},${g | 0},${b | 0})`;
        cb.c.fillStyle = col; cb.c.fill(path);
        cf.c.fillStyle = col; cf.c.fill(path);
        // by day: the material lit by the open sky, hazing with distance; the sun's three masks
        {
          const kd = 0.56 + 0.32 * up + 0.12 * sd, hzD = hz * 0.9;
          const dc = `rgb(${U.lerp(dm[0] * kd, DHAZE.r, hzD) | 0},${U.lerp(dm[1] * kd, DHAZE.g, hzD) | 0},${U.lerp(dm[2] * kd, DHAZE.b, hzD) | 0})`;
          cd.c.fillStyle = dc; cd.c.fill(path); cdf.c.fillStyle = dc; cdf.c.fill(path);
          const fs = 0.62 * (0.45 + 0.55 * near) * (0.55 + 0.45 * stage);
          for (const [cc, Ld] of [[sL.c, SUN_L], [sR.c, SUN_R], [sC.c, SUN_C]]) {
            const dd = nn[0] * Ld[0] + nn[1] * Ld[1] + nn[2] * Ld[2];
            if (dd > 0.02) { cc.fillStyle = `rgba(255,255,255,${(fs * dd).toFixed(3)})`; cc.fill(path); }
          }
        }
        // moonlight from either side: faces turned to it glow faintly
        const dl = nn[0] * LdL[0] + nn[1] * LdL[1] + nn[2] * LdL[2], dr = nn[0] * LdR[0] + nn[1] * LdR[1] + nn[2] * LdR[2];
        const fa = 0.17 * (0.45 + 0.55 * near) * (0.4 + 0.6 * stage);
        if (dl > 0.02) { ll.c.fillStyle = `rgba(255,255,255,${fa * dl})`; ll.c.fill(path); }
        if (dr > 0.02) { lr.c.fillStyle = `rgba(255,255,255,${fa * dr})`; lr.c.fill(path); }
        if (up > 0.3 && s.mat !== "tree") { sn.c.fillStyle = `rgba(255,255,255,${0.42 * up})`; sn.c.fill(path); wt.c.fillStyle = `rgba(255,255,255,${0.07 * up})`; wt.c.fill(path); }
        if (s.mat === "tree" && up > 0.2) { sn.c.fillStyle = `rgba(255,255,255,${0.25 * up})`; sn.c.fill(path); }
        // engraved edges
        if (fc.line) {
          const ed = fc.edges;
          for (let e = 0; e < ix.length; e++) {
            if (ed && ed.indexOf(e) < 0) continue;
            const a = ix[e], b2 = ix[(e + 1) % ix.length];
            lines.moveTo(px[a], py[a]); lines.lineTo(px[b2], py[b2]); any = true;
          }
        }
      }
      if (any) {
        const lk = LINEK[s.mat] || 1;
        cb.c.strokeStyle = U.rgba(ink, 0.16 * lk * stage * (0.25 + 0.75 * near)); cb.c.lineWidth = 0.75 * LWU; cb.c.stroke(lines);
        cf.c.strokeStyle = U.rgba(ink, 0.1 * lk * stage * (0.25 + 0.75 * near)); cf.c.lineWidth = 0.75 * LWU; cf.c.stroke(lines);
        const da = 0.34 * lk * stage * (0.2 + 0.8 * near);
        for (const cc of [cd.c, cdf.c]) { cc.strokeStyle = U.rgba(DINK, da); cc.lineWidth = 0.75 * LWU; cc.stroke(lines); }
      }
      // the bridge arches: dark openings under the deck between the piers, the arch rings engraved
      if (s.arches) {
        const A = s.arches, c = cb.c, sp = A.len / A.n;
        for (let q = 0; q < A.n; q++) {
          const xa = A.x0 + q * sp + 0.011, xb = A.x0 + (q + 1) * sp - 0.011, xm = (xa + xb) / 2, r = (xb - xa) / 2;
          const ar = new Path2D();
          ar.moveTo(PX(xa, A.Zf), PY(0, A.Zf));
          for (let k = 0; k <= 12; k++) { const t = Math.PI - k / 12 * Math.PI; ar.lineTo(PX(xm + Math.cos(t) * r, A.Zf), PY(Math.min(A.y, Math.sin(t) * r * 0.9), A.Zf)); }
          for (const cc of [c, cf.c]) { cc.strokeStyle = U.rgba(ink, 0.22 * (0.4 + 0.6 * near)); cc.lineWidth = 0.8 * LWU; cc.stroke(ar); }
          for (const cc of [ll.c, lr.c]) { cc.strokeStyle = "rgba(255,255,255,0.18)"; cc.lineWidth = 0.8 * LWU; cc.stroke(ar); }
          cd.c.fillStyle = U.rgba(DINK, 0.55 * (0.4 + 0.6 * near)); cd.c.fill(ar);
        }
      }
      // rims: the solid's outline where it turns toward the light
      let gx = 0, gy = 0; for (const p of hl) { gx += p[0]; gy += p[1]; } gx /= hl.length; gy /= hl.length;
      const lwR = (0.8 + 0.5 * near) * LWU;
      for (let i = 0; i < hl.length; i++) {
        const a = hl[i], b2 = hl[(i + 1) % hl.length];
        let ex = b2[1] - a[1], ey = -(b2[0] - a[0]);
        const el = Math.hypot(ex, ey) || 1; ex /= el; ey /= el;
        if (ex * ((a[0] + b2[0]) / 2 - gx) + ey * ((a[1] + b2[1]) / 2 - gy) < 0) { ex = -ex; ey = -ey; }
        for (const [cc, l2] of [[ll.c, l2L], [lr.c, l2R]]) {
          const w = ex * l2[0] + ey * l2[1];
          if (w < 0.12) continue;
          cc.strokeStyle = `rgba(255,255,255,${Math.min(0.9, 0.62 * rimK * Math.pow(w, 1.3) * (0.4 + 0.6 * near)).toFixed(3)})`; cc.lineWidth = lwR;
          cc.beginPath(); cc.moveTo(a[0], a[1]); cc.lineTo(b2[0], b2[1]); cc.stroke();
        }
        for (const [cc, l2] of [[sL.c, [-0.8, -0.6]], [sR.c, [0.8, -0.6]], [sC.c, [0, -1]]]) {
          const w = ex * l2[0] + ey * l2[1];
          if (w < 0.15) continue;
          cc.strokeStyle = `rgba(255,255,255,${Math.min(0.85, 0.55 * rimK * Math.pow(w, 1.3) * (0.4 + 0.6 * near)).toFixed(3)})`; cc.lineWidth = lwR;
          cc.beginPath(); cc.moveTo(a[0], a[1]); cc.lineTo(b2[0], b2[1]); cc.stroke();
        }
        if (ey < -0.45) {
          sn.c.strokeStyle = `rgba(255,255,255,${0.6 * -ey})`; sn.c.lineWidth = 1.3 * LWU; sn.c.beginPath(); sn.c.moveTo(a[0], a[1] + 0.6); sn.c.lineTo(b2[0], b2[1] + 0.6); sn.c.stroke();
          wt.c.strokeStyle = `rgba(255,255,255,${0.45 * -ey * (0.4 + 0.6 * near)})`; wt.c.lineWidth = 0.9 * LWU; wt.c.beginPath(); wt.c.moveTo(a[0], a[1]); wt.c.lineTo(b2[0], b2[1]); wt.c.stroke();
        }
      }
      // its lights, where the face they sit on is seen
      for (const lt of s.lights) {
        const p = lt.p, nn = lt.n;
        if (nn[0] * (p[0] - cam[0]) + nn[1] * (p[1] - cam[1]) + nn[2] * (p[2] - cam[2]) >= 0) continue;
        const x = PX(p[0], p[2]), y = PY(p[1], p[2]);
        if (!inOpening(x, y, -2)) continue;
        const rv = p[2] < 12 && onRiver(p[0], p[2], 0.38);
        const cap = (lt.k === 6 ? 14 : lt.k === 5 ? 4.2 : lt.k === 4 ? 2.6 : 3.3) * LWU;
        lights.push({ x, y, s: U.clamp(V.f * lt.s / (p[2] - V.cz), 0.9, cap), k: lt.k, si, hg: p[1], Z: p[2], rx: rv ? x : NaN, ry: rv ? PY(-p[1], p[2]) : NaN });
      }
    }
    paintFog(Math.min(fogZ, 1.3));
    // lights hidden behind nearer solids are dropped
    const vis = lights.filter((lt) => {
      for (let j = lt.si + 1; j < S.length; j++) {
        const o = S[j];
        if (!o.hull) continue;
        const bb = o.bb;
        if (lt.x < bb[0] || lt.x > bb[2] || lt.y < bb[1] || lt.y > bb[3]) continue;
        if (inHull(o.hull, lt.x, lt.y)) return false;
      }
      return true;
    });
    // the river's visible surface as a coarse grid (for reflections and glitter)
    {
      const cell = 3, gw = Math.ceil(V.bw / cell), gh = Math.ceil(V.bh / cell);
      const id = rm.c.getImageData(0, 0, rm.cv.width, rm.cv.height).data, cw = rm.cv.width;
      const grid = new Uint8Array(gw * gh), pts = [];
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const sx = Math.min(rm.cv.width - 1, Math.floor((i + 0.5) * cell * dpr)), sy = Math.min(rm.cv.height - 1, Math.floor((j + 0.5) * cell * dpr));
        if (id[(sy * cw + sx) * 4 + 3] > 128) { grid[j * gw + i] = 1; if ((i + j * 7) % 5 === 0) pts.push(V.bx + (i + 0.5) * cell, V.by + (j + 0.5) * cell); }
      }
      L.rgrid = { cell, gw, gh, grid };
      L.rpts = new Float32Array(pts);
    }
    // packed by kind for batched drawing; the on/off times are the evening's schedule
    const rnd = U.rng(8080);
    vis.sort((a, b) => a.k - b.k);
    const N = vis.length;
    const LT = L.lt = {
      n: N, x: new Float32Array(N), y: new Float32Array(N), s: new Float32Array(N), k: new Uint8Array(N),
      on: new Float32Array(N), off: new Float32Array(N), ph: new Float32Array(N), sub: new Uint8Array(N),
      rx: new Float32Array(N), ry: new Float32Array(N), start: new Int32Array(8).fill(-1), end: new Int32Array(8).fill(-1),
    };
    for (let i = 0; i < N; i++) {
      const lt = vis[i];
      LT.x[i] = lt.x; LT.y[i] = lt.y; LT.s[i] = lt.s; LT.k[i] = lt.k; LT.ph[i] = rnd() * 100;
      LT.sub[i] = lt.hg < HF ? 1 : 0; LT.rx[i] = lt.rx; LT.ry[i] = lt.ry;
      const r = rnd();
      if (lt.k <= 1) { LT.on[i] = 240 + 8400 * Math.pow(r, 1.7); LT.off[i] = rnd() < 0.5 ? 4.6 * 3600 + rnd() * 4.4 * 3600 : 1e9; }
      else if (lt.k <= 3) { LT.on[i] = 1500 + 9000 * r; LT.off[i] = 1e9; }
      else if (lt.k === 4) { LT.on[i] = 30 + 1100 * r; LT.off[i] = 1e9; }
      else if (lt.k === 5) { LT.on[i] = 2200 + 6000 * r; LT.off[i] = 1e9; }
      else { LT.on[i] = 1300; LT.off[i] = 1e9; }
      if (LT.start[lt.k] < 0) LT.start[lt.k] = i;
      LT.end[lt.k] = i + 1;
    }
    // wards (hosts) and lantern sources in screen space
    CITY.wardPts = CITY.wards.map((w) => ({ x: PX(w.p[0], w.p[2]), y: PY(w.p[1], w.p[2]), s: V.f * 0.05 / (w.p[2] - V.cz) }));
  }

  // ------------------------------------------------------------------ the ward-dome (an oblate shell over the city)
  const DM = { X: 0.0, Z: 4.45, R: 1.6, Hh: 1.35 };
  let dX = 0, dY = 0, dF = false;
  function domeP(phi, th) {
    const cp = Math.cos(phi), X = DM.X + DM.R * cp * Math.sin(th), Y = DM.Hh * Math.sin(phi), Z = DM.Z - DM.R * cp * Math.cos(th);
    dX = PX(X, Z); dY = PY(Y, Z);
    const nx = (X - DM.X) / (DM.R * DM.R), ny = Y / (DM.Hh * DM.Hh), nz = (Z - DM.Z) / (DM.R * DM.R);
    dF = nx * X + ny * (Y - V.Hc) + nz * (Z - V.cz) < 0;
  }
  function bakeDome() {
    const px = [], py = [];
    for (let p = 0; p <= 90; p += 4) for (let t = 0; t < 360; t += 4) { domeP(p * RAD, t * RAD); px.push(dX); py.push(dY); }
    const hl = hull2(px, py, px.length);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of hl) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    x0 = Math.max(V.bx, x0 - 8); x1 = Math.min(V.bx + V.bw, x1 + 8); y0 = Math.max(V.by, y0 - 8); y1 = Math.min(V.by + V.bh, y1 + 8);
    const o = L.dome = layer(x0, y0, x1 - x0, y1 - y0), c = o.c;
    const dc = U.safe(DOMEC);
    L.domeHull = hl;
    domeP(Math.PI / 2, 0); const ax = dX, ay = dY;
    // the shell: barely there in the middle, thicker toward the limb
    c.save(); c.beginPath(); polyPath(c, hl); c.clip();
    c.fillStyle = U.rgba(dc, 0.022); c.fill();
    c.beginPath(); polyPath(c, hl);
    for (const [w, a] of [[0.06 * H, 0.012], [0.026 * H, 0.02], [0.009 * H, 0.03]]) { c.lineWidth = w; c.strokeStyle = U.rgba(dc, a); c.stroke(); }
    c.restore();
    c.beginPath(); polyPath(c, hl); c.lineWidth = 1.1 * LWU; c.strokeStyle = U.rgba(dc, 0.08); c.stroke();
    // parallels and meridians: front arcs clearer than the back ones
    const seg = (fn) => {
      let prevF = null;
      const front = new Path2D(), back = new Path2D();
      for (let k = 0; k <= 96; k++) {
        fn(k / 96);
        const P = dF ? front : back;
        if (prevF !== dF) { P.moveTo(dX, dY); prevF = dF; } else P.lineTo(dX, dY);
      }
      c.lineWidth = 0.8 * LWU;
      c.strokeStyle = U.rgba(dc, 0.05); c.stroke(front);
      c.strokeStyle = U.rgba(dc, 0.02); c.stroke(back);
    };
    for (const p of [14, 30, 46, 62, 76]) seg((u) => domeP(p * RAD, u * TAU));
    for (let m = 0; m < 12; m++) seg((u) => domeP(u * Math.PI / 2, m / 12 * TAU));
    // the crown: a small rune circle at the top
    c.strokeStyle = U.rgba(dc, 0.07); c.lineWidth = 0.9 * LWU; c.beginPath(); c.ellipse(ax, ay, 0.012 * H, 0.004 * H, 0, 0, TAU); c.stroke();
    // the shell thins out where it comes down in front of the city, so it reads as a vault over it, not a bowl
    c.globalCompositeOperation = "destination-in";
    const yg = PY(0, DM.Z);
    const g = c.createLinearGradient(0, V.hz - 0.04 * H, 0, yg + 0.06 * H);
    g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.55, "rgba(0,0,0,0.45)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    c.globalCompositeOperation = "source-over";
    L.domeY = [V.hz - 0.04 * H, yg + 0.06 * H];
  }

  // ------------------------------------------------------------------ baking: the stone window
  function bakeFrame() {
    const fx = Math.floor(V.x0 - V.D - 0.08 * H), fw = Math.ceil(V.span + 2 * V.D + 0.16 * H);
    const o = L.frame = layer(fx, 0, fw, H), c = o.c;
    const D = V.D, ink = U.safe(C.ink), stone = U.safe(U.hex("#6a7090"));
    c.lineCap = "round"; c.lineJoin = "round";
    // the reveal (splayed jambs and soffit) and the sill's top face
    c.save(); c.beginPath(); archPath(c, D, V.sillIn); archPath(c, 0, V.sill); c.clip("evenodd");
    const rg = c.createRadialGradient(V.cx, V.sill * 0.7, V.span * 0.3, V.cx, V.sill * 0.7, V.span * 0.75);
    rg.addColorStop(0, U.rgba(stone, 0.1)); rg.addColorStop(1, U.rgba(stone, 0.05));
    c.fillStyle = rg; c.fillRect(fx, 0, fw, V.sillIn + 2);
    // the sill top catches the sky
    c.beginPath(); c.moveTo(V.x0, V.sill); c.lineTo(V.x1, V.sill); c.lineTo(V.x1 + D, V.sillIn); c.lineTo(V.x0 - D, V.sillIn); c.closePath();
    const sg = c.createLinearGradient(0, V.sill, 0, V.sillIn);
    sg.addColorStop(0, U.rgba(stone, 0.12)); sg.addColorStop(1, U.rgba(stone, 0.07));
    c.fillStyle = sg; c.fill();
    // voussoirs: radial joints round the arch, ashlar courses down the jambs
    c.strokeStyle = U.rgba(ink, 0.11); c.lineWidth = 0.8 * LWU; c.beginPath();
    const rnd = U.rng(5005);
    for (const [cxA, a0, a1, sgn] of [[V.cl, Math.PI, Math.PI * 1.5, 1], [V.cr, -Math.PI / 2, 0, -1]]) {
      const ax = V.cx - V.cl, aEnd = sgn > 0 ? Math.atan2(-Math.sqrt(V.R * V.R - ax * ax), ax) + TAU : Math.atan2(-Math.sqrt(V.R * V.R - ax * ax), -ax);
      const from = sgn > 0 ? a0 : aEnd, to = sgn > 0 ? aEnd : a1;
      const n = Math.round((to - from) * V.R / (0.045 * H));
      for (let k = 1; k < n; k++) {
        const a = from + (to - from) * k / n;
        c.moveTo(cxA + Math.cos(a) * V.R, V.ys + Math.sin(a) * V.R); c.lineTo(cxA + Math.cos(a) * (V.R + D), V.ys + Math.sin(a) * (V.R + D));
      }
    }
    for (let y = V.ys + 0.04 * H, k = 0; y < V.sill - 0.01 * H; y += 0.048 * H, k++) {
      c.moveTo(V.x0 - D, y); c.lineTo(V.x0, y); c.moveTo(V.x1, y); c.lineTo(V.x1 + D, y);
      const jx = 0.5 * D * (k % 2 ? 0.4 : 0.7);
      c.moveTo(V.x0 - jx, y); c.lineTo(V.x0 - jx, y + 0.048 * H); c.moveTo(V.x1 + jx, y); c.lineTo(V.x1 + jx, y + 0.048 * H);
    }
    // joints across the sill top, in perspective
    for (let k = 1; k < 6; k++) { const u = k / 6; c.moveTo(U.lerp(V.x0, V.x1, u), V.sill); c.lineTo(U.lerp(V.x0 - D, V.x1 + D, u), V.sillIn); }
    c.stroke();
    // wear: a fine stipple
    for (let i = 0; i < 2400; i++) {
      const x = fx + rnd() * fw, y = V.apex - D + rnd() * (V.sillIn - V.apex + D);
      c.fillStyle = rnd() < 0.5 ? "rgba(0,0,0,0.5)" : U.rgba(stone, 0.1 + 0.1 * rnd());
      c.fillRect(x, y, LWU, LWU);
    }
    c.restore();
    // edges: the room-side arris, archivolt mouldings fading toward the springing, the sill front
    c.beginPath(); archLine(c, D, V.sillIn); c.strokeStyle = U.rgba(ink, 0.32); c.lineWidth = 1 * LWU; c.stroke();
    for (const [off, a] of [[D + 0.008 * H, 0.2], [D + 0.016 * H, 0.12], [D + 0.03 * H, 0.07]]) {
      c.save(); const g = c.createLinearGradient(0, V.apex, 0, V.sill);
      g.addColorStop(0, U.rgba(ink, a)); g.addColorStop(0.7, U.rgba(ink, a * 0.6)); g.addColorStop(1, U.rgba(ink, 0));
      c.beginPath(); archLine(c, off, V.sill); c.strokeStyle = g; c.lineWidth = 0.9 * LWU; c.stroke(); c.restore();
    }
    // the room's voussoirs beyond, very faint
    c.beginPath();
    for (const [cxA, sgn] of [[V.cl, 1], [V.cr, -1]]) {
      for (let k = 0; k < 18; k++) {
        const a = sgn > 0 ? Math.PI + k / 18 * 0.62 * Math.PI / 1.2 : -k / 18 * 0.62 * Math.PI / 1.2;
        const r0 = V.R + D + 0.016 * H, r1 = V.R + D + 0.03 * H;
        const x = cxA + Math.cos(a) * r0;
        if ((sgn > 0 && x > V.cx) || (sgn < 0 && x < V.cx)) continue;
        c.moveTo(x, V.ys + Math.sin(a) * r0); c.lineTo(cxA + Math.cos(a) * r1, V.ys + Math.sin(a) * r1);
      }
    }
    c.strokeStyle = U.rgba(ink, 0.08); c.lineWidth = 0.8 * LWU; c.stroke();
    // keystone
    {
      const ky = V.apex - D * 0.98, kw = 0.016 * H;
      c.beginPath(); c.moveTo(V.cx - kw, ky - 0.02 * H); c.lineTo(V.cx + kw, ky - 0.02 * H); c.lineTo(V.cx + kw * 0.6, V.apex - 1); c.lineTo(V.cx - kw * 0.6, V.apex - 1); c.closePath();
      c.fillStyle = U.rgba(stone, 0.07); c.fill(); c.strokeStyle = U.rgba(ink, 0.3); c.lineWidth = 0.9 * LWU; c.stroke();
    }
    // the sill: top face edges, a rounded front moulding
    c.beginPath(); c.moveTo(V.x0 - D, V.sillIn); c.lineTo(V.x1 + D, V.sillIn); c.strokeStyle = U.rgba(ink, 0.35); c.lineWidth = 1 * LWU; c.stroke();
    {
      const g = c.createLinearGradient(0, V.sillIn, 0, V.sillFront);
      g.addColorStop(0, U.rgba(stone, 0.09)); g.addColorStop(1, U.rgba(stone, 0.02));
      c.fillStyle = g; c.fillRect(V.x0 - D - 0.008 * H, V.sillIn, V.span + 2 * D + 0.016 * H, V.sillFront - V.sillIn);
      c.beginPath();
      c.moveTo(V.x0 - D - 0.008 * H, V.sillIn + 0.006 * H); c.lineTo(V.x1 + D + 0.008 * H, V.sillIn + 0.006 * H);
      c.moveTo(V.x0 - D - 0.008 * H, V.sillFront); c.lineTo(V.x1 + D + 0.008 * H, V.sillFront);
      c.strokeStyle = U.rgba(ink, 0.2); c.lineWidth = 0.8 * LWU; c.stroke();
    }
    // the parapet below: courses fading out into the dark
    c.save();
    const pg = c.createLinearGradient(0, V.sillFront, 0, H);
    pg.addColorStop(0, U.rgba(ink, 0.1)); pg.addColorStop(1, U.rgba(ink, 0));
    c.strokeStyle = pg; c.lineWidth = 0.8 * LWU; c.beginPath();
    for (let y = V.sillFront + 0.045 * H, k = 0; y < H; y += 0.045 * H, k++) {
      c.moveTo(V.x0 - D, y); c.lineTo(V.x1 + D, y);
      for (let x = V.x0 - D + (k % 2 ? 0.05 : 0.11) * V.span; x < V.x1 + D; x += 0.13 * V.span) {
        if (Math.abs(x - V.cx) < 0.21 * H && y > V.plateY - 0.075 * H && y < V.plateY + 0.08 * H) continue;
        c.moveTo(x, y - 0.045 * H); c.lineTo(x, y);
      }
    }
    c.stroke(); c.restore();
    // the brass plate: a cartouche with pointed ends, double rule, four rivets, a rune at each end
    {
      const py = V.plateY, hw = 0.2 * H, hh = 0.062 * H, pt = 0.035 * H;
      const br = U.safe(C.brass);
      const cart = (k) => { const w = hw * k, h2 = hh * k, p2 = pt * k; c.beginPath(); c.moveTo(V.cx - w - p2, py); c.lineTo(V.cx - w, py - h2); c.lineTo(V.cx + w, py - h2); c.lineTo(V.cx + w + p2, py); c.lineTo(V.cx + w, py + h2); c.lineTo(V.cx - w, py + h2); c.closePath(); };
      cart(1);
      const g = c.createLinearGradient(0, py - hh, 0, py + hh);
      g.addColorStop(0, U.rgba(br, 0.07)); g.addColorStop(0.5, U.rgba(br, 0.035)); g.addColorStop(1, U.rgba(br, 0.06));
      c.fillStyle = g; c.fill();
      c.strokeStyle = U.rgba(br, 0.5); c.lineWidth = 1.1 * LWU; c.stroke();
      cart(0.9); c.strokeStyle = U.rgba(br, 0.24); c.lineWidth = 0.8 * LWU; c.stroke();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.beginPath(); c.arc(V.cx + sx * hw * 0.95, py + sy * hh * 0.72, 0.0028 * H, 0, TAU); c.fillStyle = U.rgba(br, 0.45); c.fill(); }
      c.beginPath(); runePath(c, RUNES[3], V.cx - hw - pt * 0.35, py, 0.024 * H); runePath(c, RUNES[1], V.cx + hw + pt * 0.35, py, 0.024 * H);
      c.strokeStyle = U.rgba(br, 0.38); c.lineWidth = 0.9 * LWU; c.stroke();
    }
  }

  // the work face's hairline arch (thin) and the heavier line it thickens into on the way to stone
  function bakeHair() {
    const fx = Math.floor(V.x0 - V.D - 0.06 * H), fw = Math.ceil(V.span + 2 * V.D + 0.12 * H);
    const mkH = (lw, a) => {
      const o = layer(fx, 0, fw, H), c = o.c, col = U.safe(C.steelMid);
      c.lineCap = "round"; c.lineJoin = "round";
      c.strokeStyle = U.rgba(col, a); c.lineWidth = lw;
      c.beginPath(); archLine(c, 0, V.sill); c.stroke();
      c.strokeStyle = U.rgba(col, a * 0.45); c.lineWidth = lw * 0.8;
      c.beginPath(); archLine(c, V.D, V.sillIn); c.stroke();
      c.beginPath(); c.moveTo(V.x0, V.sill); c.lineTo(V.x1, V.sill); c.moveTo(V.x0 - V.D, V.sillIn); c.lineTo(V.x1 + V.D, V.sillIn); c.stroke();
      // rune ticks round the arch: a graduated band, a tiny lozenge at the apex
      const off = V.D + 0.012 * H, r = V.R + off, ax = V.cx - V.cl;
      c.strokeStyle = U.rgba(col, a * 0.5); c.lineWidth = lw * 0.7; c.beginPath();
      for (const [cA, sgn] of [[V.cl, 1], [V.cr, -1]]) {
        const aTop = sgn > 0 ? Math.atan2(-Math.sqrt(r * r - ax * ax), ax) + TAU : Math.atan2(-Math.sqrt(r * r - ax * ax), -ax);
        const from = sgn > 0 ? Math.PI : aTop, to = sgn > 0 ? aTop : 0;
        const n = Math.round(Math.abs(to - from) * r / (0.012 * H));
        for (let k = 1; k < n; k++) {
          const a = from + (to - from) * k / n, long = k % 8 === 0, l = (long ? 0.012 : 0.005) * H;
          c.moveTo(cA + Math.cos(a) * r, V.ys + Math.sin(a) * r); c.lineTo(cA + Math.cos(a) * (r + l), V.ys + Math.sin(a) * (r + l));
        }
      }
      c.stroke();
      const ky = V.apex - off - 0.012 * H, k = 0.007 * H;
      c.beginPath(); c.moveTo(V.cx, ky - k); c.lineTo(V.cx + k * 0.7, ky); c.lineTo(V.cx, ky + k); c.lineTo(V.cx - k * 0.7, ky); c.closePath();
      c.strokeStyle = U.rgba(col, a * 0.8); c.lineWidth = lw * 0.8; c.stroke();
      return o;
    };
    L.hair = mkH(1.1 * LWU, 0.6);
    L.hairB = mkH(2.6 * LWU, 0.42);
  }

  // ------------------------------------------------------------------ clouds + weather pools
  function buildWeather() {
    // cloud banks: long soft occluders (they hide stars and cross the moon) with a silver lining on their crowns
    L.clouds = [];
    const rnd = U.rng(2719);
    for (let i = 0; i < 10; i++) {
      const w = (0.45 + 0.4 * rnd()) * V.span, h = (0.06 + 0.05 * rnd()) * H;
      const occ = mk(w, h), rim = mk(w, h);
      const lobes = [], n = 9 + Math.floor(rnd() * 6);
      for (let k = 0; k < n; k++) {
        const t2 = (k + 0.5) / n, env = Math.sin(Math.PI * t2);
        const ry = h * (0.14 + 0.2 * env * (0.6 + 0.6 * rnd())), rx = ry * (2.2 + 1.6 * rnd());
        lobes.push([w * (0.08 + 0.84 * t2) + (rnd() - 0.5) * w * 0.05, h * 0.62 - ry * (0.3 + 0.5 * rnd()) * env, rx, ry]);
      }
      const ell = (c, x, y, rx, ry, fill) => { c.save(); c.translate(x, y); c.scale(rx, ry); c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fillStyle = fill; c.fill(); };
      for (const [x, y, rx, ry] of lobes) {
        occ.c.save(); occ.c.translate(x, y); occ.c.scale(rx * 1.25, ry * 1.4);
        const g = occ.c.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, "rgba(0,0,0,0.9)"); g.addColorStop(0.6, "rgba(0,0,0,0.75)"); g.addColorStop(1, "rgba(0,0,0,0)");
        occ.c.fillStyle = g; occ.c.beginPath(); occ.c.arc(0, 0, 1, 0, TAU); occ.c.fill(); occ.c.restore();
      }
      // the lining: each crown lit, then cut away from below so only a thin bright edge stays, softened twice
      const c = rim.c;
      for (const [x, y, rx, ry] of lobes) ell(c, x, y, rx, ry, "rgba(255,255,255,0.26)");
      c.globalCompositeOperation = "destination-out";
      for (const [x, y, rx, ry] of lobes) ell(c, x, y + ry * 0.22, rx * 0.98, ry, "rgba(0,0,0,0.9)");
      for (const [x, y, rx, ry] of lobes) ell(c, x, y + ry * 0.42, rx * 0.96, ry, "rgba(0,0,0,1)");
      c.globalCompositeOperation = "source-over";
      // a faint body glow inside, so a moonlit bank reads as a mass and not an outline
      for (const [x, y, rx, ry] of lobes) {
        c.save(); c.translate(x, y - ry * 0.2); c.scale(rx, ry);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, "rgba(255,255,255,0.05)"); g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill(); c.restore();
      }
      c.globalCompositeOperation = "source-in"; c.fillStyle = U.rgba(U.safe(U.mix(C.slate, C.bone, 0.4)), 1); c.fillRect(0, 0, w, h); c.globalCompositeOperation = "source-over";
      // by day: a soft body lit from above (fair weather) or a grey one (rain); draws no rng
      const dayBody = (lit, under, rimA) => {
        const o = mk(w, h), q = o.c;
        for (const [x, y, rx, ry] of lobes) {
          q.save(); q.translate(x, y); q.scale(rx * 1.12, ry * 1.25);
          const g = q.createRadialGradient(0, 0, 0, 0, 0, 1);
          g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.7, "rgba(255,255,255,0.85)"); g.addColorStop(1, "rgba(255,255,255,0)");
          q.fillStyle = g; q.beginPath(); q.arc(0, 0, 1, 0, TAU); q.fill(); q.restore();
        }
        q.globalCompositeOperation = "source-in";
        const sh = q.createLinearGradient(0, 0, 0, h);
        sh.addColorStop(0, rgb(lit)); sh.addColorStop(0.5, rgb(U.mix(lit, under, 0.4))); sh.addColorStop(1, rgb(under));
        q.fillStyle = sh; q.fillRect(0, 0, w, h);
        q.globalCompositeOperation = "source-atop"; q.globalAlpha = rimA; q.drawImage(rim.cv, 0, 0, w, h); q.globalAlpha = 1;
        q.globalCompositeOperation = "source-over";
        return o;
      };
      const day = dayBody(U.hex("#a2aaba"), U.hex("#5e6678"), 0.6), dayG = dayBody(U.hex("#4a4c52"), U.hex("#2c2e34"), 0.15);
      L.clouds.push({ occ, rim, day, dayG, w, h, y: V.apex + (0.02 + 0.7 * rnd()) * (V.hz - V.apex - h * 0.5), x0: rnd(), sp: 0.6 + 0.8 * rnd() });
    }
    const r = U.rng(4322);
    const yR = (y) => U.lerp(V.hz - 0.05 * H, V.sill, y);
    L.rain = { n: 420, x: new Float32Array(420), y: new Float32Array(420), v: new Float32Array(420), land: new Float32Array(420), near: new Uint8Array(420) };
    for (let i = 0; i < 420; i++) { L.rain.x[i] = V.x0 + r() * V.span * 1.3 - 0.15 * V.span; L.rain.y[i] = V.apex + r() * (V.sill - V.apex); L.rain.near[i] = i % 6 === 0 ? 1 : 0; L.rain.v[i] = (L.rain.near[i] ? 1.3 : 0.8 + 0.4 * r()) * H; L.rain.land[i] = L.rain.near[i] ? V.sill + 0.02 * H : yR(r()); }
    L.snow = { n: 320, x: new Float32Array(320), y: new Float32Array(320), v: new Float32Array(320), r: new Float32Array(320), ph: new Float32Array(320), land: new Float32Array(320) };
    for (let i = 0; i < 320; i++) { const near = i % 7 === 0; L.snow.x[i] = V.x0 - 0.1 * V.span + r() * V.span * 1.2; L.snow.y[i] = V.apex + r() * (V.sill - V.apex); L.snow.v[i] = (near ? 0.07 : 0.025 + 0.035 * r()) * H; L.snow.r[i] = (near ? 2.2 + 1.6 * r() : 0.7 + 1.1 * r()) * LWU; L.snow.ph[i] = r() * TAU; L.snow.land[i] = near ? V.sill + 0.02 * H : yR(r()); }
    L.splash = { n: 40, x: new Float32Array(40), y: new Float32Array(40), age: new Float32Array(40).fill(9), i: 0 };
    L.drip = { n: 9, x: new Float32Array(9), g: new Float32Array(9), y: new Float32Array(9) };
    for (let i = 0; i < 9; i++) { L.drip.x[i] = V.x0 - V.D + (i + 0.3 + 0.4 * r()) / 9 * (V.span + 2 * V.D); L.drip.g[i] = r(); L.drip.y[i] = -1; }
    L.prng = r;
    L.lan = { n: 40, X: new Float32Array(40), Y: new Float32Array(40), Z: new Float32Array(40), age: new Float32Array(40).fill(-1), life: new Float32Array(40), ph: new Float32Array(40), sz: new Float32Array(40) };
    L.mote = { n: 48, X: new Float32Array(48), Y: new Float32Array(48), Z: new Float32Array(48), age: new Float32Array(48).fill(-1), life: new Float32Array(48), ph: new Float32Array(48), k: new Uint8Array(48) };
    L.raven = { x: V.x1 - 0.16 * V.span, y: V.sill + 0.022 * H, s: 0.08 * H };
  }

  // ------------------------------------------------------------------ moon sprite (as classical)
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
    c.fillStyle = "rgba(0,0,0,0.92)"; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
    c.fillStyle = U.rgba(U.safe(C.slate), 0.08); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
    c.strokeStyle = U.rgba(U.safe(C.slate), 0.3); c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
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
      for (const [x, y, a, b2, rot] of MARIA) {
        c.save(); c.translate(x * r, y * r); c.rotate(rot);
        c.fillStyle = "rgba(0,0,0,0.12)";
        c.beginPath();
        for (let i = 0; i <= 16; i++) { const q = i / 16 * TAU, w = 1 + 0.18 * Math.sin(q * 3 + x * 9) + 0.1 * Math.sin(q * 5 + y * 7); const px = Math.cos(q) * a * r * w, py = Math.sin(q) * b2 * r * w; i ? c.lineTo(px, py) : c.moveTo(px, py); }
        c.fill();
        c.fillStyle = "rgba(0,0,0,0.06)"; c.beginPath(); c.ellipse(0, 0, a * r * 1.25, b2 * r * 1.3, 0, 0, TAU); c.fill();
        c.restore();
      }
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

  function build() {
    LWU = Math.max(1, H / 1100);
    geom();
    L = {}; glows.clear(); sprites.clear();
    if (!CITY) buildCity();
    bakeSky();
    bakeMountains();
    bakeCity();
    bakeDome();
    bakeFrame();
    bakeHair();
    buildWeather();
    bakeWall();
    built = `${W}x${H}@${dpr}`;
  }

  // ------------------------------------------------------------------ light
  // The brighter of sun and moon is the key light; which way it falls through a south window decides the rims.
  function lightState(now) {
    const loc = AW.config.location, phi = loc.lat * RAD;
    const A = astro(now, loc.lon);
    const sun = horiz(A.sunDec, A.sunH, phi), moon = horiz(A.moonDec, A.moonH, phi);
    const sI = U.smoothstep(-0.8, 6, sun.alt);
    const mI = U.smoothstep(-0.5, 8, moon.alt) * (0.12 + 0.88 * A.illum) * (1 - sI);
    const useSun = sI >= mI, src = useSun ? sun : moon;
    const I = Math.max(sI, mI);
    return {
      A, sun, moon, sI, mI, I, useSun, illum: A.illum,
      side: Math.sin((src.az - 180) * RAD),
      night: 1 - U.smoothstep(-14, -3, sun.alt),
      dusk: U.smoothstep(-14, -1, sun.alt) * (1 - U.smoothstep(4, 14, sun.alt)),
      day: U.smoothstep(-2, 10, sun.alt),
      dark: 1 - U.smoothstep(-4, 10, sun.alt),
    };
  }
  // the sky through the window: az 180 +- 75 across the opening, altitude eased so the moon rides the arch
  const skyX = (az) => V.cx + ((((az - 180) % 360) + 540) % 360 - 180) / 75 * V.span / 2;
  const skyY = (alt) => V.hz - (V.hz - V.apex - 0.02 * H) * Math.pow(U.clamp(alt / 60, 0, 1.2), 0.82);

  // ------------------------------------------------------------------ weather (eased, never snapped)
  const WX = { cloud: 0, fog: 0, rain: 0, storm: 0, snow: 0, wind: 6, acc: 0, wet: 0, init: false };
  let FLASH = 0;
  function wxTargets(w) {
    const c = (w && w.condition) || "clear";
    const k = w ? U.clamp(w.intensity == null ? 0.5 : w.intensity) : 0;
    const t = { cloud: 0, fog: 0, rain: 0, storm: 0, snow: 0 };
    if (c === "cloudy") t.cloud = 0.12 + 0.88 * k;
    else if (c === "fog") { t.fog = 0.45 + 0.55 * k; t.cloud = 0.3; }
    else if (c === "rain") { t.rain = 0.08 + 0.92 * k; t.cloud = 0.62 + 0.38 * k; }
    else if (c === "storm") { t.rain = Math.max(0.78, k); t.storm = 1; t.cloud = 1; }
    else if (c === "snow") { t.snow = 0.15 + 0.85 * k; t.cloud = 0.6 + 0.3 * k; }
    return t;
  }
  function wxUpdate(f) {
    const w = f.signals && f.signals.weather;
    const t = wxTargets(w), wind = w && w.windKph != null ? w.windKph : 6;
    if (!WX.init) { Object.assign(WX, t); WX.wind = wind; WX.acc = t.snow; WX.wet = t.rain; WX.init = true; return; }
    const dt = Math.min(0.1, f.dt || 0.016);
    const k = 1 - Math.exp(-dt / 1.5);          // settles in a few seconds
    for (const n of ["cloud", "fog", "rain", "storm", "snow"]) WX[n] += (t[n] - WX[n]) * k;
    WX.wind += (wind - WX.wind) * k;
    WX.acc += (t.snow - WX.acc) * (1 - Math.exp(-dt / 25)); // snow settles and melts slowly
    WX.wet += (Math.max(t.rain, t.storm) - WX.wet) * (1 - Math.exp(-dt / (t.rain > WX.wet ? 4 : 40))); // roofs dry slowly
  }
  // lightning: rare, dim. Deterministic 9 s slots; half the strikes find the ward.
  function lightning(t) {
    if (WX.storm < 0.02) return null;
    const slot = Math.floor(t / 9), r = U.rng(slot * 7919 + 13);
    if (r() > 0.32) return null;
    const t0 = slot * 9 + 1 + r() * 6, u = t - t0;
    if (u < 0 || u > 1.3) return null;
    const fl = Math.exp(-u * 8) + (u > 0.16 ? 0.7 * Math.exp(-(u - 0.16) * 7) : 0) + (u > 0.42 ? 0.4 * Math.exp(-(u - 0.42) * 8) : 0);
    const dome = r() < 0.5;
    let hx, hy;
    if (dome) { domeP((40 + 30 * r()) * RAD, (r() - 0.5) * 1.6); hx = dX; hy = dY; }
    else { hx = V.x0 + (0.08 + 0.84 * r()) * V.span; hy = V.hz - 0.035 * H; }
    // distance: the ward is over the city (0.3-0.55), the plain and the ranges are farther (0.6-1); the farther,
    // the dimmer the flash, and its thunder (cued on the flash) arrives distance x 5 s later
    const d = dome ? 0.3 + 0.25 * r() : 0.6 + 0.4 * r();
    return { fl: U.clamp(fl) * WX.storm * (1 - 0.45 * (d - 0.3) / 0.7), u, x: hx, y: hy, dome, seed: slot, d };
  }

  // ------------------------------------------------------------------ ambient drawing
  function drawSky(ctx, f, Ls, a, el, litFrac) {
    // the sky's gradient: night slate-violet at the horizon, dusk warm on the west, a dim blue day
    const n = Ls.night, d = Ls.dusk * (1 - n), dy = Ls.day * (1 - d);
    const cov = U.smoothstep(0.3, 0.95, WX.cloud), fl = FLASH;
    const hor = U.mix(U.mix(C.skyNight, C.skyDuskHi, d), C.skyDay, dy);
    const zen = U.mix(C.skyZen, C.skyDay, dy * 0.8);
    const g = ctx.createLinearGradient(0, V.apex, 0, V.hz + 0.01 * H);
    const ha = (0.1 + 0.02 * d + 0.01 * dy) * (1 - 0.3 * cov) + 0.08 * fl, za = (0.02 + 0.05 * dy + 0.02 * d) + 0.04 * fl;
    g.addColorStop(0, U.rgba(U.safe(zen), za * a)); g.addColorStop(0.55, U.rgba(U.safe(U.mix(zen, hor, 0.5)), (za + ha) * 0.5 * a)); g.addColorStop(0.82, U.rgba(U.safe(hor), ha * a));
    g.addColorStop(1, U.rgba(U.safe(U.mix(hor, C.skyDusk, 0.7 * d * (1 - 0.4 * cov))), (ha + 0.02 * d) * a));
    ctx.fillStyle = g; ctx.fillRect(V.x0, V.apex, V.span, V.hz - V.apex + 0.01 * H);
    // an overcast deck: the sky goes flat and faintly lit from beneath by the city
    if (cov > 0.01) {
      const dg = ctx.createLinearGradient(0, V.apex, 0, V.hz);
      const dc = U.safe(U.mix(C.slate, C.glow, 0.25 * Ls.dark));
      dg.addColorStop(0, U.rgba(dc, 0.02 * cov * a)); dg.addColorStop(1, U.rgba(dc, 0.06 * cov * a));
      ctx.fillStyle = dg; ctx.fillRect(V.x0, V.apex, V.span, V.hz - V.apex);
    }
    // dusk: a warm breath on the sunset side
    if (Ls.dusk > 0.01) {
      const sx = U.clamp(skyX(Ls.sun.az), V.x0 - 0.15 * V.span, V.x1 + 0.15 * V.span), gw = 1.3 * V.span, gh = 0.4 * H;
      ctx.globalAlpha = U.clamp(0.2 * Ls.dusk * a * (1 - 0.45 * cov));
      ctx.drawImage(L.duskGlow, sx - gw / 2, V.hz - gh / 2 - Math.max(0, Ls.sun.alt) * 0.004 * H, gw, gh);
    }
    // stars
    const glare = 1 - 0.5 * Ls.mI * Ls.illum;
    const sA = a * n * glare * (1 - U.smoothstep(0.25, 0.85, WX.cloud)) * (1 - 0.7 * WX.fog);
    if (sA > 0.01) {
      blit(ctx, L.stars1, sA * (0.4 + 0.6 * U.smoothstep(0, 3600, el)));
      blit(ctx, L.stars2, sA * U.smoothstep(900, 4 * 3600, el));
      ctx.globalAlpha = 1;
      const gc = U.safe(C.starGold);
      for (const s of L.twinkle) {
        const tw = 0.5 + 0.5 * Math.sin(f.t * s.sp + s.ph) * Math.sin(f.t * s.sp * 0.37 + s.ph * 2);
        ctx.fillStyle = U.rgba(gc, sA * (0.25 + 0.5 * tw));
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawMoons(ctx, f, Ls, a) {
    const veil = (1 - 0.93 * U.smoothstep(0.5, 0.92, WX.cloud)) * (1 - 0.5 * WX.fog);
    // the second moon of the old tales: small, pale teal, ringed; it keeps its own slow nine-day phase
    {
      const days = f.now.getTime() / 86400000, ph = ((days / 9.3) % 1 + 1) % 1, il = (1 - Math.cos(ph * TAU)) / 2;
      const hr = (f.now.getHours() + f.now.getMinutes() / 60 + 6) % 24 / 24;
      const x = V.x0 + V.span * (0.12 + 0.2 * hr), y = V.apex + (0.2 + 0.08 * Math.sin(hr * Math.PI)) * (V.hz - V.apex);
      const r = 0.008 * H, aa = a * Ls.night * veil * 0.75;
      if (aa > 0.01 && il > 0.03) {
        const tc = U.safe(U.mix(C.teal, C.bone, 0.45));
        ctx.globalAlpha = U.clamp(0.08 * aa); ctx.drawImage(glow(tc), x - r * 5, y - r * 5, r * 10, r * 10); ctx.globalAlpha = 1;
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
        ctx.fillStyle = U.rgba(tc, 0.5 * aa); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(0,0,0,${0.85 * aa})`; ctx.beginPath(); ctx.arc(x + (ph < 0.5 ? -1 : 1) * r * 2 * il, y, r, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = U.rgba(tc, 0.22 * aa); ctx.lineWidth = 0.8 * LWU; ctx.beginPath(); ctx.ellipse(x, y, r * 2.2, r * 0.5, -0.35, 0, TAU); ctx.stroke();
      }
    }
    // the real moon, where it really is; hidden by the stone when it stands outside the window
    const m = Ls.moon;
    if (a <= 0.004 || m.alt < -2 || Ls.illum < 0.015) return null;
    const x = skyX(m.az), y = skyY(m.alt), r = 0.026 * H;
    if (x < V.x0 - 0.2 * V.span || x > V.x1 + 0.2 * V.span || y < V.apex - 0.2 * H) return null;
    const dayDim = 1 - 0.45 * U.smoothstep(-2, 8, Ls.sun.alt);
    const hv = a * dayDim * (0.25 + 0.75 * Ls.illum) * (1 - 0.55 * U.smoothstep(0.6, 1, WX.cloud)) * (1 - 0.4 * WX.fog);
    const h1 = 0.2 * H, h2 = 0.075 * H;
    ctx.globalAlpha = U.clamp(0.1 * hv); ctx.drawImage(L.halo, x - h1, y - h1, h1 * 2, h1 * 2);
    ctx.globalAlpha = U.clamp(0.16 * hv); ctx.drawImage(L.halo, x - h2, y - h2, h2 * 2, h2 * 2);
    const ms = moonSprite(r, Ls.illum, limbAngle(m, Ls.sun));
    ctx.globalAlpha = U.clamp(a * dayDim * veil * (1 - DK));
    ctx.drawImage(ms.cv, x - ms.S / 2, y - ms.S / 2, ms.S, ms.S);
    if (DK > 0.004) {
      // by day only its lit part shows, pale on the blue
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = U.clamp(0.3 * DK * a * veil);
      ctx.drawImage(ms.cv, x - ms.S / 2, y - ms.S / 2, ms.S, ms.S); ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = 1;
    return { x, y, r, vis: inOpening(x, y, -r) ? dayDim * veil : 0 };
  }

  // the comet: once an evening, at a time seeded by the date, over about four and a half minutes
  function cometPlan(now) {
    const d = new Date(now); if (d.getHours() < 12) d.setDate(d.getDate() - 1);
    const r = U.rng((d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) * 97 + 11);
    r(); r();
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 21, 0, 0).getTime() + r() * 210 * 60000;
    return { start, dur: 270000, dir: r() < 0.5 ? -1 : 1, y0: 0.34 + 0.14 * r(), dy: 0.04 + 0.1 * r(), x0: 0.02 + 0.12 * r() };
  }
  function drawComet(ctx, f, Ls, a) {
    const P = cometPlan(f.now), u = (f.now.getTime() - P.start) / P.dur;
    if (u <= 0 || u >= 1) return;
    const env = Math.pow(Math.sin(Math.PI * u), 0.6) * a * Ls.night * (1 - 0.85 * U.smoothstep(0.4, 0.9, WX.cloud)) * (1 - 0.6 * WX.fog);
    if (env < 0.01) return;
    const xs = P.dir > 0 ? U.lerp(P.x0 - 0.05, 0.8 + P.x0, u) : U.lerp(1.05 - P.x0, 0.2 - P.x0, u);
    const x = V.x0 + xs * V.span, y = V.apex + (V.hz - V.apex) * (P.y0 + P.dy * u);
    // the tail streams up and a little back, away from the sun below the horizon: a broad curved dust fan,
    // a brighter spine, and a thin straight ion tail in teal
    const tx = -P.dir * 0.42, ty = -0.91, len = 0.24 * V.span * (0.75 + 0.25 * Math.sin(Math.PI * u));
    const hc = U.safe(U.mix(C.teal, C.bone, 0.55)), ic = U.safe(C.teal);
    const nx = -ty, ny = tx, ex = x + tx * len, ey = y + ty * len, fan = 0.075 * len;
    const g0 = ctx.createLinearGradient(x, y, ex, ey);
    g0.addColorStop(0, U.rgba(hc, 0.12 * env)); g0.addColorStop(0.4, U.rgba(hc, 0.05 * env)); g0.addColorStop(1, U.rgba(hc, 0));
    ctx.fillStyle = g0; ctx.beginPath(); ctx.moveTo(x + nx * 1.5, y + ny * 1.5);
    ctx.quadraticCurveTo(x + tx * len * 0.5 + nx * fan * 0.4 - P.dir * len * 0.06, y + ty * len * 0.5 + ny * fan * 0.4, ex + nx * fan - P.dir * len * 0.1, ey + ny * fan);
    ctx.lineTo(ex - nx * fan * 0.6 - P.dir * len * 0.06, ey - ny * fan * 0.6);
    ctx.quadraticCurveTo(x + tx * len * 0.5 - nx * fan * 0.2, y + ty * len * 0.5 - ny * fan * 0.2, x - nx * 1.5, y - ny * 1.5);
    ctx.closePath(); ctx.fill();
    for (const [w, al, ion] of [[2.2 * LWU, 0.22, 0], [1 * LWU, 0.18, 1]]) {
      const ex2 = ion ? x + (tx + 0.1 * P.dir) * len * 1.1 : ex - P.dir * len * 0.05, ey2 = ion ? y + ty * len * 1.1 : ey;
      const g = ctx.createLinearGradient(x, y, ex2, ey2);
      g.addColorStop(0, U.rgba(ion ? ic : hc, al * env)); g.addColorStop(1, U.rgba(ion ? ic : hc, 0));
      ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, y);
      if (ion) ctx.lineTo(ex2, ey2); else ctx.quadraticCurveTo(x + tx * len * 0.5 - P.dir * len * 0.03, y + ty * len * 0.5, ex2, ey2);
      ctx.stroke();
    }
    const gr = 0.016 * H;
    ctx.globalAlpha = U.clamp(0.45 * env); ctx.drawImage(glow(hc), x - gr, y - gr, gr * 2, gr * 2); ctx.globalAlpha = 1;
    ctx.fillStyle = U.rgba(hc, 0.85 * env); ctx.beginPath(); ctx.arc(x, y, 1.4 * LWU, 0, TAU); ctx.fill();
  }

  // a wyvern or a griffin crossing the moon now and then (deterministic 11-minute slots)
  function creaturePlan(ms) {
    const slotMs = 11 * 60000, slot = Math.floor(ms / slotMs), r = U.rng(slot * 7349 + 101);
    if (r() > 0.45) return null;
    const start = slot * slotMs + (0.05 + 0.8 * r()) * slotMs, dur = 36000;
    if (ms < start || ms > start + dur) return null;
    return { u: (ms - start) / dur, kind: r() < 0.5 ? 0 : 1, dir: r() < 0.5 ? -1 : 1, ang: (r() - 0.5) * 0.3, alt: r() };
  }
  function drawCreature(ctx, f, Ls, a, moon) {
    const P = creaturePlan(f.now.getTime());
    if (!P) return;
    const vis = a * (1 - 0.9 * U.smoothstep(0.5, 0.95, WX.cloud)) * (1 - 0.7 * WX.fog);
    if (vis < 0.02) return;
    const through = moon && moon.vis > 0.05;
    const my = through ? moon.y : V.apex + (0.18 + 0.3 * P.alt) * (V.hz - V.apex), mx = through ? moon.x : V.cx;
    const xa = V.x0 - 0.06 * V.span, xb = V.x1 + 0.06 * V.span;
    const x = P.dir > 0 ? U.lerp(xa, xb, P.u) : U.lerp(xb, xa, P.u);
    const y = my + (x - mx) * Math.tan(P.ang) + Math.sin(f.t * 0.7) * 0.004 * H;
    const s = 0.05 * H, t = f.t;
    const flapping = (P.u > 0.15 && P.u < 0.3) || (P.u > 0.62 && P.u < 0.74);
    const wing = flapping ? Math.sin(t * 5.2) : 0.35 + 0.08 * Math.sin(t * 1.1);
    ctx.save(); ctx.translate(x, y); ctx.scale(P.dir * s, s); ctx.rotate(-P.ang * P.dir);
    ctx.beginPath();
    if (P.kind === 0) {
      // wyvern: long neck and whip tail, membrane wings with scalloped trailing edge
      ctx.moveTo(0.42, -0.04); ctx.quadraticCurveTo(0.34, -0.1, 0.24, -0.05); ctx.quadraticCurveTo(0.1, 0.02, -0.12, 0.0);
      ctx.quadraticCurveTo(-0.4, 0.0, -0.62, 0.06); ctx.lineTo(-0.7, 0.04); ctx.lineTo(-0.66, 0.1); ctx.lineTo(-0.6, 0.08);
      ctx.quadraticCurveTo(-0.38, 0.06, -0.12, 0.05); ctx.quadraticCurveTo(0.12, 0.06, 0.25, 0.0); ctx.quadraticCurveTo(0.34, -0.04, 0.42, -0.0); ctx.closePath();
      const wy = -0.55 * wing;
      ctx.moveTo(0.06, -0.01); ctx.lineTo(-0.02 + 0.06 * wing, wy - 0.02); ctx.lineTo(-0.08, wy * 0.72);
      ctx.quadraticCurveTo(-0.11, wy * 0.45, -0.16, wy * 0.55); ctx.quadraticCurveTo(-0.18, wy * 0.25, -0.24, wy * 0.3); ctx.quadraticCurveTo(-0.22, wy * 0.05, -0.12, 0.01); ctx.closePath();
      ctx.moveTo(0.02, 0.02); ctx.lineTo(-0.04, 0.22 * wing + 0.05); ctx.lineTo(-0.14, 0.03); ctx.closePath();
    } else {
      // griffin: eagle head and feathered wings, lion's body and tufted tail
      ctx.moveTo(0.36, -0.03); ctx.lineTo(0.42, 0.0); ctx.lineTo(0.35, 0.02); ctx.quadraticCurveTo(0.24, 0.07, 0.1, 0.06);
      ctx.quadraticCurveTo(-0.14, 0.09, -0.26, 0.05); ctx.quadraticCurveTo(-0.38, 0.06, -0.48, 0.12); ctx.lineTo(-0.52, 0.1); ctx.lineTo(-0.49, 0.06);
      ctx.quadraticCurveTo(-0.38, 0.0, -0.26, -0.02); ctx.quadraticCurveTo(-0.06, -0.06, 0.18, -0.05); ctx.quadraticCurveTo(0.28, -0.07, 0.36, -0.03); ctx.closePath();
      const wy = -0.5 * wing;
      ctx.moveTo(0.08, -0.04); ctx.lineTo(0.0 + 0.05 * wing, wy);
      for (let q = 0; q < 5; q++) { ctx.lineTo(-0.04 - q * 0.035, wy * (0.95 - q * 0.12) + 0.03); ctx.lineTo(-0.05 - q * 0.035, wy * (0.85 - q * 0.14)); }
      ctx.lineTo(-0.14, -0.03); ctx.closePath();
      ctx.moveTo(0.18, 0.05); ctx.lineTo(0.2, 0.15); ctx.lineTo(0.15, 0.06); ctx.moveTo(-0.2, 0.06); ctx.lineTo(-0.24, 0.15); ctx.lineTo(-0.17, 0.06);
    }
    ctx.fillStyle = `rgba(0,0,0,${0.95 * vis})`; ctx.fill();
    ctx.lineWidth = 1.1 / s; ctx.strokeStyle = U.rgba(U.safe(C.moonLit), 0.16 * vis); ctx.stroke();
    ctx.restore();
  }

  // nk, dd: how much of the night clouds and of the day clouds to draw (1, 0 at night)
  function drawClouds(ctx, f, Ls, a, lit, nk, dd) {
    if (a <= 0.004 || WX.cloud < 0.01) return;
    if (nk == null) nk = 1;
    dd = dd || 0;
    const speed = (5 + WX.wind * 0.8) * (V.span / 1100);
    const n = L.clouds.length;
    for (let i = 0; i < n; i++) {
      const cl = L.clouds[i];
      const on = U.smoothstep(i / n * 0.9, i / n * 0.9 + 0.16, WX.cloud);
      if (on <= 0.004) continue;
      const span = V.span + cl.w;
      const x = V.x0 + ((cl.x0 * span + f.t * speed * cl.sp) % span + span) % span - cl.w;
      const y = cl.y + Math.sin(f.t * 0.01 + i) * 0.005 * H;
      const nA = a * on * nk, dA = a * on * dd * (1 - U.smoothstep(0.1, 0.6, WX.fog));
      if (nA > 0.004) {
        ctx.globalAlpha = U.clamp(nA); ctx.drawImage(cl.occ.cv, x, y, cl.w, cl.h);
        ctx.globalAlpha = U.clamp(nA * lit); ctx.drawImage(cl.rim.cv, x, y, cl.w, cl.h);
      }
      if (dA > 0.004) {
        // by day: high pale banks; greyer as the deck closes, rain or snow comes, a storm builds
        const grey = U.clamp(U.smoothstep(0.35, 0.9, WX.cloud) + 0.6 * WX.rain + WX.storm + 0.6 * WX.snow);
        const ca = dA * (0.9 - 0.45 * U.smoothstep(0.5, 1, WX.cloud));
        if (grey < 0.995) { ctx.globalAlpha = U.clamp(ca * (1 - grey)); ctx.drawImage(cl.day.cv, x, y, cl.w, cl.h); }
        if (grey > 0.005) { ctx.globalAlpha = U.clamp(ca * grey); ctx.drawImage(cl.dayG.cv, x, y, cl.w, cl.h); }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawBolt(ctx, Lt, a) {
    const al = a * Lt.fl;
    if (al <= 0.01) return;
    const r = U.rng(Lt.seed * 31 + 5), bc = U.safe(C.bolt);
    let x = Lt.x + (r() - 0.5) * 0.12 * V.span, y = V.apex + 0.04 * H;
    const pts = [[x, y]];
    while (y < Lt.y) { y = Math.min(Lt.y, y + (0.025 + 0.035 * r()) * H); x += (r() - 0.5) * 0.04 * V.span; x = U.lerp(x, Lt.x, U.smoothstep(Lt.y - 0.12 * H, Lt.y, y) * 0.6); pts.push([x, y]); }
    pts[pts.length - 1] = [Lt.x, Lt.y];
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const [w, k] of [[4 * LWU, 0.12], [1.2 * LWU, 0.55]]) {
      ctx.strokeStyle = U.rgba(bc, k * al); ctx.lineWidth = w; ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      const bi = Math.floor(pts.length * 0.4);
      if (pts[bi]) { ctx.moveTo(pts[bi][0], pts[bi][1]); let bx = pts[bi][0], by = pts[bi][1]; for (let q = 0; q < 3; q++) { bx += (r() - 0.3) * 0.03 * V.span; by += 0.025 * H; ctx.lineTo(bx, by); } }
      ctx.stroke();
    }
  }

  // the river: moonlight glitter in a column under the moon, lamps and windows shimmering in it, rain rings
  function drawRiver(ctx, f, Ls, a, moon, litK, ev) {
    const G = L.rgrid, t = f.t;
    if (!G || a <= 0.01) return;
    const vis = (x, y) => {
      const i = Math.floor((x - V.bx) / G.cell), j = Math.floor((y - V.by) / G.cell);
      return i >= 0 && j >= 0 && i < G.gw && j < G.gh && G.grid[j * G.gw + i] === 1;
    };
    const calm = 1 - 0.6 * WX.rain;
    if (moon && moon.vis > 0.02 && Ls.mI > 0.02) {
      const mc = U.safe(C.bone), mx = moon.x;
      ctx.fillStyle = U.rgba(mc, 0.5 * a * Ls.mI * moon.vis * calm);
      ctx.beginPath();
      for (let y = V.hz + 2; y < V.sill; y += 2.4) {
        const spread = 0.004 * V.span + (y - V.hz) * 0.05;
        for (let q = 0; q < 2; q++) {
          const n1 = U.noise2(y * 0.31 + q * 9, t * 0.9 + q * 3);
          const x = mx + n1 * spread * 1.6;
          if (!vis(x, y) || Math.abs(n1) > 0.55) continue;
          const w = (1.5 + 3 * (1 - Math.abs(n1))) * (0.6 + (y - V.hz) / H);
          ctx.rect(x - w / 2, y, w, 0.9 * LWU);
        }
      }
      ctx.fill();
    }
    // reflections of lamps and windows near the banks
    const LT = L.lt;
    if (litK > 0.01 && LT) {
      for (let i = 0; i < LT.n; i++) {
        if (isNaN(LT.rx[i])) continue;
        const on = U.smoothstep(LT.on[i], LT.on[i] + 3, ev) * (1 - U.smoothstep(LT.off[i], LT.off[i] + 4, ev));
        if (on < 0.05) continue;
        const k = LT.k[i], col = k === 2 ? C.teal : k === 3 ? C.violet : k === 4 ? C.lamp : C.candle;
        ctx.fillStyle = U.rgba(U.safe(col), 0.45 * on * litK * a * calm);
        ctx.beginPath();
        const s = LT.s[i], x0 = LT.rx[i], y1 = LT.ry[i], yw = (LT.y[i] + y1) / 2, len = (y1 - yw) * 1.5 + 4;
        // a broken column of light from the waterline down past the mirror point, wobbling with the ripples
        const n = Math.min(14, Math.max(4, Math.round(len / (2.2 * LWU))));
        for (let q = 0; q < n; q++) {
          const u = q / n, y = yw + 1 + u * len, x = x0 + U.noise2(q * 0.9 + i, t * 1.2) * s * (0.8 + 2.2 * u);
          if (!vis(x, y) || U.noise2(q * 2.3 + i * 0.7, t * 2.1) > 0.35) continue;
          const w = s * (1.7 - 0.9 * u) * (0.7 + 0.5 * Math.abs(U.noise2(q, t * 0.7 + i)));
          ctx.rect(x - w / 2, y, w, Math.max(0.8, 0.9 * LWU));
        }
        ctx.fill();
      }
    }
    // rain rings
    if (WX.rain > 0.05) {
      const P = L.rpts, n = P.length / 2, c = U.safe(C.rain);
      ctx.strokeStyle = U.rgba(c, 0.25 * a * WX.rain); ctx.lineWidth = 0.7 * LWU; ctx.beginPath();
      const cnt = Math.round(30 * WX.rain);
      for (let q = 0; q < cnt; q++) {
        const ph = (t * 1.7 + q * 0.618) % 1, j = Math.floor((q * 7919 + Math.floor(t * 1.7 + q * 0.618) * 104729) % n);
        const x = P[j * 2], y = P[j * 2 + 1], r = (1 + 4 * ph) * LWU * (0.5 + (y - V.hz) / H);
        ctx.moveTo(x + r, y); ctx.ellipse(x, y, r, r * 0.3, 0, 0, TAU);
      }
      ctx.stroke();
    }
  }

  const LCOL = () => [C.candle, U.mix(C.candle, C.lamp, 0.6), C.teal, C.violet, C.lamp, null, U.mix(C.violet, C.candle, 0.45)];
  let LC = null;
  // the city's lights: windows winking on through the evening, lamps from dusk, arcane lights later
  function drawLights(ctx, f, a, ev, litK, magicA) {
    const LT = L.lt;
    if (!LT || a <= 0.01 || litK <= 0.01) return 0;
    if (!LC) LC = LCOL().map((c) => (c ? U.safe(c) : null));
    const t = f.t, fog = WX.fog;
    let onSum = 0;
    for (let k = 0; k <= 6; k++) {
      const i0 = LT.start[k], i1 = LT.end[k];
      if (i0 < 0) continue;
      const arc = k === 2 || k === 3 || k === 5;
      const ka = a * litK * (arc ? magicA : 1) * (k === 1 ? 0.7 : k === 4 ? 0.8 : 1);
      if (ka <= 0.01) continue;
      const col = k === 5 || k === 6 ? null : LC[k];
      for (let g = 0; g < 3; g++) {
        const breathe = 0.82 + 0.18 * U.noise1(t * 0.23 + g * 7 + k * 3);
        if (col) {
          ctx.fillStyle = U.rgba(col, 0.82 * ka * breathe * (1 - 0.85 * fog));
          ctx.beginPath();
        }
        for (let i = i0 + g; i < i1; i += 3) {
          const on = U.smoothstep(LT.on[i], LT.on[i] + 3, ev) * (1 - U.smoothstep(LT.off[i], LT.off[i] + 4, ev));
          if (on < 0.02) continue;
          onSum += on;
          const x = LT.x[i], y = LT.y[i], s = LT.s[i];
          const sub = LT.sub[i] ? fog : 0;
          // a soft glow round the larger and the arcane ones; under the fog everything blooms
          const wink = arc ? 1 + 1.4 * Math.exp(-Math.max(0, ev - LT.on[i] - 1.5) * 0.9) * U.smoothstep(LT.on[i], LT.on[i] + 1.5, ev) : 1;
          const gs = (k === 5 ? 9 : k === 6 ? 5 : arc ? 6 : 3.4) * s * (1 + 1.2 * sub);
          if (k >= 2 || s > 2.4 || sub > 0.05) {
            const gc = k === 5 ? (LT.ph[i] % 2 < 1 ? LC[2] : LC[3]) : k === 6 ? LC[6] : col;
            const pulse = k === 5 ? 0.75 + 0.25 * Math.sin(t * 0.6 + LT.ph[i]) : 1;
            ctx.globalAlpha = U.clamp((k === 5 ? 0.42 : arc ? 0.3 : 0.2) * on * ka * wink * pulse * (1 + 0.4 * sub));
            ctx.drawImage(glow(gc), x - gs, y - gs, gs * 2, gs * 2);
            ctx.globalAlpha = 1;
            if (k === 5) { ctx.fillStyle = U.rgba(gc, 0.8 * on * ka * pulse * (1 - 0.6 * sub)); ctx.fillRect(x - s * 0.35, y - s * 0.35, s * 0.7, s * 0.7); }
            if (k === 6) {
              // the rose window: a roundel of coloured glass, its tracery dark against it
              const r = s * 0.5, al = on * ka * (1 - 0.7 * sub);
              ctx.fillStyle = U.rgba(LC[6], 0.5 * al); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
              ctx.fillStyle = U.rgba(LC[0], 0.55 * al); ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, TAU); ctx.fill();
              ctx.strokeStyle = `rgba(0,0,0,${0.8 * al})`; ctx.lineWidth = Math.max(0.8, r * 0.12); ctx.beginPath();
              for (let q = 0; q < 8; q++) { const aq = q / 8 * TAU; ctx.moveTo(x + Math.cos(aq) * r * 0.3, y + Math.sin(aq) * r * 0.3); ctx.lineTo(x + Math.cos(aq) * r, y + Math.sin(aq) * r); }
              ctx.stroke();
            }
          }
          if (col) {
            if (on > 0.97 && wink < 1.05) ctx.rect(x - s * 0.36, y - s * 0.6, s * 0.72, s * 1.15);
            else { ctx.save(); ctx.fillStyle = U.rgba(col, U.clamp(0.82 * ka * on * Math.min(1.6, wink) * (1 - 0.85 * fog))); ctx.fillRect(x - s * 0.36, y - s * 0.6, s * 0.72, s * 1.15); ctx.restore(); }
          }
        }
        if (col) ctx.fill();
      }
    }
    return onSum / Math.max(1, LT.n);
  }

  // lanterns rising from the streets, motes spiralling up from the arcane lights
  function drawFloaters(ctx, f, a, ev, litK) {
    const dt = Math.min(0.05, f.dt || 0.016), r = L.prng, t = f.t;
    const wet = Math.max(WX.rain, WX.snow, WX.storm);
    const want = Math.round((4 + 24 * U.smoothstep(1200, 7200, ev) * (1 - 0.7 * U.smoothstep(6.5 * 3600, 9 * 3600, ev))) * (1 - 0.9 * wet) * litK);
    const A = L.lan, lc = U.safe(C.candle);
    let alive = 0;
    for (let i = 0; i < A.n; i++) if (A.age[i] >= 0) alive++;
    for (let i = 0; i < A.n; i++) {
      if (A.age[i] < 0) {
        if (alive < want && r() < dt * 0.5) {
          let X = 0, Z = 0;
          for (let q = 0; q < 6; q++) { X = CITY_C[0] + (r() - 0.5) * 2.8; Z = CITY_C[1] + (r() - 0.5) * 2.8; if (Math.hypot(X - CITY_C[0], Z - CITY_C[1]) < 1.5) break; }
          A.X[i] = X; A.Z[i] = Z; A.Y[i] = 0.1 + 0.08 * r(); A.age[i] = 0; A.life[i] = 70 + 70 * r(); A.ph[i] = r() * TAU; A.sz[i] = 0.9 + 0.4 * r(); alive++;
        }
        continue;
      }
      A.age[i] += dt;
      A.Y[i] += (0.006 + 0.002 * Math.sin(A.ph[i])) * dt;
      A.X[i] += (WX.wind * 0.0004 + 0.003 * Math.sin(t * 0.3 + A.ph[i])) * dt;
      if (A.age[i] > A.life[i] || A.Y[i] > 1.6) { A.age[i] = -1; continue; }
      const fa = U.smoothstep(0, 4, A.age[i]) * (1 - U.smoothstep(A.life[i] * 0.7, A.life[i], A.age[i]));
      const x = PX(A.X[i], A.Z[i]), y = PY(A.Y[i], A.Z[i]), s = V.f * 0.009 * A.sz[i] / (A.Z[i] - V.cz);
      const fl = 0.85 + 0.15 * Math.sin(t * 3.1 + A.ph[i] * 5);
      ctx.globalAlpha = U.clamp(0.3 * fa * a * fl); ctx.drawImage(glow(lc), x - s * 5, y - s * 5, s * 10, s * 10);
      ctx.globalAlpha = 1; ctx.fillStyle = U.rgba(lc, 0.85 * fa * a * fl); ctx.fillRect(x - s * 0.4, y - s * 0.55, s * 0.8, s * 1.1);
    }
    // motes
    const M = L.mote, src = CITY.sources;
    if (!LC) LC = LCOL().map((c) => (c ? U.safe(c) : null)); // drawLights may not have run yet (lights off, a clock jump)
    const mw = Math.round(48 * U.smoothstep(1800, 5400, ev) * (1 - 0.6 * wet) * litK);
    for (let i = 0; i < M.n; i++) {
      if (M.age[i] < 0) {
        if (i < mw && r() < dt * 0.4) {
          const s0 = src[Math.floor(r() * src.length)];
          M.X[i] = s0[0] + (r() - 0.5) * 0.05; M.Y[i] = s0[1]; M.Z[i] = s0[2] + (r() - 0.5) * 0.05; M.age[i] = 0; M.life[i] = 6 + 8 * r(); M.ph[i] = r() * TAU; M.k[i] = r() < 0.6 ? 2 : 3;
        }
        continue;
      }
      M.age[i] += dt;
      if (M.age[i] > M.life[i]) { M.age[i] = -1; continue; }
      const u = M.age[i], rr = 0.02 + 0.006 * u;
      const X = M.X[i] + Math.cos(u * 1.3 + M.ph[i]) * rr, Z = M.Z[i] + Math.sin(u * 1.3 + M.ph[i]) * rr * 0.6, Y = M.Y[i] + u * 0.018;
      const x = PX(X, Z), y = PY(Y, Z);
      const fa = U.smoothstep(0, 1, u) * (1 - U.smoothstep(M.life[i] * 0.6, M.life[i], u)) * (0.6 + 0.4 * Math.sin(t * 6 + M.ph[i] * 3));
      const mc = M.k[i] === 2 ? LC[2] : LC[3];
      ctx.fillStyle = U.rgba(mc, 0.85 * fa * a); ctx.fillRect(x - 0.7 * LWU, y - 0.7 * LWU, 1.4 * LWU, 1.4 * LWU);
    }
  }

  // the ward-dome: the baked shell, two slow rune bands, a ripple running down it, flares where lightning lands
  function drawDome(ctx, f, a, Lt) {
    if (a <= 0.004) return;
    const t = f.t, dc = U.safe(DOMEC);
    blit(ctx, L.dome, a);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 0.8 * LWU; ctx.lineCap = "round";
    // rune bands: tiny glyph marks circling slowly in opposite senses
    for (const [phi, n, sp, sz] of [[16, 72, 0.006, 0.011], [48, 48, -0.009, 0.008]]) {
      const fr = new Path2D(), bk = new Path2D();
      for (let i = 0; i < n; i++) {
        const th = i / n * TAU + t * sp, R0 = RUNES[i % RUNES.length];
        domeP(phi * RAD, th);
        const x = dX, y = dY, front = dF;
        domeP(phi * RAD, th + 0.01); const ex = dX - x, ey = dY - y, el = Math.hypot(ex, ey) || 1;
        const s = sz * H * (front ? 1 : 0.7), ux = ex / el, uy = ey / el;
        const P = front ? fr : bk, k = s * 0.6;
        for (const [p, q, r2, w] of R0) { P.moveTo(x + (p * ux - q * uy) * k, y + (p * uy + q * ux) * k); P.lineTo(x + (r2 * ux - w * uy) * k, y + (r2 * uy + w * ux) * k); }
      }
      ctx.strokeStyle = U.rgba(dc, 0.2 * a); ctx.stroke(fr);
      ctx.strokeStyle = U.rgba(dc, 0.07 * a); ctx.stroke(bk);
    }
    // a ripple: a parallel sliding down from the crown every forty seconds
    const rp = (t % 40) / 14;
    if (rp < 1) {
      const phi = (1 - rp) * 88 * RAD, env = Math.sin(Math.PI * rp);
      const fr = new Path2D();
      let first = true;
      for (let k = 0; k <= 72; k++) { domeP(phi, k / 72 * TAU); if (!dF) { first = true; continue; } if (first) { fr.moveTo(dX, dY); first = false; } else fr.lineTo(dX, dY); }
      ctx.strokeStyle = U.rgba(dc, 0.07 * env * a); ctx.lineWidth = 2.2 * LWU; ctx.stroke(fr);
      ctx.strokeStyle = U.rgba(dc, 0.12 * env * a); ctx.lineWidth = 0.8 * LWU; ctx.stroke(fr);
    }
    // lightning on the ward: a dim flare and a crackle running out along the shell
    if (Lt && Lt.dome && Lt.fl > 0.02) {
      const fc = U.safe(U.mix(DOMEC, C.bolt, 0.5)), gr = 0.09 * H;
      ctx.globalAlpha = U.clamp(0.35 * Lt.fl * a); ctx.drawImage(glow(fc), Lt.x - gr, Lt.y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = U.clamp(0.25 * Lt.fl * a); ctx.save(); ctx.beginPath(); ctx.arc(Lt.x, Lt.y, 0.14 * H, 0, TAU); ctx.clip(); blit(ctx, L.dome, U.clamp(0.4 * Lt.fl * a)); ctx.restore();
      ctx.globalAlpha = 1;
      const r = U.rng(Lt.seed * 13 + 7);
      ctx.strokeStyle = U.rgba(fc, 0.4 * Lt.fl * a); ctx.lineWidth = 0.9 * LWU; ctx.beginPath();
      for (let q = 0; q < 5; q++) {
        let x = Lt.x, y = Lt.y; const ang = r() * TAU; ctx.moveTo(x, y);
        for (let s = 0; s < 4; s++) { x += Math.cos(ang + (r() - 0.5) * 1.2) * 0.012 * H; y += Math.sin(ang + (r() - 0.5) * 1.2) * 0.008 * H; ctx.lineTo(x, y); }
      }
      ctx.stroke();
    }
  }

  function drawFogWisps(ctx, f, a, el, Ls) {
    const amt = a * Math.max((0.1 + 0.25 * U.smoothstep(4 * 3600, 8 * 3600, el)) * (1 - DK), WX.fog * 1.2);
    if (amt <= 0.01) return;
    const mc = U.mix(C.mist, C.glow, 0.15 + 0.1 * Ls.dark);
    const tk = colKey(mc);
    if (tk !== L.mistTintKey) {
      L.mistTintKey = tk;
      const c = L.mistTint.c; c.save(); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, 256, 256);
      c.drawImage(L.mist, 0, 0, 256, 256);
      c.globalCompositeOperation = "source-in"; c.fillStyle = U.rgba(U.safe(mc), 1); c.fillRect(0, 0, 256, 256);
      c.restore();
    }
    const t = f.t;
    const pools = [[0.5, 0.56, 0.9, 0.07, 0.05], [0.25, 0.63, 0.6, 0.06, 0.05], [0.75, 0.6, 0.7, 0.06, 0.045], [0.45, 0.7, 0.8, 0.07, 0.05], [0.15, 0.5, 0.5, 0.04, 0.035], [0.85, 0.5, 0.5, 0.04, 0.035]];
    pools.forEach(([px, py, pw, ph, pa], i) => {
      const dx = Math.sin(t * 0.017 * (0.7 + i * 0.13) + i * 1.9) * 0.06 * V.span + Math.sin(t * 0.006 + i) * 0.03 * V.span;
      const w = pw * V.span, h = ph * H * (1 + 0.4 * WX.fog);
      ctx.globalAlpha = U.clamp(pa * 1.6 * amt);
      ctx.drawImage(L.mistTint.cv, V.x0 + px * V.span + dx - w / 2, py * H - h / 2, w, h);
    });
    ctx.globalAlpha = 1;
  }

  function drawPrecip(ctx, f, a, lit) {
    if (a <= 0.004) return;
    const dt = Math.min(0.05, f.dt || 0.016), r = L.prng, t = f.t;
    const slant = U.clamp(WX.wind / 55, 0, 0.85);
    // rain: far streaks in sheets that sweep across with the wind, a few near drops falling past the sill
    if (WX.rain > 0.01) {
      const R = L.rain, n = Math.round(R.n * Math.pow(WX.rain, 0.8));
      const rc = U.safe(U.mix(C.rain, C.bone, 0.2));
      for (let i = 0; i < n; i++) {
        const len = R.near[i] ? 0.06 * H : (0.015 + 0.02 * WX.rain) * H;
        R.y[i] += R.v[i] * dt; R.x[i] += R.v[i] * slant * dt;
        if (R.y[i] > R.land[i]) {
          if (R.near[i] && R.x[i] > V.x0 + 4 && R.x[i] < V.x1 - 4) { const s = L.splash; s.x[s.i] = R.x[i]; s.y[s.i] = V.sill + r() * (V.sillIn - V.sill) * 0.8; s.age[s.i] = 0; s.i = (s.i + 1) % s.n; }
          R.y[i] = V.apex - len - r() * 0.2 * H; R.x[i] = V.x0 + r() * V.span * 1.3 - 0.3 * V.span * slant - 0.05 * V.span;
        }
      }
      const NB = 6, bw = V.span / NB;
      for (let bk = 0; bk < NB; bk++) {
        const cur = 0.45 + 0.55 * (0.5 + 0.5 * U.noise1(bk * 0.9 - t * (0.35 + slant * 0.6)));
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          if (R.near[i]) continue;
          const x = R.x[i];
          if (x < V.x0 + bk * bw || x >= V.x0 + (bk + 1) * bw) continue;
          const len = (0.015 + 0.02 * WX.rain) * H;
          ctx.moveTo(x, R.y[i]); ctx.lineTo(x - slant * len, R.y[i] - len);
        }
        ctx.strokeStyle = U.rgba(rc, a * lit * (0.08 + 0.3 * WX.rain) * cur); ctx.lineWidth = 0.8 * LWU; ctx.stroke();
      }
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (!R.near[i]) continue;
        const len = 0.06 * H;
        ctx.moveTo(R.x[i], R.y[i]); ctx.lineTo(R.x[i] - slant * len, R.y[i] - len);
      }
      ctx.strokeStyle = U.rgba(rc, a * lit * (0.1 + 0.18 * WX.rain)); ctx.lineWidth = 1.1 * LWU; ctx.stroke();
    }
    // snow: far flakes settling into the city, big near ones drifting past the window
    if (WX.snow > 0.01) {
      const S = L.snow, n = Math.round(S.n * WX.snow);
      const drift = WX.wind * 0.9 * (V.span / 1100);
      const sc = U.safe(C.snow);
      ctx.fillStyle = U.rgba(sc, a * lit * 0.8);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        S.y[i] += S.v[i] * dt; S.x[i] += (drift * (S.r[i] > 2 * LWU ? 1.6 : 1) + Math.sin(t * 0.7 + S.ph[i]) * 14) * dt;
        if (S.y[i] > S.land[i]) { S.y[i] = V.apex - 4 - r() * 0.1 * H; S.x[i] = V.x0 - 0.1 * V.span + r() * V.span * 1.2; }
        if (S.x[i] > V.x1 + 10) S.x[i] -= V.span + 20;
        const rr = S.r[i];
        ctx.moveTo(S.x[i] + rr, S.y[i]); ctx.arc(S.x[i], S.y[i], rr, 0, TAU);
      }
      ctx.fill();
    }
  }

  // the sill's weather: splashes and drips in rain, a growing ridge of snow
  function drawSill(ctx, f, a, lit) {
    if (a <= 0.004) return;
    const dt = Math.min(0.05, f.dt || 0.016), D = V.D;
    if (WX.wet > 0.02) {
      const rc = U.safe(U.mix(C.rain, C.bone, 0.3));
      // the wet lip catches the sky
      ctx.strokeStyle = U.rgba(rc, 0.3 * WX.wet * a * lit); ctx.lineWidth = 1 * LWU;
      ctx.beginPath(); ctx.moveTo(V.x0 + 2, V.sill + 1.5); ctx.lineTo(V.x1 - 2, V.sill + 1.5); ctx.stroke();
      const s = L.splash;
      ctx.beginPath();
      for (let i = 0; i < s.n; i++) {
        if (s.age[i] > 0.3) continue;
        s.age[i] += dt;
        const k = s.age[i] / 0.3, rr = (1.5 + 4 * k) * LWU;
        ctx.moveTo(s.x[i] - rr, s.y[i]); ctx.quadraticCurveTo(s.x[i] - rr * 0.5, s.y[i] - rr * 0.9, s.x[i], s.y[i] - 0.3);
        ctx.moveTo(s.x[i] + rr, s.y[i]); ctx.quadraticCurveTo(s.x[i] + rr * 0.5, s.y[i] - rr * 0.9, s.x[i], s.y[i] - 0.3);
      }
      ctx.strokeStyle = U.rgba(rc, 0.4 * a * lit * WX.rain); ctx.stroke();
      // beads gathering under the sill's front and letting go
      const Dp = L.drip;
      ctx.fillStyle = U.rgba(rc, 0.45 * a * lit * WX.wet);
      ctx.beginPath();
      for (let i = 0; i < Dp.n; i++) {
        if (Dp.y[i] < 0) {
          Dp.g[i] += dt * (0.12 + 0.4 * WX.rain) * (0.6 + 0.4 * Math.sin(i * 3.1));
          const rr = (0.6 + 1.4 * Math.min(1, Dp.g[i])) * LWU;
          ctx.moveTo(Dp.x[i] + rr, V.sillFront + rr); ctx.arc(Dp.x[i], V.sillFront + rr, rr, 0, TAU);
          if (Dp.g[i] > 1) { Dp.y[i] = V.sillFront + rr; Dp.g[i] = 0; }
        } else {
          Dp.y[i] += dt * 0.6 * H;
          ctx.moveTo(Dp.x[i] + 1.2, Dp.y[i]); ctx.arc(Dp.x[i], Dp.y[i], 1.2 * LWU, 0, TAU);
          if (Dp.y[i] > V.sillFront + 0.04 * H) Dp.y[i] = -1;
        }
      }
      ctx.fill();
    }
    if (WX.acc > 0.03) {
      // a soft drift along the sill, deeper against the jambs; its crest catches the light
      const sc = U.safe(C.snow), k = U.smoothstep(0.03, 0.8, WX.acc), th = 0.012 * H * k;
      const crest = [];
      for (let q = 0; q <= 48; q++) {
        const u = q / 48, x = U.lerp(V.x0 + 2, V.x1 - 2, u);
        const drift = 0.6 * Math.pow(Math.abs(u - 0.5) * 2, 4);
        crest.push([x, V.sill + 0.004 * H - th * (0.5 + 0.22 * Math.sin(u * 17) * Math.sin(u * 5.3) + drift)]);
      }
      const g = ctx.createLinearGradient(0, V.sill - th, 0, V.sillIn);
      g.addColorStop(0, U.rgba(sc, 0.12 * k * a)); g.addColorStop(1, U.rgba(sc, 0.02 * k * a));
      ctx.beginPath(); ctx.moveTo(V.x0 - D * 0.6, V.sillIn);
      for (const p of crest) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(V.x1 + D * 0.6, V.sillIn); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); crest.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.strokeStyle = U.rgba(sc, 0.4 * k * a * lit); ctx.lineWidth = 1.1 * LWU; ctx.stroke();
    }
  }

  // the raven, asleep on the sill with its head tucked in; it breathes
  function drawRaven(ctx, f, a, lit, rimCol) {
    if (a <= 0.004) return;
    const R = L.raven, br = Math.sin(f.t * 1.4);
    // units: feet at the origin, about one unit tall, facing left (into the room's light)
    const body = (c) => {
      c.moveTo(-0.02, -0.06);
      c.bezierCurveTo(-0.2, -0.1, -0.33, -0.3, -0.32, -0.52);       // breast
      c.bezierCurveTo(-0.31, -0.62, -0.3, -0.68, -0.27, -0.72);      // throat hackles
      c.bezierCurveTo(-0.27, -0.84, -0.17, -0.92, -0.06, -0.9);      // crown, hunched low
      c.bezierCurveTo(0.04, -0.89, 0.1, -0.82, 0.13, -0.74);         // nape
      c.bezierCurveTo(0.24, -0.66, 0.36, -0.46, 0.44, -0.26);        // folded wing over the back
      c.lineTo(0.66, -0.06); c.lineTo(0.6, -0.02); c.lineTo(0.42, -0.1); // wedge tail
      c.bezierCurveTo(0.3, -0.08, 0.18, -0.05, 0.08, -0.05);        // under the tail
      c.closePath();
    };
    ctx.save(); ctx.translate(R.x, R.y); ctx.scale(R.s, R.s * (1 + 0.012 * br));
    ctx.beginPath(); body(ctx);
    // the heavy beak, resting down along the breast
    ctx.moveTo(-0.27, -0.76); ctx.quadraticCurveTo(-0.4, -0.74, -0.47, -0.64); ctx.quadraticCurveTo(-0.38, -0.66, -0.29, -0.66); ctx.closePath();
    ctx.fillStyle = `rgba(2,2,4,${0.97 * a})`; ctx.fill();
    // legs and toes on the stone
    ctx.lineWidth = 1.4 / R.s; ctx.strokeStyle = `rgba(2,2,4,${a})`; ctx.beginPath();
    ctx.moveTo(-0.06, -0.07); ctx.lineTo(-0.08, 0); ctx.lineTo(-0.17, 0.005); ctx.moveTo(0.05, -0.07); ctx.lineTo(0.04, 0); ctx.lineTo(-0.05, 0.005); ctx.stroke();
    // light along the crown, the back and the wing; the eye shut
    ctx.lineCap = "round"; ctx.lineWidth = 1.1 * LWU / R.s;
    ctx.strokeStyle = U.rgba(rimCol, (0.3 + 0.32 * lit) * a); ctx.beginPath();
    ctx.moveTo(-0.29, -0.74); ctx.bezierCurveTo(-0.27, -0.84, -0.17, -0.92, -0.06, -0.9);
    ctx.bezierCurveTo(0.04, -0.89, 0.1, -0.82, 0.13, -0.74); ctx.bezierCurveTo(0.24, -0.66, 0.36, -0.46, 0.44, -0.26); ctx.lineTo(0.66, -0.06); ctx.stroke();
    ctx.strokeStyle = U.rgba(rimCol, (0.1 + 0.14 * lit) * a); ctx.beginPath();
    ctx.moveTo(-0.08, -0.62); ctx.bezierCurveTo(0.05, -0.5, 0.22, -0.32, 0.4, -0.16);
    ctx.moveTo(-0.33, -0.5); ctx.bezierCurveTo(-0.3, -0.3, -0.2, -0.14, -0.06, -0.08);
    ctx.moveTo(-0.2, -0.79); ctx.quadraticCurveTo(-0.16, -0.77, -0.12, -0.79);
    ctx.stroke();
    ctx.restore();
  }

  // the wizard's familiar, on the sill opposite the raven and keeping an eye on it: it sits, loafs, then curls up
  // asleep as the night wears on, and hunkers into a loaf when the rain or snow blows in. Lit from the room by the
  // candles (warm on the coat), rimmed by the moon (or sun) on the sky's side and by the ward's arcane glow on the
  // other; its eyes catch the light at night. THEMES.md "The cat".
  let CAT = null;
  const _kRim = { color: null, a: 0, dx: 0.6, dy: -0.8 }, _mRim = { color: null, a: 0, dx: -0.9, dy: -0.25 };
  const _cRims = [_kRim, _mRim], _cO = { x: 0, y: 0, size: 1, facing: 1, pose: "sit", light: 0.25, tint: null, tintAmt: 0.3, rim: _cRims, glow: 0, shadow: 0, alpha: 0 };
  function drawFamiliar(ctx, f, a, Ls, I, kc, magicA, dk) {
    const o = _cO;
    o.alpha = f.cat ? a : 0;
    if (!f.cat || a < 0.002) { CAT.draw(ctx, f, o); return; }   // keeps its clock running; draws nothing
    o.x = V.x0 + 0.2 * V.span; o.y = V.sill + 0.024 * H; o.size = 0.135 * H;
    const auto = AW.cat.autoPose(f);
    o.pose = auto === "sit" && WX.rain + WX.storm + 0.6 * WX.snow > 0.45 ? "loaf" : auto;
    const side = U.clamp(Ls.side, -1, 1), sd = side < 0 ? -1 : 1;
    _kRim.color = kc; _kRim.a = U.clamp(0.28 + 0.4 * I + 0.45 * FLASH);
    _kRim.dx = sd * Math.max(0.35, Math.abs(side)); _kRim.dy = -0.8;
    _mRim.color = U.safe(DOMEC); _mRim.a = 0.34 * magicA * (1 - dk);
    _mRim.dx = -sd; _mRim.dy = -0.25;
    o.light = U.lerp(0.24 + 0.08 * I, 0.86, dk);
    o.tint = U.mix(C.candle, C.sunLit, dk); o.tintAmt = U.lerp(0.4, 0.2, dk);
    o.glow = 0.72 * (1 - dk);
    o.shadow = 0.5 * dk;
    CAT.draw(ctx, f, o);
  }

  // a ward-rune on a gatehouse tower: a calm slow pulse, or a red flicker failing, the host's name beside it
  function drawWard(ctx, f, w, h, a, i) {
    const t = f.t, down = !h.up, R = runeFor(h.host);
    const s = Math.max(0.016 * H, w.s * 0.5);
    let k, col;
    if (down) {
      const stutter = U.noise1(t * 7.3 + i * 11) > 0.15 ? 1 : 0.25;
      const fail = 0.5 + 0.5 * Math.sin(t * 2.4 + i);
      k = (0.35 + 0.65 * fail) * stutter; col = U.safe(C.ward);
      const pr = s * (1 + ((t * 0.55 + i * 0.3) % 1) * 3.5);
      ctx.strokeStyle = U.rgba(col, 0.4 * a * (1 - ((t * 0.55 + i * 0.3) % 1))); ctx.lineWidth = 1.1 * LWU;
      ctx.beginPath(); ctx.arc(w.x, w.y, pr, 0, TAU); ctx.stroke();
      ctx.globalAlpha = U.clamp(0.4 * a * (0.6 + 0.4 * fail)); ctx.drawImage(glow(col), w.x - s * 3.4, w.y - s * 3.4, s * 6.8, s * 6.8); ctx.globalAlpha = 1;
      text(ctx, String(h.host), w.x + s * 1.6, w.y - s * 0.2, { px: Math.max(13, 0.021 * H), style: "italic", color: C.rose, glow: 4, core: 0.85 }, "left", 1, a * (0.6 + 0.2 * Math.sin(t * 1.6)));
    } else {
      k = 0.72 + 0.28 * Math.sin(t * TAU / 7 + i * 1.3); col = U.safe(C.rune);
      ctx.globalAlpha = U.clamp(0.18 * a * k); ctx.drawImage(glow(col), w.x - s * 2.4, w.y - s * 2.4, s * 4.8, s * 4.8); ctx.globalAlpha = 1;
    }
    ctx.beginPath(); runePath(ctx, R, w.x, w.y, s);
    ctx.lineCap = "round"; ctx.strokeStyle = U.rgba(col, (down ? 0.85 : 0.7) * a * k); ctx.lineWidth = 1.3 * LWU; ctx.stroke();
  }

  // ------------------------------------------------------------------ daytime: the city in its true colours
  // By day the window looks out on a bright sky with high clouds over slate roofs, honey stone and a gilded dome,
  // green and golden fields, a blue river with boats on it and banners on the towers; the spell-lights are out and
  // the ward-dome all but invisible in the sun. The room's stone round the window is lit by the daylight coming in.
  // The city, ground and mountains are baked once in day colours, with three white sun masks (the sun from the
  // east, the west, or high in the south) tinted by the sun's colour and cross-faded by where it really is. The
  // sky, sun, clouds, boats, banners and birds are live. Everything rides on frame.day (dk): at night none of it
  // runs. Behind the work face the same view is drawn faintly (DAY_WORK) from a composite cached by sun and weather.
  const arr = (a) => ({ r: a[0], g: a[1], b: a[2] });
  const rgb = (c) => `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`;
  const DAY_WORK = 0.18;
  const DHAZE = U.hex("#646e84"), DINK = U.hex("#1c1814"), DMILK = U.hex("#464a50"), DMILK2 = U.hex("#4e5258");
  const DSNOW = U.hex("#a8b2c4"), DSNOWG = U.hex("#7a7e86");
  const DMTN = [U.hex("#56607c"), U.hex("#46526a"), U.hex("#2c3c34")];
  const n3u = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
  const SUN_L = n3u(-0.84, 0.4, 0.24), SUN_R = n3u(0.84, 0.4, 0.24), SUN_C = n3u(0, 0.82, 0.57);
  // materials by day: plaster and honey stone, slate (and a few tiled) roofs, the gilded dome
  const DMAT = {
    house: [[150, 118, 72], [156, 140, 104], [150, 104, 58], [146, 104, 92], [126, 120, 110], [158, 130, 86]],
    roof: [[60, 68, 82], [70, 76, 90], [52, 58, 72], [64, 72, 86], [130, 68, 48], [60, 68, 82], [76, 86, 66], [66, 74, 88]],
    stone: [[150, 126, 88]], wall: [[140, 118, 84]], rock: [[86, 76, 64]], tree: [[40, 62, 40]], dome: [[196, 152, 62]],
  };
  const dayMat = (s, si) => { const l = DMAT[s.mat] || DMAT.stone; return l[((si * 2654435761) >>> 0) % l.length]; };
  // the sky by sun altitude: zenith, horizon, the sun's glow, the sunlight's colour, an overall daylight level
  const TDK = [
    // alt   top            hor              glow            gA    sun              k
    [-6, [6, 9, 30], [28, 26, 50], [130, 64, 76], 0.2, [120, 70, 70], 0.4],
    [-1, [12, 18, 54], [96, 56, 52], [204, 98, 54], 0.42, [204, 104, 60], 0.6],
    [4, [16, 28, 74], [118, 82, 62], [214, 140, 70], 0.42, [214, 144, 80], 0.8],
    [12, [14, 36, 94], [70, 86, 116], [212, 178, 112], 0.3, [212, 180, 122], 0.93],
    [25, [12, 40, 106], [56, 86, 128], [214, 196, 140], 0.25, [212, 194, 148], 1],
    [45, [12, 40, 112], [52, 86, 132], [214, 200, 150], 0.22, [212, 198, 158], 1],
  ];
  function tPal(alt) {
    let i = 0;
    while (i < TDK.length - 2 && alt > TDK[i + 1][0]) i++;
    const A = TDK[i], B = TDK[i + 1], u = U.smoothstep(A[0], B[0], alt);
    const m = (j) => U.mix(arr(A[j]), arr(B[j]), u);
    return { alt, top: m(1), hor: m(2), glow: m(3), gA: U.lerp(A[4], B[4], u), sun: m(5), k: U.lerp(A[6], B[6], u) };
  }
  // weather on the sky: overcast greys it (a bright, even grey), rain darkens, a storm goes slate, fog milky
  function daySkyT(P) {
    const cov = U.smoothstep(0.3, 0.95, WX.cloud), k = P.k;
    let top = U.mix(P.top, U.scale(U.hex("#3a3c42"), k), cov), hor = U.mix(P.hor, U.scale(U.hex("#54565c"), k), cov);
    const wet = U.clamp(WX.rain * 0.8);
    top = U.mix(top, U.scale(top, 0.74), wet); hor = U.mix(hor, U.scale(hor, 0.78), wet);
    top = U.mix(top, U.scale(U.hex("#14182a"), k), WX.storm); hor = U.mix(hor, U.scale(U.hex("#282c3a"), k), WX.storm);
    const sn = U.clamp(WX.snow * 1.4);
    top = U.mix(top, U.scale(U.hex("#3a3c42"), k), sn); hor = U.mix(hor, U.scale(U.hex("#4c4e54"), k), sn);
    const fg = U.smoothstep(0.1, 0.6, WX.fog);
    top = U.mix(top, U.scale(DMILK, 0.94 * k), fg); hor = U.mix(hor, U.scale(DMILK2, k), fg);
    return { top, hor, cov };
  }
  const qcol = (c) => ({ r: (c.r >> 2) << 2, g: (c.g >> 2) << 2, b: (c.b >> 2) << 2 });

  // the plain by day: green near, a patchwork of fields and stubble, dark woods, the town paved inside its ring,
  // the blue river with the sky in it, the crag under the window. Baked into the day city's base.
  function bakeDayGround(c) {
    const yBot = V.by + V.bh, xL = V.bx, xR = V.bx + V.bw;
    const g = c.createLinearGradient(0, V.hz, 0, yBot);
    g.addColorStop(0, rgb(DHAZE)); g.addColorStop(0.05, "rgb(76,88,84)"); g.addColorStop(0.22, "rgb(66,84,52)"); g.addColorStop(1, "rgb(42,58,34)");
    c.fillStyle = g; c.fillRect(xL, V.hz - 1, V.bw, yBot - V.hz + 1);
    const rnd = U.rng(4049);
    const FC = [[78, 100, 50], [126, 114, 60], [100, 84, 54], [70, 92, 48], [108, 116, 64], [92, 104, 56]];
    for (let p = 0; p < 110; p++) {
      const X = (rnd() - 0.5) * 26, Z = 5.8 + Math.pow(rnd(), 1.5) * 30, w = 0.5 + rnd() * 1.5, d = 0.4 + rnd() * 1.6, fc = FC[Math.floor(rnd() * FC.length)];
      if (onRiver(X, Z, Math.max(w, d) / 2 + 0.25)) continue;
      const hz = hazeAt(Z), col = U.mix(arr(fc), DHAZE, hz * 0.92);
      const q = [[X - w / 2, Z], [X + w / 2, Z], [X + w / 2, Z + d], [X - w / 2, Z + d]].map(([x, z]) => [PX(x, z), PY(0, z)]);
      c.beginPath(); polyPath(c, q); c.fillStyle = rgb(col); c.fill();
      c.strokeStyle = U.rgba(DINK, 0.16 * (1 - hz)); c.lineWidth = 0.7 * LWU; c.stroke();
    }
    // the town's streets and yards inside the ring wall
    {
      const pts = [];
      for (let k = 0; k < 64; k++) { const a = k / 64 * TAU, x = CITY_C[0] + CITY_R * Math.sin(a), z = CITY_C[1] + CITY_R * Math.cos(a); pts.push([PX(x, z), PY(0, z)]); }
      c.beginPath(); polyPath(c, pts); c.fillStyle = "rgb(80,74,64)"; c.fill();
    }
    // the road from the far gate toward the hills, pale with dust
    c.strokeStyle = "rgba(138,126,98,0.5)"; c.lineWidth = 1.3 * LWU; c.beginPath();
    for (let z = 6.12; z < 60; z *= 1.08) { const x = Math.sin(z * 0.35) * 0.4 * U.smoothstep(6, 14, z); z === 6.12 ? c.moveTo(PX(x, z), PY(0, z)) : c.lineTo(PX(x, z), PY(0, z)); }
    c.stroke();
    // woods: clumps of small dark firs
    for (const [X, Z, r, n] of [[-3.2, 7.4, 0.9, 40], [-6, 12, 1.6, 50], [2.2, 7.6, 0.7, 26], [5.6, 9.5, 1.2, 40], [-1.6, 10.5, 0.8, 30], [7, 16, 2, 50], [-9, 20, 3, 60], [3.5, 18, 2.2, 40]]) {
      for (let q = 0; q < n; q++) {
        const x = X + (rnd() - 0.5) * 2 * r, z = Z + (rnd() - 0.5) * r;
        if (onRiver(x, z, 0.1)) continue;
        const sx = PX(x, z), sy = PY(0, z), th = V.f * (0.07 + 0.05 * rnd()) / z, tw = th * 0.32, hz = hazeAt(z);
        c.beginPath(); c.moveTo(sx - tw, sy); c.lineTo(sx, sy - th); c.lineTo(sx + tw, sy); c.closePath();
        c.fillStyle = rgb(U.mix(U.hex("#1e3424"), DHAZE, hz * 0.85)); c.fill();
      }
    }
    // the river: the sky's blue in it, deeper near, ripples catching the light
    const riv = L.riverPoly;
    c.beginPath(); polyPath(c, riv);
    const rg = c.createLinearGradient(0, V.hz, 0, yBot);
    rg.addColorStop(0, "rgb(92,110,140)"); rg.addColorStop(0.15, "rgb(58,84,122)"); rg.addColorStop(1, "rgb(34,60,98)");
    c.fillStyle = rg; c.fill(); c.strokeStyle = U.rgba(DINK, 0.3); c.lineWidth = 0.8 * LWU; c.stroke();
    c.save(); c.beginPath(); polyPath(c, riv); c.clip();
    {
      const wr = U.rng(3132); c.lineWidth = 0.8 * LWU; c.lineCap = "round";
      for (const [x, z, nx, nz] of L.RS) {
        if (z > 14) continue;
        const k = V.f / (z - V.cz), w = riverW(z) / 2;
        for (let q = 0; q < 5; q++) {
          const o = (wr() - 0.5) * 2 * w, xx = x + nx * o, zz = z + nz * o, l = (0.03 + 0.05 * wr()) * k * 0.5, sx = PX(xx, zz), sy = PY(0, zz);
          c.strokeStyle = `rgba(150,176,204,${((0.12 + 0.14 * wr()) * (1 - hazeAt(z) * 0.6)).toFixed(3)})`;
          c.beginPath(); c.moveTo(sx - l * Math.abs(nz), sy); c.lineTo(sx + l * Math.abs(nz), sy); c.stroke();
        }
      }
    }
    c.restore();
    // the near crag falling away under the window
    c.fillStyle = "rgb(42,38,34)"; c.beginPath(); c.moveTo(xL, yBot);
    for (let x = xL; x <= xR; x += 6) c.lineTo(x, PY(0, 2.25) + 0.012 * H * (0.5 + 0.5 * U.noise1(x * 0.02)) + Math.max(0, (V.cx - x) / V.span) * 0.03 * H);
    c.lineTo(xR, yBot); c.closePath(); c.fill();
  }

  // the tower room by day: its ashlar in soft window light, the splayed reveal and the sill lit by the sky
  function bakeWall() {
    const o = L.wallD = layer(0, 0, W, H), c = o.c, D = V.D;
    // the window wall is the room's darkest (the light falls away from it); only the stone close round the
    // reveal catches some
    c.fillStyle = "rgb(10,9,8)"; c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(V.cx, V.ys - 0.04 * H, V.span * 0.48, V.cx, V.ys - 0.04 * H, V.span * 0.95);
    g.addColorStop(0, "rgba(66,58,50,0.5)"); g.addColorStop(0.35, "rgba(66,58,50,0.2)"); g.addColorStop(1, "rgba(66,58,50,0)");
    c.fillStyle = g; c.fillRect(0, 0, W, V.sill);
    // below the sill the parapet is in the window's own shadow
    const pg = c.createLinearGradient(0, V.sill - 0.06 * H, 0, V.sill);
    pg.addColorStop(0, "rgba(10,9,8,0)"); pg.addColorStop(1, "rgba(10,9,8,0.6)"); c.fillStyle = pg; c.fillRect(0, V.sill - 0.06 * H, W, 0.06 * H);
    // courses and joints, a lit lip under each course
    const ch = 0.045 * H, y0 = (V.sillFront % ch) - ch, rnd = U.rng(6161);
    c.lineWidth = LWU; c.strokeStyle = "rgba(3,3,2,0.55)"; c.beginPath();
    for (let y = y0, k = 0; y < H + ch; y += ch, k++) {
      c.moveTo(0, y); c.lineTo(W, y);
      for (let x = (k % 2 ? 0.05 : 0.11) * V.span + rnd() * 0.04 * V.span; x < W; x += (0.1 + 0.06 * rnd()) * V.span) { c.moveTo(x, y); c.lineTo(x, y + ch); }
    }
    c.stroke();
    c.strokeStyle = "rgba(110,98,84,0.1)"; c.beginPath();
    for (let y = y0; y < H + ch; y += ch) { c.moveTo(0, y + 1.5 * LWU); c.lineTo(W, y + 1.5 * LWU); }
    c.stroke();
    // the reveal: jambs and soffit catch the sky, brightest at the opening
    c.save(); c.beginPath(); archPath(c, D, V.sillIn); archPath(c, 0, V.sill); c.clip("evenodd");
    const rg = c.createRadialGradient(V.cx, V.sill * 0.58, V.span * 0.36, V.cx, V.sill * 0.58, V.span * 0.7);
    rg.addColorStop(0, "rgb(104,96,82)"); rg.addColorStop(1, "rgb(54,50,44)");
    c.fillStyle = rg; c.fillRect(V.x0 - D - 4, 0, V.span + 2 * D + 8, V.sillIn + 2);
    // the sill's top face: open to the sky, the brightest stone in the room
    c.beginPath(); c.moveTo(V.x0, V.sill); c.lineTo(V.x1, V.sill); c.lineTo(V.x1 + D, V.sillIn); c.lineTo(V.x0 - D, V.sillIn); c.closePath();
    const sg = c.createLinearGradient(0, V.sill, 0, V.sillIn); sg.addColorStop(0, "rgb(122,112,94)"); sg.addColorStop(1, "rgb(86,78,66)");
    c.fillStyle = sg; c.fill();
    c.restore();
    // the sill's moulded front, in its own shadow
    c.fillStyle = "rgb(34,31,27)"; c.fillRect(V.x0 - D - 0.008 * H, V.sillIn, V.span + 2 * D + 0.016 * H, V.sillFront - V.sillIn);
    // the opening itself stays clear (the view is drawn there)
    c.globalCompositeOperation = "destination-out"; c.beginPath(); archPath(c, 0, V.sill); c.fill(); c.globalCompositeOperation = "source-over";
  }

  // the day sky through the window (screen coordinates; c is the screen or the cached composite)
  function drawDaySkyT(c, Ls, P, a, b) {
    const S = daySkyT(P);
    const g = c.createLinearGradient(0, V.apex, 0, V.hz + 0.01 * H);
    g.addColorStop(0, rgb(S.top)); g.addColorStop(0.62, rgb(U.mix(S.top, S.hor, 0.55))); g.addColorStop(1, rgb(S.hor));
    c.globalAlpha = U.clamp(a); c.fillStyle = g; c.fillRect(V.x0, V.apex - 2, V.span, V.hz - V.apex + 0.01 * H + 2);
    const sun = Ls.sun, clear = (1 - 0.9 * S.cov) * (1 - 0.7 * WX.fog) * (1 - WX.storm);
    if (sun.alt > -8 && clear > 0.01) {
      const x = skyX(sun.az), y = skyY(Math.max(-1, sun.alt)), gc = U.safe(P.glow);
      const low = 1 - U.smoothstep(2, 22, sun.alt);
      if (low > 0.01) {
        c.save(); c.translate(x, V.hz); c.scale(1, 0.34);
        const r = 1.1 * V.span, hg = c.createRadialGradient(0, 0, 0, 0, 0, r);
        hg.addColorStop(0, U.rgba(gc, 0.8 * low * P.gA)); hg.addColorStop(0.5, U.rgba(gc, 0.24 * low * P.gA)); hg.addColorStop(1, U.rgba(gc, 0));
        c.globalAlpha = U.clamp(a * clear); c.fillStyle = hg; c.fillRect(-r, -r, 2 * r, 2 * r);
        c.restore();
      }
      if (sun.alt > -1 && x > V.x0 - 0.4 * V.span && x < V.x1 + 0.4 * V.span) {
        const r = 0.42 * H, sg = c.createRadialGradient(x, y, 0, x, y, r);
        sg.addColorStop(0, U.rgba(gc, P.gA * 1.8)); sg.addColorStop(0.08, U.rgba(gc, P.gA * 0.95)); sg.addColorStop(0.3, U.rgba(gc, P.gA * 0.26)); sg.addColorStop(1, U.rgba(gc, 0));
        c.globalAlpha = U.clamp(a * clear); c.fillStyle = sg; c.fillRect(x - r, y - r, 2 * r, 2 * r);
        // the disc itself, warm and never white; behind the work face only its warmth shows
        const dc = U.safe(U.mix(P.glow, U.hex("#dcc896"), 0.6)), rr = 0.017 * H;
        c.globalAlpha = U.clamp(a * U.smoothstep(0.68, 0.9, b) * (1 - U.smoothstep(0.25, 0.75, S.cov)) * (1 - 0.55 * WX.fog) * (1 - WX.storm) * (1 - U.clamp(WX.snow * 2)));
        c.fillStyle = U.rgba(dc, 0.94); c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
        c.strokeStyle = U.rgba(gc, 0.45); c.lineWidth = 1.1 * LWU; c.beginPath();
        for (let i = 0; i < 16; i++) { const q = i / 16 * TAU + 0.1, r0 = rr * 1.5, r1 = rr * (i % 2 ? 2.1 : 2.9); c.moveTo(x + Math.cos(q) * r0, y + Math.sin(q) * r0); c.lineTo(x + Math.cos(q) * r1, y + Math.sin(q) * r1); }
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  }

  // the land by day: mountains, the city (clear, or drowned in milky fog), the sun on it, snow on the roofs
  function drawDayLand(c, Ls, P, a) {
    const fogK = U.clamp(WX.fog * 1.15), cov = U.smoothstep(0.45, 0.95, WX.cloud);
    blit(c, L.mtnD, a * (1 - 0.92 * fogK));
    if (fogK < 0.995) blit(c, L.cityD, a);
    if (fogK > 0.005) blit(c, L.cityDF, a * fogK);
    const sun = Ls.sun;
    const sunW = U.smoothstep(-0.5, 3, sun.alt) * (1 - 0.85 * cov) * (1 - 0.9 * U.smoothstep(0.1, 0.7, WX.fog)) * (1 - WX.storm);
    if (sunW > 0.01) {
      const sc = qcol(P.sun);
      const side = U.clamp(Math.sin((sun.az - 180) * RAD), -1, 1), high = U.smoothstep(14, 34, sun.alt);
      const ws = [(1 - high) * (1 - side) / 2, (1 - high) * (1 + side) / 2, high];
      [L.sunL, L.sunR, L.sunC].forEach((o, i) => { const w = a * sunW * ws[i]; if (w > 0.01) { tint(o, sc); blit(c, o, w); } });
    }
    if (WX.acc > 0.02) {
      const sa = a * U.smoothstep(0.03, 0.7, WX.acc) * (1 - 0.7 * fogK);
      tint(L.snowG, DSNOWG); blit(c, L.snowG, sa * 0.9);
      tint(L.snowL, C.snow); blit(c, L.snowL, sa * 0.85);
    }
    // golden hour: the whole land warms (a multiply, so the blues go first)
    const gold = U.smoothstep(20, 5, sun.alt) * U.smoothstep(-4, 1, sun.alt) * (1 - 0.8 * cov) * (1 - 0.8 * WX.fog);
    if (gold > 0.01) {
      const y0 = V.hz - 0.2 * H, g = c.createLinearGradient(0, y0, 0, V.hz - 0.06 * H);
      g.addColorStop(0, "rgba(255,196,140,0)"); g.addColorStop(1, "rgba(255,196,140,1)");
      c.globalCompositeOperation = "multiply"; c.globalAlpha = U.clamp(a * 0.55 * gold); c.fillStyle = g;
      c.fillRect(V.x0, y0, V.span, V.sill - y0 + 2); c.globalCompositeOperation = "source-over";
    }
    // a dull or a low-sun day dims the land a little
    const dim = (1 - P.k) * 0.55 + 0.14 * cov + 0.12 * WX.rain + 0.32 * WX.storm + 0.18 * WX.snow;
    if (dim > 0.01) { c.globalAlpha = U.clamp(a * dim); c.fillStyle = "rgb(4,6,12)"; c.fillRect(V.x0, V.hz - 0.004 * H, V.span, V.sill - V.hz + 0.004 * H + 2); }
    c.globalAlpha = 1;
  }

  // behind the work face (and through the exhale) the day view comes from one cached composite, so its faint
  // layers do not show through one another; rebuilt when the sun or the weather has moved, at most twice a second
  function dayComposite(Ls, P, t) {
    if (!L.dv) { L.dv = layer(V.bx, V.by, V.bw, V.bh); L.dvKey = ""; L.dvT = -9; }
    const key = [Math.round(Ls.sun.alt * 2), Math.round(Ls.sun.az / 2)].concat(["cloud", "fog", "rain", "storm", "snow", "acc"].map((n) => Math.round(WX[n] * 25))).join("|");
    if (key !== L.dvKey && (!L.dvKey || t - L.dvT > 0.5 || t < L.dvT)) {
      const c = L.dv.c;
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over"; c.clearRect(0, 0, L.dv.cv.width, L.dv.cv.height); c.restore();
      c.save(); c.beginPath(); archPath(c, 0, V.sill + 1); c.clip();
      drawDaySkyT(c, Ls, P, 1, 0); drawDayLand(c, Ls, P, 1);
      c.restore();
      L.dvKey = key; L.dvT = t;
    }
    return L.dv;
  }

  // the sun's glitter on the river, in a column under it
  function drawSunGlitter(ctx, f, Ls, P, a) {
    const G = L.rgrid, sun = Ls.sun;
    if (!G || a <= 0.01 || sun.alt < -0.5) return;
    const x0 = skyX(sun.az);
    if (x0 < V.x0 || x0 > V.x1) return;
    const vis = (x, y) => { const i = Math.floor((x - V.bx) / G.cell), j = Math.floor((y - V.by) / G.cell); return i >= 0 && j >= 0 && i < G.gw && j < G.gh && G.grid[j * G.gw + i] === 1; };
    const t = f.t, k = a * (1 - 0.6 * WX.rain) * U.smoothstep(-0.5, 4, sun.alt);
    ctx.fillStyle = U.rgba(U.safe(U.mix(P.glow, U.hex("#dcc896"), 0.4)), 0.6 * k); ctx.beginPath();
    for (let y = V.hz + 2; y < V.sill; y += 2.4) {
      const spread = 0.006 * V.span + (y - V.hz) * 0.07;
      for (let q = 0; q < 2; q++) {
        const n1 = U.noise2(y * 0.31 + q * 9, t * 0.9 + q * 3), x = x0 + n1 * spread * 1.6;
        if (!vis(x, y) || Math.abs(n1) > 0.55) continue;
        const w = (1.5 + 3 * (1 - Math.abs(n1))) * (0.6 + (y - V.hz) / H);
        ctx.rect(x - w / 2, y, w, 0.9 * LWU);
      }
    }
    ctx.fill();
  }

  // boats working the river: hulls and sails on the near reaches, where the water is seen
  function drawBoats(ctx, f, P, a) {
    const RS = L.RS, G = L.rgrid;
    if (a <= 0.01 || !RS || !G) return;
    if (!L.boatI) { L.boatI = []; for (let i = 0; i < RS.length; i++) if (RS[i][1] < 9.5 && RS[i][1] > 2.75) L.boatI.push(i); }
    const idx = L.boatI, n = idx.length;
    if (n < 4) return;
    const vis = (x, y) => { const i = Math.floor((x - V.bx) / G.cell), j = Math.floor((y - V.by) / G.cell); return i >= 0 && j >= 0 && i < G.gw && j < G.gh && G.grid[j * G.gw + i] === 1; };
    const t = f.t, sailC = U.mix(U.hex("#a89c7c"), P.sun, 0.25);
    for (let b = 0; b < 4; b++) {
      // each plies its own stretch, up and back, a sample every half minute or so
      const span = n - 1, ph = (t / (260 + 70 * b) + b * 0.37) % 2, u = ph < 1 ? ph : 2 - ph;
      const s = U.clamp(0.08 + 0.84 * ((u + b * 0.23) % 1)) * span, i = Math.floor(s), fr = s - i;
      const A = RS[idx[i]], B = RS[idx[Math.min(span, i + 1)]];
      const X = U.lerp(A[0], B[0], fr) + A[2] * riverW(A[1]) * (b % 2 ? 0.18 : -0.18), Z = U.lerp(A[1], B[1], fr) + A[3] * riverW(A[1]) * (b % 2 ? 0.18 : -0.18);
      const x = PX(X, Z), y = PY(0, Z);
      if (!vis(x, y + 1)) continue;
      const k = V.f / (Z - V.cz), Lh = 0.05 * k, dir = (B[0] - A[0]) * (ph < 1 ? 1 : -1) >= 0 ? 1 : -1, hz = hazeAt(Z);
      const fade = a * (1 - 0.7 * hz);
      ctx.fillStyle = U.rgba(U.mix(U.hex("#2c221a"), DHAZE, hz * 0.8), 0.95 * fade);
      ctx.beginPath(); ctx.moveTo(x - Lh / 2, y - Lh * 0.1); ctx.lineTo(x + Lh / 2, y - Lh * 0.1); ctx.lineTo(x + Lh * 0.36, y + Lh * 0.06); ctx.lineTo(x - Lh * 0.36, y + Lh * 0.06); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = U.rgba(DINK, 0.8 * fade); ctx.lineWidth = Math.max(0.8, 0.9 * LWU); ctx.beginPath(); ctx.moveTo(x, y - Lh * 0.1); ctx.lineTo(x, y - Lh * 1.0); ctx.stroke();
      ctx.fillStyle = U.rgba(U.safe(U.mix(sailC, DHAZE, hz * 0.7)), 0.92 * fade);
      ctx.beginPath(); ctx.moveTo(x + dir * Lh * 0.04, y - Lh * 0.98); ctx.quadraticCurveTo(x + dir * Lh * 0.42, y - Lh * 0.5, x + dir * Lh * 0.4, y - Lh * 0.16); ctx.lineTo(x + dir * Lh * 0.04, y - Lh * 0.16); ctx.closePath(); ctx.fill();
      // its wake
      ctx.strokeStyle = `rgba(150,176,204,${(0.35 * fade).toFixed(3)})`; ctx.lineWidth = 0.8 * LWU; ctx.beginPath();
      ctx.moveTo(x - dir * Lh * 0.45, y + Lh * 0.05); ctx.lineTo(x - dir * Lh * 1.3, y + Lh * 0.12); ctx.stroke();
    }
  }

  // banners on the spires: swallowtail pennants streaming in the wind
  const BANNER = [U.hex("#962428"), U.hex("#283e96"), U.hex("#b89034"), U.hex("#246848")];
  function drawBanners(ctx, f, a) {
    if (a <= 0.01 || !CITY.spires) return;
    const t = f.t, wind = U.clamp((WX.wind || 6) / 30, 0.25, 1.2);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    CITY.spires.forEach(([X, Y, Z], i) => {
      const x = PX(X, Z), y = PY(Y, Z), k = V.f / (Z - V.cz), hz = hazeAt(Z);
      if (!inOpening(x, y - 0.06 * k, 2)) return;
      const pole = 0.055 * k, len = 0.075 * k * (0.7 + 0.3 * wind), wd = 0.024 * k, fade = a * (1 - 0.55 * hz) * (1 - 0.8 * WX.fog);
      ctx.strokeStyle = U.rgba(DINK, 0.85 * fade); ctx.lineWidth = Math.max(0.8, 0.8 * LWU);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - pole); ctx.stroke();
      const top = y - pole, pts = [];
      for (let q = 0; q <= 6; q++) { const u = q / 6; pts.push([x + u * len, top + Math.sin(t * (2.2 + wind) - u * 4.5 + i) * wd * 0.35 * u * wind]); }
      ctx.fillStyle = U.rgba(U.safe(U.mix(BANNER[i % BANNER.length], DHAZE, hz * 0.6)), 0.95 * fade);
      ctx.beginPath(); ctx.moveTo(x, top);
      for (const p of pts) ctx.lineTo(p[0], p[1] - wd * 0.5 * (1 - 0.6 * (p[0] - x) / len));
      const tail = pts[6]; ctx.lineTo(tail[0] - len * 0.18, tail[1]);
      for (let q = 6; q >= 0; q--) { const p = pts[q]; ctx.lineTo(p[0], p[1] + wd * 0.5 * (1 - 0.6 * (p[0] - x) / len)); }
      ctx.closePath(); ctx.fill();
    });
  }

  // birds: a loose skein drifting across the window, wings beating now and then
  function drawBirds(ctx, f, a) {
    if (a <= 0.01) return;
    const t = f.t, s = 0.006 * H, span = V.span * 1.3;
    ctx.strokeStyle = U.rgba(DINK, 0.75 * a); ctx.lineWidth = 1.1 * LWU; ctx.lineCap = "round"; ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const x = V.x0 - 0.15 * V.span + ((t * (9 + i * 0.6) * (V.span / 1100) + i * 37 + (i % 3) * 61) % span);
      const y = V.apex + (0.3 + 0.03 * ((i * 5) % 7) + 0.05 * Math.sin(t * 0.05 + i)) * (V.hz - V.apex);
      if (!inOpening(x, y, 4)) continue;
      const beat = Math.sin(t * 6 + i * 1.7), w = 0.25 + 0.4 * (0.5 + 0.5 * beat) * (Math.sin(t * 0.4 + i) > 0 ? 1 : 0.3);
      ctx.moveTo(x - s, y - s * w); ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.12, x, y); ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.12, x + s, y - s * w);
    }
    ctx.stroke();
  }

  // ------------------------------------------------------------------ work: the arcanist's desk
  function sunMark(ctx, x, y, r, col, a) {
    const c = U.safe(col);
    ctx.strokeStyle = U.rgba(c, a); ctx.lineWidth = 1.3 * LWU; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.fillStyle = U.rgba(c, a * 0.9); ctx.beginPath(); ctx.arc(x, y, r * 0.32, 0, TAU); ctx.fill();
    ctx.lineWidth = 1.1 * LWU; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const q = i / 8 * TAU; ctx.moveTo(x + Math.cos(q) * r * 1.45, y + Math.sin(q) * r * 1.45); ctx.lineTo(x + Math.cos(q) * r * (i % 2 ? 1.8 : 2.1), y + Math.sin(q) * r * (i % 2 ? 1.8 : 2.1)); }
    ctx.stroke();
  }
  function moonMark(ctx, x, y, r, illum, waxing, col, a) {
    const c = U.safe(col);
    ctx.strokeStyle = U.rgba(c, a * 0.6); ctx.lineWidth = 1.1 * LWU; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    if (illum < 0.02) return;
    const k = 1 - 2 * illum, sg = waxing ? 1 : -1;
    ctx.fillStyle = U.rgba(c, a * 0.85); ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, sg < 0);
    ctx.ellipse(x, y, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === (sg > 0));
    ctx.fill();
  }
  function drawWork(ctx, f, b, S, A, ov) {
    const fo = (bb, a0, a1) => fadeOut(bb, a0, a1) * ov;
    const now = f.now, t = f.t;
    // date under the clock, a rule with a lozenge
    const dA = fo(b, 0.12, 0.42);
    if (dA > 0.01) {
      const ds = `${now.toLocaleDateString("en-CA", { weekday: "long" })}  ·  ${now.getDate()} ${now.toLocaleDateString("en-CA", { month: "long" })}`.toUpperCase();
      const y = 0.475 * H - (1 - dA / ov) * 0.02 * H;
      text(ctx, ds, V.cx, y, { px: Math.max(14, 0.024 * H), spacing: 0.26, color: C.steelMid, glow: 4, core: 0.85 }, "center", 1, dA * 0.9);
      const ry = y + 0.034 * H, rw = 0.14 * V.span * (0.6 + 0.4 * dA / ov), c = U.safe(C.steelDim), k = 0.006 * H;
      ctx.strokeStyle = U.rgba(c, 0.6 * dA); ctx.lineWidth = 1 * LWU; ctx.beginPath();
      ctx.moveTo(V.cx - rw, ry); ctx.lineTo(V.cx - k * 2, ry); ctx.moveTo(V.cx + k * 2, ry); ctx.lineTo(V.cx + rw, ry);
      ctx.moveTo(V.cx, ry - k); ctx.lineTo(V.cx + k, ry); ctx.lineTo(V.cx, ry + k); ctx.lineTo(V.cx - k, ry); ctx.closePath(); ctx.stroke();
    }
    // calendar: NEXT · TITLE · in N min
    const next = S.calendar && S.calendar.next;
    if (next) {
      const cA = fo(b, 0.06, 0.34), mins = next.minutesUntil, soon = U.smoothstep(20, 5, mins);
      if (cA > 0.01) {
        const y = 0.565 * H - (1 - cA / ov) * 0.03 * H, px = 0.034 * H;
        const when = mins < 1 ? "now" : `in ${U.fmtMinutes(mins)}`;
        const s1 = sprite("NEXT", { px: px * 0.62, spacing: 0.3, color: C.steelDim, glow: 3, core: 0.85 });
        const s2 = sprite(String(next.title).toUpperCase(), { px, spacing: 0.16, color: C.steel, glow: 7, core: 0.9 });
        const s3 = sprite(when, { px: px * 0.95, style: "italic", color: soon > 0.5 ? C.steel : C.steelMid, glow: 6, core: 0.9 });
        const gap = px * 0.9, tot = s1.tw + s2.tw + s3.tw + gap * 4;
        let x = V.cx - tot / 2;
        drawSprite(ctx, s1, x, y + px * 0.05, "left", 1, cA * 0.85); x += s1.tw + gap;
        ctx.fillStyle = U.rgba(U.safe(C.steelDim), 0.8 * cA); ctx.beginPath(); ctx.arc(x, y, 2 * LWU, 0, TAU); ctx.fill(); x += gap;
        drawSprite(ctx, s2, x, y, "left", 1, cA); x += s2.tw + gap;
        ctx.beginPath(); ctx.arc(x, y, 2 * LWU, 0, TAU); ctx.fill(); x += gap;
        drawSprite(ctx, s3, x, y, "left", 1, cA * (0.85 + 0.15 * soon));
      }
    }
    // weather sliver
    const wx = S.weather;
    if (wx && wx.actionable) {
      const wA = fo(b, 0.04, 0.3);
      const s = wx.tempC != null ? `${wx.actionable}  ·  ${Math.round(wx.tempC)}°` : wx.actionable;
      if (wA > 0.01) text(ctx, s, V.cx, 0.615 * H - (1 - wA / ov) * 0.03 * H, { px: 0.026 * H, style: "italic", color: C.steelMid, glow: 4, core: 0.85 }, "center", 1, wA * 0.85);
    }
    // daylight: a sun/moon arc, the light left beneath it
    const dl = S.daylight, dlA = fo(b, 0.1, 0.4);
    if (dl && dl.sunrise && dl.sunset && dlA > 0.01) {
      const cx = V.cx - 0.27 * V.span - NEWS_ROOM * H * NK, cy = 0.69 * H + (1 - dlA / ov) * 0.02 * H, R = 0.058 * H;
      const sc = U.safe(C.steel), mc = U.safe(C.steelMid), dc = U.safe(C.steelDim);
      ctx.lineCap = "round";
      ctx.strokeStyle = U.rgba(dc, 0.55 * dlA); ctx.lineWidth = 1 * LWU;
      ctx.beginPath(); ctx.moveTo(cx - R * 1.3, cy); ctx.lineTo(cx + R * 1.3, cy); ctx.stroke();
      ctx.strokeStyle = U.rgba(mc, 0.4 * dlA); ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, TAU); ctx.stroke();
      const span = dl.sunset - dl.sunrise, p = U.clamp((now - dl.sunrise) / span);
      if (dl.isDay) {
        ctx.strokeStyle = U.rgba(sc, 0.18 * dlA); ctx.lineWidth = 5 * LWU; ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI + p * Math.PI, TAU); ctx.stroke();
        ctx.strokeStyle = U.rgba(sc, 0.85 * dlA); ctx.lineWidth = 2 * LWU; ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI + p * Math.PI, TAU); ctx.stroke();
        sunMark(ctx, cx - Math.cos(p * Math.PI) * R, cy - Math.sin(p * Math.PI) * R, 0.008 * H, C.steel, 0.95 * dlA);
      } else {
        // the night as a dashed arc below the line; the moon (its real phase) rides it
        let rise = dl.sunrise.getTime(); if (rise < now.getTime()) rise += 86400000;
        let set = dl.sunset.getTime(); if (set > now.getTime()) set -= 86400000;
        const q = U.clamp((now.getTime() - set) / (rise - set));
        ctx.setLineDash([2 * LWU, 5 * LWU]); ctx.strokeStyle = U.rgba(mc, 0.45 * dlA); ctx.beginPath(); ctx.arc(cx, cy, R * 0.8, 0, Math.PI); ctx.stroke(); ctx.setLineDash([]);
        moonMark(ctx, cx + Math.cos(q * Math.PI) * R * 0.8, cy + Math.sin(q * Math.PI) * R * 0.8, 0.009 * H, A.illum, A.waxing, C.steel, 0.9 * dlA);
      }
      const lp = Math.max(12, 0.016 * H);
      text(ctx, U.fmtTime(dl.sunrise), cx - R * 1.3, cy + lp * 1.1, { px: lp, color: C.steelDim, glow: 2, core: 0.85 }, "center", 1, dlA * 0.85);
      text(ctx, U.fmtTime(dl.sunset), cx + R * 1.3, cy + lp * 1.1, { px: lp, color: C.steelDim, glow: 2, core: 0.85 }, "center", 1, dlA * 0.85);
      let big, cap;
      if (dl.isDay && dl.lightLeftMin != null) { big = U.fmtMinutes(dl.lightLeftMin); cap = "OF LIGHT LEFT"; }
      else { let rise = dl.sunrise.getTime(); if (rise < now.getTime()) rise += 86400000; big = U.fmtMinutes((rise - now.getTime()) / 60000); cap = "UNTIL SUNRISE"; }
      text(ctx, big, cx, cy + 0.05 * H, { px: 0.034 * H, color: C.steel, glow: 6, core: 0.9 }, "center", 1, dlA * (dl.isDay ? 0.95 : 0.75));
      text(ctx, cap, cx, cy + 0.083 * H, { px: lp * 0.95, spacing: 0.3, color: C.steelMid, glow: 2, core: 0.8 }, "center", 1, dlA * 0.8);
    }
    // the ledger: net, made and spent, a balance rule, an alchemical mood mark
    const fin = S.finances, fA = fo(b, 0.0, 0.28);
    if (fin && fA > 0.01 && fin.income != null && fin.spent != null) {
      const mood = fin.mood || "calm", warn = mood === "warning", drift = mood === "drift";
      const pulse = warn ? 0.8 + 0.2 * Math.sin(t * 2.2) : 1;
      const mc = warn ? C.alarm : drift ? U.mix(C.steelMid, C.straw, 0.75) : C.steelMid;
      const x = V.cx + 0.27 * V.span + NEWS_ROOM * H * NK, y = 0.668 * H + (1 - fA / ov) * 0.03 * H;
      const net = fin.net != null ? fin.net : fin.income - fin.spent;
      const ns = sprite(U.fmtMoney(net, { sign: true }), { px: 0.042 * H, color: warn ? C.alarm : drift ? mc : C.steel, glow: warn ? 10 : 7, core: 0.9 });
      const gx = x - ns.tw / 2 - 0.028 * H, gy = y, gr = 0.012 * H, gc = U.safe(mc);
      drawSprite(ctx, ns, x + 0.014 * H, y, "center", 1, fA * pulse);
      // mood: sol (calm), luna (drift), ignis (warning)
      ctx.strokeStyle = U.rgba(gc, 0.85 * fA * pulse); ctx.fillStyle = U.rgba(gc, 0.85 * fA * pulse); ctx.lineWidth = 1.3 * LWU;
      ctx.beginPath();
      if (warn) { ctx.moveTo(gx, gy - gr * 1.1); ctx.lineTo(gx + gr, gy + gr * 0.75); ctx.lineTo(gx - gr, gy + gr * 0.75); ctx.closePath(); ctx.stroke(); }
      else if (drift) { ctx.arc(gx, gy, gr, -Math.PI / 2, Math.PI / 2, true); ctx.arc(gx + gr * 0.45, gy, gr * 0.85, Math.PI / 2, -Math.PI / 2, false); ctx.stroke(); }
      else { ctx.arc(gx, gy, gr, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(gx, gy, gr * 0.22, 0, TAU); ctx.fill(); }
      const lp = Math.max(12, 0.018 * H);
      text(ctx, `${U.fmtMoney(fin.income)} made  ·  ${U.fmtMoney(fin.spent)} spent`, x, y + 0.043 * H, { px: lp, color: C.steelMid, glow: 3, core: 0.85 }, "center", 1, fA * 0.85);
      // balance rule: made as the full line, spent along it
      const bw = 0.2 * V.span, by = y + 0.068 * H, ratio = fin.income > 0 ? fin.spent / fin.income : 1;
      ctx.strokeStyle = U.rgba(U.safe(C.steelDim), 0.6 * fA); ctx.lineWidth = 1 * LWU;
      ctx.beginPath(); ctx.moveTo(x - bw / 2, by); ctx.lineTo(x + bw / 2, by); ctx.moveTo(x - bw / 2, by - 4); ctx.lineTo(x - bw / 2, by + 4); ctx.moveTo(x + bw / 2, by - 4); ctx.lineTo(x + bw / 2, by + 4); ctx.stroke();
      ctx.strokeStyle = U.rgba(gc, 0.85 * fA * pulse); ctx.lineWidth = 2.4 * LWU;
      ctx.beginPath(); ctx.moveTo(x - bw / 2, by); ctx.lineTo(x - bw / 2 + bw * Math.min(1, ratio), by); ctx.stroke();
      if (ratio > 1) { ctx.strokeStyle = U.rgba(U.safe(C.alarm), 0.95 * fA * pulse); ctx.beginPath(); ctx.moveTo(x + bw / 2, by); ctx.lineTo(x + bw / 2 + Math.min(0.25, ratio - 1) * bw, by); ctx.stroke(); }
      if (fin.lastUpdated) {
        const h = (now - fin.lastUpdated) / 3600000;
        const ago = h >= 1 && h < 48 ? `${Math.round(h)} h ago` : U.fmtAgo(fin.lastUpdated, now);
        text(ctx, `updated ${ago}`, x, by + 0.024 * H, { px: lp * 0.9, style: "italic", color: C.steelDim, glow: 2, core: 0.85 }, "center", 1, fA * 0.8);
      }
    }
    // hosts: small ward-rune sigils along the sill, labelled
    const hb = Array.isArray(S.heartbeat) ? S.heartbeat : [];
    const hA = fo(b, 0.08, 0.38);
    if (hb.length && hA > 0.01) {
      const n = hb.length, gap = Math.min(0.16 * V.span, 0.8 * V.span / n), x0 = V.cx - gap * (n - 1) / 2, y = 0.868 * H + (1 - hA / ov) * 0.02 * H;
      hb.forEach((h, i) => {
        const down = !h.up, x = x0 + i * gap, r = 0.018 * H;
        const col = U.safe(down ? C.alarm : C.steelMid);
        if (down) {
          const ph = (t % 1.8) / 1.8;
          ctx.strokeStyle = U.rgba(col, 0.55 * hA * (1 - ph)); ctx.lineWidth = 1.3 * LWU; ctx.beginPath(); ctx.arc(x, y, r * (1 + ph * 1.9), 0, TAU); ctx.stroke();
          ctx.globalAlpha = U.clamp(0.3 * hA * (0.7 + 0.3 * Math.sin(t * 3.4))); ctx.drawImage(glow(col), x - r * 3, y - r * 3, r * 6, r * 6); ctx.globalAlpha = 1;
        }
        const k = down ? 0.75 + 0.25 * Math.sin(t * 3.4) : 0.85;
        ctx.strokeStyle = U.rgba(col, 0.16 * hA); ctx.lineWidth = 4 * LWU; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
        ctx.strokeStyle = U.rgba(col, 0.85 * hA * k); ctx.lineWidth = 1.2 * LWU; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
        ctx.beginPath(); runePath(ctx, runeFor(h.host), x, y, r * 1.05); ctx.lineCap = "round"; ctx.lineWidth = 1.3 * LWU; ctx.stroke();
        const lp = Math.max(12, 0.017 * H);
        text(ctx, String(h.host).toUpperCase(), x, y + r + lp * 1.1, { px: lp, spacing: 0.25, color: down ? C.alarm : C.steelDim, glow: down ? 6 : 2, core: 0.85 }, "center", 1, hA * (down ? 1 : 0.85));
        if (down) {
          const since = h.downSince ? `down ${U.fmtMinutes((now - h.downSince) / 60000)}` : "down";
          text(ctx, since, x, y + r + lp * 2.45, { px: lp * 1.05, style: "italic", color: C.alarm, glow: 5, core: 0.9 }, "center", 1, hA);
        }
      });
    }
  }

  // ------------------------------------------------------------------ news: the arcanist's dispatch
  // Centred in the arch between the sun-arc and the ledger: the headline in the desk's serif, one line (two for a
  // long one), cut at a word with the real font's width, and beneath it the sender and the hour in small italic.
  // Critical = the desk's alarm: a ward-rune flares above it with a slow ripple, the lines turn ember on a slow
  // pulse. Ambient: gone; a critical dispatch whispers once, faintly, beside the brass plate.
  let DK = 0; // frame.day this frame (0 at night)
  let OV = 1; // the overlay dimming this frame: HUD alphas carry it, their drift (alpha / OV) does not
  const NEWS_ROOM = 0.05;  // how far (in H) the sun-arc and the ledger step aside for a dispatch
  let NK = -1;             // eased 0..1: is there a dispatch on the desk (-1 = not yet known)
  const newsAge = (pub, now) => {
    const m = Math.max(0, (now - pub) / 60000);
    if (m < 60) return `${Math.max(1, Math.round(m))} min`;
    const h = m / 60;
    return h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`;
  };
  function fitCtx(o) {
    if (!mctx) mctx = document.createElement("canvas").getContext("2d");
    mctx.font = `${o.style || ""} 400 ${Math.round(o.px)}px ${SERIF}`;
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
  // laid out only when the item, its age (once a minute) or the screen changes; the strings then hit the sprite cache
  const NL = { key: "", lines: [], src: "", whisper: "", oHead: null, oSrc: null, oWh: null };
  function newsLayout(n, now) {
    const pub = n.published instanceof Date ? n.published : new Date(n.published);
    const age = isNaN(pub) ? "" : newsAge(pub, now), crit = !!n.critical;
    const key = `${n.headline}|${n.source || ""}|${age}|${crit ? 1 : 0}|${W}x${H}`;
    if (NL.key === key) return NL;
    NL.key = key;
    const head = String(n.headline).replace(/\s+/g, " ").trim();
    NL.oHead = { px: 0.026 * H, color: crit ? C.alarm : C.steel, glow: crit ? 7 : 5, core: 0.88 };
    NL.oSrc = { px: Math.max(12, 0.018 * H), style: "italic", color: crit ? C.rose : C.steelDim, glow: crit ? 4 : 2, core: 0.85 };
    NL.oWh = { px: 0.024 * H, style: "italic", color: C.rose, glow: 4, core: 0.8 };
    // the room between the daylight arc's labels and the ledger
    const colW = Math.max(0.28 * H, 2 * (0.27 * V.span + NEWS_ROOM * H - 0.125 * H));
    NL.lines = wrap2(head, colW, fitCtx(NL.oHead));
    const src = [n.source, age].filter(Boolean).join("  ·  ");
    NL.src = src ? U.ellipsize(src, colW, fitCtx(NL.oSrc)) : "";
    NL.whisper = crit ? U.ellipsize(head, 0.42 * H, fitCtx(NL.oWh)) : "";
    if (spacingOk(mctx)) mctx.letterSpacing = "0px";
    return NL;
  }
  function drawNews(ctx, f, a) {
    const n = f.signals.news;
    if (!n || !n.headline || a <= 0.01) return;
    const L = newsLayout(n, f.now), crit = !!n.critical, t = f.t;
    const two = L.lines.length > 1, x = V.cx, drift = (1 - a / OV) * 0.03 * H;
    const y0 = (two ? 0.689 : 0.705) * H - drift, lh = 0.034 * H;
    const pulse = crit ? 0.8 + 0.2 * Math.sin(t * TAU / 3.6) : 1;
    if (crit) {
      // algiz, the warding rune, flares above the dispatch
      const ry = y0 - 0.042 * H, s = 0.016 * H, col = U.safe(C.alarm), ph = (t % 3.6) / 3.6;
      ctx.strokeStyle = U.rgba(col, 0.45 * a * (1 - ph)); ctx.lineWidth = 1.1 * LWU;
      ctx.beginPath(); ctx.arc(x, ry, s * (0.9 + ph * 2.4), 0, TAU); ctx.stroke();
      ctx.globalAlpha = U.clamp(0.32 * a * pulse); ctx.drawImage(glow(col), x - s * 3, ry - s * 3, s * 6, s * 6); ctx.globalAlpha = 1;
      ctx.beginPath(); runePath(ctx, RUNES[1], x, ry, s);
      ctx.lineCap = "round"; ctx.strokeStyle = U.rgba(col, 0.9 * a * pulse); ctx.lineWidth = 1.4 * LWU; ctx.stroke();
    }
    for (let i = 0; i < L.lines.length; i++) text(ctx, L.lines[i], x, y0 + i * lh, L.oHead, "center", 1, a * (crit ? 0.95 : 0.85) * pulse);
    if (L.src) text(ctx, L.src, x, y0 + (L.lines.length - 1) * lh + 0.036 * H, L.oSrc, "center", 1, a * (crit ? 0.85 * pulse : 0.8));
  }
  // ambient: a critical dispatch whispers once, faintly, beside the plate (the calendar whispers on the other side)
  function drawNewsWhisper(ctx, f, a) {
    const n = f.signals.news;
    if (!n || !n.headline || !n.critical || a <= 0.01) return;
    const L = newsLayout(n, f.now);
    text(ctx, L.whisper, V.cx + 0.27 * H, V.plateY, L.oWh, "left", 1, a * 0.42 * (0.85 + 0.15 * Math.sin(f.t * TAU / 9)));
  }

  // ------------------------------------------------------------------ the shared info overlay, in the tower's voice
  // Work: the desk's serif in silver-blue, spaced caps for labels. Ambient: gilt and brass, the plate's double rule.
  const OVS = { k: -1, v: null };
  function overlayStyle(f) {
    const b = U.clamp(f.blend || 0), k = Math.round(b * 32) / 32;
    if (OVS.k === k && OVS.v) return OVS.v;
    const m = (w, a) => U.safe(U.mix(w, a, k));
    OVS.k = k;
    OVS.v = {
      font: SERIF,
      ink: m(C.steel, C.gilt), dim: m(C.steelDim, C.brass), accent: m(C.rune, C.teal),
      alarm: m(C.alarm, C.ward), glow: U.lerp(0.6, 0.45, k), rule: k < 0.5 ? "hairline" : "double", caps: true,
    };
    return OVS.v;
  }

  // ------------------------------------------------------------------ now playing: the bard's ballad
  // Work: one small line under the ward sigils, "title — artist" in the desk's italic, a hairline of progress beneath,
  // a little note mark before it (two bars, dimmed, when paused) and, if the track has art, a small thumbnail inked in
  // silver-blue. Ambient: the ballad whispered in the brass plate's lower margin, "♪ title — artist" in faint brass
  // italic (the gilt clock rises a hair to make room). Fitted once per track and size; the strings are cached sprites.
  let NPK = -1;        // eased 0..1: is something playing (-1 = not yet known)
  let npHold = null;   // the last track, kept while the line fades out
  const npLays = new Map();
  const npClean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  function npFit(np, o, maxW, prefix) {
    const key = `${np.title}|${np.artist || ""}|${prefix}|${Math.round(o.px)}|${o.style || ""}|${Math.round(maxW)}`;
    let s = npLays.get(key);
    if (s !== undefined) return s;
    if (npLays.size > 8) npLays.clear();
    const c = fitCtx({ px: o.px, style: o.style, spacing: 0 });
    const m = (x) => c.measureText(x).width, sep = " — ";
    const title = npClean(np.title), artist = npClean(np.artist), room = maxW - (prefix ? m(prefix) : 0);
    let line;
    if (!artist) line = U.ellipsize(title, room, c);
    else if (m(title + sep + artist) <= room) line = title + sep + artist;
    else {
      // too long: the artist keeps at most ~40% of the line, the title takes the rest
      const a = m(sep + artist) <= room * 0.4 ? artist : U.ellipsize(artist, room * 0.4 - m(sep), c);
      line = U.ellipsize(title, room - m(sep + a), c) + sep + a;
    }
    s = (prefix || "") + line;
    npLays.set(key, s);
    return s;
  }
  // album art: loaded once per URL (same origin), a failed load is remembered and never drawn; baked at the drawn
  // size as a duotone in the desk's ink (multiplied, so it can never reach white)
  const arts = new Map();
  function artThumb(url, size, tintC) {
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
    const key = `${Math.round(size)}|${colKey(tintC)}|${dpr}`;
    if (e.key !== key) {
      try {
        const o = mk(size, size), c = o.c, im = e.img, iw = im.naturalWidth, ih = im.naturalHeight, q = Math.min(iw, ih);
        c.drawImage(im, (iw - q) / 2, (ih - q) / 2, q, q, 0, 0, size, size);
        c.globalCompositeOperation = "saturation"; c.fillStyle = "#000"; c.fillRect(0, 0, size, size);
        c.globalCompositeOperation = "multiply"; c.fillStyle = U.rgba(U.safe(tintC), 1); c.fillRect(0, 0, size, size);
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
  // The view as sound (THEMES.md "Sound"): wind at the height of the tower, the city far below (busier by day,
  // quietening as the amber windows go dark after midnight), and by night the ward's soft hum (the magic layer),
  // swelling a little as the ripple runs down the dome and as the spell-lights come on. Birds by day, rain from the
  // weather. Cues follow what is seen: thunder on the flash (lagging by the strike's distance) and a crackle of
  // chimes when it lands on the ward, the cathedral striking the hour (07:00 - 22:00) and a few deeper bells at dusk,
  // a sparkling chime as the comet appears, now and then a soft chime as an arcane window lights, a rare owl.
  // (The city layer is kept at or under 0.15: above that the engine adds far car horns, which this city has none of.)
  const sstep = (a, b2, x) => U.smoothstep(a, b2, x);
  const numOr = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
  let EV = 0, LITF = 0;  // the evening's clock and the share of the city's lights that are on (from render)
  function soundscape(f) {
    const w = (f.signals && f.signals.weather) || {};
    const cond = w.condition || "clear", I = U.clamp(numOr(w.intensity, 0.5)), wind = numOr(w.windKph, 6), T = numOr(w.tempC, 12);
    const day = U.clamp(f.day || 0), night = 1 - day;
    const rain = cond === "rain" ? 0.2 + 0.8 * I : cond === "storm" ? 0.8 + 0.2 * I : 0;
    const wet = U.clamp(rain * 1.3), snow = cond === "snow" ? 1 : 0, fog = cond === "fog" ? 1 : 0;
    const gusts = 0.85 * sstep(6, 55, wind) + (cond === "storm" ? 0.15 : 0) + 0.06 * snow;
    const late = sstep(4 * 3600, 8 * 3600, EV) * night;
    const city = (0.08 + 0.07 * day) * (1 - 0.4 * late) * (1 - 0.35 * fog) * (1 - 0.3 * snow) * (1 - 0.3 * wet);
    const rp = (f.t % 40) / 14, ripple = rp < 1 ? Math.sin(Math.PI * rp) : 0;
    const magic = night * (0.28 + 0.06 * ripple + 0.08 * U.clamp(LITF * 1.5)) * (1 - 0.25 * fog);
    const birds = 0.3 * day * sstep(4, 9, T) * (1 - 0.85 * wet) * (1 - 0.5 * fog) * (1 - 0.5 * sstep(25, 50, wind));
    return {
      wind: U.clamp(Math.max(0.4 * (1 - 0.25 * fog), gusts)),
      city: Math.min(0.15, city),
      magic,
      birds,
      rain,
    };
  }
  // cue state: reset whenever sound is off, so turning it on never fires a stale event
  const SFX = { live: false, hour: -1, ms: 0, day: 0, bolt: -1, comet: -1, ev: 0, owlAt: 0, chimeAt: 0, lt: null, wins: null, wi: 0 };
  const expo = (mean) => -Math.log(1 - Math.random()) * mean;
  // the arcane windows that chime as they light: the most prominent few (rare), sorted by when they light
  function chimeWindows() {
    const LT = L.lt;
    if (!LT) return null;
    if (SFX.lt === LT) return SFX.wins;
    const ids = [];
    for (const k of [2, 3]) if (LT.start[k] >= 0) for (let i = LT.start[k]; i < LT.end[k]; i++) ids.push(i);
    ids.sort((a, b2) => LT.s[b2] - LT.s[a]);
    const pick = ids.slice(0, 18).sort((a, b2) => LT.on[a] - LT.on[b2]);
    SFX.lt = LT;
    SFX.wins = { at: pick.map((i) => LT.on[i] + 0.8), pan: pick.map((i) => U.clamp((LT.x[i] - V.cx) / (V.span / 2), -0.9, 0.9)) };
    SFX.wi = 0;
    return SFX.wins;
  }
  const PENT6 = [1174.66, 1318.51, 1479.98, 1760, 1975.53];
  function sfx(f, Lt, b, Ls, ev) {
    const A = AW.audio;
    if (!A || !A.enabled()) { SFX.live = false; return; }
    const t = f.t, now = f.now, ms = now.getTime(), hour = now.getHours(), day = U.clamp(f.day || 0);
    const C0 = cometPlan(now), cu = (ms - C0.start) / C0.dur;
    const wins = chimeWindows();
    if (!SFX.live) {
      SFX.live = true; SFX.hour = hour; SFX.ms = ms; SFX.day = day; SFX.bolt = Lt ? Lt.seed : -1; SFX.comet = cu; SFX.ev = ev;
      SFX.owlAt = t + 90 + expo(420); SFX.chimeAt = 0;
      if (wins) { SFX.wi = 0; while (SFX.wi < wins.at.length && wins.at[SFX.wi] <= ev) SFX.wi++; }
      return;
    }
    const magicA = U.smoothstep(0.78, 1, b), clearSky = (1 - U.smoothstep(0.5, 0.85, WX.cloud)) * (1 - U.smoothstep(0.3, 0.7, WX.fog));
    // thunder on the flash; on the ward, a crackle of high chimes too
    if (Lt && Lt.seed !== SFX.bolt) {
      SFX.bolt = Lt.seed;
      if (Lt.u < 0.25) {
        const pan = U.clamp((Lt.x - V.cx) / (V.span / 2), -0.9, 0.9);
        A.cue("thunder", { distance: Lt.d, gain: 0.55 + 0.45 * WX.storm, pan });
        if (Lt.dome && magicA > 0.3) A.cue("chime", { notes: 3, freq: 2093, gain: 0.45, distance: Lt.d, pan });
      }
    }
    // the cathedral strikes the hour by day and in the evening; at dusk a few deeper bells ring the day out
    const fwd = ms - SFX.ms, steady = fwd > 0 && fwd < 600000;
    if (hour !== SFX.hour) {
      if (steady && now.getMinutes() < 2 && hour >= 7 && hour <= 22) A.cue("distant_bell", { count: hour % 12 || 12, freq: 392, distance: 0.6, gain: 0.85, pan: 0.15 });
      SFX.hour = hour;
    }
    if (steady && SFX.day >= 0.45 && day < 0.45 && hour >= 12) {
      A.cue("distant_bell", { count: 5, freq: 196, distance: 0.62, gain: 1, pan: 0.12 });
      A.cue("distant_bell", { count: 3, freq: 262, distance: 0.8, gain: 0.7, pan: -0.45 });
    }
    SFX.day = day; SFX.ms = ms;
    // the comet: a sparkling chime as it clears the edge of the window
    if (steady && SFX.comet < 0.05 && cu >= 0.05 && cu < 0.2 && magicA > 0.5 && Ls.night > 0.4 && clearSky > 0.3) {
      const xs = C0.dir > 0 ? U.lerp(C0.x0 - 0.05, 0.8 + C0.x0, cu) : U.lerp(1.05 - C0.x0, 0.2 - C0.x0, cu);
      const pan = U.clamp((xs - 0.5) * 1.6, -0.85, 0.85);
      A.cue("chime", { notes: 3, freq: 1318.51, gain: 0.7, distance: 0.45, pan });
      A.cue("chime", { notes: 2, freq: 2637.02, gain: 0.3, distance: 0.6, pan: -pan * 0.5 });
    }
    SFX.comet = cu;
    // an arcane window lights: a soft chime (only the prominent few, at most one every few seconds)
    if (wins) {
      const jump = ev - SFX.ev;
      if (jump < 0 || jump > 5) { SFX.wi = 0; while (SFX.wi < wins.at.length && wins.at[SFX.wi] <= ev) SFX.wi++; }
      else {
        let fire = -1;
        while (SFX.wi < wins.at.length && wins.at[SFX.wi] <= ev) fire = SFX.wi++;
        if (fire >= 0 && t >= SFX.chimeAt && magicA > 0.5 && Ls.dark > 0.5 && WX.fog < 0.6) {
          SFX.chimeAt = t + 4;
          A.cue("chime", { notes: 1, freq: PENT6[(Math.random() * PENT6.length) | 0], gain: 0.35, distance: 0.65, pan: wins.pan[fire] });
        }
      }
    }
    SFX.ev = ev;
    // an owl, rarely, on a dry night
    if (t >= SFX.owlAt) {
      SFX.owlAt = t + 150 + expo(420);
      if (magicA > 0.5 && Ls.dark > 0.6 && WX.rain + WX.storm < 0.3) A.cue("owl", { distance: 0.5 + 0.35 * Math.random(), gain: 0.8, pan: Math.random() < 0.5 ? -0.75 : 0.7 });
    }
  }

  // ------------------------------------------------------------------ theme
  AW.registerTheme({
    id: "tower",
    name: "Wizard's Tower",
    init(ctx, env) { dpr = env.dpr || 1; W = env.width; H = env.height; build(); CAT = AW.cat ? AW.cat.create(47) : null; },
    resize(env) { dpr = env.dpr || 1; W = env.width; H = env.height; build(); },
    destroy() { sprites.clear(); glows.clear(); npLays.clear(); L = {}; built = ""; LC = null; NL.key = ""; OVS.k = -1; NK = -1; NPK = -1; npHold = null; SFX.live = false; SFX.lt = null; },
    overlayStyle,
    soundscape,
    // for testing: when tonight's comet crosses
    cometAt(d) { const P = cometPlan(d || new Date()); return new Date(P.start); },
    creatureAfter(d) { for (let m = d.getTime(); m < d.getTime() + 864e5; m += 5000) { const P = creaturePlan(m); if (P) return new Date(m); } return null; },
    flash() { return FLASH; },

    render(ctx, f) {
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.width, f.height);
      if (f.width !== W || f.height !== H || (f.dpr || 1) !== dpr || !built) {
        dpr = f.dpr || 1; W = f.width; H = f.height; build();
      }
      const b = U.clamp(f.blend), t = f.t, now = f.now, S = f.signals || {};
      const el = f.ambientElapsed || 0;
      const dl = S.daylight;
      // the shared info overlay is up: the desk, the clock and the whispers step back so the panel reads
      const ov = f.overlay ? 1 - 0.7 * U.clamp(+f.overlay.a || 0) : 1;
      OV = ov;
      // the evening's clock: time in ambient, or (after a long weekend) time since sunset
      let ev = el;
      if (el > 14 * 3600 && dl && dl.sunset) { let s = (now - dl.sunset) / 1000; if (s < 0) s += 86400; ev = s + 1200; }
      wxUpdate(f);
      // the desk makes room for a dispatch: the sun-arc and the ledger ease apart while one is on it
      const nkT = S.news && S.news.headline ? 1 : 0;
      NK = NK < 0 ? nkT : NK + (nkT - NK) * (1 - Math.exp(-Math.min(0.1, f.dt || 0.016) / 0.6));
      // now playing: eased presence (kept while the line fades out)
      const npNow = S.nowPlaying && S.nowPlaying.title ? S.nowPlaying : null;
      if (npNow) npHold = npNow;
      NPK = NPK < 0 ? (npNow ? 1 : 0) : NPK + ((npNow ? 1 : 0) - NPK) * (1 - Math.exp(-Math.min(0.1, f.dt || 0.016) / 0.7));
      if (!npNow && NPK < 0.004) npHold = null;
      EV = ev;
      const Ls = lightState(now);
      // by day the view comes forward from a faint backdrop behind the work face to the full scene; at night
      // (dk = 0) none of the day drawing runs
      const dk = DK = U.clamp(f.day || 0);
      const dA = dk * U.lerp(DAY_WORK, 1, U.smoothstep(0.05, 0.75, b));
      const P = dA > 0.004 ? tPal(Ls.sun.alt) : null;
      // overcast flattens the key light; fog softens it
      const flat = (1 - 0.85 * U.smoothstep(0.45, 0.95, WX.cloud)) * (1 - 0.5 * WX.fog);
      const I = Ls.I * flat;
      const litK = Ls.dark;

      // ---------------------------------------------------- ambient: the view
      if (b > 0.004 || dA > 0.004) {
        const p = U.smoothstep(0.28, 0.95, b), viewA = U.smoothstep(0.28, 0.6, b), nV = viewA * (1 - dk);
        const live = P && b > 0.98; // full ambient: the day view drawn layer by layer; else from the composite
        const magicA = U.smoothstep(0.78, 1, b);
        const Lt = lightning(t); FLASH = Lt ? Lt.fl : 0;
        const keyCol = Ls.useSun ? U.mix(C.sunLit, C.skyDusk, 0.4 * Ls.dusk) : C.moonLit;
        ctx.save(); ctx.beginPath(); archPath(ctx, 0, V.sill + 1); ctx.clip();
        drawSky(ctx, f, Ls, nV, ev, 0);
        if (live) drawDaySkyT(ctx, Ls, P, dA, b);
        // the city's own light on the haze above it
        ctx.globalAlpha = U.clamp(0.06 * viewA * litK * U.smoothstep(600, 5400, ev) * (1 - 0.3 * WX.fog));
        ctx.drawImage(L.cityGlow, V.cx - 0.6 * V.span, V.hz - 0.12 * H, 1.2 * V.span, 0.3 * H);
        ctx.globalAlpha = 1;
        const moon = drawMoons(ctx, f, Ls, viewA);
        drawComet(ctx, f, Ls, magicA);
        drawCreature(ctx, f, Ls, magicA * (1 - dk), moon);
        if (Lt) {
          // the far sky lights behind the ranges and the spires
          const gr = 0.5 * H;
          ctx.globalAlpha = U.clamp(0.14 * Lt.fl * viewA); ctx.drawImage(L.boltGlow, Lt.x - gr, V.hz - 0.2 * H - gr, gr * 2, gr * 2); ctx.globalAlpha = 1;
          if (!Lt.dome) drawBolt(ctx, Lt, viewA);
        }
        if (live) { drawCreature(ctx, f, Ls, magicA * dk, moon); drawBirds(ctx, f, dA * (1 - U.smoothstep(0.2, 0.6, WX.rain + WX.storm + WX.snow + WX.fog))); }
        drawClouds(ctx, f, Ls, viewA, 0.25 + 0.5 * Math.max(Ls.mI, 0.25 * Ls.dusk) + 0.8 * FLASH, 1 - dk, live ? dk : 0);
        // mountains
        const mA = nV * (1 - 0.8 * WX.fog);
        blit(ctx, L.mtn, mA);
        const side = U.clamp(Ls.side, -1, 1), wl = (1 - side) / 2, wr = (1 + side) / 2;
        tint(L.mtnL, keyCol); tint(L.mtnR, keyCol);
        const mI = (0.12 + 0.88 * I) * mA * (1 - 0.6 * WX.cloud);
        blit(ctx, L.mtnL, mI * (0.15 + 0.85 * wl) + 0.5 * FLASH * mA); blit(ctx, L.mtnR, mI * (0.15 + 0.85 * wr) + 0.5 * FLASH * mA);
        // the city: clear, or drowned in fog
        const fogK = U.clamp(WX.fog * 1.15);
        if (fogK < 0.995) blit(ctx, L.city, nV);
        if (fogK > 0.005) blit(ctx, L.cityFog, nV * fogK);
        tint(L.litL, keyCol); tint(L.litR, keyCol);
        const cI = (0.22 + 0.78 * I) * nV * (1 - 0.75 * fogK);
        blit(ctx, L.litL, cI * (0.2 + 0.8 * wl) + 0.35 * FLASH * nV); blit(ctx, L.litR, cI * (0.2 + 0.8 * wr) + 0.35 * FLASH * nV);
        if (WX.acc > 0.02) { tint(L.snowL, C.snow); blit(ctx, L.snowL, nV * U.smoothstep(0.03, 0.7, WX.acc) * (0.35 + 0.4 * I) * (1 - 0.7 * fogK)); }
        if (WX.wet > 0.02 && nV > 0.004) { tint(L.wetL, U.mix(keyCol, C.glow, 0.35 * litK)); blit(ctx, L.wetL, nV * WX.wet * (0.35 + 0.25 * U.noise1(t * 0.5)) * (1 - 0.7 * fogK)); }
        ctx.globalAlpha = 1;
        // the day: the land layer by layer in full ambient, else the cached composite (sky and land) and the
        // clouds over it
        if (live) drawDayLand(ctx, Ls, P, dA);
        else if (P) {
          blit(ctx, dayComposite(Ls, P, t), dA); ctx.globalAlpha = 1;
          drawClouds(ctx, f, Ls, viewA, 0, 0, dk);
        }
        if (P) {
          const xa = dA * U.smoothstep(0.4, 1, b);
          drawSunGlitter(ctx, f, Ls, P, xa * (1 - U.smoothstep(0.3, 0.8, WX.cloud)) * (1 - WX.fog));
          drawBoats(ctx, f, P, xa * (1 - 0.8 * WX.fog) * (1 - 0.6 * U.clamp(WX.rain + WX.snow + WX.storm)));
          drawBanners(ctx, f, xa);
        }
        drawRiver(ctx, f, Ls, viewA * (1 - 0.8 * fogK), moon, litK, ev);
        const litFrac = drawLights(ctx, f, viewA, ev, litK, magicA);
        LITF = litFrac || 0;
        drawFogWisps(ctx, f, viewA, ev, Ls);
        if (Lt && Lt.dome) drawBolt(ctx, Lt, viewA);
        drawDome(ctx, f, magicA * (0.35 + 0.65 * Ls.dark) * (0.85 + 0.15 * U.smoothstep(3 * 3600, 7 * 3600, ev)) * (1 - 0.88 * dk), Lt);
        drawFloaters(ctx, f, magicA, ev, litK);
        drawPrecip(ctx, f, viewA, 0.45 + 0.35 * Math.max(I, 0.3) + 0.5 * FLASH);
        // the unveiling: the night opens from the horizon line outward
        if (p < 0.999) {
          const e = U.easeOut(p), soft = 0.07 * H;
          const top = U.lerp(V.hz, V.apex - soft, e), bot = U.lerp(V.hz, V.sill + soft, e);
          ctx.globalAlpha = 1 - dk; // by day the view comes forward instead of opening out of the night
          ctx.fillStyle = "#000";
          ctx.fillRect(V.x0, V.apex - 2, V.span, Math.max(0, top - soft - V.apex + 2));
          ctx.fillRect(V.x0, bot + soft, V.span, Math.max(0, V.sill - bot - soft + 2));
          const g1 = ctx.createLinearGradient(0, top - soft, 0, top); g1.addColorStop(0, "#000"); g1.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g1; ctx.fillRect(V.x0, top - soft, V.span, soft);
          const g2 = ctx.createLinearGradient(0, bot, 0, bot + soft); g2.addColorStop(0, "rgba(0,0,0,0)"); g2.addColorStop(1, "#000");
          ctx.fillStyle = g2; ctx.fillRect(V.x0, bot, V.span, soft);
          ctx.globalAlpha = 1;
        }
        ctx.restore();

        // the stone: the reveal, the sill, the plate; moonlight along the arris
        const stoneA = U.smoothstep(0.2, 0.75, b);
        // by day the room is lit: its stone comes forward with the view
        if (dk > 0.004) blit(ctx, L.wallD, dk * U.lerp(DAY_WORK, 1, stoneA));
        blit(ctx, L.frame, stoneA);
        ctx.globalAlpha = 1;
        const kc = U.safe(keyCol);
        ctx.lineWidth = 1.2 * LWU;
        ctx.strokeStyle = U.rgba(kc, stoneA * (0.1 + 0.32 * I + 0.3 * FLASH)); ctx.beginPath(); archLine(ctx, 0, V.sill); ctx.stroke();
        ctx.strokeStyle = U.rgba(kc, stoneA * (0.06 + 0.16 * I)); ctx.beginPath(); ctx.moveTo(V.x0, V.sill); ctx.lineTo(V.x1, V.sill); ctx.stroke();
        // the keystone's sigil keeps a faint watch
        {
          const ky = V.apex - V.D * 0.98 - 0.01 * H, kA = magicA * (0.3 + 0.12 * Math.sin(t * 0.5)) * (1 - 0.7 * dk);
          ctx.beginPath(); runePath(ctx, RUNES[1], V.cx, ky, 0.012 * H); ctx.strokeStyle = U.rgba(U.safe(C.rune), kA); ctx.lineWidth = 1 * LWU; ctx.stroke();
        }
        drawSill(ctx, f, stoneA, 0.4 + 0.6 * Math.max(I, 0.3));
        drawRaven(ctx, f, stoneA, I, kc);
        // the familiar on the sill (in front of the view and the rain beyond the window, behind the plate's clock)
        if (CAT) drawFamiliar(ctx, f, stoneA, Ls, I, kc, magicA, dk);
        // hosts: wards on the gatehouse
        const hb = Array.isArray(S.heartbeat) ? S.heartbeat : [];
        const wA = U.smoothstep(0.7, 1, b) * ov;
        if (wA > 0.01 && CITY.wardPts) hb.forEach((h, i) => { const w = CITY.wardPts[i]; if (w) drawWard(ctx, f, w, h, wA, i); });
      }

      // ---------------------------------------------------- work: the hairline arch, thickening into stone
      const hairA = fadeOut(b, 0.3, 0.8);
      if (hairA > 0.01) {
        const thick = U.smoothstep(0.05, 0.5, b);
        blit(ctx, L.hair, hairA * (1 - thick));
        blit(ctx, L.hairB, hairA * thick);
        ctx.globalAlpha = 1;
      }
      if (b < 0.999) { drawWork(ctx, f, b, S, Ls.A, ov); drawNews(ctx, f, fadeOut(b, 0.03, 0.32) * ov); }
      // now playing (work): a small line under the ward sigils
      if (npHold && b < 0.999) {
        const nA = fadeOut(b, 0.06, 0.34);
        drawNowPlayingWork(ctx, npHold, V.cx, 0.958 * H + (1 - nA) * 0.02 * H, 0.5 * V.span, nA * ov * NPK);
      }

      // ---------------------------------------------------- the clock: silver hero -> gilt on the plate
      const nowStr = U.fmtTime(now, { hour24: AW.config.clock ? AW.config.clock.hour24 !== false : true });
      const ckW = { x: V.cx, y: 0.325 * H, px: 0.24 * H };
      const ckA = { x: V.cx, y: V.plateY - (npHold ? NPK * 0.007 * H : 0), px: 0.105 * H };
      const mv = U.easeInOut(U.smoothstep(0.2, 0.8, b));
      const ckx = U.lerp(ckW.x, ckA.x, mv), cky = U.lerp(ckW.y, ckA.y, mv), ckp = U.lerp(ckW.px, ckA.px, mv);
      const xf = U.smoothstep(0.3, 0.7, b);
      text(ctx, nowStr, ckx, cky, { px: ckW.px, color: C.steel, glow: 14, core: 0.88 }, "center", ckp / ckW.px, (1 - xf) * ov);
      text(ctx, nowStr, ckx, cky, { px: ckA.px, color: C.gilt, glow: 9, core: 0.86 }, "center", ckp / ckA.px, xf * 0.92 * ov);
      // the bard's ballad: now playing, whispered in the plate's lower margin
      if (npHold) {
        const bA = U.smoothstep(0.6, 1, b) * ov * NPK;
        if (bA > 0.004) {
          const bo = { px: Math.max(12, 0.0165 * H), style: "italic", color: U.mix(C.brass, C.gilt, 0.35), glow: 2, core: 0.8 };
          const paused = !npHold.isPlaying;
          text(ctx, npFit(npHold, bo, 0.33 * H, paused ? "‖  " : "♪  "), V.cx, V.plateY + 0.043 * H, bo, "center", 1, bA * 0.5 * (paused ? 0.65 : 1));
        }
      }
      // a critical dispatch whispers beside the plate
      drawNewsWhisper(ctx, f, U.smoothstep(0.6, 1, b) * ov);
      // the calendar whisper, only when it is close
      const next = S.calendar && S.calendar.next;
      if (next && next.minutesUntil < 30) {
        const wA = U.smoothstep(0.6, 1, b) * ov;
        text(ctx, `${next.title}  ·  ${U.fmtMinutes(next.minutesUntil)}`, V.cx - 0.27 * H, V.plateY, { px: 0.024 * H, style: "italic", color: C.amber, glow: 4, core: 0.8 }, "right", 1, wA * 0.55);
      }
      ctx.globalAlpha = 1;
      // sound cues from what was drawn: the flash, the hour, dusk, the comet, the arcane windows
      if (b < 0.004 && dk < 0.004) LITF = 0;
      sfx(f, lightning(t), b, Ls, ev);
    },
  });
})();
