"""command: run a program, read signals from its stdout. Any language that's in the container.

    [[source]]
    name = "backup"
    type = "command"
    command = ["python", "example_status.py"]    # argv list, no shell; cwd = the scripts dir
    every = "15m"
    timeout = "30s"
    env = { BACKUP_ROOT = "/data/backups" }        # optional, added to the environment

Runs inside the backend container with cwd = AMBIENT_SCRIPTS_DIR (/app/scripts there; repo
scripts/ in dev). "python"/"python3" as argv[0] means the backend's own interpreter.

stdout: one JSON object per line ({"key": ..., "value": ...}), or one JSON document: a
{"key","value"} object, a list of them, or a plain {key: value} object. Exit code != 0, a timeout or
unparseable output = error (the tail of stderr goes into the source status).
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from typing import Any

from ._shared import OptionError, SourceError, normalize_item, opt, opt_duration, scripts_dir
from .base import Adapter, register

MAX_OUTPUT = 1_000_000


def parse_output(text: str) -> list[dict[str, Any]]:
    text = text.strip()
    if not text:
        return []
    try:
        doc = json.loads(text)
    except ValueError:
        doc = None
        items = []
        for n, line in enumerate(text.splitlines(), start=1):
            line = line.strip()
            if not line:
                continue
            try:
                items.append(normalize_item(json.loads(line), f"stdout line {n}"))
            except json.JSONDecodeError:
                raise ValueError(f"stdout line {n} is not JSON: {line[:80]!r}") from None
        return items
    if isinstance(doc, list):
        return [normalize_item(it, f"item {i}") for i, it in enumerate(doc)]
    if isinstance(doc, dict):
        if "key" in doc and "value" in doc:
            return [normalize_item(doc, "stdout")]
        return [{"key": str(k), "value": v} for k, v in doc.items()]
    raise ValueError("stdout must be JSON objects (one per line) or one JSON object/array")


@register("command")
class Command(Adapter):
    default_every = 300.0

    def __init__(self, name: str, options: dict[str, Any], ctx):
        super().__init__(name, options, ctx)
        argv = opt(options, "command", list, source=name)
        if not argv or not all(isinstance(a, str) and a for a in argv):
            raise OptionError(f"source {name!r}: command must be a non-empty list of strings, "
                              f"e.g. [\"python\", \"my_script.py\"] (no shell)")
        if argv[0] in ("python", "python3"):
            argv = [sys.executable, *argv[1:]]
        self.argv = argv
        self.timeout = opt_duration(options, "timeout", 30.0, source=name)
        env = opt(options, "env", dict, {}, source=name)
        self.env = {**os.environ, **{str(k): str(v) for k, v in env.items()}}
        cwd = opt(options, "cwd", str, None, source=name)
        self.cwd = (scripts_dir() / cwd) if cwd else scripts_dir()

    async def fetch(self):
        try:
            proc = await asyncio.create_subprocess_exec(
                *self.argv, cwd=str(self.cwd) if self.cwd.is_dir() else None, env=self.env,
                stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE)
        except FileNotFoundError:
            raise SourceError(f"command not found: {self.argv[0]}") from None
        try:
            out, err = await asyncio.wait_for(proc.communicate(), self.timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise SourceError(f"command timed out after {self.timeout:g} s") from None
        except asyncio.CancelledError:
            if proc.returncode is None:
                proc.kill()
            raise
        stderr = err.decode("utf-8", "replace").strip()
        if proc.returncode != 0:
            raise SourceError(f"exit {proc.returncode}: {stderr[-400:] or '(no stderr)'}")
        if len(out) > MAX_OUTPUT:
            raise SourceError(f"output too large ({len(out)} bytes)")
        try:
            return parse_output(out.decode("utf-8", "replace"))
        except ValueError as e:
            raise SourceError(f"{e}{' | stderr: ' + stderr[-200:] if stderr else ''}") from None
