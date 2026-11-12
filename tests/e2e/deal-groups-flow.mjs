/* The Deal's Overview: sections in named groups (dealui.js dsec), each a fold with a one-line summary, remembered
 * per deal, with a sticky group bar in the New look. Nothing is removed or recalculated: the same figures before and
 * after folding. Invented data only. */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const GROUPS = { overview: ['checks', 'figures'], income: ['statement', 'rentsched'], value: ['comps', 'ladder'], financing: ['finance', 'fee'], leases: ['rr', 'credit'], docs: [], activity: ['crm', 'questions'] };
const NAMES = ['Overview', 'Income and expenses', 'Value and returns', 'Financing', 'Leases', 'Documents', 'Activity'];
const sizes = [['320px', { viewport: { width: 320, height: 720 } }], ['phone', {}], ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }]];
for (const [size, opts] of sizes) {
  const { browser, ctx, page, errors } = await phone(opts);
  await ctx.addInitScript(() => { window.__keepGroups = true; });
  try {
    await page.goto(BASE + '#deal', { waitUntil: 'load' });
    await page.evaluate(async () => { (await import(new URL('app/look.js', location.href).href)).setLook('new'); });
    await page.getByRole('button', { name: 'Enter figures by hand', exact: true }).click();
    await page.waitForSelector('#fig-price');
    for (const [k, v] of [['price', '4.5m'], ['noi', '300k'], ['bsf', '12000'], ['units', '10'], ['occ', '95%']]) { await page.locator(`#fig-${k}`).fill(v); await page.locator(`#fig-${k}`).press('Tab'); }
    await page.waitForFunction(async () => { const m = await import(new URL('app/dealui.js', location.href).href); return (await m.listAllDeals()).some((d) => d.figures.price === 4500000); });
    const fold = (id) => page.evaluate((i) => { const b = document.querySelector(`#dsec-${i} .fold-btn`); if (!b) return null; const body = document.getElementById(b.getAttribute('aria-controls')); return { exp: b.getAttribute('aria-expanded'), hidden: body.hidden, sum: document.querySelector(`#dsec-${i} .fold-sum`).textContent, summaryShown: !document.querySelector(`#dsec-${i} .fold-sum`).hidden }; }, id);
    const snap = () => page.evaluate(async () => { const m = await import(new URL('app/dealui.js', location.href).href); const d = (await m.listAllDeals()).find((x) => x.id === m.currentDealId()); return { id: d.id, figures: JSON.stringify(d.figures), tiles: document.getElementById('deal-tiles').textContent }; });
    const before = await snap();

    // groups and sections: each named, in order, every section present
    const heads = await page.$$eval('.dgroup-h', (h) => h.map((x) => x.textContent));
    check(`${size}: the Overview has the seven named groups in order`, JSON.stringify(heads) === JSON.stringify(NAMES), heads.join(' | '));
    let missing = [];
    for (const [g, ids] of Object.entries(GROUPS)) for (const id of ids) if (!(await page.locator(`#dg-${g} #dsec-${id}`).count())) missing.push(`${g}/${id}`);
    check(`${size}: every section sits in its group`, !missing.length, missing.join(', '));
    check(`${size}: Documents and Lease abstracts are still on the page`, await page.locator('#dg-docs #deal-dd #dd-toggle').count() === 1 && await page.locator('#dg-leases #deal-abstracts #ab-toggle').count() === 1);
    // open or closed by default
    const figs = await fold('figures'), fin = await fold('finance'), stmt = await fold('statement');
    check(`${size}: Overview sections are open by default, the rest closed`, figs.exp === 'true' && !figs.hidden && fin.exp === 'false' && fin.hidden && stmt.exp === 'false' && stmt.hidden);
    // summaries
    await page.locator('#dsec-figures .fold-btn').click();
    const f2 = await fold('figures');
    check(`${size}: closed Key figures summarises price, cap and NOI`, f2.exp === 'false' && f2.summaryShown && /\$4\.50M asking/.test(f2.sum) && /6\.67% cap/.test(f2.sum) && /\$300K NOI/.test(f2.sum), f2.sum);
    check(`${size}: an empty section says so`, (await fold('statement')).sum === 'Nothing imported yet' && (await fold('comps')).sum === 'No comps loaded' && (await fold('fee')).sum === 'Nothing entered yet' && (await fold('rr')).sum === 'No rent roll yet', JSON.stringify([(await fold('statement')).sum, (await fold('comps')).sum, (await fold('fee')).sum, (await fold('rr')).sum]));
    const fs = await fold('finance');
    check(`${size}: Financing summarises the DSCR and loan`, /DSCR \d\.\d\dx · loan \$/.test(fs.sum), fs.sum);
    // summaries follow an edit
    await page.locator('#dsec-figures .fold-btn').click();
    await page.locator('#fig-noi').fill('330k'); await page.locator('#fig-noi').press('Tab');
    await page.locator('#dsec-figures .fold-btn').click();
    check(`${size}: a summary follows an edit`, /\$330K NOI/.test((await fold('figures')).sum), (await fold('figures')).sum);
    await page.locator('#dsec-figures .fold-btn').click();
    await page.locator('#fig-noi').fill('300k'); await page.locator('#fig-noi').press('Tab');

    // the group bar (New look): every group, and so every section, is reachable
    const chips = await page.$$eval('#deal-chips .deal-chip', (c) => c.map((x) => x.textContent));
    check(`${size}: the group bar lists the seven groups`, JSON.stringify(chips) === JSON.stringify(NAMES), chips.join(' | '));
    check(`${size}: the group bar scrolls sideways rather than wrapping`, await page.evaluate(() => { const c = document.getElementById('deal-chips'); return getComputedStyle(c).overflowX === 'auto' && c.getBoundingClientRect().height < 80; }));
    let bad = [];
    for (let i = 0; i < NAMES.length; i++) {
      await page.locator('#deal-chips .deal-chip').nth(i).scrollIntoViewIfNeeded();
      await page.locator('#deal-chips .deal-chip').nth(i).click();
      const [g] = Object.entries(GROUPS)[i];
      const r = await page.evaluate((gid) => { const h = document.getElementById(`dg-${gid}-h`).getBoundingClientRect(); let top = 0; for (const e of document.querySelectorAll('.appbar,.deal-nav')) { const r = e.getBoundingClientRect(), s = getComputedStyle(e); if (r.width && ['fixed', 'sticky'].includes(s.position) && r.top < 5) top = Math.max(top, r.bottom); } return { ok: h.top >= top - 1 && h.bottom <= innerHeight, focus: document.activeElement.id === `dg-${gid}-h`, top: h.top, bar: top }; }, g);
      if (!r.ok || !r.focus) bad.push(`${g} ${JSON.stringify(r)}`);
      // every section of that group has a visible fold button within two taps (this one, then its own)
      for (const id of GROUPS[g]) if (!(await page.locator(`#dsec-${id}`).count())) bad.push(`${g}/${id} missing`);
    }
    check(`${size}: each group chip lands on its heading, clear of the bars, with focus`, !bad.length, bad.join('\n'));
    // each section opens in one tap from its closed row and its controls work
    for (const [g, ids] of Object.entries(GROUPS)) for (const id of ids) {
      const w = page.locator(`#dsec-${id}`);
      if (await w.isHidden()) continue; // a card that hides itself while it has nothing (no checks, no rent periods)
      const s = await fold(id);
      if (s.exp === 'false') await w.locator('.fold-btn').click();
      const open = await fold(id);
      if (open.exp !== 'true' || open.hidden || !(await w.locator('.dsec-body').isVisible())) bad.push(id);
    }
    check(`${size}: every section can be opened with its own button`, !bad.length, bad.join(', '));
    // folding hides nothing for good: the same figures and the same tiles
    const afterOpen = await snap();
    for (const id of Object.values(GROUPS).flat()) { const w = page.locator(`#dsec-${id}`); if (await w.isVisible() && (await fold(id)).exp === 'true') await w.locator('.fold-btn').click(); }
    const afterClose = await snap();
    await page.locator('#dsec-figures .fold-btn').click();
    check(`${size}: the same deal figures before, with everything open, and with everything closed`, before.figures === afterOpen.figures && before.figures === afterClose.figures && before.tiles === afterOpen.tiles && before.tiles === afterClose.tiles);
    check(`${size}: the field still shows the typed value`, (await page.locator('#fig-price').inputValue()).replace(/\D/g, '') === '4500000');

    // remembered per deal, kept across a reload
    await page.locator('#dsec-finance .fold-btn').click();
    const key = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('zl.fold.deal.')));
    check(`${size}: the choice is kept under this deal`, key.length === 1 && key[0].endsWith(before.id), key.join());
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#fig-price');
    check(`${size}: after a reload Financing is still open and Operating statement still closed`, (await fold('finance')).exp === 'true' && (await fold('statement')).exp === 'false');
    await page.evaluate((id) => { localStorage.removeItem(`zl.fold.deal.${id}`); }, before.id);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#fig-price');
    check(`${size}: another deal (no saved choice) gets the defaults`, (await fold('finance')).exp === 'false' && (await fold('figures')).exp === 'true');

    // the Sections menu opens a closed section before it moves there
    await page.locator('#deal-jump').click();
    await page.getByRole('button', { name: 'Financing', exact: false }).filter({ has: page.locator('.action-label') }).click();
    await page.waitForFunction(() => document.querySelector('#dsec-finance .fold-btn')?.getAttribute('aria-expanded') === 'true' && document.activeElement?.closest('#dsec-finance'));
    check(`${size}: the Sections menu opens the closed section it jumps to`, await page.locator('#fin-ltv, #deal-finance input').first().isVisible());

    // typing into a folded-open field keeps every character and focus
    const inp = page.locator('#deal-finance input').first();
    await inp.fill(''); await inp.focus();
    for (const ch of '62.5') await page.keyboard.type(ch);
    check(`${size}: typing character by character in a section keeps the text and the focus`, (await inp.inputValue()) === '62.5' && await page.evaluate(() => document.activeElement === document.querySelector('#deal-finance input')));
    await page.keyboard.press('Tab');
    // a single edit stays under the 150 ms budget with every section open
    for (const id of Object.values(GROUPS).flat()) { const w = page.locator(`#dsec-${id}`); if (await w.isVisible() && (await fold(id)).exp !== 'true') await w.locator('.fold-btn').click(); }
    await page.locator('#fig-noi').focus();
    const ms = await page.evaluate(() => new Promise((res) => { const el = document.getElementById('fig-noi'); el.value = '310k'; const t = performance.now(); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); requestAnimationFrame(() => setTimeout(() => res(performance.now() - t), 0)); }));
    check(`${size}: an edit with every section open takes under 150 ms`, ms < 150, `${ms.toFixed(0)} ms`);

    // layout: nothing scrolls sideways, also at 130% text
    const sideways = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`${size}: the Deal does not scroll sideways`, (await sideways()) <= 0, String(await sideways()));
    await page.evaluate(async () => { (await import(new URL('app/look.js', location.href).href)).setTextSize(130); });
    check(`${size}: nor at 130% text`, (await sideways()) <= 0, String(await sideways()));
    await page.evaluate(async () => { (await import(new URL('app/look.js', location.href).href)).setTextSize(100); });
    // axe, both colour schemes, everything open then everything closed
    await page.addScriptTag({ path: AXE });
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const open of [true, false]) {
        for (const id of Object.values(GROUPS).flat()) { const w = page.locator(`#dsec-${id}`); if (await w.isVisible() && (await fold(id)).exp !== String(open)) await w.locator('.fold-btn').click(); }
        await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
        const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } } })).violations.map((x) => `${x.id} ${x.nodes.map((n) => n.target.join(' ') + ' ' + (n.any[0]?.message || '')).join(' | ')}`));
        check(`${size}, ${scheme}, ${open ? 'all open' : 'all closed'}: axe is clean`, !v.length, v.join(', '));
      }
    }
    await page.emulateMedia({ colorScheme: 'light' });
    check(`${size}: no browser errors`, !errors.length, errors.join('\n'));
  } finally { await browser.close(); }
}
for (const [s, n, d] of R) console.log(s, '|', n, d);
finish(R);
