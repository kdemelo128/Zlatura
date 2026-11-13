/* Opening and closing the Underwrite tab is fast (owner report: both felt slow).
 *   - the tool's frame is loaded once the app has settled and the browser is idle (the view is hidden), so the first open is
 *     a reveal; reopening and closing never reload it;
 *   - budgets at desktop size, unthrottled: first open under 1.5 s, reopen under 300 ms, close under 300 ms. Phone size and
 *     a 4x slower CPU are measured and printed, and held to looser limits (they are numbers for the report, not a promise).
 *   Times are from the hash change to "the frame is shown, no skeleton, the page is full screen" and two painted frames
 *   (the close: to the previous screen showing). Headless Chromium draws WebGL in software, which the tool's 3D bird makes slow
 *   after it is shown; that is not in these numbers.
 *
 *   node uwtool-perf-flow.mjs        # BASE=http://localhost:8080/ by default */
import { chromium, BASE, finish } from './lib.mjs';

const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const out = {};

for (const [size, vp, mobile] of [['desktop', { width: 1280, height: 860 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  for (const throttle of [1, 4]) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(`${BASE}#home`, { waitUntil: 'load' });
    if (throttle === 1) {
      // nothing has been asked for yet: the frame exists but has not been given an address, then it loads on its own
      const at0 = await page.evaluate(() => { const f = document.querySelector('#uwt-frame'); return { exists: !!f, src: !!(f && f.src) }; });
      check(`${size}: the tool's frame is built hidden at start-up, with nothing fetched yet`, at0.exists && !at0.src, JSON.stringify(at0));
    }
    await page.waitForFunction(() => { const f = document.querySelector('#uwt-frame'); return f && f.src && !f.classList.contains('uwt-wait') && !document.querySelector('.uwt-skel') && f.contentDocument && f.contentDocument.readyState === 'complete'; }, null, { timeout: 30000 })
      .then(() => check(`${size} x${throttle}: with no action from the broker the tool preloads on Home, once the app is idle`, true), (e) => check(`${size} x${throttle}: the tool preloads on Home once the app is idle`, false, String(e.message).split('\n')[0]));
    await page.waitForTimeout(800);
    if (throttle > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
    const open = () => page.evaluate(() => new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        const f = document.querySelector('#uwt-frame');
        if (f && f.offsetParent && !document.querySelector('.uwt-skel') && !f.classList.contains('uwt-wait') && document.body.classList.contains('uw-full')) requestAnimationFrame(() => requestAnimationFrame(() => res(Math.round(performance.now() - t0))));
        else if (performance.now() - t0 > 30000) res(-1); else requestAnimationFrame(tick);
      };
      location.hash = '#underwrite'; tick();
    }));
    const close = () => page.evaluate(() => new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        if (!document.body.classList.contains('uw-full') && !!document.querySelector('#view-home:not([hidden])')) requestAnimationFrame(() => requestAnimationFrame(() => res(Math.round(performance.now() - t0))));
        else if (performance.now() - t0 > 10000) res(-1); else requestAnimationFrame(tick);
      };
      location.hash = '#home'; tick();
    }));
    await page.evaluate(() => { window.__same = document.querySelector('#uwt-frame'); window.__loads = 0; document.addEventListener('uwtoolload', () => { window.__loads++; }); });
    const first = await open();
    await page.waitForTimeout(1500);
    const c1 = await close();
    await page.waitForTimeout(1200);
    const re = await open();
    await page.waitForTimeout(800);
    const c2 = await close();
    const kept = await page.evaluate(() => ({ same: document.querySelector('#uwt-frame') === window.__same, loads: window.__loads }));
    out[`${size} x${throttle}`] = { firstOpen: first, close: c1, reopen: re, close2: c2, ...kept };
    const lim = throttle === 1 ? { first: size === 'desktop' ? 1500 : 2000, re: 300, close: 300 } : { first: 3000, re: 1000, close: 1000 };
    check(`${size} x${throttle}: first open ${first} ms (under ${lim.first})`, first > 0 && first < lim.first);
    check(`${size} x${throttle}: reopen ${re} ms (under ${lim.re})`, re > 0 && re < lim.re);
    check(`${size} x${throttle}: close ${c1} ms and ${c2} ms (under ${lim.close})`, c1 > 0 && c1 < lim.close && c2 > 0 && c2 < lim.close);
    check(`${size} x${throttle}: opening and closing never reloads the tool (same frame, no new load)`, kept.same && kept.loads === 0, JSON.stringify(kept));
    await browser.close();
  }
}
console.log('NUMBERS', JSON.stringify(out));
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', []);
