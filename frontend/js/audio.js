// Ambient Wall - sound: a procedural Web Audio soundscape (background sound effects, never music). No audio files,
// no network: every sound is synthesised from three noise loops, oscillators and filters. See THEMES.md "Sound".
//
//   AW.audio.update(frame, levels)       core, every frame: layer levels 0..1 (smoothed here); master level =
//                                        volume x (work: display.sound_work .. ambient: 1, on frame.blend)
//   AW.audio.cue(name, {gain, pan, distance, delay, ...})   a one-shot (thunder, train, loon, ...); false if ignored
//   AW.audio.setEnabled(bool) / setVolume(0..1) / unlock() / state()
//   AW.audio.defaultSoundscape(frame)    levels from weather + daylight (pure; themes may call it and adjust)
//   AW.audio.defaultCues(frame)          storm thunder every 20-60 s (core calls it for themes without soundscape())
//   AW.audio.meter(ms)                   RMS / peak of the master output (AnalyserNode), for tests and the HUD
//   AW.audio.renderOffline({...})        the same engine in an OfflineAudioContext (tests, CPU checks)
//
// Engine: layers -> bus -> master gain -> compressor -> limiter -> soft ceiling (WaveShaper, peak < -1 dBFS) -> out.
// A shared convolution reverb (procedural impulse response) returns into the bus. The AudioContext is created
// lazily on the first setEnabled(true) and unlocked on the first user gesture (core forwards keys and clicks).
// CPU: three stereo noise loops are generated once per sample rate (independent L/R noise = free stereo width) and
// every layer and cue plays them through cheap biquads; there is no ScriptProcessor or worklet. Each layer is a small
// graph built when its level rises above 0.01 and torn down when it falls back under; its random events (drops,
// crackles, chirps, gusts) are scheduled a few hundred ms ahead from update(), so a silent wall costs nothing.
//
// Recordings (sounds/manifest.json, built by tools/process_sounds.py): when the page is served over http(s), a
// layer or cue that has recordings plays them instead of its synthesis (see "recorded samples" below); anything
// missing, still loading or broken falls back to the procedural voice, silently.
window.AW = window.AW || {};

(function () {
  // procedural layers (each a BUILD below); the public layer names add the ones only recordings have
  const PROC = ["rain", "wind", "fire", "water", "city", "birds", "crickets", "forest", "room", "space", "magic"];
  const LAYERS = PROC.concat(["rain-light", "rain-heavy", "rain-window", "wind-gentle", "wind-strong", "city-night",
    "city-day", "birds-light", "cicadas", "town", "cathedral", "neon"]);
  const CUES = ["thunder", "train", "loon", "owl", "pop", "chime", "drip", "page", "distant_bell", "hover", "ward"];
  const OFF = 0.01;           // a layer below this is torn down
  const LOOKAHEAD = 0.35;     // seconds of events scheduled ahead of the audio clock
  const MAX_VOICES = 14;      // concurrent cues

  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const expo = (mean) => -Math.log(1 - Math.random()) * mean; // Poisson inter-arrival
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const disc = (n) => { try { n.disconnect(); } catch (e) { /* already */ } };
  const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);

  // ---------------------------------------------------------------- shared buffers (once per sample rate)
  const bufCache = {};
  function noiseBuffers(ctx) {
    const sr = ctx.sampleRate;
    if (bufCache[sr]) return bufCache[sr];
    // gen fills a Float32Array; the tail is cross-faded into the head so the loop has no seam, then the
    // buffer is centred and normalised to RMS 0.3. L and R are independent: decorrelated stereo for free.
    const make = (secs, gen) => {
      const n = Math.floor(secs * sr), F = Math.floor(0.05 * sr);
      const b = ctx.createBuffer(2, n, sr);
      for (let c = 0; c < 2; c++) {
        const a = new Float32Array(n + F);
        gen(a);
        for (let i = 0; i < F; i++) { const x = i / F; a[i] = a[i] * Math.sqrt(x) + a[n + i] * Math.sqrt(1 - x); }
        let m = 0; for (let i = 0; i < n; i++) m += a[i]; m /= n;
        let s = 0; for (let i = 0; i < n; i++) { a[i] -= m; s += a[i] * a[i]; }
        const k = 0.3 / Math.sqrt(s / n || 1);
        const d = b.getChannelData(c);
        for (let i = 0; i < n; i++) d[i] = a[i] * k;
      }
      return b;
    };
    const white = (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; };
    const pink = (a) => { // Paul Kellet's refined filter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < a.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        a[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      }
    };
    const brown = (a) => { let l = 0; for (let i = 0; i < a.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; a[i] = l; } };
    // co-prime-ish lengths so layers sharing a colour never fall into step
    bufCache[sr] = { white: make(4.3, white), pink: make(5.7, pink), brown: make(6.9, brown) };
    return bufCache[sr];
  }

  // Cricket chirps: a few pulses of a ~4.5 kHz tone (the wing's file and scraper), slightly falling within each
  // pulse. Pre-rendered once, played by many crickets at different rates.
  const chirpCache = {};
  function chirpBuffers(ctx) {
    const sr = ctx.sampleRate;
    if (chirpCache[sr]) return chirpCache[sr];
    chirpCache[sr] = [[4300, 4], [4650, 3], [4950, 4], [4500, 5]].map(([f, pulses]) => {
      const pd = 0.016, per = 0.034, n = Math.floor((pulses * per + 0.02) * sr);
      const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      let ph = 0;
      for (let p = 0; p < pulses; p++) {
        const s0 = Math.floor(p * per * sr), m = Math.floor(pd * sr), amp = p === 0 ? 0.7 : p === pulses - 1 ? 0.85 : 1;
        for (let i = 0; i < m && s0 + i < n; i++) {
          const x = i / m, env = Math.pow(Math.sin(Math.PI * x), 2);
          ph += (2 * Math.PI * f * (1 - 0.035 * x)) / sr;
          d[s0 + i] = amp * env * (Math.sin(ph) + 0.07 * Math.sin(2 * ph) + 0.03 * Math.sin(3 * ph)) * 0.8;
        }
      }
      return b;
    });
    return chirpCache[sr];
  }

  // Reverb impulse: decorrelated stereo noise, exponential decay (RT60 ~2.4 s), darkening as it decays.
  function impulse(ctx, secs) {
    const sr = ctx.sampleRate, n = Math.floor(secs * sr), b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, k = 1 - 0.88 * Math.pow(t / secs, 0.6);
        lp += k * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.exp(-t / 0.36) * (t < 0.012 ? t / 0.012 : 1);
      }
    }
    return b;
  }

  // Soft ceiling: transparent below 0.6, then a tanh knee that never passes 0.87 (-1.2 dBFS), whatever comes in.
  function ceilingCurve() {
    const n = 4096, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
      c[i] = Math.sign(x) * (a <= 0.6 ? a : 0.6 + 0.27 * Math.tanh((a - 0.6) / 0.27));
    }
    return c;
  }

  // ---------------------------------------------------------------- voice helpers
  // A noise click / grain: `dur` seconds of noise from a random point in the loop, attack then exponential decay.
  function click(e, t, dur, peak, dest, color) {
    const ctx = e.ctx, buf = e.nb[color || "white"];
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf;
    const a = Math.min(0.0006, dur * 0.2);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(0, t + a, dur / 3.5);
    s.connect(g); g.connect(dest);
    s.start(t, Math.random() * (buf.duration - dur - 0.1), dur + 0.02);
    s.onended = () => { disc(s); disc(g); };
    return s;
  }
  // A looping noise source for a longer voice (caller shapes it).
  function noiseSrc(e, color, t, dur, rate) {
    const s = e.ctx.createBufferSource();
    s.buffer = e.nb[color]; s.loop = true;
    if (rate) s.playbackRate.value = rate;
    s.start(t, Math.random() * s.buffer.duration);
    s.stop(t + dur);
    return s;
  }
  // An air bubble (rain on water, a drip, a gurgle): a sine whose pitch rises as the bubble closes (Minnaert).
  function bubble(e, t, f, peak, pan, dest, rise, decay) {
    const ctx = e.ctx, o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
    const d = decay || rand(0.03, 0.07);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * (rise || rand(1.4, 2.1)), t + d * 0.8);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.0015);
    g.gain.setTargetAtTime(0, t + 0.0015, d / 3);
    p.pan.value = pan;
    o.connect(g); g.connect(p); p.connect(dest);
    o.start(t); o.stop(t + d * 1.6 + 0.02);
    o.onended = () => { disc(o); disc(g); disc(p); };
    return o;
  }
  // k-rate filter params: coefficients once per 128-sample block instead of per sample while automated (sweeps
  // here are slow, so this is inaudible and several times cheaper).
  const filt = (ctx, type, f, q) => {
    const n = ctx.createBiquadFilter();
    n.type = type; n.frequency.value = f; if (q != null) n.Q.value = q;
    try { n.frequency.automationRate = "k-rate"; n.Q.automationRate = "k-rate"; } catch (e) { /* older engines */ }
    return n;
  };
  const gainN = (ctx, v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const panN = (ctx, v) => { const n = ctx.createStereoPanner(); n.pan.value = clamp(v, -1, 1); return n; };

  // A layer's toolkit: creates nodes it remembers (so stop() can tear the graph down) and schedules random events.
  function Kit(e, out) { this.e = e; this.ctx = e.ctx; this.out = out; this.nodes = []; this.srcs = []; this.next = {}; this.t0 = e.ctx.currentTime; }
  Kit.prototype = {
    keep(n) { this.nodes.push(n); return n; },
    g(v) { return this.keep(gainN(this.ctx, v === undefined ? 1 : v)); },
    f(type, f, q) { return this.keep(filt(this.ctx, type, f, q)); },
    p(v) { return this.keep(panN(this.ctx, v || 0)); },
    noise(color, rate) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.e.nb[color]; s.loop = true; s.playbackRate.value = rate || 1;
      s.start(this.ctx.currentTime, Math.random() * s.buffer.duration);
      this.srcs.push(s); return this.keep(s);
    },
    osc(type, f, detune) {
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = f; if (detune) o.detune.value = detune;
      o.start(this.ctx.currentTime);
      this.srcs.push(o); return this.keep(o);
    },
    lfo(f, depth, param, type) { const o = this.osc(type || "sine", f), g = this.g(depth); o.connect(g); g.connect(param); return o; },
    chain(...ns) { for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]); return ns[ns.length - 1]; },
    send(amount) { const s = this.g(amount); s.connect(this.e.rev); return s; },
    // Fire fn(t) for every event time in [.., to). interval(first) gives the gap; a stalled clock re-anchors.
    every(key, now, to, interval, fn) {
      let n = this.next[key];
      if (n === undefined) n = now + Math.max(0.001, interval(true));
      else if (n < now - 0.05) n = now + Math.max(0.001, interval(false));
      let guard = 0;
      while (n < to && guard++ < 20000) { fn(n); n += Math.max(0.002, interval(false)); }
      this.next[key] = n;
    },
    stop() {
      const t = this.ctx.currentTime;
      for (const s of this.srcs) { try { s.stop(t + 0.05); } catch (e) { /* not started */ } }
      const ns = this.nodes;
      if (this.e.offline) return;
      setTimeout(() => ns.forEach(disc), 250);
    },
  };

  // ---------------------------------------------------------------- layers
  // BUILD[name](e, out, k) -> { tick(now, to, level) }. `out` is the layer's level gain; tick schedules random
  // events up to `to` and eases level-dependent timbre (more level = more than just louder).
  const BUILD = {};

  // Rain: a pink-noise body whose brightness follows intensity, a fine high hiss, a low thrum in a downpour, and
  // individual drops: noise ticks through a bank of surface resonances spread across the stereo field, plus the
  // occasional bubble "plink" of a drop landing in water.
  BUILD.rain = (e, out, k) => {
    const lp = k.f("lowpass", 3000, 0.4), body = k.g(0.5), swell = k.g(1);
    k.chain(k.noise("pink"), k.f("highpass", 280, 0.5), lp, body, swell, out);
    const hiss = k.g(0.1);
    k.chain(k.noise("white", 0.93), k.f("highpass", 4800, 0.5), k.f("lowpass", 11000, 0.5), hiss, out);
    const low = k.g(0);
    k.chain(k.noise("brown", 0.8), k.f("lowpass", 240, 0.6), low, out);
    const rev = k.send(0.12);
    const bank = [1300, 1900, 2700, 3600, 4800, 6400, 8200].map((f, i) => {
      const bp = k.f("bandpass", f, rand(1.0, 2.2)), p = k.p((i % 2 ? 1 : -1) * rand(0.15, 0.95));
      bp.connect(p); p.connect(out); p.connect(rev);
      return bp;
    });
    let shown = -1;
    return {
      tick(now, to, lvl) {
        if (Math.abs(lvl - shown) > 0.02) {
          shown = lvl;
          lp.frequency.setTargetAtTime(1500 + 6500 * lvl, now, 1);
          body.gain.setTargetAtTime(0.25 + 0.75 * lvl, now, 1);
          hiss.gain.setTargetAtTime(0.03 + 0.12 * lvl, now, 1);
          low.gain.setTargetAtTime(0.9 * sstep(0.45, 1, lvl), now, 1);
        }
        k.every("swell", now, to, () => rand(1.2, 3.5), (t) => swell.gain.setTargetAtTime(rand(0.8, 1.12), t, rand(0.4, 1.4)));
        k.every("drop", now, to, (f) => (f ? 0.01 : expo(1 / (6 + 50 * lvl))), (t) => {
          const big = Math.random() < 0.06;
          click(e, t, big ? rand(0.008, 0.03) : rand(0.002, 0.012), big ? rand(0.5, 0.9) : 0.08 + 0.45 * Math.pow(Math.random(), 2.2), pick(bank));
        });
        k.every("plink", now, to, () => expo(1 / (0.3 + 2.2 * lvl)), (t) => bubble(e, t, rand(1100, 3200), rand(0.01, 0.045), rand(-0.85, 0.85), out));
      },
    };
  };

  // Wind: band-passed pink noise whose centre and level follow a random walk of gusts (not an LFO: real gusts are
  // irregular), a higher airy band, a low buffeting rumble and a faint narrow-band howl that rises with the gusts.
  BUILD.wind = (e, out, k) => {
    const bp1 = k.f("bandpass", 450, 0.8), g1 = k.g(0.5), pan1 = k.p(0);
    k.chain(k.noise("pink"), bp1, g1, pan1, out);
    const bp2 = k.f("bandpass", 1100, 2.5), g2 = k.g(0.15);
    k.chain(k.noise("white", 0.9), bp2, g2, out);
    const g3 = k.g(0.4);
    k.chain(k.noise("brown", 1.1), k.f("lowpass", 170, 0.7), g3, out);
    const howl = k.f("bandpass", 600, 16), gh = k.g(0);
    k.chain(k.noise("pink", 0.97), howl, gh, out);
    return {
      tick(now, to, lvl) {
        k.every("gust", now, to, (f) => (f ? 0.02 : rand(1.2, 4.0)), (t) => {
          const gust = clamp(0.15 + lvl * (0.25 + 0.75 * Math.pow(Math.random(), 0.8)));
          const tau = rand(0.5, 1.6);
          bp1.frequency.setTargetAtTime(240 + 560 * gust, t, tau);
          g1.gain.setTargetAtTime(0.25 + 0.75 * gust, t, tau);
          bp2.frequency.setTargetAtTime(800 + 1100 * gust, t, tau);
          g2.gain.setTargetAtTime(0.04 + 0.3 * gust * gust, t, tau);
          g3.gain.setTargetAtTime(0.15 + 0.85 * gust, t, tau * 0.7);
          howl.frequency.setTargetAtTime(420 + 560 * gust, t, tau * 1.5);
          gh.gain.setTargetAtTime(1.6 * gust * gust * lvl, t, tau);
          pan1.pan.setTargetAtTime(rand(-0.5, 0.5), t, tau * 2);
        });
      },
    };
  };

  // A spark / coal pop: a sharp snap, a short resonant knock (the wood), and a few embers fizzing after.
  function popVoice(e, t, o, dest) {
    const ctx = e.ctx, g = o.gain;
    const p = panN(ctx, o.pan), send = gainN(ctx, 0.12);
    p.connect(dest); p.connect(send); send.connect(e.rev);
    const hp = filt(ctx, "highpass", 1300, 0.7), bp = filt(ctx, "bandpass", rand(600, 1500), rand(4, 9));
    hp.connect(p); bp.connect(p);
    click(e, t, rand(0.002, 0.004), 0.7 * g, hp);
    click(e, t + 0.0005, rand(0.02, 0.05), 2.2 * g, bp);
    const n = (Math.random() * 5) | 0;
    for (let i = 0; i < n; i++) click(e, t + rand(0.03, 0.4), rand(0.001, 0.003), rand(0.05, 0.25) * g, hp);
    e.after(t + 0.6, [p, send, hp, bp]);
    return t + 0.6;
  }

  // Fire: a brown-noise roar with a fast random flicker, the airy draught of the flames, and crackle: clusters of
  // sub-5 ms clicks with power-law amplitudes (many tiny, a few sharp) through a bank of filters, plus pops.
  BUILD.fire = (e, out, k) => {
    const lp = k.f("lowpass", 520, 0.6), roar = k.g(0.6), flick = k.g(1);
    k.chain(k.noise("brown"), lp, roar, flick, out);
    const bp = k.f("bandpass", 1300, 0.7), breath = k.g(0.12);
    k.chain(k.noise("pink", 1.03), bp, breath, out);
    const bank = [["highpass", 1800, 0.7], ["bandpass", 2600, 1.1], ["bandpass", 3800, 1.3], ["highpass", 5200, 0.7], ["bandpass", 1300, 2.2]].map(([ty, f, q]) => {
      const n = k.f(ty, f, q), p = k.p(rand(-0.6, 0.6));
      n.connect(p); p.connect(out);
      return n;
    });
    let shown = -1;
    return {
      tick(now, to, lvl) {
        if (Math.abs(lvl - shown) > 0.02) { shown = lvl; roar.gain.setTargetAtTime(0.35 + 0.65 * lvl, now, 1); }
        k.every("flicker", now, to, () => rand(0.07, 0.3), (t) => {
          const tau = rand(0.05, 0.2);
          flick.gain.setTargetAtTime(rand(0.6, 1.1), t, tau);
          lp.frequency.setTargetAtTime(rand(330, 760), t, tau);
          breath.gain.setTargetAtTime(rand(0.04, 0.16), t, tau);
        });
        k.every("crackle", now, to, (f) => (f ? 0.02 : expo(1 / (1.5 + 7 * lvl))), (t) => {
          const n = 1 + Math.floor(Math.pow(Math.random(), 2) * 9), f0 = pick(bank);
          const loud = Math.random() < 0.08 ? rand(0.5, 0.9) : rand(0.08, 0.35);
          let tt = t;
          for (let i = 0; i < n; i++) {
            click(e, tt, rand(0.0012, 0.005), 0.02 + loud * Math.pow(Math.random(), 1.5), Math.random() < 0.3 ? pick(bank) : f0);
            tt += 0.003 + expo(0.025);
          }
        });
        k.every("pop", now, to, () => expo(1 / (0.06 + 0.3 * lvl)), (t) => popVoice(e, t, { gain: rand(0.15, 0.45), pan: rand(-0.6, 0.6) }, out));
      },
    };
  };

  // Water lapping: a low brown-noise bed, and two decorrelated wash bands that swell on irregular laps (level up,
  // low-pass opening, then a slower fall), an occasional soft slap at the crest and the odd gurgle.
  BUILD.water = (e, out, k) => {
    const bed = k.g(0.35);
    k.chain(k.noise("brown", 0.9), k.f("lowpass", 380, 0.6), bed, out);
    const mk = (rate) => {
      const lp = k.f("lowpass", 600, 0.8), g = k.g(0.05), p = k.p(0);
      k.chain(k.noise("pink", rate), k.f("highpass", 120), lp, g, p, out);
      return { lp, g, p };
    };
    const a = mk(1), b = mk(0.92);
    const slapBP = k.f("bandpass", 450, 2), slapP = k.p(0);
    slapBP.connect(slapP); slapP.connect(out);
    const lap = (w, t, lvl) => {
      const rise = rand(0.35, 0.8), peak = (0.25 + 0.6 * lvl) * rand(0.5, 1);
      w.g.gain.setTargetAtTime(peak, t, rise / 3);
      w.g.gain.setTargetAtTime(0.04, t + rise, rand(0.4, 0.9));
      w.lp.frequency.setTargetAtTime(rand(1100, 1900), t, rise / 3);
      w.lp.frequency.setTargetAtTime(rand(360, 520), t + rise, 0.5);
      w.p.pan.setTargetAtTime(rand(-0.45, 0.45), t, 1);
      if (Math.random() < 0.4) { slapP.pan.setValueAtTime(rand(-0.5, 0.5), t + rise); click(e, t + rise, rand(0.03, 0.06), 0.5 * peak, slapBP, "pink"); }
    };
    return {
      tick(now, to, lvl) {
        k.every("lapA", now, to, (f) => (f ? 0.05 : rand(2.0, 4.8)), (t) => lap(a, t, lvl));
        k.every("lapB", now, to, (f) => (f ? rand(0.8, 2) : rand(2.6, 6.0)), (t) => lap(b, t, lvl * 0.7));
        k.every("glug", now, to, () => expo(1 / (0.12 + 0.35 * lvl)), (t) => bubble(e, t, rand(260, 700), rand(0.03, 0.1), rand(-0.7, 0.7), out, rand(1.2, 1.5), rand(0.06, 0.12)));
      },
    };
  };

  // A car passing at a distance: band-passed pink noise swelling and fading, its band dropping as it passes
  // (doppler-ish), panned across.
  function carVoice(e, t, dest, send) {
    const ctx = e.ctx, D = rand(3.5, 7), truck = Math.random() < 0.2, dir = Math.random() < 0.5 ? -1 : 1;
    const fc = truck ? rand(280, 380) : rand(620, 950), peak = rand(0.1, 0.32) * (truck ? 1.4 : 1);
    const s = noiseSrc(e, truck ? "brown" : "pink", t, D + 0.3);
    const bp = filt(ctx, "bandpass", fc * 1.12, 0.5), lp = filt(ctx, "lowpass", 1500, 0.6), g = gainN(ctx, 0), p = panN(ctx, -0.8 * dir);
    bp.frequency.setValueAtTime(fc * 1.12, t + D * 0.42);
    bp.frequency.linearRampToValueAtTime(fc * 0.86, t + D * 0.6);
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(peak, t, D * 0.17);
    g.gain.setTargetAtTime(0, t + D * 0.52, D * 0.14);
    p.pan.setValueAtTime(-0.8 * dir, t);
    p.pan.linearRampToValueAtTime(0.8 * dir, t + D);
    s.connect(bp); bp.connect(lp); lp.connect(g); g.connect(p); p.connect(dest); p.connect(send);
    s.onended = () => [s, bp, lp, g, p].forEach(disc);
  }
  // A far car horn: two square tones a major third apart, heavily low-passed, one or two taps, mostly reverb.
  function hornVoice(e, t, dest, send) {
    const ctx = e.ctx, f1 = rand(370, 420), taps = Math.random() < 0.5 ? 1 : 2;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = o2.type = "square"; o1.frequency.value = f1; o2.frequency.value = f1 * 1.26;
    const lp = filt(ctx, "lowpass", 800, 1), g = gainN(ctx, 0), p = panN(ctx, rand(-0.8, 0.8));
    let tt = t;
    for (let i = 0; i < taps; i++) {
      const d = rand(0.15, 0.45);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.035, tt + 0.02);
      g.gain.setValueAtTime(0.035, tt + d); g.gain.linearRampToValueAtTime(0, tt + d + 0.04);
      tt += d + rand(0.12, 0.25);
    }
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(p); p.connect(dest); p.connect(send);
    o1.start(t); o2.start(t); o1.stop(tt + 0.1); o2.stop(tt + 0.1);
    o1.onended = () => [o1, o2, lp, g, p].forEach(disc);
  }

  // City: a low rumble and a distant traffic wash that drifts, cars swelling past, the occasional far horn.
  BUILD.city = (e, out, k) => {
    k.chain(k.noise("brown", 0.7), k.f("lowpass", 140, 0.7), k.g(0.75), out);
    const bedLP = k.f("lowpass", 700, 0.5), bedG = k.g(0.25);
    k.chain(k.noise("pink"), k.f("highpass", 90), bedLP, bedG, out);
    const send = k.send(0.35);
    return {
      tick(now, to, lvl) {
        k.every("drift", now, to, () => rand(3, 8), (t) => { bedG.gain.setTargetAtTime(rand(0.15, 0.35), t, 2); bedLP.frequency.setTargetAtTime(rand(550, 900), t, 2); });
        k.every("car", now, to, (f) => (f ? rand(0.1, 1) : 0.8 + expo(1 / (0.08 + 0.25 * lvl))), (t) => carVoice(e, t, out, send));
        k.every("horn", now, to, (f) => (f ? rand(10, 40) : rand(35, 110)), (t) => { if (lvl > 0.15) hornVoice(e, t, out, send); });
      },
    };
  };

  // Room tone: the near-silence of a room (low air, a faint broadband hiss), very quiet.
  BUILD.room = (e, out, k) => {
    k.chain(k.noise("pink", 0.8), k.f("highpass", 35), k.f("lowpass", 260, 0.6), k.g(0.6), out);
    const air = k.g(0.04);
    k.chain(k.noise("white"), k.f("bandpass", 3000, 0.4), air, out);
    return { tick(now, to) { k.every("drift", now, to, () => rand(4, 10), (t) => air.gain.setTargetAtTime(rand(0.025, 0.05), t, 3)); } };
  };

  // Space: a ship's low hum, two detuned triangles panned apart beating slowly, a fifth and an octave above, with
  // ventilation noise and a slowly breathing low-pass.
  BUILD.space = (e, out, k) => {
    const lp = k.f("lowpass", 240, 0.8), hum = k.g(0.5);
    k.chain(lp, hum, out);
    const a = k.osc("triangle", 55), b = k.osc("triangle", 55.31), pa = k.p(-0.45), pb = k.p(0.45);
    a.connect(pa); pa.connect(lp); b.connect(pb); pb.connect(lp);
    const c = k.osc("sine", 110.17), cg = k.g(0.25); c.connect(cg); cg.connect(lp);
    const d1 = k.osc("sine", 82.41), d2 = k.osc("sine", 82.63), dg = k.g(0.12); d1.connect(dg); d2.connect(dg); dg.connect(lp);
    k.lfo(0.043, 70, lp.frequency);
    k.chain(k.noise("brown"), k.f("lowpass", 320, 0.6), k.g(0.35), out);
    k.chain(k.noise("pink", 0.9), k.f("bandpass", 1800, 0.6), k.g(0.03), out);
    return { tick(now, to) { k.every("swell", now, to, () => rand(6, 16), (t) => hum.gain.setTargetAtTime(rand(0.38, 0.62), t, 3)); } };
  };

  // Birds: a few individuals, each a species with a characteristic phrase it repeats with small variations, at its
  // own place and distance (level, low-pass, reverb). A phrase is one sine whose pitch and level are automated per
  // syllable (whistles, sweeps, trills, chips, warbles with FM).
  const SPECIES = [
    { // two- or three-note clear whistle ("fee-bee")
      f: [3300, 4100], make(b) {
        const f = b.f, s = [[0, rand(0.26, 0.34), f, f * 0.98, 1], [0.42, rand(0.22, 0.3), f * 0.84, f * 0.82, 0.85]];
        if (Math.random() < 0.4) s.push([0.78, 0.2, f * 0.84, f * 0.83, 0.7]);
        return s;
      },
    },
    { // a fast trill of rising sweeps
      f: [3000, 4200], make(b) {
        const n = 7 + ((Math.random() * 8) | 0), d = rand(0.045, 0.06), gap = rand(0.018, 0.03), s = [];
        for (let i = 0; i < n; i++) s.push([i * (d + gap), d, b.f * (1 + 0.01 * i), b.f * 1.35, 0.6 + 0.4 * Math.sin((Math.PI * i) / n)]);
        return s;
      },
    },
    { // a caroling phrase of warbled notes
      f: [2000, 3000], fm: true, make(b) {
        const n = 3 + ((Math.random() * 4) | 0), s = []; let t = 0;
        for (let i = 0; i < n; i++) {
          const d = rand(0.1, 0.22), f = b.f * pick([1, 1.12, 1.26, 0.9, 1.33]);
          s.push([t, d, f, f * rand(0.92, 1.08), rand(0.6, 1), true]);
          t += d + rand(0.05, 0.12);
        }
        return s;
      },
    },
    { // short dry chips
      f: [5200, 6800], make(b) {
        const n = 2 + ((Math.random() * 5) | 0), s = [];
        for (let i = 0; i < n; i++) s.push([i * rand(0.12, 0.2), 0.028, b.f, b.f * 0.65, rand(0.5, 1)]);
        return s;
      },
    },
  ];
  function newBird() {
    const sp = pick(SPECIES);
    return { sp, f: rand(sp.f[0], sp.f[1]), pan: rand(-0.9, 0.9), dist: rand(0.15, 1), fm: rand(22, 38), w: rand(0.5, 1.5) };
  }
  function birdSong(e, t, b, dest) {
    const ctx = e.ctx, syl = b.sp.make(b), amp = 0.5 * (1 - 0.7 * b.dist);
    const o = ctx.createOscillator(), g = gainN(ctx, 0), lp = filt(ctx, "lowpass", 10000 - 5500 * b.dist, 0.7), p = panN(ctx, b.pan);
    const send = gainN(ctx, 0.1 + 0.4 * b.dist);
    o.connect(g); g.connect(lp); lp.connect(p); p.connect(dest); p.connect(send); send.connect(e.rev);
    let fmO = null, fmG = null;
    if (b.sp.fm) { fmO = ctx.createOscillator(); fmO.frequency.value = b.fm; fmG = gainN(ctx, 0); fmO.connect(fmG); fmG.connect(o.frequency); }
    let end = t;
    for (const [off, d, f0, f1, a, fm] of syl) {
      const ts = t + off;
      o.frequency.setValueAtTime(f0, ts);
      o.frequency.exponentialRampToValueAtTime(f1, ts + d);
      g.gain.setValueAtTime(0, ts);
      g.gain.linearRampToValueAtTime(a * amp, ts + Math.min(0.012, d * 0.25));
      g.gain.linearRampToValueAtTime(a * amp * 0.8, ts + d * 0.75);
      g.gain.linearRampToValueAtTime(0, ts + d);
      if (fmG) fmG.gain.setValueAtTime(fm ? f0 * rand(0.05, 0.1) : 0, ts);
      end = Math.max(end, ts + d);
    }
    o.start(t); o.stop(end + 0.05);
    if (fmO) { fmO.start(t); fmO.stop(end + 0.05); }
    o.onended = () => [o, g, lp, p, send, fmO, fmG].forEach((n) => n && disc(n));
  }
  BUILD.birds = (e, out, k) => {
    const birds = [newBird(), newBird(), newBird(), newBird()];
    return {
      tick(now, to, lvl) {
        k.every("song", now, to, (f) => (f ? rand(0.15, 0.6) : expo(1 / (0.1 + 0.45 * lvl)) + 0.25), (t) => {
          let r = Math.random() * birds.reduce((s, b) => s + b.w, 0), i = 0;
          while (r > birds[i].w && i < birds.length - 1) r -= birds[i++].w;
          if (Math.random() < 0.04) birds[i] = newBird(); // one flies off, another arrives
          birdSong(e, t, birds[i], out);
        });
      },
    };
  };

  // Crickets: individuals at fixed places and distances, each chirping in its own steady rhythm (rate from the
  // temperature, Dolbear's law), with the odd rest; level sets how many are singing. Behind them a faint far chorus
  // (narrow-band noise around 4.4 kHz, pulsed).
  BUILD.crickets = (e, out, k) => {
    const bufs = chirpBuffers(e.ctx), N = 6, rev = k.send(1);
    const crs = [];
    for (let i = 0; i < N; i++) {
      const d = i === 0 ? 0.15 : rand(0.15, 1), g = k.g((1 - 0.75 * d) * rand(0.6, 1)), lp = k.f("lowpass", 9500 - 4500 * d, 0.7), p = k.p(rand(-0.95, 0.95)), s = k.g(0.1 + 0.3 * d);
      g.connect(lp); lp.connect(p); p.connect(out); p.connect(s); s.connect(rev);
      crs.push({ i, g, buf: pick(bufs), rate: rand(0.97, 1.03), jit: rand(0.9, 1.1) });
    }
    const am = k.g(0.5), chorus = k.g(0);
    k.chain(k.noise("white"), k.f("bandpass", 4400, 25), am, chorus, out);
    k.lfo(29, 0.5, am.gain);
    let shown = -1;
    return {
      tick(now, to, lvl) {
        if (Math.abs(lvl - shown) > 0.02) { shown = lvl; chorus.gain.setTargetAtTime(0.9 * lvl, now, 1.5); }
        const perSec = clamp(0.7 + (num(e.env.tempC, 18) - 10) * 0.13, 0.6, 3.2);
        const active = Math.max(1, Math.round(1 + lvl * (N - 1)));
        for (const c of crs) {
          if (c.i >= active) continue;
          k.every("c" + c.i, now, to, (f) => (f ? rand(0.02, 0.5) : Math.random() < 0.04 ? rand(2, 6) : (c.jit / perSec) * rand(0.97, 1.03)), (t) => {
            const s = e.ctx.createBufferSource();
            s.buffer = c.buf; s.playbackRate.value = c.rate;
            s.connect(c.g); s.start(t);
            s.onended = () => disc(s);
          });
        }
      },
    };
  };

  // Forest: leaf rustle. Three decorrelated high-passed noise chains whose level is a rapid random grain envelope
  // (many small leaf collisions) scaled by a slower gust; a soft canopy band underneath; the odd twig tick.
  BUILD.forest = (e, out, k) => {
    const mk = (pan) => { const g = k.g(0); k.chain(k.noise("pink", rand(0.95, 1.05)), k.f("highpass", 1100, 0.6), k.f("lowpass", 7500, 0.5), g, k.p(pan), out); return g; };
    const rs = [mk(-0.6), mk(0.6), mk(0)];
    const canopyBP = k.f("bandpass", 480, 0.6), canopy = k.g(0.25);
    k.chain(k.noise("pink", 0.9), canopyBP, canopy, out);
    const twig = k.f("bandpass", 2800, 1.5), twigP = k.p(0);
    twig.connect(twigP); twigP.connect(out);
    let gust = 0.5;
    return {
      tick(now, to, lvl) {
        k.every("gust", now, to, (f) => (f ? 0.02 : rand(1.5, 5)), (t) => {
          gust = clamp(0.25 + 0.75 * Math.random());
          canopy.gain.setTargetAtTime(0.1 + 0.3 * gust, t, 1.2);
          canopyBP.frequency.setTargetAtTime(380 + 260 * gust, t, 1.5);
        });
        rs.forEach((g, i) => k.every("r" + i, now, to, () => rand(0.04, 0.16), (t) => g.gain.setTargetAtTime(gust * Math.pow(Math.random(), 1.8), t, rand(0.015, 0.05))));
        k.every("twig", now, to, (f) => (f ? rand(1, 6) : rand(5, 18)), (t) => {
          twigP.pan.setValueAtTime(rand(-0.8, 0.8), t);
          const n = 1 + ((Math.random() * 3) | 0);
          for (let i = 0; i < n; i++) click(e, t + i * rand(0.03, 0.09), rand(0.002, 0.006), rand(0.1, 0.3), twig);
        });
      },
    };
  };

  // Magic: a soft shimmering pad (a wide open D chord, each note a pair of slightly detuned oscillators panned
  // apart, each breathing in and out on its own), a band of airy noise, and occasional sparkles: high pentatonic
  // pings with a faint inharmonic partial and a long reverb tail.
  const PENT = [293.66, 329.63, 369.99, 440, 493.88];
  function sparkle(e, t, dest, send) {
    const ctx = e.ctx, f = pick(PENT) * pick([4, 4, 8]), d = rand(0.5, 1.4), peak = rand(0.02, 0.06);
    const p = panN(ctx, rand(-0.8, 0.8)), g = gainN(ctx, 0), g2 = gainN(ctx, 0);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.frequency.value = f; o2.frequency.value = f * 2.76;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.005); g.gain.setTargetAtTime(0, t + 0.005, d / 4);
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(peak * 0.15, t + 0.003); g2.gain.setTargetAtTime(0, t + 0.003, d / 10);
    o.connect(g); o2.connect(g2); g.connect(p); g2.connect(p); p.connect(dest); p.connect(send);
    o.start(t); o2.start(t); o.stop(t + d + 0.1); o2.stop(t + d + 0.1);
    o.onended = () => [o, o2, g, g2, p].forEach(disc);
  }
  BUILD.magic = (e, out, k) => {
    const lp = k.f("lowpass", 2200, 0.5), pad = k.g(0.6), send = k.send(0.6);
    lp.connect(pad); pad.connect(out); pad.connect(send);
    const voices = [146.83, 220, 329.63, 369.99, 554.37].map((f, i) => {
      const g = k.g(0), a = k.osc(i < 2 ? "triangle" : "sine", f, -rand(2, 5)), b = k.osc("sine", f, rand(2, 5)), pa = k.p(-0.55), pb = k.p(0.55);
      a.connect(pa); b.connect(pb); pa.connect(g); pb.connect(g); g.connect(lp);
      return g;
    });
    const air = k.g(0.03);
    k.chain(k.noise("white"), k.f("bandpass", 7500, 1.2), air, out);
    air.connect(send);
    const ssend = k.send(0.9);
    return {
      tick(now, to, lvl) {
        k.every("breathe", now, to, (f) => (f ? 0.02 : rand(2.5, 7)), (t) => voices.forEach((g, i) => {
          if (Math.random() < 0.6) g.gain.setTargetAtTime(rand(0.05, 0.3) * (i === 0 ? 1.2 : 1), t, rand(1, 3.5));
        }));
        k.every("air", now, to, () => rand(2, 6), (t) => air.gain.setTargetAtTime(rand(0.01, 0.045), t, 2));
        k.every("sparkle", now, to, (f) => (f ? rand(0.1, 0.8) : expo(1 / (0.12 + 0.5 * lvl))), (t) => {
          const n = 1 + ((Math.random() * 4) | 0);
          for (let i = 0; i < n; i++) sparkle(e, t + i * rand(0.06, 0.2), out, ssend);
        });
      },
    };
  };

  // Per-layer loudness at level 1 (calibrated so the layers sit together; see tests/test_audio.py).
  // Targets at master 1 (volume 1, ambient), output RMS: rain -20 dBFS, wind -22, fire -21, water -23, city -24,
  // birds -28 (sparse; phrases peak near -18), crickets -27, forest -24, space -25, magic -26, room -38.
  const CAL = { rain: 0.131, wind: 0.13, fire: 0.146, water: 0.222, city: 0.116, birds: 0.272, crickets: 0.171, forest: 0.28, room: 0.044, space: 0.066, magic: 0.19 };
  // Cue loudness (loudest 50 ms at master 1, distance 0.3): thunder -10 dBFS, hover -15, train -14, loon -16,
  // owl / chime / drip -18, page -20, distant bell -22, ward -16; pop peaks near -10. (Recorded cues carry their
  // own level in the manifest's per-file gain instead.)
  const CUE_CAL = { thunder: 0.457, train: 0.224, loon: 0.193, owl: 0.15, pop: 0.4, chime: 0.35, drip: 0.38, page: 0.65, distant_bell: 0.575, hover: 0.245, ward: 0.5 };
  const levelGain = (name, v) => (v <= 0 ? 0 : CAL[name] * Math.pow(v, 1.3));
  const volGain = (v) => clamp(v) * clamp(v); // perceptual-ish: 0.5 = -12 dB

  // ---------------------------------------------------------------- cues
  // CUE[name](e, t, o) -> end time. o: { gain, pan, distance 0 (here) .. 1 (far), delay, ... }.
  const CUE = {};

  // Thunder: a brown-noise rumble rolling in several irregular bursts, low-passed darker with distance and over
  // its own length, with a sub layer; near strikes start with a tearing crack. Sound lags light: with no explicit
  // `delay` it arrives distance x 5 s after the call, so call it on the flash.
  CUE.thunder = (e, t, o) => {
    const ctx = e.ctx, d = o.distance, g = o.gain * (1 - 0.6 * d);
    const t0 = t + (o.delay != null ? Math.max(0, +o.delay || 0) : d * 5);
    const dur = 5 + 7 * d + rand(0, 3);
    const src = noiseSrc(e, "brown", t0, dur + 4), sub = noiseSrc(e, "brown", t0, dur + 4, 0.5);
    const f0 = 1800 - 1350 * d, lp = filt(ctx, "lowpass", f0, 0.5), slp = filt(ctx, "lowpass", 90, 0.7), sg = gainN(ctx, 1.2);
    lp.frequency.setValueAtTime(f0, t0);
    lp.frequency.setTargetAtTime(f0 * 0.35, t0 + 0.3, dur * 0.35);
    const env = gainN(ctx, 0), p = panN(ctx, o.pan * (1 - 0.5 * d)), send = gainN(ctx, 0.35 + 0.3 * d);
    src.connect(lp); lp.connect(env); sub.connect(slp); slp.connect(sg); sg.connect(env);
    env.connect(p); p.connect(e.cueBus); p.connect(send); send.connect(e.rev);
    env.gain.setValueAtTime(0, t0);
    let tt = t0;
    const rolls = 3 + ((Math.random() * 5) | 0);
    for (let i = 0; i < rolls; i++) {
      const peak = g * (i === 0 ? rand(0.7, 1) : rand(0.3, 0.9) * Math.pow(0.82, i));
      env.gain.setTargetAtTime(peak, tt, rand(0.03, 0.12) + d * 0.15);
      env.gain.setTargetAtTime(peak * rand(0.25, 0.5), tt + rand(0.12, 0.35), rand(0.3, 0.9));
      tt += rand(0.35, 1.6) * (0.7 + d);
    }
    env.gain.setTargetAtTime(0, tt, dur * 0.18);
    const nodes = [src, sub, lp, slp, sg, env, p, send];
    if (d < 0.45) { // the crack of a near strike: a fast run of bright clicks
      const hp = filt(ctx, "highpass", 1100, 0.6), cp = panN(ctx, o.pan);
      hp.connect(cp); cp.connect(e.cueBus); cp.connect(send);
      const a = g * ((0.45 - d) / 0.45);
      let tc = t0;
      for (let i = 0, n = 5 + ((Math.random() * 7) | 0); i < n; i++) { click(e, tc, rand(0.004, 0.03), a * rand(0.3, 1), hp); tc += rand(0.006, 0.04); }
      nodes.push(hp, cp);
    }
    const end = Math.max(tt, t0 + dur) + 4;
    e.after(end, nodes);
    return end;
  };

  // Train: a passing train. Whoosh (band-passed pink), rumble (low brown) and a diesel tone swell to the passing
  // point; the bands and the tone drop in pitch as it passes (doppler-ish) while it pans across; wheel clacks in
  // bogie pairs ("clack-clack ... clack-clack") follow the same envelope.
  CUE.train = (e, t, o) => {
    const ctx = e.ctx, D = rand(12, 16), d = o.distance, g = o.gain * (1 - 0.55 * d), dir = o.pan ? Math.sign(o.pan) : Math.random() < 0.5 ? -1 : 1;
    const mid = t + D * 0.5;
    const env = gainN(ctx, 0), lpD = filt(ctx, "lowpass", 3200 - 2200 * d, 0.6), p = panN(ctx, -0.9 * dir), send = gainN(ctx, 0.2);
    env.gain.setValueAtTime(0, t);
    env.gain.setTargetAtTime(g, t, D * 0.16);
    env.gain.setTargetAtTime(0, mid + 0.6, D * 0.13);
    p.pan.setValueAtTime(-0.9 * dir, t); p.pan.linearRampToValueAtTime(0.9 * dir, t + D);
    env.connect(lpD); lpD.connect(p); p.connect(e.cueBus); p.connect(send); send.connect(e.rev);
    const w = noiseSrc(e, "pink", t, D + 0.5), bp = filt(ctx, "bandpass", 700, 0.6), wg = gainN(ctx, 0.9);
    bp.frequency.setValueAtTime(700, t); bp.frequency.linearRampToValueAtTime(1050, mid - 0.3); bp.frequency.linearRampToValueAtTime(560, mid + 0.7);
    w.connect(bp); bp.connect(wg); wg.connect(env);
    const r = noiseSrc(e, "brown", t, D + 0.5), rlp = filt(ctx, "lowpass", 180, 0.7), rg = gainN(ctx, 1.3);
    r.connect(rlp); rlp.connect(rg); rg.connect(env);
    const eo = ctx.createOscillator(), elp = filt(ctx, "lowpass", 260, 0.8), eg = gainN(ctx, 0.12);
    eo.type = "sawtooth";
    eo.frequency.setValueAtTime(58 * 1.04, t); eo.frequency.setValueAtTime(58 * 1.04, mid - 0.8); eo.frequency.linearRampToValueAtTime(58 * 0.96, mid + 0.8);
    eo.connect(elp); elp.connect(eg); eg.connect(env); eo.start(t); eo.stop(t + D + 0.5);
    const cb = filt(ctx, "bandpass", 1500, 1.2), cg = gainN(ctx, 1);
    cb.connect(cg); cg.connect(env);
    const per = rand(0.9, 1.25);
    for (let tc = t + D * 0.12; tc < t + D * 0.88; tc += per) {
      click(e, tc, rand(0.008, 0.015), rand(0.4, 0.8), cb);
      click(e, tc + 0.11, rand(0.008, 0.015), rand(0.4, 0.8), cb);
    }
    const end = t + D + 3;
    e.after(end, [env, lpD, p, send, w, bp, wg, r, rlp, rg, eo, elp, eg, cb, cg]);
    return end;
  };

  // Loon: three harmonics sharing one pitch (a ConstantSource drives all three frequencies) with vibrato, through a
  // lake echo (reverb plus a dark feedback delay). "wail": the rising, breaking three-part call; "tremolo": the
  // quavering laugh (fast pitch and level wobble).
  CUE.loon = (e, t, o) => {
    const ctx = e.ctx, kind = o.kind || (Math.random() < 0.7 ? "wail" : "tremolo"), d = o.distance, g = o.gain * (0.5 - 0.25 * d);
    const cs = ctx.createConstantSource(), vg = gainN(ctx, 0), lp = filt(ctx, "lowpass", 2600 - 1200 * d, 0.7), p = panN(ctx, o.pan), send = gainN(ctx, 0.6 + 0.3 * d);
    const nodes = [cs, vg, lp, p, send];
    cs.offset.value = 0;
    [[1, 1], [2, 0.22], [3, 0.07]].forEach(([h, a]) => {
      const os = ctx.createOscillator(), hg = gainN(ctx, h), ag = gainN(ctx, a);
      os.frequency.value = 0; cs.connect(hg); hg.connect(os.frequency); os.connect(ag); ag.connect(vg);
      os.start(t); os.stop(t + 6); nodes.push(os, hg, ag);
    });
    const am = gainN(ctx, 1);
    vg.connect(am); am.connect(lp); lp.connect(p); p.connect(e.cueBus); p.connect(send); send.connect(e.rev);
    const dl = ctx.createDelay(1), fb = gainN(ctx, 0.28), dlp = filt(ctx, "lowpass", 1400, 0.7), dout = gainN(ctx, 0.3);
    p.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(dout); dout.connect(e.cueBus);
    dl.delayTime.value = rand(0.35, 0.6);
    nodes.push(am, dl, fb, dlp, dout);
    const vib = ctx.createOscillator(), vibG = gainN(ctx, 0);
    vib.frequency.value = rand(4.8, 5.6); vib.connect(vibG); vibG.connect(cs.offset); vib.start(t); vib.stop(t + 6);
    nodes.push(vib, vibG);
    let end;
    if (kind === "tremolo") {
      const f = rand(820, 980), D = rand(1.6, 2.4);
      cs.offset.setValueAtTime(f * 0.92, t); cs.offset.linearRampToValueAtTime(f, t + 0.3); cs.offset.linearRampToValueAtTime(f * 0.95, t + D);
      const tr = ctx.createOscillator(), tf = gainN(ctx, f * 0.06), ta = gainN(ctx, 0.4);
      tr.frequency.value = rand(8.5, 10); tr.connect(tf); tf.connect(cs.offset); tr.connect(ta); ta.connect(am.gain);
      am.gain.value = 0.6; tr.start(t); tr.stop(t + D + 0.5); nodes.push(tr, tf, ta);
      vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(g, t + 0.15); vg.gain.setTargetAtTime(g * 0.8, t + 0.5, 0.5); vg.gain.setTargetAtTime(0, t + D, 0.12);
      end = t + D + 4;
    } else {
      const s = rand(0.92, 1.08);
      cs.offset.setValueAtTime(520 * s, t);
      cs.offset.setTargetAtTime(690 * s, t + 0.02, 0.09);
      cs.offset.setTargetAtTime(950 * s, t + 1.45, 0.06);
      cs.offset.setTargetAtTime(900 * s, t + 2.3, 0.6);
      cs.offset.setTargetAtTime(700 * s, t + 3.25, 0.08);
      cs.offset.setTargetAtTime(630 * s, t + 3.6, 0.6);
      vibG.gain.setValueAtTime(0, t); vibG.gain.linearRampToValueAtTime(6 * s, t + 0.9);
      vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(g, t + 0.15);
      vg.gain.setTargetAtTime(g * 0.6, t + 1.38, 0.03); vg.gain.setTargetAtTime(g, t + 1.48, 0.04);
      vg.gain.setTargetAtTime(g * 0.55, t + 3.18, 0.03); vg.gain.setTargetAtTime(g * 0.85, t + 3.28, 0.05);
      vg.gain.setTargetAtTime(0, t + 4.2, 0.25);
      end = t + 9;
    }
    cs.start(t); cs.stop(t + 6);
    e.after(end, nodes);
    return end;
  };

  // Owl: soft hoots, a sine with a whisper of second harmonic and breath (noise band-passed at the pitch), each hoot
  // falling slightly. Great horned rhythm ("hoo, h'hoo-hoo, hoooo, hoo") or a plainer pair.
  CUE.owl = (e, t, o) => {
    const ctx = e.ctx, d = o.distance, g = o.gain * (0.45 - 0.2 * d), f = o.freq || rand(290, 360);
    const pat = Math.random() < 0.6 ? [[0, 0.32], [0.62, 0.13], [0.8, 0.16], [1.25, 0.5], [1.95, 0.38]] : [[0, 0.45], [0.75, 0.6]];
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), h2 = gainN(ctx, 0.08), vg = gainN(ctx, 0);
    const br = noiseSrc(e, "white", t, 3), bbp = filt(ctx, "bandpass", f, 3), bg = gainN(ctx, 2.5);
    const lp = filt(ctx, "lowpass", 1400 - 600 * d, 0.7), p = panN(ctx, o.pan), send = gainN(ctx, 0.4 + 0.4 * d);
    o2.connect(h2); o1.connect(vg); h2.connect(vg); br.connect(bbp); bbp.connect(bg); bg.connect(vg);
    vg.connect(lp); lp.connect(p); p.connect(e.cueBus); p.connect(send); send.connect(e.rev);
    for (const [off, dur] of pat) {
      const ts = t + off;
      o1.frequency.setValueAtTime(f * 1.02, ts); o1.frequency.linearRampToValueAtTime(f * 0.94, ts + dur);
      o2.frequency.setValueAtTime(f * 2.04, ts); o2.frequency.linearRampToValueAtTime(f * 1.88, ts + dur);
      vg.gain.setValueAtTime(0, ts); vg.gain.setTargetAtTime(g, ts, 0.03); vg.gain.setTargetAtTime(0, ts + dur, 0.05);
    }
    o1.start(t); o2.start(t); o1.stop(t + 3); o2.stop(t + 3);
    e.after(t + 5, [o1, o2, h2, vg, br, bbp, bg, lp, p, send]);
    return t + 5;
  };

  CUE.pop = (e, t, o) => popVoice(e, t, { gain: o.gain * 0.8, pan: o.pan }, e.cueBus);

  // Chime: a struck metal bar (inharmonic partials 1, 2.76, 5.40 with shorter decays up the series, a detuned twin
  // on the fundamental for shimmer), sometimes answered by a second bar.
  CUE.chime = (e, t, o) => {
    const ctx = e.ctx, notes = o.notes || (Math.random() < 0.5 ? 1 : 2);
    const p = panN(ctx, o.pan), send = gainN(ctx, 0.45), nodes = [p, send];
    p.connect(e.cueBus); p.connect(send); send.connect(e.rev);
    let end = t;
    for (let n = 0; n < notes; n++) {
      const ts = t + (n ? rand(0.15, 0.5) : 0), f = n === 0 && o.freq ? o.freq : pick([587.33, 659.25, 783.99, 880, 987.77, 1174.66]);
      const s = rand(0.8, 1.2), amp = o.gain * 0.22 * (1 - 0.5 * o.distance) * (n ? 0.6 : 1);
      [[1, 1, 2.8], [1.0015, 0.5, 2.6], [2.756, 0.35, 1.2], [5.404, 0.12, 0.5]].forEach(([r, a, dec]) => {
        const os = ctx.createOscillator(), g = gainN(ctx, 0);
        os.frequency.value = f * r;
        g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(amp * a, ts + 0.002); g.gain.setTargetAtTime(0, ts + 0.002, (dec * s) / 4);
        os.connect(g); g.connect(p); os.start(ts); os.stop(ts + dec * s + 0.1);
        nodes.push(os, g);
        end = Math.max(end, ts + dec * s + 2.5);
      });
    }
    e.after(end, nodes);
    return end;
  };

  // Drip: a drop into water: a tiny impact click and a bubble whose pitch rises fast, in a small resonant space.
  CUE.drip = (e, t, o) => {
    const ctx = e.ctx, p = panN(ctx, o.pan), send = gainN(ctx, 0.5), hp = filt(ctx, "highpass", 2000, 0.7);
    p.connect(e.cueBus); p.connect(send); send.connect(e.rev); hp.connect(p);
    const a = o.gain * 0.45 * (1 - 0.5 * o.distance);
    click(e, t, 0.0015, a * 0.3, hp);
    bubble(e, t + 0.001, rand(900, 1600), a, 0, p, rand(1.8, 2.6), rand(0.05, 0.09));
    e.after(t + 2.5, [p, send, hp]);
    return t + 2.5;
  };

  // Page: a page turned: a rising-then-falling whoosh of air, a crinkle of tiny paper grains, a soft landing.
  CUE.page = (e, t, o) => {
    const ctx = e.ctx, D = rand(0.45, 0.8), a = o.gain * (1 - 0.5 * o.distance);
    const p = panN(ctx, o.pan), send = gainN(ctx, 0.1);
    p.connect(e.cueBus); p.connect(send); send.connect(e.rev);
    const w = noiseSrc(e, "pink", t, D + 0.2), wlp = filt(ctx, "lowpass", 800, 0.7), wg = gainN(ctx, 0);
    wlp.frequency.setValueAtTime(800, t); wlp.frequency.linearRampToValueAtTime(2600, t + D * 0.45); wlp.frequency.linearRampToValueAtTime(900, t + D);
    wg.gain.setValueAtTime(0, t); wg.gain.linearRampToValueAtTime(0.3 * a, t + D * 0.4); wg.gain.linearRampToValueAtTime(0, t + D);
    w.connect(wlp); wlp.connect(wg); wg.connect(p);
    const cbp = filt(ctx, "bandpass", 3200, 0.9);
    cbp.connect(p);
    for (let i = 0, n = 14 + ((Math.random() * 12) | 0); i < n; i++) {
      const x = Math.random();
      click(e, t + x * D, rand(0.003, 0.012), a * rand(0.1, 0.45) * Math.sin(Math.PI * x), cbp);
    }
    const tl = filt(ctx, "lowpass", 300, 0.7);
    tl.connect(p);
    click(e, t + D, 0.03, a * 0.5, tl, "brown");
    e.after(t + D + 1, [p, send, w, wlp, wg, cbp, tl]);
    return t + D + 1;
  };

  // Distant bell: a church bell far off: the bell's partials (hum, prime, tierce, quint, nominal, ...) each with
  // its own long decay and a slow beat, low-passed by distance, mostly reverb. `count` strikes, 2.2 s apart.
  CUE.distant_bell = (e, t, o) => {
    const ctx = e.ctx, d = o.distance, nom = o.freq || rand(380, 520), count = Math.max(1, Math.min(12, o.count || 1));
    const lp = filt(ctx, "lowpass", 2000 - 1100 * d, 0.6), p = panN(ctx, o.pan), send = gainN(ctx, 0.7);
    lp.connect(p); p.connect(e.cueBus); p.connect(send); send.connect(e.rev);
    const nodes = [lp, p, send], amp = o.gain * 0.09 * (1 - 0.5 * d);
    const parts = [[0.5, 0.5, 8], [1, 0.6, 6], [1.2, 0.5, 5], [1.5, 0.3, 3], [2, 0.8, 3.5], [2.5, 0.3, 2], [2.67, 0.2, 1.8], [3, 0.2, 1.5], [4.2, 0.1, 1]];
    let end = t;
    for (let c = 0; c < count; c++) {
      const ts = t + c * 2.2;
      for (const [r, a, dec] of parts) {
        const os = ctx.createOscillator(), g = gainN(ctx, 0);
        os.frequency.value = nom * r * (1 + rand(-0.0015, 0.0015));
        g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(amp * a, ts + 0.004); g.gain.setTargetAtTime(0, ts + 0.004, dec / 4);
        os.connect(g); g.connect(lp); os.start(ts); os.stop(ts + dec + 0.2);
        nodes.push(os, g);
        end = Math.max(end, ts + dec + 2.6);
      }
    }
    e.after(end, nodes);
    return end;
  };

  // Hover: an AV / ship passing: a low saw hum and a thin whine that drop in pitch as it passes, a whoosh band
  // that opens at the closest point, a felt sub thrum, all panned across.
  CUE.hover = (e, t, o) => {
    const ctx = e.ctx, D = rand(6, 9), d = o.distance, g = o.gain * (1 - 0.5 * d), dir = o.pan ? Math.sign(o.pan) : Math.random() < 0.5 ? -1 : 1;
    const mid = t + D * 0.5, f = rand(70, 95);
    const env = gainN(ctx, 0), p = panN(ctx, -0.9 * dir), send = gainN(ctx, 0.3), dlp = filt(ctx, "lowpass", 4000 - 2500 * d, 0.6);
    env.gain.setValueAtTime(0, t); env.gain.setTargetAtTime(g, t, D * 0.15); env.gain.setTargetAtTime(0, mid + 0.3, D * 0.12);
    p.pan.setValueAtTime(-0.9 * dir, t); p.pan.linearRampToValueAtTime(0.9 * dir, t + D);
    env.connect(dlp); dlp.connect(p); p.connect(e.cueBus); p.connect(send); send.connect(e.rev);
    const hum = ctx.createOscillator(), hlp = filt(ctx, "lowpass", 500, 0.9), hg = gainN(ctx, 0.25);
    hum.type = "sawtooth";
    const whine = ctx.createOscillator(), wg = gainN(ctx, 0.025);
    for (const [os, ff] of [[hum, f], [whine, f * 12.5]]) {
      os.frequency.setValueAtTime(ff * 1.06, t); os.frequency.setValueAtTime(ff * 1.06, mid - 0.6); os.frequency.linearRampToValueAtTime(ff * 0.94, mid + 0.6);
      os.start(t); os.stop(t + D + 0.3);
    }
    hlp.frequency.setValueAtTime(500, t); hlp.frequency.linearRampToValueAtTime(1300, mid); hlp.frequency.linearRampToValueAtTime(450, t + D);
    hum.connect(hlp); hlp.connect(hg); hg.connect(env); whine.connect(wg); wg.connect(env);
    const w = noiseSrc(e, "pink", t, D + 0.3), wbp = filt(ctx, "bandpass", 600, 0.6), wsg = gainN(ctx, 0.8);
    wbp.frequency.setValueAtTime(600, t); wbp.frequency.linearRampToValueAtTime(1500, mid); wbp.frequency.linearRampToValueAtTime(420, t + D);
    w.connect(wbp); wbp.connect(wsg); wsg.connect(env);
    const sub = ctx.createOscillator(), sg = gainN(ctx, 0.35);
    sub.frequency.value = 38; sub.connect(sg); sg.connect(env); sub.start(t); sub.stop(t + D + 0.3);
    const end = t + D + 3;
    e.after(end, [env, p, send, dlp, hum, hlp, hg, whine, wg, w, wbp, wsg, sub, sg]);
    return end;
  };

  // Ward: a magical ward crackling (an electric arc tamed): a buzzing saw an octave over mains hum, gated by a
  // fast random flutter, and dense bright crackle, swelling and dying away over about a second.
  CUE.ward = (e, t, o) => {
    const ctx = e.ctx, D = rand(0.7, 1.4), a = o.gain * (1 - 0.5 * o.distance);
    const p = panN(ctx, o.pan), send = gainN(ctx, 0.35 + 0.3 * o.distance), lp = filt(ctx, "lowpass", 7000 - 4000 * o.distance, 0.6);
    lp.connect(p); p.connect(e.cueBus); p.connect(send); send.connect(e.rev);
    const buzz = ctx.createOscillator(), bbp = filt(ctx, "bandpass", 1600, 1.2), bg = gainN(ctx, 0);
    buzz.type = "sawtooth"; buzz.frequency.value = rand(118, 122);
    buzz.connect(bbp); bbp.connect(bg); bg.connect(lp);
    bg.gain.setValueAtTime(0, t);
    for (let tt = t; tt < t + D; tt += rand(0.015, 0.05)) bg.gain.setValueAtTime(a * 0.25 * Math.random() * Math.sin(Math.PI * (tt - t) / D), tt);
    bg.gain.setValueAtTime(0, t + D);
    buzz.start(t); buzz.stop(t + D + 0.05);
    const hp = filt(ctx, "highpass", 2200, 0.7);
    hp.connect(lp);
    for (let tt = t; tt < t + D; tt += 0.002 + expo(0.012)) click(e, tt, rand(0.0008, 0.004), a * rand(0.1, 0.9) * Math.sin(Math.PI * (tt - t) / D), hp);
    e.after(t + D + 2.5, [p, send, lp, buzz, bbp, bg, hp]);
    return t + D + 2.5;
  };

  // ---------------------------------------------------------------- recorded samples
  // sounds/manifest.json: { layers: {slot: [{file, seconds, gain, weight, ...}]}, cues: {slot: [{file, seconds, gain,
  // kind?, count?}]} } (tools/process_sounds.py). Loaded lazily: nothing is fetched until a layer that maps to a slot
  // rises above OFF or a cue fires. Used over http(s) (the backend serves frontend/); file:// only with ?samples=1
  // (and a browser that allows file access); ?samples=0 or display.samples = false keeps the wall procedural.
  const SLOTS = ["rain-light", "rain-heavy", "rain-window", "wind-gentle", "wind-strong", "fire", "water", "city-night",
    "city-day", "town", "room", "cathedral", "space", "magic", "neon-buzz", "birds-forest", "birds-light", "crickets",
    "cicadas", "forest-rustle"];
  const one = (slot) => (v) => [[slot, v]];
  const HALF_PI = Math.PI / 2;
  // public layer name -> [[slot, level], ...]
  const ROUTE = {
    // rain: light drizzle below ~0.5, a downpour above (equal-power crossfade 0.35 .. 0.65)
    rain: (v) => { const s = sstep(0.35, 0.65, v) * HALF_PI; return [["rain-light", v * Math.cos(s)], ["rain-heavy", v * Math.sin(s)]]; },
    // wind: a gentle bed, the strong gusting recording blended in above ~0.6
    wind: (v) => [["wind-gentle", v * (1 - 0.3 * sstep(0.6, 1, v))], ["wind-strong", v * sstep(0.55, 0.95, v)]],
    // city: the night city or the day city by frame.day (crossfade through dusk / dawn)
    city: (v, day) => { const s = sstep(0.3, 0.7, day) * HALF_PI; return [["city-night", v * Math.cos(s)], ["city-day", v * Math.sin(s)]]; },
    birds: one("birds-forest"), forest: one("forest-rustle"), neon: one("neon-buzz"),
  };
  for (const n of ["fire", "water", "crickets", "room", "space", "magic", "rain-light", "rain-heavy", "rain-window",
    "wind-gentle", "wind-strong", "city-night", "city-day", "birds-light", "cicadas", "town", "cathedral"]) ROUTE[n] = one(n);
  // a theme that sends a split name itself takes over that split from the parent
  const SPLIT = { rain: ["rain-light", "rain-heavy"], wind: ["wind-gentle", "wind-strong"], city: ["city-night", "city-day"] };
  // what plays while a slot has no recording (file://, still loading, broken): [procedural layer, scale] or nothing
  const STANDIN = {
    "rain-light": ["rain", 1], "rain-heavy": ["rain", 1], "rain-window": ["rain", 0.8], "wind-gentle": ["wind", 1],
    "wind-strong": ["wind", 1], fire: ["fire", 1], water: ["water", 1], "city-night": ["city", 1], "city-day": ["city", 1],
    town: null, room: ["room", 1], cathedral: ["room", 1], space: ["space", 1], magic: ["magic", 1], "neon-buzz": null,
    "birds-forest": ["birds", 1], "birds-light": ["birds", 0.6], crickets: ["crickets", 1], cicadas: ["crickets", 0.6],
    "forest-rustle": ["forest", 1],
  };
  // cue name -> recording slot (n: the normalised options)
  const CUE_SLOT = {
    thunder: (n) => (n.distance < 0.45 ? "thunder-near" : "thunder-far"),
    train: () => "train-pass", hover: () => "hover-pass", loon: () => "loon", owl: () => "owl", pop: () => "fire-pop",
    chime: () => "chime", drip: () => "drip", page: () => "page-turn", ward: () => "ward-crackle",
    distant_bell: (n) => (n.small || (num(n.freq, 0) >= 550) ? "bell-small" : "bell-strike"),
  };
  const BELL_GAP = { "bell-strike": 2.4, "bell-small": 2.0 }; // seconds between repeated single strikes
  const smpGain = (v) => (v <= 0 ? 0 : Math.pow(v, 1.3));    // same law as the procedural layers; files carry their trim

  // equal-power fade curves (sampled once)
  const CURVE_N = 64;
  const upCurve = new Float32Array(CURVE_N), downCurve = new Float32Array(CURVE_N);
  for (let i = 0; i < CURVE_N; i++) { const x = (i / (CURVE_N - 1)) * HALF_PI; upCurve[i] = Math.sin(x); downCurve[i] = Math.cos(x); }
  const scaled = (c, k) => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = c[i] * k; return o; };

  // Weighted random entry, never the same file as `prev` when another candidate exists.
  function pickEntry(list, prev) {
    let c = list.filter((x) => x.file !== prev);
    if (!c.length) c = list;
    if (!c.length) return null;
    let r = Math.random() * c.reduce((s, x) => s + Math.max(0, num(x.weight, 1)), 0);
    for (const x of c) { r -= Math.max(0, num(x.weight, 1)); if (r < 0) return x; }
    return c[c.length - 1];
  }

  // The shared store: the manifest, and per slot its entries and decoded buffers (shared by the live engine).
  const SMP = {
    force: null,           // tests: true / false overrides allowed()
    status: "idle",        // idle | loading | ready | failed
    base: null, manifest: null, promise: null,
    slots: {},             // slot -> { group, entries, bufs: Map(file -> AudioBuffer), loading: Map, bad: Set, last, next, lastUse }
    loadedBytes: 0, fetches: [],
    opts: { xfade: 3, prep: 20, releaseAfter: 300, segment: 0, keepCues: 6 },
    allowed() {
      if (this.force !== null) return !!this.force;
      const q = new URLSearchParams(location.search).get("samples");
      if (q === "0") return false;
      if (q === "1") return true;
      const d = AW.config && AW.config.display;
      if (d && d.samples === false) return false;
      return /^https?:$/.test(location.protocol);
    },
    url(file) {
      if (!this.base) this.base = new URL("sounds/", document.baseURI).href;
      return new URL(file, this.base).href;
    },
    fetchBytes(file) {
      const url = this.url(file);
      this.fetches.push(file);
      if (location.protocol === "file:") {
        return new Promise((res, rej) => {
          const x = new XMLHttpRequest();
          x.open("GET", url); x.responseType = "arraybuffer";
          x.onload = () => (x.response && (x.status === 0 || x.status === 200) ? res(x.response) : rej(new Error("load " + file)));
          x.onerror = () => rej(new Error("load " + file));
          x.send();
        });
      }
      return fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status} ${file}`); return r.arrayBuffer(); });
    },
    setManifest(m, base) {
      if (base) this.base = new URL(base, document.baseURI).href;
      this.manifest = m; this.slots = {};
      for (const group of ["layers", "cues"]) {
        const g = (m && m[group]) || {};
        for (const slot of Object.keys(g)) {
          const entries = (Array.isArray(g[slot]) ? g[slot] : []).filter((x) => x && typeof x.file === "string")
            .map((x) => ({ ...x, slot, gain: Math.max(0, num(+x.gain, 1)), weight: num(+x.weight, 1) }));
          this.slots[slot] = { group, entries, bufs: new Map(), loading: new Map(), bad: new Set(), last: null, next: null, lastUse: 0 };
        }
      }
      this.status = "ready";
      this.promise = Promise.resolve(m);
    },
    ensureManifest() {
      if (this.promise) return this.promise;
      this.status = "loading";
      this.promise = this.fetchBytes("manifest.json")
        .then((ab) => { this.loadedBytes += ab.byteLength; this.setManifest(JSON.parse(new TextDecoder().decode(ab))); return this.manifest; })
        .catch((err) => { this.status = "failed"; throw err; });
      this.promise.catch(() => { /* handled: everything stays procedural */ });
      return this.promise;
    },
    slot(slot) { return this.slots[slot] || null; },
    good(slot) { const s = this.slots[slot]; return s ? s.entries.filter((x) => !s.bad.has(x.file)) : []; },
    // could this slot play recordings (now or once loaded)?
    usable(slot) {
      if (this.status === "failed") return false;
      if (this.status !== "ready") return true;
      return this.good(slot).length > 0;
    },
    ready(slot) { const s = this.slots[slot]; return !!s && s.bufs.size > 0; },
    has(entry) { const s = this.slots[entry.slot]; return !!s && s.bufs.has(entry.file); },
    buf(entry) { const s = this.slots[entry.slot]; return s ? s.bufs.get(entry.file) || null : null; },
    // fetch + decode one entry with `ctx` (shared result) -> Promise<AudioBuffer>
    load(entry, ctx) {
      const s = this.slots[entry.slot];
      if (!s) return Promise.reject(new Error("no slot"));
      if (s.bufs.has(entry.file)) return Promise.resolve(s.bufs.get(entry.file));
      if (s.loading.has(entry.file)) return s.loading.get(entry.file);
      if (s.bad.has(entry.file)) return Promise.reject(new Error("bad " + entry.file));
      const p = this.fetchBytes(entry.file)
        .then((ab) => { this.loadedBytes += ab.byteLength; return ctx.decodeAudioData(ab); })
        .then((b) => { if (this.slots[entry.slot] === s) s.bufs.set(entry.file, b); s.lastUse = performance.now(); return b; })
        .catch((err) => { s.bad.add(entry.file); throw err; })
        .finally(() => s.loading.delete(entry.file));
      p.catch(() => { /* the caller falls back */ });
      s.loading.set(entry.file, p);
      return p;
    },
    // a layer slot is wanted: load its first recording (a random weighted pick) if nothing is decoded or loading
    request(slot, ctx) {
      if (this.status === "idle") { this.ensureManifest().catch(() => {}); return; }
      if (this.status !== "ready") return;
      const s = this.slots[slot];
      if (!s || s.bufs.size || s.loading.size) return;
      const e = pickEntry(this.good(slot), s.last);
      if (e) this.load(e, ctx).catch(() => { /* next request tries another file */ });
    },
    decodedBytes() {
      let n = 0;
      for (const k in this.slots) for (const b of this.slots[k].bufs.values()) n += b.length * b.numberOfChannels * 4;
      return n;
    },
    release(slot, keep) {
      const s = this.slots[slot];
      if (!s) return;
      for (const f of Array.from(s.bufs.keys())) if (!keep || !keep.has(f)) s.bufs.delete(f);
    },
    info() {
      const slots = {};
      for (const k in this.slots) {
        const s = this.slots[k];
        slots[k] = { group: s.group, files: s.entries.length, bad: s.bad.size, decoded: Array.from(s.bufs.keys()), loading: s.loading.size };
      }
      return { allowed: this.allowed(), status: this.status, loadedBytes: this.loadedBytes, decodedBytes: this.decodedBytes(),
        fetches: this.fetches.slice(-40), slots };
    },
  };

  // A sampled loop: two (at a crossfade, briefly) AudioBufferSourceNodes playing alternately into the slot's level
  // gain. Each segment is scheduled on the audio clock when it is due within the lookahead: it starts at the previous
  // one's crossfade point and the pair crosses with equal-power curves over `xfade` s, so a join never depends on
  // where a file starts or ends (MP3 encoder padding, the files' own 1 s fades). At each join the next file is a
  // weighted random pick that is never the current one (when the slot has 2+); it is fetched and decoded `prep` s
  // ahead, and if it is not ready in time the current file continues from a random point instead.
  function Loop(e, slot, out, now) {
    this.e = e; this.slot = slot; this.out = out; this.segs = []; this.next = null;
    const s = SMP.slot(slot);
    const first = e.pickReady(slot, s && s.last);
    const b = e.bufFor(first);
    const seg = this.e.opt.segment;
    const off = seg ? rand(0, Math.max(0, b.duration - seg - 1)) : rand(0, 0.6 * b.duration);
    this.cur = this.play(first, now + 0.03, 0, off);
  }
  Loop.prototype = {
    play(entry, t0, fadeIn, off) {
      const e = this.e, ctx = e.ctx, b = e.bufFor(entry);
      const segMax = e.opt.segment > 0 ? e.opt.segment : Infinity;
      off = clamp(off, 0, Math.max(0, b.duration - 2));
      const len = Math.max(0.5, Math.min(b.duration - off - 0.05, segMax));
      const X = Math.min(e.opt.xfade, len / 3);
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = b; src.connect(g); g.connect(this.out);
      const k = entry.gain;
      g.gain.value = fadeIn > 0 ? 0 : k;
      if (fadeIn > 0) g.gain.setValueCurveAtTime(scaled(upCurve, k), t0, fadeIn);
      const end = t0 + len;
      g.gain.setValueCurveAtTime(scaled(downCurve, k), end - X, X);
      src.start(t0, off);
      src.stop(end + 0.02);
      if (!e.offline) src.onended = () => { disc(src); disc(g); };
      const s = SMP.slot(entry.slot);
      if (s) { s.last = entry.file; s.lastUse = performance.now(); }
      e.segLog.push({ slot: this.slot, file: entry.file, at: +t0.toFixed(3), off: +off.toFixed(2), len: +len.toFixed(2) });
      if (e.segLog.length > 200) e.segLog.shift();
      const seg = { entry, src, g, t0, end, X, xf: end - X };
      this.segs.push(seg);
      return seg;
    },
    tick(now, to) {
      const c = this.cur, e = this.e;
      if (!this.next && now >= c.xf - e.opt.prep) {
        const s = SMP.slot(this.slot);
        this.next = (e.offline ? e.pickReady(this.slot, c.entry.file) : pickEntry(SMP.good(this.slot), c.entry.file)) || c.entry;
        if (s && this.next.file !== c.entry.file) e.prepare(this.next);
      }
      if (to + 0.3 >= c.xf) {
        let n = this.next && e.hasBuf(this.next) ? this.next : c.entry;
        const b = e.bufFor(n), segMax = e.opt.segment;
        let off = 0;
        if (n.file === c.entry.file) off = segMax ? rand(0, Math.max(0, b.duration - segMax - 1)) : rand(0, 0.5 * b.duration);
        else if (segMax) off = rand(0, Math.max(0, b.duration - segMax - 1));
        this.cur = this.play(n, c.xf, c.X, off);
        this.next = null;
      }
      if (this.segs.length > 2) this.segs = this.segs.filter((s) => s.end > now - 0.1);
    },
    files() { const f = new Set(this.segs.map((s) => s.entry.file)); if (this.next) f.add(this.next.file); return f; },
    stop(now) {
      for (const s of this.segs) { try { s.src.stop(now + 0.05); } catch (err) { /* already */ } }
      this.segs = [];
    },
  };

  // ---------------------------------------------------------------- engine (one per AudioContext)
  // opts: { offline, samples (use recordings), opt: {xfade, prep, segment} (offline overrides of SMP.opts) }
  function Engine(ctx, opts) {
    const e = this;
    opts = opts || {};
    e.ctx = ctx; e.offline = !!opts.offline;
    e.smpOn = !!opts.samples;
    e.optOver = opts.opt || null;
    e.cache = e.offline ? new Map() : null; // offline renders decode privately (trimmed), never into the live store
    e.nb = noiseBuffers(ctx);
    e.env = { tempC: 18 };
    e.bus = gainN(ctx, 1);
    e.master = gainN(ctx, 0);
    e.comp = ctx.createDynamicsCompressor();
    e.lim = ctx.createDynamicsCompressor();
    const setc = (c, p) => { for (const k in p) c[k].value = p[k]; };
    setc(e.comp, { threshold: -20, knee: 12, ratio: 2.5, attack: 0.02, release: 0.4 });
    setc(e.lim, { threshold: -6, knee: 1, ratio: 20, attack: 0.001, release: 0.12 });
    e.clip = ctx.createWaveShaper(); e.clip.curve = ceilingCurve(); e.clip.oversample = "none";
    e.bus.connect(e.master); e.master.connect(e.comp); e.comp.connect(e.lim); e.lim.connect(e.clip); e.clip.connect(ctx.destination);
    e.analyser = ctx.createAnalyser(); e.analyser.fftSize = 2048; e.clip.connect(e.analyser);
    e.rev = gainN(ctx, 1);
    const conv = ctx.createConvolver(); conv.buffer = impulse(ctx, 2.6);
    const ret = gainN(ctx, 0.55);
    e.rev.connect(conv); conv.connect(ret); ret.connect(e.bus);
    e.cueBus = gainN(ctx, 1); e.cueBus.connect(e.bus);
    e.sink = gainN(ctx, 0); e.sink.connect(ctx.destination); // pulls the cleanup timers
    const voice = (name) => {
      const g = gainN(ctx, 0); g.connect(e.bus);
      return { name, gain: g, sent: 0, cur: 0, at: 0, tau: 1.8, live: null, kit: null };
    };
    e.layers = {};    // procedural layer -> level state, live = its graph
    for (const name of PROC) e.layers[name] = voice(name);
    e.players = {};   // recording slot -> the same level state, live = a Loop
    for (const slot of SLOTS) e.players[slot] = voice(slot);
    e.pub = {};       // public name -> { sent, cur, at } (smoothed, for state())
    for (const name of LAYERS) e.pub[name] = { sent: 0, cur: 0, at: 0 };
    e.route = { smp: {}, proc: {}, procBy: {}, want: [] };
    e.voiceEnds = [];
    e.counts = {};
    e.segLog = [];
    e.cueLog = [];
  }
  Object.defineProperty(Engine.prototype, "opt", { get() { return this.optOver ? { ...SMP.opts, ...this.optOver } : SMP.opts; } });
  // Disconnect `nodes` once the audio clock passes `end` (a silent ConstantSource's onended is the timer).
  Engine.prototype.after = function (end, nodes) {
    if (this.offline) return;
    const c = this.ctx.createConstantSource();
    c.offset.value = 0; c.connect(this.sink);
    c.start(this.ctx.currentTime); c.stop(Math.max(this.ctx.currentTime + 0.05, end));
    c.onended = () => { disc(c); nodes.forEach((n) => n && disc(n)); };
  };
  // buffers: the live engine uses the shared store; an offline render its private, pre-loaded cache
  Engine.prototype.bufFor = function (entry) { return (this.cache && this.cache.get(entry.file)) || SMP.buf(entry); };
  Engine.prototype.hasBuf = function (entry) { return !!entry && !!this.bufFor(entry); };
  Engine.prototype.prepare = function (entry) { if (!this.offline) SMP.load(entry, this.ctx).catch(() => {}); };
  Engine.prototype.slotReady = function (slot) {
    if (!this.smpOn) return false;
    return SMP.good(slot).some((x) => this.hasBuf(x));
  };
  Engine.prototype.pickReady = function (slot, prev) { return pickEntry(SMP.good(slot).filter((x) => this.hasBuf(x)), prev); };

  // Smoothed level for one voice (a procedural layer or a recording slot): build when it rises above OFF, ease the
  // gain with time constant `tau`, tear down once both the target and the smoothed level are under OFF.
  Engine.prototype.ease = function (L, v, now, tau, instant, gainOf, build, teardown) {
    L.cur += (L.sent - L.cur) * (1 - Math.exp(-Math.max(0, now - L.at) / L.tau));
    L.at = now;
    if (v >= OFF && !L.live) build();
    const prm = L.gain.gain;
    if (instant) {
      prm.cancelScheduledValues(now); prm.setValueAtTime(gainOf(v), now);
      L.sent = L.cur = v;
    } else if (Math.abs(v - L.sent) > 0.002) {
      prm.setTargetAtTime(gainOf(v), now, tau);
      L.sent = v; L.tau = tau;
    }
    if (L.live && L.sent < OFF && L.cur < OFF) {
      teardown();
      prm.cancelScheduledValues(now); prm.setValueAtTime(0, now);
      L.sent = L.cur = 0;
    }
  };
  Engine.prototype.setLevel = function (name, v, now, tau, instant) {
    const L = this.layers[name];
    if (!L) return;
    this.ease(L, v, now, tau, instant, (x) => levelGain(name, x),
      () => { const k = new Kit(this, L.gain); L.kit = k; L.live = BUILD[name](this, L.gain, k); },
      () => { L.kit.stop(); L.live = null; L.kit = null; });
  };
  Engine.prototype.setSample = function (slot, v, now, tau, instant) {
    const L = this.players[slot];
    if (!L) return;
    if (v >= OFF && !L.live && !this.slotReady(slot)) v = 0; // nothing decoded (yet): the stand-in plays
    this.ease(L, v, now, tau, instant, smpGain,
      () => { L.live = new Loop(this, slot, L.gain, now); },
      () => { L.live.stop(now); L.live = null; });
  };
  // Public levels -> recording slots (when decoded) and procedural layers (the rest). `has`: the names the caller sent.
  Engine.prototype.resolve = function (lv, day, has) {
    const smp = {}, proc = {}, procBy = {}, want = [];
    const addP = (p, v, n) => { if (v > (proc[p] || 0)) proc[p] = v; if (v >= OFF) (procBy[p] = procBy[p] || []).push(n); };
    for (const n of LAYERS) {
      const v = lv[n] || 0;
      if (v <= 0) continue;
      const split = SPLIT[n];
      if (split && split.some((k) => has[k])) { // the theme sends the split itself: the parent only stands in
        if (!split.some((k) => this.slotReady(k))) addP(n, v, n);
        continue;
      }
      const routes = ROUTE[n](v, day);
      const ready = routes.map(([s]) => this.slotReady(s));
      const any = ready.some(Boolean);
      routes.forEach(([s, l], i) => {
        if (ready[i]) { if (l > (smp[s] || 0)) smp[s] = l; return; }
        if (l >= OFF && this.smpOn) want.push(s);
        const si = STANDIN[s];
        if (si) addP(si[0], (any ? l : v) * si[1], n);
      });
    }
    return { smp, proc, procBy, want };
  };
  Engine.prototype.apply = function (lv, day, has, now, tau, instant) {
    const r = this.resolve(lv, day, has || {});
    this.route = r;
    if (!this.offline) for (const s of r.want) SMP.request(s, this.ctx);
    for (const name of PROC) this.setLevel(name, clamp(r.proc[name] || 0), now, tau, instant);
    for (const slot of SLOTS) this.setSample(slot, clamp(r.smp[slot] || 0), now, tau, instant);
    for (const name of LAYERS) {
      const P = this.pub[name], v = lv[name] || 0;
      P.cur += (P.sent - P.cur) * (1 - Math.exp(-Math.max(0, now - P.at) / tau));
      P.at = now;
      if (instant) P.cur = v;
      P.sent = v;
    }
  };
  // How a public name is sounding: "sampled" (one of its slots is playing), "procedural" (a procedural layer is live
  // because of it), or "off".
  Engine.prototype.source = function (name) {
    const P = this.pub[name];
    if (!(P.sent >= OFF || P.cur >= OFF)) return "off";
    const slots = ROUTE[name](1, 0).map(([s]) => s).concat(SPLIT[name] || []);
    if (slots.some((s) => this.players[s] && this.players[s].live)) return "sampled";
    for (const p of PROC) if (this.layers[p].live && (p === name || (this.route.procBy[p] || []).includes(name))) return "procedural";
    return "off";
  };
  Engine.prototype.tick = function (now, to) {
    for (const name of PROC) {
      const L = this.layers[name];
      if (L.live) L.live.tick(now, to, Math.max(L.sent, OFF));
    }
    for (const slot of SLOTS) {
      const L = this.players[slot];
      if (L.live) L.live.tick(now, to);
    }
  };
  Engine.prototype.stopLayers = function () {
    const now = this.ctx.currentTime;
    for (const L of Object.values(this.layers)) {
      if (L.live) { L.kit.stop(); L.live = null; L.kit = null; }
      L.gain.gain.cancelScheduledValues(now); L.gain.gain.setValueAtTime(0, now);
      L.sent = L.cur = 0;
    }
    for (const L of Object.values(this.players)) {
      if (L.live) { L.live.stop(now); L.live = null; }
      L.gain.gain.cancelScheduledValues(now); L.gain.gain.setValueAtTime(0, now);
      L.sent = L.cur = 0;
    }
    for (const P of Object.values(this.pub)) P.sent = P.cur = 0;
  };
  Engine.prototype.logCue = function (rec) {
    this.cueLog.push(rec);
    if (this.cueLog.length > 100) this.cueLog.shift();
  };
  Engine.prototype.cue = function (name, t, opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    const n = {
      ...o,
      gain: clamp(num(o.gain, 1), 0, 2) * CUE_CAL[name],
      pan: clamp(num(o.pan, rand(-0.6, 0.6)), -1, 1),
      distance: clamp(num(o.distance, 0.4)),
    };
    if (n.gain <= 0.00001) return false;
    this.voiceEnds = this.voiceEnds.filter((x) => x > t);
    if (this.voiceEnds.length >= MAX_VOICES) return false;
    let end = this.smpOn ? this.cueSampled(name, t, n, o) : null;
    if (end == null) {
      end = CUE[name](this, t, n);
      this.logCue({ name, sampled: false, at: +t.toFixed(3) });
    }
    this.voiceEnds.push(end);
    this.counts[name] = (this.counts[name] || 0) + 1;
    return true;
  };

  // Which takes a cue plays: -> { slot, takes: [entry...], strikes, gap } or null (no candidates). Honours the cue's
  // options: loon `kind` (wail / tremolo preferred, any otherwise), bells `count` (a ready-made N-strike file, else a
  // single strike repeated) and `kind: "peal"`, chime `notes`; never the take this slot played last (2+ candidates).
  function cueTakes(name, n, slot) {
    const s = SMP.slot(slot);
    let c = SMP.good(slot);
    if (!s || !c.length) return null;
    let strikes = 1;
    if (name === "loon" && (n.kind === "wail" || n.kind === "tremolo")) {
      const k = c.filter((x) => x.kind === n.kind);
      if (k.length) c = k;
    }
    if (slot.startsWith("bell")) {
      const count = Math.max(1, Math.min(12, Math.round(num(+n.count, 1))));
      if (n.kind === "peal") { const p = c.filter((x) => x.kind === "peal"); if (p.length) c = p; }
      else {
        const ready = count > 1 ? c.filter((x) => x.count === count) : [];
        if (ready.length) c = ready;
        else {
          const singles = c.filter((x) => x.kind !== "peal" && (x.count || 1) === 1);
          if (singles.length) c = singles;
          strikes = count;
        }
      }
    }
    const notes = name === "chime" ? Math.max(1, Math.min(3, Math.round(num(+n.notes, Math.random() < 0.5 ? 1 : 2)))) : 1;
    const takes = [];
    let prev = s.last;
    for (let i = 0; i < notes; i++) {
      // the take picked ahead last time (already being decoded) when it fits this request
      const t = i === 0 && s.next && c.includes(s.next) && s.next.file !== prev ? s.next : pickEntry(c, prev);
      if (!t) break;
      takes.push(t); prev = t.file;
    }
    s.last = prev;
    s.next = pickEntry(c, prev);
    return { slot, takes, strikes, gap: BELL_GAP[slot] || 2.2 };
  }

  // A cue from recordings: returns its (estimated) end time, or null when the slot has none (procedural instead).
  // Distance as the procedural voices do it: quieter, darker (low-pass), more reverb, less panned; thunder arrives
  // distance x 5 s after the call (sound lags light) unless `delay` is given. A take that is not decoded yet is
  // fetched now and played as soon as it is (the very first one of a slot can be a few hundred ms late); if that
  // fails, the procedural voice plays instead.
  Engine.prototype.cueSampled = function (name, t, n, o) {
    const pickSlot = CUE_SLOT[name];
    const slot = pickSlot && pickSlot(n);
    if (!slot || !SMP.usable(slot)) return null;
    const delay = o.delay != null ? Math.max(0, +o.delay || 0) : name === "thunder" ? n.distance * 5 : 0;
    const at = t + delay;
    const plan = o._plan || (SMP.status === "ready" ? cueTakes(name, n, slot) : null);
    if (plan && !plan.takes.length) return null;
    if (plan && plan.takes.every((x) => this.hasBuf(x))) return this.playTakes(name, plan, at, n, o);
    if (this.offline) return null;
    // async: the manifest and / or the take is still loading
    const ctx = this.ctx;
    SMP.ensureManifest()
      .then(() => {
        const p = plan || cueTakes(name, n, slot);
        if (!p || !p.takes.length) throw new Error("no takes");
        return Promise.all(p.takes.map((x) => SMP.load(x, ctx))).then(() => p);
      })
      .then((p) => {
        if (S.eng !== this || !S.enabled || !running()) return;
        if (ctx.currentTime + 0.02 - at > 3) return; // far too late to mean anything now
        this.playTakes(name, p, Math.max(at, ctx.currentTime + 0.02), n, o);
        const s = SMP.slot(p.slot);
        if (s && s.next) SMP.load(s.next, ctx).catch(() => {});
      })
      .catch(() => {
        if (S.eng !== this || !S.enabled || !running()) return;
        const tt = Math.max(t, ctx.currentTime + 0.02);
        CUE[name](this, tt, { ...n, delay: Math.max(0, at - tt) });
        this.logCue({ name, sampled: false, at: +tt.toFixed(3), fallback: true });
      });
    return at + 8;
  };
  Engine.prototype.playTakes = function (name, plan, at, n, o) {
    const ctx = this.ctx, d = n.distance;
    const lvl = clamp(num(o.gain, 1), 0, 2) * (name === "thunder" ? 1 - 0.6 * d : 1 - 0.5 * d);
    const lp = filt(ctx, "lowpass", 16000 * Math.pow(0.1, d), 0.6), p = panN(ctx, n.pan * (1 - 0.4 * d));
    const send = gainN(ctx, name === "ward" ? 0.45 + 0.3 * d : 0.1 + 0.45 * d);
    lp.connect(p); p.connect(this.cueBus); p.connect(send); send.connect(this.rev);
    const nodes = [lp, p, send];
    let end = at;
    const one = (take, tt, k) => {
      const b = this.bufFor(take);
      const src = ctx.createBufferSource(), g = gainN(ctx, lvl * take.gain * k);
      src.buffer = b; src.connect(g); g.connect(lp);
      src.start(tt);
      nodes.push(src, g);
      end = Math.max(end, tt + b.duration);
    };
    if (plan.strikes > 1) {
      for (let i = 0; i < plan.strikes; i++) one(plan.takes[0], at + i * plan.gap * rand(0.97, 1.03), 1);
    } else {
      plan.takes.forEach((take, i) => one(take, at + (i ? rand(0.15, 0.5) * i : 0), i ? 0.6 : 1));
    }
    const s = SMP.slot(plan.slot);
    if (s) s.lastUse = performance.now();
    this.after(end + 3, nodes);
    this.logCue({ name, sampled: true, slot: plan.slot, file: plan.takes[0].file, files: plan.takes.map((x) => x.file),
      kind: plan.takes[0].kind || null, count: plan.strikes > 1 ? plan.strikes : plan.takes[0].count || 1, at: +at.toFixed(3) });
    return end + 3;
  };

  // ---------------------------------------------------------------- the live engine
  const S = {
    enabled: false, volume: 0.5, ctx: null, eng: null,
    masterSent: 0, mode: 1, tau: 1.8, suspendTimer: null, warned: {},
  };
  function ensure() {
    if (S.ctx) return S.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { S.ctx = new AC({ latencyHint: "playback" }); } catch (e) { S.ctx = new AC(); }
    S.eng = new Engine(S.ctx);
    return S.ctx;
  }
  const running = () => !!S.ctx && S.ctx.state === "running";
  function setEnabled(on) {
    on = !!on;
    S.enabled = on;
    if (on) {
      if (!ensure()) { S.enabled = false; return false; }
      clearTimeout(S.suspendTimer);
      if (S.ctx.state !== "running") S.ctx.resume().catch(() => { /* locked until a gesture */ });
    } else if (S.eng) {
      S.eng.master.gain.setTargetAtTime(0, S.ctx.currentTime, 0.12);
      S.masterSent = 0;
      clearTimeout(S.suspendTimer);
      // once faded, tear the layers down and stop the clock: a disabled wall costs no CPU
      S.suspendTimer = setTimeout(() => { if (!S.enabled && S.ctx.state === "running") { S.eng.stopLayers(); S.ctx.suspend(); } }, 800);
    }
    return S.enabled;
  }
  function setVolume(v) {
    v = Math.round(clamp(num(+v, S.volume)) * 100) / 100;
    S.volume = v;
    return v;
  }
  // From a user gesture (core forwards keydown / pointerdown): browsers only let audio start inside one.
  function unlock() {
    if (S.enabled && S.ctx && S.ctx.state === "suspended") S.ctx.resume().catch(() => {});
    return running();
  }

  function update(frame, levels) {
    if (!S.enabled || !running()) return false;
    const ctx = S.ctx, eng = S.eng, now = ctx.currentTime;
    const disp = (AW.config && AW.config.display) || {};
    const work = clamp(num(disp.sound_work, 0));
    const blend = clamp(frame && typeof frame.blend === "number" ? frame.blend : 1);
    S.mode = work + (1 - work) * blend;
    const target = volGain(S.volume) * S.mode;
    if (Math.abs(target - S.masterSent) > 1e-4) { eng.master.gain.setTargetAtTime(target, now, 0.12); S.masterSent = target; }
    const wx = frame && frame.signals && frame.signals.weather;
    if (wx && typeof wx.tempC === "number") eng.env.tempC = wx.tempC;
    const audible = target > 1e-3; // silent master (work mode, volume 0): let every layer wind down
    const lv = {}, has = {};
    for (const name of LAYERS) {
      const raw = levels ? levels[name] : undefined;
      if (typeof raw === "number") has[name] = true;
      lv[name] = audible && levels ? clamp(num(+raw, 0)) : 0;
    }
    eng.smpOn = SMP.allowed();
    eng.apply(lv, clamp(num(frame && frame.day, 0)), has, now, S.tau);
    eng.tick(now, now + LOOKAHEAD);
    housekeep(eng);
    return true;
  }

  // Memory: a playing layer slot keeps only the files its loop is using (current, next); a slot silent for more
  // than releaseAfter seconds drops every decoded buffer (a later rise fetches and decodes again, from the HTTP
  // cache); a cue slot keeps at most keepCues decoded takes.
  let hkAt = 0;
  function housekeep(eng) {
    const t = performance.now();
    if (t - hkAt < 1000) return;
    hkAt = t;
    const idle = SMP.opts.releaseAfter * 1000;
    for (const slot in SMP.slots) {
      const s = SMP.slots[slot];
      if (!s.bufs.size) continue;
      const L = eng.players[slot];
      if (L && L.live) { s.lastUse = t; SMP.release(slot, L.live.files()); continue; }
      if (t - s.lastUse > idle) { SMP.release(slot); s.next = null; continue; }
      if (s.group === "cues" && s.bufs.size > SMP.opts.keepCues) {
        const keep = new Set(Array.from(s.bufs.keys()).slice(-SMP.opts.keepCues));
        if (s.next) keep.add(s.next.file);
        SMP.release(slot, keep);
      }
    }
  }

  function cue(name, opts) {
    if (!Object.prototype.hasOwnProperty.call(CUE, name)) {
      if (!S.warned[name]) { S.warned[name] = true; console.warn(`audio: unknown cue ${JSON.stringify(name)} ignored`); }
      return false;
    }
    if (!S.enabled || !running() || S.masterSent <= 1e-3) return false;
    return S.eng.cue(name, S.ctx.currentTime + 0.03, opts);
  }

  function state() {
    const layers = {}, active = [], eng = S.eng;
    for (const name of LAYERS) {
      const P = eng && eng.pub[name], src = eng ? eng.source(name) : "off";
      layers[name] = P ? { target: P.sent, level: P.cur, active: src !== "off", source: src } : { target: 0, level: 0, active: false, source: "off" };
      if (src !== "off") active.push(name);
    }
    const slots = {};
    if (eng) for (const slot of SLOTS) { const L = eng.players[slot]; if (L.live || L.sent > 0) slots[slot] = { target: L.sent, level: L.cur, playing: !!L.live, file: L.live ? L.live.cur.entry.file : null }; }
    return {
      enabled: S.enabled, volume: S.volume,
      context: S.ctx ? S.ctx.state : "none",
      locked: S.enabled && !running(),
      master: S.masterSent, mode: S.mode,
      sampleRate: S.ctx ? S.ctx.sampleRate : null,
      layers, active,
      cues: S.eng ? { ...S.eng.counts } : {},
      voices: S.eng ? S.eng.voiceEnds.filter((x) => x > S.ctx.currentTime).length : 0,
      storm: { ...storm },
      samples: { ...SMP.info(), playing: slots, segments: eng ? eng.segLog.slice(-20) : [] },
      cueLog: eng ? eng.cueLog.slice(-30) : [],
    };
  }

  // RMS / peak of the master output over `ms` (AnalyserNode snapshots every 20 ms).
  function meter(ms) {
    return new Promise((resolve) => {
      if (!S.eng || !running()) return resolve({ rms: 0, peak: 0, maxRms: 0, n: 0 });
      const a = S.eng.analyser, buf = new Float32Array(a.fftSize);
      let ss = 0, cnt = 0, peak = 0, maxRms = 0, n = 0;
      const t0 = performance.now();
      const id = setInterval(() => {
        a.getFloatTimeDomainData(buf);
        let w = 0;
        for (let i = 0; i < buf.length; i++) { const x = buf[i]; w += x * x; if (Math.abs(x) > peak) peak = Math.abs(x); }
        ss += w; cnt += buf.length; n++;
        maxRms = Math.max(maxRms, Math.sqrt(w / buf.length));
        if (performance.now() - t0 >= (ms || 500)) { clearInterval(id); resolve({ rms: Math.sqrt(ss / Math.max(1, cnt)), peak, maxRms, n }); }
      }, 20);
    });
  }

  // ---------------------------------------------------------------- default soundscape
  // For a theme without soundscape(): the outside, from the weather and the light, plus a little room tone.
  function defaultSoundscape(frame) {
    const w = (frame && frame.signals && frame.signals.weather) || {};
    const cond = w.condition || "clear", I = clamp(num(+w.intensity, 0)), wind = num(+w.windKph, 5), T = num(w.tempC, 12);
    const day = clamp(num(frame && frame.day, 0));
    const rain = cond === "rain" ? 0.2 + 0.8 * I : cond === "storm" ? 0.75 + 0.25 * I : 0;
    const windL = clamp(0.85 * sstep(6, 55, wind) + (cond === "storm" ? 0.15 : 0) + (cond === "snow" ? 0.1 : 0));
    const wet = clamp(rain * 1.2);
    // birdsong by day, crickets on warm nights; neither when it is cold (below about 5 C) or pouring
    const birds = 0.7 * day * sstep(4, 9, T) * (1 - 0.85 * wet) * (1 - 0.5 * sstep(25, 50, wind));
    const crickets = 0.6 * (1 - day) * sstep(5, 14, T) * (1 - wet);
    const forest = 0.35 * sstep(10, 40, wind) * (cond === "snow" ? 0.4 : 1);
    return { rain, wind: windL, birds, crickets, forest, room: 0.25 };
  }
  // Storm thunder for the default soundscape: every 20-60 s (the first within ~15 s), random distance.
  const storm = { next: null, count: 0 };
  function defaultCues(frame) {
    const w = frame && frame.signals && frame.signals.weather;
    if (!w || w.condition !== "storm") { storm.next = null; return; }
    const t = num(frame.t, 0);
    if (storm.next === null) storm.next = t + rand(4, 15);
    if (t >= storm.next) {
      storm.count++;
      storm.next = t + rand(20, 60);
      cue("thunder", { distance: rand(0.3, 1), gain: 0.6 + 0.4 * clamp(num(+w.intensity, 1)) });
    }
  }

  // ---------------------------------------------------------------- offline (tests, perf)
  // Render the engine in an OfflineAudioContext: levels set instantly, cues at given times.
  // opts: { seconds, sampleRate, levels: {layer: v}, cues: [{name, at, opts}], master (default 1), tempC, window, day,
  //         samples (use the recordings: the manifest and the files each layer / cue needs are fetched and decoded
  //         first, outside the timed render), preload (files per layer slot, default 1), clip (seconds kept of each
  //         decoded layer file, default seconds + 2), segment / xfade (loop overrides) }
  // -> { ms, decodeMs, rms, peak, env: [window RMS ...], window, length, sources: {layer: sampled|procedural|off},
  //      segments: [{slot, file, at, off, len}], cueLog: [...] }
  async function renderOffline(opts) {
    const o = opts || {}, secs = o.seconds || 3, sr = o.sampleRate || 44100;
    const oc = new OfflineAudioContext(2, Math.ceil(secs * sr), sr);
    const opt = {};
    for (const k of ["xfade", "segment"]) if (typeof o[k] === "number") opt[k] = o[k];
    const eng = new Engine(oc, { offline: true, samples: !!o.samples, opt });
    const lv = {}, has = {}, levels = o.levels || {};
    for (const name of LAYERS) { if (typeof levels[name] === "number") has[name] = true; lv[name] = clamp(num(+levels[name], 0)); }
    const day = clamp(num(o.day, 0));
    const cues = (o.cues || []).filter((c) => CUE[c.name]).map((c) => ({ ...c, opts: { ...(c.opts || {}) } }));
    let decodeMs = 0;
    if (o.samples) {
      const td = performance.now();
      await SMP.ensureManifest().catch(() => {});
      if (SMP.status === "ready") await preloadOffline(eng, oc, lv, has, day, cues, o, secs);
      decodeMs = performance.now() - td;
    }
    const t0 = performance.now();
    eng.env.tempC = num(o.tempC, 18);
    eng.master.gain.value = num(o.master, 1);
    eng.apply(lv, day, has, 0, 1, true);
    // schedule the way the live engine does: a LOOKAHEAD window at a time (suspend every 0.25 s), so the graph
    // only ever holds the few pending one-shots it holds live (CPU numbers stay representative)
    const step = 0.25;
    eng.tick(0, Math.min(secs, LOOKAHEAD));
    for (let t = step; t < secs; t += step) {
      const at = t;
      oc.suspend(at).then(() => { eng.tick(at, Math.min(secs, at + LOOKAHEAD)); oc.resume(); });
    }
    for (const c of cues) eng.cue(c.name, c.at || 0, c.opts);
    const buf = await oc.startRendering();
    const ms = performance.now() - t0;
    const L = buf.getChannelData(0), R = buf.getChannelData(1), win = Math.floor((o.window || 0.05) * sr);
    let ss = 0, peak = 0;
    const env = [];
    for (let i = 0; i < L.length; i += win) {
      let w = 0;
      const end = Math.min(L.length, i + win);
      for (let j = i; j < end; j++) {
        const l = L[j], r = R[j];
        w += l * l + r * r;
        const a = Math.max(Math.abs(l), Math.abs(r));
        if (a > peak) peak = a;
      }
      ss += w;
      env.push(Math.sqrt(w / (2 * (end - i))));
    }
    const sources = {};
    for (const name of LAYERS) if (lv[name] > 0) sources[name] = eng.source(name);
    return { ms, decodeMs, rms: Math.sqrt(ss / (2 * L.length)), peak, env, window: win / sr, length: secs,
      sources, segments: eng.segLog.slice(), cueLog: eng.cueLog.slice() };
  }
  // Fetch and decode (one file at a time, so memory peaks at one full decode) what an offline render will play:
  // `preload` files of each layer slot it routes to, trimmed to `clip` seconds, and the takes each cue will use.
  async function preloadOffline(eng, oc, lv, has, day, cues, o, secs) {
    const clip = num(o.clip, secs + 2), per = Math.max(1, num(o.preload, 1) | 0);
    const decode = async (entry, trimTo) => {
      if (eng.cache.has(entry.file)) return true;
      try {
        const ab = await SMP.fetchBytes(entry.file);
        SMP.loadedBytes += ab.byteLength;
        let b = await oc.decodeAudioData(ab);
        if (trimTo && b.duration > trimTo + 0.5) {
          const n = Math.floor(trimTo * b.sampleRate), t = oc.createBuffer(b.numberOfChannels, n, b.sampleRate);
          for (let c = 0; c < b.numberOfChannels; c++) t.copyToChannel(b.getChannelData(c).subarray(0, n), c);
          b = t;
        }
        eng.cache.set(entry.file, b);
        return true;
      } catch (err) {
        const s = SMP.slot(entry.slot);
        if (s) s.bad.add(entry.file);
        return false;
      }
    };
    const slots = new Set();
    for (const n of LAYERS) {
      if (!(lv[n] > 0)) continue;
      const split = SPLIT[n];
      if (split && split.some((k) => has[k])) continue;
      for (const [s, l] of ROUTE[n](lv[n], day)) if (l >= OFF) slots.add(s);
    }
    for (const slot of slots) {
      const good = SMP.good(slot), s = SMP.slot(slot);
      let prev = s && s.last, got = 0;
      const tried = new Set();
      while (got < per && tried.size < good.length) {
        const e = pickEntry(good.filter((x) => !tried.has(x.file)), prev);
        if (!e) break;
        tried.add(e.file); prev = e.file;
        if (await decode(e, clip)) got++;
      }
    }
    for (const c of cues.slice().sort((a, b) => (a.at || 0) - (b.at || 0))) {
      const n = { ...c.opts, distance: clamp(num(c.opts.distance, 0.4)) };
      const slot = CUE_SLOT[c.name] && CUE_SLOT[c.name](n);
      if (!slot || !SMP.usable(slot)) continue;
      const plan = cueTakes(c.name, n, slot);
      if (!plan || !plan.takes.length) continue;
      let ok = true;
      for (const t of plan.takes) ok = (await decode(t, 0)) && ok;
      if (ok) c.opts._plan = plan;
    }
  }

  AW.audio = {
    LAYERS, CUES,
    update, cue, setEnabled, setVolume, unlock, state, meter,
    defaultSoundscape, defaultCues, renderOffline,
    enabled: () => S.enabled,
    volume: () => S.volume,
    locked: () => S.enabled && !running(), // on, but the browser still wants a user gesture
    storm,
    // tests: smoothing time constant (s) for layer levels; the default is 1.8
    get tau() { return S.tau; }, set tau(v) { S.tau = Math.max(0.01, +v || 1.8); },
    _S: S, _Engine: Engine, _CAL: CAL,
    // recordings: the store (manifest, slots, byte counts), its tunables (opts: xfade, prep, segment, releaseAfter,
    // keepCues), setManifest(m, base) / reset() for tests, force (null = auto, true / false), the rotation pick
    samples: {
      info: () => SMP.info(),
      opts: SMP.opts,
      get force() { return SMP.force; }, set force(v) { SMP.force = v === null || v === undefined ? null : !!v; },
      allowed: () => SMP.allowed(),
      setManifest: (m, base) => SMP.setManifest(m, base),
      reset() { SMP.manifest = null; SMP.promise = null; SMP.slots = {}; SMP.status = "idle"; SMP.fetches = []; SMP.loadedBytes = 0; },
      pickEntry, SLOTS, ROUTE, STANDIN,
    },
  };
})();
