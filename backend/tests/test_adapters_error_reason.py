"""Secret-safe error reasons on failed GETs (adapters/_shared.error_reason)."""
import httpx

from ambient.adapters._shared import error_reason


def resp(status, body=None, text=None):
    if body is not None:
        return httpx.Response(status, json=body)
    return httpx.Response(status, text=text or "")


def test_google_error_shape():
    r = resp(403, {"error": {"code": 403, "status": "PERMISSION_DENIED", "message": "The caller does not have permission"}})
    assert error_reason(r) == ": PERMISSION_DENIED: The caller does not have permission"


def test_oauth_error_shape():
    assert error_reason(resp(400, {"error": "invalid_grant", "error_description": "Bad code"})) == ": invalid_grant: Bad code"


def test_urls_and_query_fragments_are_stripped():
    msg = ("Google Sheets API has not been used in project 123 before or it is disabled. Enable it by visiting "
           "https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=123&key=SECRET then retry.")
    out = error_reason(resp(403, {"error": {"status": "PERMISSION_DENIED", "message": msg}}), limit=400)
    assert "SECRET" not in out and "https://" not in out and "<link>" in out
    assert "has not been used in project 123" in out


def test_non_json_and_unknown_shapes_give_nothing():
    assert error_reason(resp(404, text="<html>Not Found</html>")) == ""
    assert error_reason(resp(404, {"detail": "nope"})) == ""
    assert error_reason(resp(500, [1, 2])) == ""


def test_length_is_capped():
    out = error_reason(resp(400, {"error": {"message": "x" * 1000}}), limit=50)
    assert len(out) <= 52 and out.endswith("…")
