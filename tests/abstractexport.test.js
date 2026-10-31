/* The lease abstract's files (app/abstractexport.js): the workbook (single and portfolio) read back with ExcelJS, its
 * formulas only in the fixed template cells and each with the cached value our own arithmetic gives, words (never 0 or a
 * blank) for a missing value, typed text that looks like a formula kept as a string, the CSV through the formula guard,
 * and the JSON. Invented names and figures only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const A = await import('../app/abstracts.js');
const X = await import('../app/abstractexport.js');
const { VERSION } = await import('../app/exporters.js');

const dec = new TextDecoder();
const deal = { name: 'Invented Plaza (fictional)', figures: { address: '100 Example Way', city: 'Sampleton', state: 'ZZ' }, dd: { v: 1, preset: null, na: {}, docs: [{ id: 'dd_amend', name: 'First amendment.pdf', type: 'amendment', kind: 'pdf', size: 1, status: 'received' }] } };

/** An abstract with a header, three steps (4.25, then 4.3775 a foot, then a part year), an option and a note. */
function sample(title = 'Example Cafe') {
  const ab = A.newAbstract({ title, now: '2026-10-31T10:00:00.000Z' });
  A.setValue(ab, 'tenant', 'Example Cafe LLC');
  A.setValue(ab, 'sf', 12000, { basis: 'rentable' });
  A.setValue(ab, 'proRata', 7.35);
  A.setValue(ab, 'proRataCovers', 'real estate taxes');
  A.setValue(ab, 'deposit', 0);
  A.setNotFound(ab, 'guarantor');
  A.setValue(ab, 'commencement', '2027-01-01');
  A.setValue(ab, 'expiration', '2029-06-30');
  const t = A.addTerm(ab, { kind: 'initial', label: 'Original term', ref: '3.1' }).term;
  A.addStep(ab, t.id, { from: '2027-01-01', to: '2027-12-31', primary: 'psf_year', basis: 'rentable', amounts: { psf_year: 4.25 } });
  A.addStep(ab, t.id, { from: '2028-01-01', to: '2028-12-31', primary: 'month', amounts: { month: 4377.5 } });
  A.addStep(ab, t.id, { from: '2029-01-01', to: '2029-06-30', primary: 'year', amounts: { year: 27000 } });
  A.addOption(ab, { kind: 'renewal', count: 2, termMonths: 60, noticeMin: 6, noticeMax: 12 });
  A.setValue(ab, 'cBaseRent', 'Base rent is payable monthly in advance.');
  return { ab, t };
}
const build = (abstracts, o = {}) => X.buildAbstractWorkbook(ExcelJS, { deal, abstracts, fflate, ...o });
async function load(bytes) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes); return wb; }
const sheetXml = (bytes, n) => dec.decode(fflate.unzipSync(new Uint8Array(bytes))[`xl/worksheets/sheet${n}.xml`]);

test('single workbook: one sheet named from the title, the header grid, and the rent block with formulas only in the template cells', async () => {
  const { ab, t } = sample();
  const wb = await load(await build([ab]));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Example Cafe']);
  const ws = wb.worksheets[0];
  assert.equal(ws.getCell('A1').value, 'Example Cafe');
  assert.match(ws.getCell('A2').value, /^As of /);
  assert.match(ws.getCell('A3').value, /100 Example Way/);
  for (const [a, w] of [['A5', 'Tenant →'], ['A6', 'Property ID →'], ['A7', 'Address →'], ['A8', 'Pro-rata share * →'], ['A9', 'SF (rentable) →'], ['E5', 'Deposit →'], ['E6', 'Commencement →'], ['E7', 'Rent commencement →'], ['E8', 'Expiration →'], ['E9', 'Term →']]) assert.equal(ws.getCell(a).value, w, a);
  assert.equal(ws.getCell('B5').value, 'Example Cafe LLC');
  assert.equal(ws.getCell('B8').value, 0.0735);
  assert.equal(ws.getCell('B8').numFmt, '0.00%');
  assert.equal(ws.getCell('B9').value, 12000);
  assert.equal(ws.getCell('A10').value, '* Pro-rata share covers: real estate taxes');
  const b = A.rentBlock(ab, t.id);
  // the block starts under the rate note
  let r = 1; while (ws.getCell(`A${r}`).value !== 'Period') r++;
  const first = r + 1;
  b.rows.forEach((row, i) => {
    const n = first + i;
    assert.equal(ws.getCell(`D${n}`).value, row.months);
    assert.equal(ws.getCell(`E${n}`).value, row.monthly);
    assert.deepEqual(ws.getCell(`F${n}`).value, { formula: `ROUND(E${n}*D${n},2)`, result: row.total });
    assert.deepEqual(ws.getCell(`G${n}`).value, { formula: `ROUND(E${n}*12/$B$9,4)`, result: row.annualPsf });
    assert.equal(ws.getCell(`E${n}`).numFmt, '"$"#,##0.00');
    assert.ok(ws.getCell(`B${n}`).value instanceof Date);
    assert.equal(ws.getCell(`B${n}`).numFmt, 'm/d/yyyy');
  });
  const tot = first + b.rows.length;
  assert.equal(ws.getCell(`A${tot}`).value, 'Total');
  assert.deepEqual(ws.getCell(`D${tot}`).value, { formula: `SUM(D${first}:D${tot - 1})`, result: b.total.months });
  assert.deepEqual(ws.getCell(`F${tot}`).value, { formula: `SUM(F${first}:F${tot - 1})`, result: b.total.total });
  assert.deepEqual(ws.getCell(`H${tot}`).value, { formula: `ROUND(F${tot}/(D${tot}/12)/$B$9,4)`, result: b.total.weighted });
  assert.equal(b.total.total, 51000 + 52530 + 13500);
  // formulas appear in no other cell
  const cells = []; ws.eachRow((row) => row.eachCell((c) => { if (c.value && typeof c.value === 'object' && 'formula' in c.value) cells.push(c.address); }));
  assert.deepEqual(cells.sort(), [...b.rows.flatMap((_, i) => [`F${first + i}`, `G${first + i}`]), `D${tot}`, `F${tot}`, `H${tot}`].sort());
  const xml = sheetXml(await build([ab]), 1);
  assert.equal((xml.match(/<f>/g) || []).length, cells.length, 'the sheet XML holds <f> in the template cells only');
  // the rate is labelled
  let note = false; ws.eachRow((row) => row.eachCell((c) => { if (c.value === X.RATE_NOTE) note = true; }));
  assert.ok(note, 'the annual rate per SF is labelled: monthly x 12 / rentable SF');
  // the options row, in numbers
  let opt = null; ws.eachRow((row) => { if (row.getCell(1).value === 'Renewal') opt = row; });
  assert.equal(opt.getCell(2).value, '2 x 60 months');
  assert.equal(opt.getCell(4).value, 'not less than 6 nor more than 12 months before expiration');
  // notes, numbered
  let note1 = null; ws.eachRow((row) => { if (/^4\) Base rent:/.test(String(row.getCell(1).value))) note1 = row.getCell(1).value; });
  assert.equal(note1, '4) Base rent: Base rent is payable monthly in advance.');
});

test('missing values are words, never 0 and never blank', async () => {
  const { ab } = sample();
  const ws = (await load(await build([ab]))).worksheets[0];
  assert.equal(ws.getCell('B6').value, 'Not yet abstracted', 'unread');
  assert.equal(ws.getCell('G5').value, 'None ($0.00)', 'a found zero');
  const flags = []; ws.eachRow((row) => { const v = row.getCell(10).value; if (v && row.number >= 5) flags.push(String(v)); });
  assert.ok(flags.includes('Guarantor: not found in lease'));
  assert.ok(flags.includes('Property ID: not yet abstracted'));
  assert.ok(flags.includes('Tenant: not checked'));
  assert.ok(flags.some((f) => /Security deposit: marked none, with no page, quote or note/.test(f)), 'a check shows as a flag');
  // an unresolved step prints its period words and no total
  const t = ab.terms[0];
  A.addStep(ab, t.id, { mFrom: 1, mTo: 12, primary: 'year', amounts: { year: 1 } });
  const ws2 = (await load(await build([ab]))).worksheets[0];
  let rel = null; ws2.eachRow((row) => { if (row.getCell(2).value === 'depends on rent commencement') rel = row; });
  assert.ok(rel, 'depends on rent commencement');
  let tot = null; ws2.eachRow((row) => { if (row.getCell(1).value === 'Total') tot = row; });
  assert.match(String(tot.getCell(2).value), /No total/);
  // a term not quantified in the lease
  const ab3 = A.newAbstract({ title: 'Other' });
  A.addTerm(ab3, { kind: 'renewal', label: 'Renewal term', ref: '5', unquantified: true });
  const ws3 = (await load(await build([ab3]))).worksheets[0];
  let nq = null; ws3.eachRow((row) => { if (/^Not quantified in lease/.test(String(row.getCell(1).value))) nq = row.getCell(1).value; });
  assert.equal(nq, 'Not quantified in lease (§5)');
  // and a not-found field in the grid
  const ab4 = A.newAbstract({ title: 'Four' }); A.setNotFound(ab4, 'tenant');
  assert.equal((await load(await build([ab4]))).worksheets[0].getCell('B5').value, 'Not found in lease');
});

test('a superseding term is headed with its document and date', async () => {
  const { ab } = sample('Amended');
  const t2 = A.addTerm(ab, { kind: 'renewal', label: 'Amended rent', ref: '2', doc: 'dd_amend', effective: '2028-01-01', supersedes: true }).term;
  A.addStep(ab, t2.id, { from: '2028-01-01', to: '2029-06-30', primary: 'month', amounts: { month: 5000 } });
  const ws = (await load(await build([ab]))).worksheets[0];
  assert.equal(ws.getCell('A1').value, 'Amended (as amended)');
  let head = null; ws.eachRow((row) => { if (/^Amended rent/.test(String(row.getCell(1).value))) head = row.getCell(1).value; });
  assert.match(head, /§2.*per First amendment\.pdf, effective 01\/01\/2028, supersedes the original/);
});

test('portfolio: a Summary sheet first, then one sheet per abstract, with unique names of at most 31 characters', async () => {
  const a = sample('Cafe: lease [1]').ab; const b = sample('Cafe: lease [1]').ab; const c = sample('Summary').ab; const d = sample('X'.repeat(80)).ab; const e = sample('').ab;
  const bytes = await build([a, b, c, d, e], { portfolio: true, today: '2026-10-31' });
  const wb = await load(bytes);
  const names = wb.worksheets.map((w) => w.name);
  assert.equal(names[0], 'Summary');
  assert.equal(names.length, 6);
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, 6, 'unique');
  assert.ok(names.every((n) => n.length <= 31 && !/[[\]:*?/\\]/.test(n)), names.join('|'));
  assert.deepEqual(names.slice(1, 3), ['Cafe lease 1', 'Cafe lease 1 (2)']);
  assert.equal(names[3], 'Summary (2)');
  const s = wb.worksheets[0];
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map((i) => s.getCell(3, i).value), ['Abstract', 'Tenant', 'Suite', 'Square feet', 'Expiration', 'Current monthly rent', 'Next critical date', 'Open flags']);
  assert.equal(s.getCell('B4').value, 'Example Cafe LLC');
  assert.equal(s.getCell('F4').value, 'no step in force', 'no as-of date: blank rent with the reason, not 0');
  assert.match(s.getCell('G4').value, /Expiration|Option|starts/);
  assert.ok(s.getCell('H4').value > 0);
  // with an as-of date, the step in force
  a.asOf = '2028-03-15';
  const s2 = (await load(await build([a], { portfolio: true, today: '2026-10-31' }))).worksheets[0];
  assert.equal(s2.getCell('F4').value, 4377.5);
});

test('next critical date: the earliest resolved date after today; the current rent is the step in force', () => {
  const { ab } = sample();
  assert.deepEqual(X.nextCritical(ab, '2026-10-31'), { date: '2027-01-01', what: 'Year 1 starts' });
  // the renewal notice window opens 12 months before the expiration and closes 6 months before it
  const late = X.nextCritical(ab, '2029-01-01');
  assert.equal(late.date, '2029-06-30', 'steps are over: the expiration; the notice dates are in the past');
  const early = sample().ab; early.steps = [];
  assert.deepEqual(X.nextCritical(early, '2027-01-01'), { date: '2028-06-30', what: 'Renewal notice window opens' });
  assert.equal(X.nextCritical(early, '2030-01-01'), null);
  assert.equal(X.currentRent(ab), null);
  ab.asOf = '2027-06-01'; assert.equal(X.currentRent(ab), 4250);
  ab.asOf = '2031-01-01'; assert.equal(X.currentRent(ab), null);
});

test('typed text that looks like a formula, a link or markup stays a plain string cell', async () => {
  const { ab } = sample();
  const evil = '=HYPERLINK("http://example.invalid","click")';
  A.setValue(ab, 'tenant', evil);
  A.setValue(ab, 'tradeName', '+SUM(1,1)');
  A.setValue(ab, 'premisesAddress', '@cmd|\' /C calc\'!A0');
  A.setValue(ab, 'cPossession', '\u0000\u0007ok\u001f\nsecond line');
  A.setValue(ab, 'cDeposit', 'z'.repeat(1000));
  A.addFlag(ab, '-2+3');
  A.setValue(ab, 'escalation', '-5% then =A1');
  A.setNote(ab, 'tenant', '=1+1');
  const bytes = await build([ab]);
  const xml = sheetXml(bytes, 1);
  const formulas = xml.match(/<f>[^<]*<\/f>/g) || [];
  assert.ok(formulas.length > 0 && formulas.every((f) => /^<f>(ROUND\(E\d+\*D\d+,2\)|ROUND\(E\d+\*12\/\$B\$9,4\)|SUM\([DF]\d+:[DF]\d+\)|ROUND\(F\d+\/\(D\d+\/12\)\/\$B\$9,4\))<\/f>$/.test(f)), 'only the fixed templates');
  assert.ok(!/HYPERLINK/.test(formulas.join('')), 'the typed link is not a formula');
  assert.ok(!/<hyperlink/.test(xml) && !/hyperlinks/.test(Object.keys(fflate.unzipSync(new Uint8Array(bytes))).join()), 'no hyperlink part');
  const ws = (await load(bytes)).worksheets[0];
  const cellOf = (v) => { let hit = null; ws.eachRow((row) => row.eachCell((c) => { if (c.value === v) hit = c; })); return hit; };
  for (const v of [evil, '+SUM(1,1)', '@cmd|\' /C calc\'!A0']) { const c = cellOf(v); assert.ok(c, v); assert.equal(typeof c.value, 'string'); }
  assert.equal(typeof cellOf('-5% then =A1').value, 'string', 'a value the grid does not show is in Other terms');
  assert.ok(cellOf('ok\nsecond line') === null, 'control characters are removed from the cell');
  let possession = null; ws.eachRow((row) => { if (/^8\) Possession:/.test(String(row.getCell(1).value))) possession = row.getCell(1).value; });
  assert.equal(possession, '8) Possession: ok\nsecond line');
  assert.equal(X.scrub('a\u0000b\u0007c\td\ne'), 'abcd\ne', 'control characters go, a line feed stays');
  assert.equal(X.scrub('x'.repeat(40000)).length, 32767);
});

test('the package is clean and a confidential deal is marked on every sheet', async () => {
  const { ab } = sample();
  const bytes = await build([ab, sample('Second').ab], { portfolio: true });
  const files = fflate.unzipSync(new Uint8Array(bytes));
  assert.ok(Object.keys(files).every((n) => !n.endsWith('/')), 'no directory entries');
  assert.ok(dec.decode(files['xl/workbook.xml']).includes('fullCalcOnLoad'));
  assert.ok(!/CONFIDENTIAL/.test(dec.decode(files['xl/worksheets/sheet1.xml'])));
  const wb = await load(await X.buildAbstractWorkbook(ExcelJS, { deal: { ...deal, confidential: true }, abstracts: [ab], fflate }));
  assert.match(wb.worksheets[0].headerFooter.oddHeader, /CONFIDENTIAL/);
  assert.match(wb.worksheets[0].headerFooter.oddFooter, /CONFIDENTIAL/);
  assert.equal(wb.creator, 'Zlatura');
});

test('CSV: every cell through the formula guard, CRLF line ends, the page but never the quote', () => {
  const { ab } = sample();
  A.setValue(ab, 'tenant', '=1+1');
  A.setEvidence(ab, 'tenant', [{ page: 2, quote: 'SECRET QUOTE TEXT' }]);
  A.setValue(ab, 'tradeName', 'Cafe, "The"');
  A.addFlag(ab, '@SUM(A1)');
  const csv = X.abstractCsv(deal, [ab]);
  const lines = csv.split('\r\n');
  assert.equal(lines.at(-1), '', 'ends with CRLF');
  assert.equal(lines[0], 'Abstract,Section,Item,Value,Unit,Basis,Status,Checked,Page');
  assert.ok(lines.includes("Example Cafe,Parties and notices,Tenant,'=1+1,,,found,no,2"), '=1+1 becomes \'=1+1, with its page');
  assert.ok(lines.some((l) => l.includes('"Cafe, ""The"""')));
  assert.ok(lines.some((l) => l.includes("'@SUM(A1)")));
  assert.ok(!csv.includes('SECRET QUOTE TEXT'), 'quotes are not in the CSV');
  assert.ok(csv.split('\n').every((l, i, a) => i === a.length - 1 || l.endsWith('\r')), 'no bare line feed');
  assert.ok(lines.some((l) => /^Example Cafe,Rent,Original term: Year 1,4.25,psf_year,rentable,found,no,$/.test(l)), 'a step is one row with its primary amount');
  assert.ok(lines.some((l) => /,Security deposit,0,total,,found,no,$/.test(l)), 'a found zero is 0, with the status found');
  assert.ok(lines.some((l) => /,Guarantor,,,,not-found,no,$/.test(l)), 'not found is blank with the status, never 0');
});

test('JSON: the quotes are in, it round-trips through the normaliser, and the confidential flag is carried', () => {
  const { ab } = sample();
  A.setEvidence(ab, 'tenant', [{ page: 2, quote: 'Tenant means Example Cafe LLC.' }]);
  const text = X.abstractJson(deal, [ab], VERSION);
  const j = JSON.parse(text);
  assert.equal(j.format, 'zlatura-abstracts');
  assert.equal(j.v, 1);
  assert.equal(j.app, VERSION);
  assert.equal(j.confidential, false);
  assert.equal(j.deal, 'Invented Plaza (fictional)');
  assert.equal(j.abstracts[0].fields.tenant.src[0].quote, 'Tenant means Example Cafe LLC.');
  assert.deepEqual(A.normAbstracts({ items: j.abstracts }).items, j.abstracts);
  assert.equal(JSON.parse(X.abstractJson({ ...deal, confidential: true }, [ab], VERSION)).confidential, true);
});

test('titles ExcelJS refuses (History, edge apostrophes) get safe, unique sheet names, and blank, duplicate and long titles still work', async () => {
  const titles = ['History', 'history', "'Quoted", "Quoted'", "'", '', '', 'Same', 'Same', 'A'.repeat(31), 'A'.repeat(31), 'B'.repeat(60)];
  const list = titles.map((t) => sample(t).ab);
  for (const portfolio of [false, true]) {
    const wb = await load(await build(portfolio ? list : [list[0], list[1]], { portfolio }));
    const names = wb.worksheets.map((w) => w.name);
    assert.equal(new Set(names.map((n) => n.toLowerCase())).size, names.length, names.join('|'));
    assert.ok(names.every((n) => n.length <= 31 && n.length > 0 && !/[[\]:*?/\\]/.test(n) && !/^'|'$/.test(n) && n.toLowerCase() !== 'history'), names.join('|'));
  }
});
