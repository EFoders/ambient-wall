# syntax=docker/dockerfile:1
# Ambient Wall backend. Build context = repo root:  docker compose up -d --build
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

# ping for the heartbeat source. File capability cap_net_raw lets the non-root user open raw ICMP
# sockets, as long as the container keeps NET_RAW in its bounding set (compose: cap_add: [NET_RAW]).
RUN apt-get update \
 && apt-get install -y --no-install-recommends iputils-ping libcap2-bin tzdata \
 && setcap cap_net_raw+ep "$(command -v ping)" \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --system --uid 10001 --user-group --create-home --home-dir /home/wall wall \
 && mkdir -p /data /config /app/plugins /app/scripts \
 && chown wall:wall /data /config

WORKDIR /app

# Dependencies first (cached until pyproject.toml / uv.lock change), then the package itself.
# The google extra is installed so the google_sheet_finances source works in the container.
COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --extra google --no-install-project
COPY backend/ambient ./ambient
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --extra google

COPY frontend ./frontend
# Fallback config so the image runs standalone; compose mounts ./config over /config.
COPY config/config.example.toml /config/config.example.toml

ENV PATH="/app/.venv/bin:$PATH" \
    AMBIENT_CONFIG_DIR=/config \
    AMBIENT_DATA_DIR=/data \
    AMBIENT_FRONTEND_DIR=/app/frontend \
    AMBIENT_PLUGINS_DIR=/app/plugins \
    AMBIENT_SCRIPTS_DIR=/app/scripts \
    AMBIENT_LOG=INFO \
    TZ=UTC

USER wall
EXPOSE 8700
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('AMBIENT_PORT', '8700'), timeout=4)" || exit 1

CMD ["ambient"]
