/* Every file reader checks the file before it reads it (filekind.js checkReader), in the browser on a phone-size page:
 * an oversized fake PDF (150 MB of nothing), a PNG under a .pdf name, a 501-page PDF, a PNG under a .xlsx name,
 * and a JSON array and a PNG under a backup name go in through the real file inputs. Each gives a plain message
 * naming the file, and the deals on the device are exactly as they were. A real 121-page OM still reads. */
import fs from 'fs';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();
page.setDefaultTimeout(15000);
const toasts = () => page.locator('.toast').allTextContents();
const deals = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('deals').objectStore('deals').getAll(); g.onsuccess = () => res(JSON.stringify(g.result.map((d) => [d.id, d.name, d.updatedAt]).sort())); }; }));
const said = async (re, ms = 20000) => { await page.waitForFunction((s) => [...document.querySelectorAll('.toast')].some((t) => new RegExp(s).test(t.textContent)), re.source, { timeout: ms }).catch(() => {}); return toasts(); };

// invented bad files
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(2000).fill(7)]);
const big = Buffer.alloc(150e6 + 1000); big.write('%PDF-1.7\n');
fs.mkdirSync(SHOTS, { recursive: true });
const put = (name, b) => { const p = SHOTS + name; fs.writeFileSync(p, b); return p; };
const bigPdf = put('rc-huge.pdf', big);
const pngPdf = put('rc-photo.pdf', PNG);
const pngXlsx = put('rc-photo.xlsx', PNG);
const arrJson = put('rc-array.json', '[{"format":"zlatura-backup"}]');
const pngJson = put('rc-photo.json', PNG);
// a PDF of 501 pages (blank page objects, the smallest valid file), made here
const objs = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Count 501 /Kids [${Array.from({ length: 501 }, (_, i) => `${i + 3} 0 R`).join(' ')}] >>`, ...Array.from({ length: 501 }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>')];
let pdf = '%PDF-1.4\n'; const offs = [];
objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
const xref = pdf.length;
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const pages501 = put('rc-501pages.pdf', pdf);

// a deal to protect
await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.setInputFiles('#om-file', F + 'om-retail.pdf');
await page.waitForSelector('#deal-crm #deal-stage');
await page.waitForTimeout(800);
const before = await deals();
check('there is a deal to protect', JSON.parse(before).length === 1, before);

// 1. the OM reader
await page.setInputFiles('#om-file', bigPdf);
let t = await said(/rc-huge\.pdf” can’t be read/);
check('OM: an oversized PDF is refused, naming the file', t.some((x) => /“rc-huge\.pdf” can’t be read: it is 150(\.\d)? MB; a PDF is read up to 150 MB/.test(x)), JSON.stringify(t));
await page.setInputFiles('#om-file', pngPdf);
t = await said(/rc-photo\.pdf” can’t be read/);
check('OM: a photo named .pdf is refused as a photo', t.some((x) => /“rc-photo\.pdf” can’t be read: it is a photo, not a PDF/.test(x)), JSON.stringify(t));
await page.setInputFiles('#om-file', pages501);
t = await said(/501 pages/);
check('OM: a 501-page PDF is refused with a plain message', t.some((x) => /rc-501pages\.pdf can’t be read: it has 501 pages; 500 is the most to read at once/.test(x)), JSON.stringify(t));
check('OM: the deals are untouched', (await deals()) === before);

// 2. the rent roll PDF reader
await page.click('#tab-rentroll');
await page.waitForTimeout(400);
await page.locator('#deal-rentroll button[aria-label="More rent roll actions"]').click();
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.action-sheet .action-item', { hasText: 'Import from PDF' }).click()]);
await chooser.setFiles(bigPdf);
t = await said(/rc-huge\.pdf” can’t be read/);
check('rent roll PDF: an oversized PDF is refused, naming the file', t.some((x) => /“rc-huge\.pdf” can’t be read: it is 150(\.\d)? MB/.test(x)), JSON.stringify(t));
check('rent roll PDF: nothing stored', (await deals()) === before);

// 3. the Comps readers: CoStar PDFs, a project file, the Excel template
await page.goto(BASE + '#comps', { waitUntil: 'load' });
await page.setInputFiles('#file', bigPdf);
t = await said(/rc-huge\.pdf” can’t be read/);
check('Comps: an oversized CoStar PDF is refused, naming the file', t.some((x) => /“rc-huge\.pdf” can’t be read: it is 150(\.\d)? MB/.test(x)), JSON.stringify(t));
await page.setInputFiles('#file', arrJson);
t = await said(/rc-array\.json” can’t be read/);
check('Comps: a JSON array named as a project is refused', t.some((x) => /“rc-array\.json” can’t be read: it is not a backup or project file/.test(x)), JSON.stringify(t));
await page.setInputFiles('#file', pngJson);
t = await said(/rc-photo\.json” can’t be read/);
check('Comps: a photo named .json is refused', t.some((x) => /“rc-photo\.json” can’t be read: it is not a backup or project file/.test(x)), JSON.stringify(t));
await page.setInputFiles('#tpl-file', pngXlsx);
t = await said(/rc-photo\.xlsx” can’t be read/);
check('Comps: a photo named .xlsx is refused as the template', t.some((x) => /“rc-photo\.xlsx” can’t be read: it is a photo, not an Excel workbook/.test(x)), JSON.stringify(t));
check('Comps: nothing was changed', (await deals()) === before);

// 4. backup restore
await page.goto(BASE + '#settings', { waitUntil: 'load' });
await page.waitForSelector('#settings-data #backup-file', { state: 'attached' });
for (const [f, re] of [[arrJson, /“rc-array\.json” can’t be read: it is not a backup or project file/], [pngJson, /“rc-photo\.json” can’t be read: it is not a backup or project file/]]) {
  await page.setInputFiles('#backup-file', f);
  t = await said(re);
  check(`backup: ${f.split('/').pop()} is refused before anything is read or changed`, t.some((x) => re.test(x)) && !(await page.locator('.action-sheet').count()), JSON.stringify(t));
}
check('backup: the deals are untouched', (await deals()) === before);

// 5. a real 121-page OM still reads
await page.goto(BASE + '#deal', { waitUntil: 'load' });
if (fs.existsSync(F + 'om-large.pdf')) {
  await page.setInputFiles('#om-file', F + 'om-large.pdf');
  t = await said(/^Read 121 pages/, 60000);
  check('a real 121-page OM still reads', t.some((x) => /^Read 121 pages/.test(x)), JSON.stringify(t));
}

check('no console errors', errors.length === 0, errors.join(' / '));
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'reader-caps', errors);
await browser.close();
