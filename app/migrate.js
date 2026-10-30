/* migrate.js -- every change to a stored deal's shape, in one ordered list.
 *
 * A deal saved by an older version is brought up to date by the steps it
 * hasn't had, in this order, wherever a deal comes in: when it is opened
 * (dealui.js) and when a backup brings it back (backupui.js). Each step
 * marks the deal as done with a version field, so it runs once; a deal
 * marked with a version newer than this code knows was saved by a newer
 * version of the app, and a backup holding one is refused (backup.js).
 *
 * The steps are pure: no storage, no page. tests/migrate.test.js runs each
 * one on real backups made by old versions (tests/fixtures), and fails if a
 * step is added here without a backup that needs it.
 *
 * Adding a step: append it (never reorder or edit a released one), give it a
 * field and a `to` above that field's last, and add a backup from the
 * version before it to the tests. */

import { quantizeDeal } from './engine/money.js';
import { fromOmRows } from './lease.js';
import { emptyRentRoll, layoutFromPreset, presetFor, MARKET_UNIT } from './rentroll.js';

/** Today on this device, as kit.js's localDate (kit.js needs a page, and this module doesn't). */
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * @typedef {Object} Step
 * @property {string} id
 * @property {'schema'|'moneyVersion'} field the deal's field that records it
 * @property {number} to the field's value once done
 * @property {string} since the version that added it
 * @property {string} does what it does, in a sentence
 * @property {string} brief the same in a few words, for a list (the restore's summary and history label)
 * @property {string} kind the history entry's kind, when it changes something
 * @property {(rounded: any[]) => string} label the history entry's label
 * @property {boolean} [silent] only marks the deal: no history entry and no new "last edited" date
 * @property {(d: any) => boolean} needed
 * @property {(d: any, ctx: { today: string }) => { rounded?: any[] }} up changes the deal in place
 */

/** @type {Step[]} */
export const MIGRATIONS = [
  {
    id: 'money',
    field: 'moneyVersion',
    to: 1,
    since: '4.1.0',
    does: 'Stored money rounded to whole cents, and rates per unit to four decimals.',
    brief: 'money rounded to whole cents',
    kind: 'rounding',
    label: (r) => `Stored money rounded to whole cents (rates to four decimals): ${r.length} value${r.length === 1 ? '' : 's'}`,
    needed: (d) => (d.moneyVersion || 0) < 1,
    up(d) {
      const { changes } = quantizeDeal(d);
      d.moneyVersion = 1;
      return { rounded: changes };
    },
  },
  {
    id: 'rent-roll',
    field: 'schema',
    to: 2,
    since: '3.1.0',
    does: 'A rent roll of leases set up from the OM’s rent roll table (or an empty one).',
    brief: 'rent roll set up',
    kind: 'create',
    label: () => 'Rent roll set up',
    // by the rent roll itself, not the field: a deal is never without one once it has had this
    needed: (d) => !d.rr,
    up(d, { today }) {
      const bsf = d.figures && Number.isFinite(d.figures.bsf) ? d.figures.bsf : null;
      const preset = presetFor(d.figures && d.figures.ptype);
      if (d.rentRoll && d.rentRoll.length) {
        d.rr = fromOmRows(d.rentRoll, { asOf: today, page: d.rentRollPage, buildingSf: bsf });
        d.rr.columns = layoutFromPreset(preset);
        d.rr.preset = preset;
        d.rr.settings.marketUnit = MARKET_UNIT[preset] || 'psf_year';
      } else d.rr = emptyRentRoll(d.figures && d.figures.ptype, today, bsf);
      if (d.figures && Number.isFinite(d.figures.opex)) d.rr.settings.opex = d.figures.opex;
      d.schema = 2;
      // the leases' money kept as all stored money is (the flat OM rows are rebuilt from them, so their rounding isn't news)
      const { changes } = quantizeDeal(d);
      return { rounded: changes.filter((c) => !/^rentRoll\[/.test(c.path)) };
    },
  },
  {
    id: 'rr-qc',
    field: 'schema',
    to: 3,
    since: '4.7.4',
    does: 'A rent roll read from an OM gets a Data QC record: the pages it came from, marked as read before the rows were checked against them.',
    brief: 'rent roll source recorded',
    kind: 'create',
    label: () => 'Rent roll source recorded (read before Data QC)',
    // a deal whose rent roll came from an OM's table, read before 4.7.4 kept its checks
    needed: (d) => !d.rrQc && Array.isArray(d.rentRoll) && d.rentRoll.length > 0 && /\.pdf$/i.test(String(d.source || '')) && (d.schema || 0) < 3,
    up(d) {
      const page = Number.isFinite(d.rentRollPage) ? d.rentRollPage : null;
      d.rrQc = {
        v: 1, legacy: true, at: null, file: d.source || '', pages: page ? [page] : [], page, scanned: [], confidence: null,
        columns: [], totals: [], segments: [], checks: [], held: null, applied: true, ocr: [],
      };
      d.schema = 3;
      return { rounded: [] };
    },
  },
  {
    id: 'rr-pdf-source',
    field: 'schema',
    to: 4,
    since: '4.7.23',
    does: 'A lease can say it was read from a rent roll PDF of its own (source kind "pdf", with the file name, page and line). Nothing already stored changes: this marks the deal as written by a version that knows the new source, so an older app refuses its backup instead of showing the source wrongly.',
    brief: 'ready for rent roll PDFs',
    silent: true,
    kind: 'create',
    label: () => 'Ready for rent roll PDFs',
    needed: (d) => (d.schema || 0) < 4,
    up(d) {
      d.schema = 4;
      return { rounded: [] };
    },
  },
  {
    id: 'fee-record',
    field: 'schema',
    to: 5,
    since: '4.7.61',
    does: 'A deal can carry a fee record (the fee terms, the invoice and the payments). Nothing already stored changes: this marks the deal as written by a version that knows the fee record, so an older app refuses its backup instead of dropping the fee.',
    brief: 'ready for the fee record',
    silent: true,
    kind: 'create',
    label: () => 'Ready for the fee record',
    needed: (d) => (d.schema || 0) < 5,
    up(d) {
      d.schema = 5;
      return { rounded: [] };
    },
  },
  {
    id: 'credit-record',
    field: 'schema',
    to: 6,
    since: '4.7.68',
    does: 'A deal can carry a tenant credit record (who pays the rent, who guarantees it, ratings the broker typed, store sales). Nothing already stored changes: this marks the deal as written by a version that knows the credit record, so an older app refuses its backup instead of dropping it.',
    brief: 'ready for the credit record',
    silent: true,
    kind: 'create',
    label: () => 'Ready for the credit record',
    needed: (d) => (d.schema || 0) < 6,
    up(d) {
      d.schema = 6;
      return { rounded: [] };
    },
  },
  {
    id: 'dd-init',
    field: 'schema',
    to: 7,
    since: '4.7.78',
    does: 'A deal gets an empty due-diligence document list (deal.dd: which documents were received, never the files). Nothing already stored changes, and a list a newer version already wrote is left as it is. It also marks the deal as written by a version that knows the list, so an older app refuses its backup instead of dropping it.',
    brief: 'ready for the document list',
    silent: true,
    kind: 'create',
    label: () => 'Ready for the document list',
    needed: (d) => (d.schema || 0) < 7,
    up(d) {
      if (!d.dd) d.dd = { v: 1, preset: null, na: {}, docs: [] };
      d.schema = 7;
      return { rounded: [] };
    },
  },
];

/**
 * Steps for records kept in kv (not deals), each { key, to, since, up(record) }: the record's own `v` rises to
 * `to`. None yet: every kv record starts at v 1 (uw.scratch). A later change of shape becomes a step here,
 * with an old-backup fixture, as the deal steps above have.
 * @type {{ key: string, to: number, since: string, up: (rec: any) => void }[]}
 */
export const KV_MIGRATIONS = [];
/** The newest `v` this code writes for a kv key (1 when it has no steps). */
export const kvVersion = (key) => KV_MIGRATIONS.filter((s) => s.key === key).reduce((v, s) => Math.max(v, s.to), 1);
/** A kv record saved by a newer version: kept as it is, not shown, never rewritten (tooNew, for one record). */
export const kvTooNew = (key, rec) => !!rec && Number.isFinite(rec.v) && rec.v > kvVersion(key);
/** Bring a kv record up to date, in place. */
export function migrateKvRecord(key, rec) {
  for (const s of KV_MIGRATIONS) if (s.key === key && (rec.v || 1) < s.to) { s.up(rec); rec.v = s.to; }
  return rec;
}

/** The newest value of each version field this code writes. */
export const LATEST = /** @type {Record<Step['field'], number>} */ (MIGRATIONS.reduce((o, s) => ({ ...o, [s.field]: Math.max(o[s.field] || 0, s.to) }), {}));
export const SCHEMA = LATEST.schema;
export const MONEY_VERSION = LATEST.moneyVersion;

/** The steps a deal still needs, in order (none for a deal saved by a newer version). */
export function pending(d) {
  if (!d || tooNew(d)) return [];
  return MIGRATIONS.filter((s) => s.needed(d));
}

/** A deal saved by a version newer than this code: a version field above what it knows. */
export function tooNew(d) {
  return !!d && Object.entries(LATEST).some(([field, v]) => Number.isFinite(d[field]) && d[field] > v);
}

/** Apply one step to a deal, in place: what it did, and the money values it rounded (path, old, new). */
export function applyStep(d, s, { today = localDate() } = {}) {
  const { rounded = [] } = s.up(d, { today }) || {};
  return { id: s.id, brief: s.brief, rounded };
}

/**
 * Bring a deal up to date, in place. Returns the steps applied, in order,
 * each with what it rounded, for the deal's history and the rounding log.
 * Running it again applies nothing. (dealui.js applies them one at a time,
 * recording each in the history as it goes.)
 */
export function migrateDeal(d, ctx = {}) {
  return pending(d).map((s) => applyStep(d, s, ctx));
}
