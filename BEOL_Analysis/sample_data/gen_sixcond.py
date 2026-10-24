# -*- coding: utf-8 -*-
"""K_sixcond.xlsx — BSL + 5 CIPs with different behaviours (v3.4 condition-style review):
CIP1 clear shift (Rs up via CD small), CIP2 slow drift upward over its run, CIP3 noisy (2x sigma), CIP4 / CIP5 normal, CIP5 only 8 wafers;
two groups (P1/P2), all conditions interleaved in time. Items: Rs_M2, Rc_V2, LK_M2, M2 CD AEI, M2 THK, Yield; tool column M2_ETCH_CH."""
import os, numpy as np, pandas as pd
rng = np.random.default_rng(21)
rows = []; t0 = pd.Timestamp('2026-06-01'); lotn = 0
def lot(cond, part, day, n, cd_shift=0.0, drift=0.0, noise=1.0):
    global lotn; lotn += 1; L = f'L{lotn:04d}'
    for i in range(1, n + 1):
        t = day + pd.Timedelta(hours=float(rng.uniform(0, 48)))
        cd = rng.normal(44, 1.0 * noise) + cd_shift + drift
        rs = 0.60 - 0.02 * (cd - 44) + rng.normal(0, 0.012 * noise)
        rc = 8.4 + 0.8 * max(0, 43.5 - cd) ** 1.2 + rng.normal(0, 0.25 * noise)
        lk = float(np.exp(rng.normal(-25.3, 0.45 * noise)))
        th = rng.normal(1480, 26 * noise)
        yl = 92 - 1.5 * max(0, 43.5 - cd) + rng.normal(0, 1.3)
        rows.append({'WaferID': f'{L}.{i:02d}', 'Lot': L, 'Part': part, 'Condition': cond, 'WAT_DATE': t, 'M2_ETCH_CH': rng.choice(['CH_A', 'CH_B', 'CH_C']),
                     'Rs_M2': round(rs, 4), 'Rc_V2': round(rc, 3), 'LK_M2': lk, 'M2 CD AEI': round(cd, 2), 'M2 THK': round(th, 1), 'Yield': round(yl, 2)})
days = pd.date_range('2026-06-01', '2026-09-28', freq='3D')
for k, d in enumerate(days):
    for part in ('P1', 'P2'):
        lot('POR', part, d, 10)
        if k % 2 == 0: lot('CIP1', part, d, 6, cd_shift=-2.0)
        if k % 2 == 1: lot('CIP2', part, d, 6, drift=1.6 * (d - days[0]).days / 120)
        if k % 3 == 0: lot('CIP3', part, d, 6, noise=2.2)
        if k % 3 == 1: lot('CIP4', part, d, 6)
for d in ['2026-08-10', '2026-08-13']: lot('CIP5', 'P1', pd.Timestamp(d), 4)
df = pd.DataFrame(rows)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'variants', 'K_sixcond.xlsx'); df.to_excel(out, index=False)
print(df.shape, df.groupby('Condition').size().to_dict())
