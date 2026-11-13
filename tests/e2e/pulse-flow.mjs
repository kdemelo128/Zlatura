/* Home's pulse panel and Customise Home (app/pulse.js, app/pulseui.js), at 320 px, phone and desktop size, light and dark:
 *  - with no deals the panel says so honestly (no figures, a dashed outline), and axe finds nothing;
 *  - with 30 invented deals it draws a bar per active stage from the data, the chips count the person's own tasks, and moving
 *    a deal to another stage changes the bars;
 *  - the chart switch keeps its choice across a reload; Customise Home hides, orders and resets panels, kept across a reload;
 *  - reduced motion and the Motion switch stop every animation; the bird takes no click; every control is 44 px;
 *  - it also draws in Classic, and makes no network request outside the app. */
import { createRequire } from 'node:module';
import { phone, BASE, finish } from './lib.mjs';
import { seedPulse } from './pulse-seed.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const SIZES = [
  ['w320', { viewport: { width: 320, height: 700 } }],
  ['phone', {}],
  ['desktop', { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }],
];
async function axe(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } } })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  check(`${label}: axe finds nothing`, v.length === 0, v.join('\n    '));
}
const load = async (page) => { await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#home-pulse', { timeout: 15000 }); await page.waitForTimeout(400); };
const rows = (page) => page.$$eval('#home-pulse .pulse-row', (r) => r.map((x) => x.querySelector('.pulse-label').textContent + '|' + x.querySelector('.pulse-val').textContent));
const setLook = (page, v) => page.evaluate(async (x) => (await import('./app/look.js')).setLook(x), v);

for (const [size, opts] of SIZES) {
  for (const scheme of size === 'phone' ? ['light', 'dark'] : ['light']) {
    const label = `${size}/${scheme}`;
    const { browser, page, errors } = await phone({ ...opts, colorScheme: scheme });
    const external = [];
    page.on('request', (r) => { if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(BASE).origin) external.push(r.url()); });
    try {
      await page.goto(BASE + '#home', { waitUntil: 'load' });
      await setLook(page, 'new');
      await load(page);

      // ---- no deals: honest empty state
      const emptyText = await page.textContent('#home-pulse .pulse-empty');
      check(`${label}: no deals says so and invites the first one`, /Add your first deal to see your pipeline move/.test(emptyText), emptyText);
      check(`${label}: the empty panel draws no bars and no figures`, (await page.locator('#home-pulse .pulse-row, #home-pulse .pulse-col').count()) === 0 && (await page.locator('#home-pulse .pulse-ghost').getAttribute('aria-hidden')) === 'true');
      await axe(page, `${label} empty`);

      // ---- invented deals
      await seedPulse(page);
      await load(page);
      const r = await rows(page);
      check(`${label}: a bar per active stage that has deals (7 of 8 stages are used; closed is not the pipeline)`, r.length === 7 && r[0].startsWith('Prospect|4'), r.join(' ; '));
      const w = await page.$$eval('#home-pulse .pulse-bar', (b) => b.map((x) => parseFloat(x.style.width)));
      check(`${label}: the longest bar is the biggest stage, the others are shorter`, Math.max(...w) === 100 && w.some((x) => x < 100) && w.every((x) => x >= 3), w.join(','));
      const chips = await page.$$eval('#home-pulse .pulse-chip', (c) => c.map((x) => x.textContent.trim()));
      check(`${label}: the chips count the person's own tasks (2 overdue, none due today, none in the next 7 days, nothing to file)`, chips.join(',') === '0 due today,2 overdue,0 next 7 days,0 to file', chips.join(','));
      check(`${label}: the unpriced deals are said to be counted, not sized`, /6 unpriced deals are counted, not sized/.test(await page.textContent('#home-pulse .pulse-note')));
      const lab = await page.getAttribute('#home-pulse .pulse-stage', 'aria-label');
      check(`${label}: the chart has a text equivalent`, /Active deals by stage: Prospect 4 deals/.test(lab), lab);

      // layout: below the greeting on a phone, to its right on a desktop; never sideways
      const geo = await page.evaluate(() => { const h = document.querySelector('.home-head h1').getBoundingClientRect(); const p = document.querySelector('#home-pulse').getBoundingClientRect(); return { h1b: h.bottom, h1r: h.right, pt: p.top, pl: p.left, pr: p.right, over: document.documentElement.scrollWidth - innerWidth, vw: innerWidth }; });
      if (size === 'desktop') check(`${label}: the panel sits in the top right, beside the greeting`, geo.pl > geo.h1r && geo.pt < geo.h1b + 80 && geo.pr <= geo.vw, JSON.stringify(geo));
      else check(`${label}: the panel stacks below the greeting inside the screen`, geo.pt > geo.h1b && geo.pl >= 0 && geo.pr <= geo.vw && geo.over <= 0, JSON.stringify(geo));

      // ---- touch size
      const small = await page.evaluate(() => [...document.querySelectorAll('#home-pulse button')].filter((b) => { const q = b.getBoundingClientRect(); return q.width < 43.5 || q.height < 43.5; }).map((b) => b.textContent));
      check(`${label}: every pulse control is at least 44 px`, small.length === 0, small.join(','));
      await axe(page, `${label} with deals`);

      // ---- the bird takes no click
      const bird = await page.evaluate(() => { const b = document.querySelector('#home-pulse .pulse-bird'); const q = b.getBoundingClientRect(); const top = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return { pe: getComputedStyle(b).pointerEvents, hit: top ? top.closest('.pulse-bird') !== null : false, hasSvg: b.querySelector('svg.monal-art')?.namespaceURI === 'http://www.w3.org/2000/svg' && b.querySelectorAll('.mn-lid')[0]?.namespaceURI === 'http://www.w3.org/2000/svg', hidden: b.getAttribute('aria-hidden') }; });
      check(`${label}: the bird is drawn from the shared monal artwork and takes no pointer`, bird.hasSvg && bird.pe === 'none' && !bird.hit && bird.hidden === 'true', JSON.stringify(bird));

      // ---- a stage change shows in the bars
      const before = await rows(page);
      await page.evaluate(async () => {
        const store = await import('./app/store.js');
        for (const d of (await store.listDeals()).filter((x) => x.stage === 'prospect')) { d.stage = 'closed'; await store.saveDeal(d); }
      });
      await page.evaluate(() => { location.hash = '#settings'; }); await page.waitForSelector('#view-settings', { state: 'visible' });
      await page.evaluate(() => { location.hash = '#home'; }); await page.waitForSelector('#home-pulse');
      await page.waitForFunction(() => !/^Prospect/.test(document.querySelector('#home-pulse .pulse-row')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
      const after = await rows(page);
      check(`${label}: moving the Prospect deals to Closed takes Prospect out of the bars`, before[0].startsWith('Prospect') && after.length === 6 && !after.some((x) => x.startsWith('Prospect')), `${before.length} -> ${after.length}`);
      await page.evaluate(async () => { const store = await import('./app/store.js'); for (const d of (await store.listDeals()).filter((x) => x.stage === 'closed' && x.id.startsWith('pl-fixture-'))) { d.stage = 'prospect'; await store.saveDeal(d); } });

      if (size !== 'phone') { check(`${label}: no request left the app`, external.length === 0, external.join(' ')); check(`${label}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | ')); continue; }

      // ---- the chart switch
      await load(page);
      await page.click('#home-pulse .pulse-pick:has-text("Deals")');
      await page.waitForSelector('#home-pulse .pulse-pick[aria-pressed="true"]:has-text("Deals")');
      check(`${label}: Deals draws 12 weekly columns and the total from the person's deals`, (await page.locator('#home-pulse .pulse-col').count()) === 12 && /^30 deals added in 12 weeks/.test((await page.textContent('#home-pulse .pulse-big')).trim()));
      await page.click('#home-pulse .pulse-pick:has-text("Tasks")');
      await page.waitForSelector('#home-pulse .pulse-pick[aria-pressed="true"]:has-text("Tasks")');
      check(`${label}: Tasks counts the 4 tasks finished in the last 12 weeks`, /^4 tasks done in 12 weeks/.test((await page.textContent('#home-pulse .pulse-big')).trim()), await page.textContent('#home-pulse .pulse-stage'));
      await load(page);
      check(`${label}: the chart choice is kept across a reload`, (await page.getAttribute('#home-pulse .pulse-pick:has-text("Tasks")', 'aria-pressed')) === 'true');
      await page.click('#home-pulse .pulse-pick:has-text("Pipeline")');

      // ---- Customise Home
      const order0 = await page.$$eval('.bento > *', (n) => n.map((x) => x.id || x.querySelector('[id]')?.id));
      await page.click('.home-cust');
      await page.waitForSelector('.cust-panel');
      const small2 = await page.evaluate(() => [...document.querySelectorAll('dialog[open] button, dialog[open] label.cust-row')].filter((b) => { const q = b.getBoundingClientRect(); return q.height < 43.5 && q.width > 0; }).map((b) => b.textContent.trim()));
      check(`${label}: the Customise Home controls are 44 px`, small2.length === 0, small2.join(','));
      await page.waitForTimeout(500); // the sheet fades in; axe reads colours mid-fade otherwise
      await axe(page, `${label} customise sheet`);
      await page.click('[aria-label="Move up: Tasks"]');
      await page.locator('.cust-panel', { hasText: 'Pipeline' }).locator('input[type=checkbox]').uncheck();
      await page.locator('input[name=cust-chart][value=deals]').check();
      await page.click('#sheet-foot .btn, dialog[open] .sheet-head .btn', { timeout: 3000 }).catch(() => page.keyboard.press('Escape'));
      await page.waitForTimeout(400);
      check(`${label}: hiding Pipeline removes it from Home and the chart choice applies`, (await page.locator('#home-pipeline').count()) === 0 && (await page.getAttribute('#home-pulse .pulse-pick:has-text("Deals")', 'aria-pressed')) === 'true');
      await load(page);
      const order1 = await page.$$eval('.bento > *', (n) => n.map((x) => x.id || x.querySelector('[id]')?.id));
      const iTasks = order1.indexOf('home-tasks'); const iAct = order1.indexOf('home-activity');
      check(`${label}: the hidden panel and the new order are kept across a reload`, order1.indexOf('home-pipeline') === -1 && iTasks > -1 && order0.indexOf('home-tasks') > order1.indexOf('home-tasks') && (await page.getAttribute('#home-pulse .pulse-pick:has-text("Deals")', 'aria-pressed')) === 'true', `${order0.join(',')} -> ${order1.join(',')}`);
      await page.click('.home-cust'); await page.waitForSelector('.cust-reset');
      check(`${label}: a hidden panel stays listed, unchecked, so it can come back`, !(await page.locator('.cust-panel', { hasText: 'Pipeline' }).locator('input[type=checkbox]').isChecked()));
      await page.click('.cust-reset'); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
      const order2 = await page.$$eval('.bento > *', (n) => n.map((x) => x.id || x.querySelector('[id]')?.id));
      check(`${label}: Reset brings back today's Home`, order2.join() === order0.join() && (await page.evaluate(() => localStorage.getItem('zlatura.home'))) === null, order2.join());
      await page.click('.home-cust'); await page.waitForSelector('.cust-panel');
      await page.locator('#cust-pulse').uncheck(); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      check(`${label}: the pulse panel can be turned off`, (await page.locator('#home-pulse').count()) === 0);
      await page.evaluate(() => localStorage.removeItem('zlatura.home')); await load(page);

      // ---- motion: on by default, off under reduced motion and under the Motion switch
      const anim = () => page.evaluate(() => { const g = (s, p) => getComputedStyle(document.querySelector(s), p).animationName; return { bird: g('#home-pulse .pulse-bird'), sheen: g('#home-pulse .pulse-bar', '::after'), blink: g('#home-pulse .pulse-bird .mn-lid') }; });
      const on = await anim();
      check(`${label}: the panel and the bird animate by default`, on.bird === 'pulse-bob' && on.sheen === 'pulse-sheen' && on.blink !== 'none', JSON.stringify(on));
      await page.evaluate(async () => (await import('./app/look.js')).setMotion(false));
      const off = await anim();
      check(`${label}: the Motion switch stops them`, off.bird === 'none' && off.sheen === 'none', JSON.stringify(off));
      await page.evaluate(async () => (await import('./app/look.js')).setMotion(true));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const red = await anim();
      check(`${label}: reduced motion stops them`, red.bird === 'none' && red.sheen === 'none', JSON.stringify(red));
      await page.emulateMedia({ reducedMotion: 'no-preference' });

      // ---- Classic keeps its look and gets the panel
      await setLook(page, 'classic'); await load(page);
      check(`${label}: Classic keeps its tiles and shows the panel with Customise Home`, (await page.locator('#home-root .home-tiles .tile').count()) === 4 && (await page.locator('#home-pulse .pulse-row').count()) === 7 && (await page.locator('.home-cust').count()) === 1);
      await axe(page, `${label} Classic`);
      check(`${label}: no request left the app`, external.length === 0, external.join(' '));
      check(`${label}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    } catch (e) { check(`${label}: ran to the end`, false, String(e).slice(0, 400)); } finally { await browser.close(); }
  }
}
for (const r of R) console.log(r.join(" | "));
finish(R);
