/* abstractui.js -- the Lease abstracts card on the deal screen, and the editor sheet. The broker types or pastes what a lease
 * says into the firm's layout, notes the page it came from, and ticks each value as checked. Nothing here reads the lease.
 * dealui.js hands the card `h` = { deal, touch(meta), stillOpen(), getXlsx, docs(), sheetOpen, sheetClose }. Every change goes
 * through h.touch, so History and Undo cover it. Typing is read when a field is left (change), never while a key is going in, and
 * nothing redraws a field being typed in. Status is words (Unread, Found, Not found, Needs your choice, Checked), never colour alone. */

import { el, toast, actionSheet, parseNum, parsePct, money2, deliver, printed, XLSX, $ } from './kit.js';
import { icon } from './icons.js';
import { dateInput } from './dateinput.js';
import { VERSION } from './exporters.js';
import {
  abstractsOf, addAbstract, removeAbstract, restoreAbstract, setMeta, setValue, setNone, setNotFound, setAmbiguous, clearField, setEvidence, setNote, setChecked,
  addTerm, removeTerm, setTerm, addStep, removeStep, setStep, addOption, removeOption, setOption, addClause, removeClause, setClause, addFlag, removeFlag,
  checkAbstract, progress, itemOf, itemLabel, rentBlock, unitsOf,
} from './abstracts.js';
import { FIELDS, GROUPS, BASES, TERM_KINDS, OPTION_KINDS, RESETS, LIMITS } from './abstractfields.js';
import { buildAbstractWorkbook, abstractCsv, abstractJson, renderAbstractPrint, RATE_NOTE } from './abstractexport.js';
import { redrawKeepingFocus } from './focuskeep.js';
import { cleanName } from './dd.js';

const OPEN_KEY = 'zl.ab.open';
const isOpen = () => { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } };
const setOpen = (v) => { try { localStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch { /* fine */ } };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const btn = (cls, text, fn, label, ic) => {
  const b = el('button', `btn ${cls}`.trim());
  b.type = 'button';
  if (ic) b.insertAdjacentHTML('beforeend', icon(ic, 18));
  b.append(text);
  if (label) b.setAttribute('aria-label', label);
  if (fn) b.addEventListener('click', fn);
  return b;
};
let uid = 0;
const nid = (p) => `${p}${++uid}`;
const KIND_LABEL = { initial: 'Original term', renewal: 'Renewal', extension: 'Extension', fmv: 'Fair market value reset', opex: 'Operating expenses' };
const OPT_LABEL = { renewal: 'Renewal', expansion: 'Expansion', contraction: 'Contraction', termination: 'Termination', rofr: 'Right of first refusal', rofo: 'Right of first offer', purchase: 'Purchase' };
const RESET_LABEL = { fmv: 'Fair market value', fixed: 'Fixed amount', cpi: 'Price index', other: 'Other' };
const UNIT_LABEL = { month: 'per month', year: 'per year', psf_year: '$ per SF per year', psf_month: '$ per SF per month', total: 'total' };
const AMOUNT_LABEL = { month: 'Monthly rent', year: 'Annual rent', psf_year: 'Annual $/SF', psf_month: 'Monthly $/SF' };
const dealName = (d) => `${d.confidential ? 'CONFIDENTIAL - ' : ''}${d.name || (d.figures && d.figures.address) || 'Deal'}`;

/** The words a chip shows for an item. */
export function chipOf(ab, key, checks) {
  const it = itemOf(ab, key);
  const r = it && it.rec;
  if (!r || r.status === 'unread') return { text: 'Unread', tone: 'plain' };
  if (r.status === 'ambiguous' || checks.some((c) => c.level === 'fail' && c.key === key)) return { text: 'Needs your choice', tone: 'warn' };
  if (r.checked) return { text: 'Checked', tone: 'good' };
  return r.status === 'not-found' ? { text: 'Not found', tone: 'brass' } : { text: 'Found', tone: 'accent' };
}

/* ------------------------------------------------------------ the card */

/** Draw the card into `box`. */
export function renderAbstractsCard(box, h) {
  const d = h.deal;
  const list = abstractsOf(d);
  const draw = () => renderAbstractsCard(box, h);
  box.textContent = '';
  const open = isOpen();
  const head = el('div', 'card-head');
  const h2 = el('h2');
  const toggle = el('button', 'dd-toggle');
  toggle.type = 'button';
  toggle.id = 'ab-toggle';
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-controls', 'ab-body');
  toggle.textContent = `Lease abstracts${list.items.length ? ` (${list.items.length})` : ''}`;
  toggle.addEventListener('click', () => { setOpen(!open); draw(); });
  h2.appendChild(toggle);
  head.appendChild(h2);
  box.appendChild(head);
  // the Documents card asks for the abstract of a lease or amendment (ddui.js): open it, or make one, with the card open
  box._abOpenFor = (doc) => {
    let ab = list.items.find((x) => x.docs.includes(doc.id));
    if (!ab) {
      const r = addAbstract(list, { title: cleanName(doc.name).replace(/\.[a-z0-9]{1,5}$/i, ''), docs: [doc.id] });
      if (r.error) { toast(r.error); return; }
      ab = r.abstract;
      h.touch({ label: `Lease abstracts: added ${ab.title}` });
    }
    setOpen(true);
    draw();
    openAbstract(h, ab.id, { onClose: draw });
  };
  const body = el('div', 'dd-body ab-body');
  body.id = 'ab-body';
  body.hidden = !open;
  box.appendChild(body);
  if (!open) return;

  const status = el('p', 'hint-sm');
  status.id = 'ab-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  body.appendChild(el('p', 'hint-sm', 'Type or paste what a lease says into the firm’s layout, note the page, and tick each value you have checked. Nothing here reads the lease, and nothing flows into the deal figures.'));
  if (!list.items.length) body.appendChild(el('p', 'hint-sm', 'No lease abstracts yet.'));
  const ul = el('ul', 'dd-list ab-list');
  for (const ab of list.items) ul.appendChild(row(ab));
  body.appendChild(ul);
  const foot = el('div', 'dd-actions ab-foot');
  const add = btn('btn-primary btn-sm', 'New abstract', () => create({}), null, 'plus');
  add.id = 'ab-new';
  foot.appendChild(add);
  if (list.items.length >= 2) { const all = btn('btn-plain btn-sm', 'Portfolio workbook', () => exportXlsx(list.items, true)); all.id = 'ab-portfolio'; foot.appendChild(all); }
  body.append(foot, status);

  function create({ title = '', docs = [] }) {
    const r = addAbstract(list, { title: title || 'New lease abstract', docs });
    if (r.error) { status.textContent = r.error; return null; }
    h.touch({ label: `Lease abstracts: added ${r.abstract.title}` });
    draw();
    openAbstract(h, r.abstract.id, { onClose: draw });
    return r.abstract;
  }
  function row(ab) {
    const li = el('li', 'dd-row ab-row');
    li.dataset.id = ab.id;
    const p = progress(ab);
    const line = el('div', 'dd-line');
    const main = el('button', 'dd-open');
    main.type = 'button';
    const ex = ab.fields.expiration && ab.fields.expiration.status === 'found' ? (ab.fields.expiration.value || ab.fields.expiration.rel || '') : '';
    main.append(el('span', 'dd-type', ab.title || 'Untitled abstract'), el('span', 'dd-name', (ab.fields.tenant && ab.fields.tenant.status === 'found' ? ab.fields.tenant.value : 'Tenant not abstracted')),
      el('span', 'dd-sub', [`Expires ${ex || 'not abstracted'}`, `${p.checked} of ${p.total} checked`, plural(p.flags, 'open flag', 'open flags')].join(' · ')));
    main.addEventListener('click', () => openAbstract(h, ab.id, { onClose: draw }));
    line.appendChild(main);
    const open1 = btn('btn-plain btn-sm', 'Open', () => openAbstract(h, ab.id, { onClose: draw }), `Open ${ab.title || 'abstract'}`);
    const wb = btn('btn-plain btn-sm', 'Workbook', () => exportXlsx([ab], false), `Workbook for ${ab.title || 'abstract'}`);
    const pr = btn('btn-plain btn-sm', 'Print', () => printAbstract(ab), `Print ${ab.title || 'abstract'}`);
    const more = btn('btn-plain btn-sm dd-more', '…', () => moreMenu(ab), `More for ${ab.title || 'abstract'}`);
    line.append(open1, wb, pr, more);
    li.appendChild(line);
    return li;
  }
  async function moreMenu(ab) {
    const v = await actionSheet(ab.title || 'Lease abstract', [
      { label: 'Rename…', sub: 'opens the abstract on its title', value: 'rename' },
      { label: 'Download CSV', sub: 'one row per item, without the quotes', value: 'csv' },
      { label: 'Download JSON', sub: 'a full copy, quotes included', value: 'json' },
      '-',
      { label: 'Delete', sub: 'you can undo', value: 'delete', danger: true },
    ]);
    if (!v) return;
    if (v === 'rename') openAbstract(h, ab.id, { onClose: draw, focusTitle: true });
    else if (v === 'csv') exportText([ab], 'csv');
    else if (v === 'json') exportText([ab], 'json');
    else if (v === 'delete') {
      const gone = removeAbstract(list, ab.id);
      if (!gone) return;
      h.touch({ label: `Lease abstracts: deleted ${ab.title}` });
      draw();
      toast(`${ab.title || 'The abstract'} deleted.`, { label: 'Undo', run: () => { restoreAbstract(list, gone); h.touch({ label: `Lease abstracts: restored ${ab.title}` }); draw(); } });
    }
  }
  async function exportXlsx(abs, portfolio) {
    try {
      const libs = await h.getXlsx();
      const bytes = await buildAbstractWorkbook(libs.ExcelJS, { deal: d, abstracts: abs, portfolio, fflate: libs.fflate });
      const name = portfolio ? `${dealName(d)} lease abstracts.xlsx` : `${dealName(d)} lease abstract - ${abs[0].title || 'abstract'}.xlsx`;
      if (await deliver(name, bytes, XLSX, { map: 'none: the lease abstract as typed; no deal calculation' }) === 'done') toast('Workbook ready. This file contains lease wording.');
    } catch (err) { if (!err || err.code !== 'declined') status.textContent = `The workbook could not be made: ${(err && err.message) || err}`; }
  }
  async function exportText(abs, kind) {
    const text = kind === 'csv' ? `﻿${abstractCsv(d, abs)}` : abstractJson(d, abs, VERSION);
    const name = `${dealName(d)} lease abstract - ${abs[0].title || 'abstract'}.${kind}`;
    if (await deliver(name, new TextEncoder().encode(text), kind === 'csv' ? 'text/csv' : 'application/json', { map: 'none: the lease abstract as typed; no deal calculation' }) === 'done') toast(`${kind.toUpperCase()} ready. This file contains lease wording.`);
  }
  function printAbstract(ab) {
    printAbstractSheet(d, ab);
  }
}

/** Print one abstract in the page's print sheet. */
export function printAbstractSheet(d, ab) {
  renderAbstractPrint($('print-sheet'), { deal: d, ab });
  printed(`Lease abstract: ${ab.title || 'abstract'}`, { map: 'none: the lease abstract as typed; no deal calculation' });
  window.print();
}

/* ------------------------------------------------------------ the editor */

/**
 * Open one abstract in the sheet. h as for the card; opts: { onClose, focusTitle }.
 * @param {any} h @param {string} id @param {{ onClose?: () => void, focusTitle?: boolean }} [opts]
 */
export function openAbstract(h, id, opts = {}) {
  const d = h.deal;
  const list = abstractsOf(d);
  const ab = list.items.find((x) => x.id === id);
  if (!ab) return;
  const sb = h.sheetOpen({ eyebrow: 'Lease abstract', title: ab.title || 'Untitled abstract', sub: 'Values are saved when you leave a field. Nothing is read from the lease for you.' });
  const root = el('div', 'ab-editor');
  root.tabIndex = -1;
  sb.appendChild(root);
  if (opts.onClose) { const dlg = sb.closest('dialog'); if (dlg) dlg.addEventListener('close', () => opts.onClose(), { once: true }); }
  const rows = []; // { key, node, refresh() }
  let filter = 'all';
  let checks = checkAbstract(ab);

  const status = el('p', 'hint-sm ab-live');
  status.id = 'ab-live';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const alert = el('p', 'warn-text hint-sm');
  alert.setAttribute('role', 'alert');
  const progressText = el('p', 'ab-progress');
  const checkList = el('ul', 'ab-checks');

  /** Save after a change: touch, announce, refresh the words. `res` is a setter's result. */
  function done(res, label, said) {
    if (res.error) { alert.textContent = res.error; return false; }
    alert.textContent = '';
    h.touch({ label: `Lease abstract: ${label}` });
    refresh();
    const p = progress(ab);
    status.textContent = `${said || `${label}: saved.`}${res.unchecked ? ` ${res.unchecked}.` : ''} ${p.checked} of ${p.total} checked.`;
    return true;
  }
  function refresh() {
    checks = checkAbstract(ab);
    const p = progress(ab);
    progressText.textContent = `${p.checked} of ${p.total} checked · ${plural(p.flags, 'open flag', 'open flags')}`;
    for (const r of rows) r.refresh();
    checkList.textContent = '';
    for (const c of checks) checkList.appendChild(el('li', c.level === 'fail' ? 'ab-fail' : 'ab-warn', `${c.level === 'fail' ? 'Problem' : 'Check'}: ${c.text}`));
    checkList.hidden = !checks.length;
    const readouts = root.querySelectorAll('[data-readout]');
    for (const node of readouts) node.refresh && node.refresh();
  }

  /* ------------------------------------------------------- top bar */
  const bar = el('div', 'ab-bar');
  const title = el('input', 'text');
  title.id = 'ab-title';
  title.maxLength = LIMITS.title;
  title.value = ab.title;
  title.autocomplete = 'off';
  title.setAttribute('aria-label', 'Abstract title');
  title.addEventListener('change', () => { if (done(setMeta(ab, { title: title.value }), 'title')) $('sheet-title').textContent = ab.title || 'Untitled abstract'; });
  const asOf = dateInput({ value: ab.asOf || '', label: 'As of', id: 'ab-asof', onCommit: (iso) => done(setMeta(ab, { asOf: iso || null }), 'as-of date') });
  const tl = el('label', 'fl', 'Title'); tl.htmlFor = 'ab-title';
  const al = el('label', 'fl', 'As of'); al.htmlFor = 'ab-asof';
  const meta = el('div', 'ab-meta');
  const c1 = el('div'); c1.append(tl, title);
  const c2 = el('div'); c2.append(al, asOf);
  meta.append(c1, c2);

  const exp = el('div', 'dd-actions ab-exports');
  const mk = (id, text, fn, ic) => { const b = btn('btn-plain btn-sm', text, fn, null, ic); b.id = id; return b; };
  exp.append(
    mk('ab-xlsx', 'Workbook', () => exportXlsx(), 'export'), mk('ab-print', 'Print', () => printAbstractSheet(d, ab), 'print'),
    mk('ab-csv', 'CSV', () => exportText('csv')), mk('ab-json', 'JSON', () => exportText('json')),
  );
  const filters = el('div', 'ab-filters');
  filters.setAttribute('role', 'radiogroup');
  filters.setAttribute('aria-label', 'Show');
  const FILTERS = [['all', 'All'], ['choice', 'Needs your choice'], ['open', 'Not checked'], ['missing', 'Not found']];
  const fbtns = FILTERS.map(([v, text], i) => {
    const b = el('button', 'btn btn-plain btn-sm ab-filter', text);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.filter = v;
    b.addEventListener('click', () => setFilter(v));
    b.addEventListener('keydown', (e) => {
      const j = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (j) { e.preventDefault(); const n = fbtns[(i + j + fbtns.length) % fbtns.length]; n.focus(); setFilter(n.dataset.filter); }
    });
    return b;
  });
  filters.append(...fbtns);
  function setFilter(v) {
    filter = v;
    for (const b of fbtns) { const on = b.dataset.filter === v; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
    for (const r of rows) r.refresh();
  }
  root.append(meta, progressText, filters, exp, status, alert, checkList);

  /* ------------------------------------------------------- exports */
  async function exportXlsx() {
    try {
      const libs = await h.getXlsx();
      const bytes = await buildAbstractWorkbook(libs.ExcelJS, { deal: d, abstracts: [ab], fflate: libs.fflate });
      if (await deliver(`${dealName(d)} lease abstract - ${ab.title || 'abstract'}.xlsx`, bytes, XLSX, { map: 'none: the lease abstract as typed; no deal calculation' }) === 'done') toast('Workbook ready. This file contains lease wording.');
    } catch (err) { if (!err || err.code !== 'declined') alert.textContent = `The workbook could not be made: ${(err && err.message) || err}`; }
  }
  async function exportText(kind) {
    const text = kind === 'csv' ? `﻿${abstractCsv(d, [ab])}` : abstractJson(d, [ab], VERSION);
    if (await deliver(`${dealName(d)} lease abstract - ${ab.title || 'abstract'}.${kind}`, new TextEncoder().encode(text), kind === 'csv' ? 'text/csv' : 'application/json', { map: 'none: the lease abstract as typed; no deal calculation' }) === 'done') toast(`${kind.toUpperCase()} ready. This file contains lease wording.`);
  }

  /* ------------------------------------------------------- shared pieces */
  const docOptions = () => {
    const have = new Set(ab.docs);
    return [...h.docs().filter((x) => have.has(x.id) || x.type === 'lease' || x.type === 'amendment')];
  };
  const select = (id, label, opts, value, onChange, cls = '') => {
    const s = el('select', cls);
    s.id = id;
    s.setAttribute('aria-label', label);
    for (const [v, t] of opts) { const o = el('option', null, t); o.value = v; s.appendChild(o); }
    s.value = value ?? '';
    if (onChange) s.addEventListener('change', () => onChange(s.value));
    return s;
  };
  const labelled = (text, control, id) => {
    const w = el('div', 'ab-ctl');
    const l = el('label', 'fl', text);
    l.htmlFor = id;
    control.id = control.id || id;
    w.append(l, control);
    return w;
  };
  const textIn = (id, value, max, onChange, { inputmode, area } = /** @type {any} */ ({})) => {
    const i = area ? el('textarea') : el('input', 'text');
    i.id = id;
    i.maxLength = max;
    i.value = value ?? '';
    i.autocomplete = 'off';
    if (area) i.rows = 3;
    if (inputmode) i.inputMode = inputmode;
    i.addEventListener('change', () => onChange(i.value, i));
    return i;
  };

  /**
   * The tools every item has: its status chip, the Checked toggle (off while a problem names it), and the Source disclosure
   * (document, page, quote, and a note that is required when the item needs a choice). extra: buttons put before Checked.
   */
  function tools(key, { extra = [] } = {}) {
    const wrap = el('div', 'ab-tools');
    const chip = el('span', 'chip');
    const tick = btn('btn-plain btn-sm ab-tick', 'Checked', null);
    tick.setAttribute('aria-pressed', 'false');
    const why = el('span', 'hint-sm ab-why');
    why.id = nid('ab-why-');
    tick.addEventListener('click', () => {
      const it = itemOf(ab, key);
      const on = !(it && it.rec && it.rec.checked);
      const res = setChecked(ab, key, on);
      done(res, itemLabel(ab, key), res.error ? '' : `${itemLabel(ab, key)}: ${on ? 'checked' : 'unchecked'}.`);
    });
    const details = el('details', 'ab-src');
    const sum = el('summary', null, 'Source');
    const src0 = () => { const it = itemOf(ab, key); return (it && it.rec && it.rec.src[0]) || { doc: null, page: null, quote: '' }; };
    const opts = [['', '(no document)'], ...docOptions().map((x) => [x.id, x.name])];
    const sid = nid('ab-src-');
    const doc = select(`${sid}-doc`, `Document for ${itemLabel(ab, key)}`, opts, src0().doc || '', () => save());
    const page = textIn(`${sid}-page`, src0().page ?? '', 6, () => save(), { inputmode: 'numeric' });
    page.setAttribute('aria-label', `Page for ${itemLabel(ab, key)}`);
    const quote = textIn(`${sid}-quote`, src0().quote, LIMITS.quote, () => save(), { area: true });
    quote.setAttribute('aria-label', `Quote for ${itemLabel(ab, key)}`);
    const counter = el('span', 'hint-sm', `${quote.value.length} of ${LIMITS.quote}`);
    quote.addEventListener('input', () => { counter.textContent = `${quote.value.length} of ${LIMITS.quote}`; });
    const noteBox = textIn(`${sid}-note`, (itemOf(ab, key) && itemOf(ab, key).rec && itemOf(ab, key).rec.note) || '', LIMITS.note, (v) => {
      const it = itemOf(ab, key);
      if (it && it.rec && it.rec.status === 'ambiguous' && !v.trim()) { alert.textContent = 'Say why it needs a choice, or resolve it.'; return; }
      const res = setNote(ab, key, v);
      if (!res.error) { h.touch({ label: `Lease abstract: note on ${itemLabel(ab, key)}` }); refresh(); }
    }, { area: true });
    noteBox.setAttribute('aria-label', `Note for ${itemLabel(ab, key)}`);
    const choose = btn('btn-plain btn-sm', 'Needs a choice', () => {
      const res = setAmbiguous(ab, key, noteBox.value);
      if (res.error) { alert.textContent = res.error; noteBox.focus(); return; }
      done(res, itemLabel(ab, key), `${itemLabel(ab, key)}: marked as needing your choice.`);
    });
    const resolve = btn('btn-plain btn-sm', 'Resolved', () => {
      const it = itemOf(ab, key);
      if (it && it.rec && it.rec.status === 'ambiguous') { it.rec.status = 'found'; it.rec.checked = false; done({ ok: true }, itemLabel(ab, key), `${itemLabel(ab, key)}: resolved.`); }
    });
    function save() {
      const pg = parseInt(page.value, 10);
      const res = setEvidence(ab, key, [{ doc: doc.value || null, page: Number.isInteger(pg) && pg >= 1 ? pg : null, quote: quote.value }]);
      if (doc.value && !ab.docs.includes(doc.value)) setMeta(ab, { docs: [...ab.docs, doc.value] });
      if (!res.error) { h.touch({ label: `Lease abstract: source for ${itemLabel(ab, key)}` }); status.textContent = `${itemLabel(ab, key)}: source saved.`; refresh(); }
    }
    details.append(sum, labelled('Document', doc, doc.id), labelled('Page', page, page.id), labelled(`Quote (${LIMITS.quote} characters at most)`, quote, quote.id), counter,
      labelled('Note (required when it needs a choice)', noteBox, noteBox.id), el('div', 'dd-formbtns'));
    details.lastChild.append(choose, resolve);
    wrap.append(chip, ...extra, tick, why, details);
    const refreshTools = () => {
      const c = chipOf(ab, key, checks);
      chip.className = `chip chip-${c.tone}`;
      chip.textContent = c.text;
      const it = itemOf(ab, key);
      const r = it && it.rec;
      tick.setAttribute('aria-pressed', String(!!(r && r.checked)));
      const fail = checks.find((x) => x.level === 'fail' && x.key === key);
      const unready = !r || !['found', 'not-found'].includes(r.status);
      tick.disabled = (unready || !!fail) && !(r && r.checked);
      const reason = fail ? fail.text : unready ? 'Fill it in, or mark it not in the lease, to check it.' : '';
      why.textContent = reason;
      if (reason) tick.setAttribute('aria-describedby', why.id); else tick.removeAttribute('aria-describedby');
      const warns = checks.filter((x) => x.level === 'warn' && x.key === key).map((x) => x.text);
      if (warns.length) why.textContent = warns.join('; ');
      resolve.hidden = !(r && r.status === 'ambiguous');
    };
    return { node: wrap, refresh: refreshTools };
  }

  /** A row in the filterable list: hidden or shown by the filter, its words refreshed after every change. */
  function addRow(key, node, refreshInner) {
    const t = rows.find((r) => r.key === key);
    const entry = t || { key, node };
    entry.node = node;
    entry.refresh = () => {
      if (refreshInner) refreshInner();
      const c = chipOf(ab, key, checks);
      const it = itemOf(ab, key);
      const r = it && it.rec;
      const show = filter === 'all' || (filter === 'choice' && c.text === 'Needs your choice') || (filter === 'open' && !(r && r.checked)) || (filter === 'missing' && r && r.status === 'not-found');
      node.hidden = !show;
    };
    if (!t) rows.push(entry);
    return entry;
  }

  /* ------------------------------------------------------- the fields */
  function fieldRow(f) {
    const key = f.key;
    const rec = () => ab.fields[key];
    const id = `abf-${key}`;
    const node = el('div', 'ab-field');
    node.dataset.key = key;
    const lab = el('label', 'fl', f.label);
    lab.htmlFor = id;
    let main; let unit = null; let basis = null; let rel = null;
    const units = unitsOf(f);
    const save = () => {
      const raw = f.kind === 'date' || f.kind === 'dateRel' ? main.value : main.value;
      const blank = f.kind === 'bool' || f.kind === 'enum' ? raw === '' : !String(raw).trim();
      const relText = rel ? rel.value : '';
      if (blank && !(f.kind === 'dateRel' && relText.trim())) {
        if (rec() && rec().status !== 'unread') { clearField(ab, key); done({ ok: true }, f.label, `${f.label}: cleared.`); }
        return;
      }
      let v;
      if (['money', 'psf', 'sf', 'int'].includes(f.kind)) { v = parseNum(raw); if (v === null) { alert.textContent = `${f.label}: type a number.`; main.setAttribute('aria-invalid', 'true'); return; } }
      else if (f.kind === 'pct') { v = parsePct(raw, { fraction: false }); if (v === null) { alert.textContent = `${f.label}: type a percent such as 6.25.`; main.setAttribute('aria-invalid', 'true'); return; } }
      else if (f.kind === 'bool') v = raw === 'yes';
      else if (f.kind === 'address') v = String(raw).split('\n');
      else v = f.kind === 'dateRel' && blank ? null : raw;
      const res = setValue(ab, key, v, { unit: unit ? unit.value || undefined : undefined, basis: basis ? basis.value || undefined : undefined, rel: rel ? rel.value : undefined });
      if (res.error) main.setAttribute('aria-invalid', 'true'); else main.removeAttribute('aria-invalid');
      done(res, f.label);
    };
    const load = () => {
      const r = rec();
      const v = r && r.status !== 'unread' ? r.value : null;
      if (f.kind === 'date' || f.kind === 'dateRel') main.value = v || '';
      else if (f.kind === 'money' || f.kind === 'psf') main.value = v === null || v === undefined ? '' : money2(v);
      else if (f.kind === 'address') main.value = Array.isArray(v) ? v.join('\n') : '';
      else if (f.kind === 'bool') main.value = v === true ? 'yes' : v === false ? 'no' : '';
      else main.value = v === null || v === undefined ? '' : String(v);
      if (unit) unit.value = (r && r.unit) || units[0] || '';
      if (basis) basis.value = (r && r.basis) || '';
      if (rel) rel.value = (r && r.rel) || '';
    };
    if (f.kind === 'date' || f.kind === 'dateRel') { main = dateInput({ value: '', label: f.label, id, onCommit: () => save() }); }
    else if (f.kind === 'clause' || f.kind === 'address') { main = textIn(id, '', f.kind === 'clause' ? LIMITS.clause : LIMITS.addressLines * (LIMITS.addressLine + 1), save, { area: true }); if (f.kind === 'clause') main.rows = 4; }
    else if (f.kind === 'enum') main = select(id, f.label, [['', 'Choose…'], ...f.opts.map((o) => [o, o])], '', save);
    else if (f.kind === 'bool') main = select(id, f.label, [['', 'Choose…'], ['yes', 'Yes'], ['no', 'No']], '', save);
    else main = textIn(id, '', LIMITS.text, save, { inputmode: ['money', 'psf', 'pct'].includes(f.kind) ? 'decimal' : f.kind === 'int' || f.kind === 'sf' ? 'numeric' : undefined });
    const ctl = el('div', 'ab-input');
    ctl.appendChild(main);
    if (f.kind === 'dateRel') { rel = textIn(`${id}-rel`, '', LIMITS.rel, save); rel.setAttribute('aria-label', `${f.label}, in the lease’s words`); rel.placeholder = 'or the lease’s words, if no date yet'; ctl.appendChild(rel); }
    if (units.length > 1) { unit = select(`${id}-unit`, `Unit for ${f.label}`, units.map((u) => [u, UNIT_LABEL[u]]), units[0], save); ctl.appendChild(unit); }
    if (f.kind === 'sf' || f.kind === 'psf') { basis = select(`${id}-basis`, `Measured on, for ${f.label}`, [['', 'Measured on…'], ...BASES.map((b) => [b, b])], '', save); ctl.appendChild(basis); }
    if (f.kind === 'psf' && units.length === 1) ctl.appendChild(el('span', 'hint-sm', UNIT_LABEL[units[0]]));
    const none = btn('btn-plain btn-sm', 'Lease says none', () => {
      const had = rec() && (rec().src.some((s) => s.page || s.quote) || rec().note);
      const res = setNone(ab, key, { noClause: !had });
      if (done(res, f.label, `${f.label}: marked none${had ? '' : ', with the note “no clause”'}.`)) load();
    });
    none.disabled = ['date', 'dateRel', 'sf', 'psf', 'enum', 'address'].includes(f.kind);
    const nf = btn('btn-plain btn-sm', 'Not in lease', () => { if (done(setNotFound(ab, key), f.label, `${f.label}: marked not in lease.`)) load(); });
    const t = tools(key, { extra: [none, nf] });
    if (f.optional) {
      const rm = btn('btn-plain btn-sm', 'Remove', () => { clearField(ab, key); h.touch({ label: `Lease abstract: removed ${f.label}` }); rows.splice(rows.findIndex((r) => r.key === key), 1); node.remove(); refresh(); });
      t.node.appendChild(rm);
    }
    node.append(lab, ctl, t.node);
    load();
    addRow(key, node, t.refresh);
    return node;
  }

  /* ------------------------------------------------------- terms and steps */
  const parseMoney = (raw) => (String(raw).trim() === '' ? null : parseNum(raw));
  function termCard(term) {
    const key = `term:${term.id}`;
    const card = el('section', 'ab-term');
    card.dataset.term = term.id;
    const hd = el('h4', null, term.label || 'Term');
    const sid = nid('abt-');
    const set = (patch, said) => { const res = setTerm(ab, term.id, patch); if (done(res, term.label || 'term', said)) hd.textContent = term.label || 'Term'; };
    const label = labelled('Name', textIn(`${sid}-label`, term.label, LIMITS.termLabel, (v) => set({ label: v })), `${sid}-label`);
    const kind = labelled('Kind', select(`${sid}-kind`, 'Term kind', TERM_KINDS.map((k) => [k, KIND_LABEL[k]]), term.kind || 'initial', (v) => set({ kind: v })), `${sid}-kind`);
    const ref = labelled('Section cited', textIn(`${sid}-ref`, term.ref, LIMITS.termRef, (v) => set({ ref: v })), `${sid}-ref`);
    const docSel = labelled('Document', select(`${sid}-doc`, 'Term document', [['', '(none)'], ...docOptions().map((x) => [x.id, x.name])], term.doc || '', (v) => set({ doc: v || null })), `${sid}-doc`);
    const eff = el('div', 'ab-ctl');
    const el1 = el('label', 'fl', 'Effective'); el1.htmlFor = `${sid}-eff`;
    eff.append(el1, dateInput({ value: term.effective || '', label: 'Effective', id: `${sid}-eff`, onCommit: (iso) => set({ effective: iso || null }) }));
    const flag = (text, prop) => {
      const l = el('label', 'ab-check');
      const c = el('input'); c.type = 'checkbox'; c.checked = !!term[prop]; c.id = `${sid}-${prop}`;
      c.addEventListener('change', () => set({ [prop]: c.checked }));
      l.append(c, ` ${text}`);
      return l;
    };
    const head = el('div', 'ab-grid');
    head.append(label, kind, ref, docSel, eff, flag('Supersedes the original', 'supersedes'), flag('Not quantified in the lease', 'unquantified'));
    const tl = tools(key);
    card.append(hd, head, tl.node);
    addRow(key, card, tl.refresh);
    const stepsBox = el('div', 'ab-steps');
    for (const s of ab.steps.filter((x) => x.term === term.id)) stepsBox.appendChild(stepCard(s));
    const total = el('p', 'ab-total');
    total.dataset.readout = 'term';
    total.refresh = () => {
      const b = rentBlock(ab, term.id);
      total.textContent = term.unquantified ? 'Not quantified in the lease.' : b.total ? `Term total: ${b.total.months} months, ${money2(b.total.total)}${b.total.weighted !== null ? `, weighted annual rate ${money2(b.total.weighted)} per SF` : ''}.` : b.rows.length ? 'No total yet: some steps are not resolved.' : '';
    };
    const addS = btn('btn-plain btn-sm', 'Add step', () => { const r = addStep(ab, term.id); if (!r.error) h.touch({ label: `Lease abstract: added a rent step` }); redraw(r.error); });
    const rmT = btn('btn-plain btn-sm', 'Remove term', async () => { const gone = removeTerm(ab, term.id); if (gone) { h.touch({ label: `Lease abstract: removed ${term.label}` }); redraw(); toast(`${term.label || 'The term'} removed.`, { label: 'Undo', run: () => { if (!ab.terms.some((x) => x.id === gone.item.id)) { ab.terms.splice(gone.index, 0, gone.item); ab.steps.push(...gone.steps); h.touch({ label: 'Lease abstract: term restored' }); redraw(); } } }); } });
    card.append(stepsBox, total, el('div', 'dd-formbtns'));
    card.lastChild.append(addS, rmT);
    return card;
  }
  function stepCard(s) {
    const key = `step:${s.id}`;
    const card = el('div', 'ab-step');
    card.dataset.step = s.id;
    const sid = nid('abs-');
    const set = (patch) => done(setStep(ab, s.id, patch), itemLabel(ab, key));
    const num = (id, label, value, field) => labelled(label, textIn(id, value ?? '', 4, (v, i) => { const n = String(v).trim() === '' ? null : parseInt(v, 10); if (n !== null && !(n >= 1)) { alert.textContent = `${label}: type a month number such as 1.`; i.setAttribute('aria-invalid', 'true'); return; } i.removeAttribute('aria-invalid'); set({ [field]: n }); }, { inputmode: 'numeric' }), id);
    const date = (id, label, value, field) => { const w = el('div', 'ab-ctl'); const l = el('label', 'fl', label); l.htmlFor = id; w.append(l, dateInput({ value: value || '', label, id, onCommit: (iso) => set({ [field]: iso || null }) })); return w; };
    const money = (u) => {
      const id = `${sid}-${u}`;
      const i = textIn(id, s.amounts[u] === null ? '' : money2(s.amounts[u]), 24, (v, inp) => {
        const n = parseMoney(v);
        if (String(v).trim() !== '' && n === null) { alert.textContent = `${AMOUNT_LABEL[u]}: type a number.`; inp.setAttribute('aria-invalid', 'true'); return; }
        inp.removeAttribute('aria-invalid');
        set({ amounts: { [u]: n } });
        const cur = s.amounts[u];
        inp.value = cur === null ? '' : money2(cur);
      }, { inputmode: 'decimal' });
      return labelled(AMOUNT_LABEL[u], i, id);
    };
    const grid = el('div', 'ab-grid ab-stepgrid');
    grid.append(labelled('Period name', textIn(`${sid}-label`, s.label, LIMITS.stepLabel, (v) => set({ label: v })), `${sid}-label`),
      date(`${sid}-from`, 'From', s.from, 'from'), date(`${sid}-to`, 'To', s.to, 'to'),
      num(`${sid}-mfrom`, 'From month', s.mFrom, 'mFrom'), num(`${sid}-mto`, 'To month', s.mTo, 'mTo'),
      money('month'), money('year'), money('psf_year'), money('psf_month'),
      labelled('The rent is the', select(`${sid}-primary`, 'Which amount is the rent', [['', 'Choose…'], ...['month', 'year', 'psf_year', 'psf_month'].map((u) => [u, AMOUNT_LABEL[u]])], s.primary || '', (v) => set({ primary: v || null })), `${sid}-primary`),
      labelled('$/SF measured on', select(`${sid}-basis`, 'Step $/SF basis', [['', 'Use the area’s'], ...BASES.map((b) => [b, b])], s.basis || '', (v) => set({ basis: v || null })), `${sid}-basis`));
    const out = el('p', 'ab-readout');
    out.dataset.readout = 'step';
    out.refresh = () => {
      const term = ab.terms.find((x) => x.id === s.term);
      const r = term ? rentBlock(ab, term.id).rows.find((x) => x.step.id === s.id) : null;
      if (!r) { out.textContent = ''; return; }
      const bits = [r.monthly !== null ? `Monthly ${money2(r.monthly)}` : `Monthly rent: ${r.reason || 'not known'}`];
      if (r.months !== null) bits.push(`${r.months} months`);
      if (r.total !== null) bits.push(`Total ${money2(r.total)}`);
      if (r.annualPsf !== null) bits.push(`Annual rate per SF ${money2(r.annualPsf)} (monthly x 12 / rentable SF)`); else if (r.psfText) bits.push(r.psfText);
      if (r.step.mFrom !== null && !r.step.from) bits.push(r.from ? `from ${r.from} (from rent commencement)` : 'dates: unresolved until rent commencement is typed and checked');
      out.textContent = bits.join(' · ');
    };
    const tl = tools(key);
    const rm = btn('btn-plain btn-sm', 'Remove step', () => { const gone = removeStep(ab, s.id); if (gone) { h.touch({ label: 'Lease abstract: removed a rent step' }); redraw(); toast('Rent step removed.', { label: 'Undo', run: () => { if (!ab.steps.some((x) => x.id === gone.item.id)) { ab.steps.splice(Math.min(gone.index, ab.steps.length), 0, gone.item); h.touch({ label: 'Lease abstract: rent step restored' }); redraw(); } } }); } });
    card.append(grid, out, tl.node, rm);
    addRow(key, card, tl.refresh);
    return card;
  }

  /* ------------------------------------------------------- options */
  function optionCard(o) {
    const key = `option:${o.id}`;
    const card = el('section', 'ab-option');
    const sid = nid('abo-');
    const set = (patch) => done(setOption(ab, o.id, patch), itemLabel(ab, key));
    const n = (field, label, max = 4) => labelled(label, textIn(`${sid}-${field}`, o[field] ?? '', max, (v, i) => { const x = String(v).trim() === '' ? null : parseInt(v, 10); if (x !== null && !(x >= 0)) { alert.textContent = `${label}: type a whole number.`; i.setAttribute('aria-invalid', 'true'); return; } i.removeAttribute('aria-invalid'); set({ [field]: x }); }, { inputmode: 'numeric' }), `${sid}-${field}`);
    const grid = el('div', 'ab-grid');
    grid.append(
      labelled('Kind', select(`${sid}-kind`, 'Option kind', OPTION_KINDS.map((k) => [k, OPT_LABEL[k]]), o.kind || 'renewal', (v) => set({ kind: v })), `${sid}-kind`),
      n('count', 'How many'), n('termMonths', 'Months each'), n('noticeMin', 'Notice at least'), n('noticeMax', 'Notice at most'),
      labelled('Notice in', select(`${sid}-unit`, 'Notice unit', [['months', 'months'], ['days', 'days']], o.noticeUnit || 'months', (v) => set({ noticeUnit: v })), `${sid}-unit`),
      labelled('Counted back from', select(`${sid}-rel`, 'Notice counted from', [['expiration', 'expiration'], ['commencement', 'commencement'], ['other', 'another date']], o.relTo || 'expiration', (v) => set({ relTo: v })), `${sid}-rel`),
      labelled('Rent reset', select(`${sid}-reset`, 'Rent reset', [['', 'Not stated'], ...RESETS.map((r) => [r, RESET_LABEL[r]])], o.reset || '', (v) => set({ reset: v || null })), `${sid}-reset`),
      labelled('Reset percent', textIn(`${sid}-pct`, o.resetPct ?? '', 12, (v, i) => { const x = String(v).trim() === '' ? null : parsePct(v, { fraction: false }); if (String(v).trim() !== '' && x === null) { alert.textContent = 'Reset percent: type a percent.'; i.setAttribute('aria-invalid', 'true'); return; } i.removeAttribute('aria-invalid'); set({ resetPct: x }); }, { inputmode: 'decimal' }), `${sid}-pct`),
      labelled('Reset, in words', textIn(`${sid}-rtext`, o.resetText, LIMITS.resetText, (v) => set({ resetText: v })), `${sid}-rtext`),
      labelled('Fee', textIn(`${sid}-fee`, o.fee === null ? '' : money2(o.fee), 24, (v, i) => { const x = parseMoney(v); if (String(v).trim() !== '' && x === null) { alert.textContent = 'Fee: type a number.'; i.setAttribute('aria-invalid', 'true'); return; } i.removeAttribute('aria-invalid'); set({ fee: x }); }, { inputmode: 'decimal' }), `${sid}-fee`),
      labelled('Conditions', textIn(`${sid}-cond`, o.conditions, LIMITS.conditions, (v) => set({ conditions: v })), `${sid}-cond`));
    const tl = tools(key);
    const rm = btn('btn-plain btn-sm', 'Remove option', () => { const gone = removeOption(ab, o.id); if (gone) { h.touch({ label: 'Lease abstract: removed an option' }); redraw(); toast('Option removed.', { label: 'Undo', run: () => { if (!ab.options.some((x) => x.id === gone.item.id)) { ab.options.splice(Math.min(gone.index, ab.options.length), 0, gone.item); h.touch({ label: 'Lease abstract: option restored' }); redraw(); } } }); } });
    card.append(el('h4', null, `Option: ${OPT_LABEL[o.kind] || 'Option'}`), grid, tl.node, rm);
    addRow(key, card, tl.refresh);
    return card;
  }
  function clauseCard(c) {
    const key = `clause:${c.id}`;
    const card = el('div', 'ab-field');
    const sid = nid('abc-');
    const set = (patch) => done(setClause(ab, c.id, patch), itemLabel(ab, key));
    const tl = tools(key);
    const rm = btn('btn-plain btn-sm', 'Remove', () => { const gone = removeClause(ab, c.id); if (gone) { h.touch({ label: 'Lease abstract: removed a note' }); redraw(); toast('Note removed.', { label: 'Undo', run: () => { if (!ab.clauses.some((x) => x.id === gone.item.id)) { ab.clauses.splice(Math.min(gone.index, ab.clauses.length), 0, gone.item); h.touch({ label: 'Lease abstract: note restored' }); redraw(); } } }); } });
    const text = textIn(`${sid}-text`, c.text, LIMITS.clause, (v) => set({ text: v }), { area: true });
    text.rows = 4;
    card.append(labelled('Note name', textIn(`${sid}-label`, c.label, LIMITS.customLabel, (v) => set({ label: v })), `${sid}-label`), labelled('Wording', text, `${sid}-text`), tl.node, rm);
    addRow(key, card, tl.refresh);
    return card;
  }

  /* ------------------------------------------------------- the whole editor */
  const content = el('div', 'ab-content');
  root.appendChild(content);
  function redraw(error) {
    redrawKeepingFocus(root, () => {
      rows.length = 0;
      content.textContent = '';
      build();
      refresh();
      if (error) alert.textContent = error;
    });
  }
  const group = (id, label, nodes, extra = []) => {
    const s = el('section', 'ab-group');
    const hd = el('h3');
    const b = el('button', 'dd-toggle ab-gtoggle', label);
    b.type = 'button';
    b.setAttribute('aria-expanded', 'true');
    const bid = `abg-${id}`;
    b.setAttribute('aria-controls', bid);
    hd.appendChild(b);
    const inner = el('div', 'ab-ginner');
    inner.id = bid;
    inner.append(...nodes, ...extra);
    b.addEventListener('click', () => { const on = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(on)); inner.hidden = !on; });
    s.append(hd, inner);
    return s;
  };
  function build() {
    for (const g of GROUPS) {
      if (g.id === 'term') {
        const nodes = FIELDS.filter((f) => f.group === 'term').map(fieldRow);
        content.appendChild(group('term', g.label, nodes));
        const rent = el('div', 'ab-rent');
        rent.appendChild(el('p', 'hint-sm', `${RATE_NOTE} Months 1 to 12 count from rent commencement once that date is typed and checked.`));
        for (const t of ab.terms) rent.appendChild(termCard(t));
        const addT = btn('btn-plain btn-sm', 'Add term', () => { const r = addTerm(ab, { kind: ab.terms.length ? 'renewal' : 'initial' }); if (!r.error) h.touch({ label: 'Lease abstract: added a rent term' }); redraw(r.error); });
        addT.id = 'ab-add-term';
        const opts = el('div', 'ab-opts');
        for (const o of ab.options) opts.appendChild(optionCard(o));
        const addO = btn('btn-plain btn-sm', 'Add option', () => { const r = addOption(ab); if (!r.error) h.touch({ label: 'Lease abstract: added an option' }); redraw(r.error); });
        addO.id = 'ab-add-option';
        content.appendChild(group('rent', 'Rent and options', [rent, opts], [addT, addO]));
      } else if (g.id === 'clauses') {
        const nodes = FIELDS.filter((f) => f.group === 'clauses' && (!f.optional || ab.fields[f.key])).map(fieldRow);
        const customs = ab.clauses.map(clauseCard);
        const absent = FIELDS.filter((f) => f.optional && !ab.fields[f.key]);
        const pick = select('ab-add-clause', 'Add a clause', [['', 'Add a clause…'], ...absent.map((f) => [f.key, f.label]), ['__custom', 'A note of your own…']], '', (v) => {
          if (!v) return;
          if (v === '__custom') { const r = addClause(ab, { label: 'Note' }); if (!r.error) h.touch({ label: 'Lease abstract: added a note' }); redraw(r.error); return; }
          setNote(ab, v, '');
          h.touch({ label: `Lease abstract: added ${itemLabel(ab, v)}` });
          redraw();
        });
        content.appendChild(group('clauses', g.label, [...nodes, ...customs], [pick]));
      } else {
        content.appendChild(group(g.id, g.label, FIELDS.filter((f) => f.group === g.id).map(fieldRow)));
      }
    }
    // the broker's own flags
    const flagBox = el('div', 'ab-flags');
    const fl = el('ul', 'ab-flaglist');
    for (const f of ab.flags) {
      const li = el('li');
      li.append(el('span', null, f.text), btn('btn-plain btn-sm', 'Remove', () => { removeFlag(ab, f.id); h.touch({ label: 'Lease abstract: removed a flag' }); redraw(); }, `Remove flag: ${f.text}`));
      fl.appendChild(li);
    }
    const fin = textIn('ab-flag-text', '', LIMITS.flag, () => {});
    fin.setAttribute('aria-label', 'New flag');
    const addF = btn('btn-plain btn-sm', 'Add flag', () => { const r = addFlag(ab, fin.value); if (r.error) { alert.textContent = r.error; return; } h.touch({ label: 'Lease abstract: added a flag' }); redraw(); });
    addF.id = 'ab-add-flag';
    flagBox.append(fl, labelled('Your own flag for this lease', fin, 'ab-flag-text'), addF);
    content.appendChild(group('flags', 'Your flags', [flagBox]));
  }

  // keys (the sheet only; not while a field has the keys): j and k move between rows, x ticks, / goes to the filter
  root.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const visible = [...root.querySelectorAll('.ab-field')].filter((n) => !n.hidden && !n.closest('[hidden]'));
    const at = t && t.closest ? t.closest('.ab-field') : null;
    const i = visible.indexOf(at);
    if (e.key === 'j' || e.key === 'k') {
      const next = visible[e.key === 'j' ? Math.min(visible.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1)];
      const c = next && next.querySelector('input, select, textarea, button');
      if (c) { e.preventDefault(); c.focus(); }
    } else if (e.key === 'x' && at) {
      const b = at.querySelector('.ab-tick');
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
    } else if (e.key === '/') { e.preventDefault(); (fbtns.find((b) => b.tabIndex === 0) || fbtns[0]).focus(); }
  });

  build();
  setFilter('all');
  refresh();
  if (opts.focusTitle) title.focus(); else root.focus({ preventScroll: true });
  return ab;
}

/** The Documents card's "Abstract" button for a lease or amendment Doc: open its abstract, or make one. */
export function openAbstractForDoc(box, doc) {
  if (box && box._abOpenFor) box._abOpenFor(doc);
}
