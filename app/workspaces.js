/* workspaces.js -- the nine workspaces: a lens over the same app. Pure and frozen; no screen, no store, no numbers.
 * A workspace changes the order and composition of Home, which tools are listed first, the order of the New actions
 * and a few Home headings. It never hides or removes anything: every tool stays in Tools and in search, every
 * screen stays on the bar, a deal opens the same in every workspace. docs/proposals/role-workspaces.md.
 *
 * homeCards: the Home sections in order (ids are the sections' element ids in home.js); a workspace other than
 *   Brokerage also lists 'home-ws-tools', its "<Workspace> tools" card.
 * tools: ids that must exist in toolIndex() (tests/workspaces.test.js checks).
 * newMenu: the New actions, first first (ids are in command.js). checklists, exports: filled by the later items.
 * words: Home headings and empty-state lines only; control names and figures never change. */

const f = (o) => Object.freeze(o);

/** Brokerage's sections: today's Home, card for card (home-dates sits inside the Needs attention column). */
const TODAY = ['home-continue', 'home-attention', 'home-dates', 'home-pipeline', 'home-tasks', 'home-activity', 'home-contacts'];
const NEW_ALL = ['deal', 'om', 'quick', 'comps', 'task', 'contact'];
const first = (...ids) => [...ids, ...NEW_ALL.filter((x) => !ids.includes(x))];
/** The cards of a workspace other than Brokerage: the same sections, its own order, plus its tools card. */
const around = (...head) => [...head, ...TODAY.filter((x) => !head.includes(x))];

export const WORKSPACES = Object.freeze([
  f({
    id: 'brokerage', name: 'Brokerage', group: 'Sell and lease', line: 'Win listings, price them, run offers and close.',
    homeCards: Object.freeze([...TODAY]), tools: Object.freeze(['offer', 'commission', 'compset', 'value', 'compare', 'ner', 'x1031', 'pdf-pages']),
    newMenu: Object.freeze(first('om', 'comps', 'deal')), checklists: Object.freeze([]), exports: Object.freeze([]), words: f({}),
  }),
  f({
    id: 'underwriting', name: 'Underwriting', group: 'Analyse and lend', line: 'Check the inputs, normalise the income and test the value.',
    homeCards: Object.freeze(around('home-ws-tools', 'home-continue', 'home-attention')), tools: Object.freeze(['value', 'dcf', 'bridge', 'valuesens', 'breakeven', 'hold', 'irrsens', 'loan']),
    newMenu: Object.freeze(first('quick', 'deal', 'om')), checklists: Object.freeze([]), exports: Object.freeze([]),
    words: f({ pipeline: 'Deals by stage', empty: 'Start with a quick underwriting, or read an offering memorandum. Everything you add stays on this device.' }),
  }),
  f({
    id: 'lending', name: 'Lending', group: 'Analyse and lend', line: 'Size, structure and stress a loan.',
    homeCards: Object.freeze(around('home-pipeline', 'home-ws-tools', 'home-continue', 'home-attention')), tools: Object.freeze(['loan', 'amort', 'refi', 'floating', 'maturity', 'loanfees', 'breakeven']),
    newMenu: Object.freeze(first('quick', 'deal', 'contact')), checklists: Object.freeze([]), exports: Object.freeze([]),
    words: f({ pipeline: 'Loan requests', continue: 'Continue with a loan', empty: 'Start with a quick underwriting to size a loan, or add a deal. Everything you add stays on this device.' }),
  }),
  f({
    id: 'development', name: 'Development', group: 'Own, build and invest', line: 'Test a site, a budget, the draws and the lease-up.',
    homeCards: Object.freeze(around('home-ws-tools', 'home-continue', 'home-attention', 'home-pipeline')), tools: Object.freeze(['residual', 'yoc', 'draws', 'absorption', 'loan', 'waterfall']),
    newMenu: Object.freeze(first('quick', 'deal', 'task')), checklists: Object.freeze([]), exports: Object.freeze([]),
    words: f({ pipeline: 'Projects', continue: 'Continue a project', empty: 'Start with a tool below, or add a project as a deal. Everything you add stays on this device.' }),
  }),
  f({
    id: 'investing', name: 'Investing', group: 'Own, build and invest', line: 'Value a property you may buy, finance it and see what it returns.',
    homeCards: Object.freeze(around('home-ws-tools', 'home-continue', 'home-attention', 'home-pipeline')), tools: Object.freeze(['value', 'loan', 'hold', 'amort', 'refi', 'breakeven', 'x1031', 'convert']),
    newMenu: Object.freeze(first('quick', 'deal', 'task')), checklists: Object.freeze([]), exports: Object.freeze([]),
    words: f({ pipeline: 'Properties by stage', continue: 'Continue with a property', empty: 'Start with a quick underwriting on a property you are looking at. Everything you add stays on this device.' }),
  }),
  f({
    id: 'occupier', name: 'Occupier', group: 'Own, build and invest', line: 'Compare space, leases and what a move costs.',
    homeCards: Object.freeze(around('home-ws-tools', 'home-tasks', 'home-activity', 'home-continue', 'home-attention')), tools: Object.freeze(['compare', 'ner', 'renewal', 'escalation', 'pctrent', 'recovery', 'amort', 'loan']),
    newMenu: Object.freeze(first('deal', 'quick', 'task')), checklists: Object.freeze([]), exports: Object.freeze([]),
    words: f({ pipeline: 'Spaces by stage', continue: 'Continue with a space', empty: 'Start with a lease comparison below, or add the space as a deal. Everything you add stays on this device.' }),
  }),
  f({
    id: 'asset', name: 'Asset management', group: 'Own, build and invest', line: 'Watch income, rollover and debt on what you hold.',
    homeCards: Object.freeze(around('home-attention', 'home-continue', 'home-ws-tools', 'home-pipeline')), tools: Object.freeze(['walt', 'recovery', 'escalation', 'maturity', 'breakeven', 'valuesens', 'refi', 'bridge']),
    newMenu: Object.freeze(first('task', 'deal', 'contact')), checklists: Object.freeze([]), exports: Object.freeze([]),
    words: f({ pipeline: 'Assets by stage', continue: 'Continue with an asset', empty: 'Add a property as a deal to watch its rent roll, income and debt. Everything you add stays on this device.' }),
  }),
  f({
    id: 'capital', name: 'Capital raising', group: 'Own, build and invest', line: 'Split profits, test returns and see the fee load.',
    homeCards: Object.freeze(around('home-ws-tools', 'home-continue', 'home-attention', 'home-pipeline', 'home-contacts')), tools: Object.freeze(['waterfall', 'hold', 'irrsens', 'commission', 'loanfees']),
    newMenu: Object.freeze(first('contact', 'deal', 'task')), checklists: Object.freeze([]), exports: Object.freeze([]),
    words: f({ pipeline: 'Offerings by stage', continue: 'Continue with an offering', empty: 'Start with the waterfall below, or add the offering as a deal. Everything you add stays on this device.' }),
  }),
  f({
    id: 'leases', name: 'Leases and documents', group: 'Sell and lease', line: 'Read leases, keep dates and work with PDFs.',
    homeCards: Object.freeze(around('home-attention', 'home-continue', 'home-ws-tools', 'home-tasks', 'home-activity')), tools: Object.freeze(['pdf-pages', 'doc-convert', 'walt', 'escalation', 'ner', 'recovery', 'x1031']),
    newMenu: Object.freeze(first('deal', 'task', 'om')), checklists: Object.freeze([]), exports: Object.freeze([]),
    words: f({ continue: 'Continue with a lease', empty: 'Add a deal to attach its leases and dates, or open a PDF tool below. Everything you add stays on this device.' }),
  }),
]);

export const DEFAULT_ID = 'brokerage';
export const MAX_PINNED = 3;
export const GROUPS = Object.freeze(['Sell and lease', 'Analyse and lend', 'Own, build and invest']);
const IDS = new Set(WORKSPACES.map((w) => w.id));
export const workspaceById = (id) => WORKSPACES.find((w) => w.id === id) || WORKSPACES[0];

/** The stored workspace choice, made safe to use: unknown ids dropped, at most 3 pinned, `active` always one of them. */
export function sanitiseWorkspace(w) {
  const o = w && typeof w === 'object' ? w : {};
  const seen = new Set();
  let pinned = (Array.isArray(o.pinned) ? o.pinned : []).filter((x) => typeof x === 'string' && IDS.has(x) && !seen.has(x) && seen.add(x)).slice(0, MAX_PINNED);
  const active = typeof o.active === 'string' && IDS.has(o.active) ? o.active : (pinned[0] || DEFAULT_ID);
  if (!pinned.includes(active)) pinned = pinned.length >= MAX_PINNED ? [...pinned.slice(0, MAX_PINNED - 1), active] : [...pinned, active];
  return { v: 1, active, pinned, picked: o.picked === true };
}

/** Make `id` the active workspace (pinning it when it is not pinned). */
export const withActive = (w, id) => sanitiseWorkspace({ ...sanitiseWorkspace(w), active: id, picked: true });

/** Pin or unpin `id`; at least one stays pinned and at most 3. Returns the new choice, or the old one when refused. */
export function withPinned(w, id, on) {
  const cur = sanitiseWorkspace(w);
  if (!IDS.has(id)) return cur;
  const has = cur.pinned.includes(id);
  if (on && !has) return cur.pinned.length >= MAX_PINNED ? cur : sanitiseWorkspace({ ...cur, pinned: [...cur.pinned, id], picked: true });
  if (!on && has) return cur.pinned.length <= 1 ? cur : sanitiseWorkspace({ ...cur, pinned: cur.pinned.filter((x) => x !== id), active: cur.active === id ? cur.pinned.find((x) => x !== id) : cur.active, picked: true });
  return cur;
}
