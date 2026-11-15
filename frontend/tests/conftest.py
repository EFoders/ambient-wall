"""Shared fixtures for the frontend suite: one headless Edge for the whole session, page factories that record
page errors, pixel metrics, and a fake backend (aiohttp, own process) for the live/command tests.

Run from frontend/:
    uv run --with pytest --with pytest-timeout --with playwright --with pillow --with numpy pytest tests -q
"""
import atexit
import importlib.util
import io
import os
import json
import pathlib
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

import numpy as np
import pytest
from PIL import Image
from playwright.sync_api import sync_playwright

FRONT = pathlib.Path(__file__).resolve().parent.parent
INDEX = FRONT / "index.html"
FILE_URL = INDEX.as_uri()
TZ = "America/Toronto"
BROWSER_ARGS = ["--disable-gpu-vsync"]
# audio tests: one Edge that lets an AudioContext start with no gesture (a kiosk), one that strictly needs one
AUTOPLAY_ARGS = BROWSER_ARGS + ["--autoplay-policy=no-user-gesture-required"]
GESTURE_ARGS = BROWSER_ARGS + ["--autoplay-policy=document-user-activation-required"]
PANELS = ["forecast", "calendar", "pulse", "finance", "news", "warnings"]

# A theme that paints nothing: pixels in the panel box are then the overlay's alone.
VOID_THEME = """() => {
  if (!AW._debug.themes.find((t) => t.id === "void"))
    AW.registerTheme({ id: "void", name: "Void", render(ctx, f) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, f.width, f.height); } });
  AW._debug.setTheme("void", true);
}"""


# ---------------------------------------------------------------- browser
@pytest.fixture(scope="session")
def pw():
    """One Playwright for the session (sync contexts cannot nest); every browser below launches from it."""
    with sync_playwright() as p:
        yield p


@pytest.fixture(scope="session")
def browser(pw):
    b = pw.chromium.launch(channel="msedge", args=BROWSER_ARGS)
    yield b
    b.close()


def _attach_errors(pg):
    pg.errors = []

    def on_console(m):
        # failed loads are tracked by URL below (so the browser's own favicon probe can be ignored)
        if m.type == "error" and not m.text.startswith("Failed to load resource"):
            pg.errors.append(f"console: {m.text}")

    def on_response(r):
        if r.status >= 400 and not r.url.endswith("/favicon.ico"):
            pg.errors.append(f"http {r.status}: {r.url}")

    pg.on("console", on_console)
    pg.on("response", on_response)
    pg.on("pageerror", lambda e: pg.errors.append(f"pageerror: {e}"))
    return pg


def _page_factory(browser):
    pages = []

    def make(query="", base=FILE_URL, w=1280, h=720, wait=600):
        pg = _attach_errors(browser.new_page(viewport={"width": w, "height": h}, timezone_id=TZ))
        pages.append(pg)
        sep = "?" if query and "?" not in base else ("&" if query else "")
        pg.goto(base + sep + query)
        pg.wait_for_function("window.AW && AW._debug && window.__AW_FRAME")
        if wait:
            pg.wait_for_timeout(wait)
        return pg

    return make, pages


@pytest.fixture
def open_page(browser):
    """open_page(query="", base=FILE_URL, w=1280, h=720) -> Page with .errors (console errors + page errors)."""
    make, pages = _page_factory(browser)
    yield make
    for pg in pages:
        pg.close()


@pytest.fixture(scope="session")
def audio_browser(pw):
    b = pw.chromium.launch(channel="msedge", args=AUTOPLAY_ARGS)
    yield b
    b.close()


@pytest.fixture(scope="session")
def gesture_browser(pw):
    b = pw.chromium.launch(channel="msedge", args=GESTURE_ARGS)
    yield b
    b.close()


@pytest.fixture
def audio_page(audio_browser):
    """Like open_page, in an Edge whose AudioContext may start without a gesture (kiosk flag)."""
    make, pages = _page_factory(audio_browser)
    yield make
    for pg in pages:
        pg.close()


@pytest.fixture
def gesture_page(gesture_browser):
    """Like open_page, in an Edge where audio needs a user gesture (the normal browser default)."""
    make, pages = _page_factory(gesture_browser)
    yield make
    for pg in pages:
        pg.close()


def poll(pg, expr, timeout=8.0, interval=0.1):
    """Evaluate `expr` until truthy (returns it) or timeout (returns the last value)."""
    end = time.time() + timeout
    v = None
    while time.time() < end:
        v = pg.evaluate(expr)
        if v:
            return v
        time.sleep(interval)
    return pg.evaluate(expr)


def real_errors(pg):
    return [e for e in pg.errors if not ("themes/" in e and "ERR_FILE_NOT_FOUND" in e)]


# ---------------------------------------------------------------- pixels
def shot(pg, clip=None):
    """Screenshot as an int16 HxWx3 array (CSS pixels; dpr is 1 in these pages)."""
    png = pg.screenshot(clip=clip) if clip else pg.screenshot()
    return np.asarray(Image.open(io.BytesIO(png)).convert("RGB")).astype(np.int16)


def metrics(a):
    """max channel, near-white pixel count, mean luminance: the shoot.py brightness rules."""
    mx = int(a.max())
    chroma = a.max(axis=2) - a.min(axis=2)
    white = int(((a.min(axis=2) > 200) & (chroma < 40)).sum())
    lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    return mx, white, float(lum.mean())


def energy(a, thresh=60):
    """How much lit content: pixels whose brightest channel is above `thresh`."""
    return int((a.max(axis=2) > thresh).sum())


def box_clip(pg):
    b = pg.evaluate("AW.overlay.info.box")
    return {"x": b["x"], "y": b["y"], "width": b["w"], "height": b["h"]}


# ---------------------------------------------------------------- themes
def index_theme_ids():
    html = INDEX.read_text(encoding="utf-8")
    return re.findall(r'<script src="themes/([\w-]+)\.js"></script>', html)


_THEMES = None


def discover_themes():
    """Theme ids as registered at runtime (AW._debug.themes), plus any theme script index.html loads that
    failed to register (so a broken theme still gets a failing smoke row instead of vanishing)."""
    global _THEMES
    if _THEMES is None:
        ids = []
        try:
            with sync_playwright() as p:
                b = p.chromium.launch(channel="msedge", args=BROWSER_ARGS)
                pg = b.new_page()
                pg.goto(FILE_URL + "?mock=1")
                pg.wait_for_function("window.AW && AW._debug", timeout=15000)
                ids = pg.evaluate("AW._debug.themes.map((t) => t.id)")
                b.close()
        except Exception as e:  # discovery must not kill collection; the static list still runs
            print(f"theme discovery failed: {e}", file=sys.stderr)
        for t in index_theme_ids():
            if t not in ids:
                ids.append(t)
        _THEMES = ids
    return _THEMES


# ---------------------------------------------------------------- fake backend
def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Fake:
    def __init__(self, port):
        self.port = port
        self.base = f"http://127.0.0.1:{port}"

    def ctl(self, **body):
        req = urllib.request.Request(self.base + "/ctl", data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json"})
        return json.loads(urllib.request.urlopen(req, timeout=5).read())

    def command(self, name, **args):
        msg = {"type": "command", "name": name}
        if args:
            msg["args"] = args
        return self.ctl(send=msg)


@pytest.fixture(scope="session")
def fake_backend():
    """The fake backend in its own process on a free port. Uses this interpreter if it has aiohttp, else
    `uv run --with aiohttp` (so the one-line suite command needs no extra --with)."""
    port = _free_port()
    script = str(pathlib.Path(__file__).with_name("fake_backend.py"))
    if importlib.util.find_spec("aiohttp"):
        cmd = [sys.executable, script, str(FRONT), str(port)]
    else:
        uv = shutil.which("uv")
        if not uv:
            pytest.skip("fake backend needs aiohttp (or uv to fetch it)")
        cmd = [uv, "run", "--no-project", "--with", "aiohttp", "python", script, str(FRONT), str(port)]
    # stderr to a file, not a pipe nobody drains: aiohttp logs a traceback for every download a closing page aborts
    # (the sound tests fetch many MP3s), and a full pipe would block the server mid-suite
    log = tempfile.TemporaryFile()
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=log)
    # `uv run` starts the real python as a child: ending uv alone orphans it on Windows (54 of them piled up once),
    # so always end the whole tree, also when pytest is interrupted or exits early
    atexit.register(_kill_tree, proc)
    fake = Fake(port)
    deadline = time.time() + 90
    while True:
        try:
            urllib.request.urlopen(fake.base + "/api/health", timeout=1)
            break
        except Exception:
            if proc.poll() is not None:
                log.seek(0)
                raise RuntimeError("fake backend exited: " + log.read().decode(errors="replace")[-2000:])
            if time.time() > deadline:
                _kill_tree(proc)
                raise RuntimeError("fake backend did not start")
            time.sleep(0.2)
    yield fake
    _kill_tree(proc)
    log.close()


def _kill_tree(proc):
    """End a process and everything it started (uv -> python). Idempotent."""
    if proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
    else:
        proc.terminate()
    try:
        proc.wait(5)
    except subprocess.TimeoutExpired:
        proc.kill()


@pytest.fixture
def fake(fake_backend):
    fake_backend.ctl(reset=True)
    yield fake_backend
    fake_backend.ctl(reset=True)


def pytest_terminal_summary(terminalreporter):
    """Per-theme smoke table (test_theme_smoke.RESULTS), so a run doubles as a brightness/perf report."""
    mod = sys.modules.get("test_theme_smoke")
    text = mod.summary_table() if mod else ""
    for line in text.splitlines():
        terminalreporter.write_line(line)
