/* Public data (K6) end to end, at iPhone and desktop size, with NO live network: every public site is answered by
 * page.route from the recorded responses in tests/fixtures/publicdata/. Checks: the consent sheet (and that Cancel sends
 * nothing), the extra confirm for a confidential deal, results with their source and date, Use only where a deal field fits,
 * Use records the source and date as the field's source and can be undone, blank stays blank, the "Open in" menu links
 * (new tab, noopener), the Connect page's Public data rows and states, the Census key (saved on the device, absent from
 * a backup), and that no request left for a host that is not on the list. Invented address; recorded public responses. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const FX = new URL('../fixtures/publicdata/', import.meta.url).pathname;
const fx = (n) => fs.readFileSync(`${FX}${n}.json`, 'utf8');
const ALLOWED = ['nominatim.openstreetmap.org', 'maps2.dcgis.dc.gov', 'geo.fcc.gov', 'hazards.fema.gov', 'opendata.maryland.gov', 'data.montgomerycountymd.gov', 'api.fiscaldata.treasury.gov', 'markets.newyorkfed.org', 'api.census.gov'];

function answer(u) {
  const url = new URL(u); const p = decodeURIComponent(url.pathname + url.search);
  switch (url.hostname) {
    case 'maps2.dcgis.dc.gov': return p.includes('GeocodeServer') ? 'dc-mar' : p.includes('MapServer/40') ? 'dc-parcel' : p.includes('MapServer/9/') ? 'dc-zoning' : p.includes('FEEDS/DCRA') ? 'dc-permits' : null;
    case 'geo.fcc.gov': return 'fcc-dc';
    case 'hazards.fema.gov': return p.includes('/28/') ? 'fema-zone' : p.includes('/3/') ? 'fema-panel' : null;
    case 'api.fiscaldata.treasury.gov': return p.includes('10-Year') ? 'treasury-10y' : 'treasury-5y';
    case 'markets.newyorkfed.org': return 'sofr';
    case 'nominatim.openstreetmap.org': return 'nominatim-dc';
    case 'api.census.gov': return p.includes('for=tract') ? 'census-tract' : 'census-county';
    default: return null;
  }
}

for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined }]]) {
  const { browser, page, errors } = await phone(opts);
  const L = (s) => `${size}: ${s}`;
  const sent = []; const unexpected = [];
  await page.route((u) => !u.href.startsWith(BASE) && !/^(data|blob):/.test(u.href), async (route) => {
    const u = route.request().url(); const host = new URL(u).hostname;
    const name = ALLOWED.includes(host) ? answer(u) : null;
    if (!name) { unexpected.push(u); return route.abort(); }
    sent.push(u);
    return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: fx(name) });
  });
  const pause = (ms = 300) => page.waitForTimeout(ms);
  const mod = (file, fn, ...a) => page.evaluate(async ([f, src, args]) => { const m = await import(new URL(f, location.href).href); return (0, eval)(`(${src})`)(m, ...args); }, [file, fn.toString(), a]);
  const KEY = '0123456789abcdef0123456789abcdef01234567';
  try {
    await page.goto(BASE + '#deal', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Enter figures by hand', exact: true }).click();
    await page.waitForSelector('#fig-address');
    for (const [k, v] of [['address', '1801 F Street NW'], ['city', 'Washington'], ['state', 'DC']]) { await page.fill(`#fig-${k}`, v); await page.keyboard.press('Tab'); }
    await pause();
    check(L('the Public data card is on the deal'), await page.locator('#deal-public h2', { hasText: 'Public data' }).count() === 1);
    check(L('nothing is looked up before the broker asks'), sent.length === 0);

    // consent: names the sites, says the figures are not sent; Cancel sends nothing
    await page.click('#public-lookup-btn');
    await page.waitForSelector('dialog.action-sheet[open]');
    const consent = (await page.locator('dialog.action-sheet[open]').innerText()).replace(/\s+/g, ' ');
    check(L('the consent sheet names the sites'), /maps2\.dcgis\.dc\.gov/.test(consent) && /geo\.fcc\.gov/.test(consent) && /hazards\.fema\.gov/.test(consent) && /api\.fiscaldata\.treasury\.gov/.test(consent), consent.slice(0, 200));
    check(L('it says the deal’s figures are not sent'), /figures are not sent/.test(consent));
    check(L('it does not list the Census site without a key'), !/api\.census\.gov/.test(consent));
    await page.locator('dialog.action-sheet[open] .action-cancel').click();
    await pause();
    check(L('Cancel sends nothing'), sent.length === 0);
    await page.click('#public-lookup-btn');
    await page.locator('dialog.action-sheet[open] .action-item', { hasText: 'Look up' }).click();
    await page.waitForSelector('#public-results .pd-row');
    const rows = await page.$$eval('#public-results .pd-row', (r) => r.map((x) => ({ id: x.dataset.id, text: x.innerText.replace(/\s+/g, ' '), use: !!x.querySelector('.pd-use'), link: x.querySelector('a')?.href || '' })));
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    check(L('results come as rows with a source name and a date'), rows.length >= 8 && rows.every((r) => / · (as of \d{4}|looked up today|\d{4}-\d{4})/.test(r.text)), JSON.stringify(rows.map((r) => r.id)));
    check(L('flood zone shows the zone and the FEMA map’s effective date'), /Zone X/.test(by.flood?.text || '') && /as of 2010-09-27/.test(by.flood.text), by.flood?.text);
    check(L('the assessed value is labelled as the county’s, not a tax bill or a market value'), /Assessed value \(county\)/.test(by.assessed?.text || '') && /Not the tax bill and not a market value/.test(by.assessed.text) && /\$9,275,220/.test(by.assessed.text), by.assessed?.text);
    check(L('treasury rate has its percent and its date'), /4\.683%/.test(by['ust-10-Year']?.text || '') && /2026-08-12/.test(by['ust-10-Year'].text));
    check(L('each row has a link to its source'), rows.filter((r) => r.id !== 'geo').every((r) => r.link.startsWith('https://')), rows.filter((r) => !r.link).map((r) => r.id).join(','));
    check(L('Use is offered for zoning and land area only; not for the flood zone or the assessed value'), by.zoning?.use && by.lot?.use && !by.flood.use && !by.assessed.use && rows.filter((r) => r.use).length === 2, rows.filter((r) => r.use).map((r) => r.id).join(','));
    check(L('nothing was filled silently: zoning and land SF are still blank'), (await page.inputValue('#fig-zoning')) === '' && (await page.inputValue('#fig-lot_sf')) === '');
    check(L('only listed hosts were asked, none by a redirect, and nothing unexpected'), unexpected.length === 0 && sent.every((u) => ALLOWED.includes(new URL(u).hostname)), unexpected.join(' '));
    check(L('the District’s own address service placed it (no Nominatim call)'), !sent.some((u) => u.includes('nominatim')));

    // axe on the results and on the consent-free card (both looks use the same markup)
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
    const viol = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
    check(L('axe: the deal with its Public data results'), viol.length === 0, viol.join('\n    '));

    // Use records the source and date, and can be undone
    await page.locator('#public-results .pd-row[data-id="zoning"] .pd-use').click();
    await page.waitForSelector('#fig-zoning');
    await pause(500);
    check(L('Use puts the zoning on the deal'), (await page.inputValue('#fig-zoning')) === 'C-3-C');
    const src = await mod('app/store.js', (m) => m.listDeals().then((ds) => { const d = ds.find((x) => x.figures && x.figures.zoning); return d && d.sources.zoning; }));
    check(L('the field’s source records the site, a link and the date'), !!src && !!src.pub && /DC zoning map/.test(src.pub.name) && src.pub.link.startsWith('https://') && /^\d{4}-\d{2}-\d{2}$/.test(src.pub.date) && src.hand === false, JSON.stringify(src));
    check(L('the figure shows a "public" tag'), await page.locator('#fig-zoning').evaluate((i) => !!i.closest('li').querySelector('.src[title*="DC zoning map"]')));
    check(L('the results stay on screen after the redraw'), await page.locator('#public-results .pd-row').count() >= 8);
    await page.locator('.toast button', { hasText: 'Undo' }).click();
    await pause(500);
    check(L('Undo puts the blank back'), (await page.inputValue('#fig-zoning')) === '');
    await page.locator('#public-results .pd-row[data-id="lot"] .pd-use').click();
    await pause(500);
    check(L('Use on land area fills Land SF as a whole number'), (await page.inputValue('#fig-lot_sf')).replace(/,/g, '') === '13518', await page.inputValue('#fig-lot_sf'));

    // the Open in menu
    const btn = page.locator('.deal-head .openin-btn');
    const box = await btn.boundingBox();
    check(L('the Open in button is a 44 px target'), box.width >= 44 && box.height >= 44, `${box.width}x${box.height}`);
    await btn.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog.openin-sheet[open]');
    const links = await page.$$eval('dialog.openin-sheet a', (a) => a.map((x) => ({ id: x.dataset.link, href: x.href, target: x.target, rel: x.rel, h: x.getBoundingClientRect().height })));
    const ids = links.map((l) => l.id);
    check(L('the menu offers Google Maps, Apple Maps, Street View and the searches'), ['google-maps', 'apple-maps', 'street-view', 'search-address'].every((i) => ids.includes(i)), ids.join(','));
    check(L('the links are encoded and open in a new tab without a referrer'), links.every((l) => l.target === '_blank' && /noopener/.test(l.rel) && /noreferrer/.test(l.rel)) && links.find((l) => l.id === 'google-maps').href === 'https://www.google.com/maps/search/?api=1&query=1801%20F%20Street%20NW%2C%20Washington%2C%20DC' && links.find((l) => l.id === 'apple-maps').href.startsWith('https://maps.apple.com/?q=1801%20F%20Street%20NW'), JSON.stringify(links[0]));
    check(L('each link is a 44 px target'), links.every((l) => l.h >= 44), links.map((l) => l.h).join(','));
    await page.keyboard.press('Escape');
    await pause();
    check(L('Escape closes it and focus returns to the button'), (await page.locator('dialog.openin-sheet').count()) === 0 && (await page.evaluate(() => document.activeElement?.classList.contains('openin-btn'))));

    // a confidential deal gets a second confirm; nothing is sent on Cancel
    const id = await page.evaluate(() => localStorage.getItem('zlatura.deal.current'));
    await mod('app/store.js', async (m, i) => { const d = await m.loadDeal(i); d.confidential = true; await m.saveDeal(d); }, id);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#public-lookup-btn');
    const before = sent.length;
    await page.click('#public-lookup-btn');
    await page.locator('dialog.action-sheet[open] .action-item', { hasText: 'Look up' }).click();
    await page.waitForSelector('dialog.action-sheet[open]');
    const conf = (await page.locator('dialog.action-sheet[open]').innerText()).replace(/\s+/g, ' ');
    check(L('a confidential deal gets a second, plainer confirm'), /confidential/i.test(conf) && /Look up anyway/.test(conf), conf.slice(0, 160));
    await page.locator('dialog.action-sheet[open] .action-cancel').click();
    await pause();
    check(L('Cancel at the confidential confirm sends nothing'), sent.length === before);
    await page.click('#public-lookup-btn');
    await page.waitForSelector('dialog.action-sheet[open]');
    await page.locator('dialog.action-sheet[open] .action-item', { hasText: 'Look up anyway' }).click();
    await page.waitForSelector('#public-results .pd-row');
    check(L('after the confirm it looks up'), sent.length > before);

    // the Connect page
    await page.evaluate(() => { location.hash = '#connect'; });
    await page.waitForSelector('#connect-list');
    const heads = await page.$$eval('#connect-list h2', (h) => h.map((x) => x.textContent));
    check(L('Connect has the Public data (DC, Maryland, Virginia) category'), heads.includes('Public data (DC, Maryland, Virginia)'), heads.join('|'));
    const states = await page.$$eval('[data-cat="public"] .conn-row', (r) => r.map((x) => [x.dataset.id, x.querySelector('button').dataset.state]));
    const st = Object.fromEntries(states);
    check(L('rows show Ready, Needs a key and Not available from a browser'), st['maps-search'] === 'Ready' && st.fema === 'Ready' && st.census === 'Needs a key' && st['va-parcel'] === 'Not available from a browser', JSON.stringify(states));
    await page.locator('[data-cat="public"] [data-id="va-parcel"] button').click();
    await page.waitForSelector('#sheet-body');
    check(L('a refused source says why'), /marked deprecated|does not answer|not allowed|no county service/i.test(await page.textContent('#sheet-body')));
    await page.keyboard.press('Escape'); await pause();
    await page.locator('[data-cat="public"] [data-id="maps-search"] button').click();
    await page.fill('#maps-address', '1 Example Plaza, Sampletown, MD');
    await page.click('#maps-go');
    await page.waitForSelector('dialog.openin-sheet[open]');
    check(L('Maps and search opens the same menu for a typed address'), (await page.locator('dialog.openin-sheet a').count()) >= 4);
    await page.keyboard.press('Escape'); await pause();
    await page.keyboard.press('Escape'); await pause();

    // the Census key: saved on the device, validated, absent from a backup
    await page.locator('[data-cat="public"] [data-id="census"] button').click();
    await page.waitForSelector('#census-key');
    await page.fill('#census-key', 'not a key');
    await page.click('#census-key-save');
    check(L('a key that does not look right is refused'), /does not look like a Census key/.test(await page.textContent('#census-key-status')));
    await page.fill('#census-key', KEY);
    await page.click('#census-key-save');
    await pause();
    check(L('a good key is saved on the device'), (await mod('app/store.js', (m) => m.kvGet('publicdata.key'))) === KEY);
    const backup = await mod('app/backup.js', async (m) => { const s = await import(new URL('app/store.js', location.href).href); return JSON.stringify(await m.buildBackup({ deals: [], kv: await s.kvAll(), appVersion: 'e2e' })); });
    check(L('the key is not in a backup'), !backup.includes(KEY) && !backup.includes('publicdata.key'));
    await page.keyboard.press('Escape'); await pause();
    // with a key, demographics appear, with margins of error
    await page.evaluate(() => { location.hash = '#deal'; });
    await page.waitForSelector('#public-lookup-btn');
    await page.click('#public-lookup-btn');
    await page.waitForSelector('dialog.action-sheet[open]');   // the deal is confidential: the confirm comes again each time
    await page.locator('dialog.action-sheet[open] .action-item', { hasText: 'Look up anyway' }).click();
    await page.waitForSelector('#public-results .pd-row');
    const inc = await page.locator('#public-results .pd-row[data-id="acs-tract-income"]').innerText().catch(() => '');
    check(L('demographics show the figure, its margin of error and the survey years'), /\$98,000 ± \$21,000/.test(inc) && /2020-2024/.test(inc), inc.replace(/\s+/g, ' '));
    check(L('the key went to the Census site and nowhere else'), sent.some((u) => u.includes('api.census.gov')) && sent.filter((u) => u.includes(KEY)).every((u) => new URL(u).hostname === 'api.census.gov'));
    check(L('every request used the host list'), unexpected.length === 0, unexpected.join(' '));
  } catch (e) { check(L('flow ran to the end'), false, String(e.stack || e).slice(0, 600)); }
  check(L('no console errors'), errors.length === 0, errors.join(' | '));
  await browser.close();
}
for (const r of R) console.log(r[0], '|', r[1], r[2] ? `| ${r[2]}` : '');
finish(R);
