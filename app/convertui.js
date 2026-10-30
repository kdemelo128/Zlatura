/* convertui.js -- Tools > Documents > Convert: pick a file, see what it can become and what it can't (and why), and
 * save the result. Everything runs on this device; nothing is uploaded and no file or result is kept (the file is
 * held only while this sheet is open). The rules and the pure conversions are in convert.js; PDFs are written in
 * convert-worker.js. Cancel, or a minute passing, stops PDF writing at once and the other runs at the next page or step; one picture or workbook
 * being decoded can't be interrupted, so its result is dropped instead of saved. */

/* global createImageBitmap */

import { el, toast, deliver, deliveryError, getPdfjs, getFflate, getXlsx, isIOS, downloadName } from './kit.js';
import {
  classify, targetsFor, notPossible, MATRIX, NOT_OFFERED, baseName, imageSize, exifOrientation, pageScale, textPdfProblem,
  docxText, clip, zipKeys, csvToCells, csvToJson, jsonToCsv, workbookToCsvs, sheetName, MAX_IMAGE_PIXELS, IMAGE_PAGES,
} from './convert.js';
import { loadXlsx } from './sheetread.js';
import { WATCHDOG_MS, MAX_PAGES, problemText } from './pdfpages.js';
import { pdfPages } from './pdftext.js';

/* ------------------------------------------------------------- the worker */

let worker = null;
/** @type {Map<number, any>} */
const waiting = new Map();
let nextId = 1;
function stopWorker(why) {
  const w = worker;
  worker = null;
  if (w) w.terminate();
  for (const [, p] of waiting) p.resolve({ ok: false, kind: 'stopped', message: why });
  waiting.clear();
}
/** @param {object} msg @param {(done: number, of: number) => void} [onProgress] */
function ask(msg, onProgress) {
  return new Promise((resolve) => {
    const id = nextId++;
    try {
      if (!worker) {
        worker = new Worker(new URL('./convert-worker.js', import.meta.url));
        worker.onmessage = (ev) => {
          const w = waiting.get(ev.data.id);
          if (!w) return;
          if (ev.data.progress !== undefined) { w.onProgress?.(ev.data.progress, ev.data.of); return; }
          waiting.delete(ev.data.id);
          w.resolve(ev.data);
        };
        worker.onerror = (ev) => { ev.preventDefault?.(); stopWorker(`the PDF writer stopped (${ev.message || 'unknown error'})`); };
      }
    } catch (e) { resolve({ ok: false, kind: 'other', message: String(e.message || e) }); return; }
    waiting.set(id, { resolve, onProgress });
    worker.postMessage({ id, ...msg });
  });
}

/* ----------------------------------------------------------- the pictures */

const stopped = (ctl) => { if (ctl.stopped) throw Object.assign(new Error(ctl.why), { stopped: true }); };

/** A picture drawn to a canvas and written as `mime` ('image/png' or 'image/jpeg'): every pixel kept, on white if JPEG. */
async function redraw(blob, mime, name, ctl) {
  const head = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
  let size = imageSize(head);
  // the size can lie past the first 64 KB (a JPEG with long metadata, a HEIC): read the file (20 MB at most) to find it
  if (!size) size = imageSize(new Uint8Array(await blob.arrayBuffer()));
  if (!size) throw new Error(`${name}: its size in pixels can’t be read, so it was not opened (a very large picture could use all the memory this browser has).`);
  if (size.w * size.h > MAX_IMAGE_PIXELS) throw new Error(`${name} is ${size.w} by ${size.h} pixels (${Math.round((size.w * size.h) / 1e5) / 10} million). A phone’s browser draws at most ${MAX_IMAGE_PIXELS / 1e6} million, so it was not converted.`);
  let bmp;
  try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { throw new Error(`${name} could not be opened by this browser. ${/ftyp/.test(String.fromCharCode(...head.subarray(4, 8))) ? 'Only Safari opens HEIC photos; ask for a JPEG, or open this in Safari.' : 'It may be damaged.'}`); }
  try {
    stopped(ctl);
    if (bmp.width * bmp.height > MAX_IMAGE_PIXELS) throw new Error(`${name} is ${bmp.width} by ${bmp.height} pixels, more than a phone’s browser draws (${MAX_IMAGE_PIXELS / 1e6} million). It was not converted.`);
    return await canvasBlob(bmp, bmp.width, bmp.height, mime);
  } finally { bmp.close(); }
}
async function canvasBlob(source, w, h, mime, draw = null) {
  const c = el('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (mime === 'image/jpeg' || draw) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
  if (draw) await draw(g); else g.drawImage(source, 0, 0);
  const blob = await new Promise((res) => c.toBlob(res, mime, 0.92));
  c.width = c.height = 0;
  if (!blob) throw new Error('This browser could not write the picture.');
  return new Uint8Array(await blob.arrayBuffer());
}

/* ------------------------------------------------------------ the sheet */

export function openConvert(api) {
  /** @type {{ file: any, info: any } | null} */
  let current = null;
  let busy = false;
  let ctl = { stopped: false, why: '' };
  let timer = null;

  const body = api.sheetOpen({
    eyebrow: 'Tools · Documents', title: 'Convert files',
    sub: 'Pick a file and see what it can become on this device. The file stays here: nothing is uploaded. The saved file’s name appears on Home’s activity list and in backups; no file contents are kept.',
  });
  body.classList.add('docs-pages');

  const pick = el('button', 'btn btn-primary docs-add', 'Choose a file…');
  pick.type = 'button';
  const input = el('input');
  input.type = 'file';
  input.id = 'conv-file';
  input.hidden = true;
  pick.addEventListener('click', () => input.click());
  const pickRow = el('div', 'docs-row');
  pickRow.append(pick, input);

  const status = el('p', 'hint-sm docs-status');
  status.id = 'conv-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const alert = el('div', 'docs-problems');
  alert.id = 'conv-problems';
  alert.setAttribute('role', 'alert');
  const fileLine = el('p', 'docs-fname');
  fileLine.id = 'conv-file-line';
  const noteLine = el('p', 'hint-sm');
  noteLine.id = 'conv-note';
  const canLab = el('p', 'docs-fname', 'Can become');
  canLab.id = 'conv-can-label';
  const can = el('ul', 'docs-files conv-can');
  can.id = 'conv-can';
  can.setAttribute('aria-labelledby', 'conv-can-label');
  const noLab = el('p', 'docs-fname', 'Cannot become');
  noLab.id = 'conv-no-label';
  const no = el('ul', 'docs-files conv-no');
  no.id = 'conv-no';
  no.setAttribute('aria-labelledby', 'conv-no-label');

  const prog = el('div', 'docs-progress');
  prog.hidden = true;
  const bar = el('progress');
  bar.setAttribute('aria-label', 'Converting');
  bar.max = 100;
  const cancel = el('button', 'btn docs-btn', 'Cancel');
  cancel.type = 'button';
  cancel.id = 'conv-cancel';
  prog.append(bar, cancel);

  // everything this card does and refuses, as a table, for anyone who wants to know before choosing a file
  const all = el('details', 'conv-all');
  all.id = 'conv-all';
  all.appendChild(el('summary', null, 'Everything this card can and can’t do'));
  const table = el('table', 'conv-table');
  table.appendChild(el('caption', 'hint-sm', 'Conversions on this device'));
  const hr = el('tr');
  for (const h of ['From', 'To', 'What is kept']) { const th = el('th', null, h); th.scope = 'col'; hr.appendChild(th); }
  const thead = el('thead'); thead.appendChild(hr); table.appendChild(thead);
  const tb = el('tbody');
  for (const m of MATRIX) tb.appendChild(el('tr')).append(el('td', null, [...new Set(m.from)].join(', ')), el('td', null, m.to), el('td', null, m.fidelity));
  table.appendChild(tb);
  all.appendChild(table);
  all.appendChild(el('p', 'docs-fname', 'Not offered'));
  const notList = el('ul', 'docs-files');
  for (const [what, why] of NOT_OFFERED) notList.appendChild(el('li', null, `${what}: ${why}`));
  all.appendChild(notList);

  body.append(pickRow, status, alert, fileLine, noteLine, canLab, can, noLab, no, prog, all);
  canLab.hidden = noLab.hidden = true;

  const say = (t) => { status.textContent = ''; setTimeout(() => { status.textContent = t; }, 30); };
  const problems = (lines) => { alert.textContent = ''; for (const l of lines) alert.appendChild(el('p', 'warn-text', l)); };
  const lock = (on) => {
    busy = on;
    pick.disabled = on;
    input.disabled = on;
    for (const b of can.querySelectorAll('button')) /** @type {HTMLButtonElement} */ (b).disabled = on;
    prog.hidden = !on;
    if (on) bar.removeAttribute('value');
  };

  /** Show the file and what it can and can't become. */
  function draw() {
    can.textContent = no.textContent = '';
    problems([]);
    if (!current) { fileLine.textContent = noteLine.textContent = ''; canLab.hidden = noLab.hidden = true; return; }
    const { file, info } = current;
    fileLine.textContent = `${file.name || 'file'} · ${info.label || 'not a supported file'} · ${Math.round(file.size / 1e5) / 10} MB`;
    noteLine.textContent = info.note || '';
    if (info.refuse) {
      canLab.hidden = noLab.hidden = true;
      problems([info.refuse]);
      say('This file can’t be converted.');
      return;
    }
    const ts = targetsFor(info.kind);
    canLab.hidden = false;
    for (const m of ts) {
      const li = el('li');
      const b = el('button', 'btn docs-btn', `To ${m.to}`);
      b.type = 'button';
      b.id = `conv-to-${m.id}`;
      b.dataset.id = m.id;
      const d = el('span', 'hint-sm', m.fidelity);
      d.id = `conv-d-${m.id}`;
      b.setAttribute('aria-describedby', d.id);
      b.addEventListener('click', () => run(m));
      li.append(b, d);
      can.appendChild(li);
    }
    const nos = notPossible(info.kind);
    noLab.hidden = !nos.length;
    for (const [to, why] of nos) no.appendChild(el('li', null, `To ${to}: ${why}.`));
    say(`${ts.length} ${ts.length === 1 ? 'conversion is' : 'conversions are'} available for this file.`);
  }

  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file || busy) return;
    lock(true);
    prog.hidden = true;
    current = null;
    try {
      const info = await classify(file, { getFflate });
      current = { file, info };
    } catch (e) {
      current = { file, info: { kind: 'unknown', label: '', note: '', refuse: `${file.name || 'That file'} could not be read: ${String(e.message || e).slice(0, 100)}.` } };
    }
    lock(false);
    draw();
    const first = can.querySelector('button');
    (first || pick).focus();
  });

  /* ------------------------------------------------------------- running */

  const stop = (why) => { ctl.stopped = true; ctl.why = why; stopWorker(why); };
  cancel.addEventListener('click', () => stop('cancelled'));

  /** Run one conversion: returns { files: [{ name, bytes, type }], note }. */
  async function convert(m) {
    const { file, info } = current;
    const name = file.name || 'file';
    const base = baseName(name);
    const one = (bytes, ext = m.ext, type = m.type, stem = base) => ({ name: `${stem}.${ext}`, bytes, type });
    const phone = isIOS();
    if (m.id === 'img-pdf') {
      let blob = file; let kind = info.kind;
      const turned = info.kind === 'jpeg' && exifOrientation(new Uint8Array(await file.slice(0, 65536).arrayBuffer())) !== 1;
      if (info.kind === 'webp' || turned) { blob = new Blob([await redraw(file, 'image/png', name, ctl)], { type: 'image/png' }); kind = 'png'; }
      else if (info.kind === 'png') {
        // the PDF library decodes a PNG to embed it, so a huge one is refused as a canvas would refuse it
        const size = imageSize(new Uint8Array(await file.slice(0, 65536).arrayBuffer()));
        if (size && size.w * size.h > MAX_IMAGE_PIXELS) throw new Error(`${name} is ${size.w} by ${size.h} pixels (${Math.round((size.w * size.h) / 1e5) / 10} million), more than the ${MAX_IMAGE_PIXELS / 1e6} million this tool handles. It was not converted.`);
      }
      const r = await ask({ type: 'image', file: blob, kind }, (d, of) => { bar.max = of; bar.value = d; });
      if (!r.ok) throw new Error(r.kind === 'stopped' ? r.message : `${name}: ${r.message}.`);
      return { files: [one(r.bytes)], note: turned ? 'The photo was stored turned by its camera, so it was redrawn upright (every pixel kept) as PNG.' : '' };
    }
    if (m.id === 'txt-pdf') {
      const bad = textPdfProblem(name, info.text);
      if (bad) throw new Error(bad);
      const r = await ask({ type: 'text', text: info.text }, (d, of) => { bar.max = of; bar.value = d; });
      if (!r.ok) throw new Error(r.kind === 'stopped' ? r.message : r.kind === 'toolong' ? `${name}: ${r.message}. Split the file first.` : `${name}: ${r.message}.`);
      return { files: [one(r.bytes)], note: '' };
    }
    if (m.how === 'canvas') {
      const out = await redraw(file, m.type, name, ctl);
      return { files: [one(out)], note: '' };
    }
    if (m.id === 'pdf-png' || m.id === 'pdf-jpeg') return pdfPictures(m, file, base, phone);
    if (m.id === 'pdf-txt') {
      const pdfjs = await getPdfjs();
      let pages;
      try {
        pages = await pdfPages(pdfjs, new Uint8Array(await file.arrayBuffer()), {
          verbosity: 0,
          onPage: (i, total) => {
            stopped(ctl);
            if (total > MAX_PAGES) throw Object.assign(new Error(`${name} has ${total} pages; ${MAX_PAGES} is the most to read at once. Use PDF pages to cut it first.`), { plain: true });
            bar.max = total; bar.value = i;
          },
        });
      } catch (e) { throw pdfError(e, name); }
      const blank = pages.map((t, i) => (t.trim() ? 0 : i + 1)).filter(Boolean);
      const text = pages.map((t, i) => `Page ${i + 1}\n${t.trim() || '(no text on this page)'}`).join('\n\n');
      if (blank.length === pages.length) throw new Error(`${name} has no text on any page: it looks like a scan. Zlatura doesn’t read scanned pages in this card, so nothing was converted.`);
      return { files: [one(new TextEncoder().encode(text))], note: blank.length ? `No text on page${blank.length === 1 ? '' : 's'} ${blank.slice(0, 20).join(', ')}${blank.length > 20 ? ' and more' : ''} (a scan, or only pictures); marked in the file. Scanned pages are not read by OCR here.` : '' };
    }
    if (m.id === 'docx-txt') {
      const fflate = await getFflate();
      return { files: [one(new TextEncoder().encode(docxText(new Uint8Array(info.buffer), fflate, name)))], note: 'Pictures, headers, footers and footnotes are not in the text.' };
    }
    if (m.id === 'xlsx-csv') {
      let wb;
      try { wb = await loadXlsx(file, getXlsx, info); } catch (e) { throw new Error(String(e.message).startsWith(name) ? e.message : `${name}: ${e.message}`); }
      stopped(ctl);
      const { sheets, notes } = workbookToCsvs(wb);
      if (!sheets.length) throw new Error(`${name} has no visible sheet to convert.${notes.length ? ` ${notes.join(' ')}` : ''}`);
      const enc = new TextEncoder();
      const files = sheets.map((s) => one(enc.encode(s.csv), 'csv', 'text/csv', sheets.length === 1 ? base : `${clip(base, 80)} - ${s.name}`));
      return { files, note: [...(info.macros ? ['The workbook has macros; they are not copied.'] : []), ...notes].join(' ') };
    }
    if (m.id === 'csv-xlsx') {
      const { rows, numbers, ambiguous } = csvToCells(info.text, info.delimiter, name);
      const { ExcelJS } = await getXlsx();
      let bytes;
      try {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet(sheetName(base));
        for (const r of rows) ws.addRow(r);
        bytes = new Uint8Array(await wb.xlsx.writeBuffer());
      } catch (e) { throw new Error(`${name} could not be written as a workbook (${String((e && e.message) || e).slice(0, 80)}).`); }
      return { files: [one(bytes)], note: `${numbers} plain number${numbers === 1 ? '' : 's'} became number${numbers === 1 ? '' : 's'}; every other field stays text exactly as written.${ambiguous ? ` ${ambiguous} value${ambiguous === 1 ? '' : 's'} like 1.250 stayed text: this file seems to write decimals with a comma, so a dot could mean thousands or a decimal. Check ${ambiguous === 1 ? 'it' : 'them'}.` : ''}` };
    }
    if (m.id === 'csv-json') return { files: [one(new TextEncoder().encode(csvToJson(info.text, info.delimiter, name)))], note: '' };
    if (m.id === 'json-csv') return { files: [one(new TextEncoder().encode(jsonToCsv(info.text, name)))], note: '' };
    throw new Error(`${name}: that conversion is not available.`);
  }

  /** A PDF's pages as pictures: one file, or a zip. */
  async function pdfPictures(m, file, base, phone) {
    const name = file.name || 'file';
    const pdfjs = await getPdfjs();
    let doc;
    try { doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), verbosity: 0, isEvalSupported: false }).promise; } catch (e) { throw pdfError(e, name); }
    try {
      const cap = phone ? IMAGE_PAGES.phone : IMAGE_PAGES.desktop;
      if (doc.numPages > cap) throw new Error(`${name} has ${doc.numPages} pages; at most ${cap} can become pictures at once on this device. Use PDF pages → Extract to cut out the pages you need first.`);
      const out = [];
      const pad = String(doc.numPages).length;
      for (let i = 1; i <= doc.numPages; i++) {
        stopped(ctl);
        bar.max = doc.numPages; bar.value = i;
        const page = await doc.getPage(i);
        const v1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: pageScale(v1.width, v1.height) });
        const bytes = await canvasBlob(null, Math.max(1, Math.ceil(vp.width)), Math.max(1, Math.ceil(vp.height)), m.type, async (g) => { await page.render({ canvasContext: g, viewport: vp }).promise; });
        page.cleanup();
        out.push({ name: doc.numPages === 1 ? `${base}.${m.ext}` : `${clip(base, 80)} page ${String(i).padStart(pad, '0')}.${m.ext}`, bytes, type: m.type });
      }
      return { files: out, note: '' };
    } finally { doc.destroy(); }
  }

  /** What went wrong opening a PDF with pdf.js, in words. */
  function pdfError(e, name) {
    if (e && (e.stopped || e.plain)) return e;
    const n = e && e.name;
    if (n === 'PasswordException') return new Error(problemText(name, 'encrypted'));
    if (n === 'InvalidPDFException' || n === 'MissingPDFException' || n === 'FormatError') return new Error(problemText(name, 'invalid'));
    return new Error(problemText(name, 'other', String((e && e.message) || e).slice(0, 80)));
  }

  async function run(m) {
    if (busy || !current) return;
    problems([]);
    ctl = { stopped: false, why: '' };
    lock(true);
    say('Converting…');
    cancel.focus();
    clearTimeout(timer);
    timer = setTimeout(() => stop('it took more than a minute, so it was stopped'), WATCHDOG_MS);
    let res = null; let err = null;
    try { res = await convert(m); } catch (e) { err = e; }
    clearTimeout(timer);
    lock(false);
    (can.querySelector(`#conv-to-${m.id}`) || pick).focus();
    if (ctl.stopped || (err && err.stopped)) {
      if (ctl.why === 'cancelled') say('Cancelled. Nothing was saved.');
      else { problems([`${current.file.name || 'The file'} was not converted: ${ctl.why}. Nothing was saved.`]); say('Nothing was saved.'); }
      return;
    }
    if (err) { const msg = String(err.message || err); const fn = current.file.name || 'The file'; problems([msg.includes(fn) ? msg : `${fn}: ${msg}`]); say('Nothing was saved.'); return; }
    try {
      let done;
      if (res.files.length === 1) done = await deliver(res.files[0].name, res.files[0].bytes, res.files[0].type, { map: 'none: a document the broker supplied' });
      else {
        const fflate = await getFflate();
        const zip = {};
        const keys = zipKeys(res.files.map((f) => f.name), downloadName);
        res.files.forEach((f, i) => { zip[keys[i]] = [f.bytes, { level: 0 }]; });
        done = await deliver(`${baseName(current.file.name)}.zip`, fflate.zipSync(zip), 'application/zip', { map: 'none: a document the broker supplied' });
      }
      if (done === 'done') {
        const what = res.files.length === 1 ? 'Your file is ready.' : `${res.files.length} files are in your zip.`;
        toast(what); say(`${what}${res.note ? ` ${res.note}` : ''}`);
      }
    } catch (e) { deliveryError(e); }
    (can.querySelector(`#conv-to-${m.id}`) || pick).focus();
  }

  document.getElementById('sheet').addEventListener('close', () => {
    clearTimeout(timer);
    stop('closed');
    current = null; // the file is let go
  }, { once: true });

  draw();
  say('Choose a file to see what it can become.');
}
