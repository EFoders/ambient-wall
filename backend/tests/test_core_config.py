import logging
import textwrap
from pathlib import Path

import pytest

from ambient.config import ConfigError, RedactFilter, build_config, load_config, redact

KNOWN = {"fake", "ical", "push"}
REPO = Path(__file__).resolve().parents[2]


def write(d: Path, name: str, text: str) -> None:
    (d / name).write_text(textwrap.dedent(text), encoding="utf-8")


def test_interpolation_secrets_then_env(tmp_path, monkeypatch):
    monkeypatch.setenv("CORE_TEST_ENV_ONLY", "from-env")
    monkeypatch.setenv("CORE_TEST_BOTH", "env-loses")
    write(tmp_path, "secrets.toml", 'CORE_TEST_BOTH = "secret-wins"\nCORE_TEST_NUM = 42\n')
    write(tmp_path, "config.toml", """
        [[source]]
        name = "cal"
        type = "ical"
        url = "https://x/${CORE_TEST_BOTH}/${CORE_TEST_ENV_ONLY}?n=${CORE_TEST_NUM}"
        nested = { list = ["${CORE_TEST_ENV_ONLY}", 1] }
    """)
    cfg = load_config(tmp_path, known_types=KNOWN)
    s = cfg.source("cal")
    assert s.enabled
    assert s.options["url"] == "https://x/secret-wins/from-env?n=42"
    assert s.options["nested"]["list"] == ["from-env", 1]
    assert "name" not in s.options and "type" not in s.options


def test_unresolved_secret_disables_source_with_warning(tmp_path, caplog):
    write(tmp_path, "config.toml", """
        [[source]]
        name = "cal"
        type = "ical"
        url = "${CORE_TEST_DEFINITELY_UNSET}"

        [[source]]
        name = "ok"
        type = "fake"
    """)
    with caplog.at_level(logging.WARNING, logger="ambient.config"):
        cfg = load_config(tmp_path, known_types=KNOWN)
    cal = cfg.source("cal")
    assert not cal.enabled and "CORE_TEST_DEFINITELY_UNSET" in cal.disabled_reason
    assert cfg.source("ok").enabled
    assert "CORE_TEST_DEFINITELY_UNSET" in caplog.text and "cal" in caplog.text


def test_validation_errors_are_collected():
    doc = {"source": [
        {"name": "a", "type": "fake"},
        {"name": "a", "type": "fake"},
        {"name": "b", "type": "nope"},
        {"type": "fake"},
        {"name": "rules", "type": "fake"},
        {"name": "bad.name", "type": "fake"},
        {"name": "c", "type": "fake", "every": "soon"},
        {"name": "d", "type": "fake", "visibility": "loud"},
    ]}
    with pytest.raises(ConfigError) as e:
        build_config(doc, known_types=KNOWN)
    msg = str(e.value)
    assert "duplicate name" in msg
    assert "unknown type 'nope'" in msg and "known types: fake, ical, push" in msg
    assert "missing `name`" in msg
    assert "reserved" in msg
    assert "letters, digits" in msg
    assert "bad duration 'soon'" in msg
    assert "visibility" in msg


def test_global_validation():
    with pytest.raises(ConfigError) as e:
        build_config({"server": {"port": "x"}, "location": {"lat": 200, "timezone": "Mars/Base"},
                      "mode": {"work_start": "25:00", "work_days": [9]}}, known_types=KNOWN)
    msg = str(e.value)
    for frag in ("port", "lat", "timezone", "work_start", "work_days"):
        assert frag in msg


def test_push_is_always_a_known_type():
    cfg = build_config({"source": [{"name": "phone", "type": "push", "ttl": "30m"}]}, known_types=set())
    assert cfg.source("phone").ttl == 1800


def test_example_fallback_and_config_precedence(tmp_path):
    write(tmp_path, "config.example.toml", '[display]\ntheme = "nature"\n')
    assert load_config(tmp_path, known_types=KNOWN).display["theme"] == "nature"
    write(tmp_path, "config.toml", '[display]\ntheme = "classical"\n')
    cfg = load_config(tmp_path, known_types=KNOWN)
    assert cfg.display["theme"] == "classical" and cfg.path.name == "config.toml"


def test_missing_config_runs_on_defaults(tmp_path):
    cfg = load_config(tmp_path, known_types=KNOWN)
    assert cfg.sources == [] and cfg.server["port"] == 8700
    assert cfg.wall["weather_condition"] == "weather.now.condition"


def test_settings_have_no_secrets_and_no_server(monkeypatch):
    monkeypatch.setenv("CORE_TEST_PLACE", "Secret Cabin")
    cfg = build_config({"location": {"name": "${CORE_TEST_PLACE}", "lat": 1, "lon": 2},
                        "server": {"push_token": "${CORE_TEST_PLACE}"}}, known_types=KNOWN)
    assert cfg.location["name"] == "Secret Cabin"           # usable server-side
    st = cfg.settings()
    assert set(st) == {"location", "mode", "display"}
    assert "name" not in st["location"] and st["location"]["lat"] == 1
    assert "Secret Cabin" not in repr(st)
    assert st["mode"]["work_start"] == "07:00"


def test_unresolved_push_token_fails_closed():
    cfg = build_config({"server": {"push_token": "${CORE_TEST_UNSET_TOKEN}"}}, known_types=KNOWN)
    assert cfg.push_token is None and cfg.push_token_unresolved
    cfg = build_config({}, known_types=KNOWN)
    assert cfg.push_token is None and not cfg.push_token_unresolved


def test_redaction(monkeypatch):
    monkeypatch.setenv("CORE_TEST_REDACT", "hunter2-very-secret")
    build_config({"source": [{"name": "c", "type": "ical", "url": "https://h/${CORE_TEST_REDACT}"}]},
                 known_types=KNOWN)
    assert redact("GET https://h/hunter2-very-secret failed") == "GET https://h/*** failed"
    rec = logging.LogRecord("x", logging.WARNING, __file__, 1, "url %s", ("hunter2-very-secret",), None)
    RedactFilter().filter(rec)
    assert "hunter2" not in rec.getMessage()


def test_repo_example_config_is_valid():
    """config/config.example.toml must load with zero secrets (types the core can't see yet are allowed)."""
    import tomllib
    text = (REPO / "config" / "config.example.toml").read_text(encoding="utf-8")
    doc = tomllib.loads(text)
    types = {s["type"] for s in doc.get("source", [])}
    cfg = build_config(doc, known_types=types)
    assert any(s.type == "demo" and s.enabled for s in cfg.sources)
    for k in ("weather_condition", "weather_intensity", "weather_wind"):
        assert k in cfg.wall


def test_display_boost_default_and_validation(tmp_path):
    """[display] boost: 0..3, default 0, reaches the hello settings."""
    import pytest
    from ambient.config import ConfigError, load_config

    def write(extra):
        (tmp_path / "config.toml").write_text('[display]\n' + extra + '\n', encoding="utf-8")
        return load_config(tmp_path)

    assert write("").settings()["display"].get("boost", 0) == 0
    assert write("boost = 2").settings()["display"]["boost"] == 2
    for bad in ("boost = 4", "boost = -1", "boost = true", 'boost = "high"', "boost = 1.5"):
        with pytest.raises(ConfigError, match="boost"):
            write(bad)
