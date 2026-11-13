/* The New look's saved-deal library. Search, ordering and pagination are view state only;
 * stored deals and their figures are never changed or recomputed here. */
import { el, statusChip, short, pct, int, niceDate } from './kit.js';
import { STAGES, STAGE_LABEL, stageOf } from './pipeline.js';

const nameOf = (d) => String(d.name || d.figures?.address || 'Untitled deal');
const searchText = (s) => String(s ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-US');
const updated = (d) => Number.isFinite(d.updatedAt) ? d.updatedAt : 0;
const names = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true });
const byName = (a, b) => names.compare(nameOf(a), nameOf(b));

/** Filter the full saved list before taking a page; return a new array without touching a deal. */
export function filterDeals(deals, { query = '', stage = '', sort = 'updated' } = {}) {
  const terms = searchText(query).trim().split(/\s+/).filter(Boolean);
  return deals.filter((d) => {
    if (stage && stageOf(d) !== stage) return false;
    const f = d.figures || {};
    const text = searchText([nameOf(d), f.address, f.city, f.state, f.ptype].filter(Boolean).join(' '));
    return terms.every((term) => text.includes(term));
  }).sort(sort === 'name' ? byName : (a, b) => updated(b) - updated(a) || byName(a, b));
}

/** A saved-deal library for renderLanding; `openDeal(id)` is the only action that leaves this view. */
export function renderDealsList(deals, { openDeal, newDeal, readOm }) {
  const library = el('section', 'card deals-library');
  library.setAttribute('aria-labelledby', 'deals-library-title');
  const heading = el('div', 'dl-head');
  const title = el('h2', null, 'Your deals');
  title.id = 'deals-library-title';
  const count = el('span', 'count', `${deals.length} saved`);
  heading.append(title, count);
  const starts = el('div', 'dl-start-actions');
  for (const [label, run, cls] of [['Choose OM', readOm, 'btn'], ['New deal', newDeal, 'btn btn-primary']]) {
    const action = el('button', cls, label); action.type = 'button';
    action.addEventListener('click', run); starts.appendChild(action);
  }
  heading.appendChild(starts);
  library.appendChild(heading);

  const tools = el('div', 'dl-tools');
  const control = (label, input) => {
    const wrap = el('div', 'dl-control');
    const text = el('label', 'dl-label', label);
    text.htmlFor = input.id;
    wrap.append(text, input);
    return wrap;
  };
  const search = el('input', 'input dl-search');
  search.id = 'deals-search'; search.type = 'search';
  search.placeholder = 'Name, address or property type';
  search.autocomplete = 'off';
  tools.appendChild(control('Search deals', search));
  const stage = el('select', 'input'); stage.id = 'deals-stage';
  const option = (select, value, label) => {
    const o = el('option', null, label); o.value = value; select.appendChild(o);
  };
  option(stage, '', 'All stages');
  for (const [key, label] of STAGES) option(stage, key, label);
  tools.appendChild(control('Stage', stage));
  const sort = el('select', 'input'); sort.id = 'deals-sort';
  option(sort, 'updated', 'Recently updated'); option(sort, 'name', 'Name A–Z');
  tools.appendChild(control('Sort by', sort));
  library.appendChild(tools);

  const resultBar = el('div', 'dl-result-bar');
  const result = el('p', 'dl-results'); result.id = 'deals-results';
  result.setAttribute('role', 'status'); result.setAttribute('aria-live', 'polite'); result.setAttribute('aria-atomic', 'true');
  const clear = el('button', 'btn btn-plain btn-sm', 'Clear filters');
  clear.type = 'button'; clear.id = 'deals-clear';
  resultBar.append(result, clear); library.appendChild(resultBar);

  const gridHead = el('div', 'dl-grid-head'); gridHead.setAttribute('aria-hidden', 'true');
  for (const [cls, word] of [['dl-property', 'Property'], ['dl-stage', 'Stage'], ['dl-price', 'Asking price'], ['dl-cap', 'Saved cap rate'], ['dl-area', 'Building SF'], ['dl-updated', 'Updated']]) gridHead.appendChild(el('span', cls, word));
  library.appendChild(gridHead);
  const rows = el('div', 'dl-rows'); library.appendChild(rows);
  const empty = el('div', 'dl-empty');
  empty.appendChild(el('h3', null, deals.length ? 'No matching deals' : 'No deals yet'));
  empty.appendChild(el('p', 'hint', deals.length ? 'Try another name, address or stage, or clear your filters.' : 'Choose an OM, enter figures by hand or try the fictional example below.'));
  library.appendChild(empty);
  const more = el('button', 'btn dl-more', 'Show more deals'); more.type = 'button'; more.id = 'deals-more';
  library.appendChild(more);

  let limit = 30;
  function draw() {
    const filtered = filterDeals(deals, { query: search.value, stage: stage.value, sort: sort.value });
    const shown = filtered.slice(0, limit);
    rows.textContent = '';
    const fragment = document.createDocumentFragment();
    for (const d of shown) {
      const f = d.figures || {};
      const row = el('button', 'dl-row'); row.type = 'button'; row.dataset.dealId = d.id;
      const property = el('span', 'dl-property');
      const name = el('span', 'dl-name li-title', nameOf(d));
      property.appendChild(name);
      const detail = [f.ptype, [f.city, f.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
      if (detail) property.appendChild(el('span', 'dl-detail', detail));
      if (f.address && f.address !== nameOf(d)) property.appendChild(el('span', 'dl-detail dl-address', f.address));
      if (d.confidential) property.appendChild(el('span', 'dl-confidential', 'Confidential'));
      row.appendChild(property);
      const stageCell = el('span', 'dl-stage');
      stageCell.appendChild(statusChip(stageOf(d) === 'closed' ? 'good' : stageOf(d) === 'dead' ? 'plain' : 'accent', STAGE_LABEL[stageOf(d)]));
      row.appendChild(stageCell);
      for (const [cls, label, value] of [
        ['dl-price', 'Asking price', short(f.price)], ['dl-cap', 'Saved cap rate', pct(f.cap)],
        ['dl-area', 'Building SF', typeof f.bsf === 'number' && Number.isFinite(f.bsf) ? int(f.bsf) : '—'], ['dl-updated', 'Updated', niceDate(d.updatedAt)],
      ]) {
        const metric = el('span', `dl-metric ${cls}`);
        metric.append(el('span', 'dl-metric-label', label), el('span', 'dl-value', value));
        row.appendChild(metric);
      }
      const chevron = el('span', 'dl-chevron'); chevron.setAttribute('aria-hidden', 'true'); chevron.textContent = '›';
      row.appendChild(chevron);
      row.addEventListener('click', () => openDeal(d.id));
      fragment.appendChild(row);
    }
    rows.appendChild(fragment);
    result.textContent = `Showing ${shown.length} of ${filtered.length} deal${filtered.length === 1 ? '' : 's'}.`;
    clear.hidden = !search.value && !stage.value && sort.value === 'updated';
    empty.hidden = filtered.length > 0;
    gridHead.hidden = filtered.length === 0;
    more.hidden = shown.length >= filtered.length;
    more.textContent = `Show more deals (${filtered.length - shown.length} remaining)`;
  }
  for (const [input, event] of [[search, 'input'], [stage, 'change'], [sort, 'change']]) input.addEventListener(event, () => { limit = 30; draw(); });
  clear.addEventListener('click', () => { search.value = ''; stage.value = ''; sort.value = 'updated'; limit = 30; draw(); search.focus(); });
  more.addEventListener('click', () => { const previous = rows.children.length; limit += 30; draw(); rows.children[previous]?.focus(); });
  draw();
  return library;
}
