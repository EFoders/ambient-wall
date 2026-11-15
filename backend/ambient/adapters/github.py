"""github: project pulse for a list of repos (ask-only by default). Read-only GitHub REST API.

    [[source]]
    name = "projects"
    type = "github"
    repos = ["you/ambient-wall", "you/homelab"]
    token = "${GITHUB_TOKEN}"        # optional; needed for private repos, raises the rate limit
    dormant_days = 30
    every = "30m"

Keys (visibility "ask" unless the source sets visibility = "wall"):
  repo.<owner>/<name>  {repo, url, pushed_at, last_commit: {sha, message, date, author}, days_since,
                        alive, dormant, private, open_issues}
  pulse                [same objects, most recently active first]

Two GETs per repo per cycle (60/h unauthenticated is enough for ~15 repos at 30 min).
A fine-grained token with read-only "Contents" + "Metadata" access is plenty.
"""
from __future__ import annotations

import asyncio
import re
from datetime import datetime
from typing import Any

from ..signal import utcnow
from ._shared import OptionError, SourceError, http_get_json, iso, opt, opt_duration
from .base import Adapter, register

API = "https://api.github.com"
_REPO = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def _dt(s: str | None) -> datetime | None:
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


@register("github")
class GitHub(Adapter):
    default_every = 1800.0

    def __init__(self, name: str, options: dict[str, Any], ctx):
        super().__init__(name, options, ctx)
        repos = opt(options, "repos", list, source=name)
        if not repos:
            raise OptionError(f"source {name!r}: repos is empty; e.g. repos = [\"owner/name\"]")
        for r in repos:
            if not isinstance(r, str) or not _REPO.match(r):
                raise OptionError(f"source {name!r}: repo {r!r} must look like \"owner/name\"")
        self.repos: list[str] = repos
        self.token = opt(options, "token", str, None, source=name) or None
        self.dormant_days = float(opt(options, "dormant_days", float, 30, source=name))
        self.timeout = opt_duration(options, "timeout", 15.0, source=name)
        self.visibility = options.get("visibility", "ask")

    def now(self) -> datetime:
        return utcnow()

    def headers(self) -> dict[str, str]:
        h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    async def one(self, repo: str, now: datetime) -> dict[str, Any]:
        info = await http_get_json(self.ctx.http, f"{API}/repos/{repo}", headers=self.headers(),
                                   timeout=self.timeout)
        branch = info.get("default_branch")
        last = None
        try:
            commits = await http_get_json(self.ctx.http, f"{API}/repos/{repo}/commits",
                                          params={"per_page": 1, **({"sha": branch} if branch else {})},
                                          headers=self.headers(), timeout=self.timeout)
            if commits:
                c = commits[0]
                cc = c.get("commit") or {}
                author = (cc.get("author") or {})
                last = {"sha": (c.get("sha") or "")[:7],
                        "message": (cc.get("message") or "").splitlines()[0][:120] if cc.get("message") else "",
                        "date": author.get("date") or (cc.get("committer") or {}).get("date"),
                        "author": author.get("name")}
        except SourceError as e:
            if "HTTP 409" not in str(e):        # 409 = empty repository
                raise
        pushed = _dt(info.get("pushed_at"))
        committed = _dt(last["date"]) if last and last.get("date") else None
        latest = max([d for d in (pushed, committed) if d], default=None)
        days = round((now - latest).total_seconds() / 86400, 1) if latest else None
        dormant = days is None or days > self.dormant_days
        return {"repo": info.get("full_name") or repo, "url": info.get("html_url"),
                "pushed_at": iso(pushed), "last_commit": last, "days_since": days,
                "alive": not dormant, "dormant": dormant, "private": bool(info.get("private")),
                "open_issues": info.get("open_issues_count")}

    async def fetch(self):
        now = self.now()
        results = await asyncio.gather(*(self.one(r, now) for r in self.repos), return_exceptions=True)
        out, errors, pulse = [], [], []
        for repo, res in zip(self.repos, results):
            if isinstance(res, Exception):
                errors.append(f"{repo}: {res}")
                continue
            pulse.append(res)
            out.append({"key": f"repo.{repo.lower()}", "value": res, "type": "object",
                        "visibility": self.visibility})
        self.status.extra["errors"] = errors
        if errors and not pulse:
            raise SourceError("; ".join(errors)[:400])
        pulse.sort(key=lambda p: p["days_since"] if p["days_since"] is not None else 1e9)
        out.append({"key": "pulse", "value": pulse, "type": "series", "visibility": self.visibility})
        return out
