# -*- coding: utf-8 -*-
"""
Inline FAB-compare sample, by-site LONG format (one row per wafer x item x site), BSL = FAB18, CIP = FAB15.
Columns: Wafer ID, Lot ID, Part6, Current FAB Name, Step, Meas Time, Item, Site, Site X, Site Y, Value
Embedded stories:
  TMWF54 : FAB15 M13 post-CMP THK -3.5% and stronger edge roll-off (within-wafer non-uniformity up)
  TMTQ11 : FAB15 V12 via CD -2.6 nm (mean shift)
  TMRX12 : FAB15 M12 trench CD +2.0 nm and wafer-to-wafer variation x1.8 (chamber mismatch)
  TMRF89 : matched
"""
import os
import numpy as np, pandas as pd
from datetime import datetime, timedelta

rng = np.random.default_rng(20261005)
HERE = os.path.dirname(os.path.abspath(__file__))
SITES = [(1, 0, 0)] + [(2 + i, 70 * np.cos(a), 70 * np.sin(a)) for i, a in enumerate(np.radians([90, 0, 270, 180]))] \
      + [(6 + i, 135 * np.cos(a), 135 * np.sin(a)) for i, a in enumerate(np.radians([45, 315, 225, 135]))]
ITEMS = [  # item, step, nominal, wafer sigma, site sigma, radial coeff
    ("M12 CD AEI", "M12_ETCH_AEI", 48.0, 0.6, 0.35, 1.2),
    ("M13 CD AEI", "M13_ETCH_AEI", 64.0, 0.8, 0.40, 1.5),
    ("V11 CD AEI", "V11_ETCH_AEI", 46.0, 0.7, 0.35, -1.0),
    ("V12 CD AEI", "V12_ETCH_AEI", 46.0, 0.7, 0.35, -1.0),
    ("M12 THK", "M12_CMP", 1150.0, 15.0, 8.0, -25.0),
    ("M13 THK", "M13_CMP", 1500.0, 20.0, 10.0, -30.0),
]
PARTS = {"TMRX12": (14, 3), "TMWF54": (18, 6), "TMTQ11": (16, 4), "TMRF89": (14, 3)}
t0 = datetime(2026, 4, 1)
rows, lot_no = [], 500
for part, (nb, nc) in PARTS.items():
    for fab, nl in (("FAB18", nb), ("FAB15", nc)):
        for _ in range(nl):
            lot_no += 1
            lot = f"{rng.choice(['UNV', 'UPA', 'UPM'])}{lot_no}"
            day = rng.uniform(0, 180) if fab == "FAB18" else rng.uniform(150, 182)
            lot_eff = {it[0]: rng.normal(0, it[3] * 0.8) for it in ITEMS}
            for w in rng.choice(np.arange(1, 26), size=6, replace=False):       # 6 sampled wafers / lot
                for item, step, nom, wsd, ssd, rad in ITEMS:
                    mean = nom + lot_eff[item] + rng.normal(0, wsd * 0.6)
                    edge = rad
                    if fab == "FAB15":
                        if part == "TMWF54" and item == "M13 THK": mean *= 0.965; edge = rad * 3.0
                        if part == "TMTQ11" and item == "V12 CD AEI": mean -= 2.6
                        if part == "TMRX12" and item == "M12 CD AEI": mean += 2.0 + rng.normal(0, wsd * 2.0)
                    tm = t0 + timedelta(days=day, hours=float(rng.uniform(0, 8)))
                    for sid, x, y in SITES:
                        r = np.hypot(x, y) / 150
                        v = mean + edge * r ** 4 + rng.normal(0, ssd)
                        rows.append({"Wafer ID": f"{lot}.{int(w):02d}", "Lot ID": lot, "Part6": part, "Current FAB Name": fab,
                                     "Step": step, "Meas Time": tm.replace(microsecond=0), "Item": item, "Site": sid,
                                     "Site X": round(x, 1), "Site Y": round(y, 1), "Value": round(v, 2)})
df = pd.DataFrame(rows).sort_values(["Meas Time", "Wafer ID", "Item", "Site"]).reset_index(drop=True)
out = os.path.join(HERE, "INLINE_FAB_compare.xlsx")
df.to_excel(out, index=False, sheet_name="INLINE_by_site")
print(out, df.shape)
