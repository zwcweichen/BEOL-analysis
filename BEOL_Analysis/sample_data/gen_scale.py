# -*- coding: utf-8 -*-
"""Scale review data (v3.12), written as CSV (also exercises the CSV import path):
P_items100.csv — one CIP vs BSL, no groups, 100 WAT items (Rs/Rc/LK over M1–M20 + V1–V20), 5,000 wafers → trend-matrix column study.
Q_100k.csv     — one CIP vs BSL, 5 WAT items, 100,000 wafers over 2 years (daily lots) → x-axis tick study at 10k / 100k.
R_10k.csv      — same as Q but 10,000 wafers over 100 days."""
import os, numpy as np, pandas as pd
rng = np.random.default_rng(11)
HERE = os.path.dirname(os.path.abspath(__file__))


def items100(out):
    n = 5000
    cond = np.where(rng.uniform(size=n) < 0.7, 'FAB18', 'FAB15')
    t = pd.Timestamp('2026-01-01') + pd.to_timedelta(np.sort(rng.uniform(0, 300, n)) * 86400, unit='s')
    df = pd.DataFrame({'WaferID': [f'L{i // 25:04d}.{i % 25 + 1:02d}' for i in range(n)], 'Lot': [f'L{i // 25:04d}' for i in range(n)], 'Fab': cond, 'WAT_DATE': t})
    cip = cond == 'FAB15'
    for m in range(1, 21):
        df[f'Rs_M{m}'] = np.round(rng.normal(0.58, 0.03, n) + (0.04 if m == 7 else 0) * cip, 4)
        df[f'LK_M{m}'] = np.exp(rng.normal(-25.3, 0.45, n) + (0.9 if m == 12 else 0) * cip)
        df[f'Rc_V{m}'] = np.round(rng.normal(9.8, 0.4, n) + (0.5 if m == 3 else 0) * cip, 3)
    for m in range(1, 21): df[f'Cap_M{m}'] = np.round(rng.normal(1.86, 0.03, n), 4)
    for m in range(1, 21): df[f'VBD_M{m}'] = np.round(rng.normal(9.2, 0.35, n), 3)
    df.to_csv(out, index=False); print(os.path.basename(out), df.shape)


def wafers(out, n, days):
    cond = np.where(rng.uniform(size=n) < 0.75, 'FAB18', 'FAB15')
    t = pd.Timestamp('2025-01-01') + pd.to_timedelta(np.sort(rng.uniform(0, days, n)) * 86400, unit='s')
    df = pd.DataFrame({'WaferID': [f'L{i // 25:05d}.{i % 25 + 1:02d}' for i in range(n)], 'Lot': [f'L{i // 25:05d}' for i in range(n)], 'Fab': cond, 'WAT_DATE': t})
    cip = cond == 'FAB15'
    df['Rs_M2'] = np.round(rng.normal(0.58, 0.03, n) + 0.035 * cip, 4)
    df['Rc_V1'] = np.round(rng.normal(9.8, 0.4, n), 3)
    df['LK_M2'] = np.exp(rng.normal(-25.3, 0.45, n))
    df['M2 CD AEI'] = np.round(rng.normal(44, 1.0, n) - 1.1 * cip, 2)
    df['M2 THK'] = np.round(rng.normal(1480, 26, n), 1)
    df.to_csv(out, index=False); print(os.path.basename(out), df.shape)


items100(os.path.join(HERE, 'variants', 'P_items100.csv'))
wafers(os.path.join(HERE, 'variants', 'R_10k.csv'), 10000, 100)
wafers(os.path.join(HERE, 'variants', 'Q_100k.csv'), 100000, 730)
