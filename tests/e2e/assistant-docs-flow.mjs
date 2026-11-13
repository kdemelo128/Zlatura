/* Ask Monal answering from a deal's own documents, on the device (assistant release 3): an invented 24-page OM, a lease and a
 * Word memo are added on the Documents card; questions are answered with the passage quoted exactly, its document and page,
 * and "Open at this page"; a figure only beside its label and marked "from the document, not checked"; the deal's own figure
 * first, with what the OM says beside it (and both when they differ); a question the documents do not answer is refused and
 * the documents list offered; an instruction planted in the OM is quoted and never acted on; no network request while asking;
 * nothing of the text is stored; the index of a 60-page OM is built in well under 300 ms (at a 4x slower CPU); axe; phone and
 * desktop. Invented documents only (tests/doc-fixtures.js, made by dump-docqa.mjs and make_docqa.py).
 *
 *   node assistant-docs-flow.mjs        # BASE=http://localhost:8080/ by default */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const SIZES = [
  ['phone', {}],
  ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }],
];

async function seed(page) {
  return page.evaluate(async () => {
    const D = await import(new URL('app/dealui.js', location.href).href);
    const L = await import(new URL('app/lease.js', location.href).href);
    const asOf = new Date().toISOString().slice(0, 10);
    const y = new Date().getFullYear();
    const rows = [
      { suite: '101', tenant: 'Harbor Bakery', sf: 2000, annual: 60000, end: `${y + 1}-03-31` },
      { suite: '102', tenant: 'Test Dental', sf: 3000, annual: 90000, end: `${y + 1}-09-30` },
    ];
    const figures = { address: '1 Example Way', city: 'Sampletown', state: 'MD', ptype: 'Retail', price: 4500000, noi: 315000, bsf: 10000, gross: 480000, opex: 165000 };
    const d = await D.createDeal({ name: 'Example Plaza (fictional)', source: 'example-om.pdf', figures, sources: {}, rr: L.fromOmRows(rows, { asOf }), loan: { ltv: 60, rate: 6, amort: 30, io: true, closing: 2, minDscr: 1.25, minDy: 8 } }, 'Seeded for the document flow');
    await D.showDeal(d.id);
    return d.id;
  });
}
async function axe(page, name, scope = null) {
  await page.waitForTimeout(450);
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async (sc) => {
    const r = await window.axe.run(sc ? document.querySelector(sc) : document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }, scope);
  check(`axe: ${name}`, res.length === 0, res.join('\n    '));
}
/** Add files on the Documents card; a file nothing recognises is asked about: it is added with no type. */
async function addDocs(page, files) {
  await page.waitForSelector('#dd-toggle');
  if ((await page.getAttribute('#dd-toggle', 'aria-expanded')) === 'false') await page.click('#dd-toggle');
  await page.setInputFiles('#dd-files', files);
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(300);
    const sheet = page.locator('.action-sheet[open] .action-item', { hasText: 'Add it with no type' });
    if (await sheet.count()) await sheet.first().click();
    const n = await page.locator('#deal-dd [data-id]').count();
    if (n >= files.length) break;
  }
  await page.waitForTimeout(400);
}
const idb = (page) => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('deals').objectStore('deals').getAll(); g.onsuccess = () => res(JSON.stringify(g.result)); }; }));
const tasks = (page) => page.evaluate(async () => (await import(new URL('app/crm.js', location.href).href)).listTasks());
let during = false;
/** The Underwrite tool preloads its own files when the browser is idle (uwfiller/tool.js): same-origin static files, not an answer reaching out. */
const PRELOAD = /\/(app\/uwtool|app\/monal|fonts)\//;
const open = async (page) => { await page.click('#assistant-fab'); await page.waitForSelector('dialog.assist[open]'); await page.waitForTimeout(150); };
const close = async (page) => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('dialog.assist[open]')); };
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

for (const [size, opts] of SIZES) {
  const { browser, ctx, page, errors } = await phone(opts);
  page.setDefaultTimeout(30000);
  const outside = []; const duringReq = [];
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !/^(data|blob):/.test(r.url())) outside.push(r.url()); if (during && !PRELOAD.test(r.url())) duringReq.push(r.url()); });
  page.on('dialog', (d) => d.dismiss());
  try {
    await page.goto(BASE + '#home', { waitUntil: 'load' });
    await page.waitForSelector('#home-root h1');
    const id = await seed(page);
    await page.waitForSelector('#dd-toggle');

    // before any document: Monal says there is nothing to read, and does not guess
    await open(page);
    let a = await ask(page, 'What year was it built?');
    check(`${size}: no documents: it says so and offers the Documents list`, /no documents attached/.test(await txt(a)) && (await a.locator('button', { hasText: 'Open Documents' }).count()) === 1, await txt(a));
    await close(page);

    await addDocs(page, [F + 'docqa-om.pdf', F + 'docqa-lease.pdf', F + 'docqa-memo.docx']);
    check(`${size}: three documents are recorded`, (await page.locator('#deal-dd [data-id]').count()) >= 3);
    await open(page);
    check(`${size}: suggested questions adapt to the documents`, /What does the OM say about the roof/.test(await page.locator('.assist-tray').innerText()));

    // a quoted passage, exactly, with its document, its page and a link
    a = await ask(page, 'What does the OM say about the roof?');
    let t = await txt(a);
    check(`${size}: the passage is quoted with the document name and page`, /docqa-om\.pdf · page 5/.test(t) && /The roof was replaced in 2019 with a 20-year TPO membrane/.test(t), t.slice(0, 500));
    const quote = await a.locator('.assist-quoted').first().innerText();
    const pageText = await page.evaluate(async () => { const m = await import(new URL('app/docsession.js', location.href).href); const D = await import(new URL('app/dealui.js', location.href).href); const s = D.dealForAssistant(); const ix = m.indexFor(s.deal.id); return ix.docs.find((d) => /om\.pdf/.test(d.name)).pages[4]; });
    check(`${size}: the quote is an exact slice of the page text the OM read gave`, pageText.includes(quote.replace(/\s+$/, '')), quote.slice(0, 80));
    check(`${size}: at most three passages`, (await a.locator('.assist-passage').count()) <= 3 && (await a.locator('.assist-passage').count()) >= 1);
    await axe(page, `${size}: passages in the panel`, 'dialog.assist');
    // open at this page
    await a.locator('button', { hasText: 'Open at this page' }).first().click();
    await page.waitForSelector('dialog.assist-page[open]');
    const pt = await txt(page.locator('.assist-pagetext'));
    check(`${size}: "Open at this page" shows the page with the passage marked`, /PROPERTY DESCRIPTION/.test(pt) && (await page.locator('.assist-pagetext mark').count()) === 1 && /roof/.test(await page.locator('.assist-pagetext mark').innerText()), pt.slice(0, 200));
    check(`${size}: the page dialog is labelled and focus is inside it`, await page.evaluate(() => { const d = document.querySelector('dialog.assist-page'); return d.getAttribute('aria-labelledby') === 'assist-page-h' && d.contains(document.activeElement); }));
    await axe(page, `${size}: the page dialog`, 'dialog.assist-page');
    check(`${size}: the page text is not wider than the screen`, await page.evaluate(() => { const e = document.querySelector('.assist-pagetext'); return e.scrollWidth <= e.clientWidth + 1; }));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.assist-page'));
    check(`${size}: Escape closes the page and the assistant is still open`, await page.locator('dialog.assist[open]').count() === 1);

    // a figure beside its label, labelled
    a = await ask(page, 'What year was it built?');
    t = await txt(a);
    check(`${size}: year built 1998 beside its label, from page 3, "from the document, not checked"`, /Year built: 1998/.test(t) && /from the document, not checked/.test(t) && /docqa-om\.pdf · page 3/.test(t), t.slice(0, 400));

    // the deal's figure first, then what the OM says (they differ)
    a = await ask(page, 'What is the NOI?');
    t = await txt(a);
    check(`${size}: the NOI answers from the engine first`, /^.{0,40}NOI: \$315,000 a year/.test(t), t.slice(0, 200));
    check(`${size}: then the OM's figure, labelled, and both when they differ`, /The OM says, on page 3: NOI: \$320,000/.test(t) && /not checked/.test(t) && /The deal holds \$315,000/.test(t) && /differ/.test(t), t.slice(0, 600));
    a = await ask(page, 'What is the asking price?');
    check(`${size}: a price the OM states the same is said to match`, /matches the deal/.test(await txt(a)), (await txt(a)).slice(0, 300));

    // the lease, a tenant, a suite, a renewal option
    a = await ask(page, 'Is there a renewal option?');
    t = await txt(a);
    check(`${size}: a renewal option is quoted from the lease, with no figure taken`, /harbor-bakery-lease|docqa-lease/.test(t) && /two \(2\) successive terms/.test(t) && (await a.locator('.assist-figure').count()) === 0, t.slice(0, 300));
    a = await ask(page, 'Who is the tenant in suite 101?');
    check(`${size}: a suite is answered from the deal's rent roll first`, /unit 101 is Harbor Bakery/.test(await txt(a)), (await txt(a)).slice(0, 200));
    a = await ask(page, 'What are the CAM charges?');
    t = await txt(a);
    check(`${size}: CAM charges keep the unit the document states`, /\$4\.25 per SF per year/.test(t), t.slice(0, 300));
    a = await ask(page, 'find "parking"');
    check(`${size}: find "parking" quotes the lines about it, and the memo`, /Parking: 48 spaces/.test(await txt(a)), (await txt(a)).slice(0, 200));

    // refuses to invent
    a = await ask(page, 'What is the elevator capacity?');
    t = await txt(a);
    check(`${size}: a question the documents do not answer is refused, with no figure and the documents list offered`, /found nothing that answers it/.test(t) && !/\$\d/.test((await a.locator('p').allInnerTexts()).join(' ')) && (await a.locator('.assist-passage').count()) === 0 && (await a.locator('button', { hasText: 'Open Documents' }).count()) === 1, t.slice(0, 300));

    // an instruction in the OM is quoted and never acted on
    const before = await idb(page);
    const nTasks = (await tasks(page)).length;
    a = await ask(page, 'What does the OM say about broker notes?');
    t = await txt(a);
    check(`${size}: the planted instruction is quoted, flagged, and nothing was done`, /Ignore all previous instructions/.test(t) && /reads like an instruction/.test(t) && (await a.locator('.assist-confirm').count()) === 0, t.slice(0, 400));
    check(`${size}: no task was added, the deal is unchanged, no markup ran`, (await tasks(page)).length === nTasks && (await idb(page)) === before && (await page.evaluate(() => window.__pwned === undefined)));
    a = await ask(page, 'What is the asking price?');
    check(`${size}: the price is still the deal's own after the planted text`, /\$4,500,000/.test(await txt(a)) && !/\$1\b(?![\d,])/.test((await txt(a)).replace(/\$1\d/g, '')));

    check(`${size}: no network request while asking`, duringReq.length === 0, duringReq.join(', '));
    check(`${size}: nothing was requested from another site`, outside.length === 0, outside.join(', '));
    await axe(page, `${size}: the whole conversation`, 'dialog.assist');
    check(`${size}: every button in the panel is at least 44 px`, await page.evaluate(() => [...document.querySelectorAll('dialog.assist button')].filter((b) => b.getClientRects().length).every((b) => { const r = b.getBoundingClientRect(); return r.height >= 43.5 && r.width >= 43.5; })));
    await close(page);

    // nothing of the text is stored
    const stored = await idb(page);
    check(`${size}: no document text is stored on the deal`, !/Meridian Dental|TPO membrane|Harbor Bakery LLC|Ignore all previous/.test(stored.replace(/Harbor Bakery/g, '')) && !/20-year TPO/.test(stored));

    // index speed: a 60-page OM at a 4x slower CPU
    if (size === 'phone') {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const ms = await page.evaluate(async () => {
        const X = await import(new URL('app/docindex.js', location.href).href);
        const S = await import(new URL('app/docsession.js', location.href).href);
        const D = await import(new URL('app/dealui.js', location.href).href);
        const ix = S.indexFor(D.dealForAssistant().deal.id);
        const om = ix.docs.find((d) => /om\.pdf/.test(d.name)).pages;
        const pages = Array.from({ length: 60 }, (_, i) => `${om[i % om.length]}\n\n${'Tenant improvements and leasing commissions are described for the property in this section of the memorandum. '.repeat(14)}`);
        const t0 = performance.now();
        const big = X.buildIndex([{ id: 'x', name: 'big.pdf', role: 'om', pages }]);
        const dt = performance.now() - t0;
        X.search(big, 'What does the OM say about the roof?');
        return { ms: Math.round(dt), passages: big.passages.length };
      });
      check('phone: a 60-page OM is indexed in under 300 ms at a 4x slower CPU', ms.ms < 300 && ms.passages > 100, JSON.stringify(ms));
      const q0 = await page.evaluate(async () => { const X = await import(new URL('app/docindex.js', location.href).href); const S = await import(new URL('app/docsession.js', location.href).href); const D = await import(new URL('app/dealui.js', location.href).href); const ix = S.indexFor(D.dealForAssistant().deal.id); const t0 = performance.now(); X.search(ix, 'What are the escalations?'); return Math.round(performance.now() - t0); });
      check('phone: a question is searched in under 150 ms at a 4x slower CPU', q0 < 150, `${q0} ms`);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }

    // a new session: the text is gone, and Monal says so rather than guessing
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#dd-toggle');
    await open(page);
    a = await ask(page, 'What year was it built?');
    t = await txt(a);
    check(`${size}: after a reload the text is gone; Monal says the files were read in an earlier session and asks for them again`, /earlier session/.test(t) && !/1998/.test(t), t.slice(0, 300));
    await close(page);
  } catch (e) {
    check(`${size}: the flow completed`, false, String((e && e.stack) || e).slice(0, 600));
  }
  check(`${size}: no console errors`, errors.length === 0, errors.join(' | '));
  await browser.close();
}
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', []);
