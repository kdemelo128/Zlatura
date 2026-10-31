/* compmodel.js -- what a comp says about where it came from, and the checks that make a comp read back from
 * a session, a project file or a backup safe to use. Pure. The comp importer (compimport.js) writes
 * these fields; store.compFromJSON runs every comp through normCompExtras, whatever carried it.
 * Design: docs/proposals/comp-importer-c1-note.md. */

export const ORIGIN_KINDS = ['costar', 'import', 'hand'];
export const BASES = ['rentable', 'gross', 'unknown'];
/** Caps on what a hostile or damaged file can put in a comp or the importer's memory. */
export const LIMITS = { source: 80, file: 200, sheet: 31, profile: 40, text: 200, notes: 1000, rows: 2000, cols: 100, mappings: 50, parcels: 20, comps: 2000 };

const strip = (s, n) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, '').slice(0, n) : null);
const intIn = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/** A stored origin made safe: null when it isn't an object or names no known kind; text capped, numbers in range, unknown keys dropped.
 * @param {any} raw
 * @returns {CompOrigin | null} */
export function normOrigin(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !ORIGIN_KINDS.includes(raw.kind)) return null;
  const t = typeof raw.importedAt === 'string' && Number.isFinite(Date.parse(raw.importedAt)) ? raw.importedAt.slice(0, 40) : null;
  return {
    kind: raw.kind, source: strip(raw.source, LIMITS.source), file: strip(raw.file, LIMITS.file),
    sha256: typeof raw.sha256 === 'string' && /^[0-9a-f]{64}$/.test(raw.sha256) ? raw.sha256 : null,
    sheet: strip(raw.sheet, LIMITS.sheet), row: intIn(raw.row, 1, 1e6), page: intIn(raw.page, 1, 1e6),
    profile: strip(raw.profile, LIMITS.profile), importedAt: t,
  };
}

/** The comp's added fields made safe, in place on a copy being read back (origin, bsf_basis, reported_ppsf); returns it. */
export function normCompExtras(o) {
  if ('origin' in o) { const n = normOrigin(o.origin); if (n) o.origin = n; else delete o.origin; }
  if (o.bsf_basis !== undefined && !BASES.includes(o.bsf_basis)) o.bsf_basis = 'unknown';
  if (o.reported_ppsf !== undefined && !(typeof o.reported_ppsf === 'number' && Number.isFinite(o.reported_ppsf) && o.reported_ppsf >= 0)) o.reported_ppsf = null;
  return o;
}

/** Where a comp came from: its stored origin, or one worked out (a parsed CoStar comp, a comp typed by hand); null when unknown.
 * @param {any} c
 * @returns {CompOrigin | null} */
export function originOf(c) {
  const o = normOrigin(c && c.origin);
  if (o) return o;
  if (c && c.manual) return { kind: 'hand', source: 'entered by hand', file: null, sha256: null, sheet: null, row: null, page: null, profile: null, importedAt: null };
  if (c && c.source) return { kind: 'costar', source: strip(c.source, LIMITS.source), file: null, sha256: null, sheet: null, row: null, page: null, profile: null, importedAt: null };
  return null;
}

/** "Firm sheet (oct.csv, row 14)".
 * @param {CompOrigin | null} o */
export function originText(o) {
  if (!o) return '';
  const src = o.source || (o.kind === 'hand' ? 'entered by hand' : 'unknown source');
  const where = [o.file, o.row ? `row ${o.row}` : null, o.page ? `page ${o.page}` : null].filter(Boolean);
  return o.kind === 'import' && where.length ? `${src} (${where.join(', ')})` : src;
}

/** A comp with every field present and empty, as the loader keeps one (a parsed CoStar comp, a typed one, an imported one). */
export function blankComp(kind) {
  return {
    manual: true, kind, origKind: kind, edited: new Set(), name: '', address: '', city: null, state: null, zip: null,
    submarket: null, zoning: null, date: null, dom: null, price: null, bsf: null, cap: null, occ: null,
    lot_sf: null, lot_ac: null, far: null, year: null, bclass: null, ptype: null, comp_id: null,
    buyer_broker: null, listing_broker: null, notes: null, costar_notes: null, costar_ppsf: null,
    partial: false, occ_basis: 'explicit', parcels: new Set(), portfolio: 0, source: '', flags: [], exclude: false,
  };
}
