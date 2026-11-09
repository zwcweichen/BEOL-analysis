#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pack the BEOL_Analysis project into ONE self-extracting Python file.

    python tools/pack_beol.py
      -> dist/make_BEOL_Analysis.py       (with vendor libraries: offline HTML)
      -> dist/make_BEOL_Analysis_lite.py  (no vendor: lite HTML only, CDN)

The generated script needs only the Python 3.8+ standard library.
"""
import base64, hashlib, lzma, pathlib, datetime, textwrap

REPO = pathlib.Path(__file__).resolve().parent.parent
DIST = REPO / "dist"
# v3.14: also runnable from inside a deployed BEOL_Analysis folder (no beol/ sub-folder, AGENTS.md etc. at the root)
FLAT = not (REPO / "beol").is_dir()


def src_of(dst, src):
    return dst if FLAT else src

# destination inside BEOL_Analysis  ->  source in this repo
FILES = {
    "README.md": "beol/README.md",
    "AGENTS.md": "beol/AGENTS.md",
    "build.py": "beol/build.py",
    "src/report.html": "src/report.html",
    "src/report/report.css": "src/report/report.css",
    "src/report/theme_b.css": "src/report/theme_b.css",
    "src/report/rules_base.js": "src/report/rules_base.js",
    "src/report/rules.js": "src/report/rules.js",
    "src/report/engine.js": "src/report/engine.js",
    "src/report/app.js": "src/report/app.js",
    "src/js/core.js": "src/js/core.js",
    "src/js/importer.js": "src/js/importer.js",
    "src/js/transform.js": "src/js/transform.js",
    "src/js/stats.js": "src/js/stats.js",
    "docs/BEOL_REPORT.md": "docs/BEOL_REPORT.md",
    "docs/ROADMAP.md": "docs/ROADMAP.md",
    "docs/REFERENCES.md": "docs/REFERENCES.md",
    "docs/PPT_STYLE.md": "docs/PPT_STYLE.md",
    "docs/REFERENCES.xlsx": "docs/REFERENCES.xlsx",
    "docs/REVIEW_LOG.xlsx": "docs/REVIEW_LOG.xlsx",
    "docs/build_refs_xlsx.py": "docs/build_refs_xlsx.py",
    "docs/build_review_log.py": "docs/build_review_log.py",
    "docs/papers/README.md": "docs/papers/README.md",
    "sample_data/gen_wat_fab.py": "sample_data/gen_wat_fab.py",
    "sample_data/gen_inline_fab.py": "sample_data/gen_inline_fab.py",
    "sample_data/gen_variants.py": "sample_data/gen_variants.py",
    "sample_data/gen_trap.py": "sample_data/gen_trap.py",
    "sample_data/gen_fabrun.py": "sample_data/gen_fabrun.py",
    "sample_data/gen_sixcond.py": "sample_data/gen_sixcond.py",
    "sample_data/gen_pp.py": "sample_data/gen_pp.py",
    "sample_data/gen_scale.py": "sample_data/gen_scale.py",
    "sample_data/gen_big.py": "sample_data/gen_big.py",
    "sample_data/gen_tool_history.py": "sample_data/gen_tool_history.py",
    "sample_data/gen_beol.py": "sample_data/gen_beol.py",
    "sample_data/write_xlsx_single.py": "sample_data/write_xlsx_single.py",
    "tests/e2e_report.js": "tests/e2e_report.js",
    "tests/e2e_variants.js": "tests/e2e_variants.js",
    "tests/shot_items.js": "tests/shot_items.js",
    "tools/pack_beol.py": "tools/pack_beol.py",
    "tests/expected_beol.py": "tests/expected_beol.py",
    "tests/audit_cells.py": "tests/audit_cells.py",
}
VENDOR = {
    "vendor/plotly-cartesian.min.js": "vendor/plotly-cartesian.min.js",
    "vendor/xlsx.full.min.js": "vendor/xlsx.full.min.js",
    "vendor/pptxgen.bundle.js": "vendor/pptxgen.bundle.js",
}

TEMPLATE = r'''#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
BEOL_Analysis 專案產生器（{kind}）  版本 {version}　打包時間 {stamp}

只需要 Python 3.8 以上，不必安裝任何套件。執行後會產生整個 BEOL_Analysis 資料夾：
  BEOL_Report.html{full_note}、BEOL_Report_lite.html、src/、docs/、tests/、sample_data/

用法：
  python {script}                   在目前位置產生 BEOL_Analysis\
  python {script} D:\work\BEOL      產生到指定資料夾
  python {script} --no-samples      不產生範例資料（範例資料需要 numpy、pandas、openpyxl）
  python {script} --force           目標資料夾已有檔案時直接覆蓋

複製貼上這個檔案時，請整份複製並以 UTF-8 編碼存檔。每個檔案都附 SHA-256 檢查碼，內容不完整時會直接指出是哪個檔案。
"""
import base64, hashlib, lzma, os, subprocess, sys

VERSION = "{version}"
# path -> (sha256 of the original file, size in bytes, base64 of lzma-compressed bytes)
FILES = {{
{entries}
}}

GENERATORS = [  # (script, extra env) — run in this order, only when numpy/pandas/openpyxl are available
    ("sample_data/gen_wat_fab.py", {{}}),
    ("sample_data/gen_inline_fab.py", {{}}),
    ("sample_data/gen_variants.py", {{}}),
    ("sample_data/gen_trap.py", {{}}),
    ("sample_data/gen_fabrun.py", {{}}),
    ("sample_data/gen_sixcond.py", {{}}),
    ("sample_data/gen_pp.py", {{}}),
    ("sample_data/gen_scale.py", {{}}),
    ("sample_data/gen_big.py", {{}}),
    ("sample_data/gen_tool_history.py", {{}}),
    ("sample_data/gen_beol.py", {{}}),
    ("sample_data/write_xlsx_single.py", {{}}),
]


ENV = {{**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}}   # child scripts print UTF-8 even on a cp950 console
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass


def say(msg):
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode(), flush=True)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {{a for a in sys.argv[1:] if a.startswith("--")}}
    target = os.path.abspath(args[0] if args else "BEOL_Analysis")
    if os.path.isdir(target) and os.listdir(target) and "--force" not in flags:
        say(f"目標資料夾已有檔案：{{target}}\n若要覆蓋請加 --force，或換一個資料夾。")
        sys.exit(1)
    say(f"BEOL_Analysis 產生器 v{{VERSION}} → {{target}}")
    bad = []
    for rel, (sha, size, blob) in FILES.items():
        path = os.path.join(target, *rel.split("/"))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        try:
            data = lzma.decompress(base64.b64decode("".join(blob.split())))
        except Exception as e:  # noqa: BLE001 - corrupted copy/paste
            bad.append(f"{{rel}}（無法解壓：{{e.__class__.__name__}}）")
            continue
        if hashlib.sha256(data).hexdigest() != sha or len(data) != size:
            bad.append(f"{{rel}}（檢查碼不符）")
            continue
        with open(path, "wb") as f:
            f.write(data)
    if bad:
        say("以下檔案內容不完整，可能是複製時漏掉了一部分；請重新完整複製產生器：\n  " + "\n  ".join(bad))
        sys.exit(2)
    say(f"  已寫出 {{len(FILES)}} 個檔案，檢查碼全部正確")

    # ---- build the HTML tools
    r = subprocess.run([sys.executable, "build.py"], cwd=target, capture_output=True, text=True, encoding="utf-8", errors="replace", env=ENV)
    say("  " + (r.stdout.strip().replace("\n", "\n  ") or r.stderr.strip()))
    if r.returncode:
        say("  HTML 打包失敗：\n" + r.stderr)
        sys.exit(3)

    # ---- sample data (optional)
    if "--no-samples" in flags:
        say("  已略過範例資料（--no-samples）")
    else:
        try:
            import numpy, pandas, openpyxl  # noqa: F401
            ok = True
        except ImportError as e:
            ok = False
            say(f"  略過範例資料：缺少 {{e.name}}（pip install numpy pandas openpyxl 後可重跑 sample_data 內的 gen_*.py）")
        if ok:
            for script, env in GENERATORS:
                rr = subprocess.run([sys.executable, script], cwd=target, capture_output=True, text=True, encoding="utf-8", errors="replace", env={{**ENV, **env}})
                say(f"  {{'OK ' if rr.returncode == 0 else 'NG '}} {{script}}" + ("" if rr.returncode == 0 else "\n" + rr.stderr[-600:]))
            pkl = os.path.join(target, "sample_data", "beol.pkl")
            if os.path.exists(pkl):
                os.remove(pkl)

    say("\n完成。用瀏覽器打開：" + os.path.join(target, "{main_html}"))


if __name__ == "__main__":
    main()
'''


def entry(rel, data):
    blob = base64.b64encode(lzma.compress(data, preset=9 | lzma.PRESET_EXTREME)).decode()
    lines = textwrap.wrap(blob, 100)
    body = "\n".join(f"        {l}" for l in lines)
    return f'    "{rel}": ("{hashlib.sha256(data).hexdigest()}", {len(data)}, """\n{body}\n    """),'


def pack(with_vendor):
    files = dict(FILES, **(VENDOR if with_vendor else {}))
    entries = "\n".join(entry(dst, (REPO / src_of(dst, src)).read_bytes()) for dst, src in files.items())
    version = (REPO / "src/report/app.js").read_text(encoding="utf-8").split("App.VERSION = '")[1].split("'")[0]
    name = "make_BEOL_Analysis.py" if with_vendor else "make_BEOL_Analysis_lite.py"
    out = TEMPLATE.format(
        kind="完整版：內含程式庫，產生的 HTML 可離線使用" if with_vendor else "lite 版：不含程式庫，HTML 需連到 cdn.jsdelivr.net",
        version=version, stamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), script=name,
        full_note="（離線完整版）" if with_vendor else "（略過，lite 產生器不含程式庫）",
        entries=entries, main_html="BEOL_Report.html" if with_vendor else "BEOL_Report_lite.html")
    DIST.mkdir(exist_ok=True)
    (DIST / name).write_text(out, encoding="utf-8")
    print(f"packed {name}: {len(files)} files, {len(out.encode()) / 1e6:.2f} MB")


if __name__ == "__main__":
    pack(True)
    pack(False)
