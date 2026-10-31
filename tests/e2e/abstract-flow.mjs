/* The lease abstract creator (L1) in a browser: the Lease abstracts card on a deal (collapsed by default), an abstract made from
 * a lease on the Documents card, a header typed one key at a time in every kind of input, a relative commencement (the lease's
 * words, no date), three terms of steps (one relative, unresolved), a clause, an option and a flag, "lease says none" and "not in
 * lease", every item ticked but the unresolved one, the workbook (single and portfolio, recalculated by LibreOffice in run.sh),
 * the CSV and JSON, the print view with its Draft footer, Undo, a reload, a backup round trip, a confidential deal making no
 * request, 150 ms a commit with 60 abstracts, and axe on the card and the editor at phone and desktop size. Invented text only.
 *
 *   node abstract-flow.mjs                        # BASE=http://localhost:8080/ by default */
import fs from 'fs';
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';

const req = createRequire(import.meta.url);
const AXE = req.resolve('axe-core/axe.min.js');
const fflate = req('fflate');
const F = new URL('./files/', import.meta.url).pathname;
const { browser, ctx, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(8000);
const pause = (ms = 25) => page.waitForTimeout(ms);
const settle = () => page.waitForTimeout(700); // a save is kept 400 ms after the last edit
const txt = (sel) => page.textContent(sel);
const outside = [];
page.on('request', (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u); });
const deals = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('deals').objectStore('deals').getAll(); g.onsuccess = () => { r.result.close(); res(g.result); }; }; }));
let dealId = null;
const abs = async () => (await deals()).find((x) => x.id === dealId).abstracts;
const mem = (name, text, mimeType = 'text/plain') => ({ name, mimeType, buffer: Buffer.from(text) });
const sheetOpen = () => page.locator('dialog.sheet[open] .ab-editor').count();

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
  await page.keyboard.press('Tab'); // leaving the field is what saves it
  await pause(60);
  return bad;
}
const typed = async (name, sel, text) => { const bad = await typeChars(sel, text); check(`typing ${name} one key at a time keeps every character, the focus and the same field`, bad.length === 0, bad.slice(0, 2).join(' | ')); };

/* ---------------------------------------------------- a deal, and a lease on the Documents card */
await page.goto(`${BASE}#deal`, { waitUntil: 'load' });
await page.getByRole('button', { name: 'Enter figures by hand' }).click();
await page.waitForSelector('#fig-price');
await page.fill('#fig-price', '6450000');
await page.press('#fig-price', 'Tab');
await settle();
dealId = await page.evaluate(() => localStorage.getItem('zlatura.deal.current'));
await page.waitForSelector('#ab-toggle');
check('a new deal has an empty abstract list at schema 8, made by the app', (await deals())[0].schema === 8 && JSON.stringify((await deals())[0].abstracts) === JSON.stringify({ v: 1, items: [] }));
check('the Lease abstracts card is collapsed by default, and its heading is a button that says so', (await page.getAttribute('#ab-toggle', 'aria-expanded')) === 'false' && (await page.locator('#ab-body').isHidden()) && (await txt('#ab-toggle')) === 'Lease abstracts');
await page.click('#dd-toggle');
await page.waitForSelector('#dd-files', { state: 'attached' });
await page.setInputFiles('#dd-files', mem('Example Cafe lease.txt', 'LEASE AGREEMENT\nThis Lease is made between the Landlord and the Tenant.\nThe Premises, the lease term and the commencement date.\nBase rent and rent commencement are set out below.\n'));
await pause(900);
if (await page.locator('dialog.action-sheet').count()) await page.locator('dialog.action-sheet .action-item', { hasText: /Yes, it is lease|^Lease/ }).first().click();
await pause(900);
const leaseBtn = page.locator('button.dd-abstract');
check('a Doc of type lease gets an "Abstract" button, at least 44 px', (await leaseBtn.count()) === 1 && (await leaseBtn.boundingBox()).height >= 43.5);
await leaseBtn.click();
await page.waitForSelector('.ab-editor');
await settle();
let a = (await abs()).items;
check('the button makes an abstract linked to that Doc, titled from the file name, and opens the editor', a.length === 1 && a[0].docs.length === 1 && a[0].title === 'Example Cafe lease' && (await page.inputValue('#ab-title')) === 'Example Cafe lease', JSON.stringify(a.map((x) => [x.title, x.docs])));
check('and the card is open with the abstract listed', (await page.getAttribute('#ab-toggle', 'aria-expanded')) === 'true' && /Lease abstracts \(1\)/.test(await txt('#ab-toggle')));

/* ---------------------------------------------------- the header, one key at a time */
await typed('a name (text)', '#abf-tenant', 'Example Cafe LLC');
await typed('a pasted address (several lines)', '#abf-noticeTenant', '100 Example Way');
await typed('a security deposit (money)', '#abf-deposit', '4250.5');
await typed('a pro-rata share (percent)', '#abf-proRata', '7.35');
await typed('the stated term (whole months)', '#abf-termMonths', '30');
await typed('a note of the lease (clause)', '#abf-cBaseRent', 'Base rent is payable monthly in advance.');
await typed('the area (square feet)', '#abf-sf', '12000');
await typed('a date', '#abf-expiration', '06/30/2029');
await typed('the lease’s words for a date', '#abf-commencement-rel', 'the first of the month after delivery');
await page.selectOption('#abf-sf-basis', 'rentable');
await pause(200);
await typed('what the pro-rata share covers', '#abf-proRataCovers', 'real estate taxes');
await typed('the stated pct cap', '#abf-capPct', '5');
a = (await abs()).items[0];
await settle();
a = (await abs()).items[0];
check('values are stored as typed: text, dollars to whole cents, a percent (not a fraction), SF with its basis, an ISO date', a.fields.tenant.value === 'Example Cafe LLC' && a.fields.deposit.value === 4250.5 && a.fields.proRata.value === 7.35 && a.fields.termMonths.value === 30 && a.fields.sf.value === 12000 && a.fields.sf.basis === 'rentable' && a.fields.expiration.value === '2029-06-30' && a.fields.capPct.value === 5, JSON.stringify(a.fields).slice(0, 300));
check('the lease’s words with no date are stored as found with rel and a null value, not as a date', a.fields.commencement && a.fields.commencement.status === 'found' && a.fields.commencement.value === null && a.fields.commencement.rel === 'the first of the month after delivery', JSON.stringify(a.fields.commencement));
check('the money shows as dollars after it is left', (await page.inputValue('#abf-deposit')) === '$4,250.50');
check('a relative date with no date fails the check in words: "depends on"', /Problem: Commencement: depends on: the first of the month after delivery/.test(await txt('.ab-checks')), await txt('.ab-checks'));
await page.fill('#abf-deposit', 'abc');
await page.press('#abf-deposit', 'Tab');
check('a value that is not a number is refused in words and the old value stays', /Security deposit: type a number/.test(await txt('.ab-editor .warn-text')) && (await abs()).items[0].fields.deposit.value === 4250.5);
await page.fill('#abf-deposit', '4250.50'); await page.press('#abf-deposit', 'Tab');

/* ---------------------------------------------------- none, not in lease, source */
await page.click('[data-key="guarantor"] button:has-text("Not in lease")');
await page.click('[data-key="assignmentFee"] button:has-text("Lease says none")');
await settle();
a = (await abs()).items[0];
check('"Not in lease" stores null with the status not-found, never 0', a.fields.guarantor.status === 'not-found' && a.fields.guarantor.value === null);
check('"Lease says none" with no source stores 0, found, with the note "no clause"', a.fields.assignmentFee.status === 'found' && a.fields.assignmentFee.value === 0 && a.fields.assignmentFee.note === 'no clause');
check('the status line announces it, with the count', /Assignment fee: marked none, with the note “no clause”\. \d+ of \d+ checked\./.test(await txt('#ab-live')), await txt('#ab-live'));
check('the chip says Not found in words', /Not found/.test(await txt('[data-key="guarantor"] .chip')));
await page.locator('[data-key="deposit"] summary').click();
const sid = await page.evaluate(() => document.querySelector('[data-key="deposit"] details select').id.replace(/-doc$/, ''));
await page.selectOption(`#${sid}-doc`, { index: 1 });
await typeChars(`#${sid}-page`, '7');
await page.fill(`#${sid}-quote`, 'The Security Deposit is $4,250.50.');
await page.press(`#${sid}-quote`, 'Tab');
await settle();
a = (await abs()).items[0];
check('a source is a document, a page and a quote of at most 240 characters, with a live counter', a.fields.deposit.src.length === 1 && a.fields.deposit.src[0].page === 7 && a.fields.deposit.src[0].quote === 'The Security Deposit is $4,250.50.' && a.fields.deposit.src[0].doc === a.docs[0] && (await page.getAttribute(`#${sid}-quote`, 'maxlength')) === '240' && /34 of 240 characters/.test(await txt('[data-key="deposit"] details')), JSON.stringify(a.fields.deposit.src));

/* ---------------------------------------------------- rent: terms and steps */
await page.click('#ab-add-term');
await pause(300);
const term = page.locator('.ab-term').first();
await term.getByLabel('Name', { exact: true }).fill('Original term');
await term.getByLabel('Name', { exact: true }).press('Tab');
await term.getByLabel('Section cited').fill('3.1'); await term.getByLabel('Section cited').press('Tab');
for (let i = 0; i < 3; i++) { await term.getByRole('button', { name: 'Add step' }).click(); await pause(250); }
const steps = page.locator('.ab-step');
check('three steps are added to the term', (await steps.count()) === 3);
const fill = async (i, label, v, exact = true) => { const c = steps.nth(i).getByLabel(label, { exact }); await c.fill(v); await c.press('Tab'); await pause(120); };
await fill(0, 'From', '01/01/2027'); await fill(0, 'To', '12/31/2027'); await fill(0, 'Annual rent', '51000'); await steps.nth(0).getByLabel('The rent is the').selectOption('year'); await pause(150);
await fill(1, 'From', '01/01/2028'); await fill(1, 'To', '12/31/2028'); await fill(1, 'Annual rent', '52530'); await steps.nth(1).getByLabel('The rent is the').selectOption('year'); await pause(150);
await fill(2, 'From month', '25'); await fill(2, 'To month', '36'); await fill(2, 'Annual rent', '54000'); await steps.nth(2).getByLabel('The rent is the').selectOption('year'); await pause(150);
await fill(0, 'Annual $/SF', '4.25');
await settle();
a = (await abs()).items[0];
check('steps are stored with typed dates, whole-cent amounts and the unit chosen; the third is by month numbers with no dates', a.steps.length === 3 && a.steps[0].from === '2027-01-01' && a.steps[0].amounts.year === 51000 && a.steps[0].amounts.psf_year === 4.25 && a.steps[1].amounts.year === 52530 && a.steps[2].mFrom === 25 && a.steps[2].mTo === 36 && a.steps[2].from === null && a.steps[2].primary === 'year', JSON.stringify(a.steps.map((s) => [s.from, s.mFrom, s.primary])));
const ro = await steps.evaluateAll((n) => n.map((x) => x.querySelector('.ab-readout').textContent));
check('each step reads out its monthly rent, months, total and the annual rate per SF (monthly x 12 / rentable SF)', /Monthly \$4,250\.00 · 12 months · Total \$51,000\.00 · Annual rate per SF \$4\.25 \(monthly x 12 \/ rentable SF\)/.test(ro[0]), ro[0]);
check('the relative step says it is unresolved until rent commencement is typed and checked, and the term has no total', /unresolved until rent commencement is typed and checked/.test(ro[2]) && /No total yet/.test(await txt('.ab-total')), ro[2]);
check('and the check list says so as a problem', /Problem: Rent, Year 3: unresolved until rent commencement is typed and checked/.test(await txt('.ab-checks')));
await typed('a step’s rent (money)', '.ab-step:nth-of-type(1) input[id$="-month"]', '4250');
// a monthly that disagrees with the annual is a problem
await steps.nth(0).getByLabel('Monthly rent', { exact: true }).fill('4300'); await steps.nth(0).getByLabel('Monthly rent', { exact: true }).press('Tab'); await pause(150);
check('a monthly that disagrees with the annual is a problem in words', /Rent, Year 1: monthly and annual disagree/.test(await txt('.ab-checks')));
await steps.nth(0).getByLabel('Monthly rent', { exact: true }).fill('4250'); await steps.nth(0).getByLabel('Monthly rent', { exact: true }).press('Tab'); await pause(150);

/* ---------------------------------------------------- an option, a clause, a flag */
await page.click('#ab-add-option');
await pause(250);
const opt = page.locator('.ab-option').first();
for (const [l, v] of [['How many', '2'], ['Months each', '60'], ['Notice at least', '6'], ['Notice at most', '12']]) { await opt.getByLabel(l, { exact: true }).fill(v); await opt.getByLabel(l, { exact: true }).press('Tab'); await pause(100); }
await page.selectOption('#ab-add-clause', { label: 'Signs' });
await pause(300);
await typed('an optional clause added from the list', '#abf-signs', 'Tenant may place one sign on the front.');
await page.selectOption('#ab-add-clause', '__custom');
await pause(300);
const cust = page.locator('.ab-field').filter({ has: page.getByLabel('Note name') }).first();
await cust.getByLabel('Note name').fill('Parking'); await cust.getByLabel('Note name').press('Tab');
await cust.getByLabel('Wording').fill('Four reserved spaces.'); await cust.getByLabel('Wording').press('Tab');
await page.fill('#ab-flag-text', 'Ask the landlord about the sign wording.');
await page.click('#ab-add-flag');
await pause(300);
await settle();
a = (await abs()).items[0];
check('an option, an optional clause, a custom note and a flag are stored', a.options.length === 1 && a.options[0].count === 2 && a.options[0].noticeMin === 6 && a.options[0].noticeMax === 12 && a.fields.signs.value === 'Tenant may place one sign on the front.' && a.clauses.length === 1 && a.clauses[0].text === 'Four reserved spaces.' && a.flags.length === 1, JSON.stringify([a.options, a.clauses, a.flags]).slice(0, 300));

/* ---------------------------------------------------- ticking */
check('the Checked button is off for an item that is unread (with its reason read out)', await page.evaluate(() => { const b = document.querySelector('[data-key="landlord"] .ab-tick'); return b.disabled && !!document.getElementById(b.getAttribute('aria-describedby')).textContent; }));
await page.evaluate(() => { for (const b of document.querySelectorAll('.ab-tick')) if (!b.disabled && b.getAttribute('aria-pressed') === 'false') b.click(); });
await pause(500);
await settle();
a = (await abs()).items[0];
check('the commencement (words, no date) and the relative step cannot be ticked while a problem names them', a.fields.commencement.checked === false && a.steps[2].checked === false && (await page.locator(`[data-step="${a.steps[2].id}"] .ab-tick`).isDisabled()) && /Needs your choice/.test(await txt(`[data-step="${a.steps[2].id}"] .chip`)));
check('everything else that is found or not found was ticked', a.fields.tenant.checked && a.fields.guarantor.checked && a.fields.assignmentFee.checked && a.steps[0].checked && a.steps[1].checked && a.options[0].checked && a.terms[0].checked && a.fields.signs.checked && a.clauses[0].checked);
check('the progress counts them in words', /^\d+ of \d+ checked · \d+ open flags?$/.test(await txt('.ab-progress')), await txt('.ab-progress'));
// an edit unticks and says so
const before = (await abs()).items[0].fields.tenant.checked;
await page.fill('#abf-tenant', 'Example Cafe LLC (the tenant)'); await page.press('#abf-tenant', 'Tab'); await pause(300);
check('editing a ticked item unticks it and announces why', before && /Tenant: changed, so no longer checked/.test(await txt('#ab-live')) && (await page.getAttribute('[data-key="tenant"] .ab-tick', 'aria-pressed')) === 'false');
await page.fill('#abf-tenant', 'Example Cafe LLC'); await page.press('#abf-tenant', 'Tab'); await pause(200);
await page.click('[data-key="tenant"] .ab-tick');
// a filter
await page.getByRole('radio', { name: 'Not found' }).click();
check('the filter shows only the items marked not in the lease', (await page.locator('.ab-field:visible').count()) === 1, String(await page.locator('.ab-field:visible').count()));
await page.getByRole('radio', { name: 'All' }).click();
// keys: j moves to the next field row, x ticks
await page.locator('.ab-editor').focus();
await page.evaluate(() => document.activeElement.blur());
await page.locator('[data-key="landlord"] input').first().focus();
await page.keyboard.press('Tab');
await page.locator('[data-key="landlord"] button').first().focus();
await page.keyboard.press('j');
check('j moves focus to the next field row (when no input has the keys)', await page.evaluate(() => !!document.activeElement.closest('.ab-field') && document.activeElement.closest('.ab-field').dataset.key !== 'landlord'));

/* ---------------------------------------------------- exports */
async function download(sel, name) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click(sel)]);
  const f = `${name}`;
  await dl.saveAs(f);
  return { file: f, name: dl.suggestedFilename() };
}
const xl = await download('#ab-xlsx', `${F}out-abstract.xlsx`);
const zip = fflate.unzipSync(new Uint8Array(fs.readFileSync(xl.file)));
const sx = new TextDecoder().decode(zip['xl/worksheets/sheet1.xml']);
const formulas = sx.match(/<f>[^<]*<\/f>/g) || [];
check('the workbook is named for the deal and the abstract, and its formulas are only the fixed templates (LibreOffice recalculates it in run.sh)', /lease abstract - Example Cafe lease\.xlsx$/.test(xl.name) && formulas.length >= 4 && formulas.every((f) => /^<f>(ROUND\(E\d+\*D\d+,2\)|ROUND\(E\d+\*12\/\$B\$\d+,4\)|SUM\([DF]\d+:[DF]\d+\)|ROUND\(F\d+\/\(D\d+\/12\)\/\$B\$\d+,4\))<\/f>$/.test(f)), `${xl.name} ${formulas.length}`);
check('the workbook says it contains lease wording', /contains lease wording/.test(await page.locator('.toast').first().innerText().catch(() => '')));
const csv = await download('#ab-csv', `${SHOTS}ab.csv`);
const csvText = fs.readFileSync(csv.file, 'utf8');
check('the CSV has CRLF line ends, the header row and the page but not the quote', csvText.startsWith('﻿Abstract,Section,Item,Value,Unit,Basis,Status,Checked,Page\r\n') && /Security deposit,4250\.5,total,,found,yes,7\r\n/.test(csvText) && !csvText.includes('The Security Deposit is'), csvText.split('\r\n').slice(0, 3).join(' / '));
const js = await download('#ab-json', `${SHOTS}ab.json`);
const jj = JSON.parse(fs.readFileSync(js.file, 'utf8'));
check('the JSON is a zlatura-abstracts file with the quote in it', jj.format === 'zlatura-abstracts' && jj.abstracts[0].fields.deposit.src[0].quote === 'The Security Deposit is $4,250.50.' && jj.confidential === false && /^\d+\.\d+\.\d+$/.test(jj.app));
// print
await page.evaluate(() => { window.__printed = null; window.print = () => { window.__printed = document.getElementById('print-sheet').innerText; }; });
await page.click('#ab-print');
await pause(300);
const printed = await page.evaluate(() => window.__printed);
check('the print view lists the key terms, the rent block with the labelled rate, the notes, and the Draft footer while items are open', printed && /Lease abstract/.test(printed) && /Example Cafe LLC/.test(printed) && /Annual rate per SF = monthly rent x 12 \/ rentable SF/.test(printed) && /Draft: \d+ items? not checked/.test(printed) && /Base rent: Base rent is payable monthly in advance/.test(printed), String(printed).slice(0, 200));

/* ---------------------------------------------------- Undo, reload, a second abstract and the portfolio */
await page.keyboard.press('Escape');
await pause(500);
check('closing the editor leaves the card in place', (await sheetOpen()) === 0 && /Example Cafe lease/.test(await txt('#ab-body')));
const flagsBefore = (await abs()).items[0].flags.length;
await page.locator('.ab-row button[aria-label^="Open "]').click();
await page.waitForSelector('.ab-editor');
await page.fill('#ab-flag-text', 'A second flag.'); await page.click('#ab-add-flag'); await settle();
check('a flag is added', (await abs()).items[0].flags.length === flagsBefore + 1);
await page.keyboard.press('Escape'); await pause(400);
await page.evaluate(() => document.activeElement && document.activeElement.blur());
await page.keyboard.press('ControlOrMeta+z');
await pause(700);
check('Undo (Ctrl+Z, as for any deal edit) takes the flag back', (await abs()).items[0].flags.length === flagsBefore, String((await abs()).items[0].flags.length));
await settle();
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ab-toggle');
check('after a reload the card is still open and the abstract is there with its progress', (await page.getAttribute('#ab-toggle', 'aria-expanded')) === 'true' && /Example Cafe lease/.test(await txt('#ab-body')) && /\d+ of \d+ checked/.test(await txt('.ab-row')));
await page.click('#ab-new');
await page.waitForSelector('.ab-editor');
await page.fill('#ab-title', 'Second suite'); await page.press('#ab-title', 'Tab'); await pause(300);
await page.fill('#abf-tenant', 'Example Books Inc'); await page.press('#abf-tenant', 'Tab'); await pause(300);
await page.keyboard.press('Escape'); await pause(400);
check('a second abstract is listed, and a portfolio workbook is offered only now', (await page.locator('.ab-row').count()) === 2 && (await page.locator('#ab-portfolio').count()) === 1);
const pf = await download('#ab-portfolio', `${F}out-abstracts-portfolio.xlsx`);
const pz = fflate.unzipSync(new Uint8Array(fs.readFileSync(pf.file)));
const wbx = new TextDecoder().decode(pz['xl/workbook.xml']);
check('the portfolio workbook has a Summary sheet first, then one sheet per abstract', /lease abstracts\.xlsx$/.test(pf.name) && /name="Summary"/.test(wbx) && (wbx.match(/<sheet /g) || []).length === 3 && /Example Cafe lease/.test(wbx) && /Second suite/.test(wbx), wbx.match(/<sheet [^>]*>/g).join(' '));

/* ---------------------------------------------------- delete and Undo */
await page.locator('.ab-row').nth(1).locator('button[aria-label^="More for"]').click();
await page.locator('dialog.action-sheet .action-item', { hasText: 'Delete' }).click();
await pause(400);
check('Delete removes the abstract and offers Undo', (await page.locator('.ab-row').count()) === 1);
await page.locator('.toast button', { hasText: 'Undo' }).click();
await pause(400);
check('and Undo puts it back where it was', (await page.locator('.ab-row').count()) === 2 && /Second suite/.test(await txt('.ab-row:nth-child(2)')));

/* ---------------------------------------------------- backup, wipe and restore */
await settle();
const full = (await abs());
await page.evaluate(() => { location.hash = '#settings'; });
await page.waitForSelector('#settings-data #backup-make');
const [bdl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#backup-make')]);
const bfile = `${SHOTS}ab-backup.json`;
await bdl.saveAs(bfile);
const bj = JSON.parse(fs.readFileSync(bfile, 'utf8'));
check('the backup carries the abstracts at schema 8, record for record', bj.deals.length === 1 && bj.deals[0].schema === 8 && JSON.stringify(bj.deals[0].abstracts) === JSON.stringify(full));
await page.evaluate(() => new Promise((res) => { localStorage.clear(); const q = indexedDB.deleteDatabase('zlatura'); q.onsuccess = res; q.onerror = res; q.onblocked = res; }));
await page.goto(`${BASE}#settings`, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#settings-data #backup-file', { state: 'attached' });
await page.setInputFiles('#backup-file', bfile);
await page.waitForSelector('dialog.action-sheet');
await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.locator('dialog.action-sheet .action-item', { hasText: 'Merge into this device' }).click()]);
check('after a wipe and a restore the abstracts are back, record for record', JSON.stringify(await abs()) === JSON.stringify(full));

/* ---------------------------------------------------- 60 abstracts: 150 ms a commit */
await page.evaluate(async (id) => {
  const m = await import('./app/store.js'); const x = await m.loadDeal(id);
  const base = x.abstracts.items[0];
  x.abstracts.items = Array.from({ length: 60 }, (_, i) => ({ ...structuredClone(base), id: `ab_${String(i).padStart(12, '0')}`, title: `Invented lease ${i}` }));
  await m.saveDeal(x);
}, dealId);
await page.evaluate((id) => localStorage.setItem('zlatura.deal.current', id), dealId);
await page.goto(`${BASE}#deal`, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ab-toggle');
if ((await page.getAttribute('#ab-toggle', 'aria-expanded')) === 'false') await page.click('#ab-toggle');
await page.locator('.ab-row').first().locator('button[aria-label^="Open "]').click();
await page.waitForSelector('.ab-editor');
await pause(300);
const ms = await page.evaluate(() => { const i = document.getElementById('abf-suite'); i.value = 'Suite 12'; const t = performance.now(); i.dispatchEvent(new Event('change', { bubbles: true })); return performance.now() - t; });
check('with 60 abstracts on the deal one commit takes under 150 ms', ms < 150, `${ms.toFixed(1)} ms`);
const ms2 = await page.evaluate(() => { const b = document.querySelector('[data-key="suite"] .ab-tick'); const t = performance.now(); b.click(); return performance.now() - t; });
check('and so does a tick', ms2 < 150, `${ms2.toFixed(1)} ms`);

/* ---------------------------------------------------- axe and size, at phone and desktop width */
async function axe(name, sel) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async (s) => {
    const r = await window.axe.run(document.querySelector(s), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }, sel);
  check(`axe: ${name}`, res.length === 0, res.join('\n    '));
}
await axe('the lease abstract editor, phone size', 'dialog.sheet[open]');
const small = await page.evaluate(() => [...document.querySelectorAll('.ab-editor button, .ab-editor input:not([type=checkbox]), .ab-editor select, .ab-editor summary, .ab-editor textarea')].filter((e) => { const q = e.getBoundingClientRect(); return q.width && q.height && !e.closest('[hidden]') && (q.height < 43.5) && e.offsetParent !== null; }).map((e) => `${e.tagName}#${e.id || e.textContent.slice(0, 20)} ${Math.round(e.getBoundingClientRect().height)}`));
check('every control in the editor is at least 44 px tall (phone size)', small.length === 0, small.slice(0, 6).join(', '));
const wide = await page.evaluate(() => { const e = document.querySelector('.ab-editor'); return e.scrollWidth - e.clientWidth; });
check('the editor does not scroll sideways at phone size', wide <= 1, `${wide}px`);
await page.setViewportSize({ width: 1440, height: 900 });
await pause(400);
await axe('the lease abstract editor, desktop size', 'dialog.sheet[open]');
await page.keyboard.press('Escape'); await pause(400);
await axe('the Lease abstracts card, desktop size', '#deal-abstracts');
await page.setViewportSize({ width: 390, height: 844 });
await pause(300);
await axe('the Lease abstracts card, phone size', '#deal-abstracts');

/* ---------------------------------------------------- a confidential deal makes no request */
await page.evaluate(async (id) => { const m = await import('./app/store.js'); const x = await m.loadDeal(id); x.confidential = true; await m.saveDeal(x); }, dealId);
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ab-toggle');
const seen = outside.length;
await page.locator('.ab-row').first().locator('button:has-text("Workbook")').click();
const cdl = await page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
check('a confidential deal’s workbook is named CONFIDENTIAL and is marked on its sheets', cdl && /^CONFIDENTIAL - /.test(cdl.suggestedFilename()));
if (cdl) { await cdl.saveAs(`${SHOTS}ab-conf.xlsx`); const z = fflate.unzipSync(new Uint8Array(fs.readFileSync(`${SHOTS}ab-conf.xlsx`))); check('and its first sheet prints CONFIDENTIAL in the header and footer', /CONFIDENTIAL/.test(new TextDecoder().decode(z['xl/worksheets/sheet1.xml']))); }
check('exporting made no request to any other site', outside.length === seen, outside.slice(seen).join(', '));
check('no request left this app at any point in the flow', outside.length === 0, outside.join(', '));

await browser.close();
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', errors);
