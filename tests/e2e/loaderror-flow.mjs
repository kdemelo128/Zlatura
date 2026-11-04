/* Load failures: a blocked module names the file and offers a safe reset; a failing start-up step is named and the app opens. */
import { phone, BASE, finish } from './lib.mjs';
import { createRequire } from 'module';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, ctx, page, errors } = await phone();

// a deal in IndexedDB-adjacent storage and localStorage that must survive
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForSelector('#shell:not([hidden])', { timeout: 15000 });
await page.evaluate(async () => {
  localStorage.setItem('zlatura.test.keep', 'deal-123');
  await new Promise((res, rej) => { const q = indexedDB.open('zlatura-loaderror-test', 1); q.onupgradeneeded = () => q.result.createObjectStore('s'); q.onsuccess = () => { const t = q.result.transaction('s', 'readwrite'); t.objectStore('s').put('kept', 'k'); t.oncomplete = () => { q.result.close(); res(); }; t.onerror = rej; }; q.onerror = rej; });
  await caches.open('zlatura-ocr-tesseract-7.0.0');
});

// (a) the module is blocked
await page.route('**/app/filehash.js', (r) => r.abort('blockedbyclient'));
await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#load-error:not([hidden])', { timeout: 15000 });
await page.waitForFunction(() => /filehash\.js/.test(document.getElementById('load-error-detail').textContent), null, { timeout: 15000 }).catch(() => {});
const detail = await page.textContent('#load-error-detail');
check('the load-error panel names the failed file', /filehash\.js/.test(detail), detail);
check('it says your deals were not touched and mentions blockers', /deals were not touched/.test(await page.textContent('#load-error')) && /blocker/.test(await page.textContent('#load-error')));
const box = await page.locator('#load-error-reset').boundingBox();
check('the reset button is labelled and at least 44 px tall', box && box.height >= 44 && /Reset the offline copy and reload/.test(await page.textContent('#load-error-reset')), JSON.stringify(box));
await page.addScriptTag({ path: AXE });
const ax = async () => (await page.evaluate(async () => (await window.axe.run(document.getElementById('load-error'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map((v) => v.id)));
check('axe: no violations on the panel at phone size', (await ax()).length === 0, JSON.stringify(await ax()));
await page.setViewportSize({ width: 1280, height: 800 });
check('axe: no violations on the panel at desktop size', (await ax()).length === 0, JSON.stringify(await ax()));

await page.unroute('**/app/filehash.js');
await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('#load-error-reset')]);
await page.waitForSelector('#shell:not([hidden])', { timeout: 15000 });
const after = await page.evaluate(async () => ({
  caches: (await caches.keys()).includes('zlatura-ocr-tesseract-7.0.0'),
  ls: localStorage.getItem('zlatura.test.keep'),
  idb: await new Promise((res) => { const q = indexedDB.open('zlatura-loaderror-test'); q.onsuccess = () => { const g = q.result.transaction('s').objectStore('s').get('k'); g.onsuccess = () => { q.result.close(); res(g.result); }; }; q.onerror = () => res(null); }),
}));
check('reset deleted the old Cache Storage copy and the app reopened', after.caches === false);
check('reset left localStorage and IndexedDB alone', after.ls === 'deal-123' && after.idb === 'kept', JSON.stringify(after));

// (b) a start-up step throws: named on screen, the app still opens
await page.route('**/app/shortcuts.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export const initShortcuts = () => { throw new Error("boom"); }; export const openShortcuts = () => {};' }));
await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#start-fail', { timeout: 15000 });
check('the banner names the part that failed and is announced', /Shortcuts/.test(await page.textContent('#start-fail')) && (await page.getAttribute('#start-fail', 'role')) === 'alert');
check('the app still opens, with the other parts running', await page.locator('#shell').isVisible() && !(await page.locator('#load-error').isVisible()) && (await page.locator('.tab').count()) > 0);
check('the data was untouched', (await page.evaluate(() => localStorage.getItem('zlatura.test.keep'))) === 'deal-123');

const real = errors.filter((e) => !/blockedbyclient|ERR_BLOCKED|filehash|Failed to load|boom|did not start|Failed to fetch|net::/i.test(e));
check('no other console errors', real.length === 0, real.join(' / '));
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'loaderror', real);
await browser.close();
