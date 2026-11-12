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

export const OCR_LIMITS = { pages: 12, totalMs: 240000, pageMs: 90000, textChars: 200, blankBelow: 70 };

const charCount = (pages) => pages.join('').replace(/\s/g, '').length;
/** True for a PDF whose pages hold almost no text: the same line rrdoc.js docKind draws for a scan. */
export const hasNoTextLayer = (pages) => Array.isArray(pages) && pages.length > 0 && charCount(pages) < OCR_LIMITS.textChars;

/**
 * @param {any} pdfjs @param {Uint8Array} bytes @param {{ pages: string[], layouts: any[] }} base what the text layer gave
 * @param {{ open?: (pdfjs: any, bytes: Uint8Array) => any, supported?: () => boolean, signal?: { aborted: boolean }, onProgress?: (t: string) => void, limits?: Partial<typeof OCR_LIMITS>, now?: () => number }} [opts]
 * @returns {Promise<{ pages: string[], layouts: any[], ocr: null | { read: number[], of: number, capped: boolean, timedOut: boolean, cancelled: boolean, failed: number[], unsure: number, low: number, conf: number, unsupported: boolean } }>}
 */
export async function ocrIfScanned(pdfjs, bytes, base, { open = openScanReader, supported = ocrSupported, signal, onProgress = () => {}, limits = {}, now = Date.now } = {}) {
  const L = { ...OCR_LIMITS, ...limits };
  if (!hasNoTextLayer(base.pages)) return { ...base, ocr: null };
  const of = base.pages.length;
  const ocr = { read: /** @type {number[]} */ ([]), of, capped: of > L.pages, timedOut: false, cancelled: false, failed: /** @type {number[]} */ ([]), unsure: 0, low: 0, conf: 0, unsupported: false };
  if (!supported()) { ocr.unsupported = true; return { ...base, ocr }; }
  const pages = base.pages.slice();
  const layouts = base.layouts.slice();
  const t0 = now();
  let reader = null;
  let confSum = 0;
  try {
    reader = open(pdfjs, bytes);
    for (let p = 1; p <= Math.min(of, L.pages); p++) {
      if (signal && signal.aborted) { ocr.cancelled = true; break; }
      if (now() - t0 > L.totalMs) { ocr.timedOut = true; break; }
      let timer;
      const stuck = new Promise((_, no) => { timer = setTimeout(() => no(new Error('page took too long')), L.pageMs); });
      try {
        const r = await Promise.race([reader.read(p, { onProgress: (t) => onProgress(`Page ${p} of ${Math.min(of, L.pages)}: ${t}`), blankBelow: L.blankBelow }), stuck]);
        pages[p - 1] = r.text; layouts[p - 1] = r.geom || {};
        ocr.read.push(p); ocr.unsure += r.unsure || 0; ocr.low += r.low || 0; confSum += r.conf || 0;
      } catch { ocr.failed.push(p); try { await reader.restart(); } catch { /* the next page starts a fresh engine */ } } finally { clearTimeout(timer); }
    }
  } catch { ocr.failed.push(...Array.from({ length: Math.min(of, L.pages) }, (_, i) => i + 1).filter((p) => !ocr.read.includes(p) && !ocr.failed.includes(p))); } finally { if (reader) await Promise.resolve(reader.close()).catch(() => {}); }
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
  else if (ocr.capped) bits.push(`Only the first ${ocr.read.length + ocr.failed.length} pages are read at once.`);
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
