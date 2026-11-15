import asyncio
import logging

import pytest

from ambient.adapters.base import Adapter
from ambient.config import build_config
from ambient.pool import Pool
from ambient.rules.base import Rule
from ambient.scheduler import NotPushSource, Scheduler, UnknownSource


class Fake(Adapter):
    default_every = 0.02
    calls = 0

    async def fetch(self):
        type(self).calls += 1
        return [{"key": "count", "value": self.options.get("value", 7)},
                {"key": "meta.thing", "value": "x", "meta": {"a": 1}}]


class Crashy(Adapter):
    async def start(self):
        raise RuntimeError("cannot start")


REG = {"fake": Fake, "crashy": Crashy}


def make(doc, rules=None, **kw):
    cfg = build_config(doc, known_types=set(REG) | {"push"})
    pool = Pool()
    return Scheduler(cfg, pool, registry=REG, rules=rules or {}, rule_start_delay_s=0, **kw), pool


async def until(cond, timeout=2.0):
    loop = asyncio.get_running_loop()
    end = loop.time() + timeout
    while not cond():
        if loop.time() > end:
            raise AssertionError("condition not met in time")
        await asyncio.sleep(0.005)


async def test_sources_emit_coerced_signals():
    sch, pool = make({"source": [
        {"name": "f", "type": "fake", "every": "50ms", "visibility": "ask", "value": 3},
        {"name": "off", "type": "fake", "enabled": False},
    ]})
    await sch.start()
    try:
        await until(lambda: pool.get("f.count") is not None)
        s = pool.get("f.count")
        assert s.source == "f" and s.value == 3 and s.type == "number"
        assert s.visibility == "ask" and s.ttl_s == pytest.approx(0.15)
        assert pool.get("f.meta.thing").meta == {"a": 1}
        assert pool.query("off.*", include_stale=True) == []
        st = {x["name"]: x for x in sch.sources_status()}
        assert st["f"]["running"] and st["f"]["every"] == 0.05
        assert not st["off"]["enabled"] and st["off"]["disabled_reason"] == "enabled = false"
        await until(lambda: st["f"]["status"]["signals_emitted"] >= 0 and
                    sch.sources["f"].status.last_ok is not None)
    finally:
        await sch.stop()
    assert all(t.done() for t in sch._tasks) or not sch._tasks


async def test_adapter_start_crash_is_recorded_not_fatal(caplog):
    sch, pool = make({"source": [{"name": "c", "type": "crashy"}, {"name": "f", "type": "fake"}]})
    await sch.start()
    try:
        await until(lambda: sch.sources["c"].status.last_error is not None)
        assert "cannot start" in sch.sources["c"].status.last_error
        await until(lambda: pool.get("f.count") is not None)
    finally:
        await sch.stop()


async def test_rules_trigger_on_change_and_cascade():
    seen = []

    def double(pool, now, cfg):
        seen.append(("double", now.tzinfo is not None, cfg))
        c = pool.get("f.count")
        return [{"key": "doubled", "value": c.value * 2}] if c else []

    def plus_one(pool, now, cfg):
        d = pool.get("rules.doubled")
        return [{"key": "plus", "value": d.value + 1}] if d else []

    rules = {"double": Rule("double", ["f.count"], double, None),
             "plus": Rule("plus", ["rules.doubled"], plus_one, None)}
    sch, pool = make({"source": [{"name": "f", "type": "fake", "every": "1h", "value": 5}],
                      "rules": {"double": {"k": 1}}}, rules=rules)
    await sch.start()
    try:
        await until(lambda: pool.get("rules.plus") is not None)
        assert pool.get("rules.doubled").value == 10 and pool.get("rules.plus").value == 11
        assert pool.get("rules.plus").source == "rules"
        assert seen[0] == ("double", True, {"k": 1})
        # an unchanged refresh does not re-run rules
        runs = sch.rules["double"].runs
        await sch.ingest([pool.get("f.count").model_copy()])
        assert sch.rules["double"].runs == runs
    finally:
        await sch.stop()


async def test_loop_guard_self_and_mutual():
    n = {"self": 0, "x": 0, "y": 0}

    def selfish(pool, now, cfg):        # input matches its own output and always changes it
        n["self"] += 1
        return [{"key": "self.count", "value": n["self"]}]

    def x(pool, now, cfg):
        n["x"] += 1
        return [{"key": "x", "value": n["x"]}]

    def y(pool, now, cfg):
        n["y"] += 1
        return [{"key": "y", "value": n["y"]}]

    rules = {"self": Rule("self", ["rules.self.*", "src.go"], selfish, None),
             "x": Rule("x", ["rules.y", "src.go"], x, None),
             "y": Rule("y", ["rules.x"], y, None)}
    sch, pool = make({}, rules=rules)
    await sch.start()
    try:
        from ambient.signal import coerce
        await sch.ingest([coerce({"key": "go", "value": 1}, source="src")])
        assert n["self"] == 1             # not re-triggered by its own output
        assert n["x"] == 1 and n["y"] == 1   # x -> y, but y's output may not re-run x in this pass
    finally:
        await sch.stop()


async def test_cascade_depth_cap(caplog):
    ran = []

    def mk(i):
        def fn(pool, now, cfg):
            ran.append(i)
            return [{"key": f"r{i}", "value": 1}]
        return Rule(f"r{i}", ["src.go"] if i == 0 else [f"rules.r{i - 1}"], fn, None)

    rules = {f"r{i}": mk(i) for i in range(10)}
    sch, pool = make({}, rules=rules, max_cascade=3)
    await sch.start()
    try:
        from ambient.signal import coerce
        with caplog.at_level(logging.WARNING, logger="ambient.scheduler"):
            await sch.ingest([coerce({"key": "go", "value": 1}, source="src")])
        assert ran == [0, 1, 2]
        assert "cascade depth" in caplog.text
    finally:
        await sch.stop()


async def test_failing_rule_logs_and_others_continue(caplog):
    def bad(pool, now, cfg):
        raise ValueError("nope")

    def good(pool, now, cfg):
        return [{"key": "good", "value": True}]

    async def agood(pool, now, cfg):
        return [{"key": "agood", "value": 1}]

    rules = {"bad": Rule("bad", ["src.*"], bad, None), "good": Rule("good", ["src.*"], good, None),
             "agood": Rule("agood", ["src.*"], agood, None)}
    sch, pool = make({}, rules=rules)
    await sch.start()
    try:
        from ambient.signal import coerce
        with caplog.at_level(logging.ERROR, logger="ambient.scheduler"):
            await sch.ingest([coerce({"key": "go", "value": 1}, source="src")])
        assert pool.get("rules.good").value is True and pool.get("rules.good").type == "status"
        assert pool.get("rules.agood").value == 1
        assert "rule bad failed" in caplog.text
        assert "nope" in sch.rules_status()["bad"]["last_error"]
    finally:
        await sch.stop()


async def test_rule_every_and_config_disable_and_ttl():
    ticks = []

    def tick(pool, now, cfg):
        ticks.append(now)
        return [{"key": "tick", "value": len(ticks)}]

    def never(pool, now, cfg):
        raise AssertionError("disabled rule ran")

    rules = {"tick": Rule("tick", [], tick, 0.02), "never": Rule("never", ["*"], never, 0.01)}
    sch, pool = make({"rules": {"never": {"enabled": False}}}, rules=rules)
    await sch.start()
    try:
        await until(lambda: len(ticks) >= 3)
        assert "never" not in sch.rules
        assert pool.get("rules.tick").ttl_s == pytest.approx(0.06)
    finally:
        await sch.stop()


async def test_push():
    sch, pool = make({"source": [{"name": "phone", "type": "push", "ttl": "30m", "visibility": "ask"},
                                 {"name": "f", "type": "fake", "every": "1h"},
                                 {"name": "dead", "type": "push", "enabled": False}]})
    await sch.start()
    try:
        changed = await sch.push("phone", [{"key": "battery", "value": 81}, {"key": "loc", "value": "home"}])
        assert len(changed) == 2
        s = pool.get("phone.battery")
        assert s.ttl_s == 1800 and s.visibility == "ask" and s.source == "phone"
        assert await sch.push("phone", [{"key": "battery", "value": 81}]) == []
        assert sch.sources["phone"].status.signals_emitted == 3
        with pytest.raises(UnknownSource):
            await sch.push("nope", [{"key": "a", "value": 1}])
        with pytest.raises(NotPushSource):
            await sch.push("f", [{"key": "a", "value": 1}])
        with pytest.raises(NotPushSource):
            await sch.push("dead", [{"key": "a", "value": 1}])
        with pytest.raises(ValueError):
            await sch.push("phone", [{"value": 1}])
        with pytest.raises(ValueError):            # bad visibility
            await sch.push("phone", [{"key": "a", "value": 1, "visibility": "nope"}])
        # cannot spoof another source's namespace
        await sch.push("phone", [{"key": "spoof", "value": 1, "source": "finances"}])
        assert pool.get("phone.spoof") and not pool.get("finances.spoof")
    finally:
        await sch.stop()


async def test_rule_inputs_override_from_config():
    ran = []

    def wx(pool, now, cfg):
        ran.append(cfg.get("source"))
        return []

    rules = {"wx": Rule("wx", ["weather.*"], wx, None)}
    sch, pool = make({"rules": {"wx": {"inputs": ["envcan.*"], "source": "envcan"}}}, rules=rules)
    await sch.start()
    try:
        from ambient.signal import coerce
        await sch.ingest([coerce({"key": "now.temp_c", "value": 3}, source="weather")])
        assert ran == []                                   # decorator glob replaced, not extended
        await sch.ingest([coerce({"key": "now.temp_c", "value": 3}, source="envcan")])
        assert ran == ["envcan"]
        assert sch.rules_status()["wx"]["inputs"] == ["envcan.*"]
    finally:
        await sch.stop()


def test_rule_inputs_must_be_globs():
    from ambient.config import ConfigError
    with pytest.raises(ConfigError, match="inputs must be a list"):
        build_config({"rules": {"wx": {"inputs": "envcan.*"}}}, known_types=set())
