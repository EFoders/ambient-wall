"""Every theme (as registered at runtime, plus any index.html theme script that failed to register) in a row of
states, night and day: work, work with critical news, overlay over work, ambient (night), overlay over ambient,
ambient by day (noon, golden hour, overcast, rain), the work face by day (its faint day backdrop) and at night.
Each state: no page errors, brightness rules at 1920x1080 (max <= 225, no white, mean < 25 + 20 * frame.day, the
day budget of THEMES.md rule 2, read from __AW_FRAME.day) and theme.render() CPU median < 8 ms.

Then the work backdrop (THEMES.md "Daytime"), per theme, with AW._debug.forceDay pinning frame.day:
  - at day = 0 it is gone: a night work face equals the same frame with day forced to 0, and with day forced to 0
    at noon the work face reacts to the weather no more than it does at night (nothing of the day scene leaks);
  - by day it is there (the noon work face differs from the same instant with day forced to 0);
  - by day the HUD stays legible: the text keeps its contrast against the background around it.

One page per theme is reused across its states (switching state in place is much faster than reloading).
Themes are being edited concurrently by other agents: a failure here is a finding to report, not to paper over.
"""
import numpy as np
import pytest

from conftest import FILE_URL, ON_CI, TZ, _attach_errors, discover_themes, index_theme_ids, metrics, real_errors, shot

W, H = 1920, 1080
RENDER_BUDGET_MS = 8.0

# name: (local time, ambient?, mock weather, ambient seconds, mock news index, overlay panel)
STATE_DEFS = {
    "work":               ("2026-10-09T10:20:00", False, "overcast", 0, 0, None),
    "work-news-critical": ("2026-10-09T10:20:00", False, "overcast", 0, 1, None),
    "overlay-work":       ("2026-10-09T10:20:00", False, "overcast", 0, 1, "news"),
    "ambient":            ("2026-10-09T22:30:00", True, "overcast", 19800, 0, None),  # 5.5 h into the evening
    "overlay-ambient":    ("2026-10-09T22:30:00", True, "overcast", 19800, 0, "forecast"),
    "work-night":         ("2026-10-09T22:30:00", False, "clear", 0, 0, None),  # day = 0: no backdrop
    "day-noon":           ("2026-10-10T13:00:00", True, "clear", 3600, 0, None),  # a Saturday: ambient all day
    "day-golden":         ("2026-10-10T17:40:00", True, "clear", 3600, 0, None),
    "day-overcast":       ("2026-10-10T13:00:00", True, "overcast", 3600, 0, None),
    "day-rain":           ("2026-10-10T13:00:00", True, "rain", 3600, 0, None),
    "work-day":           ("2026-10-09T12:30:00", False, "clear", 0, 0, None),  # the work face's day backdrop
}
STATES = list(STATE_DEFS)
NIGHT_STATES = {"ambient", "overlay-ambient", "work-night"}

SET_STATE = """async (s) => {
  const D = AW._debug, ms = D.modeState;
  D.overlay.panel = null;                       // hard-clear any panel (no fade)
  D.forceDay = null;
  D.warpTo(s.at);
  D.mock.newsIdx = s.news;
  D.mock.weatherIdx = Math.max(0, D.WEATHER.findIndex((w) => w.name === s.wx));
  ms.override = s.ambient ? "ambient" : "work";
  ms.blend = s.ambient ? 1 : 0;                 // snap: the exhale has its own test (shoot.py transition)
  ms.elapsedOverride = null;
  ms.overrideSince = new Date(s.at);
  ms.elapsedNudge = s.ambient ? s.elapsed : 0;
  if (s.overlay) D.overlay.show(s.overlay, undefined, { duration: 600, instant: true });
  return true;
}"""

PERF = """async (secs) => {
  const th = AW._debug.themes.find((t) => t.id === AW._debug.theme());
  const orig = th.render, rt = [];
  th.render = function (c, f) { const t0 = performance.now(); try { return orig.call(this, c, f); } finally { rt.push(performance.now() - t0); } };
  const ov0 = Array.from(AW._debug.overlayPerf);
  await new Promise((res) => setTimeout(res, secs * 1000));
  th.render = orig;
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
  return { n: rt.length, median: med(rt.slice(3)), p95: rt.length ? rt.slice().sort((x, y) => x - y)[Math.floor(rt.length * 0.95)] : null,
           overlay: med(Array.from(AW._debug.overlayPerf).filter((v) => v > 0)) };
}"""

_pages = {}
_last = {}     # theme -> (weather, day/night) of the state its page shows, to know when to let things settle
RESULTS = {}   # (theme, state) -> dict, printed as a table at the end of the session


@pytest.fixture(scope="session")
def theme_page(browser):
    def get(theme):
        # one live page at a time: a finished theme's page would keep animating at full size in the background and
        # starve the next theme's frames (on a GPU-less CI runner, four hidden pages cut a theme to ~5 fps)
        for other in [t for t in _pages if t != theme]:
            _pages.pop(other).close()
            _last.pop(other, None)
        if theme not in _pages:
            pg = _attach_errors(browser.new_page(viewport={"width": W, "height": H}, timezone_id=TZ))
            pg.goto(f"{FILE_URL}?theme={theme}&mode=work&at=2026-10-09T10:20&news=top")
            pg.wait_for_function("window.AW && AW._debug && window.__AW_FRAME")
            pg.wait_for_timeout(1500)
            _pages[theme] = pg
            _last[theme] = ("overcast", "day")
        return _pages[theme]
    yield get
    for pg in _pages.values():
        pg.close()
    _pages.clear()


def pytest_generate_tests(metafunc):
    if "theme_id" in metafunc.fixturenames:
        metafunc.parametrize("theme_id", discover_themes())


def set_state(pg, theme_id, state):
    """Put the page in a named state and wait until it is showing it: weather eases over a few seconds and some
    themes re-bake on a change of daylight, so a change of either gets longer to settle."""
    at, ambient, wx, elapsed, news, overlay = STATE_DEFS[state]
    pg.evaluate(SET_STATE, {"at": at, "ambient": ambient, "wx": wx, "elapsed": elapsed, "news": news, "overlay": overlay})
    key = (wx, "night" if state in NIGHT_STATES else "day")
    pg.wait_for_timeout(700 if _last.get(theme_id) == key else 3000)
    _last[theme_id] = key


def test_every_index_theme_registers(browser):
    pg = _attach_errors(browser.new_page(viewport={"width": 1280, "height": 720}, timezone_id=TZ))
    try:
        pg.goto(FILE_URL + "?mock=1")
        pg.wait_for_function("window.AW && AW._debug")
        pg.wait_for_timeout(500)
        ids = pg.evaluate("AW._debug.themes.map((t) => t.id)")
        missing = [t for t in index_theme_ids() if t not in ids]
        assert not missing, f"theme scripts that did not register: {missing}; errors: {real_errors(pg)}"
        assert real_errors(pg) == []
    finally:
        pg.close()


@pytest.mark.parametrize("state", STATES)
def test_theme_state(theme_page, theme_id, state):
    pg = theme_page(theme_id)
    assert pg.evaluate("AW._debug.theme()") == theme_id, f"{theme_id} not active (registered? errors: {real_errors(pg)})"
    n0 = len(pg.errors)
    set_state(pg, theme_id, state)
    fr = pg.evaluate("({m: __AW_FRAME.mode, b: __AW_FRAME.blend, o: __AW_FRAME.overlay && __AW_FRAME.overlay.panel,"
                     " day: __AW_FRAME.day, crit: !!(__AW_FRAME.signals.news && __AW_FRAME.signals.news.critical)})")
    mx, white, mean = metrics(shot(pg))
    limit = 25 + 20 * fr["day"]  # the brightness budget: 25 at night, 45 in full daylight (THEMES.md rule 2)
    perf = pg.evaluate(PERF, 1.0)
    errs = [e for e in pg.errors[n0:] if not ("themes/" in e and "ERR_FILE_NOT_FOUND" in e)]
    RESULTS[(theme_id, state)] = dict(max=mx, white=white, mean=round(mean, 1), day=fr["day"], render=perf["median"],
                                      p95=perf["p95"], overlay=perf["overlay"] if fr["o"] else None, errors=len(errs))
    assert fr["m"] == ("ambient" if STATE_DEFS[state][1] else "work")
    assert (fr["o"] is not None) == (STATE_DEFS[state][5] is not None), fr
    if state in NIGHT_STATES:
        assert fr["day"] == 0, f"{state} should be night, frame.day = {fr['day']}"
    elif state.startswith("day-") or state == "work-day":
        assert fr["day"] > 0.9, f"{state} should be daylight, frame.day = {fr['day']}"
    assert errs == [], errs
    assert mx <= 225, f"max channel {mx}"
    assert white == 0, f"{white} near-white pixels"
    assert mean < limit, f"mean luminance {mean:.1f} (limit {limit:.0f} at day {fr['day']:.2f})"
    # Frame-rate and render-time budgets only mean something on real hardware: a GPU-less CI runner software-
    # renders at a few frames a second, so there it only checks the theme keeps animating.
    if ON_CI:
        assert perf["n"] > 1, f"only {perf['n']} frames rendered in 1 s"
    else:
        assert perf["n"] > 20, f"only {perf['n']} frames rendered in 1 s"
        assert perf["median"] < RENDER_BUDGET_MS, f"render median {perf['median']:.2f} ms"


# ---------------------------------------------------------------- the work backdrop
def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def mad(a, b):
    """Mean absolute luminance difference between two shots."""
    return float(np.abs(lum(a) - lum(b)).mean())


def dilate(m, r):
    """Binary dilation by a (2r+1) square, separable, numpy only."""
    out = m.copy()
    for k in range(1, r + 1):
        out[k:, :] |= m[:-k, :]
        out[:-k, :] |= m[k:, :]
    rows = out.copy()
    for k in range(1, r + 1):
        out[:, k:] |= rows[:, :-k]
        out[:, :-k] |= rows[:, k:]
    return out


def contrast(a, text, ring):
    """Text luminance (median) over the brightest tenth of the background just around it."""
    la = lum(a)
    return float(np.median(la[text])) - float(np.percentile(la[ring], 90))


_bd = {}


def backdrop_shots(pg, theme_id):
    """The work face at night (natural, and with day forced to 0), the same as the weather turns partly cloudy, then
    at noon with day forced to 0 (clear, then partly cloudy) and at noon for real. Cached per theme."""
    if theme_id in _bd:
        return _bd[theme_id]
    D = "AW._debug"
    wx = lambda name: pg.evaluate(f"{D}.mock.weatherIdx = {D}.WEATHER.findIndex((w) => w.name === {name!r})")
    s = {}
    try:
        set_state(pg, theme_id, "work-night")                        # 22:30, clear, frame.day = 0
        pg.wait_for_timeout(1000)
        s["night_day"] = pg.evaluate("__AW_FRAME.day")
        s["N1"] = shot(pg); pg.wait_for_timeout(300); s["N2"] = shot(pg)
        pg.evaluate(f"{D}.forceDay = 0"); pg.wait_for_timeout(500)
        s["F"] = shot(pg)
        wx("partly"); pg.wait_for_timeout(1500)                     # no actionable sliver: only a scene would change
        s["Np"] = shot(pg)
        wx("clear"); pg.evaluate(f"{D}.warpTo('2026-10-09T12:30:00')"); pg.wait_for_timeout(2500)
        s["forced_day"] = pg.evaluate("__AW_FRAME.day")
        s["Z"] = shot(pg)                                          # noon, day forced to 0, clear
        wx("partly"); pg.wait_for_timeout(1500)
        s["Zp"] = shot(pg)
        wx("clear"); pg.evaluate(f"{D}.forceDay = null"); pg.wait_for_timeout(2500)
        s["real_day"] = pg.evaluate("__AW_FRAME.day")
        s["D"] = shot(pg)                                          # noon for real, clear: the backdrop is in
        s["errors"] = real_errors(pg)
    finally:
        pg.evaluate(f"{D}.forceDay = null")
        _last[theme_id] = None
    _bd[theme_id] = s
    return s


def test_work_night_unchanged_at_day_zero(theme_page, theme_id):
    pg = theme_page(theme_id)
    assert pg.evaluate("AW._debug.theme()") == theme_id
    s = backdrop_shots(pg, theme_id)
    assert s["night_day"] == 0 and s["forced_day"] == 0, (s["night_day"], s["forced_day"])
    noise = mad(s["N1"], s["N2"])
    forced = mad(s["N1"], s["F"])
    assert forced <= 2 * noise + 0.05, f"night work face changed when frame.day was forced to 0: {forced:.3f} (noise {noise:.3f})"
    # with no daylight, the day scene must not leak in: the noon work face (day forced to 0) reacts to the weather no
    # more than the night work face does
    w_night, w_forced = mad(s["F"], s["Np"]), mad(s["Z"], s["Zp"])
    assert w_forced <= w_night + 2 * noise + 0.15, f"work face at day 0 follows the weather: {w_forced:.3f} vs night {w_night:.3f}"


def test_work_day_backdrop_present(theme_page, theme_id):
    pg = theme_page(theme_id)
    s = backdrop_shots(pg, theme_id)
    assert s["real_day"] > 0.9
    noise = mad(s["N1"], s["N2"])
    d = mad(s["D"], s["Z"])
    assert d >= max(0.4, 3 * noise), f"no work backdrop by day: mean |day - day forced 0| = {d:.3f} (noise {noise:.3f})"


def test_work_day_hud_legible(theme_page, theme_id):
    pg = theme_page(theme_id)
    s = backdrop_shots(pg, theme_id)
    z, d = s["Z"], s["D"]
    # the HUD's text: what is bright on the work face without the backdrop (same instant, day forced to 0); the
    # background: a ring 5-16 px around it. Halved for speed; medians and percentiles keep it steady.
    z2, d2 = z[::2, ::2], d[::2, ::2]
    text = lum(z2) > 110
    assert text.sum() > 400, f"no HUD text found ({int(text.sum())} px)"
    ring = dilate(text, 8) & ~dilate(text, 2)
    c0, c1 = contrast(z2, text, ring), contrast(d2, text, ring)
    RESULTS[(theme_id, "legibility")] = dict(c0=round(c0), c1=round(c1))
    assert c1 >= 60, f"HUD contrast by day only {c1:.0f} (without the backdrop {c0:.0f})"
    assert c1 >= 0.75 * c0, f"the day backdrop costs the HUD too much contrast: {c1:.0f} vs {c0:.0f} without it"


def summary_table():
    if not RESULTS:
        return ""
    lines = ["", "theme smoke (max / white / mean[/limit if day] / render median ms / overlay ms / errors):"]
    themes = sorted({t for t, _ in RESULTS})
    for t in themes:
        cells = []
        for s in STATES:
            r = RESULTS.get((t, s))
            if not r:
                cells.append(f"{s}: -")
                continue
            ov = f" ov {r['overlay']:.2f}" if r["overlay"] is not None else ""
            lim = f"/{25 + 20 * r['day']:.0f}" if r["day"] > 0 else ""
            cells.append(f"{s}: {r['max']}/{r['white']}/{r['mean']}{lim}/{(r['render'] or 0):.2f}{ov}{' ERR' if r['errors'] else ''}")
        leg = RESULTS.get((t, "legibility"))
        if leg:
            cells.append(f"hud contrast night/day: {leg['c0']}/{leg['c1']}")
        lines.append(f"  {t:13s} " + " | ".join(cells))
    return "\n".join(lines)
