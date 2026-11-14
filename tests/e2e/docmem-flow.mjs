/* Document memory (release A1), phone and desktop: an invented OM is added to a deal, the page is reloaded, and Ask Monal answers
 * from it with the passage quoted and its page (a new session has no text in memory, so the answer came from the stored text);
 * the quiet "Reading your documents" line; Forget on the deal's Documents card, and the question no longer finds it; My data
 * counts the text and has Forget per deal and Forget all (with a plain "cannot be undone"); deleting a deal forgets its text; a
 * confidential deal's text is kept but is not seen from another deal; a backup carries no text and restores without it; a full
 * device keeps nothing, says so and does not break reading; a database at version 2 (an older app's, with data in it) opens at
 * version 3 with everything still there; indexing five stored documents of 120 pages in budget (1.5 s, and 4 s at 4x slower CPU);
 * axe; no request leaves the page. Invented documents only (tests/doc-fixtures.js via dump-docqa.mjs and make_docqa.py).
 *
 *   node docmem-flow.mjs        # BASE=http://localhost:8080/ by default */
import fs from 'fs';
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const SIZES = [
  ['phone', {}],
  ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }],
];

const seed = (page, name, extra = {}) => page.evaluate(async ({ name, extra }) => {
  const D = await import(new URL('app/dealui.js', location.href).href);
  const figures = { address: `${name} Way`, city: 'Sampletown', state: 'MD', ptype: 'Retail', price: 4500000, noi: 315000, bsf: 10000, gross: 480000, opex: 165000 };
  const d = await D.createDeal({ name, source: 'seed', figures, sources: {}, loan: { ltv: 60, rate: 6, amort: 30, io: true, closing: 2, minDscr: 1.25, minDy: 8 }, ...extra }, 'Seeded for the document memory flow');
  await D.showDeal(d.id);
  return d.id;
}, { name, extra });
async function axe(page, name, scope = null) {
  await page.waitForTimeout(450);
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async (sc) => {
    const r = await window.axe.run(sc ? document.querySelector(sc) : document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }, scope);
  check(`axe: ${name}`, res.length === 0, res.join('\n    '));
}
async function addDocs(page, files) {
  await page.waitForSelector('#dd-toggle');
  if ((await page.getAttribute('#dd-toggle', 'aria-expanded')) === 'false') await page.click('#dd-toggle');
  await page.setInputFiles('#dd-files', files);
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(300);
    const sheet = page.locator('.action-sheet[open] .action-item', { hasText: 'Add it with no type' });
    if (await sheet.count()) await sheet.first().click();
    if ((await page.locator('#deal-dd [data-id]').count()) >= files.length) break;
  }
  await page.waitForTimeout(400);
}
/** What the doctext store holds: [{ dealId, sha256, z, pageCount, chars, readBy }], and null where there is no such store. */
const stored = (page) => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('zlatura');
  r.onsuccess = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains('doctext')) { res(null); return; }
    const g = db.transaction('doctext').objectStore('doctext').getAll();
    g.onsuccess = () => res(g.result.map((x) => ({ dealId: x.dealId, sha256: x.sha256, z: x.z, pageCount: x.pageCount, chars: x.chars, readBy: x.readBy, bytes: x.pages && (x.pages.length ?? 0) })));
  };
}));
const until = async (page, fn, ms = 8000) => { for (let t = 0; t < ms; t += 150) { if (await fn()) return true; await page.waitForTimeout(150); } return false; };
const open = async (page) => { await page.click('#assistant-fab'); await page.waitForSelector('dialog.assist[open]'); await page.waitForTimeout(150); };
const close = async (page) => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('dialog.assist[open]')); };
let during = false;
async function ask(page, text) {
  const n = await page.locator('.assist-answer').count();
  await page.fill('#assist-input', text);
  during = true;
  await page.press('#assist-input', 'Enter');
  await page.waitForFunction((k) => document.querySelectorAll('.assist-answer').length > k, n);
  await page.waitForTimeout(200);
  during = false;
  return page.locator('.assist-answer').nth(n);
}
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ');
const PRELOAD = /\/(app\/uwtool|app\/monal|fonts)\//;
const ROOF = 'What does the OM say about the roof?';
const confirmForget = async (page) => { await page.waitForSelector('.action-sheet[open]'); const t = await page.locator('.action-sheet[open]').innerText(); await page.locator('.action-sheet[open] .action-item', { hasText: /^Forget/ }).first().click(); return t; };

for (const [size, opts] of SIZES) {
  const { browser, ctx, page, errors } = await phone(opts);
  page.setDefaultTimeout(30000);
  const outside = []; const duringReq = [];
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !/^(data|blob):/.test(r.url())) outside.push(r.url()); if (during && !PRELOAD.test(r.url())) duringReq.push(r.url()); });
  page.on('dialog', (d) => d.dismiss());
  const L = (s) => `${size}: ${s}`;
  try {
    // ---- 0. a version 2 database (an older app's) with data in it opens at version 3 and keeps everything
    await page.goto(BASE + 'manifest.webmanifest', { waitUntil: 'load' });
    await page.evaluate(() => new Promise((res, rej) => {
      indexedDB.deleteDatabase('zlatura');
      const r = indexedDB.open('zlatura', 2);
      r.onupgradeneeded = () => { for (const n of ['session', 'deals', 'kv', 'meta', 'history', 'snapshots', 'trash']) r.result.createObjectStore(n); };
      r.onsuccess = () => {
        const t = r.result.transaction(['deals', 'kv', 'meta'], 'readwrite');
        t.objectStore('deals').put({ id: 'old1', name: 'Older Plaza', figures: { address: '1 Old Way', price: 1000000 }, schema: 9, updatedAt: 5, createdAt: 5 }, 'old1');
        t.objectStore('kv').put([{ id: 'c1', name: 'Pat Example' }], 'crm.contacts');
        t.objectStore('meta').put({ at: 1, from: null, copied: false, counts: {} }, 'rename');
        t.oncomplete = () => { r.result.close(); res(); };
      };
      r.onerror = () => rej(r.error);
    }));
    await page.goto(BASE + '#home', { waitUntil: 'load' });
    await page.waitForSelector('#home-root h1');
    await page.waitForTimeout(600);
    const mig = await page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('zlatura');
      r.onsuccess = () => {
        const db = r.result; const out = { version: db.version, stores: [...db.objectStoreNames] };
        const t = db.transaction(['deals', 'kv']);
        const a = t.objectStore('deals').get('old1'); const b = t.objectStore('kv').get('crm.contacts');
        t.oncomplete = () => { out.deal = a.result && a.result.name; out.contact = b.result && b.result[0] && b.result[0].name; db.close(); res(out); };
      };
    }));
    check(L('a version 2 database opens at version 3 with an empty doctext store'), mig.version === 3 && mig.stores.includes('doctext'), JSON.stringify(mig));
    check(L('the older data is all still there'), mig.deal === 'Older Plaza' && mig.contact === 'Pat Example', JSON.stringify(mig));
    check(L('the doctext store starts empty'), (await stored(page)).length === 0);

    // ---- 1. add an OM; its text is stored; a reload; Ask Monal answers from the stored text
    const id = await seed(page, 'Example Plaza (fictional)');
    await page.waitForSelector('#dd-toggle');
    await addDocs(page, [F + 'docqa-om.pdf']);
    check(L('the OM is recorded on the deal'), (await page.locator('#deal-dd [data-id]').count()) >= 1);
    check(L('its text is stored, compressed, with its page count, under this deal'), await until(page, async () => { const s = await stored(page); return s && s.length === 1 && s[0].dealId === id && s[0].pageCount === 24; }), JSON.stringify(await stored(page)));
    const rec = (await stored(page))[0];
    check(L('it is gzip (the platform’s compression) and smaller than the text'), rec.z === 'gzip' && rec.bytes < rec.chars / 2, JSON.stringify(rec));
    await page.waitForTimeout(500);   // the deal's own save lands before the reload
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#dd-toggle');
    check(L('after the reload nothing is held in memory (a new session)'), await page.evaluate(async () => { const m = await import(new URL('app/docsession.js', location.href).href); const D = await import(new URL('app/dealui.js', location.href).href); return m.indexFor(D.dealForAssistant().deal.id) === null; }));
    await page.evaluate(() => { window.__reading = []; new MutationObserver(() => { const e = document.querySelector('.assist-reading'); if (e && !e.hidden && e.textContent) window.__reading.push(e.textContent); }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] }); });
    await open(page);
    await page.type('#assist-input', 'roof', { delay: 5 });
    check(L('typing is not held up while the documents are read'), (await page.inputValue('#assist-input')) === 'roof');
    await page.fill('#assist-input', '');
    let a = await ask(page, ROOF);
    let t = await txt(a);
    check(L('the answer quotes the stored OM with its page'), /docqa-om\.pdf · page 5/.test(t) && /The roof was replaced in 2019 with a 20-year TPO membrane/.test(t), t.slice(0, 400));
    check(L('the quiet “Reading your documents” line was shown while it was read'), (await page.evaluate(() => window.__reading)).some((x) => /Reading your documents/.test(x)));
    check(L('and is gone once it is read'), await page.evaluate(() => { const e = document.querySelector('.assist-reading'); return !e || e.hidden; }));
    await a.locator('button', { hasText: 'Open at this page' }).first().click();
    await page.waitForSelector('dialog.assist-page[open]');
    check(L('“Open at this page” shows the stored page with the passage marked'), /PROPERTY DESCRIPTION/.test(await txt(page.locator('.assist-pagetext'))) && (await page.locator('.assist-pagetext mark').count()) === 1);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.assist-page'));
    a = await ask(page, 'What year was it built?');
    check(L('a figure beside its label comes back too, marked not checked'), /Year built: 1998/.test(await txt(a)) && /not checked/.test(await txt(a)));
    check(L('no request left the page while asking'), duringReq.length === 0, duringReq.join(', '));
    await axe(page, L('Ask Monal after a reload'), 'dialog.assist');
    await close(page);

    // ---- 2. the Documents card says what is kept; Forget it; the question no longer finds it
    await page.waitForSelector('#dd-forget-text');
    check(L('the Documents card says the text is kept on this device, and that the files and backups do not hold it'), /text is kept on this device/.test(await page.locator('.dd-mem').innerText()) && /never kept/.test(await page.locator('.dd-mem').innerText()) && /backup does not carry/.test(await page.locator('.dd-mem').innerText()));
    await axe(page, L('the Documents card with its memory line'), '#deal-dd');
    await page.click('#dd-forget-text');
    const said = await confirmForget(page);
    check(L('Forget asks first and says plainly it cannot be undone'), /cannot be undone/.test(said), said);
    await page.waitForFunction(() => document.querySelector('#dd-forget-text') === null || !document.querySelector('.dd-mem').textContent);
    check(L('the text is gone from the store'), (await stored(page)).length === 0);
    await open(page);
    a = await ask(page, ROOF);
    t = await txt(a);
    check(L('the question no longer finds it: it asks for the file again, and quotes nothing'), /earlier session/.test(t) && !/TPO/.test(t) && (await a.locator('.assist-passage').count()) === 0, t.slice(0, 300));
    await close(page);

    // ---- 3. a full device keeps nothing, says so, and reading is not broken (a second deal, the same file)
    const idf = await seed(page, 'Full Plaza (fictional)');
    await page.waitForSelector('#dd-toggle');
    await page.evaluate(() => {
      window.__toasts = [];
      new MutationObserver(() => { document.querySelectorAll('.toast').forEach((t) => { if (!window.__toasts.includes(t.textContent)) window.__toasts.push(t.textContent); }); }).observe(document.body, { subtree: true, childList: true, characterData: true });
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...a) { if (this.name === 'doctext') throw new DOMException('quota', 'QuotaExceededError'); return put.apply(this, a); };
      window.__unquota = () => { IDBObjectStore.prototype.put = put; };
    });
    await addDocs(page, [F + 'docqa-om.pdf']);
    check(L('a full device: it says the text was not kept for next time'), await until(page, async () => (await page.evaluate(() => window.__toasts)).some((x) => /device is full/.test(x))), JSON.stringify(await page.evaluate(() => window.__toasts)).slice(0, 300));
    check(L('and nothing was stored'), (await stored(page)).length === 0);
    await open(page);
    a = await ask(page, ROOF);
    check(L('reading was not broken: this session still answers from the OM'), /page 5/.test(await txt(a)));
    await close(page);
    check(L('the deal itself saved with its document'), await page.evaluate(async (i) => { const S = await import(new URL('app/store.js', location.href).href); const d = await S.loadDeal(i); return !!d && d.dd.docs.length >= 1; }, idf));
    await page.evaluate(() => window.__unquota());

    // ---- 4. My data: counts, per-deal Forget, Forget all
    const id2 = await seed(page, 'Second Plaza (fictional)');
    await page.waitForSelector('#dd-toggle');
    await addDocs(page, [F + 'docqa-om.pdf', F + 'docqa-lease.pdf']);
    await until(page, async () => ((await stored(page)) || []).length === 2);
    await page.evaluate(async () => (await import(new URL('app/connectui.js', location.href).href)).openConnect('mydata'));
    await page.waitForSelector('#md-doctext .md-doctext-row');
    const md = await page.locator('#md-doctext').innerText();
    check(L('My data counts the documents and the space for this deal'), /Kept now: 2 documents, \d+ KB/.test(md) && /Second Plaza/.test(md), md.slice(0, 300));
    check(L('it says a backup does not carry the text'), /a backup does not carry this text/.test(md));
    await axe(page, L('My data with document text'), '#md-doctext');
    await page.locator('#md-doctext .md-doctext-row button', { hasText: 'Forget' }).first().click();
    const said2 = await confirmForget(page);
    check(L('Forget for one deal asks first and says it cannot be undone'), /cannot be undone/.test(said2));
    check(L('and forgets just that deal’s text'), await until(page, async () => (await stored(page)).length === 0));
    await page.waitForFunction(() => /none kept/.test(document.querySelector('#md-doctext').textContent));
    // Forget all, with two deals holding text (the same fingerprinted records the readers write)
    await page.evaluate(async ([a, b]) => {
      const M = await import(new URL('app/docmem.js', location.href).href);
      await M.saveDocText({ id: a }, { name: 'a.pdf', sha256: 'a'.repeat(64) }, ['alpha page text about parking']);
      await M.saveDocText({ id: b }, { name: 'b.pdf', sha256: 'b'.repeat(64) }, ['beta page text about parking']);
    }, [id, id2]);
    await page.evaluate(async () => (await import(new URL('app/connectui.js', location.href).href)).openConnect('mydata'));
    await page.waitForSelector('#md-forget-all');
    check(L('two deals’ text is listed'), (await page.locator('#md-doctext .md-doctext-row').count()) === 2);
    await page.click('#md-forget-all');
    const said3 = await confirmForget(page);
    check(L('Forget all asks first and says it cannot be undone'), /cannot be undone/.test(said3) && /all document text/i.test(said3), said3);
    check(L('Forget all empties the store'), await until(page, async () => (await stored(page)).length === 0));

    // ---- 5. a confidential deal's text is kept, and never seen from another deal
    const idc = await seed(page, 'Quiet Plaza (fictional)', { confidential: true });
    check(L('the deal is confidential'), await page.evaluate(async () => (await import(new URL('app/dealui.js', location.href).href)).dealForAssistant().deal.confidential === true));
    await page.waitForSelector('#dd-toggle');
    await addDocs(page, [F + 'docqa-om.pdf']);
    check(L('a confidential deal’s text is stored like any other'), await until(page, async () => { const s = await stored(page); return s && s.length === 1 && s[0].dealId === idc; }));
    const id3 = await seed(page, 'Plain Plaza (fictional)');
    await page.waitForSelector('#dd-toggle');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#dd-toggle');
    await open(page);
    a = await ask(page, ROOF);
    t = await txt(a);
    check(L('another deal does not see it: nothing is quoted, the deal has no documents'), !/TPO|page 5/.test(t) && (await a.locator('.assist-passage').count()) === 0, t.slice(0, 200));
    await close(page);
    check(L('and the confidential deal’s text is still held for it alone'), (await stored(page)).every((x) => x.dealId === idc));

    // ---- 6. deleting a deal forgets its text
    await page.evaluate(async (i) => { await (await import(new URL('app/dealui.js', location.href).href)).discardDeal(i); }, idc);
    check(L('deleting the deal removes its stored text'), await until(page, async () => (await stored(page)).length === 0), JSON.stringify(await stored(page)));

    // ---- 7. a backup carries no text, and restores without it
    await page.evaluate(async (i) => { const D = await import(new URL('app/dealui.js', location.href).href); await D.showDeal(i); }, id3);
    await page.waitForSelector('#dd-toggle');
    await addDocs(page, [F + 'docqa-om.pdf']);
    await until(page, async () => ((await stored(page)) || []).length === 1);
    // removing a document from the list forgets its text
    await page.locator('#deal-dd button[aria-label="Actions for docqa-om.pdf"]').click();
    await page.locator('dialog.action-sheet .action-item', { hasText: 'Remove from list' }).click();
    check(L('the removal says its kept text is forgotten and Undo does not bring it back'), await page.locator('.toast').filter({ hasText: /Its kept text is forgotten; Undo puts it back on the list, but add the file again to search it/ }).count() === 1);
    check(L('removing a document from the list forgets its text'), await until(page, async () => (await stored(page)).length === 0));
    await addDocs(page, [F + 'docqa-om.pdf']);
    await until(page, async () => ((await stored(page)) || []).length === 1);
    await page.evaluate(() => { location.hash = '#settings'; });
    await page.waitForSelector('#settings-data #backup-make', { state: 'attached' });
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#backup-make')]);
    const file = `${SHOTS}docmem-backup-${size}.json`;
    await dl.saveAs(file);
    const bt = fs.readFileSync(file, 'utf8');
    check(L('the backup holds the deal and its document record but none of the text'), /Plain Plaza/.test(bt) && /docqa-om\.pdf/.test(bt) && !/TPO membrane|PROPERTY DESCRIPTION|doctext/.test(bt), `${bt.length} bytes`);
    await page.evaluate(() => new Promise((res) => { localStorage.clear(); const r = indexedDB.deleteDatabase('zlatura'); r.onsuccess = res; r.onerror = res; r.onblocked = res; }));
    await page.goto(BASE + '#settings', { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#settings-data #backup-file', { state: 'attached' });
    await page.setInputFiles('#backup-file', file);
    await page.waitForSelector('dialog.action-sheet');
    await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.locator('dialog.action-sheet .action-item', { hasText: 'Merge into this device' }).click()]);
    await page.waitForTimeout(500);
    check(L('the restore worked without any text: the deal is back and the store is empty'), (await stored(page)).length === 0 && await page.evaluate(async (i) => { const S = await import(new URL('app/store.js', location.href).href); const d = await S.loadDeal(i); return !!d && d.dd.docs.length === 1; }, id3));
    await page.evaluate(async (i) => { const D = await import(new URL('app/dealui.js', location.href).href); await D.showDeal(i); }, id3);
    await page.waitForSelector('#dd-toggle');
    await open(page);
    a = await ask(page, ROOF);
    check(L('and Monal asks for the file again rather than guessing'), /earlier session/.test(await txt(a)));
    await close(page);

    // ---- 8. five stored documents, 120 pages: indexed and searched in budget (desktop 1.5 s, 4x slower CPU 4 s)
    await page.evaluate(async (i) => {
      const M = await import(new URL('app/docmem.js', location.href).href);
      const X = await import(new URL('app/doctext.js', location.href).href);
      const words = 'tenant lease rent base term expiration renewal option escalation reimbursement common area maintenance taxes insurance building roof membrane warranty parking frontage market vacancy'.split(' ');
      let s = 7; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
      for (let d = 0; d < 5; d++) {
        const pages = Array.from({ length: 24 }, (_, p) => `SECTION ${d}.${p}\n\n${Array.from({ length: 22 }, () => Array.from({ length: 14 }, () => words[Math.floor(r() * words.length)]).join(' ') + '.').join(' ')}\n\nPage ${p + 1} of document ${d + 1}: parking ratio ${(r() * 5).toFixed(1)} per 1,000 SF.`);
        await M.saveDocText({ id: i }, { name: `bulk-${d}.pdf`, sha256: String(d + 1).repeat(64), id: `bulk_${d}` }, pages);
      }
      void X;
    }, id3);
    const budget = async (label, limit) => {
      const ms = await page.evaluate(async (i) => {
        const M = await import(new URL('app/docmem.js', location.href).href);
        const S = await import(new URL('app/docsession.js', location.href).href);
        const X = await import(new URL('app/docindex.js', location.href).href);
        S.forgetDeal(i);
        const t0 = performance.now();
        const n = await M.warmDeal(i);
        const ix = S.indexFor(i);
        X.search(ix, 'What are the parking ratios?');
        return { ms: Math.round(performance.now() - t0), n, docs: ix.docs.length, pages: ix.docs.reduce((a, d) => a + d.pages.length, 0) };
      }, id3);
      check(L(`${label}: five stored documents of 120 pages read, indexed and searched in under ${limit} ms`), ms.n >= 5 && ms.pages >= 120 && ms.ms < limit, JSON.stringify(ms));
      return ms;
    };
    await budget('desktop speed', 1500);
    if (size === 'phone') {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await budget('4x slower CPU', 4000);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
    // ---- 9. review fixes: a text for a document no longer listed is never read and is deleted; orphans are swept; the limit is said; an older app is told to reload
    const idz = await seed(page, 'Stray Plaza (fictional)');
    await page.waitForSelector('#dd-toggle');
    await addDocs(page, [F + 'docqa-lease.pdf']);
    await until(page, async () => ((await stored(page)) || []).some((x) => x.dealId === idz));
    await page.evaluate(async (i) => {
      const M = await import(new URL('app/docmem.js', location.href).href);
      // a text under this deal for a file the deal does not list (as a removal that lost the race would leave)
      await M.saveDocText({ id: i }, { name: 'wrong-om.pdf', sha256: 'c'.repeat(64) }, ['The seller is Quietholm Holdings and the roof is a green slate roof.']);
      // and one under a deal that is not on this device at all
      await M.saveDocText({ id: 'gone-deal' }, { name: 'orphan.pdf', sha256: 'd'.repeat(64) }, ['orphan text']);
    }, idz);
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#dd-toggle');
    await open(page);
    a = await ask(page, 'Who is the seller, Quietholm?');
    check(L('a text for a document no longer listed is not quoted next session'), /found nothing/.test(await txt(a)) && (await a.locator('.assist-passage').count()) === 0 && !/Holdings/.test(await txt(a)), (await txt(a)).slice(0, 200));
    await close(page);
    check(L('and it was deleted, not just skipped'), !(await stored(page)).some((x) => x.sha256 === 'c'.repeat(64)) && (await stored(page)).some((x) => x.dealId === idz));
    await page.evaluate(async () => (await import(new URL('app/store.js', location.href).href)).sweepTrash());
    check(L('text left under a deal that no longer exists is swept'), await until(page, async () => !(await stored(page)).some((x) => x.dealId === 'gone-deal')));
    check(L('the swept deal’s neighbours keep their text'), (await stored(page)).some((x) => x.dealId === idz));
    // the limit is said plainly
    await page.evaluate(async () => (await import(new URL('app/connectui.js', location.href).href)).openConnect('mydata'));
    await page.waitForSelector('#md-doctext .md-doctext-total');
    check(L('My data says how much document text is allowed'), /may take up to 50\.0 MB/.test(await page.locator('#md-doctext').innerText()), await page.locator('#md-doctext').innerText());
    // an older app (one that opens the database at version 2) meets version 3: it says it is out of date and asks for a reload
    const older = await page.evaluate(async (base) => {
      const src = (await (await fetch(`${base}app/store.js`)).text()).replace('export const DB_VERSION = 3;', 'export const DB_VERSION = 2;').replace(/from '\.\//g, `from '${base}app/`);
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const states = [];
      globalThis.addEventListener('zlatura:storage', (e) => states.push(e.detail.state));
      const m = await import(url);
      await m.listDealsStrict().catch(() => null);
      return { status: m.storageStatus(), states };
    }, BASE).catch((e) => ({ error: String(e) }));
    check(L('an older app opening the version 3 database is told it is out of date (the existing reload state)'), older.status === 'outdated' && older.states.includes('outdated'), JSON.stringify(older));
    check(L('no request left the page at all'), outside.length === 0, outside.join(', '));
  } catch (e) {
    check(L('the flow completed'), false, String((e && e.stack) || e).slice(0, 700));
  }
  check(L('no console errors'), errors.length === 0, errors.join(' | '));
  await browser.close();
}
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', []);
