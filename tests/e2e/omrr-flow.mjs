/* Bug A in the browser: an OM's rent roll read by position, checked, held
 * back by a failed check, resolved in Review, and a scanned page read by OCR
 * on request. The OM is invented (tests/rr-fixtures.js, typeset by
 * make_pdfs.py): a summary stating 9,000 SF, 80% occupancy and $215,000 of
 * base rent; the rent roll on pages 2 and 3, page 3 with no header; a Total
 * row printing $220,000 where its rows add up to $215,000; page 4 a scan.
 *   1. on a phone: Data QC shows the failed Total row with its page, line and
 *      cell, and the rent roll is held back (not applied);
 *   2. page 4 is flagged with "Read this scanned page";
 *   3. Review lists the check; "Accept as read" applies the rent roll: six
 *      units from pages 2-3, each lease's source on its page;
 *   4. page 4 read by OCR (Tesseract, loaded only now, from this site): its
 *      rows wait behind a failed check, marked OCR, until accepted;
 *   5. axe on the panel and the Review queue; no request to another site. */
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();
const text = async (sel) => ((await page.locator(sel).count()) ? (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim() : '');
const requests = [];
page.on('request', (r) => requests.push(r.url()));
const axe = async (name, scope) => {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  // a screen fades in (styles.css .view): checked mid-fade, its text is part transparent and reads as low contrast
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  const v = await page.evaluate(async (sc) => (await window.axe.run(document.querySelector(sc), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`), scope);
  check(`axe: ${name}`, v.length === 0, v.join('\n    '));
};

await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.waitForTimeout(400);
await page.setInputFiles('#om-file', F + 'om-rr-qc.pdf');
await page.waitForSelector('#deal-qc', { timeout: 20000 });
await page.waitForTimeout(600);

// 1. the failed Total row holds the rent roll back
const qc = await text('#deal-qc');
check('Data QC shows a fail', /1 fail/.test(qc), qc.slice(0, 200));
check('the Total row that doesn’t add up, with both figures', /prints annual rent of \$220,000; the 6 rows read add up to \$215,000/.test(qc));
check('the rent roll is held back', /held back/.test(qc) && /held back until the failed checks/.test(await text('#deal-rr')), await text('#deal-rr'));
check('no units applied yet', /none yet/.test(await text('#deal-rr .card-head')));
const fail = page.locator('#deal-qc .qc-item.qc-fail').first();
await fail.locator('summary').click();
check('the fail points to page 3, its line and the Annual Rent cell', /page 3, line \d+, column Annual Rent \(“\$220,000”\)/.test(await fail.innerText()), await fail.innerText());
check('the line as printed is shown', /Total/.test(await fail.locator('.qc-line').innerText()));
check('the carried page passes', /Page 3 carries on the table with no header/.test(qc));
check('occupancy checked on the stated building SF', /80\.0% occupancy matches the rent roll's leases, which fill 80\.0% of the stated 9,000 SF/.test(qc), qc);

// 2. the scanned page
const scan = page.locator('#deal-qc .qc-item', { hasText: 'Page 4 has no text layer' });
check('page 4 is flagged as having no text', (await scan.count()) === 1);
check('with “Read this scanned page”', (await scan.locator('button.qc-ocr').count()) === 1 && /Read this scanned page/.test(await scan.locator('button.qc-ocr').innerText()));
await page.screenshot({ path: `${SHOTS}omrr-qc.png`, fullPage: true });
check('nothing overflows on a phone', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
await axe('the Data QC panel', '#deal-qc');

// 3. resolved in Review
await page.evaluate(() => { location.hash = '#review'; });
await page.waitForSelector('#review-root .review-rrcheck', { timeout: 8000 });
const items = await page.locator('#review-root .review-rrcheck').allInnerTexts();
check('Review lists the rent roll checks', items.length >= 2, items.join(' / '));
const first = page.locator('#review-root .review-rrcheck').first();
check('the fail first, with its page, line and cell', /check failed/.test(await first.innerText()) && /page 3, line \d+, column Annual Rent/.test(await first.innerText()), await first.innerText());
await axe('the Review queue', '#review-root');
await first.locator('button', { hasText: 'Accept as read' }).click();
await page.waitForFunction(() => /now the deal’s/.test(document.querySelector('.toast')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
check('accepting applies the rent roll', /now the deal’s/.test(await text('.toast')), await text('.toast'));
await page.evaluate(() => { location.hash = '#deal'; });
await page.waitForSelector('#deal-qc');
await page.waitForTimeout(500);
check('six units from pages 2–3', /6 units · read from OM pages 2–3/.test(await text('#deal-rr .card-head')), await text('#deal-rr .card-head'));
check('the check shows it was accepted', /Accepted/.test(await text('#deal-qc .qc-fail')));
const leases = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('zlatura'); q.onsuccess = () => r(q.result); });
  const all = await new Promise((r) => { const q = db.transaction('deals').objectStore('deals').getAll(); q.onsuccess = () => r(q.result); });
  const d = all.find((x) => x.rrQc);
  return d ? { pages: d.rr.leases.map((L) => L.source && L.source.page), held: d.rrQc.held, resolved: d.rrQc.checks.filter((c) => c.resolved).map((c) => c.id) } : null;
}).catch((e) => String(e));
check('each lease keeps its page', leases && JSON.stringify(leases.pages) === JSON.stringify([2, 2, 2, 3, 3, 3]), JSON.stringify(leases));

// 4. the scanned page, read by OCR on request
const before = requests.filter((u) => /vendor\/ocr\//.test(u)).length;
check('the OCR files were not loaded before the tap', before === 0);
await page.locator('#deal-qc button.qc-ocr').click();
await page.waitForSelector('#deal-qc .qc-item[data-check="ocr:4"]', { timeout: 120000 });
const ocr = await text('#deal-qc .qc-item[data-check="ocr:4"]');
check('page 4 read by OCR: its rows wait behind a failed check', /Page 4 was read by OCR: 2 rows/.test(ocr) && /Fail/.test(ocr), ocr);
await page.locator('#deal-qc .qc-item[data-check="ocr:4"] .qc-ocr-rows summary').click();
const rowsText = await text('#deal-qc .qc-item[data-check="ocr:4"] .qc-ocr-rows');
check('the rows OCR read are shown to compare', /107/.test(rowsText) && /1,100/.test(rowsText) && /\$33,000/.test(rowsText) && /Vacant/.test(rowsText), rowsText);
check('the OCR files came from this site only', requests.filter((u) => /vendor\/ocr\//.test(u)).every((u) => u.startsWith(BASE)) && requests.filter((u) => /vendor\/ocr\//.test(u)).length >= 3, requests.filter((u) => /ocr/.test(u)).join(' '));
check('still six units until accepted', /6 units/.test(await text('#deal-rr .card-head')));
await page.locator('#deal-qc .qc-item[data-check="ocr:4"] button', { hasText: 'Accept as read' }).click();
await page.waitForTimeout(800);
check('accepted: eight units', /8 units/.test(await text('#deal-rr .card-head')), await text('#deal-rr .card-head'));
await page.waitForTimeout(600);
const ocrLeases = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('zlatura'); q.onsuccess = () => r(q.result); });
  const all = await new Promise((r) => { const q = db.transaction('deals').objectStore('deals').getAll(); q.onsuccess = () => r(q.result); });
  const d = all.find((x) => x.rrQc);
  return d.rr.leases.map((L) => [L.unit, !!(L.source && L.source.ocr), L.source && L.source.page]);
});
check('the two from OCR are marked OCR, on page 4; the rest are not', JSON.stringify(ocrLeases.map((x) => x[1])) === JSON.stringify([false, false, false, false, false, false, true, true]) && ocrLeases[6][2] === 4 && ocrLeases[6][0] === '107', JSON.stringify(ocrLeases));
await page.screenshot({ path: `${SHOTS}omrr-ocr.png`, fullPage: true });
check('no request to another site', requests.every((u) => u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')), requests.filter((u) => !u.startsWith(BASE)).join(' '));
const bad = ['NaN', 'Infinity', 'undefined'].filter((w) => new RegExp(`\\b${w}\\b`).test(qc));
check('no NaN, Infinity or undefined in the panel', !bad.length, bad.join());

for (const r of R) console.log(r.join(' | '));
finish(R, 'errors', errors);
await browser.close();
process.exit(R.some((r) => r[0] === 'FAIL') || errors.length ? 1 : 0);
