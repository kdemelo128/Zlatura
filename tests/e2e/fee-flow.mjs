/* The deal's fee record (deal.fee) and the Fees CSV, in a browser: the Fee card
 * on a deal made by hand, every field typed one key at a time (nothing wiped or
 * reformatted until the field is left), the expected fee and splits, the
 * invoice, two payments and what is outstanding, kept across a reload, in a
 * backup and its restore, in the CSV (with a spreadsheet-formula deal name),
 * and Undo. Then axe at phone and desktop size and the 150 ms edit budget.
 *
 *   node fee-flow.mjs                        # BASE=http://localhost:8080/ by default
 *   OLD_BASE=http://localhost:8081/ node fee-flow.mjs   # also: an older app (4.7.56), served there, refuses this version's backup */
import fs from 'fs';
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const { browser, ctx, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(8000);
const pause = (ms = 25) => page.waitForTimeout(ms);
const settle = () => page.waitForTimeout(700); // a save is kept 400 ms after the last edit
const txt = (sel) => page.textContent(sel);
const EVIL = "=cmd|' /C calc'!A0";
const deals = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('deals').objectStore('deals').getAll(); g.onsuccess = () => { r.result.close(); res(g.result.map((d) => ({ id: d.id, name: d.name, schema: d.schema, fee: d.fee ?? null, updatedAt: d.updatedAt }))); }; }; }));
const fee = async () => (await deals())[0].fee;

/** Focus a field and type `text` one key at a time: after EVERY keystroke it must hold exactly what was typed so far, still focused and the same element. */
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
/** Type into a field, leave it with Tab, and say what it held after. */
async function enter(name, sel, text, expectShown) {
  const bad = await typeChars(sel, text);
  await page.keyboard.press('Tab');
  await pause(120);
  const shown = await page.inputValue(sel);
  check(`${name}: typed one key at a time`, bad.length === 0, bad.slice(0, 2).join(' | '));
  if (expectShown !== undefined) check(`${name}: shown as ${JSON.stringify(expectShown)} once left`, shown === expectShown, JSON.stringify(shown));
}

/* ---------------------------------------------------------- a deal by hand */
await page.goto(`${BASE}#deal`, { waitUntil: 'load' });
await page.getByRole('button', { name: 'Enter figures by hand' }).click();
await page.waitForSelector('#fig-price');
await page.fill('#fig-price', '6450000');
await page.press('#fig-price', 'Tab');
await settle();
// the name a spreadsheet would read as a formula
await page.click('#deal-card h1');
await page.keyboard.press('ControlOrMeta+a');
await page.keyboard.type(EVIL);
await page.keyboard.press('Enter');
await settle();

check('the Fee card offers a record, and a deal has none yet (absent, not $0)', /Add a fee record/.test(await txt('#deal-fee')) && (await fee()) === null);
await page.click('#fee-add');
await page.waitForSelector('#fee-price');
await settle();
const empty = await fee();
check('adding a record stores every field empty (null, never 0)', empty && empty.price === null && empty.flatPct === null && empty.coBrokerPct === null && empty.referralPct === null && empty.housePct === null && empty.invoiced === null && Array.isArray(empty.paid) && empty.paid.length === 0 && Array.isArray(empty.tiers) && empty.tiers.length === 0, JSON.stringify(empty));
check('with no fee price the expected fee stays blank', /never guessed/.test(await txt('#fee-expected')) && !/\$/.test(await txt('#fee-expected')));
const useText = await txt('#fee-use-asking');
check('one tap offers the asking price, spelled out', useText === 'Use the asking price ($6,450,000)', useText);
await page.click('#fee-use-asking');
await page.waitForSelector('#fee-price');
await settle();
check('it copies the asking price in as if typed', (await page.inputValue('#fee-price')) === '6,450,000' && (await fee()).price === 6450000);
check('and the offer is gone once there is a price', (await page.locator('#fee-use-asking').count()) === 0);

/* ------------------------------------------------ terms, typed key by key */
await enter('the fee price', '#fee-price', '5250000', '5,250,000');
await enter('the flat rate', '#fee-flat', '0.5', '0.5');
await settle();
let f = await fee();
check('0.5 stays 0.5% (not 50%), the price is whole dollars as typed', f.flatPct === 0.5 && f.price === 5250000, JSON.stringify([f.flatPct, f.price]));
check('the expected fee is the price times the rate', /Expected fee.*\$26,250\.00/.test(await txt('#fee-expected')), (await txt('#fee-expected')).slice(0, 80));
// the flat rate cleared: the tiers speak
await page.fill('#fee-flat', '');
await page.press('#fee-flat', 'Tab');
await enter('tier 1 limit', '#fee-tier-up-1', '1000000', '1,000,000');
await enter('tier 1 rate', '#fee-tier-pct-1', '6', '6');
await enter('tier 2 limit', '#fee-tier-up-2', '5000000', '5,000,000');
await enter('tier 2 rate', '#fee-tier-pct-2', '4', '4');
await enter('the top tier rate', '#fee-tier-pct-3', '2', '2');
await settle();
f = await fee();
check('the tiers are stored as typed, the flat rate is cleared to null', f.flatPct === null && JSON.stringify(f.tiers) === JSON.stringify([{ upTo: 1000000, pct: 6 }, { upTo: 5000000, pct: 4 }, { upTo: null, pct: 2 }]), JSON.stringify([f.flatPct, f.tiers]));
check('tiers: 6% of the first $1M, 4% of the next $4M, 2% of the last $250k', /Expected fee.*\$225,000\.00/.test(await txt('#fee-expected')), (await txt('#fee-expected')).slice(0, 80));
check('with the shares not entered there is no split (a blank is not 0)', /Enter all three shares/.test(await txt('#fee-expected')) && !/Agent/.test(await txt('#fee-expected')));
await enter('the co-broker share', '#fee-co', '50', '50');
await enter('the referral share', '#fee-ref', '0', '0');
check('two of three shares: still no split', /Enter all three shares/.test(await txt('#fee-expected')));
await enter('the house share', '#fee-house', '40', '40');
const split = await txt('#fee-expected');
check('all three shares (an explicit 0 counts): the split shows', /Our side\s*\$112,500\.00/.test(split) && /Referral\s*\$0\.00/.test(split) && /House\s*\$45,000\.00/.test(split) && /Agent\s*\$67,500\.00/.test(split), split.slice(0, 200));

/* ------------------------------------------------- invoiced and payments */
await enter('the invoice amount', '#fee-inv-amount', '225000', '225,000');
await enter('the invoice date', '#fee-inv-on', '3/1/26', '03/01/2026');
await enter('the invoice reference', '#fee-inv-ref', 'INV-101');
check('invoiced, nothing paid yet: no balance is guessed', /Invoiced\s*\$225,000\.00/.test(await txt('#fee-owed')) && /Enter the amount of every payment|Paid to date/.test(await txt('#fee-owed')));
await page.click('#fee-add-payment');
await page.waitForSelector('#fee-pay-amount-1');
check('a payment with no amount yet is not a payment of 0 (no balance shown)', /Enter the amount of every payment/.test(await txt('#fee-owed')));
await enter('payment 1 amount', '#fee-pay-amount-1', '100000', '100,000');
await enter('payment 1 date', '#fee-pay-on-1', '4/1/26', '04/01/2026');
await page.click('#fee-add-payment');
await page.waitForSelector('#fee-pay-amount-2');
await enter('payment 2 amount', '#fee-pay-amount-2', '50000.5', '50,000.50');
await enter('payment 2 date', '#fee-pay-on-2', '5/2/26', '05/02/2026');
await settle();
check('two payments: paid to date and what is outstanding', /Paid to date.*\$150,000\.50/.test(await txt('#fee-owed')) && /Outstanding\s*\$74,999\.50/.test(await txt('#fee-owed')), (await txt('#fee-owed')).slice(0, 160));
f = await fee();
check('stored on the deal as typed: cents, ISO dates, schema 6', f.price === 5250000 && f.invoiced.amount === 225000 && f.invoiced.on === '2026-03-01' && f.invoiced.ref === 'INV-101'
  && JSON.stringify(f.paid) === JSON.stringify([{ amount: 100000, on: '2026-04-01', ref: '' }, { amount: 50000.5, on: '2026-05-02', ref: '' }]) && (await deals())[0].schema === 6, JSON.stringify(f));

/* ------------------------------------------------------- reload and Undo */
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#fee-price');
check('after a reload the terms, invoice and payments are all there', (await page.inputValue('#fee-price')) === '5,250,000' && (await page.inputValue('#fee-inv-ref')) === 'INV-101' && (await page.inputValue('#fee-pay-amount-2')) === '50,000.50' && /Outstanding\s*\$74,999\.50/.test(await txt('#fee-owed')));
await enter('the invoice reference, changed', '#fee-inv-ref', 'INV-102');
await settle();
check('Undo names the edit', /^Undo: Fee: invoice reference/.test(await page.getAttribute('#deal-undo', 'aria-label')), await page.getAttribute('#deal-undo', 'aria-label'));
await page.click('#deal-undo');
await settle();
await page.waitForSelector('#fee-price');
check('Undo puts the reference back, in the card and in storage', (await page.inputValue('#fee-inv-ref')) === 'INV-101' && (await fee()).invoiced.ref === 'INV-101');
await page.click('#fee-add-payment');
await page.waitForSelector('#fee-pay-amount-3');
await page.click('button[aria-label="Remove payment 3"]');
await settle();
check('a payment removed is gone from the list and from storage', (await page.locator('#fee-pay-amount-3').count()) === 0 && (await fee()).paid.length === 2);

/* ------------------------------------------------------------ the CSV */
await page.evaluate(() => { location.hash = '#home'; });
await page.waitForSelector('#pipeline-report');
await page.click('#pipeline-report');
const [csvDl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('.action-sheet .action-item', { hasText: 'Fees CSV' }).click()]);
const csvFile = `${SHOTS}fees.csv`;
await csvDl.saveAs(csvFile);
const csv = fs.readFileSync(csvFile, 'utf8').replace(/^﻿/, '');
const rows = csv.trim().split('\r\n');
check('the Fees CSV has a header and one row for the one deal with a record', rows.length === 2 && rows[0].startsWith('Deal ID,Deal,Stage,Address,Fee price,Rate %,Gross fee,Co-broker,Our side,Referral,House,Agent,Invoiced,Invoice date,Invoice ref,Paid to date,Last payment,Outstanding'), rows[0]);
check('a deal named like a spreadsheet formula is guarded with a leading quote', rows[1].split(',')[1] === `'${EVIL}`, rows[1].slice(0, 60));
check('money has 2 decimals, the dates are ISO, the balance is right', /,5250000\.00,/.test(rows[1]) && /,225000\.00,/.test(rows[1]) && /,2026-03-01,INV-101,150000\.50,2026-05-02,74999\.50$/.test(rows[1]), rows[1]);

/* --------------------------------------------- backup, wipe and restore */
await page.evaluate(() => { location.hash = '#settings'; });
await page.waitForSelector('#settings-data #backup-make');
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#backup-make')]);
const bfile = `${SHOTS}fee-backup.json`;
await dl.saveAs(bfile);
const bj = JSON.parse(fs.readFileSync(bfile, 'utf8'));
check('the backup carries the fee record on the deal, as backup version 2', bj.version === 2 && bj.deals.length === 1 && bj.deals[0].schema === 6 && bj.deals[0].fee.paid.length === 2 && bj.deals[0].fee.invoiced.ref === 'INV-101', JSON.stringify([bj.version, bj.deals[0].schema]));
const before = await fee();
await page.evaluate(() => new Promise((res) => { localStorage.clear(); const r = indexedDB.deleteDatabase('zlatura'); r.onsuccess = res; r.onerror = res; r.onblocked = res; }));
await page.goto(`${BASE}#settings`, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#settings-data #backup-file', { state: 'attached' });
await page.setInputFiles('#backup-file', bfile);
await page.waitForSelector('dialog.action-sheet');
check('the restore reads it and offers the deal', /Deals: 1 added/.test(await txt('dialog.action-sheet')));
await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.locator('dialog.action-sheet .action-item', { hasText: 'Merge into this device' }).click()]);
check('after a wipe and a restore the fee record is back, field for field', JSON.stringify(await fee()) === JSON.stringify(before), JSON.stringify(await fee()));
await page.evaluate(() => { location.hash = '#deal'; });
await page.waitForSelector('#deal-root');
if (await page.locator('#deal-root .list .li').count()) await page.locator('#deal-root .list .li').first().click();
await page.waitForSelector('#fee-price');
check('and the restored deal shows it', (await page.inputValue('#fee-price')) === '5,250,000' && /Outstanding\s*\$74,999\.50/.test(await txt('#fee-owed')));

if (process.env.OLD_BASE) {
  // an app from before the fee record: this version's backup is refused, so the older app can't drop the fee
  const old = await ctx.newPage();
  await old.goto(`${process.env.OLD_BASE}#settings`, { waitUntil: 'load' });
  await old.waitForSelector('#settings-data #backup-file', { state: 'attached' });
  await old.setInputFiles('#backup-file', bfile);
  await old.waitForTimeout(1500);
  const said = await old.evaluate(() => document.body.innerText);
  check('an older app refuses this version’s backup (“update the app first”), restoring nothing', /saved by a newer version of .*update the app first\. Nothing was restored/.test(said), said.slice(0, 200));
  await old.close();
}

/* ------------------------------------------ axe, at phone and desktop size */
async function axe(name) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document.querySelector('#deal-fee'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  });
  check(`axe: the Fee card, ${name}`, res.length === 0, res.join('\n    '));
}
await page.locator('#deal-fee').scrollIntoViewIfNeeded();
await axe('phone size');
const small = await page.evaluate(() => [...document.querySelectorAll('#deal-fee button, #deal-fee input')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.width < 24 || r.height < 24); }).map((e) => e.id || e.getAttribute('aria-label') || e.textContent));
check('every control on the Fee card is at least 24 px (phone size)', small.length === 0, small.join(', '));
const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('the card does not push the page sideways at phone size', wide <= 0, `${wide}px`);
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(300);
await axe('desktop size');

/* --------------------------------------- 150 ms per edit, at desktop size */
const times = [];
for (let i = 0; i < 5; i++) {
  const v = String(101000 + i * 1000); // never the value already there: no change, no edit
  await page.fill('#fee-pay-amount-1', v);
  await page.evaluate(() => {
    const w = window; w.__t = null;
    document.addEventListener('change', () => {
      const t0 = performance.now();
      const target = document.getElementById('fee-owed');
      const before = target.textContent;
      const mo = new MutationObserver(() => { if (target.textContent !== before) { mo.disconnect(); requestAnimationFrame(() => setTimeout(() => { w.__t = performance.now() - t0; }, 0)); } });
      mo.observe(target, { childList: true, subtree: true, characterData: true });
    }, { capture: true, once: true });
  });
  await page.press('#fee-pay-amount-1', 'Tab');
  await page.waitForFunction(() => window.__t !== null, null, { timeout: 5000 });
  times.push(await page.evaluate(() => window.__t));
  await page.waitForTimeout(500);
}
const med = [...times].sort((a, b) => a - b)[2];
console.log(`edit a payment, balance painted: median ${Math.round(med)} ms (runs: ${times.map((t) => Math.round(t)).join(', ')})`);
check('an edit shows its result in under 150 ms (median of 5, desktop size)', med < 150, `${Math.round(med)} ms; runs ${times.map((t) => Math.round(t)).join(', ')}`);
check('and no single edit took over 150 ms', Math.max(...times) < 150, `max ${Math.round(Math.max(...times))} ms`);

await browser.close();
for (const [s, n, x] of R) console.log(s, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', errors);
