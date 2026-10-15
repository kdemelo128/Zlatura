/* Bug B in the browser: an OM's operating statement read as a table, checked,
 * held back by a failed check, fixed with one click, and undone. The OM is
 * invented (tests/om-statement-fixtures.js, typeset by make_pdfs.py): a
 * summary, then a statement “($ in 000s)” with Per Unit, T-12 and Pro Forma
 * columns whose T-12 NOI (786) is not its EGI (1,192) less its expenses (416).
 *   1. on a phone: Data QC fails the T-12 NOI, pointing at page 2, the NOI row
 *      and the T-12 cell; NOI, EGI and expenses are held back (not applied);
 *      the scale and the Per Unit column are noted;
 *   2. Review lists the check (omcheck) with the line as printed and the cell
 *      marked, and one button per fix;
 *   3. “Use the subtotals” applies NOI $776,000 (and EGI, expenses as
 *      printed), each figure saying its column, page and confidence in words;
 *   4. Undo on the deal puts the check back and holds the figures again;
 *   5. axe on the panel, the Review item and the figures, light and dark. */
import { createRequire } from 'module';
import { phone, BASE, SHOTS } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();
const text = async (sel) => ((await page.locator(sel).count()) ? (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim() : '');
const val = (k) => page.inputValue(`#fig-${k}`).catch(() => null);
const axe = async (name, scope) => {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async (sc) => (await window.axe.run(document.querySelector(sc), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`), scope);
  check(`axe: ${name}`, v.length === 0, v.join('\n    '));
};
const stored = () => page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('zlatura'); q.onsuccess = () => r(q.result); });
  const all = await new Promise((r) => { const q = db.transaction('deals').objectStore('deals').getAll(); q.onsuccess = () => r(q.result); });
  const d = all.find((x) => x.omRead);
  return d ? { noi: d.figures.noi ?? null, gross: d.figures.gross ?? null, opex: d.figures.opex ?? null, src: d.sources.noi || null, seen: d.omRead.seen, blocked: d.omRead.blocked, applied: d.omRead.applied } : null;
});

await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.waitForTimeout(400);
await page.setInputFiles('#om-file', F + 'om-stmt-qc.pdf');
await page.waitForSelector('#deal-omqc', { timeout: 20000 });
await page.waitForTimeout(600);

// 1. the failed check holds NOI, EGI and expenses back
const qc = await text('#deal-omqc');
check('Data QC shows a fail', /1 fail/.test(qc), qc.slice(0, 300));
check('the T-12 NOI that doesn’t add up, with the figures', /T-12: EGI \$1,192,000 less expenses \$416,000 is \$776,000, but NOI is printed as \$786,000/.test(qc), qc);
check('NOI, EGI and expenses are held back', /held back/.test(qc) && (await val('noi')) === '' && (await val('gross')) === '' && (await val('opex')) === '', `${await val('noi')} ${await val('gross')} ${await val('opex')}`);
check('each held figure says so under its label', (await page.locator('#deal-root .fig-held').count()) >= 3);
check('figures the check doesn’t hold are applied', /\$142,000/.test(await val('taxes')) || (await val('taxes')) === '142,000', await val('taxes'));
check('the scale is noted: read × 1,000', /thousands .*× 1,000/.test(qc));
check('the Per Unit column is not a total', /“Per Unit” is per unit: not read as a total/.test(qc));
const fail = page.locator('#deal-omqc .qc-item.qc-fail').first();
await fail.locator('summary').click();
check('the fail points to page 2, the NOI row and the T-12 cell', /page 2, line \d+, row Net Operating Income, column T-12 \(“786”\)/.test(await fail.innerText()), await fail.innerText());
check('the printed line shows the cell marked', (await fail.locator('.qc-line mark.qc-cell').innerText()) === '786');
check('one button per fix', (await fail.locator('button.qc-fix').count()) >= 2 && /Use the subtotals \(EGI − expenses\): NOI \$776,000/.test(await fail.innerText()), await fail.innerText());
await page.screenshot({ path: `${SHOTS}omstmt-qc.png`, fullPage: true });
check('nothing overflows on a phone', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
await axe('the statement Data QC panel', '#deal-omqc');
const s0 = await stored();
check('stored: nothing applied, three figures blocked', s0 && s0.noi === null && s0.gross === null && JSON.stringify(s0.blocked) === '["noi","gross","opex"]' && s0.applied === false, JSON.stringify(s0));

// 2. the Review item
await page.evaluate(() => { location.hash = '#review'; });
await page.waitForSelector('#review-root .review-omcheck', { timeout: 8000 });
const item = page.locator('#review-root .review-omcheck').first();
const it = await item.innerText();
check('Review lists the statement check with page, row and cell', /Operating statement check failed/.test(it) && /page 2, line \d+, row Net Operating Income, column T-12/.test(it), it);
check('with the cell marked on the line as printed', (await item.locator('mark.qc-cell').innerText()) === '786');
check('and a button for each fix', (await item.locator('button[data-fix]').count()) === 3, (await item.locator('button').allInnerTexts()).join(' / '));
await page.waitForTimeout(700); // the view's fade-in
await axe('the Review queue', '#review-root');

// 3. one click: use the subtotals
await item.locator('button[data-fix="subtotals"]').click();
await page.waitForFunction(() => /now the deal’s/.test(document.querySelector('.toast')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
check('the fix applies the figures', /now the deal’s/.test(await text('.toast')), await text('.toast'));
await page.evaluate(() => { location.hash = '#deal'; });
await page.waitForSelector('#deal-omqc-fold, #deal-omqc');
await page.waitForTimeout(500);
check('NOI is EGI less expenses: 776,000', /776,000/.test(await val('noi')), await val('noi'));
check('EGI and expenses as printed', /1,192,000/.test(await val('gross')) && /416,000/.test(await val('opex')), `${await val('gross')} ${await val('opex')}`);
const basis = await page.locator('#fig-noi').locator('xpath=..').locator('.fig-basis').innerText().catch(() => '');
check('NOI says its column, page and confidence in words', /^T-12 · p\.2 · checked by you$/.test(basis), basis);
const taxBasis = await page.locator('#fig-taxes').locator('xpath=..').locator('.fig-basis').innerText().catch(() => '');
check('a figure from the failed column says low confidence in words', /^T-12 · p\.2 · low$/.test(taxBasis), taxBasis);
check('the panel folds away with nothing open', (await page.locator('#deal-omqc-fold').count()) === 1 && /resolved/.test(await text('#deal-omqc-fold > summary')), await text('#deal-omqc-fold > summary'));
await page.locator('#deal-omqc-fold > summary').click();
check('the check shows the fix chosen', /Fixed: Use the subtotals/.test(await text('#deal-omqc .qc-fail')), await text('#deal-omqc .qc-fail'));
await page.waitForTimeout(600);
const s1 = await stored();
check('stored: the choice recorded in omRead.seen', s1 && s1.noi === 776000 && Object.values(s1.seen).some((x) => x.fix === 'subtotals') && s1.src && s1.src.col === 'T-12' && s1.src.cell === '786', JSON.stringify(s1));
await page.locator('#fig-noi').locator('xpath=..').locator('button.src').click();
await page.waitForSelector('#sheet-body .src-cell');
await page.waitForTimeout(700); // the sheet's slide-in
const sheet = await text('#sheet-body');
check('the source sheet shows row, column and cell', /Row Net Operating Income/.test(sheet) && /Column T-12/.test(sheet) && /“786” × 1,000/.test(sheet), sheet.slice(0, 400));
await axe('the source sheet', '#sheet-body');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await axe('the figures, light', '#deal-root');

// 4. undo
const undo = await page.getAttribute('#deal-undo', 'aria-label');
check('Undo names the fix', /Data QC: Use the subtotals/.test(undo || ''), undo);
await page.click('#deal-undo');
await page.waitForTimeout(800);
check('undo holds NOI back again', (await val('noi')) === '' && /1 fail/.test(await text('#deal-omqc')), `${await val('noi')} ${await text('#deal-omqc')}`);
const s2 = await stored();
check('stored: back as read', s2 && s2.noi === null && Object.keys(s2.seen).length === 0 && s2.applied === false, JSON.stringify(s2));

// 5. dark
await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForTimeout(300);
await page.locator('#deal-omqc .qc-item.qc-fail summary').first().click();
await axe('the statement Data QC panel, dark', '#deal-omqc');
await axe('the figures, dark', '#deal-root');
await page.evaluate(() => { location.hash = '#review'; });
await page.waitForSelector('#review-root .review-omcheck', { timeout: 8000 });
await page.waitForTimeout(700);
await axe('the Review queue, dark', '#review-root');
await page.screenshot({ path: `${SHOTS}omstmt-review-dark.png`, fullPage: true });
const bad = ['NaN', 'Infinity', 'undefined'].filter((w) => new RegExp(`\\b${w}\\b`).test(qc));
check('no NaN, Infinity or undefined in the panel', !bad.length, bad.join());

for (const r of R) console.log(r.join(' | '));
console.log(`PASS ${R.filter((r) => r[0] === 'PASS').length} FAIL ${R.filter((r) => r[0] === 'FAIL').length} errors`, errors);
await browser.close();
process.exit(R.some((r) => r[0] === 'FAIL') || errors.length ? 1 : 0);
