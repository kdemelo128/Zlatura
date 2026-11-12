/* intake.js -- "Start from documents": the pure logic behind the Underwrite tab's first card. Several files are
 * looked at (ddintake.js: the bytes, then the readers that already exist) and each becomes a STAGED item: what it
 * is, how sure that is (a status word, never a number), why, and what "Use" would do with it. Nothing enters a deal
 * from here. The items live in memory until the broker taps "Use" (the screen then attaches the file through the
 * deal's own readers and deal.dd); a skipped file is simply forgotten.
 *
 * Never guessed: two documents of one kind that compete for the deal (a rent roll, a T-12, an OM) are ASKED, as is a
 * document that is already the controlling one on the deal; a file whose type no reader set is asked; the same file
 * twice is flagged and kept once. Money, units and periods are not decided here: a reader that asks (number format,
 * which sheet) asks when the file is used. No money maths in this file, and no AI call: aiReason() is the one test
 * of whether a later step may send anything, and a confidential deal says no. */

import { lookAt, identify } from './ddintake.js';
import { typeLabel, isType } from './ddtypes.js';
import { blocked } from './ai.js';

/** The documents the checklist asks about first. */
export const CHECKLIST = Object.freeze(['rentroll', 't12', 'lease', 'om']);
/** Kinds a deal has one of at a time: two candidates compete, and the broker chooses. (Leases are many by nature.) */
export const CONTROLLED = Object.freeze(['rentroll', 't12', 'om']);
export const STATES = Object.freeze(['staged', 'used', 'skipped']);
export const KEEP = 'existing';

const REASONS = {
  rrpdf: 'Its pages read as a rent roll.',
  rrsheet: 'Its columns read as a rent roll (unit, tenant, area and rent).',
  t12: 'It has the month columns of an operating statement.',
  t12pdf: 'It has an explicit full-year actual operating-statement column. Review its period and numbers before importing.',
  om: 'Its pages read as an offering memorandum.',
};

/** "Use as rent roll", "Use as T-12": the proposed use of a document of this type. */
export function useLabel(type) {
  if (type === 'rentroll') return 'Use as rent roll';
  if (type === 't12') return 'Use as T-12';
  if (type === 'om') return 'Use as OM';
  if (type === 'lease') return 'Use as lease';
  return type ? `Keep as ${typeLabel(type).toLowerCase()}` : null;
}

/** A staging area: items in the order added, and the broker's pick for each competing kind. */
export const newPlan = () => ({ items: /** @type {any[]} */ ([]), choice: /** @type {Record<string, string>} */ ({}), seq: 0 });

/**
 * Stage one looked-at file. info is what ddintake.intake returned (or a stand-in with the same fields), file the
 * File itself (kept in memory only). `dd` is the deal's registry when there is one, so a file already on the deal is
 * flagged. Returns the item, which is also pushed on plan.items. A refused or repeated file is state 'skipped' with
 * its reason in `refuse` or `dup`; it is never staged.
 * @param {any} plan @param {any} info @param {any} file @param {{ docs?: any[] } | null} [dd]
 */
export function stage(plan, info, file, dd = null) {
  const v = info.verdict || {};
  const type = isType(v.type) ? v.type : null;
  const looks = isType(v.looks) ? v.looks : null;
  const item = {
    id: `f${++plan.seq}`, name: String(info.name ?? ''), file, kind: info.kind || 'other', size: info.size | 0, sha256: info.sha256 || null, pages: info.pages || null,
    type, typeBy: type ? 'reader' : null,
    confidence: type ? 'Read' : looks ? 'Looks like' : 'Not sure',
    reason: type ? (REASONS[v.reader] || 'A reader on this device recognised it.') : looks ? `Its text reads like a ${typeLabel(looks).toLowerCase()}. Confirm it, or choose another type.` : v.scanned ? NO_TEXT : 'Nothing in it says what it is. Choose a type, or skip it.',
    // a PDF with almost no text keeps its bytes in memory so the broker can ask for OCR (readScan); they are never stored
    scanned: !type && !!v.scanned && !!info.bytes, bytes: /** @type {Uint8Array | null} */ (!type && v.scanned && info.bytes ? info.bytes : null), ocr: false,
    ask: type ? [] : [...new Set([...(looks ? [looks] : []), ...(v.ask || []).filter(isType)])],
    use: useLabel(type), state: 'staged', from: /** @type {string | null} */ (info.from || null), dup: /** @type {string | null} */ (null), refuse: /** @type {string | null} */ (info.refuse || null),
    pageProfiles: Array.isArray(v.pageProfiles) ? v.pageProfiles : [],
  };
  const same = (x) => (item.sha256 ? x.sha256 === item.sha256 : !x.sha256 && x.name === item.name && x.size === item.size);
  const twin = plan.items.find((x) => !x.refuse && !x.dup && same(x));
  const onDeal = !twin && dd && Array.isArray(dd.docs) ? dd.docs.find((x) => (item.sha256 ? x.sha256 === item.sha256 : false)) : null;
  if (item.refuse) { item.state = 'skipped'; item.use = null; }
  else if (twin || onDeal) {
    item.dup = twin ? `The same file as ${twin.name}, already in this list. It was kept once.` : `The same file as ${onDeal.name}, already on this deal. It was not added again.`;
    item.state = 'skipped'; item.use = null;
  }
  plan.items.push(item);
  // one workbook that both the rent roll and the T-12 readers accept: two uses of the one file, neither chosen for the broker.
  // Each goes through its own import (which asks which sheet); the second is not "the same file twice".
  const rs = Array.isArray(v.readers) ? v.readers : [];
  if (!item.refuse && !item.dup && !type && rs.includes('t12') && rs.includes('rrsheet')) {
    const both = 'This workbook has a rent roll and an operating statement. Each Use goes through its own import, which asks which sheet.';
    const mate = { ...item, id: `f${++plan.seq}` };
    for (const [it, t] of [[item, 'rentroll'], [mate, 't12']]) Object.assign(it, { type: t, typeBy: 'reader', confidence: 'Read', reason: both, ask: [], use: useLabel(t), pair: item.id });
    plan.items.push(mate);
  }
  return item;
}

const NO_TEXT = 'It has no text layer (a scan, or text drawn as a picture), so nothing could be read from it. Read it on this device with OCR, choose a type, or skip it.';

/**
 * "Read it with OCR": the broker asked for the first page of a PDF with no text layer to be read on this device.
 * `ocrText(bytes, onProgress)` gives the page's text (ocr.js through dealui.js). The text goes through the same
 * identify() every file does, but what it says is only ever offered: a type is never set from OCR text (a reader's
 * "this is a rent roll" becomes "looks like", to be confirmed by a tap), and no figure is read here at all; the
 * figures of a rent roll or T-12 come from that document's own import, which asks, and the OCR rows it reads
 * are held for the broker's accept. Returns { ok: true, chars } or { ok: false, why }.
 * @param {any} plan @param {string} id @param {(bytes: Uint8Array, onProgress?: (t: string) => void) => Promise<string>} ocrText @param {(t: string) => void} [onProgress]
 */
export async function readScan(plan, id, ocrText, onProgress) {
  const it = plan.items.find((x) => x.id === id);
  if (!it || it.state !== 'staged' || it.type || !it.scanned || !it.bytes) return { ok: false, why: 'That file has no scan waiting to be read.' };
  let text;
  try { text = String(await ocrText(it.bytes, onProgress)); } catch (err) { return { ok: false, why: `The page couldn’t be read: ${(err && /** @type {any} */ (err).message) || err}` }; }
  const chars = text.replace(/\s/g, '').length;
  it.ocr = true; it.scanned = false; it.bytes = null; // asked once; the bytes are let go
  if (chars < 20) { it.confidence = 'Not sure'; it.reason = 'OCR found no readable text on its first page. Choose a type, or skip it.'; it.ask = []; return { ok: true, chars }; }
  const v = identify({ name: it.name, pages: [text] });
  const looks = isType(v.type) ? v.type : isType(v.looks) ? v.looks : null; // OCR text never types a file by itself
  it.ask = [...new Set([...(looks ? [looks] : []), ...(v.ask || []).filter(isType)])];
  it.confidence = looks ? 'Looks like' : 'Not sure';
  it.reason = looks ? `Read by OCR on this device: its first page reads like a ${typeLabel(looks).toLowerCase()}. OCR can misread, so confirm it, or choose another type. Its figures come only from that document’s own import, which checks them.` : 'Read by OCR on this device, but its first page does not say what it is. Choose a type, or skip it.';
  return { ok: true, chars };
}

/** The broker names an item's type ("What is this?"). Returns false when it is not a type, or the item is not staged. */
export function answer(plan, id, type) {
  const it = plan.items.find((x) => x.id === id);
  if (!it || it.state !== 'staged' || !isType(type)) return false;
  it.type = type; it.typeBy = 'broker'; it.confidence = 'Asked'; it.reason = 'You said what it is.'; it.use = useLabel(type); it.ask = [];
  return true;
}

/** The skip of an item (it is forgotten, never added); false when it is not staged. */
export function skip(plan, id) {
  const it = plan.items.find((x) => x.id === id);
  if (!it || it.state !== 'staged') return false;
  it.state = 'skipped'; it.use = null;
  return true;
}

/** The controlling document of a kind on the deal: read by a reader, not superseded. null when there is none. */
export function onDeal(dd, kind) {
  const docs = dd && Array.isArray(dd.docs) ? dd.docs : [];
  return docs.find((x) => x.type === kind && x.status !== 'superseded' && x.read) || null;
}

/**
 * The controlling choice for a kind. { kind, cands (the staged items), existing (the deal's own, or null), pick
 * (the item that will be used, or null), keep (the broker kept the deal's), ask (the broker must choose) }.
 * One candidate and nothing on the deal is the choice; anything else asks, and never by date or by guess.
 */
export function controlling(plan, dd, kind) {
  const cands = plan.items.filter((x) => x.state === 'staged' && x.type === kind);
  const existing = onDeal(dd, kind);
  const chosen = plan.choice[kind];
  if (chosen === KEEP && existing) return { kind, cands, existing, pick: null, keep: true, ask: false };
  const hit = cands.find((x) => x.id === chosen);
  if (hit) return { kind, cands, existing, pick: hit, keep: false, ask: false };
  if (cands.length === 1 && !existing) return { kind, cands, existing, pick: cands[0], keep: false, ask: false };
  return { kind, cands, existing, pick: null, keep: false, ask: cands.length > 0 };
}

/** The broker's answer to a controlling question: an item id, or KEEP for the document already on the deal. */
export function choose(plan, dd, kind, id) {
  if (!CONTROLLED.includes(kind)) return false;
  if (id === KEEP) { if (!onDeal(dd, kind)) return false; plan.choice[kind] = KEEP; return true; }
  if (!plan.items.some((x) => x.id === id && x.state === 'staged' && x.type === kind)) return false;
  plan.choice[kind] = id;
  return true;
}

/** May "Use" run on this item now? It must be staged, typed, and, for a controlled kind, be the controlling pick. */
export function usable(plan, dd, item) {
  if (item.state !== 'staged' || !item.type) return false;
  return !CONTROLLED.includes(item.type) || controlling(plan, dd, item.type).pick === item;
}

/** What the broker still has to answer: items with no type, and kinds with competing documents. */
export function questions(plan, dd) {
  const q = [];
  for (const it of plan.items) if (it.state === 'staged' && !it.type) q.push({ kind: 'type', id: it.id, ask: it.ask });
  for (const k of CONTROLLED) if (controlling(plan, dd, k).ask) q.push({ kind: 'controlling', type: k });
  return q;
}

/** The checklist of what the deal still lacks: [{ type, label, status: 'on the deal' | 'used' | 'ready' | 'ask' | 'missing' }]. */
export function checklist(plan, dd) {
  return CHECKLIST.map((type) => {
    const mine = plan.items.filter((x) => x.type === type);
    const c = CONTROLLED.includes(type) ? controlling(plan, dd, type) : null;
    let status = 'missing';
    if (mine.some((x) => x.state === 'used')) status = 'used';
    else if (c && c.ask) status = 'ask';
    else if (mine.some((x) => x.state === 'staged')) status = 'ready';
    else if (dd && Array.isArray(dd.docs) && dd.docs.some((x) => x.type === type && x.status !== 'superseded')) status = 'on the deal';
    return { type, label: typeLabel(type), status };
  });
}

/** The items "Use all" would take now, in the order added. */
export const readyItems = (plan, dd) => plan.items.filter((x) => usable(plan, dd, x));

/** The item has been attached to the deal. */
export function markUsed(plan, id) {
  const it = plan.items.find((x) => x.id === id);
  if (!it || it.state !== 'staged') return false;
  it.state = 'used'; it.use = null;
  return true;
}

/**
 * Look at several files in turn and stage each. `deps` as ddintake.intake takes them; `onStep(file, 'reading' |
 * 'done' | 'failed', item?)` reports progress so the screen can show it. A file that cannot be looked at is staged as
 * refused with the reason; the rest go on. Nothing is stored or sent.
 * @param {any} plan @param {File[]} files @param {any} deps @param {{ docs?: any[] } | null} dd @param {(file: File, step: string, item?: any) => void} [onStep]
 */
export async function stageFiles(plan, files, deps, dd = null, onStep = () => {}) {
  const out = [];
  for (const file of files) {
    onStep(file, 'reading');
    /** @type {{ file: any, info: any }[]} */ let seen;
    try { seen = await lookAt(file, deps); } catch (err) {
      seen = [{ file, info: { name: file.name, kind: 'other', size: file.size, sha256: null, pages: null, verdict: {}, refuse: `${file.name} couldn’t be looked at: ${(err && /** @type {any} */ (err).message) || err}` } }];
    }
    // a zip is several files: each part is staged exactly as if it had been dropped itself, naming the zip it came from
    let last = null;
    for (const s of seen) { last = stage(plan, s.info, s.file, dd); out.push(last); }
    onStep(file, seen.length && seen.every((s) => s.info.refuse) ? 'failed' : 'done', last || undefined);
  }
  return out;
}

/** Why a later step may not send these documents to an AI service, or null (a promise; the same guard every AI call goes through). A confidential deal always says why. The intake itself never sends anything. */
export const aiReason = (deal) => blocked({ deal: deal || {} });
