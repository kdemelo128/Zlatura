/* Shared set-up for the browser workflows: an iPhone-sized Chromium page that
 * records console errors, failed requests and uncaught exceptions. */
import { createRequire } from 'module';

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not installed here */ }
  // the Claude Code cloud image ships it globally
  return createRequire('/opt/node-tools/node_modules/')('playwright');
}
const pw = await loadPlaywright();
const P = pw.chromium ? pw : pw.default;
/** The engine the flows run on: Chromium by default, `PW_BROWSER=webkit` (or firefox) where that engine is installed. */
export const ENGINE = process.env.PW_BROWSER || 'chromium';
export const chromium = P[ENGINE];
if (!chromium) throw new Error(`Unknown PW_BROWSER “${ENGINE}”: use chromium, webkit or firefox.`);
export const BASE = process.env.BASE || 'http://localhost:8080/';
export const SHOTS = new URL('./shots/', import.meta.url).pathname;

export async function phone(opts = {}) {
  // the fake camera and microphone are Chromium flags; other engines start plain
  const browser = await chromium.launch(ENGINE === 'chromium' ? { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] } : {});
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    acceptDownloads: true, ...opts,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));
  return { browser, ctx, page, errors };
}

// the end of every flow lives in its own module so `npm test` can check it without a browser
export { finish } from './finish.mjs';
