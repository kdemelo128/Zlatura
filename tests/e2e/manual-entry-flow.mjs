/* A deal started by hand exposes every existing figure before any upload.
 * Blank stays blank; typing uses the usual parser, provenance and save path. */
import { createRequire } from 'node:module';
import { phone, BASE, finish } from './lib.mjs';
import { DEAL_INPUTS } from '../../app/dealfields.js';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined }]]) {
  const { browser, page, errors } = await phone(opts);
  try {
    await page.goto(BASE + '#deal', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Enter figures by hand', exact: true }).click();
    await page.waitForSelector('#fig-price');
    const missing = [];
    for (const { key } of DEAL_INPUTS) if (!(await page.locator(`#fig-${key}`).isVisible())) missing.push(key);
    check(`${size}: all ${DEAL_INPUTS.length} figure inputs are visible without a document or expansion`, !missing.length, missing.join(', '));
    check(`${size}: every field starts blank`, await page.locator('input[id^="fig-"]').evaluateAll((inputs) => inputs.every((i) => i.value === '')));
    const entries = [['address', '123 Fictional Way', '123 Fictional Way'], ['price', '4.5m', 4500000], ['noi_pf', '350k', 350000], ['cap_pf', '6.25%', 6.25], ['units', '12', 12], ['tenant', 'Invented tenant', 'Invented tenant']];
    for (const [key, text] of entries) {
      const input = page.locator(`#fig-${key}`);
      if (!(await input.isVisible())) continue; // old-code run still reaches the remaining assertions
      await input.focus();
      let prefix = ''; const bad = [];
      for (const ch of text) {
        await page.keyboard.type(ch); prefix += ch;
        if (await input.inputValue() !== prefix || !(await input.evaluate((i) => document.activeElement === i))) bad.push(prefix);
      }
      check(`${size}: ${key} accepts each character without losing focus`, !bad.length, bad.join(', '));
      await page.keyboard.press('Tab');
    }
    await page.evaluate(() => { location.hash = '#home'; });
    await page.waitForSelector('#view-home', { state: 'visible' });
    await page.reload({ waitUntil: 'load' });
    await page.evaluate(() => { location.hash = '#deal'; });
    await page.waitForSelector('#fig-price');
    const saved = await page.evaluate(async () => {
      const m = await import('./app/dealui.js');
      const all = await m.listAllDeals();
      return all.find((d) => d.id === localStorage.getItem('zlatura.deal.current'));
    });
    for (const [key, , value] of entries) check(`${size}: ${key} survives leaving and reloading`, saved?.figures[key] === value);
    check(`${size}: typed fields keep their provenance`, entries.every(([key]) => saved?.sources[key]?.hand));
    check(`${size}: untouched figures are missing, not zero`, saved?.figures.noi == null && saved?.figures.cap == null && saved?.figures.gpr == null);
    check(`${size}: no uploaded document is required`, saved?.source === null && saved?.pages === 0);
    const hiddenAfter = [];
    for (const { key } of DEAL_INPUTS) if (!(await page.locator(`#fig-${key}`).isVisible())) hiddenAfter.push(key);
    check(`${size}: all fields remain available after reopening`, !hiddenAfter.length, hiddenAfter.join(', '));
    await page.addScriptTag({ path: AXE });
    const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } } })).violations.map((v) => v.id));
    check(`${size}: axe finds no accessibility violations`, !violations.length, violations.join(', '));
    check(`${size}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`${size}: no browser errors`, !errors.length, errors.join('\n'));
  } finally { await browser.close(); }
}
for (const [s, n, d] of R) console.log(s, '|', n, d);
finish(R);
