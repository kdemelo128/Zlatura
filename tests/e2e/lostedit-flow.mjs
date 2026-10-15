/* lostedit-flow: an edit committed with Tab is kept even when the deal is left,
 * or the page reloaded, before Tab's focus has landed.
 *
 * A change fires while Tab is on its way (focus on nothing). From 4.7.3 to
 * 4.7.6 the whole change handler, the save included, waited for focus to land,
 * so leaving or reloading in that beat lost the edit, or wrote it to no deal
 * (a "null.figures" page error). Each case below commits a field exactly that
 * way and leaves in the same instant, so the old code fails every time:
 *   1. a deal figure, then "All deals";
 *   2. a deal figure, then the app is closed;
 *   3. a What-if target, then the app is closed;
 *   4. a field in the lease editor, then the app is closed.
 * "Closed" is what a phone does when you switch away: pagehide fires (the app
 * saves then) and the page may never run another timer, so timers are stopped
 * before the edit and the page is reloaded after. */
import { phone, BASE, finish } from './lib.mjs';
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();
const ROW = (n) => `#deal-rentroll .rr-grid tbody tr:nth-child(${n})`;
const paneOf = (sel) => page.evaluate((s) => { const e = document.querySelector(s); const p = e && e.closest('[id^="pane-"]'); return p ? p.id.replace('pane-', '') : null; }, sel);

/** Type `value` into `sel`, commit it as Tab does (focus gone, then change), and at once leave the deal or close the app. */
async function commitThen(sel, value, then, nth = 0) {
  await page.evaluate(([s, v, t, n]) => {
    const i = document.querySelectorAll(s)[n];
    const timer = window.setTimeout;
    if (t === 'close') window.setTimeout = () => 0; // a page being closed runs no more timers
    i.focus(); i.value = v; i.blur();
    i.dispatchEvent(new Event('change', { bubbles: true }));
    if (t === 'leave') [...document.querySelectorAll('#deal-root button')].find((b) => b.textContent.includes('All deals')).click();
    else { window.dispatchEvent(new Event('pagehide')); window.setTimeout = timer; location.reload(); }
  }, [sel, value, then, nth]).catch(() => { /* the reload ends the evaluate */ });
  await page.waitForLoadState('load');
  await page.waitForTimeout(800);
}
const reopen = async () => {
  if (!(await page.locator('#fig-noi').count())) await page.locator('#deal-root .list .li').first().click();
  await page.waitForSelector('#fig-noi');
};

await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.setInputFiles('#om-file', F + 'om-retail.pdf');
await page.waitForSelector('#deal-tiles .tile');
await page.waitForTimeout(800);

// 1. a figure, then All deals in the same instant
await commitThen('#fig-noi', '400,000', 'leave');
check('leaving the deal as an edit commits: no page error', !errors.some((e) => /figures/.test(e)), errors.join(' / '));
await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
await reopen();
const noiA = await page.inputValue('#fig-noi');
check('a figure committed as the deal is left is kept', noiA === '$400,000', noiA);

// 2. a figure, then the app is closed in the same instant
await commitThen('#fig-noi', '410,000', 'close');
await reopen();
const noiB = await page.inputValue('#fig-noi');
check('a figure committed as the app is closed is kept', noiB === '$410,000', noiB);

// 3. a What-if target, then the app is closed
const scn = await paneOf('input.scn-target');
if (scn) await page.click(`#tab-${scn}`);
await page.waitForSelector('input.scn-target');
await commitThen('input.scn-target', '7.25', 'close');
await reopen();
const scn2 = await paneOf('input.scn-target');
if (scn2) await page.click(`#tab-${scn2}`);
const cap = await page.locator('input.scn-target').first().inputValue();
check('a What-if target committed as the app is closed is kept', cap === '7.25', cap);

// 4. the lease editor, then the app is closed
await page.click('#tab-rentroll');
await page.locator(`${ROW(1)} button[aria-label^="Lease schedule"]`).click();
await page.waitForSelector('#ls-sf');
const sfBefore = await page.inputValue('#ls-sf');
await commitThen('#ls-sf', '3200', 'close');
await reopen();
await page.click('#tab-rentroll');
await page.locator(`${ROW(1)} button[aria-label^="Lease schedule"]`).click();
await page.waitForSelector('#ls-sf');
const sf = await page.inputValue('#ls-sf');
check('a lease-editor field committed as the app is closed is kept', sf === '3,200' && sfBefore !== sf, `${sfBefore} → ${sf}`);

check('no console errors', errors.length === 0, errors.join(' / '));
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errors);
await browser.close();
