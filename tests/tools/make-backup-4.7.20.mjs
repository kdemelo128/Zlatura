/* Make tests/fixtures/backup-4.7.20-before-pdf-roll.json with the real 4.7.20 app, taken from git (7f25b05): two
 * deals made before a rent roll could come from a PDF of its own: one read from the suite's invented retail OM
 * (its leases' source is 'om'), one by hand with units imported from an invented CSV (source 'import').
 * 4.7.21 adds schema step 4 ("rr-pdf-source") for the new lease source kind 'pdf'; the step must leave these
 * deals exactly as saved, apart from the version field.
 *
 *   node tests/e2e/dump-pages.mjs tests/e2e/files/pages.json && python3 tests/e2e/make_pdfs.py tests/e2e/files
 *   node tests/tools/make-backup-4.7.20.mjs [out.json]
 *
 * Needs Chromium with Playwright (as tests/e2e). Run once; the file is kept. */
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import { chromium } from '../e2e/lib.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const F = `${ROOT}tests/e2e/files/`;
const OUT = process.argv[2] || `${ROOT}tests/fixtures/backup-4.7.20-before-pdf-roll.json`;
const PORT = Number(process.env.OLD_PORT || 8099);
const URL0 = `http://localhost:${PORT}/`;
const V4720 = '7f25b05';

const tmp = fs.mkdtempSync(`${os.tmpdir()}/old-4720-`);
execFileSync('sh', ['-c', `git -C "${ROOT}" archive ${V4720} | tar -x -C "${tmp}"`]);
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', tmp], { stdio: 'ignore' });
process.on('exit', () => { server.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });
for (let i = 0; i < 50; i++) { try { await fetch(URL0); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

const csv = 'Suite,Tenant,Square Feet,Lease Start,Lease Expiration,Annual Base Rent\n101,"Acme, Inc.",1500,2024-01-01,2029-12-31,"$45,000"\n102,Vacant,800,,,\n103,Beta LLC,1200,03/01/2025,02/28/2030,38400\n';
fs.writeFileSync(`${F}import-rr-4720.csv`, csv);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error(`[4.7.20] ${e.message}`));
// 1. a deal read from an OM
await page.goto(`${URL0}#deal`, { waitUntil: 'load' });
await page.setInputFiles('#om-file', F + 'om-retail.pdf');
await page.waitForSelector('#deal-tiles .tile');
await page.waitForTimeout(900);
// 2. a deal by hand, units imported from a CSV
await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
await page.waitForTimeout(500);
await page.click('#tab-rentroll');
await page.locator('#deal-rentroll button[aria-label="More rent roll actions"]').click();
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.action-sheet .action-item', { hasText: 'Import from Excel or CSV' }).click()]);
await chooser.setFiles(`${F}import-rr-4720.csv`);
await page.waitForSelector('#sheet-body .map-row');
await page.click('#sheet-foot .btn-primary');
await page.waitForTimeout(1200);
await page.goto(`${URL0}#settings`, { waitUntil: 'load' });
await page.waitForSelector('#settings-data #backup-make', { timeout: 15000 });
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#backup-make')]);
await dl.saveAs(OUT);
await browser.close();
const j = JSON.parse(fs.readFileSync(OUT, 'utf8'));
for (const d of j.deals) console.log(`${d.name || (d.figures && d.figures.address) || '(unnamed)'}: schema ${d.schema}, ${d.rr ? d.rr.leases.length : 0} leases, sources ${[...new Set((d.rr ? d.rr.leases : []).map((L) => L.source && L.source.kind))].join(',')}`);
fs.rmSync(`${F}import-rr-4720.csv`, { force: true });
process.exit(0);
