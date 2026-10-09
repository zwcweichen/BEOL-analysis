# -*- coding: utf-8 -*-
"""Tool-history samples to link onto WAT_FAB_compare.xlsx by wafer id (data layer demo).
  TOOL_history_wide.xlsx : one row per wafer (96% of the WAT wafers), columns per step: tool / chamber / time
  TOOL_history_long.xlsx : one row per wafer x step (Step, Tool, Chamber, Time); a few wafers have a rework pass
Story: TMRX12 FAB15 wafers with high LK_M12 ran M12 ECP on ECP02 -> after linking, the factor scan of LK_M12 should point at ECP02.
Labels only: no WAT value is changed."""
import os, numpy as np, pandas as pd
from datetime import timedelta
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(11)
w = pd.read_excel(os.path.join(HERE, 'WAT_FAB_compare.xlsx'))
fab = w['07084.100 VA12CUPH_5~Current FAB Name']
keep = rng.random(len(w)) > 0.04                       # 4% of wafers missing from the tool system
t = pd.DataFrame({'WAFER_ID': w['Wafer ID'].str.replace('.', '-', regex=False)})   # different separator on purpose: UAB123-01
t['M12_ECP Tool'] = rng.choice(['ECP01', 'ECP02', 'ECP03'], size=len(w))
m = (fab == 'FAB15') & (w['Part6'] == 'TMRX12')
med = w.loc[m, 'LK_M12~A~Mean'].median()
t.loc[m, 'M12_ECP Tool'] = np.where(w.loc[m, 'LK_M12~A~Mean'] > med, 'ECP02', rng.choice(['ECP01', 'ECP03'], size=m.sum()))
t['M13_CMP Tool'] = rng.choice(['CMP01', 'CMP02'], size=len(w))
t['V11_ETCH Chamber'] = rng.choice(['CH_A', 'CH_B', 'CH_C'], size=len(w))
base = pd.to_datetime(w['WAT Date']) - timedelta(days=20)
t['M12_ECP Time'] = base + pd.to_timedelta(rng.uniform(0, 48, len(w)), unit='h')
t['M13_CMP Time'] = t['M12_ECP Time'] + pd.to_timedelta(rng.uniform(24, 96, len(w)), unit='h')
t['V11_ETCH Time'] = base - pd.to_timedelta(rng.uniform(24, 72, len(w)), unit='h')
wide = t[keep].reset_index(drop=True)
wide.to_excel(os.path.join(HERE, 'TOOL_history_wide.xlsx'), index=False)
rows = []
for _, r in wide.iterrows():
    for step in ['V11_ETCH', 'M12_ECP', 'M13_CMP']:
        tool = r[f'{step} Tool'] if f'{step} Tool' in r else None
        ch = r[f'{step} Chamber'] if f'{step} Chamber' in r else None
        rows.append({'WAFER_ID': r['WAFER_ID'], 'Step': step, 'Tool': tool if tool is not None else 'ETCH01', 'Chamber': ch if ch is not None else '', 'Time': r[f'{step} Time']})
        if step == 'M12_ECP' and rng.random() < 0.03:   # rework: an earlier pass on another tool (must not win)
            rows.append({'WAFER_ID': r['WAFER_ID'], 'Step': step, 'Tool': 'ECP09', 'Chamber': '', 'Time': r[f'{step} Time'] - timedelta(days=2)})
pd.DataFrame(rows).to_excel(os.path.join(HERE, 'TOOL_history_long.xlsx'), index=False)
print(wide.shape, len(rows))
