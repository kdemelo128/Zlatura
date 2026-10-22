/* engine/walt.js -- weighted average lease term, one definition for the
 * deal Overview, the Rent roll tab, the deal brief, the workbooks and the WALT
 * tool: years from the as-of date to each lease's end (whole days ÷ 365.25),
 * weighted by annual rent (by income), by SF (by area), or by SF over the
 * whole building with vacant space at 0 years (by total area). Vacant and undated
 * leases are otherwise left out; month-to-month leases are left out unless the
 * convention says to count them at 0 years. */

import { conv } from './conventions.js';

const ok = (x) => typeof x === 'number' && Number.isFinite(x);
const pos = (x) => ok(x) && x > 0;
const DAY = 86400000;

/**
 * A date (ISO text, Date or day number) as a whole UTC day number; null if none.
 * @param {IsoDate | Date | DayNumber | null | undefined | string} v @returns {DayNumber | null}
 */
export function dayNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.floor(v) : null;
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v).length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isFinite(t) ? Math.floor(t / DAY) : null;
}

/**
 * items: [{ annual, sf, end, mtm, vacant }]. Returns
 * { income, sf, gla, headline, weight, mtm, asOf } -- WALT in years by income,
 * by SF and by total area (Σ SF × years ÷ (their SF + vacant SF): vacant space
 * counts at 0 years), and which is the headline under the current convention.
 * A lease left out (month-to-month when they are left out, undated, no rent) is
 * out of the total-area denominator too, so nothing counts twice.
 * @param {{ annual?: UsdPerYear | null, sf?: Sf | null, end?: string | null, mtm?: boolean, vacant?: boolean }[]} items
 * @param {{ asOf?: IsoDate | Date | DayNumber | null, weight?: string, mtm?: string }} [opts]
 * @returns {{ income: Years | null, sf: Years | null, gla: Years | null, headline: Years | null, weight: string, mtm: string, asOf: DayNumber | null }}
 */
export function walt(items, { asOf, weight = conv('walt.weight'), mtm = conv('walt.mtm') } = {}) {
  const d = dayNumber(asOf);
  let rent = 0; let rentYears = 0; let sf = 0; let sfYears = 0; let vacantSf = 0;
  for (const x of items || []) {
    if (x.vacant) { if (pos(x.sf)) vacantSf += x.sf; continue; }
    if (!pos(x.annual)) continue;
    let yrs;
    if (x.mtm) { if (mtm !== 'zero') continue; yrs = 0; } else {
      const e = dayNumber(x.end);
      if (e === null || d === null) continue;
      yrs = Math.max(0, (e - d) / 365.25);
    }
    rent += x.annual; rentYears += x.annual * yrs;
    if (pos(x.sf)) { sf += x.sf; sfYears += x.sf * yrs; }
  }
  const income = rent ? rentYears / rent : null;
  const area = sf ? sfYears / sf : null;
  // no dated occupied space: no WALT, rather than 0 years from the vacant space alone
  const gla = sf ? sfYears / (sf + vacantSf) : null;
  return { income, sf: area, gla, headline: weight === 'sf' ? area : weight === 'gla' ? gla : income, weight, mtm, asOf: d };
}

/** The method in words, for the label next to every WALT. */
export function waltMethod({ weight = conv('walt.weight'), mtm = conv('walt.mtm') } = {}, asOfText = '') {
  return `${weight === 'sf' ? 'by area' : weight === 'gla' ? 'by total area, vacant at 0 years' : 'by income'}${asOfText ? `, as of ${asOfText}` : ''}${mtm === 'zero' ? ', month-to-month at 0 years' : ''}`;
}
