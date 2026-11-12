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
  // Settings keeps every group but Appearance closed. Most flows go straight to a control in one (backups, conventions,
  // About), so each Settings group is opened as it is drawn; ui-fixes-flow and settings-groups-flow set window.__keepGroups
  // to see the real, collapsed page.
  await ctx.addInitScript(() => {
    new MutationObserver(() => {
      if (window.__keepGroups) return;
      document.querySelectorAll('details.set-group:not([open]):not([data-user])').forEach((d) => { d.open = true; });
      // Home and Deal folds (fold.js) are opened the same way, without being remembered; flows that test the folds set __keepGroups
      document.querySelectorAll('.fold-btn[aria-expanded="false"]:not([data-user])').forEach((b) => {
        b.setAttribute('aria-expanded', 'true');
        const body = document.getElementById(b.getAttribute('aria-controls')); if (body) body.hidden = false;
        const sum = b.closest('.fold-head, .card-head')?.querySelector('.fold-sum'); if (sum) sum.hidden = true;
        b.closest('.fold')?.classList.remove('folded');
      });
    }).observe(document, { childList: true, subtree: true });
  });
  const page = await ctx.newPage();
  const errors = [];
  // Chrome notes that the built-in tool's same-origin frame could lift its own sandbox: known and by design (the tool's own content policy is the control), so it is not counted; nor are the software graphics driver's speed notes about the tool's animation
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/can escape its sandboxing|GL Driver Message/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  // the built-in tool's own files, and the fonts its frame asks for, are cancelled when a test leaves its view before the frame has loaded: not a fault
  page.on('requestfailed', (r) => { if (!(/\/app\/uwtool\/|\/fonts\/ibm-plex-/.test(r.url()) && /ERR_ABORTED/.test(r.failure()?.errorText || ''))) errors.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`); });
  return { browser, ctx, page, errors };
}

// the end of every flow lives in its own module so `npm test` can check it without a browser
export { finish } from './finish.mjs';
