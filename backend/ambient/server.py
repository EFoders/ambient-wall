"""FastAPI app: WebSocket /ws, REST /api/*, push endpoint, ask panels + command channel, album art,
static frontend.

    uvicorn ambient.server:create_app --factory      # paths from env (see Paths.from_env)
    python -m ambient                                # same, host/port from config

See ARCHITECTURE.md "WebSocket /ws" and "REST".
"""
from __future__ import annotations

import asyncio
import hmac
import inspect
import json
import logging
import os
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import ask, commands, loader, setup
from .art import ID_RE as ART_ID_RE
from .art import ArtCache
from .commands import CommandError, CommandHub
from .config import CAT_COATS, Config, load_config, redact
from .pool import Pool
from .pool_view import PoolView
from .scheduler import USER_AGENT, NotPushSource, Scheduler, UnknownSource
from .signal import Signal

log = logging.getLogger("ambient.server")

PROTOCOL_VERSION = 1
_BACKEND_DIR = Path(__file__).resolve().parents[1]

ProjectFn = Callable[[PoolView, datetime, Config], dict]


# ---------------------------------------------------------------------- paths
@dataclass
class Paths:
    config_dir: Path
    data_dir: Path
    frontend_dir: Path
    plugins_dir: Path

    @classmethod
    def from_env(cls) -> "Paths":
        """AMBIENT_*_DIR env vars; dev defaults are relative to backend/ (../config, ./data, ...)."""
        def p(var: str, default: Path) -> Path:
            v = os.environ.get(var)
            return Path(v) if v else default
        return cls(config_dir=p("AMBIENT_CONFIG_DIR", _BACKEND_DIR.parent / "config"),
                   data_dir=p("AMBIENT_DATA_DIR", _BACKEND_DIR / "data"),
                   frontend_dir=p("AMBIENT_FRONTEND_DIR", _BACKEND_DIR.parent / "frontend"),
                   plugins_dir=p("AMBIENT_PLUGINS_DIR", _BACKEND_DIR.parent / "plugins"))


# ---------------------------------------------------------------------- json
def _json_default(o: Any) -> Any:
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    if isinstance(o, BaseModel):
        return o.model_dump(mode="json")
    if isinstance(o, (set, frozenset, tuple)):
        return list(o)
    if isinstance(o, Path):
        return str(o)
    raise TypeError(f"not JSON serializable: {type(o).__name__}")


def dumps(o: Any) -> str:
    return json.dumps(o, default=_json_default, separators=(",", ":"), allow_nan=False)


def signal_json(s: Signal, now: datetime | None = None) -> dict[str, Any]:
    d = s.model_dump(mode="json")
    d["id"] = s.id
    d["stale"] = s.is_stale(now)
    return d


# ---------------------------------------------------------------------- wall hub
class WallHub:
    """Builds the `wall` message and fans it out: debounced after pool changes, and re-sent at least
    every `resend_s` so staleness and time-based projection changes reach the browser."""

    def __init__(self, build: Callable[[], dict[str, Any]], *, debounce_s: float = 0.25,
                 resend_s: float = 30.0):
        self.build = build                  # -> {"type": "wall", "ts": ..., "signals": {...}}
        self.debounce_s = debounce_s
        self.resend_s = resend_s
        self.gen = 0
        self.msg: str | None = None
        self.clients = 0
        self._last_signals: str | None = None
        self._dirty = asyncio.Event()
        self._cond = asyncio.Condition()
        self._task: asyncio.Task | None = None

    def mark_dirty(self, _changed: Any = None) -> None:
        self._dirty.set()

    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="wall-hub")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await self._task

    async def _run(self) -> None:
        while True:
            periodic = False
            try:
                await asyncio.wait_for(self._dirty.wait(), timeout=self.resend_s)
                await asyncio.sleep(self.debounce_s)        # coalesce bursts of changes
            except TimeoutError:
                periodic = True
            self._dirty.clear()
            if not self.clients:
                continue
            try:
                wall = self.build()
                sig = dumps(wall.get("signals"))
                msg = dumps(wall)
            except Exception:  # noqa: BLE001
                log.exception("building wall message failed")
                continue
            if sig == self._last_signals and not periodic:
                continue                                    # pool changed, projection didn't
            self._last_signals = sig
            async with self._cond:
                self.gen += 1
                self.msg = msg
                self._cond.notify_all()

    async def wait_newer(self, gen: int) -> tuple[int, str]:
        async with self._cond:
            await self._cond.wait_for(lambda: self.gen > gen and self.msg is not None)
            return self.gen, self.msg  # type: ignore[return-value]


# ---------------------------------------------------------------------- app
def _load_project() -> ProjectFn | None:
    try:
        from . import wall
    except ModuleNotFoundError as e:
        if e.name == "ambient.wall":
            log.warning("ambient/wall.py not found: /api/wall and the WebSocket send empty projections")
            return None
        raise
    return wall.project


def _now_playing_globs(cfg: Config) -> list[str]:
    """Signal ids whose `art_url` the art cache should fetch: the [wall] now_playing binding."""
    try:
        from . import wall
        b = wall.bindings(cfg).get("now_playing")
    except ImportError:
        b = (cfg.raw.get("wall") or {}).get("now_playing", "music.now")
    return [b] if isinstance(b, str) and b else []


def _accepts_art(fn: Callable) -> bool:
    try:
        return "art" in inspect.signature(fn).parameters
    except (TypeError, ValueError):
        return False


def _origin_allowed(origin: str | None, host: str | None, allowed: list[str]) -> bool:
    """Browsers always send Origin on WebSocket handshakes; non-browser clients usually don't.
    Allow no-Origin, same-host, and configured origins. Blocks random web pages on a LAN browser
    from reading the pool over ws://<box>:8700 (SPEC 1.4: data never leaves the network)."""
    if not origin:
        return True
    if "*" in allowed or origin in allowed:
        return True
    if origin == "null":
        return False
    o = urlsplit(origin)
    return bool(host) and o.netloc.lower() == host.lower()


_NO_BODY = object()     # json_post result for an empty body


async def json_post(request: Request) -> Any:
    """Shared guard for every POST: push auth (`[server] push_token` bearer, if set), the JSON-only
    content-type rule (also forces a CORS preflight from web pages), and the body size limit.
    Returns the parsed JSON body, or _NO_BODY when the body is empty."""
    c: Config = request.app.state.cfg
    if c.push_token_unresolved:
        raise HTTPException(503, "POST disabled: server.push_token references an unset secret")
    if c.push_token:
        auth = request.headers.get("authorization", "")
        scheme, _, token = auth.partition(" ")
        if scheme.lower() != "bearer" or not hmac.compare_digest(token.strip().encode(),
                                                                 c.push_token.encode()):
            raise HTTPException(401, "bad or missing bearer token", headers={"WWW-Authenticate": "Bearer"})
    ctype = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if ctype != "application/json":
        raise HTTPException(415, "Content-Type must be application/json")
    limit = int(c.server.get("max_body_bytes", 65536))
    clen = request.headers.get("content-length")
    if clen and clen.isdigit() and int(clen) > limit:
        raise HTTPException(413, f"body over {limit} bytes")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > limit:
            raise HTTPException(413, f"body over {limit} bytes")
    if not body.strip():
        return _NO_BODY
    try:
        return json.loads(body)
    except ValueError:
        raise HTTPException(400, "body is not valid JSON") from None


def _known_themes(frontend_dir: Path) -> set[str]:
    """Theme ids the frontend ships (frontend/themes/<id>.js); empty = accept any well-formed id."""
    d = frontend_dir / "themes"
    try:
        return {p.stem.lower() for p in d.glob("*.js")} if d.is_dir() else set()
    except OSError:
        return set()


def create_app(*, cfg: Config | None = None, paths: Paths | None = None, project: ProjectFn | None = None,
               http: httpx.AsyncClient | None = None, debounce_s: float = 0.25,
               resend_s: float = 30.0) -> FastAPI:
    paths = paths or Paths.from_env()

    async def start_runtime(app: FastAPI, cfg: Config) -> None:
        """Build and start everything that depends on the config: pool, scheduler, wall hub, album art,
        command hub. stop_runtime() tears it down again; setup (POST /api/setup) swaps the config by
        stopping one runtime and starting the next, without restarting the process."""
        project_fn = project or _load_project()
        pool = Pool(paths.data_dir, history_max_age_s=cfg.history_max_age_s)
        scheduler = Scheduler(cfg, pool, data_dir=paths.data_dir, http=http)
        st = app.state
        st.cfg, st.pool, st.scheduler, st.paths = cfg, pool, scheduler, paths
        st.last_projection = {}
        # album art: pulled by the backend, served from /api/art, never fetched by the browser
        art_http = http or httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0), follow_redirects=True,
                                             headers={"User-Agent": USER_AGENT})
        art = ArtCache(paths.data_dir / "art", art_http)
        st.art = art
        art_kw = {"art": art.url_for} if project_fn is not None and _accepts_art(project_fn) else {}

        def projection() -> dict[str, Any]:
            if project_fn is None:
                return {}
            try:
                st.last_projection = project_fn(pool, scheduler.now(), cfg, **art_kw)   # wall.py reads cfg.raw
            except Exception:  # noqa: BLE001 - keep serving the last good projection
                log.exception("wall projection failed")
            return st.last_projection

        def wall_message() -> dict[str, Any]:
            return {"type": "wall", "ts": scheduler.now().isoformat(), "signals": projection()}

        st.wall_message = wall_message
        hello = {"type": "hello", "version": PROTOCOL_VERSION, "settings": cfg.settings()}
        st.hello = dumps(hello)

        def hello_text() -> str:
            """hello, plus "setup": {"needed": true} while there is no config.toml (first run: the wall page
            opens the setup wizard). Checked per connection, so a config.toml made by hand counts at once."""
            if setup.needed(paths.config_dir):
                return dumps({**hello, "setup": {"needed": True}})
            return st.hello

        st.hello_text = hello_text
        hub = WallHub(wall_message, debounce_s=debounce_s, resend_s=resend_s)
        st.hub = hub
        unsubscribe = pool.subscribe(hub.mark_dirty)
        art.on_ready = hub.mark_dirty                   # new art on disk -> rebuild the projection
        await asyncio.to_thread(art.scan)
        unsubscribe_art = pool.subscribe(art.watch(lambda: _now_playing_globs(cfg)))

        def build_panel(name: str) -> dict[str, Any] | None:
            return ask.build_panel(name, pool, scheduler.now(), cfg)

        st.build_panel = build_panel
        st.commands = CommandHub(build_panel, known_themes=_known_themes(paths.frontend_dir), dumps=dumps)
        commands.bind(st.commands)

        await pool.start()
        await scheduler.start()
        hub.start()
        log.info("ambient wall up: %d sources, frontend %s", len(cfg.sources), paths.frontend_dir)

        async def stop() -> None:
            commands.bind(None)
            await hub.stop()
            unsubscribe()
            unsubscribe_art()
            await art.close()
            if art_http is not http:
                await art_http.aclose()
            await scheduler.stop()
            await pool.close()

        st.stop_runtime = stop

    async def reload_runtime(app: FastAPI, new_cfg: Config) -> None:
        """Apply a new config in process: every wall is told to reconnect (code 1013; it then gets the new
        hello), the old sources and rules stop, the new ones start. The pool starts empty, so nothing from the
        previous config (e.g. demo data) lingers on the wall."""
        st = app.state
        for client in list(st.commands.clients):
            client.kick()
        await st.stop_runtime()
        await start_runtime(app, new_cfg)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        nonlocal cfg
        if cfg is None:
            loader.load_all(paths.plugins_dir)
            cfg = load_config(paths.config_dir)
        app.state.setup_lock = asyncio.Lock()
        app.state.reload_runtime = lambda new_cfg: reload_runtime(app, new_cfg)
        await start_runtime(app, cfg)
        try:
            yield
        finally:
            await app.state.stop_runtime()

    app = FastAPI(title="Ambient Wall", version="0.2.0", lifespan=lifespan,
                  docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")

    # ------------------------------------------------------------------ REST
    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        return {"ok": True}

    @app.get("/api/wall")
    async def get_wall(request: Request) -> Response:
        return Response(dumps(request.app.state.wall_message()), media_type="application/json")

    @app.get("/api/signals")
    async def get_signals(request: Request, pattern: str = "*", stale: bool = False,
                          visibility: str | None = Query(None, pattern="^(wall|ask)$")) -> Response:
        pool: Pool = request.app.state.pool
        sigs = pool.query(pattern, include_stale=stale, visibility=visibility)
        return Response(dumps([signal_json(s) for s in sigs]), media_type="application/json")

    @app.get("/api/sources")
    async def get_sources(request: Request) -> list[dict[str, Any]]:
        sch: Scheduler = request.app.state.scheduler
        return [*sch.sources_status(),
                {"name": "rules", "type": "rules", "enabled": True, "every": None,
                 "rules": sch.rules_status()}]

    @app.post("/api/publish/{source}")
    async def publish(source: str, request: Request, body: Any = Depends(json_post)) -> dict[str, Any]:
        st = request.app.state
        if body is _NO_BODY:
            raise HTTPException(400, "body is not valid JSON")
        data = body
        items = data if isinstance(data, list) else [data]
        if not items or not all(isinstance(i, dict) for i in items):
            raise HTTPException(422, "send one object {\"key\":..., \"value\":...} or a list of them")
        try:
            changed = await st.scheduler.push(source, items)
        except UnknownSource:
            raise HTTPException(404, f"no source named {source!r}") from None
        except NotPushSource:
            raise HTTPException(409, f"source {source!r} is not an enabled type = \"push\" source") from None
        except (ValueError, TypeError) as e:
            raise HTTPException(422, redact(str(e))[:2000]) from None
        return {"ok": True, "accepted": len(items), "changed": len(changed)}

    @app.get("/api/art/{art_id}")
    async def get_art(art_id: str, request: Request) -> Response:
        """Cached album art by id (sha1 of its source URL). 404 for anything not in the cache."""
        hit = request.app.state.art.open(art_id) if ART_ID_RE.match(art_id) else None
        if hit is None:
            raise HTTPException(404, "no such image")
        path, ctype = hit
        return FileResponse(path, media_type=ctype, headers={
            "Cache-Control": "public, max-age=31536000, immutable",   # the id is the URL's hash
            "X-Content-Type-Options": "nosniff"})

    # ------------------------------------------------------------------ ask panels + commands
    @app.get("/api/ask")
    async def ask_list(request: Request) -> Response:
        st = request.app.state
        return Response(dumps(ask.panel_availability(st.pool, st.scheduler.now(), st.cfg)),
                        media_type="application/json")

    @app.get("/api/ask/{panel}")
    async def ask_panel(panel: str, request: Request) -> Response:
        if panel not in ask.PANELS:
            raise HTTPException(404, f"no ask panel {panel!r} (panels: {', '.join(ask.PANELS)})")
        return Response(dumps(request.app.state.build_panel(panel)), media_type="application/json")

    @app.post("/api/show/{panel}")
    async def show(panel: str, request: Request, body: Any = Depends(json_post)) -> dict[str, Any]:
        if body is _NO_BODY or body is None:
            body = {}
        if not isinstance(body, dict):
            raise HTTPException(422, 'body must be an object like {"duration": 20}, or empty')
        try:
            return request.app.state.commands.show(panel, body.get("duration"))
        except ask.UnknownPanel:
            raise HTTPException(404, f"no ask panel {panel!r} (panels: {', '.join(ask.PANELS)})") from None
        except CommandError as e:
            raise HTTPException(422, str(e)) from None

    @app.post("/api/dismiss")
    async def dismiss(request: Request, body: Any = Depends(json_post)) -> dict[str, Any]:
        return request.app.state.commands.dismiss()

    @app.post("/api/command")
    async def command(request: Request, body: Any = Depends(json_post)) -> dict[str, Any]:
        if not isinstance(body, dict):
            raise HTTPException(422, 'send {"name": "set_theme"|"set_mode"|"set_sound"|"set_cat", "args": {...}}')
        try:
            return request.app.state.commands.command(body.get("name"), body.get("args"))
        except CommandError as e:
            raise HTTPException(422, str(e)) from None

    # ------------------------------------------------------------------ first-run setup (ambient/setup.py)
    def setup_themes() -> list[str]:
        return sorted(_known_themes(paths.frontend_dir))

    async def setup_post(request: Request, body: Any = Depends(json_post)) -> Any:
        """The shared POST guard, then: only while there is no config.toml (first run), else 409."""
        if not setup.enabled():
            raise HTTPException(409, "the setup wizard is turned off (AMBIENT_SETUP=0)")
        if not setup.needed(paths.config_dir):
            raise HTTPException(409, "already set up: edit config/config.toml (and secrets.toml) instead")
        return {} if body is _NO_BODY else body

    def setup_http() -> tuple[httpx.AsyncClient, bool]:
        """The injected client (tests), else a short-lived one for one lookup."""
        if http is not None:
            return http, False
        return httpx.AsyncClient(timeout=httpx.Timeout(setup.UPSTREAM_TIMEOUT, connect=5.0),
                                 follow_redirects=True, headers={"User-Agent": USER_AGENT}), True

    @app.get("/api/setup")
    async def setup_state(request: Request) -> dict[str, Any]:
        """What the wizard needs to start. Never a secret value: only which secret names already exist."""
        c: Config = request.app.state.cfg
        needed = setup.needed(paths.config_dir)
        have = setup.secret_names_present(paths.config_dir) if needed else []
        return {"needed": needed, "enabled": setup.enabled(),
                "running": c.path.name if c.path else None, "config_dir": str(paths.config_dir),
                "writable": setup.writable(paths.config_dir), "themes": setup_themes(),
                "coats": list(CAT_COATS), "secrets_present": have}

    @app.post("/api/setup/geocode")
    async def setup_geocode(body: Any = Depends(setup_post)) -> dict[str, Any]:
        try:
            q = setup.clean_query(body.get("q") if isinstance(body, dict) else None)
        except ValueError as e:
            raise HTTPException(422, str(e)) from None
        client, own = setup_http()
        try:
            return {"results": await setup.geocode(client, q)}
        except setup.SetupError as e:
            raise HTTPException(502, str(e)) from None
        finally:
            if own:
                await client.aclose()

    @app.post("/api/setup/ec-site")
    async def setup_ec_site(body: Any = Depends(setup_post)) -> dict[str, Any]:
        lat, lon = (body.get("lat"), body.get("lon")) if isinstance(body, dict) else (None, None)
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in (lat, lon)) \
                or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise HTTPException(422, 'send {"lat": number, "lon": number}')
        client, own = setup_http()
        try:
            sites = await setup.ec_sites(client)
        except setup.SetupError as e:
            raise HTTPException(502, str(e)) from None
        finally:
            if own:
                await client.aclose()
        return {"sites": setup.nearest_sites(sites, float(lat), float(lon))}

    @app.post("/api/setup/test-feed")
    async def setup_test_feed(body: Any = Depends(setup_post)) -> dict[str, Any]:
        errs = setup._Errors()
        url = setup._url(body.get("url") if isinstance(body, dict) else None, "url", errs)
        if url is None:
            raise HTTPException(422, errs[0]["message"] if errs else 'send {"url": "https://..."}')
        client, own = setup_http()
        try:
            return await setup.test_feed(client, url)
        finally:
            if own:
                await client.aclose()

    async def setup_checked(body: Any) -> tuple[dict[str, Any], str, str, list[dict[str, str]]]:
        form, errors = setup.parse_form(body, themes=set(setup_themes()))
        if errors:
            return form, "", "", errors
        try:
            text, secrets_text, errors = await asyncio.to_thread(setup.check, form, paths.config_dir,
                                                                 themes=setup_themes())
        except setup.WriteError as e:
            return form, "", "", [{"field": "review", "message": f"{e}. {e.hint}"}]
        return form, text, secrets_text, errors

    @app.post("/api/setup/preview")
    async def setup_preview(body: Any = Depends(setup_post)) -> dict[str, Any]:
        """Validate the answers and show the config.toml they make (secrets only by name)."""
        form, text, _, errors = await setup_checked(body)
        return {"ok": not errors, "errors": errors, "config_toml": text,
                "secrets": sorted(setup.secrets_of(form)) if form and not errors else []}

    @app.post("/api/setup")
    async def setup_save(request: Request, body: Any = Depends(setup_post)) -> JSONResponse:
        """Validate, write config.toml (+ secrets.toml), then apply it in process (reload_runtime)."""
        st = request.app.state
        async with st.setup_lock:                       # two phones pressing Save at once: one wins
            if not setup.needed(paths.config_dir):
                raise HTTPException(409, "already set up: edit config/config.toml (and secrets.toml) instead")
            form, text, secrets_text, errors = await setup_checked(body)
            if errors:
                return JSONResponse({"ok": False, "errors": errors}, status_code=422)
            has_secrets = bool(setup.secrets_of(form))
            try:
                written = await asyncio.to_thread(setup.write_files, paths.config_dir, text,
                                                  secrets_text if has_secrets else None)
            except setup.WriteError as e:
                # never a dead end: hand the files back so they can be put in place by hand
                return JSONResponse({"ok": False, "write_error": str(e), "hint": e.hint, "config_toml": text,
                                     "secrets_toml": secrets_text if has_secrets else None,
                                     "config_dir": str(paths.config_dir)}, status_code=500)
            except FileExistsError:
                raise HTTPException(409, "already set up: edit config/config.toml (and secrets.toml) instead") from None
            try:
                new_cfg = load_config(paths.config_dir)
                await st.reload_runtime(new_cfg)
                applied, note = True, None
            except Exception as e:  # noqa: BLE001 - the files are written; a restart applies them
                log.exception("setup: applying the new config failed; restart the wall to load it")
                applied, note = False, f"saved, but applying it failed ({type(e).__name__}): restart the wall"
            return JSONResponse({"ok": True, "applied": applied, "written": written, "note": note,
                                 "sources": [s.name for s in st.cfg.sources]})

    # ------------------------------------------------------------------ WebSocket
    @app.websocket("/ws")
    async def ws_endpoint(ws: WebSocket) -> None:
        st = ws.app.state
        allowed = list(st.cfg.server.get("allowed_origins") or [])
        if not _origin_allowed(ws.headers.get("origin"), ws.headers.get("host"), allowed):
            log.warning("websocket from origin %r refused (add it to [server] allowed_origins)",
                        ws.headers.get("origin"))
            await ws.close(code=1008)
            return
        hub: WallHub = st.hub
        cmds: CommandHub = st.commands
        await ws.accept()
        hub.clients += 1
        client = cmds.register()
        tasks: list[asyncio.Task] = []
        try:
            await ws.send_text(st.hello_text())
            await ws.send_text(dumps(st.wall_message()))
            replay = cmds.replay()                      # a reloaded wall keeps showing the panel
            if replay is not None:
                await ws.send_text(replay)
            gen = hub.gen
            recv = asyncio.create_task(_drain(ws))
            wall_t = asyncio.create_task(hub.wait_newer(gen))
            cmd_t = asyncio.create_task(client.queue.get())
            tasks = [recv, wall_t, cmd_t]
            while True:
                done, _ = await asyncio.wait({recv, wall_t, cmd_t}, return_when=asyncio.FIRST_COMPLETED)
                if recv in done:
                    break
                if cmd_t in done:
                    msg = cmd_t.result()
                    if msg is None:                     # cut off by the hub (outbox overflow)
                        await ws.close(code=1013)
                        break
                    await ws.send_text(msg)
                    cmd_t = asyncio.create_task(client.queue.get())
                if wall_t in done:
                    gen, msg = wall_t.result()
                    await ws.send_text(msg)
                    wall_t = asyncio.create_task(hub.wait_newer(gen))
                tasks = [recv, wall_t, cmd_t]
        except (WebSocketDisconnect, RuntimeError, ConnectionError):
            pass
        finally:
            hub.clients -= 1
            cmds.unregister(client)
            for t in tasks:
                t.cancel()

    # ------------------------------------------------------------------ static frontend (last)
    if paths.frontend_dir.is_dir():
        app.mount("/", StaticFiles(directory=paths.frontend_dir, html=True), name="frontend")
    else:
        log.warning("frontend dir %s not found; only the API is served", paths.frontend_dir)

        @app.get("/")
        async def no_frontend() -> JSONResponse:
            return JSONResponse({"ok": True, "frontend": None})

    return app


async def _drain(ws: WebSocket) -> None:
    """Read and ignore client frames; returns when the client disconnects."""
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                return
    except (WebSocketDisconnect, RuntimeError):
        return
