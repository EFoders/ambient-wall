// Shared helpers for themes. No dependencies. Everything hangs off AW.util.
window.AW = window.AW || {};

(function () {
  const U = {};

  // ---------- math ----------
  U.clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  U.smoothstep = (a, b, v) => {
    const t = U.clamp(U.invLerp(a, b, v));
    return t * t * (3 - 2 * t);
  };
  U.easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  U.easeOut = (t) => 1 - Math.pow(1 - t, 3);
  U.easeIn = (t) => t * t * t;
  U.TAU = Math.PI * 2;

  // ---------- seeded RNG (mulberry32) ----------
  U.rng = (seed = 1) => {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---------- value noise ----------
  // U.noise1(x), U.noise2(x, y) return roughly -1..1, smooth.
  const perm = new Uint8Array(512);
  (function () {
    const r = U.rng(1337);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  })();
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad1 = (h, x) => ((h & 1) ? -x : x) * (1 + (h & 7) / 8);
  U.noise1 = (x) => {
    const i = Math.floor(x) & 255, f = x - Math.floor(x);
    return U.lerp(grad1(perm[i], f), grad1(perm[i + 1], f - 1), fade(f)) * 0.9;
  };
  const grad2 = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  };
  U.noise2 = (x, y) => {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[xi] + yi], ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi], bb = perm[perm[xi + 1] + yi + 1];
    return U.lerp(
      U.lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u),
      U.lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u),
      v
    ) * 0.7;
  };
  U.fbm2 = (x, y, oct = 4) => {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += a * U.noise2(x * f, y * f); f *= 2; a *= 0.5; }
    return s;
  };

  // ---------- color ----------
  // Colors are {r,g,b} 0-255. U.rgba(c, a) -> css string.
  U.hex = (h) => {
    h = h.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  U.mix = (c1, c2, t) => ({ r: U.lerp(c1.r, c2.r, t), g: U.lerp(c1.g, c2.g, t), b: U.lerp(c1.b, c2.b, t) });
  U.scale = (c, k) => ({ r: c.r * k, g: c.g * k, b: c.b * k });
  U.rgba = (c, a = 1) => `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${U.clamp(a)})`;

  // Brightness guard: the wall must never go white or bright.
  // Clamps the max channel to `cap` (default 215) and keeps saturation so nothing reads as white.
  U.SAFE_CAP = 215;
  U.safe = (c, cap = U.SAFE_CAP) => {
    const m = Math.max(c.r, c.g, c.b);
    const k = m > cap ? cap / m : 1;
    const out = U.scale(c, k);
    // keep at least some chroma: pull the min channel down if everything is close (near-white/grey highs)
    const mn = Math.min(out.r, out.g, out.b), mx = Math.max(out.r, out.g, out.b);
    if (mx > 140 && mx - mn < 60) {
      const pull = 60 - (mx - mn);
      if (out.r === mn) out.r -= pull; else if (out.g === mn) out.g -= pull; else out.b -= pull;
    }
    return out;
  };

  // ---------- text ----------
  // Draw glowing text: a few blurred passes plus a crisp core.
  U.glowText = (ctx, text, x, y, opts = {}) => {
    const { font = "48px monospace", color = U.hex("#2ad4e0"), alpha = 1, glow = 18,
            align = "center", baseline = "middle", core = 0.92 } = opts;
    ctx.save();
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = baseline;
    const c = U.safe(color);
    ctx.shadowColor = U.rgba(c, 0.85 * alpha);
    for (const [blur, a] of [[glow * 2, 0.35], [glow, 0.5]]) {
      ctx.shadowBlur = blur; ctx.fillStyle = U.rgba(c, a * alpha); ctx.fillText(text, x, y);
    }
    ctx.shadowBlur = glow * 0.3; ctx.fillStyle = U.rgba(c, core * alpha); ctx.fillText(text, x, y);
    ctx.restore();
  };

  // ---------- formatting ----------
  const pad = (n) => String(n).padStart(2, "0");
  U.fmtTime = (d, { hour24 = true, seconds = false } = {}) => {
    let h = d.getHours(); const m = pad(d.getMinutes()), s = pad(d.getSeconds());
    if (!hour24) { h = h % 12 || 12; }
    return (hour24 ? pad(h) : String(h)) + ":" + m + (seconds ? ":" + s : "");
  };
  U.fmtDate = (d) => d.toLocaleDateString("en-CA", { weekday: "short", day: "numeric", month: "short" });
  U.fmtMoney = (v, { sign = false } = {}) => {
    const s = Math.abs(Math.round(v)).toLocaleString("en-CA");
    return (v < 0 ? "-" : sign ? "+" : "") + "$" + s;
  };
  U.fmtMinutes = (min) => {
    if (min == null) return "";
    if (min < 1) return "now";
    if (min < 60) return `${Math.round(min)} min`;
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  };
  // Trim text to fit maxWidth px in ctx's current font, cutting at a word boundary and adding an ellipsis.
  // Without ctx, falls back to maxWidth as a character count.
  U.ellipsize = (text, maxWidth, ctx) => {
    if (!text) return "";
    const fits = (s) => (ctx ? ctx.measureText(s).width : s.length) <= maxWidth;
    if (fits(text)) return text;
    const words = text.split(/\s+/);
    let out = "";
    for (const w of words) {
      const next = out ? out + " " + w : w;
      if (!fits(next + "…")) break;
      out = next;
    }
    if (!out) { out = text; while (out.length > 1 && !fits(out + "…")) out = out.slice(0, -1); }
    return out.replace(/[\s,;:.-]+$/, "") + "…";
  };
  U.fmtAgo = (d, now) => {
    const min = (now - d) / 60000;
    if (min < 60) return `${Math.max(1, Math.round(min))} min ago`;
    const h = min / 60; if (h < 48) return `${Math.round(h)} h ago`;
    return `${Math.round(h / 24)} d ago`;
  };

  AW.util = U;
})();
