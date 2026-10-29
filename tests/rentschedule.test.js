/* The net lease rent schedule against figures worked out by hand (invented leases). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rentSchedule, dealSchedules } from '../app/lease.js';

globalThis.window ||= {};          // kit.js looks for a window
const { scheduleTsv, scheduleCells } = await import('../app/rentschedule.js');

const P = (start, end, rate, unit = 'year', extra = {}) => ({ start, end, rate, unit, source: 'documented', ...extra });
const lease = (periods, o = {}) => ({ id: 'l1', unit: 'A', tenant: 'Acme Test Co', sf: 3333, leaseStart: '2026-01-01', leaseEnd: '2035-12-31', periods, abatements: [], ...o });

test('a step: $100,000 then $110,000 a year against $2,000,000', () => {
  const S = rentSchedule(lease([P('2026-01-01', '2030-12-31', 100000), P('2031-01-01', '2035-12-31', 110000)]), { price: 2000000 });
  assert.equal(S.rows.length, 2);
  assert.deepEqual(S.rows.map((r) => r.annual), [100000, 110000]);
  assert.equal(S.rows[0].monthly, 8333.33);
  assert.equal(S.rows[0].onPrice, 5);
  assert.equal(S.rows[1].onPrice, 5.5);
  assert.equal(S.rows[0].change, null, 'the first row has nothing before it');
  assert.equal(S.rows[1].change, 10);
  assert.deepEqual(S.rows.map((r) => r.years), ['Years 1–5', 'Years 6–10']);
});

test('units: $1,000 a month is $12,000 a year; $25.50 per SF on 3,333 SF is $84,991.50', () => {
  assert.equal(rentSchedule(lease([P('2026-01-01', '2026-12-31', 1000, 'month')])).rows[0].annual, 12000);
  const r = rentSchedule(lease([P('2026-01-01', '2026-12-31', 25.5, 'psf_year')])).rows[0];
  assert.equal(r.annual, 84991.5);
  assert.equal(r.psfYear, 25.5);
});

test('per SF with no SF is null, never 0, and says so', () => {
  const S = rentSchedule(lease([P('2026-01-01', '2026-12-31', 25.5, 'psf_year')], { sf: null }), { price: 1e6 });
  const r = S.rows[0];
  assert.equal(r.annual, null); assert.equal(r.monthly, null); assert.equal(r.onPrice, null); assert.equal(r.psfYear, null);
  assert.match(r.note, /Per SF, but the space has no SF/);
  assert.equal(S.errors.length, 0, 'shown with its note, not blocked');
});

test('a gap between periods is a row with no rent, and no change runs across it', () => {
  const S = rentSchedule(lease([P('2026-01-01', '2026-12-31', 100000), P('2027-04-01', '2027-12-31', 110000)]));
  assert.equal(S.rows.length, 3);
  assert.equal(S.rows[1].kind, 'gap'); assert.equal(S.rows[1].annual, null);
  assert.equal(S.rows[1].from, '2027-01-01'); assert.equal(S.rows[1].to, '2027-03-31');
  assert.equal(S.rows[1].note, 'No rent stated');
  assert.equal(S.rows[2].change, null);
});

test('a projected period is labelled; free rent is a note and the amount stays at contract rent', () => {
  const S = rentSchedule(lease([P('2026-01-01', '2026-12-31', 60000), P('2027-01-01', '2027-12-31', 60000, 'year', { source: 'projected' })],
    { abatements: [{ start: '2026-01-01', end: '2026-03-31', pct: 100 }] }));
  assert.equal(S.rows[0].annual, 60000);
  assert.match(S.rows[0].note, /^Free rent 100% from Jan 1, 2026 to Mar 31, 2026$/);
  assert.equal(S.rows[1].kind, 'projected');
  assert.match(S.rows[1].note, /Projected, not in the lease/);
});

test('"10% every 5 years" in the typed increases adds no rows: only stated periods', () => {
  const S = rentSchedule(lease([P('2026-01-01', '2035-12-31', 100000)]), { price: 2e6 });
  assert.equal(S.rows.length, 1);
  assert.equal(S.rows[0].years, 'Years 1–10');
});

test('an off-anniversary period has no years label', () => {
  assert.equal(rentSchedule(lease([P('2026-01-01', '2026-06-30', 100000)])).rows[0].years, null);
});

test('the label is a cap rate only for "absolute"; NNN alone is not', () => {
  const L = lease([P('2026-01-01', '2026-12-31', 100000)]);
  assert.equal(rentSchedule(L, { price: 1e6, leaseType: 'Absolute NNN' }).priceLabel, 'Cap rate (rent ÷ price)');
  assert.match(rentSchedule(L, { price: 1e6, leaseType: 'Absolute NNN' }).notes.join('|'), /typed as absolute net, so rent is taken as NOI/);
  const n = rentSchedule(L, { price: 1e6, leaseType: 'NNN' });
  assert.equal(n.priceLabel, 'Rent ÷ price');
  assert.match(n.notes.join('|'), /not an NOI cap rate: the lease type is “NNN”/);
  assert.match(rentSchedule(L, { price: 1e6 }).notes.join('|'), /the lease type is “not stated”/);
});

test('no price: rent ÷ price is null and the footnote asks for it', () => {
  const S = rentSchedule(lease([P('2026-01-01', '2026-12-31', 100000)]), { price: null });
  assert.equal(S.rows[0].onPrice, null);
  assert.match(S.notes.join('|'), /Add the asking price to see rent ÷ price\./);
  assert.equal(rentSchedule(lease([P('2026-01-01', '2026-12-31', 100000)]), { price: 0 }).rows[0].onPrice, null);
});

test('options are footnoted as typed, not as rows', () => {
  const S = rentSchedule(lease([P('2026-01-01', '2026-12-31', 100000)]), { options: 'Two 5-year options at 10% bumps' });
  assert.equal(S.rows.length, 1);
  assert.match(S.notes.at(-1), /Renewal options \(as typed\): Two 5-year options at 10% bumps\. Option, not committed\./);
});

test('rent periods with errors are reported', () => {
  const S = rentSchedule(lease([P('2026-01-01', '2026-12-31', 100000), P('2026-06-01', '2027-12-31', 100000)]));
  assert.ok(S.errors.some((e) => /overlap/.test(e)));
});

test('more than one occupied lease: a table each, no rent ÷ price', () => {
  const deal = { figures: { lease_type: 'NNN' }, rr: { leases: [lease([P('2026-01-01', '2026-12-31', 100000)]), lease([P('2026-01-01', '2026-12-31', 50000)], { id: 'l2', unit: 'B' }), { id: 'l3', vacant: true, periods: [] }] } };
  const list = dealSchedules(deal, 2e6);
  assert.equal(list.length, 2);
  assert.equal(list[0].S.showPrice, false);
  assert.equal(list[0].S.rows[0].onPrice, null);
  assert.match(list[0].S.notes.join('|'), /single-tenant deal only/);
  assert.equal(scheduleCells(list[0].S).head.includes('Rent ÷ price'), false);
});

test('the pasted text runs every cell through tsvCell: a hostile name cannot start a formula', () => {
  const deal = { figures: {}, rr: { leases: [lease([P('2026-01-01', '2026-12-31', 100000, 'year', { note: '=cmd|\' /C calc\'!A0' })]), lease([P('2026-01-01', '2026-12-31', 5000)], { id: 'l2', unit: '+SUM(1)' })] } };
  const t = scheduleTsv(dealSchedules(deal, null));
  for (const line of t.split('\n')) for (const c of line.split('\t')) assert.ok(!/^[=+@-]/.test(c) || /^(—|-?\$[\d,.]+)$/.test(c), `cell starts a formula: ${c}`);
  assert.match(t, /Period\tYears\tAnnual rent/);
});

test('the deal workbook has a Rent Schedule sheet: amounts as values, rent ÷ price as a formula on the Deal Analysis price', async () => {
  globalThis.document ||= { addEventListener() {}, dispatchEvent() {} };
  const ExcelJS = (await import('exceljs')).default;
  const fflate = await import('fflate');
  const { buildDealWorkbook } = await import('../app/workbook.js');
  const { analyze } = await import('../app/deal.js');
  const { analysisInput } = await import('../app/impact.js');
  const deal = { name: 'Test', figures: { price: 2000000, lease_type: 'NNN' }, loan: {}, sources: {}, rr: { settings: { asOf: '2026-01-01' }, leases: [lease([P('2026-01-01', '2030-12-31', 100000), P('2031-01-01', '2035-12-31', 110000)])] } };
  const bytes = await buildDealWorkbook(ExcelJS, fflate, { deal, metrics: analyze(analysisInput(deal), null), comps: null });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const ws = wb.getWorksheet('Rent Schedule');
  assert.ok(ws, 'the sheet is there');
  let first = null;
  ws.eachRow((row, r) => { if (!first && row.getCell(1).value === 'From') first = r + 1; });
  assert.equal(ws.getCell(`D${first}`).value, 100000);
  assert.equal(ws.getCell(`E${first}`).value, 8333.33);
  assert.match(ws.getCell(`H${first}`).value.formula, /D\d+\/'Deal Analysis'!B5/);
  assert.equal(ws.getCell(`H${first}`).value.result, 0.05);
  assert.equal(ws.getCell(`H${first + 1}`).value.result, 0.055);
});

test('the deal brief has a Rent schedule section for a deal with a rent roll', async () => {
  const { fakeDocument } = await import('./impact-cases.js');
  const { renderDealBrief } = await import('../app/brief.js');
  const { analyze } = await import('../app/deal.js');
  const { analysisInput } = await import('../app/impact.js');
  const deal = { name: 'Test', figures: { price: 2000000 }, loan: {}, sources: {}, rr: { settings: { asOf: '2026-01-01' }, leases: [lease([P('2026-01-01', '2030-12-31', 100000)])] } };
  const doc = fakeDocument();
  const box = doc.createElement('div');
  renderDealBrief(box, { deal, m: analyze(analysisInput(deal), null), comps: null });
  const all = []; const walk = (n) => { all.push(n.textContent || n.own || ''); (n.children || []).forEach(walk); };
  walk(box);
  assert.ok(all.some((t) => t === 'Rent schedule'), 'the heading');
  assert.ok(all.some((t) => t === '5.00%'), 'rent over price');
});

test('a lease with problems is named and left out of the brief and the sheet, not dropped silently', async () => {
  globalThis.document ||= { addEventListener() {}, dispatchEvent() {} };
  const ExcelJS = (await import('exceljs')).default;
  const fflate = await import('fflate');
  const { buildDealWorkbook } = await import('../app/workbook.js');
  const { renderDealBrief } = await import('../app/brief.js');
  const { fakeDocument } = await import('./impact-cases.js');
  const { analyze } = await import('../app/deal.js');
  const { analysisInput } = await import('../app/impact.js');
  const bad = lease([P('2026-01-01', '2026-12-31', 100000), P('2026-06-01', '2027-12-31', 90000)], { id: 'lx', unit: 'Z9' });
  const deal = { name: 'Test', figures: { price: 2000000 }, loan: {}, sources: {}, rr: { settings: { asOf: '2026-01-01' }, leases: [bad, lease([P('2026-01-01', '2026-12-31', 5000)], { id: 'ly', unit: 'Y1' })] } };
  const m = analyze(analysisInput(deal), null);
  const doc = fakeDocument(); const box = doc.createElement('div');
  renderDealBrief(box, { deal, m, comps: null });
  const all = []; const walk = (n) => { all.push(n.textContent || n.own || ''); (n.children || []).forEach(walk); };
  walk(box);
  assert.ok(all.some((t) => /^Left out: Z9 · Acme Test Co has 1 problem in its rent periods\.$/.test(t)), 'brief names it');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildDealWorkbook(ExcelJS, fflate, { deal, metrics: m, comps: null }));
  const cells = []; wb.getWorksheet('Rent Schedule').eachRow((r) => r.eachCell((c) => cells.push(String(c.value))));
  assert.ok(cells.some((t) => /^Left out: Z9 · Acme Test Co has 1 problem in its rent periods\.$/.test(t)), 'sheet names it');
});

test('a per-SF period with no SF is shown with its note, not blocked', () => {
  const S = rentSchedule(lease([P('2026-01-01', '2026-12-31', 25, 'psf_year')], { sf: null }));
  assert.equal(S.errors.length, 0);
  assert.match(S.rows[0].note, /Per SF, but the space has no SF/);
  assert.match(scheduleCells(S).rows[0].at(-1), /Per SF, but the space has no SF/);
});

test('years labels come from the month difference and still need real anniversaries', () => {
  const r = (s, e) => rentSchedule(lease([P(s, e, 1000, 'month')], { leaseStart: '2026-03-15' })).rows[0].years;
  assert.equal(r('2027-03-15', '2028-03-14'), 'Year 2');
  assert.equal(r('2026-03-15', '2031-03-14'), 'Years 1–5');
  assert.equal(r('2027-03-16', '2028-03-14'), null);
  assert.equal(r('2026-03-15', '2028-03-20'), null);
});

test('a price worked out from NOI and the cap is not a typed price: no rent ÷ price, no "Cap rate" label, in the card, the workbook and the brief', async () => {
  globalThis.document ||= { addEventListener() {}, dispatchEvent() {} };
  const { analyze } = await import('../app/deal.js');
  const { analysisInput } = await import('../app/impact.js');
  const { typedPrice } = await import('../app/lease.js');
  const deal = { name: 'Test', figures: { noi: 100000, cap: 6.5, lease_type: 'Absolute NNN' }, loan: {}, sources: {}, rr: { settings: { asOf: '2026-01-01' }, leases: [lease([P('2026-01-01', '2030-12-31', 100000)])] } };
  const m = analyze(analysisInput(deal), null);
  assert.equal(m.derived.price, true, 'the fixture has only a derived price');
  assert.equal(typedPrice(m), null);
  const S = dealSchedules(deal, typedPrice(m))[0].S;
  assert.equal(S.rows[0].onPrice, null); assert.equal(S.priced, false);
  assert.notEqual(S.priceLabel, 'Cap rate (rent ÷ price)');
  assert.match(S.notes.join('|'), /No price entered/);
  assert.equal(scheduleCells(S).rows[0].at(-2), '—');
  // a typed price still works
  const m2 = analyze(analysisInput({ ...deal, figures: { ...deal.figures, price: 2000000 } }), null);
  assert.equal(typedPrice(m2), 2000000);
  assert.equal(dealSchedules(deal, typedPrice(m2))[0].S.rows[0].onPrice, 5);
  // the workbook sheet
  const ExcelJS = (await import('exceljs')).default;
  const fflate = await import('fflate');
  const { buildDealWorkbook } = await import('../app/workbook.js');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildDealWorkbook(ExcelJS, fflate, { deal, metrics: m, comps: null }));
  const ws = wb.getWorksheet('Rent Schedule');
  let first = null; let head = null;
  ws.eachRow((row, r) => { if (!first && row.getCell(1).value === 'From') { first = r + 1; head = row.getCell(8).value; } });
  assert.notEqual(head, 'Cap rate (rent ÷ price)');
  assert.equal(ws.getCell(`H${first}`).value, '—', 'no formula against the derived price');
  // the brief
  const { fakeDocument } = await import('./impact-cases.js');
  const { renderDealBrief } = await import('../app/brief.js');
  const box = fakeDocument().createElement('div');
  renderDealBrief(box, { deal, m, comps: null });
  const all = []; const walk = (n) => { all.push(n.textContent || n.own || ''); (n.children || []).forEach(walk); };
  walk(box);
  assert.ok(all.some((t) => t === 'Rent schedule') && all.some((t) => /No price entered/.test(t)));
  assert.ok(!all.some((t) => /Cap rate \(rent/.test(t)));
});
