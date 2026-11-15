"""The command channel over the real app: POST /api/dismiss, POST /api/command, POST /api/show ->
WebSocket `command` frames, replay to late clients, dead clients, and the voice-path functions."""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from ambient import commands
from ambient.config import build_config
from ambient.server import Paths, create_app
from ambient.signal import Signal

TZ = ZoneInfo("America/Toronto")
JSON = {"content-type": "application/json"}


class Clock:
    def __init__(self, t=1000.0):
        self.t = t

    def __call__(self):
        return self.t


def stub_project(pool, now, cfg):
    return {"ok": True}


@pytest.fixture
def make_client(tmp_path, monkeypatch):
    monkeypatch.setattr("ambient.scheduler.RULES", {})
    fe = tmp_path / "frontend"
    fe.mkdir()
    (fe / "index.html").write_text("<!doctype html><title>wall</title>", encoding="utf-8")

    def make(extra=None, themes=None, **kw):
        if themes:
            (fe / "themes").mkdir(exist_ok=True)
            for t in themes:
                (fe / "themes" / f"{t}.js").write_text("export default {};", encoding="utf-8")
        doc = {"location": {"name": "Home", "lat": 45.9, "lon": -77.3, "timezone": "America/Toronto"},
               "source": [{"name": "phone", "type": "push"}], **(extra or {})}
        cfg = build_config(doc, known_types={"push"})
        paths = Paths(config_dir=tmp_path, data_dir=tmp_path / "data", frontend_dir=fe,
                      plugins_dir=tmp_path / "plugins")
        return TestClient(create_app(cfg=cfg, paths=paths, project=stub_project, debounce_s=0.02, **kw))
    return make


def publish_forecast(c):
    today = datetime.now(TZ).date()
    days = [{"date": (today + timedelta(days=i)).isoformat(), "condition": "snow", "t_max": -i, "t_min": -5 - i}
            for i in range(3)]
    s = Signal(source="weather", key="forecast.daily", value=days, visibility="ask", ttl_s=1800)
    c.portal.call(c.app.state.pool.publish, [s])


def connect(c):
    """Open /ws and consume hello + the first wall frame."""
    ws = c.websocket_connect("/ws")
    ws.__enter__()
    assert ws.receive_json()["type"] == "hello"
    assert ws.receive_json()["type"] == "wall"
    return ws


def next_command(ws, tries=50):
    for _ in range(tries):
        m = ws.receive_json()
        if m["type"] == "command":
            return m
    raise AssertionError("no command frame")


def close(*wss):
    for ws in wss:
        ws.__exit__(None, None, None)


# ------------------------------------------------------------------------------ REST: dismiss / command

def test_dismiss_endpoint(make_client):
    with make_client() as c:
        r = c.post("/api/dismiss", headers=JSON)
        assert r.status_code == 200 and r.json() == {"ok": True, "name": "dismiss", "clients": 0}
        assert c.post("/api/dismiss", json={}).status_code == 200
        assert c.post("/api/dismiss").status_code == 415
        assert c.post("/api/dismiss", content=b"{", headers=JSON).status_code == 400


def test_command_endpoint_valid(make_client):
    with make_client() as c:
        r = c.post("/api/command", json={"name": "set_theme", "args": {"theme": "Nature"}})
        assert r.status_code == 200
        assert r.json() == {"ok": True, "name": "set_theme", "args": {"theme": "nature"}, "clients": 0}
        for mode in ("work", "ambient", "auto", "WORK"):
            r = c.post("/api/command", json={"name": "set_mode", "args": {"mode": mode}})
            assert r.status_code == 200 and r.json()["args"] == {"mode": mode.lower()}


@pytest.mark.parametrize("body", [
    {"name": "set_theme", "args": {"theme": "../../etc"}},
    {"name": "set_theme", "args": {"theme": ""}},
    {"name": "set_theme", "args": {"theme": 7}},
    {"name": "set_theme"},
    {"name": "set_theme", "args": "nature"},
    {"name": "set_mode", "args": {"mode": "party"}},
    {"name": "set_mode", "args": {}},
    {"name": "show", "args": {"panel": "forecast"}},
    {"name": "reboot"},
    {"args": {"mode": "work"}},
    [{"name": "set_mode", "args": {"mode": "work"}}],
    "set_mode",
])
def test_command_endpoint_422(make_client, body):
    with make_client() as c:
        assert c.post("/api/command", content=json.dumps(body), headers=JSON).status_code == 422


def test_command_endpoint_body_rules(make_client):
    with make_client() as c:
        assert c.post("/api/command", headers=JSON).status_code == 422                      # empty body
        assert c.post("/api/command", content=b"{x", headers=JSON).status_code == 400
        body = b'{"name":"set_mode","args":{"mode":"work"}}'
        assert c.post("/api/command", content=body, headers={"content-type": "text/plain"}).status_code == 415
        assert c.post("/api/command", content=body,
                      headers={"content-type": "application/json; charset=utf-8"}).status_code == 200


def test_set_theme_checked_against_shipped_themes(make_client):
    with make_client(themes=["nature", "cyberpunk"]) as c:
        assert c.post("/api/command", json={"name": "set_theme", "args": {"theme": "nature"}}).status_code == 200
        r = c.post("/api/command", json={"name": "set_theme", "args": {"theme": "vapor"}})
        assert r.status_code == 422 and "unknown theme" in r.json()["detail"]


def test_all_posts_require_token_when_set(make_client, monkeypatch):
    monkeypatch.setenv("CMD_TEST_TOKEN", "tok-abcdef")
    good = {"Authorization": "Bearer tok-abcdef"}
    calls = [("/api/dismiss", {}), ("/api/command", {"name": "set_mode", "args": {"mode": "work"}}),
             ("/api/show/forecast", {}), ("/api/publish/phone", {"key": "a", "value": 1})]
    with make_client({"server": {"push_token": "${CMD_TEST_TOKEN}"}}) as c:
        for path, body in calls:
            assert c.post(path, json=body).status_code == 401, path
            assert c.post(path, json=body, headers={"Authorization": "Bearer wrong"}).status_code == 401, path
            assert c.post(path, json=body, headers=good).status_code == 200, path
        # auth comes before the content-type check (no probing without the token)
        assert c.post("/api/dismiss", content=b"x", headers={"content-type": "text/plain"}).status_code == 401
        assert c.post("/api/dismiss", content=b"x", headers={"content-type": "text/plain", **good}).status_code == 415


def test_all_posts_refused_when_token_unresolved(make_client):
    with make_client({"server": {"push_token": "${CMD_TEST_TOKEN_UNSET}"}}) as c:
        for path in ("/api/dismiss", "/api/command", "/api/show/forecast", "/api/publish/phone"):
            assert c.post(path, json={}).status_code == 503, path
        assert c.get("/api/ask").status_code == 200


# ------------------------------------------------------------------------------ WebSocket

def test_two_clients_receive_show_then_dismiss(make_client):
    with make_client() as c:
        publish_forecast(c)
        a, b = connect(c), connect(c)
        try:
            r = c.post("/api/show/forecast", json={"duration": 15})
            assert r.json() == {"shown": True, "panel": "forecast", "duration": 15, "clients": 2}
            want_data = c.get("/api/ask/forecast").json()
            for ws in (a, b):
                m = next_command(ws)
                assert m["name"] == "show"
                assert m["args"]["panel"] == "forecast" and m["args"]["duration"] == 15
                assert m["args"]["data"]["days"] == want_data["days"]
                assert set(m) == {"type", "name", "args"}
            assert c.post("/api/dismiss", headers=JSON).json()["clients"] == 2
            for ws in (a, b):
                assert next_command(ws) == {"type": "command", "name": "dismiss", "args": {}}
        finally:
            close(a, b)


def test_set_theme_and_set_mode_arrive_validated(make_client):
    with make_client() as c:
        ws = connect(c)
        try:
            assert c.post("/api/command", json={"name": "set_theme", "args": {"theme": "no good"}}).status_code == 422
            assert c.post("/api/command", json={"name": "set_theme", "args": {"theme": " Nature "}}).status_code == 200
            assert next_command(ws) == {"type": "command", "name": "set_theme", "args": {"theme": "nature"}}
            assert c.post("/api/command", json={"name": "set_mode", "args": {"mode": "sleep"}}).status_code == 422
            assert c.post("/api/command", json={"name": "set_mode", "args": {"mode": "Ambient"}}).status_code == 200
            assert next_command(ws) == {"type": "command", "name": "set_mode", "args": {"mode": "ambient"}}
        finally:
            close(ws)


def test_no_data_show_broadcasts_nothing(make_client):
    with make_client() as c:
        ws = connect(c)
        try:
            assert c.post("/api/show/pulse", json={}).json()["shown"] is False
            c.post("/api/command", json={"name": "set_mode", "args": {"mode": "work"}})
            assert next_command(ws)["name"] == "set_mode"                       # the show never went out
        finally:
            close(ws)


def test_late_client_gets_replay_with_remaining_duration(make_client):
    with make_client() as c:
        clock = Clock()
        c.app.state.commands.clock = clock
        publish_forecast(c)
        c.post("/api/show/forecast", json={"duration": 30})
        clock.t += 12
        ws = connect(c)                                                        # e.g. the wall reloaded
        try:
            m = ws.receive_json()                                              # straight after hello + wall
            assert m["type"] == "command" and m["name"] == "show"
            assert m["args"]["panel"] == "forecast" and m["args"]["duration"] == 18
            assert m["args"]["data"]["days"]
        finally:
            close(ws)


def test_client_after_expiry_or_dismiss_gets_no_replay(make_client):
    with make_client() as c:
        clock = Clock()
        c.app.state.commands.clock = clock
        publish_forecast(c)
        c.post("/api/show/forecast", json={"duration": 10})
        clock.t += 10.5
        ws = connect(c)
        try:
            c.post("/api/command", json={"name": "set_mode", "args": {"mode": "auto"}})
            assert next_command(ws)["name"] == "set_mode"                       # no stale show first
        finally:
            close(ws)
        c.post("/api/show/forecast", json={"duration": 60})
        c.post("/api/dismiss", headers=JSON)
        ws = connect(c)
        try:
            c.post("/api/command", json={"name": "set_mode", "args": {"mode": "work"}})
            assert next_command(ws)["args"] == {"mode": "work"}
        finally:
            close(ws)


def test_disconnected_client_does_not_break_broadcast(make_client):
    with make_client() as c:
        publish_forecast(c)
        gone, alive = connect(c), connect(c)
        close(gone)
        try:
            r = c.post("/api/show/forecast", json={})
            assert r.status_code == 200 and r.json()["shown"] is True
            assert next_command(alive)["name"] == "show"
            for _ in range(3):                                                 # and it keeps working
                assert c.post("/api/dismiss", headers=JSON).status_code == 200
                assert next_command(alive)["name"] == "dismiss"
        finally:
            close(alive)
        assert c.post("/api/dismiss", headers=JSON).status_code == 200


def test_stuck_client_is_cut_off_and_others_still_receive(make_client):
    with make_client() as c:
        hub = c.app.state.commands
        stuck = c.portal.call(_register_tiny, hub)                             # a client that never drains
        ws = connect(c)
        try:
            for _ in range(3):
                assert c.post("/api/dismiss", headers=JSON).status_code == 200
            assert stuck.closed and stuck not in hub.clients
            for _ in range(3):
                assert next_command(ws)["name"] == "dismiss"
        finally:
            close(ws)


async def _register_tiny(hub):
    return hub.register(maxsize=1)


def test_client_count_tracks_connections(make_client):
    with make_client() as c:
        a = connect(c)
        b = connect(c)
        assert c.post("/api/dismiss", headers=JSON).json()["clients"] == 2
        close(a)
        for _ in range(100):
            if len(c.app.state.commands.clients) == 1:
                break
            import time
            time.sleep(0.01)
        assert c.post("/api/dismiss", headers=JSON).json()["clients"] == 1
        close(b)


# ------------------------------------------------------------------------------ voice path

def test_module_functions_bound_to_running_server(make_client):
    with make_client() as c:
        assert commands.hub() is c.app.state.commands
        publish_forecast(c)
        ws = connect(c)
        try:
            res = c.portal.call(commands.show, "forecast", 7)
            assert res["shown"] is True and res["duration"] == 7 and res["clients"] == 1
            m = next_command(ws)
            assert m["name"] == "show" and m["args"]["duration"] == 7 and m["args"]["data"]["days"]
            c.portal.call(commands.clear_override)
            assert next_command(ws)["args"] == {"mode": "auto"}
        finally:
            close(ws)
    with pytest.raises(RuntimeError):
        commands.hub()                                                         # unbound at shutdown
