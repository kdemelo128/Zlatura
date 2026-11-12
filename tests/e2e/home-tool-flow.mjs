/* New look, Home in the built-in tool's style: one primary action; the two others in a quiet row (all three reachable
 * at once, none removed); on a phone the primary floats at 44 px or more above the tab bar and leaves the end of the page
 * uncovered; the entrance and the hover lift run with motion allowed and stop under reduced motion; axe finds nothing in
 * light and dark; at 320 px wide and 130% text nothing scrolls sideways. Classic keeps its three inline buttons. */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const errs = [];
const look = (page, v) => page.evaluate(async (x) => { const m = await import(new URL('app/look.js', location.href).href); m.setLook(x); }, v);
const go = async (page, v) => { await page.evaluate((x) => { location.hash = `#${x}`; }, v); await page.waitForSelector(`#view-${v}`, { state: 'visible' }); await page.waitForTimeout(500); };
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
async function axe(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] });
    return r.violations.map((x) => `${x.id} (${x.impact}) -> ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }, TAGS);
  check(`${label}: axe finds nothing`, res.length === 0, res.join('\n    '));
}
/** Visible Home buttons by name, as a person sees them (no tap needed to reveal any). */
const shown = (page) => page.evaluate(() => [...document.querySelectorAll('#view-home .home-head label.btn, #view-home .home-head button')].filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden').map((e) => e.textContent.trim()));

for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }]]) {
  const { browser, page, errors } = await phone(opts);
  await page.goto(BASE + '#home', { waitUntil: 'load' });
  await page.waitForSelector('#home-root h1');
  await page.waitForTimeout(400);

  // ---- Classic is untouched: three inline buttons, no floating one
  check(`${size}: Classic Home keeps its three inline actions`, (await shown(page)).join('|') === 'Read an OM|Add comps|New task' && (await page.locator('.home-primary, .home-quiet').count()) === 0);

  // ---- New look
  await look(page, 'new');
  await go(page, 'settings'); await go(page, 'home');
  const acts = await shown(page);
  check(`${size}: every former Home action is still on screen at once (no extra tap)`, ['Read an OM', 'Add comps', 'New task'].every((n) => acts.includes(n)), acts.join('|'));
  check(`${size}: exactly one primary button, and it is the OM reader`, (await page.locator('#view-home .btn-primary').count()) === 1 && (await page.locator('#view-home .home-primary').textContent()).trim() === 'Read an OM');
  check(`${size}: the other two actions sit in one quiet row of text buttons`, (await page.locator('#view-home .home-quiet .btn-plain').count()) === 2);
  const fab = () => page.evaluate(() => { const e = document.querySelector('.home-primary'), r = e.getBoundingClientRect(), tb = document.querySelector('.tabbar'); return { pos: getComputedStyle(e).position, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right, tabTop: tb && getComputedStyle(tb).display !== 'none' ? tb.getBoundingClientRect().top : null, vw: innerWidth }; });
  const f = await fab();
  if (size === 'phone') {
    check('phone: the primary action floats (fixed), at least 44 x 44, inside the screen and above the tab bar', f.pos === 'fixed' && f.w >= 44 && f.h >= 44 && f.right <= f.vw && f.left >= 0 && f.tabTop !== null && f.bottom <= f.tabTop, JSON.stringify(f));
  } else check('desktop: the primary action stays in the hero, not floating', f.pos !== 'fixed', f.pos);

  // a deal, so the cards under the hero are drawn
  await go(page, 'deal');
  await page.evaluate(() => [...document.querySelectorAll('#deal-root button')].find((x) => /fictional example/.test(x.textContent))?.click());
  await page.waitForSelector('#deal-crm #deal-stage', { timeout: 20000 });
  await go(page, 'home');
  await page.waitForSelector('#home-pipeline .pipe');

  if (size === 'phone') {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(300);
    const end = await page.evaluate(() => {
      const kids = [...document.querySelectorAll('#view-home .bento > *')].filter((e) => e.getBoundingClientRect().height > 0);
      const last = kids[kids.length - 1].getBoundingClientRect(), r = document.querySelector('.home-primary').getBoundingClientRect();
      return { lastBottom: last.bottom, fabTop: r.top };
    });
    check('phone: at the bottom of the page the floating button does not cover the last card', end.lastBottom <= end.fabTop, JSON.stringify(end));
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  // ---- motion: the entrance and the lift run; reduced motion and the Motion switch stop them
  await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#home-root h1'); await page.waitForTimeout(100);
  const anim = () => page.evaluate(() => getComputedStyle(document.querySelector('#view-home .home-head h1')).animationName);
  check(`${size}: the hero rises in when Home is first drawn`, (await anim()) === 'home-rise', await anim());
  await page.waitForTimeout(700);
  const dur = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('#view-home .home-head h1')); const t = (x) => (x.endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000); return { d: t(s.animationDuration), delay: t(s.animationDelay) }; });
  check(`${size}: the entrance is 150 to 250 ms`, dur.d >= 150 && dur.d <= 250, JSON.stringify(dur));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#home-root h1'); await page.waitForTimeout(100);
  check(`${size}: reduced motion: no entrance animation anywhere on Home`, await page.evaluate(() => [...document.querySelectorAll('#view-home *')].every((e) => getComputedStyle(e).animationName === 'none')));
  check(`${size}: reduced motion: no transition on the primary button or a deal row`, await page.evaluate(() => ['.home-primary', '.cont-row'].every((q) => getComputedStyle(document.querySelector(q)).transitionDuration.split(',').every((x) => parseFloat(x) === 0))));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(async () => { const m = await import(new URL('app/look.js', location.href).href); m.setMotion(false); });
  await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#home-root h1'); await page.waitForTimeout(100);
  check(`${size}: the Motion switch off: no entrance animation on Home`, await page.evaluate(() => [...document.querySelectorAll('#view-home *')].every((e) => getComputedStyle(e).animationName === 'none')));
  if (size === 'desktop') {
    await page.mouse.move(5, 5); await page.hover('.cont-row'); await page.waitForTimeout(350);
    check('desktop: the Motion switch off: a hovered deal row does not lift', (await page.evaluate(() => getComputedStyle(document.querySelector('.cont-row')).transform)) === 'none');
  }
  await page.evaluate(async () => { const m = await import(new URL('app/look.js', location.href).href); m.setMotion(true); });
  await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#home-root h1'); await page.waitForTimeout(100);
  if (size === 'desktop') {
    await page.mouse.move(5, 5);
    const before = await page.evaluate(() => getComputedStyle(document.querySelector('.cont-row')).transform);
    await page.hover('.cont-row'); await page.waitForTimeout(350);
    const hov = await page.evaluate(() => getComputedStyle(document.querySelector('.cont-row')).transform);
    check('desktop: hovering a deal row lifts it (a transform, nothing else moves)', before === 'none' && hov !== 'none' && /matrix\(1, 0, 0, 1, 0, -2\)/.test(hov), `${before} -> ${hov}`);
  }

  // ---- axe, light and dark, with a deal
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme }); await page.waitForTimeout(300);
    await axe(page, `${size}, ${scheme}: Home`);
  }
  await page.emulateMedia({ colorScheme: 'light' });

  // ---- 130% text on a 320 px screen
  if (size === 'phone') {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(async () => { const m = await import(new URL('app/look.js', location.href).href); m.setTextSize(130); });
    await page.waitForTimeout(400);
    check('320 px wide, text 130%: Home does not scroll sideways', (await sideways(page)) <= 0, `${await sideways(page)}px`);
    const g = await fab();
    check('320 px wide, text 130%: the floating button stays inside the screen and above the tab bar', g.left >= 0 && g.right <= 320 && (g.tabTop === null || g.bottom <= g.tabTop), JSON.stringify(g));
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(300);
    const end2 = await page.evaluate(() => { const kids = [...document.querySelectorAll('#view-home .bento > *')].filter((e) => e.getBoundingClientRect().height > 0); return { lastBottom: kids[kids.length - 1].getBoundingClientRect().bottom, fabTop: document.querySelector('.home-primary').getBoundingClientRect().top }; });
    check('320 px wide, text 130%: the end of the page is not covered', end2.lastBottom <= end2.fabTop, JSON.stringify(end2));
    await page.evaluate(async () => { const m = await import(new URL('app/look.js', location.href).href); m.setTextSize(100); });
  }
  await browser.close();
  errs.push(...errors);
}
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errs);
