/* The deal page's OM upload (readOmFile) reads a multifamily rent roll with no tenant column, and a roll over several
 * pages, at phone and desktop size. Invented OMs (tests/om-roll-fixtures.js).
 *   1. a unit roll (Unit, Unit Type, Beds/Baths, SF, Market Rent, Current Rent, Lease Start/End, Status): six units, keyed by
 *      unit, no tenant names; the vacant unit has no rent (not zero); market rent never fills the rent; the rent column
 *      does not say monthly or annual, so the panel says how it was read; Building SF is offered (Use) and Undo puts it back;
 *   2. a 66-unit roll over six pages, the header on the first page only: every unit read, pages 2 to 7, the Total checked.
 * Fails on the old code: the unit roll is not read at all (no tenant column) and the long roll reads nothing. */
import { phone, BASE, finish } from './lib.mjs';
import { pdfOf } from '../rr-fixtures.js';
import * as F from '../om-roll-fixtures.js';
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const pdf = (name, pages) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(pdfOf(pages)) });
const prose = [{ x: 40, y: 740, s: 'Market Overview', size: 14, bold: true }, ...['The submarket is a stable neighbourhood with steady demand, a mix of local employers and good access', 'from two arterial roads. Several recent lease signings nearby show healthy demand for apartments, and the', 'surrounding blocks are fully built out with little new competing supply.'].map((s, i) => ({ x: 40, y: 724 - i * 14, s, size: 8 }))];
const mf = () => pdf('invented-riverside-court-om.pdf', [[{ x: 40, y: 740, s: 'Investment Summary', size: 14, bold: true }, { x: 40, y: 700, s: 'Asking Price', size: 10 }, { x: 300, y: 700, s: '$4,200,000', right: true, size: 10 }], prose, F.grid({ cols: F.MF_COLS, rows: F.MF_ROWS })]);
const long = () => pdf('invented-riverside-court-long-om.pdf', [...F.longRoll({ pages: 6, mode: 'bare' }), prose]);
const text = async (page, sel) => ((await page.locator(sel).count()) ? (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim() : '');
const deal = (page) => page.evaluate(async () => { const d = (await (await import('./app/dealui.js')).listAllDeals())[0]; return { leases: (d.rr && d.rr.leases) || [], page: d.rentRollPage, qc: d.rrQc ? { applied: d.rrQc.applied, pages: d.rrQc.pages, checks: d.rrQc.checks.map((c) => [c.level, c.kind, c.text]) } : null, bsf: d.figures.bsf ?? null }; });

for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined }]]) {
  // 1. the unit roll
  {
    const { browser, page, errors } = await phone(opts);
    try {
      await page.goto(BASE + '#deal', { waitUntil: 'load' });
      await page.setInputFiles('#om-file', mf());
      await page.waitForSelector('#deal-rr', { timeout: 20000 });
      await page.waitForFunction(() => /6 units/.test(document.querySelector('#deal-rr .card-head')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
      const head = await text(page, '#deal-rr .card-head');
      check(`${size}: the unit roll is read: six units from page 3`, /6 units · read from OM page 3/.test(head), head);
      const d = await deal(page);
      check(`${size}: keyed by unit, no tenant names`, JSON.stringify(d.leases.map((l) => l.unit)) === JSON.stringify(['101', '102', '103', '104', '105', '106']) && d.leases.every((l) => !l.tenant), JSON.stringify(d.leases.map((l) => [l.unit, l.tenant])));
      check(`${size}: the vacant unit is vacant with no rent (not zero)`, d.leases[3].vacant === true && d.leases[3].periods.length === 0, JSON.stringify(d.leases[3]));
      const rates = d.leases.flatMap((l) => l.periods.map((p) => p.rate));
      check(`${size}: the rent is the Current Rent as a year, never the Market Rent`, JSON.stringify(rates) === JSON.stringify([14400, 14700, 18900, 23880, 14520]), JSON.stringify(rates));
      check(`${size}: no market rent anywhere in the rent periods`, !JSON.stringify(d.leases).includes('1250') && !JSON.stringify(d.leases).includes('15000'));
      const qc = await text(page, '#deal-rr');
      check(`${size}: the panel says the rent column's period was worked out, not stated`, /doesn.t say monthly or annual/.test(qc), qc.slice(0, 400));
      // Building SF is offered, and filled only on Use; Undo puts it back
      check(`${size}: Building SF is offered, not filled`, (await page.locator('[data-offer="bsf"] button').count()) === 1 && (await page.inputValue('#fig-bsf')) === '');
      await page.locator('[data-offer="bsf"] button').click();
      await page.waitForFunction(() => document.getElementById('fig-bsf')?.value.replace(/[^\d]/g, '') === '4920', null, { timeout: 5000 }).catch(() => {});
      check(`${size}: Use fills Building SF with the six units' 4,920`, (await page.inputValue('#fig-bsf')).replace(/[^\d]/g, '') === '4920', await page.inputValue('#fig-bsf'));
      await page.locator('#deal-undo').click();
      await page.waitForFunction(() => document.getElementById('fig-bsf')?.value === '', null, { timeout: 5000 }).catch(() => {});
      check(`${size}: Undo puts Building SF back`, (await page.inputValue('#fig-bsf')) === '', await page.inputValue('#fig-bsf'));
      check(`${size}: nothing overflows`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      check(`${size}: no browser errors (unit roll)`, !errors.length, errors.join('\n'));
    } finally { await browser.close(); }
  }
  // 2. the long roll
  {
    const { browser, page, errors } = await phone(opts);
    try {
      await page.goto(BASE + '#deal', { waitUntil: 'load' });
      await page.setInputFiles('#om-file', long());
      await page.waitForFunction(() => /66 units/.test(document.querySelector('#deal-rr .card-head')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
      const head = await text(page, '#deal-rr .card-head');
      check(`${size}: all 66 units of the six pages are read, pages 2 to 7`, /66 units · read from OM pages 2–7/.test(head), head);
      const d = await deal(page);
      check(`${size}: first and last unit, no duplicates`, d.leases[0].unit === '101' && d.leases[65].unit === '166' && new Set(d.leases.map((l) => l.unit)).size === 66, `${d.leases[0] && d.leases[0].unit} ${d.leases[65] && d.leases[65].unit}`);
      check(`${size}: the Total row's SF is checked against the rows and passes`, !!d.qc && d.qc.checks.some((c) => c[1] === 'total' && c[0] === 'pass'), JSON.stringify(d.qc && d.qc.checks.filter((c) => c[1] === 'total')));
      check(`${size}: nothing held back by a failed check`, !!d.qc && d.qc.applied === true, JSON.stringify(d.qc && d.qc.applied));
      check(`${size}: no browser errors (long roll)`, !errors.length, errors.join('\n'));
    } finally { await browser.close(); }
  }
}
for (const r of R) console.log(r.join(' | '));
finish(R);
