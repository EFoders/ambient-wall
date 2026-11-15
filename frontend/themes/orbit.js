// Ambient Wall - ORBIT theme: "the cupola".
// Work: a ship-ops telemetry console in cold cyan. A thin hero clock (station time), a hairline
//       orthographic globe inset showing where the terminator is right now (light left and sunset
//       beneath it), NEXT EVENT as a T-minus count, a weather sliver, the month's ledger and the hosts as
//       a systems list. It holds still; a host down is the one loud amber-red flare.
// Ambient: the view out of a station window over the real Earth. A huge orthographic globe fills the
//       lower frame with the limb curving across the upper third and space above. It is centred far to
//       the south so the Ottawa Valley sits low in the window, foreshortened toward the horizon.
//       The terminator is real: the subsolar point comes from the current time (solar declination,
//       equation of time, Greenwich sidereal time), so dusk sweeps across Ontario at the real sunset.
//       The night side glows with sodium city lights (hand-placed cities with a seeded scatter of towns
//       and the Windsor-Quebec / Boston-Washington corridors); dark coasts and the Great Lakes are faint
//       outlines; the lit side shows land, water and Greenland's ice in dim natural tones. The
//       atmosphere is a thin blue limb, red where the terminator meets it, faint green airglow at night.
//       Weather over home is real (signals.weather): cumulus fields, overcast decks, rain cores, a train
//       of storm cells with lightning flickering inside the tops, valley fog, snow cloud and snow on the
//       ground, drifting with the wind. Elsewhere seeded weather systems march east.
//       The moon hangs above the limb at its phase, stars thin out when the sunlit face glares, the sun
//       flares dimly on the limb near orbital sunrise/sunset, a satellite glides past now and then, and
//       the view drifts very slowly through the evening. The clock is a readout on the window frame;
//       hosts are status lights beside it.
// The exhale: the console fades in a staggered cascade while the inset grows and swings into the
//       window view, warming from hairline cyan to natural colour, and the frame closes in around it.
// Geography: Natural Earth 50 m land, lakes and rivers (public domain), clipped to the hemisphere around
//       home, simplified with a tolerance that grows with distance, packed into GEO at the end (~27 KB).
// Performance: the globe is baked in stages over consecutive frames (vector land, lakes and cloud
//       billboards at device resolution; a half-res lighting raster multiplied over it; an additive
//       atmosphere raster; night outlines masked by a raster; city lights with a cheap blur), about
//       every 8 s or when the weather moves, and crossfaded in. Per frame: a blit or two plus small
//       overlays. Only while the globe swings (the exhale) is it painted live, with a quarter-res raster.
(function () {
  const U = AW.util;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const SANS = '"Inter", "Segoe UI", "DejaVu Sans", system-ui, sans-serif';
  const MONO = 'ui-monospace, "Cascadia Mono", "DejaVu Sans Mono", Consolas, monospace';
  const hex = U.hex;

  const C = {
    // work: ship-ops telemetry
    cyan: hex("#62d2e2"),
    cyanMid: hex("#46a8bc"),
    cyanDim: hex("#2e7888"),
    cyanFaint: hex("#1a4a56"),
    nominal: hex("#46cfa6"),
    straw: hex("#b8b46a"),
    alarm: hex("#e85a3a"),
    flare: hex("#e8923e"),
    // ambient: the window
    readout: hex("#9cc0dc"),     // station readout: cool white-blue, never white
    readoutDim: hex("#56738e"),
    frame: hex("#3a4d62"),
    okLight: hex("#48d0bc"),
    downLight: hex("#e8603a"),
    sodium: hex("#b27434"),      // city lights (kept under the cap even where they stack)
    sodiumGlow: hex("#b87430"),
    star: hex("#a6b6da"),
    moon: hex("#d4ccb4"),
    glare: hex("#e0a070"),
    bolt: hex("#a4aaee"),        // lightning inside the cloud tops: pale violet-blue
    sat: hex("#b4c4dc"),
    home: hex("#86d4e6"),
  };
  // Surface albedo before lighting: natural (ambient) and console (work). Lerped on the style.
  const NAT = { ocean: [16, 36, 74], lake: [20, 44, 84], land: [46, 54, 34], ice: [118, 130, 152], line: [72, 98, 136], river: [44, 70, 108], snow: [150, 160, 182] };
  const WRK = { ocean: [3, 11, 17], lake: [4, 18, 26], land: [10, 34, 42], ice: [14, 44, 54], line: [70, 190, 212], river: [26, 84, 98], snow: [14, 44, 54] };
  const DAY = [160, 157, 150];  // the multiply colour of full sun: the sunlit Earth stays dim (at night)
  // By day (frame.day, the room is lit) the window opens up to the real colours of the Earth from orbit: deep blue
  // oceans, green and brown land, bright capped clouds, less haze toward the limb. Lerped on s.dk = frame.day.
  const NATD = { ocean: [16, 56, 128], lake: [22, 64, 130], land: [66, 90, 46], ice: [150, 160, 182], line: [72, 98, 136], river: [36, 66, 108], snow: [166, 176, 198] };
  const DAYD = [240, 237, 230];
  // land cover over the vector land (soft billboards, clipped to land): [lat, lon, size deg, squash, rot, colour, alpha]
  const BIOMES = [
    [51, -106, 17, 0.6, 0.15, [126, 112, 72], 0.6], [41, -100, 14, 0.75, 0, [126, 110, 70], 0.75], [31, -101, 9, 0.8, 0.3, [130, 112, 74], 0.6],
    [34, -112, 12, 0.75, 0.4, [154, 124, 86], 0.85], [40, -116, 11, 0.8, 0.5, [140, 118, 84], 0.75], [27, -105, 12, 0.6, 0.9, [140, 116, 78], 0.75],
    [29, -112, 7, 0.6, 1.0, [152, 124, 88], 0.7], [66, -100, 24, 0.55, 0.1, [98, 94, 72], 0.7], [74, -95, 18, 0.6, 0.2, [118, 114, 104], 0.7],
    [58, -71, 10, 0.7, 0.4, [94, 92, 72], 0.5], [68, -152, 14, 0.5, 0.1, [102, 98, 78], 0.6], [54, -86, 22, 0.45, 0.25, [40, 62, 36], 0.55],
    [56, -116, 16, 0.6, 0.6, [44, 66, 38], 0.5], [-5, -62, 22, 0.6, 0, [36, 64, 34], 0.55], [-14, -48, 14, 0.7, 0.3, [106, 102, 62], 0.5],
    [-8, -40, 8, 0.8, 0, [120, 106, 70], 0.5], [-40, -68, 13, 0.45, 1.3, [130, 114, 80], 0.6], [-23, -69, 6, 0.5, 1.4, [154, 126, 90], 0.7],
    [22, 6, 32, 0.5, 0, [160, 130, 88], 0.8],
  ];
  const AUTUMN = [[45.6, -77.5, 8, 0.7, 0.4, [104, 76, 42], 0.4], [46.5, -72, 7, 0.6, 0.6, [100, 74, 42], 0.35], [44, -73, 6, 0.7, 0.2, [96, 76, 44], 0.3]];
  const natC = (k, dk) => (dk > 0 ? [0, 1, 2].map((i) => NAT[k][i] + (NATD[k][i] - NAT[k][i]) * dk) : NAT[k]);
  const ATM = 0.022;            // atmosphere thickness, as a fraction of the globe's radius
  const AMB_R = 1.95;           // ambient globe radius, in screen heights
  const FADE = 1.2;             // crossfade between bakes, s
  const WIND_DIR = 20 * RAD;    // prevailing westerlies: clouds move toward the ENE

  const fade = (b, a0, a1) => 1 - U.smoothstep(a0, a1, b);
  const ss = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  const rgb = (a, b, k) => `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const hash2 = (i, j, k) => hash(i * 157.31 + j * 311.7 + k * 74.7);

  let W = 0, H = 0, dpr = 1, S = 1, built = "";
  let mctx = null, LS = false;

  // ------------------------------------------------------------------ offscreen helpers
  function mk(wPx, hPx) {
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.ceil(wPx)); cv.height = Math.max(1, Math.ceil(hPx));
    return { cv, c: cv.getContext("2d") };
  }
  const ck = (c) => `${c.r | 0},${c.g | 0},${c.b | 0}`;

  // Text sprites: glow rendered once per (text, size, colour), then blitted. No per-frame shadowBlur.
  const sprites = new Map();
  function sprite(str, o) {
    const px = Math.round(o.px);
    const key = `${str}|${px}|${o.weight || 400}|${o.spacing || 0}|${ck(o.color)}|${o.glow || 0}|${o.core || 0}|${o.mono ? 1 : 0}`;
    let s = sprites.get(key);
    if (s) { sprites.delete(key); sprites.set(key, s); return s; }
    const font = `${o.weight || 400} ${px}px ${o.mono ? MONO : SANS}`;
    const sp = (o.spacing || 0) * px;
    if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); LS = "letterSpacing" in mctx; }
    mctx.font = font; if (LS) mctx.letterSpacing = `${sp}px`;
    const tw = Math.max(1, mctx.measureText(str).width - (LS ? sp : 0));
    const g = o.glow || 0;
    const pad = Math.ceil(g * 2.3 + px * 0.08 + 4);
    const w = Math.ceil(tw + pad * 2 + sp), h = Math.ceil(px * 1.3 + pad * 2);
    const { cv, c } = mk(w * dpr, h * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    if (sprites.size > 80) sprites.delete(sprites.keys().next().value);
    return s;
  }
  // align: "left" | "center" | "right"; x,y = anchor, y = vertical middle. Returns the drawn width.
  function text(ctx, str, x, y, o, align, scale, alpha) {
    if (!str || alpha <= 0.004) return 0;
    const s = sprite(str, o), k = scale || 1, w = s.w * k, h = s.h * k;
    const dx = align === "left" ? x - s.pad * k : align === "right" ? x - (s.pad + s.tw) * k : x - w / 2;
    ctx.globalAlpha = U.clamp(alpha);
    ctx.drawImage(s.cv, dx, y - h / 2, w, h);
    ctx.globalAlpha = 1;
    return s.tw * k;
  }

  // Radial glow sprites, one per quantised colour.
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
      g.addColorStop(0, U.rgba(c, 1)); g.addColorStop(0.3, U.rgba(c, 0.6));
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

  // ------------------------------------------------------------------ astronomy
  // Low-precision sun and moon (good to a fraction of a degree), plus Greenwich sidereal time.
  function astro(date) {
    const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
    const L = (280.46 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
    const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
    const eps = (23.439 - 0.0000004 * n) * RAD;
    const sunDec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const sunRa = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    const gmst = ((((18.697374558 + 24.06570982441908 * n) % 24) + 24) % 24) * 15 * RAD;
    const Lm = (218.316 + 13.176396 * n) * RAD, Mm = (134.963 + 13.064993 * n) * RAD, F = (93.272 + 13.22935 * n) * RAD;
    const lamM = Lm + 6.289 * RAD * Math.sin(Mm), betM = 5.128 * RAD * Math.sin(F);
    const moonRa = Math.atan2(Math.sin(lamM) * Math.cos(eps) - Math.tan(betM) * Math.sin(eps), Math.cos(lamM));
    const moonDec = Math.asin(Math.sin(betM) * Math.cos(eps) + Math.cos(betM) * Math.sin(eps) * Math.sin(lamM));
    let el = (lamM - lam) % TAU; if (el < 0) el += TAU;
    return { gmst, sunDec, sunRa, moonDec, moonRa, illum: (1 - Math.cos(el)) / 2 };
  }
  // Earth-fixed frame: x toward 0N 0E, y toward 0N 90E, z toward the north pole.
  function ev(lat, lon, o) {
    const f = lat * RAD, l = lon * RAD, c = Math.cos(f);
    o = o || [0, 0, 0]; o[0] = c * Math.cos(l); o[1] = c * Math.sin(l); o[2] = Math.sin(f);
    return o;
  }
  // The subsolar and sublunar directions: right ascension minus sidereal time is the longitude
  // where the body is overhead (the equation of time falls out of the RA).
  const SUN = [1, 0, 0], MOON = [1, 0, 0];
  let moonIllum = 0.5, bodiesAt = -1;
  function bodies(now) {
    const ms = now.getTime();
    if (Math.abs(ms - bodiesAt) < 2000) return;
    bodiesAt = ms;
    const A = astro(now);
    const sl = A.sunRa - A.gmst, ml = A.moonRa - A.gmst;
    SUN[0] = Math.cos(A.sunDec) * Math.cos(sl); SUN[1] = Math.cos(A.sunDec) * Math.sin(sl); SUN[2] = Math.sin(A.sunDec);
    MOON[0] = Math.cos(A.moonDec) * Math.cos(ml); MOON[1] = Math.cos(A.moonDec) * Math.sin(ml); MOON[2] = Math.sin(A.moonDec);
    moonIllum = A.illum;
  }

  // Home and its local tangent frame (east, north).
  const HOME = { lat: 0, lon: 0, v: [1, 0, 0], E: [0, 1, 0], N: [0, 0, 1], key: "" };
  function setHome() {
    const loc = AW.config.location || { lat: 45.4215, lon: -75.6972 };
    const key = `${loc.lat},${loc.lon}`;
    if (key === HOME.key) return false;
    HOME.key = key; HOME.lat = loc.lat; HOME.lon = loc.lon;
    ev(loc.lat, loc.lon, HOME.v);
    tangent(HOME.v, HOME.E, HOME.N);
    return true;
  }
  function tangent(p, E, N) {
    let ex = -p[1], ey = p[0]; const l = Math.hypot(ex, ey) || 1; ex /= l; ey /= l;
    E[0] = ex; E[1] = ey; E[2] = 0;
    N[0] = -p[2] * ey; N[1] = p[2] * ex; N[2] = p[0] * ey - p[1] * ex;
  }
  // a point a degrees east and b degrees north of p (on the tangent plane, pushed back onto the sphere)
  function offs(p, E, N, a, b, o) {
    const x = p[0] + (E[0] * a + N[0] * b) * RAD, y = p[1] + (E[1] * a + N[1] * b) * RAD, z = p[2] + (E[2] * a + N[2] * b) * RAD;
    const l = Math.hypot(x, y, z);
    o = o || [0, 0, 0]; o[0] = x / l; o[1] = y / l; o[2] = z / l;
    return o;
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // ------------------------------------------------------------------ geography (decoded once)
  // GEO strings: rings separated by spaces; each point is a zigzag varint delta (0.01 deg) in base64;
  // "!" before a point marks a cut (the edge into it is not stroked).
  const LAY = { land: [], ice: [], lake: [], river: [], grat: [] };
  function decode(str) {
    const AL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const D = new Int8Array(128).fill(-1);
    for (let i = 0; i < 64; i++) D[AL.charCodeAt(i)] = i;
    const out = [];
    for (const s of str.split(" ")) {
      if (!s) continue;
      const ll = [], pen = [];
      let i = 0, x = 0, y = 0, first = true, pu = 0;
      const rd = () => {
        let z = 0, sh = 0, c;
        do { c = D[s.charCodeAt(i++)]; z += (c & 31) * Math.pow(2, sh); sh += 5; } while (c & 32);
        return (z % 2) ? -(z + 1) / 2 : z / 2;
      };
      while (i < s.length) {
        if (s.charCodeAt(i) === 33) { pu = 1; i++; }
        const dx = rd(), dy = rd();
        if (first) { x = dx - 18000; y = dy - 9000; first = false; } else { x += dx; y += dy; }
        ll.push(x / 100, y / 100); pen.push(pu); pu = 0;
      }
      out.push(ring(ll, pen));
    }
    return out;
  }
  function ring(ll, pen) {
    const n = ll.length / 2, p = new Float32Array(n * 3), v = [0, 0, 0];
    for (let k = 0; k < n; k++) { ev(ll[k * 2 + 1], ll[k * 2], v); p[k * 3] = v[0]; p[k * 3 + 1] = v[1]; p[k * 3 + 2] = v[2]; }
    return { n, p, ll: Float32Array.from(ll), pen: Uint8Array.from(pen || new Array(n).fill(0)) };
  }
  function buildGeo() {
    if (LAY.land.length) return;
    LAY.land = decode(GEO.land); LAY.ice = decode(GEO.ice); LAY.lake = decode(GEO.lake); LAY.river = decode(GEO.river);
    // console graticule: meridians and parallels every 30 degrees
    for (let lon = -180; lon < 180; lon += 30) { const ll = []; for (let lat = -84; lat <= 84; lat += 4) ll.push(lon, lat); LAY.grat.push(ring(ll)); }
    for (let lat = -60; lat <= 60; lat += 30) { const ll = []; for (let lon = -180; lon <= 180; lon += 4) ll.push(lon, lat); LAY.grat.push(ring(ll)); }
  }

  // ------------------------------------------------------------------ city lights (built once)
  // [lat, lon, metro population in thousands]. Eastern North America in detail, the rest sketched.
  const CITIES = [
    45.42, -75.70, 1400, 45.50, -73.57, 4300, 43.65, -79.38, 6400, 43.26, -79.87, 780, 43.90, -78.86, 420, 43.45, -80.49, 600,
    42.98, -81.25, 550, 42.31, -83.04, 350, 43.16, -79.24, 410, 44.39, -79.69, 220, 44.23, -76.49, 170, 44.30, -78.32, 130,
    44.16, -77.38, 110, 45.82, -77.11, 25, 45.47, -76.68, 9, 45.43, -76.35, 10, 45.02, -74.73, 60, 44.59, -75.68, 22,
    46.31, -79.46, 70, 46.49, -80.99, 170, 46.52, -84.35, 80, 48.38, -89.25, 120, 48.48, -81.33, 42, 46.81, -71.21, 840,
    45.40, -71.89, 220, 46.34, -72.54, 160, 48.43, -71.07, 160, 48.24, -79.02, 42, 48.10, -77.78, 33, 45.33, -79.22, 20,
    44.57, -80.94, 22, 42.97, -82.40, 100, 43.55, -80.25, 150, 43.14, -80.26, 100, 43.09, -79.08, 90, 46.09, -64.78, 160,
    44.65, -63.57, 440, 45.27, -66.06, 130, 45.96, -66.64, 110, 46.24, -63.13, 80, 47.56, -52.71, 210, 49.90, -97.14, 830,
    50.45, -104.61, 250, 52.13, -106.67, 330, 51.05, -114.07, 1500, 53.55, -113.49, 1400, 49.28, -123.12, 2600, 46.23, -60.19, 100,
    40.71, -74.01, 19000, 40.80, -73.20, 2800, 39.95, -75.17, 6200, 42.36, -71.06, 4900, 41.82, -71.41, 1600, 41.76, -72.68, 1200,
    41.31, -72.92, 860, 38.91, -77.04, 6300, 39.29, -76.61, 2800, 37.54, -77.44, 1300, 36.85, -76.29, 1800, 40.44, -79.99, 2300,
    41.50, -81.69, 2100, 39.96, -83.00, 2100, 39.10, -84.51, 2200, 42.33, -83.05, 4400, 41.88, -87.63, 9500, 43.04, -87.91, 1600,
    44.98, -93.27, 3700, 39.77, -86.16, 2100, 38.63, -90.20, 2800, 39.10, -94.58, 2200, 38.25, -85.76, 1300, 36.16, -86.78, 2000,
    33.75, -84.39, 6100, 35.23, -80.84, 2700, 35.78, -78.64, 1400, 36.07, -79.79, 780, 42.89, -78.88, 1100, 43.16, -77.61, 1100,
    43.05, -76.15, 660, 42.65, -73.76, 900, 44.48, -73.21, 220, 43.66, -70.26, 550, 42.99, -71.46, 420, 42.10, -72.59, 700,
    42.26, -71.80, 950, 41.41, -75.66, 560, 40.61, -75.49, 860, 40.27, -76.88, 590, 40.04, -76.31, 550, 42.13, -80.09, 270,
    41.65, -83.54, 640, 41.08, -81.52, 700, 39.76, -84.19, 810, 42.96, -85.66, 1100, 42.73, -84.56, 550, 43.01, -83.69, 400,
    41.08, -85.14, 420, 43.07, -89.40, 680, 44.51, -88.01, 330, 41.59, -93.62, 700, 41.26, -95.93, 960, 35.15, -90.05, 1300,
    33.52, -86.80, 1100, 30.33, -81.66, 1600, 28.54, -81.38, 2700, 27.95, -82.46, 3200, 25.76, -80.19, 6100, 29.95, -90.07, 1300,
    29.76, -95.37, 7100, 32.78, -96.80, 7600, 29.42, -98.49, 2600, 30.27, -97.74, 2300, 35.47, -97.52, 1400, 36.15, -95.99, 1000,
    39.74, -104.99, 3000, 34.00, -81.03, 830, 32.78, -79.93, 800, 32.08, -81.09, 400, 35.96, -83.92, 880, 35.05, -85.31, 560,
    38.04, -84.50, 520, 38.35, -81.63, 250, 37.27, -79.94, 310, 39.74, -75.55, 700, 40.22, -74.76, 380, 39.36, -74.42, 270,
    42.10, -75.91, 240, 43.10, -75.23, 290, 43.97, -75.91, 110, 44.70, -73.45, 80, 46.79, -92.10, 280, 46.54, -87.40, 65,
    44.76, -85.62, 150, 43.42, -83.95, 190, 40.69, -89.59, 400, 42.27, -89.09, 340, 39.80, -89.64, 210, 37.97, -87.57, 310,
    34.75, -92.29, 750, 32.30, -90.18, 580, 30.69, -88.04, 430, 30.42, -87.22, 500, 30.44, -84.28, 380, 33.45, -112.07, 4900,
    40.76, -111.89, 1250, 36.17, -115.14, 2300, 34.05, -118.24, 13000, 37.77, -122.42, 4700, 47.61, -122.33, 4000, 45.52, -122.68, 2500,
    35.08, -106.65, 920, 31.76, -106.49, 870, 25.69, -100.32, 5300, 19.43, -99.13, 21800, 20.66, -103.35, 5200, 23.11, -82.37, 2100,
    18.49, -69.93, 3500, 18.47, -66.11, 2400, 4.71, -74.07, 11000, 10.48, -66.90, 5000, 6.24, -75.58, 4000, 8.98, -79.52, 1900,
    51.51, -0.13, 14000, 48.86, 2.35, 12000, 40.42, -3.70, 6700, 38.72, -9.14, 2900, 41.15, -8.61, 1700, 53.35, -6.26, 1900,
    53.48, -2.24, 2800, 52.49, -1.89, 2900, 55.86, -4.25, 1800, 50.85, 4.35, 2100, 52.37, 4.90, 2500, 41.39, 2.17, 5600,
    33.57, -7.59, 3700, 34.02, -6.84, 1900, 37.39, -5.98, 1500, 64.15, -21.94, 230, 14.72, -17.47, 3100, 45.76, 4.84, 2300,
    44.84, -0.58, 1200, 47.22, -1.55, 960, -23.55, -46.63, 22000, -22.91, -43.17, 13000, -34.60, -58.38, 15000, -12.05, -77.04, 11000,
    -33.45, -70.67, 7000, -0.18, -78.47, 2000, -8.05, -34.88, 4000, -12.97, -38.50, 3900, -3.73, -38.53, 4000, -19.92, -43.94, 6000,
    -15.79, -47.88, 4700, -2.17, -79.92, 3000, 64.18, -51.72, 19, 63.75, -68.52, 8, 61.22, -149.90, 400, 58.30, -134.42, 32,
  ];
  // Highways and rail between neighbours: a sprinkle of towns along each (density per degree).
  const CORRIDORS = [
    [42.31, -83.04, 43.65, -79.38, 6], [43.65, -79.38, 44.23, -76.49, 6], [44.23, -76.49, 45.50, -73.57, 5],
    [45.42, -75.70, 45.50, -73.57, 5], [45.50, -73.57, 46.81, -71.21, 5], [45.42, -75.70, 45.82, -77.11, 4],
    [45.82, -77.11, 46.31, -79.46, 2.5], [43.65, -79.38, 46.49, -80.99, 2.5], [45.42, -75.70, 44.23, -76.49, 3],
    [40.71, -74.01, 42.36, -71.06, 8], [40.71, -74.01, 39.95, -75.17, 9], [39.95, -75.17, 38.91, -77.04, 8],
    [41.88, -87.63, 42.33, -83.05, 6], [41.88, -87.63, 43.04, -87.91, 6], [41.50, -81.69, 40.44, -79.99, 5],
    [42.89, -78.88, 42.65, -73.76, 5], [42.65, -73.76, 40.71, -74.01, 5], [33.75, -84.39, 35.23, -80.84, 5],
    [35.23, -80.84, 35.78, -78.64, 5], [35.78, -78.64, 37.54, -77.44, 4], [39.77, -86.16, 39.96, -83.00, 5],
    [39.10, -84.51, 38.25, -85.76, 4], [41.50, -81.69, 42.33, -83.05, 4], [41.88, -87.63, 39.77, -86.16, 4],
    [38.63, -90.20, 41.88, -87.63, 3], [44.98, -93.27, 43.04, -87.91, 3], [36.16, -86.78, 33.75, -84.39, 3],
    [29.76, -95.37, 32.78, -96.80, 4], [32.78, -96.80, 29.42, -98.49, 4], [28.54, -81.38, 25.76, -80.19, 6],
  ];
  let LN = 0, LP = null, LB = null, LZ = null, LG = [];   // light vectors, brightness, size, glows [i, radius]
  function buildLights() {
    if (LP) return;
    // land mask, 0.1 deg: lights only fall on land
    const MW = 2000, MH = 1450;
    const m = mk(MW, MH), c = m.c;
    const path = (rings) => {
      c.beginPath();
      for (const r of rings) {
        for (let k = 0; k < r.n; k++) {
          const x = (r.ll[k * 2] + 170) * 10, y = (85 - r.ll[k * 2 + 1]) * 10;
          k ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.closePath();
      }
    };
    c.fillStyle = "#fff"; path(LAY.land); c.fill("evenodd");
    c.globalCompositeOperation = "destination-out"; path(LAY.lake); c.fill("evenodd");
    const md = c.getImageData(0, 0, MW, MH).data;
    const onLand = (lat, lon) => {
      const x = Math.round((lon + 170) * 10), y = Math.round((85 - lat) * 10);
      return x >= 0 && y >= 0 && x < MW && y < MH && md[(y * MW + x) * 4 + 3] > 120;
    };
    const lat = [], lon = [], br = [], sz = [];
    const add = (la, lo, b, s) => { lat.push(la); lon.push(lo); br.push(b); sz.push(s); };
    const r = U.rng(4242);
    const gauss = () => { let u = 0; for (let k = 0; k < 4; k++) u += r(); return (u - 2) * 0.87; };
    for (let i = 0; i < CITIES.length; i += 3) {
      const la = CITIES[i], lo = CITIES[i + 1], pop = CITIES[i + 2];
      const n = Math.round(2 + 1.25 * Math.sqrt(pop)), rad = 0.032 * Math.pow(pop, 0.3);
      add(la, lo, 0.9, 1.4 + 0.35 * Math.log10(pop + 1));
      if (pop >= 700) LG.push([lat.length - 1, 0.004 + 0.0011 * Math.pow(pop, 0.33)]);
      for (let k = 0; k < n; k++) {
        for (let tries = 0; tries < 4; tries++) {
          const d = Math.abs(gauss()) * rad, q = r() * TAU;
          const a = la + d * Math.sin(q), o = lo + d * Math.cos(q) / Math.cos(la * RAD);
          if (!onLand(a, o)) continue;
          add(a, o, (0.3 + 0.55 * r()) * (0.45 + 0.55 * Math.exp(-d / rad)), d < rad * 0.5 ? 1.35 : 1.0);
          break;
        }
      }
    }
    for (const [a0, o0, a1, o1, dens] of CORRIDORS) {
      const len = Math.hypot(a1 - a0, (o1 - o0) * Math.cos((a0 + a1) / 2 * RAD));
      const n = Math.round(len * dens);
      for (let k = 0; k < n; k++) {
        const t = r(), a = U.lerp(a0, a1, t) + gauss() * 0.06, o = U.lerp(o0, o1, t) + gauss() * 0.08;
        if (onLand(a, o)) add(a, o, 0.2 + 0.35 * r(), 1.0);
      }
    }
    // rural towns: dense in the east, thin on the plains, a scatter along the Canadian south
    for (let k = 0; k < 4200; k++) {
      const a = 25 + 27 * r(), o = -104 + 44 * r();
      let p = o > -95 ? 0.55 : 0.22;
      if (a > 44) p *= o > -84 && o < -64 ? (a > 47.5 ? 0.12 : 0.6) : (a > 49.5 ? 0.04 : 0.35);
      if (a < 31 && o < -97) p *= 0.6;
      if (r() < p && onLand(a, o)) add(a, o, 0.12 + 0.3 * r(), 1.0);
    }
    LN = lat.length; LP = new Float32Array(LN * 3); LB = Float32Array.from(br); LZ = Float32Array.from(sz);
    const v = [0, 0, 0];
    for (let i = 0; i < LN; i++) { ev(lat[i], lon[i], v); LP[i * 3] = v[0]; LP[i * 3 + 1] = v[1]; LP[i * 3 + 2] = v[2]; }
  }

  // ------------------------------------------------------------------ cloud textures (built once)
  // Everything cloudy comes from two tileable noise fields: value-noise fbm on a torus (each octave has
  // an integer period, so the tile wraps), the broad one domain-warped so it swirls like real decks.
  const TN = 256;
  let TILE = null, TILE2 = null, QT = null;
  function makeTile(seed, base, oct, warp) {
    const r = U.rng(seed), G = [];
    for (let o = 0; o < oct; o++) { const P = base << o, g = new Float32Array(P * P); for (let i = 0; i < P * P; i++) g[i] = r(); G.push({ P, g }); }
    const val = (q, x, y) => {
      const P = q.P, fx = x * P, fy = y * P, ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const x0 = ((ix % P) + P) % P, y0 = ((iy % P) + P) % P, x1 = (x0 + 1) % P, y1 = (y0 + 1) % P, g = q.g;
      const a = g[y0 * P + x0], b = g[y0 * P + x1], c = g[y1 * P + x0], d = g[y1 * P + x1];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
    const fbm = (x, y) => { let s = 0, a = 1, n = 0; for (const q of G) { s += a * val(q, x, y); n += a; a *= 0.52; } return s / n; };
    const T = new Float32Array(TN * TN);
    let lo = 9, hi = -9;
    for (let j = 0; j < TN; j++) {
      for (let i = 0; i < TN; i++) {
        const x = i / TN, y = j / TN;
        const wx = warp ? (fbm(x + 0.37, y + 0.11) - 0.5) * warp : 0, wy = warp ? (fbm(x + 0.71, y + 0.53) - 0.5) * warp : 0;
        const v = fbm(x + wx, y + wy);
        T[j * TN + i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
      }
    }
    for (let k = 0; k < T.length; k++) T[k] = (T[k] - lo) / (hi - lo);
    return T;
  }
  function tsamp(T, x, y) {
    x -= Math.floor(x); y -= Math.floor(y);
    const fx = x * TN, fy = y * TN, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0;
    const i1 = (i0 + 1) & (TN - 1), j1 = (j0 + 1) & (TN - 1);
    const a = T[j0 * TN + i0], b = T[j0 * TN + i1], c = T[j1 * TN + i0], d = T[j1 * TN + i1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  const deck = (x, y) => 0.66 * tsamp(TILE, x, y) + 0.34 * tsamp(TILE2, x * 2.3 + 0.4, y * 2.3 + 0.7);
  // the density that leaves a given fraction of the sky covered (so "intensity 0.35" means 35 % cloud)
  const qThr = (frac) => QT[Math.round(U.clamp(1 - frac) * (QT.length - 1))];

  // A texture from fn(u, v) -> [alpha, shade] on -0.5..0.5, in one or more colourings.
  function paintTex(N, fn, cols) {
    const A = new Float32Array(N * N), B = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const o = fn((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5);
      A[j * N + i] = U.clamp(o[0]); B[j * N + i] = o[1];
    }
    const out = {};
    for (const k in cols) {
      const col = cols[k], { cv, c } = mk(N, N), img = c.createImageData(N, N), d = img.data;
      for (let q = 0; q < N * N; q++) {
        const s = col[3] ? B[q] : 1;
        d[q * 4] = col[0] * s; d[q * 4 + 1] = col[1] * s; d[q * 4 + 2] = col[2] * s; d[q * 4 + 3] = 255 * A[q];
      }
      c.putImageData(img, 0, 0);
      out[k] = cv;
    }
    return out;
  }
  const ALB = [176, 182, 196, 1], DARK = [60, 64, 76, 0], FLASH = [164, 170, 236, 1], TOWER = [206, 210, 224, 1];
  const mirror = (cv) => { const o = mk(cv.width, cv.height); o.c.translate(0, cv.height); o.c.scale(1, -1); o.c.drawImage(cv, 0, 0); return o.cv; };
  const TEX = { sys: [], sysS: [], trop: [], cb: [], fg: null, snow: null };
  function buildTextures() {
    if (TEX.fg) return;
    TILE = makeTile(31, 4, 5, 0.55); TILE2 = makeTile(57, 8, 4, 0.25);
    const r = U.rng(5), q = [];
    for (let k = 0; k < 6000; k++) q.push(deck(r(), r()));
    QT = Float32Array.from(q.sort((a, b) => a - b));
    // mid-latitude systems: a comma (a spiral arm wound into a bright core) with a trailing cold front
    for (let n = 0; n < 3; n++) {
      const rr = U.rng(900 + n), ox = rr(), oy = rr(), k = -0.85 - 0.25 * rr(), ph0 = rr() * TAU;
      const fp = []; for (let i = 0; i <= 24; i++) { const t = i / 24; fp.push([-0.03 - 0.26 * t - 0.08 * t * t, 0.05 + 0.4 * t]); }
      const t = paintTex(256, (u, v) => {
        const rho = Math.hypot(u, v), phi = Math.atan2(-v, u);
        let dp = phi - (ph0 + Math.log(Math.max(rho, 0.012) / 0.05) / k); dp -= TAU * Math.round(dp / TAU);
        const arm = Math.exp(-Math.pow(dp * rho / (0.035 + 0.13 * rho), 2)) * (1 - ss(0.3, 0.46, rho)) * ss(0.02, 0.06, rho);
        const core = Math.exp(-rho * rho / 0.008);
        let fr = 9; for (const p of fp) { const dx = u - p[0], dy = v - p[1], dd = dx * dx + dy * dy; if (dd < fr) fr = dd; }
        const front = Math.exp(-fr / 0.0022) * (1 - ss(0.4, 0.5, rho));
        const env = Math.max(arm, core, 0.85 * front);
        const den = 0.6 * tsamp(TILE, u * 1.3 + ox, v * 1.3 + oy) + 0.4 * tsamp(TILE2, u * 3.1 + ox, v * 3.1 + oy);
        const x = den * 0.95 + env * 0.55;
        return [ss(0.72, 0.88, x) * (1 - ss(0.42, 0.5, rho)), 0.7 + 0.4 * ss(0.8, 1.15, x)];
      }, { lit: ALB });
      TEX.sys.push(t.lit); TEX.sysS.push(mirror(t.lit));
    }
    // tropical clusters: popcorn cumulus around a few anvils
    for (let n = 0; n < 2; n++) {
      const rr = U.rng(300 + n), ox = rr(), oy = rr();
      TEX.trop.push(paintTex(128, (u, v) => {
        const env = Math.exp(-(u * u / 0.05 + v * v / 0.025));
        const den = tsamp(TILE2, u * 2.2 + ox, v * 2.2 + oy);
        return [ss(0.62, 0.72, den * 0.7 + env * 0.45) * (1 - ss(0.4, 0.5, Math.hypot(u, v))), 0.8 + 0.3 * env];
      }, { lit: ALB }).lit);
    }
    // cumulonimbus seen from above: a broad smooth anvil canopy spreading downwind (+u), its edge
    // ragged and combed into fibres, with the overshooting top boiling up through it upwind
    for (let n = 0; n < 2; n++) {
      const rr = U.rng(500 + n), ox = rr(), oy = rr();
      TEX.cb.push(paintTex(192, (u, v) => {
        const cu = u - 0.05, rho = Math.hypot(u, v);
        const re = Math.hypot(cu / 0.4, v / 0.3);
        const n1 = tsamp(TILE, u * 1.5 + ox, v * 1.5 + oy), n2 = tsamp(TILE2, u * 3.2 + oy, v * 3.2 + ox);
        const fib = tsamp(TILE2, u * 1.1 + ox, v * 3.5 + oy);
        const canopy = ss(0.42, 0.56, (1 - re) * 0.8 + n1 * 0.45 + n2 * 0.2 + (u > 0.1 ? (fib - 0.5) * 0.25 : 0));
        const tu = u + 0.13, tr = Math.hypot(tu, v), tphi = Math.atan2(v, tu);
        const te = 0.13 + 0.05 * (tsamp(TILE2, Math.cos(tphi) * 0.15 + oy, Math.sin(tphi) * 0.15 + ox) - 0.5);
        const top = ss(te, te - 0.04, tr);
        const bumps = tsamp(TILE2, u * 4 + ox, v * 4 + oy);
        const a = Math.max(0.94 * canopy, top) * (1 - ss(0.46, 0.5, rho));
        // lit from the upper left (baked); the shadow it throws on the deck is real
        const sh = top > 0.3 ? 0.7 + 0.4 * bumps + 0.35 * (1 - tr / te) - 0.9 * (tu + v) : 0.74 + 0.16 * n1 + 0.1 * bumps - 0.25 * (u + v);
        return [a, sh];
      }, { lit: TOWER, dark: [0, 0, 0, 0], flash: FLASH }));
    }
    // valley fog: smooth, flat, elongated along the valley
    TEX.fg = paintTex(96, (u, v) => {
      const e = 1 - (u * u / 0.21 + v * v / 0.045);
      return [ss(0, 0.85, e) * (0.85 + 0.15 * tsamp(TILE2, u + 0.3, v * 2 + 0.6)), 0.95];
    }, { lit: [158, 166, 182, 1] }).lit;
    // snow on the ground: a soft disc in snow albedo
    const { cv, c } = mk(128, 128), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, `rgba(${NAT.snow.join(",")},1)`); g.addColorStop(0.55, `rgba(${NAT.snow.join(",")},0.75)`); g.addColorStop(1, `rgba(${NAT.snow.join(",")},0)`);
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    TEX.snow = cv;
  }

  // A soft, ragged patch of land cover in one colour, squashed into an ellipse (built once per biome).
  const biomes = new Map();
  function biomeSprite(col, sq) {
    const key = `${col.join(",")}|${sq}`;
    let cv = biomes.get(key);
    if (cv) return cv;
    cv = paintTex(96, (u, v) => {
      const rr = Math.hypot(u, v / sq) * 2, n = tsamp(TILE, u * 1.7 + col[0] * 0.01, v * 1.7 + col[2] * 0.01);
      return [(1 - ss(0.35, 1, rr + (n - 0.5) * 0.7)) * (0.75 + 0.25 * n), 1];
    }, { lit: [col[0], col[1], col[2], 0] }).lit;
    biomes.set(key, cv);
    return cv;
  }

  // The weather deck over home: one texture in the tangent plane at home (the orthographic projection
  // of a tangent plane is exact as a single affine blit; over +-13 deg the sphere bends < 2 px away).
  // Coverage thresholds the deck field at the quantile for the cover asked for, the pattern moves with
  // the wind, rain darkens the thick cores, and the deck breaks up (rather than fades) toward its edge.
  const FSPAN = 34, FTILE = 15;
  let FLD_H = null, FLD_L = null;
  function mkField(N) { const o = mk(N, N); o.img = o.c.createImageData(N, N); o.N = N; return o; }
  function paintField(F, s, j0, j1) {
    const w = s.wx, cov = w.cloud;
    if (cov < 0.01) return false;
    const N = F.N, d = F.img.data;
    if (j0 === undefined) { j0 = 0; j1 = N; }
    const thr = qThr(U.clamp(Math.pow(cov, 0.75) * 0.98)), rn = w.rain, sn = w.snow, stt = w.strat;
    const ca = Math.cos(WIND_DIR), sa = Math.sin(WIND_DIR), st = 1 + 1.7 * w.streak + 0.3 * stt;
    const soft = 0.012 + 0.04 * stt, w1 = 0.66 + 0.2 * stt, w2 = 1 - w1;
    const sh0 = 0.7 + 0.12 * stt, sh1 = 0.45 - 0.2 * stt, puff = 0.25 * (1 - stt);
    const Rr = FSPAN / 2 - 0.3, k = FSPAN / N, dkE = s.dk || 0;
    // by day a full deck is shaded a touch greyer so a solid overcast stays inside the day budget
    const dg = (s.dk || 0) > 0 ? 1 - 0.14 * s.dk * ss(0.5, 1, cov) : 1;
    const ar = (ALB[0] + 8 * sn) * dg, ag = (ALB[1] + 8 * sn) * dg, ab = (ALB[2] + 10 * sn) * dg;
    for (let j = j0; j < j1; j++) {
      const bb = (0.5 - (j + 0.5) / N) * FSPAN;
      let o = j * N * 4;
      for (let i = 0; i < N; i++, o += 4) {
        const a = ((i + 0.5) / N - 0.5) * FSPAN, r = Math.hypot(a, bb);
        if (r > Rr) { d[o + 3] = 0; continue; }
        const env = 1 - ss(0.55 * Rr, Rr, r);
        // along / across the wind: the pattern drifts along it and stretches into bands with streak
        const p = a * ca + bb * sa - w.drift, q = -a * sa + bb * ca;
        const x = p / (FTILE * st) + 0.13, y = -q * st / FTILE + 0.41;
        const den = w1 * tsamp(TILE, x, y) + w2 * tsamp(TILE2, x * 2.3 + 0.4, y * 2.3 + 0.7) - (1 - env) * 0.4;
        const al = Math.min(1, ss(thr - soft, thr + 4 * soft, den) + puff * ss(thr - 0.07, thr, den));
        if (al < 0.004) { d[o + 3] = 0; continue; }
        const thick = ss(thr, thr + 0.24, den), sh = sh0 + sh1 * thick;
        const core = rn * ss(thr + 0.07, thr + 0.28, den) * 0.85;
        d[o] = ar * sh + (DARK[0] - ar * sh) * core;
        d[o + 1] = ag * sh + (DARK[1] - ag * sh) * core;
        d[o + 2] = ab * sh + (DARK[2] - ab * sh) * core;
        d[o + 3] = 255 * al * (0.6 + 0.4 * env) * (dkE > 0 ? 1 - dkE * ss(0.8 * Rr, Rr, r) : 1);   // by day: no hard rim
      }
    }
    if (j1 === N) F.c.putImageData(F.img, 0, 0);
    return k > 0;
  }

  // ------------------------------------------------------------------ views
  // A view: the globe's centre point, a roll, and where the disk sits on screen. m holds the rows that
  // take an earth-fixed vector to screen-right, screen-up and toward the viewer.
  function setView(V, lat0, lon0, roll, cx, cy, R) {
    const f = lat0 * RAD, l = lon0 * RAD, sf = Math.sin(f), cf = Math.cos(f), sl = Math.sin(l), cl = Math.cos(l);
    const ex = -sl, ey = cl, nx = -sf * cl, ny = -sf * sl, nz = cf;
    const cr = Math.cos(roll), sr = Math.sin(roll), m = V.m;
    m[0] = ex * cr - nx * sr; m[1] = ey * cr - ny * sr; m[2] = -nz * sr;
    m[3] = ex * sr + nx * cr; m[4] = ey * sr + ny * cr; m[5] = nz * cr;
    m[6] = cf * cl; m[7] = cf * sl; m[8] = sf;
    V.cx = cx; V.cy = cy; V.R = R;
  }
  // g: 0 = the console inset, 1 = the window. The inset is centred a little south of home so the pole
  // sits near its top; the window is centred ~44 deg south of home so home sits low, near the horizon.
  // e (ambient seconds) drifts the window view very slowly: the station's orbit precessing.
  function viewAt(V, g, e) {
    const wl = HOME.lat - 14, wlon = HOME.lon;
    const dLat = 1.4 * Math.sin(e / 11000 + 1.3), dLon = 3.2 * Math.sin(e / 8200 + 0.4), dRoll = 0.03 * Math.sin(e / 9500 + 2.1);
    const al = HOME.lat - 55 + dLat, alon = HOME.lon - 2.7 + dLon, aroll = -0.04 + dRoll;
    const Rw = 0.2 * H, Ra = AMB_R * H, topW = 0.37 * H - Rw, topA = 0.37 * H;
    const R = Math.exp(U.lerp(Math.log(Rw), Math.log(Ra), g));
    const top = U.lerp(topW, topA, g);
    setView(V, U.lerp(wl, al, g), U.lerp(wlon, alon, g), U.lerp(0, aroll, g), U.lerp(0.765 * W, 0.5 * W, g), top + R, R);
  }

  // ------------------------------------------------------------------ projection into paths
  // Polygons: hidden stretches (behind the limb) are replaced by arcs along the limb, so fills are exact.
  function tracePoly(path, rg, V) {
    const P = rg.p, n = rg.n, m = V.m, R = V.R, cx = V.cx, cy = V.cy;
    let s = -1;
    for (let i = 0; i < n; i++) { const q = i * 3; if (m[6] * P[q] + m[7] * P[q + 1] + m[8] * P[q + 2] > 0) { s = i; break; } }
    if (s < 0) return;
    let hid = false, ea = 0, px = 0, py = 0, pz = 0;
    for (let k = 0; k <= n; k++) {
      const q = ((s + k) % n) * 3, X = P[q], Y = P[q + 1], Z = P[q + 2];
      const x = m[0] * X + m[1] * Y + m[2] * Z, y = m[3] * X + m[4] * Y + m[5] * Z, z = m[6] * X + m[7] * Y + m[8] * Z;
      if (k === 0) path.moveTo(cx + R * x, cy - R * y);
      else if (z > 0) {
        if (hid) {
          const t = pz / (pz - z); let qx = px + (x - px) * t, qy = py + (y - py) * t;
          const l = Math.hypot(qx, qy) || 1; qx /= l; qy /= l;
          const a1 = Math.atan2(-qy, qx);
          let d = a1 - ea; d -= TAU * Math.round(d / TAU);
          path.arc(cx, cy, R, ea, ea + d, d < 0);
          hid = false;
        }
        path.lineTo(cx + R * x, cy - R * y);
      } else if (!hid) {
        const t = pz / (pz - z); let qx = px + (x - px) * t, qy = py + (y - py) * t;
        const l = Math.hypot(qx, qy) || 1; qx /= l; qy /= l;
        path.lineTo(cx + R * qx, cy - R * qy);
        ea = Math.atan2(-qy, qx); hid = true;
      }
      px = x; py = y; pz = z;
    }
    path.closePath();
  }
  // Lines: only the visible stretches, lifting the pen at cuts and at the limb.
  function traceLine(path, rg, V, closed) {
    const P = rg.p, n = rg.n, pen = rg.pen, m = V.m, R = V.R, cx = V.cx, cy = V.cy;
    let px = 0, py = 0, pz = -1, down = false;
    const N = closed ? n + 1 : n;
    for (let k = 0; k < N; k++) {
      const i = k % n, q = i * 3, X = P[q], Y = P[q + 1], Z = P[q + 2];
      const x = m[0] * X + m[1] * Y + m[2] * Z, y = m[3] * X + m[4] * Y + m[5] * Z, z = m[6] * X + m[7] * Y + m[8] * Z;
      if (k > 0 && !pen[i]) {
        if (pz > 0 && z > 0) {
          if (!down) path.moveTo(cx + R * px, cy - R * py);
          path.lineTo(cx + R * x, cy - R * y); down = true;
        } else if (pz > 0 || z > 0) {
          const t = pz / (pz - z), qx = px + (x - px) * t, qy = py + (y - py) * t;
          if (pz > 0) { if (!down) path.moveTo(cx + R * px, cy - R * py); path.lineTo(cx + R * qx, cy - R * qy); down = false; }
          else { path.moveTo(cx + R * qx, cy - R * qy); path.lineTo(cx + R * x, cy - R * y); down = true; }
        } else down = false;
      } else down = false;
      px = x; py = y; pz = z;
    }
  }

  // ------------------------------------------------------------------ weather (eased, never snapped)
  const WX = { init: false, cloud: 0, fog: 0, rain: 0, storm: 0, snow: 0, strat: 0, streak: 0, acc: 0, wind: 8, drift: 0 };
  const WXN = ["cloud", "fog", "rain", "storm", "snow", "strat", "streak"];
  function wxTargets(w) {
    const c = (w && w.condition) || "clear";
    const k = w ? U.clamp(w.intensity == null ? 0.5 : +w.intensity || 0) : 0;
    // strat: how much the deck is a smooth sheet rather than heaped cumulus; streak: wind-aligned bands
    const t = { cloud: 0, fog: 0, rain: 0, storm: 0, snow: 0, strat: 0, streak: 0 };
    if (c === "cloudy") { t.cloud = 0.12 + 0.88 * k; t.strat = U.smoothstep(0.45, 0.9, k); }
    else if (c === "fog") { t.fog = 0.45 + 0.55 * k; t.cloud = 0.12; }
    else if (c === "rain") { t.rain = 0.15 + 0.85 * k; t.cloud = 0.74 + 0.26 * k; t.strat = 0.75; t.streak = 0.15; }
    else if (c === "storm") { t.rain = 0.7; t.storm = Math.max(0.6, k); t.cloud = 0.42; t.strat = 0.2; t.streak = 0.1; }
    else if (c === "snow") { t.snow = 0.2 + 0.8 * k; t.cloud = 0.66 + 0.3 * k; t.strat = 0.85; t.streak = 0.5; }
    return t;
  }
  function wxUpdate(f) {
    const w = f.signals && f.signals.weather;
    const t = wxTargets(w), wind = w && w.windKph != null ? Math.max(0, +w.windKph || 0) : 6;
    if (!WX.init) {
      Object.assign(WX, t); WX.wind = wind; WX.acc = t.snow; WX.init = true;
      WX.drift = (f.now.getTime() / 86400000 % 1) * 40;   // each day its own cloud pattern
      return;
    }
    const dt = Math.min(0.1, f.dt || 0.016);
    const k = 1 - Math.exp(-dt / 1.5);
    for (const n of WXN) WX[n] += (t[n] - WX[n]) * k;
    WX.wind += (wind - WX.wind) * k;
    WX.acc += (t.snow - WX.acc) * (1 - Math.exp(-dt / 25));   // snow settles and melts slowly
    WX.drift += dt * (0.3 + WX.wind / 30) * 0.0002;          // degrees: ~1.3 deg an hour in a 45 km/h wind
  }
  let bakedWX = null;
  function wxDelta(ref = bakedWX) {
    if (!ref) return 1;
    let d = 0;
    for (const n of WXN) d += Math.abs(WX[n] - ref[n]);
    d += Math.abs(WX.acc - ref.acc);
    return d;
  }

  // ------------------------------------------------------------------ cloud billboards
  // A billboard lies in the local tangent plane; the orthographic projection is linear, so its exact
  // on-screen footprint (foreshortened toward the limb) is one affine transform.
  function billXf(V, p, sizeDeg, rot) {
    const m = V.m, x = p[0], y = p[1], z = p[2];
    const vz = m[6] * x + m[7] * y + m[8] * z;
    if (vz < 0.015) return null;
    const vx = m[0] * x + m[1] * y + m[2] * z, vy = m[3] * x + m[4] * y + m[5] * z;
    let ex = -y, ey = x; const el = Math.hypot(ex, ey) || 1; ex /= el; ey /= el;
    const nx = -z * ey, ny = z * ex, nz = x * ey - y * ex;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const ux = ex * cr + nx * sr, uy = ey * cr + ny * sr, uz = nz * sr;
    const wx = -ex * sr + nx * cr, wy = -ey * sr + ny * cr, wz = nz * cr;
    const s = sizeDeg * RAD * V.R;
    const a = s * (m[0] * ux + m[1] * uy + m[2] * uz), b = -s * (m[3] * ux + m[4] * uy + m[5] * uz);
    const c = -s * (m[0] * wx + m[1] * wy + m[2] * wz), d = s * (m[3] * wx + m[4] * wy + m[5] * wz);
    const e = V.cx + V.R * vx, f = V.cy - V.R * vy;
    const ext = (Math.abs(a) + Math.abs(c)) * 0.6;
    if (e < -ext || e > W + ext || f < -ext || f > H + ext) return null;
    return [a, b, c, d, e, f];
  }
  function blit(c, xf, tex, k, alpha) {
    c.globalAlpha = U.clamp(alpha);
    c.setTransform(k * xf[0], k * xf[1], k * xf[2], k * xf[3], k * xf[4], k * xf[5]);
    c.drawImage(tex, -0.5, -0.5, 1, 1);
  }

  // Seeded weather systems elsewhere: mid-latitude commas marching east, tropical clusters drifting west.
  let SYS = [];
  function buildSystems() {
    if (SYS.length) return;
    const r = U.rng(9091);
    for (let i = 0; i < 22; i++) {
      const trop = i >= 13;
      const hemi = trop ? (r() < 0.75 ? 1 : -1) : (r() < 0.7 ? 1 : -1);
      SYS.push({ lat: hemi * (trop ? 6 + 16 * r() : 36 + 22 * r()), lon: -180 + 360 * r(), sc: 0.75 + 0.5 * r(), v: (r() * 9) | 0, hemi, trop, rot: (r() - 0.5) * 0.8 });
    }
  }
  const _c = [0, 0, 0];
  function cloudList(s) {
    const L = [], V = s.V, w = s.wx;
    const push = (p, size, rot, tex, a, mk2, dark) => {
      if (a <= 0.01) return null;
      const it = { p, size, rot, tex, a, mk: mk2, xf: null };
      L.push(it); return it;
    };
    const days = s.now / 86400000;
    // ---- elsewhere on the globe (kept clear of home, whose weather is real)
    for (const y of SYS) {
      let lon = y.lon + (y.trop ? -4.5 : 8.5) * days; lon = ((lon + 180) % 360 + 360) % 360 - 180;
      ev(y.lat + (y.trop ? 0 : 3 * Math.sin(days * 0.4 + y.v)), lon, _c);
      if (V.m[6] * _c[0] + V.m[7] * _c[1] + V.m[8] * _c[2] < -0.2) continue;
      const away = ss(13, 21, Math.acos(U.clamp(dot(_c, HOME.v), -1, 1)) / RAD);
      if (away <= 0.01) continue;
      if (y.trop) push(_c.slice(), 7 * y.sc, y.rot, { lit: TEX.trop[y.v & 1] }, 0.7 * away, 0.7 * away);
      else push(_c.slice(), 21 * y.sc, y.rot, { lit: (y.hemi > 0 ? TEX.sys : TEX.sysS)[y.v % 3] }, 0.75 * away, 0.75 * away);
    }
    // ---- over home: a train of storm cells, each born upwind and dying downwind
    s.cells = [];
    if (w.storm > 0.01) {
      const sp = 2.6, Rr = 5.6, da = w.drift * Math.cos(WIND_DIR), db = w.drift * Math.sin(WIND_DIR);
      const i0 = Math.ceil((-Rr - da) / sp), i1 = Math.floor((Rr - da) / sp), j0 = Math.ceil((-Rr - db) / sp), j1 = Math.floor((Rr - db) / sp);
      const sE = dot(SUN, HOME.E), sN = dot(SUN, HOME.N), up = Math.max(0.25, dot(SUN, HOME.v));
      for (let gi = i0; gi <= i1; gi++) {
        for (let gj = j0; gj <= j1; gj++) {
          if (hash2(gi, gj, 11) < 0.25) continue;
          const a = gi * sp + da + (hash2(gi, gj, 1) - 0.5) * sp * 0.8 - 0.4, b = gj * sp + db + (hash2(gi, gj, 2) - 0.5) * sp * 0.8 - 0.2;
          const d = Math.hypot(a, b); if (d > Rr) continue;
          const env = 1 - ss(2.4, Rr, d);
          const sz = 4.6 + 1.8 * hash2(gi, gj, 12), rot = WIND_DIR + (hash2(gi, gj, 13) - 0.5) * 0.5, tx = TEX.cb[(gi + gj) & 1];
          // the shadow it throws on the deck below, away from the sun (shows only in daylight)
          push(offs(HOME.v, HOME.E, HOME.N, a - sE / up * 0.6, b - sN / up * 0.6), sz * 0.95, rot, { lit: tx.dark }, 0.42 * w.storm * env, 0);
          const it = push(offs(HOME.v, HOME.E, HOME.N, a, b), sz, rot, tx, w.storm * env, w.storm * env * 0.95);
          if (it) s.cells.push(it);
        }
      }
    }
    // ---- valley fog: flat soft sheets along the Ottawa Valley and in the low ground around home
    if (w.fog > 0.01) {
      const VAL = [[45.98, -77.48], [45.90, -77.28], [45.82, -77.11], [45.70, -76.90], [45.55, -76.62], [45.43, -76.35],
        [45.38, -76.05], [45.42, -75.70], [45.50, -75.30], [45.58, -74.90], [45.60, -74.40], [45.50, -73.75]];
      for (let k = 0; k < VAL.length - 1; k++) {
        const p0 = VAL[k], p1 = VAL[k + 1];
        const rot = Math.atan2(p1[0] - p0[0], (p1[1] - p0[1]) * Math.cos(p0[0] * RAD));
        for (let h = 0; h < 2; h++) {
          push(ev(U.lerp(p0[0], p1[0], h * 0.5), U.lerp(p0[1], p1[1], h * 0.5)), 0.8 + 0.4 * hash(k * 3 + h), rot, { lit: TEX.fg }, w.fog * 0.8, w.fog * 0.9);
        }
      }
      for (let k = 0; k < 16; k++) {
        const p = offs(HOME.v, HOME.E, HOME.N, (hash(k + 0.3) - 0.5) * 7, (hash(k + 0.7) - 0.5) * 4.5);
        push(p, 0.5 + 0.6 * hash(k + 0.9), (hash(k + 1.1) - 0.5) * 0.8, { lit: TEX.fg }, w.fog * 0.5, w.fog * 0.55);
      }
    }
    return L;
  }

  // ------------------------------------------------------------------ the globe, painted in stages
  // Device-res buffers (3: front, the one fading out, the one being baked), a scratch, a half-res
  // cloud mask, a blur chain for city glow, and two raster kits (half res for bakes, quarter for live).
  let BUF = [], SCR = null, MASK = null, B2 = null, B4 = null, B8 = null, KH = null, KQ = null;
  function mkKit(rs) {
    const rw = Math.max(1, Math.ceil(W * rs)), rh = Math.max(1, Math.ceil(H * rs));
    const r = () => { const o = mk(rw, rh); o.img = o.c.createImageData(rw, rh); return o; };
    return { rs, rw, rh, a: r(), b: r(), m: r() };
  }
  function buildBuffers() {
    BUF = [0, 1, 2].map(() => Object.assign(mk(W * dpr, H * dpr), { snap: null }));
    SCR = mk(W * dpr, H * dpr);
    MASK = mk(W * dpr * 0.5, H * dpr * 0.5);
    B2 = mk(W * dpr / 2, H * dpr / 2); B4 = mk(W * dpr / 4, H * dpr / 4); B8 = mk(W * dpr / 8, H * dpr / 8);
    KH = mkKit(0.5); KQ = mkKit(0.25);
    if (!FLD_H) { FLD_H = mkField(640); FLD_L = mkField(320); }
  }

  // a frozen set of inputs for one painting of the globe; dk = frame.day (the day palette; 0 = the night look)
  function makeSnap(g, e, now, dk) {
    const V = { m: new Float64Array(9), cx: 0, cy: 0, R: 1 };
    viewAt(V, g, e);
    const m = V.m, sty = U.smoothstep(0.25, 0.85, g);
    const ml = 0.4 + 0.6 * moonIllum;
    return {
      V, g, sty, now: now.getTime(), dk: U.clamp(dk || 0) * sty, D: U.clamp(dk || 0),
      sx: m[0] * SUN[0] + m[1] * SUN[1] + m[2] * SUN[2],
      sy: m[3] * SUN[0] + m[4] * SUN[1] + m[5] * SUN[2],
      sz: m[6] * SUN[0] + m[7] * SUN[1] + m[8] * SUN[2],
      night: [18 + 12 * ml, 21 + 13 * ml, 34 + 18 * ml],
      wx: Object.assign({}, WX), clouds: null, cells: [], disk: null,
    };
  }

  // Stage 1: the lighting rasters. a = surface light (multiply), b = atmosphere (lighter, alpha carries
  // the strength), m = where night outlines may show (alpha).
  function rasterBegin(K) { K.a.img.data.fill(0); K.b.img.data.fill(0); K.m.img.data.fill(0); }
  function rasterRows(K, s, j0, j1) {
    const V = s.V, rs = K.rs, rw = K.rw;
    const A = K.a.img.data, B = K.b.img.data, M = K.m.img.data;
    const rpx = V.R * rs, inv = 1 / rpx, ucx = V.cx * rs, ucy = V.cy * rs;
    const sx = s.sx, sy = s.sy, sz = s.sz, sty = s.sty, wk = 1 - sty;
    const lim = 1 + ATM, lim2 = lim * lim, rim = 1 + 2.5 * inv;
    const nr = s.night[0], ng = s.night[1], nb = s.night[2];
    // by day: the sun at full strength, a clearer view toward the limb, a brighter blue haze and limb
    const dk = s.dk, D0 = DAY[0] + (DAYD[0] - DAY[0]) * dk, D1 = DAY[1] + (DAYD[1] - DAY[1]) * dk, D2 = DAY[2] + (DAYD[2] - DAY[2]) * dk;
    const ex0 = 0.45 + 0.23 * dk, hzK = 1 + 0.3 * dk, pfK = 1 - 0.1 * dk;
    for (let j = j0; j < j1; j++) {
      const v = (ucy - (j + 0.5)) * inv, v2 = v * v;
      if (v2 >= lim2) continue;
      const span = Math.sqrt(lim2 - v2) * rpx;
      const i0 = Math.max(0, Math.floor(ucx - span)), i1 = Math.min(rw, Math.ceil(ucx + span));
      let o = (j * rw + i0) * 4;
      for (let i = i0; i < i1; i++, o += 4) {
        const u = (i + 0.5 - ucx) * inv, r2 = u * u + v2;
        if (r2 >= lim2) continue;
        let ar = 0, ag = 0, ab = 0;
        if (r2 < rim) {
          // ---- the surface
          const z = r2 < 1 ? Math.sqrt(1 - r2) : 0;
          const d = u * sx + v * sy + z * sz;
          const dayK = ss(-0.1, 0.035, d);
          const lit = 0.18 + 0.82 * Math.sqrt(d > 0 ? d : 0);
          const warm = (1 - ss(0, 0.3, d)) * dayK;
          const ext = dk > 0 ? ex0 + (1 - ex0) * Math.sqrt(Math.sqrt(z)) : 0.45 + 0.55 * Math.sqrt(Math.sqrt(z));     // extinction toward the limb
          let r = (nr + (D0 * lit - nr) * dayK) * ext;
          let g = (ng + (D1 * lit * (1 - 0.2 * warm) - ng) * dayK) * ext;
          let bl = (nb + (D2 * lit * (1 - 0.42 * warm) - nb) * dayK) * ext;
          if (wk > 0) {   // console: a flat, dimmer night side so the hairlines still read
            const q = 255 * (0.36 + 0.64 * ss(-0.05, 0.05, d));
            r += (q - r) * wk; g += (q - g) * wk; bl += (q - bl) * wk;
          }
          A[o] = r; A[o + 1] = g; A[o + 2] = bl; A[o + 3] = 255;
          if (sty > 0 && r2 < 1) {
            const lz = 1 - z, hz = lz * lz * lz * ss(-0.18, 0.3, d);
            const tw = Math.exp(-(d + 0.02) * (d + 0.02) * 400) * (0.15 + 0.85 * lz * lz);
            ar = (14 * hz * hzK + 30 * tw) * sty; ag = (32 * hz * hzK + 11 * tw) * sty; ab = (72 * hz * hzK + 8 * tw) * sty;
          }
          const nm = 1 - ss(-0.06, 0.07, d);
          M[o + 3] = 255 * (nm + (1 - nm) * wk) * (0.3 + 0.7 * ss(0, 0.25, z));
        }
        if (r2 >= 1 && sty > 0) {
          // ---- the atmosphere beyond the rim: blue by day, a red band at the terminator, airglow by night
          // (continuous across the rim with the haze inside it, so the half-res raster upscales smoothly;
          // the crisp edge is a vector line drawn over it)
          const r1 = Math.sqrt(r2), t = (r1 - 1) / ATM, nu = u / r1, nv = v / r1;
          const dl = nu * sx + nv * sy;
          const day = ss(-0.15, 0.3, dl), hd = ss(-0.18, 0.3, dl) * Math.exp(-6 * t);
          const pf = ss(0, 0.25, t) * Math.exp(-3 * t);
          const red = Math.exp(-(dl + 0.07) * (dl + 0.07) * 110) * ss(0, 0.15, t) * Math.exp(-6 * t) * ss(0.45, -0.05, sz);
          const air = (1 - day) * Math.exp(-(t - 0.3) * (t - 0.3) * 70);
          ar += (14 * hd + 26 * day * pf * pfK + 110 * red + 8 * air) * sty;
          ag += (32 * hd + 60 * day * pf * pfK + 46 * red + 28 * air) * sty;
          ab += (72 * hd + 125 * day * pf * pfK + 18 * red + 16 * air) * sty;
        }
        const mx = ar > ag ? (ar > ab ? ar : ab) : (ag > ab ? ag : ab);
        if (mx > 0.6) { const k = 255 / mx; B[o] = ar * k; B[o + 1] = ag * k; B[o + 2] = ab * k; B[o + 3] = mx; }
      }
    }
  }
  function rasterEnd(K) { K.a.c.putImageData(K.a.img, 0, 0); K.b.c.putImageData(K.b.img, 0, 0); K.m.c.putImageData(K.m.img, 0, 0); }

  // Stage 2: the surface in albedo: ocean, land, ice, snow, lakes, clouds. Also the cloud mask.
  function paintBase(T, s) {
    const c = T.c, V = s.V, sty = s.sty;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, T.cv.width, T.cv.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const disk = new Path2D(); disk.arc(V.cx, V.cy, V.R, 0, TAU); s.disk = disk;
    c.save(); c.clip(disk);
    const dk = s.dk;
    c.fillStyle = rgb(WRK.ocean, natC("ocean", dk), sty); c.fillRect(0, 0, W, H);
    const land = new Path2D(); for (const r of LAY.land) tracePoly(land, r, V);
    c.fillStyle = rgb(WRK.land, natC("land", dk), sty); c.fill(land, "evenodd");
    // by day the land shows its cover: prairie and desert browns, tundra, the dark boreal belt (October: the valley's colours)
    if (dk > 0.01) {
      c.save(); c.clip(land, "evenodd");
      const au = new Date(s.now).getMonth(), list = au >= 8 && au <= 9 ? BIOMES.concat(AUTUMN) : BIOMES;
      for (const [la, lo, sz, sq, rot, col, a] of list) {
        const xf = billXf(V, ev(la, lo), sz, rot);
        if (xf) blit(c, xf, biomeSprite(col, sq), dpr, a * dk);
      }
      c.restore(); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.globalAlpha = 1;
    }
    const ice = new Path2D(); for (const r of LAY.ice) tracePoly(ice, r, V);
    c.fillStyle = rgb(WRK.ice, natC("ice", dk), sty); c.fill(ice, "evenodd");
    // snow on the ground around home (only the lit side will show it)
    if (s.wx.acc > 0.01 && sty > 0.01) {
      const xf = billXf(V, HOME.v, 9, 0);
      if (xf) { c.save(); c.clip(land, "evenodd"); blit(c, xf, TEX.snow, dpr, s.wx.acc * 0.8 * sty); c.restore(); c.setTransform(dpr, 0, 0, dpr, 0, 0); }
    }
    const lakes = new Path2D(); for (const r of LAY.lake) tracePoly(lakes, r, V);
    c.globalAlpha = 1; c.fillStyle = rgb(WRK.lake, natC("lake", dk), sty); c.fill(lakes, "evenodd");
    // clouds: systems elsewhere, the deck over home, then storm cells and fog
    s.clouds = cloudList(s);
    const ca = 0.4 + 0.6 * sty;
    const F = s.live ? FLD_L : FLD_H;
    const fxf = (s.fieldOk !== undefined ? s.fieldOk : paintField(F, s)) ? billXf(V, HOME.v, FSPAN, 0) : null;
    let deckDrawn = false;
    const deckAt = s.clouds.findIndex((it) => it.tex.flash || it.tex.lit === TEX.fg);   // home's own clouds start here
    for (let n = 0; n <= s.clouds.length; n++) {
      if (!deckDrawn && fxf && (n === s.clouds.length || n === deckAt)) { blit(c, fxf, F.cv, dpr, ca); deckDrawn = true; }
      if (n === s.clouds.length) break;
      const it = s.clouds[n];
      it.xf = billXf(V, it.p, it.size, it.rot);
      if (it.xf) blit(c, it.xf, it.tex.lit, dpr, it.a * ca);
    }
    c.restore();
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.globalAlpha = 1;
    // the cloud mask (half res): where clouds hide what lies beneath them
    const mc = MASK.c;
    mc.setTransform(1, 0, 0, 1, 0, 0); mc.globalAlpha = 1; mc.clearRect(0, 0, MASK.cv.width, MASK.cv.height);
    if (fxf) blit(mc, fxf, F.cv, dpr * 0.5, 0.97);
    for (const it of s.clouds) if (it.xf && it.mk > 0.01) blit(mc, it.xf, it.tex.lit, dpr * 0.5, it.mk);
    mc.setTransform(1, 0, 0, 1, 0, 0); mc.globalAlpha = 1;
  }

  // Stage 3: light it. Multiply the surface by the light raster, add the atmosphere, then the outlines
  // (dark side only in the window; everywhere on the console) and the console's hairlines.
  function paintShade(T, K, s) {
    const c = T.c, V = s.V, sty = s.sty, wk = 1 - sty;
    const rw = K.rw / K.rs, rh = K.rh / K.rs;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.globalAlpha = 1;
    c.save(); c.clip(s.disk);
    c.globalCompositeOperation = "multiply"; c.drawImage(K.a.cv, 0, 0, rw, rh);
    c.restore();
    c.globalCompositeOperation = "lighter"; c.drawImage(K.b.cv, 0, 0, rw, rh);
    if (sty > 0.01 && c.createConicGradient) paintLimb(c, s);
    c.globalCompositeOperation = "source-over";
    // outlines into the scratch, masked by the night raster and the clouds
    const o = SCR.c;
    o.setTransform(1, 0, 0, 1, 0, 0); o.globalAlpha = 1; o.globalCompositeOperation = "source-over";
    o.clearRect(0, 0, SCR.cv.width, SCR.cv.height);
    o.setTransform(dpr, 0, 0, dpr, 0, 0);
    o.lineJoin = "round"; o.lineCap = "round";
    const lw = Math.max(0.7, 0.85 * S) * (1 + 0.3 * wk);
    const coast = new Path2D(); for (const r of LAY.land) traceLine(coast, r, V, true); for (const r of LAY.ice) traceLine(coast, r, V, true);
    const lakes = new Path2D(); for (const r of LAY.lake) traceLine(lakes, r, V, true);
    const rivers = new Path2D(); for (const r of LAY.river) traceLine(rivers, r, V, false);
    o.lineWidth = lw; o.strokeStyle = rgb(WRK.line, NAT.line, sty);
    o.globalAlpha = 0.5 + 0.12 * wk; o.stroke(coast);
    o.globalAlpha = 0.55 + 0.1 * wk; o.stroke(lakes);
    o.lineWidth = lw * 0.8; o.strokeStyle = rgb(WRK.river, NAT.river, sty); o.globalAlpha = 0.45; o.stroke(rivers);
    o.globalAlpha = 1;
    o.globalCompositeOperation = "destination-in"; o.drawImage(K.m.cv, 0, 0, rw, rh);
    if (sty > 0.05) { o.globalCompositeOperation = "destination-out"; o.globalAlpha = sty; o.drawImage(MASK.cv, 0, 0, W, H); o.globalAlpha = 1; }
    o.globalCompositeOperation = "source-over";
    c.drawImage(SCR.cv, 0, 0, W, H);
    // the console's hairlines: graticule, terminator, limb
    if (wk > 0.01) {
      const cy = U.safe(C.cyan);
      c.lineWidth = Math.max(0.7, 0.8 * S);
      const gr = new Path2D(); for (const r of LAY.grat) traceLine(gr, r, V, false);
      c.strokeStyle = U.rgba(U.safe(C.cyanDim), 0.32 * wk); c.stroke(gr);
      const term = new Path2D(); traceLine(term, terminatorRing(), V, true);
      c.lineWidth = Math.max(1, 1.2 * S); c.strokeStyle = U.rgba(cy, 0.55 * wk); c.stroke(term);
      c.beginPath(); c.arc(V.cx, V.cy, V.R, 0, TAU); c.strokeStyle = U.rgba(cy, 0.6 * wk); c.stroke();
      c.beginPath(); c.arc(V.cx, V.cy, V.R * 1.035, 0, TAU); c.lineWidth = Math.max(0.6, 0.7 * S); c.strokeStyle = U.rgba(U.safe(C.cyanDim), 0.35 * wk); c.stroke();
    }
  }
  // The limb's crisp lines (additive): the sunlit rim, red where the terminator crosses it, and the thin
  // green airglow layer floating above the night limb. A conic gradient carries the colour around.
  function paintLimb(c, s) {
    const V = s.V, sty = s.sty, n = 144;
    const mkG = (fn) => {
      const g = c.createConicGradient(0, V.cx, V.cy);
      for (let k = 0; k <= n; k++) {
        const q = k / n * TAU, dl = Math.cos(q) * s.sx - Math.sin(q) * s.sy;
        const o = fn(dl);
        g.addColorStop(k / n, `rgb(${Math.round(o[0] * sty)},${Math.round(o[1] * sty)},${Math.round(o[2] * sty)})`);
      }
      return g;
    };
    const ring = (rad, lw, g) => { c.lineWidth = lw; c.strokeStyle = g; c.beginPath(); c.arc(V.cx, V.cy, rad, 0, TAU); c.stroke(); };
    const behind = ss(0.45, -0.05, s.sz);   // the red band only shows against the light, not with the sun at our back
    const red = (dl) => Math.exp(-(dl + 0.05) * (dl + 0.05) * 150) * behind;
    const bk = 1 + 0.2 * s.dk;   // by day the sunlit limb is the soft bright blue band of the photographs
    ring(V.R * (1 + ATM * 0.14), ATM * V.R * 0.22, mkG((dl) => { const d = ss(-0.12, 0.3, dl) * bk, r = red(dl); return [9 * d + 44 * r, 20 * d + 18 * r, 42 * d + 7 * r]; }));
    ring(V.R * (1 + 0.0012), Math.max(1, 1.3 * S), mkG((dl) => { const d = ss(-0.1, 0.3, dl), r = red(dl); return [26 * d + 120 * r, 58 * d + 50 * r, 104 * d + 20 * r]; }));
    ring(V.R * (1 + ATM * 0.32), Math.max(1, 1.5 * S), mkG((dl) => { const a = 1 - ss(-0.25, 0.05, dl); return [12 * a, 40 * a, 24 * a]; }));
  }
  // the great circle 90 deg from the subsolar point
  const TERM = { n: 120, p: new Float32Array(360), pen: new Uint8Array(120) };
  function terminatorRing() {
    const s = SUN, a = Math.abs(s[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let e1 = [s[1] * a[2] - s[2] * a[1], s[2] * a[0] - s[0] * a[2], s[0] * a[1] - s[1] * a[0]];
    const l = Math.hypot(e1[0], e1[1], e1[2]); e1 = e1.map((x) => x / l);
    const e2 = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    for (let k = 0; k < TERM.n; k++) {
      const q = k / TERM.n * TAU, cq = Math.cos(q), sq = Math.sin(q);
      TERM.p[k * 3] = e1[0] * cq + e2[0] * sq; TERM.p[k * 3 + 1] = e1[1] * cq + e2[1] * sq; TERM.p[k * 3 + 2] = e1[2] * cq + e2[2] * sq;
    }
    return TERM;
  }

  // Stage 4: city lights on the night side. Crisp points, a soft halo, and a wide glow that only
  // shows where cloud or fog lies over the cities (the light scattering up through it).
  function paintLights(T, s) {
    const c = T.c, V = s.V, m = V.m, sty = s.sty, wk = 1 - sty;
    const o = SCR.c;
    o.setTransform(1, 0, 0, 1, 0, 0); o.globalAlpha = 1; o.globalCompositeOperation = "source-over";
    o.clearRect(0, 0, SCR.cv.width, SCR.cv.height);
    o.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = V.R, cx = V.cx, cy = V.cy, sx = s.sx, sy = s.sy, sz = s.sz;
    const la = 0.3 + 0.7 * sty, k = S * (0.75 + 0.25 * sty);
    const col = U.safe(U.mix(C.sodium, C.cyanMid, wk * 0.85));
    // the halos of the big metros first
    const gs = glowSprite(U.mix(C.sodiumGlow, C.cyanDim, wk * 0.85));
    for (const [i, gr] of LG) {
      const q = i * 3, X = LP[q], Y = LP[q + 1], Z = LP[q + 2];
      const z = m[6] * X + m[7] * Y + m[8] * Z; if (z < 0.02) continue;
      const x = m[0] * X + m[1] * Y + m[2] * Z, y = m[3] * X + m[4] * Y + m[5] * Z;
      const nf = ss(-0.02, -0.13, x * sx + y * sy + z * sz); if (nf < 0.01) continue;
      const rr = gr * R * (0.4 + 0.6 * Math.sqrt(z)), a = 0.24 * nf * la * (0.4 + 0.6 * ss(0, 0.3, z));
      o.globalAlpha = a; o.drawImage(gs, cx + R * x - rr, cy - R * y - rr * 0.8, rr * 2, rr * 1.6);
    }
    o.fillStyle = U.rgba(col, 1);
    for (let i = 0; i < LN; i++) {
      const q = i * 3, X = LP[q], Y = LP[q + 1], Z = LP[q + 2];
      const z = m[6] * X + m[7] * Y + m[8] * Z; if (z < 0.015) continue;
      const x = m[0] * X + m[1] * Y + m[2] * Z, y = m[3] * X + m[4] * Y + m[5] * Z;
      const px = cx + R * x, py = cy - R * y;
      if (px < -4 || px > W + 4 || py < -4 || py > H + 4) continue;
      const nf = ss(-0.02, -0.13, x * sx + y * sy + z * sz); if (nf < 0.01) continue;
      const a = LB[i] * nf * la * (0.35 + 0.65 * ss(0, 0.3, z));
      const w = LZ[i] * k, h = w * (0.55 + 0.45 * Math.sqrt(z));
      o.globalAlpha = a > 1 ? 1 : a; o.fillRect(px - w / 2, py - h / 2, w, h);
    }
    o.globalAlpha = 1; o.setTransform(1, 0, 0, 1, 0, 0);
    // the blur chain, from the unhidden lights
    for (const [src, dst] of [[SCR, B2], [B2, B4], [B4, B8]]) {
      dst.c.globalCompositeOperation = "source-over"; dst.c.clearRect(0, 0, dst.cv.width, dst.cv.height);
      dst.c.drawImage(src.cv, 0, 0, dst.cv.width, dst.cv.height);
    }
    // clouds and fog hide the crisp points
    if (sty > 0.05) { o.globalCompositeOperation = "destination-out"; o.globalAlpha = sty; o.drawImage(MASK.cv, 0, 0, SCR.cv.width, SCR.cv.height); }
    o.globalAlpha = 1; o.globalCompositeOperation = "source-over";
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.drawImage(SCR.cv, 0, 0, W, H);        // over, not added: a lit city hides the coastline under it
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = 0.32 * la; c.drawImage(B4.cv, 0, 0, W, H);
    c.globalAlpha = 1;
    // under-cloud glow: the wide blur, kept only where the cloud mask is
    if (sty > 0.05) {
      o.globalCompositeOperation = "source-over"; o.clearRect(0, 0, SCR.cv.width, SCR.cv.height);
      o.globalCompositeOperation = "lighter";
      for (let n = 0; n < 3; n++) o.drawImage(B8.cv, 0, 0, SCR.cv.width, SCR.cv.height);
      o.drawImage(B4.cv, 0, 0, SCR.cv.width, SCR.cv.height);
      o.globalCompositeOperation = "destination-in"; o.drawImage(MASK.cv, 0, 0, SCR.cv.width, SCR.cv.height);
      o.globalCompositeOperation = "source-over";
      c.globalAlpha = 0.55 * sty * (1 + 0.12 * s.wx.snow - 0.3 * s.wx.rain); c.drawImage(SCR.cv, 0, 0, W, H);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    // where home is, for the per-frame marker
    const X = HOME.v[0], Y = HOME.v[1], Z = HOME.v[2];
    s.home = { x: cx + R * (m[0] * X + m[1] * Y + m[2] * Z), y: cy - R * (m[3] * X + m[4] * Y + m[5] * Z), z: m[6] * X + m[7] * Y + m[8] * Z };
  }

  function* bakeJob(T, s) {
    // each stage stays a few ms so a bake never costs a frame
    rasterBegin(KH);
    const r3 = Math.ceil(KH.rh / 3);
    for (let k = 0; k < 3; k++) { rasterRows(KH, s, k * r3, Math.min(KH.rh, (k + 1) * r3)); yield; }
    KH.a.c.putImageData(KH.a.img, 0, 0); yield;
    KH.b.c.putImageData(KH.b.img, 0, 0); KH.m.c.putImageData(KH.m.img, 0, 0); yield;
    const N = FLD_H.N, q = N / 5;
    for (let k = 0; k < 5; k++) { s.fieldOk = paintField(FLD_H, s, k * q, (k + 1) * q); yield; }
    paintBase(T, s); yield;
    paintShade(T, KH, s); yield;
    paintLights(T, s); yield;
    expose(T, s);
    T.snap = s;
  }
  function paintLive(T, s) {
    s.live = true;
    rasterBegin(KQ); rasterRows(KQ, s, 0, KQ.rh); rasterEnd(KQ);
    paintBase(T, s); paintShade(T, KQ, s); paintLights(T, s);
    T.gain = s.dk > 0 ? U.lerp(1, ambGain, s.sty) : 1;
    T.snap = s;
  }
  // The window's auto-exposure, by day only: a bake is measured (halved down to an eighth and read back) and laid
  // down at T.gain so a high summer sun over a full deck still keeps the day budget (mean < 25 + 20 * day) with
  // room for the frame and the readout. At night (dk = 0) the gain is exactly 1: the night look is untouched.
  let ambGain = 1;
  function expose(T, s) {
    T.gain = 1;
    if (!(s.dk > 0)) return;
    let src = T;
    for (const dst of [B2, B4, B8]) {
      const c = dst.c;
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
      c.clearRect(0, 0, dst.cv.width, dst.cv.height); c.drawImage(src.cv, 0, 0, dst.cv.width, dst.cv.height);
      src = dst;
    }
    const d = B8.c.getImageData(0, 0, B8.cv.width, B8.cv.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) * d[i + 3];
    const mean = sum / 255 / (d.length / 4), target = 0.84 * (25 + 20 * s.D);
    T.gain = mean > target ? target / mean : 1;
    if (s.g > 0.5) ambGain = T.gain;
  }

  // ------------------------------------------------------------------ static layers
  let starsL = null, frameL = null, FR = null, FLC = null;
  function buildStars() {
    starsL = mk(W * dpr, H * dpr);
    const c = starsL.c; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = U.rng(77), n = Math.round(620 * (W * H) / (1920 * 1080));
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = Math.pow(r(), 1.3) * H * 0.75, m = r();
      const col = U.safe(m < 0.12 ? U.hex("#d8c4a0") : m < 0.3 ? U.hex("#b0c0e8") : C.star);
      const big = r() < 0.06, s = (big ? 1.7 : 1.05) * S;
      c.fillStyle = U.rgba(col, big ? 0.75 : 0.18 + 0.42 * Math.pow(r(), 2));
      c.fillRect(x, y, s, s);
    }
    // a faint Milky Way band: dense dim dust
    for (let i = 0; i < n * 1.4; i++) {
      const t = r(), g = (r() + r() + r() - 1.5) * 0.16 * (0.7 + 0.5 * Math.sin(t * 7 + 1));
      const x = t * W, y = (0.02 + 0.3 * t + g) * H;
      c.fillStyle = U.rgba(U.safe(C.star), 0.06 + 0.1 * r());
      c.fillRect(x, y, 0.9 * S, 0.9 * S);
    }
  }
  // The window: a rounded aperture in a dim frame with bolts; everything outside it is the station.
  function buildFrame() {
    frameL = mk(W * dpr, H * dpr);
    const c = frameL.c; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = 0.032 * H, rad = 0.13 * H, band = 0.017 * H;
    FR = { x0: m, y0: m, x1: W - m, y1: H - m, rad, band };
    const rr = (x0, y0, x1, y1, r) => { c.beginPath(); c.roundRect ? c.roundRect(x0, y0, x1 - x0, y1 - y0, r) : c.rect(x0, y0, x1 - x0, y1 - y0); };
    // outside the aperture: black
    c.fillStyle = "#000"; c.beginPath(); c.rect(0, 0, W, H);
    if (c.roundRect) c.roundRect(m, m, W - 2 * m, H - 2 * m, rad); else c.rect(m, m, W - 2 * m, H - 2 * m);
    c.fill("evenodd");
    const fc = U.safe(C.frame);
    // the frame band: a dark surface between two hairlines
    c.fillStyle = U.rgba(fc, 0.05); c.beginPath(); c.rect(0, 0, W, H);
    if (c.roundRect) c.roundRect(m - band, m - band, W - 2 * (m - band), H - 2 * (m - band), rad + band);
    c.fill();
    c.lineWidth = Math.max(1, 1.1 * S);
    rr(m, m, W - m, H - m, rad); c.strokeStyle = U.rgba(fc, 0.55); c.stroke();
    rr(m - band, m - band, W - m + band, H - m + band, rad + band); c.strokeStyle = U.rgba(fc, 0.3); c.stroke();
    rr(m + 0.004 * H, m + 0.004 * H, W - m - 0.004 * H, H - m - 0.004 * H, rad - 0.004 * H); c.strokeStyle = U.rgba(fc, 0.16); c.stroke();
    // bolts along the band's midline
    const mid = m - band / 2, R0 = rad + band / 2;
    const L = [W - 2 * m - 2 * rad, H - 2 * m - 2 * rad];
    const per = 2 * (L[0] + L[1]) + TAU * R0, step = 0.075 * H, n = Math.round(per / step);
    const at = (d) => {
      // walk the rounded rectangle clockwise from the top-left straight
      const segs = [[L[0], (t) => [m + rad + t, mid]], [Math.PI / 2 * R0, (t) => { const q = -Math.PI / 2 + t / R0; return [W - m - rad + Math.cos(q) * R0, m + rad + Math.sin(q) * R0]; }],
        [L[1], (t) => [W - mid, m + rad + t]], [Math.PI / 2 * R0, (t) => { const q = t / R0; return [W - m - rad + Math.cos(q) * R0, H - m - rad + Math.sin(q) * R0]; }],
        [L[0], (t) => [W - m - rad - t, H - mid]], [Math.PI / 2 * R0, (t) => { const q = Math.PI / 2 + t / R0; return [m + rad + Math.cos(q) * R0, H - m - rad + Math.sin(q) * R0]; }],
        [L[1], (t) => [mid, H - m - rad - t]], [Math.PI / 2 * R0, (t) => { const q = Math.PI + t / R0; return [m + rad + Math.cos(q) * R0, m + rad + Math.sin(q) * R0]; }]];
      for (const [len, fn] of segs) { if (d <= len) return fn(d); d -= len; }
      return segs[0][1](0);
    };
    const br = Math.max(1.6, 0.0034 * H);
    for (let i = 0; i < n; i++) {
      const [x, y] = at(i * per / n);
      c.beginPath(); c.arc(x, y, br, 0, TAU); c.fillStyle = U.rgba(fc, 0.16); c.fill();
      c.strokeStyle = U.rgba(fc, 0.45); c.lineWidth = Math.max(0.8, 0.8 * S); c.stroke();
      c.beginPath(); c.moveTo(x - br * 0.55, y - br * 0.2); c.lineTo(x + br * 0.55, y + br * 0.2); c.strokeStyle = U.rgba(fc, 0.35); c.stroke();
    }
    // the readout plate on the top-left of the frame
    const px0 = m + 0.03 * W, py0 = m + 0.03 * H, pw = 0.2 * W, ph = 0.205 * H;
    c.strokeStyle = U.rgba(fc, 0.3); c.lineWidth = Math.max(0.8, 0.9 * S);
    const k = 0.014 * H;
    c.beginPath();
    c.moveTo(px0, py0 + k); c.lineTo(px0, py0); c.lineTo(px0 + k, py0);
    c.moveTo(px0 + pw - k, py0); c.lineTo(px0 + pw, py0); c.lineTo(px0 + pw, py0 + k);
    c.moveTo(px0, py0 + ph - k); c.lineTo(px0, py0 + ph); c.lineTo(px0 + k, py0 + ph);
    c.moveTo(px0 + pw - k, py0 + ph); c.lineTo(px0 + pw, py0 + ph); c.lineTo(px0 + pw, py0 + ph - k);
    c.stroke();
    FR.plate = { x: px0, y: py0, w: pw, h: ph };
  }

  // ------------------------------------------------------------------ the moon
  const MARIA = [
    [-0.36, -0.36, 0.26, 0.22, 0.3], [0.13, -0.4, 0.17, 0.15, 0.1], [0.3, -0.07, 0.21, 0.17, -0.3], [0.66, -0.3, 0.11, 0.09, 0.2],
    [0.55, 0.16, 0.13, 0.17, 0.4], [0.36, 0.36, 0.09, 0.08, 0], [-0.17, 0.44, 0.16, 0.12, 0.5], [-0.62, -0.02, 0.18, 0.36, 0.2],
  ];
  let moonC = null, moonKey = "";
  function moonSprite(r, illum, ang) {
    const key = `${Math.round(illum * 90)}|${Math.round(ang / RAD / 3)}|${Math.round(r * dpr)}`;
    if (key === moonKey && moonC) return moonC;
    const Sz = Math.ceil(r * 2 + 8);
    const { cv, c } = mk(Sz * dpr, Sz * dpr); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.translate(Sz / 2, Sz / 2);
    const bc = U.safe(C.moon);
    c.fillStyle = "rgba(0,0,0,1)"; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();   // it hides the stars behind it
    c.fillStyle = U.rgba(U.safe(C.star), 0.04); c.fill();
    if (illum > 0.01) {
      c.save(); c.rotate(ang);
      const k = 1 - 2 * illum;
      c.beginPath();
      c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
      c.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
      c.closePath(); c.rotate(-ang); c.clip();
      const g = c.createRadialGradient(-r * 0.15, -r * 0.15, 0, 0, 0, r);
      g.addColorStop(0, U.rgba(bc, 0.78)); g.addColorStop(0.85, U.rgba(bc, 0.66)); g.addColorStop(1, U.rgba(bc, 0.5));
      c.fillStyle = g; c.fillRect(-r, -r, 2 * r, 2 * r);
      for (const [x, y, a, b2, rot] of MARIA) {
        c.save(); c.translate(x * r, y * r); c.rotate(rot);
        c.fillStyle = "rgba(0,0,0,0.13)"; c.beginPath(); c.ellipse(0, 0, a * r, b2 * r, 0, 0, TAU); c.fill();
        c.fillStyle = "rgba(0,0,0,0.06)"; c.beginPath(); c.ellipse(0, 0, a * r * 1.3, b2 * r * 1.3, 0, 0, TAU); c.fill();
        c.restore();
      }
      c.restore();
    }
    moonKey = key; moonC = { cv, Sz };
    return moonC;
  }

  // ------------------------------------------------------------------ per-frame events
  // Lightning: bursts of 2-4 flickers inside one cell, now and then jumping to a neighbour. Rare and dim.
  function lightning(t, n) {
    if (!n) return null;
    const P = 6.5, k = Math.floor(t / P), ph = t - k * P;
    if (hash(k + 0.5) > 0.62) return null;
    const t0 = 0.6 + hash(k + 0.31) * (P - 2);
    if (ph < t0 || ph > t0 + 1.4) return null;
    const cnt = 2 + Math.floor(hash(k + 0.9) * 3);
    let v = 0, v2 = 0;
    for (let j = 0; j < cnt; j++) {
      const tj = t0 + j * (0.09 + 0.16 * hash(k + j * 1.7));
      if (ph >= tj) v += (j ? 0.55 + 0.4 * hash(k + j) : 1) * Math.exp(-(ph - tj) / 0.06);
    }
    const tn = t0 + 0.35 + 0.3 * hash(k + 3.3);
    if (hash(k + 4.1) < 0.5 && ph >= tn) v2 = 0.6 * Math.exp(-(ph - tn) / 0.08);
    const i = Math.floor(hash(k + 0.77) * n) % n;
    return { v: U.clamp(v), i, j: (i + 1 + Math.floor(hash(k + 2.2) * (n - 1))) % n, v2,
      px: (hash(k + 5.5) - 0.5) * 0.45, py: (hash(k + 6.6) - 0.5) * 0.35, qx: (hash(k + 7.7) - 0.5) * 0.45, qy: (hash(k + 8.8) - 0.5) * 0.35 };
  }
  // A satellite now and then: a dim dot gliding through the sky above the limb, with a brief glint.
  function satellite(t) {
    const P = 75, k = Math.floor(t / P), ph = t - k * P;
    if (hash(k + 0.13) > 0.55) return null;
    const t0 = 4 + hash(k + 0.41) * 30, dur = 26 + 14 * hash(k + 0.59), u = (ph - t0) / dur;
    if (u < 0 || u > 1) return null;
    const ltr = hash(k + 0.83) < 0.5, y0 = (0.08 + 0.16 * hash(k + 0.29)) * H, y1 = y0 + (hash(k + 0.97) - 0.4) * 0.12 * H;
    const x = ltr ? U.lerp(0.05 * W, 0.95 * W, u) : U.lerp(0.95 * W, 0.05 * W, u);
    const gl = Math.exp(-Math.pow((u - 0.35 - 0.3 * hash(k + 1.7)) / 0.025, 2));
    return { x, y: U.lerp(y0, y1, u), a: Math.sin(Math.PI * u), gl, dx: ltr ? 1 : -1, k, u, dur };
  }

  // ------------------------------------------------------------------ the station cat
  // The crew's cat, on a padded ledge fixed to the window's lower rim, its back to the room, watching the Earth
  // turn (it loafs, then curls up asleep as the night wears on). Backlit by the earthlight on both flanks (cool
  // night-side blue, ocean blue when the visible face is sunlit) and warm along the sunward edge while the station
  // is in sunlight; the coat takes the cabin's dim cyan by night and its warm lamps by day. THEMES.md "The cat".
  let CAT = null;
  const CATC = { day: hex("#5a8ed2"), cabinN: hex("#56738e"), cabinD: hex("#c8a478"), sun: hex("#e0a070"), pad: hex("#3a4d62") };
  const _rimL = { color: null, a: 0, dx: -1, dy: -0.55 }, _rimR = { color: null, a: 0, dx: 1, dy: -0.55 }, _rimS = { color: null, a: 0, dx: 0, dy: -1 };
  const _rims = [_rimL, _rimR, _rimS], _catO = { x: 0, y: 0, size: 1, facing: -1, pose: "back", light: 0.25, tint: null, tintAmt: 0.35, rim: _rims, glow: 0, shadow: 0, alpha: 0 };
  function drawCat(ctx, f, a, D) {
    const o = _catO;
    o.alpha = f.cat ? a : 0;
    if (!f.cat || a < 0.002) { CAT.draw(ctx, f, o); return; }   // keeps its clock running; draws nothing
    const size = 0.13 * H, cx = 0.765 * W, y = FR.y1 - 0.03 * H;
    // the pad: a short padded ledge fixed on the inside of the rim (it hides the Earth behind it), its lip catching
    // the earthlight
    const pw = 0.6 * size, pTop = y - 0.003 * H, pBot = FR.y1 + 1;
    const m = _V.m;
    const sx = m[0] * SUN[0] + m[1] * SUN[1] + m[2] * SUN[2], sy = m[3] * SUN[0] + m[4] * SUN[1] + m[5] * SUN[2];
    const sz = m[6] * SUN[0] + m[7] * SUN[1] + m[8] * SUN[2];
    const ed = U.smoothstep(-0.35, 0.55, sz);                    // how much of the Earth below is sunlit
    const sunK = ss(-0.22, 0.05, dot(SUN, HOME.v));             // the station itself in sunlight
    const earth = U.safe(U.mix(C.readout, CATC.day, ed));
    ctx.globalAlpha = a;
    const pr = 0.5 * (pBot - pTop), pc = U.safe(CATC.pad);
    const pad = () => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - pw, pTop, 2 * pw, pBot - pTop, [pr, pr, 2, 2]); else ctx.rect(cx - pw, pTop, 2 * pw, pBot - pTop); };
    pad(); ctx.fillStyle = "#000"; ctx.fill();
    const pg = ctx.createLinearGradient(0, pTop, 0, pBot);
    pg.addColorStop(0, U.rgba(pc, 0.16 + 0.3 * D)); pg.addColorStop(1, U.rgba(pc, 0.04 + 0.12 * D));
    ctx.fillStyle = pg; ctx.fill();
    ctx.lineWidth = Math.max(1, 1.1 * S);
    ctx.strokeStyle = U.rgba(pc, 0.5); ctx.stroke();
    // seams on the padding, and the lit lip
    ctx.strokeStyle = U.rgba(pc, 0.35); ctx.beginPath();
    for (let i = -2; i <= 2; i++) { const sx2 = cx + i * pw * 0.4; ctx.moveTo(sx2, pTop + 0.35 * pr); ctx.lineTo(sx2, pBot - 0.2 * pr); }
    ctx.stroke();
    ctx.strokeStyle = U.rgba(earth, 0.22 + 0.25 * ed); ctx.beginPath(); ctx.moveTo(cx - pw + pr, pTop + 0.6); ctx.lineTo(cx + pw - pr, pTop + 0.6); ctx.stroke();
    ctx.globalAlpha = 1;
    // backlight from the window: both flanks in earthlight, and the sunward edge while the station is sunlit
    _rimL.color = _rimR.color = earth;
    _rimL.a = _rimR.a = 0.4 + 0.25 * ed;
    const sl = Math.hypot(sx, sy) || 1;
    _rimS.color = U.safe(CATC.sun); _rimS.a = 0.6 * sunK; _rimS.dx = sx / sl; _rimS.dy = Math.min(-0.2, -sy / sl);
    o.x = cx; o.y = y; o.size = size;
    o.pose = AW.cat.autoPose(f, "back");
    o.light = 0.2 + 0.62 * D + 0.06 * ed;
    o.tint = U.mix(CATC.cabinN, CATC.cabinD, D); o.tintAmt = 0.4 - 0.15 * D;
    o.glow = 0.55 * (1 - D);
    o.shadow = 0.45 * D;
    CAT.draw(ctx, f, o);
  }

  // ------------------------------------------------------------------ sound: inside the station
  // The bed is the station alone: its hum (space) and the ventilation (room). No weather: you are in orbit, and
  // the silence is part of it. Cues: a soft two-note chime on the PA when the terminator crosses home (local
  // sunrise and sunset), and the hover of a pass, panned by its direction, timed so its closest point lands as the
  // satellite crosses the middle of the window. The storm cells flicker silently (thunder does not reach orbit).
  const SND = { sh: null, ms: 0, satK: -1 };
  const cue = (name, o) => { if (AW.audio) AW.audio.cue(name, o); };
  function soundscape() { return { space: 0.55, room: 0.15 }; }
  function terminatorCue(now) {
    const sh = dot(SUN, HOME.v), ms = now.getTime();
    // a jump of the clock (a warp, a test) is not the terminator passing
    if (SND.sh !== null && (sh > 0) !== (SND.sh > 0) && Math.abs(ms - SND.ms) < 10 * 60000) {
      cue("chime", { notes: 2, freq: sh > 0 ? 783.99 : 659.25, gain: 0.55, distance: 0.3, pan: 0 });
    }
    SND.sh = sh; SND.ms = ms;
  }

  // ------------------------------------------------------------------ now playing
  // Work: one console line top right, over the SYSTEMS column (a play / pause mark, TITLE — ARTIST in the mono,
  // cut at a word with the real font) and the progress as the caption hairline above it, as every console block
  // has. Paused: the pause mark and the line dims. Ambient: the COMMS · AUDIO FEED readout under the station
  // clock's plate, a progress tick bar under it and, when the track has art, a tiny monochrome thumbnail.
  const NPL = { key: "", line: "", fkey: "", fline: "" };
  const npText = (np) => {
    const ti = String(np.title || "").replace(/\s+/g, " ").trim(), ar = String(np.artist || "").replace(/\s+/g, " ").trim();
    return (ar ? `${ti} — ${ar}` : ti).toUpperCase();
  };
  function npLine(np, o, maxW, feed) {
    const str = npText(np), key = `${str}|${Math.round(o.px)}|${o.spacing}|${Math.round(maxW)}`;
    if (feed ? NPL.fkey === key : NPL.key === key) return feed ? NPL.fline : NPL.line;
    const line = U.ellipsize(str, maxW, fitCtx(o));
    if (LS) mctx.letterSpacing = "0px";
    if (feed) { NPL.fkey = key; NPL.fline = line; } else { NPL.key = key; NPL.line = line; }
    return line;
  }
  const npFrac = (np) => (typeof np.progressMs === "number" && typeof np.durationMs === "number" && np.durationMs > 0
    ? U.clamp(np.progressMs / np.durationMs) : null);
  function npGlyph(ctx, x, y, h, paused, col, a) {
    if (a <= 0.004) return;
    ctx.globalAlpha = U.clamp(a); ctx.fillStyle = U.rgba(U.safe(col), 1);
    if (paused) { const w = h * 0.24; ctx.fillRect(x - w * 1.5, y - h / 2, w, h); ctx.fillRect(x + w * 0.5, y - h / 2, w, h); }
    else { ctx.beginPath(); ctx.moveTo(x - h * 0.4, y - h / 2); ctx.lineTo(x + h * 0.45, y); ctx.lineTo(x - h * 0.4, y + h / 2); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function drawNowPlaying(ctx, f, a, sink) {
    const np = f.signals.nowPlaying;
    if (!np || !np.title || a <= 0.004) return;
    const paused = !np.isPlaying, k = a * (paused ? 0.5 : 1);
    const x = 0.66 * W, y = 0.135 * H + sink, L = 0.26 * W, gh = 0.0105 * H, tx = x + gh + 0.012 * H;
    const o = { px: Math.max(12, 0.0175 * H), spacing: 0.16, color: C.cyanMid, glow: 2, core: 0.95, mono: true };
    npGlyph(ctx, x + gh / 2, y, gh, paused, paused ? C.cyanDim : C.cyan, k * 0.85);
    text(ctx, npLine(np, o, x + L - tx), tx, y, o, "left", 1, k * 0.82);
    const p = npFrac(np);
    if (p === null) return;
    const hy = y - 0.022 * H, lw = Math.max(1, S);
    ctx.lineWidth = lw;
    ctx.globalAlpha = k * 0.45; ctx.strokeStyle = U.rgba(U.safe(C.cyanFaint), 1);
    ctx.beginPath(); ctx.moveTo(x, hy); ctx.lineTo(x + L, hy); ctx.stroke();
    if (p > 0) {
      ctx.globalAlpha = k * 0.8; ctx.strokeStyle = U.rgba(U.safe(paused ? C.cyanDim : C.cyanMid), 1);
      ctx.beginPath(); ctx.moveTo(x, hy); ctx.lineTo(x + L * p, hy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + L * p, hy - 0.004 * H); ctx.lineTo(x + L * p, hy + 0.004 * H); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // album art: loaded once per URL (same-origin), a failed load is remembered and never retried; the thumbnail is
  // baked once per size in the readout's blue-grey (grayscale x readout colour), so it never blooms
  const ART = new Map();
  function artThumb(url, size) {
    if (!url || typeof url !== "string") return null;
    let A = ART.get(url);
    if (!A) {
      if (ART.size > 6) ART.clear();
      A = { img: new Image(), ok: false, bad: false, th: null, sz: 0 };
      A.img.onload = () => { A.ok = A.img.naturalWidth > 0; A.bad = !A.ok; };
      A.img.onerror = () => { A.bad = true; };
      try { A.img.src = url; } catch (e) { A.bad = true; }
      ART.set(url, A);
    }
    if (!A.ok || A.bad) return null;
    const px = Math.max(8, Math.round(size * dpr));
    if (!A.th || A.sz !== px) {
      try {
        const { cv, c } = mk(px, px), iw = A.img.naturalWidth, ih = A.img.naturalHeight, s = Math.min(iw, ih);
        if ("filter" in c) c.filter = "grayscale(1) contrast(0.9)";
        c.drawImage(A.img, (iw - s) / 2, (ih - s) / 2, s, s, 0, 0, px, px);
        if ("filter" in c) c.filter = "none";
        c.globalCompositeOperation = "multiply"; c.fillStyle = U.rgba(U.safe(C.readout), 1); c.fillRect(0, 0, px, px);
        c.globalCompositeOperation = "source-over";
        A.th = cv; A.sz = px;
      } catch (e) { A.bad = true; return null; }
    }
    return A.th;
  }
  // the ambient feed under the plate, from y; returns the y below it (0 when there is nothing to show)
  function drawFeed(ctx, f, a, x, y, w) {
    const np = f.signals.nowPlaying;
    if (!np || !np.title || a <= 0.004) return 0;
    const paused = !np.isPlaying, k = a * (paused ? 0.6 : 1), lp = Math.max(11, 0.0155 * H);
    const th = 0.05 * H, art = artThumb(np.art, th);
    let tx = x;
    if (art) {
      ctx.globalAlpha = k * 0.5; ctx.drawImage(art, x, y - 0.009 * H, th, th);
      ctx.globalAlpha = k * 0.35; ctx.strokeStyle = U.rgba(U.safe(C.frame), 1); ctx.lineWidth = Math.max(0.8, 0.9 * S);
      ctx.strokeRect(x - 0.5, y - 0.009 * H - 0.5, th + 1, th + 1); ctx.globalAlpha = 1;
      tx = x + th + 0.014 * H;
    }
    const tw = Math.max(0.08 * W, x + w - tx);
    text(ctx, paused ? "COMMS  ·  AUDIO FEED  ·  HOLD" : "COMMS  ·  AUDIO FEED", tx, y, { px: lp, spacing: 0.3, color: C.readoutDim, glow: 2, core: 0.9, mono: true }, "left", 1, k * 0.75);
    const o = { px: Math.max(11, 0.0165 * H), spacing: 0.14, color: C.readout, glow: 3 * S, core: 0.85, mono: true };
    const gh = 0.009 * H;
    npGlyph(ctx, tx + gh / 2, y + 0.024 * H, gh, paused, C.readoutDim, k * 0.6);
    text(ctx, npLine(np, o, Math.max(tw, 0.3 * W - (tx - x)) - gh - 0.01 * H, true), tx + gh + 0.01 * H, y + 0.024 * H, o, "left", 1, k * 0.7);   // the line may run past the plate
    const p = npFrac(np);
    if (p !== null) {
      // a tick bar: one tick per thirtieth, the played ones lit, the current one tall
      const n = 30, step = tw / n, ty = y + 0.043 * H, cur = Math.min(n - 1, Math.floor(p * n));
      ctx.lineWidth = Math.max(1, S);
      ctx.strokeStyle = U.rgba(U.safe(C.readoutDim), 1); ctx.globalAlpha = k * 0.3;
      ctx.beginPath();
      for (let i = cur + 1; i < n; i++) { const xx = Math.round(tx + i * step) + 0.5; ctx.moveTo(xx, ty - 0.003 * H); ctx.lineTo(xx, ty + 0.003 * H); }
      ctx.stroke();
      ctx.strokeStyle = U.rgba(U.safe(C.readout), 1); ctx.globalAlpha = k * 0.55;
      ctx.beginPath();
      for (let i = 0; i < cur; i++) { const xx = Math.round(tx + i * step) + 0.5; ctx.moveTo(xx, ty - 0.003 * H); ctx.lineTo(xx, ty + 0.003 * H); }
      ctx.stroke();
      ctx.globalAlpha = k * 0.8; ctx.beginPath();
      { const xx = Math.round(tx + cur * step) + 0.5; ctx.moveTo(xx, ty - 0.007 * H); ctx.lineTo(xx, ty + 0.007 * H); }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    return Math.max(y + 0.055 * H, art ? y - 0.009 * H + th : 0);
  }

  // ------------------------------------------------------------------ work HUD
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const doy = (d) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400000);
  const tminus = (min) => (min < 1 ? "T-0" : `T-${U.fmtMinutes(min).toUpperCase()}`);
  function caption(ctx, str, x, y, a, w) {
    const lp = Math.max(12, 0.0175 * H);
    text(ctx, str, x, y, { px: lp, spacing: 0.32, color: C.cyanDim, glow: 2, core: 0.95, mono: true }, "left", 1, a * 0.95);
    if (w) {
      ctx.globalAlpha = a * 0.45; ctx.strokeStyle = U.rgba(U.safe(C.cyanFaint), 1); ctx.lineWidth = Math.max(1, S);
      ctx.beginPath(); ctx.moveTo(x, y - 0.022 * H); ctx.lineTo(x + w, y - 0.022 * H); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  function drawDaylight(ctx, f, a, sink) {
    const dl = f.signals.daylight, now = f.now;
    if (!dl || !dl.sunrise || !dl.sunset || a <= 0.004) return;
    const x = 0.765 * W, y = 0.655 * H + sink;
    let big, cap;
    if (dl.isDay && dl.lightLeftMin != null) { big = U.fmtMinutes(dl.lightLeftMin); cap = `OF LIGHT LEFT  ·  SUNSET ${U.fmtTime(dl.sunset)}`; }
    else {
      let rise = dl.sunrise.getTime(); if (rise < now.getTime()) rise += 86400000;
      big = U.fmtMinutes((rise - now.getTime()) / 60000); cap = `UNTIL SUNRISE  ·  ${U.fmtTime(new Date(rise))}`;
    }
    text(ctx, big, x, y, { px: 0.046 * H, weight: 300, color: C.cyan, glow: 6 * S, core: 0.92 }, "center", 1, a * 0.95);
    text(ctx, cap, x, y + 0.048 * H, { px: Math.max(12, 0.0175 * H), spacing: 0.28, color: C.cyanDim, glow: 2, core: 0.95, mono: true }, "center", 1, a * 0.9);
  }
  function drawCalendar(ctx, f, a, sink) {
    const next = f.signals.calendar && f.signals.calendar.next;
    if (!next || a <= 0.004) return;
    const x = 0.06 * W, y = 0.79 * H + sink, mins = next.minutesUntil, soon = U.smoothstep(15, 4, mins);
    caption(ctx, "NEXT EVENT", x, y, a, 0.22 * W);
    text(ctx, tminus(mins), x, y + 0.058 * H, { px: 0.056 * H, weight: 300, color: soon > 0.5 ? C.cyan : C.cyanMid, glow: 7 * S, core: 0.92, mono: true }, "left", 1, a);
    text(ctx, String(next.title).toUpperCase(), x, y + 0.112 * H, { px: Math.max(13, 0.022 * H), spacing: 0.2, color: C.cyanDim, glow: 2, core: 0.95, mono: true }, "left", 1, a * 0.9);
  }
  function drawWeatherSliver(ctx, f, a, sink) {
    const wx = f.signals.weather;
    if (!wx || !wx.actionable || a <= 0.004) return;
    const x = 0.06 * W, y = 0.545 * H + sink, gw = 0.022 * H;
    const ic = U.safe(C.cyanMid);
    ctx.globalAlpha = a * 0.8; ctx.strokeStyle = U.rgba(ic, 1); ctx.lineWidth = Math.max(1, 1.3 * S); ctx.lineCap = "round";
    ctx.beginPath();
    if (wx.condition === "rain" || wx.condition === "storm") {
      for (let k = 0; k < 3; k++) { const gx = x + k * gw * 0.38; ctx.moveTo(gx + gw * 0.18, y - gw * 0.42); ctx.lineTo(gx, y + gw * 0.42); }
    } else if (wx.condition === "snow") {
      for (let k = 0; k < 3; k++) { const q = k * Math.PI / 3; ctx.moveTo(x + gw * 0.45 - Math.cos(q) * gw * 0.42, y - Math.sin(q) * gw * 0.42); ctx.lineTo(x + gw * 0.45 + Math.cos(q) * gw * 0.42, y + Math.sin(q) * gw * 0.42); }
    } else ctx.arc(x + gw * 0.4, y, gw * 0.3, 0, TAU);
    ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = "butt";
    const s = wx.tempC != null ? `${String(wx.actionable).toUpperCase()}  ·  ${Math.round(wx.tempC)}°C` : String(wx.actionable).toUpperCase();
    text(ctx, s, x + gw * 1.4, y, { px: Math.max(13, 0.024 * H), spacing: 0.08, color: C.cyanMid, glow: 3, core: 0.92, mono: true }, "left", 1, a * 0.9);
  }
  function drawFinance(ctx, f, a, sink) {
    const fin = f.signals.finances;
    if (!fin || a <= 0.004 || fin.income == null || fin.spent == null) return;
    const mood = fin.mood || "calm", warn = mood === "warning", drift = mood === "drift";
    const pulse = warn ? 0.82 + 0.18 * Math.sin(f.t * 2.1) : 1;
    const mc = warn ? C.alarm : drift ? C.straw : C.cyan;
    const x = 0.36 * W, y = 0.79 * H + sink;
    const net = fin.net != null ? fin.net : fin.income - fin.spent;
    caption(ctx, `NET  ·  ${MONTHS[f.now.getMonth()]}`, x, y, a, 0.22 * W);
    text(ctx, U.fmtMoney(net, { sign: true }), x, y + 0.058 * H, { px: 0.056 * H, weight: 300, color: mc, glow: (warn ? 10 : 6) * S, core: 0.92, mono: true }, "left", 1, a * pulse);
    // gauge: made (the hairline) over spent (its share)
    const L = 0.2 * W, gy = y + 0.1 * H, ratio = fin.income > 0 ? fin.spent / fin.income : 1;
    ctx.lineCap = "round";
    ctx.globalAlpha = a * 0.7; ctx.strokeStyle = U.rgba(U.safe(C.cyanDim), 1); ctx.lineWidth = Math.max(1, 1.1 * S);
    ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + L, gy); ctx.stroke();
    ctx.globalAlpha = a * 0.9 * pulse; ctx.strokeStyle = U.rgba(U.safe(mc), 1); ctx.lineWidth = Math.max(1.5, 2 * S);
    ctx.beginPath(); ctx.moveTo(x, gy + 0.009 * H); ctx.lineTo(x + L * Math.min(1, ratio), gy + 0.009 * H); ctx.stroke();
    if (ratio > 1) {
      const ex = Math.min(0.04 * W, L * (ratio - 1));
      ctx.strokeStyle = U.rgba(U.safe(C.alarm), 1); ctx.lineWidth = Math.max(2, 2.4 * S);
      ctx.beginPath(); ctx.moveTo(x + L, gy + 0.009 * H); ctx.lineTo(x + L + ex, gy + 0.009 * H); ctx.stroke();
      glow(ctx, C.alarm, x + L + ex, gy + 0.009 * H, 0.024 * H, 0.024 * H, a * 0.4 * pulse);
    }
    ctx.globalAlpha = 1; ctx.lineCap = "butt";
    let sub = `${U.fmtMoney(fin.income)} IN  ·  ${U.fmtMoney(fin.spent)} OUT`;
    if (fin.lastUpdated) {
      const hrs = (f.now - fin.lastUpdated) / 3600000;
      sub += `  ·  ${hrs >= 1 && hrs < 48 ? Math.round(hrs) + " H" : U.fmtAgo(fin.lastUpdated, f.now).toUpperCase()}`;
    }
    text(ctx, sub, x, gy + 0.034 * H, { px: Math.max(12, 0.0175 * H), spacing: 0.1, color: C.cyanDim, glow: 2, core: 0.95, mono: true }, "left", 1, a * 0.9);
  }
  function drawSystems(ctx, f, a, sink) {
    const hb = Array.isArray(f.signals.heartbeat) ? f.signals.heartbeat : [];
    if (!hb.length || a <= 0.004) return;
    const x = 0.66 * W, y = 0.79 * H + sink, t = f.t;
    caption(ctx, "SYSTEMS", x, y, a, 0.26 * W);
    const lp = Math.max(13, 0.024 * H), step = 0.046 * H;
    const n = Math.min(hb.length, 4);
    for (let i = 0; i < n; i++) {
      const h = hb[i], down = !h.up, yy = y + 0.05 * H + i * step;
      const p = 0.5 + 0.5 * Math.sin(t * TAU / (down ? 1.4 : 4) + i);
      const col = down ? C.alarm : C.nominal, c = U.safe(col), r0 = 0.0055 * H;
      if (down) {
        glow(ctx, C.alarm, x + r0, yy, 0.06 * H, 0.06 * H, a * (0.3 + 0.25 * p));
        const ph = (t % 1.4) / 1.4;
        ctx.globalAlpha = a * 0.6 * (1 - ph); ctx.strokeStyle = U.rgba(c, 1); ctx.lineWidth = Math.max(1, 1.3 * S);
        ctx.beginPath(); ctx.arc(x + r0, yy, r0 * (1.4 + 3.4 * ph), 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = a * (down ? 0.6 + 0.4 * p : 0.6 + 0.25 * p); ctx.fillStyle = U.rgba(c, 1);
      ctx.beginPath(); ctx.arc(x + r0, yy, r0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      text(ctx, String(h.host).toUpperCase(), x + 0.022 * H, yy, { px: lp, spacing: 0.14, color: down ? C.alarm : C.cyanMid, glow: down ? 6 * S : 2, core: 0.92, mono: true }, "left", 1, a);
      const st = down ? (h.downSince ? `DOWN ${U.fmtMinutes((f.now - h.downSince) / 60000).toUpperCase()}` : "DOWN") : "NOMINAL";
      text(ctx, st, x + 0.26 * W, yy, { px: lp * 0.85, spacing: 0.2, color: down ? C.flare : C.cyanDim, glow: down ? 5 * S : 2, core: 0.92, mono: true }, "right", 1, a);
    }
    if (hb.length > n) text(ctx, `+${hb.length - n} MORE`, x + 0.022 * H, y + 0.05 * H + n * step, { px: lp * 0.8, spacing: 0.2, color: C.cyanDim, glow: 2, core: 0.9, mono: true }, "left", 1, a * 0.8);
  }

  // ------------------------------------------------------------------ news: the uplink
  // A comms line on the left of the console, between the weather sliver and NEXT EVENT: an UPLINK caption with
  // the source and its age (T+35 MIN), the headline beneath in the console's sans, one line (two for a long one),
  // cut at a word with the real font's width. Critical = the console's alarm: PRIORITY UPLINK, a blinking light
  // with a slow ripple, the lines in alarm red-orange on a slow pulse. Ambient: gone; a critical item whispers
  // once, faintly, under the readout plate.
  const newsAge = (pub, now) => {
    const m = Math.max(0, (now - pub) / 60000);
    if (m < 60) return `T+${Math.max(1, Math.round(m))} MIN`;
    const h = m / 60;
    return h < 48 ? `T+${Math.round(h)} H` : `T+${Math.round(h / 24)} D`;
  };
  function fitCtx(o) {
    if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); LS = "letterSpacing" in mctx; }
    const px = Math.round(o.px);
    mctx.font = `${o.weight || 400} ${px}px ${o.mono ? MONO : SANS}`;
    if (LS) mctx.letterSpacing = `${(o.spacing || 0) * px}px`;
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
  const NL = { key: "", lines: [], cap: "", whisper: "", oHead: null, oCap: null, oWh: null };
  function newsLayout(n, now) {
    const pub = n.published instanceof Date ? n.published : new Date(n.published);
    const age = isNaN(pub) ? "" : newsAge(pub, now), crit = !!n.critical;
    const key = `${n.headline}|${n.source || ""}|${age}|${crit ? 1 : 0}|${W}x${H}`;
    if (NL.key === key) return NL;
    NL.key = key;
    const head = String(n.headline).replace(/\s+/g, " ").trim();
    const lp = Math.max(12, 0.0175 * H);
    NL.oHead = { px: 0.03 * H, weight: 400, color: crit ? C.alarm : C.cyanMid, glow: (crit ? 6 : 3) * S, core: 0.92 };
    NL.oCap = { px: lp, spacing: 0.32, color: crit ? C.flare : C.cyanDim, glow: crit ? 4 * S : 2, core: 0.95, mono: true };
    NL.oWh = { px: Math.max(11, 0.0155 * H), spacing: 0.22, color: C.downLight, glow: 3 * S, core: 0.88, mono: true };
    const colW = 0.44 * W;
    NL.lines = wrap2(head, colW, fitCtx(NL.oHead));
    const cap = [crit ? "PRIORITY UPLINK" : "UPLINK", n.source ? String(n.source).toUpperCase() : "", age].filter(Boolean).join("  ·  ");
    NL.cap = U.ellipsize(cap, colW - (crit ? 0.022 * H : 0), fitCtx(NL.oCap));
    NL.whisper = crit ? U.ellipsize(`PRIORITY  ·  ${head.toUpperCase()}`, 0.34 * W, fitCtx(NL.oWh)) : "";
    if (LS) mctx.letterSpacing = "0px";
    return NL;
  }
  function drawNews(ctx, f, a, sink) {
    const n = f.signals.news;
    if (!n || !n.headline || a <= 0.004) return;
    const L = newsLayout(n, f.now), crit = !!n.critical, t = f.t;
    const x = 0.06 * W, y = 0.635 * H + sink;
    const pulse = crit ? 0.82 + 0.18 * Math.sin(t * TAU / 3.6) : 1;
    // the caption's hairline, as the other console blocks have
    ctx.globalAlpha = a * (crit ? 0.4 * pulse : 0.45); ctx.strokeStyle = U.rgba(U.safe(crit ? C.alarm : C.cyanFaint), 1); ctx.lineWidth = Math.max(1, S);
    ctx.beginPath(); ctx.moveTo(x, y - 0.022 * H); ctx.lineTo(x + 0.22 * W, y - 0.022 * H); ctx.stroke();
    ctx.globalAlpha = 1;
    let cx = x;
    if (crit) {
      // a priority light: blinking slowly, a ripple going out from it
      const r0 = 0.0055 * H, c = U.safe(C.alarm), ph = (t % 3.6) / 3.6;
      glow(ctx, C.alarm, x + r0, y, 0.05 * H, 0.05 * H, a * (0.2 + 0.18 * pulse));
      ctx.globalAlpha = a * 0.5 * (1 - ph); ctx.strokeStyle = U.rgba(c, 1); ctx.lineWidth = Math.max(1, 1.2 * S);
      ctx.beginPath(); ctx.arc(x + r0, y, r0 * (1.4 + 3.2 * ph), 0, TAU); ctx.stroke();
      ctx.globalAlpha = a * (0.5 + 0.45 * pulse); ctx.fillStyle = U.rgba(c, 1);
      ctx.beginPath(); ctx.arc(x + r0, y, r0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      cx = x + 0.022 * H;
    }
    text(ctx, L.cap, cx, y, L.oCap, "left", 1, a * (crit ? 0.95 * pulse : 0.95));
    for (let i = 0; i < L.lines.length; i++) text(ctx, L.lines[i], x, y + (0.046 + i * 0.038) * H, L.oHead, "left", 1, a * 0.95 * pulse);
  }
  // ambient: a critical item whispers once, faintly, under the readout plate
  function drawNewsWhisper(ctx, f, a) {
    const n = f.signals.news;
    if (!n || !n.headline || !n.critical || a <= 0.004 || !FR || !FR.plate) return;
    const L = newsLayout(n, f.now), pl = FR.plate;
    text(ctx, L.whisper, pl.x + 0.022 * H, pl.y + pl.h + 0.045 * H, L.oWh, "left", 1, a * 0.4 * (0.85 + 0.15 * Math.sin(f.t * TAU / 9)));
  }

  // ------------------------------------------------------------------ the shared info overlay, in the console's voice
  // Work: the console sans (its readouts) with caps labels, in cold cyan. Ambient: the station readout's blue-grey with a
  // sodium accent. (Mono reads as telemetry but truncates headlines too hard across a room.)
  const OVS = { k: -1, v: null };
  function overlayStyle(f) {
    const b = U.clamp(f.blend || 0), k = Math.round(b * 32) / 32;
    if (OVS.k === k && OVS.v) return OVS.v;
    const m = (w, a) => U.safe(U.mix(w, a, k));
    OVS.k = k;
    OVS.v = {
      font: SANS,
      ink: m(C.cyan, C.readout), dim: m(C.cyanDim, C.readoutDim), accent: m(C.nominal, U.scale(C.glare, 0.9)),
      alarm: m(C.alarm, C.downLight), glow: U.lerp(0.55, 0.35, k), rule: "hairline", caps: true,
    };
    return OVS.v;
  }

  // ------------------------------------------------------------------ build
  function build() {
    S = H / 1080;
    sprites.clear(); glows.clear(); moonC = null; moonKey = "";
    setHome();
    buildGeo(); buildLights(); buildTextures(); buildSystems();
    buildBuffers(); buildStars(); buildFrame();
    front = prev = -1; job = null; liveOn = false; bakedKey = ""; bakedWX = null;
    BD = mk(W * dpr, H * dpr); BD.ready = false; BD.key = ""; BD.at = -1e9; BD.wx = null;
    built = `${W}x${H}@${dpr}`;
  }

  let front = -1, prev = -1, fadeT0 = 0, job = null, jobBuf = -1, lastBake = -1e9, bakedKey = "", liveOn = false;
  // The work backdrop: the window's daytime view, baked into its own buffer now and then (when no other bake is
  // running) and laid faintly behind the console at 0.18 * day. jobBuf = BDJOB marks its bake.
  let BD = null;
  const BDJOB = -2;
  const freeBuf = () => { for (let i = 0; i < 3; i++) if (i !== front && i !== prev) return i; return 0; };
  const _V = { m: new Float64Array(9), cx: 0, cy: 0, R: 1 };

  // ------------------------------------------------------------------ theme
  AW.registerTheme({
    id: "orbit",
    name: "Orbit",
    init(ctx, env) { dpr = env.dpr || 1; W = env.width; H = env.height; build(); CAT = AW.cat ? AW.cat.create(31) : null; },
    resize(env) { dpr = env.dpr || 1; W = env.width; H = env.height; build(); },
    destroy() { sprites.clear(); glows.clear(); BUF = []; SCR = MASK = B2 = B4 = B8 = KH = KQ = BD = null; starsL = frameL = null; built = ""; job = null; NL.key = ""; OVS.k = -1; NPL.key = NPL.fkey = ""; SND.sh = null; SND.satK = -1; },
    overlayStyle,
    soundscape,

    render(ctx, f) {
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.width, f.height);
      if (f.width !== W || f.height !== H || (f.dpr || 1) !== dpr || !built) {
        dpr = f.dpr || 1; W = f.width; H = f.height; build();
      }
      if (setHome()) { bakedKey = ""; }
      const b = U.clamp(f.blend), t = f.t, now = f.now, Sg = f.signals || {};
      const e = f.ambientElapsed || 0;
      bodies(now);
      terminatorCue(now);
      wxUpdate(f);
      const sink = b * 0.03 * H;
      // the shared info overlay is up: the console and the readout step back so the panel reads (the view lives on)
      const ov = f.overlay ? 1 - 0.7 * U.clamp(+f.overlay.a || 0) : 1;
      const ambA = U.smoothstep(0.35, 0.95, b);
      const g = U.easeInOut(U.smoothstep(0.1, 0.9, b));
      const D = U.clamp(+f.day || 0);
      const bdA = 0.18 * D * fade(b, 0, 0.5);   // the work backdrop: the window's view at 0.18 * day, 0 at night

      // ---------------------------------------------------- space: stars, moon, satellite
      viewAt(_V, g, e);
      const m = _V.m;
      const sz = m[6] * SUN[0] + m[7] * SUN[1] + m[8] * SUN[2];
      const skyA = U.smoothstep(0.3, 0.95, b);
      if (skyA > 0.004) {
        const glare = U.smoothstep(-0.35, 0.55, sz);
        ctx.globalAlpha = skyA * (1 - 0.72 * glare);
        const px = Math.sin(e / 8200 + 0.4) * 0.006 * W;   // a little parallax with the drift
        ctx.drawImage(starsL.cv, px, 0, W, H);
        ctx.globalAlpha = 1;
        // the moon: placed by its direction relative to the view axis, held above the limb, lit toward the sun
        const mx = m[0] * MOON[0] + m[1] * MOON[1] + m[2] * MOON[2], my = m[3] * MOON[0] + m[4] * MOON[1] + m[5] * MOON[2];
        const mz = m[6] * MOON[0] + m[7] * MOON[1] + m[8] * MOON[2];
        const al = Math.atan2(mx, -mz);
        if (Math.abs(al) < 1.45 && moonIllum > 0.05) {
          const x = 0.5 * W + al / 1.45 * 0.4 * W;
          const dx = x - _V.cx, limbY = Math.abs(dx) < _V.R ? _V.cy - Math.sqrt(_V.R * _V.R - dx * dx) : H;
          const y = Math.min(limbY - 0.09 * H, (0.13 + 0.1 * (1 - U.clamp(my + 0.5))) * H);
          const sxv = m[0] * SUN[0] + m[1] * SUN[1] + m[2] * SUN[2], syv = m[3] * SUN[0] + m[4] * SUN[1] + m[5] * SUN[2];
          const ang = Math.atan2(-(syv - my), sxv - mx);
          const r = 0.026 * H, ms = moonSprite(r, moonIllum, ang);
          const ma = skyA * (1 - 0.35 * glare) * (0.6 + 0.4 * ss(-0.3, 0.2, al === 0 ? 0 : 0.2));
          glow(ctx, C.moon, x, y, r * 3.2, r * 3.2, ma * 0.05 * moonIllum);
          ctx.globalAlpha = ma; ctx.drawImage(ms.cv, x - ms.Sz / 2, y - ms.Sz / 2, ms.Sz, ms.Sz); ctx.globalAlpha = 1;
        }
        const sat = satellite(t);
        if (sat) {
          const dx = sat.x - _V.cx, limbY = Math.abs(dx) < _V.R ? _V.cy - Math.sqrt(_V.R * _V.R - dx * dx) : H;
          if (sat.y < limbY - 6 * S) {
            const c = U.safe(C.sat), a = skyA * sat.a;
            ctx.globalAlpha = a * 0.22; ctx.strokeStyle = U.rgba(c, 1); ctx.lineWidth = Math.max(0.8, S);
            ctx.beginPath(); ctx.moveTo(sat.x, sat.y); ctx.lineTo(sat.x - sat.dx * 0.018 * W, sat.y); ctx.stroke();
            ctx.globalAlpha = a * (0.55 + 0.4 * sat.gl); ctx.fillStyle = U.rgba(c, 1);
            ctx.fillRect(sat.x - 1.1 * S, sat.y - 1.1 * S, 2.2 * S, 2.2 * S);
            ctx.globalAlpha = 1;
            if (sat.gl > 0.02) glow(ctx, C.sat, sat.x, sat.y, 0.012 * H, 0.012 * H, a * 0.35 * sat.gl);
            // its sound: the hover's closest point (about 4 s in) lands as the satellite crosses mid-window; once
            // per pass, and not for a pass already half gone when the view opened
            const uc = 0.5 - 4 / sat.dur;
            if (sat.k !== SND.satK && sat.u >= uc && skyA > 0.3) {
              SND.satK = sat.k;
              if (sat.u < uc + 0.05) cue("hover", { pan: sat.dx, gain: 0.4, distance: 0.75 });
            }
          }
        }
      }

      // ---------------------------------------------------- the work backdrop (day only): the window's view, faint
      if (bdA > 0.002 && BD.ready) { ctx.globalAlpha = bdA * (BD.gain || 1); ctx.drawImage(BD.cv, 0, 0, W, H); ctx.globalAlpha = 1; }

      // ---------------------------------------------------- the globe: live while it swings, else baked
      const moving = g > 0.0005 && g < 0.9995;
      if (moving) {
        if (job && jobBuf === BDJOB) BD.ready = false;   // a half-painted backdrop is never shown
        job = null; prev = -1;
        if (front < 0) front = freeBuf();
        paintLive(BUF[front], makeSnap(g, e, now, D));
        liveOn = true;
      } else {
        const key = `${built}|${g > 0.5 ? 1 : 0}|${HOME.key}|${g > 0.5 ? Math.round(D * 20) : 0}`;
        const due = front < 0 || liveOn || key !== bakedKey || t - lastBake > 8 || (wxDelta() > 0.015 && t - lastBake > 0.5);
        if (!job && due && (prev < 0 || front < 0)) {
          jobBuf = freeBuf(); job = bakeJob(BUF[jobBuf], makeSnap(g, e, now, D));
          lastBake = t; bakedKey = key; liveOn = false; bakedWX = Object.assign({}, WX);
        }
        // the backdrop's own bake, only by day in work and only while the console's bake is idle
        if (!job && bdA > 0.002 && g < 0.5) {
          const bk = `${built}|${HOME.key}|${Math.round(D * 20)}`;
          if (!BD.ready || bk !== BD.key || t - BD.at > 30 || (wxDelta(BD.wx) > 0.015 && t - BD.at > 2)) {
            jobBuf = BDJOB; job = bakeJob(BD, makeSnap(1, 0, now, D));
            BD.ready = false; BD.key = bk; BD.at = t; BD.wx = Object.assign({}, WX);
          }
        }
        if (job) {
          let done = false;
          if (front < 0 && jobBuf !== BDJOB) { while (!job.next().done); done = true; } else done = job.next().done;
          if (done) {
            job = null;
            if (jobBuf === BDJOB) BD.ready = true;
            else { prev = front; front = jobBuf; fadeT0 = t; }
          }
        }
      }
      if (front >= 0) {
        const fk = prev >= 0 ? U.clamp((t - fadeT0) / FADE) : 1;
        if (prev >= 0 && fk < 1) { ctx.globalAlpha = BUF[prev].gain || 1; ctx.drawImage(BUF[prev].cv, 0, 0, W, H); }
        if (fk >= 1) prev = -1;
        ctx.globalAlpha = fk * (BUF[front].gain || 1); ctx.drawImage(BUF[front].cv, 0, 0, W, H); ctx.globalAlpha = 1;
      }
      const snap = front >= 0 ? BUF[front].snap : null;

      // ---------------------------------------------------- over the globe: sun glare, lightning, home
      if (snap && snap.sty > 0.01) {
        const V = snap.V, sty = snap.sty;
        // the sun just behind the limb: a dim warm flare where it will rise (or just set)
        const gA = Math.exp(-Math.pow((snap.sz + 0.04) / 0.13, 2)) * sty * ambA;
        if (gA > 0.01) {
          let q = Math.atan2(snap.sy, snap.sx);
          const qr = Math.acos(U.clamp((W * 0.97 - V.cx) / V.R, -1, 1)), ql = Math.acos(U.clamp((W * 0.03 - V.cx) / V.R, -1, 1));
          let q2 = q; if (q2 < -Math.PI / 2) q2 += TAU;
          const qc = U.clamp(q2, qr, ql), off = Math.abs(qc - q2);
          const k = gA * Math.exp(-off * off / 2);
          const gx = V.cx + V.R * Math.cos(qc), gy = V.cy - V.R * Math.sin(qc);
          if (k > 0.01) {
            ctx.globalCompositeOperation = "lighter";
            glow(ctx, C.glare, gx, gy, 0.22 * H, 0.16 * H, k * 0.18, true);
            ctx.save(); ctx.translate(gx, gy); ctx.rotate(-qc + Math.PI / 2);
            glow(ctx, C.glare, 0, 0, 0.3 * W, 0.006 * H, k * 0.35);
            ctx.restore();
            ctx.globalCompositeOperation = "source-over";
          }
        }
        // lightning inside the storm cells (night only; in daylight the tops are too bright to see it)
        const nightHome = ss(0.06, -0.08, dot(SUN, HOME.v));
        const L = snap.cells && snap.cells.length ? lightning(t, snap.cells.length) : null;
        if (L && nightHome > 0.01) {
          ctx.globalCompositeOperation = "lighter";
          // the stroke lights the cloud around it from inside: a soft spot cut to the cloud's own shape
          const flash = (it, v, px, py) => {
            if (!it.xf || v < 0.01) return;
            const a = v * nightHome * sty * snap.wx.storm;
            if (!FLC) FLC = mk(192, 192);
            const fc = FLC.c, R0 = 192 * (0.3 + 0.18 * v);
            fc.globalCompositeOperation = "source-over"; fc.globalAlpha = 1; fc.clearRect(0, 0, 192, 192);
            fc.drawImage(glowSprite(C.bolt, true), 96 + px * 192 - R0, 96 + py * 192 - R0, 2 * R0, 2 * R0);
            fc.globalCompositeOperation = "source-in"; fc.drawImage(it.tex.flash, 0, 0, 192, 192);
            blit(ctx, it.xf, FLC.cv, dpr, 0.9 * a);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const x = it.xf, r = Math.hypot(x[0], x[1]) * 0.42;
            glow(ctx, C.bolt, x[4] + x[0] * px + x[2] * py, x[5] + x[1] * px + x[3] * py, r, r * 0.8, 0.12 * a, true);
          };
          flash(snap.cells[L.i], L.v, L.px, L.py);
          flash(snap.cells[L.j], L.v2, L.qx, L.qy);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
        }
      }
      // home: a crosshair on the console, a tiny glint in the window
      if (snap && snap.home && snap.home.z > 0.02) {
        const hx = snap.home.x, hy = snap.home.y, wk = 1 - snap.sty;
        if (wk > 0.01) {
          const c = U.safe(C.cyan), r = 0.011 * H;
          ctx.globalAlpha = wk * 0.85 * fade(b, 0.2, 0.6) * ov; ctx.strokeStyle = U.rgba(c, 1); ctx.lineWidth = Math.max(1, 1.2 * S);
          ctx.beginPath();
          ctx.moveTo(hx - r * 1.8, hy); ctx.lineTo(hx - r * 0.6, hy); ctx.moveTo(hx + r * 0.6, hy); ctx.lineTo(hx + r * 1.8, hy);
          ctx.moveTo(hx, hy - r * 1.8); ctx.lineTo(hx, hy - r * 0.6); ctx.moveTo(hx, hy + r * 0.6); ctx.lineTo(hx, hy + r * 1.8);
          ctx.stroke();
          ctx.beginPath(); ctx.arc(hx, hy, r * 0.6, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (ambA > 0.01) {
          const p = 0.5 + 0.5 * Math.sin(t * TAU / 7);
          glow(ctx, C.home, hx, hy, 0.01 * H, 0.008 * H, ambA * (0.22 + 0.12 * p));
          ctx.globalAlpha = ambA * (0.55 + 0.2 * p); ctx.fillStyle = U.rgba(U.safe(C.home), 1);
          ctx.fillRect(hx - 0.9 * S, hy - 0.9 * S, 1.8 * S, 1.8 * S);
          const ph = (t % 9) / 9;
          ctx.globalAlpha = ambA * 0.2 * (1 - ph); ctx.strokeStyle = U.rgba(U.safe(C.home), 1); ctx.lineWidth = Math.max(0.8, 0.9 * S);
          ctx.beginPath(); ctx.ellipse(hx, hy, 0.004 * H + ph * 0.02 * H, (0.004 * H + ph * 0.02 * H) * Math.max(0.3, snap.home.z), 0, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // ---------------------------------------------------- the window frame closes in
      const frA = U.smoothstep(0.3, 0.95, b);
      if (frA > 0.004) { ctx.globalAlpha = frA; ctx.drawImage(frameL.cv, 0, 0, W, H); ctx.globalAlpha = 1; }
      // the station cat on its ledge on the rim, in front of the glass, behind the console and the readout
      if (CAT) drawCat(ctx, f, frA, D);

      // ---------------------------------------------------- work console, cascading out
      drawDaylight(ctx, f, fade(b, 0.02, 0.3) * ov, sink);
      drawSystems(ctx, f, fade(b, 0.04, 0.34) * ov, sink);
      drawFinance(ctx, f, fade(b, 0.0, 0.28) * ov, sink);
      drawCalendar(ctx, f, fade(b, 0.08, 0.4) * ov, sink);
      drawWeatherSliver(ctx, f, fade(b, 0.0, 0.26) * ov, sink);
      drawNews(ctx, f, fade(b, 0.03, 0.31) * ov, sink);
      drawNowPlaying(ctx, f, fade(b, 0.01, 0.3) * ov, sink);
      {
        const da = fade(b, 0.06, 0.36) * ov;
        if (da > 0.004) {
          const loc = AW.config.location || {};
          const ll = `${Math.abs(HOME.lat).toFixed(2)}°${HOME.lat >= 0 ? "N" : "S"} ${Math.abs(HOME.lon).toFixed(2)}°${HOME.lon >= 0 ? "E" : "W"}`;
          text(ctx, `STATION TIME  ·  ${String(loc.name || "HOME").toUpperCase()} ${ll}`, 0.06 * W, 0.135 * H + sink,
            { px: Math.max(12, 0.0175 * H), spacing: 0.3, color: C.cyanDim, glow: 2, core: 0.95, mono: true }, "left", 1, da * 0.95);
          text(ctx, `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}  ·  DAY ${doy(now)}`, 0.06 * W, 0.48 * H + sink,
            { px: Math.max(13, 0.026 * H), spacing: 0.18, color: C.cyanMid, glow: 3, core: 0.92, mono: true }, "left", 1, da * 0.95);
        }
      }

      // ---------------------------------------------------- the clock: hero -> the readout on the frame
      const hour24 = AW.config.clock ? AW.config.clock.hour24 !== false : true;
      const str = U.fmtTime(now, { hour24 });
      {
        const mv = U.easeInOut(U.smoothstep(0.12, 0.85, b));
        const pl = FR.plate;
        const x = U.lerp(0.06 * W, pl.x + 0.022 * H, mv), y = U.lerp(0.31 * H, pl.y + 0.098 * H, mv), px = U.lerp(0.24 * H, 0.1 * H, mv);
        const sw = U.smoothstep(0.3, 0.7, b);
        const oW = { px: 0.24 * H, weight: 200, color: C.cyan, glow: 14 * S, core: 0.92 };
        const oA = { px: 0.1 * H, weight: 200, color: C.readout, glow: 6 * S, core: 0.9 };   // same face: the digits shrink, they do not swap
        if (sw < 0.999) text(ctx, str, x, y, oW, "left", px / Math.round(oW.px), (1 - sw) * ov);
        if (sw > 0.001) text(ctx, str, x, y, oA, "left", px / Math.round(oA.px), sw * 0.9 * ov);
        // the readout's label, host lights and a calendar whisper
        const ra = U.smoothstep(0.7, 1, b) * ov;
        // under the plate, top down: the calendar whisper, a critical news whisper (both where they always were),
        // then the audio feed below whatever is there
        drawNewsWhisper(ctx, f, ra);
        if (ra > 0.004) {
          const next0 = Sg.calendar && Sg.calendar.next, cal = !!next0 && next0.minutesUntil < 30;
          const nw = Sg.news && Sg.news.headline && Sg.news.critical;
          drawFeed(ctx, f, ra, pl.x + 0.022 * H, pl.y + pl.h + (nw ? 0.08 : cal ? 0.05 : 0.03) * H, pl.w - 0.044 * H);
        }
        if (ra > 0.004) {
          const lp = Math.max(11, 0.0155 * H);
          text(ctx, "STATION TIME", pl.x + 0.022 * H, pl.y + 0.03 * H, { px: lp, spacing: 0.38, color: C.readoutDim, glow: 2, core: 0.9, mono: true }, "left", 1, ra * 0.85);
          const hb = Array.isArray(Sg.heartbeat) ? Sg.heartbeat : [];
          let lx = pl.x + 0.022 * H + 0.006 * H;
          const ly = pl.y + 0.163 * H;
          let downName = null;
          hb.forEach((h, i) => {
            const down = !h.up;
            if (down) {
              const blink = (t % 1.6) < 0.8 ? 1 : 0.25;
              glow(ctx, C.downLight, lx, ly, 0.022 * H, 0.022 * H, ra * 0.45 * blink);
              ctx.globalAlpha = ra * (0.35 + 0.6 * blink); ctx.fillStyle = U.rgba(U.safe(C.downLight), 1);
              if (!downName) downName = String(h.host).toLowerCase();
            } else {
              const p = 0.5 + 0.5 * Math.sin(t * TAU / 5 + i * 1.3);
              glow(ctx, C.okLight, lx, ly, 0.012 * H, 0.012 * H, ra * (0.1 + 0.08 * p));
              ctx.globalAlpha = ra * (0.32 + 0.22 * p); ctx.fillStyle = U.rgba(U.safe(C.okLight), 1);
            }
            ctx.beginPath(); ctx.arc(lx, ly, 0.0042 * H, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
            lx += 0.024 * H;
          });
          if (downName) text(ctx, downName, lx + 0.004 * H, ly, { px: lp * 1.1, spacing: 0.12, color: C.downLight, glow: 4 * S, core: 0.85, mono: true }, "left", 1, ra * (0.55 + 0.15 * Math.sin(t * 2)));
          const next = Sg.calendar && Sg.calendar.next;
          if (next && next.minutesUntil < 30) {
            text(ctx, `${tminus(next.minutesUntil)}  ·  ${String(next.title).toUpperCase()}`, pl.x + 0.022 * H, pl.y + 0.2 * H + 0.012 * H,
              { px: lp, spacing: 0.22, color: C.readoutDim, glow: 2, core: 0.9, mono: true }, "left", 1, ra * 0.7);
          }
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    },
  });

  // ------------------------------------------------------------------ geography data
  // GEO-BEGIN (generated from Natural Earth 50m; do not edit by hand)
  const GEO = {
    land: "ixvB8qhB8FgDiHxB ovuBonhBvFqC0Nd ime4tfG1BjFnBrLI0C0CoGFgFgB isnB49gByUnFjN/CV2B/KRwE8C7IwD ypvB2rhB/GxC/Ke2C2B wtsB6rhB4HrBzXD o/sBqshB8IvB/QpDzOc m/sB+ifvI5C9D8BmE+C 6+uBynfxErB5HwD0DmB 2+wBs7f/BsCgIzB oo1BykhBhK6BiRP 2p5BwjgB5D7B/HyB i6nB0wYuPrBvJtCxHiC s3nBgmZoH7F1KqF yzlBmvctErGvF+FiEwBmBzBwC0C 24jBmrZ+BRtCvCrE2B gH8xf0InCzPtBAuD 4iXqlbzCBjFcpDkBpBoBjEuBJMoCKoFX2CVwG1CYb inX0xawBIAFhBNOHXRGJaKmBA4BsBvBHFGgBUDMSQoBWOVcCsBJEJPRUJvD/B3BLnBExCHhBeJsBSuBiBaqCkDyBkBaGQBDPUddnCBbRT kiU8lV2F9BcvB9BHhCURXjBGPhBfYxCK1B6B7BYYgBmCO 2nW4lVkDLCblC1B1HELqCUc spF87coEvBvEP0BdhIzDkBsB5CeTrBpC0C2D+B2CjCduD ssFo/cmCjBlIRsDiC syJqtcpB3BzBoBnClBmB6DmCa miJ0ycqCDuGnFjCWXXiEzBH/C7G4DS0BhEoB4CaZYpCP ujJ42cqCNIxBpCeiBhC/BJjDwD u5I+4c6BhH5EuGnCvBoCoD o7Ig+c4CD0ClD9CyCsCpEpD5B/CiI 20Iw+cYxB0BawCTDnBpCJoCJKvB9DmBlCrBjEoDyByBkBX yhKs9bZhEN+CdR3B6BegC 8nJ6kciDhBnC9BkCGMmC8CWjCtFzEIgCGzCiBxBkDKe ytJg/bY3BjCHmDjBZX6C5BPb9F+DGsBxCc m2W+0aOCMQ+BJwBRiGOcNlDrBBhBMFJD1BBPGDOXAaKLQVEQU5BXYBLF1COfcIGlCGFiBxBIIaoC6BCdVZmBbINJL 6/U2yZNNMBkCcQFoBIjEtB9DjBtEPUOPCZNDMeekBQKFQQ8FOoCgB qg2BothBiEnFhWtBpNmCwLmEoPyB un2BwnhBDvC+F6BkJ1B7D9FzbsBlM6CgM4D go3B6hhB9CxC2I+BuJhEzlB7CsOmI qw+BusgB6EnBmEmDmY5DrIhD1KiEkFvExVBzD7BhN0D0BmD0J6C 09+BsggB+HlEvXoB w6/BypgBkZpB3PnCtNwCuCsC yswBgvgBhoB5FxdxMxOKrD0C8OyErBmEghB+GsUU+T+DiI7B 4+tB28f+GVhH7HyOxHtYQ9BwElJLjD+BqL4I oh/BumcmM9jBhKwDrDjJsGzInGkCjD7EzC2nB 8n/Boma2JqB8C7FlQ1InRwDmE1E9GjCmKyY 23+Bi1Z2EjMlKxalWZ7G3J/FgI7X9EwMyJ0SU8FiLyC9D2G+CoJsKiBmL 4s9B0oYjBpGzIjD5E2D 648BwkYmFvElIzLbqLhGyC 20VqpH+YxM/pBQ+JOrB0FoJ/E5I0H wlTojW0DAYViDK6BfsDJFLyDzC2DHyGxDcBPUQDoCtBtBFYZeW0BlBFNmHrBYXLRMLbFEToFLqC1BkCREXhG1BFWbXtFU3JZ8DuDZuBxFYpC6BRoCdkB9DAtF4BzByBBLrDCdoBRfxDUtBkBqCWCSbQzFE/D9CnDJZtB9CfAetCNwDqBF+BgC6B8E8BoHsB 0nnBiohB2InBwE0CU3BiIiBwR5C3JlDjRhB3S8BwFsBrPWvC4B8ID2BkC +tmB+lhBwFnDyEsB2StF/NnCpPnL7Q6FmSuCzRZxC0B4UkCrB6BvIlBxEyBJ9BpJhBtPwJ6SUhH5B4ItBuF2CuJ9ER2G mhlBgyZN1K1FvB1CsMqGmC oglBi+Z5B9I7DkG+EkE smmBshZ9CxJ1QiH6BoC u7Y0nfoEZepBvKjC3DcoDOfO1FOlBUawB+CBlDmB8CmB2GV gqKgvb4K/BiE9EmF9BwE3E5BbhJuCXWiCuCXnB5DL5BcmBU9BMCe5DECiByCQ5E2BpBLb0B5DBJgC0CJEkB1DP5BwB2CY qjV4tVqBEkBgB6DC4E1BuBGsBpCmDFrCLBR8FrB8BtBEZhChCvBoBjCGjDAtErBfYtCNxC9DlBaPwBlCsBjFP9DUpCpBzDmCOuBgBIgJtByCcGU7CwCWqCzE4BYa4CQ 6uZixR4HN3C5GvKvC5BwFegE yxiBogdrG7F8MY6BtBhF1FvEnBgEV/GduHN8F7C2CtFmHzDoBlD7EW6FrCrB1CiKfN9DpHhEkG5BtHzChUHnE/ClDe9IjC+IkHyGEuEqDrFlC3LmCuHgFXsCzDVyCiCwJiB9BoBqB+DzE0CuDuCtMlB6CsHrBsB1C1Be+BhEtFsD+I7CtB/CkBwCcBkF0DqBxBmBuCkD k4hB0qcyGgBkEvEvFlDgCzG5BnEhNnCxFtCrDD0BqBrDRoD2BzEN2CgC5CS8J+CjHVmGgEnHoBmDwC/C6CuJD0CwC9DIiD+C4DWC5BmCwCmCZ oBshf6b7H2CzGqFtC/CsFuFK0C7B0EWhDWyHZ+MtF7F3C1EmByB9BhKkByD9DrFnBqEzC7EdhB0BvCjB1K8ChEiEvOGX0FlHrBiCjEhE5C 8jgBuwe8FenD3B0CPZzB4CGPpBqFLE/CtG7DjZpG1JepByBvBN7CoBzJVJyBmDHyEkC1DN8CgCnDTnC0BtIJpBYsNmBWcxECmEyBzGanGhBzDY8DCtBwBgFFrDU+BGzBcmCADgBqG1BlD8B+CM/DOuBUoJxCI5B5BDqD5CiCqCmCNwBqDwEhCW+BqDUuE5Cf2C2EnBwCwBkEAwBgC g+U8nVDNzBQnBgB qvXklaxBFPIyBAcK m5U2uatCFWQgBIqBc s4UuvafDcUeE goX6uaHBPQiBC iiXg6acDLHjBCSoBqCoBeCPPTATL 6xW69aDPRLLAEW ipVu3aRBeUcI 4jW4pabJUkBKD 66VynaXBBNRIAOWUMD quuBmwhBnCxCrMiB g7tBwthByShC7SJ szuBgthBE1B9IyB qrlB69gBuFrC3JmE 04EqpVxB+HuG3E o+hBo/cvFtDKyC 0+hB85c+CxB3BnBhFuCwCuB 47dgkZ9Ba0BE 2keg/Y+CAzBXxCiB mmZmlfrBAX8B0BOyCN s2YwufzCSsCiB ktYu5ftDtB/DgB 21UwqZXdcsB q1U4vZJAKSYIBL uwWq8XZDmBW qsVk1Z3BJHGqBU 4nV61ZVDYkB 0vVu0ZPDhBIiBIEO osU0yYBDNWOH muUq/YJD4B2C 8sU4uYdDeMM6BDoBI/B 8mUgrYFBSauBkB 2lQg2WtBkECsC qyS4rXpBBYA0BU koTi0XHvBDiB s3RwuXAHXEgBW qnR8qXrBWaGaN 65R6sXFFB4B 0/TiqWTRQHMUMPBvCnBCP6BdkB y/T27VxBc6BH y5Tu/V4BBOPzCO qiUs0WhBYecCwC1B6B1CKyCA8CpCGnBZR y8U+2VZpBnDAAYgBS4BHkBgB m1Uq9VNFqCmCHmBUCClB +lU6xWoDlCHhDdiBWAK8BpBmBxBYfAOa oxUyhWZkBxBUSUlBwC0BnDqBd quU4pWCJnBBSa/B0CQB okT63WTALU k/T+sWBxB5BhBVoBVBjBeYHQMLUYiBF2BKCkBX 6vTg9WEP1BiE ghTq5VvCZrBeqBAVoBSe4BJ gkTu4WBLPqB u6Ty5WuDCEJjFlBxBmBmBViBQGc 0lSsxVHmBsBS soX8oUJTXegBsB 6oXitUtBDKanByB4BR 2nX6xTzFLyCoBEiChBYyEY +1Wi4TNvB/CS ojXg9UhBMOO gmX6xUTDPwCkBT 2lX+3UlBAK4B8BxB ikXy2UhBKC8BoBR 2mX4kUTaaO 0mJypcwBARpBvE8D y/I41cyBlB5CxDWsC5BsC qrJmxczBhBhC0BgC8B u5J6+blEqC0DT ihZypR0DyFF/C yqR2yR+C7EhC1BpCgBsC8B/CwD 4hNioXjC0BR0BuC1B m1M+hXjBGY2B 4nN6nXPvBtBQSmCaI 0oN+rWvBwBckD 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 usTm8bpCGzEkBnBSmBcmDGoBBqC5BMR 84Uk6erFE1BsBqCOyFRQpB o+Tm/dkBHiBnBxCX3D+B+BO wkT+7dIXdjB1F3CnCG/BPpB2BqD+CyCF0BO 6zTy4d4BrBJftCzCVD5CuBC6BwBuBeM w3O00gBjEIpFuD8ER owQ24gB2OZxClBpPCnBsB y7PsmhBfzBrH4BwCc yzRu1gBnHMlBuBkCSmEL s8QungBFnC/FF9MuCiEyC2GmBiGpB 02Ni+gBkChC5XCiPyC uhM8qgBzGIgLkD +yOo6frK2DkCmB8GOsFfG7B g0P2ggBoFrBqJgBwDTWX9DhBoCVnH1C+EOmDvC2DOO1BhCVmBhDhGnB3DGbmBYxC7CblDO7I8E7DiBlDB7FyC8CoC6FnC+EKQqB2BNxC6BuECrDenDP9DqBsDW8Cd3CkCiGC oySsqe0CoB0CvB2DR6BhBmH/BqC1CpBlBuDMgCJmBM0BfTFyCT9EjCpIyBRsBvDSHctBD3BPdxBzDrB/B3B3ElBVE1BwDzIVHQ0BuBoEwBX2C8BgG0B8B0BSqChBOZZV gsUw9e4DdXtEzDjB1FH9BGrBwBBkCiDsCsCS 8zT6+f6HE4GhBgH7D7NApGXjDOnCuC3DWNuC siQuwgBlBtEgDROxB9BStBRsB1BxCKQdrODcsBvDgBwJ6B9UlBzBSkE4BqHPpFwB0BoBzDImCiBgMpDvBoByDGtFS2COpFqBsGW4FfkBsB y+OoihBqF3CwFoByD3BgHNqGxE/FpB9GwCzJMXYzHVhFSdoBsIB5CSiEWjFIIqB1EjBrDiD 2mRythB6HrD4IPsCjCkEL/B+BoFJsC9EgGKiCdoCa6DhC/L9BjE5BzCgCM7C3EIPtCzH0CmD5C5EiB9BjB7KgBjDekGQ3IOxFsC8RsCvJQnOfvDwB8HqBjJN1F+CoNRuCclHJjGkBoFKrCmCwMf7J4BqDqByKKxFwB 23QmzgB0Gb7B/BqDiByKM6EjBvFHsNfZVvMGqNzCpCtByEX4BqB4Cd+COmBT4BcmIrBDa4M6BqEN6GQyPrCelBtFtBkGVrDRxCOO/BrKVlGU1DiCB9BzFP9DUNR9BQpCTpQBVkCtG3BlGMhCqBxBhBzCCrFgEsBuDzFkDzNR5EuBuCS5HiBkDKnCiB2FU 4rQq9gBgIbB9B7M1BlE4BwEM9GkB5B0CgGG 0yN06gBoFH5HtB2EVvD1BxKR1F6C 6yMg2gB7ErBsC1CxGjBtBxB3EaWwCvHpEjDqBhC9CjDF3CmCnCnBtHHjDmB6XsHiOGiCqB mgO8tgByDL7BnBgFS+BpBuBkCyGNjCjF5GnB5IEnCWhX/DlHG/D2BwQ8B0DwBrQlBwBmCtDC1CjCxDVtCa/Bb1L8BkCmBoNsBzMHyN0BtKM6CuB+IDvGUkFuBiFJqCvBgHBqKhEoMHemB5FuB4CkBvF6BoJ0C 2+QgigB+FlBiHIuElB7K1GhNCoEzBlD9ClHA3CuK6FH1CsBgBgB gkQ4lfoBG8FhCuD3CgDNpIpCtFQpF8BrCHnBalBNlCMDqBuDI6CgBRwBmDVfkCyCM o5Mm4f8FM6B8BsDIoJ3B9DlCsBLmJoC5CmCiEF8H1CwDlFsCRkD0B5F8HqBoB2Jd0GxCuGxHXnD6F1CkDXGeyIrCYb+CAkBhCZb3CkBhBdzDctC5BhFYsCnBN1BiG6BoC9BNfvGnB5NUSgB/GQnD4B7E3C3FN9GxB7WlBhDmCNoCzRsBpE+DqQ0BmMPqGQpNsC9XLnEwCyS8CvQT5BQiDmB5HUsFuF6V0E2D7B 04L2hgBqDSSjB0DsBuGBoNxEhXrF1CjClER3CrEhHNtIlC1F2DvL8B6MmLzF0DgUoBkM/B m2Q+rgBpCkBwCM 80Tm3bbAXM+BSMB q4TuxcPDWyBaMAjB 03TmycvBrCRGasBHO/BjCVCdN0B4BHInCzBVIiD0CMqBGRV1BeUYgCmBdYF kxT6xcVAGQgDkBVb koQs6f5BmBqBM0BX 6+PmggBrEL5CS4KqB gxU29enDwBWU+BH 4lU2+dvBE3CkBuBSgDjB y6VgrdbCAMuByBgBCgBXTV stVu5d1CKrBmBtBQuCFuCViBd y0T2mfXfjDAOXhFkBqCW8BL q9TmmfBThFZ2BgB +1T6gfjBS0EyCgCIUR7DrC 4jU0if/BKDqBkED 6lS2of8BAKV3EQ 25S4tekDPTR3BOjBFSSVG9BDDehCiBMI8Df 4nS85e5BUN0B0BqB4BZE5B imPytgBlCtBxED2BgBxEF/DsBwKoB qsPkxgBrCEsIa 86OkxgBmGdpITtB4B upPk4gB7EiBgIHmBR m0R2wgBlFwB6DS wsQuqgB7EbfUiEkB y9Mu4gBvHsBsEW o/MkygB/HK+FU o6OwngB5EWkF2B2CzB sqY00bXd5CLGZkBBEfNXvBdRjBxBnBFVxBzBDZTVGfgEkDMJHXuBQiBL0BEPR7ClBTPgBMWBDRnBZ2BOcR8BMIXMIAUKAGTdhCUIOYeOKHgD0BKnBaSoCEkCXKjBhCxBzBT+BEXT0BJPZ/Bb+CYSFcQsCOVtBlBH3BdIX7BNuBBrBrBSbUAiBSsB0BoCeKH3BrCDrBKJiBSiBsBODMnBzCtFTFdO1BPBmDxC9BRDNMgCwDbgCnBU7B7CNDSiBjBbpBD7C/CpBAzBHfMGSQKmCS8B6BgCYSShBHzCILfdF3BM1BF0BSCuBfLTGbZlDTxFO1BIvCCBK1BThCJjBBbMTwBEM0EgD2BWnFAAIiCmBNTOHYBuBwCSQqBDoBNVSYepBGDamBegBNOEbqBkDiFUUeAXSyBgBIQFOqBYeoBiEwBaBGJkBHEWeE 8pYwvbRAGMaE iwYuobvBRNQKEQHiBO grY62bLCEIaM +yYspbWP9BLCWQD qlYo3aPHFEKUFkBOFDX iyYg7aTFoBwB iwQqlfCrBtBAFqBtBhBWsB 6nX4wcCDrBIWQYH kjXm6cQFETfApBagBG 82TitgB7BTjCKqE2B ilV61gBjFMmDO 0sawzhBxPoD+FSoJpB +2fulhBxGV/CaoHqB w0f6pgB6DpCrJGGyB 8imCmtfkHuEAtD s1mBqldgEAhPpEuEd3FlOhIRrDxE/HCzCwFyCiCnO0TzC1E7DU1I/F/IPjHuDEuC2EB9CUqD6C5HtCOwCkG0BhDI+HiExLtFM6CgDGtDiCmDwBpDJVwCiLU0BlBwD0BfsBfxBnMNtC6EoLBjJOZsBgJyB3CAqBoB+KYxIBoFsCyGxB7C+B0C4CgHEgCtBuIyCLyB5HrDhDoBgM+H+IoC9ELiEkF6HoB1FNqDoEiL6BjGOoD8B+DrB9E8CyH0C8BlCV4CuIWvGU+K8F4DfmFiDJrCoEqDpB5DmDyDuIP5DwCoIcmEtCmIsG+GdxEzEmJgFQjD2J+DK9EgE6DkN7CtNxB2FxC0LH2CyBuGtB9DvB2GJ9BnCsDwB0NX+fnJsBvF7P3ElqB6GuRxHmCtJgP9D8D4BnJsE8BsCgS1DoEoB7DkF+O4F6LlDUgOtF0CgQlBgF9DlL3C+J5DqHkB6G4F6W6C4IiEqEB1HvEgKNoaiFmEjEwHgE3E4D0E0BwU/B+arHgE4D/N4DzByJmR4L+NLuHpB7F1H4KzS5MnL5PWkTrD8QwJmC6GsIYuEvH+KlBpIgBMmHlY8BwD0I5HsF8LsEnBmE8FzJyU/B1SgGwNA1EyBwGuB+clE9F/GuEmCqBrF6C+J7QiFxB4GunBgC7G5CyFhCzEmCmKmCjLoF0HoDmsB0EjFmBoUpBwNmCwF3ClEuEiRN5DuD8S0E6MjCzL5BmUhBrGzCsdqBmR/E5BlC7G2B8HtChF1CzwB/NmjB2FzGKuD4B6L9BwFoB+D/HwC+FubCkI5DuRTwMuFwc/DnExDsF5C1JgCyUrKmKsHwGjDgPmByLhD6B+C+KV7D8CmFwBxGckM0B1B8BgiB5CjL1B4OanK3D+M+DgOhBoDzBxGpBkWrF2mBWyH1CPxE4GhBJ1GoEoFsKiC0WpBwGuB+K7F6FIJgI+hBpBwZ3FAtYnJ9CnKgDrDFyEzBpGiBtJ3BuJsBQ9B6HkB8B9CsDMsI9J5C5CjN8CcrB7a5G1PrJ/G+DvMlB/FtDQ8D3I/DxHmBjLlM+H5BW3JjDfhB0C1DvCGrI3MvDHzG3JTpCzHtInFtHua0CsJqF4GiJuB2XsPoK6CkDyIuHoB9MMvBjGrES7NrGc6HlUpBtRxLuF/D9X9B6FkCrQuD1FlDtmBD3tB7a0J/BPjF+FgDzCxE+PuE6JhGY9GzIvX9czcvOjHxIwDra3VyL/QpB3L3QtFU2VjMmCsFwDvHoI9T/HmEgOpZvLuJtMkJqEgM1C7V9P6Q9SrLYwLrGxKnE6LpC!57K5a91BO1GoJhN7DhTuIvJ0OhNlB0RzgB0E+GtB3J4RhBkO0NuB3L8TvNxMxUlRrMxlCzbnKie5SkWjFkR/XmbmCsJ1EnL9KyNgsB/5CgY3ThFtFgPzG!nvG3xFFyNkN8d5J6e+E0BlFKjW0gBkI8EnEoCqC+V/IsFxN9D7DoI7KmG3jBvLvH2DjbnGvEwBtawRvH8PzKiIgCsC1CkB0CmBrFjBnFoEkCchCEEgFoIIpGXjBqE3FwEiGiGiDsL1CqL8BuFlEsFrBtBiBwGuGkMoGwF2CgJyF0D+DqH4IwCuI2GqDyEbmIwDmH0EoEiKwEkGsLgEWiEpEsKoBa3B6FH6T+I4PsCwJxBuH4C8ItBkLgDwE5DwEc/D7D+DpGzGtGyB/CqMtFkS9CqD/FmUjH2GmDW8IwJwEuuBlNyM6EwJpD4LoDsJwSoBkOlV5E1J8E1JjEvEwD9IHsEmCjGJFoG7F8BqFiB/F0JwDyCmOBoFqCrE8CkNVqN2FmKIiVjH+SkDCoI9diPsGuBoFuEvEuD+I+DlanHsBiCpBzE4J9BlB/BvPnE3IqG4GsE/KkB3B2BuGOjF2DWvD1GTpHlFNvF9DapClJ3GtGoJjJjJHjIxF2DuDxKoCrIvB0D3D5DkBsBnCnIqDsEpI3E7BiJxEA7CnDmC7Cd6C3C3EU2C5G3G0DlB5B5EmHsE4CqIdpMiBLoE3K6HkBuJ3QgK1Fa/IkLpE7CtB6FvI/Ba1HoHhEkGpIkKjCzBtCgQhIXvC5IgExCtEiE1E9GzGxCSwD2FnDyGtcgP9F4J7I+CxQtI9MoD9EvCB5H7P/GvGjIqD3EvE3CnBpE3FvB9C5DjOL7HpE1H6HrNxBiC2IzDwB8C0CpE3BgFmMBwJhD0FoJ2D2jBxCmDqBwCqMqDpDhEuEK4D7FwDLmCyCAhQ4DpCsB4C0B/CwBqJ8BsD7BmIW/CuG4DAY5B4JMtByB0HuCoCqFsP6C7EekFNvB8C0EqG4EiCuKCCqC0CKuF9BYiDoHhCjH0EDiHhDkBGqGwGSRkCnF5BmCoCuM+DhC/GiEjBrI9F4BrGkHRfpCuDNmK+C2J5E1EiDuDpBmX4FoI5C0K2HnD/D4DHf0KsE6FkFe8G1EyE4Be8G3EC3BoF0M4C8OtBiBqCmNkBrKwEjMLlW/E3CwDjHsBWoQ8XqLzEqF9NAlGrDWrF3E1DjV5IZ/K8KtF 4htB83ajU7HzE1H6Wha5IvHY5I4QzG6NqBTqNjHiJqBgEgLG9F0GzF5FxB4J1OqKiIYXmFkLFFsI",
    ice: "6pd48hB+Z7B9mB3BmrBkBiE3BsRnB9InCpqB1B0dJsF7BuSqCjLhI6VsFyNvBsIsC4LGyRlCphBxF2B/BrSCvExBoHlFrNnD3D9FuFoByIlBEdxHKsBhB0MlBUjC1Bf3LgBnNvBgHxCmKdiC7F9FapH5BzDUqDfuEWa1CwFkCuE/DzLtBjFaFiCnClDqMpB1BtC1KlBpLiDnDfnFyByEjC9HzBxHmByElBrGVuV2BiNhDxB/EjLsCvDsD1M/ByLkB9BtDuDOqQnEnDnCMZmEuBuB9FrFNLwCxBzC/DC1H6EpImCvHM6HdU7BjGtBvKIiC5BnGzBqPE7FjCkBZmCqBsJeoU/B7J5BadvDAzN1FnX/CnDKWZpCLtIsCiB5C9FhCvJ1HvDjBnEmBwB7B1E9BdkBbrBtCQpE3BxBYwE2DvFSyCZtCnCrCWgC7BpMdoD1B3DvBzCMzCNYhB+BKgD3C3DzB/EQuDjByCCOvCtBnB1BDjC5C5CChCcsDvB3BtBtGD+EdhBzCqB5B/CbwBTpCpF/BxBvFQuEpBShCnBZ/DU8BhBxBHpBCKSjCAmBmCtCxB5EkBCiBwCSqBoB7DrBlEkBRgB2B4CnGvC5FCFVlCKFS4Cc7DAHmBhDSZwBvBOUUlBoBuDmB5BGjDVOuB5EwBEyBmDgC3DrB3GkFPqCiIoBtBAKU7GpBhBWgDmCwCAeYgCAmCtBVyBvCO3C2CwBvCjDhBQgBXFjErDjC6F3BkB4FsCqDO9DLlFzBpBa3CASuC3BOyNmFrLnExDJmBkDsCkBiEKjIWlBeQ4BiIkC8LtBvDgBoBY/ENxDU3I5B2DkE2JfuC4BASlGnBrHQkC+B4CUkGjBiDOiCmB5CJiBuC8EIvBQrDH4EkFhMG5EwBlGYnD4BoCYyINgI9BoFH/DmBM0BlDgB2EBnCYlKMY4B+GsBrKT8BuBlDuD3BH+C1CvDtBMnBxERzFkB2BwDgDyBzEjBLYkCK7BUoEYkB8BhCerBRrCQsCgChFuB0BoBtCqCnGAiGwCtOkFKkC1Q+CjNmB/MrBlDW1DTnDOgBvBpJYnH+ByIyB3JSDyB3FhBrDyBuDYkKCoFkB+KTQ4BlDa5PrBtHuB2CcnHF1JsCqH2CuU0C+PaqK6FzQDfiCwP2DgFMqEhBIgC2JPqG+E6XvDvQiEudkCmGrEsDmEqNzCuIE3I8C0FSmhBpEwCqE1H4BmaA5dWFoB4ToB2Kf8FuB4NhC4CkD",
    lake: "09S66ZBrB4BNkBIcVUiBsDsBALcmBiCkBoCG+FVGAtCMuBgBYGuEQiCDcMXUFSkBJFLInBhCvBhDzB9DzBzF1BhDzBvCDnCRfOtCDiCQZKZHjDoB4B+B q3Tm/ZOMRA wgTu3ZBQFR 2qQyvbQVTCdUNjBGPTNlBELIJsBIsC+B0BTKjBfNBwBmCRgBJCtBPFbVLHeI4BViBbHNPFOUcvBCJtBFDbItBmCvBUHWjCuBRoB4CYvBI5BFvBc8BoEYGoBL+BBuCZCInCiBHW4BuCSFJLgBDzBTZhBeTMO2BQFNrBHehCgD5DNNEPoBpBqBrDgBlBBNaLJJILsB5BqBfTf qrUwoaHPnD5BINcIDPYAZZFEJDMVElB1BLxBhBhBFNJ9BGzBD9BShCGnDFhEftCKHKoB4BmD0BqIiBKGaDKLwBAJBIFQGDNgBAiBMCEhBBkBevBJDYdFFHFKxBLyBS2BGKLUKdREHKA8Be4BI 2lUsmaKMhBL woU+maCEnBDJTMBSS wkM0xeiCIpEtDmCNRX9DPpCcnEApClBgDrB3KrDxBU6FoCQ6B3GrBN1BzCZ9ImB8DaHqBoE0BjCwB4GFmBa7KiBTpBzIU/BpB1BsBygBuF8EXjGzBpCxByKN0GiC 49S46ZDCIGgBOUyBOKQAIhBmBJBTRJ5CC itTy6WdnB7B2BgCsBWZ +yS84TRrB7E4BrBsCGwC6D/B i4Pg/bVdPETYDJ9BHtBKpEgC6BGFO+BEVoBQWfEqBKJwBuBIyBLnCjBYHFXkBG8BeMDjBhBZBDN5BZwBbSvB6CS mpN4yZvC7BVwBTRdiB3B0D2BM8B3COwB+BLvBX ozS2warBDALVTATgBT5BJfPBxBfzBMsBThBLEQqC5BxBJEdLNhBZJEdLrBrB3BQvBThBqBzCW/BHpCd9BrB9BhBXnCbnBBdQ5BiDEsDV0BBuBoBgDA0BiBmBAsBmBuCPSjBDlBnBjBTLOQcYkBoBSIegDmDauBBZKRmBgBmBEANZVAHOHSakBQQWeGqBF8BQaSSA0CXqBZ 2uSwwaJEFHHZUC mrS4saMNCI 2lSquaDLSAAM +kS0tapBfblBKVOBsB2BDKSa q1So1aSClBRTIrBBjBIM0BHC5DRlDAlDvBRIjBBXMhCD3B+BbM3CMtBdDqBjBsB7BlBnBJnBVlCH5ClB/BN1BWFHhBFiB6BNKVBjBPRE3BXjCNdAXM8HmFyBU6EqBgDsBamBEc2CafvBoBIkB4BKiBUCQTxBpBCPYWqBIYkBVSHUmBGqFrBwCBaIWLeCefkBtCmBjB8BR4ECf9BOTmCrBlB/BgBPaEUFCLhBHCVKIKDZjBOL uuRm3aKIlBT 0+R4jbAXwBKKOdE q5Rk+a6BUcaVBvDpBJFANuBG qgS66aKEbK3CLvBdLTmBJCOJbOFkBmByBcJI +gSmjbMGNMJBCN +tS88afOjBLSF 81Sq1aiBGQJAd+DX2CLoECeL2CFAHeMQJTFINeEqBDOKCNMB4BC+BnCOBGIMrBiBLAMYFCNNPWNPH0BhBMXOMEVdARIBKjBJWfPfrCSZMPSXFXPCgBLGhBHYWISfJBKXMJaEQxCCyBvBSFQlBAdXjBfTdtBAjENbvCvBvBNvBmFLSfWVCtCbGHXdnBVjBIRQMsB2BUUqBKBaYGyCdoBEOeBXsBPO1DiBhBanBI/BWIiBSSWL8DBbWBOnBIKQ i8S+xaZPeFMO +6SkyaPQNCFNfDBFMFuBDUK i5S+yaCUdKZBYjBOBGK +2Sg0aBHMF m3Sk0aBmBPCJJ q1S6waZBYNOI w+S+wagEd0BX8BcrBZUFaKgBoBTCBSTdHeTSVFRPlBWnBHJHMJBHZKTARaXHtBADJ qmTivaZJKB +vTwqaAMNA oiPi/cbLIT/BXKrBXZFgB9CPiBcbGaSY0CiBFoBYuBDeX q6NikdnFjBhCjBEZpCFRTLYhBZpB6B0BFkKoF4DTLVgEQ4NnBxKOZXpCL s9UmybvDnCOU0BoBHO7CjChBrBDtClBRNPbEuCmBNUM6BRjBNEZP4BiDLCEQkFyCQCJRyBI3BbAJ0BQYA m5QinbATNLCKhBeGMvCFXJBJcCkBXWIWRiBDZLVAvCvBVCjBSjBLRBHIKqB4BMIYNKoCuBREpCfHgBcEQLSGFKKGuBGCSTcOIgBxBUDIFARLHOJaB k1Q+lbRAMTOAOJMAQcNG 6+R4qbVJGnBNvBXBVNZgBPXdGMaYEDIZDPRbHLOWCDiBPHPOEIOFKEMyBYeaOmCZZcQBiBdLbUK y7RkrbPEDRTPgBNJY y8R6obAKTHAJSC opPu8ckBCATxDtC2BflBPOhBlCjBftBzCbRTfIZZD0BUEQ6Ba5ByC2BBsBfKKWvBewBoBAagDwBgBkBQdeUArB yrU2gaJJfAbO +8R+laAZTZFALsBUgBUB wmV4yeqBwCuBEsD1BiGhBfb2CFpCpBtCMvCNvBS5DhCRImBkC +nP09dsCwBuBNIUcL2CYOPZd1BFLlBsBbdnBzBRR0Bd1BLY3CcZwB y1QwjesCHLVlJK5CaHWsGF u6UumaFTG5BPgCCWSSRoCSsCMVmBiBBNPJDpCJJGT 2iVqhbXGbcEWaGgBHsBVHZ sjUg9ZZpBIc wkU07ZR8CSnB 4mUk8ZdUTkBIgBM1B 8sOk7ceJFvBvCPzBG5BXEwBeD 6vR2vXHNTAQe y2U2wczBREIVItCONKDagBOkBDiBLMT0BL muT4za8BDEMQGwCCgBJKNZNnBIrBJDO3BB ymUwxcemBGoBYZFHkCpBBDnBD upU+hcBOiBGQSwDIWPsCOOCCHtDdAFkDFkCGxBNzBFRAAM3DAAT7BNhBCDIqBaHI spUsicCN1BHdNhCLvDERIGQtBI2BYoDKaMIObSqBHeEIGRQmBG0BNdJHV5CvBKD gmUs/bJRdPIVTCHaMUBYiBaMJUMMNhBNCHOB w1Rg9bwBagBHiBERX o0N0nanCWuBY w7Mi+aGgBOrClBa kqNwgdPxBtD+BWgB8BIPPuCJ k6W6kcDLUNHFLBnCKGPhBBZL5BILW9BONIRBHd/BN5BZWRMhBgBHJHlDOJKmBEOILYIgBhBONWxBQ5D0CSbLPSlBLCvBoCAUWGRsCOOmBXBNPDAPQXeVCTyBpBOCQPuClBKGgBJSEPMKC2BFIGlBcdsBbEQmBQBPP0BzBBLSRoBBiBK6BBTSfAWmCFYUPDbyDzCiBDqBM iqRixbQU6BLsCoBiBRlDhBrCFJC mzUshbfTjBoBPEBrBXDLJYgCbPBXvBGagBUAYWSDkCWOAIHFdcDIT2BXbDrBY 07U8qc0BQqEUZdlCXjCLfElCNHGmBMTM +tYswSEjB7CNoB+C kiUi+ZRXQoB qoU+9ZfYAK utNm5ZLfC4B +3Qu5aJRRFZOLPHWCI+BOBT 2wRqkbJVTHlBKLWMGQNODYC +rU03aLjB3BIQWYGSU +uWinaJRfADEOSQJ 6nWmxaPCWOKUWINd gvVwnbPeXKNJARXGJXJMhBFPUbZasBWV4BgBUBGQNcMFQfUCwBfYpBPARkB ygYsmbOQGPHFfL9DjDTFdEgEmCUSCQ owRyicOUYFiBKePwBHhCR 4+Q2xbPHPIfiBWMoBBUX g4Qqic3BDfExBUAUkBMYAGDRNUHsDEIP qsV49bWFPTKzBRODYTLXKLYXRHEMUiBEAIPCCKaL w4OorcvBBjBf9BNVIDWEegBQiDAmBJ u8QyzaBTZBZYIKeKMD unVmjaOHBJJBfUIS u0TunaJPPkBaUQmBqBxBHN g6Qmpc2BJzBHPNzCPRRzBRESuBiBGaqBI ogRmhbdO4BJSOxBOZAHHrBKLQIOxBQkBEFKcGYbLXcMALiCGPPsBDMNBJeLCLfM ktO+7aJHESnBwBVZxBFJR5CK7BL7BtBHiBxBIwBAYNagB8EGiCcCUgBOUH ymP67a3BBaUHU3BMCiBdS7BKvCVXQhBPBKkBQaPiCUoBAgCXOtBYBBagBIFNa5B4BLoEQMFzBTnDJ uzQ2+amBLBL/BDbEDGQSUI kzQo/aiCQaDAHlBNzBA urV6melCUrBdjCFjCYdkBuBAJNYDwBStBkDyGtC8B1ChCG ouP8qXlCAHYwBVYU gnUk5aYDGHLDdKViBCTFEd8B8BmBnBdWGDLsBLVxB 4gQotb3BdfBXIRiCvCsDEIcVJeZQZ2BpBUfRDgBgBOiBbKcyBrCJ4BQGMFORCtBkBXddDfiCViBT2BxB i2Pi1bTDhBaIYPoBJ9BPgBLoCkBgCNmBtBUJJMFAfbeFkBdKNDKRLVbFBMfOTsBaKMJiBAsBOmFzBA3CftBUvBHvBaQGlB s6V4zbIZzC3BT1BH4BvCgCKoBXgBaDMkBKpBeSKHWCiBOOYApBcFYKRd 04V2zbDSiBVBgBpBUtBFzBlBSZePkBH4BU w+N2zcZDhBsBUUkCjBChBkCPXVKtBhDhDZmC1BGZcOKsBH2BtBQGyBoC1Ba 2+P65cSPqBDzB3B9BJ5BrBdErBXhCFDNXScKsBqBiBFeYAdcECWgBMGcgBIJ+BSL0BU 8vTyjbOUsBCKJCbaBYQiBReDGrBPDBkBtDAlBe ktO+7aJHESnBwBVZxBFJR5CK7BL7BtBHiBxBIwBAYNagB8EGiCcCUgBOUH myP8raPFVnBfHIdWFQdnBKV0BZGjCFsCUGKsBNUMCaYgBDcLKnBA2BI7B2BmBDMO1ByCKqChBsBmBRMtBF5BqBxBL5BaZ uiO4iepDRvCY7EDqGYgBwBKbiBKRf siOije8DIuBrBjBZtBC q5P+hagCrB0BVCHVAtBUFOtCwBdoBUiBCeMRVnBiBrB qjOyrcxB8BKMkBDOqCOjB yzVwkcQFJFREzCRFGgBMBG1BOfB2BgBpBKkBIWTWBDXsBLOG 43V4icHrBZCJVfJDCaiBYOHMUMvBctBESQSFMG iuV4mclBPTQUFqBOwBCMaJMNAKMQHMjBOJjBH 0+R23Ye/CNvBLAMeBaJQJJFGI0BnB+COJ +hT2mYsBzBDFnCD6BSpBiBRFGOHQeP wmTiqXAce5BND 69ViwaWJYIGNjBBtBcOE khSisY4BIqChBWVLAnCoBlBElBD 4lUyzbaBnBN3BIqBS 0pRgybGJdEVMqBC 05T4xbOJzBODK y5Tg8aZFJSEGkBBID iiU+7aGHWCMJcDHJdILDENTHLsBGI olP0ncOciBBJxBhBC 2vOulcU0BcFlBvC 2pVghcOVXEdcWG u6S8gbhBPdCqBWeAcSHP 60V2zcOvB4BrBtC4BBUNOce",
    river: "qqR0xbwBLmBCuCWOF woRoybkBR snRqzbVa ymRg2bE1B umR62bHU 4wWy+bAyB u3Q66aaKWF q2Qk7aZD g4PulaGTVrBaf2C/BgCZ gsNo0ajB8B kvPu2aqBnBH9BqBrCGdLbapBD1BXnBLJnBDc3BiBN orPu7aFIjCDtCOlBoBvBEDsBzBU9BAtBTrBObP +rO0+alBnB3BVjDDlDlBJQzBE opQkxbAiCT8BnE8DzB8BVwBf2EImBdkBGUmBIOK khQsocWZ 6gQ+pcsE6B ypQ8wciDmBsBI ywQ0yciEK m2Tm3azB8BZmCMU 8gU47aDGZBOS 4hU67aULMEYJWC g5Tw8aRD ugU88aHS 8kU8zbSPkBE gvUi0bWBmBNQI 0pR2xbWB 8vR6xbmFmBuCeUQmBFsBSoCPwBAwBLwChBaCyBWqCM0BcSiBUGyBVsCBsBLiDlC2BRkBDmH2Cac6BmB0BIsCiBoBGsBQ snRszbkBjB 2mRq0bAF umR62bEZ kkRq3beDkBI s+T+3ZbJnBCZSDaNK7BQPBddFPhCVVbFbxBLVPBVcVMfWPlB1BZXfN kxWi9bLwB 4wWkgcUWaI0DDiDrBmCPoELiBlBcJyBDcEOSaB+CqB0BOgBDsBG i2UkmaCPXf6BnBMdDpBOFWGKNAtBV5BH/BhBpCF5E s2R0nXYiBwBK k3R4oXFE +2R8oXWgB +2R8oXnEmDHYQU/BGpBStCCzBiBtBkDlBKDeVMMcDiBSOgB0C2CmDpBmCMMJYIaJUIkBJOEeNwBgBeBgBeMAceiBYKUgCsBiBMeYMO8BckBBSKOWMEQOGDMQmBHKSKFKOWBYQLOUoBIOkBDkBXSDNLGbiBGsBLqB7BwBlCmBnBkBKqBmBuCRKzBKTHPQPmBjBqB7CoCXmCAaMeKEAc6BqBe2BXmBEgB6DmB0BgCGiB3CuCTiBrCkBR+BIuBXWHoCHcLK7CoBrBqBjBMnBanBMjBWbGfeLFtB6BhEwBNMNgBhBmBDkCiCmCqCKoBckB6BnBmBPGpBACKlBKVS izQo5ae6BSGeH q2Qk7akBJ g9P0/Z0CpBkBH0BM8CB4CfwBjBWBerCqB9BG1BYRBRMJM/DiB/BoBfUlBwBbcEKFGXTJPRER4B/BgBNYAiBQ8BJoDSCGQFkBYaAuBhBHJCV0BJeRqBtBiBNkDYmBAwCXgBB2BUoBeQGmBH yxPooaKN0CZIToBFASKCYdeN 8qNk2alBaN+BkCwBiCU2CkCqE0B4B3BgGIcX4DP orPu7aIhBsCVoBnD +rO0+asKa4FfMI miQwkcgBwBDiBnBQ khQsocVaMY mlQ4rckBCwBe4BkE guQqycyCK 00Q+yc4CG4GiD8CE 82TghaBhB ywSqkZXKTBJnBRJfjBPBhB3BLFlBMdcBHRDbxB1BW1BhB/BaLDNIJZNOjBCJXPCVTEhBPN7BTIvBDFvCUjBBPPDV ixTqvZfOVcPG7BRIvB1BrEtC1BNFVGrBXbjBEbXLTYNJZlBEZpBpBVDXIrBkBHQXAnBNfBjBOdJbQ3BOXOLUbYtBAJILARRAVOLBJtCZ skUqxaQB2BjCcHyCDUL2BG6EmB4BB0BT uhUsyaUVYHyBD w/Tmza+BZ w/TmzaAA w/TmzaAA m2Tm3agBrBuBrBgCP8EX u7ToqZeKgCRYxB0BZAVkBL2Bf 8kUw7aTCBH 4hU67abB u4Ts8azBXfK1BB sgUu8aCO mgUu9afTTATMNBJNPDpBOTcZIZJDpB sxU6zbiCQgCVoBCYZBfIFkBC gvUi0bHQvBE1GlB +4Ts0b2BT8BH6CB8ESWD 8tVkzaUmBeYeGakB+CsCqBGqEuBYC6C3BQRCvCURU7CsCNUJkCOgBP4BNWNQlBhBlBIH 8hTs/ZN3BLXTL iyU4radA/BT5DvC qzS4uZWCXOFapD0BhBIlBBnBLjDJvBRhCxBhBD3BjBJPO/BFvBHTfjBHXYzBAhBdxBLDZhBVJEVJFFhBLLMR",
  };
  // GEO-END
})();
