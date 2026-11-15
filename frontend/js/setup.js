// Ambient Wall - first-run setup wizard (setup.html, docs/SETUP.md). Plain JS, no build step. It talks only to the
// wall's own backend: the place search and Environment Canada's site list are proxied by it (/api/setup/*), and
// "Save and start" posts the answers to POST /api/setup, which validates them exactly like startup does, writes
// config/config.toml (+ secrets.toml) and restarts the wall's sources in place.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const SKIP_KEY = "ambient-wall.setup-skipped"; // core.js firstRun() reads it: the wall then stays on demo data
  const POLL_MS = 5000;
  const MAX_FEEDS = 8, MAX_HOSTS = 16;

  // index.html order; names as the themes register them (names for ids the backend reports but this list lacks
  // fall back to the id)
  const THEMES = [
    { id: "cyberpunk", name: "Cyberpunk" }, { id: "nature", name: "Nature" }, { id: "classical", name: "Classical" },
    { id: "boreal", name: "Boreal" }, { id: "campfire", name: "Campfire" }, { id: "academia", name: "Dark Academia" },
    { id: "stainedglass", name: "Stained Glass" }, { id: "lofi", name: "Lofi" }, { id: "orbit", name: "Orbit" },
    { id: "tower", name: "Wizard's Tower" },
  ];
  const COATS = ["tabby", "ginger", "black", "grey", "tuxedo", "calico", "siamese", "white"];
  // well-known feeds that answered on 2026-10-14 (any RSS / Atom address works as a custom feed)
  const NEWS_PRESETS = [
    { url: "https://www.cbc.ca/webfeed/rss/rss-topstories", label: "CBC News", note: "Canada" },
    { url: "https://feeds.bbci.co.uk/news/rss.xml", label: "BBC News", note: "UK, world" },
    { url: "https://feeds.npr.org/1001/rss.xml", label: "NPR News", note: "US" },
    { url: "https://www.theguardian.com/world/rss", label: "The Guardian", note: "world" },
    { url: "https://www.aljazeera.com/xml/rss/all.xml", label: "Al Jazeera", note: "world" },
    { url: "https://hnrss.org/frontpage", label: "Hacker News", note: "tech" },
  ];
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // first part of an error's field id -> the step that shows it
  const STEP_OF = { location: 0, envcanada: 0, schedule: 1, look: 2, news: 3, calendar: 3, hosts: 3, spotify: 3 };

  const state = {
    step: 0, steps: [], setup: null, saving: false, done: false,
    region: null, regionFor: null, countryCode: null, // from the picked search result (local news terms)
    ecSites: [], theme: "cyberpunk",
    newsRows: [], hostRows: [],                        // body index -> DOM element, for field errors
  };

  // ---------------------------------------------------------------- helpers
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function msg(id, text, kind) { const m = $(id); m.textContent = text || ""; m.className = "msg" + (kind ? " " + kind : ""); }
  async function api(path, body) {
    const opt = body === undefined ? {} :
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const r = await fetch(path, Object.assign({ cache: "no-store" }, opt));
    let data = null;
    try { data = await r.json(); } catch (e) { /* not JSON */ }
    return { status: r.status, ok: r.ok, data };
  }
  async function call(path, body) {
    try { return await api(path, body); } catch (e) { return { status: 0, ok: false, data: null }; }
  }
  const detail = (res) => (res.data && typeof res.data.detail === "string" ? res.data.detail : null) ||
    (res.status ? `the wall answered HTTP ${res.status}` : "the wall did not answer");
  const num = (v) => { const n = parseFloat(String(v).trim().replace(",", ".")); return Number.isFinite(n) ? n : String(v).trim(); };
  const round4 = (x) => String(Math.round(x * 10000) / 10000);
  const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; } };
  const inCanada = (lat, lon) => lat >= 41.6 && lat <= 83.2 && lon >= -141.1 && lon <= -52.6;

  function show(name, note) {
    for (const s of ["state-loading", "state-saved", "state-already", "state-write-error", "state-offline"]) $(s).hidden = s !== "state-" + name;
    $("wizard").hidden = name !== "wizard";
    $("nav").hidden = name !== "wizard";
    $("steps").hidden = name !== "wizard";
    if (name === "already") msg("already-note", note || "");
    if (name === "offline") msg("offline-note", note || "", "err");
    if (name !== "wizard") { themesActive(); const h = document.querySelector(`#state-${name} h1`); if (h) h.focus(); }
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- boot
  async function boot() {
    for (const s of document.querySelectorAll(".here")) s.textContent = `${location.host}/setup.html`;
    if (!/^https?:$/.test(location.protocol)) return show("offline", "This page was opened from a file, not from the wall.");
    const res = await call("api/setup");
    if (!res.ok || !res.data) return show("offline", `GET /api/setup: ${detail(res)}`);
    state.setup = res.data;
    if (!res.data.enabled) return show("already", "The setup wizard is turned off on this box (AMBIENT_SETUP=0).");
    if (!res.data.needed) return show("already");
    build(res.data);
    show("wizard");
    go(0, true);
    setTimeout(poll, POLL_MS);
  }

  // Someone may finish the setup from another device (the projector's own browser was sent here by the wall).
  async function poll() {
    if (state.saving || state.done) return;
    const r = await call("api/setup");
    if (state.saving || state.done) return;
    if (r.ok && r.data && !r.data.needed) {
      state.done = true;
      show("already", "This wall was just set up from another device.");
      if (qs.get("from") === "wall") setTimeout(() => location.replace("./"), 3000);
      return;
    }
    setTimeout(poll, POLL_MS);
  }

  function build(setup) {
    state.steps = Array.from(document.querySelectorAll(".step"));
    document.querySelectorAll("#steps li").forEach((li) => {
      li.querySelector("button").addEventListener("click", () => {
        const i = +li.dataset.step;
        if (i === state.step) return;
        if (i > 0 && !checkPlace()) return go(0);
        go(i);
      });
    });
    $("wizard").addEventListener("submit", (e) => e.preventDefault());
    $("back").addEventListener("click", () => go(state.step - 1));
    $("next").addEventListener("click", next);
    $("skip").addEventListener("click", skip);
    buildPlace();
    buildLook(setup);
    buildData(setup);
    document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => copy($(b.dataset.copy), b)));
    document.querySelectorAll("[data-download]").forEach((b) => b.addEventListener("click", () => download($(b.dataset.download), b.dataset.name)));
    $("we-retry").addEventListener("click", save);
    $("we-back").addEventListener("click", () => { show("wizard"); go(4); });
  }

  function go(i, initial) {
    state.step = Math.max(0, Math.min(state.steps.length - 1, i));
    state.steps.forEach((s, k) => { s.hidden = k !== state.step; });
    document.querySelectorAll("#steps li").forEach((li, k) => {
      li.classList.toggle("on", k === state.step);
      li.classList.toggle("done", k < state.step);
      li.querySelector("button").setAttribute("aria-current", k === state.step ? "step" : "false");
    });
    $("back").disabled = state.step === 0;
    $("next").textContent = state.step === state.steps.length - 1 ? "Save and start" : "Next";
    themesActive();
    if (state.step === state.steps.length - 1) review();
    window.scrollTo(0, 0);
    if (!initial) { const h = state.steps[state.step].querySelector("h1"); if (h) h.focus({ preventScroll: true }); }
  }

  function next() {
    if (state.step === 0 && !checkPlace()) return;
    if (state.step === state.steps.length - 1) return save();
    go(state.step + 1);
  }

  function skip(e) {
    e.preventDefault();
    let stored = false;
    try { localStorage.setItem(SKIP_KEY, "1"); stored = true; } catch (err) { /* storage blocked */ }
    location.href = stored ? "./" : "./?setup=0";
  }

  // ---------------------------------------------------------------- 1. place
  function buildPlace() {
    $("search").addEventListener("click", search);
    $("q").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); search(); } });
    const tz = browserTz();
    if (tz) $("loc-tz").placeholder = tz;
    try {
      const list = $("tz-list");
      for (const z of (Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [])) list.append(new Option(z));
    } catch (e) { /* old browser: free text */ }
    for (const id of ["loc-name", "loc-lat", "loc-lon", "loc-tz"]) $(id).addEventListener("input", manualEdit);
    $("ec-find").addEventListener("click", () => findEc(num($("loc-lat").value), num($("loc-lon").value)));
  }

  async function search() {
    const q = $("q").value.trim();
    $("results").textContent = "";
    if (q.length < 2) return msg("search-msg", "Type at least two letters.", "warn");
    msg("search-msg", "Searching…");
    $("search").disabled = true;
    const res = await call("api/setup/geocode", { q });
    $("search").disabled = false;
    if (!res.ok) { msg("search-msg", detail(res), "err"); $("manual").open = true; return; }
    const list = (res.data && res.data.results) || [];
    if (!list.length) return msg("search-msg", "Nothing found. Try another spelling, or enter it by hand below.", "warn");
    msg("search-msg", "");
    for (const p of list) {
      const b = el("button", "result");
      b.type = "button";
      b.append(el("span", "r-name", p.name), el("span", "r-sub",
        [p.region, p.admin1, p.country].filter(Boolean).join(", ") + ` · ${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}`));
      b.addEventListener("click", () => pick(p));
      const li = el("li");
      li.append(b);
      $("results").append(li);
    }
  }

  function pick(p) {
    $("loc-name").value = p.name;
    $("loc-lat").value = round4(p.lat);
    $("loc-lon").value = round4(p.lon);
    $("loc-tz").value = p.timezone || browserTz();
    state.region = p.region || null;
    state.regionFor = p.name;
    state.countryCode = p.country_code || null;
    $("results").textContent = "";
    msg("search-msg", "");
    clearErrors();
    showPicked();
    if (p.country_code === "CA") findEc(p.lat, p.lon); else hideEc();
  }

  function manualEdit() {
    state.countryCode = null;
    showPicked();
    const lat = num($("loc-lat").value), lon = num($("loc-lon").value);
    $("ec-find").hidden = !(typeof lat === "number" && typeof lon === "number" && inCanada(lat, lon));
  }

  function showPicked() {
    const name = $("loc-name").value.trim(), lat = num($("loc-lat").value), lon = num($("loc-lon").value);
    const ok = name && typeof lat === "number" && typeof lon === "number";
    $("picked").hidden = !ok;
    if (!ok) return;
    $("picked-name").textContent = name;
    const region = state.regionFor === name && state.region ? `${state.region} · ` : "";
    $("picked-detail").textContent = `${region}${lat.toFixed(4)}, ${lon.toFixed(4)} · ${$("loc-tz").value.trim() || browserTz() || "time zone?"}`;
  }

  function checkPlace() {
    clearErrors();
    const errs = [];
    const name = $("loc-name").value.trim(), lat = num($("loc-lat").value), lon = num($("loc-lon").value);
    if (!name && !$("loc-lat").value.trim()) errs.push({ field: "location", message: "Search for your town, or enter it by hand." });
    else {
      if (!name) errs.push({ field: "location.name", message: "required" });
      if (typeof lat !== "number" || lat < -90 || lat > 90) errs.push({ field: "location.lat", message: "a number between -90 and 90" });
      if (typeof lon !== "number" || lon < -180 || lon > 180) errs.push({ field: "location.lon", message: "a number between -180 and 180" });
    }
    if (!$("loc-tz").value.trim() && browserTz()) $("loc-tz").value = browserTz();
    if (!$("loc-tz").value.trim() && !errs.length) errs.push({ field: "location.timezone", message: "required (e.g. America/Toronto)" });
    if (errs.length) {
      if (errs.some((e) => e.field !== "location")) $("manual").open = true;
      markErrors(errs);
      return false;
    }
    return true;
  }

  async function findEc(lat, lon) {
    if (typeof lat !== "number" || typeof lon !== "number") return;
    const res = await call("api/setup/ec-site", { lat, lon });
    const sites = ((res.ok && res.data && res.data.sites) || []).filter((s) => s.km <= 100);
    if (!sites.length) return hideEc();
    state.ecSites = sites;
    const box = $("ec-sites");
    box.textContent = "";
    sites.forEach((s, i) => {
      const lab = el("label");
      const r = el("input");
      r.type = "radio"; r.name = "ec-site"; r.value = s.code; r.checked = i === 0;
      r.addEventListener("change", () => { $("ec-on").checked = true; ecName(); });
      lab.append(r, el("span", null, `${s.name} (${s.province}) · ${s.km < 1 ? "<1" : Math.round(s.km)} km`));
      box.append(lab);
    });
    $("ec-on").checked = true;
    $("ec-card").hidden = false;
    ecName();
  }
  function ecSite() {
    const r = document.querySelector("input[name=ec-site]:checked");
    return (r && state.ecSites.find((s) => s.code === r.value)) || state.ecSites[0] || null;
  }
  function ecName() { const s = ecSite(); $("ec-name").textContent = s ? `for ${s.name}` : ""; }
  function hideEc() { state.ecSites = []; $("ec-card").hidden = true; }

  // ---------------------------------------------------------------- 3. look
  let previewObserver = null;
  function buildLook(setup) {
    const have = Array.isArray(setup.themes) ? setup.themes : [];
    const list = THEMES.filter((t) => !have.length || have.includes(t.id));
    for (const id of have) if (!list.find((t) => t.id === id)) list.push({ id, name: id });
    state.theme = list.find((t) => t.id === "cyberpunk") ? "cyberpunk" : (list[0] || { id: "cyberpunk" }).id;
    const grid = $("themes");
    previewObserver = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
      for (const e of entries) { e.target._visible = e.isIntersecting; loadPreview(e.target); }
    }, { rootMargin: "120px" }) : null;
    for (const t of list) {
      const card = el("button", "theme");
      card.type = "button";
      card.dataset.theme = t.id;
      card.setAttribute("role", "radio");
      card.setAttribute("aria-label", t.name);
      const frame = el("div", "preview");
      const iframe = el("iframe");
      iframe.title = `${t.name} preview`;
      iframe.tabIndex = -1;
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("sandbox", "allow-scripts"); // its own opaque origin: a preview can't touch the wall's storage
      frame.append(iframe);
      card.append(frame, el("span", "theme-name", t.name));
      card.addEventListener("click", () => setTheme(t.id));
      grid.append(card);
      if (previewObserver) previewObserver.observe(card); else card._visible = true;
    }
    setTheme(state.theme);
    if ("ResizeObserver" in window) {
      new ResizeObserver(() => {
        const p = grid.querySelector(".preview");
        if (p && p.clientWidth) grid.style.setProperty("--s", String(p.clientWidth / 640));
      }).observe(grid);
    }
    const coats = Array.isArray(setup.coats) && setup.coats.length ? setup.coats : COATS;
    for (const c of coats) $("cat-coat").append(new Option(c[0].toUpperCase() + c.slice(1), c));
    $("cat-coat").disabled = true;
    $("cat").addEventListener("change", () => { $("cat-coat").disabled = !$("cat").checked; refreshPreviews(); });
    $("cat-coat").addEventListener("change", refreshPreviews);
    $("boost").addEventListener("change", refreshPreviews);
  }
  function setTheme(id) {
    state.theme = id;
    for (const c of document.querySelectorAll(".theme")) c.setAttribute("aria-checked", String(c.dataset.theme === id));
  }
  // previews: ?mock=1&preview=1 never connects (so never redirects back here) and remembers nothing; only cards on
  // screen while this step is open run, the rest are blank (phones stay cool)
  function previewUrl(id) {
    const cat = $("cat").checked ? $("cat-coat").value : "0";
    return `index.html?mock=1&preview=1&mode=ambient&theme=${encodeURIComponent(id)}&cat=${cat}&boost=${$("boost").value}`;
  }
  function loadPreview(card) {
    const iframe = card.querySelector("iframe");
    const want = state.step === 2 && !$("wizard").hidden && card._visible ? previewUrl(card.dataset.theme) : "about:blank";
    if (iframe.dataset.src !== want) { iframe.dataset.src = want; iframe.src = want; }
  }
  function themesActive() { for (const c of document.querySelectorAll(".theme")) loadPreview(c); }
  let refreshTimer = 0;
  function refreshPreviews() { clearTimeout(refreshTimer); refreshTimer = setTimeout(themesActive, 300); }

  // ---------------------------------------------------------------- 4. data
  function buildData() {
    const box = $("news-presets");
    for (const p of NEWS_PRESETS) {
      const row = el("div", "preset");
      const lab = el("label", "check");
      const cb = el("input");
      cb.type = "checkbox"; cb.dataset.url = p.url; cb.dataset.label = p.label;
      cb.setAttribute("aria-label", p.label + " (" + p.note + ")");
      lab.append(cb, el("span", null, p.label), el("span", "note", p.note));
      const t = el("button", "link", "test");
      t.type = "button"; t.setAttribute("aria-label", "Test " + p.label);
      const out = el("p", "msg");
      t.addEventListener("click", () => testFeed(p.url, out));
      lab.append(t);
      row.append(lab, out);
      box.append(row);
    }
    $("add-feed").addEventListener("click", () => addFeed());
    $("add-host").addEventListener("click", () => addHost());
    addHost();
    $("cal-url").addEventListener("input", () => {
      const v = $("cal-url").value;
      msg("cal-warn", /\/public\/basic\.ics/i.test(v)
        ? "That is the public address: it only works for a public calendar. Use the secret address." : "", "warn");
    });
  }

  function feedCount() {
    return document.querySelectorAll("#news-presets input:checked").length + document.querySelectorAll("#news-custom .feed").length;
  }
  function addFeed() {
    if (feedCount() >= MAX_FEEDS) return;
    const row = el("div", "feed field");
    const r1 = el("div", "row");
    const url = el("input");
    url.type = "url"; url.placeholder = "https://example.com/feed.xml"; url.maxLength = 2000; url.spellcheck = false;
    url.className = "feed-url";
    url.setAttribute("aria-label", "Feed address");
    const t = el("button", "small", "Test");
    t.type = "button";
    const rm = el("button", "small ghost remove", "✕");
    rm.type = "button"; rm.setAttribute("aria-label", "Remove this feed");
    r1.append(url, t, rm);
    const r2 = el("div", "row");
    const label = el("input");
    label.placeholder = "Name on the wall (optional)"; label.maxLength = 60; label.className = "feed-label";
    label.setAttribute("aria-label", "Feed name");
    const loc = el("label", "check");
    const cb = el("input");
    cb.type = "checkbox"; cb.className = "feed-local"; cb.setAttribute("aria-label", "Local news");
    loc.append(cb, el("span", null, "local"));
    loc.title = "Local news ranks above the other feeds";
    r2.append(label, loc);
    const out = el("p", "msg");
    t.addEventListener("click", () => testFeed(url.value.trim(), out));
    rm.addEventListener("click", () => row.remove());
    row.append(r1, r2, out);
    $("news-custom").append(row);
    url.focus();
  }
  async function testFeed(url, out) {
    if (!url) { out.textContent = "Paste a feed address first."; out.className = "msg warn"; return; }
    out.textContent = "Fetching…"; out.className = "msg";
    const res = await call("api/setup/test-feed", { url });
    if (!res.ok) { out.textContent = detail(res); out.className = "msg err"; return; }
    const d = res.data || {};
    if (d.ok) { out.textContent = `✓ ${d.title ? d.title + ": " : ""}${d.headline}`; out.className = "msg ok"; }
    else { out.textContent = d.error || "no headlines"; out.className = "msg err"; }
  }

  function addHost() {
    if (document.querySelectorAll("#hosts .host").length >= MAX_HOSTS) return;
    const row = el("div", "host field");
    const r = el("div", "row");
    const name = el("input");
    name.placeholder = "name (homelab)"; name.maxLength = 32; name.className = "host-name"; name.spellcheck = false;
    name.setAttribute("aria-label", "Computer name");
    const addr = el("input");
    addr.placeholder = "IP or hostname (192.168.1.10)"; addr.maxLength = 253; addr.className = "host-addr";
    addr.spellcheck = false; addr.inputMode = "url";
    addr.setAttribute("aria-label", "IP address or hostname");
    const rm = el("button", "small ghost remove", "✕");
    rm.type = "button"; rm.setAttribute("aria-label", "Remove this computer");
    rm.addEventListener("click", () => row.remove());
    r.append(name, addr, rm);
    row.append(r);
    $("hosts").append(row);
  }

  // ---------------------------------------------------------------- the answers (POST body)
  function collect() {
    const loc = { name: $("loc-name").value.trim(), lat: num($("loc-lat").value), lon: num($("loc-lon").value),
                  timezone: $("loc-tz").value.trim() || browserTz() };
    if (state.region && state.regionFor === loc.name) loc.region = state.region;
    const site = !$("ec-card").hidden && $("ec-on").checked ? ecSite() : null;
    state.newsRows = []; state.hostRows = [];
    const news = [];
    for (const cb of document.querySelectorAll("#news-presets input:checked")) {
      news.push({ url: cb.dataset.url, label: cb.dataset.label });
      state.newsRows.push(cb.closest(".preset"));
    }
    for (const row of document.querySelectorAll("#news-custom .feed")) {
      const url = row.querySelector(".feed-url").value.trim();
      if (!url) continue;
      const f = { url };
      const label = row.querySelector(".feed-label").value.trim();
      if (label) f.label = label;
      if (row.querySelector(".feed-local").checked) f.local = true;
      news.push(f);
      state.newsRows.push(row);
    }
    const hosts = [];
    for (const row of document.querySelectorAll("#hosts .host")) {
      const name = row.querySelector(".host-name").value.trim(), address = row.querySelector(".host-addr").value.trim();
      if (!name && !address) continue;
      hosts.push({ name, address });
      state.hostRows.push(row);
    }
    const sp = { client_id: $("sp-id").value.trim(), client_secret: $("sp-secret").value.trim(), refresh_token: $("sp-token").value.trim() };
    const cal = $("cal-url").value.trim();
    return {
      location: loc,
      envcanada: site ? { site: site.code, province: site.province, name: site.name } : null,
      schedule: {
        work_start: $("work-start").value || "07:00", work_end: $("work-end").value || "17:00",
        work_days: Array.from(document.querySelectorAll("#days input:checked")).map((i) => +i.value).sort((a, b) => a - b),
        hour24: $("hour24").checked,
      },
      look: { theme: state.theme, cat: $("cat").checked, cat_coat: $("cat-coat").value, sound: $("sound").checked, boost: +$("boost").value },
      news,
      calendar: cal ? { url: cal } : null,
      hosts,
      spotify: sp.client_id || sp.client_secret || sp.refresh_token ? sp : null,
    };
  }

  // ---------------------------------------------------------------- 5. review + save
  function summaryRows(b) {
    const days = b.schedule.work_days.length ? b.schedule.work_days.map((d) => DAY_NAMES[d]).join(" ") : "none (always ambient)";
    const theme = (THEMES.find((t) => t.id === b.look.theme) || { name: b.look.theme }).name;
    const look = [theme, b.look.cat ? `cat (${b.look.cat_coat})` : null, b.look.sound ? "sound on" : "sound off",
      b.look.boost ? `projector boost ${["off", "low", "medium", "high"][b.look.boost]}` : null].filter(Boolean).join(" · ");
    const lat = typeof b.location.lat === "number" ? b.location.lat.toFixed(4) : b.location.lat;
    const lon = typeof b.location.lon === "number" ? b.location.lon.toFixed(4) : b.location.lon;
    return [
      ["Place", `${b.location.name} · ${lat}, ${lon} · ${b.location.timezone}`, 0],
      ["Weather", b.envcanada ? `Open-Meteo + Environment Canada (${b.envcanada.name}, ${b.envcanada.province})` : "Open-Meteo", 0],
      ["Work hours", `${b.schedule.work_start}–${b.schedule.work_end} · ${days} · ${b.schedule.hour24 ? "24-hour" : "12-hour"} clock`, 1],
      ["Look", look, 2],
      ["News", b.news.length ? b.news.map((f) => f.label || f.url.replace(/^https?:\/\//, "").split("/")[0]).join(", ") : "none", 3],
      ["Calendar", b.calendar ? "yes (secret address, kept in secrets.toml)" : "none", 3],
      ["Computers", b.hosts.length ? b.hosts.map((h) => `${h.name} (${h.address})`).join(", ") : "none", 3],
      ["Spotify", b.spotify ? "connected (keys kept in secrets.toml)" : "none", 3],
    ];
  }

  async function review() {
    const body = collect();
    const dl = $("summary");
    dl.textContent = "";
    for (const [k, v, step] of summaryRows(body)) {
      const row = el("div");
      const edit = el("button", "link", "edit");
      edit.type = "button";
      edit.setAttribute("aria-label", `Edit ${k.toLowerCase()}`);
      edit.addEventListener("click", () => go(step));
      row.append(el("dt", null, k), el("dd", null, v), edit);
      dl.append(row);
    }
    $("toml").textContent = "…";
    const res = await call("api/setup/preview", body);
    if (state.step !== state.steps.length - 1) return;
    if (res.ok && res.data) {
      $("toml").textContent = res.data.config_toml || "";
      if (res.data.errors && res.data.errors.length) markErrors(res.data.errors, true);
      else { $("errors").hidden = true; clearErrors(); }
    } else if (res.status === 409) {
      state.done = true;
      show("already", "Someone finished the setup a moment ago.");
    } else {
      $("toml").textContent = `(no preview: ${detail(res)})`;
    }
  }

  async function save() {
    if (state.saving) return;
    state.saving = true;
    $("next").disabled = true;
    $("next").textContent = "Saving…";
    const res = await call("api/setup", collect());
    state.saving = false;
    $("next").disabled = false;
    $("next").textContent = "Save and start";
    const d = res.data || {};
    if (res.ok && d.ok) {
      state.done = true;
      try { localStorage.removeItem(SKIP_KEY); } catch (e) { /* no storage */ }
      msg("saved-note", d.applied ? "" : (d.note || "Saved. Restart the wall to load it: docker compose restart wall"), "warn");
      $("saved-sources").textContent = Array.isArray(d.sources) ? `Sources: ${d.sources.join(", ")}` : "";
      return show("saved");
    }
    if (res.status === 422 && Array.isArray(d.errors)) {
      if ($("wizard").hidden) show("wizard");      // "Try again" from the write-error page
      return markErrors(d.errors, true);
    }
    if (d.write_error) return writeError(d);
    if (res.status === 409) { state.done = true; return show("already", "Someone finished the setup a moment ago."); }
    if ($("wizard").hidden) show("wizard");
    markErrors([{ field: "review", message: `Saving failed: ${detail(res)}` }], true);
  }

  // ---------------------------------------------------------------- errors
  function clearErrors() {
    for (const e of document.querySelectorAll(".err-msg")) e.remove();
    for (const e of document.querySelectorAll(".invalid")) e.classList.remove("invalid");
  }
  function fieldEl(field) {
    const exact = document.querySelector(`[data-field="${CSS.escape(field)}"]`);
    if (exact) return exact;
    const m = /^(news|hosts)\.(\d+)\./.exec(field);
    if (m) return (m[1] === "news" ? state.newsRows : state.hostRows)[+m[2]] || $(m[1] === "news" ? "src-news" : "src-hosts");
    const top = field.split(".")[0];
    return document.querySelector(`[data-field="${CSS.escape(top)}"]`);
  }
  // Put each message under its field; on the review step also list them all, then jump to the first one's step.
  function markErrors(errors, jump) {
    clearErrors();
    const box = $("errors");
    const ul = el("ul");
    for (const e of errors) {
      const target = e.field === "review" ? null : fieldEl(e.field);
      if (target) { target.classList.add("invalid"); target.append(el("p", "err-msg", e.message)); }
      const li = el("li", null, `${e.field === "review" ? "" : e.field + ": "}${e.message}`);
      ul.append(li);
    }
    box.textContent = "";
    box.append(el("b", null, errors.length === 1 ? "One thing to fix:" : `${errors.length} things to fix:`), ul);
    box.hidden = false;
    if (jump) {
      const first = errors.find((e) => e.field !== "review");
      const step = first ? STEP_OF[first.field.split(".")[0]] : undefined;
      if (step !== undefined && step !== state.step) {
        state.step = step;   // go() without re-running the preview (it would clear these marks)
        state.steps.forEach((s, k) => { s.hidden = k !== step; });
        document.querySelectorAll("#steps li").forEach((li, k) => { li.classList.toggle("on", k === step); li.classList.toggle("done", k < step); });
        $("back").disabled = step === 0;
        $("next").textContent = "Next";
        themesActive();
      }
      const t = first && fieldEl(first.field);
      if (t) t.scrollIntoView({ block: "center" });
    }
  }

  // ---------------------------------------------------------------- could not write config/
  function writeError(d) {
    msg("we-msg", d.write_error, "err");
    $("we-hint").textContent = d.hint || "";
    $("we-config").value = d.config_toml || "";
    $("we-secrets-box").hidden = !d.secrets_toml;
    $("we-secrets").value = d.secrets_toml || "";
    show("write-error");
  }
  function copy(ta, btn) {
    const done = () => { const t = btn.textContent; btn.textContent = "Copied"; setTimeout(() => { btn.textContent = t; }, 1500); };
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(ta.value).then(done, () => legacyCopy(ta) && done()); return; }
    if (legacyCopy(ta)) done();
  }
  function legacyCopy(ta) { // http on a LAN is not a secure context: no async clipboard there
    ta.focus(); ta.select();
    try { return document.execCommand("copy"); } catch (e) { return false; }
  }
  function download(ta, name) {
    const url = URL.createObjectURL(new Blob([ta.value], { type: "application/toml" }));
    const a = el("a");
    a.href = url; a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.AWSetup = { state, collect, go }; // tests
  boot();
})();
