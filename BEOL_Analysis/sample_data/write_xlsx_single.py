# -*- coding: utf-8 -*-
"""Single-sheet versions: spec / site map merged into the data table."""
import os, pickle, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("OUT_DIR", HERE)
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

d = pickle.load(open(os.path.join(HERE, "beol.pkl"), "rb"))
df_h, df_v, spec, sitemap = d["df_h"], d["df_v"], d["spec"], d["sitemap"]
F = "Arial"; DT = "yyyy/mm/dd hh:mm:ss"
HDR = PatternFill("solid", fgColor="DDEBF7")
SPEC = PatternFill("solid", fgColor="FFF2CC")
sp = spec.set_index("Item")

def cellval(x):
    if x is None or x is pd.NaT: return None
    if isinstance(x, float) and pd.isna(x): return None
    if isinstance(x, pd.Timestamp): return x.to_pydatetime()
    return x

def finish(ws, cols, fmt, widths):
    for c in ws[1]:
        c.font = Font(name=F, bold=True); c.fill = HDR; c.alignment = Alignment(horizontal="center")
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.font = Font(name=F)
    for i, col in enumerate(cols, 1):
        ws.column_dimensions[get_column_letter(i)].width = widths.get(col, max(12, len(str(col)) * 1.5 + 2))
        if col in fmt:
            for (c,) in ws.iter_rows(min_row=2, min_col=i, max_col=i):
                if not isinstance(c.value, str):
                    c.number_format = fmt[col]

# ---------------- horizontal: spec rows directly under the header ----------------
wb = Workbook(); ws = wb.active; ws.title = "BEOL_by_wafer"
cols = list(df_h.columns)
ws.append(cols)
for row in df_h.itertuples(index=False):
    ws.append([cellval(x) for x in row])
fmt = {"WAT 量測時間": DT, "特定站點過貨時間": DT, "Rc_TV1": "0.0000", "Rc_TV2": "0.0000",
       "Con_TM1": "0.00", "Con_TM2": "0.00", "TM1_CD": "0.00", "TM2_CD": "0.00",
       "TM1_THK": "0.0", "TM2_THK": "0.0"}
finish(ws, cols, fmt, {"WAT 量測時間": 20, "特定站點過貨時間": 20})
ws.freeze_panes = "B2"
ws.auto_filter.ref = ws.dimensions
wb.save(os.path.join(OUT, "BEOL_horizontal_by_wafer.xlsx"))

# ---------------- vertical: spec + site coordinates as columns ----------------
v = df_v.copy()
xy_in = sitemap[sitemap.Type == "Inline"].set_index("Site ID")
xy_w = sitemap[sitemap.Type == "WAT"].set_index("Site ID")
for side, item_col, site_col, xy in [("Inline", "Inline item name", "Site ID", xy_in),
                                     ("WAT", "WAT item name", "WAT site", xy_w)]:
    for key in ["Unit", "LSL", "Target", "USL"]:
        v[f"{side} {key}"] = v[item_col].map(sp[key])
    v[f"{side} Site X"] = v[site_col].map(xy["X (mm)"])
    v[f"{side} Site Y"] = v[site_col].map(xy["Y (mm)"])
order = ["Wafer ID", "Lot ID", "過貨站點", "站點時間",
         "Inline item name", "Inline Site value", "Site ID",
         "Inline Unit", "Inline LSL", "Inline Target", "Inline USL", "Inline Site X", "Inline Site Y",
         "WAT item name", "WAT site value", "WAT site", "WAT 時間",
         "WAT Unit", "WAT LSL", "WAT Target", "WAT USL", "WAT Site X", "WAT Site Y"]
v = v[order]
wb = Workbook(); ws = wb.active; ws.title = "BEOL_by_site"
ws.append(order)
for row in v.itertuples(index=False):
    ws.append([cellval(x) for x in row])
finish(ws, order, {"站點時間": DT, "WAT 時間": DT, "Site ID": "0", "WAT site": "0"},
       {"站點時間": 20, "WAT 時間": 20, "過貨站點": 15})
ws.freeze_panes = "A2"
ws.auto_filter.ref = ws.dimensions
wb.save(os.path.join(OUT, "BEOL_vertical_by_site.xlsx"))
print("ok")
