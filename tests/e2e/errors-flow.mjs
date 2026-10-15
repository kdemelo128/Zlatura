import { phone, BASE, finish } from './lib.mjs';
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();
await page.goto(BASE + '#deal', { waitUntil: 'load' });
// each file: the message it must give, and whether figures are read
const DEAL = { 'corrupt.pdf': [/can’t be read: it is not a readable PDF/, 0], 'empty.pdf': [/can’t be read: the file is empty/, 0], 'om-encrypted.pdf': [/password protected/, 0], 'om-scanned.pdf': [/scanned images with no text/, null], 'notes.txt': [/needs to be a PDF/, 0], 'om-large.pdf': [/^Read 121 pages/, null] };
for (const f of Object.keys(DEAL)) {
  await page.goto(BASE + '#deal', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.removeItem('zlatura.deal.current'));
  await page.reload({ waitUntil: 'load' });
  const t0 = Date.now();
  await page.setInputFiles('#om-file', F + f);
  await page.waitForFunction(() => document.querySelector('.toast'), null, { timeout: 60000 }).catch(() => {});
  const ms = Date.now() - t0;
  const toasts = await page.locator('.toast').allTextContents(); const tiles = await page.locator('#deal-tiles .tile').count();
  console.log(f.padEnd(18), `${ms}ms`, JSON.stringify(toasts), '| tiles:', tiles);
  const [msg, nTiles] = DEAL[f];
  check(`deal: ${f} gives a plain message`, toasts.some((t) => msg.test(t)), JSON.stringify(toasts));
  if (nTiles === 0) check(`deal: ${f} reads no figures`, tiles === 0, String(tiles));
  if (f === 'om-large.pdf') check('deal: the 121-page OM is read in under 20 s', ms < 20000, `${ms} ms`);
}
// comps side
const COMPS = { 'corrupt.pdf': /can’t be read: it is not a readable PDF/, 'notes.txt': /not PDFs/, 'om-retail.pdf': /No CoStar comp pages were recognized/ };
for (const f of Object.keys(COMPS)) {
  await page.goto(BASE + '#comps', { waitUntil: 'load' });
  await page.setInputFiles('#file', F + f);
  await page.waitForTimeout(2500);
  const toasts = await page.locator('.toast').allTextContents();
  console.log('COMPS', f.padEnd(14), JSON.stringify(toasts), JSON.stringify(await page.locator('#queue li').allInnerTexts()));
  check(`comps: ${f} gives a plain message`, toasts.some((t) => COMPS[f].test(t)), JSON.stringify(toasts));
}
check('no console errors', errors.length === 0, errors.join(' / '));
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errors);
await browser.close();
