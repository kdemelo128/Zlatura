/* Typing, one character at a time, into every date field and every kind of
 * number field (whole number, dollars, percent) on the screens that redraw
 * after an edit. After EVERY keystroke the field must hold exactly what was
 * typed so far (nothing reformatted, nothing wiped) and still be the focused,
 * same element. Then the field is left (Tab or Enter) and what was kept is
 * checked.
 *
 * Dates (Bug C): the browser's own date control fired a change for every
 * segment, with '' or a year like 0002 on the way to 2027, and the rent roll
 * stored each one, so typed dates vanished at the year. The shared date field
 * reads the text only on blur and Enter.
 * Numbers: after a field's value was kept the screen was redrawn, which threw
 * away the field Tab was moving to, so the next keystroke went nowhere.
 *
 *   node typing-flow.mjs            # BASE=http://localhost:8080/ by default */
import { phone, BASE } from './lib.mjs';

const F = new URL('./files/', import.meta.url).pathname;
const { browser, page, errors } = await phone();
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'x' : undefined));
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const pause = (ms = 25) => page.waitForTimeout(ms);
page.setDefaultTimeout(8000);
const calm = () => page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => { if (d.classList.contains('cmdk')) d.close(); }); });
const ROW = (n) => `#deal-rentroll .rr-grid tbody tr:nth-child(${n})`;
const SHEET = '#sheet-body';
/** A block of checks that must not stop the rest if the page lacks what it needs (the old date control has no hint or calendar button). */
const step = async (name, fn) => { try { await fn(); } catch (e) { check(`${name} (could not run)`, false, String(e.message).split('\n')[0]); } };

/* ------------------------------------------------------------ helpers */

/** Focus a field and type `text` one key at a time; the list of keystrokes after which it was not exactly the typed prefix, still focused and still the same element. */
async function typeChars(sel, text, { clear = true, nth = 0 } = {}) {
  const loc = page.locator(sel).nth(nth);
  await loc.scrollIntoViewIfNeeded();
  await loc.focus();
  await page.evaluate(() => { window.__probe = document.activeElement; });
  if (clear) { await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Backspace'); await pause(); }
  const bad = [];
  let prefix = '';
  const first = await page.evaluate(() => window.__probe.value);
  if (clear && first !== '') bad.push(`after clearing: value=${JSON.stringify(first)}`);
  for (const ch of text) {
    await page.keyboard.type(ch);
    await pause();
    prefix += ch;
    const st = await page.evaluate(() => { const p = window.__probe; return { v: p.value, focused: document.activeElement === p, connected: p.isConnected }; });
    if (st.v !== prefix || !st.focused || !st.connected) bad.push(`after “${prefix}”: value=${JSON.stringify(st.v)} focused=${st.focused} connected=${st.connected}`);
  }
  return bad;
}
const note = (bad) => (bad.length ? `${bad.length} bad keystroke(s): ${bad.slice(0, 3).join(' | ')}` : '');
const fmt = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : '');
const ISO = (e) => { const w = e.closest ? e.closest('.dateinput') : null; return w ? w.value : null; };

/** Type a date, leave the field with `how`, and check what was kept: shown as MM/DD/YYYY, held as the ISO day. */
async function dateField(name, sel, text, iso, { how = 'Tab', nth = 0, after = null } = {}) {
  const bad = await typeChars(sel, text, { nth });
  await page.keyboard.press(how);
  await pause(250);
  if (after) await after();
  const loc = page.locator(sel).nth(nth);
  const shown = await loc.inputValue().catch(() => '(gone)');
  const kept = await loc.evaluate(ISO).catch(() => '(gone)');
  const landed = await page.evaluate(() => document.activeElement && document.activeElement !== document.body);
  check(`${name}: “${text}” typed key by key, nothing lost on the way`, bad.length === 0, note(bad));
  check(`${name}: “${text}” is kept as ${iso} and shown ${fmt(iso)}`, kept === iso && shown === fmt(iso), `kept=${kept} shown=${shown}`);
  if (how === 'Tab') check(`${name}: focus is still on a field after leaving it`, !!landed);
  return bad.length === 0 && kept === iso;
}
/** The key a focused element is found by again after a redraw. */
const KEY = `(a) => a ? (a.id ? '#' + a.id : a.getAttribute('aria-label') ? a.tagName + '[' + a.getAttribute('aria-label') + ']' : a.tagName + ':' + (a.textContent || '').trim().slice(0, 30)) : 'none'`;
/** The field Tab goes to from the focused one, by the same key. */
const NEXT = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
  const all = [...document.querySelectorAll('input:not([disabled]), select:not([disabled]), button:not([disabled]), textarea:not([disabled]), a[href], [tabindex]')].filter((e) => e.tabIndex >= 0 && vis(e) && !e.closest('[inert]'));
  const i = all.indexOf(document.activeElement);
  const n = all[i + 1];
  return (${KEY})(n);
})()`;

/** Type a number, press Tab, and check nothing was lost and focus went to the next field. */
async function numberField(name, sel, text, expectShown, { nth = 0 } = {}) {
  const bad = await typeChars(sel, text, { nth });
  const next = await page.evaluate(NEXT);
  await page.keyboard.press('Tab');
  await pause(300);
  const now = await page.evaluate(`(${KEY})(document.activeElement)`);
  const shown = await page.locator(sel).nth(nth).inputValue().catch(() => '(gone)');
  check(`${name}: “${text}” typed key by key, nothing lost on the way`, bad.length === 0, note(bad));
  check(`${name}: Tab lands on the next field (${next})`, now === next, `focus is on ${now}`);
  if (expectShown !== undefined) check(`${name}: kept as ${expectShown}`, shown === expectShown, `shows ${shown}`);
  return bad.length === 0 && now === next;
}

/* ------------------------------------------------------------ the deal */

await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.setInputFiles('#om-file', F + 'om-retail.pdf');
await page.waitForSelector('#deal-tiles .tile');

// deal CRM: next step due, key date
await dateField('Deal next step due', '#deal-task-due', '01/05/2027', '2027-01-05');
await dateField('Deal key date', '#deal-date', '1/5/27', '2027-01-05');
// the picker button, 44 px to touch
await step('calendar button size', async () => {
  const box = await page.locator('#deal-date').locator('xpath=..').locator('button[aria-label^="Pick a date"]').boundingBox();
  check('a calendar button sits beside the date, 44 px to touch', !!box && box.width >= 44 && box.height >= 44, JSON.stringify(box));
});

// number fields on the deal's figures: dollars, a percent, a whole number
await numberField('Deal figure, asking price (dollars)', '#fig-price', '6450000', '$6,450,000');
await numberField('Deal figure, cap rate (percent)', '#fig-cap', '6.25');
await numberField('Deal figure, building SF (whole number)', '#fig-bsf', '24500', '24,500');

// financing and What-if live on their own tabs
const paneOf = (sel) => page.evaluate((s) => { const e = document.querySelector(s); const p = e && e.closest('[id^="pane-"]'); return p ? p.id.replace('pane-', '') : null; }, sel);
const loanPane = await paneOf('#loan-ltv');
if (loanPane) await page.click(`#tab-${loanPane}`);
await numberField('Financing, loan to value (percent)', '#loan-ltv', '65');
await numberField('Financing, rate (percent)', '#loan-rate', '6.5');

const scnPane = await paneOf('input.scn-target');
if (scnPane) await page.click(`#tab-${scnPane}`);
await numberField('What-if answers, target cap rate (percent, redraws the answers)', 'input.scn-target', '7.25', '7.25');
await numberField('What-if answers, target levered IRR (percent)', 'input.scn-target', '14', undefined, { nth: 1 });
const scnId = await page.evaluate(() => { const e = document.querySelector('input[id^="scn-"]:not(select)'); return e ? e.id : null; });
if (scnId) await numberField('What-if scenario field', `#${scnId}`, '1234567');

await step('rent roll grid', async () => {
 await calm();
// ------------------------------------------------------------ rent roll
await page.click('#tab-rentroll');
await page.waitForSelector('#deal-rentroll .rr-grid tbody tr');
await numberField('Rent roll grid, SF (whole number)', `${ROW(1)} input[aria-label^="SF, unit"]`, '2450', '2,450');
await numberField('Rent roll grid, annual rent (dollars)', `${ROW(1)} input[aria-label^="Annual rent"]`, '98765');
await numberField('Rent roll grid, rent per SF (dollars and cents)', `${ROW(1)} input[aria-label^="Rent / SF / yr"]`, '41.25');

// dates in the grid: every way of writing one, lease start; lease end reads a month as its last day
const FORMS = [
  ['01/05/2027', '2027-01-05'], ['1/5/2027', '2027-01-05'], ['1/5/27', '2027-01-05'], ['2027-01-05', '2027-01-05'],
  ['01052027', '2027-01-05'], ['Jan 5, 2027', '2027-01-05'], ['Jan 2027', '2027-01-01'], ['January 2027', '2027-01-01'], ['Jan-27', '2027-01-01'], ['1/2027', '2027-01-01'],
];
for (const [text, iso] of FORMS) await dateField('Rent roll grid, lease start', `${ROW(1)} input[aria-label^="Lease start"]`, text, iso);
await dateField('Rent roll grid, lease start, then Enter', `${ROW(3)} input[aria-label^="Lease start"]`, '4/1/26', '2026-04-01', { how: 'Enter' });
{
  const focusRow = await page.evaluate(() => document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.r : null);
  check('Enter in a grid date keeps it and moves down one row', focusRow === '3', `row ${focusRow}`);
}
for (const [text, iso] of [['Jan 2027', '2027-01-31'], ['February 2028', '2028-02-29'], ['Jun-27', '2027-06-30'], ['3/2027', '2027-03-31'], ['12/31/2030', '2030-12-31']]) {
  await dateField('Rent roll grid, lease end (a month means its last day)', `${ROW(2)} input[aria-label^="Lease end"]`, text, iso);
}
// the date is still there after the grid is drawn again
await page.click('#tab-whatif').catch(() => {});
await page.click('#tab-rentroll');
await page.waitForSelector('#deal-rentroll .rr-grid tbody tr');
check('grid dates survive the grid being drawn again', (await page.locator(`${ROW(2)} input[aria-label^="Lease end"]`).evaluate(ISO)) === '2030-12-31' && (await page.locator(`${ROW(1)} input[aria-label^="Lease start"]`).evaluate(ISO)) === '2027-01-01');
// History's "What it changed" for that lease end offers a date to try
await page.click('button[aria-label="More deal actions"]');
await page.locator('.action-sheet .action-item', { hasText: 'History' }).click();
await page.waitForSelector('#history-list');
await page.locator('#history-list li').first().locator('button', { hasText: 'What it changed' }).click().catch(() => {});
await pause(500);
if (await page.locator('#impact-trial').count()) {
  await dateField('What this affects, try a date', '#impact-trial', '3/31/2030', '2030-03-31', { how: 'Enter' });
} else check('What this affects offers a date to try', false, 'no #impact-trial');
await page.click('#sheet-close').catch(() => {});
await pause(300);
if (await page.locator('#sheet-close').isVisible().catch(() => false)) await page.click('#sheet-close').catch(() => {});
await pause(300);

});

await step('assumptions', async () => {
 await calm();
// assumptions: the As of date, and numbers that redraw the whole form
await page.click('#deal-rentroll .rr-settings summary');
await dateField('Assumptions, As of', '#deal-rentroll .rr-settings input[id^="rrs-asOf"]', '6/30/2026', '2026-06-30');
await numberField('Assumptions, projection years (whole number)', '#deal-rentroll .rr-settings input[id^="rrs-years"]', '12');
await numberField('Assumptions, market rent growth (percent)', '#deal-rentroll .rr-settings input[id^="rrs-marketGrowth"]', '3.5');
await numberField('Assumptions, operating expenses (dollars)', '#deal-rentroll .rr-settings input[id^="rrs-opex"]', '185000');

});

await step('lease editor', async () => {
 await calm();
// ---------------------------------------------------------- lease editor
await page.locator(`${ROW(1)} button[aria-label^="Lease schedule"]`).click();
await page.waitForSelector('#ls-leaseStart');
await dateField('Lease editor, lease start', '#ls-leaseStart', '01/05/2027', '2027-01-05');
await dateField('Lease editor, rent start', '#ls-rentStart', 'Jan-27', '2027-01-01');
await dateField('Lease editor, lease end (a month means its last day)', '#ls-leaseEnd', 'Dec 2031', '2031-12-31');
await dateField('Lease editor, lease end, then Enter', '#ls-leaseEnd', '11/30/2031', '2031-11-30', { how: 'Enter' });
await numberField('Lease editor, SF (whole number)', '#ls-sf', '3200', '3,200');
// a rent period: dates, and its rent
await dateField('Rent period 1, from', `${SHEET} input[aria-label="Period 1 from"]`, '1/5/2001', '2001-01-05');
await dateField('Rent period 1, to (a month means its last day)', `${SHEET} input[aria-label="Period 1 to"]`, 'Jun 2002', '2002-06-30');
await numberField('Rent period 1, rent (dollars and cents)', `${SHEET} input[aria-label="Period 1 rent"]`, '36.5');
// the rent generator
await page.click(`${SHEET} .rr-gen summary`);
await dateField('Rent generator, from', '#gen-start', '3/1/2028', '2028-03-01');
await dateField('Rent generator, to (a month means its last day)', '#gen-end', 'Feb 2033', '2033-02-28');
await numberField('Rent generator, starting rent (dollars)', '#gen-rate', '30');
// free rent and one-time items
await page.locator(`${SHEET} button`, { hasText: '+ Free rent or abatement' }).click();
await pause(200);
await dateField('Abatement 1, from', `${SHEET} input[aria-label="Abatement 1 from"]`, '2/1/2027', '2027-02-01');
await dateField('Abatement 1, to (a month means its last day)', `${SHEET} input[aria-label="Abatement 1 to"]`, 'Apr 2027', '2027-04-30');
await numberField('Abatement 1, percent of rent', `${SHEET} input[aria-label="Abatement 1 percent of rent"]`, '50');
await page.locator(`${SHEET} button`, { hasText: '+ Charge or credit' }).click();
await pause(200);
await dateField('One-time item 1, date', `${SHEET} input[aria-label="Item 1 date"]`, '7/15/2027', '2027-07-15');
await numberField('One-time item 1, amount (dollars)', `${SHEET} input[aria-label^="Item 1 amount"]`, '12500');
await numberField('Lease editor, market rent for this space (dollars)', `${SHEET} input[aria-label="Market rent for this space"]`, '38.75');

// something typed that is not a date: kept as typed, a hint, nothing stored; Escape puts the last date back
await step('invalid date', async () => {
  const sel = '#ls-leaseStart';
  const bad = await typeChars(sel, '02/30/2027');
  await page.keyboard.press('Tab'); await pause(250);
  const loc = page.locator(sel);
  const invalid = await loc.getAttribute('aria-invalid');
  const hint = await loc.locator('xpath=..').locator('.di-hint').textContent();
  check('a date that is not a date (02/30/2027) is typed in full', bad.length === 0, note(bad));
  check('…is left as typed, not wiped', (await loc.inputValue()) === '02/30/2027');
  check('…is marked invalid and says what to try', invalid === 'true' && /Try 01\/15\/2027 or Jan 2027/.test(hint), `${invalid} ${hint}`);
  check('…is not stored: the lease still starts 2027-01-05', (await loc.evaluate(ISO)) === '2027-01-05');
  await loc.focus();
  await page.keyboard.press('Escape'); await pause(150);
  check('Escape puts back the last date and clears the hint', (await loc.inputValue()) === '01/05/2027' && (await loc.getAttribute('aria-invalid')) === null);
  const bad2 = await typeChars(sel, '3/3/2029');
  await page.keyboard.press('Escape'); await pause(150);
  check('Escape on a typed, unsaved date puts the saved one back', bad2.length === 0 && (await loc.inputValue()) === '01/05/2027', await loc.inputValue());
  await page.keyboard.press('Tab');
  // the sheet is still open after Escape on a date (Escape was the field's)
  check('…and Escape in the date does not close the sheet', await page.locator('#sheet-body').isVisible());
  // an emptied field is a cleared date
  await typeChars('#ls-rentStart', '');
  await page.keyboard.press('Tab'); await pause(250);
  check('an emptied date is cleared', (await page.locator('#ls-rentStart').evaluate(ISO)) === '' && (await page.locator('#ls-rentStart').inputValue()) === '');
  await dateField('Lease editor, rent start, typed again', '#ls-rentStart', '1/1/27', '2027-01-01');
});
// the calendar button, and the date it gives
await step('calendar', async () => {
  const pickers = await page.locator(`${SHEET} .dateinput button[aria-label^="Pick a date"]`).count();
  check('every date in the lease editor has a calendar button', pickers >= 9, `${pickers}`);
  const native = page.locator(`${SHEET} .dateinput`).first().locator('input[type=date]');
  await native.evaluate((e) => { e.value = '2030-03-15'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
  await pause(250);
  check('a date picked on the calendar is kept', (await page.locator('#ls-leaseStart').evaluate(ISO)) === '2030-03-15' && (await page.locator('#ls-leaseStart').inputValue()) === '03/15/2030');
  await page.locator('#ls-leaseStart').locator('xpath=..').locator('button').click();
  check('the calendar button opens without error', true);
  await page.keyboard.press('Escape'); await pause(100);
});
await page.click('#sheet-close').catch(() => {});
await pause(300);

});

await step('home', async () => {
 await calm();
// -------------------------------------------------------------- home
await page.evaluate(() => { location.hash = '#home'; });
await page.waitForSelector('#task-due');
await dateField('Home task due', '#task-due', '2027-01-05', '2027-01-05');

});

await step('comps', async () => {
 await calm();
// -------------------------------------------------------------- comps
await page.evaluate(() => { location.hash = '#comps'; });
await page.waitForSelector('#file', { state: 'attached' });
await page.setInputFiles('#file', F + 'costar-comps.pdf');
await page.waitForFunction(() => document.querySelectorAll('#sales-table tbody tr').length > 0, null, { timeout: 20000 });
const SALE = '#sales-table tbody tr:first-child input[aria-label="Sale date"]';
await dateField('Comps, sale date', SALE, '5/17/2024', '2024-05-17');
await dateField('Comps, sale date, a month', SALE, 'Aug 2023', '2023-08-01');
{
  const stored = await page.locator(SALE).evaluate(ISO);
  check('Comps: the sale date is not kept as an early year or empty while typing', stored === '2023-08-01', stored);
}

});

await step('tools', async () => {
 await calm();
// -------------------------------------------------------------- tools
await page.evaluate(() => { location.hash = '#tools'; });
await page.waitForSelector('#tools-root button.tool');
const openTool = async (id) => { await page.click(`#tools-root button.tool[data-tool="${id}"]`); await page.waitForSelector('#sheet-body .results li'); };
await openTool('x1031');
await dateField('Tools, 1031 exchange closing date', '#tool-x1031-closing', '1/15/2026', '2026-01-15', { how: 'Enter' });
{
  const out = await page.$$eval('#sheet-body .results li', (x) => x.map((l) => l.innerText.replace(/\n/g, ' ')));
  check('Tools: the deadlines are worked out once the date is kept', out.some((l) => /Mar 1, 2026/.test(l)) && out.some((l) => /Jul 14, 2026/.test(l)), out.join(' | '));
}
await page.click('#sheet-close'); await pause(250);
await openTool('escalation');
await dateField('Tools, rent escalation start', '#tool-escalation-start', 'Jul 2026', '2026-07-01');
await numberField('Tools, term in months (whole number)', '#tool-escalation-months', '84');
await numberField('Tools, starting rent (dollars and cents)', '#tool-escalation-rate', '36.5');
await page.click('#sheet-close'); await pause(250);
await openTool('dcf');
await numberField('Tools, DCF NOI (dollars)', '#tool-dcf-noi', '1000000', '1,000,000');
await numberField('Tools, DCF discount rate (percent)', '#tool-dcf-discount', '8.5');
await page.click('#sheet-close'); await pause(250);
// WALT rows: a table of text, numbers and a date
await page.locator('#tools-root button.tool', { hasText: /WALT|weighted/i }).first().click().catch(() => {});
await pause(400);
if (await page.locator('#sheet-body table.rows-edit').count()) {
  await dateField('Tools, WALT lease expiry', '#sheet-body input[aria-label="end for row 1"]', '12/31/2030', '2030-12-31');
  await numberField('Tools, WALT rent (dollars)', '#sheet-body input[aria-label="annual for row 1"]', '96000');
} else check('Tools: the WALT table opens', false);

});

// ------------------------------------------------------------- phone
{
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  check('no sideways scrolling at phone size', w[0] <= w[1], JSON.stringify(w));
  const txt = await page.locator('#app').innerText();
  check('no NaN/undefined/Infinity', !/\b(NaN|undefined|Infinity)\b/.test(txt));
}
check('no console errors', errors.length === 0, errors.join(' | '));

for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
console.log('PASS', R.filter((x) => x[0] === 'PASS').length, 'FAIL', R.filter((x) => x[0] === 'FAIL').length, 'errors', errors);
await browser.close();
// a failed check fails the run (run.sh stops on it)
process.exit(R.some((x) => x[0] === 'FAIL') || errors.length ? 1 : 0);
