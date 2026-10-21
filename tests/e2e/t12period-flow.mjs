/* T-12 PR 3a "Period structure and the T-12 Data QC panel" in the browser, at iPhone size, on invented statements
 * (tests/fixtures/t12-period-fixtures.js, worked by hand there):
 *   1. a month heading two columns: the panel shows a Fail in words, the card shows "held" instead of the figures,
 *      "Use the T-12's figures" says why, Review has the item with its level, where and fixes; choosing a column
 *      (NOI $113,850) is one history entry that Undo takes back;
 *   2. a 15-month file: split at import (latest 12 are the T-12, the rest the prior period), "Change…" picks
 *      other months; a 4.7.34 statement of 15 months is held until chosen;
 *   3. columns that look like running totals: asked, held; "Running totals" gives NOI $43,600 ("NOI, 6 months");
 *   4. a month with no activity: Annualise is withheld until the question is answered, then NOI $114,000;
 *   5. every target is 44 pt; axe on the panel and on Review; nothing overflows the phone.
 * Each check fails on 4.7.34. The invented files are removed when the flow ends. */
import fs from 'fs';
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
import { dupRows, fifteenRows, cumulativeRows, partialRows } from '../fixtures/t12-period-fixtures.js';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const OLD = JSON.parse(fs.readFileSync(new URL('../fixtures/backup-4.7.34-before-t12-periods.json', import.meta.url), 'utf8'));
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const MADE = ['t12period-dup.csv', 't12period-long.csv', 't12period-cum.csv', 't12period-gap.csv'];
const cleanup = () => { for (const f of MADE) fs.rmSync(F + f, { force: true }); };
const csv = (rows) => rows.map((x) => x.cells.join(',')).join('\n');
cleanup();
fs.writeFileSync(`${F}t12period-dup.csv`, csv(dupRows()));
fs.writeFileSync(`${F}t12period-long.csv`, csv(fifteenRows()));
fs.writeFileSync(`${F}t12period-cum.csv`, csv(cumulativeRows()));
fs.writeFileSync(`${F}t12period-gap.csv`, csv(partialRows()));

const P = await phone();
const { page, errors } = P;
const text = async (sel) => ((await page.locator(sel).count()) ? (await page.textContent(sel)).replace(/\s+/g, ' ').trim() : '');
const toastText = () => page.evaluate(() => document.querySelector('.toast')?.textContent || '');
const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const dealId = () => page.evaluate(() => localStorage.getItem('zlatura.deal.current'));
const db = (store, key) => page.evaluate(([s, k]) => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction(s).objectStore(s).get(k); g.onsuccess = () => res(g.result); }; }), [store, key]);
const dealNow = async () => db('deals', await dealId());
const settle = () => page.waitForTimeout(700);
const undoLabel = () => page.getAttribute('#deal-undo', 'aria-label');
const height = async (loc) => (await loc.first().boundingBox())?.height || 0;
async function importFile(name) {
  const btn = (await page.locator('#t12-replace').count()) ? '#t12-replace' : '#t12-import';
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(btn)]);
  await fc.setFiles(F + name);
  await page.waitForFunction((n) => (document.querySelector('#deal-t12')?.textContent || '').includes(n), name, { timeout: 12000 });
  await settle();
}
async function audit(name, scope) {
  await page.waitForTimeout(450);
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async (sc) => {
    const r = await window.axe.run(sc ? document.querySelector(sc) : document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }, scope);
  check(`axe: ${name}`, res.length === 0, res.join('\n    '));
}
const fix = (id) => page.locator(`#deal-t12qc [data-fix="${id}"]`);

try {
  await page.goto(BASE + '#deal', { waitUntil: 'load' });
  await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
  await page.waitForSelector('#deal-t12 #t12-import');

  /* ---- 1. a month in two columns */
  await importFile('t12period-dup.csv');
  let card = await text('#deal-t12');
  check('the card says the figures are held, in words', /Held back: Dec 2025 is in two columns/.test(card) && (await page.getAttribute('#t12-held', 'role')) === 'status', card.slice(0, 400));
  check('the summary shows "held", never the figure that counts December twice', /Effective gross income\s*held: Dec 2025 is in two columns/.test(card) && !/\$130,000|\$123,350|\$6,650/.test(card), card.slice(0, 700));
  const panel = await text('#deal-t12qc');
  check('the Data QC panel shows a Fail in words, with the month, the columns and both sums', /Fail/.test(panel) && /Dec 2025 heads two columns \(M and N\)/.test(panel) && /M adds up to \$10,500 and N adds up to \$10,650/.test(panel), panel.slice(0, 500));
  check('and the card counts it as a thing to check', /1 thing to check/.test(card), card.slice(0, 300));
  await page.click('#t12-use');
  await page.waitForTimeout(400);
  check('“Use the T-12’s figures” says why it waits: a toast, no sheet', /Held: Dec 2025 is in two columns/.test(await toastText()) && (await page.locator('dialog.action-sheet').count()) === 0, await toastText());
  const colM = fix('col:2025-12:0'); const colN = fix('col:2025-12:1');
  check('the fix buttons are at least 44 pt high', (await height(colM)) >= 43.9 && (await height(colN)) >= 43.9, `${await height(colM)} ${await height(colN)}`);
  check('there is no "accept as read" for a month counted twice', (await page.locator('#deal-t12qc button', { hasText: /Accept|It’s right|Seen/ }).count()) === 0);
  await page.locator('#deal-t12').screenshot({ path: `${SHOTS}t12period-dup.png` });
  await audit('the held card and the Data QC panel', '#deal-t12');
  check('phone: the card fits the screen', await fits());

  // Review: the item with its level, where it is and the fixes
  await page.click('#t12-review');
  await page.waitForSelector('#review-root .review-t12check');
  const item = page.locator('#review-root .review-t12check', { hasText: 'Dec 2025' });
  const rv = (await item.textContent()).replace(/\s+/g, ' ');
  check('Review: “T-12 check failed”, where (columns M and N), and one button per column', /T-12 check failed: Dec 2025 heads two columns/.test(rv) && /columns M and N/.test(rv) && (await item.locator('[data-fix]').count()) === 2, rv.slice(0, 300));
  check('and its buttons are 44 pt', (await height(item.locator('[data-fix]'))) >= 43.9);
  await audit('Review with a T-12 Fail', '#review-root');
  await page.screenshot({ path: `${SHOTS}t12period-review.png` });
  await item.locator('[data-fix="col:2025-12:1"]').click();
  await settle();
  let d = await dealNow();
  check('choosing column N in Review: repairs 6,150.00, one step', d.t12.months.length === 12 && d.t12.lines.find((l) => l.label === 'Repairs and Maintenance').total === 6150 && /^Undo: T-12: Use column N for Dec 2025/.test(await undoLabel()), await undoLabel());
  await page.evaluate(() => { location.hash = '#deal'; });
  await page.waitForSelector('#deal-t12 #t12-summary');
  card = await text('#deal-t12');
  check('the card now shows NOI $113,850 and nothing held', /NOI\$113,850/.test(card) && !/Held back/.test(card) && /Effective gross income\$120,000/.test(card), card.slice(0, 600));
  check('and the panel keeps the choice, changeable', /column N is counted, column M is not \(your choice\)/.test(await text('#deal-t12qc, #deal-t12qc-fold')) && (await page.locator('#deal-t12qc-fold [data-fix="change"], #deal-t12qc [data-fix="change"]').count()) >= 1);
  await page.keyboard.press('Control+z');
  await settle();
  d = await dealNow();
  card = await text('#deal-t12');
  check('Undo puts the month back in two columns, held again', d.t12.months.length === 13 && /Held back: Dec 2025/.test(card) && !/\$113,850/.test(card), card.slice(0, 300));
  await colM.click();
  await settle();
  card = await text('#deal-t12');
  d = await dealNow();
  check('choosing column M on the card: NOI $114,000, the other column kept aside', /NOI\$114,000/.test(card) && d.t12.period.dropped.length === 1 && /^Undo: T-12: Use column M for Dec 2025/.test(await undoLabel()), card.slice(0, 400));

  /* ---- 2. more than 12 months */
  await importFile('t12period-long.csv');
  card = await text('#deal-t12');
  check('15 months: the latest 12 are the T-12 (NOI $108,000), nothing held', /NOI\$108,000/.test(card) && !/Held back/.test(card), card.slice(0, 500));
  const note = await text('#deal-t12qc, #deal-t12qc-fold');
  check('and the note says which 12 and where the rest went', /15 months: the latest 12 \(Jan 2025 to Dec 2025\) are the T-12; Oct 2024 to Dec 2024 are kept as the prior period/.test(note), note.slice(0, 500));
  d = await dealNow();
  check('stored: chosen by "latest", the prior months and the prior totals', d.t12.period.chosen.by === 'latest' && d.t12.period.prior.months.length === 3 && d.t12.lines[0].prior.total === 27000);
  await page.locator('#deal-t12 summary', { hasText: 'Data QC: T-12' }).click().catch(() => {});
  await page.locator('#deal-t12qc [data-fix="change"]').click();
  await page.waitForSelector('dialog.action-sheet');
  const opts = await text('dialog.action-sheet');
  check('“Change…” lists the other 12-month windows', /Use Oct 2024 to Sep 2025/.test(opts) && /Use Nov 2024 to Oct 2025/.test(opts), opts.slice(0, 300));
  await page.waitForTimeout(500);
  const ih = await height(page.locator('dialog.action-sheet .action-item'));
  check('and the sheet’s choices are 44 pt', ih >= 43.9, String(ih));
  await page.locator('dialog.action-sheet .action-item', { hasText: 'Oct 2024 to Sep 2025' }).click();
  await settle();
  card = await text('#deal-t12');
  d = await dealNow();
  check('choosing Oct 2024 to Sep 2025: NOI $105,000, chosen by you, one step', /NOI\$105,000/.test(card) && d.t12.period.chosen.by === 'you' && /^Undo: T-12: Use Oct 2024 to Sep 2025/.test(await undoLabel()), `${card.slice(0, 300)} ${await undoLabel()}`);

  // a statement saved by 4.7.34, 15 months read as a year
  await page.evaluate(async (deal) => {
    const s = await import('./app/store.js'); await s.saveDeal(deal);
    const m = await import('./app/dealui.js'); await m.showDeal(deal.id);
  }, OLD.deals[2]);
  await page.waitForSelector('#deal-t12 #t12-summary');
  await settle();
  card = await text('#deal-t12');
  check('a 4.7.34 statement of 15 months is held: not shown as a year, and not rewritten', /Held back: 15 months, not 12/.test(card) && !/\$147,000|\$132,000/.test(await text('#t12-summary')) && (await dealNow()).t12.months.length === 15, card.slice(0, 400));
  await page.click('#t12-use');
  await page.waitForTimeout(400);
  check('and “Use” will not put it in as a year', /Held: 15 months, not 12/.test(await toastText()) && (await page.locator('dialog.action-sheet').count()) === 0, await toastText());
  await fix('months:2025-01').click();
  await settle();
  card = await text('#deal-t12');
  check('choosing the latest 12 releases the figures: NOI $108,000', /NOI\$108,000/.test(card) && !/Held back/.test(card), card.slice(0, 400));

  /* ---- 3. running totals */
  await importFile('t12period-cum.csv');
  card = await text('#deal-t12');
  const q = await text('#deal-t12qc');
  check('running totals: asked, and held', /Are the columns monthly or cumulative\?/.test(q) && /Held back: the columns may be running totals/.test(card), q.slice(0, 500));
  check('both NOIs are shown on the answers', /Monthly columns \(NOI \$164,800\)/.test(await text('#deal-t12qc [data-fix="cols:monthly"]')) && /Running totals \(NOI \$43,600\)/.test(await text('#deal-t12qc [data-fix="cols:cumulative"]')));
  await fix('cols:cumulative').click();
  await settle();
  card = await text('#deal-t12');
  d = await dealNow();
  check('“Running totals”: NOI, 6 months $43,600', /NOI, 6 months\$43,600/.test(card) && !/Held back/.test(card) && d.t12.period.columnsAre === 'cumulative', card.slice(0, 500));
  check('one step', /^Undo: T-12: Running totals \(NOI \$43,600\)/.test(await undoLabel()), await undoLabel());
  await page.keyboard.press('Control+z');
  await settle();
  check('Undo asks again', /Held back: the columns may be running totals/.test(await text('#deal-t12')));
  await audit('the running-totals question', '#deal-t12qc');

  /* ---- 4. a month with no activity */
  await importFile('t12period-gap.csv');
  card = await text('#deal-t12');
  check('a month with no activity: figures shown (not held), NOI, 6 months $47,500', /NOI, 6 months\$47,500/.test(card) && !/Held back/.test(card), card.slice(0, 400));
  const aq = await text('#deal-t12qc');
  check('the question is in the panel, in words', /Mar 2025 has no activity on any line/.test(aq) && /5 months with activity of 6 columns/.test(aq), aq.slice(0, 500));
  await page.click('#t12-use');
  await page.waitForSelector('dialog.action-sheet');
  check('Annualise is withheld until it is answered', (await page.locator('dialog.action-sheet .action-item', { hasText: 'Annualize it' }).isDisabled()) && /Not yet/.test(await text('dialog.action-sheet')), (await text('dialog.action-sheet')).slice(0, 300));
  await page.locator('dialog.action-sheet .action-cancel').click();
  await fix('win:active').click();
  await settle();
  d = await dealNow();
  check('answered “5 months with activity”: stored as the window, one step', d.t12.window.n === 5 && d.t12.window.how === 'active' && /^Undo: T-12: Over 5 months with activity/.test(await undoLabel()), JSON.stringify(d.t12.window));
  check('and the panel says N = 5', /N = 5, Mar 2025 had no activity \(your choice\)/.test(await text('#deal-t12qc, #deal-t12qc-fold')));
  await page.click('#t12-use');
  await page.waitForSelector('dialog.action-sheet');
  await page.locator('dialog.action-sheet .action-item', { hasText: 'Annualize it' }).click();
  await page.waitForFunction(() => /Annualize 5 months/.test(document.querySelector('dialog.action-sheet')?.textContent || ''), null, { timeout: 4000 });
  const ann = await text('dialog.action-sheet');
  check('annualising over 5 months: EGI $120,000, NOI $114,000', /Gross income \(EGI\): [^→]+→ \$120,000/.test(ann) && /NOI, annualized: [^→]+→ \$114,000/.test(ann), ann.slice(0, 500));
  await page.locator('dialog.action-sheet .action-item', { hasText: 'Annualize and use them' }).first().click();
  await settle();
  d = await dealNow();
  check('the deal holds $114,000, annualized × 12 ÷ 5', d.figures.noi === 114000 && d.figures.gross === 120000 && d.t12.applied.annualized === 5, JSON.stringify([d.figures.noi, d.figures.gross, d.t12.applied]));
  check('phone: nothing overflows the screen', await fits());
} catch (e) {
  check('the flow ran to its end', false, String(e && e.stack || e).slice(0, 600));
} finally {
  check('no page errors', !errors.length, errors.slice(0, 3).join(' / '));
  fs.writeFileSync(`${SHOTS}t12period-flow.json`, JSON.stringify(R, null, 1));
  for (const r of R) console.log(r.join(' | '));
  finish(R, 'errors', errors);
  await P.browser.close();
  cleanup(); // a stray .csv in files/ would be picked up by the LibreOffice recalculation
}
process.exit(R.some((r) => r[0] === 'FAIL') ? 1 : 0);
