import { phone, BASE, SHOTS, finish } from './lib.mjs';
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();
await page.goto(BASE + '#comps', { waitUntil: 'load' });
await page.setInputFiles('#file', F + 'costar-comps.pdf');
await page.waitForFunction(() => document.querySelectorAll('#sales-table tbody tr').length > 0);
await page.evaluate(() => document.getElementById('out-template').click());
await page.setInputFiles('#tpl-file', F + (process.argv[2] || 'acme-template.xlsx'));
await page.waitForTimeout(1200);
console.log('toast', await page.locator('.toast').allTextContents());
const open = await page.evaluate(() => document.getElementById('sheet').open);
console.log('mapping sheet open', open);
check('the mapping sheet opens for the firm template', open);
if (open) {
  console.log(await page.$$eval('#sheet-body section', (s) => s.map((x) => x.innerText.replace(/\n+/g, ' | '))));
  const maps = await page.$$eval('#sheet-body .map-row', (rs) => rs.map((r) => `${r.querySelector('.h').firstChild.textContent} -> ${r.querySelector('select').selectedOptions[0].textContent}`));
  console.log(maps);
  check('columns are mapped by their headings', ['Address -> Address', 'Sale Price -> Price', 'Building SF -> Building SF', 'Cap Rate -> Cap rate'].every((m) => maps.includes(m)), maps.join('; '));
  await page.screenshot({ path: `${SHOTS}tpl-map.png` });
  await page.click('#sheet-foot .btn-primary');
}
await page.waitForTimeout(300);
const desc = await page.textContent('#tpl-desc');
console.log('desc', desc);
check('the template is described', /Sale Comps \(8 columns\)/.test(desc), desc);
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#download')]);
await dl.saveAs(F + 'out-template.xlsx');
console.log('downloaded', dl.suggestedFilename());
check('the filled template downloads', /\.xlsx$/.test(dl.suggestedFilename()), dl.suggestedFilename());
// persists across reload?
await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1500);
const desc2 = await page.textContent('#tpl-desc'); const pressed = await page.getAttribute('#out-template', 'aria-pressed');
console.log('after reload desc', desc2, 'output', pressed);
check('after a reload the template and the output choice are kept', desc2 === desc && pressed === 'true', `${desc2} / ${pressed}`);
check('no console errors', errors.length === 0, errors.join(' / '));
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errors);
await browser.close();
