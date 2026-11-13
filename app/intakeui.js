/* intakeui.js -- the "Start from documents" card on the Underwrite tab (logic: intake.js). Step 1 takes several files
 * at once (a picker, a drop on the card, or a drop anywhere on the tab); step 2 shows what was found, asks where two
 * documents compete, lists what is still missing, and waits for "Use". Files are read on this device and held in
 * memory; nothing enters a deal before "Use", and "Use" goes through the deal's own paths (dealui.js useDocuments).
 * Built with el() and textContent only. */

import { el, toast, actionSheet } from './kit.js';
import { PRODUCT } from './brand.js';
import { TYPES, typeLabel } from './ddtypes.js';
import { newPlan, useLabel, stageFiles, answer, skip, choose, controlling, usable, readyItems, questions, checklist, markUsed, readScan, factsShown, answerFact, CONTROLLED, KEEP } from './intake.js';
import { whereText } from './factsread.js';
import { intakeDeps, useDocuments, discardDeal, showDeal } from './dealui.js';

let plan = newPlan();
let reading = /** @type {{ name: string, step: string }[]} */ ([]); // files being looked at now
let target = /** @type {{ id: string, dd: any, created: boolean } | null} */ (null); // the deal "Use" has attached to in this visit
let working = false;
let api = null;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const btn = (cls, text, fn, label) => { const b = el('button', `btn ${cls}`.trim(), text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); if (fn) b.addEventListener('click', fn); return b; };
const dd = () => (target ? target.dd : null);
const box = () => document.getElementById('uw-intake');
const say = (t) => { const s = document.getElementById('uwi-status'); if (s) s.textContent = t; };

/** The card, empty; fill() draws it. */
export function intakeCard(compsApi) {
  api = compsApi;
  const c = el('section', 'card uwi');
  c.id = 'uw-intake';
  c.setAttribute('aria-labelledby', 'uwi-title');
  // a drop on the card shows where it will land; the page-wide drop (ui.js) routes the files itself
  c.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) c.classList.add('uwi-over'); });
  c.addEventListener('dragleave', (e) => { if (!c.contains(/** @type {Node} */ (e.relatedTarget))) c.classList.remove('uwi-over'); });
  c.addEventListener('drop', () => c.classList.remove('uwi-over'));
  fill(c);
  return c;
}

/** Wire the page-wide drop on this tab (ui.js sends the dropped files as `uwdrop`). */
export function initIntake() {
  document.addEventListener('uwdrop', (e) => addFiles([.../** @type {CustomEvent} */ (e).detail]));
}

/** Look at the files, stage each, and redraw as each one finishes. */
export async function addFiles(files) {
  if (!files.length || !box()) return;
  reading = files.map((f) => ({ name: f.name, step: 'Waiting' }));
  fill();
  say(`Looking at ${plural(files.length, 'file', 'files')}…`);
  await stageFiles(plan, files, intakeDeps(), dd(), (file, step) => {
    const r = reading.find((x) => x.name === file.name && (x.step === 'Waiting' || x.step === 'Reading…'));
    if (r) r.step = step === 'reading' ? 'Reading…' : 'Done';
    if (step !== 'reading') reading = reading.filter((x) => x !== r);
    fill();
  });
  reading = [];
  fill();
  const n = plan.items.filter((x) => x.state === 'staged').length;
  say(n ? `${plural(n, 'document', 'documents')} found. Nothing is on a deal until you tap Use.` : 'Nothing was staged.');
  focusTitle();
}

function focusTitle() { const t = document.getElementById('uwi-title'); if (t) t.focus(); }

/** Attach items to the deal, and say what happened; the first one makes the deal, with an Undo. */
async function use(items) {
  if (working || !items.length) return;
  working = true;
  fill();
  let res;
  try { res = await useDocuments(target ? target.id : null, items); } catch (e) { working = false; fill(); toast(`The documents couldn’t be added: ${(e && e.message) || e}`); return; }
  working = false;
  const made = res.created;
  target = { id: res.deal.id, dd: res.deal.dd, created: (target && target.created) || made };
  for (const r of res.done) if (!r.failed) markUsed(plan, r.id);
  const failed = res.done.filter((r) => r.failed);
  const refused = items.filter((it) => !res.done.some((r) => r.id === it.id));
  fill();
  say(`${plural(res.done.length - failed.length, 'document', 'documents')} added to the deal. ${res.done.filter((r) => !r.failed).map((r) => r.note).join(' ')}`.trim());
  if (failed.length || refused.length) say(`${failed.map((f) => f.note).join(' ')} ${refused.length ? `${plural(refused.length, 'document was', 'documents were')} not added.` : ''}`.trim());
  focusTitle();
  const id = res.deal.id;
  if (made) {
    toast('Deal made from your documents.', {
      label: 'Undo',
      run: async () => { await discardDeal(id); target = null; for (const it of plan.items) if (it.state === 'used') { it.state = 'staged'; it.use = useLabel(it.type); } fill(); api?.showView('underwrite'); },
    });
  }
  if (res.deal && !made) toast('Added to the deal.', { label: 'Open', run: () => showDeal(id) });
}

const asItem = (it) => ({ id: it.id, file: it.file, name: it.name, kind: it.kind, size: it.size, sha256: it.sha256, pages: it.pages, type: it.type, typeBy: it.typeBy });

/** Draw the card into its box. */
function fill(c = box()) {
  if (!c) return;
  c.textContent = '';
  const head = el('div', 'card-head');
  const h2 = el('h2', null, 'Start from documents');
  h2.id = 'uwi-title';
  h2.tabIndex = -1;
  head.appendChild(h2);
  if (plan.items.length) head.appendChild(btn('btn-plain btn-sm', 'Clear list', () => { plan = newPlan(); reading = []; fill(); say('The list was cleared. Nothing had been added to a deal.'); }, 'Clear the document list'));
  c.appendChild(head);
  const body = el('div', 'uwi-body');
  body.appendChild(el('p', 'hint-sm', `Add the rent roll, T-12, leases and offering memorandum. They are read on this device, and nothing goes on a deal until you tap Use. ${PRODUCT} sends nothing anywhere for this.`));

  // step 1
  const s1 = el('section', 'uwi-step');
  s1.setAttribute('aria-labelledby', 'uwi-h1');
  const h1 = el('h3', null, 'Step 1 · Files');
  h1.id = 'uwi-h1';
  s1.appendChild(h1);
  const zone = el('div', 'uwi-drop');
  const input = el('input');
  input.type = 'file';
  input.multiple = true;
  input.id = 'uwi-files';
  input.hidden = true;
  input.setAttribute('aria-label', 'Add documents to read');
  input.addEventListener('change', () => { const fs = [...input.files]; input.value = ''; addFiles(fs); });
  const add = btn('btn-primary', 'Add files', () => input.click());
  add.id = 'uwi-add';
  zone.append(add, input, el('p', 'hint-sm', 'or drop several files here, or anywhere on this tab.'));
  s1.appendChild(zone);
  const status = el('p', 'hint-sm uwi-status');
  status.id = 'uwi-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  s1.appendChild(status);
  if (reading.length || plan.items.length) {
    const ul = el('ul', 'dd-list uwi-files');
    for (const r of reading) ul.appendChild(fileRow(r.name, r.step, null));
    for (const it of plan.items) ul.appendChild(fileRow(it.name, `${it.refuse ? 'Not read' : it.dup ? 'Repeated' : 'Looked at'}${it.from ? ` · from ${it.from}` : ''}`, it.refuse || it.dup));
    s1.appendChild(ul);
  }
  body.appendChild(s1);

  // step 2
  const s2 = el('section', 'uwi-step');
  s2.setAttribute('aria-labelledby', 'uwi-h2');
  const h2b = el('h3', null, 'Step 2 · What was found');
  h2b.id = 'uwi-h2';
  s2.appendChild(h2b);
  const live = plan.items.filter((x) => x.state !== 'skipped' || (!x.refuse && !x.dup));
  if (!plan.items.length) s2.appendChild(el('p', 'hint-sm uwi-empty', 'Nothing yet. Add a rent roll, a T-12, a lease or an offering memorandum to begin.'));
  else {
    // what is still missing
    const cl = el('ul', 'dd-list uwi-check');
    cl.setAttribute('aria-label', 'What is still missing');
    for (const k of checklist(plan, dd())) {
      const li = el('li', 'dd-row');
      const line = el('div', 'dd-line');
      line.append(el('span', 'dd-type', k.label), el('span', `dd-chip uwc-${k.status.replace(/ /g, '-')}`, { missing: 'Missing', ready: 'Found, ready to use', used: 'Used', ask: 'Needs your answer', 'on the deal': 'Already on the deal' }[k.status]));
      li.appendChild(line);
      cl.appendChild(li);
    }
    s2.appendChild(cl);
    // competing documents: asked, never chosen for the broker
    for (const k of CONTROLLED) {
      const ctl = controlling(plan, dd(), k);
      if (!ctl.ask) continue;
      const q = el('div', 'uwi-ask');
      q.setAttribute('role', 'group');
      q.setAttribute('aria-label', `Which ${typeLabel(k).toLowerCase()}?`);
      q.dataset.kind = k;
      q.appendChild(el('p', 'uwi-q', ctl.existing ? `The deal already has a ${typeLabel(k).toLowerCase()} (${ctl.existing.name}). Which one controls?` : `There is more than one ${typeLabel(k).toLowerCase()}. Which one controls? It is not chosen for you.`));
      const row = el('div', 'dd-formbtns');
      for (const it of ctl.cands) { const b = btn('btn-sm', `Use ${it.name}`, () => { choose(plan, dd(), k, it.id); fill(); say(`${it.name} is the ${typeLabel(k).toLowerCase()} to use.`); }); b.dataset.pick = it.id; row.appendChild(b); }
      if (ctl.existing) { const b = btn('btn-sm', 'Keep the one on the deal', () => { choose(plan, dd(), k, KEEP); fill(); say(`The deal keeps its ${typeLabel(k).toLowerCase()}.`); }); b.dataset.pick = KEEP; row.appendChild(b); }
      q.appendChild(row);
      s2.appendChild(q);
    }
    const ul = el('ul', 'dd-list uwi-items');
    for (const it of live) ul.appendChild(itemRow(it));
    if (live.length) s2.appendChild(ul);
    const ready = readyItems(plan, dd());
    const q = questions(plan, dd());
    const go = btn('btn-primary', target ? `Use ${plural(ready.length, 'document', 'documents')}` : 'Make a deal from these', () => use(ready.map(asItem)));
    go.id = 'uwi-make';
    if (!ready.length || working) go.disabled = true;
    const acts = el('div', 'uwi-acts');
    acts.appendChild(go);
    if (!ready.length) acts.appendChild(el('p', 'hint-sm', q.length ? `${plural(q.length, 'answer is', 'answers are')} still needed before anything can be used.` : 'There is nothing left to use.'));
    s2.appendChild(acts);
  }
  body.appendChild(s2);
  c.appendChild(body);
}

/** OCR of the first page of a PDF with no text layer, on request: the page is read on this device and nothing is sent. */
async function ocrItem(it) {
  if (working) return;
  working = true;
  fill();
  say(`Reading the first page of ${it.name}…`);
  const res = await readScan(plan, it.id, (bytes, onProgress) => intakeDeps().ocrText(bytes, onProgress), (t) => say(`${it.name}: ${t}`));
  working = false;
  fill();
  say(res.ok ? `${it.name} was read by OCR on this device. Nothing is on a deal until you confirm what it is and tap Use.` : res.why);
}

function fileRow(name, stateText, why) {
  const li = el('li', 'dd-row');
  const line = el('div', 'dd-line');
  const main = el('div', 'dd-open');
  main.append(el('span', 'dd-type', name), el('span', 'dd-sub', stateText));
  line.appendChild(main);
  li.appendChild(line);
  if (why) { const p = el('p', 'warn-text hint-sm dd-reason uwi-why', why); li.appendChild(p); }
  return li;
}

/** What a tax bill, utility bill or unit mix reader found in a file: each figure with its page and line, the notes, and the questions
 * the page leaves (a button per answer). Shown to be checked; nothing here goes on a deal. */
function factsBlock(it, facts) {
  const box = el('div', 'uwi-facts');
  box.dataset.facts = it.id;
  box.appendChild(el('p', 'hint-sm', facts.fields.length ? `Read from it${it.ocrInfo && it.ocrInfo.read && it.ocrInfo.read.length ? ' by OCR' : ''}: check each figure against the page. These are shown for review; no deal has a place for them yet, so nothing is stored.` : 'Nothing could be read from it as labelled figures.'));
  if (facts.fields.length) {
    const ul = el('ul', 'uwi-fact-list');
    for (const f of facts.fields) { const li = el('li', null); li.append(el('span', 'uwi-fact-label', `${f.label}: `), el('b', null, f.text), el('span', 'hint-sm', ` · ${whereText(f.where)}`)); ul.appendChild(li); }
    box.appendChild(ul);
  }
  for (const n of facts.notes) box.appendChild(el('p', 'hint-sm', n));
  for (const a of facts.asks) {
    const q = el('div', 'uwi-fact-ask');
    q.dataset.ask = a.id;
    q.appendChild(el('p', 'warn-text hint-sm', a.question));
    if (a.options.length) {
      const row = el('div', 'dd-formbtns');
      for (const o of a.options) { const b = btn('btn-sm', o.label, () => { if (answerFact(plan, it.id, a.id, o.value)) { fill(); say(`Answered: ${o.label}.`); } }); b.dataset.answer = o.value; row.appendChild(b); }
      q.appendChild(row);
    }
    box.appendChild(q);
  }
  return box;
}

function itemRow(it) {
  const li = el('li', `dd-row uwi-item uwi-${it.state}`);
  li.dataset.id = it.id;
  const line = el('div', 'dd-line');
  const main = el('div', 'dd-open');
  main.append(el('span', 'dd-type', it.type ? typeLabel(it.type) : 'What is this?'), el('span', 'dd-name', it.name), el('span', 'dd-sub', `${it.from ? `From ${it.from}. ` : ''}${it.confidence} · ${it.reason}`));
  line.appendChild(main);
  if (it.ocrInfo && it.ocrInfo.read && it.ocrInfo.read.length) { const m = el('span', 'dd-chip dd-ocr', 'Read by OCR: check figures'); m.dataset.ocrMark = it.id; line.appendChild(m); }
  if (it.state === 'used') line.appendChild(el('span', 'dd-chip dd-reviewed', 'Used'));
  else if (it.state === 'skipped') line.appendChild(el('span', 'dd-chip', 'Skipped'));
  li.appendChild(line);
  const facts = factsShown(it);
  if (facts) li.appendChild(factsBlock(it, facts));
  if (it.state !== 'staged') return li;
  const acts = el('div', 'dd-formbtns uwi-itemacts');
  if (!it.type) {
    for (const t of it.ask.slice(0, 3)) { const b = btn('btn-sm', `It is ${typeLabel(t).toLowerCase()}`, () => { answer(plan, it.id, t); fill(); }); b.dataset.type = t; acts.appendChild(b); }
    if (it.scanned && it.bytes) {
      const ocr = btn('btn-sm', 'Read it with OCR', () => ocrItem(it), `Read ${it.name} with OCR, on this device`);
      ocr.dataset.ocr = it.id;
      acts.appendChild(ocr);
    }
    const other = btn('btn-plain btn-sm', 'Something else…', async () => {
      const v = await actionSheet(`What is ${it.name}?`, TYPES.map((t) => ({ label: t.label, value: t.id })));
      if (v) { answer(plan, it.id, v); fill(); }
    });
    acts.appendChild(other);
  } else {
    const ok = usable(plan, dd(), it);
    const useBtn = btn('btn-primary btn-sm', it.use || 'Use', () => use([asItem(it)]), `${it.use || 'Use'}: ${it.name}`);
    useBtn.dataset.use = it.id;
    if (!ok || working) { useBtn.disabled = true; }
    acts.appendChild(useBtn);
  }
  const sk = btn('btn-plain btn-sm', 'Skip', () => { skip(plan, it.id); fill(); say(`${it.name} was skipped.`); }, `Skip ${it.name}`);
  sk.dataset.skip = it.id;
  acts.appendChild(sk);
  if (it.type && !usable(plan, dd(), it) && CONTROLLED.includes(it.type)) li.appendChild(el('p', 'hint-sm', controlling(plan, dd(), it.type).ask ? 'Answer the question above first.' : 'Not the one chosen to control, so it will not be used.'));
  li.appendChild(acts);
  return li;
}
