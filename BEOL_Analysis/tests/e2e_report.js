// BEOL report end-to-end: WAT module (K / LK fold / SPA fixed value) + Inline module (mean / W2W / WIW / radial)
// dashboard, group switch, floating windows, trend matrix, HTML + PPT export
// run: node tests/e2e_report.js     (needs python3 + pandas for the independent reference values)
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const HTML = 'file://' + [path.join(ROOT, 'dist', 'BEOL_Report.html'), path.join(ROOT, 'BEOL_Report.html')].find((p) => fs.existsSync(p));
const WAT = path.join(ROOT, 'sample_data', 'WAT_FAB_compare.xlsx');
const INL = path.join(ROOT, 'sample_data', 'INLINE_FAB_compare.xlsx');
const SHOT = process.env.SHOT_DIR || path.join(ROOT, 'tests', 'shots');
const REF = JSON.parse(execSync(`python3 "${path.join(__dirname, 'expected_beol.py')}"`).toString());

(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const near = (a, b, tol = 0.01) => a != null && Math.abs(a - b) < tol;
  await page.goto(HTML);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.screenshot({ path: `${SHOT}/r0_empty.png` });

  // ================================================================ WAT module
  await page.setInputFiles('#file', WAT);
  await page.waitForSelector('#tab-report.active .lt', { timeout: 30000 });
  const cfg = await page.evaluate(() => { const c = App.rpt.cfg; return { mode: App.rpt.mode, group: c.groupCol, cond: c.condCol, base: c.baseline, cips: c.cips,
    items: c.items.map((i) => `${App.rules.parseName(i.name).short}:${i.cat}:${i.kind}:${i.metric}:${i.target ?? ''}`) }; });
  console.log('auto config:', JSON.stringify(cfg));
  ok(cfg.mode === 'wat' && cfg.group === 'Part6' && /Current FAB Name/.test(cfg.cond) && cfg.base === 'FAB18' && cfg.cips.join() === 'FAB15', 'auto-detected module / group / condition / baseline / CIP');
  ok(cfg.items.filter((s) => s.includes(':wat:')).length === 8 && cfg.items.filter((s) => s.includes(':inline:')).length === 6, '8 WAT + 6 inline items classified');
  ok(cfg.items.filter((s) => /^LK_.*:lk:wat:fold:/.test(s)).length === 2, 'LK items → fold metric');
  ok(cfg.items.filter((s) => /^SPA_.*:spa:wat:rate:20$/.test(s)).length === 2, 'SPA items → fixed-value metric, target 20 V');

  const W = await page.evaluate(() => {
    const r = App.rpt.res, g = (it, gp) => r.cells[r.items.find((i) => i.name.startsWith(it)).name][gp].FAB15;
    const pick = (x) => ({ k: x.k, fold: x.fold, rateC: x.rateC, rateB: x.rateB, level: x.level, reason: x.reason, text: x.text });
    return { rc: pick(g('Rc_V12', 'TMTQ11')), con: pick(g('Con_M13', 'TMWF54')), lk: pick(g('LK_M12', 'TMRX12')), spa12: pick(g('SPA_M12', 'TMRX12')), spa13: pick(g('SPA_M13', 'TMRX12')),
      spaNa: pick(g('SPA_M13', 'TMRF89')), cnt: r.cnt.wat };
  });
  console.log('cells:', JSON.stringify(W));
  const R = REF.wat;
  ok(near(W.rc.k, R.rc_TMTQ11) && W.rc.level === 'orange', `Rc_V12@TMTQ11 K=${W.rc.k?.toFixed(2)} (pandas ${R.rc_TMTQ11.toFixed(2)}) orange`);
  ok(near(W.con.k, R.con_TMWF54) && W.con.level === 'yellow', `Con_M13@TMWF54 K=${W.con.k?.toFixed(2)} (pandas ${R.con_TMWF54.toFixed(2)}) yellow`);
  ok(near(W.lk.fold, R.lk_TMRX12) && W.lk.level === 'yellow', `LK_M12@TMRX12 fold ×${W.lk.fold?.toFixed(2)} (pandas ×${R.lk_TMRX12.toFixed(2)}) yellow (×2–×5)`);
  ok(near(W.spa12.rateC, R.spa12_TMRX12[0], 1e-6) && near(W.spa12.rateB, R.spa12_TMRX12[1], 1e-6) && W.spa12.level === 'orange',
    `SPA_M12@TMRX12 fail ${(W.spa12.rateC * 100).toFixed(1)}% vs BSL ${(W.spa12.rateB * 100).toFixed(1)}% (pandas match) orange`);
  ok(near(W.spa13.rateC, R.spa13_TMRX12[0], 1e-6) && W.spa13.level === 'orange', `SPA_M13@TMRX12 fail ${(W.spa13.rateC * 100).toFixed(1)}% orange`);
  ok(W.spaNa.level === 'na' && /無資料/.test(W.spaNa.reason), `SPA_M13@TMRF89 grey with reason: ${W.spaNa.reason}`);

  // wording from the diagnosis engine (shown in the HL detail pane)
  const words = await page.evaluate(() => App.rpt.res.findings.wat.map((f) => [f.dx.title, f.dx.mean, f.dx.verdict, f.dx.causes.join('、')].join(' ｜ ')));
  words.forEach((w) => console.log('   ▸ ' + w.slice(0, 200)));
  ok(words.some((w) => /Rc_V12/.test(w) && /V12 CD/.test(w) && /同向/.test(w)), 'Rc finding cites V12 CD as consistent inline evidence');
  ok(words.some((w) => /LK_M12/.test(w) && /×2\.9/.test(w) && /M12 CD/.test(w)), 'LK finding shows fold and cites M12 CD');
  ok(words.some((w) => /SPA_M12/.test(w) && /異常比例/.test(w) && /M12 CD/.test(w)), 'SPA finding (fail rate) cites M12 CD');

  // ---- dashboard: lights show only the number (no arrow, no N)
  const L = await page.evaluate(() => [...document.querySelectorAll('#report .lt td.lc')].map((td) => td.textContent.trim()));
  ok(L.length === 32 && L.every((t) => /^([+−]\d+\.\d\dσ|×\d+\.\d\d|[+−]\d+\.\d%pt|—)$/.test(t)), `overview lights show one number only (${L.slice(0, 6).join(' ')} …)`);
  const dash = await page.evaluate(() => {
    const ov = document.querySelector('.pane.ov').getBoundingClientRect(), hl = document.querySelector('.pane.hl').getBoundingClientRect();
    return { side: hl.left > ov.right - 2, rows: document.querySelectorAll('.hl-row').length, det: document.querySelectorAll('#hlDet .js-plotly-plot').length };
  });
  ok(dash.side && dash.rows === 6 && dash.det === 2, `dashboard: overview table and HL pane side by side, ${dash.rows} HL rows, ${dash.det} detail charts`);
  // HL navigation: pick the LK item → detail shows log-axis trend
  const lkIdx = await page.evaluate(() => App.rpt.res.findings.wat.findIndex((f) => f.cell.item.name.startsWith('LK_M12')));
  await page.click(`.hl-row[data-hl="${lkIdx}"]`);
  await page.waitForTimeout(500);
  const lk = await page.evaluate(() => document.querySelector('#hlDet .fig .js-plotly-plot')?.layout.yaxis.type);
  ok(lk === 'log', `LK trend uses log y-axis (${lk})`);
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(300);
  ok(await page.evaluate((i) => App.rpt.hl.wat === i + 1, lkIdx), 'arrow key moves to the next HL');
  await page.screenshot({ path: `${SHOT}/r1_wat_report.png` });

  // ---- group column is user-selectable on the report: no grouping → one column
  await page.selectOption('#rGroup', '');
  await page.waitForTimeout(800);
  const g0 = await page.evaluate(() => ({ groups: App.rpt.res.groups, cols: document.querySelectorAll('#report .lt thead th').length }));
  ok(g0.groups.join() === '全部' && g0.cols === 2, `group = none → ${g0.cols - 1} result column`);
  await page.selectOption('#rGroup', 'Part6');
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => App.rpt.res.groups.length === 4), 'group back to Part6 → 4 columns');

  // ---- floating windows: click lights → non-modal windows, several at once, resizable
  await page.click('#report .lt td.lc.orange >> nth=0');
  await page.waitForSelector('.fwin .js-plotly-plot');
  await page.evaluate(() => document.querySelectorAll('#report .lt td.lc.yellow')[0].click());
  await page.waitForTimeout(600);
  const fw = await page.evaluate(() => [...document.querySelectorAll('.fwin')].map((w) => ({ x: w.offsetLeft, w: w.offsetWidth })));
  ok(fw.length === 2 && fw[1].x > fw[0].x + fw[0].w / 2, `two floating windows open side by side (${fw.map((w) => w.x).join(', ')})`);
  ok(await page.evaluate(() => { const b = document.querySelector('.hl-row'); const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + 5, r.top + 5); return !!top; }), 'page underneath stays interactive (no modal overlay)');
  const before = await page.evaluate(() => document.querySelector('.fwin .js-plotly-plot')._fullLayout.width);
  await page.click('.fwin >> nth=0 >> [data-fw=max]');
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => document.querySelector('.fwin .js-plotly-plot')._fullLayout.width);
  ok(after > before + 200, `maximise → chart re-sized (${before} → ${after} px)`);
  await page.screenshot({ path: `${SHOT}/r2_windows.png` });
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  ok(await page.evaluate(() => document.querySelectorAll('.fwin').length === 0), 'Esc closes windows');

  const txt = await page.evaluate(() => App.rptUI.summary());
  console.log('--- WAT summary ---\n' + txt.split('\n').slice(0, 6).join('\n'));
  ok(/LK 綠 ≤ ×2/.test(txt) && /SPA/.test(txt), 'summary states LK × and SPA thresholds');

  // ---- trend matrix
  await page.click('#tabs button[data-tab=trend]');
  await page.waitForTimeout(1500);
  const tc = await page.evaluate(() => ({ rows: document.querySelectorAll('.tmx .rh').length, cells: document.querySelectorAll('.tmx .mc').length, drawn: document.querySelectorAll('.tmx .mc .js-plotly-plot').length }));
  ok(tc.rows === 5 && tc.cells === 20 && tc.drawn > 0, `trend matrix (abnormal): ${tc.rows} items × 4 groups, ${tc.drawn} drawn lazily`);
  await page.click('.chip[data-mode=all]'); await page.waitForTimeout(600);
  ok(await page.evaluate(() => document.querySelectorAll('.tmx .mc').length === 32), 'trend matrix all WAT: 8 × 4 = 32');
  await page.click('.tmx .mc >> nth=0');
  await page.waitForSelector('.fwin .js-plotly-plot');
  ok(true, 'matrix cell → floating window');
  await page.screenshot({ path: `${SHOT}/r3_trend.png` });
  await page.evaluate(() => App.rptUI.closeAllWins());

  // ---- correlation
  await page.click('#tabs button[data-tab=corr]');
  await page.waitForTimeout(1000);
  const co = await page.evaluate(() => ({ pairs: [...document.querySelectorAll('.pair')].map((p) => p.innerText.split('\n')[0]), stat: document.getElementById('cStat').innerText }));
  console.log('pairs:', co.pairs.slice(0, 6).join(' | '));
  ok(co.pairs.length >= 6 && /異常/.test(co.pairs[0]), 'auto pairs listed, abnormal first');
  ok(/方向符合物理預期/.test(co.stat), 'physics sign check passes');
  await page.screenshot({ path: `${SHOT}/r4_corr.png` });

  // ---- thresholds: LK orange at ×2.5 → LK becomes orange
  await page.click('#tabs button[data-tab=report]');
  await page.fill('#fO', '2.5'); await page.press('#fO', 'Tab');
  await page.waitForTimeout(800);
  const lk2 = await page.evaluate(() => { const r = App.rpt.res; return r.cells[r.items.find((i) => i.name.startsWith('LK_M12')).name].TMRX12.FAB15.level; });
  ok(lk2 === 'orange', `LK threshold ×2.5 → LK_M12@TMRX12 ${lk2}`);
  await page.fill('#fO', '5'); await page.press('#fO', 'Tab'); await page.waitForTimeout(800);

  // ---- HTML export
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#btnHtml')]);
  const out = path.join(SHOT, 'exported_wat_report.html');
  await dl.saveAs(out);
  const html = fs.readFileSync(out, 'utf8');
  const imgs = (html.match(/<img src="data:image\/png;base64,/g) || []).length;
  ok(imgs >= 10 && !/plotly\.min/.test(html), `exported standalone HTML: ${(html.length / 1e6).toFixed(2)} MB, ${imgs} embedded charts`);

  // ---- PPT export (WAT + Inline columns of the same file)
  const [dp] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.click('#btnPpt')]);
  const pout = path.join(SHOT, 'exported_report.pptx');
  await dp.saveAs(pout);
  const info = JSON.parse(execSync(`python3 -c "
import json,sys
from pptx import Presentation
p=Presentation(sys.argv[1])
out=[]
for s in p.slides:
  t=[sh.text_frame.text for sh in s.shapes if sh.has_text_frame and sh.text_frame.text.strip()]
  out.append({'title':t[0] if t else '','tables':sum(1 for sh in s.shapes if sh.has_table),'pics':sum(1 for sh in s.shapes if sh.shape_type==13)})
print(json.dumps(out,ensure_ascii=False))" "${pout}"`).toString());
  console.log('ppt slides:', info.map((x) => `${x.title}[t${x.tables}/p${x.pics}]`).join(' | '));
  const has = (rx, f) => info.some((x) => rx.test(x.title) && f(x));
  ok(has(/WAT 點燈表/, (x) => x.tables === 1), 'PPT: WAT light table (native table)');
  ok(has(/WAT HL/, (x) => x.pics === 2), 'PPT: WAT HL slides with trend + correlation');
  ok(has(/WAT 總覽 Trend/, (x) => x.pics >= 8), 'PPT: WAT overview trend matrix');
  ok(has(/Inline 點燈表/, (x) => x.tables === 1) && has(/Inline HL/, (x) => x.pics >= 1) && has(/Inline 總覽 Trend/, (x) => x.pics >= 8), 'PPT: Inline light table, HL and overview trend');

  // ---- commonality: factor scan on Rc_V12 @ TMTQ11 (tool labels were assigned so CH_B carries the shift)
  const fi = await page.evaluate(() => App.rpt.res.findings.wat.findIndex((f) => f.cell.item.name.startsWith('Rc_V12')));
  await page.click(`.hl-row[data-hl="${fi}"]`); await page.waitForTimeout(600);
  const xc = await page.evaluate(() => [...document.querySelectorAll('.xcs .xc')].map((d) => ({ label: d.querySelector('.xl').innerText, state: d.className.replace('xc ', ''), txt: d.querySelector('.xt').innerText })));
  console.log('cross-checks:', xc.map((x) => `${x.label}:${x.state}:${x.txt}`).join(' | '));
  const tool = xc.find((x) => x.label === '機台');
  ok(tool && tool.state === 'ok' && /V12_ETCH_CH：CH_B/.test(tool.txt) && /CIP \d+% 走 CH_B/.test(tool.txt) && !/p ?=/.test(tool.txt), `tool card: one-line verdict, no p-values (${tool?.txt})`);
  ok(xc.find((x) => x.label === 'Inline')?.state === 'ok' && /V12 CD AEI/.test(xc.find((x) => x.label === 'Inline').txt) && /r = −0\.\d+/.test(xc.find((x) => x.label === 'Inline').txt), 'Inline card: WAT ↔ inline line up, r shown');
  ok(xc.find((x) => x.label === 'Yield')?.state === 'ok' && /Bin7_open/.test(xc.find((x) => x.label === 'Yield').txt), 'Yield card lists abnormal yield items only');
  // evidence-ranked mechanisms (v2.7／v2.8: demoted to one line under the single check list)
  const cz = await page.evaluate(() => [...document.querySelectorAll('.mech .mz')].map((t) => ({ st: t.className.replace('mz ', ''), t: t.innerText.replace(/\s+/g, ' ') })));
  ok(cz[0].st === 'yes' && /Via CD 偏小/.test(cz[0].t) && /V12 CD AEI −2\.79σ/.test(cz[0].t), `mechanisms: supported cause first with its evidence (${cz[0].t})`);
  ok(cz.filter((x) => x.st === 'no').length >= 1 && cz.every((x, i) => i === 0 || ({ yes: 0, na: 1, no: 2 })[x.st] >= ({ yes: 0, na: 1, no: 2 })[cz[i - 1].st]), 'mechanisms: order yes → no-data → contradicted (greyed)');
  // single check list (v2.8): every row has a status, an evidence note and opens the check window
  const cks = await page.evaluate(() => [...document.querySelectorAll('.cks li')].map((t) => ({ k: t.className.replace('ck ', ''), a: t.querySelector('a')?.innerText || '', n: t.querySelector('.cn')?.innerText || '', z: !!t.querySelector('.ckz') })));
  console.log('checks:', cks.map((x) => `${x.k}:${x.a}:${x.n}`).join(' | '));
  ok(cks.some((x) => x.k === 'ok' && /V12 via CD/i.test(x.a) && /r = −0\.8\d 有關聯/.test(x.n)) && cks.some((x) => x.k === 'ok' && /chamber/i.test(x.a) && /CH_B/.test(x.n)) && cks.some((x) => x.k === 'need' && /匯入/.test(x.n)), 'checks: ✔ inline with r, ✔ tool hit, ○ missing data → import');
  ok(cks.every((x) => x.z) && cks.length <= 6, 'every check row opens the check window (🔍)');
  await page.evaluate(() => document.querySelectorAll('.cks .ckz')[0].click()); await page.waitForSelector('.fwin #ckCorr.js-plotly-plot'); await page.waitForTimeout(500);
  const ckw = await page.evaluate(() => ({ v: document.querySelector('.fwin .tw-v').innerText, x: document.querySelector('.fwin [data-ck=x]').value, trend: !!document.querySelector('.fwin #ckTrend.js-plotly-plot'), imp: !!document.querySelector('.fwin [data-ck=imp]') }));
  ok(/V12 CD AEI/.test(ckw.x) && /r = −0\.8\d/.test(ckw.v) && /有關聯/.test(ckw.v) && /方向與物理預期一致/.test(ckw.v) && ckw.trend && ckw.imp, `check window: X auto = V12 CD AEI, verdict with r + direction, resonance trend, import button (${ckw.v.slice(0, 60)})`);
  await page.evaluate(() => { document.querySelector('.fwin [data-ck=x]').value = 'M12 THK~A'; document.querySelector('.fwin [data-ck=x]').dispatchEvent(new Event('change')); }); await page.waitForTimeout(500);
  ok(await page.evaluate(() => /關聯性不大|弱關聯/.test(document.querySelector('.fwin .tw-v').innerText)), 'user can switch X; unrelated item → 關聯性不大');
  await page.keyboard.press('Escape');
  // tool analysis window: verdict line + run-rate bars (no table) + weekly chart + box plot with K annotations
  await page.evaluate(() => document.querySelector('.xcs .xc[data-xc]:nth-child(2)') && [...document.querySelectorAll('.xcs .xc')].find((d) => d.querySelector('.xl').innerText === '機台').click());
  await page.waitForSelector('.fwin #twBox.js-plotly-plot'); await page.waitForTimeout(700);
  const tw = await page.evaluate(() => { const w = document.querySelector('.fwin'); const bx = w.querySelector('#twBox'), wk = w.querySelector('#twWeek'); return {
    verdict: w.querySelector('.tw-v')?.innerText || '', table: !!w.querySelector('table'), rate: !!w.querySelector('#twRate.js-plotly-plot'),
    week: !!wk?._fullLayout, weekTraces: wk?.data?.length || 0, weekShapes: (wk?._fullLayout?.shapes || []).length, span: w.querySelector('#twSpan')?.innerText || '',
    ann: (bx._fullLayout.annotations || []).map((a) => a.text), ticks: bx._fullLayout.xaxis.ticktext || [], order: bx._fullLayout.xaxis.categoryarray || [] }; });
  console.log('tool window:', JSON.stringify({ v: tw.verdict, ann: tw.ann, span: tw.span.slice(0, 80) }));
  ok(/CH_B/.test(tw.verdict) && !tw.table, `tool window: verdict line, no table (${tw.verdict.slice(0, 50)})`);
  ok(tw.rate && tw.week && tw.weekTraces >= 2 && tw.weekShapes >= 1, 'run-rate % bars + weekly run chart with CIP-period shading');
  ok(tw.ann.some((t) => /[+−-]\d\.\d+σ/.test(t)) && tw.ann.length >= 2, `K-shift per tool annotated on the box plot (${tw.ann.join(', ')})`);
  ok(tw.ticks.length && /n \d+ ?\/ ?\d+|\d+ \/ \d+/.test(String(tw.ticks[0])) , `tick labels carry n BSL / CIP (${tw.ticks[0]})`);
  ok(tw.order[0] === 'CH_B' && /\+3\.5\dσ/.test(tw.ann[0] || ''), `worst level (CH_B) is ordered first (${tw.order.join(' > ')})`);
  await page.evaluate(() => document.querySelector('.fwin [data-tc="M12_CMP_Tool"]').click()); await page.waitForTimeout(700);
  const tw2 = await page.evaluate(() => document.querySelector('.fwin #twBox')._fullLayout.xaxis.categoryarray || []);
  ok(tw2.length === 4 && tw2.some((n) => /CH_B × CMP02/.test(n)), `composite grouping V12_ETCH_CH × M12_CMP_Tool → 4 levels (${tw2.join(', ')})`);
  await page.screenshot({ path: `${SHOT}/r7_factor.png` }); await page.keyboard.press('Escape');
  const fj = await page.evaluate(() => App.rpt.res.findings.wat.findIndex((f) => f.cell.item.name.startsWith('Con_M13')));
  await page.click(`.hl-row[data-hl="${fj}"]`); await page.waitForTimeout(500);
  const cf = await page.evaluate(() => document.querySelector('.xcs .xc .xl') && [...document.querySelectorAll('.xcs .xc')].find((d) => d.querySelector('.xl').innerText === '機台')?.querySelector('.xt').innerText || '');
  ok(/混淆/.test(cf) && /M12_CMP_Tool/.test(cf), `confounded tool column flagged in the card (${cf})`);
  const sm = await page.evaluate(() => App.rptUI.summary());
  ok(/V12_ETCH_CH：CH_B/.test(sm), 'summary text carries the factor verdict');

  // ---- data layer: link tool history by wafer id (wide, then long with rework rows); LK_M12 → M12_ECP Tool = ECP02
  for (const [fn, piv] of [['TOOL_history_wide.xlsx', false], ['TOOL_history_long.xlsx', true]]) {
    await page.setInputFiles('#file2', path.join(ROOT, 'sample_data', fn)); await page.waitForTimeout(2500);
    const L = await page.evaluate(() => { const l = App.rpt.links[0]; return { n: App.rpt.links.length, rate: l.rate, matched: l.matched, piv: l.pivoted, cols: l.columns, wc: l.waferCol, chip: document.querySelector('.r-ctrl .chip.lnk')?.innerText }; });
    ok(L.n === 1 && L.wc === 'WAFER_ID' && Math.abs(L.rate - 0.961) < 0.01 && L.matched === 3432 && L.piv === piv, `${fn}: linked on WAFER_ID (UAB123-01 ↔ UAB123.01), 96% matched${piv ? ', long table pivoted per step' : ''}`);
    ok(L.cols.includes('M12_ECP Tool') && /資料層/.test(L.chip || ''), `columns added (${L.cols.length}) and data-layer chip shown`);
    const li = await page.evaluate(() => App.rpt.res.findings.wat.findIndex((f) => f.cell.item.name.startsWith('LK_M12')));
    await page.click(`.hl-row[data-hl="${li}"]`); await page.waitForTimeout(600);
    const lf = await page.evaluate(() => [...document.querySelectorAll('.xcs .xc')].find((d) => d.querySelector('.xl').innerText === '機台')?.querySelector('.xt').innerText || '');
    ok(/M12_ECP Tool：ECP02/.test(lf) && !/ECP09/.test(lf), `linked column found by the factor scan: ${lf}`);
    const k0 = await page.evaluate(() => App.rpt.res.cells[App.rpt.res.items.find((i) => i.name.startsWith('Rc_V12')).name].TMTQ11.FAB15.k);
    ok(near(k0, R.rc_TMTQ11), 'K values unchanged after linking (no row duplication)');
    await page.evaluate((f) => App.rptUI.unlink(f), fn); await page.waitForTimeout(800);
    ok(await page.evaluate(() => App.rpt.links.length === 0 && !App.rpt.ds.columns.some((c) => /M12_ECP/.test(c.name))), 'unlink removes the columns');
  }

  // ---- yield module (Yield (%), Bin3_short, Bin7_open columns)
  await page.click('#mods button[data-mod=yield]'); await page.waitForTimeout(800);
  const Y = await page.evaluate(() => { const r = App.rpt.res; return { mode: App.rpt.mode, items: r.items.filter((i) => i.kind === 'yield').map((i) => i.name), hl: r.findings.yield.map((f) => f.dx.title + '|' + f.dx.verdict), corr: document.querySelector('#hlDet .hd-figs .fig:nth-child(2) .ft')?.innerText }; });
  console.log('yield:', JSON.stringify(Y));
  ok(Y.mode === 'yield' && Y.items.length === 3, 'Yield module: 3 yield items (Yield, Bin3_short, Bin7_open)');
  ok(Y.hl.some((t) => /Bin7_open @ TMTQ11/.test(t) && /Rc_V12/.test(t) && /via/.test(t)), 'yield finding cross-references the abnormal WAT (Rc_V12 → open bin)');
  ok(Y.hl.some((t) => /Bin3_short @ TMRX12/.test(t) && /LK_M12/.test(t)), 'short bin cross-references LK/SPA');
  ok(/預期正相關/.test(Y.corr || ''), 'yield partner chart: Rc vs open bin expected positive');
  await page.screenshot({ path: `${SHOT}/r8_yield.png` });
  await page.click('#mods button[data-mod=wat]'); await page.waitForTimeout(500);

  // ---- knowledge base page: edit a rule via the UI, dry run, Excel export / import round trip
  await page.click('#tabs button[data-tab=kb]'); await page.waitForTimeout(400);
  const kb0 = await page.evaluate(() => ({ rows: document.querySelectorAll('.kbt tr[data-rid]').length, hits: [...document.querySelectorAll('.kbt tr[data-rid="lk"] .chip')].map((c) => c.innerText) }));
  ok(kb0.rows >= 14 && kb0.hits.join() === 'LK_M12,LK_M13', `KB page lists ${kb0.rows} rules; dry run shows LK rule hits LK_M12, LK_M13`);
  await page.click('tr[data-rid="lk"]'); await page.waitForTimeout(300);
  await page.fill('[data-f=up_mean]', '線間絕緣變差（fab 測試）');
  await page.fill('[data-f=up_checks]', 'fab 自訂檢查 1\n{L} trench CD');
  await page.click('[data-kbf=save]'); await page.waitForTimeout(1500);
  const kb1 = await page.evaluate(() => ({ v: App.rules.kbVersion(), t: App.rpt.res.findings.wat.find((f) => f.cell.item.name.startsWith('LK_M12')).dx, lk: App.rpt.res.cells[App.rpt.res.items.find((i) => i.name.startsWith('LK_M12')).name].TMRX12.FAB15.fold }));
  ok(/fab 層 1 條/.test(kb1.v) && /fab 測試/.test(kb1.t.mean) && kb1.t.checks[0] === 'fab 自訂檢查 1' && kb1.t.checks[1] === 'M12 trench CD', 'edited rule is applied: title, checks with {L} filled, report recomputed');
  ok(near(kb1.lk, R.lk_TMRX12), 'numbers unchanged after KB edit');
  const [dx] = await Promise.all([page.waitForEvent('download'), page.click('[data-kb=xlsx]')]);
  const xl = path.join(SHOT, 'rules_export.xlsx'); await dx.saveAs(xl);
  await page.click('[data-kb=clear]'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => !/fab 層/.test(App.rules.kbVersion())), 'clear fab layer → base only');
  await page.setInputFiles('#kbFile', xl); await page.waitForTimeout(1500);
  const kb2 = await page.evaluate(() => ({ v: App.rules.kbVersion(), n: App.rptUI.kbOverlay().rules.length, t: App.rpt.res.findings.wat.find((f) => f.cell.item.name.startsWith('LK_M12')).dx.mean }));
  ok(kb2.n === 1 && /fab 測試/.test(kb2.t), `Excel round trip: only the edited rule becomes a fab override (${kb2.v})`);
  await page.screenshot({ path: `${SHOT}/r9_kb.png` });
  await page.click('[data-kb=clear]'); await page.waitForTimeout(800);
  await page.click('#tabs button[data-tab=report]'); await page.waitForTimeout(300);

  // module switch with WAT file: Inline module uses the 6 inline columns (no site data)
  await page.click('#mods button[data-mod=inline]');
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => App.rpt.mode === 'inline' && /BEOL Inline 戰報/.test(document.querySelector('#report h1').innerText)), 'module switch → Inline report from the same file');
  ok(await page.evaluate(() => !document.querySelector('#mods button[data-mod=yield]').disabled), 'Yield module enabled (file has yield columns)');

  // ================================================================ Inline module (long by-site file)
  await page.setInputFiles('#file', INL);
  await page.waitForFunction(() => App.rpt.file === 'INLINE_FAB_compare.xlsx' && App.rpt.res, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const I = await page.evaluate(() => {
    const r = App.rpt.res, g = (it, gp) => r.cells[r.items.find((i) => i.name.startsWith(it)).name][gp].FAB15;
    const pick = (x) => ({ k: x.k, sd: x.sdRatio, wiw: x.wiwRatio, level: x.level, varLevel: x.varLevel });
    return { mode: App.rpt.mode, hasWiw: r.hasWiw, nItems: r.items.length, base: App.rpt.cfg.baseline, watDisabled: document.querySelector('#mods button[data-mod=wat]').disabled,
      v12: pick(g('V12 CD', 'TMTQ11')), thk: pick(g('M13 THK', 'TMWF54')), m12: pick(g('M12 CD', 'TMRX12')), nf: r.findings.inline.length,
      kinds: r.findings.inline.map((f) => `${f.type}:${f.which || ''}:${f.cell.item.name}@${f.cell.group}`) };
  });
  console.log('inline:', JSON.stringify(I));
  const Q = REF.inline;
  ok(I.mode === 'inline' && I.watDisabled && I.base === 'FAB18' && I.nItems === 6, 'inline file → Inline module, WAT button disabled, 6 items, BSL FAB18');
  ok(I.hasWiw, 'site-level data detected → within-wafer σ available');
  ok(near(I.v12.k, Q.v12cd_TMTQ11.k) && I.v12.level === 'orange', `V12 CD@TMTQ11 K=${I.v12.k?.toFixed(2)} (pandas ${Q.v12cd_TMTQ11.k.toFixed(2)})`);
  ok(near(I.thk.wiw, Q.m13thk_TMWF54.wiw) && I.thk.varLevel === 'orange', `M13 THK@TMWF54 WIW σ ×${I.thk.wiw?.toFixed(2)} (pandas ×${Q.m13thk_TMWF54.wiw.toFixed(2)}) orange`);
  ok(near(I.m12.sd, Q.m12cd_TMRX12.sd) && I.m12.varLevel === 'orange', `M12 CD@TMRX12 W2W σ ×${I.m12.sd?.toFixed(2)} (pandas ×${Q.m12cd_TMRX12.sd.toFixed(2)}) orange`);
  ok(I.kinds.some((k) => /^var:wiw:M13 THK/.test(k)) && I.kinds.some((k) => /^var:w2w:M12 CD/.test(k)), 'variation findings: WIW for M13 THK, W2W for M12 CD');
  const iw = await page.evaluate(() => App.rpt.res.findings.inline.map((f) => [f.dx.title, f.dx.mean, f.dx.verdict, f.dx.causes.join('、')].join(' ｜ ')));
  iw.slice(0, 6).forEach((w) => console.log('   ▸ ' + w.slice(0, 200)));
  ok(iw.some((w) => /M13 THK/.test(w) && /片內均勻性變差/.test(w) && /CMP/.test(w)), 'WIW finding wording (CMP edge profile)');
  ok(iw.some((w) => /V12 CD/.test(w) && /WAT/.test(w)), 'inline mean finding mentions WAT impact');
  const rad = await page.evaluate(() => [...document.querySelectorAll('#hlDet .fig .ft')].some((f) => /徑向分布/.test(f.innerText)));
  ok(rad, 'first inline HL (片內 σ) shows the radial profile');
  await page.click('.seg [data-ov=var]'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.querySelectorAll('#report .lt td.lc.var').length === 24), 'overview toggle → variation table (W2W / WIW)');
  await page.screenshot({ path: `${SHOT}/r5_inline_report.png` });
  const itxt = await page.evaluate(() => App.rptUI.summary());
  console.log('--- Inline summary ---\n' + itxt.split('\n').slice(0, 7).join('\n'));
  ok(/Inline 戰報/.test(itxt) && /變異異常/.test(itxt), 'inline summary text');
  // window with radial
  await page.click('#report .lt td.lc.var.orange >> nth=0');
  await page.waitForSelector('.fwin .fp:nth-child(2).js-plotly-plot');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT}/r6_inline_window.png` });
  await page.keyboard.press('Escape');

  ok(!errors.length, 'no page errors ' + JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})();
