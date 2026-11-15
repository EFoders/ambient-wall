"""ping: is each host answering? One status signal per host, probed concurrently every cycle.

    [[source]]
    name = "heartbeat"
    type = "ping"
    every = "30s"
    hosts = { homelab = "192.168.1.10", main-pc = "192.168.1.20" }
    # tcp_port = 22             # optional: TCP-connect check instead of ICMP (all hosts)
    # hosts = { nas = { address = "192.168.1.30", tcp_port = 5000 } }   # or per host

Emits `host.<name>` = {"up": bool, "rtt_ms": float|null, "last_seen": ISO|null} (type "status").
This is the raw probe: one missed ping is not "down". The heartbeat rule decides that from
`last_seen` (null = not seen since the backend started). ICMP uses the system `ping`
(`ping -c 1 -W 1` on Linux; `ping -n 1 -w 1000` on Windows). For TCP, a refused connection still
counts as up (the host answered).
"""
from __future__ import annotations

import asyncio
import re
import sys
import time
from datetime import datetime
from typing import Any

from ..signal import utcnow
from ._shared import OptionError, SourceError, iso, opt, opt_duration
from .base import Adapter, register

_ADDR = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.:_%\-\[\]]*$")
_RTT = re.compile(r"[=<]\s*([\d.,]+)\s*ms", re.IGNORECASE)


def ping_argv(address: str, timeout_s: float, platform: str = sys.platform) -> list[str]:
    if platform.startswith("win"):
        return ["ping", "-n", "1", "-w", str(int(timeout_s * 1000)), address]
    return ["ping", "-c", "1", "-W", str(max(1, round(timeout_s))), "-n", address]


def parse_ping(returncode: int, output: str, platform: str = sys.platform) -> tuple[bool, float | None]:
    """(up, rtt_ms). Windows ping exits 0 on 'Destination host unreachable' replies, so require a
    TTL= line there; Linux exit 0 means a reply came back."""
    up = returncode == 0
    if platform.startswith("win"):
        up = up and "ttl=" in output.lower()
    rtt = None
    if up:
        m = _RTT.search(output)
        if m:
            try:
                rtt = float(m.group(1).replace(",", "."))
            except ValueError:
                rtt = None
    return up, rtt


@register("ping")
class Ping(Adapter):
    default_every = 30.0

    def __init__(self, name: str, options: dict[str, Any], ctx):
        super().__init__(name, options, ctx)
        hosts = opt(options, "hosts", dict, source=name)
        if not hosts:
            raise OptionError(f"source {name!r}: hosts is empty; e.g. hosts = {{ homelab = \"192.168.1.10\" }}")
        default_port = opt(options, "tcp_port", int, None, source=name)
        self.timeout = opt_duration(options, "timeout", 1.0, source=name)
        self.hosts: dict[str, tuple[str, int | None]] = {}
        for host, spec in hosts.items():
            port = default_port
            if isinstance(spec, dict):
                addr = spec.get("address")
                port = spec.get("tcp_port", default_port)
            else:
                addr = spec
            if not isinstance(addr, str) or not _ADDR.match(addr):
                raise OptionError(f"source {name!r}: hosts.{host} needs an IP address or hostname, got {addr!r}")
            if port is not None and (not isinstance(port, int) or isinstance(port, bool) or not 0 < port < 65536):
                raise OptionError(f"source {name!r}: hosts.{host} tcp_port must be 1-65535")
            self.hosts[str(host)] = (addr, port)
        self.last_seen: dict[str, datetime] = {}

    async def probe_icmp(self, address: str) -> tuple[bool, float | None]:
        try:
            proc = await asyncio.create_subprocess_exec(
                *ping_argv(address, self.timeout), stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        except FileNotFoundError:
            raise SourceError("system `ping` not found (install iputils-ping, or set tcp_port)") from None
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), self.timeout + 4)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return False, None
        return parse_ping(proc.returncode or 0, out.decode("utf-8", "replace"))

    async def probe_tcp(self, address: str, port: int) -> tuple[bool, float | None]:
        t0 = time.perf_counter()
        try:
            _, writer = await asyncio.wait_for(asyncio.open_connection(address.strip("[]"), port),
                                               self.timeout)
        except ConnectionRefusedError:
            return True, round((time.perf_counter() - t0) * 1000, 1)   # host is there; port closed
        except (OSError, asyncio.TimeoutError):
            return False, None
        rtt = round((time.perf_counter() - t0) * 1000, 1)
        writer.close()
        try:
            await writer.wait_closed()
        except OSError:
            pass
        return True, rtt

    async def probe(self, address: str, port: int | None) -> tuple[bool, float | None]:
        return await (self.probe_tcp(address, port) if port else self.probe_icmp(address))

    async def fetch(self):
        names = list(self.hosts)
        results = await asyncio.gather(*(self.probe(*self.hosts[n]) for n in names))
        now = utcnow()
        out = []
        for n, (up, rtt) in zip(names, results):
            if up:
                self.last_seen[n] = now
            out.append({"key": f"host.{n}", "type": "status",
                        "value": {"up": up, "rtt_ms": rtt, "last_seen": iso(self.last_seen.get(n))}})
        return out
