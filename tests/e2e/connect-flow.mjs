/* The Connect page: reachable from the navigation (the sidebar on a desktop, the top bar on a phone) and the
 * command palette; tabs; every category and row from the one list; states; search; the state buttons do what they
 * say; no network request of its own; axe in both looks, light and dark; 44 px targets; no logos; reduced motion. */
import { createRequire } from 'module';
import fs from 'fs';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const SHOT = process.env.CONNECT_SHOTS || '';
if (SHOT) fs.mkdirSync(SHOT, { recursive: true });
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function audit(page, name) {
  await page.waitForTimeout(500);
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }, TAGS);
  check(`axe: ${name}`, res.length === 0, res.join('\n    '));
}

for (const size of ['phone', 'desktop']) {
  const o = size === 'phone' ? {} : { viewport: { width: 1360, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 };
  const { browser, page, errors } = await phone(o);
  const outside = [];
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !/^(data|blob):/.test(r.url())) outside.push(r.url()); });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('#view-home', { state: 'visible', timeout: 8000 });
  await page.evaluate(() => localStorage.setItem('zlatura.look', 'new'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-home', { state: 'visible', timeout: 8000 });

  // reachable from the navigation
  if (size === 'desktop') await page.click('.sidebar .tab[data-view="connect"]'); else await page.click('.appbar-connect');
  await page.waitForSelector('#view-connect h1');
  check(`${size}: the nav opens Connect, titled`, (await page.title()).startsWith('Connect') && await page.isVisible('#view-connect') && (await page.textContent('#view-connect h1')) === 'Connect');
  check(`${size}: the other navigation entry is hidden where it would repeat`, size === 'desktop' ? !(await page.isVisible('.appbar-connect')) : !(await page.isVisible('.sidebar')));

  // structure: tabs, banner, categories with headings, lists, rows
  const tabs = await page.$$eval('[role=tab]', (t) => t.map((x) => [x.textContent, x.getAttribute('aria-selected')]));
  check(`${size}: two tabs, Connectors selected`, JSON.stringify(tabs) === JSON.stringify([['Connectors', 'true'], ['My data', 'false']]), JSON.stringify(tabs));
  const heads = await page.$$eval('#connect-list h2', (h) => h.map((x) => x.textContent));
  check(`${size}: nine categories, each a heading`, heads.length === 9 && heads[0] === 'Assistants' && heads[8] === 'API', heads.join('|'));
  check(`${size}: each category is a list of rows, with a banner above`, (await page.$$eval('#connect-list ul.conn-grid', (u) => u.every((x) => x.querySelectorAll(':scope > li').length > 0))) && await page.isVisible('.conn-banner'));
  const states = await page.$$eval('.conn-row .conn-btn', (b) => [...new Set(b.map((x) => x.dataset.state))].sort());
  check(`${size}: only the four allowed states appear`, JSON.stringify(states) === JSON.stringify(['Built in', 'Coming soon', 'Import file', 'Needs your approval']), states.join('|'));
  check(`${size}: no row has an image`, (await page.$$eval('#view-connect img, #view-connect svg image, #view-connect [style*="background-image"]', (x) => x.length)) === 0);
  const cols = await page.$eval('.conn-grid', (g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
  check(`${size}: ${size === 'phone' ? 'one' : 'two'} column grid`, cols === (size === 'phone' ? 1 : 2), String(cols));
  const small = await page.$$eval('#view-connect button, #view-connect input', (n) => n.filter((x) => { const r = x.getBoundingClientRect(); return r.width && (r.height < 43.5 || r.width < 43.5); }).map((x) => `${x.textContent || x.id} ${Math.round(x.getBoundingClientRect().width)}x${Math.round(x.getBoundingClientRect().height)}`));
  check(`${size}: every button and field is at least 44 px`, small.length === 0, small.join('; '));
  await page.waitForTimeout(900);
  if (SHOT) await page.screenshot({ path: `${SHOT}/${size}-new-light.png`, fullPage: true });

  // search
  await page.fill('#connect-search', 'zapier');
  check(`${size}: search narrows to the matching row and drops empty categories`, (await page.$$eval('.conn-row', (r) => r.map((x) => x.dataset.id))).join() === 'zapier' && (await page.$$('#connect-list h2')).length === 1);
  check(`${size}: the count is announced`, /1 match/.test(await page.textContent('.conn-status')));
  await page.fill('#connect-search', 'qqqq');
  check(`${size}: a miss says so`, /Nothing matches/.test(await page.textContent('.conn-status')) && (await page.$$('.conn-row')).length === 0);
  await page.fill('#connect-search', '');
  check(`${size}: clearing the search brings every row back`, (await page.$$('.conn-row')).length > 25);

  // state buttons
  await page.click('.conn-row[data-id="salesforce"] .conn-btn');
  await page.waitForSelector('#sheet[open]');
  check(`${size}: Coming soon opens a sheet that says what it waits for`, /Planned/.test(await page.textContent('#sheet-body')) && (await page.textContent('#sheet-title')) === 'Salesforce');
  await page.click('#sheet-close');
  await page.click('.conn-row[data-id="zapier"] .conn-btn');
  await page.waitForSelector('#sheet[open]');
  check(`${size}: Needs your approval says why`, /third party/.test(await page.textContent('#sheet-body')));
  await page.click('#sheet-close');
  await page.click('.conn-row[data-id="costar-file"] .conn-btn');
  await page.waitForSelector('#view-comps', { state: 'visible' });
  check(`${size}: Import file opens the Comps importer`, await page.isVisible('#view-comps') && await page.$eval('#file', (f) => f.type === 'file'));
  await page.evaluate(() => { location.hash = '#connect'; });
  await page.waitForSelector('#view-connect h1');
  await page.click('.conn-row[data-id="monal-assistant"] .conn-btn');
  await page.waitForSelector('dialog.assist[open]');
  check(`${size}: Built in opens the assistant`, true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // tabs by keyboard
  await page.focus('#connect-tab-connectors');
  await page.keyboard.press('ArrowRight');
  check(`${size}: arrow keys move between the tabs`, (await page.getAttribute('#connect-tab-mydata', 'aria-selected')) === 'true' && await page.evaluate(() => document.activeElement.id) === 'connect-tab-mydata');
  await page.click('#connect-tab-connectors');

  // the command palette finds Connect and My data
  await page.keyboard.press('Control+k');
  await page.fill('#cmdk-input', 'connect');
  await page.waitForSelector('.cmdk-item');
  check(`${size}: the command palette lists Connect`, (await page.$$eval('.cmdk-item .t', (t) => t.map((x) => x.textContent))).includes('Connect'));
  await page.fill('#cmdk-input', 'my data');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#connect-tab-mydata[aria-selected="true"]');
  check(`${size}: "My data" in the palette opens that tab`, await page.isVisible('#view-connect'));
  await page.click('#connect-tab-connectors');

  // looks, themes, reduced motion
  for (const [look, theme] of [['new', 'light'], ['new', 'dark'], ['classic', 'light'], ['classic', 'dark']]) {
    await page.evaluate(([l, t]) => { localStorage.setItem('zlatura.look', l); localStorage.setItem('zlatura.theme', t); document.documentElement.dataset.look = l; document.documentElement.dataset.theme = t; }, [look, theme]);
    await page.waitForTimeout(450);
    await audit(page, `${size} ${look} ${theme}`);
    if (SHOT && !(look === 'new' && theme === 'light')) await page.screenshot({ path: `${SHOT}/${size}-${look}-${theme}.png`, fullPage: true });
  }
  await page.evaluate(() => { localStorage.setItem('zlatura.look', 'new'); document.documentElement.dataset.look = 'new'; });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.conn-row');
  check(`${size}: reduced motion: rows do not animate`, await page.$eval('.conn-row', (r) => getComputedStyle(r).animationName === 'none'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.conn-row');
  check(`${size}: otherwise rows rise in`, await page.$eval('.conn-row', (r) => getComputedStyle(r).animationName === 'conn-rise'));

  check(`${size}: no request left this origin`, outside.length === 0, outside.join(' '));
  check(`${size}: no console errors`, errors.length === 0, errors.join(' | '));
  await browser.close();
}
for (const r of R) console.log(r[0], '|', r[1], r[2] ? `| ${r[2]}` : '');
finish(R);
