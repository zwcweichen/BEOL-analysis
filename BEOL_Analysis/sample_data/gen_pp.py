# -*- coding: utf-8 -*-
"""L_pp5.xlsx / M_pp10.xlsx — v3.7 "Summary 排排站" + P-chart review data.
Four products (PA..PD), condition = fab (A廠 = BSL, B廠 = CIP), 25-wafer lots, WAT date per lot.
L_pp5: 5 inline + 5 WAT items;  M_pp10: 10 inline + 10 WAT items.
B廠 shifts: PA  M1 CD AEI −1.2σ → Rs_M1 +2.4σ;  PC  M2 THK −3σ → Rs_M2 +2.9σ;  PD  V1 CD small → Rc_V1 +3.5σ, plus Rc_V1 tail wafers (p-chart signal).
PB: match everywhere (pure noise)."""
import os, numpy as np, pandas as pd
rng = np.random.default_rng(7)
HERE = os.path.dirname(os.path.abspath(__file__))


def build(n_items, out, start='2026-06-01', freq='2D', spa=False):
    rows = []; lotn = 0
    days = pd.date_range(start, '2026-10-20', freq=freq)
    for k, d in enumerate(days):
        for part in ('PA', 'PB', 'PC', 'PD'):
            conds = ['A廠'] if k % 3 else ['A廠', 'B廠']
            for cond in conds:
                lotn += 1; L = f'{part}{lotn:04d}'
                n = 25
                cip = cond == 'B廠'
                for i in range(1, n + 1):
                    t = d + pd.Timedelta(hours=float(rng.uniform(0, 40)))
                    m1cd = rng.normal(44, 1.0) + (-1.2 if cip and part == 'PA' else 0)
                    m2th = rng.normal(1480, 26) + (-78 if cip and part == 'PC' else 0)
                    v1cd = rng.normal(38, 0.9) + (-1.6 if cip and part == 'PD' else 0)
                    m2cd = rng.normal(46, 1.1)
                    m1th = rng.normal(1210, 22)
                    rs1 = 0.60 - 0.024 * (m1cd - 44) + rng.normal(0, 0.012)
                    rc1 = 8.4 + 0.9 * max(0, 37.5 - v1cd) ** 1.3 + rng.normal(0, 0.25)
                    if cip and part == 'PD' and rng.uniform() < 0.12: rc1 += rng.uniform(1.5, 3.0)   # tail wafers → p-chart
                    lk1 = float(np.exp(rng.normal(-25.3, 0.45)))
                    rs2 = 0.52 - 0.00045 * (m2th - 1480) + rng.normal(0, 0.011)
                    rc2 = 7.9 + 0.8 * max(0, 45.0 - m2cd) ** 1.2 + rng.normal(0, 0.22)
                    r = {'WaferID': f'{L}.{i:02d}', 'Lot': L, 'Product': part, 'Fab': cond, 'WAT_DATE': t, 'M1_CMP_Tool': rng.choice(['CMP01', 'CMP02', 'CMP03']),
                         'Rs_M1': round(rs1, 4), 'Rc_V1': round(rc1, 3), 'LK_M1': lk1, 'Rs_M2': round(rs2, 4), 'Rc_V2': round(rc2, 3),
                         'M1 CD AEI': round(m1cd, 2), 'M1 THK': round(m1th, 1), 'V1 CD': round(v1cd, 2), 'M2 CD AEI': round(m2cd, 2), 'M2 THK': round(m2th, 1)}
                    if n_items >= 10:
                        v2cd = rng.normal(40, 0.9); m3th = rng.normal(1500, 24); m1adi = m1cd + rng.normal(2.0, 0.5); m2adi = m2cd + rng.normal(2.2, 0.5); v1dep = rng.normal(820, 14)
                        r.update({'LK_M2': float(np.exp(rng.normal(-25.0, 0.42))), 'VBD_M1': round(rng.normal(9.2, 0.35), 3), 'Rs_M3': round(0.48 - 0.0004 * (m3th - 1500) + rng.normal(0, 0.01), 4),
                                  'Rc_V3': round(7.5 + 0.7 * max(0, 39.2 - v2cd) ** 1.2 + rng.normal(0, 0.2), 3), 'Cap_M2': round(rng.normal(1.86, 0.03), 4),
                                  'V2 CD': round(v2cd, 2), 'M3 THK': round(m3th, 1), 'M1 CD ADI': round(m1adi, 2), 'M2 CD ADI': round(m2adi, 2), 'V1 ETCH DEPTH': round(v1dep, 1)})
                    if spa: r['SPA_M2'] = 7.0 if rng.uniform() > (0.03 if cip and part == 'PC' else 0.004) else round(float(rng.uniform(0.5, 6.5)), 2)   # fixed-value item: 7.0 unless the line leaks
                    rows.append(r)
    df = pd.DataFrame(rows)
    df.to_excel(out, index=False)
    print(os.path.basename(out), df.shape, df.groupby(['Product', 'Fab']).size().to_dict())


build(5, os.path.join(HERE, 'variants', 'L_pp5.xlsx'))
build(10, os.path.join(HERE, 'variants', 'M_pp10.xlsx'))
build(10, os.path.join(HERE, 'variants', 'N_pp30k.xlsx'), start='2026-03-01', freq='1D', spa=True)   # ~31k rows, + SPA fixed-value item
