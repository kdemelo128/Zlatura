/* Four owner-reported faults in the built-in underwriting tool (the Underwrite tab), each in a real browser, phone and
 * desktop size, light and dark:
 *   3. the small animated glass design element in the top-right corner of the tool's header was hidden by a script (orbit-ui.js):
 *      it shows again, drifts, and stands still under reduced motion;
 *   4. the panel "A little help, right here": its heading, its text under it, its Ask Monal button and its close button read at
 *      4.5:1 or more (measured from the painted colours) and axe is clean on it, in light and dark;
 *   5. the tool's Display & feel accent: a swatch recolours the tool's controls at once and is kept; the accent follows the
 *      app's own accent while the tool has none of its own, and stops following once it has; and the tool's dark theme is the
 *      app's New look dark palette (near-black neutral surfaces, soft hairlines) with AA text.
 *
 *   node uwtool-polish-flow.mjs        # BASE=http://localhost:8080/ by default */
import { createRequire } from 'module';
import fs from 'node:fs';
import { phone, BASE, finish } from './lib.mjs';

const req = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const toolFrame = (page) => page.frames().find((f) => /\/app\/uwtool\/index\.html/.test(f.url()));

// colour maths (WCAG 2.x), from a computed 'rgb(...)' / 'rgba(...)' / '#rrggbb' string
const parse = (c) => { const h = /^#([0-9a-f]{6})$/i.exec(c.trim()); if (h) return [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16)).concat(1); const m = c.match(/[\d.]+/g).map(Number); const k = /^color\(srgb/.test(c.trim()) ? 255 : 1; return [m[0] * k, m[1] * k, m[2] * k, m.length > 3 ? m[3] : 1]; };
const over = (fg, bg) => { const a = fg[3]; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat(1); };
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

async function openTool(page) {
  await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#uwt-frame') && !document.querySelector('.uwt-skel'), null, { timeout: 30000 });
  const f = toolFrame(page);
  await f.waitForFunction(() => document.querySelector('.juniper-guide') && document.querySelector('.interface-preferences'), null, { timeout: 30000 });
  return f;
}
const setTheme = async (f, t) => { await f.evaluate((x) => { document.documentElement.dataset.theme = x; }, t); await f.waitForTimeout(900); };   // (the tool's colours ease over a few hundred ms)

for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }]]) {
  const { browser, ctx, page } = await phone(opts);
  page.setDefaultTimeout(20000);
  const f = await openTool(page);

  /* ---- 3. the glass design element, top right */
  const sc = await f.evaluate(() => {
    const e = document.querySelector('.brand-sculpture'); if (!e) return null;
    const r = e.getBoundingClientRect(), h = document.querySelector('.workspace-header').getBoundingClientRect();
    const running = document.getAnimations().filter((a) => a.playState === 'running' && e.contains(a.effect && a.effect.target)).map((a) => a.animationName);
    return { hidden: e.hidden || getComputedStyle(e).display === 'none', w: Math.round(r.width), hgt: Math.round(r.height), rightGap: Math.round(h.right - r.right), top: Math.round(r.top - h.top), running, parts: e.children.length };
  });
  check(`${size}: the glass design element exists, is shown, and sits in the header's top-right corner`, !!sc && !sc.hidden && sc.w >= 100 && sc.hgt >= 100 && sc.rightGap < 60 && sc.top < 200 && sc.parts >= 3, JSON.stringify(sc));
  check(`${size}: it drifts (its animations run)`, !!sc && sc.running.length >= 2 && sc.running.every((n) => /drift/.test(n)), JSON.stringify(sc && sc.running));
  await page.screenshot({ path: `/tmp/shots/uwpolish/corner-${size}.png` }).catch(() => {});

  /* ---- 4. the guide panel, light then dark */
  for (const theme of ['light', 'dark']) {
    await setTheme(f, theme);
    const m = await f.evaluate(() => {
      const g = document.querySelector('.juniper-guide');
      const bgOf = (e) => { let c = [255, 255, 255]; const chain = []; for (let x = e; x; x = x.parentElement) chain.push(getComputedStyle(x).backgroundColor); for (const s of chain.reverse()) { const k = /^color\(srgb/.test(s) ? 255 : 1; const p = s.match(/[\d.]+/g).map(Number).map((v, i) => i < 3 ? v * k : v); const a = p.length > 3 ? p[3] : 1; c = [0, 1, 2].map((i) => p[i] * a + c[i] * (1 - a)); } return c; };
      const rows = {};
      for (const [k, sel] of [['heading', 'strong'], ['text', '#juniperHint'], ['ask', '.monal-help-link'], ['close', 'button[aria-label="Hide document guide"]']]) {
        const e = g.querySelector(sel); if (!e) { rows[k] = null; continue; }
        const cs = getComputedStyle(e); rows[k] = { fg: cs.color, bg: bgOf(e), opacity: Number(cs.opacity) };
      }
      return rows;
    });
    for (const [k, v] of Object.entries(m)) {
      const r = v ? ratio(parse(v.fg), v.bg.concat(1)) : 0;
      check(`${size} ${theme}: the panel's ${k} reads at 4.5:1 or more (${r.toFixed(2)})`, !!v && v.opacity === 1 && r >= 4.5, JSON.stringify(v));
    }
    const ax = await f.evaluate(AXE_SRC + '\n;axe.run(document.querySelector(".juniper-guide"),{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]},resultTypes:["violations"]}).then(r=>r.violations.map(v=>v.id+": "+v.nodes.map(n=>(n.any[0]&&n.any[0].message)||"").join(" | ")))');
    check(`axe ${size} ${theme}: no violations on the "A little help, right here" panel`, Array.isArray(ax) && ax.length === 0, JSON.stringify(ax));
  }

  /* ---- 5a. the dark theme is the app's New look dark palette */
  await setTheme(f, 'dark');
  const dk = await f.evaluate(() => { const cs = getComputedStyle(document.documentElement); const g = (n) => cs.getPropertyValue(n).trim(); return { bg: g('--bg'), card: g('--card'), field: g('--field'), ink: g('--ink'), muted: g('--muted'), line: g('--line'), body: getComputedStyle(document.body).backgroundColor, accent: g('--accent'), accentInk: g('--accent-ink') }; });
  const neutral = (c) => { const p = parse(c); return Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]) <= 8; };
  check(`${size}: the tool's dark surfaces are near-black neutrals (page, cards, fields)`, ['bg', 'card', 'field'].every((k) => neutral(dk[k]) && lum(parse(dk[k])) < 0.03) && neutral(dk.body), JSON.stringify(dk));
  check(`${size}: the dark hairline is soft (under 1.6:1 against the card) and the text is AA`, ratio(parse(dk.line), parse(dk.card)) < 1.6 && ratio(parse(dk.ink), parse(dk.card)) >= 7 && ratio(parse(dk.muted), parse(dk.card)) >= 4.5 && ratio(parse(dk.muted), parse(dk.bg)) >= 4.5, `${ratio(parse(dk.line), parse(dk.card)).toFixed(2)} ${ratio(parse(dk.muted), parse(dk.card)).toFixed(2)}`);
  check(`${size}: the dark accent reads on the cards and carries its label`, ratio(parse(dk.accent), parse(dk.card)) >= 4.5 && ratio(parse(dk.accentInk), parse(dk.accent)) >= 4.5, JSON.stringify(dk));
  await page.screenshot({ path: `/tmp/shots/uwpolish/dark-${size}.png` }).catch(() => {});
  await setTheme(f, 'light');

  /* ---- 5b. the accent */
  const acc = () => f.evaluate(() => { const cs = getComputedStyle(document.documentElement); const p = document.querySelector('.workflow-nav a.current'); return { accent: cs.getPropertyValue('--accent').trim(), ink: cs.getPropertyValue('--accent-ink').trim(), step: p ? getComputedStyle(p).backgroundColor : null, source: document.documentElement.dataset.toolAccent || '' }; });
  const before = await acc();
  await f.click('.interface-preferences summary');
  const sw = f.locator('.accent-swatch');
  check(`${size}: Display & feel offers "Same as the app" and six accent swatches`, (await sw.count()) === 7 && (await f.locator('.accent-swatch[aria-checked="true"]').count()) === 1, String(await sw.count()));
  if ((await sw.count()) !== 7) { await browser.close(); continue; }   // (nothing below can run without the swatches)
  await f.locator('.accent-swatch[aria-label="Green accent"]').click();
  await f.waitForTimeout(800);   // (the tool's colours ease over a few hundred ms)
  const green = await acc();
  check(`${size}: choosing Green recolours the tool's controls at once (--accent and the current step's fill)`, green.accent !== before.accent && green.source === 'own' && parse(green.step).slice(0, 3).join() === parse(green.accent).slice(0, 3).join(), JSON.stringify({ before, green }));
  check(`${size}: the chosen accent reads on the cards in the light theme, and its label on it`, ratio(parse(green.accent), parse('#FFFDF9')) >= 4.5 && ratio(parse(green.ink), parse(green.accent)) >= 4.5, JSON.stringify(green));
  await setTheme(f, 'dark');
  const greenDark = await acc();
  check(`${size}: the same choice is lighter in the dark theme and reads there too`, greenDark.accent !== green.accent && ratio(parse(greenDark.accent), parse('#1C1C1F')) >= 4.5 && ratio(parse(greenDark.ink), parse(greenDark.accent)) >= 4.5, JSON.stringify(greenDark));
  await setTheme(f, 'light');
  await f.locator('.accent-swatch[aria-label="Clay accent"]').click();
  const clay = await acc();
  check(`${size}: choosing another swatch changes it again`, clay.accent !== green.accent && clay.source === 'own', JSON.stringify(clay));
  // kept: a reload of the tool brings it back
  await f.evaluate(() => location.reload());
  await page.waitForTimeout(300);
  const f2 = await (async () => { await page.waitForFunction(() => { const fr = document.querySelector('#uwt-frame'); try { return fr && fr.contentDocument && fr.contentDocument.readyState === 'complete' && fr.contentDocument.querySelector('.interface-preferences') && !document.querySelector('.uwt-skel'); } catch { return false; } }, null, { timeout: 30000 }); return toolFrame(page); })();
  const kept = await f2.evaluate(() => ({ accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), source: document.documentElement.dataset.toolAccent || '', stored: JSON.parse(localStorage.getItem('uw-interface') || '{}').accent }));
  check(`${size}: the choice is kept after the tool reloads`, kept.accent === clay.accent && kept.source === 'own' && /^#A24B2B$/i.test(kept.stored), JSON.stringify(kept));

  // the app's own accent: ignored while the tool has its own; followed once the tool is set to "Same as the app"
  await page.evaluate(async () => { const m = await import('./app/look.js'); m.setAccent('#2F6B4F'); });
  await f2.waitForTimeout(300);
  const stillOwn = await f2.evaluate(() => ({ accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), source: document.documentElement.dataset.toolAccent }));
  check(`${size}: while the tool has its own choice, a change of the app's accent does not move it`, stillOwn.accent === clay.accent && stillOwn.source === 'own', JSON.stringify(stillOwn));
  await f2.click('.interface-preferences summary');
  await f2.locator('.accent-swatch.accent-follow').click();
  const appNow = await page.evaluate(async () => { const m = await import('./app/accent.js'); return m.accentFor('#2F6B4F').light.accent; });
  const follow = await f2.evaluate(() => ({ accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), source: document.documentElement.dataset.toolAccent }));
  check(`${size}: "Same as the app" takes the app's accent (${appNow})`, follow.source === 'app' && follow.accent.toUpperCase() === appNow.toUpperCase(), JSON.stringify(follow));
  // and follows it as it changes, while the tool is open
  await page.evaluate(async () => { const m = await import('./app/look.js'); m.setAccent('#A24B2B'); });
  await f2.waitForTimeout(400);
  const moved = await f2.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  const appClay = await page.evaluate(async () => { const m = await import('./app/accent.js'); return m.accentFor('#A24B2B').light.accent; });
  check(`${size}: and follows it as it changes while the tool is open (${appClay})`, moved.toUpperCase() === appClay.toUpperCase(), moved);
  await page.screenshot({ path: `/tmp/shots/uwpolish/accent-${size}.png` }).catch(() => {});

  // reduced motion: the element stays, and stands still
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(400);
  const rm = await f2.evaluate(() => { const e = document.querySelector('.brand-sculpture'); const r = e.getBoundingClientRect(); return { shown: r.width >= 100 && !e.hidden, running: document.getAnimations().filter((a) => a.playState === 'running' && e.contains(a.effect && a.effect.target)).length }; });
  check(`${size}: under reduced motion the element is still there and does not move`, rm.shown && rm.running === 0, JSON.stringify(rm));
  void ctx;
  await browser.close();
}

for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', []);
