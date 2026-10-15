/* Bug B: income and expense figures read from an OM's operating statement
 * as a table (app/omstatement.js through app/om.js readOm): the column its
 * heading names, the scale it states, per-unit and per-SF columns kept out
 * of totals, the statement's own arithmetic checked (t12.js statementChecks),
 * a failed check holding NOI, EGI and expenses back until a fix is chosen,
 * and every figure with its row, column and cell. Every statement is
 * invented (tests/om-statement-fixtures.js). Each test here failed on 4.7.4. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readOm } from '../app/om.js';
import { CASES, noiPrinted, twoColumns, itemised, PDF_SPECS } from './om-statement-fixtures.js';
import { pdfOf } from './rr-fixtures.js';

const AS_OF = '2026-10-14';
const read = (pages, opts = {}) => readOm(pages, { asOf: AS_OF, ...opts });
const f = (n) => read(CASES[n]).fields;
const v = (n, k) => f(n)[k] && f(n)[k].value;
const checks = (om) => om.statement.checks;
const lvl = (om, level) => checks(om).filter((c) => c.level === level);

/* ------------------------------------------------ the right column */

test('an operating history: in place is the T-12 column, not the oldest year; pro forma the Pro Forma column', () => {
  assert.equal(v('history', 'noi'), 680000);
  assert.equal(v('history', 'noi_pf'), 770000);
  assert.equal(v('history', 'taxes'), 100000);
  assert.equal(f('history').noi.col, 'T-12');
});

test('a long statement: the headings still apply 40 lines down', () => {
  assert.equal(v('long', 'noi'), 680000);
  assert.equal(v('long', 'opex'), 320000);
  assert.equal(v('long', 'noi_pf'), 770000);
});

test('the pro forma column first: in place from Actual 2025, and the cell beside Pro Forma is not swallowed', () => {
  assert.equal(v('pfFirst', 'gross'), 1000000);
  assert.equal(v('pfFirst', 'noi'), 680000);
  assert.equal(v('pfFirst', 'noi_pf'), 770000);
});

test('a T-12 and a Year 1: NOI from the T-12, pro forma from Year 1', () => {
  assert.equal(v('t12year1', 'noi'), 680000);
  assert.equal(v('t12year1', 'noi_pf'), 750000);
});

test('plain-year headings: a past year is actual, the coming one projected', () => {
  assert.equal(v('yearsOnly', 'noi'), 680000);
  assert.equal(v('yearsOnly', 'noi_pf'), 770000);
  assert.equal(f('yearsOnly').noi.colKind, 'actual');
});

test('a merged “Pro Forma” heading over Year 1 and Year 2: pro forma NOI is Year 1, labelled with its group', () => {
  assert.equal(v('merged', 'noi_pf'), 750000);
  assert.equal(f('merged').noi_pf.col, 'Pro Forma · Year 1');
  assert.equal(f('merged').noi.col, 'Actual 2025');
});

test('Year 1 only (no actual column): Year 1 is NOI, labelled “Year 1 (projected)”, medium confidence, with a note', () => {
  const om = read(CASES.yearN);
  assert.equal(om.fields.noi.value, 680000);
  assert.equal(om.fields.noi.col, 'Year 1 (projected)');
  assert.equal(om.fields.noi.colKind, 'year1');
  assert.equal(om.fields.noi.confidence, 'medium');
  assert.equal(om.fields.noi_pf.value, 700400, 'pro forma is the first pro forma column, Year 2');
  assert.ok(checks(om).some((c) => c.kind === 'basis' && /Year 1 \(projected\)/.test(c.text)));
});

/* ------------------------------------------------ units and scale */

test('a Per Unit column before the totals is never a total', () => {
  assert.equal(v('perUnitFirst', 'noi'), 680000);
  assert.equal(v('perUnitFirst', 'taxes'), 100000);
  assert.equal(v('perUnitFirst', 'gross'), 1000000);
});

test('a per-unit row label is not a total, wherever the words sit', () => {
  assert.equal(v('perUnitRowAlone', 'noi'), undefined);
  assert.equal(v('perUnitRowAlone', 'opex'), undefined);
  assert.equal(v('perUnitRowAlone', 'taxes'), undefined);
});

test('“($ in 000s)” in the title scales every figure, and says so', () => {
  const om = read(CASES.thousands);
  assert.equal(om.fields.gross.value, 1071000);
  assert.equal(om.fields.noi.value, 719000);
  assert.equal(om.fields.noi_pf.value, 758000);
  assert.equal(om.fields.noi.scale, 1000);
  assert.equal(om.fields.noi.cell, '$719', 'the cell as printed');
  assert.ok(checks(om).some((c) => c.kind === 'scale' && /thousands/.test(c.text)));
});

test('a column with no heading is read as per SF when its figures × the building SF give the totals', () => {
  const pages = ['Property Summary\n\n  Building Size                      40,000 SF\n\n\n\n' + 'Operating Statement\n\n' + [
    '                                                                Actual',
    '',
    '  Effective Gross Income                       $25.00        $1,000,000',
    '  Real Estate Taxes                             $2.50          $100,000',
    '  Total Operating Expenses                      $8.00          $320,000',
    '  Net Operating Income                         $17.00          $680,000'].join('\n')];
  const om = read(pages);
  assert.equal(om.fields.noi.value, 680000);
  assert.equal(om.fields.taxes.value, 100000);
  const t = om.statement.tables[0];
  assert.equal(t.columns[0].kind, 'psf');
  assert.ok(t.columns[0].inferred);
});

test('a real estate tax reimbursement (income) is not the tax expense', () => {
  assert.equal(v('taxReimb', 'taxes'), 100000);
  assert.equal(v('taxReimb', 'noi'), 660000);
});

/* ------------------------------------------------ a failed cell stays put */

test('a negative actual NOI leaves the row unresolved: 2026 is not taken instead, and a check says why', () => {
  const om = read(CASES.negYears);
  assert.equal(om.fields.noi, undefined);
  assert.equal(om.fields.noi_pf.value, 270000);
  const r = checks(om).find((c) => c.kind === 'range');
  assert.ok(r && r.level === 'warn' && r.cell.text === '($12,400)' && r.colLabel === '2025', JSON.stringify(r));
});

/* ------------------------------------------------ arithmetic */

test('EGI less expenses not NOI: a failed check, low confidence, pointing at page, row, column and cell', () => {
  const om = read(CASES.noAdd);
  assert.equal(om.fields.noi.confidence, 'low');
  assert.equal(om.fields.noi.check, 'fail');
  const [c] = lvl(om, 'fail');
  assert.equal(c.kind, 'noi');
  assert.equal(c.page, 1);
  assert.equal(c.row, 'Net Operating Income');
  assert.equal(c.colLabel, 'Current');
  assert.equal(c.cell.text, '$760,000');
  assert.equal(c.lineText.slice(c.cell.at, c.cell.at + c.cell.text.length), '$760,000', 'the cell is found on the line as printed');
  assert.deepEqual(c.fields, ['noi', 'gross', 'opex']);
  assert.match(c.text, /\$960,000 less expenses \$300,000 is \$660,000, but NOI is printed as \$760,000/);
});

test('a statement that adds up passes, high confidence, with the column as basis and the other columns as alternatives', () => {
  const om = read(CASES.pfFirst);
  assert.equal(lvl(om, 'fail').length, 0);
  assert.equal(om.fields.noi.confidence, 'high');
  assert.equal(om.fields.noi.col, 'Actual 2025');
  assert.equal(om.fields.noi.row, 'Net Operating Income');
  assert.equal(om.fields.noi.table, 'p1.1');
  assert.equal(om.fields.noi.check, 'pass');
  assert.deepEqual(om.fields.noi.alts.map((a) => [a.value, a.col]), [[770000, 'Pro Forma']]);
  assert.equal(om.fields.noi_pf.confidence, 'medium', 'a pro forma figure is never high');
});

test('tolerance: the larger of 0.5% or half a printed unit per line; one dollar past it fails', () => {
  // 0.5% of a printed $683,400 is $3,417: $3,400 off passes, $3,500 off fails
  assert.equal(lvl(read(noiPrinted('$683,400')), 'fail').length, 0);
  assert.equal(lvl(read(noiPrinted('$683,500')), 'fail').length, 1);
  // in thousands, half a printed unit for each of the 2 lines and the total is $1,500, more than 0.5% of $61,000
  const small = (noi) => ['Operating Statement ($000s)\n\n' + [' '.repeat(36) + 'T-12'.padStart(14), '',
    '  Effective Gross Income'.padEnd(36) + '100'.padStart(14), '  Total Operating Expenses'.padEnd(36) + '40'.padStart(14), '  Net Operating Income'.padEnd(36) + noi.padStart(14)].join('\n')];
  assert.equal(lvl(read(small('61')), 'fail').length, 0, '$1,000 off, within $1,500');
  assert.equal(lvl(read(small('62')), 'fail').length, 1, '$2,000 off');
});

test('itemised lines must add up to their subtotal; a short section that doesn’t is a note, not a fail', () => {
  assert.equal(lvl(read(itemised()), 'fail').length, 0);
  const bad = read(itemised({ egi: '$1,010,000', noi: '$690,000' }));
  const c = lvl(bad, 'fail');
  assert.deepEqual(c.map((x) => x.kind), ['egi'], 'NOI agrees with the subtotals as printed: one fail, not two');
  assert.match(c[0].text, /3 income lines add up to \$1,000,000, but EGI is printed as \$1,010,000/);
  // the retail fixture prints two of its expense lines: a note, and its NOI check passes
  const notes = read(CASES.taxReimb).statement.checks.filter((x) => x.kind === 'partial');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].level, 'info');
});

test('taxes must be within total expenses, and expenses below EGI', () => {
  const om = read(['Operating Statement\n\n' + [' '.repeat(36) + 'Current'.padStart(14), '',
    '  Effective Gross Income'.padEnd(36) + '$500,000'.padStart(14), '  Real Estate Taxes'.padEnd(36) + '$250,000'.padStart(14),
    '  Total Operating Expenses'.padEnd(36) + '$200,000'.padStart(14), '  Net Operating Income'.padEnd(36) + '$300,000'.padStart(14)].join('\n')]);
  assert.ok(lvl(om, 'fail').some((c) => c.id.endsWith(':taxes') && c.row === 'Real Estate Taxes'));
});

test('growth between columns: EGI or expenses over 25% a note, NOI over 50% a warning; never blocking', () => {
  const g = (om, kind) => checks(om).filter((c) => c.kind === 'growth' && c.id.includes(`growth.${kind}.`));
  // EGI +25.0% exactly: nothing; +25.1%: a note
  assert.equal(g(read(twoColumns(['$1,000,000', '$1,250,000'], ['$320,000', '$320,000'], ['$680,000', '$930,000'])), 'egi').length, 0);
  const egi = g(read(twoColumns(['$1,000,000', '$1,251,000'], ['$320,000', '$320,000'], ['$680,000', '$931,000'])), 'egi');
  assert.deepEqual(egi.map((c) => c.level), ['info']);
  // NOI +50.0% exactly: no warning; +50.1%: a warning (and the expenses' fall of a third, a note)
  assert.equal(g(read(twoColumns(['$1,000,000', '$1,000,000'], ['$600,000', '$400,000'], ['$400,000', '$600,000'])), 'noi').length, 0);
  const om = read(twoColumns(['$1,000,000', '$1,000,000'], ['$600,000', '$399,600'], ['$400,000', '$600,400']));
  assert.deepEqual(g(om, 'noi').map((c) => c.level), ['warn']);
  assert.deepEqual(g(om, 'opex').map((c) => c.level), ['info']);
  const { omRead, figures } = omReadRecord(om, { figures: figs(om), sources: {} });
  assert.deepEqual(omRead.blocked, [], 'a warning holds nothing back');
  assert.equal(figures.noi, 400000);
});

/* ------------------------------------------------ PDFs, by position */

const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
const { pdfPages } = await import('../app/pdftext.js');
async function pdfRead(name, page) {
  const layouts = [];
  const pages = await pdfPages(pdfjs, pdfOf(PDF_SPECS[name]()), { layouts, verbosity: 0 });
  return read(pages.map((p, i) => (i === page - 1 ? p : '')), { layouts: layouts.map((l, i) => (i === page - 1 ? l : null)) });
}

test('PDF: Actual 2025 and Pro Forma, each with a $/SF column beside it', async () => {
  const om = await pdfRead('om-stmt-styled', 1);
  assert.deepEqual(om.statement.tables[0].columns.map((c) => c.kind), ['actual', 'psf', 'proforma', 'psf']);
  assert.equal(om.fields.noi.value, 718750);
  assert.equal(om.fields.noi_pf.value, 757500);
  assert.equal(om.fields.gross.value, 1071400);
  assert.equal(om.fields.gpr.value, 1094400);
  assert.equal(om.fields.noi.confidence, 'high');
  assert.equal(lvl(om, 'fail').length, 0, 'GPR − vacancy + other income = EGI; EGI − expenses = NOI');
});

test('PDF: per unit first, then T-12 and Year 1', async () => {
  const om = await pdfRead('om-stmt-styled', 2);
  assert.equal(om.fields.noi.value, 718750);
  assert.equal(om.fields.noi.col, 'T-12');
  assert.equal(om.fields.taxes.value, 118200);
  assert.equal(om.fields.noi_pf.value, 757500);
});

test('PDF: “($ in thousands)” in a note, “Pro Forma” centred over Year 1 and Year 2', async () => {
  const om = await pdfRead('om-stmt-styled', 3);
  assert.equal(om.fields.noi.value, 719000);
  assert.equal(om.fields.noi_pf.value, 758000);
  assert.equal(om.fields.noi_pf.col, 'Pro Forma · Year 1');
});

test('PDF: narrow columns, the pro forma first: figures set a single space apart are two cells', async () => {
  const om = await pdfRead('om-stmt-narrow', 1);
  assert.equal(om.fields.gross.value, 1071400);
  assert.equal(om.fields.noi.value, 718750);
  assert.equal(om.fields.noi.col, 'Actual');
});

test('PDF: a long statement, rows far apart, cents in the lines', async () => {
  const om = await pdfRead('om-stmt-narrow', 2);
  assert.equal(om.fields.noi.value, 718750);
  assert.equal(om.fields.opex.value, 352650);
  assert.equal(lvl(om, 'fail').length, 0, '20 lines of $17,632.50 add up to $352,650');
});

test('PDF: the browser flow’s OM: in 000s, Per Unit, T-12 and Pro Forma, a T-12 NOI that doesn’t add up', async () => {
  const om = await pdfRead('om-stmt-qc', 2);
  assert.equal(om.fields.gross.value, 1192000);
  assert.equal(om.fields.noi.value, 786000);
  const [c] = lvl(om, 'fail');
  assert.equal(c.colLabel, 'T-12');
  assert.equal(c.cell.text, '786');
  assert.deepEqual(c.fixes.map((x) => x.id), ['printed', 'subtotals', 'col2']);
  assert.deepEqual(c.fixes[1].values, { noi: 776000 });
});

/* ------------------------------------------------ on the deal */

import { omReadRecord, applyOmFix, heldFields, basisText } from '../app/omstatement.js';
import { reviewItems } from '../app/review.js';
import { diffDeal, applyChanges, inverseOf } from '../app/history.js';

const figs = (om) => Object.fromEntries(Object.entries(om.fields).map(([k, x]) => [k, x.value]));
const srcs = (om) => Object.fromEntries(Object.entries(om.fields).map(([k, x]) => [k, { page: x.page, line: x.line, confidence: x.confidence, alts: x.alts, orig: x.value, ...(x.col ? { col: x.col, row: x.row, cell: x.cell } : {}) }]));
function dealOf(pages) {
  const om = read(pages);
  const r = omReadRecord(om, { figures: figs(om), sources: srcs(om), file: 'invented.pdf', at: 1 });
  return { id: 'd1', name: 'Invented', figures: r.figures, sources: r.sources, omRead: r.omRead };
}

test('a failed check holds NOI, EGI and expenses back; the rest is applied', () => {
  const d = dealOf(CASES.noAdd);
  assert.deepEqual(d.omRead.blocked, ['noi', 'gross', 'opex']);
  for (const k of ['noi', 'gross', 'opex']) { assert.equal(d.figures[k], undefined, k); assert.equal(d.sources[k], undefined); }
  assert.equal(d.omRead.held.noi.value, 760000);
  assert.equal(d.omRead.applied, false);
  assert.deepEqual(heldFields(d.omRead), ['noi', 'gross', 'opex']);
  // a statement that adds up holds nothing
  const ok = dealOf(CASES.pfFirst);
  assert.deepEqual(ok.omRead.blocked, []);
  assert.equal(ok.figures.noi, 680000);
  assert.equal(basisText(ok.sources.noi), 'Actual 2025 · p.1 · high');
});

test('the failed check is a Review item (omcheck) with its page, row, cell and fixes', () => {
  const d = dealOf(CASES.noAdd);
  const [g] = reviewItems({ deals: [d] });
  const it = g.items.find((x) => x.kind === 'omcheck');
  assert.ok(it);
  assert.equal(it.level, 'fail');
  assert.equal(it.cell, '$760,000');
  assert.equal(it.row, 'Net Operating Income');
  assert.match(it.where, /page 1, line \d+, row Net Operating Income, column Current \(“\$760,000”\)/);
  assert.deepEqual(it.fixes.map((x) => x.id), ['printed', 'subtotals']);
  assert.equal(it.amount, 760000);
});

test('fix “keep as printed”: the figures as read are applied, the choice recorded', () => {
  const d = dealOf(CASES.noAdd);
  const id = d.omRead.checks.find((c) => c.level === 'fail').id;
  const res = applyOmFix(d, id, 'printed', 5);
  assert.deepEqual(res.applied.sort(), ['gross', 'noi', 'opex']);
  assert.equal(d.figures.noi, 760000);
  assert.equal(d.omRead.seen[id].fix, 'printed');
  assert.equal(d.omRead.checks.find((c) => c.id === id).resolved.how, 'accepted');
  assert.equal(d.sources.noi.check, 'resolved');
  assert.equal(d.sources.noi.col, 'Current', 'the source keeps its column');
  assert.equal(reviewItems({ deals: [d] }).length, 0, 'it leaves the Review Queue');
});

test('fix “use the subtotals”: NOI is EGI less expenses', () => {
  const d = dealOf(CASES.noAdd);
  applyOmFix(d, d.omRead.checks.find((c) => c.level === 'fail').id, 'subtotals');
  assert.equal(d.figures.noi, 660000);
  assert.equal(d.figures.gross, 960000);
  assert.equal(d.figures.opex, 300000);
  assert.match(d.sources.noi.fix, /subtotals/);
});

test('fix “use the sum of the lines”: EGI as its lines add up, and NOI with it', () => {
  const d = dealOf(itemised({ egi: '$1,010,000', noi: '$690,000' }));
  const c = d.omRead.checks.find((x) => x.level === 'fail');
  assert.deepEqual(c.fixes.map((x) => x.id), ['printed', 'lines']);
  applyOmFix(d, c.id, 'lines');
  assert.equal(d.figures.gross, 1000000);
  assert.equal(d.figures.noi, 680000);
  assert.equal(d.figures.opex, 320000);
});

test('fix “use another column”: the Pro Forma column’s figures', () => {
  const d = dealOf(twoColumns(['$960,000', '$1,000,000'], ['$300,000', '$320,000'], ['$760,000', '$680,000']));
  const c = d.omRead.checks.find((x) => x.level === 'fail');
  const col = c.fixes.find((x) => x.id === 'col1');
  assert.ok(col && /^Use Pro Forma: NOI \$680,000/.test(col.label), JSON.stringify(c.fixes));
  applyOmFix(d, c.id, 'col1');
  assert.equal(d.figures.noi, 680000);
  assert.equal(d.figures.gross, 1000000);
});

test('a figure typed by hand while held back is not overwritten by the fix', () => {
  const d = dealOf(CASES.noAdd);
  d.figures.noi = 700000;
  applyOmFix(d, d.omRead.checks.find((c) => c.level === 'fail').id, 'printed');
  assert.equal(d.figures.noi, 700000);
  assert.equal(d.omRead.kept.noi, 700000);
  assert.equal(d.figures.gross, 960000);
});

test('undo: the fix is one set of changes the deal’s history reverses exactly', () => {
  const d = dealOf(CASES.noAdd);
  const before = structuredClone(d);
  applyOmFix(d, d.omRead.checks.find((c) => c.level === 'fail').id, 'subtotals', 9);
  const changes = diffDeal(before, d);
  assert.ok(changes.length > 0);
  const back = structuredClone(d);
  assert.deepEqual(applyChanges(back, inverseOf(changes)), []);
  assert.deepEqual(back, before);
  assert.deepEqual(heldFields(back.omRead), ['noi', 'gross', 'opex'], 'held back again');
});

/* ------------------------------------------------ an old backup */

import { readBackup } from '../app/backup.js';
import { pending } from '../app/migrate.js';

test('a 4.7.4 backup: its OM deals are kept as saved, not read again, and need no migration step', () => {
  const b = readBackup(fs.readFileSync(new URL('./fixtures/backup-4.7.4-before-om-statement.json', import.meta.url), 'utf8'));
  assert.equal(b.deals.length, 2);
  for (const d of b.deals) {
    assert.equal(d.omRead, undefined);
    assert.deepEqual(pending(d).map((s) => s.id), [], `${d.name}: no step for additive fields`);
    for (const s of Object.values(d.sources || {})) assert.equal(s.col, undefined, 'sources from before Bug B have no column');
    assert.equal(basisText(d.sources.noi), `p.${d.sources.noi.page} · ${d.sources.noi.confidence}`, 'its page and confidence in words; no column is made up');
    assert.deepEqual(heldFields(d.omRead), []);
  }
  // the statement OM 4.7.4 read wrongly (its Per Unit column as totals) keeps that reading until read again
  const st = b.deals.find((d) => d.source === 'om-stmt-qc.pdf');
  assert.equal(st.figures.noi, 16375);
  const items = reviewItems({ deals: b.deals }).flatMap((g) => g.items);
  assert.equal(items.filter((x) => x.kind === 'omcheck').length, 0);
});
