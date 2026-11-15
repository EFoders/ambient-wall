"""Recorded samples in the sound engine (js/audio.js "recorded samples", sounds/manifest.json from
tools/process_sounds.py; THEMES.md "Sound").

Recordings are only fetched over http(s), so these pages are served by the fake backend (which serves frontend/ at /).
Layer and cue checks that need exact windows run offline (AW.audio.renderOffline({samples: true, ...}): the needed
files are fetched and decoded first, outside the timed render); live checks use the kiosk-autoplay Edge."""
import json
import math
import pathlib

import pytest

from conftest import FRONT, VOID_THEME, poll, real_errors

AMB = "mode=ambient&at=2026-10-09T22:30"
RUNNING = "AW.audio.state().context === 'running'"
SOUNDS = FRONT / "sounds"
MANIFEST = json.loads((SOUNDS / "manifest.json").read_text(encoding="utf-8"))
CUE_SLOTS = {"thunder": None, "train": "train-pass", "loon": "loon", "owl": "owl", "pop": "fire-pop", "chime": "chime",
             "drip": "drip", "page": "page-turn", "distant_bell": "bell-strike", "hover": "hover-pass", "ward": "ward-crackle"}


def db(x):
    return 20 * math.log10(max(x, 1e-12))


def errors(pg, allow_404=False):
    return [e for e in real_errors(pg) if not (allow_404 and e.startswith("http 404"))]


def http_page(audio_page, fake, query=AMB, wait=100):
    pg = audio_page(query, base=fake.base + "/", wait=wait)
    pg.evaluate(VOID_THEME)
    return pg


def live(audio_page, fake, query=AMB):
    """Sound on and running over http, fast smoothing, no levels until the test sets the override."""
    pg = http_page(audio_page, fake, query)
    pg.evaluate("AW._debug.audio.setSound(true); AW.audio.tau = 0.15; AW._debug.audio.override = {}")
    assert poll(pg, RUNNING, timeout=5)
    return pg


def offline(pg, **opts):
    return pg.evaluate("(o) => AW.audio.renderOffline(o).then((r) => { delete r.env_; return r; })", {"samples": True, **opts})


# ---------------------------------------------------------------- the files
def test_manifest_lists_existing_files():
    assert set(MANIFEST["layers"]) == {"rain-light", "rain-heavy", "rain-window", "wind-gentle", "wind-strong", "fire",
                                       "water", "city-night", "city-day", "town", "room", "cathedral", "space", "magic",
                                       "neon-buzz", "birds-forest", "birds-light", "crickets", "cicadas", "forest-rustle"}
    assert set(MANIFEST["cues"]) == {"thunder-near", "thunder-far", "train-pass", "hover-pass", "loon", "owl", "fire-pop",
                                     "drip", "chime", "bell-strike", "bell-small", "page-turn", "ward-crackle"}
    files = []
    for group in ("layers", "cues"):
        for slot, items in MANIFEST[group].items():
            assert items, slot
            for it in items:
                assert (SOUNDS / it["file"]).is_file(), it["file"]
                assert it["seconds"] > 0 and 0 < it["gain"] < 10 and it["license"] and it["author"] and it["source"], it
                if group == "layers":
                    assert it["weight"] > 0 and it["seconds"] <= 121, it
                files.append(it["file"])
    assert len(files) == len(set(files))
    total = sum(p.stat().st_size for p in SOUNDS.rglob("*.mp3"))
    print(f"{len(files)} files, {total / 1e6:.1f} MB")
    assert total < 80e6
    # the user's notes: the busy OGsoundFX clip is weighted low; loons are labelled; credits cover every BY file
    og = [x for x in MANIFEST["layers"]["town"] if "OGsoundFX" in x["author"]]
    assert og and og[0]["weight"] == 0.25
    assert {x.get("kind") for x in MANIFEST["cues"]["loon"]} <= {"wail", "tremolo", "unknown"}
    assert any(x.get("kind") == "wail" for x in MANIFEST["cues"]["loon"]) and any(x.get("kind") == "tremolo" for x in MANIFEST["cues"]["loon"])
    credits = (SOUNDS / "CREDITS.md").read_text(encoding="utf-8")
    for group in ("layers", "cues"):
        for items in MANIFEST[group].values():
            for it in items:
                assert it["file"] in credits, it["file"]


def test_every_file_decodes(open_page, fake):
    pg = open_page(AMB, base=fake.base + "/", wait=0)
    files = [it["file"] for g in ("layers", "cues") for items in MANIFEST[g].values() for it in items]
    res = pg.evaluate("""async (files) => {
      const out = [];
      for (const f of files) {
        try {
          const ab = await (await fetch('sounds/' + f)).arrayBuffer();
          const b = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(ab);
          out.push([f, b.duration, b.numberOfChannels]);
        } catch (e) { out.push([f, -1, String(e)]); }
      }
      return out;
    }""", files)
    secs = {it["file"]: it["seconds"] for g in ("layers", "cues") for items in MANIFEST[g].values() for it in items}
    bad = [r for r in res if r[1] <= 0 or r[2] != 2 or abs(r[1] - secs[r[0]]) > 0.3]
    assert not bad, bad
    assert errors(pg) == []


# ---------------------------------------------------------------- layers
def test_sampled_layer_is_audible_and_reports_sampled(audio_page, fake):
    pg = live(audio_page, fake, AMB + "&hud=1")
    pg.evaluate("AW._debug.audio.setVolume(1); AW._debug.audio.override = { 'rain-window': 1 }")
    assert poll(pg, "AW.audio.state().layers['rain-window'].source === 'sampled'", timeout=10), pg.evaluate("AW.audio.state().samples")
    pg.wait_for_timeout(800)
    m = pg.evaluate("AW._debug.audio.meter(900)")
    s = pg.evaluate("AW.audio.state()")
    print(f"rain-window sampled: max RMS {db(m['maxRms']):.1f} dBFS, peak {db(m['peak']):.1f}, decoded {s['samples']['decodedBytes'] / 1e6:.0f} MB")
    assert m["maxRms"] > 1e-3 and m["peak"] < 1, m
    assert s["active"] == ["rain-window"] and s["samples"]["decodedBytes"] > 1e6 and s["samples"]["loadedBytes"] > 1e5
    assert not s["layers"]["rain"]["active"]  # its stand-in (procedural rain) is not playing
    assert "rain-window*" in pg.evaluate("document.getElementById('hud').textContent")
    assert errors(pg) == []


def test_lazy_loading(audio_page, fake):
    pg = live(audio_page, fake)
    pg.wait_for_timeout(1500)
    sounds = "performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/sounds/'))"
    assert pg.evaluate("AW.audio.state().samples.fetches") == [] and pg.evaluate(sounds) == []
    pg.evaluate("AW._debug.audio.override = { fire: 0.005 }")  # below the threshold: still nothing
    pg.wait_for_timeout(500)
    assert pg.evaluate(sounds) == []
    pg.evaluate("AW._debug.audio.override = { fire: 1 }")
    assert poll(pg, "AW.audio.state().layers.fire.source === 'sampled'", timeout=10)
    fetched = pg.evaluate("AW.audio.state().samples.fetches")
    assert fetched[0] == "manifest.json" and len(fetched) == 2 and fetched[1].startswith("layers/fire/"), fetched
    assert all("/layers/fire/" in n or n.endswith("manifest.json") for n in pg.evaluate(sounds))
    assert errors(pg) == []


def test_release_after_silence(audio_page, fake):
    pg = live(audio_page, fake)
    pg.evaluate("AW.audio.samples.opts.releaseAfter = 1; AW._debug.audio.override = { water: 1 }")
    assert poll(pg, "AW.audio.state().layers.water.source === 'sampled'", timeout=10)
    assert pg.evaluate("AW.audio.state().samples.slots.water.decoded.length") == 1
    pg.evaluate("AW._debug.audio.override = {}")
    assert poll(pg, "AW.audio.state().samples.slots.water.decoded.length === 0", timeout=8)
    assert pg.evaluate("AW.audio.state().samples.decodedBytes") == 0
    pg.evaluate("AW._debug.audio.override = { water: 1 }")  # comes back: fetched (HTTP cache) and decoded again
    assert poll(pg, "AW.audio.state().layers.water.source === 'sampled'", timeout=10)


def test_missing_or_broken_file_falls_back_to_procedural(audio_page, fake):
    pg = live(audio_page, fake)
    pg.evaluate("""AW.audio.samples.setManifest({
        layers: { 'rain-light': [{ file: 'layers/nope/missing.mp3', seconds: 60, gain: 1 }],
                  'rain-heavy': [{ file: '../js/audio.js', seconds: 60, gain: 1 }] },
        cues: { drip: [{ file: 'cues/nope.mp3', seconds: 1, gain: 1 }] } }, 'sounds/')""")
    pg.evaluate("AW._debug.audio.override = { rain: 1, 'rain-light': 0.4, 'rain-heavy': 0.6 }")
    assert poll(pg, "AW.audio.state().samples.slots['rain-heavy'].bad === 1 && AW.audio.state().samples.slots['rain-light'].bad === 1", timeout=8)
    pg.wait_for_timeout(500)
    s = pg.evaluate("AW.audio.state()")
    assert s["layers"]["rain"]["source"] == "procedural" and s["layers"]["rain-heavy"]["source"] == "procedural", s["layers"]
    assert s["samples"]["playing"] == {} or not any(v["playing"] for v in s["samples"]["playing"].values())
    assert pg.evaluate("AW._debug.audio.meter(500)")["maxRms"] > 1e-3
    assert pg.evaluate("AW.audio.cue('drip', {distance: 0.1})") is True
    assert poll(pg, "AW.audio.state().cueLog.some((c) => c.name === 'drip' && c.fallback)", timeout=5), pg.evaluate("AW.audio.state().cueLog")
    assert errors(pg, allow_404=True) == []  # a 404 at most; no exception


def test_rotation_never_repeats_back_to_back(open_page, fake):
    pg = open_page(AMB, base=fake.base + "/", wait=0)
    seq = pg.evaluate("""() => {
      const pick = AW.audio.samples.pickEntry, list = [{file: 'a', weight: 1}, {file: 'b', weight: 0.5}, {file: 'c', weight: 0.25}];
      const out = []; let prev = null;
      for (let i = 0; i < 3000; i++) { const e = pick(list, prev); out.push(e.file); prev = e.file; }
      return out;
    }""")
    assert all(a != b for a, b in zip(seq, seq[1:]))
    assert seq.count("a") > seq.count("b") > seq.count("c") > 200  # weighted
    assert pg.evaluate("AW.audio.samples.pickEntry([{file: 'x'}], 'x').file") == "x"  # one file: it repeats
    # the loop itself: short segments over 40 s of the three city-night files
    r = offline(pg, seconds=40, levels={"city-night": 1}, segment=3.5, xfade=1, preload=3, clip=60)
    files = [s["file"] for s in r["segments"] if s["slot"] == "city-night"]
    print("city-night rotation:", [f.split("/")[-1] for f in files])
    assert len(files) >= 10 and len(set(files)) == 3
    assert all(a != b for a, b in zip(files, files[1:])), files
    assert r["sources"] == {"city-night": "sampled"}


def test_live_loop_rotates_and_keeps_memory_bounded(audio_page, fake):
    """Live: the next file is fetched and decoded ahead of each join, the old one is released after it."""
    pg = live(audio_page, fake)
    pg.evaluate("Object.assign(AW.audio.samples.opts, {segment: 3, xfade: 1, prep: 2}); AW._debug.audio.override = { 'city-day': 1 }")
    assert poll(pg, "AW.audio.state().samples.segments.filter((s) => s.slot === 'city-day').length >= 5", timeout=20), \
        pg.evaluate("AW.audio.state().samples")
    files = [s["file"] for s in pg.evaluate("AW.audio.state().samples.segments") if s["slot"] == "city-day"]
    assert len(set(files)) >= 2 and all(a != b for a, b in zip(files, files[1:])), files
    # housekeeping (once a second) keeps only the loop's files: the one fading out, the current one and the next
    # (with 3 s segments all three are always in use; with real 2-minute files it is one, two around a join)
    for _ in range(4):
        pg.wait_for_timeout(700)
        assert len(pg.evaluate("AW.audio.state().samples.slots['city-day'].decoded")) <= 3
    m = pg.evaluate("AW._debug.audio.meter(600)")
    assert m["maxRms"] > 1e-3
    assert errors(pg) == []


@pytest.mark.parametrize("slot", ["neon", "rain-heavy", "space", "wind-gentle"])
def test_loop_crossfade_is_continuous(open_page, fake, slot):
    """Joins every 6 s (2 s equal-power crossfades) between the slot's files (rain-heavy and wind-gentle have one file each:
    it crosses into itself at another point). The level in 250 ms windows never dips or jumps at a join beyond what
    the recording itself does away from the joins."""
    pg = open_page(AMB, base=fake.base + "/", wait=0)
    r = offline(pg, seconds=40, levels={slot: 1}, segment=6, xfade=2, preload=2, clip=60, window=0.25)
    w = r["window"]
    env = [db(x) for x in r["env"]]
    joins = [s["at"] for s in r["segments"][1:]]
    assert len(joins) >= 5, r["segments"]
    near = lambda i: any(j - 0.25 <= i * w <= j + 2.25 for j in joins)  # the crossfade windows
    body = [i for i in range(4, len(env)) if not near(i)]
    xf = [i for i in range(4, len(env)) if near(i)]
    med = sorted(env[i] for i in body)[len(body) // 2]
    dev = lambda idx: [env[i] - med for i in idx]
    lo_b, hi_b = min(dev(body)), max(dev(body))
    lo_x, hi_x = min(dev(xf)), max(dev(xf))
    print(f"{slot}: median {med:.1f} dB; away from joins {lo_b:+.1f}..{hi_b:+.1f} dB, at joins {lo_x:+.1f}..{hi_x:+.1f} dB")
    assert lo_x > min(lo_b, -1.5) - 2.0 and hi_x < max(hi_b, 1.5) + 2.0
    assert r["sources"] == {slot: "sampled"}


def test_cpu_typical_sampled_mix(open_page, fake):
    pg = open_page(AMB, base=fake.base + "/", wait=0)
    pg.evaluate("AW.audio.renderOffline({seconds: 0.5})")  # warm-up
    lv = {"rain": 0.7, "wind": 0.4, "room": 0.25, "city": 0.3, "birds": 0.3, "fire": 0.5}
    r = offline(pg, seconds=10, sampleRate=48000, levels=lv, preload=2, clip=12)
    print(f"10 s @ 48 kHz offline, sampled mix {sorted(r['sources'])}: render {r['ms']:.0f} ms (decode first {r['decodeMs']:.0f} ms)")
    assert all(v == "sampled" for v in r["sources"].values()), r["sources"]
    assert r["ms"] < 2000, r["ms"]
    assert r["rms"] > 1e-3


def test_limiter_holds_with_every_sampled_layer_at_max(open_page, fake):
    pg = open_page(AMB, base=fake.base + "/", wait=0)
    r = pg.evaluate("""AW.audio.renderOffline({seconds: 6, sampleRate: 22050, master: 4, samples: true, clip: 7,
        levels: Object.fromEntries(AW.audio.LAYERS.map((n) => [n, 1])),
        cues: AW.audio.CUES.map((n, i) => ({name: n, at: 0.2 + i * 0.25, opts: {delay: 0, distance: 0, gain: 2}}))})
        .then((r) => ({peak: r.peak, rms: r.rms, sources: r.sources, sampledCues: r.cueLog.filter((c) => c.sampled).length}))""")
    print(f"every sampled layer + cue at +12 dB: peak {db(r['peak']):.2f} dBFS, rms {db(r['rms']):.1f} dBFS")
    assert sum(v == "sampled" for v in r["sources"].values()) >= 20, r["sources"]
    assert r["sampledCues"] == 11
    assert 0.3 < r["peak"] < 0.89, r


# ---------------------------------------------------------------- cues
@pytest.mark.parametrize("cue", list(CUE_SLOTS))
def test_each_cue_plays_a_sample_without_repeats(open_page, fake, cue):
    pg = open_page(AMB, base=fake.base + "/", wait=0)
    r = offline(pg, seconds=4, cues=[{"name": cue, "at": 0.3 + 0.4 * i, "opts": {"delay": 0, "distance": 0.3}} for i in range(4)])
    log = r["cueLog"]
    assert len(log) == 4 and all(c["sampled"] for c in log), log
    files = [f for c in log for f in c["files"]]  # every take played, in order (a chime may play two)
    slot = log[0]["slot"]
    assert all(a != b for a, b in zip(files, files[1:])), files
    assert max(r["env"]) > 3e-3 and r["peak"] < 1
    if CUE_SLOTS[cue]:
        assert slot == CUE_SLOTS[cue]


def test_thunder_distance_picks_near_or_far(open_page, fake):
    pg = open_page(AMB, base=fake.base + "/", wait=0)
    cues = [{"name": "thunder", "at": 0.1 * i, "opts": {"delay": 0, "distance": d}} for i, d in enumerate([0.1, 0.3, 0.44, 0.46, 0.7, 1.0])]
    r = offline(pg, seconds=1, cues=cues)
    assert [c["slot"] for c in r["cueLog"]] == ["thunder-near"] * 3 + ["thunder-far"] * 3
    near = {x["file"] for x in MANIFEST["cues"]["thunder-near"]}
    far = {x["file"] for x in MANIFEST["cues"]["thunder-far"]}
    assert not near & far and len(near) >= 3
    # the Fission9 pack was picked for both: no recording appears in both slots
    excerpt = lambda x: (x["source"], tuple(x["excerpt"]))
    assert not {excerpt(x) for x in MANIFEST["cues"]["thunder-near"]} & {excerpt(x) for x in MANIFEST["cues"]["thunder-far"]}


def test_loon_kind_prefers_labelled_takes(open_page, fake):
    pg = open_page(AMB, base=fake.base + "/", wait=0)
    for kind in ("wail", "tremolo"):
        r = offline(pg, seconds=1, cues=[{"name": "loon", "at": 0.1 * i, "opts": {"delay": 0, "kind": kind}} for i in range(4)])
        assert [c["kind"] for c in r["cueLog"]] == [kind] * 4, r["cueLog"]
        files = [c["file"] for c in r["cueLog"]]
        assert all(a != b for a, b in zip(files, files[1:]))
    r = offline(pg, seconds=1, cues=[{"name": "loon", "at": 0.1 * i, "opts": {"delay": 0}} for i in range(6)])
    assert all(c["sampled"] for c in r["cueLog"])


def test_bell_count(open_page, fake):
    pg = open_page(AMB, base=fake.base + "/", wait=0)
    # six strikes on the small bell: the ready-made six-strike tower-clock file, played once
    r = offline(pg, seconds=2, cues=[{"name": "distant_bell", "at": 0.1, "opts": {"count": 6, "freq": 610, "distance": 0.5}}])
    c = r["cueLog"][0]
    assert c["slot"] == "bell-small" and c["count"] == 6 and c["kind"] == "strikes", c
    # three on the big bell: a single strike, repeated at the bell's natural interval (~2.4 s)
    r = offline(pg, seconds=8, window=0.05, cues=[{"name": "distant_bell", "at": 0.1, "opts": {"count": 3, "freq": 415, "distance": 0.2}}])
    c = r["cueLog"][0]
    assert c["slot"] == "bell-strike" and c["count"] == 3 and c["kind"] == "strike", c
    # the timing, measured on one clean, fast-decaying strike (the swinging bell's takes carry clangs of their own)
    clean = next(x for x in MANIFEST["cues"]["bell-small"] if x.get("kind") == "strike" and x["seconds"] < 3)
    pg.evaluate("(e) => AW.audio.samples.setManifest({layers: {}, cues: {'bell-strike': [e]}}, 'sounds/')", clean)
    r = offline(pg, seconds=8, window=0.05, cues=[{"name": "distant_bell", "at": 0.1, "opts": {"count": 3, "freq": 415, "distance": 0.2}}])
    assert r["cueLog"][0]["count"] == 3 and r["cueLog"][0]["file"] == clean["file"]
    env, w = r["env"], r["window"]
    rises = [i * w for i in range(2, len(env)) if env[i] > 2.0 * max(env[i - 2], 1e-6) and env[i] > 0.15 * max(env)]
    # (a strike of a swinging bell can carry a second, softer clang of its own: look for the three strikes)
    assert any(abs(t - 0.1) < 0.2 for t in rises), rises
    second = [t for t in rises if 2.0 < t - 0.1 < 2.8]
    third = [t for t in rises if second and 2.0 < t - second[0] < 2.8]
    assert second and third, rises
    assert not [t for t in rises if t > third[0] + 3.5], rises  # and no fourth
    # one strike by default (an hour-bell theme always sends count)
    r = offline(pg, seconds=1, cues=[{"name": "distant_bell", "at": 0.1, "opts": {"freq": 415}}])
    assert r["cueLog"][0]["count"] == 1 and r["cueLog"][0]["kind"] == "strike"


def test_live_cue_plays_a_recording(audio_page, fake):
    pg = live(audio_page, fake)
    assert pg.evaluate("AW.audio.cue('chime', {distance: 0.1})") is True
    assert poll(pg, "AW.audio.state().cueLog.some((c) => c.name === 'chime' && c.sampled)", timeout=5), pg.evaluate("AW.audio.state().cueLog")
    m = pg.evaluate("AW._debug.audio.meter(800)")
    assert m["maxRms"] > 1e-3, m
    assert pg.evaluate("AW.audio.cue('ward', {distance: 0.2})") is True  # the new cue name
    assert poll(pg, "AW.audio.state().cueLog.some((c) => c.name === 'ward' && c.sampled && c.slot === 'ward-crackle')", timeout=5)
    assert errors(pg) == []


def test_file_url_stays_procedural(audio_page):
    pg = audio_page(AMB, wait=100)
    pg.evaluate(VOID_THEME)
    pg.evaluate("AW._debug.audio.setSound(true); AW.audio.tau = 0.15; AW._debug.audio.override = { rain: 1, neon: 1 }")
    assert poll(pg, RUNNING, timeout=5)
    assert poll(pg, "AW.audio.state().layers.rain.source === 'procedural'", timeout=3)
    s = pg.evaluate("AW.audio.state()")
    assert s["samples"]["allowed"] is False and s["samples"]["fetches"] == []
    assert s["layers"]["neon"]["source"] == "off"  # no procedural stand-in for a neon buzz
    assert pg.evaluate("AW.audio.cue('ward')") is True  # procedural ward
    assert real_errors(pg) == []
