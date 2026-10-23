/* listingcopy.js -- plain-text listing copy for a marketplace, from a deal.
 *
 * A headline, a short and a long description, a highlights list and a facts
 * block, each with its character count against a limit. Every figure is the
 * deal's own, written through the kit formatters; a figure the deal doesn't
 * have is left out of the sentence, never written as 0 or a filler. The words
 * are plain statements of those figures: no adjectives, no claims.
 *
 * Left out on purpose: the tenant's name (a public listing is not the place
 * for it), and the loan, DSCR and comps (those are the broker's analysis, not
 * the property's facts). Pure: no DOM, no storage. */

import { waltMethod } from './engine/walt.js';
import { money0, money2, pct, yrs, int } from './kit.js';

const ok = (x) => typeof x === 'number' && Number.isFinite(x);
const clean = (s) => (typeof s === 'string' || typeof s === 'number' ? String(s).replace(/\s+/g, ' ').trim() : '');

/**
 * The default limit of each block, in characters. They are starting points,
 * not any marketplace's published limits: pass `limits` for the site in use.
 */
export const LIMITS = { headline: 100, short: 250, long: 2000, highlights: 1000, facts: 1000 };

/** Characters as a person counts them (an emoji is one); a line break is one. */
export const countChars = (text) => [...text].length;

/**
 * The listing's raw pieces, each null when the deal doesn't have it.
 * @param {any} deal @param {any} m
 */
function pieces(deal, m) {
  const f = deal.figures || {};
  const text = (k) => clean(f[k]) || null;
  const city = [clean(f.city), clean(f.state)].filter(Boolean).join(', ');
  // a price worked out from NOI and cap rate is not an asking price
  const price = ok(m.price) && !(m.derived && m.derived.price) ? m.price : null;
  return {
    ptype: text('ptype'),
    address: text('address'),
    place: [text('address'), [city, clean(f.zip)].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    city,
    bsf: ok(f.bsf) && f.bsf > 0 ? f.bsf : null,
    lot: ok(f.lot_sf) && f.lot_sf > 0 ? f.lot_sf : null,
    units: ok(f.units) && f.units > 0 ? f.units : null,
    year: ok(f.year) ? f.year : null,
    renovated: ok(f.renovated) ? f.renovated : null,
    stories: ok(f.stories) ? f.stories : null,
    zoning: text('zoning'),
    parking: text('parking'),
    price,
    ppsf: price !== null && ok(m.ppsf) ? m.ppsf : null,
    cap: ok(m.cap) ? m.cap : null,
    noi: ok(m.noi) ? m.noi : null,
    noiDerived: !!(m.derived && m.derived.noi),
    occ: ok(m.occ) ? m.occ : null,
    walt: m.leases && ok(m.leases.walt) ? m.leases.walt : null,
    leaseType: text('lease_type'),
    termLeft: text('term_left'),
    increases: text('increases'),
  };
}

const sf = (n) => `${int(n)} SF`;
const noiText = (p) => `${money0(p.noi)}${p.noiDerived ? ' (calculated from the price and cap rate)' : ''}`;
const sentence = (parts) => parts.filter(Boolean).join(' ') || null;

/** The whole listing, block by block: { key, label, text, count, limit, over }. Blocks with nothing to say are left out. */
export function listingBlocks(deal, m, limits = LIMITS) {
  const p = pieces(deal, m);
  const lim = { ...LIMITS, ...limits };

  // headline: "Retail, 12,000 SF in Washington, DC · $6,450,000"
  const lead = [p.ptype, p.bsf !== null ? sf(p.bsf) : null].filter(Boolean).join(', ');
  const headline = [
    lead ? `${lead}${p.city ? ` in ${p.city}` : ''}` : (p.city ? `Property in ${p.city}` : ''),
    p.price !== null ? money0(p.price) : '',
  ].filter(Boolean).join(' · ') || null;

  // the property as sentences, shared by the short and long descriptions
  const kind = [p.ptype, p.bsf !== null ? `${sf(p.bsf)} building` : null, p.units !== null ? `${int(p.units)} unit${p.units === 1 ? '' : 's'}` : null].filter(Boolean).join(', ');
  const what = kind ? `${kind}${p.place ? ` at ${p.place}` : ''}.` : (p.place ? `Located at ${p.place}.` : null);
  const build = sentence([
    p.year !== null ? `Built in ${p.year}${p.renovated !== null ? `, renovated in ${p.renovated}` : ''}.` : (p.renovated !== null ? `Renovated in ${p.renovated}.` : null),
    p.stories !== null ? `${int(p.stories)} stor${p.stories === 1 ? 'y' : 'ies'}.` : null,
    p.zoning ? `Zoned ${p.zoning}.` : null,
    p.parking ? `Parking: ${p.parking}.` : null,
  ]);
  const land = p.lot !== null ? `Land of ${sf(p.lot)} (${(p.lot / 43560).toFixed(2)} acres).` : null;
  const priced = p.price !== null
    ? `Asking ${money0(p.price)}${p.ppsf !== null ? ` (${money2(p.ppsf)}/SF)` : ''}${p.cap !== null ? ` at a ${pct(p.cap)} cap rate` : ''}.`
    : (p.cap !== null ? `Cap rate ${pct(p.cap)}.` : null);
  const income = sentence([
    p.noi !== null ? `Net operating income is ${noiText(p)}.` : null,
    p.occ !== null ? `${pct(p.occ, 1)} occupied.` : null,
    p.walt !== null ? `Weighted average lease term is ${yrs(p.walt)} (${waltMethod()}).` : null,
  ]);
  const lease = sentence([
    p.leaseType ? `Lease type: ${p.leaseType}.` : null,
    p.termLeft ? `Term remaining: ${p.termLeft}.` : null,
    p.increases ? `Rent increases: ${p.increases}.` : null,
  ]);

  const short = sentence([what, p.year !== null ? `Built in ${p.year}.` : null, p.occ !== null ? `${pct(p.occ, 1)} occupied.` : null, priced]);
  const long = [sentence([what, land]), build, priced, income, lease].filter(Boolean).join('\n\n') || null;

  const bullets = [
    p.bsf !== null ? `${sf(p.bsf)} ${p.ptype || 'building'}` : p.ptype,
    p.units !== null ? `${int(p.units)} unit${p.units === 1 ? '' : 's'}` : null,
    p.lot !== null ? `${sf(p.lot)} of land (${(p.lot / 43560).toFixed(2)} acres)` : null,
    p.year !== null ? `Built in ${p.year}${p.renovated !== null ? `, renovated in ${p.renovated}` : ''}` : null,
    p.occ !== null ? `${pct(p.occ, 1)} occupied` : null,
    p.cap !== null ? `${pct(p.cap)} cap rate${p.noi !== null ? ` on ${noiText(p)} net operating income` : ''}` : (p.noi !== null ? `Net operating income ${noiText(p)}` : null),
    p.walt !== null ? `Weighted average lease term ${yrs(p.walt)} (${waltMethod()})` : null,
    p.leaseType ? `Lease type: ${p.leaseType}` : null,
    p.termLeft ? `Lease term remaining: ${p.termLeft}` : null,
    p.zoning ? `Zoned ${p.zoning}` : null,
    p.parking ? `Parking: ${p.parking}` : null,
  ].filter(Boolean).map((b) => `- ${b}`).join('\n') || null;

  const facts = [
    ['Property type', p.ptype], ['Address', p.place || null],
    ['Asking price', p.price !== null ? money0(p.price) : null], ['Price per SF', p.ppsf !== null ? money2(p.ppsf) : null],
    ['Building size', p.bsf !== null ? sf(p.bsf) : null], ['Land', p.lot !== null ? `${sf(p.lot)} (${(p.lot / 43560).toFixed(2)} acres)` : null],
    ['Units', p.units !== null ? int(p.units) : null],
    ['Cap rate', p.cap !== null ? pct(p.cap) : null], ['Net operating income', p.noi !== null ? noiText(p) : null],
    ['Occupancy', p.occ !== null ? pct(p.occ, 1) : null],
    ['Year built', p.year !== null ? String(p.year) : null], ['Zoning', p.zoning], ['Parking', p.parking],
  ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n') || null;

  return [
    ['headline', 'Headline', headline], ['short', 'Short description', short], ['long', 'Long description', long],
    ['highlights', 'Highlights', bullets], ['facts', 'Facts', facts],
  ].filter(([, , text]) => text).map(([key, label, text]) => {
    const count = countChars(text);
    return { key, label, text, count, limit: lim[key], over: count > lim[key] };
  });
}

/** The blocks as one .txt: each under its label, with its count. */
export const listingFile = (blocks) => blocks.map((b) => `${b.label.toUpperCase()} (${b.count} of ${b.limit} characters)\n${b.text}`).join('\n\n');
