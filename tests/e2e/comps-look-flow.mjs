/* New look Comps: invented comps entered by hand, using the existing editing and export paths.
 * The reader is not invoked. Classic keeps its controls; new shortcuts stay separate from data-add. */
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (name, condition, detail = '') => R.push([condition ? 'PASS' : 'FAIL', name, detail]);
const sizes = [
  ['compact-phone', { viewport: { width: 320, height: 740 } }],
  ['phone', { viewport: { width: 390, height: 844 } }],
  ['tablet', { viewport: { width: 768, height: 1024 } }],
  ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }],
];
const saleRows = (page) => page.locator('#sales-table tbody tr[data-key]');
const listingRows = (page) => page.locator('#market-table tbody tr[data-key]');
const field = (row, label) => row.getByRole('textbox', { name: label, exact: true });
const look = (page, value) => page.evaluate(async (v) => (await import('./app/look.js')).setLook(v), value);
const source = (page) => page.evaluate(async () => {
  const s = await (await import('./app/store.js')).loadSession();
  return { docs: (s?.docs || []).length, manual: (s?.manual || []).map((c) => Object.fromEntries(['key', 'name', 'kind', 'price', 'bsf', 'date', 'cap', 'occ', 'zoning', 'lot_sf', 'dom', 'exclude', 'origin', 'source'].map((k) => [k, c[k] ?? null]))).sort((a, b) => a.name.localeCompare(b.name)) };
});
// Await the store read before deciding whether to poll again. A Promise itself
// is truthy in waitForFunction and cannot establish that IndexedDB has settled.
async function waitSource(page, predicate, reason) {
  const until = Date.now() + 15000;
  let actual;
  do {
    actual = await source(page);
    if (predicate(actual)) return actual;
    await page.waitForTimeout(30);
  } while (Date.now() < until);
  throw new Error(`${reason}: saved source did not settle: ${JSON.stringify(actual)}`);
}
const controlIds = (page) => page.$$eval('#view-comps [id]', (nodes) => nodes.filter((n) => /^(INPUT|SELECT|BUTTON|DETAILS)$/.test(n.tagName)).map((n) => n.id).sort());
async function type(page, locator, value, name) {
  await locator.fill(''); await locator.focus();
  let prefix = ''; const lost = [];
  for (const ch of value) {
    await page.keyboard.type(ch); prefix += ch;
    if (await locator.inputValue() !== prefix || !await locator.evaluate((n) => n.isConnected && document.activeElement === n)) lost.push(prefix);
  }
  check(`${name}: every character and focus is kept`, lost.length === 0, lost.join(' | '));
  await page.keyboard.press('Tab');
  // Finish the measured edit frame before the runner starts another action.
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
async function axe(page, label) {
  if (!await page.evaluate(() => !!window.axe)) await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'],
  })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`));
  check(`${label}: axe finds no violations`, violations.length === 0, violations.join('\n'));
}
async function small(page) {
  return page.evaluate(() => {
    const out = [];
    for (const n of document.querySelectorAll('#view-comps button, #view-comps select, #view-comps input:not([type=file]):not([type=hidden]):not(.di-native), #view-comps summary, #view-comps label.btn')) {
      const css = getComputedStyle(n); if (css.visibility === 'hidden' || css.display === 'none') continue;
      let b = n.getBoundingClientRect(); if (!b.width || !b.height) continue;
      if (n.matches('input[type=checkbox],input[type=radio]') && n.closest('label')) b = n.closest('label').getBoundingClientRect();
      if (b.width < 43.5 || b.height < 43.5) out.push(`${n.tagName} ${n.getAttribute('aria-label') || n.id || n.textContent?.trim()} ${b.width.toFixed(1)}×${b.height.toFixed(1)}`);
    }
    return out;
  });
}
async function undo(page) { await page.locator('.toast button', { hasText: 'Undo' }).click(); }

for (const [size, options] of sizes) {
  const { browser, page, errors } = await phone(options);
  const requests = []; page.on('request', (r) => requests.push(r.url()));
  page.setDefaultTimeout(10000);
  try {
    await page.goto(BASE + '#comps', { waitUntil: 'load' });
    await page.waitForSelector('#view-comps', { state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    const classic = await controlIds(page);
    check(`${size}: Classic keeps its original two Add controls`, await page.locator('#view-comps [data-add]').count() === 2);
    check(`${size}: Classic does not display the new manual shortcuts`, await page.locator('[data-ui-add]:visible').count() === 0);
    await look(page, 'new');
    const shortcut = page.locator('#drop [data-ui-add="sale"]');
    const present = await shortcut.count() > 0;
    check(`${size}: New look offers manual sale entry before any upload`, present && await shortcut.isVisible());
    if (!present) continue; // archived main reports the missing new behavior at each size
    const modern = await controlIds(page);
    check(`${size}: every original control remains`, classic.every((id) => modern.includes(id)), classic.filter((id) => !modern.includes(id)).join(', '));
    check(`${size}: new shortcuts preserve the original Add selectors`, await page.locator('#view-comps [data-add]').count() === 2 && await page.locator('#view-comps [data-ui-add]').count() === 4);
    check(`${size}: file and example starting actions remain`, await page.locator('#drop label[for="file"]').isVisible() && await page.locator('#example').isVisible());

    await page.evaluate(() => {
      window.__compsUIInputMs = []; window.__compsUICommitMs = []; window.__compsUISlow = []; window.__compsUILongTasks = [];
      new PerformanceObserver((entries) => window.__compsUILongTasks.push(...entries.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })))).observe({ type: 'longtask', buffered: true });
      for (const [event, store] of [['input', '__compsUIInputMs'], ['change', '__compsUICommitMs']]) document.getElementById('view-comps').addEventListener(event, (ev) => {
        const started = performance.now(); const target = ev.target.getAttribute('aria-label') || ev.target.id || ev.target.tagName;
        requestAnimationFrame(() => { const duration = performance.now() - started; window[store].push(duration); if (duration >= 100) window.__compsUISlow.push({ event, target, duration, start: started }); });
      }, { capture: true });
    });
    await shortcut.focus(); await page.keyboard.press('Enter');
    await saleRows(page).first().waitFor();
    let sale = saleRows(page).first();
    check(`${size}: manual entry opens the same editable sale grid`, await field(sale, 'Property name').inputValue() === 'New sale comp' && await field(sale, 'Sale price').inputValue() === '');
    await type(page, field(sale, 'Property name'), 'Fictional Cedar Court', `${size}: property name`);
    await type(page, field(sale, 'Sale price'), '3300000', `${size}: sale price`);
    await type(page, field(sale, 'Building SF'), '6000', `${size}: building SF`);
    await type(page, field(sale, 'Sale date'), '02/29/2024', `${size}: sale date`);
    await type(page, field(sale, 'Cap rate, percent'), '6.25', `${size}: cap rate`);
    await type(page, field(sale, 'Occupancy, percent'), '95', `${size}: occupancy`);
    await type(page, field(sale, 'Zoning'), 'TEST', `${size}: zoning`);
    await type(page, field(sale, 'Lot SF'), '0', `${size}: explicit zero area`);
    check(`${size}: the existing date control keeps the chosen leap day`, await field(sale, 'Sale date').inputValue() === '02/29/2024' && await sale.locator('.dateinput').evaluate((n) => n.value) === '2024-02-29');
    check(`${size}: the existing comp calculation is unchanged`, await sale.locator('.calc').textContent() === '$550.00');
    check(`${size}: a real zero remains visible while blank inputs stay blank`, await field(sale, 'Lot SF').inputValue() === '0');
    await page.locator('#addbar [data-ui-add="market"]').click();
    await listingRows(page).first().waitFor();
    const listing = listingRows(page).first();
    check(`${size}: a listing can be added after the empty hero disappears`, await page.locator('#drop').isHidden() && await field(listing, 'Property name').inputValue() === 'New listing');
    await type(page, field(listing, 'Property name'), 'Fictional Willow Listing', `${size}: listing name`);
    check(`${size}: an unfilled listing price is still blank`, await field(listing, 'Asking price').inputValue() === '');
    await type(page, field(listing, 'Asking price'), '0', `${size}: zero price`);
    check(`${size}: an explicitly typed zero price is retained`, await field(listing, 'Asking price').inputValue() === '0');
    await type(page, field(listing, 'Asking price'), '2400000', `${size}: asking price`);
    await type(page, field(listing, 'Building SF'), '4000', `${size}: listing SF`);
    await type(page, field(listing, 'Days on market'), '0', `${size}: days on market`);
    await type(page, field(listing, 'Cap rate, percent'), '0', `${size}: zero cap rate`);
    check(`${size}: the listing retains the existing independent calculation`, await listing.locator('.calc').textContent() === '$600.00');
    await page.locator('#addbar [data-ui-add="sale"]').click();
    const second = saleRows(page).last();
    await type(page, field(second, 'Property name'), 'Fictional Birch Sale', `${size}: second sale`);
    await type(page, field(second, 'Sale price'), '1100000', `${size}: second price`);
    await type(page, field(second, 'Building SF'), '1000', `${size}: second SF`);
    await page.locator('#sale-sort').selectOption('price');
    sale = saleRows(page).first();
    check(`${size}: sorting keeps the larger stored sale price first`, await field(sale, 'Property name').inputValue() === 'Fictional Cedar Court' && await field(saleRows(page).last(), 'Property name').inputValue() === 'Fictional Birch Sale');
    await page.locator('#sale-sort').selectOption('name');
    check(`${size}: name ordering still works`, await field(saleRows(page).first(), 'Property name').inputValue() === 'Fictional Birch Sale');
    await page.locator('#sale-sort').selectOption('price');
    const matches = (record, expected) => record && Object.entries(expected).every(([key, value]) => isDeepStrictEqual(record[key], value));
    const before = await waitSource(page, (saved) => saved.docs === 0 && saved.manual.length === 3
      && matches(saved.manual.find((c) => c.name === 'Fictional Cedar Court'), { kind: 'sale', price: 3300000, bsf: 6000, cap: 6.25, occ: 95, zoning: 'TEST', lot_sf: 0 })
      && saved.manual.find((c) => c.name === 'Fictional Cedar Court')?.date?.startsWith('2024-02-29')
      && matches(saved.manual.find((c) => c.name === 'Fictional Willow Listing'), { kind: 'market', price: 2400000, bsf: 4000, dom: 0, cap: 0 })
      && matches(saved.manual.find((c) => c.name === 'Fictional Birch Sale'), { kind: 'sale', price: 1100000, bsf: 1000, cap: null }), 'Typed manual records');
    await look(page, 'classic');
    check(`${size}: the original first Add controls stay visible in Classic`, await page.locator('#view-comps [data-add="sale"]').first().isVisible() && await page.locator('#view-comps [data-add="market"]').first().isVisible());
    await look(page, 'new');
    check(`${size}: manual comps keep their own source rather than inventing document provenance`, before.docs === 0 && before.manual.length === 3 && before.manual.every((c) => c.origin?.kind === 'hand' && c.origin?.file === null));
    check(`${size}: saved blanks and zero values remain distinct`, before.manual.find((c) => c.name === 'Fictional Cedar Court').lot_sf === 0 && before.manual.find((c) => c.name === 'Fictional Willow Listing').cap === 0 && before.manual.find((c) => c.name === 'Fictional Birch Sale').cap === null);

    await type(page, page.locator('#sale-search'), 'Cedar', `${size}: search`);
    await page.waitForFunction(() => document.querySelectorAll('#sales-table tbody tr[data-key]').length === 1 && document.querySelector('#sales-table input[aria-label="Property name"]')?.value === 'Fictional Cedar Court');
    check(`${size}: search keeps the matching comp`, await saleRows(page).count() === 1 && await field(saleRows(page).first(), 'Property name').inputValue() === 'Fictional Cedar Court');
    await page.locator('#sale-search').fill('');
    await page.waitForFunction(() => document.querySelectorAll('#sales-table tbody tr[data-key]').length === 2);
    await page.locator('#sales-window').selectOption('12');
    check(`${size}: the sale-date window still marks the old sale as outside`, await saleRows(page).first().evaluate((n) => n.classList.contains('off')) && /outside window/.test(await saleRows(page).first().textContent()));
    await page.locator('#sales-window').selectOption('0');
    sale = saleRows(page).first();
    const checkbox = sale.locator('input.tog');
    const label = sale.locator('label.comp-include');
    check(`${size}: inclusion is a native labeled checkbox`, await label.count() === 1 && await label.locator('input.tog').count() === 1 && await checkbox.isChecked());
    await label.click();
    check(`${size}: its enlarged target actually changes inclusion`, !await checkbox.isChecked() && await sale.evaluate((n) => n.classList.contains('off')));
    await label.click();
    check(`${size}: inclusion can be restored through the same label`, await checkbox.isChecked() && !await sale.evaluate((n) => n.classList.contains('off')));
    await page.locator('#sales-sec [data-bulk="sale"]').click();
    check(`${size}: All / none still sets every visible sale aside`, await saleRows(page).locator('input.tog:checked').count() === 0);
    await undo(page);
    check(`${size}: Undo restores bulk inclusion`, await saleRows(page).locator('input.tog:checked').count() === 2);
    await saleRows(page).first().getByRole('button', { name: /^Move to On Market:/ }).click();
    check(`${size}: a comp still moves between the existing tables`, await saleRows(page).count() === 1 && await listingRows(page).count() === 2);
    await undo(page);
    check(`${size}: Undo restores the source table`, await saleRows(page).count() === 2 && await listingRows(page).count() === 1);
    await saleRows(page).first().getByRole('button', { name: /^Remove this comp:/ }).click();
    check(`${size}: a manual comp can still be removed`, await saleRows(page).count() === 1);
    await undo(page);
    check(`${size}: Undo restores the removed comp`, await saleRows(page).count() === 2);
    await page.locator('#sale-sort').selectOption('price');
    await page.locator('#comps-more').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.action-sheet .action-item', { hasText: 'CSV' }).first().click()]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    check(`${size}: CSV still contains every manual sale and listing`, ['Fictional Cedar Court', 'Fictional Birch Sale', 'Fictional Willow Listing'].every((name) => csv.includes(name)));
    await waitSource(page, (saved) => isDeepStrictEqual(saved, before), 'Undo and view controls');
    check(`${size}: searching, sorting and Undo preserve saved source values`, isDeepStrictEqual(await source(page), before));

    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.evaluate(async () => (await import('./app/look.js')).setTextSize(130));
      await page.evaluate(() => document.fonts.ready);
      check(`${size}, ${theme}: enlarged text does not push the page sideways`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      // axe performs its own long DOM analysis; do not let it delay a pending measured edit frame.
      await page.evaluate(() => new Promise(requestAnimationFrame));
      await axe(page, `${size}, ${theme}, 130% text`);
      if (options.isMobile !== false) { const targets = await small(page); check(`${size}, ${theme}: touch targets are at least 44 px`, targets.length === 0, targets.join('\n')); }
      const still = await page.$$eval('#view-comps .ctable tbody td, #view-comps .btn', (nodes) => nodes.every((n) => getComputedStyle(n).transitionDuration.split(',').every((v) => parseFloat(v) === 0) && getComputedStyle(n).animationName === 'none'));
      check(`${size}, ${theme}: reduced motion stops the new transitions`, still);
      const headers = await page.$$eval('#sales-table thead th', (nodes) => nodes.every((n) => n.scope === 'col'));
      check(`${size}, ${theme}: the editable table retains meaningful headings`, headers && /editable property figures/.test(await page.locator('#sales-table caption').textContent()));
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(async () => (await import('./app/look.js')).setMotion(false));
    const paused = await page.$$eval('#view-comps .ctable tbody td, #view-comps .btn', (nodes) => nodes.every((n) => getComputedStyle(n).transitionDuration.split(',').every((v) => parseFloat(v) === 0) && getComputedStyle(n).animationName === 'none'));
    check(`${size}: the in-app motion switch also stops transitions`, paused);
    if (size === 'phone' || size === 'desktop') await page.locator('#sales-sec').scrollIntoViewIfNeeded();
    if (size === 'phone' || size === 'desktop') await page.screenshot({ path: `${SHOTS}comps-look-${size}.png` });
    const times = await page.evaluate(() => ({ input: window.__compsUIInputMs, commit: window.__compsUICommitMs }));
    check(`${size}: typing paints within the 150 ms budget`, times.input.length > 20 && Math.max(...times.input) < 150, `${Math.max(...times.input).toFixed(1)} ms; ${JSON.stringify(await page.evaluate(() => ({ slow: window.__compsUISlow, longTasks: window.__compsUILongTasks })))}`);
    check(`${size}: committed edits paint within the 150 ms budget`, times.commit.length >= 10 && Math.max(...times.commit) < 150, `${Math.max(...times.commit).toFixed(1)} ms; ${JSON.stringify(await page.evaluate(() => ({ slow: window.__compsUISlow, longTasks: window.__compsUILongTasks })))}`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#sales-table tbody tr[data-key]').length === 2 && document.querySelectorAll('#market-table tbody tr[data-key]').length === 1);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#sale-sort').selectOption('price');
    check(`${size}: source records survive reload exactly`, isDeepStrictEqual(await source(page), before));
    check(`${size}: the restored sale keeps its date and zero area`, await field(saleRows(page).first(), 'Sale date').inputValue() === '02/29/2024' && await field(saleRows(page).first(), 'Lot SF').inputValue() === '0');
    const outside = requests.filter((url) => !['data:', 'blob:'].some((prefix) => url.startsWith(prefix)) && new URL(url).origin !== new URL(BASE).origin);
    check(`${size}: manual entry makes no outside request`, outside.length === 0, outside.join('\n'));
    check(`${size}: no browser errors`, errors.length === 0, errors.join('\n'));
  } catch (err) { check(`${size}: workflow completes`, false, String(err.stack || err).slice(0, 2200)); }
  finally { await browser.close(); }
}
for (const row of R) console.log(row.join(' | '));
finish(R);
