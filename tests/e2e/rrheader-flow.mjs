/* Bug 1c in the browser, on a phone-size page: an OM whose Annual Rent label runs over two lines ("Annual" over
 * "Rent", the other labels on the first line only; tests/rr-fixtures.js specTwoLine, om-rr-twoline.pdf). The reader
 * used to find no rent roll at all. Now: six units read, nothing held, the real rents in the leases, Data QC clean. */
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();
page.setDefaultTimeout(8000);
const text = async (sel) => ((await page.locator(sel).count()) ? (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim() : '');
const requests = [];
page.on('request', (r) => requests.push(r.url()));
const axe = async (name, scope) => {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  const v = await page.evaluate(async (sc) => (await window.axe.run(document.querySelector(sc), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`), scope);
  check(`axe: ${name}`, v.length === 0, v.join('\n    '));
};

await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.waitForTimeout(400);
await page.setInputFiles('#om-file', F + 'om-rr-twoline.pdf');
await page.waitForSelector('#deal-root .card', { timeout: 20000 });
await page.waitForTimeout(1200);
const head = await text('#deal-rr .card-head');
check('a rent roll is found: six units, read from page 1', /6 units · read from OM page 1/.test(head), head || (await text('#deal-root')).slice(0, 200));
const qc = await text('#deal-qc');
check('Data QC has no fail and nothing is held back', (await page.locator('#deal-qc .qc-item.qc-fail').count()) === 0 && !/held back/.test(await text('#deal-rr')), qc.slice(0, 200));
const leases = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('zlatura'); q.onsuccess = () => r(q.result); });
  const all = await new Promise((r) => { const q = db.transaction('deals').objectStore('deals').getAll(); q.onsuccess = () => r(q.result); });
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  const d = all[0];
  return d && d.rr ? d.rr.leases.filter((L) => L.periods.length).map((L) => [L.periods[0].rate, L.periods[0].unit]) : null;
}).catch(() => null);
check('the leases hold the real annual rents, summing to 215,000', Array.isArray(leases) && leases.length === 5 && leases.every((x) => x[1] === 'year') && leases.reduce((s, x) => s + x[0], 0) === 215000, JSON.stringify(leases));
check('the Annual Rent column was read as annual rent', /Annual Rent/.test(qc) || /annual rent \$215,000 equals/.test(qc), qc.slice(0, 300));
await page.screenshot({ path: `${SHOTS}rrheader.png`, fullPage: true });
check('nothing overflows on a phone', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
await axe('the rent roll card and Data QC', '#deal-rr');
check('no request to another site', requests.every((u) => u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')), requests.filter((u) => !u.startsWith(BASE)).join(' '));

for (const r of R) console.log(r.join(' | '));
finish(R, 'errors', errors);
await browser.close();
process.exit(R.some((r) => r[0] === 'FAIL') || errors.length ? 1 : 0);
