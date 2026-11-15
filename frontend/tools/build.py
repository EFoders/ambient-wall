#!/usr/bin/env python3
"""Inline every <script src> into one self-contained dist/ambient-wall.html.
Handy for the kiosk box or for previewing: one file, no server, no network."""
import pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / "index.html").read_text(encoding="utf-8")

def inline(m):
    src = m.group(1)
    code = (ROOT / src).read_text(encoding="utf-8").replace("</script>", "<\\/script>")
    return f"<script>/* {src} */\n{code}\n</script>"

out = re.sub(r'<script src="([^"]+)"></script>', inline, html)
dist = ROOT / "dist"; dist.mkdir(exist_ok=True)
(dist / "ambient-wall.html").write_text(out, encoding="utf-8")
print(f"wrote {dist / 'ambient-wall.html'} ({len(out)//1024} KB)")
