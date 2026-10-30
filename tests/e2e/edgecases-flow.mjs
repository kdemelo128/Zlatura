/* Cash flow A1b: three edge cases that used to give a quiet number now say so (invented fixtures).
 *   1. A tenant with a recovery but no typed share and no SF: the rent roll's "things to check" names it and the
 *      projection leaves its recovery out with a note, instead of counting 0.
 *   2. A negative sale cost is refused with a message: in the What-if, in the Underwrite tab and in the DCF tool.
 *   3. Percentage rent with a natural breakpoint and no base rent (and none typed) is flagged, not charged on all sales.
 * It fails on 4.7.74 (no such checks, a negative sale cost is used). */
import fs from 'fs';
import { phone, BASE, finish } from './lib.mjs';
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);

const b = JSON.parse(fs.readFileSync(new URL('../fixtures/backup-comp-loader-3.3.0.json', import.meta.url), 'utf8'));
const d = b.deals[0];
const L = (id, unit, tenant, sf, extra = {}) => ({
  id, unit, tenant, sf, vacant: false, mtm: false, leaseStart: '2022-01-01', rentStart: null, leaseEnd: '2030-12-31',
  periods: [{ start: '2022-01-01', end: '2030-12-31', rate: 0, unit: 'year', source: 'documented' }], abatements: [], custom: {}, ...extra,
});
d.rr.settings.asOf = '2026-10-10';
d.rr.settings.opex = 100000; d.rr.settings.recoverable = 100000;
d.rr.leases = [
  L('l1', '101', 'Acme Widgets', 2000, { periods: [{ start: '2022-01-01', end: '2030-12-31', rate: 60000, unit: 'year', source: 'documented' }] }),
  L('l2', '102', 'Beta Bakery', null, { recovery: { method: 'prorata' }, periods: [{ start: '2022-01-01', end: '2030-12-31', rate: 48000, unit: 'year', source: 'documented' }] }),
  L('l3', '103', 'Gamma Grill', 1000, { percentRent: { rate: 6, sales: 1200000, natural: true } }),
];
const file = `${F}edgecases-backup.json`;
fs.writeFileSync(file, JSON.stringify(b));

const { browser, page, errors } = await phone();
page.setDefaultTimeout(8000);
await page.goto(`${BASE}#settings`, { waitUntil: 'load' });
await page.waitForSelector('#settings-data #backup-file', { state: 'attached' });
await page.setInputFiles('#backup-file', file);
await page.waitForSelector('dialog.action-sheet');
await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.locator('dialog.action-sheet .action-item', { hasText: 'Merge into this device' }).click()]);
await page.goto(`${BASE}#home`, { waitUntil: 'load' });
await page.waitForSelector('#home-continue .cont-row');
await page.locator('#home-continue .cont-row').first().click();
await page.waitForSelector('#deal-tiles .tile');

// 1 and 3: the rent roll's list of things to check
await page.click('#tab-rentroll');
await page.waitForSelector('#deal-rentroll .rr-grid tbody tr');
await page.waitForTimeout(500);
if (await page.locator('#deal-rentroll .rr-issue-box summary').count()) await page.locator('#deal-rentroll .rr-issue-box summary').click();
const issues = (await page.locator('#deal-rentroll .rr-issues').innerText()).replace(/\s+/g, ' ');
check('names the tenant whose recovery cannot be told', /Unit 102 \(Beta Bakery\): Expense recovery can’t be worked out: no share is typed and the space has no SF/.test(issues.replace(/'/g, '’')), issues.slice(0, 300));
check('names the percentage rent with no breakpoint', /Unit 103 \(Gamma Grill\): Percentage rent has no breakpoint/.test(issues), issues.slice(0, 400));

// 2: a negative sale cost in the What-if
await page.click('#tab-whatif');
await page.waitForSelector('#scn-saleCost');
await page.fill('#scn-saleCost', '-2'); await page.press('#scn-saleCost', 'Tab');
await page.waitForTimeout(300);
const msg = (await page.locator('#scn-err-saleCost').textContent({ timeout: 1000 }).catch(() => '')) || '';
check('the What-if refuses a negative sale cost with a message', /can’t be negative/.test(msg), msg);
check('and keeps nothing in the scenario', (await page.inputValue('#scn-saleCost')) === '');
await page.fill('#scn-saleCost', '3'); await page.press('#scn-saleCost', 'Tab');
await page.waitForTimeout(300);
check('a valid sale cost clears the message and is kept', ((await page.locator('#scn-err-saleCost').textContent({ timeout: 1000 }).catch(() => '')) || '') === '' && /3/.test(await page.inputValue('#scn-saleCost')));

// the Underwrite tab
await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
await page.waitForSelector('#uw-card');
await page.fill('#uw-saleCost', '-2');
check('Underwrite refuses a negative sale cost with a message', /can’t be negative/.test((await page.locator('#uw-err-saleCost').textContent({ timeout: 1000 }).catch(() => '')) || ''));
await page.fill('#uw-saleCost', '2');
check('and clears it for a valid one', ((await page.locator('#uw-err-saleCost').textContent({ timeout: 1000 }).catch(() => '')) || '') === '');

// the DCF tool
await page.evaluate(() => { location.hash = '#tools'; });
await page.waitForSelector('#tools-root button.tool[data-tool="dcf"]');
await page.click('#tools-root button.tool[data-tool="dcf"]');
await page.waitForSelector('#sheet-body .results li');
await page.fill('#tool-dcf-noi', '1,000,000'); await page.fill('#tool-dcf-years', '10'); await page.fill('#tool-dcf-discount', '8'); await page.fill('#tool-dcf-exitCap', '7'); await page.fill('#tool-dcf-saleCost', '-2');
await page.waitForTimeout(200);
const warn = (await page.locator('#sheet-body .tool-warn').innerText()).replace(/\s+/g, ' ');
check('the DCF tool refuses a negative sale cost', /Sale costs can’t be negative/.test(warn) && !/Value/.test(await page.locator('#sheet-body .results').innerText()), warn);
await page.fill('#tool-dcf-saleCost', '2');
await page.waitForTimeout(200);
check('and works again with 2%', /^Value/.test((await page.locator('#sheet-body .results li').first().innerText()).trim()));

check('no page errors', !errors.length, errors.slice(0, 3).join(' / '));
fs.rmSync(file, { force: true });
await browser.close();
for (const r of R) console.log(r.join(' | '));
finish(R, 'errors', errors);
