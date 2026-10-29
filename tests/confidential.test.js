/* The confidential deal tag (plan 19.2): the one AI-call guard, the export marks, and the flag riding in a backup.
 * Invented names throughout. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';
globalThis.window ||= {}; globalThis.document ||= { addEventListener() {}, dispatchEvent() {} };
const ai = await import('../app/ai.js');
const { blockReason, AiConfidential, AiUnavailable } = ai;
const { dealSummaryText } = await import('../app/brief.js');
const { analyze } = await import('../app/deal.js');
const { buildBackup, readBackup, planRestore } = await import('../app/backup.js');
const { migrateDeal } = await import('../app/migrate.js');

const secret = { id: 'dSecret', name: 'Invented Plaza', confidential: true, figures: {} };
const open = { id: 'dOpen', name: 'Sample Court', figures: {} };
const people = [
  { id: 'c1', name: 'Pat Example', company: 'Sample Holdings Group', dealIds: ['dSecret'] },
  { id: 'c2', name: 'Lee Invented', company: 'Other Firm Partners', dealIds: ['dOpen'] },
];
const env = { deals: [secret, open], contacts: people };
const research = (company, dealIds = []) => ({ research: { company, dealIds } });

test('a deal scope: refused when the open deal or its stored copy is confidential, allowed otherwise', () => {
  assert.match(blockReason('/api/extract', { deal: secret }), /confidential/);
  assert.equal(blockReason('/api/extract', { deal: open }), null);
  assert.match(blockReason('/api/assist', { deal: open }, { stored: secret }), /confidential/, 'the saved copy counts');
  for (const p of ['/api/extract', '/api/assist', '/api/transcribe', '/api/meeting']) assert.match(blockReason(p, { deal: { ...open, confidential: 1 } }), /confidential/, 'a hand-edited flag blocks');
  assert.equal(blockReason('/api/extract', { deal: { ...open, confidential: false } }), null);
});

test('a missing, empty or unknown scope, or one for another path, is refused', () => {
  for (const s of [undefined, null, {}, { foo: 1 }, { deal: undefined }, { deal: open, health: true }, 'deal']) assert.match(blockReason('/api/extract', s), /scope/, JSON.stringify(s));
  assert.match(blockReason('/api/extract', { health: true }), /does not match/, 'health only fits /api/health');
  assert.match(blockReason('/api/research', { deal: open }), /does not match/);
  assert.match(blockReason('/api/health', { deal: open }), /does not match/);
  assert.equal(blockReason('/api/health', { health: true }), null);
});

test('research: refused for a linked confidential deal and for an exact company match, allowed otherwise', () => {
  assert.match(blockReason('/api/research', research('Anything Corp', ['dSecret']), env), /confidential deal/);
  assert.match(blockReason('/api/research', research('sample holdings group.', []), env), /matches a contact/);
  assert.equal(blockReason('/api/research', research('Other Firm Partners', ['dOpen']), env), null);
  assert.equal(blockReason('/api/research', research('Sample Holdings', []), env), null, 'a variant spelling is not caught');
  assert.equal(blockReason('/api/research', research('', []), env), null);
});

test('every wrapper takes the scope first, and a confidential or scopeless call never reaches fetch', async () => {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (...a) => { seen.push(a); throw new Error('must not be reached'); };
  try {
    const sc = { deal: secret };
    for (const call of [() => ai.extract(sc, [], []), () => ai.assist(sc, 'q', [], []), () => ai.transcribe(sc, {}), () => ai.meeting(sc, 't', [])]) await assert.rejects(call, AiConfidential);
    await assert.rejects(() => ai.extract(undefined, [], []), AiConfidential);
    await assert.rejects(() => ai.health({ deal: open }), AiConfidential);
    await assert.rejects(() => ai.research({ health: true }, {}), AiConfidential);
    assert.ok(new AiConfidential('x') instanceof AiUnavailable, 'existing catch blocks still show the message');
  } finally { globalThis.fetch = real; }
  assert.equal(seen.length, 0);
});

test('the summary carries the mark only for a confidential deal', () => {
  const m = analyze({ price: 1e6, noi: 70000 }, null);
  const plain = dealSummaryText({ ...open, figures: { address: '1 Sample St' }, loan: {} }, m, null);
  const marked = dealSummaryText({ ...secret, figures: { address: '1 Sample St' }, loan: {} }, m, null);
  assert.ok(!/CONFIDENTIAL/.test(plain));
  assert.match(marked.split('\n')[0], /^CONFIDENTIAL/);
  assert.equal(marked.split('\n').slice(1).join('\n'), plain, 'only a first line is added');
});

test('the deal workbook: marked on every sheet, and every cell value equals the plain build', async () => {
  const { buildDealWorkbook } = await import('../app/workbook.js');
  const figures = { price: 2400000, noi: 144000, bsf: 12000, address: '1 Sample St', rentRoll: [] };
  const m = analyze(figures, null);
  const mk = (confidential) => ({ deal: { name: `${confidential ? 'CONFIDENTIAL — ' : ''}Sample`, figures, loan: { ltv: 65, rate: 6.75, amort: 30, io: false }, sources: {}, questions: [], visitLines: [], scenarioLines: [], confidential }, metrics: m, comps: null });
  const load = async (x) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await buildDealWorkbook(ExcelJS, fflate, x)); return wb; };
  const plain = await load(mk(false)); const marked = await load(mk(true));
  let sheets = 0; let cells = 0;
  marked.eachSheet((ws) => {
    sheets += 1;
    assert.match(ws.headerFooter.oddHeader, /CONFIDENTIAL/, ws.name);
    assert.match(ws.headerFooter.oddFooter, /CONFIDENTIAL/, ws.name);
    const other = plain.getWorksheet(ws.name);
    assert.ok(!(other.headerFooter && other.headerFooter.oddHeader), 'the plain build has no mark');
    ws.eachRow((row, r) => row.eachCell((c, col) => {
      if (typeof c.value === 'number' || (c.value && typeof c.value === 'object' && 'result' in c.value)) { cells += 1; assert.deepEqual(c.value, other.getCell(r, col).value, `${ws.name} ${c.address}`); }
    }));
  });
  assert.ok(sheets >= 1 && cells > 10, `${sheets} sheets, ${cells} numeric cells`);
});

test('a backup carries the flag unchanged, and a restored deal still blocks AI', async () => {
  const stamp = { visit: { photos: [], audio: [] }, figures: { price: 1e6 }, updatedAt: 5 };
  const b = await buildBackup({ deals: [{ ...stamp, id: 'dSecret', name: 'Invented Plaza', confidential: true }, { ...stamp, id: 'dOpen', name: 'Sample Court' }], appVersion: '4.7.64' });
  const r = readBackup(JSON.stringify(b));
  const back = Object.fromEntries(r.deals.map((d) => [d.id, d]));
  assert.equal(back.dSecret.confidential, true);
  assert.ok(!('confidential' in back.dOpen));
  assert.equal(migrateDeal(structuredClone(back.dSecret)) && back.dSecret.confidential, true);
  const plan = planRestore(r, { deals: [], kv: {}, local: {}, session: null, history: {}, snapshots: {} });
  const put = plan.deals.put.find((d) => d.id === 'dSecret');
  assert.match(blockReason('/api/extract', { deal: put }), /confidential/);
});

test('a 4.7.50 backup restores with no deal confidential', () => {
  const r = readBackup(fs.readFileSync(new URL('./fixtures/backup-4.7.50-before-research.json', import.meta.url), 'utf8'));
  assert.ok(r.deals.length >= 2);
  for (const d of r.deals) {
    assert.ok(!('confidential' in d) && !('confidential' in migrateDeal(structuredClone(d)) ), d.id);
    assert.equal(blockReason('/api/extract', { deal: d }), null, 'AI is not blocked');
  }
});

test('the rent roll workbook: marked on every sheet with a note under the title, and its numbers unchanged', async () => {
  const { buildRentRollWorkbook } = await import('../app/rrbook.js');
  const { richRentRoll } = await import('./impact-cases.js');
  const rr = richRentRoll();
  const deal = { name: 'Rich centre', figures: { address: '1 Main St' }, rr };
  const load = async (d) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await buildRentRollWorkbook(ExcelJS, fflate, { deal: d, rr })); return wb; };
  const plain = await load(deal); const marked = await load({ ...deal, confidential: true });
  let sheets = 0; let cells = 0;
  marked.eachSheet((ws) => {
    sheets += 1;
    assert.match(ws.headerFooter.oddHeader, /CONFIDENTIAL/, ws.name);
    const other = plain.getWorksheet(ws.name);
    assert.ok(!(other.headerFooter && other.headerFooter.oddHeader), 'the plain build has no mark');
    ws.eachRow((row, r) => row.eachCell((c, col) => {
      if (typeof c.value === 'number') { cells += 1; assert.equal(c.value, other.getCell(r, col).value, `${ws.name} ${c.address}`); }
    }));
  });
  assert.ok(/CONFIDENTIAL/.test(marked.worksheets[0].getCell('A2').value) && !/CONFIDENTIAL/.test(String(plain.worksheets[0].getCell('A2').value)), 'the subtitle says so');
  assert.ok(sheets >= 3 && cells > 20, `${sheets} sheets, ${cells} numeric cells`);
});
