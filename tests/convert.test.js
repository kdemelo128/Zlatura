/* Documents > Convert: the matrix, the refusals, the conversions that need no browser, and the PDF-writing worker
 * run as the browser runs it, all on invented files (tests/tools/docpdfs.mjs). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';
import {
  MATRIX, NOT_OFFERED, KIND_LABEL, targetsFor, notPossible, classify, mismatch, textKind, imageSize, exifOrientation, pageScale,
  unsupportedChars, textPdfProblem, docxText, csvToCells, csvToJson, jsonToCsv, workbookToCsvs, sheetName, baseName,
  MAX_IMAGE_PIXELS, PAGE_PICTURE, DOCX_BYTES,
} from '../app/convert.js';
import { plainPdf, encryptedPdf, tinyPng, hugePng, jpegShell, docxFile, oleDoc, otherZip } from './tools/docpdfs.mjs';

const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;

/** A File-like: name, size, slice and arrayBuffer over bytes (size can be claimed larger to test a limit). */
const file = (name, bytes, size = bytes.length) => {
  const b = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const buf = (x) => x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength);
  return { name, size, slice: (a, z) => ({ arrayBuffer: async () => buf(b.subarray(a, z)) }), arrayBuffer: async () => { if (size > b.length) throw new Error('read a file that is over its limit'); return buf(b); } };
};
const getFflate = async () => fflate;

/* ------------------------------------------------------------------ the matrix */

test('matrix: every row takes a known kind and names a way to run; every kind has a way out or a stated reason', () => {
  for (const m of MATRIX) {
    assert.ok(m.from.length && m.from.every((k) => KIND_LABEL[k]), m.id);
    assert.ok(['worker', 'canvas', 'pdfjs', 'main'].includes(m.how) && m.ext && m.type && m.fidelity.length > 20, m.id);
  }
  assert.equal(new Set(MATRIX.map((m) => m.id)).size, MATRIX.length, 'ids are unique');
  for (const k of Object.keys(KIND_LABEL)) {
    assert.ok(targetsFor(k).length > 0, `${k} can become something`);
    assert.ok(notPossible(k).length > 0, `${k} says what it can’t become, and why`);
    for (const [to, why] of notPossible(k)) assert.ok(to && why.length > 8, `${k} → ${to} has a reason`);
  }
});

test('matrix: the pairs the design lists are there, and the ones it refuses are not', () => {
  const ids = (k) => targetsFor(k).map((m) => m.id).sort();
  assert.deepEqual(ids('jpeg'), ['img-pdf', 'jpeg-png']);
  assert.deepEqual(ids('png'), ['img-pdf', 'png-jpeg']);
  assert.deepEqual(ids('webp'), ['img-pdf', 'webp-jpeg', 'webp-png']);
  assert.deepEqual(ids('heic'), ['heic-jpeg']);
  assert.deepEqual(ids('pdf'), ['pdf-jpeg', 'pdf-png', 'pdf-txt']);
  assert.deepEqual(ids('xlsx'), ['xlsx-csv']);
  assert.deepEqual(ids('docx'), ['docx-txt']);
  assert.deepEqual(ids('csv'), ['csv-json', 'csv-xlsx', 'txt-pdf']);
  assert.deepEqual(ids('json'), ['json-csv', 'txt-pdf']);
  assert.deepEqual(ids('txt'), ['txt-pdf']);
  assert.ok(!MATRIX.some((m) => /docx|xlsx/.test(m.from.join()) && m.ext === 'pdf'), 'no Office file becomes a PDF');
  assert.ok(notPossible('xlsx').some(([to]) => to === 'PDF') && notPossible('docx').some(([to]) => to === 'PDF'), 'and they say why');
  assert.ok(NOT_OFFERED.length >= 6);
});

/* ------------------------------------------------------------------ what a file is */

test('classify: the bytes decide the kind, the name only words a note', async () => {
  const c = await classify(file('Photo.jpg', plainPdf('A', 1)), { getFflate });
  assert.equal(c.kind, 'pdf');
  assert.match(c.note, /“Photo\.jpg” is really a PDF, whatever its name says/);
  assert.equal((await classify(file('x.pdf', tinyPng()), { getFflate })).kind, 'png');
  assert.equal((await classify(file('x.png', jpegShell()), { getFflate })).kind, 'jpeg');
  assert.equal((await classify(file('Book.xlsx', await xlsxBytes(), undefined), { getFflate })).kind, 'xlsx');
  assert.equal((await classify(file('m.docx', docxFile()), { getFflate })).kind, 'docx');
  assert.equal(mismatch('a.csv', 'txt'), '', 'a table named .csv is no mismatch');
});

test('classify: a text file is a table, a JSON list or plain text by its words', async () => {
  assert.equal((await classify(file('a.txt', 'Unit,Rent\n1,1200\n2,1300\n'))).kind, 'csv');
  assert.equal((await classify(file('a.csv', 'just a sentence\n'))).kind, 'csv', 'a .csv name with one column is still a table the person called one');
  assert.equal((await classify(file('a.txt', '[{"a":1}]'))).kind, 'json');
  assert.equal((await classify(file('a.json', '{not json'))).kind, 'txt');
  assert.equal(textKind('hello there\nworld\n'), 'txt');
});

test('classify: hostile and unconvertible files are refused by name, each with its own next step', async () => {
  const refuse = async (name, bytes, size) => (await classify(file(name, bytes, size), { getFflate })).refuse;
  assert.match(await refuse('Lease.pages', otherZip()), /^Lease\.pages is an Apple Pages file\. Zlatura can’t convert it on this device\. In Pages, choose Export → PDF/);
  assert.match(await refuse('Deck.pptx', otherZip()), /^Deck\.pptx is a PowerPoint file.*Export → PDF/);
  assert.match(await refuse('Old.doc', oleDoc()), /^Old\.doc is an old Word \(\.doc\) file.*\.docx/);
  assert.match(await refuse('Scan.tif', Uint8Array.of(0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 0, 0)), /^Scan\.tif is a TIFF image/);
  assert.match(await refuse('Plan.dwg', new TextEncoder().encode('AC1015\0\0\0\0')), /^Plan\.dwg is an AutoCAD drawing/);
  assert.match(await refuse('Pics.heic', Uint8Array.from([0, 0, 0, 24, ...new TextEncoder().encode('ftypavif'), 0, 0, 0, 0, 0, 0, 0, 0])), /AVIF/);
  assert.match(await refuse('Clip.mov', Uint8Array.from([0, 0, 0, 24, ...new TextEncoder().encode('ftypqt  '), 0, 0, 0, 0, 0, 0, 0, 0])), /^Clip\.mov is not a file type Zlatura can convert/);
  assert.match(await refuse('Blob.bin', Uint8Array.of(1, 2, 0, 3, 4)), /not a file type Zlatura can convert/);
  assert.match(await refuse('Empty.pdf', new Uint8Array(0)), /^Empty\.pdf is empty/);
});

test('classify: a file over its kind’s limit is refused before it is read whole', async () => {
  const over = async (name, bytes, size) => classify(file(name, bytes, size), { getFflate });
  assert.match((await over('Big.pdf', plainPdf('A', 1), 50e6 + 1)).refuse, /^Big\.pdf is 50 MB; a PDF is read up to 50 MB/);
  assert.equal((await over('Edge.pdf', plainPdf('A', 1), 50e6)).refuse, null, 'the limit itself is allowed');
  assert.match((await over('Big.png', tinyPng(), 20e6 + 1)).refuse, /read up to 20 MB/);
  assert.match((await over('Big.txt', 'abc', 10e6 + 1)).refuse, /read up to 10 MB/);
  assert.match((await over('Big.xlsx', otherZip(), 25e6 + 1)).refuse, /read up to 25 MB/);
});

test('classify: a Word file that is a decompression bomb is refused, not opened', async () => {
  const bomb = fflate.zipSync({ 'word/document.xml': new Uint8Array(3e6) }, { level: 9 });
  const c = await classify(file('Bomb.docx', bomb), { getFflate });
  assert.equal(c.kind, 'zip');
  assert.match(c.refuse, /^Bomb\.docx: That file packs a part far tighter/);
});

/* ------------------------------------------------------------------ pictures */

test('imageSize reads PNG, JPEG and WebP headers; hostile sizes are caught before a canvas', () => {
  assert.deepEqual(imageSize(tinyPng(8, 6)), { w: 8, h: 6 });
  assert.deepEqual(imageSize(jpegShell(40, 30)), { w: 40, h: 30 });
  assert.deepEqual(imageSize(hugePng(60000, 60000)), { w: 60000, h: 60000 });
  const webp = Uint8Array.from([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBPVP8X'].map((c) => c.charCodeAt(0)), [10, 0, 0, 0, 0, 0, 0, 0, 99, 0, 0, 49, 0, 0]));
  assert.deepEqual(imageSize(webp), { w: 100, h: 50 });
  assert.equal(imageSize(Uint8Array.of(1, 2, 3)), null);
  assert.ok(60000 * 60000 > MAX_IMAGE_PIXELS);
});

test('exifOrientation: upright is 1, a camera’s turn is read, junk is 1', () => {
  assert.equal(exifOrientation(jpegShell(40, 30, 1)), 1);
  for (const o of [3, 6, 8]) assert.equal(exifOrientation(jpegShell(40, 30, o)), o);
  assert.equal(exifOrientation(tinyPng()), 1);
  assert.equal(exifOrientation(Uint8Array.of(0xff, 0xd8, 0xff)), 1);
});

test('pageScale: 150 dpi, but never a side over 4096 px or a canvas over the pixel limit', () => {
  assert.equal(pageScale(612, 792), PAGE_PICTURE.dpi / 72, 'a Letter page is drawn at 150 dpi');
  const big = pageScale(5000, 3000);
  assert.ok(5000 * big <= PAGE_PICTURE.longest + 1e-9, 'longest side capped');
  const sq = pageScale(4000, 4000);
  assert.ok(4000 * sq * 4000 * sq <= MAX_IMAGE_PIXELS + 1, 'pixel count capped');
});

/* ------------------------------------------------------------------ text to PDF */

test('text to PDF: a character a standard font can’t draw is refused and named; Latin text passes', () => {
  assert.equal(textPdfProblem('a.txt', 'Café – “quoted” € 5\ttab\nline'), null);
  const p = textPdfProblem('Notes.txt', 'Hello 😀 and привет');
  assert.match(p, /^Notes\.txt has \d+ kinds? of character a standard PDF font can’t draw: .*U\+1F600/);
  assert.match(p, /Nothing was converted/);
  assert.equal(unsupportedChars('→ →').length, 1, 'each character named once');
  assert.ok(unsupportedChars('a\u0000b').length === 1, 'a control character is refused');
});

/* ------------------------------------------------------------------ Word to text */

test('Word to text: body text and table cells; a text box once; deleted text and the header left out', () => {
  const t = docxText(docxFile(['First paragraph.', 'Second & last.']), fflate, 'M.docx');
  assert.equal(t, 'First paragraph.\nSecond & last.\nCell A\tCell B\nBoxed note\nKept');
});

test('Word to text: a file with no body, a damaged zip and an over-size body are refused in words', () => {
  assert.throws(() => docxText(fflate.zipSync({ 'word/document.xml': fflate.strToU8('<w:document><w:body></w:body></w:document>') }), fflate, 'E.docx'), /^Error: E\.docx has no text in its body/);
  assert.throws(() => docxText(Uint8Array.of(1, 2, 3), fflate, 'D.docx'), /could not be opened as a Word document/);
  const big = fflate.zipSync({ 'word/document.xml': new Uint8Array(DOCX_BYTES + 1) }, { level: 9 });
  assert.throws(() => docxText(big, fflate, 'B.docx'), /^Error: B\.docx has a body of more than 30 MB/);
});

/* ------------------------------------------------------------------ tables */

test('CSV to cells: plain numbers become numbers, everything else stays text, a blank stays blank', () => {
  const { rows, numbers } = csvToCells('Unit,Rent,Zip,Share,Note\n1,1200.50,00501,5%,\n2,"1,300",07030,$5,x\n', ',', 'r.csv');
  assert.deepEqual(rows[1], [1, 1200.5, '00501', '5%', null]);
  assert.deepEqual(rows[2], [2, '1,300', '07030', '$5', 'x']);
  assert.equal(numbers, 3);
  assert.equal(csvToCells('a\n123456789012345678\n-0\n', ',').rows[1][0], '123456789012345678', 'a long id stays text');
  assert.equal(csvToCells('a\n-0\n', ',').rows[1][0], '-0');
});

test('CSV to JSON: the first row names the fields and values stay text; what would be lost is refused', () => {
  assert.deepEqual(JSON.parse(csvToJson('a,b\n1,\n007,x\n', ',', 'r.csv')), [{ a: '1', b: '' }, { a: '007', b: 'x' }]);
  assert.throws(() => csvToJson('a,,c\n1,2,3\n', ',', 'r.csv'), /Column 2 of r\.csv has no heading/);
  assert.throws(() => csvToJson('a,a\n1,2\n', ',', 'r.csv'), /“a” more than once/);
  assert.throws(() => csvToJson('a,b\n1,2,3\n', ',', 'r.csv'), /Row 2 of r\.csv has 3 values but there are 2 headings/);
  assert.throws(() => csvToJson('a,b\n', ',', 'r.csv'), /heading row and at least one row/);
  const o = JSON.parse(csvToJson('__proto__,b\n1,2\n', ',', 'r.csv'));
  assert.equal(Object.keys(o[0]).join(), '__proto__,b', 'a field named __proto__ stays a field');
});

test('JSON to CSV: flat records only; null is blank; a formula-looking text is guarded; nesting is refused, not flattened', () => {
  const csv = jsonToCsv('[{"a":1,"b":null,"c":"x,y"},{"a":2,"d":true,"c":"=1+1"}]', 'r.json');
  assert.equal(csv, '﻿a,b,c,d\r\n1,,"x,y",\r\n2,,\'=1+1,true\r\n');
  assert.throws(() => jsonToCsv('[{"a":{"b":1}}]', 'r.json'), /Item 1, “a” of r\.json holds a list or a record inside the record/);
  assert.throws(() => jsonToCsv('{"a":1}', 'r.json'), /must be a list of records/);
  assert.throws(() => jsonToCsv('[1,2]', 'r.json'), /Item 1 of r\.json is not a record/);
  assert.throws(() => jsonToCsv('[{"a":', 'r.json'), /is not valid JSON/);
});

async function xlsxBytes() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rent roll');
  ws.addRow(['Unit', 'Rent', 'Start', 'Flag']);
  ws.addRow(['A1', 1200, new Date(Date.UTC(2026, 0, 31)), true]);
  ws.addRow(['A2', null, null, null]); // a blank rent
  ws.addRow(['A3', { formula: 'B2*2', result: 2400 }, '=hello', { formula: 'B9', result: undefined }]);
  ws.addRow([]);
  ws.mergeCells('A6:B6'); ws.getCell('A6').value = 'Merged';
  wb.addWorksheet('Hidden').state = 'hidden';
  wb.getWorksheet('Hidden').addRow(['secret']);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

test('workbook to CSV: a blank stays blank (not 0), a formula gives its saved result, hidden sheets are named and skipped', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await xlsxBytes());
  const { sheets, notes } = workbookToCsvs(wb);
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].csv, '﻿Unit,Rent,Start,Flag\r\nA1,1200,2026-01-31,TRUE\r\nA2,,,\r\nA3,2400,\'=hello,\r\n,,,\r\nMerged,,,\r\n');
  const text = notes.join(' ');
  assert.match(text, /2 formulas gave the result Excel last calculated; 1 had none saved and are blank/);
  assert.match(text, /1 text cell starting with = \+ - or @ got a leading '/);
  assert.match(text, /Hidden sheet not converted: Hidden/);
  assert.match(text, /merged cell/);
});

test('workbook to CSV: a sheet over the cell limit is refused by name', () => {
  const ws = { name: 'Huge', state: 'visible', rowCount: 2e6, columnCount: 2 };
  assert.throws(() => workbookToCsvs({ eachSheet: (f) => f(ws) }), /The sheet “Huge” has 2000000 rows by 2 columns/);
});

test('names: sheet names and file names are made safe', () => {
  assert.equal(sheetName('A/B:C*D[1]?'), 'A B C D 1');
  assert.equal(sheetName('x'.repeat(40)).length, 31);
  assert.equal(sheetName('///'), 'Sheet1');
  assert.equal(baseName('Rent roll.final.xlsx'), 'Rent roll.final');
});

/* ------------------------------------------------------------------ the worker */

function startWorker() {
  const lib = fs.readFileSync(new URL('../vendor/pdf-lib-cantoo-2.11.1.min.js', import.meta.url), 'utf8');
  const posted = [];
  const ctx = vm.createContext({ console, TextEncoder, TextDecoder, setTimeout, clearTimeout, crypto: globalThis.crypto });
  ctx.self = ctx;
  ctx.importScripts = () => vm.runInContext(lib, ctx);
  ctx.postMessage = (m) => posted.push(m);
  vm.runInContext(fs.readFileSync(new URL('../app/convert-worker.js', import.meta.url), 'utf8'), ctx);
  return async (data) => { posted.length = 0; await ctx.onmessage({ data }); return posted.at(-1); };
}
const blob = (bytes) => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
const latin = (b) => Buffer.from(b).toString('latin1');

test('worker: a JPEG becomes a one-page PDF holding the JPEG’s own bytes unchanged', async () => {
  const ask = startWorker();
  const jpg = jpegShell(300, 150);
  const r = await ask({ id: 1, type: 'image', file: blob(jpg), kind: 'jpeg' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(latin(r.bytes).includes(latin(jpg)), 'the picture’s bytes are in the file, unchanged');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(r.bytes), verbosity: 0 }).promise;
  assert.equal(doc.numPages, 1);
  const v = (await doc.getPage(1)).getViewport({ scale: 1 });
  assert.deepEqual([Math.round(v.width), Math.round(v.height)], [144, 72], 'the page is the picture at 150 dpi');
});

test('worker: a PNG becomes a PDF; a damaged picture is refused with a reason', async () => {
  const ask = startWorker();
  const r = await ask({ id: 2, type: 'image', file: blob(tinyPng(30, 20)), kind: 'png' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal((await pdfjs.getDocument({ data: new Uint8Array(r.bytes), verbosity: 0 }).promise).numPages, 1);
  const bad = await ask({ id: 3, type: 'image', file: blob(Uint8Array.of(1, 2, 3, 4)), kind: 'png' });
  assert.equal(bad.ok, false);
  assert.equal(bad.kind, 'invalid');
});

test('worker: text becomes pages that read back, wrapped and in order; a text of too many pages is refused', async () => {
  const ask = startWorker();
  const words = Array.from({ length: 1200 }, (_, i) => `word${i}`).join(' ');
  const r = await ask({ id: 4, type: 'text', text: `Title line\n\n${words}\nLast line` });
  assert.equal(r.ok, true, JSON.stringify(r));
  const doc = await pdfjs.getDocument({ data: new Uint8Array(r.bytes), verbosity: 0 }).promise;
  assert.ok(doc.numPages >= 2);
  const all = [];
  for (let i = 1; i <= doc.numPages; i++) all.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' '));
  const joined = all.join(' ');
  assert.ok(joined.startsWith('Title line'));
  assert.ok(joined.includes('word0') && joined.includes('word1199') && joined.endsWith('Last line'));
  const many = await ask({ id: 5, type: 'text', text: 'x\n'.repeat(60 * 301) });
  assert.equal(many.ok, false);
  assert.equal(many.kind, 'toolong');
});

test('an encrypted PDF is not something this card converts without a message (pdf.js names it)', async () => {
  let err;
  try { await pdfjs.getDocument({ data: new Uint8Array(encryptedPdf()), verbosity: 0 }).promise; } catch (e) { err = e; }
  assert.ok(err && /PasswordException|InvalidPDFException|FormatError/.test(err.name), String(err && err.name));
});
