"""The cat (js/cat.js + core.js): K / Shift+K / ?cat= / hello / set_cat switch it, frame.cat fades, and every
registered theme places it in its ambient scene: drawn by night and by day, on screen, a sensible size, visible
against the scene, inside the brightness rules, and gone from the work face at night."""
import time

import numpy as np
import pytest

from conftest import discover_themes, metrics, poll, real_errors, shot

NIGHT = "mode=ambient&at=2026-10-09T22:30&elapsed=1200&wx=clear&news=0&music=0"
LATE = "mode=ambient&at=2026-10-10T02:30&elapsed=19800&wx=clear&news=0&music=0"
DAY = "mode=ambient&at=2026-10-10T13:00&elapsed=3600&wx=clear&news=0&music=0"
WORK_NIGHT = "mode=work&at=2026-10-09T22:30&wx=clear"

# the void theme with a cat in it: only the cat paints, so its pixels are measurable on their own
CAT_VOID = """() => {
  if (!AW._debug.themes.find((t) => t.id === "catvoid"))
    AW.registerTheme({ id: "catvoid", name: "Cat void", init() { this.cat = AW.cat.create(5); },
      render(ctx, f) {
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.width, f.height);
        this.cat.draw(ctx, f, { x: f.width / 2, y: f.height * 0.7, size: f.height * 0.3, light: 0.3,
          rim: { color: { r: 200, g: 140, b: 70 }, a: 0.9, dx: -1, dy: -0.4 }, glow: 0.5, pose: "sit" });
      } });
  AW._debug.setTheme("catvoid", true);
}"""


def cat(pg):
    return pg.evaluate("({ ...AW._debug.cat, set: undefined, frame: window.__AW_FRAME.cat })")


def drawn_now(pg):
    """AW.cat.last if the cat was drawn in the latest frame, else None."""
    return pg.evaluate("""async () => {
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      const l = AW.cat.last, f = window.__AW_FRAME;
      return l && Math.abs(l.t - f.t) < 1e-6 ? l : null;
    }""")


# ---------------------------------------------------------------- the switch
def test_off_by_default(open_page):
    pg = open_page("mode=ambient")
    c = cat(pg)
    assert c["on"] is False and c["frame"] is None and c["coat"] == "tabby"
    assert real_errors(pg) == []


def test_k_toggles_fades_and_is_remembered(open_page):
    pg = open_page("mode=ambient")
    pg.keyboard.press("k")
    assert cat(pg)["on"] is True
    pg.wait_for_timeout(250)
    a = cat(pg)["frame"]["a"]
    assert 0 < a < 1, a                                   # fading in, not snapped
    assert poll(pg, "window.__AW_FRAME.cat && window.__AW_FRAME.cat.a === 1", timeout=3)
    pg.reload()
    pg.wait_for_function("window.AW && AW._debug && window.__AW_FRAME")
    c = cat(pg)
    assert c["on"] is True and c["user"] is True and c["frame"]["a"] == 1   # on at load: already there
    pg.keyboard.press("k")
    assert poll(pg, "window.__AW_FRAME.cat === null", timeout=3)


def test_shift_k_cycles_coats_and_turns_on(open_page):
    pg = open_page("mode=ambient")
    ids = pg.evaluate("AW.cat.COAT_IDS")
    assert ids[0] == "tabby" and len(ids) == 8
    assert pg.evaluate("AW._debug.cat.coats") == ids         # core's copy of the list matches cat.js
    pg.keyboard.press("Shift+K")
    c = cat(pg)
    assert c["on"] is True and c["coat"] == ids[1]
    for _ in range(len(ids) - 1):
        pg.keyboard.press("Shift+K")
    assert cat(pg)["coat"] == "tabby"                     # wrapped


def test_k_works_with_dev_keys_off(open_page):
    pg = open_page("mode=ambient")
    pg.evaluate("AW.config.devKeys = false")
    pg.keyboard.press("k")
    assert cat(pg)["on"] is True


@pytest.mark.parametrize("q, on, coat", [("cat=1", True, "tabby"), ("cat=0", False, "tabby"),
                                         ("cat=ginger", True, "ginger"), ("cat=SIAMESE", True, "siamese")])
def test_url_param(open_page, q, on, coat):
    pg = open_page("mode=ambient&" + q)
    c = cat(pg)
    assert c["on"] is on and c["coat"] == coat


def test_unknown_coat_keeps_the_current_one(open_page):
    pg = open_page("mode=ambient&cat=dog")
    c = cat(pg)
    assert c["on"] is True and c["coat"] == "tabby"


def test_hud_shows_the_cat(open_page):
    pg = open_page("mode=ambient&hud=1&cat=calico")
    assert poll(pg, "document.getElementById('hud').textContent.includes('cat calico')", timeout=3)


# ---------------------------------------------------------------- the renderer
def test_renderer_draws_every_pose_and_coat_within_the_rules(open_page):
    pg = open_page("mode=ambient&at=2026-10-09T22:30&cat=1", wait=300)
    pg.evaluate(CAT_VOID)
    for coat in pg.evaluate("AW.cat.COAT_IDS"):
        pg.evaluate(f"AW._debug.cat.set(true, {coat!r})")
        pg.wait_for_timeout(120)
        a = shot(pg)
        mx, white, _ = metrics(a)
        assert mx <= 225 and white == 0, (coat, mx, white)
        assert (a.max(axis=2) > 40).sum() > 2000, coat   # a cat-sized lit shape
    assert real_errors(pg) == []


def test_animation_blinks_and_moves(open_page):
    """Over a few seconds the eyes close at least once and the tail moves."""
    pg = open_page("mode=ambient&at=2026-10-09T22:30&cat=1", wait=300)
    pg.evaluate(CAT_VOID)
    seen = pg.evaluate("""async () => {
      const st = AW._debug.themes.find((t) => t.id === "catvoid").cat.state;
      let minOpen = 1, tails = new Set();
      const end = performance.now() + 9000;
      while (performance.now() < end) {
        await new Promise(requestAnimationFrame);
        minOpen = Math.min(minOpen, st.open); tails.add(Math.round(st.tail * 100));
      }
      return { minOpen, tails: tails.size };
    }""")
    assert seen["minOpen"] < 0.3 and seen["tails"] > 10, seen


@pytest.mark.parametrize("day, minutes, awake, want", [
    (1, 600, "sit", "sit"), (0, 10, "sit", "sit"), (0, 60, "sit", "loaf"), (0, 200, "sit", "curl"),
    (0, 10, "back", "back"), (0.6, 400, "back", "back"),
])
def test_auto_pose(open_page, day, minutes, awake, want):
    """autoPose: awake by day and early, a loaf later, curled up asleep in the small hours."""
    pg = open_page("mode=ambient", wait=0)
    got = pg.evaluate(f"AW.cat.autoPose({{ day: {day}, ambientElapsed: {minutes * 60} }}, {awake!r})")
    assert got == want


# ---------------------------------------------------------------- live: hello + set_cat
def test_hello_cat_settings(open_page, fake):
    fake.ctl(display={"cat": True, "cat_coat": "tuxedo"})
    pg = open_page("mode=ambient", base=fake.base + "/", wait=0)
    assert poll(pg, "AW._debug.source() === 'live' && AW._debug.cat.on === true", timeout=10)
    assert cat(pg)["coat"] == "tuxedo"


def test_k_beats_a_later_hello(open_page, fake):
    fake.ctl(display={"cat": True})
    pg = open_page("mode=ambient", base=fake.base + "/", wait=0)
    assert poll(pg, "AW._debug.cat.on === true", timeout=10)
    pg.keyboard.press("k")                                 # the user turns it off on the wall
    before = fake.ctl()["connects"]
    fake.ctl(kick=True)
    end = time.time() + 10
    while fake.ctl()["connects"] <= before and time.time() < end:
        time.sleep(0.2)
    pg.wait_for_timeout(600)
    assert cat(pg)["on"] is False


def test_set_cat_command(open_page, fake):
    pg = open_page("mode=ambient", base=fake.base + "/", wait=0)
    assert poll(pg, "AW._debug.source() === 'live'", timeout=10)
    fake.command("set_cat", on=True, coat="ginger")
    assert poll(pg, "AW._debug.cat.on === true && AW._debug.cat.coat === 'ginger'", timeout=5)
    fake.command("set_cat", coat="black")                  # only the keys sent: still on
    assert poll(pg, "AW._debug.cat.coat === 'black'", timeout=3)
    assert cat(pg)["on"] is True
    fake.command("set_cat", on=False)
    assert poll(pg, "AW._debug.cat.on === false", timeout=3)
    fake.command("set_cat")                                # nothing to apply: ignored
    pg.wait_for_timeout(200)
    assert cat(pg)["coat"] == "black"
    assert real_errors(pg) == []


# ---------------------------------------------------------------- every theme
THEMES = discover_themes()


def _region(a, box):
    h, w, _ = a.shape
    x0, y0 = max(0, int(box["x"])), max(0, int(box["y"]))
    x1, y1 = min(w, int(box["x"] + box["w"])), min(h, int(box["y"] + box["h"]))
    return a[y0:y1, x0:x1]


@pytest.mark.parametrize("when", ["night", "late", "day"])
@pytest.mark.parametrize("theme", THEMES)
def test_theme_has_a_cat(open_page, theme, when):
    q = {"night": NIGHT, "late": LATE, "day": DAY}[when]
    pg = open_page(f"theme={theme}&{q}&cat=1", w=1280, h=720, wait=1200)
    box = drawn_now(pg)
    assert box, f"{theme}: the cat is not drawn in ambient ({when})"
    W, H = 1280, 720
    # on screen, and a size that reads across the room
    assert box["x"] >= -0.05 * W and box["x"] + box["w"] <= 1.05 * W, box
    assert box["y"] >= -0.05 * H and box["y"] + box["h"] <= 1.08 * H, box
    assert 0.05 * H <= box["size"] <= 0.32 * H, box
    assert box["alpha"] > 0.5, box
    on = shot(pg)
    # within the brightness rules with the cat in the scene
    day = pg.evaluate("window.__AW_FRAME.day")
    mx, white, mean = metrics(on)
    assert mx <= 225 and white == 0, (theme, when, mx, white)
    assert mean < 25 + 20 * day, (theme, when, mean, day)
    # visible: switch it off instantly and compare the cat's box
    pg.evaluate("AW._debug.cat.set(false); AW._debug.cat.a = 0")
    pg.wait_for_timeout(150)
    off = shot(pg)
    diff = np.abs(_region(on, box) - _region(off, box)).mean()
    assert diff > 2.0, f"{theme} ({when}): the cat barely shows against the scene (mean diff {diff:.2f})"
    assert real_errors(pg) == []


@pytest.mark.parametrize("theme", THEMES)
def test_theme_work_face_at_night_has_no_cat(open_page, theme):
    pg = open_page(f"theme={theme}&{WORK_NIGHT}&cat=1", wait=600)
    assert drawn_now(pg) is None, f"{theme}: the cat shows on the night work face"
