# -*- coding: utf-8 -*-
"""Independent pandas reference values for tests/e2e_report.js (prints JSON)."""
import json, os, sys
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
SD = os.path.join(HERE, '..', 'sample_data')
COND = '07084.100 VA12CUPH_5~Current FAB Name'
out = {}

# ---- WAT wide sample
w = pd.read_excel(os.path.join(SD, 'WAT_FAB_compare.xlsx'))
def col(prefix): return next(c for c in w.columns if c.startswith(prefix))
def sub(part, fab, prefix):
    return w.loc[(w.Part6 == part) & (w[COND] == fab), col(prefix)].dropna()
def K(part, prefix):
    b, c = sub(part, 'FAB18', prefix), sub(part, 'FAB15', prefix)
    return (c.mean() - b.mean()) / b.std(ddof=1)
def fold(part, prefix):
    b, c = sub(part, 'FAB18', prefix), sub(part, 'FAB15', prefix)
    return c[c > 0].median() / b[b > 0].median()
def rate(part, prefix, target=20.0):
    tol = abs(target) * 0.005
    b, c = sub(part, 'FAB18', prefix), sub(part, 'FAB15', prefix)
    return float(((c - target).abs() > tol).mean()), float(((b - target).abs() > tol).mean())
out['wat'] = {
    'rc_TMTQ11': K('TMTQ11', 'Rc_V12'),
    'con_TMWF54': K('TMWF54', 'Con_M13'),
    'lk_TMRX12': fold('TMRX12', 'LK_M12'),
    'spa12_TMRX12': rate('TMRX12', 'SPA_M12'),
    'spa13_TMRX12': rate('TMRX12', 'SPA_M13'),
}

# ---- Inline long sample
d = pd.read_excel(os.path.join(SD, 'INLINE_FAB_compare.xlsx'))
wm = d.groupby(['Part6', 'Current FAB Name', 'Wafer ID', 'Item'])['Value'].agg(['mean', 'std']).reset_index()
def ik(part, item):
    s = wm[(wm.Part6 == part) & (wm.Item == item)]
    b, c = s[s['Current FAB Name'] == 'FAB18'], s[s['Current FAB Name'] == 'FAB15']
    return {'k': (c['mean'].mean() - b['mean'].mean()) / b['mean'].std(ddof=1),
            'sd': c['mean'].std(ddof=1) / b['mean'].std(ddof=1),
            'wiw': c['std'].mean() / b['std'].mean()}
out['inline'] = {'v12cd_TMTQ11': ik('TMTQ11', 'V12 CD AEI'), 'm13thk_TMWF54': ik('TMWF54', 'M13 THK'), 'm12cd_TMRX12': ik('TMRX12', 'M12 CD AEI')}
json.dump(out, sys.stdout, default=float)
