/* uwfiller-same.mjs -- LOCAL ONLY: is the filler, embedded in Zlatura, exactly the filler served on its own?
 *
 *   node tests/tools/uwfiller-same.mjs                       # the invented stand-in (what CI and the tests run)
 *   node tests/tools/uwfiller-same.mjs --package <folder>    # a package under private/ (the folder holding public/tool, or tool itself)
 *   options: --states <n> (clicks tried per size, default 10)  --sizes phone,desktop
 *            --tamper (self-test: alters one stored file, so the run must report differences and exit 1)
 *
 * It serves the UNTOUCHED package on one port (at /uw-filler/, no policy header, as a top-level page) and Zlatura with
 * the same package loaded through pkg.js on another (the frame served by sw.js with its policy). For each size the
 * embedded frame's inner size is measured and the standalone page gets exactly that viewport. The clock, Math.random,
 * crypto.randomUUID and requestAnimationFrame's timestamp are frozen and seeded alike in both, and CSS animations are
 * off in both. The states are generic, so no name from a package is written here: the fresh page, then the page after
 * a tap on its Nth button (tab, summary), each at time zero and again after 60 stepped frames. Per state it compares a
 * hash of the normalised DOM, a hash of every element's computed style, and the pixels of the screenshot. The
 * standalone page is loaded twice, so a state that differs from itself (a real timer, say) is counted as noise, not
 * as a difference. OUTPUT IS COUNTS AND STATE NUMBERS ONLY: no text, selector, name or image leaves this process.
 * A folder outside private/ (other than the stand-in) is refused. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pick, fingerprint, typeOf } from '../../app/uwfiller/pkg.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STANDIN = path.join(ROOT, 'tests/fixtures/uwfiller-standin');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const pkgDir = fs.realpathSync(path.resolve(arg('package', STANDIN)));
const inside = (p, d) => p === d || p.startsWith(d + path.sep);
if (!inside(pkgDir, path.join(ROOT, 'private')) && !inside(pkgDir, STANDIN)) {
  console.error('Refused: the package folder must be inside private/ (or be the invented stand-in). Nothing was read.');
  process.exit(2);
}
// the browser is loaded only past the guard above, so a refused run needs no Playwright
const { chromium } = await import('../e2e/lib.mjs');
const CLICKS = Number(arg('states', 10));
const SIZES = { phone: { width: 390, height: 844, mobile: true }, desktop: { width: 1280, height: 900, mobile: false } };
const wanted = (arg('sizes', 'phone,desktop')).split(',').filter((s) => SIZES[s]);

/* ---- the tool's files (public/tool, or the folder itself) */
function walk(d, out = {}, pre = '') {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out, `${pre}${e.name}/`); else out[`${pre}${e.name}`] = p;
  }
  return out;
}
const all = walk(pkgDir);
const names = pick(Object.keys(all));
const toolRel = Object.keys(names);
const files = Object.fromEntries(toolRel.map((rel) => [rel, new Uint8Array(fs.readFileSync(all[names[rel]]))]));
const print = await fingerprint(files);

/* ---- two static servers */
function serve(rootFor) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      const f = rootFor(decodeURIComponent(u.pathname));
      if (!f) { res.writeHead(404); res.end('no'); return; }
      res.writeHead(200, { 'content-type': typeOf(f), 'cache-control': 'no-store' });
      res.end(fs.readFileSync(f));
    }).listen(0, () => resolve({ srv, port: srv.address().port }));
  });
}
const refRoot = (p) => {
  if (!p.startsWith('/uw-filler/')) return null;
  const rel = p.slice('/uw-filler/'.length) || 'index.html';
  return names[rel] ? all[names[rel]] : null;
};
const appRoot = (p) => {
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  return inside(path.resolve(f), ROOT) && !inside(path.resolve(f), path.join(ROOT, 'private')) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
};
const ref = await serve(refRoot);
const app = await serve(appRoot);

/* ---- what both runs inject before anything of the package runs */
const INIT = `(() => {
  if (!location.pathname.includes('/uw-filler/')) return;   // only the filler's own documents: Zlatura keeps its real clock
  let s = 20260101; const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = rnd;
  let n = 0; if (crypto.randomUUID) crypto.randomUUID = () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
  const D = Date, base = 1767225600000; window.__t = 0;
  const FD = class extends D { constructor(...a) { if (a.length) super(...a); else super(base + window.__t); } static now() { return base + window.__t; } };
  window.Date = FD; performance.now = () => window.__t;
  const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf(() => cb(window.__t));
  try { const sh = new CSSStyleSheet(); sh.replaceSync('*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh]; } catch (e) {}
})();`;

/* ---- the snapshot, run inside a document: [dom hash, style hash, element count] */
const SNAP = () => {
  const fnv = (str, h = 0x811c9dc5) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
  const norm = (t) => t.replace(/blob:[^"')\s;,]+/g, 'blob:X').replace(/https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/g, 'ORIGIN').replace(/\b(id|for|name)="([^"]*[0-9a-f]{8,}[^"]*)"/g, '$1="G"');
  const dom = fnv(norm(document.documentElement.outerHTML));
  let st = 0x811c9dc5; let count = 0;
  for (const e of document.querySelectorAll('*')) {
    count += 1;
    const cs = getComputedStyle(e);
    let line = e.tagName;
    for (let i = 0; i < cs.length; i++) { const p = cs[i]; line += `|${p}:${cs.getPropertyValue(p)}`; }
    st = fnv(norm(line), st);
  }
  return [dom, st, count];
};
const CLICKABLE = `(() => [...document.querySelectorAll('button, [role=tab], summary')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.disabled && e.type !== 'file'; }))()`;

const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text'] });
const counts = { consoleErrors: 0, cspViolations: 0, outsideRequests: 0, requestFailures: 0, blockedOutside: 0, hosts: /** @type {Record<string, number>} */ ({}) };

async function context(size, view) {
  const ctx = await browser.newContext({ viewport: view || { width: size.width, height: size.height }, deviceScaleFactor: 2, isMobile: size.mobile, hasTouch: size.mobile, acceptDownloads: false, serviceWorkers: 'allow' });
  await ctx.addInitScript(INIT);
  return ctx;
}
function watch(page, tally, origin) {
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  page.on('console', (m) => { if (m.type() === 'error') { tally.consoleErrors += 1; if (/Content Security Policy|violates the following/.test(m.text())) tally.cspViolations += 1; } });
  page.on('requestfailed', () => { tally.requestFailures += 1; });
  page.on('request', (r) => { const u = r.url(); if (!/^(data|blob|about):/.test(u) && !u.startsWith(origin)) tally.outsideRequests += 1; });
  page.context().on('page', (p) => { if (p !== page) p.close().catch(() => {}); });
}
const settle = async (page) => { await page.waitForTimeout(450); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };

/** Run the states in one document (a Frame for the embedded run, a Page for the standalone one). `reset()` loads it fresh. */
async function states(target, reset, shot, n) {
  const out = [];
  for (let k = 0; k <= n; k += 1) {
    PROGRESS(`state group ${k}`);
    await reset();
    await settle(target.page ? target.page() : target);
    const total = await target.evaluate(`${CLICKABLE}.length`);
    if (k > 0) {
      if (k > total) { out.push(null, null); continue; }
      await target.evaluate(`${CLICKABLE}[${k - 1}].click()`).catch(() => {});
      await settle(target.page ? target.page() : target);
    }
    for (const stepped of [false, true]) {
      if (stepped) {
        for (let f = 1; f <= 60; f += 1) await target.evaluate((t) => { window.__t = t; return new Promise((r) => requestAnimationFrame(r)); }, f * (1000 / 60));
      }
      out.push({ snap: await target.evaluate(SNAP), png: await shot() });
    }
  }
  return out;
}

const PROGRESS = process.env.SAME_PROGRESS ? (m) => console.error(m) : () => {};
const verdicts = [];
const note = (size, extra) => verdicts.push({ size, ...extra });

for (const sizeName of wanted) {
  const size = SIZES[sizeName];
  /* ---- embedded: Zlatura with the package loaded through pkg.js (the approved list is the one computed here) */
  const ectx = await context(size);
  const epage = await ectx.newPage();
  const etally = { consoleErrors: 0, cspViolations: 0, outsideRequests: 0, requestFailures: 0 };
  watch(epage, etally, `http://localhost:${app.port}`);
  await epage.goto(`http://localhost:${app.port}/#underwrite`, { waitUntil: 'load' });
  await epage.evaluate(() => navigator.serviceWorker.ready);
  if (!(await epage.evaluate(() => !!navigator.serviceWorker.controller))) await epage.reload({ waitUntil: 'load' });
  await epage.waitForSelector('#uw-filler', { state: 'attached' });
  await epage.evaluate(() => { document.getElementById('uw-filler').open = true; });   // the firm-pack card is collapsed (Advanced)
  await epage.waitForSelector('#uw-filler .uwf-body');
  PROGRESS('app up');
  // one file at a time over the wire: the whole package as base64 in one call would be about 9 MB
  await epage.evaluate(() => { window.__pk = {}; });
  for (const rel of toolRel) await epage.evaluate(([r, b64]) => { window.__pk[r] = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }, [rel, Buffer.from(files[rel]).toString('base64')]);
  const loaded = await epage.evaluate(async (hash) => {
    const m = await import('/app/uwfiller/pkg.js');
    try { const i = await m.loadPackage(window.__pk, { base: document.baseURI, allow: [{ hash, label: 'local comparer' }] }); return i.files; } catch (e) { return String(e && e.message); }
  }, print);
  if (typeof loaded !== 'number') { console.error(`The package did not load into Zlatura (${typeof loaded === 'string' ? loaded.length : 0} chars of reason withheld).`); process.exit(3); }
  if (process.argv.includes('--tamper')) {
    // self-test of the comparer: change one stored file after loading, so the embedded copy is NOT the package
    await epage.evaluate(async () => { const c = await caches.open('zlatura-uwfiller'); const u = new URL('uw-filler/style.css', document.baseURI).href; await c.put(new Request(u), new Response('body { background: #fee; } #stand { padding: 20px; }', { headers: { 'content-type': 'text/css' } })); });
  }
  await epage.evaluate(() => { delete window.__pk; });
  PROGRESS('package loaded');
  await epage.reload({ waitUntil: 'load' });
  await epage.waitForSelector('#uw-filler', { state: 'attached' });
  await epage.waitForFunction(() => document.getElementById('uw-filler').querySelector('summary'));
  await epage.evaluate(() => { document.getElementById('uw-filler').open = true; });
  await epage.waitForSelector('#uwf-open');
  await epage.click('#uwf-open');
  await epage.waitForSelector('#uwf-frame');
  await epage.waitForTimeout(6000);                       // the "loaded" notice goes away before any pixel is taken
  const frameEl = await epage.$('#uwf-frame');
  const frame = await frameEl.contentFrame();
  await frame.waitForLoadState('load');
  PROGRESS('frame up');
  const inner = await frame.evaluate(() => [innerWidth, innerHeight]);
  const geom = await epage.evaluate(() => { const f = document.querySelector('#uwf-frame'); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - 90); const r = f.getBoundingClientRect(); const cx = r.left + f.clientLeft, cy = r.top + f.clientTop; const hit = (x, y) => document.elementFromPoint(cx + x, cy + y) === f; const open = [[2, 2], [f.clientWidth - 3, 2], [2, f.clientHeight - 3], [f.clientWidth - 3, f.clientHeight - 3], [f.clientWidth / 2, f.clientHeight / 2]].every(([x, y]) => hit(x, y)); return { x: cx, y: cy, w: f.clientWidth, h: f.clientHeight, covered: !open || cy < 0 || cy + f.clientHeight > innerHeight || cx + f.clientWidth > innerWidth }; });
  const eshot = () => epage.screenshot({ clip: { x: geom.x, y: geom.y, width: geom.w, height: geom.h } });  // never fullPage: that resizes the emulated viewport and Chromium then re-picks the default fonts
  const eStates = await states(frame, async () => {
    await epage.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^uw[-_]/.test(k)) localStorage.removeItem(k); });
    await frame.evaluate(() => { window.__t = 0; });
    await epage.evaluate(() => { const f = document.querySelector('#uwf-frame'); f.src = f.src; });
    await epage.waitForFunction(() => { const f = document.querySelector('#uwf-frame'); return f && f.contentDocument && f.contentDocument.readyState === 'complete'; });
  }, eshot, CLICKS).catch((e) => { console.error(`embedded run stopped: ${String(e && e.message).length} chars withheld`); return []; });
  PROGRESS(`embedded states ${eStates.length}`);
  await ectx.close();

  /* ---- standalone, twice */
  const runRef = async () => {
    const rctx = await context(size, { width: inner[0], height: inner[1] });
    // the embedded copy cannot reach other sites (its policy), so the standalone one may not either: the comparison is
    // of the package, not of what a CDN or a font host answers (that difference is the policy's, measured in the counts)
    await rctx.route((u) => u.origin !== `http://localhost:${ref.port}` && !/^(data|blob):/.test(u.protocol), (r) => { counts.blockedOutside += 1; const h = new URL(r.request().url()).hostname; const k = /(googleapis|gstatic|jsdelivr|anthropic|unpkg|cdnjs)\./.test(h) ? h : 'other'; counts.hosts[k] = (counts.hosts[k] || 0) + 1; r.abort('blockedbyclient'); });
    const rpage = await rctx.newPage();
    watch(rpage, counts, `http://localhost:${ref.port}`);
    const load = () => rpage.goto(`http://localhost:${ref.port}/uw-filler/index.html`, { waitUntil: 'load' });
    await load();
    const r = await states(rpage, async () => { await rpage.evaluate(() => localStorage.clear()); await load(); }, () => rpage.screenshot(), CLICKS).catch((e) => { console.error(`standalone run stopped: ${String(e && e.message).length} chars withheld`); return []; });
    await rctx.close();
    return r;
  };
  const rA = await runRef();
  const rB = await runRef();

  /* ---- compare */
  const cmp = await browser.newPage();
  const pixels = (a, b) => cmp.evaluate(async ([x, y]) => {
    const dec = async (s) => { const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob()); const c = new OffscreenCanvas(bmp.width, bmp.height); const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); return g.getImageData(0, 0, bmp.width, bmp.height); };
    const [p, q] = [await dec(x), await dec(y)];
    if (p.width !== q.width || p.height !== q.height) return -1;
    let d = 0; for (let i = 0; i < p.data.length; i += 4) if (p.data[i] !== q.data[i] || p.data[i + 1] !== q.data[i + 1] || p.data[i + 2] !== q.data[i + 2]) d += 1;
    return d;
  }, [a.toString('base64'), b.toString('base64')]);
  const total = Math.max(eStates.length, rA.length, rB.length);
  // each facet is judged on its own: where the untouched package does not reproduce itself on a facet (two loads of it
  // disagree), that facet of that state is "noisy" and not judged; the others still are
  const row = { states: total, identical: 0, domJudged: 0, styleJudged: 0, pixelJudged: 0, noisy: { dom: [], style: [], pixels: [] }, domDiffer: [], styleDiffer: [], pixelDiffer: [], missing: [] };
  for (let i = 0; i < total; i += 1) {
    const e = eStates[i], a = rA[i], b = rB[i];
    if (!e || !a || !b) { row.missing.push(i); continue; }
    const dom = a.snap[0] === b.snap[0] && a.snap[2] === b.snap[2], style = a.snap[1] === b.snap[1], pix = a.png.equals(b.png);
    if (!dom) row.noisy.dom.push(i); if (!style) row.noisy.style.push(i); if (!pix) row.noisy.pixels.push(i);
    let clean = dom && style && pix;
    if (dom) { row.domJudged += 1; if (e.snap[0] !== a.snap[0] || e.snap[2] !== a.snap[2]) { row.domDiffer.push(i); clean = false; } }
    if (style) { row.styleJudged += 1; if (e.snap[1] !== a.snap[1]) { row.styleDiffer.push(i); clean = false; } }
    if (pix) {
      row.pixelJudged += 1;
      const px = e.png.equals(a.png) ? 0 : await pixels(e.png, a.png);
      if (px !== 0) { row.pixelDiffer.push(`${i}(${px < 0 ? 'size' : px + 'px'})`); clean = false; if (process.env.SAME_DUMP) { fs.writeFileSync(`${process.env.SAME_DUMP}/${sizeName}-${i}-emb.png`, e.png); fs.writeFileSync(`${process.env.SAME_DUMP}/${sizeName}-${i}-ref.png`, a.png); } }
    }
    if (clean) row.identical += 1;
  }
  await cmp.close();
  note(sizeName, { ...row, frame: `${inner[0]}x${inner[1]}`, covered: geom.covered, embeddedCspViolations: etally.cspViolations, embeddedConsoleErrors: etally.consoleErrors, embeddedOutside: etally.outsideRequests });
}

await browser.close();
ref.srv.close(); app.srv.close();
console.log(`package: ${toolRel.length} files, ${(Object.values(files).reduce((s, b) => s + b.length, 0) / 1e6).toFixed(2)} MB, fingerprint ${print.slice(0, 12)}`);
for (const v of verdicts) {
  console.log(`[${v.size}] frame ${v.frame}, frame covered by another element: ${v.covered ? 'YES' : 'no'}`);
  const list = (l) => (l.length ? ` (state numbers ${l.join(',')})` : '');
  console.log(`  states: ${v.states}; identical on every facet and not noisy: ${v.identical}; missing: ${v.missing.length}${list(v.missing)}`);
  console.log(`  DOM: judged ${v.domJudged}, differ ${v.domDiffer.length}${list(v.domDiffer)}; the untouched package disagrees with itself in ${v.noisy.dom.length}${list(v.noisy.dom)}`);
  console.log(`  style: judged ${v.styleJudged}, differ ${v.styleDiffer.length}${list(v.styleDiffer)}; noisy ${v.noisy.style.length}${list(v.noisy.style)}`);
  console.log(`  pixels: judged ${v.pixelJudged}, differ ${v.pixelDiffer.length}${list(v.pixelDiffer)}; noisy ${v.noisy.pixels.length}${list(v.noisy.pixels)}`);
  console.log(`  embedded run: ${v.embeddedConsoleErrors} console errors, ${v.embeddedCspViolations} policy violations, ${v.embeddedOutside} requests left the origin`);
}
console.log(`standalone runs (other origins blocked, as the policy blocks them): ${counts.consoleErrors} console errors, ${counts.blockedOutside} requests to other origins blocked${Object.keys(counts.hosts).length ? ` (${Object.entries(counts.hosts).map(([h, n]) => `${h}: ${n}`).join(', ')})` : ''}`);
const bad = verdicts.some((v) => v.domDiffer.length || v.styleDiffer.length || v.pixelDiffer.length || v.missing.length);
process.exitCode = bad ? 1 : 0;
