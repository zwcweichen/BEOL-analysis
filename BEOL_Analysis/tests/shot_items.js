// v3.14 setup-page item cards: whole-card click, marquee select, bulk bar, drag to another group. Screenshots to tests/shots/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('file://' + path.resolve(__dirname, '../BEOL_Report.html'));
  await pg.setInputFiles('#file', path.resolve(__dirname, '../sample_data/WAT_FAB_compare.xlsx'));
  await pg.waitForSelector('.icard', { state: 'attached', timeout: 60000 });
  await pg.waitForTimeout(500);
  await pg.click('#tabs button[data-tab=setup]'); await pg.waitForTimeout(300);
  const sec = pg.locator('#itemsSec');
  await sec.scrollIntoViewIfNeeded();
  const state = async () => pg.evaluate(() => App.rpt.S ? null : null);
  const items = async () => pg.evaluate(() => [...document.querySelectorAll('.icard')].map((e) => ({ n: e.dataset.it, on: e.querySelector('[data-on]').checked, sel: e.classList.contains('sel'), kind: e.closest('.igroup').dataset.kind })));
  let st = await items(); console.log('cards', st.length, 'wat', st.filter((x) => x.kind === 'wat').length, 'inline', st.filter((x) => x.kind === 'inline').length);
  await sec.screenshot({ path: path.join(out, 'items_0_initial.png') });

  // 1. whole-card click toggles
  const first = pg.locator('.icard').first(); const name0 = await first.getAttribute('data-it');
  await first.locator('.u').click();
  st = await items(); console.log('card click → off:', st[0].on === false ? 'OK' : 'NG');
  await first.locator('.u').click();
  st = await items(); console.log('card click → on again:', st[0].on === true ? 'OK' : 'NG');
  // checkbox still works, no double toggle
  await first.locator('[data-on]').click(); st = await items(); console.log('checkbox click → off:', st[0].on === false ? 'OK' : 'NG');
  await first.locator('[data-on]').click();

  // 2. ctrl+click selects
  await pg.locator('.icard').nth(1).locator('.u').click({ modifiers: ['Control'] });
  await pg.locator('.icard').nth(2).locator('.u').click({ modifiers: ['Control'] });
  st = await items(); console.log('ctrl-click sel count 2:', st.filter((x) => x.sel).length === 2 ? 'OK' : 'NG', 'bulk visible:', await pg.locator('#iBulk').isVisible());
  await sec.screenshot({ path: path.join(out, 'items_1_ctrlsel.png') });
  await pg.click('#iBulk [data-bulk="clear"]');

  // 3. marquee: drag from the empty space right of the WAT label across the first row of WAT cards
  const grid = pg.locator('.items-grid[data-kind="wat"]'); const gb = await grid.boundingBox();
  const lab = pg.locator('.igroup[data-kind="wat"] > .lab'); const lb = await lab.boundingBox();
  const x0 = lb.x + lb.width - 10, y0 = lb.y + lb.height / 2;   // empty area on the label row (not a card)
  await pg.mouse.move(x0, y0); await pg.mouse.down();
  await pg.mouse.move(x0 - 200, y0 + 60, { steps: 8 });
  await pg.mouse.move(gb.x + 10, gb.y + 40, { steps: 8 });
  await sec.screenshot({ path: path.join(out, 'items_2_marquee_live.png') });
  await pg.mouse.up();
  st = await items(); const nsel = st.filter((x) => x.sel).length; console.log('marquee selected', nsel, nsel >= 2 ? 'OK' : 'NG');
  await sec.screenshot({ path: path.join(out, 'items_3_marquee_done.png') });
  // bulk off
  await pg.click('#iBulk [data-bulk="off"]'); st = await items(); console.log('bulk off:', st.filter((x) => x.sel).every((x) => !x.on) ? 'OK' : 'NG');
  await pg.click('#iBulk [data-bulk="on"]');
  // bulk move → inline, then back
  const selNames = st.filter((x) => x.sel).map((x) => x.n);
  await pg.click('#iBulk [data-move="inline"]'); await pg.waitForTimeout(300);
  st = await items(); console.log('bulk move to inline:', selNames.every((n) => st.find((x) => x.n === n).kind === 'inline') ? 'OK' : 'NG', 'still selected:', st.filter((x) => x.sel).length);
  await sec.screenshot({ path: path.join(out, 'items_4_moved_inline.png') });
  await pg.click('#iBulk [data-move="wat"]'); await pg.waitForTimeout(300);
  st = await items(); console.log('bulk move back to wat:', selNames.every((n) => st.find((x) => x.n === n).kind === 'wat') ? 'OK' : 'NG');
  await pg.click('#iBulk [data-bulk="clear"]');

  // 4. HTML5 drag one card onto the Yield group
  const card = pg.locator('.icard').nth(3); const cn = await card.getAttribute('data-it');
  const yg = pg.locator('.igroup[data-kind="yield"]');
  await card.dragTo(yg); await pg.waitForTimeout(300);
  st = await items(); console.log('drag card → yield:', st.find((x) => x.n === cn).kind === 'yield' ? 'OK' : 'NG', 'cat now:', await pg.evaluate((n) => App.rpt.S?.cfg?.items?.find?.((i) => i.name === n)?.cat ?? '(S not exposed)', cn));
  await sec.screenshot({ path: path.join(out, 'items_5_drag_yield.png') });
  await pg.locator(`.icard[data-it="${cn}"]`).dragTo(pg.locator('.igroup[data-kind="wat"]')); await pg.waitForTimeout(300);
  st = await items(); console.log('drag back → wat:', st.find((x) => x.n === cn).kind === 'wat' ? 'OK' : 'NG');

  // 5. generate still works
  await pg.click('#sGo'); await pg.waitForTimeout(1500); console.log('report tab active:', await pg.locator('#tab-report').evaluate((e) => e.classList.contains('active')));
  console.log('generate OK; page errors:', errs.length ? errs : 'none');
  await b.close();
})();
