/* Two owner-reported faults in the built-in tool.
 * A. The Excel preview (hover or click on "Your Excel workbook") said "End of data reached (data length = 0 ...
 *    Corrupted zip?": the cleaned tool carries no firm template, so the workbook builder merged into empty bytes. With no
 *    template the preview, and the tool's own export, are the workbook the tool builds itself; and a failure is a plain
 *    sentence, never a library error.
 * B. When the tab opened, the tool's early paint (its old cartoon bird guide, before its own scripts replaced it) showed
 *    for a moment. The frame now stays behind a calm skeleton until that has been replaced, then fades in (none under
 *    prefers-reduced-motion). Also with a deal open (the fill reload), and when the Quick view is left (the frame is kept).
 *
 *   node uwtool-fixes-flow.mjs        # BASE=http://localhost:8080/ by default */
import { phone, BASE, finish } from './lib.mjs';

const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const toolFrame = (page) => page.frames().find((f) => /\/app\/uwtool\/index\.html/.test(f.url()));

for (const [size, opts] of [['phone', {}], ['desktop', { viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }]]) {
  const { browser, page } = await phone(opts);
  page.setDefaultTimeout(20000);
  await page.goto(`${BASE}#home`, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  /* ---- B: no flash. Sample the page every 25 ms from the moment the tab opens. */
  await page.evaluate(() => {
    window.__flash = { samples: 0, bird: 0, shown: 0, skelFirst: null, firstVisibleAt: null };
    const t0 = performance.now();
    const tick = () => {
      const f = document.querySelector('#uwt-frame');
      if (f) {
        const o = Number(getComputedStyle(f).opacity); const s = window.__flash; s.samples++;
        if (s.skelFirst === null) s.skelFirst = !!document.querySelector('.uwt-skel');
        let old = false; try { const g = f.contentDocument && f.contentDocument.querySelector('.juniper-guide strong'); old = !!g && g.textContent === 'One step at a time.'; } catch { /* fine */ }
        if (o > 0.02) { s.shown++; if (s.firstVisibleAt === null) s.firstVisibleAt = Math.round(performance.now() - t0); if (old) s.bird++; }
      }
      if (performance.now() - t0 < 14000) setTimeout(tick, 25);
    };
    tick();
  });
  await page.evaluate(() => { location.hash = '#underwrite'; });
  await page.waitForSelector('#uwt-frame');
  await page.waitForFunction(() => !document.querySelector('.uwt-skel'), null, { timeout: 20000 });
  await page.waitForTimeout(700);
  const fl = await page.evaluate(() => window.__flash);
  check(`${size}: a skeleton is there from the first moment the frame exists`, fl.skelFirst === true, JSON.stringify(fl));
  check(`${size}: the old bird guide is never visible while the tool loads`, fl.bird === 0 && fl.samples > 20, JSON.stringify(fl));
  check(`${size}: the tool does appear once painted (and the skeleton is gone)`, fl.shown >= 1 && (await page.locator('.uwt-skel').count()) === 0, JSON.stringify(fl));
  const fade = await page.evaluate(() => getComputedStyle(document.querySelector('#uwt-frame')).transitionDuration);
  check(`${size}: it fades in over 150 to 200 ms`, /^0\.(15|16|17|18|19|2)\d*s$/.test(fade), fade);

  /* the Underwriting switch: the frame is kept, hidden, while the Quick view is up, so coming back is a reveal and not a
     reload (no new load, the same frame element, never the old bird) */
  await page.evaluate(() => { const f = document.querySelector('#uwt-frame'); window.__sameFrame = f; window.__loads = 0; document.addEventListener('uwtoolload', () => { window.__loads++; }); });
  await page.click('#uw-view-quick');
  await page.waitForSelector('#uw-card');
  await page.evaluate(() => { window.__flash2 = { bird: 0, skel: false }; const t0 = performance.now(); const tick = () => { const f = document.querySelector('#uwt-frame'); if (f) { if (document.querySelector('.uwt-skel')) window.__flash2.skel = true; let old = false; try { const g = f.contentDocument && f.contentDocument.querySelector('.juniper-guide strong'); old = !!g && g.textContent === 'One step at a time.'; } catch { /* fine */ } if (old && f.offsetParent && Number(getComputedStyle(f).opacity) > 0.02) window.__flash2.bird++; } if (performance.now() - t0 < 5000) setTimeout(tick, 25); }; tick(); });
  await page.click('#uw-view-tool');
  await page.waitForFunction(() => { const f = document.querySelector('#uwt-frame'); return f && f.offsetParent && !document.querySelector('.uwt-skel'); }, null, { timeout: 20000, polling: 20 });
  await page.waitForTimeout(300);
  const f2 = await page.evaluate(() => ({ ...window.__flash2, same: document.querySelector('#uwt-frame') === window.__sameFrame, loads: window.__loads }));
  check(`${size}: pressing Underwriting again keeps the same frame (no reload) and never shows the bird`, f2.same && f2.loads === 0 && !f2.skel && f2.bird === 0, JSON.stringify(f2));
  await page.screenshot({ path: `/tmp/shots/uwfull/after-flash-${size}.png` }).catch(() => {});

  /* ---- A: the preview */
  const f = toolFrame(page);
  await f.waitForFunction(() => typeof UWEditor !== 'undefined' && !!UWEditor.model && !!document.querySelector('.template-peek-card'));
  const r = await f.evaluate(async () => {
    const out = {};
    try { const b = await UWEditor.previewBytes((window.UWTemplate && UWTemplate.bytes) || new Uint8Array(0)); const wb = XLSX.read(b, { type: 'array' }); out.preview = wb.SheetNames.length; } catch (e) { out.preview = 'ERR ' + e.message; }
    try { const s = await UWEditor.exportSnapshot(new Uint8Array(0), []); out.exported = s.bytes && s.bytes.length > 1000 ? XLSX.read(s.bytes, { type: 'array' }).SheetNames.length : 'EMPTY'; } catch (e) { out.exported = 'ERR ' + e.message; }
    return out;
  });
  check(`${size}: with no template the preview is the tool's own workbook (many sheets, no zip error)`, typeof r.preview === 'number' && r.preview > 10, JSON.stringify(r));
  check(`${size}: with no template the tool's own export builds the same workbook`, typeof r.exported === 'number' && r.exported > 10, JSON.stringify(r));
  const tile = f.locator('.template-peek-card');
  await tile.scrollIntoViewIfNeeded();
  await tile.hover();
  await page.waitForTimeout(1800);
  const seen = await f.evaluate(() => ({ popup: [...document.querySelectorAll('.workbook-hover-preview')].some((p) => !p.hidden && p.querySelector('table')), toasts: [...document.querySelectorAll('[role=status],.toast')].map((e) => e.textContent).join('|') }));
  check(`${size}: hovering the Excel preview shows cells, and no "Preview unavailable" or zip error`, seen.popup && !/unavailable|Corrupted|End of data/.test(seen.toasts), JSON.stringify(seen));
  await page.mouse.move(2, 2);
  await tile.click();
  await f.waitForSelector('#workbookPreview[open] table');
  check(`${size}: clicking it opens the full preview`, (await f.locator('#workbookPreview .workbook-audit').textContent()).includes('worksheets'));
  await browser.close();
}

/* ---- B2: a deal is open. The tool is filled from it and reloaded once (uwfiller/bridge.js); that reload used to run with the
   frame already on screen, so the old guide bird showed for about half a second. It is now covered like the first load. */
{
  const { browser, page } = await phone({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 });
  page.setDefaultTimeout(20000);
  await page.goto(`${BASE}#home`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const m = await import('./app/dealui.js');
    const d = await m.createDeal({ name: 'Invented Plaza', figures: { price: 2000000, address: '1 Example St', city: 'Sample', bsf: 40000 }, sources: { price: { hand: true } },
      loan: { ltv: 65, rate: 6.5, amort: 25, io: false, closing: 1, minDscr: null, minDy: null }, live: { hold: 7, exitCap: 7, saleCost: 2.5 }, targets: {} }, 'test fixture');
    await m.showDeal(d.id);
  });
  await page.evaluate(() => {
    window.__d = { n: 0, bird: 0, loads: 0, skelDuringReload: false };
    document.addEventListener('uwtoolload', () => { window.__d.loads++; });
    const t0 = performance.now();
    const tick = () => {
      const f = document.querySelector('#uwt-frame');
      if (f) {
        const s = window.__d; s.n++;
        let old = false; try { const g = f.contentDocument && f.contentDocument.querySelector('.juniper-guide strong'); old = !!g && g.textContent === 'One step at a time.'; } catch { /* fine */ }
        if (old && document.body.classList.contains('uw-full') && Number(getComputedStyle(f).opacity) > 0.02) s.bird++;
        if (s.loads >= 1 && document.querySelector('.uwt-skel')) s.skelDuringReload = true;
      }
      if (performance.now() - t0 < 15000) setTimeout(tick, 15);
    };
    tick();
    location.hash = '#underwrite';
  });
  await page.waitForFunction(() => { const b = document.querySelector('#uw-notcarried'); return b && !b.disabled; }, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const d = await page.evaluate(() => window.__d);
  check('a deal is open: the tool loads, is filled and reloads once (two loads)', d.loads === 2, JSON.stringify(d));
  check('a deal is open: the old bird guide is never visible, not even during the fill reload', d.bird === 0 && d.n > 50, JSON.stringify(d));
  await browser.close();
}

/* reduced motion: no fade */
{
  const { browser, ctx, page } = await phone();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
  await page.waitForSelector('#uwt-frame');
  const d = await page.evaluate(() => getComputedStyle(document.querySelector('#uwt-frame')).transitionDuration);
  check('prefers-reduced-motion: the frame appears with no fade', /^0s$/.test(d), d);
  void ctx;
  await browser.close();
}

for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', []);
