// Ambient Wall - BOREAL theme: "the northern lake".
// Work: a ranger station on the edge of the Shield. Cold frost cyan and pine green on black. A thin
//       hero clock, one horizon hairline traced as a low spruce ridge with the sun's arc above it
//       (sunrise left, sunset right, light left beneath), calendar, hosts as survey marks, a ledger.
// Ambient: the landscape becomes the painting. Three seeded spruce ridges over a still lake that
//       mirrors the sky; dusk low on the horizon where the sun went, then navy night and stars. The
//       aurora builds over the evening as a pure function of frame.ambientElapsed (faint early, full by
//       ~2.5 h), drawn as folding ribbons: soft rays along a curved, glowing hem, green below and violet
//       above, wrapped in a low-res glow, a rose fringe in breakups, and reflected in the water. Hosts are cabin lights on the far shore; a host down is a warm red flare.
// The exhale: everything interpolates on frame.blend. The HUD fades and sinks in a staggered cascade,
//       the hairline ridge rises and fills into the silhouette layers, the lake opens beneath it, the
//       foreground spruce rise from below, the aurora arrives last. Back to work: the same, reversed.
// By day (frame.day): a Canadian Shield lake in the sun. A real sky baked per sun elevation / arc / weather
//       (deep blue overhead, the sun as glare in its real place, gold along the ridge at golden hour, grey
//       under overcast, rain, snow, milky fog), drifting fair-weather cumulus, the lake mirroring it all
//       with a glitter path under the sun, sunlit spruce and pink Shield granite, the cabins themselves,
//       and now and then a red canoe. Dusk hands over to the night scene and the aurora. Behind the work
//       face the same scene sits at ~0.18 and comes forward with the exhale. A closed exposure loop keeps
//       the day wall inside 25 + 20 * day; at night (day = 0) every frame is exactly the night scene.
(function () {
  const U = AW.util;
  const TAU = Math.PI * 2;
  const SANS = '"Inter", "Segoe UI", "DejaVu Sans", system-ui, sans-serif';
  const hex = U.hex;

  const C = {
    frost: hex("#64d2dc"),     // work hero: frost cyan
    ice: hex("#4cb2c2"),
    iceDim: hex("#2e7e8c"),
    iceFaint: hex("#1d5462"),
    pine: hex("#4cc89c"),      // cold green: calm, up
    straw: hex("#b4b46a"),     // finance drift
    alarm: hex("#e05838"),     // the rare loud thing (work)
    flare: hex("#e0923e"),
    jade: hex("#7ab8a6"),      // ambient clock: pale aurora jade
    navy: hex("#18307a"),
    navyDeep: hex("#0e1a4a"),
    dayBlue: hex("#1e4a72"),
    ridgeFar: hex("#010306"),  // far shore: just off black, darker than the airglow behind it
    rim: hex("#4a7ca6"),
    auroraG: hex("#46d68e"),
    auroraT: hex("#38b09c"),
    violet: hex("#7448c0"),
    magenta: hex("#a2429c"),
    fringe: hex("#c8466e"),    // breakup: the rose-red lower border
    airglow: hex("#2a7a5a"),
    ember: hex("#c8683a"),
    rose: hex("#8a3c5c"),
    duskViolet: hex("#3e2c6c"),
    star: hex("#7c92cc"),
    water: hex("#26487a"),
    cabin: hex("#e0a04a"),
    cabinDown: hex("#d85a36"),
    cloud: hex("#34466e"),     // night cloud: dim slate, lit by nothing but airglow
    mist: hex("#4e6a78"),      // mist on the water
    rain: hex("#5a7aa0"),
    ring: hex("#5a86a8"),      // rain rings on the lake
    snow: hex("#a4b6dc"),      // flakes and dusting: blue-white, never white
    bolt: hex("#7c84cc"),      // distant lightning: dim violet-blue
  };

  // The lake by day: final pixel colours in full noon light (the land is dimmed for the hour and weather
  // as it is drawn; the sky is baked per hour/weather in daySky).
  const DAYC = {
    farTop: hex("#3a5e62"), farBot: hex("#2a4446"), farRim: hex("#6a8a70"),            // the far shore, hazed
    nearTop: hex("#22442a"), nearBot: hex("#12281a"), nearLight: hex("#38602e"), nearDark: hex("#0e2014"),
    nearRim: hex("#5e8a3a"),                                                              // sunlit spruce crowns
    fgTop: hex("#10200f"), fgBot: hex("#08120a"), fgRim: hex("#3e5c26"),
    granite: hex("#6e5e5a"), graniteLo: hex("#4a3e3c"),
    gold: hex("#d8964a"), sunNoon: hex("#d8cc96"), sunLow: hex("#e0903e"),
    water: hex("#0a2252"), waterDeep: hex("#040e26"),
    cuLit: hex("#c4c6cc"), cuShade: hex("#7a8498"), cuGold: hex("#dca474"),
    deck: hex("#6a7078"), mist: hex("#7c8486"),
    canoe: hex("#8c3424"), paddler: hex("#1c1a18"), cabin: hex("#5a3e30"), roof: hex("#2e2826"),
  };

  const SQ = 0.82;       // reflections are squashed a little: the lake reads wider than it is
  const K_WORK = 0.8;    // the far ridge in work: the same silhouette, flattened to a low hairline
  const Q = 0.5;         // sky + aurora are painted at half resolution (soft for free)
  const fade = (b, a0, a1) => 1 - U.smoothstep(a0, a1, b);

  let W = 0, H = 0, dpr = 1, S = 1, built = "";
  let yH = 0, w1 = 0;    // horizon (far waterline), near waterline
  let mctx = null;
  let LS = false;        // letterSpacing support

  // ------------------------------------------------------------------ offscreen helpers
  function mk(wCss, hCss) {
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.ceil(wCss * dpr)); cv.height = Math.max(1, Math.ceil(hCss * dpr));
    const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { cv, c, w: wCss, h: hCss };
  }
  function mkHalf(wCss, hCss) {
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.ceil(wCss * Q)); cv.height = Math.max(1, Math.ceil(hCss * Q));
    const c = cv.getContext("2d"); c.setTransform(Q, 0, 0, Q, 0, 0);
    return { cv, c, w: wCss, h: hCss };
  }
  const ck = (c) => `${c.r | 0},${c.g | 0},${c.b | 0}`;

  // Text sprites: glow rendered once per (text, size, colour), then blitted. No per-frame shadowBlur.
  const sprites = new Map();
  function sprite(str, o) {
    const px = Math.round(o.px);
    const key = `${str}|${px}|${o.weight || 400}|${o.spacing || 0}|${ck(o.color)}|${o.glow || 0}|${o.core || 0}`;
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

  // Radial glow sprites, one per quantised colour. "soft" is a wide, gentle falloff for sky washes.
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

  // ------------------------------------------------------------------ the land (seeded, baked)
  // Black spruce: a thin spire, short drooping tiers, a dense club near the top.
  function spruce(p, r, x, base, h, w) {
    const n = Math.max(3, Math.round(h / (6.5 * S)));
    const top = base - h, th = h / n;
    const env = (t) => w * (0.16 + 0.84 * Math.pow(t, 0.85)) + w * 0.42 * Math.exp(-Math.pow((t - 0.1) / 0.06, 2));
    // ragged: uneven tier spacing, the odd short or missing branch, so the outline never reads as a comb
    const tip = () => { const q = r(); return q < 0.18 ? 0.2 + 0.2 * r() : q < 0.3 ? 1.1 + 0.4 * r() : 0.5 + 0.55 * r(); };
    const T = new Float32Array(n + 1);
    for (let j = 1; j <= n; j++) T[j] = U.clamp((j + (j < n ? (r() - 0.5) * 0.7 : 0)) / n, 0.02, 1);
    p.moveTo(x, top - th * 0.7);
    for (let j = 1; j <= n; j++) {
      const t = T[j], y = top + h * t, e = env(t), l = e * tip();
      p.lineTo(x + l, y + l * 0.32 - th * 0.15 + th * 0.3 * r());          // branch tip, drooping
      p.lineTo(x + e * (0.1 + 0.18 * r()), y + th * 0.35);                   // back in to the trunk
    }
    p.lineTo(x + w * 0.07, base + 4 * S);
    p.lineTo(x - w * 0.07, base + 4 * S);
    for (let j = n; j >= 1; j--) {
      const t = T[j] + (r() - 0.5) * 0.25 / n, y = top + h * t, e = env(t), l = e * tip();
      p.lineTo(x - e * (0.1 + 0.18 * r()), y + th * 0.35);
      p.lineTo(x - l, y + l * 0.32 - th * 0.15 + th * 0.3 * r());
    }
    p.closePath();
  }

  // A shoreline: rolling Shield hills under a crowd of spruce. env(u) shapes where land exists.
  function shore(seed, base, o) {
    const r = U.rng(seed), p = new Path2D();
    const nz = r() * 300;
    const hill = (u) => (o.hill0 + o.hillAmp * U.clamp(0.5 + U.fbm2(u * o.hillF + nz, 3.7, 3))) * H;
    // hill runs, wherever env > 0
    let inRun = false;
    const step = 2;
    for (let x = -4; x <= W + 4; x += step) {
      const e = o.env ? o.env(x / W) : 1;
      if (e > 0.02) {
        if (!inRun) { p.moveTo(x, base + 2 * S); inRun = true; }
        p.lineTo(x, base - hill(x / W) * Math.min(1, e * 1.4));
      } else if (inRun) { p.lineTo(x, base + 2 * S); p.closePath(); inRun = false; }
    }
    if (inRun) { p.lineTo(W + 4, base + 2 * S); p.closePath(); }
    // spruce, in stands and clearings
    let x = -6 * S;
    while (x < W + 6 * S) {
      const e = o.env ? U.clamp(o.env(x / W)) : 1;
      const stand = 0.5 + 0.5 * U.noise1(x / W * o.standF + nz);
      if (e > 0.05 && r() > o.clear * (1.2 - stand)) {
        const th = (o.tMin + Math.pow(r(), 1.5) * (o.tMax - o.tMin)) * H * (0.35 + 0.65 * e) * (0.55 + 0.6 * stand);
        const hb = hill(x / W) * Math.min(1, e * 1.4);
        spruce(p, r, x, base - hb + 1.5 * S, th, th * (0.11 + 0.06 * r()));
      }
      x += (o.gap0 + r() * o.gap1) * S;
    }
    return p;
  }

  // Bake a path into a fill canvas and a rim canvas. The rim is the upward-facing edges only (the
  // shape minus itself nudged down a pixel), lit from the sky: bright at the crest, fading lower down
  // (fadeTo = rim strength at the bottom of the layer), so tall trees never read as a lit comb.
  // Also returns the crest per device column (-1 = open water).
  function bakeLayer(path, top, bottom, fillCol, fadeTo, day) {
    const h = bottom - top;
    const fill = mk(W, h), rim = mk(W, h);
    fill.c.setTransform(dpr, 0, 0, dpr, 0, -top * dpr);
    fill.c.fillStyle = fillCol; fill.c.fill(path);
    const cw = fill.cv.width, ch = fill.cv.height;
    const id = fill.c.getImageData(0, 0, cw, ch).data;
    const crest = new Float32Array(cw);
    for (let i = 0; i < cw; i++) {
      crest[i] = -1;
      for (let j = 0; j < ch - 2; j++) if (id[(j * cw + i) * 4 + 3] > 24) { crest[i] = j; break; }
    }
    const x = rim.c;
    x.setTransform(dpr, 0, 0, dpr, 0, -top * dpr);
    x.fillStyle = U.rgba(U.safe(C.rim), 1); x.fill(path);
    x.globalCompositeOperation = "destination-out";
    x.setTransform(dpr, 0, 0, dpr, 0, (-top + 1.1 * S) * dpr);
    x.fillStyle = "#000"; x.fill(path);
    if (fadeTo != null && fadeTo < 1) {
      x.globalCompositeOperation = "destination-in";
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.35, `rgba(0,0,0,${(0.35 + 0.65 * fadeTo).toFixed(3)})`);
      g.addColorStop(1, `rgba(0,0,0,${fadeTo})`);
      x.fillStyle = g; x.fillRect(0, 0, W, h);
    }
    x.globalCompositeOperation = "source-over";
    // snow dusting: the same upward-facing edges, a touch thicker, blue-white, even on the lower tiers
    const dust = mk(W, h), d = dust.c;
    d.setTransform(dpr, 0, 0, dpr, 0, -top * dpr);
    d.fillStyle = U.rgba(U.safe(C.snow), 1); d.fill(path);
    d.globalCompositeOperation = "destination-out";
    d.setTransform(dpr, 0, 0, dpr, 0, (-top + 1.9 * S) * dpr);
    d.fillStyle = "#000"; d.fill(path);
    d.globalCompositeOperation = "destination-in";
    d.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dg = d.createLinearGradient(0, 0, 0, h);
    dg.addColorStop(0, "rgba(0,0,0,0.85)"); dg.addColorStop(1, `rgba(0,0,0,${Math.max(0.35, fadeTo == null ? 1 : fadeTo).toFixed(3)})`);
    d.fillStyle = dg; d.fillRect(0, 0, W, h);
    d.globalCompositeOperation = "source-over";
    const L = { fill, rim, dust, top, h, crest };
    if (day) bakeDayLayer(L, path, day);
    return L;
  }

  // By day the same land in sunlight: dfill (spruce green, darker toward the water; Shield granite along
  // the shore where asked) and drim (the crests catching the sun, recoloured from the rim).
  function bakeDayLayer(L, path, day) {
    const { top, h } = L;
    const df = mk(W, h), x = df.c;
    x.setTransform(dpr, 0, 0, dpr, 0, -top * dpr);
    const g = x.createLinearGradient(0, top, 0, top + h);
    g.addColorStop(0, U.rgba(day.top, 1)); g.addColorStop(day.mid || 0.6, U.rgba(U.mix(day.top, day.bottom, 0.6), 1)); g.addColorStop(1, U.rgba(day.bottom, 1));
    x.fillStyle = g; x.fill(path);
    x.globalCompositeOperation = "source-atop";
    // stands of lighter and darker spruce, so a shore is a forest rather than a flat cut-out
    const r = U.rng(day.seed || 5), tex = day.tex || 0;
    for (let k = 0; k < tex; k++) {
      const px = r() * W, py = top + Math.pow(r(), 0.7) * h, n = U.noise1(px / W * 9 + (day.seed || 5));
      x.fillStyle = U.rgba(n > 0 ? day.light || day.top : day.dark || day.bottom, 0.18 + 0.2 * r());
      x.beginPath(); x.ellipse(px, py, (8 + 30 * r()) * S, (2 + 6 * r()) * S, 0, 0, TAU); x.fill();
    }
    // Shield granite: pink-grey rock along the waterline, broken by the trees standing on it
    if (day.granite) {
      const base = top + h - 1;
      x.beginPath(); x.moveTo(0, base + 2);
      for (let px = 0; px <= W; px += 4 * S) {
        const q = U.clamp(0.5 + U.fbm2(px / (70 * S) + 3.3, 1.9, 3) * 1.2);
        x.lineTo(px, base - (0.002 + 0.011 * q * q) * H);
      }
      x.lineTo(W, base + 2); x.closePath();
      const gg = x.createLinearGradient(0, base - 0.012 * H, 0, base);
      gg.addColorStop(0, U.rgba(DAYC.granite, 1)); gg.addColorStop(1, U.rgba(DAYC.graniteLo, 1));
      x.fillStyle = gg; x.fill();
    }
    x.globalCompositeOperation = "source-over";
    const dr = mk(W, h), y = dr.c;
    y.setTransform(1, 0, 0, 1, 0, 0);
    y.drawImage(L.rim.cv, 0, 0);
    y.globalCompositeOperation = "source-in";
    y.fillStyle = U.rgba(day.rim, 1); y.fillRect(0, 0, dr.cv.width, dr.cv.height);
    y.globalCompositeOperation = "source-over";
    // the same crests at golden hour: a thicker, warm edge (the rim twice, a pixel apart)
    const dg = mk(W, h), z = dg.c;
    z.setTransform(1, 0, 0, 1, 0, 0);
    z.drawImage(L.rim.cv, 0, 0); z.drawImage(L.rim.cv, 0, Math.round(1.2 * S * dpr));
    z.globalCompositeOperation = "source-in";
    z.fillStyle = U.rgba(DAYC.gold, 1); z.fillRect(0, 0, dg.cv.width, dg.cv.height);
    z.globalCompositeOperation = "source-over";
    L.dfill = df; L.drim = dr; L.dgold = dg;
  }

  let L0 = null, L1 = null, L2 = null;
  let R0 = null, NW = 0; // far ridge height above the horizon, per CSS column
  let kHair = K_WORK;    // the plumb line ends on the work hairline (by day the ridge stands at full height)
  let HLX = null, HLH = null, HLN = 0; // the work hairline: crest vertices (x, height), apexes exact
  let hairGrad = null, hairCtx = null;

  // The far shore, analytic: rolling hill plus spruce at that distance. The same trees give the work
  // hairline (clean spires, so the hairline is the ridge, flattened) and the ambient silhouette, where
  // each one is a ragged little spruce standing in a forest canopy of uneven height and density.
  function farShore(seed) {
    const r = U.rng(seed), nz = r() * 300;
    const hill = (x) => (0.002 + 0.03 * U.clamp(0.5 + U.fbm2(x / W * 4 + nz, 3.7, 3))) * H;
    NW = Math.ceil(W) + 1;
    R0 = new Float32Array(NW);
    for (let i = 0; i < NW; i++) R0[i] = hill(i);
    const apex = [], trees = [];
    let x = -6 * S;
    while (x < W + 6 * S) {
      const stand = 0.5 + 0.5 * U.noise1(x / W * 5 + nz);
      if (r() > 0.42 * (1.2 - stand)) {
        const th = (0.01 + Math.pow(r(), 1.5) * 0.03) * H * (0.55 + 0.6 * stand);
        const hw = th * (0.15 + 0.08 * r()), hb = hill(x);
        trees.push(x, hb, th, hw);
        for (let k = Math.max(0, Math.floor(x - hw)); k <= Math.min(NW - 1, Math.ceil(x + hw)); k++) {
          const v = hb + th * (1 - Math.abs(k - x) / hw);
          if (v > R0[k]) R0[k] = v;
        }
        apex.push(x, hb + th);
      }
      x += (4.5 + r() * 8) * S;
    }
    // hairline vertices: every column, plus the exact apex of every spire (crisp tips)
    const pts = [];
    for (let i = 0; i < NW; i++) pts.push([i, R0[i]]);
    for (let i = 0; i < apex.length; i += 2) if (apex[i] >= 0 && apex[i] < NW - 1) pts.push([apex[i], apex[i + 1]]);
    pts.sort((a, b) => a[0] - b[0]);
    HLN = pts.length; HLX = new Float32Array(HLN); HLH = new Float32Array(HLN);
    pts.forEach((q, k) => { HLX[k] = q[0]; HLH[k] = q[1]; });
    return farRidge(trees, hill, nz);
  }

  // A spruce at the far shore: a narrow spire whose sides step out in a few ragged tiers. Wider at the
  // foot than the work hairline's clean triangle, so a stand of them knits into one forest mass.
  function farTree(p, r, x, base, th, hw) {
    const n = 3 + ((r() * 3) | 0);
    p.moveTo(x - hw, base + 2 * S);
    for (let j = 0; j < n; j++) {                 // up the left side, tier by tier
      const t = (j + 0.4 + 0.3 * r()) / (n + 0.4), w = hw * Math.pow(1 - t, 0.85);
      p.lineTo(x - w * (0.95 + 0.35 * r()), base - th * t);
      p.lineTo(x - w * (0.45 + 0.2 * r()), base - th * (t + 0.35 / n));
    }
    p.lineTo(x, base - th);
    for (let j = n - 1; j >= 0; j--) {            // and down the right
      const t = (j + 0.4 + 0.3 * r()) / (n + 0.4), w = hw * Math.pow(1 - t, 0.85);
      p.lineTo(x + w * (0.45 + 0.2 * r()), base - th * (t + 0.35 / n));
      p.lineTo(x + w * (0.95 + 0.35 * r()), base - th * t);
    }
    p.lineTo(x + hw, base + 2 * S);
    p.closePath();
  }

  // The ambient far ridge: the hill, a dense forest of spires riding on it (tall and crowded in the
  // stands, short and thin in the clearings, the odd lone tall one), and the hairline's own trees.
  function farRidge(trees, hill, nz) {
    const r = U.rng(7111), p = new Path2D();
    const stand = (x) => U.clamp(0.5 + 0.55 * U.noise1(x / W * 5 + nz) + 0.3 * U.noise1(x / W * 19 + nz * 1.7));
    p.moveTo(-4, yH + 2 * S);
    for (let x = -4; x <= W + 4; x += 2) p.lineTo(x, yH - hill(x) - H * 0.003 * stand(x));
    p.lineTo(W + 4, yH + 2 * S); p.closePath();
    let x = -6 * S;
    while (x < W + 6 * S) {
      const st = stand(x);
      if (r() < 0.2 + 0.8 * st) {
        const th = H * (0.006 + 0.019 * st) * (0.45 + 0.75 * Math.pow(r(), 0.8));
        farTree(p, r, x, yH - hill(x) + 1 * S, th, th * (0.2 + 0.1 * r()));
      }
      x += (1.6 + r() * (2.2 + 3 * (1 - st))) * S;
    }
    // the hairline's trees: same places, same heights
    for (let i = 0; i < trees.length; i += 4) {
      const tx = trees[i], hb = trees[i + 1], th = trees[i + 2], hw = trees[i + 3];
      farTree(p, r, tx, yH - hb + 1 * S, th, hw * (1.05 + 0.3 * r()));
    }
    return p;
  }

  function buildLand() {
    // far shore: the whole width, low
    const p0 = farShore(7101);
    L0 = bakeLayer(p0, yH - 0.095 * H, yH + 1, U.rgba(U.safe(C.ridgeFar), 1), 0.25,
      { top: DAYC.farTop, bottom: DAYC.farBot, mid: 0.85, rim: DAYC.farRim, tex: 120, seed: 11, light: DAYC.farTop, dark: DAYC.farBot });
    // near points: a spruce peninsula from the west, an island to the east
    const env1 = (u) => Math.max(U.smoothstep(0.37, 0.2, u), U.smoothstep(0.62, 0.67, u) * U.smoothstep(0.81, 0.75, u));
    const p1 = shore(7202, w1, { env: env1, hill0: 0.004, hillAmp: 0.03, hillF: 4, tMin: 0.025, tMax: 0.085,
      gap0: 4, gap1: 7, clear: 0.12, standF: 6 });
    L1 = bakeLayer(p1, w1 - 0.13 * H, w1 + 1, "#000", 0.3,
      { top: DAYC.nearTop, bottom: DAYC.nearBot, mid: 0.7, rim: DAYC.nearRim, tex: 260, seed: 23, light: DAYC.nearLight, dark: DAYC.nearDark, granite: true });
    // foreground: tall spruce on our own shore, framing the view at both edges
    const r = U.rng(7303), p2 = new Path2D();
    const base = H + 2 * S;
    p2.moveTo(-4, base); p2.quadraticCurveTo(0.06 * W, H - 0.05 * H, 0.15 * W, base); p2.closePath();
    p2.moveTo(0.9 * W, base); p2.quadraticCurveTo(0.96 * W, H - 0.04 * H, W + 4, base); p2.closePath();
    const lt = [[-0.005, 0.5], [0.028, 0.4], [0.055, 0.56], [0.086, 0.33], [0.112, 0.24]];
    const rt = [[0.948, 0.3], [0.975, 0.44], [1.002, 0.36]];
    for (const [u, hh] of lt.concat(rt)) {
      const h = hh * H * (0.92 + 0.16 * r());
      spruce(p2, r, u * W, base - (u < 0.5 ? 0.02 : 0.015) * H, h, h * (0.07 + 0.025 * r()));
    }
    L2 = bakeLayer(p2, H - 0.62 * H, H, "#000", 0.06,
      { top: DAYC.fgTop, bottom: DAYC.fgBot, mid: 0.5, rim: DAYC.fgRim, tex: 90, seed: 37, light: DAYC.fgTop, dark: DAYC.fgBot });
    hairGrad = null;
  }

  // ------------------------------------------------------------------ sky, stars, lake detail
  let skyC = null, skyKey = "", auroraC = null, starsL = null;
  const TW_N = 16;
  const TWX = new Float32Array(TW_N), TWY = new Float32Array(TW_N), TWP = new Float32Array(TW_N);
  const SH_N = 34;
  const SHX = new Float32Array(SH_N), SHY = new Float32Array(SH_N), SHL = new Float32Array(SH_N), SHP = new Float32Array(SH_N);

  function buildStars() {
    starsL = mk(W, yH);
    const x = starsL.c, r = U.rng(31337);
    const sc = U.safe(C.star);
    for (let i = 0; i < 150; i++) {
      const sx = r() * W, sy = Math.pow(r(), 1.25) * yH * 0.93, a = 0.08 + r() * 0.3, s = (r() < 0.08 ? 1.6 : 1) * S;
      x.fillStyle = U.rgba(sc, a); x.beginPath(); x.arc(sx, sy, s, 0, TAU); x.fill();
    }
    for (let i = 0; i < TW_N; i++) { TWX[i] = r() * W; TWY[i] = Math.pow(r(), 1.4) * yH * 0.8; TWP[i] = r() * 100; }
    // shimmer lines on the lake: denser and shorter toward the far shore
    for (let i = 0; i < SH_N; i++) {
      const v = Math.pow(r(), 1.5);
      SHY[i] = yH + 0.006 * H + v * (H - yH) * 0.95;
      SHX[i] = (0.05 + r() * 0.9) * W;
      SHL[i] = (0.03 + 0.14 * r()) * W * (0.35 + v);
      SHP[i] = r() * 100;
    }
  }

  // The sky wash, cached per half degree of sun elevation (and the sun's place along its arc).
  function paintSky(elev, u, sunSide) {
    const c = skyC.c;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, skyC.cv.width, skyC.cv.height);
    c.setTransform(Q, 0, 0, Q, 0, 0);
    const dusk = U.smoothstep(-12, -2, elev) * (1 - U.smoothstep(6, 16, elev));
    const day = U.smoothstep(2, 14, elev);
    const night = 1 - U.smoothstep(-16, -6, elev);
    // deep navy from the zenith, thinning toward the horizon (cold blue by day)
    const base = U.safe(U.mix(U.mix(C.navyDeep, C.navy, night), C.dayBlue, day));
    let g = c.createLinearGradient(0, 0, 0, yH);
    // at night the zenith is darkest and the horizon a touch brighter (airglow): no dark band low in the sky
    g.addColorStop(0, U.rgba(base, 0.11 - 0.025 * night)); g.addColorStop(0.55, U.rgba(base, 0.06 + 0.012 * night));
    g.addColorStop(1, U.rgba(base, 0.035 + 0.03 * day + 0.045 * night));
    c.fillStyle = g; c.fillRect(0, 0, W, yH);
    // twilight: a cold blue band rising off the horizon while the sun is near it
    const tw = U.smoothstep(-10, -1, elev) * (1 - U.smoothstep(8, 18, elev));
    if (tw > 0.01) {
      g = c.createLinearGradient(0, yH, 0, yH * 0.35);
      const tc = U.safe(U.mix(C.dayBlue, C.navy, 0.3));
      g.addColorStop(0, U.rgba(tc, 0.12 * tw)); g.addColorStop(0.5, U.rgba(tc, 0.05 * tw)); g.addColorStop(1, U.rgba(tc, 0));
      c.fillStyle = g; c.fillRect(0, yH * 0.35, W, yH * 0.65);
    }
    // dusk: ember on the horizon where the sun went down, rose and violet above it
    if (dusk > 0.01) {
      const sinkK = U.smoothstep(3, -10, elev);
      const sx = sunSide * W;
      glow(c, U.mix(C.rose, C.duskViolet, sinkK), sx, yH, 0.62 * W, 0.42 * H, 0.12 * dusk, true);
      glow(c, U.mix(C.ember, C.rose, sinkK), sx, yH + 0.01 * H, 0.34 * W, 0.15 * H, 0.26 * dusk * (1 - 0.55 * sinkK), true);
      // the sun itself, low: a small amber bloom resting on the ridge until it is gone
      const low = U.smoothstep(-2, 0.5, elev) * (1 - U.smoothstep(6, 12, elev));
      if (low > 0.01) glow(c, C.ember, sx, yH - Math.max(0, elev) * 0.012 * H, 0.07 * W, 0.045 * H, 0.42 * low);
    }
    // day: the sun as a pale bloom on its arc (weekend afternoons)
    if (day > 0.01 && u >= 0 && u <= 1) {
      const sx = U.lerp(0.1, 0.9, u) * W, sy = yH - 0.14 * H * Math.sin(Math.PI * u);
      glow(c, C.dayBlue, sx, sy, 0.4 * W, 0.3 * H, 0.08 * day, true);
    }
    // night: a faint green airglow band resting on the horizon
    if (night > 0.01) {
      g = c.createLinearGradient(0, yH, 0, yH - 0.22 * H);
      const ag = U.safe(C.airglow);
      g.addColorStop(0, U.rgba(ag, 0.085 * night)); g.addColorStop(0.3, U.rgba(ag, 0.04 * night)); g.addColorStop(1, U.rgba(ag, 0));
      c.fillStyle = g; c.fillRect(0, yH - 0.22 * H, W, 0.22 * H);
    }
  }

  // ------------------------------------------------------------------ aurora
  // A curtain is a luminous RIBBON hanging from a curved base line (the hem) that folds back on itself
  // in perspective: the near side of a fold sits higher with taller rays, the far side lower and
  // shorter, and where the ribbon turns it is seen edge-on and glows brighter. Hundreds of soft,
  // overlapping ray streaks sit along the ribbon: a bright, softly glowing lower hem, a green body,
  // long tails thinning through violet to nothing. A 1/8-res glow layer (radial sprites, no shadowBlur)
  // wraps the bright parts and spills a little light into the sky below the hem, so the sky under a
  // curtain stays continuous with the sky around it. In a breakup a thin pink-red fringe lights the hem.
  const GQ = 0.125;                    // glow layer scale
  const RAY_HEM = 0.08;                // ray sprite: fraction of its height that hangs below the hem
  const HEM_CORE = 0.52;               // hem sprite: where its bright core sits, from the top
  let raySpr = [], hemSpr = null, fringeSpr = null, glowC = null, glowRow = null, rimLit = null;
  // a soft horizontal profile (gaussian-ish), applied to a vertical sprite
  function softSides(x, w, h) {
    x.globalCompositeOperation = "destination-in";
    const sg = x.createLinearGradient(0, 0, w, 0);
    sg.addColorStop(0, "rgba(0,0,0,0)"); sg.addColorStop(0.18, "rgba(0,0,0,0.16)"); sg.addColorStop(0.34, "rgba(0,0,0,0.62)");
    sg.addColorStop(0.5, "rgba(0,0,0,1)"); sg.addColorStop(0.66, "rgba(0,0,0,0.62)"); sg.addColorStop(0.82, "rgba(0,0,0,0.16)");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = sg; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = "source-over";
  }
  // vertical sprite from a profile: f(v) -> [colour, alpha], v = 0 at the bottom, 1 at the top
  function vSprite(w, h, vs, f) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const x = cv.getContext("2d");
    const g = x.createLinearGradient(0, h, 0, 0);
    for (const v of vs) { const [col, a] = f(v); g.addColorStop(v, U.rgba(U.safe(col), U.clamp(a))); }
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    softSides(x, w, h);
    return cv;
  }
  function buildRays() {
    raySpr = [];
    const G = U.safe(C.auroraG), T = U.safe(C.auroraT), V = U.safe(C.violet), M = U.safe(C.magenta);
    const GT = U.mix(G, T, 0.55);
    const vs = [0, 0.02, 0.04, 0.06, 0.07, 0.08, 0.09, 0.1, 0.12, 0.14, 0.17, 0.2, 0.24, 0.28, 0.33, 0.39, 0.45, 0.52,
      0.59, 0.66, 0.73, 0.8, 0.87, 0.93, 0.97, 1];
    // the ray body: rises softly out of the hem, then a long tail thinning through violet to nothing
    for (const vio of [0.6, 1, 1.45]) {
      raySpr.push(vSprite(16, 256, vs, (v) => {
        if (v <= RAY_HEM) return [G, 0.75 * Math.pow(v / RAY_HEM, 1.8)];
        const q = (v - RAY_HEM) / (1 - RAY_HEM);
        let col = q < 0.22 ? U.mix(G, GT, q / 0.22) : U.mix(GT, V, U.smoothstep(0.22, 0.22 + 0.4 / vio, q));
        col = U.mix(col, M, 0.6 * U.smoothstep(0.45, 0.9, q) * Math.min(1, vio));
        return [col, (0.7 + 0.3 * Math.exp(-q / 0.05)) * Math.pow(1 - q, 1.35)];
      }));
    }
    // the hem: a short bright streak with a soft glow above and below it (core at HEM_CORE from the top)
    const hv = [0, 0.1, 0.2, 0.3, 0.38, 0.44, 0.48, 0.52, 0.58, 0.66, 0.76, 0.88, 1];
    hemSpr = vSprite(16, 64, hv, (v) => {
      const d = v - (1 - HEM_CORE);
      return [U.mix(G, T, U.smoothstep(0, 0.5, d) * 0.5), d < 0 ? Math.exp(-(d * d) / 0.012) : Math.exp(-(d * d) / 0.03)];
    });
    // the breakup fringe: a thin rose-red glow lying just under the green hem
    const F = U.safe(C.fringe);
    fringeSpr = vSprite(16, 64, [0, 0.3, 0.55, 0.75, 1], (v) =>
      v < 0.3 ? [F, 0.45 * v / 0.3] : v < 0.55 ? [F, 0.45 + 0.55 * (v - 0.3) / 0.25] : v < 0.75 ? [U.mix(F, G, 0.4), 0.35] : [G, 0]);
  }

  // Curtains are seeded per evening (the date the ambient period began), so each night differs
  // but a reload at 22:30 shows the same sky. How strong they are follows ambientElapsed; how they
  // move follows real time (frame.t), so the sky dances at a calm pace regardless of warp.
  // dp is depth: 0 = far (low over the far shore, compressed, faint), 1 = near (high, tall).
  let curt = [], curtSeed = -1;
  function buildCurtains(seed) {
    curtSeed = seed;
    const r = U.rng(seed);
    const rr = (a, b) => a + r() * (b - a);
    const spec = [
      // far: a long low arc just above the far shore, there from the start
      { xa: rr(0.03, 0.1), xb: rr(0.62, 0.74), yb: rr(0.5, 0.525), hg: rr(0.09, 0.11), w: 0.85, dp: 0, on: 0,
        fA: rr(0.75, 0.95), wl: rr(2.6, 3.6) },
      // middle distance: higher and to the east, arriving within the first hour
      { xa: rr(0.36, 0.44), xb: rr(0.92, 1.0), yb: rr(0.37, 0.4), hg: rr(0.17, 0.21), w: 0.95, dp: 0.55, on: 2400,
        fA: rr(1.0, 1.3), wl: rr(1.7, 2.3) },
      // near: a tall folded curtain high in the sky, the evening's peak
      { xa: rr(0.1, 0.2), xb: rr(0.6, 0.7), yb: rr(0.26, 0.29), hg: rr(0.26, 0.31), w: 1, dp: 1, on: 6000,
        fA: rr(1.1, 1.4), wl: rr(1.3, 1.8) },
    ];
    curt = spec.map((c, k) => {
      const span = (c.xb - c.xa) * W;
      const n = Math.round(span * (1 + 0.6 * c.fA) / ((5 + 1.2 * c.dp) * S));
      const RA = new Float32Array(n), RW = new Float32Array(n), RV = new Uint8Array(n), RH = new Float32Array(n);
      const RF = new Float32Array(n), RP = new Float32Array(n), RJ = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const q = r();
        RA[i] = 0.15 + 0.85 * Math.pow(r(), 1.2);
        RW[i] = (4.5 + 8 * r()) * (0.65 + 0.5 * c.dp);
        RV[i] = (r() * 3) | 0;
        RH[i] = q < 0.1 ? 1.2 + 0.3 * r() : 0.6 + 0.5 * r();       // a few rays reach much higher
        RF[i] = 2.2 + r() * 4.5; RP[i] = r() * TAU;                // shimmer: sub-second, per ray
        RJ[i] = (r() - 0.5) * 0.8;
      }
      return Object.assign(c, { n, span, RA, RW, RV, RH, RF, RP, RJ, sd: r() * 100, amp: rr(0.016, 0.026) * (0.6 + 0.6 * c.dp),
        arch: rr(0.02, 0.035) * (1 - 0.7 * c.dp),
        sp: rr(0.08, 0.14) * (k & 1 ? -1 : 1),   // travelling fold: waves per second along the ribbon
        ph: r() * 10, ck: r() * 500, bu: 0,
        HX: new Float32Array(n), HY: new Float32Array(n), HH: new Float32Array(n), HA: new Float32Array(n), HB: new Float32Array(n) });
    });
  }

  // How much aurora tonight: faint early, building to full after ~2.5 h, with slow surges.
  // A pure function of ambientElapsed.
  function auroraLevel(e) {
    const grow = 0.14 + 0.86 * U.smoothstep(600, 9000, e);
    const surge = 0.8 + 0.2 * U.clamp(U.noise1(e / 1100 + 7.3) * 1.3, -1, 1);
    return grow * surge;
  }

  // Breakups: every 7-21 minutes (seeded per evening) one curtain brightens and its folds race for
  // 20-40 s, then it calms. Returns 0..1 for curtain k at real time T.
  function burst(T, k) {
    const P = 840, s = Math.floor(T / P), ph = T - s * P, sd = curtSeed * 0.0137;
    const t0 = hash(sd + s * 7.13) * 420, dur = 20 + 20 * hash(sd + s * 3.7 + 1);
    if (Math.floor(hash(sd + s * 5.1 + 2) * curt.length) !== k || ph < t0) return 0;
    const x = ph - t0;
    return U.smoothstep(0, 6, x) * (1 - U.smoothstep(dur, dur + 12, x));
  }
  // advance each curtain's own clocks: the fold phase and the undulation clock speed up in a breakup
  function stepAurora(dt, T) {
    for (let k = 0; k < curt.length; k++) {
      const cu = curt[k];
      cu.bu = burst(T, k);
      cu.ph += dt * cu.sp * (1 + 1.6 * cu.bu);
      cu.ck += dt * (1 + 1.4 * cu.bu);
    }
  }

  // glowRow: one row holding how much aurora light there is above each column (lights the ridge rim)
  function drawAurora(c, T, A, e) {
    const gc = glowC.c, gr = glowRow.c;
    gc.setTransform(1, 0, 0, 1, 0, 0); gc.globalAlpha = 1; gc.clearRect(0, 0, glowC.cv.width, glowC.cv.height);
    gc.setTransform(GQ, 0, 0, GQ, 0, 0);
    gr.setTransform(1, 0, 0, 1, 0, 0); gr.globalAlpha = 1; gr.clearRect(0, 0, glowRow.cv.width, glowRow.cv.height);
    gr.setTransform(GQ, 0, 0, 1, 0, 0);
    const lowG = C.auroraG, hiG = U.mix(C.auroraT, C.violet, 0.45);
    // pass 1: the ribbons' geometry, and the glow envelope around them
    for (let k = 0; k < curt.length; k++) {
      const cu = curt[k], bu = cu.bu;
      // a perceptual lift, so the quiet early arc is a faint ribbon rather than nothing
      cu.vis = Math.pow(A * cu.w * U.smoothstep(cu.on, cu.on + 2400, e), 0.75) * (1 + 0.35 * bu);
      if (cu.vis < 0.01) continue;
      const vis = cu.vis, ck = cu.ck, sd = cu.sd, n = cu.n, dp = cu.dp, span = cu.span;
      // the whole curtain drifts and swings across the sky over minutes
      const sx = 0.06 * W * U.noise1(ck / 110 + sd), sy = 0.018 * H * U.noise1(ck / 140 + sd + 5);
      const x0 = cu.xa * W + sx;
      // now and then a soft gap wanders along it: the curtain splits, then knits back
      const gu = 0.5 + 0.38 * U.noise1(ck / 47 + sd + 2), gd = U.smoothstep(0.15, 0.55, U.noise1(ck / 83 + sd + 9));
      const HX = cu.HX, HY = cu.HY, HH = cu.HH, HA = cu.HA, HB = cu.HB;
      const ds = 1 / n, ampH = cu.amp * H * (1 + 0.4 * bu), D = (0.01 + 0.032 * dp) * H;
      const wob = 0.012 * W * (0.5 + 0.5 * dp);
      for (let i = 0; i < n; i++) {
        const s = U.clamp((i + 0.5 + cu.RJ[i]) * ds);
        // the fold: the ribbon swings forward and back as it runs; where the swing outruns the run it
        // folds back on itself. The wave travels along the ribbon (cu.ph), its depth breathes over minutes.
        const th = TAU * (s * cu.wl - cu.ph) + 0.9 * U.noise1(s * 2.3 + sd);
        const fa = cu.fA * (0.5 + 0.75 * U.clamp(0.5 + 0.9 * U.noise2(s * 1.6 + sd, ck * 0.011)));
        const sn = Math.sin(th), cs = Math.cos(th);
        const x = x0 + s * span + fa * span / (TAU * cu.wl) * sn + wob * U.noise2(s * 6 + sd, ck * 0.035);
        const dx = 1 + fa * cs;                                  // run of the ribbon across the sky
        const edge = Math.min(1.7, Math.pow(1 / Math.max(0.3, Math.abs(dx)), 0.5)); // edge-on: brighter
        // base line: the perspective arc, slow ripples, and the fold's depth. The swing is a meander in
        // depth seen obliquely: where it swings forward it also comes nearer (higher, taller rays), so the
        // run that folds back slants through it: sideways S-curves and hooks. The slant wanders along the
        // ribbon, so some folds hook up, some down, some step straight across; never a row of scallops.
        const d = 2 * s - 1;
        const yb = sy + (cu.yb + cu.arch * d * d) * H - D * Math.sin(th + 1.3 * U.noise1(s * 1.4 + sd + 20)) + ampH * (U.noise2(s * 1.6 + sd + 9, ck * 0.05) +
          0.45 * U.noise2(s * 4.2 + sd, ck * 0.12) + 0.18 * U.noise2(s * 9.5 + sd, ck * 0.3));
        const env = U.smoothstep(0, 0.13, s) * U.smoothstep(1, 0.85, s);
        const g = (s - gu) / 0.05;
        // brightness along the ribbon: patches drifting along it, a wave riding the fold, edge-on folds.
        // The hem carries it continuously (the lower border is the brightest line of a curtain); the body
        // above is striated into rays.
        const pat = U.clamp(0.5 + 0.95 * U.noise2(s * 3.6 - ck * 0.03, sd + 3));
        let wave = 0.5 + 0.5 * Math.sin(th - 1.2);
        wave *= wave;
        const base = vis * env * (1 - gd * Math.exp(-g * g)) * edge * (0.3 + 0.7 * pat) * (0.6 + 0.6 * wave);
        // fine structure drifting along the ribbon: the rays seem to run sideways
        let fine = 0.5 + 0.5 * U.noise1(s * 70 * (0.6 + 0.4 * dp) * span / W + ck * 0.35 + sd);
        fine = Math.pow(fine, 1.5);
        const hh = cu.hg * H * (1 + 0.22 * dp * sn) * (0.6 + 0.8 * U.clamp(0.5 + U.noise2(s * 2.4 - sd, ck * 0.04))) *
          (0.75 + 0.25 * env) * (1 + 0.25 * bu);
        HX[i] = x; HY[i] = yb; HH[i] = hh; HB[i] = base; HA[i] = base * (0.25 + 0.95 * fine);
      }
      // the glow envelope: radial sprites along the ribbon, a green hem glow and a fainter, higher veil
      const m = 10, rx = (0.022 + 0.014 * dp) * W;
      for (let i0 = 0; i0 < n; i0 += m) {
        const i1 = Math.min(n, i0 + m);
        let sa = 0, sxx = 0, syy = 0, shh = 0;
        for (let i = i0; i < i1; i++) { sa += HB[i]; sxx += HX[i]; syy += HY[i]; shh += HH[i]; }
        const cnt = i1 - i0, aB = Math.pow(sa / cnt, 1.15);
        if (aB < 0.006) continue;
        const gx = sxx / cnt, gy = syy / cnt, gh = shh / cnt;
        glow(gc, lowG, gx, gy - gh * 0.08, rx, gh * 0.42, aB * 0.13, true);
        glow(gc, hiG, gx, gy - gh * 0.55, rx * 1.3, gh * 0.6, aB * 0.035 * (1 + bu), true);
        glow(gr, lowG, gx, 0, rx * 1.6, 1, aB * 0.5 * (0.5 + 0.5 * (1 - dp)), true);
      }
    }
    // the glow goes under the rays
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.drawImage(glowC.cv, 0, 0, W, yH);
    // pass 2: the rays. source-over, not lighter: crowded rays build coverage (bright folds) but the
    // colour can never climb past the safe sprite colours, even in a breakup
    const F = fringeSpr, yRef = 0.4 * H;
    let lvl = 1e9, lean = 0;
    for (let k = 0; k < curt.length; k++) {
      const cu = curt[k], bu = cu.bu;
      if (!(cu.vis >= 0.01)) continue;
      const HX = cu.HX, HY = cu.HY, HH = cu.HH, HA = cu.HA, HB = cu.HB, n = cu.n;
      const kr = 2.3 * (0.75 + 0.25 * cu.dp), kh = 0.9;
      const hs = hemSpr;
      for (let i = 0; i < n; i++) {
        const sh = Math.sin(T * cu.RF[i] + cu.RP[i]);
        const ra = HA[i] * cu.RA[i] * kr * (0.86 + 0.14 * sh);
        if (HB[i] < 0.006) continue;
        const hh = HH[i] * cu.RH[i] * (1 + 0.05 * sh), w = cu.RW[i] * S;
        // rays lean very slightly toward the magnetic zenith above the middle of the sky: a shear, in a
        // dozen steps across the sky (one transform per step, not per ray), offset so the foot stays put
        const lv = Math.round((HX[i] / W - 0.5) * 12);
        if (lv !== lvl) { lvl = lv; lean = lv / 12 * 0.2; c.setTransform(Q, 0, Q * lean, Q, -Q * lean * yRef, 0); }
        const x = HX[i] - lean * (HY[i] - yRef);
        c.globalAlpha = U.clamp(ra);
        c.drawImage(raySpr[cu.RV[i]], x - w / 2, HY[i] - hh * (1 - RAY_HEM), w, hh);
        // the hem: a soft bright streak along the lower border, every third ray (wider)
        if (i % 3 === 0) {
          const ha = HB[i] * kh * (0.75 + 0.25 * cu.RA[i]) * (0.9 + 0.1 * sh);
          if (ha > 0.006) {
            const hm = Math.max(9 * S, HH[i] * 0.08) * (1 + 0.3 * bu);
            const hw = Math.max(w * 1.8, 12 * S, 2.6 * Math.abs(HX[Math.min(n - 1, i + 3)] - HX[i]));
            c.globalAlpha = U.clamp(ha);
            c.drawImage(hs, x - hw / 2, HY[i] - hm * HEM_CORE, hw, hm);
          }
        }
        // a breakup: the lower border flushes pink-red under the green hem
        if (bu > 0.02 && (i & 1) === 0) {
          const fh = Math.max(8 * S, HH[i] * 0.06), fw = w * 1.6;
          c.globalAlpha = U.clamp(HB[i] * bu * (0.6 + 0.4 * cu.RA[i]));
          c.drawImage(F, x - fw / 2, HY[i] + 1.5 * S - fh * 0.45, fw, fh);
        }
      }
    }
    c.setTransform(Q, 0, 0, Q, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }

  // ------------------------------------------------------------------ weather (eased state)
  // The lake shows what is actually happening outside. Each condition has a weight that eases toward
  // the live one (time constant ~1.4 s: a change settles over a few seconds, never snaps). Everything
  // the scene needs is derived from the weights once per frame. null weather = clear.
  const WX_IDX = { clear: 0, cloudy: 1, fog: 2, rain: 3, storm: 4, snow: 5 };
  const wxW = new Float32Array(6);
  const wxs = { init: false, I: 0, wind: 0, cloud: 0, full: 0, stars: 1, aur: 1, fog: 0, rain: 0, rings: 0, rough: 0,
    mirror: 1, snow: 0, dust: 0, still: 0, storm: 0, slant: 0.05, drift: 0 };
  function updateWeather(s, dt) {
    const ci = s && WX_IDX[s.condition] != null ? WX_IDX[s.condition] : 0;
    const ti = s && s.intensity != null ? U.clamp(+s.intensity || 0) : 0;
    const tw = s && s.windKph != null ? Math.max(0, +s.windKph || 0) : 0;
    const k = wxs.init ? 1 - Math.exp(-Math.min(dt, 0.1) / 1.4) : 1;
    wxs.init = true;
    for (let i = 0; i < 6; i++) wxW[i] += ((i === ci ? 1 : 0) - wxW[i]) * k;
    wxs.I += (ti - wxs.I) * k; wxs.wind += (tw - wxs.wind) * k;
    const I = wxs.I, cl = wxW[1], fg = wxW[2], rn = wxW[3], st = wxW[4], sn = wxW[5];
    wxs.cloud = U.clamp(cl * I + fg * 0.45 + rn * (0.6 + 0.4 * I) + st + sn * (0.55 + 0.35 * I));
    wxs.full = U.clamp(cl * U.smoothstep(0.3, 0.85, I) + fg + rn + st + sn);   // drifting bands -> a closed deck
    wxs.stars = 1 - U.clamp(wxs.cloud * 1.1 + fg * 0.4);
    // aurora: clear sky, a few clouds, thin fog, or light snow (< 0.3). Overcast, rain and storms hide it.
    wxs.aur = wxW[0] + cl * (1 - U.smoothstep(0.2, 0.75, I)) + fg * 0.35 * (1 - I) + sn * 0.85 * (1 - U.smoothstep(0.12, 0.3, I));
    wxs.fog = fg * (0.55 + 0.45 * I);
    wxs.rain = rn * (0.12 + 0.88 * Math.pow(I, 1.3)) + st * (0.85 + 0.15 * I);
    wxs.rings = rn * (0.2 + 0.8 * I) + st * 0.7;
    wxs.rough = U.clamp(rn * (0.4 + 0.5 * I) + st);                  // the mirror breaks up
    wxs.mirror = (1 - U.clamp(rn * (0.45 + 0.25 * I) + st)) * (1 - 0.5 * wxs.fog);
    wxs.snow = sn * (0.25 + 0.75 * I);
    wxs.dust = sn * (0.5 + 0.5 * I);
    wxs.still = sn;
    wxs.storm = st;
    wxs.slant = U.clamp(0.02 + wxs.wind * 0.01, 0.02, 0.5);
    wxs.drift = (wxs.drift + Math.min(dt, 0.1) * (3 + wxs.wind * 0.45) * S) % 1e6;
  }

  // Lightning: rare, dim, deterministic in real time. Returns 0..1; ltX is where it is.
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  let ltX = 0.5;
  function lightning(t) {
    const P = 14, k = Math.floor(t / P), ph = t - k * P;
    if (hash(k + 0.5) > 0.5) return 0;
    const t0 = 1 + hash(k + 0.31) * (P - 3);
    if (ph < t0 || ph > t0 + 1) return 0;
    ltX = 0.12 + 0.76 * hash(k + 0.77);
    let v = 0;
    for (let j = 0; j < 3; j++) {
      const tj = t0 + j * (0.11 + 0.08 * hash(k + j * 1.9));
      if (ph >= tj) v += (j === 1 ? 0.5 : j === 2 ? 0.85 * hash(k + 4.4) : 1) * Math.exp(-(ph - tj) / 0.07);
    }
    return U.clamp(v);
  }

  // Cloud and mist textures: one small seamless (in x) noise field baked into a few canvases. Soft by
  // design, stretched across the sky as drifting bands. Size-independent, built once.
  const CT_W = 384, CT_H = 128;
  let occSp = null, occFu = null, tintSp = null, tintFu = null, mistTex = null, litTex = null, ltCv = null, ltCtx = null;
  function texCanvas(dens, col, amax) {
    const cv = document.createElement("canvas"); cv.width = CT_W; cv.height = CT_H;
    const x = cv.getContext("2d"), img = x.createImageData(CT_W, CT_H), p = img.data;
    for (let n = 0; n < CT_W * CT_H; n++) {
      const q = n * 4;
      p[q] = col.r; p[q + 1] = col.g; p[q + 2] = col.b; p[q + 3] = Math.round(255 * amax * dens[n]);
    }
    x.putImageData(img, 0, 0);
    return cv;
  }
  function buildClouds() {
    if (occSp) return;
    const N = CT_W * CT_H, sp = new Float32Array(N), fu = new Float32Array(N);
    for (let j = 0; j < CT_H; j++) {
      const v = j / (CT_H - 1);
      const env = U.smoothstep(0, 0.22, v) * U.smoothstep(1, 0.72, v);
      for (let i = 0; i < CT_W; i++) {
        const u = i / CT_W;
        const n = U.lerp(U.fbm2(u * 2.4 + 41, v * 5 + 7, 4), U.fbm2((u - 1) * 2.4 + 41, v * 5 + 7, 4), u);
        sp[j * CT_W + i] = U.smoothstep(0.05, 0.3, n) * env;
        fu[j * CT_W + i] = (0.4 + 0.6 * U.smoothstep(-0.28, 0.18, n)) * env;
      }
    }
    occSp = texCanvas(sp, { r: 0, g: 0, b: 0 }, 0.92); occFu = texCanvas(fu, { r: 0, g: 0, b: 0 }, 0.92);
    deckFu = fu;
    tintSp = texCanvas(sp, U.safe(C.cloud), 0.09); tintFu = texCanvas(fu, U.safe(C.cloud), 0.08);
    mistTex = texCanvas(fu, U.safe(C.mist), 0.07);
    litTex = texCanvas(fu, U.safe(C.bolt), 0.22);
    ltCv = document.createElement("canvas"); ltCv.width = CT_W; ltCv.height = CT_H; ltCtx = ltCv.getContext("2d");
  }
  function drawTex(ctx, tex, off, y, h, a) {
    if (a <= 0.004) return;
    const o = ((off % W) + W) % W;
    ctx.globalAlpha = U.clamp(a);
    ctx.drawImage(tex, -o, y, W, h);
    ctx.drawImage(tex, W - o, y, W, h);
    ctx.globalAlpha = 1;
  }
  // Clouds into the aurora layer: erase what they cover (aurora), then a faint slate tint.
  function drawClouds(c, a) {
    const cA = wxs.cloud * a, m = wxs.full, y = -0.02 * H, h = yH * 0.98;
    if (cA <= 0.004) return;
    c.globalCompositeOperation = "destination-out";
    drawTex(c, occSp, wxs.drift, y, h, cA * (1 - m)); drawTex(c, occFu, wxs.drift, y, h, cA * m);
    c.globalCompositeOperation = "source-over";
    drawTex(c, tintSp, wxs.drift, y, h, cA * (1 - m)); drawTex(c, tintFu, wxs.drift, y, h, cA * m);
  }

  // Precipitation (typed arrays, capped): fine rain, slow snow, rings on the lake.
  const RN = 380, RN_NEAR = Math.round(RN * 0.25);
  const rx = new Float32Array(RN), ry = new Float32Array(RN), rv = new Float32Array(RN), rl = new Float32Array(RN);
  const SN = 300, SN_NEAR = Math.round(SN * 0.3);
  const fx = new Float32Array(SN), fy = new Float32Array(SN), fv = new Float32Array(SN), fp = new Float32Array(SN), fs = new Float32Array(SN);
  const RG = 56;
  const gx = new Float32Array(RG), gy = new Float32Array(RG), ga = new Float32Array(RG), gl = new Float32Array(RG);
  let prng = U.rng(17), rgAcc = 0, rgI = 0;
  function seedPrecip() {
    prng = U.rng(17);
    for (let i = 0; i < RN; i++) { respawnDrop(i); ry[i] = prng() * H; }
    for (let i = 0; i < SN; i++) {
      const near = i < SN_NEAR;
      fx[i] = prng() * W; fy[i] = prng() * H; fp[i] = prng() * 100;
      fv[i] = (near ? 30 + prng() * 20 : 12 + prng() * 14) * S;
      fs[i] = (near ? 2.2 + prng() * 1.2 : 1.1 + prng() * 0.8) * S;
    }
    for (let i = 0; i < RG; i++) { ga[i] = 1; gl[i] = 0; }
  }
  function respawnDrop(i) {
    const near = i < RN_NEAR;
    rx[i] = -20 * S + prng() * (W + 40 * S + wxs.slant * H);
    ry[i] = -prng() * H * 0.2;
    rv[i] = (near ? 620 + prng() * 160 : 340 + prng() * 120) * S;
    rl[i] = (near ? 16 + prng() * 12 : 6 + prng() * 7) * S;
  }
  const CSSW = { rainFar: U.rgba(U.safe(U.scale(C.rain, 0.8)), 1), rainNear: U.rgba(U.safe(C.rain), 1),
    snowNear: U.rgba(U.safe(C.snow), 1), snowFar: U.rgba(U.safe(U.scale(C.snow, 0.7)), 1), ring: U.rgba(U.safe(C.ring), 1),
    snowDay: "rgb(150,156,170)" };   // daylight flakes: grey-white, low contrast against a grey sky
  function drawRain(ctx, dt, a, density) {
    if (a <= 0.004 || density <= 0.004) return;
    const n = Math.round(RN * U.clamp(density)), slant = wxs.slant;
    for (let pass = 0; pass < 2; pass++) {
      const i0 = pass ? 0 : RN_NEAR, i1 = pass ? Math.min(n, RN_NEAR) : n;
      if (i1 <= i0) continue;
      ctx.beginPath();
      for (let i = i0; i < i1; i++) {
        const v = rv[i] * dt;
        ry[i] += v; rx[i] -= v * slant;
        if (ry[i] > H + 10 * S || rx[i] < -40 * S) respawnDrop(i);
        ctx.moveTo(rx[i], ry[i]); ctx.lineTo(rx[i] + rl[i] * slant, ry[i] - rl[i]);
      }
      ctx.globalAlpha = a * (pass ? 0.34 : 0.26);
      ctx.strokeStyle = pass ? CSSW.rainNear : CSSW.rainFar;
      ctx.lineWidth = (pass ? 1.1 : 0.8) * S;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // (big: by day the flakes are larger and a little brighter, so a snowy day never reads as stars)
  function drawSnow(ctx, dt, t, a, density, big = 0) {
    if (a <= 0.004 || density <= 0.004) return;
    const n = Math.round(SN * U.clamp(density)), drift = wxs.wind * 1.1 * S;
    for (let pass = 0; pass < 2; pass++) {
      const i0 = pass ? 0 : SN_NEAR, i1 = pass ? Math.min(n, SN_NEAR) : n;
      if (i1 <= i0) continue;
      ctx.beginPath();
      for (let i = i0; i < i1; i++) {
        fy[i] += fv[i] * dt;
        fx[i] += (drift * (pass ? 1 : 0.7) + Math.sin(t * 0.6 + fp[i]) * 10 * S) * dt;
        if (fy[i] > H + 4 * S) { fy[i] = -4 * S; fx[i] = prng() * W; }
        if (fx[i] > W + 6 * S) fx[i] -= W + 12 * S; else if (fx[i] < -6 * S) fx[i] += W + 12 * S;
        if (big > 0.01) {
          const s = fs[i] * (1 + 1.3 * big) * 0.5; ctx.moveTo(fx[i] + s, fy[i]); ctx.ellipse(fx[i], fy[i], s, s * 2.2, 0, 0, TAU);   // a soft streak: falling
          if (!pass) { const x2 = (fx[i] + 0.37 * W) % W, y2 = (fy[i] + 0.53 * H) % H, s2 = s * 0.8; ctx.moveTo(x2 + s2, y2); ctx.ellipse(x2, y2, s2, s2 * 2.2, 0, 0, TAU); }   // twice the far flakes
        }
        else { const s = fs[i]; ctx.rect(fx[i] - s / 2, fy[i] - s / 2, s, s); }
      }
      ctx.globalAlpha = U.clamp(a * (pass ? 0.5 : 0.38) * (1 - 0.35 * big));
      ctx.fillStyle = big > 0.5 ? CSSW.snowDay : pass ? CSSW.snowNear : CSSW.snowFar;
      ctx.fill();
      // by day the near flakes are big soft blurs drifting past the eye (a still frame reads as snowfall)
      if (pass && big > 0.01) {
        for (let i = i0; i < i1; i += 2) glow(ctx, C.snow, fx[i], fy[i], fs[i] * 3.6, fs[i] * 3.6, a * 0.3 * big, true);
      }
    }
    ctx.globalAlpha = 1;
  }
  // Rings where the drops land: spawned at a rate, growing flat ellipses (perspective), fading.
  function drawRings(ctx, dt, a, rate) {
    rgAcc += dt * rate * 40;
    while (rgAcc >= 1) {
      rgAcc -= 1; rgI = (rgI + 1) % RG;
      const v = Math.pow(prng(), 0.8);
      gx[rgI] = prng() * W; gy[rgI] = w1 + 0.012 * H + v * (H - w1 - 0.02 * H); ga[rgI] = 0; gl[rgI] = 0.7 + 0.6 * prng();
    }
    if (a <= 0.004) return;
    ctx.strokeStyle = CSSW.ring; ctx.lineWidth = 1 * S;
    for (let i = 0; i < RG; i++) {
      if (ga[i] >= gl[i]) continue;
      ga[i] += dt;
      const p = ga[i] / gl[i], depth = (gy[i] - yH) / (H - yH);
      const r = (2 + 16 * p) * S * (0.35 + 1.5 * depth);
      ctx.globalAlpha = U.clamp(a * (1 - p) * (1 - p) * 0.5);
      ctx.beginPath(); ctx.ellipse(gx[i], gy[i], r, r * (0.14 + 0.1 * depth), 0, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ land drawing
  // scale k about the waterline (the ridge rises out of the hairline), dy shifts (foreground rises)
  // dy = rise offset. By day (D = { f, r, g }: day fill, sunlit-crest and golden-crest alphas) the sunlit land
  // goes between the night fill (black: it occludes) and the rim / snow dusting. D omitted = night only.
  function drawLayer(ctx, L, base, k, dy, fa, ra, da, D) {
    if (k <= 0.002) return;
    const top = base - (base - L.top) * k, h = L.h * k;
    if (fa > 0.004) { ctx.globalAlpha = U.clamp(fa); ctx.drawImage(L.fill.cv, 0, top + dy, W, h); }
    if (D && L.dfill) {
      if (D.f > 0.004) { ctx.globalAlpha = U.clamp(D.f); ctx.drawImage(L.dfill.cv, 0, top + dy, W, h); }
      if (D.r > 0.004) { ctx.globalAlpha = U.clamp(D.r); ctx.drawImage(L.drim.cv, 0, top + dy, W, h); }
      if (D.g > 0.004) { ctx.globalAlpha = U.clamp(D.g); ctx.drawImage(L.dgold.cv, 0, top + dy, W, h); }
    }
    if (ra > 0.004) { ctx.globalAlpha = U.clamp(ra); ctx.drawImage(L.rim.cv, 0, top + dy, W, h); }
    if (da > 0.004) { ctx.globalAlpha = U.clamp(da); ctx.drawImage(L.dust.cv, 0, top + dy, W, h); }
    ctx.globalAlpha = 1;
  }
  // The rim of a layer tinted and modulated by the aurora above each column (glowRow), crisp at device res.
  function drawLitRim(ctx, L, base, k, a) {
    if (a <= 0.004 || k <= 0.002) return;
    const x = rimLit.c, cw = rimLit.cv.width, ch = rimLit.cv.height;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, cw, ch);
    x.drawImage(L.rim.cv, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.drawImage(glowRow.cv, 0, 0, cw, ch);
    x.globalCompositeOperation = "source-over";
    const top = base - (base - L.top) * k;
    ctx.globalAlpha = U.clamp(a);
    ctx.drawImage(rimLit.cv, 0, top, W, L.h * k);
    ctx.globalAlpha = 1;
  }

  // mirrored about its own waterline: y -> base + (base - y) * SQ
  function drawLayerRefl(ctx, L, base, k, fa, ra, da, D) {
    ctx.setTransform(dpr, 0, 0, -dpr * SQ, 0, dpr * base * (1 + SQ));
    drawLayer(ctx, L, base, k, 0, fa, ra, da, D);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // The lake: the sky, upside down, in thin strips that drift a pixel or two (the shimmer). Rain and
  // wind break it up (rough), snow stills it. Called once for the sky wash, once for the aurora layer.
  function drawMirror(ctx, cv, a, tt) {
    if (a <= 0.004) return;
    const n = 40, lakeH = H - yH, amp = (1 + 7 * wxs.rough) * (1 - 0.6 * wxs.still), sp = 0.22 + 0.9 * wxs.rough;
    for (let k = 0; k < n; k++) {
      const y0 = yH + lakeH * k / n, y1 = yH + lakeH * (k + 1) / n;
      const s1 = yH - (y0 - yH) / SQ, s0 = Math.max(0, yH - (y1 - yH) / SQ);
      if (s1 <= 0) break;
      const kk = k / n;
      const off = U.noise2(k * 0.73, tt * sp) * (1 + 5 * kk) * S * amp;
      ctx.globalAlpha = a * (0.5 - 0.32 * kk);
      ctx.setTransform(dpr, 0, 0, -dpr, off * dpr, dpr * (y0 + y1));
      ctx.drawImage(cv, 0, s0 * Q, cv.width, (s1 - s0) * Q, 0, y0, W, y1 - y0);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  }

  // A sprite (the ambient clock) reflected in the lake, broken into drifting strips.
  function drawSpriteRefl(ctx, s, cx, cy, k, a, tt) {
    if (a <= 0.004) return;
    const w = s.w * k, h = s.h * k, top = cy - h / 2, n = 10, ph = s.cv.height / n;
    for (let i = 0; i < n; i++) {
      const sy0 = top + h * i / n, sy1 = top + h * (i + 1) / n;
      const ly0 = yH + (yH - sy1) * SQ, ly1 = yH + (yH - sy0) * SQ;
      const off = U.noise2(i * 0.9 + 3.3, tt * 0.3) * 3.5 * S;
      ctx.globalAlpha = a * (1 - 0.06 * i);
      ctx.setTransform(dpr, 0, 0, -dpr, (cx - w / 2 + off) * dpr, (ly0 + ly1) * dpr);
      ctx.drawImage(s.cv, 0, i * ph, s.cv.width, ph, 0, ly0, w, ly1 - ly0);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  }

  // A rare meteor: one every few minutes, faint, quick.
  function drawMeteor(ctx, t, a) {
    if (a <= 0.02) return;
    const P = 97, k = Math.floor(t / P), ph = t - k * P, dur = 1.1;
    if (ph > dur) return;
    const r = U.rng(9001 + k);
    if (r() < 0.4) return;
    const x0 = (0.15 + 0.7 * r()) * W, y0 = (0.03 + 0.2 * r()) * H;
    const ang = Math.PI * (0.6 + 0.22 * r()), len = (0.06 + 0.06 * r()) * W;
    const p = ph / dur, head = U.easeOut(p);
    const hx = x0 + Math.cos(ang) * len * head, hy = y0 + Math.sin(ang) * len * head;
    const tl = len * 0.35 * (1 - 0.5 * p);
    const tx = hx - Math.cos(ang) * tl, ty = hy - Math.sin(ang) * tl;
    const sc = U.safe(C.star);
    const g = ctx.createLinearGradient(tx, ty, hx, hy);
    g.addColorStop(0, U.rgba(sc, 0)); g.addColorStop(1, U.rgba(sc, 0.55));
    ctx.globalAlpha = a * Math.sin(Math.PI * p);
    ctx.strokeStyle = g; ctx.lineWidth = 1.3 * S; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ daytime: the lake in the sun
  // dk = how much of the day scene shows (a pure function of frame.day). The day sky (gradient, the sun in
  // its real place, the golden-hour glow) is baked at half resolution per quantised elevation / sun arc /
  // weather and cross-faded over ~2 s on a key change; cumulus sprites are baked with it and drift live.
  const dayK = (day) => U.smoothstep(0.05, 0.75, day);
  // the elevation the day scene is lit for: the real one, unless frame.day says it is lighter (pinned day)
  const dayElev = (elev, day) => Math.max(elev, -6 + 14 * (0.5 - Math.sin(Math.asin(1 - 2 * U.clamp(day)) / 3)));
  const SKY_MEAN = 72;   // the baked sky's mean luminance cap (it is 62% of the wall; the lake mirrors it darker)

  function dayGrade(elev, u) {
    const qe = Math.round(elev * 2) / 2, qu = Math.round(U.clamp(u, -0.1, 1.1) * 50) / 50;
    const qd = Math.round(U.clamp(wxs.full) * 4) / 4, qc = Math.round(U.clamp(wxs.cloud) * 4) / 4;
    const qg = Math.round(U.clamp(wxs.rain * 0.7 + wxs.storm * 0.5) * 4) / 4;
    const qs = Math.round(U.clamp(wxs.snow * 1.6) * 2) / 2, qf = Math.round(U.clamp(wxs.fog) * 4) / 4;
    const e = qe;
    const hi = U.smoothstep(3, 35, e);                                   // morning -> noon
    const gold = U.smoothstep(-5, 1, e) * (1 - U.smoothstep(4, 15, e));  // golden hour
    const blue = 1 - U.smoothstep(-5, 1, e);                             // blue hour
    const up = U.smoothstep(-6, 12, e);
    const ov = U.smoothstep(0.15, 0.9, qd);                              // the deck closes
    // clear: deep Shield blue overhead, paler and hazier toward the far shore
    let zen = U.mix(hex("#122c82"), hex("#0c2e96"), hi), hor = U.mix(hex("#3c5488"), hex("#2c56aa"), hi);
    zen = U.mix(zen, hex("#2c2e5c"), gold * 0.55); hor = U.mix(hor, hex("#b06c3a"), gold * 0.85);
    zen = U.mix(zen, hex("#0a1232"), blue * 0.85); hor = U.mix(hor, hex("#4c3052"), blue * 0.7);
    // bright overcast -> grey rain -> a dark storm; snow pale; fog milky
    const oz = U.mix(hex("#4c5260"), hex("#1e222a"), qg), oh = U.mix(hex("#646a72"), hex("#2e3238"), qg);
    zen = U.mix(zen, U.scale(oz, 0.55 + 0.45 * up), ov); hor = U.mix(hor, U.scale(oh, 0.55 + 0.45 * up), ov);
    if (qs > 0) { zen = U.mix(zen, hex("#6c727e"), qs * 0.85); hor = U.mix(hor, hex("#868c98"), qs * 0.85); }
    if (qf > 0) { zen = U.mix(zen, hex("#5a6064"), qf * 0.75); hor = U.mix(hor, hex("#6c7274"), qf * 0.85); }
    const sk = 0.45 + 0.55 * up + 0.12 * gold;
    zen = U.safe(U.scale(zen, sk)); hor = U.safe(U.scale(hor, sk));
    const warm = 1 - U.smoothstep(4, 22, e);
    const sunVis = (1 - ov) * (1 - 0.85 * qf) * (1 - qg) * U.smoothstep(-1.5, 0.5, e);
    const bri = (0.3 + 0.7 * U.smoothstep(-4, 22, e)) * (1 - 0.15 * ov) * (1 - 0.35 * qg) * (1 - 0.3 * qf);
    return { key: `${qe}|${qu}|${qd}|${qc}|${qg}|${qs}|${qf}`, e, u: qu, hi, gold, blue, up, ov, qg, qs, qf, zen, hor, warm, sunVis, bri,
      sun: U.mix(DAYC.sunNoon, DAYC.sunLow, warm), clear: (1 - ov) * (1 - qg) };
  }
  // where the sun is: along its arc (sunrise left, sunset right), as high as it really is
  const sunX = (G) => U.lerp(0.1, 0.9, U.clamp(G.u)) * W;
  const sunY = (G) => yH - U.clamp(G.e, -3, 70) / 50 * yH * 0.95;

  const DS = { a: null, b: null, s: null, key: "", mix: 1, cu: [], mSky: 0 };
  function paintDaySky(L, G) {
    const c = L.c;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, L.cv.width, L.cv.height);
    c.setTransform(Q, 0, 0, Q, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, yH);
    g.addColorStop(0, U.rgba(G.zen, 1)); g.addColorStop(0.6, U.rgba(U.mix(G.zen, G.hor, 0.55), 1)); g.addColorStop(1, U.rgba(G.hor, 1));
    c.fillStyle = g; c.fillRect(0, 0, W, yH);
    // a pale haze lying along the far shore
    const hz = c.createLinearGradient(0, yH * 0.78, 0, yH);
    hz.addColorStop(0, U.rgba(G.hor, 0)); hz.addColorStop(1, U.rgba(U.scale(G.hor, 1.15), 0.5 * (1 - G.ov)));
    c.fillStyle = hz; c.fillRect(0, yH * 0.78, W, yH * 0.22);
    const sx = sunX(G), sy = sunY(G);
    // golden hour: the sky burns along the horizon around the sun
    if (G.gold > 0.01) {
      glow(c, U.mix(DAYC.gold, C.rose, 0.25), sx, yH, 0.75 * W, 0.34 * H, 0.32 * G.gold * (0.35 + 0.65 * G.clear), true);
      glow(c, DAYC.sunLow, sx, yH - 0.01 * H, 0.32 * W, 0.12 * H, 0.42 * G.gold * (0.3 + 0.7 * G.clear), true);
    }
    // the sun: a wide soft glow, a bloom and a small disc (behind cloud only a brighter patch)
    const vis = G.sunVis;
    glow(c, U.mix(G.hor, G.sun, 0.6), sx, sy, 0.5 * W, 0.42 * H, 0.3 * (0.3 + 0.7 * vis) * G.up, true);
    // (the disc and its bloom are drawn live: small and brilliant, outside the exposure control)
    // capped: the sky never takes more than its share of the brightness budget (its mean, from the gradient)
    const m = skyMean(G);
    DS.mSky = Math.min(m, SKY_MEAN);
    if (m > SKY_MEAN) { c.fillStyle = `rgba(0,0,0,${(1 - SKY_MEAN / m).toFixed(4)})`; c.fillRect(0, 0, W, yH); }
  }
  // the baked sky's mean luminance, from its gradient (no readback): zenith -> 60% mix -> horizon, plus the
  // haze band along the far shore
  function skyMean(G) {
    const L = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const lz = L(G.zen), lm = L(U.mix(G.zen, G.hor, 0.55)), lh = L(G.hor);
    return 0.6 * (lz + lm) / 2 + 0.4 * (lm + lh) / 2 + 0.22 * 0.25 * (1 - G.ov) * lh * 1.15;
  }

  // fair-weather cumulus: seeded shapes (flat bases, heaped tops), lit from the sun's side, gold-edged at
  // golden hour. Re-baked with the sky; they drift live.
  const CU = [];
  (function () {
    const r = U.rng(4242);
    for (let i = 0; i < 8; i++) {
      CU.push({ x0: (i + 0.3 * r()) / 8, y: 0.16 + 0.5 * r(), w: 0.15 + 0.15 * r(), h: 0.085 + 0.05 * r(), sp: 2.5 + 4 * r(), th: [0.05, 0.62, 0.2, 0.78, 0.34, 0.9, 0.5, 0.97][i], seed: 900 + i * 17 });
    }
    CU.sort((a, b) => a.y - b.y);            // high (far, small, slow) first
    for (const c of CU) { const k = 0.6 + 0.4 * (c.y / 0.62); c.w *= k; c.h *= k; c.sp *= k; }
  })();
  function cuSprite(cl, G) {
    const w = cl.w * W, h = cl.h * H, sc = 0.5;
    const cv = document.createElement("canvas"); cv.width = Math.ceil(w * sc); cv.height = Math.ceil(h * sc);
    const x = cv.getContext("2d"); x.setTransform(sc, 0, 0, sc, 0, 0);
    const r = U.rng(cl.seed), puffs = [];
    // a cumulus: a broad base of small puffs, heaped into one or two towers of big ones
    const c1 = 0.35 + 0.3 * r(), c2 = r() < 0.6 ? 0.2 + 0.6 * r() : c1;
    const n = 20 + ((r() * 10) | 0);
    for (let k = 0; k < n; k++) {
      const u = 0.08 + 0.84 * r();
      const env = Math.max(Math.exp(-Math.pow((u - c1) / 0.2, 2)), 0.75 * Math.exp(-Math.pow((u - c2) / 0.16, 2)));
      const pr = h * (0.11 + 0.1 * r()) * (0.6 + 0.8 * env);
      puffs.push([u * w, h * 0.86 - pr * 0.75 - h * 0.32 * env * (0.5 + 0.5 * r()), pr]);
    }
    const shape = (dx, dy, k) => { x.beginPath(); for (const [px, py, pr] of puffs) { x.moveTo(px + dx + pr * k, py + dy); x.arc(px + dx, py + dy, pr * k, 0, TAU); } };
    const lift = G.clear * 0.6 + 0.4;
    const shade = U.scale(U.mix(DAYC.cuShade, G.hor, 0.35), (0.45 + 0.55 * G.up) * (1 - 0.4 * G.qg));
    let lit = U.scale(U.mix(DAYC.cuLit, DAYC.cuGold, G.gold * 0.8), (0.4 + 0.6 * G.up) * lift * (1 - 0.45 * G.qg));
    // (capped below the near-white line, but not through U.safe: its chroma pull would tint a white cloud cyan)
    const cap = (c, m) => U.scale(c, Math.min(1, m / Math.max(c.r, c.g, c.b, 1)));
    lit = cap(lit, 186);
    x.save(); x.beginPath(); x.rect(0, 0, w, h * 0.86); x.clip();   // flat bases
    shape(0, 0, 1); x.fillStyle = U.rgba(shade, 0.95); x.fill();
    x.globalCompositeOperation = "source-atop";
    const side = (G.u < 0.5 ? -1 : 1) * 0.25;
    shape(side * h * 0.25, -h * 0.1, 0.85); x.fillStyle = U.rgba(lit, 0.9); x.fill();
    shape(side * h * 0.35, -h * 0.16, 0.6); x.fillStyle = U.rgba(cap(U.scale(lit, 1.08), 194), 0.7); x.fill();
    const bg = x.createLinearGradient(0, h * 0.5, 0, h * 0.86);
    bg.addColorStop(0, "rgba(0,0,0,0)"); bg.addColorStop(1, U.rgba(U.scale(shade, 0.7), 0.6));
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.restore();
    // soften the edges once
    const out = document.createElement("canvas"); out.width = cv.width; out.height = cv.height;
    const o = out.getContext("2d"); o.filter = "blur(1.2px)"; o.drawImage(cv, 0, 0); o.filter = "none";
    return out;
  }
  // how many cumulus are up: a few on a clear day, more as it clouds over (then the deck takes them)
  const cuAmount = () => 0.42 + 0.58 * U.clamp(wxs.cloud * 1.3);
  function drawCumulus(ctx, G, t, a, refl, mirK) {
    if (a <= 0.004) return;
    const amt = cuAmount(), span = W * 1.36;
    for (let i = 0; i < CU.length; i++) {
      const cl = CU[i], spr = DS.cu[i];
      if (!spr) continue;
      const v = U.smoothstep(cl.th - 0.1, cl.th + 0.1, amt) * Math.pow(1 - G.ov, 1.5) * (1 - 0.9 * G.qf);
      if (v <= 0.01) continue;
      const w = cl.w * W, h = cl.h * H;
      const x = ((cl.x0 * span + t * cl.sp * S) % span) - 0.18 * W, y = cl.y * yH - h * 0.86;
      if (!refl) { ctx.globalAlpha = U.clamp(a * v); ctx.drawImage(spr, x, y, w, h); }
      else {
        ctx.setTransform(dpr, 0, 0, -dpr * SQ, 0, dpr * yH * (1 + SQ));
        ctx.globalAlpha = U.clamp(a * v * 0.3 * mirK); ctx.drawImage(spr, x, y, w, h);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
    ctx.globalAlpha = 1;
  }

  // the day sky and the lake, at intensity a (0.18 behind the work face; 1 in ambient)
  function dayLake(ctx, G, a, a0, dt, t, tt, mirK) {
    if (G.key !== DS.key) {
      if (!DS.a) { DS.a = mkHalf(W, yH); DS.b = mkHalf(W, yH); DS.s = mkHalf(W, yH); DS.mix = 1; }
      else { const tmp = DS.b; DS.b = DS.a; DS.a = tmp; DS.mix = 0; }
      paintDaySky(DS.a, G); DS.key = G.key;
      DS.cu = CU.map((cl) => cuSprite(cl, G));
    }
    DS.mix = Math.min(1, DS.mix + dt / 2.2);
    let sky = DS.a;
    if (DS.mix < 1) {
      const c = DS.s.c;
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1; c.drawImage(DS.b.cv, 0, 0);
      c.globalAlpha = U.smoothstep(0, 1, DS.mix); c.drawImage(DS.a.cv, 0, 0); c.globalAlpha = 1;
      sky = DS.s;
    }
    if (a <= 0.003) return;
    ctx.globalAlpha = U.clamp(a); ctx.drawImage(sky.cv, 0, 0, W, yH); ctx.globalAlpha = 1;
    // the sun and the cumulus keep their own brilliance (the exposure loop dims the sky and lake around them)
    const aRaw = a0;
    drawSun(ctx, G, aRaw);
    drawCumulus(ctx, G, t, aRaw, false, mirK);
    // overcast: the deck drifts over (it is what the sky is made of on a grey day)
    if (G.ov > 0.01) {
      const dc = U.scale(DAYC.deck, (0.45 + 0.55 * G.up) * (1 - 0.5 * G.qg));
      if (!deckTex || deckCol !== ck(dc)) { deckCol = ck(dc); deckTex = texCanvas(deckFu, U.safe(dc), 0.55); }
      drawTex(ctx, deckTex, wxs.drift, -0.02 * H, yH * 0.98, a * G.ov);
    }
    // the lake: dark Shield water, the sky mirrored in it (broken by wind and rain), the clouds' reflections
    const wg = ctx.createLinearGradient(0, yH, 0, H);
    const wc = U.mix(DAYC.water, U.mix(hex("#262c34"), hex("#40464e"), G.qs), Math.max(G.ov, G.qf) * 0.85);   // grey water under a grey sky
    const wt = U.mix(U.scale(G.hor, 0.3), wc, 0.6), wd = U.scale(U.mix(DAYC.waterDeep, hex("#0c0e12"), G.ov * 0.8), 0.5 + 0.3 * G.up);
    wg.addColorStop(0, U.rgba(wt, 1)); wg.addColorStop(0.35, U.rgba(U.mix(wt, wd, 0.6), 1)); wg.addColorStop(1, U.rgba(wd, 1));
    ctx.globalAlpha = U.clamp(a); ctx.fillStyle = wg; ctx.fillRect(0, yH, W, H - yH); ctx.globalAlpha = 1;
    drawMirror(ctx, sky.cv, a * (0.24 + 0.18 * mirK), tt);
    drawCumulus(ctx, G, t, aRaw * 0.8, true, mirK);
    if (G.ov > 0.01 && deckTex) {
      ctx.setTransform(dpr, 0, 0, -dpr * SQ, 0, dpr * yH * (1 + SQ));
      drawTex(ctx, deckTex, wxs.drift, -0.02 * H, yH * 0.98, a * G.ov * 0.35 * mirK);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  let deckTex = null, deckCol = "", deckFu = null;

  // the sun on the water: a glitter path under it (gold when it is low), shimmering in real time
  const GL_N = 70;
  const GLV = new Float32Array(GL_N), GLX = new Float32Array(GL_N), GLP = new Float32Array(GL_N), GLF = new Float32Array(GL_N);
  (function () {
    const r = U.rng(5150);
    for (let i = 0; i < GL_N; i++) { GLV[i] = Math.pow(r(), 1.4); GLX[i] = r() * 2 - 1; GLP[i] = r() * 100; GLF[i] = 2 + 5 * r(); }
  })();
  function drawGlitter(ctx, G, t, a, mirK) {
    const vis = G.sunVis * a * (0.4 + 0.6 * mirK);
    if (vis <= 0.01 || G.e < -1) return;
    const sx = sunX(G), low = 1 - U.smoothstep(4, 40, G.e);
    const sc = U.safe(G.sun);
    // the broad reflection, then the sparks
    glow(ctx, G.sun, sx, yH + 0.02 * H, 0.05 * W * (1 + low), 0.06 * H, vis * 0.18 * (0.5 + 0.5 * low), true);
    ctx.fillStyle = U.rgba(sc, 1);
    for (let i = 0; i < GL_N; i++) {
      const v = GLV[i], y = yH + 0.004 * H + v * (H - yH) * (0.35 + 0.6 * low);
      const spread = (0.012 + 0.07 * v) * W * (0.7 + 0.6 * low);
      const x = sx + GLX[i] * spread + U.noise1(t * 0.3 + GLP[i]) * 4 * S;
      let fl = 0.5 + 0.5 * Math.sin(t * GLF[i] + GLP[i]);
      fl = fl * fl * fl * fl;
      const al = vis * fl * (1 - 0.6 * v) * (1 - 0.6 * Math.abs(GLX[i])) * (0.5 + 0.5 * low);
      if (al < 0.01) continue;
      ctx.globalAlpha = U.clamp(al);
      ctx.fillRect(x - (1.5 + 5 * v) * S, y, (3 + 10 * v) * S, (0.8 + 0.8 * v) * S);
    }
    ctx.globalAlpha = 1;
  }

  // fog by day: milky. which 0 = the far shore drowning in a bank lying on the horizon; 1 = over the lake
  let mistDayTex = null;
  function dayFog(ctx, G, a, fog, which) {
    const fa = a * fog;
    if (fa <= 0.004) return;
    const mc = U.scale(DAYC.mist, 0.5 + 0.5 * G.up);
    if (!mistDayTex && deckFu) mistDayTex = texCanvas(deckFu, U.safe(DAYC.mist), 0.5);
    if (which === 0) {
      const g = ctx.createLinearGradient(0, yH - 0.36 * H, 0, yH + 0.05 * H);
      g.addColorStop(0, U.rgba(mc, 0)); g.addColorStop(0.55, U.rgba(mc, 0.55 * fa)); g.addColorStop(0.82, U.rgba(mc, 0.85 * fa)); g.addColorStop(1, U.rgba(mc, 0));
      ctx.fillStyle = g; ctx.fillRect(0, yH - 0.36 * H, W, 0.41 * H);
      if (mistDayTex) drawTex(ctx, mistDayTex, wxs.drift * 0.5, yH - 0.08 * H, 0.14 * H, fa * (0.5 + 0.5 * G.up));
    } else {
      const g = ctx.createLinearGradient(0, w1, 0, H);
      g.addColorStop(0, U.rgba(mc, 0.5 * fa)); g.addColorStop(0.5, U.rgba(mc, 0.28 * fa)); g.addColorStop(1, U.rgba(mc, 0.12 * fa));
      ctx.fillStyle = g; ctx.fillRect(0, w1, W, H - w1);
      if (mistDayTex) {
        drawTex(ctx, mistDayTex, -wxs.drift * 0.7 + 400 * S, w1 - 0.04 * H, 0.18 * H, fa * (0.5 + 0.5 * G.up));
        drawTex(ctx, mistDayTex, wxs.drift * 0.9, H - 0.24 * H, 0.2 * H, fa * 0.6);
      }
    }
  }

  // closed-loop exposure for the day scene (see render): EXPO.k scales the day layers' intensity
  const EXPO = { k: 1, next: 0, key: "", want: null };
  let fprobe = null;
  function exposure(ctx, day, t, G, moving) {
    const key = G.key;
    if (key !== EXPO.key) { EXPO.key = key; EXPO.next = Math.min(EXPO.next, t + 0.25); }   // a new sky: look again soon
    if (t < EXPO.next) return;
    if (!fprobe) {
      fprobe = document.createElement("canvas"); fprobe.width = 160; fprobe.height = 90;
      fprobe.ctx = fprobe.getContext("2d", { willReadFrequently: true }); fprobe.ctx.imageSmoothingQuality = "high";
    }
    const x = fprobe.ctx;
    x.globalCompositeOperation = "copy"; x.drawImage(ctx.canvas, 0, 0, 160, 90); x.globalCompositeOperation = "source-over";
    const d = x.getImageData(0, 0, 160, 90).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const m = s / (d.length / 4), target = (25 + 20 * day - 5) * (1 - 0.22 * G.qg);   // a wet day reads darker
    let k = EXPO.k;
    if (m > target) k *= Math.max(0.55, (target / m) * 0.985);
    else if (k < 1 && m < target - 2.5) k = Math.min(1, k * Math.min(1.1, target / m));
    const settled = Math.abs(k - EXPO.k) < 0.006;
    EXPO.k = k;
    EXPO.next = t + (settled && !moving ? 3 : 0.1);   // while the exhale runs, keep watching
  }

  // the sun: a bloom and a small hot disc (never white: a warm cream, capped), in its real place
  function drawSun(ctx, G, a) {
    const vis = G.sunVis * a, sx = sunX(G), sy = sunY(G);
    if (vis <= 0.01 || sy < -0.08 * H) return;
    // high, the sun is glare: a wide bloom and a blown core with no edge to it (a disc reads as the moon);
    // low, it is a soft orange disc you can look at
    const lowK = 1 - U.smoothstep(3, 14, G.e);
    glow(ctx, G.sun, sx, sy, 0.3 * H, 0.3 * H, 0.22 * vis, true);
    glow(ctx, G.sun, sx, sy, 0.11 * H, 0.11 * H, 0.55 * vis, true);
    if (!sunCore || sunCoreKey !== ck(G.sun)) {
      sunCoreKey = ck(G.sun);
      sunCore = document.createElement("canvas"); sunCore.width = sunCore.height = 128;
      const x = sunCore.getContext("2d"), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      const hot = U.safe(U.mix(G.sun, hex("#f0e0a8"), 0.7), 222), c = U.safe(G.sun);
      g.addColorStop(0, U.rgba(hot, 1)); g.addColorStop(0.22, U.rgba(hot, 0.95)); g.addColorStop(0.5, U.rgba(c, 0.45)); g.addColorStop(1, U.rgba(c, 0));
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    }
    const r = U.lerp(0.06, 0.035, lowK) * H;
    ctx.globalAlpha = U.clamp(vis * (1 - 0.6 * lowK)); ctx.drawImage(sunCore, sx - r, sy - r, r * 2, r * 2);
    if (lowK > 0.01) {
      ctx.globalAlpha = U.clamp(vis * lowK);
      ctx.fillStyle = U.rgba(U.safe(G.sun), 1); ctx.beginPath(); ctx.arc(sx, sy, 0.014 * H, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  let sunCore = null, sunCoreKey = "";

  // a red canoe crossing the lake now and then (two paddlers, a reflection, a faint wake). Its place is a
  // function of the wall clock: a crossing takes 25 minutes, then it is gone for 15.
  function drawCanoe(ctx, G, now, t, a, mirK) {
    if (a <= 0.01) return;
    const P = 2400, ph = ((now.getTime() / 1000) % P) / 1500;
    if (ph > 1) return;
    const x = U.lerp(-0.05, 1.05, ph) * W, y = w1 + 0.11 * H, L = 0.045 * W, hh = 0.0055 * H;
    const k = (0.35 + 0.65 * G.bri);
    const hull = U.safe(U.scale(DAYC.canoe, k)), pc = U.scale(DAYC.paddler, k);
    const draw = (refl) => {
      // the wake: two faint lines opening out behind it
      if (!refl) {
        ctx.strokeStyle = U.rgba(U.safe(U.scale(G.hor, 0.9)), a * 0.22 * mirK); ctx.lineWidth = 1 * S;
        ctx.beginPath();
        ctx.moveTo(x - L * 0.45, y + hh * 0.5); ctx.lineTo(x - L * 1.9, y - hh * 0.4);
        ctx.moveTo(x - L * 0.45, y + hh * 0.7); ctx.lineTo(x - L * 1.9, y + hh * 2.2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(x - L / 2, y - hh * 0.9);
      ctx.quadraticCurveTo(x, y + hh * 1.5, x + L / 2, y - hh * 0.9);
      ctx.quadraticCurveTo(x, y + hh * 0.2, x - L / 2, y - hh * 0.9);
      ctx.fillStyle = U.rgba(hull, 1); ctx.fill();
      for (const [px, ph2] of [[-0.22, 0], [0.24, 1.3]]) {
        const bx = x + px * L, by = y - hh * 0.2;
        ctx.fillStyle = U.rgba(pc, 1);
        ctx.fillRect(bx - 0.0028 * W, by - 0.017 * H, 0.0056 * W, 0.017 * H);
        ctx.beginPath(); ctx.arc(bx, by - 0.021 * H, 0.0042 * H, 0, TAU); ctx.fill();
        const sw = Math.sin(t * 1.5 + ph2);                     // the stroke
        ctx.strokeStyle = U.rgba(pc, 1); ctx.lineWidth = 1.4 * S;
        ctx.beginPath(); ctx.moveTo(bx + sw * 0.004 * W, by - 0.012 * H); ctx.lineTo(bx - sw * 0.012 * W + 0.004 * W, by + 0.008 * H); ctx.stroke();
      }
    };
    ctx.globalAlpha = U.clamp(a);
    draw(false);
    ctx.globalAlpha = U.clamp(a * 0.32 * mirK);
    ctx.setTransform(dpr, 0, 0, -dpr * 0.8, 0, dpr * (y + hh * 0.9) * 1.8);
    draw(true);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ work: the horizon
  function drawHairline(ctx, k, a) {
    if (a <= 0.004) return;
    if (!hairGrad || hairCtx !== ctx) {
      hairCtx = ctx;
      const c = U.safe(C.ice);
      hairGrad = ctx.createLinearGradient(0.04 * W, 0, 0.96 * W, 0);
      hairGrad.addColorStop(0, U.rgba(c, 0)); hairGrad.addColorStop(0.07, U.rgba(c, 1));
      hairGrad.addColorStop(0.93, U.rgba(c, 1)); hairGrad.addColorStop(1, U.rgba(c, 0));
    }
    const i0 = Math.floor(0.04 * W), i1 = Math.min(NW - 1, Math.ceil(0.96 * W));
    ctx.beginPath();
    let pen = false;
    for (let j = 0; j < HLN; j++) {
      const x = HLX[j];
      if (x < i0 || x > i1) continue;
      const y = yH - HLH[j] * k;
      if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
    }
    ctx.strokeStyle = hairGrad; ctx.lineJoin = "miter"; ctx.miterLimit = 6; ctx.lineCap = "butt";
    ctx.globalAlpha = a * 0.72; ctx.lineWidth = 1.1 * S; ctx.stroke();
    // the water line beneath it
    ctx.globalAlpha = a * 0.3; ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.moveTo(i0, yH + 0.5); ctx.lineTo(i1, yH + 0.5); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const ARC_DASH = [0, 0], NODASH = [];
  function drawDaylight(ctx, f, a, sink) {
    const dl = f.signals.daylight, now = f.now;
    if (!dl || !dl.sunrise || !dl.sunset || a <= 0.004) return;
    const x0 = 0.1 * W, x1 = 0.9 * W, arcH = 0.14 * H;
    const u = (now - dl.sunrise) / (dl.sunset - dl.sunrise);
    const ic = U.safe(C.ice), fc = U.safe(C.frost);
    const P = (v) => [U.lerp(x0, x1, v), yH - arcH * Math.sin(Math.PI * v)];
    // the sun's path: dotted ahead, a fine solid line behind
    ARC_DASH[0] = 1.4 * S; ARC_DASH[1] = 7 * S;
    ctx.setLineDash(ARC_DASH);
    ctx.strokeStyle = U.rgba(ic, 1); ctx.lineWidth = 1.2 * S; ctx.lineCap = "round";
    ctx.globalAlpha = a * 0.4;
    ctx.beginPath();
    const ua = U.clamp(u);
    for (let k = 0; k <= 60; k++) { const v = ua + (1 - ua) * k / 60, p = P(v); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    ctx.stroke();
    ctx.setLineDash(NODASH);
    if (ua > 0) {
      ctx.globalAlpha = a * 0.5; ctx.lineWidth = 1 * S;
      ctx.beginPath();
      for (let k = 0; k <= 60; k++) { const p = P(ua * k / 60); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.stroke();
    }
    // end ticks at sunrise and sunset
    ctx.globalAlpha = a * 0.6; ctx.lineWidth = 1.2 * S;
    ctx.beginPath();
    ctx.moveTo(x0, yH - 0.008 * H); ctx.lineTo(x0, yH + 0.014 * H);
    ctx.moveTo(x1, yH - 0.008 * H); ctx.lineTo(x1, yH + 0.014 * H);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const lp = Math.max(13, 0.021 * H);
    text(ctx, U.fmtTime(dl.sunrise), x0, yH + 0.036 * H + sink, { px: lp, color: C.iceDim, glow: 3, core: 0.92 }, "center", 1, a * 0.95);
    text(ctx, U.fmtTime(dl.sunset), x1, yH + 0.036 * H + sink, { px: lp, color: C.iceDim, glow: 3, core: 0.92 }, "center", 1, a * 0.95);
    // the sun
    if (u >= 0 && u <= 1) {
      const [sx, sy] = P(u);
      glow(ctx, C.frost, sx, sy, 0.035 * H, 0.035 * H, a * 0.32);
      ctx.globalAlpha = a; ctx.fillStyle = U.rgba(fc, 0.22); ctx.strokeStyle = U.rgba(fc, 0.95); ctx.lineWidth = 1.4 * S;
      ctx.beginPath(); ctx.arc(sx, sy, 0.011 * H, 0, TAU); ctx.fill(); ctx.stroke();
      // a plumb line to the horizon
      ctx.globalAlpha = a * 0.28; ctx.lineWidth = 1 * S;
      ctx.beginPath(); ctx.moveTo(sx, sy + 0.017 * H); ctx.lineTo(sx, yH - R0[Math.min(NW - 1, Math.max(0, sx | 0))] * kHair - 3 * S); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // light left (or the wait for first light)
    let big = null, cap = null;
    if (dl.isDay && dl.lightLeftMin != null) { big = U.fmtMinutes(dl.lightLeftMin); cap = "OF LIGHT LEFT"; }
    else {
      let rise = dl.sunrise.getTime(); if (rise < now.getTime()) rise += 86400000;
      big = U.fmtMinutes((rise - now.getTime()) / 60000); cap = "UNTIL FIRST LIGHT";
    }
    text(ctx, big, 0.5 * W, yH + 0.068 * H + sink, { px: 0.042 * H, weight: 300, color: C.ice, glow: 6 * S, core: 0.92 }, "center", 1, a * 0.95);
    text(ctx, cap, 0.5 * W, yH + 0.11 * H + sink, { px: lp * 0.9, spacing: 0.3, color: C.iceDim, glow: 2, core: 0.9 }, "center", 1, a * 0.85);
  }

  function drawCalendar(ctx, f, a, b, sink) {
    const next = f.signals.calendar && f.signals.calendar.next;
    if (!next || a <= 0.004) return;
    const mins = next.minutesUntil, soon = U.smoothstep(20, 5, mins);
    const lx = 0.08 * W - b * 0.03 * W, y = 0.81 * H + sink;
    // the fuse: a hairline that burns down over the last hour
    const len = 0.13 * W * U.clamp(mins / 60, 0.04, 1);
    const sc = U.safe(soon > 0.5 ? C.frost : C.iceDim);
    ctx.globalAlpha = a * 0.65; ctx.strokeStyle = U.rgba(sc, 1); ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.moveTo(lx, y - 0.04 * H); ctx.lineTo(lx + len, y - 0.04 * H); ctx.stroke();
    ctx.globalAlpha = a * 0.9; ctx.fillStyle = U.rgba(sc, 1);
    ctx.beginPath(); ctx.arc(lx + len, y - 0.04 * H, 2.4 * S, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    text(ctx, String(next.title).toUpperCase(), lx, y, { px: 0.027 * H, spacing: 0.22, color: C.iceDim, glow: 3, core: 0.95 }, "left", 1, a * 0.95);
    text(ctx, mins < 1 ? "now" : `in ${U.fmtMinutes(mins)}`, lx, y + 0.054 * H,
      { px: 0.052 * H, weight: 300, color: soon > 0.5 ? C.frost : C.ice, glow: (soon > 0.5 ? 9 : 6) * S, core: 0.92 }, "left", 1, a);
  }

  function drawWeather(ctx, f, a, b, sink) {
    const wx = f.signals.weather;
    if (!wx || !wx.actionable || a <= 0.004) return;
    const next = f.signals.calendar && f.signals.calendar.next;
    const lx = 0.08 * W - b * 0.03 * W, y = (next ? 0.92 : 0.83) * H + sink;
    const s = wx.tempC != null ? `${wx.actionable}  ·  ${Math.round(wx.tempC)}°` : wx.actionable;
    const gw = 0.022 * H;
    const ic = U.safe(C.ice);
    ctx.globalAlpha = a * 0.75; ctx.strokeStyle = U.rgba(ic, 1); ctx.lineWidth = 1.3 * S; ctx.lineCap = "round";
    ctx.beginPath();
    if (wx.condition === "rain" || wx.condition === "storm") {
      for (let k = 0; k < 3; k++) { const gx = lx + k * gw * 0.38; ctx.moveTo(gx + gw * 0.18, y - gw * 0.42); ctx.lineTo(gx, y + gw * 0.42); }
    } else if (wx.condition === "snow") {
      for (let k = 0; k < 3; k++) { const q = k * Math.PI / 3; ctx.moveTo(lx + gw * 0.45 - Math.cos(q) * gw * 0.42, y - Math.sin(q) * gw * 0.42); ctx.lineTo(lx + gw * 0.45 + Math.cos(q) * gw * 0.42, y + Math.sin(q) * gw * 0.42); }
    } else {
      ctx.arc(lx + gw * 0.4, y, gw * 0.3, 0, TAU);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    text(ctx, s, lx + gw * 1.3, y, { px: 0.025 * H, color: C.ice, glow: 3, core: 0.92 }, "left", 1, a * 0.88);
  }

  function drawFinance(ctx, f, a, b, sink) {
    const fin = f.signals.finances;
    if (!fin || a <= 0.004 || fin.income == null || fin.spent == null) return;
    const mood = fin.mood || "calm", warn = mood === "warning", drift = mood === "drift";
    const pulse = warn ? 0.82 + 0.18 * Math.sin(f.t * 2.1) : 1;
    const mc = warn ? C.alarm : drift ? C.straw : C.pine;
    const rx = 0.92 * W + b * 0.03 * W, y = 0.81 * H + sink;
    const net = fin.net != null ? fin.net : fin.income - fin.spent;
    const lp = Math.max(13, 0.021 * H);
    const mon = f.now.toLocaleDateString("en-CA", { month: "long" }).toUpperCase();
    text(ctx, `${mon}  ·  NET`, rx, y, { px: 0.027 * H * 0.85, spacing: 0.22, color: C.iceDim, glow: 3, core: 0.95 }, "right", 1, a * 0.9);
    text(ctx, U.fmtMoney(net, { sign: true }), rx, y + 0.054 * H,
      { px: 0.052 * H, weight: 300, color: mc, glow: (warn ? 10 : 6) * S, core: 0.92 }, "right", 1, a * pulse);
    // a tide gauge: made (the full span) over spent (its share of it)
    const L = 0.13 * W, gx0 = rx - L, gy = y + 0.098 * H;
    const ratio = fin.income > 0 ? fin.spent / fin.income : 1;
    const tc = U.safe(C.iceDim), mcs = U.safe(mc);
    ctx.lineCap = "round";
    ctx.globalAlpha = a * 0.75; ctx.strokeStyle = U.rgba(tc, 1); ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.moveTo(gx0, gy); ctx.lineTo(rx, gy); ctx.stroke();
    const sl = L * Math.min(1, ratio);
    ctx.globalAlpha = a * 0.9 * pulse; ctx.strokeStyle = U.rgba(mcs, 1); ctx.lineWidth = 2 * S;
    ctx.beginPath(); ctx.moveTo(gx0, gy + 0.011 * H); ctx.lineTo(gx0 + sl, gy + 0.011 * H); ctx.stroke();
    if (ratio > 1) {
      const ac = U.safe(C.alarm), ex = Math.min(0.04 * W, L * (ratio - 1));
      ctx.globalAlpha = a * 0.95 * pulse; ctx.strokeStyle = U.rgba(ac, 1); ctx.lineWidth = 2.4 * S;
      ctx.beginPath(); ctx.moveTo(rx, gy + 0.011 * H); ctx.lineTo(rx + ex, gy + 0.011 * H); ctx.stroke();
      glow(ctx, C.alarm, rx + ex, gy + 0.011 * H, 0.024 * H, 0.024 * H, a * 0.4 * pulse);
    }
    ctx.globalAlpha = 1;
    let sub = `${U.fmtMoney(fin.income)} in  ·  ${U.fmtMoney(fin.spent)} out`;
    if (fin.lastUpdated) {
      const hrs = (f.now - fin.lastUpdated) / 3600000;
      sub += `  ·  ${hrs >= 1 && hrs < 48 ? Math.round(hrs) + " h ago" : U.fmtAgo(fin.lastUpdated, f.now)}`;
    }
    text(ctx, sub, rx, gy + 0.04 * H, { px: lp, color: C.iceDim, glow: 2, core: 0.92 }, "right", 1, a * 0.9);
  }

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
  // critical: a red survey mark (the host-down diamond) that breathes slowly, one ring per breath
  function flareMark(ctx, x, y, r, a, t, p) {
    const c = U.safe(C.alarm);
    glow(ctx, C.alarm, x, y, r * 5, r * 5, a * (0.2 + 0.18 * p));
    const ph = ((t / 3.2) + 0.25) % 1;
    ctx.globalAlpha = a * 0.5 * (1 - ph) * (1 - ph); ctx.strokeStyle = U.rgba(c, 1); ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.arc(x, y, r * (1.3 + 2.6 * ph), 0, TAU); ctx.stroke();
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    ctx.fillStyle = U.rgba(c, 0.3 + 0.3 * p); ctx.fill();
    ctx.strokeStyle = U.rgba(c, 0.95); ctx.lineWidth = 1.3 * S; ctx.lineJoin = "miter"; ctx.stroke();
    ctx.fillStyle = U.rgba(U.safe(C.flare), 0.7 + 0.3 * p);
    ctx.beginPath(); ctx.arc(x, y, 2.1 * S, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function drawNews(ctx, f, a, sink) {
    const n = f.signals.news;
    if (!n || !n.headline || a <= 0.004) return;
    const crit = !!n.critical, p = crit ? 0.5 + 0.5 * Math.sin(f.t * TAU / 3.2) : 0;
    const ho = crit ? { px: 0.027 * H, weight: 300, color: C.alarm, glow: 8 * S, core: 0.92 }
                    : { px: 0.027 * H, weight: 300, color: C.ice, glow: 4 * S, core: 0.92 };
    const lines = wrap2(n.headline, ho, 0.56 * W, true);
    const lh = 0.035 * H, y0 = (lines.length > 1 ? 0.06 : 0.076) * H + sink;
    let tw0 = 0;
    for (let i = 0; i < lines.length; i++) {
      const w = text(ctx, lines[i], 0.5 * W, y0 + i * lh, ho, "center", 1, a * (crit ? 0.72 + 0.26 * p : 0.78));
      if (!i) tw0 = w;
    }
    const age = newsAge(n.published, f.now);
    const src = String(n.source || "").toUpperCase() + (age ? `  ·  ${age.toUpperCase()}` : "");
    text(ctx, src, 0.5 * W, y0 + (lines.length - 1) * lh + 0.037 * H,
      { px: Math.max(12, 0.0165 * H), spacing: 0.24, color: crit ? C.flare : C.iceDim, glow: crit ? 4 * S : 2, core: 0.9 }, "center", 1, a * (crit ? 0.8 : 0.88));
    if (crit) flareMark(ctx, 0.5 * W - tw0 / 2 - 0.03 * H, y0, 0.0105 * H, a, f.t, p);
  }

  // Overlay dimming: while an info panel is up, the station's readouts (and the cabin lights that carry the
  // hosts) are drawn into a layer and laid down at 1 - 0.7 * overlay.a. No layer, no cost without an overlay.
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

  // ------------------------------------------------------------------ heartbeat: survey marks -> cabin lights
  // shore positions for cabins: [x fraction, on the near layer?]
  const SHORE = [[0.27, 1], [0.71, 1], [0.47, 0], [0.87, 0], [0.58, 0], [0.38, 0]];

  function drawHosts(ctx, f, b, sink, ambA, lakeA, light, G, dk) {
    const hb = Array.isArray(f.signals.heartbeat) ? f.signals.heartbeat : [];
    const n = hb.length;
    if (!n) return;
    const t = f.t, now = f.now;
    const glyphA = fade(b, 0.05, 0.55), lblA = fade(b, 0.02, 0.35);
    const mv = U.easeInOut(U.smoothstep(0.15, 0.85, b));
    const lp = Math.max(13, 0.02 * H), r0 = 0.011 * H;
    const dim = 1 - 0.6 * light;
    for (let i = 0; i < n; i++) {
      const h = hb[i], down = !h.up;
      const wx = 0.5 * W + (i - (n - 1) / 2) * 0.1 * W, wy = 0.845 * H;
      const sp = SHORE[i % SHORE.length];
      const wl = sp[1] ? w1 : yH;
      const sx = (sp[0] + 0.03 * Math.floor(i / SHORE.length)) * W, sy = wl - (sp[1] ? 0.007 : 0.005) * H;
      const x = U.lerp(wx, sx, mv), y = U.lerp(wy, sy, mv);
      const per = down ? 2.2 : 3.2;
      const ph = ((t + i * 0.7) % per) / per, p = 0.5 + 0.5 * Math.sin((t + i * 0.7) * TAU / per);

      // work face: a survey mark (diamond) per host; down = the clear red-amber flare
      if (glyphA > 0.004) {
        const col = down ? C.alarm : C.pine, c = U.safe(col);
        if (down) {
          glow(ctx, C.alarm, x, y, 0.07 * H, 0.07 * H, glyphA * (0.38 + 0.2 * p));
          ctx.globalAlpha = glyphA * 0.6 * (1 - ph); ctx.strokeStyle = U.rgba(c, 1); ctx.lineWidth = 1.4 * S;
          ctx.beginPath(); ctx.arc(x, y, r0 * (1.3 + 3.2 * ph), 0, TAU); ctx.stroke();
        }
        ctx.globalAlpha = glyphA * (down ? 1 : 0.85);
        ctx.beginPath(); ctx.moveTo(x, y - r0); ctx.lineTo(x + r0, y); ctx.lineTo(x, y + r0); ctx.lineTo(x - r0, y); ctx.closePath();
        ctx.fillStyle = U.rgba(c, down ? 0.35 + 0.3 * p : 0.1); ctx.fill();
        ctx.strokeStyle = U.rgba(c, 0.95); ctx.lineWidth = 1.3 * S; ctx.lineJoin = "miter"; ctx.stroke();
        ctx.fillStyle = U.rgba(c, down ? 0.95 : 0.85);
        ctx.beginPath(); ctx.arc(x, y, 2.1 * S, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        text(ctx, String(h.host).toUpperCase(), wx, wy + 0.038 * H + sink,
          { px: lp, spacing: 0.24, color: down ? C.alarm : C.iceDim, glow: down ? 6 * S : 2, core: 0.92 }, "center", 1, lblA * (down ? 1 : 0.9));
        if (down) {
          const since = h.downSince ? `down ${U.fmtMinutes((now - h.downSince) / 60000)}` : "down";
          text(ctx, since, wx, wy + 0.038 * H + lp * 1.45 + sink, { px: lp * 1.05, color: C.flare, glow: 5 * S, core: 0.92 }, "center", 1, lblA);
        }
      }

      // ambient face: a lit cabin window on the far shore, its light laid down on the water
      if (ambA > 0.004) {
        const rly = wl + (wl - y) * SQ;                       // the light's mirror point
        const jit = U.noise2(i * 3.1, t * 0.4) * 1.5 * S;
        // by day the cabin itself shows: a small log cabin on the shore under a dark roof, mirrored
        if (G && dk > 0.01) {
          const cs = sp[1] ? 1 : 0.7, cw = 0.011 * W * cs, chh = 0.0078 * H * cs, k = 0.4 + 0.6 * G.bri;
          const body = U.rgba(U.scale(DAYC.cabin, k), 1), roof = U.rgba(U.scale(DAYC.roof, k), 1);
          const by = y + chh * 0.35;
          const cabin = () => {
            ctx.fillStyle = body; ctx.fillRect(x - cw / 2, by - chh, cw, chh);
            ctx.fillStyle = roof; ctx.beginPath();
            ctx.moveTo(x - cw * 0.62, by - chh); ctx.lineTo(x, by - chh * 1.75); ctx.lineTo(x + cw * 0.62, by - chh); ctx.closePath(); ctx.fill();
          };
          const ca = ambA * dk * U.smoothstep(0.85, 1, mv);     // (only once the light has reached its shore)
          ctx.globalAlpha = U.clamp(ca);
          cabin();
          if (lakeA > 0.004) {
            ctx.globalAlpha = U.clamp(ca * 0.35);
            ctx.setTransform(dpr, 0, 0, -dpr * SQ, 0, dpr * wl * (1 + SQ));
            cabin();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          }
          ctx.globalAlpha = 1;
        }
        if (!down) {
          const br = 0.9 + 0.1 * Math.sin(t * TAU / 9 + i * 2.3);
          glow(ctx, C.cabin, x, y, 0.016 * H, 0.016 * H, ambA * 0.24 * br * dim);
          ctx.globalAlpha = ambA * 0.8 * br * dim; ctx.fillStyle = U.rgba(U.safe(C.cabin), 1);
          ctx.fillRect(x - 1.6 * S, y - 1.2 * S, 3.2 * S, 2.4 * S);
          ctx.globalAlpha = 1;
          if (lakeA > 0.004) {
            glow(ctx, C.cabin, x + jit, rly + 0.022 * H, 0.004 * H, 0.026 * H, lakeA * 0.2 * br * dim);
            glow(ctx, C.cabin, x + jit, rly, 0.006 * H, 0.004 * H, lakeA * 0.3 * br * dim);
          }
        } else {
          // down: a soft warm-red flare, pulsing; the name whispers above it
          glow(ctx, C.cabinDown, x, y, 0.06 * H, 0.06 * H, ambA * (0.12 + 0.12 * p), true);
          glow(ctx, C.flare, x, y, 0.018 * H, 0.018 * H, ambA * (0.3 + 0.3 * p));
          ctx.globalAlpha = ambA * 0.35 * (1 - ph); ctx.strokeStyle = U.rgba(U.safe(C.cabinDown), 1); ctx.lineWidth = 1.1 * S;
          ctx.beginPath(); ctx.arc(x, y, 0.008 * H + ph * 0.04 * H, 0, TAU); ctx.stroke();
          ctx.globalAlpha = ambA * (0.6 + 0.35 * p); ctx.fillStyle = U.rgba(U.safe(C.flare), 1);
          ctx.fillRect(x - 1.6 * S, y - 1.2 * S, 3.2 * S, 2.4 * S);
          ctx.globalAlpha = 1;
          if (lakeA > 0.004) {
            glow(ctx, C.cabinDown, x + jit, rly + 0.03 * H, 0.006 * H, 0.036 * H, lakeA * (0.18 + 0.16 * p));
          }
          text(ctx, String(h.host).toLowerCase(), x, y - 0.034 * H, { px: 0.021 * H, color: C.flare, glow: 4 * S, core: 0.85 },
            "center", 1, U.smoothstep(0.6, 1, b) * (0.42 + 0.14 * p));
        }
      }
    }
  }

  // ------------------------------------------------------------------ now playing
  // Work: one small line "title — artist" low in the centre under the survey marks (a play / pause glyph, an
  // optional album thumbnail, a progress hairline). Ambient: "♪ title — artist" laid faintly on the water
  // under the right-hand cabin's light, broken into drifting strips like the light's own reflection.
  // Layout (ellipsis in the real font) is cached per text and width; the runs are cached sprites.
  const npLays = new Map();
  function npLine(np, font, maxW, prefix) {
    const key = `${prefix || ""}|${np.title}|${np.artist}|${font}|${Math.round(maxW)}`;
    let s = npLays.get(key);
    if (s !== undefined) return s;
    if (npLays.size > 8) npLays.clear();
    if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); LS = "letterSpacing" in mctx; }
    mctx.font = font; if (LS) mctx.letterSpacing = "0px";
    const clean = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
    const pre = prefix || "", ti = clean(np.title), ar = clean(np.artist), wd = (x) => mctx.measureText(x).width;
    s = pre + (ar ? `${ti} — ${ar}` : ti);
    if (wd(s) > maxW) {
      const room = maxW - wd(pre);
      if (!ar) s = pre + U.ellipsize(ti, room, mctx);
      else {
        // the artist keeps at least 40% of the line; the title gets the rest
        const a = U.ellipsize(ar, Math.max(0.4 * room, room - wd(ti + " — ")), mctx);
        s = `${pre}${U.ellipsize(ti, room - wd(" — " + a), mctx)} — ${a}`;
      }
    }
    npLays.set(key, s);
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
    const o = { px, weight: 400, color: C.ice, glow: 2, core: 0.9 };
    const str = npLine(np, `400 ${px}px ${SANS}`, 0.3 * W);
    const s = sprite(str, o), tw = s.tw;
    const y = 0.958 * H + sink, gs = 0.0085 * H, gap = 0.011 * H;
    const as = 0.034 * H, art = artFor(np.art, as);
    const total = (art ? as + gap : 0) + gs * 1.3 + gap + tw;
    let x = 0.5 * W - total / 2;
    if (art) {
      ctx.globalAlpha = U.clamp(a * 0.45 * k);
      ctx.drawImage(art, x, y - as / 2, as, as);
      ctx.globalAlpha = U.clamp(a * 0.5 * k); ctx.strokeStyle = U.rgba(U.safe(C.iceDim), 1); ctx.lineWidth = 1 * S;
      ctx.strokeRect(x + 0.5, y - as / 2 + 0.5, as - 1, as - 1);
      x += as + gap;
    }
    // the glyph: a small play wedge, or the two bars of a pause
    const gc = U.safe(paused ? C.iceDim : C.pine);
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
      const p = U.clamp(np.progressMs / np.durationMs), ly = y + px * 0.92, tc = U.safe(C.iceDim), fc = U.safe(C.ice);
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
  // ambient: on the water below the right-hand cabin, in strips that drift like the lake's reflections
  function drawNowPlayingAmbient(ctx, np, a, tt, dk) {
    if (!np || !np.title || a <= 0.004) return;
    const o = { px: 0.021 * H, weight: 300, color: U.mix(C.cabin, C.jade, 0.35), glow: 4 * S, core: 0.85 };
    const str = npLine(np, `300 ${Math.round(o.px)}px ${SANS}`, 0.24 * W, "♪  ");
    const s = sprite(str, o), w = s.w, h = s.h;
    const cx = 0.71 * W, cy = w1 + 0.062 * H, n = 6, ph = s.cv.height / n;
    const amp = (1.2 + 5 * wxs.rough) * (1 - 0.6 * wxs.still) * S;
    const al = a * (np.isPlaying ? 1 : 0.55) * U.lerp(0.36, 0.46, dk);
    for (let i = 0; i < n; i++) {
      const off = U.noise2(i * 0.9 + 7.7, tt * 0.3) * amp;
      ctx.globalAlpha = U.clamp(al * (1 - 0.05 * i));
      ctx.drawImage(s.cv, 0, i * ph, s.cv.width, ph, cx - w / 2 + off, cy - h / 2 + h * i / n, w, h / n);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ the cat on the rock (K)
  // A low Shield outcrop runs out from our own shore at the lower left (shown with the cat); the cat sits on
  // its shelf, seen from behind, watching the lake and the aurora (while the lights are up it stays watching; otherwise it loafs
  // and later curls up asleep on the rock: AW.cat.autoPose). The aurora rims it in its own colour, from the
  // side where the curtains are brightest, and the rim breathes with them (and flushes rose in a breakup);
  // a faint sky rim keeps it readable under cloud, the sunset side warms it at dusk. By day: sun on the coat,
  // a sunlit rim from the sun's side, a contact shadow; pink-grey granite. Snow and rain fall in front.
  let cat = null, ROCK = null, ROCKTOP = null;
  const CAT_X = 0.225, CAT_Y = 0.913, CAT_SIZE = 0.14;
  function buildRock() {
    const p = new Path2D(), q = new Path2D(), B = H + 2 * S;
    const P = [[0.095, B / H], [0.11, 0.96, 0.14, 0.919, 0.19, 0.914], [0.22, 0.911, 0.245, 0.912, 0.265, 0.919],
      [0.29, 0.928, 0.31, 0.962, 0.338, 0.986]];
    p.moveTo(P[0][0] * W, P[0][1] * H);
    for (let i = 1; i < P.length; i++) { const c = P[i]; p.bezierCurveTo(c[0] * W, c[1] * H, c[2] * W, c[3] * H, c[4] * W, c[5] * H); }
    p.lineTo(0.352 * W, B); p.closePath();
    // the top edge alone (the rim): from where it clears the foreground mound to the water
    q.moveTo(0.118 * W, 0.948 * H);
    q.bezierCurveTo(0.14 * W, 0.919 * H, 0.16 * W, 0.916 * H, 0.19 * W, 0.914 * H);
    for (let i = 2; i < P.length; i++) { const c = P[i]; q.bezierCurveTo(c[0] * W, c[1] * H, c[2] * W, c[3] * H, c[4] * W, c[5] * H); }
    // a few cracks and joints in the granite
    const k = new Path2D();
    k.moveTo(0.203 * W, 0.928 * H); k.quadraticCurveTo(0.214 * W, 0.952 * H, 0.208 * W, 0.99 * H);
    k.moveTo(0.272 * W, 0.937 * H); k.quadraticCurveTo(0.282 * W, 0.952 * H, 0.287 * W, 0.97 * H);
    k.moveTo(0.14 * W, 0.958 * H); k.bezierCurveTo(0.18 * W, 0.952 * H, 0.22 * W, 0.966 * H, 0.255 * W, 0.959 * H);
    // weathered patches: paler, glacier-polished granite on top, darker where it stays wet and lichened
    const hiP = new Path2D(), loP = new Path2D(), r = U.rng(4711);
    for (let i = 0; i < 9; i++) {
      const u = 0.13 + 0.19 * r(), v = 0.925 + 0.06 * r(), rx = (0.012 + 0.022 * r()) * W, ry = (0.004 + 0.008 * r()) * H;
      const P2 = v < 0.95 ? hiP : loP;
      P2.moveTo(u * W + rx, v * H); P2.ellipse(u * W, v * H, rx, ry, (r() - 0.5) * 0.3, 0, TAU);
    }
    ROCK = p; ROCKTOP = q; ROCK.cracks = k; ROCK.hi = hiP; ROCK.lo = loP;
  }
  // how much aurora light is up right now, its colour, and which side it is brightest on (from the ribbons
  // drawn this frame)
  const AUR = { i: 0, col: null, dx: 0 };
  function auroraLight(aurA) {
    AUR.i = 0; AUR.dx = 0; AUR.col = C.auroraG;
    if (!(aurA > 0.004) || !curt.length) return AUR;
    let s = 0, sx = 0, bu = 0, hi = 0;
    for (const cu of curt) {
      if (!(cu.vis >= 0.01)) continue;
      let m = 0, mx = 0, c = 0;
      for (let i = 0; i < cu.n; i += 5) { m += cu.HB[i]; mx += cu.HB[i] * cu.HX[i]; c++; }
      if (!c) continue;
      const wk = 0.5 + 0.5 * cu.dp;
      s += m / c * wk; sx += mx / c * wk; hi += m / c * wk * cu.dp; bu = Math.max(bu, cu.bu);
    }
    AUR.i = U.clamp(s * 1.1);
    AUR.dx = s > 1e-4 ? U.clamp((sx / s - CAT_X * W) / (0.45 * W), -1, 1) : 0;
    const hiK = s > 1e-4 ? hi / s : 0;
    AUR.col = U.safe(U.mix(U.mix(U.mix(C.auroraG, C.auroraT, 0.35), U.mix(C.auroraT, C.violet, 0.4), 0.35 * hiK), C.fringe, 0.55 * bu));
    return AUR;
  }
  function drawRockCat(ctx, f, b, t, dy, fa, G, dk, sA, aurA, dusk, rimA, dust) {
    if (!ROCK) buildRock();
    if (!cat && AW.cat) cat = AW.cat.create(47);
    const nk = 1 - dk;
    // the rock: black at night (it hides the lake behind it), granite by day. It is the cat's: it comes and
    // goes with it, so with the cat off the lake is exactly as it was
    fa *= f.cat ? U.clamp(f.cat.a) : 0;
    if (fa > 0.004) {
      ctx.save();
      ctx.translate(0, dy);
      ctx.globalAlpha = U.clamp(fa); ctx.fillStyle = "#000"; ctx.fill(ROCK);
      if (G && dk > 0.004) {
        const g = ctx.createLinearGradient(0, 0.91 * H, 0, H);
        g.addColorStop(0, U.rgba(DAYC.granite, 1)); g.addColorStop(1, U.rgba(DAYC.graniteLo, 1));
        ctx.globalAlpha = U.clamp(sA * G.bri * fa); ctx.fillStyle = g; ctx.fill(ROCK);
        ctx.save(); ctx.clip(ROCK);
        ctx.globalAlpha = U.clamp(sA * G.bri * fa * 0.2); ctx.fillStyle = U.rgba(U.mix(DAYC.granite, G.sun, 0.3), 1); ctx.fill(ROCK.hi);
        ctx.globalAlpha = U.clamp(sA * G.bri * fa * 0.3); ctx.fillStyle = U.rgba(DAYC.graniteLo, 1); ctx.fill(ROCK.lo);
        ctx.globalAlpha = U.clamp(sA * G.bri * fa * 0.28); ctx.strokeStyle = U.rgba(DAYC.fgBot, 1); ctx.lineWidth = 1.2 * S; ctx.stroke(ROCK.cracks);
        ctx.restore();
      }
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      // the top edge: sky-lit and aurora-lit at night, sunlit (gold when low) by day
      const A = AUR;
      const ra = U.clamp((rimA * 0.45 * nk + 0.32 * A.i * nk) * fa);
      if (ra > 0.004) {
        // brightest on the crown, fading where the rock runs under the spruce and into the water
        const rc = U.safe(U.mix(C.rim, A.col, U.clamp(A.i * 1.5)));
        const g = ctx.createLinearGradient(0.118 * W, 0, 0.338 * W, 0);
        g.addColorStop(0, U.rgba(rc, 0)); g.addColorStop(0.25, U.rgba(rc, 1)); g.addColorStop(0.6, U.rgba(rc, 0.9)); g.addColorStop(1, U.rgba(rc, 0.1));
        ctx.globalAlpha = ra; ctx.strokeStyle = g; ctx.lineWidth = 1.3 * S; ctx.stroke(ROCKTOP);
      }
      if (G && dk > 0.004) {
        const sa = U.clamp(sA * G.clear * G.up * 0.6 * fa);
        if (sa > 0.004) { ctx.globalAlpha = sa; ctx.strokeStyle = U.rgba(U.safe(U.mix(U.mix(DAYC.granite, G.sun, 0.5), DAYC.gold, G.gold)), 1); ctx.lineWidth = 1.8 * S; ctx.stroke(ROCKTOP); }
      }
      if (dust > 0.004) { ctx.globalAlpha = U.clamp(dust * 0.7 * fa); ctx.strokeStyle = U.rgba(U.safe(C.snow), 1); ctx.lineWidth = 3 * S; ctx.stroke(ROCKTOP); }
      ctx.restore();
    }
    if (!cat) return;
    // the cat
    const A = AUR, x = CAT_X * W, y = CAT_Y * H + dy + 1.5 * S, size = CAT_SIZE * H;
    let pose = AW.cat.autoPose(f, "back");
    if (pose === "loaf" && aurA > 0.2) pose = "back";                   // the lights hold its attention
    if (pose === "back" && wxs.rain + wxs.storm > 0.35) pose = "loaf";  // in the rain it hunkers down
    let light = 0.2 + 0.12 * A.i, tint = A.i > 0.01 ? A.col : C.rim, tintAmt = 0.25 + 0.4 * A.i;
    const rims = [
      { color: A.col, a: nk * (0.12 + 0.7 * A.i), dx: 0.8 * A.dx, dy: -1, width: 0.04 },
      { color: U.safe(C.rim), a: nk * 0.3 * (1 - 0.6 * A.i), dx: 0, dy: -1 },
    ];
    if (dusk > 0.01) rims.push({ color: U.safe(U.mix(C.ember, C.rose, 0.3)), a: 0.4 * dusk * nk, dx: 1, dy: -0.35 });
    let shadow = 0;
    if (G && dk > 0.001) {
      const ek = Math.min(1, EXPO.k * 1.1);
      light = U.lerp(light, (0.12 + 0.75 * G.bri) * ek, dk);
      tint = U.mix(tint, G.sun, dk); tintAmt = U.lerp(tintAmt, 0.1 + 0.45 * G.warm * G.sunVis + 0.15 * G.ov, dk);
      const sx = U.lerp(0.1, 0.9, U.clamp(G.u)) * W;
      rims.push({ color: U.safe(U.mix(G.sun, DAYC.gold, G.gold)), a: dk * (0.12 + 0.35 * G.sunVis), dx: U.clamp((sx - x) / (0.3 * W), -1, 1), dy: -0.4 - U.clamp(G.e / 40) });
      shadow = dk * (0.25 + 0.4 * G.sunVis);
    }
    cat.draw(ctx, f, {
      x, y, size, facing: 1, pose, hang: false,
      light, tint, tintAmt, rim: rims,
      glow: nk * 0.55, shadow,
      alpha: U.smoothstep(0.4, 0.95, b),
    });
  }

  // ------------------------------------------------------------------ sound cues from the lake's own events
  // loons and an owl on a deterministic-ish schedule (hashed slots of real time), thunder on the frame the
  // lightning flashes (lightning() uses the same slots), a paddle drip as the canoe's stern paddle lifts.
  const SND = { t: -1, aur: 0 };
  function slotHit(t0, t1, slot, p, salt) {
    const s = Math.floor(t1 / slot);
    for (let k = s; k >= s - 1; k--) {
      if (hash(k * 1.37 + salt) > p) continue;
      const at = k * slot + hash(k * 2.91 + salt + 0.5) * slot;
      if (at > t0 && at <= t1) return k;
    }
    return null;
  }
  function boltStart(t0, t1) {
    const P = 14, s = Math.floor(t1 / P);
    for (let k = s; k >= s - 1; k--) {
      if (hash(k + 0.5) > 0.5) continue;
      const ts = k * P + 1 + hash(k + 0.31) * (P - 3);
      if (ts > t0 && ts <= t1) return k;
    }
    return null;
  }
  const wxRain = (w) => !w ? 0 : w.condition === "rain" ? 0.2 + 0.8 * U.clamp(+w.intensity || 0) : w.condition === "storm" ? 0.75 + 0.25 * U.clamp(+w.intensity || 0) : 0;
  const PADDLE = 1.3;   // the stern paddler's stroke phase (drawCanoe)
  function sfx(f, t, skyA, canoeA, dusk) {
    const A = AW.audio, w = f.signals && f.signals.weather;
    const t0 = SND.t;
    SND.t = t;
    if (!A || t0 < 0 || t <= t0 || t - t0 > 1) return;
    const rain = wxRain(w), day = U.clamp(f.day || 0);
    const T = w && w.tempC != null && isFinite(+w.tempC) ? +w.tempC : 12;
    // thunder, far over the ridges: the strike's own slot; a mild storm is farther away
    if (wxs.storm > 0.01 && skyA > 0.05) {
      const k = boltStart(t0, t);
      if (k !== null) {
        const I = w ? U.clamp(+w.intensity || 0) : 0.5;
        A.cue("thunder", { distance: U.clamp(0.45 + 0.35 * (1 - wxs.storm) + 0.35 * hash(k + 2.2), 0.35, 1),
          gain: 0.5 + 0.45 * I, pan: (0.12 + 0.76 * hash(k + 0.77) - 0.5) * 1.4 });
      }
    }
    const calm = rain < 0.5 && !(w && w.condition === "storm");
    // loons: the wail at dusk and through the night (now and then the tremolo), a rare tremolo by day.
    // Open water only: they are gone once the lake freezes.
    if (calm && T > 0) {
      const nightish = U.clamp(1 - day + dusk);
      const k = slotHit(t0, t, 420, 0.12 + 0.33 * nightish, 3.3);
      if (k !== null) {
        const tremolo = nightish < 0.3 || hash(k * 3.9) > 0.72;
        A.cue("loon", { kind: tremolo ? "tremolo" : "wail", distance: 0.62 + 0.33 * hash(k * 5.1), pan: (hash(k * 2.3) - 0.5) * 1.6, gain: 0.9 });
      }
    }
    // an owl in the spruce, rarely
    if (calm && day < 0.2) {
      const k = slotHit(t0, t, 900, 0.3, 41.1);
      if (k !== null) A.cue("owl", { pan: (hash(k * 4.7) - 0.5) * 1.6, distance: 0.55 + 0.35 * hash(k * 6.1), freq: 280 + 60 * hash(k * 8.9), gain: 0.7 });
    }
    // the canoe: a soft drip as the stern paddle lifts from the water (most strokes)
    if (canoeA > 0.15) {
      const now = f.now, ph = ((now.getTime() / 1000) % 2400) / 1500;
      const n0 = Math.floor((t0 * 1.5 + PADDLE - Math.PI / 2) / TAU), n1 = Math.floor((t * 1.5 + PADDLE - Math.PI / 2) / TAU);
      if (ph <= 1 && n1 !== n0 && hash(n1 * 0.71) < 0.7) {
        const x = U.lerp(-0.05, 1.05, ph);
        A.cue("drip", { gain: 0.32 * U.clamp(canoeA * 1.5), pan: U.clamp((x - 0.5) * 1.6, -1, 1), distance: 0.55 });
      }
    }
  }

  // ------------------------------------------------------------------ build
  function build() {
    S = H / 1080;
    yH = 0.62 * H; w1 = yH + 0.016 * H;
    sprites.clear(); glows.clear(); lays.clear(); dimL = null;
    if (!raySpr.length) buildRays();
    buildLand();
    ROCK = null;
    buildStars();
    skyC = mkHalf(W, yH); skyKey = "";
    auroraC = mkHalf(W, yH);
    glowC = { cv: document.createElement("canvas") };
    glowC.cv.width = Math.max(1, Math.ceil(W * GQ)); glowC.cv.height = Math.max(1, Math.ceil(yH * GQ));
    glowC.c = glowC.cv.getContext("2d");
    glowRow = { cv: document.createElement("canvas") };
    glowRow.cv.width = glowC.cv.width; glowRow.cv.height = 1;
    glowRow.c = glowRow.cv.getContext("2d");
    rimLit = { cv: document.createElement("canvas") };
    rimLit.cv.width = L0.rim.cv.width; rimLit.cv.height = L0.rim.cv.height;
    rimLit.c = rimLit.cv.getContext("2d");
    curtSeed = -1;
    buildClouds();
    DS.key = ""; DS.a = DS.b = DS.s = null; DS.cu = [];
    seedPrecip();
    built = `${W}x${H}@${dpr}`;
  }

  // ------------------------------------------------------------------ theme
  AW.registerTheme({
    id: "boreal",
    name: "Boreal",
    init(ctx, env) { dpr = env.dpr || 1; W = env.width; H = env.height; build(); if (!cat && AW.cat) cat = AW.cat.create(47); },
    resize(env) { dpr = env.dpr || 1; W = env.width; H = env.height; build(); },
    destroy() { sprites.clear(); glows.clear(); lays.clear(); dimL = null; L0 = L1 = L2 = null; skyC = auroraC = starsL = glowC = glowRow = rimLit = null; built = ""; hairGrad = null; DS.a = DS.b = DS.s = null; DS.key = ""; DS.cu = []; },

    // the shared info overlay, dressed as this theme: frost and pine in work, aurora jade and cabin light in ambient
    overlayStyle(f) {
      const s = U.smoothstep(0.3, 0.7, U.clamp(f.blend || 0));
      return {
        font: SANS,
        ink: U.safe(U.mix(C.frost, C.jade, s)),
        dim: U.safe(U.mix(C.iceDim, U.scale(C.auroraT, 0.62), s)),
        accent: U.safe(U.mix(C.pine, C.cabin, s)),
        alarm: U.safe(U.mix(C.alarm, C.cabinDown, s)),
        glow: U.lerp(0.45, 0.6, s),
        rule: "hairline",
        caps: false,
      };
    },

    // the lake as sound: water lapping at the shore, wind in the spruce, birds by day, crickets on summer
    // nights, rain from the weather, and under the aurora the faintest shimmer. (Cues: see sfx().)
    soundscape(f) {
      const w = (f.signals && f.signals.weather) || {};
      const cond = w.condition || "clear", sst = U.smoothstep;
      const wind = w.windKph != null && isFinite(+w.windKph) ? +w.windKph : 5, T = w.tempC != null && isFinite(+w.tempC) ? +w.tempC : 12;
      const day = U.clamp(f.day || 0), rain = wxRain(w), wet = U.clamp(rain * 1.2), snow = cond === "snow";
      const frozen = sst(-3, -12, T);    // deep cold: the lake is ice, the lapping all but stops
      return {
        water: (0.5 + 0.15 * sst(15, 45, wind)) * (1 - 0.8 * frozen),
        wind: U.clamp(0.85 * sst(6, 55, wind) + (cond === "storm" ? 0.15 : 0) + (snow ? 0.1 : 0)),
        forest: 0.25 * sst(6, 30, wind) * (snow ? 0.6 : 1),
        birds: 0.35 * day * sst(4, 9, T) * (1 - 0.85 * wet) * (1 - 0.5 * sst(25, 50, wind)),
        crickets: 0.45 * (1 - day) * sst(12, 19, T) * (1 - wet),
        magic: 0.1 * SND.aur,
        rain,
      };
    },

    render(ctx, f) {
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      if (EXPO.want) { const w = EXPO.want; EXPO.want = null; exposure(ctx, w.day, f.t, w.G, w.moving); }
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.width, f.height);
      if (f.width !== W || f.height !== H || (f.dpr || 1) !== dpr || !built) {
        dpr = f.dpr || 1; W = f.width; H = f.height; build();
      }
      const b = U.clamp(f.blend), t = f.t, now = f.now, Sg = f.signals || {};
      const dt = Math.min(f.dt || 0.016, 0.05);
      updateWeather(Sg.weather, dt);
      const dl = Sg.daylight;
      const elev = dl ? dl.elevation : -30, light = dl ? dl.light : 0;
      const e = f.ambientElapsed || 0;
      const sink = b * 0.03 * H;          // info sinks as it fades
      // daytime: how much of the day lake shows (dk), and at what intensity (sA: about 0.18 behind the work
      // face, coming forward to 1 with the exhale). nightK fades the night sky out under it.
      const day = U.clamp(f.day || 0), dk = dayK(day), nightK = 1 - U.smoothstep(0.5, 1, dk);
      let uS = 0.5;
      if (dl && dl.sunrise && dl.sunset) uS = (now - dl.sunrise) / (dl.sunset - dl.sunrise);
      const G = dk > 0.001 ? dayGrade(dayElev(elev, day), uS) : null;
      // (in work the exposure is estimated from the baked sky; in ambient it is measured: see exposure())
      const ramp = U.smoothstep(0.08, 0.85, b), kEst = DS.mSky ? Math.min(1, 50 / DS.mSky) : 1;
      const sA0 = G ? dk * U.lerp(0.18, 1, ramp) : 0, sA = G ? dk * U.lerp(0.18 * kEst, EXPO.k, ramp) : 0;

      // the exhale, staged (by day the land simply stands there: the scene comes forward instead)
      const k0 = U.lerp(U.lerp(K_WORK, 1, U.smoothstep(0.1, 0.72, b)), 1, dk);     // the far ridge rises
      kHair = U.lerp(K_WORK, 1, dk);
      const fillA = U.smoothstep(0.12, 0.65, b);
      const hairA = fade(b, 0.28, 0.8);
      const skyA = U.smoothstep(0.2, 0.75, b);
      const k1 = U.lerp(U.easeOut(U.smoothstep(0.3, 0.8, b)), 1, dk);               // near points grow from the water
      const rise2 = (1 - U.easeOut(U.smoothstep(0.4, 0.95, b))) * 0.5 * H * (1 - dk); // foreground rises from below
      const lakeA = U.smoothstep(0.35, 0.9, b);
      const dark = 1 - U.smoothstep(-10, -3, elev);
      const starA = U.smoothstep(0.45, 0.95, b) * dark * wxs.stars;
      const night = 1 - U.smoothstep(-15, -7, elev);
      const aurA = U.smoothstep(0.62, 1, b) * night * auroraLevel(e) * U.clamp(wxs.aur);
      const ambA = U.smoothstep(0.2, 1, b);
      const dusk = U.smoothstep(-12, -2, elev) * (1 - U.smoothstep(6, 16, elev));
      const tt = t + e * 0.5;        // lake shimmer: real time, offset by the evening so each hour looks different
      const fog = wxs.fog, mirK = wxs.mirror;
      const fl = wxs.storm > 0.01 ? lightning(t) * wxs.storm * skyA : 0;
      SND.aur = night * auroraLevel(e) * U.clamp(wxs.aur);
      const np = Sg.nowPlaying;

      // ---------------------------------------------------- sky (cached, half res) + aurora (every frame)
      // the glow sits where the sun is nearest: sunrise end (left) before noon, sunset end (right) after
      let u = -1;
      const sunSide = dl && dl.dayFraction < 0.5 ? 0.1 : 0.9;
      if (dl && dl.sunrise && dl.sunset) u = (now - dl.sunrise) / (dl.sunset - dl.sunrise);
      const skyWash = skyA * (1 - 0.45 * wxs.cloud);
      if (b > 0.004 && nightK > 0.004) {
        const key = `${Math.round(elev * 2)}|${sunSide}|${Math.round(U.clamp(u, -0.1, 1.1) * 60)}`;
        if (key !== skyKey) { skyKey = key; paintSky(elev, u, sunSide); }
        // each evening its own curtains; they move in real time
        const ev = new Date(now.getTime() - e * 1000);
        const seed = ev.getFullYear() * 10000 + (ev.getMonth() + 1) * 100 + ev.getDate();
        if (seed !== curtSeed) buildCurtains(seed);
        stepAurora(dt, t);
        // the moving layer: aurora, then the clouds that cover it. Redrawn every frame (smooth motion),
        // at half resolution (the aurora is soft; the rays are a few px wide either way).
        const x = auroraC.c;
        x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
        x.clearRect(0, 0, auroraC.cv.width, auroraC.cv.height);
        x.setTransform(Q, 0, 0, Q, 0, 0);
        if (aurA > 0.004) drawAurora(x, t, aurA, e);
        drawClouds(x, skyA);

        // sky wash, then the stars, then the aurora/cloud layer over them
        if (skyWash > 0.004) { ctx.globalAlpha = skyWash; ctx.drawImage(skyC.cv, 0, 0, W, yH); ctx.globalAlpha = 1; }
        if (starA > 0.004) {
          ctx.globalAlpha = starA; ctx.drawImage(starsL.cv, 0, 0, W, yH);
          const sc = U.safe(C.star);
          ctx.fillStyle = U.rgba(sc, 1);
          for (let i = 0; i < TW_N; i++) {
            const tw = U.smoothstep(0.2, 1, Math.sin(t * 0.7 + TWP[i]) * 0.5 + 0.5 + U.noise1(t * 0.9 + TWP[i]) * 0.4);
            ctx.globalAlpha = starA * (0.12 + 0.4 * tw);
            ctx.fillRect(TWX[i] - 0.9 * S, TWY[i] - 0.9 * S, 1.8 * S, 1.8 * S);
          }
          ctx.globalAlpha = 1;
        }
        ctx.drawImage(auroraC.cv, 0, 0, W, yH);
        if (starA > 0.004) drawMeteor(ctx, t, starA);

        // storm: dim lightning far off behind the ridges, lighting the deck from inside (never white)
        if (fl > 0.004) {
          glow(ctx, C.bolt, ltX * W, yH - 0.1 * H, 0.32 * W, 0.2 * H, fl * 0.12, true);
          // the deck lit from inside, only around the strike: a soft blob masks the lit cloud texture
          const lx = ltCtx, o = ((wxs.drift % W) + W) % W / W * CT_W;
          lx.globalCompositeOperation = "source-over"; lx.globalAlpha = 1; lx.clearRect(0, 0, CT_W, CT_H);
          lx.drawImage(glowSprite(C.bolt, true), ltX * CT_W - CT_W * 0.22, CT_H * 0.05, CT_W * 0.44, CT_H * 0.95);
          lx.globalCompositeOperation = "source-in";
          lx.drawImage(litTex, -o, 0); lx.drawImage(litTex, CT_W - o, 0);
          lx.globalCompositeOperation = "source-over";
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = U.clamp(fl * 0.8); ctx.drawImage(ltCv, 0, -0.02 * H, W, yH * 0.98);
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
        }

        // ---------------------------------------------------- the lake
        if (lakeA > 0.004) {
          drawMirror(ctx, skyC.cv, lakeA * mirK * skyWash, tt);
          drawMirror(ctx, auroraC.cv, lakeA * mirK, tt);
          if (starA > 0.004 && mirK > 0.01) {
            ctx.globalAlpha = starA * lakeA * 0.22 * mirK;
            ctx.setTransform(dpr, 0, 0, -dpr * SQ, 0, dpr * yH * (1 + SQ));
            ctx.drawImage(starsL.cv, 0, 0, W, yH);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.globalAlpha = 1;
          }
          if (fl > 0.004) glow(ctx, C.bolt, ltX * W, yH + 0.05 * H, 0.25 * W, 0.06 * H, fl * 0.05 * lakeA, true);
        }
      }

      // ---------------------------------------------------- the lake by day (and, faintly, behind the work face)
      if (G) {
        dayLake(ctx, G, sA, sA0, dt, t, tt, mirK);
        drawGlitter(ctx, G, t, sA0, mirK);
        if (fl > 0.004) glow(ctx, C.bolt, ltX * W, yH - 0.1 * H, 0.32 * W, 0.2 * H, fl * 0.1 * dk, true);
      }

      // ---------------------------------------------------- the land
      const canoeA = G ? sA * ambA * (1 - U.clamp(wxs.rain * 1.5 + wxs.storm)) * (1 - 0.8 * fog) * (1 - wxs.snow) : 0;
      const dimKnp = f.overlay ? 1 - 0.7 * U.clamp(f.overlay.a || 0) : 1;
      const rimA = U.clamp(0.26 + 0.4 * aurA + 0.12 * dusk);
      const dust = wxs.dust * Math.max(fillA, G ? dk * U.smoothstep(0.08, 0.85, b) : 0);
      // by day: sunlit land (dimmed for the hour), green-lit crests, gold ones at golden hour
      const DL = (k) => G ? { f: sA * G.bri * k, r: sA * G.clear * (1 - G.gold) * 0.55 * G.up * k, g: sA * G.clear * G.gold * 0.85 * k } : undefined;
      if (b > 0.004 || G) {
        // the far ridge: a faint sky-lit rim everywhere, and the crowns under the aurora catching its light
        const r0 = (0.13 + 0.12 * dusk) * (1 - 0.8 * fog) * nightK + fl * 0.6;
        if (lakeA > 0.004 || G) drawLayerRefl(ctx, L0, yH, k0, Math.max(fillA * lakeA, dk), r0 * fillA * lakeA * 0.3 * mirK, dust * lakeA * 0.2 * mirK, DL(0.7 * (0.5 + 0.5 * mirK)));
        drawLayer(ctx, L0, yH, k0, 0, Math.max(fillA, dk), r0 * fillA * 0.65, dust * 0.5 * (1 - 0.7 * fog) * (1 + 1.2 * dk), DL(1));
        if (aurA > 0.004) drawLitRim(ctx, L0, yH, k0, fillA * (1 - 0.8 * fog));
        // waterline glint: faint, and brighter under the aurora
        const wc = U.safe(U.mix(C.water, C.auroraT, aurA * 0.6));
        ctx.globalAlpha = lakeA * 0.07 * (0.4 + 0.6 * mirK); ctx.fillStyle = U.rgba(wc, 1);
        ctx.fillRect(0, yH, W, 1 * S);
        if (aurA > 0.004) { ctx.globalAlpha = U.clamp(lakeA * 0.3 * mirK); ctx.drawImage(glowRow.cv, 0, yH, W, 1 * S); }
        ctx.globalAlpha = 1;
        // fog: the far shore softens into a band of mist lying on the water
        if (fog > 0.004) {
          glow(ctx, C.mist, 0.5 * W, yH - 0.004 * H, 0.75 * W, 0.05 * H, fog * fillA * 0.09 * nightK, true);
          drawTex(ctx, mistTex, wxs.drift * 0.5, yH - 0.06 * H, 0.12 * H, fog * fillA * nightK);
          if (G) dayFog(ctx, G, sA, fog, 0);
        }
        // falling snow by day: the far shore greys out behind it, as in fog but lighter
        if (G && wxs.snow > 0.01) dayFog(ctx, G, sA, U.clamp(wxs.snow * 0.55), 0);
        if (k1 > 0.004) {
          const r1 = (rimA * (1 - 0.35 * fog)) * nightK + fl * 0.5;
          if (lakeA > 0.004 || G) drawLayerRefl(ctx, L1, w1, k1, Math.max(lakeA, dk), r1 * k1 * lakeA * 0.3 * mirK, dust * k1 * lakeA * 0.25 * mirK, DL(0.7 * (0.5 + 0.5 * mirK)));
          drawLayer(ctx, L1, w1, k1, 0, 1, r1 * k1, dust * k1 * 0.6 * (1 + 1.2 * dk), DL(1));
        }
        // shimmer: thin horizontal glints across the water; in a storm the wind chops them up
        if (lakeA > 0.004) {
          const sc = U.mix(C.water, C.auroraT, U.clamp(aurA * 0.9));
          const ruf = wxs.storm, spd = 0.12 + 1.6 * ruf, len = 0.5 * (1 - 0.55 * ruf);
          const sa = lakeA * (0.6 + 0.6 * aurA) * (1 + 0.6 * ruf) * (1 - 0.5 * fog) * nightK;
          for (let i = 0; i < SH_N; i++) {
            const fl2 = 0.5 + 0.5 * U.noise1(t * spd + SHP[i]);
            const x = SHX[i] + U.noise1(t * (0.03 + 0.25 * ruf) + SHP[i] * 1.7) * 0.02 * W;
            glow(ctx, sc, x, SHY[i], SHL[i] * len, 1.1 * S, sa * (0.06 + 0.1 * fl2));
          }
        }
        // rain rings on the surface
        drawRings(ctx, dt, lakeA * U.clamp(wxs.rings * 1.4), wxs.rings);
        // mist lying on the lake and drifting between the near points
        if (fog > 0.004) {
          drawTex(ctx, mistTex, -wxs.drift * 0.7 + 400 * S, w1 - 0.04 * H, 0.18 * H, fog * lakeA * nightK);
          drawTex(ctx, mistTex, wxs.drift * 0.9, H - 0.24 * H, 0.2 * H, fog * lakeA * 0.7 * nightK);
          if (G) dayFog(ctx, G, sA, fog, 1);
        }
        if (G && wxs.snow > 0.01) dayFog(ctx, G, sA, U.clamp(wxs.snow * 0.4), 1);
        // a canoe out on the water (ambient, by day, when it is calm enough to paddle)
        if (G) drawCanoe(ctx, G, now, t, canoeA, mirK);
      }
      // the song, laid faintly on the water under the cabin light
      drawNowPlayingAmbient(ctx, np, U.smoothstep(0.55, 1, b) * dimKnp, tt, dk);

      // ---------------------------------------------------- info: straight to the wall, or into the dim layer
      const ov = f.overlay, dimK = ov ? 1 - 0.7 * U.clamp(ov.a || 0) : 1;
      const out = ctx;
      ctx = dimBegin(out, dimK);

      // ---------------------------------------------------- work: horizon hairline, the sun's arc
      drawHairline(ctx, k0, hairA);
      drawDaylight(ctx, f, fade(b, 0.12, 0.5), sink);

      // ---------------------------------------------------- hosts (survey marks -> cabin lights)
      drawHosts(ctx, f, b, sink, ambA, lakeA, light, G, dk);

      dimEnd(out, ctx, dimK);
      ctx = out;

      // ---------------------------------------------------- foreground spruce (ambient)
      // (by day it stands in place and fades in with the exhale: it is drawn over the work face, so it must
      // not sit in front of the HUD's text)
      const fa2 = G ? U.smoothstep(0.02, 0.35, b) : 1;
      // the cat on its rock, just behind the foreground spruce (called every frame: it keeps its own clock)
      auroraLight(aurA);
      drawRockCat(ctx, f, b, t, rise2, b > 0.004 && rise2 < 0.5 * H - 1 ? fa2 : 0, G, dk, sA, aurA, dusk * nightK, rimA * nightK, dust * 0.45 * U.smoothstep(0.45, 1, b) * (1 + 0.5 * dk));
      if (b > 0.004 && rise2 < 0.5 * H - 1) {
        drawLayer(ctx, L2, H, 1, rise2, fa2, (rimA * nightK + fl * 0.4) * 0.75 * U.smoothstep(0.45, 1, b), dust * 0.45 * U.smoothstep(0.45, 1, b) * (1 + 0.5 * dk), DL(fa2));
      }

      // ---------------------------------------------------- precipitation (ambient)
      const pa = U.smoothstep(0.45, 1, b);
      drawRain(ctx, dt, pa * (0.55 + 0.45 * U.clamp(wxs.rain * 1.5)), wxs.rain);
      drawSnow(ctx, dt, t, pa, U.clamp(wxs.snow * (1 + 0.6 * dk)), dk);

      // ---------------------------------------------------- work HUD, cascading out
      ctx = dimBegin(out, dimK);
      drawNews(ctx, f, fade(b, 0.04, 0.4), sink);
      drawNowPlayingWork(ctx, np, fade(b, 0.05, 0.42), sink);
      drawFinance(ctx, f, fade(b, 0.03, 0.38), b, sink);
      drawCalendar(ctx, f, fade(b, 0.06, 0.42), b, sink);
      drawWeather(ctx, f, fade(b, 0.0, 0.32), b, sink);
      {
        const da = fade(b, 0.08, 0.45);
        if (da > 0.004) {
          const wd = now.toLocaleDateString("en-CA", { weekday: "long" }).toUpperCase();
          const mo = now.toLocaleDateString("en-CA", { month: "long" }).toUpperCase();
          text(ctx, `${wd}   ${now.getDate()} ${mo}`, 0.5 * W, 0.425 * H + sink,
            { px: 0.022 * H, spacing: 0.32, color: C.iceDim, glow: 3, core: 0.92 }, "center", 1, da * 0.95);
        }
      }

      // ---------------------------------------------------- clock: hero -> a small light low in the sky
      {
        const str = U.fmtTime(now, { hour24: AW.config.clock ? AW.config.clock.hour24 !== false : true });
        const m = U.easeInOut(U.smoothstep(0.08, 0.9, b));
        const cx = 0.5 * W, cy = U.lerp(0.28 * H, 0.455 * H, m), px = U.lerp(0.25 * H, 0.1 * H, m);
        const sw = U.smoothstep(0.3, 0.75, b);
        const oW = { px: 0.25 * H, weight: 200, color: C.frost, glow: 15 * S, core: 0.92 };
        const oA = { px: 0.1 * H, weight: 300, color: C.jade, glow: 9 * S, core: 0.8 };
        const breathe = 1 - ambA * (0.08 - 0.05 * Math.sin(t * TAU / 16));
        if (sw < 0.999) text(ctx, str, cx, cy, oW, "center", px / Math.round(oW.px), (1 - sw));
        if (sw > 0.001) {
          const k = px / Math.round(oA.px);
          text(ctx, str, cx, cy, oA, "center", k, sw * 0.82 * breathe);
          if (lakeA > 0.004) drawSpriteRefl(ctx, sprite(str, oA), cx, cy, k, sw * lakeA * 0.13 * breathe * mirK, tt);
        }
        // whispers under the clock: the next event if close, weather if it matters
        const wa = U.smoothstep(0.8, 1, b);
        if (wa > 0.004) {
          const next = Sg.calendar && Sg.calendar.next;
          const wx = Sg.weather;
          const parts = [];
          if (next && next.minutesUntil < 30) parts.push(`${String(next.title).toLowerCase()} · ${U.fmtMinutes(next.minutesUntil)}`);
          if (wx && wx.actionable) parts.push(String(wx.actionable).toLowerCase());
          if (parts.length) {
            text(ctx, parts.join("     "), cx, cy + 0.068 * H, { px: 0.022 * H, weight: 300, color: C.jade, glow: 4 * S, core: 0.85 },
              "center", 1, wa * (next && next.minutesUntil < 30 ? 0.42 : 0.3));
          }
          // a critical headline whispers once, faintly, in cabin-flare amber
          const nw = Sg.news;
          if (nw && nw.critical && nw.headline) {
            const wo = { px: 0.02 * H, weight: 300, color: C.flare, glow: 4 * S, core: 0.85 };
            text(ctx, wrap2(nw.headline, wo, 0.36 * W, false)[0], cx, cy + (parts.length ? 0.102 : 0.068) * H, wo, "center", 1,
              wa * 0.36 * (0.8 + 0.2 * Math.sin(t * TAU / 3.2)));
          }
        }
      }
      dimEnd(out, ctx, dimK);
      ctx = out;
      ctx.globalAlpha = 1;
      // closed-loop exposure: the day scene is dimmed (never brightened) until the wall sits inside the day
      // budget, 25 + 20 * day (rule 2), with a margin. Measured now and then at the start of the next frame
      // (on this finished one), so the readback does not wait on half-drawn GPU work
      EXPO.want = G && b > 0.3 ? { day, G, moving: b < 0.999 } : null;
      if (!G) EXPO.k = 1;
      sfx(f, t, skyA, canoeA, dusk);
    },
  });
})();
