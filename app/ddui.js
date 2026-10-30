/* ddui.js -- the Documents card on the deal screen: the due-diligence checklist (missing, found, optional or
 * not applicable) and the files the broker has added. A file is looked at on this device (ddintake.js) and only a
 * record of it is kept (dd.js): its name, kind, size, fingerprint and what a reader found. No file content is stored.
 * dealui.js hands this module `h` = { deal, touch(meta), readPdf, problem, otherDeals(sha), openReader(type),
 * ocrText(bytes), ai: { ready(), pick() }, sheetOpen, sheetClose, getFflate, getXlsx, stillOpen() }. Every change
 * goes through h.touch, so History and Undo cover it. Typing is read when Save is tapped; nothing redraws while
 * a key is pressed. The checklist is advice: it never blocks a figure. */

import { el, toast, actionSheet } from './kit.js';
import { dateInput } from './dateinput.js';
import { blocked } from './ai.js';
import { intake } from './ddintake.js';
import { classify, TYPES, TYPE_BY_ID, typeLabel, PRESETS, PRESET_IDS } from './ddtypes.js';
import { ddOf, checklist, addDoc, removeDoc, restoreDoc, retype, markReviewed, setAsOf, setNa, clearNa, recordRead, MAX_REASON } from './dd.js';
import { sha256Hex } from './fingerprint.js';
import { LIMITS } from './filekind.js';

const OPEN_KEY = 'zl.dd.open';
const isOpen = () => { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } };
const setOpen = (v) => { try { localStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch { /* fine */ } };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const btn = (cls, text, fn, label) => { const b = el('button', `btn ${cls}`.trim(), text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); if (fn) b.addEventListener('click', fn); return b; };
const chip = (text, kind) => el('span', `dd-chip dd-${kind}`, text);
const STATUS_TEXT = { received: 'Received', read: 'Read', reviewed: 'Reviewed', superseded: 'Superseded' };
/** The types to offer when a file's type is unknown: the likely ones first, then every other, in the table's order. */
const typeItems = (likely) => {
  const first = likely.filter((id) => TYPE_BY_ID[id]);
  return [...first, ...TYPES.map((t) => t.id).filter((id) => !first.includes(id))].map((id, i) => ({ label: typeLabel(id), sub: i < first.length ? 'a likely match' : '', value: id }));
};

/** Draw the card into `box`. */
export function renderDocsCard(box, h) {
  const d = h.deal;
  const draw = () => renderDocsCard(box, h);
  const dd = ddOf(d);
  const list = checklist(d);
  box.textContent = '';
  const open = isOpen();

  // the heading is the switch: collapsed by default, the choice remembered on this device
  const head = el('div', 'card-head');
  const h2 = el('h2');
  const toggle = el('button', 'dd-toggle');
  toggle.type = 'button';
  toggle.id = 'dd-toggle';
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-controls', 'dd-body');
  const count = list.preset ? ` · ${list.have} of ${list.required} required` : dd.docs.length ? ` · ${plural(dd.docs.length, 'file', 'files')}` : '';
  toggle.textContent = `Documents${count}`;
  toggle.addEventListener('click', () => { setOpen(!open); draw(); });
  h2.appendChild(toggle);
  head.appendChild(h2);
  box.appendChild(head);
  const body = el('div', 'dd-body');
  body.id = 'dd-body';
  body.hidden = !open;
  box.appendChild(body);
  if (!open) return;

  const status = el('p', 'hint-sm dd-status');
  status.id = 'dd-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const alert = el('p', 'warn-text hint-sm dd-alert');
  alert.id = 'dd-alert';
  alert.setAttribute('role', 'alert');
  const say = (t) => { status.textContent = t; };
  const warn = (t) => { alert.textContent = t; };

  // what kind of property this is: asked, never defaulted to Retail
  const pf = el('div', 'dd-preset');
  const pl = el('label', 'fl', list.preset ? 'Checklist for' : 'What kind of property is this?');
  pl.htmlFor = 'dd-preset';
  const ps = el('select');
  ps.id = 'dd-preset';
  const none = el('option', null, 'Choose…'); none.value = ''; ps.appendChild(none);
  for (const id of PRESET_IDS) { const o = el('option', null, PRESETS[id]); o.value = id; ps.appendChild(o); }
  ps.value = list.preset || '';
  ps.addEventListener('change', () => { dd.preset = ps.value || null; h.touch({ label: `Documents: checklist for ${ps.value ? PRESETS[ps.value] : 'no property type'}` }); draw(); });
  pf.append(pl, ps);
  body.appendChild(pf);
  if (!list.preset) body.appendChild(el('p', 'hint-sm', 'Pick one to see which documents to ask for. The list is advice: it never stops a figure.'));

  // adding files
  const acts = el('div', 'dd-actions');
  const input = el('input');
  input.type = 'file';
  input.multiple = true;
  input.id = 'dd-files';
  input.hidden = true;
  input.setAttribute('aria-label', 'Add due diligence files');
  input.addEventListener('change', () => { const fs = [...input.files]; input.value = ''; addFiles(fs); });
  const add = btn('btn-primary btn-sm', 'Add files', () => input.click());
  add.id = 'dd-add';
  acts.append(add, input);
  body.append(acts, el('p', 'hint-sm', 'Drop files here too. Only a record of each file is kept (its name, size and fingerprint), never the file.'));
  const ai = el('div', 'dd-ai');
  body.appendChild(ai);
  body.append(status, alert);
  fillAi(ai);

  // the three groups
  const group = (id, title, n, rows, empty) => {
    const s = el('section', 'dd-group');
    s.setAttribute('aria-labelledby', id);
    const t = el('h3', null, `${title} (${n})`);
    t.id = id;
    s.appendChild(t);
    if (!n) { if (empty) s.appendChild(el('p', 'hint-sm', empty)); return s; }
    const ul = el('ul', 'dd-list');
    for (const r of rows) ul.appendChild(r);
    s.appendChild(ul);
    return s;
  };
  if (list.preset) body.appendChild(group('dd-h-missing', 'Missing', list.missing.length, list.missing.map(missingRow), 'Nothing required is missing.'));
  body.appendChild(group('dd-h-found', 'Found', list.found.length, list.found.map(foundRow), 'No documents added yet.'));
  if (list.preset) body.appendChild(group('dd-h-optional', 'Optional or not applicable', list.optional.length + list.na.length, [...list.optional.map(optionalRow), ...list.na.map(naRow)]));
  if (dd.docs.length) body.appendChild(el('p', 'hint-sm', 'Tap a file to open where it was read. Documents are not read automatically: use the Rent roll and T-12 imports, or the OM reader, and the file is marked as read.'));

  // drop zone: a drop here is documents for this deal, not an OM and not a CoStar report
  const stop = (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); e.stopPropagation(); } };
  box.addEventListener('dragover', (e) => { stop(e); box.classList.add('dd-drop'); });
  box.addEventListener('dragleave', () => box.classList.remove('dd-drop'));
  box.addEventListener('drop', (e) => { stop(e); box.classList.remove('dd-drop'); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) addFiles(fs); });

  /* ------------------------------------------------------------ rows */
  function missingRow(r) {
    const li = el('li', 'dd-row');
    const line = el('div', 'dd-line');
    line.append(el('span', 'dd-type', r.label), chip('Missing', 'missing'));
    const na = btn('btn-plain btn-sm', 'Not applicable…', null, `Not applicable: ${r.label}`);
    na.dataset.type = r.id;
    na.addEventListener('click', () => naForm(li, r));
    line.appendChild(na);
    li.appendChild(line);
    return li;
  }
  function optionalRow(r) {
    const li = el('li', 'dd-row');
    const line = el('div', 'dd-line');
    line.append(el('span', 'dd-type', r.label), chip('Optional', 'optional'));
    li.appendChild(line);
    return li;
  }
  function naRow(r) {
    const li = el('li', 'dd-row');
    const line = el('div', 'dd-line');
    line.append(el('span', 'dd-type', r.label), chip('Not applicable', 'na'));
    const back = btn('btn-plain btn-sm', 'Needed after all', () => {
      const had = clearNa(dd, r.id);
      h.touch({ label: `Documents: ${r.label} is needed after all` });
      draw();
      toast(`${r.label} is on the checklist again.`, { label: 'Undo', run: () => { if (had && !dd.na[r.id]) { dd.na[r.id] = had; h.touch({ label: `Documents: ${r.label} not applicable again` }); draw(); } } });
    }, `Needed after all: ${r.label}`);
    line.appendChild(back);
    li.appendChild(line);
    li.appendChild(el('p', 'hint-sm dd-reason', `Reason: ${r.reason}`));
    return li;
  }
  function foundRow(doc) {
    const li = el('li', 'dd-row dd-doc');
    li.dataset.id = doc.id;
    const line = el('div', 'dd-line');
    const main = el('button', 'dd-open');
    main.type = 'button';
    const reader = doc.type && h.openReader && ['rentroll', 't12', 'om'].includes(doc.type);
    main.append(el('span', 'dd-type', doc.type ? typeLabel(doc.type) : 'Needs a type'), el('span', 'dd-name', doc.name));
    const sub = [doc.asOf ? `As of ${doc.asOf}` : 'As-of date not set'];
    if (doc.read) { const c = doc.read.checks; const m = c.pass + c.warn + c.fail; sub.push(`${c.pass} of ${m} check${m === 1 ? '' : 's'} pass`); }
    main.appendChild(el('span', 'dd-sub', sub.join(' · ')));
    main.addEventListener('click', () => { if (reader) h.openReader(doc.type); else docMenu(doc); });
    line.append(main, chip(STATUS_TEXT[doc.status] || doc.status, doc.status));
    const more = btn('btn-plain btn-sm dd-more', '…', () => docMenu(doc), `Actions for ${doc.name}`);
    line.appendChild(more);
    li.appendChild(line);
    return li;
  }

  /* ------------------------------------------------------------ actions */
  function naForm(li, r) {
    if (li.querySelector('.dd-naform')) return;
    const f = el('div', 'dd-naform');
    const lab = el('label', 'fl', `Why ${r.label} does not apply`);
    const inp = el('input', 'text');
    inp.id = `dd-na-${r.id}`;
    lab.htmlFor = inp.id;
    inp.maxLength = MAX_REASON;
    inp.autocomplete = 'off';
    const msg = el('p', 'warn-text hint-sm');
    msg.setAttribute('role', 'alert');
    const save = btn('btn-primary btn-sm', 'Save', () => {
      const res = setNa(dd, r.id, inp.value);
      if (res.error) { msg.textContent = res.error; inp.focus(); return; }
      h.touch({ label: `Documents: ${r.label} not applicable` });
      draw();
      toast(`${r.label} marked not applicable.`, { label: 'Undo', run: () => { if (dd.na[r.id]) { clearNa(dd, r.id); h.touch({ label: `Documents: ${r.label} back on the list` }); draw(); } } });
    });
    save.id = `dd-na-save-${r.id}`;
    const cancel = btn('btn-plain btn-sm', 'Cancel', () => f.remove());
    f.append(lab, inp, msg, el('div', 'dd-formbtns'));
    f.lastChild.append(save, cancel);
    li.appendChild(f);
    inp.focus();
  }
  async function docMenu(doc) {
    const reader = doc.type && h.openReader && ['rentroll', 't12', 'om'].includes(doc.type);
    const v = await actionSheet(`${doc.name}`, [
      ...(reader ? [{ label: `Open ${typeLabel(doc.type).toLowerCase()}`, value: 'open' }] : []),
      { label: 'Change type…', value: 'type' },
      { label: 'Mark reviewed', sub: doc.status === 'reviewed' ? 'already reviewed' : '', value: 'reviewed', disabled: doc.status === 'reviewed' },
      { label: 'Set the as-of date…', sub: 'the date the document prints', value: 'asof' },
      '-',
      { label: 'Remove from list', sub: 'the record only; you can undo', value: 'remove', danger: true },
    ]);
    if (!v) return;
    if (v === 'open') h.openReader(doc.type);
    else if (v === 'type') {
      const t = await actionSheet('What is this?', [...typeItems(doc.type ? [doc.type] : []), '-', { label: 'Not sure', sub: 'keep it with no type', value: 'none' }]);
      if (t === null) return;
      if (retype(dd, doc.id, t === 'none' ? null : t)) { h.touch({ label: `Documents: ${doc.name} is ${t === 'none' ? 'not typed' : typeLabel(t)}` }); draw(); }
    } else if (v === 'reviewed') { if (markReviewed(dd, doc.id)) { h.touch({ label: `Documents: reviewed ${doc.name}` }); draw(); } }
    else if (v === 'asof') asOfSheet(doc);
    else if (v === 'remove') {
      const gone = removeDoc(dd, doc.id);
      if (!gone) return;
      h.touch({ label: `Documents: removed ${doc.name}` });
      draw();
      toast(`${doc.name} removed from the list.`, { label: 'Undo', run: () => { restoreDoc(dd, gone); h.touch({ label: `Documents: restored ${doc.name}` }); draw(); } });
    }
  }
  function asOfSheet(doc) {
    const sb = h.sheetOpen({ eyebrow: 'Document', title: doc.name, sub: 'The date printed on it. Leave it empty when you do not know.' });
    const wrap = el('div', 'dd-asof');
    const lab = el('label', 'fl', 'As of');
    lab.htmlFor = 'dd-asof';
    const di = dateInput({ value: doc.asOf || '', label: 'As of', id: 'dd-asof', onCommit: (iso) => { if (setAsOf(dd, doc.id, iso || '')) { h.touch({ label: `Documents: as-of date of ${doc.name}` }); h.sheetClose(); draw(); } } });
    wrap.append(lab, di);
    sb.appendChild(wrap);
  }

  /* ------------------------------------------------------------ adding */
  async function addFiles(files) {
    warn('');
    for (const file of files) {
      if (!h.stillOpen()) return;
      say(`Looking at ${file.name}…`);
      let info;
      try { info = await intake(file, { getFflate: h.getFflate, getXlsx: h.getXlsx, readPdf: h.readPdf, problem: h.problem }); } catch (err) { warn(`${file.name} couldn’t be looked at: ${(err && err.message) || err}`); continue; }
      if (!h.stillOpen()) return;
      if (info.refuse) warn(info.refuse);
      let { type, typeBy } = info.verdict;
      if (!type) {
        const pick = await chooseType(info);
        if (pick === null) { say(`${file.name} was not added.`); continue; }
        type = pick === 'none' ? null : pick;
        typeBy = type ? 'broker' : null;
      }
      const r = addDoc(dd, { ...info, type, typeBy });
      if (r.error) { warn(r.error); say(''); continue; }
      const where = info.sha256 ? await h.otherDeals(info.sha256).catch(() => []) : [];
      h.touch({ label: `Documents: added ${r.doc.name}${type ? ` as ${typeLabel(type)}` : ''}` });
      say(`Added ${r.doc.name}${type ? ` as ${typeLabel(type)}` : ' with no type'}.${where.length ? ` It is also in ${where.slice(0, 3).join(', ')}.` : ''}${info.sha256 ? '' : ' It could not be fingerprinted on this connection.'}`);
      draw();
    }
  }
  /** "What is this?": the likely types, with the file name's suggestion first. Resolves a type id, 'none' (add with no type) or null (do not add). */
  async function chooseType(info) {
    let verdict = info.verdict;
    for (;;) {
      const scanned = verdict.scanned && info.bytes && h.ocrText;
      const items = [
        ...(scanned ? [{ label: 'Read its first page (OCR)', sub: 'on this device; nothing is sent', value: 'ocr', primary: true }] : []),
        ...typeItems(verdict.ask.length ? verdict.ask : verdict.suggest ? [verdict.suggest] : []),
        '-', { label: 'Add it with no type', sub: 'you can set it later', value: 'none' },
      ];
      const v = await actionSheet(`What is ${info.name}?${verdict.ask.length ? '' : ' The text did not say.'}`, items);
      if (v !== 'ocr') return v;
      try {
        say('Reading the first page…');
        const text = await h.ocrText(info.bytes);
        const c = classify(text, info.name);
        verdict = { ...verdict, scanned: false, ask: c.ask };
        if (c.type) return c.type;
      } catch (err) { warn(`The page couldn’t be read: ${(err && err.message) || err}`); verdict = { ...verdict, scanned: false }; }
    }
  }

  /* ------------------------------------------------------------ AI */
  async function fillAi(host) {
    let on = false;
    try { on = !!(h.ai && await h.ai.ready()); } catch { on = false; }
    if (!on || !host.isConnected) return;
    let why = null;
    try { why = await blocked({ deal: d }); } catch { why = 'This device could not check whether the deal is confidential, so nothing was sent.'; }
    if (!host.isConnected) return;
    const b = btn('btn-plain btn-sm', 'Read with AI…', () => { if (!why) h.ai.pick(); });
    b.id = 'dd-ai';
    if (why) {
      b.setAttribute('aria-disabled', 'true');
      b.setAttribute('aria-describedby', 'dd-ai-why');
      const p = el('p', 'hint-sm', why);
      p.id = 'dd-ai-why';
      host.append(b, p);
    } else {
      host.append(b, el('p', 'hint-sm', 'Sends the files you choose to your firm’s AI server. Off unless you tap it.'));
    }
  }
}


/**
 * A reader that already exists has read this file for the deal: record the file in the Documents list as read, with
 * what the reader found (its checks, counted) and where the figures live. Nothing is re-read or copied: the readers
 * keep their own results. `link` also marks the figures this read produced (deal.sources[key].doc) with the
 * record's id, for an OM read where the sources hold the page they came from. info: { reader, target, type, kind,
 * pages, checks: { pass, warn, fail }, link }. touch(meta) saves the deal. Returns the Doc or null.
 * @param {any} d @param {File} file @param {any} info @param {(meta: any) => void} touch
 */
export async function recordFileRead(d, file, info, touch) {
  const sha = file.size <= LIMITS.pdf ? await sha256Hex(await file.arrayBuffer()) : null;
  const r = recordRead(ddOf(d), { name: file.name, kind: info.kind, size: file.size, sha256: sha, pages: info.pages ?? null, type: info.type, read: { reader: info.reader, target: info.target, checks: info.checks } });
  if (r.error) { toast(r.error); return null; }
  if (info.link && d.sources) for (const src of Object.values(d.sources)) if (src && !src.hand && !src.doc && Number.isFinite(src.page)) src.doc = r.doc.id;
  touch({ label: `Documents: ${file.name} ${r.added ? 'added and ' : ''}marked read` });
  return r.doc;
}
