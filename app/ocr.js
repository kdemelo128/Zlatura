/* ocr.js -- reading a scanned page, only when the broker asks.
 *
 * An OM page with no text layer (a scan) can still hold the rent roll. When
 * the broker taps "Read this scanned page", the page is drawn from the PDF
 * with pdf.js and read by Tesseract (tesseract.js 7, vendored under
 * vendor/ocr/, Apache-2.0: THIRD_PARTY.md) in a Web Worker. Nothing is fetched
 * from another site: the library, its worker, the WebAssembly engine and the
 * English data all come from this site, and only on that tap; they are not in
 * the service worker's install set (about 7 MB), so the app's first load
 * stays as it was. The service worker keeps them once fetched, in a cache of
 * their own that survives app updates, so a page can be read offline after
 * the first time.
 *
 * The words come back with their boxes and become the same items layout.js
 * turns into lines (layout.js itemsFromWords), so the same rent roll reader
 * runs on them. Every value read this way is marked OCR, with low
 * confidence, and is never applied without the broker accepting it. */

import { layoutPage, itemsFromWords } from './layout.js';

const LIB = '../vendor/ocr/tesseract-7.0.0.esm.min.js';
const SCALE = 3; // about 216 dpi on a letter page: enough for 7-point table type
const FILES = {
  worker: 'tesseract-7.0.0.worker.min.js',
  core: 'tesseract-core-7.0.0-simd-lstm.wasm.js',
  lang: 'eng-4.0.0-best-int',
};

/* WebAssembly SIMD, which the one engine build shipped needs (Safari 16.4+, the app's floor already). */
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
export function ocrSupported() {
  try { return typeof Worker === 'function' && typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_PROBE); } catch { return false; }
}

/* The one Tesseract run both readers share: words with their boxes, and the lines they sit on. */
async function recognizeCanvas(canvas, onProgress, params) {
  onProgress('Loading the scanned-page reader (about 7 MB, the first time)…');
  const { default: Tesseract } = await import(LIB);
  const base = new URL('../vendor/ocr/', import.meta.url).href;
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: base + FILES.worker, corePath: base + FILES.core, langPath: base + FILES.lang,
    workerBlobURL: false, cacheMethod: 'none', gzip: true,
    logger: (m) => { if (m && m.status === 'recognizing text') onProgress(`Reading: ${Math.round((m.progress || 0) * 100)}%`); },
  });
  const words = [];
  const lines = [];
  try {
    await worker.setParameters(params);
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
    for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
      const base0 = l.baseline && Number.isFinite(l.baseline.y0) ? (l.baseline.y0 + l.baseline.y1) / 2 : null;
      for (const w of l.words || []) words.push({ text: w.text, conf: w.confidence, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, base: base0 });
      lines.push({ text: l.text, conf: l.confidence });
    }
  } finally {
    await worker.terminate();
  }
  return { words, lines };
}

/**
 * Read page `pageNo` of a PDF by OCR. Returns { text, geom, words, conf }:
 * page text and geometry in layout.js's shape, the number of words, and their
 * mean confidence (0 to 100). `onProgress(text)` says what it is doing.
 */
/** @param {any} pdfjs @param {Uint8Array} bytes @param {number} pageNo @param {{ onProgress?: (text: string) => void }} [opts] */
export async function readScannedPage(pdfjs, bytes, pageNo, { onProgress = (/** @type {string} */ _t) => {} } = {}) {
  if (!ocrSupported()) throw new Error('this browser can’t run the scanned-page reader (it needs WebAssembly SIMD: Safari 16.4 or later, or a current Chrome, Edge or Firefox)');
  onProgress('Drawing the page…');
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false }).promise;
  let canvas;
  try {
    const page = await doc.getPage(pageNo);
    const vp = page.getViewport({ scale: SCALE });
    canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
  } finally {
    await doc.destroy();
  }
  const { words } = await recognizeCanvas(canvas, onProgress, { tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' }); // one block, spaces kept: a table's row stays one line
  const geom = {};
  const text = layoutPage(itemsFromWords(words, canvas.height), canvas.height, geom);
  const conf = words.length ? words.reduce((s, w) => s + (w.conf || 0), 0) / words.length : 0;
  return { text, geom, words: words.length, conf };
}

/**
 * Text in a photo (a sign, a business name, an address), read on the device. The photo is only drawn to a
 * canvas and handed to the text reader; nothing looks for people or faces. Returns signLines(...) of what was read.
 * @param {Blob} blob @param {{ onProgress?: (text: string) => void }} [opts]
 */
export async function readPhotoText(blob, { onProgress = (/** @type {string} */ _t) => {} } = {}) {
  if (!ocrSupported()) throw new Error('this browser can’t run the text reader (it needs WebAssembly SIMD: Safari 16.4 or later, or a current Chrome, Edge or Firefox)');
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0);
  bmp.close && bmp.close();
  const { lines } = await recognizeCanvas(canvas, onProgress, { tessedit_pageseg_mode: '11', user_defined_dpi: '300' }); // sparse text: signs are scattered words
  return signLines(lines);
}

const PHONE = /(?:\(\d{3}\)\s?|\b\d{3}[-.\s])\d{3}[-.\s]\d{4}\b|\b\d{3}[-.]\d{4}\b/;
const STREET = /^\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,4}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Pkwy|Parkway|Hwy|Highway|Ct|Court|Pl|Place|Sq|Square)\b\.?/i;
const MIN_CONF = 40;

/**
 * Tidy what the reader returned into lines to show: blank, symbol-only and very low-confidence lines are
 * dropped, and a line that plainly looks like a phone number or a street address is tagged so the broker can
 * find it. A tag never does anything by itself.
 * @param {{ text?: string, conf?: number }[]} raw
 * @returns {{ text: string, conf: number, kind: 'phone' | 'address' | null }[]}
 */
export function signLines(raw) {
  /** @type {{ text: string, conf: number, kind: 'phone' | 'address' | null }[]} */
  const out = [];
  for (const l of raw || []) {
    const text = String(l && l.text || '').replace(/\s+/g, ' ').trim();
    const conf = Number.isFinite(l && l.conf) ? Math.round(/** @type {number} */ (l.conf)) : 0;
    if (!/[A-Za-z0-9]/.test(text) || conf < MIN_CONF) continue;
    out.push({ text, conf, kind: PHONE.test(text) ? /** @type {const} */ ('phone') : STREET.test(text) ? /** @type {const} */ ('address') : null });
  }
  return out;
}
