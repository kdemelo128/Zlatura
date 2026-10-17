/* Bug 1b in the browser, on a phone-size page:
 *   A. an OM that states $215,000 of in-place rent (om-rr-qc.pdf): Data QC compares it with the rent roll
 *      (before, the stated rent was dropped and the check never ran), and the deal gets no new box and
 *      stores no such figure;
 *   B. an OM that states no building figures (om-rr-nosummary.pdf): the three boxes stay empty, the rent roll
 *      offers Building SF, Units and Occupancy, each filled only when tapped; a tap is one History step that
 *      Undo takes back; a taken figure is marked as taken from the rent roll and survives a reload;
 *   C. axe, no overflow, no request to another site. */
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();
page.setDefaultTimeout(8000);          // a missing element fails its check and the flow goes on (the old app has none of this)
const text = async (sel) => ((await page.locator(sel).count()) ? (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim() : '');
const requests = [];
page.on('request', (r) => requests.push(r.url()));
const axe = async (name, scope) => {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  const v = await page.evaluate(async (sc) => (await window.axe.run(document.querySelector(sc), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`), scope);
  check(`axe: ${name}`, v.length === 0, v.join('\n    '));
};
const savedDeal = () => page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('zlatura'); q.onsuccess = () => r(q.result); });
  const all = await new Promise((r) => { const q = db.transaction('deals').objectStore('deals').getAll(); q.onsuccess = () => r(q.result); });
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  return all[0] ? { figures: all[0].figures, sources: all[0].sources } : null;
});

// A. the stated in-place rent reaches the cross-check
await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.waitForTimeout(400);
await page.setInputFiles('#om-file', F + 'om-rr-qc.pdf');
await page.waitForSelector('#deal-qc', { timeout: 20000 });
await page.waitForTimeout(700);
const qc = await text('#deal-qc');
check('Data QC compares the OM’s stated $215,000 with the rent roll', /The OM states \$215,000 of in-place rent; the rent roll's leases add up to \$215,000 a year and its Total row prints \$220,000/.test(qc), qc.slice(0, 300));
const a = await savedDeal();
check('no in-place rent figure is stored, and the deal has no box for it', a && !('rent_inplace' in a.figures) && !('rent_inplace' in a.sources) && (await page.locator('#fig-rent_inplace').count()) === 0, JSON.stringify(a && Object.keys(a.figures)));

// B. the rent roll offers what the OM did not state
await page.setInputFiles('#om-file', F + 'om-rr-nosummary.pdf');
await page.waitForFunction(() => /nosummary|Market Overview/i.test(document.body.innerText) || document.querySelector('#deal-rr-offers'), null, { timeout: 20000 }).catch(() => {});
await page.waitForSelector('#deal-rr-offers', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(400);
// the Units box only appears once it holds a value: absent counts as empty
const val = (id) => page.locator(`#${id}`).count().then((n) => (n ? page.inputValue(`#${id}`) : ''));
check('before any tap, Building SF, Units and Occupancy are empty', (await val('fig-bsf')) === '' && (await val('fig-units')) === '' && (await val('fig-occ')) === '', `${await val('fig-bsf')}|${await val('fig-units')}|${await val('fig-occ')}`);
const offers = await text('#deal-rr-offers');
check('three offers, each saying where it comes from', /Building SF: The rent roll’s 6 units add up to 9,000 SF, as listed/.test(offers) && /Units: The rent roll lists 6 units/.test(offers) && /Occupancy: The rent roll’s leased units fill 80\.0% \(7,200 of 9,000 SF\)/.test(offers), offers);
check('the offers say nothing is filled until Use is tapped', /nothing is filled until you tap Use/.test(offers));
await page.screenshot({ path: `${SHOTS}rrstated-offers.png`, fullPage: true });
check('nothing overflows on a phone', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
await axe('the rent roll card with offers', '#deal-rr');

await page.locator('#deal-rr-offers [data-offer="bsf"] button').click().catch(() => {});
await page.waitForTimeout(500);
check('Use fills Building SF with 9,000', /^9,?000$/.test(await val('fig-bsf')), await val('fig-bsf'));
check('the other two stay empty and are still offered', (await val('fig-units')) === '' && (await page.locator('#deal-rr-offers [data-offer="units"]').count()) === 1 && (await page.locator('#deal-rr-offers [data-offer="occ"]').count()) === 1);
check('the Building SF offer is gone, and Occupancy now says it is on the building SF', (await page.locator('#deal-rr-offers [data-offer="bsf"]').count()) === 0 && /on the building SF above/.test(await text('#deal-rr-offers [data-offer="occ"]')), await text('#deal-rr-offers'));
const b = await savedDeal();
check('stored as taken from the rent roll, nothing else', b && b.figures.bsf === 9000 && b.sources.bsf && b.sources.bsf.hand === true && b.sources.bsf.tool === 'the rent roll' && !('units' in b.figures && b.figures.units), JSON.stringify(b && b.sources.bsf));

await page.click('#deal-undo').catch(() => {});
await page.waitForTimeout(600);
check('Undo takes it back: the box is empty and the offer returns', (await val('fig-bsf')) === '' && (await page.locator('#deal-rr-offers [data-offer="bsf"]').count()) === 1, `${await val('fig-bsf')}`);

await page.locator('#deal-rr-offers [data-offer="units"] button').click().catch(() => {});
await page.waitForTimeout(500);
check('Use fills Units with 6', (await val('fig-units')) === '6', await val('fig-units'));
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#deal-rr-offers', { timeout: 8000 }).catch(() => {});
check('after a reload the taken figure is still there, and still marked', (await val('fig-units')) === '6' && (await savedDeal()).sources.units.tool === 'the rent roll', await val('fig-units'));
check('the figure shows as typed, not as read from the OM', /typed/.test(await text('#pane-overview .fig-units, #pane-overview [data-fig="units"], #fig-units-row') || await page.evaluate(() => (document.querySelector('#fig-units')?.closest('.fig, .field, .row, div')?.innerText || ''))));

// C. no request to another site
check('no request to another site', requests.every((u) => u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')), requests.filter((u) => !u.startsWith(BASE)).join(' '));
const bad = ['NaN', 'Infinity', 'undefined'].filter((w) => new RegExp(`\\b${w}\\b`).test(offers + qc));
check('no NaN, Infinity or undefined on the screen', !bad.length, bad.join());

for (const r of R) console.log(r.join(' | '));
finish(R, 'errors', errors);
await browser.close();
process.exit(R.some((r) => r[0] === 'FAIL') || errors.length ? 1 : 0);
