/* A rent roll PDF as its own document, in the browser on a phone-size page (queue item d):
 *   A. a due-diligence rent roll (rr-dd.pdf): the preview shows its Data QC and six rows, and nothing is stored
 *      until "Use this rent roll"; it then fills the rent roll, each lease's source says the PDF, its file, page and
 *      line; Undo takes it back; a second import asks Replace or Add (none chosen), warns about suites already
 *      there, and Replace leaves six units;
 *   B. a property manager's report (rr-pm.pdf) reads clean (Monthly Charges is not rent; Past Due is noted); the same
 *      report with rent and charges printed as one figure (rr-pm-combined.pdf) is held by a failed check: "Use" stays off
 *      until the check is accepted, and closing the sheet stores nothing;
 *   C. an OM (om-retail.pdf) and an operating statement (stmt-doc.pdf) are named and not read;
 *   D. a scanned rent roll (rr-scan.pdf): OCR files are not requested until its button is tapped; its rows wait
 *      behind a failed check, then are used, marked OCR;
 *   E. axe on the open preview, no sideways scrolling, no request to another site. */
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();
page.setDefaultTimeout(10000);
const requests = [];
page.on('request', (r) => requests.push(r.url()));
const text = async (sel) => ((await page.locator(sel).count()) ? (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim() : '');
const axe = async (name, scope) => {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  await page.waitForTimeout(500);
  const v = await page.evaluate(async (sc) => (await window.axe.run(document.querySelector(sc), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length} ${x.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`), scope);
  check(`axe: ${name}`, v.length === 0, v.join('\n    '));
};
const saved = () => page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('zlatura'); q.onsuccess = () => r(q.result); });
  const all = await new Promise((r) => { const q = db.transaction('deals').objectStore('deals').getAll(); q.onsuccess = () => r(q.result); });
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  const d = all[0];
  return d && d.rr ? { n: d.rr.leases.length, sources: d.rr.leases.map((L) => L.source), schema: d.schema } : null;
});
const openPdf = async (file) => {
  await page.locator('#deal-rentroll button[aria-label="More rent roll actions"]').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.action-sheet .action-item', { hasText: 'Import from PDF' }).click()]);
  await chooser.setFiles(F + file);
  await page.waitForSelector('#sheet-body', { state: 'visible' });
  await page.waitForTimeout(1200);
};
const closeSheet = async () => { await page.click('#sheet-close'); await page.waitForTimeout(400); };
// the stored leases (the grid shows a placeholder row when empty); the save is debounced
const units = async () => { await page.waitForTimeout(900); const d = await saved(); return d ? d.n : 0; };

await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.waitForTimeout(400);
await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
await page.waitForTimeout(500);
await page.click('#tab-rentroll');
await page.waitForTimeout(400);

// A. a due-diligence rent roll
await openPdf('rr-dd.pdf');
const qc = await text('#rrpdf-qc');
check('the preview shows Data QC, with no failed check', /data qc/i.test(qc) && (await page.locator('#rrpdf-qc .qc-item.qc-fail').count()) === 0, qc.slice(0, 160));
check('the preview lists the six rows, each with its page and line', (await page.locator('#sheet-body .rrpdf-rows tbody tr').count()) === 6 && /1 · \d+/.test(await text('#sheet-body .rrpdf-rows tbody tr')), await text('#sheet-body .rrpdf-rows tbody tr'));
check('no OM checks: the roll is not compared with figures that are not there', !/The OM/.test(qc), qc.slice(0, 200));
const before = await saved();
check('nothing is stored while the preview is open', (await units()) === 0 && (!before || before.n === 0), JSON.stringify(before && before.n));
await page.screenshot({ path: `${SHOTS}rrpdf-preview.png`, fullPage: true });
check('nothing overflows on a phone', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
await axe('the preview sheet', '#sheet');
check('Use this rent roll is on (no failed check, nothing to replace)', !(await page.locator('#rrpdf-use').isDisabled()));
await page.click('#rrpdf-use');
await page.waitForTimeout(900);
check('the rent roll now has six units', (await units()) === 6, String(await units()));
const a = await saved();
check('each lease says it came from the PDF: kind pdf, the file, the page and the line', a && a.n === 6 && a.sources.every((s) => s.kind === 'pdf' && s.file === 'rr-dd.pdf' && s.page === 1 && s.line > 0), JSON.stringify(a && a.sources[0]));
check('the deal carries the new schema', a && a.schema === 6, String(a && a.schema));
const snaps = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('zlatura'); q.onsuccess = () => r(q.result); });
  const all = await new Promise((r) => { const q = db.transaction('snapshots').objectStore('snapshots').getAll(); q.onsuccess = () => r(q.result); });
  return all.map((x) => x.reason);
});
check('a snapshot was taken just before the import', snaps.includes('Before importing a rent roll PDF'), JSON.stringify(snaps));
await page.locator('.toast button', { hasText: 'Undo' }).click().catch(() => {});
await page.waitForTimeout(700);
check('Undo takes the import back: no units', (await units()) === 0, String(await units()));

// a second import into a rent roll that has units: Replace or Add, none chosen
await openPdf('rr-dd.pdf');
await page.click('#rrpdf-use');
await page.waitForTimeout(700);
check('(six units in again)', (await units()) === 6);
await openPdf('rr-dd.pdf');
check('the same PDF again is compared with the roll it made: every unit matches', /All 6 units match/.test(await text('#rrpdf-compare-sum')), await text('#rrpdf-compare-sum'));
check('with units already there, neither Replace nor Add is chosen and Use is off', (await page.locator('input[name="rrpdf-mode"]:checked').count()) === 0 && (await page.locator('#rrpdf-use').isDisabled()));
await page.locator('input[name="rrpdf-mode"][value="add"]').check();
await page.waitForTimeout(200);
check('Add warns that the same suites would be counted twice', /6 suites are already in the rent roll: adding counts the same space twice/.test(await text('#sheet-body .rrpdf-mode')), await text('#sheet-body .rrpdf-mode'));
await page.locator('input[name="rrpdf-mode"][value="replace"]').check();
await page.click('#rrpdf-use');
await page.waitForTimeout(800);
check('Replace leaves six units, not twelve', (await units()) === 6, String(await units()));

// B. a property manager's report reads clean; one with rent and charges combined is held
await openPdf('rr-pm.pdf');
const clean = await text('#sheet-body');
check('the property manager’s report has no failed check, reads its Rent column, and notes Past Due', (await page.locator('#rrpdf-qc .qc-item.qc-fail').count()) === 0 && /60,000/.test(clean) && /42,000/.test(clean) && /Past Due/.test(await text('#rrpdf-qc')), JSON.stringify({ fails: await page.locator('#rrpdf-qc .qc-item.qc-fail').count(), has60000: /60,000/.test(clean), pd: /Past Due/.test(await text('#rrpdf-qc')) }) + clean.slice(300, 700));
await closeSheet();
await openPdf('rr-pm-combined.pdf');
const pm = await text('#rrpdf-qc');
check('a different report is compared with the current roll, listing what is only on one side', /0 of 6 units match/.test(await text('#rrpdf-compare-sum')) && /only in the PDF/.test(await text('.rrpdf-compare')), await text('.rrpdf-compare'));
check('a report with rent and charges as one figure is held by a failed check naming the column', /Rent & Charges/.test(pm) && (await page.locator('#rrpdf-qc .qc-item.qc-fail').count()) >= 1, pm.slice(0, 260));
await page.locator('input[name="rrpdf-mode"][value="replace"]').check();   // so the only thing holding Use off is the failed check
await page.waitForTimeout(200);
check('Use is off while a check fails (even with Replace chosen)', (await page.locator('#rrpdf-use').isDisabled()) && /failed check/.test((await page.locator('#rrpdf-use').getAttribute('title')) || ''), (await page.locator('#rrpdf-use').getAttribute('title')) || '');
await page.locator('#rrpdf-qc button', { hasText: 'Accept the reading as it stands' }).click();
await page.waitForTimeout(300);
await page.locator('input[name="rrpdf-mode"][value="replace"]').check();
check('Use is on once every failed check is accepted', !(await page.locator('#rrpdf-use').isDisabled()));
await closeSheet();
check('closing the sheet stores nothing: still six units from before', (await units()) === 6 && (await saved()).n === 6);

// C. an OM and an operating statement
await openPdf('om-retail.pdf');
check('an OM is named as one, not read', /offering memorandum/.test(await text('#sheet-body')) && (await page.locator('#rrpdf-qc').count()) === 0 && (await page.locator('#rrpdf-use').isDisabled()), (await text('#sheet-body')).slice(0, 200));
await closeSheet();
await openPdf('stmt-doc.pdf');
check('an operating statement is named as one, not read', /operating statement/.test(await text('#sheet-body')) && (await page.locator('#rrpdf-qc').count()) === 0 && (await page.locator('#rrpdf-use').isDisabled()), (await text('#sheet-body')).slice(0, 200));
await closeSheet();

// D. a scanned rent roll: OCR only when asked
const ocrBefore = requests.filter((u) => /vendor\/ocr\//.test(u)).length;
await openPdf('rr-scan.pdf');
check('a scan says it has no text layer, and OCR files were not requested', /A page can be read with OCR, on request/.test(await text('#sheet-body')) && /no text layer/.test(await text('#rrpdf-qc')) && ocrBefore === 0 && requests.filter((u) => /vendor\/ocr\//.test(u)).length === 0, (await text('#rrpdf-qc')).slice(0, 160));
await page.locator('#rrpdf-qc button.qc-ocr').first().click();
await page.waitForSelector('#rrpdf-qc .qc-item[data-check="ocr:1"]', { timeout: 150000 });
check('OCR read after the tap, from this site only; its rows wait behind a failed check', /read by OCR/.test(await text('#rrpdf-qc .qc-item[data-check="ocr:1"]')) && requests.filter((u) => /vendor\/ocr\//.test(u)).every((u) => u.startsWith(BASE)) && await page.locator('#rrpdf-use').isDisabled());
await page.locator('#rrpdf-qc .qc-item[data-check="ocr:1"] button', { hasText: 'Accept as read' }).click();
await page.waitForTimeout(400);
check('accepted OCR rows appear in the preview', (await page.locator('#sheet-body .rrpdf-rows tbody tr').count()) >= 5, String(await page.locator('#sheet-body .rrpdf-rows tbody tr').count()));
await page.locator('input[name="rrpdf-mode"][value="add"]').check();
await page.click('#rrpdf-use');
await page.waitForTimeout(900);
const d2 = await saved();
check('the OCR rows were added, marked OCR and as from the PDF', d2 && d2.n > 6 && d2.sources.filter((s) => s.ocr && s.kind === 'pdf' && s.file === 'rr-scan.pdf').length >= 5, JSON.stringify(d2 && d2.sources.slice(-1)));

check('no request to another site', requests.every((u) => u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')), requests.filter((u) => !u.startsWith(BASE)).join(' '));
for (const r of R) console.log(r.join(' | '));
finish(R, 'errors', errors);
await browser.close();
process.exit(R.some((r) => r[0] === 'FAIL') || errors.length ? 1 : 0);
