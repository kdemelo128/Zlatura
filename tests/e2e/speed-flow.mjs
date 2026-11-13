/* Speed budgets with 30 invented deals (Home pulse, screen switches, opening a deal, typing). Times are taken in the page from the
 * user's action to the frame after the result is on screen, so they include layout and paint. Desktop Chromium.
 *   - unthrottled (held): every screen switch under 100 ms (the median of three rounds: the first visit to a screen can be slower, and a loaded machine moves one round), opening a deal under 150 ms, every
 *     keystroke in a deal field settled under 50 ms, Home drawn within 1.5 s of a reload;
 *   - CPU slowed 4x (a mid-range phone; looser limits, and printed for the report): a switch under 400 ms, a keystroke under 100 ms.
 * Run after the app has settled (the tool's frame loads once idle, so the first seconds are left alone). RUNS is not used: three rounds. */
import { phone, BASE, finish } from './lib.mjs';
import { seedPulse } from './pulse-seed.mjs';

const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const VIEWS = ['home', 'deal', 'underwrite', 'comps', 'tools', 'connect', 'settings'];

for (const throttle of [1, 4]) {
  const { browser, page, ctx } = await phone({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 });
  try {
    await page.addInitScript(() => { window.__t = 0; new MutationObserver(() => { if (!window.__t && document.querySelector('#home-root h1')) window.__t = performance.now(); }).observe(document, { childList: true, subtree: true }); });
    await page.goto(`${BASE}#home`, { waitUntil: 'load' });
    await page.evaluate(async () => (await import('./app/look.js')).setLook('new'));
    await seedPulse(page, { n: 30 });
    const cdp = await ctx.newCDPSession(page);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__t, null, { timeout: 30000 });
    await page.waitForTimeout(4500); // the tool's frame loads once idle; measure after it
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    const L = throttle === 1 ? { sw: 100, open: 150, key: 50 } : { sw: 400, open: 600, key: 100 };
    const tag = throttle === 1 ? 'unthrottled' : '4x CPU';

    const sw = {};
    for (let round = 0; round < 3; round++) for (const v of VIEWS) {
      const ms = await page.evaluate(async (view) => {
        const e = document.querySelector(`.sidebar .tab[data-view="${view}"]`); const t0 = performance.now(); e.click();
        const ok = () => { const r = document.getElementById(`view-${view}`); return r && !r.hidden && getComputedStyle(r).display !== 'none' && r.getBoundingClientRect().height > 50; };
        while (!ok()) await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
        return performance.now() - t0;
      }, v);
      (sw[v] ||= []).push(Math.round(ms));
      await page.waitForTimeout(400);
    }
    for (const v of VIEWS) check(`${tag}: switching to ${v} takes under ${L.sw} ms (median of 3 rounds: ${sw[v].join(', ')})`, [...sw[v]].sort((a, b) => a - b)[1] < L.sw, sw[v].join(','));

    await page.click('.sidebar .tab[data-view="deal"]'); await page.waitForSelector('.dl-row[data-deal-id]'); await page.waitForTimeout(600);
    const open = await page.evaluate(async () => {
      const row = document.querySelector('.dl-row[data-deal-id] button, .dl-row[data-deal-id]'); const t0 = performance.now(); row.click();
      while (!document.querySelector('#deal-tiles .tile')) await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      return Math.round(performance.now() - t0);
    });
    check(`${tag}: opening a deal (30 saved) takes under ${L.open} ms`, open < L.open, `${open} ms`);
    await page.waitForTimeout(800);

    const field = page.locator('#deal-root input[type=text]:visible, #deal-root input:not([type]):visible, #deal-root input[type=number]:visible').first();
    check(`${tag}: a deal field is there to type in`, (await field.count()) > 0);
    if (await field.count()) {
      await field.click();
      await page.evaluate(() => { const el = document.activeElement; window.__lat = []; el.addEventListener('input', () => { const t0 = performance.now(); requestAnimationFrame(() => setTimeout(() => window.__lat.push(performance.now() - t0), 0)); }); });
      for (const ch of '1234567') { await page.keyboard.type(ch); await page.waitForTimeout(150); }
      const lat = (await page.evaluate(() => window.__lat)).map(Math.round);
      check(`${tag}: every keystroke settles under ${L.key} ms (${lat.join(', ')})`, lat.length === 7 && Math.max(...lat) < L.key, lat.join(','));
    }
    if (throttle === 1) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await page.evaluate(() => { location.hash = '#home'; });
      const t = await (async () => { await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__t, null, { timeout: 30000 }); return Math.round(await page.evaluate(() => window.__t)); })();
      check('unthrottled: Home is drawn within 1.5 s of a reload', t < 1500, `${t} ms`);
    }
    console.log(`SPEED ${tag}: ${JSON.stringify({ sw, open })}`);
  } catch (e) { check(`${throttle}x: ran to the end`, false, String(e).slice(0, 300)); } finally { await browser.close(); }
}
for (const r of R) console.log(r.join(' | '));
finish(R);
