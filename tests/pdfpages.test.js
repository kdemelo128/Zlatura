/* Documents > PDF pages: the page list (order, turns, ranges, limits) and the worker that writes the file,
 * run here exactly as the browser runs it (its own script, the vendored library) on invented PDFs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  checkAdd, problemText, pagesOf, overPages, move, rotate, remove, pageLabel, parseRanges, orderFor, withPdf, partName,
  MAX_FILES, MAX_PAGES, MAX_BYTES,
} from '../app/pdfpages.js';
import { plainPdf, hostilePdf, damagedPdf, encryptedPdf, tocPdf, chainPdf, lostContentPdf, cutBeforeContentPdf, strayPdf, sharedImagesPdf, buildPdf, streamObj, pageObj, textStream } from './tools/docpdfs.mjs';

const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;

/* ---------------------------------------------------------- the page list */

const files = [{ name: 'A.pdf' }, { name: 'B.pdf' }];
const A = pagesOf(0, [0, 0, 0]);
const B = pagesOf(1, [0, 0]);
const labels = (ps) => ps.map((p) => `${'AB'[p.f]}${p.p + 1}`).join(' ');

test('moving a page up or down swaps it with its neighbour, and the ends stay put', () => {
  const all = [...A, ...B];
  assert.equal(labels(move(all, 2, -1)), 'A1 A3 A2 B1 B2');
  assert.equal(labels(move(all, 2, 1)), 'A1 A2 B1 A3 B2');
  assert.equal(labels(move(all, 0, -1)), 'A1 A2 A3 B1 B2');
  assert.equal(labels(move(all, 4, 1)), 'A1 A2 A3 B1 B2');
  assert.equal(labels(all), 'A1 A2 A3 B1 B2', 'the list it was given is not changed');
});

test('turning a page adds up clockwise, wraps at 360 and turns back the other way', () => {
  let ps = rotate(A, 1);
  assert.equal(ps[1].rot, 90);
  ps = rotate(rotate(rotate(ps, 1), 1), 1);
  assert.equal(ps[1].rot, 0, 'four quarter turns are no turn');
  assert.equal(rotate(A, 0, -90)[0].rot, 270);
  assert.equal(A[1].rot, 0);
});

test('deleting a page takes only that page out', () => {
  assert.equal(labels(remove([...A, ...B], 1)), 'A1 A3 B1 B2');
  assert.equal(remove(A, 9), A);
});

test('a page keeps the turn its file already gave it, and says it aloud', () => {
  const ps = rotate(pagesOf(0, [270, 0, -90]), 0, 90);
  assert.deepEqual(ps.map((p) => p.base), [270, 0, 270]);
  assert.equal(pageLabel(ps, 0, files), 'Page 1 of 3, from A.pdf', 'a page on its side turned a quarter is upright');
  assert.equal(pageLabel(ps, 1, files), 'Page 2 of 3, from A.pdf');
  assert.equal(pageLabel(ps, 2, files), 'Page 3 of 3, from A.pdf, rotated 270°');
});

test('page ranges: groups, spaces, smart dashes, and every kind of mistake named', () => {
  assert.deepEqual(parseRanges('1-3, 7', 10).groups, [[0, 1, 2], [6]]);
  assert.deepEqual(parseRanges(' 2 ;4–5 ', 10).groups, [[1], [3, 4]], 'a semicolon and an en dash are read');
  assert.deepEqual(parseRanges('7, 1-2', 10).groups, [[6], [0, 1]], 'the order typed is kept');
  assert.match(parseRanges('', 5).error, /Type the pages/);
  assert.match(parseRanges('1,,3', 5).error, /empty place/);
  assert.match(parseRanges('abc', 5).error, /“abc” is not a page/);
  assert.match(parseRanges('0', 5).error, /numbered from 1/);
  assert.match(parseRanges('3-1', 5).error, /runs backwards/);
  assert.match(parseRanges('1-6', 5).error, /Page 6 is past the last page \(5\)/, 'one past the end is refused');
  assert.deepEqual(parseRanges('1-5', 5).groups, [[0, 1, 2, 3, 4]], 'the last page is allowed');
  assert.match(parseRanges('2-9', 5).error, /Page 9 is past the last page \(5\)/);
  assert.match(parseRanges('1-3, 3', 5).error, /Page 3 is listed twice/);
  assert.match(parseRanges('1.5', 5).error, /not a page/);
});

test('names end in .pdf once, and parts say which part they are', () => {
  assert.equal(withPdf('Lease'), 'Lease.pdf');
  assert.equal(withPdf('Lease.PDF'), 'Lease.pdf');
  assert.equal(withPdf('  '), 'Documents.pdf');
  assert.equal(partName('Lease.pdf', 2, 3), 'Lease (part 2 of 3).pdf');
});

/* ------------------------------------------------------------ the limits */

const fakeFile = (bytes, { name = 'x.pdf', size = bytes.length } = {}) => ({
  name, size,
  slice: (a, b) => ({ arrayBuffer: async () => bytes.slice(a, b).buffer }),
  arrayBuffer: async () => { throw new Error('read whole'); },
});

test('a PDF 1 byte over 50 MB is refused before any of it is read; exactly 50 MB is taken', async () => {
  let touched = 0;
  const big = { name: 'Big.pdf', size: 50e6 + 1, slice: () => { touched++; return { arrayBuffer: async () => new ArrayBuffer(0) }; }, arrayBuffer: async () => { touched++; return new ArrayBuffer(0); } };
  const r = await checkAdd(big, { files: 0, bytes: 0 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Big\.pdf is 50 MB; a PDF is read up to 50 MB/);
  assert.equal(touched, 0, 'nothing was read');
  assert.equal((await checkAdd(fakeFile(plainPdf('A', 1), { size: 50e6 }), { files: 0, bytes: 0 })).ok, true);
});

test('the 21st file, an empty file, a total over the device cap and a file that is not a PDF are each refused in words', async () => {
  const pdf = plainPdf('A', 1);
  assert.match((await checkAdd(fakeFile(pdf), { files: MAX_FILES, bytes: 0 })).reason, /20 files is the most/);
  assert.match((await checkAdd(fakeFile(new Uint8Array(0)), { files: 0, bytes: 0 })).reason, /is empty/);
  assert.match((await checkAdd(fakeFile(pdf, { size: 20e6 }), { files: 3, bytes: 41e6 }, { phone: true })).reason, /60 MB is the most/);
  assert.equal((await checkAdd(fakeFile(pdf, { size: 20e6 }), { files: 3, bytes: 41e6 }, { phone: false })).ok, true, 'the same files fit on a desktop');
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
  assert.match((await checkAdd(fakeFile(png, { name: 'Lease.pdf' }), { files: 0, bytes: 0 })).reason, /Lease\.pdf is not a PDF, whatever its name says/);
  assert.equal(MAX_BYTES.phone, 60e6);
});

test('page 501 is over the limit and page 500 is not', () => {
  assert.equal(overPages(499, 1), false);
  assert.equal(overPages(500, 1), true);
  assert.equal(MAX_PAGES, 500);
});

test('every way a PDF can fail has its own words', () => {
  assert.match(problemText('A.pdf', 'encrypted'), /password protected\. Ask for an unlocked copy/);
  assert.match(problemText('A.pdf', 'invalid'), /may be damaged or only partly downloaded/);
  assert.match(problemText('A.pdf', 'other', 'boom'), /could not be opened \(boom\)/);
});

/* ------------------------------------------------------------ the worker */

// the worker file, run as a worker runs it: its own global scope, importScripts reading the vendored library
function startWorker() {
  const lib = fs.readFileSync(new URL('../vendor/pdf-lib-cantoo-2.11.1.min.js', import.meta.url), 'utf8');
  const posted = [];
  const ctx = vm.createContext({ console, TextEncoder, TextDecoder, setTimeout, clearTimeout, crypto: globalThis.crypto });
  ctx.self = ctx;
  ctx.importScripts = () => vm.runInContext(lib, ctx);
  ctx.postMessage = (m) => posted.push(m);
  vm.runInContext(fs.readFileSync(new URL('../app/pdfpages-worker.js', import.meta.url), 'utf8'), ctx);
  const ask = async (data) => { posted.length = 0; await ctx.onmessage({ data }); return posted.at(-1); };
  return { ask, posted };
}
const blob = (bytes) => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });

/** Each page's label and turn, read back with pdf.js as the app reads PDFs. */
async function readBack(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    out.push({ text: (await pg.getTextContent()).items.map((x) => x.str).join(''), rotate: pg.rotate });
  }
  return out;
}
const raw = (bytes) => Buffer.from(bytes).toString('latin1');

test('merge: a 3-page and a 2-page file, reordered and turned, read back in the order and the turns asked for', async () => {
  const w = startWorker();
  const a = plainPdf('A', 3); const b = plainPdf('B', 2);
  // A1 A2 A3 B1 B2 -> A1 A3 A2 B1 B2 -> A1 A3 B1 A2 B2, then B1 turned a quarter
  const list = rotate(move(move([...A, ...B], 1, 1), 2, 1), 2);
  assert.equal(labels(list), 'A1 A3 B1 A2 B2');
  const want = orderFor(list);
  const r = await w.ask({ id: 1, type: 'build', files: [blob(a), blob(b)], outputs: [want] });
  assert.equal(r.ok, true, JSON.stringify(r));
  const pages = await readBack(r.files[0]);
  assert.deepEqual(pages.map((p) => p.text), ['A1', 'A3', 'B1', 'A2', 'B2']);
  assert.deepEqual(pages.map((p) => p.rotate), [0, 0, 90, 0, 0]);
  assert.ok(w.posted.some((m) => m.progress === 5 && m.of === 5), 'progress reached 5 of 5');
});

test('a turn is added to the turn the page already has, and a turn on the page tree is kept', async () => {
  const w = startWorker();
  const r = await w.ask({ id: 2, type: 'build', files: [blob(plainPdf('S', 2, { rotate: 270 })), blob(plainPdf('I', 1, { inherit: true }))], outputs: [[{ f: 0, p: 0, rot: 180 }, { f: 0, p: 1, rot: 0 }, { f: 1, p: 0, rot: 0 }]] });
  const pages = await readBack(r.files[0]);
  assert.deepEqual(pages.map((p) => [p.text, p.rotate]), [['S1', 90], ['S2', 0], ['I1', 90]]);
});

test('split: one file per range, each with only its pages', async () => {
  const w = startWorker();
  const { groups } = parseRanges('1-2, 4', 4);
  const list = pagesOf(0, [0, 0, 0, 0]);
  const r = await w.ask({ id: 3, type: 'build', files: [blob(plainPdf('P', 4))], outputs: groups.map((g) => orderFor(list, g)) });
  assert.equal(r.files.length, 2);
  assert.deepEqual((await readBack(r.files[0])).map((p) => p.text), ['P1', 'P2']);
  assert.deepEqual((await readBack(r.files[1])).map((p) => p.text), ['P4']);
});

test('inspect: the page count and the turn each page already has', async () => {
  const w = startWorker();
  const r = await w.ask({ id: 4, type: 'inspect', file: blob(plainPdf('Z', 3, { rotate: 90 })) });
  assert.equal(r.ok, true);
  assert.equal(r.pages, 3);
  assert.deepEqual(Array.from(r.rotations), [90, 0, 0]);
});

test('cleaning: a page action, a script link, a launch link, an attachment and the document\'s script and embedded file are all gone', async () => {
  const w = startWorker();
  const src = raw(hostilePdf());
  for (const k of ['/AA', 'JavaScript', 'Launch', 'FileAttachment', 'EmbeddedFile', 'OpenAction', 'calc.exe']) assert.ok(src.includes(k), `the invented file has ${k}`);
  const r = await w.ask({ id: 5, type: 'build', files: [blob(hostilePdf())], outputs: [[{ f: 0, p: 0, rot: 0 }, { f: 0, p: 1, rot: 0 }]] });
  assert.equal(r.ok, true, JSON.stringify(r));
  const out = raw(r.files[0]);
  for (const k of ['/AA', 'JavaScript', 'Launch', 'FileAttachment', 'EmbeddedFile', 'OpenAction', 'calc.exe', 'app.alert', 'attached text', 'EmbeddedFiles']) assert.ok(!out.includes(k), `the output has no ${k}`);
  assert.deepEqual((await readBack(r.files[0])).map((p) => p.text), ['H1', 'H2'], 'and the pages are still there');
});

test('a password-protected file, a file cut short and a page tree that lost pages each fail with their own kind, and nothing is written', async () => {
  const w = startWorker();
  const enc = await w.ask({ id: 6, type: 'build', files: [blob(plainPdf('A', 1)), blob(encryptedPdf())], outputs: [[{ f: 0, p: 0, rot: 0 }, { f: 1, p: 0, rot: 0 }]] });
  assert.deepEqual([enc.ok, enc.kind, enc.file], [false, 'encrypted', 1]);
  assert.equal(enc.files, undefined);
  const cut = await w.ask({ id: 7, type: 'inspect', file: blob(damagedPdf()) });
  assert.deepEqual([cut.ok, cut.kind], [false, 'invalid']);
  const lost = await w.ask({ id: 8, type: 'inspect', file: blob(plainPdf('M', 2, { declared: 3 })) });
  assert.deepEqual([lost.ok, lost.kind], [false, 'invalid']);
  const junk = await w.ask({ id: 9, type: 'inspect', file: blob(new TextEncoder().encode('%PDF-1.4\nnot really')) });
  assert.equal(junk.ok, false);
});

/* ------------------------------------------------- what review found */

const leaks = (out) => ['JavaScript', '/JS', 'Launch', 'calc.exe', 'app.alert'].filter((k) => raw(out).includes(k));

test('extracting page 1 of a contents page leaves the other page out of the file: its text, its widget and its scripts', async () => {
  const w = startWorker();
  const src = raw(tocPdf());
  assert.ok(src.includes('SECRET2') && src.includes('JavaScript') && src.includes('Launch'));
  const r = await w.ask({ id: 20, type: 'build', files: [blob(tocPdf())], outputs: [[{ f: 0, p: 0, rot: 0 }]] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(!raw(r.files[0]).includes('SECRET2'), 'the unpicked page\'s text is not in the bytes');
  assert.deepEqual(leaks(r.files[0]), [], 'and neither is the widget\'s script or launch action');
  assert.deepEqual((await readBack(r.files[0])).map((p) => p.text), ['TOC']);
  const both = await w.ask({ id: 21, type: 'build', files: [blob(tocPdf())], outputs: [[{ f: 0, p: 0, rot: 0 }, { f: 0, p: 1, rot: 0 }]] });
  assert.deepEqual(leaks(both.files[0]), [], 'picking both pages still drops the script and launch action');
});

test('a link action chained nine, ten or twelve steps deep to a script is still cut; running out of depth counts as unsafe', async () => {
  const w = startWorker();
  for (const n of [9, 10, 12]) {
    assert.ok(raw(chainPdf(n)).includes('JavaScript'));
    const r = await w.ask({ id: 30 + n, type: 'build', files: [blob(chainPdf(n))], outputs: [[{ f: 0, p: 0, rot: 0 }]] });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(leaks(r.files[0]), [], `a ${n}-step chain`);
  }
});

test('a file cut between objects, or closed up with a page\'s content missing, is refused rather than copied as a blank page', async () => {
  const w = startWorker();
  const cut = await w.ask({ id: 40, type: 'inspect', file: blob(cutBeforeContentPdf()) });
  assert.deepEqual([cut.ok, cut.kind], [false, 'invalid']);
  const lost = await w.ask({ id: 41, type: 'inspect', file: blob(lostContentPdf()) });
  assert.deepEqual([lost.ok, lost.kind], [false, 'invalid']);
  const noEnd = plainPdf('E', 1);
  const trimmed = noEnd.slice(0, new TextDecoder().decode(noEnd).lastIndexOf('%%EOF'));
  assert.deepEqual([(await w.ask({ id: 42, type: 'inspect', file: blob(trimmed) })).kind], ['invalid'], 'no end marker');
});

test('a real password-protected PDF, made by the library, is called password protected and not damaged', async () => {
  const w = startWorker();
  const mk = vm.createContext({ console, TextEncoder, TextDecoder, setTimeout, clearTimeout, crypto: globalThis.crypto });
  vm.runInContext(fs.readFileSync(new URL('../vendor/pdf-lib-cantoo-2.11.1.min.js', import.meta.url), 'utf8'), mk);
  mk.out = null;
  const bytes = await vm.runInContext(`(async () => { const d = await PDFLib.PDFDocument.create(); d.addPage(); d.encrypt({ userPassword: 'u', ownerPassword: 'o' }); return await d.save(); })()`, mk);
  const r = await w.ask({ id: 50, type: 'inspect', file: blob(new Uint8Array(bytes)) });
  assert.deepEqual([r.ok, r.kind], [false, 'encrypted']);
  const b = await w.ask({ id: 51, type: 'build', files: [blob(plainPdf('A', 1)), blob(new Uint8Array(bytes))], outputs: [[{ f: 0, p: 0, rot: 0 }, { f: 1, p: 0, rot: 0 }]] });
  assert.deepEqual([b.ok, b.kind, b.file], [false, 'encrypted', 1]);
});

test('if a picked page still leads to one that was not picked, by a route nothing cuts, nothing is written', async () => {
  const w = startWorker();
  const r = await w.ask({ id: 60, type: 'build', files: [blob(strayPdf())], outputs: [[{ f: 0, p: 0, rot: 0 }]] });
  assert.equal(r.ok, false);
  assert.equal(r.files, undefined);
  assert.match(r.message, /not picked/);
});

/* ------------------------------------------------- second review */

const one = [{ f: 0, p: 0, rot: 0 }];
const extractOne = async (w, bytes, id, order = one) => { const r = await w.ask({ id, type: 'build', files: [blob(bytes)], outputs: [order] }); assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const FONT = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
const frame = (kids, count) => ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${kids}] /Count ${count} >>`, FONT];

test('pictures only another page uses stay out, whether the pages share resources by inheritance, by one dictionary or through a form', async () => {
  const w = startWorker();
  for (const [i, mode] of ['inherit', 'shared', 'form'].entries()) {
    assert.ok(raw(sharedImagesPdf(mode)).includes('SCANPAGETWO'));
    const r = await extractOne(w, sharedImagesPdf(mode), 70 + i);
    const out = raw(r.files[0]);
    assert.ok(out.includes('SCANPAGEONE'), `${mode}: the picked page keeps its picture`);
    assert.ok(!out.includes('SCANPAGETWO'), `${mode}: the other page's picture is not in the file`);
    const both = await extractOne(w, sharedImagesPdf(mode), 80 + i, [...one, { f: 0, p: 1, rot: 0 }]);
    if (mode !== 'form') assert.ok(raw(both.files[0]).includes('SCANPAGETWO'), `${mode}: picking both keeps both pictures`);
  }
});

test('content that cannot be decoded keeps its resources whole, and the worker says so', async () => {
  const w = startWorker();
  const pdf = buildPdf([...frame('4 0 R', 1), pageObj(5).replace('/Resources << /Font << /F1 3 0 R >> >>', '/Resources << /XObject << /Im1 6 0 R /Im2 7 0 R >> >>'),
    streamObj('<< /Filter /FooDecode >>', 'q /Im1 Do Q'), streamObj('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 >>', 'KEEPONE'), streamObj('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 >>', 'KEEPTWO')]);
  const r = await extractOne(w, pdf, 90);
  assert.equal(r.unpruned, true);
  assert.ok(raw(r.files[0]).includes('KEEPONE') && raw(r.files[0]).includes('KEEPTWO'));
  const clean = await extractOne(w, sharedImagesPdf('shared'), 91);
  assert.equal(clean.unpruned, false);
});

const link = (a, extra = '') => `<< /Type /Annot /Subtype /Link /Rect [0 0 9 9] ${a} ${extra} >>`;
const twoPages = (p1, objs, p2 = '') => buildPdf([...frame('4 0 R 5 0 R', 2), pageObj(6, p1), pageObj(7, p2), textStream('PAGEONE'), textStream('SECRETPAGETWO'), ...objs]);

test('a kept link keeps only a web address or reader command: reset, hide, go-to and the rest are cut with whatever they lead to', async () => {
  const w = startWorker();
  const cases = [
    ['reset form', twoPages('/Annots [8 0 R]', [link('/A << /S /ResetForm /Fields [9 0 R] >>'), '<< /FT /Tx /T (f) /V (SECRETFIELDVALUE) /AA << /K << /S /JavaScript /JS (FIELDJS) >> >> /Kids [10 0 R] >>', '<< /Type /Annot /Subtype /Widget /Parent 9 0 R /Rect [0 0 9 9] >>']), ['SECRETFIELDVALUE', 'FIELDJS']],
    ['hide', twoPages('/Annots [8 0 R]', [link('/A << /S /Hide /T 9 0 R >>'), '<< /Type /Annot /Subtype /FreeText /Rect [0 0 9 9] /Contents (SECRETNOTEP2) >>']), ['SECRETNOTEP2']],
    ['widget kids', twoPages('/Annots [8 0 R]', ['<< /Type /Annot /Subtype /Widget /FT /Btn /Rect [0 0 9 9] /Kids [9 0 R] >>', '<< /Type /Annot /Subtype /Widget /Rect [0 0 9 9] /AA << /U << /S /JavaScript /JS (KIDSJS) >> >> >>']), ['KIDSJS']],
    ['partial action', twoPages('/Annots [8 0 R]', [link('/PA << /S /GoTo /D [5 0 R /Fit] >>')]), ['SECRETPAGETWO']],
    ['articles', twoPages('/B [9 0 R]', ['<< /Type /Thread /F 9 0 R >>', '<< /Type /Bead /T 8 0 R /N 10 0 R /V 10 0 R /P 4 0 R /R [0 0 9 9] >>', '<< /Type /Bead /T 8 0 R /N 9 0 R /V 9 0 R /P 5 0 R /R [0 0 9 9] >>'], '/B [10 0 R]'), ['SECRETPAGETWO']],
    ['page attachment', twoPages('/AF [8 0 R]', ['<< /Type /Filespec /F (a.xml) /EF << /F 9 0 R >> >>', streamObj('<< /Type /EmbeddedFile >>', 'EMBEDDEDSECRET')]), ['EMBEDDEDSECRET']],
    ['annotation attachment', twoPages('/Annots [9 0 R]', ['<< /Type /Filespec /F (a.xml) /EF << /F 10 0 R >> >>', '<< /Type /Annot /Subtype /Square /Rect [0 0 9 9] /AF [8 0 R] >>', streamObj('<< /Type /EmbeddedFile >>', 'EMBEDDEDSECRET')]), ['EMBEDDEDSECRET']],
    ['link file spec', twoPages('/Annots [9 0 R]', ['<< /Type /Filespec /F (a.xml) /EF << /F 10 0 R >> >>', link('', '/FS 8 0 R'), streamObj('<< /Type /EmbeddedFile >>', 'EMBEDDEDSECRET')]), ['EMBEDDEDSECRET']],
  ];
  for (const [name, pdf, marks] of cases) {
    assert.ok(marks.every((m) => raw(pdf).includes(m)), `${name}: the fixture has the marker`);
    const r = await extractOne(w, pdf, 100);
    for (const m of marks) assert.ok(!raw(r.files[0]).includes(m), `${name}: ${m} is not in the file`);
    assert.ok(!raw(r.files[0]).includes('SECRETPAGETWO'), `${name}: nor is the other page`);
  }
  const web = await extractOne(w, twoPages('/Annots [8 0 R]', [link('/A << /S /URI /URI (https://example.test/x) /Next << /S /Named /N /NextPage >> >>')]), 101);
  assert.ok(/\/URI\s*\(https:\/\/example\.test\/x\)/.test(raw(web.files[0])), 'a web link is kept');
});

test('an action chain with fan-out is followed once per action, and one too long to follow is treated as unsafe', async () => {
  const w = startWorker();
  const fan = [link('/A 9 0 R')];
  for (let i = 0; i < 12; i++) fan.push(`<< /S /Named /N /NextPage /Next [${Array(8).fill(`${10 + i} 0 R`).join(' ')}] >>`);
  fan.push('<< /S /Named /N /PrevPage >>');
  const t0 = Date.now();
  const r = await extractOne(w, twoPages('/Annots [8 0 R]', fan), 110);
  assert.ok(Date.now() - t0 < 5000, 'finished');
  assert.ok(raw(r.files[0]).includes('NextPage'), 'a harmless fan-out is kept');
  const long = [link('/A 9 0 R')];
  for (let i = 0; i < 2600; i++) long.push(`<< /S /Named /N /NextPage /Next ${10 + i} 0 R >>`);
  long.push('<< /S /Named /N /PrevPage >>');
  const r2 = await extractOne(w, twoPages('/Annots [8 0 R]', long), 111);
  assert.ok(!raw(r2.files[0]).includes('NextPage'), 'a chain of 2,600 actions is cut');
});

test('a content list held by reference is refused when one of its streams is missing', async () => {
  const w = startWorker();
  const pdf = buildPdf([...frame('4 0 R', 1), pageObj(5), '[6 0 R 99 0 R]', textStream('ONE')]);
  const r = await w.ask({ id: 120, type: 'inspect', file: blob(pdf) });
  assert.deepEqual([r.ok, r.kind], [false, 'invalid']);
});

/* ------------------------------------------------- third review */

// two pages that share ONE resources dictionary (object 20); `extras` fill objects 8 and up; page 2 draws SECRETIMGTWO (object 10)
const imgObj = (t) => streamObj('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 >>', t);
function sharedRes(res, c1, extras, p1x = '') {
  const objs = [...frame('4 0 R 5 0 R', 2), pageObj(6, `/Resources 20 0 R ${p1x}`).replace('/Resources << /Font << /F1 3 0 R >> >>', ''), pageObj(7).replace('/Resources << /Font << /F1 3 0 R >> >>', '/Resources 20 0 R'), streamObj('<< >>', c1), streamObj('<< >>', '/Im3 Do')];
  const all = [...objs, ...extras];
  while (all.length < 19) all.push('null');
  all.push(res);
  return buildPdf(all);
}
const NOFORM = '<< /Type /XObject /Subtype /Form /BBox [0 0 9 9] >>';
const pickedOnly = async (w, pdf, id) => { const r = await extractOne(w, pdf, id); return { out: raw(r.files[0]), r }; };
const keptOrFlagged = ({ out, r }, why) => { assert.ok(out.includes('KEEPIMG'), `${why}: the picked page keeps the picture it draws`); assert.ok(!out.includes('SECRETIMGTWO') || r.unpruned === true, `${why}: the other page's picture is absent, or the file is flagged`); };
const imgs = () => [imgObj('KEEPIMG'), imgObj('SECRETIMGTWO')];

test('a form, a Type 3 font or a tiling pattern with no resources of its own draws with the page\'s: the page keeps its picture', async () => {
  const w = startWorker();
  const nores = sharedRes('<< /XObject << /Fm1 8 0 R /Im2 9 0 R /Im3 10 0 R >> >>', '/Fm1 Do', [streamObj(NOFORM, '/Im2 Do'), ...imgs()]);
  const type3 = sharedRes('<< /Font << /F1 8 0 R >> /XObject << /Im2 9 0 R /Im3 10 0 R >> >>', 'BT /F1 12 Tf (a) Tj ET',
    ['<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1 1] /FontMatrix [1 0 0 1 0 0] /CharProcs << /a 11 0 R >> /Encoding << /Type /Encoding /Differences [97 /a] >> /FirstChar 97 /LastChar 97 /Widths [1] >>', ...imgs(), streamObj('<< >>', '1 0 d0 /Im2 Do')]);
  const pat = sharedRes('<< /Pattern << /P1 8 0 R >> /XObject << /Im2 9 0 R /Im3 10 0 R >> >>', '/Pattern cs /P1 scn 0 0 100 100 re f',
    [streamObj('<< /Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 10 10] /XStep 10 /YStep 10 >>', '/Im2 Do'), ...imgs()]);
  for (const [i, [why, pdf]] of [['form', nores], ['type3', type3], ['pattern', pat]].entries()) keptOrFlagged(await pickedOnly(w, pdf, 130 + i), why);
});

test('resources reached through a pattern, a soft mask or an annotation\'s look are cut by their own content, or the file is flagged', async () => {
  const w = startWorker();
  const patRes = sharedRes('<< /Pattern << /P1 8 0 R >> /XObject << /Im2 9 0 R /Im3 10 0 R >> >>', '/Pattern cs /P1 scn 0 0 100 100 re f',
    [streamObj('<< /Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 10 10] /XStep 10 /YStep 10 /Resources 20 0 R >>', '/Im2 Do'), ...imgs()]);
  const mask = sharedRes('<< /ExtGState << /GS1 8 0 R >> /XObject << /Im2 9 0 R /Im3 10 0 R >> >>', '/GS1 gs /Im2 Do',
    ['<< /Type /ExtGState /SMask << /Type /Mask /S /Alpha /G 11 0 R >> >>', ...imgs(), streamObj('<< /Type /XObject /Subtype /Form /BBox [0 0 9 9] /Resources 20 0 R >>', '/Im2 Do')]);
  const look = sharedRes('<< /XObject << /Im2 9 0 R /Im3 10 0 R >> >>', '/Im2 Do',
    ['<< /Type /Annot /Subtype /Stamp /Rect [0 0 9 9] /AP << /N 11 0 R >> >>', ...imgs(), streamObj('<< /Type /XObject /Subtype /Form /BBox [0 0 9 9] /Resources 20 0 R >>', '/Im2 Do')], '/Annots [8 0 R]');
  const lookNone = sharedRes('<< /XObject << /Im2 9 0 R /Im3 10 0 R >> >>', '/Fm1 Do',
    ['<< /Type /Annot /Subtype /Stamp /Rect [0 0 9 9] /AP << /N 11 0 R >> >>', ...imgs(), streamObj(NOFORM, '/Im2 Do')], '/Annots [8 0 R]');
  for (const [i, [why, pdf]] of [['pattern with the shared dictionary', patRes], ['soft mask', mask], ['annotation look', look], ['annotation look with no resources', lookNone]].entries()) keptOrFlagged(await pickedOnly(w, pdf, 140 + i), why);
  const cut = await pickedOnly(w, look, 150);
  assert.ok(!cut.out.includes('SECRETIMGTWO') && cut.r.unpruned === false, 'an annotation look with resources of its own is simply cut');
});

test('a resource name holding a vertical tab is one name: only PDF white space ends a name', async () => {
  const w = startWorker();
  const pdf = sharedRes('<< /XObject << /Im#0B2 9 0 R /Im3 10 0 R >> >>', '/Im\x0b2 Do', ['null', ...imgs()]);
  const { out, r } = await pickedOnly(w, pdf, 160);
  assert.ok(out.includes('KEEPIMG') && !out.includes('SECRETIMGTWO'));
  assert.equal(r.unpruned, false);
});

test('a link whose /Next array holds 200,000 entries is judged, not crashed on', async () => {
  const w = startWorker();
  const pdf = twoPages('/Annots [8 0 R]', [link('/A 9 0 R'), `<< /S /Named /N /NextPage /Next [${'10 0 R '.repeat(200000)}] >>`, '<< /S /Named /N /PrevPage >>']);
  const r = await w.ask({ id: 170, type: 'build', files: [blob(pdf)], outputs: [one] });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
  assert.ok(raw(r.files[0]).includes('NextPage'), 'the harmless chain is followed to its end and the link kept');
});
