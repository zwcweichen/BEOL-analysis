#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bundle src/ into single HTML files (BEOL_Analysis folder):
    BEOL_Report.html       full: every library inlined, works offline   (needs vendor/*.js)
    BEOL_Report_lite.html  lite: our code inlined, libraries from cdn.jsdelivr.net (small, easy to copy/paste)

    python build.py          # full (if vendor/ is present) + lite
    python build.py --lite   # lite only
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT
PAT = re.compile(r"<!--INLINE:([^>]+?)-->")
CDN = {
    "../vendor/xlsx.full.min.js": "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
    "../vendor/plotly.min.js": "https://cdn.jsdelivr.net/npm/plotly.js-dist-min@2.35.3/plotly.min.js",
    "../vendor/pptxgen.bundle.js": "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js",
}


def build(lite=False, entry="report.html", name="BEOL_Report"):
    tpl = (SRC / entry).read_text(encoding="utf-8")

    def repl(m):
        rel = m.group(1).strip()
        if lite and rel in CDN:
            return f'<script src="{CDN[rel]}"></script>'
        txt = (SRC / rel).resolve().read_text(encoding="utf-8")
        if rel.endswith(".css"):
            return f"<style>\n{txt}\n</style>"
        body = txt.replace("</script", "<\\/script")
        return f"<script>/* {rel} */\n{body}\n</script>"

    dst = OUT / (f"{name}_lite.html" if lite else f"{name}.html")
    dst.write_text(PAT.sub(repl, tpl), encoding="utf-8")
    print(f"built {dst.name} ({dst.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    have_vendor = all((SRC / rel).resolve().exists() for rel in CDN)
    if "--lite" not in sys.argv:
        if have_vendor:
            build()
        else:
            print("vendor/ 不完整，略過離線完整版；只產生 lite 版（需要能連到 cdn.jsdelivr.net）")
    build(lite=True)
