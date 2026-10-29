/* pdfpagesui.js -- Tools > Documents > PDF pages: add PDFs, see every page, move, turn or delete pages, then save the
 * lot as one PDF, a set of pages, or one file per range. The files are read and written on this device, in a worker
 * (pdfpages-worker.js); nothing is uploaded and no file is kept. Pure logic is in pdfpages.js. */
/* global IntersectionObserver */

import { el, svg, toast, deliver, deliveryError, getPdfjs, getFflate, isIOS, downloadName } from './kit.js';
import {
  checkAdd, problemText, pagesOf, overPages, move, rotate, remove, pageLabel, parseRanges, orderFor, withPdf, partName,
  MAX_PAGES, WATCHDOG_MS,
} from './pdfpages.js';

const ICON = {
  up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', turn: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>',
  del: '<path d="M6 6l12 12M18 6L6 18"/>',
};

/* ------------------------------------------------------------- the worker */

let worker = null;
/** @type {Map<number, any>} */
const waiting = new Map();
let nextId = 1;
function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./pdfpages-worker.js', import.meta.url));
  worker.onmessage = (ev) => {
    const w = waiting.get(ev.data.id);
    if (!w) return;
    if (ev.data.progress !== undefined) { w.onProgress?.(ev.data.progress, ev.data.of); return; }
    waiting.delete(ev.data.id);
    clearTimeout(w.timer);
    w.resolve(ev.data);
  };
  worker.onerror = (ev) => { ev.preventDefault?.(); stopWorker(`the PDF tool stopped (${ev.message || 'unknown error'})`); };
  return worker;
}
/** Stop the worker at once and fail whatever was waiting on it. */
function stopWorker(why) {
  const w = worker;
  worker = null;
  if (w) w.terminate();
  for (const [, p] of waiting) { clearTimeout(p.timer); p.resolve({ ok: false, kind: 'stopped', message: why }); }
  waiting.clear();
}
/** @param {object} msg @param {{ onProgress?: (done: number, of: number) => void }} [opts] */
function ask(msg, { onProgress } = {}) {
  return new Promise((resolve) => {
    const id = nextId++;
    let w;
    try { w = ensureWorker(); } catch (e) { resolve({ ok: false, kind: 'other', message: String(e.message || e) }); return; }
    const timer = setTimeout(() => stopWorker('it took more than a minute, so it was stopped'), WATCHDOG_MS);
    waiting.set(id, { resolve, onProgress, timer });
    w.postMessage({ id, ...msg });
  });
}

/* ------------------------------------------------------------- the sheet */

export function openPdfPages(api) {
  const files = []; // { file, name, size, pages, gone }
  let pages = [];
  let busy = false;
  let thumbs = null; // the thumbnail drawer

  const body = api.sheetOpen({
    eyebrow: 'Tools · Documents', title: 'PDF pages',
    sub: 'Combine PDFs, put pages in order, turn or delete them, and save the result. The files stay on this device: nothing is uploaded or kept.',
  });
  body.classList.add('docs-pages');

  body.appendChild(el('p', 'hint-sm', 'The pages are copied unchanged. Bookmarks, attachments, scripts and form fields are not kept, links to other pages or files are cut, web links are kept, hidden layers are not carried over and may show, and a digital signature on the original will no longer verify.'));

  const add = el('button', 'btn btn-primary docs-add', 'Add PDFs…');
  add.type = 'button';
  const input = el('input');
  input.type = 'file';
  input.id = 'docs-file';
  input.accept = 'application/pdf,.pdf';
  input.multiple = true;
  input.hidden = true;
  add.addEventListener('click', () => input.click());
  const addRow = el('div', 'docs-row');
  addRow.append(add, input);
  body.appendChild(addRow);

  const status = el('p', 'hint-sm docs-status');
  status.id = 'docs-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const alert = el('div', 'docs-problems');
  alert.id = 'docs-problems';
  alert.setAttribute('role', 'alert');
  body.append(status, alert);

  const fileList = el('ul', 'docs-files');
  fileList.setAttribute('aria-label', 'Files added');
  const list = el('ol', 'docs-list');
  list.id = 'docs-list';
  list.setAttribute('aria-label', 'Pages, in the order they will be saved');
  body.append(fileList, list);

  const out = el('div', 'docs-out');
  const nameField = el('div', 'field');
  const nameLab = el('label', null, 'File name');
  const name = el('input');
  name.id = 'docs-name';
  name.value = 'Merged documents';
  name.autocomplete = 'off';
  name.maxLength = 120;
  nameLab.htmlFor = name.id;
  nameField.append(nameLab, name);
  const save = el('button', 'btn btn-primary docs-btn', 'Save as one PDF');
  save.type = 'button';
  save.id = 'docs-save';
  const rangeField = el('div', 'field');
  const rangeLab = el('label', null, 'Pages to use, like 1-3, 7');
  const range = el('input', 'n');
  range.id = 'docs-range';
  range.autocomplete = 'off';
  range.inputMode = 'text';
  range.placeholder = '1-3, 7';
  range.setAttribute('aria-describedby', 'docs-problems');
  rangeLab.htmlFor = range.id;
  rangeField.append(rangeLab, range, el('span', 'hint-sm', 'Numbers are the places in the list above. Extract saves them as one PDF. Split saves one PDF for each range, together in a zip.'));
  const extract = el('button', 'btn docs-btn', 'Extract');
  extract.type = 'button';
  extract.id = 'docs-extract';
  const split = el('button', 'btn docs-btn', 'Split');
  split.type = 'button';
  split.id = 'docs-split';
  const acts = el('div', 'docs-row');
  acts.append(extract, split);

  const prog = el('div', 'docs-progress');
  prog.hidden = true;
  const bar = el('progress');
  bar.setAttribute('aria-label', 'Writing the PDF');
  bar.max = 100;
  const cancel = el('button', 'btn docs-btn', 'Cancel');
  cancel.type = 'button';
  cancel.id = 'docs-cancel';
  prog.append(bar, cancel);

  out.append(nameField, save, rangeField, acts, prog);
  body.appendChild(out);

  const say = (t) => { status.textContent = ''; setTimeout(() => { status.textContent = t; }, 30); };
  const problems = (lines) => {
    alert.textContent = '';
    for (const l of lines) alert.appendChild(el('p', 'warn-text', l));
  };

  /* ---------------------------------------------------------- the drawing */

  const live = () => files.filter((f) => !f.gone);
  function drawFiles() {
    fileList.textContent = '';
    files.forEach((f, i) => {
      if (f.gone) return;
      const li = el('li');
      li.append(el('span', 'docs-fname', f.name), el('span', 'hint-sm', `${pages.filter((p) => p.f === i).length} of ${f.pages} pages · ${Math.round(f.size / 1e5) / 10} MB`));
      const x = el('button', 'btn btn-sm btn-gray docs-btn', 'Remove');
      x.type = 'button';
      x.setAttribute('aria-label', `Remove ${f.name} and its pages`);
      x.addEventListener('click', () => {
        if (busy) return;
        f.gone = true;
        thumbs.release(i);
        pages = pages.filter((p) => p.f !== i);
        draw();
        say(`${f.name} removed.`);
      });
      li.appendChild(x);
      fileList.appendChild(li);
    });
  }

  /* One row per page. A row is built once (cloned from `proto`) and then only refilled, so a turn or a move with
   * hundreds of pages listed touches the rows that changed and no others. */
  const proto = (() => {
    const li = el('li', 'docs-page');
    const box = el('div', 'docs-thumb');
    box.setAttribute('role', 'img');
    const txt = el('div', 'docs-ptext');
    txt.append(el('b'), el('span', 'hint-sm'));
    const btns = el('div', 'docs-btns');
    for (const [act, icon, text] of [['up', ICON.up, 'Move up'], ['down', ICON.down, 'Move down'], ['turn', ICON.turn, 'Turn'], ['del', ICON.del, 'Delete']]) {
      const b = el('button', 'iconbtn docs-icon');
      b.type = 'button';
      b.dataset.act = act;
      b.innerHTML = svg(icon, 18);
      b.title = text;
      btns.appendChild(b);
    }
    li.append(box, txt, btns);
    return li;
  })();
  const LABEL = { up: 'Move up', down: 'Move down', turn: 'Turn', del: 'Delete' };

  /** Set row `li` to show page `i` of the list. */
  function fill(li, i) {
    const pg = pages[i];
    const box = /** @type {any} */ (li.firstChild);
    const key = `${pg.f}:${pg.p}`;
    box.__pg = pg;
    box.setAttribute('aria-label', pageLabel(pages, i, files));
    if (li.dataset.key !== key) { li.dataset.key = key; box.textContent = ''; thumbs.show(pg, box); } else thumbs.turn(pg, box);
    const turned = (pg.base + pg.rot) % 360;
    li.children[1].firstChild.textContent = String(i + 1);
    li.children[1].lastChild.textContent = `${files[pg.f].name}, page ${pg.p + 1}${turned ? `, turned ${turned}°` : ''}`;
    for (const b of /** @type {HTMLButtonElement[]} */ ([...li.children[2].children])) {
      b.dataset.i = String(i);
      b.setAttribute('aria-label', `${LABEL[b.dataset.act]} page ${i + 1}`);
      b.disabled = (b.dataset.act === 'up' && i === 0) || (b.dataset.act === 'down' && i === pages.length - 1);
    }
  }
  /** Refill rows `from` to `to` (inclusive) after an edit. */
  const refill = (from, to = pages.length - 1) => { for (let k = Math.max(0, from); k <= to && k < pages.length; k++) fill(/** @type {HTMLElement} */ (list.children[k]), k); };

  /** Bring the whole screen in line with the state: used when files come or go, not for a page edit. */
  function draw() {
    drawFiles();
    thumbs.watch();
    list.textContent = '';
    const frag = document.createDocumentFragment();
    pages.forEach(() => frag.appendChild(proto.cloneNode(true)));
    list.appendChild(frag);
    refill(0);
    list.toggleAttribute('inert', busy);
    const none = !pages.length;
    for (const b of [save, extract, split, range, name]) b.disabled = none || busy;
    add.disabled = busy;
    input.disabled = busy;
    if (none) say(live().length ? 'Every page was deleted. Add a PDF to begin again.' : 'Add one or more PDFs to begin.');
  }
  const press = (act, i) => /** @type {HTMLElement|null} */ (list.querySelector(`button[data-act="${act}"][data-i="${i}"]`));
  list.addEventListener('click', (ev) => {
    const b = /** @type {HTMLElement} */ (ev.target).closest('button[data-act]');
    if (b) edit(/** @type {HTMLElement} */ (b).dataset.act, Number(/** @type {HTMLElement} */ (b).dataset.i));
  });

  function edit(act, i) {
    if (busy || !pages[i]) return;
    const n = i + 1;
    if (act === 'up' || act === 'down') {
      const j = i + (act === 'up' ? -1 : 1);
      if (j < 0 || j >= pages.length) return;
      pages = move(pages, i, act === 'up' ? -1 : 1);
      // the two rows trade places, each keeping its picture
      const a = list.children[i]; const b = list.children[j];
      list.insertBefore(act === 'up' ? a : b, act === 'up' ? b : a);
      refill(Math.min(i, j), Math.max(i, j));
      (press(act, j) && !press(act, j).disabled ? press(act, j) : press(act === 'up' ? 'down' : 'up', j)).focus();
      say(`Page ${n} moved ${act} to place ${j + 1} of ${pages.length}.`);
    } else if (act === 'turn') {
      pages = rotate(pages, i, 90);
      refill(i, i);
      press('turn', i).focus();
      say(`Page ${n} turned a quarter clockwise, now ${(pages[i].base + pages[i].rot) % 360} degrees from upright.`);
    } else if (act === 'del') {
      pages = remove(pages, i);
      list.children[i].remove();
      refill(i);
      if (!pages.length) draw();
      (press('del', Math.min(i, pages.length - 1)) || add).focus();
      say(`Page ${n} deleted. ${pages.length} ${pages.length === 1 ? 'page' : 'pages'} left.`);
    }
    drawFiles();
  }


  /* -------------------------------------------------------------- adding */

  input.addEventListener('change', async () => {
    const picked = [...input.files];
    input.value = '';
    if (!picked.length || busy) return;
    busy = true;
    draw();
    const bad = [];
    for (const file of picked) {
      const have = { files: live().length, bytes: live().reduce((s, f) => s + f.size, 0) };
      const ok = await checkAdd(file, have, { phone: isIOS() });
      if (!ok.ok) { bad.push(ok.reason); continue; }
      const r = await ask({ type: 'inspect', file });
      if (!r.ok) { bad.push(problemText(file.name, r.kind, r.kind === 'stopped' ? r.message : '')); continue; }
      if (overPages(pages.length, r.pages)) { bad.push(`${file.name} was not added: it has ${r.pages} pages and the list already holds ${pages.length}; ${MAX_PAGES} is the most.`); continue; }
      const f = files.length;
      files.push({ file, name: file.name || 'document.pdf', size: file.size, pages: r.pages });
      pages = pages.concat(pagesOf(f, Array.from(r.rotations)));
      thumbs.open(f, file);
    }
    busy = false;
    problems(bad);
    draw();
    if (document.activeElement === document.body) add.focus();
    if (pages.length) say(`${pages.length} ${pages.length === 1 ? 'page' : 'pages'} from ${live().length} ${live().length === 1 ? 'file' : 'files'}.`);
  });

  /* ------------------------------------------------------------- saving */

  let stopped = false;
  cancel.addEventListener('click', () => { stopped = true; stopWorker('cancelled'); });

  async function write(orders, how) {
    if (busy) return;
    busy = true;
    stopped = false;
    problems([]);
    draw();
    bar.removeAttribute('value');
    prog.hidden = false;
    const blobs = files.map((f) => (f.gone ? null : f.file));
    const r = await ask({ type: 'build', files: blobs, outputs: orders }, { onProgress: (d, of) => { bar.max = of; bar.value = d; } });
    prog.hidden = true;
    busy = false;
    draw();
    if (stopped) { say('Cancelled. Nothing was saved.'); return; }
    if (!r.ok && r.kind === 'stopped') { problems([`Nothing was saved: ${r.message}.`]); return; }
    if (!r.ok) {
      const f = r.file !== null && r.file !== undefined ? files[r.file] : null;
      problems([problemText(f ? f.name : 'A file', r.kind, r.message)]);
      say('Nothing was saved.');
      return;
    }
    try {
      const base = name.value.trim() || 'Documents';
      let done;
      if (r.files.length === 1) {
        done = await deliver(withPdf(base), r.files[0], 'application/pdf', { map: 'none: a document the broker supplied' });
      } else {
        const fflate = await getFflate();
        const zip = {};
        r.files.forEach((bytes, k) => { zip[downloadName(partName(base, k + 1, r.files.length))] = [bytes, { level: 0 }]; });
        done = await deliver(`${base.replace(/\.(pdf|zip)$/i, '')}.zip`, fflate.zipSync(zip), 'application/zip', { map: 'none: a document the broker supplied' });
      }
      if (done === 'done') {
        const note = r.unpruned ? ' Some pages’ content could not be read to cut their resources, so those were copied unchanged and may carry pictures that only other pages use.' : '';
        toast(how); say(how + note);
        if (note) problems([note.trim()]);
      }
    } catch (err) { deliveryError(err); }
  }

  save.addEventListener('click', () => { if (pages.length) write([orderFor(pages)], 'Your PDF is ready.'); });
  const ranged = (many) => () => {
    const r = parseRanges(range.value, pages.length);
    range.setAttribute('aria-invalid', r.error ? 'true' : 'false');
    if (r.error) { problems([r.error]); range.focus(); return; }
    problems([]);
    if (many) write(r.groups.map((g) => orderFor(pages, g)), `${r.groups.length} PDFs are in your zip.`);
    else write([orderFor(pages, r.groups.flat())], 'Your PDF is ready.');
  };
  extract.addEventListener('click', ranged(false));
  split.addEventListener('click', ranged(true));

  /* ---------------------------------------------------------- thumbnails */
  thumbs = thumbnails(body);
  document.getElementById('sheet').addEventListener('close', () => {
    thumbs.stop();
    stopWorker('closed');
  }, { once: true });

  draw();
}

/* A small picture of each page, drawn one at a time when it comes near the screen and kept (turning a page turns the
 * picture with a style, so it is not drawn again). A page that can't be drawn keeps its number and no picture. */
function thumbnails(scroller) {
  const cache = new Map(); // "f:p" -> canvas
  const queue = [];
  const docs = new Map(); // f -> Promise<pdf.js document>
  let running = false;
  let dead = false;
  let io = null;
  const SIDE = 96;

  const same = (box, pg) => box.__pg && box.__pg.f === pg.f && box.__pg.p === pg.p;
  const spin = (c, pg) => { c.style.transform = pg.rot ? `rotate(${pg.rot}deg)` : ''; };
  const drawOne = async ({ pg, box }) => {
    const key = `${pg.f}:${pg.p}`;
    const attach = (c) => { if (!dead && box.isConnected && same(box, pg)) { box.textContent = ''; spin(c, box.__pg); box.appendChild(c); } };
    if (cache.has(key)) { attach(cache.get(key)); return; }
    if (!docs.has(pg.f)) return;
    try {
      const pdf = await docs.get(pg.f);
      const page = await pdf.getPage(pg.p + 1);
      const v0 = page.getViewport({ scale: 1 });
      const scale = SIDE / Math.max(v0.width, v0.height);
      const vp = page.getViewport({ scale });
      const c = el('canvas');
      c.width = Math.max(1, Math.ceil(vp.width));
      c.height = Math.max(1, Math.ceil(vp.height));
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      page.cleanup();
      cache.set(key, c);
      attach(c);
    } catch { /* no picture for this page */ }
  };
  const pump = async () => {
    if (running) return;
    running = true;
    while (queue.length && !dead) await drawOne(queue.shift());
    running = false;
  };

  return {
    /** Put the page's picture in its box now if it is drawn, else when the box nears the screen. */
    show(pg, box) {
      box.__pg = pg;
      const hit = cache.get(`${pg.f}:${pg.p}`);
      if (hit) { spin(hit, pg); box.appendChild(hit); return; }
      const go = () => { if (!queue.some((q) => q.box === box)) { queue.push({ pg: box.__pg, box }); pump(); } };
      if (!io) { go(); return; }
      box.__draw = go;
      io.observe(box);
    },
    /** The page in this box was turned: turn its picture. */
    turn(pg, box) { const c = box.firstChild; if (c && c.tagName === 'CANVAS') spin(c, pg); },
    watch() {
      io?.disconnect();
      if (typeof IntersectionObserver === 'undefined') return;
      io = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) { /** @type {any} */ (e.target).__draw?.(); io.unobserve(e.target); }
      }, { root: scroller, rootMargin: '200px' });
    },
    /** A file was added: open it for drawing. */
    open(f, file) {
      docs.set(f, (async () => {
        const pdfjs = await getPdfjs();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), verbosity: 0, isEvalSupported: false }).promise;
        return doc;
      })());
      docs.get(f).catch(() => {});
    },
    /** A file was removed: let its document go. */
    release(f) { docs.get(f)?.then((d) => d.destroy()).catch(() => {}); docs.delete(f); },
    stop() { dead = true; for (const f of [...docs.keys()]) this.release(f); io?.disconnect(); queue.length = 0; cache.clear(); },
  };
}
