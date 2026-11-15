// Ambient Wall - CYBERPUNK theme.
// Work: a corporate command-post HUD (Arasaka). Thin amber linework floating on black, red frame,
//       yellow highlights, a monospace hero clock with faint scanlines and a red/yellow chromatic
//       offset. Precision micro-detail (sub-ticks, reticles, serial readouts) at whisper alpha.
//       Everything holds still and reports. Deliberately warm: overrides the cool-work rule.
// Ambient: Night City. A dense megacity in three depths over a black water plane: a far wall of
//       megatowers, segmented megabuildings with skybridges, and megastructures framing both sides with
//       external elevators. At the centre the corp megatower (original design: red edge lines, a lit
//       crown, an abstract glyph) carries the clock as a projected hologram. A giant holo koi swims
//       between the towers; holo billboards cycle their ads and glitch; neon tubes buzz; AVs run the
//       sky lanes with light trails; a monorail, searchlights in the smog, steam from vents. The city
//       never sleeps: over the evening the ads cycle, traffic thickens and the smog builds.
//       Hosts are beacons on the tower's crown; a host down is a red glitching warning hologram.
// Weather is real: a deck lit magenta-orange from below, fog swallowing the far city and blooming the
//       neon, rain rippling the water's reflection, dim lightning inside the deck, snow on the roofs.
// The exhale: every element interpolates on frame.blend. HUD drifts apart and fades, the hard orange
// amber softens to a holo yellow, the city rises out of the dark.
(function () {
  const U = AW.util;
  const MONO = 'ui-monospace, "DejaVu Sans Mono", "Cascadia Mono", Consolas, monospace';

  const C = {
    hud: U.hex("#f0962c"),       // work primary: hard orange-amber
    gold: U.hex("#d8bc38"),      // work highlight: countdowns, calm money, the sun
    orange: U.hex("#d86220"),    // finance drift
    amber: U.hex("#e0a040"),
    amberSoft: U.hex("#d08a3a"),
    red: U.hex("#d82428"),       // Arasaka red: frame, chroma split, alarms
    blueDeep: U.hex("#1a2a78"),
    holoYellow: U.hex("#e8d040"),  // the ambient clock: Night City yellow
    snow: U.hex("#a4b6e0"),      // flakes and roof dusting: blue-white, never white
    bolt: U.hex("#8088d4"),      // lightning inside the deck: dim violet-blue
    cyanDim: U.hex("#2296aa"),   // the radio HUD's artist line
  };
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const NODASH = [];

  let W = 0, H = 0, DPR = 1, S = 1;

  // ------------------------------------------------------------------ offscreen helpers
  function mk(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w * DPR));
    c.height = Math.max(1, Math.ceil(h * DPR));
    const x = c.getContext("2d");
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { c, x, w, h };
  }
  let measure = null;

  // Text sprites: glow is rendered once per (text, size, colour), then blitted. No per-frame shadowBlur.
  const sprites = new Map();
  function sprite(text, px, col, glow, track) {
    const key = text + "|" + px + "|" + (col.r | 0) + "," + (col.g | 0) + "," + (col.b | 0) + "|" + glow + "|" + track;
    let sp = sprites.get(key);
    if (sp) return sp;
    if (sprites.size > 160) sprites.clear();
    const font = `${px}px ${MONO}`;
    measure.font = font;
    measure.letterSpacing = track + "px";
    const tw = Math.max(1, measure.measureText(text).width - track);
    const pad = Math.ceil(glow * 2 + 4);
    sp = mk(tw + pad * 2, px * 1.5 + pad * 2);
    const x = sp.x, c = U.safe(col);
    x.font = font; x.letterSpacing = track + "px"; x.textBaseline = "middle"; x.textAlign = "left";
    if (glow > 0) {
      x.shadowColor = U.rgba(c, 0.9); x.shadowBlur = glow * DPR;
      x.fillStyle = U.rgba(c, 0.5); x.fillText(text, pad, sp.h / 2);
      x.shadowBlur = 0;
    }
    x.fillStyle = U.rgba(c, 0.95); x.fillText(text, pad, sp.h / 2);
    sp.tw = tw; sp.pad = pad;
    sprites.set(key, sp);
    return sp;
  }
  // align: 0 left, 1 center, 2 right
  function txt(ctx, text, x, y, px, col, alpha, align, glow, track) {
    if (alpha <= 0.004 || !text) return 0;
    const sp = sprite(text, Math.round(px), col, glow || 0, track || 0);
    const ax = align === 1 ? x - sp.pad - sp.tw / 2 : align === 2 ? x - sp.pad - sp.tw : x - sp.pad;
    ctx.globalAlpha = U.clamp(alpha);
    ctx.drawImage(sp.c, ax, y - sp.h / 2, sp.w, sp.h);
    return sp.tw;
  }

  // Soft round glow dots (radial gradient baked once per colour).
  const dots = new Map();
  function dot(col) {
    const key = (col.r | 0) + "," + (col.g | 0) + "," + (col.b | 0);
    let d = dots.get(key);
    if (d) return d;
    if (dots.size > 40) dots.clear();
    d = mk(64, 64);
    const c = U.safe(col);
    const g = d.x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, U.rgba(c, 0.55));
    g.addColorStop(0.25, U.rgba(c, 0.22));
    g.addColorStop(0.6, U.rgba(c, 0.06));
    g.addColorStop(1, U.rgba(c, 0));
    d.x.fillStyle = g; d.x.fillRect(0, 0, 64, 64);
    dots.set(key, d);
    return d;
  }
  function glowDot(ctx, col, x, y, r, a) {
    if (a <= 0.004) return;
    ctx.globalAlpha = U.clamp(a);
    ctx.drawImage(dot(col).c, x - r, y - r, r * 2, r * 2);
  }

  const qz = (v, n) => Math.round(v * n) / n;

  // Exhale ramp: hard HUD orange -> soft sodium honey. Stays on the warm side the whole way so the
  // transition never brushes the alarm red. Precomputed (no per-frame allocation).
  const RAMP_N = 64, RAMP = [];
  for (let i = 0; i <= RAMP_N; i++) RAMP.push(U.safe(U.mix(C.hud, C.amber, U.smoothstep(0, 1, i / RAMP_N))));
  const warm = (t) => RAMP[Math.round(U.clamp(t) * RAMP_N)];
  const fade = (b, a0, a1) => 1 - U.smoothstep(a0, a1, b);
  const pad2 = (n) => (n < 10 ? "0" : "") + n;
  const agoHud = (d, now) => {
    const m = (now - d) / 60000;
    if (m < 60) return Math.max(1, Math.round(m)) + " MIN AGO";
    if (m < 72 * 60) return Math.round(m / 60) + " H AGO";
    return Math.round(m / 1440) + " D AGO";
  };
  const hhmm = (d) => pad2(d.getHours()) + ":" + pad2(d.getMinutes());

  // css colour strings used in hot loops, computed once
  const CSS = {
    snowNear: U.rgba(U.safe(C.snow), 1), snowFar: U.rgba(U.safe(U.scale(C.snow, 0.72)), 1),
    rainFar: "rgb(60,70,150)", rainNear: "rgb(86,96,176)",
  };

  // ------------------------------------------------------------------ clock
  let clk = null, clkKey = "", clkPx = 0, clkPad = 0, clkTw = 0;
  function buildClockCanvas() {
    clkPx = Math.round(H * 0.27);
    measure.font = `${clkPx}px ${MONO}`; measure.letterSpacing = "0px";
    clkTw = measure.measureText("00:00").width;
    clkPad = Math.round(clkPx * 0.32);
    clk = mk(clkTw + clkPad * 2, clkPx * 1.25 + clkPad * 2);
    clkKey = "";
  }
  const warmRamp = (t) => RAMP[Math.round(U.clamp(t) * RAMP_N)];
  function clockSprite(text, warm) {
    const key = text + "|" + warm;
    if (key === clkKey) return clk;
    clkKey = key;
    const x = clk.x, w = clk.w, h = clk.h, cx = w / 2, cy = h / 2 + clkPx * 0.04;
    const work = 1 - warm;
    // ambient: the clock becomes a hologram in Night City yellow, split red/cyan at its edges
    const col = U.safe(U.mix(warmRamp(warm), C.holoYellow, U.smoothstep(0.4, 1, warm)));
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    x.clearRect(0, 0, w, h);
    x.font = `${clkPx}px ${MONO}`; x.textAlign = "center"; x.textBaseline = "middle";
    x.globalCompositeOperation = "source-over";
    x.globalAlpha = 1;
    // hairline chromatic offset: red bleeds left, yellow right (work); red left, cyan right (holo)
    {
      const off = U.lerp(3.2, 5, warm) * S;
      x.fillStyle = U.rgba(U.safe(C.red), U.lerp(0.3, 0.32, warm)); x.fillText(text, cx - off, cy);
      if (work > 0.02) { x.fillStyle = U.rgba(U.safe(C.gold), 0.2 * work); x.fillText(text, cx + off, cy + 0.6 * S); }
      if (warm > 0.02) { x.fillStyle = U.rgba(U.safe(U.hex("#2ac8e0")), 0.3 * warm); x.fillText(text, cx + off, cy); }
    }
    const g = U.lerp(16, 34, warm) * S * DPR;
    x.shadowColor = U.rgba(col, 0.9);
    x.shadowBlur = g * 2; x.fillStyle = U.rgba(col, U.lerp(0.18, 0.22, warm)); x.fillText(text, cx, cy);
    x.shadowBlur = g; x.fillStyle = U.rgba(col, U.lerp(0.38, 0.32, warm)); x.fillText(text, cx, cy);
    x.shadowBlur = g * 0.22; x.fillStyle = U.rgba(col, U.lerp(0.86, 0.66, warm)); x.fillText(text, cx, cy);
    x.shadowBlur = 0;
    // scanlines carved out of the glyphs: coarse in work, finer and lighter as a hologram
    {
      x.globalCompositeOperation = "destination-out";
      x.fillStyle = `rgba(0,0,0,${U.lerp(0.42, 0.34, warm)})`;
      const step = Math.max(3, Math.round(U.lerp(4, 3, warm) * S)), lh = Math.max(1, U.lerp(1.4, 1, warm) * S);
      for (let y = 0; y < h; y += step) x.fillRect(0, y, w, lh);
      x.globalCompositeOperation = "source-over";
    }
    return clk;
  }

  // ------------------------------------------------------------------ weather (eased state)
  // The ambient city shows what is actually happening outside. Each condition has a weight that eases
  // toward the live one (time constant ~1.4 s: a change settles over a few seconds, never snaps).
  // Everything the scene needs is derived from the weights once per frame. null weather = clear.
  const WX_IDX = { clear: 0, cloudy: 1, fog: 2, rain: 3, storm: 4, snow: 5 };
  const wxW = new Float32Array(6);
  const wxs = { init: false, I: 0, wind: 0, cloud: 0, full: 0, stars: 1, sun: 1, fog: 0, rain: 0, snow: 0,
    dust: 0, wet: 0, storm: 0, slant: 0.05, drift: 0, speed: 1 };
  function updateWeather(s, dt) {
    const ci = s && WX_IDX[s.condition] != null ? WX_IDX[s.condition] : 0;
    const ti = s && s.intensity != null ? U.clamp(+s.intensity || 0) : 0;
    const tw = s && s.windKph != null ? Math.max(0, +s.windKph || 0) : 0;
    const k = wxs.init ? 1 - Math.exp(-Math.min(dt, 0.1) / 1.4) : 1;
    wxs.init = true;
    for (let i = 0; i < 6; i++) wxW[i] += ((i === ci ? 1 : 0) - wxW[i]) * k;
    wxs.I += (ti - wxs.I) * k; wxs.wind += (tw - wxs.wind) * k;
    const I = wxs.I, cl = wxW[1], fg = wxW[2], rn = wxW[3], st = wxW[4], sn = wxW[5];
    wxs.cloud = U.clamp(cl * I + fg * 0.5 + rn * (0.55 + 0.45 * I) + st + sn * (0.6 + 0.3 * I));
    wxs.full = U.clamp(cl * U.smoothstep(0.3, 0.85, I) + fg + rn + st + sn);   // broken bands -> a closed deck
    wxs.stars = 1 - U.clamp(wxs.cloud * 1.1 + fg * 0.5);
    wxs.sun = 1 - 0.75 * U.clamp(wxs.cloud + fg * 0.5);
    wxs.fog = fg * (0.55 + 0.45 * I);
    wxs.rain = rn * (0.03 + 0.97 * Math.pow(I, 1.6)) + st * (0.85 + 0.15 * I);   // drizzle barely there
    wxs.snow = sn * (0.25 + 0.75 * I);
    wxs.dust = sn * (0.5 + 0.5 * I);
    wxs.wet = U.clamp(rn * (0.35 + 0.65 * I) + st);
    wxs.storm = st;
    wxs.speed = 1 + 0.35 * st;
    wxs.slant = U.clamp(0.03 + wxs.wind * 0.012, 0.03, 0.6);
    wxs.drift = (wxs.drift + Math.min(dt, 0.1) * (5 + wxs.wind * 0.7) * S) % 1e6;
  }

  // Lightning: rare, dim, deterministic in real time. Returns 0..1; ltX is where it is. Each strike has its own
  // distance (strikeNear: 1 = close): the far ones flash dimmer, and their thunder (soundCues) comes later.
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const LT_P = 13;
  const strikeAt = (k) => (hash(k) > 0.55 ? -1 : k * LT_P + 1 + hash(k + 0.31) * (LT_P - 3));   // -1: no strike in block k
  const strikeNear = (k) => hash(k + 6.6);
  let ltX = 0.5;
  function lightning(t) {
    const P = LT_P, k = Math.floor(t / P), ph = t - k * P;
    if (hash(k) > 0.55) return 0;
    const t0 = 1 + hash(k + 0.31) * (P - 3);
    if (ph < t0 || ph > t0 + 1) return 0;
    ltX = 0.12 + 0.76 * hash(k + 0.77);
    let v = 0;
    for (let j = 0; j < 3; j++) {
      const tj = t0 + j * (0.11 + 0.08 * hash(k + j * 1.9));
      if (ph >= tj) v += (j === 1 ? 0.5 : j === 2 ? 0.85 * hash(k + 4.4) : 1) * Math.exp(-(ph - tj) / 0.07);
    }
    return U.clamp(v) * (0.5 + 0.5 * strikeNear(k));
  }

  // Cloud textures: one small seamless (in x) noise field, baked into a few tinted canvases.
  // Size-independent, built once. Stretched over the sky they read as soft horizontal bands
  // (they are meant to be soft: no strokes live in them).
  const CT_W = 384, CT_H = 128;
  let cloudSp = null, cloudFu = null, cloudLit = null, fogTex = null, ltC = null, ltX2d = null, blobC = null;
  function texCanvas(dens, col, amax, litFn) {
    const c = document.createElement("canvas"); c.width = CT_W; c.height = CT_H;
    const x = c.getContext("2d"), img = x.createImageData(CT_W, CT_H), p = img.data;
    for (let j = 0; j < CT_H; j++) {
      for (let i = 0; i < CT_W; i++) {
        const n = j * CT_W + i, q = n * 4;
        const cc = litFn ? litFn(i, j) : col;
        p[q] = cc.r; p[q + 1] = cc.g; p[q + 2] = cc.b; p[q + 3] = Math.round(255 * amax * dens[n]);
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  function buildClouds() {
    if (cloudSp) return;
    const N = CT_W * CT_H, sp = new Float32Array(N), fu = new Float32Array(N);
    for (let j = 0; j < CT_H; j++) {
      const v = j / (CT_H - 1);
      const env = U.smoothstep(0, 0.3, v) * U.smoothstep(1, 0.7, v);
      for (let i = 0; i < CT_W; i++) {
        const u = i / CT_W;
        // tiles seamlessly: blend the field with itself one period over
        const n = U.lerp(U.fbm2(u * 2.6 + 11, v * 5.5 + 3, 4), U.fbm2((u - 1) * 2.6 + 11, v * 5.5 + 3, 4), u);
        sp[j * CT_W + i] = U.smoothstep(0.06, 0.3, n) * env;
        fu[j * CT_W + i] = (0.35 + 0.65 * U.smoothstep(-0.28, 0.18, n)) * env;
      }
    }
    cloudDens = { sp, fu };   // the day sky re-tints the same fields (see bakeDayClouds)
    // lit from below by the city: the underside and the lower deck glow magenta-orange, tops stay violet-teal
    const deep = U.safe(U.mix(NC.violet, NC.teal, 0.4)), sod = U.safe(U.mix(NC.smogHot, NC.smogOrange, 0.4));
    const lit = (dens) => {
      const tmp = { r: 0, g: 0, b: 0 };
      return (i, j) => {
        const v = j / (CT_H - 1), d = dens[j * CT_W + i], below = j + 3 < CT_H ? dens[(j + 3) * CT_W + i] : 0;
        const k = U.clamp(0.12 + 0.5 * v * v + 1.5 * Math.max(0, d - below));
        tmp.r = U.lerp(deep.r, sod.r, k) | 0; tmp.g = U.lerp(deep.g, sod.g, k) | 0; tmp.b = U.lerp(deep.b, sod.b, k) | 0;
        return tmp;
      };
    };
    cloudSp = texCanvas(sp, null, 0.12, lit(sp));
    cloudFu = texCanvas(fu, null, 0.1, lit(fu));
    cloudLit = texCanvas(fu, U.safe(C.bolt), 0.26);
    fogTex = texCanvas(fu, U.safe(U.mix(NC.violet, NC.smogHot, 0.45)), 0.07);
    ltC = document.createElement("canvas"); ltC.width = CT_W; ltC.height = CT_H; ltX2d = ltC.getContext("2d");
    blobC = document.createElement("canvas"); blobC.width = blobC.height = 64;
    const bx = blobC.getContext("2d"), bg = bx.createRadialGradient(32, 32, 0, 32, 32, 32);
    bg.addColorStop(0, "rgba(0,0,0,1)"); bg.addColorStop(0.5, "rgba(0,0,0,0.45)"); bg.addColorStop(1, "rgba(0,0,0,0)");
    bx.fillStyle = bg; bx.fillRect(0, 0, 64, 64);
  }
  // draw a seamless texture across the width, scrolled by `off`
  function drawTex(ctx, tex, off, y, h, a) {
    if (a <= 0.004) return;
    const o = ((off % W) + W) % W;
    ctx.globalAlpha = U.clamp(a);
    ctx.drawImage(tex, -o, y, W, h);
    ctx.drawImage(tex, W - o, y, W, h);
  }

  // ------------------------------------------------------------------ Night City: palette
  // Hot magenta, electric cyan, acid yellow and Arasaka red over a deep teal/violet smog base. Every
  // colour passes U.safe; glow comes from soft halos, never from bright fills.
  const NC = {
    magenta: U.hex("#e0389c"), cyan: U.hex("#2ac8e0"), yellow: U.hex("#e8d040"), red: C.red,
    violet: U.hex("#3a1c70"), teal: U.hex("#0e5262"), smogHot: U.hex("#d04a78"), smogOrange: U.hex("#d8743a"),
    rimFar: U.hex("#1c566c"), rimMid: U.hex("#2a7a98"), rimNear: U.hex("#5a48b8"), steam: U.hex("#7a5a88"),
    beam: U.hex("#7a86d4"),
  };
  const WIN_PAL = [U.hex("#d8a050"), U.hex("#40b8d0"), U.hex("#c84a9a"), U.hex("#d8c870"), U.hex("#3a9aa0"), U.hex("#e07a3a")];
  const WIN_CSS = WIN_PAL.map((c) => U.rgba(U.safe(c), 1));
  const NEON_CSS = [NC.magenta, NC.cyan, NC.yellow, C.red].map((c) => U.rgba(U.safe(c), 1));
  const NCC = {
    rimFar: U.rgba(U.safe(NC.rimFar), 1), rimMid: U.rgba(U.safe(NC.rimMid), 1), rimNear: U.rgba(U.safe(NC.rimNear), 1),
    red: U.rgba(U.safe(C.red), 1), cyan: U.rgba(U.safe(NC.cyan), 1), magenta: U.rgba(U.safe(NC.magenta), 1),
    yellow: U.rgba(U.safe(NC.yellow), 1), amber: U.rgba(U.safe(C.amber), 1), bolt: U.rgba(U.safe(C.bolt), 1),
  };

  // ------------------------------------------------------------------ Night City: the static city
  // Layers (baked once per size): far megacity (band), mid megabuildings + the corp tower, near framing
  // megastructures. Windows never go dark: the city never sleeps.
  let WL = 0, BY = 0, TCX = 0, trackY = 0;
  let farL = null, midL = null, nearL = null, starsL = null, sunL = null;
  let runsFar = null, runsMid = null, runsNear = null;
  let towerPath = null, midTops = null;
  let smogG = null, lowG = null;
  let beacons = [];      // corp tower crown points (the heartbeat hosts)
  let vents = [];        // [{x, y, ph}]
  let signs = [];        // neon: [{sp, x, y, seed, col, near}]
  let boards = [];       // holo billboards: [{x, y, w, h, ads: [sprite], per, ph, near}]
  let elevs = [];        // external elevators: [{x, y0, y1, per, ph}]
  let pylonX = null;
  let projKoi = null, projEmb = null, searchSrc = [];

  function mkLayer(top) { const L = mk(W, H - top); L.x.translate(0, -top); L.top = top; return L; }
  function layer(ctx, L, dy) { ctx.drawImage(L.c, 0, L.top + dy, W, H - L.top); }

  // A megabuilding: a stack of tiers, each narrower than the one below, slightly off-centre.
  function tiersFor(r, x0, w, base, h, nT, taper) {
    const tiers = [];
    let y1 = base, cx = x0 + w / 2, ww = w, rem = h;
    for (let k = 0; k < nT; k++) {
      const th = k === nT - 1 ? rem : rem * (0.3 + 0.35 * r());
      tiers.push({ x0: cx - ww / 2, x1: cx + ww / 2, y0: y1 - th, y1 });
      y1 -= th; rem -= th;
      ww *= 1 - taper * (0.4 + 0.6 * r());
      cx += (r() - 0.5) * ww * 0.22;
    }
    return tiers;
  }
  // Facade lighting, three styles: window grid, floor bands of light, vertical light strips.
  function facade(x, t, P, pal, style, rd) {
    const w = t.x1 - t.x0, k = P.k;
    if (style === 1) {
      for (let yy = t.y0 + P.sy; yy < t.y1 - 2 * S; yy += P.sy) {
        let xx = t.x0 + 2 * S;
        while (xx < t.x1 - 3 * S) {
          const len = Math.min(t.x1 - 2 * S - xx, (4 + rd() * 26) * S * k);
          if (rd() < P.lit) { x.globalAlpha = P.a0 + rd() * (P.a1 - P.a0); x.fillStyle = pal[rd() < 0.8 ? 0 : 1]; x.fillRect(xx, yy, len, Math.max(1, P.wh * 0.45)); }
          xx += len + (2 + rd() * 9) * S * k;
        }
      }
    } else {
      for (let yy = t.y0 + P.sy * 0.7; yy < t.y1 - P.wh; yy += P.sy) {
        for (let xx = t.x0 + P.sx * 0.5; xx + P.ww < t.x1 - 1 * S; xx += P.sx) {
          if (rd() < P.lit) { x.globalAlpha = P.a0 + rd() * (P.a1 - P.a0); x.fillStyle = pal[rd() < 0.75 ? 0 : 1]; x.fillRect(xx, yy, P.ww, P.wh); }
        }
      }
      if (style === 2 && w > 30 * S) {
        const n = 2 + ((rd() * 2) | 0);
        for (let j = 0; j < n; j++) {
          const sx = t.x0 + w * (j + 1) / (n + 1);
          x.globalAlpha = P.a1 * 0.8; x.fillStyle = pal[1];
          x.fillRect(sx, t.y0 + 4 * S, Math.max(1, 1.4 * S * k), t.y1 - t.y0 - 8 * S);
        }
      }
    }
  }
  // Paint one megabuilding: black mass, lit facade, ribbing, rim on its exposed edges, roof dressing.
  function paintMega(x, b, P, rd, runs) {
    const pal = b.pal;
    for (let i = 0; i < b.tiers.length; i++) {
      const t = b.tiers[i], w = t.x1 - t.x0;
      x.globalAlpha = 1; x.fillStyle = "#000"; x.fillRect(t.x0, t.y0, w, t.y1 - t.y0);
      facade(x, t, P, pal, b.style, rd);
      // exposed ribbing: hairline floor plates every few floors, a dark groove under each
      if (P.rib > 0) {
        x.globalAlpha = P.ribA; x.strokeStyle = P.rim; x.lineWidth = 1 * S;
        x.beginPath();
        for (let yy = t.y0 + P.rib; yy < t.y1 - 4 * S; yy += P.rib) { x.moveTo(t.x0 + 1 * S, yy); x.lineTo(t.x1 - 1 * S, yy); }
        x.stroke();
      }
      // fins: slender verticals near the edges of wide tiers
      if (P.fins && w > 60 * S) {
        x.globalAlpha = P.ribA * 1.3; x.strokeStyle = P.rim;
        x.beginPath(); x.moveTo(t.x0 + 5 * S, t.y0 + 3 * S); x.lineTo(t.x0 + 5 * S, t.y1); x.moveTo(t.x1 - 5 * S, t.y0 + 3 * S); x.lineTo(t.x1 - 5 * S, t.y1); x.stroke();
      }
      x.globalAlpha = P.rimA; x.strokeStyle = P.rim; x.lineWidth = P.lw;
      x.beginPath(); x.moveTo(t.x0 + 0.5, t.y1); x.lineTo(t.x0 + 0.5, t.y0 + 0.5); x.lineTo(t.x1 - 0.5, t.y0 + 0.5); x.lineTo(t.x1 - 0.5, t.y1); x.stroke();
      // neon trim: a tube run along the top of some tiers (glow baked once)
      if (P.trim && rd() < P.trim) {
        const tc = NEON_CSS[(rd() * NEON_CSS.length) | 0], ty = t.y0 + (3 + rd() * 10) * S;
        t.trim = ty;   // remembered for the day face (an unlit tube)
        x.save(); x.shadowColor = tc; x.shadowBlur = 6 * S * DPR;
        x.globalAlpha = 0.6; x.strokeStyle = tc; x.lineWidth = 1.4 * S;
        x.beginPath(); x.moveTo(t.x0 + 3 * S, ty); x.lineTo(t.x1 - 3 * S, ty); x.stroke();
        x.restore();
      }
      runs.push(t.x0, t.x1, t.y0);
    }
    // roof: masts with red aircraft lights, or a dish and an antenna cluster
    const top = b.tiers[b.tiers.length - 1], cx = (top.x0 + top.x1) / 2;
    const q = rd();
    x.globalAlpha = P.rimA; x.strokeStyle = P.rim; x.lineWidth = 1 * S;
    x.beginPath();
    b.roof = { q, mh: 0, two: false, ah: [] };   // remembered for the day face
    if (q < 0.45) {
      const mh = (14 + rd() * 40) * S * P.k;
      b.roof.mh = mh;
      x.moveTo(cx, top.y0); x.lineTo(cx, top.y0 - mh);
      if (rd() < 0.5) { b.roof.two = true; x.moveTo(cx - 6 * S, top.y0); x.lineTo(cx - 6 * S, top.y0 - mh * 0.5); }
      x.stroke();
      x.globalAlpha = 0.75; x.fillStyle = NCC.red; x.fillRect(cx - 1 * S, top.y0 - mh - 1 * S, 2 * S, 2 * S);
    } else if (q < 0.7) {
      for (let j = 0; j < 3; j++) { const ax = top.x0 + 6 * S + j * 4 * S, ah = (6 + rd() * 16) * S; b.roof.ah.push(ah); x.moveTo(ax, top.y0); x.lineTo(ax, top.y0 - ah); }
      x.moveTo(top.x1 - 8 * S, top.y0 - 6 * S); x.arc(top.x1 - 12 * S, top.y0 - 6 * S, 4 * S, 0, Math.PI, true);
      x.stroke();
    } else x.stroke();
  }
  // a skybridge between two towers: black deck, rim, a dashed strip of light
  function bridge(x, xa, xb, y, h, P, col) {
    x.globalAlpha = 1; x.fillStyle = "#000"; x.fillRect(xa, y, xb - xa, h);
    x.globalAlpha = P.rimA; x.strokeStyle = P.rim; x.lineWidth = 1 * S;
    x.beginPath(); x.moveTo(xa, y + 0.5); x.lineTo(xb, y + 0.5); x.moveTo(xa, y + h - 0.5); x.lineTo(xb, y + h - 0.5); x.stroke();
    x.globalAlpha = 0.45; x.fillStyle = col;
    for (let xx = xa + 3 * S; xx < xb - 5 * S; xx += 7 * S) x.fillRect(xx, y + h * 0.35, 4 * S, Math.max(1, h * 0.3));
  }

  // The corp megatower: a monolith at the centre, red accent lines up its edges, a lit crown and an
  // original abstract glyph. The clock is projected across its face.
  function paintTower(x) {
    const cx = TCX, pw = 0.108 * W, bw = 0.084 * W, uw = 0.07 * W;
    const y0 = H * 0.022, yCrown = H * 0.1, yShoulder = H * 0.165, yLedge = H * 0.44, yChamf = H * 0.4, yPod = H * 0.8;
    // silhouette (left half, mirrored): a podium, the shaft with a chamfered ledge, then a crown of two
    // blade fins flanking a stepped core and a needle spire
    const half = [
      [pw, WL], [pw, yPod], [bw, yPod - H * 0.02], [bw, yLedge], [uw, yChamf], [uw, yCrown - H * 0.03],
      [uw * 0.86, yCrown - H * 0.045], [uw * 0.74, yCrown], [uw * 0.46, yCrown], [uw * 0.46, H * 0.07],
      [uw * 0.22, H * 0.07], [uw * 0.22, H * 0.05], [uw * 0.05, H * 0.05], [uw * 0.02, y0],
    ];
    const p = new Path2D();
    for (let i = 0; i < half.length; i++) i ? p.lineTo(cx - half[i][0], half[i][1]) : p.moveTo(cx - half[i][0], half[i][1]);
    for (let i = half.length - 1; i >= 0; i--) p.lineTo(cx + half[i][0], half[i][1]);
    p.closePath();
    towerPath = p;
    x.globalAlpha = 1; x.fillStyle = "#000"; x.fill(p);
    // faint crown light: red to nothing, down from the crown
    x.save(); x.clip(p);
    let g = x.createLinearGradient(0, y0, 0, yShoulder + H * 0.06);
    g.addColorStop(0, U.rgba(U.safe(C.red), 0.11)); g.addColorStop(0.55, U.rgba(U.safe(C.red), 0.05)); g.addColorStop(1, U.rgba(C.red, 0));
    x.fillStyle = g; x.fillRect(cx - pw, y0, pw * 2, yShoulder + H * 0.06 - y0);
    // monolith detail: floor plates, heavier segment bands, two rib pairs and a seam, faint lit slits
    x.strokeStyle = NCC.rimMid; x.lineWidth = 1 * S;
    x.globalAlpha = 0.06; x.beginPath();
    for (let yy = yCrown + 20 * S; yy < WL; yy += 20 * S) { x.moveTo(cx - pw, yy); x.lineTo(cx + pw, yy); }
    x.stroke();
    x.globalAlpha = 0.16; x.beginPath();
    for (let yy = yCrown + 100 * S; yy < WL; yy += 100 * S) { x.moveTo(cx - pw, yy); x.lineTo(cx + pw, yy); x.moveTo(cx - pw, yy + 3 * S); x.lineTo(cx + pw, yy + 3 * S); }
    for (const k of [-0.62, -0.5, 0.5, 0.62]) { x.moveTo(cx + uw * k, yCrown); x.lineTo(cx + uw * k, WL); }
    x.moveTo(cx, yCrown); x.lineTo(cx, WL);
    x.stroke();
    x.globalAlpha = 0.16; x.fillStyle = NCC.amber;
    const r = U.rng(808);
    for (let yy = yShoulder + 40 * S; yy < WL - 20 * S; yy += 13 * S) {
      for (let k = -3; k <= 3; k++) { if (r() < 0.3) x.fillRect(cx + k * uw * 0.24 - 1 * S, yy, 2 * S, 5 * S); }
    }
    // podium: a wall of lit glass, the lobby
    x.globalAlpha = 0.22; x.fillStyle = NCC.amber;
    for (let yy = yPod + 10 * S; yy < WL - 6 * S; yy += 9 * S) x.fillRect(cx - pw + 6 * S, yy, pw * 2 - 12 * S, 1.2 * S);
    x.restore();
    // the lit crown band under the fins
    x.globalAlpha = 0.6; x.fillStyle = NCC.red;
    x.fillRect(cx - uw + 3 * S, yCrown + 6 * S, uw * 2 - 6 * S, 1.6 * S);
    x.globalAlpha = 0.3; x.fillRect(cx - uw + 3 * S, yCrown + 12 * S, uw * 2 - 6 * S, 1 * S);
    x.globalAlpha = 0.45; x.fillRect(cx - uw * 0.46 + 3 * S, H * 0.07 + 5 * S, uw * 0.92 - 6 * S, 1.2 * S);
    // red accent lines up every edge (soft glow baked once), and an inner pair up the shaft, fainter
    x.save();
    x.shadowColor = U.rgba(U.safe(C.red), 0.9); x.shadowBlur = 6 * S * DPR;
    x.globalAlpha = 0.8; x.strokeStyle = NCC.red; x.lineWidth = 1.6 * S; x.lineJoin = "miter";
    x.stroke(p);
    x.restore();
    x.globalAlpha = 0.28; x.strokeStyle = NCC.red; x.lineWidth = 1 * S;
    x.beginPath();
    for (const s of [-1, 1]) {
      x.moveTo(cx + s * (bw - 7 * S), yPod - H * 0.02); x.lineTo(cx + s * (bw - 7 * S), yLedge + 3 * S);
      x.lineTo(cx + s * (uw - 7 * S), yChamf + 3 * S); x.lineTo(cx + s * (uw - 7 * S), yCrown - H * 0.03);
    }
    x.stroke();
    // the glyph: an original mark (a hexagon, an inverted triangle, a bar), red, glowing
    const gy = H * 0.128, gr = H * 0.022;
    x.save();
    x.shadowColor = U.rgba(U.safe(C.red), 0.95); x.shadowBlur = 10 * S * DPR;
    x.globalAlpha = 0.85; x.strokeStyle = NCC.red; x.lineWidth = 1.8 * S;
    x.beginPath();
    for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3, px = cx + Math.cos(a) * gr, py = gy + Math.sin(a) * gr; k ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.moveTo(cx - gr * 0.55, gy - gr * 0.32); x.lineTo(cx + gr * 0.55, gy - gr * 0.32); x.lineTo(cx, gy + gr * 0.62); x.closePath();
    x.moveTo(cx - gr * 1.45, gy); x.lineTo(cx - gr * 1.1, gy); x.moveTo(cx + gr * 1.1, gy); x.lineTo(cx + gr * 1.45, gy);
    x.stroke();
    x.restore();
    // projectors on the ledge (they throw the clock up the face)
    x.globalAlpha = 0.6; x.fillStyle = NCC.cyan;
    x.fillRect(cx - bw * 0.62 - 3 * S, yLedge - 3 * S, 6 * S, 2 * S); x.fillRect(cx + bw * 0.62 - 3 * S, yLedge - 3 * S, 6 * S, 2 * S);
    beacons = [{ x: cx - uw, y: yCrown - H * 0.03 }, { x: cx + uw, y: yCrown - H * 0.03 }, { x: cx - uw * 0.46, y: H * 0.07 }, { x: cx + uw * 0.46, y: H * 0.07 }, { x: cx, y: y0 }];
    searchSrc = [{ x: cx - uw * 0.86, y: yCrown - H * 0.04, a: -0.5, ph: 0 }, { x: cx + uw * 0.86, y: yCrown - H * 0.04, a: 0.5, ph: 2.1 }];
  }

  // ---- neon signs: tube lettering, vertical kanji/katakana stacks or Latin words, glow baked once
  function makeSign(str, vertical, col, px, blade) {
    const c = U.safe(col), n = vertical ? [...str].length : 1;
    measure.font = `${px}px ${MONO}`; measure.letterSpacing = "0px";
    const tw = vertical ? px * 1.05 : measure.measureText(str).width;
    const pad = Math.ceil(10 * S), bw = tw + 10 * S, bh = vertical ? n * px * 1.12 + 10 * S : px * 1.5;
    // blade: +1 = wall on the left (the arm reaches back to it), -1 = wall on the right
    const sp = mk(bw + pad * 2 + (blade ? 8 * S : 0), bh + pad * 2), x = sp.x, ox = pad + (blade > 0 ? 8 * S : 0);
    x.fillStyle = "rgba(0,0,0,0.85)"; x.fillRect(ox, pad, bw, bh);
    if (blade) {                                   // the arm that holds it off the wall
      const a0 = blade > 0 ? pad : ox + bw, a1 = a0 + 8 * S;
      x.strokeStyle = U.rgba(c, 0.35); x.lineWidth = 1 * S;
      x.beginPath(); x.moveTo(a0, pad + 4 * S); x.lineTo(a1, pad + 4 * S); x.moveTo(a0, pad + bh - 4 * S); x.lineTo(a1, pad + bh - 4 * S); x.stroke();
    }
    x.strokeStyle = U.rgba(c, 0.5); x.lineWidth = 1 * S; x.strokeRect(ox + 0.5 * S, pad + 0.5 * S, bw - 1 * S, bh - 1 * S);
    x.font = `${px}px ${MONO}`; x.textAlign = "center"; x.textBaseline = "middle";
    x.shadowColor = U.rgba(c, 0.95); x.shadowBlur = 7 * S * DPR;
    x.fillStyle = U.rgba(c, 0.9);
    if (vertical) { const ch = [...str]; for (let i = 0; i < ch.length; i++) x.fillText(ch[i], ox + bw / 2, pad + 5 * S + px * 1.12 * (i + 0.5)); }
    else x.fillText(str, ox + bw / 2, pad + bh / 2);
    x.shadowBlur = 0;
    sp.cx = ox + bw / 2; sp.cy = pad + bh / 2; sp.pad = pad;
    return sp;
  }

  // ---- holo billboard ads: original content, scanlined, with a red/cyan chromatic edge split baked in
  const scanCache = { c: null, k: "" };
  function scanlines(x, w, h) {
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = "destination-out"; x.fillStyle = "rgba(0,0,0,0.55)";
    const step = Math.max(3, Math.round(3 * DPR));
    for (let y = 0; y < h * DPR; y += step) x.fillRect(0, y, w * DPR, Math.max(1, Math.round(DPR)));
    x.restore();
  }
  function adContent(x, kind, w, h, c, ox, a) {
    const m = Math.min(w, h);
    x.globalAlpha = a; x.fillStyle = U.rgba(c, 1); x.strokeStyle = U.rgba(c, 1);
    x.textAlign = "center"; x.textBaseline = "middle";
    if (kind === 0) {
      x.font = `${Math.round(m * 0.62)}px ${MONO}`; x.fillText("夢", w / 2 + ox, h * 0.42);
      x.font = `${Math.round(m * 0.1)}px ${MONO}`; x.fillText("DREAMS ON TAP", w / 2 + ox, h * 0.84);
    } else if (kind === 1) {
      const ch = ["ラ", "ー", "メ", "ン"], px = Math.round(Math.min(w * 0.5, h / 6));
      x.font = `${px}px ${MONO}`;
      for (let i = 0; i < 4; i++) x.fillText(ch[i], w / 2 + ox, h * 0.14 + i * px * 1.1);
      x.font = `${Math.round(px * 0.7)}px ${MONO}`; x.fillText("24H", w / 2 + ox, h * 0.88);
    } else if (kind === 2) {
      const ex = w / 2 + ox, ey = h * 0.42, er = m * 0.32;
      x.lineWidth = 2 * S; x.beginPath();
      x.moveTo(ex - er, ey); x.quadraticCurveTo(ex, ey - er * 0.9, ex + er, ey); x.quadraticCurveTo(ex, ey + er * 0.9, ex - er, ey);
      x.moveTo(ex + er * 0.36, ey); x.arc(ex, ey, er * 0.36, 0, U.TAU); x.stroke();
      x.beginPath(); x.arc(ex, ey, er * 0.14, 0, U.TAU); x.fill();
      x.font = `${Math.round(m * 0.13)}px ${MONO}`; x.fillText("OPTIC+", ex, h * 0.82);
    } else if (kind === 3) {
      x.font = `bold ${Math.round(m * 0.2)}px ${MONO}`; x.fillText("NEO", w / 2 + ox, h * 0.3); x.fillText("SYNTH", w / 2 + ox, h * 0.52);
      x.lineWidth = 2 * S; x.beginPath(); x.moveTo(w * 0.3 + ox, h * 0.68); x.lineTo(w * 0.7 + ox, h * 0.68); x.lineTo(w * 0.5 + ox, h * 0.86); x.closePath(); x.stroke();
    } else {
      const mx = w / 2 + ox, my = h * 0.4, rw = m * 0.28, rh = m * 0.36;
      x.lineWidth = 2 * S; x.beginPath(); x.ellipse(mx, my, rw, rh, 0, 0, U.TAU); x.stroke();
      x.beginPath(); x.moveTo(mx - rw * 0.7, my - rh * 0.15); x.lineTo(mx - rw * 0.15, my + rh * 0.02);
      x.moveTo(mx + rw * 0.7, my - rh * 0.15); x.lineTo(mx + rw * 0.15, my + rh * 0.02); x.stroke();
      x.font = `${Math.round(m * 0.15)}px ${MONO}`; x.fillText("KAGE", mx, h * 0.86);
    }
  }
  const AD_COL = [NC.magenta, NC.yellow, NC.cyan, C.red, NC.cyan];
  function makeAd(kind, w, h) {
    const sp = mk(w, h), x = sp.x, c = U.safe(AD_COL[kind]);
    x.fillStyle = U.rgba(c, 0.07); x.fillRect(0, 0, w, h);
    x.strokeStyle = U.rgba(c, 0.55); x.lineWidth = 1 * S; x.strokeRect(0.5 * S, 0.5 * S, w - 1 * S, h - 1 * S);
    // chromatic split: red ghost left, cyan ghost right, then the core with a baked glow
    adContent(x, kind, w, h, U.safe(C.red), -2.5 * S, 0.35);
    adContent(x, kind, w, h, U.safe(NC.cyan), 2.5 * S, 0.35);
    x.shadowColor = U.rgba(c, 0.9); x.shadowBlur = 8 * S * DPR;
    adContent(x, kind, w, h, c, 0, 0.85);
    x.shadowBlur = 0; x.globalAlpha = 1;
    scanlines(x, w, h);
    return sp;
  }

  function buildCity() {
    const r = U.rng(2077), rd = U.rng(1337);
    WL = Math.round(H * 0.9); BY = Math.floor(H * 0.12); TCX = W * 0.5; trackY = H * 0.75;
    const rf = [], rm = [], rn = [];
    signs = []; boards = []; elevs = []; vents = [];
    bldFar = []; bldMid = []; bldNear = []; bridgeRec = []; shaftRec = []; dayBuilt = false;
    const pal2 = () => { const a = (rd() * WIN_CSS.length) | 0; return [WIN_CSS[a], WIN_CSS[(a + 1 + ((rd() * 3) | 0)) % WIN_CSS.length]]; };

    // far: a dense wall of thin megatowers, dim teal rims, pinprick windows
    farL = mkLayer(BY);
    const PF = { rim: NCC.rimFar, rimA: 0.6, lw: 1 * S, k: 0.6, sx: 5 * S, sy: 6 * S, ww: 1.3 * S, wh: 1.6 * S, lit: 0.2, a0: 0.1, a1: 0.32, rib: 0, ribA: 0, fins: false };
    for (let x = -10 * S; x < W + 10 * S;) {
      const w = (16 + r() * 40) * S;
      const u = x / W, env = 0.7 + 0.45 * Math.exp(-Math.pow((u - 0.5) / 0.28, 2));
      const h = H * (0.18 + 0.42 * Math.pow(r(), 1.4)) * env;
      const b = { tiers: tiersFor(r, x, w, WL, h, 1 + ((r() * 2) | 0), 0.3), pal: pal2(), style: (rd() * 3) | 0 };
      bldFar.push(b);
      paintMega(farL.x, b, PF, rd, rf);
      x += w + r() * 5 * S;
    }

    // mid: segmented megabuildings with gaps, skybridges, elevators; then the corp tower in front of them
    midL = mkLayer(0);
    const PM = { rim: NCC.rimMid, rimA: 0.55, lw: 1 * S, k: 0.85, sx: 8 * S, sy: 10 * S, ww: 2.4 * S, wh: 3 * S, lit: 0.34, a0: 0.12, a1: 0.42, rib: 30 * S, ribA: 0.14, fins: true, trim: 0.18 };
    const mids = [];
    for (let x = -30 * S; x < W + 30 * S;) {
      const w = (64 + r() * 110) * S;
      const u = (x + w / 2) / W, env = 0.75 + 0.35 * Math.exp(-Math.pow((u - 0.5) / 0.2, 2));
      const h = H * (0.26 + 0.36 * Math.pow(r(), 1.2)) * env;
      const b = { tiers: tiersFor(r, x, w, WL, h, 2 + ((r() * 3) | 0), 0.24), pal: pal2(), style: (rd() * 3) | 0 };
      mids.push(b);
      x += w + (8 + r() * 56) * S;
    }
    for (const b of mids) paintMega(midL.x, b, PM, rd, rm);
    bldMid = mids;
    for (let i = 0; i + 1 < mids.length; i++) {
      const a = mids[i], c = mids[i + 1], xa = a.tiers[0].x1, xb = c.tiers[0].x0;
      if (xb - xa < 6 * S || xb - xa > 70 * S) continue;
      const top = Math.max(a.tiers[0].y0, c.tiers[0].y0);
      for (let k = 0; k < 1 + ((rd() * 2) | 0); k++) {
        const by = top + (0.15 + 0.6 * rd()) * (WL - top) * 0.7;
        bridgeRec.push(xa, xb, by);
        bridge(midL.x, xa, xb, by, 6 * S, PM, a.pal[0]);
      }
    }
    // the elevated monorail line, in front of the mid city and the tower base
    const np = Math.ceil(W / (110 * S)) + 1;
    pylonX = new Float32Array(np);
    for (let i = 0; i < np; i++) pylonX[i] = i * 110 * S + 30 * S;
    paintTower(midL.x);
    const mx = midL.x;
    mx.globalAlpha = 1; mx.fillStyle = "#000"; mx.fillRect(0, trackY, W, 5 * S);
    mx.globalAlpha = 0.5; mx.strokeStyle = NCC.rimMid; mx.lineWidth = 1 * S;
    mx.beginPath(); mx.moveTo(0, trackY); mx.lineTo(W, trackY); mx.moveTo(0, trackY + 5 * S); mx.lineTo(W, trackY + 5 * S);
    for (let i = 0; i < np; i++) { mx.moveTo(pylonX[i] - 3 * S, trackY + 5 * S); mx.lineTo(pylonX[i] - 3 * S, WL); mx.moveTo(pylonX[i] + 3 * S, trackY + 5 * S); mx.lineTo(pylonX[i] + 3 * S, WL); }
    mx.stroke();
    for (let i = 0; i < np; i++) { mx.globalAlpha = 1; mx.fillStyle = "#000"; mx.fillRect(pylonX[i] - 3 * S, trackY + 5 * S, 6 * S, WL - trackY - 5 * S); }
    mx.globalAlpha = 0.5; mx.beginPath();
    for (let i = 0; i < np; i++) { mx.moveTo(pylonX[i] - 3 * S, trackY + 5 * S); mx.lineTo(pylonX[i] - 3 * S, WL); mx.moveTo(pylonX[i] + 3 * S, trackY + 5 * S); mx.lineTo(pylonX[i] + 3 * S, WL); }
    mx.stroke();
    // a mid tower top for each side: koi projector (left) and emblem projector (right)
    const lm = mids.filter((b) => (b.tiers[0].x0 + b.tiers[0].x1) / 2 > W * 0.22 && (b.tiers[0].x0 + b.tiers[0].x1) / 2 < W * 0.4);
    const rmB = mids.filter((b) => (b.tiers[0].x0 + b.tiers[0].x1) / 2 > W * 0.6 && (b.tiers[0].x0 + b.tiers[0].x1) / 2 < W * 0.78);
    const topOf = (b) => b.tiers[b.tiers.length - 1];
    const kb = lm.length ? lm[0] : null, eb = rmB.length ? rmB[rmB.length - 1] : null;
    projKoi = kb ? { x: (topOf(kb).x0 + topOf(kb).x1) / 2, y: topOf(kb).y0 } : { x: W * 0.3, y: H * 0.6 };
    projEmb = eb ? { x: (topOf(eb).x0 + topOf(eb).x1) / 2, y: topOf(eb).y0 } : { x: W * 0.7, y: H * 0.6 };
    if (projEmb.y < H * 0.5) projEmb.y = Math.max(projEmb.y, H * 0.5);
    searchSrc.push({ x: projKoi.x - 20 * S, y: projKoi.y, a: -0.35, ph: 4.2 }, { x: projEmb.x + 20 * S, y: projEmb.y, a: 0.3, ph: 1.3 });
    // mid neon: a few signs and one horizontal holo billboard
    for (const b of mids) {
      const t = b.tiers[0];
      if (t.x1 < 0 || t.x0 > W || Math.abs((t.x0 + t.x1) / 2 - TCX) < 0.09 * W || rd() < 0.35) continue;
      const vert = rd() < 0.65, str = vert ? ["ホテル", "薬", "電脳", "酒", "クラブ"][(rd() * 5) | 0] : ["BAR", "OPEN", "24/7", "CLINIC", "HOTEL"][(rd() * 5) | 0];
      const col = [NC.magenta, NC.cyan, NC.yellow, C.red][(rd() * 4) | 0];
      const sp = makeSign(str, vert, col, Math.round((vert ? 11 : 10) * S), false);
      signs.push({ sp, x: t.x0 + 6 * S + rd() * Math.max(1, t.x1 - t.x0 - sp.w), y: t.y0 + (0.15 + 0.5 * rd()) * (t.y1 - t.y0) - sp.h / 2, seed: rd() * 100, col, near: false });
      if (rd() < 0.3) vents.push({ x: (topOf(b).x0 + topOf(b).x1) / 2 + 10 * S, y: topOf(b).y0, ph: rd() });
    }
    if (eb) {
      const t = eb.tiers[0], bw = Math.min(0.11 * W, (t.x1 - t.x0) * 0.85), bh = bw * 0.55;
      boards.push({ x: (t.x0 + t.x1) / 2 - bw / 2, y: Math.max(t.y0 + 20 * S, trackY - bh - 40 * S), w: bw, h: bh, ads: [makeAd(3, bw, bh), makeAd(2, bw, bh), makeAd(0, bw, bh)], per: 23, ph: 7, near: false });
    }

    // near: megastructures framing both sides (off the top of the frame), low blocks between
    nearL = mkLayer(0);
    const PN = { rim: NCC.rimNear, rimA: 0.62, lw: 1.2 * S, k: 1, sx: 11 * S, sy: 14 * S, ww: 4 * S, wh: 5 * S, lit: 0.42, a0: 0.12, a1: 0.5, rib: 42 * S, ribA: 0.2, fins: true, trim: 0.4 };
    const nears = [];
    const side = (x0, x1, edgeRight) => {
      let x = x0;
      while (x1 - x > 30 * S) {
        const w = Math.min(x1 - x, (90 + r() * 120) * S);
        const tall = rd() < 0.6;
        const h = tall ? H * (1.05 + 0.2 * r()) : H * (0.45 + 0.3 * r());
        const b = { tiers: tiersFor(r, x, w, WL, h, tall ? 3 : 2, 0.16), pal: pal2(), style: (rd() * 3) | 0, edgeRight };
        nears.push(b);
        x += w - 6 * S;
      }
    };
    side(-0.03 * W, 0.215 * W, true);
    side(0.79 * W, 1.03 * W, false);
    const lows = [];
    for (let x = 0.2 * W; x < 0.82 * W;) {
      const w = (50 + r() * 90) * S, h = H * (0.035 + 0.075 * r());
      const b = { tiers: tiersFor(r, x, w, WL, h, 1, 0), pal: pal2(), style: 0 };
      lows.push(b); x += w + (10 + r() * 40) * S;
    }
    bldNear = nears.concat(lows);
    for (const b of bldNear) paintMega(nearL.x, b, PN, rd, rn);
    // external elevators on the framing towers, signs projecting off their inner edges, holo billboards
    const inner = (b) => (b.edgeRight ? b.tiers[0].x1 : b.tiers[0].x0);
    const leftIn = nears.filter((b) => b.edgeRight).sort((a, b) => inner(b) - inner(a))[0];
    const rightIn = nears.filter((b) => !b.edgeRight).sort((a, b) => inner(a) - inner(b))[0];
    for (const b of [leftIn, rightIn]) {
      if (!b) continue;
      const t = b.tiers[0], ex = b.edgeRight ? t.x1 - 14 * S : t.x0 + 14 * S, ytop = b.tiers[Math.min(1, b.tiers.length - 1)].y0 + 30 * S;
      const nx = nearL.x;
      nx.globalAlpha = 0.5; nx.strokeStyle = NCC.rimNear; nx.lineWidth = 1 * S;
      nx.beginPath(); nx.moveTo(ex - 4 * S, Math.max(ytop, 0)); nx.lineTo(ex - 4 * S, WL); nx.moveTo(ex + 4 * S, Math.max(ytop, 0)); nx.lineTo(ex + 4 * S, WL); nx.stroke();
      nx.globalAlpha = 1; nx.fillStyle = "#000"; nx.fillRect(ex - 3.5 * S, Math.max(ytop, 0), 7 * S, WL - Math.max(ytop, 0));
      shaftRec.push(ex, Math.max(ytop, 0));
      elevs.push({ x: ex, y0: Math.max(ytop, H * 0.08), y1: WL - 30 * S, per: 34 + rd() * 20, ph: rd() * 50 });
      // holo billboard high on the inner face
      const bw = Math.min(0.075 * W, (t.x1 - t.x0) * 0.6), bh = bw * 1.7;
      const bx = b.edgeRight ? t.x1 - bw - 26 * S : t.x0 + 26 * S;
      boards.push({ x: bx, y: H * (b.edgeRight ? 0.12 : 0.2), w: bw, h: bh,
        ads: b.edgeRight ? [makeAd(0, bw, bh), makeAd(1, bw, bh), makeAd(4, bw, bh)] : [makeAd(1, bw, bh), makeAd(4, bw, bh), makeAd(2, bw, bh)],
        per: b.edgeRight ? 19 : 27, ph: b.edgeRight ? 3 : 11, near: true });
      // one big vertical sign on each face, the city's name on the left
      {
        const big = makeSign(b.edgeRight ? "夜城" : "電脳街", true, b.edgeRight ? C.red : NC.magenta, Math.round(28 * S), 0);
        const bx = b.edgeRight ? t.x0 + (t.x1 - t.x0) * 0.3 : t.x1 - (t.x1 - t.x0) * 0.3 - big.w;
        signs.push({ sp: big, x: bx, y: H * (b.edgeRight ? 0.4 : 0.36), seed: rd() * 100, col: b.edgeRight ? C.red : NC.magenta, near: true });
      }
      // blade signs hanging off the inner edge
      const strs = b.edgeRight ? ["荒坂", "ネオン", "OPEN"] : ["夜市", "ラーメン", "BAR"];
      for (let k = 0; k < 3; k++) {
        const vert = k < 2, col = [[C.red, NC.magenta, NC.cyan], [NC.yellow, NC.magenta, NC.cyan]][b.edgeRight ? 0 : 1][k];
        const sp = makeSign(strs[k], vert, col, Math.round((vert ? 15 : 13) * S), vert ? (b.edgeRight ? 1 : -1) : 0);
        const y = H * (0.42 + 0.14 * k) + rd() * 20 * S;
        // blades hang off the inner edge, arm to the wall; flat signs sit on the facade
        const sx = vert ? (b.edgeRight ? t.x1 - 2 * S - sp.pad : t.x0 + 2 * S - sp.w + sp.pad) : (b.edgeRight ? t.x1 - sp.w - 16 * S : t.x0 + 16 * S);
        signs.push({ sp, x: sx, y, seed: rd() * 100, col, near: true });
      }
    }
    for (const b of lows) {
      const t = b.tiers[0];
      if (rd() < 0.5) vents.push({ x: t.x0 + (t.x1 - t.x0) * rd(), y: t.y0, ph: rd() });
      if (rd() < 0.55) {
        const str = ["屋台", "BAR", "麺", "24H", "PACHI"][(rd() * 5) | 0], vert = /^[^A-Z0-9]/.test(str);
        const col = [NC.magenta, NC.cyan, NC.yellow, C.red][(rd() * 4) | 0];
        const sp = makeSign(str, vert, col, Math.round(11 * S), false);
        signs.push({ sp, x: (t.x0 + t.x1) / 2 - sp.w / 2, y: t.y0 - sp.h + 8 * S, seed: rd() * 100, col, near: true });
      }
    }
    runsFar = new Float32Array(rf); runsMid = new Float32Array(rm); runsNear = new Float32Array(rn);
    // the mid skyline tops, for the storm's rim flash
    midTops = new Path2D();
    for (const b of mids) for (const t of b.tiers) { midTops.moveTo(t.x0, t.y1); midTops.lineTo(t.x0, t.y0); midTops.lineTo(t.x1, t.y0); midTops.lineTo(t.x1, t.y1); }

    // smog gradients (built once): between the far and mid city, and low over the water line
    smogG = measure.createLinearGradient(0, WL, 0, WL - H * 0.45);
    smogG.addColorStop(0, U.rgba(U.safe(NC.smogOrange), 0.1)); smogG.addColorStop(0.25, U.rgba(U.safe(NC.smogHot), 0.08));
    smogG.addColorStop(0.6, U.rgba(U.safe(NC.violet), 0.05)); smogG.addColorStop(1, U.rgba(NC.violet, 0));
    lowG = measure.createLinearGradient(0, WL, 0, WL - H * 0.16);
    lowG.addColorStop(0, U.rgba(U.safe(NC.smogHot), 0.09)); lowG.addColorStop(1, U.rgba(NC.smogHot, 0));

    // stars: light pollution leaves only a few
    starsL = mk(W, H * 0.5);
    for (let i = 0; i < 40; i++) {
      starsL.x.fillStyle = U.rgba(U.hex("#7088d0"), 0.08 + rd() * 0.2);
      starsL.x.fillRect(rd() * W, rd() * H * 0.45, 1 * S, 1 * S);
    }
    // sun bloom: a soft amber/rose radial, baked once
    sunL = mk(256, 256);
    const sg = sunL.x.createRadialGradient(128, 128, 0, 128, 128, 128);
    sg.addColorStop(0.0, "rgba(214,150,70,0.5)"); sg.addColorStop(0.08, "rgba(212,120,64,0.3)");
    sg.addColorStop(0.3, "rgba(170,60,90,0.07)"); sg.addColorStop(1.0, "rgba(60,20,70,0)");
    sunL.x.fillStyle = sg; sunL.x.fillRect(0, 0, 256, 256);
  }

  // ------------------------------------------------------------------ sky (cached by elevation, full res)
  let skyL = null, skyKey = "";
  function drawSky(elev) {
    const key = String(Math.round(elev * 2));
    if (key === skyKey) return;
    skyKey = key;
    const x = skyL.x, w = W, h = H;
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    x.clearRect(0, 0, w, h);
    const dusk = U.smoothstep(-13, -3, elev) * (1 - U.smoothstep(4, 14, elev));
    const day = U.smoothstep(4, 14, elev);
    const gy = WL;
    // the light-polluted smog: orange-magenta at the water line, violet above, deep teal high up
    let g = x.createLinearGradient(0, gy, 0, 0);
    g.addColorStop(0, U.rgba(U.safe(NC.smogOrange), 0.12));
    g.addColorStop(0.16, U.rgba(U.safe(NC.smogHot), 0.11));
    g.addColorStop(0.42, U.rgba(U.safe(NC.violet), 0.09));
    g.addColorStop(0.75, U.rgba(U.safe(NC.teal), 0.05));
    g.addColorStop(1, U.rgba(NC.teal, 0.02));
    x.fillStyle = g; x.fillRect(0, 0, w, gy);
    // the light dome: the city's glow pooled around the tower
    g = x.createRadialGradient(TCX, gy, 0, TCX, gy, w * 0.55);
    g.addColorStop(0, U.rgba(U.safe(NC.smogHot), 0.1)); g.addColorStop(0.5, U.rgba(U.safe(NC.violet), 0.05)); g.addColorStop(1, U.rgba(NC.violet, 0));
    x.fillStyle = g; x.fillRect(0, 0, w, gy);
    // day (weekend afternoons): a cold blue wash on top; dusk: an amber/rose bloom off to one side
    if (day > 0.01) {
      g = x.createLinearGradient(0, gy, 0, 0);
      g.addColorStop(0, U.rgba(U.hex("#2a4a8a"), 0.08 * day)); g.addColorStop(1, U.rgba(U.hex("#2a4a8a"), 0.02 * day));
      x.fillStyle = g; x.fillRect(0, 0, w, gy);
    }
    if (dusk > 0.01) {
      const cx = w * 0.78, rr = w * 0.5;
      g = x.createRadialGradient(cx, gy, 0, cx, gy, rr);
      g.addColorStop(0, U.rgba(U.hex("#e08a40"), 0.1 * dusk));
      g.addColorStop(0.35, U.rgba(U.hex("#c05a50"), 0.05 * dusk));
      g.addColorStop(1, U.rgba(U.hex("#6a2a60"), 0));
      x.fillStyle = g; x.fillRect(0, 0, w, gy);
    }
  }

  // ------------------------------------------------------------------ rain + snow (typed arrays, capped)
  const RN = 360;
  const rx = new Float32Array(RN), ry = new Float32Array(RN), rv = new Float32Array(RN), rl = new Float32Array(RN);
  let rr = U.rng(7);
  function seedRain() {
    rr = U.rng(7);
    for (let i = 0; i < RN; i++) { rx[i] = rr() * W * 1.1; ry[i] = rr() * H; rv[i] = 0; rl[i] = 0; respawnDrop(i, true); }
  }
  function respawnDrop(i, keepY) {
    const near = i < RN * 0.25;
    rx[i] = -20 * S + rr() * (W + 40 * S + wxs.slant * H);
    if (!keepY) ry[i] = -rr() * H * 0.2;
    rv[i] = (near ? 230 + rr() * 90 : 120 + rr() * 80) * S;
    rl[i] = (near ? 18 + rr() * 16 : 7 + rr() * 9) * S;
  }
  // density 0..1 = share of the capped drops in play; the wind slants them
  function drawRain(ctx, dt, a, density) {
    if (a <= 0.004 || density <= 0.004) return;
    const n = Math.round(RN * U.clamp(density)), slant = wxs.slant, spd = wxs.speed;
    for (let pass = 0; pass < 2; pass++) {
      const i0 = pass === 0 ? Math.round(RN * 0.25) : 0, i1 = pass === 0 ? n : Math.min(n, Math.round(RN * 0.25));
      if (i1 <= i0) continue;
      ctx.beginPath();
      for (let i = i0; i < i1; i++) {
        const v = rv[i] * spd * dt;
        ry[i] += v; rx[i] -= v * slant;
        if (ry[i] > WL + 10 || rx[i] < -40 * S) respawnDrop(i, false);
        ctx.moveTo(rx[i], ry[i]);
        ctx.lineTo(rx[i] + rl[i] * slant, ry[i] - rl[i]);
      }
      ctx.lineWidth = (pass === 0 ? 1 : 1.3) * S;
      if (DAY < 0.999) {
        ctx.globalAlpha = a * (pass === 0 ? 0.32 : 0.42) * (1 - DAY);
        ctx.strokeStyle = pass === 0 ? CSS.rainFar : CSS.rainNear;
        ctx.stroke();
      }
      if (DAY > 0.004) { ctx.globalAlpha = a * (pass === 0 ? 0.3 : 0.4) * DAY; ctx.strokeStyle = DAY_RAIN[pass]; ctx.stroke(); }
    }
  }

  const SN = 320, SN_NEAR = Math.round(SN * 0.3);
  const fx = new Float32Array(SN), fy = new Float32Array(SN), fv = new Float32Array(SN), fp = new Float32Array(SN), fs = new Float32Array(SN);
  function seedSnow() {
    const r = U.rng(11);
    for (let i = 0; i < SN; i++) {
      const near = i < SN_NEAR;
      fx[i] = r() * W; fy[i] = r() * H; fp[i] = r() * 100;
      fv[i] = (near ? 34 + r() * 22 : 14 + r() * 16) * S;
      fs[i] = (near ? 2.2 + r() * 1.2 : 1.1 + r() * 0.8) * S;
    }
  }
  // slow drifting flakes: sway on their own phase, carried by the wind
  function drawSnow(ctx, dt, t, a, density) {
    if (a <= 0.004 || density <= 0.004) return;
    const n = Math.round(SN * U.clamp(density)), drift = wxs.wind * 1.1 * S;
    for (let pass = 0; pass < 2; pass++) {
      const i0 = pass === 0 ? SN_NEAR : 0, i1 = pass === 0 ? n : Math.min(n, SN_NEAR);
      if (i1 <= i0) continue;
      ctx.beginPath();
      for (let i = i0; i < i1; i++) {
        fy[i] += fv[i] * dt;
        fx[i] += (drift * (pass ? 1 : 0.7) + Math.sin(t * 0.7 + fp[i]) * 10 * S) * dt;
        if (fy[i] > WL) { fy[i] = -4 * S; fx[i] = rr() * W; }
        if (fx[i] > W + 6 * S) fx[i] -= W + 12 * S; else if (fx[i] < -6 * S) fx[i] += W + 12 * S;
        const s = fs[i];
        ctx.rect(fx[i] - s / 2, fy[i] - s / 2, s, s);
      }
      ctx.globalAlpha = a * (pass ? 0.55 : 0.4);
      ctx.fillStyle = pass ? CSS.snowNear : CSS.snowFar;
      ctx.fill();
    }
  }

  // snow dusting: roof runs (x0, x1, y triples) stroked into whichever layer is painting, at its depth
  function dust(x, runs, a, lw, dy) {
    if (a <= 0.004) return;
    x.beginPath();
    for (let i = 0; i < runs.length; i += 3) { x.moveTo(runs[i], runs[i + 2] - 0.8 * S + dy); x.lineTo(runs[i + 1], runs[i + 2] - 0.8 * S + dy); }
    x.globalAlpha = U.clamp(a); x.strokeStyle = CSS.snowNear; x.lineWidth = lw; x.lineCap = "butt"; x.stroke();
  }

  // ------------------------------------------------------------------ build all
  function build(env) {
    W = env.width; H = env.height; DPR = env.dpr || 1; S = H / 1080;
    if (!measure) measure = mk(8, 8).x;
    sprites.clear(); dots.clear(); lays.clear(); dimL = null;
    buildClouds();
    buildClockCanvas();
    buildCity();
    buildBeams();
    buildHolo();
    skyL = mk(W, H); skyKey = "";
    cityBack = mk(W, H); cityKey = "";
    seedRain(); seedSnow();
  }

  // ------------------------------------------------------------------ elements (work HUD)
  function drawBrackets(ctx, f, a, b, col) {
    if (a <= 0.004) return;
    const spread = 40 * S * b;
    const ix = W * 0.035 - spread, iy = H * 0.055 - spread, arm = 34 * S;
    ctx.globalAlpha = a * 0.38;
    ctx.strokeStyle = U.rgba(col, 1); ctx.lineWidth = 1.2 * S;
    ctx.beginPath();
    ctx.moveTo(ix, iy + arm); ctx.lineTo(ix, iy); ctx.lineTo(ix + arm, iy);
    ctx.moveTo(W - ix - arm, iy); ctx.lineTo(W - ix, iy); ctx.lineTo(W - ix, iy + arm);
    ctx.moveTo(W - ix, H - iy - arm); ctx.lineTo(W - ix, H - iy); ctx.lineTo(W - ix - arm, H - iy);
    ctx.moveTo(ix + arm, H - iy); ctx.lineTo(ix, H - iy); ctx.lineTo(ix, H - iy - arm);
    ctx.stroke();
    // tiny registration ticks at mid-edges, and a finer inner tick on each arm
    ctx.globalAlpha = a * 0.22;
    ctx.beginPath();
    ctx.moveTo(W / 2, iy - 2 * S); ctx.lineTo(W / 2, iy + 8 * S);
    ctx.moveTo(W / 2, H - iy + 2 * S); ctx.lineTo(W / 2, H - iy - 8 * S);
    ctx.moveTo(ix - 2 * S, H / 2); ctx.lineTo(ix + 8 * S, H / 2);
    ctx.moveTo(W - ix + 2 * S, H / 2); ctx.lineTo(W - ix - 8 * S, H / 2);
    for (let k = 1; k <= 3; k++) {
      const o = arm * k / 4;
      ctx.moveTo(ix + o, iy); ctx.lineTo(ix + o, iy + (k === 2 ? 4 : 2.5) * S);
      ctx.moveTo(W - ix - o, H - iy); ctx.lineTo(W - ix - o, H - iy - (k === 2 ? 4 : 2.5) * S);
    }
    ctx.stroke();
    // reticle marks on a coarse lattice, whisper-faint, kept clear of the clock
    ctx.globalAlpha = a * 0.13; ctx.lineWidth = 1 * S;
    ctx.beginPath();
    const rs = 4 * S, gx0 = W / 2, gy0 = H / 2, k = 1 + spread / (W * 0.4);
    for (let i = 1; i < 8; i++) {
      for (let j = 1; j < 6; j++) {
        if (i > 1 && i < 7 && j < 4) continue;
        const gx = gx0 + (W * i / 8 - gx0) * k, gy = gy0 + (H * j / 6 - gy0) * k;
        ctx.moveTo(gx - rs, gy); ctx.lineTo(gx + rs, gy); ctx.moveTo(gx, gy - rs); ctx.lineTo(gx, gy + rs);
      }
    }
    ctx.stroke();
    // serial and readout text tucked into the corners
    const tp = 12 * S, ta = a * 0.3;
    txt(ctx, "ARS-CMD // 07 // NODE KT-4", ix + 10 * S, iy + 14 * S, tp, col, ta, 0, 0, 2 * S);
    txt(ctx, "SEC LVL 3 // INTERNAL", W - ix - 10 * S, iy + 14 * S, tp, col, ta, 2, 0, 2 * S);
    txt(ctx, "SYNC " + hhmm(f.now) + " LOCAL", ix + 10 * S, H - iy - 14 * S, tp, col, ta, 0, 0, 2 * S);
    txt(ctx, "GRID 07-B // CH 2 // NOMINAL", W - ix - 10 * S, H - iy - 14 * S, tp, col, ta, 2, 0, 2 * S);
  }

  function drawFinance(ctx, f, a, b, col) {
    const fin = f.signals.finances;
    if (!fin || a <= 0.004) return;
    const mood = fin.mood === "warning" ? C.red : fin.mood === "drift" ? C.orange : C.gold;
    // warning stays dim: the heartbeat flare is the only loud thing on the wall
    const moodA = fin.mood === "warning" ? 0.62 : fin.mood === "drift" ? 0.72 : 0.82;
    const moodG = fin.mood === "calm" ? 10 * S : 3 * S;
    const x = W * 0.065 - 70 * S * b, y = H * 0.115 - 20 * S * b;
    txt(ctx, "FIN // " + MONTHS[f.now.getMonth()], x, y, 19 * S, col, a * 0.5, 0, 4 * S, 3 * S);
    txt(ctx, "NET " + U.fmtMoney(fin.net, { sign: true }), x, y + 46 * S, 42 * S, mood, a * moodA, 0, moodG, 1 * S);
    // made vs spent: two thin bars on a shared scale
    const L = W * 0.15, bx = x + 58 * S;
    const mx = Math.max(fin.income, fin.spent, 1);
    const li = L * fin.income / mx, ls = L * fin.spent / mx;
    const y1 = y + 100 * S, y2 = y + 132 * S;
    txt(ctx, "IN", x, y1, 19 * S, col, a * 0.5, 0, 0, 2 * S);
    txt(ctx, "OUT", x, y2, 19 * S, col, a * 0.5, 0, 0, 2 * S);
    ctx.lineCap = "butt";
    // track, with a fine scale of 10% ticks under it
    ctx.globalAlpha = a * 0.14; ctx.strokeStyle = U.rgba(col, 1); ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.moveTo(bx, y1); ctx.lineTo(bx + L, y1); ctx.moveTo(bx, y2); ctx.lineTo(bx + L, y2);
    for (let k = 0; k <= 10; k++) { const tx = bx + L * k / 10; ctx.moveTo(tx, y2 + 6 * S); ctx.lineTo(tx, y2 + (k % 5 ? 8 : 10) * S); }
    ctx.stroke();
    // a hairline leader down the left edge of the block, ticked at each row
    ctx.globalAlpha = a * 0.16;
    ctx.beginPath(); const lx = x - 14 * S;
    ctx.moveTo(lx, y - 8 * S); ctx.lineTo(lx, y + 172 * S);
    ctx.moveTo(lx, y); ctx.lineTo(lx + 5 * S, y); ctx.moveTo(lx, y + 46 * S); ctx.lineTo(lx + 5 * S, y + 46 * S);
    ctx.moveTo(lx, y1); ctx.lineTo(lx + 3 * S, y1); ctx.moveTo(lx, y2); ctx.lineTo(lx + 3 * S, y2);
    ctx.stroke();
    ctx.lineWidth = 3 * S;
    ctx.globalAlpha = a * 0.6; ctx.strokeStyle = U.rgba(col, 1);
    ctx.beginPath(); ctx.moveTo(bx, y1); ctx.lineTo(bx + li, y1); ctx.stroke();
    ctx.globalAlpha = a * 0.75; ctx.strokeStyle = U.rgba(U.safe(mood), 1);
    ctx.beginPath(); ctx.moveTo(bx, y2); ctx.lineTo(bx + ls, y2); ctx.stroke();
    // income mark on the spend bar: overshoot reads instantly
    ctx.globalAlpha = a * 0.5; ctx.lineWidth = 1 * S; ctx.strokeStyle = U.rgba(col, 1);
    ctx.beginPath(); ctx.moveTo(bx + li, y1 + 6 * S); ctx.lineTo(bx + li, y2 + 8 * S); ctx.stroke();
    txt(ctx, U.fmtMoney(fin.income), bx + L + 16 * S, y1, 19 * S, col, a * 0.5, 0, 0, 1 * S);
    txt(ctx, U.fmtMoney(fin.spent), bx + L + 16 * S, y2, 19 * S, mood, a * 0.6, 0, 0, 1 * S);
    if (fin.lastUpdated) {
      // a faint data flicker, very rarely
      const fl = (f.t % 29) < 0.12 ? 0.45 : 1;
      txt(ctx, "UPD " + agoHud(fin.lastUpdated, f.now), x, y + 172 * S, 17 * S, col, a * 0.34 * fl, 0, 0, 3 * S);
    }
  }

  function drawHeartbeat(ctx, f, b, col, hudA) {
    const hb = f.signals.heartbeat;
    if (!hb || !hb.length) return;
    const n = hb.length;
    let upN = 0;
    for (let i = 0; i < n; i++) if (hb[i].up) upN++;
    const xr = W * 0.935 + 70 * S * b, y0 = H * 0.115 - 20 * S * b;
    const anyDown = upN < n;
    const hdrCol = anyDown ? C.red : col;
    txt(ctx, "SYS // " + upN + "/" + n + " UP", xr, y0, 19 * S, hdrCol, hudA * (anyDown ? 0.6 : 0.5), 2, 4 * S, 3 * S);
    // hairline leader down the right edge, ticked per host
    if (hudA > 0.004) {
      ctx.globalAlpha = hudA * 0.16; ctx.strokeStyle = U.rgba(col, 1); ctx.lineWidth = 1 * S;
      ctx.beginPath(); const lx = xr + 14 * S;
      ctx.moveTo(lx, y0 - 8 * S); ctx.lineTo(lx, y0 + 50 * S + (n - 1) * 40 * S + 12 * S);
      ctx.moveTo(lx, y0); ctx.lineTo(lx - 5 * S, y0);
      for (let i = 0; i < n; i++) { const wy = y0 + 50 * S + i * 40 * S; ctx.moveTo(lx, wy); ctx.lineTo(lx - 3 * S, wy); }
      ctx.stroke();
    }
    const eb = U.easeInOut(U.clamp(b));
    for (let i = 0; i < n; i++) {
      const h = hb[i];
      const wy = y0 + 50 * S + i * 40 * S, wx = xr - 8 * S;
      const bc = beacons.length ? beacons[(i + 1) % beacons.length] : { x: W * 0.7, y: H * 0.6 };
      const px = U.lerp(wx, bc.x, eb), py = U.lerp(wy, bc.y, eb);
      const ph = (i * 0.37) % 1;
      if (h.up) {
        const c = warm(b);
        // work: slow quiet ping ring
        const per = U.lerp(4.4, 7.5, b);
        const p = ((f.t / per) + ph) % 1;
        const ra = (1 - p) * (1 - p) * 0.45 * hudA;
        if (ra > 0.01) {
          ctx.globalAlpha = ra; ctx.strokeStyle = U.rgba(U.safe(c), 1); ctx.lineWidth = 1 * S;
          ctx.beginPath(); ctx.arc(px, py, (5 + 24 * p) * S, 0, U.TAU); ctx.stroke();
        }
        // ambient: aviation beacon breathing on the mast
        const breathe = 0.5 + 0.5 * Math.sin((f.t / 6.5 + ph) * U.TAU);
        glowDot(ctx, c, px, py, U.lerp(14, 22, b) * S, U.lerp(0.5, 0.25 + 0.4 * breathe, b));
        ctx.globalAlpha = U.lerp(0.85, 0.35 + 0.35 * breathe, b);
        ctx.fillStyle = U.rgba(U.safe(c), 1);
        ctx.beginPath(); ctx.arc(px, py, U.lerp(4, 2, b) * S, 0, U.TAU); ctx.fill();
        txt(ctx, h.host.toUpperCase(), wx - 22 * S, wy, 19 * S, col, hudA * 0.55, 2, 0, 3 * S);
      } else {
        // down: the only loud thing on the wall
        const c = U.mix(C.red, U.mix(C.red, C.amber, 0.45), qz(b, 16));
        const per = U.lerp(1.7, 3.2, b);
        for (let k = 0; k < 2; k++) {
          const p = ((f.t / per) + k * 0.5) % 1;
          const ra = (1 - p) * (1 - p) * U.lerp(0.8, 0.35, b);
          ctx.globalAlpha = ra; ctx.strokeStyle = U.rgba(U.safe(c), 1); ctx.lineWidth = U.lerp(1.6, 1, b) * S;
          ctx.beginPath(); ctx.arc(px, py, (6 + U.lerp(40, 30, b) * p) * S, 0, U.TAU); ctx.stroke();
        }
        const pulse = 0.5 + 0.5 * Math.sin(f.t / per * U.TAU);
        glowDot(ctx, c, px, py, U.lerp(46, 64, b) * S, U.lerp(0.65 + 0.3 * pulse, 0.45 + 0.45 * pulse, b));
        ctx.globalAlpha = U.lerp(0.95, 0.6 + 0.3 * pulse, b);
        ctx.fillStyle = U.rgba(U.safe(c), 1);
        ctx.beginPath(); ctx.arc(px, py, U.lerp(6, 3.2, b) * S, 0, U.TAU); ctx.fill();
        let lbl = h.host.toUpperCase() + " // DOWN";
        if (h.downSince) lbl += " " + U.fmtMinutes((f.now - h.downSince) / 60000).toUpperCase();
        txt(ctx, lbl, wx - 22 * S, wy, 22 * S, C.red, hudA * 0.85, 2, 9 * S, 2 * S);
        // ambient: a red warning hologram beside its beacon, glitching
        const wa = U.smoothstep(0.7, 1, b) * (0.55 + 0.2 * pulse);
        if (wa > 0.004) warnHolo(ctx, f.t + i, h.host.toUpperCase() + " // OFFLINE", px, py, wa);
      }
    }
  }

  // A warning hologram: a red framed panel with the host name, scanlined, glitching every couple of s.
  function warnHolo(ctx, t, text, px, py, a) {
    const sp = sprite("!! " + text, Math.round(17 * S), C.red, 6 * S, 2 * S);
    const right = px >= TCX, w = sp.tw + 24 * S, h = 34 * S;
    const x0 = right ? px + 26 * S : px - 26 * S - w, y0 = py - h / 2;
    ctx.globalCompositeOperation = DAY > 0.004 ? "source-over" : "lighter";
    ctx.globalAlpha = a * 0.08; ctx.fillStyle = NCC.red; ctx.fillRect(x0, y0, w, h);
    ctx.globalAlpha = a * 0.7; ctx.strokeStyle = NCC.red; ctx.lineWidth = 1.2 * S;
    ctx.strokeRect(x0, y0, w, h);
    ctx.beginPath(); ctx.moveTo(right ? x0 : x0 + w, py); ctx.lineTo(px + (right ? 8 : -8) * S, py); ctx.stroke();
    const gp = t % 2.3, glitch = gp < 0.25, n = glitch ? 5 : 1, sh = sp.c.height / n;
    for (let k = 0; k < n; k++) {
      const off = glitch ? (hash(k * 2.7 + Math.floor(t * 24)) - 0.5) * 18 * S : 0;
      ctx.globalAlpha = a * (glitch && hash(k + Math.floor(t * 31)) < 0.25 ? 0.2 : 0.95);
      ctx.drawImage(sp.c, 0, k * sh, sp.c.width, sh, x0 + 12 * S - sp.pad + off, py - sp.h / 2 + k * sp.h / n, sp.w, sp.h / n);
    }
    // a red ghost offset to the left: the chromatic split
    ctx.globalAlpha = a * 0.25;
    ctx.drawImage(sp.c, x0 + 12 * S - sp.pad - 3 * S, py - sp.h / 2, sp.w, sp.h);
    ctx.globalCompositeOperation = "source-over";
  }

  const ARC_DASH = [0, 0];
  function drawDaylight(ctx, f, a, b, col) {
    const d = f.signals.daylight;
    if (!d || a <= 0.004) return;
    const x0 = W * 0.08, x1 = W * 0.92, y = H * 0.86 + 40 * S * b;
    const span = x1 - x0, arcH = H * 0.085;
    const fr = (t) => (t.getHours() * 60 + t.getMinutes()) / 1440;
    // the day: one hairline, 3-hour ticks
    ctx.lineCap = "butt";
    ctx.globalAlpha = a * 0.22; ctx.strokeStyle = U.rgba(col, 1); ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y);
    for (let hh = 0; hh <= 24; hh += 3) {
      const tx = x0 + span * hh / 24, th = (hh % 12 === 0 ? 9 : 5) * S;
      ctx.moveTo(tx, y); ctx.lineTo(tx, y + th);
    }
    ctx.stroke();
    // sub-ticks: every hour, and a finer quarter-hour comb
    ctx.globalAlpha = a * 0.12;
    ctx.beginPath();
    for (let q = 0; q <= 96; q++) {
      if (q % 12 === 0) continue;
      const tx = x0 + span * q / 96, th = (q % 4 === 0 ? 3.5 : 1.8) * S;
      ctx.moveTo(tx, y); ctx.lineTo(tx, y + th);
    }
    ctx.stroke();
    let sunX = x0 + span * d.dayFraction, sunY = y, up = false;
    if (d.sunrise && d.sunset) {
      const fa = fr(d.sunrise), fb = fr(d.sunset);
      const xa = x0 + span * fa, xb = x0 + span * fb;
      ctx.globalAlpha = a * 0.55; ctx.lineWidth = 1.6 * S;
      ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb, y); ctx.stroke();
      // the sun's path, dotted
      ARC_DASH[0] = 2 * S; ARC_DASH[1] = 6 * S;
      ctx.setLineDash(ARC_DASH);
      ctx.globalAlpha = a * 0.42; ctx.lineWidth = 1.4 * S;
      ctx.beginPath();
      for (let k = 0; k <= 48; k++) {
        const u = k / 48, xx = xa + (xb - xa) * u, yy = y - arcH * Math.sin(Math.PI * u);
        if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      ctx.setLineDash(NODASH);
      txt(ctx, hhmm(d.sunrise), xa, y + 26 * S, 16 * S, col, a * 0.38, 1, 0, 1 * S);
      txt(ctx, hhmm(d.sunset), xb, y + 26 * S, 16 * S, col, a * 0.38, 1, 0, 1 * S);
      const u = (d.dayFraction - fa) / (fb - fa);
      if (u >= 0 && u <= 1) { up = true; sunY = y - arcH * Math.sin(Math.PI * u); }
    }
    if (up) {
      ctx.globalAlpha = a * 0.25; ctx.lineWidth = 1 * S;
      ctx.beginPath(); ctx.moveTo(sunX, sunY + 8 * S); ctx.lineTo(sunX, y); ctx.stroke();
      const sc = b > 0.004 ? col : C.gold;
      glowDot(ctx, sc, sunX, sunY, 26 * S, a * 0.6);
      ctx.globalAlpha = a * 0.9; ctx.fillStyle = U.rgba(U.safe(sc), 1);
      ctx.beginPath(); ctx.arc(sunX, sunY, 5 * S, 0, U.TAU); ctx.fill();
    } else {
      ctx.globalAlpha = a * 0.5; ctx.lineWidth = 1.2 * S;
      ctx.beginPath(); ctx.arc(sunX, y, 4 * S, 0, U.TAU); ctx.stroke();
    }
    let lbl = null;
    if (d.lightLeftMin != null) lbl = "LIGHT LEFT " + U.fmtMinutes(d.lightLeftMin).toUpperCase();
    else if (d.sunrise && f.now < d.sunrise) lbl = "FIRST LIGHT " + hhmm(d.sunrise);
    if (lbl) txt(ctx, lbl, x0, y - 30 * S, 22 * S, col, a * 0.62, 0, 4 * S, 3 * S);
  }

  function drawWeather(ctx, f, a, b, col) {
    const wx = f.signals.weather;
    if (!wx || !wx.actionable || a <= 0.004) return;
    const y = H * 0.115 - 30 * S * b;
    let s = "WX // " + wx.actionable.toUpperCase();
    if (wx.tempC != null) s += "  " + Math.round(wx.tempC) + "°C";
    const wc = b > 0.004 ? U.mix(C.gold, col, qz(U.smoothstep(0, 0.3, b), 8)) : C.gold;
    const tw = txt(ctx, s, W / 2 + 14 * S, y, 22 * S, wc, a * 0.62, 1, 4 * S, 3 * S);
    // glyph from the condition: three slanted strokes for rain/storm, a six-point star for snow
    const gx = W / 2 + 14 * S - tw / 2 - 36 * S;
    if (wx.condition === "rain" || wx.condition === "storm") {
      ctx.globalAlpha = a * 0.5; ctx.strokeStyle = U.rgba(wc, 1); ctx.lineWidth = 1.4 * S;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) { ctx.moveTo(gx + k * 7 * S + 4 * S, y - 8 * S); ctx.lineTo(gx + k * 7 * S, y + 8 * S); }
      ctx.stroke();
    } else if (wx.condition === "snow") {
      ctx.globalAlpha = a * 0.5; ctx.strokeStyle = U.rgba(wc, 1); ctx.lineWidth = 1.4 * S;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const q = k * Math.PI / 3, c = Math.cos(q) * 8 * S, s2 = Math.sin(q) * 8 * S;
        ctx.moveTo(gx + 8 * S - c, y - s2); ctx.lineTo(gx + 8 * S + c, y + s2);
      }
      ctx.stroke();
    }
  }

  function drawCalendar(ctx, f, b, col, clockY, hudA) {
    const cal = f.signals.calendar && f.signals.calendar.next;
    if (!cal) return;
    const m = cal.minutesUntil;
    const title = (cal.title || "").toUpperCase();
    const a = hudA;
    if (a > 0.004) {
      const y = H * 0.585 + 36 * S * b;
      const gap = 18 * S;
      txt(ctx, "NEXT // " + title, W / 2 - gap, y, 30 * S, col, a * 0.6, 2, 5 * S, 3 * S);
      txt(ctx, "T-" + U.fmtMinutes(m).toUpperCase(), W / 2 + gap, y, 30 * S, b > 0.004 ? col : C.gold, a * (m < 15 ? 0.95 : 0.78), 0, (m < 15 ? 10 : 6) * S, 3 * S);
      // separator and the fuse: a hairline that burns down over the last hour, minute ticks along it
      ctx.globalAlpha = a * 0.4; ctx.strokeStyle = U.rgba(col, 1); ctx.lineWidth = 1 * S;
      ctx.beginPath(); ctx.moveTo(W / 2, y - 14 * S); ctx.lineTo(W / 2, y + 14 * S); ctx.stroke();
      const fl = W * 0.17 * U.clamp(m / 60);
      if (fl > 1) {
        ctx.globalAlpha = a * 0.4;
        ctx.beginPath(); ctx.moveTo(W / 2 - fl, y + 34 * S); ctx.lineTo(W / 2 + fl, y + 34 * S); ctx.stroke();
        ctx.globalAlpha = a * 0.16;
        ctx.beginPath();
        for (let k = 5; k < 60; k += 5) {
          const o = W * 0.17 * k / 60;
          if (o > fl) break;
          ctx.moveTo(W / 2 - o, y + 31 * S); ctx.lineTo(W / 2 - o, y + 34 * S);
          ctx.moveTo(W / 2 + o, y + 31 * S); ctx.lineTo(W / 2 + o, y + 34 * S);
        }
        ctx.stroke();
      }
    }
    // ambient: a whisper only when it is close
    if (m < 30 && b > 0.01) {
      const wa = 0.3 * U.smoothstep(0.5, 1, b);
      txt(ctx, (cal.title || "").toLowerCase() + "  ·  " + U.fmtMinutes(m), W / 2, clockY + H * 0.11, 22 * S, C.amber, wa, 1, 3 * S, 2 * S);
    }
  }

  function drawClock(ctx, f, b) {
    const text = U.fmtTime(f.now, { hour24: f.config && f.config.clock ? f.config.clock.hour24 !== false : true });
    const sp = clockSprite(text, qz(b, 48));
    const sc = U.lerp(1, 0.6, b);
    const cy = U.lerp(H * 0.4, H * 0.27, b);
    const dw = sp.w * sc, dh = sp.h * sc;
    const x = W / 2 - dw / 2, y = cy - dh / 2;
    // ambient: the tower projects it: beams up from the ledge, a holo frame, a tiny readout
    const ha = U.smoothstep(0.7, 1, b) * (1 - 0.6 * DAY);
    if (ha > 0.004 && projKoi) {
      const fx0 = x + dw * 0.07, fx1 = x + dw * 0.93, fy0 = y + dh * 0.2, fy1 = y + dh * 0.8, arm = 18 * S;
      const ly = H * 0.44 - 3 * S, lx = 0.084 * W * 0.62;
      projBeam(ctx, TCX - lx, ly, W / 2 - dw * 0.18, fy1, dw * 0.22, ha * 0.16);
      projBeam(ctx, TCX + lx, ly, W / 2 + dw * 0.18, fy1, dw * 0.22, ha * 0.16);
      ctx.globalAlpha = ha * 0.45; ctx.strokeStyle = NCC.cyan; ctx.lineWidth = 1.2 * S;
      ctx.beginPath();
      ctx.moveTo(fx0, fy0 + arm); ctx.lineTo(fx0, fy0); ctx.lineTo(fx0 + arm, fy0);
      ctx.moveTo(fx1 - arm, fy0); ctx.lineTo(fx1, fy0); ctx.lineTo(fx1, fy0 + arm);
      ctx.moveTo(fx1, fy1 - arm); ctx.lineTo(fx1, fy1); ctx.lineTo(fx1 - arm, fy1);
      ctx.moveTo(fx0 + arm, fy1); ctx.lineTo(fx0, fy1); ctx.lineTo(fx0, fy1 - arm);
      ctx.stroke();
      txt(ctx, "LOCAL // NC-07", fx0 + 2 * S, fy0 - 10 * S, 11 * S, NC.cyan, ha * 0.5, 0, 0, 2 * S);
    }
    // ambient: a rare, slow glitch (once a minute, ~0.3 s): the city hiccups
    const gp = f.t % 61;
    if (b > 0.9 && gp > 30 && gp < 30.32) {
      const k = (gp - 30) / 0.32;
      const amp = Math.sin(k * Math.PI) * 14 * S;
      const slices = 7, sh = sp.c.height / slices;
      ctx.globalAlpha = 0.9;
      for (let i = 0; i < slices; i++) {
        const off = U.noise1(i * 3.7 + Math.floor(f.t * 20)) * amp;
        ctx.drawImage(sp.c, 0, i * sh, sp.c.width, sh, x + off, y + i * dh / slices, dw, dh / slices);
      }
      ctx.globalAlpha = 0.18;
      ctx.drawImage(sp.c, x - amp * 0.6, y, dw, dh);
      return cy;
    }
    ctx.globalAlpha = U.lerp(1, 0.92, b);
    ctx.drawImage(sp.c, x, y, dw, dh);
    return cy;
  }

  function drawDate(ctx, f, a, b, col) {
    if (a <= 0.004) return;
    const d = f.now;
    const s = DAYS[d.getDay()] + " " + pad2(d.getDate()) + " " + MONTHS[d.getMonth()];
    txt(ctx, s, W / 2, H * 0.24 - 30 * S * b, 20 * S, col, a * 0.4, 1, 3 * S, 8 * S);
  }

  // ------------------------------------------------------------------ news: one feed line under the calendar
  // Layout (word wrap + ellipsis, measured in the real font) is cached per (text, size, width); the
  // glyph runs themselves are cached sprites, so a steady headline costs a few blits per frame.
  const lays = new Map();
  function wrap2(text, px, track, maxW, two) {
    const key = text + "|" + px + "|" + track + "|" + Math.round(maxW) + "|" + (two ? 2 : 1);
    let l = lays.get(key);
    if (l) return l;
    if (lays.size > 12) lays.clear();
    measure.font = `${px}px ${MONO}`; measure.letterSpacing = track + "px";
    const s = String(text).replace(/\s+/g, " ").trim(), fits = (q) => measure.measureText(q).width <= maxW;
    if (fits(s)) l = [s];
    else if (!two) l = [U.ellipsize(s, maxW, measure)];
    else {
      const words = s.split(" ");
      // fits on two lines: split where the two lines balance best (no orphan word)
      l = null;
      let best = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(" "), z = words.slice(i).join(" ");
        const wa = measure.measureText(a).width, wz = measure.measureText(z).width;
        if (wa <= maxW && wz <= maxW && Math.max(wa, wz) < best) { best = Math.max(wa, wz); l = [a, z]; }
      }
      if (!l) {
        // too long for two: fill the first line, cut the second at a word with an ellipsis
        let l1 = "", i = 0;
        for (; i < words.length; i++) { const nx = l1 ? l1 + " " + words[i] : words[i]; if (!fits(nx)) break; l1 = nx; }
        l = l1 ? [l1, U.ellipsize(words.slice(i).join(" "), maxW, measure)] : [U.ellipsize(s, maxW, measure)];
      }
    }
    lays.set(key, l);
    return l;
  }
  const newsAge = (d, now) => {
    if (!(d instanceof Date)) return "";
    const m = Math.max(0, (now - d) / 60000);
    if (m < 1) return "NOW";
    if (m < 60) return Math.round(m) + " MIN";
    if (m < 48 * 60) return Math.round(m / 60) + " H";
    return Math.round(m / 1440) + " D";
  };
  // the alert glyph: a hazard triangle with a bar and a point, red (drawn, not a font glyph)
  function hazard(ctx, x, y, r, a) {
    ctx.globalAlpha = U.clamp(a); ctx.strokeStyle = NCC.red; ctx.lineWidth = 1.6 * S; ctx.lineJoin = "miter";
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 1.08, y + r * 0.78); ctx.lineTo(x - r * 1.08, y + r * 0.78); ctx.closePath();
    ctx.moveTo(x, y - r * 0.38); ctx.lineTo(x, y + r * 0.26);
    ctx.stroke();
    ctx.fillStyle = NCC.red; ctx.fillRect(x - 1.1 * S, y + r * 0.42, 2.2 * S, 2.2 * S);
  }
  function drawNews(ctx, f, a, b, col, clockY) {
    const n = f.signals.news;
    if (!n || !n.headline) return;
    const crit = !!n.critical;
    // the alarm breathes slowly (2.8 s): the frame's red holds still, so motion + glyph set it apart
    const pulse = crit ? 0.5 + 0.5 * Math.sin(f.t * U.TAU / 2.8) : 0;
    if (a > 0.004) {
      const px = Math.round(22 * S), tr = Math.round(2 * S);
      const lines = wrap2(String(n.headline).toUpperCase(), px, tr, W * 0.56, true);
      const lh = 31 * S, y0 = H * (lines.length > 1 ? 0.65 : 0.662) + 34 * S * b;
      const hc = crit ? C.red : col, ha = crit ? 0.6 + 0.35 * pulse : 0.56;
      let tw0 = 0;
      for (let i = 0; i < lines.length; i++) {
        const w = txt(ctx, lines[i], W / 2, y0 + i * lh, px, hc, a * ha, 1, crit ? 7 * S : 3 * S, tr);
        if (!i) tw0 = w;
      }
      const age = newsAge(n.published, f.now);
      const src = (crit ? "ALERT // " : "FEED // ") + String(n.source || "").toUpperCase() + (age ? "  ·  " + age : "");
      txt(ctx, src, W / 2, y0 + lines.length * lh + 2 * S, Math.round(16 * S), hc, a * (crit ? 0.46 + 0.2 * pulse : 0.4), 1, 0, Math.round(3 * S));
      if (crit) {
        const gx = W / 2 - tw0 / 2 - 34 * S;
        glowDot(ctx, C.red, gx, y0, 34 * S, a * (0.25 + 0.3 * pulse));
        hazard(ctx, gx, y0, 13 * S, a * (0.55 + 0.4 * pulse));
        // a ring breathing out from the glyph, once per pulse
        const p = (f.t / 2.8 + 0.25) % 1;
        ctx.globalAlpha = a * 0.4 * (1 - p) * (1 - p); ctx.strokeStyle = NCC.red; ctx.lineWidth = 1 * S;
        ctx.beginPath(); ctx.arc(gx, y0, (14 + 26 * p) * S, 0, U.TAU); ctx.stroke();
      }
    }
    // ambient: a critical item whispers once, faintly, under the projected clock
    if (crit && b > 0.01) {
      const wa = 0.3 * U.smoothstep(0.55, 1, b) * (0.75 + 0.25 * pulse);
      if (wa > 0.004) {
        const px = Math.round(17 * S), tr = Math.round(2 * S);
        const s = wrap2("!! " + String(n.headline).toLowerCase(), px, tr, W * 0.34, false)[0];
        txt(ctx, s, W / 2, clockY + H * 0.148, px, C.red, wa, 1, 4 * S, tr);
      }
    }
  }

  // ------------------------------------------------------------------ now playing
  // Work: one small line in the right-hand column under the hosts ("TITLE — ARTIST", ellipsized in the real
  // font), a play / pause glyph in the host-dot column, a progress hairline under it; paused dims. Ambient: a
  // radio-ID holo HUD in the lower-left corner (drawRadio). Null: nothing at all.
  const ART = { url: null, img: null, ok: false };
  // the album art: same-origin (or data:) only, loaded once per URL; a failed load just means no art
  function artImg(np) {
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
  const npText = (np) => (String(np.title || "").trim() + (np.artist ? (np.title ? " — " : "") + String(np.artist).trim() : "")).replace(/\s+/g, " ");
  const npFrac = (np) => (typeof np.progressMs === "number" && typeof np.durationMs === "number" && np.durationMs > 0 ? U.clamp(np.progressMs / np.durationMs) : -1);
  const NPL = { key: "", line: "" };
  function npLine(np, px, track, maxW) {
    const s = npText(np).toUpperCase(), key = s + "|" + px + "|" + track + "|" + Math.round(maxW);
    if (NPL.key !== key) {
      NPL.key = key;
      measure.font = `${px}px ${MONO}`; measure.letterSpacing = track + "px";
      NPL.line = U.ellipsize(s, maxW, measure).replace(/\s*—\s*…$/, "…");
      measure.letterSpacing = "0px";
    }
    return NPL.line;
  }
  function drawNowPlaying(ctx, f, a, b, col) {
    const np = f.signals.nowPlaying;
    if (!np || !(np.title || np.artist) || a <= 0.004) return;
    const hb = f.signals.heartbeat, n = hb && hb.length ? hb.length : 0;
    const xr = W * 0.935 + 70 * S * b, y0 = H * 0.115 - 20 * S * b;
    const y = y0 + 50 * S + n * 40 * S + (n ? 14 * S : 0);
    const px = Math.round(17 * S), tr = Math.round(2 * S), k = np.isPlaying ? 1 : 0.55;
    const tx = xr - 30 * S, line = npLine(np, px, tr, W * 0.2);
    const tw = txt(ctx, line, tx, y, px, col, a * 0.52 * k, 2, 0, tr);
    // play / pause in the host-dot column
    const gx = xr - 8 * S;
    ctx.globalAlpha = a * 0.6 * k; ctx.fillStyle = U.rgba(col, 1);
    if (!np.isPlaying) { ctx.fillRect(gx - 4.2 * S, y - 5.5 * S, 2.8 * S, 11 * S); ctx.fillRect(gx + 1.4 * S, y - 5.5 * S, 2.8 * S, 11 * S); }
    else { ctx.beginPath(); ctx.moveTo(gx - 3.5 * S, y - 5.5 * S); ctx.lineTo(gx + 5 * S, y); ctx.lineTo(gx - 3.5 * S, y + 5.5 * S); ctx.closePath(); ctx.fill(); }
    const fr = npFrac(np);
    if (fr >= 0 && tw > 0) {
      const hy = y + 15 * S, x0 = tx - tw, hx = x0 + tw * fr;
      ctx.lineCap = "butt"; ctx.lineWidth = 1 * S; ctx.strokeStyle = U.rgba(col, 1);
      ctx.globalAlpha = a * 0.16 * k; ctx.beginPath(); ctx.moveTo(x0, hy); ctx.lineTo(tx, hy); ctx.stroke();
      ctx.globalAlpha = a * 0.5 * k; ctx.beginPath(); ctx.moveTo(x0, hy); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.fillRect(hx - 0.6 * S, hy - 3 * S, 1.2 * S, 6 * S);
    }
  }
  // Ambient: a radio-ID holo HUD in the lower-left corner, over the water: NOW PLAYING (a live level meter while
  // playing; PAUSED and dimmer when not), the title in holo cyan with its red chromatic ghost, the artist under it,
  // a progress hairline; the album art as a cyan-washed, scanlined holo panel beside it when there is one.
  // Layout (ellipsis in the real font) is cached per track; the glyph runs are cached sprites.
  const RL = { key: "", title: "", artist: "" }, AP = { url: "", A: 0, sp: null };
  function radioLayout(np, tpx, apx, tr, maxW) {
    const T = String(np.title || "").replace(/\s+/g, " ").trim().toUpperCase();
    const R = String(np.artist || "").replace(/\s+/g, " ").trim().toUpperCase();
    const key = T + "|" + R + "|" + tpx + "|" + apx + "|" + tr + "|" + Math.round(maxW);
    if (RL.key !== key) {
      RL.key = key;
      measure.letterSpacing = tr + "px";
      measure.font = `${tpx}px ${MONO}`; RL.title = T ? U.ellipsize(T, maxW, measure) : "";
      measure.font = `${apx}px ${MONO}`; RL.artist = R ? U.ellipsize(R, maxW, measure) : "";
      measure.letterSpacing = "0px";
    }
    return RL;
  }
  // the cover as a holo panel (baked once per art and size): cropped square, washed cyan, scanlined, framed
  function artPanel(art, A) {
    if (AP.sp && AP.url === ART.url && AP.A === A) return AP.sp;
    const p = mk(A, A), x = p.x, c = U.safe(NC.cyan), nw = art.naturalWidth, nh = art.naturalHeight, s0 = Math.min(nw, nh);
    x.drawImage(art, (nw - s0) / 2, (nh - s0) / 2, s0, s0, 0, 0, A, A);
    x.globalCompositeOperation = "source-atop"; x.fillStyle = U.rgba(c, 0.4); x.fillRect(0, 0, A, A);
    x.globalCompositeOperation = "source-over";
    scanlines(x, A, A);
    x.strokeStyle = U.rgba(c, 0.6); x.lineWidth = 1 * S; x.strokeRect(0.5 * S, 0.5 * S, A - 1 * S, A - 1 * S);
    AP.url = ART.url; AP.A = A; AP.sp = p;
    return p;
  }
  function drawRadio(ctx, f, a) {
    const np = f.signals.nowPlaying;
    if (!np || !(np.title || np.artist) || a <= 0.004) return;
    const t = f.t, art = artImg(np), playing = !!np.isPlaying, k = playing ? 1 : 0.6, fl = 0.95 + 0.05 * Math.sin(t * 7.1);
    const A = Math.round(88 * S), x0 = W * 0.035, yT = H * 0.86;
    const tpx = Math.round(26 * S), apx = Math.round(15 * S), lpx = Math.round(12 * S), tr = Math.round(2 * S), g = 6 * S;
    const L = radioLayout(np, tpx, apx, tr, W * 0.24);
    const tx = x0 + (art ? A + 18 * S : 0);
    const tw = Math.max(L.title ? sprite(L.title, tpx, NC.cyan, g, tr).tw : 0, L.artist ? sprite(L.artist, apx, C.cyanDim, 0, tr).tw : 0, 150 * S);
    // a black backing (free on a projector) and corner ticks: the HUD's glass
    const pad = 14 * S, bx = x0 - pad, by = yT - pad, bw = tx - x0 + tw + pad * 2, bh = A + pad * 2, arm = 12 * S;
    ctx.globalAlpha = a * 0.5; ctx.fillStyle = "#000"; ctx.fillRect(bx, by, bw, bh);
    ctx.globalAlpha = a * 0.45 * k; ctx.strokeStyle = NCC.cyan; ctx.lineWidth = 1 * S; ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(bx, by + arm); ctx.lineTo(bx, by); ctx.lineTo(bx + arm, by);
    ctx.moveTo(bx + bw - arm, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + arm);
    ctx.moveTo(bx + bw, by + bh - arm); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw - arm, by + bh);
    ctx.moveTo(bx + arm, by + bh); ctx.lineTo(bx, by + bh); ctx.lineTo(bx, by + bh - arm);
    ctx.stroke();
    if (art) { ctx.globalAlpha = a * 0.7 * k * fl; ctx.drawImage(artPanel(art, A).c, x0, yT, A, A); }
    // the label: a small live level meter while playing
    const ly = yT + 7 * S;
    let lx = tx;
    if (playing) {
      ctx.globalAlpha = a * 0.7; ctx.fillStyle = NCC.magenta;
      for (let i = 0; i < 4; i++) {
        const h = (0.3 + 0.7 * U.clamp(0.5 + 0.5 * U.noise1(t * 2.3 + i * 3.1))) * 12 * S;
        ctx.fillRect(lx + i * 5.5 * S, ly + 6 * S - h, 3 * S, h);
      }
      lx += 30 * S;
    }
    txt(ctx, playing ? "NOW PLAYING" : "PAUSED", lx, ly, lpx, NC.magenta, a * 0.65 * k, 0, 0, Math.round(3 * S));
    if (L.title) {
      txt(ctx, L.title, tx - 2 * S, yT + 37 * S, tpx, C.red, a * 0.28 * k, 0, 0, tr);
      txt(ctx, L.title, tx, yT + 37 * S, tpx, NC.cyan, a * 0.85 * k * fl, 0, g, tr);
    }
    if (L.artist) txt(ctx, L.artist, tx, yT + (L.title ? 63 : 37) * S, apx, C.cyanDim, a * 0.6 * k, 0, 0, tr);
    const fr = npFrac(np);
    if (fr >= 0) {
      const hy = yT + 81 * S;
      ctx.lineWidth = 1.4 * S; ctx.strokeStyle = NCC.cyan;
      ctx.globalAlpha = a * 0.2 * k; ctx.beginPath(); ctx.moveTo(tx, hy); ctx.lineTo(tx + tw, hy); ctx.stroke();
      ctx.globalAlpha = a * 0.65 * k; ctx.beginPath(); ctx.moveTo(tx, hy); ctx.lineTo(tx + tw * fr, hy); ctx.stroke();
    }
  }

  // ------------------------------------------------------------------ sound: cues on the city's own events
  // Called once per frame after the city is drawn, with the previous frame's time: an event fires when its moment
  // falls between the two (never every frame). The hover and the train peak mid-cue, so they are started ahead of
  // the moment the AV / train is centre screen; thunder is called on the flash (the engine delays it by distance).
  const SND = { t: -1, hoverAt: -1e9 };
  const HOVER_LEAD = 3.75;   // the hover cue peaks ~3-4.5 s in
  function soundCues(f, b) {
    const t = f.t, t0 = SND.t;
    SND.t = t;
    if (!(t0 >= 0) || t <= t0 || t - t0 > 1 || b < 0.75 || !AW.audio) return;
    const dens = U.smoothstep(0, 14400, f.ambientElapsed || 0);
    // the monorail: centre screen 8 s into its 16 s crossing; the train cue peaks ~7 s in
    {
      const P = 46, k1 = Math.floor((t - 1) / P);
      if (k1 > Math.floor((t0 - 1) / P)) AW.audio.cue("train", { pan: 0.7 * ((k1 & 1) ? -1 : 1), distance: 0.35, gain: 0.8 * (1 - 0.4 * wxs.fog) });
    }
    // AVs on the two nearest sky lanes passing centre screen (the far lanes are a hum, not an event)
    const span = W + 240 * S;
    for (let l = 4; l < LANES.length; l++) {
      const L = LANES[l], v = L.v * S, cnt = L.n + (L.m - L.n) * dens, near = L.z > 0.9;
      const ut = W / 2 + 120 * S - HOVER_LEAD * v;
      for (let i = 0; i < L.m; i++) {
        if (U.clamp(cnt - i) < 0.5) continue;
        const c = (i / L.m + L.off + hash(i + l * 9) * 0.12) * span, n1 = Math.floor((t * v + c - ut) / span);
        if (n1 <= Math.floor((t0 * v + c - ut) / span)) continue;
        if ((!near && hash(n1 * 3.7 + i + l) > 0.5) || t - SND.hoverAt < 7) continue;
        SND.hoverAt = t;
        AW.audio.cue("hover", { pan: 0.6 * L.dir, distance: near ? 0.15 : 0.4, gain: (near ? 0.85 : 0.6) * (1 - 0.3 * wxs.fog) });
      }
    }
    // thunder on the flash: the dimmer strikes are the farther ones
    if (wxs.storm > 0.05) {
      const k = Math.floor(t / LT_P), ts = strikeAt(k);
      if (ts >= 0 && t0 < ts && ts <= t) {
        AW.audio.cue("thunder", { distance: 0.2 + 0.7 * (1 - strikeNear(k)), pan: (0.76 * hash(k + 0.77) - 0.38) * 1.6,
          gain: (0.6 + 0.4 * wxs.I) * U.clamp(wxs.storm) });
      }
    }
  }

  // Overlay dimming: while an info panel is up, the HUD (not the city) is drawn into one layer and laid
  // down at 1 - 0.7 * overlay.a. No layer and no extra cost when no overlay is showing.
  let dimL = null;
  function dimBegin(ctx, k) {
    if (k >= 0.999) return ctx;
    if (!dimL) dimL = mk(W, H);
    const x = dimL.x;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, dimL.c.width, dimL.c.height);
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    return x;
  }
  function dimEnd(ctx, x, k) {
    if (x === ctx) return;
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = U.clamp(k);
    ctx.drawImage(dimL.c, 0, 0, W, H);
  }

  // ------------------------------------------------------------------ Night City: the living layer
  // The sun as the city sees it: a low amber bloom that sinks behind the towers at dusk.
  function drawSun(ctx, d, sceneA) {
    const e = d.elevation;
    const sa = U.smoothstep(-7, -1, e) * (1 - U.smoothstep(12, 26, e)) * sceneA;
    if (sa <= 0.004) return;
    let u = 0.5;
    if (d.sunrise && d.sunset) {
      const fa = (d.sunrise.getHours() * 60 + d.sunrise.getMinutes()) / 1440;
      const fb = (d.sunset.getHours() * 60 + d.sunset.getMinutes()) / 1440;
      u = U.clamp((d.dayFraction - fa) / Math.max(0.01, fb - fa), -0.05, 1.05);
    }
    const sx = W * U.lerp(0.12, 0.88, u), sy = WL - H * 0.05 - e * H * 0.03, low = 1 - U.smoothstep(1, 10, e);
    ctx.globalAlpha = sa * U.lerp(0.5, 0.85, low);
    const r = U.lerp(300, 420, low) * S;
    ctx.drawImage(sunL.c, sx - r, sy - r, r * 2, r * 2);
  }
  function grad(x, g, a, y0, h, dy) {
    if (a <= 0.004) return;
    x.save(); x.translate(0, dy); x.globalAlpha = U.clamp(a); x.fillStyle = g; x.fillRect(0, y0, W, h); x.restore();
  }
  // Back of the city (cacheable): sky, stars, sun, far wall, smog, mid megabuildings + the corp tower.
  function paintBack(x, d, rise) {
    drawSky(d.elevation);
    x.globalAlpha = 1; x.drawImage(skyL.c, 0, 0, W, H);
    const nightA = (1 - U.smoothstep(-14, -4, d.elevation)) * wxs.stars;
    if (nightA > 0.01) { x.globalAlpha = nightA * 0.8; x.drawImage(starsL.c, 0, 0, W, H * 0.5); }
    drawSun(x, d, wxs.sun);
    const fog = wxs.fog, smog = smogK;
    x.globalAlpha = 1 - 0.85 * fog; layer(x, farL, rise * 1.4);
    dust(x, runsFar, wxs.dust * 0.22 * (1 - 0.8 * fog), 1 * S, rise * 1.4);
    grad(x, smogG, 0.55 * smog + 0.9 * fog, WL - H * 0.45, H * 0.45 + 2, rise * 1.3);
    x.globalAlpha = 1; layer(x, midL, rise * 1.2);
    dust(x, runsMid, wxs.dust * 0.35 * (1 - 0.5 * fog), 1.2 * S, rise * 1.2);
    grad(x, smogG, 0.35 * fog, WL - H * 0.45, H * 0.45 + 2, rise * 1.2);
  }
  function paintFront(x, rise) {
    x.globalAlpha = 1; layer(x, nearL, rise);
    dust(x, runsNear, wxs.dust * 0.55, 1.6 * S, rise);
    grad(x, lowG, 0.6 * smogK + 0.8 * wxs.fog, WL - H * 0.16, H * 0.16 + 2, rise);
  }

  // ---- searchlights: long faint beams sweeping the low deck (baked wedge, rotated)
  let beamC = null, wedgeC = null;
  function buildBeams() {
    beamC = mk(64, 512);
    let x = beamC.x, g = x.createLinearGradient(0, 512, 0, 0);
    const c = U.safe(NC.beam);
    g.addColorStop(0, U.rgba(c, 0.16)); g.addColorStop(0.5, U.rgba(c, 0.06)); g.addColorStop(1, U.rgba(c, 0));
    x.fillStyle = g; x.beginPath(); x.moveTo(30, 512); x.lineTo(0, 0); x.lineTo(64, 0); x.lineTo(34, 512); x.closePath(); x.fill();
    // projector wedge for holograms: apex at the left, opening right
    wedgeC = mk(256, 64);
    x = wedgeC.x; g = x.createLinearGradient(0, 0, 256, 0);
    const hc = U.safe(NC.cyan);
    g.addColorStop(0, U.rgba(hc, 0.2)); g.addColorStop(1, U.rgba(hc, 0.03));
    x.fillStyle = g; x.beginPath(); x.moveTo(0, 31); x.lineTo(256, 0); x.lineTo(256, 64); x.lineTo(0, 33); x.closePath(); x.fill();
  }
  function drawSearch(ctx, t, a) {
    if (a <= 0.004) return;
    ctx.globalCompositeOperation = "lighter";
    const len = H * 0.95, bw = W * 0.07;
    for (let i = 0; i < searchSrc.length; i++) {
      const s = searchSrc[i], ang = s.a + 0.38 * Math.sin(t * 0.055 + s.ph);
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(ang);
      ctx.globalAlpha = U.clamp(a); ctx.drawImage(beamC.c, -bw / 2, -len, bw, len);
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";
  }
  // a projector beam from (x0, y0) toward (x1, y1), opening to `open` px
  function projBeam(ctx, x0, y0, x1, y1, open, a) {
    if (a <= 0.004) return;
    const dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy);
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(Math.atan2(dy, dx));
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = U.clamp(a);
    ctx.drawImage(wedgeC.c, 0, -open / 2, len, open);
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  // ---- the koi: a giant translucent hologram swimming slow loops between the towers
  const KN = 24;
  const KX = new Float32Array(KN), KY = new Float32Array(KN), KNX = new Float32Array(KN), KNY = new Float32Array(KN), KW = new Float32Array(KN);
  let holoC = null, scanPat = null, RX = 0, RY = 0, RW = 0, RH = 0;
  function buildHolo() {
    RX = W * 0.1; RY = H * 0.32; RW = W * 0.44; RH = H * 0.42;
    holoC = mk(RW, RH);
    const sc = document.createElement("canvas"), st = Math.max(3, Math.round(3 * DPR));
    sc.width = 1; sc.height = st;
    const sx = sc.getContext("2d"); sx.fillStyle = "rgba(0,0,0,0.6)"; sx.fillRect(0, 0, 1, Math.max(1, Math.round(DPR)));
    scanPat = holoC.x.createPattern(sc, "repeat");
  }
  // the swim: a slow circle in 3D (seen from a little above), so at the turns the koi swims toward or
  // away from us and foreshortens instead of folding. out = [x, y, scale]
  function koiPath(tau, out) {
    const R = W * 0.13, z = Math.sin(tau);
    out[0] = W * 0.31 + R * Math.cos(tau);
    out[1] = H * 0.52 + R * 0.24 * z + H * 0.03 * Math.sin(tau * 0.37 + 1);
    out[2] = 1 + 0.2 * z;
  }
  const KP = new Float32Array(3), KS = new Float32Array(KN);
  function koiOutline(x, ox, oy) {
    x.beginPath();
    x.moveTo(KX[0] + KNX[0] * KW[0] + ox, KY[0] + KNY[0] * KW[0] + oy);
    for (let j = 1; j < KN; j++) x.lineTo(KX[j] + KNX[j] * KW[j] + ox, KY[j] + KNY[j] * KW[j] + oy);
    for (let j = KN - 1; j >= 0; j--) x.lineTo(KX[j] - KNX[j] * KW[j] + ox, KY[j] - KNY[j] * KW[j] + oy);
    x.closePath();
  }
  function koiFins(x, t, L, ox, oy) {
    // tail: two flowing lobes
    const e = KN - 1, tx = KX[e] + ox, ty = KY[e] + oy, dx = KX[e] - KX[e - 2], dy = KY[e] - KY[e - 2], dl = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / dl, uy = dy / dl, sw = Math.sin(t * 1.7) * 0.25;
    for (let s = -1; s <= 1; s += 2) {
      const lx = tx + ux * L * 0.2 + (-uy) * L * (0.11 * s + sw * 0.06), ly = ty + uy * L * 0.2 + ux * L * (0.11 * s + sw * 0.06);
      x.moveTo(tx, ty); x.quadraticCurveTo(tx + ux * L * 0.08 + (-uy) * L * 0.02 * s, ty + uy * L * 0.08 + ux * L * 0.02 * s, lx, ly);
      x.quadraticCurveTo(tx + ux * L * 0.12, ty + uy * L * 0.12, tx, ty);
    }
    // pectoral fins, flapping
    const j = 5, fl = 0.6 + 0.4 * Math.sin(t * 1.3);
    for (let s = -1; s <= 1; s += 2) {
      const bx = KX[j] + KNX[j] * KW[j] * s + ox, by = KY[j] + KNY[j] * KW[j] * s + oy;
      const fx = bx + KNX[j] * s * L * 0.1 * fl - (KX[j - 1] - KX[j + 2]) * 0.5, fy = by + KNY[j] * s * L * 0.1 * fl - (KY[j - 1] - KY[j + 2]) * 0.5;
      x.moveTo(bx, by); x.quadraticCurveTo((bx + fx) / 2 + KNX[j] * s * 6 * S, (by + fy) / 2 + KNY[j] * s * 6 * S, fx, fy);
      x.lineTo(KX[j + 2] + KNX[j + 2] * KW[j + 2] * s + ox, KY[j + 2] + KNY[j + 2] * KW[j + 2] * s + oy);
    }
  }
  function drawKoi(ctx, t, a, dy) {
    if (a <= 0.004) return;
    // spine along the swim path; the body undulates as it goes
    const L = W * 0.19, tau = t * 0.042, dtau = (L / (KN - 1)) / (W * 0.13);
    for (let j = 0; j < KN; j++) {
      koiPath(tau - j * dtau, KP);
      KX[j] = KP[0]; KY[j] = KP[1]; KS[j] = KP[2];
    }
    for (let j = 0; j < KN; j++) {
      const a0 = Math.max(0, j - 1), a1 = Math.min(KN - 1, j + 1);
      let tx = KX[a0] - KX[a1], ty = KY[a0] - KY[a1];
      const tl = Math.sqrt(tx * tx + ty * ty) || 1; tx /= tl; ty /= tl;
      KNX[j] = -ty; KNY[j] = tx;
      const u = j / (KN - 1);
      const wave = Math.sin(j * 0.42 - t * 2) * L * 0.04 * Math.pow(u, 1.4);
      KX[j] += KNX[j] * wave; KY[j] += KNY[j] * wave;
      KW[j] = L * 0.105 * Math.sin(Math.PI * Math.pow(0.04 + 0.96 * u, 0.6)) * (1 - 0.55 * u) * KS[j];
    }
    const x = holoC.x;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = "source-over"; x.globalAlpha = 1;
    x.clearRect(0, 0, holoC.c.width, holoC.c.height);
    x.setTransform(DPR, 0, 0, DPR, -RX * DPR, -RY * DPR);
    x.lineJoin = "round"; x.lineCap = "round";
    // body: a faint cyan fill, red-magenta koi markings inside it, then a crisp outline
    koiOutline(x, 0, 0);
    x.fillStyle = NCC.cyan; x.globalAlpha = 0.2; x.fill();
    x.globalCompositeOperation = "source-atop";
    x.fillStyle = NCC.magenta;
    for (let k = 0; k < 4; k++) {
      const j = 3 + k * 4, rr = KW[j] * (0.7 + 0.25 * Math.sin(k * 2.1));
      x.globalAlpha = 0.42; x.beginPath(); x.arc(KX[j] + KNX[j] * KW[j] * 0.3 * (k & 1 ? 1 : -1), KY[j] + KNY[j] * KW[j] * 0.3 * (k & 1 ? 1 : -1), rr, 0, U.TAU); x.fill();
    }
    x.globalCompositeOperation = "source-over";   // within the hologram nothing stacks past its colours
    // chromatic edge split: red to one side, cyan to the other
    x.lineWidth = 1.3 * S;
    koiOutline(x, -2.2 * S, 0); x.strokeStyle = NCC.red; x.globalAlpha = 0.35; x.stroke();
    x.beginPath(); koiFins(x, t, L, -2.2 * S, 0); x.stroke();
    koiOutline(x, 0, 0); x.strokeStyle = NCC.cyan; x.globalAlpha = 0.85; x.stroke();
    x.beginPath(); koiFins(x, t, L, 0, 0); x.globalAlpha = 0.6; x.stroke();
    x.globalAlpha = 0.12; x.fillStyle = NCC.cyan; x.fill();
    // dorsal line and eyes
    x.beginPath(); x.moveTo(KX[4], KY[4]);
    for (let j = 5; j < KN - 4; j++) x.lineTo(KX[j], KY[j]);
    x.globalAlpha = 0.35; x.stroke();
    x.fillStyle = NCC.yellow; x.globalAlpha = 0.7;
    for (let s = -1; s <= 1; s += 2) { x.beginPath(); x.arc(KX[1] + KNX[1] * KW[1] * 0.55 * s, KY[1] + KNY[1] * KW[1] * 0.55 * s, 1.6 * S, 0, U.TAU); x.fill(); }
    // scanlines carved through, on the device pixel grid
    x.globalCompositeOperation = "destination-out"; x.globalAlpha = 1;
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = scanPat; x.fillRect(0, 0, holoC.c.width, holoC.c.height);
    x.globalCompositeOperation = "source-over";
    // the projector throws it up from the roof below
    projBeam(ctx, projKoi.x, projKoi.y + dy, KX[8], KY[8] + dy, KW[8] * 5, a * 0.5);
    // onto the wall, translucent (source-over: over the red tower edge it must not add past the cap),
    // with a rare glitch (sliced and offset for a fifth of a second)
    ctx.globalCompositeOperation = "source-over";
    const gp = (t + 3) % 13.7, glitch = gp < 0.22;
    if (glitch) {
      const n = 7, sh = holoC.c.height / n;
      for (let i = 0; i < n; i++) {
        const off = (hash(i * 3.1 + Math.floor(t * 24)) - 0.5) * 22 * S;
        ctx.globalAlpha = a * (hash(i + Math.floor(t * 30)) < 0.15 ? 0.2 : 0.9);
        ctx.drawImage(holoC.c, 0, i * sh, holoC.c.width, sh, RX + off, RY + dy + i * RH / n, RW, RH / n);
      }
    } else {
      ctx.globalAlpha = U.clamp(a * (0.9 + 0.08 * Math.sin(t * 7.3)));
      ctx.drawImage(holoC.c, RX, RY + dy, RW, RH);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // ---- a rotating holo emblem over the right-hand towers (abstract, original)
  function drawEmblem(ctx, t, a, dy) {
    if (a <= 0.004) return;
    const ex = projEmb.x, ey = H * 0.43 + dy, R = W * 0.034, th = t * 0.35;
    projBeam(ctx, ex, projEmb.y + dy, ex, ey, R * 2.4, a * 0.45);
    // source-over: where the rings cross they must not add up past the cap
    ctx.lineWidth = 1.4 * S;
    for (let k = 0; k < 2; k++) {
      const rot = th + k * Math.PI / 2, sx = Math.abs(Math.cos(rot));
      ctx.globalAlpha = a * (0.55 - 0.15 * k); ctx.strokeStyle = k ? NCC.yellow : NCC.magenta;
      ctx.beginPath(); ctx.ellipse(ex, ey, Math.max(0.5, R * sx), R, 0, 0, U.TAU); ctx.stroke();
    }
    ctx.globalAlpha = a * 0.6; ctx.strokeStyle = NCC.magenta;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const an = th * 1.6 + k * U.TAU / 3, px = ex + Math.cos(an) * R * 0.55 * Math.abs(Math.cos(th)), py = ey + Math.sin(an) * R * 0.55;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = a * 0.3; ctx.strokeStyle = NCC.red;
    ctx.beginPath(); ctx.ellipse(ex - 2 * S, ey, Math.max(0.5, R * Math.abs(Math.cos(th))), R, 0, 0, U.TAU); ctx.stroke();
  }

  // ---- holo billboards: ads cycle; each change is a glitch, and now and then the signal drops
  function drawBoards(ctx, t, a, near, dy) {
    if (a <= 0.004) return;
    // translucent panels; source-over so a sign behind never stacks past the cap
    for (let k = 0; k < boards.length; k++) {
      const bd = boards[k];
      if (bd.near !== near) continue;
      const tt = t + bd.ph, idx = Math.floor(tt / bd.per), ph = tt - idx * bd.per;
      const sp = bd.ads[idx % bd.ads.length], y = bd.y + dy;
      const drop = hash(Math.floor(tt * 1.7) + k * 13) < 0.025 ? 0.25 : 1;
      if (ph < 0.45) {
        const n = 6, sh = sp.c.height / n, prev = bd.ads[(idx + bd.ads.length - 1) % bd.ads.length];
        for (let i = 0; i < n; i++) {
          const src = hash(i + Math.floor(t * 20) + k) < ph / 0.45 ? sp : prev;
          ctx.globalAlpha = a * 0.75 * (hash(i * 7 + Math.floor(t * 25)) < 0.2 ? 0.2 : 1);
          ctx.drawImage(src.c, 0, i * sh, src.c.width, sh, bd.x + (hash(i * 1.3 + Math.floor(t * 30)) - 0.5) * 16 * S, y + i * bd.h / n, bd.w, bd.h / n);
        }
      } else {
        ctx.globalAlpha = a * 0.75 * drop * (0.93 + 0.07 * Math.sin(t * 11 + k));
        ctx.drawImage(sp.c, bd.x, y, bd.w, bd.h);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // ---- neon: soft buzz, the odd stutter; in fog and rain the tubes bloom
  function drawSigns(ctx, t, a, near, dy) {
    if (a <= 0.004) return;
    const bloom = 0.22 * wxs.fog + 0.1 * wxs.wet;
    for (let k = 0; k < signs.length; k++) {
      const s = signs[k];
      if (s.near !== near) continue;
      const buzz = 0.86 + 0.14 * U.noise1(t * 9 + s.seed);
      const ph = t * 0.5 + s.seed, st = hash(Math.floor(ph)) < 0.06 && (ph % 1) < 0.25 ? (hash(Math.floor(t * 18)) < 0.5 ? 0.12 : 0.7) : 1;
      const al = a * (near ? 0.75 : 0.55) * buzz * st * (1 - 0.35 * wxs.fog) * (1 - 0.5 * DAY);
      ctx.globalAlpha = U.clamp(al);
      ctx.drawImage(s.sp.c, s.x, s.y + dy, s.sp.w, s.sp.h);
      if (bloom > 0.004 && DAY < 0.999) glowDot(ctx, s.col, s.x + s.sp.cx, s.y + dy + s.sp.cy, Math.max(s.sp.w, s.sp.h) * 0.9, a * bloom * st * (1 - DAY));
    }
  }

  // ---- air traffic: AVs along sky lanes with short light trails; more of them as the night goes on
  const LANES = [
    { y: 0.235, z: 0.1, dir: -1, v: 26, n: 3, m: 6, off: 0.1 }, { y: 0.3, z: 0.22, dir: 1, v: 38, n: 3, m: 6, off: 0.5 },
    { y: 0.37, z: 0.35, dir: -1, v: 52, n: 2, m: 5, off: 0.3 }, { y: 0.47, z: 0.55, dir: 1, v: 72, n: 2, m: 4, off: 0.8 },
    { y: 0.58, z: 0.75, dir: -1, v: 96, n: 1, m: 3, off: 0.2 }, { y: 0.66, z: 0.95, dir: 1, v: 130, n: 1, m: 3, off: 0.65 },
  ];
  function drawTraffic(ctx, t, a, front, dens, dy) {
    if (a <= 0.004) return;
    const span = W + 240 * S, fa = a * (1 - 0.6 * wxs.fog);
    ctx.lineCap = "round";
    for (let l = 0; l < LANES.length; l++) {
      const L = LANES[l];
      if ((L.z >= 0.5) !== front) continue;
      const cnt = L.n + (L.m - L.n) * dens, sz = (1.6 + 3.2 * L.z) * S, trail = (30 + 110 * L.z) * S;
      for (let i = 0; i < L.m; i++) {
        const vis = U.clamp(cnt - i);
        if (vis <= 0.01) continue;
        let x = ((t * L.v * S + (i / L.m + L.off + hash(i + l * 9) * 0.12) * span) % span) - 120 * S;
        if (L.dir < 0) x = W - x;
        const y = H * L.y + dy + (x / W - 0.5) * H * 0.03 * L.dir + Math.sin(t * 0.4 + i * 2 + l) * 3 * S;
        const al = fa * vis * (0.35 + 0.65 * L.z), nl = 1 - 0.9 * DAY;
        if (DAY > 0.004) {
          ctx.globalAlpha = al * DAY * 0.95; ctx.fillStyle = HULL;
          ctx.fillRect(x - sz * 1.7, y - sz * 0.6, sz * 3.4, sz * 1.2);
          ctx.globalAlpha = al * DAY * 0.7; ctx.fillStyle = GLINT;
          ctx.fillRect(x - sz * 1.1, y - sz * 0.6, sz * 2.2, Math.max(1, sz * 0.28));
        }
        // trail: three fading segments behind
        ctx.strokeStyle = (i + l) % 3 ? NCC.amber : NCC.cyan; ctx.lineWidth = sz * 0.7;
        if (nl > 0.004) for (let s = 0; s < 3; s++) {
          ctx.globalAlpha = al * (0.3 - 0.09 * s) * nl;
          ctx.beginPath(); ctx.moveTo(x - L.dir * trail * s / 3, y); ctx.lineTo(x - L.dir * trail * (s + 1) / 3, y); ctx.stroke();
        }
        // headlight ahead, red tail light, and a blinking nav light on the bigger ones
        ctx.globalAlpha = al * 0.9 * (1 - 0.4 * DAY); ctx.fillStyle = (i + l) % 3 ? NCC.amber : NCC.cyan;
        ctx.fillRect(x + L.dir * sz * 1.2 - sz * 0.5, y - sz * 0.35, sz, sz * 0.7);
        ctx.fillStyle = NCC.red; ctx.globalAlpha = al * 0.8;
        ctx.fillRect(x - L.dir * sz * 1.4 - sz * 0.4, y - sz * 0.3, sz * 0.8, sz * 0.6);
        glowDot(ctx, (i + l) % 3 ? C.amber : NC.cyan, x + L.dir * sz * 1.2, y, sz * 5, al * 0.4 * (1 - 0.75 * DAY));
        if (L.z > 0.3 && ((t + i * 0.37) % 1.3) < 0.12) glowDot(ctx, C.red, x, y - sz, sz * 4, al * 0.6);
      }
    }
  }

  // ---- monorail: every so often a lit train slides along the line, in front of the tower base
  const TRAIN_DASH = [0, 0];
  function drawTrain(ctx, t, a, dy) {
    if (a <= 0.004) return;
    const P = 46, k = Math.floor(t / P), ph = t - k * P, dur = 16;
    if (ph > dur) return;
    const L = 0.2 * W, dir = (k & 1) ? -1 : 1, u = ph / dur;
    let x0 = -L + u * (W + L);
    if (dir < 0) x0 = W - x0 - L;
    const y = trackY + dy, hh = 9 * S, fa = a * (1 - 0.5 * wxs.fog);
    ctx.globalAlpha = 1; ctx.fillStyle = DAY > 0.004 ? trainCss : "#000"; ctx.fillRect(x0, y - hh, L, hh);
    ctx.globalAlpha = fa * 0.5; ctx.strokeStyle = NCC.rimMid; ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.moveTo(x0, y - hh); ctx.lineTo(x0 + L, y - hh); ctx.stroke();
    TRAIN_DASH[0] = 6 * S; TRAIN_DASH[1] = 3 * S;
    ctx.setLineDash(TRAIN_DASH);
    ctx.globalAlpha = fa * 0.6 * (1 - DAY); ctx.strokeStyle = NCC.cyan; ctx.lineWidth = 2.4 * S;
    ctx.beginPath();
    for (let c = 0; c < 5; c++) { const cx = x0 + c * L / 5; ctx.moveTo(cx + 4 * S, y - hh * 0.55); ctx.lineTo(cx + L / 5 - 4 * S, y - hh * 0.55); }
    ctx.stroke();
    if (DAY > 0.004) { ctx.globalAlpha = fa * 0.85 * DAY; ctx.strokeStyle = GLASS; ctx.stroke(); }
    ctx.setLineDash(NODASH);
    glowDot(ctx, C.amber, dir > 0 ? x0 + L : x0, y - hh * 0.5, 16 * S, fa * 0.55 * (1 - 0.6 * DAY));
    glowDot(ctx, C.red, dir > 0 ? x0 : x0 + L, y - hh * 0.5, 8 * S, fa * 0.45 * (1 - 0.5 * DAY));
  }

  // ---- external elevators: glass cars gliding up and down the framing towers
  function drawElevators(ctx, t, a, dy) {
    if (a <= 0.004) return;
    for (let i = 0; i < elevs.length; i++) {
      const e = elevs[i], p = 0.5 - 0.5 * Math.cos(((t + e.ph) / e.per) * U.TAU);
      const y = U.lerp(e.y1, e.y0, p) + dy;
      ctx.globalAlpha = a * 0.7 * (1 - DAY); ctx.fillStyle = NCC.cyan; ctx.fillRect(e.x - 3 * S, y - 5 * S, 6 * S, 10 * S);
      if (DAY > 0.004) {
        ctx.globalAlpha = a * DAY; ctx.fillStyle = "rgb(64,84,90)"; ctx.fillRect(e.x - 3.5 * S, y - 6 * S, 7 * S, 12 * S);
        ctx.fillStyle = "rgb(120,128,128)"; ctx.fillRect(e.x - 3.5 * S, y - 6 * S, 7 * S, Math.max(1, 1.2 * S));
      }
      glowDot(ctx, NC.cyan, e.x, y, 14 * S, a * 0.35 * (1 - 0.8 * DAY));
    }
  }

  // ---- steam from the vents, lit from below by the smog
  function drawSteam(ctx, t, a, dy) {
    if (a <= 0.004) return;
    const lean = (6 + wxs.wind * 1.2) * S;
    for (let v = 0; v < vents.length; v++) {
      const vt = vents[v];
      for (let k = 0; k < 5; k++) {
        const age = (t * 0.09 + vt.ph + k / 5) % 1;
        const x = vt.x + age * age * lean * 4 + U.noise1(t * 0.3 + k * 3.1 + v * 7) * 5 * S * age;
        glowDot(ctx, NC.steam, x, vt.y + dy - age * 64 * S, (5 + 26 * age) * S, a * 0.22 * Math.sin(Math.PI * age) * (1 - DAY));
        if (DAY > 0.004) glowDot(ctx, STEAM_D, x, vt.y + dy - age * 64 * S, (5 + 26 * age) * S, a * 0.3 * Math.sin(Math.PI * age) * DAY);
      }
    }
  }

  // ---- the water plane: the city mirrored below the water line (copied from the canvas itself),
  // in rippled strips; rain and wind break it up
  function drawWater(ctx, t, a) {
    if (a <= 0.004) return;
    const cv = ctx.canvas, n = 12, hh = H - WL, src = H * 0.36;
    const amp = (1.5 + 7 * wxs.wet + wxs.wind * 0.08) * S, sp = 0.5 + 1.2 * wxs.wet;
    ctx.globalAlpha = 1; ctx.fillStyle = DAY > 0.004 ? waterCss : "#000"; ctx.fillRect(0, WL, W, hh);
    for (let k = 0; k < n; k++) {
      const d0 = WL + hh * k / n, d1 = WL + hh * (k + 1) / n, s0 = WL - src * (k + 1) / n, s1 = WL - src * k / n;
      const off = U.noise2(k * 0.7, t * sp) * amp * (1 + k * 0.25);
      ctx.globalAlpha = a * U.lerp(0.42 + 0.2 * wxs.wet, 0.6 + 0.15 * wxs.wet, DAY) * (1 - 0.045 * k);
      ctx.setTransform(DPR, 0, 0, -DPR, off * DPR, DPR * (d0 + d1));
      ctx.drawImage(cv, 0, s0 * DPR, cv.width, (s1 - s0) * DPR, 0, d0, W, d1 - d0);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // the water line catches the neon
    ctx.globalAlpha = a * 0.25 * (1 - DAY); ctx.fillStyle = NCC.magenta; ctx.fillRect(0, WL, W, 1 * S);
  }

  // The cloud deck: dim bands lit magenta-orange from below. Broken clouds crossfade to a closed deck.
  // A storm flickers inside it around the strike.
  function drawDeck(ctx, t, sceneA, deckH) {
    const cA = wxs.cloud * sceneA;
    if (cA > 0.004) {
      drawTex(ctx, cloudSp, wxs.drift, 0, deckH, cA * (1 - wxs.full) * (1 - DAY));
      drawTex(ctx, cloudFu, wxs.drift, 0, deckH, cA * wxs.full * (1 - DAY));
    }
    const fl = wxs.storm > 0.01 ? lightning(t) * wxs.storm * sceneA : 0;
    if (fl > 0.004) {
      const x = ltX2d, o = ((wxs.drift % W) + W) % W / W * CT_W;
      x.globalCompositeOperation = "source-over"; x.globalAlpha = 1; x.clearRect(0, 0, CT_W, CT_H);
      x.drawImage(blobC, ltX * CT_W - CT_W * 0.26, CT_H * 0.1, CT_W * 0.52, CT_H * 0.95);
      x.globalCompositeOperation = "source-in";
      x.drawImage(cloudLit, -o, 0); x.drawImage(cloudLit, CT_W - o, 0);
      x.globalCompositeOperation = "source-over";
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = U.clamp(fl); ctx.drawImage(ltC, 0, 0, W, deckH);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  // ------------------------------------------------------------------ Night City by day
  // frame.day (0 = night, 1 = full daylight) crossfades the night city into its daytime self: a hazy
  // smog-yellow / sickly cyan sky with the sun glaring through it (its real position and colour from the
  // elevation: rose at dawn, pale at noon, orange in the golden hour), the towers in their own materials
  // (concrete, steel, teal glass, ochre panels) with their windows dark, a sun side and a shade side, the far
  // wall sunk in smog; neon off, holograms washed out, AVs still running the lanes as dark hulls, the water
  // holding the bright sky. Weather reads in daylight: bright overcast, grey rain, snow on the roofs, milky
  // fog, a storm-dark sky with the lightning inside it.
  // The material layers are baked once per size, lazily the first time it is light (dayFarL / dayMidL /
  // dayNearL); the lit composites (sky, far + mid, near, the clouds' tint) are re-baked per 0.5 deg of sun and
  // per weather step. The work face gets the whole composite (dayAll), very faint, behind the HUD.
  let DAY = 0;
  let bldFar = [], bldMid = [], bldNear = [], bridgeRec = [], shaftRec = [], cloudDens = null;
  let dayBuilt = false, dayAllKey = "", waterCss = "#000", trainCss = "#000";
  let dayFarL = null, dayMidL = null, dayNearL = null, daySkyL = null, dayCityL = null, dayNearC = null, dayAll = null;
  let towerClip = null, cloudSpD = null, cloudFuD = null, fogTexD = null, shR = null, shL = null, ltR = null, ltL = null, fogVeilG = null;
  // materials (their true-ish colours; each depth darkens them by its exposure)
  const DMAT = ["#5a5c5e", "#3e4c5a", "#2e5a60", "#6a5440", "#4a4a54", "#4a5c48", "#5c5048", "#40545a"].map(U.hex);
  const GLASS = "rgb(10,16,20)", GLASS_SKY = "rgb(92,120,124)", TUBE = "rgb(120,112,124)";
  const HULL = "rgb(30,32,36)", GLINT = "rgb(118,124,126)", STEAM_D = U.hex("#86847c");
  const DAY_RAIN = ["rgb(108,118,128)", "rgb(136,146,156)"];
  const rgbC = (c) => "rgb(" + (c.r | 0) + "," + (c.g | 0) + "," + (c.b | 0) + ")";
  const rgbA = (a, al) => "rgba(" + (a[0] | 0) + "," + (a[1] | 0) + "," + (a[2] | 0) + "," + (al == null ? 1 : U.clamp(al)) + ")";

  // the clear sky by the sun's elevation: [elev, zenith, mid, horizon, the sun's glare]; mornings rosier
  const SKY_PM = [
    [-6, [14, 18, 40], [26, 24, 54], [52, 34, 62], [84, 44, 62]],
    [-2, [24, 30, 60], [50, 42, 72], [104, 58, 66], [156, 70, 54]],
    [2, [36, 50, 80], [72, 60, 74], [132, 76, 46], [206, 106, 48]],
    [6, [46, 70, 96], [80, 80, 80], [130, 94, 52], [212, 140, 62]],
    [12, [42, 82, 104], [70, 96, 96], [112, 104, 64], [208, 170, 94]],
    [24, [38, 86, 108], [62, 100, 104], [104, 106, 72], [204, 190, 120]],
  ];
  const SKY_AM = [
    SKY_PM[0],
    [-2, [24, 30, 62], [54, 44, 76], [112, 66, 80], [156, 82, 84]],
    [2, [38, 52, 84], [74, 62, 80], [132, 86, 80], [208, 126, 96]],
    [6, [48, 72, 100], [80, 80, 86], [128, 100, 78], [212, 152, 104]],
    [12, [42, 82, 106], [70, 96, 98], [112, 104, 74], [208, 174, 106]],
    SKY_PM[5],
  ];
  // weather skies at full light (zenith, mid, horizon); dimmed with the sun
  const WX_SKY = {
    ov: [[70, 76, 78], [82, 86, 84], [98, 98, 86]],
    fog: [[52, 54, 54], [68, 70, 66], [92, 92, 82]],
    rain: [[46, 52, 58], [56, 60, 64], [70, 72, 70]],
    storm: [[22, 24, 32], [32, 34, 40], [50, 50, 42]],
    snow: [[78, 84, 94], [90, 94, 102], [104, 106, 108]],
  };
  function skyAt(tab, e, i, out) {
    let k = 0;
    while (k < tab.length - 2 && e > tab[k + 1][0]) k++;
    const a = tab[k], b = tab[k + 1], u = U.smoothstep(a[0], b[0], e);
    for (let j = 0; j < 3; j++) out[j] = U.lerp(a[i][j], b[i][j], u);
    return out;
  }
  const DS = { zen: [0, 0, 0], mid: [0, 0, 0], hor: [0, 0, 0], glare: [0, 0, 0], disc: [0, 0, 0], water: [0, 0, 0], ct: [0, 0, 0], cb: [0, 0, 0],
    t1: [0, 0, 0], t2: [0, 0, 0], sunX: 0, sunY: 0, sunA: 0, glareA: 0, glareR: 0.6, clearW: 1, low: 0, shadeA: 0, shadeW: 0.4, litA: 0,
    hazeF: 0.5, hazeM: 0.2, hazeN: 0.05, fog: 0, dust: 0, cover: 0, expo: 9, expoT: 1, key: "" };
  const DAY_TARGET = 37;   // mean luminance the day scene may reach (the budget is 45; the clock and life sit on top)
  let meterC = null;
  function meterDay() {
    if (!meterC) { meterC = document.createElement("canvas"); meterC.width = 96; meterC.height = 54; }
    const x = meterC.getContext("2d");   // (a GPU canvas: the big layers scale down on the GPU, only 96 x 54 comes back)
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    x.clearRect(0, 0, 96, 54); x.drawImage(dayAll.c, 0, 0, 96, 54);
    const p = x.getImageData(0, 0, 96, 54).data;
    let s = 0;
    for (let i = 0; i < p.length; i += 4) s += 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
    return s / (96 * 54);
  }
  // The day's light from the sun and the weather, quantised (0.5 deg of sun, tenth steps of weather) so a
  // bake is a pure function of its key. Returns true when the key moved.
  function dayParams(d, now) {
    const P = DS, e0 = d.elevation;
    let u = 0.5;
    if (d.sunrise && d.sunset) {
      const fa = (d.sunrise.getHours() * 60 + d.sunrise.getMinutes()) / 1440;
      const fb = (d.sunset.getHours() * 60 + d.sunset.getMinutes()) / 1440;
      u = U.clamp((d.dayFraction - fa) / Math.max(0.01, fb - fa), -0.1, 1.1);
    }
    const q = (v, n) => Math.round(U.clamp(v) * n) / n;
    const e = Math.round(e0 * 2) / 2, qu = Math.round(u * 200) / 200, am = q(U.smoothstep(0.56, 0.44, u), 10), I = wxs.I;
    const wOv = q(wxW[1] * U.smoothstep(0.15, 0.85, I), 10), wFog = q(wxW[2] * (0.6 + 0.4 * I), 10), wRain = q(wxW[3] * (0.55 + 0.45 * I), 10);
    const wSt = q(wxW[4], 10), wSn = q(wxW[5] * (0.6 + 0.4 * I), 10), dst = q(wxs.dust, 10), cov = q(wxs.cloud, 10);
    const key = e + "|" + qu + "|" + am + "|" + wOv + "|" + wFog + "|" + wRain + "|" + wSt + "|" + wSn + "|" + dst + "|" + cov;
    if (key === P.key) return false;
    // re-bake at most twice a second: a change of weather eases in over a few steps instead of every frame
    if (P.key && now - P.bakedAt < 0.5) return false;
    P.bakedAt = now;
    P.key = key;
    const cols = [P.zen, P.mid, P.hor, P.glare];
    for (let i = 0; i < 4; i++) {
      skyAt(SKY_PM, e, i + 1, P.t1); skyAt(SKY_AM, e, i + 1, P.t2);
      for (let j = 0; j < 3; j++) cols[i][j] = U.lerp(P.t1[j], P.t2[j], am);
    }
    const wl = U.lerp(0.22, 1, U.smoothstep(-6, 14, e));
    const wmix = (T, w) => { if (w > 0) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cols[i][j] = U.lerp(cols[i][j], T[i][j] * wl, w); };
    wmix(WX_SKY.ov, wOv); wmix(WX_SKY.fog, wFog); wmix(WX_SKY.rain, wRain); wmix(WX_SKY.storm, wSt); wmix(WX_SKY.snow, wSn);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cols[i][j] *= 0.8;   // the budget: the sky is the brightest thing, and still dim
    const clearW = (1 - 0.85 * wOv) * (1 - 0.9 * wFog) * (1 - wRain) * (1 - wSt) * (1 - 0.9 * wSn);
    P.clearW = clearW; P.fog = wFog; P.dust = dst; P.cover = cov;
    P.low = 1 - U.smoothstep(3, 28, e);
    P.sunX = W * U.lerp(0.12, 0.88, qu);
    P.sunY = WL - H * 0.06 - H * 1.35 * Math.sin(Math.max(-0.12, e * Math.PI / 180));
    P.sunA = U.smoothstep(-2.5, 1, e) * Math.pow(clearW, 3);
    P.glareA = U.smoothstep(-5, 0, e) * (0.08 + 0.92 * clearW);
    P.glareR = U.lerp(0.55, 0.95, P.low);
    P.shadeA = 0.5 * clearW * (0.55 + 0.45 * P.low) * U.smoothstep(-3, 2, e);
    P.shadeW = U.lerp(0.32, 0.6, P.low);
    P.litA = 0.16 * clearW * (0.3 + 0.7 * P.low) * U.smoothstep(-2, 2, e);
    P.hazeF = 0.5 + 0.3 * wFog + 0.12 * wRain;
    P.hazeM = 0.16 + 0.3 * wFog + 0.12 * wRain + 0.08 * P.low;
    P.hazeN = 0.04 + 0.45 * wFog + 0.08 * wRain;
    for (let j = 0; j < 3; j++) {
      P.disc[j] = U.lerp(P.glare[j], [215, 205, 160][j], 0.5 * (1 - P.low));
      P.water[j] = U.lerp(P.zen[j], P.mid[j], 0.3) * 0.45;
      // clouds: tops in the light, bases in shade (the golden hour lights their undersides)
      P.ct[j] = Math.min(196, U.lerp(P.mid[j] * 1.25, P.glare[j] * 0.85, 0.3 * clearW));
      P.cb[j] = U.lerp(U.lerp(P.zen[j], P.mid[j], 0.5) * 0.72, P.glare[j] * 0.6, 0.3 * P.low * clearW);
    }
    const dc = U.safe({ r: P.disc[0], g: P.disc[1], b: P.disc[2] });
    P.disc[0] = dc.r; P.disc[1] = dc.g; P.disc[2] = dc.b;
    return true;
  }

  // 64 x 1 gradient strips: shade (black) and sun (the glare colour), stretched over a tier's side
  function strip(c, col, a0, a1) {
    const x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 64, 0);
    x.clearRect(0, 0, 64, 1);
    g.addColorStop(0, rgbA(col, a0)); g.addColorStop(1, rgbA(col, a1));
    x.fillStyle = g; x.fillRect(0, 0, 64, 1);
  }
  function stripCanvas() { const c = document.createElement("canvas"); c.width = 64; c.height = 1; return c; }
  function clearL(L) {
    const x = L.x;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, L.c.width, L.c.height);
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    return x;
  }

  // one megabuilding in daylight: its material, the glass grid (dark; a few panes catch the sky), floor
  // plates, fins, the roof edge in the light, the night's neon tube unlit, masts dark against the sky
  function paintMegaDay(x, b, L, r) {
    const base = U.safe(U.scale(DMAT[b.mat], L.exp));
    const wall = rgbC(base), dark = rgbC(U.scale(base, 0.5)), hi = rgbC(U.safe(U.scale(base, 1.5)));
    for (let i = 0; i < b.tiers.length; i++) {
      const t = b.tiers[i], w = t.x1 - t.x0, h = t.y1 - t.y0;
      x.globalAlpha = 1; x.fillStyle = wall; x.fillRect(t.x0, t.y0, w, h);
      const p = new Path2D(), q = new Path2D();
      if (b.style === 1) {
        for (let yy = t.y0 + L.sy * 0.7; yy < t.y1 - 2 * S; yy += L.sy) {
          p.rect(t.x0 + 2 * S, yy, w - 4 * S, Math.max(1, L.wh * 0.7));
          if (r() < 0.12) q.rect(t.x0 + 2 * S + r() * w * 0.5, yy, w * (0.1 + 0.3 * r()), Math.max(1, L.wh * 0.7));
        }
      } else {
        for (let yy = t.y0 + L.sy * 0.7; yy < t.y1 - L.wh; yy += L.sy)
          for (let xx = t.x0 + L.sx * 0.5; xx + L.ww < t.x1 - 1 * S; xx += L.sx) (r() < 0.09 ? q : p).rect(xx, yy, L.ww, L.wh);
      }
      x.fillStyle = GLASS; x.globalAlpha = L.glass; x.fill(p);
      x.fillStyle = GLASS_SKY; x.globalAlpha = 0.3; x.fill(q);
      if (b.style === 2 && w > 30 * S) {
        const n = 2 + ((r() * 2) | 0);
        x.globalAlpha = 0.4; x.fillStyle = hi;
        for (let j = 0; j < n; j++) x.fillRect(t.x0 + w * (j + 1) / (n + 1), t.y0 + 4 * S, Math.max(1, 1.6 * S * L.k), h - 8 * S);
      }
      x.lineWidth = 1 * S;
      if (L.rib > 0) {
        x.globalAlpha = 0.45; x.strokeStyle = dark; x.beginPath();
        for (let yy = t.y0 + L.rib; yy < t.y1 - 4 * S; yy += L.rib) { x.moveTo(t.x0, yy); x.lineTo(t.x1, yy); }
        x.stroke();
      }
      if (L.fins && w > 60 * S) {
        x.globalAlpha = 0.35; x.strokeStyle = hi; x.beginPath();
        x.moveTo(t.x0 + 5 * S, t.y0 + 3 * S); x.lineTo(t.x0 + 5 * S, t.y1); x.moveTo(t.x1 - 5 * S, t.y0 + 3 * S); x.lineTo(t.x1 - 5 * S, t.y1);
        x.stroke();
      }
      x.globalAlpha = 0.65; x.fillStyle = hi; x.fillRect(t.x0, t.y0, w, Math.max(1, 1.3 * S));
      if (t.trim != null) {
        x.globalAlpha = 0.5; x.strokeStyle = TUBE; x.lineWidth = 1.4 * S;
        x.beginPath(); x.moveTo(t.x0 + 3 * S, t.trim); x.lineTo(t.x1 - 3 * S, t.trim); x.stroke();
      }
    }
    const R = b.roof, top = b.tiers[b.tiers.length - 1], cx = (top.x0 + top.x1) / 2;
    if (!R) return;
    x.globalAlpha = 0.9; x.strokeStyle = dark; x.lineWidth = 1.3 * S; x.beginPath();
    if (R.q < 0.45) {
      x.moveTo(cx, top.y0); x.lineTo(cx, top.y0 - R.mh);
      if (R.two) { x.moveTo(cx - 6 * S, top.y0); x.lineTo(cx - 6 * S, top.y0 - R.mh * 0.5); }
      x.stroke();
      x.globalAlpha = 0.55; x.fillStyle = "rgb(150,40,40)"; x.fillRect(cx - 1 * S, top.y0 - R.mh - 1 * S, 2 * S, 2 * S);
    } else if (R.q < 0.7) {
      for (let j = 0; j < R.ah.length; j++) { const ax = top.x0 + 6 * S + j * 4 * S; x.moveTo(ax, top.y0); x.lineTo(ax, top.y0 - R.ah[j]); }
      x.moveTo(top.x1 - 8 * S, top.y0 - 6 * S); x.arc(top.x1 - 12 * S, top.y0 - 6 * S, 4 * S, 0, Math.PI, true);
      x.stroke();
    }
  }

  // the corp tower by day: graphite cladding with a sheen, the same lines in steel, dark glass slits, the
  // lobby; its red edges and glyph are paint now, not light
  function paintTowerDay(x) {
    const cx = TCX, pw = 0.108 * W, bw = 0.084 * W, uw = 0.07 * W;
    const y0 = H * 0.022, yCrown = H * 0.1, yShoulder = H * 0.165, yLedge = H * 0.44, yChamf = H * 0.4, yPod = H * 0.8;
    let g = x.createLinearGradient(cx - pw, 0, cx + pw, 0);
    g.addColorStop(0, "rgb(28,29,34)"); g.addColorStop(0.42, "rgb(44,45,52)"); g.addColorStop(0.58, "rgb(40,41,48)"); g.addColorStop(1, "rgb(24,25,30)");
    x.globalAlpha = 1; x.fillStyle = g; x.fill(towerPath);
    x.save(); x.clip(towerPath);
    x.strokeStyle = "rgb(70,72,80)"; x.lineWidth = 1 * S;
    x.globalAlpha = 0.35; x.beginPath();
    for (let yy = yCrown + 20 * S; yy < WL; yy += 20 * S) { x.moveTo(cx - pw, yy); x.lineTo(cx + pw, yy); }
    x.stroke();
    x.globalAlpha = 0.6; x.beginPath();
    for (let yy = yCrown + 100 * S; yy < WL; yy += 100 * S) { x.moveTo(cx - pw, yy); x.lineTo(cx + pw, yy); x.moveTo(cx - pw, yy + 3 * S); x.lineTo(cx + pw, yy + 3 * S); }
    for (const k of [-0.62, -0.5, 0.5, 0.62]) { x.moveTo(cx + uw * k, yCrown); x.lineTo(cx + uw * k, WL); }
    x.moveTo(cx, yCrown); x.lineTo(cx, WL);
    x.stroke();
    x.globalAlpha = 0.7; x.fillStyle = GLASS;
    const r = U.rng(808);
    for (let yy = yShoulder + 40 * S; yy < WL - 20 * S; yy += 13 * S) {
      for (let k = -3; k <= 3; k++) { if (r() < 0.3) x.fillRect(cx + k * uw * 0.24 - 1 * S, yy, 2 * S, 5 * S); }
    }
    // the lobby: a wall of glass holding the street
    g = x.createLinearGradient(0, yPod, 0, WL);
    g.addColorStop(0, "rgb(30,44,48)"); g.addColorStop(1, "rgb(54,70,72)");
    x.globalAlpha = 0.9; x.fillStyle = g; x.fillRect(cx - pw + 6 * S, yPod + 6 * S, pw * 2 - 12 * S, WL - yPod - 8 * S);
    x.globalAlpha = 0.5; x.fillStyle = "rgb(20,22,26)";
    for (let xx = cx - pw + 6 * S; xx < cx + pw - 6 * S; xx += 26 * S) x.fillRect(xx, yPod + 6 * S, 2 * S, WL - yPod - 8 * S);
    x.restore();
    x.fillStyle = "rgb(150,34,36)";
    x.globalAlpha = 0.8; x.fillRect(cx - uw + 3 * S, yCrown + 6 * S, uw * 2 - 6 * S, 1.6 * S);
    x.globalAlpha = 0.45; x.fillRect(cx - uw + 3 * S, yCrown + 12 * S, uw * 2 - 6 * S, 1 * S);
    x.globalAlpha = 0.6; x.fillRect(cx - uw * 0.46 + 3 * S, H * 0.07 + 5 * S, uw * 0.92 - 6 * S, 1.2 * S);
    x.globalAlpha = 0.85; x.strokeStyle = "rgb(150,34,36)"; x.lineWidth = 1.6 * S; x.lineJoin = "miter";
    x.stroke(towerPath);
    x.globalAlpha = 0.4; x.lineWidth = 1 * S; x.beginPath();
    for (const s of [-1, 1]) {
      x.moveTo(cx + s * (bw - 7 * S), yPod - H * 0.02); x.lineTo(cx + s * (bw - 7 * S), yLedge + 3 * S);
      x.lineTo(cx + s * (uw - 7 * S), yChamf + 3 * S); x.lineTo(cx + s * (uw - 7 * S), yCrown - H * 0.03);
    }
    x.stroke();
    const gy = H * 0.128, gr = H * 0.022;
    x.globalAlpha = 0.85; x.strokeStyle = "rgb(164,40,40)"; x.lineWidth = 1.8 * S;
    x.beginPath();
    for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3, px = cx + Math.cos(a) * gr, py = gy + Math.sin(a) * gr; k ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.moveTo(cx - gr * 0.55, gy - gr * 0.32); x.lineTo(cx + gr * 0.55, gy - gr * 0.32); x.lineTo(cx, gy + gr * 0.62); x.closePath();
    x.moveTo(cx - gr * 1.45, gy); x.lineTo(cx - gr * 1.1, gy); x.moveTo(cx + gr * 1.1, gy); x.lineTo(cx + gr * 1.45, gy);
    x.stroke();
  }

  // the static day layers, baked once per size the first time it is light
  function buildDay() {
    dayBuilt = true; DS.key = ""; dayAllKey = ""; dayCloudKey = ""; DS.first = true; DS.stage = 0; DS.meterDue = false; DS.meteredAt = -1e9;
    towerClip = new Path2D(); towerClip.rect(0, 0, W, H); towerClip.addPath(towerPath);
    dayFarL = mk(W, H); dayMidL = mk(W, H); dayNearL = mk(W, H);
    daySkyL = mk(W, H); dayCityL = mk(W, H); dayNearC = mk(W, H); dayAll = mk(W, H);
    const r = U.rng(5150);
    // far: thin towers, pinprick glass (the haze does the rest at bake time)
    const LF = { exp: 0.62, k: 0.6, sx: 5 * S, sy: 6 * S, ww: 1.6 * S, wh: 2 * S, rib: 0, fins: false, glass: 0.45 };
    for (const b of bldFar) { b.mat = (r() * DMAT.length) | 0; paintMegaDay(dayFarL.x, b, LF, r); }
    // mid: megabuildings, skybridges, the corp tower, the monorail
    const LM = { exp: 0.46, k: 0.85, sx: 8 * S, sy: 10 * S, ww: 2.8 * S, wh: 3.6 * S, rib: 30 * S, fins: true, glass: 0.6 };
    for (const b of bldMid) { b.mat = (r() * DMAT.length) | 0; paintMegaDay(dayMidL.x, b, LM, r); }
    let x = dayMidL.x;
    for (let i = 0; i < bridgeRec.length; i += 3) {
      const xa = bridgeRec[i], xb = bridgeRec[i + 1], y = bridgeRec[i + 2], h = 6 * S;
      x.globalAlpha = 1; x.fillStyle = "rgb(56,58,60)"; x.fillRect(xa, y, xb - xa, h);
      x.globalAlpha = 0.65; x.fillStyle = GLASS; x.fillRect(xa, y + h * 0.3, xb - xa, h * 0.4);
      x.globalAlpha = 0.6; x.fillStyle = "rgb(96,98,98)"; x.fillRect(xa, y, xb - xa, Math.max(1, 1 * S));
    }
    paintTowerDay(x);
    x.globalAlpha = 1; x.fillStyle = "rgb(58,60,60)"; x.fillRect(0, trackY, W, 5 * S);
    x.globalAlpha = 0.8; x.fillStyle = "rgb(92,94,92)"; x.fillRect(0, trackY, W, Math.max(1, 1.2 * S));
    x.globalAlpha = 1; x.fillStyle = "rgb(40,42,42)";
    for (let i = 0; i < pylonX.length; i++) x.fillRect(pylonX[i] - 3 * S, trackY + 5 * S, 6 * S, WL - trackY - 5 * S);
    // near: the framing megastructures, darker (closer, more of them in their own shade), the elevator shafts
    const LN = { exp: 0.3, k: 1, sx: 11 * S, sy: 14 * S, ww: 4.6 * S, wh: 5.8 * S, rib: 42 * S, fins: true, glass: 0.7 };
    for (const b of bldNear) { b.mat = (r() * DMAT.length) | 0; paintMegaDay(dayNearL.x, b, LN, r); }
    x = dayNearL.x;
    for (let i = 0; i < shaftRec.length; i += 2) {
      const ex = shaftRec[i], yt = shaftRec[i + 1];
      x.globalAlpha = 1; x.fillStyle = "rgb(22,30,34)"; x.fillRect(ex - 3.5 * S, yt, 7 * S, WL - yt);
      x.globalAlpha = 0.7; x.fillStyle = "rgb(74,78,80)"; x.fillRect(ex - 4.5 * S, yt, 1.2 * S, WL - yt); x.fillRect(ex + 3.3 * S, yt, 1.2 * S, WL - yt);
    }
    shR = stripCanvas(); shL = stripCanvas(); ltR = stripCanvas(); ltL = stripCanvas();
    strip(shR, [0, 0, 0], 0, 1); strip(shL, [0, 0, 0], 1, 0);
    const ct = () => { const c = document.createElement("canvas"); c.width = CT_W; c.height = CT_H; return c; };
    cloudSpD = ct(); cloudFuD = ct(); fogTexD = ct();
    texInto(fogTexD, cloudDens.fu, 0.2, () => FOG_D);
    fogVeilG = measure.createLinearGradient(0, WL, 0, WL - H * 0.34);
    fogVeilG.addColorStop(0, "rgba(108,108,98,0.3)"); fogVeilG.addColorStop(1, "rgba(108,108,98,0)");
  }
  const FOG_D = { r: 112, g: 114, b: 110 };
  function texInto(c, dens, amax, fn) {
    const x = c.getContext("2d"), img = x.createImageData(CT_W, CT_H), p = img.data;
    for (let j = 0; j < CT_H; j++) {
      for (let i = 0; i < CT_W; i++) {
        const n = j * CT_W + i, q = n * 4, cc = fn(i, j);
        p[q] = cc.r; p[q + 1] = cc.g; p[q + 2] = cc.b; p[q + 3] = Math.round(255 * amax * dens[n]);
      }
    }
    x.putImageData(img, 0, 0);
  }
  // the clouds in this light: tops lit, bases in shade (or lit warm from below in the golden hour)
  let dayCloudKey = "";
  function bakeDayClouds() {
    const P = DS, tmp = { r: 0, g: 0, b: 0 };
    const ck = P.ct.map((v) => v | 0).join() + "|" + P.cb.map((v) => v | 0).join();
    if (ck === dayCloudKey) return;
    dayCloudKey = ck;
    const fn = (dens) => (i, j) => {
      const v = j / (CT_H - 1), d = dens[j * CT_W + i], below = j + 3 < CT_H ? dens[(j + 3) * CT_W + i] : 0;
      const k = U.clamp(0.18 + 0.55 * v + 1.6 * Math.max(0, d - below));
      tmp.r = U.lerp(P.ct[0], P.cb[0], k) | 0; tmp.g = U.lerp(P.ct[1], P.cb[1], k) | 0; tmp.b = U.lerp(P.ct[2], P.cb[2], k) | 0;
      return tmp;
    };
    texInto(cloudSpD, cloudDens.sp, 0.72, fn(cloudDens.sp));
    texInto(cloudFuD, cloudDens.fu, 0.9, fn(cloudDens.fu));
  }

  // shade the side of every tier that faces away from the sun; light the edge that faces it
  function shadeTiers(x, list, k) {
    const P = DS;
    if (k <= 0.004 || (P.shadeA <= 0.004 && P.litA <= 0.004)) return;
    for (let i = 0; i < list.length; i++) {
      const tiers = list[i].tiers;
      for (let j = 0; j < tiers.length; j++) {
        const t = tiers[j], w = t.x1 - t.x0, h = t.y1 - t.y0;
        if (t.x1 < 0 || t.x0 > W) continue;
        const sR = U.smoothstep(-0.05 * W, 0.05 * W, (t.x0 + t.x1) / 2 - P.sunX);   // 1: the sun is off to the left
        const sw = w * P.shadeW, lw = w * 0.35;
        let a = k * P.shadeA * sR;
        if (a > 0.004) { x.globalAlpha = a; x.drawImage(shR, t.x1 - sw, t.y0, sw, h); }
        a = k * P.shadeA * (1 - sR);
        if (a > 0.004) { x.globalAlpha = a; x.drawImage(shL, t.x0, t.y0, sw, h); }
        a = k * P.litA * sR;
        if (a > 0.004) { x.globalAlpha = a; x.drawImage(ltL, t.x0, t.y0, lw, h); }
        a = k * P.litA * (1 - sR);
        if (a > 0.004) { x.globalAlpha = a; x.drawImage(ltR, t.x1 - lw, t.y0, lw, h); }
      }
    }
  }
  // atmosphere on what is already painted (source-atop: the towers only, never the transparent sky)
  function hazeAtop(x, col, a0, a1, yTop) {
    if (a0 <= 0.004 && a1 <= 0.004) return;
    x.globalCompositeOperation = "source-atop"; x.globalAlpha = 1;
    const g = x.createLinearGradient(0, WL, 0, yTop);
    g.addColorStop(0, rgbA(col, a0)); g.addColorStop(1, rgbA(col, a1));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // the glare washes out whatever stands near the sun
    const P = DS, ga = 0.18 * P.glareA * (0.4 + 0.6 * P.low);
    if (ga > 0.004) {
      const R = H * P.glareR * 0.8, gg = x.createRadialGradient(P.sunX, P.sunY, 0, P.sunX, P.sunY, R);
      gg.addColorStop(0, rgbA(P.glare, ga)); gg.addColorStop(1, rgbA(P.glare, 0));
      x.fillStyle = gg; x.fillRect(P.sunX - R, P.sunY - R, R * 2, R * 2);
    }
    x.globalCompositeOperation = "source-over";
  }
  function paintDaySky(x) {
    const P = DS;
    let g = x.createLinearGradient(0, WL, 0, 0);
    g.addColorStop(0, rgbA(P.hor)); g.addColorStop(0.3, rgbA(P.mid)); g.addColorStop(1, rgbA(P.zen));
    x.globalAlpha = 1; x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (P.glareA > 0.004) {
      // the sun through the smog: a wide bloom, a tighter core, and a streak along the horizon haze
      const R = H * P.glareR;
      g = x.createRadialGradient(P.sunX, P.sunY, 0, P.sunX, P.sunY, R);
      g.addColorStop(0, rgbA(P.glare, 0.62 * P.glareA)); g.addColorStop(0.1, rgbA(P.glare, 0.34 * P.glareA));
      g.addColorStop(0.36, rgbA(P.glare, 0.1 * P.glareA)); g.addColorStop(1, rgbA(P.glare, 0));
      x.fillStyle = g; x.fillRect(P.sunX - R, P.sunY - R, R * 2, R * 2);
      const hr = W * 0.5, ha = P.glareA * 0.3 * (0.3 + 0.7 * P.low);
      x.save(); x.translate(P.sunX, WL); x.scale(1, 0.18);
      g = x.createRadialGradient(0, 0, 0, 0, 0, hr);
      g.addColorStop(0, rgbA(P.glare, ha)); g.addColorStop(1, rgbA(P.glare, 0));
      x.fillStyle = g; x.fillRect(-hr, -hr, hr * 2, hr * 2);
      x.restore();
      // shafts of light fanning down through the smog
      const ra = 0.06 * P.glareA * P.clearW;
      if (ra > 0.004) {
        const L = H * 1.3;
        g = x.createRadialGradient(P.sunX, P.sunY, 0, P.sunX, P.sunY, L);
        g.addColorStop(0, rgbA(P.glare, ra)); g.addColorStop(0.5, rgbA(P.glare, ra * 0.45)); g.addColorStop(1, rgbA(P.glare, 0));
        x.fillStyle = g; x.beginPath();
        for (let k = 0; k < 9; k++) {
          const a0 = Math.PI * (0.12 + 0.76 * k / 8) + 0.05 * Math.sin(k * 7.3), w = 0.025 + 0.02 * ((k * 5) % 3);
          x.moveTo(P.sunX, P.sunY);
          x.lineTo(P.sunX + Math.cos(a0 - w) * L, P.sunY + Math.sin(a0 - w) * L);
          x.lineTo(P.sunX + Math.cos(a0 + w) * L, P.sunY + Math.sin(a0 + w) * L);
          x.closePath();
        }
        x.globalAlpha = 1; x.fill();
      }
    }
    if (P.sunA > 0.004) {
      const r = H * 0.024;
      g = x.createRadialGradient(P.sunX, P.sunY, 0, P.sunX, P.sunY, r * 3.2);
      g.addColorStop(0, rgbA(P.disc, 0.5 * P.sunA)); g.addColorStop(0.3, rgbA(P.disc, 0.3 * P.sunA)); g.addColorStop(1, rgbA(P.disc, 0));
      x.fillStyle = g; x.fillRect(P.sunX - r * 3.2, P.sunY - r * 3.2, r * 6.4, r * 6.4);
      x.globalAlpha = 0.92 * P.sunA; x.fillStyle = rgbA(P.disc);
      x.beginPath(); x.arc(P.sunX, P.sunY, r, 0, U.TAU); x.fill();
    }
  }
  // the lit composites, re-baked when the light or the weather moves a step
  function bakeDay() {
    const P = DS;
    strip(ltL, P.glare, 1, 0); strip(ltR, P.glare, 0, 1);
    paintDaySky(clearL(daySkyL));
    // far + mid with the sky left transparent (the clouds pass behind them)
    let x = clearL(dayCityL);
    x.drawImage(dayFarL.c, 0, 0, W, H);
    shadeTiers(x, bldFar, 0.5);
    hazeAtop(x, P.hor, P.hazeF, P.hazeF * 0.55, WL - H * 0.6);
    dust(x, runsFar, P.dust * 0.45, 1.5 * S, 0);
    x.globalAlpha = 1; x.drawImage(dayMidL.c, 0, 0, W, H);
    // (the towers behind the corp tower keep their shade off its face)
    x.save(); x.clip(towerClip, "evenodd");
    shadeTiers(x, bldMid, 1);
    x.restore();
    if (P.shadeA > 0.004) {
      // the corp tower turns its far side from the sun too
      const sR = U.smoothstep(-0.05 * W, 0.05 * W, TCX - P.sunX), pw = 0.108 * W;
      x.save(); x.clip(towerPath);
      x.globalAlpha = P.shadeA * sR; x.drawImage(shR, TCX, 0, pw, WL);
      x.globalAlpha = P.shadeA * (1 - sR); x.drawImage(shL, TCX - pw, 0, pw, WL);
      x.restore();
    }
    hazeAtop(x, P.hor, P.hazeM, P.hazeM * 0.3, WL - H * 0.7);
    if (P.dust > 0) { x.save(); x.clip(towerClip, "evenodd"); dust(x, runsMid, P.dust * 0.7, 2.2 * S, 0); x.restore(); }
    x = clearL(dayNearC);
    x.drawImage(dayNearL.c, 0, 0, W, H);
    shadeTiers(x, bldNear, 1);
    hazeAtop(x, P.hor, P.hazeN, P.hazeN * 0.2, WL - H * 0.5);
    dust(x, runsNear, P.dust * 0.8, 3 * S, 0);
    x.globalAlpha = 1;
    P.stage = 1;
  }
  // the rest of a bake, one step per frame so no frame carries all of it: the clouds' colour, then the meter.
  // Exposure: meter the whole day scene once per bake and, if this light and weather would run past the budget,
  // settle it under (a veil laid over the day scene; the clock and HUD stay as they are).
  function bakeDayStep() {
    const P = DS;
    if (P.stage === 1) { if (P.cover > 0.02) bakeDayClouds(); P.stage = 2; }
    else if (P.stage === 2) { ensureDayAll(); P.stage = 0; P.meterDue = true; }
  }
  function meterNow(t) {
    const P = DS;
    P.expoT = Math.min(1, DAY_TARGET / Math.max(1, meterDay()));
    if (!(P.expo < 1.5)) P.expo = P.expoT;   // first bake: settle at once; afterwards ease (render)
    P.meterDue = false; P.meteredAt = t;
  }
  // the whole day scene in one image (for the work face's backdrop): sky, clouds where they are now, the
  // city, the water holding it
  function ensureDayAll() {
    if (dayAllKey === DS.key) return;
    dayAllKey = DS.key;
    const x = clearL(dayAll);
    x.drawImage(daySkyL.c, 0, 0, W, H);
    const cA = wxs.cloud;
    if (cA > 0.004) {
      drawTex(x, cloudSpD, wxs.drift, 0, H * 0.62, cA * (1 - wxs.full));
      drawTex(x, cloudFuD, wxs.drift, 0, H * 0.62, cA * wxs.full);
    }
    x.globalAlpha = 1; x.drawImage(dayCityL.c, 0, 0, W, H); x.drawImage(dayNearC.c, 0, 0, W, H);
    if (wxs.fog > 0.004) {
      x.globalAlpha = wxs.fog; x.fillStyle = fogVeilG; x.fillRect(0, WL - H * 0.55, W, H * 0.55);
      drawTex(x, fogTexD, wxs.drift * 0.6 + 300 * S, WL - H * 0.42, H * 0.46, wxs.fog * 0.9);
      drawTex(x, fogTexD, -wxs.drift * 0.4, WL - H * 0.22, H * 0.28, wxs.fog * 0.7);
      x.globalAlpha = 1;
    }
    const hh = H - WL;
    x.fillStyle = rgbA(DS.water); x.fillRect(0, WL, W, hh);
    x.save(); x.setTransform(DPR, 0, 0, -DPR, 0, DPR * 2 * WL);
    x.globalAlpha = 0.6; x.drawImage(dayAll.c, 0, (WL - hh) * DPR, dayAll.c.width, hh * DPR, 0, WL - hh, W, hh);
    x.restore();
    x.globalAlpha = 1;
  }
  // per frame (ambient): the day's sky, its clouds, the far + mid city; and later the near city
  function drawDayBack(ctx, D, rise) {
    ctx.globalAlpha = D; ctx.drawImage(daySkyL.c, 0, 0, W, H);
    const cA = wxs.cloud * D;
    if (cA > 0.004 && DS.cover > 0.02) {
      drawTex(ctx, cloudSpD, wxs.drift, 0, H * 0.62, cA * (1 - wxs.full));
      drawTex(ctx, cloudFuD, wxs.drift, 0, H * 0.62, cA * wxs.full);
    }
    ctx.globalAlpha = D; ctx.drawImage(dayCityL.c, 0, rise * 1.2, W, H);
  }

  let cityBack = null, cityKey = "", smogK = 0.6;
  function drawCity(ctx, f, b) {
    const sceneA = U.smoothstep(0.3, 1, b);
    if (sceneA <= 0.004) { cityKey = ""; if (KITTY) KITTY.draw(ctx, f, KOFF); return; }
    const d = f.signals.daylight || { elevation: -20, light: 0, dayFraction: 0.9 };
    const t = f.t, el = f.ambientElapsed || 0;
    // the city never sleeps: over the evening the smog thickens and the sky lanes fill up
    smogK = 0.55 + 0.45 * U.smoothstep(0, 18000, el);
    const dens = U.smoothstep(0, 14400, el);
    let rise = 0;
    const D = DAY, night = D < 0.999;   // full daylight: the night layers are not painted at all
    if (!night) cityKey = "";
    else if (sceneA >= 0.999) {
      // settled: the back is one cached composite, rebuilt when the sun moves 0.1 deg or the weather/smog moves a step
      const key = Math.round(d.elevation * 10) + "|" + Math.round(wxs.stars * 20) + "|" + Math.round(wxs.fog * 20) +
        "|" + Math.round(wxs.sun * 20) + "|" + Math.round(wxs.dust * 20) + "|" + Math.round(smogK * 40);
      if (key !== cityKey) {
        cityKey = key;
        const xb = cityBack.x;
        xb.setTransform(1, 0, 0, 1, 0, 0); xb.globalAlpha = 1; xb.clearRect(0, 0, cityBack.c.width, cityBack.c.height);
        xb.setTransform(DPR, 0, 0, DPR, 0, 0);
        xb.fillStyle = "#000"; xb.fillRect(0, 0, W, H);
        paintBack(xb, d, 0);
        xb.globalAlpha = 1;
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(cityBack.c, 0, 0, W, H);
    } else {
      // the exhale: layered at full strength with parallax; one black veil fades the whole city in below
      cityKey = "";
      rise = (1 - U.easeOut(sceneA)) * H * 0.05;
      if (night) paintBack(ctx, d, rise);
    }
    // (full daylight: no rise; the city is already there, faint, behind the work face and simply comes forward)
    if (D > 0.004) drawDayBack(ctx, D, rise);
    const dk = 1 - 0.6 * D;   // by day the holograms wash out and the neon is mostly off
    const lifeA = U.smoothstep(0.55, 1, b) / Math.max(0.05, sceneA);   // life arrives after the city (veil compensated)
    drawDeck(ctx, t, 1, H * 0.62);
    drawSearch(ctx, t, (0.5 + 0.7 * wxs.cloud) * (1 - 0.5 * wxs.fog) * U.clamp(lifeA) * (1 - D));
    drawSigns(ctx, t, U.clamp(lifeA), false, rise * 1.2);
    drawBoards(ctx, t, U.clamp(lifeA) * dk, false, rise * 1.2);
    drawEmblem(ctx, t, U.clamp(lifeA) * (1 - 0.4 * wxs.fog) * dk, rise * 1.2);
    drawTrain(ctx, t, U.clamp(lifeA), rise * 1.2);
    drawTraffic(ctx, t, U.clamp(lifeA), false, dens, rise * 1.2);
    drawKoi(ctx, t, U.clamp(lifeA) * (1 - 0.4 * wxs.fog) * (1 - 0.55 * D), rise * 1.1);
    // the storm rim-lights the far and mid skyline and the tower for an instant: lines, never a fill
    const fl = wxs.storm > 0.01 ? lightning(t) * wxs.storm : 0;
    if (fl > 0.004) {
      // (source-over: over the tower's red edge an additive flash would clip)
      ctx.strokeStyle = NCC.bolt; ctx.lineWidth = 1.2 * S;
      ctx.save(); ctx.translate(0, rise * 1.2);
      ctx.globalAlpha = fl * 0.45; ctx.stroke(midTops);
      ctx.globalAlpha = fl * 0.55; ctx.stroke(towerPath);
      ctx.restore();
    }
    if (night) paintFront(ctx, rise);
    if (D > 0.004) { ctx.globalAlpha = D; ctx.drawImage(dayNearC.c, 0, rise, W, H); }
    drawElevators(ctx, t, U.clamp(lifeA), rise);
    drawSteam(ctx, t, U.clamp(lifeA) * (1 - 0.5 * wxs.rain), rise);
    drawSigns(ctx, t, U.clamp(lifeA), true, rise);
    drawBoards(ctx, t, U.clamp(lifeA) * dk, true, rise);
    drawTraffic(ctx, t, U.clamp(lifeA), true, dens, rise);
    // fog: wisps drifting low through the streets (violet in the neon at night, milky by day)
    if (wxs.fog > 0.004) {
      if (night) {
        drawTex(ctx, fogTex, wxs.drift * 0.6 + 300 * S, WL - H * 0.42, H * 0.46, wxs.fog * 0.9 * (1 - D));
        drawTex(ctx, fogTex, -wxs.drift * 0.4, WL - H * 0.22, H * 0.28, wxs.fog * 0.7 * (1 - D));
      }
      if (D > 0.004) {
        ctx.globalAlpha = wxs.fog * D; ctx.fillStyle = fogVeilG; ctx.fillRect(0, WL - H * 0.55, W, H * 0.55);
        drawTex(ctx, fogTexD, wxs.drift * 0.6 + 300 * S, WL - H * 0.42, H * 0.46, wxs.fog * 0.9 * D);
        drawTex(ctx, fogTexD, -wxs.drift * 0.4, WL - H * 0.22, H * 0.28, wxs.fog * 0.7 * D);
      }
    }
    drawWater(ctx, t, 1);
    // the cat on its rooftop ledge, in front of the water (no reflection), behind the HUD and the rain
    drawKitty(ctx, f, U.clamp(lifeA), d);
    // the exhale veil: everything above fades in together, fills stay black (no ghosting)
    if (D > 0.004 && DS.expo < 0.999) { ctx.globalAlpha = (1 - DS.expo) * D; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
    if (sceneA < 0.999) { ctx.globalAlpha = 1 - sceneA; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
  }

  // ------------------------------------------------------------------ the cat (K)
  // A rooftop parapet in the near foreground, bottom right, with an AC unit humming on it; the cat sits on the
  // coping seen from behind, tail hanging over the edge, watching Night City. The neon rim-lights it: magenta
  // from the city on the left, cyan from the right, the deck's violet on the coat; at night its eyes catch the
  // light when it turns (loaf), by day the sun through the smog edges it and it throws a contact shadow. Later in
  // the night it loafs, then curls up asleep on the ledge. The parapet arrives with the cat (scene unchanged
  // without it); the rain falls in front of both.
  let KITTY = null;
  const KOFF = { alpha: 0 };
  const KO = { x: 0, y: 0, size: 0, facing: -1, pose: "back", light: 0.25, tint: null, tintAmt: 0.5, rim: null, glow: 0, shadow: 0, alpha: 1 };
  const K_NEON_L = U.safe(NC.magenta), K_NEON_R = U.safe(NC.cyan), K_VIOLET = U.safe(U.hex("#8a4cb8"));
  const kRims = [{ color: K_NEON_L, a: 0, dx: -1, dy: -0.35, width: 0.04 }, { color: K_NEON_R, a: 0, dx: 1, dy: -0.55 },
    { color: K_NEON_L, a: 0, dx: -0.3, dy: -1 }];
  const kMix = (n, d, k) => "rgb(" + (U.lerp(n[0], d[0], k) | 0) + "," + (U.lerp(n[1], d[1], k) | 0) + "," + (U.lerp(n[2], d[2], k) | 0) + ")";
  function perchGeom() { return { x0: W * 0.7, y0: Math.round(H * 0.94), ax0: W * 0.875, ax1: W * 0.95, ah: 74 * S }; }
  function drawPerch(ctx, t, a) {
    if (a <= 0.004) return;
    const P = perchGeom(), D = DAY, nk = 1 - D, lip = 8 * S;
    ctx.globalAlpha = a;
    // the front face: black at night with the deck's violet catching its top, concrete in shade by day
    ctx.fillStyle = kMix([5, 4, 8], [40, 40, 44], D); ctx.fillRect(P.x0, P.y0, W - P.x0, H - P.y0);
    // panel seams and a rust streak under the pipe
    ctx.fillStyle = kMix([14, 10, 22], [30, 30, 33], D);
    for (let x = P.x0 + 150 * S; x < W; x += 210 * S) ctx.fillRect(x, P.y0 + 10 * S, 1.2 * S, H - P.y0);
    ctx.globalAlpha = a * 0.5; ctx.fillStyle = kMix([16, 8, 12], [58, 44, 36], D);
    ctx.fillRect(P.ax0 - 18 * S, P.y0 + 10 * S, 3 * S, 34 * S);
    ctx.globalAlpha = a;
    // the AC unit on the ledge: a box, a fan grille, a pipe, a status LED
    const ax = P.ax0, aw = P.ax1 - P.ax0, ay = P.y0 - P.ah;
    ctx.fillStyle = kMix([7, 6, 11], [56, 58, 60], D); ctx.fillRect(ax, ay, aw, P.ah);
    ctx.fillStyle = kMix([4, 3, 7], [40, 42, 44], D); ctx.fillRect(ax + aw - 9 * S, ay, 9 * S, P.ah);
    ctx.fillRect(ax - 22 * S, P.y0 - 10 * S, 22 * S, 4 * S);   // the pipe
    const fx = ax + aw * 0.42, fy = ay + P.ah * 0.52, fr = P.ah * 0.34;
    ctx.lineWidth = 1.2 * S;
    ctx.strokeStyle = kMix([30, 22, 46], [30, 32, 34], D);
    ctx.beginPath(); ctx.arc(fx, fy, fr, 0, U.TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(fx, fy, fr * 0.62, 0, U.TAU); ctx.stroke();
    // the fan turning behind the grille
    const ang = t * 7;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const q = ang + i * U.TAU / 3; ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.cos(q) * fr * 0.9, fy + Math.sin(q) * fr * 0.9); }
    ctx.stroke();
    // neon on its edges (night)
    if (nk > 0.004) {
      ctx.globalAlpha = a * 0.5 * nk; ctx.fillStyle = NCC.cyan; ctx.fillRect(ax, ay, aw, 1.2 * S);
      ctx.globalAlpha = a * 0.35 * nk; ctx.fillStyle = NCC.magenta; ctx.fillRect(ax, ay, 1.2 * S, P.ah);
      ctx.globalAlpha = a * nk * (0.5 + 0.5 * (Math.sin(t * 1.3) > 0.6 ? 1 : 0.2));
      ctx.fillStyle = NCC.red; ctx.fillRect(ax + aw - 18 * S, ay + 8 * S, 3 * S, 3 * S);
      ctx.globalAlpha = a;
    }
    // the coping: an overhanging lip, its top catching the city (night) or the sun (day)
    ctx.fillStyle = kMix([9, 7, 13], [62, 62, 64], D); ctx.fillRect(P.x0 - 6 * S, P.y0 - 2 * S, W - P.x0 + 6 * S, lip);
    ctx.fillStyle = kMix([3, 2, 5], [30, 30, 34], D); ctx.fillRect(P.x0 - 6 * S, P.y0 - 2 * S + lip, W - P.x0 + 6 * S, 3 * S);
    if (nk > 0.004) {
      const g = ctx.createLinearGradient(P.x0, 0, W, 0);
      g.addColorStop(0, NCC.magenta); g.addColorStop(0.55, NCC.rimNear); g.addColorStop(1, NCC.cyan);
      ctx.fillStyle = g;
      ctx.globalAlpha = a * (0.55 + 0.25 * wxs.wet) * nk; ctx.fillRect(P.x0 - 6 * S, P.y0 - 2 * S, W - P.x0 + 6 * S, 1.3 * S);
      ctx.globalAlpha = a * 0.5 * nk; ctx.fillStyle = NCC.magenta; ctx.fillRect(P.x0 - 6 * S, P.y0 - 2 * S, 1.3 * S, lip);
      // the deck's glow along the top of the face, fading down
      const g2 = ctx.createLinearGradient(0, P.y0 + lip, 0, P.y0 + lip + 40 * S);
      g2.addColorStop(0, "rgba(58,28,112,0.35)"); g2.addColorStop(1, "rgba(58,28,112,0)");
      ctx.globalAlpha = a * nk; ctx.fillStyle = g2; ctx.fillRect(P.x0, P.y0 + lip, W - P.x0, 40 * S);
    }
    if (D > 0.004) {
      ctx.globalAlpha = a * D * (0.3 + 0.5 * DS.clearW); ctx.fillStyle = "rgb(112,108,96)";
      ctx.fillRect(P.x0 - 6 * S, P.y0 - 2 * S, W - P.x0 + 6 * S, 1.5 * S); ctx.fillRect(ax, ay, aw - 9 * S, 1.5 * S);
    }
    // snow on the ledge and the unit
    if (wxs.dust > 0.004) {
      ctx.globalAlpha = a * U.clamp(wxs.dust); ctx.fillStyle = CSS.snowNear;
      ctx.fillRect(P.x0 - 6 * S, P.y0 - 4 * S, W - P.x0 + 6 * S, 2.4 * S); ctx.fillRect(ax, ay - 2.4 * S, aw, 2.4 * S);
    }
    ctx.globalAlpha = 1;
  }
  function drawKitty(ctx, f, a, d) {
    if (!KITTY) return;
    const fc = f.cat;
    if (!fc) { KITTY.draw(ctx, f, KOFF); return; }
    const P = perchGeom(), D = DAY, nk = 1 - D;
    drawPerch(ctx, f.t, U.clamp(fc.a));
    const o = KO;
    o.x = W * 0.795; o.y = P.y0 - 2 * S; o.size = H * 0.135;
    o.pose = AW.cat.autoPose(f, "back");
    o.facing = -1;   // the lying poses face the city
    // night: a dim violet coat, neon on both edges; day: the smoggy sun on the coat and along the back
    const sunL = D * (0.25 + 0.75 * DS.clearW);
    o.light = U.lerp(0.22, 0.86, D);
    o.tint = D > 0.004 ? { r: U.lerp(130, DS.glare[0], 0.5 * D), g: U.lerp(90, DS.glare[1], 0.5 * D), b: U.lerp(170, DS.glare[2], 0.5 * D) } : { r: 130, g: 90, b: 170 };
    o.tintAmt = U.lerp(0.55, 0.3, D);
    const flick = 0.92 + 0.08 * U.noise1(f.t * 2.3);   // neon is never quite steady
    kRims[0].a = 0.85 * nk * flick; kRims[1].a = 0.6 * nk;
    // by day: the sun from where it stands (glare colour); at night a faint violet from the deck above
    if (D > 0.004) {
      const g = U.safe({ r: DS.glare[0], g: DS.glare[1], b: DS.glare[2] }, 205);
      kRims[2].color = U.mix(K_VIOLET, g, D); kRims[2].a = U.lerp(0.25 * wxs.cloud, 0.55 * sunL, D);
      kRims[2].dx = U.clamp((DS.sunX - o.x) / (W * 0.3), -1, 1); kRims[2].dy = -1;
    } else { kRims[2].color = K_VIOLET; kRims[2].a = 0.25 * wxs.cloud; kRims[2].dx = -0.2; kRims[2].dy = -1; }
    o.rim = kRims;
    o.glow = 0.75 * nk;
    o.shadow = 0.15 + 0.5 * sunL;
    o.alpha = a;
    KITTY.draw(ctx, f, o);
  }

  // ------------------------------------------------------------------ theme
  AW.registerTheme({
    id: "cyberpunk",
    name: "Cyberpunk",
    init(ctx, env) { build(env); if (!KITTY && AW.cat) KITTY = AW.cat.create(77); },
    resize(env) { build(env); },
    render(ctx, f) {
      if (f.width !== W || f.height !== H || (f.dpr && f.dpr !== DPR)) build({ width: f.width, height: f.height, dpr: f.dpr || DPR });
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      const dt = Math.min(f.dt || 0.016, 0.05);
      updateWeather(f.signals.weather, dt);
      const b = U.clamp(f.blend || 0);
      const col = warm(qz(U.smoothstep(0, 0.6, b), 16));

      // daylight: 0 at night (every day path is skipped, the night is exactly as it was)
      DAY = U.clamp(f.day || 0);
      if (DAY > 0.004) {
        if (!dayBuilt) buildDay();
        if (dayParams(f.signals.daylight || { elevation: 30, dayFraction: 0.5 }, f.t)) bakeDay();
        else if (DS.stage) bakeDayStep();
        // the meter reads pixels back (a GPU sync), so it runs at most every 3 s, on a frame of its own
        else if (DS.meterDue && f.t - DS.meteredAt >= 3) meterNow(f.t);
        if (DS.first) { while (DS.stage) bakeDayStep(); meterNow(f.t); DS.first = false; }   // the very first light: all at once
        DS.expo += (DS.expoT - DS.expo) * (1 - Math.exp(-dt / 2));   // exposure never steps
        waterCss = rgbA([DS.water[0] * DAY, DS.water[1] * DAY, DS.water[2] * DAY]);
        trainCss = "rgb(" + ((88 * DAY) | 0) + "," + ((96 * DAY) | 0) + "," + ((100 * DAY) | 0) + ")";
      }

      // the city (ambient)
      drawCity(ctx, f, b);

      // work by day: the same daytime city, very faint behind the HUD (0 at night); the exhale brings it forward
      const bk = 0.18 * DAY * (1 - U.smoothstep(0.3, 1, b));
      if (bk > 0.004) {
        if (!DS.stage) ensureDayAll();   // (mid-bake: the last composite holds for a frame or two)
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = bk * DS.expo;
        ctx.drawImage(dayAll.c, 0, 0, W, H);
        ctx.globalAlpha = 1;
      }

      // info: drawn straight to the wall, or into the dim layer while an overlay panel is up
      const ov = f.overlay, dimK = ov ? 1 - 0.7 * U.clamp(ov.a || 0) : 1;
      const out = ctx;
      ctx = dimBegin(out, dimK);

      // HUD (work): staggered fades so the exhale cascades
      drawBrackets(ctx, f, fade(b, 0.0, 0.45), b, b > 0.004 ? U.mix(C.red, col, qz(U.smoothstep(0, 0.3, b), 8)) : C.red);
      drawFinance(ctx, f, fade(b, 0.02, 0.42), b, col);
      drawDaylight(ctx, f, fade(b, 0.12, 0.55), b, col);
      drawWeather(ctx, f, fade(b, 0.08, 0.5), b, col);
      drawDate(ctx, f, fade(b, 0.05, 0.5), b, col);

      // clock: hero in both modes
      const cy = drawClock(ctx, f, b);
      drawCalendar(ctx, f, b, col, cy, fade(b, 0.1, 0.5));
      drawNews(ctx, f, fade(b, 0.14, 0.52), b, col, cy);
      drawHeartbeat(ctx, f, b, col, fade(b, 0.05, 0.45));
      drawNowPlaying(ctx, f, fade(b, 0.03, 0.4), b, col);
      drawRadio(ctx, f, U.smoothstep(0.6, 1, b) * (1 - 0.4 * DAY));

      dimEnd(out, ctx, dimK);
      ctx = out;

      // precipitation over everything, ambient only: rain scaled by intensity, or slow snow
      const pa = U.smoothstep(0.45, 1, b);
      drawRain(ctx, dt, pa * (0.5 + 0.5 * U.clamp(wxs.rain * 1.6)), wxs.rain);
      drawSnow(ctx, dt, f.t, pa, wxs.snow);

      ctx.globalAlpha = 1;
      soundCues(f, b);
    },
    // Night City as sound: the city's roar (thickening over the evening, busiest by day), the weather, the low hum
    // of the megastructures, and by night a faint shimmer off the holograms. Work mode is core's master level.
    soundscape(f) {
      const day = U.clamp(f.day || 0), I = wxs.I, wind = wxs.wind;
      const dens = U.smoothstep(0, 14400, f.ambientElapsed || 0);
      const rain = U.clamp(wxW[3] * (0.2 + 0.8 * I) + wxW[4] * (0.75 + 0.25 * I));
      return {
        city: U.lerp(0.55 + 0.15 * dens, 0.75, day) * (1 - 0.25 * wxW[5]),   // snow hushes it a little
        rain,
        wind: U.clamp(0.85 * U.smoothstep(6, 55, wind) + 0.15 * wxW[4] + 0.1 * wxW[5]),
        space: 0.2,
        magic: 0.15 * (1 - day) * (1 - 0.5 * wxs.fog),
      };
    },
    // the shared info overlay, dressed as this theme: the Arasaka HUD in work, Night City holo in ambient
    overlayStyle(f) {
      const s = U.smoothstep(0.3, 0.7, U.clamp(f.blend || 0));
      return {
        font: MONO,
        ink: U.safe(U.mix(C.hud, C.holoYellow, s)),
        dim: U.safe(U.scale(U.mix(C.amberSoft, C.amber, s), 0.62)),
        accent: U.safe(U.mix(C.gold, NC.cyan, s)),
        alarm: U.safe(C.red),
        glow: U.lerp(0.55, 0.8, s),
        rule: "hairline",
        caps: true,
      };
    },
    destroy() {
      sprites.clear(); dots.clear(); lays.clear(); dimL = null; NPL.key = ""; RL.key = ""; AP.sp = null; SND.t = -1;
      dayBuilt = false; dayFarL = dayMidL = dayNearL = daySkyL = dayCityL = dayNearC = dayAll = null;
    },
  });
})();
