/* pulseui.js -- Home's pulse panel (the pipeline by stage, or a 12-week sparkline, and this week's chips) with the monal perched on
 * its edge, and the "Customise Home" sheet. The numbers come from pulse.js, which takes them from the person's own deals and tasks.
 * Motion is transform and opacity only (styles.css, `.pulse`), off under reduced motion and the Motion switch. */

import './monal-vector.js';
import { el, short } from './kit.js';
import { CHARTS, WEEKS, describe, arrange, move, savePrefs } from './pulse.js';

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, kids = []) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  for (const k of kids) n.appendChild(k);
  return n;
};

/** The bird, from the shared drawing in monal-vector.js (the underwriting tool draws the same one). */
function bird() {
  const box = el('div', 'pulse-bird');
  box.setAttribute('aria-hidden', 'true');
  const art = /** @type {any} */ (globalThis).UWMonalArt;
  if (art) box.innerHTML = art.svg('pulsebird');
  return box;
}

const EMPTY = {
  flow: 'Add your first deal to see your pipeline move.',
  deals: 'No deals added in the last 12 weeks. Add one and it shows here.',
  tasks: 'No tasks finished in the last 12 weeks. Tick one off and it shows here.',
};

/** Horizontal bars, one per active stage that has deals: label, bar, count and asking value. */
function flowChart(d) {
  const f = d.flow;
  const box = el('div', 'pulse-flow');
  f.rows.forEach((r, i) => {
    const row = el('div', 'pulse-row');
    row.style.setProperty('--i', String(i));
    const track = el('div', 'pulse-track');
    const bar = el('div', 'pulse-bar');
    // a stage with deals always shows a sliver, so a small stage is not mistaken for an empty one
    bar.style.width = `${Math.max(3, Math.round(f.frac(r) * 100))}%`;
    track.appendChild(bar);
    const val = f.mode === 'value' && r.value ? short(r.value) : '';
    row.append(el('span', 'pulse-label', r.label), track, el('span', 'pulse-val', `${r.count}${val ? ` · ${val}` : ''}`));
    box.appendChild(row);
  });
  if (f.mode === 'value') {
    const unpriced = f.rows.reduce((t, r) => t + (r.count - r.priced), 0);
    if (unpriced) box.appendChild(el('div', 'pulse-note', `${unpriced} unpriced ${unpriced === 1 ? 'deal is' : 'deals are'} counted, not sized.`));
  } else box.appendChild(el('div', 'pulse-note', 'No asking prices yet, so bars show deal counts.'));
  return box;
}

/** Twelve weekly columns, oldest to newest, the current week in the accent colour. */
function spark(series, total, what) {
  const box = el('div', 'pulse-spark');
  const W = 240; const H = 64; const gap = 6; const cw = (W - gap * (WEEKS - 1)) / WEEKS;
  const max = Math.max(1, ...series);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pulse-svg', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' });
  series.forEach((n, i) => {
    const h = n ? Math.max(5, (n / max) * (H - 4)) : 2;
    const wk = WEEKS - 1 - i;
    const r = sv('rect', { x: i * (cw + gap), y: H - h, width: cw, height: h, rx: 2.5, class: `pulse-col${i === WEEKS - 1 ? ' now' : ''}${n ? '' : ' none'}` });
    r.style.setProperty('--i', String(i));
    r.appendChild(sv('title', {}, [document.createTextNode(`${n} ${what} ${wk === 0 ? 'this week' : `${wk} week${wk === 1 ? '' : 's'} ago`}`)]));
    svg.appendChild(r);
  });
  box.appendChild(svg);
  const foot = el('div', 'pulse-spark-foot');
  foot.append(el('span', null, `${WEEKS} weeks ago`), el('span', null, 'this week'));
  const big = el('div', 'pulse-big');
  big.append(el('b', null, String(total)), document.createTextNode(` ${what} in ${WEEKS} weeks`));
  return [big, box, foot];
}

/**
 * The panel. `go` has what a chip opens: `{ tasks(), file(), pipeline() }`; `chart` is the one showing; `pick(id)` stores a new one.
 * @param {{ data: ReturnType<import('./pulse.js').pulseData>, chart: string, pick: (id: string) => void, go: Record<string, () => void> }} a
 */
export function pulsePanel({ data, chart, pick, go }) {
  const c = el('section', 'pulse');
  c.id = 'home-pulse';
  c.setAttribute('aria-label', 'Pulse');
  c.appendChild(bird());

  const head = el('div', 'pulse-head');
  head.appendChild(el('h2', 'pulse-title', 'Pulse'));
  const seg = el('div', 'pulse-seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Chart');
  for (const ch of CHARTS) {
    const b = el('button', 'pulse-pick', ch.id === 'flow' ? 'Pipeline' : ch.id === 'deals' ? 'Deals' : 'Tasks');
    b.type = 'button';
    b.title = ch.label;
    b.setAttribute('aria-pressed', String(ch.id === chart));
    b.addEventListener('click', () => pick(ch.id));
    seg.appendChild(b);
  }
  head.appendChild(seg);
  c.appendChild(head);

  const stage = el('div', 'pulse-stage');
  stage.setAttribute('role', 'img');
  stage.setAttribute('aria-label', describe(chart, data, short));
  let empty = false;
  if (chart === 'flow') {
    if (data.flow.rows.length) stage.appendChild(flowChart(data));
    else empty = true;
  } else {
    const [series, total, what] = chart === 'deals' ? [data.added, data.addedTotal, 'deals added'] : [data.done, data.doneTotal, 'tasks done'];
    if (total) stage.append(...spark(series, total, what));
    else empty = true;
  }
  if (empty) {
    // a dashed outline, no figures: it says where a chart will be, not what is in it
    const ghost = el('div', 'pulse-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i++) ghost.appendChild(el('i'));
    stage.append(ghost, el('p', 'pulse-empty', data.hasDeals || chart !== 'flow' ? EMPTY[chart] : EMPTY.flow));
  }
  c.appendChild(stage);

  const chips = el('div', 'pulse-chips');
  chips.setAttribute('aria-label', 'This week');
  chips.setAttribute('role', 'group');
  const chip = (n, label, on, cls = '') => {
    const b = el('button', `pulse-chip${n ? '' : ' zero'}${cls}`);
    b.type = 'button';
    b.append(el('b', null, String(n)), document.createTextNode(` ${label}`));
    b.addEventListener('click', on);
    chips.appendChild(b);
  };
  chip(data.chips.today, 'due today', go.tasks);
  chip(data.chips.overdue, 'overdue', go.tasks, data.chips.overdue ? ' warn' : '');
  chip(data.chips.week, 'next 7 days', go.tasks);
  chip(data.chips.toFile, 'to file', go.file);
  c.appendChild(chips);
  return c;
}

/**
 * The Customise Home sheet: which panels show, in what order, and the pulse chart. `titles` maps a panel id to its name;
 * `ids` is the workspace's own order. `change(prefs)` is called after each choice (the choices are already kept).
 */
export function customiseHome({ api, ids, titles, prefs, change }) {
  const body = api.sheetOpen({ eyebrow: 'Home', title: 'Customise Home', sub: 'Choose what Home shows and in what order. This is kept on this device only; nothing is deleted when a panel is hidden.' });
  const state = { ...prefs, order: [...prefs.order], hidden: [...prefs.hidden] };
  const commit = () => { savePrefs(state); change({ ...state }); draw(); };
  const draw = () => {
    body.textContent = '';
    // the pulse panel and its chart
    const pulse = el('label', 'chk cust-row');
    const pb = el('input'); pb.type = 'checkbox'; pb.checked = state.pulse; pb.id = 'cust-pulse';
    pb.addEventListener('change', () => { state.pulse = pb.checked; commit(); });
    pulse.append(pb, el('span', null, 'Pulse panel (top right)'));
    body.appendChild(pulse);
    const cg = el('fieldset', 'cust-charts');
    cg.appendChild(el('legend', null, 'Pulse chart'));
    for (const ch of CHARTS) {
      const l = el('label', 'chk cust-row');
      const r = el('input'); r.type = 'radio'; r.name = 'cust-chart'; r.value = ch.id; r.checked = state.chart === ch.id; r.disabled = !state.pulse;
      r.addEventListener('change', () => { state.chart = ch.id; commit(); });
      l.append(r, el('span', null, `${ch.label}: ${ch.what}`));
      cg.appendChild(l);
    }
    body.appendChild(cg);
    // the panels
    body.appendChild(el('h3', 'cust-h', 'Panels'));
    const list = arrange(ids, state);
    const ul = el('div', 'cust-list');
    ul.setAttribute('role', 'list');
    list.forEach(({ id, shown }, i) => {
      const row = el('div', 'cust-panel');
      row.setAttribute('role', 'listitem');
      const l = el('label', 'chk cust-row');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = shown;
      cb.addEventListener('change', () => { state.hidden = cb.checked ? state.hidden.filter((x) => x !== id) : [...state.hidden, id]; state.order = list.map((x) => x.id); commit(); });
      l.append(cb, el('span', null, titles[id] || id));
      const mv = (by, label, glyph) => {
        const b = el('button', 'btn btn-sm cust-move', glyph);
        b.type = 'button';
        b.setAttribute('aria-label', `${label}: ${titles[id] || id}`);
        const j = i + by;
        b.disabled = j < 0 || j >= list.length;
        b.addEventListener('click', () => { state.order = move(list, id, by); commit(); setTimeout(() => body.querySelector(`[data-mv="${id}${by}"]`)?.focus(), 0); });
        b.dataset.mv = `${id}${by}`;
        return b;
      };
      row.append(l, mv(-1, 'Move up', '↑'), mv(1, 'Move down', '↓'));
      ul.appendChild(row);
    });
    body.appendChild(ul);
    const reset = el('button', 'btn cust-reset', 'Reset to the default Home');
    reset.type = 'button';
    reset.addEventListener('click', () => { state.order = []; state.hidden = []; state.chart = 'flow'; state.pulse = true; commit(); });
    body.appendChild(reset);
  };
  draw();
}
