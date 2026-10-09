# -*- coding: utf-8 -*-
"""
WAT FAB-compare sample (BSL = FAB18, CIP = FAB15), by-wafer wide format, 4 products (Part6).
Column naming mimics typical WAT exports:  <item>~<unit>~Mean
Embedded stories (for testing the report's lights + wording):
  TMTQ11 : FAB15 V12 via CD ~2.6 nm smaller  -> Rc_V12 up (~+2σ)  ; V12 CD inline also shifted
  TMWF54 : FAB15 M13 Cu THK ~3% thinner      -> Con_M13 (Rs) up (~+1.6σ) ; M13 THK inline shifted
  TMRX12 : FAB15 M12 line CD wider (space↓)  -> LK_M12 ~2-3x (fold), SPA_M12 fail rate (reading < 20 V) up
  TMRF89 : all matched; FAB15 SPA_M13 not tested (blank) -> report must explain the grey cell
SPA = leakage test reported as a voltage, clamped at 20 V: healthy wafers read exactly 20.
"""
import os
import numpy as np, pandas as pd
from datetime import datetime, timedelta

rng = np.random.default_rng(20261004)
HERE = os.path.dirname(os.path.abspath(__file__))

PARTS = {  # part: (n_bsl_lots, n_cip_lots, base offsets)
    "TMRX12": (40, 3, 0.000),
    "TMWF54": (60, 12, 0.010),
    "TMTQ11": (50, 5, -0.005),
    "TMRF89": (45, 3, 0.004),
}
COND = "07084.100 VA12CUPH_5~Current FAB Name"
t0 = datetime(2026, 4, 1)

rows = []
lot_no = 100
for part, (nb, nc, off) in PARTS.items():
    for fab, nlots in (("FAB18", nb), ("FAB15", nc)):
        for li in range(nlots):
            lot_no += 1
            prefix = rng.choice(["UNV", "UPA", "UPM", "UNW", "UPC"])
            lot = f"{prefix}{lot_no:03d}"
            # BSL spread over ~6 months, CIP only in the last 4 weeks
            day = rng.uniform(0, 180) if fab == "FAB18" else rng.uniform(150, 182)
            t_lot = t0 + timedelta(days=day)
            # lot-level random effects
            l_m12cd, l_m13cd, l_v11, l_v12 = rng.normal(0, [0.8, 1.0, 0.8, 0.8])
            l_m12t, l_m13t = rng.normal(0, [25, 30])
            for w in range(1, 26):
                if rng.random() < 0.35:          # not every wafer is WAT tested
                    continue
                m12cd = 48 + l_m12cd + rng.normal(0, 0.6)
                m13cd = 64 + l_m13cd + rng.normal(0, 0.8)
                v11cd = 46 + l_v11 + rng.normal(0, 0.7)
                v12cd = 46 + l_v12 + rng.normal(0, 0.7)
                m12t = 1150 + l_m12t + rng.normal(0, 15)
                m13t = 1500 + l_m13t + rng.normal(0, 20)
                if fab == "FAB15":
                    if part == "TMTQ11": v12cd -= 2.6
                    if part == "TMWF54": m13t *= 0.955
                    if part == "TMRX12": m12cd += 2.2
                # ---- WAT (physics-flavoured) ----
                rho = 2.4e-8 * (1 + 30 / m12cd)                       # size effect
                con_m12 = rho / (m12t * 1e-10) * (1 + off) * rng.normal(1, 0.012)            # Ω/sq
                con_m13 = 2.3e-8 * (1 + 30 / m13cd) / (m13t * 1e-10) * (1 + off) * rng.normal(1, 0.012)
                rc_v11 = 9.5 * (46 / v11cd) ** 2 * (1 + off) * rng.normal(1, 0.035)            # Ω/via
                rc_v12 = 9.0 * (46 / v12cd) ** 2 * (1 + off) * rng.normal(1, 0.035)
                space12 = 96 - m12cd
                lk_m12 = 2e-11 * np.exp(-(space12 - 48) / 2.2) * rng.lognormal(0, 0.35)       # A
                lk_m13 = 1.5e-11 * np.exp(-(128 - m13cd - 64) / 2.8) * rng.lognormal(0, 0.35)
                # SPA: voltage reading of a leakage test, clamped at the 20 V compliance limit.
                # Healthy structure reads exactly 20; a leaky one reads the voltage where spec current is hit.
                def spa(space, base_space):
                    p_fail = 0.012 * np.exp((base_space - space) / 0.9)
                    return 20.0 if rng.random() > p_fail else round(float(rng.uniform(3, 19.5)), 2)
                spa_m12 = spa(space12, 48)
                spa_m13 = spa(128 - m13cd, 64)
                r = {
                    "Lot ID": lot, "Wafer ID": f"{lot}.{w:02d}",
                    "WAT Date": (t_lot + timedelta(hours=rng.uniform(0, 30))).replace(microsecond=0),
                    "Part6": part, COND: fab,
                    "Con_M12~OHM/SQ~Mean": con_m12, "Con_M13~OHM/SQ~Mean": con_m13,
                    "LK_M12~A~Mean": lk_m12, "LK_M13~A~Mean": lk_m13,
                    "Rc_V11~OHM~Mean": rc_v11, "Rc_V12~OHM~Mean": rc_v12,
                    "SPA_M12~V~Mean": spa_m12, "SPA_M13~V~Mean": spa_m13,
                    # inline (same wafer, joined from metrology)
                    "M12 CD AEI~nm": m12cd + rng.normal(0, 0.3), "M13 CD AEI~nm": m13cd + rng.normal(0, 0.3),
                    "V11 CD AEI~nm": v11cd + rng.normal(0, 0.3), "V12 CD AEI~nm": v12cd + rng.normal(0, 0.3),
                    "M12 THK~A": m12t + rng.normal(0, 6), "M13 THK~A": m13t + rng.normal(0, 8),
                }
                if part == "TMRF89" and fab == "FAB15":
                    r["SPA_M13~V~Mean"] = None          # not tested -> grey cell with a reason
                if rng.random() < 0.6:          # inline measured on sampled wafers only
                    pass
                else:
                    for k in ["M12 CD AEI~nm", "M13 CD AEI~nm", "V11 CD AEI~nm", "V12 CD AEI~nm", "M12 THK~A", "M13 THK~A"]:
                        r[k] = None
                rows.append(r)

df = pd.DataFrame(rows).sort_values(["WAT Date"]).reset_index(drop=True)
for c in df.columns:
    if c.startswith(("Con_", "Rc_")): df[c] = df[c].round(4)
    if c.startswith("LK_"): df[c] = df[c].apply(lambda v: float(f"{v:.4g}") if pd.notna(v) else v)
    if "CD" in c or "THK" in c: df[c] = df[c].round(2)
# ---- tool history columns (labels only: no measured value is changed, so earlier K / fold / rate stay identical)
#   V12_ETCH_CH : for TMTQ11 FAB15 the high-Rc wafers ran on CH_B (true tool signature); elsewhere random
#   M12_CMP_Tool: TMWF54 FAB15 wafers all on CMP03 while BSL spread over CMP01/02 -> confounded with the condition
#   M13_ETCH_CH : random everywhere (no effect)
rng2 = np.random.default_rng(7)
fab, part = df["07084.100 VA12CUPH_5~Current FAB Name"], df["Part6"]
df["V12_ETCH_CH"] = rng2.choice(["CH_A", "CH_B"], size=len(df))
m = (fab == "FAB15") & (part == "TMTQ11")
med = df.loc[m, "Rc_V12~OHM~Mean"].median()
df.loc[m, "V12_ETCH_CH"] = np.where(df.loc[m, "Rc_V12~OHM~Mean"] > med, "CH_B", "CH_A")
df["M12_CMP_Tool"] = rng2.choice(["CMP01", "CMP02"], size=len(df))
df.loc[(fab == "FAB15") & (part == "TMWF54"), "M12_CMP_Tool"] = "CMP03"
df["M13_ETCH_CH"] = rng2.choice(["CH_1", "CH_2", "CH_3"], size=len(df))
# ---- CP yield (by wafer): driven by the same stories (short bins follow LK/SPA, open bins follow Rc)
lk = np.log10(df["LK_M12~A~Mean"].clip(lower=1e-13))
short_bin = np.clip(1.5 + 2.2 * (lk - lk.median()) + rng2.normal(0, .5, len(df)), 0.2, 20)
open_bin = np.clip(1.0 + 1.6 * (df["Rc_V12~OHM~Mean"] - df["Rc_V12~OHM~Mean"].median()) + rng2.normal(0, .4, len(df)), 0.1, 15)
df["Yield (%)"] = (96.5 - short_bin - open_bin - rng2.normal(0, .8, len(df))).round(2)
df["Bin3_short (%)"] = short_bin.round(2)
df["Bin7_open (%)"] = open_bin.round(2)
out = os.path.join(HERE, "WAT_FAB_compare.xlsx")
with pd.ExcelWriter(out, engine="openpyxl") as xw:
    df.to_excel(xw, index=False, sheet_name="TMRX12_TMWF54_TMTQ11_TMRF89_WAT")
print(out, df.shape)
print(df.groupby(["Part6", COND]).size().unstack())
