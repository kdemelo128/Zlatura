/* A PDF with no text layer is read by OCR on this device wherever it is uploaded, not only on Start from documents: the deal page's
 * OM, the rent roll's "Import from PDF", the T-12's PDF import and the Documents card. Each shows the same progress line with Cancel
 * (it takes no focus), reads the pages on this device from this site's own files, and changes nothing on the deal by itself. An OM
 * with one scanned rent roll page (text everywhere else) has that page read by OCR before the OM reader runs, so its rent roll is
 * not missed. Invented files (make_scans.py, make_ocr_deal.py). At phone and desktop size.
 *
 *   node ocrdeal-flow.mjs        # BASE=http://localhost:8080/ by default */
import { phone, BASE, SHOTS, finish } from './lib.mjs';

const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const SIZES = [['phone', {}], ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined }]];
const dealOf = (page) => page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('zlatura'); q.onsuccess = () => r(q.result); });
  const all = await new Promise((r) => { const q = db.transaction('deals').objectStore('deals').getAll(); q.onsuccess = () => r(q.result); });
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  const d = all[0]; db.close();
  return d ? { name: d.name, figures: d.figures || {}, rows: (d.rentRoll || []).length, ocrRows: (d.rr && d.rr.leases ? d.rr.leases : []).filter((L) => L.source && L.source.ocr).length, offered: d.rrQc ? (d.rrQc.ocr || []).map((o) => [o.page, o.rows.length, o.added]) : [], leases: d.rr ? d.rr.leases.length : 0, t12: !!d.t12, docs: (d.dd && d.dd.docs || []).map((x) => ({ name: x.name, type: x.type })) } : null;
});

/** After a file is added to the Documents card: answer the what-is-this question when it is asked (add with no type), then let the save finish. */
const settleCardFor = (page) => async () => {
  await page.waitForFunction(() => window.__toasts.length > 0 || document.querySelector('.action-sheet .action-item'), null, { timeout: 60000 });
  const none = page.locator('.action-sheet .action-item', { hasText: 'Add it with no type' });
  if (await none.count()) await none.click();
  await page.waitForFunction(() => window.__toasts.some((t) => /OCR/.test(t)), null, { timeout: 60000 });
  await page.waitForTimeout(1000);
};
for (const [size, opts] of SIZES) {
  const { browser, page, errors } = await phone(opts);
  page.setDefaultTimeout(60000);
  const requests = []; page.on('request', (r) => requests.push(r.url()));
  const settleCard = settleCardFor(page);
  const bar = () => page.locator('.ocr-progress');
  const barClean = async () => check(`${size}: the progress line is gone when it is done`, (await bar().count()) === 0);
  // a toast is replaced by the next one: every one shown is kept
  await page.addInitScript(() => { window.__toasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); }).observe(document, { childList: true, subtree: true }); });
  const clearToasts = () => page.evaluate(() => { window.__toasts = []; });
  const toasts = () => page.evaluate(() => window.__toasts.join(' | ').replace(/\s+/g, ' '));
  await page.goto(`${BASE}#deal`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  /* ---- 1. the OM on the deal page, one rent roll page scanned */
  await page.setInputFiles('#om-file', F + 'om-mixed-scan.pdf');
  await page.waitForSelector('.ocr-progress');
  const t = await bar().innerText();
  check(`${size}: an OM with a scanned page shows the progress line with Cancel`, /Reading a scanned PDF by OCR/.test(t) && (await bar().locator('button', { hasText: 'Cancel' }).count()) === 1, t);
  check(`${size}: it is a status line that takes no focus and is not a dialog`, (await page.locator('.ocr-progress[role="status"]').count()) === 1 && (await page.locator('[role="dialog"]:visible').count()) === 0 && await page.evaluate(() => !document.querySelector('.ocr-progress').contains(document.activeElement)));
  check(`${size}: only the scanned page is read (page 5 of 6)`, /Page 5 of 6/.test(await bar().innerText()), await bar().innerText());
  await page.waitForFunction(() => !document.querySelector('.ocr-progress'), null, { timeout: 240000 });
  await page.waitForFunction(() => /Read 6 pages/.test(document.body.innerText), null, { timeout: 30000 });
  const said = await toasts();
  check(`${size}: it says which page was read by OCR and to check the figures`, /Read by OCR on this device \(page 5 of 6\): check every figure against the page/.test(said), said.slice(0, 300));
  await page.waitForTimeout(1000);
  const d1 = await dealOf(page);
  check(`${size}: the scanned rent roll page was read at the upload, but its six units are an offer, not on the deal yet`, d1 && d1.rows === 0 && JSON.stringify(d1.offered) === '[[5,6,false]]', JSON.stringify(d1 && [d1.rows, d1.offered]));
  check(`${size}: the figures from the text pages were read as before`, d1 && d1.figures.price > 0, JSON.stringify(d1 && d1.figures.price));
  await page.locator('#deal-qc .qc-item[data-check="ocr:5"] button', { hasText: 'Accept as read' }).click();
  await page.waitForTimeout(1000);
  const dAcc = await dealOf(page);
  check(`${size}: Accept adds the six units, marked as read by OCR`, dAcc && dAcc.rows === 6 && dAcc.ocrRows === 6, JSON.stringify(dAcc && [dAcc.rows, dAcc.ocrRows]));
  check(`${size}: the OCR files came from this site, and nothing went to another`, requests.filter((u) => /vendor\/ocr\//.test(u)).length >= 3 && requests.every((u) => u.startsWith(BASE) || /^(data|blob):/.test(u)));
  await barClean();
  await page.screenshot({ path: `${SHOTS}ocrdeal-om-${size}.png` });

  /* ---- 2. a scanned OM (no text anywhere): read by OCR, nothing typed from a picture of a few words, asked */
  await page.evaluate(() => { location.hash = '#deal'; });
  await clearToasts();
  await page.setInputFiles('#om-file', F + 'om-scanned.pdf');
  await page.waitForSelector('.ocr-progress');
  await page.waitForFunction(() => !document.querySelector('.ocr-progress'), null, { timeout: 240000 });
  await page.waitForFunction(() => window.__toasts.length > 0, null, { timeout: 30000 });
  const d2 = await dealOf(page);
  check(`${size}: a scanned OM is OCR'd on the deal page, and says so`, /Read by OCR on this device \(all 2 pages\)/.test(await toasts()), (await toasts()).slice(0, 300));
  check(`${size}: no rent roll is made up from it`, d2 && d2.rows === 0);

  /* ---- 3. the rent roll's Import from PDF, a scan */
  await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
  await page.waitForTimeout(500);
  await page.click('#tab-rentroll');
  await page.waitForTimeout(400);
  await clearToasts();
  await page.locator('#deal-rentroll button[aria-label="More rent roll actions"]').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.action-sheet .action-item', { hasText: 'Import from PDF' }).click()]);
  await chooser.setFiles(F + 'scan-rr-300.pdf');
  await page.waitForSelector('.ocr-progress');
  check(`${size}: the rent roll PDF import shows the progress line with Cancel`, (await bar().locator('button', { hasText: 'Cancel' }).count()) === 1);
  await page.waitForSelector('#sheet-body .rrpdf-rows tbody tr', { timeout: 240000 });
  await barClean();
  const rows = await page.locator('#sheet-body .rrpdf-rows tbody tr').count();
  check(`${size}: the preview lists the rows read from the scan, to be confirmed before anything is used`, rows >= 5, String(rows));
  check(`${size}: nothing is on the deal until Use this rent roll`, (await dealOf(page)).leases === 0);
  check(`${size}: it said the rows were read by OCR, to check every figure`, /Read by OCR on this device \(all 1 page\): check every figure/.test(await toasts()), (await toasts()).slice(0, 300));
  await page.screenshot({ path: `${SHOTS}ocrdeal-rr-${size}.png` });
  await page.click('#sheet-close');
  await page.waitForTimeout(400);

  /* ---- 4. the T-12's PDF import, a scan */
  await page.click('#tab-overview').catch(() => {});
  await page.waitForSelector('#t12-import');
  const [c2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#t12-import')]);
  await c2.setFiles(F + 'scan-stmt-300.pdf');
  await page.waitForSelector('.ocr-progress');
  await page.waitForFunction(() => !document.querySelector('.ocr-progress'), null, { timeout: 240000 });
  await page.waitForTimeout(800);
  check(`${size}: the T-12 PDF import read the scan by OCR (progress line), and still asks before it uses anything`, (await dealOf(page)).t12 === false);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  /* ---- 5. the Documents card: a scan is read by OCR and typed; Cancel keeps what was read */
  await page.waitForSelector('#dd-toggle');
  if ((await page.getAttribute('#dd-toggle', 'aria-expanded')) === 'false') await page.click('#dd-toggle');
  await page.waitForSelector('#dd-files', { state: 'attached' });
  await clearToasts();
  await page.setInputFiles('#dd-files', [F + 'scan-rr-150-skew.pdf']);
  await page.waitForSelector('.ocr-progress');
  check(`${size}: the Documents card shows the progress line with Cancel`, (await bar().locator('button', { hasText: 'Cancel' }).count()) === 1);
  await settleCard();
  const dd = await dealOf(page);
  check(`${size}: the scan was typed as a rent roll from its OCR text and added`, dd.docs.some((x) => x.name === 'scan-rr-150-skew.pdf' && x.type === 'rentroll'), JSON.stringify(dd.docs));
  check(`${size}: it says it was read by OCR, and to check every figure`, /Read by OCR on this device \(all 1 page\): check every figure/.test(await toasts()), (await toasts()).slice(-300));
  await clearToasts();
  await page.setInputFiles('#dd-files', [F + 'scan-rr-3page.pdf']);
  await page.waitForSelector('.ocr-progress');
  await page.waitForFunction(() => /Page [12] of 3/.test(document.querySelector('.ocr-progress')?.textContent || ''), null, { timeout: 120000 });
  await bar().locator('button', { hasText: 'Cancel' }).click();
  await page.waitForFunction(() => !document.querySelector('.ocr-progress'), null, { timeout: 120000 });
  await settleCard();
  check(`${size}: Cancel on the Documents card keeps what was read and says so`, /cancelled/i.test(await toasts()) && /of 3\)/.test(await toasts()), (await toasts()).slice(-300));
  check(`${size}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  check(`${size}: no request went to another site`, requests.every((u) => u.startsWith(BASE) || /^(data|blob):/.test(u)));
  check(`${size}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
}
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R);
