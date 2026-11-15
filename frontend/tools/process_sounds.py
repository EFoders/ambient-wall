#!/usr/bin/env python3
"""Build frontend/sounds/ (layers, cues, manifest.json, CREDITS.md) from sound-source/ reproducibly.

usage (from the repo root or frontend/):
    uv run --no-project --with numpy --with imageio-ffmpeg python frontend/tools/process_sounds.py [--only slot,slot] [--report]

Input: sound-source/sources.json (one entry per downloaded file: slot, file, title, author, license, page, ...)
and the files in sound-source/<slot>/. Output (wiped and rebuilt for the slots processed):

  sounds/layers/<slot>/<n>.mp3   loops for the sample player: a clean excerpt (first 2 s skipped, <= 120 s, two
                                 excerpts from different parts of long recordings), high-passed (LAYER_HP: mic
                                 rumble), loudness-normalised to -24 LUFS (ffmpeg loudnorm measures, a linear gain
                                 applies, a fast limiter catches rare peaks), 1 s fades, 112 kbps stereo 44.1 kHz
  sounds/cues/<slot>/<n>.mp3     one-shots: leading / trailing silence trimmed (decays and tails kept), split into
                                 takes where a source holds several events, peak-normalised to -3 dBFS, anti-click
                                 fades, 128 kbps stereo 44.1 kHz
  sounds/manifest.json           { layers: {slot: [{file, seconds, gain, weight, source, license, author, ...}]},
                                   cues: {slot: [{file, seconds, gain, kind?, count?, source, license, author}]} }
                                 gain = per-file trim to the slot's target level (layers: integrated loudness,
                                 cues: loudest 50 ms), so slots sit at sensible relative levels at engine level 1.
  sounds/CREDITS.md              attribution for every non-CC0 / non-public-domain file
  sounds/process_report.txt      what was cut from where, measured levels, the thunder and loon classifications

Decisions that are not plain rules live in EDITS below (the user's notes and the candidate cautions: cut points,
trims, filters, weights), each with its reason. Heuristics (and their thresholds) are documented where defined:
excerpt scoring (layer_windows), event splitting (events), thunder near / far (thunder_class), loon wail /
tremolo (loon_kind). Mono sources are upmixed to stereo (duplicated)."""
import argparse
import json
import math
import pathlib
import re
import shutil
import subprocess
import sys

import imageio_ffmpeg
import numpy as np

FF = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "sound-source"
OUT = ROOT / "frontend" / "sounds"

LAYER_SLOTS = ["rain-light", "rain-heavy", "rain-window", "wind-gentle", "wind-strong", "fire", "water",
               "city-night", "city-day", "town", "room", "cathedral", "space", "magic", "neon-buzz",
               "birds-forest", "birds-light", "crickets", "cicadas", "forest-rustle"]
CUE_SLOTS = ["thunder-near", "thunder-far", "train-pass", "hover-pass", "loon", "owl", "fire-pop", "drip",
             "chime", "bell-strike", "bell-small", "page-turn", "ward-crackle"]

SR_A = 16000             # analysis rate (mono)
SR_OUT = 44100
LAYER_KBPS, CUE_KBPS = 112, 128
TARGET_LUFS = -24.0
SKIP_HEAD, MAX_EXCERPT, LAYER_FADE = 2.0, 120.0, 1.0
CUE_PEAK_DB = -3.0

# Slot levels: the integrated loudness (LUFS) every file of a slot is trimmed to by its manifest gain, so the files
# of a slot match each other by ear. The values are calibrated against the engine's output (measured: each file
# rendered alone at level 1, master 1; the master compressor and limiter add ~+8-10 dB of makeup gain to quiet
# beds) so a sampled slot sits where the procedural voice it replaces sits (audio.js CAL), as output RMS dBFS:
# rain-light -23, rain-heavy -19, rain-window -23, wind-gentle -23, wind-strong -21, fire -21, water -22,
# city-night -24, city-day -23, town -24, room -37, cathedral -33, space -25, magic -27, neon-buzz -31,
# birds-forest -26, birds-light -29, crickets -27, cicadas -28, forest-rustle -24.
LAYER_TARGET = {
    "rain-light": -23.3, "rain-heavy": -20.4, "rain-window": -27.6, "wind-gentle": -28.7, "wind-strong": -25.8,
    "fire": -27.0, "water": -24.9, "city-night": -31.1, "city-day": -29.7, "town": -28.5, "room": -45.0,
    "cathedral": -38.2, "space": -33.6, "magic": -31.6, "neon-buzz": -37.0, "birds-forest": -28.6,
    "birds-light": -33.7, "crickets": -29.4, "cicadas": -29.6, "forest-rustle": -27.9,
}
# Cues: the loudest 50 ms (RMS dBFS) of every take at gain 1, distance 0, before the master chain. Calibrated like the
# layers against the engine output: each take rendered at distance 0.3 lands (loudest 50 ms, after the master chain)
# near its procedural voice (thunder near -12 / far -14, train -14, hover -16, loon -16, owl -17, drip -21, chime -19,
# bells -22, page -19); pops sit a little over the procedural pop (whose crackle is only a few ms long), the new
# ward cue at about -20.
CUE_TARGET = {
    "thunder-near": -10, "thunder-far": -15.5, "train-pass": -16.5, "hover-pass": -19.5, "loon": -21, "owl": -22,
    "fire-pop": -21, "drip": -22, "chime": -24, "bell-strike": -29, "bell-small": -27.5, "page-turn": -20.5,
    "ward-crackle": -23,
}

# Per-source edits (keyed by the source file's stem). Keys:
#   start / end         usable range in seconds (layers: excerpts come from here; cues: the region processed)
#   start_frac          start at this fraction of the file
#   af                  extra ffmpeg filters applied before anything else
#   weight              rotation weight of the source (split over its excerpts)
#   takes               explicit cue takes [(start, end, extra)] (extra: {"kind":..,"count":..,"fade_out":..})
#   split               "events" (cut individual calls) | "onsets" (single strikes) | "peaks" (rumbles) | "whole"
#   kind                label for every take of the source
#   n                   max takes from this source
EDITS = {
    # user: forest-rustle, only the second half of the recording
    "ecfike-183496": {"start_frac": 0.5},
    # crackling fires: the pops have a huge crest factor; a fast limiter (0.5 ms attack, 15 ms release) may take up
    # to 12 dB off them (a sub-millisecond crackle keeps its snap) so the bed itself can sit at a normal level
    # heckfricker's fire is a soft one under very sharp crackles (~40 dB crest in 20 ms frames): even with 12 dB of
    # crackle limiting its bed plays ~18 dB under the other fire at the same loudness, a jarring drop at every join
    # of the rotation (lifting it further would pump the limiter on each crackle). Left out of the layer.
    "heckfricker-729396": {"skip": True},
    "spandau-40699": {"max_limit": 12, "limiter": (0.5, 15)},
    # user + caution: the first 11 min are from a fixed position; from 11:00 it is a walking recording
    "metzik-371222": {"end": 660},
    # cautions: noisy water and road traffic / likely spring peepers in places: one (the cleanest) excerpt only
    "trp-567908": {"excerpts": 1},
    "soundpacks-388401": {"excerpts": 1},
    # user: busy, shouting and animals: keep it, but it is the least ambient pick
    "ogsoundfx-423119": {"weight": 0.25},
    # caution: "lowcut to taste" (strong low hum in the raw file)
    "kyles-453496": {"af": "highpass=f=140:p=2"},
    "kyles-637729": {"af": "highpass=f=90"},
    # caution: a black cockatoo flies off at the end of 'Thunder, Close'
    "fission9-505113": {"takes": [(0.0, 12.0, {"fade_out": 1.5})]},
    # 'Thunder Re-edit' holds two strikes (0 s and 21.3 s); startled birds chirp in the first one's tail
    "fission9-476228": {"takes": [(0.0, 9.5, {"fade_out": 2.0}), (20.8, 32.4, {})]},
    # caution: a long take to cut into separate rumbles
    "trp-717845": {"split": "peaks", "n": 4},
    # the six-strike tower clock is an hour-strike file: kept whole (count 6) plus three single strikes
    "agc66-394657": {"takes": [(0.0, 15.3, {"count": 6, "kind": "strikes"}),
                               (1.0, 3.62, {"fade_out": 0.35}), (5.8, 7.85, {"fade_out": 0.35}),
                               (11.75, 15.3, {})]},
    # caution: several strikes (0.4 s, 2.05 s, 4.15 s); singles: the first, and the last with its long decay
    "refrain-266499": {"takes": [(0.25, 2.0, {"fade_out": 0.3}), (4.05, 15.35, {})]},
    # 'Church Bell 2' is slow tolling (a strike every 3.5-5 s): single strikes cut at the onsets
    "nachtmahrtv-556703": {"split": "onsets", "n": 4},
    # 'Church Bell 1' and '3' are fast peals of a swinging bell: no single strikes in them, kept as peal excerpts
    "nachtmahrtv-556702": {"takes": [(0.6, 12.6, {"kind": "peal", "fade_out": 1.5})]},
    "nachtmahrtv-556704": {"takes": [(0.8, 12.8, {"kind": "peal", "fade_out": 1.5})]},
    # loons: the Yellowstone file is labelled tremolo; nicStage's are not labelled (spectral heuristic)
    "yellowstone-sound-library-common-loon-001": {"split": "events", "kind": "tremolo", "n": 5},
    "nicstage-432603": {"split": "events", "n": 6},
    "nicstage-432604": {"split": "events", "n": 4},
    "nicstage-432605": {"split": "events", "n": 4},
    # owls: two phrases each; the screech owl's background talking / car sits between its two trills
    "bubo-virginianus-great-horned-owl-xc450919": {"split": "events", "af": "highpass=f=140", "n": 2, "band": (200, 1500)},
    "megascops-asio-eastern-screech-owl-xc75829": {"takes": [(0.55, 6.3, {}), (27.2, 32.0, {})], "af": "highpass=f=200"},
    # barred owl: a field-station recorder with loud broadband ticks; band-limit to the hoot and keep the call only
    "strix-varia-barred-owl-xc457078": {"takes": [(1.85, 3.5, {"fade_out": 0.25})],
                                        "af": "highpass=f=300:p=2,lowpass=f=1300:p=2"},
    # caution: the lighter at the start and the extinguish at the end; cut short wick sputters from the middle
    "vrymaa-734665": {"start": 6.0, "end": 53.0, "split": "sputters", "n": 5},
    # caution: camcorder hiss, real electricity is harsh: high-pass the rumble, soften the top
    "halleck-19484": {"af": "highpass=f=120,lowpass=f=9000"},
    "halleck-19485": {"af": "highpass=f=120,lowpass=f=9000"},
    "halleck-19486": {"af": "highpass=f=120,lowpass=f=9000"},
    "halleck-19487": {"af": "highpass=f=120,lowpass=f=9000"},
}
# sources.json lumps the three xeno-canto owls under one author / licence string; the Commons file pages name each
# recordist and licence (checked 2026-10-12), so the manifest and the credits use these.
SOURCE_FIX = {
    "bubo-virginianus-great-horned-owl-xc450919": {"author": "Michael & Katie LaTour", "license": "CC BY-SA 4.0",
                                                    "title": "Great Horned Owl (Bubo virginianus), XC450919",
                                                    "via": "https://www.xeno-canto.org/450919"},
    "strix-varia-barred-owl-xc457078": {"author": "Rob Porter", "license": "CC BY-SA 4.0",
                                        "title": "Barred Owl (Strix varia), XC457078", "via": "https://www.xeno-canto.org/457078"},
    "megascops-asio-eastern-screech-owl-xc75829": {"author": "Jonathon Jongsma", "license": "CC BY-SA 3.0",
                                                   "title": "Eastern Screech Owl (Megascops asio), XC75829",
                                                   "via": "https://www.xeno-canto.org/75829"},
}
# High-pass per layer slot (Hz). Field recordings carry sub-bass that is not the scene: wind buffeting the mics,
# distant traffic rumble (measured: 80-97 % of the energy under 80 Hz in some rain, wind, birdsong and leaf-rustle
# takes). It inflates the level without being heard as the sound, and would push the limiter. Space, city, room and
# cathedral keep their low end (the hum and the rumble are the scene); every layer loses DC / subsonics under 25 Hz.
LAYER_HP = {
    "rain-light": 90, "rain-heavy": 50, "rain-window": 60, "wind-gentle": 50, "wind-strong": 60, "fire": 50,
    "water": 50, "town": 50, "birds-forest": 110, "birds-light": 90, "crickets": 110, "cicadas": 110,
    "forest-rustle": 120, "magic": 40,
}
NATURE = {"birds-forest", "birds-light", "crickets", "cicadas", "forest-rustle", "rain-light", "water"}


# ---------------------------------------------------------------- ffmpeg helpers
def run(cmd):
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode:
        raise RuntimeError(f"ffmpeg failed: {' '.join(map(str, cmd))}\n{r.stderr.decode(errors='replace')[-1500:]}")
    return r


def decode(path, sr=SR_A, ch=1, ss=None, t=None, af=None):
    cmd = [FF, "-v", "error"] + (["-ss", f"{ss:.3f}"] if ss else []) + (["-t", f"{t:.3f}"] if t else [])
    cmd += ["-i", str(path)] + (["-af", af] if af else []) + ["-ac", str(ch), "-ar", str(sr), "-f", "f32le", "-"]
    x = np.frombuffer(run(cmd).stdout, np.float32).copy()
    return x.reshape(-1, ch) if ch > 1 else x


def duration(path):
    r = subprocess.run([FF, "-hide_banner", "-i", str(path)], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])


def encode(x, out, kbps):
    """x: float32 (n, 2) at SR_OUT -> MP3."""
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [FF, "-v", "error", "-y", "-f", "f32le", "-ar", str(SR_OUT), "-ac", "2", "-i", "-",
           "-c:a", "libmp3lame", "-b:a", f"{kbps}k", str(out)]
    r = subprocess.run(cmd, input=np.ascontiguousarray(x, np.float32).tobytes(), capture_output=True)
    if r.returncode:
        raise RuntimeError(r.stderr.decode(errors="replace")[-1500:])


def lufs(path):
    r = run([FF, "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"])
    s = r.stderr.decode(errors="replace")
    i = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", s)[-1])
    pk = re.findall(r"Peak:\s+(-?[\d.inf]+) dBFS", s)
    return i, (float(pk[-1]) if pk else None)


def frames_db(x, sr, hop):
    """RMS dB per hop (mono or (n, ch): the louder channel)."""
    n = int(hop * sr)
    m = len(x) // n
    if m == 0:
        return np.array([-120.0])
    y = x[: m * n]
    p = (y.reshape(m, n, -1) ** 2).mean(1).max(1) if y.ndim == 2 else (y.reshape(m, n) ** 2).mean(1)
    return 10 * np.log10(p + 1e-12)


def stft(x, sr, hop=0.01, win=0.04):
    n, w = int(hop * sr), int(win * sr)
    if len(x) < w + n:
        x = np.pad(x, (0, w + n - len(x)))
    idx = np.arange(0, len(x) - w, n)
    W = np.hanning(w)
    F = np.abs(np.fft.rfft(np.stack([x[i:i + w] * W for i in idx]), axis=1)) ** 2
    return F, np.fft.rfftfreq(w, 1 / sr)


def smooth(v, k):
    """Moving average, edge-padded (so the ends are not pulled towards 0)."""
    k = max(1, int(k))
    if k == 1 or len(v) == 0:
        return np.asarray(v, float)
    w = np.pad(np.asarray(v, float), (k // 2, k - 1 - k // 2), mode="edge")
    return np.convolve(w, np.ones(k) / k, "valid")


# ---------------------------------------------------------------- layers
def usable(e, dur):
    ed = EDITS.get(stem(e), {})
    a = max(SKIP_HEAD, ed.get("start", 0.0), dur * ed.get("start_frac", 0.0))
    b = min(dur - 0.5, ed.get("end", dur))
    return a, b


def layer_windows(e, path, dur):
    """Choose 1-2 excerpts: the steadiest windows (least level wander, fewest spikes / dropouts; for nature beds
    also the fewest low-frequency bursts = passing traffic) in the usable range. Two excerpts (from different
    parts, at least 20 s apart) when the usable range holds more than 2 x 120 s + 30 s."""
    a, b = usable(e, dur)
    L = min(MAX_EXCERPT, b - a)
    want = min(EDITS.get(stem(e), {}).get("excerpts", 2), 2 if (b - a) >= 2 * MAX_EXCERPT + 30 else 1)
    if (b - a) <= L + 1:
        return [(a, a + L, 0.0)]
    x = decode(path, ss=a, t=b - a)
    lv = frames_db(x, SR_A, 0.5)
    low = None
    if e["slot"] in NATURE:  # traffic / rumble: energy below 250 Hz per 0.5 s
        F, f = stft(x, SR_A, hop=0.5, win=0.5)
        low = 10 * np.log10(F[:, (f > 30) & (f < 250)].sum(1) + 1e-12)
    n = int(L / 0.5)
    cands = []
    for s in range(0, max(1, len(lv) - n), 4):  # every 2 s
        w = lv[s:s + n]
        med = np.median(w)
        score = np.std(w) + 0.5 * max(0, np.percentile(w, 99) - med - 6) + 0.5 * max(0, med - np.percentile(w, 3) - 6)
        if low is not None:
            lw = low[s:s + n]
            score += 0.4 * max(0, np.percentile(lw, 97) - np.median(lw) - 6)
        cands.append((score, s * 0.5))
    cands.sort()
    out = [cands[0]]
    if want == 2:
        for sc, st in cands[1:]:
            if abs(st - out[0][1]) >= L + 20:
                out.append((sc, st))
                break
    return sorted((a + st, a + st + L, sc) for sc, st in out)


def loudnorm_json(stderr):
    s = stderr.decode(errors="replace")
    return json.loads(s[s.rindex("{"): s.rindex("}") + 1])


def make_layer(e, path, s0, s1, out):
    """loudnorm (pass 1) measures the excerpt's integrated loudness; a linear gain brings it to TARGET_LUFS (pass 2).
    loudnorm's own linear mode falls back to dynamic compression whenever a peak would pass its true-peak ceiling,
    which pumps beds with crackles or drops (fire, rain), so pass 2 applies the gain itself and a fast peak limiter
    at -1.5 dBFS that only touches those rare peaks. A source whose crest factor would need more than 3 dB of
    limiting is normalised that much lower instead (its manifest gain makes up the difference in the engine)."""
    ed = EDITS.get(stem(e), {})
    pre = f"highpass=f={LAYER_HP.get(e['slot'], 25)}," + ((ed["af"] + ",") if ed.get("af") else "")
    t = s1 - s0
    m = loudnorm_json(run([FF, "-hide_banner", "-nostats", "-ss", f"{s0:.3f}", "-t", f"{t:.3f}", "-i", str(path), "-af",
                           f"{pre}loudnorm=I={TARGET_LUFS}:TP=-1.5:LRA=20:print_format=json", "-f", "null", "-"]).stderr)
    g = TARGET_LUFS - float(m["input_i"])
    lim = ed.get("limiter", (2, 60))  # attack, release (ms)
    excess, allow = float(m["input_tp"]) + g + 1.5, ed.get("max_limit", 3)
    if excess > allow:
        g -= excess - allow
    af = (f"{pre}aresample={SR_OUT},volume={g:.2f}dB,alimiter=limit={10 ** (-1.5 / 20):.4f}:attack={lim[0]}:release={lim[1]}:level=false,"
          f"afade=t=in:d={LAYER_FADE},afade=t=out:st={t - LAYER_FADE:.3f}:d={LAYER_FADE}")
    out.parent.mkdir(parents=True, exist_ok=True)
    run([FF, "-hide_banner", "-nostats", "-y", "-ss", f"{s0:.3f}", "-t", f"{t:.3f}", "-i", str(path), "-af", af,
         "-ac", "2", "-ar", str(SR_OUT), "-c:a", "libmp3lame", "-b:a", f"{LAYER_KBPS}k", str(out)])
    i, pk = lufs(out)
    y = decode(out, sr=22050, ch=2)
    rms = 10 * math.log10(float((y ** 2).mean()) + 1e-12)
    tp = float(m["input_tp"]) + g
    return {"lufs": round(i, 1), "rms": round(rms, 1), "peak_db": pk,
            "norm": f"gain {g:+.1f} dB" + (f", limited {tp + 1.5:.1f} dB" if tp > -1.5 else "")}


# ---------------------------------------------------------------- cues
def events(x, sr, rel=0.45, min_len=0.8, merge=0.7, band=(400, 3000)):
    """Calls / phrases: band energy (10 ms hop, 150 ms smoothing) above floor + rel x (peak - floor), gaps under
    `merge` s merged, events shorter than `min_len` s dropped. -> [(start s, end s, peak dB)]"""
    F, f = stft(x, sr)
    e = smooth(10 * np.log10(F[:, (f > band[0]) & (f < band[1])].sum(1) + 1e-12), 15)
    floor, peak = np.percentile(e, 10), np.percentile(e, 99.5)
    on = e > floor + rel * (peak - floor)
    ev, i = [], 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and on[j]:
                j += 1
            if ev and (i - ev[-1][1]) * 0.01 < merge:
                ev[-1][1] = j
            else:
                ev.append([i, j])
            i = j
        else:
            i += 1
    return [(s * 0.01, t * 0.01, float(e[s:t].max())) for s, t in ev if (t - s) * 0.01 >= min_len], e


def chunk(s, t, e, maxlen=8.0, minlen=2.5):
    """Split a long event at its quietest points into pieces of at most `maxlen` s."""
    if t - s <= maxlen:
        return [(s, t)]
    out, a = [], s
    while t - a > maxlen:
        lo, hi = int((a + minlen) / 0.01), int((a + maxlen) / 0.01)
        k = lo + int(np.argmin(e[lo:hi]))
        out.append((a, k * 0.01))
        a = k * 0.01
    if t - a >= minlen:
        out.append((a, t))
    return out


def loon_kind(x, sr, s, t):
    """Wail vs tremolo from the call's amplitude modulation: the tremolo (the 'laugh') quavers at 7-10 Hz, the wail
    is a long smooth note. Ratio of 6-14 Hz to 1-20 Hz modulation power of the 500-2600 Hz band envelope:
    >= 0.5 tremolo; <= 0.42 with a fundamental under 1100 Hz and >= 1.8 s long: wail; else unknown.
    (Calibration: the Yellowstone tremolos 0.42-0.81, median 0.56; nicStage's isolated calls 0.33-0.44 at ~850 Hz.)"""
    seg = x[int(s * sr): int(t * sr)]
    F, f = stft(seg, sr)
    band = (f > 500) & (f < 2600)
    env = 10 * np.log10(F[:, band].sum(1) + 1e-12)
    d = env - smooth(env, 25)
    P = np.abs(np.fft.rfft(d * np.hanning(len(d)))) ** 2
    fm = np.fft.rfftfreq(len(d), 0.01)
    ratio = P[(fm > 6) & (fm < 14)].sum() / (P[(fm > 1) & (fm < 20)].sum() + 1e-12)
    f0 = float(np.median(f[band][np.argmax(F[:, band], axis=1)]))
    if ratio >= 0.5:
        kind = "tremolo"
    elif ratio <= 0.42 and f0 < 1100 and t - s >= 1.8:
        kind = "wail"
    else:
        kind = "unknown"
    return kind, round(float(ratio), 2), round(f0)


def thunder_class(x, sr):
    """Near vs far: a near strike has a sharp, bright crack. Measures, around the loudest moment: the share of
    energy above 2 kHz in the 2 s from the peak (near >= 0.05 %, i.e. > -33 dB; distant rolls are ~0 because air
    and distance strip the highs) and the fastest 60 ms rise of the 2-8 kHz band in the 1.5 s before it
    (near >= 10 dB). Both must hold."""
    F, f = stft(x, sr, hop=0.02, win=0.04)
    tot = smooth(10 * np.log10(F.sum(1) + 1e-12), 5)
    hf = 10 * np.log10(F[:, f > 2000].sum(1) + 1e-12)
    k = int(np.argmax(tot))
    a = max(0, k - 75)
    rise = max([hf[i + 3] - hf[i] for i in range(a, min(len(hf) - 3, k + 10))] or [0])
    seg = F[k:k + 100]
    share = seg[:, f > 2000].sum() / (seg.sum() + 1e-12)
    near = share >= 5e-4 and rise >= 10
    return ("near" if near else "far"), {"hf_share_pct": round(100 * share, 3), "hf_rise_db": round(float(rise), 1)}


def onsets(x, sr, min_gap=1.5, jump=10.0):
    """Bell strikes: the 1-8 kHz band jumps by `jump` dB within 60 ms (at least `min_gap` s apart)."""
    F, f = stft(x, sr, hop=0.02)
    hf = smooth(10 * np.log10(F[:, (f > 1000) & (f < 8000)].sum(1) + 1e-12), 2)
    out = []
    for i in range(3, len(hf)):
        if hf[i] - hf[i - 3] >= jump and (not out or (i * 0.02 - out[-1]) >= min_gap):
            out.append(max(0.0, (i - 3) * 0.02))
    return out


def trim(y, sr, pre=0.02, post=0.12):
    """Leading / trailing silence: start where the level first reaches max(floor + 8, peak - 50) dB, end where it
    last stays above max(floor + 3, peak - 65) dB, so natural decays and reverb tails are kept to the noise floor."""
    lv = frames_db(y, sr, 0.01)
    peak, floor = lv.max(), min(np.percentile(lv, 10), lv.max() - 40)
    on = np.nonzero(lv >= max(floor + 8, peak - 50))[0]
    off = np.nonzero(lv >= max(floor + 3, peak - 65))[0]
    a = max(0, int((on[0] * 0.01 - pre) * sr))
    b = min(len(y), int((off[-1] * 0.01 + 0.01 + post) * sr))
    return y[a:b], a / sr


def fades(y, sr, fin=0.004, fout=0.05):
    n = len(y)
    i, o = min(n // 4, int(fin * sr)), min(n // 3, int(fout * sr))
    w = np.ones(n, np.float32)
    if i > 0:
        w[:i] = np.linspace(0, 1, i) ** 1.5
    if o > 0:
        w[n - o:] = np.cos(np.linspace(0, np.pi / 2, o)) ** 2
    return y * w[:, None]


def cue_takes(e, path, dur):
    """-> [(start, end, extra)] in source seconds."""
    ed = EDITS.get(stem(e), {})
    if "takes" in ed:
        return [(s, min(t, dur), dict(x)) for s, t, x in ed["takes"]]
    a, b = ed.get("start", 0.0), min(dur, ed.get("end", dur))
    split = ed.get("split", "whole")
    if split == "whole":
        return [(a, b, {})]
    x = decode(path, ss=a, t=b - a, af=ed.get("af"))
    n = ed.get("n", 8)
    if split == "events":
        # every distinct call first (its loudest piece), then further pieces of long choruses, loudest first
        ev, env = events(x, SR_A, band=ed.get("band", (400, 3000)))
        first, rest = [], []
        for s, t, pk in ev:
            ps = sorted(((float(env[int(s2 / 0.01):int(t2 / 0.01)].max()), s2, t2) for s2, t2 in chunk(s, t, env)), reverse=True)
            first.append(ps[0])
            rest += ps[1:]
        keep = sorted(sorted(first, reverse=True)[:n], key=lambda p: p[1])
        keep = sorted(keep + sorted(rest, reverse=True)[:max(0, n - len(keep))], key=lambda p: p[1])
        return [(a + max(0, s - 0.15), a + min(b - a, t + 0.6), {}) for _, s, t in keep]
    if split == "onsets":
        on = onsets(x, SR_A)
        segs = [(on[i], on[i + 1] if i + 1 < len(on) else b - a) for i in range(len(on))]
        segs = [(s, t) for s, t in segs if t - s >= 1.2][:n]
        return [(a + max(0, s - 0.03), a + t - 0.02, {"fade_out": 0.35}) for s, t in segs]
    if split == "peaks":  # thunder rumbles in a long take: prominent peaks of the 2 s smoothed level
        lv = smooth(frames_db(x, SR_A, 0.1), 20)
        base = smooth(lv, 300)
        cand = [i for i in range(1, len(lv) - 1) if lv[i] >= lv[i - 1] and lv[i] >= lv[i + 1] and lv[i] - base[i] >= 4]
        cand.sort(key=lambda i: lv[i] - base[i], reverse=True)
        picks = []
        for i in cand:
            if all(abs(i - j) > 150 for j in picks):
                picks.append(i)
            if len(picks) >= n:
                break
        out = []
        for i in sorted(picks):
            pk = i * 0.1
            lo = max(0, pk - 5)
            k = int(lo / 0.1) + int(np.argmin(lv[int(lo / 0.1):i])) if i > int(lo / 0.1) else i
            out.append((a + max(0, k * 0.1 - 0.3), a + min(b - a, pk + 15), {"fade_out": 3.0, "fade_in": 0.4}))
        return out
    if split == "sputters":  # wick crackle: windows of ~2.5 s around the most prominent isolated crackles
        lv = frames_db(x, SR_A, 0.02)
        base = smooth(lv, 100)
        order = np.argsort(-(lv - base))
        picks = []
        for i in order:
            if all(abs(i - j) > 200 for j in picks):
                picks.append(int(i))
            if len(picks) >= n:
                break
        return [(a + max(0, i * 0.02 - 0.6), a + min(b - a, i * 0.02 + 1.9), {"fade_out": 0.3, "fade_in": 0.05})
                for i in sorted(picks)]
    raise ValueError(split)


def loudest50(y, sr):
    n = int(0.05 * sr)
    p = (y[: len(y) // n * n].reshape(-1, n, 2) ** 2).mean((1, 2))
    return 10 * math.log10(p.max() + 1e-12)


def make_cue(e, path, s0, s1, extra, out):
    ed = EDITS.get(stem(e), {})
    y = decode(path, sr=SR_OUT, ch=2, ss=s0, t=s1 - s0, af=ed.get("af"))
    forced_end = "fade_out" in extra
    y, off = trim(y, SR_OUT, post=0.12 if not forced_end else 10.0)
    y = fades(y, SR_OUT, fin=extra.get("fade_in", 0.004), fout=extra.get("fade_out", 0.05))
    pk = float(np.abs(y).max())
    y = y * (10 ** (CUE_PEAK_DB / 20) / max(pk, 1e-9))
    encode(y, out, CUE_KBPS)
    return {"seconds": round(len(y) / SR_OUT, 2), "l50": round(loudest50(y, SR_OUT), 1), "from": round(s0 + off, 2)}


# ---------------------------------------------------------------- credits
# Only licences that allow any use, commercial included, and modification: CC0 / public domain (no credit needed),
# CC BY and CC BY-SA (credited below; BY-SA excerpts stay BY-SA). NonCommercial, NoDerivatives, Sampling+, "personal
# use" or unknown licences are refused (credits() raises), so a non-free source cannot slip into the bundle.
LICENSE_URL = {
    "CC-BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
    "CC-BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
    "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
    "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
}
LICENSE_NOTE = {  # what the author asks for beyond the standard attribution (requests, not licence terms)
    "OGsoundFX": "A sample from a commercial library (OGsoundFX), shared under CC BY 4.0.",
}


def free(lic):
    return lic.upper().startswith("CC0") or "public domain" in lic.lower()


def lic_name(lic):
    return lic.replace("CC-BY", "CC BY")


def credits(used):
    """used: [(entry, [output files])]"""
    bad = sorted({u[0]["license"] for u in used if not free(u[0]["license"]) and u[0]["license"] not in LICENSE_URL})
    if bad:
        raise ValueError(f"not a free licence (CC0 / public domain / CC BY / CC BY-SA only): {bad}")
    att = sorted([u for u in used if not free(u[0]["license"])], key=lambda u: (u[0]["slot"], u[0]["author"].lower()))
    lics = sorted({u[0]["license"] for u in att}, key=lambda s: ("SA" in s, s))
    lines = ["# Sound credits", "",
             "**Licence summary:** all sounds in `sounds/` are CC0, CC BY or CC BY-SA; free for any use including "
             "commercial with the credits below. No file is under a NonCommercial or NoDerivatives licence.", "",
             "The sounds are processed excerpts of field recordings and sound designs (cut, trimmed, loudness- or "
             "peak-normalised, faded and re-encoded as MP3 by `tools/process_sounds.py`): every file was modified. "
             "Licences of the credited files: "
             + ", ".join(f"[{lic_name(lic)}]({LICENSE_URL[lic]})" for lic in lics) + ". "
             "Files cut from a CC BY-SA recording (marked below) are themselves licensed under that same CC BY-SA "
             "licence; the rest are CC0 / public domain (no credit required) or CC BY (credit as below).", "",
             "## Attribution required", ""]
    for e, files in att:
        lic = e["license"]
        lic_txt = f"[{lic_name(lic)}]({LICENSE_URL[lic]})"
        lines.append(f"- **\"{e['title']}\"** by {e['author']}, {e['page']}, licensed under {lic_txt}. "
                     f"Modified (excerpted and processed); used as {', '.join(f'`{f}`' for f in files)}.")
        if "BY-SA" in lic:
            lines.append(f"  Recording from xeno-canto ({e.get('via', '')}) via Wikimedia Commons. These derived files "
                         f"are shared under the same licence ({lic}).")
        note = LICENSE_NOTE.get(e["author"])
        if note:
            lines.append(f"  {note}")
    lines += ["", "## Also used (CC0 / public domain, no credit required)", ""]
    for e, files in sorted([u for u in used if free(u[0]["license"])], key=lambda u: (u[0]["slot"], u[0]["author"].lower())):
        extra = " (courtesy National Park Service)" if "NPS" in e["license"] else ""
        lines.append(f"- \"{e['title']}\" by {e['author']}{extra}, {e['page']} ({e['license']}): "
                     f"{', '.join(f'`{f}`' for f in files)}")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- main
def stem(e):
    return pathlib.Path(e["file"]).stem


def fixed(e):
    return {**e, **SOURCE_FIX.get(stem(e), {})}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated slots, or 'layers' / 'cues' (the manifest keeps the other slots)")
    args = ap.parse_args()
    if args.only in ("layers", "cues"):
        args.only = ",".join(LAYER_SLOTS if args.only == "layers" else CUE_SLOTS)
    src = json.loads((SRC / "sources.json").read_text(encoding="utf-8"))
    entries = sorted((fixed(e) for e in src.values()), key=lambda e: (e["slot"], e["file"]))
    only = set(args.only.split(",")) if args.only else None
    mpath = OUT / "manifest.json"
    manifest = json.loads(mpath.read_text(encoding="utf-8")) if (only and mpath.exists()) else {"layers": {}, "cues": {}}
    report = []
    by_slot = {}
    for e in entries:
        by_slot.setdefault(e["slot"], []).append(e)
    # thunder: classify every Fission9 take (the pack was picked for both slots) by its sound, not its folder
    thunder_pool = []
    for slot in LAYER_SLOTS + CUE_SLOTS:
        if only and slot not in only and not (slot.startswith("thunder") and only & {"thunder-near", "thunder-far"}):
            continue
        group = "layers" if slot in LAYER_SLOTS else "cues"
        if slot.startswith("thunder"):
            continue
        d = OUT / group / slot
        if d.exists():
            shutil.rmtree(d)
        items = []
        n = 0
        for e in by_slot.get(slot, []):
            if EDITS.get(stem(e), {}).get("skip"):
                report.append(f"skipped {e['file']}")
                continue
            path = ROOT / e["file"]
            dur = duration(path)
            base = {"source": e["page"], "license": e["license"], "author": e["author"], "title": e["title"]}
            if group == "layers":
                wins = layer_windows(e, path, dur)
                w = EDITS.get(stem(e), {}).get("weight", 1.0) / len(wins)
                for s0, s1, sc in wins:
                    n += 1
                    rel = f"layers/{slot}/{n}.mp3"
                    m = make_layer(e, path, s0, s1, OUT / rel)
                    # to the slot's loudness; but a crackly bed (crest factor) never asks for peaks over +4 dBFS,
                    # and a bass-heavy one (the space hum) no more than 4 dB of RMS over the slot's target
                    gain = min(10 ** ((LAYER_TARGET[slot] - m["lufs"]) / 20), 10 ** ((4 - (m["peak_db"] or 0)) / 20),
                               10 ** ((LAYER_TARGET[slot] + 4 - m["rms"]) / 20))
                    items.append({"file": rel, "seconds": round(s1 - s0 - 0.0, 2), "gain": round(gain, 4), "weight": round(w, 3),
                                  **base, "excerpt": [round(s0, 1), round(s1, 1)], "lufs": m["lufs"], "rms": m["rms"]})
                    report.append(f"{rel:32s} {pathlib.Path(e['file']).name:42s} {s0:7.1f}-{s1:7.1f}s score {sc:5.2f} "
                                  f"{m['lufs']:6.1f} LUFS {m['rms']:6.1f} dB RMS pk {m['peak_db']} {m['norm']} -> gain {gain:.3f}")
            else:
                for s0, s1, extra in cue_takes(e, path, dur):
                    item = {"src": e, "path": path, "s0": s0, "s1": s1, "extra": extra, "base": base}
                    items.append(item)
        if group == "cues":
            items = finish_cues(slot, items, report)
        manifest[group][slot] = items
        print(f"{slot}: {len(items)} file(s)", flush=True)
    if not only or only & {"thunder-near", "thunder-far"}:
        for slot in ("thunder-near", "thunder-far"):
            d = OUT / "cues" / slot
            if d.exists():
                shutil.rmtree(d)
        pool = {"thunder-near": [], "thunder-far": []}
        for slot in ("thunder-near", "thunder-far"):
            for e in by_slot.get(slot, []):
                path = ROOT / e["file"]
                dur = duration(path)
                base = {"source": e["page"], "license": e["license"], "author": e["author"], "title": e["title"]}
                for s0, s1, extra in cue_takes(e, path, dur):
                    target = slot
                    if e["author"] == "Fission9":  # picked for both slots: decide by the sound
                        x = decode(path, ss=s0, t=s1 - s0, af=EDITS.get(stem(e), {}).get("af"))
                        cls, met = thunder_class(x, SR_A)
                        target = "thunder-" + cls
                        report.append(f"thunder {pathlib.Path(e['file']).name} {s0:.1f}-{s1:.1f}s -> {cls} {met} (folder {slot})")
                    pool[target].append({"src": e, "path": path, "s0": s0, "s1": s1, "extra": extra, "base": base})
        for slot in ("thunder-near", "thunder-far"):
            manifest["cues"][slot] = finish_cues(slot, pool[slot], report)
            print(f"{slot}: {len(manifest['cues'][slot])} file(s)", flush=True)

    # order and write
    manifest = {"version": 1, "layers": {s: manifest["layers"][s] for s in LAYER_SLOTS if s in manifest["layers"]},
                "cues": {s: manifest["cues"][s] for s in CUE_SLOTS if s in manifest["cues"]}}
    mpath.parent.mkdir(parents=True, exist_ok=True)
    mpath.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    used = {}
    for group in ("layers", "cues"):
        for slot, items in manifest[group].items():
            for it in items:
                key = it["source"] + "|" + it["title"]
                used.setdefault(key, [next(e for e in entries if e["page"] == it["source"] and e["title"] == it["title"]), []])[1].append(it["file"])
    (OUT / "CREDITS.md").write_text(credits(list(used.values())), encoding="utf-8")
    (OUT / "process_report.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
    total = sum(p.stat().st_size for p in OUT.rglob("*.mp3"))
    counts = {g: {s: len(v) for s, v in manifest[g].items()} for g in ("layers", "cues")}
    print(json.dumps(counts))
    print(f"total {total / 1e6:.1f} MB in {sum(1 for _ in OUT.rglob('*.mp3'))} files")


def finish_cues(slot, items, report):
    out = []
    for n, it in enumerate(items, 1):
        e, rel = it["src"], f"cues/{slot}/{n}.mp3"
        m = make_cue(e, it["path"], it["s0"], it["s1"], it["extra"], OUT / rel)
        # level from the loudest 50 ms, capped so a take's peak stays under +3 dBFS at gain 1 (a thunder crack's
        # crest factor would otherwise ask for far more; the limiter and the soft ceiling take the rest)
        gain = min(10 ** ((CUE_TARGET[slot] - m["l50"]) / 20), 10 ** ((3 - CUE_PEAK_DB) / 20))
        rec = {"file": rel, "seconds": m["seconds"], "gain": round(gain, 4)}
        kind = it["extra"].get("kind") or EDITS.get(stem(e), {}).get("kind")
        if slot == "loon":
            x = decode(it["path"], ss=it["s0"], t=it["s1"] - it["s0"])
            k, ratio, f0 = loon_kind(x, SR_A, 0, it["s1"] - it["s0"])
            report.append(f"loon {rel} {pathlib.Path(e['file']).name} {it['s0']:.1f}-{it['s1']:.1f}s heuristic {k} "
                          f"(mod {ratio}, f0 {f0}){' label ' + kind if kind else ''}")
            kind = kind or k
        if slot.startswith("bell"):
            rec["count"] = it["extra"].get("count", 1 if kind != "peal" else 0)
            kind = kind or "strike"
        if kind:
            rec["kind"] = kind
        rec.update({k: v for k, v in it["base"].items()})
        rec["excerpt"] = [round(m["from"], 2), round(m["from"] + m["seconds"], 2)]
        out.append(rec)
        report.append(f"{rel:28s} {pathlib.Path(e['file']).name:44s} {it['s0']:7.2f}-{it['s1']:7.2f}s -> {m['seconds']:5.2f}s "
                      f"l50 {m['l50']:6.1f} gain {gain:.3f}{' ' + kind if kind else ''}")
    return out


if __name__ == "__main__":
    sys.exit(main())
