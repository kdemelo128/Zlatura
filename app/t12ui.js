/* t12ui.js -- the T-12 on the deal screen: import an operating statement,
 * see it by category, the NOI three ways, every line with its category (and
 * change it), and "Use the T-12's figures". The statement itself is worked
 * out in t12.js; dealui.js keeps the deal, its history and its saves, and
 * hands this module what it needs (`h`). */

import { el, toast, actionSheet, money0, money2, niceDate, getXlsx, getFflate } from './kit.js';
import { readGrids, pastedRows } from './sheetread.js';
import { checkUpload } from './filekind.js';
import {
  CATEGORIES, CATEGORY, SIDES, statementTotals, annualized, openLines, fileLine, periodText, rematch, sourceText, periodShort, lineNotes,
  statementNotes, markSeen, suggestionText, sheetChoices, pickSheet, layoutOf, numberFormatOf, importStatement, currencyRefusal,
  t12Qc, t12OpenChecks, heldBy, useHeldBy, applyT12Fix, windowOf, monthLabel, noiWithout, runRate,
  normalise, setMethod, METHOD_WORDS, METHOD_CHOICES, chipText, methodPreview, heldWords, bridgeRows, residueWords, NOTE_WORDS, normSource, normRefusal, partialAsReported,
} from './t12.js';
import { qcPanel } from './dataqcui.js';
import { qcCounts } from './dataqc.js';
import { remembered, rememberLabel } from './t12labels.js';
import { NOI_GAP } from './engine/conventions.js';
import { strictOpen, strictWords } from './review.js';

const ok = (x) => typeof x === 'number' && Number.isFinite(x);
const usd = (x) => (ok(x) ? (x < 0 ? `−${money0(-x)}` : money0(x)) : '—');
const usd2 = (x) => (ok(x) ? (x < 0 ? `−${money2(-x)}` : money2(x)) : '—');

/**
 * Draw the card into `box`. h: { deal, touch(meta), snapshot(reason), redraw(), rerender() (the whole deal screen),
 * sheetOpen, sheetClose(), openReview(), rrNoi1() → number | null | undefined (undefined: still being worked out) }.
 */
export function renderT12Card(box, h) {
  const d = h.deal;
  box.textContent = '';
  const head = el('div', 'card-head');
  head.appendChild(el('h2', null, 'Operating statement (T-12)'));
  box.appendChild(head);
  const t = d.t12;
  if (!t) {
    box.appendChild(el('p', 'hint', 'Import a trailing-12 operating statement (.xlsx or .csv). Each line goes in a standard category; lines it can’t place go to Review; its NOI is set beside the OM’s and the rent roll’s.'));
    box.appendChild(importButton(h, 'Import a T-12…', 'btn btn-primary'));
    box.appendChild(pasteButton(h, 'btn btn-gray', 'Paste a statement…'));
    return;
  }
  const T = statementTotals(t);
  const lines = openLines(t);
  const checks = t12OpenChecks(t);
  const held = heldBy(t);
  box.appendChild(el('p', 'sub', `${sourceText(t)} · ${periodText(t)} · imported ${niceDate(t.importedAt)}`));
  const n = t.months.length;
  if (n && n < 12) {
    const ann = t.applied && t.applied.annualized;
    const norm = t.applied && t.applied.normalised;
    const p = el('p', 'hint t12-partial', `A partial year: ${n} month${n === 1 ? '' : 's'}. The totals below are those months as read, not a year’s.${ann ? ` The deal uses them annualized (× 12 ÷ ${ann}), as you confirmed.` : ''}${norm ? ' The deal uses the normalised figures below, as you confirmed.' : ''}`);
    p.id = 't12-partial';
    box.appendChild(p);
  }
  if (lines.length || checks.length) {
    const p = el('p', 'warn-text t12-open');
    // a remembered label is a suggestion to confirm; a capital-type line under Expenses is one to classify; the rest are to file
    // (counted by label, as Review counts them: one choice files every line with that label)
    const labelsOf = (ls) => new Set(ls.map((l) => l.key)).size;
    const sug = labelsOf(lines.filter((l) => l.how === 'suggested' && !l.needs));
    const need = labelsOf(lines.filter((l) => l.needs));
    const rest = lines.filter((l) => l.how !== 'suggested' && !l.needs).length;
    const parts = [sug ? `${sug} suggestion${sug === 1 ? '' : 's'} to confirm` : '', need ? `${need} to classify` : '', rest ? `${rest} line${rest === 1 ? '' : 's'} to file` : '', checks.length ? `${checks.length} thing${checks.length === 1 ? '' : 's'} to check` : ''].filter(Boolean);
    p.append(`${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]}. `);
    const go = el('button', 'btn btn-sm btn-gray', 'Open Review');
    go.type = 'button';
    go.id = 't12-review';
    go.addEventListener('click', () => h.openReview());
    p.appendChild(go);
    box.appendChild(p);
  }

  // a month in two columns, more than 12 months, or running totals: the figures are held until the broker chooses
  if (held.length) {
    const p = el('p', 'warn-text t12-held', `Held back: ${held.map((c) => c.short).join('; ')}. The T-12’s figures aren’t shown or used until ${held.length === 1 ? 'it is' : 'each is'} settled in the Data QC below or in Review. `);
    p.id = 't12-held';
    p.setAttribute('role', 'status');
    const go = el('button', 'btn btn-sm btn-gray t12-act', 'Show the checks');
    go.type = 'button';
    go.id = 't12-held-show';
    go.addEventListener('click', () => showQc());
    p.appendChild(go);
    box.appendChild(p);
  }

  // a statement filed by an earlier version: its filings are kept as they were, and this says so once
  for (const n of statementNotes(t)) {
    const p = el('p', 'hint t12-note');
    p.id = 't12-note';
    p.append(n.text, ' ');
    const seen = el('button', 'btn btn-sm btn-gray t12-act', 'Seen');
    seen.type = 'button';
    seen.id = 't12-note-seen';
    seen.addEventListener('click', () => {
      markSeen(d.t12, n.id);
      h.touch({ kind: 'edit', label: 'T-12: a note marked seen' });
      h.redraw();
    });
    p.appendChild(seen);
    box.appendChild(p);
  }

  // by category: income, operating expenses, NOI; below the line apart
  const tbl = el('table', 'mini t12-table');
  tbl.id = 't12-summary';
  const cap = el('caption', 'sr-only', 'The T-12 by category');
  tbl.appendChild(cap);
  const tb = el('tbody');
  const row = (label, v, cls = '') => { const tr = el('tr', cls); tr.append(el('th', null, label), el('td', 'num', usd(v))); tr.firstChild.setAttribute('scope', 'row'); tb.appendChild(tr); };
  if (held.length) {
    // never the figure that would count a month twice, or read a file of more than 12 months as a year: said in words
    const why = `held: ${held.map((c) => c.short).join('; ')}`;
    for (const [label, cls] of [['Effective gross income', 'total'], ['Operating expenses', 'total'], ['NOI', 'total grand']]) {
      const tr = el('tr', cls); tr.append(el('th', null, label), el('td', 'num t12-held-cell', why)); tr.firstChild.setAttribute('scope', 'row'); tb.appendChild(tr);
    }
  } else {
    for (const side of ['income', 'expense']) {
      for (const c of CATEGORIES.filter((x) => x.side === side)) if (T.by[c.id]) row(c.label, T.by[c.id]);
      row(side === 'income' ? 'Effective gross income' : 'Operating expenses', side === 'income' ? T.egi : T.opex, 'total');
    }
    const noiLabel = n && n < 12 ? `NOI, ${n} month${n === 1 ? '' : 's'}` : 'NOI';
    row(lines.length ? `${noiLabel} (lines still to file are left out)` : noiLabel, T.noi, 'total grand');
    // beside the reported NOI, never in its place: what it would be without the one-offs the broker marked "Recurring? No"
    const without = noiWithout(t);
    if (without) { row('NOI without the one-offs you marked', without.noi, 'muted t12-noi-without'); }
    const below = CATEGORIES.filter((c) => c.side === 'below' && T.by[c.id]);
    if (below.length) {
      const tr = el('tr', 'sep'); const th = el('th', null, SIDES.below); th.colSpan = 2; tr.appendChild(th); tb.appendChild(tr);
      for (const c of below) row(c.label, T.by[c.id], 'muted');
    }
    if (lines.length) row('Not yet filed', T.unassigned, 'warn-text');
  }
  tbl.appendChild(tb);
  const wrap = el('div', 'scroll');
  wrap.appendChild(tbl);
  box.appendChild(wrap);

  box.appendChild(normCard(d, t, h, held));
  if (!held.length) box.appendChild(runRateSection(d, t, h));
  box.appendChild(qcSection(h));
  box.appendChild(noiThreeWays(d, T, h));

  const acts = el('div', 'row-actions');
  const all = el('button', 'btn btn-sm btn-gray', 'Every line');
  all.type = 'button';
  all.id = 't12-lines';
  all.addEventListener('click', () => openLinesSheet(h));
  const use = el('button', 'btn btn-sm', d.t12.applied ? 'Use the T-12’s figures again' : 'Use the T-12’s figures');
  use.type = 'button';
  use.id = 't12-use';
  use.addEventListener('click', () => useFigures(h));
  const remove = el('button', 'btn btn-sm btn-gray', 'Remove');
  remove.type = 'button';
  remove.id = 't12-remove';
  remove.addEventListener('click', async () => {
    const v = await actionSheet('Remove the T-12 from this deal?', [{ label: 'Remove it', sub: 'Figures already taken from it stay as they are. You can undo this.', value: 'yes', danger: true }]);
    if (v !== 'yes') return;
    const snap = h.snapshot('Before removing the T-12');
    delete d.t12;
    h.touch({ kind: 'edit', label: 'T-12 removed', snapshot: snap });
    h.redraw();
  });
  acts.append(all, use, importButton(h, 'Replace…', 'btn btn-sm btn-gray'), pasteButton(h, 'btn btn-sm btn-gray', 'Paste…'), remove);
  box.appendChild(acts);
}

/* ------------------------------------------- the Normalised NOI card (underwriting U2) */

/** The deals whose list of lines is open: a screen state, never saved. */
const linesOpen = new Set();

/** A step's signed amount: "+$51,429" / "−$2,350". */
const signed = (x) => (ok(x) ? (x < 0 ? `−${money0(-x)}` : `+${money0(x)}`) : '—');

/**
 * "Normalised NOI", under the totals: a list from the NOI as reported, through each method's step, to the normalised
 * NOI (a year), and a chip on each NOI line to choose how it counts. It sits beside the reported figure and replaces
 * nothing; every line starts as reported (today's screen). Held states say why in words, never a number.
 */
function normCard(d, t, h, held) {
  const sec = el('div', 't12-norm');
  sec.id = 't12-norm';
  sec.appendChild(el('h3', 'sec-label', 'Normalised NOI'));
  const res = normalise(t);
  if (held.length) {
    const p = el('p', 'hint t12-norm-held', `Not worked out: ${heldWords(t, res)}.`);
    p.id = 't12-norm-held';
    sec.appendChild(p);
    useNormButton(sec, h, t, res);
    return sec;
  }
  sec.appendChild(el('p', 'hint', 'A year’s NOI if each line counted the way you choose. The NOI as reported above stays as it is, and nothing changes on the deal until you use these figures.'));
  const ol = el('ol', 't12-bridge');
  ol.id = 't12-bridge';
  for (const r of bridgeRows(t, res) || []) {
    const li = el('li', `t12-step${r.key === 'normalised' ? ' total' : ''}`);
    li.dataset.step = r.key;
    const lab = el('span', 't12-step-label');
    lab.appendChild(el('b', null, r.label));
    if (r.sub) lab.appendChild(el('span', 'sub', r.sub));
    li.append(lab, el('span', 'num', r.amount === null ? 'not worked out' : r.key === 'reported' || r.key === 'normalised' ? usd(r.amount) : signed(r.amount)));
    ol.appendChild(li);
  }
  sec.appendChild(ol);
  if (res.held) {
    const p = el('p', 'warn-text t12-norm-held', `Not worked out: ${heldWords(t, res)}. `);
    p.id = 't12-norm-held';
    p.setAttribute('role', 'status');
    const box = el('div', 't12-line-acts');
    for (const c of t12OpenChecks(t).filter((x) => res.asks.includes(x.id))) for (const b of fixButtons(c, (f) => runFix(h, c, f))) box.appendChild(b);
    sec.append(p, box);
  }
  const resid = residueWords(res);
  if (resid) { const p = el('p', 'hint t12-norm-note', resid); p.id = 't12-norm-note'; sec.appendChild(p); }
  const mixed = partialAsReported(t, res).length;
  if (mixed) sec.appendChild(el('p', 'hint t12-norm-mixed', `${mixed} line${mixed === 1 ? ' is' : 's are'} still as reported over ${t.months.length} month${t.months.length === 1 ? '' : 's'}, not a year’s, so the normalised NOI mixes the two.`));

  // a chip on each line that is in NOI
  const noiLines = res.lines.filter((x) => x.side === 'income' || x.side === 'expense');
  const set = noiLines.filter((x) => x.method !== 'reported').length;
  const det = el('details', 't12-norm-lines');
  det.id = 't12-norm-lines';
  det.open = linesOpen.has(d.id);
  det.addEventListener('toggle', () => { if (det.open) linesOpen.add(d.id); else linesOpen.delete(d.id); });
  det.appendChild(el('summary', null, `How each line counts (${noiLines.length} lines${set ? `, ${set} changed` : ''})`));
  for (const x of noiLines) {
    const r = el('div', 't12-nline');
    const lab = el('div', 't12-line-label');
    lab.append(el('b', null, x.label), el('span', 'sub', ` ${usd2(x.reported)} as reported${x.notes.map((k) => ` · ${NOTE_WORDS[k] || k}`).join('')}${x.amount !== null && x.method !== 'reported' ? ` · ${usd2(x.amount)} counted` : ''}`));
    const chip = el('button', 'btn btn-sm btn-gray t12-act t12-chip', chipText(x.method));
    chip.type = 'button';
    chip.dataset.line = x.id;
    chip.dataset.method = x.method;
    chip.setAttribute('aria-label', `${chipText(x.method)}: ${x.label}. Change`);
    chip.addEventListener('click', () => chooseMethod(h, x));
    r.append(lab, chip);
    det.appendChild(r);
  }
  sec.appendChild(det);

  useNormButton(sec, h, t, res);
  return sec;
}

/** "Use normalised figures": the existing "Use the T-12's figures" flow with its own confirmation; disabled, with the reason beside it, while it is refused. */
function useNormButton(sec, h, t, res) {
  const so = strictOpen(h.deal);
  const why = normRefusal(t, res) || (so ? strictWords(so) : '');
  const use = el('button', 'btn btn-sm t12-act', 'Use normalised figures');
  use.type = 'button';
  use.id = 't12-norm-use';
  use.disabled = !!why;
  use.addEventListener('click', () => useFigures(h, true));
  const acts = el('div', 'row-actions');
  acts.appendChild(use);
  sec.appendChild(acts);
  if (why) { const p = el('p', 'hint t12-norm-why', why); p.id = 't12-norm-why'; use.setAttribute('aria-describedby', 't12-norm-why'); sec.appendChild(p); }
}

/** "Counts: …" tapped: the four methods, each with the annual amount it would give; one history step per choice. */
async function chooseMethod(h, x) {
  const d = h.deal;
  const t = d.t12;
  const n = t.months.length;
  const items = METHOD_CHOICES.map((m) => {
    const cur = x.method === m.id;
    const p = methodPreview(t, x.id, m.id);
    const sub = p.amount === null
      ? `Not yet: ${p.notes.includes('nomonths') ? 'this statement has no month columns' : heldWords(t, { held: p.held, asks: p.asks })}.`
      : m.id === 'reported' ? `${usd2(p.amount)} as reported${n < 12 ? `, ${n} month${n === 1 ? '' : 's'}, not a year` : ''}` : `${usd2(p.amount)} a year${p.notes.includes('norun') ? ' (no month has an amount)' : ''}`;
    return { label: cur ? `${m.label} (now)` : m.label, sub, value: m.id, disabled: p.amount === null && !cur, primary: cur };
  });
  const v = await actionSheet(`How should “${x.label}” count?`, items);
  if (!v || v === x.method || h.deal !== d || d.t12 !== t) return;
  if (!setMethod(t, x.id, v)) return;
  h.touch({ kind: 'edit', label: `T-12: “${x.label}” counts ${METHOD_WORDS[v]}` });
  h.redraw();
}

/* ------------------------------------------------- the T-12 Data QC panel */

/** What an action sheet asks, for the fixes of a check of each kind. */
const FIX_TITLE = { duplicate: 'Which column counts?', long: 'Which 12 months are the T-12?', chosen: 'Which 12 months are the T-12?', cumulative: 'How are the columns read?', active: 'Annualise over which months?', oneoff: 'Recurring?' };

/** The history entry for a fix: "T-12: Use column N for Dec 2025". */
export function fixLabel(c, f) {
  if (f.id.startsWith('rec:')) return `T-12: ${c.where ? `${c.where} ` : ''}marked ${f.id === 'rec:yes' ? 'recurring' : 'not recurring'}`;
  if (c.kind === 'quarterends' && f.id === 'seen') return 'T-12: the columns are single months';
  if (f.id === 'seen') return c.id.startsWith('stated.') ? `T-12: ${f.label}` : 'T-12: a check marked seen';
  if (c.kind === 'duplicate') return `T-12: ${f.label} for ${monthLabel(c.id.slice('period.dup.'.length))}`;
  return `T-12: ${f.label}`;
}

/**
 * The buttons a T-12 check offers (44 pt high): each of its fixes, and one "Change…" (an action sheet) for the
 * fixes flagged `more`. Shared by the Data QC panel and the Review Queue. `run(fix)` applies one.
 * @param {any} c  a check from t12.js t12Qc, or a Review item carrying `fixes`, `kind` and `level`
 * @param {(fix: any) => any} run
 */
export function fixButtons(c, run) {
  const out = [];
  const fixes = c.fixes || [];
  fixes.filter((f) => !f.more).forEach((f, i) => {
    const b = el('button', `btn btn-sm t12-act t12-fix ${i === 0 && c.level === 'fail' ? 'btn-primary' : 'btn-gray'}`, f.label);
    b.type = 'button';
    b.dataset.fix = f.id;
    b.addEventListener('click', () => run(f));
    out.push(b);
  });
  const more = fixes.filter((f) => f.more);
  if (more.length) {
    const b = el('button', 'btn btn-sm btn-gray t12-act t12-fix', 'Change…');
    b.type = 'button';
    b.dataset.fix = 'change';
    b.addEventListener('click', async () => {
      const v = await actionSheet(FIX_TITLE[c.checkKind || c.kind] || 'Change', more.map((f) => ({ label: f.label, value: f.id })));
      const f = more.find((x) => x.id === v);
      if (f) run(f);
    });
    out.push(b);
  }
  return out;
}

/** A fix applied on the deal screen: one history entry (Undo takes it back), then the card is drawn again. */
function runFix(h, c, f) {
  const d = h.deal;
  // "Not sure" stores nothing: the Note stays open, and there is no history step to undo
  if (f.id === 'rec:notsure') { toast('Left as it is: the note stays open until you answer.'); return; }
  if (!d.t12 || !applyT12Fix(d.t12, c.id, f.id)) return;
  h.touch({ kind: 'edit', label: fixLabel(c, f) });
  h.redraw();
}

/* ------------------------------------------------------ the run rate */

/** The deals whose run rate is on show: a screen state, never saved, so it is off whenever the app is opened again. */
const rateOn = new Set();

/**
 * "Show a run rate", on request, for a statement of fewer than 12 months: its totals × 12 ÷ its months beside the
 * figures as read, headed "run rate … not a T-12". It reaches nothing on the deal; only "Use the T-12's figures"
 * → "Annualize it, then use" does, after its own confirmation.
 */
function runRateSection(d, t, h) {
  const box = el('div', 't12-rate');
  const om = d.t12.applied ? d.t12.applied.before.noi : d.figures.noi;
  const r = runRate(t, { omNoi: ok(om) ? om : null });
  if (!r) return box;
  const on = rateOn.has(d.id);
  const toggle = el('button', 'btn btn-sm btn-gray t12-act', on ? 'Hide the run rate' : 'Show a run rate');
  toggle.type = 'button';
  toggle.id = 't12-rate-toggle';
  toggle.setAttribute('aria-expanded', String(on));
  toggle.addEventListener('click', () => { if (rateOn.has(d.id)) rateOn.delete(d.id); else rateOn.add(d.id); h.redraw(); });
  box.appendChild(toggle);
  if (!on) return box;
  const T = statementTotals(t);
  const tbl = el('table', 'mini t12-rate-table');
  tbl.id = 't12-runrate';
  tbl.appendChild(el('caption', 'sr-only', 'A run rate, which is not a T-12'));
  const hr = el('tr');
  for (const x of ['', `As read (${periodText(t)})`, r.heading]) { const c = el('th', null, x); c.setAttribute('scope', 'col'); if (!x) c.appendChild(el('span', 'sr-only', 'Figure')); hr.appendChild(c); }
  const th = el('thead'); th.appendChild(hr); tbl.appendChild(th);
  const tb = el('tbody');
  for (const [label, a, b, cls] of [['Effective gross income', T.egi, r.egi], ['Operating expenses', T.opex, r.opex], ['Real estate taxes', T.taxes, r.taxes], ['NOI', T.noi, r.noi, 'grand']]) {
    const tr = el('tr', cls || ''); const hd = el('th', null, label); hd.setAttribute('scope', 'row');
    tr.append(hd, el('td', 'num', usd(a)), el('td', 'num', usd(b)));
    tb.appendChild(tr);
  }
  tbl.appendChild(tb);
  const wrap = el('div', 'scroll');
  wrap.appendChild(tbl);
  box.appendChild(wrap);
  for (const l of r.lumps) { const p = el('p', 'hint t12-lump', l.text); box.appendChild(p); }
  if (r.om) { const p = el('p', 'hint t12-rate-om', r.om.text); p.id = 't12-rate-om'; box.appendChild(p); }
  box.appendChild(el('p', 'hint', 'A run rate is a screen figure, not a T-12 and not kept: it changes nothing on the deal. “Use the T-12’s figures” → “Annualize it, then use” is the one way to put an annualized figure in.'));
  return box;
}

/** The panel, folded to one line when nothing is waiting (as the OM's is). */
function qcSection(h) {
  const t = h.deal.t12;
  const qc = t12Qc(t);
  const n = qcCounts(qc);
  const panel = qcPanel({
    id: 'deal-t12qc', title: 'Data QC: T-12', qc,
    intro: `${qc.intro ? `${qc.intro} ` : ''}Each check the statement’s own columns and totals were put through; a Fail or a held reading waits for your choice here or in Review.${noiWithout(t) ? ` ${noiWithout(t).text}; the reported NOI above is unchanged.` : ''}`,
    extra: (c) => (c.resolved ? [] : fixButtons(c, (f) => runFix(h, c, f))),
  });
  if (n.open) return panel;
  const det = el('details', 'qc-fold');
  det.id = 'deal-t12qc-fold';
  det.appendChild(el('summary', null, `Data QC: T-12 · ${[n.pass && `${n.pass} pass`, n.info && `${n.info} note${n.info === 1 ? '' : 's'}`, n.fail + n.warn && `${n.fail + n.warn} resolved`].filter(Boolean).join(' · ')}`));
  det.appendChild(panel);
  return det;
}

/** Scroll to the panel (opening its fold) and put focus on it. */
function showQc() {
  const fold = document.getElementById('deal-t12qc-fold');
  if (fold) fold.open = true;
  const box = document.getElementById('deal-t12qc');
  if (!box) return;
  box.tabIndex = -1;
  box.scrollIntoView({ block: 'center' });
  box.focus({ preventScroll: true });
}

/** The NOI three ways: the OM's, the T-12's and the rent roll's forward-looking year 1, with the gaps. */
function noiThreeWays(d, T, h) {
  const sec = el('div', 't12-noi');
  sec.appendChild(el('h3', 'sec-label', 'NOI three ways'));
  const om = d.t12.applied ? d.t12.applied.before.noi : d.figures.noi;
  const rr = h.rrNoi1();
  const partial = d.t12.months.length && d.t12.months.length < 12;
  const held = heldBy(d.t12).length > 0;
  // strict review: the gap is shown, but not compared while a check is open (underwriting.md 3.4)
  const strict = !held && strictOpen(d) > 0;
  const rows = [
    ['OM', 'as read or typed', om],
    ['T-12', held ? 'not compared: a T-12 check is open' : strict ? 'not compared: checks open' : partial ? `${periodText(d.t12)}: not a full year, so not compared` : periodText(d.t12), held || T.unassigned || openLines(d.t12).length ? null : T.noi],
    ['Rent roll, forward-looking year 1', 'a projection, not an actual', rr],
  ];
  const tbl = el('table', 'mini t12-noi-table');
  tbl.id = 't12-noi';
  const cap = el('caption', 'sr-only', 'NOI three ways, and the gap from the T-12’s');
  tbl.appendChild(cap);
  const th = el('thead'); const hr = el('tr');
  for (const x of ['', 'NOI', 'Gap from the T-12’s']) { const c = el('th', null, x); c.setAttribute('scope', 'col'); if (!x) c.appendChild(el('span', 'sr-only', 'Source')); hr.appendChild(c); }
  th.appendChild(hr); tbl.appendChild(th);
  const tb = el('tbody');
  for (const [who, what, v] of rows) {
    const tr = el('tr');
    const name = el('th', null, who); name.setAttribute('scope', 'row');
    name.appendChild(el('div', 'sub', what));
    const val = el('td', 'num', v === undefined ? 'working out…' : usd(v));
    let g = '';
    let cls = '';
    if (who !== 'T-12' && ok(v) && ok(T.noi) && !T.unassigned && !openLines(d.t12).length && !partial && !held) {
      const base = Math.max(Math.abs(v), Math.abs(T.noi));
      const pc = base ? (Math.abs(v - T.noi) / base) * 100 : 0;
      g = `${v >= T.noi ? '+' : '−'}${money0(Math.abs(v - T.noi))} (${pc.toFixed(1)}%)`;
      cls = pc > NOI_GAP.warn ? 'warn-text' : pc >= NOI_GAP.agree ? 'info-text' : 'good-text';
      g += pc < NOI_GAP.agree ? ' · agrees' : pc > NOI_GAP.warn ? ' · warning' : ' · noted';
    }
    tr.append(name, val, el('td', `num ${cls}`, g));
    tb.appendChild(tr);
  }
  tbl.appendChild(tb);
  const wrap = el('div', 'scroll');
  wrap.appendChild(tbl);
  sec.appendChild(wrap);
  sec.appendChild(el('p', 'hint', `Within ${NOI_GAP.agree}% they agree; ${NOI_GAP.agree}% to ${NOI_GAP.warn}% is noted; above ${NOI_GAP.warn}% is a warning in “What doesn’t add up”.`));
  return sec;
}

function pasteButton(h, cls, label) {
  const b = el('button', cls, label);
  b.type = 'button';
  b.id = h.deal.t12 ? 't12-paste-open-replace' : 't12-paste-open';
  b.addEventListener('click', () => pasteStatement(h));
  return b;
}

/**
 * "Paste a statement": rows copied from Excel (tabs) or a PDF (runs of two or more spaces) are read like any
 * other statement, marked as pasted and medium confidence. Nothing is kept until the broker taps Read it.
 */
export function pasteStatement(h) {
  const d = h.deal;
  const body = h.sheetOpen({ eyebrow: 'T-12', title: 'Paste a statement', sub: 'Copy the rows from Excel (or a PDF), including the row of month headings, and paste them here.' });
  const ta = el('textarea', 'input t12-paste');
  ta.id = 't12-paste';
  ta.rows = 10;
  ta.spellcheck = false;
  ta.setAttribute('aria-label', 'The statement, pasted');
  const go = el('button', 'btn btn-primary', 'Read it');
  go.type = 'button';
  go.id = 't12-paste-go';
  go.addEventListener('click', async () => {
    const rows = pastedRows(ta.value);
    if (!rows.length) { toast('Paste the statement’s rows first.'); return; }
    go.disabled = true;
    try {
      const mem = await remembered();
      const t = await statementFrom({ sheet: 'Pasted', rows }, 'Pasted statement', mem, { type: 'paste', size: ta.value.length });
      if (!t) return; // the number question was cancelled
      h.sheetClose();
      keepStatement(h, d, t, null);
    } catch (e) {
      toast(/months or total column/i.test(e.message || '') ? 'No row of month headings was found. Copy the cells from Excel, or line the columns up with two or more spaces, and include the heading row.' : (e.message || String(e)), null, 9000);
    } finally { go.disabled = false; }
  });
  const acts = el('div', 'row-actions');
  acts.appendChild(go);
  body.append(ta, acts);
}

function importButton(h, label, cls) {
  const b = el('button', cls, label);
  b.type = 'button';
  b.id = h.deal.t12 ? 't12-replace' : 't12-import';
  b.addEventListener('click', () => {
    const inp = el('input');
    inp.type = 'file';
    inp.accept = '.xlsx,.xlsm,.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12';
    inp.id = 't12-file';
    inp.hidden = true;
    inp.addEventListener('change', () => { const f = inp.files[0]; inp.remove(); if (f) importFile(h, f); });
    document.body.appendChild(inp);
    inp.click();
  });
  return b;
}

/** Read a file as a T-12 and keep it on the deal: one history entry, a snapshot first when one is replaced. */
export async function importFile(h, file) {
  const d = h.deal;
  let t;
  let note = null;
  try {
    // what the file is comes from its bytes and size, never its name; nothing is read whole before this passes
    const up = await checkUpload(file, { getFflate });
    if (up.refuse) { toast(up.refuse, null, 9000); return; }
    const grids = await readGrids(file, getXlsx, { maxRows: 1500, includeHidden: true, upload: up, getFflate });
    note = grids[0] && grids[0].note;
    const mem = await remembered();
    const choices = sheetChoices(grids, { file: file.name, corrections: mem.corrections, history: mem.history });
    const p = pickSheet(choices);
    if (p.refuse) throw new Error(p.refuse);
    const pick = p.choice || await chooseSheet(file.name, p.ask);
    if (!pick) return; // cancelled: nothing is imported
    const g = grids[pick.i];
    const type = up.kind === 'text' ? (g.delimiter === '\t' ? 'tsv' : 'csv') : up.macros ? 'xlsm' : 'xlsx';
    t = await statementFrom(g, file.name, mem, {
      type, size: file.size, sheets: choices.map((c) => ({ name: c.sheet, hidden: c.hidden, projection: c.projection, lines: c.lines })),
      ...(g.delimiter ? { delimiter: g.delimiter } : {}), ...(g.encoding ? { encoding: g.encoding } : {}), ...(up.macros ? { macros: true } : {}),
    });
    if (!t) return; // the number question was cancelled
  } catch (e) { toast(e.message || String(e), null, 9000); return; }
  keepStatement(h, d, t, note);
  // the file it read goes in the deal's Documents list (ddui.js), counted by the statement's own period checks
  if (h.registerRead && h.deal === d && d.t12 === t) h.registerRead(file, { reader: 't12', target: 't12', type: 't12', kind: ['csv', 'tsv'].includes(t.source && t.source.type) ? 'csv' : 'xlsx', pages: null, checks: qcCounts(t12Qc(t)) });
}

/** Which sheet of a workbook with several statements; null when cancelled. Projections are listed, not choosable. */
async function chooseSheet(file, list) {
  const v = await actionSheet(`Which sheet of ${file} is the T-12?`, list.map((c) => ({
    label: c.sheet,
    sub: c.projection ? 'projection, not actuals' : `${periodShort(c.period)} · ${c.lines} line${c.lines === 1 ? '' : 's'}${c.hidden ? ' · hidden sheet' : ''}`,
    value: c.i, disabled: c.projection,
  })));
  return v === null ? null : list.find((c) => c.i === v) || null;
}

/**
 * A grid of cells read into the statement the deal keeps: its currency checked (a sign other than $ is
 * refused), its number format settled (asked when the cells can't say), then read. null when the
 * question is cancelled; throws with a reason when it can't be read.
 */
async function statementFrom(grid, file, mem, source) {
  const layout = layoutOf(grid.rows, { sheet: grid.sheet });
  const nf = numberFormatOf(grid.rows, layout, { delimiter: source.delimiter });
  if (nf.foreign) throw new Error(currencyRefusal(nf.foreign));
  let format = nf.format;
  if (nf.ask) {
    format = await askFormat(file, nf);
    if (!format) return null;
  }
  return importStatement(grid.rows, { file, sheet: grid.sheet, corrections: mem.corrections, history: mem.history, numberFormat: format, source: { ...source, ...(nf.ask ? { numberAsked: true } : {}) } });
}

/** "How are numbers written in <file>?": the doubtful figures read both ways, one tap each; null when cancelled. */
function askFormat(file, nf) {
  const show = (n) => (Number.isFinite(n) ? money2(n) : 'not a number');
  const sub = (which) => nf.samples.map((s) => `${s.text} → ${show(s[which])}`).join(' · ');
  return actionSheet(`How are numbers written in ${file}?${nf.ask === 'mixed' ? ' It writes them two ways, so some figures will not read.' : ''}`, [
    { label: 'Comma for thousands, point for cents', sub: sub('us'), value: 'us' },
    { label: 'Point for thousands, comma for cents', sub: sub('eu'), value: 'eu' },
  ]);
}

/** Put a read statement on the deal: one history entry, a snapshot first when one is replaced; then the toast. */
function keepStatement(h, d, t, note) {
  if (h.deal !== d) return; // another deal was opened meanwhile
  const snap = d.t12 ? h.snapshot('Before replacing the T-12') : null;
  d.t12 = t;
  const open = openLines(t).length;
  const n = t.lines.length;
  h.touch({ kind: 'import', label: `T-12 imported: ${n} line${n === 1 ? '' : 's'}${open ? `, ${open} to file` : ''}`, snapshot: snap });
  h.redraw();
  // a CSV that wasn't plain UTF-8 says how it was read (textfile.js), and stays up longer
  toast(`T-12 read: ${n} line${n === 1 ? '' : 's'}, ${periodText(t)}.${open ? ` ${open} line${open === 1 ? '' : 's'} to file in Review.` : ''}${note ? ` ${note}` : ''}`, open ? { label: 'Review', run: () => h.openReview() } : null, note ? 15000 : 7000);
}

/** File a line (and the others with its label), remembering the label when asked. Shared with the Review Queue. */
export async function fileT12Line(d, lineId, category, { sameLabel = true, remember = true } = {}) {
  const line = d.t12.lines.find((l) => l.id === lineId);
  const changed = fileLine(d.t12, lineId, category, { sameLabel });
  if (remember && line) {
    await rememberLabel(line.key, category, d.id);
    // other lines of this statement still waiting are offered the remembered choice too (never filed by it)
    const mem = await remembered();
    d.t12 = rematch(d.t12, mem.corrections, mem.history);
  }
  return { line, changed };
}

/** "Suggested: Other income, mapped this way in 6 of your last 7 deals" / "Suggested: below the line, Capital expenditures". */
export function suggestedText(l) {
  if (!l.suggested) return '';
  const c = CATEGORY[l.suggested.category];
  return l.suggested.from === 'wording' ? `Suggested: below the line, ${c.label}` : `Suggested: ${c.label}, ${suggestionText(l.suggested)}`;
}

/**
 * The choices for a line waiting on the broker, as buttons (44 pt high), shared by the lines sheet and the
 * Review Queue. A suggestion from a remembered label: Confirm, or Choose another (a picker). A capital-type
 * line under Expenses or no heading: Below the line (as suggested), Keep in operating… (a picker of operating
 * categories only), or Leave unclassified (records nothing; the line stays out of every total). Any other line:
 * the picker. `file(category, verb)` files it; `leave()` is Leave unclassified.
 * @param {any} l
 * @param {{ file: (category: string, verb: string) => any, leave: () => any }} act
 */
export function lineChoices(l, { file, leave }) {
  const box = el('div', 't12-line-acts');
  const btn = (text, act, cls, fn) => {
    const b = el('button', `btn btn-sm t12-act ${cls}`, text);
    b.type = 'button';
    b.dataset.act = act;
    b.setAttribute('aria-label', `${text}: ${l.label}`);
    b.addEventListener('click', fn);
    box.appendChild(b);
  };
  const picker = (sel, verb) => {
    sel.classList.add('t12-act');
    sel.setAttribute('aria-label', `Category for ${l.label}`);
    sel.addEventListener('change', () => { if (sel.value) file(sel.value, verb); });
    return sel;
  };
  const swap = (sel) => { box.textContent = ''; box.appendChild(sel); sel.focus(); };
  if (l.needs && l.suggested) {
    btn('Below the line', 'below', 'btn-primary', () => file(l.suggested.category, 'filed below the line as'));
    btn('Keep in operating…', 'keep', 'btn-gray', () => swap(picker(categorySelect({ category: null, candidates: [] }, { sides: ['expense'], none: 'Choose an operating category…' }), 'kept in operating as')));
    btn('Leave unclassified', 'leave', 'btn-gray', leave);
  } else if (l.how === 'suggested' && l.suggested) {
    btn('Confirm', 'confirm', 'btn-primary', () => file(l.suggested.category, 'confirmed as'));
    btn('Choose another', 'other', 'btn-gray', () => swap(picker(categorySelect({ category: null, candidates: (l.candidates || []).filter((c) => c !== l.suggested.category) }), 'filed under')));
  } else {
    box.appendChild(picker(categorySelect(l), 'filed under'));
  }
  return box;
}

/** Every line, with its category: a choice per line. */
function openLinesSheet(h) {
  const d = h.deal;
  const body = h.sheetOpen({ eyebrow: 'T-12', title: 'Every line', sub: `${d.t12.lines.length} lines · ${periodText(d.t12)}. Change a category here; “Remember” files the same label the same way next time.` });
  const list = el('div', 't12-lines');
  for (const l of d.t12.lines) {
    const r = el('div', `t12-line${l.category ? '' : ' open'}`);
    const lab = el('div', 't12-line-label');
    const how = l.how === 'yours' ? 'your earlier choice' : l.how === 'you' ? 'chosen here' : l.how === 'rule' ? 'by its wording' : l.how === 'suggested' ? `to confirm · ${suggestedText(l)}` : l.how === 'needs' ? `needs classification · ${suggestedText(l)}` : `to file: ${l.why}`;
    lab.append(el('b', null, l.label), el('span', 'sub', ` ${usd(l.total)}${l.account ? ` · ${l.account}` : ''} · ${how}${lineNotes(d.t12, l).map((x) => ` · ${x}`).join('')}`));
    const file = async (category, verb) => {
      const was = l.category; // fileLine changes the line itself
      const { changed } = await fileT12Line(d, l.id, category, { sameLabel: true, remember: true });
      h.touch({ kind: 'edit', label: `T-12: “${l.label}” ${was ? 'filed under' : verb} ${CATEGORY[category].label.toLowerCase()}${changed.length > 1 ? ` (and ${changed.length - 1} more with that label)` : ''}` });
      h.redraw();
      openLinesSheet(h);
    };
    r.append(lab, l.category ? lineChoices(l, { file, leave: () => {} }) : lineChoices(l, { file, leave: () => { h.sheetClose(); toast(`“${l.label}” left unclassified. It counts in no total until you file it.`); } }));
    list.appendChild(r);
  }
  body.appendChild(list);
}

/**
 * A category picker, its likely categories first. `sides` limits it to those sides of the statement
 * (operating expenses only, for a line kept in operating); `none` words the empty choice.
 * @param {any} l
 * @param {{ sides?: string[], none?: string }} [opts]
 */
export function categorySelect(l, { sides = ['income', 'expense', 'below'], none: noneText = 'Choose a category…' } = {}) {
  const sel = el('select', 'select');
  const none = el('option', null, l.category ? '' : noneText);
  none.value = '';
  if (!l.category) sel.appendChild(none);
  const first = (l.candidates || []).filter((c) => CATEGORY[c] && c !== l.category && sides.includes(CATEGORY[c].side));
  const add = (parent, c) => { const o = el('option', null, c.label); o.value = c.id; if (c.id === l.category) o.selected = true; parent.appendChild(o); };
  if (first.length && !l.category) {
    const g = el('optgroup'); g.label = 'Likely';
    for (const id of first) add(g, CATEGORY[id]);
    sel.appendChild(g);
  }
  for (const side of sides) {
    const g = el('optgroup'); g.label = SIDES[side];
    for (const c of CATEGORIES.filter((x) => x.side === side)) add(g, c);
    sel.appendChild(g);
  }
  return sel;
}

/**
 * "Use normalised figures" (underwriting U2): the same flow as "Use the T-12's figures", with the same refusals and its
 * confirmation (each figure, old → new), one undoable step. The normalised figures are a year's, so there is no
 * partial-year question; the as-reported NOI stays on the card beside them.
 */
async function useNormalised(h) {
  const d = h.deal;
  const t = d.t12;
  const res = normalise(t); // worked out again: the card may be old
  const so = strictOpen(d);
  const why = normRefusal(t, res) || (so ? strictWords(so) : '');
  if (why) { toast(`${why} The normalised figures aren’t used.`, openLines(t).length ? { label: 'Review', run: () => h.openReview() } : { label: 'Show', run: () => showQc() }, 9000); return; }
  const vals = /** @type {{ egi: number, opex: number, taxes: number, noi: number }} */ (res.normalised);
  const sets = [['gross', 'Gross income (EGI)', vals.egi], ['opex', 'Operating expenses', vals.opex], ['taxes', 'Real estate taxes', vals.taxes], ['noi', 'NOI, normalised', vals.noi]];
  const what = sets.map(([k, label, v]) => `${label}: ${usd(d.figures[k])} → ${usd(v)}`).join(' · ');
  const label = normSource(res);
  const n = t.months.length;
  const mixed = n < 12 ? res.lines.filter((x) => x.method === 'reported' && x.side && x.reported).length : 0;
  const caveat = `${label}. The NOI as reported (${usd(res.reported.noi)}) stays on the T-12 card beside it.${mixed ? ` ${mixed} line${mixed === 1 ? ' is' : 's are'} still as reported over ${n} month${n === 1 ? '' : 's'}, not a year’s.` : ''}`;
  /** @type {any[]} */
  const opts = [{ label: 'Use them', sub: `${what}. ${caveat}`, value: 'deal', primary: true }];
  if (d.rr && d.rr.leases && d.rr.leases.length) opts.push({ label: 'Use them, and the rent roll’s operating expenses too', sub: `The rent roll’s operating expenses: ${usd(d.rr.settings.opex)} → ${usd(vals.opex)}.`, value: 'both' });
  const v = await actionSheet('Use the normalised figures?', opts);
  if (!v || h.deal !== d || d.t12 !== t) return;
  const snap = h.snapshot('Before using the T-12’s normalised figures');
  const before = t.applied ? t.applied.before : { noi: d.figures.noi ?? null, gross: d.figures.gross ?? null, opex: d.figures.opex ?? null, taxes: d.figures.taxes ?? null };
  t.applied = { at: Date.now(), before, rrOpex: v === 'both', normalised: true, counts: { ...res.counts }, n: res.n };
  for (const [k, , val] of sets) {
    d.figures[k] = val;
    d.sources[k] = { t12: true, hand: false, file: t.file, line: label, orig: val, normalised: true };
  }
  if (v === 'both') d.rr.settings.opex = vals.opex;
  h.touch({ kind: 'import', label: `Used the T-12’s normalised figures (${label.replace('T-12, normalised: ', '')}; EGI, expenses, taxes, NOI${v === 'both' ? ', and the rent roll’s expenses' : ''})`, snapshot: snap });
  h.rerender();
  toast('The T-12’s normalised figures are in the deal. Undo puts the earlier figures back; the NOI as reported is still on the T-12 card.');
}

/**
 * "Use the T-12's figures": EGI, operating expenses, taxes and NOI onto the deal (and the rent roll's
 * expenses, if asked), one undoable step. The deal's figures are a year's, so a statement of fewer than
 * 12 months is never put in as it stands: the broker keeps it as a partial year (nothing on the deal
 * changes), or annualizes it (× 12 ÷ its months), seeing each annual figure and confirming first.
 */
async function useFigures(h, norm = false) {
  const d = h.deal;
  const t = d.t12;
  if (norm) return useNormalised(h);
  const T = statementTotals(t);
  // by the count of lines, not their amount: lines worth $0, or that cancel out, are still not filed
  if (T.unassigned || openLines(t).length) { toast(`File the ${openLines(t).length} line${openLines(t).length === 1 ? '' : 's'} still waiting in Review first: the totals aren’t complete.`, { label: 'Review', run: () => h.openReview() }, 7000); return; }
  // a period problem (a month counted twice, more than 12 months, running totals) or a stated figure that disagrees with its lines
  const hold = useHeldBy(t);
  if (hold.length) {
    toast(`Held: ${hold.map((c) => c.short || c.text).join('; ')}. Settle ${hold.length === 1 ? 'that check' : `those ${hold.length} checks`} first; the T-12’s figures aren’t used until then.`, { label: 'Show', run: () => showQc() }, 9000);
    return;
  }
  // strict review: every open check, warnings too, is reviewed first
  const so = strictOpen(d);
  if (so) { toast(`${strictWords(so)} The T-12’s figures aren’t used until then.`, { label: 'Review', run: () => h.openReview() }, 9000); return; }
  const n = t.months.length;
  const W = windowOf(t);
  const A = annualized(T, W.n);
  /** @type {{ egi: number, opex: number, taxes: number, noi: number }} */
  let vals = T;
  if (A || (W.ask && n < 12)) {
    // months with no activity on any line, not yet answered (Data QC): annualising waits for the answer, which is the broker's
    const asks = W.ask;
    const pick = await actionSheet(`This T-12 is ${n} month${n === 1 ? '' : 's'}${W.n !== n ? `, ${W.n} with activity` : ''}, not a full year`, [
      { label: 'Keep it as a partial year', sub: `Nothing on the deal changes. The T-12’s ${n}-month NOI (${usd(T.noi)}) stays on this card as a partial year, not compared with a year’s figures.`, value: 'keep', primary: true },
      asks
        ? { label: 'Annualize it, then use the figures…', sub: W.asks.includes('period.quarterends') ? `Not yet: its ${W.columns} columns are 3 or 12 months apart and may be quarters or years, not months. Say they are single months in “Data QC: T-12” first.` : `Not yet: ${W.columns - W.active} of its ${W.columns} months ${W.columns - W.active === 1 ? 'has' : 'have'} no activity on any line. Say whether to annualize over the ${W.active} months with activity or all ${W.columns} columns in “Data QC: T-12” first.`, value: 'ask', disabled: true }
        : { label: 'Annualize it, then use the figures…', sub: `Scales each total by 12 ÷ ${W.n}. You see the annual figures and confirm before anything changes.`, value: 'annualize' },
    ]);
    if (pick !== 'annualize') { if (pick === 'keep') toast(`Nothing changed: the T-12 stays a ${n}-month partial year.`); return; }
    vals = A;
  }
  const an = A ? W.n : 0;
  const sets = [['gross', 'Gross income (EGI)', vals.egi], ['opex', 'Operating expenses', vals.opex], ['taxes', 'Real estate taxes', vals.taxes], ['noi', A ? 'NOI, annualized' : 'NOI, in place', vals.noi]];
  const what = sets.map(([k, label, v]) => `${label}: ${usd(d.figures[k])} → ${usd(v)}`).join(' · ');
  const caveat = A ? ` From ${an} months × 12 ÷ ${an}: seasonal income and costs, one-time items and lease-up are scaled with everything else.` : '';
  /** @type {any[]} */
  const opts = [{ label: A ? 'Annualize and use them' : 'Use them', sub: `${what}.${caveat}`, value: 'deal', primary: true }];
  if (d.rr && d.rr.leases && d.rr.leases.length) opts.push({ label: A ? 'Annualize and use them, and the rent roll’s operating expenses too' : 'Use them, and the rent roll’s operating expenses too', sub: `The rent roll’s operating expenses: ${usd(d.rr.settings.opex)} → ${usd(vals.opex)}.`, value: 'both' });
  const v = await actionSheet(A ? `Annualize ${an} months to a year and use them?` : 'Use the T-12’s figures?', opts);
  if (!v) return;
  const snap = h.snapshot('Before using the T-12’s figures');
  const before = t.applied ? t.applied.before : { noi: d.figures.noi ?? null, gross: d.figures.gross ?? null, opex: d.figures.opex ?? null, taxes: d.figures.taxes ?? null };
  t.applied = { at: Date.now(), before, rrOpex: v === 'both', ...(A ? { annualized: an } : {}) };
  const months = periodText(t);
  for (const [k, , val] of sets) {
    d.figures[k] = val;
    d.sources[k] = { t12: true, hand: false, file: t.file, line: `T-12, ${months}${A ? `, annualized × 12 ÷ ${an}` : ''}`, orig: val, ...(A ? { annualized: an } : {}) };
  }
  if (v === 'both') d.rr.settings.opex = vals.opex;
  h.touch({ kind: 'import', label: `Used the T-12’s figures${A ? `, annualized from ${an} months` : ''} (EGI, expenses, taxes, NOI${v === 'both' ? ', and the rent roll’s expenses' : ''})`, snapshot: snap });
  h.rerender();
  toast(A ? `The T-12’s ${an} months, annualized, are in the deal. Undo puts the earlier figures back.` : 'The T-12’s figures are in the deal. Undo puts the earlier ones back.');
}
