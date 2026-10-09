# -*- coding: utf-8 -*-
"""Stress sample for the light table: 6 products x 6 metal layers.
WAT: Con_M1..M6, LK_M1..M6, Rc_V1..V5, SPA_M1..M6 (23 items); inline: M1..M6 CD, M1..M6 THK, V1..V5 CD (17 items).
Condition: FAB18 (BSL) / FAB15 / FAB12 (2 CIPs). A few embedded shifts so the HL list is realistic."""
import os, numpy as np, pandas as pd
from datetime import datetime, timedelta
rng = np.random.default_rng(99)
HERE = os.path.dirname(os.path.abspath(__file__))
PRODS = ['TMRX12', 'TMWF54', 'TMTQ11', 'TMRF89', 'TMAB20', 'TMCD33']
SHIFT = {('TMWF54', 'FAB15', 'M3'): ('thk', -0.04), ('TMTQ11', 'FAB15', 'V2'): ('vcd', -2.5), ('TMRX12', 'FAB12', 'M5'): ('cd', 2.2), ('TMAB20', 'FAB12', 'M1'): ('cd', 1.8), ('TMCD33', 'FAB15', 'V4'): ('vcd', -1.8)}
rows, lot = [], 100
t0 = datetime(2026, 4, 1)
for prod in PRODS:
    for fab, nl in (('FAB18', 10), ('FAB15', 3), ('FAB12', 3)):
        for _ in range(nl):
            lot += 1
            for w in range(8):
                r = {'Lot ID': f'U{lot}', 'Wafer ID': f'U{lot}.{w+1:02d}', 'WAT Date': t0 + timedelta(days=float(rng.uniform(0, 170) if fab == 'FAB18' else rng.uniform(140, 175))), 'Part6': prod, 'Current FAB Name': fab}
                for L in range(1, 7):
                    cd = 48 + 6 * L + rng.normal(0, .7); thk = 1100 + 150 * L + rng.normal(0, 14)
                    k = (prod, fab, f'M{L}')
                    if k in SHIFT: cd += SHIFT[k][1] if SHIFT[k][0] == 'cd' else 0; thk *= 1 + SHIFT[k][1] if SHIFT[k][0] == 'thk' else 1
                    r[f'M{L} CD AEI~nm'] = round(cd, 2); r[f'M{L} THK~A'] = round(thk, 1)
                    r[f'Con_M{L}~OHM/SQ~Mean'] = round(0.09 * (48 + 6 * L) / cd * (1100 + 150 * L) / thk * (1 + rng.normal(0, .012)), 5)
                    r[f'LK_M{L}~A~Mean'] = float(np.exp(rng.normal(np.log(2e-11), .45) + (cd - 48 - 6 * L) / 0.8))
                    r[f'SPA_M{L}~V~Mean'] = 20.0 if rng.random() > 0.02 * np.exp((cd - 48 - 6 * L) / 0.9) else round(float(rng.uniform(3, 19)), 2)
                    if L <= 5:
                        vcd = 44 + 2 * L + rng.normal(0, .6)
                        kv = (prod, fab, f'V{L}')
                        if kv in SHIFT: vcd += SHIFT[kv][1]
                        r[f'V{L} CD AEI~nm'] = round(vcd, 2)
                        r[f'Rc_V{L}~OHM~Mean'] = round(3 * ((44 + 2 * L) / vcd) ** 2 + rng.normal(0, .05), 4)
                rows.append(r)
df = pd.DataFrame(rows)
df.to_excel(os.path.join(HERE, 'variants', 'F_big_6x6.xlsx'), index=False)
print(df.shape)
