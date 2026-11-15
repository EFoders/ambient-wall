import json

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from ambient.adapters.base import Adapter
from ambient.config import build_config
from ambient.rules.base import Rule
from ambient.server import Paths, create_app


class Fake(Adapter):
    default_every = 3600

    async def fetch(self):
        return [{"key": "now.condition", "value": "rain"}, {"key": "secret", "value": 1, "visibility": "ask"}]


def double_rule(pool, now, cfg):
    s = pool.get("phone.battery")
    return [{"key": "battery.low", "value": s.value < 20}] if s else []


def stub_project(pool, now, cfg):
    """Stand-in for ambient.wall.project."""
    c = pool.get(cfg.wall["weather_condition"])
    b = pool.get("phone.battery")
    return {"weather": {"condition": c.value} if c else None, "battery": b.value if b else None,
            "at": now}


@pytest.fixture
def make_client(tmp_path, monkeypatch):
    monkeypatch.setattr("ambient.scheduler.REGISTRY", {"fake": Fake})
    monkeypatch.setattr("ambient.scheduler.RULES", {"low": Rule("low", ["phone.*"], double_rule, None)})
    fe = tmp_path / "frontend"
    fe.mkdir()
    (fe / "index.html").write_text("<!doctype html><title>wall</title>", encoding="utf-8")

    def make(extra=None, **kw):
        doc = {
            "location": {"name": "Home", "lat": 45.9, "lon": -77.3, "timezone": "America/Toronto"},
            "source": [{"name": "weather", "type": "fake"},
                       {"name": "phone", "type": "push", "ttl": "30m"},
                       {"name": "cal", "type": "fake", "url": "${CORE_TEST_SERVER_UNSET}"}],
            **(extra or {}),
        }
        cfg = build_config(doc, known_types={"fake", "push"})
        paths = Paths(config_dir=tmp_path, data_dir=tmp_path / "data", frontend_dir=fe,
                      plugins_dir=tmp_path / "plugins")
        app = create_app(cfg=cfg, paths=paths, project=stub_project, debounce_s=0.02, **kw)
        return TestClient(app)
    return make


def wait_for(client, pred, tries=200):
    import time
    for _ in range(tries):
        r = client.get("/api/wall").json()
        if pred(r):
            return r
        time.sleep(0.01)
    raise AssertionError("never happened")


def test_rest(make_client):
    with make_client() as c:
        assert c.get("/api/health").json() == {"ok": True}
        w = wait_for(c, lambda r: r["signals"]["weather"] is not None)
        assert w["type"] == "wall" and w["signals"]["weather"] == {"condition": "rain"}
        assert w["ts"].endswith(("-04:00", "-05:00"))           # America/Toronto
        sigs = c.get("/api/signals", params={"pattern": "weather.*"}).json()
        assert [s["id"] for s in sigs] == ["weather.now.condition", "weather.secret"]
        assert all(s["stale"] is False for s in sigs)
        ask = c.get("/api/signals", params={"visibility": "ask"}).json()
        assert [s["id"] for s in ask] == ["weather.secret"]
        assert c.get("/api/signals", params={"visibility": "bogus"}).status_code == 422
        src = {s["name"]: s for s in c.get("/api/sources").json()}
        assert src["weather"]["type"] == "fake" and src["weather"]["every"] == 3600
        assert src["weather"]["status"]["signals_emitted"] >= 0
        assert src["cal"]["enabled"] is False and "CORE_TEST_SERVER_UNSET" in src["cal"]["disabled_reason"]
        assert "low" in src["rules"]["rules"]
        assert "url" not in json.dumps(src)                       # options are never exposed


def test_static_frontend_after_api(make_client):
    with make_client() as c:
        r = c.get("/")
        assert r.status_code == 200 and "<title>wall</title>" in r.text
        assert c.get("/api/health").status_code == 200


def test_push_open_and_rules(make_client):
    with make_client() as c:
        r = c.post("/api/publish/phone", json={"key": "battery", "value": 12})
        assert r.status_code == 200 and r.json() == {"ok": True, "accepted": 1, "changed": 1}
        r = c.post("/api/publish/phone", json=[{"key": "battery", "value": 12}, {"key": "x", "value": "y"}])
        assert r.json() == {"ok": True, "accepted": 2, "changed": 1}
        low = c.get("/api/signals", params={"pattern": "rules.*"}).json()
        assert low[0]["id"] == "rules.battery.low" and low[0]["value"] is True
        assert c.post("/api/publish/nope", json={"key": "a", "value": 1}).status_code == 404
        assert c.post("/api/publish/weather", json={"key": "a", "value": 1}).status_code == 409
        assert c.post("/api/publish/phone", json={"value": 1}).status_code == 422
        assert c.post("/api/publish/phone", json=[1, 2]).status_code == 422
        assert c.post("/api/publish/phone", json=[]).status_code == 422
        assert c.post("/api/publish/phone", content=b"{nope", headers={"content-type": "application/json"}).status_code == 400
        assert c.post("/api/publish/phone", content=b'{"key":"a","value":1}',
                      headers={"content-type": "text/plain"}).status_code == 415
        big = json.dumps({"key": "a", "value": "x" * 70000})
        assert c.post("/api/publish/phone", content=big, headers={"content-type": "application/json"}).status_code == 413


def test_push_bearer_token(make_client, monkeypatch):
    monkeypatch.setenv("CORE_TEST_PUSH_TOKEN", "s3cret-token")
    with make_client({"server": {"push_token": "${CORE_TEST_PUSH_TOKEN}"}}) as c:
        body = {"key": "battery", "value": 50}
        assert c.post("/api/publish/phone", json=body).status_code == 401
        assert c.post("/api/publish/phone", json=body, headers={"Authorization": "Bearer wrong"}).status_code == 401
        assert c.post("/api/publish/phone", json=body, headers={"Authorization": "Basic s3cret-token"}).status_code == 401
        # auth is checked before the source is looked up (no probing without the token)
        assert c.post("/api/publish/nope", json=body).status_code == 401
        r = c.post("/api/publish/phone", json=body, headers={"Authorization": "Bearer s3cret-token"})
        assert r.status_code == 200


def test_push_token_unresolved_refuses(make_client):
    with make_client({"server": {"push_token": "${CORE_TEST_PUSH_TOKEN_UNSET}"}}) as c:
        assert c.post("/api/publish/phone", json={"key": "a", "value": 1}).status_code == 503


def test_websocket_hello_wall_and_push_update(make_client):
    with make_client() as c:
        with c.websocket_connect("/ws") as ws:
            hello = ws.receive_json()
            assert hello["type"] == "hello" and hello["version"] == 1
            assert set(hello["settings"]) == {"location", "mode", "display"}
            assert hello["settings"]["location"]["name"] == "Home"
            assert hello["settings"]["mode"]["work_start"] == "07:00"
            first = ws.receive_json()
            assert first["type"] == "wall" and "signals" in first
            c.post("/api/publish/phone", json={"key": "battery", "value": 77})
            for _ in range(20):
                msg = ws.receive_json()
                assert msg["type"] == "wall"
                if msg["signals"]["battery"] == 77:
                    break
            else:
                raise AssertionError("no wall update after push")


def test_websocket_periodic_resend(make_client):
    with make_client(resend_s=0.05) as c:
        with c.websocket_connect("/ws") as ws:
            ws.receive_json()
            a = ws.receive_json()
            b = ws.receive_json()                         # arrives without any change
            assert a["type"] == b["type"] == "wall"


def test_websocket_origin_check(make_client):
    with make_client({"server": {"allowed_origins": ["http://192.168.1.5:8765"]}}) as c:
        with pytest.raises(WebSocketDisconnect):
            with c.websocket_connect("/ws", headers={"origin": "https://evil.example"}) as ws:
                ws.receive_json()
        with c.websocket_connect("/ws", headers={"origin": "http://testserver"}) as ws:
            assert ws.receive_json()["type"] == "hello"
        with c.websocket_connect("/ws", headers={"origin": "http://192.168.1.5:8765"}) as ws:
            assert ws.receive_json()["type"] == "hello"


def test_projection_failure_keeps_serving(make_client, tmp_path):
    from ambient import server as srv
    calls = {"n": 0}

    def flaky(pool, now, cfg):
        calls["n"] += 1
        if calls["n"] > 1:
            raise RuntimeError("bad projection")
        return {"ok": 1}

    cfg = build_config({}, known_types=set())
    paths = Paths(config_dir=tmp_path, data_dir=tmp_path / "d", frontend_dir=tmp_path / "nofe",
                  plugins_dir=tmp_path / "p")
    with TestClient(srv.create_app(cfg=cfg, paths=paths, project=flaky)) as c:
        assert c.get("/api/wall").json()["signals"] == {"ok": 1}
        assert c.get("/api/wall").json()["signals"] == {"ok": 1}     # last good projection
        assert c.get("/").json() == {"ok": True, "frontend": None}
