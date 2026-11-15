// Ambient Wall - NATURE theme: "the old wood".
// Work: order. A cleared wall in cold green / teal. A thin hero clock, one living stem as the day's
//       divider (grown from sunrise toward sunset, a bud at now), seeds for hosts, a twin-stem ledger.
// Ambient: a dim, ancient forest at night with a druid / fey air. Trunks in four depth layers fade into
//       blue-green dark (baked once to offscreen canvases), a ragged canopy with sky glimpsed through the
//       gaps, roots, ferns and hanging moss. In the clearing stands a mossy standing stone bearing the
//       time in moss-light, ogham notches awakening along its edge; one carved rune per host (calm teal
//       when up, a soft warm-red pulse with the host name whispered beneath when down). Around its foot a
//       faerie ring of tiny mushrooms lights one by one over the evening. Fireflies (amber, J-stroke
//       flashes, more and more in step as the night deepens) and a few pale will-o'-the-wisps.
//       Overgrowth: procedural vines creep in from the edges and over the stone, a pure function of
//       frame.ambientElapsed (seeded geometry), so a reload at 22:30 shows exactly the same evening.
// Weather is real (signals.weather.condition / intensity / windKph, eased over a few seconds):
//       clear = moon shafts + stars in the canopy gaps; cloudy = gaps darken, shafts go; fog = mist
//       rolling between the trunks, far layers swallowed; rain = fine rain, drips, fireflies hide;
//       storm = heavier slanted rain, wind sway, rare dim distant lightning behind the trunks;
//       snow = slow flakes, a dusting on branches and stones, fireflies give way to the wisps.
// The exhale: everything interpolates on frame.blend. The work face fades and drifts in a staggered
//       cascade while the forest rises out of the dark back to front; back to work, vines recede
//       tip-first and order returns.
// By day (frame.day): the same wood sun-dappled. Every tree, bank and the stone are painted a second time
//       in daylight (bark, lit flanks, moss cushions, a green-lit roof, a grey stone in sun and shade),
//       baked per sun elevation and weather (graded, the sky glimpsed through the roof, flecks of sun on the
//       floor; snow lying white, fog milky) and capped to the day budget. Live: shafts of sun that slant
//       with the sun's height (golden when low), pollen and seeds catching the light, butterflies, ferns,
//       moss and vines in daylight greens; the faerie ring unlit, plain mushrooms, the fey a rare spark.
//       Dusk hands over to the night wood and its fireflies. Behind the work face the day wood sits at
//       ~0.18 and comes forward with the exhale. At night (day = 0) every frame is exactly the night wood.
(function () {
  const U = AW.util;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const SANS = '"Inter", "Segoe UI", "DejaVu Sans", system-ui, sans-serif';
  const hex = U.hex;

  const C = {
    frost: hex("#5ccfc2"),     // hero work colour: cold teal-cyan
    teal: hex("#3fb2a8"),
    tealDim: hex("#2b7f7c"),
    green: hex("#4cc896"),     // cold green
    straw: hex("#b2b866"),
    amber: hex("#d89a48"),
    lichen: hex("#b4c47e"),    // ambient clock: moss-light on the stone
    moss: hex("#4b7c52"),
    mossDim: hex("#3a6142"),
    deepTeal: hex("#2a6a68"),
    mossTeal: hex("#3a725e"),
    leafMoss: hex("#5a9062"),
    leafTeal: hex("#3e8a84"),
    biolum: hex("#4cbca6"),
    rust: hex("#a8642e"),
    bud: hex("#cc8e46"),
    ember: hex("#c4643a"),
    rose: hex("#8c3e58"),
    violet: hex("#3e2a6a"),
    dayBlue: hex("#1e4a6e"),
    firefly: hex("#e0a040"),
    alarm: hex("#e0583a"),
    flare: hex("#e09040"),
    // the old wood
    sky: hex("#1c3470"),
    haze: hex("#2f6a72"),
    hazeDay: hex("#4a6e3c"),
    rim: hex("#6a9aa0"),
    fog: hex("#4c7c86"),
    fogDusk: hex("#5a4874"),
    moonShaft: hex("#7aa8b4"),
    sunShaft: hex("#c88a4e"),
    floor: hex("#2f6656"),
    fern: hex("#3c7a52"),
    beard: hex("#5a8a72"),
    rune: hex("#5cc4b0"),
    mush: hex("#5cd0a8"),
    mushV: hex("#a08ad8"),
    wispT: hex("#86ccc4"),
    wispV: hex("#a490d8"),
    rain: hex("#7aa0b2"),
    snow: hex("#a0aac8"),
    bolt: hex("#9488c8"),
  };
  // The old wood by day: material colours in neutral noon light (the bake darkens and tints them for the
  // hour and the weather). Moss-green and bark-brown, sky-haze between the far trunks, a grey sunlit stone.
  const DC = {
    farBank: hex("#3e5c46"), farTrunk: hex("#3c544e"), farTrunk2: hex("#34483f"), farLit: hex("#5a7262"),
    midBank: hex("#2e4c24"), midTrunk: hex("#36322a"), midLit: hex("#7a6c4c"), midBark: hex("#201c16"),
    nearBank: hex("#1c3016"), nearTrunk: hex("#24221a"), nearLit: hex("#6c5e40"), nearBark: hex("#12100c"),
    moss: hex("#46762c"), moss2: hex("#5c7c26"), lichen: hex("#8aa47a"), fey: hex("#4aa490"),
    haze: hex("#6a8e98"),
    stone: hex("#4c5048"), stoneHi: hex("#6e7064"), stoneLo: hex("#30332c"),
    canDeep: hex("#0e2210"), canMid: hex("#22441a"), canLit: hex("#5a8a2a"), canEdge: hex("#86a83a"),
    capDay: hex("#8a6040"), capTop: hex("#a8784c"), stemDay: hex("#a0947a"),
    fern: hex("#4e8a38"), beard: hex("#7a9060"), vine: hex("#4a7a34"), vineDark: hex("#182c14"),
    sunNoon: hex("#d4c690"), sunGold: hex("#d8964a"), floorSun: hex("#a0a050"),
    mist: hex("#7c8682"), snowGround: hex("#949cb0"),
    fly1: hex("#d0b84a"), fly2: hex("#d07a38"), fly3: hex("#7a98d0"), pollen: hex("#d0c080"),
  };

  let W = 0, H = 0, dpr = 1, S = 1, built = "";
  let mctx = null;
  let LS = false; // letterSpacing support

  // ------------------------------------------------------------------ offscreen helpers
  function mk(wCss, hCss) { return mkL(wCss, hCss, dpr); }
  function mkL(wCss, hCss, sc) {
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.ceil(wCss * sc)); cv.height = Math.max(1, Math.ceil(hCss * sc));
    const c = cv.getContext("2d"); c.setTransform(sc, 0, 0, sc, 0, 0);
    return { cv, c, w: wCss, h: hCss };
  }
  const ck = (c) => `${c.r | 0},${c.g | 0},${c.b | 0}`;
  const rgb = (r, g, b) => `rgb(${r},${g},${b})`;

  // Text sprites: glow rendered once per (text, size, colour), then blitted. No per-frame shadowBlur.
  const sprites = new Map();
  let erodeTex = null;
  function sprite(str, o) {
    const px = Math.round(o.px);
    const key = `${str}|${px}|${o.weight || 400}|${o.spacing || 0}|${ck(o.color)}|${o.glow || 0}|${o.core || 0}|${o.erode ? 1 : 0}`;
    let s = sprites.get(key);
    if (s) { sprites.delete(key); sprites.set(key, s); return s; }
    const font = `${o.weight || 400} ${px}px ${SANS}`;
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
    if (o.erode && erodeTex) {
      c.globalCompositeOperation = "destination-out";
      c.drawImage(erodeTex, 0, 0, w, h);
      c.globalCompositeOperation = "source-over";
    }
    s = { cv, w, h, pad, tw };
    sprites.set(key, s);
    if (sprites.size > 64) sprites.delete(sprites.keys().next().value);
    return s;
  }
  // align: "left" | "center" | "right"; x,y = anchor, y = vertical middle
  function text(ctx, str, x, y, o, align, scale, alpha) {
    if (!str || alpha <= 0.004) return 0;
    const s = sprite(str, o), k = scale || 1, w = s.w * k, h = s.h * k;
    const dx = align === "left" ? x - s.pad * k : align === "right" ? x - (s.pad + s.tw) * k : x - w / 2;
    ctx.globalAlpha = U.clamp(alpha);
    ctx.drawImage(s.cv, dx, y - h / 2, w, h);
    ctx.globalAlpha = 1;
    return s.tw * k;
  }

  // Radial glow sprites, one per quantised colour. "soft" is a wide, gentle falloff for washes.
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
    if (glows.size > 80) glows.clear();
    glows.set(key, s);
    return s;
  }
  function glow(ctx, col, x, y, rx, ry, a, soft) {
    if (a <= 0.003) return;
    ctx.globalAlpha = U.clamp(a);
    ctx.drawImage(glowSprite(col, soft), x - rx, y - ry, rx * 2, ry * 2);
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ small static textures
  let starsL = null, mistA = null, mistB = null, bandA = null, bandB = null, mistDay = null, bandDay = null;
  const MIST_W = 384, MIST_H = 96;
  let leafSpr = [];

  function buildErode() {
    // weathering mask for the ambient clock: soft worn patches plus a fine pitting
    const w = 256, h = 128;
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const x = cv.getContext("2d");
    const im = x.createImageData(w, h), d = im.data, r = U.rng(5150);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const n = U.fbm2(i / 26 + 3.1, j / 14 + 7.7, 4);
      let a = U.smoothstep(0.0, 0.32, n) * 0.4;
      if (r() < 0.012) a = Math.max(a, 0.22 + r() * 0.2);
      const k = (j * w + i) * 4;
      d[k] = 0; d[k + 1] = 0; d[k + 2] = 0; d[k + 3] = Math.round(a * 255);
    }
    x.putImageData(im, 0, 0);
    erodeTex = cv;
  }

  // tileable fbm strip; band = dense in the middle (fog between trunks), else dense toward the bottom
  function buildMist(col, band, seed) {
    const cv = document.createElement("canvas"); cv.width = MIST_W; cv.height = MIST_H;
    const x = cv.getContext("2d");
    const im = x.createImageData(MIST_W, MIST_H), d = im.data;
    const c = U.safe(col);
    for (let j = 0; j < MIST_H; j++) {
      const v = j / MIST_H;
      const vert = band ? Math.pow(Math.sin(Math.PI * v), 1.3) : U.smoothstep(0, 0.75, v);
      for (let i = 0; i < MIST_W; i++) {
        const u = i / MIST_W;
        const f1 = U.fbm2(i / 70 + seed, j / 22, 4), f2 = U.fbm2((i - MIST_W) / 70 + seed, j / 22, 4);
        const f = U.lerp(f1, f2, u);
        const a = U.clamp((f + 0.22) * 1.7) * vert;
        const k = (j * MIST_W + i) * 4;
        d[k] = c.r; d[k + 1] = c.g; d[k + 2] = c.b; d[k + 3] = Math.round(a * 255);
      }
    }
    x.putImageData(im, 0, 0);
    return cv;
  }

  function buildStars() {
    starsL = mk(W, H * 0.5);
    const x = starsL.c, r = U.rng(31337);
    const sc = U.safe(hex("#7088c8"));
    for (let i = 0; i < 150; i++) {
      const sx = r() * W, sy = Math.pow(r(), 1.2) * H * 0.48, a = 0.18 + r() * 0.4, s = (r() < 0.1 ? 1.6 : 1.0) * S;
      x.fillStyle = U.rgba(sc, a); x.beginPath(); x.arc(sx, sy, s, 0, TAU); x.fill();
    }
  }

  // leaf sprites: base at (pad, ay), pointing +x, 64 px long
  const LEAF_L = 64;
  function leafSprite(shape, edge, fill, rib, glowRib, day) {
    const L = LEAF_L, ratio = shape === 0 ? 0.5 : shape === 1 ? 0.3 : 0.6;
    const wh = L * ratio / 2, pad = 10;
    const cv = document.createElement("canvas");
    cv.width = L + pad * 2; cv.height = Math.ceil(wh * 2.6 + pad * 2);
    const c = cv.getContext("2d");
    const bx = pad, by = cv.height / 2;
    c.beginPath(); c.moveTo(bx, by);
    if (shape === 0) { // ivy-ish: broad shoulder near the base
      c.bezierCurveTo(bx + L * 0.02, by - wh * 1.5, bx + L * 0.62, by - wh * 1.15, bx + L, by);
      c.bezierCurveTo(bx + L * 0.62, by + wh * 1.15, bx + L * 0.02, by + wh * 1.5, bx, by);
    } else {
      c.bezierCurveTo(bx + L * 0.2, by - wh * 1.3, bx + L * 0.72, by - wh * 1.05, bx + L, by);
      c.bezierCurveTo(bx + L * 0.72, by + wh * 1.05, bx + L * 0.2, by + wh * 1.3, bx, by);
    }
    c.closePath();
    if (day) {                                            // by day: a solid leaf in the light
      c.fillStyle = U.rgba(U.safe(fill), 0.96); c.fill();
    } else {
      c.fillStyle = "rgba(0,0,0,0.84)"; c.fill();         // occludes what is behind
      c.fillStyle = U.rgba(U.safe(fill), 0.2); c.fill();
    }
    c.lineWidth = 2.6; c.strokeStyle = U.rgba(U.safe(edge), 0.6); c.stroke();
    const rc = U.safe(rib);
    c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + L * 0.5, by - wh * 0.14, bx + L * 0.86, by);
    for (const t of [0.3, 0.52, 0.72]) {
      const px = bx + L * t, py = by - wh * 0.08;
      c.moveTo(px, py); c.lineTo(px + L * 0.13, py - wh * 0.62 * (1 - t * 0.4));
      c.moveTo(px, py); c.lineTo(px + L * 0.13, py + wh * 0.62 * (1 - t * 0.4));
    }
    if (glowRib) { c.shadowColor = U.rgba(rc, 0.9); c.shadowBlur = 7; }
    c.lineWidth = glowRib ? 2.2 : 1.8; c.strokeStyle = U.rgba(rc, glowRib ? 0.78 : 0.4); c.stroke();
    c.shadowBlur = 0;
    return { cv, pad, ay: by };
  }
  function buildLeaves() {
    leafSpr = [
      leafSprite(0, C.leafMoss, C.moss, C.leafMoss, false),     // 0 moss ivy
      leafSprite(1, C.leafMoss, C.moss, C.leafMoss, false),     // 1 moss lance
      leafSprite(0, C.leafTeal, C.deepTeal, C.leafTeal, false), // 2 teal ivy
      leafSprite(2, C.leafTeal, C.deepTeal, C.leafTeal, false), // 3 teal round
      leafSprite(1, C.leafTeal, C.deepTeal, C.biolum, true),    // 4 bioluminescent
      leafSprite(0, C.rust, C.rust, C.rust, false),             // 5 autumn rust
    ];
  }

  // ------------------------------------------------------------------ the forest (baked)
  // FL far trunks + far floor, ML mid trunks + floor, CL canopy (low res), CR canopy rim light (low res),
  // NL near trunks, roots and banks, RL every moonlit rim (occluded correctly, drawn with the moonlight),
  // SNL every snow dusting (likewise), SL the standing stone (bbox), SR its moonlit rim, OGL ogham glow,
  // SHM / SHD moon / sun shafts (low res).
  let FL, ML, CL, CR, NL, RL, SNL, CSN, SL, SR, OGL, SHM, SHD;
  // by day: DM the whole wood in neutral daylight (transparent where the sky shows, baked once), SHN noon
  // shafts. DB* are the per-hour bakes (see bakeDay).
  let DM = null, SHN = null, SHG = null;
  let SGM = null;   // snow lying on the ground, occluded like the dusting (drawn by day when it has snowed)
  let STONE = null;            // { x0, y0, w, h, path (screen coords), edge: [[x,y]...] }
  let BEARDS = [];             // hanging moss anchors [x, y, len, ph]
  let FERNS = [];
  let DRN = 0, DX, DY0, DY1, DP, DPH; // rain drips
  let RING = [];               // faerie ring mushrooms
  const CANOPY_H = 0.46;       // canopy texture covers the top 46%
  const CS = 3;                // canopy texture downscale
  let LSC = 1;                 // forest layer resolution scale

  const RIMC = () => U.safe(C.rim);

  function trunkShape(o) {
    const n = 30, lx = new Float32Array(n + 1), rx = new Float32Array(n + 1), ys = new Float32Array(n + 1);
    const nz = o.nz;
    for (let i = 0; i <= n; i++) {
      const u = i / n, y = U.lerp(o.base, o.top, u);
      const cx = o.x + o.lean * u * u + U.noise1(nz + u * 2.2) * o.w0 * 0.3;
      let w = U.lerp(o.w0, o.w1, Math.pow(u, 0.55));
      w *= 1 + o.flare * Math.pow(1 - U.smoothstep(0, 0.16, u), 2.2);
      const wob = U.noise1(nz + 50 + u * 16) * w * 0.06;
      lx[i] = cx - w / 2 + wob; rx[i] = cx + w / 2 + wob * 0.6; ys[i] = y;
    }
    const p = new Path2D();
    p.moveTo(lx[0], ys[0]);
    for (let i = 1; i <= n; i++) p.lineTo(lx[i], ys[i]);
    for (let i = n; i >= 0; i--) p.lineTo(rx[i], ys[i]);
    p.closePath();
    const edge = [];
    for (let i = 0; i <= n; i++) edge.push([lx[i] + 0.7 * S, ys[i]]);
    return { p, lx, rx, ys, n, edge };
  }

  // a lengthwise strip of a trunk, between across-fractions f0 and f1 (sunlit flank, shaded flank)
  function bandPath(T, f0, f1) {
    const p = new Path2D();
    for (let i = 0; i <= T.n; i++) { const x = U.lerp(T.lx[i], T.rx[i], f0); i ? p.lineTo(x, T.ys[i]) : p.moveTo(x, T.ys[i]); }
    for (let i = T.n; i >= 0; i--) p.lineTo(U.lerp(T.lx[i], T.rx[i], f1), T.ys[i]);
    p.closePath();
    return p;
  }

  // a tapered limb (branch or root) as a filled polygon, plus its upper edge (for rims and snow)
  function limb(x, y, ang, len, w0, bend, nz) {
    const n = 10, cx = [], cy = [], ws = [];
    let a = ang, px = x, py = y;
    for (let i = 0; i <= n; i++) {
      cx.push(px); cy.push(py); ws.push(Math.max(0.8 * S, w0 * (1 - 0.86 * i / n)));
      a += bend + U.noise1(nz + i * 0.7) * 0.12;
      px += Math.cos(a) * len / n; py += Math.sin(a) * len / n;
    }
    const A = [], B = [];
    for (let i = 0; i <= n; i++) {
      const j = Math.min(i, n - 1);
      const dx = cx[j + 1] - cx[j], dy = cy[j + 1] - cy[j], l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l;
      A.push([cx[i] + nx * ws[i] / 2, cy[i] + ny * ws[i] / 2]);
      B.push([cx[i] - nx * ws[i] / 2, cy[i] - ny * ws[i] / 2]);
    }
    const p = new Path2D();
    p.moveTo(A[0][0], A[0][1]);
    for (let i = 1; i <= n; i++) p.lineTo(A[i][0], A[i][1]);
    for (let i = n; i >= 0; i--) p.lineTo(B[i][0], B[i][1]);
    p.closePath();
    let sa = 0, sb = 0;
    for (let i = 0; i <= n; i++) { sa += A[i][1]; sb += B[i][1]; }
    return { p, top: sa < sb ? A : B, tip: [px, py], cx, cy };
  }

  function rimLine(c, pts, a, lw, nz, col) {
    if (a <= 0.003 || pts.length < 2) return;
    c.lineCap = "butt"; c.lineWidth = lw;
    for (let i = 0; i < pts.length - 1; i++) {
      const k = U.clamp(0.25 + 0.75 * U.clamp(0.5 + U.noise1(nz + i * 0.31) * 1.5));
      c.strokeStyle = U.rgba(col, a * k);
      c.beginPath(); c.moveTo(pts[i][0], pts[i][1]); c.lineTo(pts[i + 1][0], pts[i + 1][1]); c.stroke();
    }
  }
  function polyStroke(c, pts, dy) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1] + dy);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1] + dy);
    c.stroke();
  }
  function occlude(shapes) {
    for (const L of [RL, SNL, SGM]) {
      L.c.globalCompositeOperation = "destination-out"; L.c.fillStyle = "#000";
      for (const p of shapes) L.c.fill(p);
      L.c.globalCompositeOperation = "source-over";
    }
  }

  // one tree: trunk + branches + roots into layer L, its rims into RL, its snow into SNL
  function plant(L, o, st, r) {
    const rr = (a, b) => a + r() * (b - a);
    const T = trunkShape(o);
    const shapes = [T.p], rims = [[T.edge, st.rimA]], snows = [];
    for (let k = 0; k < o.branches; k++) {
      const u = rr(0.3, 0.82), i = Math.round(u * T.n);
      const side = r() < 0.5 ? -1 : 1;
      const x0 = side < 0 ? T.lx[i] + 2 * S : T.rx[i] - 2 * S, y0 = T.ys[i];
      const w = (T.rx[i] - T.lx[i]) * rr(0.3, 0.46);
      const ang = -Math.PI / 2 + side * rr(0.65, 1.2);
      const Lb = limb(x0, y0, ang, rr(0.55, 1.15) * o.brLen, w, -side * rr(0.005, 0.03), r() * 99);
      shapes.push(Lb.p); rims.push([Lb.top, st.rimA * (side < 0 ? 0.95 : 0.5)]); snows.push(Lb.top);
      if (r() < 0.55) { // a fork
        const j = 5 + ((r() * 3) | 0);
        const Lf = limb(Lb.cx[j], Lb.cy[j], ang - side * rr(0.3, 0.6), rr(0.3, 0.55) * o.brLen, w * 0.4, 0, r() * 99);
        shapes.push(Lf.p); rims.push([Lf.top, st.rimA * 0.6]); snows.push(Lf.top);
      }
    }
    for (let k = 0; k < o.roots; k++) {
      const side = k % 2 ? 1 : -1;
      const x0 = o.x + side * o.w0 * rr(0.15, 0.45), y0 = o.base - o.w0 * rr(0.15, 0.5);
      const ang = side < 0 ? Math.PI - rr(0.2, 0.65) : rr(0.2, 0.65);
      const Lr = limb(x0, y0, ang, o.w0 * rr(0.9, 1.9), o.w0 * rr(0.22, 0.38), side * rr(0.0, 0.03), r() * 99);
      shapes.push(Lr.p); rims.push([Lr.top, st.rimA * 0.7]); snows.push(Lr.top);
    }
    occlude(shapes);
    const c = L.c;
    c.fillStyle = st.fill;
    for (const p of shapes) c.fill(p);
    // by day: the same tree in daylight, into DM (same shapes; no extra draws from the shared rng)
    const dd = st.day, D = dd && DM ? DM.c : null;
    if (D) {
      D.fillStyle = U.rgba(dd.fill, 1);
      for (const p of shapes) D.fill(p);
      if (dd.lit) { // the sunward (left) flank, in soft steps; the far flank in shade
        D.fillStyle = U.rgba(dd.lit, 0.3); D.fill(bandPath(T, 0.03, 0.56));
        D.fillStyle = U.rgba(dd.lit, 0.38); D.fill(bandPath(T, 0.07, 0.4));
        D.fillStyle = U.rgba(dd.lit, 0.42); D.fill(bandPath(T, 0.11, 0.27));
        D.fillStyle = "rgba(0,0,0,0.24)"; D.fill(bandPath(T, 0.74, 1));
      }
      for (const [pts, a] of rims) rimLine(D, pts, U.clamp(a * (dd.rimK || 2.5)), (st.rimW || 1.3) * 1.5 * S, o.nz + pts.length, dd.lit || dd.fill);
    }
    // bark: long faint grain lines
    if (st.bark) {
      c.lineWidth = 1.1 * S; c.strokeStyle = st.bark;
      if (D) { D.lineWidth = 1.3 * S; D.strokeStyle = U.rgba(dd.bark, 0.8); }
      const nb = 3 + ((r() * 3) | 0);
      for (let k = 0; k < nb; k++) {
        const fr = rr(0.18, 0.82), i0 = (r() * T.n * 0.5) | 0, i1 = Math.min(T.n, i0 + 6 + ((r() * T.n * 0.5) | 0));
        const bp = new Path2D();
        for (let i = i0; i <= i1; i++) {
          const f = U.clamp(fr + U.noise1(o.nz + k * 7 + i * 0.3) * 0.08, 0.08, 0.92);
          const x = U.lerp(T.lx[i], T.rx[i], f);
          i === i0 ? bp.moveTo(x, T.ys[i]) : bp.lineTo(x, T.ys[i]);
        }
        c.stroke(bp);
        if (D) D.stroke(bp);
      }
    }
    // moss on the lower, moonward side; a few fey lichen specks
    if (st.moss) {
      const mc = U.safe(hex("#2c5c3c")), fc = U.safe(hex("#3c9a8c"));
      // sample a point on the trunk at height fraction u, across fraction f (continuous, no rows)
      const at = (u, f) => {
        const fu = U.clamp(u) * (T.n - 0.001), i = Math.floor(fu), q = fu - i;
        const l = U.lerp(T.lx[i], T.lx[i + 1], q), rgt = U.lerp(T.rx[i], T.rx[i + 1], q);
        return [U.lerp(l, rgt, f), U.lerp(T.ys[i], T.ys[i + 1], q)];
      };
      const nm = Math.round(st.moss * 3 * (o.base - o.top) / (2.2 * S));
      for (let k = 0; k < nm; k++) {
        const u = Math.pow(r(), 1.5) * 0.6, f = Math.pow(r(), 1.6) * 0.8;
        const [x, y] = at(u, f);
        // clumped: only where a slow noise says moss grows
        const patch = U.smoothstep(-0.05, 0.3, U.fbm2(x / (26 * S) + o.nz, y / (34 * S), 3) + 0.25 * (1 - f) - 0.6 * u);
        if (r() > patch) continue;
        const ma = rr(0.2, 0.5) * (1 - u * 0.8), mr = rr(0.7, 2) * S;
        c.fillStyle = U.rgba(mc, ma);
        c.beginPath(); c.arc(x, y, mr, 0, TAU); c.fill();
        if (D) { D.fillStyle = U.rgba(k & 1 ? dd.moss2 || dd.moss : dd.moss, Math.min(1, ma * 1.6)); D.beginPath(); D.arc(x, y, mr * 1.25, 0, TAU); D.fill(); }
      }
      for (let k = 0; k < st.moss * 12; k++) {
        const [x, y] = at(Math.pow(r(), 1.3) * 0.5, r() * 0.5);
        const la = rr(0.35, 0.6);
        c.fillStyle = U.rgba(fc, la);
        c.fillRect(x, y, 1.3 * S, 1.3 * S);
        if (D) { D.fillStyle = U.rgba(DC.lichen, la * 0.7); D.fillRect(x, y, 1.6 * S, 1.6 * S); }
      }
      // by day the moss reads as soft green cushions on the lower trunk (own rng: the night is untouched)
      if (D) {
        const rd = U.rng(((o.nz * 977) | 0) + 11), n2 = Math.round(nm * 0.6);
        for (let k = 0; k < n2; k++) {
          const u = Math.pow(rd(), 1.8) * 0.45, ff = Math.pow(rd(), 1.4) * 0.9;
          const [x, y] = at(u, ff);
          const patch = U.smoothstep(-0.1, 0.25, U.fbm2(x / (22 * S) + o.nz, y / (30 * S), 3) + 0.3 * (1 - ff) - 0.7 * u);
          if (rd() > patch) continue;
          D.fillStyle = U.rgba(rd() < 0.6 ? dd.moss : dd.moss2 || dd.moss, (0.25 + 0.35 * rd()) * (1 - u));
          D.beginPath(); D.arc(x, y, (1 + 2.2 * rd()) * S, 0, TAU); D.fill();
        }
      }
    }
    const rc = RIMC();
    for (const [pts, a] of rims) rimLine(RL.c, pts, a, (st.rimW || 1.3) * S, o.nz + pts.length, rc);
    if (st.snowA) {
      const sc = U.safe(C.snow);
      SNL.c.lineCap = "round"; SNL.c.lineJoin = "round";
      SNL.c.strokeStyle = U.rgba(sc, st.snowA);
      for (const pts of snows) { SNL.c.lineWidth = st.snowW * S; polyStroke(SNL.c, pts, -0.6 * S); }
    }
  }

  // an undulating bank: filled from its top edge to the bottom of the screen
  function bank(L, x0, x1, yf, st, nz) {
    const n = 48, top = [];
    for (let i = 0; i <= n; i++) {
      const x = U.lerp(x0, x1, i / n);
      top.push([x, yf(x) + U.fbm2(x / (90 * S) + nz, 1.7, 3) * 0.018 * H]);
    }
    const p = new Path2D();
    p.moveTo(x0, H + 4);
    for (const [x, y] of top) p.lineTo(x, y);
    p.lineTo(x1, H + 4); p.closePath();
    occlude([p]);
    L.c.fillStyle = st.fill; L.c.fill(p);
    if (st.day && DM) {
      const D = DM.c;
      D.fillStyle = U.rgba(st.day.fill, 1); D.fill(p);
      // the same ground under snow (into SGM; the trees planted after it stand in front of it)
      {
        const yt = Math.min(...top.map((q) => q[1])), sc = DC.snowGround, sg = SGM.c;
        const g = sg.createLinearGradient(0, yt, 0, H);
        g.addColorStop(0, U.rgba(sc, 0.95)); g.addColorStop(0.2, U.rgba(sc, 0.82)); g.addColorStop(1, U.rgba(U.scale(sc, 0.8), 0.7));
        sg.fillStyle = g; sg.fill(p);
      }
      // moss cushions and sun-warmed patches on the floor (own rng)
      if (st.day.tex) {
        D.save(); D.clip(p);
        const rd = U.rng(((nz * 131) | 0) + 3), y0 = Math.min(...top.map((q) => q[1]));
        for (let k = 0; k < st.day.tex; k++) {
          const x = x0 + rd() * (x1 - x0), y = y0 + Math.pow(rd(), 0.8) * (H - y0);
          const n = U.fbm2(x / (60 * S) + nz, y / (24 * S), 3);
          const col = n > 0.05 ? DC.moss2 : n < -0.12 ? DC.nearBank : DC.moss;
          D.fillStyle = U.rgba(col, 0.1 + 0.18 * rd());
          D.beginPath(); D.ellipse(x, y, (6 + 18 * rd()) * S, (2 + 5 * rd()) * S, 0, 0, TAU); D.fill();
        }
        D.restore();
      }
      if (st.day.lit) rimLine(D, top, 0.45, 1.6 * S, nz * 3, st.day.lit);
    }
    if (st.rimA) rimLine(RL.c, top, st.rimA, 1.2 * S, nz * 3, RIMC());
    if (st.snowA) {
      SNL.c.lineCap = "round"; SNL.c.strokeStyle = U.rgba(U.safe(C.snow), st.snowA); SNL.c.lineWidth = st.snowW * S;
      polyStroke(SNL.c, top, 0.4 * S);
    }
    return top;
  }

  function buildCanopy() {
    const cw = Math.ceil(W / CS), ch = Math.ceil(CANOPY_H * H / CS);
    const A = new Float32Array(cw * ch);
    const nearX = [0.035, 0.205, 0.79, 0.968];
    for (let j = 0; j < ch; j++) {
      const y = j * CS, v = y / (CANOPY_H * H);
      for (let i = 0; i < cw; i++) {
        const x = i * CS;
        const fine = U.fbm2(x / (30 * S) + 11.3, y / (26 * S) + 4.1, 4);
        const clump = U.fbm2(x / (210 * S) + 2.7, y / (150 * S) + 8.8, 3);
        let bias = 0.3 - 1.25 * U.smoothstep(0, 1, v);
        for (const nx of nearX) { const d = (x - nx * W) / (0.08 * W); bias += 0.5 * Math.exp(-d * d) * (1 - 0.5 * v); }
        const dc = (x - 0.46 * W) / (0.15 * W);
        bias -= 0.22 * Math.exp(-dc * dc) * (1 - 0.4 * v);
        A[j * cw + i] = U.smoothstep(-0.05, 0.05, fine * 0.75 + clump * 0.9 + bias);
      }
    }
    // occluder, rim light (lit leaf edges), and snow on top surfaces
    const mkI = () => { const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch; return cv; };
    const cl = mkI(), cr = mkI(), cs = mkI(), cd = mkI();
    const xl = cl.getContext("2d"), xr = cr.getContext("2d"), xs = cs.getContext("2d"), xd = cd.getContext("2d");
    const il = xl.createImageData(cw, ch), ir = xr.createImageData(cw, ch), is = xs.createImageData(cw, ch), idd = xd.createImageData(cw, ch);
    const rc = RIMC(), sc = U.safe(C.snow);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const k = j * cw + i, a = A[k], q = k * 4;
      il.data[q + 3] = Math.round(a * 255);
      const e = a * (1 - a) * 4;
      const gx = i > 0 && i < cw - 1 ? A[k + 1] - A[k - 1] : 0;
      const lit = 0.35 + 0.65 * U.clamp(gx * 2 + 0.3);
      ir.data[q] = rc.r; ir.data[q + 1] = rc.g; ir.data[q + 2] = rc.b; ir.data[q + 3] = Math.round(e * lit * lit * 0.3 * 255);
      if (j > 2 && a > 0.55 && A[k - 2 * cw] < 0.3) {
        is.data[q] = sc.r; is.data[q + 1] = sc.g; is.data[q + 2] = sc.b; is.data[q + 3] = Math.round(0.75 * 255);
      }
      // by day: the roof in sun. Clumps lit on their sunward (upper-left) faces, sunlit leaf clusters,
      // the underside in green shade, translucent lime edges against the sky
      if (a > 0.004) {
        const x = i * CS, y = j * CS, v = y / (CANOPY_H * H);
        const gy = j > 0 && j < ch - 1 ? A[k + cw] - A[k - cw] : 0;
        const face = U.clamp(0.5 + (gx + gy) * 2.2);
        const cl2 = U.smoothstep(-0.02, 0.32, U.fbm2(x / (11 * S) + 5.1, y / (9 * S) + 2.3, 3));
        const under = U.smoothstep(0.5, 1, v);
        const L = U.clamp(0.12 + 0.5 * face * (0.45 + 0.55 * cl2) + 0.32 * cl2 * (1 - under) - 0.22 * under);
        let col = L < 0.5 ? U.mix(DC.canDeep, DC.canMid, L * 2) : U.mix(DC.canMid, DC.canLit, (L - 0.5) * 2);
        col = U.mix(col, DC.canEdge, e * 0.55 * (0.4 + 0.6 * face));
        idd.data[q] = col.r; idd.data[q + 1] = col.g; idd.data[q + 2] = col.b; idd.data[q + 3] = Math.round(a * 255);
      }
    }
    xl.putImageData(il, 0, 0); xr.putImageData(ir, 0, 0); xs.putImageData(is, 0, 0); xd.putImageData(idd, 0, 0);
    // upscale once through a soft blur, so the leaf edges never show the low-res steps
    const up = (src, blur) => {
      const L = mkL(W, CANOPY_H * H, LSC);
      L.c.filter = `blur(${(blur * S * LSC).toFixed(2)}px)`;
      L.c.drawImage(src, 0, 0, W, CANOPY_H * H);
      L.c.filter = "none";
      return L.cv;
    };
    CL = up(cl, 1.6); CR = up(cr, 1.2); CSN = up(cs, 1);
    if (DM) DM.c.drawImage(up(cd, 1.4), 0, 0, W, CANOPY_H * H);
    // anchors for hanging moss and drips: the underside of the canopy
    const r = U.rng(424242);
    BEARDS = [];
    const drips = [];
    for (let k = 0; k < 64 && BEARDS.length < 13; k++) {
      const x = (0.03 + r() * 0.94) * W;
      if (Math.abs(x - 0.5 * W) < 0.13 * W) continue;
      const i = Math.min(cw - 1, Math.round(x / CS));
      let jj = 0;
      while (jj < ch - 1 && A[jj * cw + i] > 0.5) jj++;
      const y = jj * CS;
      if (y < 0.07 * H || y > CANOPY_H * H * 0.95) continue;
      BEARDS.push([x, y - 2 * S, (0.035 + r() * 0.09) * H, r() * TAU]);
      if (r() < 0.8) drips.push([x + (r() - 0.5) * 10 * S, y, (0.8 + r() * 0.17) * H]);
    }
    for (let k = 0; k < 40 && drips.length < 18; k++) {
      const x = (0.05 + r() * 0.9) * W, i = Math.min(cw - 1, Math.round(x / CS));
      let jj = 0;
      while (jj < ch - 1 && A[jj * cw + i] > 0.5) jj++;
      if (jj * CS > 0.05 * H && jj < ch - 1) drips.push([x, jj * CS, (0.78 + r() * 0.2) * H]);
    }
    DRN = drips.length;
    DX = new Float32Array(DRN); DY0 = new Float32Array(DRN); DY1 = new Float32Array(DRN); DP = new Float32Array(DRN); DPH = new Float32Array(DRN);
    drips.forEach((d, k) => { DX[k] = d[0]; DY0[k] = d[1]; DY1[k] = d[2]; DP[k] = 1.3 + r() * 2.6; DPH[k] = r() * 10; });
  }

  function stoneOutline() {
    // a menhir: broad foot, sides drawing in, a slight lean, an uneven peak left of centre
    const cx = 0.5 * W, base = 0.848 * H, sh = 0.335 * H, peak = 0.165 * H, hw = 0.15 * W, lean = 0.012 * W;
    const pts = [], n = 26, m = 24;
    const side = (u, sgn, nz, taper) => cx + lean * u + sgn * (hw * (1 - taper * u) + (1 - u) * (1 - u) * 0.012 * W) + U.noise1(nz + u * 5) * 7 * S;
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push([side(u, -1, 3.1, 0.2), U.lerp(base, sh, u)]); }
    const lx = pts[n][0], rxs = side(1, 1, 9.7, 0.26);
    for (let i = 1; i < m; i++) {
      const q = i / m;
      const hump = Math.pow(Math.sin(Math.PI * Math.pow(q, 0.72)), 0.85);
      pts.push([U.lerp(lx, rxs, q), sh - (sh - peak) * hump + U.noise1(21 + q * 7) * 6 * S + (q > 0.6 ? (q - 0.6) * 0.05 * H : 0)]);
    }
    for (let i = n; i >= 0; i--) { const u = i / n; pts.push([side(u, 1, 9.7, 0.26), U.lerp(base, sh, u)]); }
    return { pts, n, m };
  }

  function buildStone() {
    const x0 = 0.32 * W, y0 = 0.14 * H, w = 0.36 * W, h = 0.74 * H;
    const { pts, n, m } = stoneOutline();
    const P = new Path2D();
    P.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) P.lineTo(pts[i][0], pts[i][1]);
    P.closePath();
    SL = mkL(w, h, LSC); SR = mkL(w, h, LSC); OGL = mkL(w, h, LSC);
    for (const L of [SL, SR, OGL]) L.c.translate(-x0, -y0);
    const c = SL.c, r = U.rng(8128), rr = (a, b) => a + r() * (b - a);
    const d = DM.c; // by day: the same stone, grey in the sun, straight into the day wood (screen coords)
    c.fillStyle = rgb(5, 7, 8); c.fill(P);
    c.save(); c.clip(P);
    d.save(); d.clip(P);
    d.fillStyle = U.rgba(DC.stone, 1); d.fillRect(x0, y0, w, h);
    // weathered surface: soft lighter patches
    const tw = Math.ceil(w / 4), th = Math.ceil(h / 4);
    const tc = document.createElement("canvas"); tc.width = tw; tc.height = th;
    const tc2 = document.createElement("canvas"); tc2.width = tw; tc2.height = th;
    const tx = tc.getContext("2d"), im = tx.createImageData(tw, th);
    const tx2 = tc2.getContext("2d"), im2 = tx2.createImageData(tw, th);
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
      const nn = U.fbm2(i / 16 + 2.2, j / 16 + 8.1, 4), q = (j * tw + i) * 4;
      im.data[q] = 20; im.data[q + 1] = 27; im.data[q + 2] = 28; im.data[q + 3] = Math.round(U.clamp(nn * 1.3) * 0.55 * 255);
      const fine = U.fbm2(i / 4 + 9.3, j / 4 + 1.7, 2);
      const lo = nn < -0.08, col = lo ? DC.stoneLo : DC.stoneHi;
      im2.data[q] = col.r; im2.data[q + 1] = col.g; im2.data[q + 2] = col.b;
      im2.data[q + 3] = Math.round(U.clamp((lo ? -nn - 0.08 : nn) * 1.6 + fine * 0.25) * 0.7 * 255);
    }
    tx.putImageData(im, 0, 0);
    c.drawImage(tc, x0, y0, w, h);
    tx2.putImageData(im2, 0, 0);
    d.drawImage(tc2, x0, y0, w, h);
    // daylight on the stone: the sunward (left) face lit, the far face in shade, skylight on the cap
    {
      let g = d.createLinearGradient(0.34 * W, 0, 0.67 * W, 0);
      g.addColorStop(0, U.rgba(DC.sunNoon, 0.2)); g.addColorStop(0.3, U.rgba(DC.sunNoon, 0.1)); g.addColorStop(0.55, "rgba(0,0,0,0)");
      g.addColorStop(0.8, "rgba(0,0,0,0.22)"); g.addColorStop(1, "rgba(0,0,0,0.38)");
      d.fillStyle = g; d.fillRect(x0, y0, w, h);
      g = d.createLinearGradient(0, 0.16 * H, 0, 0.85 * H);
      g.addColorStop(0, U.rgba(DC.haze, 0.18)); g.addColorStop(0.3, "rgba(0,0,0,0)"); g.addColorStop(0.85, "rgba(0,0,0,0.1)"); g.addColorStop(1, "rgba(0,0,0,0.3)");
      d.fillStyle = g; d.fillRect(x0, y0, w, h);
    }
    // a couple of old cracks
    c.strokeStyle = rgb(1, 2, 2); c.lineWidth = 1.6 * S; c.lineJoin = "round";
    d.strokeStyle = U.rgba(DC.stoneLo, 0.9); d.lineWidth = 1.8 * S; d.lineJoin = "round";
    for (let k = 0; k < 4; k++) {
      let x = rr(0.38, 0.62) * W, y = k < 2 ? rr(0.2, 0.3) * H : rr(0.7, 0.84) * H;
      const dir = k < 2 ? 1 : -1;
      const cp = new Path2D(); cp.moveTo(x, y);
      for (let s = 0; s < 7; s++) { x += rr(-14, 14) * S; y += dir * rr(8, 20) * S; cp.lineTo(x, y); }
      c.stroke(cp); d.stroke(cp);
    }
    // moss: thick on the cap and down the moonward edge, a skirt at the foot; fey lichen specks
    const mc = U.safe(hex("#2e6040")), mc2 = U.safe(hex("#3c6a3a")), fc = U.safe(hex("#46b0a0"));
    const tst = document.createElement("canvas").getContext("2d");
    const capY = (x) => { // top of the stone at x (for "near the cap" weighting)
      let best = 0.165 * H;
      for (let i = n; i <= n + m; i++) if (Math.abs(pts[i][0] - x) < 0.012 * W) best = Math.max(best, pts[i][1]);
      return best;
    };
    for (let k = 0; k < 9000; k++) {
      const x = rr(0.33, 0.67) * W, y = rr(0.16, 0.85) * H;
      if (!tst.isPointInPath(P, x, y)) continue;
      const dTop = (y - capY(x)) / H, dLeft = (x - (0.5 * W - 0.15 * W)) / W, dFoot = (0.848 * H - y) / H;
      const near = Math.max(1 - U.smoothstep(0, 0.09, dTop), 0.8 * (1 - U.smoothstep(0, 0.05, dLeft)), 0.9 * (1 - U.smoothstep(0, 0.07, dFoot)));
      const patch = U.fbm2(x / (40 * S) + 4.4, y / (30 * S) + 1.3, 4);
      const p = U.smoothstep(0.05, 0.3, patch + near * 0.55 - 0.3);
      if (r() > p) continue;
      const first = r() < 0.7, ma = rr(0.18, 0.5) * (0.5 + 0.5 * near), mr = rr(0.7, 2.3) * S;
      c.fillStyle = U.rgba(first ? mc : mc2, ma);
      c.beginPath(); c.arc(x, y, mr, 0, TAU); c.fill();
      d.fillStyle = U.rgba(first ? DC.moss : DC.moss2, Math.min(1, ma * 1.5));
      d.beginPath(); d.arc(x, y, mr * 1.2, 0, TAU); d.fill();
    }
    for (let k = 0; k < 60; k++) {
      const p = pts[(r() * pts.length) | 0];
      const fa = rr(0.3, 0.6), fx = p[0] + (0.5 * W - p[0]) * rr(0.02, 0.18), fy = p[1] + rr(0, 0.05) * H;
      c.fillStyle = U.rgba(fc, fa);
      c.fillRect(fx, fy, 1.4 * S, 1.4 * S);
      d.fillStyle = U.rgba(DC.lichen, fa * 0.8);
      d.fillRect(fx, fy, 1.8 * S, 1.8 * S);
    }
    c.restore();
    d.restore();
    // moonlit rim: bright along the moonward edge and the cap, faint on the far side
    const rc = RIMC();
    rimLine(SR.c, pts.slice(0, n + 1), 0.4, 1.7 * S, 77, rc);
    rimLine(SR.c, pts.slice(n, n + m + 1), 0.5, 1.8 * S, 91, rc);
    rimLine(SR.c, pts.slice(n + m), 0.1, 1.3 * S, 13, rc);
    // ogham along the moonward arris, read bottom to top, carved and faintly awake
    const edge = pts.slice(0, n + 1);
    const edgeX = (y) => {
      for (let i = 0; i < n; i++) {
        const a = edge[i], b = edge[i + 1];
        if (y <= a[1] && y >= b[1]) return U.lerp(a[0], b[0], (a[1] - y) / (a[1] - b[1]));
      }
      return edge[n][0];
    };
    const og = OGL.c, rcol = U.safe(C.rune);
    const strokes = [];
    let y = 0.80 * H;
    const yEnd = 0.5 * H, nL = 4 * S, gap = 7.5 * S, len = 15 * S;
    strokes.push([edgeX(y + 6 * S) + 3 * S, y + 6 * S, edgeX(yEnd) + 3 * S, yEnd]);
    while (y > yEnd + 30 * S) {
      const type = (r() * 4) | 0, cnt = 1 + ((r() * 5) | 0);
      for (let k = 0; k < cnt; k++) {
        const ex = edgeX(y) + 3 * S;
        if (type === 0) strokes.push([ex, y, ex + len, y]);
        else if (type === 1) strokes.push([ex - len * 0.8, y, ex, y]);
        else if (type === 2) strokes.push([ex - len * 0.7, y + 5 * S, ex + len * 0.9, y - 5 * S]);
        else strokes.push([ex - 2.5 * S, y, ex + 2.5 * S, y]);
        y -= type === 3 ? nL * 1.5 : gap;
      }
      y -= gap * 1.8;
    }
    const drawOg = (x, col, a, lw) => {
      x.strokeStyle = U.rgba(col, a); x.lineWidth = lw; x.lineCap = "round";
      x.beginPath();
      for (const s of strokes) { x.moveTo(s[0], s[1]); x.lineTo(s[2], s[3]); }
      x.stroke();
    };
    drawOg(c, { r: 1, g: 2, b: 2 }, 1, 3 * S);               // the carved groove
    drawOg(d, DC.stoneLo, 0.95, 3 * S);                     // by day: the groove in shadow, a faint fey trace
    drawOg(d, DC.fey, 0.16, 1.2 * S);
    og.shadowColor = U.rgba(rcol, 0.9); og.shadowBlur = 9 * S * LSC;
    drawOg(og, rcol, 0.55, 1.6 * S);
    og.shadowBlur = 0;
    drawOg(og, rcol, 0.8, 1.2 * S);
    // snow on the cap and on the foot
    occlude([P]);
    // a soft cap: wide and faint, then a firmer crest, thickest on the flatter top
    const cap = pts.slice(n - 1, n + m + 2), sc = U.safe(C.snow);
    SNL.c.lineCap = "round"; SNL.c.lineJoin = "round";
    SNL.c.save(); SNL.c.clip(P);
    SNL.c.strokeStyle = U.rgba(sc, 0.22); SNL.c.lineWidth = 14 * S; polyStroke(SNL.c, cap, 3 * S);
    SNL.c.strokeStyle = U.rgba(sc, 0.35); SNL.c.lineWidth = 7 * S; polyStroke(SNL.c, cap, 2 * S);
    SNL.c.restore();
    SNL.c.strokeStyle = U.rgba(sc, 0.6); SNL.c.lineWidth = 2.4 * S; polyStroke(SNL.c, cap, 0.6 * S);
    STONE = { x0, y0, w, h, path: P };
  }

  function buildForest() {
    LSC = Math.min(dpr, 1.25);
    FL = mkL(W, H, LSC); ML = mkL(W, H, LSC); NL = mkL(W, H, LSC); RL = mkL(W, H, LSC); SNL = mkL(W, H, LSC);
    DM = mkL(W, H, LSC); SGM = mkL(W, H, LSC);
    const r = U.rng(90210), rr = (a, b) => a + r() * (b - a);
    // far: a misty floor, then two ranks of thin trunks
    bank(FL, -4, W + 4, () => 0.712 * H, { fill: rgb(6, 13, 15), rimA: 0, snowA: 0.12, snowW: 1.5, day: { fill: DC.farBank } }, 3.3);
    for (let k = 0; k < 30; k++) {
      const x = ((k + rr(0.1, 0.9)) / 30) * W * 1.04 - 0.02 * W, w0 = rr(5, 11) * S;
      plant(FL, { x, base: (0.722 + rr(0, 0.012)) * H, top: -0.06 * H, w0, w1: w0 * 0.75, lean: rr(-8, 8) * S, flare: 0.35,
        branches: r() < 0.35 ? 1 : 0, brLen: 0.05 * H, roots: 0, nz: r() * 500 },
        { fill: rgb(8, 18, 21), rimA: 0.05, snowA: 0.15, snowW: 1.2, day: { fill: DC.farTrunk } }, r);
    }
    hazeVeil(DM.c, 0.12, 0.34, 0.24);
    for (let k = 0; k < 15; k++) {
      const x = ((k + rr(0.1, 0.9)) / 15) * W, w0 = rr(12, 24) * S;
      plant(FL, { x, base: (0.75 + rr(0, 0.02)) * H, top: -0.06 * H, w0, w1: w0 * 0.7, lean: rr(-12, 12) * S, flare: 0.5,
        branches: 1 + ((r() * 2) | 0), brLen: 0.08 * H, roots: 2, nz: r() * 500 },
        { fill: rgb(5, 12, 14), rimA: 0.09, snowA: 0.25, snowW: 1.5, day: { fill: DC.farTrunk2, lit: DC.farLit, rimK: 3 } }, r);
    }
    // the forest air between the far and the mid trees (aerial haze, in daylight)
    hazeVeil(DM.c, 0.08, 0.27, 0.17);
    // mid: the floor, then trunks that leave the clearing open
    bank(ML, -4, W + 4, (x) => (0.808 + 0.02 * Math.pow(Math.abs(x / W - 0.5) * 2, 2)) * H, { fill: rgb(2, 5, 5), rimA: 0.06, snowA: 0.35, snowW: 2,
      day: { fill: DC.midBank, tex: 260, lit: DC.moss2 } }, 7.9);
    const midX = [0.06, 0.14, 0.255, 0.33, 0.675, 0.735, 0.86, 0.935];
    for (const fx of midX) {
      const w0 = rr(30, 56) * S;
      plant(ML, { x: (fx + rr(-0.012, 0.012)) * W, base: (0.83 + rr(0, 0.02)) * H, top: -0.06 * H, w0, w1: w0 * 0.68, lean: rr(-16, 16) * S, flare: 0.6,
        branches: 2 + ((r() * 2) | 0), brLen: 0.13 * H, roots: 3, nz: r() * 500 },
        { fill: rgb(2, 5, 6), rimA: 0.17, snowA: 0.4, snowW: 1.5, bark: rgb(6, 11, 12), moss: 0.5,
          day: { fill: DC.midTrunk, lit: DC.midLit, bark: DC.midBark, moss: DC.moss, moss2: DC.moss2, rimK: 2.4 } }, r);
    }
    // the canopy roofs the far and mid layers
    buildCanopy();
    hazeVeil(DM.c, 0.04, 0.1, 0.06);
    for (const L of [RL, SNL, SGM]) {
      L.c.globalCompositeOperation = "destination-out"; L.c.drawImage(CL, 0, 0, W, CANOPY_H * H);
      L.c.globalCompositeOperation = "source-over";
    }
    SNL.c.drawImage(CSN, 0, 0, W, CANOPY_H * H);
    // near: banks in the corners, four great trunks framing the clearing
    const nb = { fill: DC.nearBank, tex: 160, lit: DC.moss2 };
    bank(NL, -4, 0.36 * W, (x) => (0.86 + 0.13 * U.smoothstep(0.04 * W, 0.36 * W, x)) * H, { fill: "#000", rimA: 0.16, snowA: 0.6, snowW: 2.6, day: nb }, 12.1);
    bank(NL, 0.64 * W, W + 4, (x) => (0.86 + 0.13 * U.smoothstep(0.96 * W, 0.64 * W, x)) * H, { fill: "#000", rimA: 0.12, snowA: 0.6, snowW: 2.6, day: nb }, 15.4);
    const near = [[0.035, 0.09, 1.0], [0.205, 0.04, 0.965], [0.79, 0.046, 0.975], [0.968, 0.1, 1.02]];
    for (const [fx, fw, fb] of near) {
      const w0 = fw * W;
      plant(NL, { x: fx * W, base: fb * H, top: -0.08 * H, w0, w1: w0 * 0.62, lean: rr(-20, 20) * S, flare: 0.7,
        branches: 2 + ((r() * 2) | 0), brLen: 0.2 * H, roots: 4, nz: r() * 500 },
        { fill: "#000", rimA: 0.3, rimW: 1.6, snowA: 0.6, snowW: 2.2, bark: rgb(7, 11, 11), moss: 1,
          day: { fill: DC.nearTrunk, lit: DC.nearLit, bark: DC.nearBark, moss: DC.moss, moss2: DC.moss2, rimK: 1.6 } }, r);
    }
  }

  // daylight haze over what is already in DM (dense around the forest floor's depth, thin up in the roof)
  function hazeVeil(c, a0, a1, a2) {
    const hc = DC.haze, g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, U.rgba(hc, a0)); g.addColorStop(0.62, U.rgba(hc, a1)); g.addColorStop(0.82, U.rgba(hc, a2)); g.addColorStop(1, U.rgba(hc, a2 * 0.3));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }

  // shafts through the roof: [x at top (frac W), top width, bottom width, strength]
  const BEAMS = [[0.15, 0.018, 0.05, 0.55], [0.26, 0.026, 0.085, 1], [0.34, 0.014, 0.05, 0.7], [0.41, 0.03, 0.09, 0.85], [0.55, 0.016, 0.05, 0.5], [0.7, 0.012, 0.04, 0.4]];
  const BEAM_SLOPE = Math.tan(0.34);
  function buildShafts(col, gain = 1) {
    const sc = 1 / 3, L = mkL(W, H, sc), c = L.c;
    const cc = U.safe(col);
    c.globalCompositeOperation = "lighter";
    const ang = 0.34;
    // [x at top (frac W), top width, bottom width, strength]
    const beams = BEAMS;
    const len = 1.05 * H;
    for (const [fx, wt, wb, s] of beams) {
      c.save();
      c.translate(fx * W, -0.04 * H); c.rotate(-ang);
      const g = c.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, U.rgba(cc, 0)); g.addColorStop(0.2, U.rgba(cc, U.clamp(0.1 * s * gain)));
      g.addColorStop(0.55, U.rgba(cc, U.clamp(0.12 * s * gain))); g.addColorStop(1, U.rgba(cc, 0));
      c.fillStyle = g;
      for (const k of [1, 0.78, 0.58, 0.4, 0.24]) {
        c.globalAlpha = 0.24;
        c.beginPath();
        c.moveTo(-wt * W * k / 2, 0); c.lineTo(wt * W * k / 2, 0);
        c.lineTo(wb * W * k / 2, len); c.lineTo(-wb * W * k / 2, len); c.closePath(); c.fill();
      }
      c.restore();
      // a pool of light where the beam meets the floor
      const fy = 0.86 * H, fxx = fx * W + Math.tan(ang) * (fy + 0.04 * H);
      c.globalAlpha = U.clamp(0.07 * s * gain);
      c.drawImage(glowSprite(col, true), fxx - wb * W * 1.1, fy - 0.025 * H, wb * W * 2.2, 0.05 * H);
      c.globalAlpha = 1;
    }
    return L;
  }

  function buildFerns() {
    const r = U.rng(6061);
    FERNS = [];
    const spots = [[0.03, 1.01, 1.35], [0.115, 0.995, 1.0], [0.24, 1.0, 0.75], [0.31, 1.02, 0.6], [0.5, 1.045, 0.75],
      [0.69, 1.02, 0.6], [0.77, 1.0, 0.8], [0.885, 1.0, 1.1], [0.975, 1.01, 1.3]];
    for (const [fx, fy, s] of spots) {
      const nf = 4 + ((r() * 3) | 0), fr = [];
      for (let k = 0; k < nf; k++) {
        const a = U.lerp(-1.25, 1.25, (k + 0.5) / nf) + (r() - 0.5) * 0.3;
        fr.push([a, s * (0.075 + r() * 0.05) * H * (1 - 0.25 * Math.abs(a)), 0.5 + r() * 0.7, r() * TAU]);
      }
      FERNS.push({ x: fx * W, y: fy * H, fr });
    }
  }

  function buildRing() {
    const r = U.rng(1113);
    RING = [];
    const N = 11, cx = 0.5 * W, cy = 0.866 * H, rx = 0.215 * W, ry = 0.04 * H;
    for (let k = 0; k < N; k++) {
      const th = Math.PI * 0.62 + (k / N) * TAU + (r() - 0.5) * 0.22; // starts front-left, goes round
      const sn = Math.sin(th);
      RING.push({
        x: cx + Math.cos(th) * rx, y: cy + sn * ry, back: sn < 0,
        s: 0.015 * H * (0.75 + r() * 0.5) * (0.85 + 0.15 * sn),
        at: (8 + k * 23) * 60 + r() * 300,           // lights one by one over the evening
        violet: r() < 0.3, ph: r() * TAU, lean: (r() - 0.5) * 0.3,
      });
    }
  }

  // ------------------------------------------------------------------ vines (precomputed geometry)
  const GROW_P = 1.4;                       // tip slows as it matures
  const CAP_S = 4.85 * 3600;                // everything finished by ~4h50
  const growEase = (f) => 1 - Math.pow(1 - f, GROW_P);
  const growInv = (u) => 1 - Math.pow(1 - u, 1 / GROW_P);
  let vines = [];
  let STEP = 4.5;
  let leafN = 0, LX, LY, LT, LSIDE, LOPEN, LSZ, LV, LI, LVAR, LPH, LK, LRT;
  let hiN = 0, HX, HY, HV, HI, HKIND, HPH, HVIS;
  let VL = null, vlKey = "", VLD = null, vlKeyD = "";

  function buildVines() {
    const r = U.rng(20261009);
    const rr = (a, b) => a + r() * (b - a);
    const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
    STEP = 4.5 * S;
    vines = [];
    const leaves = [], hil = [];
    const clk = { x: 0.5 * W, y: 0.42 * H, rx: 0.15 * W, ry: 0.15 * H };
    const inClock = (x, y) => Math.abs(x - clk.x) < clk.rx * 0.95 && Math.abs(y - 0.405 * H) < 0.075 * H;

    function walk(x, y, hd, len, o) {
      const n = Math.max(3, Math.floor(len / STEP) + 1);
      const xs = new Float32Array(n), ys = new Float32Array(n);
      let tx = o.tx, ty = o.ty, curl = 0;
      const nz = r() * 400;
      const curlN = o.curl ? Math.min(n - 2, Math.round((o.curlLen || 40 * S) / STEP)) : 0;
      for (let i = 0; i < n; i++) {
        xs[i] = x; ys[i] = y;
        let d = U.noise1(nz + i * (o.freq || 0.045)) * (o.wander || 0.07);
        if (tx != null) {
          if (Math.hypot(tx - x, ty - y) < 0.05 * H) tx = null;
          else d += wrap(Math.atan2(ty - y, tx - x) - hd) * o.steer;
        }
        if (o.lift) d += wrap(-Math.PI / 2 - hd) * o.lift;
        if (o.droop) d += wrap(Math.PI / 2 - hd) * o.droop;
        if (i > 8) {
          const m = 0.012 * H;
          if (x < m || x > W - m || y < m || y > H - m) d += wrap(Math.atan2(H / 2 - y, W / 2 - x) - hd) * 0.14;
        }
        if (curlN && i >= n - curlN) { curl += o.curl; d += curl * o.curlDir; }
        hd += d;
        x += Math.cos(hd) * STEP; y += Math.sin(hd) * STEP;
      }
      return { xs, ys, n };
    }

    const stemCols = [C.moss, C.deepTeal, C.mossDim, C.mossTeal, C.moss, C.mossDim];
    function addVine(p, o) {
      const vi = vines.length;
      const v = { xs: p.xs, ys: p.ys, n: p.n, start: o.start, dur: o.dur, w0: o.w0, col: U.safe(o.col), gi: 0, teal: o.teal, seed: o.seed || 0 };
      vines.push(v);
      const reach = (i) => {
        const u = i / (p.n - 1);
        if (u <= v.seed) return v.start;
        return v.start + v.dur * growInv(U.clamp((u - v.seed) / (1 - v.seed)));
      };
      const pick = () => {
        const q = r();
        return q < 0.05 ? 4 : q < 0.1 ? 5 : (o.teal ? (r() < 0.5 ? 2 : r() < 0.5 ? 3 : 0) : (r() < 0.65 ? 0 : 1));
      };
      let pos = rr(8, 16) * S, side = r() < 0.5 ? -1 : 1;
      const lim = (p.n - 2) * STEP;
      while (pos < lim) {
        const i = Math.floor(pos / STEP);
        const tang = Math.atan2(p.ys[i + 1] - p.ys[i], p.xs[i + 1] - p.xs[i]);
        const age = 1 - i / p.n;
        const ic = inClock(p.xs[i], p.ys[i]);
        const rt = reach(i);
        if (!ic || r() < 0.7) {
          leaves.push([p.xs[i], p.ys[i], tang, side, rr(0.55, 1.05),
            o.leaf * (0.55 + 0.6 * age) * rr(0.8, 1.2) * (ic ? 0.75 : 1), vi, i, pick(), r() * TAU, rt + rr(0.5, 4) * 60]);
        }
        if (!ic && r() < 0.75) {
          const j = Math.min(p.n - 2, i + Math.max(1, Math.round(o.gap * rr(0.35, 0.6) / STEP)));
          const tj = Math.atan2(p.ys[j + 1] - p.ys[j], p.xs[j + 1] - p.xs[j]);
          const late = Math.max(reach(j) + rr(45, 100) * 60, rr(1.6, 3.6) * 3600);
          if (late < CAP_S) leaves.push([p.xs[j], p.ys[j], tj, -side, rr(0.6, 1.1),
            o.leaf * (0.5 + 0.55 * age) * rr(0.75, 1.15), vi, j, pick(), r() * TAU, late]);
        }
        side = -side; if (r() < 0.18) side = -side;
        pos += o.gap * rr(0.75, 1.3) * (ic ? 1.4 : 1);
      }
      return v;
    }
    function spawn(edge, pos) {
      const j = rr(-0.35, 0.35);
      if (edge === "b") return [pos * W, H + 3, -Math.PI / 2 + j];
      if (edge === "t") return [pos * W, -3, Math.PI / 2 + j];
      if (edge === "l") return [-3, pos * H, rr(-0.6, 0.15)];
      return [W + 3, pos * H, Math.PI + rr(-0.15, 0.6)];
    }
    function primary(edge, pos, g) {
      const [x, y, hd] = spawn(edge, pos);
      const fromTop = edge === "t";
      const col = stemCols[(r() * stemCols.length) | 0];
      const teal = col === C.deepTeal || col === C.mossTeal;
      let o, start, dur, len, w0, leaf, gap;
      if (g === 0) {
        start = 0; dur = rr(45, 90) * 60; len = rr(0.2, 0.34) * H; w0 = 2.6 * S; leaf = 19 * S; gap = 30 * S;
        o = { wander: 0.08, lift: fromTop ? 0 : 0.012, droop: fromTop ? 0.02 : 0 };
      } else if (g === 1) {
        start = rr(10, 90) * 60; dur = rr(80, 150) * 60; len = rr(0.3, 0.5) * H; w0 = 2.9 * S; leaf = 20 * S; gap = 31 * S;
        const tx = edge === "l" ? rr(0.04, 0.2) * W : edge === "r" ? rr(0.8, 0.96) * W : U.clamp(x + rr(-0.2, 0.2) * W, 0.04 * W, 0.96 * W);
        const ty = edge === "t" ? rr(0.08, 0.24) * H : edge === "b" ? rr(0.7, 0.88) * H : rr(0.2, 0.85) * H;
        o = { wander: 0.075, tx, ty, steer: 0.012, lift: fromTop ? 0 : 0.004, droop: fromTop ? 0.008 : 0 };
      } else {
        start = rr(55, 160) * 60; dur = rr(80, 125) * 60; len = rr(0.55, 0.85) * H; w0 = 3.3 * S; leaf = 21 * S; gap = 30 * S;
        const a = rr(0, TAU);
        const tx = clk.x + Math.cos(a) * clk.rx * rr(0.6, 1.15), ty = clk.y + Math.sin(a) * clk.ry * rr(0.6, 1.2);
        o = { wander: 0.07, tx, ty, steer: 0.016, lift: 0, droop: fromTop ? 0.003 : 0 };
      }
      o.freq = 0.04;
      const p = walk(x, y, hd, len, o);
      const v = addVine(p, { start, dur: Math.min(dur, CAP_S - start), w0, col, teal, leaf, gap, seed: g === 0 ? 0.2 : 0 });
      const nb = g === 0 ? 1 + (r() < 0.5 ? 1 : 0) : 1 + Math.floor(r() * 2.6);
      for (let k = 0; k < nb; k++) {
        const u = rr(0.2, 0.85), i = Math.floor(u * (v.n - 2));
        const tang = Math.atan2(v.ys[i + 1] - v.ys[i], v.xs[i + 1] - v.xs[i]);
        const side = r() < 0.5 ? -1 : 1;
        const st = v.start + v.dur * growInv(i / (v.n - 1)) + rr(4, 18) * 60;
        if (st > CAP_S - 900) continue;
        const bd = Math.min(rr(40, 90) * 60, CAP_S - st);
        const curl = r() < 0.65;
        const bp = walk(v.xs[i], v.ys[i], tang + side * rr(0.55, 1.1), rr(0.07, g === 2 ? 0.24 : 0.17) * H,
          { wander: 0.06, freq: 0.06, lift: o.lift * 0.5, droop: o.droop * 0.5, curl: curl ? 0.022 : 0, curlDir: side, curlLen: rr(35, 70) * S });
        addVine(bp, { start: st, dur: bd, w0: w0 * 0.55, col, teal, leaf: leaf * 0.85, gap: gap * 1.1 });
        if (r() < 0.45) hil.push([bp.xs[bp.n - 1], bp.ys[bp.n - 1], vines.length - 1, bp.n - 1, r() < 0.5 ? 1 : 0, r() * TAU]);
      }
      const nh = g === 0 ? 0 : 1 + (r() < 0.5 ? 1 : 0);
      for (let k = 0; k < nh; k++) {
        const i = Math.floor(rr(0.25, 0.95) * (v.n - 1));
        hil.push([v.xs[i], v.ys[i], vines.indexOf(v), i, r() < 0.3 ? 1 : 0, r() * TAU]);
      }
    }

    // generation 0: corners and a couple of bottom sprouts (the first 15 minutes)
    [["b", 0.04], ["b", 0.96], ["t", 0.06], ["t", 0.93], ["b", 0.3]]
      .forEach(([e, p]) => primary(e, p, 0));
    // generation 1: the edges fill in
    const g1 = [["b", 0.16], ["b", 0.84], ["t", 0.22], ["t", 0.75], ["b", 0.92], ["l", 0.9]];
    g1.forEach(([e, p]) => primary(e, p + rr(-0.03, 0.03), 1));
    // generation 2: long runners that reach the stone
    const g2 = [["b", 0.36], ["b", 0.64], ["t", 0.38], ["t", 0.6], ["b", 0.47]];
    g2.forEach(([e, p]) => primary(e, p + rr(-0.03, 0.03), 2));

    leafN = leaves.length;
    LX = new Float32Array(leafN); LY = new Float32Array(leafN); LT = new Float32Array(leafN); LSIDE = new Float32Array(leafN);
    LOPEN = new Float32Array(leafN); LSZ = new Float32Array(leafN); LV = new Int32Array(leafN); LI = new Int32Array(leafN);
    LVAR = new Uint8Array(leafN); LPH = new Float32Array(leafN); LK = new Float32Array(leafN); LRT = new Float32Array(leafN);
    leaves.forEach((l, k) => {
      LX[k] = l[0]; LY[k] = l[1]; LT[k] = l[2]; LSIDE[k] = l[3]; LOPEN[k] = l[4]; LSZ[k] = l[5];
      LV[k] = l[6]; LI[k] = l[7]; LVAR[k] = l[8]; LPH[k] = l[9]; LRT[k] = l[10];
    });
    hiN = hil.length;
    HX = new Float32Array(hiN); HY = new Float32Array(hiN); HV = new Int32Array(hiN); HI = new Int32Array(hiN);
    HKIND = new Uint8Array(hiN); HPH = new Float32Array(hiN); HVIS = new Float32Array(hiN);
    hil.forEach((h, k) => { HX[k] = h[0]; HY[k] = h[1]; HV[k] = h[2]; HI[k] = h[3]; HKIND[k] = h[4]; HPH[k] = h[5]; });
    VL = mk(W, H); vlKey = "";
  }

  // grown index of every vine for an elapsed time e and a recede factor K (pure function)
  // dayG: null = the night layer (VL); a day grade = the stems in daylight greens, into VLD
  function renderVines(e, K, dayG) {
    const c = dayG ? VLD.c : VL.c;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.lineJoin = "round";
    const CH = 8;
    const dDark = dayG ? U.rgba(ink(DC.vineDark, dayG), 0.9) : null;
    for (let vi = 0; vi < vines.length; vi++) {
      const v = vines[vi];
      const f = U.clamp((e - v.start) / v.dur);
      const g = v.seed + (1 - v.seed) * growEase(f);
      const gi = g * (v.n - 1) * K;
      v.gi = gi;
      if (gi < 0.5) continue;
      const xs = v.xs, ys = v.ys;
      for (let pass = 0; pass < 3; pass++) {
        c.lineCap = "round";
        if (dayG) {
          if (pass === 1) continue;
          c.strokeStyle = pass === 0 ? dDark : U.rgba(ink(U.mix(v.col, DC.vine, 0.6), dayG), 1);
        } else if (pass === 0) c.strokeStyle = "rgba(0,0,0,0.82)";
        else if (pass === 1) c.strokeStyle = U.rgba(v.col, 0.06);
        else c.strokeStyle = U.rgba(U.scale(v.col, 0.62), 1);
        for (let s0 = 0; s0 < gi; s0 += CH) {
          const s1 = Math.min(s0 + CH, gi);
          const tpos = (s0 + s1) * 0.5 / Math.max(1, gi);
          const w = Math.max(0.6 * S, v.w0 * (1 - 0.72 * Math.sqrt(tpos)));
          c.beginPath(); c.moveTo(xs[s0], ys[s0]);
          const e1 = Math.floor(s1);
          for (let i = s0 + 1; i <= e1; i++) c.lineTo(xs[i], ys[i]);
          const fr = s1 - e1;
          if (fr > 0 && e1 + 1 < v.n) c.lineTo(U.lerp(xs[e1], xs[e1 + 1], fr), U.lerp(ys[e1], ys[e1 + 1], fr));
          c.lineWidth = pass === 0 ? w + 2.4 * S : pass === 1 ? w * 3 + 3 * S : w;
          c.stroke();
        }
      }
    }
    for (let k = 0; k < leafN; k++) {
      if (vines[LV[k]].gi < LI[k] + 1) { LK[k] = 0; continue; }
      LK[k] = U.smoothstep(LRT[k], LRT[k] + 1100, e) * U.smoothstep(0.35, 1, K);
    }
    for (let k = 0; k < hiN; k++) {
      const age = (vines[HV[k]].gi - HI[k]) * STEP;
      HVIS[k] = U.smoothstep(-2 * S, 30 * S, age);
    }
  }

  // ------------------------------------------------------------------ astronomy (moon for the shafts)
  function astro(date, lat, lon) {
    const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
    const L = (280.46 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
    const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
    const eps = (23.439 - 0.0000004 * n) * RAD;
    const gmst = (((18.697374558 + 24.06570982441908 * n) % 24) + 24) % 24;
    const lst = (gmst * 15 + lon) * RAD;
    const Lm = (218.316 + 13.176396 * n) * RAD, Mm = (134.963 + 13.064993 * n) * RAD, F = (93.272 + 13.22935 * n) * RAD;
    const lamM = Lm + 6.289 * RAD * Math.sin(Mm), betM = 5.128 * RAD * Math.sin(F);
    const moonRa = Math.atan2(Math.sin(lamM) * Math.cos(eps) - Math.tan(betM) * Math.sin(eps), Math.cos(lamM));
    const moonDec = Math.asin(Math.sin(betM) * Math.cos(eps) + Math.cos(betM) * Math.sin(eps) * Math.sin(lamM));
    let el = (lamM - lam) % TAU; if (el < 0) el += TAU;
    const phi = lat * RAD, Hh = lst - moonRa;
    const alt = Math.asin(Math.sin(phi) * Math.sin(moonDec) + Math.cos(phi) * Math.cos(moonDec) * Math.cos(Hh));
    return { alt, illum: (1 - Math.cos(el)) / 2 };
  }
  let astroCache = { key: -1, v: null };

  // ------------------------------------------------------------------ small glyphs
  // a closed bud on a short stem (heartbeat, work face)
  function bud(ctx, x, y, s, col, a, t, down) {
    const c = U.safe(col);
    ctx.lineCap = "round";
    ctx.strokeStyle = U.rgba(c, a * 0.55); ctx.lineWidth = 1.3 * S;
    ctx.beginPath(); ctx.moveTo(x, y + s * 2.1); ctx.lineTo(x, y + s * 0.5); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + s * 1.5); ctx.quadraticCurveTo(x - s * 0.8, y + s * 1.05, x - s * 1.05, y + s * 1.35);
    ctx.quadraticCurveTo(x - s * 0.55, y + s * 1.65, x, y + s * 1.5);
    ctx.moveTo(x, y + s * 1.25); ctx.quadraticCurveTo(x + s * 0.8, y + s * 0.8, x + s * 1.05, y + s * 1.1);
    ctx.quadraticCurveTo(x + s * 0.55, y + s * 1.4, x, y + s * 1.25);
    ctx.strokeStyle = U.rgba(c, a * 0.45); ctx.lineWidth = 1 * S; ctx.stroke();
    if (!down) {
      const br = 0.85 + 0.15 * Math.sin(t * TAU / 7);
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.quadraticCurveTo(x + s * 0.78, y - s * 0.05, x, y + s * 0.55);
      ctx.quadraticCurveTo(x - s * 0.78, y - s * 0.05, x, y - s);
      ctx.fillStyle = U.rgba(c, a * 0.22 * br); ctx.fill();
      ctx.strokeStyle = U.rgba(c, a * 0.9); ctx.lineWidth = 1.4 * S; ctx.stroke();
      ctx.strokeStyle = U.rgba(c, a * 0.4); ctx.lineWidth = 1 * S;
      ctx.beginPath(); ctx.moveTo(x, y - s * 0.6); ctx.lineTo(x, y + s * 0.4); ctx.stroke();
    } else {
      const ph = (t % 1.8) / 1.8;
      ctx.strokeStyle = U.rgba(c, a * 0.5 * (1 - ph)); ctx.lineWidth = 1.4 * S;
      ctx.beginPath(); ctx.arc(x, y, s * (1.2 + ph * 2.4), 0, TAU); ctx.stroke();
      glow(ctx, col, x, y, s * 4.2, s * 4.2, a * (0.22 + 0.08 * Math.sin(t * 3.4)));
      const rot = t * 0.15;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const q = rot + i / 6 * TAU, cq = Math.cos(q), sq = Math.sin(q);
        const tx = x + cq * s * 1.35, ty = y + sq * s * 1.35;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + cq * s * 0.7 - sq * s * 0.5, y + sq * s * 0.7 + cq * s * 0.5, tx, ty);
        ctx.quadraticCurveTo(x + cq * s * 0.7 + sq * s * 0.5, y + sq * s * 0.7 - cq * s * 0.5, x, y);
      }
      ctx.fillStyle = U.rgba(c, a * 0.18); ctx.fill();
      ctx.strokeStyle = U.rgba(c, a * 0.95); ctx.lineWidth = 1.4 * S; ctx.stroke();
      ctx.fillStyle = U.rgba(c, a * (0.75 + 0.25 * Math.sin(t * 3.4)));
      ctx.beginPath(); ctx.arc(x, y, s * 0.28, 0, TAU); ctx.fill();
    }
  }

  // a tiny leaf outline for orderly linework (work face)
  function tinyLeaf(ctx, x, y, ang, len, wid) {
    const ca = Math.cos(ang), sa = Math.sin(ang), na = -sa, nb = ca;
    const tx = x + ca * len, ty = y + sa * len;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + ca * len * 0.5 + na * wid, y + sa * len * 0.5 + nb * wid, tx, ty);
    ctx.quadraticCurveTo(x + ca * len * 0.5 - na * wid, y + sa * len * 0.5 - nb * wid, x, y);
  }

  // carved runes, one per host (elder futhark shapes, unit height)
  const RUNES = [
    [[0, -0.5, 0, 0.5], [0, -0.32, 0.3, -0.5], [0, -0.06, 0.3, -0.26]],                       // fehu
    [[0, -0.5, 0, 0.5], [0, -0.5, 0.28, -0.3], [0.28, -0.3, 0, -0.1], [0, -0.1, 0.3, 0.5]],    // raido
    [[0, -0.5, 0, 0.5], [0, -0.08, -0.3, -0.44], [0, -0.08, 0.3, -0.44]],                     // algiz
    [[0, -0.5, 0.27, -0.18], [0.27, -0.18, -0.25, 0.45], [0, -0.5, -0.27, -0.18], [-0.27, -0.18, 0.25, 0.45]], // othala
    [[-0.28, -0.5, -0.28, 0.5], [0.28, -0.5, 0.28, 0.5], [-0.28, -0.5, 0.28, 0.5], [0.28, -0.5, -0.28, 0.5]], // dagaz
    [[0, -0.5, 0, 0.5], [0, -0.24, 0.28, 0], [0.28, 0, 0, 0.24]],                             // thurisaz
    [[0, -0.5, 0.3, 0], [0.3, 0, 0, 0.5], [0, 0.5, -0.3, 0], [-0.3, 0, 0, -0.5]],             // ingwaz
    [[0, -0.5, 0, 0.5], [0, -0.5, -0.3, -0.2], [0, -0.5, 0.3, -0.2]],                         // tiwaz
  ];
  const runeOf = (name) => { let h = 7; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % RUNES.length; };
  function rune(ctx, gi, x, y, s, col, a) {
    const c = U.safe(col);
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of RUNES[gi]) { ctx.moveTo(x + x1 * s, y + y1 * s); ctx.lineTo(x + x2 * s, y + y2 * s); }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(1,2,2,0.9)"; ctx.lineWidth = 5 * S; ctx.stroke();     // the groove
    ctx.strokeStyle = U.rgba(c, a * 0.16); ctx.lineWidth = 7 * S; ctx.stroke();    // soft halo
    ctx.strokeStyle = U.rgba(c, a); ctx.lineWidth = 2 * S; ctx.stroke();
  }

  // ------------------------------------------------------------------ hero clock canvas
  let clk = null, clkKey = "", clkPx = 0;
  const CLK_Q = 40;
  function clockCanvas(str, wq) {
    const key = str + "|" + wq;
    if (key === clkKey && clk) return clk;
    if (!clk) {
      clkPx = Math.round(0.27 * H);
      if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); LS = "letterSpacing" in mctx; }
      mctx.font = `200 ${clkPx}px ${SANS}`;
      const tw = mctx.measureText("00:00").width;
      const pad = Math.ceil(clkPx * 0.3);
      clk = mk(tw * 1.12 + pad * 2, clkPx * 1.3 + pad * 2);
      clk.pad = pad;
    }
    clkKey = key;
    const w = wq / CLK_Q, c = clk.c, cx = clk.w / 2, cy = clk.h / 2 + clkPx * 0.03;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, clk.w, clk.h);
    c.globalCompositeOperation = "source-over";
    c.textAlign = "center"; c.textBaseline = "middle";
    const col = U.safe(U.mix(C.frost, C.lichen, w));
    const g = U.lerp(15, 26, w) * S * dpr;
    const pass = (weight, a) => {
      if (a <= 0.01) return;
      c.font = `${weight} ${clkPx}px ${SANS}`;
      c.shadowColor = U.rgba(col, 0.85);
      c.shadowBlur = g * 2; c.fillStyle = U.rgba(col, 0.2 * a); c.fillText(str, cx, cy);
      c.shadowBlur = g; c.fillStyle = U.rgba(col, 0.3 * a); c.fillText(str, cx, cy);
      c.shadowBlur = 0; c.fillStyle = U.rgba(col, U.lerp(0.9, 0.8, w) * a); c.fillText(str, cx, cy);
    };
    const wb = U.smoothstep(0.3, 0.7, w);
    pass(200, 1 - wb); pass(300, wb);
    if (w > 0.02 && erodeTex) {
      c.globalCompositeOperation = "destination-out";
      c.globalAlpha = w;
      c.drawImage(erodeTex, 0, 0, clk.w, clk.h);
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
    }
    return clk;
  }

  const agoH = (d, now) => {
    const h = (now - d) / 3600000;
    return h >= 1 && h < 48 ? `${Math.round(h)} h ago` : U.fmtAgo(d, now);
  };

  // ------------------------------------------------------------------ news: a line of print above the clock
  // Layout (word wrap + ellipsis in the real font) is cached per (text, size, width); the runs themselves
  // are cached text sprites, so a steady headline costs a few blits per frame.
  const lays = new Map();
  function wrap2(str, o, maxW, two) {
    const px = Math.round(o.px);
    const key = `${str}|${px}|${o.weight || 400}|${o.spacing || 0}|${Math.round(maxW)}|${two ? 2 : 1}`;
    let l = lays.get(key);
    if (l) return l;
    if (lays.size > 12) lays.clear();
    if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); LS = "letterSpacing" in mctx; }
    mctx.font = `${o.weight || 400} ${px}px ${SANS}`; if (LS) mctx.letterSpacing = `${(o.spacing || 0) * px}px`;
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
  // critical: a small alarm-red bloom (six leaf petals) that breathes slowly, a ring rising off it
  function bloom(ctx, x, y, s, t, a, p) {
    const c = U.safe(C.alarm);
    glow(ctx, C.alarm, x, y, s * 4, s * 4, a * (0.16 + 0.16 * p));
    ctx.beginPath();
    for (let i = 0; i < 6; i++) tinyLeaf(ctx, x, y, i / 6 * TAU - Math.PI / 2, s * 1.35, s * 0.42);
    ctx.fillStyle = U.rgba(c, a * (0.12 + 0.12 * p)); ctx.fill();
    ctx.strokeStyle = U.rgba(c, a * (0.6 + 0.35 * p)); ctx.lineWidth = 1.2 * S; ctx.stroke();
    const ph = ((t / 3.2) + 0.25) % 1;
    ctx.strokeStyle = U.rgba(c, a * 0.4 * (1 - ph) * (1 - ph)); ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.arc(x, y, s * (1.6 + 2.6 * ph), 0, TAU); ctx.stroke();
    ctx.fillStyle = U.rgba(U.safe(C.flare), a * (0.7 + 0.3 * p));
    ctx.beginPath(); ctx.arc(x, y, s * 0.24, 0, TAU); ctx.fill();
  }
  function drawNews(ctx, n, now, t, a, sink) {
    if (!n || !n.headline || a <= 0.004) return;
    const crit = !!n.critical, p = crit ? 0.5 + 0.5 * Math.sin(t * TAU / 3.2) : 0;
    const ho = crit ? { px: 0.028 * H, weight: 300, color: C.alarm, glow: 8, core: 0.92 }
                    : { px: 0.028 * H, weight: 300, color: C.teal, glow: 4, core: 0.92 };
    const lines = wrap2(n.headline, ho, 0.56 * W, true);
    const lh = 0.036 * H, y0 = (lines.length > 1 ? 0.068 : 0.085) * H + sink;
    let tw0 = 0;
    for (let i = 0; i < lines.length; i++) {
      const w = text(ctx, lines[i], 0.5 * W, y0 + i * lh, ho, "center", 1, a * (crit ? 0.72 + 0.26 * p : 0.76));
      if (!i) tw0 = w;
    }
    const age = newsAge(n.published, now);
    const src = String(n.source || "").toUpperCase() + (age ? `  ·  ${age.toUpperCase()}` : "");
    text(ctx, src, 0.5 * W, y0 + (lines.length - 1) * lh + 0.039 * H,
      { px: Math.max(12, 0.0165 * H), spacing: 0.24, color: crit ? C.flare : C.tealDim, glow: crit ? 4 : 2, core: 0.9 }, "center", 1, a * (crit ? 0.8 : 0.85));
    if (crit) bloom(ctx, 0.5 * W - tw0 / 2 - 0.032 * H, y0, 0.011 * H, t, a, p);
  }

  // Overlay dimming: while an info panel is up, the work face and the stone's runes are drawn into one
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

  // ------------------------------------------------------------------ build
  function build() {
    S = H / 1080;
    sprites.clear(); glows.clear(); lays.clear(); dimL = null;
    if (!erodeTex) buildErode();
    if (!mistA) {
      mistA = buildMist(C.fog, false, 0); mistB = buildMist(C.fogDusk, false, 0);
      bandA = buildMist(C.fog, true, 9.3); bandB = buildMist(C.fogDusk, true, 9.3);
      mistDay = buildMist(DC.mist, false, 4.4); bandDay = buildMist(DC.mist, true, 12.7);
    }
    FLECKS = null;
    if (!leafSpr.length) buildLeaves();
    buildStars();
    buildForest();
    buildRing();
    drawRingDay(DM.c, true, 1, null);   // the far half of the ring stands behind the stone
    buildStone();
    SHM = buildShafts(C.moonShaft); SHD = buildShafts(C.sunShaft); SHN = buildShafts(DC.sunNoon, 2.4); SHG = buildShafts(DC.sunGold, 2.4);
    buildFerns();
    buildVines();
    DB.key = ""; DB.a = DB.b = DB.s = null; PIX = null; leafD = []; leafDKey = ""; vlKeyD = "";
    clk = null; clkKey = "";
    built = `${W}x${H}@${dpr}`;
  }

  // ------------------------------------------------------------------ weather (eased state)
  const WX = { cloud: 0, fog: 0, rain: 0, storm: 0, snow: 0, wind: 0.1, warm: 1, dust: 0, wet: 0, init: false };
  const WXK = ["cloud", "fog", "rain", "storm", "snow", "wind", "warm"];
  function wxTarget(wx) {
    const c = (wx && wx.condition) || "clear";
    const it = wx && wx.intensity != null ? U.clamp(wx.intensity) : 0.5;
    const T = {
      cloud: 0, fog: 0, rain: 0, storm: 0, snow: 0,
      wind: U.clamp(((wx && wx.windKph) || 5) / 45),
      warm: wx && wx.tempC != null ? U.smoothstep(-4, 6, wx.tempC) : 1,
    };
    if (c === "cloudy") T.cloud = 0.2 + 0.8 * it;
    else if (c === "fog") { T.cloud = 0.6; T.fog = 0.45 + 0.55 * it; }
    else if (c === "rain") { T.cloud = 0.9; T.rain = 0.2 + 0.8 * it; T.fog = 0.12; }
    else if (c === "storm") { T.cloud = 1; T.rain = 0.75 + 0.25 * it; T.storm = 0.4 + 0.6 * it; T.fog = 0.08; }
    else if (c === "snow") { T.cloud = 0.85; T.snow = 0.3 + 0.7 * it; T.fog = 0.15; }
    return T;
  }
  function wxUpdate(wx, dt) {
    const T = wxTarget(wx);
    if (!WX.init) {
      for (const k of WXK) WX[k] = T[k];
      WX.dust = T.snow > 0.05 ? 1 : 0; WX.wet = T.rain; WX.init = true; return;
    }
    const k = 1 - Math.exp(-dt / 2.8), ks = 1 - Math.exp(-dt / 25);
    for (const n of WXK) WX[n] += (T[n] - WX[n]) * k;
    WX.dust += ((T.snow > 0.05 ? 1 : 0) - WX.dust) * (T.snow > 0.05 ? k * 0.5 : ks);
    WX.wet += (T.rain - WX.wet) * (T.rain > WX.wet ? k : ks);
  }
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  // rare, dim, distant lightning: a deterministic schedule in 7 s slots
  const BOLT_N = 4;
  let BOLTS = [];
  function buildBolts() {
    const r = U.rng(5511);
    BOLTS = [];
    for (let b = 0; b < BOLT_N; b++) {
      const segs = [];
      let x = 0, y = 0.0;
      const main = [[x, y]];
      while (y < 0.62) { x += (r() - 0.5) * 0.035; y += 0.02 + r() * 0.04; main.push([x, y]); }
      segs.push(main);
      for (let k = 0; k < 2; k++) {
        const s0 = main[2 + ((r() * (main.length - 4)) | 0)];
        let bx = s0[0], by = s0[1]; const br = [[bx, by]], dir = r() < 0.5 ? -1 : 1;
        for (let j = 0; j < 5; j++) { bx += dir * (0.008 + r() * 0.02); by += 0.015 + r() * 0.03; br.push([bx, by]); }
        segs.push(br);
      }
      BOLTS.push(segs);
    }
  }
  buildBolts();
  function flash(t, storm) {
    if (storm < 0.02) return null;
    const SLOT = 7, slot = Math.floor(t / SLOT);
    for (const s of [slot, slot - 1]) {
      if (hash(s * 7.13) > 0.12 + 0.3 * storm) continue;
      const t0 = s * SLOT + hash(s * 3.77 + 1) * (SLOT - 1.4), d = t - t0;
      if (d < 0 || d > 1.4) continue;
      let e = (1 - Math.exp(-d / 0.02)) * Math.exp(-d / 0.08);
      if (d > 0.2) e += 0.65 * Math.exp(-(d - 0.2) / 0.11);
      if (d > 0.5 && hash(s * 9.1) > 0.4) e += 0.4 * Math.exp(-(d - 0.5) / 0.2);
      return { e: Math.min(1, e * 1.4) * storm, x: 0.12 + 0.76 * hash(s * 1.31 + 2), bolt: Math.abs(s) % BOLT_N };
    }
    return null;
  }

  // ------------------------------------------------------------------ particles (typed arrays)
  const RN = 520, RX = new Float32Array(RN), RY = new Float32Array(RN), RV = new Float32Array(RN), RLN = new Float32Array(RN), RD = new Uint8Array(RN);
  const SNN = 340, SX = new Float32Array(SNN), SY = new Float32Array(SNN), SV = new Float32Array(SNN), SSZ = new Float32Array(SNN), SPH = new Float32Array(SNN);
  (function () {
    const r = U.rng(9001);
    for (let i = 0; i < RN; i++) {
      RX[i] = r() * 1.2 - 0.1; RY[i] = r() * 1.1 - 0.05; RD[i] = r() < 0.65 ? 0 : 1;
      RV[i] = (RD[i] ? 1.5 : 1.05) * (0.85 + r() * 0.3); RLN[i] = (RD[i] ? 0.03 : 0.018) * (0.7 + r() * 0.6);
    }
    for (let i = 0; i < SNN; i++) {
      SX[i] = r(); SY[i] = r(); SV[i] = 0.022 + r() * 0.035; SSZ[i] = 1.1 + Math.pow(r(), 2) * 2.2; SPH[i] = r() * TAU;
    }
  })();

  // fireflies and wisps: fixed seeds; motion is a function of t
  const FF_N = 60;
  const FFX = new Float32Array(FF_N), FFY = new Float32Array(FF_N), FFP = new Float32Array(FF_N), FFR = new Float32Array(FF_N), FFD = new Float32Array(FF_N), FFZ = new Float32Array(FF_N);
  (function () {
    const r = U.rng(4471);
    for (let i = 0; i < FF_N; i++) {
      FFX[i] = 0.04 + r() * 0.92; FFY[i] = 0.5 + Math.pow(r(), 0.8) * 0.44;
      if (i % 6 === 5) FFY[i] = 0.24 + r() * 0.3;
      FFP[i] = r() * 100; FFR[i] = 2.6 + r() * 3.2; FFD[i] = r() < 0.5 ? -1 : 1;
      FFZ[i] = 0.6 + Math.pow(r(), 1.5) * 0.9 + (FFY[i] > 0.8 ? 0.25 : 0);
    }
  })();
  const WS_N = 7;
  const WSX = new Float32Array(WS_N), WSY = new Float32Array(WS_N), WSP = new Float32Array(WS_N);
  (function () {
    const r = U.rng(777);
    for (let i = 0; i < WS_N; i++) { WSX[i] = 0.1 + r() * 0.8; WSY[i] = 0.42 + r() * 0.36; WSP[i] = r() * 100; }
  })();

  // ------------------------------------------------------------------ daytime: the old wood in the sun
  // dk = how much of the day scene shows (a pure function of frame.day: 0 at night, ~1 from just after
  // sunrise to just before sunset). The day wood (DM) is graded for the sun's height and the weather and
  // baked into DB, keyed by quantised elevation (0.5 deg) and weather; a key change cross-fades over ~2 s.
  const dayK = (day) => U.smoothstep(0.05, 0.75, day);
  // the sun elevation the day scene is lit for: the real one, unless frame.day says it is lighter than that
  // (frame.day is the civil-twilight ramp smoothstep(-6, 8, elevation); a pinned day still gets a real sky)
  const dayElev = (elev, day) => Math.max(elev, -6 + 14 * (0.5 - Math.sin(Math.asin(1 - 2 * U.clamp(day)) / 3)));
  const DAY_EXP = 0.62, DAY_SKY = 0.62;   // exposure (the bake is also capped by measurement: see bakeDay)
  const DAY_MEAN = 36;                     // the bake's mean luminance cap; live light (shafts, life) adds a few
  const DB = { a: null, b: null, s: null, key: "", mix: 1 };
  let heavy = false;   // one heavy day job per frame (bake, exposure readback, vine/leaf re-colour): no spikes
  const ink = (col, G) => U.safe(U.mix(U.scale(col, G.bri), G.tint, G.tintA));

  function dayGrade(elev, u) {
    const qe = Math.round(elev * 2) / 2, qu = Math.round(U.clamp(u) * 20) / 20;   // u: sunrise 0 -> sunset 1
    const qc = Math.round(U.clamp(WX.cloud) * 4) / 4;
    const qg = Math.round(U.clamp(WX.rain * 0.6 + WX.storm * 0.7) * 4) / 4;
    const qs = Math.round(U.clamp(WX.dust) * 2) / 2, qf = Math.round(U.clamp(WX.fog) * 4) / 4;
    const e = qe;
    const hi = U.smoothstep(3, 35, e);                                   // morning -> noon
    const gold = U.smoothstep(-5, 1, e) * (1 - U.smoothstep(4, 15, e));  // golden hour, either end of the day
    const blue = 1 - U.smoothstep(-5, 1, e);                             // blue hour: the sun just under
    const up = U.smoothstep(-6, 12, e);                                  // how much light there is at all
    const ck = U.smoothstep(0.15, 0.95, qc);                             // overcast
    // the sky glimpsed through the roof: blue overhead, paler haze low; gold at either end of the day
    let zen = U.mix(hex("#2a5088"), hex("#2e66b4"), hi), hor = U.mix(hex("#7e98b0"), hex("#80a6cc"), hi);
    zen = U.mix(zen, hex("#585488"), gold * 0.5); hor = U.mix(hor, hex("#d88c46"), gold * 0.9);
    zen = U.mix(zen, hex("#16204a"), blue * 0.85); hor = U.mix(hor, hex("#6a4460"), blue * 0.75);
    // bright overcast -> grey rain -> a dark storm
    const ov = U.mix(hex("#80878a"), hex("#40464c"), qg), ovz = U.mix(hex("#727a7e"), hex("#30343c"), qg);
    zen = U.mix(zen, U.scale(ovz, 0.5 + 0.5 * up), ck); hor = U.mix(hor, U.scale(ov, 0.5 + 0.5 * up), ck);
    if (qs > 0) { zen = U.mix(zen, hex("#808898"), qs * 0.7); hor = U.mix(hor, hex("#949aa6"), qs * 0.7); }
    const sk = (0.5 + 0.5 * up + 0.15 * gold) * DAY_SKY;
    zen = U.safe(U.scale(zen, sk)); hor = U.safe(U.scale(hor, sk));
    const bri = U.clamp((0.26 + 0.74 * U.smoothstep(-4, 24, e)) * (1 - 0.1 * ck) * (1 - 0.34 * qg) * (1 - 0.3 * qs)) * DAY_EXP;
    // the light's colour: warm at golden hour, violet in the blue hour, cool grey under cloud
    let tint = hex("#e08a3c"), tintA = 0.13 * gold * (1 - 0.7 * ck);
    if (blue > 0.01) { tint = U.mix(tint, hex("#3c3c78"), blue / (blue + gold + 1e-3)); tintA += 0.22 * blue; }
    if (ck > 0.01) { tint = U.mix(tint, hex("#6a767a"), ck * 0.7); tintA = U.lerp(tintA, 0.1, ck); }
    if (qs > 0) { tint = U.mix(tint, hex("#8890a4"), qs * 0.5); tintA = Math.max(tintA, 0.1 * qs); }
    tint = U.scale(tint, 0.55 + 0.45 * up);
    const warm = 1 - U.smoothstep(6, 24, e);
    return { key: `${qe}|${qu}|${qc}|${qg}|${qs}|${qf}`, ink: `${Math.round(bri * 50)}|${Math.round(tintA * 50)}|${(tint.r / 12) | 0},${(tint.g / 12) | 0},${(tint.b / 12) | 0}`,
      e, u: qu, up, gold, blue, ck, qg, qs, qf, zen, hor, bri, tint, tintA, warm,
      sun: U.mix(DC.sunNoon, DC.sunGold, warm), clear: (1 - ck) * (1 - qg) * U.smoothstep(-1, 4, e) };
  }

  // sun flecks: where light falls through the roof onto the floor, the banks and the stone (seeded)
  let FLECKS = null;
  function buildFlecks() {
    const r = U.rng(3131);
    FLECKS = [];
    for (let k = 0; k < 46; k++) {
      const onStone = k < 9;
      const x = onStone ? (0.39 + 0.1 * r()) * W : (0.12 + 0.76 * r()) * W;
      const y = onStone ? (0.3 + 0.45 * r()) * H : (0.835 + 0.14 * Math.pow(r(), 0.8)) * H;
      const w = (onStone ? 8 + 16 * r() : 14 + 46 * r()) * S;
      FLECKS.push([x, y, w, w * (onStone ? 0.8 : 0.22 + 0.12 * r()), 0.4 + 0.6 * r()]);
    }
  }

  function bakeDay(L, G, k) {
    const c = L.c;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, L.cv.width, L.cv.height);
    c.setTransform(LSC, 0, 0, LSC, 0, 0);
    c.drawImage(DM.cv, 0, 0, W, H);
    // grade the wood only (the sky holes stay clear): the hour's brightness, then the light's colour
    c.globalCompositeOperation = "source-atop";
    if (G.bri < 0.999) { c.fillStyle = `rgba(0,0,0,${(1 - G.bri).toFixed(3)})`; c.fillRect(0, 0, W, H); }
    if (G.tintA > 0.004) { c.fillStyle = U.rgba(U.safe(G.tint), G.tintA); c.fillRect(0, 0, W, H); }
    // the clearing in the sun, and flecks of light on the floor and the stone
    if (G.clear > 0.01) {
      c.globalCompositeOperation = "lighter";
      const k = G.clear * G.up;
      glow(c, U.mix(DC.floorSun, G.sun, 0.5), 0.47 * W, 0.885 * H, 0.3 * W, 0.06 * H, 0.16 * k, true);
      if (!FLECKS) buildFlecks();
      for (const [x, y, w, h, s] of FLECKS) glow(c, G.sun, x, y, w, h, 0.32 * s * k, true);
    }
    // after snow: the ground white under the trees, every branch and the stone's cap dusted (not darkened
    // with the wood: snow is the brightest thing in a winter wood)
    if (G.qs > 0) {
      c.globalCompositeOperation = "source-over";
      const sk = (0.55 + 0.45 * G.up) * G.qs;
      c.globalAlpha = 0.9 * sk; c.drawImage(SGM.cv, 0, 0, W, H);
      c.globalAlpha = 0.85 * sk; c.drawImage(SNL.cv, 0, 0, W, H); c.globalAlpha = 1;
    }
    // the sky behind it all: the sun's glow (high at noon, low through the trunks at either end of the
    // day, on the morning or the evening side), over the blue (or grey)
    c.globalCompositeOperation = "destination-over";
    const lo = 1 - U.smoothstep(0, 28, G.e), sx = U.lerp(0.46, 0.24, G.u) * W, sy = U.lerp(0.04, 0.6, lo) * H;
    const sc = U.mix(G.hor, G.sun, 0.45 + 0.35 * G.gold);
    glow(c, sc, sx, sy, U.lerp(0.55, 0.7, lo) * W, U.lerp(0.42, 0.3, lo) * H, (0.55 + 0.35 * G.gold) * G.clear, true);
    if (G.gold > 0.01) glow(c, G.sun, sx, sy, 0.22 * W, 0.12 * H, 0.5 * G.gold * G.clear, true);
    const g = c.createLinearGradient(0, 0, 0, 0.8 * H);
    g.addColorStop(0, U.rgba(G.zen, 1)); g.addColorStop(0.55, U.rgba(U.mix(G.zen, G.hor, 0.6), 1)); g.addColorStop(1, U.rgba(G.hor, 1));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "source-over";
    // fog: the wood goes milky, the far trunks drown first
    if (G.qf > 0) {
      const mc = ink(DC.mist, { bri: 0.62 + 0.3 * G.up, tint: G.tint, tintA: G.tintA * 0.5 }), fg = G.qf;
      const fgr = c.createLinearGradient(0, 0, 0, H);
      fgr.addColorStop(0, U.rgba(mc, 0.36 * fg)); fgr.addColorStop(0.45, U.rgba(mc, 0.56 * fg)); fgr.addColorStop(0.72, U.rgba(mc, 0.44 * fg)); fgr.addColorStop(1, U.rgba(mc, 0.2 * fg));
      c.fillStyle = fgr; c.fillRect(0, 0, W, H);
      // the sun as a pale disc of brightness somewhere in the murk: the fog glows, it is not just grey
      glow(c, U.mix(mc, G.sun, 0.3), U.lerp(0.46, 0.24, G.u) * W, 0.36 * H, 0.62 * W, 0.5 * H, 0.42 * fg * G.up, true);
    }
    // measured exposure: the bake never uses more than its share of the brightness budget; a rainy or stormy
    // day sits lower still (it should look darker than a clear one); without sun shafts there is a little
    // more room. k comes from exposureFor (an estimate of this same bake, in plain JS), so it is applied here.
    if (k < 0.999) {
      c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
      c.fillStyle = `rgba(0,0,0,${(1 - k).toFixed(4)})`; c.fillRect(0, 0, W, H);
    }
  }
  // the exposure for a grade: the same bake at 96 x 54, read back (cheap: a tiny canvas, nothing big to flush)
  // The exposure for a grade, estimated in plain JS on a 64 x 36 sample of the day wood (read once per build):
  // the same grade, snow, sky and fog maths as bakeDay. No canvas readback per bake (a readback mid-frame
  // waits for the GPU to finish everything queued, a visible hitch).
  let PIX = null;
  function samplePix() {
    const w = 64, h = 36, read = (cv) => {
      const s = document.createElement("canvas"); s.width = w; s.height = h;
      const x = s.getContext("2d", { willReadFrequently: true }); x.drawImage(cv, 0, 0, w, h);
      return x.getImageData(0, 0, w, h).data;
    };
    PIX = { w, h, dm: read(DM.cv), sgm: read(SGM.cv), snl: read(SNL.cv) };
  }
  function exposureFor(G) {
    if (!PIX) samplePix();
    const { w, h, dm, sgm, snl } = PIX;
    const bri = G.bri, ta = G.tintA, tc = U.safe(G.tint), tr = tc.r * ta, tg = tc.g * ta, tb = tc.b * ta, kb = bri * (1 - ta);
    const sk = (0.55 + 0.45 * G.up) * G.qs, fg = G.qf;
    const mc = fg > 0 ? ink(DC.mist, { bri: 0.62 + 0.3 * G.up, tint: G.tint, tintA: G.tintA * 0.5 }) : null;
    const zm = U.mix(G.zen, G.hor, 0.6);
    let s = 0;
    for (let j = 0; j < h; j++) {
      const v = (j + 0.5) / h, u = U.clamp(v / 0.8);
      const sky = u < 0.55 ? U.mix(G.zen, zm, u / 0.55) : U.mix(zm, G.hor, (u - 0.55) / 0.45);
      const fa = fg > 0 ? fg * (v < 0.45 ? U.lerp(0.36, 0.56, v / 0.45) : v < 0.72 ? U.lerp(0.56, 0.44, (v - 0.45) / 0.27) : U.lerp(0.44, 0.2, (v - 0.72) / 0.28)) : 0;
      for (let i = 0; i < w; i++) {
        const q = (j * w + i) * 4, a = dm[q + 3] / 255;
        let r = dm[q] * kb + tr, g = dm[q + 1] * kb + tg, b = dm[q + 2] * kb + tb;
        if (sk > 0) {
          const s1 = sgm[q + 3] / 255 * 0.9 * sk, s2 = snl[q + 3] / 255 * 0.85 * sk;
          r = r * (1 - s1) + sgm[q] * s1; g = g * (1 - s1) + sgm[q + 1] * s1; b = b * (1 - s1) + sgm[q + 2] * s1;
          r = r * (1 - s2) + snl[q] * s2; g = g * (1 - s2) + snl[q + 1] * s2; b = b * (1 - s2) + snl[q + 2] * s2;
        }
        r = r * a + sky.r * (1 - a); g = g * a + sky.g * (1 - a); b = b * a + sky.b * (1 - a);
        if (fa > 0) { r = r * (1 - fa) + mc.r * fa; g = g * (1 - fa) + mc.g * fa; b = b * (1 - fa) + mc.b * fa; }
        s += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
    }
    // (+ the sun's glow behind the roof and the flecks on the floor, roughly)
    const m = (s / (w * h)) * 1.04 + 3 * G.clear * G.up, cap = (DAY_MEAN + 4 * (1 - G.clear)) * (1 - 0.3 * G.qg);
    return m > cap ? cap / m : 1;
  }
  // the day wood onto the wall at alpha a (cross-fading from the previous bake after a key change)
  function dayWood(ctx, G, a, dt) {
    if (G.key !== DB.key) {
      if (!DB.a) { DB.a = mkL(W, H, LSC); DB.b = mkL(W, H, LSC); DB.s = mkL(W, H, LSC); DB.mix = 1; }
      else { const tmp = DB.b; DB.b = DB.a; DB.a = tmp; DB.mix = 0; }
      bakeDay(DB.a, G, exposureFor(G)); DB.key = G.key; heavy = true;
    }
    DB.mix = Math.min(1, DB.mix + dt / 2.2);
    let src = DB.a;
    if (DB.mix < 1) {
      const c = DB.s.c;
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1; c.drawImage(DB.b.cv, 0, 0);
      c.globalAlpha = U.smoothstep(0, 1, DB.mix); c.drawImage(DB.a.cv, 0, 0); c.globalAlpha = 1;
      src = DB.s;
    }
    if (a <= 0.003) return;
    ctx.globalAlpha = U.clamp(a); ctx.drawImage(src.cv, 0, 0, W, H); ctx.globalAlpha = 1;
  }

  // shafts of sunlight through the roof: long and golden when the sun is low, steep and pale at noon.
  // The beam layer is sheared about the floor, so the pools of light stay in the clearing.
  let shaftSk = 0;
  function dayShafts(ctx, G, a, t, elev) {
    shaftSk = U.lerp(0.5, -0.18, U.smoothstep(2, 62, elev));
    const sa = a * G.clear * (1 - 0.75 * WX.fog) * (0.84 + 0.16 * U.noise1(t * 0.07 + 1.7));
    if (sa <= 0.004) return;
    const y0 = 0.86 * H;
    ctx.setTransform(dpr, 0, shaftSk * dpr, dpr, -shaftSk * y0 * dpr, 0);
    const k = 1;
    ctx.globalAlpha = U.clamp(sa * (1 - G.warm) * k); ctx.drawImage(SHN.cv, 0, 0, W, H);
    ctx.globalAlpha = U.clamp(sa * G.warm * k * 0.72); ctx.drawImage(SHG.cv, 0, 0, W, H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
  }
  // how much a point sits inside a shaft (0..1)
  function inShaft(x, y) {
    let best = 0;
    const yy = y + 0.04 * H, len = 1.05 * H;
    for (const [fx, wt, wb, s] of BEAMS) {
      const cx = fx * W + BEAM_SLOPE * yy + shaftSk * (y - 0.86 * H);
      const hw = U.lerp(wt, wb, U.clamp(yy / len)) * W * 0.5;
      const d = (x - cx) / hw;
      const k = s * Math.exp(-d * d * 1.5);
      if (k > best) best = k;
    }
    return best;
  }

  // drifting pollen and seeds (they catch the light in the shafts), a few butterflies, and the faintest
  // fey shimmer about the ring. Fixed seeds; motion is a function of t.
  const MO_N = 56;
  const MOX = new Float32Array(MO_N), MOY = new Float32Array(MO_N), MOP = new Float32Array(MO_N), MOS = new Float32Array(MO_N);
  (function () {
    const r = U.rng(2468);
    for (let i = 0; i < MO_N; i++) { MOX[i] = 0.08 + r() * 0.84; MOY[i] = r(); MOP[i] = r() * 100; MOS[i] = r(); }
  })();
  const FLY = [[0.27, 0.66, 0], [0.7, 0.72, 1], [0.42, 0.79, 0], [0.82, 0.58, 2], [0.58, 0.62, 1]];
  function drawDayLife(ctx, t, a, G) {
    if (a <= 0.01) return;
    const calm = (1 - WX.rain) * (1 - WX.storm) * (1 - WX.snow);
    // pollen and seeds
    const pa = a * calm * (0.5 + 0.5 * G.up);
    if (pa > 0.01) {
      const pc = U.safe(ink(DC.pollen, { bri: Math.max(0.75, G.bri), tint: G.sun, tintA: 0.3 }));
      ctx.fillStyle = U.rgba(pc, 1);
      for (let i = 0; i < MO_N; i++) {
        const ph = MOP[i];
        const x = (MOX[i] + 0.05 * U.noise1(t * 0.03 + ph) + 0.01 * U.noise1(t * 0.2 + ph * 3)) * W;
        let v = (MOY[i] + t * (0.003 + 0.004 * MOS[i]) + 0.03 * U.noise1(t * 0.05 + ph + 7)) % 1;
        const y = (0.12 + 0.76 * v) * H;
        const sh = inShaft(x, y) * G.clear;
        const tw = 0.6 + 0.4 * Math.sin(t * (1.3 + MOS[i]) + ph);
        const al = pa * (0.1 + 0.8 * sh) * tw * U.smoothstep(0, 0.08, v) * (1 - U.smoothstep(0.92, 1, v));
        if (al < 0.01) continue;
        const s = (0.9 + 1.3 * MOS[i]) * S;
        ctx.globalAlpha = U.clamp(al);
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }
    // butterflies: a slow wandering flight, wings beating (seen from above, they narrow to a line)
    const ba = a * calm * WX.warm * U.smoothstep(2, 10, G.e) * (1 - 0.6 * G.ck) * (1 - WX.fog);
    if (ba > 0.01) {
      const s = 0.0105 * H;
      for (let i = 0; i < FLY.length; i++) {
        const [cx, cy, ci] = FLY[i], ph = i * 17.3;
        const life = U.smoothstep(-0.4, 0.2, Math.sin(t * TAU / (70 + i * 13) + ph)); // they come and go
        if (life < 0.02) continue;
        const px = (q) => (cx + 0.17 * U.noise1(q * 0.045 + ph) + 0.05 * U.noise1(q * 0.23 + ph * 2)) * W;
        const x = px(t), y = (cy + 0.08 * U.noise1(t * 0.06 + ph + 9) + 0.012 * Math.sin(t * 2.6 + ph)) * H;
        const dir = px(t + 0.2) >= x ? 1 : -1;
        const open = 0.12 + 0.88 * Math.abs(Math.cos(t * (9 + i) + ph));
        const col = ink(ci === 0 ? DC.fly1 : ci === 1 ? DC.fly2 : DC.fly3, { bri: Math.max(0.8, G.bri), tint: G.tint, tintA: G.tintA * 0.5 });
        const al = ba * life;
        ctx.save(); ctx.translate(x, y); ctx.rotate(dir * 0.35 + 0.15 * Math.sin(t * 1.7 + ph));
        ctx.fillStyle = U.rgba(col, al * 0.9);
        ctx.beginPath();
        for (const sd of [-1, 1]) {
          ctx.ellipse(sd * s * 0.55 * open, -s * 0.18, s * 0.6 * open, s * 0.5, sd * 0.5, 0, TAU);   // forewing
          ctx.ellipse(sd * s * 0.38 * open, s * 0.32, s * 0.4 * open, s * 0.34, -sd * 0.4, 0, TAU);   // hindwing
        }
        ctx.fill();
        ctx.fillStyle = U.rgba({ r: 30, g: 24, b: 18 }, al);
        ctx.fillRect(-0.9 * S, -s * 0.45, 1.8 * S, s * 0.95);
        ctx.restore();
      }
    }
    // the fey, barely: a few sparks wink about the ring and fade
    const fa = a * (1 - 0.5 * G.ck);
    const fc = U.safe(C.mush);
    for (let k = 0; k < 6; k++) {
      const P = 5.5 + k * 1.7, ph = k * 2.71, c = Math.floor(t / P + ph), u = (t / P + ph) - c;
      const m = RING[(c * 7 + k * 3) % RING.length];
      if (!m) continue;
      const al = fa * 0.4 * Math.sin(Math.PI * U.clamp(u * 2.5)) * (u < 0.4 ? 1 : 0);
      if (al < 0.01) continue;
      const x = m.x + Math.sin(c * 3.1) * m.s * 0.8, y = m.y - m.s * (1.2 + u * 2.2);
      glow(ctx, C.mush, x, y, 0.009 * H, 0.009 * H, al * 0.5);
      ctx.fillStyle = U.rgba(fc, al); ctx.fillRect(x - 0.7 * S, y - 0.7 * S, 1.4 * S, 1.4 * S);
    }
  }

  // the faerie ring by day: plain little mushrooms, unlit (G null = neutral daylight, for the DM bake)
  function drawRingDay(c, back, a, G) {
    if (a <= 0.01) return;
    const capC = G ? ink(DC.capDay, G) : DC.capDay, topC = G ? ink(DC.capTop, G) : DC.capTop, stC = G ? ink(DC.stemDay, G) : DC.stemDay;
    for (let k = 0; k < RING.length; k++) {
      const m = RING[k];
      if (m.back !== back) continue;
      const s = m.s, x = m.x, y = m.y, top = y - s * 0.75, lean = m.lean * s;
      c.strokeStyle = U.rgba(stC, a * 0.85); c.lineWidth = Math.max(1, s * 0.24); c.lineCap = "round";
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + lean * 0.3, y - s * 0.4, x + lean, top); c.stroke();
      c.beginPath(); c.ellipse(x + lean, top, s * 0.62, s * 0.42, m.lean * 0.6, Math.PI, 0); c.closePath();
      c.fillStyle = U.rgba(capC, a * 0.95); c.fill();
      c.strokeStyle = U.rgba(topC, a * 0.8); c.lineWidth = 1.4 * S;
      c.beginPath(); c.ellipse(x + lean, top - 0.5 * S, s * 0.48, s * 0.32, m.lean * 0.6, Math.PI * 1.1, Math.PI * 1.65); c.stroke();
    }
  }

  // vine leaves by day: solid leaves in the light, rebuilt when the grade changes
  let leafD = [], leafDKey = "";
  function buildLeavesDay(G) {
    const L = (s, edge, fill, rib) => leafSprite(s, ink(edge, G), ink(fill, G), ink(rib, G), false, true);
    leafD = [
      L(0, hex("#7aa448"), hex("#3e6e2c"), hex("#2a4a1e")),
      L(1, hex("#86aa4c"), hex("#4a7a30"), hex("#2e4e20")),
      L(0, hex("#6aa080"), hex("#2e6a50"), hex("#204a38")),
      L(2, hex("#70a684"), hex("#357054"), hex("#244c3a")),
      L(1, hex("#8ab060"), hex("#4a8048"), hex("#2e5a34")),
      L(0, hex("#c08a44"), hex("#9a5a26"), hex("#6a3a18")),   // autumn
    ];
    leafDKey = G.ink;
  }

  // ------------------------------------------------------------------ now playing
  // Work: one small line "title — artist" low in the centre, under the hosts (a play / pause glyph, an optional
  // album thumbnail, a progress hairline). Ambient: the song as a faint line of glowing script drifting at the
  // stone's foot by the faerie ring, a fey ballad. Layout (ellipsis in the real font) is cached per text and
  // width; the runs are cached sprites.
  const SERIF = '"Cormorant Garamond", "EB Garamond", Garamond, Georgia, "DejaVu Serif", serif';
  const npLays = new Map();
  function npLine(np, font, maxW) {
    const key = `${np.title}|${np.artist}|${font}|${Math.round(maxW)}`;
    let s = npLays.get(key);
    if (s !== undefined) return s;
    if (npLays.size > 8) npLays.clear();
    if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); LS = "letterSpacing" in mctx; }
    mctx.font = font; if (LS) mctx.letterSpacing = "0px";
    const clean = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
    const ti = clean(np.title), ar = clean(np.artist), wd = (x) => mctx.measureText(x).width;
    s = ar ? `${ti} — ${ar}` : ti;
    if (wd(s) > maxW) {
      if (!ar) s = U.ellipsize(ti, maxW, mctx);
      else {
        // the artist keeps at least 40% of the line; the title gets the rest
        const a = U.ellipsize(ar, Math.max(0.4 * maxW, maxW - wd(ti + " — ")), mctx);
        s = `${U.ellipsize(ti, maxW - wd(" — " + a), mctx)} — ${a}`;
      }
    }
    npLays.set(key, s);
    return s;
  }
  // the ambient script: italic serif with a soft glow, rendered once per (text, size, colour)
  const scripts = new Map();
  function scriptSprite(str, px, col) {
    const key = `${str}|${px}|${ck(col)}`;
    let s = scripts.get(key);
    if (s) return s;
    if (scripts.size > 6) scripts.clear();
    const font = `italic 400 ${px}px ${SERIF}`;
    if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); LS = "letterSpacing" in mctx; }
    mctx.font = font; if (LS) mctx.letterSpacing = "0px";
    const tw = Math.max(1, mctx.measureText(str).width), g = 0.4 * px, pad = Math.ceil(g * 2.3 + 6);
    const w = Math.ceil(tw + pad * 2), h = Math.ceil(px * 1.5 + pad * 2);
    const { cv, c } = mk(w, h);
    c.font = font; c.textAlign = "left"; c.textBaseline = "middle";
    const cc = U.safe(col), x = pad, y = h / 2;
    c.shadowColor = U.rgba(cc, 0.9);
    c.shadowBlur = g * 2 * dpr; c.fillStyle = U.rgba(cc, 0.4); c.fillText(str, x, y);
    c.shadowBlur = g * dpr; c.fillStyle = U.rgba(cc, 0.45); c.fillText(str, x, y);
    c.shadowBlur = 0; c.fillStyle = U.rgba(cc, 0.9); c.fillText(str, x, y);
    s = { cv, w, h, pad, tw };
    scripts.set(key, s);
    return s;
  }
  // album art: loaded once per URL (same origin), drawn small and dim; a failed load is simply not drawn
  const arts = new Map();
  function artFor(url, size) {
    if (!url || typeof url !== "string") return null;
    let a = arts.get(url);
    if (!a) {
      if (arts.size > 6) arts.clear();
      a = { ok: false, bad: false, img: new Image(), cv: null, px: 0 };
      a.img.onload = () => { a.ok = a.img.naturalWidth > 0 && a.img.naturalHeight > 0; a.bad = !a.ok; };
      a.img.onerror = () => { a.bad = true; };
      a.img.src = url;
      arts.set(url, a);
    }
    if (!a.ok || a.bad) return null;
    const px = Math.max(1, Math.round(size * dpr));
    if (!a.cv || a.px !== px) {
      try {
        const cv = document.createElement("canvas"); cv.width = cv.height = px;
        const c = cv.getContext("2d"), iw = a.img.naturalWidth, ih = a.img.naturalHeight, m = Math.min(iw, ih);
        c.drawImage(a.img, (iw - m) / 2, (ih - m) / 2, m, m, 0, 0, px, px);
        a.cv = cv; a.px = px;
      } catch (e) { a.bad = true; return null; }
    }
    return a.cv;
  }
  const hasProgress = (np) => typeof np.progressMs === "number" && typeof np.durationMs === "number" && np.durationMs > 0;
  function drawNowPlayingWork(ctx, np, a, sink) {
    if (!np || !np.title || a <= 0.004) return;
    const paused = !np.isPlaying, k = paused ? 0.5 : 1;
    const px = Math.round(Math.max(13, 0.021 * H));
    const o = { px, weight: 400, color: C.teal, glow: 2, core: 0.9 };
    const str = npLine(np, `400 ${px}px ${SANS}`, 0.3 * W);
    const s = sprite(str, o), tw = s.tw;
    const y = 0.952 * H + sink, gs = 0.0085 * H, gap = 0.011 * H;
    const as = 0.034 * H, art = artFor(np.art, as);
    const total = (art ? as + gap : 0) + gs * 1.3 + gap + tw;
    let x = 0.5 * W - total / 2;
    if (art) {
      ctx.globalAlpha = U.clamp(a * 0.45 * k);
      ctx.drawImage(art, x, y - as / 2, as, as);
      ctx.globalAlpha = U.clamp(a * 0.5 * k); ctx.strokeStyle = U.rgba(U.safe(C.tealDim), 1); ctx.lineWidth = 1 * S;
      ctx.strokeRect(x + 0.5, y - as / 2 + 0.5, as - 1, as - 1);
      x += as + gap;
    }
    // the glyph: a small play wedge, or the two bars of a pause
    const gc = U.safe(paused ? C.tealDim : C.green);
    ctx.globalAlpha = U.clamp(a * (paused ? 0.75 : 0.7)); ctx.fillStyle = U.rgba(gc, 1);
    ctx.beginPath();
    if (paused) {
      ctx.rect(x, y - gs * 0.62, gs * 0.38, gs * 1.24); ctx.rect(x + gs * 0.78, y - gs * 0.62, gs * 0.38, gs * 1.24);
    } else {
      ctx.moveTo(x, y - gs * 0.65); ctx.lineTo(x + gs * 1.15, y); ctx.lineTo(x, y + gs * 0.65); ctx.closePath();
    }
    ctx.fill();
    ctx.globalAlpha = 1;
    x += gs * 1.3 + gap;
    text(ctx, str, x, y, o, "left", 1, a * 0.82 * k);
    // the progress hairline under the words
    if (hasProgress(np)) {
      const p = U.clamp(np.progressMs / np.durationMs), ly = y + px * 0.92, tc = U.safe(C.tealDim), fc = U.safe(C.teal);
      ctx.lineCap = "butt"; ctx.lineWidth = 1 * S;
      ctx.globalAlpha = U.clamp(a * 0.3 * k); ctx.strokeStyle = U.rgba(tc, 1);
      ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + tw, ly); ctx.stroke();
      ctx.globalAlpha = U.clamp(a * 0.75 * k); ctx.strokeStyle = U.rgba(fc, 1);
      ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + tw * p, ly); ctx.stroke();
      ctx.fillStyle = U.rgba(fc, 1);
      ctx.beginPath(); ctx.arc(x + tw * p, ly, 1.6 * S, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  function drawNowPlayingAmbient(ctx, np, a, t, dk) {
    if (!np || !np.title || a <= 0.004) return;
    const px = Math.round(0.027 * H);
    const str = npLine(np, `italic 400 ${px}px ${SERIF}`, 0.34 * W);
    const s = scriptSprite(str, px, U.mix(C.lichen, C.mush, 0.25));
    // drifts slowly about the stone's foot, breathing like the ring
    const x = 0.5 * W + 0.009 * W * Math.sin(t * TAU / 53), y = 0.94 * H + 0.005 * H * Math.sin(t * TAU / 37 + 1.1);
    const al = a * (np.isPlaying ? 1 : 0.55) * U.lerp(0.42, 0.5, dk) * (0.85 + 0.15 * Math.sin(t * TAU / 11));
    ctx.globalAlpha = U.clamp(al);
    ctx.drawImage(s.cv, x - s.w / 2, y - s.h / 2, s.w, s.h);
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ sound cues from the wood's own events
  // owls on a deterministic-ish schedule (hashed slots of real time); a chime as each ring mushroom lights;
  // drips for a while after rain; thunder on the frame the lightning flashes (flash() uses the same slots).
  const SND = { t: -1, E: null, soggy: -1, drip: 0 };
  function slotHit(t0, t1, slot, p, salt) {
    const s = Math.floor(t1 / slot);
    for (let k = s; k >= s - 1; k--) {
      if (hash(k * 1.37 + salt) > p) continue;
      const at = k * slot + hash(k * 2.91 + salt + 0.5) * slot;
      if (at > t0 && at <= t1) return k;
    }
    return null;
  }
  function flashStart(t0, t1, storm) {
    if (storm < 0.02) return null;
    const SLOT = 7, s = Math.floor(t1 / SLOT);
    for (let q = s; q >= s - 1; q--) {
      if (hash(q * 7.13) > 0.12 + 0.3 * storm) continue;
      const ts = q * SLOT + hash(q * 3.77 + 1) * (SLOT - 1.4);
      if (ts > t0 && ts <= t1) return q;
    }
    return null;
  }
  const wxRain = (w) => !w ? 0 : w.condition === "rain" ? 0.2 + 0.8 * U.clamp(+w.intensity || 0) : w.condition === "storm" ? 0.75 + 0.25 * U.clamp(+w.intensity || 0) : 0;
  function sfx(f, t, E, ambA, dk) {
    const A = AW.audio, w = f.signals && f.signals.weather;
    const t0 = SND.t, E0 = SND.E;
    SND.t = t; SND.E = E;
    const rain = wxRain(w), day = U.clamp(f.day || 0);
    const dtS = t0 < 0 ? 0 : t - t0;
    if (SND.soggy < 0) SND.soggy = rain > 0 ? 1 : 0;
    SND.soggy = rain > 0 ? 1 : SND.soggy * Math.exp(-Math.max(0, dtS) / 420);   // the canopy drips for a while after rain
    if (!A || t0 < 0 || dtS <= 0 || dtS > 1) return;
    // thunder: the flash and the cue share their slot; dimmer storms are farther away
    if (ambA > 0.05) {
      const q = flashStart(t0, t, WX.storm);
      if (q !== null) {
        const I = w ? U.clamp(+w.intensity || 0) : 0.5;
        A.cue("thunder", { distance: U.clamp(0.95 - 0.45 * WX.storm + 0.3 * (hash(q * 5.3) - 0.5), 0.3, 1),
          gain: 0.55 + 0.4 * I, pan: (0.12 + 0.76 * hash(q * 1.31 + 2) - 0.5) * 1.2 });
      }
    }
    // an owl, a few times an hour at night (not in the rain)
    if (day < 0.25 && rain < 0.5) {
      const k = slotHit(t0, t, 300, 0.3, 17.7);
      if (k !== null) A.cue("owl", { pan: (hash(k * 4.1) - 0.5) * 1.6, distance: 0.35 + 0.5 * hash(k * 6.7), freq: 290 + 70 * hash(k * 8.3), gain: 0.8 });
    }
    // a soft chime as each mushroom of the ring begins to glow (only where the lit ring is seen)
    if (E0 !== null && E > E0 && E - E0 < 30 && ambA > 0.3 && dk < 0.8) {
      for (let k = 0; k < RING.length; k++) {
        const m = RING[k], at = m.at + 60;
        if (at > E0 && at <= E) {
          A.cue("chime", { notes: 1, freq: m.violet ? 783.99 : [880, 987.77, 1174.66, 1318.51][k % 4],
            pan: U.clamp((m.x / W - 0.5) * 1.6, -1, 1), distance: 0.35, gain: 0.5 });
        }
      }
    }
    // drips from the canopy after rain (masked by a downpour)
    if (SND.soggy > 0.06 && rain < 0.6 && t >= SND.drip) {
      if (SND.drip > 0) A.cue("drip", { gain: 0.3 + 0.35 * Math.random(), pan: Math.random() * 1.6 - 0.8, distance: 0.2 + 0.5 * Math.random() });
      SND.drip = t + Math.min(60, (3 + 9 * Math.random()) / SND.soggy);
    }
  }
  const sstep = U.smoothstep;
  function ringLit(E) {
    if (!RING.length) return 0;
    let s = 0;
    for (const m of RING) s += sstep(m.at, m.at + 240, E);
    return s / RING.length;
  }

  let heldE = 0;           // frozen ambient elapsed: in work mode core reports 0, but the evening must recede from where it was
  let lastT = -1;
  let cat = null, catMoon = 0.6;   // the cat (K); how much moonlight reaches the clearing this frame

  // The cat lives in the faerie ring, at the right foot of the standing stone: awake early in the evening, a
  // loaf later, curled up asleep inside the ring in the small hours (AW.cat.autoPose). Moonlight through the
  // roof gap rims it from above-left; the ring's mushrooms (as they light) and the fireflies glow on its low
  // right side, and a firefly or two drifts about it. By day: dappled sun (brighter where a shaft falls), the
  // light's colour on the coat and a soft contact shadow. Rain, snow and the low mist are drawn in front.
  function drawCat(ctx, f, b, t, E, dk, G) {
    if (!cat) { if (!AW.cat) return; cat = AW.cat.create(31); }
    const x = 0.655 * W, y = 0.884 * H, size = 0.13 * H;
    const nk = 1 - dk, moon = catMoon;
    const ring = ringLit(E);
    const ffK = WX.warm * Math.pow(1 - WX.rain, 1.6) * (1 - WX.snow) * (1 - 0.6 * WX.storm);
    const flick = 0.8 + 0.2 * U.noise1(t * 0.7 + 4.2);
    let light = 0.2 + 0.09 * moon, tint = C.moonShaft, tintAmt = 0.45, sunA = 0;
    if (G && dk > 0.001) {
      const sh = inShaft(x, y - 0.5 * size) * G.clear;
      const dl = (0.18 + 0.6 * (G.bri / DAY_EXP)) * (1 - 0.2 * WX.cloud) + 0.12 * sh + 0.03 * U.noise1(t * 0.25 + 9);   // dappled
      light = U.lerp(light, dl, dk);
      tint = U.mix(tint, G.tint, dk); tintAmt = U.lerp(tintAmt, U.clamp(0.2 + 2 * G.tintA), dk);
      sunA = dk * (0.1 + 0.24 * G.clear + 0.2 * sh);
    }
    const rimTop = U.safe(U.mix(U.mix(C.moonShaft, C.lichen, 0.25), G ? G.sun : C.moonShaft, dk));
    // in rain it hunkers down into a loaf rather than sitting up in it
    let pose = AW.cat.autoPose(f);
    if (pose === "sit" && WX.rain + WX.storm > 0.35) pose = "loaf";
    cat.draw(ctx, f, {
      x, y, size, facing: -1, pose,
      light, tint, tintAmt,
      rim: [
        { color: rimTop, a: nk * (0.3 + 0.36 * moon) + sunA, dx: -0.45, dy: -1 },
        { color: U.safe(C.mush), a: nk * 0.36 * ring, dx: 1, dy: 0.2, width: 0.03 },
        { color: U.safe(C.firefly), a: nk * 0.28 * ffK * flick, dx: 0.7, dy: -0.5, width: 0.025 },
      ],
      glow: nk * 0.6,
      shadow: 0.25 + 0.45 * dk,
      alpha: U.smoothstep(0.28, 0.9, b),
    });
    // two fireflies keep it company at night (drifting about its head, flashing now and then)
    const fa = U.smoothstep(0.28, 0.9, b) * nk * ffK * (f.cat ? f.cat.a : 0);
    if (fa < 0.01) return;
    const fc = U.safe(C.firefly);
    for (let k = 0; k < 2; k++) {
      const ph = k * 2.7 + 0.6;
      const fx = x + size * (0.55 * Math.sin(t * 0.21 + ph) + 0.25 * U.noise1(t * 0.13 + ph * 3)) - 0.1 * size;
      const fy = y - size * (0.95 + 0.35 * Math.sin(t * 0.17 + ph * 2) + 0.15 * U.noise1(t * 0.19 + ph));
      const p = Math.pow(U.clamp(Math.sin(t * TAU / (5.3 + 1.9 * k) + ph * 4)), 6);
      glow(ctx, C.firefly, fx, fy, 0.05 * H, 0.05 * H, fa * (0.05 + 0.1 * p), true);
      glow(ctx, C.firefly, fx, fy, 0.018 * H, 0.018 * H, fa * (0.12 + 0.4 * p));
      ctx.fillStyle = U.rgba(fc, fa * (0.25 + 0.65 * p));
      ctx.beginPath(); ctx.arc(fx, fy, 1.6 * S, 0, TAU); ctx.fill();
    }
  }

  // ------------------------------------------------------------------ theme
  AW.registerTheme({
    id: "nature",
    name: "Nature",
    init(ctx, env) {
      dpr = env.dpr || 1; W = env.width; H = env.height; build();
      if (!cat && AW.cat) cat = AW.cat.create(31);
    },
    resize(env) { dpr = env.dpr || 1; W = env.width; H = env.height; build(); },
    destroy() {
      sprites.clear(); glows.clear(); lays.clear(); dimL = null; vines = []; VL = null; built = ""; vlKey = ""; clk = null; clkKey = "";
      FL = ML = NL = RL = SNL = SL = SR = OGL = SHM = SHD = CL = CR = CSN = null; WX.init = false;
      DM = SHN = SHG = SGM = null; DB.a = DB.b = DB.s = null; DB.key = ""; PIX = null; VLD = null; leafD = []; leafDKey = ""; vlKeyD = "";
    },

    // the shared info overlay, dressed as this theme: cold teal print in work, moss-light and firefly in ambient
    overlayStyle(f) {
      const s = U.smoothstep(0.3, 0.7, U.clamp(f.blend || 0));
      return {
        font: SANS,
        ink: U.safe(U.mix(C.frost, C.lichen, s)),
        dim: U.safe(U.mix(C.tealDim, C.moss, s)),
        accent: U.safe(U.mix(C.green, C.amber, s)),
        alarm: U.safe(U.mix(C.alarm, C.ember, s * 0.5)),
        glow: U.lerp(0.4, 0.55, s),
        rule: "hairline",
        caps: false,
      };
    },

    // the wood as sound: rustle and birdsong by day; crickets on warm nights and a faint fey shimmer that
    // grows as the ring lights over the evening; wind and rain from the weather. (Cues: see sfx().)
    soundscape(f) {
      const w = (f.signals && f.signals.weather) || {};
      const cond = w.condition || "clear";
      const wind = w.windKph != null && isFinite(+w.windKph) ? +w.windKph : 5, T = w.tempC != null && isFinite(+w.tempC) ? +w.tempC : 12;
      const day = U.clamp(f.day || 0), rain = wxRain(w), wet = U.clamp(rain * 1.2);
      const snow = cond === "snow";
      return {
        forest: U.clamp((0.5 * day + 0.1 * (1 - day) + 0.3 * sstep(10, 40, wind)) * (snow ? 0.5 : 1), 0, 0.8),
        birds: 0.6 * day * sstep(4, 9, T) * (1 - 0.85 * wet) * (1 - 0.5 * sstep(25, 50, wind)),
        crickets: 0.5 * (1 - day) * sstep(5, 12, T) * (1 - wet),
        magic: 0.25 * (1 - day) * (0.25 + 0.75 * ringLit(heldE)) * (1 - 0.5 * wet),
        wind: U.clamp(0.8 * sstep(6, 55, wind) + (cond === "storm" ? 0.15 : 0) + (snow ? 0.1 : 0)),
        rain,
      };
    },

    render(ctx, f) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.width, f.height);
      if (f.width !== W || f.height !== H || (f.dpr || 1) !== dpr || !built) {
        dpr = f.dpr || 1; W = f.width; H = f.height; build();
      }
      const b = U.clamp(f.blend), t = f.t, now = f.now, Sg = f.signals || {};
      const dt = lastT < 0 ? 0 : U.clamp(t - lastT, 0, 0.1); lastT = t;
      const np = Sg.nowPlaying;
      const dl = Sg.daylight;
      const workA = 1 - U.smoothstep(0, 0.65, b);
      const ambA = U.smoothstep(0.2, 1, b);
      const elev = dl ? dl.elevation : -30;
      const light = dl ? dl.light : 0;
      const dusk = U.smoothstep(-13, -1, elev) * (1 - U.smoothstep(5, 14, elev));
      const night = 1 - U.smoothstep(-16, -5, elev);
      if (f.mode === "ambient") heldE = f.ambientElapsed || 0;
      const E = heldE;
      wxUpdate(Sg.weather, dt);
      // daytime: how much of the day wood shows, and the hour/weather grade it is baked with
      heavy = false;
      const day = U.clamp(f.day || 0), dk = dayK(day), nightK = 1 - U.smoothstep(0.5, 1, dk);
      const elD = dayElev(elev, day);
      const G = dk > 0.001 ? dayGrade(elD, dl && dl.sunrise && dl.sunset ? (now - dl.sunrise) / (dl.sunset - dl.sunrise) : 0.5) : null;
      ctx.globalAlpha = 1;

      // staggered exhale: each work group fades and sinks in its own window
      const wA = (i) => 1 - U.smoothstep(0.055 * i, 0.055 * i + 0.4, b);
      const wS = (i) => U.smoothstep(0.055 * i, 0.055 * i + 0.55, b) * (0.02 + 0.006 * i) * H;

      // ---------------------------------------------------- the old wood, back to front
      let fl = null, shaftA = 0;
      if (ambA > 0.005 && nightK > 0.004) {
        const fa0 = U.smoothstep(0.12, 0.7, b), ma0 = U.smoothstep(0.2, 0.8, b), na0 = U.smoothstep(0.28, 0.9, b);
        // by day the night wood gives way to the day bake drawn over it (nightK = 1 at night: unchanged)
        const fa = fa0 * nightK, ma = ma0 * nightK, na = na0 * nightK;
        const rise = (k) => (1 - k) * 0.03 * H;
        const cloud = WX.cloud, fog = WX.fog;
        const clearK = Math.pow(1 - cloud, 1.6);
        // moon: altitude and phase decide how strong the shafts are
        const mk2 = Math.floor(now.getTime() / 60000);
        if (astroCache.key !== mk2) astroCache = { key: mk2, v: astro(now, AW.config.location.lat, AW.config.location.lon) };
        const A = astroCache.v;
        const moonK = U.smoothstep(-2 * RAD, 12 * RAD, A.alt) * (0.35 + 0.65 * A.illum);
        const moonlight = U.lerp(0.3, 1, clearK) * (0.55 + 0.45 * Math.max(moonK, light));
        catMoon = moonlight;
        fl = flash(t, WX.storm);
        const fe = fl ? fl.e : 0;

        // sky behind the canopy, the forest air, dusk through the trunks
        const skyC = U.mix(U.mix(C.sky, C.dayBlue, light), C.rose, dusk * 0.35);
        glow(ctx, skyC, 0.5 * W, -0.02 * H, 0.85 * W, 0.5 * H, fa * (0.12 * (1 - 0.7 * cloud) + 0.1 * fe), true);
        glow(ctx, U.mix(C.haze, C.hazeDay, light), 0.48 * W, 0.56 * H, 0.66 * W, 0.42 * H, fa * (0.1 + 0.025 * clearK), true);
        if (dusk > 0.01) {
          const sinkK = U.smoothstep(4, -10, elev);
          glow(ctx, U.mix(C.rose, C.violet, sinkK), 0.32 * W, 0.5 * H, 0.75 * W, 0.4 * H, fa * 0.12 * dusk * (1 - 0.45 * cloud), true);
          glow(ctx, U.mix(C.ember, C.rose, sinkK), 0.3 * W, 0.62 * H, 0.46 * W, 0.2 * H, fa * 0.22 * dusk * (1 - 0.6 * sinkK) * (1 - 0.45 * cloud), true);
        }
        // lightning: far behind everything, so the trunks stand out against it
        if (fe > 0.004) {
          glow(ctx, C.bolt, fl.x * W, 0.32 * H, 0.65 * W, 0.6 * H, fa * 0.2 * fe, true);
          const bc = U.safe(C.bolt);
          ctx.strokeStyle = U.rgba(bc, fa * 0.45 * fe); ctx.lineWidth = 1.3 * S; ctx.lineJoin = "round";
          ctx.beginPath();
          for (const seg of BOLTS[fl.bolt]) {
            seg.forEach(([x, y], i) => { const px = (fl.x + x) * W, py = y * H; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
          }
          ctx.stroke();
        }
        // stars, glimpsed through the canopy gaps
        const starA = fa * U.smoothstep(-4, -12, elev) * Math.pow(1 - cloud, 2.2) * (1 - fog);
        if (starA > 0.01) {
          ctx.globalAlpha = starA * (0.85 + 0.15 * Math.sin(t * 0.7));
          ctx.drawImage(starsL.cv, 0, 0, W, H * 0.5);
        }
        // far trunks, swallowed by fog
        ctx.globalAlpha = fa * (1 - 0.8 * fog);
        ctx.drawImage(FL.cv, 0, rise(fa0), W, H);
        // fog between far and mid
        if (fog > 0.01) glow(ctx, C.fog, 0.5 * W, 0.6 * H, 0.85 * W, 0.45 * H, ma * 0.13 * fog, true);
        drawMist(ctx, bandA, bandB, t, ma * (0.05 + 0.16 * fog), dusk, 0.36, 0.86, 3.5 + WX.wind * 12, 0.2);
        // mid trunks
        ctx.globalAlpha = ma * (1 - 0.5 * fog);
        ctx.drawImage(ML.cv, 0, rise(ma0), W, H);
        drawMist(ctx, bandA, bandB, t, ma * (0.04 + 0.15 * fog), dusk, 0.5, 0.97, -2.5 - WX.wind * 9, 0.61);
        // canopy roof (sways a little in a strong wind)
        const sway = WX.wind * WX.wind * 4 * S * U.noise1(t * 0.35 + 3);
        ctx.globalAlpha = ma;
        ctx.drawImage(CL, sway, rise(ma0), W, CANOPY_H * H);
        ctx.globalAlpha = ma * moonlight * 0.8;
        ctx.drawImage(CR, sway, rise(ma0), W, CANOPY_H * H);
        // shafts of moonlight (or low sun) through the gap above the clearing (drawn over the stone, below)
        shaftA = ma * clearK * (1 - 0.5 * fog) * U.lerp(0.6, 1, Math.max(moonK, light)) * (0.88 + 0.12 * U.noise1(t * 0.08 + 1.7));
        // the clearing floor, lit softly
        ctx.globalAlpha = 1;
        glow(ctx, C.floor, 0.5 * W, 0.87 * H, 0.33 * W, 0.075 * H, ma * (0.08 + 0.06 * shaftA), true);
        if (WX.dust > 0.01) glow(ctx, C.snow, 0.5 * W, 0.875 * H, 0.36 * W, 0.07 * H, ma * 0.09 * WX.dust, true);
        // will-o'-the-wisps drift among the trunks
        // near trunks, banks, roots
        ctx.globalAlpha = na;
        ctx.drawImage(NL.cv, 0, rise(na0), W, H);
        ctx.globalAlpha = na * moonlight * (1 - 0.4 * fog) + na * 0.6 * fe;
        ctx.drawImage(RL.cv, 0, rise(na0), W, H);
        // faerie ring, the half behind the stone
        drawRing(ctx, t, E, na, true);
        // the standing stone
        const sa0 = U.smoothstep(0.25, 0.85, b), sa = sa0 * nightK;
        ctx.globalAlpha = sa;
        ctx.drawImage(SL.cv, STONE.x0, STONE.y0 + rise(sa0), STONE.w, STONE.h);
        ctx.globalAlpha = sa * U.clamp(moonlight + 0.5 * fe);
        ctx.drawImage(SR.cv, STONE.x0, STONE.y0 + rise(sa0), STONE.w, STONE.h);
        const awake = U.smoothstep(0, 3 * 3600, E);
        ctx.globalAlpha = sa * (0.22 + 0.5 * awake) * (0.85 + 0.15 * Math.sin(t * TAU / 13));
        ctx.drawImage(OGL.cv, STONE.x0, STONE.y0 + rise(sa0), STONE.w, STONE.h);
        // snow dusting on everything
        if (WX.dust > 0.01) {
          ctx.globalAlpha = na * WX.dust * 0.5;
          ctx.drawImage(SNL.cv, 0, 0, W, H);
        }
        const warmShaft = U.clamp(dusk * 0.9 + light * 0.6);
        if (shaftA > 0.01) {
          ctx.globalAlpha = shaftA * (1 - warmShaft); ctx.drawImage(SHM.cv, 0, 0, W, H);
          ctx.globalAlpha = shaftA * warmShaft; ctx.drawImage(SHD.cv, 0, 0, W, H);
        }
        ctx.globalAlpha = 1;
        // fog rolls in front of the stone's foot too
        if (fog > 0.02) drawMist(ctx, bandA, bandB, t, na * 0.13 * fog, dusk, 0.6, 1.0, 4.5 + WX.wind * 10, 0.83);
        // will-o'-the-wisps drift through the clearing
        drawWisps(ctx, t, E, ambA * nightK, light);
      }

      // ---------------------------------------------------- the old wood by day (faintly, behind the work face)
      // the same wood in the sun; in work it sits far back (0.18) and comes forward with the exhale
      const sceneA = G ? dk * U.lerp(0.18, 1, U.smoothstep(0.1, 0.85, b)) : 0;
      if (G) {
        dayWood(ctx, G, sceneA, dt);           // (snow and fog are in the bake)
        dayShafts(ctx, G, sceneA, t, elD);
        // storm: a dim flicker somewhere beyond the roof (never a white flash)
        if (ambA > 0.005 && WX.storm > 0.02) {
          const f2 = flash(t, WX.storm);
          if (f2 && f2.e > 0.004) glow(ctx, C.bolt, f2.x * W, 0.2 * H, 0.6 * W, 0.45 * H, sceneA * 0.12 * f2.e, true);
        }
        // fog by day: banks of mist drifting between the trunks (the milky veil itself is baked)
        if (WX.fog > 0.01) drawMist(ctx, bandDay, bandDay, t, sceneA * 0.22 * WX.fog * (0.5 + 0.5 * G.bri / DAY_EXP), 0, 0.36, 0.9, 3.5 + WX.wind * 12, 0.2);
      }

      // ---------------------------------------------------- info: straight to the wall, or into the dim layer
      const ov = f.overlay, dimK = ov ? 1 - 0.7 * U.clamp(ov.a || 0) : 1;
      const out = ctx;
      ctx = dimBegin(out, dimK);

      // ---------------------------------------------------- work: the day stem
      const clockW = { x: 0.5 * W, y: 0.31 * H, px: 0.27 * H };
      const clockA = { x: 0.5 * W, y: 0.405 * H, px: 0.158 * H };
      if (workA > 0.01) {
        const a = wA(1), y = 0.565 * H + wS(1), x0 = 0.28 * W, x1 = 0.72 * W, span = x1 - x0;
        const gc = U.safe(C.green), tc = U.safe(C.tealDim);
        let p = 0, isDay = false;
        if (dl && dl.sunrise && dl.sunset) {
          p = U.clamp((now - dl.sunrise) / (dl.sunset - dl.sunrise));
          isDay = now >= dl.sunrise && now <= dl.sunset;
        }
        if (a > 0.005) {
          const amp = 0.0045 * H;
          const yy = (u) => y + Math.sin(u * TAU * 2.5) * amp * (0.5 + 0.5 * u);
          ctx.fillStyle = U.rgba(tc, a * 0.55);
          const dots = 60;
          for (let i = 0; i <= dots; i++) {
            const u = i / dots; if (u < p) continue;
            ctx.fillRect(x0 + u * span - 0.8 * S, yy(u) - 0.8 * S, 1.6 * S, 1.6 * S);
          }
          if (p > 0) {
            ctx.lineCap = "round"; ctx.lineJoin = "round";
            ctx.beginPath();
            const segs = Math.max(2, Math.ceil(p * 90));
            for (let i = 0; i <= segs; i++) { const u = p * i / segs; i ? ctx.lineTo(x0 + u * span, yy(u)) : ctx.moveTo(x0, yy(0)); }
            ctx.strokeStyle = U.rgba(gc, a * 0.12); ctx.lineWidth = 6 * S; ctx.stroke();
            ctx.strokeStyle = U.rgba(gc, a * 0.85); ctx.lineWidth = 1.6 * S; ctx.stroke();
            const hrs = (dl.sunset - dl.sunrise) / 3600000;
            ctx.beginPath();
            for (let k = 1; k < hrs; k++) {
              const u = k / hrs; if (u > p - 0.01) break;
              const lx = x0 + u * span, ly = yy(u), side = k % 2 ? -1 : 1;
              tinyLeaf(ctx, lx, ly, side * (Math.PI / 2 - 0.62), 0.026 * H, 0.0075 * H);
            }
            ctx.strokeStyle = U.rgba(gc, a * 0.6); ctx.lineWidth = 1.1 * S; ctx.stroke();
            ctx.fillStyle = U.rgba(gc, a * 0.08); ctx.fill();
          }
          ctx.fillStyle = U.rgba(gc, a * 0.8);
          ctx.beginPath(); ctx.arc(x0, yy(0), 2.6 * S, 0, TAU); ctx.fill();
          ctx.strokeStyle = U.rgba(tc, a * 0.75); ctx.lineWidth = 1.1 * S;
          ctx.beginPath(); ctx.arc(x1, yy(1), 4.5 * S, 0, TAU); ctx.stroke();
          if (isDay) {
            const bx = x0 + p * span, by = yy(p);
            glow(ctx, C.frost, bx, by, 0.03 * H, 0.03 * H, a * 0.35);
            const fc = U.safe(C.frost);
            ctx.beginPath(); tinyLeaf(ctx, bx - 0.004 * H, by, 0, 0.022 * H, 0.008 * H);
            ctx.fillStyle = U.rgba(fc, a * 0.3); ctx.fill();
            ctx.strokeStyle = U.rgba(fc, a * 0.95); ctx.lineWidth = 1.4 * S; ctx.stroke();
          }
          const lp = Math.max(13, 0.02 * H);
          if (dl && dl.sunrise) text(ctx, U.fmtTime(dl.sunrise), x0, y + 0.036 * H, { px: lp, color: C.tealDim, glow: 3, core: 0.9 }, "center", 1, a * 0.9);
          if (dl && dl.sunset) text(ctx, U.fmtTime(dl.sunset), x1, y + 0.036 * H, { px: lp, color: C.tealDim, glow: 3, core: 0.9 }, "center", 1, a * 0.9);
          let big = null, cap = null;
          if (dl && dl.isDay && dl.lightLeftMin != null) { big = U.fmtMinutes(dl.lightLeftMin); cap = "OF LIGHT LEFT"; }
          else if (dl && dl.sunrise) {
            let rise = dl.sunrise.getTime(); if (rise < now.getTime()) rise += 86400000;
            big = U.fmtMinutes((rise - now.getTime()) / 60000); cap = "UNTIL SUNRISE";
          }
          if (big) {
            text(ctx, big, 0.5 * W, y + 0.058 * H, { px: 0.036 * H, weight: 300, color: C.teal, glow: 6, core: 0.92 }, "center", 1, a * (dl.isDay ? 0.95 : 0.7));
            text(ctx, cap, 0.5 * W, y + 0.1 * H, { px: lp * 0.9, spacing: 0.3, color: C.tealDim, glow: 2, core: 0.9 }, "center", 1, a * 0.85);
          }
        }
        // date under the clock
        const wd = now.toLocaleDateString("en-CA", { weekday: "long" }).toUpperCase();
        const mo = now.toLocaleDateString("en-CA", { month: "long" }).toUpperCase();
        text(ctx, `${wd}   ${now.getDate()} ${mo}`, clockW.x, 0.465 * H + wS(0), { px: 0.022 * H, spacing: 0.32, color: C.tealDim, glow: 3, core: 0.92 }, "center", 1, wA(0) * 0.95);
      }

      // ---------------------------------------------------- clock
      {
        const str = U.fmtTime(now, { hour24: AW.config.clock ? AW.config.clock.hour24 !== false : true });
        const e = U.easeInOut(b);
        const cx = U.lerp(clockW.x, clockA.x, e), cy = U.lerp(clockW.y, clockA.y, e), px = U.lerp(clockW.px, clockA.px, e);
        const wq = Math.round(U.smoothstep(0.1, 0.85, b) * CLK_Q);
        const cv = clockCanvas(str, wq);
        const k = px / clkPx;
        const breathe = 1 - ambA * (0.08 - 0.05 * Math.sin(t * TAU / 14));
        ctx.globalAlpha = breathe * U.lerp(1, 0.95, b);
        ctx.drawImage(cv.cv, cx - cv.w * k / 2, cy - cv.h * k / 2, cv.w * k, cv.h * k);
        ctx.globalAlpha = 1;
      }

      // ---------------------------------------------------- calendar + weather (work, left)
      const next = Sg.calendar && Sg.calendar.next;
      const lx = 0.11 * W;
      if (next && wA(2) > 0.01) {
        const a = wA(2), mins = next.minutesUntil;
        const soon = U.smoothstep(20, 5, mins);
        const y = 0.795 * H + wS(2);
        text(ctx, String(next.title).toUpperCase(), lx, y, { px: 0.034 * H, spacing: 0.22, color: C.tealDim, glow: 3, core: 0.95 }, "left", 1, a * 0.95);
        text(ctx, mins < 1 ? "now" : `in ${U.fmtMinutes(mins)}`, lx, y + 0.058 * H,
          { px: 0.052 * H, weight: 300, color: soon > 0.5 ? C.frost : C.teal, glow: soon > 0.5 ? 9 : 6, core: 0.92 }, "left", 1, a);
        const len = 0.14 * W * U.clamp(mins / 60, 0.06, 1);
        const sc = U.safe(soon > 0.5 ? C.frost : C.tealDim);
        ctx.strokeStyle = U.rgba(sc, a * 0.6); ctx.lineWidth = 1.2 * S;
        ctx.beginPath(); ctx.moveTo(lx, y - 0.032 * H); ctx.lineTo(lx + len, y - 0.032 * H); ctx.stroke();
        ctx.fillStyle = U.rgba(sc, a * 0.85);
        ctx.beginPath(); ctx.arc(lx + len, y - 0.032 * H, 2.4 * S, 0, TAU); ctx.fill();
      }
      const wx = Sg.weather;
      if (wx && wx.actionable && wA(4) > 0.01) {
        const s = wx.tempC != null ? `${wx.actionable}  ·  ${Math.round(wx.tempC)}°` : wx.actionable;
        const y = (next ? 0.905 : 0.82) * H + wS(4);
        text(ctx, s, lx, y, { px: 0.025 * H, weight: 400, color: C.tealDim, glow: 3, core: 0.95 }, "left", 1, wA(4) * 0.9);
      }

      // ---------------------------------------------------- finances (work, right)
      const fin = Sg.finances;
      if (fin && wA(3) > 0.01 && fin.income != null && fin.spent != null) {
        const mood = fin.mood || "calm";
        const warn = mood === "warning", drift = mood === "drift";
        const pulse = warn ? 0.8 + 0.2 * Math.sin(t * 2.2) : 1;
        const mc = warn ? C.alarm : drift ? C.straw : C.green;
        const rx = 0.89 * W, y = 0.795 * H + wS(3), a = wA(3);
        const net = fin.net != null ? fin.net : fin.income - fin.spent;
        text(ctx, U.fmtMoney(net, { sign: true }), rx, y + 0.004 * H,
          { px: 0.052 * H, weight: 300, color: mc, glow: warn ? 10 : 6, core: 0.92 }, "right", 1, a * pulse);
        const L = 0.15 * W, gx0 = rx - L, gy = y + 0.05 * H;
        const ratio = fin.income > 0 ? fin.spent / fin.income : 1;
        const tc = U.safe(C.tealDim), mcs = U.safe(mc);
        ctx.lineCap = "round";
        ctx.strokeStyle = U.rgba(tc, a * 0.7); ctx.lineWidth = 1.3 * S;
        ctx.beginPath(); ctx.moveTo(gx0, gy); ctx.lineTo(rx, gy); ctx.stroke();
        ctx.beginPath(); tinyLeaf(ctx, rx, gy, -0.5, 0.016 * H, 0.005 * H); ctx.stroke();
        const sl = L * Math.min(1, ratio);
        ctx.strokeStyle = U.rgba(mcs, a * 0.14 * pulse); ctx.lineWidth = 6 * S;
        ctx.beginPath(); ctx.moveTo(gx0, gy + 0.012 * H); ctx.lineTo(gx0 + sl, gy + 0.012 * H); ctx.stroke();
        ctx.strokeStyle = U.rgba(mcs, a * 0.9 * pulse); ctx.lineWidth = 2 * S;
        ctx.beginPath(); ctx.moveTo(gx0, gy + 0.012 * H); ctx.lineTo(gx0 + sl, gy + 0.012 * H); ctx.stroke();
        if (ratio > 1) {
          const ac = U.safe(C.alarm), ex = Math.min(0.05 * W, L * (ratio - 1));
          ctx.strokeStyle = U.rgba(ac, a * 0.95 * pulse); ctx.lineWidth = 2.4 * S;
          ctx.beginPath(); ctx.moveTo(rx, gy + 0.012 * H); ctx.lineTo(rx + ex, gy + 0.012 * H); ctx.stroke();
          glow(ctx, C.alarm, rx + ex, gy + 0.012 * H, 0.025 * H, 0.025 * H, a * 0.4 * pulse);
        }
        const lp = Math.max(13, 0.021 * H);
        text(ctx, `${U.fmtMoney(fin.income)} made  ·  ${U.fmtMoney(fin.spent)} spent`, rx, gy + 0.045 * H,
          { px: lp, color: C.teal, glow: 2, core: 0.9 }, "right", 1, a * 0.88);
        if (fin.lastUpdated) {
          text(ctx, `updated ${agoH(fin.lastUpdated, now)}`, rx, gy + 0.077 * H,
            { px: lp * 0.9, color: C.tealDim, glow: 2, core: 0.9 }, "right", 1, a * 0.8);
        }
      }

      // ---------------------------------------------------- heartbeat: seeds (work), runes on the stone (ambient)
      const hb = Array.isArray(Sg.heartbeat) ? Sg.heartbeat : [];
      if (hb.length) {
        const n = hb.length;
        const a4 = wA(4), s4 = wS(4);
        const gap = 0.095 * W, hx0 = 0.5 * W - gap * (n - 1) / 2, hy = 0.81 * H + s4;
        const s = 0.016 * H, lp = Math.max(13, 0.019 * H);
        const rg = Math.min(0.075 * W, 0.22 * W / Math.max(1, n - 1)), rx0 = 0.5 * W - rg * (n - 1) / 2, ry = 0.607 * H;
        const ra = U.smoothstep(0.45, 1, b);
        for (let i = 0; i < n; i++) {
          const h = hb[i], down = !h.up;
          if (a4 > 0.01) {
            const x = hx0 + i * gap;
            bud(ctx, x, hy, s, down ? C.alarm : C.green, a4 * (down ? 1 : 0.85), t + i * 1.7, down);
            text(ctx, String(h.host).toUpperCase(), x, hy + s * 3.4, { px: lp, spacing: 0.24, color: down ? C.alarm : C.tealDim, glow: down ? 6 : 2, core: 0.92 },
              "center", 1, a4 * (down ? 1 : 0.85));
            if (down) {
              const since = h.downSince ? `down ${U.fmtMinutes((now - h.downSince) / 60000)}` : "down";
              text(ctx, since, x, hy + s * 3.4 + lp * 1.4, { px: lp * 1.05, color: C.flare, glow: 5, core: 0.92 }, "center", 1, a4);
            }
          }
          if (ra > 0.01) {
            const x = rx0 + i * rg, gi = runeOf(h.host), rs = 0.052 * H;
            if (!down) {
              const p = 0.5 + 0.5 * Math.sin(t * TAU / 11 + i * 2.1);
              glow(ctx, C.rune, x, ry, rs * 1.3, rs * 1.3, ra * (0.1 + 0.06 * p));
              rune(ctx, gi, x, ry, rs, C.rune, ra * (0.42 + 0.14 * p));
            } else {
              const ph = (t % 4.5) / 4.5, p = 0.5 + 0.5 * Math.sin(t * TAU / 4.5);
              glow(ctx, C.ember, x, ry, 0.075 * H, 0.075 * H, ra * (0.14 + 0.12 * p), true);
              glow(ctx, C.alarm, x, ry, rs * 1.2, rs * 1.2, ra * (0.22 + 0.2 * p));
              rune(ctx, gi, x, ry, rs, C.alarm, ra * (0.6 + 0.3 * p));
              const ec = U.safe(C.flare);
              ctx.strokeStyle = U.rgba(ec, ra * 0.3 * (1 - ph)); ctx.lineWidth = 1.2 * S;
              ctx.beginPath(); ctx.arc(x, ry, rs * 0.7 + ph * 0.05 * H, 0, TAU); ctx.stroke();
              text(ctx, String(h.host), x, ry + rs * 0.95, { px: 0.021 * H, color: C.flare, glow: 4, core: 0.85 }, "center", 1, ra * (0.42 + 0.14 * p));
            }
          }
        }
      }

      // ---------------------------------------------------- news (work, above the clock)
      drawNews(ctx, Sg.news, now, t, wA(2.5), wS(2.5));
      // ---------------------------------------------------- now playing (work, low centre)
      drawNowPlayingWork(ctx, np, wA(3.5), wS(3.5));

      dimEnd(out, ctx, dimK);
      ctx = out;

      // ---------------------------------------------------- the cat, in the ring (behind its front mushrooms)
      drawCat(ctx, f, b, t, E, dk, G);

      // ---------------------------------------------------- foreground of the wood
      if (ambA > 0.005) {
        const na = U.smoothstep(0.28, 0.9, b);
        drawRing(ctx, t, E, na * (1 - dk), false);           // by day the ring is unlit: plain mushrooms
        if (G) drawRingDay(ctx, false, na * dk, G);
        drawFerns(ctx, t, na, G ? dk : 0, G);
        drawBeards(ctx, t, U.smoothstep(0.2, 0.8, b), G ? dk : 0, G);
      }

      // ---------------------------------------------------- the reclaiming: vines
      const K = f.mode === "ambient" ? 1 : U.smoothstep(0.4, 0.95, b);
      const vineA = U.smoothstep(0.08, 0.6, b);
      if (vineA > 0.004 && K > 0.001 && VL) {
        const e = Math.min(heldE, CAP_S + 60);
        const key = `${Math.floor(e / 10)}|${Math.round(K * 30)}`;
        // night stems (dark, faintly lit) and day stems (green in the light) cross-fade on dk
        const nV = 1 - dk, dV = G ? dk : 0, vA = vineA * U.lerp(1, 0.85, ambA);
        const e10 = Math.floor(e / 10) * 10, kq = Math.round(K * 30) / 30;
        if (nV > 0.001) {
          if (key !== vlKey) { vlKey = key; renderVines(e10, kq, null); }
          ctx.globalAlpha = vA * nV;
          ctx.drawImage(VL.cv, 0, 0, W, H);
        }
        if (dV > 0.001) {
          if (!VLD) VLD = mk(W, H);
          if (!leafD.length || (leafDKey !== G.ink && !heavy)) { buildLeavesDay(G); heavy = true; }
          const kd = key + "|" + G.ink;
          if (kd !== vlKeyD && (!heavy || !vlKeyD)) { vlKeyD = kd; renderVines(e10, kq, G); heavy = true; }
          ctx.globalAlpha = vA * dV;
          ctx.drawImage(VLD.cv, 0, 0, W, H);
        }
        const sway = 0.05 * ambA * (1 + WX.wind * 3);
        const sk = dpr / LEAF_L;
        for (let pass = 0; pass < 2; pass++) {
          const pk = pass ? dV : nV;
          if (pk <= 0.001) continue;
          const spr = pass ? leafD : leafSpr;
          ctx.globalAlpha = vA * pk;
          for (let k = 0; k < leafN; k++) {
            const kk = LK[k];
            if (kk <= 0.02) continue;
            const side = LSIDE[k];
            const ang = LT[k] + side * (0.18 + (LOPEN[k] - 0.18) * kk) + sway * Math.sin(t * (0.33 + WX.wind * 0.8) + LX[k] * 0.0035 + LPH[k]);
            const sc = LSZ[k] * (0.25 + 0.75 * kk) * sk;
            const cs = Math.cos(ang) * sc, sn = Math.sin(ang) * sc;
            const sp = spr[LVAR[k]];
            ctx.setTransform(cs, sn, -sn, cs, LX[k] * dpr, LY[k] * dpr);
            ctx.drawImage(sp.cv, -sp.pad, -sp.ay);
          }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        ctx.globalAlpha = 1;
        const hk = vineA * (1 - 0.75 * dk);      // the fey buds and glow-points barely show in the sun
        for (let k = 0; k < hiN; k++) {
          const v = HVIS[k]; if (v <= 0.02) continue;
          const p = 0.5 + 0.5 * Math.sin(t * TAU / (9 + (k % 4) * 2) + HPH[k]);
          const col = HKIND[k] ? C.bud : C.biolum;
          glow(ctx, col, HX[k], HY[k], 0.016 * H, 0.016 * H, hk * v * (0.16 + 0.16 * p));
          ctx.fillStyle = U.rgba(U.safe(col), hk * v * (0.35 + 0.2 * p));
          ctx.beginPath(); ctx.arc(HX[k], HY[k], 1.7 * S, 0, TAU); ctx.fill();
        }
      }

      // ---------------------------------------------------- fireflies, weather in front, low mist, whisper
      if (ambA > 0.005) {
        drawFireflies(ctx, t, E, ambA * (1 - dk), light);   // by day: pollen, seeds and butterflies instead
        if (G) drawDayLife(ctx, t, ambA * dk, G);
        drawRain(ctx, t, dt, ambA);
        drawDrips(ctx, t, ambA);
        drawSnow(ctx, t, dt, ambA);
        drawMist(ctx, mistA, mistB, t, ambA * (0.035 + 0.075 * WX.fog) * (0.6 + 0.4 * (1 - light)) * nightK, dusk, 0.8, 1.0, -3.5 - WX.wind * 10, 0.37);
        if (G) drawMist(ctx, mistDay, mistDay, t, ambA * dk * (0.03 + 0.2 * WX.fog) * (0.6 + 0.4 * G.bri), 0, 0.78, 1.0, -3.5 - WX.wind * 10, 0.37);
        if (next && next.minutesUntil < 30) {
          text(ctx, `${next.title}  ·  ${U.fmtMinutes(next.minutesUntil)}`, clockA.x, 0.712 * H,
            { px: 0.022 * H, weight: 300, color: C.amber, glow: 4, core: 0.85 }, "center", 1, ambA * 0.42 * dimK);
        }
        // a critical headline whispers once, faintly, in ember under the stone's time
        const nw = Sg.news;
        if (nw && nw.critical && nw.headline) {
          const wo = { px: 0.02 * H, weight: 300, color: C.ember, glow: 4, core: 0.85 };
          const p = 0.5 + 0.5 * Math.sin(t * TAU / 3.2);
          text(ctx, wrap2(nw.headline, wo, 0.36 * W, false)[0], clockA.x, (next && next.minutesUntil < 30 ? 0.748 : 0.712) * H, wo, "center", 1,
            U.smoothstep(0.55, 1, b) * 0.44 * (0.8 + 0.2 * p) * dimK);
        }
        // the song, sung softly at the stone's foot
        drawNowPlayingAmbient(ctx, np, U.smoothstep(0.5, 1, b) * dimK, t, dk);
      }
      ctx.globalAlpha = 1;
      sfx(f, t, E, ambA, dk);
    },
  });

  // ------------------------------------------------------------------ live layers
  function drawMist(ctx, imgN, imgD, t, a, dusk, top, bot, speed, off) {
    if (a <= 0.004) return;
    const y = top * H, h = (bot - top) * H + 2;
    const tw = W * 1.25;
    const ox = ((t * speed * S + off * tw) % tw + tw) % tw;
    const draw = (img, al) => {
      if (al <= 0.003) return;
      ctx.globalAlpha = al;
      ctx.drawImage(img, -ox, y, tw, h);
      ctx.drawImage(img, tw - ox, y, tw, h);
    };
    draw(imgN, a * (1 - dusk * 0.6));
    draw(imgD, a * dusk * 0.8);
    ctx.globalAlpha = 1;
  }

  function drawRing(ctx, t, E, a, back) {
    if (a <= 0.01) return;
    const mc = U.safe(C.mush), vc = U.safe(C.mushV), rc = RIMC(), sc = U.safe(C.snow);
    for (let k = 0; k < RING.length; k++) {
      const m = RING[k];
      if (m.back !== back) continue;
      const lit = U.smoothstep(m.at, m.at + 240, E);
      const col = m.violet ? C.mushV : C.mush, cc = m.violet ? vc : mc;
      const br = 0.8 + 0.2 * Math.sin(t * TAU / (7 + k % 3) + m.ph);
      const s = m.s, x = m.x, y = m.y, top = y - s * 0.75, lean = m.lean * s;
      if (lit > 0.01) glow(ctx, col, x, top, s * 3.4, s * 2.4, a * lit * 0.24 * br, true);
      // stem
      ctx.strokeStyle = lit > 0.01 ? U.rgba(cc, a * (0.12 + 0.4 * lit)) : U.rgba(rc, a * 0.14);
      ctx.lineWidth = Math.max(1, s * 0.22); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean * 0.3, y - s * 0.4, x + lean, top); ctx.stroke();
      // cap
      ctx.beginPath(); ctx.ellipse(x + lean, top, s * 0.62, s * 0.42, m.lean * 0.6, Math.PI, 0); ctx.closePath();
      ctx.fillStyle = "rgba(4,8,7,0.95)"; ctx.fill();
      if (lit > 0.01) { ctx.fillStyle = U.rgba(cc, a * lit * 0.62 * br); ctx.fill(); }
      ctx.strokeStyle = U.rgba(lit > 0.3 ? cc : rc, a * (0.2 + 0.5 * lit)); ctx.lineWidth = 1 * S; ctx.stroke();
      if (WX.dust > 0.02) {
        ctx.strokeStyle = U.rgba(sc, a * 0.6 * WX.dust); ctx.lineWidth = 1.6 * S;
        ctx.beginPath(); ctx.ellipse(x + lean, top - 0.5 * S, s * 0.5, s * 0.36, m.lean * 0.6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      }
    }
  }

  function drawFerns(ctx, t, a, dk, G) {
    if (a <= 0.01) return;
    const wind = WX.wind;
    ctx.beginPath();
    for (const fn of FERNS) {
      for (const [a0, len, curl, ph] of fn.fr) {
        const sw = (0.03 + 0.16 * wind * wind) * Math.sin(t * (0.5 + 1.6 * wind) + ph + fn.x * 0.002) + 0.12 * wind * wind;
        const n = 14, st = len / n, dir = a0 >= 0 ? 1 : -1;
        let x = fn.x, y = fn.y;
        ctx.moveTo(x, y);
        for (let i = 1; i <= n; i++) {
          const u = i / n, ang = a0 + dir * curl * Math.pow(u, 1.5) + sw * u * u;
          x += Math.sin(ang) * st; y -= Math.cos(ang) * st;
          ctx.lineTo(x, y);
        }
        x = fn.x; y = fn.y;
        for (let i = 1; i < n; i++) {
          const u = i / n, ang = a0 + dir * curl * Math.pow(u, 1.5) + sw * u * u;
          x += Math.sin(ang) * st; y -= Math.cos(ang) * st;
          if (i < 2) continue;
          const lf = len * 0.17 * Math.pow(1 - u, 0.8) + 1.5 * S;
          for (const sd of [-1, 1]) {
            const la = ang + sd * 1.05;
            ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(la) * lf, y - Math.cos(la) * lf);
          }
        }
      }
    }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (dk > 0.001) { // by day: green fronds in the light, a darker green underside instead of black
      const dark = U.mix({ r: 0, g: 0, b: 0 }, ink(DC.vineDark, G), dk);
      ctx.strokeStyle = U.rgba(dark, a * 0.85); ctx.lineWidth = 3.4 * S; ctx.stroke();
      ctx.strokeStyle = U.rgba(U.mix(U.safe(C.fern), ink(DC.fern, G), dk), a * (0.5 + 0.45 * dk)); ctx.lineWidth = (1.4 + 0.6 * dk) * S; ctx.stroke();
      return;
    }
    ctx.strokeStyle = U.rgba({ r: 0, g: 0, b: 0 }, a * 0.85); ctx.lineWidth = 3.4 * S; ctx.stroke();
    ctx.strokeStyle = U.rgba(U.safe(C.fern), a * 0.5); ctx.lineWidth = 1.4 * S; ctx.stroke();
  }

  function drawBeards(ctx, t, a, dk, G) {
    if (a <= 0.01) return;
    const wind = WX.wind;
    ctx.beginPath();
    for (const [ax, ay, len, ph] of BEARDS) {
      for (let s = -1; s <= 1; s++) {
        const l = len * (1 - 0.25 * Math.abs(s)) , n = 9;
        let px = ax + s * 3 * S;
        ctx.moveTo(px, ay);
        for (let i = 1; i <= n; i++) {
          const u = i / n;
          const sw = (3 + 14 * wind * wind) * S * Math.sin(t * (0.4 + wind) + ph + s * 0.7) * u * u + 10 * wind * wind * S * u;
          ctx.lineTo(px + sw + U.noise1(ph * 10 + s * 3 + i * 0.9) * 2.5 * S, ay + l * u);
        }
      }
    }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (dk > 0.001) { ctx.strokeStyle = U.rgba(U.mix(U.safe(C.beard), ink(DC.beard, G), dk), a * (0.3 + 0.3 * dk)); ctx.lineWidth = (1.2 + 0.4 * dk) * S; ctx.stroke(); return; }
    ctx.strokeStyle = U.rgba(U.safe(C.beard), a * 0.3); ctx.lineWidth = 1.2 * S; ctx.stroke();
  }

  function drawWisps(ctx, t, E, a, light) {
    const dark = 1 - light;
    const nw = Math.min(WS_N, dark * (1 + 2.5 * U.smoothstep(1500, 9000, E)) + WX.snow * 3 + WX.fog * 1.5 + (1 - WX.warm) * 2.5);
    for (let i = 0; i < WS_N; i++) {
      const pres = U.clamp(nw - i);
      if (pres <= 0.01) break;
      const ph = WSP[i];
      const life = U.smoothstep(-0.7, 0.3, Math.sin(t * TAU / (37 + i * 7) + ph)); // come and go
      const al = a * pres * life;
      if (al < 0.01) continue;
      const x = (WSX[i] + 0.09 * U.noise1(t * 0.012 + ph)) * W;
      const y = (WSY[i] + 0.04 * U.noise1(t * 0.017 + ph + 19) + 0.006 * Math.sin(t * 0.9 + ph)) * H;
      const col = i % 3 === 1 ? C.wispV : C.wispT;
      const p = 0.75 + 0.25 * Math.sin(t * 1.3 + ph * 3);
      glow(ctx, col, x, y, 0.07 * H, 0.07 * H, al * 0.2 * p, true);
      glow(ctx, col, x, y, 0.022 * H, 0.022 * H, al * 0.75 * p);
      ctx.fillStyle = U.rgba(U.safe(col), al * 0.55 * p);
      ctx.beginPath(); ctx.arc(x, y, 1.6 * S, 0, TAU); ctx.fill();
    }
  }

  // fireflies: amber J-stroke flashes over a soft glow-worm ember; more of them as the night deepens,
  // drifting into step late in the evening. Each has a depth: near ones are larger and brighter.
  const FO = new Float32Array(2);
  const ffEnv = (u, D) => U.smoothstep(0, 0.12, u) * (1 - U.smoothstep(0.3, D, u));
  function ffOff(i, u, D) { const q = u / D; FO[0] = FFD[i] * 0.014 * H * q * FFZ[i]; FO[1] = 0.03 * H * FFZ[i] * (0.5 * q - 1.8 * q * q); }
  function drawFireflies(ctx, t, E, a, light) {
    const dark = 1 - light * 0.88;
    const nfF = (6 + 26 * dark + 16 * dark * U.smoothstep(1800, 3 * 3600, E)) *
      Math.pow(1 - WX.rain, 1.6) * (1 - WX.snow) * WX.warm * (1 - 0.35 * WX.fog) * (1 - 0.6 * WX.storm);
    const nf = Math.min(FF_N, nfF);
    if (nf <= 0.02) return;
    const sync = 0.55 * U.smoothstep(3600, 4.5 * 3600, E) * dark;
    const fc = U.safe(C.firefly);
    const D = 1.15;
    ctx.lineCap = "round";
    for (let i = 0; i < FF_N; i++) {
      const pres = U.clamp(nf - i);
      if (pres <= 0.01) break;
      const ph = FFP[i], z = FFZ[i];
      const bx = (FFX[i] + 0.07 * U.noise1(t * 0.02 + ph) + 0.015 * U.noise1(t * 0.11 + ph * 3)) * W;
      const by = (FFY[i] + 0.05 * U.noise1(t * 0.024 + ph + 37) + 0.01 * U.noise1(t * 0.13 + ph * 5)) * H;
      const P = U.lerp(FFR[i], 4.6, sync);
      const cyc = t / P + (ph % 1) * (1 - sync);
      const s = (cyc - Math.floor(cyc)) * P;        // seconds into this cycle
      const ap = a * pres * (0.55 + 0.45 * Math.min(1, z));
      // the ember between flashes: a dim warm point that breathes
      const idle = 0.5 + 0.5 * Math.sin(t * 0.9 + ph * 5);
      glow(ctx, C.firefly, bx, by, 0.012 * H * z, 0.012 * H * z, ap * (0.07 + 0.05 * idle));
      ctx.fillStyle = U.rgba(fc, ap * (0.16 + 0.1 * idle));
      ctx.fillRect(bx - S * z, by - S * z, 2 * S * z, 2 * S * z);
      if (s > D) continue;
      ffOff(i, s, D);
      const fx = bx + FO[0], fy = by + FO[1];
      const al = ap * ffEnv(s, D);
      glow(ctx, C.firefly, fx, fy, 0.065 * H * z, 0.065 * H * z, al * 0.1, true);
      glow(ctx, C.firefly, fx, fy, 0.032 * H * z, 0.032 * H * z, al * 0.45);
      // the J-stroke: a short fading trail of where the flash has been
      ctx.lineWidth = 1.8 * S * z;
      let px = fx, py = fy;
      for (let k = 1; k <= 4; k++) {
        const u = s - k * 0.06; if (u < 0) break;
        ffOff(i, u, D);
        const qx = bx + FO[0], qy = by + FO[1];
        ctx.strokeStyle = U.rgba(fc, ap * ffEnv(u, D) * 0.5 * (1 - k / 5));
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
        px = qx; py = qy;
      }
      ctx.fillStyle = U.rgba(fc, al * 0.9);
      ctx.beginPath(); ctx.arc(fx, fy, 1.8 * S * z, 0, TAU); ctx.fill();
    }
  }

  function drawRain(ctx, t, dt, a) {
    const nR = Math.round(RN * U.clamp(WX.rain));
    if (nR < 1) return;
    const slant = 0.1 + WX.wind * 0.55;
    const k = H / W;
    for (let i = 0; i < nR; i++) {
      RY[i] += RV[i] * dt;
      RX[i] += slant * RV[i] * dt * k;
      if (RY[i] > 1.05) { RY[i] -= 1.12; RX[i] = Math.random() * 1.3 - 0.15 - slant * 0.5 * k; }
      if (RX[i] > 1.1) RX[i] -= 1.25;
    }
    const rc = U.safe(C.rain);
    for (let d = 0; d < 2; d++) {
      ctx.beginPath();
      for (let i = 0; i < nR; i++) {
        if (RD[i] !== d) continue;
        const x = RX[i] * W, y = RY[i] * H, l = RLN[i] * H * (1 + WX.storm * 0.5);
        ctx.moveTo(x, y); ctx.lineTo(x - slant * l, y - l);
      }
      ctx.strokeStyle = U.rgba(rc, a * (d ? 0.42 : 0.26) * (0.7 + 0.3 * WX.rain));
      ctx.lineWidth = (d ? 1.3 : 0.9) * S; ctx.lineCap = "round";
      ctx.stroke();
    }
  }

  function drawDrips(ctx, t, a) {
    const wet = WX.wet;
    if (wet < 0.04 || !DRN) return;
    const rc = U.safe(C.rain), g = 2.2 * H;
    ctx.fillStyle = U.rgba(rc, a * 0.4 * Math.min(1, wet * 2));
    ctx.strokeStyle = U.rgba(rc, a * 0.3 * Math.min(1, wet * 2)); ctx.lineWidth = 1 * S;
    const per = 1 / (0.25 + 0.75 * wet);
    for (let k = 0; k < DRN; k++) {
      if (k / DRN > wet * 1.3) break;
      const P = DP[k] * per, x = DX[k], y0 = DY0[k], y1 = DY1[k];
      const tf = Math.sqrt(2 * (y1 - y0) / g);
      const c = ((t + DPH[k]) % (P + tf + 0.3));
      if (c < P) { // a bead swelling at the tip
        const r = (0.6 + 1.2 * c / P) * S;
        ctx.beginPath(); ctx.arc(x, y0 + r, r, 0, TAU); ctx.fill();
      } else if (c < P + tf) {
        const u = c - P, y = y0 + 0.5 * g * u * u;
        ctx.fillRect(x - 0.8 * S, y - 3 * S, 1.6 * S, 5 * S);
      } else {
        const u = (c - P - tf) / 0.3;
        ctx.globalAlpha = 1 - u;
        ctx.beginPath(); ctx.ellipse(x, y1, (2 + 7 * u) * S, (0.8 + 2 * u) * S, 0, Math.PI, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawSnow(ctx, t, dt, a) {
    const n = Math.round(SNN * U.clamp(WX.snow));
    if (n < 1) return;
    const drift = 0.008 + WX.wind * 0.05;
    for (let i = 0; i < n; i++) {
      SY[i] += SV[i] * dt * (0.8 + 0.25 * SSZ[i]);
      SX[i] += (drift + 0.012 * Math.sin(t * 0.6 + SPH[i])) * dt;
      if (SY[i] > 1.02) { SY[i] -= 1.06; SX[i] = Math.random(); }
      if (SX[i] > 1.02) SX[i] -= 1.04;
    }
    const sc = U.safe(C.snow);
    for (let d = 0; d < 2; d++) {
      ctx.fillStyle = U.rgba(sc, a * (d ? 0.55 : 0.3));
      for (let i = 0; i < n; i++) {
        const big = SSZ[i] > 2;
        if (big !== (d === 1)) continue;
        const s = SSZ[i] * S;
        ctx.fillRect(SX[i] * W - s / 2, SY[i] * H - s / 2, s, s);
      }
    }
  }
})();
