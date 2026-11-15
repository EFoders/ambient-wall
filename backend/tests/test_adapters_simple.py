"""demo, file, push, http_json, command, ping adapters. No live network."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

from ambient.adapters._shared import OptionError, SourceError, redact_url
from ambient.adapters.base import AdapterContext
from ambient.adapters.command import Command, parse_output
from ambient.adapters.demo import WEATHER, Demo
from ambient.adapters.file import FileSource
from ambient.adapters.http_json import HttpJson
from ambient.adapters.ping import Ping, parse_ping, ping_argv
from ambient.adapters.push import PushSource
from ambient.signal import coerce

SETTINGS = {"location": {"lat": 45.898, "lon": -77.283, "timezone": "America/Toronto"}}
REPO = Path(__file__).resolve().parents[2]


def make_ctx(tmp_path: Path | None = None, handler=None) -> AdapterContext:
    transport = httpx.MockTransport(handler or (lambda r: httpx.Response(599)))
    return AdapterContext(http=httpx.AsyncClient(transport=transport), log=logging.getLogger("test"),
                          data_dir=tmp_path or Path("."), settings=SETTINGS)


def by_key(items):
    return {i["key"]: i for i in items}


def check_coerces(name, items):
    for it in items:
        coerce(it, source=name)


# ---------------------------------------------------------------------- demo
async def test_demo_all_parts_default_values():
    d = Demo("demo", {}, make_ctx())
    items = await d.fetch()
    check_coerces("demo", items)
    k = by_key(items)
    assert set(k) >= {"next", "host.homelab", "host.main-pc", "month", "now.temp_c", "now.condition",
                      "now.intensity", "now.wind_kph", "now.feels_like_c", "now.summary",
                      "precip.next_minutes", "precip.kind", "forecast.daily"}
    nxt = k["next"]["value"]
    start = datetime.fromisoformat(nxt["start"])
    assert 46 <= (start - datetime.now(timezone.utc)).total_seconds() / 60 <= 47.1
    assert nxt["title"] == "Ops sync"
    assert k["host.homelab"]["value"]["up"] is True and k["host.homelab"]["type"] == "status"
    m = k["month"]["value"]
    assert (m["income"], m["spent"], m["net"], m["balance"]) == (6420, 3985, 2435, 20675)
    assert re.fullmatch(r"\d{4}-\d{2}", m["month"])
    # overcast is the default: cloudy 0.8, and "Rain in 20 min"
    assert k["now.condition"]["value"] == "cloudy" and k["now.intensity"]["value"] == 0.8
    assert k["precip.next_minutes"]["value"] == 20 and k["precip.kind"]["value"] == "rain"
    assert k["forecast.daily"]["visibility"] == "ask"


async def test_demo_parts_follow_source_name():
    items = await Demo("weather", {"weather": "snow"}, make_ctx()).fetch()
    assert all(i["key"].startswith(("now.", "precip.", "forecast.")) or i["key"] == "warnings" for i in items)
    k = by_key(items)
    assert k["now.condition"]["value"] == "snow" and k["now.temp_c"]["value"] == -6
    assert k["precip.next_minutes"]["value"] is None
    assert [i["key"] for i in await Demo("heartbeat", {}, make_ctx()).fetch()] == ["host.homelab", "host.main-pc"]


def test_demo_presets_match_core_js():
    core = REPO / "frontend" / "js" / "core.js"
    if not core.exists():
        pytest.skip("frontend not present")
    text = core.read_text(encoding="utf-8")
    found = re.findall(r'\{ name: "(\w+)", condition: "(\w+)", intensity: ([\d.]+), windKph: (\d+), '
                       r'tempC: (-?\d+)', text)
    assert found, "WEATHER presets not found in core.js"
    ours = [(w["name"], w["condition"], w["intensity"], w["wind_kph"], w["temp_c"]) for w in WEATHER]
    theirs = [(n, c, float(i), int(wk), int(t)) for n, c, i, wk, t in found]
    assert ours == theirs


async def test_demo_cycle_homelab_down_and_finance():
    d = Demo("demo", {"weather": "cycle", "cycle_every": "60s", "homelab_down": True,
                      "finance": "warning"}, make_ctx())
    t0 = datetime(2026, 10, 9, 20, 0, tzinfo=timezone.utc)
    d.now = lambda: t0
    k = by_key(await d.fetch())
    assert k["now.condition"]["value"] == WEATHER[0]["condition"]
    hl = k["host.homelab"]["value"]
    assert hl["up"] is False and hl["rtt_ms"] is None
    assert datetime.fromisoformat(hl["last_seen"]) == t0 - timedelta(minutes=4)
    assert k["month"]["value"]["net"] == 6420 - 7310
    d.now = lambda: t0 + timedelta(seconds=125)
    k = by_key(await d.fetch())
    assert k["now.summary"]["value"] == WEATHER[2]["summary"]
    # last_seen stays fixed so "down since" doesn't move
    assert datetime.fromisoformat(k["host.homelab"]["value"]["last_seen"]) == t0 - timedelta(minutes=4)


async def test_demo_calendar_rolls_forward_and_can_be_off():
    d = Demo("calendar", {}, make_ctx())
    t0 = datetime(2026, 10, 9, 20, 0, tzinfo=timezone.utc)
    d.now = lambda: t0
    first = by_key(await d.fetch())["next"]["value"]["start"]
    d.now = lambda: t0 + timedelta(minutes=50)
    rolled = datetime.fromisoformat(by_key(await d.fetch())["next"]["value"]["start"])
    assert rolled == t0 + timedelta(minutes=50 + 95)
    assert datetime.fromisoformat(first) == t0 + timedelta(minutes=47)
    off = await Demo("calendar", {"calendar": False}, make_ctx()).fetch()
    assert off == [{"key": "next", "value": None, "type": "object"}]


def test_demo_bad_options():
    with pytest.raises(OptionError, match="weather"):
        Demo("demo", {"weather": "hail"}, make_ctx())
    with pytest.raises(OptionError, match="parts"):
        Demo("demo", {"parts": ["calendar", "stocks"]}, make_ctx())
    with pytest.raises(OptionError, match="homelab_down"):
        Demo("demo", {"homelab_down": "yes"}, make_ctx())


# ---------------------------------------------------------------------- file
def _touch_later(p: Path, text: str):
    st = p.stat() if p.exists() else None
    p.write_text(text, encoding="utf-8")
    if st:   # make sure the mtime moves even on coarse filesystems
        os.utime(p, (st.st_atime + 2, st.st_mtime + 2))


async def test_file_json_object_reread_and_removed_key(tmp_path):
    p = tmp_path / "notes.json"
    p.write_text(json.dumps({"battery": 81, "mood": "ok"}), encoding="utf-8")
    f = FileSource("notes", {"path": "notes.json"}, make_ctx(tmp_path))
    assert f.ttl_s is None
    items = await f.fetch()
    check_coerces("notes", items)
    assert {i["key"]: i["value"] for i in items} == {"battery": 81, "mood": "ok"}
    assert await f.fetch() == []                      # unchanged -> nothing new
    _touch_later(p, json.dumps({"battery": 79}))
    k = by_key(await f.fetch())
    assert k["battery"]["value"] == 79 and k["mood"]["value"] is None


async def test_file_json_list_csv_toml(tmp_path):
    (tmp_path / "a.json").write_text(json.dumps([
        {"key": "x", "value": 1, "ttl": "5m", "visibility": "ask", "note": "hi"}]), encoding="utf-8")
    [x] = await FileSource("a", {"path": str(tmp_path / "a.json")}, make_ctx(tmp_path)).fetch()
    assert x["ttl_s"] == 300 and x["visibility"] == "ask" and x["meta"] == {"note": "hi"}

    (tmp_path / "b.csv").write_text('key,value,type,visibility\npower.now,"1,234.5",,\n'
                                    "door,true,,\nlabel,007,string,ask\nratio,0.85,,\n", encoding="utf-8")
    k = by_key(await FileSource("b", {"path": "b.csv"}, make_ctx(tmp_path)).fetch())
    assert k["power.now"]["value"] == 1234.5 and k["door"]["value"] is True
    assert k["label"]["value"] == "007" and k["label"]["type"] == "string" and k["label"]["visibility"] == "ask"
    assert k["ratio"]["value"] == 0.85

    (tmp_path / "c.toml").write_text('temp = 21.5\n"power.now" = 300\n[month]\nincome = 1\n', encoding="utf-8")
    k = by_key(await FileSource("c", {"path": "c.toml"}, make_ctx(tmp_path)).fetch())
    assert k["temp"]["value"] == 21.5 and k["power.now"]["value"] == 300 and k["month"]["value"] == {"income": 1}


async def test_file_malformed_keeps_last_good_and_errors(tmp_path):
    p = tmp_path / "n.json"
    p.write_text('{"a": 1}', encoding="utf-8")
    f = FileSource("n", {"path": "n.json"}, make_ctx(tmp_path))
    assert len(await f.fetch()) == 1
    _touch_later(p, '{"a": ')
    with pytest.raises(SourceError, match="JSONDecodeError"):
        await f.fetch()
    with pytest.raises(SourceError):                  # still broken, still an error
        await f.fetch()
    _touch_later(p, '{"a": 2}')
    assert by_key(await f.fetch())["a"]["value"] == 2
    p.unlink()
    with pytest.raises(SourceError, match="not found"):
        await f.fetch()


async def test_file_csv_errors_and_options(tmp_path):
    (tmp_path / "bad.csv").write_text("name,amount\nx,1\n", encoding="utf-8")
    with pytest.raises(SourceError, match="key,value"):
        await FileSource("b", {"path": "bad.csv"}, make_ctx(tmp_path)).fetch()
    with pytest.raises(OptionError, match="format"):
        FileSource("b", {"path": "x.yaml"}, make_ctx(tmp_path))
    with pytest.raises(OptionError, match="path"):
        FileSource("b", {}, make_ctx(tmp_path))
    f = FileSource("b", {"path": "x.txt", "format": "json", "ttl": "1h"}, make_ctx(tmp_path))
    assert f.ttl_s == 3600


# ---------------------------------------------------------------------- push
async def test_push_registers_and_waits_forever():
    p = PushSource("phone", {"ttl": "30m"}, make_ctx())
    assert p.ttl_s == 1800 and p.every is None
    task = asyncio.create_task(p.run(lambda items: None))
    await asyncio.sleep(0.05)
    assert not task.done()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert PushSource("x", {}, make_ctx()).ttl_s is None
    assert PushSource.normalize({"key": "battery", "value": 81}) == [{"key": "battery", "value": 81}]
    with pytest.raises(ValueError):
        PushSource.normalize([{"value": 1}])


# ---------------------------------------------------------------------- http_json
async def test_http_json_map_types_and_headers():
    seen = {}

    def handler(req: httpx.Request):
        seen["auth"] = req.headers.get("authorization")
        return httpx.Response(200, json={"data": {"watts": 512.5, "batteries": [{"percent": 81}]}})

    a = HttpJson("solar", {"url": "http://192.168.1.50/api/status",
                           "headers": {"Authorization": "Bearer abc"},
                           "map": {"power.now": "data.watts", "battery.pct": "data.batteries.0.percent",
                                   "gone": "data.nope"},
                           "types": {"power.now": "number"}}, make_ctx(handler=handler))
    k = by_key(await a.fetch())
    assert seen["auth"] == "Bearer abc"
    assert k["power.now"] == {"key": "power.now", "value": 512.5, "type": "number"}
    assert k["battery.pct"]["value"] == 81 and "gone" not in k
    assert a.status.extra["missing"] == ["gone"]


async def test_http_json_whole_doc_and_errors_redact_secrets():
    ok = HttpJson("x", {"url": "https://api.example.com/v1?token=SEKRET"},
                  make_ctx(handler=lambda r: httpx.Response(200, json=[1, 2])))
    assert await ok.fetch() == [{"key": "value", "value": [1, 2]}]

    bad = HttpJson("x", {"url": "https://api.example.com/private-SEKRET/v1?token=SEKRET"},
                   make_ctx(handler=lambda r: httpx.Response(503)))
    with pytest.raises(SourceError) as ei:
        await bad.fetch()
    assert "503" in str(ei.value) and "SEKRET" not in str(ei.value)

    def boom(r):
        raise httpx.ConnectError("connect failed for https://api.example.com/?token=SEKRET")
    with pytest.raises(SourceError) as ei:
        await HttpJson("x", {"url": "https://api.example.com/?token=SEKRET"}, make_ctx(handler=boom)).fetch()
    assert "SEKRET" not in str(ei.value) and ei.value.__cause__ is None

    nomatch = HttpJson("x", {"url": "http://h/", "map": {"a": "b.c"}},
                       make_ctx(handler=lambda r: httpx.Response(200, json={"z": 1})))
    with pytest.raises(SourceError, match="none of the mapped paths"):
        await nomatch.fetch()
    notjson = HttpJson("x", {"url": "http://h/"}, make_ctx(handler=lambda r: httpx.Response(200, text="<html>")))
    with pytest.raises(SourceError, match="not JSON"):
        await notjson.fetch()


def test_http_json_options_and_redact():
    with pytest.raises(OptionError, match="url"):
        HttpJson("x", {}, make_ctx())
    with pytest.raises(OptionError, match="http"):
        HttpJson("x", {"url": "ftp://h"}, make_ctx())
    with pytest.raises(OptionError, match="types"):
        HttpJson("x", {"url": "http://h", "types": {"a": "float"}}, make_ctx())
    assert redact_url("https://user:pw@calendar.google.com/calendar/ical/x/private-abc/basic.ics?k=1") \
        == "https://calendar.google.com/..."


# ---------------------------------------------------------------------- command
def test_command_parse_output_forms():
    assert parse_output('{"key": "a", "value": 1}\n\n{"key": "b", "value": "x", "ttl": "1m"}\n') == [
        {"key": "a", "value": 1}, {"key": "b", "value": "x", "ttl_s": 60}]
    assert parse_output('[{"key": "a", "value": 1}]') == [{"key": "a", "value": 1}]
    assert parse_output('{"a": 1, "b": [2]}') == [{"key": "a", "value": 1}, {"key": "b", "value": [2]}]
    assert parse_output("  ") == []
    with pytest.raises(ValueError, match="line 2"):
        parse_output('{"key": "a", "value": 1}\nhello\n')


async def test_command_runs_script_in_scripts_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("AMBIENT_SCRIPTS_DIR", str(tmp_path))
    (tmp_path / "s.py").write_text(
        "import json, os\nprint(json.dumps({'key': 'cwd_ok', 'value': os.path.exists('s.py')}))\n"
        "print(json.dumps({'key': 'env', 'value': os.environ.get('FOO')}))\n", encoding="utf-8")
    c = Command("x", {"command": ["python", "s.py"], "env": {"FOO": "bar"}}, make_ctx())
    assert c.argv[0] == sys.executable
    k = by_key(await c.fetch())
    assert k["cwd_ok"]["value"] is True and k["env"]["value"] == "bar"


async def test_command_failures(tmp_path, monkeypatch):
    monkeypatch.setenv("AMBIENT_SCRIPTS_DIR", str(tmp_path))
    (tmp_path / "fail.py").write_text("import sys\nsys.stderr.write('disk on fire')\nsys.exit(3)\n")
    with pytest.raises(SourceError, match=r"exit 3: disk on fire"):
        await Command("x", {"command": ["python", "fail.py"]}, make_ctx()).fetch()
    (tmp_path / "slow.py").write_text("import time\ntime.sleep(10)\n")
    with pytest.raises(SourceError, match="timed out"):
        await Command("x", {"command": ["python", "slow.py"], "timeout": "0.5s"}, make_ctx()).fetch()
    (tmp_path / "junk.py").write_text("print('not json')\n")
    with pytest.raises(SourceError, match="not JSON"):
        await Command("x", {"command": ["python", "junk.py"]}, make_ctx()).fetch()
    with pytest.raises(SourceError, match="not found"):
        await Command("x", {"command": ["definitely-not-a-program-xyz"]}, make_ctx()).fetch()
    with pytest.raises(OptionError, match="list"):
        Command("x", {"command": "python s.py"}, make_ctx())


async def test_example_status_script_works():
    script = REPO / "scripts" / "example_status.py"
    if not script.exists():
        pytest.skip("scripts/example_status.py missing")
    os.environ.pop("AMBIENT_SCRIPTS_DIR", None)
    c = Command("example", {"command": ["python", str(script)]}, make_ctx())
    items = await c.fetch()
    check_coerces("example", items)
    assert items and all("key" in i for i in items)


# ---------------------------------------------------------------------- ping
def test_ping_argv_and_parse():
    assert ping_argv("10.0.0.1", 1, "linux") == ["ping", "-c", "1", "-W", "1", "-n", "10.0.0.1"]
    assert ping_argv("10.0.0.1", 1, "win32") == ["ping", "-n", "1", "-w", "1000", "10.0.0.1"]
    linux_ok = "64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time=0.045 ms\nrtt min/avg/max/mdev = 0.045/0.045/0.045/0.000 ms"
    assert parse_ping(0, linux_ok, "linux") == (True, 0.045)
    assert parse_ping(1, "1 packets transmitted, 0 received", "linux") == (False, None)
    assert parse_ping(0, "Reply from 127.0.0.1: bytes=32 time<1ms TTL=128", "win32") == (True, 1.0)
    assert parse_ping(0, "Reply from 127.0.0.1: bytes=32 time=12ms TTL=128", "win32") == (True, 12.0)
    # Windows exits 0 for "unreachable" replies: must not count as up
    assert parse_ping(0, "Reply from 192.168.1.5: Destination host unreachable.", "win32") == (False, None)


def test_ping_options():
    with pytest.raises(OptionError, match="hosts"):
        Ping("hb", {}, make_ctx())
    with pytest.raises(OptionError, match="address"):
        Ping("hb", {"hosts": {"evil": "-f 10.0.0.1"}}, make_ctx())
    with pytest.raises(OptionError, match="tcp_port"):
        Ping("hb", {"hosts": {"a": {"address": "10.0.0.1", "tcp_port": 70000}}}, make_ctx())
    p = Ping("hb", {"hosts": {"a": "10.0.0.1", "b": {"address": "nas.local", "tcp_port": 22}}, "tcp_port": 80},
             make_ctx())
    assert p.hosts == {"a": ("10.0.0.1", 80), "b": ("nas.local", 22)}


async def test_ping_fetch_tracks_last_seen():
    p = Ping("hb", {"hosts": {"homelab": "10.0.0.10", "main-pc": "10.0.0.20"}}, make_ctx())
    state = {"10.0.0.10": (True, 0.7), "10.0.0.20": (False, None)}

    async def fake(addr, port):
        return state[addr]
    p.probe = fake
    k = by_key(await p.fetch())
    check_coerces("hb", list(k.values()))
    assert k["host.homelab"]["type"] == "status"
    hl = k["host.homelab"]["value"]
    assert hl["up"] is True and hl["rtt_ms"] == 0.7 and hl["last_seen"]
    assert k["host.main-pc"]["value"] == {"up": False, "rtt_ms": None, "last_seen": None}
    state["10.0.0.10"] = (False, None)
    hl2 = by_key(await p.fetch())["host.homelab"]["value"]
    assert hl2["up"] is False and hl2["last_seen"] == hl["last_seen"]


async def test_ping_tcp_probe_against_local_server():
    server = await asyncio.start_server(lambda r, w: w.close(), "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    try:
        p = Ping("hb", {"hosts": {"me": "127.0.0.1"}, "tcp_port": port}, make_ctx())
        [item] = await p.fetch()
        assert item["value"]["up"] is True and item["value"]["rtt_ms"] is not None
    finally:
        server.close()
        await server.wait_closed()


@pytest.mark.skipif(shutil.which("ping") is None, reason="no system ping")
async def test_ping_icmp_localhost():
    p = Ping("hb", {"hosts": {"me": "127.0.0.1"}}, make_ctx())
    [item] = await p.fetch()
    assert item["value"]["up"] is True
