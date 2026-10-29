/* Tools > Documents > Convert, in a browser on invented files: each conversion run and its result read back, every
 * pair that is not possible said plainly with its reason, hostile files (wrong name, locked, cut short, too big, old
 * Office, odd formats) refused by name, a file name with markup shown as text, keyboard use and the announcements,
 * 44 px targets, axe at phone and desktop size, Cancel, and the whole thing offline. The card has no typed fields
 * (the only input is the file picker), so there is nothing to type key by key. */
/* global caches */
import fs from 'fs';
import { createRequire } from 'module';
import ExcelJS from 'exceljs';
import { phone, BASE, finish } from './lib.mjs';
import { plainPdf, damagedPdf, encryptedPdf, tinyPng, docxFile, oleDoc, otherZip } from '../tools/docpdfs.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const pdfjs = await import('../../vendor/pdf-4.7.76-legacy.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
const { unzipSync } = await import('fflate');

const f = (name, b, mimeType = 'application/octet-stream') => ({ name, mimeType, buffer: Buffer.from(b) });
const pdfText = async (bytes) => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(''));
  return out;
};
const sheetOf = async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rent roll');
  ws.addRow(['Unit', 'Rent', 'Start', 'Zip']);
  ws.addRow(['A1', 1200, new Date(Date.UTC(2026, 0, 31)), '07030']);
  ws.addRow(['A2', null, null, null]);
  ws.addRow(['A3', { formula: 'B2*2', result: 2400 }, '=hello', null]);
  wb.addWorksheet('Hidden').state = 'hidden';
  return Buffer.from(await wb.xlsx.writeBuffer());
};

const { browser, ctx, page, errors } = await phone();
const go = async (v) => { await page.evaluate((x) => { location.hash = x; }, `#${v}`); await page.waitForTimeout(300); };
const status = () => page.locator('#conv-status').innerText();
const problems = () => page.locator('#conv-problems').innerText();
const axe = async (p, scope) => { if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ path: AXE }); return p.evaluate(async (sc) => (await window.axe.run(document.querySelector(sc), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), scope); };
const downloads = []; page.on('download', (d) => downloads.push(d));
const pick = async (...files) => { await page.setInputFiles('#conv-file', files); await page.waitForFunction(() => document.getElementById('conv-file-line').textContent !== '' , null, { timeout: 15000 }); await page.waitForTimeout(80); };
const targets = () => page.$$eval('#conv-can button', (b) => b.map((x) => x.textContent));
const saved = async (click) => { const n = downloads.length; click(); await page.waitForFunction(() => true); const t0 = Date.now(); while (downloads.length === n && Date.now() - t0 < 30000) await page.waitForTimeout(50); if (downloads.length === n) return null; const dl = downloads[n]; return { name: dl.suggestedFilename(), bytes: fs.readFileSync(await dl.path()) }; };
const convert = (to, selector = null) => saved(() => page.click(selector || `#conv-to-${to}`));
const refusedWith = async (name, bytes, re, what) => { await pick(f(name, bytes)); const p = await problems(); check(what, re.test(p) && await page.locator('#conv-can button').count() === 0 && downloads.length === dls, p); };
let dls = 0;


// a JPEG and a WebP the browser itself draws
await page.goto(`${BASE}#tools`, { waitUntil: 'load' });
await page.waitForSelector('#tools-root button.tool');
const made = await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 48;
  const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 64, 48); g.fillStyle = '#36c'; g.fillRect(0, 0, 32, 24);
  const b64 = async (type) => { const blob = await new Promise((r) => c.toBlob(r, type, 0.9)); return blob && blob.type === type ? btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer()))) : null; };
  return { jpeg: await b64('image/jpeg'), webp: await b64('image/webp') };
});
const JPEG = Buffer.from(made.jpeg, 'base64');

/* ------------------------------------------------ where it is, and opening it */
check('a Convert card is in the Documents group next to PDF pages', await page.locator('#tools-root h2.tool-group', { hasText: 'Documents' }).count() === 1 && await page.locator('#tools-root button.tool[data-tool="doc-convert"]').count() === 1 && await page.locator('#tools-root button.tool[data-tool="pdf-pages"]').count() === 1);
await page.fill('#tool-search', 'convert');
check('searching “convert” finds it', await page.locator('#tools-root button.tool[data-tool="doc-convert"]').count() === 1);
await page.fill('#tool-search', '');
await page.click('button.tool[data-tool="doc-convert"]');
await page.waitForSelector('#conv-file', { state: 'attached' });
await page.waitForFunction(() => /Choose a file to see/.test(document.getElementById('conv-status').textContent));
check('before any file nothing can be converted and the sheet says to choose one', await page.locator('#conv-can button').count() === 0 && /Choose a file/.test(await status()));
await page.click('#conv-all summary');
const rowsN = await page.locator('#conv-all tbody tr').count();
check('the whole matrix is listed, with what is kept in each row, and what is never offered', rowsN === 15 && /Word, PowerPoint or Excel to PDF/.test(await page.locator('#conv-all').innerText()) && /Password-protected files/.test(await page.locator('#conv-all').innerText()), `${rowsN}`);
await page.click('#conv-all summary');

/* ---------------------------------------------------------------- pictures */
await pick(f('Site photo.png', tinyPng(40, 30), 'image/png'));
check('a PNG offers PDF and JPEG and says what it can’t become, with reasons', (await targets()).join('|') === 'To PDF|To JPEG' && /To text: reading words from a picture is not offered/.test(await page.locator('#conv-no').innerText()), (await targets()).join('|'));
check('what is kept is said before the tap', /lossless, the picture’s own bytes/.test(await page.locator('#conv-d-img-pdf').innerText()) && (await page.locator('#conv-to-img-pdf').getAttribute('aria-describedby')) === 'conv-d-img-pdf');
check('focus goes to the first conversion and the count is announced', await page.evaluate(() => document.activeElement.id === 'conv-to-img-pdf') && /2 conversions are available/.test(await status()), await status());
let d = await convert('img-pdf'); dls = downloads.length;
check('PNG to PDF: one page, named after the file', d && d.name === 'Site photo.pdf' && (await pdfText(d.bytes)).length === 1, d && d.name);
d = await convert('png-jpeg');
check('PNG to JPEG: a real JPEG', d && d.name === 'Site photo.jpg' && d.bytes[0] === 0xff && d.bytes[1] === 0xd8, d && d.name);
await page.waitForFunction(() => /Your file is ready/.test(document.getElementById('conv-status').textContent));
check('the finished save is announced', /Your file is ready/.test(await status()));

await pick(f('Roof.jpeg', JPEG, 'image/jpeg'));
d = await convert('img-pdf');
check('JPEG to PDF: lossless, the JPEG’s own bytes are inside the PDF unchanged', d && d.bytes.includes(JPEG) && (await pdfText(d.bytes)).length === 1);
d = await convert('jpeg-png');
check('JPEG to PNG: a real PNG', d && d.name === 'Roof.png' && d.bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])));

if (made.webp) {
  await pick(f('Map.webp', Buffer.from(made.webp, 'base64'), 'image/webp'));
  check('WebP offers PDF, PNG and JPEG', (await targets()).join('|') === 'To PDF|To PNG|To JPEG', (await targets()).join('|'));
  d = await convert('webp-png');
  check('WebP to PNG: a real PNG', d && d.bytes.subarray(1, 4).toString() === 'PNG');
  d = await convert('img-pdf');
  check('WebP to PDF works', d && (await pdfText(d.bytes)).length === 1);
} else check('WebP is not written by this browser, so its rows are not tried here', true, 'skipped');

await pick(f('IMG_0001.HEIC', Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(64)])));
check('HEIC offers JPEG only and says why not PDF or PNG', (await targets()).join('|') === 'To JPEG' && /To PDF or PNG: a HEIC photo becomes a JPEG only/.test(await page.locator('#conv-no').innerText()));
dls = downloads.length;
await page.click('#conv-to-heic-jpeg');
await page.waitForFunction(() => /could not be opened by this browser/.test(document.getElementById('conv-problems').textContent), null, { timeout: 10000 });
check('HEIC on a browser that can’t open it is refused by name, with the next step', /^IMG_0001\.HEIC could not be opened by this browser\. Only Safari opens HEIC photos/.test(await problems()) && downloads.length === dls, await problems());

/* ------------------------------------------------------------------- PDF */
await pick(f('Report.pdf', plainPdf('A', 3), 'application/pdf'));
check('a PDF offers text, PNG pictures and JPEG pictures', (await targets()).join('|') === 'To text|To PNG pictures|To JPEG pictures', (await targets()).join('|'));
check('and says Word and Excel are not possible, with the reason', /To Word or Excel: a PDF holds pages, not a document’s structure/.test(await page.locator('#conv-no').innerText()));
d = await convert('pdf-txt');
const txt = d.bytes.toString('utf8');
check('PDF to text: every page, in order, headed by its number', d.name === 'Report.txt' && /Page 1\s+A1[\s\S]*Page 2\s+A2[\s\S]*Page 3\s+A3/.test(txt), txt.slice(0, 80));
d = await convert('pdf-png');
let z = unzipSync(new Uint8Array(d.bytes)); let names = Object.keys(z).sort();
check('PDF to PNG pictures: a zip with a PNG for each page, in order', d.name === 'Report.zip' && names.join('|') === 'Report page 1.png|Report page 2.png|Report page 3.png' && names.every((n) => Buffer.from(z[n]).subarray(1, 4).toString() === 'PNG'), `${d.name} ${names}`);
d = await convert('pdf-jpeg');
z = unzipSync(new Uint8Array(d.bytes));
check('PDF to JPEG pictures: three real JPEGs', Object.values(z).length === 3 && Object.values(z).every((b) => b[0] === 0xff && b[1] === 0xd8));
await pick(f('One.pdf', plainPdf('S', 1), 'application/pdf'));
d = await convert('pdf-png');
check('a one-page PDF gives one PNG, not a zip', d.name === 'One.png');

await pick(f('Locked.pdf', encryptedPdf(), 'application/pdf'));
dls = downloads.length;
await page.click('#conv-to-pdf-txt');
await page.waitForFunction(() => /password protected/.test(document.getElementById('conv-problems').textContent), null, { timeout: 15000 });
check('a password-protected PDF is refused by name, with no password asked', /^Locked\.pdf is password protected\. Ask for an unlocked copy\./.test(await problems()) && await page.locator('input[type=password]').count() === 0 && downloads.length === dls, await problems());
await pick(f('Cut short.pdf', damagedPdf(), 'application/pdf'));
await page.click('#conv-to-pdf-png');
await page.waitForFunction(() => /not a readable PDF/.test(document.getElementById('conv-problems').textContent), null, { timeout: 15000 });
check('a cut-short PDF is called damaged, by name, and nothing is saved', /^Cut short\.pdf is not a readable PDF: it may be damaged/.test(await problems()) && downloads.length === dls, await problems());
await pick(f('Book.pdf', plainPdf('P', 60), 'application/pdf'));
await page.click('#conv-to-pdf-png');
await page.waitForFunction(() => /can become pictures at once/.test(document.getElementById('conv-problems').textContent), null, { timeout: 15000 });
check('a 60-page PDF is not turned into 60 pictures: refused with the way round it', /^Book\.pdf has 60 pages; at most (20|50) can become pictures at once on this device\. Use PDF pages/.test(await problems()) && downloads.length === dls, await problems());

/* --------------------------------------------------------------- tables */
await pick(f('Rent roll.xlsx', await sheetOf()));
check('a workbook offers CSV only and says PDF is not possible, with the reason', (await targets()).join('|') === 'To CSV' && /To PDF: the layout, fonts and page breaks of a workbook can’t be kept/.test(await page.locator('#conv-no').innerText()));
d = await convert('xlsx-csv');
check('Excel to CSV: a blank stays blank, a date is a date, a formula gives its saved result', d.name === 'Rent roll.csv' && d.bytes.toString('utf8') === '﻿Unit,Rent,Start,Zip\r\nA1,1200,2026-01-31,07030\r\nA2,,,\r\nA3,2400,\'=hello,\r\n', JSON.stringify(d.bytes.toString('utf8')));
const note = await status(); const noteProb = await problems();
check('and the notes say so: formulas, the guarded text and the skipped hidden sheet', /1 formula gave the result Excel last calculated/.test(note + noteProb) && /Hidden sheet not converted: Hidden/.test(note + noteProb) && /leading '/.test(note + noteProb), note);

await pick(f('Units.csv', 'Unit,Rent,Zip,Note\n1,1200.50,00501,\n2,"1,300",07030,"a, b"\n'));
check('a CSV offers Excel, JSON and PDF', (await targets()).join('|') === 'To Excel workbook|To JSON|To PDF', (await targets()).join('|'));
d = await convert('csv-xlsx');
const wb = new ExcelJS.Workbook(); await wb.xlsx.load(d.bytes);
const ws = wb.worksheets[0];
check('CSV to Excel: plain numbers are numbers, 00501 and “1,300” stay text, a blank stays blank', typeof ws.getCell('A2').value === 'number' && ws.getCell('B2').value === 1200.5 && ws.getCell('C2').value === '00501' && ws.getCell('B3').value === '1,300' && ws.getCell('D2').value === null && ws.getCell('D3').value === 'a, b', JSON.stringify([ws.getCell('B2').value, ws.getCell('C2').value, ws.getCell('B3').value, ws.getCell('D2').value]));
d = await convert('csv-json');
check('CSV to JSON: a list of records, every value text', JSON.stringify(JSON.parse(d.bytes.toString())) === JSON.stringify([{ Unit: '1', Rent: '1200.50', Zip: '00501', Note: '' }, { Unit: '2', Rent: '1,300', Zip: '07030', Note: 'a, b' }]), d.bytes.toString().slice(0, 60));
await pick(f('Records.json', '[{"a":1,"b":null},{"a":2,"b":"x"}]'));
d = await convert('json-csv');
check('JSON to CSV: columns from the records, null blank', d.bytes.toString('utf8') === '﻿a,b\r\n1,\r\n2,x\r\n', JSON.stringify(d.bytes.toString('utf8')));
await pick(f('Nested.json', '[{"a":{"b":1}}]'));
dls = downloads.length;
await page.click('#conv-to-json-csv');
await page.waitForFunction(() => /inside the record/.test(document.getElementById('conv-problems').textContent));
check('JSON with a record inside a record is refused, not flattened', /^Item 1, “a” of Nested\.json holds a list or a record inside the record/.test(await problems()) && downloads.length === dls);

/* ----------------------------------------------------------- text and Word */
await pick(f('Notes.txt', 'Hello, café – “quoted” € 5\nSecond line'));
check('a text file offers PDF', (await targets()).join('|') === 'To PDF');
d = await convert('txt-pdf');
check('text to PDF: the words read back from the PDF', d.name === 'Notes.pdf' && (await pdfText(d.bytes))[0].includes('Hello, café – “quoted” € 5') && (await pdfText(d.bytes))[0].includes('Second line'));
await pick(f('Emoji.txt', 'Hello 😀 world'));
dls = downloads.length;
await page.click('#conv-to-txt-pdf');
await page.waitForFunction(() => /can’t draw/.test(document.getElementById('conv-problems').textContent));
check('a character a standard font can’t draw is refused and named, and nothing is saved', /^Emoji\.txt has 1 kind of character a standard PDF font can’t draw: “😀” \(U\+1F600\)\. Nothing was converted/.test(await problems()) && downloads.length === dls, await problems());
await pick(f('Memo.docx', docxFile(['First paragraph.', 'Second & last.'])));
check('a Word file offers text, and says PDF is not possible and why', (await targets()).join('|') === 'To text' && /To PDF: the layout of a Word document can’t be kept/.test(await page.locator('#conv-no').innerText()));
d = await convert('docx-txt');
check('Word to text: body text once, table cells tabbed, no header, no deleted text', d.bytes.toString() === 'First paragraph.\nSecond & last.\nCell A\tCell B\nBoxed note\nKept', JSON.stringify(d.bytes.toString()));

/* ------------------------------------------------------ hostile and unsupported */
dls = downloads.length;
await pick(f('Photo.jpg', plainPdf('W', 1)));
check('a PDF named .jpg is treated as the PDF it is, and the name mismatch is said', (await targets()).join('|') === 'To text|To PNG pictures|To JPEG pictures' && /“Photo\.jpg” is really a PDF, whatever its name says/.test(await page.locator('#conv-note').innerText()));
await refusedWith('Lease.pages', otherZip(), /^Lease\.pages is an Apple Pages file\. Zlatura can’t convert it on this device\. In Pages, choose Export → PDF, then add the PDF here\./, 'a Pages file is refused by name with the export step');
await refusedWith('Deck.pptx', otherZip(), /^Deck\.pptx is a PowerPoint file/, 'a PowerPoint file is refused, not faked into a PDF');
await refusedWith('Old.doc', oleDoc(), /^Old\.doc is an old Word \(\.doc\) file/, 'an old .doc is refused with the way to a .docx');
await refusedWith('Scan.tif', Buffer.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 0, 0]), /^Scan\.tif is a TIFF image/, 'a TIFF is refused by name');
await refusedWith('Mystery.bin', Buffer.from([1, 2, 0, 3]), /^Mystery\.bin is not a file type Zlatura can convert/, 'an unknown binary is refused by name');
const bombDocx = (await import('fflate')).zipSync({ 'word/document.xml': new Uint8Array(3e6) }, { level: 9 });
await refusedWith('Bomb.docx', bombDocx, /^Bomb\.docx: That file packs a part far tighter/, 'a decompression bomb posing as a Word file is refused, not opened');
await refusedWith('Huge.pdf', Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(51e6)]), /^Huge\.pdf is 51 MB; a PDF is read up to 50 MB/, 'a 51 MB PDF is refused by its size');
await refusedWith('Empty.pdf', Buffer.alloc(0), /^Empty\.pdf is empty/, 'an empty file is refused by name');

const markup = 'Notice <img src=x onerror="window.__ran=1">.pdf';
await pick(f(markup, plainPdf('M', 1), 'application/pdf'));
check('a file name with markup in it is shown as text, not run', await page.locator('#sheet-body img').count() === 0 && (await page.locator('#conv-file-line').innerText()).includes('<img src=x') && !(await page.evaluate(() => window.__ran)));
d = await convert('pdf-txt');
check('and the saved name is made safe', d && !/[<>"]/.test(d.name) && d.name.endsWith('.txt'), d && d.name);

/* ------------------------------------------------------- phone: look and keyboard */
await pick(f('Report.pdf', plainPdf('A', 3), 'application/pdf'));
check('no sideways scroll at phone width', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
const small = await page.evaluate(() => [...document.querySelectorAll('#sheet-body button, #sheet-body summary')].filter((e) => e.getBoundingClientRect().width).map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height, e.textContent]; }).filter(([w, h]) => w < 44 || h < 44));
check('every button in the sheet is at least 44 px', small.length === 0, JSON.stringify(small.slice(0, 4)));
const ax1 = await axe(page, '#sheet');
check('axe finds nothing on the sheet at phone size', ax1.length === 0, ax1.join(' ; '));
await page.click('#conv-all summary');
const ax1b = await axe(page, '#sheet');
check('and none with the whole matrix open', ax1b.length === 0, ax1b.join(' ; '));
await page.click('#conv-all summary');
await page.screenshot({ path: new URL('./shots/convert-phone.png', import.meta.url).pathname });
await page.locator('#conv-to-pdf-txt').focus();
const n0 = downloads.length;
await page.keyboard.press('Enter');
const t0 = Date.now(); while (downloads.length === n0 && Date.now() - t0 < 15000) await page.waitForTimeout(50);
await page.waitForFunction(() => /Your file is ready/.test(document.getElementById('conv-status').textContent), null, { timeout: 5000 }).catch(() => {});
check('a conversion runs from the keyboard (Enter) and is announced', downloads.length === n0 + 1 && /Your file is ready/.test(await status()), await status());
check('and focus returns to the button that was used', await page.evaluate(() => document.activeElement.id === 'conv-to-pdf-txt'));

/* ------------------------------------------------------------------- cancel */
await pick(f('Long.pdf', plainPdf('L', 450), 'application/pdf'));
const n1 = downloads.length;
await page.evaluate(() => { document.getElementById('conv-to-pdf-txt').click(); document.getElementById('conv-cancel').click(); });
await page.waitForFunction(() => /Cancelled\. Nothing was saved/.test(document.getElementById('conv-status').textContent), null, { timeout: 8000 });
await page.waitForTimeout(800);
check('Cancel stops the run and nothing is saved', downloads.length === n1 && await page.locator('#conv-to-pdf-txt').isEnabled());
await page.click('#sheet-close');

/* ---------------------------------------------------- desktop size: axe, layout */
const desk = await phone({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1, userAgent: undefined });
await desk.page.goto(`${BASE}#tools`, { waitUntil: 'load' });
await desk.page.click('button.tool[data-tool="doc-convert"]');
await desk.page.setInputFiles('#conv-file', f('Report.pdf', plainPdf('A', 3), 'application/pdf'));
await desk.page.waitForFunction(() => document.querySelectorAll('#conv-can button').length === 3);
await desk.page.click('#conv-all summary');
const ax2 = await axe(desk.page, '#sheet');
check('axe finds nothing on the sheet at desktop size', ax2.length === 0, ax2.join(' ; '));
check('no sideways scroll at desktop width', await desk.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
await desk.browser.close();

/* -------------------------------------------------------- offline */
await page.evaluate(() => { location.hash = '#home'; });
await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || false, null, { timeout: 15000 }).catch(() => {});
if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload({ waitUntil: 'load' });
const cached = await page.evaluate(async () => { for (const k of await caches.keys()) { const c = await caches.open(k); for (const u of ['app/convert.js', 'app/convertui.js', 'app/convert-worker.js', 'vendor/pdf-lib-cantoo-2.11.1.min.js']) if (!(await c.match(u))) return u; } return 'ok'; });
check('the service worker has cached the screen, the logic, the worker and the library', cached === 'ok', cached);
await ctx.setOffline(true);
await page.reload({ waitUntil: 'load' });
await go('tools');
await page.click('button.tool[data-tool="doc-convert"]');
await pick(f('Offline.png', tinyPng(10, 10), 'image/png'));
d = await convert('img-pdf');
check('offline, with no connection at all, PNG to PDF still works', d && (await pdfText(d.bytes)).length === 1);
await ctx.setOffline(false);

const errs = errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e));
check('no console errors or failed requests (but the deliberate refusals)', errs.filter((e) => !/Failed to load resource|createImageBitmap|InvalidState/.test(e)).length === 0, errs.slice(0, 3).join(' | '));
for (const [s, n, x] of R) console.log(s, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', errs);
await browser.close();
