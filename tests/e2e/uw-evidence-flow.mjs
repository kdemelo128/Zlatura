/* UW-2 in the browser: a rent column gets its unit from evidence and is ASKED when two readings remain
 * (docs/proposals/uw-money-notes.md, NOTE 1). Invented CSVs, on a phone and on a desktop, with axe:
 *   1. "Months Remaining" is skipped, not rent; "Rent / SF / month" and a scale are offered in the mapping;
 *   2. a bare "Rent" of 6,000 on 1,000 SF fits a month and a year: the sheet asks, says how many rows are held,
 *      and shows the evidence as words; answering (Monthly rent) releases the rows;
 *   3. a "Free" cell, a "1,200-" and a "TBD" ask by name and hold only their own rows;
 *   4. "Annual Rent ($000)" of 60 imports as $60,000;
 *   5. Replace keeps a rent the broker typed ("Keep my edits"), and unticking it replaces it. */
import { createRequire } from 'module';
import fs from 'fs';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const errs = [];
const SIZES = [['phone', {}], ['desktop', { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }]];

for (const [size, opts] of SIZES) {
  const { browser, page, errors } = await phone(opts);
  const c = (n, ok, d) => check(`${size}: ${n}`, ok, d);
  const axe = async (name, scope) => {
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
    const v = await page.evaluate(async (sc) => (await window.axe.run(document.querySelector(sc), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`), scope);
    c(`axe: ${name}`, v.length === 0, v.join('\n    '));
  };
  const csv = (name, text) => { fs.writeFileSync(F + name, text); return F + name; };
  const openImport = async (file) => {
    await page.locator('#deal-rentroll button[aria-label="More rent roll actions"]').click();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.action-sheet .action-item', { hasText: 'Import from Excel or CSV' }).click()]);
    await chooser.setFiles(file);
    await page.waitForSelector('#sheet-body .map-row');
  };
  const sheet = async () => (await page.locator('#sheet-body').innerText()).replace(/\s+/g, ' ');
  const rows = () => page.locator('#deal-rentroll .rr-grid tbody tr').count();
  const stored = () => page.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open('zlatura'); q.onsuccess = () => r(q.result); });
    const all = await new Promise((r) => { const q = db.transaction('deals').objectStore('deals').getAll(); q.onsuccess = () => r(q.result); });
    const d = all.filter((x) => x.rr && x.rr.leases.length).sort((a, b) => (b.updated || 0) - (a.updated || 0))[0];
    return d ? d.rr.leases.map((L) => [L.unit, ...(L.periods || []).map((p) => [p.rate, p.unit, !!p.edited])]) : null;
  });

  try {
  await page.goto(BASE + '#deal', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.evaluate(() => [...document.querySelectorAll('#deal-root button')].find((b) => b.textContent.includes('Enter figures by hand')).click());
  await page.click('#tab-rentroll');
  await page.waitForSelector('#deal-rentroll');

  // 1 + 2. a bare Rent that fits a month and a year
  await openImport(csv('uw-ev-ask.csv', 'Suite,Tenant,Square Feet,Months Remaining,Rent,Lease Start,Lease Expiration\n101,Acme Tea,1000,38,"6,000",2025-01-01,2030-12-31\n102,Birch Books,2000,20,"12,000",2025-01-01,2030-12-31\n'));
  const mapped = await page.$$eval('#sheet-body .map-row', (rs) => rs.map((r) => `${r.querySelector('.h').firstChild.textContent}->${r.querySelector('select').value}`));
  c('“Months Remaining” is skipped and a bare Rent is its own choice', mapped.join(',') === 'Suite->unit,Tenant->tenant,Square Feet->sf,Months Remaining->,Rent->rent,Lease Start->leaseStart,Lease Expiration->leaseEnd', mapped.join(','));
  const opts1 = await page.$$eval('#sheet-body .map-row:nth-of-type(5) select:first-child option', (o) => o.map((x) => x.textContent));
  c('the mapping offers “Rent / SF / month”', opts1.includes('Rent / SF / month') && opts1.includes('Monthly rent'), opts1.join('|'));
  let s = await sheet();
  c('the sheet asks, and says two rows are held', /2 rows held until you answer/i.test(s) && /Rent. doesn.t say whether it is monthly or annual/.test(s), s.slice(0, 500));
  c('the evidence is words, not a number', /Asked: month or year\?/.test(s) && !/\d+\s?%\s*(sure|confiden)/i.test(s));
  await page.screenshot({ path: `${SHOTS}uw-evidence-${size}.png`, fullPage: true });
  await axe('the mapping sheet with a question', '#sheet-body');
  await page.locator('#sheet-body .map-row:nth-of-type(5) select').first().selectOption('monthly');
  s = await sheet();
  c('answering Monthly rent clears the question', !/held until you answer/i.test(s) && /Your choice/.test(s), s.slice(0, 300));
  await page.click('#sheet-foot .btn-primary');
  await page.waitForTimeout(500);
  c('both units imported', (await rows()) === 2, String(await rows()));
  let st = await stored();
  c('as monthly rent: 6,000 and 12,000 a month', st && st[0][1][0] === 6000 && st[0][1][1] === 'month' && st[1][1][0] === 12000, JSON.stringify(st));

  // 5. Replace keeps what the broker typed
  const annual = page.locator('#deal-rentroll .rr-grid tbody tr').first().locator('input[aria-label^="Annual rent"]');
  await annual.fill('90,000'); await annual.press('Enter');
  await page.waitForTimeout(400);
  st = await stored();
  c('the typed rent is marked edited', st && st[0][1][2] === true && st[0][1][1] === 'month', JSON.stringify(st));
  const again = csv('uw-ev-again.csv', 'Suite,Tenant,Square Feet,Monthly Rent,Lease Start,Lease Expiration\n101,Acme Tea,1000,"7,000",2025-01-01,2030-12-31\n102,Birch Books,2000,"13,000",2025-01-01,2030-12-31\n');
  await openImport(again);
  c('with Replace unticked there is nothing to keep', await page.locator('#rr-keep-edits').isHidden());
  await page.locator('#sheet-body label.chk input').check();
  s = await sheet();
  c('with Replace ticked, “Keep my edits” is offered and ticked', await page.locator('#rr-keep-edits input').isChecked() && /Keep my edits \(1 unit/.test(s), s.slice(-300));
  await axe('the keep-my-edits choice', '#sheet-body');
  await page.click('#sheet-foot .btn-primary');
  await page.waitForTimeout(500);
  st = await stored();
  c('Replace kept the typed 90,000 a year (7,500 a month) on 101 and took 13,000 for 102', st && st.length === 2 && Math.round(st[0][1][0] * (st[0][1][1] === 'year' ? 1 : 12)) === 90000 && st[1][1][0] === 13000, JSON.stringify(st));
  await openImport(again);
  await page.locator('#sheet-body label.chk input').check();
  await page.locator('#rr-keep-edits input').uncheck();
  await page.click('#sheet-foot .btn-primary');
  await page.waitForTimeout(500);
  st = await stored();
  c('unticking “Keep my edits” replaces it: 7,000 a month', st && st[0][1][0] === 7000 && st[0][1][1] === 'month', JSON.stringify(st));

  // 3. a Free cell, a trailing minus and a word hold only their own rows
  await openImport(csv('uw-ev-cells.csv', 'Suite,Tenant,Square Feet,Monthly Rent\n110,Cedar Cafe,1000,Free\n111,Dune Dental,1000,"1,300"\n112,Elm Optics,1000,"1,200-"\n113,Fir Fitness,1000,TBD\n'));
  s = await sheet();
  c('each ask names its row', /Suite 110 says Free\. Type its contract rent and when the free period ends\./.test(s) && /Suite 112 has a negative rent .*credit or a concession/.test(s) && /Suite 113 has .TBD./.test(s) && /3 rows held/i.test(s), s.slice(0, 700));
  await page.locator('#sheet-body label.chk input').uncheck();
  await page.click('#sheet-foot .btn-primary');
  await page.waitForTimeout(500);
  const toastText = (await page.locator('.toast').innerText().catch(() => '')).replace(/\s+/g, ' ');
  c('only the row that is clear was added, and the toast says 3 are held', (await rows()) === 3 && /1 unit imported; 3 held/.test(toastText), `${await rows()} | ${toastText}`);

  // 4. a stated scale
  await openImport(csv('uw-ev-scale.csv', 'Suite,Tenant,Square Feet,Annual Rent ($000)\n120,Gum Grocer,2000,60\n'));
  s = await sheet();
  c('a “($000)” heading is read as thousands, in words', /read ×1,000 \(thousands\)/.test(s) && !/held until you answer/i.test(s), s.slice(0, 400));
  await page.locator('#sheet-body label.chk input').uncheck();
  await page.click('#sheet-foot .btn-primary');
  await page.waitForTimeout(500);
  st = await stored();
  c('$60,000 a year, not $60', st && st.some((r) => r[0] === '120' && r[1][0] === 60000 && r[1][1] === 'year'), JSON.stringify(st));
  c('nothing overflows', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  c('no NaN, Infinity or undefined on the screen', !/\b(NaN|Infinity|undefined)\b/.test(await page.locator('#app').innerText()));
  } catch (e) { c('the flow ran to its end', false, String(e.message).split('\n')[0]); }
  errs.push(...errors);
  await browser.close();
}
for (const r of R) console.log(r.join(' | '));
finish(R, 'errors', errs);
process.exit(R.some((r) => r[0] === 'FAIL') || errs.length ? 1 : 0);
