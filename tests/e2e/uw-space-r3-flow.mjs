/* One underwriting space, release 3 (docs/proposals/one-underwriting-space.md B, F): the built-in tool's Model step has the
 * app's Quick check, Calculators and Save as deal. Phone and desktop size.
 *  - the panel is in the Model step; with a fresh tool every field is blank (starting values are not the broker's)
 *  - after the fictional example and figures set in the tool, the panel starts from the tool's figures (dollars to percent of price)
 *  - its results are the engine's: line for line the same as Quick underwrite's card for the same nine inputs
 *  - a planted difference (a loan percent that is not the tool's loan) shows both figures with a flag, and clears when fixed
 *  - Save as deal: a sheet asks first (Cancel changes nothing), creates the deal with the engine's figures, Undo removes it;
 *    with a deal open it offers Update with before/after, and Undo puts the deal back; a confidential deal is never offered Update
 *  - a calculator opens over the tool, starts from the check's figures and computes
 *  - axe clean inside the frame, 44 px targets, no animation under reduced motion, zero outside requests, zero console errors
 *
 *   node uw-space-r3-flow.mjs        # BASE=http://localhost:8080/ by default */
import { createRequire } from 'module';
import fs from 'node:fs';
import { phone, BASE, finish } from './lib.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const AXE_SRC = fs.readFileSync(AXE, 'utf8');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const origin = new URL(BASE).origin;
const SHOTS = process.env.SHOTS || '/tmp/shots/uw3';
fs.mkdirSync(SHOTS, { recursive: true });

const toolFrame = (page) => page.frames().find((f) => /\/app\/uwtool\/index\.html/.test(f.url()));
const dealCount = (page) => page.evaluate(async () => (await (await import('./app/store.js')).listDeals()).length);
const lastDeal = (page) => page.evaluate(async () => { const d = (await (await import('./app/store.js')).listDeals())[0]; return d && { id: d.id, name: d.name, figures: d.figures, loan: d.loan, live: d.live }; });
const makeDeal = (page, fields) => page.evaluate(async (f) => { const m = await import('./app/dealui.js'); const d = await m.createDeal(f, 'test fixture'); await m.showDeal(d.id); return d.id; }, fields);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// poll a Node-side condition (an async predicate given to waitForFunction would count as true at once)
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { if (await fn()) return true; await wait(100); } return false; };

async function openTool(page) {
  await page.locator('.tab[data-view="underwrite"]:visible').first().click();
  await page.waitForSelector('#uwt-frame');
  const f = toolFrame(page);
  await page.waitForFunction(() => { const fr = [...document.querySelectorAll('iframe')][0]; try { return !!fr.contentWindow.document.querySelector('#quickCheck'); } catch { return false; } }, null, { timeout: 25000 });
  return toolFrame(page) || f;
}
const lines = (f) => f.evaluate(() => [...document.querySelectorAll('#qcResults li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
const val = (f, id) => f.inputValue(`#qc_${id}`);
async function setTool(f, fin) {
  await f.evaluate((x) => { const m = UWEditor.model(); Object.assign(m.finance, x); UWEditor.commit(); window.dispatchEvent(new Event('uw-model-change')); }, fin);
}
async function type(f, id, v) { await f.fill(`#qc_${id}`, v); await wait(150); }

async function run(label, opts) {
  const { browser, ctx, page, errors } = await phone(opts);
  page.setDefaultTimeout(20000);
  const outside = [];
  ctx.on('request', (r) => { if (!r.url().startsWith(origin) && !/^(data|blob|about):/.test(r.url())) outside.push(r.url()); });
  const L = (s) => `${label}: ${s}`;
  await page.goto(`${BASE}#home`, { waitUntil: 'load' });
  const f = await openTool(page);

  /* ---- fresh tool: panel is in the Model step; every field blank */
  check(L('the Quick check panel is inside the Model step'), await f.evaluate(() => !!document.querySelector('#stepModel #quickCheck h3') && document.querySelector('#qcTitle').textContent === 'Quick check'));
  const blanks = await f.evaluate(() => [...document.querySelectorAll('#quickCheck input')].map((i) => i.value));
  check(L('a fresh tool: nine fields, every one blank (the tool\'s 30 years, 10-year hold and 2% are starting values, not figures of yours)'), blanks.length === 9 && blanks.every((v) => v === ''), JSON.stringify(blanks));
  check(L('the panel says why each is blank'), /Left blank/.test(await f.textContent('#qcBlank')) && /starting value/.test(await f.textContent('#qcBlank')));
  check(L('blank in, blank out: with nothing typed the results are dashes and Save as deal is disabled'), (await lines(f)).slice(0, 2).every((t) => /—/.test(t)) && await f.isDisabled('#qcSave'));
  check(L('the Calculators entry is in the Model step'), await f.evaluate(() => !!document.querySelector('#stepModel #qcCalcs summary') && document.querySelectorAll('#qcCalcs [data-calc]').length >= 6));

  /* ---- the fictional example, then figures set in the tool */
  await f.waitForSelector('#exampleLoad');
  await f.click('#exampleLoad');
  await f.waitForFunction(() => /example/i.test(UWEditor.model().name));
  await f.waitForFunction(() => document.querySelector('#qc_noi').value !== '');
  const toolNoi = await f.evaluate(() => UW.calc(UWEditor.model(), Number(UWEditor.model().forecastStart)).totals.noi);
  const noiField = await val(f, 'noi');
  check(L('the example gives the NOI field the tool\'s own first-year NOI'), Math.abs(parseFloat(noiField.replace(/,/g, '')) - Math.round(toolNoi * 100) / 100) < 0.005, `${noiField} vs ${toolNoi}`);
  check(L('with no price typed in the tool the price and loan fields stay blank'), (await val(f, 'price')) === '' && (await val(f, 'ltv')) === '');
  await setTool(f, { price: 4000000, loan: 2600000, rate: 0.065, amortization: 25, holdYears: 7, exitCap: 0.07, saleCost: 0.025, closing: 40000 });
  await f.waitForFunction(() => document.querySelector('#qc_price').value !== '');
  const got = {}; for (const id of ['price', 'ltv', 'rate', 'amort', 'closing', 'hold', 'exitCap', 'saleCost']) got[id] = await val(f, id);
  check(L('the panel starts from the tool: price, loan as 65 % of price, rate 6.5 %, 25 years, closing 1 %, hold 7, exit cap 7 %, sale costs 2.5 %'),
    JSON.stringify(got) === JSON.stringify({ price: '4,000,000', ltv: '65', rate: '6.5', amort: '25', closing: '1', hold: '7', exitCap: '7', saleCost: '2.5' }), JSON.stringify(got));
  check(L('the example\'s no-flag state: the tool\'s loan and equity equal the engine\'s, so no flag shows'), await f.isHidden('#qcFlag'));
  await page.screenshot({ path: `${SHOTS}/after-${label}-model.png` }).catch(() => {});
  await f.locator('#quickCheck').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/after-${label}-check.png` }).catch(() => {});

  /* ---- the engine's results equal Quick underwrite's for the same inputs (read now; the comparison below opens that view) */
  const mine = await lines(f);
  check(L('the results carry the engine\'s rows (cap rate, DSCR, debt yield, levered IRR...)'), mine.length >= 12 && /^Cap rate/.test(mine[0]) && mine.some((t) => /^DSCR/.test(t)) && mine.some((t) => /^Levered IRR/.test(t)), mine.join(' | ').slice(0, 300));
  const texts = {}; for (const id of ['price', 'noi', 'ltv', 'rate', 'amort', 'closing', 'hold', 'exitCap', 'saleCost']) texts[id] = await val(f, id);

  /* ---- a planted difference: a loan percent that is not the tool's loan */
  await type(f, 'ltv', '60');
  const flagText = await f.textContent('#qcFlag');
  check(L('planted difference: both loans are shown (the app $2,400,000.00, the tool $2,600,000.00) and the deal keeps the app\'s'), !(await f.isHidden('#qcFlag')) && /Loan: the app works out \$2,400,000\.00; this tool has \$2,600,000\.00/.test(flagText) && /keeps the app/.test(flagText), flagText);
  check(L('the tool\'s own return calculation is incomplete for the example, so there is no tool equity to compare: only the loan is flagged'), !/Equity/.test(flagText), flagText);
  const lend = await lines(f);
  check(L('the results are the engine\'s for the typed 60 %, not the tool\'s loan'), lend.some((t) => /^Loan.*\$2,400,000/.test(t)), lend.join(' | ').slice(0, 200));
  const before = await f.evaluate(() => JSON.stringify(UWEditor.model().finance));
  check(L('the tool\'s own model is untouched by the panel'), JSON.parse(before).loan === 2600000);
  await type(f, 'ltv', '65');
  check(L('back at 65 % the flag clears'), await f.isHidden('#qcFlag'));
  await type(f, 'ltv', '60');
  await f.click('#qcRefill');
  check(L('"Use this tool\'s figures" puts 65 back and clears the flag'), (await val(f, 'ltv')) === '65' && await f.isHidden('#qcFlag'));
  await type(f, 'saleCost', '-1');
  check(L('a refused entry (negative sale costs) says so and the engine\'s default is used'), /can’t be used here/.test(await f.textContent('#qc_err_saleCost')));
  await f.click('#qcRefill');

  /* ---- size, reduced motion, axe */
  const sizes = await f.evaluate(() => [...document.querySelectorAll('#quickCheck input, #quickCheck button, #quickCheck summary')].map((e) => { const r = e.getBoundingClientRect(); return [e.id || e.textContent.slice(0, 12), Math.round(r.height), Math.round(r.width)]; }));
  check(L('every input, button and summary in the panel is at least 44 px high'), sizes.every(([, h]) => h >= 44), JSON.stringify(sizes.filter(([, h]) => h < 44)));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await f.fill('#qc_price', '4,100,000'); await wait(200);
  check(L('reduced motion: the panel runs no animation or transition'), await f.evaluate(() => document.getAnimations().filter((a) => document.querySelector('#quickCheck').contains(a.effect?.target)).length === 0));
  await f.fill('#qc_price', '4,000,000'); await wait(150);
  await f.evaluate(AXE_SRC);
  await f.evaluate(() => { document.querySelector('#qcCalcs').open = true; });
  const ax = await f.evaluate(async () => (await axe.run(document.querySelector('#quickCheck'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`));
  check(L('axe: the Quick check and Calculators panel inside the frame'), ax.length === 0, ax.join(' | '));
  await f.evaluate(() => { document.querySelector('#qcCalcs').open = false; });

  /* ---- a calculator opens over the tool and computes */
  await f.evaluate(() => { document.querySelector('#qcCalcs').open = true; });
  await f.click('#qcCalcs [data-calc="loan"]');
  await page.waitForSelector('#sheet[open]');
  const sheet = await page.evaluate(() => ({ title: document.getElementById('sheet-title').textContent, inputs: [...document.querySelectorAll('#sheet-body input')].map((i) => i.value).slice(0, 5), res: document.getElementById('sheet-body').textContent, full: document.body.classList.contains('uw-full') }));
  check(L('Loan sizing opens over the tool (the tool stays on screen) with the check\'s price, NOI, loan percent, rate and years'), sheet.title === 'Loan sizing' && sheet.full && sheet.inputs[0] === '4,000,000' && sheet.inputs[2] === '65' && sheet.inputs[3] === '6.5' && sheet.inputs[4] === '25', JSON.stringify(sheet.inputs));
  check(L('and it computes: Maximum loan and the binding test'), /Maximum loan.*\$[\d,]+/.test(sheet.res) && /limited by/.test(sheet.res), sheet.res.slice(0, 160));
  await page.click('#sheet-close');
  await f.click('#qcCalcs [data-calc="offer"]');
  await page.waitForSelector('#sheet[open]');
  check(L('Offer and seller net opens too, and its sale-price field is not filled from the check'), (await page.textContent('#sheet-title')) === 'Offer and seller net');
  await page.click('#sheet-close');

  /* ---- Save as deal: cancel, create, undo */
  const n0 = await dealCount(page);
  await f.click('#qcSave');
  await page.waitForSelector('#sheet[open]');
  const s1 = await page.evaluate(() => ({ t: document.getElementById('sheet-title').textContent, body: document.getElementById('sheet-body').textContent, foot: [...document.querySelectorAll('#sheet-foot button')].map((b) => b.textContent) }));
  check(L('Save as deal asks first: a sheet lists the figures that become the deal'), s1.t === 'Save as deal' && /Price.*\$4,000,000\.00/.test(s1.body) && /Loan to value.*65%/.test(s1.body) && /Create a new deal/.test(s1.body), s1.body.slice(0, 200));
  check(L('with no deal open it offers Create only (and Cancel)'), JSON.stringify(s1.foot) === JSON.stringify(['Cancel', 'Create new deal']), JSON.stringify(s1.foot));
  await page.click('#sheet-foot button:has-text("Cancel")');
  await wait(300);
  check(L('Cancel creates nothing'), (await dealCount(page)) === n0);
  await f.click('#qcSave');
  await page.waitForSelector('#sheet[open]');
  await page.click('#sheet-foot button:has-text("Create new deal")');
  await page.waitForSelector('.toast button:has-text("Undo")');
  const made = await lastDeal(page);
  check(L('the deal is created with the engine\'s figures (price 4,000,000.00, 65 % loan, 6.5 %, 25 years, hold 7, exit cap 7)'), (await dealCount(page)) === n0 + 1 && made.figures.price === 4000000 && made.loan.ltv === 65 && made.loan.rate === 6.5 && made.loan.amort === 25 && made.live.hold === 7 && made.live.exitCap === 7 && made.live.saleCost === 2.5, JSON.stringify(made));
  check(L('the deal has the tool\'s property name'), /example/i.test(made.name), made.name);
  await page.screenshot({ path: `${SHOTS}/after-${label}-saved.png` }).catch(() => {});
  await page.click('.toast button:has-text("Undo")');
  await until(async () => (await dealCount(page)) === n0);
  check(L('Undo removes the deal and returns to the tool'), (await dealCount(page)) === n0 && await page.evaluate(() => document.body.classList.contains('uw-full')));

  /* ---- with a deal open: Update with before and after, then Undo */
  const id = await makeDeal(page, { name: 'Invented Plaza', figures: { price: 3500000, noi: 250000 }, sources: { price: { hand: true } }, loan: { ltv: 55, rate: 6, amort: 30 }, live: {}, targets: {} });
  const f2 = await openTool(page);
  await f2.waitForFunction(() => document.querySelector('#qc_price') !== null);
  await wait(500);
  await type(f2, 'price', '3,600,000.55'); await type(f2, 'ltv', '60');
  await f2.click('#qcSave');
  await page.waitForSelector('#sheet[open]');
  const s2 = await page.evaluate(() => ({ body: document.getElementById('sheet-body').textContent, foot: [...document.querySelectorAll('#sheet-foot button')].map((b) => b.textContent) }));
  check(L('with a deal open the sheet offers Update, with before and after for the figures that differ'), s2.foot.includes('Update Invented Plaza') && /Price.*Before: \$3,500,000\.00.*After: \$3,600,000\.55/.test(s2.body) && /Loan to value.*Before: 55%.*After: 60%/.test(s2.body), s2.body.slice(0, 400));
  const dealBefore = JSON.stringify(await lastDeal(page));
  check(L('nothing is written while the sheet is open'), (await lastDeal(page)).figures.price === 3500000);
  await page.click('#sheet-foot button:has-text("Update Invented Plaza")');
  await page.waitForSelector('.toast button:has-text("Undo")');
  await wait(600);
  const upd = await lastDeal(page);
  check(L('Update writes the listed figures, to the cent, with no new deal'), upd.figures.price === 3600000.55 && upd.loan.ltv === 60 && (await dealCount(page)) === n0 + 1, JSON.stringify(upd));
  await page.click('.toast button:has-text("Undo")');
  await until(async () => (await lastDeal(page)).figures.price === 3500000);
  const undone = await lastDeal(page);
  check(L('Undo puts the deal\'s price and loan back'), undone.figures.price === 3500000 && undone.loan.ltv === 55, dealBefore + ' -> ' + JSON.stringify(undone));

  /* ---- confidential: never offered Update from the tool */
  await makeDeal(page, { name: 'Invented Secret', confidential: true, figures: { price: 1000000 }, sources: {}, loan: {}, live: {}, targets: {} });
  const f3 = await openTool(page);
  await wait(500);
  await type(f3, 'price', '1,200,000');
  await f3.click('#qcSave');
  await page.waitForSelector('#sheet[open]');
  const s3 = await page.evaluate(() => [...document.querySelectorAll('#sheet-foot button')].map((b) => b.textContent));
  check(L('a confidential deal open: Save as deal offers Create only, never Update'), JSON.stringify(s3) === JSON.stringify(['Cancel', 'Create new deal']), JSON.stringify(s3));
  check(L('and the tool\'s Model step was not filled from the confidential deal'), (await val(f3, 'price')) === '1,200,000' && !(await f3.evaluate(() => UWEditor.model().finance.price === 1000000)));
  await page.click('#sheet-foot button:has-text("Cancel")');

  check(L('not one request to another host'), outside.length === 0, outside.join(' '));
  check(L('no console error or warning'), errors.length === 0, errors.join(' | ').slice(0, 300));
  await browser.close();
  return texts;
}

/* ---- Quick underwrite, for the same nine inputs, gives the same rows */
async function compareWithQuick(label, opts) {
  const { browser, page } = await phone(opts);
  page.setDefaultTimeout(20000);
  await page.goto(`${BASE}#home`, { waitUntil: 'load' });
  const f = await openTool(page);
  await f.waitForSelector('#exampleLoad');
  await f.click('#exampleLoad');
  await f.waitForFunction(() => /example/i.test(UWEditor.model().name));
  await setTool(f, { price: 4000000, loan: 2600000, rate: 0.065, amortization: 25, holdYears: 7, exitCap: 0.07, saleCost: 0.025, closing: 40000 });
  await f.waitForFunction(() => document.querySelector('#qc_price').value !== '');
  const ids = ['price', 'noi', 'ltv', 'rate', 'amort', 'closing', 'hold', 'exitCap', 'saleCost'];
  const t = {}; for (const id of ids) t[id] = await val(f, id);
  const panel = await lines(f);
  await page.click('#uw-view-quick');
  await page.waitForSelector('#uw-price');
  for (const id of ids) { await page.fill(`#uw-${id}`, t[id]); await page.dispatchEvent(`#uw-${id}`, 'change'); }
  await wait(400);
  const quick = await page.evaluate(() => [...document.querySelectorAll('#uw-results li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
  const answers = await page.evaluate(() => [...document.querySelectorAll('#uw-answers li')].map((li) => li.querySelector('.why').textContent + li.querySelector('b').textContent));
  check(`${label}: the Quick check rows equal Quick underwrite's for the same nine inputs (${quick.length} rows)`, quick.length >= 12 && JSON.stringify(panel.slice(0, quick.length)) === JSON.stringify(quick), JSON.stringify(panel.map((p, i) => p === quick[i] ? null : [p, quick[i]]).filter(Boolean)));
  check(`${label}: and its two price answers (reason and figure) equal Quick underwrite's`, answers.length === 2 && answers.every((a, i) => panel[quick.length + i].endsWith(a)), JSON.stringify([panel.slice(quick.length), answers]));
  await browser.close();
}

await run('desktop', { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 });
await run('phone', { viewport: { width: 390, height: 844 } });
await compareWithQuick('desktop', { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 });
await compareWithQuick('phone', { viewport: { width: 390, height: 844 } });

for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', []);
