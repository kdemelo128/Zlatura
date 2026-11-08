/* units.js -- what a rent column holds (annual, monthly, per SF a year, per SF a month), decided from evidence
 * and asked when the evidence leaves two readings. Pure: no DOM. One definition for the OM reader (omroll.js)
 * and the spreadsheet import (rentrollui.js).
 *
 * The order of evidence (docs/proposals/uw-money-notes.md, section 1.3); a lower step never overrides a higher one:
 *   1. stated       the column's own heading ("Annual", "/mo", "$/SF/Yr")
 *   2. reconciled   against a total on the same rows that carries its own unit
 *   3. inferred     from the other columns on the same rows, or the only reading the figures leave possible
 *   4. plausibility ($3 to $300 a SF a year) can only rule readings OUT, never choose between two that pass
 *   5. convention   ("a rate per SF is a year") only when every other reading has been ruled out
 * Two readings left after step 4 is basis 'ask': the caller holds the rows and asks the broker.
 * A scale ("in thousands") is never inferred from the size of the figures; only a caption states it.
 */

export const RENT_KINDS = ['annual', 'monthly', 'rent', 'psf', 'mpsf'];

/** A rent per SF a year a lease can have. It rules readings out; it never picks between two that both pass. */
export const plausible = (psfYear) => psfYear >= 3 && psfYear <= 300;

export const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/**
 * A bare "Rent" (or "Base Rent", "Rate") column: which readings do its figures leave possible, each tried as rent
 * per SF a year? One left: it is that (inferred). Two or none: an ask, with the reading the header and the property
 * hint at shown as the provisional one (never used silently).
 * @param {[number, number][]} pairs [rent, sf] for the rows with both
 * @param {{ label?: string, resi?: boolean }} [o]
 * @returns {{ reading: 'annual'|'monthly'|'psf'|'mpsf', basis: 'inferred'|'ask', alt: string[]|null }}
 */
export function rentReading(pairs, { label = '', resi = false } = {}) {
  const per = (fn) => median(pairs.map(([v, sf]) => fn(v, sf)).filter(Number.isFinite));
  const tries = [
    ['annual', per((v, sf) => v / sf)],
    ['monthly', per((v, sf) => (12 * v) / sf)],
    ['psf', per((v) => (v < 1000 ? v : NaN))],
    ['mpsf', per((v) => (v < 100 ? 12 * v : NaN))],
  ].filter(([, x]) => x !== null && Number.isFinite(x) && plausible(x));
  if (tries.length === 1) return { reading: tries[0][0], basis: 'inferred', alt: null };
  const pref = /\brate\b/i.test(label) && !/\brent\b/i.test(label) ? 'psf' : resi ? 'monthly' : 'annual';
  const pick = tries.find(([r]) => r === pref) || tries[0] || [pref];
  return { reading: pick[0], basis: 'ask', alt: tries.filter(([r]) => r !== pick[0]).map(([r]) => r) };
}

/**
 * A rent-per-SF column that does not say whether it is a year's or a month's, from the figures alone.
 * Per year only passes plausibility: convention (a rate per SF is a year's). Per month only passes: inferred.
 * Both pass: an ask (the reading is provisional). Neither: convention, and the range check flags the rows.
 */
export function psfPeriod(values) {
  const m = median(values.filter((v) => Number.isFinite(v) && v > 0));
  if (m === null) return { reading: 'psf', basis: 'convention', alt: null };
  const yr = plausible(m); const mo = plausible(12 * m);
  if (yr && mo) return { reading: 'psf', basis: 'ask', alt: ['mpsf'] };
  if (mo && !yr) return { reading: 'mpsf', basis: 'inferred', alt: null };
  return { reading: 'psf', basis: 'convention', alt: null };
}

/**
 * What each rent column of a table holds, from its header first and its figures second:
 * { kind, reading: 'annual'|'monthly'|'psf'|'mpsf', basis: 'stated'|'reconciled'|'inferred'|'ask'|'convention'|'empty', note }.
 * `t` is { cols: [{ kind, label }], rows: [{ raw }] } (omroll.js's table).
 */
export function readings(t) {
  const rows = t.rows.map((r) => r.raw);
  const resi = t.cols.some((c) => /resident|\bapt\b|\bbr\b|bed|unit type|bd\/ba/i.test(c.label)) || (t.cols.some((c) => c.kind === 'suite' && /\bunit\b/i.test(c.label)) && median(rows.map((r) => r.rent).filter((v) => v > 0)) < 6000);
  const out = {};
  for (const col of t.cols) {
    const k = col.kind;
    if (!RENT_KINDS.includes(k)) continue;
    const pairs = rows.filter((r) => r[k] > 0 && r.sf > 0).map((r) => [r[k], r.sf]);
    // a column with nothing in it needs no reading
    if (!rows.some((r) => Number.isFinite(r[k]))) { out[k] = { kind: k, reading: k === 'rent' ? 'annual' : k, basis: 'empty', label: col.label }; continue; }
    if (k === 'annual' || k === 'monthly' || k === 'mpsf') { out[k] = { kind: k, reading: k, basis: 'stated', label: col.label }; continue; }
    if (k === 'psf') {
      const yearly = /\b(annual|yearly|yr|year|annum)\b/i.test(col.label);
      // a total-rent column on the same rows settles whether "per SF" is a year or a month
      const tot = rows.filter((r) => r.psf > 0 && r.sf > 0 && (r.annual > 0 || r.monthly > 0)).map((r) => (r.annual > 0 ? r.annual : r.monthly * 12) / r.sf / r.psf);
      const ratio = median(tot);
      if (yearly) out.psf = { kind: 'psf', reading: 'psf', basis: 'stated', label: col.label };
      else if (ratio !== null && Math.abs(ratio - 12) / 12 < 0.03) out.psf = { kind: 'psf', reading: 'mpsf', basis: 'inferred', label: col.label, note: `rent per SF here is a month's: it times the SF times 12 gives the annual rent printed beside it` };
      else if (ratio !== null && Math.abs(ratio - 1) < 0.03) out.psf = { kind: 'psf', reading: 'psf', basis: 'reconciled', label: col.label };
      else if (ratio !== null) out.psf = { kind: 'psf', reading: 'psf', basis: 'convention', label: col.label };   // a total beside it disagrees with both: the consistency check says so
      else out.psf = { kind: 'psf', label: col.label, ...psfPeriod(rows.map((r) => r.psf)) };
      continue;
    }
    // "Rent", "Base Rent", "Rate": the header doesn't say. Each reading, tried against rent per SF a year
    out.rent = { kind: 'rent', label: col.label, ...rentReading(pairs, { label: col.label, resi }) };
  }
  return out;
}

/**
 * Two rent columns that give the same reading ("Rent" and "Monthly Rent", both monthly) and disagree on a row:
 * the reader can't tell which is the rent, so it asks (a fail holds the roll). Equal on every row is the same
 * figure printed twice, and only noted. The column read first is the one used.
 * @returns {{ used: any, other: any, differs: boolean }[]}
 */
export function competing(t) {
  const by = new Map();
  for (const c of t.cols) {
    const u = t.units[c.kind];
    if (!RENT_KINDS.includes(c.kind) || !u || u.basis === 'empty') continue;
    if (!by.has(u.reading)) by.set(u.reading, []);
    by.get(u.reading).push(c);
  }
  const out = [];
  for (const cols of by.values()) {
    if (cols.length < 2) continue;
    const [used, ...others] = cols.sort((x, y) => RENT_KINDS.indexOf(x.kind) - RENT_KINDS.indexOf(y.kind));
    for (const o of others) {
      const k = t.rows.findIndex((r) => Number.isFinite(r.raw[used.kind]) && Number.isFinite(r.raw[o.kind]) && Math.abs(r.raw[used.kind] - r.raw[o.kind]) > Math.max(1, Math.abs(r.raw[o.kind]) * 0.002));
      out.push({ used, other: o, differs: k >= 0 });
    }
  }
  return out;
}

/**
 * Is a column of shares a percent or a decimal fraction? Decided for the whole column, never cell by cell: one
 * value of 1 or more makes it percent (so 0.8 means 0.8%). A column wholly under 1 is checked against the areas
 * (share x building SF = the tenant's SF) and is a decimal only if they agree; otherwise it is an ask.
 * @param {number[]} values @param {{ sf?: (number|null)[], buildingSf?: number|null }} [o] the tenants' SF in the same order
 * @returns {{ as: 'percent'|'decimal'|'ask'|'empty', basis: string }}
 */
export function percentReading(values, { sf = [], buildingSf = null } = {}) {
  const vs = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!vs.length) return { as: 'empty', basis: 'empty' };
  if (vs.some((v) => v >= 1)) return { as: 'percent', basis: 'inferred' };
  const checked = values.map((v, i) => [v, sf[i]]).filter(([v, s]) => v > 0 && s > 0);
  if (buildingSf > 0 && checked.length && checked.every(([v, s]) => Math.abs(v * buildingSf - s) <= Math.max(1, s * 0.01))) return { as: 'decimal', basis: 'reconciled' };
  return { as: 'ask', basis: 'ask' };
}

/**
 * What one rent cell of a spreadsheet is. `parse` reads an amount's text (kit.parseNum: "$1,200", "(1,200)", "1,200-").
 *   blank / dash   not stated (a lone dash in a rent cell is the same); never read as 0
 *   zero           a typed zero: a documented period at 0
 *   free           "Free", "Abated": an ask, never a 0 rate
 *   negative       a credit or a concession: an ask
 *   amount         a positive figure
 *   text           words in a money column ("TBD", "See note"): an ask
 * @param {unknown} x @param {(s: string) => number | null} parse
 * @returns {{ kind: 'blank'|'dash'|'zero'|'free'|'negative'|'amount'|'text', value?: number, text?: string }}
 */
export function cellKind(x, parse) {
  if (x === null || x === undefined) return { kind: 'blank' };
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) return { kind: 'blank' };
    return x === 0 ? { kind: 'zero', value: 0 } : x < 0 ? { kind: 'negative', value: x } : { kind: 'amount', value: x };
  }
  const s = String(x).trim();
  if (!s) return { kind: 'blank' };
  if (/^[-–—]+$/.test(s)) return { kind: 'dash' };
  if (/^(?:rent[- ]?)?(?:free|abated?|abatement)\b/i.test(s)) return { kind: 'free', text: s };
  const v = parse(s);
  if (v === null || !Number.isFinite(v)) return { kind: 'text', text: s };
  return v === 0 ? { kind: 'zero', value: 0 } : v < 0 ? { kind: 'negative', value: v } : { kind: 'amount', value: v };
}

/** The words an ask uses for a reading. */
export const READING_NAME = { annual: 'annual rent', monthly: 'monthly rent', psf: 'rent per SF a year', mpsf: 'rent per SF a month' };
