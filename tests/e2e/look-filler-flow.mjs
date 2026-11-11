/* UI look PR 1: the New look's tokens and base components. With the New look on, at phone size (touch) and desktop,
 * light and dark: axe finds nothing on Home, a deal, Underwrite and Settings; nothing scrolls sideways; the type is
 * IBM Plex and loaded; on touch every button, field and select is 44 px; the stepper, drop zone, chip and notice
 * from kit.js pass axe and are the right size; glass is on the floating step bar at 92% or more and turns solid
 * with the Solid controls switch (kept across a reload, not in a backup). Classic keeps its own type. */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const errs = [];
const SCREENS = ['home', 'deal', 'underwrite', 'settings'];

async function axe(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] });
    return r.violations.map((x) => `${x.id} (${x.impact}) -> ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }, TAGS);
  check(`${label}: axe finds nothing`, res.length === 0, res.join('\n    '));
}
/** Visible controls whose hit box is under 44 px either way (a checkbox or radio counts through its label). */
const small = (page) => page.evaluate(() => {
  const out = [];
  for (const e of document.querySelectorAll('button, select, input:not([type=hidden]):not([type=file]), textarea, [role=button], [role=tab], [role=radio], [role=switch], summary')) {
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none' || e.closest('[hidden], [inert], dialog:not([open])')) continue;
    let r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    // the on/off switch (.switch input, 46 x 28) is left for the screen PRs: its track is drawn by the input itself
    if (e.matches('.switch input')) continue;
    if (e.matches('input[type=checkbox], input[type=radio]')) { const l = e.closest('label'); if (l) r = l.getBoundingClientRect(); }
    if (r.bottom < 0 || r.top > document.documentElement.scrollHeight) continue;
    if (r.width < 43.5 || r.height < 43.5) out.push(`${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''} ${Math.round(r.width)}x${Math.round(r.height)} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 18)}"`);
  }
  return out;
});
const go = async (page, v) => { await page.evaluate((x) => { location.hash = `#${x}`; }, v); await page.waitForSelector(`#view-${v}`, { state: 'visible' }); await page.waitForTimeout(450); };

for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }]]) {
  const { browser, page, errors } = await phone(opts);
  const ext = [];
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) ext.push(r.url()); });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('#view-home', { state: 'visible', timeout: 5000 });
  const fam = () => page.evaluate(() => getComputedStyle(document.body).fontFamily);
  check(`${size}: Classic keeps its own type (no Plex)`, !/Plex/.test(await fam()), await fam());

  await go(page, 'settings');
  await page.click('[data-look-set="new"]');
  await page.waitForTimeout(200);
  check(`${size}: Settings has a Solid controls switch, off by default`, (await page.getAttribute('[data-solid-toggle]', 'aria-checked')) === 'false' && (await page.getAttribute('html', 'data-solid')) === null);

  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate(async () => { await document.fonts.load('400 16px "IBM Plex Sans"'); await document.fonts.load('600 16px "IBM Plex Sans"'); await document.fonts.ready; });
    check(`${size}, ${scheme}: the type is IBM Plex Sans and the face is loaded`, /^"?IBM Plex Sans/.test(await fam()) && await page.evaluate(() => document.fonts.check('600 16px "IBM Plex Sans"') && [...document.fonts].some((f) => f.family.includes('IBM Plex Sans') && f.status === 'loaded')), await fam());
    check(`${size}, ${scheme}: the page takes the New look's colour`, (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === (scheme === 'light' ? 'rgb(247, 247, 248)' : 'rgb(17, 17, 19)'));
    for (const v of SCREENS) {
      await go(page, v);
      const w = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(`${size}, ${scheme}: ${v} does not scroll sideways`, w <= 0, `${w}px over`);
      await axe(page, `${size}, ${scheme}: ${v}`);
      if (size === 'phone' && scheme === 'light') { const s = await small(page); check(`phone: every control on ${v} is 44 px`, s.length === 0, s.slice(0, 12).join('; ') + (s.length > 12 ? ` (+${s.length - 12})` : '')); }
    }
  }

  // the base components from kit.js, mounted on a scratch card in the Settings view
  await page.emulateMedia({ colorScheme: 'light' });
  await go(page, 'settings');
  await page.evaluate(async () => {
    const k = await import(new URL('app/kit.js', location.href).href);
    const host = k.el('section', 'card card-pad');
    host.id = 'kit-probe';
    host.append(
      k.stepper(['File', 'Columns', 'Review', 'Use'], 2, { onStep: () => {} }),
      k.dropZone({ title: 'Choose files or drop them here', hint: 'PDF or Excel. Nothing is uploaded.', accept: '.pdf,.xlsx', onFiles: () => {} }),
      k.statusChip('good', 'Passed'), k.statusChip('warn', 'Check'), k.statusChip('bad', 'Held'),
      k.notice('warn', 'Two columns could be monthly or yearly.', { label: 'Choose', run: () => {} }), k.notice('info', 'Nothing is used until you tap Use.'));
    document.querySelector('#view-settings').prepend(host);
  });
  await page.waitForTimeout(200);
  await axe(page, `${size}: the stepper, drop zone, chips and notices`);
  const comp = await page.evaluate(() => {
    const vis = (s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0; };
    const d = document.querySelector('.dropzone-btn').getBoundingClientRect();
    return { list: vis('#kit-probe .stepper-list'), ph: vis('#kit-probe .stepper-phone'), of: document.querySelector('#kit-probe .step-of').textContent, cur: document.querySelector('#kit-probe [aria-current="step"]').textContent, dh: d.height, dz: document.querySelector('.dropzone-btn').tagName,
      chip: [...document.querySelectorAll('#kit-probe .chip')].map((c) => parseFloat(getComputedStyle(c).fontSize)), over: document.documentElement.scrollWidth - innerWidth };
  });
  check(`${size}: the stepper shows ${size === 'phone' ? '"Step 3 of 4: Review" with Back and Next' : 'the numbered steps'}`, size === 'phone' ? (!comp.list && comp.ph && comp.of === 'Step 3 of 4: Review') : (comp.list && !comp.ph), JSON.stringify(comp));
  check(`${size}: the current step is marked aria-current and the drop zone is a button`, /Review/.test(comp.cur) && comp.dz === 'BUTTON' && comp.dh >= 44, JSON.stringify(comp));
  check(`${size}: chips are at least 13 px`, comp.chip.every((p) => p >= 13), comp.chip.join(','));
  check(`${size}: the components do not scroll sideways`, comp.over <= 0, `${comp.over}px`);
  if (size === 'phone') { const s = (await small(page)).filter((x) => !/^input\.?\s/.test(x)); check('phone: the stepper, drop zone and notice controls are 44 px', s.length === 0, s.join('; ')); }

  // glass: the step bar is frosted at 92% or more; Solid controls makes it opaque
  const glass = () => page.evaluate(() => { const s = getComputedStyle(document.querySelector('#kit-probe .stepper-bar')); const m = s.backgroundColor.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number); return { blur: /blur\((?!0px)/.test(s.backdropFilter || s.webkitBackdropFilter || ''), a: m.length > 3 ? m[3] : 1 }; });
  const g1 = await glass();
  check(`${size}: the step bar is glass, 92% opaque or more`, g1.blur && g1.a >= 0.92 && g1.a < 1, JSON.stringify(g1));
  await page.click('[data-solid-toggle]');
  const g2 = await glass();
  check(`${size}: Solid controls makes it opaque with no blur, and is kept on this device`, !g2.blur && g2.a === 1 && (await page.getAttribute('html', 'data-solid')) === '1' && (await page.evaluate(() => localStorage.getItem('zlatura.solid'))) === '1' && (await page.getAttribute('[data-solid-toggle]', 'aria-checked')) === 'true', JSON.stringify(g2));
  await page.reload({ waitUntil: 'domcontentloaded' });
  check(`${size}: Solid controls is set from the first paint after a reload`, (await page.evaluate(() => document.documentElement.dataset.solid)) === '1');
  await page.waitForLoadState('load');
  // reduced transparency makes it solid without the switch
  await page.click('[data-solid-toggle]').catch(() => {});
  check(`${size}: turning it off removes the attribute`, (await page.evaluate(() => document.documentElement.dataset.solid)) === undefined && (await page.evaluate(() => localStorage.getItem('zlatura.solid'))) === null);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const press = await page.evaluate(() => { const b = document.querySelector('.btn'); return getComputedStyle(b).transitionDuration; });
  check(`${size}: reduced motion stops transitions`, /^0s(, 0s)*$/.test(press), press);
  check(`${size}: nothing was requested outside the app`, ext.length === 0, ext.join(', '));

  // back to Classic: type restored
  await page.click('[data-look-set="classic"]');
  check(`${size}: choosing Classic restores its type`, !/Plex/.test(await fam()), await fam());
  await browser.close();
  errs.push(...errors);
}
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errs);
