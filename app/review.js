/* review.js -- what is waiting for a person to look at, worked out from where
 * each item lives (no separate queue is kept): T-12 lines not yet filed, T-12
 * checks not yet seen, rent roll and operating statement checks from an OM's
 * Data QC not yet resolved,
 * AI readings never applied or dismissed, and firm template cells mapped with
 * low confidence. Resolving an item is recorded
 * where it lives, so it travels in backups and, on a deal, can be undone.
 * Pure: reviewui.js draws it. Design: docs/proposals/t12-review-queue.md. */

import { openLines, t12OpenChecks, statementNotes } from './t12.js';
import { toCents } from './engine/money.js';
import { DEAL_FIELDS } from './dealfields.js';
import { openChecks as openQc, whereText } from './dataqc.js';
import { conv } from './engine/conventions.js';
import { tickable, retentionEnd, MAX_CLAIMS } from './claims.js';

const FIELD_LABEL = Object.fromEntries(DEAL_FIELDS.map((f) => [f.key, f.label]));
const dealName = (d) => d.name || (d.figures && d.figures.address) || 'Untitled deal';
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.abs(v) : 0);

/**
 * Every item, grouped: [{ group: 'deal'|'template', id, name, items: [...] }],
 * each group's items with the most money at stake first, groups by the same.
 * Items: { kind: 't12line'|'t12check'|'t12note'|'ai'|'rrcheck'|'omcheck'|'tpl'|'research', id, amount, ... }.
 * A 'research' item is a company brief with claims the broker can still tick (group 'research', one item per brief).
 * A 't12check' is a T-12 check (t12.js t12Qc) with its level, where it points and its fixes.
 * An 'rrcheck' is a Data QC check on an OM's rent roll (dataqc.js) that
 * failed or found the OM disagreeing with itself: with its page, row and cell.
 * An 'omcheck' is the same for an OM's operating statement (omstatement.js),
 * with the fixes it offers (keep as printed, the subtotals, the sum of the
 * lines, another column).
 */
export function reviewItems({ deals = [], templates = [], briefs = [], now = Date.now() } = {}) {
  const groups = [];
  for (const d of deals) {
    if (!d) continue;
    const items = [];
    if (d.t12 && Array.isArray(d.t12.lines)) {
      // a label repeated on several lines is one item: filing it files them all
      const byKey = new Map();
      for (const l of openLines(d.t12)) {
        const it = byKey.get(l.key);
        if (it) { it.count += 1; it.amount += num(l.total); it.total = toCents(it.total + l.total); it.lineIds.push(l.id); } else byKey.set(l.key, { kind: 't12line', id: `t12line:${l.id}`, lineId: l.id, lineIds: [l.id], label: l.label, why: l.why, candidates: l.candidates || [], section: l.section, total: l.total, amount: num(l.total), count: 1, how: l.how, suggested: l.suggested || null, needs: l.needs || null });
      }
      items.push(...byKey.values());
      // a statement filed by an earlier version: one Note, kept apart from the checks (their ids never change)
      for (const n of statementNotes(d.t12)) items.push({ kind: 't12note', id: `t12note:${n.id}`, noteId: n.id, text: n.text, amount: 0 });
      // each with its level, where it points and the fixes it offers (applyT12Fix); a Fail holds the totals or Use
      for (const c of t12OpenChecks(d.t12)) items.push({ kind: 't12check', id: `t12check:${c.id}`, checkId: c.id, level: c.level, checkKind: c.kind, text: c.text, where: c.where || '', fixes: (c.fixes || []).map((f) => ({ id: f.id, label: f.label, ...(f.more ? { more: true } : {}) })), amount: num(c.amount) });
    }
    for (const c of openQc(d.rrQc)) {
      items.push({ kind: 'rrcheck', id: `rrcheck:${c.id}`, checkId: c.id, level: c.level, checkKind: c.kind, text: c.text, where: whereText(c), page: c.page || null, row: c.row || null, col: c.colLabel || null, cell: c.cell ? c.cell.text : null, lineText: c.lineText || '',
        // a fail holds the rent roll back: it sorts with the rent it holds
        amount: num(c.amount) || (c.level === 'fail' && d.rrQc.held ? d.rrQc.held.reduce((s, r) => s + num(r.annual), 0) : 0) });
    }
    // the OM's operating statement: a failed check holds NOI, EGI and expenses back; each comes with its fixes
    for (const c of openQc(d.omRead)) {
      items.push({ kind: 'omcheck', id: `omcheck:${c.id}`, checkId: c.id, level: c.level, checkKind: c.kind, text: c.text, where: whereText(c), page: c.page || null, row: c.row || null, col: c.colLabel || null, cell: c.cell ? c.cell.text : null, cellAt: c.cell && Number.isInteger(c.cell.at) ? c.cell.at : null, lineText: c.lineText || '',
        fixes: (c.fixes || []).map((f) => ({ id: f.id, label: f.label })), amount: num(c.amount) });
    }
    const ex = (d.ai && Array.isArray(d.ai.extractions)) ? d.ai.extractions : [];
    ex.forEach((x, i) => (x.fields || []).forEach((f, j) => {
      if (f.applied || f.dismissed) return;
      items.push({ kind: 'ai', id: `ai:${i}:${j}`, ext: i, field: j, key: f.key, label: FIELD_LABEL[f.key] || f.key, value: f.value, doc: f.doc || (x.files || [])[0] || '', page: f.page || null, status: f.status || '', at: x.at, amount: num(f.value) });
    }));
    if (items.length) groups.push({ group: 'deal', id: d.id, name: dealName(d), items: items.sort((a, b) => b.amount - a.amount) });
  }
  for (const t of templates) {
    if (!t || t.archived || !t.mapping || !Array.isArray(t.mapping.cells)) continue;
    const items = t.mapping.cells.map((c, i) => ({ c, i })).filter(({ c }) => c.confidence === 'low')
      .map(({ c, i }) => ({ kind: 'tpl', id: `tpl:${i}`, cell: i, sheet: c.sheet, ref: c.cell, field: c.field, label: FIELD_LABEL[c.field] || c.field, why: c.why || '', amount: 0 }));
    if (items.length) groups.push({ group: 'template', id: t.id, name: t.name || 'Untitled template', items });
  }
  // a research brief with claims waiting for the broker's tick: one item per brief
  for (const b of briefs) {
    if (!b || b.status !== 'ready' || !Array.isArray(b.claims) || retentionEnd(b) < now) continue;
    const n = b.claims.slice(0, MAX_CLAIMS).filter((c) => c && c.ticked !== true && tickable(c)).length;
    if (n) groups.push({ group: 'research', id: b.id, name: `Research: ${(b.subject && b.subject.name) || 'a company'}`, items: [{ kind: 'research', id: `research:${b.id}`, briefId: b.id, count: n, amount: 0 }] });
  }
  const atStake = (g) => g.items.reduce((s, x) => s + x.amount, 0);
  const rank = { deal: 0, template: 1, research: 2 };
  return groups.sort((a, b) => (a.group === b.group ? atStake(b) - atStake(a) : rank[a.group] - rank[b.group]));
}

/** How many items, for the tab's badge. */
export const reviewCount = (groups) => groups.reduce((s, g) => s + g.items.length, 0);

/**
 * The strict review setting (Settings → Calculation conventions, `review.strict`; underwriting.md 3.4): 0 unless it
 * is "every open check" (strict), else how many checks the deal's T-12 and rent roll still have open, warnings as well
 * as failures. While it is above 0, "Use the T-12's figures", "Use normalised figures" and the rent roll's Use offers
 * wait. At the default ("failed checks only") it is always 0, so nothing changes.
 * @param {any} d  the deal
 */
export function strictOpen(d) {
  if (conv('review.strict') !== 'all' || !d) return 0;
  return (d.t12 ? t12OpenChecks(d.t12).length : 0) + openQc(d.rrQc).filter((c) => c.level === 'warn' || c.level === 'fail').length;
}
/** The words for strictOpen's count. */
export const strictWords = (n) => `${n} check${n === 1 ? '' : 's'} still open: review ${n === 1 ? 'it' : 'them'} first (Settings → Calculation conventions → Before figures can be used: strict).`;
