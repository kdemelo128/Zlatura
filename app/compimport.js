/* compimport.js -- comps from a spreadsheet or CSV: find the heading row, match the columns to comp fields by
 * the headings' words (exact synonyms, never fuzzy), ask what the file does not say, and build comps with
 * where each came from. Pure: no DOM, no network (compimportui.js is the screen). Nothing is guessed: a unit,
 * a date order, a sale-or-asking, a percent-or-fraction, a rentable-or-gross area that the file does not
 * settle is a question, and a blank is null, never 0. Design: docs/proposals/comp-importer-c1-note.md. */
import { readNumber } from './omroll.js';
import { PRODUCT } from './brand.js';
import { scaleOf } from './scale.js';
import { parseDateText } from './dateinput.js';
import { toCents, toRate } from './engine/money.js';
import { sha256Hex } from './fingerprint.js';
import { cell, CSV_HEADINGS } from './exporters.js';
import { LIMITS, BASES, blankComp, originText } from './compmodel.js';

export const MAX_ROWS = LIMITS.rows;
export const MAX_COLS = LIMITS.cols;
const ACRE = 43560;
const clip = (v, n = LIMITS.text) => (v === null || v === undefined || typeof v === 'object' ? '' : String(v).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, n).trim());
const BLANK_RE = /^(?:-+|–|—|n\/?a|undisclosed|not disclosed|withheld|confidential)$/i;
const isBlank = (s) => s === '' || BLANK_RE.test(s);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A heading as compared: Unicode-normalised, lower case, "&" as "and", "$/SF" as "per sf", a stated scale ("($000s)") taken out, every run of other characters one space. */
export function normHeader(s) {
  let t = String(s ?? '').slice(0, LIMITS.text).normalize('NFKC');
  const sc = scaleOf(t);
  if (sc.text) t = t.replace(sc.text, ' ');
  return t.toLowerCase().replace(/\$\s*\/\s*(?:sf|sq\.?\s*ft)\b|\/\s*sf\b/g, ' per sf ').replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/* ------------------------------------------------------------ the fields */

const lotWords = (units) => ['land', 'lot', 'land area', 'lot size'].flatMap((b) => units.map((u) => `${b} ${u}`.trim()));
const F = (id, label, syn, more = {}) => ({ id, label, syn, ...more });
export const FIELDS = Object.freeze([
  F('name', 'Property name', ['property', 'property name', 'building name', 'name']),
  F('address', 'Address', ['address', 'street address', 'property address', 'street'], { required: true }),
  F('city', 'City', ['city']), F('state', 'State', ['state', 'st']), F('zip', 'ZIP', ['zip', 'zip code', 'postal code']),
  F('submarket', 'Submarket', ['submarket']), F('zoning', 'Zoning', ['zoning', 'zone']),
  F('ptype', 'Property type', ['property type', 'type', 'use']), F('bclass', 'Building class', ['class', 'building class']),
  F('year', 'Year built', ['year built', 'built']),
  F('status', 'Status (sold or on the market)', ['status', 'sale status', 'listing status', 'set']),
  F('date', 'Sale date', ['sale date', 'close date', 'closing date', 'sold date', 'recording date']),
  F('price', 'Price', ['price']), F('price_sale', 'Sale price', ['sale price', 'sold price', 'close price', 'closing price']),
  F('price_ask', 'Asking price', ['asking price', 'list price', 'listing price']),
  F('ppsf', 'Price per SF (as reported)', ['price per sf', 'price sf', 'dollar per sf', 'psf', 'per sf']),
  F('bsf', 'Building SF', ['building sf', 'building size', 'size sf', 'square feet', 'sf', 'rba', 'nra', 'rsf', 'rentable sf', 'gba', 'gross building area', 'gross sf', 'gla']),
  F('basis', 'Building SF basis', ['building sf basis']),
  F('cap', 'Cap rate', ['cap rate', 'cap', 'capitalization rate', 'cap rate percent']),
  F('noi', 'NOI (checked, not kept)', ['noi', 'net operating income']),
  F('occ', 'Occupancy', ['occupancy', 'percent leased', 'leased', 'occupancy percent']),
  F('lot_sf', 'Lot SF', lotWords(['sf', 'sqft', 'square feet'])), F('lot_ac', 'Lot acres', [...lotWords(['ac', 'acre', 'acres']), 'acres', 'ac']),
  F('lot', 'Lot size (unit asked)', ['land area', 'lot size', 'land', 'lot']),
  F('dom', 'Days on market', ['days on market', 'dom']),
  F('parcel', 'Parcel numbers', ['parcel', 'parcel number', 'apn', 'ssl', 'tax id', 'account number']),
  F('buyer', 'Buyer', ['true buyer', 'buyer']), F('seller', 'Seller', ['true seller', 'seller']),
  F('buyer_broker', 'Buyer broker', ['buyer broker']), F('listing_broker', 'Listing broker', ['listing broker']),
  F('sale_type', 'Sale type', ['sale type']), F('conditions', 'Sale conditions', ['sale conditions']),
  F('notes', 'Notes', ['notes', 'comments']),
  F('rent', 'Rent (not read)', ['rent', 'asking rent', 'base rent', 'lease rate']),
  F('comp_id', 'CoStar ID', []),
]);
export const FIELD_BY_ID = Object.freeze(Object.fromEntries(FIELDS.map((f) => [f.id, f])));
const BASIS_HINT = new Map([['rba', 'rentable'], ['nra', 'rentable'], ['rsf', 'rentable'], ['rentable sf', 'rentable'], ['gba', 'gross'], ['gross building area', 'gross'], ['gross sf', 'gross']]);
const RENT_RE = /\/\s*(?:yr|mo|year|month)\b|per\s+sf\s+per\s+(?:yr|year|mo|month)/i;
const SYN = new Map();
for (const f of FIELDS) for (const s of f.syn) SYN.set(s, [...(SYN.get(s) || []), f.id]);
/** The field ids a heading's words match: none, one, or several (ambiguous). */
const fieldsFor = (header) => (RENT_RE.test(String(header).slice(0, LIMITS.text)) ? ['rent'] : (SYN.get(normHeader(header)) || []));

/* ----------------------------------------------- the app's own comp layout */

export const TEMPLATE_HEADINGS = Object.freeze([...CSV_HEADINGS, 'Building SF Basis', 'Lot Acres', 'Parcel']);
const PROFILE_COLUMNS = {
  set: 'status', status: 'none', property: 'name', 'full address': 'none', address: 'address', city: 'city', state: 'state', zip: 'zip',
  submarket: 'submarket', zoning: 'zoning', 'sale date': 'date', 'days on market': 'dom', price: 'price', 'building sf': 'bsf',
  'price per sf': 'ppsf', 'cap rate': 'cap', occupancy: 'occ', 'lot sf': 'lot_sf', 'year built': 'year', class: 'bclass',
  'property type': 'ptype', 'sale type': 'sale_type', 'true buyer': 'buyer', 'true seller': 'seller', 'sale conditions': 'conditions',
  'hold period': 'none', 'buyer broker': 'buyer_broker', 'listing broker': 'listing_broker', 'costar id': 'comp_id', 'source pdf': 'none',
  flags: 'none', 'building sf basis': 'basis', 'lot acres': 'lot_ac', parcel: 'parcel',
};
export const PROFILES = Object.freeze([Object.freeze({ id: 'zlatura-comps', label: `${PRODUCT} comp template`, needs: ['set', 'address', 'price'], columns: Object.freeze(PROFILE_COLUMNS) })]);
/** The headings alone, for filling in: a byte-order mark first so Excel reads UTF-8. */
export const templateCsv = () => `﻿${TEMPLATE_HEADINGS.map(cell).join(',')}\r\n`;

/** The profile whose required headings all appear, or null. */
export function matchProfile(headers) {
  const have = new Set(headers.map(normHeader));
  return PROFILES.find((p) => p.needs.every((n) => have.has(n))) || null;
}

/** SHA-256 of a layout: the headings normalised, sorted and joined, so column order and case don't matter. null where there is no crypto. */
export async function headerFingerprint(headers) {
  const norm = headers.map(normHeader).filter(Boolean).sort();
  return sha256Hex(new TextEncoder().encode(norm.join('\u0001')));
}

/* ------------------------------------------------------ the heading row */

const numeric = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && readNumber(clip(v)) !== null);
const textual = (v) => typeof v === 'string' && v.trim() !== '' && !numeric(v);
const lastUsed = (cells) => { let n = cells.length; while (n && (cells[n - 1] === null || cells[n - 1] === undefined || String(cells[n - 1]).trim() === '')) n--; return n; };

/**
 * The heading row of a grid ({ sheet, rows: [{ r, cells }] }): { idx (into rows), r, headers, preamble (the text above, for a stated
 * scale), noMatch } or { refuse }. A heading row has 3 or more text cells, no numbers and at least 2 headings we know; the first 15
 * rows are looked at. Two such rows, no row of text, too many columns or too many rows are refused.
 */
export function findHeader(grid) {
  const rows = grid.rows || [];
  const wide = rows.reduce((m, r) => Math.max(m, lastUsed(r.cells)), 0);
  if (wide > MAX_COLS) return { refuse: `This file has ${wide} columns; the importer reads up to ${MAX_COLS}. Remove the extra columns and try again.` };
  const known = new Set(PROFILES.flatMap((p) => Object.keys(p.columns)));
  const lookAt = rows.slice(0, 15);
  const kinds = lookAt.map((row) => {
    const cs = row.cells.slice(0, lastUsed(row.cells));
    const texts = cs.filter(textual);
    return { texts: texts.length, nums: cs.filter(numeric).length, hits: texts.filter((t) => fieldsFor(t).length || known.has(normHeader(t))).length };
  });
  const cand = kinds.map((k, i) => (k.texts >= 3 && !k.nums && k.hits >= 2 ? i : -1)).filter((i) => i >= 0);
  if (cand.length > 1) return { refuse: `Rows ${rows[cand[0]].r} and ${rows[cand[1]].r} both look like headings. Delete one and try again.` };
  let idx = cand[0];
  let noMatch = false;
  if (idx === undefined) {
    idx = kinds.findIndex((k) => k.texts >= 3 && !k.nums);
    if (idx < 0) return { refuse: 'No row of column headings was found.' };
    noMatch = true;
  }
  const head = rows[idx];
  const headers = head.cells.slice(0, lastUsed(head.cells)).map((v) => clip(v));
  const n = rows.length - idx - 1;
  if (n > MAX_ROWS) return { refuse: `This file has ${n.toLocaleString('en-US')} rows; the importer reads up to ${MAX_ROWS.toLocaleString('en-US')}. Split it and import each part.` };
  const preamble = rows.slice(0, idx).map((row) => row.cells.map((v) => clip(v)).join(' ')).join(' ');
  return { idx, r: head.r, headers, preamble, noMatch };
}

/* ----------------------------------------------------------- the mapping */

const own = (o, k) => Object.hasOwn(o, k);
const STATUS_DEFAULT = new Map([
  ['sold', 'sale'], ['closed', 'sale'], ['recorded', 'sale'], ['sale', 'sale'],
  ['active', 'market'], ['for sale', 'market'], ['available', 'market'], ['under contract', 'market'], ['pending', 'market'], ['under offer', 'market'], ['on market', 'market'],
  ['withdrawn', 'skip'], ['expired', 'skip'], ['off market', 'skip'], ['leased', 'skip'],
]);
const statusKey = (s) => clip(s, 100).toLowerCase().replace(/\s+/g, ' ');
const ANSWERS = { kind: ['sale', 'market'], both: ['yes', 'map'], cap: ['fraction', 'percent'], occ: ['fraction', 'percent'], date: ['mdy', 'dmy'], basis: BASES, lot: ['sf', 'ac'] };

/**
 * What to start with for a file's headings: a remembered layout (`remembered`, its record), else the app's own comp layout, else
 * the headings' words. { how, label, uses, profile, columns (a field id, 'none' for Not used, null when the heading is ambiguous
 * and must be picked), answers, statusMap }. Two headings that claim one field are both left to be picked.
 */
export function suggestMapping(headers, remembered = null) {
  const out = { how: 'guess', label: null, uses: 0, profile: null, columns: [], answers: {}, statusMap: new Map() };
  if (remembered) {
    const cols = new Map(Object.entries(remembered.columns || {}));
    Object.assign(out, { how: 'remembered', label: remembered.source || null, uses: remembered.uses || 0 });
    out.columns = headers.map((h) => { const f = cols.get(normHeader(h)); return f === 'none' || (typeof f === 'string' && own(FIELD_BY_ID, f)) ? f : 'none'; });
    for (const [k, v] of Object.entries(remembered.answers || {})) if (own(ANSWERS, k) && ANSWERS[k].includes(v)) out.answers[k] = v;
    for (const [k, v] of Object.entries(remembered.statusMap || {})) out.statusMap.set(k, v);
    return out;
  }
  const p = matchProfile(headers);
  if (p) {
    Object.assign(out, { how: 'profile', label: p.label, profile: p.id });
    out.columns = headers.map((h) => { const k = normHeader(h); return own(p.columns, k) ? p.columns[k] : 'none'; });
    return out;
  }
  out.columns = headers.map((h) => { const f = fieldsFor(h); return f.length === 1 ? f[0] : f.length ? null : 'none'; });
  const claims = new Map();
  out.columns.forEach((f, i) => { if (f && f !== 'none' && f !== 'rent') claims.set(f, [...(claims.get(f) || []), i]); });
  for (const idxs of claims.values()) if (idxs.length > 1) for (const i of idxs) out.columns[i] = null;
  return out;
}

/* ------------------------------------------------------------- the checks */

const numOf = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return readNumber(clip(v).replace(/%/g, '').trim());
};
const pctClass = (rows, i, header) => {
  if (/%|percent/i.test(header)) return 'pct';
  let lo = 0; let hi = 0;
  for (const row of rows) {
    const s = clip(row.cells[i]);
    if (isBlank(s) || s.includes('%')) continue;
    const v = numOf(row.cells[i]);
    if (v === null) continue;
    if (Math.abs(v) <= 1) lo++; else hi++;
  }
  return lo && hi ? 'mixed' : lo ? 'ask' : 'pct';
};
const DATE_PARTS = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/;
const dateClass = (rows, i) => {
  let dayFirst = 0; let monthFirst = 0; let example = null;
  for (const row of rows) {
    const m = typeof row.cells[i] === 'string' ? DATE_PARTS.exec(clip(row.cells[i])) : null;
    if (!m) continue;
    const a = +m[1]; const b = +m[2];
    if (a > 12 && b <= 12) dayFirst++; else if (b > 12 && a <= 12) monthFirst++; else if (a <= 12 && b <= 12 && a !== b && !example) example = m[0];
  }
  return dayFirst && monthFirst ? { fail: true } : dayFirst ? { order: 'dmy' } : monthFirst ? { order: 'mdy' } : example ? { ask: example } : { order: 'mdy' };
};
const q = (key, text, options, answers, extra = {}) => ({ id: extra.statusValue !== undefined ? `status:${extra.statusValue}` : key, key, text, options, value: extra.statusValue !== undefined ? answers.statusMap.get(extra.statusValue) : answers[key], ...extra });
const stop = (id, text, fail = false) => ({ id, block: text, fail });
const OPT = { sale: ['sale', 'Sale prices'], market: ['market', 'Asking prices'] };

/** Set or read one answer: a status answer lives in answers.statusMap, the others in answers[key]. */
export const setAnswer = (answers, qn, v) => { if (qn.statusValue !== undefined) answers.statusMap.set(qn.statusValue, v); else answers[qn.key] = v; };
/** The answers to start with: the mapping's (remembered ones the new rows contradict are dropped, so they are asked again). */
export function startAnswers(grid, mapping) {
  const answers = { ...mapping.answers, statusMap: new Map(mapping.statusMap) };
  const h = findHeader(grid);
  if (h.refuse) return answers;
  const rows = grid.rows.slice(h.idx + 1);
  for (const f of ['cap', 'occ']) {
    const i = mapping.columns.indexOf(f);
    if (i >= 0 && answers[f] === 'percent' && pctClass(rows, i, h.headers[i]) === 'ask') delete answers[f];
  }
  return answers;
}

/** Everything that stands between this mapping and an import: a list of questions (key, text, options, value), blocks (cannot go on) and fails. */
export function questionsFor(grid, mapping, answers) {
  return plan(grid, mapping, answers || startAnswers(grid, mapping)).qs;
}

function plan(grid, mapping, answers) {
  const h = findHeader(grid);
  if (h.refuse) return { refuse: h.refuse, qs: [] };
  const rows = grid.rows.slice(h.idx + 1);
  const cols = mapping.columns;
  const qs = [];
  const at = new Map();
  cols.forEach((f, i) => {
    if (f === null) qs.push(stop(`col${i}`, `Choose what “${clip(h.headers[i], 40)}” is, or set it to Not used.`));
    else if (f !== 'none' && f !== 'rent') at.set(f, [...(at.get(f) || []), i]);
  });
  for (const [f, idxs] of at) if (idxs.length > 1) qs.push(stop(`dup:${f}`, `${idxs.length} columns are set to “${FIELD_BY_ID[f].label}”. Set all but one to Not used.`));
  const has = (f) => at.has(f);
  const col = (f) => (at.get(f) || [])[0];
  if (!has('address')) qs.push(stop('need-address', 'No column is set to Address. Pick the column that holds the street address.'));
  if (!has('price') && !has('price_sale') && !has('price_ask') && !has('status')) qs.push(stop('need-price', 'No column is set to a price or a status. Pick one.'));
  // sale or asking
  const sp = has('price_sale'); const ap = has('price_ask'); const bp = has('price');
  if (has('status')) {
    const seen = new Map();
    for (const row of rows) { const s = statusKey(row.cells[col('status')]); if (s && !isBlank(s) && !seen.has(s)) seen.set(s, true); }
    const unknown = [...seen.keys()].filter((s) => !STATUS_DEFAULT.has(s) && !answers.statusMap.has(s));
    if (seen.size > 20 && unknown.length) qs.push(stop('status-many', 'The status column has more than 20 different values. Clean it up and try again.', true));
    else for (const s of unknown) qs.push(q('status', `What is “${s}”?`, [OPT.sale, OPT.market, ['skip', 'Leave out']], answers, { statusValue: s }));
  } else if (bp && (sp || ap)) qs.push(stop('price-mix', 'Set “Price” to Not used, or pick a Status column.'));
  else if (sp && ap) {
    if (answers.both === 'map') qs.push(stop('both-map', 'Set a column to Status, then continue.'));
    else qs.push(q('both', 'Rows with a sale price are sales?', [['yes', 'Yes'], ['map', 'Let me map a status']], answers));
  } else if (bp) qs.push(q('kind', 'Are these sale prices or asking prices?', [OPT.sale, OPT.market], answers));
  // cap and occupancy
  for (const [f, word] of [['cap', 'cap rates'], ['occ', 'occupancy']]) {
    if (!has(f)) continue;
    const cls = pctClass(rows, col(f), h.headers[col(f)]);
    if (cls === 'mixed') qs.push(stop(`mixed:${f}`, `The ${word} column has some values at 1 or below and some above 1, so it can't be read as fractions or percents. Set it to Not used, or fix the file.`, true));
    else if (cls === 'ask') qs.push(q(f, `Do the ${word} like 0.065 mean 6.5%?`, [['fraction', 'Yes, multiply by 100'], ['percent', 'No, they are percents']], answers));
  }
  // dates
  let order = 'mdy';
  if (has('date')) {
    const d = dateClass(rows, col('date'));
    if (d.fail) qs.push(stop('date-mixed', 'The dates are written day-first in some rows and month-first in others. Fix the file.', true));
    else if (d.ask) {
      const [a, b] = d.ask.split(/[-/.]/).map(Number);
      qs.push(q('date', `${d.ask} is ${MONTHS[a - 1]} ${b} or ${MONTHS[b - 1]} ${a}?`, [['mdy', `${MONTHS[a - 1]} ${b}`], ['dmy', `${MONTHS[b - 1]} ${a}`]], answers));
      order = answers.date || 'mdy';
    } else order = d.order;
  }
  // building area basis and land unit
  let hint = null;
  if (has('bsf') && !has('basis')) {
    hint = BASIS_HINT.get(normHeader(h.headers[col('bsf')])) || null;
    if (!hint) qs.push(q('basis', 'Is the building area rentable or gross?', [['rentable', 'Rentable'], ['gross', 'Gross'], ['unknown', 'Not sure']], answers));
  }
  if (has('lot')) qs.push(q('lot', `Is “${clip(h.headers[col('lot')], 40)}” in square feet or acres?`, [['sf', 'Square feet'], ['ac', 'Acres']], answers));
  return { h, rows, cols, at, qs, order, hint, col, has };
}

/* ------------------------------------------------------------- the rows */

const SUFFIX = new Map(Object.entries({ street: 'st', avenue: 'ave', road: 'rd', boulevard: 'blvd', drive: 'dr', lane: 'ln', place: 'pl', court: 'ct', parkway: 'pkwy', highway: 'hwy', terrace: 'ter', square: 'sq' }));
const DIRS = new Map(Object.entries({ north: 'n', south: 's', east: 'e', west: 'w', northwest: 'nw', northeast: 'ne', southwest: 'sw', southeast: 'se' }));

/** A comp's place as one comparable string: the street (lower case, no # . , and the usual suffix and direction words shortened) + "|" + the ZIP's first 5 digits, or the city. */
export function addressKey(c) {
  const toks = String(c.address || '').slice(0, LIMITS.text).toLowerCase().replace(/[#.,]/g, '').split(/\s+/).filter(Boolean).map((t) => DIRS.get(t) || t);
  if (toks.length) toks[toks.length - 1] = SUFFIX.get(toks[toks.length - 1]) || toks[toks.length - 1];
  const zip = c.zip ? String(c.zip).replace(/\D/g, '').padStart(5, '0').slice(0, 5) : '';
  return `${toks.join(' ')}|${zip || String(c.city || '').trim().toLowerCase()}`;
}
const sameKey = (a, b) => {
  const [sa, ta] = [a.slice(0, a.lastIndexOf('|')), a.slice(a.lastIndexOf('|') + 1)];
  const [sb, tb] = [b.slice(0, b.lastIndexOf('|')), b.slice(b.lastIndexOf('|') + 1)];
  return sa !== '' && sa === sb && (ta === tb || !ta || !tb);
};
const parcelSet = (c) => new Set([...(c.parcels || [])].map((p) => String(p).toUpperCase().replace(/\s+/g, '')).filter(Boolean));
const RANK = { same: 3, possible: 2, resale: 1 };

const KEYS = new WeakMap();
/** A comp's address key and parcels, kept until its address, ZIP, city or parcels change (2,000 rows are compared with 2,000 comps). */
const keyed = (c) => {
  const sig = `${c.address}|${c.zip}|${c.city}|${[...(c.parcels || [])]}`;
  let k = KEYS.get(c);
  if (!k || k.sig !== sig) KEYS.set(c, k = { sig, key: addressKey(c), pc: parcelSet(c) });
  return k;
};
/** Whether a comp is already in `existing`: { level: 'same'|'possible'|'resale', of, why } or null. Only the same kind is compared (a listing that later sold is two comps). */
export function dupeOf(comp, existing) {
  const { key, pc } = keyed(comp);
  let best = null;
  for (const e of existing) {
    if (e === comp || e.kind !== comp.kind) continue;
    const days = comp.date && e.date ? Math.round(Math.abs(+new Date(comp.date) - +new Date(e.date)) / 864e5) : null;
    const { key: ek, pc: pe } = keyed(e);
    let level = null; let why = '';
    if (pc.size && [...pc].some((p) => pe.has(p)) && (days === null || days < 183)) { level = 'same'; why = 'same parcel number'; }
    else if (sameKey(key, ek) || (pc.size && [...pc].some((p) => pe.has(p)))) {
      const a = comp.price; const b = e.price;
      const near = typeof a === 'number' && typeof b === 'number' && a > 0 && b > 0 && Math.abs(a - b) <= 0.01 * Math.min(a, b);
      if (days !== null) {
        if (days <= 31) { level = 'same'; why = `same address, ${days} day${days === 1 ? '' : 's'} apart`; }
        else if (days < 183) { level = 'possible'; why = `same address, ${days} days apart`; }
        else { level = 'resale'; why = `same address, ${days} days apart (a resale)`; }
      } else if (near) { level = 'same'; why = 'same address and a price within 1%'; }
      else { level = 'possible'; why = 'same address, no date to compare'; }
    }
    if (level && (!best || RANK[level] > RANK[best.level])) best = { level, of: e, why };
  }
  return best;
}

const DATE_NUM = (n) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * Build the comps. `answers` come from questionsFor; `ctx` = { existing (comps already in the set), file, sha256, source (the
 * label), sheet, now (a Date) }. Returns { comps (every comp built; rows say which to add), rows: [{ r, status ('add'|'out'),
 * why, comp, checks: [{ level, text }], dupe }], checks (for the file), refuse }. A question left open, a block or a fail refuses.
 */
export function readRows(grid, mapping, answers, ctx) {
  const empty = (refuse) => ({ comps: [], rows: [], checks: [], refuse });
  const p = plan(grid, mapping, answers);
  if (p.refuse) return empty(p.refuse);
  const open = p.qs.find((x) => x.block || !x.options.some((o) => o[0] === x.value));
  if (open) return empty(open.block || `Answer first: ${open.text}`);
  const { h, rows, col, has } = p;
  const fileChecks = [];
  const now = ctx.now || new Date();
  const profile = mapping.profile || null;
  const label = clip(ctx.source || ctx.file || 'Imported file', LIMITS.source);
  const scaleFor = (f) => { const i = col(f); const own = scaleOf(h.headers[i]).scale; return own !== 1 ? own : scaleOf(h.preamble).scale; };
  const scales = Object.fromEntries(['price', 'price_sale', 'price_ask', 'noi'].filter(has).map((f) => [f, scaleFor(f)]));
  const pmode = (f) => (has(f) ? (pctClass(rows, col(f), h.headers[col(f)]) === 'ask' && answers[f] === 'fraction' ? 100 : 1) : 1);
  const mult = { cap: pmode('cap'), occ: pmode('occ') };
  if (mapping.columns.includes('rent')) fileChecks.push({ level: 'info', text: 'Rent columns are not read on sale comps.' });
  const out = []; const built = [];
  const priced = [];
  rows.forEach((row, n) => {
    const checks = [];
    const warn = (text) => checks.push({ level: 'warn', text });
    const note = (text) => checks.push({ level: 'info', text });
    const raw = (f) => (has(f) ? row.cells[col(f)] : null);
    const head = (f) => clip(h.headers[col(f)], 40);
    const text = (f, cap = LIMITS.text) => {
      const s = clip(raw(f), cap);
      if (isBlank(s)) { if (s) note(`${head(f)}: “${s}” read as blank`); return null; }
      return s;
    };
    // numbers: null for blank or unreadable (unreadable warns, quoting the cell)
    const num = (f) => {
      const s = clip(raw(f));
      if (isBlank(s)) { if (s) note(`${head(f)}: “${s}” read as blank`); return null; }
      const v = numOf(raw(f));
      if (v === null) warn(`${head(f)}: “${s.slice(0, 40)}” is not a number, left blank`);
      return v;
    };
    const money = (f) => { const v = num(f); return v === null ? null : toCents(v * (scales[f] || 1)); };
    const res = { r: row.r, status: 'add', why: null, comp: null, checks, dupe: null };
    out.push(res);
    const address = text('address');
    if (!address) { Object.assign(res, { status: 'out', why: 'No address' }); return; }
    // sale or asking
    const cellHas = (f) => has(f) && !isBlank(clip(raw(f)));
    let kind = null;
    if (has('status')) {
      const s = statusKey(raw('status'));
      const v = isBlank(s) ? null : (answers.statusMap.get(s) || STATUS_DEFAULT.get(s));
      if (v === 'sale' || v === 'market') kind = v; else { Object.assign(res, { status: 'out', why: s && !isBlank(s) ? clip(raw('status'), 40) : 'No status' }); return; }
    } else if (has('price_sale') && has('price_ask')) kind = cellHas('price_sale') ? 'sale' : cellHas('price_ask') ? 'market' : null;
    else if (has('price_sale')) kind = 'sale';
    else if (has('price_ask')) kind = 'market';
    else kind = answers.kind;
    if (!kind) { Object.assign(res, { status: 'out', why: 'No sale or asking price' }); return; }
    const c = blankComp(kind);
    c.address = address;
    c.name = text('name') || address;
    for (const f of ['city', 'submarket', 'zoning', 'ptype', 'bclass', 'buyer', 'seller', 'buyer_broker', 'listing_broker', 'sale_type', 'conditions']) if (has(f)) c[f] = text(f);
    if (has('notes')) c.notes = text('notes', LIMITS.notes);
    if (has('state')) {
      const s = text('state');
      c.state = s && /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : null;
      if (s && !c.state) note(`State “${s.slice(0, 40)}” is not two letters, left blank`);
    }
    if (has('zip')) {
      const s = text('zip');
      const d = s ? s.replace(/\D/g, '') : '';
      c.zip = d.length >= 5 ? d.slice(0, 5) : null;
      if (s && !c.zip) note(`ZIP “${s.slice(0, 40)}” has fewer than 5 digits, left blank`);
    }
    if (has('year')) {
      const v = num('year');
      if (v !== null && Number.isInteger(v) && v >= 1600 && v <= 2100) c.year = v; else if (v !== null) warn(`Year built ${v} is out of range, left blank`);
    }
    if (has('comp_id')) { const v = num('comp_id'); c.comp_id = v !== null && Number.isInteger(v) ? v : null; }
    if (has('dom')) {
      const v = num('dom');
      if (v !== null && Number.isInteger(v) && v >= 0) c.dom = v; else if (v !== null) warn(`Days on market ${v} is not a whole number of days, left blank`);
    }
    // price
    let price = null;
    if (kind === 'sale') {
      if (has('price_sale')) price = money('price_sale'); else if (has('price')) price = money('price');
      if (price === null && cellHas('price_ask')) warn('Only an asking price is given; an asking price is not a sale price, so the price is blank');
    } else if (has('price_ask')) price = money('price_ask'); else if (has('price')) price = money('price');
    if (price !== null && price < 0) { warn('The price is negative, left blank'); price = null; }
    if (price === 0) warn('The price is 0 (kept as given)');
    c.price = price;
    if (price !== null) priced.push(price);
    // date
    if (has('date')) {
      const v = raw('date');
      const s = clip(v);
      if (kind === 'market') { if (!isBlank(s)) note('A date on a listing is ignored'); } else if (!isBlank(s)) {
        let iso = null;
        if (typeof v === 'number') iso = v >= 20000 && v <= 80000 ? DATE_NUM(v) : null;
        else {
          const m = p.order === 'dmy' ? DATE_PARTS.exec(s) : null;
          iso = parseDateText(m ? `${m[2]}/${m[1]}/${m[3]}` : s);
        }
        if (iso) c.date = new Date(`${iso}T00:00:00Z`); else warn(`Sale date “${s.slice(0, 40)}” could not be read, left blank`);
      } else if (s) note(`${head('date')}: “${s}” read as blank`);
    }
    // area
    let basis = 'unknown';
    if (has('bsf')) {
      const v = num('bsf');
      if (v !== null && v > 0) c.bsf = v; else if (v !== null) warn('Building SF is not above 0, left blank');
      basis = has('basis') ? (BASES.includes(clip(raw('basis')).toLowerCase()) ? clip(raw('basis')).toLowerCase() : 'unknown') : (p.hint || answers.basis);
    }
    c.bsf_basis = BASES.includes(basis) ? basis : 'unknown';
    if (has('ppsf')) {
      const v = num('ppsf');
      c.reported_ppsf = v === null ? null : toRate(v);
      if (v !== null && c.price && c.bsf && Math.abs(v - c.price / c.bsf) > 0.01 * (c.price / c.bsf)) warn(`The reported $/SF (${v}) differs from price ÷ building SF (${(c.price / c.bsf).toFixed(2)}) by more than 1%`);
    }
    for (const f of ['cap', 'occ']) {
      if (!has(f)) continue;
      const v = num(f);
      if (v === null) continue;
      c[f] = toRate(v * (/%/.test(clip(raw(f))) ? 1 : mult[f]));
    }
    if (c.cap !== null && (c.cap < 0 || c.cap > 25)) warn(`Cap rate ${c.cap}% is ${c.cap < 0 ? 'negative' : 'above 25%'}`);
    if (c.occ !== null && (c.occ < 0 || c.occ > 100)) warn(`Occupancy ${c.occ}% is ${c.occ < 0 ? 'negative' : 'above 100%'}`);
    if (has('noi')) {
      const noi = money('noi');
      if (noi !== null && c.price > 0 && c.cap !== null && Math.abs((noi / c.price) * 100 - c.cap) > 0.25) warn(`The cap rate ${c.cap}% differs from NOI ÷ price (${((noi / c.price) * 100).toFixed(2)}%) by more than 0.25 points`);
    }
    // land
    const flags = [];
    for (const f of ['lot_sf', 'lot_ac', 'lot']) {
      if (!has(f)) continue;
      const v = num(f);
      if (v === null) continue;
      const unit = f === 'lot' ? answers.lot : f === 'lot_ac' ? 'ac' : 'sf';
      if (unit === 'ac') { c.lot_ac = v; if (c.lot_sf === null) { c.lot_sf = Math.round(v * ACRE); flags.push(`lot SF worked out from ${v} acres`); } } else {
        c.lot_sf = v;
        if (v < 100) warn(`Lot SF ${v} is under 100; is it acres?`);
      }
    }
    if (has('parcel')) {
      const s = clip(raw('parcel'), LIMITS.text);
      if (!isBlank(s)) c.parcels = new Set(s.split(/[;,|]/).map((x) => x.replace(/\s+/g, '').toUpperCase()).filter(Boolean).slice(0, LIMITS.parcels));
    }
    // where it came from
    /** @type {CompOrigin} */
    const origin = { kind: 'import', source: label, file: clip(ctx.file, LIMITS.file) || null, sha256: ctx.sha256 || null, sheet: clip(ctx.sheet || grid.sheet, LIMITS.sheet) || null, row: row.r, page: null, profile, importedAt: now.toISOString() };
    c.origin = origin;
    c.source = originText(origin);
    c.key = `import::${now.getTime().toString(36)}${n}`;
    c.flags = [`imported from ${label} (${origin.file || 'a file'}, row ${row.r}) -- not from a CoStar report`, ...flags, ...checks.filter((x) => x.level === 'warn').map((x) => x.text)];
    if (c.bsf !== null && c.bsf_basis !== 'rentable') {
      c.exclude = true;
      c.flags.push(c.bsf_basis === 'gross' ? 'building area is gross, not rentable: set aside from $/SF until you include it' : 'building area basis (rentable or gross) is not known: set aside from $/SF until you include it');
    }
    res.comp = c;
    res.dupe = dupeOf(c, [...(ctx.existing || []), ...built]);
    built.push(c);
  });
  if (priced.length && Object.keys(scales).length && Object.values(scales).every((s) => s === 1) && median(priced) < 10000) fileChecks.push({ level: 'warn', text: 'The median price is under $10,000. Is this column in thousands? (It is not scaled unless the heading or a note above says so.)' });
  return { comps: out.filter((x) => x.comp).map((x) => x.comp), rows: out, checks: fileChecks, refuse: null };
}

/* -------------------------------------------------- remembered layouts */

const HEX64 = /^[0-9a-f]{64}$/;
const finite = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.floor(v) : 0);

/** The stored layouts made safe: { v: 1, items: { [64-hex fingerprint]: record } }, at most 50, bad records dropped. */
export function normMappings(raw) {
  const items = {};
  const src = raw && typeof raw === 'object' && raw.items && typeof raw.items === 'object' ? Object.entries(raw.items) : [];
  for (const [fp, r] of src) {
    if (!HEX64.test(fp) || !r || typeof r !== 'object') continue;
    const columns = Object.fromEntries(Object.entries(r.columns && typeof r.columns === 'object' ? r.columns : {}).slice(0, MAX_COLS)
      .filter(([k, v]) => typeof k === 'string' && k.length <= LIMITS.text && (v === 'none' || (typeof v === 'string' && own(FIELD_BY_ID, v)))));
    const answers = {};
    for (const [k, v] of Object.entries(r.answers && typeof r.answers === 'object' ? r.answers : {})) if (own(ANSWERS, k) && ANSWERS[k].includes(v)) answers[k] = v;
    const statusMap = Object.fromEntries(Object.entries(r.statusMap && typeof r.statusMap === 'object' ? r.statusMap : {}).slice(0, 20)
      .filter(([k, v]) => k.length <= 100 && ['sale', 'market', 'skip'].includes(v)));
    items[fp] = { source: typeof r.source === 'string' ? clip(r.source, LIMITS.source) : '', columns, answers, statusMap, uses: finite(r.uses, 0, 1e6), savedAt: finite(r.savedAt, 0, 1e15) };
  }
  return { v: 1, items: capMappings(items) };
}
const capMappings = (items) => Object.fromEntries(Object.entries(items).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, LIMITS.mappings));

/** The stored layouts with this one added or refreshed (its use count goes up by one); the oldest beyond 50 are dropped. Returns a new object. */
export function rememberMapping(store, fp, rec, now) {
  const cur = normMappings(store).items;
  const prev = cur[fp];
  return { v: 1, items: capMappings({ ...cur, [fp]: { ...rec, uses: (prev ? prev.uses : 0) + 1, savedAt: now } }) };
}

/** The record to remember after an import: the headings (normalised) and what each was set to, the answers, the status choices. */
export function mappingRecord(headers, columns, answers, label) {
  const { statusMap, ...rest } = answers;
  return {
    source: clip(label, LIMITS.source), columns: Object.fromEntries(headers.map((x, i) => [normHeader(x), columns[i]]).filter(([k]) => k)),
    answers: rest, statusMap: Object.fromEntries(statusMap || []), uses: 0, savedAt: 0,
  };
}
