/* Home, New look: the "Ask Monal" bar under the greeting, the summary as one calm card strip, and no floating control
 * covering Home's content on a phone. Desktop 1366x860 and phone 390x844. Classic Home has no ask bar. Invented data only. */
import { phone, BASE, finish } from './lib.mjs';
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const sizes = [
  ['desktop', { viewport: { width: 1366, height: 860 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }],
  ['phone', { viewport: { width: 390, height: 844 } }],
];
const QUESTION = 'What is the cap rate on this deal?';
for (const [size, opts] of sizes) {
  const { browser, page, errors } = await phone(opts);
  const covered = () => page.evaluate(() => {
    const fx = [...document.querySelectorAll('body *')].filter((e) => { const c = getComputedStyle(e); return c.position === 'fixed' && c.visibility !== 'hidden' && !e.matches('.tabbar') && e.getBoundingClientRect().width > 0; });
    const tab = document.querySelector('.tabbar'); const tabTop = tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect().top : innerHeight;
    const hit = [];
    for (const b of document.querySelectorAll('#view-home button, #view-home a[href], #view-home label.btn, #view-home input:not([type=hidden]):not([type=file]), #view-home select')) {
      const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
      if (!r.width || !r.height || cs.visibility === 'hidden' || r.bottom <= 0 || r.top >= tabTop) continue;
      for (const f of fx) { const q = f.getBoundingClientRect(); if (!(q.right <= r.left || q.left >= r.right || q.bottom <= r.top || q.top >= r.bottom)) hit.push(`${String(f.className || f.id)} over "${(b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 24)}"`); }
    }
    return { floating: fx.map((f) => String(f.className || f.id)), hit };
  });
  try {
    const look = (v) => page.evaluate(async (x) => { (await import(new URL('app/look.js', location.href).href)).setLook(x); }, v);
    const go = async (v) => { await page.evaluate((x) => { location.hash = `#${x}`; }, v); await page.waitForSelector(`#view-${v}`, { state: 'visible' }); await page.waitForTimeout(500); };
    await page.goto(BASE + '#home', { waitUntil: 'load' });
    await page.waitForSelector('#home-root h1');
    await look('new');
    await go('settings'); await go('home');
    if (size === 'phone') {
      // the first screen of a new user's Home (no deals): the bird button must not sit over a button or link
      await page.waitForSelector('.home-ask');
      const c = await covered();
      check('phone: at the top of the page (no deals), no floating control covers a button or link in Home', c.hit.length === 0, JSON.stringify(c));
    }
    // a deal, so the figures are not all zero
    await go('deal');
    await page.evaluate(() => [...document.querySelectorAll('#deal-root button')].find((x) => /fictional example/.test(x.textContent))?.click());
    await page.waitForSelector('#deal-crm #deal-stage', { timeout: 20000 });

    // ---- Classic: no ask bar; remember its four tile figures
    await look('classic');
    await go('settings'); await go('home');
    check(`${size}: Classic Home has no ask bar`, (await page.locator('.home-ask, #home-ask-input').count()) === 0);
    const tiles = await page.$$eval('#home-root .home-tiles .tile .v', (v) => v.map((x) => x.textContent.trim()));
    check(`${size}: Classic Home has four tile figures`, tiles.length === 4, tiles.join('|'));

    // ---- New look
    await look('new');
    await go('settings'); await go('home');
    await page.waitForSelector('.home-ask');
    const bar = await page.evaluate(() => {
      const f = document.querySelector('.home-ask'), i = document.getElementById('home-ask-input'), b = f.querySelector('button[type=submit]');
      const lab = document.querySelector('label[for="home-ask-input"]'), g = document.querySelector('#home-root h1').getBoundingClientRect(), r = f.getBoundingClientRect();
      const ib = i.getBoundingClientRect(), bb = b.getBoundingClientRect();
      return { label: lab && lab.textContent, ph: i.placeholder, mark: !!f.querySelector('[data-brand-mark] svg use'), ib: [ib.width, ib.height], bb: [bb.width, bb.height], below: r.top >= g.bottom, near: r.top - g.bottom < 260 };
    });
    check(`${size}: the ask bar has a label "Ask Monal" and the ${size === 'phone' ? 'short' : 'long'} placeholder`, bar.label === 'Ask Monal' && bar.ph === (size === 'phone' ? 'Ask Monal anything' : 'Ask about a deal, a document, or the market'), JSON.stringify(bar));
    check(`${size}: the ask bar shows the brand mark`, bar.mark);
    check(`${size}: the input and the button are 44 px targets`, bar.ib[1] >= 43.5 && bar.bb[0] >= 43.5 && bar.bb[1] >= 43.5, JSON.stringify(bar));
    check(`${size}: the ask bar sits under the greeting`, bar.below && bar.near, JSON.stringify(bar));

    // an empty question only opens the panel
    await page.locator('.home-ask button[type=submit]').click();
    await page.waitForSelector('dialog.assist[open]');
    check(`${size}: an empty question just opens the panel`, (await page.locator('.assist-me').count()) === 0);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.assist[open]'));

    // typing, character by character, then Enter
    await page.locator('#home-ask-input').click();
    await page.keyboard.type(QUESTION, { delay: 15 });
    check(`${size}: typing fills the input`, (await page.inputValue('#home-ask-input')) === QUESTION);
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog.assist[open]');
    await page.waitForFunction(() => document.querySelectorAll('.assist-answer').length > 0);
    const asked = await page.$$eval('.assist-me', (n) => n.map((x) => x.textContent));
    check(`${size}: Enter opens the bird panel and asks that question`, asked.length === 1 && asked[0] === QUESTION, asked.join('|'));
    check(`${size}: the bar is cleared after asking`, (await page.inputValue('#home-ask-input')) === '');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.assist[open]'));

    // ---- the strip: the same four figures as Classic's tiles, in one card
    const strip = await page.evaluate(() => {
      const s = document.querySelector('.home-sumline'); if (!s) return null;
      const cells = [...s.querySelectorAll('.cell')];
      return { labels: cells.map((c) => c.querySelector('.k').textContent.trim()), figs: cells.map((c) => c.querySelector('b').textContent.trim()), fs: parseFloat(getComputedStyle(s.querySelector('b')).fontSize), bg: getComputedStyle(s).backgroundColor, tab: getComputedStyle(s.querySelector('b')).fontVariantNumeric, tops: cells.map((c) => Math.round(c.getBoundingClientRect().top)), lefts: cells.map((c) => Math.round(c.getBoundingClientRect().left)), divider: getComputedStyle(cells[1]).borderLeftWidth };
    });
    check(`${size}: the strip has four cells with the four labels`, !!strip && strip.labels.join('|') === 'Active deals|Due today|Due this week|Files and prints this week', strip && strip.labels.join('|'));
    check(`${size}: the strip shows the same four figures as Classic`, !!strip && strip.figs.join('|') === tiles.join('|'), `${strip && strip.figs.join('|')} vs ${tiles.join('|')}`);
    check(`${size}: figures are ${size === 'phone' ? 24 : 30} px with tabular numbers`, !!strip && strip.fs === (size === 'phone' ? 24 : 30) && /tabular-nums/.test(strip.tab), strip && `${strip.fs} ${strip.tab}`);
    check(`${size}: ${size === 'phone' ? '2x2' : 'one row of four'} cells`, !!strip && (size === 'phone' ? strip.tops[0] === strip.tops[1] && strip.tops[2] === strip.tops[3] && strip.tops[2] > strip.tops[0] && strip.lefts[0] === strip.lefts[2] : new Set(strip.tops).size === 1), JSON.stringify(strip && [strip.tops, strip.lefts]));
    check(`${size}: a hairline divider between cells`, !!strip && (size === 'phone' ? true : strip.divider === '1px'), strip && strip.divider);
    check(`${size}: section titles are 16 px semibold`, await page.evaluate(() => { const h = document.querySelector('.home-sec .card-head h2'); const c = getComputedStyle(h); return parseFloat(c.fontSize) === 16 && Number(c.fontWeight) >= 600; }));

    await page.waitForSelector('#home-pipeline .pipe');
    // ---- phone: nothing floating covers a visible button or link in Home's content
    if (size === 'phone') {
      for (const [what, y] of [['the top of the page (with a deal)', 0], ['the bottom of the page (with a deal)', 999999]]) {
        await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(500);
        const c = await covered();
        check(`phone: at ${what}, no floating control covers a button or link in Home`, c.hit.length === 0, JSON.stringify(c));
      }
      // the bird is hidden (display: none, so it cannot take focus) while the ask bar is in view, and back once it scrolls away
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
      const st = () => page.evaluate(() => { const f = document.getElementById('assistant-fab'); return { shown: getComputedStyle(f).display !== 'none', rect: f.getBoundingClientRect().width > 0, bar: (() => { const r = document.querySelector('.home-ask').getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })() }; });
      const top = await st();
      check('phone: with the ask bar in view the bird is hidden (display none)', top.bar && !top.shown && !top.rect, JSON.stringify(top));
      await page.evaluate(() => window.scrollTo(0, 600)); await page.waitForTimeout(400);
      const down = await st();
      check('phone: after scrolling past the ask bar the bird is back', !down.bar && down.shown && down.rect, JSON.stringify(down));
      await page.evaluate(() => document.getElementById('assistant-fab').focus());
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
      check('phone: focus never stays on the hidden bird', await page.evaluate(() => document.activeElement && document.activeElement.id !== 'assistant-fab'));
      await page.evaluate(() => { location.hash = '#comps'; }); await page.waitForTimeout(500);
      check('phone: on another screen the bird is back', await page.locator('#assistant-fab').isVisible());
      await go('home');
      // the floating Read an OM is gone from the screen, and still reachable in the header
      await page.evaluate(() => window.scrollTo(0, 0));
      check('phone: Read an OM stays reachable, in the header and not floating', await page.evaluate(() => { const e = document.querySelector('.home-primary'); return !!e && getComputedStyle(e).position !== 'fixed' && e.getBoundingClientRect().top < 700; }));
      const links = await page.evaluate(() => [...document.querySelectorAll('.home-quiet .btn-plain')].map((b) => { const r = b.getBoundingClientRect(); return [b.textContent.trim(), Math.round(r.width), Math.round(r.height), Math.round(r.top)]; }));
      check('phone: the three text links are 44 px targets and fit on screen', links.length === 3 && links.every((l) => l[1] >= 43.5 && l[2] >= 43.5), JSON.stringify(links));
      check('phone: Home does not scroll sideways', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    check(`${size}: no browser errors`, !errors.length, errors.join('\n'));
  } catch (e) { check(`${size}: the flow ran`, false, String(e && e.stack || e).slice(0, 600)); }
  finally { await browser.close(); }
}
for (const [s, n, d] of R) console.log(s, '|', n, d);
finish(R);
