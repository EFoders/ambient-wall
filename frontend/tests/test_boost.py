"""Projector boost (core.js): a gamma shadow-lift filter on the canvas for dim projectors.
Black must stay black (the wall floats on the void); dark tones must rise; the choice cycles with G,
comes from ?boost= or the config, and a choice made on the wall survives a reload on that device."""
import io

import numpy as np
import pytest
from PIL import Image

from conftest import ON_CI, poll, real_errors

# a test theme: left half pure black, right half a dark grey the projector would swallow (20/255)
GREY_THEME = """() => {
  if (!AW._debug.themes.find((t) => t.id === "greycard"))
    AW.registerTheme({ id: "greycard", name: "Grey card", render(ctx, f) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.width, f.height);
      ctx.fillStyle = "rgb(20,20,20)"; ctx.fillRect(f.width / 2, 0, f.width / 2, f.height);
    } });
  AW._debug.setTheme("greycard", true);
}"""


def sample(pg):
    """(black side, grey side) mean channel values from a real screenshot (CSS filters included)."""
    pg.wait_for_timeout(250)
    img = np.asarray(Image.open(io.BytesIO(pg.screenshot())).convert("RGB")).astype(float)
    h, w, _ = img.shape
    return img[h // 4: 3 * h // 4, w // 8: 3 * w // 8].mean(), img[h // 4: 3 * h // 4, 5 * w // 8: 7 * w // 8].mean()


def level(pg):
    return pg.evaluate("AW._debug.boost.level")


def test_off_by_default(open_page):
    pg = open_page("mode=work")
    assert level(pg) == 0
    assert pg.evaluate("document.getElementById('wall').style.filter") == ""
    pg.evaluate(GREY_THEME)
    black, grey = sample(pg)
    assert black < 1 and abs(grey - 20) < 2
    assert real_errors(pg) == []


def test_boost_lifts_darks_and_keeps_black(open_page):
    pg = open_page("mode=work&boost=3")
    pg.evaluate(GREY_THEME)
    assert level(pg) == 3
    assert pg.evaluate("document.getElementById('wall').style.filter") == 'url("#aw-boost")'
    black, grey = sample(pg)
    expected = 255 * 1.06 * (20 / 255) ** 0.5           # gamma 0.5, gain 1.06 -> about 75
    assert black < 1, black                              # the void stays black: no grey rectangle
    assert abs(grey - expected) < 8, (grey, expected)   # 20 -> ~75: visible on a dim projector
    assert real_errors(pg) == []


def test_levels_are_monotonic(open_page):
    pg = open_page("mode=work")
    pg.evaluate(GREY_THEME)
    greys = []
    for lv in range(4):
        pg.evaluate(f"AW._debug.boost.set({lv})")
        greys.append(sample(pg)[1])
    assert greys == sorted(greys) and greys[3] - greys[0] > 40, greys


def test_g_cycles_and_is_remembered_on_this_device(open_page):
    pg = open_page("mode=work")
    pg.keyboard.press("g")
    assert level(pg) == 1
    pg.keyboard.press("g"); pg.keyboard.press("g")
    assert level(pg) == 3
    pg.keyboard.press("g")
    assert level(pg) == 0                               # wraps to off
    pg.keyboard.press("g"); pg.keyboard.press("g")      # medium
    pg.reload()
    pg.wait_for_function("window.AW && AW._debug && window.__AW_FRAME")
    assert level(pg) == 2 and pg.evaluate("AW._debug.boost.user") is True


def test_hud_shows_the_level(open_page):
    pg = open_page("mode=work&hud=1&boost=1")
    assert poll(pg, "document.getElementById('hud').textContent.includes('boost low')", timeout=3)


def test_g_works_with_dev_keys_off(open_page):
    pg = open_page("mode=work")
    pg.evaluate("AW.config.devKeys = false")
    pg.keyboard.press("g")
    assert level(pg) == 1


def test_bad_param_is_ignored(open_page):
    pg = open_page("mode=work&boost=9")
    assert level(pg) == 0 and real_errors(pg) == []


@pytest.mark.skipif(ON_CI, reason="frame timing is meaningless on a GPU-less CI runner")
def test_render_cost_unchanged(open_page):
    """The filter runs in the compositor: theme render time must not change."""
    pg = open_page("mode=ambient&at=2026-10-09T22:30&boost=3", w=1600, h=900, wait=1500)
    t = pg.evaluate("""async () => {
      const ts = []; let last = performance.now();
      for (let i = 0; i < 60; i++) { await new Promise(requestAnimationFrame); const n = performance.now(); ts.push(n - last); last = n; }
      ts.sort((a, b) => a - b); return ts[30];
    }""")
    assert t < 40, t                                     # median frame interval: frames keep flowing with the filter on
    assert real_errors(pg) == []
