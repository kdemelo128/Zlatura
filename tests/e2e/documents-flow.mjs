/* Tools > Documents > PDF pages, in a browser on invented PDFs: merge, reorder, turn, delete, extract and split on the
 * device; the saved file read back page by page; hostile and broken files refused in words; hostile names cleaned;
 * every text field typed key by key; keyboard use and the spoken announcements; 44 px targets; axe at phone and
 * desktop size; Cancel; and the whole thing offline, library and worker included. */
/* global caches */
import fs from 'fs';
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
import { plainPdf, hostilePdf, damagedPdf, encryptedPdf, undecodablePdf } from '../tools/docpdfs.mjs';

const F = new URL('./files/', import.meta.url).pathname;
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const pdfjs = await import('../../vendor/pdf-4.7.76-legacy.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
const { unzipSync } = await import('fflate');

/** Each page's label and turn, read back with pdf.js. */
async function readBack(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    out.push([(await pg.getTextContent()).items.map((x) => x.str).join(''), pg.rotate]);
  }
  return out;
}
const buf = (name, b) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(b) });
const FILE_A = buf('Estoppel A.pdf', plainPdf('A', 3));
const FILE_B = buf('Survey B.pdf', plainPdf('B', 2));

const { browser, ctx, page, errors } = await phone();
const go = async (v) => { await page.evaluate((x) => { location.hash = x; }, `#${v}`); await page.waitForTimeout(300); };
const status = () => page.locator('#docs-status').innerText();
const problems = () => page.locator('#docs-problems').innerText();
const rows = () => page.locator('#docs-list li').count();
const order = async () => (await page.$$eval('#docs-list .docs-ptext span', (s) => s.map((x) => x.textContent))).map((t) => t.replace(/^.* (\w)\.pdf, page (\d+).*$/, '$1$2'));
const downloaded = async (click) => { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), click()]); return { name: dl.suggestedFilename(), bytes: fs.readFileSync(await dl.path()) }; };
const axe = async (p, scope) => { if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ path: AXE }); return p.evaluate(async (sc) => (await window.axe.run(document.querySelector(sc), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), scope); };
/** Type text key by key into a field, checking after every key that the value is what was typed and the field is still focused. */
async function typeChars(sel, text) {
  await page.locator(sel).click();
  await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
  const bad = [];
  let prefix = '';
  for (const ch of text) {
    await page.keyboard.type(ch);
    prefix += ch;
    const st = await page.evaluate((s) => { const e = document.querySelector(s); return { v: e.value, f: document.activeElement === e }; }, sel);
    if (st.v !== prefix || !st.f) bad.push(`after “${prefix}”: ${JSON.stringify(st)}`);
  }
  return bad;
}

// count the times a worker is stopped, to prove Cancel really stops it
await page.addInitScript(() => { window.__stopped = 0; const t = Worker.prototype.terminate; Worker.prototype.terminate = function () { window.__stopped++; return t.call(this); }; });
await page.goto(`${BASE}#tools`, { waitUntil: 'load' });
await page.waitForSelector('#tools-root button.tool');

/* ------------------------------------------------ where it is, and opening it */
check('a Documents group is on the Tools screen with a PDF pages card', await page.locator('#tools-root h2.tool-group', { hasText: 'Documents' }).count() === 1 && await page.locator('#tools-root button.tool[data-tool="pdf-pages"]').count() === 1);
await page.fill('#tool-search', 'merge');
check('searching “merge” finds it', await page.locator('#tools-root button.tool').count() === 1);
await page.fill('#tool-search', '');
await page.click('button.tool[data-tool="pdf-pages"]');
await page.waitForSelector('#docs-file', { state: 'attached' });
await page.waitForFunction(() => /Add one or more PDFs/.test(document.getElementById('docs-status').textContent));
check('before any file: the buttons are off and the sheet says to begin', await page.locator('#docs-save').isDisabled() && /Add one or more PDFs/.test(await status()));
check('the loss of bookmarks, scripts and signatures is said before anything is saved', /Bookmarks, attachments, scripts and form fields are not kept.*web links are kept, hidden layers are not carried over and may show, and a digital signature/.test(await page.locator('#sheet-body').innerText()));

/* ------------------------------------------------------------- add and order */
await page.setInputFiles('#docs-file', [FILE_A, FILE_B]);
await page.waitForFunction(() => document.querySelectorAll('#docs-list li').length === 5, null, { timeout: 15000 });
await page.waitForFunction(() => /5 pages from 2 files/.test(document.getElementById('docs-status').textContent));
check('two files add five pages', await rows() === 5 && /5 pages from 2 files/.test(await status()), await status());
check('the pages are listed A1 A2 A3 B1 B2', (await order()).join(' ') === 'A1 A2 A3 B1 B2', (await order()).join('|'));
await page.waitForFunction(() => document.querySelectorAll('#docs-list canvas').length >= 1, null, { timeout: 15000 }).catch(() => {});
check('pages show a picture', await page.locator('#docs-list canvas').count() >= 1);
check('the page boxes carry spoken labels', (await page.locator('#docs-list li').first().locator('[role=img]').getAttribute('aria-label')) === 'Page 1 of 5, from Estoppel A.pdf');
check('no sideways scroll at phone width', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
const small = await page.evaluate(() => [...document.querySelectorAll('#sheet-body button, #sheet-body label.btn, #sheet-body input:not([type=file])')].filter((e) => e.getBoundingClientRect().width).map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height, e.getAttribute('aria-label') || e.textContent || e.id]; }).filter(([w, h]) => w < 44 || h < 44));
check('every button and field in the sheet is at least 44 px', small.length === 0, JSON.stringify(small.slice(0, 4)));
const ax1 = await axe(page, '#sheet');
check('axe finds nothing on the sheet at phone size', ax1.length === 0, ax1.join(' ; '));
await page.screenshot({ path: new URL('./shots/documents-phone.png', import.meta.url).pathname });

// keyboard: the “Move down” of page 2, by Tab-free focus and Enter
await page.locator('button[data-act="down"][data-i="1"]').focus();
await page.keyboard.press('Enter');
await page.waitForFunction(() => /Page 2 moved down to place 3 of 5/.test(document.getElementById('docs-status').textContent));
check('moving a page down by keyboard is announced', /Page 2 moved down to place 3 of 5/.test(await status()), await status());
check('and focus stays on that page’s Move down button', await page.evaluate(() => document.activeElement.dataset.act === 'down' && document.activeElement.dataset.i === '2'));
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
check('the order is now A1 A3 B1 A2 B2', (await order()).join(' ') === 'A1 A3 B1 A2 B2', (await order()).join('|'));
check('the first page has no Move up and the last no Move down', await page.locator('button[data-act="up"][data-i="0"]').isDisabled() && await page.locator('button[data-act="down"][data-i="4"]').isDisabled());
await page.locator('button[data-act="turn"][data-i="2"]').click();
await page.waitForFunction(() => /Page 3 turned a quarter clockwise/.test(document.getElementById('docs-status').textContent));
check('turning a page is announced and shown', /Page 3 turned a quarter clockwise/.test(await status()) && /turned 90°/.test(await page.locator('#docs-list li').nth(2).innerText()), await status());

/* ----------------------------------------------------------------- merge + name */
const hostileName = 'Q3 "Offering" ../packet';
const bad = await typeChars('#docs-name', hostileName);
check('the file name field takes every typed key without losing one', bad.length === 0, bad.slice(0, 2).join(' | '));
const merged = await downloaded(() => page.click('#docs-save'));
check('the saved name has no slash, quote or colon, and ends .pdf', merged.name === 'Q3 -Offering- ..-packet.pdf', merged.name);
const m = await readBack(merged.bytes);
check('the merged file reads back A1 A3 B1 A2 B2', m.map((x) => x[0]).join(' ') === 'A1 A3 B1 A2 B2', JSON.stringify(m));
check('and page 3 is turned 90 degrees, the rest upright', m.map((x) => x[1]).join(',') === '0,0,90,0,0', m.map((x) => x[1]).join(','));

/* ------------------------------------------------------- ranges: extract, split */
const badR = await typeChars('#docs-range', '1-3, 7');
check('the page range field takes every typed key without losing one', badR.length === 0, badR.slice(0, 2).join(' | '));
await page.click('#docs-extract');
check('a range past the last page is refused in words, and the field is flagged', /Page 7 is past the last page \(5\)/.test(await problems()) && (await page.locator('#docs-range').getAttribute('aria-invalid')) === 'true', await problems());
await typeChars('#docs-range', '2, 4–5');
const ex = await downloaded(() => page.click('#docs-extract'));
check('Extract saves exactly those places (2 and 4-5, with an en dash typed)', (await readBack(ex.bytes)).map((x) => x[0]).join(' ') === 'A3 A2 B2', JSON.stringify(await readBack(ex.bytes)));
await typeChars('#docs-range', '1-2, 5');
const sp = await downloaded(() => page.click('#docs-split'));
const z = unzipSync(new Uint8Array(sp.bytes));
const parts = Object.keys(z).sort();
check('Split saves one zip with a PDF for each range', sp.name.endsWith('.zip') && parts.length === 2 && parts[0].includes('part 1 of 2') && parts[1].includes('part 2 of 2'), `${sp.name} ${parts}`);
check('the parts hold A1 A3 and B2', (await readBack(z[parts[0]])).map((x) => x[0]).join(' ') === 'A1 A3' && (await readBack(z[parts[1]])).map((x) => x[0]).join(' ') === 'B2');

/* ------------------------------------------------------------- delete, remove */
await page.locator('button[data-act="del"][data-i="0"]').click();
await page.waitForFunction(() => /Page 1 deleted/.test(document.getElementById('docs-status').textContent));
check('deleting a page leaves four and says so', await rows() === 4 && /Page 1 deleted\. 4 pages left/.test(await status()), await status());
await page.locator('#sheet-body button', { hasText: 'Remove' }).nth(1).click();
check('removing a file takes its pages out', await rows() === 2, `${await rows()}`);

/* ----------------------------------------------------- refusals in words, nothing added */
const before = await rows();
await page.setInputFiles('#docs-file', [buf('Cut short.pdf', damagedPdf()), buf('Locked.pdf', encryptedPdf())]);
await page.waitForFunction(() => /password protected/.test(document.getElementById('docs-problems').textContent));
const p1 = await problems();
check('a cut-short file is called damaged, by name', /Cut short\.pdf is not a readable PDF: it may be damaged or only partly downloaded/.test(p1), p1);
check('a password-protected file is refused, by name, with no password asked', /Locked\.pdf is password protected\. Ask for an unlocked copy/.test(p1) && await page.locator('input[type=password]').count() === 0, p1);
check('neither added a page', await rows() === before);
const realEnc = F + 'om-encrypted.pdf';
if (fs.existsSync(realEnc)) {
  await page.setInputFiles('#docs-file', realEnc);
  await page.waitForFunction(() => /om-encrypted\.pdf is password protected/.test(document.getElementById('docs-problems').textContent));
  check('a real password-protected PDF is refused the same way', await rows() === before);
}
await page.setInputFiles('#docs-file', { name: 'Lease.pdf', mimeType: 'application/pdf', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]) });
await page.waitForFunction(() => /not a PDF, whatever its name says/.test(document.getElementById('docs-problems').textContent));
check('a picture named .pdf is refused by what it is', /Lease\.pdf is not a PDF, whatever its name says/.test(await problems()));

/* ---------------------------------------------------- hostile content is cut out */
await page.setInputFiles('#docs-file', buf('Notice <img src=x onerror=alert(1)>.pdf', hostilePdf()));
await page.waitForFunction(() => document.querySelectorAll('#docs-list li').length === 4);
check('a file name with markup in it is shown as text, not run', await page.locator('#sheet-body img').count() === 0 && /<img src=x/.test(await page.locator('.docs-fname').last().innerText()));
const hostile = await downloaded(() => page.click('#docs-save'));
const raw = hostile.bytes.toString('latin1');
const leftovers = ['/AA', 'JavaScript', 'Launch', 'FileAttachment', 'EmbeddedFile', 'OpenAction', 'calc.exe', 'app.alert', 'attached text'].filter((k) => raw.includes(k));
check('the saved file carries no script, launch link, attachment or open action', leftovers.length === 0, leftovers.join(','));
check('and still has its pages (two kept from this set, two from the hostile file)', (await readBack(hostile.bytes)).length === 4, JSON.stringify(await readBack(hostile.bytes)));

/* ------------------------------------------------------------------- cancel */
await page.setInputFiles('#docs-file', buf('Long.pdf', plainPdf('L', 400)));
await page.waitForFunction(() => document.querySelectorAll('#docs-list li').length === 404, null, { timeout: 20000 });
let saved = false;
page.on('download', () => { saved = true; });
const stopsBefore = await page.evaluate(() => window.__stopped);
await page.evaluate(() => { document.getElementById('docs-save').click(); document.getElementById('docs-cancel').click(); });
await page.waitForFunction(() => /Cancelled\. Nothing was saved/.test(document.getElementById('docs-status').textContent), null, { timeout: 5000 });
await page.waitForTimeout(800);
check('Cancel stops the write at once and nothing is saved', !saved && await page.locator('#docs-save').isEnabled(), `saved=${saved}`);
check('and the worker itself is stopped, not left running', (await page.evaluate(() => window.__stopped)) === stopsBefore + 1);

/* ------------------------------------------------------------- phone: 404 pages stay quick */
const t0 = await page.evaluate(() => { const t = performance.now(); document.querySelector('button[data-act="turn"][data-i="0"]').click(); return performance.now() - t; });
check('turning a page with 404 listed answers within the 150 ms budget', t0 < 150, `${Math.round(t0)} ms`);

await page.click('#sheet-close');

/* ---------------------------------------------------- desktop size: axe, layout */
const desk = await phone({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1, userAgent: undefined });
await desk.page.goto(`${BASE}#tools`, { waitUntil: 'load' });
await desk.page.click('button.tool[data-tool="pdf-pages"]');
await desk.page.setInputFiles('#docs-file', [FILE_A, FILE_B]);
await desk.page.waitForFunction(() => document.querySelectorAll('#docs-list li').length === 5, null, { timeout: 15000 });
await desk.page.waitForTimeout(500);
const ax2 = await axe(desk.page, '#sheet');
check('axe finds nothing on the sheet at desktop size', ax2.length === 0, ax2.join(' ; '));
check('no sideways scroll at desktop width', await desk.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
// a page whose content cannot be read to cut its resources is saved whole, and the screen says so
await desk.page.setInputFiles('#docs-file', buf('Odd.pdf', undecodablePdf()));
await desk.page.waitForFunction(() => document.querySelectorAll('#docs-list li').length === 6, null, { timeout: 15000 });
await desk.page.locator('#docs-list li').nth(0).locator('button[data-act="del"]').click();
const odd = await Promise.all([desk.page.waitForEvent('download', { timeout: 30000 }), desk.page.click('#docs-save')]);
await desk.page.waitForFunction(() => /copied unchanged, which can include pictures from other pages/.test(document.getElementById('docs-problems').textContent));
check('a file whose content could not be read is saved, with the honest note about copied resources', !!odd[0] && /check the result before sharing/.test(await desk.page.locator('#docs-problems').innerText()));
await desk.browser.close();

/* -------------------------------------------------------- offline: library and worker */
await page.evaluate(() => { location.hash = '#home'; });
await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || false, null, { timeout: 15000 }).catch(() => {});
if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload({ waitUntil: 'load' });
const cached = await page.evaluate(async () => { for (const k of await caches.keys()) { const c = await caches.open(k); for (const u of ['vendor/pdf-lib-cantoo-2.11.1.min.js', 'app/pdfpages-worker.js', 'app/pdfpagesui.js']) if (!(await c.match(u))) return u; } return 'ok'; });
check('the service worker has cached the library, the worker and the screen', cached === 'ok', cached);
await ctx.setOffline(true);
await page.reload({ waitUntil: 'load' });
await go('tools');
await page.click('button.tool[data-tool="pdf-pages"]');
await page.setInputFiles('#docs-file', [FILE_A, FILE_B]);
await page.waitForFunction(() => document.querySelectorAll('#docs-list li').length === 5, null, { timeout: 15000 });
const off = await downloaded(() => page.click('#docs-save'));
check('offline, with no connection at all, the merge still works', (await readBack(off.bytes)).map((x) => x[0]).join(' ') === 'A1 A2 A3 B1 B2');
await ctx.setOffline(false);

const errs = errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e));
check('no console errors or failed requests', errs.length === 0, errs.slice(0, 3).join(' | '));
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errs);
await browser.close();
