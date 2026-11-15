"""scripts/spotify_auth.py (authorize URL, code exchange with a mocked HTTP layer, the CSRF-checked
callback server on an ephemeral 127.0.0.1 port, the secrets.toml lines) and the pure parts of the
optional scripts/nowplaying_windows.py (no winsdk needed). No live Spotify."""
from __future__ import annotations

import base64
import importlib.util
import io
import json
import threading
import tomllib
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest

REPO = Path(__file__).resolve().parents[2]


def load(name):
    path = REPO / "scripts" / f"{name}.py"
    if not path.is_file():
        pytest.skip(f"scripts/{name}.py missing")
    spec = importlib.util.spec_from_file_location(f"_script_{name}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def auth():
    return load("spotify_auth")


@pytest.fixture(scope="module")
def winnp():
    return load("nowplaying_windows")


# ------------------------------------------------------------------------------ spotify_auth

def test_authorize_url(auth):
    url = auth.authorize_url("my-client", "STATE123")
    u = urlsplit(url)
    assert f"{u.scheme}://{u.netloc}{u.path}" == "https://accounts.spotify.com/authorize"
    q = parse_qs(u.query)
    assert q == {"client_id": ["my-client"], "response_type": ["code"],
                 "redirect_uri": ["http://127.0.0.1:8888/callback"],
                 "scope": ["user-read-currently-playing user-read-playback-state"],
                 "state": ["STATE123"], "show_dialog": ["true"]}


class FakeResp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


def test_exchange_code_with_mocked_http(auth):
    seen = []

    def opener(req, timeout):
        seen.append((req, timeout))
        return FakeResp(json.dumps({"access_token": "AT", "token_type": "Bearer", "expires_in": 3600,
                                    "refresh_token": "RT-123", "scope": auth.SCOPES}).encode())
    out = auth.exchange_code("the-code", "cid", "csecret", "http://127.0.0.1:8888/callback", opener=opener)
    assert out["refresh_token"] == "RT-123"
    req, timeout = seen[0]
    assert req.full_url == "https://accounts.spotify.com/api/token" and req.get_method() == "POST"
    assert req.get_header("Authorization") == "Basic " + base64.b64encode(b"cid:csecret").decode()
    assert req.get_header("Content-type") == "application/x-www-form-urlencoded"
    assert parse_qs(req.data.decode()) == {"grant_type": ["authorization_code"], "code": ["the-code"],
                                           "redirect_uri": ["http://127.0.0.1:8888/callback"]}
    assert timeout > 0


def test_exchange_code_errors_carry_no_secrets(auth):
    def http_error(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 400, "Bad Request", {},
                                     io.BytesIO(b'{"error":"invalid_grant","error_description":"Invalid authorization code"}'))
    with pytest.raises(auth.AuthError, match="HTTP 400: invalid_grant Invalid authorization code") as e:
        auth.exchange_code("c", "cid", "csecret-XYZ", "r", opener=http_error)
    assert "csecret-XYZ" not in str(e.value)

    def offline(req, timeout):
        raise urllib.error.URLError("no route")
    with pytest.raises(auth.AuthError, match="could not reach"):
        auth.exchange_code("c", "cid", "s", "r", opener=offline)
    with pytest.raises(auth.AuthError, match="no refresh_token"):
        auth.exchange_code("c", "cid", "s", "r", opener=lambda req, timeout: FakeResp(b'{"access_token":"x"}'))
    with pytest.raises(auth.AuthError, match="not JSON"):
        auth.exchange_code("c", "cid", "s", "r", opener=lambda req, timeout: FakeResp(b"<html>"))


def test_secrets_lines_are_valid_toml(auth):
    text = auth.secrets_lines("cid", 'se"cr\\et', "RT-123")
    assert tomllib.loads(text) == {"SPOTIFY_CLIENT_ID": "cid", "SPOTIFY_CLIENT_SECRET": 'se"cr\\et',
                                   "SPOTIFY_REFRESH_TOKEN": "RT-123"}


def _get(url):
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def test_callback_server_checks_state_then_returns_code(auth):
    result = {}
    port_box = []
    ready = threading.Event()

    def run():
        try:
            result["code"] = auth.wait_for_code("GOOD-STATE", port=0, timeout=10,
                                                ready=lambda p: (port_box.append(p), ready.set()))
        except Exception as e:  # noqa: BLE001
            result["error"] = e
            ready.set()
    t = threading.Thread(target=run)
    t.start()
    assert ready.wait(5) and port_box
    base = f"http://127.0.0.1:{port_box[0]}"
    assert _get(f"{base}/elsewhere")[0] == 404
    status, body = _get(f"{base}/callback?code=EVIL&state=WRONG")       # CSRF: refused, keeps waiting
    assert status == 400 and "State mismatch" in body
    assert _get(f"{base}/callback?code=EVIL")[0] == 400                  # no state at all
    status, body = _get(f"{base}/callback?code=REAL-CODE&state=GOOD-STATE")
    assert status == 200 and "close this tab" in body
    t.join(5)
    assert result == {"code": "REAL-CODE"}


def test_callback_server_reports_denial(auth):
    result = {}
    port_box = []
    ready = threading.Event()

    def run():
        try:
            auth.wait_for_code("S", port=0, timeout=10, ready=lambda p: (port_box.append(p), ready.set()))
        except auth.AuthError as e:
            result["error"] = str(e)
    t = threading.Thread(target=run)
    t.start()
    assert ready.wait(5)
    assert _get(f"http://127.0.0.1:{port_box[0]}/callback?error=access_denied&state=S")[0] == 400
    t.join(5)
    assert result == {"error": "authorisation refused: access_denied"}


def test_main_end_to_end_with_mocks(auth, monkeypatch, capsys):
    monkeypatch.setattr(auth, "wait_for_code", lambda state, port, timeout, ready: (ready(port), "CODE")[1])
    monkeypatch.setattr(auth, "exchange_code", lambda code, cid, sec, redirect: {
        "refresh_token": "RT-from-main", "scope": auth.SCOPES})
    monkeypatch.setattr(auth.webbrowser, "open", lambda url: True)
    assert auth.main(["--client-id", "cid", "--client-secret", "sec", "--no-browser"]) == 0
    out = capsys.readouterr().out
    assert 'SPOTIFY_REFRESH_TOKEN = "RT-from-main"' in out and "accounts.spotify.com/authorize" in out
    assert 'type = "spotify"' in out


# ------------------------------------------------------------------------------ nowplaying_windows (pure)

def test_windows_build_value(winnp):
    now = datetime(2026, 10, 10, 13, 0, 10, tzinfo=timezone.utc)
    v = winnp.build_value(title=" Teardrop ", artist="Massive Attack", album="", playing=True,
                          position=timedelta(seconds=80), end_time=timedelta(seconds=330),
                          last_updated=now - timedelta(seconds=10), now=now,
                          app="Spotify.exe")
    assert v == {"title": "Teardrop", "artist": "Massive Attack", "album": None, "is_playing": True,
                 "progress_ms": 80000, "anchor_at": "2026-10-10T13:00:00.000+00:00",   # position AT last_updated
                 "duration_ms": 330000, "source": "spotify"}
    paused = winnp.build_value(title="X", artist=None, album=None, playing=False, position=timedelta(seconds=5),
                               end_time=timedelta(0), last_updated=datetime(1601, 1, 1, tzinfo=timezone.utc),
                               now=now, app="Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic")
    assert paused["progress_ms"] == 5000 and paused["duration_ms"] is None
    assert paused["anchor_at"] == "2026-10-10T13:00:10.000+00:00"          # WinRT "never": now
    assert paused["source"] == "microsoft.zunemusic"
    assert winnp.build_value(title="", artist="a", album=None, playing=True) is None


def test_windows_tracker_anchors_and_pushes_on_change_and_heartbeat(winnp):
    tr = winnp.Tracker(heartbeat_s=20)
    t0 = datetime(2026, 10, 10, 13, 0, tzinfo=timezone.utc)

    def val(progress_s, at_s, playing=True):
        return winnp.build_value(title="A", artist="B", album=None, playing=playing,
                                 position=timedelta(seconds=progress_s), end_time=timedelta(seconds=300),
                                 last_updated=t0 + timedelta(seconds=at_s), now=t0 + timedelta(seconds=at_s))
    first = tr.update(val(10, 0), t0, 0)
    assert first["progress_ms"] == 10000
    # the player refreshes its timeline every few seconds: same anchor, nothing to push
    assert tr.update(val(14, 4), t0, 4) is False
    assert tr.update(val(19.5, 9), t0, 9) is False
    beat = tr.update(val(31, 21), t0, 21)                                # heartbeat: identical value
    assert beat == first
    seek = tr.update(val(120, 25), t0, 25)                               # seek: re-anchored, pushed
    assert seek["progress_ms"] == 120000 and seek["anchor_at"] != first["anchor_at"]
    paused = tr.update(val(121, 26, playing=False), t0 + timedelta(seconds=26), 26)
    assert paused["is_playing"] is False and paused["paused_since"] == "2026-10-10T13:00:26+00:00"
    again = tr.update(val(121, 26, playing=False), t0 + timedelta(minutes=1), 50)   # heartbeat
    assert again == paused
    assert tr.update(None, t0, 51) is None                               # stopped: push null
