"""One-time Spotify login for the wall's `spotify` source. Prints the refresh token for secrets.toml.

Run it ON A PC WITH A BROWSER (not inside the container; it needs your browser and 127.0.0.1:8888):

    1. https://developer.spotify.com/dashboard -> Create app. Redirect URI:
           http://127.0.0.1:8888/callback
       APIs used: Web API. Copy the Client ID and Client Secret.
       (While the app is in Development mode, only accounts listed under User Management can use it:
       add your own Spotify account there.)
    2. From the repo root:
           python scripts/spotify_auth.py --client-id <id>
       It asks for the client secret without echoing it (or set SPOTIFY_CLIENT_ID /
       SPOTIFY_CLIENT_SECRET in the environment). Standard library only: no install needed.
    3. Your browser opens Spotify's consent page (or open the printed URL yourself). Approve.
       Spotify redirects to http://127.0.0.1:8888/callback, which this script is listening on.
    4. Paste the three printed lines into config/secrets.toml and restart the wall:
           docker compose up -d

Scopes requested: user-read-currently-playing user-read-playback-state (read-only).
A random `state` value protects the callback against CSRF: a callback without it is refused.
The refresh token is a credential: it is printed once to your terminal and stored nowhere else.
"""
from __future__ import annotations

import argparse
import base64
import getpass
import hmac
import http.server
import json
import os
import secrets
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from typing import Any, Callable

AUTHORIZE_URL = "https://accounts.spotify.com/authorize"
TOKEN_URL = "https://accounts.spotify.com/api/token"
SCOPES = "user-read-currently-playing user-read-playback-state"
HOST = "127.0.0.1"
PORT = 8888
CALLBACK_PATH = "/callback"


class AuthError(RuntimeError):
    pass


def redirect_uri(port: int = PORT) -> str:
    return f"http://{HOST}:{port}{CALLBACK_PATH}"


def authorize_url(client_id: str, state: str, *, redirect: str | None = None, scopes: str = SCOPES) -> str:
    q = urllib.parse.urlencode({"client_id": client_id, "response_type": "code",
                                "redirect_uri": redirect or redirect_uri(), "scope": scopes,
                                "state": state, "show_dialog": "true"})
    return f"{AUTHORIZE_URL}?{q}"


def build_token_request(code: str, client_id: str, client_secret: str, redirect: str) -> urllib.request.Request:
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    body = urllib.parse.urlencode({"grant_type": "authorization_code", "code": code,
                                   "redirect_uri": redirect}).encode()
    return urllib.request.Request(TOKEN_URL, data=body, method="POST", headers={
        "Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"})


def exchange_code(code: str, client_id: str, client_secret: str, redirect: str, *,
                  opener: Callable[..., Any] = urllib.request.urlopen, timeout: float = 20.0) -> dict[str, Any]:
    """Authorization code -> token response ({access_token, refresh_token, expires_in, scope, ...}).
    `opener` is urllib.request.urlopen (injectable for tests). Raises AuthError (no secrets in it)."""
    req = build_token_request(code, client_id, client_secret, redirect)
    try:
        with opener(req, timeout=timeout) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            err = json.loads(e.read() or b"{}")
            detail = ": " + " ".join(str(x) for x in (err.get("error"), err.get("error_description")) if x)
        except (ValueError, AttributeError):
            pass
        raise AuthError(f"token exchange failed with HTTP {e.code}{detail}") from None
    except (urllib.error.URLError, OSError) as e:
        # the reason (DNS, TLS verification, proxy, timeout) never contains the secret or the code
        reason = getattr(e, "reason", None) or e
        hint = ""
        if "CERTIFICATE_VERIFY_FAILED" in str(reason):
            hint = (" (TLS inspection by antivirus or a proxy is replacing Spotify's certificate; "
                    "try: uv run --with truststore scripts/spotify_auth.py ... which uses the Windows trust store)")
        elif any(p in os.environ for p in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy")):
            hint = " (a proxy is set in this shell's environment: HTTPS_PROXY / HTTP_PROXY)"
        raise AuthError(f"could not reach accounts.spotify.com: {type(e).__name__}: {reason}{hint}") from None
    try:
        body = json.loads(raw)
    except ValueError:
        raise AuthError("token response is not JSON") from None
    if not isinstance(body, dict) or not body.get("refresh_token"):
        raise AuthError("token response has no refresh_token")
    return body


def secrets_lines(client_id: str, client_secret: str, refresh_token: str) -> str:
    def q(s: str) -> str:
        return json.dumps(s)          # a valid TOML basic string for these values
    return (f"SPOTIFY_CLIENT_ID = {q(client_id)}\n"
            f"SPOTIFY_CLIENT_SECRET = {q(client_secret)}\n"
            f"SPOTIFY_REFRESH_TOKEN = {q(refresh_token)}\n")


class CallbackResult:
    def __init__(self) -> None:
        self.code: str | None = None
        self.error: str | None = None
        self.done = threading.Event()


def make_handler(state: str, result: CallbackResult):
    """Request handler for the callback server: accepts exactly one GET /callback with our state."""
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - http.server API
            u = urllib.parse.urlsplit(self.path)
            if u.path != CALLBACK_PATH:
                self._reply(404, "Not found.")
                return
            q = urllib.parse.parse_qs(u.query)
            got_state = (q.get("state") or [""])[0]
            if not hmac.compare_digest(got_state.encode(), state.encode()):
                self._reply(400, "State mismatch: this callback did not come from the login this script "
                                 "started. Ignored.")
                return                                  # keep waiting for the real one
            if q.get("error"):
                result.error = (q.get("error") or ["?"])[0][:100]
                self._reply(400, f"Spotify said: {result.error}. You can close this tab.")
            elif q.get("code"):
                result.code = q["code"][0]
                self._reply(200, "Done. You can close this tab and go back to the terminal.")
            else:
                self._reply(400, "No code in the callback.")
                return
            result.done.set()

        def _reply(self, status: int, text: str) -> None:
            body = (f"<!doctype html><meta charset=utf-8><title>Ambient Wall</title>"
                    f"<body style='background:#000;color:#7fd;font:16px sans-serif;padding:2em'>"
                    f"<p>{text}</p>").encode()
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt: str, *args: Any) -> None:   # the query holds the code: never log it
            pass
    return Handler


def code_from_pasted(pasted: str, state: str) -> str:
    """The redirect address copied from the browser -> the code, with the same state check as the server."""
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(pasted.strip()).query)
    if not hmac.compare_digest((q.get("state") or [""])[0].encode(), state.encode()):
        raise AuthError("that address is not from this login (state mismatch); run the script again and use its URL")
    if q.get("error"):
        raise AuthError(f"authorisation refused: {(q.get('error') or ['?'])[0][:100]}")
    if not q.get("code"):
        raise AuthError("no ?code= in that address; copy the full address the browser landed on after approving")
    return q["code"][0]


def wait_for_code(state: str, *, port: int = PORT, timeout: float = 300.0,
                  ready: Callable[[int], None] | None = None) -> str:
    """Serve http://127.0.0.1:<port>/callback until Spotify redirects there; returns the code."""
    result = CallbackResult()
    try:
        server = http.server.HTTPServer((HOST, port), make_handler(state, result))
    except OSError as e:
        raise AuthError(f"cannot listen on {HOST}:{port} ({e.strerror or e}); is something else using it?") from None
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    try:
        if ready is not None:
            ready(server.server_address[1])
        if not result.done.wait(timeout):
            raise AuthError(f"no callback within {timeout:g} s")
    finally:
        server.shutdown()
        server.server_close()
    if result.error:
        raise AuthError(f"authorisation refused: {result.error}")
    assert result.code is not None
    return result.code


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="One-time Spotify login: prints SPOTIFY_* lines for secrets.toml.")
    ap.add_argument("--client-id", default=os.environ.get("SPOTIFY_CLIENT_ID"))
    ap.add_argument("--client-secret", default=os.environ.get("SPOTIFY_CLIENT_SECRET"),
                    help="prefer the SPOTIFY_CLIENT_SECRET env var or the prompt (keeps it out of shell history)")
    ap.add_argument("--port", type=int, default=PORT, help="callback port (must match the app's redirect URI)")
    ap.add_argument("--no-browser", action="store_true", help="only print the URL")
    ap.add_argument("--paste", action="store_true",
                    help="don't listen for the callback: after approving, paste the address the browser landed on "
                         "(http://127.0.0.1:8888/callback?code=...). Works anywhere, e.g. inside the container: "
                         "docker compose exec -it wall python /app/scripts/spotify_auth.py --paste")
    ap.add_argument("--timeout", type=float, default=300.0, help="seconds to wait for the callback")
    a = ap.parse_args(argv)
    try:  # optional: trust what Windows/macOS trusts (antivirus or corporate TLS inspection); uv run --with truststore
        import truststore
        truststore.inject_into_ssl()
    except ImportError:
        pass
    client_id = (a.client_id or input("Spotify Client ID: ")).strip()
    client_secret = (a.client_secret or getpass.getpass("Spotify Client Secret (hidden): ")).strip()
    if not client_id or not client_secret:
        print("client id and secret are required", file=sys.stderr)
        return 2
    state = secrets.token_urlsafe(24)
    redirect = redirect_uri(a.port)
    url = authorize_url(client_id, state, redirect=redirect)

    def ready(port: int) -> None:
        print(f"Listening on {redirect}\n\nOpen this URL in your browser and approve:\n\n  {url}\n", flush=True)
        if not a.no_browser:
            webbrowser.open(url)

    try:
        if a.paste:
            print(f"Open this URL in a browser and approve:\n\n  {url}\n\n"
                  f"The browser then lands on {redirect}?code=... (it may say the page can't be reached; that's fine).\n"
                  "Copy that whole address from the address bar and paste it here.\n", flush=True)
            code = code_from_pasted(input("Address: "), state)
        else:
            code = wait_for_code(state, port=a.port, timeout=a.timeout, ready=ready)
        tokens = exchange_code(code, client_id, client_secret, redirect)
    except AuthError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    granted = set(str(tokens.get("scope") or "").split())
    missing = set(SCOPES.split()) - granted
    if granted and missing:
        print(f"warning: Spotify did not grant {' '.join(sorted(missing))}", file=sys.stderr)
    print("Success. Add these lines to config/secrets.toml (gitignored), then restart the wall:\n")
    print(secrets_lines(client_id, client_secret, tokens["refresh_token"]))
    print('and enable the source in config/config.toml:\n\n[[source]]\nname = "music"\ntype = "spotify"\n'
          'client_id = "${SPOTIFY_CLIENT_ID}"\nclient_secret = "${SPOTIFY_CLIENT_SECRET}"\n'
          'refresh_token = "${SPOTIFY_REFRESH_TOKEN}"')
    return 0


if __name__ == "__main__":
    sys.exit(main())
