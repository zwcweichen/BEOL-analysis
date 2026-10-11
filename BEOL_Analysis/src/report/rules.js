/* rules.js — BEOL/FEOL WAT diagnosis knowledge base (deterministic, reviewable, editable)
 *
 * Each category describes:
 *   match   : name regex / unit regex used to classify a column
 *   kind    : 'wat' (electrical) or 'inline' (metrology)
 *   up/down : what a positive / negative shift usually means physically, and what to check next
 *   pairs   : inline categories that physically drive this WAT item, with expected sign
 *             (sign −1: inline ↓ ⇒ WAT ↑ ; +1: same direction)
 * Wording is written so that it can be pasted into a report as-is.
 */
(function () {
  'use strict';
  const App = window.App;
  const R = (App.rules = {});

  // ------------------------------------------------------------ knowledge base: data → compiled categories
  const FIELDS = ['id', 'label', 'kind', 'metric', 'bad', 'name', 'unit', 'up_mean', 'up_causes', 'up_checks', 'down_mean', 'down_causes', 'down_checks', 'pairs', 'enabled', 'source', 'note', 'author', 'date'];
  R.FIELDS = FIELDS;
  const LISTF = ['up_causes', 'up_checks', 'down_causes', 'down_checks'];
  const toList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/\r?\n|；|\|/).map((x) => x.trim()).filter(Boolean));
  const esc = (t) => t.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  /** glob "con_*;lk#*" → regex; a pattern without * also matches as a whole word of the name */
  R.globToRe = (pat) => {
    const alts = String(pat || '').split(';').map((x) => x.trim()).filter(Boolean);
    if (!alts.length) return null;
    const parts = alts.map((g) => {
      const body = esc(g).replace(/\\\*/g, '.*').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/#/g, '\\d');
      return g.includes('*') ? `^${body}$` : `^${body}$|(?:^|[_\\-\\s])${body}(?:[_\\-\\s]|$)`;
    });
    return new RegExp(parts.join('|'), 'i');
  };
  /** flat rule (Excel / JSON row) → category object used by the engine */
  R.compileRule = (r) => {
    const c = { id: String(r.id).trim(), label: r.label || r.id, kind: r.kind || 'wat', metric: r.metric || 'k', bad: r.bad || '',
      name: R.globToRe(r.name), unit: R.globToRe(r.unit), log: r.metric === 'fold',
      up: { mean: r.up_mean || '偏高', causes: toList(r.up_causes), checks: toList(r.up_checks) },
      down: { mean: r.down_mean || '偏低', causes: toList(r.down_causes), checks: toList(r.down_checks) },
      pairs: String(r.pairs || '').split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const [cat, sg] = x.split(':'); return { cat: cat.trim(), sign: (sg || '-').trim() === '+' ? +1 : -1 }; }),
      source: r.source || '', note: r.note || '', author: r.author || '', date: r.date || '', enabled: r.enabled !== false && String(r.enabled).toLowerCase() !== 'false' && r.enabled !== 0 && String(r.enabled) !== '0' && String(r.enabled) !== 'N',
      layer: r.layer || 'base', raw: { ...r } };
    return c;
  };
  /** normalise a flat rule so every field exists (lists as arrays) */
  R.normRule = (r) => {
    const o = {};
    for (const f of FIELDS) o[f] = LISTF.includes(f) ? toList(r[f]) : f === 'enabled' ? !(r[f] === false || r[f] === 0 || /^(false|0|n|no|否)$/i.test(String(r[f] ?? '').trim())) : String(r[f] ?? '').trim();
    return o;
  };
  /** canonical string for "is this rule different from the base?" (ignores author / date / note) */
  R.canon = (r) => { const o = R.normRule(r); delete o.author; delete o.date; delete o.note; return JSON.stringify(o); };
  /** merge base rules + fab overlay (same id → overlay replaces; new id → appended before 'other') */
  R.load = (base, overlay) => {
    const rules = (base?.rules || []).map((r) => ({ ...R.normRule(r), layer: 'base' }));
    for (const o of overlay?.rules || []) {
      const n = { ...R.normRule(o), layer: 'fab' };
      const i = rules.findIndex((r) => r.id === n.id);
      if (i >= 0) rules[i] = n; else { const j = rules.findIndex((r) => /^other/.test(r.id)); rules.splice(j < 0 ? rules.length : j, 0, n); }
    }
    R.RULES = rules;
    R.KB = { base: { version: base?.version || '', date: base?.date || '' }, fab: overlay ? { version: overlay.version || '', date: overlay.date || '', author: overlay.author || '', n: (overlay.rules || []).length } : null };
    R.CATS = rules.filter((r) => r.enabled || /^other/.test(r.id)).map(R.compileRule);
    for (const [id, label, kind] of [['other', '其他（WAT）', 'wat'], ['other_inline', '其他（inline）', 'inline'], ['other_yield', '其他（yield）', 'yield']]) if (!R.CATS.some((c) => c.id === id)) R.CATS.push(R.compileRule({ id, label, kind }));
    return R.CATS;
  };
  R.kbVersion = () => `知識庫 base v${R.KB?.base.version || '?'}${R.KB?.fab ? `＋fab 層 ${R.KB.fab.n} 條${R.KB.fab.version ? ` v${R.KB.fab.version}` : ''}` : ''}`;
  /** export the current merged rules as flat rows (for Excel / JSON) */
  R.exportRows = (layerOnly) => R.RULES.filter((r) => !layerOnly || r.layer === layerOnly).map((r) => { const o = {}; for (const f of FIELDS) o[f] = LISTF.includes(f) ? r[f].join('\n') : r[f]; o.layer = r.layer; return o; });
  /** which columns of a dataset each rule would match (dry run) */
  R.dryRun = (columns) => {
    const out = {};
    for (const c of R.CATS) out[c.id] = [];
    for (const col of columns) { const k = R.classify(col); if (!/^other/.test(k.cat)) out[k.cat].push({ col, conf: k.conf }); }
    return out;
  };
  R.load(App.RULES_BASE, App.store ? App.store.get('rpt-kb', null) : null);

  R.byId = (id) => R.CATS.find((c) => c.id === id) || R.CATS[R.CATS.length - 1];
  R.metricOf = (catId) => R.byId(catId).metric || 'k';

  /** WAT items that a given inline item physically drives (reverse of relatedInline) */
  R.relatedWat = (inlName, inlCat, items) => {
    const L = R.layer(inlName); if (!L) return [];
    const out = [];
    for (const it of items) {
      if (it.kind !== 'wat' || R.layer(it.name) !== L) continue;
      for (const p of R.byId(it.cat).pairs || []) {
        const ok = p.cat === inlCat || (p.cat === 'cd' && inlCat === 'vcd') || (p.cat === 'vcd' && inlCat === 'cd' && /^v/i.test(L));
        if (ok) { out.push({ item: it, sign: p.sign }); break; }
      }
    }
    return out;
  };

  /** wording for an inline mean shift; related = WAT items of the same layer with their cells */
  R.diagnoseInline = (cell, related) => {
    const cat = R.byId(cell.item.cat), L = R.layer(cell.item.name);
    const d = cat[cell.dir >= 0 ? 'up' : 'down'] || { mean: cell.dir >= 0 ? '偏高' : '偏低', causes: [], checks: [] };
    const impact = (related || []).map((r) => {
      const exp = Math.sign(cell.dir) * r.sign;   // expected WAT direction
      const wc = r.cell;
      const mv = !wc || wc.level === 'na' ? '無資料' : wc.level === 'green' ? '尚在綠燈' : `已${wc.dir * exp > 0 ? '同向' : '反向'}偏移（${wc.text}）`;
      return `${R.parseName(r.item.name).short} 預期${exp > 0 ? '上升' : '下降'} → 目前${mv}`;
    });
    return {
      title: `${R.parseName(cell.item.name).short}${cell.group && cell.group !== '全部' ? ` @ ${cell.group}` : ''}：${cell.cip} ${cell.text}`,
      mean: d.mean,
      cat: cat.label,
      causes: d.causes.map((c) => fill(c, L)),
      checks: d.checks.map((c) => fill(c, L)),
      verdict: impact.length ? `對 WAT 的預期影響：${impact.join('；')}。` : `資料中沒有 ${L || '該層'} 的 WAT 可以對照；建議到 WAT 戰報確認同層 Rs／LK／Rc 是否受影響。`,
      fallback: '比對 CIP lot 的機台履歷（tool commonality），確認偏移是否集中在特定 chamber／機台。',
    };
  };

  /** wording for a yield finding; related = abnormal WAT cells of the same group / CIP */
  R.diagnoseYield = (cell, related) => {
    const cat = R.byId(cell.item.cat);
    const d = cat[cell.dir >= 0 ? 'up' : 'down'] || { mean: cell.dir >= 0 ? '偏高' : '偏低', causes: [], checks: [] };
    const hit = (related || []).map((r) => `${R.parseName(r.item.name).short} ${r.cell.text}`);
    const byCat = {};
    (related || []).forEach((r) => { byCat[r.item.cat] = (byCat[r.item.cat] || 0) + 1; });
    const hint = Object.keys(byCat).map((k) => ({ lk: '線間漏電／短路', spa: '線間漏電／短路', vbd: '線間耐壓', rc: 'via 開路或高阻', rs: '金屬線高阻' }[k])).filter(Boolean);
    return {
      title: `${R.parseName(cell.item.name).short}${cell.group && cell.group !== '全部' ? ` @ ${cell.group}` : ''}：${cell.cip} ${cell.text}`,
      mean: d.mean,
      cat: cat.label,
      causes: d.causes.slice(), checks: d.checks.slice(),
      verdict: hit.length ? `同組 WAT 異常：${hit.join('、')} → 良率變化可能與${[...new Set(hint)].join('、') || '這些電性'}相關，建議先看這些 item 的 HL。` : '同組 WAT 沒有亮燈 → 電性未見異常，優先查缺陷（defect scan）、CP bin 分布與 wafer map 空間特徵。',
      fallback: '比對 CIP lot 的機台履歷（tool commonality），確認良率變化是否集中在特定機台。',
    };
  };

  /** wording for a variation finding (wafer-to-wafer σ or within-wafer uniformity) */
  R.diagnoseVar = (cell, which) => {
    const L = R.layer(cell.item.name);
    const isWiw = which === 'wiw', ratio = isWiw ? cell.wiwRatio : cell.sdRatio;
    const thk = cell.item.cat === 'thk';
    return {
      title: `${R.parseName(cell.item.name).short}${cell.group && cell.group !== '全部' ? ` @ ${cell.group}` : ''}：${cell.cip} ${isWiw ? '片內 σ' : 'wafer 間 σ'} ×${ratio.toFixed(2)}`,
      mean: isWiw ? '片內均勻性變差' : 'wafer 間變異放大',
      cat: R.byId(cell.item.cat).label,
      causes: isWiw
        ? (thk ? ['CMP edge profile 改變（retaining ring、pad conditioning、zone pressure）', 'ECP 電鍍均勻性', '前層 topography'] : ['Etch chamber center／edge 均勻性', 'Litho focus 在 edge shot 偏移', 'Hardmask 厚度均勻性'])
        : ['不同機台／chamber 間 mismatch', 'Lot-to-lot 控制不穩（APC 回饋、pad life 跨度大）', '量測機台 matching'],
      checks: isWiw
        ? [`看下方徑向分布：偏差集中在 edge 還是 center`, thk ? `${L || '該層'} CMP zone pressure、retaining ring 壽命` : `${L || '該層'} etch chamber 均勻性 monitor`, 'Wafer map 確認是否有特定 shot／方位']
        : ['依 chamber／機台分組比較 CIP wafer', 'APC log 與 pad／parts life', '量測機台 matching'],
      verdict: isWiw ? '片內 σ 是每片 wafer 各 site 的標準差平均；均值可能正常，但 edge／center 已經分開。' : 'Wafer 間 σ 是各片 wafer mean 的標準差；均值可能正常，但片與片之間不穩。',
      fallback: '若集中在特定機台 → 做機台 matching 或暫時分流。',
    };
  };

  /** split "Con_M12~OHM/SQ~Mean" → { short:'Con_M12', unit:'OHM/SQ', stat:'Mean' } */
  R.parseName = (name) => {
    let str = String(name);
    // "Mean(Item Value by Site, 07504.050 M15CUCMP_5, NOVA_THK)" → "M15CUCMP_5 NOVA_THK"（拿掉統計包裝、固定字樣、站點代碼）
    const w = str.match(/^(?:mean|avg|average|median|max|min|std|sd)\s*\((.+?)\)?\s*$/i);   // closing paren may be missing (truncated exports)
    if (w) {
      const parts = w[1].split(',').map((t) => t.trim()).filter((t) => t && !/^item value|by site|by wafer|^value$/i.test(t) && !/^\d+(?:\.\d+)?$/.test(t));
      str = parts.map((t) => t.replace(/^\d{3,}(?:\.\d+)?\s+/, '')).join(' ') || str;
    }
    if (str.includes('~')) { const p = str.split('~').map((s) => s.trim()); return { short: p[0], unit: p[1] || '', stat: p[2] || '' }; }
    const m = str.match(/^(.*?)\s*[(\[（]\s*([^)\]）]{1,12})\s*[)\]）]\s*$/);     // "RS_M3 (ohm/sq)", "M3 CD [nm]"
    return m && m[1] ? { short: m[1].trim(), unit: m[2].trim(), stat: '' } : { short: str.trim(), unit: '', stat: '' };
  };


  /** layer token, e.g. M12, V12, TM1, TV2, CT, PO */
  R.layer = (name) => {
    const s = R.parseName(name).short.replace(/VIA[_\- ]?(\d+)/ig, 'V$1').replace(/MET(?:AL)?[_\- ]?(\d+)/ig, 'M$1');   // VIA2 → V2, METAL3 → M3
    const m = s.match(/(?:^|[_\-\s])((?:TM|TV|M|V)\d+)(?:[_\-\s]|$)/i) || s.match(/((?:TM|TV|M|V)\d+)/i);
    return m ? m[1].toUpperCase() : '';
  };

  /** classify a column → { cat, conf } ; conf 0..1 */
  R.classify = (name) => {
    const { short, unit } = R.parseName(name);
    let best = { cat: 'other', conf: 0.2 };
    for (const c of R.CATS) {
      if (/^other/.test(c.id)) continue;
      const n = c.name && c.name.test(short), u = c.unit && unit && c.unit.test(unit);
      const conf = n && u ? 0.95 : n ? 0.75 : u ? 0.5 : 0;
      if (conf > best.conf) best = { cat: c.id, conf };
    }
    // inline CD of a via layer → via CD
    if (best.cat === 'cd' && /^v\d+/i.test(R.layer(name))) best.cat = 'vcd';
    // range／σ／max／min／uniformity 這類衍生統計欄：歸到該模組的「其他」，仍點燈但不配對
    if (R.STAT_SUFFIX.test(short) || /^(r|rng|range|sd|std|stdev|sigma|3s|max|min|nu|cv)$/i.test(unit || '')) {
      const kind = (R.byId(best.cat) || {}).kind || 'wat';
      best = { cat: kind === 'inline' ? 'other_inline' : kind === 'yield' ? 'other_yield' : 'other', conf: Math.max(best.conf, 0.6), stat: true };
    }
    return best;
  };
  /** derived-statistic suffixes: NOVA_THK_R, CD_SD, THK_3S, THK (R), *_MAX, *_NU, *_U% … */
  R.STAT_SUFFIX = /(?:[_\-\s]|\()(r|rng|range|sd|std|stdev|stddev|sigma|3s|3sigma|max|min|nu|u%|unif|uniformity|cv|wiw|w2w)\)?$/i;

  /** inline columns that physically relate to a WAT item (same layer, category from pairs) */
  R.relatedInline = (watName, watCat, items) => {
    const cat = R.byId(watCat), L = R.layer(watName);
    if (!cat.pairs || !L) return [];
    const out = [];
    for (const p of cat.pairs) {
      for (const it of items) {
        if (it.kind !== 'inline' || it.name === watName) continue;
        const iL = R.layer(it.name);
        const okCat = it.cat === p.cat || (p.cat === 'cd' && it.cat === 'vcd' && /^v/i.test(L)) || (p.cat === 'vcd' && it.cat === 'cd' && /^v/i.test(iL));
        if (okCat && iL === L) out.push({ item: it, sign: p.sign });
      }
    }
    return out;
  };

  /** adjacent layer name: Mn below → M(n−1); Vn below → Mn, above → M(n+1); TM／TV 同理 */
  R.adjLayer = (L, rel) => {
    const m = (L || '').match(/^(TM|TV|M|V)(\d+)$/i); if (!m) return '';
    const pre = m[1].toUpperCase(), n = +m[2], metal = pre === 'TM' ? 'TM' : pre === 'TV' ? 'TM' : 'M';
    if (pre === 'M' || pre === 'TM') return rel === 'below' ? (n > 1 ? `${metal}${n - 1}` : '') : '';
    return rel === 'below' ? `${metal}${n}` : `${metal}${n + 1}`;
  };
  /** cross-layer inline items for a WAT item: [{ item, sign, rel, layer, why, check }] (sign 0 = direction depends on pattern) */
  R.relatedXLayer = (watName, watCat, items) => {
    const L = R.layer(watName), tab = (window.App && App.XLAYER) || []; if (!L) return [];
    const out = [];
    for (const x of tab.filter((x) => x.wat === watCat)) {
      const A = R.adjLayer(L, x.rel); if (!A) continue;
      for (const it of items) {
        if (it.kind !== 'inline' || it.cat !== x.inl || R.layer(it.name) !== A) continue;
        const sub = (t) => t.replace(/\{B\}/g, A).replace(/\{A\}/g, A);
        out.push({ item: it, sign: x.sign, rel: x.rel, layer: A, why: x.why, check: sub(x.check) });
      }
    }
    return out;
  };

  const fill = (s, L) => s.replace(/\{L\}/g, L || '該層');

  /**
   * Build wording for one abnormal cell.
   * cell: { item, group, cip, k, mean, bmean, n, bn, level }
   * related: [{ item, sign, k }]  (K of the paired inline items in the same group/CIP)
   */
  /** relation of one paired item to the abnormal cell: strong（有偏移且 wafer 間有關聯）／weak（有偏移但關聯弱）／flat／opp／none */
  R.relOf = (rel, dirSign) => {
    if (rel.k == null || !isFinite(rel.k)) return 'none';
    const exp = rel.sign === 0 ? Math.sign(rel.k) : dirSign * rel.sign;
    if (Math.abs(rel.k) < 0.5) return 'flat';
    if (Math.sign(rel.k) !== exp) return 'opp';
    if (rel.r != null && Math.abs(rel.r) < 0.3) return 'weak';
    return 'strong';
  };
  R.fmtK = (k) => `${k >= 0 ? '+' : '−'}${Math.abs(k).toFixed(2)}σ`;
  R.fmtR = (r) => (r == null ? '' : `r = ${r >= 0 ? '' : '−'}${Math.abs(r).toFixed(2)}`);
  /** "V12 CD AEI −2.79σ（r = −0.84）" */
  R.relTxt = (rel, withR = true) => `${R.parseName(rel.item.name).short} ${R.fmtK(rel.k)}${withR && rel.r != null ? `（${R.fmtR(rel.r)}）` : ''}`;

  R.diagnose = (cell, related, xrel) => {
    const cat = R.byId(cell.item.cat);
    const L = R.layer(cell.item.name);
    const dirSign = Math.sign(cell.dir ?? cell.k) || 1;
    const dir = dirSign >= 0 ? 'up' : 'down';
    const d = cat[dir] || { mean: dir === 'up' ? '偏高' : '偏低', causes: [], checks: [] };
    const fmtK = R.fmtK;
    const grp = (arr) => { const o = { strong: [], weak: [], flat: [], opp: [] }; for (const r of arr || []) { const st = R.relOf(r, dirSign); if (o[st]) o[st].push(r); } return o; };
    const same = grp(related), x = grp(xrel);
    const lst = (a) => a.map((r) => R.relTxt(r)).join('、');
    const catLabel = (a) => a.map((r) => R.byId(r.item.cat).label.replace('（inline）', '')).join('／');
    let verdict = '', xline = '', xchecks = [];
    if (same.strong.length) {
      verdict = `同層 ${lst(same.strong)} 與 WAT 同向且 wafer 間有關聯 → 主因很可能是 ${catLabel(same.strong)} 偏移。`;
      if (same.opp.length) verdict += `（${lst(same.opp)} 反向，可能部分抵銷）`;
      if (x.strong.length) { xline = `鄰層 ${lst(x.strong)} 也有偏移，可能疊加。`; xchecks = [x.strong[0].check]; }
    } else if (x.strong.length) {
      const sameTxt = same.weak.length ? `同層 ${lst(same.weak)} 有偏移但關聯弱；` : same.flat.length ? `同層 ${same.flat.map((r) => R.relTxt(r, false)).join('、')} 未偏移；` : same.opp.length ? `同層 ${lst(same.opp)} 反向；` : '無同層 inline；';
      verdict = `${sameTxt}鄰層 ${lst(x.strong)} 同向且 wafer 間有關聯 → 建議先確認 ${x.strong[0].layer} 製程對本層的影響。`;
      xline = verdict; xchecks = [x.strong[0].check];
    } else if (same.weak.length) {
      verdict = `同層 ${lst(same.weak)} 有偏移但 wafer 間關聯弱 → ${catLabel(same.weak)} 可能只是部分原因，同時查製程條件與機台。`;
    } else if (same.flat.length || same.opp.length) {
      const parts = [];
      if (same.flat.length) parts.push(`${same.flat.map((r) => R.relTxt(r, false)).join('、')} 未偏移`);
      if (same.opp.length) parts.push(`${lst(same.opp)} 反向`);
      verdict = `同層 ${parts.join('；')} → 尺寸無法解釋，優先查製程條件（${cat.id === 'rc' ? 'via 底部殘留／barrier' : cat.id === 'rs' ? 'Cu 電鍍／barrier／晶粒' : '缺陷／材料'}）與機台 commonality。`;
      if (x.weak.length) verdict += `鄰層 ${lst(x.weak)} 有偏移但關聯弱，證據不足。`;
    } else {
      verdict = `資料中沒有 ${L || '該層'} 的 inline 可交叉比對 → 建議調出 ${fill(d.checks[0] || 'inline 數據', L)} 確認。`;
      if (x.weak.length) verdict += `鄰層 ${lst(x.weak)} 有偏移但關聯弱。`;
    }
    const xFirst = !same.strong.length && x.strong.length;
    return {
      title: `${R.parseName(cell.item.name).short}${cell.group && cell.group !== '全部' ? ` @ ${cell.group}` : ''}：${cell.cip} ${cell.text || `K ${fmtK(cell.k)}`}`,
      mean: d.mean,
      cat: cat.label,
      causes: d.causes.map((c) => fill(c, L)),
      checks: xFirst ? [...xchecks, ...d.checks.map((c) => fill(c, L))] : [...d.checks.map((c) => fill(c, L)), ...xchecks],
      verdict,
      xline,
      fallback: '若當層與鄰層 inline 都正常 → 比對 CIP lot 的機台履歷（tool commonality），找出共同經過的 chamber／機台。',
    };
  };
})();
