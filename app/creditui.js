/* creditui.js -- the Credit card on the deal screen: who pays the rent, who
 * guarantees it, the ratings the broker typed, store sales and go-dark. Nothing
 * is looked up or filled in: the OM's guarantor is offered with a Use tap. The
 * checks are credit.js creditChecks. dealui.js hands this module
 * `h` = { deal, touch(meta) }; every edit goes through h.touch, so Undo and
 * history cover it. Typing is read when a field is left, and only the checks
 * are redrawn. The record is in backups and on this screen; it is on no export. */

import { el, parseNum, toast, localDate } from './kit.js';
import { dateInput } from './dateinput.js';
import { newCredit, creditChecks, readRating, ratingGap, ratingLine, clip, AGENCIES, partyLabel, MAX_TEXT, MAX_LONG } from './credit.js';

const ok = (x) => typeof x === 'number' && Number.isFinite(x);
const moneyText = (v) => (ok(v) ? v.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }) : '');
const occupied = (d) => ((d.rr && d.rr.leases) || []).filter((L) => !L.vacant);

/** Draw the card into `box`. */
export function renderCreditCard(box, h) {
  const d = h.deal;
  const draw = () => renderCreditCard(box, h);
  box.textContent = '';
  const head = el('div', 'card-head');
  head.appendChild(el('h2', null, 'Credit'));
  box.appendChild(head);
  if (!d.credit) {
    box.appendChild(el('p', 'hint credit-hint', 'Record who pays the rent and who guarantees it. Zlatura never looks a rating up.'));
    const add = el('button', 'btn btn-primary btn-sm', 'Add a credit record');
    add.type = 'button';
    add.id = 'credit-add';
    add.addEventListener('click', () => { const o = occupied(d); d.credit = newCredit(o.length === 1 ? o[0].id : null); h.touch({ label: 'Added a credit record' }); draw(); });
    box.appendChild(add);
    return;
  }
  const c = d.credit;
  const g = c.guarantor;
  const today = localDate();
  const lease = c.leaseId ? occupied(d).find((L) => L.id === c.leaseId) || null : null;
  const checksBox = el('div', 'credit-checks');
  checksBox.id = 'credit-checks';
  const update = () => {
    checksBox.textContent = '';
    for (const k of creditChecks(c, { lease, figures: d.figures, today, asOf: (d.rr && d.rr.settings && d.rr.settings.asOf) || today })) {
      const p = el('p', 'warn-text hint-sm', k.text);
      p.dataset.check = k.id;
      checksBox.appendChild(p);
    }
  };
  const changed = (what) => { h.touch({ label: `Credit: ${what}` }); update(); };

  const row = (ul, id, label, control) => {
    const li = el('li');
    const lab = el('label', 'fl', label);
    lab.htmlFor = id;
    control.id = id;
    li.append(lab, control);
    ul.appendChild(li);
    return control;
  };
  const text = (value, max, onSet, what) => {
    const inp = el('input', 'text');
    inp.value = value || '';
    inp.maxLength = max;
    inp.autocomplete = 'off';
    inp.addEventListener('change', () => { inp.value = clip(inp.value, max); onSet(inp.value); changed(what); });
    return inp;
  };
  const select = (options, value, onSet, what) => {
    const s = el('select');
    for (const [v, t] of options) { const o = el('option', null, t); o.value = v; s.appendChild(o); }
    s.value = value ?? '';
    s.addEventListener('change', () => { onSet(s.value || null); changed(what); if (what === 'guaranty scope' || what === 'lease') draw(); });
    return s;
  };

  box.appendChild(el('div', 'sec-label', 'Who pays and who guarantees')).style.margin = '12px 16px 4px';
  const who = el('ul', 'figs');
  const leases = occupied(d);
  if (leases.length) row(who, 'credit-lease', 'Lease in the rent roll', select([['', 'Not linked'], ...leases.map((L) => [L.id, `${L.unit || 'Suite'} · ${L.tenant || 'no tenant name'}`])], lease ? c.leaseId : '', (v) => { c.leaseId = v; }, 'lease'));
  row(who, 'credit-entity', 'Tenant entity on the lease', text(c.leaseEntity, MAX_TEXT, (v) => { c.leaseEntity = v; }, 'tenant entity'));
  row(who, 'credit-parent', 'Parent (only if a third entity)', text(c.parent, MAX_TEXT, (v) => { c.parent = v; }, 'parent'));
  row(who, 'credit-guarantor', 'Guarantor', text(g.name, MAX_TEXT, (v) => { g.name = v; }, 'guarantor'));
  row(who, 'credit-scope', 'Guaranty', select([['', 'Not known'], ['full', 'Full'], ['limited', 'Limited'], ['none', 'None']], g.scope, (v) => { g.scope = v; }, 'guaranty scope'));
  if (g.scope === 'limited') row(who, 'credit-limit', 'Guaranty limit', text(g.limit, MAX_LONG, (v) => { g.limit = v; }, 'guaranty limit'));
  const endLi = el('li');
  const endLab = el('label', 'fl', 'Guaranty ends');
  endLab.htmlFor = 'credit-ends';
  endLi.append(endLab, dateInput({ value: g.endsOn, label: 'Guaranty ends', id: 'credit-ends', onCommit: (iso) => { g.endsOn = iso || null; changed('guaranty end'); } }));
  who.appendChild(endLi);
  box.appendChild(who);
  if (c.leaseId && !lease) box.appendChild(el('p', 'warn-text hint-sm', 'The lease this record was for is no longer in the rent roll; choose it again.'));
  const om = clip(d.figures.guarantor);
  if (om && !g.name) {
    const use = el('button', 'btn btn-plain btn-sm', `Use the OM’s guarantor (${om.length > 40 ? `${om.slice(0, 40)}…` : om})`);
    use.type = 'button';
    use.id = 'credit-use-om';
    use.addEventListener('click', () => { g.name = om; h.touch({ label: 'Credit: guarantor from the OM' }); draw(); });
    box.appendChild(use);
  }

  box.appendChild(el('div', 'sec-label', 'Ratings (typed by you)')).style.margin = '12px 16px 4px';
  const list = el('ul', 'credit-ratings');
  c.ratings.forEach((r, i) => {
    const li = el('li', 'credit-rating');
    li.appendChild(el('span', null, ratingLine(c, r)));
    const rd = readRating(r.agency, r.rating);
    if (r.agency !== 'other' && rd.note) li.appendChild(el('small', 'hint-sm', ` ${rd.note}`));
    const rm = el('button', 'btn btn-plain btn-sm', 'Remove');
    rm.type = 'button';
    rm.setAttribute('aria-label', `Remove rating ${i + 1}`);
    rm.addEventListener('click', () => { c.ratings.splice(i, 1); h.touch({ label: `Credit: removed rating ${i + 1}` }); draw(); });
    li.appendChild(rm);
    list.appendChild(li);
  });
  box.appendChild(list);
  const draft = { of: 'tenant', agency: 'sp', agencyName: '', rating: '', outlook: '', asOf: '', source: '' };
  const form = el('ul', 'figs credit-form');
  const bind = (inp, key, max) => { inp.addEventListener('input', () => { draft[key] = inp.value.slice(0, max); }); inp.addEventListener('change', () => { draft[key] = inp.value.slice(0, max); }); return inp; };
  const sel = (key, opts) => { const s = el('select'); for (const [v, t] of opts) { const o = el('option', null, t); o.value = v; s.appendChild(o); } s.value = draft[key]; s.addEventListener('change', () => { draft[key] = s.value; }); return s; };
  const inp = (key, max) => { const i = el('input', 'text'); i.maxLength = max; i.autocomplete = 'off'; return bind(i, key, max); };
  row(form, 'credit-r-of', 'Rating is for', sel('of', Object.entries(partyLabel)));
  row(form, 'credit-r-agency', 'Agency', sel('agency', AGENCIES));
  row(form, 'credit-r-name', 'Agency name (if Other)', inp('agencyName', MAX_TEXT));
  row(form, 'credit-r-rating', 'Rating', inp('rating', MAX_TEXT));
  row(form, 'credit-r-outlook', 'Outlook', inp('outlook', MAX_TEXT));
  const asLi = el('li');
  const asLab = el('label', 'fl', 'Rating as of');
  asLab.htmlFor = 'credit-r-asof';
  asLi.append(asLab, dateInput({ value: '', label: 'Rating as of', id: 'credit-r-asof', onCommit: (iso) => { draft.asOf = iso || ''; } }));
  form.appendChild(asLi);
  row(form, 'credit-r-source', 'Where it came from', inp('source', MAX_LONG));
  box.appendChild(form);
  const gap = el('p', 'warn-text hint-sm');
  gap.id = 'credit-r-gap';
  gap.setAttribute('role', 'alert');
  const save = el('button', 'btn btn-plain btn-sm', 'Save the rating');
  save.type = 'button';
  save.id = 'credit-r-save';
  save.addEventListener('click', () => {
    const msg = ratingGap(draft);
    gap.textContent = msg;
    if (msg) return;
    // capitals are evened out only for an exact match on the agency's scale
    c.ratings.push({ id: `r${Date.now().toString(36)}${c.ratings.length}`, of: draft.of, agency: draft.agency, agencyName: clip(draft.agencyName), rating: readRating(draft.agency, draft.rating).rating, outlook: clip(draft.outlook), asOf: draft.asOf, source: clip(draft.source, MAX_LONG), typedOn: today });
    h.touch({ label: 'Credit: added a rating' });
    draw();
  });
  box.append(save, gap);

  box.appendChild(el('div', 'sec-label', 'Store sales and go dark')).style.margin = '12px 16px 4px';
  const more = el('ul', 'figs');
  const setSales = (key, v) => {
    const s = c.sales || (c.sales = { annual: null, year: '', source: '' });
    s[key] = v;
    if (s.annual === null && !s.year && !s.source) c.sales = null;
  };
  const sales = el('input', 'n');
  sales.inputMode = 'decimal';
  sales.autocomplete = 'off';
  sales.placeholder = '—';
  sales.value = moneyText(c.sales && c.sales.annual);
  sales.addEventListener('change', () => { setSales('annual', parseNum(sales.value)); sales.value = moneyText(c.sales && c.sales.annual); changed('store sales'); });
  row(more, 'credit-sales', 'Annual store sales', sales);
  const sy = text(c.sales && c.sales.year, 20, (v) => setSales('year', v), 'sales year');
  row(more, 'credit-sales-year', 'Sales year', sy);
  row(more, 'credit-sales-source', 'Sales source', text(c.sales && c.sales.source, MAX_LONG, (v) => setSales('source', v), 'sales source'));
  row(more, 'credit-godark', 'Lease lets the tenant go dark', select([['', 'Not recorded'], ['yes', 'Yes'], ['no', 'No']], c.goDark.state, (v) => { c.goDark.state = v; }, 'go dark'));
  box.appendChild(more);
  box.appendChild(el('p', 'hint-sm credit-note', 'Store sales stay on this device and in backups. They are never exported.'));
  box.appendChild(checksBox);

  const rmAll = el('button', 'btn btn-plain btn-sm', 'Remove the credit record');
  rmAll.type = 'button';
  rmAll.id = 'credit-remove';
  rmAll.addEventListener('click', () => {
    const gone = d.credit;
    delete d.credit;
    h.touch({ label: 'Removed the credit record' });
    draw();
    toast('Credit record removed.', { label: 'Undo', run: () => { if (!d.credit) { d.credit = gone; h.touch({ label: 'Restored the credit record' }); draw(); } } });
  });
  box.appendChild(rmAll);
  update();
}
