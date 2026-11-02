/* The comp importer (app/compimport.js): the heading row, the column match, every unit and date rule, the questions it must ask, the
 * dedup, provenance, remembered layouts and hostile files. Every file here is built in the test and invented. */
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { csvRows, gridsOf } from '../app/sheetread.js';
import { compsCsv, CSV_HEADINGS } from '../app/exporters.js';
import {
  normHeader, findHeader, suggestMapping, startAnswers, questionsFor, setAnswer, readRows, dupeOf, addressKey, matchProfile,
  headerFingerprint, normMappings, rememberMapping, mappingRecord, templateCsv, PROFILES, MAX_ROWS,
} from '../app/compimport.js';
import { blankComp } from '../app/compmodel.js';

const NOW = new Date(Date.UTC(2026, 9, 31, 12));
const grid = (csv) => ({ sheet: 'CSV', delimiter: ',', rows: csvRows(csv).map((cells, i) => ({ r: i + 1, cells })).filter((x) => x.cells.some((v) => v.trim())) });
/** Map a CSV the way the screen does; `give` answers the questions by key (or by "status:<value>"). Returns { res, qs, mapping, answers }. */
function run(csv, give = {}, ctx = {}, remembered = null) {
  const g = typeof csv === 'string' ? grid(csv) : csv;
  const hd = findHeader(g);
  const mapping = suggestMapping(hd.headers, remembered);
  const answers = startAnswers(g, mapping);
  for (const qn of questionsFor(g, mapping, answers)) {
    const k = qn.statusValue !== undefined ? `status:${qn.statusValue}` : qn.key;
    if (k in give) setAnswer(answers, qn, give[k]);
  }
  const qs = questionsFor(g, mapping, answers);
  const res = readRows(g, mapping, answers, { file: 'f.csv', source: 'Firm sheet', existing: [], now: NOW, ...ctx });
  return { res, qs, mapping, answers, g };
}
const keys = (qs) => qs.map((x) => x.key || x.id);
const open = (qs) => qs.filter((x) => x.block || !x.options.some((o) => o[0] === x.value));
const one = (csv, give, ctx) => { const { res } = run(csv, give, ctx); assert.equal(res.refuse, null, res.refuse); return res.rows[0]; };
const H = 'Property,Address,City,Status,Sale Price,Sale Date,SF';

test('the heading row: none, two, a note above it, and the size limits, each with its words', () => {
  assert.equal(findHeader(grid('hello\n1,2,3\n4,5,6')).refuse, 'No row of column headings was found.');
  const two = findHeader(grid('Address,City,Price\nAddress,City,Price\n1 A St,X,5'));
  assert.equal(two.refuse, 'Rows 1 and 2 both look like headings. Delete one and try again.');
  const ok = findHeader(grid('Sales ($ in thousands)\n\nAddress,City,Price\n1 A St,X,5'));
  assert.equal(ok.idx, 1); assert.equal(ok.r, 3); assert.match(ok.preamble, /in thousands/);
  const none = findHeader(grid('Foo,Bar,Baz\n1,2,3'));
  assert.equal(none.noMatch, true);
  assert.deepEqual(suggestMapping(none.headers).columns, ['none', 'none', 'none']);
  const many = grid(`Address,City,Price\n${'1 A St,X,5\n'.repeat(MAX_ROWS + 1)}`);
  assert.match(findHeader(many).refuse, /This file has 2,001 rows; the importer reads up to 2,000\. Split it and import each part\./);
  assert.equal(findHeader(grid(`Address,City,Price\n${'1 A St,X,5\n'.repeat(MAX_ROWS)}`)).refuse, undefined);
  assert.match(findHeader(grid(`Address,${Array.from({ length: 100 }, (_, i) => `C${i}`).join(',')}\n1,2`)).refuse, /101 columns/);
});

test('headings match exact synonyms only; "$/SF" is not building SF, rent columns are ignored, the CoStar ID needs the template', () => {
  assert.equal(normHeader('Sale Price ($000s)'), 'sale price');
  assert.equal(normHeader('$/SF'), 'per sf');
  assert.equal(normHeader('Land & Lot'), 'land and lot');
  const m = suggestMapping(['Address', 'Sale Price', '$/SF', 'SF', 'Rent $/SF/yr', 'Asking Rent', 'CoStar ID', 'Wibble', 'GLA']);
  assert.deepEqual(m.columns, ['address', 'price_sale', 'ppsf', 'bsf', 'rent', 'rent', 'none', 'none', 'bsf'].map((x, i) => (i === 3 || i === 8 ? null : x)));
  assert.equal(matchProfile(['Set', 'Address', 'Price']).id, 'zlatura-comps');
  assert.equal(matchProfile(['Address', 'Price']), null);
});

test('a missing required column is a reason, nothing is half-imported', () => {
  const { qs, res } = run('Property,City,Price\nA,X,5');
  assert.ok(qs.some((x) => /Address/.test(x.block)));
  assert.match(res.refuse, /Address/);
  assert.deepEqual(res.comps, []);
  assert.match(run('Property,Address,City\nA,1 A St,X').res.refuse, /price or a status/);
});

test('cap rate: 0.065 asks, 6.5 does not, a mix fails, a % settles it, above 25 warns, NOI is only a check', () => {
  const base = 'Address,Status,Price,Cap Rate,NOI';
  let r = run(`${base}\n1 A St,Sold,1000000,0.065,65000\n2 B St,Sold,2000000,0.07,`);
  assert.deepEqual(keys(r.qs), ['cap']);
  assert.match(r.res.refuse, /Answer first/);
  r = run(`${base}\n1 A St,Sold,1000000,0.065,65000\n2 B St,Sold,2000000,0.07,`, { cap: 'fraction' });
  assert.deepEqual(r.res.comps.map((c) => c.cap), [6.5, 7]);
  r = run(`${base}\n1 A St,Sold,1000000,0.065,65000`, { cap: 'percent' });
  assert.equal(r.res.comps[0].cap, 0.065);
  assert.deepEqual(keys(run(`${base}\n1 A St,Sold,1000000,6.5,\n2 B St,Sold,2000000,7.25,`).qs), []);
  const mixed = run(`${base}\n1 A St,Sold,1000000,0.065,\n2 B St,Sold,2000000,7.25,`, { cap: 'fraction' });
  assert.ok(mixed.qs.some((x) => x.fail), 'a mixed column fails');
  assert.ok(mixed.res.refuse && mixed.res.comps.length === 0);
  assert.deepEqual(keys(run('Address,Status,Price,Cap Rate %\n1 A St,Sold,1000000,6.5').qs), [], 'a % in the heading settles percent against fraction when values are above 1');
  assert.deepEqual(keys(open(run('Address,Status,Price,Cap Rate %\n1 A St,Sold,1000000,0.065').qs)), ['cap'], 'but 0.065 under a % heading is asked, not stored as 0.065%');
  const pm = run('Address,Status,Price,Cap Rate %\n1 A St,Sold,1000000,0.065\n2 B St,Sold,2000000,6.5', { cap: 'fraction' });
  assert.ok(pm.qs.some((x) => x.fail) && pm.res.comps.length === 0, 'a mix of 0.065 and 6.5 fails even under a % heading');
  const xg = { sheet: 'S', rows: [{ r: 1, cells: ['Address', 'Status', 'Price', 'Cap Rate %'] }, { r: 2, cells: ['1 A St', 'Sold', 5, 0.065] }] };
  const xm = suggestMapping(xg.rows[0].cells);
  assert.deepEqual(keys(open(questionsFor(xg, xm, startAnswers(xg, xm)))), ['cap'], 'a percent-formatted cell arrives as 0.065 and is asked');
  assert.equal(run('Address,Status,Price,Cap Rate\n1 A St,Sold,1000000,6.5%').res.comps[0].cap, 6.5);
  assert.ok(one('Address,Status,Price,Cap Rate\n1 A St,Sold,1000000,31').checks.some((c) => /above 25%/.test(c.text)));
  const x = one('Address,Status,Price,Cap Rate,NOI\n1 A St,Sold,1000000,6.5,80000');
  assert.ok(x.checks.some((c) => /NOI ÷ price/.test(c.text)));
  assert.equal(x.comp.cap, 6.5, 'cap is never worked out from NOI and price');
  assert.ok(!one('Address,Status,Price,Cap Rate,NOI\n1 A St,Sold,1000000,6.5,65100').checks.some((c) => /NOI/.test(c.text)));
});

test('a remembered answer is pre-selected but re-checked: percent remembered with every value at 1 or below is asked again', () => {
  const csv = 'Address,Status,Price,Cap Rate\n1 A St,Sold,1000000,0.065';
  const rec = { source: 'Firm', columns: { address: 'address', status: 'status', price: 'price', 'cap rate': 'cap' }, answers: { cap: 'percent', kind: 'sale' }, statusMap: {}, uses: 2 };
  const a = run(csv, {}, {}, rec);
  assert.equal(a.mapping.how, 'remembered');
  assert.deepEqual(keys(open(a.qs)), ['cap'], 'asked again');
  const b = run(csv, {}, {}, { ...rec, answers: { cap: 'fraction' } });
  assert.deepEqual(keys(open(b.qs)), []);
  assert.equal(b.res.comps[0].cap, 6.5);
  const c = run('Address,Status,Price,Cap Rate\n1 A St,Sold,1000000,0.065\n2 B St,Sold,1000000,7', {}, {}, { ...rec, answers: { cap: 'fraction' } });
  assert.ok(c.qs.some((x) => x.fail), 'a mixed column still fails with a remembered answer');
});

test('sale or asking: a status maps, an unknown status asks, a bare price asks, two prices ask, a Sold row with only an asking price gets null', () => {
  const r = run(`${H}\nA,1 A St,X,Sold,1000000,2026-01-02,1000\nB,2 A St,X,Active,900000,,1000\nC,3 A St,X,Leased,1,,1\nD,4 A St,X,Mystery,5,,1`, { basis: 'rentable' });
  assert.deepEqual(open(r.qs).map((x) => x.id), ['status:mystery']);
  const k = run(`${H}\nA,1 A St,X,Sold,1000000,2026-01-02,1000\nB,2 A St,X,Active,900000,,1000\nC,3 A St,X,Leased,1,,1\nD,4 A St,X,Mystery,5,,1`, { basis: 'rentable', 'status:mystery': 'market' });
  assert.deepEqual(k.res.rows.map((x) => x.status), ['add', 'add', 'out', 'add']);
  assert.deepEqual(k.res.comps.map((c) => c.kind), ['sale', 'market', 'market']);
  assert.equal(k.res.rows[2].why, 'Leased');
  assert.equal(run('Address,City,Price\n1 A St,X,5').qs[0].text, 'Are these sale prices or asking prices?');
  assert.equal(run('Address,City,Price\n1 A St,X,5', { kind: 'market' }).res.comps[0].kind, 'market');
  const both = run('Address,Sale Price,Asking Price\n1 A St,1000000,\n2 B St,,900000');
  assert.equal(both.qs[0].text, 'Rows with a sale price are sales?');
  assert.equal(run('Address,Sale Price,Asking Price\n1 A St,1000000,\n2 B St,,900000', { both: 'yes' }).res.comps.map((c) => c.kind).join(), 'sale,market');
  assert.match(run('Address,Sale Price,Asking Price\n1 A St,1000000,\n2 B St,,900000', { both: 'map' }).res.refuse, /Set a column to Status/);
  const sold = one('Address,Status,Asking Price\n1 A St,Sold,950000');
  assert.equal(sold.comp.price, null);
  assert.ok(sold.checks.some((c) => /asking price is not a sale price/.test(c.text)));
});

test('price: $ in thousands and $12.5M scale, $/SF never does, a $0 price is flagged and a price is never made from $/SF', () => {
  let r = one('Sales ($ in thousands)\nAddress,Status,Sale Price,Price per SF,SF\n1 A St,Sold,"1,200",150.25,8000', { basis: 'rentable' });
  assert.equal(r.comp.price, 1200000);
  assert.equal(r.comp.reported_ppsf, 150.25);
  assert.equal(one('Address,Status,Sale Price ($000s)\n1 A St,Sold,1200').comp.price, 1200000);
  assert.equal(one('Address,Status,Sale Price\n1 A St,Sold,$12.5M').comp.price, 12500000);
  assert.equal(one('Address,Status,Sale Price\n1 A St,Sold,"(1,000)"').comp.price, null);
  r = one('Address,Status,Sale Price\n1 A St,Sold,0');
  assert.equal(r.comp.price, 0); assert.ok(r.checks.some((c) => /price is 0/.test(c.text)));
  r = one('Address,Status,Price per SF,SF\n1 A St,Sold,200,5000', { basis: 'rentable' });
  assert.equal(r.comp.price, null, 'no price from $/SF times SF');
  r = one('Address,Status,Sale Price,Price per SF,SF\n1 A St,Sold,1000000,150,5000', { basis: 'rentable' });
  assert.ok(r.checks.some((c) => /more than 1%/.test(c.text)));
  assert.ok(!one('Address,Status,Sale Price,Price per SF,SF\n1 A St,Sold,1000000,200,5000', { basis: 'rentable' }).checks.some((c) => /more than 1%/.test(c.text)));
  assert.ok(run('Address,Status,Sale Price\n1 A St,Sold,1200\n2 B St,Sold,900').res.checks.some((c) => /in thousands/.test(c.text)));
  assert.ok(!run('Address,Status,Sale Price ($000s)\n1 A St,Sold,1200').res.checks.some((c) => /in thousands/.test(c.text)));
});

test('land: acres are worked out to SF and flagged, SF stays, a bare size asks, under 100 SF warns', () => {
  let r = one('Address,Status,Price,Land Acres\n1 A St,Sold,5,1.5');
  assert.equal(r.comp.lot_ac, 1.5); assert.equal(r.comp.lot_sf, 65340);
  assert.ok(r.comp.flags.some((f) => /lot SF worked out from 1\.5 acres/.test(f)));
  r = one('Address,Status,Price,Lot SF\n1 A St,Sold,5,43560');
  assert.equal(r.comp.lot_sf, 43560); assert.equal(r.comp.lot_ac, null);
  assert.equal(run('Address,Status,Price,Lot Size\n1 A St,Sold,5,2').qs[0].key, 'lot');
  assert.equal(one('Address,Status,Price,Lot Size\n1 A St,Sold,5,2', { lot: 'ac' }).comp.lot_sf, 87120);
  assert.equal(one('Address,Status,Price,Lot Size\n1 A St,Sold,5,2', { lot: 'sf' }).comp.lot_ac, null);
  assert.ok(one('Address,Status,Price,Lot SF\n1 A St,Sold,5,2').checks.some((c) => /under 100/.test(c.text)));
});

test('building area basis: RBA is rentable, GBA gross, GLA and a bare SF are asked; gross or unknown comps are set aside whole', () => {
  assert.deepEqual(keys(run('Address,Status,Price,RBA\n1 A St,Sold,5,9000').qs), []);
  assert.equal(one('Address,Status,Price,RBA\n1 A St,Sold,5,9000').comp.bsf_basis, 'rentable');
  assert.equal(one('Address,Status,Price,RBA\n1 A St,Sold,5,9000').comp.exclude, false);
  assert.deepEqual(keys(run('Address,Status,Price,GLA\n1 A St,Sold,5,9000').qs), ['basis'], 'GLA is asked, not assumed rentable');
  assert.deepEqual(keys(run('Address,Status,Price,Building SF\n1 A St,Sold,5,9000').qs), ['basis']);
  const g = one('Address,Status,Price,GBA\n1 A St,Sold,5,9000');
  assert.equal(g.comp.bsf_basis, 'gross'); assert.equal(g.comp.exclude, true);
  assert.ok(g.comp.flags.some((f) => /gross, not rentable: set aside/.test(f)));
  assert.equal(one('Address,Status,Price,GLA\n1 A St,Sold,5,9000', { basis: 'unknown' }).comp.exclude, true);
  assert.equal(one('Address,Status,Price,GLA\n1 A St,Sold,5,9000', { basis: 'rentable' }).comp.exclude, false);
  assert.equal(one('Address,Status,Price\n1 A St,Sold,5').comp.exclude, false, 'no area, nothing to set aside');
  assert.ok(run('Address,Status,Price,RBA,GBA\n1 A St,Sold,5,9000,9500').qs.some((x) => x.block), 'two area columns are asked which one');
});

test('dates: an Excel serial, ISO, month first; day first asks or is settled by a 25th; both orders fail; a listing ignores its date', () => {
  const d = (csv, give) => one(csv, give).comp.date;
  assert.equal(d('Address,Status,Price,Sale Date\n1 A St,Sold,5,2026-03-04').toISOString(), '2026-03-04T00:00:00.000Z');
  assert.equal(run('Address,Status,Price,Sale Date\n1 A St,Sold,5,03/04/2026').qs[0].text, '03/04/2026 is March 4 or April 3?');
  assert.equal(d('Address,Status,Price,Sale Date\n1 A St,Sold,5,03/04/2026', { date: 'mdy' }).toISOString(), '2026-03-04T00:00:00.000Z');
  assert.equal(d('Address,Status,Price,Sale Date\n1 A St,Sold,5,03/04/2026', { date: 'dmy' }).toISOString(), '2026-04-03T00:00:00.000Z');
  assert.equal(d('Address,Status,Price,Sale Date\n1 A St,Sold,5,25/04/2026\n2 B St,Sold,5,03/04/2026').toISOString(), '2026-04-25T00:00:00.000Z');
  assert.ok(run('Address,Status,Price,Sale Date\n1 A St,Sold,5,25/04/2026\n2 B St,Sold,5,04/25/2026').qs.some((x) => x.fail));
  assert.equal(one('Address,Status,Price,Sale Date\n1 A St,Active,5,2026-03-04').comp.date, null);
  assert.ok(one('Address,Status,Price,Sale Date\n1 A St,Active,5,2026-03-04').checks.some((c) => /ignored/.test(c.text)));
  const g = { sheet: 'S', rows: [{ r: 1, cells: ['Address', 'Status', 'Price', 'Sale Date'] }, { r: 2, cells: ['1 A St', 'Sold', 5, (Date.UTC(2026, 2, 4) - Date.UTC(1899, 11, 30)) / 864e5] }] };
  assert.equal(readRows(g, suggestMapping(g.rows[0].cells), startAnswers(g, suggestMapping(g.rows[0].cells)), { file: 'f.xlsx', now: NOW }).comps[0].date.toISOString(), '2026-03-04T00:00:00.000Z');
});

test('blanks are null, never 0: Undisclosed, n/a, a dash; an unreadable number warns and quotes the cell', () => {
  const r = one('Address,Status,Price,Cap Rate,Year Built\n1 A St,Sold,Undisclosed,n/a,-', { });
  assert.equal(r.comp.price, null); assert.equal(r.comp.cap, null); assert.equal(r.comp.year, null);
  assert.ok(r.checks.some((c) => /Undisclosed/.test(c.text) && c.level === 'info'));
  const bad = one('Address,Status,Price\n1 A St,Sold,call for price');
  assert.equal(bad.comp.price, null);
  assert.ok(bad.checks.some((c) => c.level === 'warn' && /“call for price”/.test(c.text)));
  assert.equal(one('Address,Status,Price,Year Built\n1 A St,Sold,5,1066').comp.year, null);
});

test('rent columns are not read, text is capped, state and ZIP are kept as text', () => {
  const r = run('Address,Status,Price,Asking Rent,State,ZIP\n1 A St,Sold,5,30,tx,02134-1234');
  assert.ok(r.res.checks.some((c) => /Rent columns are not read/.test(c.text)));
  assert.equal(r.res.comps[0].state, 'TX'); assert.equal(r.res.comps[0].zip, '02134');
  assert.equal(one('Address,Status,Price,State,ZIP\n1 A St,Sold,5,Texas,123').comp.state, null);
});

test('dedup: same sale, 31 versus 32 days, 1% versus 1.1%, parcel only, a resale at 183 days, a listing versus a sale, within the file', () => {
  const mk = (o) => Object.assign(blankComp(o.kind || 'sale'), { address: '100 Example Street', zip: '00001', ...o });
  const day = (n) => new Date(Date.UTC(2026, 0, 1) + n * 864e5);
  const ex = mk({ date: day(0), price: 1000000, name: 'X', source: 'costar-dc.pdf' });
  const lvl = (o) => (dupeOf(mk(o), [ex]) || {}).level || null;
  assert.equal(lvl({ date: day(31), price: 5 }), 'same');
  assert.equal(lvl({ date: day(32), price: 1000000 }), 'possible');
  assert.equal(lvl({ date: day(182) }), 'possible');
  assert.equal(lvl({ date: day(183) }), 'resale');
  assert.equal(lvl({ date: day(0), address: '100 EXAMPLE ST.' }), 'same', 'suffix and case');
  assert.equal(lvl({ date: day(0), address: '200 Example Street' }), null);
  assert.equal(lvl({ date: day(0), zip: '00002' }), null);
  const undated = mk({ price: 1000000, name: 'U' });
  const ul = (price) => (dupeOf(mk({ price }), [undated]) || {}).level;
  assert.equal(ul(1010000), 'same'); assert.equal(ul(1010100), 'possible');
  assert.equal(lvl({ date: null, price: 1000000 }), 'same');
  assert.equal(lvl({ address: 'Elsewhere Road', parcels: new Set(['ab 12']), date: day(40) }), null);
  const withParcel = mk({ date: day(0), parcels: new Set(['AB12']) });
  assert.equal(dupeOf(mk({ address: 'Elsewhere Road', parcels: new Set(['ab 12']), date: day(40) }), [withParcel]).level, 'same');
  assert.equal(dupeOf(mk({ address: 'Elsewhere Road', parcels: new Set(['ab 12']), date: day(400) }), [withParcel]).level, 'resale');
  assert.equal(lvl({ kind: 'market', date: null }), null, 'a listing is not compared with a sale');
  const r = run(`${H}\nA,100 Example Street,Town,Sold,100,2026-01-01,\nB,100 Example St,Town,Sold,100,2026-01-05,`, { basis: 'rentable' });
  assert.equal(r.res.rows[1].dupe.level, 'same', 'the second row repeats the first');
  assert.equal(addressKey({ address: '5 North Main Street.', city: 'Ab' }), '5 n main st|ab');
});

test('provenance: each comp says where it came from, its source text, and is set up like a hand comp', () => {
  const { res } = run('Address,Status,Price\n1 A St,Sold,5', {}, { sha256: 'a'.repeat(64), sheet: 'Sheet1' });
  const c = res.comps[0];
  assert.deepEqual(c.origin, { kind: 'import', source: 'Firm sheet', file: 'f.csv', sha256: 'a'.repeat(64), sheet: 'Sheet1', row: 2, page: null, profile: null, importedAt: NOW.toISOString() });
  assert.equal(c.source, 'Firm sheet (f.csv, row 2)');
  assert.equal(c.flags[0], 'imported from Firm sheet (f.csv, row 2) -- not from a CoStar report');
  assert.ok(c.manual && c.key.startsWith('import::') && c.bsf_basis === 'unknown');
});

test('layouts: the fingerprint ignores order and case; remembered layouts cap at 50 and cannot carry hostile keys', async () => {
  assert.equal(await headerFingerprint(['Address', 'Price ($)', 'City']), await headerFingerprint(['city', 'ADDRESS', 'price']));
  assert.notEqual(await headerFingerprint(['Address', 'Price']), await headerFingerprint(['Address', 'Cap']));
  const rec = { source: 'F', columns: { address: 'address' }, answers: {}, statusMap: {}, uses: 0, savedAt: 0 };
  let st = null;
  for (let i = 0; i < 52; i++) st = rememberMapping(st, i.toString(16).padStart(64, '0'), rec, 1000 + i);
  assert.equal(Object.keys(st.items).length, 50);
  assert.ok(!(`${'0'.repeat(64)}` in st.items) && '33'.padStart(64, '0') in st.items, 'the oldest are dropped');
  const again = rememberMapping(st, '33'.padStart(64, '0'), rec, 5000);
  assert.equal(again.items['33'.padStart(64, '0')].uses, 2);
  const n = normMappings({ items: { zz: rec, [`${'a'.repeat(64)}`]: { ...rec, columns: { __proto__x: 'price', ok: 'nope', 'good': 'cap', evil: '__proto__', e2: 'constructor' }, answers: { cap: 'fraction', bogus: 'x', kind: 'zzz' }, statusMap: { a: 'sale', b: 'wat' } } } });
  const kept = n.items['a'.repeat(64)];
  assert.deepEqual(Object.keys(n.items), ['a'.repeat(64)]);
  assert.deepEqual(kept.columns, { __proto__x: 'price', good: 'cap' });
  assert.deepEqual(kept.answers, { cap: 'fraction' }); assert.deepEqual(kept.statusMap, { a: 'sale' });
  assert.deepEqual(normMappings('junk'), { v: 1, items: {} });
  const m = mappingRecord(['Address', 'Price'], ['address', 'price'], { kind: 'sale', statusMap: new Map([['x', 'sale']]) }, 'F');
  assert.deepEqual(m.columns, { address: 'address', price: 'price' }); assert.deepEqual(m.statusMap, { x: 'sale' });
});

test('hostile files: __proto__ headings, 10,000-character cells, control characters, markup and formulas stay inert text', () => {
  const { res, mapping } = run('Address,__proto__,constructor,prototype,Status,Price,Notes\n"1 A St","x","y","z",Sold,5,"<img src=x onerror=alert(1)>"');
  assert.deepEqual(mapping.columns.slice(1, 4), ['none', 'none', 'none']);
  assert.equal(({}).polluted, undefined);
  assert.equal(res.comps[0].notes, '<img src=x onerror=alert(1)>');
  const long = one(`Address,Status,Price,Notes\n"${'x'.repeat(10000)}",Sold,5,"${'n'.repeat(10000)}"`).comp;
  assert.equal(long.address.length, 200); assert.equal(long.notes.length, 1000);
  assert.equal(one('Address,Status,Price,Property\n"1 A\u0007 St",Sold,5,"Bell\u0000"').comp.name, 'Bell');
  const f = one('Address,Status,Price\n=1+1,Sold,5').comp;
  assert.equal(f.address, '=1+1');
  assert.match(compsCsv([f], []), /'=1\+1/, 'the CSV export quotes a formula');
  assert.equal(normHeader('x'.repeat(5000)).length, 200);
});

test('every heading in the CSV export has a rule, and a Zlatura export imports back to the same comps', () => {
  const p = PROFILES[0];
  for (const h of CSV_HEADINGS) assert.ok(Object.hasOwn(p.columns, normHeader(h)), `${h} has no rule`);
  assert.deepEqual(templateCsv().split('\r\n')[0], `﻿${[...CSV_HEADINGS, 'Building SF Basis', 'Lot Acres', 'Parcel'].join(',')}`);
  const sale = Object.assign(blankComp('sale'), { name: 'Invented Plaza (fictional)', address: '100 Example Street', city: 'Sampleton', state: 'ZZ', zip: '00001', date: new Date(Date.UTC(2026, 2, 4)), price: 6450000.5, bsf: 24000, cap: 6.25, occ: 94, lot_sf: 43560, year: 1988, source: 'x.pdf' });
  const list = Object.assign(blankComp('market'), { name: 'Invented Court (fictional)', address: '7 Sample Court', dom: 45, price: 2400000, bsf: 9000, cap: null });
  const csv = compsCsv([sale], [list]);
  const r = run(csv, { basis: 'rentable' }, { source: 'Back' });
  assert.equal(r.mapping.how, 'profile');
  assert.equal(r.res.refuse, null);
  const [a, b] = r.res.comps;
  for (const [x, y] of [[a, sale], [b, list]]) for (const f of ['kind', 'name', 'address', 'price', 'bsf', 'cap', 'occ', 'lot_sf', 'year', 'dom', 'zip', 'state']) assert.deepEqual(x[f], y[f], f);
  assert.equal(a.date.toISOString(), sale.date.toISOString());
  assert.equal(a.reported_ppsf, Math.round((6450000.5 / 24000) * 100) / 100);
  assert.equal(a.origin.profile, 'zlatura-comps');
  assert.deepEqual(open(r.qs), []);
});

test('an .xlsx read with ExcelJS: a real date cell, formulas as results, hidden sheets left out', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Comps');
  ws.addRow(['Address', 'Status', 'Sale Price', 'Sale Date', 'Cap Rate']);
  ws.addRow(['1 A St', 'Sold', { formula: 'A1*0+1250000', result: 1250000 }, new Date(Date.UTC(2026, 2, 4)), 0.0675]);
  wb.addWorksheet('Hidden').state = 'hidden';
  const grids = gridsOf(wb);
  assert.equal(grids.length, 1);
  const { res } = run(grids[0], { cap: 'fraction' });
  assert.equal(res.refuse, null);
  assert.equal(res.comps[0].price, 1250000); assert.equal(res.comps[0].cap, 6.75);
  assert.equal(res.comps[0].date.toISOString(), '2026-03-04T00:00:00.000Z');
});

test('an address with no ZIP and no city does not match the same street elsewhere; the row cap is seen without reading the whole sheet', () => {
  const mk = (o) => Object.assign(blankComp('sale'), { address: '100 Example Street', ...o });
  assert.equal(dupeOf(mk({}), [mk({ city: 'Elsewhere' })]), null);
  assert.equal(dupeOf(mk({ city: 'Town' }), [mk({})]), null);
  assert.equal(dupeOf(mk({ city: 'town' }), [mk({ city: 'Town' })]).level, 'possible');
  const x = { sheet: 'Comps', rows: [{ r: 1, cells: ['Address', 'City', 'Price'] }, ...Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ r: i + 2, cells: ['1 A St', 'X', 5] }))] };
  assert.match(findHeader(x).refuse, /more than 2,000 rows/);
});
