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
    const fx = await page.evaluate(() => { const d = [...document.querySelectorAll('.xcs .xc')].find((d) => d.querySelector('.xl').innerText === '機台'); return d ? { state: d.className.replace('xc ', ''), txt: d.querySelector('.xt').innerText } : null; });
    ok(fx && fx.state !== 'ok' && /皆偏|非 tool-specific/.test(fx.txt), `whole-CIP shift (−9.5σ on both tools) is NOT blamed on a tool (${fx?.txt})`);
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
    const v = await page.evaluate(() => { const f = App.rpt.res.findings.wat.find((x) => x.cell.item.name === 'Rs_M3'); const cards = [...document.querySelectorAll('.xcs .xc')].map((d) => d.className.replace('xc ', '') + ':' + d.innerText.replace(/\s+/g, ' '));
      return { v: f.dx.verdict, c0: f.dx.causes[0], k0: f.dx.checks[0], cards, fig: document.querySelector('#hlDet .hd-figs .fig:nth-child(2) .ft')?.innerText || '' }; });
    ok(/同層 .*未偏移；鄰層 M2 (THK|DISH)/.test(v.v) && /有關聯/.test(v.v) && !/topography/.test(v.v), `Rs_M3 verdict: same layer flat → adjacent M2 with r (${v.v.slice(0, 70)}…)`);
    ok(/M2 THK／dishing/.test(v.k0), 'cross-layer check listed first');
    const cz = await page.evaluate(() => [...document.querySelectorAll('.mech .mz')].map((t) => t.className.replace('mz ', '') + ':' + t.innerText.replace(/\s+/g, ' ')));
    ok(/^yes:✔ 下層 topography 繼承/.test(cz[0]) && /M2 DISH \+2\.8\dσ/.test(cz[0]) && cz.some((t) => /^no:✘ Cu 厚度偏薄/.test(t) && /M3 THK 未偏移/.test(t)), `mechanisms ranked by evidence: ${cz[0]} … ${cz[cz.length - 1]}`);
  });
  await run(path.join(SD, 'variants', 'H_longnames.xlsx'), async (page, st) => {
    ok(st.cond === 'FAB_Name' && st.base === 'FAB18_U%_BSL' && st.group === 'Product', 'user-like file: condition FAB_Name (values FAB18_U%_BSL / FAB15_U%_BSL)');
    ok(st.items['Mean(Item Value by Site, 07504.050 M15CUCMP_5, NOVA_THK)'] === 'thk/inline/k' && st.items['Mean(Item Value by Site, 07504.050 M15CUCMP_5, NOVA_THK_R)'] === 'other_inline/inline/k' && st.items['Mean(Con_M15)'] === 'rs/wat/k', 'long "Mean(Item Value by Site, …)" names: THK → thk, THK_R (range) → 其他（inline）, Mean(Con_M15) → rs');
    const v = await page.evaluate(() => { const f = App.rpt.res.findings.wat.find((x) => /Con_M15/.test(x.cell.item.name)); return { short: App.rules.parseName('Mean(Item Value by Site, 07504.050 M15CUCMP_5, NOVA_THK)').short, v: f.dx.verdict,
      cards: [...document.querySelectorAll('.xcs .xc')].map((d) => d.className.replace('xc ', '') + ':' + d.innerText.replace(/\s+/g, ' ')), cks: [...document.querySelectorAll('.cks li')].map((t) => t.className.replace('ck ', '') + ':' + t.innerText.replace(/\s+/g, ' ')) }; });
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
    const after = await page.evaluate(() => ({ v: document.querySelector('.fwin .tw-v')?.innerText || '', rate: App.rpt.links[0]?.rate, cks: [...document.querySelectorAll('.cks li')].map((t) => t.className.replace('ck ', '') + ':' + t.innerText.replace(/\s+/g, ' ')), cards: [...document.querySelectorAll('.xcs .xc')].map((d) => d.className.replace('xc ', '') + ':' + d.innerText.replace(/\s+/g, ' ')) }));
    ok(after.rate > 0.75 && /M15 CD AEI/.test(after.v) && /有關聯/.test(after.v), `linked M15 CD (UAB001-02 ↔ UAB001.02, ${Math.round(after.rate * 100)}% matched) → window reopens: ${after.v.slice(0, 60)}`);
    ok(after.cks.some((t) => /^ok:.*trench CD/.test(t) && /有關聯/.test(t)) && after.cards.some((t) => /^ok:Inline/.test(t) && /M15 CD AEI/.test(t)), 'check row and Inline card turn ✔ after the import');
    await page.keyboard.press('Escape');
  });
  await run(path.join(SD, 'variants', 'E_single_cond.xlsx'), async (page, st) => {
    ok(st.tab === 'tab-setup' && !st.hasRes, `single condition → no fake report, asks in setup (${st.msg.trim()})`);
  });
  await browser.close();
})();
