/* Rent roll checks K20-K33 (underwriting U5), as a person meets them, on an iPhone-sized page and on a desktop one:
 *   1. an invented messy roll (a tenant with no rent, a unit listed twice) shows both in "What doesn't add up", and
 *      the Deal tab's badge counts the warnings (not the Notes);
 *   2. typing a rent into the tenant with none clears that check within the 150 ms edit budget;
 *   3. Settings: "50" typed one character at a time into the rent-per-SF "note above" box makes the median-rent Note
 *      appear on the deal; a "note below" above it is refused with the band's own message and the value kept;
 *   4. axe finds nothing on the deal's checks or on Settings, light and dark.
 * It fails on 4.7.40, which has none of these checks or settings. */
import fs from 'fs';
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);

// invented: a backup in the app's own format, from the 3.3.0 fixture, with the deal's rent roll replaced
const b = JSON.parse(fs.readFileSync(new URL('../fixtures/backup-comp-loader-3.3.0.json', import.meta.url), 'utf8'));
const d = b.deals[0];
const L = (id, unit, tenant, sf, rate, extra = {}) => ({
  id, unit, tenant, sf, vacant: false, mtm: false, leaseStart: '2022-01-01', rentStart: null, leaseEnd: '2030-12-31',
  periods: rate === null ? [] : [{ start: '2022-01-01', end: '2030-12-31', rate, unit: 'year', source: 'documented' }], abatements: [], custom: {}, ...extra,
});
d.rr.settings.asOf = '2026-10-10';
d.figures.ptype = 'Retail';
d.rr.leases = [
  L('l1', '101', 'Acme Widgets', 2000, 160000),
  L('l2', '102', 'Beta Bakery', 1000, null),
  L('l3', '103', '', 1000, null, { vacant: true, leaseStart: null, leaseEnd: null }),
  L('l4', '104', 'Delta Dental', 1000, 80000),
  L('l5', '104', 'Echo Salon', 1000, 80000),
];
const file = `${F}rollchecks-backup.json`;
fs.writeFileSync(file, JSON.stringify(b));

const SIZES = [['phone', {}], ['desktop', { viewport: { width: 1360, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }]];
const allErrors = [];
for (const [size, opts] of SIZES) {
  const { browser, page, errors } = await phone(opts);
  const tag = (s) => `${size}: ${s}`;
  const checksText = async () => ((await page.locator('#deal-checks').count()) ? (await page.locator('#deal-checks').innerText()).replace(/\s+/g, ' ') : '');
  const audit = async (name, scope) => {
    await page.waitForTimeout(400);
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
    const res = await page.evaluate(async (sc) => {
      const r = await window.axe.run(document.querySelector(sc), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
      return r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    }, scope);
    check(tag(`axe: ${name}`), res.length === 0, res.join('; '));
  };

  await page.goto(`${BASE}#settings`, { waitUntil: 'load' });
  await page.waitForSelector('#settings-data #backup-file', { state: 'attached' });
  await page.setInputFiles('#backup-file', file);
  await page.waitForSelector('dialog.action-sheet');
  await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.locator('dialog.action-sheet .action-item', { hasText: 'Merge into this device' }).click()]);
  await page.goto(`${BASE}#home`, { waitUntil: 'load' });
  await page.waitForSelector('#home-continue .cont-row');
  await page.locator('#home-continue .cont-row').first().click();
  await page.waitForSelector('#deal-tiles .tile');
  await page.waitForTimeout(500);

  // 1
  let t = await checksText();
  check(tag('What doesn’t add up names the tenant with no rent, and says it counts as vacant'), /1 tenant on the rent roll has no rent entered \(blank, not \$0\): 102 \(Beta Bakery\)\..*count as vacant|count[s]? as vacant/.test(t) && /102 \(Beta Bakery\)/.test(t), t.slice(0, 400));
  check(tag('and the unit listed twice, once'), /lists a unit more than once: 104 \(2 times\)/.test(t), t.slice(0, 400));
  check(tag('the vacant suite and the $80 per SF median raise nothing else'), !/no SF|no start date|ended before|paying rent after|median rent/.test(t), t.slice(0, 400));
  const nWarn = await page.locator('#deal-checks li:not(.info)').count();
  const badge = (await page.locator('.tab[data-view="deal"] .badge:visible').first().textContent().catch(() => '')).trim();
  check(tag('the Deal tab’s badge counts the warnings (not the Notes)'), nWarn >= 2 && badge === String(nWarn), `${badge} vs ${nWarn}`);
  await audit('the deal’s checks, light', '#deal-checks');
  await page.emulateMedia({ colorScheme: 'dark' });
  await audit('the deal’s checks, dark', '#deal-checks');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: `${SHOTS}rollchecks-${size}.png` });

  // 2: the rent typed into 102 clears the check at once
  await page.click('#tab-rentroll');
  await page.waitForSelector('#deal-rentroll .rr-grid tbody tr');
  const annual = page.locator('#deal-rentroll input[aria-label="Annual rent, unit 102"]');
  await annual.fill('80,000');
  const t0 = Date.now();
  await annual.press('Enter');
  // the Overview's list is redrawn behind the Rent roll tab: watch its text, which a hidden tab still has
  await page.waitForFunction(() => !/no rent entered/.test(document.getElementById('deal-checks').textContent), null, { timeout: 3000, polling: 'raf' });
  const ms = Date.now() - t0;
  t = (await page.locator('#deal-checks').textContent()).replace(/\s+/g, ' ');
  check(tag('a rent typed into 102 clears the check (and the unit listed twice stays)'), !/no rent entered/.test(t) && /104 \(2 times\)/.test(t), t.slice(0, 300));
  check(tag('and it clears within the 150 ms edit budget'), ms < 150, `${ms} ms`);
  console.log(`${size}: check cleared ${ms} ms after Enter`);

  // 3: Settings
  await page.goto(`${BASE}#settings`, { waitUntil: 'load' });
  await page.waitForSelector('#conv-rr-psf-high');
  check(tag('Settings offers the four rent per SF band numbers at their defaults'), (await Promise.all(['low', 'high', 'mfLow', 'mfHigh'].map((k) => page.inputValue(`#conv-rr-psf-${k}`)))).join(',') === '3,200,3,80');
  await page.locator('#conv-rr-psf-high').click();
  await page.keyboard.press('Control+A');
  for (const ch of '50') { await page.keyboard.type(ch); await page.waitForTimeout(40); }
  check(tag('"50" typed one character at a time stays as typed'), (await page.inputValue('#conv-rr-psf-high')) === '50');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await audit('Settings, light', '#settings-conventions');
  await page.emulateMedia({ colorScheme: 'dark' });
  await audit('Settings, dark', '#settings-conventions');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.locator('#conv-rr-psf-low').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('60');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check(tag('a note-below of 60 passes the 50 note-above: refused with the band’s message, value kept'), (await page.inputValue('#conv-rr-psf-low')) === '3' && /Must stay below the note-above level \(\$50\); kept at 3/.test(await page.textContent('#conv-rr-psf-low-msg')), await page.textContent('#conv-rr-psf-low-msg'));
  await page.goto(`${BASE}#deal`, { waitUntil: 'load' });
  await page.waitForSelector('#deal-tiles .tile');
  await page.waitForTimeout(500);
  t = await checksText();
  check(tag('the median-rent Note appears on the deal'), /median rent is \$80\.00 per SF a year, outside \$3-\$50 for a commercial property/.test(t), t.slice(0, 500));
  check(tag('the Note is not counted in the badge'), (await page.locator('#deal-checks li:not(.info)').count()) === Number((await page.locator('.tab[data-view="deal"] .badge:visible').first().textContent().catch(() => '0')).trim() || 0));
  check(tag('nothing overflows the screen'), await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  allErrors.push(...errors);
  await browser.close();
}
check('no page errors', !allErrors.length, allErrors.slice(0, 3).join(' / '));
fs.rmSync(file, { force: true });
for (const r of R) console.log(r.join(' | '));
finish(R, 'errors', allErrors);
