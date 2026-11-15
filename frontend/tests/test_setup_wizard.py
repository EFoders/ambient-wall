"""First-run setup wizard (setup.html + js/setup.js) and the wall's redirect to it (core.js firstRun), against the
fake backend's setup mode (tests/fake_backend.py, ctl {"setup": true}): the wall opens the wizard only when served by
a backend that says setup is needed (never with ?mock=1, ?preview=1, file:// or ?backend=), "Skip" keeps the demo,
and a walk through the steps posts exactly the expected answers. Run alone:

    uv run --with pytest --with pytest-timeout --with playwright --with pillow --with numpy pytest tests/test_setup_wizard.py -q
"""
import pytest

from conftest import FILE_URL, TZ, _attach_errors, poll, real_errors

CAL = "https://calendar.google.com/calendar/ical/abc%40group/private-0123/basic.ics"
SKIP_KEY = "ambient-wall.setup-skipped"


@pytest.fixture
def pages(browser):
    """pages(w, h) -> a fresh page in its own context (own localStorage), with .errors like open_page."""
    made = []

    def make(w=1280, h=800):
        pg = _attach_errors(browser.new_page(viewport={"width": w, "height": h}, timezone_id=TZ))
        made.append(pg)
        return pg
    yield make
    for pg in made:
        pg.close()


def wall_ready(pg):
    pg.wait_for_function("window.AW && AW._debug && window.__AW_FRAME", timeout=15000)


def setup_posts(fake, path=None):
    posts = fake.ctl()["setup_posts"]
    return [p["body"] for p in posts if path is None or p["path"] == path]


def place(pg):
    """Step 1: search, pick the Canadian result (the Environment Canada card appears)."""
    pg.fill("#q", "Pembroke")
    pg.click("#search")
    pg.click("#results button >> nth=0")
    pg.wait_for_selector("#ec-card:not([hidden])")


# ---------------------------------------------------------------- the redirect
def test_wall_opens_the_wizard_when_setup_is_needed(fake, pages):
    fake.ctl(setup=True)
    pg = pages()
    pg.goto(fake.base + "/")
    pg.wait_for_url("**/setup.html?from=wall", timeout=10000)
    pg.wait_for_selector("#h-place")
    assert pg.is_visible("#wizard") and pg.is_visible("#nav")
    assert real_errors(pg) == []


def test_no_redirect_without_a_first_run_backend(fake, pages):
    fake.ctl(setup=True)
    # mock and preview never connect, so never hear the hello
    for q in ("?mock=1", "?preview=1&mock=1", "?preview=1"):
        pg = pages()
        pg.goto(fake.base + "/" + q)
        wall_ready(pg)
        pg.wait_for_timeout(1200)
        assert pg.url == fake.base + "/" + q
        assert pg.evaluate("AW._debug.live.url") is None
    # file:// (also the dist build) talking to a backend elsewhere: connected, setup needed, still no redirect
    pg = pages()
    pg.goto(FILE_URL + f"?backend=127.0.0.1:{fake.port}")
    wall_ready(pg)
    assert poll(pg, "AW._debug.live.connected", timeout=10)
    pg.wait_for_timeout(800)
    assert pg.url.startswith("file:") and "setup.html" not in pg.url
    # ?setup=0 skips it once
    pg = pages()
    pg.goto(fake.base + "/?setup=0")
    wall_ready(pg)
    assert poll(pg, "AW._debug.live.connected", timeout=10)
    pg.wait_for_timeout(800)
    assert "setup.html" not in pg.url
    # a configured backend: no setup in hello, no redirect
    fake.ctl(setup=False)
    pg = pages()
    pg.goto(fake.base + "/")
    wall_ready(pg)
    assert poll(pg, "AW._debug.source() === 'live'", timeout=10)
    pg.wait_for_timeout(800)
    assert pg.url == fake.base + "/"
    assert real_errors(pg) == []


def test_skip_keeps_the_demo_and_hints_at_the_wizard(fake, pages):
    fake.ctl(setup=True)
    pg = pages()
    pg.goto(fake.base + "/")
    pg.wait_for_url("**/setup.html?from=wall", timeout=10000)
    pg.click("#skip")
    pg.wait_for_url(fake.base + "/", timeout=10000)
    wall_ready(pg)
    assert poll(pg, "AW._debug.live.connected", timeout=10)
    pg.wait_for_timeout(1000)
    assert pg.url == fake.base + "/"
    assert pg.evaluate(f"localStorage.getItem('{SKIP_KEY}')") == "1"
    assert poll(pg, "document.getElementById('setup-hint').style.display === 'block'", timeout=5)
    assert "setup.html" in pg.inner_text("#setup-hint")
    # set up elsewhere: the next hello has no setup, the hint and the skip flag go
    fake.ctl(setup=False, kick=True)
    assert poll(pg, "document.getElementById('setup-hint').style.display === 'none'", timeout=10)
    assert pg.evaluate(f"localStorage.getItem('{SKIP_KEY}')") is None
    assert real_errors(pg) == []


# ---------------------------------------------------------------- the wizard
def test_walkthrough_posts_the_expected_answers(fake, pages):
    fake.ctl(setup=True)
    pg = pages(w=390, h=844)                               # a phone
    pg.goto(fake.base + "/setup.html")
    pg.wait_for_selector("#h-place")
    assert pg.evaluate("document.documentElement.scrollWidth") <= 390     # no sideways scrolling

    pg.click("#next")                                      # no place yet: stays, says why
    assert pg.is_visible('[data-field="location"] .err-msg')
    assert pg.is_visible("#h-place")
    place(pg)
    assert pg.input_value("#loc-tz") == "America/Toronto" and pg.input_value("#loc-lat") == "45.8168"
    assert "Pembroke (ON)" in pg.inner_text("#ec-sites")
    pg.click("#next")

    pg.wait_for_selector("#h-hours")
    pg.fill("#work-start", "08:30")
    pg.click('#days label:has(input[value="5"])')         # not Friday
    pg.uncheck("#hour24")
    assert not pg.evaluate("Array.from(document.querySelectorAll('#themes iframe')).some((f) => f.src.includes('preview=1'))")
    pg.click("#next")

    # look: previews load only now, as mock + preview pages that never connect
    pg.wait_for_selector("#h-look")
    assert poll(pg, "Array.from(document.querySelectorAll('#themes iframe')).filter((f) => f.src.includes('mock=1&preview=1')).length >= 2", timeout=5)
    frame = next(f for f in pg.frames if "theme=cyberpunk" in f.url)
    frame.wait_for_function("window.AW && AW._debug && window.__AW_FRAME", timeout=15000)
    assert frame.evaluate("AW._debug.theme()") == "cyberpunk" and frame.evaluate("AW._debug.live.url") is None
    pg.click('.theme[data-theme="nature"]')
    assert pg.get_attribute('.theme[data-theme="nature"]', "aria-checked") == "true"
    pg.check("#cat")
    pg.select_option("#cat-coat", "ginger")
    pg.select_option("#boost", "1")
    # the previews on screen (the page scrolled down to the options) reload with the cat and the boost
    assert poll(pg, """(() => { const on = Array.from(document.querySelectorAll('#themes iframe'))
        .filter((f) => f.src.includes('preview=1'));
        return on.length > 0 && on.every((f) => f.src.includes('cat=ginger&boost=1')); })()""", timeout=5)
    pg.click("#next")

    # data: previews stop when the step closes
    pg.wait_for_selector("#h-data")
    assert poll(pg, "Array.from(document.querySelectorAll('#themes iframe')).every((f) => !f.src.includes('preview=1'))", timeout=5)
    pg.check('#news-presets input[data-label="BBC News"]')
    pg.click("#add-feed")
    pg.fill("#news-custom .feed-url", "https://feeds.example.org/valley.xml")
    pg.fill("#news-custom .feed-label", "Valley News")
    pg.check("#news-custom .feed-local")
    pg.click("#news-custom button:has-text('Test')")
    pg.wait_for_selector("#news-custom .msg.ok")
    assert "Fake headline for https://feeds.example.org/valley.xml" in pg.inner_text("#news-custom .msg.ok")
    pg.fill("#cal-url", CAL.replace("private-0123", "public"))
    assert "public address" in pg.inner_text("#cal-warn")
    pg.fill("#cal-url", CAL)
    assert pg.inner_text("#cal-warn") == ""
    pg.fill("#hosts .host-name", "homelab")
    pg.fill("#hosts .host-addr", "192.168.1.10")
    pg.click("#next")

    # review: summary + the backend's preview of config.toml
    pg.wait_for_selector("#h-review")
    assert poll(pg, "document.getElementById('toml').textContent.includes('fake config.toml')", timeout=5)
    summary = pg.inner_text("#summary")
    for s in ("Pembroke", "Environment Canada (Pembroke, ON)", "08:30–17:00", "Mon Tue Wed Thu", "12-hour",
              "Nature", "cat (ginger)", "projector boost low", "BBC News, Valley News", "homelab (192.168.1.10)"):
        assert s in summary, (s, summary)
    assert CAL not in summary                               # the secret address is not shown back
    assert pg.inner_text("#next") == "Save and start"
    pg.click("#next")
    pg.wait_for_selector("#state-saved:not([hidden])")
    assert pg.is_hidden("#nav")

    expected = {
        "location": {"name": "Pembroke", "lat": 45.8168, "lon": -77.1162, "timezone": "America/Toronto",
                     "region": "Renfrew County"},
        "envcanada": {"site": "s0000730", "province": "ON", "name": "Pembroke"},
        "schedule": {"work_start": "08:30", "work_end": "17:00", "work_days": [1, 2, 3, 4], "hour24": False},
        "look": {"theme": "nature", "cat": True, "cat_coat": "ginger", "sound": False, "boost": 1},
        "news": [{"url": "https://feeds.bbci.co.uk/news/rss.xml", "label": "BBC News"},
                 {"url": "https://feeds.example.org/valley.xml", "label": "Valley News", "local": True}],
        "calendar": {"url": CAL},
        "hosts": [{"name": "homelab", "address": "192.168.1.10"}],
        "spotify": None,
    }
    assert setup_posts(fake, "") == [expected]
    assert setup_posts(fake, "geocode") == [{"q": "Pembroke"}]
    assert setup_posts(fake, "ec-site") == [{"lat": 45.8168, "lon": -77.1162}]
    assert setup_posts(fake, "preview")[-1] == expected

    # "Open the wall": the backend is set up now, so the wall stays and goes live
    pg.click("#open-wall")
    pg.wait_for_url(fake.base + "/", timeout=10000)
    wall_ready(pg)
    assert poll(pg, "AW._debug.source() === 'live'", timeout=10)
    assert pg.url == fake.base + "/"
    assert real_errors(pg) == []


def test_field_errors_from_the_backend_land_on_their_fields(fake, pages):
    fake.ctl(setup=True, setup_fail="errors")
    pg = pages()
    pg.goto(fake.base + "/setup.html")
    pg.wait_for_selector("#h-place")
    place(pg)
    pg.click('#steps li[data-step="3"] button')
    pg.fill("#hosts .host-name", "pc")
    pg.fill("#hosts .host-addr", "bad host!")
    pg.click('#steps li[data-step="4"] button')
    pg.wait_for_selector("#h-review")
    pg.click("#next")
    # back on the data step, the message under that computer's row, and listed at the top of review
    pg.wait_for_selector("#h-data")
    assert "an IP address" in pg.inner_text("#hosts .host .err-msg")
    assert pg.evaluate("document.querySelector('#hosts .host').classList.contains('invalid')")
    assert len(setup_posts(fake, "")) == 1
    assert pg.is_visible("#wizard")


def test_write_error_hands_the_file_back(fake, pages):
    fake.ctl(setup=True, setup_fail="write")
    pg = pages()
    pg.goto(fake.base + "/setup.html")
    pg.wait_for_selector("#h-place")
    place(pg)
    pg.click('#steps li[data-step="4"] button')
    pg.wait_for_selector("#h-review")
    pg.click("#next")
    pg.wait_for_selector("#state-write-error:not([hidden])")
    assert "Permission denied" in pg.inner_text("#we-msg")
    assert "chown" in pg.inner_text("#we-hint")
    assert "fake config.toml" in pg.input_value("#we-config")
    assert pg.is_hidden("#we-secrets-box")
    with pg.expect_download() as dl:
        pg.click('[data-download="we-config"]')
    assert dl.value.suggested_filename == "config.toml"
    pg.click("#we-back")
    assert pg.is_visible("#h-review")


def test_already_set_up_and_finished_elsewhere(fake, pages):
    fake.ctl(setup=False)
    pg = pages()
    pg.goto(fake.base + "/setup.html")
    pg.wait_for_selector("#state-already:not([hidden])")
    assert pg.is_hidden("#wizard") and pg.is_hidden("#nav")
    assert "config/config.toml" in pg.inner_text("#state-already")
    # the projector was sent here by the wall; someone finishes the setup from a phone: back to the wall
    fake.ctl(setup=True)
    pg2 = pages()
    pg2.goto(fake.base + "/")
    pg2.wait_for_url("**/setup.html?from=wall", timeout=10000)
    pg2.wait_for_selector("#h-place")
    fake.ctl(setup=False)
    pg2.wait_for_selector("#state-already:not([hidden])", timeout=12000)
    assert "another device" in pg2.inner_text("#already-note")
    pg2.wait_for_url(fake.base + "/", timeout=10000)
    wall_ready(pg2)
    assert real_errors(pg2) == []


def test_wizard_from_a_file_says_where_to_go(pages):
    pg = pages()
    pg.goto(FILE_URL.replace("index.html", "setup.html"))
    pg.wait_for_selector("#state-offline:not([hidden])")
    assert ":8700/setup.html" in pg.inner_text("#state-offline")
