/* engine.js — BEOL report: data prep, auto-config, metrics (K / fold / rate / variation), findings */
(function () {
  'use strict';
  const App = window.App;
  const E = (App.rptEngine = {});
  const RU = () => App.rules;

  E.cat = (v) => (v == null ? '(空白)' : v instanceof Date ? App.fmtDate(v) : typeof v === 'number' ? App.fmtNum(v) : String(v));
  E.natCmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const fmtK = (k) => (k == null || !isFinite(k) ? '—' : `${k >= 0 ? '+' : '−'}${Math.abs(k).toFixed(2)}σ`);
  const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`);
  E.fmtK = fmtK; E.pct = pct;
  const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  // ------------------------------------------------------------------ load
  E.load = async (file, sheet) => {
    const wb = await App.importer.readFile(file);
    const src = App.importer.createSource(file, wb);
    if (sheet && sheet !== src.sheet && src.sheetNames.includes(sheet)) App.importer.loadSheet(src, sheet);
    return E.fromSource(src);
  };
  /** → { src, ds (one row per wafer, or the wide table as-is), siteDs: [site-level tables usable for within-wafer stats] } */
  E.fromSource = (src) => {
    App.state.datasets = [];
    const { datasets } = App.transform.buildDatasets(src);
    const ds = datasets.find((d) => d.kind === 'wafer') || datasets[0];
    const siteDs = src.format === 'long' ? datasets.filter((d) => d.kind === 'site' && !/tidy/.test(d.name)) : [];
    return { src, ds, siteDs };
  };

  E.dupRatio = (ds, waferCol) => {
    if (!waferCol) return 1;
    const s = new Set(ds.rows.map((r) => r[waferCol]));
    return ds.rows.length / Math.max(1, s.size);
  };
  /** collapse site rows to wafer mean (numbers) / first value (others) */
  E.toWafer = (ds, waferCol) => {
    const M = new Map();
    for (const r of ds.rows) {
      const k = r[waferCol]; if (k == null) continue;
      let a = M.get(k);
      if (!a) { a = { first: r, sum: {}, n: {} }; M.set(k, a); }
      for (const c of ds.columns) {
        const v = num(r[c.name]);
        if (c.type === 'number' && v != null) { a.sum[c.name] = (a.sum[c.name] || 0) + v; a.n[c.name] = (a.n[c.name] || 0) + 1; }
      }
    }
    const rows = [];
    for (const a of M.values()) {
      const o = { ...a.first };
      for (const c of ds.columns) if (c.type === 'number') o[c.name] = a.n[c.name] ? a.sum[c.name] / a.n[c.name] : null;
      rows.push(o);
    }
    return { ...ds, rows };
  };

  // ------------------------------------------------------------------ auto config
  const uniq = (rows, c) => new Set(rows.map((r) => r[c]).filter((v) => v != null)).size;
  /** most frequent value (for clamped / fixed-value items such as SPA = 20 V) */
  E.fixedValue = (rows, name) => {
    const cnt = new Map(); let n = 0;
    for (const r of rows) { const v = num(r[name]); if (v == null) continue; n++; const k = +v.toFixed(3); cnt.set(k, (cnt.get(k) || 0) + 1); }
    let best = null, bc = 0;
    for (const [k, c] of cnt) if (c > bc) { best = k; bc = c; }
    return n && bc / n >= 0.3 ? { target: best, share: bc / n } : null;
  };
  E.autoConfig = (ds) => {
    const cols = ds.columns, rows = ds.rows;
    const text = cols.filter((c) => c.type === 'text');
    const pick = (list, rx, lo, hi) => list.find((c) => rx.test(c.name) && (() => { const u = uniq(rows, c.name); return u >= lo && u <= hi; })());
    const waferCol = (cols.find((c) => c.role === 'wafer') || text.find((c) => /wafer/i.test(c.name)) || text[0] || {}).name || null;
    const lotCol = (cols.find((c) => c.role === 'lot') || {}).name || null;
    const dates = cols.filter((c) => c.type === 'datetime');
    const dateCol = (dates.find((c) => /wat/i.test(c.name)) || dates[0] || {}).name || null;
    const cand = text.filter((c) => c.name !== waferCol && c.name !== lotCol && !/最終/.test(c.name));
    // 1) a column whose VALUES look like condition labels (BSL／CIP／POR／baseline／ref／split…) wins over column names
    const condVals = /^(bsl|cip|por|base|ref|new|split|cond|exp|test|ctrl|control|std)/i;
    const byVal = cand.find((c) => { const u = uniq(rows, c.name); if (u < 2 || u > 12) return false; const vs = new Set(rows.map((r) => r[c.name]).filter((v) => v != null).map(String)); return [...vs].some((v) => condVals.test(v.trim())); });
    const condCol = (byVal || pick(cand, /fab|bsl|cip|split|cond|route|eqp|tool|chamber|recipe|type/i, 2, 12) ||
      cand.find((c) => { const u = uniq(rows, c.name); return u >= 2 && u <= 6 && !/part|product|prod|device|tech/i.test(c.name); }) ||
      cand.find((c) => { const u = uniq(rows, c.name); return u >= 2 && u <= 6; }) || {}).name || null;
    const groupCol = (pick(cand.filter((c) => c.name !== condCol), /part|product|prod|device|tech|^p\d|layer/i, 2, 30) || {}).name || '';
    const cfg = { waferCol, lotCol, dateCol, groupCol, condCol, baseline: null, cips: [], items: [] };
    E.setCond(cfg, ds);
    cfg.items = cols.filter((c) => c.type === 'number' && !c.count && c.role !== 'x' && c.role !== 'y' && uniq(rows, c.name) > 1)
      .filter((c) => !/^(site|x|y|r \(mm\)|slot|wafer|lot)$/i.test(c.name.trim()))
      .map((c) => {
        const k = RU().classify(c.name);
        return E.itemSetup({ name: c.name, cat: k.cat, conf: k.conf, on: true, n: rows.filter((r) => num(r[c.name]) != null).length }, rows);
      })
      .filter((it) => it.metric === 'rate' || uniq(rows, it.name) > 3);
    cfg.mode = E.KINDS.find((k) => cfg.items.some((i) => i.kind === k)) || 'wat';
    return cfg;
  };
  /** metric + fixed value for one item (re-run when the user changes its category) */
  E.itemSetup = (it, rows) => {
    const cat = RU().byId(it.cat);
    it.kind = cat.kind;
    it.metric = RU().metricOf(it.cat);
    it.target = null;
    if (it.metric === 'rate') {
      const fv = E.fixedValue(rows, it.name);
      if (fv) { it.target = fv.target; it.share = fv.share; } else it.metric = 'k';   // not clamped → fall back to K
    }
    if (it.metric === 'fold' && rows.some((r) => num(r[it.name]) != null && r[it.name] <= 0)) it.metric = 'k';
    return it;
  };
  /** baseline = most frequent condition value (or POR/BSL by name); CIPs = all others */
  E.setCond = (cfg, ds) => {
    if (!cfg.condCol) { cfg.baseline = null; cfg.cips = []; return; }
    const cnt = new Map();
    ds.rows.forEach((r) => { const v = r[cfg.condCol]; if (v != null) cnt.set(E.cat(v), (cnt.get(E.cat(v)) || 0) + 1); });
    const vals = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
    const named = vals.find(([v]) => /^(por|bsl|base(line)?|ref)/i.test(v));
    cfg.baseline = (named || vals[0] || [null])[0];
    cfg.cips = vals.map(([v]) => v).filter((v) => v !== cfg.baseline);
    cfg.condCounts = Object.fromEntries(vals);
  };

  // ------------------------------------------------------------------ thresholds
  E.KINDS = ['wat', 'inline', 'yield'];
  E.MOD = { wat: 'WAT', inline: 'Inline', yield: 'Yield' };
  E.TH_DEFAULT = { kG: 1, kO: 1.5, fG: 2, fO: 5, rG: 2, rO: 5, sG: 1.3, sO: 1.6 };
  E.thresholds = () => {
    const t = { ...E.TH_DEFAULT, ...App.store.get('rpt-th', {}) };
    const old = App.store.get('rpt-k', null);   // v1.0 setting
    if (old && !App.store.get('rpt-th', null)) { t.kG = old.g; t.kO = old.o; }
    return t;
  };
  const lv = (x, g, o) => (x == null || !isFinite(x) ? 'na' : x <= g ? 'green' : x <= o ? 'yellow' : 'orange');
  const RANK = { na: 0, green: 1, yellow: 2, orange: 3 };
  E.worse = (a, b) => (RANK[a] >= RANK[b] ? a : b);

  /** within-wafer σ per item per wafer from site-level tables: Map(item → Map(wafer → σ)) */
  E.wiwMap = (siteDs, items, waferCol) => {
    const out = new Map();
    for (const d of siteDs || []) {
      const wc = (d.columns.find((c) => c.role === 'wafer') || {}).name || waferCol;
      for (const it of items) {
        if (!d.columns.some((c) => c.name === it.name) || out.has(it.name)) continue;
        const acc = new Map();
        for (const r of d.rows) { const v = num(r[it.name]); if (v == null) continue; const w = r[wc]; if (!acc.has(w)) acc.set(w, []); acc.get(w).push(v); }
        const m = new Map();
        for (const [w, a] of acc) if (a.length >= 3) m.set(w, App.stats(a).sd);
        if (m.size) out.set(it.name, m);
      }
    }
    return out;
  };

  // ------------------------------------------------------------------ compute
  E.compute = (ds, cfg, siteDs) => {
    const th = E.thresholds();
    const items = cfg.items.filter((i) => i.on);
    const groups = cfg.groupCol ? [...new Set(ds.rows.map((r) => E.cat(r[cfg.groupCol])))].sort(E.natCmp) : ['全部'];
    const gOf = (r) => (cfg.groupCol ? E.cat(r[cfg.groupCol]) : '全部');
    const cOf = (r) => E.cat(r[cfg.condCol]);
    const byG = new Map(groups.map((g) => [g, []]));
    ds.rows.forEach((r) => byG.get(gOf(r))?.push(r));
    const wiw = E.wiwMap(siteDs, items.filter((i) => i.kind === 'inline'), cfg.waferCol);
    const cells = {};
    for (const it of items) {
      cells[it.name] = {};
      for (const g of groups) {
        const rows = byG.get(g);
        const vb = [], vc = {}, wb = [], wc = {};
        cfg.cips.forEach((c) => { vc[c] = []; wc[c] = []; });
        const wm = wiw.get(it.name);
        for (const r of rows) {
          const v = num(r[it.name]); if (v == null) continue;
          const c = cOf(r);
          const s = wm ? wm.get(r[cfg.waferCol]) : null;
          if (c === cfg.baseline) { vb.push(v); if (s != null) wb.push(s); } else if (vc[c]) { vc[c].push(v); if (s != null) wc[c].push(s); }
        }
        const b = App.stats(vb);
        cells[it.name][g] = {};
        for (const c of cfg.cips) {
          const s = App.stats(vc[c]);
          let k = null, reason = '';
          if (!s.n) reason = `${c} 無資料`;
          else if (!(b.n > 1)) reason = 'BSL 樣本不足';
          else if (!(b.sd > 0)) reason = 'BSL σ = 0';
          else k = (s.mean - b.mean) / b.sd;
          const cell = { item: it, group: g, cip: c, metric: it.metric, k, n: s.n || 0, mean: s.mean, sd: s.sd, bn: b.n || 0, bmean: b.mean, bsd: b.sd,
            median: s.median, bmedian: b.median, reason, low: s.n > 0 && s.n < 5 };
          if (it.metric === 'fold') {
            const pc = vc[c].filter((x) => x > 0), pb = vb.filter((x) => x > 0);
            const mc = median(pc), mb = median(pb);
            if (mc != null && mb > 0) {
              cell.fold = mc / mb; cell.reason = '';
              cell.dir = Math.sign(Math.log(cell.fold));
              cell.level = lv(Math.max(cell.fold, 1 / cell.fold), th.fG, th.fO);
              cell.text = `×${cell.fold >= 10 ? cell.fold.toFixed(1) : cell.fold.toFixed(2)}`;
            } else { cell.level = 'na'; cell.reason = reason || '無正值資料'; }
          } else if (it.metric === 'rate') {
            const tol = Math.max(1e-6, Math.abs(it.target) * 0.005);
            const fail = (a) => a.filter((x) => Math.abs(x - it.target) > tol).length;
            if (s.n && b.n) {
              cell.rateC = fail(vc[c]) / s.n; cell.rateB = fail(vb) / b.n; cell.reason = '';
              cell.diff = (cell.rateC - cell.rateB) * 100;
              cell.dir = Math.sign(cell.diff);
              cell.level = cell.diff <= th.rG ? 'green' : cell.diff <= th.rO ? 'yellow' : 'orange';
              cell.text = `異常 ${pct(cell.rateC)}`;
            } else { cell.level = 'na'; cell.reason = reason || 'BSL 無資料'; }
          } else {
            cell.dir = Math.sign(k || 0);
            cell.level = lv(k == null ? null : Math.abs(k), th.kG, th.kO);
            cell.text = `K ${fmtK(k)}`;
          }
          // variation (used by the inline module)
          if (s.n >= 3 && b.n >= 3 && b.sd > 0) { cell.sdRatio = s.sd / b.sd; cell.sdLevel = cell.sdRatio <= 1 ? 'green' : lv(cell.sdRatio, th.sG, th.sO); }
          if (wc[c].length >= 2 && wb.length >= 2) {
            const mw = App.stats(wc[c]).mean, mbw = App.stats(wb).mean;
            if (mbw > 0) { cell.wiwRatio = mw / mbw; cell.wiwLevel = cell.wiwRatio <= 1 ? 'green' : lv(cell.wiwRatio, th.sG, th.sO); cell.wiwC = mw; cell.wiwB = mbw; }
          }
          cell.varLevel = E.worse(cell.sdLevel || 'na', cell.wiwLevel || 'na');
          cells[it.name][g][c] = cell;
        }
      }
    }
    // ---------------- findings per module
    const isAbn = (l) => l === 'orange' || l === 'yellow';
    const sev = (f) => (f.cell.level === 'orange' || f.varLevel === 'orange' ? 2 : 1) * 100 + (f.score || 0);
    const findings = { wat: [], inline: [], yield: [] };
    for (const it of items) for (const g of groups) for (const c of cfg.cips) {
      const cell = cells[it.name][g][c];
      const score = cell.metric === 'fold' ? Math.abs(Math.log2(cell.fold || 1)) * 2 : cell.metric === 'rate' ? Math.abs(cell.diff || 0) / 3 : Math.abs(cell.k || 0);
      if (it.kind === 'wat' && isAbn(cell.level)) {
        // r per wafer; not meaningful for a pass／fail rate item (SPA): leave null → judged by K only
        const rr = (name) => (RU().metricOf(it.cat) === 'rate' ? null : E.pearson(byG.get(g) || [], it.name, name, RU().metricOf(it.cat) === 'fold'));
        const rel = RU().relatedInline(it.name, it.cat, items).map((r) => ({ ...r, k: cells[r.item.name]?.[g]?.[c]?.k, r: rr(r.item.name) }));
        const xrel = (RU().relatedXLayer ? RU().relatedXLayer(it.name, it.cat, items) : []).map((r) => ({ ...r, k: cells[r.item.name]?.[g]?.[c]?.k, r: rr(r.item.name) }));
        findings.wat.push({ type: 'mean', cell, rel, xrel, score, dx: RU().diagnose(cell, rel, xrel) });
      }
      if (it.kind === 'yield' && isAbn(cell.level)) {
        // cross-reference: abnormal WAT cells of the same group / CIP
        const yBad = RU().byId(it.cat).bad === 'down' ? 1 : -1;
        const rel = items.filter((w) => w.kind === 'wat').map((w) => ({ item: w, cell: cells[w.name]?.[g]?.[c], sign: yBad * (RU().byId(w.cat).bad === 'down' ? 1 : -1) })).filter((r) => r.cell && isAbn(r.cell.level));
        findings.yield.push({ type: 'mean', cell, rel, score, dx: RU().diagnoseYield(cell, rel) });
      }
      if (it.kind === 'inline') {
        if (isAbn(cell.level)) {
          const rel = RU().relatedWat(it.name, it.cat, items).map((r) => ({ ...r, cell: cells[r.item.name]?.[g]?.[c] }));
          findings.inline.push({ type: 'mean', cell, rel, score, dx: RU().diagnoseInline(cell, rel) });
        }
        const which = RANK[cell.wiwLevel || 'na'] >= RANK[cell.sdLevel || 'na'] ? 'wiw' : 'w2w';
        const vl = which === 'wiw' ? cell.wiwLevel : cell.sdLevel;
        if (isAbn(vl)) findings.inline.push({ type: 'var', which, cell, varLevel: vl, score: ((which === 'wiw' ? cell.wiwRatio : cell.sdRatio) - 1) * 3, dx: RU().diagnoseVar(cell, which) });
      }
    }
    const lvOf = (f) => (f.type === 'var' ? f.varLevel : f.cell.level);
    for (const k of E.KINDS) findings[k].sort((a, b) => RANK[lvOf(b)] - RANK[lvOf(a)] || b.score - a.score);
    // ---------------- counts & data quality per module
    const cnt = {}, naList = {};
    for (const kind of E.KINDS) {
      cnt[kind] = { green: 0, yellow: 0, orange: 0, na: 0 }; naList[kind] = [];
      for (const it of items.filter((i) => i.kind === kind)) for (const g of groups) for (const c of cfg.cips) {
        const cell = cells[it.name][g][c]; cnt[kind][cell.level]++;
        if (cell.level === 'na') naList[kind].push(cell);
      }
    }
    const varCnt = { green: 0, yellow: 0, orange: 0, na: 0 };
    for (const it of items.filter((i) => i.kind === 'inline')) for (const g of groups) for (const c of cfg.cips) varCnt[cells[it.name][g][c].varLevel]++;
    const dates = cfg.dateCol ? ds.rows.map((r) => r[cfg.dateCol]).filter((d) => d instanceof Date).sort((a, b) => a - b) : [];
    const nWafer = { [cfg.baseline]: 0 }; cfg.cips.forEach((c) => (nWafer[c] = 0));
    ds.rows.forEach((r) => { const c = cOf(r); if (c in nWafer) nWafer[c]++; });
    return { th, items, groups, cells, findings, cnt, varCnt, naList, hasWiw: wiw.size > 0, dateRange: dates.length ? [dates[0], dates[dates.length - 1]] : null, nWafer, gOf, cOf, byG, lvOf };
  };



  // ------------------------------------------------------------------ data layer: link a second table by wafer id
  /** canonical wafer key: "UAB123.01" / "uab123-1" / "UAB123#01" → "UAB123.01"; otherwise trimmed upper-case */
  E.waferKey = (v) => {
    if (v == null) return null;
    const s = String(v).trim().toUpperCase();
    const m = s.match(/^(.+?)[.\-_#\s]+(\d{1,2})$/);
    return m ? `${m[1]}.${m[2].padStart(2, '0')}` : s;
  };
  /** pick the column of `ds` whose values best match the main wafer keys */
  E.findWaferCol = (ds, mainKeys) => {
    let best = null, bestHit = 0;
    for (const c of ds.columns) {
      if (c.type !== 'text' && c.type !== 'number') continue;
      let hit = 0, n = 0;
      for (const r of ds.rows.slice(0, 2000)) { const k = E.waferKey(r[c.name]); if (k == null || k === '') continue; n++; if (mainKeys.has(k)) hit++; }
      if (n && hit > bestHit) { best = c.name; bestHit = hit; }
    }
    return bestHit ? best : null;
  };
  /**
   * Collapse a linked table to one row per wafer.
   *   - long tool history (wafer × step × tool): columns matching step / tool are pivoted → "<step> <toolCol>" = tool (last pass wins)
   *   - otherwise numbers → mean, text → last non-empty
   */
  E.collapseLinked = (ds, waferCol) => {
    const stepCol = ds.columns.find((c) => c.type === 'text' && c.name !== waferCol && /step|stage|station|oper|站點|站別|製程/i.test(c.name));
    const toolCols = ds.columns.filter((c) => c.type === 'text' && c.name !== waferCol && c !== stepCol && /tool|eqp|equip|chamber|ch\b|machine|機台|腔/i.test(c.name));
    const timeCol = ds.columns.find((c) => c.type === 'datetime');
    const dup = E.dupRatio(ds, waferCol) > 1.05;
    const rows = ds.rows.slice();
    if (timeCol) rows.sort((a, b) => (a[timeCol.name] || 0) - (b[timeCol.name] || 0));
    const M = new Map();
    const cols = [];
    const addCol = (name, type) => { if (!cols.some((c) => c.name === name)) cols.push({ name, type, role: 'measure' }); };
    if (dup && stepCol && toolCols.length) {       // pivot long tool history
      for (const r of rows) {
        const k = E.waferKey(r[waferCol]); if (!k) continue;
        if (!M.has(k)) M.set(k, {});
        const o = M.get(k), st = E.cat(r[stepCol.name]);
        for (const tc of toolCols) { const v = r[tc.name]; if (v == null || v === '') continue; const name = `${st} ${tc.name}`; o[name] = v; addCol(name, 'text'); }
        if (timeCol) { const name = `${st} ${timeCol.name}`; o[name] = r[timeCol.name]; addCol(name, 'datetime'); }
      }
      return { rows: [...M.entries()].map(([k, o]) => ({ __key: k, ...o })), columns: cols, pivoted: true, stepCol: stepCol.name, toolCols: toolCols.map((c) => c.name) };
    }
    for (const r of rows) {
      const k = E.waferKey(r[waferCol]); if (!k) continue;
      if (!M.has(k)) M.set(k, { sum: {}, n: {}, v: {} });
      const o = M.get(k);
      for (const c of ds.columns) {
        if (c.name === waferCol) continue;
        const v = r[c.name]; if (v == null || v === '') continue;
        if (c.type === 'number' && typeof v === 'number') { o.sum[c.name] = (o.sum[c.name] || 0) + v; o.n[c.name] = (o.n[c.name] || 0) + 1; } else o.v[c.name] = v;
        addCol(c.name, c.type);
      }
    }
    const out = [...M.entries()].map(([k, o]) => { const row = { __key: k }; for (const c of cols) row[c.name] = c.type === 'number' ? (o.n[c.name] ? o.sum[c.name] / o.n[c.name] : null) : o.v[c.name] ?? null; return row; });
    return { rows: out, columns: cols, pivoted: false, collapsed: dup };
  };
  /** join collapsed table into the main wafer table (in place); returns the link report */
  E.linkInto = (main, waferCol, linked, label) => {
    const mainKeys = new Map(); main.rows.forEach((r) => { const k = E.waferKey(r[waferCol]); if (k) mainKeys.set(k, r); });
    const used = new Set(main.columns.map((c) => c.name));
    const rename = {}; linked.columns.forEach((c) => { let n = c.name, i = 2; while (used.has(n)) n = `${c.name}·${i++}`; rename[c.name] = n; used.add(n); });
    let matched = 0, extra = 0;
    for (const lr of linked.rows) { const mr = mainKeys.get(lr.__key); if (!mr) { extra++; continue; } matched++; for (const c of linked.columns) mr[rename[c.name]] = lr[c.name]; }
    const added = linked.columns.map((c) => ({ name: rename[c.name], type: c.type, role: 'measure', linked: label }));
    main.columns.push(...added);
    main.rows.forEach((r) => { for (const c of added) if (!(c.name in r)) r[c.name] = null; });
    return { label, matched, mainWafers: mainKeys.size, linkedWafers: linked.rows.length, extra, rate: mainKeys.size ? matched / mainKeys.size : 0, columns: added.map((c) => c.name) };
  };

  // ------------------------------------------------------------------ commonality: scan categorical columns
  // regularized upper incomplete gamma Q(a, x) → chi-square survival function (Numerical Recipes gser / gcf)
  const gammaln = (x) => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let ser = 1.000000000190015; for (const cj of c) ser += cj / ++y; return -t + Math.log(2.5066282746310005 * ser / x); };
  const gammaQ = (a, x) => {
    if (x <= 0) return 1;
    if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 1; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break; } return 1 - sum * Math.exp(-x + a * Math.log(x) - gammaln(a)); }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break; }
    return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
  };
  E.chi2sf = (x, df) => gammaQ(df / 2, x / 2);
  /** Kruskal–Wallis H (tie-corrected) and p for groups: [[values], ...] */
  E.kruskal = (groups) => {
    const all = []; groups.forEach((g, gi) => g.forEach((v) => all.push({ v, gi })));
    const n = all.length, k = groups.length;
    if (k < 2 || n < 3) return { H: null, p: null, eps: null };
    all.sort((a, b) => a.v - b.v);
    let tieSum = 0;
    for (let i = 0; i < n;) { let j = i; while (j + 1 < n && all[j + 1].v === all[i].v) j++; const r = (i + j) / 2 + 1; for (let q = i; q <= j; q++) all[q].r = r; const t = j - i + 1; if (t > 1) tieSum += t * t * t - t; i = j + 1; }
    const R = groups.map(() => 0); all.forEach((a) => (R[a.gi] += a.r));
    let H = 0; groups.forEach((g, i) => { if (g.length) H += (R[i] * R[i]) / g.length; });
    H = (12 / (n * (n + 1))) * H - 3 * (n + 1);
    const corr = 1 - tieSum / (n * n * n - n); if (corr > 0) H /= corr;
    const p = E.chi2sf(H, k - 1), eps = Math.max(0, (H - k + 1) / (n - k));   // epsilon² effect size
    return { H, p, eps };
  };
  /** Benjamini–Hochberg adjusted p-values */
  E.bh = (ps) => { const idx = ps.map((p, i) => [p, i]).filter((x) => x[0] != null).sort((a, b) => a[0] - b[0]); const m = idx.length, out = ps.slice(); let prev = 1; for (let r = m - 1; r >= 0; r--) { const q = Math.min(prev, (idx[r][0] * m) / (r + 1)); out[idx[r][1]] = q; prev = q; } return out; };
  /**
   * Scan every categorical column of the data for one item @ group / cip.
   * Returns ranked factors: { col, levels:[{v, n, mean, k}], H, p, pAdj, eps, worst, confound, note }
   *   - test is Kruskal–Wallis across the CIP wafers' levels (≥ 2 levels with n ≥ 3 each)
   *   - k per level = (level mean − BSL mean) / σ_BSL, so levels can be read like the light table
   *   - confound: the column's levels line up with the condition (every level belongs to one condition only)
   */
  /** per-level stats of one item for CIP rows split by keyFn (string level or null); BSL counts for run-rate */
  E.factorLevels = (cRows, bRows, itemName, cell, keyFn, th) => {
    const lv = new Map(), bCnt = new Map();
    for (const r of cRows) { const k = keyFn(r); if (k == null) continue; if (!lv.has(k)) lv.set(k, []); lv.get(k).push(r[itemName]); }
    for (const r of bRows) { const k = keyFn(r); if (k == null) continue; bCnt.set(k, (bCnt.get(k) || 0) + 1); }
    const nB = [...bCnt.values()].reduce((a, b) => a + b, 0), nC = [...lv.values()].reduce((a, b) => a + b.length, 0);
    const keys = new Set([...lv.keys(), ...bCnt.keys()]);
    const levels = [...keys].map((v) => { const a = lv.get(v) || [], st = a.length ? App.stats(a) : { n: 0, mean: null, sd: null }; return { v, n: st.n, mean: st.mean, sd: st.sd, k: st.n && cell.bsd > 0 ? (st.mean - cell.bmean) / cell.bsd : null, nB: bCnt.get(v) || 0, shareB: nB ? (bCnt.get(v) || 0) / nB : 0, shareC: nC ? st.n / nC : 0 }; })
      .sort((a, b) => (b.k ?? -1e9) - (a.k ?? -1e9));
    const tested = levels.filter((l) => l.n >= 3);
    let H = null, p = null, eps = null, spread = null;
    if (tested.length >= 2) { ({ H, p, eps } = E.kruskal(tested.map((l) => lv.get(l.v)))); const ks = tested.map((l) => l.k).filter((k) => k != null); spread = ks.length ? Math.max(...ks) - Math.min(...ks) : null; }
    const withData = levels.filter((l) => l.n > 0);
    const worst = withData.length ? (cell.dir >= 0 ? withData[0] : withData[withData.length - 1]) : null;
    return { levels, tested, H, p, eps, spread, worst, nLevels: withData.length, nB, nC };
  };
  /**
   * Scan every categorical column of the data for one item @ group / cip.
   * Returns ranked factors: { col, levels, H, p, pAdj, eps, spread, worst, confound, hit, note }
   *   - Kruskal–Wallis across the CIP wafers' levels (≥ 2 levels with n ≥ 3 each); p adjusted with Benjamini–Hochberg
   *   - k per level = (level mean − BSL mean) / σ_BSL; spread = difference between the best and worst level (σ)
   *   - hit: pAdj < 0.1, ε² ≥ 0.1 and the levels differ by ≥ 0.5σ and by ≥ 20% of the cell's shift (a tool must explain a real part of it)
   *   - confound: the column's levels line up with the condition (every level belongs to one condition only)
   */
  E.scanFactors = (ds, cfg, itemName, group, cip, cell) => {
    const skip = new Set([cfg.waferCol, cfg.lotCol, cfg.condCol, cfg.groupCol].filter(Boolean));
    const rowsG = (cfg.groupCol ? ds.rows.filter((r) => E.cat(r[cfg.groupCol]) === group) : ds.rows).filter((r) => num(r[itemName]) != null);
    const cRows = rowsG.filter((r) => E.cat(r[cfg.condCol]) === cip), bRows = rowsG.filter((r) => E.cat(r[cfg.condCol]) === cfg.baseline);
    const out = [];
    for (const c of E.factorColumns(ds, cfg)) {
      const keyFn = (r) => { const v = r[c.name]; return v == null || v === '' ? null : E.cat(v); };
      const st = E.factorLevels(cRows, bRows, itemName, cell, keyFn);
      if (st.nLevels < 1 || st.nLevels > 40) continue;
      const cross = new Map();
      for (const r of rowsG) { const k = keyFn(r); if (k == null) continue; if (!cross.has(k)) cross.set(k, new Set()); cross.get(k).add(E.cat(r[cfg.condCol])); }
      const confound = [...cross.values()].every((set) => set.size === 1) && cross.size > 1;
      let note = '';
      if (confound) note = '與條件完全混淆：CIP 與 BSL 走不同機台，無法分辨是機台還是條件';
      else if (st.tested.length < 2) note = st.nLevels === 1 ? `CIP 全部走 ${st.worst.v}（只有一個 level，無法比較）` : '每個 level 的 wafer 少於 3 片';
      out.push({ col: c.name, ...st, confound, note });
    }
    const adj = E.bh(out.map((o) => o.p));
    out.forEach((o, i) => { o.pAdj = adj[i]; o.hit = !o.confound && o.pAdj != null && o.pAdj < 0.1 && o.eps >= 0.1 && o.spread != null && o.spread >= 0.5 && o.spread >= 0.2 * Math.abs(cell.k ?? 0); if (!o.hit && !o.note && o.pAdj != null && o.pAdj < 0.1 && o.spread != null) o.note = `各 level 差 ${o.spread.toFixed(2)}σ，相對整體偏移不大 → 比較像條件本身的差異`; });
    out.sort((a, b) => (b.hit - a.hit) || (b.eps ?? -1) - (a.eps ?? -1) || (a.pAdj ?? 2) - (b.pAdj ?? 2));
    return out;
  };
  /** categorical columns usable as factors (tool, chamber, route…): text, not key / condition / group / time columns */
  E.factorColumns = (ds, cfg) => {
    const skip = new Set([cfg.waferCol, cfg.lotCol, cfg.condCol, cfg.groupCol].filter(Boolean));
    return ds.columns.filter((c) => c.type === 'text' && !skip.has(c.name) && !/時間|time|date/i.test(c.name));
  };

  /** plain-text summary (for e-mail / chat) for one module */
  /** Pearson r between two columns over rows (both numeric; y optionally log10 for LK-type items); null when n < 4 */
  E.pearson = (rows, y, x, logY = false) => {
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (const q of rows) {
      let a = num(q[x]), b = num(q[y]); if (a == null || b == null) continue;
      if (logY) { if (b <= 0) continue; b = Math.log10(b); }
      n++; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b;
    }
    if (n < 4) return null;
    const d = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    return d > 0 ? (n * sxy - sx * sy) / d : null;
  };
  E.summaryText = (res, cfg, meta, mode = 'wat') => {
    const L = [], th = res.th;
    const f4 = (v) => (typeof v === 'number' && isFinite(v) ? (Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(3) : String(+v.toPrecision(4))) : '—');
    const cnt = res.cnt[mode], fs = res.findings[mode];
    L.push(`【BEOL ${E.MOD[mode] || mode} 戰報】${cfg.cips.join('、')}（CIP） vs ${cfg.baseline}（BSL）${meta?.file ? `　資料：${meta.file}` : ''}`);
    if (res.dateRange) L.push(`期間：${App.fmtDate(res.dateRange[0]).slice(0, 10)} ～ ${App.fmtDate(res.dateRange[1]).slice(0, 10)}　wafer 數：${Object.entries(res.nWafer).map(([c, n]) => `${c} ${n}`).join('、')}`);
    L.push(mode === 'wat'
      ? `燈號：一般 item 綠 ≤ ${th.kG}σ、橘 > ${th.kO}σ；LK 綠 ≤ ×${th.fG}、橘 > ×${th.fO}；SPA 異常率比 BSL 多 綠 ≤ ${th.rG}%、橘 > ${th.rO}%`
      : mode === 'inline' ? `燈號：均值 綠 ≤ ${th.kG}σ、橘 > ${th.kO}σ；變異 σ 倍數 綠 ≤ ×${th.sG}、橘 > ×${th.sO}`
      : `燈號：K 綠 ≤ ${th.kG}σ、橘 > ${th.kO}σ（yield 以 wafer 為單位）`);
    L.push(`結果：綠 ${cnt.green}、黃 ${cnt.yellow}、橘 ${cnt.orange}${cnt.na ? `、無法判定 ${cnt.na}` : ''}${mode === 'inline' ? `；變異異常 ${res.varCnt.orange + res.varCnt.yellow}` : ''}`);
    if (!fs.length) L.push('結論：全部在綠燈範圍內，CIP 與 BSL match。');
    fs.forEach((f, i) => {
      const c = f.cell;
      L.push(`${i + 1}. ${f.dx.title}`);
      if (f.type === 'mean') {
        if (c.metric === 'rate') L.push(`   異常率 ${E.pct(c.rateC)} vs BSL ${E.pct(c.rateB)}（固定值 ${c.item.target}，N ${c.n} / ${c.bn}）`);
        else if (c.metric === 'fold') L.push(`   median ${f4(c.median)} vs BSL ${f4(c.bmedian)}（N ${c.n} / ${c.bn}）`);
        else L.push(`   ${c.cip} mean ${f4(c.mean)} vs BSL ${f4(c.bmean)}（N ${c.n} / ${c.bn}）`);
      }
      L.push(`   ${f.dx.verdict}`);
      if (meta?.factor) { const fv = meta.factor(f); if (fv) L.push(`   ${fv}`); }
      L.push(`   建議檢查：${meta?.checks ? meta.checks(f).join('；') : f.dx.checks.join('、')}`);
      if (meta?.causes) { const cz = meta.causes(f); if (cz.length) L.push(`   物理機制（依證據）：${cz.join('、')}`); }
    });
    const na = res.naList[mode];
    L.push(RU().kbVersion());
    if (na.length) L.push(`資料品質：${na.map((c) => `${RU().parseName(c.item.name).short}@${c.group}（${c.reason}）`).join('、')}`);
    return L.join('\n');
  };
})();
