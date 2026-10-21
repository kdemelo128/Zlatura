/* reviewui.js -- the Review Queue: everything waiting for a person, across
 * deals and firm templates (review.js works out what). The Review tab shows
 * only when something is waiting, with a count, as the Deals tab does.
 * Each action records itself where the item lives: a deal's change goes in
 * its history (and can be undone); a template's in the template. */

import { el, toast, money0, localDate, actionSheet } from './kit.js';
import { reviewItems, reviewCount } from './review.js';
import { listAllDeals, updateDeal, showDeal, openTemplates } from './dealui.js';
import { listTemplates, putTemplate } from './library.js';
import { CATEGORY, markSeen, confirmSuggested, suggestionText, applyT12Fix } from './t12.js';
import { categorySelect, fileT12Line, lineChoices, suggestedText, fixButtons, fixLabel } from './t12ui.js';
import { rememberLabels } from './t12labels.js';
import { resolveCheck, resolveLabel } from './dataqc.js';
import { lineWithCell } from './dataqcui.js';
import { applyOmFix } from './omstatement.js';
import { applyHeldRows, addOcrRows } from './rentroll.js';

let visible = false;
let drawing = 0;
const $ = (id) => document.getElementById(id);
const usd = (x) => (typeof x === 'number' && Number.isFinite(x) ? (x < 0 ? `−${money0(-x)}` : money0(x)) : String(x ?? ''));

async function gather() {
  const [deals, templates] = await Promise.all([listAllDeals(), listTemplates()]);
  return reviewItems({ deals, templates });
}

/** The tab: shown only with something waiting, with how many. */
async function refreshTab(groups = null) {
  const g = groups || await gather();
  const n = reviewCount(g);
  document.querySelectorAll('.tab[data-view="review"]').forEach((t) => {
    t.hidden = n === 0 && !visible;
    const b = t.querySelector('.badge');
    b.hidden = !n;
    b.textContent = n ? String(n) : '';
    t.setAttribute('aria-label', n ? `Review, ${n} item${n === 1 ? '' : 's'} waiting` : 'Review');
  });
  return g;
}

async function render() {
  const root = $('review-root');
  if (!root) return;
  const ticket = ++drawing;
  const groups = await gather();
  if (ticket !== drawing) return;
  await refreshTab(groups);
  root.textContent = '';
  const head = el('div', 'view-head');
  head.appendChild(el('h1', null, 'Review'));
  const n = reviewCount(groups);
  head.appendChild(el('p', null, n ? `${n} item${n === 1 ? '' : 's'} waiting, most money at stake first. Each choice is recorded where it belongs, and on a deal it can be undone.` : 'Nothing is waiting. T-12 lines to file, T-12 figures that don’t add up, rent roll and operating statement checks from an OM, AI readings not yet applied and template cells mapped with low confidence appear here.'));
  root.appendChild(head);
  const stack = el('div', 'stack');
  for (const g of groups) stack.appendChild(groupCard(g));
  root.appendChild(stack);
}

function groupCard(g) {
  const c = el('section', 'card review-group');
  c.dataset.group = `${g.group}:${g.id}`;
  const h = el('div', 'card-head');
  h.appendChild(el('h2', null, g.name));
  h.appendChild(el('span', 'count', `${g.group === 'deal' ? 'Deal' : 'Firm template'} · ${g.items.length} item${g.items.length === 1 ? '' : 's'}`));
  const open = el('button', 'btn btn-sm btn-gray', g.group === 'deal' ? 'Open the deal' : 'Open the templates');
  open.type = 'button';
  open.addEventListener('click', () => (g.group === 'deal' ? showDeal(g.id) : openTemplates()));
  h.appendChild(open);
  c.appendChild(h);
  // two or more remembered labels waiting on one deal can be confirmed together, after seeing them listed
  const sugs = g.group === 'deal' ? g.items.filter((it) => it.kind === 't12line' && it.how === 'suggested' && !it.needs && it.suggested) : [];
  if (sugs.length >= 2) {
    const bulk = el('div', 'review-bulk');
    const b = el('button', 'btn btn-sm btn-gray t12-act', `Confirm all ${sugs.length} suggestions…`);
    b.type = 'button';
    b.dataset.act = 'confirm-all';
    b.addEventListener('click', () => confirmAll(g, sugs));
    bulk.appendChild(b);
    c.appendChild(bulk);
  }
  const ul = el('ul', 'review-list');
  for (const it of g.items) ul.appendChild(itemRow(g, it));
  c.appendChild(ul);
  return c;
}

/**
 * "Confirm all N suggestions": the labels listed first, then one step on the deal (one history entry, so one
 * Undo) and one write of the remembered labels. Lines that need classification are not in it: they move NOI
 * from one side to the other, so each is asked about.
 */
async function confirmAll(g, sugs) {
  const n = sugs.length;
  const v = await actionSheet(`Confirm all ${n} suggestions?`, [
    { label: `Confirm all ${n}`, sub: 'Each label is filed as suggested and remembered. One step on the deal: Undo takes it all back.', value: 'all', primary: true },
    '-',
    ...sugs.map((it) => ({ info: it.label, sub: `${usd(it.total)}${it.count > 1 ? ` · ${it.count} lines` : ''} → ${CATEGORY[it.suggested.category].label} · ${suggestionText(it.suggested)}` })),
  ]);
  if (v !== 'all') return;
  let filed = [];
  await updateDeal(g.id, (d) => {
    if (!d.t12) return false;
    filed = confirmSuggested(d.t12);
    return filed.length > 0;
  }, { kind: 'edit', label: `T-12: ${n} suggestion${n === 1 ? '' : 's'} confirmed` });
  if (filed.length) await rememberLabels(filed.map((x) => ({ key: x.key, category: x.category })), g.id);
  changed(`${filed.length} label${filed.length === 1 ? '' : 's'} filed as suggested. Undo on the deal takes it back.`);
}

function itemRow(g, it) {
  const li = el('li', `review-item review-${it.kind}`);
  li.dataset.item = it.id;
  const text = el('div', 'review-text');
  const acts = el('div', 'review-acts');
  const btn = (label, cls, fn) => { const b = el('button', `btn btn-sm ${cls}`, label); b.type = 'button'; b.addEventListener('click', fn); acts.appendChild(b); return b; };
  if (it.kind === 't12line' && (it.needs || it.how === 'suggested') && it.suggested) {
    text.append(el('b', null, `T-12 line: ${it.label}`), el('span', 'sub', ` ${usd(it.total)}${it.count > 1 ? ` · ${it.count} lines with this label` : ''} · ${it.needs ? 'needs classification' : 'to confirm'} · ${suggestedText(it)}`));
    const rem = el('label', 'check');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = true;
    rem.append(cb, ' Remember this label');
    const file = async (cat, verb) => {
      await updateDeal(g.id, async (d) => {
        if (!d.t12) return false;
        await fileT12Line(d, it.lineId, cat, { sameLabel: true, remember: cb.checked });
        return true;
      }, { kind: 'edit', label: `T-12: “${it.label}” ${verb} ${CATEGORY[cat].label.toLowerCase()}${it.count > 1 ? ` (${it.count} lines)` : ''}` });
      changed(`“${it.label}” filed under ${CATEGORY[cat].label.toLowerCase()}.`);
    };
    acts.append(lineChoices(it, { file, leave: () => toast(`“${it.label}” left unclassified. It stays here, and counts in no total until you file it.`) }), rem);
  } else if (it.kind === 't12line') {
    text.append(el('b', null, `T-12 line: ${it.label}`), el('span', 'sub', ` ${usd(it.total)}${it.count > 1 ? ` · ${it.count} lines with this label` : ''} · ${it.why}`));
    const sel = categorySelect({ category: null, candidates: it.candidates });
    sel.setAttribute('aria-label', `Category for ${it.label}`);
    const rem = el('label', 'check');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = true;
    rem.append(cb, ' Remember this label');
    const file = btn('File it', 'btn-primary', async () => {
      if (!sel.value) { sel.focus(); toast('Choose a category first.'); return; }
      const cat = sel.value;
      await updateDeal(g.id, async (d) => {
        if (!d.t12) return false;
        await fileT12Line(d, it.lineId, cat, { sameLabel: true, remember: cb.checked });
        return true;
      }, { kind: 'edit', label: `T-12: “${it.label}” filed under ${CATEGORY[cat].label.toLowerCase()}${it.count > 1 ? ` (${it.count} lines)` : ''}` });
      changed(`“${it.label}” filed under ${CATEGORY[cat].label.toLowerCase()}.`);
    });
    file.disabled = false;
    acts.prepend(sel);
    acts.appendChild(rem);
  } else if (it.kind === 't12note') {
    text.append(el('b', null, 'T-12: '), el('span', null, it.text));
    btn('Seen', 'btn-gray t12-act', async () => {
      await updateDeal(g.id, (d) => { if (!d.t12) return false; markSeen(d.t12, it.noteId); return true; }, { kind: 'edit', label: 'T-12: a note marked seen' });
      changed('Marked seen. The lines stay as they were.');
    }).dataset.act = 'note-seen';
  } else if (it.kind === 't12check') {
    text.append(el('b', null, `T-12 check${it.level === 'fail' ? ' failed' : ''}: `), el('span', null, it.text));
    if (it.where) text.append(el('span', 'sub', ` ${it.where}`));
    // each fix is one step on the deal (Undo takes it back); a Fail is cleared by a fix, never by "accept"
    const fix = async (f) => {
      let did = false;
      await updateDeal(g.id, (d) => { if (!d.t12) return false; did = applyT12Fix(d.t12, it.checkId, f.id); return did; }, { kind: 'edit', label: fixLabel({ id: it.checkId, kind: it.checkKind }, f) });
      if (did) changed(f.id === 'seen' ? 'Marked seen. It stays on the T-12 card.' : 'Done. Undo on the deal puts it back.');
    };
    for (const b of fixButtons({ fixes: it.fixes, level: it.level, kind: it.checkKind }, fix)) acts.appendChild(b);
  } else if (it.kind === 'rrcheck') {
    text.append(el('b', null, `Rent roll ${it.level === 'fail' ? 'check failed' : 'check'}: `), el('span', null, it.text));
    if (it.where) text.append(el('span', 'sub', ` ${it.where}`));
    if (it.lineText) { const q = el('code', 'qc-line', it.lineText); text.append(' ', q); }
    btn(resolveLabel({ level: it.level, kind: it.checkKind }), it.level === 'fail' ? 'btn-primary' : 'btn-gray', async () => {
      let applied = null;
      await updateDeal(g.id, (d) => {
        if (!d.rrQc || !resolveCheck(d.rrQc, it.checkId, 'accepted')) return false;
        const m = /^ocr:(\d+)$/.exec(it.checkId);
        if (m) applied = addOcrRows(d, Number(m[1]), localDate()) ? 'ocr' : null;
        else applied = applyHeldRows(d, localDate());
        return true;
      }, { kind: 'edit', label: `Rent roll check accepted: ${it.text.slice(0, 80)}${it.text.length > 80 ? '…' : ''}` });
      changed(applied === 'applied' ? 'Accepted. Every failed check is resolved, so the OM’s rent roll is now the deal’s.' : applied === 'ocr' ? 'Accepted. The rows read by OCR are added to the rent roll, marked OCR.' : applied === 'kept' ? 'Accepted. The deal’s rent roll already has units, so the OM’s rows were kept aside, not put over them.' : 'Accepted. It stays on the deal’s Data QC list.');
    });
  } else if (it.kind === 'omcheck') {
    text.append(el('b', null, `Operating statement ${it.level === 'fail' ? 'check failed' : 'check'}: `), el('span', null, it.text));
    if (it.where) text.append(el('span', 'sub', ` ${it.where}`));
    if (it.lineText) text.append(' ', lineWithCell({ lineText: it.lineText, cell: it.cell ? { text: it.cell, at: it.cellAt } : null }));
    const fix = async (f) => {
      /** @type {any} */
      let res = null;
      await updateDeal(g.id, (d) => { if (!d.omRead) return false; res = applyOmFix(d, it.checkId, f.id); return !!res; },
        { kind: 'edit', label: `Data QC: ${f.label} (${it.col || 'statement'}, page ${it.page})` });
      changed(res && res.applied.length ? `Done. ${res.applied.length === 1 ? 'The figure is' : `${res.applied.length} figures are`} now the deal’s; Undo on the deal puts it back.` : res && res.waiting.length ? 'Done. Another failed check still holds figures back.' : 'Done. It stays on the deal’s Data QC list.');
    };
    if (it.level === 'fail' && it.fixes.length) for (const f of it.fixes) btn(f.label, f.id === 'printed' ? 'btn-gray' : 'btn-primary', () => fix(f)).dataset.fix = f.id;
    else btn(resolveLabel({ level: it.level, kind: it.checkKind }), 'btn-gray', () => fix({ id: 'printed', label: it.level === 'fail' ? 'kept as printed' : 'marked right' }));
  } else if (it.kind === 'ai') {
    text.append(el('b', null, `AI reading not applied: ${it.label} ${typeof it.value === 'number' ? usd(it.value) : `“${it.value}”`}`), el('span', 'sub', ` ${it.doc}${it.page ? `, page ${it.page}` : ''}${it.status ? ` · ${it.status.replace(/-/g, ' ')}` : ''}`));
    btn('Dismiss', 'btn-gray', async () => {
      await updateDeal(g.id, (d) => { const f = d.ai && d.ai.extractions[it.ext] && d.ai.extractions[it.ext].fields[it.field]; if (!f) return false; f.dismissed = true; return true; }, { kind: 'edit', label: `AI reading of ${it.label.toLowerCase()} dismissed` });
      changed('Dismissed.');
    });
  } else if (it.kind === 'tpl') {
    text.append(el('b', null, `Template cell ${it.sheet}!${it.ref} → ${it.label}`), el('span', 'sub', ` mapped with low confidence${it.why ? `: ${it.why}` : ''}`));
    btn('It’s right', 'btn-gray', async () => {
      const list = await listTemplates();
      const t = list.find((x) => x.id === g.id);
      const cell = t && t.mapping.cells[it.cell];
      if (!cell) return;
      cell.confidence = 'high';
      cell.why = 'confirmed by you';
      try { await putTemplate(t); } catch (e) { toast(e.message); return; }
      changed('Confirmed.');
    });
  }
  li.append(text, acts);
  return li;
}

function changed(msg) {
  document.dispatchEvent(new CustomEvent('reviewchange'));
  toast(msg);
}

export function initReview() {
  document.addEventListener('viewchange', (e) => { visible = e.detail === 'review'; if (visible) render(); else refreshTab(); });
  const again = () => { if (visible) render(); else refreshTab(); };
  let timer = null;
  document.addEventListener('reviewchange', again);
  // a deal edit can add or settle items (a T-12 imported, a line filed on the deal screen): counted again once the typing stops
  document.addEventListener('dealchange', () => { clearTimeout(timer); timer = setTimeout(again, 300); });
  refreshTab();
}
