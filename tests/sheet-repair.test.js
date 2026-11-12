/* Workbooks whose cells are fine but that stop the reader: overlapping merged ranges are read with a note;
 * a workbook with no shared-strings part is refused with a plain reason instead of showing position numbers as values; 1904 dates,
 * inline strings and a very wide sheet read as they should; a failure carries its step and a fixed reason word, never a message.
 * Invented workbooks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const { readGrids, loadXlsx, repairParts, loadFailed } = await import('../app/sheetread.js');
const getXlsx = async () => ({ ExcelJS, fflate });
const getFflate = async () => fflate;
const td = new TextDecoder(); const te = new TextEncoder();
async function parts() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rent Roll');
  ws.addRow(['Unit', 'Tenant', 'SF', 'Rent', 'Start']);
  ws.addRow(['101', 'Invented Co', 1000, 2400, new Date(Date.UTC(2024, 0, 31))]);
  ws.addRow(['102', 'Sample LLC', 1200, 3000, new Date(Date.UTC(2025, 5, 30))]);
  return fflate.unzipSync(new Uint8Array(await wb.xlsx.writeBuffer()));
}
const sheetXml = (z, f) => { z['xl/worksheets/sheet1.xml'] = te.encode(f(td.decode(z['xl/worksheets/sheet1.xml']))); return z; };
const open = (z, name = 'a.xlsx') => readGrids(new File([fflate.zipSync(z)], name), getXlsx, { getFflate });

test('overlapping merged ranges: the workbook is read, with a note, and the values are what was saved', async () => {
  const z = sheetXml(await parts(), (s) => s.replace('</sheetData>', '</sheetData><mergeCells count="2"><mergeCell ref="F1:G2"/><mergeCell ref="G2:H3"/></mergeCells>'));
  await assert.rejects(new ExcelJS.Workbook().xlsx.load(fflate.zipSync(z)), /merge/i, 'ExcelJS itself stops on this file (so the test is about something real)');
  const g = await open(z);
  assert.deepEqual(g[0].rows[1].cells.slice(0, 4), ['101', 'Invented Co', 1000, 2400]);
  assert.match(g[0].note, /damaged merged-cell ranges \(ignored\); the cell values are as saved/);
});

test('a workbook that loads normally is never repaired, and has no repair note', async () => {
  const g = await open(await parts());
  assert.ok(!g[0].note || !/damaged/.test(g[0].note));
  assert.equal(repairParts(fflate.zipSync(await parts()).buffer, fflate), null);
});

test('a workbook with no shared-strings part is refused with a plain reason, not read with position numbers as its words', async () => {
  const z = await parts();
  delete z['xl/sharedStrings.xml'];
  await assert.rejects(open(z), (e) => /missing the part that holds its text/.test(e.message) && !/ExcelJS/.test(e.message) && e.step === 'strings' && e.code === 'missing-shared-strings');
});

test('inline strings, a 1904 date system and a very wide sheet read as they should', async () => {
  const z = sheetXml(await parts(), (s) => s.replace(/<c r="(\w+)"([^>]*) t="s"[^>]*><v>(\d+)<\/v><\/c>/g, (m, r, a, i) => `<c r="${r}"${a} t="inlineStr"><is><t>Text ${i}</t></is></c>`));
  const g = await open(z);
  assert.match(String(g[0].rows[1].cells[1]), /^Text \d+$/);
  const w = sheetXml(await parts(), (s) => s.replace(/(<row r="1"[^>]*>.*?)(<\/row>)/s, `$1${Array.from({ length: 3000 }, (_, i) => `<c r="${colName(i + 6)}1"><v>${i}</v></c>`).join('')}$2`));
  assert.ok((await open(w))[0].rows[0].cells.length > 3000);
  const y = await parts();
  y['xl/workbook.xml'] = te.encode(td.decode(y['xl/workbook.xml']).replace(/<workbookPr[^>]*\/>/, '<workbookPr date1904="1"/>'));
  const d = (await open(y))[0].rows[1].cells[4];
  assert.equal(d, '2028-02-01', 'a serial in a 1904 workbook is 1904-based (4 years and a day after the same serial in a 1900 workbook)');
});
function colName(n) { let c = ''; while (n > 0) { c = String.fromCharCode(65 + (n - 1) % 26) + c; n = Math.floor((n - 1) / 26); } return c; }

test('a failure carries its step and a fixed reason word and error class, never the message', () => {
  const e = loadFailed('load', new TypeError("Cannot read properties of undefined (reading 'x') in Secret Tenant LLC"), 'plain sentence');
  assert.equal(e.step, 'load');
  assert.equal(e.code, 'missing-part-or-value');
  assert.equal(e.causeClass, 'TypeError');
  assert.equal(e.message, 'plain sentence');
  assert.ok(!JSON.stringify([e.step, e.code, e.causeClass]).includes('Secret'));
  assert.equal(loadFailed('load', new Error('Cannot merge already merged cells')).code, 'overlapping-merge');
});

test('a workbook ExcelJS cannot load, and that cannot be repaired, is refused with the usual sentence and a step', async () => {
  const z = await parts();
  z['xl/workbook.xml'] = te.encode('<workbook><not closed');
  await assert.rejects(loadXlsx(new File([fflate.zipSync(z)], 'x.xlsx'), getXlsx), (e) => /could not be opened as an Excel workbook/.test(e.message) && e.step === 'load' && typeof e.code === 'string');
});
