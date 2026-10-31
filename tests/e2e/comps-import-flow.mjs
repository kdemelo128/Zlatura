/* Comps > Add comps from a CSV or Excel file, in a browser on invented files: the mapper (recognised and Not used columns,
 * the cap-rate question, the source label typed key by key), the preview counts and the duplicate defaulting to Skip,
 * Import and Undo, the layout remembered and recognised next time, a mixed-cap file that cannot continue, an .xlsx
 * dropped on Comps (asks) against one with only headings (a template), the project saved as version 2, a version 1
 * project opened, axe on each step, and an edit at 2,000 imported comps inside 150 ms. At phone and desktop size. */
import fs from 'fs';
import { createRequire } from 'module';
import ExcelJS from 'exceljs';
import { phone, BASE, finish } from './lib.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const csv = (name, text) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
const MAPPED = csv('mapped.csv', [
  'Property,Street Address,City,Status,Sale Price,Sale Date,Cap Rate,RBA,Wibble',
  'Invented Plaza (fictional),100 Example Street,Sampleton,Sold,"6,450,000",2026-03-04,0.0625,24000,x',
  'Invented Court (fictional),7 Sample Court,Sampleton,Sold,2400000,2026-02-10,0.07,9000,y',
  'Invented Mall (fictional),9 Sample Way,Sampleton,Active,3100000,,0.065,12000,z',
  'Invented Barn (fictional),11 Sample Way,Sampleton,Leased,1,,,500,w',
  'No Address (fictional),,Sampleton,Sold,5,,,500,v',
].join('\n'));
const DUPE = csv('again.csv', [
  'Property,Street Address,City,Status,Sale Price,Sale Date,Cap Rate,RBA,Wibble',
  'Invented Plaza (fictional),100 Example St.,Sampleton,Sold,6450000,2026-03-10,0.0625,24000,x',
  'Invented Annex (fictional),21 Sample Way,Sampleton,Sold,1800000,2026-01-20,0.0725,6000,q',
].join('\n'));
const MIXED = csv('mixed.csv', 'Address,City,Status,Sale Price,Cap Rate\n1 Example Street,Sampleton,Sold,1000000,0.065\n2 Example Street,Sampleton,Sold,1100000,7.25');
const BIG = csv('big.csv', ['Address,City,Status,Sale Price,Sale Date,RBA,Cap Rate', ...Array.from({ length: 2000 }, (_, i) => `${i + 1} Bulk Street,Sampleton,Sold,${1000000 + i * 1000},2026-0${1 + (i % 9)}-15,${10000 + i},6.5`)].join('\n'));
const xlsx = async (rows) => {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Comps'); rows.forEach((r) => ws.addRow(r));
  return { name: 'comps.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await wb.xlsx.writeBuffer()) };
};
const XLSX_ROWS = await xlsx([['Property', 'Address', 'City', 'Status', 'Sale Price', 'RBA'], ['Invented Loft (fictional)', '5 Sample Lane', 'Sampleton', 'Sold', 1500000, 7000]]);
const XLSX_HEAD = await xlsx([['Property Name', 'Sale Price', 'Building SF']]);
const V1 = new URL('../fixtures/project-4.7.89-v1.json', import.meta.url).pathname;

async function scenario(label, opts) {
  const { browser, ctx, page, errors } = await phone(opts);
  await page.addInitScript(() => {
    const w = window; w.__perf = { armed: null, done: null };
    w.__arm = (type, test) => {
      w.__perf.armed = null; w.__perf.done = null;
      const start = (e) => {
        if (w.__perf.armed !== null || !e.isTrusted) return;
        w.__perf.armed = performance.now();
        const finishIt = () => { if (w.__perf.done !== null || !test()) return; mo.disconnect(); requestAnimationFrame(() => setTimeout(() => { w.__perf.done = performance.now() - w.__perf.armed; }, 0)); };
        const mo = new MutationObserver(finishIt); mo.observe(document.body, { childList: true, subtree: true, characterData: true }); finishIt();
      };
      document.addEventListener(type, start, { capture: true, once: true });
    };
  });
  const c = (n, ok, d = '') => check(`${label}: ${n}`, ok, d);
  const audit = async (name) => {
    await page.waitForTimeout(450);
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
    const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
    c(`axe on ${name}`, res.length === 0, res.join('\n'));
  };
  const small = async (name) => {
    const bad = await page.evaluate(() => [...document.querySelectorAll('#sheet-body button, #sheet-body select, #sheet-body input:not([type=radio]):not([type=checkbox]), #sheet-foot button')].filter((n) => { const r = n.getBoundingClientRect(); return r.width && (r.height < 44); }).map((n) => `${n.tagName} ${(n.textContent || n.getAttribute('aria-label') || '').slice(0, 20)} ${Math.round(n.getBoundingClientRect().height)}`));
    c(`${name}: controls tall enough`, bad.length === 0, bad.join('; '));
  };
  const counts = async () => ({ sales: await page.locator('#sales-table tbody tr').count(), market: await page.locator('#market-table tbody tr').count() });
  const status = () => page.locator('#sheet-body [role=status]').first().textContent();
  const drop = (f) => page.evaluate(({ name, type, b64 }) => {
    const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], name, { type }));
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { name: f.name, type: f.mimeType, b64: f.buffer.toString('base64') });

  await page.goto(`${BASE}#comps`, { waitUntil: 'load' });
  c('the drop zone says CSV and Excel are welcome', /CSV or Excel file of comps/.test(await page.locator('#drop-text').textContent()) && /Choose files/.test(await page.locator('label[for=file].btn-primary').first().textContent()));
  // 1. Map: recognised and not-used columns, the question, the typed label
  await page.setInputFiles('#file', MAPPED);
  await page.waitForSelector('#sheet-body #ci-label');
  c('the mapper shows a recognised column and a Not used one', (await page.locator('#sheet-body .chip-good').count()) >= 6 && (await page.locator('#ci-col-8').inputValue()) === 'none' && (await page.locator('#ci-col-1').inputValue()) === 'address');
  const cont = page.locator('#sheet-foot .btn-primary');
  c('Continue waits for the cap-rate answer, with the reason in words', (await cont.isDisabled()) && /Answer the questions/.test(await page.locator('#sheet-foot').textContent()) && (await page.locator('#sheet-body legend', { hasText: '0.065 mean 6.5%' }).count()) === 1);
  await audit('the Map step'); await small('Map');
  await page.locator('#sheet-body label', { hasText: 'Yes, multiply by 100' }).click();
  c('answering enables Continue', await cont.isEnabled());
  const lab = page.locator('#ci-label');
  await lab.fill(''); await lab.pressSequentially('Firm sheet', { delay: 25 });
  c('the source label keeps every typed character', (await lab.inputValue()) === 'Firm sheet', await lab.inputValue());
  await cont.click();
  await page.waitForFunction(() => /rows:/.test(document.querySelector('#sheet-body [role=status]')?.textContent || ''));
  const t1 = await status();
  c('the preview counts rows, adds, left out and checks', /^5 rows: 3 to add \(2 sales, 1 listings\), 0 already in the set, 2 left out \(Leased, No address\), 0 with checks/.test(t1), t1);
  c('the counts line is a polite live region', (await page.locator('#sheet-body [role=status]').first().getAttribute('aria-live')) === 'polite');
  await audit('the Preview step'); await small('Preview');
  await page.locator('#sheet-foot .btn-primary').click();
  await page.waitForFunction(() => document.querySelectorAll('#sales-table tbody tr').length === 2);
  let n = await counts();
  c('Import puts 2 sales and 1 listing in the tables', n.sales === 2 && n.market === 1, JSON.stringify(n));
  c('each says "imported"', (await page.locator('.chips .chip', { hasText: 'imported' }).count()) === 3);
  c('the toast reads "Imported 3 comps from Firm sheet."', /Imported 3 comps from Firm sheet\./.test(await page.locator('.toast').first().textContent()));
  await page.locator('button[aria-label^="Everything on this comp"]').first().click();
  await page.waitForSelector('#sheet-body .facts');
  c('the comp\'s Source row says where it came from', /Firm sheet \(mapped\.csv, row \d\)/.test(await page.locator('#sheet-body').textContent()));
  await page.keyboard.press('Escape');
  // 2. Undo
  await page.locator('.toast button', { hasText: 'Undo' }).click().catch(() => {});
  await page.waitForTimeout(300);
  n = await counts();
  c('Undo takes the imported comps out again', n.sales === 0 && n.market === 0, JSON.stringify(n));
  // 3. the layout is remembered and recognised
  await page.setInputFiles('#file', MAPPED);
  await page.waitForFunction(() => /Mapped as Firm sheet, used 1 time/.test(document.querySelector('#sheet-body')?.textContent || ''));
  c('the same layout is recognised: "Mapped as Firm sheet, used 1 time"', true);
  c('and goes straight to the preview', /3 to add/.test(await status()));
  await page.locator('#sheet-foot .btn-primary').click();
  await page.waitForFunction(() => document.querySelectorAll('#sales-table tbody tr').length === 2);
  // 4. a duplicate defaults to Skip, and can be added anyway
  await page.setInputFiles('#file', DUPE);
  await page.waitForFunction(() => /rows:/.test(document.querySelector('#sheet-body [role=status]')?.textContent || ''));
  const t2 = await status();
  c('the repeated sale is "already in the set", the other is to add', /2 rows: 1 to add \(1 sales, 0 listings\), 1 already in the set/.test(t2), t2);
  c('the repeat reads Already in the set as … and defaults to Skip', /Already in the set as Invented Plaza/.test(await page.locator('#sheet-body').textContent()) && (await page.locator('#sheet-body button[aria-pressed=true]', { hasText: 'Skip' }).count()) === 1);
  await page.locator('#sheet-body button', { hasText: 'Add anyway' }).click();
  c('Add anyway moves it into the count', /2 to add/.test(await status()) && (await page.locator('#sheet-body button[aria-pressed=true]', { hasText: 'Add anyway' }).count()) === 1);
  await page.locator('#sheet-body button', { hasText: 'Skip' }).click();
  await page.locator('#sheet-foot .btn-primary').click();
  await page.waitForFunction(() => document.querySelectorAll('#sales-table tbody tr').length === 3);
  c('only the new comp joined', (await counts()).sales === 3);
  // 5. a mixed cap column cannot go on
  await page.setInputFiles('#file', MIXED);
  await page.waitForSelector('#sheet-foot');
  await page.waitForTimeout(400);
  const foot = await page.locator('#sheet-foot').textContent();
  c('a mixed cap column leaves Continue off with the reason shown', (await page.locator('#sheet-foot .btn-primary').isDisabled()) && /some values at 1 or below and some above 1/.test(foot), foot);
  await page.locator('#sheet-foot .btn', { hasText: 'Cancel' }).click();
  // 6. a workbook dropped on Comps: rows ask, headings only is a template
  await drop(XLSX_ROWS);
  await page.waitForSelector('.action-sheet');
  c('an .xlsx with comps in it asks what to do', (await page.locator('.action-sheet .action-item').first().textContent()).includes('Add these comps'));
  await page.locator('.action-sheet .action-item', { hasText: 'Add these comps' }).click();
  await page.waitForSelector('#sheet-body #ci-label');
  await page.locator('#sheet-foot .btn-primary').click();
  await page.waitForFunction(() => /rows:/.test(document.querySelector('#sheet-body [role=status]')?.textContent || ''));
  await page.locator('#sheet-foot .btn-primary').click();
  await page.waitForFunction(() => document.querySelectorAll('#sales-table tbody tr').length === 4);
  c('"Add these comps" imports the workbook\'s rows', (await counts()).sales === 4);
  await drop(XLSX_HEAD);
  await page.waitForTimeout(1500);
  c('an .xlsx with only headings is still a template (no question)', (await page.locator('.action-sheet').count()) === 0 && /Your template|comp table/.test(`${await page.locator('#sheet-eyebrow').textContent()} ${await page.locator('.toast').allTextContents()}`));
  if (await page.locator('#sheet-close').isVisible().catch(() => false)) await page.locator('#sheet-close').click();
  // 7. the project file is version 2; a version 1 project opens
  await page.locator('#comps-more').click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('.action-item', { hasText: 'Save project file' }).click()]);
  const saved = fs.readFileSync(await dl.path(), 'utf8');
  c('a saved project says "version":2 and keeps each comp\'s origin', /"version":2/.test(saved) && /"kind":"import"/.test(saved));
  await page.setInputFiles('#file', V1);
  await page.waitForFunction(() => document.querySelectorAll('#market-table tbody tr').length === 1 && document.querySelectorAll('#sales-table tbody tr').length === 2, null, { timeout: 15000 });
  c('a version 1 project opens with its comps', true);
  // 8. the comp-set command and the template download
  await page.locator('#comps-more').click();
  const [tpl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('.action-item', { hasText: 'Comp template (CSV)' }).click()]);
  c('the comp template downloads as a CSV of headings', /comp template\.csv$/.test(tpl.suggestedFilename()) && /^﻿Set,Status,Property,/.test(fs.readFileSync(await tpl.path(), 'utf8')));
  // 9. an edit at 2,000 imported comps stays inside the 150 ms budget
  await page.locator('#comps-more').click();
  await page.locator('.action-item', { hasText: 'Clear all comps' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#sales-table tbody tr').length === 0);
  await page.setInputFiles('#file', BIG);
  await page.waitForSelector('#sheet-body #ci-label', { timeout: 30000 });
  await page.locator('#sheet-foot .btn-primary').click();
  await page.waitForFunction(() => /rows:/.test(document.querySelector('#sheet-body [role=status]')?.textContent || ''), null, { timeout: 30000 });
  await page.locator('#sheet-foot .btn-primary').click();
  await page.waitForFunction(() => /of 2,000 comps/.test(document.querySelector('#sales-table')?.textContent || ''), null, { timeout: 60000 });
  c('the table draws the first 200 of 2,000 imported comps with a Show all button', /Showing 200 of 2,000 comps/.test(await page.locator('#sales-table').textContent()) && (await page.locator('#sales-table button', { hasText: 'Show all 2,000 comps' }).count()) === 1);
  await page.waitForTimeout(2000);
  const price = page.locator('#sales-table tbody tr').first().locator('input[aria-label="Sale price"]');
  const before = await page.locator('#sales-table tbody tr').first().locator('.calc').first().textContent();
  await price.fill('7,000,000');
  await page.evaluate((b) => window.__arm('change', () => document.querySelector('#sales-table tbody tr .calc')?.textContent !== b), before);
  await price.press('Tab');
  await page.waitForFunction(() => window.__perf.done !== null, null, { timeout: 30000 });
  const ms = await page.evaluate(() => window.__perf.done);
  c(`an edit with 2,000 imported comps takes ${Math.round(ms)} ms (budget 150)`, ms <= 150, `${ms} ms`);
  c('no sideways scrolling', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  c('no console errors', errors.length === 0, errors.join(' / '));
  await browser.close();
}

await scenario('phone', {});
await scenario('desktop', { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined });
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R);
