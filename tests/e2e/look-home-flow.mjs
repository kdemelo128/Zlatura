/* UI look PR 2: Home and the pipeline in the New look, and the owner's three additions (accent, hover preview, pointer
 * feel). At phone size (touch) and desktop, light and dark, New look on: axe finds nothing on Home with no deals and with
 * a deal; nothing scrolls sideways; on touch every control is 44 px; exactly one primary button; the empty states say what
 * to do next; every Home control Classic has is still there. Classic keeps its tiles and has no accent, preview or glow.
 * The accent picker refuses a non-colour, adjusts a pale yellow until text reads in both themes, applies a good colour and
 * keeps it across a reload. The preview bubble shows on hover and keyboard focus on desktop, not on touch, and Escape
 * closes it. Reduced motion and the Motion switch stop the fade and the glow. The text size is device-only. */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const errs = [];

async function axe(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] });
    return r.violations.map((x) => `${x.id} (${x.impact}) -> ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }, TAGS);
  check(`${label}: axe finds nothing`, res.length === 0, res.join('\n    '));
}
const small = (page) => page.evaluate(() => {
  const out = [];
  for (const e of document.querySelectorAll('#view-home button, #view-home select, #view-home input:not([type=hidden]):not([type=file]), #view-home summary, #view-home label.btn')) {
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    let r = e.getBoundingClientRect();
    if (!r.width || !r.height || e.matches('.switch input')) continue;
    if (e.matches('input[type=checkbox], input[type=radio]')) { const l = e.closest('label'); if (l) r = l.getBoundingClientRect(); }
    if (r.width < 43.5 || r.height < 43.5) out.push(`${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/).join('.')} ${Math.round(r.width)}x${Math.round(r.height)} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 18)}"`);
  }
  return out;
});
/** The names of every Home control (a time such as "updated 3 min ago" is not part of a name). */
const actions = (page) => page.evaluate(() => [...document.querySelectorAll('#view-home button, #view-home a[href], #view-home input:not([type=hidden]), #view-home select, #view-home label.btn')].map((e) => {
  if (e.matches('.pipe-open')) return `deal:${e.querySelector('b').textContent}`;
  if (e.matches('.cont-row')) return `deal:${e.querySelector('.cont-name').textContent}`;
  return (e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.textContent || e.id).trim().replace(/\s+/g, ' ');
}).sort());
const go = async (page, v) => { await page.evaluate((x) => { location.hash = `#${x}`; }, v); await page.waitForSelector(`#view-${v}`, { state: 'visible' }); await page.waitForTimeout(500); };
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const primaries = (page) => page.evaluate(() => [...document.querySelectorAll('#view-home .btn-primary')].filter((e) => e.getBoundingClientRect().width > 0).length);
const contrast = (page, fgVar, bgVars) => page.evaluate(([fg, bgs]) => {
  const px = (v) => { const c = document.createElement('i'); c.style.color = `var(${v})`; document.body.appendChild(c); const m = getComputedStyle(c).color.match(/[\d.]+/g).map(Number); c.remove(); return m; };
  const L = (c) => { const l = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
  const a = L(px(fg));
  return Math.min(...bgs.map((b) => { const c = L(px(b)); return (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05); }));
}, [fgVar, bgVars]);

for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }]]) {
  const { browser, page, errors } = await phone(opts);
  await page.goto(BASE + '#home', { waitUntil: 'load' });
  await page.waitForSelector('#home-root h1');
  await page.waitForTimeout(400);
  const look = (v) => page.evaluate(async (x) => { const m = await import(new URL('app/look.js', location.href).href); m.setLook(x); }, v);

  // ---- Classic, pinned: tiles, no summary line, no accent, no preview, no glow
  const classicEmpty = await actions(page);
  check(`${size}: Classic Home keeps its four tiles and no New look markup`, (await page.locator('#home-root .home-tiles .tile').count()) === 4 && (await page.locator('.home-sumline, .notice').count()) === 0);
  check(`${size}: Classic has no accent override and no preview bubble`, (await page.getAttribute('html', 'data-accent')) === null);
  if (size === 'desktop') { await page.hover('.sidebar .tab[data-view="deal"]'); await page.waitForTimeout(800); check('desktop: Classic shows no preview bubble', (await page.locator('#preview-bubble').count()) === 0); }

  // ---- New look, no deals
  await look('new');
  await go(page, 'settings'); await go(page, 'home');
  const newEmpty = await actions(page);
  const lost = classicEmpty.filter((a) => !newEmpty.includes(a));
  check(`${size}: every Classic Home control is still there (no deals)`, lost.length === 0, `missing: ${lost.join(' | ')}`);
  check(`${size}: the New look draws the summary as one line, not four tiles`, (await page.locator('.home-sumline').count()) === 1 && (await page.locator('#home-root .home-tiles .tile').count()) === 0 && /active deals?/.test(await page.textContent('.home-sumline')));
  const empties = await page.locator('#view-home .notice').allTextContents();
  check(`${size}: empty states say what to do next, as buttons`, empties.some((t) => /No deals yet/.test(t) && /Read an OM/.test(t)) && empties.some((t) => /Nothing to do yet/.test(t) && /Add a task/.test(t)) && empties.some((t) => /No contacts yet/.test(t) && /Add a contact/.test(t)) && empties.some((t) => /fictional example/.test(t)), empties.join(' || '));
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme }); await page.waitForTimeout(300);
    check(`${size}, ${scheme}: Home (no deals) does not scroll sideways`, (await sideways(page)) <= 0, `${await sideways(page)}px`);
    check(`${size}, ${scheme}: one primary button on Home`, (await primaries(page)) === 1, String(await primaries(page)));
    await axe(page, `${size}, ${scheme}: Home with no deals`);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  if (size === 'phone') { const s = await small(page); check('phone: every control on Home (no deals) is 44 px', s.length === 0, s.slice(0, 10).join('; ')); }

  // ---- a deal in the pipeline
  await look('classic');
  await go(page, 'deal');
  await page.setInputFiles('#om-file', F + 'om-retail.pdf');
  await page.waitForSelector('#deal-crm #deal-stage', { timeout: 60000 });
  await go(page, 'home');
  await page.waitForSelector('#home-pipeline .pipe');
  const classicDeal = await actions(page);
  await look('new');
  await go(page, 'settings'); await go(page, 'home');
  await page.waitForSelector('#home-pipeline .pipe');
  const newDeal = await actions(page);
  const lost2 = classicDeal.filter((a) => !newDeal.includes(a));
  check(`${size}: every Classic Home and pipeline control is still there (with a deal)`, lost2.length === 0, `missing: ${lost2.join(' | ')}`);
  check(`${size}: the stage is a chip (a word and a shape)`, (await page.locator('#home-continue .chip').count()) >= 1 && (await page.locator('#home-continue .stage-pill').count()) === 0);
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme }); await page.waitForTimeout(300);
    check(`${size}, ${scheme}: Home with a deal does not scroll sideways`, (await sideways(page)) <= 0, `${await sideways(page)}px`);
    check(`${size}, ${scheme}: the pipeline board does not scroll sideways inside its card`, await page.evaluate(() => { const p = document.querySelector('#home-pipeline .pipe'); return p.scrollWidth <= p.clientWidth + 1 || innerWidth >= 760; }));
    check(`${size}, ${scheme}: one primary button on Home`, (await primaries(page)) === 1);
    await axe(page, `${size}, ${scheme}: Home with a deal and the pipeline`);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  if (size === 'phone') { const s = await small(page); check('phone: every control on Home and the pipeline is 44 px', s.length === 0, s.slice(0, 10).join('; ')); }

  // ---- pointer feel and the preview (desktop only; none of it on touch)
  if (size === 'desktop') {
    const card = page.locator('#home-pipeline .pipe-card').first();
    await card.hover({ position: { x: 20, y: 18 } });
    await page.waitForTimeout(150);
    const mx = await card.evaluate((e) => e.style.getPropertyValue('--mx'));
    check('desktop: a card carries the pointer position as it is hovered', /^\d+px$/.test(mx), mx);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await card.evaluate((e) => { e.style.removeProperty('--mx'); });
    await page.mouse.move(5, 5); await card.hover({ position: { x: 30, y: 20 } }); await page.waitForTimeout(150);
    check('desktop: reduced motion stops the pointer feel', (await card.evaluate((e) => e.style.getPropertyValue('--mx'))) === '' && (await card.evaluate((e) => getComputedStyle(e).backgroundImage)) === 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.click('#view-home h1'); // let go of the last hover
    await page.evaluate(async () => { const m = await import(new URL('app/look.js', location.href).href); m.setMotion(false); });
    await page.mouse.move(5, 5); await card.hover({ position: { x: 30, y: 20 } }); await page.waitForTimeout(150);
    check('desktop: the Motion switch off stops the pointer feel', (await card.evaluate((e) => getComputedStyle(e).backgroundImage)) === 'none');
    await page.evaluate(async () => { const m = await import(new URL('app/look.js', location.href).href); m.setMotion(true); });

    const tab = page.locator('.sidebar .tab[data-view="deal"]');
    await tab.hover();
    await page.waitForSelector('#preview-bubble', { timeout: 2500 });
    const t1 = await page.textContent('#preview-bubble');
    check('desktop: hovering a section shows a preview with its name, purpose and live facts', /Deals/.test(t1) && /Read an offering memorandum/.test(t1) && /1 deal/.test(t1), t1);
    const pe = await page.evaluate(() => { const b = document.querySelector('#preview-bubble'); return { role: b.getAttribute('role'), pe: getComputedStyle(b).pointerEvents, anim: getComputedStyle(b).animationName, tabbable: b.tabIndex }; });
    check('desktop: the preview is a tooltip that cannot take the focus, and fades in', pe.role === 'tooltip' && pe.pe === 'none' && pe.tabbable === -1 && pe.anim === 'preview-in', JSON.stringify(pe));
    const glass = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('#preview-bubble')); const m = s.backgroundColor.match(/[\d.]+/g); return { blur: /blur/.test(s.backdropFilter || ''), a: m.length > 3 ? +m[3] : 1 }; });
    check('desktop: the preview follows the glass rule (92% or more opaque)', glass.a >= 0.92, JSON.stringify(glass));
    const box = await page.evaluate(() => { const r = document.querySelector('#preview-bubble').getBoundingClientRect(), t = document.querySelector('.sidebar .tab[data-view="deal"]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, tx: t.right, ty: t.top, th: t.height, fixed: getComputedStyle(document.querySelector('#preview-bubble')).position }; });
    check('desktop: the preview is on screen, beside the section it describes', box.fixed === 'fixed' && box.x >= box.tx && box.x <= box.tx + 40 && box.y >= 0 && box.y + box.h <= 800 && Math.abs(box.y + box.h / 2 - (box.ty + box.th / 2)) < box.h, JSON.stringify(box));
    await page.keyboard.press('Escape');
    check('desktop: Escape closes the preview', (await page.locator('#preview-bubble').count()) === 0);
    await page.mouse.move(700, 500); await page.waitForTimeout(100);
    // keyboard focus
    await page.keyboard.press('Tab');
    await page.evaluate(() => document.querySelector('.sidebar .tab[data-view="comps"]').focus());
    await page.waitForSelector('#preview-bubble', { timeout: 2500 });
    check('desktop: keyboard focus on a section shows its preview, and the focus stays on the section', /Comps/.test(await page.textContent('#preview-bubble')) && (await page.evaluate(() => document.activeElement.dataset.view)) === 'comps');
    await page.keyboard.press('Escape');
    check('desktop: Escape closes it and the focus stays', (await page.locator('#preview-bubble').count()) === 0 && (await page.evaluate(() => document.activeElement.dataset.view)) === 'comps');
    // reduced motion: shown without a fade
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.mouse.move(700, 500); await tab.hover();
    await page.waitForSelector('#preview-bubble', { timeout: 2500 });
    check('desktop: with reduced motion the preview appears with no fade', (await page.evaluate(() => getComputedStyle(document.querySelector('#preview-bubble')).animationName)) === 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.mouse.move(700, 500); await page.waitForTimeout(100);
    // a workspace in the rail
    const ws = page.locator('.wsp-rail-tab[data-ws]').first();
    await ws.hover();
    await page.waitForSelector('#preview-bubble', { timeout: 2500 });
    const wt = await page.textContent('#preview-bubble');
    check('desktop: a workspace in the rail previews its name, purpose, tool count and live facts', /Brokerage/.test(wt) && /tools? first/.test(wt) && /active deal/.test(wt), wt);
    await page.mouse.move(700, 500); await page.waitForTimeout(200);
    check('desktop: leaving the entry closes the preview', (await page.locator('#preview-bubble').count()) === 0);
  } else {
    await page.locator('.tabbar .tab[data-view="deal"]').first().tap().catch(() => {});
    await page.waitForTimeout(900);
    check('phone: touch shows no preview bubble', (await page.locator('#preview-bubble').count()) === 0);
    await go(page, 'home');
  }

  // ---- accent: Settings > Appearance
  await go(page, 'settings');
  const say = () => page.textContent('#accent-say');
  await page.fill('#accent-custom', 'red-ish');
  await page.click('#accent-apply');
  check(`${size}: a value that is not a colour is refused, with the fix`, /not a colour/.test(await say()) && (await page.getAttribute('html', 'data-accent')) === null, await say());
  await page.fill('#accent-custom', '#FFFF99');
  await page.click('#accent-apply');
  check(`${size}: a pale yellow is adjusted, and the person is told`, /adjusted/.test(await say()) && (await page.getAttribute('html', 'data-accent')) === '1', await say());
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme }); await page.waitForTimeout(250);
    const c1 = await contrast(page, '--accent', ['--bg', '--surface', '--surface-2', '--accent-soft']);
    const c2 = await contrast(page, '--primary-ink', ['--primary']);
    check(`${size}, ${scheme}: the adjusted yellow reads at 4.5:1 as text, and the button label on it`, c1 >= 4.5 && c2 >= 4.5, `text ${c1.toFixed(2)}, label ${c2.toFixed(2)}`);
    await axe(page, `${size}, ${scheme}: Settings with the adjusted accent`);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.fill('#accent-custom', '#2F5D9E');
  await page.press('#accent-custom', 'Enter');
  const want = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toUpperCase());
  check(`${size}: a good colour applies as typed`, want === '#2F5D9E' && /Accent set to #2F5D9E/.test(await say()), `${want} | ${await say()}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-settings, #view-home', { state: 'attached' });
  const kept = await page.evaluate(() => ({ a: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toUpperCase(), d: document.documentElement.dataset.accent, ls: localStorage.getItem('zlatura.accent') }));
  check(`${size}: the accent is kept across a reload, on this device only`, kept.a === '#2F5D9E' && kept.d === '1' && /2F5D9E/.test(kept.ls), JSON.stringify(kept));
  await go(page, 'home');
  const prim = await page.evaluate(() => getComputedStyle(document.querySelector('#view-home .btn-primary')).backgroundColor);
  check(`${size}: Home takes the chosen accent`, prim === 'rgb(47, 93, 158)', prim);
  await axe(page, `${size}: Home with the blue accent`);
  await go(page, 'settings');
  await page.click('[data-accent-set="#78516C"]');
  check(`${size}: choosing plum again clears the choice`, (await page.getAttribute('html', 'data-accent')) === null && (await page.evaluate(() => localStorage.getItem('zlatura.accent'))) === null);

  // ---- text size (device-only) and the Motion switch
  await page.click('[data-size-set="130"]');
  const fs130 = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  check(`${size}: text size 130% makes the root 20.8 px, and is kept on this device`, Math.abs(fs130 - 20.8) < 0.1 && (await page.evaluate(() => localStorage.getItem('zlatura.textsize'))) === '130', String(fs130));
  check(`${size}: text at 130% does not scroll sideways on Home`, await (async () => { await go(page, 'home'); return (await sideways(page)) <= 0; })(), `${await sideways(page)}px`);
  await go(page, 'settings');
  await page.click('[data-size-set="100"]');
  check(`${size}: text size 100% clears the choice`, (await page.evaluate(() => localStorage.getItem('zlatura.textsize'))) === null);
  await page.click('[data-motion-toggle]');
  check(`${size}: the Motion switch is kept on this device`, (await page.getAttribute('html', 'data-motion')) === 'off' && (await page.evaluate(() => localStorage.getItem('zlatura.motion'))) === 'off');
  await page.click('[data-motion-toggle]');
  check(`${size}: turning Motion on again clears it`, (await page.getAttribute('html', 'data-motion')) === null);

  // ---- back to Classic, untouched
  await page.click('[data-look-set="classic"]');
  await go(page, 'home');
  check(`${size}: back in Classic, Home has its tiles and no summary line`, (await page.locator('#home-root .home-tiles .tile').count()) === 4 && (await page.locator('.home-sumline').count()) === 0);
  await browser.close();
  errs.push(...errors);
}
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errs);
