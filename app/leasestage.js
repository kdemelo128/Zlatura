/* leasestage.js -- from what leaseread.js found to what the abstract gets, only with the broker's "Keep".
 *
 * stageInto compares a read lease (a Result) with the abstract and returns one row per candidate saying what keeping it would
 * do; it writes nothing. keepStaged applies the selected rows through the abstract's own setters (abstracts.js), as the
 * reader's (`by: 'reader'`, with its page and quote, never ticked). The reader never overwrites a value the broker typed or ticked
 * (decision 5): the row says "Differs from your typed value: kept as a flag". A newer document, by its effective date and never
 * by the order the files were read, replaces an older reader value and keeps the old one in the note. The arithmetic checks
 * on rent rows are L1's own (checkAbstract) run on a scratch abstract; a row that fails becomes ambiguous with both figures, and is
 * never fixed. Pure data: no DOM, no clock (the caller gives `now`); leasereadui.js draws the rows.
 *
 * Row = { id, kind: 'field'|'term'|'step'|'flag'|'note', key, label, text, status, confidence, page, quote, effect, effectText,
 *         selected, canKeep, choices?, cand }
 * effect: fills | adds | differs | replaces | older | already | none */

import { cutText } from './dd.js';
import { fmtDate } from './dateinput.js';
import { coerce, newAbstract, setValue, setStep, setNotFound, setAmbiguous, addTerm, addStep, addFlag, checkAbstract, stepDates } from './abstracts.js';
import { FIELD_BY_KEY, LIMITS } from './abstractfields.js';
import { dayOf } from './lease.js';

const sqt = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const usd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const UNIT_WORDS = { month: 'a month', year: 'a year', psf_year: 'per SF a year', psf_month: 'per SF a month', total: '' };

/** A value as the broker reads it: "$5,000.00", "3,400 SF (rentable)", "03/01/2032", "the last day of ...". */
export function showValue(key, rec) {
  const f = FIELD_BY_KEY[key];
  if (!rec) return '';
  if (rec.rel && rec.value === null) return `“${rec.rel}”`;
  if (rec.value === null || rec.value === undefined) return '';
  if (!f) return String(rec.value);
  if (f.kind === 'money') return rec.value === 0 && key === 'deposit' ? 'None ($0.00)' : `${usd(rec.value)}${rec.unit && rec.unit !== 'total' ? ` ${UNIT_WORDS[rec.unit]}` : ''}`;
  if (f.kind === 'sf') return `${Number(rec.value).toLocaleString('en-US')} SF${rec.basis ? ` (${rec.basis})` : ' (basis not stated)'}`;
  if (f.kind === 'pct') return `${rec.value}%`;
  if (f.kind === 'date' || f.kind === 'dateRel') return fmtDate(rec.value);
  if (f.kind === 'int') return key === 'termMonths' ? `${rec.value} months` : String(rec.value);
  return String(rec.value);
}

/** The reader's source for a candidate or step: its page, offsets, quote, who read it and the OCR confidence. */
const srcFor = (doc, s) => ({ doc: doc ? doc.id : null, page: s.page, start: s.start, len: s.len, quote: s.quote, reader: s.ocrConf !== null && s.ocrConf !== undefined ? 'ocr@1' : 'pdftext@1', ocrConf: s.ocrConf ?? null });
const sameSrc = (a, b) => a.doc === b.doc && a.page === b.page && sqt(a.quote) === sqt(b.quote);
const mergeSrc = (have, add) => { const out = [...have]; for (const s of add) if (!out.some((x) => sameSrc(x, s)) && out.length < LIMITS.sources) out.push(s); return out; };

/** Did the broker make this value theirs (typed, marked, or ticked)? Then the reader never overwrites it. */
const brokerHeld = (rec) => !!rec && (!!rec.checked || (rec.by === 'broker' && (rec.status === 'found' || rec.status === 'not-found')));
const isEmpty = (rec) => !rec || rec.status === 'unread' || (rec.status === 'ambiguous' && rec.by !== 'reader' && rec.value === null && !rec.checked);

function sameAs(f, rec, cand) {
  if (!rec || rec.status !== 'found') return false;
  const c = coerce(f, cand.value);
  const val = cand.value === null ? rec.value === null : c.ok && (typeof c.value === 'string' ? sqt(c.value) === sqt(rec.value) : JSON.stringify(c.value) === JSON.stringify(rec.value));
  return val && sqt(cand.rel) === sqt(rec.rel) && (!cand.basis || cand.basis === rec.basis);
}

/** Who said an earlier value: the original lease, or the named amendment. */
const nameOfDoc = (docs, id) => { const d = docs.find((x) => x.id === id); return d && d.type === 'amendment' ? `‘${d.name}’` : 'The original lease'; };

/** The effective date a document layers by: an amendment's asOf, else none (the original lease counts as the oldest). */
const effOf = (docs, id) => { const d = (docs || []).find((x) => x.id === id); return d && d.type === 'amendment' && d.asOf ? d.asOf : null; };
const nameOf = (docs, id) => { const d = (docs || []).find((x) => x.id === id); return d ? d.name : 'another document'; };

/**
 * Run L1's arithmetic checks on the rent rows, on a scratch abstract. A row whose monthly and annual rent disagree, or whose annual
 * rent and $/SF disagree, becomes ambiguous with both figures kept, no primary, and a note naming both. Never fixed.
 */
export function checkRentRows(ab, steps, sfCand) {
  const scratch = newAbstract({ title: 'check', now: '2000-01-01T00:00:00.000Z' });
  const have = ab.fields.sf && ab.fields.sf.status === 'found' ? ab.fields.sf : null;
  const sf = sfCand && sfCand.status === 'found' ? { value: sfCand.value, basis: sfCand.basis } : have ? { value: have.value, basis: have.basis } : null;
  if (sf) setValue(scratch, 'sf', sf.value, { basis: sf.basis || undefined });
  const term = addTerm(scratch, { kind: 'initial' }).term;
  const ids = steps.map((s) => {
    const r = addStep(scratch, term.id, { label: s.label, amounts: s.amounts, primary: s.primary, basis: s.basis, mFrom: s.mFrom, mTo: s.mTo });
    return r.step ? r.step.id : null;
  });
  const fails = checkAbstract(scratch).filter((c) => c.level === 'fail');
  return steps.map((s, i) => {
    const hit = fails.filter((c) => c.key === `step:${ids[i]}` && /monthly and annual disagree|annual and \$\/SF disagree/.test(c.text)); // the arithmetic only (a month count waiting for a date is not)
    if (!hit.length || s.status !== 'found') return s;
    const a = s.amounts; const bits = [];
    if (hit.some((c) => /monthly and annual/.test(c.text))) bits.push(`${usd(a.month)} a month × 12 = ${usd(Math.round(a.month * 12 * 100) / 100)}, but the lease says ${usd(a.year)} a year, p.${s.page}`);
    if (hit.some((c) => /annual and \$\/SF/.test(c.text)) && sf) bits.push(`${usd(a.year)} a year ÷ ${Number(sf.value).toLocaleString('en-US')} SF = ${usd(Math.round(a.year / sf.value * 100) / 100)} a SF, but the lease says ${usd(a.psf_year)} a SF, p.${s.page}`);
    const monthly = hit.some((c) => /monthly and annual/.test(c.text));
    const choices = { steps: true, options: monthly ? [{ label: 'Use the monthly figure', keep: 'month' }, { label: 'Use the annual figure', keep: 'year' }] : [{ label: 'Use the annual figure', keep: 'year' }, { label: 'Use the $/SF figure', keep: 'psf_year' }] };
    return { ...s, status: 'ambiguous', primary: null, note: cutText(bits.join('; ') || hit.map((c) => c.text).join('; '), LIMITS.note), choices };
  });
}

/**
 * The rows for a read lease against an abstract. opts: { doc: { id, name, type }, effective (the amendment's effective date, ISO or
 * null), docs (the deal's documents: [{ id, name, type, asOf }]) }. Writes nothing.
 * @param {any} ab @param {any} result @param {{ doc: { id: string, name: string, type?: string }, effective?: string | null, docs?: any[] }} o
 */
export function stageInto(ab, result, { doc, effective = null, docs = [] }) {
  const rows = [];
  const push = (r) => rows.push({ id: `r${rows.length + 1}`, canKeep: true, selected: false, choices: null, ...r });
  const amend = result.docType === 'amendment';
  // an amendment with no effective date layers nothing: every value is ambiguous until the broker types it
  const noDate = amend && !effective;
  for (const c of result.cands) {
    const f = FIELD_BY_KEY[c.key];
    if (!f) continue;
    const rec = ab.fields[c.key];
    const label = f.label;
    let cand = c;
    if (noDate && c.status === 'found') cand = { ...c, status: 'ambiguous', note: cutText(`Type the amendment’s effective date to apply it. It says ${showValue(c.key, c)}, p.${c.page}`, LIMITS.note) };
    const text = cand.status === 'not-found' ? cand.note : cand.status === 'ambiguous' ? cand.note : showValue(c.key, cand);
    const base = { kind: 'field', key: c.key, label, text, status: cand.status, confidence: cand.confidence, page: cand.page, quote: cand.quote, cand, choices: cand.choices ? { field: true, options: cand.choices } : null };
    if (cand.status === 'not-found') {
      if (!isEmpty(rec)) push({ ...base, effect: 'none', effectText: 'Your abstract already has a value here', canKeep: false });
      else push({ ...base, effect: 'fills', effectText: 'Marks it “not found” in the abstract (not selected: a miss by the reader is not proof the lease is silent)' });
      continue;
    }
    const mine = (cand.sources || []).map((s) => srcFor(doc, s));
    const same = sameAs(f, rec, cand) || (cand.status === 'ambiguous' && !!rec && rec.status === 'ambiguous' && sqt(rec.note) === sqt(cand.note));
    if (rec && rec.src.length && mine.length && mine.every((s) => rec.src.some((x) => sameSrc(x, s))) && same) { push({ ...base, effect: 'already', effectText: 'Already in the abstract from this page', canKeep: false }); continue; }
    if (brokerHeld(rec)) {
      if (sameAs(f, rec, cand)) push({ ...base, effect: 'adds', effectText: 'Adds a page to your typed value', selected: true });
      else push({ ...base, effect: 'differs', effectText: 'Differs from your typed value: kept as a flag' });
      continue;
    }
    if (isEmpty(rec) || (rec.by === 'reader' && rec.status === 'ambiguous')) { push({ ...base, effect: 'fills', effectText: 'Fills an empty field', selected: true }); continue; }
    // an earlier reader value, not ticked: the newer document wins, by effective date
    const theirs = rec.src[0] && rec.src[0].doc;
    const sameDoc = theirs === doc.id;
    if (sameAs(f, rec, cand)) { push({ ...base, effect: 'adds', effectText: 'Adds a page to the value already read', selected: true }); continue; }
    if (sameDoc) { push({ ...base, effect: 'replaces', effectText: 'Replaces the value read from this document earlier', selected: true }); continue; }
    const mineEff = amend ? effective : null;
    const theirEff = effOf(docs, theirs);
    const newer = mineEff && (!theirEff || mineEff > theirEff);
    if (newer) push({ ...base, effect: 'replaces', effectText: `Replaces ${theirs && docs.find((x) => x.id === theirs && x.type === 'amendment') ? `‘${nameOf(docs, theirs)}’` : 'the original lease'}’s value (amendment): the old value stays in the note`, selected: true });
    else push({ ...base, effect: 'older', effectText: `Older than the value already read from ‘${nameOf(docs, theirs)}’: only noted`, selected: true });
  }
  // rent terms and steps
  const sfCand = result.cands.find((x) => x.key === 'sf');
  const checked = checkRentRows(ab, result.steps, sfCand);
  const initial = ab.terms.find((t) => t.kind === 'initial') || (ab.terms.length === 1 ? ab.terms[0] : null);
  const hasSteps = !!initial && ab.steps.some((s) => s.term === initial.id);
  const readBefore = ab.steps.some((s) => s.src.some((x) => x.doc === doc.id));
  result.terms.forEach((t, ti) => {
    const mine = checked.filter((s) => s.termIndex === ti);
    const tBase = { kind: 'term', key: null, label: t.label, text: `${t.label}: ${mine.length} rent step${mine.length === 1 ? '' : 's'}`, status: t.status, confidence: t.confidence, page: t.page, quote: t.quote, cand: { ...t, termIndex: ti } };
    let block = null;
    if (readBefore) block = 'Already added from this document';
    else if (!amend && hasSteps) block = 'Your abstract already has rent steps for the original term: nothing is added, so nothing is counted twice';
    if (noDate && amend) block = 'Type the amendment’s effective date first: its rent table cannot be layered without it';
    if (t.status === 'ambiguous' && !mine.length) { push({ ...tBase, effect: block ? 'none' : 'fills', effectText: block || 'Adds the term with a note: no steps are added until you choose', canKeep: !block, selected: false, text: t.note }); return; }
    push({ ...tBase, effect: block ? 'none' : 'fills', effectText: block || (amend ? `Adds a new term from ‘${doc.name}’ that supersedes earlier rent` : 'Adds the original term'), canKeep: !block, selected: !block });
    for (const s of mine) {
      const unitsText = Object.entries(s.amounts).map(([u, v]) => (u.startsWith('psf') ? `${usd(v)} ${UNIT_WORDS[u]}` : `${usd(v)} ${UNIT_WORDS[u]}`)).join(', ');
      push({ kind: 'step', key: null, label: s.label || 'Rent step', text: s.status === 'ambiguous' ? s.note : `${unitsText}${s.basis ? ` (${s.basis} SF)` : ''}`, status: s.status, confidence: s.confidence, page: s.page, quote: s.quote,
        effect: block ? 'none' : 'fills', effectText: block || 'Adds this rent step', canKeep: !block, selected: !block, cand: { ...s, termIndex: ti }, choices: s.choices || null });
    }
  });
  for (const fl of result.flags) {
    const have = ab.flags.some((x) => x.text === fl.text);
    push({ kind: 'flag', key: null, label: fl.kind === 'abated' ? 'Free rent' : fl.kind === 'poor' ? 'Poorly read pages' : 'Note', text: fl.text, status: 'found', confidence: 'high', page: fl.page, quote: '',
      effect: have ? 'already' : 'fills', effectText: have ? 'Already a flag on the abstract' : 'Adds a flag to the abstract', canKeep: !have, selected: !have && fl.kind !== 'usable', cand: fl });
  }
  return rows;
}

/** The lines that say what was read: "Read 4 pages (2 by OCR; page 3 read poorly). 14 found, 3 need your choice, 9 not found." */
export function summarise(result, rows) {
  const fields = rows.filter((r) => r.kind === 'field');
  const n = (st) => fields.filter((r) => r.status === st).length + rows.filter((r) => r.kind === 'step' && r.status === st).length;
  const ocr = result.pages.filter((p) => p.source === 'ocr').length;
  const poor = result.pages.filter((p) => p.poor).map((p) => p.n);
  const poorText = poor.length ? `; page${poor.length === 1 ? '' : 's'} ${poor.join(', ')} read poorly` : '';
  return `Read ${result.pages.length} page${result.pages.length === 1 ? '' : 's'} (${ocr} by OCR${poorText}). ${n('found')} found, ${n('ambiguous')} need your choice, ${n('not-found')} not found.`;
}

const readerSrc = (doc, c) => (c.sources && c.sources.length ? c.sources : [{ page: c.page, start: c.start, len: c.len, quote: c.quote, ocrConf: c.ocrConf ?? null }]).map((s) => srcFor(doc, s));
/** The item is the reader's now: its confidence, and its sources (the reader's first, then any the broker typed, up to 3). */
function stamp(rec, doc, c, keepTyped = []) {
  rec.by = 'reader'; rec.confidence = c.confidence; rec.src = mergeSrc(readerSrc(doc, c).slice(0, LIMITS.sources), keepTyped);
}

/**
 * Apply the selected rows (row.selected && row.canKeep), through the abstract's setters. Never ticks. Never overwrites a value the
 * broker typed or ticked (such a row only adds a page, or a flag). Returns { kept, skipped: [reasons] }. The caller makes ONE history entry.
 * @param {any} ab @param {any[]} rows @param {{ doc: { id: string, name: string, type?: string }, effective?: string | null, docs?: any[], now?: string }} o
 */
export function keepStaged(ab, rows, { doc, effective = null, docs = [], now }) {
  let kept = 0; const skipped = [];
  const termIds = new Map();
  const oldSteps = ab.steps.slice();
  let monthsOnly = false;
  for (const r of rows) {
    if (!r.selected || !r.canKeep) continue;
    const c = r.cand;
    if (r.kind === 'flag') { if (!ab.flags.some((x) => x.text === c.text)) { const f = addFlag(ab, c.text, { now }); if (f.error) skipped.push(f.error); else kept += 1; } continue; }
    if (r.kind === 'field') {
      const f = FIELD_BY_KEY[r.key];
      const had = ab.fields[r.key];
      if (r.effect === 'adds') { had.src = mergeSrc(had.src, readerSrc(doc, c)); kept += 1; continue; }
      if (r.effect === 'differs') { const fl = addFlag(ab, cutText(`‘${doc.name}’ says ${f.label} is ${r.text}, p.${c.page}; the abstract has ${showValue(r.key, had)}`, LIMITS.flag), { now }); if (fl.error) skipped.push(fl.error); else kept += 1; continue; }
      if (r.effect === 'older') {
        const note = `‘${doc.name}’ said ${r.text}, p.${c.page}`;
        had.note = cutText(`${had.note ? `${had.note} ` : ''}${note}`, LIMITS.note); kept += 1; continue;
      }
      let old = '';
      if (r.effect === 'replaces' && had && had.src[0] && had.src[0].doc !== doc.id) old = `${nameOfDoc(docs, had.src[0].doc)} said ${showValue(r.key, had)}, p.${had.src[0].page}`;
      let res;
      if (c.status === 'not-found') res = setNotFound(ab, r.key, { now });
      else if (c.status === 'ambiguous') res = setAmbiguous(ab, r.key, c.note || 'The reader could not decide', { now });
      else if (c.value === null && c.rel) res = setValue(ab, r.key, null, { rel: c.rel, now });
      else res = setValue(ab, r.key, c.value, { unit: c.unit || undefined, basis: c.basis || undefined, now });
      if (res.error) { skipped.push(res.error); continue; }
      const rec = ab.fields[r.key];
      if (c.status === 'not-found') { rec.note = cutText(c.note, LIMITS.note); rec.by = 'broker'; rec.confidence = null; }
      else { stamp(rec, doc, c, r.effect === 'fills' && had ? had.src.filter((x) => x.reader === 'typed') : []); if (f.kind === 'sf' || f.kind === 'psf') rec.basis = c.basis || null; rec.note = cutText([c.status === 'found' ? c.note : rec.note, old].filter(Boolean).join(' '), LIMITS.note); if (c.status === 'ambiguous') rec.value = null; }
      rec.checked = false;
      kept += 1;
      continue;
    }
    if (r.kind === 'term') {
      let term = !c.supersedes ? ab.terms.find((t) => t.kind === 'initial') || null : null;
      if (!term) {
        const res = addTerm(ab, { kind: c.kind, label: c.label, doc: c.supersedes ? doc.id : null, effective: c.supersedes ? effective : null, supersedes: !!c.supersedes, status: c.status === 'ambiguous' ? 'ambiguous' : 'found', note: c.status === 'ambiguous' ? c.note : '' }, { now });
        if (res.error) { skipped.push(res.error); continue; }
        term = res.term;
        stamp(term, doc, { ...c, sources: null });
      }
      termIds.set(c.termIndex, term.id);
      kept += 1;
      continue;
    }
    if (r.kind === 'step') {
      const termId = termIds.get(c.termIndex);
      if (!termId) { skipped.push('A rent step has no term to go in'); continue; }
      const amend = !!(ab.terms.find((t) => t.id === termId) || {}).supersedes;
      const res = addStep(ab, termId, { label: c.label, mFrom: amend ? null : c.mFrom, mTo: amend ? null : c.mTo, from: c.from, to: c.to, amounts: c.amounts, primary: c.primary, basis: c.basis }, { now });
      if (res.error) { skipped.push(res.error); continue; }
      const st = res.step;
      stamp(st, doc, c);
      st.status = c.status === 'ambiguous' ? 'ambiguous' : Object.values(c.amounts).some((v) => v !== null && v !== undefined) ? 'found' : 'unread';
      st.note = cutText(c.note || '', LIMITS.note);
      st.checked = false;
      if (amend && !(st.from && st.to)) monthsOnly = true;
      if (amend && st.from && st.to) for (const old of oldSteps) {
        if (old.term === termId || old.supersededBy) continue;
        const d = stepDates(old, ab);
        if (!(d.from && d.to) || !(dayOf(d.from) <= dayOf(st.to) && dayOf(st.from) <= dayOf(d.to))) continue;
        if (dayOf(st.from) <= dayOf(d.from) && dayOf(d.to) <= dayOf(st.to)) old.supersededBy = doc.id; // the new dates cover the old step whole
        else { // a partial overlap: the old step is not dropped, and the broker decides
          const text = cutText(`‘${doc.name}’ rent ${st.from} to ${st.to} overlaps only part of “${old.label || 'a rent step'}” (${d.from} to ${d.to}): check which rent applies for the overlap`, LIMITS.flag);
          if (!ab.flags.some((x) => x.text === text)) addFlag(ab, text, { now });
          if (!old.checked && old.by === 'reader') { old.status = 'ambiguous'; old.note = cutText(`${old.note ? `${old.note} ` : ''}Partly overlapped by ‘${doc.name}’ (${st.from} to ${st.to}): choose which applies.`, LIMITS.note); }
        }
      }
      kept += 1;
    }
  }
  if (monthsOnly) { const text = cutText(`‘${doc.name}’ gives its rent in months, not dates: no earlier rent step was marked superseded. Check which earlier steps it replaces`, LIMITS.flag); if (!ab.flags.some((x) => x.text === text)) addFlag(ab, text, { now }); }
  return { kept, skipped };
}

/** The broker picks one of an ambiguous rent step's figures ("Use the monthly figure"): the others are cleared, it is the broker's. */
export function useFigure(ab, stepId, keep) {
  const s = ab.steps.find((x) => x.id === stepId);
  if (!s || s.amounts[keep] === null) return { error: 'That figure is not on the step.' };
  const amounts = Object.fromEntries(Object.keys(s.amounts).map((u) => [u, u === keep ? s.amounts[u] : null]));
  const res = setStep(ab, stepId, { amounts, primary: keep });
  if (res.error) return res;
  s.status = 'found';
  return { ok: true };
}
