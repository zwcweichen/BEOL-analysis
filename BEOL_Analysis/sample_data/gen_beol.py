# -*- coding: utf-8 -*-
"""
BEOL Cu interconnect sample data generator (TM1 / TV1 / TM2 / TV2)
Site-level ground truth -> vertical (by-site) file -> aggregate -> horizontal (by-wafer) file.
"""
import os, numpy as np, pandas as pd
from datetime import datetime, timedelta

rng = np.random.default_rng(20260926)

# ---------------- physics constants ----------------
RHO0 = 1.72e-8      # bulk Cu resistivity [ohm*m]
K_SIZE = 17.6       # nm, size-effect coefficient (~0.45*lambda_Cu, lambda=39nm)
RHO_TAN = 2.5e-6    # barrier resistivity [ohm*m]
L_LINE = 1e-3       # serpentine length 1 mm

def rho_eff(w, t):
    """Cu resistivity with surface/grain-boundary size effect, w,t in nm"""
    return RHO0 * (1 + K_SIZE * (1 / w + 1 / t))

def line_conductance_uS(cd, thk_A, tb=3.0):
    w = cd - 2 * tb
    t = thk_A / 10.0 - tb                  # A -> nm, bottom barrier
    area = w * t * 1e-18                   # m^2
    R = rho_eff(w, t) * L_LINE / area
    return 1e6 / R                         # uS

def via_res(d, h, tb, r_int):
    dcu = d - 2 * tb
    a_cu = np.pi / 4 * dcu ** 2 * 1e-18
    a_v = np.pi / 4 * d ** 2 * 1e-18
    r_cu = RHO0 * (1 + K_SIZE * 2 / dcu) * h * 1e-9 / a_cu
    r_b = RHO_TAN * tb * 1e-9 / a_v
    return r_cu + r_b + r_int

# ---------------- site maps (300 mm wafer, mm) ----------------
inline_sites = [(1, 0, 0)]
for i, ang in enumerate([90, 0, 270, 180]):
    inline_sites.append((2 + i, 70 * np.cos(np.radians(ang)), 70 * np.sin(np.radians(ang))))
for i, ang in enumerate([45, 315, 225, 135]):
    inline_sites.append((6 + i, 135 * np.cos(np.radians(ang)), 135 * np.sin(np.radians(ang))))
wat_sites = []
for i, ang in enumerate([45, 135, 225, 315]):
    wat_sites.append((1 + i, 50 * np.cos(np.radians(ang)), 50 * np.sin(np.radians(ang))))
for i, ang in enumerate(range(90, 90 - 360, -45)):
    wat_sites.append((5 + i, 125 * np.cos(np.radians(ang)), 125 * np.sin(np.radians(ang))))

def rnorm(x, y):
    return np.hypot(x, y) / 150.0

# local "true" process values vs radius
def true_TM1_CD(base, r):   return base + 1.6 * r ** 2          # edge wider
def true_TM1_THK(base, r):  return base * (1 - 0.035 * r ** 4)  # CMP edge roll-off
def true_TM2_CD(base, r):   return base + 2.0 * r ** 2
def true_TM2_THK(base, r):  return base * (1 - 0.025 * r ** 4)
def true_TV1_D(base, r):    return base - 3.0 * r ** 3          # via shrinks at edge
def true_TV2_D(base, r):    return base - 3.5 * r ** 3

# ---------------- lots / wafers ----------------
LOTS = [f"UAB{n}" for n in range(123, 135)]           # 12 lots
start0 = datetime(2026, 7, 1, 8, 0)
PAD_CHANGE = datetime(2026, 7, 31, 12, 0)                # TM2 CMP pad change
CHC_BAD_FROM = "UAB128"                                 # TV1 etch CH_C degraded after PM
SPLIT_LOTS = {"UAB129", "UAB131"}                       # thin TaN DOE on wafers 13-25
cmp_tool_by_lot = dict(zip(LOTS, ["CMP_A", "CMP_B", "CMP_A", "CMP_A", "CMP_B", "CMP_A",
                                  "CMP_B", "CMP_B", "CMP_A", "CMP_B", "CMP_A", "CMP_B"]))
chambers = ["CH_A", "CH_B", "CH_C"]
OPEN = 9.99e37

inline_rows, wat_rows, horiz_rows, truth = [], [], [], []

for li, lot in enumerate(LOTS):
    t_lot = start0 + timedelta(days=li * 4.2 + rng.uniform(0, 1))
    # lot-level random effects
    l_cd1 = rng.normal(0, 0.8); l_thk1 = rng.normal(0, 18)
    l_cd2 = rng.normal(0, 1.2); l_thk2 = rng.normal(0, 30)
    l_v1 = rng.normal(0, 1.0); l_v2 = rng.normal(0, 1.5)
    tool = cmp_tool_by_lot[lot]
    for w in range(1, 26):
        wid = f"{lot}.{w:02d}"
        parent = f"{lot}.00"
        is_split = lot in SPLIT_LOTS and w >= 13
        child = f"{lot}.01" if is_split else parent
        ch = chambers[(w - 1) % 3]
        # station times
        dw = timedelta(minutes=4 * w)
        t_tm1_aei = t_lot + dw
        t_tm1_cmp = t_lot + timedelta(hours=30) + dw
        t_tm2_aei = t_lot + timedelta(days=4.5) + dw * 1.1
        t_tm2_cmp = t_lot + timedelta(days=5.6) + dw
        t_wat = t_lot + timedelta(days=14 + rng.uniform(0, 0.4)) + timedelta(minutes=35 * w)

        # wafer-level bases
        cd1 = 90 + l_cd1 + rng.normal(0, 0.6)
        thk1 = 1600 + l_thk1 + rng.normal(0, 12) - (62 if tool == "CMP_B" else 0)
        cd2 = 180 + l_cd2 + rng.normal(0, 1.0)
        thk2 = 3200 + l_thk2 + rng.normal(0, 22) - (115 if t_tm2_cmp > PAD_CHANGE else 0)
        dv1 = 100 + l_v1 + rng.normal(0, 0.8)
        dv2 = 200 + l_v2 + rng.normal(0, 1.2)
        tb2 = 2.0 if is_split else 3.0
        chc_bad = (ch == "CH_C") and (lot >= CHC_BAD_FROM)

        scrapped = (wid == "UAB126.07")       # broken at TM2 CMP -> no TM2 inline, no WAT
        inline_sampled = (w % 2 == 1)

        # ---- inline site data ----
        site_vals = {}
        if inline_sampled:
            for sid, x, y in inline_sites:
                r = rnorm(x, y)
                meas = {
                    "TM1_CD": (true_TM1_CD(cd1, r) + rng.normal(0, 0.45), "TM1_ETCH_AEI", t_tm1_aei, parent),
                    "TM1_THK": (true_TM1_THK(thk1, r) + rng.normal(0, 8), "TM1_CMP", t_tm1_cmp, parent),
                }
                if not scrapped:
                    meas["TM2_CD"] = (true_TM2_CD(cd2, r) + rng.normal(0, 0.7), "TM2_ETCH_AEI", t_tm2_aei, child)
                    meas["TM2_THK"] = (true_TM2_THK(thk2, r) + rng.normal(0, 14), "TM2_CMP", t_tm2_cmp, child)
                for item, (v, stn, tt, lid) in meas.items():
                    v = round(v, 2 if "CD" in item else 1)
                    site_vals.setdefault(item, []).append(v)
                    inline_rows.append(dict(wafer=wid, lot=lid, stn=stn, t=tt, item=item,
                                            val=round(v, 2 if "CD" in item else 1), site=sid))

        # ---- WAT site data ----
        wvals = {"Con_TM1": [], "Con_TM2": [], "Rc_TV1": [], "Rc_TV2": []}
        if not scrapped:
            for sid, x, y in wat_sites:
                r = rnorm(x, y)
                c1 = line_conductance_uS(true_TM1_CD(cd1, r), true_TM1_THK(thk1, r)) * rng.normal(1, 0.006)
                c2 = line_conductance_uS(true_TM2_CD(cd2, r), true_TM2_THK(thk2, r)) * rng.normal(1, 0.006)
                rint1 = 0.15 + (0.26 + 0.25 * r ** 2 + abs(rng.normal(0, 0.08)) if chc_bad else 0)
                v1 = via_res(true_TV1_D(dv1, r), 200, 3.0, rint1) * rng.normal(1, 0.015)
                if chc_bad and rng.random() < 0.06 + 0.10 * (r > 0.6):
                    v1 = OPEN                                   # open via chain
                v2 = via_res(true_TV2_D(dv2, r), 300, tb2, 0.05) * rng.normal(1, 0.015)
                for k, v in zip(wvals, [c1, c2, v1, v2]):
                    if rng.random() < 0.004:                    # random missing test
                        v = np.nan
                    elif v != OPEN:
                        v = round(v, 4 if "Rc" in k else 2)
                    wvals[k].append(v)
                    wat_rows.append(dict(wafer=wid, lot=child, witem=k,
                                         wval=(v if (np.isnan(v) or v == OPEN) else round(v, 4 if "Rc" in k else 2)),
                                         wsite=sid, wt=t_wat))

        # ---- horizontal (wafer summary) ----
        def mean_or_blank(item):
            return round(float(np.mean(site_vals[item])), 2) if item in site_vals else None
        def median_or_blank(k):
            arr = np.array(wvals[k], dtype=float)
            arr = arr[~np.isnan(arr) & (arr < 1e30)]   # exclude missing & open
            return round(float(np.median(arr)), 4 if "Rc" in k else 2) if len(arr) else None
        horiz_rows.append({
            "Wafer ID": wid, "LOT ID": parent,
            "WAT 量測時間": None if scrapped else t_wat,
            "特定站點過貨時間": t_tm1_cmp,
            "Con_TM1": median_or_blank("Con_TM1"), "Con_TM2": median_or_blank("Con_TM2"),
            "Rc_TV1": median_or_blank("Rc_TV1"), "Rc_TV2": median_or_blank("Rc_TV2"),
            "TM1_CD": mean_or_blank("TM1_CD"), "TM1_THK": mean_or_blank("TM1_THK"),
            "TM2_CD": mean_or_blank("TM2_CD"), "TM2_THK": mean_or_blank("TM2_THK"),
            "Split": "Thin_TaN" if is_split else "POR",
            "TM1_CMP_Tool": tool, "TV1_ETCH_CH": ch,
        })

# ---------------- vertical table: inline block stacked on WAT block ----------------
cols_v = ["Wafer ID", "Lot ID", "過貨站點", "站點時間", "Inline item name", "Inline Site value",
          "Site ID", "WAT item name", "WAT site value", "WAT site", "WAT 時間"]
vert = []
for r in inline_rows:
    vert.append([r["wafer"], r["lot"], r["stn"], r["t"], r["item"], r["val"], r["site"], None, None, None, None])
for r in wat_rows:
    vert.append([r["wafer"], r["lot"], "WAT", None, None, None, None, r["witem"], r["wval"], r["wsite"], r["wt"]])
df_v = pd.DataFrame(vert, columns=cols_v)
# sort by wafer then inline-first (as a DB dump usually looks)
df_v["_o"] = df_v["Inline item name"].isna().astype(int)
st_order = {"TM1_ETCH_AEI": 0, "TM1_CMP": 1, "TM2_ETCH_AEI": 2, "TM2_CMP": 3, "WAT": 4}
df_v["_s"] = df_v["過貨站點"].map(st_order)
df_v = df_v.sort_values(["Wafer ID", "_s", "WAT item name", "Site ID", "WAT site"], kind="stable", na_position="first")
df_v = df_v.drop(columns=["_o", "_s"]).reset_index(drop=True)
for c in ["站點時間", "WAT 時間"]:
    df_v[c] = pd.to_datetime(df_v[c]).dt.floor("s")

df_h = pd.DataFrame(horiz_rows)
for c in ["WAT 量測時間", "特定站點過貨時間"]:
    df_h[c] = pd.to_datetime(df_h[c]).dt.floor("s")

# ---------------- spec / site map ----------------
g1 = line_conductance_uS(90, 1600); g2 = line_conductance_uS(180, 3200)
r1 = via_res(100, 200, 3.0, 0.15); r2 = via_res(200, 300, 3.0, 0.05)
spec = pd.DataFrame([
    ["TM1_CD", "Inline", "nm", 84, 90, 96, "TM1 線寬 (AEI)"],
    ["TM1_THK", "Inline", "Å", 1500, 1600, 1700, "TM1 Cu 厚度 (post-CMP)"],
    ["TM2_CD", "Inline", "nm", 170, 180, 190, "TM2 線寬 (AEI)"],
    ["TM2_THK", "Inline", "Å", 3000, 3200, 3400, "TM2 Cu 厚度 (post-CMP)"],
    ["Con_TM1", "WAT", "µS", round(g1 * 0.88, 1), round(g1, 1), round(g1 * 1.12, 1), "TM1 serpentine 線導 (L=1mm)"],
    ["Con_TM2", "WAT", "µS", round(g2 * 0.88, 1), round(g2, 1), round(g2 * 1.12, 1), "TM2 serpentine 線導 (L=1mm)"],
    ["Rc_TV1", "WAT", "Ω/via", None, round(r1, 3), round(r1 * 1.25, 3), "TV1 via chain 單顆電阻"],
    ["Rc_TV2", "WAT", "Ω/via", None, round(r2, 3), round(r2 * 1.25, 3), "TV2 via chain 單顆電阻"],
], columns=["Item", "Type", "Unit", "LSL", "Target", "USL", "Description"])

sitemap = pd.DataFrame(
    [["Inline", s, round(x, 1), round(y, 1)] for s, x, y in inline_sites] +
    [["WAT", s, round(x, 1), round(y, 1)] for s, x, y in wat_sites],
    columns=["Type", "Site ID", "X (mm)", "Y (mm)"])

truth_df = pd.DataFrame({"lot": LOTS, "TM1_CMP_Tool": [cmp_tool_by_lot[l] for l in LOTS]})

if __name__ == "__main__":
    import pickle
    pickle.dump(dict(df_v=df_v, df_h=df_h, spec=spec, sitemap=sitemap, OPEN=OPEN), open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "beol.pkl"), "wb"))
    print(df_h.shape, df_v.shape)
    print(spec)
