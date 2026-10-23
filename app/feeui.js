/* feeui.js -- the Fee card on the deal screen: the fee terms, the expected
 * fee and its splits, what was invoiced, the payments and what is still
 * owed. The arithmetic is calc.js feeSummary (one fee formula, commission());
 * dealui.js keeps the deal, its history and its saves, and hands this module
 * `h` = { deal, touch(meta), asking }. Every edit goes through h.touch, so
 * Undo and history cover it. Typing is read when the field is left, as the
 * figures list does, and only the calculated lines are redrawn. */

import { el, parseNum, parsePct, money2, pct, toast } from './kit.js';
import { dateInput } from './dateinput.js';
import { feeSummary } from './calc.js';

const ok = (x) => typeof x === 'number' && Number.isFinite(x);
const moneyText = (v) => (ok(v) ? v.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }) : '');
const pctText = (v) => (ok(v) ? String(v) : '');
// a rate typed as 0.5 means 0.5%, not 50% (commission rates are often under 1)
const rateOf = (s) => parsePct(s, { fraction: false });

/** Draw the card into `box`. */
export function renderFeeCard(box, h) {
  const d = h.deal;
  const draw = () => renderFeeCard(box, h);
  box.textContent = '';
  const head = el('div', 'card-head');
  head.appendChild(el('h2', null, 'Fee'));
  box.appendChild(head);
  if (!d.fee) {
    box.appendChild(el('p', 'hint fee-hint', 'Record the fee on this deal: the terms, what was invoiced and what has been paid. Nothing is assumed.'));
    const add = el('button', 'btn btn-primary btn-sm', 'Add a fee record');
    add.type = 'button';
    add.id = 'fee-add';
    add.addEventListener('click', () => { d.fee = { price: null, flatPct: null, tiers: [], coBrokerPct: null, referralPct: null, housePct: null, invoiced: null, paid: [] }; h.touch({ label: 'Added a fee record' }); draw(); });
    box.appendChild(add);
    return;
  }
  const f = d.fee;
  head.appendChild(el('span', 'count', 'type as you would say them: 6.45m, 3%, 0.5%'));
  const expectedBox = el('div', 'fee-sum');
  expectedBox.id = 'fee-expected';
  const owedBox = el('div', 'fee-sum');
  owedBox.id = 'fee-owed';

  const line = (into, label, value, strong, sub) => {
    const r = el('div', `fee-line${strong ? ' strong' : ''}`);
    r.appendChild(el('span', null, label));
    if (sub) r.appendChild(el('small', null, sub));
    r.appendChild(el('b', null, value));
    into.appendChild(r);
  };
  const update = () => {
    const S = feeSummary(f);
    expectedBox.textContent = '';
    const E = S.expected;
    if (!ok(f.price) || f.price <= 0) expectedBox.appendChild(el('p', 'hint-sm', 'The expected fee stays blank until there is a fee price: it is never guessed.'));
    else if (!E) expectedBox.appendChild(el('p', 'hint-sm', 'Enter a flat rate, or a rate for at least one tier, to see the expected fee.'));
    else {
      line(expectedBox, 'Expected fee', money2(E.total), true, `${pct(E.effectivePct, 2)} of the fee price`);
      if (E.lines.some((l) => l.note)) expectedBox.appendChild(el('p', 'warn-text hint-sm', 'Part of the price has no rate: add a top tier.'));
      if (E.coBroker === null) expectedBox.appendChild(el('p', 'hint-sm', 'Enter all three shares (0 counts as entered) to see the split.'));
      else {
        for (const [k, v] of /** @type {[string, number][]} */ ([['Co-operating broker', E.coBroker], ['Our side', E.listingSide], ['Referral', E.referral], ['House', E.house]])) line(expectedBox, k, money2(v));
        line(expectedBox, 'Agent', money2(E.agent), true);
      }
    }
    owedBox.textContent = '';
    if (S.invoiced === null) owedBox.appendChild(el('p', 'hint-sm', 'Nothing invoiced yet.'));
    else {
      line(owedBox, 'Invoiced', money2(S.invoiced));
      if (S.paidToDate === null) owedBox.appendChild(el('p', 'hint-sm', 'Enter the amount of every payment to see what is outstanding.'));
      else {
        line(owedBox, 'Paid to date', money2(S.paidToDate), false, S.lastPaid ? `last on ${S.lastPaid}` : '');
        line(owedBox, S.outstanding < 0 ? 'Overpaid by' : 'Outstanding', money2(Math.abs(S.outstanding)), true);
      }
    }
  };
  const changed = (what) => { h.touch({ label: `Fee: ${what}` }); update(); };

  /** A typed number: read on leaving the field, shown back as kept (what could not be read is left blank, as the figures list does). */
  const numberRow = (ul, id, label, get, set, read, show, what, note) => {
    const li = el('li');
    const lab = el('label', 'fl', label);
    if (note) lab.appendChild(el('small', null, note));
    const inp = el('input', 'n');
    inp.id = id;
    lab.htmlFor = id;
    inp.value = show(get());
    inp.autocomplete = 'off';
    inp.inputMode = 'decimal';
    inp.placeholder = '—';
    inp.addEventListener('change', () => { set(read(inp.value)); inp.value = show(get()); changed(what); });
    li.append(lab, inp);
    ul.appendChild(li);
  };
  const money = (ul, id, label, get, set, what, note) => numberRow(ul, id, label, get, set, parseNum, moneyText, what, note);
  const rate = (ul, id, label, get, set, what, note) => numberRow(ul, id, label, get, set, rateOf, pctText, what, note);

  box.appendChild(el('div', 'sec-label', 'Terms')).style.margin = '12px 16px 4px';
  const terms = el('ul', 'figs');
  money(terms, 'fee-price', 'Fee price', () => f.price, (v) => { f.price = v; }, 'price');
  rate(terms, 'fee-flat', 'Flat rate %', () => f.flatPct, (v) => { f.flatPct = v; }, 'flat rate', 'used instead of the tiers when entered');
  const tier = (i) => f.tiers[i] || {};
  const setTier = (i, key, v) => {
    while (f.tiers.length <= i) f.tiers.push({ upTo: null, pct: null });
    f.tiers[i][key] = v;
    while (f.tiers.length && f.tiers[f.tiers.length - 1].upTo === null && f.tiers[f.tiers.length - 1].pct === null) f.tiers.pop();
  };
  if (!Array.isArray(f.tiers)) f.tiers = [];
  for (let i = 0; i < 3; i++) {
    if (i < 2) money(terms, `fee-tier-up-${i + 1}`, `Tier ${i + 1}: up to $`, () => tier(i).upTo, (v) => setTier(i, 'upTo', v), `tier ${i + 1} limit`);
    rate(terms, `fee-tier-pct-${i + 1}`, i < 2 ? `Tier ${i + 1} rate %` : 'Above the last tier, rate %', () => tier(i).pct, (v) => setTier(i, 'pct', v), `tier ${i + 1} rate`);
  }
  rate(terms, 'fee-co', 'To the co-operating broker %', () => f.coBrokerPct, (v) => { f.coBrokerPct = v; }, 'co-broker share');
  rate(terms, 'fee-ref', 'Referral, % of our side', () => f.referralPct, (v) => { f.referralPct = v; }, 'referral share');
  rate(terms, 'fee-house', 'House share, % after referral', () => f.housePct, (v) => { f.housePct = v; }, 'house share');
  box.appendChild(terms);
  if (!(ok(f.price) && f.price > 0) && ok(d.figures.price) && d.figures.price > 0) {
    const use = el('button', 'btn btn-plain btn-sm', `Use the asking price (${money2(d.figures.price).replace(/\.00$/, '')})`);
    use.type = 'button';
    use.id = 'fee-use-asking';
    // as if typed: the same path a typed price takes
    use.addEventListener('click', () => { f.price = d.figures.price; h.touch({ label: 'Fee: price from the asking price' }); draw(); });
    box.appendChild(use);
  }
  box.appendChild(expectedBox);

  box.appendChild(el('div', 'sec-label', 'Invoiced')).style.margin = '12px 16px 4px';
  const setInv = (key, v) => {
    const inv = f.invoiced || (f.invoiced = { amount: null, on: null, ref: '' });
    inv[key] = v;
    if (inv.amount === null && !inv.on && !inv.ref) f.invoiced = null;
  };
  const inv = el('ul', 'figs');
  money(inv, 'fee-inv-amount', 'Amount invoiced', () => f.invoiced && f.invoiced.amount, (v) => setInv('amount', v), 'invoice amount');
  const dateLi = el('li');
  const dateLab = el('label', 'fl', 'Invoice date');
  dateLab.htmlFor = 'fee-inv-on';
  dateLi.append(dateLab, dateInput({ value: f.invoiced && f.invoiced.on, label: 'Invoice date', id: 'fee-inv-on', onCommit: (iso) => { setInv('on', iso || null); changed('invoice date'); } }));
  inv.appendChild(dateLi);
  const refLi = el('li');
  const refLab = el('label', 'fl', 'Invoice reference');
  refLab.htmlFor = 'fee-inv-ref';
  const ref = el('input', 'text');
  ref.id = 'fee-inv-ref';
  ref.value = (f.invoiced && f.invoiced.ref) || '';
  ref.autocomplete = 'off';
  ref.addEventListener('change', () => { setInv('ref', ref.value.trim()); changed('invoice reference'); });
  refLi.append(refLab, ref);
  inv.appendChild(refLi);
  box.appendChild(inv);

  box.appendChild(el('div', 'sec-label', 'Payments')).style.margin = '12px 16px 4px';
  if (!Array.isArray(f.paid)) f.paid = [];
  const pays = el('div', 'fee-pays');
  f.paid.forEach((p, i) => {
    const r = el('div', 'rr-line fee-pay');
    const amt = el('input', 'n');
    amt.id = `fee-pay-amount-${i + 1}`;
    amt.setAttribute('aria-label', `Payment ${i + 1} amount`);
    amt.inputMode = 'decimal';
    amt.autocomplete = 'off';
    amt.placeholder = 'Amount';
    amt.value = moneyText(p.amount);
    amt.addEventListener('change', () => { p.amount = parseNum(amt.value); amt.value = moneyText(p.amount); changed(`payment ${i + 1} amount`); });
    const on = dateInput({ value: p.on, label: `Payment ${i + 1} date`, id: `fee-pay-on-${i + 1}`, onCommit: (iso) => { p.on = iso || null; changed(`payment ${i + 1} date`); } });
    const pr = el('input', 'text');
    pr.id = `fee-pay-ref-${i + 1}`;
    pr.setAttribute('aria-label', `Payment ${i + 1} reference`);
    pr.placeholder = 'Reference';
    pr.autocomplete = 'off';
    pr.value = p.ref || '';
    pr.addEventListener('change', () => { p.ref = pr.value.trim(); changed(`payment ${i + 1} reference`); });
    const rm = el('button', 'btn btn-plain btn-sm', 'Remove');
    rm.type = 'button';
    rm.setAttribute('aria-label', `Remove payment ${i + 1}`);
    rm.addEventListener('click', () => { f.paid.splice(i, 1); h.touch({ label: `Fee: removed payment ${i + 1}` }); draw(); });
    r.append(amt, on, pr, rm);
    pays.appendChild(r);
  });
  box.appendChild(pays);
  const addPay = el('button', 'btn btn-plain btn-sm', 'Add a payment');
  addPay.type = 'button';
  addPay.id = 'fee-add-payment';
  addPay.addEventListener('click', () => { f.paid.push({ amount: null, on: null, ref: '' }); h.touch({ label: 'Fee: added a payment' }); draw(); });
  box.appendChild(addPay);
  box.appendChild(owedBox);

  const rmAll = el('button', 'btn btn-plain btn-sm', 'Remove the fee record');
  rmAll.type = 'button';
  rmAll.id = 'fee-remove';
  rmAll.addEventListener('click', () => {
    const gone = d.fee;
    delete d.fee;
    h.touch({ label: 'Removed the fee record' });
    draw();
    toast('Fee record removed.', { label: 'Undo', run: () => { if (!d.fee) { d.fee = gone; h.touch({ label: 'Restored the fee record' }); draw(); } } });
  });
  box.appendChild(rmAll);
  update();
}
