/* Role workspaces (WS0, docs/proposals/role-workspaces.md): the first-run picker on an empty device and never on a device
 * with deals; switching changes Home and the order in Tools but never the set of tools; every bar slot stays; the
 * choice survives a reload; no deal is written by a switch; the sheet, the tabs and every Home pass axe at phone and
 * desktop size in Classic and the New look; a switch is drawn within the 150 ms budget; arrow keys move across the
 * tabs and Escape closes the sheet. The picker is skipped for an automated browser (navigator.webdriver), so the
 * picker checks start a page that says it is not one. */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const IDS = ['brokerage', 'underwriting', 'lending', 'development', 'investing', 'occupier', 'asset', 'capital', 'leases'];
const errs = [];
const TODAY = ['home-continue', 'home-attention', 'home-dates', 'home-pipeline', 'home-tasks', 'home-activity', 'home-contacts'];

const axeRun = async (page) => {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] });
    return r.violations.map((x) => `${x.id} (${x.impact}) -> ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }, TAGS);
};
const homeIds = (page) => page.$$eval('#home-root .bento section[id^="home-"]', (s) => s.map((x) => x.id));
const toolIds = (page) => page.evaluate(() => {
  const all = [...document.querySelectorAll('#tools-root [data-tool]')];
  const first = [...document.querySelectorAll('#tool-group-ws + .tool-grid [data-tool]')];
  return { below: [...new Set(all.filter((b) => !first.includes(b)).map((b) => b.dataset.tool))].sort(), first: first.map((b) => b.dataset.tool), heading: document.querySelector('#tool-group-ws')?.textContent || null, firstGroup: document.querySelector('#tools-root h2.tool-group')?.textContent || null };
});
const go = async (page, v) => { await page.evaluate((x) => { location.hash = `#${x}`; }, v); await page.waitForSelector(`#view-${v}`, { state: 'visible' }); await page.waitForTimeout(300); };
const notBot = (ctx) => ctx.addInitScript(() => { Object.defineProperty(Object.getPrototypeOf(navigator), 'webdriver', { get: () => false }); });
const wsName = (page) => page.textContent('#ws-switch');
const stored = (page) => page.evaluate(() => import('./app/store.js').then((m) => m.kvGet('ui.prefs')));
const dealsJson = (page) => page.evaluate(() => import('./app/dealui.js').then(async (m) => JSON.stringify(await m.listAllDeals())));

/* ---- 1. an empty device is asked once ---- */
{
  const { browser, ctx, page, errors } = await phone();
  await notBot(ctx);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('#sheet[open]', { timeout: 5000 });
  check('an empty device is asked "What do you work on?"', (await page.textContent('#sheet-title')) === 'What do you work on?');
  check('the picker offers all nine in three groups and says every tool stays', await page.locator('#sheet-body input[type=checkbox]').count() === 9 && await page.locator('#sheet-body h3').count() === 3 && /Every tool stays in Tools and search/.test(await page.textContent('#sheet-sub')));
  await page.check('#sheet-body input[data-ws=lending]');
  await page.check('#sheet-body input[data-ws=investing]');
  await page.check('#sheet-body input[data-ws=occupier]');
  check('at most three can be picked', await page.locator('#sheet-body input[type=checkbox]:disabled').count() === 6);
  await page.click('#sheet-foot >> text=Continue');
  await page.waitForSelector('#sheet:not([open])', { state: 'attached' });
  await page.waitForFunction(() => /Lending/.test(document.querySelector('#ws-switch')?.textContent || ''));
  check('the first one picked is active, and the other two are pinned', (await wsName(page)).includes('Lending') && JSON.stringify((await page.$$eval('#ws-bar [role=tab]', (t) => t.map((x) => x.textContent)))) === '["Lending","Investing","Occupier"]');
  check('Home shows "Lending tools"', await page.locator('#home-ws-tools h2').textContent() === 'Lending tools');
  const s = await stored(page);
  check('the choice is one ui.prefs record', s && s.workspace && s.workspace.v === 1 && s.workspace.active === 'lending' && s.workspace.picked === true, JSON.stringify(s));
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#ws-switch');
  check('it survives a reload, and the picker does not return', (await wsName(page)).includes('Lending') && !(await page.locator('#sheet[open]').count()));
  // Settings can ask again
  await go(page, 'settings');
  await page.click('#settings-workspace >> text=Show the picker again');
  await page.waitForSelector('#sheet[open]');
  check('Settings > Workspace shows the picker again', (await page.textContent('#sheet-title')) === 'What do you work on?');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#sheet:not([open])', { state: 'attached' });
  errs.push(...errors);
  await browser.close();
}
{
  const { browser, ctx, page, errors } = await phone();
  await notBot(ctx);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('#sheet[open]');
  await page.click('#sheet-foot >> text=Skip');
  await page.waitForSelector('#sheet:not([open])', { state: 'attached' });
  await page.waitForSelector('#ws-switch');
  check('Skip means Brokerage', (await wsName(page)).includes('Brokerage') && !(await page.locator('#home-ws-tools').count()) && (await homeIds(page)).join() === ['home-continue', 'home-attention', 'home-pipeline', 'home-tasks', 'home-activity', 'home-contacts'].join());
  errs.push(...errors);
  await browser.close();
}

/* ---- 2. a device that has deals: no picker, Brokerage = today's Home, a switch writes no deal ---- */
for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined }]]) {
  const { browser, ctx, page, errors } = await phone(opts);
  const at = (n, c, d) => check(`${size}: ${n}`, c, d);
  await page.goto(BASE + '#deal', { waitUntil: 'load' });
  await page.setInputFiles('#om-file', F + 'om-retail.pdf');
  await page.waitForSelector('#deal-crm #deal-stage');
  // from here the page behaves as a person's: restart it so the picker's rule runs on a device that has a deal
  await notBot(ctx);
  await page.reload({ waitUntil: 'load' });
  await go(page, 'home');
  await page.waitForSelector('#ws-switch');
  await page.waitForTimeout(800);
  at('a device with a deal is not shown the picker', !(await page.locator('#sheet[open]').count()));
  at('it starts on Brokerage with Home as it is today, card for card', (await wsName(page)).includes('Brokerage') && (await homeIds(page)).every((x) => TODAY.includes(x)) && !(await page.locator('#home-ws-tools').count()) && await page.locator('#home-pipeline').count() === 1 && await page.locator('#home-continue').count() === 1);
  at('it gets one dismissible note about workspaces', await page.locator('#ws-note').count() === 1);
  at('the Brokerage Home has no tab row until a second workspace is pinned', await page.locator('#ws-bar [role=tablist]').count() === 0);
  const slots = await page.$$eval('.tabbar .tab:not([hidden]), nav .tab:not([hidden])', (t) => t.map((x) => x.dataset.view).filter(Boolean));
  const dealsBefore = await dealsJson(page);

  // switch through the sheet: nothing else moves
  await page.click('#ws-switch');
  await page.waitForSelector('#sheet[open] [data-ws=lending]');
  at('the sheet lists all nine in three groups', await page.locator('#sheet-body [data-ws]').count() === 9 && await page.locator('#sheet-body h3').count() === 3);
  await page.check('#sheet-body input[aria-label="Pin Investing"]');
  at('the sheet passes axe', (await axeRun(page)).length === 0, (await axeRun(page)).join('\n    '));
  await page.click('#sheet-body [data-ws=lending]');
  await page.waitForSelector('#sheet:not([open])', { state: 'attached' });
  await page.waitForSelector('#home-ws-tools');
  at('Lending: Home gains its tools card and is led by Loan requests', (await page.textContent('#home-ws-tools h2')) === 'Lending tools' && /Loan requests/.test(await page.textContent('#home-pipeline h2')));
  at('Home still holds every section it had', (await homeIds(page)).includes('home-contacts') && (await homeIds(page)).includes('home-tasks'));
  at('the tab row shows the pinned workspaces, one selected', JSON.stringify(await page.$$eval('#ws-bar [role=tab]', (t) => t.map((x) => [x.textContent, x.getAttribute('aria-selected')]))) === '[["Brokerage","false"],["Investing","false"],["Lending","true"]]');
  at('the bar keeps its slots', JSON.stringify(await page.$$eval('.tabbar .tab:not([hidden]), nav .tab:not([hidden])', (t) => t.map((x) => x.dataset.view).filter(Boolean))) === JSON.stringify(slots));
  at('switching wrote no deal', (await dealsJson(page)) === dealsBefore);

  // Tools: its tools first; the set is the same in every workspace
  const sets = new Map();
  for (const id of IDS) {
    await page.evaluate((w) => import('./app/workspaceui.js').then((m) => m.setActive(w)), id);
    await go(page, 'tools');
    sets.set(id, await toolIds(page));
  }
  const base = sets.get('brokerage');
  at('Brokerage lists the tools with no extra group', base.heading === null && base.below.length >= 30, `${base.below.length}`);
  at('every workspace lists exactly the same set of tools below its own group', IDS.every((id) => JSON.stringify(sets.get(id).below) === JSON.stringify(base.below)), IDS.map((id) => `${id}:${sets.get(id).below.length}`).join(' '));
  at('every other workspace puts "For <name>" first, made only of tools in that set', IDS.filter((x) => x !== 'brokerage').every((id) => { const s = sets.get(id); return /^For /.test(s.firstGroup || '') && s.first.length >= 5 && s.first.every((t) => base.below.includes(t)); }));
  // search: the palette finds every tool under every workspace
  await page.evaluate(() => import('./app/workspaceui.js').then((m) => m.setActive('development')));
  await page.keyboard.press('Control+k');
  await page.waitForSelector('dialog[open] input');
  await page.keyboard.type('Workspace: Lend');
  await page.waitForTimeout(250);
  at('the search offers "Workspace: Lending"', /Workspace: Lending/.test(await page.textContent('dialog[open]')));
  await page.keyboard.press('Escape');
  // let the palette finish closing before opening it again (pressing Ctrl+K inside the close raced)
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  await page.keyboard.press('Control+k');
  await page.waitForSelector('dialog[open] input');
  await page.keyboard.type('Pdf pages');
  await page.waitForFunction(() => /PDF pages/i.test(document.querySelector('dialog[open]')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  at('and still finds every tool (PDF pages, which Development does not list)', /PDF pages/i.test(await page.textContent('dialog[open]')));
  await page.keyboard.press('Escape');

  // Underwrite links the workspace's calculators
  await page.evaluate(() => import('./app/workspaceui.js').then((m) => m.setActive('lending')));
  await go(page, 'underwrite');
  await page.click('#uw-view-quick');   // the calculators card is in the Quick underwrite view
  at('Underwrite links the active workspace\'s calculators and keeps the Tools link', await page.locator('#uw-calc-card [data-tool=loan]').count() === 1 && await page.locator('#uw-calculators').count() === 1);

  // axe on every Home, Classic and New look
  for (const look of ['classic', 'new']) {
    await page.evaluate((l) => { if (l === 'new') document.documentElement.dataset.look = 'new'; else delete document.documentElement.dataset.look; }, look);
    for (const id of IDS) {
      await page.evaluate((w) => import('./app/workspaceui.js').then((m) => m.setActive(w)), id);
      await go(page, 'home');
      await page.waitForSelector('#ws-switch');
      await page.waitForTimeout(250);
      const v = await axeRun(page);
      at(`${look}: axe on the ${id} Home finds nothing`, v.length === 0, v.join('\n    '));
    }
  }
  await page.evaluate(() => { delete document.documentElement.dataset.look; });

  // targets are at least 44 px
  await page.evaluate(() => import('./app/workspaceui.js').then((m) => m.setActive('lending')));
  await go(page, 'home');
  await page.waitForSelector('#ws-bar [role=tab]');
  const small = await page.$$eval('#ws-bar button, #home-ws-tools button, #ws-rail button', (b) => b.filter((x) => x.getBoundingClientRect().width && x.getBoundingClientRect().height < 44).map((x) => `${x.textContent.trim()} ${Math.round(x.getBoundingClientRect().height)}`));
  at('every workspace control is at least 44 px tall', small.length === 0, small.join(', '));

  // a switch is drawn within the budget: from the tap on a tab to the new Home on screen
  const ms = [];
  for (const [from, to] of [['lending', 'brokerage'], ['brokerage', 'investing'], ['investing', 'lending'], ['lending', 'brokerage']]) {
    await page.evaluate((w) => import('./app/workspaceui.js').then((m) => m.setActive(w)), from);
    await page.waitForFunction((w) => document.querySelector(`#ws-tab-${w}[aria-selected=true]`), from);
    await page.waitForTimeout(300);
    ms.push(await page.evaluate((w) => new Promise((res) => {
      const t0 = performance.now();
      const mo = new MutationObserver(() => { if (document.querySelector(`#ws-tab-${w}[aria-selected=true]`)) { mo.disconnect(); requestAnimationFrame(() => setTimeout(() => res(performance.now() - t0), 0)); } });
      mo.observe(document.getElementById('home-root'), { childList: true, subtree: true });
      document.getElementById(`ws-tab-${w}`).click();
    }), to));
  }
  const worst = Math.max(...ms);
  at('a switch redraws Home within the 150 ms budget', worst < 150, ms.map((x) => Math.round(x)).join(', '));

  // tabs: arrows move the focus across them (a tab row, wrapping), Enter picks; Escape closes the sheet
  await page.focus('#ws-bar [role=tab][aria-selected=true]');
  const cur = await page.evaluate(() => document.activeElement.id);
  await page.keyboard.press('ArrowRight');
  const next = await page.evaluate(() => document.activeElement.id);
  await page.keyboard.press('ArrowLeft');
  const back = await page.evaluate(() => document.activeElement.id);
  at('arrow keys move across the tabs', next !== cur && back === cur && /^ws-tab-/.test(next), `${cur} ${next} ${back}`);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForFunction((was) => document.querySelector('#ws-bar [aria-selected=true]')?.id !== was, cur);
  at('Enter on a tab picks it and the focus stays on the tabs', /^ws-tab-/.test(await page.evaluate(() => document.activeElement.id)));
  await page.click('#ws-switch');
  await page.waitForSelector('#sheet[open]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#sheet:not([open])', { state: 'attached' });
  at('Escape closes the sheet and the switch button gets the focus back', (await page.evaluate(() => document.activeElement.id)) === 'ws-switch');

  // the desktop rail
  if (size === 'desktop') {
    at('the rail has a Workspaces heading, the pinned tabs and "All workspaces…"', (await page.textContent('#ws-rail-head')) === 'Workspaces' && await page.locator('#ws-rail .wsp-rail-tab[data-ws]').count() === 3 && await page.locator('#ws-rail-all').count() === 1 && await page.locator('#ws-rail [aria-current=true]').count() === 1);
    await page.click('#ws-rail-all');
    await page.waitForSelector('#sheet[open]');
    await page.keyboard.press('Escape');
    await page.click('#ws-rail .wsp-rail-tab[data-ws=brokerage]');
    await page.waitForFunction(() => /Brokerage/.test(document.querySelector('#ws-switch')?.textContent || ''));
    at('a rail tab switches the workspace', !(await page.locator('#home-ws-tools').count()));
  } else {
    at('the rail is not on the phone', !(await page.locator('#ws-rail').isVisible()));
  }
  at('the note can be dismissed, and the choice is kept', await (async () => { if (!(await page.locator('#ws-note').count())) return true; await page.click('#ws-note >> text=Dismiss'); await page.waitForTimeout(400); return !(await page.locator('#ws-note').count()); })());
  errs.push(...errors);
  await browser.close();
}
/* ---- 3. a reload keeps the lens on every screen, and focus comes back to the switch button ---- */
{
  const { browser, ctx, page, errors } = await phone();
  await notBot(ctx);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('#sheet[open]');
  await page.click('#sheet-foot >> text=Skip');
  await page.waitForSelector('#ws-switch');
  await page.click('#ws-switch');
  await page.waitForSelector('#sheet[open] [data-ws=lending]');
  await page.click('#sheet-body [data-ws=lending]');
  await page.waitForSelector('#sheet:not([open])', { state: 'attached' });
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'ws-switch');
  check('after picking in the sheet the focus returns to the switch button', true);
  await page.click('#ws-switch');
  await page.waitForSelector('#sheet[open]');
  await page.check('#sheet-body input[aria-label="Pin Investing"]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#sheet:not([open])', { state: 'attached' });
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'ws-switch');
  check('after pinning in the sheet the focus returns to the switch button', true);
  // Closing the sheet releases its history entry with history.back(), which is asynchronous.
  // Reload only after that navigation has settled, rather than racing it.
  await page.waitForFunction(() => !history.state?.sheet);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#ws-switch');
  check('after a reload Home is the Lending Home', (await wsName(page)).includes('Lending') && await page.locator('#home-ws-tools').count() === 1);
  await go(page, 'tools');
  await page.waitForSelector('#tool-group-ws', { timeout: 3000 }).catch(() => {});
  const t = await toolIds(page);
  check('after a reload Tools lists "For Lending" first', t.heading === 'For Lending' && t.firstGroup === 'For Lending' && t.first.includes('loan'), JSON.stringify([t.heading, t.firstGroup]));
  await go(page, 'underwrite');
  await page.click('#uw-view-quick');
  await page.waitForSelector('#uw-calc-card [data-tool=loan]', { timeout: 3000 }).catch(() => {});
  check('after a reload Underwrite links the Lending calculators', await page.locator('#uw-calc-card [data-tool=loan]').count() === 1 && await page.locator('#uw-calc-card [data-tool=amort]').count() === 1);
  errs.push(...errors);
  await browser.close();
}
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errs);
