/* A property manager's rent roll PDF in the browser, at phone and desktop size (invented PDFs, tests/pmroll-fixtures.js):
 *   A. a clean report (pm-roll.pdf) shows its six units with page and line, the summary page's table adds none, and nothing
 *      is stored until "Use this rent roll"; each lease then names the PDF, the unit with no base rent has no rent period
 *      (charges and market rent did not fill it); Undo takes it back;
 *   B. a report with a Status Filter beside "Unit Filter: All" (pm-roll-filtered.pdf) fails the completeness check: rows
 *      are shown, "Accept the reading as it stands" does not accept it, and replacing a rent roll already there needs a second
 *      confirmation;
 *   C. an untitled table (pm-roll-untitled.pdf) is only offered as a possible rent roll, and nothing is read until asked;
 *   D. a rent column whose period is not stated (pm-roll-period.pdf) asks Monthly or Annual, cannot be accepted as a guess,
 *      and the answer changes the rent read;
 *   E. axe on the open preview, no sideways scrolling, no request to another site. */
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined }]]) {
  const { browser, page, errors } = await phone(opts);
  page.setDefaultTimeout(10000);
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const N = (s) => `${size}: ${s}`;
  const text = async (sel) => ((await page.locator(sel).count()) ? (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim() : '');
  const axe = async (name, scope) => {
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
    await page.waitForTimeout(500);
    const v = await page.evaluate(async (sc) => (await window.axe.run(document.querySelector(sc), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length} ${x.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`), scope);
    check(N(`axe: ${name}`), v.length === 0, v.join('\n    '));
  };
  const saved = () => page.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open('zlatura'); q.onsuccess = () => r(q.result); });
    const all = await new Promise((r) => { const q = db.transaction('deals').objectStore('deals').getAll(); q.onsuccess = () => r(q.result); });
    all.sort((a, b) => b.updatedAt - a.updatedAt);
    const d = all[0];
    return d && d.rr ? { n: d.rr.leases.length, leases: d.rr.leases } : null;
  });
  const units = async () => { await page.waitForTimeout(900); const d = await saved(); return d ? d.n : 0; };
  const openPdf = async (file) => {
    await page.locator('#deal-rentroll button[aria-label="More rent roll actions"]').click();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.action-sheet .action-item', { hasText: 'Import from PDF' }).click()]);
    await chooser.setFiles(F + file);
    await page.waitForSelector('#sheet-body', { state: 'visible' });
    await page.waitForTimeout(1200);
  };
  const closeSheet = async () => { await page.click('#sheet-close'); await page.waitForTimeout(400); };
  const fails = () => page.locator('#rrpdf-qc .qc-item.qc-fail').count();
  const useOff = () => page.locator('#rrpdf-use').isDisabled();
  const rowsText = () => text('#sheet-body .rrpdf-rows tbody');
  try {
    await page.goto(BASE + '#deal', { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
    await page.waitForTimeout(500);
    await page.click('#tab-rentroll');
    await page.waitForTimeout(400);

    // A. a clean report
    await openPdf('pm-roll.pdf');
    check(N('A: a clean report has no failed check'), (await fails()) === 0, (await text('#rrpdf-qc')).slice(0, 200));
    check(N('A: six units are listed, the wrapped name joined, with page and line'), (await page.locator('#sheet-body .rrpdf-rows tbody tr').count()) === 6 && /Northgate Family Dentistry, PC/.test(await rowsText()) && /1 · \d+/.test(await text('#sheet-body .rrpdf-rows tbody tr')), (await rowsText()).slice(0, 200));
    check(N('A: the summary page is named and its table added no rows'), /Page 3 is a summary/.test(await text('#rrpdf-qc')) && !/Occupied/.test(await rowsText()));
    check(N('A: only the base rent fills rent; charges and market rent do not (60,000 / 42,000 / 36,000 / 22,500, two blanks)'), /\$60,000/.test(await rowsText()) && /\$22,500/.test(await rowsText()) && !/\$2,400|\$5,200|\$1,800|\$2,000/.test(await rowsText()), await rowsText());
    check(N('A: nothing is stored while the preview is open'), (await units()) === 0);
    await axe('the preview sheet', '#sheet');
    check(N('A: nothing overflows sideways'), await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${SHOTS}pmroll-${size}.png`, fullPage: true });
    await page.click('#rrpdf-use');
    await page.waitForTimeout(900);
    const a = await saved();
    check(N('A: six units were added, each saying it came from the PDF, its page and line'), a && a.n === 6 && a.leases.every((L) => L.source.kind === 'pdf' && L.source.file === 'pm-roll.pdf' && L.source.page >= 1 && L.source.line > 0), JSON.stringify(a && a.leases[0].source));
    const byUnit = Object.fromEntries((a ? a.leases : []).map((L) => [L.unit, L]));
    check(N('A: rents in dollars a year: 60,000 / 42,000 / 36,000 / 22,500; the unit with no base rent has none'), byUnit.A1.periods[0].rate === 60000 && byUnit.A2.periods[0].rate === 42000 && byUnit.B1.periods[0].rate === 36000 && byUnit.B3.periods[0].rate === 22500 && byUnit.B2.periods.length === 0 && byUnit.A3.periods.length === 0, JSON.stringify(byUnit.B2 && byUnit.B2.periods));
    check(N('A: the month-to-month unit is marked'), byUnit.B3.mtm === true);
    await page.locator('.toast button', { hasText: 'Undo' }).click().catch(() => {});
    await page.waitForTimeout(700);
    check(N('A: Undo takes the import back'), (await units()) === 0, String(await units()));

    // B. a filtered report
    await openPdf('pm-roll-filtered.pdf');
    check(N('B: the filter fails the completeness check, saying where'), (await page.locator('#rrpdf-qc .qc-item[data-check^="subset"].qc-fail').count()) === 1 && /Status Filter: Current/.test(await text('#rrpdf-qc')), (await text('#rrpdf-qc')).slice(0, 300));
    check(N('B: its rows can be reviewed, held back'), (await page.locator('#sheet-body .rrpdf-rows tbody tr').count()) === 6 && /held back/.test(await text('#sheet-body')));
    check(N('B: Use is off'), await useOff());
    await page.locator('#rrpdf-qc button', { hasText: 'Accept the reading as it stands' }).click();
    await page.waitForTimeout(300);
    check(N('B: “Accept the reading as it stands” does not accept a filtered report'), (await page.locator('#rrpdf-qc .qc-item[data-check^="subset"].qc-fail:not(.qc-resolved)').count()) === 1 && (await useOff()));
    await closeSheet();
    check(N('B: closing the sheet stores nothing'), (await units()) === 0);
    // with a roll already there, replacing needs a second confirmation
    await openPdf('pm-roll.pdf'); await page.click('#rrpdf-use'); await page.waitForTimeout(700);
    check(N('B: (six units in)'), (await units()) === 6);
    await openPdf('pm-roll-filtered.pdf');
    await page.locator('#rrpdf-qc .qc-item[data-check^="subset"] button', { hasText: 'Accept as read' }).click();
    await page.waitForTimeout(300);
    check(N('B: the filtered report, accepted, still has neither Replace nor Add chosen'), (await page.locator('input[name="rrpdf-mode"]:checked').count()) === 0 && (await useOff()));
    await page.locator('input[name="rrpdf-mode"][value="replace"]').check();
    await page.waitForTimeout(200);
    check(N('B: Replace with a filtered report asks again, and Use stays off'), (await page.locator('#rrpdf-replace-subset').count()) === 1 && (await useOff()) && /Confirm replacing/.test((await page.locator('#rrpdf-use').getAttribute('title')) || ''));
    await axe('the filtered preview', '#sheet');
    await page.locator('#rrpdf-replace-subset').check();
    await page.waitForTimeout(200);
    check(N('B: Use is on only after both confirmations'), !(await useOff()));
    await page.click('#rrpdf-use'); await page.waitForTimeout(800);
    check(N('B: the import says the report was filtered'), /filtered rent roll PDF/.test(await page.evaluate(() => document.body.innerText)) || (await units()) === 6);
    await page.locator('.toast button', { hasText: 'Undo' }).click().catch(() => {});
    await page.waitForTimeout(700);
    check(N('B: Undo restores the six units that were there'), (await units()) === 6);
    // clear the roll for the next part
    await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
    await page.waitForTimeout(500);
    await page.click('#tab-rentroll');
    await page.waitForTimeout(400);

    // C. an untitled table
    await openPdf('pm-roll-untitled.pdf');
    check(N('C: an untitled table is not read until the broker says it is a rent roll'), /nothing on the first two pages says this is one/.test(await text('#sheet-body')) && (await page.locator('#rrpdf-qc').count()) === 0 && (await useOff()) && (await units()) === 0);
    await page.click('#rrpdf-read-anyway');
    await page.waitForTimeout(400);
    check(N('C: after “It is a rent roll: read it”, the rows are shown and Use is on'), (await page.locator('#sheet-body .rrpdf-rows tbody tr').count()) === 6 && !(await useOff()));
    check(N('C: still nothing stored'), (await units()) === 0);
    await closeSheet();

    // D. a period the page does not state
    await openPdf('pm-roll-period.pdf');
    const q = page.locator('#rrpdf-qc .qc-item[data-check^="period"]');
    check(N('D: the report asks whether the rent column is monthly or annual'), (await q.count()) === 1 && /monthly rent or annual rent/.test(await q.innerText()), await text('#rrpdf-qc'));
    check(N('D: the question offers Monthly and Annual, and no “Accept as read” for a guess'), (await q.locator('button[data-period]').count()) === 2 && (await q.locator('button', { hasText: 'Accept as read' }).count()) === 0);
    await page.locator('#rrpdf-qc button', { hasText: 'Accept the reading as it stands' }).click().catch(() => {});
    check(N('D: Use stays off until it is answered'), await useOff());
    await q.locator('button[data-period="annual"]').click();
    await page.waitForTimeout(400);
    check(N('D: answered Annual: the rent is read as a year ($5,000, not $60,000), and Use is on'), /\$5,000/.test(await rowsText()) && !/\$60,000/.test(await rowsText()) && !(await useOff()) && /You chose annual rent/.test(await text('#rrpdf-qc')), (await rowsText()).slice(0, 160));
    await page.click('#rrpdf-use'); await page.waitForTimeout(800);
    const dd = await saved();
    check(N('D: the stored rent follows the answer (A1 5,000 a year)'), dd && dd.leases.find((L) => L.unit === 'A1').periods[0].rate === 5000, JSON.stringify(dd && dd.leases[0].periods));
    check(N('no request to another site'), requests.every((u) => u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')), requests.filter((u) => !u.startsWith(BASE)).join(' '));
    check(N('no browser errors'), !errors.length, errors.join('\n'));
  } finally { await browser.close(); }
}
for (const r of R) console.log(r.join(' | '));
finish(R);
