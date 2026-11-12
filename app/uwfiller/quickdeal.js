/* uwfiller/quickdeal.js -- writing figures to a deal from the underwriting tool, only after a confirm that shows before and
 * after, with Undo. Two callers: "Bring into deal" (underwrite.js, the tool's own figures) and "Save as deal" in the tool's
 * Model step (toolbridge.js, the Quick check's figures: the engine's, never the tool's). The deal paths are the app's own
 * (dealui.js createDeal / updateDeal / discardDeal); this file only asks, writes the listed fields and puts them back. */

import { el, toast } from '../kit.js';
import { createDeal, discardDeal, showDeal, updateDeal, dealForBridge } from '../dealui.js';
import { dealFields } from '../uwstore.js';
import { planQuickToDeal, quickFigureList } from './bridge.js';

export const TOOL_TITLE = 'Underwriting tool';
const button = (cls, label, run) => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', run); return b; };

const set = (x, path, v) => { const [g, k] = path.split('.'); x[g] ||= {}; if (v === null || v === undefined) { if (g === 'live') delete x[g][k]; else x[g][k] = null; } else x[g][k] = v; };
const cur = (x, path) => { const [g, k] = path.split('.'); const v = x[g] ? x[g][k] : undefined; return v === undefined || v === '' ? null : v; };
const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b);
const MONEY_SOURCES = { 'figures.price': 'price', 'figures.noi': 'noi' };   // a figure that has a source: it is marked as typed, from the tool

/**
 * Write a plan's changes into deal `d` (nothing else), then offer Undo. Returns true when the deal was changed.
 * `changes` are planOut's / planQuickToDeal's: { label, dealPath, before, after }. If the deal moved since the plan was made, nothing is written.
 */
export async function writeChanges(d, changes, name) {
  const before = new Map(); const srcs = new Map(); let stale = false;
  const done = await updateDeal(d.id, (x) => {
    if (changes.some((c) => !same(cur(x, c.dealPath), c.before))) { stale = true; return false; }
    for (const c of changes) {
      const key = MONEY_SOURCES[c.dealPath];
      if (key) srcs.set(c.dealPath, x.sources?.[key] ? { ...x.sources[key] } : undefined);
      before.set(c.dealPath, c);
      set(x, c.dealPath, c.after);
    }
    for (const [path, key] of Object.entries(MONEY_SOURCES)) {   // as dealui's applyFromTools does: keep the source's own figure (orig), mark it typed from the tool
      if (!before.has(path)) continue;
      x.sources ||= {};
      const s0 = x.sources[key];
      if (s0) { s0.hand = s0.orig !== x.figures[path.split('.')[1]]; s0.tool = TOOL_TITLE; } else x.sources[key] = { hand: true, tool: TOOL_TITLE };
    }
    return true;
  }, { kind: 'tool', label: `From the ${TOOL_TITLE}: ${changes.map((c) => c.label.toLowerCase()).join(', ')}` });
  if (stale) { toast('The deal changed while you were deciding. Open the tool again.'); return false; }
  if (!done) { toast('The deal could not be changed.'); return false; }
  toast(`${changes.length} figure${changes.length === 1 ? '' : 's'} brought into ${name}.`, {
    label: 'Undo',
    run: async () => {
      let skipped = 0;
      await updateDeal(d.id, (x) => {
        for (const [path, c] of before) {
          if (!same(cur(x, path), c.after)) { skipped += 1; continue; }   // edited since: not put back over the newer value
          set(x, path, c.before);
          const key = MONEY_SOURCES[path];
          if (key) { x.sources ||= {}; if (srcs.get(path)) x.sources[key] = srcs.get(path); else delete x.sources[key]; }
        }
        return skipped < before.size;
      }, { kind: 'tool', label: `Undid: figures brought from the ${TOOL_TITLE}` });
      toast(skipped ? `Undone, except ${skipped} figure${skipped === 1 ? '' : 's'} you have changed since: those were left as they are.` : 'Undone: the deal has its earlier figures again.');
    },
  }, 9000);
  return true;
}

/** The before/after table of the confirm sheets. */
export function diffTable(changes) {
  const tbl = el('div', 'uw-diff');
  for (const c of changes) { const row = el('div', 'uw-diff-r'); row.append(el('b', null, c.label), el('span', 'uw-diff-b', `Before: ${c.beforeShown}`), el('span', 'uw-diff-a', `After: ${c.afterShown}`)); tbl.appendChild(row); }
  return tbl;
}

/** Ask in a sheet; resolves to the id of the chosen button, or null when it is cancelled or closed. */
export function choose(api, { title, sub, body, choices }) {
  return new Promise((resolve) => {
    const foot = [button('btn', 'Cancel', () => { api.sheetClose(); resolve(null); })];
    for (const [id, label, primary] of choices) foot.push(button(primary ? 'btn btn-primary' : 'btn', label, () => { api.sheetClose(); resolve(id); }));
    const box = api.sheetOpen({ eyebrow: TOOL_TITLE, title, sub, foot });
    for (const n of body) box.appendChild(n);
    document.getElementById('sheet')?.addEventListener('close', () => resolve(null), { once: true });
  });
}

/**
 * "Save as deal" from the Quick check: the engine's figures (`out` is quick.js runText's answer) become a new deal, or, with a
 * deal open that is not confidential, update it: the sheet shows what happens before anything is written. Undo for both.
 * A confidential deal is never offered for update from the tool (the bridge keeps its figures out of the tool's shared project).
 * @param {any} api the app's sheet helpers
 * @param {{ values: Record<string, number|null>, record: any, flags: object[], name: string }} out
 */
export async function saveQuickAsDeal(api, out) {
  const { values, record, flags, name } = out;
  if (typeof values.price !== 'number' && typeof values.noi !== 'number') { toast('Type a price or an NOI first: there is nothing to save as a deal.'); return false; }
  const open = dealForBridge();
  const canUpdate = !!open && !open.confidential;
  const upd = canUpdate ? planQuickToDeal(values, open) : null;
  const body = [];
  const note = el('p', 'hint-sm', 'These are the app’s figures. A figure of the tool’s that differs stays in the tool and is not saved to the deal.');
  if (flags.length) body.push(note);
  if (canUpdate) {
    body.push(el('h3', null, `Update ${open.name || 'the open deal'}`));
    if (upd.changes.length) body.push(diffTable(upd.changes)); else body.push(el('p', 'hint', 'The open deal already has these figures.'));
  }
  body.push(el('h3', null, 'Create a new deal'));
  const list = el('div', 'uw-diff');
  for (const f of quickFigureList(values)) { const row = el('div', 'uw-diff-r'); row.append(el('b', null, f.label), el('span', 'uw-diff-a', f.shown)); list.appendChild(row); }
  body.push(list);
  const choices = [];
  if (canUpdate && upd.changes.length) choices.push(['update', `Update ${open.name || 'deal'}`, false]);
  choices.push(['create', 'Create new deal', true]);
  const pick = await choose(api, { title: 'Save as deal', sub: 'Nothing is written until you choose, and you can undo it.', body, choices });
  if (pick === 'update') return writeChanges(open, upd.changes, open.name || 'the deal');
  if (pick !== 'create') return false;
  let d;
  try { d = await createDeal({ ...dealFields(record), name: name || '' }, 'Created from the underwriting tool'); } catch (e) { toast(`The deal couldn’t be saved: ${(e && e.message) || e}`); return false; }
  await showDeal(d.id);
  toast('Saved as a deal.', { label: 'Undo', run: async () => { await discardDeal(d.id); api.showView('underwrite'); } }, 9000);
  return true;
}
