# independent recomputation of every cell with pandas; compare to the tool's cells
import json, sys, numpy as np, pandas as pd
f, dj = sys.argv[1], sys.argv[2]
d = json.load(open(dj)); cfg = d['cfg']; th = d['th']
df = pd.read_excel(f) if f.endswith('xlsx') else pd.read_csv(f)
w = cfg['waferCol']
# by-wafer mean if site level
dup = df[w].duplicated().any()
num_cols = [i['name'] for i in cfg['items']]
if dup:
    keep = {cfg['condCol']: 'first'}
    if cfg['groupCol']: keep[cfg['groupCol']] = 'first'
    if cfg['dateCol']: keep[cfg['dateCol']] = 'first'
    for c in num_cols: keep[c] = 'mean'
    df = df.groupby(w, as_index=False).agg(keep)
cond = df[cfg['condCol']].astype(str).str.strip()
grp = df[cfg['groupCol']].astype(str).str.strip() if cfg['groupCol'] else pd.Series(['全部'] * len(df))
def lv(v, g, o): return 'na' if v is None or not np.isfinite(v) else 'green' if v <= g else 'yellow' if v <= o else 'orange'
bad = []; n = 0
for it in cfg['items']:
    name = it['name']
    for g in d['groups']:
        for p in cfg['cips']:
            n += 1
            cell = d['cells'][name][g][p]
            mg = (grp == g) if cfg['groupCol'] else pd.Series([True] * len(df))
            vb = pd.to_numeric(df.loc[mg & (cond == cfg['baseline']), name], errors='coerce').dropna()
            vc = pd.to_numeric(df.loc[mg & (cond == p), name], errors='coerce').dropna()
            exp = {}
            if it['metric'] == 'fold':
                pb, pc = vb[vb > 0], vc[vc > 0]
                if len(pc) and len(pb) and pb.median() > 0:
                    fo = pc.median() / pb.median(); exp = {'fold': fo, 'level': lv(max(fo, 1 / fo), th['fG'], th['fO'])}
                else: exp = {'level': 'na'}
            elif it['metric'] == 'rate':
                t = it['target']; tol = max(1e-6, abs(t) * 0.005)
                if len(vc) and len(vb):
                    rc = ((vc - t).abs() > tol).mean(); rb = ((vb - t).abs() > tol).mean(); diff = (rc - rb) * 100
                    exp = {'rateC': rc, 'rateB': rb, 'level': 'green' if diff <= th['rG'] else 'yellow' if diff <= th['rO'] else 'orange'}
                else: exp = {'level': 'na'}
            else:
                if len(vc) and len(vb) > 1 and vb.std(ddof=1) > 0:
                    k = (vc.mean() - vb.mean()) / vb.std(ddof=1); exp = {'k': k, 'level': lv(abs(k), th['kG'], th['kO'])}
                else: exp = {'level': 'na'}
            exp['n'] = len(vc); exp['bn'] = len(vb)
            for key, v in exp.items():
                got = cell.get(key)
                if isinstance(v, str) or isinstance(v, (int, np.integer)):
                    if got != v: bad.append((name, g, p, key, v, got))
                elif got is None or abs(got - v) > 1e-6 * max(1, abs(v)): bad.append((name, g, p, key, float(v), got))
print(f'{f}: {n} cells checked, {len(bad)} mismatches')
for b in bad[:30]: print('  MISMATCH', b)
# counts consistency: cnt vs cells
for m in d['findings']:
    kinds = {i['name']: i['kind'] for i in cfg['items']}
    cnt = {'green': 0, 'yellow': 0, 'orange': 0, 'na': 0}
    for name in d['cells']:
        if kinds[name] != m: continue
        for g in d['cells'][name]:
            for p in d['cells'][name][g]: cnt[d['cells'][name][g][p]['level']] += 1
    print(f'  {m}: recount {cnt} vs tool cnt {d["cnt"][m]} vs lights table {d["ltCounts"][m]}')
