"""google_sheet_finances against recorded-shape fixtures and a mocked Google (token, Sheets, Drive).
Not live-tested: there is no Google account in the test environment."""
from __future__ import annotations

import base64
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, unquote

import httpx
import pytest

pytest.importorskip("google.auth")
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402

from ambient.adapters._shared import OptionError, SourceError  # noqa: E402
from ambient.adapters.base import AdapterContext  # noqa: E402
from ambient.adapters.google_sheet_finances import (GoogleSheetFinances, Layout, col_index,  # noqa: E402
                                                    col_letter, monthly_totals, to_number)

FIX = Path(__file__).parent / "fixtures"
SETTINGS = {"location": {"timezone": "America/Toronto"}}
SHEET_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"


@pytest.fixture
def creds(tmp_path, monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                            serialization.NoEncryption()).decode()
    info = {"type": "service_account", "project_id": "p", "private_key_id": "k1", "private_key": pem,
            "client_email": "wall@p.iam.gserviceaccount.com", "token_uri": "https://oauth2.googleapis.com/token"}
    (tmp_path / "sa.json").write_text(json.dumps(info))
    monkeypatch.setenv("AMBIENT_CONFIG_DIR", str(tmp_path))
    return tmp_path


def google(calls, values=None, detail=None):
    values = values or json.loads((FIX / "sheet_summary_values.json").read_text())
    drive = json.loads((FIX / "sheet_drive_meta.json").read_text())

    def handler(req: httpx.Request):
        u = req.url
        calls.append((req.method, u.host, unquote(u.path), dict(u.params), req.headers.get("authorization")))
        if u.host == "oauth2.googleapis.com":
            form = parse_qs(req.content.decode())
            assert form["grant_type"] == ["urn:ietf:params:oauth:grant-type:jwt-bearer"]
            payload = form["assertion"][0].split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
            assert claims["scope"].split() == ["https://www.googleapis.com/auth/spreadsheets.readonly",
                                               "https://www.googleapis.com/auth/drive.metadata.readonly"]
            return httpx.Response(200, json={"access_token": "tok-123", "expires_in": 3599})
        if req.headers.get("authorization") != "Bearer tok-123":
            return httpx.Response(401)
        if u.host == "sheets.googleapis.com":
            if "'Summary'" in unquote(u.path):
                return httpx.Response(200, json=values)
            return httpx.Response(200, json=detail or {"values": []})
        if u.host == "www.googleapis.com":
            return httpx.Response(200, json=drive)
        return httpx.Response(404)
    return handler


def make(handler, **opts):
    ctx = AdapterContext(http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
                         log=logging.getLogger("test"), data_dir=Path("."), settings=SETTINGS)
    a = GoogleSheetFinances("finances", {"sheet_id": SHEET_ID, "credentials_file": "sa.json", **opts}, ctx)
    a.now = lambda: datetime(2026, 10, 9, 21, 0, tzinfo=timezone.utc)
    return a


async def test_month_from_summary_sheet(creds):
    calls = []
    a = make(google(calls))
    [m] = await a.fetch()
    assert m["key"] == "month" and m["type"] == "object"
    assert m["value"] == {"income": 6420, "spent": 3985, "net": 2435, "balance": 23595,
                          "month": "2026-10", "last_updated": "2026-10-08T17:00:00-04:00"}
    assert m["meta"]["column"] == "M"                 # D + (10 - 1)
    sheets = [c for c in calls if c[1] == "sheets.googleapis.com"][0]
    assert sheets[2] == f"/v4/spreadsheets/{SHEET_ID}/values/'Summary'!D22:O26"
    assert sheets[3]["valueRenderOption"] == "UNFORMATTED_VALUE"
    # token is cached across fetches
    await a.fetch()
    assert sum(1 for c in calls if c[1] == "oauth2.googleapis.com") == 1
    # only GETs go to the data APIs; the single POST is the token exchange
    assert {c[0] for c in calls if c[1] != "oauth2.googleapis.com"} == {"GET"}


async def test_custom_layout_and_detail(creds):
    calls = []
    detail = {"values": [
        ["Housing"], ["Rent", 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500],
        ["Monthly totals", 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1600],
        [], ["Food"], ["Groceries", 600, 610, 590, 620, 600, 640, 600, 610, 600, 655.5],
        ["Monthly totals", 600, 610, 590, 620, 600, 640, 600, 610, 600, 655.5]]}
    a = make(google(calls, detail=detail), detail=True)
    items = {i["key"]: i for i in await a.fetch()}
    assert items["detail.expenses"]["visibility"] == "ask"
    assert items["detail.expenses"]["value"] == [{"group": "Housing", "amount": 1600},
                                                 {"group": "Food", "amount": 655.5}]
    lay = Layout({"header_row": 2, "income_row": 3, "expenses_row": 4, "net_row": 5, "balance_row": 6,
                  "first_col": "B", "last_col": "M", "sheet": "Bob's"}, "f")
    assert lay.range() == "'Bob''s'!B2:M6"


def test_helpers():
    assert col_index("D") == 3 and col_index("O") == 14 and col_index("AA") == 26
    assert col_letter(3) == "D" and col_letter(26) == "AA"
    assert to_number("$1,234.50") == 1234.5 and to_number("(120.00)") == -120 and to_number("-") is None
    assert to_number(12.0) == 12.0 and to_number("") is None
    # header text locates the month even if columns shift
    lay = Layout({}, "f")
    vals = [["Feb", "Mar", "Oct"], [1, 2, 3], [0, 0, 1], [], [5, 6, 7]]
    m = lay.extract(vals, 10)
    assert (m["income"], m["spent"], m["net"], m["balance"], m["column"]) == (3, 1, 2, 7, "F")
    assert monthly_totals([["Monthly totals", 1, 2]], 1) == [{"group": "Total", "amount": 2}]


async def test_errors_never_leak_token(creds, tmp_path):
    a = make(lambda r: httpx.Response(400, json={"error": "invalid_grant", "error_description": "Bad key"}))
    with pytest.raises(SourceError, match="HTTP 400: Bad key"):
        await a.fetch()

    def sheets_down(req):
        if req.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "tok-SEKRET", "expires_in": 3599})
        return httpx.Response(403)
    with pytest.raises(SourceError) as ei:
        await make(sheets_down).fetch()
    assert "403" in str(ei.value) and "SEKRET" not in str(ei.value) and SHEET_ID not in str(ei.value)

    missing = make(google([]), credentials_file="nope.json")
    with pytest.raises(SourceError, match="not found"):
        await missing.fetch()
    (tmp_path / "user.json").write_text(json.dumps({"type": "authorized_user"}))
    with pytest.raises(SourceError, match="service-account"):
        await make(google([]), credentials_file="user.json").fetch()


def test_options(creds):
    with pytest.raises(OptionError, match="sheet_id"):
        make(google([]), sheet_id="short")
    with pytest.raises(OptionError, match="first_col"):
        make(google([]), first_col="O", last_col="D")
    with pytest.raises(OptionError, match="income_row"):
        make(google([]), income_row=0)
