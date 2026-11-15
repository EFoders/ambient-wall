"""ambient.commands: validation, CommandHub fan-out and replay, and the module-level voice functions."""
from __future__ import annotations

import asyncio
import json

import pytest

from ambient import ask, commands
from ambient.commands import CommandError, CommandHub, clamp_duration, validate_mode, validate_theme

PANEL = {"panel": "forecast", "title": "Forecast", "ts": "2026-10-10T09:30:00-04:00",
         "days": [{"date": "2026-10-10", "label": "Sat", "hiC": 12, "loC": 3, "condition": "rain"}]}


class Clock:
    def __init__(self, t=1000.0):
        self.t = t

    def __call__(self):
        return self.t


def make_hub(panels=None, **kw):
    panels = {"forecast": PANEL} if panels is None else panels
    clock = Clock()
    return CommandHub(lambda name: panels.get(name), clock=clock, **kw), clock


def drain(client) -> list:
    out = []
    while not client.queue.empty():
        m = client.queue.get_nowait()
        out.append(None if m is None else json.loads(m))
    return out


@pytest.fixture(autouse=True)
def unbind():
    yield
    commands.bind(None)


# ------------------------------------------------------------------------------ validation

@pytest.mark.parametrize("v,expected", [(None, 20), (1, 5), (4.4, 5), (5, 5), (20, 20), (60.5, 60),
                                        (119.6, 120), (121, 120), (1e9, 120), (-5, 5), (" 30 ", 30)])
def test_clamp_duration(v, expected):
    assert clamp_duration(v) == expected


@pytest.mark.parametrize("v", [True, False, "soon", [5], {"s": 5}, float("nan"), float("inf")])
def test_clamp_duration_rejects(v):
    with pytest.raises(CommandError):
        clamp_duration(v)


def test_validate_theme():
    assert validate_theme("nature") == "nature"
    assert validate_theme(" Cyberpunk ") == "cyberpunk"
    assert validate_theme("stained-glass_2") == "stained-glass_2"
    for bad in (None, "", "  ", "../etc", "a b", "x" * 65, 3, "-lead"):
        with pytest.raises(CommandError):
            validate_theme(bad)
    assert validate_theme("nature", {"nature", "cyberpunk"}) == "nature"
    with pytest.raises(CommandError, match="unknown theme"):
        validate_theme("vapor", {"nature", "cyberpunk"})


def test_validate_mode():
    assert [validate_mode(m) for m in ("work", "AMBIENT", " auto ")] == ["work", "ambient", "auto"]
    for bad in (None, "", "party", 1, ["work"]):
        with pytest.raises(CommandError):
            validate_mode(bad)


def test_command_errors_are_value_errors_and_unknown_panel_is_key_error():
    assert issubclass(CommandError, ValueError) and issubclass(ask.UnknownPanel, KeyError)


# ------------------------------------------------------------------------------ hub

async def test_show_broadcasts_exact_message_to_every_client():
    hub, _ = make_hub()
    a, b = hub.register(), hub.register()
    res = hub.show("forecast", 30)
    assert res == {"shown": True, "panel": "forecast", "duration": 30, "clients": 2}
    want = {"type": "command", "name": "show", "args": {"panel": "forecast", "duration": 30, "data": PANEL}}
    assert drain(a) == [want] and drain(b) == [want]


async def test_show_no_data_and_unknown_panel():
    hub, _ = make_hub(panels={})
    a = hub.register()
    assert hub.show("forecast") == {"shown": False, "panel": "forecast", "reason": "no data"}
    assert drain(a) == [] and hub.replay() is None
    with pytest.raises(ask.UnknownPanel):
        hub.show("horoscope")
    with pytest.raises(CommandError):
        hub.show("forecast", "soon")


async def test_dismiss_set_theme_set_mode_messages():
    hub, _ = make_hub(known_themes={"nature", "cyberpunk"})
    a = hub.register()
    assert hub.dismiss() == {"ok": True, "name": "dismiss", "clients": 1}
    assert hub.set_theme("Nature")["args"] == {"theme": "nature"}
    assert hub.set_mode("work")["args"] == {"mode": "work"}
    with pytest.raises(CommandError):
        hub.set_theme("vapor")
    with pytest.raises(CommandError):
        hub.set_mode("party")
    assert drain(a) == [{"type": "command", "name": "dismiss", "args": {}},
                        {"type": "command", "name": "set_theme", "args": {"theme": "nature"}},
                        {"type": "command", "name": "set_mode", "args": {"mode": "work"}}]


async def test_generic_command_entry():
    hub, _ = make_hub()
    assert hub.command("set_theme", {"theme": "nature"})["name"] == "set_theme"
    assert hub.command("set_mode", {"mode": "auto"})["args"] == {"mode": "auto"}
    for name, args in (("set_theme", None), ("set_theme", {}), ("set_mode", {"mode": 1}), ("show", {}),
                       (None, {}), ("set_mode", ["work"]), ("dismiss", {})):
        with pytest.raises(CommandError):
            hub.command(name, args)


async def test_replay_remaining_duration_and_expiry():
    hub, clock = make_hub()
    assert hub.replay() is None
    hub.show("forecast", 20)
    m = json.loads(hub.replay())
    assert m["name"] == "show" and m["args"]["duration"] == 20 and m["args"]["data"] == PANEL
    clock.t += 14.2
    assert json.loads(hub.replay())["args"]["duration"] == 6                     # ceil(5.8)
    assert hub.showing == "forecast"
    clock.t += 5.79
    assert json.loads(hub.replay())["args"]["duration"] == 1
    clock.t += 0.01
    assert hub.replay() is None and hub.showing is None


async def test_replay_cleared_by_dismiss_and_replaced_by_newer_show():
    hub, clock = make_hub(panels={"forecast": PANEL, "news": {"panel": "news", "items": []}})
    hub.show("forecast", 60)
    hub.dismiss()
    assert hub.replay() is None
    hub.show("forecast", 60)
    clock.t += 10
    hub.show("news", 10)
    assert json.loads(hub.replay())["args"]["panel"] == "news"
    clock.t += 11
    assert hub.replay() is None                                                   # the older one doesn't come back


async def test_slow_client_is_cut_off_without_blocking_others():
    hub, _ = make_hub()
    slow = hub.register(maxsize=2)
    fast = hub.register()
    for _ in range(3):
        hub.set_mode("work")
    assert slow.closed and slow not in hub.clients
    assert drain(slow) == [None]                                                  # close sentinel only
    assert len(drain(fast)) == 3
    assert hub.set_mode("auto")["clients"] == 1


async def test_broken_client_does_not_break_broadcast():
    hub, _ = make_hub()
    bad = hub.register()
    good = hub.register()

    def explode(msg):
        raise RuntimeError("socket gone")
    bad.offer = explode
    assert hub.dismiss()["clients"] == 1
    assert bad not in hub.clients and len(drain(good)) == 1


async def test_unregister_and_broadcast_with_no_clients():
    hub, _ = make_hub()
    c = hub.register()
    hub.unregister(c)
    hub.unregister(c)                                                             # idempotent
    assert hub.show("forecast")["clients"] == 0
    assert hub.replay() is not None                                               # still replayable later


async def test_client_queue_get_wakes_on_broadcast():
    hub, _ = make_hub()
    c = hub.register()
    waiter = asyncio.create_task(c.queue.get())
    await asyncio.sleep(0)
    hub.set_theme("nature")
    msg = await asyncio.wait_for(waiter, 1)
    assert json.loads(msg)["args"] == {"theme": "nature"}


# ------------------------------------------------------------------------------ module-level functions

async def test_module_functions_need_a_bound_hub():
    commands.bind(None)
    with pytest.raises(RuntimeError, match="no command hub"):
        await commands.show("forecast")
    with pytest.raises(RuntimeError):
        await commands.dismiss()


async def test_module_functions_use_bound_hub():
    hub, _ = make_hub()
    commands.bind(hub)
    assert commands.hub() is hub
    c = hub.register()
    assert (await commands.show("forecast", 2))["duration"] == 5
    assert (await commands.dismiss())["ok"] is True
    assert (await commands.set_theme("nature"))["args"] == {"theme": "nature"}
    assert (await commands.set_mode("ambient"))["args"] == {"mode": "ambient"}
    assert (await commands.clear_override())["args"] == {"mode": "auto"}
    assert [m["name"] for m in drain(c)] == ["show", "dismiss", "set_theme", "set_mode", "set_mode"]
    with pytest.raises(ask.UnknownPanel):
        await commands.show("horoscope")
    with pytest.raises(CommandError):
        await commands.set_mode("party")
