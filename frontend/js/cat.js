// Ambient Wall - the cat. One shared, animated cat that every theme places in its own scene.
// K toggles it (Shift+K changes the coat), ?cat=1|0|<coat>, config [display] cat / cat_coat, the set_cat command.
// Core puts frame.cat = { a: 0..1 fade, coat } on the frame while the cat is on (null while off); a theme keeps one
// cat (AW.cat.create(seed)) and calls cat.draw(ctx, frame, opts) every frame, where the cat belongs in its scene.
// The cat blinks (now and then a slow blink), flicks an ear, tilts its head, swishes its tail and breathes; it
// sits, loafs, or curls up asleep as the night wears on (AW.cat.autoPose). THEMES.md "The cat".
window.AW = window.AW || {};

(function () {
  const U = AW.util;
  const C = (r, g, b) => ({ r, g, b });

  // Coat colours are the cat in full light (light = 1). Kept under ~190 so a lit white cat is still not "white".
  const COATS = {
    tabby:   { name: "tabby",   base: C(116, 88, 60),   stripe: C(56, 40, 26),  belly: C(150, 126, 96), eye: C(150, 158, 62), nose: C(146, 92, 82), marks: "stripes" },
    ginger:  { name: "ginger",  base: C(172, 102, 46),  stripe: C(122, 62, 26), belly: C(192, 146, 96), eye: C(178, 152, 52), nose: C(172, 104, 92), marks: "stripes" },
    black:   { name: "black",   base: C(30, 28, 33),    eye: C(164, 170, 52), nose: C(40, 32, 34) },
    grey:    { name: "grey",    base: C(100, 102, 110), stripe: C(82, 84, 92),  belly: C(118, 120, 126), eye: C(184, 152, 52), nose: C(124, 96, 100), marks: "faint" },
    tuxedo:  { name: "tuxedo",  base: C(30, 28, 33),    white: C(176, 170, 158), eye: C(132, 172, 72), nose: C(152, 102, 102), marks: "tux" },
    calico:  { name: "calico",  base: C(178, 168, 150), patchA: C(170, 100, 44), patchB: C(36, 32, 34), eye: C(172, 152, 52), nose: C(172, 112, 102), marks: "calico" },
    siamese: { name: "siamese", base: C(184, 168, 138), point: C(68, 52, 42),   eye: C(92, 142, 196), nose: C(74, 54, 50), marks: "points" },
    white:   { name: "white",   base: C(184, 180, 170), eye: C(104, 152, 200), nose: C(178, 122, 118) },
  };
  const COAT_IDS = Object.keys(COATS);

  // ------------------------------------------------------------------ poses
  // Unit space: 1 = the sitting cat's height. Origin = the ground point under the cat's middle; y up is negative;
  // the cat faces +x (draw() mirrors it for facing -1). Each pose: body silhouette, head (null = seen from behind),
  // tail path + width, the tux bib / paws, and how open the eyes are.
  function ear(c, side, hx, hy, r, rot) {
    // side -1 = the left ear. rot flicks it outward about its base.
    const ox = hx + side * 0.98 * r, oy = hy - 0.30 * r;   // outer base
    const ix = hx + side * 0.18 * r, iy = hy - 0.90 * r;   // inner base
    const tx = hx + side * 0.86 * r, ty = hy - 1.52 * r;   // tip
    const mx = (ox + ix) / 2, my = (oy + iy) / 2;
    const a = side * rot, ca = Math.cos(a), sa = Math.sin(a);
    const R = (x, y) => [mx + (x - mx) * ca - (y - my) * sa, my + (x - mx) * sa + (y - my) * ca];
    const [x1, y1] = R(ox, oy), [x2, y2] = R(tx, ty), [x3, y3] = R(ix, iy);
    const [q1x, q1y] = R(ox + side * 0.06 * r, (oy + ty) / 2), [q2x, q2y] = R((tx + ix) / 2 + side * 0.04 * r, (ty + iy) / 2 + 0.06 * r);
    c.moveTo(x1, y1); c.quadraticCurveTo(q1x, q1y, x2, y2); c.quadraticCurveTo(q2x, q2y, x3, y3); c.closePath();
  }
  function face(c, r) {
    // a round face with a little cheek fluff at the bottom, centred on 0,0
    c.moveTo(-1.1 * r, 0.02 * r);
    c.bezierCurveTo(-1.16 * r, -0.74 * r, -0.62 * r, -1.0 * r, 0, -1.0 * r);
    c.bezierCurveTo(0.62 * r, -1.0 * r, 1.16 * r, -0.74 * r, 1.1 * r, 0.02 * r);
    c.bezierCurveTo(1.12 * r, 0.42 * r, 0.9 * r, 0.62 * r, 0.62 * r, 0.76 * r);
    c.bezierCurveTo(0.36 * r, 0.9 * r, -0.36 * r, 0.9 * r, -0.62 * r, 0.76 * r);
    c.bezierCurveTo(-0.9 * r, 0.62 * r, -1.12 * r, 0.42 * r, -1.1 * r, 0.02 * r);
    c.closePath();
  }

  const POSES = {
    sit: {
      head: { x: 0.10, y: -0.80, r: 0.165 }, eyes: 1, tailW: 0.075, bob: 0.010,
      body(c) {
        c.moveTo(-0.28, 0);
        c.bezierCurveTo(-0.43, 0, -0.44, -0.28, -0.31, -0.41);
        c.bezierCurveTo(-0.22, -0.52, -0.06, -0.62, 0.03, -0.70);
        c.lineTo(0.18, -0.66);
        c.bezierCurveTo(0.26, -0.52, 0.26, -0.32, 0.225, -0.16);
        c.lineTo(0.235, 0);
        c.closePath();
        c.moveTo(0.29, -0.012); c.ellipse(0.235, -0.014, 0.058, 0.022, 0, 0, U.TAU);
        c.moveTo(0.18, -0.012); c.ellipse(0.13, -0.013, 0.05, 0.02, 0, 0, U.TAU);
      },
      tail(c, w) {
        c.moveTo(-0.30, -0.05);
        c.bezierCurveTo(-0.24, 0.03, 0.08, 0.03, 0.27, -0.005);
        c.bezierCurveTo(0.34 + 0.02 * w, -0.02, 0.38 + 0.03 * w, -0.06 - 0.03 * Math.max(0, w),
          0.35 + 0.05 * w, -0.12 - 0.05 * Math.abs(w));
      },
      // definition: the haunch and the front legs, drawn faintly inside the silhouette
      lines(c) {
        c.moveTo(-0.02, -0.03); c.bezierCurveTo(-0.02, -0.22, -0.12, -0.33, -0.25, -0.33);
        c.moveTo(0.175, -0.03); c.lineTo(0.17, -0.34);
      },
      bib: { x: 0.18, y: -0.44, rx: 0.07, ry: 0.17 }, paws: [[0.235, -0.014, 0.06, 0.03], [0.13, -0.013, 0.052, 0.028]],
      stripes: { angle: 1.42, from: -0.30, to: 0.46 },
    },
    loaf: {
      head: { x: 0.24, y: -0.47, r: 0.16 }, eyes: 0.42, tailW: 0.07, bob: 0.008,
      body(c) {
        c.moveTo(-0.46, 0);
        c.bezierCurveTo(-0.59, 0, -0.59, -0.30, -0.42, -0.36);
        c.bezierCurveTo(-0.22, -0.43, 0.06, -0.44, 0.22, -0.38);
        c.bezierCurveTo(0.35, -0.32, 0.37, -0.06, 0.31, 0);
        c.closePath();
        c.moveTo(0.36, -0.014); c.ellipse(0.31, -0.016, 0.05, 0.02, 0, 0, U.TAU);
      },
      tail(c, w) {
        c.moveTo(-0.47, -0.07);
        c.bezierCurveTo(-0.52, 0.02, -0.22, 0.02, 0.0, 0.0);
        c.quadraticCurveTo(0.07 + 0.02 * w, -0.01, 0.11 + 0.03 * w, -0.03 - 0.02 * Math.abs(w));
      },
      lines(c) { c.moveTo(-0.30, -0.04); c.bezierCurveTo(-0.32, -0.18, -0.22, -0.27, -0.10, -0.27); },
      bib: { x: 0.25, y: -0.26, rx: 0.08, ry: 0.10 }, paws: [[0.31, -0.016, 0.055, 0.028]],
      stripes: { angle: 1.5, from: -0.36, to: 0.6 },
    },
    curl: {
      head: { x: 0.25, y: -0.20, r: 0.15, tilt: 0.42 }, eyes: 0, tailW: 0.07, bob: 0.022,
      body(c) { c.moveTo(0.40, -0.20); c.ellipse(-0.02, -0.20, 0.42, 0.20, 0, 0, U.TAU); },
      tail(c, w) {
        c.moveTo(-0.42, -0.15);
        c.bezierCurveTo(-0.47, 0.01, -0.05, 0.03, 0.20, 0.0);
        c.quadraticCurveTo(0.30 + 0.01 * w, -0.01, 0.36 + 0.015 * w, -0.05);
      },
      lines(c) { c.moveTo(-0.32, -0.30); c.bezierCurveTo(-0.18, -0.38, 0.0, -0.38, 0.10, -0.33); },
      bib: null, paws: [],
      stripes: { angle: 1.1, from: -0.5, to: 0.4 },
    },
    // seen from behind, sitting and looking out (a window sill, a ledge). The tail hangs over the edge (opts.hang)
    // or curls on the ground beside.
    back: {
      head: { x: 0, y: -0.80, r: 0.16, back: true }, eyes: 0, tailW: 0.07, bob: 0.010,
      body(c) {
        c.moveTo(-0.27, 0);
        c.bezierCurveTo(-0.38, -0.02, -0.37, -0.32, -0.23, -0.46);
        c.bezierCurveTo(-0.16, -0.55, -0.12, -0.60, -0.09, -0.68);
        c.lineTo(0.09, -0.68);
        c.bezierCurveTo(0.12, -0.60, 0.16, -0.55, 0.23, -0.46);
        c.bezierCurveTo(0.37, -0.32, 0.38, -0.02, 0.27, 0);
        c.closePath();
      },
      tail(c, w, hang) {
        if (hang) {
          c.moveTo(0.12, -0.04);
          c.bezierCurveTo(0.26, -0.02, 0.29, 0.14, 0.26 + 0.03 * w, 0.27);
          c.bezierCurveTo(0.24 + 0.05 * w, 0.36, 0.27 + 0.08 * w, 0.43, 0.31 + 0.10 * w, 0.45);
        } else {
          c.moveTo(0.16, -0.04);
          c.bezierCurveTo(0.34, 0.03, 0.46, 0.0, 0.48 + 0.02 * w, -0.08);
          c.quadraticCurveTo(0.50 + 0.03 * w, -0.14, 0.46 + 0.05 * w, -0.18 - 0.03 * Math.abs(w));
        }
      },
      lines() {},
      bib: null, paws: [],
      stripes: { angle: 0, from: -0.75, to: 0.1 },
    },
  };
  const POSE_IDS = Object.keys(POSES);

  // the offscreen box, in units (x0, y0, w, h): fits every pose and the hanging tail
  const BX = -0.72, BY = -1.12, BW = 1.44, BH = 1.66;

  // ------------------------------------------------------------------ painting
  function silhouette(c, P, st, hang) {
    c.beginPath(); P.body(c); c.fill();
    const h = P.head;
    c.save();
    c.translate(h.x + (h.back ? st.turn * 0.02 : 0), h.y);
    c.rotate((h.tilt || 0) + (h.back ? 0 : st.tilt));
    // each part its own fill: the mirrored ears wind the other way, and overlapping opposite windings would cut holes
    c.beginPath(); face(c, h.r); c.fill();
    c.beginPath(); ear(c, -1, 0, 0, h.r, st.earL); c.fill();
    c.beginPath(); ear(c, 1, 0, 0, h.r, st.earR); c.fill();
    c.restore();
    c.beginPath(); P.tail(c, st.tail, hang);
    c.lineWidth = P.tailW; c.lineCap = "round"; c.lineJoin = "round"; c.stroke();
  }

  function rgb(c, k = 1) { return `rgb(${Math.round(c.r * k)},${Math.round(c.g * k)},${Math.round(c.b * k)})`; }

  // markings, shading and definition, painted "source-atop" so they stay inside the silhouette
  function marks(c, P, coat, col, st, hang) {
    const k = col.k, m = coat.marks;
    const tint = (cc) => rgb(lit(cc, col));
    if (m === "stripes" || m === "faint") {
      c.save();
      c.strokeStyle = tint(coat.stripe); c.globalAlpha = m === "faint" ? 0.45 : 0.8;
      c.lineWidth = 0.028; c.lineCap = "round";
      const s = P.stripes;
      c.beginPath();
      if (P === POSES.back) {
        // from behind: mackerel chevrons, from the spine curving down both flanks
        for (let y = -0.62; y < -0.06; y += 0.12) {
          for (const sd of [-1, 1]) { c.moveTo(0, y); c.bezierCurveTo(sd * 0.12, y - 0.01, sd * 0.24, y + 0.05, sd * 0.4, y + 0.16); }
        }
      } else {
        c.rotate(s.angle);
        for (let y = s.from; y < s.to; y += 0.105) {
          c.moveTo(-0.9, y); c.bezierCurveTo(-0.3, y + 0.03, 0.1, y - 0.03, 0.9, y + 0.01);
        }
      }
      c.stroke();
      c.restore();
      // tail rings
      c.save(); c.strokeStyle = tint(coat.stripe); c.globalAlpha = m === "faint" ? 0.4 : 0.75;
      c.lineWidth = P.tailW * 1.4; c.setLineDash([0.035, 0.055]); c.lineCap = "butt";
      c.beginPath(); P.tail(c, st.tail, hang); c.stroke(); c.restore();
      // the tabby "M" on the forehead
      if (!P.head.back) {
        const h = P.head;
        c.save(); c.translate(h.x, h.y); c.rotate((h.tilt || 0) + st.tilt);
        c.strokeStyle = tint(coat.stripe); c.globalAlpha = m === "faint" ? 0.4 : 0.75; c.lineWidth = 0.022;
        c.beginPath();
        for (const dx of [-0.3, 0, 0.3]) { c.moveTo(dx * h.r, -0.92 * h.r); c.lineTo(dx * h.r * 0.8, -0.45 * h.r); }
        c.stroke(); c.restore();
      }
      if (coat.belly && P.bib) {
        c.fillStyle = tint(coat.belly); c.globalAlpha = 0.35;
        c.beginPath(); c.ellipse(P.bib.x, P.bib.y, P.bib.rx * 0.9, P.bib.ry * 0.85, 0, 0, U.TAU); c.fill();
        c.globalAlpha = 1;
      }
    } else if (m === "tux") {
      c.fillStyle = tint(coat.white);
      if (P.bib) { c.beginPath(); c.ellipse(P.bib.x, P.bib.y, P.bib.rx, P.bib.ry, 0, 0, U.TAU); c.fill(); }
      for (const p of P.paws) { c.beginPath(); c.ellipse(p[0], p[1], p[2], p[3], 0, 0, U.TAU); c.fill(); }
      if (P === POSES.curl) { c.beginPath(); c.ellipse(0.30, -0.06, 0.07, 0.05, 0, 0, U.TAU); c.fill(); }
    } else if (m === "calico") {
      const blobs = P === POSES.curl ? [[-0.20, -0.26, 0.16, 0.11, "patchA"], [0.06, -0.12, 0.10, 0.07, "patchB"], [-0.36, -0.12, 0.08, 0.08, "patchB"]]
        : P === POSES.loaf ? [[-0.28, -0.26, 0.15, 0.10, "patchA"], [-0.05, -0.30, 0.09, 0.07, "patchB"], [-0.44, -0.08, 0.07, 0.07, "patchB"]]
        : P === POSES.back ? [[-0.12, -0.40, 0.14, 0.13, "patchA"], [0.14, -0.20, 0.10, 0.10, "patchB"], [0.10, -0.55, 0.06, 0.06, "patchA"]]
        : [[-0.22, -0.30, 0.14, 0.12, "patchA"], [-0.05, -0.55, 0.09, 0.07, "patchB"], [-0.32, -0.08, 0.07, 0.06, "patchB"]];
      for (const [x, y, rx, ry, key] of blobs) {
        c.fillStyle = tint(coat[key]); c.beginPath(); c.ellipse(x, y, rx, ry, 0.4, 0, U.TAU); c.fill();
      }
      // a patch on the head over one ear, and the tail
      const h = P.head;
      c.save(); c.translate(h.x, h.y); c.rotate((h.tilt || 0) + (h.back ? 0 : st.tilt));
      c.fillStyle = tint(coat.patchA); c.beginPath(); c.ellipse(-0.10, -0.12, 0.11, 0.09, 0.5, 0, U.TAU); c.fill();
      c.fillStyle = tint(coat.patchB); c.beginPath(); c.ellipse(0.12, -0.15, 0.07, 0.07, 0, 0, U.TAU); c.fill();
      c.restore();
      c.strokeStyle = tint(coat.patchB); c.lineWidth = P.tailW * 1.4; c.lineCap = "round";
      c.save(); c.setLineDash([0.12, 0.08]); c.beginPath(); P.tail(c, st.tail, hang); c.stroke(); c.restore();
    } else if (m === "points") {
      // darker ears, mask, tail and feet
      c.strokeStyle = tint(coat.point); c.lineWidth = P.tailW * 1.4; c.lineCap = "round";
      c.globalAlpha = 0.9;
      c.beginPath(); P.tail(c, st.tail, hang); c.stroke();
      for (const p of P.paws) { c.fillStyle = tint(coat.point); c.beginPath(); c.ellipse(p[0], p[1], p[2], p[3] * 1.6, 0, 0, U.TAU); c.fill(); }
      const h = P.head;
      c.save(); c.translate(h.x, h.y); c.rotate((h.tilt || 0) + (h.back ? 0 : st.tilt));
      const g = c.createRadialGradient(0, 0.25 * h.r, 0, 0, 0.25 * h.r, h.r * (h.back ? 0.6 : 0.95));
      g.addColorStop(0, tint(coat.point)); g.addColorStop(1, "rgba(0,0,0,0)");
      if (!h.back) { c.fillStyle = g; c.fillRect(-h.r * 1.3, -h.r * 1.2, h.r * 2.6, h.r * 2.4); }
      c.fillStyle = tint(coat.point);
      c.beginPath(); ear(c, -1, 0, 0, h.r, st.earL); c.fill();
      c.beginPath(); ear(c, 1, 0, 0, h.r, st.earR); c.fill();
      c.restore();
      c.globalAlpha = 1;
    }
    // definition lines (haunch, legs), a touch darker than the coat
    c.strokeStyle = "rgba(0,0,0,0.35)"; c.lineWidth = 0.014; c.lineCap = "round";
    c.beginPath(); P.lines(c); c.stroke();
    // shade: away from the light, and a little at the base
    const L = col.dir;
    const g = c.createLinearGradient(L.x * 0.5, L.y * 0.5 - 0.4, -L.x * 0.5, -L.y * 0.5 - 0.4);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${0.5 * k})`);
    c.fillStyle = g; c.fillRect(BX, BY, BW, BH);
    const g2 = c.createLinearGradient(0, -0.25, 0, 0.05);
    g2.addColorStop(0, "rgba(0,0,0,0)"); g2.addColorStop(1, "rgba(0,0,0,0.3)");
    c.fillStyle = g2; c.fillRect(BX, -0.25, BW, 0.8);
  }

  // coat colour under the scene's light: light 0..1 scales it, tint (the colour of the light) colours it
  function lit(cc, col) {
    const t = col.tint, ta = col.tintAmt;
    const r = cc.r * col.light, g = cc.g * col.light, b = cc.b * col.light;
    return { r: U.lerp(r, r * t.r / 160, ta), g: U.lerp(g, g * t.g / 160, ta), b: U.lerp(b, b * t.b / 160, ta) };
  }

  // ------------------------------------------------------------------ the cat
  function makeCanvas() {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(8, 8);
    const c = document.createElement("canvas"); c.width = c.height = 8; return c;
  }

  function create(seed = 1) {
    const rnd = U.rng(seed * 7919 + 13);
    const body = makeCanvas(), rim = makeCanvas();
    const bc = body.getContext("2d"), rc = rim.getContext("2d");
    const st = {
      pose: null, prev: null, x: 1,           // current pose, the one fading out, crossfade 0..1
      t: null, open: 1,                       // eye openness 0..1 (blink)
      blinkAt: 2 + rnd() * 3, blinkT: -1, blinkLen: 0.16, slowBlink: false, double: false,
      earAt: 4 + rnd() * 8, earT: -1, earSide: 1, earL: 0, earR: 0,
      tiltAt: 8 + rnd() * 10, tiltUntil: 0, tiltTarget: 0, tilt: 0,
      turn: 0, swishAt: 6 + rnd() * 10, swish: 0,
      tail: 0, bob: 0, gx: 0, gy: 0,
    };
    let lastBox = null;

    function step(t, dt, asleep) {
      if (st.t === null) st.t = t;
      st.t = t;
      // blinks: quick, sometimes double, now and then a slow blink (the cat's "I trust you")
      if (!asleep && t >= st.blinkAt && st.blinkT < 0) {
        st.blinkT = 0;
        st.slowBlink = rnd() < 0.18;
        st.double = !st.slowBlink && rnd() < 0.2;
        st.blinkLen = st.slowBlink ? 1.5 : 0.16;
      }
      if (st.blinkT >= 0) {
        st.blinkT += dt;
        const p = st.blinkT / st.blinkLen;
        if (st.slowBlink) st.open = p < 0.35 ? 1 - U.easeInOut(p / 0.35) : p < 0.6 ? 0 : U.easeInOut((p - 0.6) / 0.4);
        else st.open = 1 - Math.sin(Math.min(1, p) * Math.PI);
        if (p >= 1) {
          st.open = 1; st.blinkT = -1;
          st.blinkAt = t + (st.double ? 0.18 : 2.5 + rnd() * 5);
          st.double = false;
        }
      }
      // ear flicks (also in sleep, more rarely)
      if (t >= st.earAt && st.earT < 0) { st.earT = 0; st.earSide = rnd() < 0.5 ? -1 : 1; }
      if (st.earT >= 0) {
        st.earT += dt;
        const a = st.earT < 0.1 ? st.earT / 0.1 : Math.max(0, 1 - (st.earT - 0.1) / 0.3);
        if (st.earSide < 0) st.earL = 0.38 * a; else st.earR = 0.38 * a;
        if (st.earT > 0.4) { st.earT = -1; st.earL = st.earR = 0; st.earAt = t + (asleep ? 10 + rnd() * 25 : 4 + rnd() * 12); }
      }
      // head tilt (awake): a curious tilt for a few seconds, then back
      if (!asleep && t >= st.tiltAt) {
        if (st.tiltUntil < t) {
          st.tiltTarget = (rnd() < 0.5 ? -1 : 1) * (0.08 + rnd() * 0.14);
          st.tiltUntil = t + 2.5 + rnd() * 3;
          st.turn = rnd() * 2 - 1;
        }
        st.tiltAt = st.tiltUntil + 10 + rnd() * 20;
      }
      if (t > st.tiltUntil) { st.tiltTarget = 0; }
      st.tilt += (st.tiltTarget - st.tilt) * Math.min(1, dt * 3);
      // tail: a slow sway, and now and then a swish
      if (!asleep && t >= st.swishAt) { st.swish = 1; st.swishAt = t + 8 + rnd() * 16; }
      st.swish = Math.max(0, st.swish - dt * 0.5);
      const sw = asleep ? 0.25 : 0.6;
      st.tail = sw * (0.6 * Math.sin(t * 0.8 + seed) + 0.4 * U.noise1(t * 0.35 + seed * 3)) +
        st.swish * Math.sin(t * 7) * 0.9;
      // breath
      st.bob = Math.sin(t * U.TAU / (asleep ? 4.4 : 3.2));
      // gaze wanders a little
      st.gx = U.noise1(t * 0.12 + seed) * 0.6; st.gy = U.noise1(t * 0.09 + seed * 5) * 0.3;
    }

    // paint one pose into the offscreen canvases and composite it onto ctx
    function paint(ctx, P, coat, col, o, alpha, size, dpr) {
      const S = size * dpr;
      const W = Math.max(8, Math.ceil(BW * S)), H = Math.max(8, Math.ceil(BH * S));
      if (body.width !== W || body.height !== H) { body.width = rim.width = W; body.height = rim.height = H; }
      const hang = o.hang !== false;
      const bob = 1 + P.bob * st.bob;
      for (const c of [bc, rc]) {
        c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
        c.clearRect(0, 0, W, H);
        c.setTransform(S, 0, 0, S, -BX * S, -BY * S);
      }
      // body: base coat, then markings and shade kept inside it
      bc.fillStyle = bc.strokeStyle = rgb(lit(coat.base, col));
      silhouette(bc, P, st, hang);
      bc.globalCompositeOperation = "source-atop";
      marks(bc, P, coat, col, st, hang);
      bc.globalCompositeOperation = "source-over";

      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.scale(o.facing, 1);
      ctx.globalAlpha = alpha;
      ctx.drawImage(body, BX * size, BY * size * bob, BW * size, BH * size * bob);
      // rim light(s): the silhouette minus itself shifted away from the light = a crescent on the lit edge
      for (const r of col.rims) {
        if (!(r.a > 0)) continue;
        rc.setTransform(1, 0, 0, 1, 0, 0); rc.globalCompositeOperation = "source-over"; rc.clearRect(0, 0, W, H);
        rc.setTransform(S, 0, 0, S, -BX * S, -BY * S);
        rc.fillStyle = rc.strokeStyle = rgb(U.safe(r.color));
        silhouette(rc, P, st, hang);
        rc.globalCompositeOperation = "destination-out";
        const w = r.width || 0.035;
        rc.translate(-r.dx * o.facing * w, -r.dy * w);
        silhouette(rc, P, st, hang);
        ctx.globalAlpha = alpha * U.clamp(r.a);
        ctx.drawImage(rim, BX * size, BY * size * bob, BW * size, BH * size * bob);
      }
      ctx.restore();

      // the face: eyes, nose, a mouth and whiskers (front-facing poses only)
      const h = P.head;
      if (h.back) return;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.scale(size * o.facing, size);
      ctx.translate(h.x, h.y * bob);
      ctx.rotate((h.tilt || 0) + st.tilt);
      ctx.globalAlpha = alpha;
      const r = h.r, px = 1 / size;
      const awake = P.eyes > 0;
      const open = awake ? U.clamp(st.open * P.eyes) : 0;
      const ex = 0.42 * r, ey = 0.04 * r, erx = 0.20 * r, ery = 0.17 * r;
      const eyeC = lit(coat.eye, { ...col, light: Math.max(col.light, 0.35) });
      for (const s of [-1, 1]) {
        const cx = s * ex;
        if (open > 0.08) {
          // almond eye, the slit pupil widens in the dark; eyeshine at night (o.glow)
          ctx.fillStyle = rgb(eyeC);
          ctx.beginPath(); ctx.ellipse(cx, ey, erx, ery * open, s * -0.12, 0, U.TAU); ctx.fill();
          if (o.glow > 0) {
            const shine = U.safe(U.mix(coat.eye, C(150, 200, 90), 0.4), 200);
            ctx.globalAlpha = alpha * o.glow * open;
            ctx.fillStyle = rgb(shine);
            ctx.beginPath(); ctx.ellipse(cx, ey, erx, ery * open, s * -0.12, 0, U.TAU); ctx.fill();
            ctx.globalAlpha = alpha;
          }
          const pw = U.lerp(0.035, 0.12, U.clamp(1 - col.light * 1.4)) * r;
          ctx.fillStyle = "rgb(6,5,6)";
          ctx.beginPath(); ctx.ellipse(cx + st.gx * erx * 0.4, ey + st.gy * ery * 0.3 * open, pw, ery * open * 0.92, 0, 0, U.TAU); ctx.fill();
          if (col.light > 0.25 && size > 70) {
            ctx.fillStyle = `rgba(200,196,180,${0.5 * col.light})`;
            ctx.beginPath(); ctx.arc(cx - erx * 0.3, ey - ery * 0.35 * open, Math.max(px, 0.035 * r), 0, U.TAU); ctx.fill();
          }
        } else {
          // closed: a soft curve
          ctx.strokeStyle = `rgba(0,0,0,${0.6})`; ctx.lineWidth = Math.max(px, 0.05 * r); ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(cx - erx, ey); ctx.quadraticCurveTo(cx, ey + ery * 0.9, cx + erx, ey); ctx.stroke();
        }
      }
      // nose and mouth
      ctx.fillStyle = rgb(lit(coat.nose, col));
      ctx.beginPath(); ctx.moveTo(-0.09 * r, 0.30 * r); ctx.lineTo(0.09 * r, 0.30 * r); ctx.lineTo(0, 0.41 * r); ctx.closePath(); ctx.fill();
      if (size > 50) {
        ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = Math.max(px, 0.03 * r); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(0, 0.41 * r); ctx.lineTo(0, 0.50 * r);
        ctx.quadraticCurveTo(-0.08 * r, 0.6 * r, -0.17 * r, 0.52 * r);
        ctx.moveTo(0, 0.50 * r); ctx.quadraticCurveTo(0.08 * r, 0.6 * r, 0.17 * r, 0.52 * r); ctx.stroke();
      }
      // whiskers: faint, lit from the scene
      if (size > 60) {
        const wc = U.safe(U.mix(lit(C(180, 176, 166), col), col.rims.length ? col.rims[0].color : C(120, 120, 120), 0.3));
        ctx.strokeStyle = rgb(wc); ctx.globalAlpha = alpha * (0.25 + 0.3 * col.light); ctx.lineWidth = Math.max(px * 0.8, 0.012 * r);
        ctx.beginPath();
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
          const y0 = 0.42 * r + i * 0.06 * r;
          ctx.moveTo(s * 0.3 * r, y0); ctx.quadraticCurveTo(s * 0.9 * r, y0 - 0.06 * r + i * 0.08 * r, s * 1.45 * r, y0 - 0.12 * r + i * 0.18 * r);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    const cat = {
      /**
       * Draw the cat. Call every frame; it draws nothing while frame.cat is null (the cat is off).
       * opts: x, y       ground point under the cat (CSS px)
       *       size       sitting height in px (lying poses are ~0.45 size tall and ~1 size long)
       *       facing     1 = faces right (default), -1 = left
       *       pose       "sit" | "loaf" | "curl" | "back" (default: AW.cat.autoPose(frame))
       *       light      0..1 how lit the coat is (night ~0.2-0.35, day ~0.8-1)
       *       tint       {r,g,b} colour of the scene light; tintAmt 0..1 how much it colours the coat
       *       rim        {color, a, dx, dy, width?} or an array: a lit edge from a light at direction (dx, dy)
       *       glow       0..1 eyeshine (night)
       *       alpha      extra fade (e.g. the theme's ambient blend)
       *       shadow     0..1 a soft contact shadow under the cat
       *       hang       (pose "back") the tail hangs over a ledge (default true)
       */
      draw(ctx, frame, o) {
        const fc = frame.cat;
        const alpha = (fc ? fc.a : 0) * (o.alpha == null ? 1 : o.alpha);
        const pose = POSES[o.pose] ? o.pose : autoPose(frame);
        if (st.pose === null) { st.pose = pose; st.x = 1; }
        if (pose !== st.pose) { st.prev = st.pose; st.pose = pose; st.x = 0; }
        st.x = Math.min(1, st.x + (frame.dt || 0) / 1.6);
        if (st.x >= 1) st.prev = null;
        step(frame.t, frame.dt || 0, POSES[st.pose].eyes === 0 && !POSES[st.pose].head.back);
        if (!(alpha > 0.002)) { lastBox = null; if (AW.cat.last === cat.last) AW.cat.last = null; cat.last = null; return; }
        const coat = COATS[(fc && fc.coat) || "tabby"] || COATS.tabby;
        const rims = !o.rim ? [] : Array.isArray(o.rim) ? o.rim : [o.rim];
        const d0 = rims[0] || { dx: -0.6, dy: -0.8 };
        const dl = Math.hypot(d0.dx || 0, d0.dy || 0) || 1;
        const col = {
          light: U.clamp(o.light == null ? 0.6 : o.light), tint: o.tint || C(160, 160, 160), tintAmt: U.clamp(o.tintAmt == null ? 0.5 : o.tintAmt),
          rims: rims.map((r) => ({ ...r, dx: (r.dx || 0) / (Math.hypot(r.dx || 0, r.dy || 0) || 1), dy: (r.dy || 0) / (Math.hypot(r.dx || 0, r.dy || 0) || 1) })),
          dir: { x: (d0.dx || 0) / dl * (o.facing === -1 ? -1 : 1), y: (d0.dy || 0) / dl },
          k: 1 - 0.4 * U.clamp(o.light == null ? 0.6 : o.light),
        };
        const size = Math.max(4, o.size || 100), dpr = frame.dpr || 1;
        const oo = { x: o.x, y: o.y, facing: o.facing === -1 ? -1 : 1, glow: U.clamp(o.glow || 0), hang: o.hang };
        if (o.shadow > 0) {
          const P = POSES[st.pose];
          const w = P === POSES.sit || P === POSES.back ? 0.42 : 0.62;
          ctx.save();
          const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, w * size);
          g.addColorStop(0, `rgba(0,0,0,${0.45 * o.shadow * alpha})`); g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g; ctx.translate(0, o.y); ctx.scale(1, 0.14); ctx.translate(0, -o.y);
          ctx.fillRect(o.x - w * size, o.y - w * size, 2 * w * size, 2 * w * size);
          ctx.restore();
        }
        if (st.prev) paint(ctx, POSES[st.prev], coat, col, oo, alpha * (1 - U.easeInOut(st.x)), size, dpr);
        paint(ctx, POSES[st.pose], coat, col, oo, alpha * (st.prev ? U.easeInOut(st.x) : 1), size, dpr);
        // where it was drawn (tests, and themes that want to light around it)
        lastBox = {
          x: o.x + (oo.facing > 0 ? -0.62 : -0.62) * size, y: o.y - 1.0 * size, w: 1.24 * size, h: (st.pose === "back" && oo.hang !== false ? 1.46 : 1.04) * size,
          pose: st.pose, size, coat: coat.name, alpha, t: frame.t,
        };
        cat.last = lastBox;
        AW.cat.last = lastBox;
      },
      state: st,
      last: null,
    };
    return cat;
  }

  // The night wears on: awake by day and in the early evening, a loaf later, curled up asleep in the small hours.
  // awake: the pose for awake (default "sit"; window themes may pass "back").
  function autoPose(frame, awake = "sit") {
    if ((frame.day || 0) > 0.35) return awake;
    const min = (frame.ambientElapsed || 0) / 60;
    if (min < 45) return awake;
    if (min < 150) return "loaf";
    return "curl";
  }

  AW.cat = { create, autoPose, COATS, COAT_IDS, POSES: POSE_IDS, last: null };
})();
