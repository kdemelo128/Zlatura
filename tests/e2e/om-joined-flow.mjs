/* The deal page's OM upload reads a rent roll whose header words are run together ("LeaseEnd", "AnnualRent"): the lease
 * ends and annual rents land on the deal. Invented OM (tests/om-diag-fixtures.js). Checked on the deal page itself,
 * the path the owner's OMs take (readOmFile), at phone and desktop size. */
import { phone, BASE, finish } from './lib.mjs';
import { pdfFixture } from '../om-diag-fixtures.js';
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const file = { name: 'invented-joined-header-om.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdfFixture('joined')) };
for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined }]]) {
  const { browser, page, errors } = await phone(opts);
  try {
    await page.goto(BASE + '#deal', { waitUntil: 'load' });
    await page.setInputFiles('#om-file', file);
    await page.waitForSelector('#fig-price', { timeout: 20000 });
    await page.waitForFunction(() => document.getElementById('fig-price')?.value.replace(/[^\d.-]/g, '') === '3100000');
    const d = (await page.evaluate(async () => (await import('./app/dealui.js')).listAllDeals()))[0];
    const rows = d.rr?.leases || d.rentRoll || [];
    check(`${size}: the four units are read`, rows.length === 4, String(rows.length));
    const text = JSON.stringify(rows);
    check(`${size}: every lease end is read (none blank)`, rows.every((r) => /^20\d\d-\d\d-\d\d$/.test(r.leaseEnd || '')), text.slice(0, 200));
    check(`${size}: the annual rents are the printed ones`, ['60000', '42000', '36000', '54000'].every((v) => text.includes(v)), text.slice(0, 200));
    check(`${size}: the rent roll's source is page 2`, d.rentRollPage === 2, String(d.rentRollPage));
    check(`${size}: no browser errors`, !errors.length, errors.join('\n'));
  } finally { await browser.close(); }
}
for (const r of R) console.log(r.join(' | '));
finish(R);
