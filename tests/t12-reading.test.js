/* T-12 PR 1, "reading foundation" (docs/proposals/t12-formats.md): a statement
 * read from semicolon, tab and pasted text, decimal-comma numbers, blank and
 * unreadable cells recorded, the period, the sheet choice, and the new fields
 * kept through a backup. Invented fixtures only (tests/t12-formats.js). Tests
 * marked [old] failed on 4.7.27. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';
import { LAYOUTS, layoutFile } from './t12-layouts.js';
import { text, grid, statementRows, SIX, EU_SEMICOLON, MON6, MON12 } from './t12-formats.js';
import { amountOf, layoutOf, numberFormatOf, tokenFormat, currencyRefusal, importStatement, statementChecks, openChecks, markSeen, sheetChoices, pickSheet, sourceText, periodShort, lineNotes } from '../app/t12.js';
import { readGrids, detectDelimiter, csvRows, pastedRows, gridsOf } from '../app/sheetread.js';

const getFflate = async () => fflate;
const getXlsx = async () => ({ ExcelJS });
const asFile = (s, name = 'invented.csv') => new File([s], name);
const readCsv = (s, name) => readGrids(asFile(s, name), getXlsx, { getFflate });

/* ---------------------------------------------------------------- 1. delimiters */

test('[old] a semicolon CSV is detected and read in its columns', async () => {
  const g = await readCsv(EU_SEMICOLON);
  assert.equal(g[0].delimiter, ';');
  assert.deepEqual(g[0].rows[0].cells, ['Line', ...MON6, 'Total']);
  assert.equal(g[0].rows[1].cells[1], '1.234,56');
});

test('[old] tab-separated text is detected, whatever the file is named', async () => {
  const tsv = text([['Line', ...MON6, 'Total'], ['Base Rent', 1, 2, 3, 4, 5, 6, 21]], '\t');
  for (const name of ['statement.tsv', 'statement.txt', 'statement.csv']) {
    const g = await readCsv(tsv, name);
    assert.equal(g[0].delimiter, '\t', name);
    assert.equal(g[0].rows[1].cells.length, 8);
  }
});

test('[old] "sep=;" on the first line is honoured and dropped, with the row numbers still the file’s', async () => {
  const g = await readCsv(`sep=;\r\n${text([['Line', 'Jan 2026'], ['Rent', 5]], ';', '\r\n')}`);
  assert.equal(g[0].delimiter, ';');
  assert.deepEqual(g[0].rows.map((r) => r.cells), [['Line', 'Jan 2026'], ['Rent', '5']]);
  assert.deepEqual(g[0].rows.map((r) => r.r), [2, 3]);
  assert.deepEqual(detectDelimiter('sep=,\nA,B\n'), { delimiter: ',', skipFirst: true });
  assert.deepEqual(detectDelimiter('sep=\t\nA\tB\n'), { delimiter: '\t', skipFirst: true });
});

test('delimiter rules: the field count most lines share, quotes respected, comma when nothing fits', () => {
  assert.equal(detectDelimiter('Line;Jan 2026;Feb 2026;Total\nBase Rent;1.234,56;1.234,56;2.469,12\nTaxes;500;500;1.000\n').delimiter, ';');
  assert.equal(detectDelimiter('Line,Jan 2026,Total\n"Rent, base",1,1\n').delimiter, ',');
  assert.equal(detectDelimiter('"Rent; base",1,1\nTaxes,2,2\n').delimiter, ',', 'a semicolon inside quotes is not a delimiter');
  assert.equal(detectDelimiter('just a title\nand a line\n').delimiter, ',');
  assert.equal(detectDelimiter('').delimiter, ',');
  // a title row above a tab table does not change the answer
  assert.equal(detectDelimiter('Invented Plaza\nLine\tJan\tFeb\nRent\t1\t2\nTaxes\t3\t4\n').delimiter, '\t');
});

test('a plain comma CSV still reads exactly as before, and csvRows keeps its comma default', async () => {
  const s = text([['Line', ...MON6, 'Total'], ['Base Rent', 1, 2, 3, 4, 5, 6, 21]]);
  const g = await readCsv(s);
  assert.equal(g[0].delimiter, ',');
  assert.deepEqual(g[0].rows.map((r) => r.cells), csvRows(s));
});

/* ------------------------------------------------------- 2. what the file really is */

test('[old] an .xlsx saved with a .csv name is read as a workbook', async () => {
  const bytes = await layoutFile(LAYOUTS[1], ExcelJS);
  const g = await readCsv(Buffer.from(bytes), 'statement.csv');
  assert.notEqual(g[0].sheet, 'CSV');
  assert.ok(g[0].rows.length > 10);
});

test('[old] an .xlsm (a workbook with macros) is read, and says it has macros', async () => {
  const bytes = await layoutFile(LAYOUTS[1], ExcelJS);
  const z = fflate.unzipSync(bytes);
  z['xl/vbaProject.bin'] = Uint8Array.from([1, 2, 3, 4]);
  const g = await readGrids(new File([fflate.zipSync(z)], 'statement.xlsm'), getXlsx, { getFflate });
  assert.equal(g[0].macros, true);
  assert.ok(g[0].rows.length > 10);
  const plain = await readGrids(new File([bytes], 'statement.xlsx'), getXlsx, { getFflate });
  assert.equal(plain[0].macros, false);
});

test('[old] a PDF, a password-protected container and a too-big text file are refused by readGrids with their messages', async () => {
  await assert.rejects(readGrids(asFile('%PDF-1.7\n', 'statement.xlsx'), getXlsx, { getFflate }), /really a PDF/);
  await assert.rejects(readGrids(new File([Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...[...'EncryptedPackage'].flatMap((c) => [c.charCodeAt(0), 0])])], 'locked.xlsx'), getXlsx, { getFflate }), /password protected/);
});

test('[old] hidden sheets are left out by default and listed, marked hidden, on request', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await layoutFile(LAYOUTS[3], ExcelJS));
  assert.deepEqual(gridsOf(wb).map((g) => g.sheet), ['Operating Statement', 'Summary']);
  const all = gridsOf(wb, { includeHidden: true });
  assert.deepEqual(all.map((g) => [g.sheet, g.hidden]), [['Operating Statement', false], ['Notes', true], ['Summary', false]]);
});

/* ------------------------------------------------------------------- 3. paste */

test('[old] pasted text: tabs, with the trailing empty cells Excel adds', () => {
  const rows = pastedRows('Line\tJan 2026\tFeb 2026\t\t\nBase Rent\t1,000\t1,000\t\t\n\nTaxes\t200\t\t200\t\n');
  assert.deepEqual(rows, [
    { r: 1, cells: ['Line', 'Jan 2026', 'Feb 2026'] },
    { r: 2, cells: ['Base Rent', '1,000', '1,000'] },
    { r: 4, cells: ['Taxes', '200', '', '200'] },
  ]);
});

test('[old] pasted text without tabs: columns split on runs of two or more spaces, indentation ignored', () => {
  const rows = pastedRows('Line   Jan 2026   Feb 2026\n  Base Rent   (1,234)   1,234-\nTaxes     —     $5\n');
  assert.deepEqual(rows.map((r) => r.cells), [['Line', 'Jan 2026', 'Feb 2026'], ['Base Rent', '(1,234)', '1,234-'], ['Taxes', '—', '$5']]);
  assert.deepEqual(pastedRows('Real Estate Taxes   100').map((r) => r.cells), [['Real Estate Taxes', '100']], 'a single space stays inside a label');
});

/* ------------------------------------------------------------- 4. number formats */

/** What numberFormatOf says of a statement whose lines are given as rows of text. */
function formatOf(lines, delimiter = ',', months = MON6) {
  const rows = grid(statementRows({ months, lines }));
  return numberFormatOf(rows, layoutOf(rows), { delimiter });
}
const six = (v) => Array(6).fill(v);
const pick = (r) => [r.format, r.ask];

test('[old] 1.234,56 reads 1234.56 in a decimal-comma file (it was 1.23456)', () => {
  assert.equal(amountOf('1.234,56', 'eu'), 1234.56);
  assert.equal(amountOf('(1.234,56)', 'eu'), -1234.56);
  assert.equal(amountOf('1.234.567', 'eu'), 1234567);
  assert.equal(amountOf('12,5', 'eu'), 12.5);
  assert.equal(amountOf('1.234,56-', 'eu'), -1234.56);
  assert.equal(amountOf('$ 1.234,56', 'eu'), 1234.56);
});

test('[old] 1 234,56 and 1\'234.56 read', () => {
  assert.equal(amountOf('1 234,56', 'space'), 1234.56);
  assert.equal(amountOf('1 234,56', 'space'), 1234.56);
  assert.equal(amountOf('1\'234.56', 'ch'), 1234.56);
  assert.equal(amountOf('1’234.56', 'ch'), 1234.56);
  assert.equal(amountOf('1\'234\'567', 'ch'), 1234567);
});

test('the US reading is exactly what it was, and numbers are never touched by the format', () => {
  for (const [t, n] of [['$1,250.50', 1250.5], ['(1,250.00)', -1250], ['1,250-', -1250], ['-', 0], ['1.234', 1.234], ['12,500', 12500]]) assert.equal(amountOf(t), n, t);
  assert.equal(amountOf('1.234,56'), 1.23456, 'unchanged: this is why the format is asked about');
  for (const f of ['us', 'eu', 'ch', 'space']) assert.equal(amountOf(1234.5, f), 1234.5);
  assert.ok(Number.isNaN(amountOf('Rent', 'eu')));
});

test('tokens: which way each figure is written, and which could be either', () => {
  const k = {
    '1,234.56': 'us', '1,234,567': 'us', '12.5': 'us', '1234.56': 'us', '0.1234': 'us', '$(1,234.56)': 'us', '1\'234.56': 'ch', '1.234,56': 'eu', '1.234.567': 'eu', '12,5': 'eu', '1234,56': 'eu', '1 234,56': 'space',
    '1.234': 'dot3', '12,500': 'comma3', '1234': null, '1 234': null, '-': null, 'n/a': null, '': null, '1,2.3': null,
  };
  for (const [t, want] of Object.entries(k)) assert.equal(tokenFormat(t), want, t || '(blank)');
});

test('[old] a file of 1.234,56 figures is decimal-comma, with no question', () => {
  const r = formatOf([['Base Rent', ...six('1.234,56'), '7.407,36'], ['Taxes', ...six('500'), '3.000']], ';');
  assert.deepEqual(pick(r), ['eu', null]);
  assert.equal(formatOf([['Rent', ...six('1 234,56'), '7 407,36']], ';').format, 'space');
  assert.equal(formatOf([['Rent', ...six('1\'234.56'), '7\'407.36']]).format, 'ch');
  assert.equal(formatOf([['Rent', ...six('1,234.56'), '7,407.36']]).format, 'us');
});

test('[old] 1.234 alone asks, with no guess, and shows both readings', () => {
  const r = formatOf([['Taxes', ...six('1.234'), '7.404']]);
  assert.deepEqual(pick(r), [null, 'ambiguous']);
  assert.deepEqual(r.samples, [{ text: '1.234', us: 1.234, eu: 1234 }, { text: '7.404', us: 7.404, eu: 7404 }]);
});

test('[old] a file that writes numbers two ways asks', () => {
  const r = formatOf([['Rent', ...six('1,234.56'), '7,407.36'], ['Taxes', ...six('2.500,10'), '15.000,60']]);
  assert.deepEqual(pick(r), [null, 'mixed']);
  assert.ok(r.samples.length >= 1);
});

test('[old] a semicolon file with 12,500 asks; a comma file with 12,500 reads US with no question', () => {
  const lines = [['Rent', ...six('12,500'), '75,000'], ['Taxes', ...six('500'), '3,000']];
  assert.deepEqual(pick(formatOf(lines, ';')), [null, 'ambiguous']);
  assert.deepEqual(pick(formatOf(lines, ',')), ['us', null]);
  assert.deepEqual(pick(formatOf(lines, '\t')), ['us', null]);
});

test('1.234 with clear US figures beside it reads US; 12,500 beside a decimal comma reads EU', () => {
  assert.deepEqual(pick(formatOf([['Rent', ...six('1,500.50'), '9,003.00'], ['Taxes', ...six('1.234'), '7.404']])), ['us', null]);
  assert.deepEqual(pick(formatOf([['Rent', ...six('1.500,50'), '9.003,00'], ['Taxes', ...six('12,500'), '75,000']], ';')), ['eu', null]);
});

test('both dot-3 and comma-3 figures with nothing clear asks, even in a comma file', () => {
  assert.equal(formatOf([['Rent', ...six('1.234'), '7.404'], ['Taxes', ...six('12,500'), '75,000']]).ask, 'ambiguous');
});

test('Excel number cells are never read through the format', () => {
  const r = formatOf([['Rent', ...six(1234.5), 7407], ['Taxes', ...six(500), 3000]], ';');
  assert.deepEqual(pick(r), ['us', null]);
});

test('[old] a currency sign other than $ is found, and the import refusal says so', () => {
  assert.equal(formatOf([['Rent', ...six('€1.234,56'), '€7.407,36']], ';').foreign, '€');
  assert.equal(formatOf([['Rent', ...six('£1,234.56'), '£7,407.36']]).foreign, '£');
  assert.equal(formatOf([['Rent', ...six('CHF 1’234.56'), '7’407.36']]).foreign, 'CHF');
  assert.equal(formatOf([['Rent', ...six('$1,234.56'), '$7,407.36']]).foreign, null);
  assert.equal(currencyRefusal('€'), 'Amounts in € can’t be read as dollars. Zlatura reads dollar statements only; this file was not imported.');
  assert.equal(currencyRefusal(null), null);
});

/* ------------------------------------- 5. blank, zero and unread; where each line came from */

const NOW = 1_700_000_000_000;
const read = (rows, o = {}) => importStatement(grid(rows), { file: 'invented.csv', now: NOW, ...o });
const repairs = (st) => st.lines.find((l) => l.label === 'Repairs');

test('[old] a blank month cell is recorded as blank (0 in the months, the total unchanged), a dash stays a confirmed $0', () => {
  const st = read(statementRows({ lines: SIX }));
  const r = repairs(st);
  assert.deepEqual(r.blank, [1]);
  assert.deepEqual(r.months, [400, 0, 400, 0, 0, 400]);
  assert.equal(r.total, 1200, 'the blank counts as 0: the total is what 4.7.27 gave');
  assert.equal(r.months[3], 0);
  assert.ok(!r.blank.includes(3), 'the dash (month 4) is a printed zero, not a blank');
  assert.ok(!('blank' in st.lines.find((l) => l.label === 'Base Rent')), 'a line with no blank has no blank field');
});

test('[old] a cell of words (n/a, TBD, #REF!) is recorded as unread, 0 in the months', () => {
  const rows = statementRows({ lines: [['Base Rent', 1000, 1000, 1000, 1000, 1000, 1000, 6000], ['Repairs', 400, 'n/a', 'TBD', { error: '#REF!' }, 400, '  ', 1200]] });
  const r = repairs(read(rows));
  assert.deepEqual(r.unread, [{ i: 1, text: 'n/a' }, { i: 2, text: 'TBD' }, { i: 3, text: '#REF!' }]);
  assert.deepEqual(r.blank, [5]);
  assert.deepEqual(r.months, [400, 0, 0, 0, 400, 0]);
  assert.equal(r.conf.read, 'medium');
  const long = repairs(read(statementRows({ lines: [['Base Rent', 1, 1, 1, 1, 1, 1, 6], ['Repairs', 'x'.repeat(80), 1, 1, 1, 1, 1, 6]] })));
  assert.equal(long.unread[0].text.length, 40);
});

test('[old] blank months make one blanks check, naming the line and the month', () => {
  const st = read(statementRows({ lines: SIX }));
  const c = statementChecks(st).filter((x) => x.id === 'blanks');
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, 'blank');
  assert.equal(c[0].text, '1 month cell is blank (Repairs: Feb 2026). They count as $0 in the totals; check the source.');
  assert.ok(openChecks(st).some((x) => x.id === 'blanks'));
  markSeen(st, 'blanks');
  assert.ok(!openChecks(st).some((x) => x.id === 'blanks'));
  // several lines and months
  const many = read(statementRows({ lines: [['Base Rent', '', '', 1000, 1000, 1000, 1000, 4000], ['Taxes', '', 5, 5, 5, 5, 5, 25], ['Repairs', 1, '', '', '', '', '', 1]] }));
  assert.match(statementChecks(many).find((x) => x.id === 'blanks').text, /^8 month cells are blank \(Base Rent: Jan 2026, Feb 2026; Taxes: Jan 2026; Repairs: Feb 2026, Mar 2026, Apr 2026, …\)\. They count as \$0/);
});

test('a statement read before this version (no blank field) never gets the blanks check, even with zero months', () => {
  const old = JSON.parse(JSON.stringify(read(statementRows({ lines: SIX }))));
  for (const l of old.lines) { delete l.blank; delete l.unread; delete l.src; delete l.conf; }
  delete old.v; delete old.source; delete old.period;
  assert.equal(repairs(old).months.filter((m) => m === 0).length, 3, 'it has zero months');
  assert.ok(!statementChecks(old).some((x) => x.id === 'blanks'));
});

test('[old] every line has src and conf, and the statement has v, source and period', () => {
  const st = read(statementRows({ lines: SIX }), { sheet: 'T12 Actual', source: { type: 'csv', size: 321, delimiter: ',', encoding: 'utf-8' } });
  assert.equal(st.v, 2);
  assert.deepEqual(st.source, { type: 'csv', file: 'invented.csv', size: 321, sheet: 'T12 Actual', delimiter: ',', numberFormat: 'us', encoding: 'utf-8' });
  assert.equal(st.file, 'invented.csv', 'file and sheet are still written for older readers');
  assert.equal(st.period.basis, 'T-6');
  for (const l of st.lines) {
    assert.deepEqual(l.src, { type: 'cell', sheet: 'T12 Actual', row: l.r, col: 0 });
    assert.ok(['high', 'medium'].includes(l.conf.read));
  }
  assert.equal(st.lines.find((l) => l.label === 'Base Rent').conf.read, 'high');
});

test('[old] pasted lines say so (pasteLine) and are never high confidence', () => {
  const st = importStatement(pastedRows(text(statementRows({ lines: SIX.slice(1, 3) }), '\t')), { file: 'Pasted', source: { type: 'paste' }, now: NOW });
  assert.equal(st.source.type, 'paste');
  assert.equal(st.source.file, 'Pasted');
  for (const l of st.lines) { assert.equal(l.src.type, 'pasteLine'); assert.equal(l.conf.read, 'medium'); }
});

test('[old] a paste of tab-separated cells reads: trailing tabs, blanks and all', () => {
  const t = 'Account\tJan 2026\tFeb 2026\tMar 2026\tTotal\t\t\nBase Rent\t1,000\t1,000\t1,000\t3,000\t\t\nRepairs\t100\t\t100\t200\t\t\n';
  const st = importStatement(pastedRows(t), { file: 'Pasted', source: { type: 'paste' } });
  assert.deepEqual(st.lines.map((l) => [l.label, l.months, l.total]), [['Base Rent', [1000, 1000, 1000], 3000], ['Repairs', [100, 0, 100], 200]]);
  assert.deepEqual(st.lines[1].blank, [1]);
});

test('[old] a paste in spaces reads (1,234), 1,234- and a dash', () => {
  const t = 'Account    Jan 2026    Feb 2026    Mar 2026    Total\nBase Rent    1,000    1,000    1,000    3,000\nOwner Draws    (1,234)    —    1,234-    0\n';
  const st = importStatement(pastedRows(t), { file: 'Pasted', source: { type: 'paste' } });
  const d = st.lines.find((l) => l.label === 'Owner Draws');
  assert.deepEqual(d.months.map(Math.abs), [1234, 0, 1234]);
  assert.equal(d.blank, undefined, 'the em dash is a printed zero, not blank');
});

test('a paste with no heading row says how to copy it', () => {
  assert.throws(() => importStatement(pastedRows('Base Rent  1000  1000\nTaxes  5  5'), { file: 'Pasted', source: { type: 'paste' } }), /No months or total column were found/);
});

test('a decimal-comma file reads through numberFormat, to the cent', () => {
  const rows = statementRows({ lines: [['Base Rent', ...six('1.234,56'), '7.407,36'], ['Taxes', ...six('500,25'), '3.001,50']] });
  const st = read(rows, { numberFormat: 'eu' });
  assert.deepEqual(st.lines.map((l) => l.total), [7407.36, 3001.5]);
  assert.equal(st.source.numberFormat, 'eu');
  assert.equal(st.lines[0].fileTotal, 7407.36);
});

/* ------------------------------------------------------------------- 6. the period */

const heads = (n) => Array.from({ length: n }, (_, i) => `${MON12[i]}`);

test('[old] period: six dated months are T-6; twelve are T-12', () => {
  const p = read(statementRows({ lines: SIX })).period;
  assert.deepEqual([p.basis, p.dated, p.count, p.gaps, p.duplicates, p.emptyCols, p.printed], ['T-6', true, 6, [], [], [], null]);
  assert.deepEqual(p.columns[0], { c: 1, kind: 'month', head: 'Jan 2026' });
  assert.deepEqual(p.columns[6], { c: 7, kind: 'total', head: 'Total' });
  const y = read(statementRows({ months: MON12, lines: [['Base Rent', ...Array(12).fill(10), 120]] })).period;
  assert.deepEqual([y.basis, y.count], ['T-12', 12]);
});

test('[old] period: "Month 1…12" is T-12 but undated, and no year is invented', () => {
  const months = Array.from({ length: 12 }, (_, i) => `Month ${i + 1}`);
  const st = read(statementRows({ months, lines: [['Base Rent', ...Array(12).fill(10), 120]] }));
  assert.deepEqual([st.period.basis, st.period.dated], ['T-12', false]);
  assert.equal(st.months[0], 'M01');
  assert.ok(st.period.columns.every((c) => c.kind === 'index' || c.kind === 'total'));
  const six6 = read(statementRows({ months: months.slice(0, 6), lines: [['Base Rent', ...Array(6).fill(10), 60]] }));
  assert.equal(six6.period.basis, 'other', 'Month 1…6 is not claimed to be a T-6');
});

test('[old] period: a Total column and no months is annual; a YTD total with a gap is YTD', () => {
  const annual = read([['Account', 'Total'], ['Base Rent', 120000], ['Taxes', 30000]]);
  assert.deepEqual([annual.period.basis, annual.period.count], ['annual', 0]);
  const ytd = read(statementRows({ months: ['Jan 2026', 'Feb 2026', 'Apr 2026'], lines: [['Base Rent', 1, 1, 1, 3]] }).map((r, i) => (i === 0 ? [...r.slice(0, 4), 'YTD'] : r)));
  assert.equal(ytd.period.basis, 'YTD');
  assert.deepEqual(ytd.period.gaps, ['2026-03']);
});

test('[old] period: a gap and a duplicate month are recorded, not repaired', () => {
  const gap = read(statementRows({ months: ['Jan 2026', 'Feb 2026', 'Apr 2026', 'May 2026'], lines: [['Base Rent', 1, 1, 1, 1, 4]] })).period;
  assert.deepEqual([gap.basis, gap.gaps], ['other', ['2026-03']]);
  const dup = read(statementRows({ months: ['Jan 2026', 'Feb 2026', 'Jan 2026'], lines: [['Base Rent', 1, 1, 1, 3]] })).period;
  assert.deepEqual([dup.basis, dup.duplicates], ['other', ['2026-01']]);
});

test('[old] period: the printed period line is kept as text, no date parsed', () => {
  const head = [['Invented Plaza'], ['Period: 01/02/2026 to 30/06/2026']];
  const p = read(statementRows({ head, lines: SIX })).period;
  assert.equal(p.printed, 'Period: 01/02/2026 to 30/06/2026');
  assert.equal(read(statementRows({ head: [['Invented Plaza'], ['Statement of income'], ['Prepared as of Friday']], lines: SIX })).period.printed, 'Prepared as of Friday');
});

test('[old] period: Jan–Dec with Sep–Dec empty is T-12 with four empty columns and the blanks check', () => {
  const lines = [['Base Rent', ...heads(8).map(() => 1000), '', '', '', '', 8000], ['Taxes', ...heads(8).map(() => 100), '', '', '', '', 800]];
  const st = read(statementRows({ months: MON12, lines }));
  assert.deepEqual([st.period.basis, st.period.emptyCols], ['T-12', ['2026-09', '2026-10', '2026-11', '2026-12']]);
  assert.ok(statementChecks(st).some((x) => x.id === 'blanks'));
  assert.equal(st.months.length, 12, 'nothing is dropped: that is PR 3');
});

/* ------------------------------------------------------------------- 7. which sheet */

const sheetOf = (name, lineCount, { hidden = false, head = [] } = {}) => ({
  sheet: name, hidden,
  rows: grid(statementRows({ head, lines: Array.from({ length: lineCount }, (_, i) => [`Base Rent ${i + 1}`, ...Array(6).fill(100), 600]) })),
});

test('[old] a Budget sheet with more lines is never chosen; the actual sheet is taken without a question', () => {
  const choices = sheetChoices([sheetOf('Budget 2026', 9), sheetOf('T12 Actual', 3)]);
  assert.deepEqual(choices.map((c) => [c.sheet, c.i, c.projection, c.lines, c.hidden]), [['Budget 2026', 0, true, 9, false], ['T12 Actual', 1, false, 3, false]]);
  assert.equal(pickSheet(choices).choice.sheet, 'T12 Actual');
});

test('[old] the projection words are found in the sheet name or in its first five rows, not by size', () => {
  for (const name of ['Forecast', 'Pro Forma', 'proforma', 'Projected NOI', '2026 Projection', 'Budget']) assert.equal(sheetChoices([sheetOf(name, 2)])[0].projection, true, name);
  assert.equal(sheetChoices([sheetOf('Sheet2', 2, { head: [['Invented Plaza'], ['Forecast for 2027']] })])[0].projection, true);
  for (const name of ['T12 Actual', 'Budgetary', 'Operating Statement']) assert.equal(sheetChoices([sheetOf(name, 2)])[0].projection, false, name);
});

test('[old] two actual sheets always ask, whatever their sizes, with the projection listed too', () => {
  const choices = sheetChoices([sheetOf('Jan-Jun', 2), sheetOf('Budget', 8), sheetOf('Jul-Dec', 7)]);
  const p = pickSheet(choices);
  assert.equal(p.choice, undefined);
  assert.deepEqual(p.ask.map((c) => [c.sheet, c.projection]), [['Jan-Jun', false], ['Budget', true], ['Jul-Dec', false]]);
});

test('[old] a hidden sheet is listed as hidden and is asked about, never taken on its own', () => {
  const both = pickSheet(sheetChoices([sheetOf('Visible', 3), sheetOf('Old copy', 3, { hidden: true })]));
  assert.deepEqual(both.ask.map((c) => [c.sheet, c.hidden]), [['Visible', false], ['Old copy', true]]);
  const only = pickSheet(sheetChoices([sheetOf('Old copy', 3, { hidden: true })]));
  assert.ok(only.ask && !only.choice, 'the only statement is hidden: asked, not silently read');
});

test('[old] only projections: refused, naming them; nothing readable: the first sheet’s reason', () => {
  const p = pickSheet(sheetChoices([sheetOf('Budget', 4), sheetOf('Forecast', 4)]));
  assert.equal(p.refuse, 'The only statements in this file look like projections, not actuals (“Budget”, “Forecast”). Import a sheet of actual results.');
  const none = pickSheet(sheetChoices([{ sheet: 'Notes', rows: grid([['Name', 'Phone'], ['A', '555']]) }]));
  assert.match(none.refuse, /No months or total column were found on “Notes”/);
});

test('a sheet’s choice carries its period, so the chooser can show it', () => {
  const c = sheetChoices([sheetOf('Jan-Jun', 2)])[0];
  assert.deepEqual([c.period.basis, c.period.count, c.error], ['T-6', 6, null]);
  assert.equal(periodShort(c.period), 'T-6 · Jan 2026 to Jun 2026');
  assert.equal(periodShort(read([['Account', 'Total'], ['Base Rent', 5]]).period), 'annual total only');
});

/* --------------------------------------------- 8. what the card and the line list say */

test('[old] the card says where a statement came from: file, how it was read, numbers, sheet', () => {
  const csv = read(statementRows({ lines: SIX }), { numberFormat: 'eu', source: { type: 'csv', delimiter: ';' } });
  assert.equal(sourceText(csv), 'invented.csv · CSV (semicolons) · numbers read as 1.234,56');
  const book = read(statementRows({ lines: SIX }), { file: 'plaza.xlsx', sheet: 'T12 Actual', source: { type: 'xlsx', sheets: [{ name: 'Budget' }, { name: 'T12 Actual' }, { name: 'Notes' }] } });
  assert.equal(sourceText(book), 'plaza.xlsx · sheet “T12 Actual” (2 of 3)');
  assert.equal(sourceText(read(statementRows({ lines: SIX }), { file: 'plaza.xlsx', sheet: 'P&L', source: { type: 'xlsx', sheets: [{ name: 'P&L' }] } })), 'plaza.xlsx · P&L');
  assert.equal(sourceText(read(statementRows({ lines: SIX }), { file: 'Pasted', source: { type: 'paste' } })), 'Pasted · pasted');
  assert.equal(sourceText({ file: 'old.xlsx', sheet: 'P&L' }), 'old.xlsx · P&L', 'a statement read before 4.7.28 reads as it did');
  assert.equal(sourceText({ file: 'old.csv', sheet: 'CSV' }), 'old.csv');
});

test('[old] a line says its blank months, its unread cells, and pasted or medium confidence', () => {
  const st = read(statementRows({ lines: SIX }));
  assert.deepEqual(lineNotes(st, repairs(st)), ['1 month blank (Feb), counted as $0', '1 cell unread (n/a in May), counted as $0', 'medium confidence']);
  assert.deepEqual(lineNotes(st, st.lines.find((l) => l.label === 'Base Rent')), []);
  const p = importStatement(pastedRows('Account\tJan 2026\tFeb 2026\tMar 2026\nRepairs\t1\t\t1\n'), { source: { type: 'paste' } });
  assert.deepEqual(lineNotes(p, p.lines[0]), ['1 month blank (Feb), counted as $0', 'pasted']);
  assert.deepEqual(lineNotes({ months: ['2026-01'] }, { label: 'x' }), [], 'a line read before 4.7.28 has no notes');
});
