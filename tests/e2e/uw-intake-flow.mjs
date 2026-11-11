/* "Start from documents" on the Underwrite tab, in a browser: three invented files dropped at once (a rent roll CSV, a
 * T-12 CSV, a text lease), each found by the readers that already exist; a second, different rent roll that must be ASKED
 * about (never chosen for the broker) and the same file twice flagged; nothing on a deal until "Use"; "Make a deal from
 * these" attaches the documents (the T-12 through its own import) and Undo takes the deal away again; a drop anywhere
 * on the tab (not routed to Comps); no console errors, no sideways scroll at 390 px, and axe on the card at phone and
 * desktop size. Invented files only.
 *
 *   node uw-intake-flow.mjs        # BASE=http://localhost:8080/ by default */
import { createRequire } from 'module';
import fs from 'node:fs';
import { phone, BASE, finish } from './lib.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const { browser, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(8000);
const requests = []; page.on('request', (r) => requests.push(r.url()));
const F = new URL('./files/', import.meta.url).pathname;
const fflate = createRequire(import.meta.url)('fflate');
const zipOf = (o) => Buffer.from(fflate.zipSync(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? new TextEncoder().encode(v) : v]))));
const txt = (sel) => page.textContent(sel);
const deals = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('deals').objectStore('deals').getAll(); g.onsuccess = () => { r.result.close(); res(g.result); }; }; }));
const mem = (name, text) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });

const RR1 = 'Suite,Tenant,Square Feet,Lease Start,Lease Expiration,Annual Base Rent\n101,"Acme, Inc.",1500,2024-01-01,2029-12-31,"$45,000"\n102,Vacant,800,,,\n103,Beta LLC,1200,03/01/2025,02/28/2030,38400\n';
const RR2 = 'Suite,Tenant,Square Feet,Lease Start,Lease Expiration,Annual Base Rent\n101,"Acme, Inc.",1500,2024-01-01,2029-12-31,"$46,500"\n102,Gamma Co,800,2025-02-01,2030-01-31,24000\n103,Beta LLC,1200,03/01/2025,02/28/2030,38400\n';
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const row = (label, v) => `${label},${months.map(() => v).join(',')},${v * 12}\n`;
const T12 = `Account,${months.map((m) => `${m} 2025`).join(',')},Total\n` + row('Rental income', 10000) + row('Other income', 500) + row('Total income', 10500) + row('Property taxes', 2000) + row('Insurance', 600) + row('Total operating expenses', 2600) + row('Net operating income', 7900);
const LEASE = 'LEASE AGREEMENT\nThis Lease is made between Hollow Oak Properties, as Landlord, and Delta Goods, as Tenant, for the premises known as Suite 104.\nThe commencement date is January 1, 2026 and the lease term is five years. Base rent is due monthly.\n';

await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
await page.click('#uw-view-quick');   // the tab opens on the built-in tool
await page.waitForSelector('#uw-intake');
check('the card is first, above the quick underwrite card, with an empty state', await page.evaluate(() => { const c = document.querySelector('#underwrite-root .stack').children; return c[0].id === 'uw-intake' && c[1].id === 'uw-filler' && c[2].id === 'uw-card'; }) && /Nothing yet/.test(await txt('#uw-intake')), (await txt('#uw-intake')).slice(0, 200));
const before = (await deals()).length;

/* ---- three files at once through the picker */
await page.setInputFiles('#uwi-files', [mem('rent-roll-a.csv', RR1), mem('operating-2025.csv', T12), mem('suite-104-lease.txt', LEASE)]);
await page.waitForSelector('.uwi-item[data-id] >> nth=2');
const items = await page.$$eval('.uwi-item', (ls) => ls.map((l) => l.textContent));
check('three files each found: rent roll and T-12 by their readers, the lease asked', items.length === 3 && /Rent roll.*Read/.test(items[0]) && /T-12 operating statement.*Read/.test(items[1]) && /What is this\?.*Looks like/.test(items[2]), JSON.stringify(items).slice(0, 400));
check('nothing is on a deal yet', (await deals()).length === before);
check('the checklist says what is missing (leases and the OM)', await page.evaluate(() => { const t = [...document.querySelectorAll('.uwi-check li')].map((l) => l.textContent); return /Lease.*Missing/.test(t[2]) && /Offering memorandum.*Missing/.test(t[3]) && /Rent roll.*Found, ready/.test(t[0]); }));
check('the lease has no Use button until it is answered; the answer comes from the broker', (await page.locator('.uwi-item >> nth=2').locator('[data-use]').count()) === 0 && (await page.locator('.uwi-item >> nth=2').locator('[data-type="lease"]').count()) === 1);
await page.locator('.uwi-item >> nth=2').locator('[data-type="lease"]').click();
check('after "It is lease" the lease can be used', (await page.locator('.uwi-item >> nth=2').locator('[data-use]').count()) === 1);

/* ---- a different rent roll competes; the same file twice is flagged */
await page.setInputFiles('#uwi-files', [mem('rent-roll-b.csv', RR2), mem('copy of rent-roll-a.csv', RR1)]);
await page.waitForSelector('.uwi-ask[data-kind="rentroll"]');
const ask = await txt('.uwi-ask[data-kind="rentroll"]');
check('two rent rolls: the broker is asked which controls, and neither is chosen', /Which one controls\?/.test(ask) && (await page.locator('.uwi-ask[data-kind="rentroll"] [data-pick]').count()) === 2);
const why = await page.$$eval('.uwi-why', (l) => l.map((x) => x.textContent));
check('the same file twice is flagged and kept once', why.some((w) => /same file as rent-roll-a\.csv/.test(w)), why.join(' | '));
check('while asked, the rent rolls cannot be used but the make-a-deal action still waits for ready items only', await page.evaluate(() => [...document.querySelectorAll('.uwi-item[data-id]')].filter((l) => /rent-roll/.test(l.textContent)).every((l) => l.querySelector('[data-use]').disabled)) && !(await page.locator('#uwi-make').isDisabled()));
check('still nothing on a deal', (await deals()).length === before);
await page.locator('.uwi-ask[data-kind="rentroll"] [data-pick]').nth(1).click();
check('choosing ends the question and enables exactly the chosen one', (await page.locator('.uwi-ask').count()) === 0 && await page.evaluate(() => { const ls = [...document.querySelectorAll('.uwi-item[data-id]')].filter((l) => /rent-roll/.test(l.textContent)); return ls.filter((l) => !l.querySelector('[data-use]').disabled).length === 1; }));

/* ---- layout and axe on the card, phone then desktop */
async function axe(name) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document.querySelector('#uw-intake'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  });
  check(`axe: the card, ${name}`, res.length === 0, res.join('\n    '));
}
await axe('phone size');
check('390 px: no sideways scroll', (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
const small = await page.evaluate(() => [...document.querySelectorAll('#uw-intake button')].filter((e) => { const q = e.getBoundingClientRect(); return q.width && (q.height < 43.5 || q.width < 43.5); }).map((e) => `${e.textContent}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
check('every button on the card is at least 44 px', small.length === 0, small.join(', '));
await page.locator('#uw-intake').screenshot({ path: new URL('./shots/uw-intake-phone.png', import.meta.url).pathname });
await page.setViewportSize({ width: 1280, height: 900 });
await axe('desktop size');
await page.locator('#uw-intake').screenshot({ path: new URL('./shots/uw-intake-desktop.png', import.meta.url).pathname });
await page.setViewportSize({ width: 390, height: 844 });

/* ---- Use: the deal is made with the used documents; Undo takes it away */
await page.click('#uwi-make');
await page.waitForFunction(() => /Used/.test(document.querySelector('#uw-intake').textContent));
await page.waitForTimeout(900);
const after = await deals();
const mine = after.find((d) => d.dd && d.dd.docs.some((x) => x.name === 'suite-104-lease.txt'));
const types = mine ? mine.dd.docs.map((x) => `${x.name}:${x.type}:${x.typeBy}`).sort() : [];
check('one deal was made, holding the three used documents by name and type (rent roll B chosen, A repeated not added)', after.length === before + 1 && types.length === 3 && types.includes('rent-roll-b.csv:rentroll:reader') && types.includes('suite-104-lease.txt:lease:broker') && types.includes('operating-2025.csv:t12:reader'), types.join(' | '));
check('the T-12 went through its own import: the deal has a statement', !!(mine && mine.t12 && mine.t12.lines && mine.t12.lines.length), mine ? Object.keys(mine).join(',') : 'no deal');
check('no figure changed: the new deal has no price, NOI or other figure typed', !!mine && Object.values(mine.figures || {}).every((v) => v === null || v === undefined || v === '' || v === 0 || typeof v === 'object'), JSON.stringify(mine && mine.figures).slice(0, 200));
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(900);
check('Undo removes the deal and the documents are staged again', (await deals()).length === before && (await page.locator('.uwi-item .uwi-staged, .uwi-staged').count()) >= 1 && (await page.locator('#uwi-make').count()) === 1);

/* ---- a drop anywhere on the tab goes to the card, not to Comps */
await page.evaluate(() => {
  const dt = new window.DataTransfer();
  dt.items.add(new File(['x,y\n1,2\n'], 'dropped-notes.txt', { type: 'text/plain' }));
  document.querySelector('#uw-calc-card').dispatchEvent(new window.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
});
await page.waitForFunction(() => document.querySelector('#uw-intake').textContent.includes('dropped-notes.txt'));
check('a file dropped on the tab is read by the card and the tab stays Underwrite', (await page.evaluate(() => location.hash)).includes('underwrite') && (await page.locator('#underwrite-root').isVisible()));

/* ---- a zip is opened in memory and each file in it is staged as if dropped itself, naming the zip */
await page.getByRole('button', { name: 'Clear the document list' }).click();
await page.setInputFiles('#uwi-files', [{ name: 'deal-bundle.zip', mimeType: 'application/zip', buffer: zipOf({ 'rent-roll-z.csv': RR1, 'Q4/operating-z.csv': T12, '../escape.csv': RR2, 'folder/': '' }) }]);
await page.waitForFunction(() => document.querySelectorAll('#uw-intake .uwi-files li').length >= 3);
const zrows = await page.$$eval('#uw-intake .uwi-files li', (ls) => ls.map((l) => l.textContent));
check('a zip is opened: each file in it is listed "from deal-bundle.zip", the "../" path refused with its reason', zrows.length === 3 && zrows.filter((r) => /from deal-bundle\.zip/.test(r)).length === 3 && zrows.some((r) => /escape\.csv.*Its path in the zip climbs out of the zip/.test(r)), JSON.stringify(zrows).slice(0, 500));
const zitems = await page.$$eval('.uwi-item', (ls) => ls.map((l) => l.textContent));
check('the files in the zip are found by the same readers (rent roll, T-12) and say where they came from', zitems.length === 2 && zitems.some((t) => /Rent roll.*From deal-bundle\.zip\..*Read/.test(t)) && zitems.some((t) => /T-12.*From deal-bundle\.zip\./.test(t)), JSON.stringify(zitems).slice(0, 400));
check('a zip still stages nothing on a deal, and the make-a-deal action is ready for the safe files', (await deals()).length === before && !(await page.locator('#uwi-make').isDisabled()));
await page.setInputFiles('#uwi-files', [{ name: 'bomb.zip', mimeType: 'application/zip', buffer: zipOf({ 'big.bin': new Uint8Array(30e6) }) }, { name: 'nothing.zip', mimeType: 'application/zip', buffer: zipOf({}) }]);
await page.waitForFunction(() => document.querySelectorAll('#uw-intake .uwi-why').length >= 3);
const bad = await page.$$eval('#uw-intake .uwi-why', (l) => l.map((x) => x.textContent));
check('a zip bomb and an empty zip are each refused with a reason, and the earlier files are still there', bad.some((w) => /bomb\.zip.*not opened/.test(w)) && bad.some((w) => /empty zip/.test(w)) && (await page.locator('.uwi-item').count()) === 2, bad.join(' | ').slice(0, 300));

/* ---- a PDF with no text layer: OCR only when asked, then classified like any file, never typed by its text */
const ocrBefore = requests.filter((u) => /vendor\/ocr\//.test(u)).length;
await page.setInputFiles('#uwi-files', [F + 'rr-scan.pdf']);
await page.waitForSelector('.uwi-item [data-ocr]');
const scanRow = await page.locator('.uwi-item', { has: page.locator('[data-ocr]') }).first().textContent();
check('a scan says "no text layer" and offers OCR on request; no OCR file was fetched yet', /no text layer/.test(scanRow) && !/damaged|unreadable/i.test(scanRow) && ocrBefore === 0 && requests.filter((u) => /vendor\/ocr\//.test(u)).length === 0, scanRow.slice(0, 200));
await axe('with the scan offer, phone size');
await page.locator('[data-ocr]').first().click();
await page.waitForFunction(() => /Read by OCR on this device/.test(document.querySelector('#uw-intake').textContent), null, { timeout: 150000 });
const scanAfter = await page.locator('.uwi-item', { hasText: 'rr-scan.pdf' }).first().textContent();
check('after OCR (read on this site only) it is a question, not a typed document: "Read by OCR", no Use button, the broker chooses the type', /Read by OCR on this device/.test(scanAfter) && requests.filter((u) => /vendor\/ocr\//.test(u)).every((u) => u.startsWith(BASE)) && (await page.locator('.uwi-item', { hasText: 'rr-scan.pdf' }).first().locator('[data-use]').count()) === 0 && (await page.locator('.uwi-item', { hasText: 'rr-scan.pdf' }).first().locator('[data-type]').count()) >= 1, scanAfter.slice(0, 300));
check('still nothing on a deal after OCR', (await deals()).length === before);
await axe('after OCR, phone size');

await browser.close();
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', errors);
