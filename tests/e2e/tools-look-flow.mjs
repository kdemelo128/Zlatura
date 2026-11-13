/* New look Tools discovery. Invented inputs only; calculator behavior uses independently worked figures. */
import { createRequire } from 'node:module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const R = []; const check = (name, ok, detail = '') => R.push([ok ? 'PASS' : 'FAIL', name, detail]);
const SIZES = [
  ['compact-phone', { viewport: { width: 320, height: 720 } }],
  ['phone', { viewport: { width: 390, height: 844 } }],
  ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }],
];
const ids = (page) => page.$$eval('#tools-root button[data-tool]', (nodes) => [...new Set(nodes.map((b) => b.dataset.tool))].sort());
const deals = (page) => page.evaluate(async () => JSON.stringify(await (await import('./app/store.js')).listDeals()));
const go = async (page, view) => { await page.evaluate((v) => { location.hash = `#${v}`; }, view); await page.waitForSelector(`#view-${view}`, { state: 'visible' }); };
const close = async (page) => { await page.locator('#sheet-close').click(); await page.waitForSelector('#sheet:not([open])', { state: 'attached' }); };
const value = (page, name) => page.$$eval('#sheet-body .results li', (nodes, label) => nodes.find((n) => n.querySelector('span')?.firstChild?.textContent === label)?.querySelector('b')?.textContent, name);
const workspace = async (page, id) => {
  await page.evaluate(async (key) => (await import('./app/workspaceui.js')).setActive(key, { say: false }), id);
  await page.waitForFunction(async (key) => {
    const { activeWorkspace } = await import('./app/workspaceui.js');
    const active = activeWorkspace(); const heading = document.querySelector('#tool-group-ws');
    return active.id === key && (key === 'brokerage' ? !heading : heading?.textContent === `For ${active.name}`);
  }, id);
};
const smallControls = (page) => page.evaluate(() => [...document.querySelectorAll('#view-tools button, #view-tools input:not([type=hidden]), #view-tools select')].flatMap((e) => {
  const r = e.getBoundingClientRect(); return r.width && r.height && (r.width < 43.5 || r.height < 43.5) ? [`${e.id || e.dataset.tool}: ${r.width.toFixed(1)}x${r.height.toFixed(1)}`] : [];
}));
async function axe(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const failures = await page.evaluate(async (tags) => (await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), TAGS);
  check(`${label}: axe`, failures.length === 0, failures.join('\n'));
}

for (const [size, options] of SIZES) {
  const { browser, ctx, page, errors } = await phone(options);
  const requests = []; page.on('request', (r) => requests.push(r.url()));
  try {
    await page.goto(BASE + '#tools', { waitUntil: 'load' });
    await page.waitForSelector('#tools-root button[data-tool]');
    const before = await deals(page);
    const source = await page.evaluate(async () => ({ tools: (await import('./app/toolsui.js')).toolIndex(), workspaces: (await import('./app/workspaces.js')).WORKSPACES.map((w) => ({ id: w.id, name: w.name, tools: w.tools })) }));
    const all = source.tools.map((t) => t.id).sort();
    const classic = {};
    for (const ws of source.workspaces) {
      await workspace(page, ws.id); classic[ws.id] = await ids(page);
      check(`${size}: Classic ${ws.name} retains every tool`, JSON.stringify(classic[ws.id]) === JSON.stringify(all));
    }
    await page.evaluate(async () => (await import('./app/look.js')).setLook('new'));
    const modern = await page.locator('#tool-category').waitFor({ timeout: 2500 }).then(() => true, () => false);
    check(`${size}: switching to New look immediately draws labeled discovery controls`, modern);
    if (!modern) continue; // archived main fails for the missing discovery behavior, without timing out each assertion
    for (const ws of source.workspaces) {
      await workspace(page, ws.id);
      const current = await ids(page);
      check(`${size}: New look ${ws.name} retains Classic's complete tool set`, JSON.stringify(current) === JSON.stringify(classic[ws.id]));
      check(`${size}: ${ws.name} counts unique tools once`, await page.locator('#tool-results').textContent() === `Showing ${all.length} of ${all.length} tools.`);
    }
    check(`${size}: document tools remain discoverable`, (await ids(page)).includes('pdf-pages') && (await ids(page)).includes('doc-convert'));
    await workspace(page, 'brokerage');
    await page.selectOption('#tool-category', 'Valuation');
    const valuation = source.tools.filter((t) => t.group === 'Valuation').map((t) => t.id).sort();
    check(`${size}: category uses the actual existing tool families`, JSON.stringify(await ids(page)) === JSON.stringify(valuation));
    const search = page.locator('#tool-search');
    await page.evaluate(() => { window.__toolSearchFrames = []; document.getElementById('tool-search').addEventListener('input', () => { const started = performance.now(); requestAnimationFrame(() => window.__toolSearchFrames.push(performance.now() - started)); }); });
    await search.focus(); let prefix = ''; const lost = [];
    for (const ch of 'waterfall') { await page.keyboard.type(ch); prefix += ch; if (await search.inputValue() !== prefix || !await search.evaluate((e) => e.isConnected && e === document.activeElement)) lost.push(prefix); }
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const frames = await page.evaluate(() => window.__toolSearchFrames);
    check(`${size}: search keeps every character and focus`, !lost.length, lost.join(', '));
    check(`${size}: search meets the 150 ms edit budget`, frames.length === 9 && Math.max(...frames) < 150, JSON.stringify(frames.map((n) => +n.toFixed(1))));
    check(`${size}: no matches explains the next action`, !(await ids(page)).length && await page.locator('#tool-clear').isVisible() && /Try another name or category/.test(await page.locator('#tool-list').textContent()));
    await page.click('#tool-clear');
    check(`${size}: Clear filters restores all tools and search focus`, JSON.stringify(await ids(page)) === JSON.stringify(all) && await search.inputValue() === '' && await page.locator('#tool-category').inputValue() === '' && await search.evaluate((e) => e === document.activeElement));

    await search.fill('Quick value');
    check(`${size}: search result count is unique and announced`, JSON.stringify(await ids(page)) === '["value"]' && await page.locator('#tool-results').getAttribute('role') === 'status' && await page.locator('#tool-results').textContent() === `Showing 1 of ${all.length} tools.`);
    await page.locator('#tools-root button[data-tool="value"]').focus(); await page.keyboard.press('Enter');
    await page.waitForSelector('#tool-value-noi');
    await page.fill('#tool-value-price', ''); await page.fill('#tool-value-noi', '300000'); await page.fill('#tool-value-cap', '6');
    await page.waitForFunction(() => [...document.querySelectorAll('#sheet-body .results li')].some((r) => r.querySelector('span')?.firstChild?.textContent === 'Price' && r.querySelector('b')?.textContent === '$5,000,000'));
    check(`${size}: existing Quick value gives the independently expected $5m`, await value(page, 'Price') === '$5,000,000');
    await close(page); await page.locator('#tools-root button[data-tool="value"]').click(); await page.waitForSelector('#tool-value-noi');
    check(`${size}: the existing calculator remembers its inputs`, (await page.inputValue('#tool-value-noi')).replace(/\D/g, '') === '300000' && await page.inputValue('#tool-value-cap') === '6' && await page.inputValue('#tool-value-price') === '' && await value(page, 'Price') === '$5,000,000');
    await close(page); await page.click('#tool-clear');
    for (const [id, input] of [['pdf-pages', '#docs-file'], ['doc-convert', '#conv-file']]) {
      await page.locator(`#tools-root button[data-tool="${id}"]`).click(); await page.waitForSelector(input, { state: 'attached' });
      check(`${size}: ${id} opens the existing file workspace`, await page.locator('#sheet').getAttribute('open') !== null);
      await close(page);
    }

    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.evaluate(async () => (await import('./app/look.js')).setTextSize(130));
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(`${size} ${scheme}: 130% text stays within the viewport`, overflow <= 0, `${overflow}px`);
      const small = await smallControls(page); check(`${size} ${scheme}: every tool control has a 44 px target`, !small.length, small.join(', '));
      await axe(page, `${size} ${scheme} 130% Tools`);
      const stopped = await page.locator('#tools-root button.tool').first().evaluate((e) => getComputedStyle(e).transitionDuration.split(',').every((v) => parseFloat(v) === 0));
      check(`${size} ${scheme}: reduced motion stops card transitions`, stopped);
    }
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    await page.evaluate(async () => (await import('./app/look.js')).setMotion(false));
    check(`${size}: the app Motion switch stops card transitions`, await page.locator('#tools-root button.tool').first().evaluate((e) => getComputedStyle(e).transitionDuration.split(',').every((v) => parseFloat(v) === 0)));
    await page.evaluate(async () => { const m = await import('./app/look.js'); m.setMotion(true); m.setTextSize(100); });
    const navigation = [];
    for (let n = 0; n < 3; n++) {
      await go(page, 'settings');
      navigation.push(await page.evaluate(() => new Promise((resolve) => {
        const target = [...document.querySelectorAll('button.tab[data-view="tools"]')].find((b) => b.getBoundingClientRect().width);
        let started;
        target.addEventListener('click', () => { started = performance.now(); }, { once: true });
        const changed = (event) => { if (event.detail !== 'tools') return; document.removeEventListener('viewchange', changed); requestAnimationFrame(() => resolve(performance.now() - started)); };
        document.addEventListener('viewchange', changed); target.click();
      })));
    }
    check(`${size}: warm Tools screen switches paint within 100 ms`, navigation.every((ms) => ms < 100), JSON.stringify(navigation.map((n) => +n.toFixed(1))));
    check(`${size}: discovery and calculators never write saved deals`, await deals(page) === before);
    if (size !== 'compact-phone') await page.screenshot({ path: `${SHOTS}tools-look-${size}.png` });
    if (size === 'phone') {
      await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); });
      await ctx.setOffline(true); await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#tool-category');
      await page.locator('#tool-search').fill('waterfall');
      check('phone: cached Tools search and categories work offline', JSON.stringify(await ids(page)) === '["waterfall"]');
      await ctx.setOffline(false);
    }
    check(`${size}: no browser errors`, !errors.length, errors.join('\n'));
    const outside = requests.filter((url) => /^https?:/.test(url) && new URL(url).origin !== new URL(BASE).origin);
    check(`${size}: no request leaves this origin`, !outside.length, outside.join('\n'));
  } catch (e) { check(`${size}: workflow completes`, false, String(e.stack || e)); }
  finally { await browser.close(); }
}
for (const row of R) console.log(row.join(' | '));
finish(R);
