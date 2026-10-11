/* app.js — BEOL 分析戰報 UI
 *   module switch (WAT / Inline / Yield) → setup → dashboard report (overview lights + HL master-detail)
 *   → trend matrix → correlation → floating chart windows → export (one-page HTML / PPT)
 */
(function () {
  'use strict';
  const App = window.App;
  const E = App.rptEngine, RU = App.rules;
  const S = (App.rpt = { file: '', src: null, dsRaw: null, ds: null, siteDs: [], links: [], cfg: null, res: null, siteLevel: false, grain: 'wafer', mode: 'wat',
    hl: { wat: 0, inline: 0 }, ov: 'mean', dens: 'auto', rowf: { abn: false, layers: [] }, hlf: { lv: 'all', group: '' }, collapsed: new Set(), trend: { mode: 'abn', x: 'date' }, corr: { y: null, x: null, group: '全部' } });
  App.VERSION = '2.9';
  const $ = (id) => document.getElementById(id);
  const esc = App.esc;
  const CIPC = ['#2a6fdb', '#e8590c', '#0f9d8a', '#b5179e', '#6741d9'];
  const BSLC = '#9aa3ae';
  const MOD = { wat: 'WAT', inline: 'Inline', yield: 'Yield' };
  const short = (n) => RU.parseName(n).short;
  const unit = (n) => RU.parseName(n).unit;
  const fmtK = E.fmtK, pct = E.pct;
  const f4 = (v) => (typeof v === 'number' && isFinite(v) ? (Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(3) : String(+v.toPrecision(4))) : '—');
  const cipColor = (c) => CIPC[Math.max(0, S.cfg.cips.indexOf(c)) % CIPC.length];
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const LVZH = { green: '綠', yellow: '黃', orange: '橘', na: '—' };
  const isAbnL = (l) => l === 'yellow' || l === 'orange';
  /** the one number shown in a light: K (σ), fold (×) or fail-rate difference (%pt) */
  const shiftTxt = (x) => (x.level === 'na' ? '—' : x.metric === 'fold' ? `×${x.fold.toFixed(2)}` : x.metric === 'rate' ? `${x.diff >= 0 ? '+' : '−'}${Math.abs(x.diff).toFixed(1)}%pt` : fmtK(x.k));
  const itemOf = (name) => S.cfg.items.find((i) => i.name === name);
  const allFindings = () => E.KINDS.flatMap((k) => S.res.findings[k]);
  const varTxt = (f) => `${f.which === 'wiw' ? '片內' : 'W2W'} σ ×${(f.which === 'wiw' ? f.cell.wiwRatio : f.cell.sdRatio).toFixed(2)}`;
  const fTxt = (f) => (f.type === 'var' ? varTxt(f) : shiftTxt(f.cell));
  /** "Rc_V12 @ TMTQ11：FAB15 Via 導通變差（K +2.33σ）" → "FAB15 Via 導通變差" */
  const multiCip = (c) => c.cips.length > 1;
  const meaning = (dx) => (typeof dx === 'string' ? dx : dx.mean || '');

  // ================================================================ boot
  document.addEventListener('DOMContentLoaded', () => {
    if (!window.XLSX || !window.Plotly) {
      document.body.insertAdjacentHTML('afterbegin', '<div style="padding:12px;background:#fde6d6;color:#9a3412">無法載入程式庫（SheetJS／Plotly）。lite 版需要能連到 cdn.jsdelivr.net；請改用完整版 BEOL_Report.html。</div>');
      return;
    }
    $('ver').textContent = 'v' + App.VERSION;
    $('file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) loadFile(f); });
    $('kbFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) kbImport(f); });
    $('file2').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) linkFile(f); });
    $('btnLink').addEventListener('click', () => $('file2').click());
    $('tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b && !b.disabled) showTab(b.dataset.tab); });
    $('mods').addEventListener('click', (e) => { const b = e.target.closest('button[data-mod]'); if (b && !b.disabled) setMode(b.dataset.mod); });
    $('btnHtml').addEventListener('click', exportHtml);
    $('btnPpt').addEventListener('click', exportPpt);
    if ($('pptDetail')) $('pptDetail').onchange = (e) => { S.pptDetail = e.target.value; };
    $('btnPrint').addEventListener('click', printReport);
    $('btnCopy').addEventListener('click', copySummary);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeTopWin(); return; }
      if (current === 'report' && S.res && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) {
        const rows = [...document.querySelectorAll('#report .hl-row')].map((x) => +x.dataset.hl); if (!rows.length) return;
        e.preventDefault(); const k = rows.indexOf(S.hl[S.mode]); selectHL(rows[(k + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length]);
      }
    });
    document.addEventListener('click', (e) => {
      const l = e.target.closest('[data-item][data-group][data-cip]');
      if (l && !l.closest('.fwin')) openCell(l.dataset.item, l.dataset.group, l.dataset.cip);
    });
    renderMods(); renderSetup();
  });

  let current = 'setup';
  async function showTab(t) {
    current = t;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === `tab-${t}`));
    if (t === 'report' && S.dirty?.report) renderReport();
    if (t === 'trend' && S.dirty?.trend) renderTrend();
    if (t === 'corr' && S.dirty?.corr) renderCorr();
    if (t === 'kb') renderKB();
  }

  // ================================================================ module switch
  const hasKind = (k) => !!S.cfg && S.cfg.items.some((i) => i.on && i.kind === k);
  function renderMods() {
    document.querySelectorAll('#mods button').forEach((b) => {
      const m = b.dataset.mod;
      b.classList.toggle('on', m === S.mode);
      b.disabled = !S.cfg || !hasKind(m);
      b.title = b.disabled ? (S.cfg ? `資料中沒有 ${MOD[m]} item` : '請先匯入資料') : '';
    });
  }
  function setMode(m) {
    if (m === S.mode) return;
    S.mode = m; S.trend.mode = 'abn';
    renderMods();
    if (S.res) { S.dirty = { report: true, trend: true, corr: true }; renderLegend(); showTab(current === 'setup' ? 'report' : current); }
  }


  // ================================================================ data layer: link a second file by wafer id
  async function linkFile(file) {
    if (!S.dsRaw || !S.cfg?.waferCol) { App.toast('請先匯入主要資料', 'err'); return; }
    try {
      const t0 = performance.now();
      const wb = await App.importer.readFile(file);
      const src = App.importer.createSource(file, wb);
      App.state.datasets = [];
      const { datasets } = App.transform.buildDatasets(src);
      const ds = src.format === 'long' ? (datasets.find((d) => d.kind === 'wafer') || datasets[0]) : datasets[0];   // wide: the table as-is (one or many rows per wafer)
      const mainKeys = new Set(S.dsRaw.rows.map((r) => E.waferKey(r[S.cfg.waferCol])).filter(Boolean));
      const wc = E.findWaferCol(ds, mainKeys);
      if (!wc) { App.toast(`${file.name}：找不到與主檔 wafer id 對應的欄位（主檔格式如 ${esc([...mainKeys][0] || '')}）`, 'err'); return; }
      const col = E.collapseLinked(ds, wc);
      if (!col.columns.length) { App.toast(`${file.name}：除了 wafer id 之外沒有可連結的欄位`, 'err'); return; }
      const rep = E.linkInto(S.dsRaw, S.cfg.waferCol, col, file.name);
      rep.waferCol = wc; rep.pivoted = col.pivoted; rep.collapsed = col.collapsed; rep.rows = ds.rows.length;
      S.links.push(rep);
      // new numeric columns become items (classified by the knowledge base); text columns feed the factor scan
      for (const name of rep.columns) {
        const c = S.dsRaw.columns.find((x) => x.name === name);
        if (c.type !== 'number') continue;
        const n = S.dsRaw.rows.filter((r) => num(r[name]) != null).length;
        if (new Set(S.dsRaw.rows.map((r) => r[name]).filter((v) => v != null)).size < 2) continue;
        const k = RU.classify(name);
        S.cfg.items.push(E.itemSetup({ name, cat: k.cat, conf: k.conf, on: true, n, linked: file.name }, S.dsRaw.rows));
      }
      applyGrain();
      const pct = Math.round(rep.rate * 100);
      App.toast(`已連結 ${file.name}：主檔 ${rep.mainWafers} 片中 ${rep.matched} 片對到（${pct}%），新增 ${rep.columns.length} 個欄位${rep.pivoted ? '（長表已依站點轉成寬表）' : rep.collapsed ? '（多列已壓成每片一列）' : ''}`, pct < 50 ? 'err' : 'ok');
      renderMods();
      if (S.res) generate(); else renderSetup();
      // a check window asked for this import → reopen it on the fresh result with the new columns selectable
      const ro = S.reopenCheck; S.reopenCheck = null;
      if (ro && S.res) { const f2 = S.res.findings[S.mode].find((x) => x.cell.item.name === ro.item && x.cell.group === ro.group && x.cell.cip === ro.cip); if (f2) openCheckWin(f2, ro.opts); }
    } catch (e) { console.error(e); App.toast(`連結失敗：${e.message}`, 'err'); }
  }
  function unlink(label) {
    const rep = S.links.find((l) => l.label === label); if (!rep) return;
    const drop = new Set(rep.columns);
    S.dsRaw.columns = S.dsRaw.columns.filter((c) => !drop.has(c.name));
    S.dsRaw.rows.forEach((r) => drop.forEach((n) => delete r[n]));
    S.cfg.items = S.cfg.items.filter((i) => !drop.has(i.name));
    if (drop.has(S.cfg.groupCol)) S.cfg.groupCol = '';
    S.links = S.links.filter((l) => l !== rep);
    applyGrain(); renderMods();
    if (S.res) generate(); else renderSetup();
  }
  const linkChip = () => (S.links.length ? `<span class="chip lnk" data-golink title="資料層：點一下看連結狀況">資料層：主檔＋${S.links.length} 個連結檔（配對 ${S.links.map((l) => `${Math.round(l.rate * 100)}%`).join('、')}）</span>` : '');

  // ================================================================ load
  async function loadFile(file, sheet) {
    try {
      const t0 = performance.now();
      const { src, ds, siteDs } = await E.load(file, sheet);
      S.file = file.name; S._file = file; S.src = src; S.dsRaw = ds; S.siteDs = siteDs; S.links = [];
      $('btnLink').disabled = false;
      S.cfg = E.autoConfig(ds);
      S.mode = S.cfg.mode;
      S.siteLevel = E.dupRatio(ds, S.cfg.waferCol) > 1.5;
      if (S.siteLevel && !siteDs.length) S.siteDs = [ds];      // wide by-site table → within-wafer stats from the table itself
      S.grain = 'wafer';
      applyGrain();
      $('fileChip').textContent = `${file.name} · ${ds.rows.length.toLocaleString()} 列`;
      $('fileChip').classList.add('ok');
      App.toast(`已讀取 ${file.name}`, 'ok');
      renderMods();
      if (validMsg()) { renderSetup(); showTab('setup'); App.toast('部分欄位需要確認，請檢查設定', 'err'); }
      else generate();
    } catch (e) { console.error(e); App.toast(`讀取失敗：${e.message}`, 'err'); }
  }
  function applyGrain() { S.ds = S.siteLevel && S.grain === 'wafer' ? E.toWafer(S.dsRaw, S.cfg.waferCol) : S.dsRaw; }
  function validMsg() {
    const c = S.cfg;
    if (!c) return '尚未匯入資料';
    if (!c.waferCol) return '請選擇 Wafer ID 欄位';
    if (!c.condCol) return '請選擇 Condition 欄位';
    if (!c.baseline) return '請選擇 Baseline';
    if (!c.cips.length) return '請至少勾選一個 CIP 條件';
    if (!c.items.some((i) => i.on)) return '請至少勾選一個量測 item';
    return '';
  }
  function generate() {
    const m = validMsg(); if (m) { App.toast(m, 'err'); renderSetup(); showTab('setup'); return; }
    const t0 = performance.now();
    if (!hasKind(S.mode)) S.mode = E.KINDS.find(hasKind) || 'wat';
    S.res = E.compute(S.ds, S.cfg, S.grain === 'wafer' ? S.siteDs : []);
    S.dirty = { report: true, trend: true, corr: true };
    S.corr.y = null; S.hl = { wat: 0, inline: 0 }; S.hlf = { lv: 'all', group: '' }; S.rowf = { abn: false, layers: [] };
    closeAllWins();
    ['report', 'trend', 'corr'].forEach((t) => (document.querySelector(`#tabs button[data-tab=${t}]`).disabled = false));
    ['btnHtml', 'btnPpt', 'btnPrint', 'btnCopy'].forEach((b) => ($(b).disabled = false));
    renderMods(); renderLegend(); renderSetup();
    showTab(current === 'setup' ? 'report' : current);
    App.toast(`戰報完成：${S.res.items.length} 個 item × ${S.res.groups.length} 組`, 'ok');
  }

  // ================================================================ legend bar (thresholds per module)
  const hasMetric = (m) => S.cfg.items.some((i) => i.on && i.kind === 'wat' && i.metric === m);
  function renderLegend() {
    const c = S.cfg, th = E.thresholds();
    const inp = (id) => `<input id="${id}" data-th="${id}" value="${th[id]}">`;
    const rows = S.mode === 'wat'
      ? `<span class="kset">｜ K <span class="pill green">綠</span> ≤ ${inp('kG')} σ <span class="pill orange">橘</span> > ${inp('kO')} σ</span>
         ${hasMetric('fold') ? `<span class="kset">｜ LK 倍數 <span class="pill green">綠</span> ≤ ×${inp('fG')} <span class="pill orange">橘</span> > ×${inp('fO')}</span>` : ''}
         ${hasMetric('rate') ? `<span class="kset">｜ SPA 異常率差 <span class="pill green">綠</span> ≤ ${inp('rG')}%pt <span class="pill orange">橘</span> > ${inp('rO')}%pt</span>` : ''}`
      : S.mode === 'inline' ? `<span class="kset">｜ K <span class="pill green">綠</span> ≤ ${inp('kG')} σ <span class="pill orange">橘</span> > ${inp('kO')} σ</span>
         <span class="kset">｜ 變異 σ 倍數 <span class="pill green">綠</span> ≤ ×${inp('sG')} <span class="pill orange">橘</span> > ×${inp('sO')}</span>`
      : `<span class="kset">｜ K <span class="pill green">綠</span> ≤ ${inp('kG')} σ <span class="pill orange">橘</span> > ${inp('kO')} σ</span><span class="muted">｜ yield 以 wafer 為單位，低於 BSL 為壞</span>`;
    $('legendBar').innerHTML = `<b style="color:var(--ink)">Condition：</b>
      <span><i class="dot" style="background:${BSLC}"></i>BSL（${esc(c.baseline)}）</span>
      ${c.cips.map((p) => `<span><i class="dot" style="background:${cipColor(p)}"></i>CIP（${esc(p)}）</span>`).join('')}
      ${rows}<span class="muted">｜ 黃燈介於兩者之間</span>`;
    const upd = () => {
      const t = { ...th };
      $('legendBar').querySelectorAll('[data-th]').forEach((x) => (t[x.dataset.th] = App.toNumber(x.value)));
      const bad = [['kG', 'kO'], ['fG', 'fO'], ['rG', 'rO'], ['sG', 'sO']].some(([g, o]) => t[g] == null || t[o] == null || t[g] < 0 || t[o] < t[g]);
      if (bad || t.fG < 1 || t.sG < 1) { App.toast('門檻需滿足 0 ≤ 綠 ≤ 橘（倍數類需 ≥ 1）', 'err'); return; }
      App.store.set('rpt-th', t); generate();
    };
    $('legendBar').querySelectorAll('[data-th]').forEach((x) => x.addEventListener('change', upd));
  }

  // ================================================================ setup
  function metricTag(it) {
    if (it.metric === 'fold') return '<span class="tag metric" title="以 median 倍數判斷，trend 用 log 軸">倍數 ×</span>';
    if (it.metric === 'rate') return `<span class="tag metric" title="讀值等於固定值才算正常；判斷異常比例">固定值 ${f4(it.target)}</span>`;
    return '';
  }
  const uniqN = (col) => new Set(S.ds.rows.map((r) => r[col]).filter((v) => v != null)).size;
  const groupCands = () => S.ds.columns.filter((x) => x.type === 'text' && x.name !== S.cfg.waferCol && x.name !== S.cfg.lotCol && x.name !== S.cfg.condCol && (() => { const u = uniqN(x.name); return u >= 2 && u <= 60; })()).map((x) => x.name);
  const condCands = () => S.ds.columns.filter((x) => x.type === 'text' && x.name !== S.cfg.waferCol && (() => { const u = uniqN(x.name); return u >= 2 && u <= 20; })()).map((x) => x.name);
  function renderSetup() {
    const host = $('setup');
    if (!S.ds) {
      host.innerHTML = `<div class="drop" id="drop"><b>拖放 WAT／Inline Excel 或 CSV 到這裡，或點一下選擇檔案</b>
        支援水平格式（by wafer，一列一片）與垂直格式（by site／Item-Value 長表）。資料只在這台電腦的瀏覽器內處理。</div>
        <div class="muted small" style="margin-top:14px;line-height:1.8">流程：匯入 → 系統自動判斷 Wafer、日期、分組、Condition 與每個 item 的物理類別 → 依模組（WAT／Inline）產生戰報 → 需要時再看 Trend 矩陣與 Correlation → 匯出 HTML／PPT。<br>
        WAT：一般 item 用 K-shift；LK（漏電）用倍數並以 log 軸繪圖；SPA 讀值是固定值（例如 20 V），判斷偏離固定值的異常比例。<br>
        Inline：均值 K-shift、wafer 間 σ 倍數、片內 σ 倍數（需要 by site 資料）與徑向分布，並推估對同層 WAT 的影響。</div>`;
      const d = $('drop');
      d.addEventListener('click', () => $('file').click());
      ['dragenter', 'dragover'].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.remove('over'); }));
      d.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
      return;
    }
    const c = S.cfg, ds = S.ds;
    const text = ds.columns.filter((x) => x.type === 'text').map((x) => x.name);
    const dates = ds.columns.filter((x) => x.type === 'datetime').map((x) => x.name);
    const opt = (list, cur, blank) => (blank ? `<option value="">${blank}</option>` : '') + list.map((n) => `<option ${n === cur ? 'selected' : ''}>${esc(n)}</option>`).join('');
    const condVals = c.condCol ? Object.keys(c.condCounts || {}) : [];
    const wat = c.items.filter((i) => i.kind === 'wat'), inl = c.items.filter((i) => i.kind === 'inline'), yld = c.items.filter((i) => i.kind === 'yield');
    const catOpts = (cur) => ['wat', 'inline', 'yield'].map((k) => `<optgroup label="${{ wat: 'WAT 電性', inline: 'Inline 量測', yield: 'Yield／CP' }[k]}">${RU.CATS.filter((x) => x.kind === k).map((x) => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</optgroup>`).join('');
    const card = (it) => {
      const L = RU.layer(it.name);
      return `<div class="icard ${it.on ? '' : 'off'} ${it.conf < 0.7 ? 'low' : ''}" data-it="${esc(it.name)}">
        <div class="t"><input type="checkbox" data-on ${it.on ? 'checked' : ''}>${esc(short(it.name))}${L ? `<span class="tag layer">${L}</span>` : ''}${metricTag(it)}${it.linked ? `<span class="tag lnk" title="${esc(it.linked)}">連結</span>` : ''}${it.conf < 0.7 ? '<span class="tag warn">請確認類別</span>' : ''}</div>
        <div class="u">${esc(unit(it.name) || '（無單位）')} · N ${it.n.toLocaleString()}</div>
        <select data-cat>${catOpts(it.cat)}</select></div>`;
    };
    const vm = validMsg();
    const nSite = S.siteDs.reduce((a, d) => a + d.rows.length, 0);
    host.innerHTML = `<div class="setup-grid">
      <div class="sec"><h3>來源</h3>
        <div class="frow"><label>檔案</label><div>${esc(S.file)}</div></div>
        ${S.links.length ? `<div class="frow"><label>連結檔</label><div class="links">${S.links.map((l) => `<div class="lnkrow"><b>${esc(l.label)}</b> <span class="muted small">${l.rows.toLocaleString()} 列 · wafer 欄「${esc(l.waferCol)}」${l.pivoted ? ' · 長表已轉寬表' : l.collapsed ? ' · 已壓成每片一列' : ''}</span><br>
            <span class="${l.rate < 0.5 ? 'warn' : ''}">配對 ${l.matched} / ${l.mainWafers} 片（${Math.round(l.rate * 100)}%）</span>${l.extra ? `，連結檔另有 ${l.extra} 片不在主檔` : ''} · 新增 ${l.columns.length} 欄：<span class="muted small">${l.columns.slice(0, 8).map(esc).join('、')}${l.columns.length > 8 ? '…' : ''}</span>
            <a href="#" data-unlink="${esc(l.label)}" class="small">移除</a></div>`).join('')}</div></div>` : ''}
        <div class="frow"><label></label><div><button class="btn sm" data-link2>＋ 連結另一個檔案</button><span class="muted small">　機台履歷、yield、其他量測：以 wafer id 自動對應（例 UAB123.01）；一片多列會先壓成每片一列；長表（wafer × 站點 × 機台）會轉成每站點一欄</span></div></div>
        <div class="frow"><label>工作表</label><select id="sSheet">${opt(S.src.sheetNames, S.src.sheet)}</select></div>
        <div class="frow"><label>資料粒度</label><div><span class="seg"><button data-grain="wafer" class="${S.grain === 'wafer' ? 'on' : ''}">by Wafer mean（每片一列）</button><button data-grain="site" class="${S.grain === 'site' ? 'on' : ''}" ${S.siteLevel ? '' : 'disabled title="資料已經是每片一列"'}>by Site value</button></span></div></div>
        <div class="hint">系統判斷：${S.siteLevel ? `每片 wafer 約 ${E.dupRatio(S.dsRaw, c.waferCol).toFixed(1)} 列 → 預設先取每片 mean 再比較` : '每片 wafer 一列 → by Wafer mean'}${S.src.format === 'long' ? '；長表（Item／Value）已自動轉成每片一列' : ''}${nSite ? `；保留 ${nSite.toLocaleString()} 筆 site 值，用來算片內 σ 與徑向分布` : ''}</div>
        <h3 style="margin-top:18px">基本欄位</h3>
        <div class="frow"><label>Wafer ID *</label><select id="sWafer">${opt(text, c.waferCol)}</select></div>
        <div class="frow"><label>日期</label><select id="sDate">${opt(dates, c.dateCol, '（無）')}</select></div>
        <div class="frow"><label>分組欄</label><select id="sGroup">${opt(groupCands(), c.groupCol, '（不分組）')}</select></div>
        <div class="hint">分組欄可以是產品（Part6）、layer、機台…；點燈表會依這個欄位的每個值分開算 K。戰報頁上方也可以直接切換。</div>
      </div>
      <div class="sec"><h3>Condition（Baseline 與比較的 CIP）</h3>
        <div class="frow"><label>Condition 欄 *</label><select id="sCond">${opt(text, c.condCol, '（請選擇）')}</select></div>
        <div class="frow"><label>Baseline（BSL）*</label><select id="sBase">${opt(condVals, c.baseline)}</select></div>
        <div class="frow"><label>CIP 條件 *</label><div class="cips">${condVals.filter((v) => v !== c.baseline).map((v) => `<label><input type="checkbox" data-cip="${esc(v)}" ${c.cips.includes(v) ? 'checked' : ''}>${esc(v)} <span class="muted small">(${c.condCounts[v]})</span></label>`).join('') || '<span class="muted">—</span>'}</div></div>
        <div class="hint">Baseline 預設取樣本數最多的條件（或名稱是 POR／BSL 的條件）；其餘值都當 CIP（condition 1、2…），每個 CIP 各自和 BSL 比。</div>
      </div></div>
      <div class="sec" style="margin-top:20px"><h3>量測項目</h3>
        <div class="items-bar"><a href="#" data-all="1">全選</a><a href="#" data-all="0">全不選</a>
          <input type="text" id="sFilter" placeholder="篩選欄名…" style="width:180px">
          <span class="muted small">WAT ${wat.length} 個、Inline ${inl.length} 個${yld.length ? `、Yield ${yld.length} 個` : ''}。類別決定判斷方式（K／倍數／固定值）、診斷文字與自動配對；標「請確認類別」的是系統沒把握的項目。</span></div>
        <div class="lab muted small" style="margin:6px 0">WAT 電性（WAT 模組）</div>
        <div class="items-grid">${wat.map(card).join('') || '<span class="muted small">沒有偵測到 WAT item</span>'}</div>
        <div class="lab muted small" style="margin:14px 0 6px">Inline 量測（Inline 模組；在 WAT 模組中作為交叉驗證）</div>
        <div class="items-grid">${inl.map(card).join('') || '<span class="muted small">沒有 inline 欄位。有的話（例如 M12 CD、V12 CD、THK），系統會自動和同層 WAT 配對，結論會更具體。</span>'}</div>
        ${yld.length ? `<div class="lab muted small" style="margin:14px 0 6px">Yield／CP（Yield 模組；by wafer 的良率或 bin 比例）</div><div class="items-grid">${yld.map(card).join('')}</div>` : ''}
      </div>
      <div class="go"><button class="btn primary" id="sGo">產生戰報 →</button><span class="${vm ? '' : 'muted'} small" style="color:${vm ? 'var(--o)' : ''}">${esc(vm || '設定完成')}</span></div>`;
    $('sSheet').onchange = (e) => loadFile(S._file, e.target.value);
    host.querySelectorAll('[data-unlink]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); unlink(a.dataset.unlink); }));
    const lb = host.querySelector('[data-link2]'); if (lb) lb.onclick = () => $('file2').click();
    host.querySelectorAll('[data-grain]').forEach((b) => (b.onclick = () => { S.grain = b.dataset.grain; applyGrain(); renderSetup(); }));
    $('sWafer').onchange = (e) => { c.waferCol = e.target.value; S.siteLevel = E.dupRatio(S.dsRaw, c.waferCol) > 1.5; applyGrain(); renderSetup(); };
    $('sDate').onchange = (e) => { c.dateCol = e.target.value || null; };
    $('sGroup').onchange = (e) => { c.groupCol = e.target.value || ''; };
    $('sCond').onchange = (e) => { c.condCol = e.target.value || null; E.setCond(c, S.ds); renderSetup(); };
    $('sBase').onchange = (e) => { c.baseline = e.target.value; c.cips = Object.keys(c.condCounts).filter((v) => v !== c.baseline); renderSetup(); };
    host.querySelectorAll('[data-cip]').forEach((x) => (x.onchange = () => {
      const v = x.dataset.cip; c.cips = x.checked ? [...new Set([...c.cips, v])] : c.cips.filter((y) => y !== v);
      c.cips.sort((a, b) => Object.keys(c.condCounts).indexOf(a) - Object.keys(c.condCounts).indexOf(b));
    }));
    host.querySelectorAll('[data-all]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); c.items.forEach((i) => (i.on = a.dataset.all === '1')); renderSetup(); }));
    $('sFilter').oninput = (e) => {
      const q = e.target.value.toLowerCase();
      host.querySelectorAll('.icard').forEach((el) => (el.style.display = !q || el.dataset.it.toLowerCase().includes(q) ? '' : 'none'));
    };
    host.querySelectorAll('.icard').forEach((el) => {
      const it = c.items.find((i) => i.name === el.dataset.it);
      el.querySelector('[data-on]').onchange = (e) => { it.on = e.target.checked; el.classList.toggle('off', !it.on); };
      el.querySelector('[data-cat]').onchange = (e) => { it.cat = e.target.value; it.conf = 1; it.userCat = true; E.itemSetup(it, S.ds.rows); renderSetup(); };
    });
    $('sGo').onclick = generate;
  }

  // ================================================================ light tables
  function cellTip(it, p, x) {
    if (x.level === 'na') return x.reason;
    const n = `N ${x.n} / BSL ${x.bn}${x.low ? '（CIP 少於 5 片）' : ''}`;
    if (x.metric === 'fold') return `${p} median ${f4(x.median)} vs BSL ${f4(x.bmedian)}　${n}`;
    if (x.metric === 'rate') return `${p} 異常 ${pct(x.rateC)} vs BSL ${pct(x.rateB)}（固定值 ${f4(it.target)}）　${n}`;
    return `${p} mean ${f4(x.mean)} vs BSL ${f4(x.bmean)}　${n}`;
  }
  /** ---- adaptive density of the overview table ----
   *  normal : one number per cell, 76 px cells
   *  compact: 11 px font, 56 px cells
   *  heat   : 40 px cells; green cells show colour only, abnormal cells show a short number (σ / × / %pt in the category row)
   *  'auto' picks the densest tier needed so that the table stays beside the HL pane (≈ 46% of the report width) */
  const CELLW = { normal: 78, compact: 58, heat: 42 };
  function pickDensity(kind) {
    if (S.dens !== 'auto') return S.dens;
    const ncol = S.res.groups.length * S.cfg.cips.length, nrow = S.res.items.filter((i) => i.kind === kind).length;
    const avail = Math.max(420, ($('report')?.clientWidth || innerWidth - 80) * 0.46 - 120);
    for (const t of ['normal', 'compact']) if (ncol * CELLW[t] <= avail && nrow <= (t === 'normal' ? 14 : 28)) return t;
    return 'heat';
  }
  const layersOf = (kind) => [...new Set(S.res.items.filter((i) => i.kind === kind).map((i) => RU.layer(i.name)).filter(Boolean))].sort(E.natCmp);
  const rowAbn = (it, view) => S.res.groups.some((g) => S.cfg.cips.some((p) => { const x = S.res.cells[it.name][g][p]; return isAbnL(view === 'var' ? x.varLevel : x.level); }));
  /** short number for heat cells: "+2.6", "×8.9", "+13" */
  const heatTxt = (x) => (x.level === 'na' ? '' : x.metric === 'fold' ? `×${x.fold < 10 ? x.fold.toFixed(1) : Math.round(x.fold)}` : x.metric === 'rate' ? `${x.diff >= 0 ? '+' : '−'}${Math.abs(x.diff).toFixed(Math.abs(x.diff) < 10 ? 1 : 0)}` : `${x.k >= 0 ? '+' : '−'}${Math.abs(x.k).toFixed(1)}`);
  /** light table: view 'mean' = shift number only; 'var' = W2W / WIW σ ratio */
  function lightTable(kind, view = 'mean', dens = 'normal') {
    const r = S.res, c = S.cfg;
    let items = r.items.filter((i) => i.kind === kind);
    if (!items.length) return '';
    if (S.rowf.abn) items = items.filter((it) => rowAbn(it, view));
    if (S.rowf.layers.length) items = items.filter((it) => S.rowf.layers.includes(RU.layer(it.name)));
    const multi = c.cips.length > 1, heat = dens === 'heat';
    const kl = { wat: 'WAT item', inline: 'Inline item', yield: 'Yield item' }[kind] || 'item';
    const head = c.groupCol
      ? `<tr><th>${kl}<span class="sub">${esc(c.groupCol)} →</span></th>${r.groups.map((g) => c.cips.map((p) => `<th>${esc(g)}${multi ? `<span class="sub">${esc(p)}</span>` : ''}</th>`).join('')).join('')}</tr>`
      : `<tr><th>${kl}<span class="sub">不分組</span></th>${c.cips.map((p) => `<th>${esc(p)}<span class="sub">vs ${esc(c.baseline)}</span></th>`).join('')}</tr>`;
    const byCat = new Map();
    [...items].sort((a, b) => (/^other/.test(a.cat) ? 1 : 0) - (/^other/.test(b.cat) ? 1 : 0)).forEach((it) => { if (!byCat.has(it.cat)) byCat.set(it.cat, []); byCat.get(it.cat).push(it); });
    const ncol = 1 + r.groups.length * c.cips.length;
    const colAbn = {}; r.groups.forEach((g) => c.cips.forEach((p) => (colAbn[`${g}|${p}`] = { y: 0, o: 0 })));
    let body = '';
    for (const [cat, its] of byCat) {
      const m = its[0].metric, open = !S.collapsed.has(`${kind}|${cat}`);
      const unitNote = view === 'var' ? '×' : m === 'fold' ? '×（median 倍數）' : m === 'rate' ? `%pt（固定值 ${f4(its[0].target)}）` : 'σ';
      const nAbn = its.filter((it) => rowAbn(it, view)).length;
      body += `<tr class="cat ${open ? '' : 'closed'}" data-cat="${esc(`${kind}|${cat}`)}" title="點一下收合／展開"><td colspan="${ncol}"><i class="tri">${open ? '▾' : '▸'}</i>${esc(RU.byId(cat).label)}<span>　${esc(unitNote)}</span>${!open ? `<span class="muted">　${its.length} 個 item${nAbn ? `，<b class="o">${nAbn} 個異常</b>` : ''}</span>` : ''}</td></tr>`;
      if (!open) {
        for (const it of its) for (const g of r.groups) for (const p of c.cips) { const x = r.cells[it.name][g][p], l = view === 'var' ? x.varLevel : x.level; if (l === 'orange') colAbn[`${g}|${p}`].o++; else if (l === 'yellow') colAbn[`${g}|${p}`].y++; }
        continue;
      }
      for (const it of its) {
        body += `<tr><td class="item" title="${esc(it.name)}">${esc(short(it.name))}</td>`;
        for (const g of r.groups) for (const p of c.cips) {
          const x = r.cells[it.name][g][p], l = view === 'var' ? x.varLevel : x.level;
          if (l === 'orange') colAbn[`${g}|${p}`].o++; else if (l === 'yellow') colAbn[`${g}|${p}`].y++;
          const at = `data-item="${esc(it.name)}" data-group="${esc(g)}" data-cip="${esc(p)}"`;
          if (view === 'var') {
            const part = (lab, v, lv) => (v == null ? '' : `<span class="vv ${lv}">${heat ? '' : `${lab} `}×${v.toFixed(heat ? 1 : 2)}</span>`);
            const b = heat ? (isAbnL(l) ? part('', Math.max(x.sdRatio || 0, x.wiwRatio || 0), l) : '') : part('W2W', x.sdRatio, x.sdLevel) + part('WIW', x.wiwRatio, x.wiwLevel);
            body += `<td class="lc var ${l}" ${at} title="${esc(`W2W ×${x.sdRatio?.toFixed(2) ?? '—'}　WIW ×${x.wiwRatio?.toFixed(2) ?? '—'}（CIP ÷ BSL）`)}">${b || (heat ? '' : '—')}</td>`;
          } else body += `<td class="lc ${l}" ${at} title="${esc(`${shiftTxt(x)}　${cellTip(it, p, x)}`)}">${heat ? (isAbnL(l) || l === 'na' ? esc(heatTxt(x)) : '') : esc(shiftTxt(x))}</td>`;
        }
        body += '</tr>';
      }
    }
    const foot = `<tr class="sum"><td class="item">異常格數</td>${r.groups.map((g) => c.cips.map((p) => { const a = colAbn[`${g}|${p}`]; return `<td class="${a.o ? 'o' : a.y ? 'y' : ''}">${a.o + a.y ? `${a.o ? `<b>${a.o}</b>` : ''}${a.y ? `<span>${a.o ? '+' : ''}${a.y}</span>` : ''}` : '—'}</td>`; }).join('')).join('')}</tr>`;
    return `<table class="lt ${dens}"><thead>${head}</thead><tbody>${body}${foot}</tbody></table>`;
  }

  // ================================================================ plots
  const baseLayout = (h) => ({
    height: h, margin: { l: 52, r: 12, t: 28, b: 40 }, paper_bgcolor: '#fff', plot_bgcolor: '#fff',
    font: { family: 'Segoe UI, Microsoft JhengHei, Noto Sans TC, Arial', size: 11, color: '#1c2430' },
    xaxis: { gridcolor: '#eef1f5', linecolor: '#d5dbe3', automargin: true, tickfont: { size: 10, color: '#667085' } },
    yaxis: { gridcolor: '#eef1f5', linecolor: '#d5dbe3', automargin: true, tickfont: { size: 10, color: '#667085' }, exponentformat: 'e' },
    legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom', font: { size: 10.5 } },
    hovermode: 'closest',
  });
  const CFG = { displaylogo: false, responsive: true, modeBarButtonsToRemove: ['lasso2d', 'select2d', 'toggleSpikelines'] };
  const sample = (arr, max) => (arr.length <= max ? arr : arr.filter((_, i) => i % Math.ceil(arr.length / max) === 0));
  const axTitle = (n, extra = '') => ({ text: `${short(n)}${unit(n) ? ` (${unit(n)})` : ''}${extra}`, font: { size: 10.5, color: '#667085' } });
  const isLog = (name) => itemOf(name)?.metric === 'fold';
  /** expected sign of the raw-value correlation (rate items: failing readings are LOW, so the sign flips) */
  const rawSign = (watName, sign) => (itemOf(watName)?.metric === 'rate' ? -sign : sign);
  function band(x0, x1, lo, hi, color) {
    return [
      { type: 'scatter', mode: 'lines', x: [x0, x1], y: [lo, lo], line: { width: 0 }, hoverinfo: 'skip', showlegend: false },
      { type: 'scatter', mode: 'lines', x: [x0, x1], y: [hi, hi], line: { width: 0 }, fill: 'tonexty', fillcolor: color, hoverinfo: 'skip', showlegend: false },
    ];
  }
  const hline = (x0, x1, y, color, dash, width = 1.2, name) => ({ type: 'scatter', mode: 'lines', x: [x0, x1], y: [y, y], line: { color, width, dash }, hoverinfo: name ? 'name' : 'skip', name: name || '', showlegend: false });

  /** Trend: BSL grey cloud + reference band (K: ±1σ/±2σ, fold: ×/÷ thresholds on log axis, rate: fixed value line), CIP coloured on top */
  function trendFig(itemName, group, h = 250, opts = {}) {
    const c = S.cfg, r = S.res, it = itemOf(itemName), th = r.th;
    const rows = (r.byG.get(group) || S.ds.rows).filter((x) => num(x[itemName]) != null && (!isLog(itemName) || x[itemName] > 0));
    const useDate = S.trend.x === 'date' && c.dateCol;
    const sorted = rows.slice().sort((a, b) => {
      if (c.dateCol) { const da = a[c.dateCol], db = b[c.dateCol]; if (da && db && da - db) return da - db; }
      return E.natCmp(a[c.waferCol], b[c.waferCol]);
    });
    const xOf = useDate ? (x) => x[c.dateCol] : (x, i) => i;
    const pts = sorted.map((x, i) => ({ x: xOf(x, i), y: x[itemName], w: x[c.waferCol], c: r.cOf(x) }));
    const xs = pts.map((p) => p.x).filter((v) => v != null);
    const xmin = xs.length ? (useDate ? new Date(Math.min(...xs)) : Math.min(...xs)) : 0, xmax = xs.length ? (useDate ? new Date(Math.max(...xs)) : Math.max(...xs)) : 1;
    const bsl = pts.filter((p) => p.c === c.baseline);
    const c0 = Object.values(r.cells[itemName]?.[group] || {})[0];
    const data = [], shapes = [];
    const tol = it.metric === 'rate' ? Math.max(1e-6, Math.abs(it.target) * 0.005) : 0;
    const isFail = (y) => it.metric === 'rate' && Math.abs(y - it.target) > tol;
    if (it.metric === 'fold' && c0?.bmedian > 0) {
      const m = c0.bmedian;
      data.push(...band(xmin, xmax, m / th.fO, m * th.fO, 'rgba(233,237,242,.75)'), ...band(xmin, xmax, m / th.fG, m * th.fG, 'rgba(214,221,230,.85)'));
      data.push(hline(xmin, xmax, m, '#6b7684', 'dash', 1.2, `BSL median ${f4(m)}`));
    } else if (it.metric === 'rate') {
      data.push(hline(xmin, xmax, it.target, '#1e8e4e', 'dot', 1.4, `固定值 ${f4(it.target)}`));
    } else if (c0?.bmean != null && c0.bsd > 0) {
      const bm = c0.bmean, bs = c0.bsd;
      shapes.push({ type: 'rect', xref: 'paper', x0: 0, x1: 1, y0: bm - 2 * bs, y1: bm + 2 * bs, fillcolor: '#e9edf2', opacity: 0.55, line: { width: 0 }, layer: 'below' });
      shapes.push({ type: 'rect', xref: 'paper', x0: 0, x1: 1, y0: bm - bs, y1: bm + bs, fillcolor: '#dde3ea', opacity: 0.7, line: { width: 0 }, layer: 'below' });
      shapes.push({ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: bm, y1: bm, line: { color: '#6b7684', width: 1.2, dash: 'dash' } });
    }
    const big = opts.big, mini = opts.mini;
    const bShow = sample(bsl, mini ? 700 : 1500);
    data.push({ type: 'scatter', mode: 'markers', name: `BSL ${c.baseline}${it.metric === 'rate' && c0 ? `  異常 ${pct(c0.rateB)}` : ''}`, x: bShow.map((p) => p.x), y: bShow.map((p) => p.y), text: bShow.map((p) => p.w),
      marker: { color: bShow.map((p) => (isFail(p.y) ? '#5b6573' : BSLC)), size: big ? 5 : mini ? 3 : 3.5, opacity: 0.6 }, hovertemplate: '%{text}<br>%{y}<extra>BSL</extra>' });
    for (const p of c.cips) {
      const cp = pts.filter((q) => q.c === p);
      if (!cp.length) continue;
      const cell = r.cells[itemName]?.[group]?.[p];
      const lab = !cell || cell.level === 'na' ? '' : `  ${shiftTxt(cell)}`;
      data.push({ type: 'scatter', mode: 'markers', name: `${p}${lab} (N ${cp.length})`, x: cp.map((q) => q.x), y: cp.map((q) => q.y), text: cp.map((q) => q.w),
        marker: { color: cipColor(p), size: cp.map((q) => (isFail(q.y) ? (big ? 10 : 7) : big ? 7 : mini ? 4.5 : 5.5)), symbol: cp.map((q) => (isFail(q.y) ? 'diamond' : 'circle')),
          line: { width: cp.map((q) => (isFail(q.y) ? 1.4 : 0.5)), color: cp.map((q) => (isFail(q.y) ? '#c2410c' : '#fff')) } },
        hovertemplate: `%{text}<br>%{y}<extra>${esc(p)}</extra>` });
      const cx = cp.map((q) => q.x), x0 = useDate ? new Date(Math.min(...cx)) : Math.min(...cx), x1 = useDate ? new Date(Math.max(...cx)) : Math.max(...cx);
      const ref = it.metric === 'fold' ? cell?.median : it.metric === 'rate' ? null : cell?.mean;
      if (ref != null) data.push(hline(x0, x1, ref, cipColor(p), 'solid', mini ? 1.8 : 2.2));
    }
    const L = baseLayout(h);
    L.shapes = shapes;
    L.xaxis.type = useDate ? 'date' : 'linear';
    L.xaxis.title = { text: useDate ? c.dateCol : '依日期排序的 wafer 順序', font: { size: 10.5, color: '#667085' } };
    L.yaxis.title = axTitle(itemName, isLog(itemName) ? '，log' : '');
    if (isLog(itemName)) L.yaxis.type = 'log';
    if (opts.compact || mini) { L.showlegend = false; L.margin = { l: 46, r: 8, t: 8, b: 34 }; }
    if (mini) { L.xaxis.title = null; L.yaxis.title = null; L.margin = { l: 42, r: 6, t: 6, b: 24 }; L.xaxis.tickfont.size = 9; L.yaxis.tickfont.size = 9; L.xaxis.nticks = 4; L.yaxis.nticks = 5; }
    return { data, layout: L };
  }

  function waferInfo() {
    if (S._wInfo && S._wInfo.res === S.res) return S._wInfo.m;
    const m = new Map();
    for (const r of S.ds.rows) m.set(r[S.cfg.waferCol], { c: S.res.cOf(r), g: S.res.gOf(r) });
    S._wInfo = { res: S.res, m };
    return m;
  }
  function siteTableFor(name) {
    for (const d of S.siteDs || []) {
      if (!d.columns.some((c) => c.name === name)) continue;
      const wc = (d.columns.find((c) => c.role === 'wafer') || {}).name || S.cfg.waferCol;
      const xc = (d.columns.find((c) => c.role === 'x') || {}).name, yc = (d.columns.find((c) => c.role === 'y') || {}).name;
      const rc = d.columns.find((c) => c.name === 'R (mm)') ? 'R (mm)' : null;
      if (!rc && !(xc && yc)) continue;
      return { d, wc, R: (r) => (rc ? num(r[rc]) : num(r[xc]) != null && num(r[yc]) != null ? Math.hypot(r[xc], r[yc]) : null) };
    }
    return null;
  }
  const hasRadial = (name) => !!siteTableFor(name);
  /** Radial profile: site value vs R, BSL grey vs CIP coloured, with mean line per radius */
  function radialFig(itemName, group, h = 250, opts = {}) {
    const c = S.cfg, st = siteTableFor(itemName); if (!st) return null;
    const wi = waferInfo();
    const conds = [c.baseline, ...c.cips];
    const acc = new Map(conds.map((cd) => [cd, []]));
    for (const r of st.d.rows) {
      const v = num(r[itemName]), R = st.R(r), w = wi.get(r[st.wc]);
      if (v == null || R == null || !w || (group !== '全部' && w.g !== group) || !acc.has(w.c)) continue;
      acc.get(w.c).push({ R: Math.round(R), v, w: r[st.wc] });
    }
    const data = [];
    conds.forEach((cd, i) => {
      const a = acc.get(cd); if (!a.length) return;
      const col = cd === c.baseline ? BSLC : cipColor(cd), off = (i - (conds.length - 1) / 2) * 2.2;
      const sh = cd === c.baseline ? sample(a, 2500) : a;
      data.push({ type: 'scatter', mode: 'markers', name: `${cd === c.baseline ? 'BSL' : 'CIP'} ${cd}`, showlegend: false, x: sh.map((p) => p.R + off), y: sh.map((p) => p.v), text: sh.map((p) => p.w),
        marker: { color: col, size: cd === c.baseline ? 3.5 : 5, opacity: cd === c.baseline ? 0.45 : 0.75 }, hovertemplate: `%{text}<br>R %{x:.0f} mm<br>%{y}<extra>${esc(cd)}</extra>` });
      const byR = new Map(); a.forEach((p) => { if (!byR.has(p.R)) byR.set(p.R, []); byR.get(p.R).push(p.v); });
      const rs = [...byR.keys()].sort((x, y) => x - y);
      data.push({ type: 'scatter', mode: 'lines+markers', name: `${cd === c.baseline ? 'BSL' : 'CIP'} ${cd} mean`, x: rs.map((x) => x + off), y: rs.map((x) => App.stats(byR.get(x)).mean),
        line: { color: cd === c.baseline ? '#5b6573' : col, width: 2.4 }, marker: { size: 7, color: cd === c.baseline ? '#5b6573' : col } });
    });
    const L = baseLayout(h);
    L.xaxis.title = { text: '半徑 R (mm)，0 = center', font: { size: 10.5, color: '#667085' } };
    L.yaxis.title = axTitle(itemName);
    if (opts.compact) { L.showlegend = false; L.margin = { l: 46, r: 8, t: 8, b: 34 }; }
    return { data, layout: L };
  }

  /** Correlation scatter coloured by condition, with per-condition fit (log-y fit for fold items) */
  function corrFig(yName, xName, group, h = 520, compact) {
    const c = S.cfg, r = S.res, ly = isLog(yName), lx = isLog(xName);
    const rows = (group && group !== '全部' ? r.byG.get(group) || [] : S.ds.rows).filter((x) => num(x[yName]) != null && num(x[xName]) != null && (!ly || x[yName] > 0) && (!lx || x[xName] > 0));
    const ty = (v) => (ly ? Math.log10(v) : v), tx = (v) => (lx ? Math.log10(v) : v), uy = (v) => (ly ? 10 ** v : v), ux = (v) => (lx ? 10 ** v : v);
    const conds = [c.baseline, ...c.cips];
    const data = [], stats = [];
    for (const cd of conds) {
      const rr = rows.filter((x) => r.cOf(x) === cd);
      if (!rr.length) continue;
      const col = cd === c.baseline ? BSLC : cipColor(cd);
      const shown = cd === c.baseline ? sample(rr, 4000) : rr;
      data.push({ type: shown.length > 3000 ? 'scattergl' : 'scatter', mode: 'markers', name: `${cd === c.baseline ? 'BSL' : 'CIP'} ${cd}`, x: shown.map((x) => x[xName]), y: shown.map((x) => x[yName]),
        text: shown.map((x) => x[c.waferCol]), marker: { color: col, size: cd === c.baseline ? 4 : 6.5, opacity: cd === c.baseline ? 0.4 : 0.9, line: { width: cd === c.baseline ? 0 : 0.6, color: '#fff' } },
        hovertemplate: '%{text}<br>x %{x}<br>y %{y}<extra></extra>' });
      const f = App.statsLib.linreg(rr.map((x) => tx(x[xName])), rr.map((x) => ty(x[yName])));
      stats.push({ cond: cd, ...f });
      if (f.b != null) {
        const xx = Array.from({ length: 12 }, (_, i) => f.xmin + ((f.xmax - f.xmin) * i) / 11);
        data.push({ type: 'scatter', mode: 'lines', x: xx.map(ux), y: xx.map((v) => uy(f.predict(v))), line: { color: cd === c.baseline ? '#5b6573' : col, width: 2 }, showlegend: false, hoverinfo: 'skip' });
      }
    }
    const all = App.statsLib.linreg(rows.map((x) => tx(x[xName])), rows.map((x) => ty(x[yName])));
    stats.push({ cond: '全部', ...all });
    const L = baseLayout(h);
    L.xaxis.title = axTitle(xName, lx ? '，log' : ''); L.yaxis.title = axTitle(yName, ly ? '，log' : '');
    if (lx) L.xaxis.type = 'log';
    if (ly) L.yaxis.type = 'log';
    if (compact) L.margin = { l: 46, r: 8, t: 22, b: 36 };
    return { data, layout: L, stats, n: rows.length, logNote: ly || lx };
  }
  /** small charts are static (light, click → floating window); big ones interactive */
  function plotInto(div, fig, stat) { if (fig) Plotly.newPlot(div, fig.data, fig.layout, stat ? { staticPlot: true, responsive: true } : CFG); }
  const fluid = (fig) => { if (fig) { delete fig.layout.height; fig.layout.autosize = true; } return fig; };

  // ================================================================ what to plot for a finding
  /** second chart of a finding: correlation with the related item, or radial profile */
  function partnerFig(f, h, compact = true) {
    const it = f.cell.item, g = f.cell.group;
    if (f.type === 'var') return f.which === 'wiw' && hasRadial(it.name) ? { kind: 'rad', title: `${short(it.name)} 徑向分布`, fig: radialFig(it.name, g, h, { compact }) } : null;
    if (it.kind === 'wat') {
      // partner = same-layer inline with a real relation; else the strongest adjacent-layer item; else the first same-layer item
      const dirS = Math.sign(f.cell.dir ?? f.cell.k) || 1, byK = (a, b) => Math.abs(b.k) - Math.abs(a.k);
      const st = (r) => RU.relOf(r, dirS);
      const same = (f.rel || []).filter((x) => st(x) === 'strong')[0] || (f.rel || []).filter((x) => st(x) === 'weak')[0];
      const xr = (f.xrel || []).filter((x) => st(x) === 'strong').sort(byK)[0];
      const rel = (same && st(same) === 'strong' ? same : xr) || same || f.rel.find((x) => x.k != null);
      if (!rel) return null;
      const cf = corrFig(it.name, rel.item.name, g, h, compact), sc = cf.stats.find((s) => s.cond === '全部');
      const rv = sc.r != null ? Math.abs(sc.r) : null;
      const relSt = st(rel);
      const expTxt = `${rel.layer ? `鄰層 ${rel.layer}，` : ''}${relSt === 'flat' ? '此 item 未偏移' : relSt === 'opp' ? '反向' : rv == null ? '' : rv >= 0.5 ? '有關聯' : rv >= 0.3 ? '弱關聯' : '關聯性不大'}${rel.sign ? `，預期${rawSign(it.name, rel.sign) < 0 ? '負' : '正'}相關` : ''}`;
      return { kind: 'corr', y: it.name, x: rel.item.name, title: `${short(it.name)} vs ${short(rel.item.name)}`, note: `r = ${sc.r != null ? sc.r.toFixed(2) : '—'}${cf.logNote ? '（log）' : ''}，${expTxt}`, fig: cf };
    }
    const rel = f.rel.find((x) => x.cell && x.cell.level !== 'na');
    if (rel) {
      const sg = rawSign(rel.item.name, rel.sign), cf = corrFig(rel.item.name, it.name, g, h, compact), sc = cf.stats.find((s) => s.cond === '全部');
      return { kind: 'corr', y: rel.item.name, x: it.name, title: `${short(rel.item.name)} vs ${short(it.name)}`, note: `r = ${sc.r != null ? sc.r.toFixed(2) : '—'}，預期${sg < 0 ? '負' : '正'}相關`, fig: cf };
    }
    return hasRadial(it.name) ? { kind: 'rad', title: `${short(it.name)} 徑向分布`, fig: radialFig(it.name, g, h, { compact }) } : null;
  }
  const mainFig = (f, h) => ({ title: `${short(f.cell.item.name)} trend${isLog(f.cell.item.name) ? '（log 軸）' : ''}`, fig: trendFig(f.cell.item.name, f.cell.group, h, { compact: true }) });

  // ================================================================ report (dashboard)
  function kpiChips(mode) {
    const r = S.res, cnt = r.cnt[mode];
    const total = cnt.green + cnt.yellow + cnt.orange + cnt.na;
    return `<span class="kc"><b>${total}</b>判定格</span><span class="kc green"><b>${cnt.green}</b>綠 match</span><span class="kc yellow"><b>${cnt.yellow}</b>黃 觀察</span><span class="kc orange"><b>${cnt.orange}</b>橘 需關注</span>${mode === 'inline' ? `<span class="kc ${r.varCnt.orange ? 'orange' : r.varCnt.yellow ? 'yellow' : 'green'}"><b>${r.varCnt.orange + r.varCnt.yellow}</b>變異放大</span>` : ''}${cnt.na ? `<span class="kc na"><b>${cnt.na}</b>無法判定</span>` : ''}`;
  }
  function ctrlBar() {
    const c = S.cfg;
    const opt = (list, cur) => list.map((n) => `<option ${n === cur ? 'selected' : ''}>${esc(n)}</option>`).join('');
    const condVals = Object.keys(c.condCounts || {});
    return `<div class="r-ctrl no-print">
      <label>分組欄 <select id="rGroup"><option value="">（不分組）</option>${opt(groupCands(), c.groupCol)}</select></label>
      <label>比較欄 <select id="rCond">${opt(condCands(), c.condCol)}</select></label>
      <label>BSL <select id="rBase">${opt(condVals, c.baseline)}</select></label>
      <span class="lab">CIP</span><span class="chips">${condVals.filter((v) => v !== c.baseline).map((v) => `<span class="chip ${c.cips.includes(v) ? 'on' : ''}" data-rcip="${esc(v)}">${esc(v)}</span>`).join('')}</span>
      <span class="muted small">改了立即重算；分組欄的每個值各算一欄</span>${linkChip()}</div>`;
  }
  function bindCtrl(el) {
    const c = S.cfg;
    el.querySelector('#rGroup').onchange = (e) => { c.groupCol = e.target.value || ''; generate(); };
    el.querySelector('#rCond').onchange = (e) => { c.condCol = e.target.value; E.setCond(c, S.ds); generate(); };
    el.querySelector('#rBase').onchange = (e) => { c.baseline = e.target.value; c.cips = Object.keys(c.condCounts).filter((v) => v !== c.baseline); generate(); };
    el.querySelectorAll('[data-rcip]').forEach((x) => (x.onclick = () => {
      const v = x.dataset.rcip, on = c.cips.includes(v);
      if (on && c.cips.length === 1) { App.toast('至少要保留一個 CIP', 'err'); return; }
      c.cips = on ? c.cips.filter((y) => y !== v) : [...c.cips, v];
      c.cips.sort((a, b) => Object.keys(c.condCounts).indexOf(a) - Object.keys(c.condCounts).indexOf(b));
      generate();
    }));
  }

  function renderReport() {
    S.dirty.report = false;
    const r = S.res, c = S.cfg, el = $('report'), mode = S.mode;
    const fs = r.findings[mode], na = r.naList[mode], lvOf = r.lvOf;
    const d = (x) => App.fmtDate(x).slice(0, 10);
    const its = r.items.filter((i) => i.kind === mode);
    const ovToggle = mode === 'inline' ? `<span class="seg sm"><button data-ov="mean" class="${S.ov === 'mean' ? 'on' : ''}">均值 K</button><button data-ov="var" class="${S.ov === 'var' ? 'on' : ''}">變異 σ 倍數</button></span>` : '';
    const dens = pickDensity(mode), view = mode === 'inline' ? S.ov : 'mean';
    const ncol = r.groups.length * c.cips.length;
    const stack = ncol * CELLW[dens] + 150 + 540 > ($('report').clientWidth || 1200);   // table + a usable HL pane (≥ 540 px) don't fit side by side → stack
    const layers = layersOf(mode);
    const nAbnRows = r.items.filter((i) => i.kind === mode && rowAbn(i, view)).length;
    // HL list filter
    const hlAll = fs.map((f, i) => ({ f, i }));
    const hlShown = hlAll.filter(({ f }) => (S.hlf.lv === 'all' || lvOf(f) === S.hlf.lv) && (!S.hlf.group || f.cell.group === S.hlf.group));
    if (S.hl[mode] >= fs.length) S.hl[mode] = 0;
    if (hlShown.length && !hlShown.some(({ i }) => i === S.hl[mode])) S.hl[mode] = hlShown[0].i;
    el.querySelectorAll('.js-plotly-plot').forEach((p) => Plotly.purge(p));
    el.innerHTML = `
      <div class="r-head"><div><h1>BEOL ${MOD[mode]} 戰報：${esc(c.cips.join('、'))}（CIP） vs ${esc(c.baseline)}（BSL）</h1>
        <div class="kcs">${kpiChips(mode)}</div></div>
        <div class="meta">資料：${esc(S.file)}<br>${r.dateRange ? `期間：${d(r.dateRange[0])} ～ ${d(r.dateRange[1])}<br>` : ''}wafer 數：${Object.entries(r.nWafer).map(([k, v]) => `${esc(k)} ${v.toLocaleString()}`).join('、')}</div></div>
      ${ctrlBar()}
      <div class="dash ${stack ? 'stack' : ''}">
        <section class="pane ov"><div class="pane-h"><b>總覽點燈表</b><span class="muted small">${its.length} item${c.groupCol ? ` × ${r.groups.length} ${esc(c.groupCol)}` : ''}${multiCip(c) ? ` × ${c.cips.length} CIP` : ''}；點格子開 trend 視窗</span><span class="spacer"></span>${ovToggle}
            <span class="seg sm" title="密度：自動依欄數決定；熱圖模式綠格只顯示顏色，數字在滑鼠提示"><button data-dens="auto" class="${S.dens === 'auto' ? 'on' : ''}">自動</button><button data-dens="normal" class="${S.dens === 'normal' ? 'on' : ''}">標準</button><button data-dens="compact" class="${S.dens === 'compact' ? 'on' : ''}">緊湊</button><button data-dens="heat" class="${S.dens === 'heat' ? 'on' : ''}">熱圖</button></span></div>
          ${its.length > 8 || layers.length > 2 ? `<div class="ov-f"><span class="chip ${S.rowf.abn ? 'on' : ''}" data-rabn="1">只看異常 item（${nAbnRows}）</span>${layers.length > 1 ? `<span class="lab">層別</span>${layers.map((L) => `<span class="chip ${S.rowf.layers.includes(L) ? 'on' : ''}" data-rlayer="${esc(L)}">${esc(L)}</span>`).join('')}` : ''}<span class="muted small">　類別列可點選收合</span></div>` : ''}
          <div class="ov-body">${lightTable(mode, view, dens) || '<div class="empty" style="padding:30px">篩選後沒有 item</div>'}</div></section>
        <section class="pane hl"><div class="pane-h"><b>異常 HL</b><span class="muted small">${fs.length ? `${fs.filter((f) => lvOf(f) === 'orange').length} 項需關注、${fs.filter((f) => lvOf(f) === 'yellow').length} 項觀察；↑↓ 鍵切換` : ''}</span><span class="spacer"></span>
            ${fs.length > 6 ? `<span class="chips">${[['all', `全部 ${fs.length}`], ['orange', `橘 ${fs.filter((f) => lvOf(f) === 'orange').length}`], ['yellow', `黃 ${fs.filter((f) => lvOf(f) === 'yellow').length}`]].map(([k, l]) => `<span class="chip ${S.hlf.lv === k ? 'on' : ''}" data-hlv="${k}">${l}</span>`).join('')}</span>
              ${r.groups.length > 1 ? `<select id="hlG" class="sm"><option value="">全部 ${esc(c.groupCol)}</option>${r.groups.map((g) => `<option ${S.hlf.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>` : ''}` : ''}</div>
          ${fs.length ? `<div class="hl-list ${stack ? 'wide' : ''}">${hlShown.map(({ f, i }) => `<div class="hl-row ${i === S.hl[mode] ? 'on' : ''}" data-hl="${i}"><span class="pill ${lvOf(f)}">${esc(fTxt(f))}</span><b>${esc(short(f.cell.item.name))}</b>${r.groups.length > 1 ? `<span class="g">@ ${esc(f.cell.group)}</span>` : ''}${c.cips.length > 1 ? `<span class="g">${esc(f.cell.cip)}</span>` : ''}<span class="m">${esc(meaning(f.dx))}</span></div>`).join('') || '<div class="muted small" style="padding:8px">沒有符合篩選的項目</div>'}</div>
            <div class="hl-det" id="hlDet"></div>`
          : `<div class="ok-box">✔ 全部在綠燈範圍內：${MOD[mode]} 的 CIP 與 BSL match。${na.length ? `另有 ${na.length} 格無法判定（見下方資料品質）。` : ''}</div>`}
        </section>
      </div>
      ${na.length || fs.some((f) => f.cell.low) ? `<div class="dq"><b>資料品質：</b>${na.map((x) => `${esc(short(x.item.name))}${r.groups.length > 1 ? ` @ ${esc(x.group)}` : ''}：${esc(x.reason)}`).join('；')}${na.length ? '。灰色格不代表 match，而是資料不足以判定。' : ''}${fs.some((f) => f.cell.low) ? ' 部分 HL 的 CIP 少於 5 片，結論請保守看待。' : ''}</div>` : ''}
      <div class="foot">${mode === 'wat'
        ? 'K = (Mean<sub>CIP</sub> − Mean<sub>BSL</sub>) / σ<sub>BSL</sub>；LK 為 median 倍數（CIP／BSL），trend 用 log 軸；SPA 讀值為固定值，偏離 0.5% 以上算異常，比較異常比例差（%pt）。'
        : mode === 'inline' ? 'K = (Mean<sub>CIP</sub> − Mean<sub>BSL</sub>) / σ<sub>BSL</sub>；W2W = 各片 mean 的 σ 比；WIW = 每片 site σ 的平均比。對 WAT 的影響依同層物理關係推估。'
        : 'K = (Mean<sub>CIP</sub> − Mean<sub>BSL</sub>) / σ<sub>BSL</sub>，以 wafer 的 yield／bin 比例計算；診斷會對照同組 WAT 的亮燈情況。'}
        診斷文字依 item 類別的物理機制與同層對照自動產生，僅供判讀方向，請以實際製程資料確認。${esc(RU.kbVersion())}（<a href="#" data-gokb>知識庫頁</a>可查看與編輯）。</div>`;
    bindCtrl(el);
    el.querySelector('[data-gokb]').onclick = (e) => { e.preventDefault(); showTab('kb'); };
    const gl = el.querySelector('[data-golink]'); if (gl) gl.onclick = () => showTab('setup');
    el.querySelectorAll('[data-ov]').forEach((b) => (b.onclick = () => { S.ov = b.dataset.ov; renderReport(); }));
    el.querySelectorAll('[data-dens]').forEach((b) => (b.onclick = () => { S.dens = b.dataset.dens; renderReport(); }));
    el.querySelectorAll('[data-rabn]').forEach((b) => (b.onclick = () => { S.rowf.abn = !S.rowf.abn; renderReport(); }));
    el.querySelectorAll('[data-rlayer]').forEach((b) => (b.onclick = () => { const L = b.dataset.rlayer; S.rowf.layers = S.rowf.layers.includes(L) ? S.rowf.layers.filter((x) => x !== L) : [...S.rowf.layers, L]; renderReport(); }));
    el.querySelectorAll('tr.cat[data-cat]').forEach((t) => (t.onclick = () => { const k = t.dataset.cat; S.collapsed.has(k) ? S.collapsed.delete(k) : S.collapsed.add(k); renderReport(); }));
    el.querySelectorAll('[data-hlv]').forEach((b) => (b.onclick = () => { S.hlf.lv = b.dataset.hlv; renderReport(); }));
    if ($('hlG')) $('hlG').onchange = (e) => { S.hlf.group = e.target.value; renderReport(); };
    el.querySelectorAll('[data-hl]').forEach((x) => (x.onclick = () => selectHL(+x.dataset.hl)));
    const hlPane = el.querySelector('.pane.hl'); if (hlPane) hlPane.classList.toggle('narrow', !stack && hlPane.clientWidth < 700);
    const resync = () => { if (current !== 'report') return; const hp = el.querySelector('.pane.hl'); if (hp) hp.classList.toggle('narrow', !stack && hp.clientWidth < 700); if (S.dens === 'auto' && pickDensity(mode) !== dens) renderReport(); };
    if (S._rsz) removeEventListener('resize', S._rsz);
    S._rsz = () => { clearTimeout(S._rszT); S._rszT = setTimeout(resync, 250); };
    addEventListener('resize', S._rsz);
    if (fs.length) renderHL();
  }
  function selectHL(i) {
    S.hl[S.mode] = i;
    document.querySelectorAll('#report .hl-row').forEach((x) => x.classList.toggle('on', +x.dataset.hl === i));
    const row = document.querySelector(`#report .hl-row[data-hl="${i}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
    renderHL();
  }
  function renderHL() {
    const host = $('hlDet'); if (!host) return;
    host.querySelectorAll('.js-plotly-plot').forEach((p) => Plotly.purge(p));
    const f = S.res.findings[S.mode][S.hl[S.mode]]; if (!f) { host.innerHTML = ''; return; }
    const c = f.cell, lv = S.res.lvOf(f), dx = f.dx;
    const m1 = mainFig(f, 205), m2 = partnerFig(f, 205);
    const xc = crossChecks(f);
    host.innerHTML = `<div class="hd-t"><span class="pill ${lv}">${LVZH[lv]} ${esc(fTxt(f))}</span><b>${esc(dx.title)}</b><span class="tag">${esc(dx.cat)}</span></div>
      <div class="nums">${numsHtml(f)}</div>
      <div class="xcs">${xc.map((x, i) => `<div class="xc ${x.state}" ${x.run ? `data-xc="${i}" title="點一下看圖"` : ''}><span class="xl">${esc(x.label)}</span><span class="xs">${x.icon}</span><span class="xt">${esc(x.text)}</span></div>`).join('')}</div>
      <div class="hd-figs ${m2 ? '' : 'one'}">
        <div class="fig" data-zoom="main"><div class="ft">${esc(m1.title)}<span class="zoom">⤢ 放大</span></div><div class="plot"></div></div>
        ${m2 ? `<div class="fig" data-zoom="partner"><div class="ft">${esc(m2.title)}${m2.note ? `<span class="muted small" style="font-weight:400">${esc(m2.note)}</span>` : ''}<span class="zoom">⤢ 放大</span></div><div class="plot"></div></div>` : ''}
      </div>
      <div class="hd-txt one"><div><div class="lab">建議檢查 <span class="muted" style="font-weight:400">（✔ 有關聯　△ 弱關聯　✘ 關聯性不大　○ 缺資料→匯入　🔍 開檢查視窗）</span></div><ul class="cks">${checkRows(f).map(checkLi).join('')}</ul>
        <div class="mech"><span class="lab">物理機制</span>${rankCauses(f).map((r) => `<span class="mz ${r.st}">${r.st === 'yes' ? '✔ ' : r.st === 'no' ? '✘ ' : ''}${esc(r.text)}${r.note ? `<i>（${esc(r.note)}）</i>` : ''}</span>`).join('<span class="sep">·</span>') || '—'}</div>
        <div class="muted small" style="margin-top:4px">${esc(dx.fallback)}</div></div></div>`;
    const rowsCk = checkRows(f);
    host.querySelectorAll('[data-ck]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); const r = rowsCk[+a.dataset.ck]; if (r && r.run) r.run(); }));
    host.querySelectorAll('.ckz').forEach((z, i) => (z.onclick = () => openCheckWin(f, { text: rowsCk[i].text, x: /機台|chamber|tool/i.test(rowsCk[i].text) ? '' : guessX(f, rowsCk[i].text) })));
    host.querySelectorAll('[data-xc]').forEach((d) => (d.onclick = () => xc[+d.dataset.xc].run()));
    const plots = host.querySelectorAll('.plot');
    requestAnimationFrame(() => { plotInto(plots[0], m1.fig, true); if (m2) plotInto(plots[1], m2.fig, true); });
    host.querySelector('[data-zoom=main]').onclick = () => openCell(c.item.name, c.group, c.cip);
    if (m2) host.querySelector('[data-zoom=partner]').onclick = () => (m2.kind === 'corr' ? openCorrWin(m2.y, m2.x, c.group) : openCell(c.item.name, c.group, c.cip));
  }
  function numsHtml(f) {
    const c = f.cell, u = esc(unit(c.item.name));
    if (f.type === 'var') {
      const w = f.which === 'wiw';
      return (w ? `片內 site σ 平均：${esc(c.cip)} <b>${f4(c.wiwC)}</b> vs BSL <b>${f4(c.wiwB)}</b> ${u}` : `wafer 間 σ：${esc(c.cip)} <b>${f4(c.sd)}</b> vs BSL <b>${f4(c.bsd)}</b> ${u}`) + `　均值 ${shiftTxt(c)}（${LVZH[c.level]}燈）· N ${c.n} / ${c.bn}`;
    }
    if (c.metric === 'fold') return `${esc(c.cip)} median <b>${f4(c.median)}</b> vs BSL <b>${f4(c.bmedian)}</b> ${u}（${c.fold >= 1 ? `高 ${c.fold.toFixed(2)} 倍` : `低 ${(1 / c.fold).toFixed(2)} 倍`}）· N ${c.n} / ${c.bn}`;
    if (c.metric === 'rate') return `偏離固定值 ${f4(c.item.target)} ${u} 的比例：${esc(c.cip)} <b>${pct(c.rateC)}</b> vs BSL <b>${pct(c.rateB)}</b>（${c.diff >= 0 ? '+' : '−'}${Math.abs(c.diff).toFixed(1)}%pt）· N ${c.n} / ${c.bn}`;
    const p = c.bmean ? ((c.mean - c.bmean) / Math.abs(c.bmean)) * 100 : null;
    return `${esc(c.cip)} mean <b>${f4(c.mean)}</b> vs BSL <b>${f4(c.bmean)}</b> ${u}${p != null ? `（${p >= 0 ? '+' : ''}${p.toFixed(1)}%）` : ''} · N ${c.n} / ${c.bn}${c.low ? ' · ⚠ CIP 少於 5 片' : ''}`;
  }
  function findingCard(f) {
    const lv = S.res.lvOf(f), dx = f.dx;
    return `<div class="find ${lv}">
      <h4><span class="pill ${lv}">${LVZH[lv]} ${esc(fTxt(f))}</span>${esc(dx.title)}<span class="tag">${esc(dx.cat)}</span></h4>
      <div class="nums">${numsHtml(f)}</div>
      <div class="vd">${esc(dx.verdict)}</div>
      <div><div class="lab">建議檢查</div><ul class="cks static">${checkRows(f).map((r) => `<li class="ck ${r.st}"><span class="ci">${CKI[r.st] || '·'}</span>${esc(r.text)}${r.note ? `<span class="cn">${esc(r.note)}</span>` : ''}</li>`).join('')}</ul>
      <div class="mech"><span class="lab">物理機制</span>${rankCauses(f).map((r) => `<span class="mz ${r.st}">${r.st === 'yes' ? '✔ ' : r.st === 'no' ? '✘ ' : ''}${esc(r.text)}${r.note ? `<i>（${esc(r.note)}）</i>` : ''}</span>`).join('<span class="sep">·</span>')}</div>
      <div class="muted small">${esc(dx.fallback)}</div>
    </div>`;
  }



  // ================================================================ guided checks: what each suggested check needs, and the one click that runs it
  const CK = { ok: '✔', need: '○', ext: '◇', nav: '➜' };
  /** v2.8: one row per suggested check — status + evidence note + 🔍 that opens the check window (or tool window) */
  function checkRows(f) {
    return f.dx.checks.map((text, i) => {
      const h = checkHint(f, text);
      const isTool = /機台|chamber|tool|commonality|履歷|eqp|分流|matching/i.test(text);
      const x = isTool ? '' : guessX(f, text);
      let note = h.note || '', st = h.kind;
      if (!isTool && x) {
        // does this item explain THIS shift? needs both: the item itself shifted in the CIP, and wafer-level correlation
        const rel0 = [...(f.rel || []), ...(f.xrel || [])].find((q) => q.item.name === x);
        const cx = S.res.cells[x]?.[f.cell.group]?.[f.cell.cip];
        const r = rel0 && rel0.r != null ? rel0.r : f.cell.item.metric === 'rate' ? null : quickR(f.cell.item.name, x, f.cell.group);
        const rel = rel0 ? { ...rel0, r } : { item: itemOf(x) || { name: x, cat: 'other' }, k: cx?.k ?? null, r, sign: 0 };
        const dirS = Math.sign(f.cell.dir ?? f.cell.k) || 1, rs = RU.relOf(rel, dirS);
        const rTxt = r != null ? RU.fmtR(r) : '';
        note = `${short(x)}${cx ? ` ${shiftTxt(cx)}` : ''}${rTxt ? `，${rTxt}` : ''}`;
        if (rs === 'strong') { st = 'ok'; note += ' 有關聯'; }
        else if (rs === 'weak') { st = 'weak'; note += ' 關聯弱'; }
        else if (rs === 'opp') { st = 'weak'; note += ' 反向'; }
        else if (rs === 'flat') { st = 'no'; note += '，此 item 未偏移'; }
        else { st = 'ok'; }
      } else if (isTool) {
        const fs = factors(f); st = fs.length ? (fs.some((q) => q.hit) ? 'ok' : 'no') : 'need';
      } else if (h.kind !== 'nav') { st = 'need'; note = /需要 by site|沒有/.test(note) ? note : '缺資料 → 匯入補進'; }
      const run = isTool ? h.run || (() => openCheckWin(f, { text })) : h.kind === 'nav' ? h.run : () => openCheckWin(f, { text, x });
      return { text, st, note, run, i };
    });
  }
  const CKI = { ok: '✔', weak: '△', no: '✘', need: '○', nav: '➜', ext: '◇' };
  const checkLi = (r) => `<li class="ck ${r.st}" title="${esc({ ok: '已自動比對：有關聯', weak: '已自動比對：弱關聯', no: '已自動比對：關聯性不大', need: '缺資料：點一下匯入補進', nav: '切到其他模組', ext: '系統外確認' }[r.st] || '')}"><span class="ci">${CKI[r.st] || '·'}</span><a href="#" data-ck="${r.i}">${esc(r.text)}</a>${r.note ? `<span class="cn">${esc(r.note)}</span>` : ''}<span class="ckz" title="開啟檢查視窗：相關圖、共振 trend、匯入資料">🔍</span></li>`;
  function checkHint(f, text) {
    const c = f.cell, it = c.item, g = c.group, cip = c.cip, L = RU.layer(it.name);
    const t = String(text);
    const h = (kind, action, run, note) => ({ kind, icon: CK[kind], action, run, note });
    // inline dimension / thickness of the same layer
    if (/\b(CD|THK|ADI|AEI|depth|厚度|線寬|space)\b/i.test(t) || /CD（|THK|trench CD|via CD/.test(t)) {
      const wantThk = /THK|厚度|depth/i.test(t), wantVia = /via/i.test(t);
      const cand = S.res.items.filter((x) => x.kind === 'inline' && (!L || RU.layer(x.name) === L) && (wantThk ? x.cat === 'thk' : wantVia ? x.cat === 'vcd' : x.cat === 'cd' || x.cat === 'vcd'));
      if (cand.length) {
        const x = cand[0], cell = S.res.cells[x.name]?.[g]?.[cip];
        if (it.kind === 'inline') return h('ok', '看 trend', () => openCell(x.name, g, cip), cell ? `${short(x.name)} ${shiftTxt(cell)}` : '');
        return h('ok', `看 ${short(x.name)} 相關`, () => openCorrWin(it.name, x.name, g), cell ? `${short(x.name)} ${shiftTxt(cell)}` : '');
      }
      if (it.kind === 'inline') return h('ext');
      return h('need', '連結 inline 資料', () => $('file2').click(), `資料中沒有 ${L || '該層'} 的 ${wantThk ? 'THK' : 'CD'}`);
    }
    // tool / chamber / commonality
    if (/機台|chamber|tool|commonality|履歷|eqp|分流|matching/i.test(t)) {
      const fs = factors(f);
      if (fs.length) { const top = fs[0]; return h('ok', '機台分析', () => openToolWin(it.name, g, cip, top.col), top.hit ? `疑似 ${short(top.col)} = ${top.worst.v}` : `已掃 ${fs.length} 個欄位，沒有明顯 bad tool`); }
      return h('need', '連結機台履歷', () => $('file2').click(), '資料中沒有機台／chamber 欄位');
    }
    // other modules
    if (/WAT 戰報|同組 WAT|同層 Rs|Rs／LK／Rc|LK／VBD|LK／SPA|Rc（contact）|同 die Vt/.test(t)) return hasKind('wat') ? h('nav', '切到 WAT', () => setMode('wat')) : h('need', '連結 WAT 資料', () => $('file2').click());
    if (/CP bin|bin 分布|良率/.test(t)) return hasKind('yield') ? h('nav', '切到 Yield', () => setMode('yield')) : h('need', '連結 CP／yield 資料', () => $('file2').click());
    if (/徑向|edge|center|wafer map|空間特徵|方位/i.test(t)) return hasRadial(it.name) ? h('ok', '看徑向分布', () => openCell(it.name, g, cip)) : h('ext', '', null, '需要 by site 資料');
    if (/inline 數據|inline 對照|相關製程/.test(t)) return S.res.items.some((x) => x.kind === 'inline') ? h('nav', '切到 Inline', () => setMode('inline')) : h('need', '連結 inline 資料', () => $('file2').click());
    return h('ext');   // SEM / TEM / recipe / log — outside this tool
  }

  // ================================================================ tool analysis window: run rate per level + box plot, any column or combination of columns
  /** datetime column that belongs to the picked step column (e.g. "M12_ECP Time" for "M12_ECP Tool"), else the report date */
  function stepTimeCol(colName) {
    const stem = colName.replace(/\s*(tool|eqp|equip|chamber|ch|machine|機台|腔)\s*$/i, '').replace(/[_\s-]+$/, '');
    const dt = S.ds.columns.filter((c) => c.type === 'datetime');
    return (stem && dt.find((c) => c.name.startsWith(stem)))?.name || S.cfg.dateCol || null;
  }
  const weekStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  function openToolWin(item, group, cip, col) {
    const cell = S.res.cells[item]?.[group]?.[cip]; if (!cell) return;
    const cols = E.factorColumns(S.ds, S.cfg).map((c) => c.name);
    if (!cols.length) { App.toast('資料中沒有機台／chamber 等類別欄；請先連結機台履歷', 'err'); return; }
    const at = S.res.groups.length > 1 ? ` @ ${esc(group)}` : '';
    const key = `tool|${item}|${group}|${cip}`;
    const sel = new Set([col && cols.includes(col) ? col : cols[0]]);
    let scope = 'group';   // time view: this group only / all groups
    openWin(key, `機台分析：${esc(short(item))}${at} <span class="pill ${cell.level}">${esc(cip)} ${esc(shiftTxt(cell))}</span>`, (b) => {
      const draw = () => {
        const picked = cols.filter((c) => sel.has(c));
        const r = S.res, c = S.cfg, th = r.th;
        const rowsG = (c.groupCol ? S.ds.rows.filter((x) => E.cat(x[c.groupCol]) === group) : S.ds.rows).filter((x) => num(x[item]) != null);
        const cRows = rowsG.filter((x) => r.cOf(x) === cip), bRows = rowsG.filter((x) => r.cOf(x) === c.baseline);
        const keyFn = (x) => { const parts = picked.map((p) => (x[p] == null || x[p] === '' ? null : E.cat(x[p]))); return parts.some((v) => v == null) ? null : parts.join(' × '); };
        const st = E.factorLevels(cRows, bRows, item, cell, keyFn);
        const sgn = cell.dir >= 0 ? -1 : 1;
        const lvs = st.levels.slice().sort((a, b2) => (a.k == null) - (b2.k == null) || sgn * ((a.k ?? 0) - (b2.k ?? 0)) || E.natCmp(a.v, b2.v));   // worst level first
        const lvOf = (k) => (k == null ? 'na' : Math.abs(k) <= th.kG ? 'green' : Math.abs(k) <= th.kO ? 'yellow' : 'orange');
        const LVC = { green: '#1e8e4e', yellow: '#a86b00', orange: '#d4580f', na: '#98a2b3' };
        const tcol = stepTimeCol(picked[0]);
        const allBad = st.tested.length >= 2 && st.tested.every((l) => l.k != null && Math.abs(l.k) > th.kO && Math.sign(l.k) === Math.sign(cell.k ?? cell.dir));
        const isHit = st.tested.length >= 2 && st.spread >= 0.5 && st.spread >= 0.2 * Math.abs(cell.k ?? 0) && st.p < 0.1;
        const verdict = st.tested.length < 2 ? '可比較的 level 少於 2 個（每個需 ≥ 3 片）' : allBad ? `${st.tested.length}/${st.tested.length} 台皆偏（非 tool-specific）→ 查上游製程` : isHit ? `${st.worst.v} ${fmtK(st.worst.k)}（CIP ${Math.round(st.worst.shareC * 100)}% 走 ${st.worst.v}），level 間差 ${st.spread.toFixed(1)}σ → 先查這台` : `各 level 差 ${st.spread.toFixed(1)}σ，偏移不集中在單一機台`;
        const mixed = st.levels.some((l) => l.n && !l.nB) || st.levels.some((l) => l.nB && !l.n);
        const small = lvs.filter((l) => l.n > 0 && l.n < 30).length;
        const hitLv = isHit ? st.worst.v : null;
        b.innerHTML = `<div class="tw-ctrl"><span class="lab">分組欄</span><span class="chips">${cols.map((x) => `<span class="chip ${sel.has(x) ? 'on' : ''}" data-tc="${esc(x)}">${esc(short(x))}</span>`).join('')}</span><span class="muted small">可複選 → 組合分組</span></div>
          <div class="tw-v ${isHit ? 'hit' : allBad ? 'warn' : ''}"><b>${esc(verdict)}</b>${mixed ? '　⚠ 部分 level 只在單一條件出現' : ''}${small ? `　<span class="muted">（${small} 個 level 的 CIP 少於 30 片，K 參考即可）</span>` : ''}</div>
          <div class="tw-top">
            <div><div class="ft">Run 貨比例 <span class="muted" style="font-weight:400">各 level 占 BSL／${esc(cip)} 的 %</span></div><div class="plot" id="twRate"></div></div>
            <div><div class="ft">每週 run 貨 <span class="muted" style="font-weight:400">BSL＋CIP 片數，淡底 = CIP 期間${tcol ? `，時間 = ${esc(tcol)}` : ''}</span><span class="spacer"></span>${c.groupCol ? `<span class="seg sm"><button data-sc="group" class="${scope === 'group' ? 'on' : ''}">只看 ${esc(group)}</button><button data-sc="all" class="${scope === 'all' ? 'on' : ''}">全部 wafer</button></span>` : ''}</div><div class="plot" id="twWeek"></div><div class="small muted" id="twSpan"></div></div>
          </div>
          <div class="tw-bot"><div class="ft">${esc(short(item))} 依 ${esc(picked.map(short).join(' × '))} <span class="muted" style="font-weight:400">最差 level 排最左；箱上 = ${esc(cip)} 相對 BSL 的 K；n = BSL／${esc(cip)}；灰帶 = BSL ±1σ</span></div><div class="plot" id="twBox"></div></div>`;
        b.querySelectorAll('[data-tc]').forEach((x) => (x.onclick = () => { const n = x.dataset.tc; if (sel.has(n)) { if (sel.size > 1) sel.delete(n); } else sel.add(n); draw(); }));
        b.querySelectorAll('[data-sc]').forEach((x) => (x.onclick = () => { scope = x.dataset.sc; draw(); }));
        const col0 = cipColor(cip);
        // --- run-rate (% only, counts on hover)
        Plotly.newPlot(b.querySelector('#twRate'), [
          { type: 'bar', name: `BSL ${c.baseline}`, x: lvs.map((l) => l.v), y: lvs.map((l) => l.shareB * 100), marker: { color: BSLC }, text: lvs.map((l) => `${Math.round(l.shareB * 100)}%`), textposition: 'outside', textfont: { size: 10 }, customdata: lvs.map((l) => l.nB), hovertemplate: '%{x}<br>%{y:.0f}%（%{customdata} 片）<extra>BSL</extra>' },
          { type: 'bar', name: cip, x: lvs.map((l) => l.v), y: lvs.map((l) => l.shareC * 100), marker: { color: col0 }, text: lvs.map((l) => `${Math.round(l.shareC * 100)}%`), textposition: 'outside', textfont: { size: 10 }, customdata: lvs.map((l) => l.n), hovertemplate: `%{x}<br>%{y:.0f}%（%{customdata} 片）<extra>${esc(cip)}</extra>` },
        ], { ...baseLayout(200), barmode: 'group', xaxis: { ...baseLayout(0).xaxis, categoryorder: 'array', categoryarray: lvs.map((l) => l.v) }, yaxis: { ...baseLayout(0).yaxis, title: { text: '% of wafer', font: { size: 10 } }, range: [0, 118], showgrid: false }, margin: { l: 40, r: 8, t: 8, b: 40 }, legend: { orientation: 'h', x: 0, y: 1.12, font: { size: 10 } } }, { ...CFG, displayModeBar: false });
        // --- weekly run-rate: stacked counts per level, all conditions in scope
        const wk = b.querySelector('#twWeek');
        if (tcol) {
          const rowsT = (scope === 'all' || !c.groupCol ? S.ds.rows : S.ds.rows.filter((x) => E.cat(x[c.groupCol]) === group)).filter((x) => x[tcol] instanceof Date && keyFn(x) != null);
          const weeks = new Map(), lvSet = new Set();
          for (const x of rowsT) { const w = weekStart(x[tcol]).getTime(), k = keyFn(x); lvSet.add(k); if (!weeks.has(w)) weeks.set(w, new Map()); weeks.get(w).set(k, (weeks.get(w).get(k) || 0) + 1); }
          const ws = [...weeks.keys()].sort((a, b2) => a - b2), lvAll = [...lvSet].sort(E.natCmp);
          const PAL = ['#4c78a8', '#72b7b2', '#9d755d', '#8b6fc9', '#54a24b', '#bab0ac', '#79706e', '#1f77b4', '#17becf', '#6b8e23'];
          const colOf = (k, i) => (k === hitLv ? '#d4580f' : PAL[i % PAL.length]);
          const tr = lvAll.map((k, i) => ({ type: 'bar', name: k, x: ws.map((w) => new Date(w)), y: ws.map((w) => weeks.get(w).get(k) || 0), marker: { color: colOf(k, i) }, hovertemplate: `%{x|%Y-%m-%d} 週<br>${esc(k)}：%{y} 片<extra></extra>` }));
          const cT = rowsT.filter((x) => r.cOf(x) === cip).map((x) => x[tcol].getTime());
          const LW = { ...baseLayout(200), barmode: 'stack', margin: { l: 40, r: 8, t: 8, b: 40 }, legend: { orientation: 'h', x: 0, y: 1.12, font: { size: 10 } }, xaxis: { ...baseLayout(0).xaxis, type: 'date', tickformat: '%m/%d' }, yaxis: { ...baseLayout(0).yaxis, title: { text: '片數／週', font: { size: 10 } } } };
          if (cT.length) LW.shapes = [{ type: 'rect', xref: 'x', yref: 'paper', x0: weekStart(new Date(Math.min(...cT))), x1: new Date(weekStart(new Date(Math.max(...cT))).getTime() + 7 * 864e5), y0: 0, y1: 1, fillcolor: col0, opacity: 0.08, line: { width: 0 }, layer: 'below' }];
          Plotly.newPlot(wk, tr, LW, { ...CFG, displayModeBar: false });
          // first / last appearance per level → spot tools that went down or came online
          const endT = Math.max(...rowsT.map((x) => x[tcol].getTime())), fmtD = (t) => App.fmtDate(new Date(t)).slice(5, 10);
          b.querySelector('#twSpan').innerHTML = '出現期間：' + lvAll.map((k) => { const ts = rowsT.filter((x) => keyFn(x) === k).map((x) => x[tcol].getTime()); const a = Math.min(...ts), z = Math.max(...ts); const down = endT - z > 21 * 864e5, fresh = a - Math.min(...rowsT.map((x) => x[tcol].getTime())) > 21 * 864e5; return `<span style="${k === hitLv ? 'color:#d4580f;font-weight:600' : ''}">${esc(k)} ${fmtD(a)}～${fmtD(z)}${down ? '（已停）' : ''}${fresh ? '（後期加入）' : ''}</span>`; }).join('　');
        } else wk.innerHTML = '<div class="empty" style="padding:30px">沒有時間欄位，無法畫每週 run 貨</div>';
        // --- box plot with K annotations per level and n under the tick labels
        const traces = [];
        for (const [cd, rr, colr] of [[c.baseline, bRows, BSLC], [cip, cRows, col0]]) {
          const xs = [], ys = [];
          rr.forEach((x) => { const k = keyFn(x); if (k != null) { xs.push(k); ys.push(x[item]); } });
          traces.push({ type: 'box', name: cd === c.baseline ? `BSL ${cd}` : cd, x: xs, y: ys, marker: { color: colr, size: 3 }, line: { color: cd === c.baseline ? '#7a8594' : colr }, fillcolor: cd === c.baseline ? 'rgba(154,163,174,.25)' : colr + '33', boxpoints: 'all', jitter: 0.5, pointpos: 0, boxmean: true, hoverinfo: 'y+name' });
        }
        const L = baseLayout(420); L.boxmode = 'group'; L.xaxis.categoryorder = 'array'; L.xaxis.categoryarray = lvs.map((l) => l.v);
        L.xaxis.tickvals = lvs.map((l) => l.v); L.xaxis.ticktext = lvs.map((l) => `${l.v}<br><span style="font-size:10px;color:${l.n && l.n < 30 ? '#b0b7c3' : '#667085'}">n ${l.nB} / ${l.n}</span>`);
        L.yaxis.title = axTitle(item, isLog(item) ? '，log' : ''); if (isLog(item)) L.yaxis.type = 'log'; L.margin = { l: 50, r: 8, t: 34, b: 48 };
        L.legend = { orientation: 'h', x: 0, y: 1.1, font: { size: 10.5 } };
        // K label just above each CIP box (upper whisker), not on a fixed line
        const top = (v) => { const a = cRows.filter((x) => keyFn(x) === v).map((x) => x[item]).sort((p, q) => p - q); if (!a.length) return null; const q1 = a[Math.floor(a.length * 0.25)], q3 = a[Math.floor(a.length * 0.75)]; const hi = q3 + 1.5 * (q3 - q1); return Math.max(...a.filter((y) => y <= hi)); };
        L.annotations = lvs.filter((l) => l.k != null).map((l) => ({ x: l.v, y: isLog(item) ? Math.log10(top(l.v)) : top(l.v), xshift: 16, yshift: 6, yanchor: 'bottom', showarrow: false, text: `<b>${fmtK(l.k)}</b>`, font: { size: 11.5, color: LVC[lvOf(l.k)], family: 'Consolas, monospace' }, bgcolor: 'rgba(255,255,255,.9)', bordercolor: LVC[lvOf(l.k)], borderwidth: 1, borderpad: 2 }));
        if (cell.bmean != null && cell.bsd > 0 && !isLog(item)) L.shapes = [{ type: 'rect', xref: 'paper', x0: 0, x1: 1, y0: cell.bmean - cell.bsd, y1: cell.bmean + cell.bsd, fillcolor: '#e9edf2', opacity: 0.6, line: { width: 0 }, layer: 'below' }, { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: cell.bmean, y1: cell.bmean, line: { color: '#6b7684', width: 1.2, dash: 'dash' } }];
        delete L.height; L.autosize = true;
        Plotly.newPlot(b.querySelector('#twBox'), traces, L, { ...CFG, displayModeBar: false });
      };
      draw();
    }, { wide: true });
  }

  // ================================================================ commonality: categorical factor scan
  const factorCache = new Map();
  function factors(f) {
    const c = f.cell, key = `${S.res === factorCache.res ? '' : 'x'}${c.item.name}|${c.group}|${c.cip}`;
    if (factorCache.res !== S.res) { factorCache.clear(); factorCache.res = S.res; }
    if (!factorCache.has(key)) factorCache.set(key, E.scanFactors(S.ds, S.cfg, c.item.name, c.group, c.cip, c));
    return factorCache.get(key);
  }
  /** evidence tag of one cause sentence (keyword map; fab rules only need to use the same words) */
  const CAUSE_EV = [
    [/via\s*cd|底部接觸/i, 'vcd'],
    [/cd|線寬|space|間距|trim|litho|dose|focus|etch bias|hardmask|開口/i, 'cd'],
    [/下層寬線|stress-induced|unlanded/i, 'xcd'],
    [/topography|繼承|跨層|下層 dishing/i, 'xlayer'],
    [/厚度|thk|cmp|過拋|dishing|erosion|研磨|trench 深|深度|研磨不足/i, 'thk'],
    [/機台|chamber|pad|slurry|電鍍|ecp|pvd|recipe|matching|mismatch|壽命|life/i, 'tool'],
  ];
  const causeTag = (txt, viaItem) => { for (const [rx, t] of CAUSE_EV) if (rx.test(txt)) return t === 'cd' && viaItem ? 'vcd' : t; return 'ext'; };
  /**
   * Rank causes by evidence (v2.7): yes = data supports, no = data exists and contradicts (greyed), na = no data／outside the tool.
   * Order: yes → na → no; original knowledge-base order kept within a tier.
   */
  function rankCauses(f) {
    const c = f.cell, it = c.item, dx = f.dx, dir = Math.sign(c.dir ?? c.k) || 1, viaItem = /^v/i.test(RU.layer(it.name) || '') || it.cat === 'rc';
    const ev = {};
    const judge = (rs) => { if (!rs.length) return null; const by = (st) => rs.filter((r) => RU.relOf(r, dir) === st).sort((a, b) => Math.abs(b.k) - Math.abs(a.k))[0];
      const st = by('strong'); if (st) return { st: 'yes', note: RU.relTxt(st) };
      const wk = by('weak'); if (wk) return { st: 'na', note: `${RU.relTxt(wk)} 關聯弱` };
      const op = by('opp'); if (op) return { st: 'no', note: `${RU.relTxt(op, false)} 反向` };
      const fl = by('flat'); return fl ? { st: 'no', note: `${short(fl.item.name)} 未偏移` } : null; };
    const rel = (f.rel || []).filter((r) => r.k != null);
    if (it.kind === 'wat') {
      ev.cd = judge(rel.filter((r) => r.item.cat === 'cd')); ev.vcd = judge(rel.filter((r) => r.item.cat === 'vcd'));
      if (!ev.vcd && ev.cd) ev.vcd = ev.cd; if (!ev.cd && ev.vcd) ev.cd = ev.vcd;
      ev.thk = judge(rel.filter((r) => r.item.cat === 'thk'));
      const xr = (f.xrel || []).filter((r) => r.k != null);
      ev.xlayer = judge(xr.filter((r) => r.item.cat !== 'cd')); ev.xcd = judge(xr.filter((r) => r.item.cat === 'cd'));
    }
    // inline items: the same-layer WAT reaction does not discriminate between dimensional causes → only tool evidence is used
    try { const fs = factors(f); if (fs.length) { const hit = fs.find((x) => x.hit); ev.tool = hit ? { st: 'yes', note: `${short(hit.col)}：${hit.worst.v}` } : fs.every((x) => x.confound) ? null : { st: 'no', note: '機台無集中' }; } } catch (e) { /* no tool columns */ }
    const rows = dx.causes.map((text, i) => { const tag = causeTag(text, viaItem), e = ev[tag]; return { text, tag, st: e ? e.st : 'na', note: e ? e.note : '', i }; });
    const ord = { yes: 0, na: 1, no: 2 };
    return rows.sort((a, b) => ord[a.st] - ord[b.st] || a.i - b.i);
  }
  const causeLi = (r) => `<li class="cz ${r.st}" title="${r.st === 'yes' ? '資料支持：' + esc(r.note) : r.st === 'no' ? '資料不支持：' + esc(r.note) : '無資料可比對'}">${r.st === 'yes' ? '<span class="ci">✔</span>' : r.st === 'no' ? '<span class="ci">✘</span>' : '<span class="ci">·</span>'}${esc(r.text)}${r.note ? `<span class="cn">${esc(r.note)}</span>` : ''}</li>`;
  const causeTxt = (f) => rankCauses(f).map((r) => r.st === 'yes' ? `${r.text}（✔ ${r.note}）` : r.st === 'no' ? `${r.text}（✘ ${r.note}）` : r.text);
  const fmtP = (p) => (p == null ? '—' : p < 0.001 ? '<0.001' : p.toFixed(3));
  /** quick Pearson r of two items within a group (no plotting) */
  function quickR(y, x, group) {
    const rows = (S.res.byG.get(group) || S.ds.rows).filter((q) => num(q[y]) != null && num(q[x]) != null);
    if (rows.length < 4) return null;
    const ly = isLog(y), lx = isLog(x);
    const f = App.statsLib.linreg(rows.map((q) => (lx ? Math.log10(q[x]) : q[x])), rows.map((q) => (ly ? Math.log10(q[y]) : q[y])));
    return f.r ?? null;
  }
  /** tool cross-check conclusion (HL strip, PPT, summary text). Statistics stay inside; wording is what an engineer says. */
  function factorVerdict(f) {
    const fs = factors(f); if (!fs.length) return '';
    const c = f.cell, th = S.res.th, hits = fs.filter((x) => x.hit), conf = fs.filter((x) => x.confound);
    if (hits.length) { const t = hits[0]; return `${short(t.col)}：${t.worst.v} ${fmtK(t.worst.k)}（CIP ${Math.round(t.worst.shareC * 100)}% 走 ${t.worst.v}，n ${t.worst.n}）${hits.length > 1 ? `；${hits.slice(1).map((x) => short(x.col)).join('、')} 亦有差異` : ''}`; }
    const top = fs.find((x) => !x.confound && x.tested.length >= 2);
    if (top && top.tested.every((l) => l.k != null && Math.abs(l.k) > th.kO && Math.sign(l.k) === Math.sign(c.k ?? c.dir))) return `${short(top.col)} ${top.tested.length}/${top.tested.length} 台皆偏（非 tool-specific）→ 查上游製程`;
    if (conf.length && conf.length === fs.length) return `${conf.map((x) => short(x.col)).join('、')} 與條件完全混淆，無法分辨`;
    return `${fs.length} 個機台欄皆無集中${conf.length ? `（${conf.map((x) => short(x.col)).join('、')} 與條件混淆）` : ''}`;
  }
  /** cross-check cards: inline ↔ WAT, tool, yield — one line each, three states (ok 對上／warn 部分或反向／no 未對上／need 缺資料), click opens the chart */
  function crossChecks(f) {
    const c = f.cell, it = c.item, g = c.group, cip = c.cip, out = [];
    const card = (label, state, text, run) => out.push({ label, state, icon: { ok: '✔', warn: '△', no: '✘', need: '○' }[state], text, run });
    const rTxt = (y, x) => { const r = quickR(y, x, g); return r == null ? '' : `，r = ${r.toFixed(2)}`; };
    if (it.kind === 'wat') {
      const dirS = Math.sign(c.dir ?? c.k) || 1;
      const grp = (arr) => { const o = { strong: [], weak: [], flat: [], opp: [], none: [] }; for (const r of arr || []) o[RU.relOf(r, dirS)].push(r); return o; };
      const rel = (f.rel || []).filter((r) => r.k != null), same = grp(rel);
      const txt = (a) => a.map((r) => RU.relTxt(r)).join('、');
      if (rel.length) {
        if (same.strong.length) card('Inline', 'ok', `${txt(same.strong)} 有關聯`, () => openCheckWin(f, { x: same.strong[0].item.name }));
        else if (same.weak.length) card('Inline', 'warn', `${txt(same.weak)} 關聯弱`, () => openCheckWin(f, { x: same.weak[0].item.name }));
        else if (same.opp.length) card('Inline', 'warn', `${txt(same.opp)} 反向`, () => openCheckWin(f, { x: same.opp[0].item.name }));
        else card('Inline', 'no', `${same.flat.map((r) => RU.relTxt(r, false)).join('、')} 未偏移`, () => openCheckWin(f, { x: same.flat[0].item.name }));
      } else card('Inline', 'need', `無 ${RU.layer(it.name) || '同層'} CD／THK`, () => openCheckWin(f, {}));
      // adjacent-layer card (only when such inline data exists); wording stays at what the data shows — the mechanism lives in the tooltip
      const xr = (f.xrel || []).filter((r) => r.k != null);
      if (xr.length) {
        const x = grp(xr), pick = (a) => a.sort((p, q) => Math.abs(q.k) - Math.abs(p.k))[0];
        if (x.strong.length) card('鄰層', same.strong.length ? 'warn' : 'ok', `${txt(x.strong)} 有關聯${same.strong.length ? '（疊加）' : ''}`, () => openCheckWin(f, { x: pick(x.strong).item.name }));
        else if (x.weak.length) card('鄰層', 'warn', `${txt(x.weak)} 關聯弱`, () => openCheckWin(f, { x: pick(x.weak).item.name }));
        else card('鄰層', 'no', `${xr.slice(0, 2).map((r) => RU.relTxt(r, false)).join('、')}${xr.length > 2 ? '…' : ''} 未偏移`, () => openCheckWin(f, { x: xr[0].item.name }));
      }
    }
    if (it.kind === 'inline') {
      const rel = (f.rel || []).filter((r) => r.cell && r.cell.level !== 'na');
      if (rel.length) { const hit = rel.filter((r) => isAbnL(r.cell.level)); card('WAT', hit.length ? 'ok' : 'no', hit.length ? `${hit.map((r) => `${short(r.item.name)} ${shiftTxt(r.cell)}`).join('、')}` : `${rel.map((r) => short(r.item.name)).join('、')} 未亮燈`, () => openCorrWin(rel[0].item.name, it.name, g)); }
      else card('WAT', 'need', `無 ${RU.layer(it.name) || '同層'} WAT`, () => $('file2').click());
    }
    if (it.kind === 'yield') {
      const rel = f.rel || [];
      if (rel.length) card('WAT', 'ok', rel.map((r) => `${short(r.item.name)} ${r.cell.text}`).join('、'), () => openCorrWin(rel[0].item.name, it.name, g));
      else card('WAT', hasKind('wat') ? 'no' : 'need', hasKind('wat') ? '同組 WAT 未亮燈' : '無 WAT 資料', hasKind('wat') ? () => setMode('wat') : () => $('file2').click());
    }
    const fs = factors(f);
    if (fs.length) { const hit = fs.find((x) => x.hit); const v = factorVerdict(f); card('機台', hit ? 'ok' : /皆偏/.test(v) ? 'warn' : fs.every((x) => x.confound) ? 'warn' : 'no', v, () => openToolWin(it.name, g, cip, (hit || fs[0]).col)); }
    else card('機台', 'need', '無機台／chamber 欄', () => $('file2').click());
    if (it.kind === 'wat' && hasKind('yield')) {
      const ys = S.res.items.filter((x) => x.kind === 'yield').map((x) => ({ item: x, cell: S.res.cells[x.name]?.[g]?.[cip] })).filter((r) => r.cell && r.cell.level !== 'na');
      const hit = ys.filter((r) => isAbnL(r.cell.level));
      if (ys.length) card('Yield', hit.length ? 'ok' : 'no', hit.length ? hit.map((r) => `${short(r.item.name)} ${shiftTxt(r.cell)}`).join('、') : 'yield／bin 未亮燈', () => openCorrWin(it.name, (hit[0] || ys[0]).item.name, g));
    }
    return out;
  }
  // ================================================================ floating windows (non-modal, draggable, resizable, many at once)
  const WM = { z: 200, n: 0, wins: new Map() };
  function front(el) { el.style.zIndex = ++WM.z; }
  function openWin(key, title, build, opts = {}) {
    if (WM.wins.has(key)) { const w = WM.wins.get(key); front(w); w.classList.add('flash'); setTimeout(() => w.classList.remove('flash'), 400); return w; }
    const el = document.createElement('div'); el.className = 'fwin';
    // tile: 1st window left, 2nd right, 3rd/4th the same slightly lower … so two charts can be compared side by side
    const slot = WM.n++ % 6, half = innerWidth >= 1200;
    const w = opts.wide ? Math.min(1180, innerWidth - 40) : half ? Math.min(820, Math.floor(innerWidth / 2) - 24) : Math.min(1000, innerWidth - 40), h = Math.min(opts.wide ? 640 : 560, innerHeight - 110);
    el.style.left = `${opts.wide ? Math.max(12, (innerWidth - w) / 2) : half ? 12 + (slot % 2) * Math.floor(innerWidth / 2) + Math.floor(slot / 2) * 26 : 20 + slot * 26}px`;
    el.style.top = `${70 + Math.floor(slot / 2) * 34}px`;
    el.style.width = `${w}px`; el.style.height = `${h}px`;
    el.innerHTML = `<div class="fw-h"><span class="fw-t">${title}</span><span class="spacer"></span><button data-fw="max" title="最大化／還原（或雙擊標題列）">⤢</button><button data-fw="x" title="關閉（Esc）">✕</button></div><div class="fw-b"></div>`;
    document.body.appendChild(el); front(el);
    el.addEventListener('mousedown', () => front(el));
    const hd = el.querySelector('.fw-h');
    hd.addEventListener('mousedown', (e) => {
      if (e.target.closest('button') || el.classList.contains('max')) return;
      e.preventDefault();
      const sx = e.clientX - el.offsetLeft, sy = e.clientY - el.offsetTop;
      const mv = (ev) => { el.style.left = `${Math.min(innerWidth - 80, Math.max(-el.offsetWidth + 120, ev.clientX - sx))}px`; el.style.top = `${Math.min(innerHeight - 40, Math.max(0, ev.clientY - sy))}px`; };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
    hd.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) el.classList.toggle('max'); });
    el.querySelector('[data-fw=max]').onclick = () => el.classList.toggle('max');
    el.querySelector('[data-fw=x]').onclick = () => closeWin(key);
    let raf = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => el.querySelectorAll('.js-plotly-plot').forEach((p) => Plotly.Plots.resize(p))); });
    ro.observe(el);
    el._ro = ro;
    WM.wins.set(key, el);
    build(el.querySelector('.fw-b'));
    return el;
  }
  function closeWin(key) {
    const el = WM.wins.get(key); if (!el) return;
    el._ro.disconnect();
    el.querySelectorAll('.js-plotly-plot').forEach((p) => Plotly.purge(p));
    el.remove(); WM.wins.delete(key);
  }
  function closeTopWin() {
    let top = null, tz = -1;
    for (const [k, el] of WM.wins) if (+el.style.zIndex > tz) { tz = +el.style.zIndex; top = k; }
    if (top) closeWin(top);
  }
  function closeAllWins() { [...WM.wins.keys()].forEach(closeWin); }

  function openCell(item, group, cip) {
    if (!S.res) return;
    const cell = S.res.cells[item]?.[group]?.[cip]; if (!cell) return;
    const fs = allFindings().filter((x) => x.cell.item.name === item && x.cell.group === group);
    const rad = cell.item.kind === 'inline' && hasRadial(item);
    const at = S.res.groups.length > 1 ? ` @ ${esc(group)}` : '';
    openWin(`cell|${item}|${group}`, `${esc(short(item))}${at} ${S.cfg.cips.map((p) => { const x = S.res.cells[item][group][p]; return `<span class="pill ${x.level}">${S.cfg.cips.length > 1 ? `${esc(p)} ` : ''}${x.level === 'na' ? esc(x.reason) : esc(shiftTxt(x))}</span>`; }).join(' ')}${isLog(item) ? ' <span class="muted small">log 軸</span>' : ''}`, (b) => {
      b.innerHTML = `<div class="fw-plots" style="grid-template-columns:${rad ? '1.5fr 1fr' : '1fr'}"><div class="fp"></div>${rad ? '<div class="fp"></div>' : ''}</div>
        <details class="fw-info"><summary>統計值${fs.length ? '與診斷' : ''}</summary>${statTable(item, group)}${fs.map(findingCard).join('')}</details>`;
      const ps = b.querySelectorAll('.fp');
      plotInto(ps[0], fluid(trendFig(item, group, 400, { big: true })));
      if (rad) plotInto(ps[1], fluid(radialFig(item, group, 400)));
    });
  }
  function openCorrWin(y, x, group) {
    const at = S.res.groups.length > 1 && group !== '全部' ? ` @ ${esc(group)}` : '';
    openWin(`corr|${y}|${x}|${group}`, `${esc(short(y))} vs ${esc(short(x))}${at}`, (b) => {
      b.innerHTML = '<div class="fw-plots"><div class="fp"></div></div>';
      plotInto(b.querySelector('.fp'), fluid(corrFig(y, x, group, 420)));
    });
  }
  // ================================================================ check window (v2.8): one window for every suggested check
  // correlation (X／Y selectable) + resonance trend (both items as z-scores vs BSL over time) + "import data" when the partner column is missing
  function numericCols() { return S.ds.columns.filter((c) => c.type === 'number').map((c) => c.name); }
  /** best X column for a check sentence: keyword → category + layer; falls back to any column whose name shares the layer token */
  function guessX(f, text) {
    const it = f.cell.item, L = RU.layer(it.name), t = String(text || '');
    const dirS = Math.sign(f.cell.dir ?? f.cell.k) || 1;
    const strong = [...(f.rel || []), ...(f.xrel || [])].filter((r) => RU.relOf(r, dirS) === 'strong').sort((a, b) => Math.abs(b.k) - Math.abs(a.k))[0];
    if (!t) return strong?.item.name || (f.rel || [])[0]?.item.name || '';
    const wantThk = /THK|厚度|depth|dishing|erosion|topography/i.test(t), wantVia = /via/i.test(t), wantCd = /\bCD\b|線寬|space|ADI|AEI|trench/i.test(t);
    const lay = (t.match(/\b((?:TM|TV|M|V)\d+)\b/i) || [])[1]?.toUpperCase() || L;
    const inl = S.res.items.filter((x) => x.kind === 'inline' && x.name !== it.name);
    const pick = (fn) => inl.find((x) => RU.layer(x.name) === lay && fn(x)) || null;
    const c = wantThk ? pick((x) => x.cat === 'thk' || x.cat === 'topo') : wantVia ? pick((x) => x.cat === 'vcd') : wantCd ? pick((x) => x.cat === 'cd' || x.cat === 'vcd') : null;
    if (c) return c.name;
    if (/WAT|Rs|Rc|LK|SPA|VBD/i.test(t) && it.kind !== 'wat') { const w = (f.rel || []).find((q) => q.item?.kind === 'wat')?.item || S.res.items.find((x) => x.kind === 'wat' && RU.layer(x.name) === lay); if (w) return w.name; }
    if (/yield|bin|良率/i.test(t)) { const y = S.res.items.find((x) => x.kind === 'yield'); if (y) return y.name; }
    return '';
  }
  function zSeries(rows, name, bmean, bsd) { return rows.map((q) => { const v = num(q[name]); return v == null || !(bsd > 0) ? null : (v - bmean) / bsd; }); }
  function openCheckWin(f, opts = {}) {
    const c0 = f.cell, g = c0.group, cip = c0.cip, yName = c0.item.name, text = opts.text || '';
    const key = `chk|${yName}|${g}|${cip}|${text || opts.x || ''}`;
    const st = { y: yName, x: opts.x || guessX(f, text), scope: 'group' };
    const at = S.res.groups.length > 1 && g !== '全部' ? ` @ ${esc(g)}` : '';
    const reopen = { item: yName, group: g, cip, opts };
    openWin(key, `檢查：${esc(text || `${short(yName)} 的相關`)}${at}`, (b) => {
      const draw = () => {
        b.querySelectorAll('.js-plotly-plot').forEach((p) => Plotly.purge(p));
        const cols = numericCols(), opt = (cur) => `<option value="">（選擇欄位）</option>` + cols.map((n) => `<option value="${esc(n)}" ${n === cur ? 'selected' : ''}>${esc(short(n))}</option>`).join('');
        const rows = (st.scope === 'group' ? S.res.byG.get(g) || [] : S.ds.rows);
        const hasX = st.x && cols.includes(st.x);
        // verdict
        let v = '', vk = '';
        if (!hasX) { v = `資料中沒有對應「${esc(text || '此檢查')}」的欄位。從右邊選一個欄位，或用「＋ 匯入資料補進」把 inline／機台／yield 檔以 wafer id 合併進來。`; vk = 'need'; }
        else {
          const cf = corrFig(st.y, st.x, st.scope === 'group' ? g : '全部', 420), all = cf.stats.find((q) => q.cond === '全部'), inC = cf.stats.find((q) => q.cond === cip);
          const r = all?.r, ar = r == null ? null : Math.abs(r);
          const rel = [...(f.rel || []), ...(f.xrel || [])].find((q) => q.item.name === st.x);
          const expS = rel && rel.sign ? Math.sign(f.cell.dir ?? f.cell.k) * rawSign(st.y, rel.sign) : 0;
          const dirTxt = expS && r != null ? (Math.sign(r) === expS ? '，方向與物理預期一致' : '，方向與物理預期相反') : '';
          const cx = S.res.cells[st.x]?.[g]?.[cip];
          v = `${short(st.x)}${cx ? ` ${shiftTxt(cx)}` : ''}　${RU.fmtR(r)}（N ${cf.n}）${inC && inC.r != null ? `，CIP 內 ${RU.fmtR(inC.r)}` : ''} → ${ar == null ? '樣本不足' : ar >= 0.5 ? '<b>有關聯</b>' : ar >= 0.3 ? '<b>弱關聯</b>' : '<b>關聯性不大</b>，這個 item 無法解釋偏移'}${dirTxt}`;
          vk = ar == null ? '' : ar >= 0.5 ? 'hit' : ar >= 0.3 ? 'warn' : '';
          b._cf = cf;
        }
        b.innerHTML = `<div class="tw-ctrl"><span class="lab">Y</span><select data-ck="y">${opt(st.y)}</select><span class="lab">X</span><select data-ck="x">${opt(st.x)}</select>
            ${S.res.groups.length > 1 ? `<span class="seg sm"><button data-sc="group" class="${st.scope === 'group' ? 'on' : ''}">只看 ${esc(g)}</button><button data-sc="all" class="${st.scope === 'all' ? 'on' : ''}">全部 wafer</button></span>` : ''}
            <span class="spacer"></span><button class="btn sm" data-ck="imp" title="以 wafer id 自動合併；長表會先轉寬表">＋ 匯入資料補進</button></div>
          <div class="tw-v ${vk}">${v}</div>
          <div class="ck-plots"><div><div class="ft">相關 <span class="muted" style="font-weight:400">BSL 灰、CIP 彩；線 = 各條件的線性擬合</span></div><div class="plot" id="ckCorr"></div></div>
          <div><div class="ft">共振 trend <span class="muted" style="font-weight:400">兩個 item 相對 BSL 的 z 分數（移動平均），一起動 = 共振</span></div><div class="plot" id="ckTrend"></div></div></div>`;
        b.querySelector('[data-ck=y]').onchange = (e) => { st.y = e.target.value; draw(); };
        b.querySelector('[data-ck=x]').onchange = (e) => { st.x = e.target.value; draw(); };
        b.querySelectorAll('[data-sc]').forEach((x) => (x.onclick = () => { st.scope = x.dataset.sc; draw(); }));
        b.querySelector('[data-ck=imp]').onclick = () => { S.reopenCheck = reopen; $('file2').click(); };
        if (!hasX) { b.querySelector('#ckCorr').innerHTML = '<div class="muted small" style="padding:30px;text-align:center">選擇 X 欄位後顯示散佈圖</div>'; b.querySelector('#ckTrend').innerHTML = ''; return; }
        plotInto(b.querySelector('#ckCorr'), fluid(b._cf));
        // resonance trend: z-scores vs BSL for both items, ordered by date (or row order), rolling mean
        const c = S.cfg, bRows = rows.filter((q) => S.res.cOf(q) === c.baseline);
        const stat = (name) => { const a = bRows.map((q) => num(q[name])).filter((x) => x != null); const m = a.reduce((p, q) => p + q, 0) / (a.length || 1); const sd = Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / Math.max(1, a.length - 1)); return [m, sd]; };
        const [my, sy] = stat(st.y), [mx, sx] = stat(st.x);
        const ord = rows.filter((q) => num(q[st.y]) != null && num(q[st.x]) != null).sort((a, b2) => (c.dateCol && a[c.dateCol] && b2[c.dateCol] ? a[c.dateCol] - b2[c.dateCol] : 0));
        const zy = zSeries(ord, st.y, my, sy), zx = zSeries(ord, st.x, mx, sx);
        const rel = [...(f.rel || []), ...(f.xrel || [])].find((q) => q.item.name === st.x);
        const flip = rel && rel.sign ? rawSign(st.y, rel.sign) : 1;
        const w = Math.max(7, Math.round(ord.length / 25)), roll = (a) => a.map((_, i) => { const seg = a.slice(Math.max(0, i - w + 1), i + 1).filter((x) => x != null); return seg.length ? seg.reduce((p, q) => p + q, 0) / seg.length : null; });
        const xs = ord.map((q, i) => (c.dateCol && q[c.dateCol] ? q[c.dateCol] : i));
        const cipIdx = ord.map((q, i) => (S.res.cOf(q) === cip ? i : -1)).filter((i) => i >= 0);
        const L = baseLayout(300); L.yaxis.title = 'z（相對 BSL）'; L.xaxis.title = c.dateCol ? '' : '依日期排序的 wafer 順序'; L.margin = { l: 50, r: 8, t: 10, b: 40 };
        L.legend = { orientation: 'h', x: 0, y: 1.12, font: { size: 10.5 } };
        L.shapes = [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 0, y1: 0, line: { color: '#9aa3ae', width: 1, dash: 'dash' } }];
        // CIP period shading only when the CIP wafers form a distinct period (not interleaved with BSL through the whole range)
        if (cipIdx.length && (cipIdx[cipIdx.length - 1] - cipIdx[0]) < 0.7 * ord.length) L.shapes.push({ type: 'rect', xref: 'x', yref: 'paper', x0: xs[cipIdx[0]], x1: xs[cipIdx[cipIdx.length - 1]], y0: 0, y1: 1, fillcolor: cipColor(cip), opacity: 0.08, line: { width: 0 }, layer: 'below' });
        const tr = [
          { type: 'scatter', mode: 'markers', name: `${cip} wafer（Y）`, x: cipIdx.map((i) => xs[i]), y: cipIdx.map((i) => zy[i]), marker: { color: cipColor(cip), size: 5, opacity: 0.6 }, hoverinfo: 'skip' },
          { type: 'scatter', mode: 'lines', name: `${short(st.y)}（Y）`, x: xs, y: roll(zy), line: { color: '#1F3B63', width: 2.2 } },
          { type: 'scatter', mode: 'lines', name: `${short(st.x)}（X${flip < 0 ? '，取反向' : ''}）`, x: xs, y: roll(zx.map((z) => (z == null ? null : z * flip))), line: { color: '#d4580f', width: 2.2, dash: 'dot' } },
        ];
        delete L.height; L.autosize = true;
        Plotly.newPlot(b.querySelector('#ckTrend'), tr, L, { ...CFG, displayModeBar: false });
      };
      draw();
    }, { wide: true });
  }
  function statTable(item, group) {
    const cs = S.res.cells[item][group], first = Object.values(cs)[0], it = itemOf(item);
    const fold = it.metric === 'fold', rate = it.metric === 'rate', inl = it.kind === 'inline';
    const hd = `<th>Series</th><th>N</th><th>Mean</th><th>σ</th>${fold ? '<th>Median</th>' : ''}${rate ? '<th>異常率</th>' : ''}${inl && S.res.hasWiw ? '<th>片內 σ</th>' : ''}<th>${fold ? '倍數' : rate ? '異常率差' : 'K-shift'}</th>${inl ? '<th>W2W σ 倍數</th>' : ''}`;
    return `<table class="tstat"><tr>${hd}</tr>
      <tr><td><i class="dot" style="background:${BSLC}"></i>BSL ${esc(S.cfg.baseline)}</td><td>${first.bn}</td><td>${f4(first.bmean)}</td><td>${f4(first.bsd)}</td>${fold ? `<td>${f4(first.bmedian)}</td>` : ''}${rate ? `<td>${pct(first.rateB)}</td>` : ''}${inl && S.res.hasWiw ? `<td>${f4(first.wiwB)}</td>` : ''}<td>—</td>${inl ? '<td>—</td>' : ''}</tr>
      ${S.cfg.cips.map((p) => { const x = cs[p]; return `<tr><td><i class="dot" style="background:${cipColor(p)}"></i>${esc(p)}</td><td>${x.n}</td><td>${f4(x.mean)}</td><td>${f4(x.sd)}</td>${fold ? `<td>${f4(x.median)}</td>` : ''}${rate ? `<td>${pct(x.rateC)}</td>` : ''}${inl && S.res.hasWiw ? `<td>${f4(x.wiwC)}${x.wiwRatio != null ? ` <span class="pill ${x.wiwLevel}">×${x.wiwRatio.toFixed(2)}</span>` : ''}</td>` : ''}<td><span class="pill ${x.level}">${esc(shiftTxt(x))}</span></td>${inl ? `<td>${x.sdRatio != null ? `<span class="pill ${x.sdLevel}">×${x.sdRatio.toFixed(2)}</span>` : '—'}</td>` : ''}</tr>`; }).join('')}</table>`;
  }

  // ================================================================ trend matrix
  let io = null;
  const cellWorst = (x0, mode) => S.cfg.cips.reduce((a, p) => E.worse(a, E.worse(x0[p].level, mode === 'inline' ? x0[p].varLevel || 'na' : 'na')), 'na');
  const itemWorst = (it, mode) => S.res.groups.reduce((a, g) => E.worse(a, cellWorst(S.res.cells[it.name][g], mode)), 'na');
  function renderTrend() {
    S.dirty.trend = false;
    const r = S.res, c = S.cfg, el = $('trend'), mode = S.mode;
    el.querySelectorAll('.js-plotly-plot').forEach((p) => Plotly.purge(p));
    const mine = r.items.filter((i) => i.kind === mode);
    const abn = mine.filter((it) => isAbnL(itemWorst(it, mode)));
    const lf = (a) => (S.rowf.layers.length ? a.filter((it) => S.rowf.layers.includes(RU.layer(it.name))) : a);
    const list = lf(S.trend.mode === 'abn' ? abn : S.trend.mode === 'all' ? mine : r.items);
    const chips = [['abn', `異常與觀察（${abn.length}）`], ['all', `全部 ${MOD[mode]}（${mine.length}）`]];
    if (r.items.length > mine.length) chips.push(['inl', `全部 item（${r.items.length}）`]);
    const G = r.groups, layers = layersOf(mode);
    el.innerHTML = `<div class="ctrl">
        <span>顯示</span><span class="chips">${chips.map(([k, l]) => `<span class="chip ${S.trend.mode === k ? 'on' : ''}" data-mode="${k}">${l}</span>`).join('')}</span>
        ${layers.length > 1 ? `<span>層別</span><span class="chips">${layers.map((L) => `<span class="chip ${S.rowf.layers.includes(L) ? 'on' : ''}" data-rlayer="${esc(L)}">${esc(L)}</span>`).join('')}</span>` : ''}
        ${c.dateCol ? `<span>X 軸</span><span class="chips"><span class="chip ${S.trend.x === 'date' ? 'on' : ''}" data-x="date">日期</span><span class="chip ${S.trend.x === 'seq' ? 'on' : ''}" data-x="seq">wafer 順序</span></span>` : ''}
        <span class="muted small">點任一張圖 → 浮動視窗（拖標題列移動、拉右下角縮放、⤢ 最大化；可同時開多個比對）</span>
      </div>
      ${list.length ? `<div class="tmx" style="grid-template-columns:150px repeat(${G.length}, minmax(${G.length > 4 ? 200 : 240}px, 1fr))">
        <div class="th corner">${esc(c.groupCol ? `${c.groupCol} →` : '')}</div>${G.map((g) => `<div class="th">${esc(c.groupCol ? g : `${c.cips.join('、')} vs ${c.baseline}`)}</div>`).join('')}
        ${list.map((it) => `<div class="rh ${itemWorst(it, mode)}"><b>${esc(short(it.name))}</b><span>${esc(unit(it.name))}</span><span>${esc(RU.byId(it.cat).label.split('（')[0])}${it.metric === 'fold' ? '・log 軸' : it.metric === 'rate' ? `・固定值 ${f4(it.target)}` : ''}</span></div>` +
          G.map((g) => {
            const x0 = r.cells[it.name][g];
            return `<div class="mc ${cellWorst(x0, it.kind)}" data-item="${esc(it.name)}" data-group="${esc(g)}" data-cip="${esc(c.cips[0])}" title="點擊放大"><div class="mh">${c.cips.map((p) => `<span class="pill ${x0[p].level}">${c.cips.length > 1 ? `${esc(p)} ` : ''}${esc(shiftTxt(x0[p]))}</span>${it.kind === 'inline' && isAbnL(x0[p].varLevel) ? `<span class="pill ${x0[p].varLevel}">σ ×${Math.max(x0[p].sdRatio || 0, x0[p].wiwRatio || 0).toFixed(2)}</span>` : ''}`).join('')}</div><div class="plot"></div></div>`;
          }).join('')).join('')}</div>` : `<div class="empty">目前沒有黃燈或橘燈的 ${MOD[mode]} item。切換到「全部 ${MOD[mode]}」可以看全部 trend。</div>`}`;
    el.querySelectorAll('[data-mode]').forEach((x) => (x.onclick = () => { S.trend.mode = x.dataset.mode; renderTrend(); }));
    el.querySelectorAll('[data-x]').forEach((x) => (x.onclick = () => { S.trend.x = x.dataset.x; S.dirty.report = true; renderTrend(); }));
    el.querySelectorAll('[data-rlayer]').forEach((b) => (b.onclick = () => { const L = b.dataset.rlayer; S.rowf.layers = S.rowf.layers.includes(L) ? S.rowf.layers.filter((x) => x !== L) : [...S.rowf.layers, L]; S.dirty.report = true; renderTrend(); }));
    if (io) io.disconnect();
    io = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (!en.isIntersecting) return;
      const cell = en.target; io.unobserve(cell);
      plotInto(cell.querySelector('.plot'), trendFig(cell.dataset.item, cell.dataset.group, 165, { mini: true }), true);
    }), { rootMargin: '300px' });
    el.querySelectorAll('.mc').forEach((x) => io.observe(x));
  }

  // ================================================================ correlation tab
  function autoPairs() {
    const r = S.res, items = r.items, out = [];
    const worst = new Map();
    [...r.findings[S.mode], ...E.KINDS.filter((k) => k !== S.mode).flatMap((k) => r.findings[k])].forEach((f) => { if (!worst.has(f.cell.item.name)) worst.set(f.cell.item.name, f); });
    const abn = new Set(worst.keys());
    const grp = (a, b) => (worst.get(a) || worst.get(b))?.cell.group || '全部';
    const sev = (a, b) => Math.max(worst.get(a)?.score || 0, worst.get(b)?.score || 0);
    for (const it of items.filter((i) => i.kind === 'wat')) {
      for (const rel of RU.relatedInline(it.name, it.cat, items)) {
        const sg = rawSign(it.name, rel.sign);
        out.push({ y: it.name, x: rel.item.name, why: `${RU.byId(it.cat).label.split('（')[0]} ↔ ${RU.byId(rel.item.cat).label.replace('（inline）', '')}，預期${sg < 0 ? '負' : '正'}相關${it.metric === 'rate' ? '（讀值越低越異常）' : ''}`, sign: sg, abn: abn.has(it.name) || abn.has(rel.item.name), inl: 1, group: grp(it.name, rel.item.name), sev: sev(it.name, rel.item.name) });
      }
    }
    // yield ↔ WAT: expected sign from the WAT category's "bad" direction (WAT worse → yield lower)
    for (const y of items.filter((i) => i.kind === 'yield')) for (const w of items.filter((i) => i.kind === 'wat')) {
      const bad = RU.byId(w.cat).bad; if (!bad) continue;
      const sg = (RU.byId(y.cat).bad === 'down' ? 1 : -1) * (bad === 'up' ? -1 : 1);
      out.push({ y: y.name, x: w.name, why: `${RU.byId(y.cat).label.split('（')[0]} ↔ ${RU.byId(w.cat).label.split('（')[0]}，預期${sg < 0 ? '負' : '正'}相關`, sign: sg, abn: abn.has(y.name) || abn.has(w.name), inl: S.mode === 'yield' ? 1 : 0, group: grp(y.name, w.name), sev: sev(y.name, w.name) });
    }
    const seen = new Set();
    const wat = items.filter((i) => i.kind === 'wat');
    const XP = { 'lk|vbd': -1, 'rs|lk': -1, 'rs|vbd': +1, 'lk|spa': -1, 'rs|spa': +1 };
    for (let i = 0; i < wat.length; i++) for (let j = 0; j < wat.length; j++) {
      const a = wat[i], b = wat[j];
      const s = XP[`${a.cat}|${b.cat}`];
      const key = [a.name, b.name].sort().join('|');
      if (s && !seen.has(key) && RU.layer(a.name) && RU.layer(a.name) === RU.layer(b.name)) {
        seen.add(key);
        out.push({ y: a.name, x: b.name, why: `同層 WAT 交叉檢查（線寬／間距的取捨），預期${s < 0 ? '負' : '正'}相關`, sign: s, abn: abn.has(a.name) || abn.has(b.name), inl: 0, group: grp(a.name, b.name), sev: sev(a.name, b.name) });
      }
    }
    out.sort((a, b) => (b.sev > 0) - (a.sev > 0) || b.inl - a.inl || b.sev - a.sev);
    return out;
  }
  function renderCorr() {
    S.dirty.corr = false;
    const r = S.res, c = S.cfg, el = $('corr');
    const pairs = autoPairs();
    if (!S.corr.y) { const p = pairs[0]; S.corr.y = p ? p.y : r.items[0]?.name; S.corr.x = p ? p.x : (r.items[1] || r.items[0])?.name; S.corr.group = p ? p.group : '全部'; }
    const opts = (cur) => r.items.map((i) => `<option value="${esc(i.name)}" ${i.name === cur ? 'selected' : ''}>${esc(short(i.name))}${i.kind === 'inline' ? '（inline）' : ''}</option>`).join('');
    el.innerHTML = `<div class="corr-wrap">
      <div class="pairs"><h4>建議配對 <span class="muted small" style="font-weight:400">依物理關係，異常 item 優先</span></h4>
        ${pairs.map((p, i) => `<div class="pair ${p.y === S.corr.y && p.x === S.corr.x ? 'on' : ''}" data-p="${i}">${p.abn ? '<span class="pill orange" style="font-size:10.5px">異常</span> ' : ''}<b>${esc(short(p.y))}</b> vs ${esc(short(p.x))}${p.group !== '全部' && r.groups.length > 1 ? ` <span class="muted small">@ ${esc(p.group)}</span>` : ''}<div class="why">${esc(p.why)}</div></div>`).join('') ||
          '<div class="muted small" style="padding:6px">沒有偵測到可以自動配對的關係。資料若同時含 WAT 與同層 inline（例如 Con_M12 與 M12 CD），會自動列在這裡；也可以在右側自己選 X／Y。</div>'}
      </div>
      <div>
        <div class="ctrl"><span>Y</span><select id="cY">${opts(S.corr.y)}</select><span>X</span><select id="cX">${opts(S.corr.x)}</select>
          ${r.groups.length > 1 ? `<span>${esc(c.groupCol)}</span><select id="cG"><option ${S.corr.group === '全部' ? 'selected' : ''}>全部</option>${r.groups.map((g) => `<option ${g === S.corr.group ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>` : ''}
          <button class="btn sm" id="cWin" title="開成浮動視窗，可同時比對多組">⤢ 開視窗</button>
          <span class="muted small">每點 = 一片 wafer；BSL 灰、CIP 彩色，各自擬合（LK 以 log 值擬合）</span></div>
        <div class="cplot" id="cPlot"></div><div id="cStat"></div>
      </div></div>`;
    const draw = () => {
      if (!S.corr.y || !S.corr.x) return;
      const fig = corrFig(S.corr.y, S.corr.x, S.corr.group, 520);
      plotInto($('cPlot'), fig);
      const pr = pairs.find((p) => p.y === S.corr.y && p.x === S.corr.x);
      const all = fig.stats.find((s) => s.cond === '全部');
      const check = pr && all.r != null ? (Math.sign(all.r) === pr.sign ? `✔ 實際 r = ${all.r.toFixed(2)}，方向符合物理預期` : `✖ 實際 r = ${all.r.toFixed(2)}，方向與預期相反，請確認資料`) : '';
      $('cStat').innerHTML = `<table class="cstat"><tr><th>Condition</th><th>N</th><th>斜率${fig.logNote ? '（log）' : ''}</th><th>截距</th><th>r</th><th>R²</th><th>p（斜率）</th></tr>
        ${fig.stats.map((s) => `<tr><td>${s.cond === '全部' ? '<b>全部</b>' : `<i class="dot" style="background:${s.cond === c.baseline ? BSLC : cipColor(s.cond)}"></i>${esc(s.cond)}`}</td><td>${s.n || 0}</td><td>${s.b != null ? f4(s.b) : '—'}</td><td>${s.a != null ? f4(s.a) : '—'}</td>
          <td>${s.r != null ? s.r.toFixed(3) : '—'}</td><td>${s.r2 != null ? s.r2.toFixed(3) : '—'}</td><td>${s.p != null ? App.statsLib.fmtP(s.p) : '—'}</td></tr>`).join('')}</table>
        <div class="small" style="margin-top:6px">${esc(check)}${all.r2 != null && all.r2 < 0.1 ? '　R² 很低：兩者幾乎沒有線性關係，偏移不太可能由這個項目解釋。' : ''}</div>`;
    };
    el.querySelectorAll('[data-p]').forEach((x) => (x.onclick = () => { const p = pairs[+x.dataset.p]; S.corr.y = p.y; S.corr.x = p.x; S.corr.group = p.group; renderCorr(); }));
    $('cY').onchange = (e) => { S.corr.y = e.target.value; renderCorr(); };
    $('cX').onchange = (e) => { S.corr.x = e.target.value; renderCorr(); };
    if ($('cG')) $('cG').onchange = (e) => { S.corr.group = e.target.value; renderCorr(); };
    $('cWin').onclick = () => openCorrWin(S.corr.y, S.corr.x, S.corr.group);
    requestAnimationFrame(draw);
  }

  // ================================================================ export helpers
  /** render a figure off-screen → PNG data URL */
  async function figPng(fig, w, h, scale = 2) {
    if (!fig) return null;
    const div = document.createElement('div');
    div.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px`;
    document.body.appendChild(div);
    try {
      await Plotly.newPlot(div, fig.data, { ...fig.layout, width: w, height: h }, { staticPlot: true });
      return await Plotly.toImage(div, { format: 'png', width: w, height: h, scale });
    } finally { Plotly.purge(div); div.remove(); }
  }
  const modulesPresent = () => E.KINDS.filter((k) => S.res.items.some((i) => i.kind === k));
  const busy = (msg) => { const b = $('busy'); b.hidden = !msg; b.textContent = msg || ''; };

  /** static one-page HTML (current module): overview lights + every HL with trend & partner chart */
  async function buildHtml() {
    const r = S.res, c = S.cfg, mode = S.mode, fs = r.findings[mode], d = (x) => App.fmtDate(x).slice(0, 10);
    const keep = { rowf: S.rowf, collapsed: S.collapsed }; S.rowf = { abn: false, layers: [] }; S.collapsed = new Set();   // export always shows the full table
    const cards = [];
    for (let i = 0; i < fs.length; i++) {
      busy(`產生圖表 ${i + 1} / ${fs.length}…`);
      const f = fs[i], m1 = mainFig(f, 260), m2 = partnerFig(f, 260);
      const a = await figPng(m1.fig, 560, 260), b = m2 ? await figPng(m2.fig, 560, 260) : null;
      cards.push(`<div class="xcard">${findingCard(f)}${factorVerdict(f) ? `<div class="vd" style="margin:-4px 0 6px">${esc(factorVerdict(f))}</div>` : ''}<div class="xfigs"><figure><figcaption>${esc(m1.title)}</figcaption><img src="${a}"></figure>${b ? `<figure><figcaption>${esc(m2.title)}${m2.note ? `　${esc(m2.note)}` : ''}</figcaption><img src="${b}"></figure>` : ''}</div></div>`);
    }
    const css = document.querySelector('style').textContent, ncolX = r.groups.length * c.cips.length;
    S.rowf = keep.rowf; S.collapsed = keep.collapsed;
    const title = `BEOL ${MOD[mode]} 戰報：${c.cips.join('、')}（CIP） vs ${c.baseline}（BSL）`;
    return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>${css}
body{background:#f4f6f9}.report{background:#fff;border:1px solid #e3e7ee;border-radius:12px;padding:22px 26px;margin:20px auto;max-width:1180px}
.lc{cursor:default}.xov{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}.xcard{margin-bottom:16px;break-inside:avoid}.xcard .find{margin-bottom:6px}
.xfigs{display:grid;grid-template-columns:1fr 1fr;gap:10px}.xfigs figure{margin:0;border:1px solid #e3e7ee;border-radius:8px;padding:4px}.xfigs img{width:100%}.xfigs figcaption{font-size:12px;font-weight:600;padding:2px 4px}
@media print{.report{border:0;margin:0;padding:0}}</style></head>
<body><div class="report">
<div class="r-head"><div><h1>${esc(title)}</h1><div class="kcs">${kpiChips(mode)}</div></div>
<div class="meta">資料：${esc(S.file)}<br>${r.dateRange ? `期間：${d(r.dateRange[0])} ～ ${d(r.dateRange[1])}<br>` : ''}wafer 數：${Object.entries(r.nWafer).map(([k, v]) => `${esc(k)} ${v.toLocaleString()}`).join('、')}<br>產生：${App.fmtDate(new Date())}</div></div>
<div class="r-sec">總覽點燈表${c.groupCol ? `（依 ${esc(c.groupCol)} 分組）` : ''}</div>
<div class="xov">${lightTable(mode, 'mean', ncolX > 8 ? 'compact' : 'normal')}${mode === 'inline' ? lightTable('inline', 'var', ncolX > 8 ? 'compact' : 'normal') : ''}</div>
<div class="r-sec">異常 HL（${fs.length}）</div>${cards.join('') || '<div class="ok-box">✔ 全部在綠燈範圍內</div>'}
${r.naList[mode].length ? `<div class="dq"><b>資料品質：</b>${r.naList[mode].map((x) => `${esc(short(x.item.name))} @ ${esc(x.group)}：${esc(x.reason)}`).join('；')}</div>` : ''}
<div class="foot">${$('report').querySelector('.foot')?.innerHTML || ''}</div>
</div></body></html>`;
  }
  const stampName = (base, ext) => `${base}_${S.cfg.cips.join('_')}_vs_${S.cfg.baseline}_${new Date().toISOString().slice(0, 10)}.${ext}`.replace(/[\\/:*?"<>|\s]/g, '_');
  async function exportHtml() {
    try {
      busy('產生 HTML…');
      const html = await buildHtml();
      App.download(stampName(`BEOL_${MOD[S.mode]}_Report`, 'html'), html, 'text/html');
      App.toast('已匯出 One-page HTML（圖已嵌入，可直接寄送）', 'ok');
    } catch (e) { console.error(e); App.toast(`匯出失敗：${e.message}`, 'err'); } finally { busy(''); }
  }
  async function printReport() {
    const w = window.open('', '_blank');
    if (!w) { App.toast('瀏覽器擋了新視窗；請改用「匯出 HTML」後再列印', 'err'); return; }
    w.document.write('<p style="font-family:sans-serif;padding:20px">產生列印版面中…</p>');
    try { const html = await buildHtml(); w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 600); }
    catch (e) { w.close(); App.toast(`列印失敗：${e.message}`, 'err'); } finally { busy(''); }
  }

  // ================================================================ PPT export (PptxGenJS, native editable tables + chart images)
  const PC = { green: ['E5F5EB', '1E8E4E'], yellow: ['FDF1D3', 'A86B00'], orange: ['FDE6D6', 'D4580F'], na: ['F0F2F5', '98A2B3'] };
  const NAVY = '1F3B63', FONT = 'Microsoft JhengHei';
  async function exportPpt() {
    if (!window.PptxGenJS) { App.toast('PPT 程式庫沒有載入（lite 版需要能連到 cdn.jsdelivr.net）；請改用完整版 BEOL_Report.html', 'err'); return; }
    const t0 = performance.now();
    try {
      const pptx = await buildPpt();
      busy('寫出 PPT…');
      await pptx.writeFile({ fileName: stampName('BEOL_Report', 'pptx') });
      App.toast(`已匯出 PPT（${pptx.slides.length} 頁，${((performance.now() - t0) / 1000).toFixed(1)} s）`, 'ok');
    } catch (e) { console.error(e); App.toast(`PPT 匯出失敗：${e.message}`, 'err'); } finally { busy(''); }
  }
  async function buildPpt() {
    const r = S.res, c = S.cfg, mods = modulesPresent(), d = (x) => App.fmtDate(x).slice(0, 10);
    const pptx = new window.PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';      // 13.33 × 7.5 in
    pptx.title = 'BEOL 分析戰報';
    const SW = 13.33;
    let page = 0, done = 0, total = 0;
    const strip = (u) => u.replace(/^data:/, '');
    const tick = () => busy(`產生 PPT 圖表 ${++done} / ${total}…`);
    for (const m of mods) total += Math.min(12, r.findings[m].length) * 2 + r.items.filter((i) => i.kind === m).length * r.groups.length;
    if (!S.pptDetail) S.pptDetail = 'auto';
    const newSlide = (title, sub) => {
      const s = pptx.addSlide(); page++;
      s.background = { color: 'FFFFFF' };
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: SW, h: 0.08, fill: { color: NAVY }, line: { color: NAVY } });
      s.addText(title, { x: 0.4, y: 0.18, w: 9.4, h: 0.55, fontFace: FONT, fontSize: 20, bold: true, color: NAVY });
      if (sub) s.addText(sub, { x: 9.6, y: 0.2, w: 3.33, h: 0.5, fontFace: FONT, fontSize: 10, color: '667085', align: 'right' });
      s.addShape(pptx.ShapeType.line, { x: 0.4, y: 0.78, w: SW - 0.8, h: 0, line: { color: 'D5DBE3', width: 1 } });
      s.addText(`${S.file}　｜　${c.cips.join('、')} vs ${c.baseline}　｜　${page}`, { x: 0.4, y: 7.08, w: SW - 0.8, h: 0.3, fontFace: FONT, fontSize: 8.5, color: '98A2B3', align: 'right' });
      return s;
    };
    // ---------- cover / summary
    {
      const s = newSlide('BEOL 分析戰報', App.fmtDate(new Date()).slice(0, 16));
      s.addText(`${c.cips.join('、')}（CIP） vs ${c.baseline}（BSL）`, { x: 0.4, y: 0.95, w: 12.5, h: 0.6, fontFace: FONT, fontSize: 26, bold: true, color: '1C2430' });
      const meta = [`資料：${S.file}`, r.dateRange ? `期間：${d(r.dateRange[0])} ～ ${d(r.dateRange[1])}` : '', `wafer 數：${Object.entries(r.nWafer).map(([k, v]) => `${k} ${v}`).join('、')}`, `分組：${c.groupCol || '不分組'}`].filter(Boolean).join('　｜　');
      s.addText(meta, { x: 0.4, y: 1.55, w: 12.5, h: 0.4, fontFace: FONT, fontSize: 12, color: '667085' });
      let y = 2.15;
      for (const m of mods) {
        const cnt = r.cnt[m], fs = r.findings[m];
        s.addText([
          { text: `${MOD[m]}　`, options: { bold: true, color: NAVY, fontSize: 16 } },
          { text: `綠 ${cnt.green}　`, options: { color: PC.green[1], bold: true } }, { text: `黃 ${cnt.yellow}　`, options: { color: PC.yellow[1], bold: true } },
          { text: `橘 ${cnt.orange}　`, options: { color: PC.orange[1], bold: true } }, { text: cnt.na ? `無法判定 ${cnt.na}　` : '', options: { color: PC.na[1] } },
          { text: m === 'inline' ? `變異放大 ${r.varCnt.orange + r.varCnt.yellow}` : '', options: { color: '667085' } },
        ], { x: 0.4, y, w: 12.5, h: 0.45, fontFace: FONT, fontSize: 14 });
        y += 0.45;
        // one line per level, phenomenon only（item @ group 偏移量）
        const lines = [];
        for (const lv of ['orange', 'yellow']) {
          const a = fs.filter((f) => r.lvOf(f) === lv); if (!a.length) continue;
          lines.push({ text: `${LVZH[lv]} ${a.length}：`, options: { bold: true, color: PC[lv][1] } });
          lines.push({ text: a.slice(0, 8).map((f) => `${short(f.cell.item.name)}${r.groups.length > 1 ? ` @ ${f.cell.group}` : ''} ${fTxt(f)}`).join('、') + (a.length > 8 ? ` …（共 ${a.length}）` : ''), options: { color: '1C2430', breakLine: true } });
        }
        if (!lines.length) lines.push({ text: '全部在綠燈範圍內，CIP 與 BSL match。', options: { color: PC.green[1] } });
        const h = 0.36 * Math.ceil(lines.length / 2) + 0.1;
        s.addText(lines, { x: 0.6, y, w: 12.3, h, fontFace: FONT, fontSize: 12, valign: 'top', fit: 'shrink' });
        y += h + 0.25;
      }
      const th = r.th;
      s.addText(`判斷：K = (Mean CIP − Mean BSL) / σ BSL，綠 ≤ ${th.kG}σ、橘 > ${th.kO}σ；LK median 倍數 綠 ≤ ×${th.fG}、橘 > ×${th.fO}；SPA 異常率差 綠 ≤ ${th.rG}%pt、橘 > ${th.rO}%pt；Inline σ 倍數 綠 ≤ ×${th.sG}、橘 > ×${th.sO}`,
        { x: 0.4, y: 6.5, w: 12.5, h: 0.5, fontFace: FONT, fontSize: 10, color: '667085' });
    }
    for (const m of mods) {
      const its = r.items.filter((i) => i.kind === m);
      // ---------- light table(s): native, editable PPT tables
      const views = m === 'inline' ? [['mean', '點燈表（均值 K-shift）'], ['var', '變異比較（W2W／WIW σ 倍數）']] : [['mean', '點燈表']];
      for (const [view, vt] of views) {
        const nc = r.groups.length * c.cips.length, colW0 = 2.1, colW = Math.min(1.6, (SW - 0.8 - colW0) / Math.max(1, nc));
        const hcell = (text, align = 'center') => ({ text, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align } });
        const head = [hcell(`${MOD[m]} item${c.groupCol ? `\n${c.groupCol} →` : ''}`, 'left'),
          ...r.groups.flatMap((g) => c.cips.map((p) => hcell(c.groupCol ? (c.cips.length > 1 ? `${g}\n${p}` : g) : `${p}\nvs ${c.baseline}`)))];
        const rows = [], byCatP = new Map();
        [...its].sort((a, b) => (/^other/.test(a.cat) ? 1 : 0) - (/^other/.test(b.cat) ? 1 : 0)).forEach((it) => { if (!byCatP.has(it.cat)) byCatP.set(it.cat, []); byCatP.get(it.cat).push(it); });
        const many = nc > 8, fs = many ? 9.5 : 11;
        for (const [cat, catIts] of byCatP) {
          rows.push([{ text: RU.byId(cat).label, options: { colspan: nc + 1, fill: { color: 'F7F9FC' }, color: '667085', bold: true, fontSize: 9 } }]);
          for (const it of catIts) rows.push([{ text: short(it.name), options: { bold: true, align: 'left' } }, ...r.groups.flatMap((g) => c.cips.map((p) => {
            const x = r.cells[it.name][g][p];
            const lvl = view === 'var' ? x.varLevel : x.level;
            const t = view === 'var' ? [x.sdRatio != null ? `W2W ×${x.sdRatio.toFixed(2)}` : '', x.wiwRatio != null ? `WIW ×${x.wiwRatio.toFixed(2)}` : ''].filter(Boolean).join('\n') || '—' : shiftTxt(x);
            return { text: t, options: { fill: { color: PC[lvl][0] }, color: PC[lvl][1], bold: true, align: 'center', fontFace: 'Consolas', fontSize: fs } };
          }))]);
        }
        head.forEach((h) => (h.options.fontSize = many ? 9 : 10.5));
        const per = many ? 19 : 15, rowH = many ? 0.29 : 0.34;
        for (let i = 0, pg = 0; i < rows.length; i += per, pg++) {
          const s = newSlide(`${MOD[m]} ${vt}${rows.length > per ? `（${pg + 1}/${Math.ceil(rows.length / per)}）` : ''}`, c.groupCol ? `依 ${c.groupCol} 分組` : '不分組');
          s.addTable([head, ...rows.slice(i, i + per)], { x: Math.max(0.4, (SW - colW0 - colW * nc) / 2), y: 0.95, w: colW0 + colW * nc, colW: [colW0, ...Array(nc).fill(colW)], fontFace: FONT, fontSize: fs, rowH, valign: 'middle', margin: many ? 2 : 4, border: { type: 'solid', pt: 0.75, color: 'FFFFFF' }, autoPage: false });
          const legend = view === 'var' ? `σ 倍數 = CIP ÷ BSL；綠 ≤ ×${r.th.sG}、黃 ×${r.th.sG}–${r.th.sO}、橘 > ×${r.th.sO}` : m === 'wat' ? '數字 = K-shift（σ）；LK 為 median 倍數（×）；SPA 為異常率差（%pt）' : '數字 = K-shift（σ）';
          s.addText(legend, { x: 0.4, y: Math.min(6.75, 0.95 + 0.5 + Math.min(per, rows.length - i) * rowH + 0.15), w: 12.5, h: 0.3, fontFace: FONT, fontSize: 9.5, color: '667085' });
        }
      }
      // ---------- HL 總表：one row per finding（燈、item、偏移、Inline／鄰層／機台／Yield 一句話、第一條建議檢查）
      const fsAll = r.findings[m];
      if (fsAll.length) {
        const hc = (t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'left', fontSize: 10 } });
        const labels = m === 'wat' ? ['Inline', '鄰層', '機台', 'Yield'] : m === 'inline' ? ['WAT', '機台'] : ['WAT', '機台'];
        const head = [hc('燈'), hc(`${MOD[m]} item${r.groups.length > 1 ? ' @ 組' : ''}`), hc('偏移'), ...labels.map(hc), hc('先查')];
        const rowsS = fsAll.map((f) => {
          const lv = r.lvOf(f), xc = crossChecks(f), ck = checkRows(f)[0];
          const cell = (lab) => { const x = xc.find((q) => q.label === lab); return { text: x ? `${x.icon} ${x.text}` : '—', options: { color: x && x.state === 'ok' ? '1F2A3C' : '667085', fontSize: 9 } }; };
          return [{ text: LVZH[lv], options: { fill: { color: PC[lv][0] }, color: PC[lv][1], bold: true, align: 'center', fontSize: 9.5 } },
            { text: `${short(f.cell.item.name)}${r.groups.length > 1 ? `\n@ ${f.cell.group}` : ''}`, options: { bold: true, fontSize: 9.5 } },
            { text: fTxt(f), options: { fontFace: 'Consolas', bold: true, color: PC[lv][1], fontSize: 10, align: 'center' } },
            ...labels.map(cell), { text: ck ? `${CKI[ck.st] || '·'} ${ck.text}` : '—', options: { fontSize: 9 } }];
        });
        const per = 8, W = [0.55, 2.2, 0.9, ...labels.map(() => (SW - 0.8 - 0.55 - 2.2 - 0.9 - 2.4) / labels.length), 2.4];
        for (let i = 0, pg = 0; i < rowsS.length; i += per, pg++) {
          const s = newSlide(`${MOD[m]} HL 總表${rowsS.length > per ? `（${pg + 1}/${Math.ceil(rowsS.length / per)}）` : ''}`, '✔ 有關聯　△ 弱／部分　✘ 未對上　○ 缺資料');
          s.addTable([head, ...rowsS.slice(i, i + per)], { x: 0.4, y: 0.95, w: SW - 0.8, colW: W, fontFace: FONT, fontSize: 9.5, rowH: 0.62, valign: 'middle', margin: 3, border: { type: 'solid', pt: 0.75, color: 'E3E7EE' }, autoPage: false });
        }
      }
      // ---------- HL detail slides：預設只做橘燈（黃燈 HL 總表已涵蓋）；HL ≤ 4 時全做；可用 #pptDetail 改
      const detail = S.pptDetail || 'auto';
      const picked = detail === 'all' ? fsAll : detail === 'orange' ? fsAll.filter((f) => r.lvOf(f) === 'orange') : fsAll.length <= 4 ? fsAll : fsAll.filter((f) => r.lvOf(f) === 'orange');
      for (const f of picked.slice(0, 12)) {
        const m1 = mainFig(f, 300), m2 = partnerFig(f, 300);
        const a = await figPng(m1.fig, 760, 340); tick();
        const b = m2 ? await figPng(m2.fig, 760, 340) : null; tick();
        const lv = r.lvOf(f), s = newSlide(`${MOD[m]} HL｜${short(f.cell.item.name)}${r.groups.length > 1 ? ` @ ${f.cell.group}` : ''}`, `${LVZH[lv]}燈　${fTxt(f)}`);
        s.addShape(pptx.ShapeType.rect, { x: 0.4, y: 0.92, w: 0.09, h: 0.42, fill: { color: PC[lv][1] }, line: { color: PC[lv][1] } });
        s.addText(f.dx.title, { x: 0.58, y: 0.9, w: 12.3, h: 0.45, fontFace: FONT, fontSize: 14, bold: true, color: '1C2430' });
        s.addText(m1.title, { x: 0.45, y: 1.38, w: 7, h: 0.25, fontFace: FONT, fontSize: 9, color: '667085' });
        s.addImage({ data: strip(a), x: 0.4, y: 1.6, w: 7.3, h: 2.5 });
        if (b) {
          s.addText(`${m2.title}${m2.note ? `　${m2.note}` : ''}`, { x: 0.45, y: 4.18, w: 7, h: 0.25, fontFace: FONT, fontSize: 9, color: '667085' });
          s.addImage({ data: strip(b), x: 0.4, y: 4.4, w: 7.3, h: 2.5 });
        }
        const tmp = document.createElement('div'); tmp.innerHTML = numsHtml(f);
        const gap = { text: ' ', options: { fontSize: 5, breakLine: true } };
        const xc = crossChecks(f);
        s.addText([
          { text: tmp.textContent, options: { fontSize: 11, color: '344054', breakLine: true } }, gap,
          { text: f.dx.verdict, options: { fontSize: 11.5, bold: true, color: NAVY, breakLine: true } }, gap,
          ...xc.map((x) => ({ text: `${x.label} ${x.icon} ${x.text}`, options: { fontSize: 10, color: x.state === 'ok' ? '1F2A3C' : x.state === 'warn' ? '7A3E00' : '667085', breakLine: true } })), gap,
          { text: '建議檢查', options: { fontSize: 11, bold: true, color: '667085', breakLine: true } },
          ...checkRows(f).slice(0, 5).map((r) => ({ text: `${CKI[r.st] || '·'} ${r.text}${r.note ? `（${r.note}）` : ''}`, options: { bullet: true, fontSize: 10.5, breakLine: true, color: r.st === 'no' ? '9AA3AE' : r.st === 'ok' ? NAVY : '333333' } })), gap,
          { text: '物理機制：', options: { fontSize: 9.5, bold: true, color: '667085' } },
          { text: rankCauses(f).slice(0, 4).map((r) => `${r.st === 'yes' ? '✔ ' : r.st === 'no' ? '✘ ' : ''}${r.text}`).join('；'), options: { fontSize: 9.5, color: '667085' } },
        ], { x: 7.95, y: 1.45, w: 4.98, h: 5.45, fontFace: FONT, valign: 'top', color: '1C2430', fit: 'shrink', margin: 6, fill: { color: 'F7F9FC' } });
      }
      // ---------- overview trend matrix (items × groups), 3 items × up to 4 groups per slide
      const G = r.groups, gChunks = [];
      for (let i = 0; i < G.length; i += 4) gChunks.push(G.slice(i, i + 4));
      const perSlide = 3, nPg = Math.ceil(its.length / perSlide) * gChunks.length;
      let pg = 0;
      for (const gs of gChunks) for (let i = 0; i < its.length; i += perSlide) {
        const rowsIt = its.slice(i, i + perSlide);
        const s = newSlide(`${MOD[m]} 總覽 Trend${nPg > 1 ? `（${++pg}/${nPg}）` : ''}`, `灰 = BSL ${c.baseline}；彩色 = CIP`);
        const x0 = 1.65, cw = (SW - 0.4 - x0) / gs.length, top = 0.92, rh = 1.98;
        gs.forEach((g, j) => s.addText(c.groupCol ? g : `${c.cips.join('、')} vs ${c.baseline}`, { x: x0 + j * cw, y: top, w: cw, h: 0.28, fontFace: FONT, fontSize: 11, bold: true, color: NAVY, align: 'center' }));
        for (let k = 0; k < rowsIt.length; k++) {
          const it = rowsIt[k], y = top + 0.32 + k * rh;
          s.addText([{ text: short(it.name), options: { bold: true, fontSize: 11.5, color: '1C2430', breakLine: true } }, { text: `${unit(it.name)}${it.metric === 'fold' ? '・log' : it.metric === 'rate' ? `・固定值 ${f4(it.target)}` : ''}`, options: { fontSize: 9, color: '667085' } }],
            { x: 0.3, y, w: x0 - 0.35, h: rh - 0.1, fontFace: FONT, valign: 'middle' });
          for (let j = 0; j < gs.length; j++) {
            const g = gs[j], cells = r.cells[it.name][g];
            const img = await figPng(trendFig(it.name, g, 220, { mini: true }), 460, 220); tick();
            const wl = cellWorst(cells, m), bx = x0 + j * cw;
            s.addShape(pptx.ShapeType.rect, { x: bx + 0.03, y, w: cw - 0.06, h: rh - 0.08, fill: { color: 'FFFFFF' }, line: { color: isAbnL(wl) ? PC[wl][1] : 'E3E7EE', width: isAbnL(wl) ? 1.5 : 0.75 } });
            s.addText(c.cips.map((p) => ({ text: `${c.cips.length > 1 ? `${p} ` : ''}${shiftTxt(cells[p])}  `, options: { color: PC[cells[p].level][1], bold: true } })),
              { x: bx + 0.06, y: y + 0.02, w: cw - 0.12, h: 0.24, fontFace: 'Consolas', fontSize: 9.5 });
            const maxW = cw - 0.14, maxH = rh - 0.38, iw = Math.min(maxW, maxH * (460 / 220)), ih = iw * (220 / 460);
            s.addImage({ data: strip(img), x: bx + (cw - iw) / 2, y: y + 0.27, w: iw, h: ih });
          }
        }
      }
    }
    return pptx;
  }


  // ================================================================ knowledge base page
  const KBF = [['id', 'ID（英文代號）'], ['label', '名稱'], ['kind', '種類 wat／inline／yield'], ['metric', '指標 k／fold／rate'], ['bad', '壞的方向 up／down／空白'], ['name', '欄名樣式（; 分隔，* 任意、? 一字、# 數字）'], ['unit', '單位樣式'],
    ['up_mean', '偏高的意義'], ['up_causes', '偏高可能原因（一行一條）'], ['up_checks', '偏高建議檢查（一行一條，{L} = 層別）'], ['down_mean', '偏低的意義'], ['down_causes', '偏低可能原因'], ['down_checks', '偏低建議檢查'],
    ['pairs', '配對 inline 類別（例 thk:-;cd:-）'], ['source', '來源（FA 編號、文獻）'], ['note', '備註'], ['author', '作者'], ['date', '日期']];
  const LISTF = ['up_causes', 'up_checks', 'down_causes', 'down_checks'];
  const kbOverlay = () => App.store.get('rpt-kb', null) || { version: '', author: '', date: '', rules: [] };
  function kbSave(ov) {
    ov.date = new Date().toISOString().slice(0, 10);
    App.store.set('rpt-kb', ov);
    RU.load(App.RULES_BASE, ov.rules.length ? ov : null);
    if (S.cfg) {   // re-classify columns the user has not set by hand, then recompute
      S.cfg.items.forEach((it) => { if (!it.userCat) { const k = RU.classify(it.name); it.cat = k.cat; it.conf = k.conf; E.itemSetup(it, S.ds.rows); } });
      if (S.res) generate();
    }
    renderKB();
  }
  function renderKB() {
    const el = $('kb'), ov = kbOverlay(), rules = RU.RULES;
    const dry = S.ds ? RU.dryRun(S.ds.columns.filter((c) => c.type === 'number').map((c) => c.name)) : null;
    const editing = S.kbEdit;
    el.innerHTML = `<div class="kb-bar">
        <div><b>${esc(RU.kbVersion())}</b><span class="muted small">　基礎層隨工具出貨；fab 層存在這台電腦的瀏覽器，匯出後可以交給同事或併回建置。${ov.rules.length ? `fab 層更新：${esc(ov.date || '')}${ov.author ? `（${esc(ov.author)}）` : ''}` : ''}</span></div>
        <span class="spacer"></span>
        <button class="btn sm" data-kb="new">＋ 新增規則</button>
        <button class="btn sm" data-kb="imp">匯入 JSON／Excel</button>
        <button class="btn sm" data-kb="xlsx">匯出 Excel</button>
        <button class="btn sm" data-kb="json">匯出 JSON</button>
        <button class="btn sm" data-kb="tpl" title="空白的 Excel 公版，一列一條規則">下載公版</button>
        <button class="btn sm" data-kb="clear" ${ov.rules.length ? '' : 'disabled'}>清除 fab 層</button></div>
      <div class="muted small" style="margin:6px 0 10px">欄名樣式用萬用字元：<code>*</code> 任意、<code>?</code> 一個字、<code>#</code> 一個數字，多個樣式用 <code>;</code> 分隔；沒有 * 的樣式會以整個名稱或名稱中的一個單字比對。<b>命中欄位</b>一欄顯示目前匯入資料中哪些欄位會套用這條規則${S.ds ? '' : '（匯入資料後才會顯示）'}。點一列可編輯；基礎層規則編輯後會以 fab 層覆蓋。</div>
      <table class="kbt"><thead><tr><th>層</th><th>ID</th><th>名稱</th><th>種類</th><th>指標</th><th>欄名樣式</th><th>單位</th><th>偏高 → 意義</th><th>偏低 → 意義</th><th>配對</th><th>命中欄位</th><th>來源</th><th></th></tr></thead><tbody>
        ${rules.map((r) => { const hits = dry ? dry[r.id] || [] : null; return `<tr class="${r.enabled ? '' : 'off'} ${editing === r.id ? 'on' : ''}" data-rid="${esc(r.id)}"><td><span class="tag ${r.layer === 'fab' ? 'fab' : ''}">${r.layer === 'fab' ? 'fab' : '基礎'}</span></td><td><b>${esc(r.id)}</b></td><td>${esc(r.label)}</td><td>${esc(r.kind)}</td><td>${esc(r.metric || 'k')}</td><td class="mono">${esc(r.name)}</td><td class="mono">${esc(r.unit)}</td><td>${esc(r.up_mean)}</td><td>${esc(r.down_mean)}</td><td class="mono">${esc(r.pairs)}</td><td>${hits == null ? '<span class="muted">—</span>' : hits.length ? hits.map((h) => `<span class="chip tiny ${h.conf < 0.7 ? 'warn' : ''}" title="信心 ${h.conf}">${esc(short(h.col))}</span>`).join(' ') : (r.id === 'other' ? '' : '<span class="muted">沒有命中</span>')}</td><td class="small">${esc(r.source || '')}</td><td>${r.enabled ? '' : '<span class="tag warn">停用</span>'}</td></tr>`; }).join('')}
      </tbody></table>
      <div id="kbForm"></div>`;
    el.querySelectorAll('tr[data-rid]').forEach((t) => (t.onclick = () => { S.kbEdit = t.dataset.rid; renderKB(); $('kbForm').scrollIntoView({ block: 'nearest' }); }));
    el.querySelector('[data-kb=new]').onclick = () => { S.kbEdit = '__new__'; renderKB(); $('kbForm').scrollIntoView({ block: 'nearest' }); };
    el.querySelector('[data-kb=imp]').onclick = () => $('kbFile').click();
    el.querySelector('[data-kb=json]').onclick = () => App.download(`BEOL_rules_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: ov.version || RU.KB.base.version, author: ov.author || '', date: new Date().toISOString().slice(0, 10), rules: RU.exportRows() }, null, 2), 'application/json');
    el.querySelector('[data-kb=xlsx]').onclick = () => kbExcel(RU.exportRows(), 'BEOL_rules');
    el.querySelector('[data-kb=tpl]').onclick = () => kbExcel([Object.fromEntries(KBF.map(([k]) => [k, '']))], 'BEOL_rules_template', true);
    el.querySelector('[data-kb=clear]').onclick = () => { if (confirm('清除這台電腦的 fab 層規則，回到基礎層？')) { App.store.set('rpt-kb', null); S.kbEdit = null; kbSave({ version: '', author: '', date: '', rules: [] }); } };
    if (editing) renderKBForm(editing);
  }
  function renderKBForm(id) {
    const host = $('kbForm'), isNew = id === '__new__';
    const r = isNew ? RU.normRule({ id: '', kind: 'wat', metric: 'k', enabled: true }) : RU.RULES.find((x) => x.id === id);
    if (!r) { host.innerHTML = ''; return; }
    const f = (k, lab) => LISTF.includes(k)
      ? `<label class="kbf wide"><span>${esc(lab)}</span><textarea data-f="${k}" rows="3">${esc(r[k].join('\n'))}</textarea></label>`
      : ['kind', 'metric', 'bad'].includes(k)
        ? `<label class="kbf"><span>${esc(lab)}</span><select data-f="${k}">${{ kind: ['wat', 'inline', 'yield'], metric: ['k', 'fold', 'rate'], bad: ['', 'up', 'down'] }[k].map((v) => `<option ${r[k] === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`
        : `<label class="kbf ${['name', 'unit', 'up_mean', 'down_mean', 'source', 'note'].includes(k) ? 'wide' : ''}"><span>${esc(lab)}</span><input data-f="${k}" value="${esc(r[k] ?? '')}" ${k === 'id' && !isNew ? 'readonly' : ''}></label>`;
    host.innerHTML = `<div class="kb-form"><h3>${isNew ? '新增規則（fab 層）' : `編輯 ${esc(r.id)}${r.layer === 'base' ? '（儲存後成為 fab 層覆蓋）' : '（fab 層）'}`}</h3>
      <div class="kb-grid">${KBF.map(([k, lab]) => f(k, lab)).join('')}
        <label class="kbf"><span>啟用</span><select data-f="enabled"><option value="true" ${r.enabled ? 'selected' : ''}>是</option><option value="false" ${r.enabled ? '' : 'selected'}>否（停用）</option></select></label></div>
      <div class="kb-test" id="kbTest"></div>
      <div class="go"><button class="btn primary" data-kbf="save">儲存到 fab 層</button><button class="btn" data-kbf="test">試算：哪些欄位會命中</button>${!isNew && r.layer === 'fab' ? '<button class="btn" data-kbf="del">刪除這條 fab 規則</button>' : ''}<button class="btn" data-kbf="cancel">取消</button></div></div>`;
    const read = () => { const o = {}; host.querySelectorAll('[data-f]').forEach((x) => (o[x.dataset.f] = x.value)); o.enabled = o.enabled !== 'false'; return RU.normRule(o); };
    host.querySelector('[data-kbf=test]').onclick = () => {
      const o = read(), c = RU.compileRule(o);
      if (!S.ds) { $('kbTest').innerHTML = '<span class="muted">先匯入資料才能試算。</span>'; return; }
      const cols = S.ds.columns.filter((x) => x.type === 'number').map((x) => x.name);
      const hit = cols.filter((n) => { const { short: sh, unit: u } = RU.parseName(n); return (c.name && c.name.test(sh)) || (c.unit && u && c.unit.test(u)); }).map((n) => { const { short: sh, unit: u } = RU.parseName(n); const nm = c.name && c.name.test(sh), um = c.unit && u && c.unit.test(u); return `<span class="chip tiny ${nm && um ? '' : 'warn'}">${esc(sh)}${um ? '' : '（單位不符）'}${nm ? '' : '（只有單位符合）'}</span>`; });
      $('kbTest').innerHTML = hit.length ? `會命中 ${hit.length} 個欄位：${hit.join(' ')}` : '<span class="muted">目前資料沒有欄位會命中這條規則。</span>';
    };
    host.querySelector('[data-kbf=save]').onclick = () => {
      const o = read();
      if (!/^[a-z][a-z0-9_]*$/i.test(o.id)) { App.toast('ID 請用英文、數字、底線，例如 lk_tv', 'err'); return; }
      if (!o.label) o.label = o.id;
      if (!o.author) o.author = 'fab';
      o.date = new Date().toISOString().slice(0, 10);
      const ov = kbOverlay(), i = ov.rules.findIndex((x) => x.id === o.id);
      if (i >= 0) ov.rules[i] = o; else ov.rules.push(o);
      S.kbEdit = o.id; kbSave(ov); App.toast(`已儲存規則 ${o.id} 到 fab 層`, 'ok');
    };
    const del = host.querySelector('[data-kbf=del]');
    if (del) del.onclick = () => { const ov = kbOverlay(); ov.rules = ov.rules.filter((x) => x.id !== r.id); S.kbEdit = null; kbSave(ov); };
    host.querySelector('[data-kbf=cancel]').onclick = () => { S.kbEdit = null; renderKB(); };
  }
  function kbExcel(rows, name, template) {
    const head = [...KBF.map(([k]) => k), 'enabled', 'layer'];
    const zh = [...KBF.map(([, l]) => l), '啟用 true／false', '層（匯入時忽略）'];
    const data = [head, zh, ...rows.map((r) => head.map((k) => (k === 'enabled' ? (r.enabled === false ? 'false' : 'true') : r[k] ?? '')))];
    const ws = XLSX.utils.aoa_to_sheet(template ? data.slice(0, 2) : data);
    ws['!cols'] = head.map((k) => ({ wch: LISTF.includes(k) ? 46 : k === 'name' ? 34 : 16 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'rules');
    XLSX.writeFile(wb, `${name}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  async function kbImport(file) {
    try {
      let rules = [], meta = {};
      if (/\.json$/i.test(file.name)) { const j = JSON.parse(await file.text()); rules = j.rules || j; meta = j; }
      else {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
        const head = aoa[0].map((h) => String(h).trim());
        const body = aoa.slice(1).filter((row) => row.some((v) => v !== '') && !(String(row[0]).includes('英文') && String(row[1]).includes('名稱')));   // skip the Chinese helper row
        rules = body.map((row) => Object.fromEntries(head.map((h, i) => [h, row[i]])));
      }
      rules = rules.filter((r) => r.id && String(r.id).trim()).map((r) => RU.normRule(r));
      if (!rules.length) { App.toast('檔案裡沒有規則（需要 id 欄）', 'err'); return; }
      // rules identical to the base layer are not stored as overrides
      const baseMap = new Map((App.RULES_BASE.rules || []).map((b) => [b.id, RU.canon(b)]));
      const changed = rules.filter((r) => baseMap.get(r.id) !== RU.canon(r));
      const ov = kbOverlay();
      changed.forEach((r) => { const i = ov.rules.findIndex((x) => x.id === r.id); if (i >= 0) ov.rules[i] = r; else ov.rules.push(r); });
      ov.version = meta.version || ov.version || ''; ov.author = meta.author || ov.author || '';
      S.kbEdit = null; kbSave(ov);
      App.toast(`匯入 ${rules.length} 條，其中 ${changed.length} 條與基礎層不同，已放入 fab 層`, 'ok');
    } catch (e) { console.error(e); App.toast(`知識庫匯入失敗：${e.message}`, 'err'); }
  }

  // ================================================================ copy
  const checkTxt = (f) => checkRows(f).map((r) => `${CKI[r.st] || '·'} ${r.text}${r.note ? `（${r.note}）` : ''}`);
  const summary = () => E.summaryText(S.res, S.cfg, { file: S.file, factor: factorVerdict, causes: causeTxt, checks: checkTxt }, S.mode);
  async function copySummary() {
    const txt = summary();
    try { await navigator.clipboard.writeText(txt); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    App.toast('已複製結論文字，可以直接貼到 mail 或 chat', 'ok');
  }

  App.rptUI = { loadFile, linkFile, unlink, openToolWin, checkHint, generate, showTab, setMode, exportHtml, exportPpt, buildHtml, buildPpt, summary, openCell, openCorrWin, closeAllWins, selectHL, wins: WM, kbImport, kbSave, kbOverlay };
})();
