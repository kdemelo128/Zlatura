/* Documents' New look presentation. Invented PDF/text only; the existing workers and converters do the work. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
import { plainPdf } from '../tools/docpdfs.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const pdfjs = await import('../../vendor/pdf-4.7.76-legacy.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
const R = []; const check = (name, yes, detail = '') => R.push([yes ? 'PASS' : 'FAIL', name, detail]);
const sizes = [
  ['compact-phone', { viewport: { width: 320, height: 740 } }],
  ['phone', { viewport: { width: 390, height: 844 } }],
  ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1, userAgent: undefined }],
];
const file = (name, bytes, mimeType = 'application/pdf') => ({ name, mimeType, buffer: Buffer.from(bytes) });
const A = file('Invented <img src=x onerror=alert(1)> A.pdf', plainPdf('Alpha', 2));
const B = file('Invented B.pdf', plainPdf('Beta', 1));
const TEXT = file('Invented notes.txt', 'Fictional site memo\nNothing confidential is in this test.', 'text/plain');
async function readBack(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  try {
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      pages.push({ text: (await pg.getTextContent()).items.map((v) => v.str).join(''), rotate: pg.rotate });
    }
    return pages;
  } finally { await doc.destroy(); }
}
const controls = (page) => page.$$eval('#sheet-body button, #sheet-body input:not([type=file]), #sheet-body select, #sheet-close', (nodes) => nodes.filter((n) => n.getBoundingClientRect().width > 0).map((n) => n.id || n.getAttribute('aria-label') || n.textContent.trim()).sort());
const close = async (page) => { await page.locator('#sheet-close').click(); await page.waitForFunction(() => !document.getElementById('sheet').open); };
const open = async (page, tool, input) => { await page.locator(`#tools-root button[data-tool="${tool}"]`).click(); await page.locator(input).waitFor({ state: 'attached' }); };
const look = (page, value) => page.evaluate(async (v) => { (await import(new URL('app/look.js', location.href).href)).setLook(v); }, value);
async function save(page, selector) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
  return { name: download.suggestedFilename(), bytes: fs.readFileSync(await download.path()) };
}
async function typeChars(page, selector, text) {
  const input = page.locator(selector); await input.fill(''); await input.focus();
  const bad = []; let prefix = '';
  for (const ch of text) { await page.keyboard.type(ch); prefix += ch; if (await input.inputValue() !== prefix || !await input.evaluate((e) => e === document.activeElement && e.isConnected)) bad.push(prefix); }
  return bad;
}
async function audit(page, label) {
  await page.evaluate(() => document.fonts.ready);
  if (!await page.evaluate(() => !!window.axe)) await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async () => (await window.axe.run(document.getElementById('sheet'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`));
  check(`${label}: axe finds no violations`, violations.length === 0, violations.join('; '));
  const bounds = await page.evaluate(() => { const b = document.getElementById('sheet-body'); return { page: document.documentElement.scrollWidth - innerWidth, sheet: b.scrollWidth - b.clientWidth }; });
  check(`${label}: the sheet and page fit horizontally`, bounds.page <= 0 && bounds.sheet <= 0, JSON.stringify(bounds));
  const small = await page.$$eval('#sheet button, #sheet input:not([type=file]), #sheet select, #sheet summary', (nodes) => nodes.filter((n) => n.getBoundingClientRect().width > 0).flatMap((n) => { const r = n.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5 ? [`${n.id || n.textContent.trim()}: ${r.width.toFixed(1)}×${r.height.toFixed(1)}`] : []; }));
  check(`${label}: every control has a 44 px target`, small.length === 0, small.join('; '));
}
for (const [size, opts] of sizes) {
  const { browser, ctx, page, errors } = await phone(opts); const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  try {
    await page.goto(BASE + '#tools', { waitUntil: 'load' });
    await page.locator('#tools-root button[data-tool="pdf-pages"]').waitFor();
    await look(page, 'classic'); await open(page, 'pdf-pages', '#docs-file');
    const classicPdf = await controls(page);
    check(`${size}: Classic PDF controls do not show New look phase headings`, await page.locator('#sheet-body .doc-phase:visible').count() === 0);
    await close(page); await open(page, 'doc-convert', '#conv-file'); const classicConvert = await controls(page); await close(page);
    await look(page, 'new'); await open(page, 'pdf-pages', '#docs-file');
    const present = await page.locator('#sheet-body .doc-phase:visible').count() === 3;
    check(`${size}: PDF pages has three visible workflow headings in the New look`, present);
    if (!present) continue; // the archived app fails for the missing feature without timing out
    check(`${size}: all Classic PDF controls remain available`, JSON.stringify(await controls(page)) === JSON.stringify(classicPdf));
    const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#sheet-body .docs-add').click()]);
    check(`${size}: Add PDFs opens the native existing picker`, await picker.element().getAttribute('id') === 'docs-file');
    await picker.setFiles([]);
    check(`${size}: cancelling the picker leaves an empty preview`, await page.locator('#docs-list li').count() === 0 && await page.locator('#docs-save').isDisabled());
    await page.setInputFiles('#docs-file', [A, B]);
    await page.waitForFunction(() => document.querySelectorAll('#docs-list li').length === 3 && !document.getElementById('docs-save').disabled);
    check(`${size}: added PDF names remain plain text`, (await page.locator('.docs-files').textContent()).includes(A.name) && await page.locator('.docs-files img').count() === 0);
    await page.locator('#docs-list [data-act="up"]').nth(2).click();
    await page.locator('#docs-list [data-act="turn"]').first().click();
    check(`${size}: move and turn describe the actual page order`, /Invented B\.pdf, page 1/.test(await page.locator('#docs-list .docs-ptext span').nth(1).textContent()) && /turned 90/.test(await page.locator('#docs-list .docs-ptext span').first().textContent()));
    check(`${size}: the name field keeps each character and focus`, (await typeChars(page, '#docs-name', 'Invented merged pages')).length === 0);
    check(`${size}: the range field keeps each character and focus`, (await typeChars(page, '#docs-range', '1-2, 3')).length === 0);
    const merged = await save(page, '#docs-save'); const pages = await readBack(merged.bytes);
    check(`${size}: the saved PDF has the independent expected order and rotation`, JSON.stringify(pages) === JSON.stringify([{ text: 'Alpha1', rotate: 90 }, { text: 'Beta1', rotate: 0 }, { text: 'Alpha2', rotate: 0 }]), JSON.stringify(pages));
    await page.evaluate(async () => (await import(new URL('app/look.js', location.href).href)).setTextSize(130));
    for (const theme of ['light', 'dark']) { await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' }); await audit(page, `${size}, ${theme}, 130% PDF pages`); }
    if (size !== 'compact-phone') await page.screenshot({ path: SHOTS + `documents-look-${size}.png` });
    await page.locator('#docs-name').focus(); await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('sheet').open);
    check(`${size}: Escape closes PDF pages and returns focus to its tool`, await page.locator('#tools-root [data-tool="pdf-pages"]').evaluate((n) => n === document.activeElement));
    await open(page, 'doc-convert', '#conv-file');
    check(`${size}: Convert has two New look headings and all Classic controls`, await page.locator('#sheet-body .doc-phase:visible').count() === 2 && JSON.stringify(await controls(page)) === JSON.stringify(classicConvert));
    await page.setInputFiles('#conv-file', TEXT);
    await page.locator('#conv-to-txt-pdf').waitFor();
    const converted = await save(page, '#conv-to-txt-pdf'); const textPages = await readBack(converted.bytes);
    check(`${size}: text conversion still writes the original text through the existing converter`, converted.name.endsWith('.pdf') && textPages.length === 1 && textPages[0].text.includes('Fictional site memo'));
    for (const theme of ['light', 'dark']) { await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' }); await audit(page, `${size}, ${theme}, 130% Convert`); }
    await page.goBack(); await page.waitForFunction(() => !document.getElementById('sheet').open);
    check(`${size}: Back closes Convert and preserves the Tools screen`, await page.locator('#view-tools').isVisible());
    await page.locator('#tools-root [data-tool="value"]').click();
    check(`${size}: document presentation does not leak into a calculator`, await page.locator('#sheet-body .doc-phase, #sheet-body .doc-file-entry').count() === 0);
    await close(page);
    if (size === 'phone') {
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
      await ctx.setOffline(true); await page.reload({ waitUntil: 'load' });
      await page.locator('#tools-root [data-tool="pdf-pages"]').waitFor();
      await open(page, 'pdf-pages', '#docs-file'); await page.setInputFiles('#docs-file', file('Offline invented.pdf', plainPdf('Offline', 1)));
      await page.waitForFunction(() => document.querySelectorAll('#docs-list li').length === 1);
      check('phone: the New look PDF workflow works after an offline reload', await page.locator('#sheet-body .doc-phase:visible').count() === 3 && !await page.locator('#docs-save').isDisabled());
      await close(page); await open(page, 'doc-convert', '#conv-file'); await page.setInputFiles('#conv-file', TEXT); await page.locator('#conv-to-txt-pdf').waitFor();
      check('phone: the New look Convert workflow opens offline', await page.locator('#sheet-body .doc-phase:visible').count() === 2);
      await ctx.setOffline(false);
    }
    const outside = requests.filter((u) => /^https?:/.test(u) && new URL(u).origin !== new URL(BASE).origin);
    check(`${size}: document use sends no request outside the app`, outside.length === 0, outside.join('\n'));
    check(`${size}: no browser errors or failed requests`, errors.length === 0, errors.join('\n'));
  } catch (e) { check(`${size}: workflow completes`, false, e.message); }
  finally { await browser.close(); }
}
for (const r of R) console.log(r.join(' | '));
finish(R);
