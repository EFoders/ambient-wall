"""GET /api/ask, GET /api/ask/{panel} and POST /api/show/{panel} over the real app."""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from ambient import ask
from ambient.config import build_config
from ambient.server import Paths, create_app
from ambient.signal import Signal

TZ = ZoneInfo("America/Toronto")
JSON = {"content-type": "application/json"}


def forecast_days(n=3):
    today = datetime.now(TZ).date()
    return [{"date": (today + timedelta(days=i)).isoformat(), "condition": "rain", "t_max": 10 + i, "t_min": i}
            for i in range(n)]


def stub_project(pool, now, cfg):
    return {"ok": True}


@pytest.fixture
def make_client(tmp_path, monkeypatch):
    monkeypatch.setattr("ambient.scheduler.RULES", {})
    fe = tmp_path / "frontend"
    fe.mkdir()
    (fe / "index.html").write_text("<!doctype html><title>wall</title>", encoding="utf-8")

    def make(extra=None, **kw):
        doc = {"location": {"name": "Home", "lat": 45.9, "lon": -77.3, "timezone": "America/Toronto"},
               "source": [{"name": "phone", "type": "push"}], **(extra or {})}
        cfg = build_config(doc, known_types={"push"})
        paths = Paths(config_dir=tmp_path, data_dir=tmp_path / "data", frontend_dir=fe,
                      plugins_dir=tmp_path / "plugins")
        return TestClient(create_app(cfg=cfg, paths=paths, project=stub_project, debounce_s=0.02, **kw))
    return make


def publish(c, sid, value, *, vis="ask", ttl=None, age=0.0):
    source, key = sid.split(".", 1)
    s = Signal(source=source, key=key, value=value, visibility=vis, ttl_s=ttl,
               ts=datetime.now(TZ) - timedelta(seconds=age))
    c.portal.call(c.app.state.pool.publish, [s])


# ------------------------------------------------------------------------------ GET /api/ask

def test_ask_list_availability(make_client):
    with make_client() as c:
        r = c.get("/api/ask")
        assert r.status_code == 200
        assert r.json() == [{"panel": p, "available": False} for p in ask.PANELS]
        publish(c, "weather.forecast.daily", forecast_days())
        publish(c, "weather.warnings", [])
        avail = {x["panel"]: x["available"] for x in c.get("/api/ask").json()}
        assert avail == {"forecast": True, "calendar": False, "pulse": False, "finance": False,
                         "news": False, "warnings": True}


def test_ask_panel_data_null_and_404(make_client):
    with make_client() as c:
        publish(c, "weather.forecast.daily", forecast_days(3))
        r = c.get("/api/ask/forecast")
        assert r.status_code == 200
        body = r.json()
        assert body["panel"] == "forecast" and body["title"] == "Forecast"
        assert len(body["days"]) == 3 and body["days"][0]["hiC"] == 10
        assert body["ts"].endswith(("-04:00", "-05:00"))
        r = c.get("/api/ask/pulse")
        assert r.status_code == 200 and r.text == "null" and r.json() is None
        assert c.get("/api/ask/horoscope").status_code == 404


def test_ask_panel_stale_is_null(make_client):
    with make_client() as c:
        publish(c, "weather.forecast.daily", forecast_days(), ttl=60, age=120)
        assert c.get("/api/ask/forecast").json() is None


def test_ask_uses_configured_ids(make_client):
    with make_client({"ask": {"forecast": {"daily": "envcan.forecast.daily", "days": 2}}}) as c:
        publish(c, "envcan.forecast.daily", forecast_days(5))
        assert len(c.get("/api/ask/forecast").json()["days"]) == 2


def test_ask_gets_need_no_token(make_client, monkeypatch):
    monkeypatch.setenv("ASK_TEST_TOKEN", "tok-123456")
    with make_client({"server": {"push_token": "${ASK_TEST_TOKEN}"}}) as c:
        assert c.get("/api/ask").status_code == 200
        assert c.get("/api/ask/forecast").status_code == 200


# ------------------------------------------------------------------------------ POST /api/show

def test_show_ok_default_duration(make_client):
    with make_client() as c:
        publish(c, "weather.forecast.daily", forecast_days())
        r = c.post("/api/show/forecast", headers=JSON)                 # empty body
        assert r.status_code == 200
        assert r.json() == {"shown": True, "panel": "forecast", "duration": 20, "clients": 0}
        r = c.post("/api/show/forecast", json={})
        assert r.json()["duration"] == 20
        r = c.post("/api/show/forecast", content=b"null", headers=JSON)
        assert r.json()["duration"] == 20


@pytest.mark.parametrize("given,expected", [(1, 5), (5, 5), (0, 5), (-30, 5), (33.4, 33), (33.6, 34),
                                            (120, 120), (500, 120), ("45", 45), (None, 20)])
def test_show_duration_clamped(make_client, given, expected):
    with make_client() as c:
        publish(c, "weather.forecast.daily", forecast_days())
        r = c.post("/api/show/forecast", json={"duration": given})
        assert r.status_code == 200 and r.json()["duration"] == expected


@pytest.mark.parametrize("body", [{"duration": "soon"}, {"duration": True}, {"duration": [5]},
                                  [1, 2], "20"])
def test_show_bad_body_422(make_client, body):
    with make_client() as c:
        publish(c, "weather.forecast.daily", forecast_days())
        assert c.post("/api/show/forecast", content=json.dumps(body), headers=JSON).status_code == 422


def test_show_no_data_unknown_panel_and_body_rules(make_client):
    with make_client() as c:
        r = c.post("/api/show/pulse", json={})
        assert r.status_code == 200 and r.json() == {"shown": False, "panel": "pulse", "reason": "no data"}
        assert c.post("/api/show/horoscope", json={}).status_code == 404
        assert c.post("/api/show/forecast", content=b"{nope", headers=JSON).status_code == 400
        assert c.post("/api/show/forecast", content=b"{}", headers={"content-type": "text/plain"}).status_code == 415
        assert c.post("/api/show/forecast").status_code == 415                       # no content type
        big = json.dumps({"duration": 10, "pad": "x" * 70000})
        assert c.post("/api/show/forecast", content=big, headers=JSON).status_code == 413
        assert c.get("/api/show/forecast").status_code in (404, 405)                 # POST only


def test_show_no_data_does_not_replace_active_show(make_client):
    with make_client() as c:
        publish(c, "weather.forecast.daily", forecast_days())
        c.post("/api/show/forecast", json={"duration": 30})
        c.post("/api/show/pulse", json={})
        assert c.app.state.commands.showing == "forecast"


def test_show_requires_token_when_set(make_client, monkeypatch):
    monkeypatch.setenv("ASK_TEST_TOKEN", "tok-123456")
    with make_client({"server": {"push_token": "${ASK_TEST_TOKEN}"}}) as c:
        publish(c, "weather.forecast.daily", forecast_days())
        assert c.post("/api/show/forecast", json={}).status_code == 401
        assert c.post("/api/show/forecast", json={}, headers={"Authorization": "Bearer nope"}).status_code == 401
        assert c.post("/api/show/horoscope", json={}).status_code == 401              # auth before 404
        r = c.post("/api/show/forecast", json={}, headers={"Authorization": "Bearer tok-123456"})
        assert r.status_code == 200 and r.json()["shown"] is True
