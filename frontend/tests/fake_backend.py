"""Fake Ambient Wall backend for the frontend tests: serves frontend/ at / and speaks the docs/ARCHITECTURE.md
protocol (WebSocket /ws hello + wall + command, GET /api/ask/<panel>), steered over POST /ctl.

usage: python fake_backend.py <frontend_dir> <port>      (needs aiohttp)

POST /ctl bodies (any combination, applied in this order):
  {"reset": true}                 default projection, no ask overrides, counters zeroed
  {"projection": {...}}           replace the projection (sent now, on connect, and every second)
  {"theme": "nature"}             display.theme in hello
  {"display": {"sound": true, "volume": 0.3, "sound_work": 0.2}}   merged into hello's display (next connect)
  {"ask": {"forecast": {...}}}    GET /api/ask/<panel> returns this (null allowed = 200 null)
  {"ask_fail": true|false}        GET /api/ask/* answers 500
  {"avail": {"pulse": false}}     availability reported by GET /api/ask (default: all available)
  {"send": {...}}                 broadcast one JSON message (e.g. a command) to every socket
  {"kick": true}                  close every socket (clients reconnect)
  {"setup": true|false}           first run: hello carries "setup": {"needed": true}; GET /api/setup says needed
  {"setup_fail": "errors"|"write"|null}   POST /api/setup answers 422 with field errors / 500 write_error
Reply: {"ok": true, "clients": n, "connects": n, "asks": {panel: hits}, "setup_posts": [{path, body}, ...]}

Setup wizard endpoints (as ambient/setup.py; canned answers, every POST recorded in setup_posts):
  GET /api/setup, POST /api/setup/geocode | ec-site | test-feed | preview, POST /api/setup (a 200 ends first run)
"""
import asyncio
import json
import pathlib
import sys
from datetime import datetime, timedelta

from aiohttp import web

FRONT = pathlib.Path(sys.argv[1]).resolve()
PORT = int(sys.argv[2])
PANELS = ["forecast", "calendar", "pulse", "finance", "news", "warnings"]


def iso(dt):
    return dt.isoformat(timespec="seconds")


def iso_ms(dt):
    return dt.isoformat(timespec="milliseconds")


def now_playing(now, progress_ms=81000, playing=True, anchor_ago_s=3.0):
    """The backend's nowPlaying shape: updatedAt is the progress anchor (local ISO with milliseconds), not now."""
    return {"title": "Teardrop", "artist": "Massive Attack", "album": "Mezzanine", "isPlaying": playing,
            "progressMs": progress_ms, "durationMs": 330000, "updatedAt": iso_ms(now - timedelta(seconds=anchor_ago_s)),
            "source": "spotify", "art": None}


def default_projection():
    now = datetime.now().astimezone()
    return {
        "calendar": {"next": {"title": "Ops sync", "start": iso(now + timedelta(minutes=47))}},
        "heartbeat": [{"host": "homelab", "up": True, "downSince": None},
                      {"host": "main-pc", "up": True, "downSince": None}],
        "finances": {"income": 6420, "spent": 3985, "net": 2435, "balance": 20675,
                     "lastUpdated": iso(now - timedelta(hours=26)), "mood": "calm"},
        "weather": {"tempC": 6, "actionable": "Rain in 20 min", "condition": "cloudy", "intensity": 0.8, "windKph": 12},
        "nowPlaying": now_playing(now),
        "news": {"headline": "Ottawa council approves new transit line", "source": "CBC Ottawa",
                 "published": iso(now - timedelta(minutes=35)), "critical": False, "rank": 1, "count": 3},
        "stale": [],
    }


st = {}
clients = set()


def reset():
    st.update(projection=default_projection(), theme="cyberpunk", ask={}, ask_fail=False, connects=0,
              asks={p: 0 for p in PANELS}, avail={}, display={"sound": False, "volume": 0.5, "sound_work": 0},
              setup=False, setup_fail=None, setup_posts=[])


reset()


def hello():
    return {"type": "hello", "version": 1, "settings": {
        "location": {"name": "Ottawa", "lat": 45.4215, "lon": -75.6972, "timezone": "America/Toronto"},
        "mode": {"work_start": "07:00", "work_end": "17:00", "work_days": [1, 2, 3, 4, 5], "transition_seconds": 8},
        "display": {"theme": st["theme"], "hour24": True, **st["display"]},
    }}


def with_setup(msg):
    """hello + "setup": {"needed": true} in first-run mode (ctl {"setup": true}), as ambient/server.py sends it."""
    if st["setup"]:
        msg["setup"] = {"needed": True}
    return msg


def wall():
    return {"type": "wall", "ts": iso_ms(datetime.now().astimezone()), "signals": st["projection"]}


async def broadcast(msg):
    data = json.dumps(msg)
    for ws in list(clients):
        try:
            await ws.send_str(data)
        except Exception:
            clients.discard(ws)


async def ws_handler(req):
    ws = web.WebSocketResponse(heartbeat=None)
    await ws.prepare(req)
    st["connects"] += 1
    clients.add(ws)
    try:
        await ws.send_str(json.dumps(with_setup(hello())))
        await ws.send_str(json.dumps(wall()))
        async for _ in ws:
            pass
    finally:
        clients.discard(ws)
    return ws


async def ask(req):
    panel = req.match_info["panel"]
    if panel not in PANELS:
        return web.json_response({"detail": "unknown panel"}, status=404)
    st["asks"][panel] += 1
    if st["ask_fail"]:
        return web.json_response({"detail": "boom"}, status=500)
    if panel in st["ask"]:
        return web.json_response(st["ask"][panel])
    return web.json_response(default_panel(panel))


def default_panel(panel):
    """Shapes as the real backend builds them (docs/ARCHITECTURE.md "Ask panels" + the lead's notes):
    forecast dates are plain YYYY-MM-DD and hiC can be null ("Tonight"); finance categories are sorted by
    amount across both kinds and carry lastUpdated."""
    now = datetime.now().astimezone()
    base = {"panel": panel, "title": f"Fake {panel}", "ts": iso(now)}
    if panel == "forecast":
        days = [{"date": (now + timedelta(days=i)).date().isoformat(), "label": "Tonight" if i == 0 else
                 (now + timedelta(days=i)).strftime("%a"), "hiC": None if i == 0 else 8 + i, "loC": 1 - i,
                 "condition": c, "pop": p} for i, (c, p) in enumerate(
                     [("rain", 60), ("cloudy", 30), ("clear", 10), ("rain", 70), ("cloudy", 20), ("snow", 60), ("clear", 0)])]
        return {**base, "days": days}
    if panel == "calendar":
        return {**base, "events": [{"title": "Fake standup", "start": iso(now + timedelta(hours=1)),
                                    "end": iso(now + timedelta(hours=1, minutes=15)), "allDay": False}]}
    if panel == "pulse":
        return {**base, "repos": [{"name": "you/ambient-wall", "lastCommit": iso(now - timedelta(hours=1)),
                                   "message": "fake commit", "pushedAt": iso(now - timedelta(hours=1)), "status": "alive"}]}
    if panel == "finance":
        return {**base, "income": 6420, "spent": 3985, "net": 2435, "balance": 20675, "mood": "calm", "month": "2026-10",
                "lastUpdated": iso(now - timedelta(hours=26)),
                "categories": [{"name": "Salary", "amount": 6100, "kind": "income"},
                               {"name": "Rent", "amount": 1850, "kind": "expense"},
                               {"name": "Groceries", "amount": 612, "kind": "expense"}]}
    if panel == "news":
        return {**base, "items": [{"headline": "Fake headline", "source": "Fake News Network",
                                   "published": iso(now - timedelta(minutes=12)), "critical": False}]}
    return {**base, "items": []}  # warnings: [] is a real answer ("No active warnings")


async def ask_list(req):
    return web.json_response([{"panel": p, "available": st["avail"].get(p, True)} for p in PANELS])


async def ctl(req):
    body = await req.json()
    if body.get("reset"):
        reset()
    if "projection" in body:
        st["projection"] = body["projection"]
        await broadcast(wall())
    if "theme" in body:
        st["theme"] = body["theme"]
    if "display" in body:
        st["display"].update(body["display"])
    if "ask" in body:
        st["ask"].update(body["ask"])
    if "avail" in body:
        st["avail"].update(body["avail"])
    if "ask_fail" in body:
        st["ask_fail"] = bool(body["ask_fail"])
    if "send" in body:
        await broadcast(body["send"])
    if "setup" in body:
        st["setup"] = bool(body["setup"])
    if "setup_fail" in body:
        st["setup_fail"] = body["setup_fail"]
    if body.get("kick"):
        for ws in list(clients):
            await ws.close()
    return web.json_response({"ok": True, "clients": len(clients), "connects": st["connects"], "asks": st["asks"],
                              "setup_posts": st["setup_posts"]})


# ---------------------------------------------------------------- setup wizard (ambient/setup.py, canned)
FAKE_TOML = '# fake config.toml\n[location]\nname = "Pembroke"\n'


async def setup_state(req):
    themes = sorted(p.stem for p in (FRONT / "themes").glob("*.js"))
    return web.json_response({"needed": st["setup"], "enabled": True, "running": "config.example.toml",
                              "config_dir": "/config", "writable": True, "themes": themes,
                              "coats": ["tabby", "ginger", "black", "grey", "tuxedo", "calico", "siamese", "white"],
                              "secrets_present": []})


async def setup_post(req):
    """The real guard's JSON rule, the first-run 409, then a canned answer per endpoint."""
    if req.content_type != "application/json":
        return web.json_response({"detail": "Content-Type must be application/json"}, status=415)
    if not st["setup"]:
        return web.json_response({"detail": "already set up: edit config/config.toml (and secrets.toml) instead"},
                                 status=409)
    body = await req.json()
    what = req.match_info.get("what", "")
    st["setup_posts"].append({"path": what, "body": body})
    if what == "geocode":
        return web.json_response({"results": [
            {"name": "Pembroke", "region": "Renfrew County", "admin1": "Ontario", "country": "Canada",
             "country_code": "CA", "lat": 45.8168, "lon": -77.1162, "timezone": "America/Toronto"},
            {"name": "Pembroke", "region": None, "admin1": "Wales", "country": "United Kingdom",
             "country_code": "GB", "lat": 51.6764, "lon": -4.9158, "timezone": "Europe/London"}]})
    if what == "ec-site":
        return web.json_response({"sites": [
            {"code": "s0000730", "name": "Pembroke", "province": "ON", "lat": 45.82, "lon": -77.11, "km": 0.4},
            {"code": "s0000729", "name": "Petawawa", "province": "ON", "lat": 45.89, "lon": -77.27, "km": 14.2}]})
    if what == "test-feed":
        return web.json_response({"ok": True, "title": "Fake feed", "headline": "Fake headline for " + body.get("url", ""),
                                  "count": 3})
    if what == "preview":
        return web.json_response({"ok": True, "errors": [], "config_toml": FAKE_TOML, "secrets": []})
    if st["setup_fail"] == "errors":
        return web.json_response({"ok": False, "errors": [
            {"field": "hosts.0.address", "message": "an IP address (192.168.1.10) or a hostname (nas.local)"}]},
            status=422)
    if st["setup_fail"] == "write":
        return web.json_response({"ok": False, "write_error": "could not write to /config: Permission denied",
                                  "hint": "sudo chown -R 10001 config", "config_toml": FAKE_TOML,
                                  "secrets_toml": None, "config_dir": "/config"}, status=500)
    st["setup"] = False
    return web.json_response({"ok": True, "applied": True, "written": ["config.toml"], "note": None,
                              "sources": ["weather", "ec"]})


async def ticker(app):
    async def run():
        while True:
            await asyncio.sleep(1)
            await broadcast(wall())
    task = asyncio.create_task(run())
    yield
    task.cancel()


async def index(req):
    return web.FileResponse(FRONT / "index.html")


async def health(req):
    return web.json_response({"ok": True})


app = web.Application()
app.cleanup_ctx.append(ticker)
app.router.add_get("/ws", ws_handler)
app.router.add_post("/ctl", ctl)
app.router.add_get("/api/health", health)
app.router.add_get("/api/ask", ask_list)
app.router.add_get("/api/ask/{panel}", ask)
app.router.add_get("/api/setup", setup_state)
app.router.add_post("/api/setup", setup_post)
app.router.add_post("/api/setup/{what}", setup_post)
app.router.add_get("/", index)
app.router.add_static("/", FRONT)

if __name__ == "__main__":
    web.run_app(app, host="127.0.0.1", port=PORT, print=lambda *a: print(*a, flush=True))
