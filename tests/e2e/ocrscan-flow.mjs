/* A PDF with no text layer is read by OCR on this device by itself, when it is dropped on "Start from documents" (Underwrite):
 * a progress line with Cancel appears, takes no focus and does not freeze the page; the OCR files come from this site only; the
 * rent roll scan is then typed by the normal reader and marked "Read by OCR: check figures" with the pages that were read; a
 * Cancel keeps what was read and says so; nothing is on a deal. Invented, degraded scans (tests/e2e/make_scans.py).
 *
 *   node ocrscan-flow.mjs        # BASE=http://localhost:8080/ by default */
import { phone, BASE, SHOTS, finish } from './lib.mjs';

const { browser, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(30000);
const requests = []; page.on('request', (r) => requests.push(r.url()));
const F = new URL('./files/', import.meta.url).pathname;
const deals = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('deals').objectStore('deals').getAll(); g.onsuccess = () => res(g.result.length); }; }));

await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
await page.click('#uw-view-quick');
await page.waitForSelector('#uw-intake');
const before = await deals();
// the page must stay alive while the reader works: the longest gap between two animation frames
await page.evaluate(() => { window.__gap = 0; let last = performance.now(); const tick = (t) => { window.__gap = Math.max(window.__gap, t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });

/* ---- a 300 dpi scan of a rent roll */
await page.setInputFiles('#uwi-files', [F + 'scan-rr-300.pdf']);
await page.waitForSelector('.ocr-progress');
const bar = await page.locator('.ocr-progress').innerText();
check('a progress line with a Cancel button shows while it reads', /Reading a scanned PDF by OCR/.test(bar) && (await page.locator('.ocr-progress button', { hasText: 'Cancel' }).count()) === 1, bar);
check('it is a status line that takes no focus and is not a dialog', (await page.locator('.ocr-progress[role="status"]').count()) === 1 && (await page.locator('dialog[open], [role="dialog"]:visible').count()) === 0 && await page.evaluate(() => !document.querySelector('.ocr-progress').contains(document.activeElement)));
// typing goes on while it reads
await page.evaluate(() => { const i = document.createElement('input'); i.id = 'typing-probe'; document.body.prepend(i); });
await page.locator('#typing-probe').click();
await page.keyboard.type('12345', { delay: 20 });
check('typing is not blocked while it reads', (await page.inputValue('#typing-probe')) === '12345' && (await page.locator('.ocr-progress').count()) === 1);
await page.waitForSelector('.uwi-item[data-id]', { timeout: 150000 });
check('the progress line is gone when it is done', (await page.locator('.ocr-progress').count()) === 0);
const item = page.locator('.uwi-item', { hasText: 'scan-rr-300.pdf' }).first();
const t = (await item.textContent()).replace(/\s+/g, ' ');
check('read as a rent roll by the normal reader, with the OCR mark', /Rent roll/i.test(t) && (await item.locator('[data-ocr-mark]').count()) === 1 && /check figures/.test(await item.locator('[data-ocr-mark]').innerText()), t.slice(0, 300));
check('it says it was read by OCR, which pages, and to check every figure', /Read by OCR on this device \(all \d+ pages?\): check every figure against the page/.test(t), t.slice(0, 400));
check('a Use button is offered (the document’s own import still asks and previews)', (await item.locator('[data-use]').count()) === 1);
check('the OCR files came from this site only', requests.filter((u) => /vendor\/ocr\//.test(u)).length >= 3 && requests.filter((u) => /vendor\/ocr\//.test(u)).every((u) => u.startsWith(BASE)));
check('no request went to another site', requests.every((u) => u.startsWith(BASE) || /^(data|blob):/.test(u)));
check('nothing is on a deal', (await deals()) === before);
const gap = await page.evaluate(() => window.__gap);
check('the page kept painting while it read (longest frame gap under 1.5 s)', gap < 1500, `${Math.round(gap)} ms`);
await page.screenshot({ path: `${SHOTS}ocrscan.png` });

/* ---- Cancel keeps what was read */
await page.setInputFiles('#uwi-files', [F + 'scan-rr-3page.pdf']);
await page.waitForSelector('.ocr-progress');
await page.waitForFunction(() => /Page [12] of 3/.test(document.querySelector('.ocr-progress')?.textContent || ''), null, { timeout: 60000 });
await page.locator('.ocr-progress button', { hasText: 'Cancel' }).click();
await page.waitForFunction(() => document.querySelectorAll('.ocr-progress').length === 0, null, { timeout: 60000 });
const c = (await page.locator('.uwi-item', { hasText: 'scan-rr-3page.pdf' }).first().textContent()).replace(/\s+/g, ' ');
check('Cancel stops it, and the item says what was and was not read', /cancelled/i.test(c) && /of 3/.test(c), c.slice(0, 400));
check('the manual “Read it with OCR” is still there after a Cancel', (await page.locator('.uwi-item', { hasText: 'scan-rr-3page.pdf' }).first().locator('[data-ocr]').count()) === 1);
check('still nothing on a deal', (await deals()) === before);

/* ---- an OM page that is a picture of a few words: read, but not a rent roll, so nothing is typed from it */
await page.setInputFiles('#uwi-files', [F + 'om-scanned.pdf']);
await page.waitForFunction(() => [...document.querySelectorAll('.uwi-item')].some((x) => x.textContent.includes('om-scanned.pdf')), null, { timeout: 150000 });
const o = page.locator('.uwi-item', { hasText: 'om-scanned.pdf' }).first();
check('a scan with no rent roll or statement in it is not typed from OCR text; it is asked', (await o.locator('[data-use]').count()) === 0, (await o.textContent()).slice(0, 250));
await browser.close();
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', errors);
