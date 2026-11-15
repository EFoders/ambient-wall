"""Example `command` source: print one JSON object per line, each {"key": ..., "value": ...}.

    [[source]]
    name = "example"
    type = "command"
    command = ["python", "example_status.py"]    # runs in scripts/ (/app/scripts in the container)
    every = "5m"

Optional per-line fields: "type", "ttl" ("10m"), "visibility" ("wall" | "ask"), "meta" ({...}).
Exit non-zero (and write the reason to stderr) if something went wrong.
"""
import json
import shutil
from datetime import datetime, timezone


def emit(key, value, **extra):
    print(json.dumps({"key": key, "value": value, **extra}))


usage = shutil.disk_usage("/")
emit("disk.free_pct", round(100 * usage.free / usage.total, 1), type="number")
emit("checked", datetime.now(timezone.utc).isoformat(timespec="seconds"), visibility="ask")
