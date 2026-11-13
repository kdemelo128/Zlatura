/* One bird: the Underwrite tool's own bird (and its nest) opens Ask Monal in the app, over the tool, with the tool's current
 * step and the nest's tips as suggested questions. Every tip stays reachable (this step's first, the rest behind "More tips
 * from the nest"); a tip's button runs its route in the tool; coins still work; the app-wide bird stays hidden in the tool;
 * the tool alone (no app around it) keeps its own tip card. Phone and desktop, axe, no network request.
 *   node uwtool-nest-flow.mjs        # BASE=http://localhost:8080/ by default */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const toolFrame = (page) => page.frames().find((f) => /\/app\/uwtool\/index\.html/.test(f.url()));
const SIZES = [['phone', {}], ['desktop', { viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }]];

for (const [size, opts] of SIZES) {
  const { browser, ctx, page } = await phone(opts);
  page.setDefaultTimeout(25000);
  await page.emulateMedia({ reducedMotion: 'reduce' });   // the idle bird sways: a still bird can be clicked
  const outside = [];
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !/^(data|blob):/.test(r.url())) outside.push(r.url()); });
  await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#uwt-frame') && !document.querySelector('.uwt-skel'), null, { timeout: 40000 });
  const f = toolFrame(page);
  await f.waitForSelector('.juniper-guide .monal-button');
  await f.waitForFunction(() => window.MonalApp && window.UWMonalGuide && window.UWFlowGuide);

  const tips = await f.evaluate(() => window.UWMonalGuide.list());
  const step = await f.evaluate(() => window.UWFlowGuide.current().stage);
  check(`${size}: the nest lists its 16 tips, each with an id and steps`, tips.length === 16 && tips.every((t) => t.id && t.title && t.text && t.steps.length), String(tips.length));
  check(`${size}: the app-wide bird stays hidden inside the tool`, !(await page.locator('#assistant-fab').isVisible()));

  const coins = () => f.evaluate(() => JSON.parse(localStorage.getItem('uw-monal-game') || '{"coins":0}').coins);
  const c0 = await coins();
  await f.click('.juniper-guide .monal-button', { force: true });
  await page.waitForSelector('dialog.assist[open]');
  await page.waitForTimeout(300);
  check(`${size}: clicking the tool's bird opens Ask Monal in the app, not the old tip card`, await f.evaluate(() => document.querySelector('.monal-tip')?.hidden !== false));
  check(`${size}: the bird still earns a play coin (${c0} to ${await coins()})`, (await coins()) === c0 + 1);
  const mine = tips.filter((t) => t.steps.includes(step));
  const chipText = () => page.$$eval('dialog.assist .assist-chips .assist-chip', (b) => b.map((x) => x.textContent));
  const first = await chipText();
  check(`${size}: the panel says which step (${step}) and suggests that step's tips`, mine.every((t) => first.includes(t.title)) && /step/.test(await page.textContent('#assist-log')), JSON.stringify(first));
  check(`${size}: "More tips from the nest" is there`, first.includes('More tips from the nest'));
  await page.click('dialog.assist .assist-more', { force: true });
  const all = await chipText();
  const missing = tips.filter((t) => !all.includes(t.title)).map((t) => t.id);
  check(`${size}: after "More tips" every nest tip is a suggested question`, missing.length === 0, missing.join(','));

  // a tip answers with its own text and a button that runs its route in the tool
  const tip = tips.find((t) => t.id === 'reader');
  await page.click(`dialog.assist .assist-tip:text-is("${tip.title}")`);
  await page.waitForSelector('.assist-answer .assist-go');
  check(`${size}: the tip's text is the answer`, (await page.textContent('#assist-log')).includes(tip.text));
  await f.evaluate(() => { window.__tipRan = 0; const g = window.UWWorkspaceComforts; if (g) { const o = g.open; g.open = (...a) => { window.__tipRan += 1; return o && o.apply(g, a); }; } });
  await page.click('.assist-answer .assist-go');
  await page.waitForFunction(() => !document.querySelector('dialog.assist[open]'));
  await page.waitForTimeout(300);
  check(`${size}: its button closes the panel and runs the tip in the tool`, await f.evaluate(() => window.__tipRan === 1 || !!document.querySelector('dialog[open]')));

  // the page's own bridge refuses a payload with nothing usable
  check(`${size}: a payload with no tips is refused`, (await f.evaluate(() => window.MonalApp.askMonal({ step: 'model', tips: [{ id: 'x' }] }))) === false);

  // axe on the open panel
  await f.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close())); await f.click('.juniper-guide .monal-button', { force: true });
  await page.waitForSelector('dialog.assist[open]'); await page.waitForTimeout(500);
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document.querySelector('dialog.assist'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  check(`${size}: axe on Ask Monal opened from the tool`, v.length === 0, v.join('\n'));
  await page.keyboard.press('Escape');
  check(`${size}: no request left the app`, outside.length === 0, outside.join(' '));
  await browser.close();
}

// the tool on its own (no app around it) keeps its tip card
{
  const { browser, page } = await phone({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 });
  await page.goto(`${BASE}app/uwtool/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('.juniper-guide .monal-button');
  await page.waitForFunction(() => window.UWMonalGuide);
  await page.click('.juniper-guide .monal-button');
  await page.waitForTimeout(300);
  check('alone: the tool still shows its own tip card', await page.evaluate(() => window.UWMonalGuide.isOpen()));
  await browser.close();
}
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', []);
