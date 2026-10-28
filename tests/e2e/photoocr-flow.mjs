/* L5: text in a photo, read on the device on request.
 *   1. an invented sign ("FOR LEASE 555-0100" and a fictional street) is drawn on a canvas and added as a photo;
 *   2. "Read the text in this photo" loads the OCR files from this site only, only on that tap;
 *   3. the lines show with "Read from the photo" and a confidence; nothing is on the deal yet;
 *   4. "Use as address" sets only the address, "Undo" puts it back; "Use as deal name" sets only the name;
 *   5. no request to another site. */
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();
const requests = [];
page.on('request', (r) => requests.push(r.url()));
const clickText = (t) => page.evaluate((t) => [...document.querySelectorAll('#deal-root button')].find((b) => b.textContent.includes(t)).click(), t);
const deals = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('deals').objectStore('deals').getAll(); g.onsuccess = () => res(g.result.map((d) => ({ name: d.name, address: d.figures.address ?? null, photos: d.visit.photos.length, keys: Object.keys(d.visit).sort().join() }))); }; }));
await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.getByRole('button', { name: /Enter figures by hand/ }).click();
await page.waitForSelector('#tab-visit');
await page.click('#tab-visit');
await page.waitForSelector('#deal-photos');
const png = await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 1400; c.height = 520;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000';
  x.font = 'bold 130px Arial, Helvetica, sans-serif'; x.fillText('FOR LEASE', 60, 170); x.fillText('555-0100', 60, 340);
  x.font = 'bold 100px Arial, Helvetica, sans-serif'; x.fillText('100 Example Street', 60, 480);
  return c.toDataURL('image/png').split(',')[1];
});
await page.setInputFiles('#photo-file', { name: 'sign.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
await page.waitForSelector('.photo img');
check('the photo is on the deal', (await page.locator('.photo').count()) === 1);
check('the OCR files were not loaded before the tap', requests.filter((u) => /vendor\/ocr\//.test(u)).length === 0);
const stored0 = (await deals())[0];

await page.locator('.photo-read').click();
await page.waitForSelector('#photo-text-lines .photo-line', { timeout: 120000 });
const shown = (await page.locator('#photo-text-lines').innerText()).replace(/\s+/g, ' ');
check('the sign’s text is shown', /555-0100/.test(shown) && /LEASE/i.test(shown), shown);
check('labelled as read from the photo, with a confidence', /Read from the photo · confidence \d+%/.test(shown), shown);
check('the phone line is marked', /looks like a phone number/.test(shown), shown);
check('the OCR files came from this site only', requests.filter((u) => /vendor\/ocr\//.test(u)).length >= 3 && requests.filter((u) => /vendor\/ocr\//.test(u)).every((u) => u.startsWith(BASE)));
await page.waitForTimeout(500);
const d1 = (await deals())[0];
check('nothing was put on the deal by reading', d1.address === stored0.address && d1.name === stored0.name && d1.keys === stored0.keys, JSON.stringify([stored0, d1]));
await page.screenshot({ path: `${SHOTS}photoocr.png` });

const line = page.locator('#photo-text-lines .photo-line', { hasText: 'Example' });
check('the street line is found', (await line.count()) === 1, shown);
const readAgain = async () => { await page.locator('.photo-read').click(); await page.waitForSelector('#photo-text-lines .photo-line', { timeout: 120000 }); };
const use = async (text, what) => { await page.locator('#photo-text-lines .photo-line', { hasText: text }).first().locator('button', { hasText: what }).click(); await page.waitForTimeout(600); };
const undo = async () => { await page.locator('.toast button', { hasText: 'Undo' }).click(); await page.waitForTimeout(600); };
check('the status line is a live region', (await page.locator('#photo-text-status[role="status"]').count()) === 1);
await use('Example', 'Use as address');
const d2 = (await deals())[0];
check('Use as address sets the address; a deal with no name is named by it', d2.address === '100 Example Street' && d2.name === d2.address, JSON.stringify(d2));
check('focus is back on the photo’s button', await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('photo-read')));
check('the sheet closed, so the toast’s Undo can be reached', (await page.locator('#sheet[open]').count()) === 0);
check('a toast offers Undo', await page.locator('.toast button', { hasText: 'Undo' }).count() === 1);
// a deal whose name equals its address is renamed with it (the rule for a typed address)
await readAgain();
await use('LEASE', 'Use as address');
const d3 = (await deals())[0];
check('a name that equalled the address follows the new address', d3.address === 'FOR LEASE' && d3.name === 'FOR LEASE', JSON.stringify(d3));
await undo();
const d3u = (await deals())[0];
check('Undo puts the earlier address and name back', d3u.address === '100 Example Street' && d3u.name === '100 Example Street', JSON.stringify(d3u));
await readAgain();
await use('555-0100', 'Use as deal name');
const d4 = (await deals())[0];
check('Use as deal name sets the name and not the address', d4.name === '555-0100' && d4.address === '100 Example Street', JSON.stringify(d4));
await undo();
const d5 = (await deals())[0];
check('Undo puts the name back', d5.name === '100 Example Street' && d5.address === '100 Example Street', JSON.stringify(d5));

// a read still running when its sheet is closed must not write into the next sheet
await page.locator('.photo-read').click();
await page.waitForSelector('#photo-text-status');
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('#sheet[open]'));
await page.click('button[aria-label="More deal actions"]');
await page.locator('.action-sheet .action-item', { hasText: 'History' }).click();
await page.waitForSelector('#sheet[open]');
await page.waitForTimeout(15000);
check('the next sheet is the History sheet, with no photo lines in it', (await page.locator('#sheet[open] #sheet-title').innerText()) === 'History' && (await page.locator('.photo-line').count()) === 0 && (await page.locator('#photo-text-status').count()) === 0);
const d6 = (await deals())[0];
check('and the deal is unchanged', d6.name === d5.name && d6.address === d5.address && d6.keys === stored0.keys, JSON.stringify(d6));
check('no new kind of data on the deal', d6.keys === stored0.keys, d4.keys);
check('no request to another site', requests.every((u) => u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')), requests.filter((u) => !u.startsWith(BASE)).join(' '));

for (const r of R) console.log(r.join(' | '));
finish(R, 'errors', errors);
await browser.close();
process.exit(R.some((r) => r[0] === 'FAIL') || errors.length ? 1 : 0);
