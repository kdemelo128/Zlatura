/* leasereadui.js -- "Read the lease" on an abstract: the broker picks the lease PDF, the app reads it on this device with fixed rules
 * (leaseread.js; no AI, nothing sent anywhere), shows what it found with each value's page and quote, and the broker keeps what is right.
 * Keeping never ticks: the tick stays the broker's, beside the page.
 *
 *   file -> size and kind check -> fingerprint against the Doc -> page text (pdf.js, with progress and Cancel) -> scanned pages offered
 *   for OCR (one engine for the whole run, Cancel, a minute at most a page) -> the reader in a worker (a minute at most) -> staged rows
 *   -> Keep -> one history entry.
 *
 * The pages read are kept in memory for this deal only (a session map keyed by the file's fingerprint), so Cancel can resume and "Show
 * page" can draw the page; nothing is stored, and dropLeaseSessions() empties it when the deal closes. The bytes of a lease are never saved. */

import { el, toast, getPdfjs, pdfProblem } from './kit.js';
import { checkReader, LIMITS } from './filekind.js';
import { sha256Hex } from './filehash.js';
import { pdfPages } from './pdftext.js';
import { openScanReader, ocrSupported } from './ocr.js';
import { WATCHDOG_MS, parseRanges } from './pdfpages.js';
import { needsOcr, ranges } from './leaseread.js';
import { stageInto, keepStaged, summarise } from './leasestage.js';
import { dateInput } from './dateinput.js';
import { squash } from './reconcile.js';

/** Pages read this session, by file fingerprint: { name, texts, layouts, ocr: { [n]: { text, conf, geom, scale } }, bytes }. */
const sessions = new Map();
export const dropLeaseSessions = () => { sessions.clear(); };
let reading = false; // one read at a time in a tab
const OCR_SECONDS = 20; // an estimate per page; the screen says so, and the real figure on a phone is reported, not promised
const MAX_SCANS = 60;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const CANCELLED = Object.assign(new Error('cancelled'), { cancelled: true });

/**
 * Race a promise against the watchdog: when `ms` pass first, `onTimeout()` runs (it stops the work) and the result is rejected with
 * { slow: true }. Whichever way it ends, the timer is cleared.
 * @template T @param {Promise<T>} p @param {number} ms @param {() => void} [onTimeout]
 */
export function withWatchdog(p, ms, onTimeout = () => {}) {
  let timer;
  const slow = new Promise((_, reject) => { timer = setTimeout(() => { try { onTimeout(); } catch { /* fine */ } reject(Object.assign(new Error('slow'), { slow: true })); }, ms); });
  return Promise.race([p, slow]).finally(() => clearTimeout(timer));
}

/** The reader in its worker (or here, if the worker cannot start). Resolves the Result; rejects with { slow } or { cancelled } or an error. */
function analyse(job, run) {
  return new Promise((resolve, reject) => {
    let worker = null;
    const stop = () => { if (worker) { worker.terminate(); worker = null; } };
    run.stops.add(stop);
    const done = (fn, v) => { run.stops.delete(stop); stop(); fn(v); };
    const local = () => import('./leaseread.js').then((m) => setTimeout(() => {
      try { done(resolve, m.readLease(m.pageModel(job.texts, { ocr: job.ocr }), { name: job.name, as: job.as })); } catch (e) { done(reject, e); }
    }, 0), (e) => done(reject, e));
    try {
      worker = new Worker(new URL('./leaseread-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const d = e.data || {}; if (d.ok) done(resolve, d.result); else done(reject, new Error(d.message || 'the reader failed')); };
      worker.onerror = (e) => { e.preventDefault && e.preventDefault(); stop(); local(); };
      worker.postMessage({ id: 1, texts: job.texts, ocr: job.ocr, name: job.name, as: job.as });
    } catch { worker = null; local(); }
    run.reject = (e) => done(reject, e);
  });
}

/* ------------------------------------------------------------ the block on the abstract */

/**
 * The "Read the lease" block for an abstract's editor. ctx: { h (the abstract host), ab, redraw(), say(text), problem(text) }.
 * @param {{ h: any, ab: any, redraw: () => void, say: (t: string) => void, problem: (t: string) => void }} ctx
 */
export function leaseReadBlock(ctx) {
  const { h, ab } = ctx;
  const box = el('section', 'ab-read');
  box.id = 'ab-read';
  const head = el('h3', null, 'Read the lease');
  box.append(head, el('p', 'hint-sm', 'The app reads the PDF on this device with fixed rules, no AI. It shows each value with its page and a short quote, or “Not found”. You keep what is right, then tick each value beside its page. Nothing here reaches a deal figure.'));
  const list = el('ul', 'ab-read-docs');
  const run = el('div', 'ab-read-run');
  run.id = 'lr-run';
  const fileIn = el('input');
  fileIn.type = 'file'; fileIn.accept = 'application/pdf,.pdf'; fileIn.hidden = true; fileIn.id = 'lr-file';
  fileIn.setAttribute('aria-label', 'Choose the lease PDF');
  box.append(list, fileIn, run);

  const docs = () => ab.docs.map((id) => h.docs().find((d) => d.id === id)).filter(Boolean);
  function drawList() {
    list.textContent = '';
    const mine = docs();
    if (!mine.length) { list.appendChild(el('li', 'hint-sm', 'No document is linked to this abstract yet. Add the lease on the Documents card, then link it under any item’s Source.')); return; }
    mine.forEach((d, i) => {
      const li = el('li', 'ab-read-doc');
      const b = el('button', 'btn btn-plain btn-sm', 'Read the lease');
      b.type = 'button'; b.id = `ab-read-${i}`;
      b.setAttribute('aria-label', `Read the lease: ${d.name}`);
      b.addEventListener('click', () => start(d));
      li.append(el('span', 'ab-read-name', d.name), b);
      list.appendChild(li);
    });
  }
  drawList();

  const clear = () => { run.textContent = ''; };
  const note = (text, cls = 'hint-sm') => { const p = el('p', cls, text); run.appendChild(p); return p; };
  const refuse = (text) => { clear(); const p = el('p', 'warn-text'); p.setAttribute('role', 'alert'); p.textContent = text; run.appendChild(p); ctx.say(text); return p; };

  /** The broker's file: resolves a File, or null when the picker is cancelled. */
  const pick = () => new Promise((resolve) => {
    fileIn.value = '';
    const done = (f) => { fileIn.removeEventListener('change', onChange); fileIn.removeEventListener('cancel', onCancel); resolve(f); };
    const onChange = () => done(fileIn.files && fileIn.files[0] ? fileIn.files[0] : null);
    const onCancel = () => done(null);
    fileIn.addEventListener('change', onChange);
    fileIn.addEventListener('cancel', onCancel);
    fileIn.click();
  });

  /** A file the broker picked for `doc`: checked for kind, size and fingerprint. Returns { file, bytes, sha } or null (the reason is on screen). */
  async function open(doc, file) {
    const why = file.size > LIMITS.pdf ? `“${file.name}” can’t be read: it is ${Math.round(file.size / 1e5) / 10} MB; a lease PDF is read up to ${LIMITS.pdf / 1e6} MB here.` : await checkReader(file, 'pdf');
    if (why) { refuse(why); return null; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha = await sha256Hex(bytes);
    if (doc.sha256 && sha && sha !== doc.sha256) {
      const p = refuse(`This is not the same file as ‘${doc.name}’ (its fingerprint differs). It was not read into that document.`);
      if (h.addDocument) {
        const add = el('button', 'btn btn-plain btn-sm', 'Add it as a new document');
        add.type = 'button'; add.id = 'lr-add-new';
        add.addEventListener('click', () => {
          const r = h.addDocument({ name: file.name, size: file.size, sha256: sha, kind: 'pdf', type: doc.type });
          if (r && r.error) { ctx.problem(r.error); return; }
          clear(); note(`${file.name} was added to the Documents card. Link it to this abstract under an item’s Source, then read it.`); drawList();
        });
        p.after(add);
      }
      return null;
    }
    return { file, bytes, sha };
  }

  /* ------------------------------------------------------- the read */
  async function start(doc) {
    if (reading) { ctx.say('A lease is already being read. Wait for it, or cancel it.'); return; }
    clear();
    note(`Choose the PDF of ‘${doc.name}’. It is read on this device and not kept.`);
    const key = doc.sha256 || `${doc.name}:${doc.size}`;
    let entry = sessions.get(key);
    let file = null;
    if (!(entry && entry.texts)) {
      file = await pick();
      if (!file) { clear(); return; }
    }
    reading = true;
    const state = { cancelled: false, stops: new Set(), reject: null };
    const cancel = el('button', 'btn btn-plain btn-sm', 'Cancel');
    cancel.type = 'button'; cancel.id = 'lr-cancel';
    const prog = el('p', 'hint-sm');
    prog.id = 'lr-progress'; prog.setAttribute('role', 'status'); prog.setAttribute('aria-live', 'polite');
    cancel.addEventListener('click', () => { state.cancelled = true; for (const s of [...state.stops]) s(); if (state.reject) state.reject(CANCELLED); });
    const say = (t) => { prog.textContent = t; };
    try {
      let reader = null;
      state.stops.add(() => { if (reader) reader.close(); });
      if (file) {
        clear(); run.append(prog, cancel); say('Checking the file…');
        const opened = await open(doc, file);
        if (!opened) return;
        clear(); run.append(prog, cancel);
        const pdfjs = await getPdfjs();
        const prior = sessions.get(opened.sha || key);
        if (prior && prior.texts) entry = prior;
        else {
          const layouts = [];
          say('Reading page 1…');
          const texts = await pdfPages(pdfjs, opened.bytes.slice(), { layouts, onPage: (i, n) => { if (state.cancelled) throw CANCELLED; say(`Reading page ${i} of ${n}`); } });
          entry = { name: doc.name, texts, layouts, ocr: {}, bytes: opened.bytes };
          sessions.set(opened.sha || key, entry);
        }
      } else { clear(); run.append(prog, cancel); }
      const total = entry.texts.length;
      // scanned pages: offered, never started by themselves
      const scanned = entry.texts.map((t, i) => (needsOcr(t) && !entry.ocr[i + 1] ? i + 1 : 0)).filter(Boolean);
      if (scanned.length) {
        if (!ocrSupported()) note(`Pages ${ranges(scanned)} are scans, and this browser can’t run the scanned-page reader. They are left unread.`);
        else {
          const pickPages = await askScans(run, scanned, total, state);
          if (state.cancelled) throw CANCELLED;
          if (pickPages.length) {
            run.append(prog, cancel);
            reader = openScanReader(await getPdfjs(), entry.bytes);
            for (let k = 0; k < pickPages.length; k++) {
              if (state.cancelled) throw CANCELLED;
              const n = pickPages[k];
              try {
                const r = await withWatchdog(reader.read(n, { onProgress: (t) => say(`Page ${n} of ${total} (${k + 1} of ${pickPages.length}): ${t}`) }), WATCHDOG_MS, () => { reader.restart(); });
                entry.ocr[n] = { text: r.text, conf: Math.round(r.conf * 10) / 10, geom: r.geom, scale: r.scale };
              } catch (e) {
                if (state.cancelled || (e && e.cancelled)) throw CANCELLED;
                entry.ocr[n] = { text: '', conf: 0, missed: e && e.slow ? 'took over a minute' : (e && e.message) || 'could not be read' };
                note(`Page ${n}: not read (${entry.ocr[n].missed}).`, 'hint-sm warn-text');
              }
            }
            await reader.close();
            reader = null;
          }
        }
      }
      // the reader proper, in its worker
      say('Looking for the lease terms…');
      const ocr = Object.fromEntries(Object.entries(entry.ocr).map(([n, o]) => [n, { text: o.text, conf: o.conf }]));
      const job = { texts: entry.texts, ocr, name: doc.name, as: null };
      let res = await withWatchdog(analyse(job, state), WATCHDOG_MS, () => { for (const s of [...state.stops]) s(); });
      if (res.docType === 'other') {
        const as = await askType(run, doc.name);
        if (!as) throw CANCELLED;
        job.as = as;
        res = await withWatchdog(analyse(job, state), WATCHDOG_MS, () => { for (const s of [...state.stops]) s(); });
      }
      clear();
      if (res.docType === 'summary') { refuse(res.warnings[0]); return; }
      stage(doc, entry, res);
    } catch (e) {
      if (e && (e.cancelled || state.cancelled)) {
        clear();
        const done = entry ? Object.keys(entry.ocr).length : 0;
        const p = note(`Cancelled. Nothing was changed.${done ? ` ${plural(done, 'scanned page', 'scanned pages')} read so far are kept for now.` : ''}`);
        p.setAttribute('role', 'status');
        if (done) { const again = el('button', 'btn btn-plain btn-sm', `Resume (${plural(done, 'page', 'pages')} already read)`); again.type = 'button'; again.id = 'lr-resume'; again.addEventListener('click', () => start(doc)); run.appendChild(again); }
      } else if (e && e.slow) {
        refuse('The reader stopped: the document took too long. Nothing was changed.');
      } else {
        refuse(`‘${doc.name}’ can’t be read: ${pdfProblem(e, file || { size: 1 })}`);
      }
    } finally {
      for (const s of [...state.stops]) { try { s(); } catch { /* fine */ } }
      reading = false;
    }
  }

  /* ------------------------------------------------------- questions */
  function askScans(into, scanned, total, state) {
    return new Promise((resolve) => {
      const f = el('form', 'ab-read-ask');
      f.id = 'lr-scans';
      const mins = Math.max(1, Math.round((scanned.length * OCR_SECONDS) / 60));
      const q = el('p', null, `${scanned.length === total ? 'All' : `Pages ${ranges(scanned)}`} ${scanned.length === 1 ? 'is a scan' : 'are scans'}; reading ${scanned.length === 1 ? 'it' : 'them'} takes about ${plural(mins, 'minute', 'minutes')} (an estimate: about ${OCR_SECONDS} seconds a page, and a phone may differ). The first time, the reader’s files (about 7 MB) come from this site.`);
      const all = el('button', 'btn btn-primary btn-sm', scanned.length > MAX_SCANS ? `Read the first ${MAX_SCANS} scanned pages` : 'Read all scanned pages');
      all.type = 'button'; all.id = 'lr-scan-all';
      all.addEventListener('click', () => resolve(scanned.slice(0, MAX_SCANS)));
      const label = el('label', 'fl', 'Or only these pages (like 1-3, 7)'); label.htmlFor = 'lr-scan-range';
      const inp = el('input', 'text'); inp.id = 'lr-scan-range'; inp.autocomplete = 'off'; inp.inputMode = 'text';
      const some = el('button', 'btn btn-plain btn-sm', 'Read these pages'); some.type = 'button'; some.id = 'lr-scan-some';
      const err = el('p', 'warn-text hint-sm'); err.setAttribute('role', 'alert');
      some.addEventListener('click', () => {
        const r = parseRanges(inp.value, total);
        if (r.error) { err.textContent = r.error; return; }
        const want = r.groups.flat().map((i) => i + 1).filter((n) => scanned.includes(n));
        if (!want.length) { err.textContent = 'None of those pages is a scan.'; return; }
        if (want.length > MAX_SCANS) { err.textContent = `At most ${MAX_SCANS} scanned pages are read at once.`; return; }
        resolve(want);
      });
      const skip = el('button', 'btn btn-plain btn-sm', 'Skip the scans'); skip.type = 'button'; skip.id = 'lr-scan-skip';
      skip.addEventListener('click', () => resolve([]));
      const cancel = el('button', 'btn btn-plain btn-sm', 'Cancel'); cancel.type = 'button';
      cancel.addEventListener('click', () => { state.cancelled = true; resolve([]); });
      f.addEventListener('submit', (e) => e.preventDefault());
      f.append(q, all, label, inp, some, skip, cancel, err);
      into.textContent = '';
      into.appendChild(f);
    }).then((v) => { into.textContent = ''; return v; });
  }
  function askType(into, name) {
    return new Promise((resolve) => {
      const f = el('div', 'ab-read-ask');
      f.id = 'lr-type';
      f.appendChild(el('p', null, `Is ‘${name}’ a lease, or an amendment to one? The text does not say clearly.`));
      for (const [v, t] of [['lease', 'Read it as a lease'], ['amendment', 'Read it as an amendment']]) {
        const b = el('button', 'btn btn-plain btn-sm', t); b.type = 'button'; b.addEventListener('click', () => resolve(v)); f.appendChild(b);
      }
      const x = el('button', 'btn btn-plain btn-sm', 'Cancel'); x.type = 'button'; x.addEventListener('click', () => resolve(null)); f.appendChild(x);
      into.textContent = '';
      into.appendChild(f);
    }).then((v) => { into.textContent = ''; return v; });
  }

  /* ------------------------------------------------------- what was found */
  function stage(doc, entry, res) {
    let effective = res.effective ? res.effective.iso : null;
    let rows = [];
    const panel = el('div', 'ab-staged');
    panel.id = 'lr-staged'; panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', `What was found in ${doc.name}`);
    const summary = el('p', 'ab-staged-summary');
    summary.id = 'lr-summary'; summary.setAttribute('aria-live', 'polite');
    const rowsBox = el('ul', 'ab-staged-rows');
    const keepSel = el('button', 'btn btn-primary btn-sm', 'Keep selected'); keepSel.type = 'button'; keepSel.id = 'lr-keep';
    const keepAll = el('button', 'btn btn-plain btn-sm', 'Keep all found'); keepAll.type = 'button'; keepAll.id = 'lr-keep-all';
    const close = el('button', 'btn btn-plain btn-sm', 'Close without keeping'); close.type = 'button'; close.id = 'lr-discard';
    const bar = el('div', 'dd-formbtns');
    bar.append(keepSel, keepAll, close);
    panel.append(summary);
    if (res.docType === 'amendment') {
      const w = el('div', 'ab-ctl'); const l = el('label', 'fl', 'Amendment effective date'); l.htmlFor = 'lr-effective';
      w.append(l, dateInput({ value: effective || '', label: 'Amendment effective date', id: 'lr-effective', onCommit: (iso) => { effective = iso || null; compute(); } }));
      panel.append(w, el('p', 'hint-sm', effective ? 'Read from the amendment. Check it against the page.' : 'No effective date could be read. Type it to apply this amendment; until then every value from it is marked “needs your choice”.'));
    }
    panel.append(bar, rowsBox);
    clear(); run.appendChild(panel);

    function compute() {
      rows = stageInto(ab, res, { doc, effective, docs: h.docs() });
      summary.textContent = summarise(res, rows);
      rowsBox.textContent = '';
      for (const r of rows) rowsBox.appendChild(rowNode(r));
      ctx.say(summary.textContent);
    }
    function rowNode(r) {
      const li = el('li', `ab-staged-row ab-staged-${r.status}`);
      li.dataset.key = r.key || r.kind;
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!r.selected; cb.disabled = !r.canKeep; cb.id = `lr-row-${r.id}`;
      cb.setAttribute('aria-label', `Keep ${r.label}`);
      cb.addEventListener('change', () => { r.selected = cb.checked; });
      const lab = el('label', 'ab-staged-label'); lab.htmlFor = cb.id;
      lab.append(el('strong', null, r.label), ' ', el('span', 'ab-staged-text', r.text));
      const words = { found: 'Found', ambiguous: 'Needs your choice', 'not-found': 'Not found' }[r.status];
      const meta = el('div', 'hint-sm ab-staged-meta');
      meta.append(el('span', `chip chip-${r.status === 'found' ? 'accent' : r.status === 'ambiguous' ? 'warn' : 'brass'}`, words));
      if (r.status !== 'not-found') meta.append(` · ${r.confidence} confidence`);
      if (r.page) {
        meta.append(` · Page ${r.page} `);
        const sp = el('button', 'btn btn-plain btn-sm', 'Show page'); sp.type = 'button';
        sp.setAttribute('aria-label', `Show page ${r.page} for ${r.label}`);
        sp.addEventListener('click', () => showPage(doc, entry, r, li));
        meta.append(sp);
      }
      li.append(cb, lab, meta);
      if (r.quote) li.append(quoteNode(r));
      li.append(el('p', 'hint-sm ab-staged-effect', r.effectText));
      return li;
    }
    keepSel.addEventListener('click', () => keep(rows.filter((r) => r.selected)));
    keepAll.addEventListener('click', () => keep(rows.filter((r) => r.canKeep && r.status === 'found' && !['differs'].includes(r.effect))));
    close.addEventListener('click', () => { clear(); ctx.say('Nothing was kept.'); });
    function keep(chosen) {
      const picked = rows.map((r) => ({ ...r, selected: chosen.includes(r) && r.canKeep }));
      const out = keepStaged(ab, picked, { doc, effective, docs: h.docs(), now: new Date().toISOString() });
      if (h.markRead) h.markRead(doc.id, { asOf: res.docType === 'amendment' ? effective : null, checks: { pass: picked.filter((r) => r.selected && r.status === 'found').length, warn: picked.filter((r) => r.selected && r.status === 'ambiguous').length, fail: 0 } });
      h.touch({ label: `Lease read: ${doc.name}` });
      clear();
      const t = `Kept ${plural(out.kept, 'item', 'items')} from ‘${doc.name}’. Nothing is ticked: check each value beside its page.${out.skipped.length ? ` ${out.skipped.length} could not be added: ${out.skipped[0]}` : ''}`;
      note(t).setAttribute('role', 'status');
      ctx.say(t);
      ctx.redraw();
      toast(`Kept ${plural(out.kept, 'item', 'items')}. Undo is in History.`);
    }
    compute();
    panel.scrollIntoView && panel.scrollIntoView({ block: 'nearest' });
  }

  /* ------------------------------------------------------- the quote, the page */
  function quoteNode(r) {
    const q = el('blockquote', 'ab-quote');
    const hit = r.cand && (r.cand.hit || (r.cand.sources && r.cand.sources[0] && r.cand.sources[0].hit));
    const at = hit ? r.quote.indexOf(hit) : -1;
    if (at < 0) q.textContent = r.quote;
    else q.append(r.quote.slice(0, at), el('mark', null, hit), r.quote.slice(at + hit.length));
    return q;
  }

  async function showPage(doc, entry, r, li) {
    const old = li.querySelector('.ab-page');
    if (old) { old.remove(); return; }
    const wrap = el('div', 'ab-page');
    li.appendChild(wrap);
    if (!entry.bytes) {
      wrap.append(el('p', 'hint-sm', `Pick ‘${doc.name}’ again to see page ${r.page}. The quote above is always shown, so you can check it without the file.`));
      const again = el('button', 'btn btn-plain btn-sm', 'Pick the file'); again.type = 'button';
      again.addEventListener('click', async () => {
        const f = await pick(); if (!f) return;
        const o = await open(doc, f); if (!o) { wrap.remove(); return; }
        entry.bytes = o.bytes; wrap.remove(); showPage(doc, entry, r, li);
      });
      wrap.appendChild(again);
      return;
    }
    wrap.append(el('p', 'hint-sm', `Drawing page ${r.page}…`));
    let pdf = null;
    try {
      const pdfjs = await getPdfjs();
      pdf = await pdfjs.getDocument({ data: entry.bytes.slice(), isEvalSupported: false, useSystemFonts: false }).promise;
      const page = await pdf.getPage(r.page);
      const base = page.getViewport({ scale: 1 });
      const S = Math.min(2, 640 / base.width);
      const vp = page.getViewport({ scale: S });
      const canvas = el('canvas');
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      canvas.style.maxWidth = '100%'; canvas.style.height = 'auto';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Page ${r.page} of ${doc.name}, with the quoted lines boxed`);
      const ctx2 = canvas.getContext('2d');
      ctx2.fillStyle = '#fff'; ctx2.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx2, viewport: vp }).promise;
      const boxes = quoteBoxes(entry, r.page, r.quote, base.height);
      ctx2.strokeStyle = '#b3261e'; ctx2.lineWidth = 2;
      for (const b of boxes) ctx2.strokeRect(b.x * S, b.y * S, b.w * S, b.h * S);
      await pdf.destroy();
      pdf = null;
      wrap.textContent = '';
      wrap.append(canvas, el('p', 'hint-sm', boxes.length ? `The boxed ${boxes.length === 1 ? 'line is' : 'lines are'} the quote.` : 'The quote could not be placed on the page; read it above.'));
      canvas.dataset.boxes = String(boxes.length);
    } catch (e) {
      if (pdf) await pdf.destroy().catch(() => {}); // a failed draw must not leave the document open
      wrap.textContent = '';
      wrap.append(el('p', 'warn-text hint-sm', `The page could not be drawn (${(e && e.message) || e}). The quote above is the check.`));
    }
  }

  return { node: box, refresh: drawList };
}

/**
 * Where a quote sits on a page, in points from the top left: the lines of the page whose text is inside the quote (or hold it), from
 * the geometry the text reader (pdfPages with `layouts`) or the scan reader (OCR) recorded. Pure.
 * @returns {{ x: number, y: number, w: number, h: number }[]}
 */
export function quoteBoxes(entry, pageNo, quote, pageHeight) {
  const q = squash(quote);
  const ocr = entry.ocr && entry.ocr[pageNo];
  const geom = ocr ? ocr.geom : entry.layouts && entry.layouts[pageNo - 1];
  const text = ocr ? ocr.text : entry.texts[pageNo - 1];
  if (!geom || !geom.lines || !q) return [];
  const k = ocr && ocr.scale ? ocr.scale : 1;
  const out = [];
  text.split('\n').forEach((line, i) => {
    const g = geom.lines[i];
    const s = squash(line);
    if (!g || !g.frags || !g.frags.length || s.length < 3) return;
    if (!(q.includes(s) || s.includes(q))) return;
    const x0 = Math.min(...g.frags.map((f) => f.x0)) / k;
    const x1 = Math.max(...g.frags.map((f) => f.x1)) / k;
    const h = (g.h || 8) / k;
    out.push({ x: x0 - 2, y: pageHeight - g.y / k - h, w: x1 - x0 + 4, h: h * 1.35 });
  });
  return out;
}
