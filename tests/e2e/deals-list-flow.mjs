/* New look Deals library: invented saved deals, no document reader or financial calculation.
 * Search covers every saved deal, row values remain source values, and list actions change no saved data. */
import { createRequire } from 'node:module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (name, condition, detail = '') => R.push([condition ? 'PASS' : 'FAIL', name, detail]);
const sizes = [
  ['compact-phone', { viewport: { width: 320, height: 720 } }],
  ['phone', { viewport: { width: 390, height: 844 } }],
  ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }],
];
const ids = (page) => page.$$eval('.dl-row[data-deal-id]', (rows) => rows.map((row) => row.dataset.dealId));
const saved = (page) => page.evaluate(async () => (await (await import('./app/store.js')).listDeals()).map((d) => ({ id: d.id, name: d.name, figures: d.figures, sources: d.sources, stage: d.stage, confidential: d.confidential, updatedAt: d.updatedAt })));
const actions = (page) => page.evaluate(() => [...document.querySelectorAll('#deal-root button, #deal-root label.btn')].filter((e) => !e.closest('.deals-library, .list')).map((e) => (e.textContent || e.getAttribute('aria-label') || '').trim()).filter(Boolean).sort());
async function axe(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`));
  check(`${label}: axe finds no violations`, violations.length === 0, violations.join('\n'));
}

for (const [size, options] of sizes) {
  const { browser, ctx, page, errors } = await phone(options);
  const external = [];
  page.on('request', (r) => { if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(BASE).origin) external.push(r.url()); });
  try {
    await page.goto(BASE + '#deal', { waitUntil: 'load' });
    await page.waitForSelector('#om-file', { state: 'attached' });
    if (size === 'compact-phone') {
      const emptyClassic = await actions(page);
      await page.evaluate(async () => (await import('./app/look.js')).setLook('new'));
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('#om-file', { state: 'attached' });
      const emptyNew = await actions(page);
      check('compact-phone: a new device keeps every OM, manual and example starting action', emptyClassic.every((name) => emptyNew.includes(name)) && emptyNew.includes('Choose OM') && emptyNew.includes('Enter figures by hand') && emptyNew.includes('Try a fictional example deal'));
      await page.evaluate(async () => (await import('./app/look.js')).setLook('classic'));
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('#om-file', { state: 'attached' });
    }
    await page.evaluate(async () => {
      const store = await import('./app/store.js');
      for (let i = 0; i < 35; i++) {
        const n = String(35 - i).padStart(2, '0');
        await store.saveDeal({
          id: `dl-fixture-${String(i).padStart(2, '0')}`,
          name: i === 34 ? 'Needlewood invented plaza' : `Fictional Property ${n}${i === 1 ? ' with a deliberately long name to check wrapping on narrow phones' : ''}`,
          createdAt: 1767225600000 - i * 1000, updatedAt: 1767225600000 - i * 1000,
          source: null, readAt: null, pages: 0, sources: {},
          figures: i === 2 ? { ptype: 'Office', address: '2 Invented Lane', city: 'Mapleview', price: null, cap: null, bsf: null } : i === 3 ? { ptype: 'Retail', address: '4 Invented Lane', city: 'Mapleview', price: 0, cap: 0, bsf: 0 } : { ptype: i % 2 ? 'Office' : 'Retail', address: `${i + 1} Invented Lane`, city: 'Mapleview', price: i === 0 ? 1250000 : 2000000, cap: 6.25, bsf: 20000 },
          stage: ['listing', 'contract', 'underwriting'][i % 3], confidential: i === 1,
          loan: {}, rentRoll: [], qDone: {}, myQuestions: [], live: {}, scenarios: [], visit: { notes: '', items: {}, photos: [], audio: [] },
        });
      }
      localStorage.removeItem('zlatura.deal.current');
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#deal-root .list .li');
    const classicActions = await actions(page);
    check(`${size}: Classic retains its saved deal list and three starting actions`, await page.locator('.deals-library').count() === 0 && classicActions.includes('Choose OM') && classicActions.includes('Enter figures by hand') && classicActions.includes('Try a fictional example deal'));
    const before = await saved(page);
    await page.evaluate(async () => (await import('./app/look.js')).setLook('new'));
    await page.reload({ waitUntil: 'load' });
    const present = await page.locator('.deals-library').count() > 0 || await page.locator('.deals-library').waitFor({ timeout: 3000 }).then(() => true, () => false);
    check(`${size}: New look presents a searchable Deals library`, present);
    if (!present) continue; // archived main reports the missing new behavior without timing out the remaining sizes
    const newActions = await actions(page);
    check(`${size}: every Classic starting action remains available`, classicActions.every((name) => newActions.includes(name)), `missing: ${classicActions.filter((name) => !newActions.includes(name)).join(', ')}`);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.dl-start-actions').getByRole('button', { name: 'Choose OM', exact: true }).click()]);
    check(`${size}: Choose OM at the top opens the existing file picker without uploading a document`, await chooser.element().getAttribute('id') === 'om-file');
    await chooser.setFiles([]);
    check(`${size}: the initial page contains the 30 most recently updated deals`, JSON.stringify(await ids(page)) === JSON.stringify(Array.from({ length: 30 }, (_, i) => `dl-fixture-${String(i).padStart(2, '0')}`)));
    check(`${size}: the result count announces the visible and total deals`, /Showing 30 of 35 deals/.test(await page.locator('#deals-results').textContent()) && await page.locator('#deals-results').getAttribute('role') === 'status');
    const first = page.locator('[data-deal-id="dl-fixture-00"]');
    check(`${size}: stored price, cap rate and area are displayed without recalculation`, /1\.25\s*[mM]/.test(await first.locator('.dl-price').textContent()) && /6\.25%/.test(await first.locator('.dl-cap').textContent()) && /20,000/.test(await first.locator('.dl-area').textContent()));
    const missing = page.locator('[data-deal-id="dl-fixture-02"]');
    const blanks = await Promise.all(['.dl-price', '.dl-cap', '.dl-area'].map((sel) => missing.locator(sel).textContent()));
    check(`${size}: missing source figures remain missing`, blanks.every((text) => /—/.test(text) && !/\b0\b/.test(text)), blanks.join(' | '));
    const actualZero = page.locator('[data-deal-id="dl-fixture-03"]');
    const zeros = await Promise.all(['.dl-price', '.dl-cap', '.dl-area'].map((sel) => actualZero.locator(`${sel} .dl-value`).textContent()));
    check(`${size}: explicitly saved zero figures display as zero rather than a missing value`, JSON.stringify(zeros) === JSON.stringify(['$0', '0.00%', '0']), zeros.join(' | '));
    check(`${size}: confidential status and pipeline stage are text, not color alone`, /Confidential/.test(await page.locator('[data-deal-id="dl-fixture-01"]').textContent()) && /Listing/.test(await first.textContent()));
    await page.locator('#deals-more').click();
    check(`${size}: Show more reaches all 35 deals without losing the earliest deal`, (await ids(page)).length === 35 && await page.locator('[data-deal-id="dl-fixture-34"]').count() === 1);

    const search = page.locator('#deals-search');
    await search.focus();
    await page.evaluate(() => { window.__dealsListEdits = []; document.getElementById('deals-search').addEventListener('input', () => { const started = performance.now(); requestAnimationFrame(() => window.__dealsListEdits.push(performance.now() - started)); }); });
    let prefix = ''; const lost = [];
    for (const c of 'Needlewood') {
      await page.keyboard.type(c); prefix += c;
      if (await search.inputValue() !== prefix || !await search.evaluate((e) => e === document.activeElement && e.isConnected)) lost.push(prefix);
    }
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const timings = await page.evaluate(() => window.__dealsListEdits);
    check(`${size}: every search character and keyboard focus survives filtering`, lost.length === 0, lost.join(', '));
    check(`${size}: filtering meets the 150 ms per-edit budget`, timings.length === 10 && Math.max(...timings) < 150, JSON.stringify(timings.map((n) => +n.toFixed(1))));
    check(`${size}: search covers saved deals beyond the initial 30`, JSON.stringify(await ids(page)) === JSON.stringify(['dl-fixture-34']));
    await search.fill('unmatched fictional query');
    check(`${size}: an empty search result explains the next action and keeps focus`, (await ids(page)).length === 0 && await page.locator('#deals-clear').isVisible() && await search.evaluate((e) => e === document.activeElement));
    await page.locator('#deals-clear').click();
    await page.locator('#deals-stage').selectOption('listing');
    const listing = await ids(page);
    check(`${size}: the stage filter shows only Listing deals`, listing.length === 12 && listing.every((id) => Number(id.slice(-2)) % 3 === 0), listing.join(', '));
    await page.locator('#deals-clear').click();
    await page.locator('#deals-sort').selectOption('name');
    check(`${size}: name sorting changes display order without modifying deals`, (await ids(page))[0] === 'dl-fixture-33');
    await page.locator('#deals-clear').click();

    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.evaluate(async () => (await import('./app/look.js')).setTextSize(130));
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(`${size}, ${theme}, 130%: the Deals list fits the viewport`, overflow <= 0, `${overflow}px`);
      if (size !== 'desktop') {
        const small = await page.evaluate(() => [...document.querySelectorAll('.deals-library button, .deals-library input, .deals-library select')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.width < 43.5 || r.height < 43.5); }).map((e) => `${e.id || e.className}: ${e.getBoundingClientRect().width}×${e.getBoundingClientRect().height}`));
        check(`${size}, ${theme}, 130%: list controls meet 44 px touch targets`, small.length === 0, small.join('; '));
      }
      await axe(page, `${size}, ${theme}, 130%`);
    }
    if (size !== 'compact-phone') {
      await page.emulateMedia({ colorScheme: 'light' });
      await page.evaluate(async () => (await import('./app/look.js')).setTextSize(100));
      await page.screenshot({ path: `${SHOTS}deals-list-${size}.png`, fullPage: false });
    }
    check(`${size}: filtering and sorting leave every saved source figure and deal record unchanged`, JSON.stringify(await saved(page)) === JSON.stringify(before));
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.deals-library');
    check(`${size}: reloading keeps the same 35 deals and unchanged source data`, JSON.stringify(await saved(page)) === JSON.stringify(before));
    await page.evaluate(async () => (await import('./app/crm.js')).saveStages({ listing: { label: 'Listed inventory' } }));
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.deals-library');
    const renamedOption = await page.locator('#deals-stage option[value="listing"]').textContent();
    const renamedRow = await page.locator('[data-deal-id="dl-fixture-00"] .dl-stage').textContent();
    check(`${size}: saved firm stage names appear in rows and filters after reopening Deals`, renamedOption === 'Listed inventory' && renamedRow === 'Listed inventory', `${renamedOption} | ${renamedRow}`);
    await page.locator('#deals-stage').selectOption('listing');
    check(`${size}: a renamed stage keeps its stable key and filters the same deals`, (await ids(page)).length === 12 && (await ids(page)).every((id) => Number(id.slice(-2)) % 3 === 0) && JSON.stringify(await saved(page)) === JSON.stringify(before));
    await page.evaluate(async () => (await import('./app/crm.js')).saveStages({}));
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.deals-library');
    if (size === 'phone') {
      await page.waitForFunction(() => !!navigator.serviceWorker?.controller);
      const cached = await page.evaluate(async () => !!(await caches.match(new URL('app/dealslist.js', location.href).href)));
      check('phone: the Deals library module is in the offline app cache', cached);
      await ctx.setOffline(true);
      try {
        await page.reload({ waitUntil: 'load' });
        await page.waitForSelector('.deals-library');
        await page.locator('#deals-search').fill('Needlewood');
        check('phone: cached Deals opens and searches all saved deals offline', JSON.stringify(await ids(page)) === JSON.stringify(['dl-fixture-34']) && JSON.stringify(await saved(page)) === JSON.stringify(before));
        await page.locator('#deals-clear').click();
      } finally { await ctx.setOffline(false); }
    }
    await page.locator('[data-deal-id="dl-fixture-00"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#deal-card h1');
    check(`${size}: keyboard activation opens the selected deal`, await page.evaluate(async () => (await import('./app/dealui.js')).currentDealId()) === 'dl-fixture-00' && (await page.locator('#deal-card h1').textContent()).trim() === 'Fictional Property 35');
    await page.locator('#deal-toolbar').getByRole('button', { name: 'All deals', exact: true }).click();
    await page.waitForSelector('.deals-library');
    await page.locator('.dl-start-actions').getByRole('button', { name: 'New deal', exact: true }).click();
    await page.waitForSelector('#fig-price');
    const blank = await page.evaluate(async () => { const m = await import('./app/dealui.js'); const id = m.currentDealId(); return (await m.listAllDeals()).find((d) => d.id === id); });
    check(`${size}: New deal at the top opens the existing manual-entry workflow with blank financial inputs`, !!blank && !blank.id.startsWith('dl-fixture-') && ['price', 'noi', 'cap'].every((key) => blank.figures[key] === null || blank.figures[key] === undefined));
    check(`${size}: the list makes no external request`, external.length === 0, external.join('\n'));
    check(`${size}: no browser errors`, errors.length === 0, errors.join('\n'));
  } catch (error) {
    check(`${size}: workflow completes`, false, error.stack || String(error));
  } finally { await browser.close(); }
}
for (const row of R) console.log(row.join(' | '));
finish(R);
