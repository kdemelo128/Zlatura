/* The confidential deal tag end to end, at iPhone and desktop size, against a stub AI server that counts every request
 * it gets. Marked confidential: each AI path (menu items, research from a linked contact and from the command menu,
 * the guard called directly with only a deal id) leaves the count where it was, while the connection test (a different
 * scope) still reaches it. The chip, the list badge, the summary and brief text and axe are checked; turning the mark off
 * restores AI. Deals, people and companies are invented. */
import { createRequire } from 'module';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const AI = 'http://127.0.0.1:9';

async function scenario(label, opts) {
  const { browser, page, errors } = await phone(opts);
  const seen = [];
  await page.route(`${AI}/**`, async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': new URL(BASE).origin, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    seen.push(new URL(req.url()).pathname);
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ai: true, model: 'm', transcription: false }) });
  });
  const L = (s) => `${label}: ${s}`;
  const pause = (ms = 350) => page.waitForTimeout(ms);
  const sheetPick = async (text) => { await page.locator('dialog.action-sheet .action-item', { hasText: text }).first().click(); await pause(250); };
  const more = () => page.click('#deal-root button[aria-label="More deal actions"] >> visible=true');
  const menu = async (text) => { await more(); await sheetPick(text); };
  const palette = async (q) => { await page.keyboard.press('Control+K'); await page.fill('#cmdk-input', q); await pause(400); await page.keyboard.press('Enter'); await pause(500); };
  const mod = (file, fn, ...a) => page.evaluate(async ([f, src, args]) => { const m = await import(new URL(f, location.href).href); return (0, eval)(`(${src})`)(m, ...args); }, [file, fn.toString(), a]);
  const stored = (id) => mod('app/store.js', (m, i) => m.loadDeal(i).then((d) => d && d.confidential), id);
  const axe = async (name) => {
    await pause(450);
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
    const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.length}`));
    check(L(`axe: ${name}`), res.length === 0, res.join(', '));
  };
  const toastText = async () => (await page.locator('.toast').first().innerText()).replace(/\s+/g, ' ');

  await page.goto(BASE + '#deal', { waitUntil: 'load' });
  await page.setInputFiles('#om-file', F + 'om-retail.pdf');
  await page.waitForSelector('#deal-tiles .tile');
  const id = await page.evaluate(() => localStorage.getItem('zlatura.deal.current'));
  await mod('app/ai.js', (m, url) => m.saveSettings({ url, token: 'e2e-token-0123456789abcdef', enabled: true }), AI);
  await mod('app/crm.js', (m, i) => m.saveContact({ name: 'Pat Example', company: 'Sample Holdings Group', dealIds: [i] }), id);

  // before the mark: AI is on offer, no chip
  check(L('no chip before the mark'), (await page.locator('#deal-confidential-chip').count()) === 0);
  await more();
  const aiItem = page.locator('dialog.action-sheet .action-item', { hasText: 'Ask about this deal' });
  check(L('the Ask item is enabled before the mark'), !(await aiItem.isDisabled()));
  await page.keyboard.press('Escape'); await pause();

  // turn it on
  await menu('Confidential');
  await page.waitForSelector('#conf-toggle');
  await axe('the confidential sheet');
  await page.check('#conf-toggle');
  await pause(600);
  check(L('the stored copy carries the flag'), (await stored(id)) === true);
  await page.click('#sheet-close'); await pause();
  const chip = page.locator('#deal-confidential-chip');
  check(L('the header chip says Confidential in text'), /Confidential/.test(await chip.innerText()) && (await chip.evaluate((e) => e.tagName)) === 'BUTTON');
  await axe('the deal screen with the chip');

  // every AI path
  const base = seen.length;
  await more();
  const ask = page.locator('dialog.action-sheet .action-item', { hasText: 'Ask about this deal' });
  const read = page.locator('dialog.action-sheet .action-item', { hasText: 'Read documents with AI' });
  check(L('Ask and Read are disabled and say why'), (await ask.isDisabled()) && (await read.isDisabled()) && /Off: this deal is confidential/.test(await ask.innerText()));
  await page.keyboard.press('Escape'); await pause();
  // the contact's Research button: focusable, aria-disabled, and a tap says why
  await palette('Pat Example');
  await page.waitForSelector('#contact-research');
  await pause(300);
  check(L('contact Research is aria-disabled but not disabled'), (await page.getAttribute('#contact-research', 'aria-disabled')) === 'true' && !(await page.evaluate(() => document.getElementById('contact-research').disabled)));
  await page.click('#contact-research', { force: true }); await pause(); // Playwright counts aria-disabled as not enabled
  check(L('a tap on it says why and opens no research'), /confidential/.test(await toastText()) && (await page.locator('#rs-company').count()) === 0);
  await page.keyboard.press('Escape'); await pause();
  // research from the command menu with the contact's company typed in
  await palette('Research a company');
  await page.waitForSelector('#rs-company');
  await page.fill('#rs-company', 'Sample Holdings Group');
  await page.click('button:has-text("Paste text")');
  await page.fill('#rs-paste', 'Sample Holdings Group is an invented firm.');
  await page.click('#rs-paste-add');
  await page.waitForSelector('#rs-sources li');
  await page.check('#rs-entitled');
  await page.click('#rs-go');
  await pause(500);
  check(L('research on a matching company is refused on the sheet'), /matches a contact on a confidential deal/.test(await page.locator('#sheet-body').innerText()));
  await page.keyboard.press('Escape'); await pause();
  // the guard itself, given only the deal's id: the stored copy decides
  const direct = await mod('app/ai.js', (m, i) => m.extract({ deal: { id: i } }, [], []).then(() => 'sent', (e) => e.constructor.name), id);
  check(L('the guard refuses from the stored copy alone'), direct === 'AiConfidential', direct);
  check(L('none of those reached the AI server'), seen.length === base, JSON.stringify(seen.slice(base)));
  // a different scope still works: the connection test
  await menu('AI settings');
  await page.waitForSelector('#ai-url');
  await page.click('#sheet-foot button:has-text("Test connection")');
  await page.waitForFunction(() => /Connected|reach|answered/.test(document.querySelector('#ai-status').textContent));
  check(L('the connection test (health scope) still reaches the server'), seen.length === base + 1 && seen.at(-1) === '/api/health', JSON.stringify(seen));
  await page.click('#sheet-close'); await pause();

  // the marks
  const marks = await mod('app/store.js', async (m, i) => {
    const d = await m.loadDeal(i);
    const b = await import(new URL('app/brief.js', location.href).href);
    const mm = b.analyze ? null : (await import(new URL('app/deal.js', location.href).href)).analyze({ ...d.figures, rentRoll: d.rentRoll, loan: d.loan }, null);
    const text = (x) => { const box = document.createElement('div'); b.renderDealBrief(box, { deal: { ...x, activeQuestions: [], visitLines: [], scenarioLines: [] }, m: mm, comps: null, photos: [], preparedBy: '' }); return box.textContent; };
    return { on: text(d), off: text({ ...d, confidential: false }), sumOn: b.dealSummaryText(d, mm, null).split('\n')[0], sumOff: b.dealSummaryText({ ...d, confidential: false }, mm, null).split('\n')[0] };
  }, id).catch((e) => ({ err: String(e) }));
  check(L('the brief says CONFIDENTIAL at the top and the foot, only when marked'), !marks.err && /^CONFIDENTIAL/.test(marks.on.trim()) && /CONFIDENTIAL\. Prepared/.test(marks.on) && !/CONFIDENTIAL/.test(marks.off), marks.err || '');
  check(L('the summary starts with the mark, only when marked'), /^CONFIDENTIAL/.test(marks.sumOn) && !/CONFIDENTIAL/.test(marks.sumOff), `${marks.sumOn} | ${marks.sumOff}`);

  // the export marks, while marked: file names, the workbook title, the pipeline card, the template fill sheet
  const [dlBook] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#deal-root .view-head .btn-primary')]);
  check(L('the deal workbook file name starts CONFIDENTIAL - '), dlBook.suggestedFilename().startsWith('CONFIDENTIAL - '), dlBook.suggestedFilename());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fs.readFileSync(await dlBook.path()));
  check(L('and its title cell says CONFIDENTIAL —'), String(wb.getWorksheet('Deal Analysis').getCell('A1').value).includes('CONFIDENTIAL —'), String(wb.getWorksheet('Deal Analysis').getCell('A1').value));
  await page.click('#tab-rentroll');
  await page.locator('#deal-rentroll button[aria-label="More rent roll actions"]').click();
  const [dlCsv] = await Promise.all([page.waitForEvent('download'), page.locator('.action-sheet .action-item', { hasText: 'Export CSV' }).click()]);
  check(L('the rent roll CSV file name starts CONFIDENTIAL - '), dlCsv.suggestedFilename().startsWith('CONFIDENTIAL - '), dlCsv.suggestedFilename());
  await page.click('.tab[data-view="home"] >> visible=true');
  await page.waitForSelector('#home-pipeline .pipe');
  check(L('the pipeline card says (Confidential)'), /\(Confidential\)/.test(await page.locator('#home-pipeline .pipe-card').first().innerText()));
  await page.click('.tab[data-view="deal"] >> visible=true');
  await menu('Fill my Excel template');
  await page.waitForSelector('#sheet-foot button:has-text("Upload a template")');
  const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#sheet-foot button', { hasText: 'Upload a template' }).click()]);
  await ch.setFiles(F + 'uw-model.xlsx');
  await page.waitForSelector('#sheet-body .tpl-grid');
  await page.locator('#sheet-foot button', { hasText: 'Save mapping' }).click(); await pause(400);
  await menu('Fill my Excel template');
  await page.waitForSelector('#sheet-body .li');
  await page.locator('#sheet-body .li button', { hasText: 'Fill' }).first().click();
  await page.waitForSelector('#sheet-body table.tpl-preview');
  const au = page.locator('#sheet-body label.chk input[type=checkbox]').last();
  check(L('the template fill sheet has the audit box checked and locked'), (await au.isChecked()) && (await au.evaluate((e) => e.disabled)));
  await page.click('#sheet-close'); await pause();

  // the list badge
  await more(); await sheetPick('All deals'); await pause(500);
  check(L('the Your deals row says (Confidential) in text'), (await page.locator('.li', { hasText: '(Confidential)' }).count()) === 1, (await page.locator('.li-title').allInnerTexts()).join(' | '));
  await page.locator('.li', { hasText: '(Confidential)' }).first().click(); await pause(600);

  // off again, with a confirmation
  await menu('Confidential');
  await page.waitForSelector('#conf-toggle');
  await page.uncheck('#conf-toggle');
  await pause(300);
  check(L('turning it off asks first'), /Turn off confidential/.test(await page.locator('dialog.action-sheet').innerText()));
  await sheetPick('Turn off'); await pause(600);
  check(L('after turning off the flag is false and the chip is gone'), (await stored(id)) === false && (await page.locator('#deal-confidential-chip').count()) === 0);
  await page.click('#sheet-close').catch(() => {}); await pause();
  await more();
  check(L('Ask is enabled again'), !(await page.locator('dialog.action-sheet .action-item', { hasText: 'Ask about this deal' }).isDisabled()));
  const txt = await page.locator('#app').innerText().catch(() => '');
  check(L('no NaN/undefined/Infinity'), !/\b(NaN|undefined|Infinity)\b/.test(txt));
  await browser.close();
  return errors;
}

const errs = [];
errs.push(...(await scenario('phone', {})));
errs.push(...(await scenario('desktop', { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 })));
for (const [st, n, d] of R) console.log(st, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errs);
