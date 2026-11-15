from datetime import timedelta

import pytest

from ambient.pool import Pool
from ambient.signal import Signal, coerce, utcnow


def sig(key, value, *, source="s", ttl_s=None, ts=None, visibility="wall", type=None):
    d = {"key": key, "value": value, "visibility": visibility}
    if ts is not None:
        d["ts"] = ts
    if type is not None:
        d["type"] = type
    return coerce(d, source=source, ttl_s=ttl_s)


async def test_change_detection():
    p = Pool()
    a = sig("a", 1)
    assert await p.publish([a]) == [a]                       # new -> change
    a2 = sig("a", 1)
    assert await p.publish([a2]) == []                       # same value -> ts refresh only
    assert p.get("s.a").ts == a2.ts
    a3 = sig("a", 2)
    assert [s.id for s in await p.publish([a3])] == ["s.a"]  # value change
    assert await p.publish([sig("a", 2, visibility="ask")])  # visibility change
    assert await p.publish([sig("a", "2")])                   # type change (number -> string)
    assert await p.publish([sig("a", "2", type="status")])    # explicit type change


async def test_stale_previous_counts_as_change_and_is_hidden():
    p = Pool()
    old = sig("t", 5, ttl_s=10, ts=utcnow() - timedelta(seconds=60))
    await p.publish([old])
    assert p.get("s.t") is None
    assert p.get("s.t", include_stale=True) is old
    assert p.query("s.*") == []
    assert p.query("s.*", include_stale=True) == [old]
    fresh = sig("t", 5, ttl_s=10)
    assert await p.publish([fresh]) == [fresh]               # same value, but previous was stale
    assert p.get("s.t") is fresh


async def test_duplicate_ids_in_one_publish_report_last():
    p = Pool()
    out = await p.publish([sig("a", 1), sig("a", 2)])
    assert len(out) == 1 and out[0].value == 2


async def test_query_glob_visibility_sorted():
    p = Pool()
    await p.publish([sig("host.b", 1, source="hb"), sig("host.a", 1, source="hb"),
                     sig("x", 1, source="fin", visibility="ask")])
    assert [s.id for s in p.query("hb.host.*")] == ["hb.host.a", "hb.host.b"]
    assert [s.id for s in p.query(visibility="ask")] == ["fin.x"]
    assert len(p.query()) == 3


async def test_subscribe_sync_async_unsubscribe_and_bad_subscriber():
    p = Pool()
    got_sync, got_async = [], []

    def bad(_):
        raise RuntimeError("boom")

    async def asub(changed):
        got_async.extend(changed)

    p.subscribe(bad)
    unsub = p.subscribe(lambda changed: got_sync.extend(changed))
    p.subscribe(asub)
    await p.publish([sig("a", 1)])
    await p.publish([sig("a", 1)])                            # no change -> no callback
    assert [s.value for s in got_sync] == [1] and [s.value for s in got_async] == [1]
    unsub()
    await p.publish([sig("a", 2)])
    assert len(got_sync) == 1 and len(got_async) == 2


async def test_publish_rejects_dicts():
    with pytest.raises(TypeError):
        await Pool().publish([{"key": "a", "value": 1}])


async def test_history_appends_changes_only_and_prunes(tmp_path):
    p = Pool(tmp_path, history_max_age_s=3600, flush_delay_s=0)
    await p.start()
    try:
        await p.publish([sig("a", 1)])
        await p.publish([sig("a", 1)])                        # refresh: not recorded
        await p.publish([sig("a", {"n": 2})])
        await p.publish([sig("a", 3, ts=utcnow() - timedelta(hours=5))])   # old observation
        rows = await p.history("s.a")
        assert [r["value"] for r in rows] == [3, 1, {"n": 2}]          # oldest observation first
        assert len(rows) == 3
        assert await p.prune() == 1
        assert [r["value"] for r in await p.history("s.a")] == [1, {"n": 2}]
    finally:
        await p.close()
    assert (tmp_path / "history.db").is_file()


async def test_history_survives_restart(tmp_path):
    p = Pool(tmp_path, flush_delay_s=0)
    await p.start()
    await p.publish([sig("a", 1)])
    await p.close()                                           # close flushes pending rows
    p2 = Pool(tmp_path)
    await p2.start()
    try:
        assert [r["value"] for r in await p2.history("s.a")] == [1]
    finally:
        await p2.close()


def test_no_data_dir_means_no_history():
    p = Pool()
    assert not p.history_enabled


def test_signal_is_a_poolview():
    from ambient.pool_view import PoolView

    def takes_view(v: PoolView):
        return v.get("x"), v.query("*")

    assert takes_view(Pool()) == (None, [])
    assert isinstance(sig("a", 1), Signal)
