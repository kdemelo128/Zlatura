/* F6/F7: hostile text and time zones, in the browser. An invented pack of awkward names and notes (apostrophes,
 * emoji, right-to-left text, markup, formula starts, 40,000 characters, control characters:
 * tests/fixtures/hostile.js) is typed into a comp name, a tenant, the deal name and a site-visit note. It must come
 * back exactly after a reload and after a backup restored into a fresh profile; no dialog or script may run; and
 * every export is read back: both CSVs, the copy table, the comps and deal workbooks (every cell text, none a
 * formula), the filled templates, the printed pages and the PDF, and the body sent to the AI server. The whole run
 * is made twice, with the device clock in Los Angeles and in London; the 1031 clock must show the same day in both.
 *
 *   node hostile-flow.mjs            # BASE=http://localhost:8080/ by default */
import fs from 'fs';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';
import { DOMParser } from '@xmldom/xmldom';
import { phone, BASE, finish } from './lib.mjs';
import { pdfPages } from '../../app/pdftext.js';
import { PACK, LONG } from '../fixtures/hostile.js';

const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const ITEMS = Object.values(PACK);
// what a one-line field holds after the browser drops line breaks and the app trims
const ONE = (s) => s.replace(/[\r\n]/g, '').trim();
// what an XML file keeps: control characters are dropped
const XMLTEXT = (s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const GUARD = /^[=+\-@\t\r]/;
const sorted = (a) => [...a].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const short = (s) => JSON.stringify(s.length > 60 ? `${s.slice(0, 30)}…(${s.length})` : s);
const diff = (got, want) => { const g = sorted(got); const w = sorted(want); const miss = w.filter((x) => !g.includes(x)); const extra = g.filter((x) => !w.includes(x)); return `missing ${miss.map(short).join(', ')}; unexpected ${extra.map(short).join(', ')}`; };

/** RFC 4180 rows from CSV text. */
function csvParse(text) {
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
/** Every cell of an .xlsx: its sheet, address, ExcelJS type (3 text, 6 formula) and text. */
async function xlsxCells(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const out = [];
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => out.push({ sheet: ws.name, addr: c.address, type: c.type, text: typeof c.value === 'string' ? c.value : null, formula: c.formula || null }))));
  return out;
}
/** Every XML part of a package must parse; the problems found. */
function xmlProblems(bytes) {
  const bad = [];
  for (const [p, b] of Object.entries(fflate.unzipSync(bytes))) {
    if (!/\.(xml|rels)$/.test(p)) continue;
    new DOMParser({ onError: (lvl, msg) => bad.push(`${p}: ${lvl} ${String(msg).split('\n')[0]}`) }).parseFromString(fflate.strFromU8(b), 'text/xml');
  }
  return bad;
}

async function run(tz, label) {
  const ck = (n, c, d = '') => check(`${label}: ${n}`, c, d);
  const { browser, ctx, page, errors } = await phone({ timezoneId: tz, permissions: ['clipboard-read', 'clipboard-write'] });
  page.setDefaultTimeout(15000);
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(`${d.type()}: ${d.message()}`); d.dismiss(); });
  const pause = (ms = 20) => page.waitForTimeout(ms);
  const noHarm = async (where) => {
    const st = await page.evaluate(() => ({ pwned: window.__pwned === undefined ? null : window.__pwned, imgs: document.querySelectorAll('img[src="x"], body [onerror]:not(script)').length, scripts: [...document.querySelectorAll('script')].filter((s) => /__pwned/.test(s.textContent)).length }));
    ck(`${where}: no dialog, no script run, no markup made from the text`, dialogs.length === 0 && st.pwned === null && st.imgs === 0 && st.scripts === 0, `${dialogs.join(' | ')} ${JSON.stringify(st)}`);
  };

  /** Type `text` into a field one character at a time (a key for most, insertText where a key would move or submit); the long text is filled whole. Returns the keystrokes after which the field was not the typed prefix or lost focus. */
  async function typeInto(loc, text) {
    await loc.scrollIntoViewIfNeeded();
    await loc.focus();
    await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Backspace');
    if (text.length > 1000) { await loc.fill(text); return []; }
    await page.evaluate(() => { window.__probe = document.activeElement; });
    const bad = []; let want = '';
    for (const ch of text) {
      if (/[\u0000-\u001f]/.test(ch)) await page.keyboard.insertText(ch); else await page.keyboard.type(ch);
      await pause(5);
      want += ch === '\r' || ch === '\n' ? '' : ch;
      const st = await page.evaluate(() => { const p = window.__probe; return { v: p.value ?? p.textContent, f: document.activeElement === p, c: p.isConnected }; });
      if (st.v !== want || !st.f || !st.c) bad.push(`after ${short(want)}: ${short(String(st.v))} focused=${st.f} connected=${st.c}`);
    }
    return bad;
  }
  const blur = (loc) => loc.evaluate((e) => e.blur());
  const go = async (v) => { await page.evaluate((x) => { location.hash = x; }, `#${v}`); await pause(300); };
  const sheetPick = async (text) => { await page.locator('dialog.action-sheet .action-item', { hasText: text }).first().click(); await pause(300); };
  const readDownload = async (action) => { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), action()]); return { name: dl.suggestedFilename(), bytes: fs.readFileSync(await dl.path()) }; };

  /** Everything typed, read back from a page: the comp names, the deal name, the note and the tenants. */
  async function snapshot(p, from) {
    await p.goto(BASE + '#comps', { waitUntil: 'load' });
    await p.waitForSelector(COMP_ROWS, { timeout: 20000 });
    const comps = await p.$$eval(`${COMP_ROWS} input[aria-label="Property name"]`, (i) => i.map((x) => x.value));
    await p.evaluate(() => { location.hash = '#deal'; });
    await p.waitForSelector('#deal-root');
    await p.waitForTimeout(500);
    if (!(await p.locator('#deal-tiles .tile').count())) await p.locator('#deal-root .list .li').first().click();
    await p.waitForSelector('#deal-tiles .tile');
    const name = await p.locator('#deal-root h1').first().textContent();
    await p.click('#tab-visit');
    // the note as saved (a textarea turns a lone CR into a line feed when it is shown, which is the browser's, not a change to what is kept)
    const shown = await p.locator('#visit-notes').inputValue();
    const note = await p.evaluate(() => new Promise((res) => { const id = localStorage.getItem('zlatura.deal.current'); const q = indexedDB.open('zlatura'); q.onsuccess = () => { const g = q.result.transaction('deals').objectStore('deals').get(id); g.onsuccess = () => { res(g.result.visit.notes); q.result.close(); }; }; }));
    await p.click('#tab-rentroll');
    const tenantsNow = await p.$$eval(TENANT, (i) => i.map((x) => x.value));
    return { comps, name, note, shown, tenants: tenantsNow };
  }
  const COMP_ROWS = '#sales-table tbody tr[data-key^="manual::"]';
  const TENANT = '#deal-rentroll .rr-grid tbody tr input[aria-label^="Tenant"]:not([aria-label^="Tenant contact"])';
  const DEAL = "=cmd|' /C calc'!A0 O’Brien 👩🏽‍💼 مكتب <script>window.__pwned=1</script>";
  const NOTE = ITEMS.filter((t) => t !== LONG).join('\n');
  const verify = (where, snap) => {
    ck(`${where}: comp names come back exactly`, same(snap.comps, wantNames), diff(snap.comps, wantNames));
    ck(`${where}: tenants come back exactly`, same(snap.tenants, wantNames), diff(snap.tenants, wantNames));
    ck(`${where}: the deal name comes back exactly`, snap.name === DEAL, short(snap.name));
    ck(`${where}: the site-visit note is saved exactly, and shown as typed`, snap.note === NOTE && snap.shown.replace(/\r\n?/g, '\n') === NOTE.replace(/\r\n?/g, '\n'), short(snap.note));
  };

  /* ---------------------------------------------------- 1. type the pack */
  await page.goto(BASE + '#comps', { waitUntil: 'load' });
  await page.click('#example');   // the add buttons appear once there is a comp set; the example comps stay out of every check below
  await page.waitForSelector('#sales-table tbody tr');
  let bad = [];
  for (const item of ITEMS) {
    const before = await page.$$eval(COMP_ROWS, (r) => r.map((x) => x.dataset.key));
    await page.locator('[data-add="sale"]').first().click();
    await pause(250);
    const key = (await page.$$eval(COMP_ROWS, (r) => r.map((x) => x.dataset.key))).find((k) => !before.includes(k));
    const input = page.locator(`tr[data-key="${key}"] input[aria-label="Property name"]`);
    bad.push(...await typeInto(input, item));
    await blur(input);
    await pause(150);
    // a price and size, so the comp is a full row in every export
    const price = page.locator(`tr[data-key="${key}"] input[aria-label="Sale price"]`);
    await price.fill('3300000'); await price.press('Tab');
    const bsf = page.locator(`tr[data-key="${key}"] input[aria-label="Building SF"]`);
    await bsf.fill('6000'); await bsf.press('Tab');
    await pause(100);
  }
  ck('comp names: every keystroke left exactly what was typed so far, in the same focused field', bad.length === 0, bad.slice(0, 3).join(' | '));
  const compNames = () => page.$$eval(`${COMP_ROWS} input[aria-label="Property name"]`, (i) => i.map((x) => x.value));
  const wantNames = ITEMS.map(ONE);
  let got = await compNames();
  ck('comp names: all 15 are kept as typed', same(got, wantNames), diff(got, wantNames));
  await noHarm('comps typed');
  const dirComps = await page.$$eval(`${COMP_ROWS} input[aria-label="Property name"]`, (i) => i.every((x) => x.getAttribute('dir') === 'auto'));
  ck('comp names: dir="auto" on every name field', dirComps);

  /* a deal: its name, a site-visit note and one tenant per text */
  await go('deal');
  await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
  await page.waitForSelector('#deal-tiles .tile');
  const h1 = page.locator('#deal-root h1').first();
  bad = await typeInto(h1, DEAL);
  await blur(h1);
  await pause(200);
  ck('deal name: every keystroke left exactly what was typed so far', bad.length === 0, bad.slice(0, 3).join(' | '));
  await page.click('#tab-visit');
  const notes = page.locator('#visit-notes');
  bad = [];
  for (const [i, item] of ITEMS.filter((t) => t !== LONG).entries()) {
    await notes.focus();
    await page.keyboard.press('ControlOrMeta+End');
    if (i) await page.keyboard.press('Enter');
    for (const ch of item) { if (/[\u0000-\u001f]/.test(ch)) await page.keyboard.insertText(ch); else await page.keyboard.type(ch); await pause(3); }
  }
  await blur(notes);
  const noteNow = await notes.inputValue();
  const wantNote = NOTE;   // exactly as typed, a lone CR too
  let at = 0; while (at < wantNote.length && noteNow[at] === wantNote[at]) at += 1;
  ck('site-visit note: all 14 texts are kept as typed, line breaks and all', noteNow === wantNote, `first difference at ${at}: got ${JSON.stringify(noteNow.slice(at, at + 12))} want ${JSON.stringify(wantNote.slice(at, at + 12))}`);
  await page.click('#tab-rentroll');
  bad = [];
  for (const [i, item] of ITEMS.entries()) {
    await page.locator('#deal-rentroll button', { hasText: '+ Unit' }).click();
    await pause(250);
    const t = page.locator(TENANT).nth(i);
    bad.push(...await typeInto(t, item));
    await blur(t);
    await pause(150);
  }
  ck('tenants: every keystroke left exactly what was typed so far', bad.length === 0, bad.slice(0, 3).join(' | '));
  const tenants = () => page.$$eval(TENANT, (i) => i.map((x) => x.value));
  got = await tenants();
  ck('tenants: all 15 are kept as typed', same(got, wantNames), diff(got, wantNames));
  await noHarm('deal typed');
  const dirs = await page.evaluate((sel) => ({ tenant: [...document.querySelectorAll(sel)].every((x) => x.getAttribute('dir') === 'auto'), note: document.getElementById('visit-notes').getAttribute('dir'), h1: document.querySelector('#deal-root h1').getAttribute('dir') }), TENANT);
  ck('dir="auto" on every tenant field, the note and the deal name', dirs.tenant && dirs.note === 'auto' && dirs.h1 === 'auto', JSON.stringify(dirs));

  /* ---------------------------------------------------- 2. a reload */
  await page.waitForTimeout(800);
  verify('as typed', await snapshot(page));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  verify('after a reload', await snapshot(page));
  await noHarm('after the reload');


  /* ---------------------------------------------------- 3. the exports */
  const tmp = fs.mkdtempSync(`${process.env.TMPDIR || '/tmp'}/zl-hostile-`);
  const save = (name, bytes) => { fs.writeFileSync(`${tmp}/${name}`, bytes); return `${tmp}/${name}`; };
  // what a CSV cell holds: a leading = + - @ tab or CR is guarded with a quote, a number is not
  const csvWant = (t) => (GUARD.test(t) ? `'${t}` : t);
  const looseCells = (cells) => cells.filter((c) => GUARD.test(c) && !/^-?\d+(\.\d+)?$/.test(c));

  // the rent roll CSV, with a negative number in it
  await page.click('#tab-rentroll');
  const mkt = page.locator('#deal-rentroll .rr-grid tbody tr:first-child input[aria-label^="Market rent"]').first();
  await mkt.fill('-1200'); await mkt.press('Tab'); await pause(300);
  await page.locator('#deal-rentroll button[aria-label="More rent roll actions"]').click();
  let dl = await readDownload(() => sheetPick('Export CSV'));
  let rows = csvParse(dl.bytes.toString('utf8'));
  const head = rows[0]; const tcol = head.indexOf('Tenant'); const mcol = head.indexOf('Market rent');
  ck('rent roll CSV: 15 unit rows, each the same width as the header', rows.length === 16 && rows.every((r) => r.length === head.length), `${rows.length} rows`);
  ck('rent roll CSV: every tenant is its text, a formula start guarded with a quote', same(rows.slice(1).map((r) => r[tcol]), wantNames.map(csvWant)), diff(rows.slice(1).map((r) => r[tcol]), wantNames.map(csvWant)));
  ck('rent roll CSV: a negative number is the number -1200, not the text \'-1200', rows.slice(1).some((r) => r[mcol] === '-1200') && !rows.flat().some((c) => c === "'-1200"), JSON.stringify(rows.slice(1).map((r) => r[mcol]).filter(Boolean)));
  ck('rent roll CSV: no cell that starts as a formula', looseCells(rows.flat()).length === 0, looseCells(rows.flat()).map(short).join(', '));

  // the comps CSV, the copy table, the comp sheet, both workbooks
  await go('comps');
  const compsMore = async (item) => { await page.click('#comps-more'); await pause(250); await sheetPick(item); };
  dl = await readDownload(() => compsMore('CSV'));
  const csvText = dl.bytes.toString('utf8').replace(/^﻿/, '');
  rows = csvParse(csvText);
  const cells = rows.flat();
  const csvCellWant = (t) => csvWant(t.replace(/\r\n?/g, '\n'));
  ck('comps CSV: every hostile name is there as text, a formula start guarded', wantNames.every((w) => cells.includes(csvCellWant(w))), wantNames.filter((w) => !cells.includes(csvCellWant(w))).map(short).join(', '));
  ck('comps CSV: no cell that starts as a formula, every row the same width', looseCells(cells).length === 0 && rows.every((r) => r.length === rows[0].length), looseCells(cells).map(short).join(', '));

  await compsMore('Copy comp table');
  await pause(300);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const lines = copied.split('\n');
  const tabs = lines.filter((l) => l.includes('\t'));
  const names = tabs.map((l) => l.split('\t')[1]).filter((x) => x !== undefined);
  const tsvWant = (t) => { const u = t.replace(/[\t\r\n]+/g, ' '); return /^[=+\-@]/.test(u) ? `'${u}` : u; };
  const wide = (l) => (l === lines.at(-1) ? l.replace(/\t+$/, '') : l).split('\t').length;   // the last row may lose its empty last column to the final trim
  ck('copy table: no row is wider than the 7 columns, so no tab inside a name starts a cell', tabs.every((l) => wide(l) <= 7), tabs.filter((l) => wide(l) > 7).map(short).join(' | '));
  ck('copy table: every hostile name is there, tabs as spaces, a formula start guarded', wantNames.every((w) => names.includes(tsvWant(w))), wantNames.filter((w) => !names.includes(tsvWant(w))).map((w) => short(tsvWant(w))).join(', '));
  ck('copy table: no name starts as a formula', names.every((n) => !/^[=+\-@\t\r]/.test(n)), names.filter((n) => /^[=+\-@\t\r]/.test(n)).map(short).join(', '));

  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await compsMore('Comp sheet');
  await pause(500);
  const sheetText = await page.locator('#print-sheet').innerText();
  const sheetHtml = await page.locator('#print-sheet').innerHTML();
  ck('comp sheet: the names print as text, with no markup made from them', wantNames.filter((w) => w !== LONG && !/[\u0000-\u001f]/.test(w)).every((w) => sheetText.includes(w)) && !/<img|<script/i.test(sheetHtml.replace(/&lt;/g, '')), '');
  await noHarm('comp sheet');

  dl = await readDownload(() => page.click('#download'));
  let xc = await xlsxCells(save('comps.xlsx', dl.bytes));
  const texts = xc.filter((c) => c.type === 3).map((c) => c.text);
  // the workbook keeps 32,000 characters of a longer text (Excel holds 32,767 in a cell)
  const hasText = (w) => (w === LONG ? texts.some((t) => t.startsWith(LONG.slice(0, 32000)) && t.length <= 32767) : texts.includes(XMLTEXT(w)));
  ck('comps workbook: every hostile name is a text cell (control characters dropped, the 40,000 cut to Excel\'s limit)', wantNames.every(hasText), wantNames.filter((w) => !hasText(w)).map(short).join(', '));
  ck('comps workbook: none of it became a formula', !xc.some((c) => c.formula && /cmd\||SUM\(1\)|@x|1\+1/.test(c.formula)), xc.filter((c) => c.formula && /cmd\||SUM\(1\)/.test(c.formula)).map((c) => c.formula).join(', '));
  ck('comps workbook: the XML of every part parses', xmlProblems(dl.bytes).length === 0, xmlProblems(dl.bytes).slice(0, 3).join(' | '));

  // my template
  await page.click('#out-template');
  await page.setInputFiles('#tpl-file', F + 'acme-template.xlsx');
  await page.waitForSelector('#sheet-foot .btn-primary');
  await page.click('#sheet-foot .btn-primary');
  await pause(400);
  dl = await readDownload(() => page.click('#download'));
  const tplText = Object.entries(fflate.unzipSync(dl.bytes)).filter(([k]) => /xl\/(worksheets|sharedStrings)/.test(k)).map(([, b]) => fflate.strFromU8(b)).join('\n');
  ck('comps template: the XML of every part parses, even with the 40,000-character name', xmlProblems(dl.bytes).length === 0, xmlProblems(dl.bytes).slice(0, 3).join(' | '));
  ck('comps template: the names are in it as text, markup escaped', tplText.includes('O&apos;Brien') || tplText.includes("O'Brien"), '');
  ck('comps template: the 40,000-character name is cut to 32,000 characters before it is escaped, so the "&" at 31,998 stays whole', tplText.includes('aaaaaaaa&amp;b'), '');
  await page.click('#out-builtin');
  await pause(200);

  // the deal: its workbook, the rent roll workbook, the brief, the PDF
  await go('deal');
  await pause(400);
  const dealMenu = async (item) => { await page.click('#deal-root button[aria-label="More deal actions"] >> visible=true'); await pause(250); await sheetPick(item); };
  dl = await readDownload(() => page.click('#deal-root .view-head .btn-primary'));
  xc = await xlsxCells(save('deal.xlsx', dl.bytes));
  const dtexts = xc.filter((c) => c.type === 3).map((c) => c.text);
  const noteLines = NOTE.trim().split(/\n+/);   // as the deal summary splits it; a line holding a CR or a control character is left to the XML rules
  const dealWant = [...wantNames.filter((w) => w !== LONG).map(XMLTEXT), ...noteLines.filter((l) => !/[\u0000-\u0008\u000A-\u001f]/.test(l)).map((l) => `•  Note, as written: ${l}`)];
  ck('deal workbook: the deal name, every tenant and the note lines are text cells, word for word', dtexts.some((t) => t.includes(XMLTEXT(DEAL))) && dealWant.every((w) => dtexts.includes(w)), dealWant.filter((w) => !dtexts.includes(w)).map(short).join(', '));
  ck('deal workbook: none of it became a formula; every part parses', !xc.some((c) => c.formula && /cmd\||SUM\(1\)|1\+1|__pwned/.test(c.formula)) && xmlProblems(dl.bytes).length === 0, xmlProblems(dl.bytes).slice(0, 3).join(' | '));
  await page.click('#tab-rentroll');
  await page.locator('#deal-rentroll button[aria-label="More rent roll actions"]').click();
  dl = await readDownload(() => sheetPick('Export rent roll and cash flow'));
  xc = await xlsxCells(save('rentroll.xlsx', dl.bytes));
  const rtexts = xc.filter((c) => c.type === 3).map((c) => c.text);
  ck('rent roll workbook: every tenant is a text cell, none a formula, every part parses', wantNames.filter((w) => w !== LONG).every((w) => rtexts.includes(XMLTEXT(w))) && !xc.some((c) => c.formula && /cmd\||SUM\(1\)|1\+1|__pwned/.test(c.formula)) && xmlProblems(dl.bytes).length === 0, wantNames.filter((w) => w !== LONG && !rtexts.includes(XMLTEXT(w))).map(short).join(', '));

  await page.evaluate(() => { window.__printed = false; window.print = () => { window.__printed = true; }; });
  await dealMenu('Deal brief');
  await pause(800);
  const brief = await page.locator('#print-sheet').innerText();
  const briefHtml = await page.locator('#print-sheet').innerHTML();
  ck('deal brief: opens the print dialog and prints the deal name as text', (await page.evaluate(() => window.__printed)) === true && brief.includes(DEAL), short(brief));
  ck('deal brief: the markup in the name is text, not elements', !/<script|<img/i.test(briefHtml.replace(/&lt;/g, '')) && briefHtml.includes('&lt;script&gt;'), '');
  await noHarm('deal brief');
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'Letter' });
  await page.emulateMedia({ media: 'screen' });
  const pdfjs = await import('../../vendor/pdf-4.7.76-legacy.min.js');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
  const pages = await pdfPages(pdfjs, new Uint8Array(pdf), { verbosity: 0 });
  const pdfText = JSON.stringify(pages);
  ck('PDF: made, and the pasted markup and the formula start in the name are printed as the typed text', pdf.length > 1000 && pdfText.includes('window.__pwned=1') && pdfText.includes("=cmd|' /C calc'!A0"), `${pdf.length} bytes`);

  // what is sent to the AI server: the body is JSON that carries the note word for word
  await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({ url: 'http://127.0.0.1:9', token: 'e2e-token-0123456789abcdef', enabled: true }, 'ai.settings'); t.oncomplete = () => { r.result.close(); res(); }; }; }));
  const sent = [];
  await ctx.route('http://127.0.0.1:9/**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') sent.push(req.postData());
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify({ answer: 'ok', citations: [], unknown: [] }) });
  });
  await dealMenu('Ask about this deal');
  await page.waitForSelector('#ai-question');
  await page.fill('#ai-question', "Who is O'Brien? <img src=x onerror=alert(1)>");
  await page.click('#ai-ask');
  await page.waitForFunction(() => document.querySelector('#sheet-body .ai-msg.a'), null, { timeout: 15000 });
  let body = null;
  try { body = JSON.parse(sent.at(-1)); } catch { /* not JSON */ }
  const facts = body ? JSON.stringify(body.facts) : '';
  ck('AI request: the body is valid JSON and carries the question as typed', !!body && body.question === "Who is O'Brien? <img src=x onerror=alert(1)>", sent.at(-1) ? short(sent.at(-1)) : 'nothing sent');
  const names5 = "101 (O'Brien), 102 (O’Brien), 103 (👩🏽‍💼 Café), 104 (مكتب Suite 101), 105 (x‮evil)";
  ck('AI request: the tenant names in the facts go word for word (quotes, emoji, right-to-left text, the direction mark)', !!body && facts.includes(JSON.stringify(names5).slice(1, -1)) && body.facts.some((f) => f.value.includes(names5)), short(facts));
  await noHarm('the AI question');
  await page.click('#sheet-close');
  await pause(300);
  await ctx.unroute('http://127.0.0.1:9/**');

  /* ---------------------------------------------------- 4. dates in this zone */
  await go('tools');
  await page.click('#tools-root button.tool[data-tool="x1031"]');
  await page.waitForSelector('#tool-x1031-closing');
  const closing = page.locator('#tool-x1031-closing');
  await closing.focus();
  for (const ch of '03/01/2027') { await page.keyboard.type(ch); await pause(10); }
  await page.keyboard.press('Tab');
  await pause(400);
  const x1031 = await page.locator('#sheet-body .results').innerText();
  ck('1031 clock: closing Mar 1, 2027 gives Apr 15 and Aug 28, 2027 here (the day does not slip west of UTC)', /Apr 15, 2027/.test(x1031) && /Aug 28, 2027/.test(x1031), x1031.replace(/\s+/g, ' '));
  await page.click('#sheet-close');
  await pause(300);

  /* ---------------------------------------------------- 5. a backup, restored into a fresh profile */
  await go('settings');
  await page.waitForSelector('#backup-make');
  dl = await readDownload(() => page.click('#backup-make'));
  const backupPath = save('backup.json', dl.bytes);
  const bj = JSON.parse(dl.bytes.toString('utf8'));
  ck('backup: a valid file that holds the deal', bj.format === 'zlatura-backup' && bj.deals.length === 1 && bj.deals[0].name === DEAL, `${bj.format} ${bj.deals.length}`);
  const fresh = await phone({ timezoneId: tz });
  fresh.page.setDefaultTimeout(15000);
  fresh.page.on('dialog', (d) => { dialogs.push(`${d.type()}: ${d.message()}`); d.dismiss(); });
  await fresh.page.goto(BASE + '#settings', { waitUntil: 'load' });
  await fresh.page.waitForSelector('#settings-data #backup-file', { state: 'attached' });
  await fresh.page.setInputFiles('#backup-file', backupPath);
  await fresh.page.waitForSelector('dialog.action-sheet');
  await Promise.all([fresh.page.waitForEvent('load', { timeout: 30000 }), fresh.page.locator('dialog.action-sheet .action-item', { hasText: 'Merge into this device' }).click()]);
  await fresh.page.waitForTimeout(1500);
  verify('restored into a fresh profile', await snapshot(fresh.page));
  ck('restored: no dialog, no script run', dialogs.length === 0 && (await fresh.page.evaluate(() => window.__pwned)) === undefined, dialogs.join(' | '));
  await fresh.browser.close();

  /* ---------------------------------------------------- 6. the 40,000-character name in the audit sheet of a filled model */
  await page.bringToFront();
  await go('deal');
  await pause(500);
  if (!(await page.locator('#deal-tiles .tile').count())) await page.locator('#deal-root .list .li').first().click();
  await page.waitForSelector('#deal-tiles .tile');
  await page.click('#tab-overview');
  await page.fill('#fig-price', '6450000'); await page.press('#fig-price', 'Tab');   // a template is filled from a deal that has figures
  await pause(300);
  const name2 = page.locator('#deal-root h1').first();
  await name2.fill(LONG);
  await blur(name2);
  await pause(500);
  await dealMenu('Fill my Excel template');
  await page.waitForSelector('#sheet-foot button:has-text("Upload a template")');
  const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#sheet-foot button', { hasText: 'Upload a template' }).click()]);
  await ch.setFiles(F + 'uw-model.xlsx');
  await page.waitForSelector('#sheet-body .tpl-grid');
  const mapped = await page.$$eval('#sheet-body .map-row .h', (x) => x.map((h) => h.textContent));
  ck('model template: the property name is mapped to Inputs!B3', mapped.some((m) => m.includes('Inputs!B3')), mapped.join(' | '));
  await page.locator('#sheet-foot button', { hasText: 'Save mapping' }).click();
  await pause(400);
  await dealMenu('Fill my Excel template');
  await page.waitForSelector('#sheet-body .li');
  await page.locator('#sheet-body .li button', { hasText: 'Fill' }).first().click();
  await page.waitForSelector('#sheet-body table.tpl-preview');
  dl = await readDownload(() => page.locator('#sheet-foot button', { hasText: 'Fill and download' }).click());
  const filled = fflate.unzipSync(dl.bytes);
  const audit = Object.entries(filled).filter(([k, b]) => /worksheets\/sheet\d+\.xml$/.test(k) && fflate.strFromU8(b).includes('Only the cells below')).map(([, b]) => fflate.strFromU8(b))[0] || '';
  ck('filled model: every XML part parses, the audit sheet too', xmlProblems(dl.bytes).length === 0 && audit.length > 0, xmlProblems(dl.bytes).slice(0, 3).join(' | '));
  ck('filled model: the audit sheet holds the first 32,000 characters of the name, the "&" at 31,998 whole', audit.includes('aaaaaaaa&amp;b'), '');
  await noHarm('the filled model');
  ck('no console errors or failed requests', errors.length === 0, errors.slice(0, 3).join(' / '));

  await page.close();
  await browser.close();
  return;
}

await run('America/Los_Angeles', 'LA');
await run('Europe/London', 'London');
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R);
