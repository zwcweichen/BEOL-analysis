/* importer.js — file reading, header detection, type & role inference */
(function () {
  'use strict';
  const App = window.App;
  const I = (App.importer = {});

  const READ_OPTS = { type: 'array', cellDates: true, dense: true, cellText: false, cellHTML: false };   // v3.8: dense + no formatted text ≈ 40% faster, sheet_to_json 20× faster
  const AOA_OPTS = { header: 1, raw: true, defval: null, blankrows: false };
  /** SheetJS source for a worker: the inlined <script> text (full build) or the CDN url (lite build) */
  const xlsxForWorker = () => {
    for (const sc of document.querySelectorAll('script')) {
      if (sc.src && /xlsx/i.test(sc.src)) return { url: sc.src };
      if (!sc.src && /\/\* \.\.\/vendor\/xlsx|XLSX\s*=|\bXLSX\b/.test(sc.textContent.slice(0, 400)) && sc.textContent.length > 100000) return { text: sc.textContent };
    }
    return null;
  };
  /** parse off the main thread: the worker returns sheet names + AOA per sheet (Dates survive structured clone); the UI keeps painting the progress bar */
  const readInWorker = (bytes, lib) => new Promise((resolve, reject) => {
    const head = lib.url ? `importScripts(${JSON.stringify(lib.url)});` : lib.text;
    const code = `${head}\nself.onmessage = (e) => { try { const wb = XLSX.read(e.data, ${JSON.stringify(READ_OPTS)}); const aoa = {}; for (const n of wb.SheetNames) aoa[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], ${JSON.stringify(AOA_OPTS)}); postMessage({ SheetNames: wb.SheetNames, aoa }); } catch (err) { postMessage({ error: String(err && err.message || err) }); } };`;
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    let w; try { w = new Worker(url); } catch (e) { URL.revokeObjectURL(url); reject(e); return; }
    w.onmessage = (e) => { w.terminate(); URL.revokeObjectURL(url); if (e.data && e.data.error) reject(new Error(e.data.error)); else resolve(e.data); };
    w.onerror = (e) => { w.terminate(); URL.revokeObjectURL(url); reject(new Error(e.message || 'worker error')); };
    w.postMessage(bytes, [bytes.buffer]);
  });
  /** onStage(stage, pct) — v3.8 progress: 'read' with byte %, then 'parse' (in a Web Worker when possible, else on the main thread after one paint) */
  I.readFile = (file, onStage) =>
    new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error);
      fr.onprogress = (e) => { if (onStage && e.lengthComputable) onStage('read', e.loaded / e.total); };
      fr.onload = async () => {
        if (onStage) onStage('parse', null);
        const bytes = new Uint8Array(fr.result);
        const lib = typeof Worker !== 'undefined' && !I.noWorker ? xlsxForWorker() : null;
        if (lib) { try { resolve(await readInWorker(bytes, lib)); return; } catch (e) { console.warn('xlsx worker failed, parsing on the main thread', e); } }
        setTimeout(() => {   // let the progress UI paint before the synchronous parse
          try { resolve(XLSX.read(new Uint8Array(fr.result), READ_OPTS)); } catch (e) { reject(e); }
        }, 30);
      };
      fr.readAsArrayBuffer(file);
    });

  I.sheetAOA = (wb, sheetName) => {
    if (wb.aoa) return wb.aoa[sheetName] || [];   // pre-converted by the worker
    const ws = wb.Sheets[sheetName];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, AOA_OPTS);
  };

  /** first row that looks like a header: wide enough and mostly non-numeric text */
  I.detectHeaderRow = (aoa) => {
    const lim = Math.min(aoa.length, 30);
    let maxW = 0;
    for (let i = 0; i < lim; i++) maxW = Math.max(maxW, (aoa[i] || []).filter((v) => !App.isBlank(v)).length);
    for (let i = 0; i < lim; i++) {
      const row = (aoa[i] || []).filter((v) => !App.isBlank(v));
      if (row.length < Math.max(2, maxW * 0.6)) continue;
      const txt = row.filter((v) => typeof v === 'string' && App.toNumber(v) === null && !(v instanceof Date)).length;
      if (txt / row.length >= 0.8) return i;
    }
    return 0;
  };

  I.detectType = (values, name) => {
    const vals = [];
    for (const v of values) { if (!App.isBlank(v)) vals.push(v); if (vals.length >= 3000) break; }
    if (!vals.length) return /時間|time|date|日期/i.test(name) ? 'datetime' : 'text';
    let nNum = 0, nDate = 0;
    for (const v of vals) {
      if (v instanceof Date) nDate++;
      else if (typeof v === 'string' && App.toDate(v)) nDate++;
      else if (App.toNumber(v) !== null) nNum++;
    }
    if (nDate / vals.length >= 0.9) return 'datetime';
    if (nNum / vals.length >= 0.95) return 'number';
    return 'text';
  };

  const RX = {
    wafer: /wafer\s*[_-]?\s*id|^wafer$|^wf\s*[_-]?id|片號|^wafer\s*no/i,
    lot: /lot\s*[_-]?\s*id|^lot$|批號|lot\s*no/i,
    lsl: /(^|[\s_-])lsl($|[\s_-])|lower\s*spec|spec\s*low|下限/i,
    usl: /(^|[\s_-])usl($|[\s_-])|upper\s*spec|spec\s*high|上限/i,
    target: /target|(^|[\s_-])tgt($|[\s_-])|中心值/i,
    unit: /(^|[\s_-])unit($|[\s_-])|單位/i,
    x: /site\s*[_-]?x$|die\s*[_-]?x$|^x$|(^|[\s_-])x\s*\(|座標\s*x/i,
    y: /site\s*[_-]?y$|die\s*[_-]?y$|^y$|(^|[\s_-])y\s*\(|座標\s*y/i,
    item: /item\s*[_-]?name|param(eter)?\s*[_-]?name|^item$|^parameter$|測項/i,
    value: /value$|^val$|量測值|site\s*value/i,
    site: /site\s*[_-]?id$|^site$|\ssite$|^site\s*no|點位/i,
    time: /時間|time|date|日期/i,
    station: /站點|station|^step|operation|^oper/i,
  };

  I.guessRole = (col, nRows) => {
    const n = col.name;
    for (const r of ['wafer', 'lot', 'lsl', 'usl', 'target', 'unit', 'x', 'y', 'item', 'value', 'site']) {
      if (RX[r].test(n)) {
        if (r === 'value' && col.type !== 'number') continue;
        if ((r === 'x' || r === 'y' || r === 'lsl' || r === 'usl' || r === 'target') && col.type !== 'number') continue;
        return r;
      }
    }
    if (col.type === 'datetime' || RX.time.test(n)) return col.type === 'datetime' ? 'time' : 'label';
    if (RX.station.test(n)) return 'station';
    if (col.type === 'number') return 'measure';
    if (col.unique <= Math.max(30, nRows * 0.05)) return 'condition';
    return 'label';
  };

  /** assign long-format blocks by column position; returns block list */
  I.assignBlocks = (columns) => {
    const blocks = [];
    let cur = '';
    for (const c of columns) {
      if (c.role === 'item') {
        let name = c.name.replace(/item\s*[_-]?name|parameter\s*name|item/i, '').trim() || `B${blocks.length + 1}`;
        while (blocks.find((b) => b.name === name)) name += "'";
        blocks.push({ name, agg: /wat|cp|e[-_ ]?test/i.test(name) ? 'median' : 'mean' });
        cur = name;
      }
      c.block = App.BLOCK_ROLES.includes(c.role) ? cur : '';
    }
    return blocks;
  };

  I.convert = (v, type) => {
    if (App.isBlank(v)) return null;
    if (type === 'number') return App.toNumber(v);
    if (type === 'datetime') return App.toDate(v);
    if (v instanceof Date) return App.fmtDate(v);
    return String(v).trim();
  };

  /** (re)build columns from aoa using header/skip settings. keeps previous defs when names match */
  I.buildColumns = (src, keepDefs) => {
    const aoa = src.aoa;
    const hdr = aoa[src.headerRow] || [];
    const body = aoa.slice(src.headerRow + 1 + (src.skipRows || 0)).filter((r) => r && r.some((v) => !App.isBlank(v)));
    src.body = body;
    const width = Math.max(hdr.length, ...body.slice(0, 200).map((r) => r.length));
    const seen = {};
    const prev = {};
    (keepDefs || []).forEach((c) => (prev[c.name] = c));
    src.columns = [];
    for (let i = 0; i < width; i++) {
      let name = App.isBlank(hdr[i]) ? `Column ${i + 1}` : String(hdr[i] instanceof Date ? App.fmtDate(hdr[i]) : hdr[i]).trim();
      if (seen[name]) name = `${name}_${++seen[name]}`; else seen[name] = 1;
      const values = body.map((r) => r[i]);
      const nonBlank = values.filter((v) => !App.isBlank(v));
      if (!nonBlank.length && App.isBlank(hdr[i])) continue; // fully empty column
      const uniq = new Set(nonBlank.slice(0, 20000).map((v) => (v instanceof Date ? v.getTime() : v)));
      const col = {
        name, idx: i, nonBlank: nonBlank.length, unique: uniq.size,
        sample: nonBlank.slice(0, 3),
      };
      col.type = I.detectType(values, name);
      col.role = I.guessRole(col, body.length);
      if (prev[name]) { col.type = prev[name].type; col.role = prev[name].role; col.block = prev[name].block; }
      src.columns.push(col);
    }
    src.nRows = body.length;
    I.refreshFormat(src, !!keepDefs);
    src.typed = null;
  };

  I.refreshFormat = (src, keepBlocks) => {
    const hasLong = src.columns.some((c) => c.role === 'item') && src.columns.some((c) => c.role === 'value');
    src.format = hasLong ? 'long' : 'wide';
    if (hasLong && !keepBlocks) src.blocks = I.assignBlocks(src.columns);
    if (!hasLong && !keepBlocks) { src.blocks = []; src.columns.forEach((c) => (c.block = '')); }
    src.blocks = src.blocks || [];
  };

  /** role from type only (used when a column is removed from a structure slot) */
  I.autoRole = (col, nRows) => {
    if (col.type === 'number') return 'measure';
    if (col.type === 'datetime') return 'time';
    return col.unique <= Math.max(30, nRows * 0.05) ? 'condition' : 'label';
  };

  /** typed rows (array of arrays aligned with src.columns) */
  I.typedRows = (src) => {
    if (src.typed) return src.typed;
    const cols = src.columns;
    src.typed = src.body.map((r) => cols.map((c) => I.convert(r[c.idx], c.type)));
    return src.typed;
  };

  I.createSource = (file, wb) => {
    const src = {
      id: App.uid('src'), name: file.name.replace(/\.[^.]+$/, ''), fileName: file.name,
      wb, sheetNames: wb.SheetNames.slice(), sheet: wb.SheetNames[0], headerRow: 0, skipRows: 0,
    };
    I.loadSheet(src, src.sheet);
    return src;
  };

  I.loadSheet = (src, sheet) => {
    src.sheet = sheet;
    src.aoa = I.sheetAOA(src.wb, sheet);
    src.headerRow = I.detectHeaderRow(src.aoa);
    src.skipRows = 0;
    I.buildColumns(src);
  };

  // ---------------- templates ----------------
  I.makeTemplate = (src, name) => ({
    kind: 'pdat-template', version: 1, name: name || src.name,
    headerRow: src.headerRow, skipRows: src.skipRows, sheet: src.sheet,
    columns: src.columns.map((c) => ({ name: c.name, type: c.type, role: c.role, block: c.block || '' })),
    blocks: (src.blocks || []).map((b) => ({ ...b })),
  });

  I.applyTemplate = (src, tpl) => {
    if (tpl.sheet && src.sheetNames.includes(tpl.sheet) && tpl.sheet !== src.sheet) I.loadSheet(src, tpl.sheet);
    src.headerRow = tpl.headerRow ?? src.headerRow;
    src.skipRows = tpl.skipRows ?? 0;
    I.buildColumns(src, tpl.columns);
    src.blocks = (tpl.blocks || []).map((b) => ({ ...b }));
    I.refreshFormat(src, true);
    if (src.format === 'long' && !src.blocks.length) src.blocks = I.assignBlocks(src.columns);
    const matched = src.columns.filter((c) => tpl.columns.find((t) => t.name === c.name)).length;
    return { matched, total: src.columns.length };
  };
})();
