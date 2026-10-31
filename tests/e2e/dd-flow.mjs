/* The due-diligence document registry (deal.dd) and the Documents card, in a browser: collapsed by default, the
 * property-type question (never defaulted to Retail), the checklist, an invented rent roll PDF and T-12 CSV found
 * by the readers that already exist (typeBy "reader"), the same file twice, a type scored from the text (typeBy
 * "content") and one asked about (the file name only suggests), "not applicable" with a reason typed one key at
 * a time and Undo, a record removed and restored, the readers marking a file read (and the figures pointing back),
 * a drop on the card (not an OM, not a CoStar report), hostile file names as text, 200 documents (the 201st
 * refused, 150 ms an edit), a confidential deal's AI button off with its reason and no request, the backup and its
 * restore with no document bytes in either, and axe at phone and desktop size. Invented files only.
 *
 *   node dd-flow.mjs                              # BASE=http://localhost:8080/ by default
 *   OLD_BASE=http://localhost:8081/ node dd-flow.mjs   # also: an older app (4.7.74), served there, refuses this version's backup */
import fs from 'fs';
import crypto from 'crypto';
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const AI = 'http://127.0.0.1:9';
const { browser, ctx, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(8000);
const pause = (ms = 25) => page.waitForTimeout(ms);
const settle = () => page.waitForTimeout(700); // a save is kept 400 ms after the last edit
const txt = (sel) => page.textContent(sel);
const aiSeen = [];
await page.route(`${AI}/**`, async (route) => { aiSeen.push(route.request().url()); return route.abort(); });
const deals = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('deals').objectStore('deals').getAll(); g.onsuccess = () => { r.result.close(); res(g.result); }; }; }));
let dealId = null;
const dd = async () => (await deals()).find((x) => x.id === dealId).dd;
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const mem = (name, text, mimeType = 'text/plain') => ({ name, mimeType, buffer: Buffer.from(text) });
const openCard = async () => { await page.waitForSelector('#dd-toggle'); if ((await page.getAttribute('#dd-toggle', 'aria-expanded')) === 'false') await page.click('#dd-toggle'); await page.waitForSelector('#dd-preset'); };
const addFiles = async (files) => { await page.setInputFiles('#dd-files', files); await page.waitForTimeout(900); };

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

/* ---------------------------------------------------------- a deal by hand */
await page.goto(`${BASE}#deal`, { waitUntil: 'load' });
await page.getByRole('button', { name: 'Enter figures by hand' }).click();
await page.waitForSelector('#fig-price');
await page.fill('#fig-price', '6450000');
await page.press('#fig-price', 'Tab');
await settle();
await page.waitForTimeout(1200);
await page.waitForSelector('#dd-toggle');
dealId = await page.evaluate(() => localStorage.getItem('zlatura.deal.current'));

let d0 = (await deals())[0];
check('a new deal has an empty document list at schema 8, written by the app, not made up', d0.schema === 8 && JSON.stringify(d0.dd) === JSON.stringify({ v: 1, preset: null, na: {}, docs: [] }), JSON.stringify(d0.dd));
const histN = (id = dealId) => page.evaluate((did) => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('history').objectStore('history').getAll(IDBKeyRange.bound([did, 0], [did, Infinity])); g.onsuccess = () => { r.result.close(); res(g.result.length); }; }; }), id);
// a deal saved before the list existed (schema 6, no dd) is opened: the silent step adds no History entry
await page.evaluate(async (id) => { const m = await import('./app/store.js'); const x = await m.loadDeal(id); delete x.dd; x.schema = 6; await m.saveDeal(x); }, dealId);
await settle();
const h0 = await histN();
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#dd-toggle');
await settle();
await page.waitForTimeout(800);
check('opening a deal saved before the document list adds nothing to its History, and the list is made', (await histN()) === h0 && (await dd()) && (await deals()).find((x) => x.id === dealId).schema === 8, `${h0} → ${await histN()}`);
check('the Documents card is collapsed by default, and its heading is a button that says so', (await page.getAttribute('#dd-toggle', 'aria-expanded')) === 'false' && (await page.locator('#dd-body').isHidden()) && (await txt('#dd-toggle')) === 'Documents');
await page.click('#dd-toggle');
await page.waitForSelector('#dd-preset');
check('open: a property type that is blank is asked about, not defaulted to Retail', (await page.inputValue('#dd-preset')) === '' && /What kind of property is this\?/.test(await txt('#deal-dd')) && (await page.locator('#dd-h-missing').count()) === 0);
check('the card remembers it is open after a reload (on this device only)', await (async () => { await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#dd-preset'); return true; })());
await page.selectOption('#dd-preset', 'retail');
await settle();
check('choosing Retail is stored on the deal and the heading counts the required documents', (await dd()).preset === 'retail' && (await txt('#dd-toggle')) === 'Documents · 0 of 13 required', await txt('#dd-toggle'));
check('Missing lists the rent roll and the T-12 with a 44 px "Not applicable…" each', /Missing \(13\)/.test(await txt('#dd-h-missing')) && (await page.locator('#dd-h-missing + ul button[aria-label^="Not applicable"]').count()) === 13);

/* --------------------------------------------- the readers decide: PDF, CSV */
await addFiles(F + 'rr-dd.pdf');
let s = await dd();
const rr = s.docs.find((x) => x.name === 'rr-dd.pdf');
check('a rent roll PDF is found by the rent roll reader: type rentroll, typeBy reader, its SHA-256, size and pages, no bytes', rr && rr.type === 'rentroll' && rr.typeBy === 'reader' && rr.sha256 === sha(F + 'rr-dd.pdf') && rr.size === fs.statSync(F + 'rr-dd.pdf').size && rr.pages >= 1 && rr.status === 'received' && rr.read === null && rr.asOf === null, JSON.stringify(rr));
check('a Doc has only the fields of the record: nothing holds file content', rr && JSON.stringify(Object.keys(rr).sort()) === JSON.stringify(['addedAt', 'asOf', 'id', 'kind', 'name', 'note', 'pages', 'read', 'sha256', 'size', 'status', 'supersededBy', 'type', 'typeBy']) && JSON.stringify(rr).length < 700 && /^dd_[0-9a-z]{12}$/.test(rr.id));
await addFiles(F + 'invented-gardens.csv');
s = await dd();
const t12 = s.docs.find((x) => x.name === 'invented-gardens.csv');
check('a T-12 CSV is found by the T-12 reader: type t12, typeBy reader, kind csv', t12 && t12.type === 't12' && t12.typeBy === 'reader' && t12.kind === 'csv' && t12.sha256 === sha(F + 'invented-gardens.csv'), JSON.stringify(t12));
check('two found: the heading counts both and the lists follow', (await txt('#dd-toggle')) === 'Documents · 2 of 13 required' && /Found \(2\)/.test(await txt('#dd-h-found')) && /Missing \(11\)/.test(await txt('#dd-h-missing')), await txt('#dd-toggle'));
await addFiles(F + 'rr-dd.pdf');
check('the same file twice is not added again, and the card says when it was added', (await dd()).docs.length === 2 && /already added on \d{4}-\d{2}-\d{2}/.test(await txt('#dd-status') + await txt('#dd-alert')), await txt('#dd-status') + await txt('#dd-alert'));

/* ------------------------------ other types: scored from the text, or asked */
await addFiles(mem('estoppel-title.txt', 'SUBORDINATION, NON-DISTURBANCE AND ATTORNMENT AGREEMENT\nThe Lender agrees that the Tenant shall attorn to the Lender.\n'));
await page.waitForSelector('dialog.action-sheet');
check('text that clearly reads as an SNDA, in a file named for an estoppel and a title, says "looks like" and waits for a tap: nothing is typed by itself', /estoppel-title\.txt looks like snda\. Is that right\?/.test(await txt('dialog.action-sheet .action-title')) && (await dd()).docs.length === 2);
await page.locator('dialog.action-sheet .action-item', { hasText: 'Yes, it is snda' }).click();
await pause(900);
s = await dd();
const snda = s.docs.find((x) => x.name === 'estoppel-title.txt');
check('after the tap it is typed snda, typeBy broker (the file name did not decide it)', snda && snda.type === 'snda' && snda.typeBy === 'broker', JSON.stringify(snda));
await addFiles(mem('survey.txt', 'see you tomorrow at noon'));
await page.waitForSelector('dialog.action-sheet');
const items = await page.locator('dialog.action-sheet .action-item .action-label').allInnerTexts();
check('text that does not say what it is asks "What is this?"; the file name only puts its suggestion first', /What is survey\.txt\?/.test(await txt('dialog.action-sheet .action-title')) && items[0] === 'Survey' && items.includes('Add it with no type') && (await dd()).docs.length === 3, items.slice(0, 3).join(' | '));
await page.locator('dialog.action-sheet .action-cancel').click();
await pause(400);
check('cancelling the question adds nothing: a name is never enough', (await dd()).docs.length === 3 && !(await dd()).docs.some((x) => x.name === 'survey.txt'));
await addFiles(mem('survey.txt', 'see you tomorrow at noon'));
await page.waitForSelector('dialog.action-sheet');
await page.locator('dialog.action-sheet .action-item', { hasText: 'Add it with no type' }).click();
await pause(900);
const nt = (await dd()).docs.find((x) => x.name === 'survey.txt');
check('"Add it with no type" keeps it as received with type null, never "other"', nt && nt.type === null && nt.typeBy === null && /Needs a type/.test(await txt('#dd-h-found + ul')) && /Missing \(10\)/.test(await txt('#dd-h-missing')), JSON.stringify(nt));
// the broker sets it: typeBy broker
await page.locator('button[aria-label="Actions for survey.txt"]').click();
await page.locator('dialog.action-sheet .action-item', { hasText: 'Change type' }).click();
await page.locator('dialog.action-sheet .action-item', { hasText: /^Survey/ }).click();
await pause(600);
const nt2 = (await dd()).docs.find((x) => x.name === 'survey.txt');
check('the broker naming the type is typeBy broker, and the Survey leaves Missing', nt2 && nt2.type === 'survey' && nt2.typeBy === 'broker' && /Missing \(9\)/.test(await txt('#dd-h-missing')));

/* ------------------------------------------- not applicable, with a reason */
await page.locator('button[aria-label="Not applicable: Zoning letter or certificate of occupancy"]').click();
await page.waitForSelector('#dd-na-zoningCo');
await page.click('#dd-na-save-zoningCo');
check('a blank reason is refused with a message, and nothing is stored', /Say why it does not apply/.test(await txt('.dd-naform p[role=alert]')) && !(await dd()).na.zoningCo);
const bad = await typeChars('#dd-na-zoningCo', 'Seller says none');
check('the reason is typed one key at a time without the field losing its value or focus', bad.length === 0, bad.slice(0, 2).join(' | '));
await page.click('#dd-na-save-zoningCo');
await settle();
check('saved with its reason and a time; the row moves to Optional or not applicable, with the reason as text', (await dd()).na.zoningCo.reason === 'Seller says none' && /^\d{4}-\d{2}-\d{2}T/.test((await dd()).na.zoningCo.at) && /Not applicable[\s\S]*Reason: Seller says none/.test(await txt('#dd-h-optional + ul')) && /Missing \(8\)/.test(await txt('#dd-h-missing')));
await page.locator('.toast button', { hasText: 'Undo' }).click();
await settle();
check('Undo puts it back on the Missing list and removes the n/a', !(await dd()).na.zoningCo && /Missing \(9\)/.test(await txt('#dd-h-missing')));

/* ------------------------------------------------------- remove and Undo */
await page.locator('button[aria-label="Actions for estoppel-title.txt"]').click();
await page.locator('dialog.action-sheet .action-item', { hasText: 'Remove from list' }).click();
await settle();
check('Remove takes only the record off the list', (await dd()).docs.length === 3 && !(await dd()).docs.some((x) => x.name === 'estoppel-title.txt'));
await page.locator('.toast button', { hasText: 'Undo' }).click();
await settle();
check('and Undo restores it where it was', (await dd()).docs.some((x) => x.name === 'estoppel-title.txt' && x.type === 'snda'));
// the as-of date is only ever what the broker types
await page.locator('button[aria-label="Actions for estoppel-title.txt"]').click();
await page.locator('dialog.action-sheet .action-item', { hasText: 'Set the as-of date' }).click();
await page.waitForSelector('#dd-asof');
await page.fill('#dd-asof', '3/4/26');
await page.press('#dd-asof', 'Enter');
await settle();
check('the as-of date is what was typed (2026-03-04), and every other document still has none: never today', (await dd()).docs.find((x) => x.name === 'estoppel-title.txt').asOf === '2026-03-04' && (await dd()).docs.filter((x) => x.asOf).length === 1);

/* --------------------------------------------- a reader marks a file read */
await page.click('#tab-rentroll');
await page.waitForTimeout(400);
await page.locator('#deal-rentroll button[aria-label="More rent roll actions"]').click();
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.action-sheet .action-item', { hasText: 'Import from PDF' }).click()]);
await chooser.setFiles(F + 'rr-dd.pdf');
await page.waitForSelector('#rrpdf-use');
await page.waitForTimeout(1200);
await page.click('#rrpdf-use');
await settle();
await page.waitForTimeout(600);
s = await dd();
const rr2 = s.docs.find((x) => x.name === 'rr-dd.pdf');
check('the rent roll import marks the file it read as read, with its checks, on the same record (not a second one)', s.docs.filter((x) => x.sha256 === sha(F + 'rr-dd.pdf')).length === 1 && rr2.status === 'read' && rr2.read.reader === 'rrpdf' && rr2.read.target === 'rr' && Number.isInteger(rr2.read.checks.pass) && rr2.read.checks.fail === 0, JSON.stringify(rr2.read));
await page.click('#tab-overview');
await page.waitForTimeout(400);
check('the card shows "n of m checks pass" and a Read chip for it', /\d+ of \d+ checks? pass/.test(await txt('#deal-dd')) && /Read/.test(await txt('#deal-dd')));
await page.locator('#deal-dd .dd-open', { hasText: 'rr-dd.pdf' }).click();
await page.waitForTimeout(500);
check('tapping a rent roll row opens the rent roll workspace (no new viewer)', (await page.getAttribute('#tab-rentroll', 'aria-selected')) === 'true');
await page.click('#tab-overview');
await page.waitForTimeout(300);
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#t12-import, #t12-replace')]);
await fc.setFiles(F + 'invented-gardens.csv');
await page.waitForSelector('#t12-replace', { timeout: 15000 });
await settle();
await page.waitForTimeout(800);
s = await dd();
const t12b = s.docs.find((x) => x.name === 'invented-gardens.csv');
check('the T-12 import marks its file read on the same record, with the statement’s own checks counted', s.docs.filter((x) => x.sha256 === sha(F + 'invented-gardens.csv')).length === 1 && t12b.status === 'read' && t12b.read.reader === 't12' && t12b.read.target === 't12' && t12b.read.checks.pass + t12b.read.checks.warn + t12b.read.checks.fail > 0, JSON.stringify(t12b.read));

/* ----------------------------- a drop on the card: documents, not an OM */
const before = (await dd()).docs.length;
await page.evaluate(() => {
  const box = document.querySelector('#deal-dd');
  const dt = new DataTransfer();
  dt.items.add(new File(['TENANT ESTOPPEL CERTIFICATE\nThe Tenant certifies the lease is in full force and effect.\nNo defaults exist. Security deposit held.\n'], 'dropped-notes.txt', { type: 'text/plain' }));
  box.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await page.waitForSelector('dialog.action-sheet');
await page.locator('dialog.action-sheet .action-item', { hasText: 'Yes, it is' }).first().click();
await page.waitForTimeout(1200);
const dropped = (await dd()).docs.find((x) => x.name === 'dropped-notes.txt');
check('a file dropped on the card is added as a document of this deal (estoppel, confirmed with a tap), and no OM is read', (await dd()).docs.length === before + 1 && dropped && dropped.type === 'estoppel' && dropped.typeBy === 'broker' && (await page.evaluate(() => localStorage.getItem('zlatura.deal.current'))) === dealId && (await deals()).length === 1);

/* --------------------------------------------- hostile file names as text */
await addFiles(mem('<img src=x onerror=window.__pwned=1>.txt', 'see you at noon'));
await page.waitForSelector('dialog.action-sheet');
await page.locator('dialog.action-sheet .action-item', { hasText: 'Add it with no type' }).click();
await pause(900);
await addFiles(mem('=cmd|\' /C calc\'!A0 \u202Eevil.txt', 'see you at noon too'));
await page.waitForSelector('dialog.action-sheet');
await page.locator('dialog.action-sheet .action-item', { hasText: 'Add it with no type' }).click();
await pause(900);
check('hostile file names are shown as text: no element, no script, and the stored name is the cleaned one', (await page.locator('#deal-dd img, #deal-dd script').count()) === 0 && (await page.evaluate(() => window.__pwned)) === undefined && (await dd()).docs.some((x) => x.name === 'img src=x onerror=window.__pwned=1-.txt') && !(await dd()).docs.some((x) => /[\u202a-\u202e<>]/.test(x.name)));

/* ------------------------------------------------ backup, wipe and restore */
await settle();
const full = await dd();
await page.evaluate(() => { location.hash = '#settings'; });
await page.waitForSelector('#settings-data #backup-make');
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#backup-make')]);
const bfile = `${SHOTS}dd-backup.json`;
await dl.saveAs(bfile);
const btext = fs.readFileSync(bfile, 'utf8');
const bj = JSON.parse(btext);
check('the backup carries the document list at schema 8, and none of the files’ bytes', bj.deals.length === 1 && bj.deals[0].schema === 8 && JSON.stringify(bj.deals[0].dd) === JSON.stringify(full) && !btext.includes('%PDF') && !btext.includes('Invented Gardens Apartments'), JSON.stringify(bj.deals[0].schema));
await page.evaluate(() => new Promise((res) => { localStorage.clear(); const q = indexedDB.deleteDatabase('zlatura'); q.onsuccess = res; q.onerror = res; q.onblocked = res; }));
await page.goto(`${BASE}#settings`, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#settings-data #backup-file', { state: 'attached' });
await page.setInputFiles('#backup-file', bfile);
await page.waitForSelector('dialog.action-sheet');
await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.locator('dialog.action-sheet .action-item', { hasText: 'Merge into this device' }).click()]);
check('after a wipe and a restore the document list is back, record for record', JSON.stringify(await dd()) === JSON.stringify(full), JSON.stringify(await dd()).slice(0, 200));
if (process.env.OLD_BASE) {
  const old = await ctx.newPage();
  await old.goto(`${process.env.OLD_BASE}#settings`, { waitUntil: 'load' });
  await old.waitForSelector('#settings-data #backup-file', { state: 'attached' });
  await old.setInputFiles('#backup-file', bfile);
  await old.waitForTimeout(1500);
  const said = await old.evaluate(() => document.body.innerText);
  check('an older app refuses this version’s backup (“update the app first”), restoring nothing', /saved by a newer version of .*update the app first\. Nothing was restored/.test(said), said.slice(0, 200));
  await old.close();
}
await page.evaluate(() => { location.hash = '#deal'; });
await page.waitForSelector('#deal-root');
if (await page.locator('#deal-root .list .li').count()) await page.locator('#deal-root .list .li').first().click();
await openCard();

/* --------------------------------------------- a confidential deal: no AI */
await page.evaluate(async (url) => {
  const ai = await import('./app/ai.js'); await ai.saveSettings({ url, token: 'e2e-token-0123456789abcdef', enabled: true });
}, AI);
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#dd-ai');
check('with AI on and the deal not confidential, the AI button is offered and enabled', (await page.getAttribute('#dd-ai', 'aria-disabled')) === null);
await page.evaluate(async (id) => { const m = await import('./app/store.js'); const x = await m.loadDeal(id); x.confidential = true; await m.saveDeal(x); }, dealId);
await page.reload({ waitUntil: 'load' });
await openCard();
await page.waitForSelector('#dd-ai');
const requests = aiSeen.length;
await page.click('#dd-ai', { force: true });
await pause(400);
check('on a confidential deal the AI button is disabled, says why in words, and a tap opens nothing and sends nothing', (await page.getAttribute('#dd-ai', 'aria-disabled')) === 'true' && /confidential/i.test(await txt('#dd-ai-why')) && (await page.locator('#ai-files').count()) === 0 && aiSeen.length === requests, await txt('#dd-ai-why'));

/* ------------------------------ 200 documents: the cap and 150 ms an edit */
await page.evaluate(async (id) => {
  const m = await import('./app/store.js'); const x = await m.loadDeal(id);
  x.confidential = false;
  x.dd.docs = Array.from({ length: 200 }, (_, i) => ({ id: `dd_${String(i).padStart(12, '0')}`, type: i % 3 ? null : 'lease', typeBy: i % 3 ? null : 'broker', name: `Invented file ${i}.pdf`, kind: 'pdf', size: 1000 + i, sha256: null, pages: 3, addedAt: '2026-10-30T00:00:00.000Z', asOf: null, status: 'received', supersededBy: null, read: null, note: '' }));
  await m.saveDeal(x);
}, dealId);
await page.reload({ waitUntil: 'load' });
await openCard();
const ms = await page.evaluate(() => { const sel = document.querySelector('#dd-preset'); const t = performance.now(); sel.value = 'office'; sel.dispatchEvent(new Event('change', { bubbles: true })); return performance.now() - t; });
check('with 200 documents an edit (changing the checklist) is drawn in under 150 ms', ms < 150, `${ms.toFixed(1)} ms`);
await addFiles(mem('one-too-many.txt', 'TENANT ESTOPPEL CERTIFICATE full force and effect no defaults'));
if (await page.locator('dialog.action-sheet').count()) await page.locator('dialog.action-sheet .action-item', { hasText: 'Yes, it is' }).first().click();
await pause(800);
check('the 201st document is refused with a message', (await dd()).docs.length === 200 && /at most 200 documents/.test(await txt('#dd-alert')), await txt('#dd-alert'));

/* ------------------------------------------ axe, at phone and desktop size */
async function axe(name) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document.querySelector('#deal-dd'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  });
  check(`axe: the Documents card, ${name}`, res.length === 0, res.join('\n    '));
}
await page.locator('#deal-dd').scrollIntoViewIfNeeded();
await axe('phone size');
const small = await page.evaluate(() => [...document.querySelectorAll('#deal-dd button, #deal-dd input, #deal-dd select')].filter((e) => { const q = e.getBoundingClientRect(); return q.width && (q.height < 43.5 || q.width < 43.5) && !e.hidden; }).map((e) => `${e.id || e.className || e.tagName}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
check('every control on the Documents card is at least 44 px in both directions (phone size)', small.length === 0, small.slice(0, 6).join(', '));
const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('the card does not push the page sideways at phone size', wide <= 0, `${wide}px`);
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(300);
await axe('desktop size');
await page.setViewportSize({ width: 390, height: 844 });

/* ------------------------------ an OM read: the figures point at their file */
await page.evaluate(() => { location.hash = '#deal'; });
await page.waitForSelector('#om-file', { state: 'attached' });
await page.setInputFiles('#om-file', F + 'om-retail.pdf');
await page.waitForSelector('#deal-tiles .tile');
await page.waitForTimeout(1800);
const all = await deals();
const omDeal = all.find((x) => x.id !== dealId && x.dd && x.dd.docs.some((y) => y.name === 'om-retail.pdf'));
const omDoc = omDeal && omDeal.dd.docs.find((y) => y.name === 'om-retail.pdf');
const linked = omDeal ? Object.entries(omDeal.sources).filter(([, v]) => v.doc) : [];
check('reading an OM records its file as read (type om, typeBy reader) and the figures read from it point back at that record', omDoc && omDoc.type === 'om' && omDoc.typeBy === 'reader' && omDoc.status === 'read' && omDoc.read.reader === 'om' && omDoc.sha256 === sha(F + 'om-retail.pdf') && linked.length > 0 && linked.every(([, v]) => v.doc === omDoc.id), JSON.stringify([omDoc && omDoc.read, linked.length]));

const omHist = omDeal ? await page.evaluate((did) => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('history').objectStore('history').getAll(IDBKeyRange.bound([did, 0], [did, Infinity])); g.onsuccess = () => { r.result.close(); res(g.result.map((e) => e.label)); }; }; }), omDeal.id) : [];
check('reading an OM is one history entry: the registration is not a second one', omHist.length === 1 && !omHist.some((l) => /Documents/.test(l)), JSON.stringify(omHist));

await browser.close();
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', errors);
