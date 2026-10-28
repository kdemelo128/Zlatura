/* The phone's Back button: it returns to the last screen and never closes the
 * app. Screens, a deal and a sheet each take one history entry; Back closes a
 * sheet first, then steps back through the screens, and at the first screen
 * stays put. Forward works, a reload on a deal's address reopens that deal,
 * and choosing the screen already shown adds no entry. Run at phone and desktop
 * size, with axe on the screens reached by Back. */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const SIZES = [
  ['phone', {}],
  ['desktop', { viewport: { width: 1360, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }],
];

for (const [size, opts] of SIZES) {
  const { browser, ctx, page, errors } = await phone(opts);
  const T = (n) => `${size}: ${n}`;
  const hash = () => page.evaluate(() => location.hash);
  const shown = () => page.evaluate(() => [...document.querySelectorAll('section.view')].filter((v) => !v.hidden).map((v) => v.id.slice(5)).join());
  const back = async () => { await page.evaluate(() => history.back()); await page.waitForTimeout(400); };
  const forward = async () => { await page.evaluate(() => history.forward()); await page.waitForTimeout(400); };
  const tab = async (v) => { await page.locator(`.tab[data-view="${v}"]:visible`).first().click(); await page.waitForTimeout(250); };
  const entries = () => page.evaluate(() => history.length);
  const axe = async (name) => {
    await page.waitForTimeout(450); // a sheet finishes sliding in first
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
    const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
    check(T(`axe: ${name}`), res.length === 0, res.join('\n    '));
  };

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('#view-home', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(300);
  check(T('Home is the first screen'), (await shown()) === 'home', await hash());

  // Home -> deal -> comps
  await tab('deal');
  await page.setInputFiles('#om-file', F + 'om-retail.pdf');
  await page.waitForSelector('#deal-tiles .tile');
  await page.waitForTimeout(300);
  const id = await page.evaluate(() => localStorage.getItem('zlatura.deal.current'));
  check(T('an open deal is in the address'), !!id && (await hash()) === `#deal/${id}`, `${id} ${await hash()}`);
  await tab('comps');
  check(T('Comps shows and is in the address'), (await shown()) === 'comps' && (await hash()) === '#comps', await hash());
  const n = await entries();
  await tab('comps');
  check(T('choosing the screen already shown adds no history entry'), (await entries()) === n, `${n} -> ${await entries()}`);

  // Back, Back
  await back();
  check(T('Back from Comps returns to the deal'), (await shown()) === 'deal' && (await hash()) === `#deal/${id}` && /4410 Example Avenue NW/.test(await page.textContent('#deal-root h1')), `${await shown()} ${await hash()}`);
  await axe('the deal after Back');
  await back();
  check(T('Back again returns to Home'), (await shown()) === 'home' && (await hash()) === '#home', `${await shown()} ${await hash()}`);
  await axe('Home after Back');

  // Forward
  await forward();
  check(T('Forward returns to the deal'), (await shown()) === 'deal' && (await hash()) === `#deal/${id}`, await shown());
  await forward();
  check(T('Forward again returns to Comps'), (await shown()) === 'comps', await shown());
  await back(); await back();

  // at the first screen Back stays in the app
  await back();
  check(T('Back at the first screen stays in the app'), page.url().startsWith(BASE) && (await shown()) === 'home' && (await page.evaluate(() => window.__zlaturaReady === true)), page.url());
  if (!page.url().startsWith(BASE)) { await browser.close(); continue; }   // the app was left: the rest cannot run
  await back(); await back();
  check(T('and keeps staying'), page.url().startsWith(BASE) && (await shown()) === 'home', page.url());

  // a sheet: Back closes the sheet only
  await tab('deal');
  const view = await shown();
  await page.click('#deal-root .view-head button[aria-label="More deal actions"]');
  await page.waitForSelector('dialog[open]');
  await axe('the deal actions sheet');
  const h0 = await hash();
  await back();
  check(T('Back closes an open sheet and nothing else'), !(await page.$('dialog[open]')) && (await shown()) === view && (await hash()) === h0, `${await shown()} ${await hash()}`);
  await back();
  check(T('the next Back leaves the deal for Home'), (await shown()) === 'home', await shown());
  await forward();
  // a sheet closed by its own button gives its entry back
  await page.click('#deal-root .view-head button[aria-label="More deal actions"]');
  await page.waitForSelector('dialog[open]');
  await page.click('dialog[open] .action-cancel');
  await page.waitForTimeout(400);
  await back();
  check(T('a sheet closed with its own button leaves no extra Back press'), (await shown()) === 'home', await shown());
  await forward();
  // the command menu is a sheet too
  await page.keyboard.press('Control+k');
  await page.waitForSelector('dialog[open]');
  await back();
  check(T('Back closes the command menu'), !(await page.$('dialog[open]')) && (await shown()) === 'deal', await shown());

  // a reload on the deal reopens it, and Back still works after it
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#deal-tiles .tile');
  check(T('a reload on a deal reopens it'), (await shown()) === 'deal' && (await hash()) === `#deal/${id}`, `${await shown()} ${await hash()}`);
  await back();
  check(T('Back after a reload still returns to the last screen'), (await shown()) === 'home' && page.url().startsWith(BASE), `${await shown()} ${page.url()}`);

  // the address alone opens the deal (another tab, a bookmark)
  const other = await ctx.newPage();
  await other.goto(BASE, { waitUntil: 'load' });
  await other.evaluate(() => localStorage.removeItem('zlatura.deal.current'));
  await other.goto(`${BASE}#deal/${id}`, { waitUntil: 'load' });
  await other.reload({ waitUntil: 'load' });
  await other.waitForSelector('#deal-tiles .tile', { timeout: 8000 }).catch(() => {});
  check(T('a deal address opens that deal with nothing else remembered'), /4410 Example Avenue NW/.test((await other.textContent('#deal-root h1').catch(() => '')) || ''), await other.url());
  await other.close();

  check(T('no console errors'), errors.length === 0, errors.join('\n'));
  await browser.close();
}
for (const r of R) console.log(r.join(" | "));
finish(R);
