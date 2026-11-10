/* The two local measuring tools (tests/tools/doc-local.mjs, tests/tools/uw-oracle.mjs): the scoreboard's shape and
 * totals, that no name or figure is ever printed (a canary), the private/ guard, the labels map only on request, and
 * the oracle's "not run" / exit codes and its comparison with a package (an invented stand-in, run in a vm). Every
 * file here is invented. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'tests/tools/doc-local.mjs');
const ORACLE = path.join(ROOT, 'tests/tools/uw-oracle.mjs');
const run = (script, args, env = {}) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, UW_PACKAGE_DIR: '', ...env }, timeout: 120000 });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'doc-local-'));

const CANARY_NAME = 'Zorblax Canary Holdings';
const CANARY_FIGURE = '987654';

/** A folder of invented files: a T-12 (with an answer file), a rent roll holding the canary, and a file nothing reads. */
function folder() {
  const d = path.join(tmp(), 'docs'); // the labels map goes next to it, in its own parent
  fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'alpha.csv'), ['Account,Jan 2026,Feb 2026,Mar 2026,Apr 2026,May 2026,Jun 2026,Total', 'Income', 'Base Rent,1000,1000,1000,1000,1000,1000,6000', 'Operating Expenses', 'Real Estate Taxes,200,200,200,200,200,200,1200', 'Repairs,100,100,100,100,100,100,600'].join('\n'));
  fs.writeFileSync(path.join(d, 'alpha.answers.json'), JSON.stringify({ noi: 4200, months: 6, egi: 6000, opex: 1 }));
  fs.writeFileSync(path.join(d, 'beta.csv'), ['Unit,Tenant,SF,Monthly Rent,Lease End', `101,${CANARY_NAME},${CANARY_FIGURE},2400,2028-01-31`, '102,Vacant,0,0,'].join('\n'));
  fs.writeFileSync(path.join(d, 'gamma.bin'), Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 0, 255, 254, 9]));
  return d;
}

test('doc-local: the scoreboard has its header, a row per family and totals that add up', () => {
  const d = folder();
  const r = run(DOC, [d, '--allow-outside-private']);
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split('\n');
  assert.match(lines.find((l) => l.startsWith('doc-local:')), /^doc-local: 3 file\(s\)/);
  assert.ok(lines.includes('family | files | accepted | asked | refused | answer files | fields right | wrong | asked | missed'));
  // t12: 1 file accepted, 1 answer file with 4 fields: noi, months, egi right; opex wrong (the answer says 1)
  assert.ok(lines.includes('t12 | 1 | 1 | 0 | 0 | 1 | 3 | 1 | 0 | 0'), r.stdout);
  assert.ok(lines.includes('rrsheet | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0'), r.stdout);
  const row = lines.filter((l) => /^[^|]+ \| \d/.test(l) && !l.startsWith('TOTAL')).map((l) => l.split(' | ').map((x, i) => (i ? Number(x) : x)));
  const sum = (i) => row.reduce((s, x) => s + x[i], 0);
  const total = lines.find((l) => l.startsWith('TOTAL')).split(' | ').slice(1).map(Number);
  assert.deepEqual(total, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(sum), 'TOTAL is the sum of the family rows');
  assert.equal(total[0], 3);
  assert.equal(total[1] + total[2] + total[3], 3, 'every file is accepted, asked or refused');
  assert.equal(total[3], 1, 'the unreadable file is refused');
});

test('doc-local: no name, tenant, file name or figure is printed', () => {
  const d = folder();
  for (const extra of [[], ['--labels'], ['--verbose-files']]) {
    const r = run(DOC, [d, '--allow-outside-private', ...extra]);
    const out = r.stdout + r.stderr;
    for (const s of [CANARY_NAME, 'Zorblax', CANARY_FIGURE, 'alpha', 'beta', 'gamma', path.dirname(d), '4200', '6000']) assert.ok(!out.includes(s), `the output must not hold "${s}" (${extra.join(' ') || 'plain'})`);
  }
});

test('doc-local: refuses a folder outside private/ without the flag', () => {
  const d = folder();
  const r = run(DOC, [d]);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /^Refused: /);
  assert.ok(!/files read/.test(r.stdout), 'nothing was read');
  assert.ok(!fs.existsSync(path.join(path.dirname(d), 'doc-local-labels.json')));
});

test('doc-local: the labels map is written only with --labels, and holds the file names', () => {
  const d = folder();
  const map = path.join(path.dirname(d), 'doc-local-labels.json');
  fs.rmSync(map, { force: true });
  run(DOC, [d, '--allow-outside-private']);
  assert.ok(!fs.existsSync(map), 'not written unless asked');
  run(DOC, [d, '--allow-outside-private', '--labels']);
  const m = JSON.parse(fs.readFileSync(map, 'utf8'));
  fs.rmSync(map, { force: true });
  assert.deepEqual(Object.keys(m), ['file-01', 'file-02', 'file-03']);
  assert.deepEqual(Object.values(m), ['alpha.csv', 'beta.csv', 'gamma.bin']);
});

/* ------------------------------------------------------------ --reasons */

const enc = new TextEncoder();
/** A one-page PDF written by hand: `lines` are drawn as text, `boxes` as filled rectangles (a picture with no text layer). */
function pdf(lines, boxes = 0) {
  const stream = `${lines.map((t, i) => `BT /F1 10 Tf 40 ${760 - 14 * i} Td (${t}) Tj ET`).join('\n')}\n${Array.from({ length: boxes }, (_, i) => `${40 + 20 * i} 300 15 15 re f`).join('\n')}`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 1 /Kids [4 0 R] >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let out = '%PDF-1.7\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out);
}
const CANARY_LINE = 'Zorblax canary narrative line 987654 about nothing at all';
const filler = Array.from({ length: 12 }, () => CANARY_LINE);
async function xlsx(build, { macro = false, badDate = false } = {}) {
  const wb = new ExcelJS.Workbook(); build(wb);
  let buf = Buffer.from(await wb.xlsx.writeBuffer());
  if (macro || badDate) {
    const z = fflate.unzipSync(new Uint8Array(buf));
    if (macro) z['xl/vbaProject.bin'] = enc.encode('placeholder, not a macro');
    if (badDate) z['xl/worksheets/sheet1.xml'] = enc.encode(fflate.strFromU8(z['xl/worksheets/sheet1.xml']).replace(/(<c [^>]*s="\d+"[^>]*><v>)[^<]*(<\/v>)/, '$19e99$2')); // a date serial no calendar has
    buf = Buffer.from(fflate.zipSync(z));
  }
  return buf;
}
const notes = (wb) => { const a = wb.addWorksheet('Pad'); a.addRow(['Zorblax canary memo']); a.addRow(['nothing a reader knows']); wb.addWorksheet('Aside').state = 'hidden'; };

/** Invented files, named so that their labels run file-01 ... file-09 in this order. */
async function reasonFolder() {
  const d = path.join(tmp(), 'docs');
  fs.mkdirSync(d);
  const put = (n, b) => fs.writeFileSync(path.join(d, n), b);
  put('zq-a-budget.pdf', pdf(['Annual budget, proposed for fiscal year FY2026, operating budget notes', ...filler]));
  put('zq-b-scan.pdf', pdf([], 3));
  put('zq-c-bomb.zip', Buffer.from(fflate.zipSync({ 'big.bin': new Uint8Array(2e6) })));
  put('zq-d-plain.zip', Buffer.from(fflate.zipSync({ 'a.txt': enc.encode('hello') }, { level: 0 })));
  put('zq-e-sundry.xlsx', await xlsx(notes));
  put('zq-f-memo.docx', Buffer.from(fflate.zipSync({ 'word/document.xml': enc.encode('<w:document/>') })));
  put('zq-g-baddate.xlsx', await xlsx((wb) => { const w = wb.addWorksheet('S'); w.addRow(['a', 'd']); w.addRow(['x', new Date('2026-01-31')]); }, { badDate: true }));
  put('zq-h-macro.xlsm', await xlsx(notes, { macro: true }));
  put('zq-i-roll.csv', ['Unit,Tenant,SF,Monthly Rent,Lease End', `101,${CANARY_NAME},${CANARY_FIGURE},2400,2028-01-31`, '102,Vacant,0,0,'].join('\n'));
  return d;
}

test('doc-local --reasons: a reason code per refused, asked or identified invented file', async () => {
  const d = await reasonFolder();
  const r = run(DOC, [d, '--allow-outside-private', '--reasons', '--verbose-files']);
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split('\n');
  const per = (n) => lines.find((l) => l.startsWith(`file-0${n}:`));
  assert.match(per(1), /^file-01: ask:budget, identified; reasons no-reader-for-type:budget, pages:1$/);
  assert.match(per(2), /^file-02: scan, refused; reasons no-text-layer:none, pages:1$/);
  assert.match(per(3), /^file-03: zip, refused; reasons zip-not-opened$/);
  assert.match(per(4), /^file-04: zip, refused; reasons zip-not-workbook$/);
  assert.match(per(5), /^file-05: unclassified, refused; reasons unknown-title, sheets:2-3, hidden-sheets:1$/);
  assert.match(per(6), /^file-06: unclassified, refused; reasons docx-later$/);
  // a workbook with an unreadable date cell is read now (the cell is blank, sheetread.js), so it ends as an untitled sheet, not a failed read
  assert.match(per(7), /^file-07: unclassified, refused; reasons unknown-title, sheets:1, hidden-sheets:0$/);
  assert.match(per(8), /^file-08: unclassified, refused; reasons unknown-title, macro-flag, sheets:2-3, hidden-sheets:1$/);
  assert.ok(/^file-09: rrsheet, accepted$/.test(per(9)), 'an accepted file carries no reason');
  // the counts tables
  assert.ok(lines.includes('reason | files (refused, asked and identified files only; a file can have several: its main reason, then its shape)'), r.stdout);
  for (const row of ['no-reader-for-type:budget | 1', 'no-text-layer:none | 1', 'zip-not-opened | 1', 'zip-not-workbook | 1', 'unknown-title | 3', 'docx-later | 1', 'macro-flag | 1', 'sheets:2-3 | 2', 'hidden-sheets:1 | 2', 'pages:1 | 2']) assert.ok(lines.includes(row), `${row}\n${r.stdout}`);
  assert.ok(lines.includes('family | reason | files'));
  assert.ok(lines.includes('unclassified | unknown-title | 3'), r.stdout);
  assert.ok(!r.stdout.includes('sheet-read-failed'), 'no read fails on an unreadable date any more');
  assert.ok(lines.includes('ask:budget | no-reader-for-type:budget | 1'), r.stdout);
  // identified is its own last column, not "asked" or "refused"
  assert.ok(lines.includes('family | files | accepted | asked | refused | answer files | fields right | wrong | asked | missed | identified, no reader'));
  assert.ok(lines.includes('ask:budget | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1'), r.stdout);
  assert.ok(lines.includes('TOTAL | 9 | 1 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 1'), r.stdout);
});

test('doc-local --reasons: no file name, text or figure is printed, only codes and buckets', async () => {
  const d = await reasonFolder();
  const r = run(DOC, [d, '--allow-outside-private', '--reasons', '--verbose-files', '--labels']);
  const out = r.stdout + r.stderr;
  for (const s of [CANARY_NAME, 'Zorblax', 'canary', CANARY_FIGURE, 'zq-', 'budget.pdf', 'baddate', 'memo', 'Invalid', 'placeholder', 'nothing a reader', path.dirname(d), 'Aside']) assert.ok(!out.includes(s), `the output must not hold "${s}"`);
  assert.ok(!/\b\d{4,}\b/.test(out.replace(/FY\d+/g, '')), 'no long number (a figure) is printed');
});

test('doc-local: without --reasons the output is what it was (pinned), and --reasons only adds to it', async () => {
  const d = folder();
  const quiet = (t) => t.split('\n').filter((l) => !l.startsWith('Warning:')).join('\n'); // pdf.js's polyfill notes
  const old = quiet(run(DOC, [d, '--allow-outside-private']).stdout);
  assert.equal(old, [
    "doc-local: 3 file(s) read by the app's own readers; counts only (no names, figures or text are printed)",
    'family | files | accepted | asked | refused | answer files | fields right | wrong | asked | missed',
    'rrsheet | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0',
    't12 | 1 | 1 | 0 | 0 | 1 | 3 | 1 | 0 | 0',
    'unknown | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0',
    'TOTAL | 3 | 2 | 0 | 1 | 1 | 3 | 1 | 0 | 0', ''].join('\n'));
  // with the flag, each existing row is the old row plus one column; nothing before that column moved
  const withFlag = quiet(run(DOC, [d, '--allow-outside-private', '--reasons']).stdout).split('\n');
  const oldLines = old.split('\n').filter(Boolean);
  oldLines.forEach((l, i) => assert.ok(withFlag[i].startsWith(l), `row ${i} keeps its old columns: ${withFlag[i]}`));
  assert.ok(!/reason/.test(old), 'the old output has no reason table');
});

/* ------------------------------------------------------------ the oracle */

test('uw-oracle: without UW_PACKAGE_DIR it prints "not run" and exits 0; with --require-oracle it exits 3', () => {
  const a = run(ORACLE, []);
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /oracle: not run \(set UW_PACKAGE_DIR\)/);
  assert.match(a.stdout, /uw-oracle: 3 invented case\(s\)/);
  const b = run(ORACLE, ['--require-oracle']);
  assert.equal(b.status, 3);
  assert.match(b.stdout, /oracle: not run/);
  const c = run(ORACLE, ['--require-oracle'], { UW_PACKAGE_DIR: path.join(tmp(), 'nothing-here') });
  assert.equal(c.status, 3, 'a folder with no calculation script is not a run either');
});

// An independent, invented stand-in for a package's finance.js (percent in, percent out), worked a different way.
const STAND_IN = `window.UWFinance = {
  irr: function (f) { var r = 0.1; for (var k = 0; k < 200; k++) { var v = 0, d = 0; for (var t = 0; t < f.length; t++) { v += f[t] / Math.pow(1 + r, t); d -= t * f[t] / Math.pow(1 + r, t + 1); } r -= v / d; } return r * 100; },
  dscr: function (noi, ds) { return noi / ds; },
  debtYield: function (noi, loan) { return noi / loan * 100; },
  capRate: function (noi, price) { return noi / price * 100; }
};`;
const pkg = (src) => { const p = tmp(); fs.mkdirSync(path.join(p, 'js')); fs.writeFileSync(path.join(p, 'js', 'finance.js'), src); return p; };

test('uw-oracle: the engine and an independent stand-in agree on the invented cases', () => {
  const p = pkg(STAND_IN);
  const r = run(ORACLE, ['--require-oracle'], { UW_PACKAGE_DIR: p });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const m = r.stdout.match(/oracle: ran; (\d+) field\(s\) compared, (\d+) differ/);
  assert.ok(m, r.stdout);
  assert.ok(+m[1] >= 11, `fields compared: ${m[1]}`);
  assert.equal(m[2], '0', r.stdout);
  assert.ok(!r.stdout.includes('finance.js') && !r.stdout.includes(p), 'the package is never named');
});

test('uw-oracle: a difference over 0.01 is reported, not adopted', () => {
  const p = pkg(STAND_IN.replace('noi / price * 100', 'noi / price * 100 + 0.5'));
  const r = run(ORACLE, [], { UW_PACKAGE_DIR: p });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /cap \| 7 \| 7\.5 \| DIFFERS by 0\.5/);
  assert.match(r.stdout, /3 differ/);
});

test('uw-oracle: the cases file is the engine\'s own figures (a hand check of case 1)', () => {
  const r = run(ORACLE, []);
  assert.match(r.stdout, /\ncap \| 7 \|/);
  assert.match(r.stdout, /\nequity \| 1800000 \|/);
  assert.match(r.stdout, /\ndebtService \| 246506\.5292 \|/);
});
