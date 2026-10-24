// Robustness: run the BEOL report on data shapes it was NOT built around and check auto-config + numbers vs pandas.
// run: python sample_data/gen_variants.py && node tests/e2e_variants.js
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const HTML = 'file://' + [path.join(ROOT, 'dist', 'BEOL_Report.html'), path.join(ROOT, 'BEOL_Report.html')].find((p) => fs.existsSync(p));
const SD = path.join(ROOT, 'sample_data');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const near = (a, b, t = 0.01) => a != null && Math.abs(a - b) < t;

// independent reference values
const REF = JSON.parse(execSync(`python3 -c "
import json, pandas as pd
K=lambda d,c,b,cip,col:(d[d[c]==cip][col].mean()-d[d[c]==b][col].mean())/d[d[c]==b][col].std()
h=pd.read_excel(r'${path.join(SD, 'BEOL_horizontal_by_wafer.xlsx')}')
c=pd.read_csv(r'${path.join(SD, 'variants', 'C_route_3cond.csv')}'); p=c[c.Product=='PX200']
d=pd.read_excel(r'${path.join(SD, 'variants', 'D_long_chamber.xlsx')}'); w=d[d.Parameter=='Rc_V4'].groupby(['WaferID','Chamber']).Value.mean().reset_index()
print(json.dumps({'rc_tv2':K(h,'Split','POR','Thin_TaN','Rc_TV2'),'rs_px200':K(p,'Route','POR','NEW1','RS_M3 (ohm/sq)'),
  'lk_px200':p[p.Route=='NEW1']['LEAK_M3 (A)'].median()/p[p.Route=='POR']['LEAK_M3 (A)'].median(),'rc_v4':K(w,'Chamber','CH_A','CH_B','Value')}))"`).toString());

(async () => {
  const browser = await chromium.launch();
  const run = async (file, check) => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('pdat:rpt-kb-on', 'true'); } catch (e) {} });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(HTML);
    await page.setInputFiles('#file', file);
    await page.waitForFunction(() => App.rpt.cfg, null, { timeout: 30000 }); await page.waitForTimeout(1000);
    const st = await page.evaluate(() => {
      const c = App.rpt.cfg, r = App.rpt.res, cell = (it, g, p) => { const n = r.items.find((i) => i.name.startsWith(it)).name; return r.cells[n][g][p]; };
      window.__cell = cell;
      return { tab: document.querySelector('.tab.active').id, msg: document.querySelector('#setup .go')?.innerText || '', cond: c.condCol, base: c.baseline, cips: c.cips, group: c.groupCol,
        items: Object.fromEntries(c.items.map((i) => [i.name, `${i.cat}/${i.kind}/${i.metric}`])), hasRes: !!r };
    });
    console.log(`\n=== ${path.basename(file)}: cond=${st.cond} BSL=${st.base} CIP=${st.cips} group=${st.group || '-'}`);
    await check(page, st);
    if (st.hasRes) {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 200000 }), page.click('#btnPpt')]);
      ok(/\.pptx$/.test(dl.suggestedFilename()), `PPT export works (${dl.suggestedFilename()})`);
    }
    ok(!errors.length, 'no page errors ' + JSON.stringify(errors.slice(0, 3)));
    await ctx.close();
  };

  await run(path.join(SD, 'BEOL_horizontal_by_wafer.xlsx'), async (page, st) => {
    ok(st.cond === 'Split' && st.base === 'POR' && st.cips.join() === 'Thin_TaN', 'user format 1: condition Split, BSL POR');
    const k = await page.evaluate(() => __cell('Rc_TV2', '全部', 'Thin_TaN').k);
    ok(near(k, REF.rc_tv2), `Rc_TV2 K ${k.toFixed(2)} = pandas ${REF.rc_tv2.toFixed(2)}`);
    const fx = await page.evaluate(() => { const d = App.rptUI.crossChecks(App.rpt.res.findings.wat[App.rpt.hl.wat]).find((x) => x.label === '機台'); return d ? { state: d.state, txt: d.text } : null; });
    ok(fx && fx.state !== 'ok' && /非本層.*TV2 機台資料未提供/.test(fx.txt), `whole-CIP shift is NOT blamed on a tool; only off-layer tool columns exist → asks for TV2 tool data (${fx?.txt})`);
    await page.selectOption('#rGroup', 'TM1_CMP_Tool'); await page.waitForTimeout(600);
    ok(await page.evaluate(() => App.rpt.res.groups.length >= 2), 'user can regroup by any column (TM1_CMP_Tool)');
  });
  await run(path.join(SD, 'BEOL_vertical_by_site.xlsx'), async (page, st) => {
    ok(st.tab === 'tab-setup' && /Condition/.test(st.msg), `user format 2 has no condition column → stops at setup and asks (${st.msg.trim()})`);
    ok(st.items['Con_TM1'] === 'rs/wat/k' && st.items['TM1_CD'] === 'cd/inline/k', 'WAT + inline items still recognised from the long table');
  });
  await run(path.join(SD, 'variants', 'C_route_3cond.csv'), async (page, st) => {
    ok(st.cond === 'Route' && st.base === 'POR' && st.cips.join() === 'NEW1,NEW2' && st.group === 'Product', 'CSV: 3 conditions + Product groups detected');
    ok(st.items['LEAK_M3 (A)'] === 'lk/wat/fold' && st.items['RS_M3 (ohm/sq)'] === 'rs/wat/k' && st.items['PARAM_X'].startsWith('other'), '"NAME (unit)" columns classified; unknown PARAM_X kept as other');
    const v = await page.evaluate(() => ({ rs: __cell('RS_M3', 'PX200', 'NEW1').k, lk: __cell('LEAK_M3', 'PX200', 'NEW1').fold, cols: document.querySelectorAll('#report .lt thead th').length }));
    ok(near(v.rs, REF.rs_px200) && near(v.lk, REF.lk_px200), `RS_M3 K ${v.rs.toFixed(2)} / LEAK ×${v.lk.toFixed(2)} = pandas`);
    ok(v.cols === 1 + 3 * 2, `light table: 3 products × 2 CIPs = ${v.cols - 1} columns`);
  });
  await run(path.join(SD, 'variants', 'D_long_chamber.xlsx'), async (page, st) => {
    ok(st.cond === 'Chamber' && st.base === 'CH_A', 'long table with other column names: condition Chamber');
    const v = await page.evaluate(() => ({ k: __cell('Rc_V4', '全部', 'CH_B').k, wiw: App.rpt.res.hasWiw, dx: App.rpt.res.findings.wat[0]?.dx.verdict || '' }));
    ok(near(v.k, REF.rc_v4) && v.wiw, `Rc_V4 K ${v.k.toFixed(2)} = pandas, site data → within-wafer σ`);
    ok(/V4_CD/.test(v.dx) && /同向/.test(v.dx), `diagnosis cites same-layer V4_CD: ${v.dx}`);
  });
  await run(path.join(SD, 'variants', 'F_big_6x6.xlsx'), async (page, st) => {
    ok(st.cips.join() === 'FAB15,FAB12' && st.group === 'Part6', '6 products × 2 CIPs detected');
    const v = await page.evaluate(() => {
      const ov = document.querySelector('.pane.ov').getBoundingClientRect(), hl = document.querySelector('.pane.hl').getBoundingClientRect();
      return { dens: document.querySelector('#report .lt').className, side: hl.left > ov.right - 2, rows: document.querySelectorAll('#report .lt tbody tr:not(.cat):not(.sum)').length,
        blanks: [...document.querySelectorAll('#report .lt td.lc.green')].filter((t) => !t.textContent.trim()).length, abnTxt: [...document.querySelectorAll('#report .lt td.lc.orange')].every((t) => t.textContent.trim()),
        foot: document.querySelector('#report .lt tr.sum')?.children.length, items: App.rpt.res.items.filter((i) => i.kind === 'wat').length };
    });
    ok(v.dens === 'lt heat' && v.side, `23 items × 12 columns → auto heat-map tier, still beside the HL pane (${v.dens})`);
    ok(v.blanks > 100 && v.abnTxt && v.foot === 13, 'heat tier: green cells colour only, abnormal cells numbered, per-column abnormal count footer');
    await page.click('[data-rabn]'); await page.waitForTimeout(500);
    const r1 = await page.evaluate(() => document.querySelectorAll('#report .lt tbody tr:not(.cat):not(.sum)').length);
    ok(r1 < v.rows && r1 > 0, `只看異常 item: ${v.rows} → ${r1} rows`);
    await page.click('[data-rabn]'); await page.click('[data-rlayer="M1"]'); await page.waitForTimeout(500);
    const r2 = await page.evaluate(() => [...document.querySelectorAll('#report .lt td.item')].map((t) => t.textContent));
    ok(r2.length && r2.every((t) => /M1|異常格數/.test(t)), `layer filter M1 → ${r2.join(',')}`);
    await page.click('[data-rlayer="M1"]'); await page.click('#report tr.cat >> nth=0'); await page.waitForTimeout(400);
    const r3 = await page.evaluate(() => document.querySelectorAll('#report .lt tbody tr:not(.cat):not(.sum)').length);
    ok(r3 === v.rows - 6, `category collapse hides its 6 rows (${v.rows} → ${r3})`);
    await page.click('#report tr.cat >> nth=0');
    await page.click('[data-hlv=orange]'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => [...document.querySelectorAll('.hl-row .pill')].every((p) => p.classList.contains('orange'))), 'HL filter: orange only');
    await page.click('[data-dens=normal]'); await page.waitForTimeout(500);
    ok(await page.evaluate(() => document.querySelector('.dash').classList.contains('stack')), 'manual 標準 density on a wide table → stacked layout');
    await page.click('[data-dens=auto]'); await page.waitForTimeout(300);
    await page.setViewportSize({ width: 1366, height: 768 }); await page.waitForTimeout(600);
    ok(await page.evaluate(() => { const hl = document.querySelector('.pane.hl'); return hl.classList.contains('narrow') && hl.getBoundingClientRect().left > document.querySelector('.pane.ov').getBoundingClientRect().right - 2; }), '1366 px wide: HL pane narrows (single-column charts) but stays beside');
    await page.setViewportSize({ width: 1500, height: 950 });
  });
  await run(path.join(SD, 'variants', 'G_xlayer.xlsx'), async (page, st) => {
    ok(st.cond === 'Lot_Type' && st.base === 'BSL' && st.cips.join() === 'CIP' && st.group === 'Product', 'condition detected from VALUES (BSL/CIP) even though Product has fewer levels');
    ok(st.items['M2 DISH'] === 'topo/inline/k', 'dishing monitor classified as topography (inline)');
    const v = await page.evaluate(() => { const f = App.rpt.res.findings.wat.find((x) => x.cell.item.name === 'Rs_M3'); const cards = App.rptUI.crossChecks(f).map((d) => d.state + ':' + d.label + ' ' + d.icon + ' ' + d.text);
      return { v: f.dx.verdict, c0: f.dx.causes[0], k0: f.dx.checks[0], cards, fig: document.querySelector('#hlDet .hd-figs .fig:nth-child(2) .ft')?.innerText || '' }; });
    ok(/同層 .*未偏移；鄰層 M2 (THK|DISH)/.test(v.v) && /有關聯/.test(v.v) && !/topography/.test(v.v), `Rs_M3 verdict: same layer flat → adjacent M2 with r (${v.v.slice(0, 70)}…)`);
    ok(/M2 THK／dishing/.test(v.k0), 'cross-layer check listed first');
    const cz = await page.evaluate(() => [...document.querySelectorAll('.mech .mz')].map((t) => t.className.replace('mz ', '') + ':' + t.innerText.replace(/\s+/g, ' ')));
    ok(/^yes:✔ 下層 topography 繼承/.test(cz[0]) && /M2 DISH \+2\.[89]σ/.test(cz[0]) && cz.some((t) => /^no:✘ Cu 厚度偏薄/.test(t) && /M3 THK 未偏移/.test(t)), `mechanisms ranked by evidence: ${cz[0]} … ${cz[cz.length - 1]}`);
  });
  await run(path.join(SD, 'variants', 'H_longnames.xlsx'), async (page, st) => {
    ok(st.cond === 'FAB_Name' && st.base === 'FAB18_U%_BSL' && st.group === 'Product', 'user-like file: condition FAB_Name (values FAB18_U%_BSL / FAB15_U%_BSL)');
    ok(st.items['Mean(Item Value by Site, 07504.050 M15CUCMP_5, NOVA_THK)'] === 'thk/inline/k' && st.items['Mean(Item Value by Site, 07504.050 M15CUCMP_5, NOVA_THK_R)'] === 'other_inline/inline/k' && st.items['Mean(Con_M15)'] === 'rs/wat/k', 'long "Mean(Item Value by Site, …)" names: THK → thk, THK_R (range) → 其他（inline）, Mean(Con_M15) → rs');
    const v = await page.evaluate(() => { const f = App.rpt.res.findings.wat.find((x) => /Con_M15/.test(x.cell.item.name)); return { short: App.rules.parseName('Mean(Item Value by Site, 07504.050 M15CUCMP_5, NOVA_THK)').short, v: f.dx.verdict,
      cards: App.rptUI.crossChecks(f).map((d) => d.state + ':' + d.label + ' ' + d.icon + ' ' + d.text), cks: [...document.querySelectorAll('.cks li')].map((t) => t.className.replace('ck ', '') + ':' + t.innerText.replace(/\s+/g, ' ')) }; });
    ok(v.short === 'M15CUCMP_5 NOVA_THK', `long name shortened for display (${v.short})`);
    ok(/同層 .*未偏移/.test(v.v) && /鄰層 .*關聯弱/.test(v.v) && !/topography|pattern/.test(v.v), `adjacent-layer shift with r = 0.1 is reported as weak evidence, not as a mechanism claim (${v.v.slice(0, 80)}…)`);
    ok(v.cards.some((t) => /^warn:鄰層/.test(t) && /關聯弱/.test(t)) && v.cards.some((t) => /^warn:機台/.test(t) && /皆偏/.test(t)), `cards: 鄰層 △ 關聯弱, 機台 △ 6/6 皆偏 → ${v.cards.join(' | ')}`);
    ok(v.cks.some((t) => /^no:.*post-CMP THK/.test(t) && /未偏移/.test(t)) && v.cks.some((t) => /^need:.*trench CD/.test(t)), 'checks: THK ✘ (r strong but item not shifted), CD ○ missing');
    // check window → import the missing CD file by wafer id → the same window reopens with ✔
    const i = v.cks.findIndex((t) => /trench CD/.test(t));
    await page.evaluate((i) => document.querySelectorAll('.cks .ckz')[i].click(), i); await page.waitForSelector('.fwin [data-ck=imp]');
    ok(await page.evaluate(() => /沒有對應/.test(document.querySelector('.fwin .tw-v').innerText)), 'check window says the column is missing and offers import');
    await page.evaluate(() => { App.rpt.reopenCheck = null; document.querySelector('.fwin [data-ck=imp]').click(); });
    await page.setInputFiles('#file2', path.join(SD, 'variants', 'H_link_M15CD.xlsx')); await page.waitForTimeout(3000);
    const after = await page.evaluate(() => ({ v: document.querySelector('.fwin .tw-v')?.innerText || '', rate: App.rpt.links[0]?.rate, cks: [...document.querySelectorAll('.cks li')].map((t) => t.className.replace('ck ', '') + ':' + t.innerText.replace(/\s+/g, ' ')), cards: App.rptUI.crossChecks(App.rpt.res.findings.wat[App.rpt.hl.wat]).map((d) => d.state + ':' + d.label + ' ' + d.icon + ' ' + d.text) }));
    ok(after.rate > 0.75 && /M15 CD AEI/.test(after.v) && /有關聯/.test(after.v), `linked M15 CD (UAB001-02 ↔ UAB001.02, ${Math.round(after.rate * 100)}% matched) → window reopens: ${after.v.slice(0, 60)}`);
    ok(after.cks.some((t) => /^ok:.*trench CD/.test(t) && /有關聯/.test(t)) && after.cards.some((t) => /^ok:Inline/.test(t) && /M15 CD AEI/.test(t)), 'check row and Inline card turn ✔ after the import');
    await page.keyboard.press('Escape');
  });
  // ---- v3.2 pre-processing: unit mismatch, duplicated wafers, extreme outliers; text dates in two formats; per-CIP tool confounding
  await run(path.join(SD, 'variants', 'J_fabrun.xlsx'), async (page, st) => {
    const p0 = await page.evaluate(() => ({ pend: App.rptUI.prepPending(), date: App.rpt.cfg.dateCol, range: App.rpt.res.dateRange?.map((d) => d.toISOString().slice(0, 10)), hl: App.rpt.res.findings.wat.map((f) => f.dx.title), banner: document.querySelector('.prep-warn')?.innerText || '' }));
    console.log('fabrun:', JSON.stringify(p0));
    ok(p0.date === 'WAT_DATE' && p0.range && p0.range[0] === '2026-04-01' && /2026-09-2\d/.test(p0.range[1]), 'text dates in two formats (2026/04/01 08:00, 01-08-2026 08:00) parsed into one date column');
    ok(p0.pend.units === 2 && /疑似單位不同 2/.test(p0.banner) && p0.hl.some((t) => /Rs_M3.*>\+10σ/.test(t)), 'Rs ×1000 and yield fraction flagged as unit suspects; |K| ≥ 10 shown as >10σ');
    ok(p0.pend.outl <= 3 && p0.pend.outl >= 1, `Rc campaign tail is NOT flagged as outliers (${p0.pend.outl} isolated points only)`);
    await page.click('#tabs button[data-tab=prep]'); await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelector('[data-scale]').click()); await page.waitForTimeout(900);
    await page.evaluate(() => document.querySelector('[data-scale]').click()); await page.waitForTimeout(900);
    const p1 = await page.evaluate(() => { document.querySelector('#kbOn').click(); const r = App.rpt.res; return { pend: App.rptUI.prepPending(), rs: r.cells.Rs_M3.P1['CIP-B'].k, yl: r.cells.Yield.P1['CIP-B'].k, hl: r.findings.wat.map((f) => f.dx.title), sm: App.rptUI.summary() }; });
    ok(p1.pend.units === 0 && Math.abs(p1.rs) < 3 && Math.abs(p1.yl) < 3 && !p1.hl.some((t) => /Rs_M3/.test(t)), `one-click scale: Rs K ${p1.rs.toFixed(2)}σ, Yield K ${p1.yl.toFixed(2)}σ, Rs no longer an HL`);
    ok(/CIP 走的機台沒有 BSL 可對照/.test(p1.sm) && !/皆偏/.test(p1.sm), 'tool verdict: CIP-only chambers → 無法分辨, never 皆偏');
    ok(/○ 鄰層 M3 THK（CIP-B 無資料）/.test(p1.sm) && !/✔ .*M3 THK/.test(p1.sm), 'grey partner cell → ○ 缺資料, not ✔');
    ok(/建議檢查（全部 HL 共同）/.test(p1.sm) && /資料品質：CIP-C 在 P2 沒有 wafer/.test(p1.sm) && !/知識庫 base/.test(p1.sm), 'summary: common checks printed once, data quality merged, no KB version line when KB is off');
    await page.evaluate(() => document.querySelector('#kbOn').click());
    await page.evaluate(() => document.querySelector('[data-pexcl]').click()); await page.waitForTimeout(900);
    const p2 = await page.evaluate(() => ({ pend: App.rptUI.prepPending() }));
    await page.click('#tabs button[data-tab=report]'); await page.waitForTimeout(500);
    ok(p2.pend.outl === 0 && p2.pend.total === 0 && !(await page.evaluate(() => document.querySelector('.prep-warn'))), 'outliers removed → nothing pending, banner gone');
    await page.click('#tabs button[data-tab=prep]'); await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('[data-prestore]').click()); await page.waitForTimeout(900);
    ok((await page.evaluate(() => App.rptUI.prepPending().outl)) >= 1, 'restore brings the points back');
  });
  await run(path.join(SD, 'variants', 'I_trap.xlsx'), async (page, st) => {
    const p0 = await page.evaluate(() => ({ pend: App.rptUI.prepPending(), bn: App.rpt.res.cells['Rs_M1 (ohm/sq)'].G1['CIP-A'].bn, dups: App.rpt.prepScan.dups.map((d) => d.wafer + ':' + d.n) }));
    ok(p0.pend.dups === 1 && p0.bn === 121, `duplicated wafer detected (${p0.dups.join(',')}), counted twice until the user decides`);
    await page.click('#tabs button[data-tab=prep]'); await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelector('[data-dup=mean]').click()); await page.waitForTimeout(900);
    const p1 = await page.evaluate(() => ({ pend: App.rptUI.prepPending(), bn: App.rpt.res.cells['Rs_M1 (ohm/sq)'].G1['CIP-A'].bn, nw: App.rpt.res.nWafer.POR }));
    ok(p1.pend.dups === 0 && p1.bn === 120 && p1.nw === 240, 'dup → 取平均: BSL N 120, wafer count 240');
    const foot = await page.evaluate(() => { document.querySelector('#tabs button[data-tab=report]').click(); return document.querySelector('.lt tr.sum')?.innerText || ''; });
    ok(/橘 \d/.test(foot) && !/\d\+\d/.test(foot), `lights-table footer reads 橘 n 黃 n (${foot.replace(/\s+/g, ' ').slice(0, 60)})`);
  });
  // ---- v3.4 condition style: layer order, colours, highlight — six conditions
  await run(path.join(SD, 'variants', 'K_sixcond.xlsx'), async (page, st) => {
    ok(st.cips.length === 5 && st.base === 'POR', `six conditions detected (${st.cips.join(',')} vs ${st.base})`);
    const v0 = await page.evaluate(() => ({ order: App.rpt.vis.order, chips: [...document.querySelectorAll('.cchip')].map((x) => x.dataset.cond), bottom: document.querySelector('#hlDet .fig .plot.js-plotly-plot').data.filter((d) => d.meta && d.meta.cond).map((d) => d.meta.cond) }));
    ok(v0.order[v0.order.length - 1] === 'POR' && v0.chips.join() === v0.order.join() && v0.bottom[0] === 'POR' && v0.bottom[v0.bottom.length - 1] === 'CIP1', `default layer order: BSL at the bottom, first CIP on top (${v0.bottom.join('<')})`);
    await page.evaluate(() => { const a = document.querySelector('.cchip[data-cond=CIP3]'), b = document.querySelector('.cchip[data-cond=CIP1]'); const dt = new DataTransfer(); a.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true })); b.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true })); b.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true })); a.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true })); });
    await page.waitForTimeout(800);
    const v1 = await page.evaluate(() => ({ order: App.rpt.vis.order, top: document.querySelector('#hlDet .fig .plot.js-plotly-plot').data.filter((d) => d.meta && d.meta.cond).map((d) => d.meta.cond).pop(), stored: JSON.parse(localStorage.getItem('pdat:rpt-vis')).order }));
    ok(v1.order[0] === 'CIP3' && v1.top === 'CIP3' && v1.stored[0] === 'CIP3', 'drag CIP3 to the front → it is drawn on top of every live chart, order persisted');
    await page.evaluate(() => document.querySelector('.cchip[data-cond=CIP2] .dot').click()); await page.waitForTimeout(300);
    ok(await page.evaluate(() => !!document.querySelector('.cpop') && document.querySelectorAll('.cpop .sw').length >= 8 && !!document.querySelector('.cpop .cp-hex') && !!document.querySelector('.cpop input[type=color]')), 'colour popover: swatches + hex field + native picker');
    await page.evaluate(() => { const i = document.querySelector('.cpop .cp-hex'); i.value = '#009900'; i.dispatchEvent(new Event('change')); }); await page.waitForTimeout(600);
    const v2 = await page.evaluate(() => ({ col: App.rpt.vis.colors.CIP2, mk: document.querySelector('#hlDet .fig .plot.js-plotly-plot').data.find((d) => d.meta && d.meta.cond === 'CIP2' && d.marker).marker.color, dot: document.querySelector('.cchip[data-cond=CIP2] .dot').style.background }));
    ok(v2.col === '#009900' && v2.mk === '#009900' && /0, 153, 0/.test(v2.dot), 'hex entry recolours CIP2 on the chart and the chip');
    await page.evaluate(() => { const gd = document.querySelector('#hlDet .fig .plot.js-plotly-plot'); const i = gd.data.findIndex((d) => d.meta && d.meta.cond === 'CIP3'); gd.emit('plotly_legendclick', { curveNumber: i, data: gd.data }); }); await page.waitForTimeout(600);
    const v3 = await page.evaluate(() => { const gd = document.querySelector('#hlDet .fig .plot.js-plotly-plot'); return { hi: [...App.rpt.vis.hi], dim: gd.data.filter((d) => d.meta && d.meta.cond && d.meta.cond !== 'CIP3').every((d) => d.opacity < 0.2), full: gd.data.filter((d) => d.meta && d.meta.cond === 'CIP3').every((d) => d.opacity === 1), hidden: gd.data.some((d) => d.visible === 'legendonly') }; });
    ok(v3.hi.join() === 'CIP3' && v3.dim && v3.full && !v3.hidden, 'legend click = highlight CIP3 (others dimmed, nothing hidden)');
    await page.evaluate(() => { const gd = document.querySelector('#hlDet .fig .plot.js-plotly-plot'); gd.emit('plotly_legenddoubleclick', {}); }); await page.waitForTimeout(500);
    ok(await page.evaluate(() => App.rpt.vis.hi.size === 0 && document.querySelector('#hlDet .fig .plot.js-plotly-plot').data.every((d) => !d.meta || !d.meta.cond || d.opacity === 1)), 'legend double-click clears the highlight');
    const tms = await page.evaluate(() => { const t0 = performance.now(); App.rptUI.applyVis(); return Math.round(performance.now() - t0); });
    ok(tms < 1500, `live restyle of the visible page stays responsive (${tms} ms)`);
  });
  await run(path.join(SD, 'variants', 'E_single_cond.xlsx'), async (page, st) => {
    ok(st.tab === 'tab-setup' && !st.hasRes, `single condition → no fake report, asks in setup (${st.msg.trim()})`);
  });
  await browser.close();
})();
