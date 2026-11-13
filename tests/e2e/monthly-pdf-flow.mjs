/* Printed, dated monthly actuals; invented PDF, phone and desktop, separate Use and durable Undo. */
import { createRequire } from 'node:module';
import { phone, BASE, finish } from './lib.mjs';
import { MONTHS, VARYING, VARYING_TOTALS, monthlyPdf } from '../monthlypdf-fixtures.js';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (name, ok, detail = '') => R.push([ok ? 'PASS' : 'FAIL', name, detail]);
const file = { name: 'invented-twelve-month-actuals.pdf', mimeType: 'application/pdf', buffer: Buffer.from(monthlyPdf({ values: VARYING, totals: VARYING_TOTALS })) };
for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined }]]) {
  const { browser, page, errors } = await phone(opts);
  const n = (s) => `${size}: ${s}`;
  const requests = []; page.on('request', (r) => requests.push(r.url()));
  try {
    await page.goto(BASE + '#deal', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Enter figures by hand', exact: true }).click();
    await page.waitForSelector('#t12-import');
    const saved = () => page.evaluate(async () => { const m = await import('./app/dealui.js'); return (await m.listAllDeals()).find((d) => d.id === m.currentDealId()); });
    const pick = async () => { const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#t12-import')]); await chooser.setFiles(file); };
    const choice = page.locator('.action-sheet .action-item').filter({ hasText: 'T-12 actual months' });
    await pick();
    const found = await choice.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    check(n('a monthly PDF offers its actual-month statement'), found);
    if (!found) continue; // archived main has only the annual adapter
    check(n('the choice states its exact completed period'), /2025-01 to 2025-12.*12 printed actual months/.test(await choice.textContent()));
    check(n('picking a file changes no saved statement or figures'), !(await saved()).t12 && Object.keys((await saved()).figures).length === 0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    check(n('Cancel leaves the deal untouched'), !(await saved()).t12);
    await pick(); await choice.click(); await page.waitForSelector('#t12-use');
    let d = await saved();
    check(n('the printed twelve month dates are kept'), JSON.stringify(d.t12.months) === JSON.stringify(MONTHS) && d.t12.period.basis === 'T-12');
    check(n('different printed rent months remain different'), JSON.stringify(d.t12.lines.find((l) => l.label === 'Rental income').months) === JSON.stringify([10000, 10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008, 10009, 10010, 10011]));
    check(n('PDF source, filename and printed period are preserved'), d.t12.source.type === 'pdf' && d.t12.source.file === file.name && /PDF page 1.*2025-01.*2025-12/.test(d.t12.sheet));
    check(n('the document read is recorded once'), d.dd.docs.filter((x) => x.name === file.name && x.kind === 'pdf' && x.pages === 1 && x.type === 't12').length === 1);
    check(n('the statement import alone changes no deal figures'), d.figures.noi == null && d.figures.gross == null);
    await page.click('#t12-use'); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    check(n('cancelling Use keeps the figures blank'), (await saved()).figures.noi == null);
    await page.click('#t12-use'); await page.locator('.action-sheet .action-item').filter({ hasText: /^Use them/ }).click();
    await page.waitForFunction(() => document.getElementById('fig-noi')?.value.replace(/[^\d.-]/g, '') === '111066');
    d = await saved();
    check(n('confirmed annual figures match independent sums of the twelve printed months'), d.figures.noi === 111066 && d.figures.gross === 126066 && d.figures.opex === 15000 && d.figures.taxes === 12000);
    check(n('applied figures retain T-12 provenance'), d.sources.noi.t12 === true && d.sources.gross.t12 === true);
    await page.locator('#deal-undo[aria-label*="Used the T-12"]').waitFor({ state: 'attached' });
    const beforeUndo = await page.locator('#deal-undo').getAttribute('aria-label');
    await page.click('#deal-undo');
    await page.waitForFunction(() => document.getElementById('fig-noi')?.value === '');
    check(n('Undo removes the applied figures and retains the monthly statement'), (await saved()).figures.noi == null && (await saved()).t12.months.length === 12);
    await page.waitForFunction((label) => document.getElementById('deal-undo').getAttribute('aria-label') !== label, beforeUndo);
    const persisted = await page.evaluate(async () => { const s = await import('./app/store.js'); const m = await import('./app/dealui.js'); return await s.loadDeal(m.currentDealId()); });
    check(n('Undo is durably stored'), persisted.figures.noi == null && persisted.t12.months.length === 12);
    await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#t12-use');
    check(n('monthly source and Undo survive reload'), (await saved()).figures.noi == null && (await saved()).t12.source.file === file.name && (await saved()).t12.months.length === 12);
    await page.addScriptTag({ path: AXE });
    const bad = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } } })).violations.map((v) => v.id));
    check(n('axe finds no accessibility violations'), !bad.length, bad.join(', '));
    check(n('the phone page has no horizontal overflow'), await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    check(n('no request goes to another site'), requests.every((u) => u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')));
    check(n('no browser errors'), !errors.length, errors.join('\n'));
  } finally { await browser.close(); }
}
for (const r of R) console.log(r.join(' | '));
finish(R);
