"""First-run setup wizard backend (ambient/setup.py + the /api/setup endpoints in server.py): detection, the
POST guard and the 409 after setup, field validation, the files written, the lookup proxies against mocked
upstreams, the permission-error fallback, and the in-process reload. Only temporary directories; no network."""
from __future__ import annotations

import json
import shutil
import tomllib
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from ambient import loader, setup
from ambient.config import load_config
from ambient.server import Paths, create_app

REPO = Path(__file__).resolve().parents[2]
EXAMPLE = REPO / "config" / "config.example.toml"

CAL_URL = "https://calendar.google.com/calendar/ical/abc%40group/private-0123456789abcdef/basic.ics"
SPOTIFY = {"client_id": "0123456789abcdef0123456789abcdef", "client_secret": "fedcba9876543210fedcba9876543210",
           "refresh_token": "AQB-refresh_token.value-0123456789"}
SECRET_VALUES = [CAL_URL, *SPOTIFY.values()]

SITE_LIST = (
    "Site Names,,,,\n"
    "Codes,English Names,Province Codes,Latitude,Longitude\n"
    "s0000430,Ottawa (Kanata - Orléans),ON,45.33N,75.58W\n"
    "s0000729,Petawawa,ON,45.89N,77.27W\n"
    "s0000730,Pembroke,ON,45.82N,77.11W\n"
    "s0000635,Montréal,QC,45.51N,73.55W\n"
    "s0000867,Yellowhead Highway - Tête Jaune Cache to the Alberta Border,HEF, ,\n"
)
GEO = {"results": [
    {"id": 1, "name": "Pembroke", "latitude": 45.8168, "longitude": -77.1162, "country_code": "CA",
     "timezone": "America/Toronto", "country": "Canada", "admin1": "Ontario", "admin2": "Renfrew County"},
    {"id": 2, "name": "Pembroke", "latitude": 51.6764, "longitude": -4.9158, "country_code": "GB",
     "timezone": "Europe/London", "country": "United Kingdom", "admin1": "Wales"},
    {"id": 3, "name": "broken"},
]}
RSS = b"""<?xml version="1.0"?><rss version="2.0"><channel><title>Valley News</title>
<item><title>Bridge reopens after repairs</title><pubDate>Tue, 13 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title>Older story</title><pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate></item>
</channel></rss>"""


def full_answers(**over):
    a = {
        "location": {"name": "Pembroke", "lat": 45.8168, "lon": -77.1162, "timezone": "America/Toronto",
                     "region": "Renfrew County"},
        "envcanada": {"site": "s0000730", "province": "ON", "name": "Pembroke"},
        "schedule": {"work_start": "8:30", "work_end": "16:45", "work_days": [5, 1, 2, 3, 4, 1], "hour24": False},
        "look": {"theme": "nature", "cat": True, "cat_coat": "ginger", "sound": True, "boost": 2},
        "news": [{"url": "https://feeds.example.org/valley.xml", "label": "Valley News", "local": True},
                 {"url": "feed://news.example.com/rss"}],
        "calendar": {"url": CAL_URL},
        "hosts": [{"name": "homelab", "address": "192.168.1.10"}, {"name": "nas", "address": "nas.local"}],
        "spotify": dict(SPOTIFY),
    }
    a.update(over)
    return a


class Upstream:
    """Mock transport for the fixed upstream hosts (+ one feed host); records what was asked."""

    def __init__(self):
        self.calls: list[httpx.Request] = []
        self.geo_status = 200

    def __call__(self, req: httpx.Request) -> httpx.Response:
        self.calls.append(req)
        host = req.url.host
        if host == "geocoding-api.open-meteo.com":
            return httpx.Response(self.geo_status, json=GEO)
        if host == "dd.weather.gc.ca" and req.url.path.endswith("site_list_en.csv"):
            return httpx.Response(200, content=SITE_LIST.encode("utf-8"), headers={"content-type": "text/csv"})
        if host == "feeds.example.org":
            if req.url.path == "/valley.xml":
                return httpx.Response(200, content=RSS, headers={"content-type": "application/rss+xml"})
            return httpx.Response(404)
        return httpx.Response(599)


async def _no_ping(self, address, port):
    return False, None


@pytest.fixture
def env(tmp_path, monkeypatch):
    """config/ with only config.example.toml (a fresh install), a tiny frontend with two themes, mocked HTTP."""
    loader.load_builtins()
    monkeypatch.delenv("AMBIENT_SETUP", raising=False)
    setup._EC_CACHE.update(at=0.0, sites=None)
    monkeypatch.setattr("ambient.adapters.ping.Ping.probe", _no_ping)     # no real ICMP from tests
    cfg_dir = tmp_path / "config"
    cfg_dir.mkdir()
    shutil.copy(EXAMPLE, cfg_dir / "config.example.toml")
    fe = tmp_path / "frontend"
    (fe / "themes").mkdir(parents=True)
    (fe / "index.html").write_text("<!doctype html><title>wall</title>", encoding="utf-8")
    for t in ("cyberpunk", "nature"):
        (fe / "themes" / f"{t}.js").write_text("//", encoding="utf-8")
    up = Upstream()

    class Env:
        config_dir = cfg_dir
        upstream = up

        def client(self, **kw):
            paths = Paths(config_dir=cfg_dir, data_dir=tmp_path / "data", frontend_dir=fe,
                          plugins_dir=tmp_path / "plugins")
            http = httpx.AsyncClient(transport=httpx.MockTransport(up))
            return TestClient(create_app(paths=paths, http=http, debounce_s=0.02, **kw))
    return Env()


def hello(c):
    with c.websocket_connect("/ws") as ws:
        return ws.receive_json()


# ---------------------------------------------------------------------- detection
def test_first_run_is_detected_and_announced(env):
    with env.client() as c:
        s = c.get("/api/setup").json()
        assert s["needed"] is True and s["enabled"] is True and s["writable"] is True
        assert s["running"] == "config.example.toml"
        assert s["themes"] == ["cyberpunk", "nature"] and "ginger" in s["coats"]
        assert s["secrets_present"] == []
        h = hello(c)
        assert h["type"] == "hello" and h["setup"] == {"needed": True}
        assert set(h["settings"]) == {"location", "mode", "display"}


def test_existing_config_means_no_wizard_and_409(env):
    (env.config_dir / "config.toml").write_text('[location]\nname = "Home"\n', encoding="utf-8")
    with env.client() as c:
        assert c.get("/api/setup").json()["needed"] is False
        assert "setup" not in hello(c)
        for path, body in (("/api/setup", full_answers()), ("/api/setup/preview", full_answers()),
                           ("/api/setup/geocode", {"q": "Ottawa"}), ("/api/setup/ec-site", {"lat": 45, "lon": -77}),
                           ("/api/setup/test-feed", {"url": "https://feeds.example.org/valley.xml"})):
            r = c.post(path, json=body)
            assert r.status_code == 409, (path, r.text)
            assert "already set up" in r.json()["detail"]
    assert env.upstream.calls == []
    assert (env.config_dir / "config.toml").read_text(encoding="utf-8") == '[location]\nname = "Home"\n'


def test_setup_can_be_turned_off(env, monkeypatch):
    monkeypatch.setenv("AMBIENT_SETUP", "0")
    with env.client() as c:
        s = c.get("/api/setup").json()
        assert s["needed"] is False and s["enabled"] is False
        assert "setup" not in hello(c)
        assert c.post("/api/setup", json=full_answers()).status_code == 409
    assert not (env.config_dir / "config.toml").exists()


def test_setup_posts_go_through_the_shared_guard(env):
    with env.client() as c:
        r = c.post("/api/setup", content=json.dumps(full_answers()), headers={"content-type": "text/plain"})
        assert r.status_code == 415
        r = c.post("/api/setup/geocode", content=b"{not json", headers={"content-type": "application/json"})
        assert r.status_code == 400
        r = c.post("/api/setup/preview", content=b'{"x": "' + b"a" * 70000 + b'"}',
                   headers={"content-type": "application/json"})
        assert r.status_code == 413
    assert not (env.config_dir / "config.toml").exists()


# ---------------------------------------------------------------------- validation
def test_field_errors(env):
    bad = full_answers(
        location={"name": "", "lat": 95, "lon": "x", "timezone": "Mars/Olympus"},
        envcanada={"site": "730", "province": "ON"},
        schedule={"work_start": "25:00", "work_end": "17:00", "work_days": [1, 9]},
        look={"theme": "vaporwave", "cat_coat": "plaid", "boost": 7},
        news=[{"url": "ftp://example.org/feed"}, {"url": "https://ok.example/rss"}, {"url": "https://ok.example/rss"}],
        calendar={"url": "javascript:alert(1)"},
        hosts=[{"name": "home lab", "address": "192.168.1.10"}, {"name": "pc", "address": "bad host!"},
               {"name": "pc2", "address": ""}],
        spotify={"client_id": "abc"},
    )
    with env.client() as c:
        r = c.post("/api/setup", json=bad)
        assert r.status_code == 422
        fields = {e["field"] for e in r.json()["errors"]}
        assert {"location.name", "location.lat", "location.lon", "location.timezone", "envcanada",
                "schedule.work_start", "schedule.work_days", "look.theme", "look.cat_coat", "look.boost",
                "news.0.url", "news.2.url", "calendar.url", "hosts.0.name", "hosts.1.address", "hosts.2.address",
                "spotify.client_id", "spotify.client_secret", "spotify.refresh_token"} <= fields, fields
        p = c.post("/api/setup/preview", json=bad).json()
        assert p["ok"] is False and p["errors"] and p["config_toml"] == ""
        # bounded: too many rows, over-long text
        r = c.post("/api/setup", json=full_answers(hosts=[{"name": f"h{i}", "address": "10.0.0.1"} for i in range(17)],
                                                     location={**full_answers()["location"], "name": "x" * 81}))
        fields = {e["field"] for e in r.json()["errors"]}
        assert {"hosts", "location.name"} <= fields
    assert not (env.config_dir / "config.toml").exists()


def test_adapter_option_errors_surface_per_field(env, monkeypatch):
    """check() also constructs each adapter: an option the adapter refuses is a field error, not a startup one."""
    real = setup.valid_address
    monkeypatch.setattr(setup, "valid_address", lambda a: True)     # let a bad address past the form check
    form, errors = setup.parse_form(full_answers(hosts=[{"name": "pc", "address": "-oops"}]), themes={"nature"})
    assert errors == []
    _, _, errs = setup.check(form, env.config_dir, themes=["nature"])
    assert any(e["field"] == "hosts" and "pc" in e["message"] for e in errs), errs
    assert real("-oops") is False


# ---------------------------------------------------------------------- the files
def test_preview_shows_config_without_secrets(env):
    with env.client() as c:
        p = c.post("/api/setup/preview", json=full_answers()).json()
    assert p["ok"] is True and p["errors"] == []
    assert p["secrets"] == ["CALENDAR_ICS_URL", "SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REFRESH_TOKEN"]
    body = json.dumps(p)
    assert not any(v in body for v in SECRET_VALUES)
    assert "${CALENDAR_ICS_URL}" in p["config_toml"]
    assert not (env.config_dir / "config.toml").exists()


def test_save_writes_files_and_reloads_in_process(env):
    with env.client() as c:
        before = {s["name"]: s["type"] for s in c.get("/api/sources").json()}
        assert before["weather"] == "demo"
        r = c.post("/api/setup", json=full_answers())
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["ok"] is True and out["applied"] is True and out["written"] == ["secrets.toml", "config.toml"]
        assert not any(v in r.text for v in SECRET_VALUES)

        # applied without a restart: new sources running, demo gone, hello without "setup"
        src = {s["name"]: s for s in c.get("/api/sources").json()}
        assert src["weather"]["type"] == "open_meteo" and src["ec"]["type"] == "envcanada"
        assert src["heartbeat"]["type"] == "ping" and src["calendar"]["type"] == "ical"
        assert src["music"]["type"] == "spotify" and src["music"]["enabled"] is True
        assert {"news-valley-news", "news-example-com"} <= set(src)
        assert "finances" not in src and "github" not in src
        h = hello(c)
        assert "setup" not in h
        assert h["settings"]["location"]["name"] == "Pembroke"
        assert h["settings"]["display"]["theme"] == "nature" and h["settings"]["display"]["cat_coat"] == "ginger"
        s = c.get("/api/setup").json()
        assert s["needed"] is False and not any(v in json.dumps(s) for v in SECRET_VALUES)
        # second save: refused, nothing rewritten
        mtime = (env.config_dir / "config.toml").stat().st_mtime_ns
        assert c.post("/api/setup", json=full_answers(look={"theme": "cyberpunk"})).status_code == 409
        assert (env.config_dir / "config.toml").stat().st_mtime_ns == mtime

    text = (env.config_dir / "config.toml").read_text(encoding="utf-8")
    secrets = (env.config_dir / "secrets.toml").read_text(encoding="utf-8")
    assert not any(v in text for v in SECRET_VALUES)
    assert tomllib.loads(secrets) == {"CALENDAR_ICS_URL": CAL_URL, "SPOTIFY_CLIENT_ID": SPOTIFY["client_id"],
                                      "SPOTIFY_CLIENT_SECRET": SPOTIFY["client_secret"],
                                      "SPOTIFY_REFRESH_TOKEN": SPOTIFY["refresh_token"]}
    doc = tomllib.loads(text)
    assert doc["location"] == {"name": "Pembroke", "lat": 45.8168, "lon": -77.1162, "timezone": "America/Toronto"}
    assert doc["mode"]["work_start"] == "08:30" and doc["mode"]["work_days"] == [1, 2, 3, 4, 5]
    assert doc["display"]["hour24"] is False and doc["display"]["boost"] == 2 and doc["display"]["sound"] is True
    ec = next(s for s in doc["source"] if s["name"] == "ec")
    assert ec == {"name": "ec", "type": "envcanada", "site": "s0000730", "province": "ON", "every": "15m", "ttl": "90m"}
    assert doc["wall"]["weather_obs_condition"] == "ec.now.condition"
    assert doc["rules"]["weather_actionable"]["observed"] == "ec" and doc["rules"]["leave_early"]["observed"] == "ec"
    assert doc["rules"]["news"]["local_terms"] == ["Pembroke", "Renfrew County"]
    assert doc["ask"]["warnings"]["warnings"] == "ec.warnings"
    hb = next(s for s in doc["source"] if s["name"] == "heartbeat")
    assert hb["hosts"] == {"homelab": "192.168.1.10", "nas": "nas.local"}
    feeds = [s for s in doc["source"] if s["type"] == "rss"]
    assert [(f["url"], f.get("priority")) for f in feeds] == [("https://feeds.example.org/valley.xml", 1),
                                                              ("https://news.example.com/rss", None)]
    assert "# [[source]]" in text and "google_sheet_finances" in text      # hand-editing hints stay
    cfg = load_config(env.config_dir)                                        # what a restart would load
    assert cfg.path.name == "config.toml" and all(s.enabled for s in cfg.sources)


def test_minimal_answers_make_a_working_config(env):
    answers = {"location": {"name": "Lisbon", "lat": 38.72, "lon": -9.14, "timezone": "Europe/Lisbon"}}
    with env.client() as c:
        r = c.post("/api/setup", json=answers)
        assert r.status_code == 200 and r.json()["applied"] is True, r.text
        assert r.json()["sources"] == ["weather"]
    assert not (env.config_dir / "secrets.toml").exists()
    doc = tomllib.loads((env.config_dir / "config.toml").read_text(encoding="utf-8"))
    assert doc["display"]["theme"] == "cyberpunk" and doc["mode"]["work_days"] == [1, 2, 3, 4, 5]
    assert "weather_obs_condition" not in doc["wall"] and "observed" not in doc["rules"]["weather_actionable"]


def test_secrets_merge_into_an_existing_file(env):
    (env.config_dir / "secrets.toml").write_text(
        '# mine\nGITHUB_TOKEN = "github_pat_keepme"\nCALENDAR_ICS_URL = "https://old.example/x.ics"\n', encoding="utf-8")
    with env.client() as c:
        assert c.get("/api/setup").json()["secrets_present"] == ["CALENDAR_ICS_URL"]
        r = c.post("/api/setup", json=full_answers(spotify=None))
        assert r.status_code == 200, r.text
    text = (env.config_dir / "secrets.toml").read_text(encoding="utf-8")
    assert text.startswith("# mine\n")
    assert tomllib.loads(text) == {"GITHUB_TOKEN": "github_pat_keepme", "CALENDAR_ICS_URL": CAL_URL}


def test_toml_escaping_round_trips():
    name = 'Saint-"Quote" \\ Back\tslash Montréal \x7f'
    form, errors = setup.parse_form({"location": {"name": "x", "lat": 1, "lon": 2, "timezone": "UTC"}})
    assert errors == []
    form["location"]["name"] = name
    form["news"] = [{"url": 'https://e.example/r?a=1&b="2"', "label": "Lé \\ \"x\"", "local": False, "index": 0}]
    doc = tomllib.loads(setup.render_config(form))
    assert doc["location"]["name"] == name
    assert doc["source"][1]["label"] == "Lé \\ \"x\"" and doc["source"][1]["url"].endswith('b="2"')
    sec = setup.render_secrets({"A": 'x"y\\z'})
    assert tomllib.loads(sec) == {"A": 'x"y\\z'}


def test_write_permission_error_hands_the_files_back(env, monkeypatch):
    def denied(path, text, mode=0o644):
        raise PermissionError(13, "Permission denied", str(path))

    monkeypatch.setattr(setup, "write_atomic", denied)
    with env.client() as c:
        r = c.post("/api/setup", json=full_answers())
        assert r.status_code == 500
        out = r.json()
        assert out["ok"] is False and "Permission denied" in out["write_error"]
        assert "chown" in out["hint"] and "config.toml" in out["hint"]
        assert tomllib.loads(out["config_toml"])["location"]["name"] == "Pembroke"
        assert tomllib.loads(out["secrets_toml"])["CALENDAR_ICS_URL"] == CAL_URL   # the requester's own input
        assert c.get("/api/setup").json()["needed"] is True                       # still first run
    assert not (env.config_dir / "config.toml").exists()


def test_read_only_mount_hint():
    e = OSError(30, "Read-only file system")
    assert "./config:/config:ro" in setup._hint(Path("/config"), e)


def test_write_atomic_leaves_no_temp_files(tmp_path):
    setup.write_atomic(tmp_path / "a.toml", "x = 1\n")
    setup.write_atomic(tmp_path / "a.toml", "x = 2\n")
    assert [p.name for p in tmp_path.iterdir()] == ["a.toml"]
    assert (tmp_path / "a.toml").read_text(encoding="utf-8") == "x = 2\n"


# ---------------------------------------------------------------------- lookups
def test_geocode_proxy(env):
    with env.client() as c:
        r = c.post("/api/setup/geocode", json={"q": "  Pembroke  "})
        assert r.status_code == 200, r.text
        res = r.json()["results"]
        assert len(res) == 2                                   # the malformed upstream row is dropped
        assert res[0] == {"name": "Pembroke", "region": "Renfrew County", "admin1": "Ontario", "country": "Canada",
                          "country_code": "CA", "lat": 45.8168, "lon": -77.1162, "timezone": "America/Toronto"}
        req = env.upstream.calls[-1]
        assert req.url.host == "geocoding-api.open-meteo.com" and req.url.params["name"] == "Pembroke"
        for q in ("x", "y" * 61, 5, None, "a\x00b"):
            assert c.post("/api/setup/geocode", json={"q": q}).status_code == 422, q
        env.upstream.geo_status = 500
        r = c.post("/api/setup/geocode", json={"q": "Pembroke"})
        assert r.status_code == 502 and "by hand" in r.json()["detail"]
    assert {r.url.host for r in env.upstream.calls} == {"geocoding-api.open-meteo.com"}


def test_ec_site_proxy_nearest_and_cached(env):
    with env.client() as c:
        r = c.post("/api/setup/ec-site", json={"lat": 45.8168, "lon": -77.1162})
        assert r.status_code == 200, r.text
        sites = r.json()["sites"]
        assert [s["code"] for s in sites] == ["s0000730", "s0000729", "s0000430"]
        assert sites[0]["name"] == "Pembroke" and sites[0]["province"] == "ON" and sites[0]["km"] < 2
        c.post("/api/setup/ec-site", json={"lat": 45.5, "lon": -73.5})
        assert c.post("/api/setup/ec-site", json={"lat": 91, "lon": 0}).status_code == 422
        assert c.post("/api/setup/ec-site", json={"lat": "45", "lon": 0}).status_code == 422
    hosts = [r.url for r in env.upstream.calls]
    assert len(hosts) == 1 and str(hosts[0]) == setup.EC_SITES_URL         # fetched once, then cached


def test_parse_site_list():
    sites = setup.parse_site_list(SITE_LIST)
    assert [s["code"] for s in sites] == ["s0000430", "s0000729", "s0000730", "s0000635"]   # highway row skipped
    assert sites[3] == {"code": "s0000635", "name": "Montréal", "province": "QC", "lat": 45.51, "lon": -73.55}


def test_test_feed(env):
    with env.client() as c:
        r = c.post("/api/setup/test-feed", json={"url": "https://feeds.example.org/valley.xml"})
        assert r.json() == {"ok": True, "title": "Valley News", "headline": "Bridge reopens after repairs", "count": 2}
        r = c.post("/api/setup/test-feed", json={"url": "https://feeds.example.org/missing.xml"})
        assert r.status_code == 200 and r.json()["ok"] is False and "404" in r.json()["error"]
        assert c.post("/api/setup/test-feed", json={"url": "file:///etc/passwd"}).status_code == 422
        assert c.post("/api/setup/test-feed", json={"url": "https://x/" + "a" * 2001}).status_code == 422


# ---------------------------------------------------------------------- reload
def test_reload_reconnects_open_walls(env):
    with env.client() as c:
        with c.websocket_connect("/ws") as ws:
            assert ws.receive_json()["setup"] == {"needed": True}
            assert c.post("/api/setup", json=full_answers()).status_code == 200
            with pytest.raises(WebSocketDisconnect) as e:
                for _ in range(50):
                    ws.receive_json()
            assert e.value.code == 1013                        # "try again later": the wall reconnects at once
        h = hello(c)
        assert "setup" not in h and h["settings"]["location"]["name"] == "Pembroke"
        w = c.get("/api/wall").json()
        assert w["type"] == "wall"


def test_reload_failure_keeps_the_files_and_says_restart(env, monkeypatch):
    with env.client() as c:
        async def boom(_cfg):
            raise RuntimeError("nope")
        c.app.state.reload_runtime = boom
        r = c.post("/api/setup", json=full_answers())
        assert r.status_code == 200
        assert r.json()["applied"] is False and "restart" in r.json()["note"]
    assert (env.config_dir / "config.toml").exists()

