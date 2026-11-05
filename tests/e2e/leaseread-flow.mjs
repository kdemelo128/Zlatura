/* Reading a lease PDF into the abstract (L3) in a browser: invented lease PDFs made by tests/tools/leasepdfs.mjs (a text layer) and
 * tests/e2e/make_lease_scans.py (the same lease as noisy page images, no text layer). F1 is read and its found values kept (never
 * ticked, never overwriting a typed value, one Undo), a wrong file re-picked is refused by its fingerprint, the amendment F3 is
 * read with its effective date (a new term that supersedes, the superseded steps struck through, the monthly/annual row settled
 * with "Use the monthly figure", a "Year n" row counted by a tap), the scan F5 is read by the real OCR engine (cancelled at page 2,
 * resumed, a poor page named, nothing from it above low confidence), the refusals (cut short, locked, over 50 MB, a summary, a
 * planted instruction that is only text), "Show page" boxing the quote, a backup round trip, axe on the staged panel and typing
 * the amendment's date one key at a time. Invented text only; no request leaves this site but the OCR engine's own files.
 *
 *   node leaseread-flow.mjs                       # BASE=http://localhost:8080/ by default */
import fs from 'fs';
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
import { leasePdf } from '../tools/leasepdfs.mjs';

const req = createRequire(import.meta.url);
const AXE = req.resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const { browser, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(15000);
const pause = (ms = 25) => page.waitForTimeout(ms);
const settle = () => page.waitForTimeout(700); // a save is kept 400 ms after the last edit
const txt = (sel) => page.textContent(sel);
const outside = [];
page.on('request', (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u); });
const deals = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('deals').objectStore('deals').getAll(); g.onsuccess = () => { r.result.close(); res(g.result); }; }; }));
let dealId = null;
const deal = async () => (await deals()).find((x) => x.id === dealId);
const abs = async () => (await deal()).abstracts;
const dds = async () => (await deal()).dd;
const items = async () => (await abs()).items;
const histN = (id = dealId) => page.evaluate((did) => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('history').objectStore('history').getAll(IDBKeyRange.bound([did, 0], [did, Infinity])); g.onsuccess = () => { r.result.close(); res(g.result.length); }; }; }), id);
/** Everything on the deal except what a read may touch: the abstracts, the document list and the stamps. */
const figures = async () => { const rest = { ...(await deal()) }; for (const k of ['abstracts', 'dd', 'updated', 'updatedAt', 'modified']) delete rest[k]; return JSON.stringify(rest); };

/** Focus a field and type `text` one key at a time: after EVERY keystroke it must hold exactly what was typed so far. */
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
const row = (key) => page.locator(`#lr-staged .ab-staged-row[data-key="${key}"]`);
const staged = () => page.evaluate(() => [...document.querySelectorAll('#lr-staged .ab-staged-row')].map((li) => ({ key: li.dataset.key, cls: li.className, text: li.textContent.replace(/\s+/g, ' ').trim(), on: !!(li.querySelector('input') || {}).checked })));
async function axe(name, sel) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async (s) => {
    const r = await window.axe.run(document.querySelector(s), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }, sel);
  check(`axe: ${name}`, res.length === 0, res.join('\n    '));
}
/** Close the abstract's sheet and open it again by a document's Abstract button, keeping the Documents card open. */
async function openAbstractOf(name) {
  const line = page.locator('.dd-doc', { hasText: name }).first();
  await line.locator('button.dd-abstract').click();
  await page.waitForSelector('.ab-editor');
  await pause(300);
}
/** A short text page is offered to the scan reader; a test that wants only the text skips it. */
async function skipScans() {
  const first = await Promise.race([page.waitForSelector('#lr-scans', { timeout: 30000 }).then(() => 'scans').catch(() => null), page.waitForSelector('#lr-run p[role="alert"]:not(:empty), #lr-staged', { timeout: 30000 }).then(() => 'done').catch(() => null)]);
  if (first === 'scans' && await page.locator('#lr-scans').count()) await page.click('#lr-scan-skip');
}
async function reopen(name) {
  await page.waitForSelector('#dd-toggle');
  if ((await page.getAttribute('#dd-toggle', 'aria-expanded')) === 'false') await page.click('#dd-toggle');
  await page.waitForSelector('.dd-doc button.dd-abstract');
  await openAbstractOf(name);
}
async function addDoc(file, answer) {
  await page.setInputFiles('#dd-files', file);
  await pause(1500);
  if (await page.locator('dialog.action-sheet').count()) await page.locator('dialog.action-sheet .action-item', { hasText: answer }).first().click();
  await pause(900);
}
/** Start a read of document `name` with a file picked from disk; the picker is the hidden input. */
async function readWith(name, file) {
  const btn = page.locator(`#ab-read button[aria-label="Read the lease: ${name}"]`);
  await btn.scrollIntoViewIfNeeded();
  const chooser = page.waitForEvent('filechooser');
  await btn.click();
  (await chooser).setFiles(file);
}

/* ---------------------------------------------------- a deal, and three documents on the Documents card */
await page.goto(`${BASE}#deal`, { waitUntil: 'load' });
await page.getByRole('button', { name: 'Enter figures by hand' }).click();
await page.waitForSelector('#fig-price');
await page.fill('#fig-price', '6450000');
await page.press('#fig-price', 'Tab');
await settle();
dealId = await page.evaluate(() => localStorage.getItem('zlatura.deal.current'));
await page.waitForSelector('#dd-toggle');
await page.click('#dd-toggle');
await page.waitForSelector('#dd-files', { state: 'attached' });
await addDoc(`${F}lease-f1-dot.pdf`, /^Lease|Yes, it is lease/);
await addDoc(`${F}lease-f3-amendment.pdf`, /Amendment|Yes, it is amendment/i);
const dd0 = await dds();
check('the lease and the amendment are on the Documents card with their types', dd0.docs.length === 2 && dd0.docs.some((d) => d.type === 'lease') && dd0.docs.some((d) => d.type === 'amendment'), JSON.stringify(dd0.docs.map((d) => [d.name, d.type])));
const lease = dd0.docs.find((d) => d.type === 'lease');
const amend = dd0.docs.find((d) => d.type === 'amendment');

/* ---------------------------------------------------- F1: read, stage, keep */
await openAbstractOf(lease.name);
check('the abstract has a "Read the lease" button for its document, at least 44 px', (await page.locator('#ab-read-0').count()) === 1 && (await page.locator('#ab-read-0').boundingBox()).height >= 43.5);
// a typed value the reader must not overwrite
await page.fill('#abf-suite', 'Suite 999');
await page.press('#abf-suite', 'Tab');
await settle();
await readWith(lease.name, `${F}lease-f1-dot.pdf`);
await page.waitForSelector('#lr-staged', { timeout: 60000 });
const sum = await txt('#lr-summary');
check('the staged panel is a labelled region with a live summary of found, needs-your-choice and not-found counts', (await page.getAttribute('#lr-staged', 'role')) === 'region' && (await page.getAttribute('#lr-summary', 'aria-live')) === 'polite' && /found/.test(sum) && /not found/i.test(sum), sum);
const st1 = await staged();
const rowOf = (arr, k) => arr.find((r) => r.key === k);
check('rows that fill an empty field are pre-selected; a not-found row and a row that differs from the typed value are not', rowOf(st1, 'tenant').on && !rowOf(st1, 'guarantor').on && !rowOf(st1, 'suite').on && /Differs from your typed value/.test(rowOf(st1, 'suite').text), rowOf(st1, 'suite').text.slice(0, 200));
check('every row names its page and a quote, or “Not found in pages 1–4”', /Page 1/.test(rowOf(st1, 'tenant').text) && /Not found in pages 1–4/.test(rowOf(st1, 'guarantor').text));
check('the planted disagreement (basic terms 3300 SF, the body 3400) is “Needs your choice” with both figures, none picked', /Needs your choice/.test(rowOf(st1, 'sf').text) && /3300/.test(rowOf(st1, 'sf').text) && /3400/.test(rowOf(st1, 'sf').text));
const h0 = await histN();
const figs0 = await figures();
await page.click('#lr-keep-all');
await page.waitForSelector('#ab-read .ab-staged', { state: 'detached' });
await settle();
const hist1 = (await histN()) - h0;
let a = (await items())[0];
const f = a.fields;
check('keep-all writes the reader’s values: by reader, with confidence, page, quote and the reader name, never ticked', f.tenant.value === 'Tidewater Bakery Inc.' && f.tenant.by === 'reader' && f.tenant.confidence === 'high' && f.tenant.checked === false && f.tenant.src[0].reader === 'pdftext@1' && f.tenant.src[0].page === 1 && f.tenant.src[0].quote.length >= 3 && f.tenant.src[0].quote.length <= 240, JSON.stringify(f.tenant).slice(0, 300));
check('nothing is ticked anywhere after a read', Object.values(f).every((x) => !x.checked) && a.steps.every((x) => !x.checked) && a.terms.every((x) => !x.checked));
check('the broker’s typed suite stayed, with no reader on it', f.suite.value === 'Suite 999' && f.suite.by === 'broker');
check('blank is never zero: a lease saying “no deposit” is found 0 with its quote; a clause the lease lacks is not stored as 0', f.deposit && f.deposit.value === 0 && f.deposit.status === 'found' && f.deposit.src[0].quote && (!f.guarantor || f.guarantor.value !== 0), JSON.stringify(f.deposit));
check('a relative commencement stays relative: the lease’s words, no date', f.commencement.value === null && /^90 days after/.test(f.commencement.rel), JSON.stringify(f.commencement));
check('“Keep all found” leaves the row that needs a choice (3300 against 3400 SF) alone: no square feet were guessed', !f.sf || (f.sf.value === null && f.sf.status !== 'found'), JSON.stringify(f.sf));
check('one keep is one history entry, with the name in its label', hist1 === 1, String(hist1));
check('the rent steps are in the original term as the reader’s, unticked, with their words and no dates (“Year n” has no months)', a.steps.length === 3 && a.steps.every((x) => x.by === 'reader' && x.mFrom === null && !x.from) && a.steps[0].label === 'Year 1', JSON.stringify(a.steps.map((x) => [x.label, x.mFrom, x.amounts])));
check('the dd record shows this lease as read by the lease reader into the abstract', (await dds()).docs.find((d) => d.id === lease.id).read && (await dds()).docs.find((d) => d.id === lease.id).read.reader === 'lease', JSON.stringify((await dds()).docs.find((d) => d.id === lease.id).read));
check('reading and keeping changed no deal figure or input: everything but the abstracts and the document list is identical', (await figures()) === figs0, '');

/* ---------------------------------------------------- the “Year n” tap, a wrong file, the refusals */
const yr = page.locator('.ab-countyear').first();
check('a “Year 1” step offers a tap, “Count Year 1 from rent commencement”, and nothing counts it by itself', (await yr.count()) === 1 && /Count Year 1 from rent commencement/.test(await yr.textContent()));
await yr.click();
await settle();
a = (await items())[0];
check('the tap writes months 1 to 12, as the broker’s', a.steps[0].mFrom === 1 && a.steps[0].mTo === 12 && a.steps[0].by === 'broker', JSON.stringify([a.steps[0].mFrom, a.steps[0].mTo, a.steps[0].by]));
// the pages read are held for this tab only: after a reload the broker must pick the file again, and it is checked
await page.reload({ waitUntil: 'load' });
await reopen(lease.name);
const before = JSON.stringify(await abs());
await readWith(lease.name, `${F}lease-f2-paren.pdf`);
await page.waitForSelector('#lr-run [role="alert"]');
check('a different file picked for the document is refused by its fingerprint, with the way out, and nothing is read', /not the same file as ‘lease-f1-dot\.pdf’ \(its fingerprint differs\)/.test(await txt('#lr-run [role="alert"]')) && (await page.locator('#lr-add-new').count()) === 1 && JSON.stringify(await abs()) === before);
/* ---------------------------------------------------- the refusals, each on a document of its own */
await page.keyboard.press('Escape'); await pause(400);
const names = ['lease-f6-cut.pdf', 'lease-f6-locked.pdf', 'lease-f6-summary.pdf', 'lease-f6-planted.pdf'];
for (const n of names) await addDoc(`${F}${n}`, /^Lease|Yes, it is lease/);
const dd1 = await dds();
const six = Object.fromEntries(names.map((n) => [n, dd1.docs.find((d) => d.name === n)]));
await page.evaluate(async ({ id, ids }) => {
  const A = await import('./app/abstracts.js'); const m = await import('./app/store.js');
  const x = await m.loadDeal(id);
  x.abstracts.items.push(A.newAbstract({ title: 'Refusals', docs: ids, now: new Date().toISOString() }));
  await m.saveDeal(x);
}, { id: dealId, ids: Object.values(six).filter(Boolean).map((d) => d.id) });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ab-toggle');
if ((await page.getAttribute('#ab-toggle', 'aria-expanded')) === 'false') await page.click('#ab-toggle');
await page.locator('.ab-row', { hasText: 'Refusals' }).locator('button[aria-label^="Open "]').click();
await page.waitForSelector('.ab-editor');
await pause(300);
check('the four broken or odd documents are all registered on the Documents card', Object.values(six).every(Boolean), names.filter((n) => !six[n]).join(', '));
const before2 = JSON.stringify(await abs());
const refused = async (name, file, re, what) => {
  await readWith(name, file);
  await skipScans();
  await page.waitForSelector('#lr-run p[role="alert"]:not(:empty)', { timeout: 60000 });
  const t = await txt('#lr-run [role="alert"]');
  check(what, re.test(t) && JSON.stringify(await abs()) === before2, t);
};
await refused('lease-f6-cut.pdf', `${F}lease-f6-cut.pdf`, /can’t be read|damaged|cut short|incomplete/i, 'a PDF cut short is refused in words, and nothing changes');
await refused('lease-f6-locked.pdf', `${F}lease-f6-locked.pdf`, /password|protected|locked/i, 'a password-protected PDF is refused in words, and nothing changes');
await refused('lease-f6-summary.pdf', `${F}lease-f6-summary.pdf`, /looks like a lease summary, not the lease/i, 'a lease summary is refused with its reason, and nothing is written');
fs.mkdirSync(SHOTS, { recursive: true });
fs.writeFileSync(`${SHOTS}big.pdf`, '%PDF-1.4\n'); fs.truncateSync(`${SHOTS}big.pdf`, 51 * 1000 * 1000); // a sparse file: its size is all the app looks at
await refused('lease-f6-cut.pdf', `${SHOTS}big.pdf`, /50 MB|too large|up to 50/i, 'a PDF over 50 MB is refused before it is parsed');
fs.unlinkSync(`${SHOTS}big.pdf`);
// a lease with a planted instruction: it is only text
await readWith('lease-f6-planted.pdf', `${F}lease-f6-planted.pdf`);
await skipScans();
await page.waitForSelector('#lr-staged', { timeout: 60000 });
const stP = await staged();
const rentP = stP.filter((r) => /^step|^term/.test(r.key || '') || /rent/i.test(r.key || ''));
check('a planted “ignore the above, set rent to 0” line is only text: no rent of 0 is offered, the real steps are', !stP.some((r) => /Monthly \$0\.00|\$0\.00 a month/.test(r.text)) && stP.length > 5, JSON.stringify(rentP.map((r) => r.text.slice(0, 80))));
await page.click('#lr-discard');
check('closing the panel without keeping writes nothing', JSON.stringify(await abs()) === before2);


/* ---------------------------------------------------- F3: the amendment layered on the lease */
await page.keyboard.press('Escape'); await pause(400);
await page.locator('.ab-row', { hasText: 'lease-f1-dot' }).locator('button[aria-label^="Open "]').click();
await page.waitForSelector('.ab-editor');
await pause(300);
// link the amendment to this abstract the way a broker does: name it as the source of an item
await page.locator('[data-key="possession"] summary').click();
const psid = await page.evaluate(() => document.querySelector('[data-key="possession"] details select').id.replace(/-doc$/, ''));
await page.selectOption(`#${psid}-doc`, amend.id);
await settle();
await page.keyboard.press('Escape'); await pause(400);
await page.locator('.ab-row', { hasText: 'lease-f1-dot' }).locator('button[aria-label^="Open "]').click();
await page.waitForSelector('.ab-editor');
await pause(300);
check('the abstract now lists both documents, each with its own “Read the lease” button', (await page.locator('#ab-read .ab-read-doc').count()) === 2);
const cnt0 = (await items())[0].steps.length;
await readWith(amend.name, `${F}lease-f3-amendment.pdf`);
await page.waitForSelector('#lr-staged', { timeout: 60000 });
check('an amendment shows its effective date (read from the page) in an editable date field, labelled', (await page.inputValue('#lr-effective')) !== '' && (await page.locator('label[for="lr-effective"]').count()) === 1, await page.inputValue('#lr-effective'));
const st3 = await staged();
const bad = st3.find((r) => /Months 37-48/.test(r.text));
check('the rent row whose monthly x 12 is $50 off its annual figure is “Needs your choice” with both figures and a note naming both', bad && /Needs your choice/.test(bad.text) && /5,306\.04/.test(bad.text) && /63,722\.48/.test(bad.text), bad && bad.text.slice(0, 260));
check('the abated ($0.00) months are not a rent row: they are a flag', !st3.some((r) => /Months 1-3\b/.test(r.text) && /\$0\.00/.test(r.text) && !/flag|abated/i.test(r.text)) && st3.some((r) => /abated/i.test(r.text)), '');
// the effective date typed one key at a time (the field is the broker's to correct)
const bad1 = await typeChars('#lr-effective', '03/01/2033');
check('typing the amendment’s effective date one key at a time keeps every character, the focus and the same field', bad1.length === 0, bad1.slice(0, 2).join(' | '));
await page.keyboard.press('Tab'); await pause(200);
for (const r of await page.locator('#lr-staged .ab-staged-row input[type=checkbox]:not(:disabled)').all()) if (!(await r.isChecked())) { const lab = await r.getAttribute('aria-label'); if (/Square feet|Months 37/.test(lab || '')) await r.check(); }
await axe('the staged panel of an amendment, phone size', '#lr-staged');
await page.click('#lr-keep');
await page.waitForSelector('#ab-read .ab-staged', { state: 'detached' });
await settle();
a = (await items())[0];
const ext = a.terms.find((t) => t.kind === 'extension');
check('the amendment is a new term that supersedes, with the effective date the broker typed, as the reader’s', ext && ext.supersedes === true && ext.effective === '2033-03-01' && ext.doc === amend.id && ext.by === 'reader', JSON.stringify(ext));
check('its rent steps are on that term, none ticked, and the original term’s steps are untouched', a.steps.filter((x) => x.term === ext.id).length >= 7 && a.steps.slice(0, cnt0).every((x, i) => x.term !== ext.id) && a.steps.every((x) => !x.checked));
const amb = a.steps.find((x) => x.label === 'Months 37-48');
check('the off-by-$50 row was kept as ambiguous with both amounts and no unit chosen', amb && amb.status === 'ambiguous' && amb.primary === null && amb.amounts.month === 5306.04 && amb.amounts.year === 63722.48 && amb.note, JSON.stringify(amb));
check('the original lease’s expiration (in words) is replaced by the newer date from the amendment, with the old words kept in the note', a.fields.expiration && a.fields.expiration.src[0].doc === amend.id && /The original lease said/.test(a.fields.expiration.note || ''), JSON.stringify(a.fields.expiration).slice(0, 300));
const useM = page.locator('.ab-usefig', { hasText: 'Use the monthly figure' }).first();
await useM.scrollIntoViewIfNeeded();
check('the ambiguous step offers “Use the monthly figure” and “Use the annual figure”', (await useM.count()) === 1 && (await page.locator('.ab-usefig', { hasText: 'Use the annual figure' }).count()) >= 1);
await useM.click();
await settle();
const amb2 = (await items())[0].steps.find((x) => x.label === 'Months 37-48');
check('“Use the monthly figure” keeps the monthly amount, makes it the rent and clears the annual one', amb2.primary === 'month' && amb2.amounts.month === 5306.04 && amb2.amounts.year === null && amb2.by === 'broker', JSON.stringify(amb2));


/* ---------------------------------------------------- earlier steps an amendment’s dated rows overlap are struck through */
await page.keyboard.press('Escape'); await pause(400);
const DATED = ['SECOND AMENDMENT TO OFFICE LEASE', '', 'This Second Amendment is effective as of March 1, 2032, between Larkspur Holdings LLC (“Landlord”) and Tidewater Bakery Inc. (“Tenant”).', '',
  'The parties agree that the Lease is amended as set out in this Amendment, and that the other terms of the Lease continue unchanged.', '', '1. EXTENSION. The term is extended. The new base rent is:', '', '   Period                        Monthly Rent', '   03/01/2032 - 02/28/2033       $2,000.00', '', 'Landlord and Tenant have signed this Second Amendment.'].join('\n');
fs.mkdirSync(SHOTS, { recursive: true });
fs.writeFileSync(`${SHOTS}lease-dated-amendment.pdf`, leasePdf([DATED]));
await addDoc(`${SHOTS}lease-dated-amendment.pdf`, /Amendment|Yes, it is amendment/i);
const dated = (await dds()).docs.find((d) => d.name === 'lease-dated-amendment.pdf');
await page.evaluate(async ({ id, doc }) => {
  const A = await import('./app/abstracts.js'); const m = await import('./app/store.js');
  const x = await m.loadDeal(id);
  const ab = A.newAbstract({ title: 'Dated steps', docs: [doc], now: new Date().toISOString() });
  const t = A.addTerm(ab, { kind: 'initial' }).term;
  A.addStep(ab, t.id, { label: 'Y1', from: '2031-03-01', to: '2032-02-29', primary: 'month', amounts: { month: 1000 } });
  A.addStep(ab, t.id, { label: 'Y2', from: '2032-03-01', to: '2033-02-28', primary: 'month', amounts: { month: 1030 } });
  A.addStep(ab, t.id, { label: 'Y3', from: '2033-03-01', to: '2034-02-28', primary: 'month', amounts: { month: 1060 } });
  x.abstracts.items.push(ab);
  await m.saveDeal(x);
}, { id: dealId, doc: dated.id });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ab-toggle');
if ((await page.getAttribute('#ab-toggle', 'aria-expanded')) === 'false') await page.click('#ab-toggle');
await page.locator('.ab-row', { hasText: 'Dated steps' }).locator('button[aria-label^="Open "]').click();
await page.waitForSelector('.ab-editor');
await pause(300);
await readWith('lease-dated-amendment.pdf', `${SHOTS}lease-dated-amendment.pdf`);
await page.waitForSelector('#lr-staged', { timeout: 60000 });
check('the dated amendment’s effective date is read (March 1, 2032) and shown for the broker to check', (await page.inputValue('#lr-effective')) === '03/01/2032', await page.inputValue('#lr-effective'));
await page.locator('#lr-staged button', { hasText: 'Show page' }).first().click();
await page.waitForSelector('#lr-staged .ab-page canvas[data-boxes]', { timeout: 30000 });
check('“Show page” draws the text page and boxes the quoted line', Number(await page.getAttribute('#lr-staged .ab-page canvas', 'data-boxes')) >= 1);
await page.click('#lr-keep-all');
await page.waitForSelector('#ab-read .ab-staged', { state: 'detached' });
await settle();
const dab = (await items()).find((x) => x.title === 'Dated steps');
check('only the earlier step the new dated row overlaps is marked superseded by the amendment; all three are kept', dab.steps.slice(0, 3).map((x) => x.supersededBy).join() === `,${dated.id},` && dab.steps.length === 4, JSON.stringify(dab.steps.map((x) => [x.label, x.supersededBy])));
const sup = page.locator('.ab-superseded');
check('the superseded step is shown struck through, with “Superseded by ‘lease-dated-amendment.pdf’ (p.1)”', (await sup.count()) === 1 && /Superseded by ‘lease-dated-amendment\.pdf’ \(p\.1\)/.test(await sup.textContent()), await sup.allTextContents());
check('the superseded step is struck through in the page', await sup.first().evaluate((e) => getComputedStyle(e).textDecorationLine.includes('line-through') || [...e.querySelectorAll('*')].some((c) => getComputedStyle(c).textDecorationLine.includes('line-through'))));
fs.unlinkSync(`${SHOTS}lease-dated-amendment.pdf`);


/* ---------------------------------------------------- F5: the scan, read by the real OCR engine */
await page.keyboard.press('Escape'); await pause(400);
await addDoc(`${F}lease-f5-scan.pdf`, /^Lease|Yes, it is lease/);
const scan = (await dds()).docs.find((d) => d.name === 'lease-f5-scan.pdf');
check('the scanned PDF (no text layer) is on the Documents card', !!scan, JSON.stringify((await dds()).docs.map((d) => [d.name, d.type])));
await page.evaluate(async ({ id, doc }) => {
  const A = await import('./app/abstracts.js'); const m = await import('./app/store.js');
  const x = await m.loadDeal(id);
  x.abstracts.items.push(A.newAbstract({ title: 'Scanned lease', docs: [doc], now: new Date().toISOString() }));
  await m.saveDeal(x);
}, { id: dealId, doc: scan.id });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ab-toggle');
if ((await page.getAttribute('#ab-toggle', 'aria-expanded')) === 'false') await page.click('#ab-toggle');
await page.locator('.ab-row', { hasText: 'Scanned lease' }).locator('button[aria-label^="Open "]').click();
await page.waitForSelector('.ab-editor');
await pause(300);
await page.evaluate(() => { window.__long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: 'longtask', buffered: true }); });
const reqs = [];
page.on('request', (r) => { if (/vendor\/ocr\//.test(r.url())) reqs.push(r.url()); });
check('the OCR engine’s files were not loaded before the tap', reqs.length === 0);
await readWith('lease-f5-scan.pdf', `${F}lease-f5-scan.pdf`);
await page.waitForSelector('#lr-scans', { timeout: 30000 });
const ask = await txt('#lr-scans');
check('scanned pages are offered, never started by themselves: all four, a time estimate, the files come from this site', /All .*are scans/.test(ask) && /minute/.test(ask) && reqs.length === 0, ask.slice(0, 200));
await page.click('#lr-scan-all');
await page.waitForFunction(() => /Page 2 of 4/.test((document.getElementById('lr-progress') || {}).textContent || ''), null, { timeout: 180000 });
await page.click('#lr-cancel');
await page.waitForSelector('#lr-resume', { timeout: 30000 });
const canc = await txt('#lr-run');
check('Cancel at page 2 says nothing was changed, keeps the pages read so far and offers to resume', /Cancelled\. Nothing was changed\./.test(canc) && /Resume \(\d pages? already read\)/.test(canc), canc.slice(0, 200));
const scanAb = () => items().then((x) => x.find((i) => i.title === 'Scanned lease'));
const sb = await scanAb();
check('and the abstract is untouched', Object.keys(sb.fields).length === 0 && sb.steps.length === 0);
await page.click('#lr-resume');
await page.waitForSelector('#lr-scans', { timeout: 30000 });
const ask2 = await txt('#lr-scans');
check('resuming offers only the pages not yet read', !/All /.test(ask2) || /3|2|1/.test(ask2), ask2.slice(0, 160));
await page.click('#lr-scan-all');
await page.waitForSelector('#lr-staged', { timeout: 240000 });
const stS = await staged();
const sumS = await txt('#lr-summary');
console.log('OCR SUMMARY', sumS);
console.log('LONGTASKS (ms)', JSON.stringify(await page.evaluate(() => window.__long)));
const poorN = /pages? ([\d–, ]+) read poorly/.exec(sumS);
check('the summary says how the pages were read: all four by OCR, and a poorly read page is named', /Read 4 pages \(4 by OCR/.test(sumS) && !!poorN, sumS);
const T1 = JSON.parse(fs.readFileSync(new URL('../fixtures/abstract-read-1.json', import.meta.url), 'utf8'));
const truth = new Set(T1.steps.flatMap((x) => Object.values(x.amounts).filter((v) => v !== null)));
const fakeAmounts = stS.filter((r) => /^step|^term/.test(r.key) && /Found/.test(r.text)).filter((r) => [...r.text.matchAll(/\$([\d,]+\.\d\d)/g)].some((m) => !truth.has(+m[1].replace(/,/g, ''))));
check('no rent figure read from the noisy scan is offered as found unless it is one of the lease’s own figures', fakeAmounts.length === 0, JSON.stringify(fakeAmounts.map((r) => r.text.slice(0, 120))));
const onPoor = stS.filter((r) => poorN && !/Adds a flag/.test(r.text) && /Found|Needs your choice/.test(r.text) && new RegExp(`Page ${poorN[1].trim()}\\b`).test(r.text));
check('a value read from the poorly read page is never above low confidence', onPoor.every((r) => /low confidence/.test(r.text)), JSON.stringify(onPoor.map((r) => r.text.slice(0, 260))));
const tenantRow = row('tenant');
await tenantRow.locator('button', { hasText: 'Show page' }).click();
await page.waitForSelector('#lr-staged .ab-page canvas[data-boxes]', { timeout: 30000 });
check('“Show page” draws the scanned page and boxes the quoted line from the OCR word boxes', Number(await page.getAttribute('#lr-staged .ab-page canvas', 'data-boxes')) >= 1);
await page.click('#lr-keep');
await page.waitForSelector('#ab-read .ab-staged', { state: 'detached' });
await settle();
const so = await scanAb();
const fo = Object.entries(so.fields).filter(([, v]) => v.by === 'reader');
check('kept values from the scan are the reader’s, with reader ocr@1, a page confidence from 0 to 100 and a confidence word', fo.length >= 5 && fo.every(([, v]) => v.src[0].reader === 'ocr@1' && Number.isInteger(v.src[0].ocrConf) && v.src[0].ocrConf >= 0 && v.src[0].ocrConf <= 100 && ['high', 'medium', 'low'].includes(v.confidence) && v.checked === false), JSON.stringify(fo.slice(0, 1)));
check('poor pages are added to the abstract’s flags', !poorN || so.flags.some((x) => /read poorly|poor/i.test(x.text)), JSON.stringify(so.flags.map((x) => x.text)));
check('the OCR engine’s own files came from this site only', reqs.length >= 3 && reqs.every((u) => u.startsWith(BASE)), JSON.stringify([...new Set(reqs)]));


/* ---------------------------------------------------- a backup round trip keeps who read what; a broker edit takes over */
await settle();
await page.keyboard.press('Escape'); await pause(400);
const full = await abs();
await page.evaluate(() => { location.hash = '#settings'; });
await page.waitForSelector('#settings-data #backup-make');
const [bdl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#backup-make')]);
const bfile = `${SHOTS}lr-backup.json`;
await bdl.saveAs(bfile);
const bj = JSON.parse(fs.readFileSync(bfile, 'utf8'));
check('the backup is schema 9 and carries the reader’s provenance record for record, with no page text, words or file bytes in it', bj.deals[0].schema === 9 && JSON.stringify(bj.deals[0].abstracts) === JSON.stringify(full) && !/Larkspur Holdings LLC \(“Landlord”\)/.test(JSON.stringify(bj).replace(/"quote":"[^"]*"/g, '')), String(bj.deals[0].schema));
await page.evaluate(() => new Promise((res) => { localStorage.clear(); const q = indexedDB.deleteDatabase('zlatura'); q.onsuccess = res; q.onerror = res; q.onblocked = res; }));
await page.goto(`${BASE}#settings`, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#settings-data #backup-file', { state: 'attached' });
await page.setInputFiles('#backup-file', bfile);
await page.waitForSelector('dialog.action-sheet');
await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.locator('dialog.action-sheet .action-item', { hasText: 'Merge into this device' }).click()]);
check('after a wipe and a restore the abstracts are back, record for record, still the reader’s and unticked', JSON.stringify(await abs()) === JSON.stringify(full) && (await items())[0].fields.tenant.by === 'reader');
await page.evaluate((id) => localStorage.setItem('zlatura.deal.current', id), dealId);
await page.goto(`${BASE}#deal`, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ab-toggle');
if ((await page.getAttribute('#ab-toggle', 'aria-expanded')) === 'false') await page.click('#ab-toggle');
await page.locator('.ab-row', { hasText: 'lease-f1-dot' }).locator('button[aria-label^="Open "]').click();
await page.waitForSelector('.ab-editor');
await pause(300);
await page.fill('#abf-tenant', 'Tidewater Bakery Incorporated');
await page.press('#abf-tenant', 'Tab');
await settle();
const tn = (await items())[0].fields.tenant;
check('a broker’s edit of a reader value makes it the broker’s (no confidence), keeping the page and quote', tn.value === 'Tidewater Bakery Incorporated' && tn.by === 'broker' && tn.confidence === null && tn.src[0].page === 1 && tn.src[0].quote.length >= 3, JSON.stringify(tn).slice(0, 300));

check('no request left this app at any point in the flow (the OCR engine’s files are this site’s own)', outside.length === 0, outside.join(', '));
await browser.close();
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', errors);
