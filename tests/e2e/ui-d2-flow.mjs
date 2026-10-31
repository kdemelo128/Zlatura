/* UI revamp D2: one icon set and one brand record. Every icon in the page is drawn from the set (24-unit grid,
 * one stroke weight, currentColor), is decorative (aria-hidden) beside a name, and renders in Classic and the
 * New look alike; the name and mark are drawn once (a symbol) and used by reference; axe finds nothing with the
 * icons in place, at phone and desktop size, light and dark. */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const errs = [];

/** What is wrong with the icons on the screen now: an empty slot, a stray weight, a missing name. */
const audit = (page) => page.evaluate(() => {
  const bad = [];
  const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  for (const s of document.querySelectorAll('svg[data-icon], .tool-icon svg, button svg, .action-item svg, .tab svg')) {
    if (s.closest('#brand-sprite')) continue;
    if (s.getAttribute('aria-hidden') !== 'true') bad.push(`${s.getAttribute('data-icon') || 'svg'}: not aria-hidden`);
    if (s.hasAttribute('data-icon') && !s.firstElementChild) bad.push(`${s.dataset.icon}: never drawn`);
    if (s.firstElementChild && s.getAttribute('viewBox') === '0 0 24 24') {
      if (s.getAttribute('stroke-width') !== '1.75') bad.push(`${s.dataset.icon || 'svg'}: stroke-width ${s.getAttribute('stroke-width')}`);
      if (s.getAttribute('stroke') !== 'currentColor' || s.getAttribute('fill') !== 'none') bad.push(`${s.dataset.icon || 'svg'}: not currentColor line art`);
      if (shown(s) && !getComputedStyle(s.firstElementChild).stroke.startsWith('rgb')) bad.push('a shape has no stroke colour');
    }
  }
  // a button that shows only an icon needs a name
  for (const b of document.querySelectorAll('button, [role="button"], a[href]')) {
    if (!shown(b)) continue;
    const name = (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '').trim();
    if (!name) bad.push(`a ${b.tagName.toLowerCase()}.${b.className} has an icon and no name`);
  }
  return bad;
});
const axeRun = async (page) => {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] });
    return r.violations.map((x) => `${x.id} (${x.impact}) -> ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }, TAGS);
};

for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined }]]) {
  const { browser, page, errors } = await phone(opts);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('#view-home', { state: 'visible', timeout: 5000 });

  // the brand: one symbol, used by reference, with the name filled from brand.js
  const brand = await page.evaluate(() => ({
    symbols: document.querySelectorAll('symbol#brand-mark').length,
    uses: [...document.querySelectorAll('.brand-mark use')].filter((u) => u.getAttribute('href') === '#brand-mark').length,
    names: [...document.querySelectorAll('.brand-name')].map((n) => n.firstChild && n.textContent.startsWith('Zlatura')).every(Boolean),
    sub: document.querySelector('.sidebar [data-brand-sub]').textContent,
    title: document.title,
    bg: getComputedStyle(document.querySelector('.brand-mark')).backgroundColor,
    markBox: (() => { const r = document.querySelector('.sidebar .brand-mark svg').getBoundingClientRect(); return [r.width, r.height]; })(),
  }));
  check(`${size}: the mark is one <symbol> and both brand places use it`, brand.symbols === 1 && brand.uses === 2, JSON.stringify(brand));
  check(`${size}: the name and the line under it are filled from brand.js`, brand.names && brand.sub === 'Brokerage workspace' && brand.title.includes('Zlatura'), JSON.stringify(brand));
  check(`${size}: the mark is drawn (a visible box holding a symbol with a real path)`, await page.evaluate(() => [...document.querySelectorAll('.brand-mark svg')].some((s) => s.getBoundingClientRect().width > 8) && document.querySelector('#brand-mark path').getTotalLength() > 20));

  for (const look of ['classic', 'new']) {
    await page.evaluate((l) => { if (l === 'new') document.documentElement.dataset.look = 'new'; else delete document.documentElement.dataset.look; }, look);
    for (const v of ['home', 'deal', 'underwrite', 'comps', 'tools', 'settings']) {
      await page.evaluate((x) => { location.hash = `#${x}`; }, v);
      await page.waitForSelector(`#view-${v}`, { state: 'visible' });
      await page.waitForTimeout(250);
      const bad = await audit(page);
      check(`${size}, ${look}: icons on ${v} are in the spec, aria-hidden, and every icon button is named`, bad.length === 0, bad.slice(0, 6).join('\n    '));
    }
  }

  // the tool list draws one icon each, all from the set
  await page.evaluate(() => { location.hash = '#tools'; });
  await page.waitForSelector('#view-tools', { state: 'visible' });
  await page.waitForTimeout(250);
  const tools = await page.evaluate(() => [...document.querySelectorAll('.tool-icon svg')].map((s) => s.querySelectorAll('path,circle,rect').length));
  check(`${size}: the Tools list draws an icon for every tool`, tools.length >= 20 && tools.every((n) => n > 0), `${tools.length} icons`);

  // the command menu: search, then rows with an icon each
  await page.evaluate(() => { location.hash = '#home'; });
  await page.click('[data-cmd]:visible');
  await page.waitForSelector('.cmdk-in', { state: 'visible' });
  await page.waitForTimeout(250);
  const rows = await page.evaluate(() => [...document.querySelectorAll('.cmdk-list svg, .cmdk-in svg')].map((s) => s.getAttribute('viewBox') === '0 0 24 24' && s.getAttribute('aria-hidden') === 'true' && s.querySelectorAll('path,circle,rect').length > 0));
  check(`${size}: the command menu shows its icons from the set`, rows.length >= 3 && rows.every(Boolean), `${rows.length} icons`);
  const bad = await audit(page);
  check(`${size}: the command menu's icons are in the spec`, bad.length === 0, bad.slice(0, 5).join('\n    '));
  await page.keyboard.press('Escape');

  // axe with the icons in place, light and dark, in the New look
  await page.evaluate(() => { document.documentElement.dataset.look = 'new'; });
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const v of ['home', 'tools', 'settings']) {
      await page.evaluate((x) => { location.hash = `#${x}`; }, v);
      await page.waitForSelector(`#view-${v}`, { state: 'visible' });
      await page.waitForTimeout(300);
      const res = await axeRun(page);
      check(`${size}, ${scheme}: axe on ${v} finds nothing`, res.length === 0, res.join('\n    '));
    }
  }
  await browser.close();
  errs.push(...errors);
}
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errs);
