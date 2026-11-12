/* Home: Recent activity, Tasks and Contacts fold (fold.js). Recent activity is closed by default with a one-line
 * summary, empty cards shrink to one quiet row with their add action, and the choice is kept on this device.
 * Invented data only. */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const sizes = [['320px', { viewport: { width: 320, height: 700 } }], ['phone', {}], ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }]];
for (const [size, opts] of sizes) {
  const { browser, ctx, page, errors } = await phone(opts);
  await ctx.addInitScript(() => { window.__keepGroups = true; });
  try {
    const look = (v) => page.evaluate(async (x) => { (await import(new URL('app/look.js', location.href).href)).setLook(x); }, v);
    const st = (id) => page.evaluate((i) => { const b = document.querySelector(`#${i} .fold-btn`); const body = document.getElementById(b.getAttribute('aria-controls')); const sum = document.querySelector(`#${i} .fold-sum`); return { exp: b.getAttribute('aria-expanded'), hidden: body.hidden, sumShown: !sum.hidden && sum.offsetParent !== null, sum: sum.textContent }; }, id);
    await page.goto(BASE + '#home', { waitUntil: 'load' });
    await look('new');
    await page.waitForSelector('#home-activity .fold-btn');
    let a = await st('home-activity');
    check(`${size}: Recent activity is closed by default`, a.exp === 'false' && a.hidden);
    check(`${size}: closed Recent activity shows a one-line summary`, a.sumShown && /Nothing yet/.test(a.sum), a.sum);
    check(`${size}: the heading is a button with aria-controls`, await page.evaluate(() => { const b = document.querySelector('#home-activity h2 button'); return !!b && !!document.getElementById(b.getAttribute('aria-controls')); }));
    const t = await st('home-tasks'), c = await st('home-contacts');
    check(`${size}: empty Tasks and Contacts are one quiet row`, t.exp === 'false' && c.exp === 'false' && /Nothing to do yet/.test(t.sum) && /No contacts yet/.test(c.sum), `${t.sum} / ${c.sum}`);
    check(`${size}: the closed rows keep their add actions`, await page.locator('#home-tasks .fold-add').isVisible() && await page.locator('#contact-add').isVisible());
    check(`${size}: an empty Tasks row is short`, (await page.locator('#home-tasks').boundingBox()).height < 200, String((await page.locator('#home-tasks').boundingBox()).height));
    // the add action opens the card and puts the cursor in its field
    await page.locator('#home-tasks .fold-add').click();
    check(`${size}: Add a task opens Tasks and focuses the title`, (await st('home-tasks')).exp === 'true' && await page.evaluate(() => document.activeElement.id) === 'task-title');
    // keyboard: Enter and Space on the heading button
    await page.locator('#home-activity .fold-btn').focus();
    await page.keyboard.press('Enter');
    a = await st('home-activity');
    check(`${size}: Enter opens Recent activity (button state and body agree)`, a.exp === 'true' && !a.hidden && !a.sumShown);
    await page.keyboard.press('Space');
    check(`${size}: Space closes it again`, (await st('home-activity')).exp === 'false');
    // a logged item: the summary says how many and the latest
    await page.evaluate(async () => { const m = await import(new URL('app/crm.js', location.href).href); await m.log('stage', 'Invented Plaza: Underwriting → Offer / LOI'); await m.log('stage', 'Invented Court: Prospect → Underwriting'); });
    await page.waitForFunction(() => /2 items/.test(document.querySelector('#home-activity .fold-sum')?.textContent || ''));
    a = await st('home-activity');
    check(`${size}: the summary gives the count and the latest item`, /2 items/.test(a.sum) && /Invented Court/.test(a.sum), a.sum);
    // remembered per device, kept across a reload and a re-draw
    await page.locator('#home-activity .fold-btn').click();
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#home-activity .fold-btn');
    a = await st('home-activity');
    check(`${size}: an opened Recent activity stays open after a reload`, a.exp === 'true' && !a.hidden && /Invented Court/.test(await page.textContent('#home-activity')));
    await page.locator('#home-activity .fold-btn').click();
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#home-activity .fold-btn');
    check(`${size}: a closed one stays closed`, (await st('home-activity')).exp === 'false');
    check(`${size}: a storage failure is survivable (no errors so far)`, !errors.length, errors.join('\n'));
    // a card with something in it opens by default
    await page.evaluate(async () => { const m = await import(new URL('app/crm.js', location.href).href); await m.addTask({ title: 'Call the invented lender', due: null, dealId: null }); });
    await page.waitForFunction(() => document.querySelector('#home-tasks .fold-btn')?.getAttribute('aria-expanded') === 'true');
    check(`${size}: Tasks holding an open task is open by default`, (await st('home-tasks')).exp === 'true');
    await page.locator('#home-tasks .fold-btn').click();
    check(`${size}: closed Tasks summarises its open tasks`, /1 open task/.test((await st('home-tasks')).sum));
    // layout: nothing scrolls sideways, also at 130% text
    const sideways = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`${size}: Home does not scroll sideways`, (await sideways()) <= 0);
    await page.evaluate(async () => { (await import(new URL('app/look.js', location.href).href)).setTextSize(130); });
    check(`${size}: nor at 130% text`, (await sideways()) <= 0, String(await sideways()));
    await page.evaluate(async () => { (await import(new URL('app/look.js', location.href).href)).setTextSize(100); });
    // axe: folded and unfolded, both colour schemes
    await page.addScriptTag({ path: AXE });
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const open of [false, true]) {
        for (const id of ['home-activity', 'home-tasks', 'home-contacts']) if ((await st(id)).exp !== String(open)) await page.locator(`#${id} .fold-btn`).click();
        await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
        const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } } })).violations.map((x) => `${x.id} ${x.nodes.map((n) => n.target.join(' ') + ' ' + (n.any[0]?.message || '')).join(' | ')}`));
        check(`${size}, ${scheme}, ${open ? 'open' : 'closed'}: axe is clean`, !v.length, v.join(', '));
      }
    }
    // Classic gets the same fold, and its own look is not touched
    await look('classic');
    check(`${size}: Classic Home has the same fold`, await page.locator('#home-activity .fold-btn').count() === 1);
    check(`${size}: no browser errors`, !errors.length, errors.join('\n'));
  } finally { await browser.close(); }
}
for (const [s, n, d] of R) console.log(s, '|', n, d);
finish(R);
