/* core.js — namespace, state, utilities, event bus */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  App.VERSION = '0.4.0';

  // ---------------- state ----------------
  App.state = {
    sources: [],        // raw imported tables
    datasets: [],       // analysis-ready tables
    specs: {},          // item -> {unit, lsl, target, usl, from}
    activeSourceId: null,
    activeDatasetId: null,
    settings: { invalidAbs: 1e30 },
  };

  // ---------------- roles ----------------
  App.ROLES = [
    { id: 'ignore', label: '忽略', group: '' },
    { id: 'wafer', label: 'Wafer ID', group: 'id' },
    { id: 'lot', label: 'Lot ID', group: 'id' },
    { id: 'time', label: '時間', group: 'attr' },
    { id: 'condition', label: 'Condition', group: 'attr' },
    { id: 'measure', label: 'Measure (數值參數)', group: 'wide' },
    { id: 'station', label: '站點 Station', group: 'attr' },
    { id: 'item', label: 'Item name', group: 'long' },
    { id: 'value', label: 'Value', group: 'long' },
    { id: 'site', label: 'Site ID', group: 'long' },
    { id: 'lsl', label: 'LSL', group: 'spec' },
    { id: 'target', label: 'Target', group: 'spec' },
    { id: 'usl', label: 'USL', group: 'spec' },
    { id: 'unit', label: 'Unit', group: 'spec' },
    { id: 'x', label: 'Site X', group: 'long' },
    { id: 'y', label: 'Site Y', group: 'long' },
    { id: 'label', label: 'Label (其他文字)', group: '' },
  ];
  App.roleLabel = (id) => (App.ROLES.find((r) => r.id === id) || {}).label || id;
  // roles that belong to a measurement block in long format
  App.BLOCK_ROLES = ['item', 'value', 'site', 'lsl', 'target', 'usl', 'unit', 'x', 'y', 'time', 'station', 'lot'];

  App.TYPES = [
    { id: 'number', label: '數值' },
    { id: 'text', label: '文字' },
    { id: 'datetime', label: '時間' },
  ];

  // ---------------- utils ----------------
  let _uid = 0;
  App.uid = (p = 'id') => `${p}${Date.now().toString(36)}${(++_uid).toString(36)}`;

  App.esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  App.isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && isNaN(v));

  const pad = (n) => String(n).padStart(2, '0');
  App.fmtDate = (d) =>
    d instanceof Date && !isNaN(d)
      ? `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      : '';

  App.fmtNum = (v) => {
    if (typeof v !== 'number' || isNaN(v)) return '';
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1e7 || a < 1e-4)) return v.toExponential(3);
    return String(+v.toPrecision(7));
  };

  App.fmtCell = (v) => {
    if (v instanceof Date) return App.fmtDate(v);
    if (typeof v === 'number') return App.fmtNum(v);
    return v ?? '';
  };

  App.toNumber = (v) => {
    if (typeof v === 'number') return isNaN(v) ? null : v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof Date) return v.getTime();
    if (typeof v !== 'string') return null;
    const s = v.trim().replace(/,/g, '');
    if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
    return parseFloat(s);
  };

  App.toDate = (v) => {
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number') {
      // Excel serial date
      if (v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000);
      return null;
    }
    if (typeof v !== 'string' || !v.trim()) return null;
    const s = v.trim().replace(/\//g, '-');
    if (!/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return null;
    const d = new Date(s.replace(' ', 'T'));
    return isNaN(d) ? null : d;
  };

  App.stats = (arr) => {
    const a = arr.filter((v) => typeof v === 'number' && !isNaN(v)).sort((x, y) => x - y);
    const n = a.length;
    if (!n) return { n: 0 };
    const mean = a.reduce((s, v) => s + v, 0) / n;
    const sd = n > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
    const q = (p) => {
      const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
      return a[lo] + (a[hi] - a[lo]) * (i - lo);
    };
    return { n, mean, sd, min: a[0], max: a[n - 1], median: q(0.5), q1: q(0.25), q3: q(0.75) };
  };

  App.median = (arr) => App.stats(arr).median;
  App.mean = (arr) => App.stats(arr).mean;

  // ---------------- event bus ----------------
  const handlers = {};
  App.on = (ev, fn) => (handlers[ev] = handlers[ev] || []).push(fn);
  App.emit = (ev, data) => (handlers[ev] || []).forEach((fn) => fn(data));

  // ---------------- lookups ----------------
  App.getSource = (id) => App.state.sources.find((s) => s.id === id);
  App.getDataset = (id) => App.state.datasets.find((d) => d.id === id);

  // ---------------- toast ----------------
  App.toast = (msg, kind = 'info') => {
    const host = document.getElementById('toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.classList.add('hide'), 3200);
    setTimeout(() => el.remove(), 3800);
  };

  // ---------------- storage (safe) ----------------
  App.store = {
    get(k, def) {
      try { const v = localStorage.getItem('pdat:' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; }
    },
    set(k, v) {
      try { localStorage.setItem('pdat:' + k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
  };

  App.download = (filename, text, mime = 'application/json') => {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  // generic HTML table renderer (first N rows)
  App.renderTable = (columns, rows, opts = {}) => {
    const max = opts.max ?? 200;
    const head = columns.map((c) => `<th title="${App.esc(c.title || '')}">${App.esc(c.name)}${c.badge ? `<span class="th-badge ${c.badgeCls || ''}">${App.esc(c.badge)}</span>` : ''}</th>`).join('');
    const body = rows.slice(0, max).map((r) =>
      '<tr>' + columns.map((c) => {
        const v = Array.isArray(r) ? r[c.idx] : r[c.name];
        const cls = typeof v === 'number' ? ' class="num"' : '';
        return `<td${cls}>${App.esc(App.fmtCell(v))}</td>`;
      }).join('') + '</tr>').join('');
    const more = rows.length > max ? `<div class="muted small">只顯示前 ${max} 列，共 ${rows.length.toLocaleString()} 列</div>` : '';
    return `<div class="table-wrap"><table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${more}`;
  };
})();
