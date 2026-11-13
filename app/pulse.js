/* pulse.js -- the data behind Home's "pulse" panel, and the device's Home choices. Pure, no DOM (tests/pulse.test.js).
 * Everything shown comes from the person's own deals and tasks: nothing here invents a figure. */

import { ACTIVE, HIDDEN } from './pipeline.js';

export const WEEKS = 12;
const WEEK_MS = 7 * 86400000;
const ok = (x) => typeof x === 'number' && Number.isFinite(x);

/** The charts the panel can draw. */
export const CHARTS = Object.freeze([
  { id: 'flow', label: 'Pipeline', what: 'asking value by stage' },
  { id: 'deals', label: 'Deals added', what: 'deals added each week' },
  { id: 'tasks', label: 'Tasks done', what: 'tasks finished each week' },
]);

/**
 * Counts per week for the last `weeks` weeks, oldest first, the last bucket ending at `now`. A time in the future or older than the
 * window, or one that is not a number, is not counted.
 * @param {unknown[]} times  milliseconds since 1970
 */
export function weekly(times, now = Date.now(), weeks = WEEKS) {
  const out = new Array(weeks).fill(0);
  for (const t of times) {
    if (!ok(t) || t > now) continue;
    const back = Math.floor((now - t) / WEEK_MS);
    if (back < weeks) out[weeks - 1 - back] += 1;
  }
  return out;
}

/**
 * Active stages in pipeline order, with the deals in each. Bars scale by asking value when any active deal is priced, else by count
 * (`mode`), and a stage with no deals is left out: the chart is only what is there.
 * @param {{ stages: { key: string, label: string, count: number, value: number, priced: number }[] }} summary  from pipelineSummary
 */
export function flowRows(summary) {
  const rows = summary.stages.filter((s) => ACTIVE.includes(s.key) && !HIDDEN.has(s.key) && s.count > 0)
    .map((s) => ({ key: s.key, label: s.label, count: s.count, value: s.value, priced: s.priced }));
  const mode = rows.some((r) => r.value > 0) ? 'value' : 'count';
  const max = Math.max(0, ...rows.map((r) => (mode === 'value' ? r.value : r.count)));
  return { rows, mode, max, frac: (r) => (max > 0 ? (mode === 'value' ? r.value : r.count) / max : 0) };
}

/**
 * Everything the panel draws.
 * @param {{ deals: any[], tasks: any[], waiting?: number, summary: any, buckets: any, now?: number }} a
 */
export function pulseData({ deals, tasks, waiting = 0, summary, buckets, now = Date.now() }) {
  const added = weekly(deals.map((d) => d.createdAt), now);
  const done = weekly(tasks.filter((t) => t.done).map((t) => t.doneAt), now);
  return {
    hasDeals: deals.length > 0,
    flow: flowRows(summary),
    added, addedTotal: added.reduce((a, b) => a + b, 0),
    done, doneTotal: done.reduce((a, b) => a + b, 0),
    chips: { today: buckets.today.length, overdue: buckets.overdue.length, week: buckets.week.length, toFile: waiting },
  };
}

/** One sentence for a screen reader: what the chart shows. */
export function describe(chart, d, money = String) {
  if (chart === 'flow') {
    if (!d.flow.rows.length) return 'No active deals yet.';
    return `Active deals by stage: ${d.flow.rows.map((r) => `${r.label} ${r.count} deal${r.count === 1 ? '' : 's'}${d.flow.mode === 'value' && r.value ? `, ${money(r.value)} asking` : ''}`).join('; ')}.`;
  }
  const [n, what] = chart === 'deals' ? [d.addedTotal, 'deals added'] : [d.doneTotal, 'tasks finished'];
  const series = chart === 'deals' ? d.added : d.done;
  return `${n} ${what} in the last ${WEEKS} weeks; ${series[WEEKS - 1]} this week.`;
}

// ---- the person's choices: which panels, in what order, and which chart -------------------------------------------------------

const KEY = 'zlatura.home';
export const DEFAULT_PREFS = Object.freeze({ order: [], hidden: [], chart: 'flow', pulse: true });

/** Read the choices, in any state the storage is in: a blocked, empty or damaged value gives today's Home. */
export function loadPrefs(store = globalThis.localStorage) {
  try {
    const p = JSON.parse(store.getItem(KEY) || 'null');
    if (!p || typeof p !== 'object') return { ...DEFAULT_PREFS, order: [], hidden: [] };
    const strs = (a) => (Array.isArray(a) ? [...new Set(a.filter((x) => typeof x === 'string'))] : []);
    return { order: strs(p.order), hidden: strs(p.hidden), chart: CHARTS.some((c) => c.id === p.chart) ? p.chart : 'flow', pulse: p.pulse !== false };
  } catch { return { ...DEFAULT_PREFS, order: [], hidden: [] }; }
}

/** Keep the choices; false when the device would not (they then hold for this visit only). */
export function savePrefs(p, store = globalThis.localStorage) {
  try {
    const same = !p.order.length && !p.hidden.length && p.chart === 'flow' && p.pulse !== false;
    if (same) store.removeItem(KEY); else store.setItem(KEY, JSON.stringify({ order: p.order, hidden: p.hidden, chart: p.chart, pulse: p.pulse !== false }));
    return true;
  } catch { return false; }
}

/**
 * The panels in the person's order. `ids` is the workspace's own order; ids the person has not placed keep their place after
 * the ones they have, an id that no longer exists is dropped, and a hidden one is left out.
 * @returns {{ id: string, shown: boolean }[]}  every panel, hidden ones included, so the customise list can show and restore them
 */
export function arrange(ids, prefs) {
  const have = new Set(ids);
  const placed = prefs.order.filter((id) => have.has(id));
  const rest = ids.filter((id) => !placed.includes(id));
  return [...placed, ...rest].map((id) => ({ id, shown: !prefs.hidden.includes(id) }));
}

/** Move panel `id` one place up (-1) or down (1) in the arranged list; returns the new order of ids. */
export function move(list, id, by) {
  const ids = list.map((x) => x.id);
  const i = ids.indexOf(id); const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}
