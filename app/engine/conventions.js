/* engine/conventions.js -- every convention the calculations use, in one
 * place, with its current setting. The settable ones are chosen in Settings
 * (kept on the device as kv `conventions`); the rest are stated so a reader
 * can see exactly how a number was worked out. Defaults reproduce the app's
 * behaviour, so nothing changes unless someone changes a setting. */

export const CONVENTIONS = [
  {
    id: 'walt.weight', label: 'WALT weighting', settable: true, default: 'income',
    options: [['income', 'By income'], ['sf', 'By area (SF)']],
    help: 'Which WALT is shown as the headline. Both are worked out; this picks the one shown as “WALT”.',
  },
  {
    id: 'walt.mtm', label: 'Month-to-month leases in WALT', settable: true, default: 'exclude',
    options: [['exclude', 'Left out'], ['zero', 'Counted at 0 years']],
    help: 'A month-to-month lease has no term left to weight. Left out, it doesn’t move WALT; counted at 0 years, it pulls WALT down by its share.',
  },
  {
    id: 'review.strict', label: 'Before figures can be used', settable: true, default: 'fails',
    options: [['fails', 'Failed checks resolved'], ['all', 'Every open check resolved (strict)']],
    help: 'Strict: while the T-12 or the rent roll has an open check (a warning as well as a failure), “Use the T-12’s figures”, “Use normalised figures” and the rent roll’s Use offers wait until each is reviewed, and NOI three ways says “not compared: checks open”. Nothing ever fills a figure without your tap either way.',
  },
  { id: 'walt.from', label: 'WALT measured from', value: 'The rent roll’s as-of date (the WALT tool: today)' },
  { id: 'years', label: 'Years between dates', value: 'Whole days ÷ 365.25' },
  { id: 'debt.term', label: 'Loan payments', value: 'Monthly, over a whole number of months (amortization years × 12, rounded), shown a year at a time' },
  { id: 'returns.timing', label: 'IRR and DCF', value: 'Annual cash flows at year end; the sale priced on the following year’s NOI' },
  { id: 'ner', label: 'Net effective rent', value: 'Escalations compound at each lease anniversary; free months at the rent then in force; less TI, and commissions when entered; ÷ term in years ÷ SF. Discounted: the level rent with the same present value, monthly in advance' },
  { id: 'breakeven', label: 'Break-even occupancy', value: '(Expenses + debt service − income not tied to occupancy) ÷ gross potential rent; without GPR, estimated from gross income and its occupancy, and labelled' },
  { id: 'comps.priced', label: 'Comps in $/SF figures', value: 'Only comps with a price and building SF above zero' },
  { id: 'money', label: 'Money kept', value: 'Totals to whole cents; rates per SF or per unit to four decimals' },
  { id: 'noi.threeWays', label: 'NOI three ways (a deal with a T-12)', value: 'The OM’s, the T-12’s and the rent roll’s forward-looking year 1 compared in pairs, the gap as a share of the larger, by the two thresholds below: within the first they agree; between the two is noted; above the second is a warning. A T-12 of fewer than 12 months, or with lines still to review, isn’t compared' },
  { id: 'noi.agree', label: 'NOI three ways: they agree within', settable: true, kind: 'number', unit: '%', default: 2, min: 0, max: 50, help: 'The gap, as a share of the larger NOI, under which two NOIs agree and nothing is said. Must be below the warning level.' },
  { id: 'noi.warn', label: 'NOI three ways: a warning above', settable: true, kind: 'number', unit: '%', default: 5, min: 0.1, max: 100, help: 'The gap above which two NOIs are a warning in “What doesn’t add up”; between the two levels it is a note. Must be above the agree level.' },
  { id: 't12.months', label: 'A T-12 of fewer than 12 months', value: 'Its months as they are, never used as a year’s figures. Scaled up (× 12 ÷ its months) only when you confirm it, and then marked annualized' },
];
/* T-12 value checks (T-12 PR 3b): warnings and notes only, never a hold on any total. Percents are typed in points
 * ("0.5" is 0.5%). Each is a number the broker may change in Settings; defaults are the approved ones. */
const T12_NUMBERS = [
  { id: 't12.spike.times', label: 'T-12 spike: times the typical month', unit: '×', default: 3, min: 1.5, max: 20, help: 'A month is a spike when it is more than this many times the line’s typical month (the median of its months that are not zero).' },
  { id: 't12.spike.floor', label: 'T-12 spike: at least', unit: '$', default: 1000, min: 0, max: 1000000, help: 'A spike must also be over this amount, or the share of effective gross income below, whichever is larger.' },
  { id: 't12.spike.egiPct', label: 'T-12 spike: or this share of income', unit: '%', default: 0.5, min: 0, max: 10, help: 'Of the T-12’s effective gross income. Typed in points: 0.5 is half of one percent.' },
  { id: 't12.negMonth', label: 'T-12 negative month in an expense: from', unit: '$', default: 500, min: 0, max: 1000000, help: 'A month this far below zero inside an expense line that adds up to a cost is noted (a credit or refund).' },
  { id: 't12.oneoff.share', label: 'T-12 one-off: one month is at least', unit: '%', default: 50, min: 10, max: 100, help: 'A line with one month this share of its period total, and large enough (next row), is asked about: is it recurring?' },
  { id: 't12.oneoff.side', label: 'T-12 one-off: the line is at least', unit: '%', default: 1, min: 0, max: 100, help: 'Of its side’s total (income, or operating expenses). Smaller lines are not asked about.' },
  { id: 't12.yoy.line', label: 'T-12 year over year: a line or category moved more than', unit: '%', default: 25, min: 1, max: 1000, help: 'Compared with the same months a year before, when the file has a prior period. Like months only.' },
  { id: 't12.yoy.noi', label: 'T-12 year over year: NOI moved more than', unit: '%', default: 50, min: 1, max: 1000, help: 'Over the same like months. A warning, because NOI is what is bought.' },
].map((c) => ({ ...c, settable: true, kind: 'number' }));
CONVENTIONS.push(...T12_NUMBERS);

const current = Object.fromEntries(CONVENTIONS.filter((c) => c.settable).map((c) => [c.id, c.default]));

/** The NOI three ways thresholds, in percent of the larger NOI (convention noi.threeWays): a read of the settings, never a copy. */
export const NOI_GAP = { get agree() { return /** @type {number} */ (current['noi.agree']); }, get warn() { return /** @type {number} */ (current['noi.warn']); } };

const inRange = (c, v) => typeof v === 'number' && Number.isFinite(v) && v >= c.min && v <= c.max;

/** The current setting of a settable convention. */
/** @type {(id: string) => any} */
export const conv = (id) => current[id];

/** Apply saved settings (unknown ids and values are ignored). */
export function setConventions(saved) {
  const before = { ...current };
  for (const c of CONVENTIONS) {
    if (!c.settable || !saved || !(c.id in saved)) continue;
    if (c.kind === 'number') { if (inRange(c, saved[c.id])) current[c.id] = saved[c.id]; } // a bad saved value is ignored, never thrown
    else if (c.options.some(([v]) => v === saved[c.id])) current[c.id] = saved[c.id];
  }
  // the NOI levels must stay in order: both go back to what they were
  if (!(current['noi.agree'] < current['noi.warn'])) { current['noi.agree'] = before['noi.agree']; current['noi.warn'] = before['noi.warn']; }
  return { ...current };
}

/** All settable values, for saving. */
export const conventionValues = () => ({ ...current });
