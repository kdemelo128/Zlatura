/* The Underwrite tab and quick underwriting with no deal (Underwriting workspace W1).
 *   - the tab on a phone (the bar is Home, Deals, Underwrite, Comps, Tools; Settings is a gear in the top bar)
 *     and on a desktop (the sidebar); Settings and Tools stay reachable;
 *   - every field typed one character at a time: after each keystroke it holds exactly what was typed, and it is
 *     still the same focused element;
 *   - the figures on the card equal the same inputs typed on a deal page, label by label;
 *   - a reload keeps the quick underwriting; Save as a deal makes a deal (history: "Created from a quick
 *     underwriting") and removes it; Undo removes the deal and brings it back;
 *   - axe, targets, and 150 ms per edit.
 *   node underwrite-flow.mjs        # BASE=http://localhost:8080/ by default */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();
page.setDefaultTimeout(8000);
const pause = (ms = 25) => page.waitForTimeout(ms);

/** Focus a field and type `text` one key at a time; the keystrokes after which it was not exactly the typed prefix, still focused and the same element. */
async function typeChars(sel, text) {
  const loc = page.locator(sel);
  await loc.scrollIntoViewIfNeeded();
  await loc.focus();
  await page.evaluate(() => { window.__probe = document.activeElement; });
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await pause();
  const bad = [];
  let prefix = '';
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
/** Label → value of the lines of one results list, whichever page it is on. */
const lines = (sel) => page.evaluate((s) => Object.fromEntries([...document.querySelectorAll(`${s} > li`)].map((li) => [li.firstElementChild.firstChild.textContent.trim(), li.lastElementChild.textContent.trim()])), sel);
const SHOW_PANE = async (sel) => { const id = await page.evaluate((s) => { const e = document.querySelector(s); const p = e && e.closest('[id^="pane-"]'); return p ? p.id.replace('pane-', '') : null; }, sel); if (id) await page.click(`#tab-${id}`); };
const storeCall = (fn, arg) => page.evaluate(async ([f, a]) => { const s = await import('/app/store.js'); return s[f](a); }, [fn, arg]);

/* What is typed: [selector, text]. The loan terms and hold assumptions differ from the defaults, so a default can't pass for a typed value. */
const INPUTS = [
  ['#uw-name', 'Quick look: corner retail (fictional)'], ['#uw-price', '2400000'], ['#uw-noi', '156000'], ['#uw-bsf', '8000'], ['#uw-units', '12'], ['#uw-ptype', 'Retail'],
  ['#uw-gross', '300000'], ['#uw-opex', '144000'],
  ['#uw-ltv', '60'], ['#uw-rate', '6.25'], ['#uw-amort', '25'], ['#uw-closing', '1.5'], ['#uw-minDscr', '1.3'], ['#uw-minDy', '9'],
  ['#uw-hold', '7'], ['#uw-growth', '3'], ['#uw-exitCap', '7.5'], ['#uw-saleCost', '1.5'],
];
// the figures that appear on the card and, with the same label, on the deal page
const SAME = ['Cap rate', 'Price / SF', 'Loan', 'DSCR', 'Debt yield', 'Cash-on-cash, year 1', 'Equity, with closing', 'Largest loan it supports', 'Levered IRR', 'Equity multiple', 'Unlevered IRR'];
const ANSWERS = ['Price for a cap rate of', 'Price for a levered IRR of'];

/* ------------------------------------------------------------ the phone */

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForSelector('#view-home', { state: 'visible' });
const bar = await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab:not([hidden])')].map((t) => t.dataset.view));
check('phone bar: Home, Deals, Underwrite, Comps, Tools; Settings is not on it', JSON.stringify(bar) === JSON.stringify(['home', 'deal', 'underwrite', 'comps', 'tools']), bar.join(','));
const fits = await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab:not([hidden])')].map((t) => { const w = t.getBoundingClientRect().width; const sp = t.querySelector('span'); return [t.dataset.view, Math.round(w), Math.ceil(sp.scrollWidth), sp.scrollWidth <= Math.min(w, 390 / 6) + 0.5]; }));
check('phone bar: every label fits its slot, even when the bar holds six items (65 px at 390 px)', fits.every((f) => f[3]) && new Set(await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab:not([hidden])')].map((t) => Math.round(t.getBoundingClientRect().top)))).size === 1, JSON.stringify(fits));
check('the top bar has a Settings gear, at least 36 px', await page.evaluate(() => { const g = document.querySelector('.appbar [data-view="settings"]'); const r = g && g.getBoundingClientRect(); return !!r && r.width >= 36 && r.height >= 36 && g.getAttribute('aria-label') === 'Settings'; }));

await page.click('.tabbar .tab[data-view="underwrite"]');
await page.waitForSelector('#uw-card');
check('the Underwrite tab opens its screen, is marked current and titles the page', await page.isVisible('#view-underwrite') && (await page.getAttribute('.tabbar .tab[data-view="underwrite"]', 'aria-current')) === 'page' && (await page.title()) === 'Underwrite · Zlatura' && page.url().endsWith('#underwrite'), await page.title());
check('the card starts from the remembered loan terms a new deal uses (65% at 6.75% over 30 years)', (await page.inputValue('#uw-ltv')) === '65' && (await page.inputValue('#uw-rate')) === '6.75' && (await page.inputValue('#uw-amort')) === '30');
check('with nothing typed, no figure is shown as a number (a blank is absent, never 0)', Object.values(await lines('#uw-results')).every((v) => v === '—'), JSON.stringify(await lines('#uw-results')));
check('nothing is saved until something is typed', (await page.textContent('#uw-list')).includes('Nothing saved yet') && (await storeCall('kvGet', 'uw.scratch')) === null);

// every field, one character at a time
for (const [sel, text] of INPUTS) {
  const bad = await typeChars(sel, text);
  check(`${sel}: “${text}” typed key by key, nothing lost on the way`, bad.length === 0, note(bad));
  await page.keyboard.press('Tab');
}
check('the figures tidy up when a field is left ($2,400,000 and 8,000)', (await page.inputValue('#uw-price')) === '$2,400,000' && (await page.inputValue('#uw-bsf')) === '8,000');
// the answers' targets are typed fields too
for (const [sel, text] of [['#uw-target-cap', '7'], ['#uw-target-irr', '15']]) {
  const bad = await typeChars(sel, text);
  check(`${sel}: “${text}” typed key by key`, bad.length === 0, note(bad));
  await page.keyboard.press('Tab');
}
await pause(400);
const quick = { ...(await lines('#uw-results')), ...(await lines('#uw-answers')) };
check('the card shows every figure (cap rate 6.50%, $300.00 per SF, per unit $200,000)', quick['Cap rate'] === '6.50%' && quick['Price / SF'] === '$300.00' && quick['Per unit'] === '$200,000' && quick['Loan'] === '$1,440,000', JSON.stringify(quick));
check('the largest loan names the test that limits it', /limited by/.test(await page.textContent('#uw-results')));
check('the engine’s defaults show in grey where a field is blank', await (async () => { await page.fill('#uw-hold', ''); await page.keyboard.press('Tab'); const ph = await page.getAttribute('#uw-hold', 'placeholder'); await typeChars('#uw-hold', '7'); await page.keyboard.press('Tab'); return ph === '5'; })());
check('Build NOI: gross less expenses is offered as NOI, which is already $156,000, so no button', (await page.locator('#uw-build button').count()) === 0 && /\$156,000/.test(await page.textContent('#uw-build')));
await page.fill('#uw-opex', '140000'); await page.keyboard.press('Tab');
check('Build NOI: a different NOI is offered with a button, not filled in', (await page.inputValue('#uw-noi')) === '$156,000' && (await page.locator('#uw-build button').count()) === 1);
await page.fill('#uw-opex', '144000'); await page.keyboard.press('Tab');
const dscr = quick.DSCR;
await page.click('label.switch');
await pause(150);
check('Interest only changes the debt service and DSCR', (await lines('#uw-results')).DSCR !== dscr);
await page.click('label.switch');
await pause(150);
check('and switching it off gives the same DSCR again', (await lines('#uw-results')).DSCR === dscr);
await pause(500);
check('the quick underwriting is listed with its price, cap rate and levered IRR', /Quick look: corner retail \(fictional\)/.test(await page.textContent('#uw-list')) && /6\.50% cap/.test(await page.textContent('#uw-list')));
const stored = await storeCall('kvGet', 'uw.scratch');
check('it is stored in kv uw.scratch in the proposal’s shape: v 1, whole-number figures as typed, no zero for a blank',
  stored.length === 1 && stored[0].v === 1 && stored[0].figures.price === 2400000 && stored[0].loan.ltv === 60 && stored[0].live.hold === 7 && stored[0].targets.cap === 7 && !('cap' in stored[0].figures) && Object.values(stored[0].figures).every((v) => v !== 0), JSON.stringify(stored));

// a reload keeps it
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#uw-card');
await page.waitForFunction(() => document.querySelector('#uw-price') && document.querySelector('#uw-price').value !== '');
check('a reload keeps the quick underwriting and its figures', (await page.inputValue('#uw-price')) === '$2,400,000' && (await page.inputValue('#uw-name')) === 'Quick look: corner retail (fictional)' && JSON.stringify({ ...(await lines('#uw-results')), ...(await lines('#uw-answers')) }) === JSON.stringify(quick));

// the same inputs on a deal page
await page.click('.tabbar .tab[data-view="deal"]');
await page.click('text=Enter figures by hand');
await page.waitForSelector('#fig-price');
await page.fill('#fig-price', '2400000'); await page.keyboard.press('Tab'); await pause(200);
await page.fill('#fig-noi', '156000'); await page.keyboard.press('Tab'); await pause(200);
await page.fill('#fig-bsf', '8000'); await page.keyboard.press('Tab'); await pause(200);
await SHOW_PANE('#loan-ltv');
for (const [k, v] of [['ltv', '60'], ['rate', '6.25'], ['amort', '25'], ['closing', '1.5'], ['minDscr', '1.3'], ['minDy', '9']]) { await page.fill(`#loan-${k}`, v); await page.keyboard.press('Tab'); await pause(150); }
await SHOW_PANE('#scn-hold');
for (const [k, v] of [['hold', '7'], ['growth', '3'], ['exitCap', '7.5'], ['saleCost', '1.5']]) { await page.fill(`#scn-${k}`, v); await page.keyboard.press('Tab'); await pause(200); }
await page.fill('#scn-answers input[aria-label="Price for a cap rate of target, percent"]', '7'); await page.keyboard.press('Tab'); await pause(300);
const onDeal = { ...(await lines('#deal-fin-out .results')), ...(Object.fromEntries((await page.evaluate(() => [...document.querySelectorAll('#scn-out tr')].slice(1).map((tr) => [tr.children[0].textContent.trim(), tr.children[1].textContent.trim()])))) ) };
const dealAnswers = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#scn-answers li')].map((li) => [li.firstElementChild.firstChild.textContent.trim(), li.lastElementChild.textContent.trim()])));
const dealFig = { ...onDeal, ...dealAnswers };
for (const k of [...SAME, ...ANSWERS]) check(`on a deal page with the same inputs: ${k} is the same (${quick[k]})`, dealFig[k] === quick[k] || (k === 'Cash-on-cash, year 1' && dealFig[k] === quick[k]), `quick ${quick[k]} · deal ${dealFig[k]}`);

// Save as a deal, then Undo
const before = (await storeCall('listDeals')).length;
await page.click('.tabbar .tab[data-view="underwrite"]');
await page.click('#uw-save-deal');
await page.waitForSelector('#view-deal:not([hidden]) #deal-tiles .tile');
await SHOW_PANE('#fig-price');
const toastText = await page.textContent('.toast');
check('Save as a deal opens the new deal, with a toast that offers Undo', /Saved as a deal/.test(toastText) && (await page.locator('.toast button', { hasText: 'Undo' }).count()) === 1, toastText);
await pause(400);
const saved = { ...(await lines('#deal-fin-out .results')), ...(Object.fromEntries((await page.evaluate(() => [...document.querySelectorAll('#scn-out tr')].slice(1).map((tr) => [tr.children[0].textContent.trim(), tr.children[1].textContent.trim()]))))), ...(await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#scn-answers li')].map((li) => [li.firstElementChild.firstChild.textContent.trim(), li.lastElementChild.textContent.trim()])))) };
const deals = await storeCall('listDeals');
const made = deals.find((d) => d.name === 'Quick look: corner retail (fictional)');
check('the deal page shows the same figures as the card did, label by label', [...SAME, ...ANSWERS].every((k) => saved[k] === quick[k]), [...SAME, ...ANSWERS].filter((k) => saved[k] !== quick[k]).map((k) => `${k}: ${quick[k]} vs ${saved[k]}`).join('; '));
check('one more deal exists, with the figures marked as typed by hand', deals.length === before + 1 && !!made && made.figures.price === 2400000 && made.sources.price.hand === true && made.loan.ltv === 60 && made.targets.cap === 7, JSON.stringify(made && made.figures));
const hist = await storeCall('historyOf', made.id);
check('its history begins "Created from a quick underwriting"', hist.length >= 1 && hist[0].kind === 'create' && hist[0].label === 'Created from a quick underwriting', JSON.stringify(hist.slice(0, 1)));
check('the quick underwriting is gone from storage and from the list', (await storeCall('kvGet', 'uw.scratch')) === null);
await page.locator('.toast button', { hasText: 'Undo' }).click();
await page.waitForSelector('#view-underwrite:not([hidden]) #uw-card');
await pause(600);
check('Undo returns to Underwrite with the quick underwriting back, as it was', (await page.inputValue('#uw-price')) === '$2,400,000' && (await page.inputValue('#uw-name')) === 'Quick look: corner retail (fictional)' && (await storeCall('kvGet', 'uw.scratch')).length === 1);
check('and the deal it made is deleted', (await storeCall('listDeals')).length === before && !(await storeCall('listDeals')).some((d) => d.name === 'Quick look: corner retail (fictional)'));
// Save again, and keep it
await page.click('#uw-save-deal');
await page.waitForSelector('#view-deal:not([hidden]) #deal-tiles .tile');
await pause(400);
check('saved again, the deal is kept and the quick underwriting stays gone', (await storeCall('listDeals')).filter((d) => d.name === 'Quick look: corner retail (fictional)').length === 1 && (await storeCall('kvGet', 'uw.scratch')) === null);
await page.click('.tabbar .tab[data-view="underwrite"]');
await page.waitForSelector('#uw-card');
check('a new blank card follows, starting from the loan terms last typed on a deal (60%)', (await page.inputValue('#uw-ltv')) === '60' && (await page.inputValue('#uw-price')) === '');

// New, Delete and Undo
await typeChars('#uw-price', '1000000.105'); await page.keyboard.press('Tab'); await pause(500);
check('money is kept in whole cents ($1,000,000.11 stored)', (await storeCall('kvGet', 'uw.scratch'))[0].figures.price === 1000000.11);
await typeChars('#uw-bsf', '8000'); await page.keyboard.press('Tab');
await page.fill('#uw-bsf', ''); await page.keyboard.press('Tab'); await pause(500);
const blanked = (await storeCall('kvGet', 'uw.scratch'))[0];
check('clearing a field makes it absent in storage, never 0, and its figures go blank', !('bsf' in blanked.figures) && (await lines('#uw-results'))['Price / SF'] === '—', JSON.stringify(blanked.figures));
await page.click('#uw-delete');
await pause(300);
check('Delete removes it and offers Undo', (await storeCall('kvGet', 'uw.scratch')) === null && (await page.locator('.toast button', { hasText: 'Undo' }).count()) === 1);
await page.locator('.toast button', { hasText: 'Undo' }).click();
await pause(500);
check('Undo brings the deleted quick underwriting back', (await storeCall('kvGet', 'uw.scratch')).length === 1 && (await page.inputValue('#uw-price')) === '$1,000,000');

// 150 ms per edit: each keystroke on the price redraws every figure
const times = await page.evaluate(async () => {
  const i = document.querySelector('#uw-noi');
  const out = [];
  for (let n = 0; n < 12; n++) {
    i.value = String(70000 + n * 111);
    const t0 = performance.now();
    i.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    out.push(performance.now() - t0);
  }
  return out;
});
check('perf: an edit redraws every figure within 150 ms', Math.max(...times) < 150, `worst ${Math.max(...times).toFixed(1)} ms of ${times.length}`);

// axe and targets on the screen
async function audit(name) {
  await pause(450);
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] })).violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) })));
  check(`axe: ${name}`, res.length === 0, res.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.join(' | ')}`).join('\n    '));
}
await audit('Underwrite, light');
await page.emulateMedia({ colorScheme: 'dark' });
await audit('Underwrite, dark');
await page.emulateMedia({ colorScheme: 'light' });
const small = await page.evaluate(() => [...document.querySelectorAll('#view-underwrite button, #view-underwrite input:not([type=hidden])')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && !(e.type === 'checkbox') && (r.width < 24 || r.height < 24); }).map((e) => e.id || e.textContent.slice(0, 20)));
check('targets are at least 24 px on the screen', small.length === 0, small.join(', '));
check('no horizontal overflow on the phone', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
for (const w of [320]) {
  await page.setViewportSize({ width: w, height: 800 });
  await pause(200);
  check(`reflows at ${w} px without sideways scrolling`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  check(`the bar's labels fit at ${w} px`, await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab:not([hidden])')].every((t) => t.querySelector('span').scrollWidth <= t.getBoundingClientRect().width + 0.5)));
}
await page.setViewportSize({ width: 390, height: 844 });

// Settings and Tools stay reachable
await page.click('.appbar [data-view="settings"]');
await page.waitForSelector('#view-settings #settings-data');
check('Settings opens from the gear in the top bar', await page.isVisible('#view-settings') && await page.isVisible('#settings-data'));
await page.click('.tabbar .tab[data-view="tools"]');
check('Tools opens from the bar', await page.isVisible('#view-tools') && (await page.locator('#tools-root button, #tools-root a').count()) > 0);
await page.click('.tabbar .tab[data-view="underwrite"]');
await page.click('#uw-calculators');
check('the Calculators row on Underwrite opens Tools', await page.isVisible('#view-tools'));
// the search menu
await page.click('.appbar [data-cmd]');
await page.keyboard.type('new quick underw');
await page.waitForSelector('dialog.cmdk[open] [role=option]');
check('the search menu offers New quick underwriting and Underwrite', /New quick underwriting/.test(await page.textContent('dialog.cmdk')));
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelector('#view-underwrite:not([hidden]) #uw-price') && document.querySelector('#uw-price').value === '').catch(() => {});
check('choosing it opens Underwrite on a new blank card', await page.isVisible('#view-underwrite') && (await page.inputValue('#uw-price')) === '', await page.evaluate(() => JSON.stringify([...document.querySelectorAll('.view')].filter((v) => !v.hidden).map((v) => v.id)) + document.querySelector('#uw-price').value + ' / ' + document.querySelector('#uw-name').value));
await page.evaluate(() => { location.hash = '#settings'; });
await pause(200);
check('#settings still routes to Settings', await page.isVisible('#view-settings'));
await page.evaluate(() => { location.hash = '#underwrite'; });
await pause(200);
check('#underwrite routes to the tab', await page.isVisible('#view-underwrite'));

/* ----------------------------------------------------------- the desktop */

const D = await phone({ viewport: { width: 1360, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 });
await D.page.goto(BASE, { waitUntil: 'load' });
await D.page.waitForSelector('#view-home', { state: 'visible' });
const side = await D.page.evaluate(() => [...document.querySelectorAll('.sidebar .tab:not([hidden])')].map((t) => t.dataset.view));
check('desktop sidebar: Home, Deals, Underwrite, Comps, Tools, Settings', JSON.stringify(side) === JSON.stringify(['home', 'deal', 'underwrite', 'comps', 'tools', 'settings']), side.join(','));
check('desktop: the top bar (and its gear) is not shown', !(await D.page.isVisible('.appbar')));
await D.page.click('.sidebar .tab[data-view="underwrite"]');
await D.page.waitForSelector('#uw-card');
await D.page.locator('#uw-price').pressSequentially('5200000');
await D.page.locator('#uw-noi').pressSequentially('338000');
await D.page.keyboard.press('Tab');
await D.page.waitForTimeout(300);
const dl = await D.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#uw-results > li')].map((li) => [li.firstElementChild.firstChild.textContent.trim(), li.lastElementChild.textContent.trim()])));
check('desktop: the card works (6.50% cap on $5,200,000 and $338,000)', dl['Cap rate'] === '6.50%', JSON.stringify(dl));
check('desktop: the sidebar marks Underwrite current, and there is no horizontal overflow', (await D.page.getAttribute('.sidebar .tab[data-view="underwrite"]', 'aria-current')) === 'page' && (await D.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)));
await D.page.click('.sidebar .tab[data-view="settings"]');
await D.page.waitForSelector('#view-settings #settings-data');
check('desktop: Settings is still in the sidebar', await D.page.isVisible('#view-settings'));
await D.page.click('.sidebar .tab[data-view="tools"]');
await D.page.waitForSelector('#view-tools button');
check('desktop: Tools is still in the sidebar', await D.page.isVisible('#view-tools'));
await D.browser.close();

await browser.close();
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
check('no console errors or failed requests', errors.length + D.errors.length === 0, [...errors, ...D.errors].slice(0, 3).join(' | '));
for (const r of R.slice(-1)) if (r[0] === 'FAIL') console.log(r.join(' | '));
finish(R, 'errors', [...errors, ...D.errors]);
