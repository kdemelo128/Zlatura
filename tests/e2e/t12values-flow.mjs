/* T-12 PR 3b "Value flags, thresholds and run rate" in the browser, on invented statements
 * (tests/fixtures/t12-values-fixtures.js, worked by hand there), at iPhone size and on a desktop page:
 *   1. a year with a spike, a refund, a negative month and a large one-off: the panel says Check and Note in words,
 *      Review has the three warnings and not the notes, Seen clears one (one step); "Recurring? No" puts "NOI without
 *      the one-offs you marked" ($190,700) under the reported NOI ($142,700), which does not move; Undo takes it
 *      away; "Not sure" stores nothing and adds no step;
 *   2. a 6-month statement: "Show a run rate" on request, headed "run rate: 6 months × 2, not a T-12", the lump
 *      payment named and the OM's NOI compared; "Use the T-12's figures" and the deal's figures are untouched;
 *   3. columns headed by quarter-end dates: Annualize waits for "They are single months", then offers $342,000;
 *   4. Settings: the number boxes are 44 pt, axe light and dark; and a 300-line statement answers an edit in 150 ms.
 * Each check fails on 4.7.35. The invented files are removed when the flow ends. */
import fs from 'fs';
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
import { valueRows, t6Rows, quarterEndRows } from '../fixtures/t12-values-fixtures.js';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const MADE = ['t12values-a.csv', 't12values-t6.csv', 't12values-qend.csv', 't12values-big.csv'];
const cleanup = () => { for (const f of MADE) fs.rmSync(F + f, { force: true }); };
const csv = (rows) => rows.map((x) => x.cells.join(',')).join('\n');
cleanup();
fs.writeFileSync(`${F}t12values-a.csv`, csv(valueRows()));
fs.writeFileSync(`${F}t12values-t6.csv`, csv(t6Rows()));
fs.writeFileSync(`${F}t12values-qend.csv`, csv(quarterEndRows()));
// 300 lines, 12 months each: rent, then 299 small expense lines, every 30th with one large month (a spike over 0.5% of EGI)
{
  const rows = ['Account,' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => `${m} 2026`).join(',') + ',Total', 'Income', 'Base Rent,' + Array(12).fill(100000).join(',') + ',1200000', 'Expenses'];
  for (let i = 1; i < 300; i++) {
    const v = Array(12).fill(100 + i);
    if (i % 30 === 0) v[i % 12] = 20000;
    rows.push(`Expense item ${i},${v.join(',')},${v.reduce((s, x) => s + x, 0)}`);
  }
  fs.writeFileSync(`${F}t12values-big.csv`, rows.join('\n'));
}

const text = async (P, sel) => ((await P.page.locator(sel).count()) ? (await P.page.textContent(sel)).replace(/\s+/g, ' ').trim() : '');
const run = async (P, name) => {
  const { page } = P;
  const toastText = () => page.evaluate(() => document.querySelector('.toast')?.textContent || '');
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const dealId = () => page.evaluate(() => localStorage.getItem('zlatura.deal.current'));
  const db = (store, key) => page.evaluate(([s, k]) => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction(s).objectStore(s).get(k); g.onsuccess = () => res(g.result); }; }), [store, key]);
  const dealNow = async () => db('deals', await dealId());
  const settle = () => page.waitForTimeout(700);
  const undoLabel = () => page.getAttribute('#deal-undo', 'aria-label');
  const height = async (loc) => (await loc.first().boundingBox())?.height || 0;
  const t = (sel) => text(P, sel);
  const c = (n, ok, d) => check(`${name}: ${n}`, ok, ok ? '' : String(d ?? '').slice(0, 600));
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
  const item = (idPart) => page.locator(`#deal-t12qc [data-check*="${idPart}"]`);

  await page.goto(BASE + '#deal', { waitUntil: 'load' });
  await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
  await page.waitForSelector('#deal-t12 #t12-import');

  /* ---- 1. a year with spikes, a refund, a negative month and a large one-off */
  await importFile('t12values-a.csv');
  let card = await t('#deal-t12');
  const panel = await t('#deal-t12qc');
  c('the panel says Check and Note in words', /Check/.test(panel) && /Note/.test(panel), panel.slice(0, 300));
  c('the spike, in words, with its threshold', /Repairs: Sep 2026 is \$3,000, more than 3 × its typical month \(\$400\) and over \$1,200 \(the larger of \$1,000 and 0\.5% of EGI\)\./.test(panel), panel.slice(0, 600));
  c('the refund, the negative month and the one-off question', /Insurance refund adds up to −\$2,500/.test(panel) && /Utilities: Jul 2026 is −\$600/.test(panel) && /Building repairs: May 2026 is \$48,000, 90% of the line’s \$53,500 for the period.*Recurring\?/.test(panel), panel.slice(0, 900));
  c('the card counts the three warnings as things to check', /3 things to check/.test(card), card.slice(0, 300));
  c('NOI is as read, $142,700, and nothing is held', /NOI\$142,700/.test(card) && !/Held back/.test(card), card.slice(0, 500));
  const noiBefore = (await dealNow()).t12.lines.length;

  // Review: the three warnings, not the notes
  await page.click('#t12-review');
  await page.waitForSelector('#review-root .review-t12check');
  const rv = await page.locator('#review-root .review-t12check').allTextContents();
  c('Review has the 3 warnings (two spikes, the refund) and no note', rv.length === 3 && rv.every((x) => /T-12 check:/.test(x)) && !rv.some((x) => /Recurring\?|Utilities: Jul/.test(x)), `${rv.length} ${rv.join(' | ').slice(0, 300)}`);
  const seenBtn = page.locator('#review-root .review-t12check [data-fix="seen"]');
  c('Seen is 44 pt high', (await height(seenBtn)) >= 43.9, String(await height(seenBtn)));
  await audit('Review with value warnings', '#review-root');
  await seenBtn.first().click();
  await settle();
  c('Seen clears one: 2 left, one step', (await page.locator('#review-root .review-t12check').count()) === 2 && /^Undo: T-12: a check marked seen/.test(await undoLabel()), await undoLabel());
  await page.evaluate(() => { location.hash = '#deal'; });
  await page.waitForSelector('#deal-t12 #t12-summary');

  // Recurring? No
  const q = item('oneoff.');
  const yes = q.first().locator('[data-fix="rec:yes"]'); const no = q.first().locator('[data-fix="rec:no"]'); const unsure = q.first().locator('[data-fix="rec:notsure"]');
  c('the three answers are buttons at least 44 pt high', (await height(yes)) >= 43.9 && (await height(no)) >= 43.9 && (await height(unsure)) >= 43.9, `${await height(yes)} ${await height(no)} ${await height(unsure)}`);
  c('their words: Recurring? Yes, Recurring? No, Not sure', /Recurring\? Yes/.test(await yes.textContent()) && /Recurring\? No/.test(await no.textContent()) && /Not sure/.test(await unsure.textContent()));
  const stepsBefore = await undoLabel();
  await unsure.click();
  await settle();
  let d = await dealNow();
  c('Not sure stores nothing, adds no step and sets no needs', JSON.stringify(d.t12.lines.map((l) => l.oneoff || null).filter(Boolean)) === '[]' && !d.t12.lines.some((l) => 'needs' in l) && (await undoLabel()) === stepsBefore && /left as it is/i.test(await toastText()), await toastText());
  c('and the card still counts the same lines as filed', (await dealNow()).t12.lines.length === noiBefore && /NOI\$142,700/.test(await t('#deal-t12')));
  await q.first().locator('[data-fix="rec:no"]').click();
  await settle();
  card = await t('#deal-t12');
  d = await dealNow();
  c('Recurring? No: the reported NOI is still $142,700 and "without" is beside it, $190,700', /NOI\$142,700NOI without the one-offs you marked\$190,700/.test(card), card.slice(0, 600));
  c('stored on the month, not the line: oneoff { 2026-05, 48000, no }, no method', JSON.stringify(d.t12.lines.find((l) => l.label === 'Building repairs').oneoff) === '{"iso":"2026-05","amount":48000,"recurring":"no"}' && d.t12.lines.every((l) => !('method' in l)), JSON.stringify(d.t12.lines.find((l) => l.label === 'Building repairs')).slice(0, 300));
  c('one step: Undo names it', /^Undo: T-12: Building repairs, May 2026 marked not recurring/.test(await undoLabel()), await undoLabel());
  c('the panel keeps the answer and a way to change it', /you said it is a one-off/.test(await t('#deal-t12qc, #deal-t12qc-fold')) && (await page.locator('#deal-t12qc [data-fix="change"]').count()) >= 1);
  await page.locator('#deal-t12').screenshot({ path: `${SHOTS}t12values-${name}.png` });
  await audit('the card and the panel with value checks', '#deal-t12');
  await page.emulateMedia({ colorScheme: 'dark' });
  await audit('the card and the panel with value checks, dark', '#deal-t12');
  await page.emulateMedia({ colorScheme: 'light' });
  c('the card fits the screen', await fits());
  await page.keyboard.press('Control+z');
  await settle();
  card = await t('#deal-t12');
  c('Undo takes "without" away; the question is open again', !/NOI without the one-offs/.test(card) && (await page.locator('#deal-t12qc [data-fix="rec:no"]').count()) >= 1 && !(await dealNow()).t12.lines.some((l) => l.oneoff));

  /* ---- 2. a run rate, on request */
  await page.fill('#fig-noi', '190000');
  await page.keyboard.press('Tab');
  await settle();
  await importFile('t12values-t6.csv');
  card = await t('#deal-t12');
  c('a 6-month statement shows no run rate until asked', (await page.locator('#t12-rate-toggle').count()) === 1 && (await page.locator('#t12-runrate').count()) === 0 && /NOI, 6 months\$105,000/.test(card), card.slice(0, 400));
  const toggle = page.locator('#t12-rate-toggle');
  c('"Show a run rate" is 44 pt high', (await height(toggle)) >= 43.9, String(await height(toggle)));
  const figs = JSON.stringify((await dealNow()).figures);
  const label0 = await undoLabel();
  await toggle.click();
  await page.waitForSelector('#t12-runrate');
  const rr = await t('#t12-runrate');
  c('headed "run rate: 6 months × 2, not a T-12", NOI $210,000, EGI $240,000, taxes $24,000', /run rate: 6 months × 2, not a T-12/.test(rr) && /NOI\$105,000\$210,000/.test(rr) && /Effective gross income\$120,000\$240,000/.test(rr) && /Real estate taxes\$12,000\$24,000/.test(rr), rr);
  const rate = await t('.t12-rate');
  c('the lump payment is named', /Real Estate Taxes: \$12,000 paid in Apr 2026; a run rate counts it twice \(\$24,000\)/.test(rate), rate);
  c('the OM is compared, as a note', /Run-rate NOI \$210,000 is 9\.5% above the OM’s \$190,000: a run rate is not a T-12\./.test(rate), rate);
  d = await dealNow();
  c('nothing reached the deal: figures, sources, applied, and no history step', JSON.stringify(d.figures) === figs && !Object.values(d.sources || {}).some((s) => s && s.t12) && !d.t12.applied && (await undoLabel()) === label0, `${JSON.stringify(d.figures)} ${label0} ${await undoLabel()}`);
  await audit('the run rate', '#deal-t12');
  c('the run rate fits the screen', await fits());
  await toggle.click();
  c('Hide the run rate puts it away', (await page.locator('#t12-runrate').count()) === 0);
  await page.click('#t12-use');
  await page.waitForSelector('dialog.action-sheet');
  c('only “Use the T-12’s figures” offers to annualize, with its own confirmation', /Annualize it, then use the figures/.test(await t('dialog.action-sheet')));
  await page.locator('dialog.action-sheet .action-cancel').click();

  /* ---- 3. columns headed by quarter-end dates */
  await importFile('t12values-qend.csv');
  const qd = await t('#deal-t12qc');
  c('the panel asks: the 4 columns are 3 months apart', /The 4 columns are 3 months apart \(Mar to Dec 2025\): each may be a quarter\. Read as months, Annualize would multiply by 3\. Are they single months\?/.test(qd), qd.slice(0, 500));
  c('no run rate is offered while it waits', (await page.locator('#t12-rate-toggle').count()) === 0);
  await page.click('#t12-use');
  await page.waitForSelector('dialog.action-sheet');
  c('Annualize it is withheld, with the reason', (await page.locator('dialog.action-sheet .action-item', { hasText: 'Annualize it' }).isDisabled()) && /may be quarters or years/.test(await t('dialog.action-sheet')), (await t('dialog.action-sheet')).slice(0, 400));
  await page.locator('dialog.action-sheet .action-cancel').click();
  const single = page.locator('#deal-t12qc [data-fix="seen"]', { hasText: 'They are single months' });
  c('“They are single months” is 44 pt high', (await height(single)) >= 43.9, String(await height(single)));
  await single.click();
  await settle();
  c('one step names it', /^Undo: T-12: the columns are single months/.test(await undoLabel()), await undoLabel());
  await page.click('#t12-use');
  await page.waitForSelector('dialog.action-sheet');
  c('Annualize is offered now', !(await page.locator('dialog.action-sheet .action-item', { hasText: 'Annualize it' }).isDisabled()));
  await page.locator('dialog.action-sheet .action-item', { hasText: 'Annualize it' }).click();
  await page.waitForFunction(() => /Annualize 4 months/.test(document.querySelector('dialog.action-sheet')?.textContent || ''), null, { timeout: 4000 });
  c('and shows NOI $342,000, to confirm', /NOI, annualized: [^→]+→ \$342,000/.test(await t('dialog.action-sheet')), (await t('dialog.action-sheet')).slice(0, 300));
  await page.locator('dialog.action-sheet .action-cancel').click().catch(() => {});

  /* ---- 4. a 300-line statement answers an edit in 150 ms */
  await importFile('t12values-big.csv');
  const ids = await page.evaluate(() => [...document.querySelectorAll('#deal-t12qc [data-check]')].map((e) => e.dataset.check));
  const spike = ids.find((x) => x.startsWith('spike.'));
  c('the big statement has value warnings to clear', !!spike, ids.slice(0, 5).join(','));
  if (spike) {
    await page.evaluate((id) => {
      const w = window; w.__ms = null;
      document.addEventListener('click', (e) => {
        if (!e.isTrusted) return;
        const t0 = performance.now();
        const mo = new MutationObserver(() => {
          const li = document.querySelector(`#deal-t12qc [data-check="${id}"], #deal-t12qc-fold [data-check="${id}"]`);
          if (li && li.classList.contains('qc-resolved')) { mo.disconnect(); requestAnimationFrame(() => setTimeout(() => { w.__ms = performance.now() - t0; }, 0)); }
        });
        mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
      }, { capture: true, once: true });
    }, spike);
    await page.locator(`#deal-t12qc [data-check="${spike}"] [data-fix="seen"]`).click();
    await page.waitForFunction(() => window.__ms !== null, null, { timeout: 5000 }).catch(() => {});
    const ms = await page.evaluate(() => window.__ms);
    c(`an edit on a 300-line statement shows its result in under 150 ms (${ms === null ? 'not seen' : `${Math.round(ms)} ms`})`, ms !== null && ms <= 150, String(ms));
  }

  /* ---- Settings */
  await page.click('.sidebar .tab[data-view="settings"]').catch(() => page.evaluate(() => { location.hash = '#settings'; }));
  await page.waitForSelector('#conv-t12-spike-times');
  const boxes = await page.locator('#settings-conventions input.conv-num').count();
  c('Settings has the fifteen T-12 and NOI number boxes (ten, plus the five red-flag levels) and the four rent roll band ones', boxes === 19 && (await page.locator('#settings-conventions input[id^="conv-rr-psf-"]').count()) === 4, String(boxes));
  c('each box is at least 44 pt high', (await height(page.locator('#conv-t12-spike-times'))) >= 43.9 && (await height(page.locator('#conv-noi-warn'))) >= 43.9);
  const sc = await t('#settings-conventions');
  c('with their units and help in words', /T-12 spike: times the typical month/.test(sc) && /NOI three ways: a warning above/.test(sc) && /Typed in points: 0\.5 is half of one percent/.test(sc), sc.slice(0, 200));
  await audit('Settings, calculation conventions', '#settings-conventions');
  await page.emulateMedia({ colorScheme: 'dark' });
  await audit('Settings, calculation conventions, dark', '#settings-conventions');
  await page.emulateMedia({ colorScheme: 'light' });
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
  fs.writeFileSync(`${SHOTS}t12values-flow.json`, JSON.stringify(R, null, 1));
  for (const r of R) console.log(r.join(' | '));
  finish(R, 'errors', errors);
  await P.browser.close();
  await D.browser.close();
  cleanup(); // a stray .csv in files/ would be picked up by the LibreOffice recalculation
}
process.exit(R.some((r) => r[0] === 'FAIL') ? 1 : 0);
