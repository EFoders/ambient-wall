"""The sound engine (js/audio.js) and its plumbing in core.js (THEMES.md "Sound").

Engine checks run two ways: live in an Edge launched with --autoplay-policy=no-user-gesture-required (the kiosk flag),
measured with an AnalyserNode tapped after the limiter (AW.audio.meter), and offline (AW.audio.renderOffline: the
same engine in an OfflineAudioContext) where exact windows matter: cue transients, the limiter ceiling, CPU.
Controls also run in an Edge that requires a user gesture, as a normal browser does."""
import json
import math
import time
import urllib.request

import pytest

from conftest import VOID_THEME, poll, real_errors

AMB = "mode=ambient&at=2026-10-09T22:30"  # a Friday night: ambient, day = 0
WORK = "mode=work&at=2026-10-09T11:20"
LAYERS = ["rain", "wind", "fire", "water", "city", "birds", "crickets", "forest", "room", "space", "magic"]  # procedural
NEW_LAYERS = ["rain-light", "rain-heavy", "rain-window", "wind-gentle", "wind-strong", "city-night", "city-day",
              "birds-light", "cicadas", "town", "cathedral", "neon"]  # names the recordings add (stand-ins on file://)
CUES = ["thunder", "train", "loon", "owl", "pop", "chime", "drip", "page", "distant_bell", "hover", "ward"]
RUNNING = "AW.audio.state().context === 'running'"


def db(x):
    return 20 * math.log10(max(x, 1e-12))


def state(pg):
    return pg.evaluate("AW.audio.state()")


def meter(pg, ms=600):
    return pg.evaluate(f"AW._debug.audio.meter({ms})")


def engine_page(audio_page, query=AMB, sound=True):
    """Engine tests run on the no-soundscape `void` theme, switched to BEFORE sound starts: every shipped theme now
    mixes its own sound() and fires its own cues, so only a theme without one exercises the core default soundscape
    (and its storm thunder), and no theme cue can leak into the counts."""
    pg = audio_page(query, wait=100)
    pg.evaluate(VOID_THEME)
    if sound:
        pg.evaluate("AW._debug.audio.setSound(true)")
    return pg


def sound_page(audio_page, query=AMB, volume=None):
    """Sound on and running, fast level smoothing, no levels until a test sets the override."""
    pg = engine_page(audio_page, query)
    assert poll(pg, RUNNING, timeout=5), state(pg)
    pg.evaluate("AW.audio.tau = 0.15; AW._debug.audio.override = {}")
    if volume is not None:
        pg.evaluate(f"AW._debug.audio.setVolume({volume})")
    return pg


def wait_idle(pg, timeout=6):
    assert poll(pg, "AW.audio.state().active.length === 0", timeout=timeout), state(pg)["active"]


# ---------------------------------------------------------------- engine
def test_api_and_off_by_default(open_page):
    pg = open_page(AMB + "&hud=1")
    api = pg.evaluate("""['update','cue','setEnabled','setVolume','unlock','state','meter','defaultSoundscape',
        'defaultCues','renderOffline'].filter((k) => typeof AW.audio[k] !== 'function')""")
    assert api == []
    assert pg.evaluate("AW.audio.LAYERS") == LAYERS + NEW_LAYERS and pg.evaluate("AW.audio.CUES") == CUES
    s = state(pg)
    assert s["enabled"] is False and s["context"] == "none" and s["locked"] is False and s["active"] == []
    d = pg.evaluate("AW.config.display")  # the sound defaults (display also holds other settings, e.g. boost)
    assert {k: d[k] for k in ("sound", "volume", "sound_work")} == {"sound": False, "volume": 0.5, "sound_work": 0}
    assert "sound off 50%" in pg.evaluate("document.getElementById('hud').textContent")
    assert pg.evaluate("getComputedStyle(document.getElementById('hint')).display") == "none"
    assert real_errors(pg) == []


def test_enabling_creates_a_running_context(audio_page):
    pg = engine_page(audio_page, AMB)
    assert poll(pg, RUNNING, timeout=5)
    s = state(pg)
    assert s["enabled"] is True and s["locked"] is False and s["sampleRate"] > 0
    assert poll(pg, "Math.abs(AW.audio.state().master - 0.25) < 1e-3", timeout=2)  # volume 0.5 -> 0.25, ambient
    assert pg.evaluate("AW._debug.audio.from") == "default"
    assert pg.evaluate("getComputedStyle(document.getElementById('hint')).display") == "none"
    assert real_errors(pg) == []


def test_every_layer_sounds_and_zero_is_silence(audio_page):
    pg = sound_page(audio_page, volume=1)
    res, bad = {}, {}
    for name in LAYERS:
        pg.evaluate(f"AW._debug.audio.override = {{ {name}: 1 }}")
        assert poll(pg, f"AW.audio.state().layers.{name}.active", timeout=2)
        pg.wait_for_timeout(400)
        m = meter(pg, 1500 if name in ("birds", "magic") else 900)
        res[name] = round(db(m["maxRms"]), 1)
        if not (m["maxRms"] > 1e-3 and m["peak"] < 1.0):
            bad[name] = m
        pg.evaluate("AW._debug.audio.override = {}")
        wait_idle(pg)
    print("layer max RMS dBFS at volume 1:", res)
    assert not bad, bad
    # all at 0: layers torn down, then (after the reverb tail) digital silence
    pg.wait_for_timeout(3000)
    m = meter(pg, 500)
    assert m["rms"] < 1e-5 and m["peak"] < 1e-4, m
    assert real_errors(pg) == []


def test_level_below_threshold_is_not_built(audio_page):
    pg = sound_page(audio_page)
    pg.evaluate("AW._debug.audio.override = { rain: 0.005, fire: 0 }")
    pg.wait_for_timeout(500)
    assert state(pg)["active"] == []


@pytest.mark.parametrize("cue", CUES)
def test_each_cue_is_a_transient(open_page, cue):
    pg = open_page(AMB, wait=0)
    r = pg.evaluate("""(n) => AW.audio.renderOffline({seconds: 20, cues: [{name: n, at: 0.5, opts: {delay: 0, distance: 0.3}}]})
        .then((r) => ({pre: Math.max(...r.env.slice(0, 9)), on: r.env.findIndex((x) => x > 1e-3), max: Math.max(...r.env),
                       tail: r.env[r.env.length - 1], peak: r.peak, w: r.window}))""", cue)
    assert r["pre"] < 1e-6, r                       # silence before
    assert r["max"] > 3e-3 and r["peak"] < 1, r     # a real event, under 0 dBFS
    assert 0.5 <= r["on"] * r["w"] < 1.2, r          # starting when cued
    assert r["tail"] < r["max"] / 10, r              # and dying away


def test_live_cue_and_unknown_cue(audio_page):
    pg = sound_page(audio_page)
    assert pg.evaluate("AW.audio.cue('chime', {distance: 0.1})") is True
    m = meter(pg, 800)
    assert m["maxRms"] > 1e-3, m
    assert state(pg)["cues"] == {"chime": 1}
    assert pg.evaluate("AW.audio.cue('kazoo')") is False
    assert pg.evaluate("AW.audio.cue('kazoo', {gain: 1})") is False
    assert pg.evaluate("AW.audio.cue('thunder', {gain: 0})") is False
    assert pg.evaluate("AW.audio.cue('__proto__')") is False
    assert state(pg)["cues"] == {"chime": 1}
    assert real_errors(pg) == []  # an unknown cue is a warning at most


def test_limiter_keeps_peaks_under_0_dbfs(open_page):
    pg = open_page(AMB, wait=0)
    r = pg.evaluate("""AW.audio.renderOffline({seconds: 6, master: 4,     // +12 dB over full volume
        levels: Object.fromEntries(AW.audio.LAYERS.map((n) => [n, 1])),
        cues: AW.audio.CUES.map((n, i) => ({name: n, at: 0.2 + i * 0.25, opts: {delay: 0, distance: 0, gain: 2}}))})
        .then((r) => ({peak: r.peak, rms: r.rms}))""")
    print(f"all layers + all cues at +12 dB: peak {db(r['peak']):.2f} dBFS, rms {db(r['rms']):.1f} dBFS")
    assert 0.3 < r["peak"] < 0.89, r  # driven hard, still under -1 dBFS


def test_nothing_plays_while_disabled(audio_page):
    pg = audio_page(AMB, wait=300)
    pg.evaluate("AW._debug.audio.override = { rain: 1, fire: 1 }")
    pg.wait_for_timeout(300)
    assert pg.evaluate("AW.audio.cue('thunder', {delay: 0})") is False
    assert pg.evaluate("AW.audio.update(__AW_FRAME, {rain: 1})") is False
    s = state(pg)
    assert s["context"] == "none" and s["active"] == [] and s["cues"] == {}
    # on, then off again: master to 0, layers torn down, clock suspended (no CPU)
    pg.keyboard.press("s")
    assert poll(pg, RUNNING, timeout=5)
    assert poll(pg, "AW.audio.state().active.length === 2", timeout=3)
    pg.keyboard.press("s")
    s = state(pg)
    assert s["enabled"] is False and s["master"] == 0
    assert poll(pg, "AW.audio.state().context === 'suspended'", timeout=3)
    s = state(pg)
    assert s["active"] == [], s
    assert pg.evaluate("AW.audio.cue('chime')") is False
    assert real_errors(pg) == []


def test_volume_scales_the_output(audio_page):
    pg = sound_page(audio_page, volume=0.3)
    pg.evaluate("AW._debug.audio.override = { space: 1 }")  # a steady drone
    pg.wait_for_timeout(1500)
    lo = meter(pg, 800)["rms"]
    pg.evaluate("AW._debug.audio.setVolume(0.9)")
    pg.wait_for_timeout(1200)
    hi = meter(pg, 800)["rms"]
    print(f"volume 0.3: {db(lo):.1f} dBFS, 0.9: {db(hi):.1f} dBFS")
    assert lo > 1e-4 and hi > 4 * lo, (lo, hi)  # v^2: 9x expected


def test_work_mode_is_silent_then_the_exhale_brings_it_in(audio_page):
    pg = sound_page(audio_page, query=WORK)
    pg.evaluate("AW._debug.audio.override = { space: 1, rain: 1 }")
    pg.wait_for_timeout(1200)
    s = state(pg)
    assert s["master"] == 0 and s["active"] == [], s  # sound_work 0: silent, and no layer even built
    assert meter(pg, 400)["rms"] < 1e-5
    pg.evaluate("AW.config.mode.transitionSeconds = 3")
    pg.keyboard.press("m")  # ?mode=work -> forced ambient: the exhale
    seen = []
    for _ in range(12):
        seen.append(pg.evaluate("[__AW_FRAME.blend, AW.audio.state().master]"))
        pg.wait_for_timeout(330)
    masters = [m for _, m in seen]
    assert all(b >= a - 1e-6 for a, b in zip(masters, masters[1:])), seen  # ramps up, never jumps back
    assert any(0.01 < m < 0.24 for m in masters), seen                     # through intermediate levels
    assert abs(masters[-1] - 0.25) < 1e-3, seen
    assert meter(pg, 500)["rms"] > 1e-3
    # sound_work: the work level is a fraction of the ambient one
    pg.evaluate("AW.config.display.sound_work = 0.4")
    pg.keyboard.press("m")  # forced ambient -> schedule (11:20 on a weekday: work)
    assert poll(pg, "Math.abs(AW.audio.state().master - 0.1) < 1e-3", timeout=5), state(pg)
    assert real_errors(pg) == []


# ---------------------------------------------------------------- default soundscape
DEFAULT = """([day, wx]) => AW.audio.defaultSoundscape({ day, signals: { weather: wx } })"""


def ds(pg, day, wx):
    return pg.evaluate(DEFAULT, [day, wx])


def test_default_soundscape_follows_weather_and_light(open_page):
    pg = open_page(AMB, wait=0)
    rain = ds(pg, 0, {"condition": "rain", "intensity": 0.6, "windKph": 18, "tempC": 12})
    clear = ds(pg, 0, {"condition": "clear", "intensity": 0, "windKph": 5, "tempC": 12})
    storm = ds(pg, 0, {"condition": "storm", "intensity": 0.9, "windKph": 45, "tempC": 14})
    assert rain["rain"] > 0.5 and clear["rain"] == 0 and storm["rain"] > rain["rain"]
    assert storm["wind"] > rain["wind"] > clear["wind"]
    warm = {"condition": "clear", "intensity": 0, "windKph": 5, "tempC": 18}
    day, night = ds(pg, 1, warm), ds(pg, 0, warm)
    assert day["birds"] > 0.3 and day["crickets"] == 0
    assert night["crickets"] > 0.3 and night["birds"] == 0
    cold = {**warm, "tempC": 2}
    assert ds(pg, 0, cold)["crickets"] == 0 and ds(pg, 1, cold)["birds"] == 0
    assert ds(pg, 0, {**warm, "condition": "rain", "intensity": 0.9})["crickets"] < 0.05  # crickets stop in rain
    for lv in (rain, clear, storm, day, night):
        assert 0 < lv["room"] < 0.5 and all(0 <= v <= 1 for v in lv.values())
    assert ds(pg, 0, None)["rain"] == 0  # no weather = clear


def test_default_soundscape_drives_the_engine(audio_page):
    pg = engine_page(audio_page, AMB + "&wx=rain")
    assert poll(pg, RUNNING, timeout=5)
    assert poll(pg, "AW.audio.state().layers.rain.target > 0.5", timeout=3), state(pg)["layers"]
    s = state(pg)
    assert s["layers"]["rain"]["active"] and s["layers"]["room"]["active"] and not s["layers"]["birds"]["active"]
    assert pg.evaluate("AW._debug.audio.from") == "default"
    pg.keyboard.press("w")  # rain -> storm
    assert poll(pg, "AW.audio.state().layers.rain.target > 0.8", timeout=3)


def test_storm_schedules_thunder(audio_page):
    pg = engine_page(audio_page, AMB + "&wx=storm")
    assert poll(pg, RUNNING, timeout=5)
    assert poll(pg, "AW.audio.storm.next !== null", timeout=3)
    first = pg.evaluate("AW.audio.storm.next - __AW_FRAME.t")
    assert 0 < first <= 15, first
    pg.evaluate("AW.audio.storm.next = 0")  # due now
    assert poll(pg, "(AW.audio.state().cues.thunder || 0) >= 1", timeout=3)
    gap = pg.evaluate("AW.audio.storm.next - __AW_FRAME.t")
    assert 18 < gap <= 60, gap
    pg.keyboard.press("w")  # storm -> snow: no more thunder
    assert poll(pg, "AW.audio.storm.next === null", timeout=3)


def test_theme_soundscape_replaces_the_default(audio_page):
    pg = audio_page(AMB + "&wx=storm&sound=1")
    pg.evaluate("""() => {
      AW.registerTheme({ id: "hearth", name: "Hearth", render(ctx, f) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.width, f.height); },
        soundscape(f) { return { fire: 0.8, crickets: 1 - f.day }; } });
      AW._debug.setTheme("hearth", true);
    }""")
    assert poll(pg, "AW._debug.audio.from === 'theme'", timeout=3)
    assert poll(pg, "AW.audio.state().layers.fire.target === 0.8", timeout=3)
    s = state(pg)
    assert s["layers"]["rain"]["target"] == 0 and s["layers"]["crickets"]["target"] == 1
    assert pg.evaluate("AW.audio.storm.next") is None  # the theme owns its thunder
    # a throwing soundscape falls back to the default (logged once)
    pg.evaluate("(() => { AW._debug.themes.find((t) => t.id === 'hearth').soundscape = () => { throw new Error('boom'); }; })()")
    assert poll(pg, "AW._debug.audio.from === 'default'", timeout=3)
    pg.wait_for_timeout(300)
    assert sum("soundscape (hearth)" in e for e in pg.errors) == 1, pg.errors


# ---------------------------------------------------------------- controls
def test_s_key_unlocks_and_toggles(gesture_page):
    pg = gesture_page(AMB + "&hud=1")
    assert state(pg)["context"] == "none"
    pg.keyboard.press("s")  # off: the first S both unlocks and enables
    assert poll(pg, RUNNING, timeout=5), state(pg)
    assert state(pg)["enabled"] is True
    assert "sound on 50%" in pg.evaluate("document.getElementById('hud').textContent")
    pg.keyboard.press("s")
    assert state(pg)["enabled"] is False
    assert poll(pg, "AW.audio.state().context === 'suspended'", timeout=3)
    pg.keyboard.press("s")
    assert poll(pg, RUNNING, timeout=3) and state(pg)["enabled"] is True
    assert pg.evaluate("AW._debug.audio.user") is True


def test_url_sound_locked_shows_hint_until_a_gesture(gesture_page):
    pg = gesture_page(AMB + "&sound=1&hud=1", wait=900)
    s = state(pg)
    assert s["enabled"] is True and s["locked"] is True and s["context"] == "suspended", s
    assert pg.evaluate("getComputedStyle(document.getElementById('hint')).display") == "block"
    assert "press any key or click" in pg.evaluate("document.getElementById('hint').textContent")
    assert "sound locked" in pg.evaluate("document.getElementById('hud').textContent")
    pg.mouse.click(30, 30)
    assert poll(pg, RUNNING, timeout=3)
    assert poll(pg, "getComputedStyle(document.getElementById('hint')).display === 'none'", timeout=2)
    assert state(pg)["enabled"] is True


def test_s_while_locked_unlocks_without_turning_off(gesture_page):
    pg = gesture_page(AMB + "&sound=1", wait=700)
    assert state(pg)["locked"] is True
    pg.keyboard.press("s")
    assert poll(pg, RUNNING, timeout=3)
    assert state(pg)["enabled"] is True


def test_plus_minus_volume(open_page):
    pg = open_page(AMB)
    vol = lambda: pg.evaluate("AW.audio.volume()")
    assert vol() == 0.5
    pg.keyboard.type("+")
    assert vol() == 0.6
    pg.keyboard.press("Equal")  # the unshifted + key
    assert vol() == 0.7
    pg.keyboard.type("-")
    assert vol() == 0.6
    for _ in range(8):
        pg.keyboard.type("+")
    assert vol() == 1.0
    for _ in range(14):
        pg.keyboard.type("-")
    assert vol() == 0.0
    assert pg.evaluate("AW._debug.audio.userVol") is True
    pg.keyboard.press("Control+Equal")  # browser zoom, not ours
    assert vol() == 0.0
    assert real_errors(pg) == []


@pytest.mark.parametrize("param,on", [("1", True), ("0", False), ("yes", False)])
def test_url_sound_param(audio_page, param, on):
    pg = audio_page(AMB + f"&sound={param}")
    assert state(pg)["enabled"] is on
    if on:
        assert poll(pg, RUNNING, timeout=5)


# ---------------------------------------------------------------- backend: hello + set_sound
def test_hello_sound_settings(audio_page, fake):
    fake.ctl(display={"sound": True, "volume": 0.3, "sound_work": 0.2})
    pg = audio_page("mode=work&at=2026-10-09T11:20", base=fake.base + "/", wait=0)
    assert poll(pg, "AW._debug.source() === 'live' && AW.audio.state().context === 'running'", timeout=10), state(pg)
    s = state(pg)
    assert s["enabled"] is True and s["volume"] == 0.3
    assert pg.evaluate("AW.config.display.sound_work") == 0.2
    assert poll(pg, "Math.abs(AW.audio.state().master - 0.09 * 0.2) < 1e-4", timeout=3), state(pg)  # 0.3^2 x work 0.2
    # the user turns it off; a reconnect (hello again) does not turn it back on
    pg.keyboard.press("s")
    before = fake.ctl()["connects"]
    fake.ctl(kick=True)
    end = time.time() + 10
    while fake.ctl()["connects"] <= before and time.time() < end:
        time.sleep(0.2)
    pg.wait_for_timeout(800)
    assert state(pg)["enabled"] is False
    assert real_errors(pg) == []


def test_url_sound_0_beats_hello(audio_page, fake):
    fake.ctl(display={"sound": True})
    pg = audio_page("mode=ambient&sound=0", base=fake.base + "/", wait=0)
    assert poll(pg, "AW._debug.source() === 'live'", timeout=10)
    pg.wait_for_timeout(300)
    assert state(pg)["enabled"] is False


def test_set_sound_command(audio_page, fake):
    pg = audio_page("mode=ambient&at=2026-10-09T22:30", base=fake.base + "/", wait=0)
    assert poll(pg, "AW._debug.source() === 'live'", timeout=10)
    assert state(pg)["enabled"] is False
    fake.command("set_sound", on=True, volume=0.4)
    assert poll(pg, RUNNING, timeout=5)
    s = state(pg)
    assert s["enabled"] is True and s["volume"] == 0.4
    fake.command("set_sound", volume=0.7)  # only the keys sent: still on
    assert poll(pg, "AW.audio.volume() === 0.7", timeout=3)
    assert state(pg)["enabled"] is True
    fake.command("set_sound", on=False)
    assert poll(pg, "AW.audio.state().enabled === false", timeout=3)
    assert state(pg)["volume"] == 0.7
    fake.command("set_sound", volume=7)  # clamped
    assert poll(pg, "AW.audio.volume() === 1", timeout=3)
    fake.command("set_sound")  # nothing to apply: ignored
    fake.command("set_sound", on="yes")
    pg.wait_for_timeout(300)
    assert state(pg)["enabled"] is False
    assert pg.evaluate("AW._debug.audio.user") is True
    assert real_errors(pg) == []


REAL = "http://localhost:8700"


def _real_up():
    try:
        return json.loads(urllib.request.urlopen(REAL + "/api/health", timeout=1.5).read()).get("ok") is True
    except Exception:
        return False


@pytest.mark.skipif(not _real_up(), reason="backend container not reachable on localhost:8700")
def test_real_backend_set_sound(audio_page):
    pg = audio_page("mode=ambient&sound=0", base=REAL + "/", wait=0)
    assert poll(pg, "AW._debug.source() === 'live'", timeout=15), pg.evaluate("AW._debug.source()")
    assert state(pg)["enabled"] is False
    req = urllib.request.Request(REAL + "/api/command", data=json.dumps({"name": "set_sound", "args": {"on": True}}).encode(),
                                 method="POST", headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=5)
    except urllib.error.HTTPError as e:
        pytest.skip(f"/api/command refused ({e.code}); push_token set or set_sound not deployed?")
    assert poll(pg, RUNNING, timeout=5), state(pg)
    assert state(pg)["enabled"] is True
    req = urllib.request.Request(REAL + "/api/command", data=json.dumps({"name": "set_sound", "args": {"on": False}}).encode(),
                                 method="POST", headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=5)
    assert poll(pg, "AW.audio.state().enabled === false", timeout=5)


# ---------------------------------------------------------------- CPU
def test_engine_cpu(open_page):
    pg = open_page(AMB, wait=0)
    pg.evaluate("AW.audio.renderOffline({seconds: 0.5})")  # warm-up: noise buffers are generated once per rate
    base = pg.evaluate("AW.audio.renderOffline({seconds: 10, sampleRate: 48000}).then((r) => r.ms)")
    full = pg.evaluate("""AW.audio.renderOffline({seconds: 10, sampleRate: 48000,
        levels: Object.fromEntries(AW.audio.LAYERS.map((n) => [n, 1]))}).then((r) => r.ms)""")
    typical = pg.evaluate("""AW.audio.renderOffline({seconds: 10, sampleRate: 48000,
        levels: {rain: 0.7, wind: 0.4, room: 0.25, forest: 0.2}}).then((r) => r.ms)""")
    print(f"10 s @ 48 kHz offline: engine only {base:.0f} ms, typical (4 layers) {typical:.0f} ms, all 11 layers {full:.0f} ms")
    assert full < 4000, full
    assert typical < 2000, typical
