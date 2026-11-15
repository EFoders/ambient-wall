"""Info overlay (js/overlay.js + core's overlay state): panels render, obey the brightness rules, time correctly,
respond to O / Esc / ?show=, show the quiet line when empty, and honour a theme's overlayStyle / renderOverlay."""
import pytest

from conftest import PANELS, VOID_THEME, box_clip, energy, metrics, poll, real_errors, shot

WORK = "mode=work&at=2026-10-09T11:20"


def show(pg, panel, data="undefined", duration=600, instant=True):
    pg.evaluate(f"AW._debug.overlay.show({panel!r}, {data}, {{duration: {duration}, instant: {str(instant).lower()}}})")


# ---------------------------------------------------------------- every panel
@pytest.mark.parametrize("panel", PANELS)
def test_panel_renders_bright_rules_and_text(open_page, panel):
    pg = open_page(WORK + "&news=critical", w=1920, h=1080)
    pg.evaluate(VOID_THEME)
    show(pg, panel)
    pg.wait_for_timeout(250)
    info = pg.evaluate("({...AW.overlay.info, style: null})")
    assert info["panel"] == panel and not info["empty"] and info["rows"] > 0, info
    f = pg.evaluate("({p: __AW_FRAME.overlay.panel, a: __AW_FRAME.overlay.a})")
    assert f == {"p": panel, "a": 1}
    a = shot(pg, box_clip(pg))
    mx, white, mean = metrics(a)
    assert mx <= 225 and white == 0, (mx, white)
    assert mean < 60, mean
    lit = energy(a)
    # versus the same panel with no data: rows of text light far more of the box than one quiet line
    show(pg, panel, "null")
    pg.wait_for_timeout(200)
    assert pg.evaluate("AW.overlay.info.empty") is True
    quiet = energy(shot(pg, box_clip(pg)))
    assert quiet > 0, "quiet line drew nothing"
    assert lit > 3 * quiet, (lit, quiet)
    # and nothing at all once dismissed
    pg.evaluate("AW._debug.overlay.panel = null")
    pg.wait_for_timeout(150)
    full = shot(pg)
    assert energy(full) == 0
    assert real_errors(pg) == []


def test_panel_over_a_real_theme_keeps_the_rules(open_page):
    pg = open_page(WORK + "&news=critical&theme=cyberpunk", w=1920, h=1080)
    show(pg, "news")
    pg.wait_for_timeout(300)
    mx, white, mean = metrics(shot(pg, box_clip(pg)))
    assert mx <= 225 and white == 0 and mean < 40, (mx, white, mean)
    mx, white, mean = metrics(shot(pg))
    limit = 25 + 20 * pg.evaluate("__AW_FRAME.day")  # 11:20 is daylight: the day budget (THEMES.md rule 2)
    assert mx <= 225 and white == 0 and mean < limit, (mx, white, mean, limit)
    assert real_errors(pg) == []


def test_frame_overlay_is_null_without_a_panel(open_page):
    pg = open_page(WORK)
    assert pg.evaluate("__AW_FRAME.overlay") is None
    assert pg.evaluate("AW._debug.overlay.phase") == "idle"


# ---------------------------------------------------------------- timing
SAMPLE = """async ([panel, duration, secs]) => {
  const ov = AW._debug.overlay, out = [];
  const t0 = performance.now();
  ov.show(panel, undefined, { duration });
  await new Promise((res) => {
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      const f = window.__AW_FRAME.overlay;
      out.push([t, ov.a, ov.phase, f ? f.a : null]);
      if (t < secs) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  return out;
}"""


def test_fade_in_hold_fade_out_timing(open_page):
    pg = open_page(WORK)
    s = pg.evaluate(SAMPLE, ["forecast", 1.0, 3.3])
    assert len(s) > 60, "too few frames sampled"
    at = lambda t0, t1: [x for x in s if t0 <= x[0] < t1]
    # fade in 0.6 s, eased: low early, ~half mid-way, full by 0.6 (+ one frame of slack)
    assert all(x[1] < 0.2 for x in at(0, 0.1)), at(0, 0.1)
    assert all(0.15 < x[1] < 0.9 for x in at(0.25, 0.35))
    full_from = next(x[0] for x in s if x[1] >= 0.999)
    assert 0.5 <= full_from <= 0.72, full_from
    ins = [x[1] for x in at(0, full_from)]
    assert ins == sorted(ins), "fade-in not monotonic"
    # hold `duration` (1 s) at full alpha
    assert all(x[1] == 1 and x[2] == "hold" for x in at(0.75, 1.55))
    # fade out 1.2 s: monotonic down, gone around 0.6 + 1 + 1.2 = 2.8 s
    outs = at(1.65, 3.3)
    assert outs and all(x[2] in ("out", "idle") for x in outs)
    vals = [x[1] for x in outs]
    assert vals == sorted(vals, reverse=True), "fade-out not monotonic"
    gone = next(x[0] for x in s if x[0] > 1 and x[2] == "idle")
    assert 2.65 <= gone <= 3.0, gone
    mid = [x[1] for x in at(2.15, 2.25)]
    assert mid and all(0.2 < v < 0.8 for v in mid), mid  # eased half-way through the fade-out
    # themes see the same eased alpha, and null once it is gone
    assert all(x[3] is None for x in s if x[2] == "idle" and x[0] > gone + 0.05)
    assert all(x[3] is None or abs(x[3] - x[1]) < 0.2 for x in s)
    assert real_errors(pg) == []


def test_replacing_a_visible_panel_keeps_alpha_continuous(open_page):
    pg = open_page(WORK)
    show(pg, "forecast")
    pg.wait_for_timeout(100)
    show(pg, "news", instant=False)
    r = pg.evaluate("({p: AW._debug.overlay.panel, a: AW._debug.overlay.a})")
    assert r["p"] == "news" and r["a"] > 0.95, r


# ---------------------------------------------------------------- keys + url
def test_escape_dismisses(open_page):
    pg = open_page(WORK)
    show(pg, "calendar")
    pg.keyboard.press("Escape")
    assert pg.evaluate("AW._debug.overlay.phase") == "out"
    assert poll(pg, "__AW_FRAME.overlay === null", timeout=2.0)
    # Esc with nothing up does nothing
    pg.keyboard.press("Escape")
    assert pg.evaluate("__AW_FRAME.overlay") is None
    assert real_errors(pg) == []


def test_o_cycles_all_six_panels(open_page):
    pg = open_page(WORK)
    seen = []
    for _ in range(7):
        pg.keyboard.press("o")
        pg.wait_for_timeout(80)
        seen.append(pg.evaluate("AW._debug.overlay.panel"))
    assert seen == PANELS + [PANELS[0]]
    assert pg.evaluate("AW._debug.overlay.origin") == "mock"
    assert pg.evaluate("AW._debug.source()") == "mock"  # O is not a mock-forcing dev key
    assert real_errors(pg) == []


def test_o_continues_after_url_show(open_page):
    pg = open_page(WORK + "&show=finance&showfor=600")
    assert pg.evaluate("AW._debug.overlay.panel") == "finance"
    pg.keyboard.press("O")
    assert pg.evaluate("AW._debug.overlay.panel") == "news"


def test_url_show_and_showfor(open_page):
    pg = open_page(WORK + "&show=warnings&showfor=600", wait=900)
    r = pg.evaluate("({p: __AW_FRAME.overlay.panel, a: __AW_FRAME.overlay.a, d: AW._debug.overlay.duration, "
                    "o: AW._debug.overlay.origin, ph: AW._debug.overlay.phase})")
    assert r["p"] == "warnings" and r["a"] == 1 and r["d"] == 600 and r["ph"] == "hold", r
    assert r["o"].startswith("url"), r
    # showfor overrides every duration, not just the URL's panel
    pg.keyboard.press("o")
    assert pg.evaluate("AW._debug.overlay.duration") == 600


def test_url_show_without_showfor_uses_default_duration(open_page):
    pg = open_page(WORK + "&show=pulse")
    assert pg.evaluate("AW._debug.overlay.duration") == 20


@pytest.mark.parametrize("bad", ["bogus", "", "__proto__", "FORECAST"])
def test_url_show_unknown_panel_is_ignored(open_page, bad):
    pg = open_page(WORK + f"&show={bad}", wait=800)
    assert pg.evaluate("__AW_FRAME.overlay") is None
    assert pg.evaluate("AW._debug.overlay.phase") == "idle"
    assert real_errors(pg) == []
    pg.keyboard.press("o")  # still usable afterwards
    assert pg.evaluate("AW._debug.overlay.panel") == "forecast"


# ---------------------------------------------------------------- empty data
@pytest.mark.parametrize("panel,data", [
    ("calendar", "{panel: 'calendar', title: 'Today', ts: '2026-10-09T11:20:00-04:00', events: []}"),
    ("news", "null"),
    ("warnings", "{panel: 'warnings', title: 'Weather warnings', ts: '2026-10-09T11:20:00-04:00', items: []}"),
    ("forecast", "{panel: 'forecast', days: []}"),
    ("pulse", "{}"),
    ("finance", "{panel: 'finance', categories: []}"),
])
def test_empty_panel_shows_quiet_line(open_page, panel, data):
    pg = open_page(WORK, w=1920, h=1080)
    pg.evaluate(VOID_THEME)
    show(pg, panel, data)
    pg.wait_for_timeout(200)
    info = pg.evaluate("({...AW.overlay.info, style: null})")
    assert info["empty"] is True and info["rows"] == 0 and info["quiet"], info
    if panel == "calendar":
        assert info["quiet"] == "Nothing today"
    a = shot(pg, box_clip(pg))
    assert 0 < energy(a) < 60000, energy(a)  # a title and one quiet line, not an empty frame
    assert info["box"]["h"] < 400, info["box"]  # a small panel, not a big empty one
    assert real_errors(pg) == []


# ---------------------------------------------------------------- theme hooks
PROBE_THEME = """([style, ret]) => {
  window.__styleCalls = 0; window.__roCalls = 0;
  AW.registerTheme({
    id: "probe", name: "Probe",
    render(ctx, f) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.width, f.height); },
    overlayStyle: style ? (f) => { window.__styleCalls++; window.__styleFrame = !!(f && f.overlay); return style; } : undefined,
    renderOverlay: ret === undefined ? undefined : (ctx, f) => { window.__roCalls++; return ret; },
  });
  AW._debug.setTheme("probe", true);
}"""


def test_overlay_style_is_consulted(open_page):
    pg = open_page(WORK, w=1920, h=1080)
    style = {"font": "Georgia, serif", "ink": {"r": 200, "g": 40, "b": 30}, "dim": {"r": 120, "g": 30, "b": 20},
             "accent": {"r": 210, "g": 60, "b": 40}, "alarm": {"r": 210, "g": 30, "b": 90}, "glow": 0,
             "rule": "double", "caps": True}
    pg.evaluate(PROBE_THEME, [style, None])
    show(pg, "pulse")
    pg.wait_for_timeout(250)
    assert pg.evaluate("window.__styleCalls") > 3
    assert pg.evaluate("window.__styleFrame") is True  # overlayStyle sees frame.overlay
    st = pg.evaluate("AW.overlay.info.style")
    assert st["custom"] is True and st["font"] == "Georgia, serif" and st["caps"] is True and st["rule"] == "double"
    assert (round(st["ink"]["r"]), round(st["ink"]["g"])) == (200, 40)
    assert pg.evaluate("AW.overlay.info.title") == "PROJECT PULSE"  # caps
    a = shot(pg, box_clip(pg))
    lit = a[a.max(axis=2) > 80]
    assert len(lit) > 500
    assert (lit[:, 0] > lit[:, 1] + 30).mean() > 0.9, "panel not drawn in the theme's red ink"
    assert real_errors(pg) == []


def test_overlay_style_cannot_break_the_brightness_rules(open_page):
    pg = open_page(WORK, w=1920, h=1080)
    white = {"r": 255, "g": 255, "b": 255}
    pg.evaluate(PROBE_THEME, [{"ink": white, "dim": white, "accent": white, "alarm": white, "glow": 1}, None])
    show(pg, "news")
    pg.wait_for_timeout(250)
    mx, wh, mean = metrics(shot(pg))
    assert mx <= 225 and wh == 0 and mean < 25, (mx, wh, mean)


def test_overlay_style_garbage_falls_back_to_defaults(open_page):
    pg = open_page(WORK, w=1280, h=720)
    pg.evaluate(PROBE_THEME, [{"ink": "red", "glow": "lots", "rule": "wavy", "font": 7, "caps": "yes"}, None])
    show(pg, "forecast")
    pg.wait_for_timeout(200)
    st = pg.evaluate("AW.overlay.info.style")
    assert st["rule"] == "hairline" and st["caps"] is False and "sans-serif" in st["font"]
    assert real_errors(pg) == []


def test_render_overlay_true_suppresses_shared_renderer(open_page):
    pg = open_page(WORK, w=1280, h=720)
    pg.evaluate(PROBE_THEME, [None, True])
    show(pg, "calendar")
    pg.wait_for_timeout(250)
    assert pg.evaluate("window.__roCalls") > 3
    assert pg.evaluate("AW.overlay.info.custom") is True
    assert energy(shot(pg)) == 0  # the probe draws nothing, and neither did core
    assert real_errors(pg) == []


def test_render_overlay_false_keeps_shared_renderer(open_page):
    pg = open_page(WORK, w=1280, h=720)
    pg.evaluate(PROBE_THEME, [None, False])
    show(pg, "calendar")
    pg.wait_for_timeout(250)
    assert pg.evaluate("window.__roCalls") > 3
    assert pg.evaluate("AW.overlay.info.custom") is False
    assert energy(shot(pg)) > 2000


def test_overlay_stays_on_top_through_a_theme_switch(open_page):
    pg = open_page(WORK + "&theme=cyberpunk", w=1280, h=720)
    show(pg, "news")
    pg.wait_for_timeout(250)
    clip = box_clip(pg)
    before = energy(shot(pg, clip), 90)
    pg.keyboard.press("t")  # fade through black to the next theme
    pg.wait_for_timeout(450)
    during = energy(shot(pg, clip), 90)
    assert before > 2000 and during > 0.7 * before, (before, during)
    assert pg.evaluate("AW._debug.overlay.panel") == "news"


def test_hud_shows_overlay(open_page):
    pg = open_page(WORK + "&hud=1&show=finance&showfor=600")
    hud = pg.evaluate("document.getElementById('hud').textContent")
    assert "overlay finance hold 1.00" in hud, hud
    assert "O panels" in hud
