/* UI fixes: the accent colour and the text size apply in BOTH looks (they were New-look only), and persist over a reload.
 * Accent: the primary button, a link, the active step and the focus ring take the chosen colour. Text size: a token-sized
 * element (.view-head p) and a px-sized one (.chip / .kbd) both grow at 130%, and the setting survives a reload. */
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const errs = [];
const GREEN = '#2F6B4F';
const go = async (page, v) => { await page.evaluate((x) => { location.hash = `#${x}`; }, v); await page.waitForSelector(`#view-${v}`, { state: 'visible' }); await page.waitForTimeout(400); };
const colours = (page) => page.evaluate(() => {
  const tmp = (css) => { const i = document.createElement('i'); i.style.cssText = css; document.body.appendChild(i); const c = getComputedStyle(i); const o = { color: c.color, bg: c.backgroundColor }; i.remove(); return o; };
  const root = getComputedStyle(document.documentElement);
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; document.body.appendChild(btn);
  const link = document.createElement('a'); link.href = '#x'; document.body.appendChild(link);
  const step = document.createElement('div'); step.className = 'step'; step.setAttribute('aria-current', 'step'); document.body.appendChild(step);
  const out = { btn: getComputedStyle(btn).backgroundColor, link: getComputedStyle(link).color, step: getComputedStyle(step).backgroundColor, acc: root.getPropertyValue('--accent').trim().toUpperCase() };
  btn.remove(); link.remove(); step.remove();
  return out;
});
/** The colour of the ring on whatever a Tab key press focuses (:focus-visible needs the keyboard). */
const ring = async (page) => { await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.keyboard.press('Tab'); return page.evaluate(() => { const e = document.activeElement; const c = getComputedStyle(e); return c.outlineStyle === 'none' ? 'none' : c.outlineColor; }); };
const sizes = (page) => page.evaluate(() => {
  const px = (css, cls, tag = 'span') => { const e = document.createElement(tag); e.className = cls; e.textContent = 'Sample'; e.style.cssText = css; document.body.appendChild(e); const v = parseFloat(getComputedStyle(e).fontSize); e.remove(); return v; };
  return { body: parseFloat(getComputedStyle(document.body).fontSize), token: px('font-size:var(--t-14)', ''), chip: px('', 'chip'), kbd: px('', 'kbd', 'kbd'), h1: px('', 'x', 'h1') };
});

for (const look of ['classic', 'new']) {
  const { browser, page, errors } = await phone({ viewport: { width: 1100, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 });
  await page.goto(BASE + '#home', { waitUntil: 'load' });
  await page.waitForSelector('#home-root h1');
  await page.evaluate(async (l) => { const m = await import(new URL('app/look.js', location.href).href); m.setLook(l); m.setAccent(null); m.setTextSize(100); }, look);
  await go(page, 'settings');
  const ringBefore = await ring(page);
  const before = await colours(page), s0 = await sizes(page);
  await page.click(`[data-accent-set="${GREEN}"]`);
  await page.click('[data-size-set="130"]');
  await page.waitForTimeout(200);
  const ringAfter = await ring(page);
  const after = await colours(page), s1 = await sizes(page);
  const want = after.acc;
  check(`${look}: an accent swatch sets --accent`, /^#[0-9A-F]{6}$/.test(want) && want !== before.acc, `${before.acc} -> ${want}`);
  const rgbOf = (h) => `rgb(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
  check(`${look}: the primary button takes the accent`, after.btn === rgbOf(want) && after.btn !== before.btn, `${before.btn} -> ${after.btn} (want ${rgbOf(want)})`);
  check(`${look}: a link takes the accent`, after.link === rgbOf(want) && after.link !== before.link, `${before.link} -> ${after.link}`);
  check(`${look}: the active step takes the accent`, after.step === rgbOf(want) && after.step !== before.step, `${before.step} -> ${after.step}`);
  check(`${look}: the focus ring takes the accent`, ringAfter === rgbOf(want), ringAfter);
  for (const k of ['token', 'chip', 'kbd', 'h1']) check(`${look}: 130% text makes the ${k} size 1.3 times larger`, Math.abs(s1[k] / s0[k] - 1.3) < 0.02, `${s0[k]} -> ${s1[k]}`);
  check(`${look}: 130% text makes the body larger`, s1.body > s0.body * 1.25, `${s0.body} -> ${s1.body}`);
  await page.screenshot({ path: `${SHOTS}ui-fixes-${look}-130.png` });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#app, body');
  await page.waitForTimeout(500);
  const kept = await colours(page), k1 = await sizes(page);
  check(`${look}: the accent is kept across a reload`, kept.btn === rgbOf(want) && kept.link === rgbOf(want), kept.btn);
  check(`${look}: the text size is kept across a reload`, Math.abs(k1.token / s0.token - 1.3) < 0.02 && Math.abs(k1.chip / s0.chip - 1.3) < 0.02, `${k1.token} ${k1.chip}`);
  await go(page, 'settings');
  check(`${look}: the chosen swatch and size are shown as chosen`, (await page.getAttribute(`[data-accent-set="${GREEN}"]`, 'aria-checked')) === 'true' && (await page.getAttribute('[data-size-set="130"]', 'aria-checked')) === 'true');
  await page.click('[data-accent-set="#1961B3"]'); await page.click('[data-size-set="100"]');
  const back = await sizes(page);
  check(`${look}: 100% puts the sizes back`, Math.abs(back.token - s0.token) < 0.01 && Math.abs(back.chip - s0.chip) < 0.01, `${back.token} ${back.chip}`);
  await browser.close();
  errs.push(...errors);
}
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errs);
