/* Routing in "Start from documents" (docs/changelog/unreleased/routing.md), in a browser at phone and desktop size: one invented workbook
 * holding a rent roll on a hidden sheet and a statement on a visible one is staged as two uses of the one file, each naming its sheet
 * (the hidden one said to be hidden), and each is used on its own; one invented OM that also holds a rent roll page is staged as the OM
 * and, apart, that page, both used together and Undo takes the deal away; an untitled rent roll table shows its preview as a rent roll
 * instead of a question. Nothing is on a deal before Use. Invented files only.
 *
 *   node routing-flow.mjs        # BASE=http://localhost:8080/ by default */
import { createRequire } from 'module';
import ExcelJS from 'exceljs';
import { phone, finish } from './lib.mjs';
import { BASE } from './lib.mjs';
import { pdfOf } from '../rr-fixtures.js';
import { rollPage, narrative } from '../tools/routepdfs.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const { browser, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(10000);
const deals = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('deals').objectStore('deals').getAll(); g.onsuccess = () => { r.result.close(); res(g.result); }; }; }));
const M = ['Jan 2025', 'Feb 2025', 'Mar 2025', 'Apr 2025', 'May 2025', 'Jun 2025'];
const wb = new ExcelJS.Workbook();
const cover = wb.addWorksheet('Cover'); cover.addRow(['Invented plaza']); cover.addRow(['Invented text']);
const t = wb.addWorksheet('T-12'); t.addRow(['Operating Statement']); t.addRow(['Line', ...M, 'Total']);
for (const [l, v] of [['Rental income', 10000], ['Other income', 500], ['Real estate taxes', 1500], ['Insurance', 400], ['Net operating income', 8600]]) t.addRow([l, ...M.map(() => v), v * 6]);
const rr = wb.addWorksheet('RR old', { state: 'hidden' }); rr.addRow(['Unit', 'Tenant', 'SF', 'Monthly Rent', 'Lease End']); rr.addRow(['101', 'Invented Co', 1000, 2400, '2028-01-31']); rr.addRow(['102', 'Sample LLC', 1200, 2900, '2027-06-30']); rr.addRow(['103', 'Vacant', 900, 0, '']);
const book = { name: 'invented-workbook.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await wb.xlsx.writeBuffer()) };
const om = { name: 'invented-om.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdfOf([narrative('Offering Memorandum', 'Cap Rate 6.5%'), rollPage(), narrative('Market notes')])) };
const plain = { name: 'invented-untitled-roll.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdfOf([rollPage({ title: false, plain: true }), narrative('Property notes')])) };

async function axe(name) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document.querySelector('#uw-intake'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  });
  check(`axe: the card, ${name}`, res.length === 0, res.join('\n    '));
}
const items = () => page.$$eval('.uwi-item', (ls) => ls.map((l) => ({ id: l.dataset.id, text: l.textContent })));
const clear = async () => { await page.getByRole('button', { name: 'Clear the document list' }).click(); await page.waitForFunction(() => document.querySelectorAll('.uwi-item').length === 0); };

await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
await page.click('#uw-view-quick');
await page.waitForSelector('#uw-intake');
const before = (await deals()).length;

for (const [size, vp] of [['phone size', { width: 390, height: 844 }], ['desktop size', { width: 1280, height: 900 }]]) {
  await page.setViewportSize(vp);
  /* ---- one workbook: a statement on a visible sheet, a rent roll only on a hidden one */
  await page.setInputFiles('#uwi-files', [book]);
  await page.waitForFunction(() => document.querySelectorAll('.uwi-item').length >= 2);
  let its = await items();
  const roll = its.find((x) => /^Rent roll/.test(x.text)); const stmt = its.find((x) => /^T-12 operating statement/.test(x.text));
  check(`${size}: one workbook is staged as two uses of the file, a rent roll and a T-12`, its.length === 2 && !!roll && !!stmt, its.map((x) => x.text.slice(0, 60)).join(' | '));
  check(`${size}: each says which sheet it comes from, and the hidden one says it is hidden`, !!roll && !!stmt && /hidden sheet “RR old”: no visible sheet reads as a rent roll/.test(roll.text) && /Sheet “T-12”\./.test(stmt.text) && !/hidden/.test(stmt.text), its.map((x) => x.text).join(' | '));
  check(`${size}: nothing is on a deal before Use`, (await deals()).length === before);
  await axe(size);
  if (size === 'phone size') {
    await page.locator(`.uwi-item[data-id="${roll.id}"] [data-use]`).click();
    await page.waitForFunction((id) => /Used/.test(document.querySelector(`.uwi-item[data-id="${id}"]`).textContent), roll.id);
    await page.waitForTimeout(600);
    await page.locator(`.uwi-item[data-id="${stmt.id}"] [data-use]`).click();
    await page.waitForFunction((id) => /Used/.test(document.querySelector(`.uwi-item[data-id="${id}"]`).textContent), stmt.id);
    await page.waitForTimeout(900);
    const mine = (await deals()).find((d) => d.dd && d.dd.docs.some((x) => x.name === 'invented-workbook.xlsx'));
    check('phone size: each use goes through its own path: one deal, the file recorded once, the T-12 read', (await deals()).length === before + 1 && !!mine && mine.dd.docs.filter((x) => x.name === 'invented-workbook.xlsx').length === 1 && !!(mine.t12 && mine.t12.lines && mine.t12.lines.length), mine ? mine.dd.docs.map((x) => `${x.name}:${x.type}`).join(',') : 'no deal');
    // the deal is taken away with its Undo (the toast of the first Use has gone by now: clear the list, then the deal is removed from Home)
    await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const tx = r.result.transaction('deals', 'readwrite'); tx.objectStore('deals').clear(); tx.oncomplete = () => { r.result.close(); res(); }; }; }));
    await page.reload({ waitUntil: 'load' });
    await page.click('#uw-view-quick'); await page.waitForSelector('#uw-intake');
  } else await clear();

  /* ---- an OM that also holds a rent roll page: the OM, and apart from it that page */
  await page.setInputFiles('#uwi-files', [om]);
  await page.waitForFunction(() => document.querySelectorAll('.uwi-item').length >= 2);
  its = await items();
  const o = its.find((x) => /^Offering memorandum/.test(x.text)); const pg = its.find((x) => /^Rent roll/.test(x.text));
  check(`${size}: an OM with a rent roll page is staged as the OM and, apart, that page by page number`, its.length === 2 && !!o && !!pg && /Page 2 read as rent roll/.test(pg.text), its.map((x) => x.text.slice(0, 120)).join(' | '));
  check(`${size}: the OM is not read as a rent roll as a whole and nothing is asked`, !!o && !/What is this/.test(o.text) && (await page.locator('.uwi-ask').count()) === 0);
  const n0 = (await deals()).length;
  await page.click('#uwi-make');
  await page.waitForFunction(() => document.querySelectorAll('.uwi-item .dd-chip.dd-reviewed').length >= 2);
  await page.waitForTimeout(800);
  const made = (await deals()).find((d) => d.dd && d.dd.docs.some((x) => x.name === 'invented-om.pdf'));
  check(`${size}: both uses are used: one deal, the file recorded once, as the OM`, (await deals()).length === n0 + 1 && !!made && made.dd.docs.length === 1 && made.dd.docs[0].type === 'om', made ? made.dd.docs.map((x) => `${x.name}:${x.type}`).join(',') : 'no deal');
  check(`${size}: no figure changed by using them`, !!made && Object.values(made.figures || {}).every((v) => v === null || v === undefined || v === '' || v === 0 || typeof v === 'object'));
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(900);
  check(`${size}: Undo removes the deal and both uses are staged again`, (await deals()).length === n0 && (await page.locator('.uwi-staged').count()) === 2 && (await page.locator('#uwi-make').count()) === 1);
  await clear();

  /* ---- an untitled rent roll table: its preview, not a question */
  await page.setInputFiles('#uwi-files', [plain]);
  await page.waitForFunction(() => document.querySelectorAll('.uwi-item').length >= 1);
  its = await items();
  check(`${size}: an untitled rent roll table is shown as a rent roll, read, with Use offered (not "What is this?")`, its.length === 1 && /^Rent roll/.test(its[0].text) && /Read/.test(its[0].text) && !/What is this/.test(its[0].text) && (await page.locator('.uwi-item [data-use]').count()) === 1, its.map((x) => x.text.slice(0, 160)).join(' | '));
  await clear();
}
check('no sideways scroll at 1280 px', (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);

await browser.close();
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', errors);
