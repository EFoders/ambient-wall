"""file: a JSON / CSV / TOML file anyone can edit by hand or write from a script.

    [[source]]
    name = "notes"
    type = "file"
    path = "notes.json"         # relative to the data dir (/data in the container) unless absolute

  .json   {"key": value, ...}   or   [{"key": ..., "value": ..., "type"?, "ttl"?, "visibility"?}, ...]
  .csv    header  key,value[,type][,visibility]   numbers / true / false parsed
  .toml   key = value  (quote dotted keys: "power.now" = 5)

Checked every `every` (10 s); re-read only when the mtime changes. A malformed file marks the source
as errored and keeps the last good values in the pool. A key that disappears from the file is
published once as null so the wall drops it. Values never go stale unless `ttl` is set (signal ts =
the file's mtime, so `ttl = "1h"` means "stale if nobody rewrote the file within an hour").
"""
from __future__ import annotations

import csv
import io
import json
import tomllib
from datetime import datetime, timezone
from typing import Any

from ._shared import OptionError, SourceError, normalize_item, opt, parse_scalar, resolve_data_path
from .base import Adapter, register

FORMATS = ("json", "csv", "toml")


def parse_file(text: str, fmt: str) -> list[dict[str, Any]]:
    """File text -> normalised SignalLike dicts. Raises ValueError on anything malformed."""
    if fmt == "json":
        doc = json.loads(text)
        if isinstance(doc, dict):
            return [{"key": str(k), "value": v} for k, v in doc.items()]
        if isinstance(doc, list):
            return [normalize_item(it, f"item {i}") for i, it in enumerate(doc)]
        raise ValueError("JSON must be an object {key: value} or a list of {key, value} objects")
    if fmt == "toml":
        return [{"key": str(k), "value": v} for k, v in tomllib.loads(text).items()]
    # csv
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows and not text.strip():
        return []
    reader = csv.DictReader(io.StringIO(text))
    cols = [c.strip().lower() for c in (reader.fieldnames or [])]
    if "key" not in cols or "value" not in cols:
        raise ValueError("CSV needs a header row with at least: key,value")
    out = []
    for n, row in enumerate(rows, start=2):
        row = {(k or "").strip().lower(): (v or "") for k, v in row.items() if k is not None}
        if not row.get("key", "").strip():
            continue
        typ = row.get("type", "").strip() or None
        raw = row.get("value", "")
        item: dict[str, Any] = {"key": row["key"].strip(),
                                "value": raw.strip() if typ == "string" else parse_scalar(raw)}
        if typ:
            item["type"] = typ
        vis = row.get("visibility", "").strip()
        if vis:
            item["visibility"] = vis
        out.append(normalize_item(item, f"line {n}"))
    return out


@register("file")
class FileSource(Adapter):
    default_every = 10.0

    def __init__(self, name: str, options: dict[str, Any], ctx):
        super().__init__(name, options, ctx)
        path = opt(options, "path", str, source=name)
        self.path = resolve_data_path(path, ctx.data_dir)
        fmt = opt(options, "format", str, None, source=name) or self.path.suffix.lower().lstrip(".")
        if fmt not in FORMATS:
            raise OptionError(f"source {name!r}: can't tell the format of {path!r}; "
                              f"use a .json/.csv/.toml file or set format = \"json\"|\"csv\"|\"toml\"")
        self.format = fmt
        if options.get("ttl") is None:      # a file is a statement until rewritten
            self.ttl_s = None
        self._mtime: float | None = None
        self._bad: tuple[float, str] | None = None   # (mtime, error) of a malformed version
        self._keys: set[str] = set()

    async def fetch(self):
        try:
            st = self.path.stat()
        except FileNotFoundError:
            raise SourceError(f"file not found: {self.path}") from None
        if self._bad and self._bad[0] == st.st_mtime:
            raise SourceError(self._bad[1])            # still the same broken file
        if self._mtime == st.st_mtime:
            return []
        try:
            items = parse_file(self.path.read_text(encoding="utf-8-sig"), self.format)
        except (ValueError, tomllib.TOMLDecodeError, csv.Error, UnicodeDecodeError) as e:
            msg = f"{self.path.name}: {type(e).__name__}: {e}"
            self._bad = (st.st_mtime, msg)
            raise SourceError(msg) from None
        self._bad = None
        self._mtime = st.st_mtime
        ts = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc)
        for it in items:
            it.setdefault("ts", ts)
        keys = {it["key"] for it in items}
        gone = [{"key": k, "value": None, "ts": ts} for k in sorted(self._keys - keys)]
        self._keys = keys
        return items + gone
