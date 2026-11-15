"""End to end, in process: the real Pool + Scheduler + every built-in adapter/rule running
config/config.example.toml (zero setup) put a non-null `news` on the wall and feed every ask panel."""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from ambient import wall
from ambient.config import load_config
from ambient.loader import load_builtins
from ambient.pool import Pool
from ambient.rules import heartbeat_down as hb
from ambient.scheduler import Scheduler

REPO = Path(__file__).resolve().parents[2]
EXAMPLE = REPO / "config" / "config.example.toml"


async def until(cond, timeout=5.0):
    loop = asyncio.get_running_loop()
    end = loop.time() + timeout
    while not cond():
        if loop.time() > end:
            raise AssertionError("condition not met in time")
        await asyncio.sleep(0.02)


@pytest.fixture
async def running(tmp_path):
    load_builtins()
    hb.reset_state()
    cfg = load_config(tmp_path, text=EXAMPLE.read_text(encoding="utf-8"))   # tmp: no secrets, no config.toml
    pool = Pool()                                                             # in-memory, no history
    sch = Scheduler(cfg, pool, data_dir=tmp_path, rule_start_delay_s=0)
    await sch.start()
    try:
        yield cfg, pool, sch
    finally:
        await sch.stop()
        hb.reset_state()


async def test_example_config_puts_news_on_the_wall(running):
    cfg, pool, sch = running
    assert {s.name: s.type for s in cfg.sources}["news"] == "demo"
    assert "news" in sch.rules and sch.rules["news"].inputs == ["news*.items"]

    def news_now():
        return wall.project(pool, sch.now(), cfg)["news"]
    await until(lambda: news_now() is not None)
    out = wall.project(pool, sch.now(), cfg)
    n = out["news"]
    assert set(n) == {"headline", "source", "published", "critical", "rank", "count"}
    assert n["source"] in ("CBC Ottawa", "CBC News") and n["critical"] is False
    assert 1 <= n["rank"] <= 3 and n["count"] == 5
    assert "news" not in out["stale"]
    top = pool.get("rules.news.top")
    assert top.visibility == "wall" and pool.get("rules.news.critical").value is False
    assert pool.get("news.items").visibility == "ask"                        # raw feed stays ask-only
    assert sch.rules_status()["news"]["last_error"] is None


async def test_example_config_feeds_every_ask_panel(running):
    cfg, pool, sch = running
    ask = cfg.raw.get("ask") or {}
    ids = {
        "forecast": ask.get("forecast", {}).get("daily", "weather.forecast.daily"),
        "calendar": ask.get("calendar", {}).get("today", "calendar.today"),
        "pulse": ask.get("pulse", {}).get("pulse", "github.pulse"),
        "finance": "finances.detail.expenses",
        "news": ask.get("news", {}).get("top", "rules.news.top"),
        "warnings": ask.get("warnings", {}).get("warnings", "weather.warnings"),
    }
    await until(lambda: all(pool.get(i) is not None for i in ids.values()))
    assert len(pool.get(ids["forecast"]).value) == 7
    assert 3 <= len(pool.get(ids["calendar"]).value) <= 4
    assert len(pool.get(ids["pulse"]).value) == 3
    assert pool.get("finances.detail.income").value and pool.get(ids["finance"]).value
    assert len(pool.get(ids["news"]).value) == 5
    assert pool.get(ids["warnings"]).value == []                             # none unless warnings = true
    assert len(pool.query("github.repo.*")) == 3
