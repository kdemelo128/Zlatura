/* F2: every file the app reads as text, in the browser, saved as Windows-1252
 * (an older Excel or Windows) and as UTF-8: the rent roll and T-12 CSV
 * imports, a project file, a backup and a template package. (A document sent
 * to AI is in ai-flow.mjs.) Accented names, a curly apostrophe and an en dash
 * read right, the app says when a file wasn't UTF-8, and a UTF-8 file reads as
 * before with no note. Invented fixtures only (tests/fixtures/encoding/). */
import fs from 'fs';
import { phone, BASE, finish } from './lib.mjs';
const F = new URL('./files/', import.meta.url).pathname;
const E = new URL('../fixtures/encoding/', import.meta.url).pathname;
const { browser, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const text = async (sel) => ((await page.locator(sel).count()) ? (await page.textContent(sel)).replace(/\s+/g, ' ').trim() : '');
const TENANTS = ['Café Lumière', 'O’Brien & Søn Bakery', 'Señor Taco – Plaza Mañana'];
// Windows-1252 bytes of a string (its characters are all in Windows-1252)
const HIGH = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';
const cp1252 = (s) => Buffer.from([...s].map((c) => { const i = HIGH.indexOf(c); return i >= 0 ? 0x80 + i : c.charCodeAt(0); }));

await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
await page.waitForSelector('#deal-t12 #t12-import');

// ---- 1. a rent roll CSV, first as Windows-1252, then the same as UTF-8
async function importRr(file) {
  await page.click('#tab-rentroll');
  await page.locator('#deal-rentroll button[aria-label="More rent roll actions"]').click();
  const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.action-sheet .action-item', { hasText: 'Import from Excel or CSV' }).click()]);
  await ch.setFiles(E + file);
  await page.waitForSelector('#sheet-body .map-row');
  const note = await text('#rr-encoding');
  const samples = await page.$$eval('#sheet-body .map-row .h small', (s) => s.map((x) => x.textContent));
  const rep = page.locator('#sheet-body label.chk input');
  if (!(await rep.isChecked())) await rep.check();
  await page.click('#sheet-foot .btn-primary');
  await page.waitForTimeout(500);
  const tenants = await page.$$eval('#deal-rentroll .rr-grid tbody tr input[aria-label^="Tenant"]:not([aria-label^="Tenant contact"])', (i) => i.map((x) => x.value));
  return { note, samples, tenants };
}
let r = await importRr('rentroll-windows-1252.csv');
check('a Windows-1252 rent roll: the mapping sheet shows the names right', r.samples.some((s) => s === 'e.g. Café Lumière, O’Brien & Søn Bakery'), r.samples.join(' | '));
check('it says it was read as Windows-1252, with the words to check', r.note === 'Read as Windows-1252 (an older Excel or Windows format), because the file isn’t UTF-8. Check that these read right: Café, Lumière, O’Brien.', r.note);
check('the tenants are imported with their accents, apostrophe and dash', JSON.stringify(r.tenants) === JSON.stringify(TENANTS), JSON.stringify(r.tenants));
r = await importRr('rentroll-utf8.csv');
check('the same rent roll as UTF-8: no note', r.note === '', r.note);
check('and the same tenants', JSON.stringify(r.tenants) === JSON.stringify(TENANTS), JSON.stringify(r.tenants));

// ---- 2. a T-12 CSV saved as Windows-1252
await page.click('#tab-overview');
await page.waitForSelector('#deal-t12 #t12-import');
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#t12-import')]);
await fc.setFiles(E + 't12-windows-1252.csv');
await page.waitForSelector('.toast');
const toast = await text('.toast');
check('the T-12 toast says it was read as Windows-1252, with the words to check', /Read as Windows-1252 .* Check that these read right: Café, Lumière, O’Brien’s\./.test(toast), toast);
await page.waitForTimeout(400);
const id = await page.evaluate(() => localStorage.getItem('zlatura.deal.current'));
const deal = await page.evaluate((x) => new Promise((res) => { const q = indexedDB.open('zlatura'); q.onsuccess = () => { const g = q.result.transaction('deals').objectStore('deals').get(x); g.onsuccess = () => res(g.result); }; }), id);
const got = (deal && deal.t12 ? deal.t12.lines.map((l) => l.label) : []);
check('its line labels are kept with their accents', ['Base Rent – Café Lumière', 'CAM Recoveries – O’Brien’s Deli', 'Repairs & Maintenance – Peña Services'].every((l) => got.includes(l)), got.join(' | '));

// ---- 3. a project file, a backup and a template package saved as Windows-1252 (an editor such as old Notepad does this)
fs.writeFileSync(F + 'enc-project.json', cp1252(JSON.stringify({ format: 'zlatura-project', version: 1, docs: [{ name: 'Café O’Brien.pdf', pages: ['Café O’Brien'] }], edits: {}, manual: [] })));
await page.goto(BASE + '#comps', { waitUntil: 'load' });
await page.setInputFiles('#file', F + 'enc-project.json');
await page.waitForSelector('.toast');
const pt = await text('.toast');
check('a Windows-1252 project opens and says how it was read', /^Opened enc-project\.json: 0 comps\. Read as Windows-1252 .* Check that these read right: Café, O’Brien\.pdf, O’Brien\./.test(pt), pt);

fs.writeFileSync(F + 'enc-backup.json', cp1252(JSON.stringify({ format: 'zlatura-backup', version: 2, createdAt: Date.UTC(2026, 9, 16), note: 'Café O’Brien', deals: [], kv: {}, local: {} })));
await page.goto(BASE + '#settings', { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' }); // a fresh page: no toast left from the project
await page.waitForSelector('#settings-data #backup-file', { state: 'attached' });
await page.setInputFiles('#backup-file', F + 'enc-backup.json');
await page.waitForSelector('dialog.action-sheet');
const bt = await text('.toast');
check('a Windows-1252 backup is read and says how', /^enc-backup\.json: Read as Windows-1252 .* Check that these read right: Café, O’Brien\./.test(bt), bt);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

const wb = fs.readFileSync(F + 'acme-template.xlsx').toString('base64');
fs.writeFileSync(F + 'enc.template.json', cp1252(JSON.stringify({ format: 'zlatura-template', name: 'Café O’Brien underwriting', category: 'Underwriting', fileName: 'acme.xlsx', workbook: wb })));
await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.waitForSelector('#deal-root .view-head button[aria-label="More deal actions"]');
await page.click('#deal-root .view-head button[aria-label="More deal actions"]');
await page.locator('dialog.action-sheet .action-item', { hasText: 'Fill my Excel template' }).first().click();
await page.waitForSelector('#sheet-foot button:has-text("Upload a template")');
const [tc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#sheet-body button', { hasText: 'Import a template a colleague sent' }).click()]);
await tc.setFiles(F + 'enc.template.json');
await page.waitForTimeout(800);
check('a Windows-1252 template package keeps its name', /Café O’Brien underwriting/.test(await text('#sheet-body')), (await text('#sheet-body')).slice(0, 200));

// ---- 4. the app's own Windows-1252 table agrees with the browser's (Node's reads 0x80 to 0x9F as Latin-1, so the app keeps its own)
const agree = await page.evaluate(async () => {
  const { decodeText } = await import('./app/textfile.js');
  const b = Uint8Array.from({ length: 128 }, (_, i) => 0x80 + i);
  return decodeText(b).text === new TextDecoder('windows-1252').decode(b);
}).catch((e) => e.message);
check('every byte above 0x7F reads as the browser’s own Windows-1252 decoder reads it', agree === true, agree === true ? '' : String(agree));

const txt = await page.locator('#app').innerText();
check('no NaN/undefined/Infinity, and no “�” anywhere', !/\b(NaN|undefined|Infinity)\b|�/.test(txt));
for (const [st, n, d] of R) console.log(st, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errors);
await browser.close();
