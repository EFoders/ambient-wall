"""Album-art cache (ambient/art.py) and GET /api/art/{id}: happy path, size cap (declared and streamed),
content-type and magic-number checks, failure memo, LRU eviction by count and bytes, rescan, the pool
hook, and the route (content type, cache headers, 404s, traversal attempts). MockTransport only."""
from __future__ import annotations

import asyncio
import hashlib
import time
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from ambient.art import ArtCache, ArtError, art_id, sniff
from ambient.config import build_config
from ambient.server import Paths, create_app
from ambient.signal import Signal

JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + bytes(range(256)) * 4
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + bytes(200)
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + bytes(100)
URL = "https://i.scdn.co/image/ab67616d0000b273mezzanine640"


class Images:
    """Fake image host: path -> (status, content type, body); counts requests."""

    def __init__(self, routes=None):
        self.routes = routes or {}
        self.calls: list[str] = []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        self.calls.append(str(req.url))
        status, ctype, body = self.routes.get(req.url.path, (404, "text/plain", b"nope"))
        headers = {"content-type": ctype} if ctype else {}
        if callable(body):                       # streamed body without content-length
            return httpx.Response(status, headers=headers, content=body())
        return httpx.Response(status, headers=headers, content=body)


def cache(tmp_path, images, **kw) -> ArtCache:
    return ArtCache(tmp_path / "art", httpx.AsyncClient(transport=httpx.MockTransport(images)), **kw)


# ------------------------------------------------------------------------------ fetching

async def test_happy_path_jpeg_png_webp(tmp_path):
    imgs = Images({"/a.jpg": (200, "image/jpeg", JPEG), "/b": (200, "image/png; charset=binary", PNG),
                   "/c": (200, "image/webp", WEBP)})
    c = cache(tmp_path, imgs)
    for path, ext, ctype, body in (("/a.jpg", "jpg", "image/jpeg", JPEG), ("/b", "png", "image/png", PNG),
                                   ("/c", "webp", "image/webp", WEBP)):
        url = f"https://img.example{path}"
        assert c.url_for(url) is None
        ident = await c.fetch(url)
        assert ident == hashlib.sha1(url.encode()).hexdigest() == art_id(url)
        f = tmp_path / "art" / f"{ident}.{ext}"
        assert f.read_bytes() == body
        assert c.url_for(url) == f"/api/art/{ident}"
        assert c.open(ident) == (f, ctype)
    assert not list((tmp_path / "art").glob("*.part"))
    assert sniff(b"GIF89a") is None


async def test_want_runs_in_background_once_and_calls_on_ready(tmp_path):
    imgs = Images({"/image/ab67616d0000b273mezzanine640": (200, "image/jpeg", JPEG)})
    ready = []
    c = cache(tmp_path, imgs, on_ready=lambda: ready.append(1))
    t1 = c.want(URL)
    t2 = c.want(URL)                                   # in flight: same task, no second request
    assert t1 is t2 and t1 is not None
    assert c.url_for(URL) is None                      # never blocks: not there yet
    assert await t1 == art_id(URL)
    assert c.url_for(URL) == f"/api/art/{art_id(URL)}" and ready == [1]
    assert c.want(URL) is None                         # cached: nothing to do
    assert len(imgs.calls) == 1
    for bad in (None, "", 7, "ftp://x/y.jpg", "file:///etc/passwd", "javascript:alert(1)", "https://" + "a" * 3000):
        assert c.want(bad) is None
    await c.close()


async def test_oversize_declared_and_streamed(tmp_path):
    big = JPEG + bytes(3000)

    async def stream():
        for i in range(0, len(big), 500):
            yield big[i:i + 500]
    imgs = Images({"/declared": (200, "image/jpeg", big), "/streamed": (200, "image/jpeg", stream)})
    c = cache(tmp_path, imgs, max_bytes=2048)
    with pytest.raises(ArtError, match="over 2048") as e:
        await c.fetch("https://img.example/declared?sig=SEKRET")
    assert "SEKRET" not in str(e.value) and "img.example" in str(e.value)
    with pytest.raises(ArtError, match="over 2048"):
        await c.fetch("https://img.example/streamed")
    assert not any((tmp_path / "art").glob("*")) if (tmp_path / "art").exists() else True
    assert c.index == {}


def test_default_cap_is_2mb():
    assert ArtCache(Path(".")).max_bytes == 2_000_000


async def test_wrong_type_refused(tmp_path):
    imgs = Images({"/html": (200, "text/html", b"<html>hi</html>"),
                   "/gif": (200, "image/gif", b"GIF89a" + bytes(50)),
                   "/none": (200, None, JPEG),
                   "/svg": (200, "image/svg+xml", b"<svg onload=alert(1)>"),
                   "/liar": (200, "image/jpeg", b"<script>alert(1)</script>"),
                   "/pngasjpeg": (200, "image/jpeg", PNG),
                   "/missing": (404, "image/jpeg", JPEG)})
    c = cache(tmp_path, imgs)
    for path, match in (("/html", "not a jpeg/png/webp"), ("/gif", "image/gif"), ("/none", "no type"),
                        ("/svg", "svg"), ("/liar", "does not match"), ("/pngasjpeg", "does not match"),
                        ("/missing", "HTTP 404")):
        with pytest.raises(ArtError, match=match):
            await c.fetch(f"https://img.example{path}")
    assert c.index == {}


async def test_failures_are_remembered_then_retried(tmp_path):
    imgs = Images({"/x": (500, "text/plain", b"")})
    clock = [100.0]
    c = cache(tmp_path, imgs, retry_after_s=600, clock=lambda: clock[0])
    url = "https://img.example/x"
    assert await c.want(url) is None                   # failed (task result None)
    assert c.errors and "HTTP 500" in c.errors[-1]
    assert c.want(url) is None and len(imgs.calls) == 1        # not hammered
    clock[0] += 601
    imgs.routes["/x"] = (200, "image/jpeg", JPEG)
    assert await c.want(url) == art_id(url) and len(imgs.calls) == 2

    def boom(req):
        raise httpx.ConnectError("down")
    c2 = ArtCache(tmp_path / "art2", httpx.AsyncClient(transport=httpx.MockTransport(boom)))
    with pytest.raises(ArtError, match="ConnectError"):
        await c2.fetch(url)


# ------------------------------------------------------------------------------ LRU

async def test_lru_eviction_by_count(tmp_path):
    imgs = Images({f"/{i}": (200, "image/jpeg", JPEG) for i in range(4)})
    c = cache(tmp_path, imgs, max_files=3)
    ids = [await c.fetch(f"https://img.example/{i}") for i in range(3)]
    assert c.open(ids[0]) is not None                  # touch 0: now 1 is the least recently used
    ids.append(await c.fetch("https://img.example/3"))
    assert set(c.index) == {ids[0], ids[2], ids[3]}
    assert not (tmp_path / "art" / f"{ids[1]}.jpg").exists()
    assert len(list((tmp_path / "art").glob("*.jpg"))) == 3
    assert c.url_for("https://img.example/1") is None


async def test_lru_eviction_by_total_bytes(tmp_path):
    imgs = Images({f"/{i}": (200, "image/jpeg", JPEG) for i in range(3)})
    c = cache(tmp_path, imgs, max_total_bytes=len(JPEG) * 2)
    ids = [await c.fetch(f"https://img.example/{i}") for i in range(3)]
    assert set(c.index) == set(ids[1:]) and c.total_bytes() == 2 * len(JPEG)


async def test_rescan_rebuilds_index_and_keeps_lru_order(tmp_path):
    imgs = Images({f"/{i}": (200, "image/jpeg", JPEG) for i in range(3)})
    c = cache(tmp_path, imgs)
    ids = [await c.fetch(f"https://img.example/{i}") for i in range(3)]
    c.open(ids[0])
    d = tmp_path / "art"
    (d / "junk.txt").write_text("x")
    (d / ("f" * 40 + ".exe")).write_bytes(b"MZ")
    (d / f"{'e' * 40}.jpg.part").write_bytes(b"half")
    c2 = ArtCache(d, None, max_files=2)
    assert c2.scan() == 2
    assert set(c2.index) == {ids[0], ids[2]}           # 1 was least recently used (mtime survives)
    assert not (d / f"{'e' * 40}.jpg.part").exists()
    assert c2.open("f" * 40) is None and c2.open("../junk") is None


async def test_open_rejects_bad_ids_and_vanished_files(tmp_path):
    imgs = Images({"/0": (200, "image/jpeg", JPEG)})
    c = cache(tmp_path, imgs)
    ident = await c.fetch("https://img.example/0")
    for bad in ("", "..", "../" + ident, ident.upper(), ident + ".jpg", ident[:-1], None, 5):
        assert c.open(bad) is None
    (tmp_path / "art" / f"{ident}.jpg").unlink()
    assert c.open(ident) is None and ident not in c.index


async def test_watch_only_fetches_for_the_bound_signal(tmp_path):
    imgs = Images({"/m.jpg": (200, "image/jpeg", JPEG), "/o.jpg": (200, "image/jpeg", JPEG)})
    c = cache(tmp_path, imgs)
    hook = c.watch(lambda: ["music.now"])
    hook([Signal(source="other", key="now", value={"art_url": "https://img.example/o.jpg"}),
          Signal(source="music", key="now", value={"title": "x", "art_url": "https://img.example/m.jpg"}),
          Signal(source="music", key="now", value=None)])
    await asyncio.gather(*c._inflight.values())
    assert imgs.calls == ["https://img.example/m.jpg"]
    c.watch([])([Signal(source="music", key="now", value={"art_url": "https://img.example/o.jpg"})])
    assert not c._inflight


# ------------------------------------------------------------------------------ server route + push

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("ambient.scheduler.RULES", {})
    imgs = Images({"/image/ab67616d0000b273mezzanine640": (200, "image/jpeg", JPEG)})
    fe = tmp_path / "frontend"
    fe.mkdir()
    (fe / "index.html").write_text("<!doctype html><title>wall</title>", encoding="utf-8")
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "secret.txt").write_text("TOP-SECRET-FILE", encoding="utf-8")
    doc = {"location": {"name": "Home", "lat": 45.9, "lon": -77.3, "timezone": "America/Toronto"},
           "source": [{"name": "music", "type": "push", "ttl": "1m"}]}
    cfg = build_config(doc, known_types={"push"})
    paths = Paths(config_dir=tmp_path, data_dir=tmp_path / "data", frontend_dir=fe, plugins_dir=tmp_path / "p")
    http = httpx.AsyncClient(transport=httpx.MockTransport(imgs))
    with TestClient(create_app(cfg=cfg, paths=paths, http=http, debounce_s=0.02)) as c:
        c.images = imgs
        yield c


def wait_for(fn, timeout=3.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        v = fn()
        if v:
            return v
        time.sleep(0.02)
    raise AssertionError("condition not met in time")


def test_push_now_playing_then_art_is_cached_and_served(client):
    value = {"title": "Teardrop", "artist": "Massive Attack", "album": "Mezzanine", "is_playing": True,
             "progress_ms": 81000, "duration_ms": 330000, "art_url": URL}
    r = client.post("/api/publish/music", json={"key": "now", "value": value})
    assert r.status_code == 200 and r.json()["accepted"] == 1
    np = client.get("/api/wall").json()["signals"]["nowPlaying"]
    assert np["title"] == "Teardrop" and np["isPlaying"] is True and np["source"] == "music"
    art = wait_for(lambda: client.get("/api/wall").json()["signals"]["nowPlaying"]["art"])
    assert art == f"/api/art/{art_id(URL)}"
    r = client.get(art)
    assert r.status_code == 200 and r.content == JPEG
    assert r.headers["content-type"] == "image/jpeg"
    assert "immutable" in r.headers["cache-control"] and r.headers["x-content-type-options"] == "nosniff"
    assert client.images.calls == [URL]                          # fetched once, by the backend
    # clearing it
    assert client.post("/api/publish/music", json={"key": "now", "value": None}).status_code == 200
    assert client.get("/api/wall").json()["signals"]["nowPlaying"] is None


@pytest.mark.parametrize("path", [
    "/api/art/" + "0" * 40,                      # well-formed, not cached
    "/api/art/" + "A" * 40,                      # uppercase
    "/api/art/xyz",
    "/api/art/..%2Fsecret.txt",
    "/api/art/..%2F..%2Fdata%2Fsecret.txt",
    "/api/art/%2e%2e%2fsecret.txt",
    "/api/art/..\\secret.txt",
    "/api/art/....//secret.txt",
    "/api/art/" + "0" * 40 + ".jpg",
    "/api/art/" + "0" * 40 + "%00",
])
def test_art_route_404s_and_traversal(client, path):
    r = client.get(path)
    assert r.status_code == 404
    assert b"TOP-SECRET-FILE" not in r.content


def test_traversal_with_raw_dots(client):
    # httpx normalises "/api/art/../../x" before sending; the server must still not serve data files
    for path in ("/api/art/../../data/secret.txt", "/api/art/../secret.txt", "/secret.txt", "/data/secret.txt"):
        r = client.get(path)
        assert r.status_code == 404 and b"TOP-SECRET-FILE" not in r.content
