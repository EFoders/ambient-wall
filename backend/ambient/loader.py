"""Import built-in adapters/rules and drop-in plugins so their @register / @rule decorators run.

Built-ins: every submodule of ambient.adapters and ambient.rules (pkgutil).
Plugins: every *.py in the plugins dir (not starting with "_"), imported by path as
`ambient_plugins.<stem>`. A module that fails to import logs an error and is skipped; it never
takes the wall down.
"""
from __future__ import annotations

import importlib
import importlib.util
import logging
import pkgutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger("ambient.loader")

PLUGIN_PACKAGE = "ambient_plugins"


@dataclass
class LoadReport:
    loaded: list[str] = field(default_factory=list)
    failed: dict[str, str] = field(default_factory=dict)


def load_builtins(report: LoadReport | None = None) -> LoadReport:
    report = report or LoadReport()
    from . import adapters, rules
    for pkg in (adapters, rules):
        for mod in sorted(pkgutil.iter_modules(pkg.__path__), key=lambda m: m.name):
            name = f"{pkg.__name__}.{mod.name}"
            try:
                importlib.import_module(name)
                report.loaded.append(name)
            except Exception as e:  # noqa: BLE001
                log.exception("built-in module %s failed to import; skipped", name)
                report.failed[name] = f"{type(e).__name__}: {e}"
    return report


def load_plugins(plugins_dir: Path | str | None, report: LoadReport | None = None) -> LoadReport:
    report = report or LoadReport()
    if not plugins_dir:
        return report
    d = Path(plugins_dir)
    if not d.is_dir():
        log.info("plugins dir %s not found; no plugins loaded", d)
        return report
    for path in sorted(d.glob("*.py")):
        if path.name.startswith("_"):
            continue
        modname = f"{PLUGIN_PACKAGE}.{path.stem}"
        if modname in sys.modules:          # already imported (re-registering would raise)
            report.loaded.append(modname)
            continue
        try:
            spec = importlib.util.spec_from_file_location(modname, path)
            if spec is None or spec.loader is None:
                raise ImportError(f"cannot load {path}")
            module = importlib.util.module_from_spec(spec)
            sys.modules[modname] = module
            spec.loader.exec_module(module)
            report.loaded.append(modname)
            log.info("plugin loaded: %s", path.name)
        except Exception as e:  # noqa: BLE001 - plugins are untrusted drop-ins
            sys.modules.pop(modname, None)
            log.error("plugin %s failed to load; skipped: %s: %s", path.name, type(e).__name__, e)
            report.failed[str(path)] = f"{type(e).__name__}: {e}"
    return report


def load_all(plugins_dir: Path | str | None = None) -> LoadReport:
    report = load_builtins()
    load_plugins(plugins_dir, report)
    return report
