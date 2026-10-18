# -*- coding: utf-8 -*-
"""J_fabrun.xlsx — different fab production-run patterns (v3.1 internal review, round 2)
BSL = FAB-A continuous run Apr–Sep with a slow Rs drift; CIP-B = FAB-B campaign runs (3 bursts, late), with a ramp:
first burst bad (Rc high via CD small), later bursts fixed; CIP-C = interleaved pilot lots in FAB-A on the same tools.
Traps: fab == tool set (full confounding for CIP-B); FAB-B records Rs in mOhm (×1000); FAB-B yield as fraction (0.92)
while FAB-A is percent; FAB-B wafer id style LOT-WW; THK not measured in FAB-B; two-week fab shutdown gap; date given as text in
two different formats."""
import os, numpy as np, pandas as pd
rng = np.random.default_rng(11)
rows = []; t0 = pd.Timestamp('2026-04-01')
def wafer(lot, i, fab): return f'{lot}.{i:02d}' if fab == 'FAB-A' else f'{lot}-{i:02d}'
lotn = 0
def add_lot(fab, cond, day, n, part, tools, cd_shift=0.0, rs_drift=0.0, thk=True):
    global lotn; lotn += 1; lot = f'{"A" if fab == "FAB-A" else "B"}{lotn:04d}'
    for i in range(1, n + 1):
        t = day + pd.Timedelta(hours=float(rng.uniform(0, 36)))
        ch = rng.choice(tools)
        cd = rng.normal(45, 1.1) + cd_shift
        rs = 0.62 - 0.018 * (cd - 45) + rs_drift + rng.normal(0, 0.012)
        rc = 8.5 + 0.9 * max(0, 44.5 - cd) ** 1.3 + rng.normal(0, 0.25)
        lk = float(np.exp(rng.normal(-25.5, 0.45)))
        th = rng.normal(1500, 28) if thk else np.nan
        yl = 93 - 1.8 * max(0, 44.5 - cd) + rng.normal(0, 1.2)
        rows.append({'WaferID': wafer(lot, i, fab), 'Lot': lot, 'Fab': fab, 'Condition': cond, 'Part': part,
                     'WAT_DATE': t.strftime('%Y/%m/%d %H:%M') if fab == 'FAB-A' else t.strftime('%d-%m-%Y %H:%M'),
                     'ETCH_CHAMBER': ch, 'Rs_M3': round(rs * (1000 if fab == 'FAB-B' else 1), 4), 'Rc_V3': round(rc, 3), 'LK_M3': lk,
                     'M3 CD AEI': round(cd, 2), 'M3 THK': round(th, 1) if thk else np.nan,
                     'Yield': round(yl / 100, 4) if fab == 'FAB-B' else round(yl, 2)})
days = pd.date_range('2026-04-01', '2026-09-28', freq='D')
# FAB-A continuous BSL, 2 lots/week, slow Rs drift +0.025 over the period, shutdown 7/13–7/26
for d in days:
    if d.weekday() in (0, 3) and not (pd.Timestamp('2026-07-13') <= d <= pd.Timestamp('2026-07-26')):
        drift = 0.025 * (d - days[0]).days / len(days)
        for part in ('P1', 'P2'): add_lot('FAB-A', 'POR', d, 25, part, ['A-CH1', 'A-CH2', 'A-CH3'], rs_drift=drift)
# FAB-A pilot CIP-C interleaved, 1 lot every two weeks from June, same tools, mild CD +0.6
for d in pd.date_range('2026-06-02', '2026-09-22', freq='14D'):
    add_lot('FAB-A', 'CIP-C', d, 25, 'P1', ['A-CH1', 'A-CH2', 'A-CH3'], cd_shift=0.6)
# FAB-B campaigns: burst 1 (early Aug) bad CD −2.3 → Rc up; burst 2 (late Aug) −0.8; burst 3 (mid Sep) fixed
for d, sh in [('2026-08-03', -2.3), ('2026-08-05', -2.3), ('2026-08-24', -0.8), ('2026-08-26', -0.8), ('2026-09-14', 0.1), ('2026-09-16', 0.1)]:
    for part in ('P1', 'P2'): add_lot('FAB-B', 'CIP-B', pd.Timestamp(d), 25, part, ['B-CH1', 'B-CH2'], cd_shift=sh, thk=False)
df = pd.DataFrame(rows)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'variants', 'J_fabrun.xlsx'); df.to_excel(out, index=False)
print(df.shape, df.groupby(['Fab', 'Condition']).size().to_dict())
