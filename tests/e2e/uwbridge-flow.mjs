/* The built-in tool and the open deal (app/uwfiller/bridge.js): opening the Underwrite tab with a deal open fills the
 * tool's blank fields from the deal (name, as-of date, price, rate, amortization, hold, exit cap, sale cost) and from
 * nothing else; a blank in the deal stays blank in the tool (not 0, not a preset); address, building area, loan amount,
 * closing costs and the rent roll are not carried and are listed under "Not carried over"; nothing is written back to the
 * deal until "Bring into deal" is confirmed on a before/after list, and Undo restores it exactly; "Export with the app"
 * opens the app's own template library for the deal. Phone and desktop size, with axe on the bar and the note.
 *
 *   node uwbridge-flow.mjs        # BASE=http://localhost:8080/ by default */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);

const makeDeal = (page, fields) => page.evaluate(async (f) => {
  const m = await import('./app/dealui.js');
  const d = await m.createDeal(f, 'test fixture');
  await m.showDeal(d.id);
  return d.id;
}, fields);
const dealNow = (page) => page.evaluate(async () => { const d = (await import('./app/dealui.js')).dealForBridge(); return d && { figures: d.figures, loan: d.loan, live: d.live, name: d.name }; });
const toolFrame = (page) => page.frames().find((f) => /\/app\/uwtool\/index\.html/.test(f.url()));
const model = async (page) => { const f = toolFrame(page); return f.evaluate(() => { const m = UWEditor.model(); return { name: m.name, address: m.address, asOf: m.asOf, finance: { ...m.finance }, tenants: (m.tenants || []).length }; }); };
async function openTool(page) {
  await page.locator('.tab[data-view="underwrite"]:visible').first().click();
  await page.waitForSelector('#uwt-frame');
  await page.waitForFunction(() => { const b = document.querySelector('#uw-notcarried'); return b && !b.disabled; }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
}
async function axe(page, sel, name) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async (s) => (await window.axe.run(document.querySelector(s), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`), sel);
  check(`axe: ${name}`, res.length === 0, res.join(' | '));
}

/* ---- a deal with figures: desktop */
{
  const { browser, page, errors } = await phone({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 });
  page.setDefaultTimeout(20000);
  await page.goto(`${BASE}#home`, { waitUntil: 'load' });
  const id = await makeDeal(page, {
    name: 'Invented Plaza', figures: { price: 2000000, address: '1 Example St', city: 'Sample', bsf: 40000 }, sources: { price: { hand: true } },
    loan: { ltv: 65, rate: 6.5, amort: 25, io: false, closing: 1, minDscr: null, minDy: null }, live: { hold: 7, exitCap: 7, saleCost: 2.5 }, targets: {},
  });
  const before = JSON.stringify(await dealNow(page));
  await openTool(page);
  const m = await model(page);
  check('the tool opens with the deal\'s name, price, rate, amortization, hold, exit cap and sale cost',
    m.name === 'Invented Plaza' && m.finance.price === 2000000 && m.finance.rate === 0.065 && m.finance.amortization === 25 && m.finance.holdYears === 7 && m.finance.exitCap === 0.07 && m.finance.saleCost === 0.025, JSON.stringify(m));
  check('what is not carried stays as the tool had it: address blank, loan amount blank, closing 0, no tenants', m.address === '' && m.finance.loan === '' && m.finance.closing === 0 && m.tenants === 0, JSON.stringify(m));
  check('the deal itself is unchanged by opening the tool', JSON.stringify(await dealNow(page)) === before);
  const label = await page.textContent('#uw-notcarried');
  check('the bar says how many were not carried over', /^Not carried over \(\d+\)$/.test(label), label);
  await page.click('#uw-notcarried');
  const note = await page.textContent('#uw-note');
  check('the note lists each field left for the user, with its reason', ['Address', 'Building area', 'Loan amount', 'Closing costs'].every((x) => note.includes(x)) && /Put into the tool from the deal: .*Price: \$2,000,000\.00/.test(note) && !/Interest rate: the deal has no/.test(note) && !/as-of/i.test(note), note.slice(0, 300));   // (no as-of date: the deal has no rent roll)
  await axe(page, '.uw-slim', 'the slim bar with a deal open');
  await axe(page, '#uw-note', 'the Not carried over note');
  await page.screenshot({ path: '/tmp/shots/uwfull/bridge-desktop.png' }).catch(() => {});
  await page.click('#uw-notcarried');

  /* bring into deal: nothing to bring yet (the tool equals the deal) */
  await page.click('#uw-bring');
  check('Bring into deal, with nothing changed in the tool, says so and changes nothing', /Nothing to bring/.test(await page.textContent('.toast')) && JSON.stringify(await dealNow(page)) === before);

  /* the broker changes the rate and amortization in the tool; a blank stays out */
  await toolFrame(page).evaluate(() => { const m = UWEditor.model(); m.finance.rate = 0.07; m.finance.amortization = 20; UWEditor.commit(); });
  await page.click('#uw-bring');
  await page.waitForSelector('#sheet[open] .uw-diff');
  const diff = await page.textContent('#sheet .uw-diff');
  check('the confirm shows before and after for exactly the two changed figures', /Interest rate.*Before: 6\.5%.*After: 7%/.test(diff) && /Amortization, years.*Before: 25 years.*After: 20 years/.test(diff) && !/Price|Hold|Exit/.test(diff), diff);
  check('nothing is written to the deal while the confirm is open', JSON.stringify(await dealNow(page)) === before);
  await page.click('#sheet-foot button:has-text("Cancel")');
  await page.waitForTimeout(300);
  check('Cancel leaves the deal as it was', JSON.stringify(await dealNow(page)) === before);
  await page.click('#uw-bring');
  await page.waitForSelector('#sheet[open] .uw-diff');
  await page.click('#sheet-foot button:has-text("Bring into deal")');
  await page.waitForSelector('.toast button:has-text("Undo")');
  const after = await dealNow(page);
  check('confirmed: the deal has the tool\'s rate (7, not 7.000000000000001) and amortization, and nothing else moved', after.loan.rate === 7 && after.loan.amort === 20 && after.live.hold === 7 && after.figures.price === 2000000 && after.loan.ltv === 65, JSON.stringify(after));
  await page.click('.toast button:has-text("Undo")');
  await page.waitForTimeout(400);
  check('Undo puts the deal back exactly', JSON.stringify(await dealNow(page)) === before, JSON.stringify(await dealNow(page)));
  void id;

  /* export with the app */
  await page.click('#uw-export');
  await page.waitForSelector('#sheet[open]');
  check('Export with the app opens the app\'s own template library for the deal', (await page.textContent('#sheet')).length > 0 && await page.evaluate(() => document.querySelector('#sheet').open));
  await page.keyboard.press('Escape');
  check('no console errors from the bridge', !errors.some((e) => /uwbridge|bridge\.js|underwrite\.js/.test(e)), errors.slice(0, 3).join(' | '));
  await browser.close();
}

/* ---- a deal with almost nothing: blanks stay blank (new profile) */
{
  const { browser, page } = await phone({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(20000);
  await page.goto(`${BASE}#home`, { waitUntil: 'load' });
  await makeDeal(page, { name: 'Invented Blank', figures: { address: '2 Example Ave' }, sources: {}, loan: {}, live: {}, targets: {} });
  await page.evaluate(() => { location.hash = '#deal'; });
  await page.locator('.tabbar .tab[data-view="underwrite"]').click();
  await page.waitForSelector('#uwt-frame');
  await page.waitForFunction(() => { const b = document.querySelector('#uw-notcarried'); return b && !b.disabled; }, null, { timeout: 20000 });
  const m = await model(page);
  check('a deal with no price, rate, hold or exit cap: the tool keeps them blank (not 0) and its own starting values', m.finance.price === '' && m.finance.rate === '' && m.finance.exitCap === '' && m.finance.amortization === 30 && m.finance.holdYears === 10 && m.name === 'Invented Blank', JSON.stringify(m));
  await page.click('#uw-notcarried');
  const note = await page.textContent('#uw-note');
  check('the note says the deal has none, and that the tool starts at 30 years', /Price: the deal has no value/.test(note) && /starts at 30 years: check it/.test(note), note.slice(0, 400));
  const bar = await page.evaluate(() => { const b = document.querySelector('.uw-slim').getBoundingClientRect(); const acts = [...document.querySelectorAll('#uw-acts button')].map((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right <= innerWidth + 1; }); return { h: b.height, acts, sx: document.documentElement.scrollWidth - innerWidth }; });
  check('phone: the three deal buttons are visible inside the bar, no sideways scroll', bar.acts.length === 3 && bar.acts.every(Boolean) && bar.sx <= 0, JSON.stringify(bar));
  await axe(page, '.uw-slim', 'the slim bar at phone size, deal open');
  await page.screenshot({ path: '/tmp/shots/uwfull/bridge-phone.png' }).catch(() => {});
  await browser.close();
}

for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', []);
