/* T-12 PR 2 "Suggestions, not choices" in the browser, at iPhone size, on invented statements:
 *   1. a remembered label is a suggestion to confirm, a capital line under Expenses is one to classify; the
 *      card counts them, leaves them out of the totals, and "Use the T-12's figures" waits for them;
 *   2. in Every line: Choose another, Confirm, Leave unclassified, Keep in operating (operating categories
 *      only), Below the line; each choice is one history entry that Undo takes back; 44 pt targets; axe;
 *   3. in Review: Confirm all N suggestions lists them first and is one step (one Undo); one Confirm;
 *   4. a statement filed by 4.7.33 (a real 4.7.33 backup) keeps its filings and shows one Note, marked Seen.
 * Each check fails on 4.7.33. The invented files are removed when the flow ends. */
import fs from 'fs';
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
import { arcadeCsv, PYLON_HISTORY } from '../t12-suggest-fixtures.js';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const OLD = JSON.parse(fs.readFileSync(new URL('../fixtures/backup-4.7.33-before-t12-suggestions.json', import.meta.url), 'utf8'));
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const MADE = ['t12sug-arcade.csv', 't12sug-b.csv', 't12sug-zero.csv'];
const cleanup = () => { for (const f of MADE) fs.rmSync(F + f, { force: true }); };
cleanup();
fs.writeFileSync(`${F}t12sug-arcade.csv`, arcadeCsv());
// three remembered labels on four lines (Lawn Care twice): Confirm all
fs.writeFileSync(`${F}t12sug-b.csv`, 'Account,Jan 2026,Feb 2026,Mar 2026,Total\nINCOME\nBase Rent,1000,1000,1000,3000\nPylon Sign Lease,50,50,50,150\nEXPENSES\nReal Estate Taxes,100,100,100,300\nLawn Care,10,10,10,30\nDumpster Hauling,20,20,20,60\nLawn Care,5,5,5,15\n');

// a suggested line worth $0: only its count can hold the figures back
fs.writeFileSync(`${F}t12sug-zero.csv`, 'Account,Jan 2026,Feb 2026,Mar 2026,Total\nINCOME\nBase Rent,1000,1000,1000,3000\nPylon Sign Lease,0,0,0,0\n');

const P = await phone();
const { page, errors } = P;
const text = async (sel) => ((await page.locator(sel).count()) ? (await page.textContent(sel)).replace(/\s+/g, ' ').trim() : '');
const toastText = () => page.evaluate(() => document.querySelector('.toast')?.textContent || '');
const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const dealId = () => page.evaluate(() => localStorage.getItem('zlatura.deal.current'));
const db = (store, key) => page.evaluate(([s, k]) => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction(s).objectStore(s).get(k); g.onsuccess = () => res(g.result); }; }), [store, key]);
const dealNow = async () => db('deals', await dealId());
const labels = () => page.evaluate(async () => (await (await import('./app/store.js')).kvGet('t12.labels')) || { entries: {} });
const settle = () => page.waitForTimeout(700);
const undoLabel = () => page.getAttribute('#deal-undo', 'aria-label');
const lineOf = (d, label) => d.t12.lines.find((l) => l.label === label);
const height = async (loc) => (await loc.first().boundingBox())?.height || 0;
async function importFile(name) {
  const btn = (await page.locator('#t12-replace').count()) ? '#t12-replace' : '#t12-import';
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(btn)]);
  await fc.setFiles(F + name);
  await page.waitForFunction((n) => (document.querySelector('#deal-t12')?.textContent || '').includes(n), name, { timeout: 12000 });
  await settle();
}
async function openLines() { await page.click('#t12-lines'); await page.waitForSelector('#sheet-body .t12-lines'); }
async function audit(name, scope) {
  await page.waitForTimeout(450);
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async (sc) => {
    const r = await window.axe.run(sc ? document.querySelector(sc) : document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }, scope);
  check(`axe: ${name}`, res.length === 0, res.join('\n    '));
}

try {
  await page.goto(BASE + '#deal', { waitUntil: 'load' });
  await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
  await page.waitForSelector('#deal-t12 #t12-import');
  const id = await dealId();
  // what the broker filed before: pylon signs six times as other income, once as contract services; two more labels
  await page.evaluate(async (pylon) => {
    const s = await import('./app/store.js');
    await s.kvSet('t12.labels', { entries: {
      'pylon sign lease': pylon,
      'lawn care': { category: 'contract', at: 1700000009, deals: [{ deal: 'x1', category: 'contract', at: 1700000008 }, { deal: 'x2', category: 'contract', at: 1700000009 }] },
      'dumpster hauling': { category: 'contract', at: 1700000010, deals: [{ deal: 'x1', category: 'contract', at: 1700000010 }] },
    } });
  }, PYLON_HISTORY);

  /* ---- 1. the card */
  await importFile('t12sug-arcade.csv');
  let card = await text('#deal-t12');
  check('the card counts: 1 suggestion to confirm and 1 to classify', /1 suggestion to confirm and 1 to classify\./.test(card), card.slice(0, 300));
  check('open lines are not filed: EGI $120,000, NOI $108,000 with the lines left out, Not yet filed $3,100', /Effective gross income\$120,000/.test(card) && /NOI \(lines still to file are left out\)\$108,000/.test(card) && /Not yet filed\$3,100/.test(card), card.slice(0, 700));
  await page.click('#t12-use');
  await page.waitForTimeout(400);
  check('Use the T-12’s figures waits: a toast, no sheet, nothing applied', /File the 2 lines still waiting/.test(await toastText()) && (await page.locator('dialog.action-sheet').count()) === 0 && !(await dealNow()).t12.applied, await toastText());

  /* ---- 2. every line */
  await openLines();
  const sheet = await text('#sheet-body');
  check('a remembered label says how often: 6 of your last 7 deals, once to Contract services', /Pylon Sign Lease.*to confirm · Suggested: Other income, mapped this way in 6 of your last 7 deals \(once to Contract services\)/.test(sheet), sheet.slice(0, 400));
  check('a capital line under Expenses: needs classification, suggested below the line', /Roof Replacement Capital.*needs classification · Suggested: below the line, Capital expenditures/.test(sheet), sheet.slice(0, 600));
  check('the mortgage after the file’s NOI is filed by its heading, with no question', /Mortgage Interest.*by its wording/.test(sheet));
  const pylonRow = page.locator('#sheet-body .t12-line', { hasText: 'Pylon Sign Lease' });
  const roofRow = page.locator('#sheet-body .t12-line', { hasText: 'Roof Replacement Capital' });
  const acts = { confirm: pylonRow.locator('[data-act=confirm]'), other: pylonRow.locator('[data-act=other]'), below: roofRow.locator('[data-act=below]'), keep: roofRow.locator('[data-act=keep]'), leave: roofRow.locator('[data-act=leave]') };
  const hs = {};
  for (const [k, loc] of Object.entries(acts)) hs[k] = await height(loc);
  check('every choice is at least 44 pt high', Object.values(hs).every((h) => h >= 43.9), JSON.stringify(hs));
  await page.screenshot({ path: `${SHOTS}t12sug-lines.png` });
  await audit('every line, with a suggestion and a classification', '#sheet');

  // Choose another: a picker; the choice is one history entry; Undo takes it back
  await acts.other.click();
  await pylonRow.locator('select').selectOption('contract');
  await page.waitForFunction(async () => /Contract services/.test(document.querySelector('#sheet-body')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  await settle();
  let d = await dealNow();
  check('Choose another files it under the broker’s choice, one step', lineOf(d, 'Pylon Sign Lease').category === 'contract' && lineOf(d, 'Pylon Sign Lease').how === 'you' && !('suggested' in lineOf(d, 'Pylon Sign Lease')) && /^Undo: T-12: “Pylon Sign Lease” filed under contract services/.test(await undoLabel()), await undoLabel());
  await page.click('#sheet-close');
  await page.keyboard.press('Control+z');
  await settle();
  d = await dealNow();
  check('Undo puts the suggestion back', lineOf(d, 'Pylon Sign Lease').category === null && lineOf(d, 'Pylon Sign Lease').how === 'suggested' && lineOf(d, 'Pylon Sign Lease').suggested.category === 'otherIncome');

  await openLines();
  await page.locator('#sheet-body .t12-line', { hasText: 'Pylon Sign Lease' }).locator('[data-act=confirm]').click();
  await page.waitForFunction(() => /chosen here/.test(document.querySelector('#sheet-body .t12-line')?.parentElement?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  await settle();
  d = await dealNow();
  const lab = (await labels()).entries['pylon sign lease'];
  check('Confirm files it as suggested (Other income) and says "confirmed" in the history', lineOf(d, 'Pylon Sign Lease').category === 'otherIncome' && /^Undo: T-12: “Pylon Sign Lease” confirmed as other income/.test(await undoLabel()), await undoLabel());
  check('and remembers it for this deal once: 8 deals, this one other income, not filed twice', lab.category === 'otherIncome' && lab.deals.length === 8 && lab.deals.filter((x) => x.deal === id).length === 1 && lab.deals.at(-1).deal === id && lab.deals.at(-1).category === 'otherIncome', JSON.stringify(lab.deals?.slice(-2)));

  // Leave unclassified: closes, records nothing, still counts nowhere
  const before = JSON.stringify((await labels()).entries);
  await page.locator('#sheet-body .t12-line', { hasText: 'Roof Replacement Capital' }).locator('[data-act=leave]').click();
  await settle();
  card = await text('#deal-t12');
  check('Leave unclassified closes the sheet and records nothing', (await page.locator('#sheet-body .t12-lines').count()) === 0 && JSON.stringify((await labels()).entries) === before && !('roof replacement capital' in (await labels()).entries));
  check('the roof is still to classify, outside every total; Use is still waiting', /1 to classify/.test(card) && /Not yet filed\$2,500/.test(card), card.slice(0, 500));

  // Keep in operating: operating categories only
  await openLines();
  await page.locator('#sheet-body .t12-line', { hasText: 'Roof Replacement Capital' }).locator('[data-act=keep]').click();
  const groups = await page.locator('#sheet-body .t12-line', { hasText: 'Roof Replacement Capital' }).locator('select optgroup').evaluateAll((xs) => xs.map((x) => x.label));
  check('Keep in operating offers operating categories only', groups.join('|') === 'Operating expenses', groups.join('|'));
  await page.locator('#sheet-body .t12-line', { hasText: 'Roof Replacement Capital' }).locator('select').selectOption('repairs');
  await settle();
  await page.click('#sheet-close');
  card = await text('#deal-t12');
  d = await dealNow();
  check('kept in operating: opex $14,500, NOI $106,100 (the file’s own), nothing left to file', /Operating expenses\$14,500/.test(card) && /NOI\$106,100/.test(card) && !/to classify|to file|to confirm/.test(card) && !('needs' in lineOf(d, 'Roof Replacement Capital')), card.slice(0, 600));
  check('and the history says it was kept in operating', /^Undo: T-12: “Roof Replacement Capital” kept in operating as repairs and maintenance/.test(await undoLabel()), await undoLabel());
  await page.click('#t12-use');
  await page.waitForSelector('dialog.action-sheet', { timeout: 4000 }).catch(() => {});
  check('now Use the T-12’s figures is offered', /Use the T-12’s figures\?/.test(await text('dialog.action-sheet')));
  await page.click('dialog.action-sheet .action-cancel');

  // Below the line: the roof out of NOI; the file’s NOI then disagrees by the roof. (Kept in operating was remembered, so
  // the label is forgotten first: it is read as a new one, asked about by its wording.)
  await page.evaluate(async () => (await import('./app/t12labels.js')).forgetLabel('roof replacement capital'));
  await importFile('t12sug-arcade.csv');
  await openLines();
  await page.locator('#sheet-body .t12-line', { hasText: 'Pylon Sign Lease' }).locator('[data-act=confirm]').click();
  await settle();
  await page.locator('#sheet-body .t12-line', { hasText: 'Roof Replacement Capital' }).locator('[data-act=below]').click();
  await settle();
  await page.click('#sheet-close');
  card = await text('#deal-t12');
  check('below the line: NOI $108,600, and the file’s NOI of $106,100 is a thing to check', /NOI\$108,600/.test(card) && /1 thing to check/.test(card), card.slice(0, 500));

  await importFile('t12sug-zero.csv');
  await page.click('#t12-use');
  await page.waitForTimeout(400);
  check('a suggested line worth $0 still holds “Use” back, by its count', /File the 1 line still waiting/.test(await toastText()) && (await page.locator('dialog.action-sheet').count()) === 0 && /Not yet filed\$0/.test(await text('#deal-t12')), await toastText());

  /* ---- 3. Review */
  await importFile('t12sug-b.csv');
  card = await text('#deal-t12');
  check('statement B: 3 suggestions to confirm', /3 suggestions to confirm/.test(card), card.slice(0, 300));
  await page.click('#t12-review');
  await page.waitForSelector('#review-root .review-item');
  const bulk = page.locator('#review-root [data-act=confirm-all]');
  check('Review offers “Confirm all 3 suggestions…”', (await text('#review-root')).includes('Confirm all 3 suggestions…') && (await bulk.count()) === 1);
  check('and its one-tap targets are 44 pt', (await height(bulk)) >= 43.9 && (await height(page.locator('#review-root [data-act=confirm]'))) >= 43.9);
  await page.screenshot({ path: `${SHOTS}t12sug-review.png` });
  await audit('Review with suggestions', '#review-root');
  check('phone: Review fits the screen', await fits());
  await bulk.click();
  await page.waitForSelector('dialog.action-sheet');
  const listing = await text('dialog.action-sheet');
  const rows = await page.locator('dialog.action-sheet .action-info').count();
  check('the sheet lists the 3 labels before anything is filed, with amounts, categories and counts', rows === 3 && /Lawn Care.*\$45.*2 lines.*Contract services/.test(listing) && /Pylon Sign Lease.*\$150.*Other income/.test(listing) && /Dumpster Hauling.*\$60/.test(listing), listing.slice(0, 600));
  check('and nothing is filed yet', (await dealNow()).t12.lines.filter((l) => !l.category).length === 4);
  await page.locator('dialog.action-sheet .action-item', { hasText: 'Confirm all 3' }).click();
  await settle();
  d = await dealNow();
  const L = await labels();
  check('all four lines are filed, each once, as suggested', d.t12.lines.every((l) => l.category) && lineOf(d, 'Pylon Sign Lease').category === 'otherIncome' && d.t12.lines.filter((l) => l.label === 'Lawn Care').every((l) => l.category === 'contract' && l.how === 'you'));
  check('one history entry', /^Undo: T-12: 3 suggestions confirmed/.test(await undoLabel()), await undoLabel());
  check('each label remembers this deal', ['pylon sign lease', 'lawn care', 'dumpster hauling'].every((k) => L.entries[k].deals.filter((x) => x.deal === id).length === 1));
  check('no line is waiting in Review (only the partial-year check is left)', (await page.locator('#review-root .review-t12line').count()) === 0 && (await page.locator('#review-root [data-act=confirm-all]').count()) === 0);
  await page.evaluate(() => { location.hash = '#deal'; });
  await page.waitForSelector('#deal-t12 #t12-summary');
  await page.keyboard.press('Control+z');
  await settle();
  d = await dealNow();
  check('one Undo puts all three suggestions back', d.t12.lines.filter((l) => !l.category).length === 4 && d.t12.lines.every((l) => l.category || l.how === 'suggested'));
  // one Confirm in Review
  await page.click('#t12-review');
  await page.waitForSelector('#review-root .review-item');
  await page.locator('#review-root .review-item', { hasText: 'Dumpster Hauling' }).locator('[data-act=confirm]').click();
  await page.waitForTimeout(900);
  d = await dealNow();
  check('Confirm on one item files only its label', lineOf(d, 'Dumpster Hauling').category === 'contract' && lineOf(d, 'Pylon Sign Lease').category === null);
  check('the bulk button now says 2', (await text('#review-root')).includes('Confirm all 2 suggestions…'));

  /* ---- 4. a statement filed by 4.7.33 */
  await page.evaluate(async (deal) => {
    const s = await import('./app/store.js'); await s.saveDeal(deal);
    const m = await import('./app/dealui.js'); await m.showDeal(deal.id);
  }, OLD.deals[0]);
  await page.waitForSelector('#deal-t12 #t12-summary');
  await settle();
  card = await text('#deal-t12');
  check('a 4.7.33 statement keeps its totals: NOI $108,600 and nothing to confirm', /NOI\$108,600/.test(card) && !/to confirm|to classify|to file/.test(card), card.slice(0, 600));
  check('and carries one Note naming the two lines, not the mortgage', (await page.locator('#t12-note').count()) === 1 && /Pylon Sign Lease, Roof Replacement Capital/.test(await text('#t12-note')) && !/Mortgage/.test(await text('#t12-note')), await text('#t12-note'));
  check('the Seen button is 44 pt', (await height(page.locator('#t12-note-seen'))) >= 43.9);
  await page.click('#t12-review');
  await page.waitForSelector('#review-root .review-item');
  // Review can draw again as the deal's checks settle: wait for the Note item itself, then let the list settle, before counting
  await page.waitForSelector('#review-root .review-t12note', { timeout: 5000 }).catch(() => {});
  await settle();
  check('Review shows the Note once', (await page.locator('#review-root .review-t12note').count()) === 1 && (await page.locator('#review-root .review-t12note [data-act=note-seen]').count()) === 1);
  await page.locator('#review-root [data-act=note-seen]').click();
  await settle();
  d = await dealNow();
  check('Seen is recorded on the statement, the filings untouched', d.t12.seen['note.earlier'] === true && lineOf(d, 'Pylon Sign Lease').how === 'yours' && lineOf(d, 'Roof Replacement Capital').how === 'rule', JSON.stringify(d.t12.seen));
  check('and Seen is one history entry', /^Undo: T-12: a note marked seen/.test(await undoLabel() || ''), await undoLabel());
  await page.evaluate(() => { location.hash = '#deal'; });
  await page.waitForSelector('#deal-t12 #t12-summary');
  check('the Note is gone from the card', (await page.locator('#t12-note').count()) === 0);
  check('phone: nothing overflows the screen', await fits());
} catch (e) {
  check('the flow ran to its end', false, String(e && e.stack || e).slice(0, 600));
} finally {
  check('no page errors', !errors.length, errors.slice(0, 3).join(' / '));
  fs.writeFileSync(`${SHOTS}t12sug-flow.json`, JSON.stringify(R, null, 1));
  for (const r of R) console.log(r.join(' | '));
  finish(R, 'errors', errors);
  await P.browser.close();
  cleanup(); // a stray .xlsx or .csv in files/ would be picked up by the LibreOffice recalculation
}
process.exit(R.some((r) => r[0] === 'FAIL') ? 1 : 0);
