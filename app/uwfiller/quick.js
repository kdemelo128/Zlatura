/* uwfiller/quick.js -- the Quick check's reading and results, shared by Quick underwrite (underwrite.js) and the tool's Model
 * step (uwfiller/toolbridge.js). Nothing here works out money: the figures are the engine's (uwstore.js work -> deal.js
 * analyze / scenarioAnswers), and a typed field is read exactly as the deal page reads the same kind of field. */

import { parseNum, dec, int, money0, money2, pct, times, short } from '../kit.js';
import { scnRead, scnRefused, loanDefaults } from '../dealui.js';
import { newScratch, work } from '../uwstore.js';
import { QUICK_DEAL_PATHS } from './bridge.js';

const ok = (x) => typeof x === 'number' && Number.isFinite(x);

/** What was typed, as the deal page reads the same kind of field (null when it can't be read: a blank is absent, never 0). */
export function read(kind, raw) {
  if (kind === 'text') return raw.trim() || null;
  if (kind === 'hold') return scnRead('int', raw);
  return kind === 'num' || kind === 'int' || kind === 'money' ? parseNum(raw) : scnRead(kind, raw);
}
export function show(kind, v) {
  if (v === null || v === undefined || v === '') return '';
  if (kind === 'money') return money0(v);
  if (kind === 'int') return int(v);
  if (kind === 'text') return String(v);
  if (kind === 'hold') return String(Math.round(v));
  return kind === 'num' ? String(v) : dec(v, 2);
}

/** The Quick check's nine figures: id, label, how it is typed (the kinds Quick underwrite uses). */
export const CHECK_FIELDS = [
  ['price', 'Price', 'money'], ['noi', 'NOI, first year', 'money'], ['ltv', 'Loan to value %', 'pct'], ['rate', 'Interest rate %', 'pct'],
  ['amort', 'Amortization, years', 'num'], ['closing', 'Closing costs %', 'pct0'], ['hold', 'Hold, years', 'hold'],
  ['exitCap', 'Exit cap rate %', 'pct'], ['saleCost', 'Sale costs %', 'cost'],
];
const KIND = Object.fromEntries(CHECK_FIELDS.map(([id, , kind]) => [id, kind]));

/** A figure as text for a field the check fills from the tool: every digit kept, so the text reads back as the same number. */
export function plain(id, v) {
  if (!ok(v)) return '';
  return KIND[id] === 'money' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v);
}

/** The results lines [{ k, v, strong, why }], from { m, run } of uwstore.js work(): the same rows, in the same order, as the Quick underwrite card. */
export function resultLines({ m, run }) {
  const r = run.returns;
  const mult = r && ok(r.leveredMultiple) ? `${r.leveredMultiple.toFixed(2)}x` : '—';
  const line = (k, v, strong, why) => ({ k, v, strong: !!strong, why: why || '' });
  const out = [
    line('Cap rate', pct(m.capCalc), true),
    line('Price / SF', money2(m.ppsf)),
    line('Per unit', money0(m.perUnit)),
    line('Loan', money0(m.loan)),
    line('DSCR', times(m.dscr), true),
    line('Debt yield', pct(m.debtYield)),
    line('Cash-on-cash, year 1', pct(m.cashOnCash), true),
    line('Equity, with closing', money0(m.equity)),
  ];
  if (m.maxLoan) out.push(line('Largest loan it supports', money0(m.maxLoan.loan), true, `limited by ${m.maxLoan.binding}${m.maxLoan.tests.DSCR ? ` · DSCR test ${short(m.maxLoan.tests.DSCR)}` : ''}${m.maxLoan.tests['Debt yield'] ? ` · debt-yield test ${short(m.maxLoan.tests['Debt yield'])}` : ''}`));
  else out.push(line('Largest loan it supports', '—'));
  out.push(
    line('Levered IRR', pct(r && r.leveredIrr), true, r ? `${run.inputs.hold}-year hold, NOI growing ${dec(run.inputs.growth, 2)}% a year, sold at a ${ok(run.inputs.exitCap) ? pct(run.inputs.exitCap) : '—'} cap` : ok(run.inputs.saleCost) && run.inputs.saleCost < 0 ? 'left out: sale costs can’t be negative' : 'needs a price, NOI and an exit cap'),
    line('Equity multiple', mult),
    line('Unlevered IRR', pct(r && r.unleveredIrr)),
  );
  return out;
}

/** The record the engine reads, from the check's typed text. The lender's tests start from the same defaults as a new quick underwriting. */
export function recordFromText(text) {
  const d = loanDefaults();
  const rec = newScratch({ loan: { minDscr: d.minDscr, minDy: d.minDy, io: d.io } });
  /** @type {Record<string, number | null>} */
  const values = {};
  /** @type {Record<string, boolean>} */
  const refused = {};
  for (const [id, , kind] of CHECK_FIELDS) {
    const raw = typeof text?.[id] === 'string' ? text[id] : '';
    const [part, key] = QUICK_DEAL_PATHS[id].split('.');
    const v = read(kind, raw);
    values[id] = v === undefined ? null : v;
    if (v !== null && v !== undefined) rec[part][key] = v;
    refused[id] = scnRefused(kind, raw);
  }
  return { rec, values, refused };
}

/** The engine's answer for the typed text: the lines, the notes, the two price answers, and the engine's loan and equity. */
export function runText(text) {
  const { rec, values, refused } = recordFromText(text);
  const w = work(rec);
  const { m, run, answers } = w;
  return {
    lines: resultLines(w), notes: run.notes.slice(), values, refused,
    answers: [
      { k: `Price for a cap rate of ${rec.targets.cap}%`, v: money0(answers.priceForCap), why: ok(run.inputs.noi) ? `NOI ${money0(run.inputs.noi)} ÷ cap rate` : 'needs NOI' },
      { k: `Price for a levered IRR of ${rec.targets.irr}%`, v: money0(answers.priceForIrr), why: answers.priceForIrr ? 'same loan terms, hold and exit' : 'not reachable on these terms, or needs an exit cap' },
    ],
    measures: { loan: ok(m.loan) ? m.loan : null, equity: ok(m.equity) ? m.equity : null },
    record: rec,
  };
}
