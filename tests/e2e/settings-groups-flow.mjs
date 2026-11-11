/* Settings is a few named groups: only Appearance is open at first, every other group opens from its heading (mouse,
 * touch or keyboard), and every control and card that was in Settings is still reachable under one of them. */
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const errs = [];
const GROUPS = {
  appearance: ['Appearance', ['#settings-look [data-theme-set="dark"]', '[data-look-set="new"]', '[data-solid-toggle]', '[data-accent-set="#2F6B4F"]', '#accent-custom', '[data-motion-toggle]', '[data-size-set="130"]']],
  work: ['Workspace and templates', ['#settings-workspace', '#settings-pipeline button', '#settings-templates button']],
  calc: ['Calculations', ['#settings-conventions', '#conv-walt-weight', '#conv-t12-spike-times', '#settings-t12']],
  ai: ['Documents and AI', ['#settings-ai button']],
  data: ['Data and backup', ['#settings-data #backup-make']],
  about: ['About', ['#settings-shortcuts', '#settings-about .about-tagline']],
};
for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }]]) {
  const { browser, ctx, page, errors } = await phone(opts);
  await ctx.addInitScript(() => { window.__keepGroups = true; });
  await page.goto(BASE + '#settings', { waitUntil: 'load' });
  await page.waitForSelector('#settings-data #backup-file', { state: 'attached' });
  await page.waitForTimeout(300);
  const open = await page.$$eval('details.set-group', (d) => d.map((x) => [x.id, x.open]));
  check(`${size}: six groups, only Appearance open`, open.length === 6 && open.filter(([, o]) => o).map(([i]) => i).join() === 'set-g-appearance', JSON.stringify(open));
  check(`${size}: Appearance controls are visible with no tap`, await page.isVisible('[data-accent-set="#2F6B4F"]') && await page.isVisible('[data-size-set="130"]'));
  check(`${size}: the other groups' controls are hidden until opened`, !(await page.isVisible('#conv-walt-weight')) && !(await page.isVisible('#settings-data #backup-make')) && !(await page.isVisible('#settings-shortcuts')));
  check(`${size}: the group headings are plain, in order`, JSON.stringify(await page.$$eval('details.set-group > summary .set-g-title', (t) => t.map((x) => x.textContent))) === JSON.stringify(Object.values(GROUPS).map((g) => g[0])));
  for (const [id, [title, sels]] of Object.entries(GROUPS)) {
    const sm = page.locator(`#set-g-${id} > summary`);
    if (id !== 'appearance') { await sm.click(); await page.waitForTimeout(100); }
    const vis = [];
    for (const s of sels) if (!(await page.isVisible(s))) vis.push(s);
    check(`${size}: "${title}" shows all its controls once open`, vis.length === 0, vis.join(', '));
  }
  // keyboard: Enter on a heading closes it, Space opens it again
  await page.focus('#set-g-about > summary');
  await page.keyboard.press('Enter');
  const closed = await page.$eval('#set-g-about', (d) => !d.open);
  await page.keyboard.press('Space');
  check(`${size}: a group heading works from the keyboard`, closed && await page.$eval('#set-g-about', (d) => d.open));
  // the open groups survive Settings being drawn again (a change elsewhere re-draws it)
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('crmchange')));
  await page.waitForTimeout(600);
  check(`${size}: groups stay as left after a re-draw`, (await page.$$eval('details.set-group', (d) => d.filter((x) => x.open).length)) === 6);
  // asked open from elsewhere (the backup reminder on Home)
  await page.click('#set-g-data > summary'); await page.click('#set-g-calc > summary');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('settingsgroup', { detail: 'data' })));
  check(`${size}: the backup reminder can open "Data and backup"`, await page.$eval('#set-g-data', (d) => d.open));
  await page.screenshot({ path: `${SHOTS}settings-groups-${size}.png`, fullPage: true });
  await browser.close();
  errs.push(...errors);
}
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errs);
