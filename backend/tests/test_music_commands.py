"""set_sound: validation, hub broadcast, POST /api/command, the module-level function, not replayed;
and the WebSocket hello carrying [display] sound / volume / sound_work."""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from ambient import commands
from ambient.commands import CommandError, CommandHub, validate_sound
from ambient.config import build_config
from ambient.server import Paths, create_app

JSON = {"content-type": "application/json"}


def drain(client) -> list:
    out = []
    while not client.queue.empty():
        m = client.queue.get_nowait()
        out.append(None if m is None else json.loads(m))
    return out


# ------------------------------------------------------------------------------ validation

def test_validate_sound():
    assert validate_sound(on=True) == {"on": True}
    assert validate_sound(volume=0) == {"volume": 0.0}
    assert validate_sound(on=False, volume=1) == {"on": False, "volume": 1.0}
    assert validate_sound(volume=0.33333) == {"volume": 0.333}
    for on, vol, match in ((None, None, "needs"), ("yes", None, "on must be"), (1, None, "on must be"),
                           (None, 1.5, "0 to 1"), (None, -0.1, "0 to 1"), (None, True, "number"),
                           (None, "0.5", "number"), (None, float("nan"), "number"),
                           (None, float("inf"), "number")):
        with pytest.raises(CommandError, match=match):
            validate_sound(on, vol)


def test_hub_broadcasts_set_sound_frame():
    hub = CommandHub(lambda name: None)
    a, b = hub.register(), hub.register()
    r = hub.set_sound(True, 0.4)
    assert r == {"ok": True, "name": "set_sound", "args": {"on": True, "volume": 0.4}, "clients": 2}
    for c in (a, b):
        assert drain(c) == [{"type": "command", "name": "set_sound", "args": {"on": True, "volume": 0.4}}]
    hub.command("set_sound", {"volume": 0.1, "ignored": 1})
    assert drain(a) == [{"type": "command", "name": "set_sound", "args": {"volume": 0.1}}]
    with pytest.raises(CommandError):
        hub.command("set_sound", {})
    assert drain(a) == []                              # an invalid command broadcasts nothing
    assert hub.replay() is None                        # set_sound is not replayed to new clients


async def test_module_level_set_sound():
    hub = CommandHub(lambda name: None)
    c = hub.register()
    commands.bind(hub)
    try:
        r = await commands.set_sound(on=False)
        assert r["args"] == {"on": False}
        assert drain(c)[0]["name"] == "set_sound"
    finally:
        commands.bind(None)


# ------------------------------------------------------------------------------ server

@pytest.fixture
def make_client(tmp_path, monkeypatch):
    monkeypatch.setattr("ambient.scheduler.RULES", {})
    fe = tmp_path / "frontend"
    fe.mkdir()
    (fe / "index.html").write_text("<!doctype html><title>wall</title>", encoding="utf-8")

    def make(display=None):
        doc = {"location": {"name": "Home", "lat": 45.9, "lon": -77.3, "timezone": "America/Toronto"}}
        if display is not None:
            doc["display"] = display
        cfg = build_config(doc, known_types={"push"})
        paths = Paths(config_dir=tmp_path, data_dir=tmp_path / "data", frontend_dir=fe, plugins_dir=tmp_path / "p")
        return TestClient(create_app(cfg=cfg, paths=paths, project=lambda pool, now, cfg: {}, debounce_s=0.02))
    return make


def test_api_command_set_sound(make_client):
    with make_client() as c:
        r = c.post("/api/command", json={"name": "set_sound", "args": {"on": True}})
        assert r.status_code == 200
        assert r.json() == {"ok": True, "name": "set_sound", "args": {"on": True}, "clients": 0}
        r = c.post("/api/command", json={"name": "set_sound", "args": {"volume": 0.25, "on": False}})
        assert r.status_code == 200 and r.json()["args"] == {"on": False, "volume": 0.25}


@pytest.mark.parametrize("body", [
    {"name": "set_sound"},
    {"name": "set_sound", "args": {}},
    {"name": "set_sound", "args": {"on": "true"}},
    {"name": "set_sound", "args": {"volume": 2}},
    {"name": "set_sound", "args": {"volume": "loud"}},
    {"name": "set_sound", "args": [True]},
])
def test_api_command_set_sound_422(make_client, body):
    with make_client() as c:
        r = c.post("/api/command", json=body)
        assert r.status_code == 422, r.text


def test_set_sound_reaches_websocket_and_hello_has_sound_settings(make_client):
    with make_client(display={"sound": True, "volume": 0.6, "sound_work": 0.1}) as c:
        with c.websocket_connect("/ws") as ws:
            hello = ws.receive_json()
            assert hello["type"] == "hello"
            assert hello["settings"]["display"] == {"theme": "cyberpunk", "hour24": True, "sound": True,
                                                    "volume": 0.6, "sound_work": 0.1, "boost": 0,
                                                    "cat": False, "cat_coat": "tabby"}
            assert ws.receive_json()["type"] == "wall"
            r = c.post("/api/command", json={"name": "set_sound", "args": {"on": False, "volume": 0.2}})
            assert r.json()["clients"] == 1
            for _ in range(20):
                m = ws.receive_json()
                if m["type"] == "command":
                    break
            assert m == {"type": "command", "name": "set_sound", "args": {"on": False, "volume": 0.2}}


def test_hello_defaults(make_client):
    with make_client() as c:
        with c.websocket_connect("/ws") as ws:
            d = ws.receive_json()["settings"]["display"]
            assert d["sound"] is False and d["volume"] == 0.4 and d["sound_work"] == 0
