/* The underwriting filler card on the Underwrite tab, in a browser, on the INVENTED stand-in package
 * (tests/fixtures/uwfiller-standin/): a package whose fingerprint is not approved is refused and nothing is kept; the
 * approved one loads from a zip; the filler opens in an iframe that is made only on open, served by the service worker
 * (never the network) with the frame Content-Security-Policy header; inside it the policy holds (no eval, no inline
 * handler, no outside stylesheet) and its own code runs (a counter, a fetch, a blob worker); no violation other than
 * the two the stand-in provokes on purpose; Open full screen opens the same page in its own tab; a backup holds none of
 * the package; Erase package removes it and the route then says to load it; every Underwrite card is still there.
 * Axe on Monal's card at phone and desktop size, 44 px buttons, no sideways scroll at 390 px. The filler's own
 * document is not gated (it is not ours to change).
 *
 *   node uw-embed-flow.mjs        # BASE=http://localhost:8080/ by default */
import { createRequire } from 'module';
import fs from 'node:fs';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
import { standinZip } from '../fixtures/uwfiller-standin.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const { browser, ctx, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(10000);
const zipFile = (name, edit) => ({ name, mimeType: 'application/zip', buffer: Buffer.from(standinZip(edit)) });
const buckets = () => page.evaluate(() => caches.keys());
const txt = (sel) => page.textContent(sel);
// the firm-pack loader is the collapsed Advanced card (the built-in tool, uwtool-flow.mjs, is the normal way in)
const adv = async () => { await page.waitForSelector('#uw-filler', { state: 'attached' }); await page.evaluate(() => { document.getElementById('uw-filler').open = true; }); };

const responses = [];
page.on('response', (r) => { if (r.url().includes('/uw-filler/')) responses.push({ url: r.url(), status: r.status(), sw: r.fromServiceWorker(), csp: r.headers()['content-security-policy'] || '' }); });
// every request the filler's document makes: any that left this origin is a failure
const outside = [];
page.on('request', (r) => { const u = new URL(r.url()); if (u.origin !== new URL(BASE).origin && !/^(data|blob):/.test(r.url())) outside.push(r.url()); });

await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
await page.click('#uw-view-quick');   // the firm-pack card sits in the Quick underwrite view
await adv();
await page.waitForSelector('#uw-filler .uwf-body');
// the service worker must control this page before the iframe can be served from the package
await page.evaluate(() => navigator.serviceWorker.ready);
if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { await page.reload({ waitUntil: 'load' }); await adv(); await page.waitForSelector('#uw-filler .uwf-body'); }
check('the service worker controls the page', await page.evaluate(() => !!navigator.serviceWorker.controller));

check('the firm-pack card is the last card, collapsed, and every other card is still there', await page.evaluate(() => {
  const ids = [...document.querySelector('#underwrite-root .stack').children].map((c) => c.id);
  return ids.join() === 'uw-intake,uw-card,uw-list,uw-calc-card,uw-filler';
}), await page.evaluate(() => [...document.querySelector('#underwrite-root .stack').children].map((c) => c.id).join()));
check('before a package is loaded: Load package and Load folder, no frame, no Open buttons', (await page.locator('#uwf-load').count()) === 1 && (await page.locator('#uwf-load-dir').count()) === 1 && (await page.locator('iframe').count()) === 0 && (await page.locator('#uwf-open').count()) === 0);
check('no package bucket yet', !(await buckets()).includes('zlatura-uwfiller'));

/* ---- a package that is not approved is refused */
await page.setInputFiles('#uwf-zip', zipFile('changed.zip', { 'public/tool/ui.js': Buffer.from('/* changed */') }));
await page.waitForFunction(() => /not on the approved list/.test(document.querySelector('#uwf-status').textContent));
check('a package with a different fingerprint is refused, with a reason, and nothing is kept', !(await buckets()).includes('zlatura-uwfiller') && (await page.locator('#uwf-load').count()) === 1);
await page.setInputFiles('#uwf-zip', { name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('plain text, not a zip') });
await page.waitForFunction(() => /not a zip/.test(document.querySelector('#uwf-status').textContent));
check('a file that is not a zip is refused', !(await buckets()).includes('zlatura-uwfiller'));

/* ---- the approved package loads */
await page.setInputFiles('#uwf-zip', zipFile('stand-in.zip'));
await page.waitForSelector('#uwf-open');
check('the approved package loads: 5 files kept in the zlatura-uwfiller bucket, outside the deal database', (await buckets()).includes('zlatura-uwfiller') && /5 files/.test(await txt('#uw-filler')), (await txt('#uw-filler')).slice(0, 200));
check('no frame yet: the iframe is made only when the card is opened', (await page.locator('iframe').count()) === 0 && responses.length === 0);

/* ---- axe, layout, buttons (phone, then desktop) */
async function axe(name) {
  await page.waitForTimeout(600);   // the card's own fade-in ends before a contrast scan
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document.querySelector('#uw-filler'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  });
  check(`axe: the card, ${name}`, res.length === 0, res.join('\n    '));
}
await axe('phone size, loaded');
check('390 px: no sideways scroll', (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
const small = () => page.evaluate(() => [...document.querySelectorAll('#uw-filler button')].filter((e) => { const q = e.getBoundingClientRect(); return q.width && (q.height < 43.5 || q.width < 43.5); }).map((e) => `${e.textContent}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
check('every button on the card is at least 44 px', (await small()).length === 0, (await small()).join(', '));

/* ---- open: the iframe, served by the worker with the policy */
await page.click('#uwf-open');
await page.waitForSelector('#uwf-frame');
const fh = page.frameLocator('#uwf-frame');
await fh.locator('#stand-title').waitFor();
check('the filler renders in the frame', (await fh.locator('#stand-title').textContent()) === 'Stand-in filler');
const idx = responses.find((r) => /uw-filler\/index\.html/.test(r.url));
check('the page was served by the service worker with the frame policy header', !!idx && idx.sw && idx.status === 200 && /script-src 'self'/.test(idx.csp) && /frame-ancestors 'self'/.test(idx.csp) && /connect-src 'self' blob: data:/.test(idx.csp) && !/unsafe-eval/.test(idx.csp), JSON.stringify(idx));
check('every file the filler asked for came from the worker, none from the network', responses.length >= 4 && responses.every((r) => r.sw && r.status === 200), JSON.stringify(responses.map((r) => [r.url.split('/uw-filler/')[1], r.sw, r.status])));
const attrs = await page.evaluate(() => { const f = document.querySelector('#uwf-frame'); return { sb: f.getAttribute('sandbox'), title: f.title }; });
check('the frame is sandboxed without top navigation, and titled', /allow-scripts/.test(attrs.sb) && /allow-same-origin/.test(attrs.sb) && !/allow-top-navigation/.test(attrs.sb) && attrs.title === 'Underwriting filler', JSON.stringify(attrs));

/* inside the frame: its own code runs, and the policy holds */
await fh.locator('#stand-coin').click();
await fh.locator('#stand-coin').click();
check('the filler runs as shipped: a counter kept in its own storage', (await fh.locator('#stand-coins').textContent()) === '2' && (await page.evaluate(() => localStorage.getItem('uw-monal-coins'))) === '2');
await fh.locator('#stand-example').click();
await fh.locator('#stand-out').filter({ hasText: 'Invented Plaza: 2 suites' }).waitFor();
check('a same-origin fetch and a blob worker run under the policy', true);
await fh.locator('#stand-probe').click();
await fh.locator('#stand-probe-out').filter({ hasText: 'outside' }).waitFor();
const probe = await fh.locator('#stand-probe-out').textContent();
await fh.locator('#stand-scn').selectOption('Upside');
check('eval, new Function and a request to another site are all blocked by the policy', probe === 'eval blocked, function blocked, outside blocked', probe);
const frame = page.frames().find((f) => /uw-filler\/index\.html/.test(f.url()));
check('an inline handler is blocked (no unsafe-inline for scripts)', (await frame.evaluate(() => !!window.standInline)) === false);
check('nothing left this origin', outside.filter((u) => !/fonts\.googleapis/.test(u)).length === 0, outside.join(' | '));
// the two violations the stand-in provokes on purpose (an inline handler; an outside stylesheet); anything else fails
const expected = [/uwtool\/.*ERR_ABORTED/, /status of 404/, /can escape its sandboxing/, /example\.invalid/, /Refused to evaluate/, /unsafe-eval/, /inline event handler/i, /fonts\.googleapis\.com/, /Content Security Policy directive: "(script-src-attr|style-src-elem)/];
const unexpectedNow = () => errors.filter((e) => !expected.some((x) => x.test(e)));
const unexpected = errors.filter((e) => !expected.some((x) => x.test(e)));
const seen = errors.filter((e) => expected.some((x) => x.test(e)));
check('the policy was enforced on both provoked violations (and only those were logged)', seen.some((e) => /inline event handler|script-src/i.test(e)) && seen.some((e) => /fonts\.googleapis\.com/.test(e)) && unexpected.length === 0, unexpected.join(' | ') || seen.join(' | ').slice(0, 300));
await page.locator('#uw-filler').screenshot({ path: `${SHOTS}uw-embed-phone.png` });
check('390 px with the frame open: no sideways scroll', (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);

/* ---- full screen */
const [pop] = await Promise.all([ctx.waitForEvent('page'), page.click('#uwf-full')]);
await pop.waitForLoadState('load');
check('Open full screen opens the same page in its own tab', /\/uw-filler\/index\.html$/.test(pop.url()) && (await pop.locator('#stand-title').textContent()) === 'Stand-in filler');
await pop.close();

/* ---- close and open again; the Underwrite cards are unchanged */
await page.click('#uwf-open');
await page.waitForSelector('#uwf-frame', { state: 'detached' });
check('Close filler removes the frame', (await page.locator('iframe').count()) === 0);

/* ---- a backup holds none of the package */
await page.goto(`${BASE}#settings`, { waitUntil: 'load' });
await page.waitForSelector('#backup-make');
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#backup-make')]);
const file = `${SHOTS}uw-embed-backup.json`;
await dl.saveAs(file);
const text = fs.readFileSync(file, 'utf8');
fs.unlinkSync(file);
check('a backup holds no filler bytes (no page text, script text, file names or bucket name)', JSON.parse(text).format === 'zlatura-backup' && !/Stand-in filler|stand-coins|Invented Plaza|uw-filler|zlatura-uwfiller|filler\.js/.test(text), `${text.length} bytes`);

/* ---- desktop: open again, axe, then erase */
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
await page.click('#uw-view-quick');   // the firm-pack card sits in the Quick underwrite view
await adv();
await page.waitForSelector('#uwf-open');
await axe('desktop size, loaded');
await page.click('#uwf-open');
await page.frameLocator('#uwf-frame').locator('#stand-title').waitFor();
check('the filler also opens at desktop size', (await page.locator('#uwf-frame').boundingBox()).width > 600 && (await page.frameLocator('#uwf-frame').locator('#stand-coins').textContent()) === '2');
await page.locator('#uw-filler').screenshot({ path: `${SHOTS}uw-embed-desktop.png` });
await page.click('#uwf-erase');
await page.locator('.action-item.danger').click();
await page.waitForSelector('#uwf-load');
check('Erase package: the bucket is gone, the frame is gone, Load package is back', !(await buckets()).includes('zlatura-uwfiller') && (await page.locator('iframe').count()) === 0);
const gone = await page.evaluate(() => fetch('uw-filler/index.html').then(async (r) => ({ s: r.status, t: await r.text() })));
check('after the erase the route answers a 404 page that says to load the package (never the network)', gone.s === 404 && /Load the package/.test(gone.t), JSON.stringify(gone).slice(0, 200));
await axe('desktop size, empty');

/* ---- the "exactly the same" comparer, on the stand-in: identical when untouched, and it sees a changed file */
await browser.close();
const { spawnSync } = await import('node:child_process');
const same = (...a) => spawnSync(process.execPath, [new URL('../tools/uwfiller-same.mjs', import.meta.url).pathname, '--states', '2', '--sizes', 'phone,desktop', ...a], { encoding: 'utf8', timeout: 280000 });
const ok = same();
check('uwfiller-same: the stand-in embedded is identical to the stand-in alone (DOM, style, pixels, phone and desktop)', ok.status === 0 && (ok.stdout.match(/states: 6; identical on every facet and not noisy: 6;/g) || []).length === 2 && /DOM: judged 6, differ 0;[^\n]*\n  style: judged 6, differ 0;[^\n]*\n  pixels: judged 6, differ 0;/.test(ok.stdout), ok.stdout.slice(0, 600) + ok.stderr.slice(0, 200));
const bad = same('--tamper');
check('uwfiller-same: with one stored file changed it reports the difference and fails', bad.status === 1 && /(style|pixels): judged \d+, differ [1-9]/.test(bad.stdout), bad.stdout.slice(0, 600) + bad.stderr.slice(0, 200));
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', unexpectedNow());
