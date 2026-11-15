"""google_sheet_finances: the "Annual budget <year>" Google Sheet (SPEC 5.4), read-only.

    [[source]]
    name = "finances"
    type = "google_sheet_finances"
    sheet_id = "1AbC..."                         # new file each year: change this one line
    credentials_file = "google-service-account.json"   # in config/ (/config in the container)
    every = "15m"
    # layout (defaults = SPEC 5.4):
    # sheet = "Summary"  header_row = 22  income_row = 23  expenses_row = 24  net_row = 25
    # balance_row = 26   first_col = "D"  last_col = "O"
    # detail = false     # true: also read Expenses/Income "Monthly totals" rows (ask-only)

Auth: a Google Cloud service account with the Sheets + Drive APIs enabled; share the sheet with
the service account's email (Viewer). The JSON key stays in config/ and is only used to sign a
token request to Google; scopes are read-only (spreadsheets.readonly, drive.metadata.readonly).
Requires the optional dependency group: `uv sync --extra google`.

Keys: month = {income, spent, net, balance, month "YYYY-MM", last_updated ISO (Drive modifiedTime)}
      detail.expenses / detail.income (ask, only with detail = true): [{group, amount}, ...]

Fixture-tested only (no live Google account in CI).
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

from ..signal import utcnow
from ._shared import OptionError, SourceError, config_dir, http_get_json, local_tz, opt, opt_duration
from .base import Adapter, register

SCOPES = ("https://www.googleapis.com/auth/spreadsheets.readonly "
          "https://www.googleapis.com/auth/drive.metadata.readonly")
SHEETS = "https://sheets.googleapis.com/v4/spreadsheets"
DRIVE = "https://www.googleapis.com/drive/v3/files"
MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]


def col_index(col: str) -> int:
    """'A' -> 0, 'D' -> 3, 'AA' -> 26."""
    n = 0
    for ch in col.upper():
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def col_letter(i: int) -> str:
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def to_number(v: Any) -> float | None:
    """Sheet cell -> number. Handles '$1,234.50', '(120.00)', '-', ''."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v
    s = str(v).strip()
    if s in ("", "-", "--"):
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = re.sub(r"[^\d.\-]", "", s)
    try:
        n = float(s)
    except ValueError:
        return None
    n = -abs(n) if neg else n
    return int(n) if n.is_integer() else round(n, 2)


def month_offset(headers: list[Any], month: int) -> int:
    """Index of the current month within the D..O header cells; header text wins, else month - 1."""
    for i, h in enumerate(headers):
        if isinstance(h, str) and h.strip().lower()[:3] == MONTHS[month - 1]:
            return i
    return month - 1


class Layout:
    def __init__(self, options: dict[str, Any], name: str):
        def row(k, d):
            v = opt(options, k, int, d, source=name)
            if v < 1:
                raise OptionError(f"source {name!r}: {k} must be >= 1")
            return v
        self.sheet = opt(options, "sheet", str, "Summary", source=name)
        self.header_row = row("header_row", 22)
        self.rows = {"income": row("income_row", 23), "spent": row("expenses_row", 24),
                     "net": row("net_row", 25), "balance": row("balance_row", 26)}
        first = opt(options, "first_col", str, "D", source=name).upper()
        last = opt(options, "last_col", str, "O", source=name).upper()
        if not (first.isalpha() and last.isalpha()) or col_index(last) < col_index(first):
            raise OptionError(f"source {name!r}: first_col/last_col must be column letters, first <= last")
        self.first, self.last = first, last
        self.top = min(self.header_row, *self.rows.values())
        self.bottom = max(self.header_row, *self.rows.values())

    def range(self) -> str:
        sheet = self.sheet.replace("'", "''")
        return f"'{sheet}'!{self.first}{self.top}:{self.last}{self.bottom}"

    def extract(self, values: list[list[Any]], month: int) -> dict[str, Any]:
        """values = the API's rows for range() (ragged: trailing empty cells are omitted)."""
        def cells(r):
            i = r - self.top
            return values[i] if 0 <= i < len(values) else []
        width = col_index(self.last) - col_index(self.first) + 1
        off = month_offset(cells(self.header_row)[:width], month)

        def cell(r):
            row = cells(r)
            return to_number(row[off]) if off < len(row) else None
        out = {k: cell(r) for k, r in self.rows.items()}
        if out["net"] is None and out["income"] is not None and out["spent"] is not None:
            out["net"] = round(out["income"] - out["spent"], 2)
        out["column"] = col_letter(col_index(self.first) + off)
        return out


def monthly_totals(values: list[list[Any]], off: int) -> list[dict[str, Any]]:
    """Category groups in an Expenses/Income sheet read as columns C..O: each 'Monthly totals' row
    belongs to the nearest label above it whose month cells are all empty (the group header)."""
    out, group = [], None
    for row in values:
        label = str(row[0]).strip() if row and row[0] is not None else ""
        nums = row[1:13] if len(row) > 1 else []
        if label and label.lower().startswith("monthly total"):
            amt = to_number(nums[off]) if off < len(nums) else None
            out.append({"group": group or "Total", "amount": amt})
        elif label and not any(to_number(c) is not None for c in nums):
            group = label
    return out


@register("google_sheet_finances")
class GoogleSheetFinances(Adapter):
    default_every = 900.0

    def __init__(self, name: str, options: dict[str, Any], ctx):
        super().__init__(name, options, ctx)
        self.sheet_id = opt(options, "sheet_id", str, source=name)
        if not re.fullmatch(r"[A-Za-z0-9_-]{20,}", self.sheet_id):
            raise OptionError(f"source {name!r}: sheet_id looks wrong (the long id from the sheet's URL)")
        cred = opt(options, "credentials_file", str, source=name)
        p = Path(cred).expanduser()
        self.credentials_file = p if p.is_absolute() else config_dir() / p
        self.layout = Layout(options, name)
        self.detail = opt(options, "detail", bool, False, source=name)
        self.timeout = opt_duration(options, "timeout", 20.0, source=name)
        self.tz = local_tz(ctx.settings)
        self._token: tuple[str, float] | None = None
        self._signer = None
        self._info: dict[str, Any] | None = None

    def now(self) -> datetime:
        return utcnow()

    # ------------------------------------------------------------------ auth
    def _load_key(self) -> None:
        try:
            from google.auth import crypt
        except ImportError:
            raise SourceError("google-auth is not installed (uv sync --extra google)") from None
        try:
            info = json.loads(self.credentials_file.read_text(encoding="utf-8"))
        except FileNotFoundError:
            raise SourceError(f"credentials file not found: {self.credentials_file.name} "
                              f"(put the service-account JSON in the config dir)") from None
        except ValueError:
            raise SourceError(f"credentials file {self.credentials_file.name} is not JSON") from None
        if info.get("type") != "service_account" or "client_email" not in info:
            raise SourceError("credentials file must be a service-account key (type = service_account)")
        self._signer = crypt.RSASigner.from_service_account_info(info)
        self._info = info

    async def token(self) -> str:
        if self._token and self._token[1] > time.time() + 60:
            return self._token[0]
        if self._signer is None:
            self._load_key()
        from google.auth import jwt
        now = int(time.time())
        token_uri = self._info.get("token_uri") or "https://oauth2.googleapis.com/token"
        assertion = jwt.encode(self._signer, {
            "iss": self._info["client_email"], "scope": SCOPES, "aud": token_uri,
            "iat": now, "exp": now + 3600})
        try:
            r = await self.ctx.http.post(token_uri, timeout=self.timeout, data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion.decode() if isinstance(assertion, bytes) else assertion})
        except Exception as e:  # noqa: BLE001
            raise SourceError(f"Google token request failed: {type(e).__name__}") from None
        if r.status_code != 200:
            try:
                err = r.json().get("error_description") or r.json().get("error")
            except ValueError:
                err = None
            raise SourceError(f"Google token request returned HTTP {r.status_code}{': ' + str(err) if err else ''}")
        body = r.json()
        self._token = (body["access_token"], time.time() + float(body.get("expires_in", 3600)))
        return self._token[0]

    async def api(self, url: str, params: dict[str, Any] | None = None) -> Any:
        headers = {"Authorization": f"Bearer {await self.token()}"}
        return await http_get_json(self.ctx.http, url, headers=headers, params=params, timeout=self.timeout)

    # ------------------------------------------------------------------ fetch
    async def values(self, rng: str) -> list[list[Any]]:
        doc = await self.api(f"{SHEETS}/{self.sheet_id}/values/{quote(rng, safe='')}",
                             {"valueRenderOption": "UNFORMATTED_VALUE", "majorDimension": "ROWS"})
        return doc.get("values") or []

    async def fetch(self):
        now = self.now().astimezone(self.tz)
        vals = await self.values(self.layout.range())
        m = self.layout.extract(vals, now.month)
        meta = await self.api(f"{DRIVE}/{self.sheet_id}",
                              {"fields": "modifiedTime,name", "supportsAllDrives": "true"})
        modified = meta.get("modifiedTime")
        last_updated = None
        if modified:
            last_updated = datetime.fromisoformat(modified.replace("Z", "+00:00")).astimezone(self.tz)
        value = {"income": m["income"], "spent": m["spent"], "net": m["net"], "balance": m["balance"],
                 "month": now.strftime("%Y-%m"),
                 "last_updated": last_updated.isoformat(timespec="seconds") if last_updated else None}
        out = [{"key": "month", "value": value, "type": "object",
                "meta": {"column": m["column"], "sheet": meta.get("name")}}]
        if self.detail:
            off = month_offset([], now.month)
            for tab, key in (("Expenses", "detail.expenses"), ("Income", "detail.income")):
                rows = await self.values(f"'{tab}'!C1:O400")
                out.append({"key": key, "value": monthly_totals(rows, off), "type": "series",
                            "visibility": "ask"})
        return out
