/* underwrite.js -- the Underwrite tab: quick underwriting with no deal. Type a price, NOI and loan terms and the
 * answer shows as you type, from the engine the deal page uses (uwstore.js work). Each quick underwriting is
 * saved on this device as you type (kv 'uw.scratch'); "Save as a deal" turns one into a deal and removes it,
 * with an Undo. Nothing here edits a deal. */

import { PRODUCT } from './brand.js';
import { $, el, parseNum, parsePct, int, dec, money0, money2, pct, times, short, niceDate, toast } from './kit.js';
import { quantizeDeal, toCents } from './engine/money.js';
import { createDeal, discardDeal, showDeal, loanDefaults, scnRead } from './dealui.js';
import { newScratch, work, dealFields, loadScratch, saveScratch, deleteScratch, MAX_SCRATCH } from './uwstore.js';

let api = null;
let items = [];     // the saved quick underwritings, newest first
let cur = null;     // the one on screen (in `items` once it has been edited)
let hidden = 0;     // stored records this version doesn't show
let dirty = null;   // the record whose latest edit has not reached storage
let timer = null;
let chain = Promise.resolve();
let live = null;    // { inputs, result, sub } for the card on screen

const ok = (x) => typeof x === 'number' && Number.isFinite(x);
const SAVE_MS = 300;

/** Where each field lives in the record, its label (the deal page's own) and how it is typed and shown. */
const FIGURES = [
  ['figures', 'price', 'Asking price', 'money'], ['figures', 'noi', 'NOI, in place', 'money'], ['figures', 'bsf', 'Building SF', 'int'],
  ['figures', 'units', 'Units', 'int'], ['figures', 'ptype', 'Property type', 'text'],
];
const BUILD = [['figures', 'gross', 'Gross income (EGI)', 'money'], ['figures', 'opex', 'Operating expenses', 'money']];
const LOAN = [
  ['loan', 'ltv', 'Loan to value %', 'pct'], ['loan', 'rate', 'Interest rate %', 'pct'], ['loan', 'amort', 'Amortization, years', 'num'],
  ['loan', 'closing', 'Closing costs %', 'pct0'], ['loan', 'minDscr', 'Lender minimum DSCR', 'num'], ['loan', 'minDy', 'Lender minimum debt yield %', 'pct'],
];
const HOLD = [
  ['live', 'hold', 'Hold, years', 'hold'], ['live', 'growth', 'NOI growth a year %', 'delta'], ['live', 'exitCap', 'Exit cap rate %', 'pct'], ['live', 'saleCost', 'Sale costs %', 'pct0'],
];

/** What was typed, as the deal page reads the same kind of field (null when it can't be read: a blank is absent, never 0). */
function read(kind, raw) {
  if (kind === 'text') return raw.trim() || null;
  if (kind === 'hold') return scnRead('int', raw);
  return kind === 'num' || kind === 'int' || kind === 'money' ? parseNum(raw) : scnRead(kind, raw);
}
function show(kind, v) {
  if (v === null || v === undefined || v === '') return '';
  if (kind === 'money') return money0(v);
  if (kind === 'int') return int(v);
  if (kind === 'text') return String(v);
  if (kind === 'hold') return String(Math.round(v));
  return kind === 'num' ? String(v) : dec(v, 2);
}

/* ---------------------------------------------------------------- storage */

/** Run a storage step after the ones before it. Resolves or rejects with the step's own result: a caller that reports success must handle the rejection. */
const enqueue = (fn) => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };
const why = (e) => (e && e.message) || String(e);

/** Write the latest edit now (it is also written 300 ms after the last keystroke, and when the app is hidden). */
function flush() {
  clearTimeout(timer);
  timer = null;
  const rec = dirty;
  dirty = null;
  // the autosave has no action to hold back: a failed write is said at once, and the record stays on screen
  return rec ? enqueue(() => saveScratch(rec)).catch((e) => { toast(`The quick underwriting couldn’t be saved: ${why(e)}`); }) : chain;
}

/** The on-screen record changed: money to whole cents at once, as a deal's is; the first edit adds it to the list. */
function touched() {
  quantizeDeal(cur);
  cur.updatedAt = Date.now();
  if (!items.includes(cur)) { items.unshift(cur); drawList(); }
  dirty = cur;
  clearTimeout(timer);
  timer = setTimeout(flush, SAVE_MS);
}

const fresh = () => newScratch({ loan: loanDefaults() });

/* ------------------------------------------------------------------ views */

const button = (cls, label, run) => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', run); return b; };
const line = (k, v, strong, why) => {
  const li = el('li', strong ? 'strong' : null);
  const s = el('span', null, k);
  if (why) s.appendChild(el('span', 'why', why));
  li.append(s, el('b', null, v));
  return li;
};
const summary = (u, w = work(u)) => {
  const { m, run } = w;
  const f = u.figures;
  return [ok(f.price) ? short(f.price) : null, ok(m.capCalc) ? `${pct(m.capCalc)} cap` : null, run.returns && ok(run.returns.leveredIrr) ? `${pct(run.returns.leveredIrr, 1)} levered IRR` : null].filter(Boolean).join(' · ') || 'No figures yet';
};
const titleOf = (u) => u.name || u.figures.ptype || 'Untitled quick underwriting';

/** One input of the card: typed into the record as it is typed, shown tidily when it is left. */
function field(parent, part, key, label, kind, inputs) {
  const fd = el('div', 'field');
  const lab = el('label', null, label);
  const i = el('input', kind === 'text' ? 'text' : 'n');
  i.id = `uw-${key}`;
  lab.htmlFor = i.id;
  i.autocomplete = 'off';
  if (kind !== 'text') i.inputMode = 'decimal';
  i.value = show(kind, cur[part][key]);
  const apply = () => {
    const v = read(kind, i.value);
    if (v === null || v === undefined) delete cur[part][key]; else cur[part][key] = v;
    touched();
    results();
  };
  i.addEventListener('input', apply);
  i.addEventListener('change', () => { apply(); i.value = show(kind, cur[part][key]); flush(); });
  inputs.set(`${part}.${key}`, i);
  fd.append(lab, i);
  parent.appendChild(fd);
}

function card() {
  const c = el('section', 'card');
  c.id = 'uw-card';
  c.setAttribute('aria-labelledby', 'uw-card-title');
  const h = el('div', 'card-head');
  const t = el('h2', null, 'Quick underwrite');
  t.id = 'uw-card-title';
  h.append(t, el('span', 'count', 'saved as you type, on this device'));
  c.appendChild(h);
  const inputs = new Map();
  const grid = (rows) => { const g = el('div', 'grid-form'); for (const r of rows) field(g, ...r, inputs); c.appendChild(g); return g; };

  const nameBox = el('div', 'grid-form');
  const nf = el('div', 'field wide');
  const nl = el('label', null, 'Name');
  const ni = el('input', 'text');
  ni.id = 'uw-name';
  nl.htmlFor = ni.id;
  ni.autocomplete = 'off';
  ni.maxLength = 200;
  ni.placeholder = 'optional';
  ni.value = cur.name;
  ni.addEventListener('input', () => { cur.name = ni.value; touched(); if (live.title) live.title.textContent = titleOf(cur); });
  ni.addEventListener('change', flush);
  nf.append(nl, ni);
  nameBox.appendChild(nf);
  c.appendChild(nameBox);

  grid(FIGURES);
  // gross income less expenses is offered, never filled in
  c.appendChild(el('div', 'sec-label', 'Build NOI (optional)')).style.margin = '0 var(--s5) 0';
  grid(BUILD);
  const build = el('div', 'hint');
  build.id = 'uw-build';
  build.style.padding = '0 var(--s5) var(--s4)';
  c.appendChild(build);

  c.appendChild(el('div', 'sec-label', 'Loan')).style.margin = '0 var(--s5) 0';
  const lg = grid(LOAN);
  const io = el('div', 'field');
  io.appendChild(el('span', 'lbl', 'Interest only'));
  const sw = el('label', 'switch');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.id = 'uw-io';
  cb.checked = !!cur.loan.io;
  cb.setAttribute('aria-label', 'Interest only');
  cb.addEventListener('change', () => { cur.loan.io = cb.checked; touched(); results(); flush(); });
  sw.appendChild(cb);
  io.appendChild(sw);
  lg.appendChild(io);

  c.appendChild(el('div', 'sec-label', 'Hold and sale')).style.margin = '0 var(--s5) 0';
  grid(HOLD);
  const note = el('p', 'hint-sm', 'A blank hold, growth, exit cap or sale cost uses the engine’s default, shown in grey. Rates and percents are yearly; money is dollars a year.');
  note.style.padding = '0 var(--s5) var(--s3)';
  c.appendChild(note);

  const out = el('div');
  out.style.padding = '0 var(--s5) var(--s4)';
  const res = el('ul', 'results');
  res.id = 'uw-results';
  res.setAttribute('aria-label', 'Results');
  const ans = el('ul', 'results');
  ans.id = 'uw-answers';
  ans.setAttribute('aria-label', 'Answers');
  ans.style.marginTop = 'var(--s3)';
  // answers to the questions a buyer asks; the targets are typed here and kept on the record
  const ask = (label, key) => {
    const li = el('li');
    const left = el('span');
    const i = el('input', 'n uw-target');
    i.id = `uw-target-${key}`;
    i.inputMode = 'decimal';
    i.value = ok(cur.targets[key]) ? dec(cur.targets[key], 2) : '';
    i.setAttribute("aria-label", `Quick underwrite: ${label} target, percent`);
    i.addEventListener('change', () => {
      const v = parsePct(i.value);
      if (ok(v) && v > 0 && v < 100) cur.targets[key] = v; else delete cur.targets[key];
      touched();
      flush();
      results();
    });
    const why = el('span', 'why');
    left.append(label, i, '%', why);
    const val = el('b');
    val.id = `uw-price-for-${key}`;
    li.append(left, val);
    ans.appendChild(li);
    return [val, why];
  };
  const [cap, capWhy] = ask('Price for a cap rate of', 'cap');
  const [irr, irrWhy] = ask('Price for a levered IRR of', 'irr');
  out.append(res, ans);
  c.appendChild(out);

  const acts = el('div', 'view-actions');
  acts.style.padding = '0 var(--s5) var(--s5)';
  const save = button('btn btn-primary', 'Save as a deal', saveAsDeal);
  save.id = 'uw-save-deal';
  const nw = button('btn', 'New', startNew);
  nw.id = 'uw-new';
  const del = button('btn btn-gray', 'Delete', removeCurrent);
  del.id = 'uw-delete';
  acts.append(save, nw, del);
  c.appendChild(acts);
  live = { inputs, res, build, cap, capWhy, irr, irrWhy, sub: null, title: null };
  return c;
}

/** The results, worked out again from the record on screen (the inputs are left alone, so typing is never interrupted). */
function results() {
  if (!live || !cur) return;
  const w = work(cur);
  const { m, run, answers } = w;
  const r = run.returns;
  const L = live.res;
  L.textContent = '';
  const mult = r && ok(r.leveredMultiple) ? `${r.leveredMultiple.toFixed(2)}x` : '—';
  L.append(
    line('Cap rate', pct(m.capCalc), true),
    line('Price / SF', money2(m.ppsf)),
    line('Per unit', money0(m.perUnit)),
    line('Loan', money0(m.loan)),
    line('DSCR', times(m.dscr), true),
    line('Debt yield', pct(m.debtYield)),
    line('Cash-on-cash, year 1', pct(m.cashOnCash), true),
    line('Equity, with closing', money0(m.equity)),
  );
  if (m.maxLoan) L.appendChild(line('Largest loan it supports', money0(m.maxLoan.loan), true, `limited by ${m.maxLoan.binding}${m.maxLoan.tests.DSCR ? ` · DSCR test ${short(m.maxLoan.tests.DSCR)}` : ''}${m.maxLoan.tests['Debt yield'] ? ` · debt-yield test ${short(m.maxLoan.tests['Debt yield'])}` : ''}`));
  else L.appendChild(line('Largest loan it supports', '—'));
  L.append(
    line('Levered IRR', pct(r && r.leveredIrr), true, r ? `${run.inputs.hold}-year hold, NOI growing ${dec(run.inputs.growth, 2)}% a year, sold at a ${ok(run.inputs.exitCap) ? pct(run.inputs.exitCap) : '—'} cap` : 'needs a price, NOI and an exit cap'),
    line('Equity multiple', mult),
    line('Unlevered IRR', pct(r && r.unleveredIrr)),
  );
  // the two answers sit in rows drawn once, so a target field being typed in is never replaced
  live.cap.textContent = money0(answers.priceForCap);
  live.capWhy.textContent = ok(run.inputs.noi) ? `NOI ${money0(run.inputs.noi)} ÷ cap rate` : 'needs NOI';
  live.irr.textContent = money0(answers.priceForIrr);
  live.irrWhy.textContent = answers.priceForIrr ? 'same loan terms, hold and exit' : 'not reachable on these terms, or needs an exit cap';
  // the engine's default shows where a field is blank
  const ph = { 'live.hold': run.inputs.hold, 'live.growth': run.inputs.growth, 'live.exitCap': run.inputs.exitCap, 'live.saleCost': run.inputs.saleCost };
  for (const [k, v] of Object.entries(ph)) { const i = live.inputs.get(k); if (i) i.placeholder = ok(v) ? dec(v, 2) : '—'; }
  const g = cur.figures.gross; const o = cur.figures.opex;
  live.build.textContent = '';
  if (ok(g) && ok(o)) {
    const net = toCents(g - o);
    live.build.append(`Gross income less operating expenses is ${money0(net)}. `);
    if (net !== cur.figures.noi) live.build.appendChild(button('btn-plain btn-sm', 'Use as NOI', () => { cur.figures.noi = net; live.inputs.get('figures.noi').value = show('money', net); touched(); flush(); results(); }));
  }
  if (live.sub) live.sub.textContent = summary(cur, w);
}

function drawList() {
  const box = $('uw-list');
  if (!box) return;
  box.textContent = '';
  live.sub = null;
  live.title = null;
  const head = el('div', 'card-head');
  head.appendChild(el('h2', null, 'Quick underwritings'));
  head.appendChild(el('span', 'count', `${items.length}`));
  box.appendChild(head);
  if (!items.length) { const p = el('p', 'hint', 'Nothing saved yet. The first figure you type above is saved here.'); p.style.padding = '0 var(--s5) var(--s4)'; box.appendChild(p); return; }
  const list = el('div', 'list');
  for (const u of items) {
    const b = el('button', 'li');
    b.type = 'button';
    b.dataset.id = u.id;
    if (u === cur) b.setAttribute('aria-current', 'true');
    const main = el('div', 'li-main');
    const title = el('div', 'li-title', titleOf(u));
    main.appendChild(title);
    const sub = el('div', 'li-sub', summary(u));
    if (u === cur) { live.sub = sub; live.title = title; }
    main.append(sub, el('div', 'li-sub', `updated ${niceDate(u.updatedAt)}`));
    b.appendChild(main);
    b.addEventListener('click', async () => { await flush(); cur = u; draw(); window.scrollTo({ top: 0 }); });
    list.appendChild(b);
  }
  box.appendChild(list);
  if (hidden) { const p = el('p', 'hint-sm', `${hidden} more ${hidden === 1 ? 'is' : 'are'} kept on this device but not shown here (made by a newer version of ${PRODUCT}, or unreadable).`); p.style.padding = 'var(--s3) var(--s5)'; box.appendChild(p); }
}

function draw() {
  const root = $('underwrite-root');
  if (!root) return;
  root.textContent = '';
  const head = el('div', 'view-head');
  head.appendChild(el('h1', null, 'Underwrite'));
  head.appendChild(el('p', null, 'Type a price, NOI and loan terms and see the answer. It is not a deal until you save it as one.'));
  const stack = el('div', 'stack');
  stack.appendChild(card());
  const listBox = el('section', 'card');
  listBox.id = 'uw-list';
  stack.appendChild(listBox);
  const calc = el('section', 'card');
  const cl = el('button', 'li');
  cl.type = 'button';
  cl.id = 'uw-calculators';
  cl.style.cssText = 'width:100%;border:0;background:none;text-align:left;padding:var(--s4) var(--s5);cursor:pointer;color:inherit;font:inherit';
  const ct = el('div', null, 'Calculators');
  ct.style.fontWeight = '600';
  cl.append(ct, el('div', 'hint', 'Quick value, loan, offer and hold returns, in Tools'));
  cl.addEventListener('click', () => api.showView('tools'));
  calc.appendChild(cl);
  stack.appendChild(calc);
  root.append(head, stack);
  drawList();
  results();
}

/* ---------------------------------------------------------------- actions */

export async function startNew() {
  await flush();
  if (cur && !items.includes(cur)) { const i = $('uw-price'); if (i) i.focus(); return; } // the blank one on screen is the new one
  if (items.length >= MAX_SCRATCH) { toast(`There are ${MAX_SCRATCH} quick underwritings on this device: delete one first.`); return; }
  cur = fresh();
  draw();
  $('uw-price')?.focus();
}

async function removeCurrent() {
  const u = cur;
  await flush();
  if (!items.includes(u)) { cur = fresh(); draw(); return; }
  try { await enqueue(() => deleteScratch(u.id)); } catch (e) { toast(`The quick underwriting couldn’t be deleted, so it is still here: ${why(e)}`); return; }
  items = items.filter((x) => x !== u);
  cur = items[0] || fresh();
  draw();
  toast('Quick underwriting deleted.', { label: 'Undo', run: () => bringBack(u, 'Quick underwriting restored.') });
}

/** Put a record back in the list (Undo), where its date puts it, and open it. */
async function bringBack(u, message) {
  try { await enqueue(() => saveScratch(u)); } catch (e) { toast(`It couldn’t be brought back: ${why(e)}`); return false; }
  items = [...items.filter((x) => x.id !== u.id), u].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  cur = u;
  draw();
  toast(message);
  return true;
}

async function saveAsDeal() {
  const u = cur;
  if (!ok(u.figures.price) && !ok(u.figures.noi)) { toast('Type a price or an NOI first: there is nothing to save as a deal.'); return; }
  await flush();
  let d;
  try { d = await createDeal(dealFields(u), 'Created from a quick underwriting'); } catch (e) { toast(`The deal couldn’t be saved: ${e.message || e}`); return; }
  try { await enqueue(() => deleteScratch(u.id)); } catch (e) {
    // the deal exists and the quick underwriting is still stored: say so, and offer no Undo that would hide the duplicate
    await showDeal(d.id);
    toast(`Saved as a deal, but the quick underwriting couldn’t be removed (${why(e)}). It is still under Underwrite: delete it there.`, null, 9000);
    return;
  }
  items = items.filter((x) => x !== u);
  cur = items[0] || fresh();
  draw();
  await showDeal(d.id);
  toast('Saved as a deal. The quick underwriting is now this deal.', {
    label: 'Undo',
    // the quick underwriting comes back first: the deal is deleted only once it is safely stored again
    run: async () => { if (!(await bringBack(u, 'Undone: it is a quick underwriting again.'))) return; await discardDeal(d.id); api.showView('underwrite'); },
  });
}

export function initUnderwrite(compsApi) {
  api = compsApi;
  // a phone suspends a page it has hidden: the last edit goes to storage the moment the app leaves the screen
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', () => { flush(); });
  document.addEventListener('viewchange', () => { flush(); });
  loadScratch().then((r) => {
    // anything typed before the list arrived stays on screen, at the top of what was stored
    const mine = items.includes(cur) ? cur : null;
    items = mine ? [mine, ...r.items.filter((x) => x.id !== mine.id)] : r.items;
    hidden = r.hidden;
    if (mine) drawList(); else { cur = items[0] || cur; draw(); }
  }).catch(() => {});
  cur = fresh();
  draw();
}
