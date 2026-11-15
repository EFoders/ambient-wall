#!/usr/bin/env python3
"""Screenshot a theme in every state and report brightness rules.

usage: python3 tools/shoot.py --theme cyberpunk [--out shots] [--w 1920 --h 1080] [--extra wx=storm] [--channel msedge]
   no system Python? uv run --with playwright --with pillow --with numpy python tools/shoot.py --channel msedge ...
Writes <theme>-<state>.png and prints per-shot metrics:
  max   = brightest channel value anywhere (want <= ~215)
  white = count of near-white pixels (all channels > 200, low chroma) (want 0)
  mean  = mean luminance 0-255 (want very low, single digits to low teens)
Also prints any page console errors.
"""
import argparse, pathlib, sys
from urllib.parse import parse_qsl, urlencode
from playwright.sync_api import sync_playwright
from PIL import Image
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATES = {
    # name: (query, action)  action: None or ("to_ambient", seconds_to_wait)
    "work":            ("mode=work&at=2026-10-09T10:20", None),
    "work-alerts":     ("mode=work&at=2026-10-09T15:40&down=1&fin=warning&calmin=12", None),
    "work-quiet":      ("mode=work&at=2026-10-09T10:20&cal=0&wx=0", None),
    "transition":      ("mode=work&at=2026-10-09T17:00", ("to_ambient", 4.0)),
    "ambient-dusk":    ("mode=ambient&at=2026-10-09T18:15&elapsed=900", None),
    "ambient-night":   ("mode=ambient&at=2026-10-09T22:30&elapsed=19800", None),
    "ambient-down":    ("mode=ambient&at=2026-10-09T23:10&elapsed=22000&down=1", None),
    "wx-clear":        ("mode=ambient&at=2026-10-09T22:30&elapsed=19800&wx=clear", None),
    "wx-fog":          ("mode=ambient&at=2026-10-09T22:30&elapsed=19800&wx=fog", None),
    "wx-rain":         ("mode=ambient&at=2026-10-09T22:30&elapsed=19800&wx=rain", None),
    "wx-storm":        ("mode=ambient&at=2026-10-09T22:30&elapsed=19800&wx=storm", None),
    "wx-snow":         ("mode=ambient&at=2026-10-09T22:30&elapsed=19800&wx=snow", None),
    "wx-dusk-rain":    ("mode=ambient&at=2026-10-09T18:15&elapsed=900&wx=rain", None),
    # daytime: ambient on a Saturday (weekends are ambient all day) and the work face's day backdrop
    "day-morning":     ("mode=ambient&at=2026-10-10T09:05&elapsed=3600&wx=clear", None),
    "day-noon":        ("mode=ambient&at=2026-10-10T13:00&elapsed=3600&wx=clear", None),
    "day-golden":      ("mode=ambient&at=2026-10-10T17:40&elapsed=3600&wx=clear", None),
    "day-overcast":    ("mode=ambient&at=2026-10-10T13:00&elapsed=3600&wx=overcast", None),
    "day-rain":        ("mode=ambient&at=2026-10-10T13:00&elapsed=3600&wx=rain", None),
    "day-snow":        ("mode=ambient&at=2026-10-10T13:00&elapsed=3600&wx=snow", None),
    "day-fog":         ("mode=ambient&at=2026-10-10T08:30&elapsed=3600&wx=fog", None),
    "work-day":        ("mode=work&at=2026-10-09T12:30&wx=clear", None),
    "work-dusk":       ("mode=work&at=2026-10-09T16:55&wx=clear", None),
    "work-news-critical": ("mode=work&at=2026-10-09T10:20&news=critical", None),
    "work-news-long":  ("mode=work&at=2026-10-09T10:20&news=long", None),
    "work-no-news":    ("mode=work&at=2026-10-09T10:20&news=0", None),
    # info overlay (ask panels): mock panel data, held for 10 min so the shot lands mid-hold
    "overlay-forecast": ("mode=work&at=2026-10-09T10:20&show=forecast&showfor=600", None),
    "overlay-calendar": ("mode=work&at=2026-10-09T10:20&show=calendar&showfor=600", None),
    "overlay-finance": ("mode=work&at=2026-10-09T10:20&show=finance&showfor=600", None),
    "overlay-news":    ("mode=work&at=2026-10-09T10:20&show=news&showfor=600&news=critical", None),
    "overlay-pulse":   ("mode=work&at=2026-10-09T10:20&show=pulse&showfor=600", None),
    "overlay-warnings": ("mode=work&at=2026-10-09T10:20&show=warnings&showfor=600", None),
    "overlay-ambient": ("mode=ambient&at=2026-10-09T22:30&elapsed=19800&show=forecast&showfor=600", None),
}

def metrics(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    mx = int(a.max())
    chroma = a.max(axis=2) - a.min(axis=2)
    white = int(((a.min(axis=2) > 200) & (chroma < 40)).sum())
    lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    return mx, white, float(lum.mean())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--theme", required=True)
    ap.add_argument("--out", default=str(ROOT / "shots"))
    ap.add_argument("--w", type=int, default=1920)
    ap.add_argument("--h", type=int, default=1080)
    ap.add_argument("--only", default="")
    ap.add_argument("--extra", default="", help="extra query string appended to every state, e.g. wx=storm")
    ap.add_argument("--channel", default="", help="use an installed browser, e.g. msedge")
    a = ap.parse_args()
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    url0 = (ROOT / "index.html").as_uri()
    bad = False
    with sync_playwright() as p:
        b = p.chromium.launch(channel=a.channel or None, args=["--disable-gpu-vsync"])
        for name, (q, action) in STATES.items():
            if a.only and name not in a.only.split(","):
                continue
            pg = b.new_page(viewport={"width": a.w, "height": a.h}, timezone_id="America/Toronto")
            errs = []
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: errs.append(str(e)))
            qs = dict(parse_qsl(f"theme={a.theme}&{q}"))
            qs.update(parse_qsl(a.extra))  # --extra overrides the state's own params
            pg.goto(f"{url0}?{urlencode(qs)}")
            pg.wait_for_timeout(2500)
            if action and action[0] == "to_ambient":
                pg.evaluate("AW._debug.modeState.override='ambient'")
                pg.wait_for_timeout(int(action[1] * 1000))
            f = out / f"{a.theme}-{name}.png"
            pg.screenshot(path=str(f))
            fr = pg.evaluate("window.__AW_FRAME ? {m: __AW_FRAME.mode, b: +__AW_FRAME.blend.toFixed(2), d: +(__AW_FRAME.day || 0).toFixed(2), o: __AW_FRAME.overlay && `${__AW_FRAME.overlay.panel} ${__AW_FRAME.overlay.a.toFixed(2)}`} : null")
            limit = 25 + 20 * ((fr or {}).get("d") or 0)  # brighter budget by day (THEMES.md rule 2)
            mx, white, mean = metrics(f)
            flag = "" if (mx <= 225 and white == 0 and mean < limit) else f"  <-- CHECK (mean limit {limit:.0f})"
            if flag and qs.get("boost", "0") not in ("", "0"):
                # the projector boost deliberately lifts the image for a dim projector: the dark-room limits
                # describe the themes' own output, which the boost=0 shots check
                flag = f"  (boost {qs['boost']}: dark-room limits not applied)"
            if "CHECK" in flag: bad = True
            print(f"{name:18s} max={mx:3d} white={white:6d} mean={mean:5.1f} frame={fr}{flag}")
            for e in errs:
                if "themes/" in e and "ERR_FILE_NOT_FOUND" in e: continue
                print(f"   console: {e}"); bad = True
            pg.close()
        b.close()
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
