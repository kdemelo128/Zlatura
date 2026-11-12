/* Clarity pass in the underwriting tool (app/uwtool/): "Choose your next move", the analyst toolkit and the advanced scenarios,
 * at iPhone size inside the app's frame. Every former action is still there and clickable; the ten tools sit under four plain
 * headings with one primary each and a one-line description; every tab has a hint; every control is at least 44 px tall; a hint
 * shows on keyboard focus, on mouse hover and on a touch tap; it does not animate under reduced motion; axe is clean inside the
 * frame; the fictional example's displayed figures are identical to what the code showed before the pass; no outside request.
 *
 *   node uwclarity-flow.mjs        # BASE=http://localhost:8080/ by default */
import { createRequire } from 'module';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { phone, BASE, finish } from './lib.mjs';

const req = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8');
const { browser, ctx, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(15000);
const origin = new URL(BASE).origin; const outside = [];
ctx.on('request', (r) => { if (!r.url().startsWith(origin) && !/^(data|blob|about):/.test(r.url())) outside.push(r.url()); });
// the figures the fictional example shows, read from the code before the pass (sha-256 of the JSON below)
const FIGURES_SHA = process.env.FIGURES_SHA || '4cd1218a52e98cc10517352ccd82eee13be8257122fe5342037183db54847102';

await page.goto(`${BASE}#home`, { waitUntil: 'load' });
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload({ waitUntil: 'load' });
await page.locator('button.tab[data-view="underwrite"]:visible').first().click();
await page.waitForSelector('#uwt-frame');
const toolFrame = () => page.frames().find((fr) => /\/app\/uwtool\/index\.html/.test(fr.url()));
for (let i = 0; i < 100 && !toolFrame(); i++) await page.waitForTimeout(100);
const f = toolFrame();
await f.waitForSelector('#exampleLoad');
await f.waitForFunction(() => document.readyState === 'complete' && typeof UWEditor !== 'undefined' && !!UWEditor.model);
await f.click('#exampleLoad');
await f.waitForFunction(() => UWEditor.model() && /example/i.test(UWEditor.model().name));
await f.waitForSelector('#toolLibrary .tool-placard');
await page.waitForTimeout(600);

const TOOLS = ['Saved scenarios', 'Tenant line items', 'Diligence checklist', 'Historical statements', 'Development', 'Financing & returns', 'Analyst toolkit', 'Advanced scenarios', 'Operating schedules', 'Excel templates'];
const ANALYST = ['Value & debt', 'Scenarios', 'Lease timeline', 'Recoveries & area', 'Closing tracker', 'Lender memo'];
const ADVANCED = ['Capital stack', 'Waterfall', 'Risk simulation', 'Lease recoveries', 'Asset models', 'Data connections'];
const card = (t) => f.locator('#toolLibrary .tool-placard', { has: f.locator(`strong:text-is("${t}")`) });
const back = () => f.evaluate(() => document.querySelector('#toolLibrary .tool-panel-heading button').click());

/* ---- Choose your next move: grouped, described, primary per group */
const groups = await f.evaluate(() => [...document.querySelectorAll('#toolLibrary .tool-group')].map((g) => ({
  h: g.querySelector('h3')?.textContent.trim(), desc: g.querySelector('.tool-group-desc')?.textContent.trim(),
  cards: [...g.querySelectorAll('.tool-placard')].map((b) => b.querySelector('strong').textContent.trim()), primary: g.querySelectorAll('.tool-placard[data-primary="true"]').length })));
check('the ten tools sit under 3 to 5 plain headings, each with a one-line description', groups.length >= 3 && groups.length <= 5 && groups.every((g) => g.h && g.desc), JSON.stringify(groups.map((g) => g.h)));
check('every one of the ten tools is still there, once', JSON.stringify(groups.flatMap((g) => g.cards).sort()) === JSON.stringify([...TOOLS].sort()), JSON.stringify(groups.flatMap((g) => g.cards)));
check('one primary card per group, the most used first', groups.every((g) => g.primary === 1) && groups[0]?.cards[0] === 'Analyst toolkit', JSON.stringify(groups.map((g) => g.primary)));
const lib = await f.evaluate(() => [...document.querySelectorAll('#toolLibrary .tool-placard')].map((b) => ({ t: b.querySelector('strong').textContent, d: b.querySelector('.tool-card-text > span').textContent.trim(), h: b.dataset.hint || '' })));
check('each tool has a one-line description and a longer "what this does" hint', lib.length === 10 && lib.every((x) => x.d.length > 10 && x.h.length > x.d.length * 0.6), JSON.stringify(lib.filter((x) => !x.h)));
// the search still filters and hides an emptied group
await f.fill('#toolSearch', 'excel');
check('search still filters, and a group with no match is hidden', (await f.locator('#toolLibrary .tool-placard:visible').count()) === 1 && (await f.locator('#toolLibrary .tool-group:visible').count()) === 1);
await f.click('#toolLibrary .tool-search-bar button');
check('Clear brings all ten and every group back', (await f.locator('#toolLibrary .tool-placard:visible').count()) === 10 && (await f.locator('#toolLibrary .tool-group:visible').count()) === groups.length);

/* ---- sizes: every control in the three areas is at least 44 px tall (phone) */
const smalls = (sel) => f.evaluate((sel) => [...document.querySelectorAll(`${sel} button, ${sel} summary, ${sel} select, ${sel} input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=file])`)]
  .filter((e) => e.offsetParent && !e.closest('[hidden]')).map((e) => ({ n: (e.textContent || e.id || e.name || e.type || '').trim().slice(0, 24), h: e.offsetHeight })).filter((x) => x.h < 44), sel);
check('the library (cards, search, Clear) has no control under 44 px', (await smalls('#toolLibrary .tool-search-bar')).length === 0 && (await f.evaluate(() => [...document.querySelectorAll('#toolLibrary .tool-placard')].every((b) => b.offsetHeight >= 44))), JSON.stringify(await smalls('#toolLibrary .tool-search-bar')));

/* ---- every card opens its tool and "All tools" comes back */
let opens = [];
for (const t of TOOLS) { await card(t).click(); const open = await f.evaluate((t) => { const p = [...document.querySelectorAll('#toolLibrary .launched-tool')].find((x) => !x.hidden); return !!p && document.querySelector('#toolLibrary .tool-panel-heading h3').textContent === t; }, t); opens.push(open); await back(); }
check('each of the ten cards opens its own tool (heading names it) and All tools returns', opens.every(Boolean), JSON.stringify(opens));
await card('Excel templates').click(); check('"All tools" is at least 44 px', (await f.evaluate(() => document.querySelector('#toolLibrary .tool-panel-heading button').offsetHeight)) >= 44); await back();

/* ---- analyst toolkit and advanced scenarios: tabs, hints, former buttons, sizes, figures */
const figures = { page: await f.evaluate(() => { const out = []; document.querySelectorAll('body *').forEach((e) => { if (e.children.length || e.closest('#toolLibrary, #uwHint')) return; const t = e.textContent.trim(); if (/^[-($]*[\d,.]+[KMB%x)]*$/.test(t) && /[$%x]/.test(t)) out.push(t); }); return out; }) };
const leaves = (sel) => f.evaluate((sel) => [...document.querySelectorAll(`${sel} *`)].filter((e) => !e.children.length && e.offsetParent).map((e) => e.textContent.trim()).filter((t) => /^[-($]*[\d,.]+[KMB%x)]*$/.test(t) && /[$%x]/.test(t)), sel);
const FORMER = { 'Capital stack': ['Add debt tranche', 'Calculate capital stack', 'Compare with / without refinancing', 'Compare permitted senior leverage', 'Compare capital structures'], 'Value & debt': ['Add lender quote'] };
async function area(title, root, attr, tabs) {
  await card(title).click(); await f.waitForSelector(`${root} [${attr}]`);
  const names = await f.$$eval(`${root} [${attr}]`, (b) => b.map((x) => x.textContent.trim()));
  check(`${title}: all six tabs are there under plain group headings`, JSON.stringify(names) === JSON.stringify(tabs) && (await f.locator(`${root} .nav-group-label`).count()) >= 3, JSON.stringify(names));
  const clicks = [], hints = [], tall = [], what = []; figures[title] = {};
  for (const t of tabs) {
    // a CSS string escapes backslash and quote; the tab names are the tool's own, but the selector is built safely either way
    const sel = `${root} [${attr}="${t.replace(/[\\"]/g, '\\$&')}"]`;
    await f.locator(sel).click();
    clicks.push(await f.locator(sel).evaluate((b) => b.classList.contains('selected')));
    hints.push(await f.evaluate(([root, attr, t]) => { const b = document.querySelector(`${root} [${attr}="${CSS.escape(t)}"]`); const w = document.querySelector(`${root} .tab-what`); return !!b.dataset.hint && !!w && w.textContent.trim().length > 20; }, [root, attr, t]));
    tall.push(...await smalls(root)); figures[title][t] = await leaves(root);
    for (const n of FORMER[t] || []) what.push([n, (await f.locator(`${root} button`, { hasText: n }).count()) > 0]);
  }
  check(`${title}: each tab opens and shows as chosen`, clicks.every(Boolean), JSON.stringify(clicks));
  check(`${title}: each tab has a hint and a one-line description under the tabs`, hints.every(Boolean), JSON.stringify(hints));
  check(`${title}: no control under 44 px on any tab`, tall.length === 0, JSON.stringify(tall.slice(0, 6)));
  if (what.length) check(`${title}: the former buttons are still there`, what.every((x) => x[1]), JSON.stringify(what));
}
/* axe: evaluated through the protocol, because the tool's policy (rightly) blocks an injected script */
async function axeIn(name) {
  await f.waitForTimeout(600);   // let the tool's own colour transitions finish: axe reads the colour mid-fade otherwise
  const res = await f.evaluate(AXE_SRC + '\n;axe.run(document.querySelector("#toolLibrary"),{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]},resultTypes:["violations"]}).then(r=>r.violations.map(v=>v.id+" ("+v.impact+"): "+v.nodes.slice(0,2).map(n=>n.target.join(" ")+" "+(n.any[0]&&n.any[0].message)).join(" | ")))');
  check(`axe: ${name}, inside the frame`, Array.isArray(res) && res.length === 0, JSON.stringify(res));
}
await axeIn('the library');
await area('Analyst toolkit', '#analystTools', 'data-tool', ANALYST); await axeIn('analyst toolkit'); await back();
await area('Advanced scenarios', '#advancedTools', 'data-advtab', ADVANCED); await axeIn('advanced scenarios'); await back();

/* ---- the hint: keyboard focus, mouse hover, touch tap; no animation under reduced motion */
await f.locator('#toolLibrary .tool-placard').first().scrollIntoViewIfNeeded();
await f.evaluate(() => document.getElementById('toolSearch').focus());
for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); if (await f.evaluate(() => !!document.activeElement?.dataset?.hint)) break; }
await f.waitForTimeout(300);
const hv = () => f.evaluate(() => { const b = document.getElementById('uwHint'); return b && !b.hidden && getComputedStyle(b).opacity === '1' ? b.textContent : ''; });
const focused = await f.evaluate(() => document.activeElement?.dataset?.hint || '');
check('keyboard focus on a card shows its "what this does" hint', focused ? (await hv()) === focused : (await hv()) !== '', `${focused.slice(0, 30)} / ${(await hv()).slice(0, 30)}`);
await f.evaluate(() => window.UWHint?.hide());
await card('Saved scenarios').hover(); await f.waitForTimeout(300);
check('mouse hover on a card shows its hint', (await hv()) === (await card('Saved scenarios').getAttribute('data-hint')));
await page.mouse.move(0, 0); await f.waitForTimeout(300);
check('moving away hides it', (await hv()) === '');
await f.evaluate(() => window.UWHint?.hide());
await f.evaluate(() => { const b = [...document.querySelectorAll('#toolLibrary .tool-placard')].find((x) => /Excel/.test(x.textContent)); b.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true })); });
await f.waitForTimeout(300);
check('a touch tap on a card shows its hint (the card still opens on the same tap)', (await hv()).includes('Excel workbook'), (await hv()).slice(0, 40));
await f.evaluate(() => window.UWHint?.hide());
const hs = (prop) => f.evaluate((p) => { const b = document.getElementById('uwHint'); return b ? getComputedStyle(b)[p] : 'missing'; }, prop);
const tr = await hs('transitionDuration');
check('the hint fades in 150 ms (opacity and transform only)', /^0\.15s/.test(tr) && (await hs('transitionProperty')) === 'opacity, transform', tr);
await page.emulateMedia({ reducedMotion: 'reduce' }); await f.waitForTimeout(200);
check('under reduced motion the hint does not animate', (await hs('transitionDuration')) === '0s');
await page.emulateMedia({ reducedMotion: 'no-preference' });

/* ---- the example's figures are unchanged */
const sha = crypto.createHash('sha256').update(JSON.stringify(figures)).digest('hex');
if (process.env.PRINT_FIGURES) console.log('FIGURES', sha, JSON.stringify(figures).length);
check('the fictional example shows the same figures as before the pass (page, every analyst and advanced tab)', sha === FIGURES_SHA, `sha ${sha.slice(0, 16)}`);

check('not one request left this origin', outside.length === 0, outside.join(' | '));
const ignorable = [/can escape its sandboxing/, /GL Driver Message|GPU stall/];
check('no console error', errors.filter((e) => !ignorable.some((x) => x.test(e))).length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', []);
