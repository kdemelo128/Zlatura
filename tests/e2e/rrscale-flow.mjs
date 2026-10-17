/* Bug 1a in the browser: an OM whose rent roll is printed "($ in thousands)"
 * (tests/rr-fixtures.js specThousands, typeset by make_pdfs.py as om-rr-thousands.pdf):
 * annual rent 60.0, monthly 5.000, rent per SF still $30.00, a Total row of 215.0,
 * and a summary stating $215,000 of base rent. On a phone:
 *   1. nothing is held back: no fail in Data QC, six units applied;
 *   2. Data QC says the column is printed in thousands and was read ×1,000;
 *   3. the Overview tile reads $215K of in-place rent, the Rent roll tab's grid shows $60,000, and
 *      the leases hold 60000 a year, not 60;
 *   4. the Total row (printed 215.0) is read as $215,000 and equals its rows;
 *   5. nothing overflows, axe is clean, no request to another site. */
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();
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
await page.setInputFiles('#om-file', F + 'om-rr-thousands.pdf');
await page.waitForSelector('#deal-qc', { timeout: 20000 });
await page.waitForTimeout(800);

// 1. nothing held back
const qc = await text('#deal-qc');
const rrHead = await text('#deal-rr .card-head');
check('no failed check in Data QC', !/\bfail\b/i.test(await text('#deal-qc .qc-summary, #deal-qc .card-head')) && (await page.locator('#deal-qc .qc-item.qc-fail').count()) === 0, qc.slice(0, 240));
check('the rent roll is not held back', !/held back/.test(await text('#deal-rr')) && !/none yet/.test(rrHead), await text('#deal-rr'));
check('six units, read from page 2', /6 units · read from OM page 2/.test(rrHead), rrHead);

// 2. says what it did
check('Data QC says the column is printed in thousands and was read ×1,000', /printed in thousands/.test(qc) && /×1,000/.test(qc), qc.slice(0, 300));

// 3. the real rents
const rr = await text('#deal-rr');
check('the in-place rent tile reads $215K', /In-place rent\s*\$215(\.0)?K/.test(rr) || /In-place rent\s*\$215,000/.test(rr), rr.slice(-160));
await page.click('#tab-rentroll');
await page.waitForSelector('#pane-rentroll table, #pane-rentroll .rr-grid, #pane-rentroll [role="grid"]', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(600);
const grid = await text('#pane-rentroll');
check('the rent roll grid shows the real rents', /60,000/.test(grid) && /42,000/.test(grid) && /36,000/.test(grid) && !/\$60(?![,\d])/.test(grid), grid.slice(0, 400));
const leases = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('zlatura'); q.onsuccess = () => r(q.result); });
  const all = await new Promise((r) => { const q = db.transaction('deals').objectStore('deals').getAll(); q.onsuccess = () => r(q.result); });
  const d = all.find((x) => x.rrQc);
  return d ? { rates: d.rr.leases.filter((L) => L.periods.length).map((L) => [L.periods[0].rate, L.periods[0].unit]), held: d.rrQc.held, applied: d.rrQc.applied } : null;
}).catch((e) => String(e));
check('the leases hold 60,000 a year, not 60', leases && leases.rates && leases.rates.length > 0 && leases.rates[0][0] === 60000 && leases.rates[0][1] === 'year' && leases.held === null && leases.applied === true, JSON.stringify(leases));
check('the five rents add up to 215,000', leases && leases.rates && leases.rates.reduce((s, x) => s + x[0], 0) === 215000, JSON.stringify(leases && leases.rates));

// 4. the Total row, printed 215.0, agrees with the six rows once both are read ×1,000
check('the Total row’s $215,000 equals its rows', /annual rent \$215,000 equals the 6 rows above it/.test(qc), qc.slice(0, 300));
await page.screenshot({ path: `${SHOTS}rrscale.png`, fullPage: true });

// 5. phone, axe, network
check('nothing overflows on a phone', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
await axe('the Data QC panel', '#deal-qc');
check('no request to another site', requests.every((u) => u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')), requests.filter((u) => !u.startsWith(BASE)).join(' '));
const bad = ['NaN', 'Infinity', 'undefined'].filter((w) => new RegExp(`\\b${w}\\b`).test(qc + rr + grid));
check('no NaN, Infinity or undefined on the screen', !bad.length, bad.join());

for (const r of R) console.log(r.join(' | '));
finish(R, 'errors', errors);
await browser.close();
process.exit(R.some((r) => r[0] === 'FAIL') || errors.length ? 1 : 0);
