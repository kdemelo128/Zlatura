/* preview.js -- the New look's hover preview: pointing at, or tabbing to, a section in the desktop rail or a
 * workspace tab shows a small bubble of what will open: its name, one line of what it is for, and two or three live
 * facts from this device. A floating control, so it follows the glass rules (it is a .tip-bubble). It is a tooltip:
 * never focusable, never takes the focus, Escape or leaving closes it, it waits a moment, it is not shown on a touch
 * screen, and with reduced motion (or the Motion switch off) it appears with no fade. Built with DOM methods only. */

import * as crm from './crm.js';
import { listAllDeals } from './dealui.js';
import { stageOf, taskBuckets } from './pipeline.js';
import { toolIndex } from './toolsui.js';
import { workspaceById } from './workspaces.js';
import { el } from './kit.js';

const DELAY = 350;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What each main section is for, in one line. */
export const SECTION_LINE = {
  home: 'What needs attention today, your pipeline, tasks and contacts.',
  deal: 'Read an offering memorandum or start a deal; each deal keeps its figures, files and next steps.',
  underwrite: 'Underwrite a deal from documents or a quick set of inputs.',
  comps: 'Sale and lease comparables, imported from CoStar or Excel and kept on this device.',
  tools: 'Calculators for loans, returns, leases and commissions.',
  review: 'Figures held back by a check and questions waiting for you.',
  settings: 'Look, templates, stages, the AI connection and your data on this device.',
};
const SECTION_TITLE = { home: 'Home', deal: 'Deals', underwrite: 'Underwrite', comps: 'Comps', tools: 'Tools', review: 'Review', settings: 'Settings' };

/** The facts a preview can show, read from this device. */
async function snapshot() {
  const [deals, tasks, contacts] = await Promise.all([listAllDeals().catch(() => []), crm.listTasks().catch(() => []), crm.listContacts().catch(() => [])]);
  const active = deals.filter((d) => !['dead', 'closed'].includes(stageOf(d)));
  const b = taskBuckets(tasks);
  return { deals, active, due: b.overdue.length + b.today.length, open: tasks.filter((t) => !t.done).length, contacts: contacts.length, tools: toolIndex().length };
}

/**
 * The content of a preview: { title, line, facts[] }. Pure over a snapshot, so a test can check it.
 * @param {{kind: 'section' | 'workspace', id: string}} t @param {Awaited<ReturnType<typeof snapshot>>} s
 */
export function previewFor(t, s) {
  if (t.kind === 'workspace') {
    const ws = workspaceById(t.id);
    const have = new Set(toolIndex().map((x) => x.id));
    return { title: ws.name, line: ws.line, facts: [plural(ws.tools.filter((x) => have.has(x)).length, 'tool') + ' first', plural(s.active.length, 'active deal'), s.due ? `${plural(s.due, 'task')} due or overdue` : 'Nothing due today'] };
  }
  const facts = {
    home: [plural(s.active.length, 'active deal'), s.due ? `${plural(s.due, 'task')} due or overdue` : 'Nothing due today', plural(s.contacts, 'contact')],
    deal: [plural(s.deals.length, 'deal'), `${s.active.length} active`],
    underwrite: [plural(s.deals.length, 'deal') + ' to work from'],
    comps: ['Imports CoStar and Excel files', 'Kept on this device'],
    tools: [plural(s.tools, 'calculator')],
    review: [],
    settings: [],
  }[t.id] || [];
  return { title: SECTION_TITLE[t.id] || t.id, line: SECTION_LINE[t.id] || '', facts };
}

/** What a hoverable element opens, or null. */
const targetOf = (node) => {
  const e = node && node.closest ? node.closest('.sidebar .tab[data-view], .wsp-rail-tab[data-ws], .wsp-tab[id^="ws-tab-"]') : null;
  if (!e || e.closest('[hidden]')) return null;
  if (e.dataset.view) return { e, kind: 'section', id: e.dataset.view };
  if (e.dataset.ws) return { e, kind: 'workspace', id: e.dataset.ws };
  return { e, kind: 'workspace', id: e.id.slice('ws-tab-'.length) };
};

export const canPreview = () => document.documentElement.dataset.look === 'new' && !!window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export function initPreview() {
  let bubble = null, timer = 0, shown = null, token = 0;
  const hide = () => {
    clearTimeout(timer); token++;
    if (bubble) { bubble.remove(); bubble = null; }
    if (shown) { shown.removeAttribute('aria-describedby'); shown = null; }
  };
  const place = (b, e) => {
    const r = e.getBoundingClientRect(), w = b.offsetWidth, h = b.offsetHeight, side = e.closest('.sidebar');
    let x = side ? r.right + 10 : r.left, y = side ? r.top + r.height / 2 - h / 2 : r.bottom + 8;
    x = Math.max(8, Math.min(x, innerWidth - w - 8)); y = Math.max(8, Math.min(y, innerHeight - h - 8));
    b.style.left = `${Math.round(x)}px`; b.style.top = `${Math.round(y)}px`;
  };
  async function show(t) {
    const mine = ++token;
    const data = previewFor(t, await snapshot());
    if (mine !== token || !canPreview()) return;
    hide(); token = mine;
    const b = el('div', 'tip-bubble preview-bubble');
    b.id = 'preview-bubble';
    b.setAttribute('role', 'tooltip');
    b.append(el('b', 'preview-title', data.title), el('span', 'preview-line', data.line));
    if (data.facts.length) { const ul = el('ul', 'preview-facts'); for (const f of data.facts) ul.appendChild(el('li', null, f)); b.appendChild(ul); }
    document.body.appendChild(b);
    place(b, t.e);
    bubble = b; shown = t.e;
    t.e.setAttribute('aria-describedby', b.id);
  }
  const arm = (e) => {
    if (!canPreview()) return;
    const t = targetOf(e.target);
    if (!t || t.e === shown) return;
    hide();
    timer = setTimeout(() => show(t), DELAY);
  };
  document.addEventListener('mouseover', arm);
  document.addEventListener('mouseout', (e) => { if (targetOf(e.target) && !(e.relatedTarget && targetOf(e.target).e.contains(e.relatedTarget))) hide(); });
  // keyboard focus only (a click that focuses a button must not open one)
  document.addEventListener('focusin', (e) => { if (e.target.matches && e.target.matches(':focus-visible')) arm(e); });
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (bubble || timer)) hide(); }, true);
  document.addEventListener('click', hide, true);
  document.addEventListener('viewchange', hide);
  window.addEventListener('scroll', hide, { passive: true });
}
