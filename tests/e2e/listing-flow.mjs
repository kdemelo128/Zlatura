/* listing-flow: the deal's Listing copy sheet. From one OM: the five blocks with
 * their character counts, Copy puts a block on the clipboard, Save as .txt
 * downloads every block, a block over its limit says so, and axe finds nothing
 * on the sheet. */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, ctx, page, errors } = await phone();
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.setInputFiles('#om-file', F + 'om-retail.pdf');
await page.waitForSelector('#deal-tiles .tile');
await page.waitForTimeout(500);
const open = async () => {
  await page.click('#deal-root button[aria-label="More deal actions"] >> visible=true');
  await page.locator('dialog.action-sheet .action-item', { hasText: 'Listing copy' }).click();
  await page.waitForSelector('#sheet-body section[data-block]');
  await page.waitForTimeout(450);
};
await open();

const blocks = await page.$$eval('#sheet-body section[data-block]', (s) => s.map((x) => ({
  key: x.dataset.block, text: x.querySelector('.snippet').textContent, count: x.querySelector('.count').textContent,
})));
console.log(blocks.map((b) => `${b.key}: ${b.count}`).join(' | '));
check('the five blocks are shown', blocks.map((b) => b.key).join() === 'headline,short,long,highlights,facts', blocks.map((b) => b.key).join());
check('each count is the length of its text', blocks.every((b) => b.count.startsWith(`${[...b.text].length} of `)), blocks.map((b) => `${[...b.text].length}/${b.count}`).join(' | '));
const all = blocks.map((b) => b.text).join('\n');
check('the OM’s figures are in the copy, in whole dollars', all.includes('4410 Example Avenue NW') && all.includes('$6,450,000'), all.slice(0, 120));
check('nothing is written as a missing figure', !/N\/A|undefined|null|NaN|—|\$0\b/.test(all), all);

// Copy: the clipboard holds that block's text
await page.locator('#sheet-body section[data-block="headline"] button', { hasText: 'Copy' }).click();
await page.waitForTimeout(300);
const clip = await page.evaluate(() => navigator.clipboard.readText());
check('Copy puts the block on the clipboard', clip === blocks[0].text, clip);

// Save as .txt: every block, labelled, with its count; and it is logged as a deliverable
await page.evaluate(() => { window.__made = []; document.addEventListener('deliverable', (e) => window.__made.push(e.detail)); });
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#sheet-foot .btn-primary')]);
const path = await dl.path();
const txt = (await import('fs')).readFileSync(path, 'utf8');
check('the file is a .txt named for the deal', /^Listing copy - .+\.txt$/.test(dl.suggestedFilename()), dl.suggestedFilename());
const LABEL = { headline: 'HEADLINE', short: 'SHORT DESCRIPTION', long: 'LONG DESCRIPTION', highlights: 'HIGHLIGHTS', facts: 'FACTS' };
check('the file holds every block under its label and count', blocks.every((b) => txt.includes(`${LABEL[b.key]} (${b.count.replace(' characters', '')} characters)\n${b.text}`)), txt.slice(0, 200));
const made = await page.evaluate(() => window.__made);
check('it counts as a deliverable of the listing-copy kind', made.length === 1 && made[0].map === 'listing-copy' && made[0].kind === 'file', JSON.stringify(made));

// a block over its limit says so, in words
const over = await page.evaluate(async () => {
  const { listingBlocks } = await import('/app/listingcopy.js');
  return listingBlocks({ figures: { address: '1 Test Rd', city: 'Exampleton', state: 'ZZ', ptype: 'Retail', bsf: 9000 } }, { derived: {}, price: 1e6, ppsf: 111.11 }, { headline: 10 })[0];
}).catch((e) => ({ error: String(e) }));
check('a limit set for one marketplace marks the block over', over.over === true && over.limit === 10, JSON.stringify(over));

// axe on the sheet
await page.addScriptTag({ path: AXE });
const viol = await page.evaluate(async () => (await window.axe.run(document.querySelector('#sheet'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`));
check('axe: the listing copy sheet', viol.length === 0, viol.join('\n'));
const small = await page.evaluate(() => [...document.querySelectorAll('#sheet button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width && (r.width < 24 || r.height < 24); }).map((b) => b.textContent));
check('every button on the sheet is at least 24 px', small.length === 0, small.join());
check('the sheet fits a phone without sideways scrolling', await page.evaluate(() => { const s = document.getElementById('sheet-body'); return s.scrollWidth <= s.clientWidth + 1; }));
check('no console errors', errors.length === 0, errors.join(' / '));
for (const [st, n, d] of R) console.log(st, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errors);
await browser.close();
