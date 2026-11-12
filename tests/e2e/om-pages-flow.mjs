/* A buried rent roll uses real PDF extraction and the normal intake/OM paths. */
import { phone, BASE, finish } from './lib.mjs';
import { buriedRollPdf } from '../pdfprofile-fixtures.js';
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const file = { name: 'invented-fourteen-page-om.pdf', mimeType: 'application/pdf', buffer: Buffer.from(buriedRollPdf()) };
for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined }]]) {
  const { browser, page, errors } = await phone(opts);
  try {
    // Use the intake's remembered view; the default native tool has its own flows.
    await page.addInitScript(() => sessionStorage.setItem('uw.view', 'quick'));
    await page.goto(BASE + '#underwrite', { waitUntil: 'load' });
    await page.waitForSelector('#uwi-files', { state: 'attached' });
    await page.setInputFiles('#uwi-files', file);
    await page.locator('#uw-intake .uwi-item').waitFor();
    const profile = page.locator('#uw-intake [data-page-profile]');
    const profiled = await profile.count() === 1;
    check(`${size}: the staged PDF exposes its page evidence`, profiled);
    if (!profiled) continue; // archived main has no per-page evidence
    check(`${size}: the rent-roll section is identified on page fourteen`, /Rent roll: page 14\b/.test(await profile.textContent()));
    check(`${size}: a real OM rent-roll section is not an OM-versus-lease type question`, await page.locator('#uw-intake [data-type]').count() === 0 && await page.locator('#uw-intake [data-use]').textContent() === 'Use as OM');
    const deals = () => page.evaluate(async () => (await import('./app/dealui.js')).listAllDeals());
    check(`${size}: automatic identification stores no deal`, (await deals()).length === 0);
    await page.goto(BASE + '#deal', { waitUntil: 'load' });
    await page.setInputFiles('#om-file', file);
    await page.waitForSelector('#fig-price');
    await page.waitForFunction(() => document.getElementById('fig-price')?.value.replace(/[^\d.-]/g, '') === '2000000');
    let d = (await deals())[0];
    const rows = d.rr?.leases || d.rentRoll || [];
    check(`${size}: the OM import keeps the independently expected price and six units`, d.figures.price === 2000000 && rows.length === 6);
    check(`${size}: the original PDF page is kept in the rent-roll source`, d.rentRollPage === 14 && d.rrQc.pages.includes(14));
    check(`${size}: page classification does not add a saved deal field`, !Object.hasOwn(d, 'pageProfiles'));
    await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#fig-price');
    d = (await deals())[0];
    check(`${size}: the rent roll and original page survive reload`, (d.rr?.leases || d.rentRoll || []).length === 6 && d.rentRollPage === 14);
    check(`${size}: no browser errors`, !errors.length, errors.join('\n'));
  } finally { await browser.close(); }
}
for (const r of R) console.log(r.join(' | '));
finish(R);
