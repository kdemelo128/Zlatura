/* Make tests/fixtures/backup-4.7.4-before-om-statement.json with the real
 * 4.7.4 app, taken from git (7c9224c): two deals read from the suite's
 * invented OMs (tests/e2e/make_pdfs.py) by the version before operating
 * statements were read as tables: the retail OM, and the statement OM whose
 * Per Unit column 4.7.4 read as totals. Neither has `omRead`, and their
 * sources have no row, column or cell; 4.7.5 must keep them exactly as saved
 * (old deals are not read again), with no migration step needed.
 *
 *   python3 tests/e2e/make_pdfs.py tests/e2e/files   (after node tests/e2e/dump-pages.mjs tests/e2e/files/pages.json)
 *   node tests/tools/make-backup-4.7.4.mjs [out.json]
 *
 * Needs Chromium with Playwright (as tests/e2e). Run once; the file is kept. */
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import { chromium } from '../e2e/lib.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const F = `${ROOT}tests/e2e/files/`;
const OUT = process.argv[2] || `${ROOT}tests/fixtures/backup-4.7.4-before-om-statement.json`;
const PORT = Number(process.env.OLD_PORT || 8098);
const URL0 = `http://localhost:${PORT}/`;
const V474 = '7c9224c';

const tmp = fs.mkdtempSync(`${os.tmpdir()}/old-474-`);
execFileSync('sh', ['-c', `git -C "${ROOT}" archive ${V474} | tar -x -C "${tmp}"`]);
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', tmp], { stdio: 'ignore' });
process.on('exit', () => { server.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });
for (let i = 0; i < 50; i++) { try { await fetch(URL0); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error(`[4.7.4] ${e.message}`));
await page.goto(`${URL0}#deal`, { waitUntil: 'load' });
const sheetAction = (label) => page.locator('.action-sheet .action-item', { hasText: label }).first().click();
for (const [i, file] of ['om-retail.pdf', 'om-stmt-qc.pdf'].entries()) {
  if (i) { await page.click('#deal-root .view-head button[aria-label="More deal actions"]'); await sheetAction('Scan another OM'); await page.waitForTimeout(200); }
  await page.setInputFiles('#om-file', F + file);
  await page.waitForSelector('#deal-tiles .tile');
  await page.waitForTimeout(800); // the debounced save
}
await page.goto(`${URL0}#settings`, { waitUntil: 'load' });
await page.waitForSelector('#settings-data #backup-make', { timeout: 15000 });
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#backup-make')]);
await dl.saveAs(OUT);
await browser.close();
const j = JSON.parse(fs.readFileSync(OUT, 'utf8'));
for (const d of j.deals) console.log(`${d.name || d.figures.address}: ${(d.rentRoll || []).length} OM rows, rr ${d.rr ? 'yes' : 'no'}, rrQc ${d.rrQc ? 'yes' : 'no'}, omRead ${d.omRead ? 'yes' : 'no'}, noi ${d.figures.noi}, schema ${d.schema ?? 'none'}, moneyVersion ${d.moneyVersion ?? 'none'}, source ${d.source}`);
process.exit(0);
