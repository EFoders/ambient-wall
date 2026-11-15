"""set_cat: validation, hub broadcast, POST /api/command, the module-level function, not replayed;
[display] cat / cat_coat validation and the hello."""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from ambient import commands
from ambient.commands import CommandError, CommandHub, validate_cat
from ambient.config import CAT_COATS, ConfigError, build_config, load_config
from ambient.server import Paths, create_app


def drain(client) -> list:
    out = []
    while not client.queue.empty():
        m = client.queue.get_nowait()
        out.append(None if m is None else json.loads(m))
    return out


def test_validate_cat():
    assert validate_cat(on=True) == {"on": True}
    assert validate_cat(coat="Ginger ") == {"coat": "ginger"}
    assert validate_cat(on=False, coat="tuxedo") == {"on": False, "coat": "tuxedo"}
    for on, coat, match in ((None, None, "needs"), ("yes", None, "on must be"), (1, None, "on must be"),
                            (None, "dog", "coat must be"), (None, 3, "coat must be"), (None, "", "coat must be")):
        with pytest.raises(CommandError, match=match):
            validate_cat(on, coat)


def test_hub_broadcasts_set_cat_and_does_not_replay():
    hub = CommandHub(lambda name: None)
    a, b = hub.register(), hub.register()
    r = hub.set_cat(True, "calico")
    assert r == {"ok": True, "name": "set_cat", "args": {"on": True, "coat": "calico"}, "clients": 2}
    for c in (a, b):
        assert drain(c) == [{"type": "command", "name": "set_cat", "args": {"on": True, "coat": "calico"}}]
    hub.command("set_cat", {"on": False, "ignored": 1})
    assert drain(a) == [{"type": "command", "name": "set_cat", "args": {"on": False}}]
    with pytest.raises(CommandError):
        hub.command("set_cat", {})
    assert hub.replay() is None


async def test_module_level_set_cat():
    hub = CommandHub(lambda name: None)
    c = hub.register()
    commands.bind(hub)
    try:
        r = await commands.set_cat(coat="black")
        assert r["args"] == {"coat": "black"}
        assert drain(c)[0]["name"] == "set_cat"
    finally:
        commands.bind(None)


def test_display_cat_default_and_validation(tmp_path):
    def write(extra):
        (tmp_path / "config.toml").write_text("[display]\n" + extra + "\n", encoding="utf-8")
        return load_config(tmp_path)

    d = write("").settings()["display"]
    assert d["cat"] is False and d["cat_coat"] == "tabby"
    d = write('cat = true\ncat_coat = "siamese"').settings()["display"]
    assert d["cat"] is True and d["cat_coat"] == "siamese"
    for bad, match in (("cat = 1", "cat must"), ('cat = "yes"', "cat must"), ('cat_coat = "dog"', "cat_coat"),
                       ("cat_coat = 2", "cat_coat")):
        with pytest.raises(ConfigError, match=match):
            write(bad)
    assert len(CAT_COATS) == 8


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


@pytest.mark.parametrize("body", [
    {"name": "set_cat"},
    {"name": "set_cat", "args": {}},
    {"name": "set_cat", "args": {"on": "true"}},
    {"name": "set_cat", "args": {"coat": "dog"}},
    {"name": "set_cat", "args": [True]},
])
def test_api_command_set_cat_422(make_client, body):
    with make_client() as c:
        assert c.post("/api/command", json=body).status_code == 422


def test_set_cat_reaches_websocket_and_hello_has_cat(make_client):
    with make_client(display={"cat": True, "cat_coat": "ginger"}) as c:
        with c.websocket_connect("/ws") as ws:
            d = ws.receive_json()["settings"]["display"]
            assert d["cat"] is True and d["cat_coat"] == "ginger"
            assert ws.receive_json()["type"] == "wall"
            r = c.post("/api/command", json={"name": "set_cat", "args": {"on": False}})
            assert r.status_code == 200 and r.json()["clients"] == 1
            for _ in range(20):
                m = ws.receive_json()
                if m["type"] == "command":
                    break
            assert m == {"type": "command", "name": "set_cat", "args": {"on": False}}
