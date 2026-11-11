/* The built-in underwriting tool (app/uwtool/), in a browser, at 390 px and at desktop size: the Underwrite tab has an
 * "Underwriting" card that opens the tool with NO package step; the frame is made only on open; the tool is served by the
 * service worker with the strict content policy header (and carries it as a <meta>); its own screens work (the invented
 * example loads); the cap rates are blank and stay blank (never 0, never a preset) and the tool asks for one; there is not
 * one request to another host (page, frame, workers) and not one console error; the tool is cached on first open, not at
 * install, and opens offline after that; Open full screen works; the firm-pack loader is still reachable under Advanced;
 * every other Underwrite card is still there; axe on the card at phone and desktop size.
 *
 *   node uwtool-flow.mjs        # BASE=http://localhost:8080/ by default */
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const { browser, ctx, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(15000);
const origin = new URL(BASE).origin;
const outside = [];
ctx.on('request', (r) => { if (!r.url().startsWith(origin) && !/^(data|blob|about):/.test(r.url())) outside.push(r.url()); });
const toolResponses = [];
// the page's own requests only (the service worker's one fetch to fill its cache is not the page's)
page.on('response', (r) => { if (/\/app\/uwtool\//.test(r.url())) toolResponses.push({ url: r.url(), status: r.status(), sw: r.fromServiceWorker(), csp: r.headers()['content-security-policy'] || '' }); });
const stackIds = () => page.evaluate(() => [...document.querySelector('#underwrite-root .stack').children].map((c) => c.id).join());
// the button is in the HTML before the scripts have run: wait for the page to finish loading, then for the editor
const ready = (fr) => fr.waitForFunction(() => document.readyState === 'complete' && typeof UWEditor !== 'undefined' && !!UWEditor.model);
const toolFrame = () => page.frames().find((f) => /\/app\/uwtool\/index\.html/.test(f.url()));

async function axe(name) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document.querySelector('#uw-tool'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  });
  check(`axe: the card, ${name}`, res.length === 0, res.join('\n    '));
}

await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
await page.waitForSelector('#uw-tool');
await page.evaluate(() => navigator.serviceWorker.ready);
if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#uw-tool'); }
check('the service worker controls the page', await page.evaluate(() => !!navigator.serviceWorker.controller));

/* ---- the card: no package step */
check('the card says Open underwriting, with Open full screen; there is no file picker and no Load package on it', (await page.textContent('#uwt-open')) === 'Open underwriting' && (await page.locator('#uwt-full').count()) === 1 && (await page.locator('#uw-tool input[type=file]').count()) === 0 && !/Load package|Load folder/.test(await page.textContent('#uw-tool')));
check('order: Start from documents, Underwriting, Quick underwrite, the list, Calculators, then the firm pack (Advanced)', (await stackIds()) === 'uw-intake,uw-tool,uw-card,uw-list,uw-calc-card,uw-filler', await stackIds());
check('the frame is made only on open: no iframe and no request for the tool yet', (await page.locator('iframe').count()) === 0 && toolResponses.length === 0);
const bucketsNow = () => page.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname); return out; });
const b0 = await bucketsNow();
check('the tool is not in the install bucket, and has no bucket of its own before the first open', !Object.values(b0).flat().some((p) => /\/app\/uwtool\//.test(p)) && !Object.keys(b0).some((k) => /uwtool/.test(k)), Object.keys(b0).join());
await axe('phone size, closed');

/* ---- advanced: the firm-pack loader is still there */
check('Advanced: load my firm\'s template pack is collapsed, and opens to the package loader', await (async () => {
  const closed = await page.evaluate(() => document.getElementById('uw-filler').tagName === 'DETAILS' && !document.getElementById('uw-filler').open);
  await page.click('#uwf-title');
  await page.waitForSelector('#uwf-load');
  await page.click('#uwf-title');
  return closed && /template pack/.test(await page.textContent('#uwf-title'));
})());

/* ---- open */
await page.click('#uwt-open');
await page.waitForSelector('#uwt-frame');
const getFrame = async () => { for (let i = 0; i < 100 && !toolFrame(); i++) await page.waitForTimeout(100); return toolFrame(); };
const f = await getFrame();
await f.waitForSelector('#exampleLoad');
await ready(f);
check('the tool opens in the frame with no package step; Close underwriting is offered', (await page.textContent('#uwt-open')) === 'Close underwriting' && (await page.getAttribute('#uwt-open', 'aria-expanded')) === 'true');
const idx = toolResponses.find((r) => /uwtool\/index\.html/.test(r.url));
check('the page came from the service worker with the strict policy header', !!idx && idx.sw && idx.status === 200 && /script-src 'self'/.test(idx.csp) && /frame-ancestors 'self'/.test(idx.csp) && /connect-src 'self' blob: data:/.test(idx.csp) && !/unsafe-eval|https?:/.test(idx.csp), JSON.stringify(idx));
check('every file of the tool came from the worker', toolResponses.length > 50 && toolResponses.every((r) => r.sw && r.status === 200), `${toolResponses.length} files; ${toolResponses.filter((r) => !r.sw || r.status !== 200).map((r) => r.url).join(' ')}`);
const attrs = await page.evaluate(() => { const fr = document.querySelector('#uwt-frame'); return { sb: fr.getAttribute('sandbox'), title: fr.title }; });
check('the frame is sandboxed without top navigation, and titled', /allow-scripts/.test(attrs.sb) && !/allow-top-navigation/.test(attrs.sb) && /underwriting/.test(attrs.title), JSON.stringify(attrs));
const inside = await f.evaluate(() => ({
  meta: (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '',
  // an inline handler made from script is refused by script-src (no 'unsafe-inline'): the policy is enforced, not just written
  inlineBlocked: (() => { const b = document.createElement('button'); b.setAttribute('onclick', 'window.__inlineRan = 1'); document.body.appendChild(b); b.click(); b.remove(); return !window.__inlineRan; })(),
  globals: Object.entries({ UW: typeof UW, UWEditor: typeof UWEditor, UWExport: typeof UWExport, UWFinance: typeof UWFinance, XLSX: typeof XLSX, JSZip: typeof JSZip, pdfjsLib: typeof pdfjsLib, Pipeline: typeof Pipeline, Extract: typeof Extract, Tabular: typeof Tabular }).filter(([, t]) => t === 'undefined').map(([k]) => k),
  caps: ['f_c1', 'f_c2', 'f_c3'].map((i) => document.getElementById(i).value),
  fonts: [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family.replace(/"/g, '')),
  title: document.title,
}));
check('the page carries the same policy as a <meta>, and an inline handler is refused inside it', /script-src 'self'/.test(inside.meta) && !/frame-ancestors/.test(inside.meta) && inside.inlineBlocked, inside.meta);
check('the tool\'s own code is there: the model, the export, the readers', inside.globals.length === 0, inside.globals.join());
check('the IBM Plex fonts load from this app (no outside font host)', inside.fonts.some((x) => /IBM Plex Sans/.test(x)), inside.fonts.join());

/* ---- blank cap rates */
check('the three cap rate fields are blank at start (no preset)', inside.caps.join('|') === '||', JSON.stringify(inside.caps));
check('the tool shows "enter a cap rate" rather than a value', (await f.locator('.rate-control input[placeholder="enter a cap rate"]').count()) === 3 && (await f.locator('#f_c2').evaluate((e) => e.parentElement.querySelector('.rate-equivalent').textContent)) === 'Enter a cap rate');

/* ---- the example loads; the screens work */
await f.click('#exampleLoad');
await f.waitForFunction(() => typeof UWEditor !== 'undefined' && UWEditor.model() && /example/i.test(UWEditor.model().name));
const m1 = await f.evaluate(() => { const m = UWEditor.model(); return { name: m.name, tenants: m.tenants.length, cap: m.cap, caps: m.caps ?? null, fin: UWFinance.calculate(m).errors }; });
check('the invented example loads: its tenants are there', m1.tenants >= 1 && /fictional example/i.test(m1.name), JSON.stringify(m1).slice(0, 200));
check('after the example the cap rate is still blank (not 0, not a preset), and the finance check asks for one', m1.cap === '' && m1.fin.includes('Enter the exit cap rate.'), JSON.stringify([m1.cap, m1.fin]));
for (const step of ['Review', 'Model', 'Export']) { await f.click(`.workflow-nav a:has-text("${step}")`).catch(() => {}); }
const proxy = f.locator('#f_c2').locator('xpath=following-sibling::span[contains(@class,"rate-control")]//input');
await f.evaluate(() => document.getElementById('f_c2').closest('details,section')?.scrollIntoView());
await proxy.fill('6.5'); await proxy.press('Tab');
check('typing a cap rate keeps exactly what was typed', await f.evaluate(() => { const m = UWEditor.model(); return m.cap === 0.065 && m.caps[1] === 0.065 && m.caps[0] === '' && m.caps[2] === ''; }));
await proxy.fill(''); await proxy.press('Tab');
check('clearing it makes it blank again: not 0, not the old value', await f.evaluate(() => { const m = UWEditor.model(); return m.cap === '' && m.caps.every((c) => c === ''); }));
check('Export: the tool builds its own workbook from the model (no template needed)', await f.evaluate(() => { const wb = UWExport.build(UWEditor.model()); return wb.SheetNames.length > 3; }));
await page.screenshot({ path: `${SHOTS}uwtool-phone.png` });
check('390 px: no sideways scroll on the app page', (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
await axe('phone size, open');

/* ---- cached on first open */
const b1 = await bucketsNow();
const toolBucket = Object.keys(b1).find((k) => /^zlatura-uwtool-/.test(k));
check('the first open kept the tool in its own bucket (not the install bucket)', !!toolBucket && b1[toolBucket].length > 50 && !Object.entries(b1).some(([k, v]) => k !== toolBucket && v.some((p) => /\/app\/uwtool\//.test(p))), toolBucket + ' ' + (b1[toolBucket] || []).length);

/* ---- full screen */
const [pop] = await Promise.all([ctx.waitForEvent('page'), page.click('#uwt-full')]);
await pop.waitForLoadState('load');
await pop.waitForSelector('#exampleLoad');
await ready(pop);
check('Open full screen opens the same tool in its own tab', /\/app\/uwtool\/index\.html$/.test(pop.url()) && (await pop.locator('#f_c1').inputValue()) === '');
await pop.close();

/* ---- close; other cards unchanged */
await page.click('#uwt-open');
await page.waitForSelector('#uwt-frame', { state: 'detached' });
check('Close underwriting removes the frame; every other Underwrite card is still there', (await page.locator('iframe').count()) === 0 && (await stackIds()) === 'uw-intake,uw-tool,uw-card,uw-list,uw-calc-card,uw-filler');

/* ---- offline after first use */
await ctx.setOffline(true);
const off = await ctx.newPage();
off.setDefaultTimeout(15000);
await off.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
await off.waitForSelector('#uwt-open');
await off.click('#uwt-open');
await off.waitForSelector('#uwt-frame');
let offFrame; for (let i = 0; i < 100 && !(offFrame = off.frames().find((x) => /\/app\/uwtool\/index\.html/.test(x.url()))); i++) await off.waitForTimeout(100);
await offFrame.waitForSelector('#exampleLoad');
await ready(offFrame);
await offFrame.click('#exampleLoad');
await offFrame.waitForFunction(() => /example/i.test(UWEditor.model().name));
check('offline, after first use, the tool opens and its example loads', true);
await off.close();
await ctx.setOffline(false);

/* ---- desktop */
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
await page.waitForSelector('#uwt-open');
await axe('desktop size, closed');
await page.click('#uwt-open');
await page.waitForSelector('#uwt-frame');
const fd = await getFrame();
await fd.waitForSelector('#exampleLoad');
await ready(fd);
await fd.click('#exampleLoad');
await fd.waitForFunction(() => /example/i.test(UWEditor.model().name));
check('desktop: the frame is wide, and the example loads', (await page.locator('#uwt-frame').boundingBox()).width > 600);
await page.locator('#uw-tool').screenshot({ path: `${SHOTS}uwtool-desktop.png` });
await axe('desktop size, open');

/* ---- the whole run */
check('not one request left this origin (page, frame, workers, full screen, offline run)', outside.length === 0, outside.join(' | '));
const provoked = errors.filter((e) => /Executing inline event handler violates/.test(e));   // the one violation the flow causes on purpose
const ignorable = [/Executing inline event handler violates/, /can escape its sandboxing/, /GL Driver Message|GPU stall/];   // Chrome's note about allow-same-origin; WebGL performance notes from the Monal 3D view
const unexpected = errors.filter((e) => !ignorable.some((x) => x.test(e)) && !/ERR_INTERNET_DISCONNECTED/.test(e));
check('no console error, no policy violation (but the inline-handler probe above, which proves the policy is enforced), no failed request in the tool', unexpected.length === 0 && provoked.length >= 1, `provoked ${provoked.length}; ${unexpected.join(' | ').slice(0, 400)}`);
await browser.close();
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', []);
