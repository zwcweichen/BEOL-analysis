/* transform.js — cleaning, long→site/wafer datasets, spec extraction, join */
(function () {
  'use strict';
  const App = window.App;
  const T = (App.transform = {});

  const isInvalid = (v) => typeof v === 'number' && Math.abs(v) >= App.state.settings.invalidAbs;

  /** Build datasets from a source according to its column definitions. */
  T.buildDatasets = (src) => {
    const rows = App.importer.typedRows(src);
    const info = { invalid: 0, specItems: 0 };
    const out = src.format === 'long' ? T.fromLong(src, rows, info) : T.fromWide(src, rows, info);
    // replace older datasets from same source, keeping ids (charts stay bound) when names match
    const prev = new Map(App.state.datasets.filter((d) => d.sourceId === src.id).map((d) => [d.name, d.id]));
    out.forEach((d) => { if (prev.has(d.name)) d.id = prev.get(d.name); });
    App.state.datasets = App.state.datasets.filter((d) => d.sourceId !== src.id);
    App.state.datasets.push(...out);
    return { datasets: out, info };
  };

  T.fromWide = (src, rows, info) => {
    const cols = src.columns.filter((c) => c.role !== 'ignore');
    const dsCols = cols.map((c) => ({ name: c.name, type: c.type, role: c.role }));
    const idx = cols.map((c) => src.columns.indexOf(c));
    const data = rows.map((r) => {
      const o = {};
      cols.forEach((c, k) => {
        let v = r[idx[k]];
        if (c.role === 'measure' && isInvalid(v)) { v = null; info.invalid++; }
        o[c.name] = v;
      });
      return o;
    });
    // spec columns in a wide table (rare): not item-bound, ignored here
    return [{ id: App.uid('ds'), name: `${src.name}`, kind: 'wafer', sourceId: src.id, columns: dsCols, rows: data }];
  };

  T.fromLong = (src, rows, info) => {
    const C = src.columns;
    const find = (role, block) => C.findIndex((c) => c.role === role && (c.block || '') === block);
    const shared = {
      wafer: C.findIndex((c) => c.role === 'wafer'),
      lot: find('lot', ''), time: find('time', ''), station: find('station', ''),
    };
    const condIdx = C.map((c, i) => (c.role === 'condition' ? i : -1)).filter((i) => i >= 0);
    const blocks = (src.blocks || []).map((b) => ({
      ...b,
      item: find('item', b.name), value: find('value', b.name), site: find('site', b.name),
      x: find('x', b.name), y: find('y', b.name), lsl: find('lsl', b.name), target: find('target', b.name),
      usl: find('usl', b.name), unit: find('unit', b.name), time: find('time', b.name),
      station: find('station', b.name), lot: find('lot', b.name),
    })).filter((b) => b.item >= 0 && b.value >= 0);
    if (shared.wafer < 0) throw new Error('長表需要指定 Wafer ID 欄位');
    if (!blocks.length) throw new Error('找不到完整的 Item name + Value 組合，請檢查 Block 設定');

    // item name collisions across blocks
    const itemBlocks = {};
    for (const r of rows) for (const b of blocks) {
      const it = r[b.item]; if (it == null) continue;
      (itemBlocks[it] = itemBlocks[it] || new Set()).add(b.name);
    }
    const key = (b, it) => (itemBlocks[it] && itemBlocks[it].size > 1 ? `${b.name}:${it}` : String(it));

    const g = (r, i) => (i >= 0 ? r[i] : null);
    const siteRows = [];
    const specs = {};
    for (const r of rows) {
      const wafer = g(r, shared.wafer);
      if (wafer == null) continue;
      for (const b of blocks) {
        const it = g(r, b.item);
        if (it == null) continue;
        let v = g(r, b.value);
        const bad = isInvalid(v);
        if (bad) { info.invalid++; }
        const item = key(b, it);
        const rec = {
          'Wafer ID': wafer,
          'Lot ID': g(r, b.lot) ?? g(r, shared.lot),
          Block: b.name,
          Station: g(r, b.station) ?? g(r, shared.station) ?? b.name,
          Time: g(r, b.time) ?? g(r, shared.time),
          Item: item,
          Site: g(r, b.site),
          Value: bad ? null : v,
          'Raw Value': v,
          Invalid: bad ? 1 : 0,
          X: g(r, b.x), Y: g(r, b.y),
        };
        for (const ci of condIdx) rec[C[ci].name] = r[ci];
        siteRows.push(rec);
        // spec extraction
        const sp = (specs[item] = specs[item] || { item, block: b.name });
        for (const k of ['lsl', 'target', 'usl', 'unit']) if (sp[k] == null && g(r, b[k]) != null) sp[k] = g(r, b[k]);
        if (!sp.agg) sp.agg = b.agg;
      }
    }
    // push specs to global store (don't overwrite manual edits)
    for (const [item, sp] of Object.entries(specs)) {
      const ex = App.state.specs[item];
      if (sp.lsl != null || sp.usl != null || sp.target != null) info.specItems++;
      if (!ex || ex.from !== 'manual') App.state.specs[item] = { unit: sp.unit ?? ex?.unit ?? '', lsl: sp.lsl ?? null, target: sp.target ?? null, usl: sp.usl ?? null, from: src.name };
    }

    const condCols = condIdx.map((i) => ({ name: C[i].name, type: C[i].type, role: 'condition' }));
    const siteCols = [
      { name: 'Wafer ID', type: 'text', role: 'wafer' }, { name: 'Lot ID', type: 'text', role: 'lot' },
      { name: 'Block', type: 'text', role: 'condition' }, { name: 'Station', type: 'text', role: 'condition' },
      { name: 'Time', type: 'datetime', role: 'time' }, { name: 'Item', type: 'text', role: 'item' },
      { name: 'Site', type: 'text', role: 'site' }, { name: 'Value', type: 'number', role: 'measure' },
      { name: 'Raw Value', type: 'number', role: 'label' }, { name: 'Invalid', type: 'number', role: 'label' },
      { name: 'X', type: 'number', role: 'x' }, { name: 'Y', type: 'number', role: 'y' },
      ...condCols,
    ];
    siteRows.forEach((r) => { if (r.Site != null) r.Site = String(r.Site); });

    // ---- wafer-level wide ----
    const aggOf = {};
    blocks.forEach((b) => (aggOf[b.name] = b.agg || 'mean'));
    const W = new Map();
    const items = [], itemSet = new Set(), stations = [], stSet = new Set();
    const itemHasInvalid = new Set();
    for (const r of siteRows) {
      let w = W.get(r['Wafer ID']);
      if (!w) { w = { lots: [], cond: {}, vals: {}, inv: {}, n: {}, st: {} }; W.set(r['Wafer ID'], w); }
      if (r['Lot ID'] != null) w.lots.push([r.Time ? r.Time.getTime() : 0, r['Lot ID']]);
      for (const c of condCols) if (w.cond[c.name] == null && r[c.name] != null) w.cond[c.name] = r[c.name];
      if (!itemSet.has(r.Item)) { itemSet.add(r.Item); items.push({ item: r.Item, block: r.Block }); }
      (w.vals[r.Item] = w.vals[r.Item] || []);
      if (r.Value != null) w.vals[r.Item].push(r.Value);
      w.n[r.Item] = (w.n[r.Item] || 0) + 1;
      if (r.Invalid) { w.inv[r.Item] = (w.inv[r.Item] || 0) + 1; itemHasInvalid.add(r.Item); }
      if (r.Time) {
        const st = String(r.Station);
        if (!stSet.has(st)) { stSet.add(st); stations.push(st); }
        const t = r.Time.getTime();
        if (w.st[st] == null || t < w.st[st]) w.st[st] = t;
      }
    }
    let lotChanges = false;
    for (const w of W.values()) if (new Set(w.lots.map((l) => l[1])).size > 1) { lotChanges = true; break; }

    const waferCols = [{ name: 'Wafer ID', type: 'text', role: 'wafer' }, { name: 'Lot ID', type: 'text', role: 'lot' }];
    if (lotChanges) waferCols.push({ name: 'Lot ID (最終)', type: 'text', role: 'lot' });
    waferCols.push(...condCols);
    stations.forEach((s) => waferCols.push({ name: `${s} 時間`, type: 'datetime', role: 'time' }));
    items.forEach((it) => waferCols.push({ name: it.item, type: 'number', role: 'measure', agg: aggOf[it.block], block: it.block }));
    items.filter((it) => itemHasInvalid.has(it.item)).forEach((it) => {
      waferCols.push({ name: `${it.item} #invalid`, type: 'number', role: 'measure', count: true });
      waferCols.push({ name: `${it.item} #n`, type: 'number', role: 'measure', count: true });
    });

    const waferRows = [];
    for (const [wid, w] of W) {
      const o = { 'Wafer ID': wid };
      const lotsSorted = w.lots.slice().sort((a, b) => a[0] - b[0]);
      o['Lot ID'] = lotsSorted.length ? lotsSorted[0][1] : null;
      if (lotChanges) o['Lot ID (最終)'] = lotsSorted.length ? lotsSorted[lotsSorted.length - 1][1] : null;
      Object.assign(o, w.cond);
      stations.forEach((s) => (o[`${s} 時間`] = w.st[s] != null ? new Date(w.st[s]) : null));
      items.forEach((it) => {
        const arr = w.vals[it.item];
        if (!arr || !arr.length) { o[it.item] = null; return; }
        const s = App.stats(arr);
        o[it.item] = aggOf[it.block] === 'median' ? s.median : s.mean;
      });
      items.filter((it) => itemHasInvalid.has(it.item)).forEach((it) => {
        o[`${it.item} #invalid`] = w.n[it.item] ? w.inv[it.item] || 0 : null;
        o[`${it.item} #n`] = w.n[it.item] || null;
      });
      waferRows.push(o);
    }

    // ---- per-block site-level wide tables: one row per (wafer, site), items as columns ----
    const blockSiteDs = [];
    for (const b of blocks) {
      const G = new Map();
      const bItems = [], bSet = new Set();
      for (const r of siteRows) {
        if (r.Block !== b.name) continue;
        const k = `${r['Wafer ID']}\u0001${r.Site}`;
        let o = G.get(k);
        if (!o) {
          o = { 'Wafer ID': r['Wafer ID'], 'Lot ID': r['Lot ID'], Site: r.Site, X: r.X, Y: r.Y };
          for (const c of condCols) o[c.name] = r[c.name];
          G.set(k, o);
        }
        if (o.X == null && r.X != null) { o.X = r.X; o.Y = r.Y; }
        if (!bSet.has(r.Item)) { bSet.add(r.Item); bItems.push(r.Item); }
        o[r.Item] = r.Value;
        if (r.Time && (!o.Time || r.Time > o.Time)) o.Time = r.Time;
      }
      const rowsB = [...G.values()];
      const hasXY = rowsB.some((o) => o.X != null && o.Y != null);
      if (hasXY) rowsB.forEach((o) => (o['R (mm)'] = o.X != null && o.Y != null ? Math.round(Math.hypot(o.X, o.Y) * 10) / 10 : null));
      const cols = [
        { name: 'Wafer ID', type: 'text', role: 'wafer' }, { name: 'Lot ID', type: 'text', role: 'lot' },
        { name: 'Site', type: 'text', role: 'site' },
        ...(hasXY ? [{ name: 'X', type: 'number', role: 'x' }, { name: 'Y', type: 'number', role: 'y' }, { name: 'R (mm)', type: 'number', role: 'measure' }] : []),
        { name: 'Time', type: 'datetime', role: 'time' },
        ...condCols,
        ...bItems.map((it) => ({ name: it, type: 'number', role: 'measure' })),
      ];
      blockSiteDs.push({ id: App.uid('ds'), name: `${src.name} · ${b.name} by site`, kind: 'site', sourceId: src.id, columns: cols, rows: rowsB });
    }

    return [
      { id: App.uid('ds'), name: `${src.name} · 長表 (tidy)`, kind: 'site', sourceId: src.id, columns: siteCols, rows: siteRows },
      ...blockSiteDs,
      { id: App.uid('ds'), name: `${src.name} · by wafer`, kind: 'wafer', sourceId: src.id, columns: waferCols, rows: waferRows },
    ];
  };

  /** left join: add columns of right onto left by key */
  T.join = (left, right, keyL, keyR, colNames, name) => {
    const map = new Map();
    let dup = 0;
    for (const r of right.rows) {
      const k = r[keyR];
      if (k == null) continue;
      if (map.has(String(k))) { dup++; continue; }
      map.set(String(k), r);
    }
    const existing = new Set(left.columns.map((c) => c.name));
    const add = right.columns.filter((c) => colNames.includes(c.name)).map((c) => ({
      ...c, src: c.name, name: existing.has(c.name) ? `${c.name} (${right.name})` : c.name,
    }));
    let matched = 0;
    const rows = left.rows.map((r) => {
      const m = map.get(String(r[keyL]));
      if (m) matched++;
      const o = { ...r };
      add.forEach((c) => (o[c.name] = m ? m[c.src] : null));
      return o;
    });
    const ds = {
      id: App.uid('ds'), name: name || `${left.name} ⨝ ${right.name}`, kind: left.kind, sourceId: null, derived: true,
      columns: [...left.columns, ...add.map(({ src, ...c }) => c)], rows,
    };
    App.state.datasets.push(ds);
    return { ds, matched, total: left.rows.length, dup };
  };

  /** export dataset to xlsx */
  T.exportDataset = (ds) => {
    const aoa = [ds.columns.map((c) => c.name)];
    for (const r of ds.rows) aoa.push(ds.columns.map((c) => (r[c.name] == null ? null : r[c.name])));
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'data');
    XLSX.writeFile(wb, `${ds.name.replace(/[\\/:*?"<>|]/g, '_')}.xlsx`);
  };
})();
