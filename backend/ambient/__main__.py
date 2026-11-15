"""`uv run ambient` / `python -m ambient`: load plugins + config, serve on [server] host/port.

Env: AMBIENT_CONFIG_DIR, AMBIENT_DATA_DIR, AMBIENT_FRONTEND_DIR, AMBIENT_PLUGINS_DIR (dev defaults
../config, ./data, ../frontend, ../plugins relative to backend/), AMBIENT_LOG (log level, default
INFO), AMBIENT_HOST / AMBIENT_PORT (override [server] host/port), AMBIENT_RELOAD=1 (dev: uvicorn
--reload watching the ambient package; used by compose.dev.yaml).
"""
from __future__ import annotations

import logging
import os
import sys


def setup_logging() -> None:
    from .config import RedactFilter

    level = os.environ.get("AMBIENT_LOG", "INFO").upper()
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s",
                                           "%Y-%m-%d %H:%M:%S"))
    handler.addFilter(RedactFilter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level if level in logging.getLevelNamesMapping() else "INFO")
    # uvicorn's loggers propagate to root (we pass log_config=None); keep access logs quieter.
    logging.getLogger("uvicorn.access").setLevel(max(root.level, logging.WARNING))
    logging.getLogger("httpx").setLevel(max(root.level, logging.WARNING))


def app_factory():
    """uvicorn factory for reload mode (each worker re-loads plugins and config in its lifespan)."""
    from .server import create_app

    setup_logging()
    return create_app()


def main() -> None:
    import uvicorn

    from . import loader
    from .config import ConfigError, load_config
    from .server import Paths, create_app

    setup_logging()
    log = logging.getLogger("ambient")
    paths = Paths.from_env()
    report = loader.load_all(paths.plugins_dir)
    if report.failed:
        log.warning("%d module(s) failed to load: %s", len(report.failed), ", ".join(report.failed))
    try:
        cfg = load_config(paths.config_dir)
    except ConfigError as e:
        log.error("%s", e)
        sys.exit(2)
    host = os.environ.get("AMBIENT_HOST") or cfg.server["host"]
    port = int(os.environ.get("AMBIENT_PORT") or cfg.server["port"])
    common = dict(host=host, port=port, log_config=None, proxy_headers=False,
                  ws_ping_interval=20, ws_ping_timeout=20)
    if os.environ.get("AMBIENT_RELOAD") in ("1", "true", "yes"):
        pkg_dir = os.path.dirname(os.path.abspath(__file__))
        uvicorn.run("ambient.__main__:app_factory", factory=True, reload=True,
                    reload_dirs=[pkg_dir, str(paths.plugins_dir)], **common)
        return
    uvicorn.run(create_app(cfg=cfg, paths=paths), **common)


if __name__ == "__main__":
    main()
