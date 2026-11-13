/* ocrpdf.js -- a PDF with no text layer is read by OCR on this device, by itself, when it is looked at.
 *
 * The page text a PDF gives (pdftext.js) comes first; when the whole document has almost none (the rule rrdoc.js
 * docKind calls a scan) its pages are drawn and read by the on-device engine (ocr.js, vendored, nothing sent), up to
 * a page cap and a time budget, and the text and geometry replace the empty page text, page for page: page n of the
 * text is page n of the PDF, and a page that was not read stays empty. The result goes to the normal intake as text.
 * What OCR is unsure of is never guessed: a word with a digit in it below the confidence floor is left out, so that
 * cell is blank and the reader asks; the other low-confidence words stay, flagged by their line's confidence
 * (layout.js geometry, which omroll.js marks as read by OCR). `ocr` on the result says what was done, for the screen
 * ("Read by OCR: check every figure"). Cancel (signal) and the budgets end it at once and keep what was read.
 * Pure orchestration: the engine is injected, so a test and tests/tools/doc-local.mjs --ocr run this same code. */
import { openScanReader, ocrSupported } from './ocr.js';
import { sha256Hex } from './filehash.js';
import { pdfPages } from './pdftext.js';

export const OCR_LIMITS = { pages: 12, totalMs: 240000, pageMs: 90000, textChars: 200, blankBelow: 70, blankPage: 20 };

const charCount = (pages) => pages.join('').replace(/\s/g, '').length;
/** True for a PDF whose pages hold almost no text: the same line rrdoc.js docKind draws for a scan. */
export const hasNoTextLayer = (pages) => Array.isArray(pages) && pages.length > 0 && charCount(pages) < OCR_LIMITS.textChars;
/** The pages (1-based) of a document that has text but whose own text layer is empty on some pages: the scanned rent roll
 * page inside an OM. Nothing for a document with no text at all (that is hasNoTextLayer: read whole) or with no empty page. */
export const blankPageList = (pages, floor = OCR_LIMITS.blankPage) => {
  if (!Array.isArray(pages) || hasNoTextLayer(pages) || !pages.length) return [];
  return pages.map((t, i) => (t.replace(/\s/g, '').length < floor ? i + 1 : 0)).filter(Boolean);
};

/**
 * @param {any} pdfjs @param {Uint8Array} bytes @param {{ pages: string[], layouts: any[] }} base what the text layer gave
 * @param {{ only?: number[], open?: (pdfjs: any, bytes: Uint8Array) => any, supported?: () => boolean, signal?: { aborted: boolean }, onProgress?: (t: string) => void, limits?: Partial<typeof OCR_LIMITS>, now?: () => number }} [opts] `only`: read just these pages (an OM's empty pages), whatever the rest holds
 * @returns {Promise<{ pages: string[], layouts: any[], ocr: null | { blankOnly: boolean, read: number[], of: number, capped: boolean, timedOut: boolean, cancelled: boolean, failed: number[], unsure: number, low: number, conf: number, unsupported: boolean } }>}
 */
export async function ocrIfScanned(pdfjs, bytes, base, { only, open = openScanReader, supported = ocrSupported, signal, onProgress = () => {}, limits = {}, now = Date.now } = {}) {
  const L = { ...OCR_LIMITS, ...limits };
  if (!only && !hasNoTextLayer(base.pages)) return { ...base, ocr: null };
  const of = base.pages.length;
  const todo = only ? [...new Set(only)].filter((p) => p >= 1 && p <= of).sort((a, b) => a - b) : Array.from({ length: of }, (_, i) => i + 1);
  if (!todo.length) return { ...base, ocr: null };
  const total = only ? of : Math.min(of, L.pages);
  const ocr = { blankOnly: !!only, read: /** @type {number[]} */ ([]), of, capped: todo.length > L.pages, timedOut: false, cancelled: false, failed: /** @type {number[]} */ ([]), unsure: 0, low: 0, conf: 0, unsupported: false };
  if (!supported()) { ocr.unsupported = true; return { ...base, ocr }; }
  const pages = base.pages.slice();
  const layouts = base.layouts.slice();
  const t0 = now();
  let reader = null;
  let confSum = 0;
  try {
    reader = open(pdfjs, bytes);
    for (const p of todo.slice(0, L.pages)) {
      if (signal && signal.aborted) { ocr.cancelled = true; break; }
      if (now() - t0 > L.totalMs) { ocr.timedOut = true; break; }
      let timer;
      const stuck = new Promise((_, no) => { timer = setTimeout(() => no(new Error('page took too long')), L.pageMs); });
      try {
        const r = await Promise.race([reader.read(p, { onProgress: (t) => onProgress(`Page ${p} of ${total}: ${t}`), blankBelow: L.blankBelow }), stuck]);
        pages[p - 1] = r.text; layouts[p - 1] = r.geom || {};
        ocr.read.push(p); ocr.unsure += r.unsure || 0; ocr.low += r.low || 0; confSum += r.conf || 0;
      } catch { ocr.failed.push(p); try { await reader.restart(); } catch { /* the next page starts a fresh engine */ } } finally { clearTimeout(timer); }
    }
  } catch { ocr.failed.push(...todo.slice(0, L.pages).filter((p) => !ocr.read.includes(p) && !ocr.failed.includes(p))); } finally { if (reader) await Promise.resolve(reader.close()).catch(() => {}); }
  ocr.conf = ocr.read.length ? Math.round(confSum / ocr.read.length) : 0;
  // nothing came back: the document stays what it was (a scan nobody could read), the note says why
  return { pages: ocr.read.length ? pages : base.pages, layouts: ocr.read.length ? layouts : base.layouts, ocr };
}

/** The one line for the screen: what OCR did to this PDF. */
export function ocrNote(ocr) {
  if (!ocr) return '';
  if (ocr.unsupported) return 'This browser can’t run the on-device OCR reader, so the scan was not read.';
  if (!ocr.read.length) return ocr.cancelled ? 'OCR was cancelled: nothing was read from this scan.' : 'OCR could not read this scan.';
  const bits = [`Read by OCR on this device (${ocr.read.length === ocr.of ? `all ${ocr.of} page${ocr.of === 1 ? '' : 's'}` : `page${ocr.read.length === 1 ? '' : 's'} ${ocr.read.join(', ')} of ${ocr.of}`}): check every figure against the page.`];
  if (ocr.unsure) bits.push(`${ocr.unsure} figure${ocr.unsure === 1 ? ' was' : 's were'} too unclear to read and ${ocr.unsure === 1 ? 'is' : 'are'} left blank, to be asked.`);
  if (ocr.cancelled) bits.push('You cancelled; the rest was not read.');
  else if (ocr.timedOut) bits.push('It stopped at the time limit; the rest was not read.');
  else if (ocr.capped) bits.push(ocr.blankOnly ? `Only the first ${ocr.read.length + ocr.failed.length} of the pages with no text are read at once.` : `Only the first ${ocr.read.length + ocr.failed.length} pages are read at once.`);
  if (ocr.failed.length) bits.push(`Page${ocr.failed.length === 1 ? '' : 's'} ${ocr.failed.join(', ')} could not be read.`);
  return bits.join(' ');
}

/* What OCR did to each PDF read in this session, by the file's SHA-256, so the staging list can mark the item, and the
 * pages already read are not read twice when the document is used. Held in memory only; never stored. */
const done = new Map(); // finished reads: used again when the document is used
const seen = new Map(); // what was done to each, even when it was cancelled or timed out (for the mark), but not kept for re-use
export const rememberOcr = (sha, res) => {
  if (!sha || !res.ocr) return;
  seen.set(sha, res.ocr);
  if (!res.ocr.cancelled && !res.ocr.timedOut) done.set(sha, res); // a cancelled or timed-out read is not kept: asking again reads again
};
export const ocrOf = (sha) => (sha && seen.get(sha)) || null;
export const ocrResult = (sha) => (sha && done.get(sha)) || null;

/** A PDF's text, then OCR when it has none: the readPdf the intake takes. `startProgress()` gives { signal, say, end } (ocrprogress.js). */
export async function readPdfOcr(pdfjs, bytes, readText, startProgress, opts = {}) {
  const base = await readText(bytes);
  if (!hasNoTextLayer(base.pages)) return base;
  const sha = await sha256Hex(bytes);
  const hit = ocrResult(sha);
  if (hit) return hit;
  const progress = startProgress();
  try {
    const res = await ocrIfScanned(pdfjs, bytes, base, { onProgress: progress.say, signal: progress.signal, ...opts });
    rememberOcr(sha, res);
    return res;
  } finally { progress.end(); }
}

/** pdfPages, except that a PDF already read by OCR this session gives the OCR text and geometry where its own text layer is empty
 * (the rent roll and T-12 imports read the file again when it is used: it is not OCR'd twice). Nothing read yet: exactly pdfPages. */
export async function pdfPagesWithOcr(pdfjs, data, opts = {}) {
  const sha = done.size ? await sha256Hex(data) : null; // before pdf.js takes the buffer
  const pages = await pdfPages(pdfjs, data, opts);
  const hit = sha && hasNoTextLayer(pages) ? ocrResult(sha) : null;
  if (!hit) return pages;
  if (Array.isArray(opts.layouts)) { opts.layouts.length = 0; opts.layouts.push(...hit.layouts); }
  return hit.pages.slice();
}

/** The pdfPages the deal screens use: the page text, then OCR on this device where the text layer is empty. A PDF with no text
 * at all is read whole; with `opts.ocr.mixed` (an OM) the pages with no text inside a document that has some are read as well,
 * before any reader runs, so a scanned rent roll page is not missed. Same progress line, Cancel, page cap and time budget as
 * Start from documents; a PDF read this session is not read twice. `opts.ocr.onOcr(ocr)` hears what was done; `opts.ocr.engine`
 * is for tests. Everything else in `opts` is pdfPages' own (layouts, onPage). Nothing is stored. */
/** @param {any} pdfjs @param {Uint8Array} data @param {any} [opts] @param {() => { signal: { aborted: boolean }, say: (t: string) => void, end: () => void }} [startProgress] */
export async function pdfPagesAutoOcr(pdfjs, data, opts = {}, startProgress = () => ({ signal: { aborted: false }, say: (/** @type {string} */ _t) => {}, end() {} })) {
  const { ocr: o = {}, ...rest } = opts;
  const layouts = Array.isArray(rest.layouts) ? rest.layouts : [];
  const bytes = data.slice(); // pdf.js takes the buffer it is given
  const sha = await sha256Hex(bytes);
  const hit = ocrResult(sha);
  if (hit) { layouts.length = 0; layouts.push(...hit.layouts); if (o.onOcr && hit.ocr) o.onOcr(hit.ocr); return hit.pages.slice(); }
  const pages = await pdfPages(pdfjs, data, { ...rest, layouts });
  const only = hasNoTextLayer(pages) ? null : o.mixed ? blankPageList(pages) : [];
  if (only && !only.length) return pages;
  const progress = startProgress();
  try {
    const res = await ocrIfScanned(pdfjs, bytes, { pages, layouts }, { only: only || undefined, onProgress: progress.say, signal: progress.signal, ...(o.engine || {}) });
    rememberOcr(sha, res);
    if (res.ocr && o.onOcr) o.onOcr(res.ocr);
    layouts.length = 0; layouts.push(...res.layouts);
    return res.pages;
  } finally { progress.end(); }
}
