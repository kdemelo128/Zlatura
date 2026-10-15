import { phone, BASE, finish } from './lib.mjs';
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();
const clickText = (t) => page.evaluate((t) => [...document.querySelectorAll('#deal-root button')].find((b) => b.textContent.includes(t)).click(), t);
await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.setInputFiles('#om-file', F + 'om-retail.pdf');
await page.waitForSelector('#deal-tiles .tile');
await page.waitForTimeout(1000);  // let the first save land
await page.fill('#fig-noi', '410,000'); await page.press('#fig-noi', 'Tab');
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#fig-noi');
const noi = await page.inputValue('#fig-noi');
console.log('NOI after immediate reload (expected $410,000):', noi);
check('an edit followed by an immediate reload is kept', noi === '$410,000', noi);
// photos then switch deal mid-processing
await page.setInputFiles('#photo-file', [F + 'photo0.jpg', F + 'photo2.jpg', F + 'photo0.jpg', F + 'photo2.jpg', F + 'photo0.jpg', F + 'photo2.jpg']);
await clickText('All deals');
await page.waitForTimeout(150);
await clickText('Enter figures by hand');
await page.waitForTimeout(4000);
await page.fill('#fig-address', '99 Second Property Rd'); await page.press('#fig-address', 'Tab');
await page.waitForTimeout(1200);
const counts = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('zlatura'); q.onsuccess = () => r(q.result); });
  const all = await new Promise((r) => { const q = db.transaction('deals').objectStore('deals').getAll(); q.onsuccess = () => r(q.result); });
  return all.map((d) => [d.name, d.figures.noi, d.visit.photos.length]);
});
const shown = await page.locator('#deal-photos .photo').count();
console.log('photos visible on 2nd deal (expected 0):', shown);
console.log('IndexedDB deals [name, noi, photos]:', JSON.stringify(counts));
check('no photos shown on the second deal', shown === 0, String(shown));
const first = counts.find((c) => c[0] === '4410 Example Avenue NW'); const second = counts.find((c) => c[0] === '99 Second Property Rd');
check('stored: all 6 photos stay on the first deal', !!first && first[2] === 6, JSON.stringify(first));
check('stored: the second deal has no photos', !!second && second[2] === 0, JSON.stringify(second));
check('no console errors', errors.length === 0, errors.join(' / '));
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errors);
await browser.close();
