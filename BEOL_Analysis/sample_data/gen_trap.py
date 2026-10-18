import os
import numpy as np, pandas as pd
rng = np.random.default_rng(7)
rows = []
t0 = pd.Timestamp('2026-05-01')
wid = 0
for g in ['G1', 'G2']:
    for cond, n in [('POR', 120), ('CIP-A', 30), ('CIP-B', 3)]:
        for i in range(n):
            wid += 1
            lot = f'L{wid // 25:03d}'; w = f'{lot}.{wid % 25 + 1:02d}'
            day = t0 + pd.Timedelta(days=int(rng.integers(0, 120)), hours=int(rng.integers(0, 24)))
            ch = rng.choice(['CH_A', 'CH_B'], p=[0.5, 0.5]) if cond != 'CIP-A' else rng.choice(['CH_A', 'CH_B'], p=[0.2, 0.8])
            cd = rng.normal(40, 1.0)
            if cond == 'CIP-A' and g == 'G2' and ch == 'CH_B': cd -= 2.2          # CH_B makes CD small in CIP-A @ G2
            rs = 0.5 - 0.02 * (cd - 40) + rng.normal(0, 0.012)                      # Rs inversely tracks CD
            lk = np.exp(rng.normal(-25, 0.5)) * (3.0 if cond == 'CIP-A' else 1.0)
            if rng.random() < 0.03: lk = 0.0                                        # zeros / negatives in LK
            if rng.random() < 0.01: lk = -1e-12
            spa = 20.0 if rng.random() > (0.25 if cond == 'CIP-A' and g == 'G1' else 0.03) else rng.normal(12, 3)
            rc = 9.0 if g == 'G1' else rng.normal(9.0, 0.3)                          # G1 BSL constant → σ = 0
            yld = 92 - 0.5 * max(0, 40 - cd) * 4 + rng.normal(0, 1.5)
            nanitem = np.nan if cond != 'POR' else rng.normal(1, 0.1)             # item with no CIP data
            rows.append({'WAFER': w, 'LOT': lot, 'Part': g, 'Route': cond, 'WAT_TIME': day, 'M1_ETCH_CH': ch,
                         'Rs_M1 (ohm/sq)': round(rs, 4), 'LK_M1': lk, 'SPA_M1': round(spa, 2), 'Rc_V1': round(rc, 3),
                         'M1 CD AEI': round(cd, 2), 'Yield (%)': round(yld, 2), 'Con_M9_noCIP': nanitem, 'Comment': 'ok' if rng.random() > 0.1 else '12.3 ohm'})
df = pd.DataFrame(rows)
dupe = df.iloc[[5]].copy(); dupe['Rs_M1 (ohm/sq)'] += 0.2; df = pd.concat([df, dupe], ignore_index=True)   # duplicated wafer id with a different value
df.to_excel(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'variants', 'I_trap.xlsx'), index=False)
print(df.shape, df.Route.value_counts().to_dict())
