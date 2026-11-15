"""heartbeat_down: turn raw per-probe ping results into a per-host up/down with a grace period.

A single lost ping must not flare the wall (SPEC 5.1: "down = no ping response for ~2 min"). A host is
down only when it has had no successful probe for longer than `after`:

    now - last_seen > after                      (last successful probe known)
    now - first_failure > after                  (never seen up since we started watching)

`downSince` is that last success (or the first failure). A stale or vanished input for a known host
counts as failing: it goes down `after` its last success. Flapping hosts whose last success is within
`after` stay up.

Config [rules.heartbeat_down] (all optional):

    enabled = true
    after   = "2m"                    # grace period (duration)
    input   = "heartbeat.host.*"      # glob over the raw status signals; host = id minus the glob prefix
    hosts   = ["homelab", "main-pc"]  # known hosts: listed hosts that never report go down after `after`
    forget  = "24h"                   # a host not in `hosts` whose input has been stale/missing this long
                                      # is dropped (it was removed from the ping source)
    every   = "15s"                   # (scheduler) re-run interval; ttl defaults to 3 x every

Input value (type status, one per probe): {"up": bool, "rtt_ms": float|null, "last_seen": ISO|null}

Output (source "rules"), one per host, in `hosts` order then by name:

    key   "heartbeat.<host>"
    value {"host": "homelab", "up": false, "downSince": "2026-10-09T19:36:00+00:00" | null}

Same inputs -> same value (downSince is a fixed instant, never "now"), so change detection works.
The rule keeps a little memory (last success / first failure per host) for inputs that carry no
last_seen or that vanish from the pool; `reset_state()` clears it (tests).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from ..pool_view import PoolView
from ..signal import Signal
from ..util import parse_duration
from ._common import iso_utc, parse_dt
from .base import rule

NAME = "heartbeat_down"
DEFAULT_INPUT = "heartbeat.host.*"
DEFAULT_AFTER = "2m"
DEFAULT_FORGET = "24h"


class _State:
    def __init__(self) -> None:
        self.last_ok: dict[str, datetime] = {}       # newest successful probe seen per host
        self.first_fail: dict[str, datetime] = {}    # first failing observation since the last success
        self.first_missing: dict[str, datetime] = {}  # known host first noticed with no signal at all
        self.seen: dict[str, None] = {}              # ordered set of every host ever reported


_STATE = _State()


def reset_state() -> None:
    global _STATE
    _STATE = _State()


def input_prefix(glob: str) -> str:
    """"heartbeat.host.*" -> "heartbeat.host." (host name = rest of the id)."""
    return glob[:-1] if glob.endswith("*") else glob.rstrip(".") + "."


def after_seconds(cfg: dict[str, Any]) -> float:
    return parse_duration(cfg.get("after", DEFAULT_AFTER)) or 0.0


def host_status(sig: Signal | None, now: datetime, after_s: float, *,
                last_ok: datetime | None = None, first_fail: datetime | None = None
                ) -> tuple[bool, datetime | None]:
    """(up, down_since) for one host. Pure; the rule and the wall projection's fallback share it.

    sig: the newest raw probe signal (stale allowed) or None. last_ok / first_fail: remembered hints.
    """
    v = sig.value if sig is not None and isinstance(sig.value, dict) else {}
    stale = sig is None or sig.is_stale(now)
    probe_ok = bool(v.get("up"))
    if sig is not None and not stale and probe_ok:
        return True, None
    oks = [t for t in (last_ok, parse_dt(v.get("last_seen"))) if t is not None]
    if sig is not None and probe_ok:          # a stale success: it was fine when observed
        oks.append(sig.ts)
    since = max(oks) if oks else (first_fail or (sig.ts if sig is not None else None))
    if since is None:
        return True, None                     # nothing known yet
    if (now - since).total_seconds() > after_s:
        return False, since
    return True, None


def ordered_hosts(found: list[str], configured: list[str] | None, seen: list[str] | None = None) -> list[str]:
    out: dict[str, None] = {}
    for h in configured or []:
        out.setdefault(str(h))
    for h in seen or []:
        out.setdefault(h)
    for h in sorted(found):
        out.setdefault(h)
    return list(out)


@rule(NAME, inputs=[DEFAULT_INPUT], every=15)
def heartbeat_down(pool: PoolView, now: datetime, cfg: dict[str, Any]):
    if cfg.get("enabled", True) is False:
        return []
    st = _STATE
    after_s = after_seconds(cfg)
    glob = cfg.get("input") or DEFAULT_INPUT
    prefix = input_prefix(glob)
    configured = [str(h) for h in (cfg.get("hosts") or [])]
    forget_s = parse_duration(cfg.get("forget", DEFAULT_FORGET))

    by_host: dict[str, Signal] = {}
    for s in pool.query(glob, include_stale=True):
        host = s.id[len(prefix):] if s.id.startswith(prefix) else s.id.rsplit(".", 1)[-1]
        if host and isinstance(s.value, dict):
            by_host[host] = s

    for host in sorted(by_host):
        st.seen.setdefault(host)

    out = []
    for host in ordered_hosts(list(by_host), configured, list(st.seen)):
        sig = by_host.get(host)
        if forget_s and host not in configured and (sig is None or sig.is_stale(now)):
            heard = [t for t in (sig.ts if sig is not None else None, st.last_ok.get(host),
                                 st.first_missing.get(host)) if t is not None]
            if heard and (now - max(heard)).total_seconds() > forget_s:
                for d in (st.seen, st.last_ok, st.first_fail, st.first_missing):
                    d.pop(host, None)
                continue
        if sig is not None:
            st.first_missing.pop(host, None)
            v = sig.value
            ok_at = parse_dt(v.get("last_seen"))
            if v.get("up") and ok_at is None:
                ok_at = sig.ts
            if ok_at is not None and (host not in st.last_ok or ok_at > st.last_ok[host]):
                st.last_ok[host] = ok_at
            if v.get("up") and not sig.is_stale(now):
                st.first_fail.pop(host, None)
            elif not v.get("up"):
                prev = st.first_fail.get(host)
                last_ok = st.last_ok.get(host)
                # the first failure after the newest success; a later success resets it
                if prev is None or (last_ok is not None and prev <= last_ok):
                    st.first_fail[host] = sig.ts
                else:
                    st.first_fail[host] = min(prev, sig.ts)
        elif host not in st.last_ok:
            st.first_missing.setdefault(host, now)

        up, since = host_status(sig, now, after_s, last_ok=st.last_ok.get(host),
                                first_fail=st.first_fail.get(host) or st.first_missing.get(host))
        out.append({"key": f"heartbeat.{host}", "type": "object",
                    "value": {"host": host, "up": up, "downSince": None if up else iso_utc(since)}})
    return out
