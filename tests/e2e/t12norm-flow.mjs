/* Underwriting PR U2 "Normalised NOI" on the T-12 tab, in the browser, on the invented statement U
 * (tests/fixtures/t12-normalise-fixtures.js, worked by hand there), at iPhone size and on a desktop page:
 *   1. every line starts "Counts: as reported", the list is the reported NOI twice, "Use normalised figures" is
 *      disabled with its reason; the chip's sheet shows each method's annual amount, Annualise withheld in words until
 *      N is answered; "Counts: typical month × 12" moves the bridge (one step, one history entry) and Undo restores it;
 *   2. example 3: the bridge of three annualised income lines, two typical-month expense lines and one excluded line,
 *      to a normalised NOI of $106,569 beside the reported $56,290 (which never moves); Use goes through the
 *      confirmation (each figure old → new, the source label), Cancel changes nothing, Use puts the figures in, Undo
 *      puts them back;
 *   3. held states in words, never a number: N asked again after a saved method, a line still to file, a month in two
 *      columns; Use is disabled with the reason each time;
 *   4. 44 pt targets, the card fits the screen, axe in light and dark.
 * Each check fails on 4.7.37 (no card). The invented files are removed when the flow ends. */
import fs from 'fs';
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
import { uRows } from '../fixtures/t12-normalise-fixtures.js';
import { dupRows } from '../fixtures/t12-period-fixtures.js';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const MADE = ['t12norm-u.csv', 't12norm-open.csv', 't12norm-dup.csv'];
const cleanup = () => { for (const f of MADE) fs.rmSync(F + f, { force: true }); };
const csv = (rows) => rows.map((x) => x.cells.join(',')).join('\n');
cleanup();
fs.writeFileSync(`${F}t12norm-u.csv`, csv(uRows()));
{
  // the same statement with one more expense line that no rule can place
  const rows = uRows();
  const i = rows.findIndex((r) => r.cells[0] === 'Legal');
  rows.splice(i + 1, 0, { ...rows[i], cells: ['Zorblax', ...rows[i].cells.slice(1)] });
  fs.writeFileSync(`${F}t12norm-open.csv`, csv(rows));
}
fs.writeFileSync(`${F}t12norm-dup.csv`, csv(dupRows()));

const text = async (P, sel) => ((await P.page.locator(sel).count()) ? (await P.page.textContent(sel)).replace(/\s+/g, ' ').trim() : '');
const run = async (P, name) => {
  const { page } = P;
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const dealId = () => page.evaluate(() => localStorage.getItem('zlatura.deal.current'));
  const db = (store, key) => page.evaluate(([s, k]) => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction(s).objectStore(s).get(k); g.onsuccess = () => res(g.result); }; }), [store, key]);
  const dealNow = async () => db('deals', await dealId());
  const settle = () => page.waitForTimeout(700);
  const undoLabel = () => page.getAttribute('#deal-undo', 'aria-label');
  const height = async (loc) => (await loc.first().boundingBox())?.height || 0;
  const t = (sel) => text(P, sel);
  const c = (n, ok, d) => check(`${name}: ${n}`, ok, ok ? '' : String(d ?? '').slice(0, 700));
  async function importFile(file) {
    const btn = (await page.locator('#t12-replace').count()) ? '#t12-replace' : '#t12-import';
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(btn)]);
    await fc.setFiles(F + file);
    await page.waitForFunction((n) => (document.querySelector('#deal-t12')?.textContent || '').includes(n), file, { timeout: 12000 });
    await settle();
  }
  async function audit(what, scope) {
    await page.waitForTimeout(450);
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
    const res = await page.evaluate(async (sc) => {
      const r = await window.axe.run(sc ? document.querySelector(sc) : document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] });
      return r.violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    }, scope);
    c(`axe: ${what}`, res.length === 0, res.join('\n    '));
  }
  const bothModes = async (what, scope) => {
    await audit(what, scope);
    await page.emulateMedia({ colorScheme: 'dark' });
    await audit(`${what}, dark`, scope);
    await page.emulateMedia({ colorScheme: 'light' });
  };
  const sheetText = () => t('dialog.action-sheet');
  const chip = (label) => page.locator('#t12-norm .t12-nline', { hasText: label }).locator('.t12-chip');
  const openLines = async () => { if (!(await page.locator('#t12-norm-lines').evaluate((e) => e.open))) await page.click('#t12-norm-lines summary'); };
  /** Open a line's sheet, return the text of its items, then choose `method` ('' = leave it open). */
  async function pick(label, method) {
    await openLines();
    await chip(label).click();
    await page.waitForSelector('dialog.action-sheet .action-item');
    if (!method) return;
    await page.locator('dialog.action-sheet .action-item', { hasText: method }).first().click();
    await settle();
  }
  const bridge = () => t('#t12-bridge');
  const methodOf = async (label) => { const l = (await dealNow()).t12.lines.find((x) => x.label === label); return l && 'method' in l ? l.method : '(none)'; };
  const stepKeys = () => page.evaluate(() => [...document.querySelectorAll('#t12-bridge li')].map((li) => li.dataset.step));

  await page.goto(BASE + '#deal', { waitUntil: 'load' });
  await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
  await page.waitForSelector('#deal-t12 #t12-import');

  /* ---- 1. the default is today's screen; one chip changes the bridge; Undo restores it */
  await importFile('t12norm-u.csv');
  let card = await t('#t12-norm');
  c('the Normalised NOI card sits under the totals', /Normalised NOI/.test(card) && (await page.evaluate(() => { const a = document.querySelector('#t12-summary'); const b = document.querySelector('#t12-norm'); return !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)); })), card.slice(0, 200));
  c('with nothing chosen the list is the reported NOI twice: $56,290 and $56,290', JSON.stringify(await stepKeys()) === '["reported","normalised"]' && /NOI as reported \(12 months\)\$56,290Normalised NOI \(a year\)\$56,290/.test(await bridge()), await bridge());
  c('the totals table still says NOI $56,290', /NOI\$56,290/.test(await t('#t12-summary')), await t('#t12-summary'));
  c('Use normalised figures is disabled, with its reason in words', (await page.locator('#t12-norm-use').isDisabled()) && /Every line counts as reported/.test(await t('#t12-norm-why')), await t('#t12-norm-why'));
  const figs0 = JSON.stringify((await dealNow()).figures);
  await openLines();
  const chips = await page.locator('#t12-norm .t12-chip').allTextContents();
  c('six NOI lines, each "Counts: as reported"', chips.length === 6 && chips.every((x) => x === 'Counts: as reported'), chips.join('|'));
  c('the chip is a 44 pt target', (await height(page.locator('#t12-norm .t12-chip'))) >= 43.9, String(await height(page.locator('#t12-norm .t12-chip'))));
  await pick('Repairs', '');
  const sh = await sheetText();
  c('the sheet lists the four methods, each with its annual amount', /As reported.*\$5,010\.00 as reported/.test(sh) && /Typical month × 12.*\$4,860\.00 a year/.test(sh) && /Exclude.*\$0\.00 a year/.test(sh) && /Annualise/.test(sh), sh);
  c('Annualise is withheld in words until N is answered', (await page.locator('dialog.action-sheet .action-item', { hasText: 'Annualise' }).isDisabled()) && /Not yet: 5 of its 12 months have no activity on any line/.test(sh), sh);
  c('the sheet never says "run rate" for the typical month', !/run.?rate/i.test(sh), sh);
  c('its choices are 44 pt targets', (await height(page.locator('dialog.action-sheet .action-item'))) >= 43.9);
  await bothModes('the method sheet', 'dialog.action-sheet');
  const steps0 = await undoLabel();
  await page.locator('dialog.action-sheet .action-item', { hasText: 'Typical month × 12' }).click();
  await settle();
  let d = await dealNow();
  c('Repairs counts typical month × 12: the chip says so, stored as runRate', (await chip('Repairs').textContent()) === 'Counts: typical month × 12' && (await methodOf('Repairs')) === 'runRate', await chip('Repairs').textContent());
  c('the bridge moves: one typical-month step +$150, normalised NOI $56,440', JSON.stringify(await stepKeys()) === '["reported","runRate.expense","normalised"]' && /Typical month × 12 expense lines \(1\)Repairs\+\$150Normalised NOI \(a year\)\$56,440/.test(await bridge()), await bridge());
  c('the reported NOI is where it was, $56,290, in the totals and in the list', /NOI\$56,290/.test(await t('#t12-summary')) && /NOI as reported \(12 months\)\$56,290/.test(await bridge()));
  c('one history step, worded', /^Undo: T-12: “Repairs” counts typical month × 12/.test(await undoLabel()) && (await undoLabel()) !== steps0, await undoLabel());
  c('nothing on the deal moved', JSON.stringify(d.figures) === figs0, JSON.stringify(d.figures));
  await page.keyboard.press('Control+z');
  await settle();
  d = await dealNow();
  c('Undo restores it: as reported, no method stored, the list is two rows again', (await chip('Repairs').textContent()) === 'Counts: as reported' && (await methodOf('Repairs')) === '(none)' && JSON.stringify(await stepKeys()) === '["reported","normalised"]', await methodOf('Repairs'));
  // choosing "as reported" again deletes the field
  await pick('Repairs', 'Typical month × 12');
  await pick('Repairs', 'As reported');
  c('choosing As reported again removes the field and is its own step', (await methodOf('Repairs')) === '(none)' && /^Undo: T-12: “Repairs” counts as reported/.test(await undoLabel()), `${await methodOf('Repairs')} ${await undoLabel()}`);
  await page.keyboard.press('Control+z');
  await settle();
  await page.keyboard.press('Control+z');
  await settle();
  c('and two Undos return to the start', (await methodOf('Repairs')) === '(none)' && (await undoLabel()) === steps0, await undoLabel());

  /* ---- 2. example 3: the bridge, and Use normalised figures through its confirmation */
  const win = page.locator('#deal-t12qc [data-fix="win:active"], #t12-norm [data-fix="win:active"]').first();
  c('answering N is a button in Data QC', (await win.count()) === 1);
  await win.click();
  await settle();
  for (const [label, m] of [['Base Rent', 'Annualise'], ['Parking', 'Annualise'], ['Storage', 'Annualise'], ['Repairs', 'Typical month × 12'], ['Real Estate Taxes', 'Typical month × 12'], ['Legal', 'Exclude']]) await pick(label, m);
  card = await t('#t12-norm');
  c('the bridge: as reported $56,290, annualised +$51,429, typical month −$2,350, excluded +$1,200, normalised $106,569',
    JSON.stringify(await stepKeys()) === '["reported","annualise.income","runRate.expense","exclude.expense","normalised"]'
    && /NOI as reported \(12 months\)\$56,290.*Annualised income lines \(3\)Base Rent, Parking, Storage\+\$51,429.*Typical month × 12 expense lines \(2\)Repairs, Real Estate Taxes−\$2,350.*Excluded expense lines \(1\)Legal\+\$1,200.*Normalised NOI \(a year\)\$106,569/.test(card), card);
  c('the rounding Note names the cent', /rounded once.*income −\$0\.01/.test(await t('#t12-norm-note')), await t('#t12-norm-note'));
  c('the as-reported NOI is still $56,290 in the totals, the deal still blank', /NOI\$56,290/.test(await t('#t12-summary')) && JSON.stringify((await dealNow()).figures) === figs0);
  const use = page.locator('#t12-norm-use');
  c('Use normalised figures is enabled and a 44 pt target', !(await use.isDisabled()) && (await height(use)) >= 43.9, String(await height(use)));
  await page.locator('#t12-norm').screenshot({ path: `${SHOTS}t12norm-${name}.png` });
  c('the card fits the screen', await fits());
  await bothModes('the Normalised NOI card with its lines', '#t12-norm');
  const stepsBeforeUse = await undoLabel();
  await use.click();
  await page.waitForSelector('dialog.action-sheet .action-item');
  const conf = await sheetText();
  c('the confirmation shows each figure old → new', /Gross income \(EGI\): — → \$123,429/.test(conf) && /Operating expenses: — → \$16,860/.test(conf) && /Real estate taxes: — → \$12,000/.test(conf) && /NOI, normalised: — → \$106,569/.test(conf), conf);
  c('with the source label and the reported NOI beside it', /T-12, normalised: 3 lines annualised, 2 lines typical month × 12, 1 excluded, N = 7\./.test(conf) && /NOI as reported \(\$56,290\) stays on the T-12 card/.test(conf), conf);
  await bothModes('the confirmation', 'dialog.action-sheet');
  await page.locator('dialog.action-sheet .action-cancel').click();
  await settle();
  c('Cancel changes nothing: no figure, no step', JSON.stringify((await dealNow()).figures) === figs0 && (await undoLabel()) === stepsBeforeUse && !(await dealNow()).t12.applied);
  await use.click();
  await page.waitForSelector('dialog.action-sheet .action-item');
  await page.locator('dialog.action-sheet .action-item', { hasText: 'Use them' }).first().click();
  await settle();
  d = await dealNow();
  c('Use puts the four normalised figures on the deal', d.figures.gross === 123428.61 && d.figures.opex === 16860 && d.figures.taxes === 12000 && d.figures.noi === 106568.61, JSON.stringify(d.figures));
  c('each marked T-12 with the label', ['gross', 'opex', 'taxes', 'noi'].every((k) => d.sources[k].t12 && d.sources[k].line === 'T-12, normalised: 3 lines annualised, 2 lines typical month × 12, 1 excluded, N = 7' && d.sources[k].normalised === true), JSON.stringify(d.sources.noi));
  c('t12.applied says it was normalised, with the counts', d.t12.applied.normalised === true && d.t12.applied.counts.annualise === 3 && d.t12.applied.counts.runRate === 2 && d.t12.applied.counts.exclude === 1 && d.t12.applied.before.noi == null, JSON.stringify(d.t12.applied));
  c('one step, worded', /^Undo: Used the T-12’s normalised figures \(3 lines annualised, 2 lines typical month × 12, 1 excluded, N = 7;/.test(await undoLabel()), await undoLabel());
  c('the reported NOI stays visible beside it: $56,290 in the totals and the list', /NOI\$56,290/.test(await t('#t12-summary')) && /NOI as reported \(12 months\)\$56,290/.test(await bridge()));
  await page.keyboard.press('Control+z');
  await settle();
  d = await dealNow();
  c('Undo puts the earlier figures back and keeps the methods', JSON.stringify(d.figures) === figs0 && !d.t12.applied && (await methodOf('Legal')) === 'exclude', JSON.stringify(d.figures));

  /* ---- 3. held states, in words */
  // N asked again with a method saved on a line: the saved method waits, no number
  await page.evaluate(async () => {
    const id = localStorage.getItem('zlatura.deal.current');
    await new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const s = r.result.transaction('deals', 'readwrite').objectStore('deals'); const g = s.get(id); g.onsuccess = () => { const v = g.result; delete v.t12.window; s.put(v, id).onsuccess = () => res(); }; }; });
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#t12-norm');
  await settle();
  card = await t('#t12-norm');
  c('a saved annualise with N unanswered: "Not worked out", why in words, no normalised number', /Not worked out: 5 of its 12 months have no activity on any line/.test(card) && /Normalised NOI \(a year\)not worked out/.test(card) && !/\$106,569/.test(card), card);
  c('the as-reported NOI is still shown', /NOI as reported \(12 months\)\$56,290/.test(card));
  c('Use is disabled and says why', (await page.locator('#t12-norm-use').isDisabled()) && /^Held: 5 of its 12 months/.test(await t('#t12-norm-why')), await t('#t12-norm-why'));
  const fix = page.locator('#t12-norm [data-fix="win:active"]');
  c('the fix is a button right there, 44 pt high', (await fix.count()) === 1 && (await height(fix)) >= 43.9, String(await height(fix)));
  await bothModes('the held card', '#t12-norm');
  await fix.click();
  await settle();
  c('answering it brings the bridge back', /Normalised NOI \(a year\)\$106,569/.test(await t('#t12-norm')) && !(await page.locator('#t12-norm-held').count()) && !(await page.locator('#t12-norm-use').isDisabled()), await t('#t12-norm'));

  // a line still to file
  await importFile('t12norm-open.csv');
  await openLines();
  c('an open line has no chip (it counts in no total)', (await page.locator('#t12-norm .t12-chip').count()) === 6);
  await page.locator('#deal-t12qc [data-fix="win:active"]').first().click().catch(() => {});
  await settle();
  await pick('Legal', 'Exclude');
  c('with a line still to file, Use is disabled with the reason', (await page.locator('#t12-norm-use').isDisabled()) && /^File the 1 line still waiting in Review first/.test(await t('#t12-norm-why')), await t('#t12-norm-why'));

  // a month in two columns: the totals are held, and so is everything built on them
  await importFile('t12norm-dup.csv');
  card = await t('#t12-norm');
  c('totals held: the card says why in words, with no number and no list', /Not worked out: a period check holds the totals/.test(card) && !/\$\d/.test(card) && !(await page.locator('#t12-bridge').count()), card);
  c('and Use is disabled with the reason', (await page.locator('#t12-norm-use').isDisabled()) && /^Held: a period check holds the totals/.test(await t('#t12-norm-why')), await t('#t12-norm-why'));
  await bothModes('the held-by-totals card', '#t12-norm');
  c(`no overflow on ${name}`, await fits());
};

const P = await phone();
const D = await phone({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 });
try {
  await run(P, 'phone');
  await run(D, 'desktop');
} catch (e) {
  check('the flow ran to its end', false, String(e && e.stack || e).slice(0, 700));
} finally {
  const errors = [...P.errors, ...D.errors];
  check('no page errors', !errors.length, errors.slice(0, 3).join(' / '));
  fs.writeFileSync(`${SHOTS}t12norm-flow.json`, JSON.stringify(R, null, 1));
  for (const r of R) console.log(r.join(' | '));
  finish(R, 'errors', errors);
  await P.browser.close();
  await D.browser.close();
  cleanup(); // a stray .csv in files/ would be picked up by the LibreOffice recalculation
}
process.exit(R.some((r) => r[0] === 'FAIL') ? 1 : 0);
