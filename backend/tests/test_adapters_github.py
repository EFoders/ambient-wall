"""github adapter against fixture responses. No live network."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest

from ambient.adapters._shared import OptionError, SourceError
from ambient.adapters.base import AdapterContext
from ambient.adapters.github import GitHub

FIX = Path(__file__).parent / "fixtures"


def make(handler, **opts):
    ctx = AdapterContext(http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
                         log=logging.getLogger("test"), data_dir=Path("."), settings={})
    a = GitHub("projects", {"repos": ["you/ambient-wall"], **opts}, ctx)
    a.now = lambda: datetime(2026, 10, 9, 22, 5, tzinfo=timezone.utc)
    return a


def gh(seen, status=200):
    repo = json.loads((FIX / "github_repo.json").read_text())
    commits = json.loads((FIX / "github_commits.json").read_text())

    def handler(req):
        seen.append((str(req.url), req.headers.get("authorization")))
        if status != 200:
            return httpx.Response(status)
        if req.url.path == "/repos/you/ambient-wall":
            return httpx.Response(200, json=repo)
        if req.url.path == "/repos/you/ambient-wall/commits":
            assert req.url.params["sha"] == "main"
            return httpx.Response(200, json=commits)
        if req.url.path == "/repos/you/empty":
            return httpx.Response(200, json={**repo, "full_name": "you/empty", "pushed_at": None})
        if req.url.path == "/repos/you/empty/commits":
            return httpx.Response(409)
        return httpx.Response(404)
    return handler


async def test_pulse_alive_with_token():
    seen = []
    a = make(gh(seen), token="ghp_SEKRET")
    items = {i["key"]: i for i in await a.fetch()}
    r = items["repo.you/ambient-wall"]
    assert r["visibility"] == "ask"
    v = r["value"]
    assert v["alive"] is True and v["dormant"] is False and v["days_since"] == 1.0
    assert v["last_commit"] == {"sha": "4f2a9c1", "message": "Add source adapters",
                                "date": "2026-10-08T22:05:00Z", "author": "Alex"}
    assert v["pushed_at"] == "2026-10-08T22:10:00+00:00" and v["private"] is True
    assert items["pulse"]["value"] == [v]
    assert all(h == "Bearer ghp_SEKRET" for _, h in seen)


async def test_dormant_empty_repo_and_partial_failure():
    seen = []
    a = make(gh(seen), repos=["you/ambient-wall", "you/empty", "you/missing"], dormant_days=0.5)
    items = {i["key"]: i for i in await a.fetch()}
    assert items["repo.you/ambient-wall"]["value"]["dormant"] is True     # 1 day > 0.5
    empty = items["repo.you/empty"]["value"]
    assert empty["last_commit"] is None and empty["dormant"] is True and empty["days_since"] is None
    assert "repo.you/missing" not in items
    assert any("you/missing" in e and "404" in e for e in a.status.extra["errors"])
    assert all(h is None for _, h in seen)                                   # no token configured


async def test_all_fail_is_an_error():
    with pytest.raises(SourceError, match="HTTP 403"):
        await make(gh([], status=403)).fetch()


def test_options():
    with pytest.raises(OptionError, match="repos"):
        make(gh([]), repos=[])
    with pytest.raises(OptionError, match="owner/name"):
        make(gh([]), repos=["https://github.com/you/x"])
