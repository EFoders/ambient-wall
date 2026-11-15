import logging
import sys

from ambient import loader
from ambient.adapters.base import REGISTRY
from ambient.rules.base import RULES


def test_plugins_load_and_broken_plugin_is_skipped(tmp_path, caplog):
    (tmp_path / "good_core_test.py").write_text(
        "from ambient.adapters.base import Adapter, register\n"
        "from ambient.rules.base import rule\n"
        "@register('core_test_plugin_type')\n"
        "class P(Adapter):\n"
        "    async def fetch(self):\n"
        "        return []\n"
        "@rule('core_test_plugin_rule', inputs=['x.*'])\n"
        "def r(pool, now, cfg):\n"
        "    return []\n", encoding="utf-8")
    (tmp_path / "broken_core_test.py").write_text("raise RuntimeError('broken on purpose')\n", encoding="utf-8")
    (tmp_path / "_private.py").write_text("raise RuntimeError('must not be imported')\n", encoding="utf-8")
    try:
        with caplog.at_level(logging.ERROR, logger="ambient.loader"):
            rep = loader.load_plugins(tmp_path)
        assert "core_test_plugin_type" in REGISTRY and "core_test_plugin_rule" in RULES
        assert "ambient_plugins.good_core_test" in rep.loaded
        assert any("broken_core_test" in k for k in rep.failed)
        assert "broken_core_test.py" in caplog.text
        assert "ambient_plugins.broken_core_test" not in sys.modules
        # loading again is a no-op, not a "registered twice" error
        rep2 = loader.load_plugins(tmp_path)
        assert "ambient_plugins.good_core_test" in rep2.loaded
    finally:
        REGISTRY.pop("core_test_plugin_type", None)
        RULES.pop("core_test_plugin_rule", None)
        sys.modules.pop("ambient_plugins.good_core_test", None)


def test_missing_plugins_dir_is_fine(tmp_path):
    rep = loader.load_plugins(tmp_path / "nope")
    assert rep.loaded == [] and rep.failed == {}


def test_builtins_import():
    rep = loader.load_builtins()
    assert all(name.startswith(("ambient.adapters.", "ambient.rules.")) for name in rep.loaded)
    assert "ambient.adapters.base" in rep.loaded
