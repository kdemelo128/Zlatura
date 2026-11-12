/* assistantanswer.js -- Monal, the on-device assistant: answering a question.
 *
 * Every figure here comes from the shared engine (deal.js, engine/, calc.js, lease.js, already worked out
 * into `ctx.m` and `ctx.rrSum` by the deal screen) or is a stored value of the deal. Nothing is worked out a
 * second way. Every answer says where it came from (`cites`, each with somewhere to go), says the unit of every
 * figure (a year or a month, SF or units), and a blank input is reported as blank with a button to the field:
 * never zero, never a guess. Text only: the screen draws every string as a text node. Pure, no DOM.
 *
 * ctx = { deal, input, m, rrSum, comps, today, hasDeal } where `deal` is dealui.js dealForAssistant().
 * A result is { kind: 'answer' | 'refuse' | 'confirm' | 'open', lines, items, cites, blanks, suggest, action?, go? }.
 * `go` is { view } | { pane } | { section } | { field } | { source } (dealui.js assistantGo). */

import { money0, money2, pct, int, times } from './kit.js';
import { runScenario, scenarioAnswers } from './deal.js';
import { feeSummary } from './calc.js';
import { waltMethod } from './engine/walt.js';
import { BREAK_EVEN_LABEL } from './engine/breakeven.js';
import { DEAL_INPUTS, sourceOf } from './dealfields.js';
import { sourceLabel } from './aifacts.js';
import { QUESTIONS, GLOSSARY } from './assistant.js';
import { PRODUCT } from './brand.js';
import { previewFor } from './assistantact.js';
import { search, tokens } from './docindex.js';
import { FIELDS, extractField, sayFigure, compareWithDeal, looksLikeInstruction, NOT_CHECKED } from './docfacts.js';

const ok = (x) => typeof x === 'number' && Number.isFinite(x);
const LABEL = Object.fromEntries(DEAL_INPUTS.map((f) => [f.key, f.label]));
const KIND = Object.fromEntries(DEAL_INPUTS.map((f) => [f.key, f.kind]));
const FIELD_NAME = { price: 'the asking price', noi: 'the NOI', cap: 'the cap rate', occ: 'occupancy', taxes: 'real estate taxes', opex: 'operating expenses', gross: 'gross income', gpr: 'gross potential rent', bsf: 'building SF', units: 'units' };
const nameOf = (key) => FIELD_NAME[key] || (LABEL[key] || key).toLowerCase();
const day = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const plural = (n, one, many = `${one}s`) => `${int(n)} ${n === 1 ? one : many}`;
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const result = (kind, lines, more = {}) => ({ kind, lines, items: [], cites: [], blanks: [], suggest: [], ...more });
const refuse = (lines, more = {}) => result('refuse', Array.isArray(lines) ? lines : [lines], more);
const blank = (key, why) => ({ text: `${cap1(nameOf(key))} is blank in this deal${why ? `, ${why}` : ''}. I have not assumed a value.`, go: { field: key }, label: `Go to ${LABEL[key] || key}` });
const blankLoan = (what) => ({ text: `${cap1(what)} is not set in this deal’s financing. I have not assumed a value.`, go: { section: 'dsec-finance' }, label: 'Go to Financing' });

/** Where a deal figure came from, in words, and where to look at it. */
function whereFrom(deal, key, m) {
  const s = deal.sources && deal.sources[key];
  const derived = m && m.derived && m.derived[key];
  let text = s && s.ai ? sourceLabel(s) : sourceOf(deal, key, m) || 'entered in the deal';
  if (s && s.page && !s.hand && !s.ai && !s.t12 && !derived) text = `${deal.source ? `“${deal.source}”` : 'the OM'}, page ${s.page}`;
  const opens = !derived && s && (s.ai || (s.page && !s.t12));
  return { text: `${LABEL[key] || cap1(nameOf(key))}: ${text}`, go: opens ? { source: key } : { field: key } };
}

/** What each figure reads, for naming the blank input when it can't be worked out. */
const NEEDS = {
  price: ['price'], noi: ['noi'], cap: ['noi', 'price'], ppsf: ['price', 'bsf'], perUnit: ['price', 'units'], noiPsf: ['noi', 'bsf'],
  occ: ['occ'], equity: ['price'], cashOnCash: ['price', 'noi'], cashFlow: ['noi', 'price'], expenseRatio: ['opex', 'gross'],
};
const METRIC = {
  price: ['Asking price', (v) => `${money0(v)} (a one-time price)`],
  noi: ['NOI', (v) => `${money0(v)} a year`],
  cap: ['Cap rate', (v) => `${pct(v)} (a year’s NOI ÷ the price)`],
  ppsf: ['Price per SF', (v) => `${money2(v)} per SF of building`],
  perUnit: ['Price per unit', (v) => `${money0(v)} per unit`],
  noiPsf: ['NOI per SF', (v) => `${money2(v)} per SF per year`],
  occ: ['Occupancy', (v) => `${pct(v, 1)}`],
  equity: ['Equity needed', (v) => `${money0(v)} (the price less the loan, plus closing costs; one-time)`],
  cashOnCash: ['Cash-on-cash, year 1', (v) => `${pct(v, 1)} a year`],
  cashFlow: ['Cash flow after debt service', (v) => `${money0(v)} a year`],
  expenseRatio: ['Expense ratio', (v) => `${pct(v, 1)} (operating expenses ÷ gross income)`],
};
/** The deal's own value of an input the engine reads (price and NOI may be worked out from the others). */
const inputValue = (ctx, key) => (key === 'price' || key === 'noi' ? ctx.m[key] : ctx.deal.figures[key]);
const blanksFor = (ctx, keys) => keys.filter((k) => !ok(inputValue(ctx, k))).map((k) => blank(k));

const loanTerms = (L) => `${ok(L.ltv) ? `${L.ltv}% of the price borrowed` : 'loan-to-value not set'}, ${ok(L.rate) ? `${L.rate}% interest` : 'rate not set'}, ${L.io ? 'interest only' : ok(L.amort) ? `${L.amort}-year amortization` : 'amortization not set'}`;
const LOAN_NOTE = 'These are the deal’s financing terms; any you have not changed are the app’s starting values, not a lender’s quote.';

/* ------------------------------------------------------------ the answers */

function capAtPrice(q, ctx) {
  if (q.ambiguous) return refuse([`I read “${q.ambiguous}” as a number with no k or m, so I can’t tell what price you mean. Write it as $4.6M or $4,600,000.`]);
  if (!ok(q.price)) return refuse(['Which price? For example: “What is the cap rate at $4.6M?”']);
  const { m } = ctx;
  if (!ok(m.noi)) return refuse(['I can’t work out a cap rate without a NOI, and the NOI is blank.'], { blanks: [blank('noi')] });
  const run = runScenario(ctx.input, m, { price: q.price });
  const c = run.m.cap;
  if (!ok(c)) return refuse(['The cap rate can’t be worked out at that price.']);
  const r = result('answer', [`At a price of ${money0(q.price)} the cap rate is ${pct(c)}: a year’s NOI of ${money0(m.noi)} ÷ the price.`]);
  if (ok(m.cap) && ok(m.price) && m.price !== q.price) r.lines.push(`At the deal’s own price of ${money0(m.price)} it is ${pct(m.cap)}.`);
  if (m.derived && m.derived.noi) r.lines.push('The NOI here was worked out from the price and the stated cap rate, not entered.');
  r.cites.push(whereFrom(ctx.deal, 'noi', m), { text: 'The price: the one you typed in the question; nothing was changed in the deal.', go: { field: 'price' } });
  return r;
}

function priceForCap(q, ctx) {
  const { m } = ctx;
  if (!ok(q.cap) || q.cap <= 0 || q.cap > 50) return refuse(['I couldn’t read a cap rate between 0% and 50% in that.']);
  if (!ok(m.noi)) return refuse(['I can’t work out a price without a NOI, and the NOI is blank.'], { blanks: [blank('noi')] });
  if (m.noi <= 0) return refuse([`The NOI is ${money0(m.noi)} a year, so no price gives a ${pct(q.cap)} cap rate.`], { cites: [whereFrom(ctx.deal, 'noi', m)] });
  const a = scenarioAnswers(ctx.input, m, {}, { targetCap: q.cap });
  const r = result('answer', [`A ${pct(q.cap)} cap rate works out to a price of ${money0(a.priceForCap)}: a year’s NOI of ${money0(m.noi)} ÷ ${pct(q.cap)}.`]);
  if (ok(m.price)) r.lines.push(`For comparison the deal’s price is ${money0(m.price)}${ok(m.cap) ? ` (${pct(m.cap)} cap)` : ''}.`);
  r.cites.push(whereFrom(ctx.deal, 'noi', m));
  return r;
}

function dscrAnswer(q, ctx) {
  const { m, deal } = ctx;
  const L = deal.loan || {};
  const why = [];
  if (!ok(m.noi)) why.push(blank('noi'));
  if (!ok(m.price)) why.push(blank('price'));
  if (!ok(L.ltv)) why.push(blankLoan('loan-to-value'));
  if (!ok(L.rate)) why.push(blankLoan('the interest rate'));
  if (!ok(L.amort) && !L.io) why.push(blankLoan('the amortization'));
  const loanCites = [{ text: `Loan terms: ${loanTerms(L)}.`, go: { section: 'dsec-finance' } }];
  const noiCite = whereFrom(deal, 'noi', m);
  if (q.which === 'maxLoan') {
    const s = m.maxLoan;
    if (!s) return refuse(['The largest loan can’t be worked out yet.'], { blanks: why });
    const r = result('answer', [`The largest loan this deal supports is ${money0(s.loan)} (a one-time amount), set by the ${s.binding} test.`,
      `Each test: ${Object.entries(s.tests).map(([k, v]) => `${k} ${money0(v)}`).join('; ')}.`,
      `The tests use a minimum DSCR of ${ok(L.minDscr) ? times(L.minDscr) : 'not set'} and a minimum debt yield of ${ok(L.minDy) ? pct(L.minDy, 1) : 'not set'}. ${LOAN_NOTE}`]);
    r.cites.push(noiCite, ...loanCites);
    return r;
  }
  const want = { dscr: m.dscr, debtService: m.debtService, loan: m.loan, debtYield: m.debtYield }[q.which];
  if (!ok(want)) return refuse([`That can’t be worked out yet: ${why.length ? 'an input is blank.' : 'the financing terms don’t give an answer.'}`], { blanks: why });
  const lines = [];
  if (q.which === 'dscr') lines.push(`The DSCR is ${times(m.dscr)}: a year’s NOI of ${money0(m.noi)} ÷ a year’s debt service of ${money0(m.debtService)}.`);
  if (q.which === 'debtService') lines.push(`Debt service is ${money0(m.debtService)} a year (${money0(m.debtService / 12)} a month) on a loan of ${money0(m.loan)}.`);
  if (q.which === 'loan') lines.push(`The loan at these terms is ${money0(m.loan)} (a one-time amount): ${loanTerms(L)}.`);
  if (q.which === 'debtYield') lines.push(`The debt yield is ${pct(m.debtYield)}: a year’s NOI of ${money0(m.noi)} ÷ the loan of ${money0(m.loan)}.`);
  lines.push(`Loan terms used: ${loanTerms(L)}. ${LOAN_NOTE}`);
  const r = result('answer', lines);
  r.cites.push(noiCite, ...loanCites);
  return r;
}

function expiriesAnswer(q, ctx) {
  const { rrSum, deal } = ctx;
  if (!rrSum || !rrSum.units) return refuse(['There is no rent roll in this deal, so I can’t list lease expiries. I have not guessed from the OM’s single-tenant lease terms.'], { blanks: [{ text: 'The rent roll is empty.', go: { pane: 'rentroll' }, label: 'Open the rent roll' }] });
  const asOf = deal.rollAsOf ? ` as of ${deal.rollAsOf}` : '';
  const src = { text: `The rent roll${asOf}${deal.rollSource ? `, read from ${deal.rollSource}` : ''}. Rent is the contract rent in force that day, per year.`, go: { pane: 'rentroll' } };
  const noDate = rrSum.expirations.find((e) => e.year === 'No date');
  const tail = noDate ? [`${plural(noDate.count, 'occupied lease')} ${noDate.count === 1 ? 'has' : 'have'} no end date on the rent roll, so ${noDate.count === 1 ? 'it is' : 'they are'} in no year below.`] : [];
  if (q.year) {
    const e = rrSum.expirations.find((x) => x.year === q.year);
    if (!e) return result('answer', [`No occupied lease on the rent roll ends in ${q.year}.`, ...tail], { cites: [src] });
    const r = result('answer', [`${plural(e.count, 'lease')} end${e.count === 1 ? 's' : ''} in ${q.year}: ${int(e.sf)} SF and ${money0(e.rent)} a year of in-place rent${ok(e.rentPct) ? ` (${pct(e.rentPct, 1)} of the rent roll’s rent)` : ''}.`, ...tail], { cites: [src] });
    for (const row of rrSum.rows.filter((x) => x.occupied && x.end && Number(x.end.slice(0, 4)) === q.year).sort((a, b) => a.end.localeCompare(b.end))) {
      r.items.push({ text: `${row.unit ? `Unit ${row.unit}, ` : ''}${row.tenant || 'no tenant name'}: ends ${row.end}, ${money0(row.annual)} a year${ok(row.sf) ? `, ${int(row.sf)} SF` : ''}` });
    }
    return r;
  }
  const dated = rrSum.expirations.filter((x) => x.year !== 'No date');
  if (!dated.length) return result('answer', ['No occupied lease on the rent roll has an end date.', ...tail], { cites: [src] });
  const r = result('answer', ['Lease expiries by year (occupied leases; rent is per year):', ...tail], { cites: [src] });
  for (const e of dated) r.items.push({ text: `${e.year}: ${plural(e.count, 'lease')}, ${int(e.sf)} SF, ${money0(e.rent)} a year${ok(e.rentPct) ? ` (${pct(e.rentPct, 1)})` : ''}` });
  return r;
}

function waltAnswer(q, ctx) {
  const { rrSum, deal } = ctx;
  const w = rrSum && ok(rrSum.walt) ? rrSum.walt : ctx.m.leases && ok(ctx.m.leases.walt) ? ctx.m.leases.walt : null;
  if (!rrSum && !(ctx.m.leases)) return refuse(['There is no rent roll in this deal, so there is no WALT. I have not guessed one from the OM.'], { blanks: [{ text: 'The rent roll is empty.', go: { pane: 'rentroll' }, label: 'Open the rent roll' }] });
  if (!ok(w)) return refuse(['The WALT can’t be worked out: no occupied lease has an end date.'], { blanks: [{ text: 'Lease end dates are blank on the rent roll.', go: { pane: 'rentroll' }, label: 'Open the rent roll' }] });
  const how = waltMethod({}, deal.rollAsOf || '');
  return result('answer', [`The WALT is ${w.toFixed(1)} years, ${how}.`, 'It counts only leases with an end date; month-to-month and undated leases are left out unless Settings says otherwise.'],
    { cites: [{ text: `The rent roll${deal.rollAsOf ? ` as of ${deal.rollAsOf}` : ''}; the method is set in Settings, Calculation conventions.`, go: { pane: 'rentroll' } }] });
}

function missingAnswer(q, ctx) {
  const { m, deal } = ctx;
  const items = [];
  const need = [['address', deal.figures.address], ['ptype', deal.figures.ptype], ['price', m.price], ['noi', m.noi], ['bsf', deal.figures.bsf], ['occ', m.occ], ['gross', deal.figures.gross], ['opex', deal.figures.opex], ['taxes', deal.figures.taxes]];
  if (/multi/i.test(deal.figures.ptype || '')) need.push(['units', deal.figures.units]);
  for (const [key, v] of need) if (v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v))) items.push({ text: `${LABEL[key]} is blank.`, go: { field: key }, goLabel: `Go to ${LABEL[key]}` });
  if (!ctx.rrSum) items.push({ text: 'There is no rent roll.', go: { pane: 'rentroll' }, goLabel: 'Open the rent roll' });
  else {
    const undated = ctx.rrSum.rows.filter((r) => r.occupied && !r.end).length;
    if (undated) items.push({ text: `${plural(undated, 'occupied lease')} ${undated === 1 ? 'has' : 'have'} no end date.`, go: { pane: 'rentroll' }, goLabel: 'Open the rent roll' });
  }
  if (!deal.hasStatement) items.push({ text: 'There is no operating statement (T-12).', go: { section: 'dsec-statement' }, goLabel: 'Open the statement' });
  if (!ctx.comps) items.push({ text: 'No sale comps are loaded, so there is nothing to compare the price with.', go: { view: 'comps' }, goLabel: 'Open Comps' });
  if (!items.length) return result('answer', ['Nothing core is blank: the address, type, price, NOI, size, occupancy, income, expenses and taxes are all in, and there is a rent roll, a statement and comps.'], { cites: [{ text: 'The deal’s key figures.', go: { section: 'dsec-figures' } }] });
  return result('answer', [`${plural(items.length, 'thing')} still missing or blank. Blank means not entered: none of them has been counted as zero.`], { items, cites: [{ text: 'The deal’s key figures.', go: { section: 'dsec-figures' } }] });
}

function reviewAnswer(q, ctx) {
  const { m, deal } = ctx;
  const items = [];
  for (const c of deal.openQc) items.push({ text: `Data QC: ${c.text}${c.where ? ` (${c.where})` : ''}`, go: { section: 'deal-qc' }, goLabel: 'Show it' });
  for (const c of m.checks || []) if (c.level === 'fail' || c.level === 'warn') items.push({ text: c.text, go: { section: 'dsec-checks' }, goLabel: 'Show it' });
  const notes = (m.checks || []).filter((c) => c.level === 'info').length;
  if (!items.length) return result('answer', [`Nothing is waiting for review in this deal${notes ? `; ${plural(notes, 'note')} for information only are on the deal screen` : ''}.`], { cites: [{ text: 'The deal’s checks (“What doesn’t add up”) and Data QC.', go: { section: 'dsec-checks' } }] });
  const shown = items.slice(0, 8);
  const r = result('answer', [`${plural(items.length, 'check')} ${items.length === 1 ? 'is' : 'are'} waiting for review${items.length > shown.length ? `; the first ${shown.length}` : ''}:`], { items: shown, cites: [{ text: 'The deal’s checks (“What doesn’t add up”) and Data QC.', go: { section: 'dsec-checks' } }] });
  if (items.length > shown.length) r.lines.push(`${items.length - shown.length} more are on the deal screen.`);
  return r;
}

function compsAnswer(q, ctx) {
  const { m, comps } = ctx;
  if (!comps) return refuse(['No sale comps are loaded, so I have nothing to compare this deal with.'], { blanks: [{ text: 'Comps is empty.', go: { view: 'comps' }, label: 'Open Comps' }] });
  const lines = [`Your comp set has ${plural(comps.n, 'priced sale comp')}: median ${money2(comps.median)} per SF${ok(comps.weighted) ? `, weighted ${money2(comps.weighted)} per SF` : ''}${ok(comps.medianCap) ? `; median cap rate ${pct(comps.medianCap)} (${comps.capN} report one)` : ''}.`];
  const blanks = [];
  if (ok(m.ppsf)) {
    lines.push(`This deal asks ${money2(m.ppsf)} per SF${ok(m.vsMedian) ? `: ${Math.abs(m.vsMedian).toFixed(1)}% ${m.vsMedian >= 0 ? 'above' : 'below'} the median` : ''}${ok(m.vsWeighted) ? ` and ${Math.abs(m.vsWeighted).toFixed(1)}% ${m.vsWeighted >= 0 ? 'above' : 'below'} the weighted figure` : ''}.`);
  } else blanks.push(...blanksFor(ctx, ['price', 'bsf']));
  if (ok(m.cap) && ok(comps.medianCap)) lines.push(`Its cap rate is ${pct(m.cap)} against the comps’ median of ${pct(comps.medianCap)}.`);
  if (ok(m.valueAtMedianCap)) lines.push(`At the comps’ median cap rate the NOI is worth ${money0(m.valueAtMedianCap)}.`);
  if (ok(m.valueAtWeighted)) lines.push(`At the comps’ weighted price per SF the building is worth ${money0(m.valueAtWeighted)}.`);
  if (m.thinCaps) lines.push('Few comps report a cap rate, so the cap-rate comparison is thin.');
  if (blanks.length) lines.push('The price per SF comparison needs the blank input below.');
  return result('answer', lines, { blanks, cites: [{ text: `The Comps screen (${plural(comps.n, 'priced sale comp')}) and the deal’s price and building SF.`, go: { view: 'comps' } }] });
}

function breakevenAnswer(q, ctx) {
  const { m, deal } = ctx;
  if (ok(m.breakEven)) {
    return result('answer', [`${BREAK_EVEN_LABEL[m.breakEvenBasis] || 'Break-even occupancy'} is ${pct(m.breakEven, 1)}: operating expenses plus a year’s debt service, as a share of ${m.breakEvenBasis === 'gpr' ? 'gross potential rent' : m.breakEvenBasis === 'egi-occ' ? 'gross income scaled up to full occupancy' : 'current gross income'}.`,
      m.breakEvenBasis === 'gpr' ? 'Occupancy above this leaves cash flow after the loan payments.' : 'This is an estimate: the deal has no gross potential rent.'],
    { cites: [{ text: 'Operating expenses, gross income and the loan terms in the deal.', go: { section: 'dsec-finance' } }] });
  }
  const blanks = [];
  if (!ok(deal.figures.opex)) blanks.push(blank('opex'));
  if (!ok(m.debtService)) blanks.push(...blanksFor(ctx, ['price', 'noi']).slice(0, 2), blankLoan('the loan terms'));
  if (!ok(deal.figures.gpr) && !ok(deal.figures.gross)) blanks.push(blank('gpr'));
  return refuse(['Break-even occupancy can’t be worked out yet.'], { blanks });
}

function commissionAnswer(q, ctx) {
  const { m, deal } = ctx;
  if (q.ambiguous) return refuse([`I read “${q.ambiguous}” as a number with no k or m, so I can’t tell what price you mean. Write it as $4.6M or $4,600,000.`]);
  const price = ok(q.price) ? q.price : m.price;
  if (!ok(price)) return refuse(['I need a price: type one (“at $4.6M”) or enter the asking price.'], { blanks: [blank('price')] });
  const f = deal.fee;
  if (!f) return refuse(['This deal has no fee record, so I don’t know your rate. I have not assumed one.'], { blanks: [{ text: 'The fee terms are blank.', go: { section: 'dsec-fee' }, label: 'Go to the Fee card' }] });
  const S = feeSummary({ ...f, price });
  const E = S.expected;
  if (!E) return refuse(['The fee terms on this deal are incomplete (a flat rate, or a rate for each tier, with limits that rise).'], { blanks: [{ text: 'The fee terms are incomplete.', go: { section: 'dsec-fee' }, label: 'Go to the Fee card' }] });
  const lines = [`At a price of ${money0(price)} the commission is ${money0(E.total)}, ${pct(E.effectivePct, 2)} of the price (a one-time amount at closing).`];
  if (ok(E.agent)) lines.push(`After the co-broker, referral and house splits on the deal, your share is ${money0(E.agent)}.`);
  else lines.push('The splits (co-broker, referral, house) are not all filled in, so I show only the total.');
  return result('answer', lines, { cites: [{ text: `The fee terms recorded on this deal${ok(q.price) ? ', at the price you typed' : ', at the deal’s price'}.`, go: { section: 'dsec-fee' } }] });
}

function sourceAnswer(q, ctx) {
  const { m, deal } = ctx;
  if (!q.key) return refuse(['Which figure? Pick one:'], { suggest: ['Where did the NOI come from?', 'Where did the price come from?', 'Where did the cap rate come from?', 'Where did the occupancy come from?'] });
  const [label, show] = METRIC[q.key] || [LABEL[q.key], (v) => String(v)];
  const v = q.key === 'price' || q.key === 'noi' ? m[q.key] : q.key === 'cap' ? m.cap : q.key === 'occ' ? m.occ : deal.figures[q.key];
  if (v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v))) return refuse([`${cap1(nameOf(q.key))} is blank in this deal, so there is no source to show. I have not assumed a value.`], { blanks: [blank(q.key)] });
  const shown = q.key in METRIC ? show(v) : (KIND[q.key] === 'money' ? `${money0(v)}` : String(v));
  const r = result('answer', [`${label || LABEL[q.key]}: ${shown}.`]);
  if (q.key === 'cap') {
    if (ok(m.capCalc)) r.lines.push('Worked out here as a year’s NOI ÷ the price, so it rests on those two figures.');
    r.cites.push(whereFrom(deal, 'noi', m), whereFrom(deal, 'price', m));
    if (ok(deal.figures.cap)) r.lines.push(`The deal also holds a stated cap rate of ${pct(deal.figures.cap)}, used only when NOI ÷ price can’t be worked out.`);
  } else if (q.key === 'occ') {
    r.lines.push(m.occSource === 'rent roll' ? 'Occupancy is from the rent roll (by SF); no occupancy is stated in the OM.' : 'Occupancy is as stated in the deal (the OM or typed).');
    r.cites.push(m.occSource === 'rent roll' ? { text: 'The rent roll, by SF.', go: { pane: 'rentroll' } } : whereFrom(deal, 'occ', m));
  } else r.cites.push(whereFrom(deal, q.key, m));
  return r;
}

function metricAnswer(q, ctx) {
  const { m, deal } = ctx;
  const [label, show] = METRIC[q.metric];
  const v = m[q.metric];
  if (!ok(v)) return refuse([`${label} can’t be worked out because ${blanksFor(ctx, NEEDS[q.metric]).length ? 'an input is blank' : 'the deal doesn’t give it'}. I have not assumed a value.`], { blanks: blanksFor(ctx, NEEDS[q.metric]) });
  const r = result('answer', [`${label}: ${show(v)}.`]);
  const keys = q.metric === 'price' || q.metric === 'noi' ? [q.metric] : NEEDS[q.metric];
  for (const k of keys) if (ok(inputValue(ctx, k))) r.cites.push(whereFrom(deal, k, m));
  if ((q.metric === 'cashOnCash' || q.metric === 'cashFlow' || q.metric === 'equity') && ok(m.equity)) r.lines.push(`Loan terms used: ${loanTerms(deal.loan || {})}. ${LOAN_NOTE}`);
  return r;
}

function summaryAnswer(q, ctx) {
  const { m, deal } = ctx;
  const f = deal.figures;
  const lines = [`${deal.name || f.address || 'This deal'}${f.ptype ? `, ${f.ptype}` : ''}${[f.city, f.state].filter(Boolean).length ? `, ${[f.city, f.state].filter(Boolean).join(', ')}` : ''}.`];
  const row = (key) => { const [label, show] = METRIC[key]; return ok(m[key]) ? `${label}: ${show(m[key])}.` : null; };
  for (const k of ['price', 'noi', 'cap', 'ppsf', 'occ']) { const t = row(k); if (t) lines.push(t); }
  if (ok(f.bsf)) lines.push(`Building: ${int(f.bsf)} SF.`);
  if (ok(m.dscr)) lines.push(`DSCR: ${times(m.dscr)} on the deal’s financing terms.`);
  const missing = ['price', 'noi', 'bsf', 'occ'].filter((k) => !ok(k === 'price' || k === 'noi' || k === 'occ' ? m[k] : f[k]));
  const r = result('answer', lines, { cites: [{ text: 'The deal’s key figures.', go: { section: 'dsec-figures' } }] });
  if (missing.length) r.blanks.push({ text: `Blank, so left out: ${missing.map((k) => LABEL[k].toLowerCase()).join(', ')}.`, go: { section: 'dsec-figures' }, label: 'Open Key figures' });
  return r;
}

function notesAnswer(q, ctx) {
  const text = ctx.deal.notes;
  if (!text) return result('answer', ['There are no site visit notes in this deal.'], { cites: [{ text: 'Site visit.', go: { pane: 'visit' } }] });
  // quoted as data, never read as a request: the notes are the broker's words (or a document's), shown as they are
  return result('answer', ['Your site visit notes, shown as written. They are text I show you; I do not act on anything in them.'], { quote: text.slice(0, 1200), cites: [{ text: 'The deal’s Site visit notes.', go: { pane: 'visit' } }] });
}

function glossaryAnswer(q) {
  const g = GLOSSARY.find((x) => x.id === q.term);
  if (!g) return refuse([`I don’t have a definition of “${q.asked || 'that'}” yet. I can explain: ${GLOSSARY.map((x) => x.name).join(', ')}.`], { suggest: GLOSSARY.slice(0, 6).map((x) => `Explain ${x.name}`) });
  return result('answer', [g.text], { title: g.name, cites: [{ text: `${PRODUCT}’s built-in glossary (general definitions, not figures from your deal).`, go: null }] });
}

function taskAnswer(q, ctx) {
  if (!q.title) return refuse(['What should the task say? For example: “Add a task to call the lender on Friday”.']);
  const items = [{ text: `Task: ${q.title}` }, { text: q.due ? `Due: ${day(q.due)}` : 'Due: no date' }, { text: ctx.hasDeal ? `Deal: ${ctx.deal.name || ctx.deal.figures.address || 'the open deal'}` : 'Deal: none (it is a general task)' }];
  return result('confirm', ['I can add this task. Nothing is saved until you confirm, and you can undo it.'], { items, action: { kind: 'task', title: q.title, due: q.due, dealId: ctx.hasDeal ? ctx.deal.id : null } });
}

function openAnswer(q, ctx) {
  if (q.needsDeal && !ctx.hasDeal) return refuse([`There is no deal open, so there is no ${q.name} to show.`], { blanks: [{ text: 'Open or start a deal first.', go: { view: 'deal' }, label: 'Go to Deals' }] });
  return result('open', [`Opening ${q.name}.`], { go: q.go });
}

function helpAnswer() {
  return result('answer', ['I answer questions about the deal on screen from its own figures and the app’s own calculations, and I show where each one came from. I never guess: a blank input is reported as blank. Everything stays on this device. Things you can ask:'],
    { items: QUESTIONS.map((x) => ({ text: `${x.title}: “${x.example}”` })), suggest: QUESTIONS.map((x) => x.example) });
}


/* ------------------------------------------------------------ the deal's documents (assistant release 3) */

const docLabel = (d) => (d.role === 'om' ? 'the OM' : `“${d.name}”`);
const DOCS_BLANK = (ctx, text) => ({ text, go: { section: 'deal-dd' }, label: 'Open Documents' });
/** Words of a question that name the subject rather than the field: a tenant, a suite number. */
const subjectWords = (q) => (q.subject || []).filter((w) => w.length > 1).map((w) => w.toLowerCase().replace(/[^a-z0-9-]/g, '')).filter(Boolean);

/** One passage as a quoted card: the text exactly as the document has it, where it is, and the figure beside its label if one is. */
function passageCard(ix, hit, fieldId, subject) {
  const d = ix.docs[hit.passage.doc];
  const flagged = looksLikeInstruction(hit.text);
  const x = fieldId && !flagged ? extractField(fieldId, hit.text, { subject }) : null;
  return {
    docId: d.id, docName: d.name, role: d.role, page: hit.passage.page, pages: d.pages.length, text: hit.text, start: hit.passage.start, end: hit.passage.end, flagged,
    figure: x ? { text: sayFigure(x), note: NOT_CHECKED, field: x.field, value: x.value } : null,
  };
}

/** Why there are no passages to search: nothing read this session, or no documents at all. */
function noText(ctx) {
  const docs = ctx.deal.docs || [];
  if (!docs.length) return refuse(['This deal has no documents attached, so there is nothing for me to read. Add the OM, a lease or a T-12 on the Documents card and I can search it.'], { blanks: [DOCS_BLANK(ctx, 'No documents are recorded on this deal.')] });
  return refuse([`${docs.length === 1 ? 'The document' : 'The documents'} of this deal ${docs.length === 1 ? 'was' : 'were'} read in an earlier session, and ${PRODUCT} keeps no document text or file on this device. Add ${docs.length === 1 ? 'it' : 'them'} again on the Documents card and I can search ${docs.length === 1 ? 'it' : 'them'}.`],
    { blanks: [DOCS_BLANK(ctx, `${docs.length} document${docs.length === 1 ? '' : 's'} recorded on this deal; no text of ${docs.length === 1 ? 'it is' : 'them is'} held in this session.`)] });
}

/** What the rent roll holds for a tenant or a suite asked about: the deal's own record, shown before any document. */
function rollLines(q, ctx) {
  const rows = ctx.rrSum ? ctx.rrSum.rows : [];
  const e = q.engine || {};
  if (e.suite) {
    const row = rows.find((x) => String(x.unit ?? '').toLowerCase() === String(e.suite).toLowerCase());
    if (row) return [`On this deal’s rent roll, unit ${row.unit} is ${row.occupied ? row.tenant || 'occupied, with no tenant name' : 'vacant'}${row.occupied && row.end ? `; its lease ends ${row.end}` : ''}.`];
  }
  if (e.tenant) {
    const words = e.tenant.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    const hit = rows.filter((x) => x.occupied && x.tenant && words.length && words.every((w) => x.tenant.toLowerCase().includes(w)));
    if (hit.length === 1) return [`On this deal’s rent roll, ${hit[0].tenant}${hit[0].unit ? ` (unit ${hit[0].unit})` : ''} ${hit[0].end ? `ends ${hit[0].end}` : 'has no end date'}.`];
    if (hit.length > 1) return [`${hit.length} rent roll rows match “${e.tenant}”: ${hit.map((x) => `${x.tenant}${x.unit ? ` unit ${x.unit}` : ''}${x.end ? `, ends ${x.end}` : ''}`).join('; ')}.`];
  }
  return [];
}

/** "Find / what does the OM say about / the CAM charges / the escalations": the best passages, quoted, from this session's documents. */
function docAnswer(q, ctx) {
  const ix = ctx.docIndex || null;
  const first = rollLines(q, ctx);
  const query = String(q.query || '').replace(/^["'“]+|["'”]+$/g, '').trim();
  if (!query || !tokens(query).length) return refuse(['What should I look for? For example: “What does the OM say about the roof?” or “find parking”.']);
  if (!ix) { const r = noText(ctx); if (first.length) r.lines.unshift(...first); return r; }
  const found = search(ix, query);
  const subject = subjectWords(q);
  const names = ix.docs.map((d) => d.name);
  if (!found.hits.length) {
    const lines = [...first, `I searched ${ix.docs.length === 1 ? names[0] : `${ix.docs.length} documents (${names.slice(0, 4).join(', ')}${names.length > 4 ? ', …' : ''})`} for “${query}” and found nothing that answers it. I have not guessed.`];
    if (found.missing.length) lines.push(`None of the documents uses: ${found.missing.slice(0, 5).join(', ')}.`);
    return refuse(lines, { blanks: [DOCS_BLANK(ctx, 'The documents of this deal are listed on the Documents card.')], suggest: ['What does the OM say about parking?', 'find “roof”'] });
  }
  const passages = found.hits.map((h) => passageCard(ix, h, q.field, subject));
  const figure = passages.find((p) => p.figure);
  const r = result('answer', [...first, `${passages.length === 1 ? 'The best match' : `The ${passages.length} best matches`} in ${ix.docs.length === 1 ? names[0] : `the deal’s ${ix.docs.length} documents`}, quoted exactly:`], { passages });
  if (q.field && !figure) r.lines.push(`None of these gives ${FIELDS[q.field].title.toLowerCase()} as a plain figure next to its label, so I show the text and take nothing from it.`);
  if (passages.some((p) => p.flagged)) r.lines.push('A passage contains wording that reads like an instruction. It is quoted from the document as text; I did not act on it.');
  return r;
}

/** The deal's figures a document can state, and where the engine holds the deal's own value. */
const KEY_FIELD = { price: 'price', noi: 'noi', cap: 'cap', occ: 'occupancy' };

/** After an engine answer about a deal figure: what a document says of it, beside the deal's own, when a passage states it plainly. */
function withDocs(r, q, ctx) {
  const ix = ctx.docIndex;
  const key = q.id === 'metric' ? q.metric : q.id === 'source' ? q.key : null;
  const fieldId = key && KEY_FIELD[key];
  if (!ix || !fieldId || r.kind !== 'answer') return r;
  const F = FIELDS[fieldId];
  const { hits } = search(ix, F.query, { limit: 4, scope: null });
  for (const h of hits) {
    const x = extractField(fieldId, h.text);
    if (!x) continue;
    const card = passageCard(ix, h, fieldId, []);
    const d = ix.docs[h.passage.doc];
    const dealVal = ctx.m[key];
    const cmp = compareWithDeal(fieldId, x.value, dealVal);
    const say = `${docLabel(d)} says, on page ${h.passage.page}: ${sayFigure(x)} (${NOT_CHECKED}).`;
    r.lines.push(cmp === 'same' ? `${say} That matches the deal’s figure.` : cmp === 'differ' ? `${say} The deal holds ${showDeal(fieldId, dealVal)}, and that is the figure every calculation uses. The two differ; check the page.` : say);
    r.passages = [...(r.passages || []), card];
    r.cites.push({ text: `${docLabel(d)}, page ${h.passage.page}: the passage is quoted below.`, go: null });
    return r;
  }
  return r;
}
const showDeal = (fieldId, v) => (FIELDS[fieldId].kind === 'pct' ? pct(v) : money0(v));

/** Answer one understood question. @param {any} q from understand() @param {any} ctx */
export function answer(q, ctx) {
  if (q.id === 'empty') return refuse(['Type a question, or pick one below.']);
  if (q.id === 'unknown') {
    return refuse(['I can’t answer that yet. I only answer a fixed set of questions about your deal, and I don’t guess. Here is what I can do:'], { suggest: QUESTIONS.slice(0, 8).map((x) => x.example) });
  }
  const meta = QUESTIONS.find((x) => x.id === q.id);
  if (meta && meta.needsDeal && !ctx.hasDeal) {
    return refuse(['There is no deal open, so I have no figures to answer from. Open or start a deal first.'], { blanks: [{ text: 'No deal is open.', go: { view: 'deal' }, label: 'Go to Deals' }], suggest: ['Explain cap rate', 'Add a task to follow up on Friday', 'What can you do?'] });
  }
  const f = { cap_at_price: capAtPrice, price_for_cap: priceForCap, dscr: dscrAnswer, expiries: expiriesAnswer, walt: waltAnswer, missing: missingAnswer, review: reviewAnswer,
    comps: compsAnswer, breakeven: breakevenAnswer, commission: commissionAnswer, source: sourceAnswer, metric: metricAnswer, summary: summaryAnswer, notes: notesAnswer,
    ...Object.fromEntries(['set_figure', 'set_stage', 'next_step', 'add_contact', 'add_note', 'make_scenario', 'start_export', 'open_doc'].map((id) => [id, previewFor])),
    doc_ask: docAnswer, glossary: glossaryAnswer, task: taskAnswer, open: openAnswer, help: helpAnswer }[q.id];
  const r = f(q, ctx);
  return q.id === 'metric' || q.id === 'source' ? withDocs(r, q, ctx) : r;
}
