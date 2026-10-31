/* credit.js -- the tenant credit record (deal.credit): the rating scales and
 * the checks the Credit card shows. Pure. Ratings are typed by the broker and
 * never fetched. These checks are NOT in analyze(): they show on the card only,
 * so no saved result or displayed figure depends on them. */

import { PRODUCT } from './brand.js';
import { toCents } from './engine/money.js';
import { addMonths, inPlace, dayText } from './lease.js';

export const MAX_TEXT = 200;
export const MAX_LONG = 500;

const SP = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC+', 'CCC', 'CCC-', 'CC', 'C', 'D'];
const MOODYS = ['Aaa', 'Aa1', 'Aa2', 'Aa3', 'A1', 'A2', 'A3', 'Baa1', 'Baa2', 'Baa3', 'Ba1', 'Ba2', 'Ba3', 'B1', 'B2', 'B3', 'Caa1', 'Caa2', 'Caa3', 'Ca', 'C'];
/** Each scale from best to worst; `ig` is the index of the last investment-grade step (BBB- or Baa3). */
export const SCALES = { sp: { name: 'S&P', steps: SP, ig: 9 }, fitch: { name: 'Fitch', steps: SP, ig: 9 }, moodys: { name: 'Moody’s', steps: MOODYS, ig: 9 } };
export const AGENCIES = [['sp', 'S&P'], ['moodys', 'Moody’s'], ['fitch', 'Fitch'], ['other', 'Other']];
export const agencyLabel = (r) => (r.agency === 'other' ? r.agencyName || 'Other' : SCALES[r.agency] ? SCALES[r.agency].name : 'Other');

/** A fresh record. leaseId is the one occupied lease when the roll has exactly one. */
export const newCredit = (leaseId = null) => ({ v: 1, leaseEntity: '', leaseId, parent: '', guarantor: { name: '', scope: null, limit: '', endsOn: null }, ratings: [], sales: null, goDark: { state: null, note: '' } });

/** Fill in whatever a damaged backup left out of a record, so nothing downstream throws. */
export function mendCredit(c) {
  if (!Array.isArray(c.ratings)) c.ratings = [];
  if (!c.guarantor || typeof c.guarantor !== 'object') c.guarantor = { name: '', scope: null, limit: '', endsOn: null };
  if (!c.goDark || typeof c.goDark !== 'object') c.goDark = { state: null, note: '' };
  return c;
}

/** Limit a typed text to its length. */
export const clip = (s, n = MAX_TEXT) => String(s ?? '').trim().slice(0, n);

/** Read a typed rating against its agency's scale. Capitals are evened out only for an exact match; anything else is kept as typed. */
export function readRating(agency, typed) {
  const text = clip(typed);
  const sc = SCALES[agency];
  if (!sc) return { rating: text, onScale: false, investmentGrade: null, note: '' };
  const i = sc.steps.findIndex((s) => s.toLowerCase() === text.toLowerCase());
  if (i < 0) return { rating: text, onScale: false, investmentGrade: null, note: `Not a rating on the ${sc.name} scale; kept as typed, with no investment-grade label.` };
  return { rating: sc.steps[i], onScale: true, investmentGrade: i <= sc.ig, note: `${i <= sc.ig ? 'Investment grade' : 'Below investment grade'} on the ${sc.name} scale, as typed` };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** What stops a rating from being saved, or ''. */
export const ratingGap = (r) => (!r.agency || !clip(r.rating) || !ISO.test(r.asOf || '') || !clip(r.source, MAX_LONG) ? 'Add the agency, the rating, the as-of date and where it came from.' : '');

const party = (c, of) => (of === 'guarantor' ? (c.guarantor || {}).name : of === 'parent' ? c.parent : c.leaseEntity);
export const partyLabel = { tenant: 'the tenant on the lease', guarantor: 'the guarantor', parent: 'the parent' };

/** The sentence under each rating on the card. */
export function ratingLine(c, r) {
  const who = party(c, r.of) || '(name not typed)';
  return `${agencyLabel(r)} ${r.rating}${r.outlook ? `, ${r.outlook}` : ''}, for ${who} (${partyLabel[r.of] || r.of}). As of ${dayText(r.asOf)}, from: ${r.source}. Typed by the broker on ${dayText(r.typedOn)}; not verified by ${PRODUCT}.`;
}

/**
 * The checks on a credit record. `lease` is the linked rent roll lease (or null), `figures` the deal's figures, `today` an ISO day;
 * `asOf` (default today) is the day the lease's in-place rent is read on.
 * @returns {{ id: string, text: string }[]}
 */
export function creditChecks(c, /** @type {{ lease?: any, figures?: any, today?: string, asOf?: string }} */ { lease = null, figures = {}, today = '', asOf = today } = {}) {
  const out = [];
  if (!c) return out;
  const add = (id, text) => out.push({ id, text });
  const rs = Array.isArray(c.ratings) ? c.ratings : [];
  const g = c.guarantor || {};
  if (rs.length && !rs.some((r) => r.of === 'tenant' || (r.of === 'guarantor' && (g.scope === 'full' || g.scope === 'limited')))) {
    if (rs.some((r) => r.of === 'guarantor')) {
      add('obligor', g.scope === 'none'
        ? `${party(c, 'guarantor') || 'The guarantor'} is rated, but there is no guaranty, so the rating does not stand behind this rent.`
        : 'The guarantor is rated, but whether the guaranty is full or limited isn’t recorded, so the rating may not stand behind this rent.');
    } else {
      const who = [...new Set(rs.map((r) => party(c, r.of) || partyLabel[r.of]))];
      add('obligor', `${rs.length === 1 ? `The only rating is for ${who[0]}` : `The ratings are for ${who.join(' and ')}`}. Neither the tenant on the lease nor the guarantor is rated, so the rating does not stand behind this rent.`);
    }
  }
  if (g.endsOn && lease && lease.leaseEnd && g.endsOn < lease.leaseEnd) add('guaranty-ends', `The guaranty ends on ${dayText(g.endsOn)}, before the lease does on ${dayText(lease.leaseEnd)}.`);
  if (g.scope === 'limited' && !clip(g.limit, MAX_LONG)) add('limit-blank', 'The guaranty is limited, but the limit isn’t written down.');
  for (const r of rs) {
    const due = addMonths(r.asOf, 12);
    if (due && today && due < today) add('stale', `The ${agencyLabel(r)} rating is as of ${dayText(r.asOf)}, more than 12 months ago. Check it is current.`);
  }
  const om = clip(figures.guarantor).toLowerCase();
  if (om && clip(g.name) && om !== clip(g.name).toLowerCase()) add('om-differs', `The OM names the guarantor “${clip(figures.guarantor)}”; this record says “${clip(g.name)}”.`);
  const s = c.sales;
  const salesCents = s && Number.isFinite(s.annual) ? Math.round(toCents(s.annual) * 100) : 0;
  if (salesCents > 0 && lease) {
    const rentCents = Math.round(toCents(inPlace(lease, asOf).monthly * 12) * 100);
    if (rentCents > 0) {
      const pct = Math.round((rentCents / salesCents) * 1000) / 10;
      add('rent-sales', `Rent is ${pct < 0.1 ? 'under 0.1' : pct}% of the store sales typed${s.year ? ` (${s.year})` : ''}.`);
    } else if (asOf) add('rent-sales', `No rent on ${dayText(asOf)} for this lease.`);
  }
  if ((c.goDark || {}).state === 'yes') add('go-dark', 'The lease lets the tenant close the store and keep paying rent (go dark).');
  return out;
}
