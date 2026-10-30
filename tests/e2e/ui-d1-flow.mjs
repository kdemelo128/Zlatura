/* UI revamp D1: the New look's tokens. Classic is the default and has no data-look; Settings > Appearance >
 * Look turns the New look on (kept across a reload, before first paint) and back off. In the New look the bars
 * are solid, our faces come first, and axe finds nothing on the main screens at phone and desktop size,
 * light and dark, while Classic's bars keep their blur. */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const errs = [];

for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }]]) {
  const { browser, page, errors } = await phone(opts);
  const ext = [];
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) ext.push(r.url()); });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('#view-home', { state: 'visible', timeout: 5000 });
  const bars = () => page.evaluate(() => {
    const b = document.querySelector(innerWidth >= 960 ? '.appbar' : '.tabbar'), s = getComputedStyle(b);
    return { filter: s.backdropFilter || s.webkitBackdropFilter || 'none', bg: s.backgroundColor, ui: getComputedStyle(document.body).fontFamily };
  });
  const c = await bars();
  check(`${size}: Classic is the default (no data-look) and its bar still blurs`, (await page.getAttribute('html', 'data-look')) === null && /blur/.test(c.filter) && !/^"?Public Sans/.test(c.ui), JSON.stringify(c));

  // turn it on in Settings
  await page.evaluate(() => { location.hash = '#settings'; });
  await page.waitForSelector('#view-settings [data-look-set="new"]', { state: 'visible' });
  check(`${size}: Settings > Appearance has a Look choice, Classic selected`, (await page.getAttribute('[data-look-set="classic"]', 'aria-checked')) === 'true');
  await page.click('[data-look-set="new"]');
  check(`${size}: choosing the New look sets it and marks the choice`, (await page.getAttribute('html', 'data-look')) === 'new' && (await page.getAttribute('[data-look-set="new"]', 'aria-checked')) === 'true');
  await page.reload({ waitUntil: 'domcontentloaded' });
  check(`${size}: the New look is set from the first paint after a reload`, (await page.evaluate(() => document.documentElement.dataset.look)) === 'new');
  await page.waitForLoadState('load');
  await page.waitForSelector('#view-settings', { state: 'visible' });

  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate(() => document.fonts.ready);
    const b = await bars();
    const solid = /^rgb\(/.test(b.bg) && b.filter === 'none';
    check(`${size}, ${scheme}: the bar is solid (no blur, opaque) and our sans comes first`, solid && /^"?Public Sans/.test(b.ui), JSON.stringify(b));
    const want = scheme === 'light' ? 'rgb(244, 245, 247)' : 'rgb(17, 19, 22)';
    check(`${size}, ${scheme}: the page takes the New look's colour`, (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === want, want);
    for (const v of ['home', 'deal', 'comps', 'tools', 'settings']) {
      await page.evaluate((x) => { location.hash = `#${x}`; }, v);
      await page.waitForSelector(`#view-${v}`, { state: 'visible' });
      await page.waitForTimeout(450);
      if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
      const res = await page.evaluate(async (tags) => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] });
        return r.violations.map((x) => `${x.id} (${x.impact}) -> ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      }, TAGS);
      check(`${size}, ${scheme}: axe on ${v} finds nothing`, res.length === 0, res.join('\n    '));
    }
  }
  // the serif face is the vendored one: a title in the New look loads it
  await page.evaluate(() => { location.hash = '#settings'; });
  await page.waitForTimeout(300);
  const serif = await page.evaluate(async () => { await document.fonts.load('600 24px "Zlatura Serif"'); return document.fonts.check('600 24px "Zlatura Serif"') && [...document.fonts].some((f) => f.family.includes('Zlatura Serif') && f.status === 'loaded'); });
  check(`${size}: the vendored Source Serif 4 loads in the New look`, serif);
  check(`${size}: nothing was requested outside the app`, ext.length === 0, ext.join(', '));

  // and back
  await page.emulateMedia({ colorScheme: 'light' });
  await page.click('[data-look-set="classic"]');
  const back = await bars();
  check(`${size}: choosing Classic again restores it (no data-look, blur back)`, (await page.getAttribute('html', 'data-look')) === null && /blur/.test(back.filter), JSON.stringify(back));
  await browser.close();
  errs.push(...errors);
}
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errs);
