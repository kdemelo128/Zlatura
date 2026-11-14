/* doctext.js -- the shape of a stored document text, and how it is packed (document memory, release A1).
 *
 * The page text of a document attached to a deal is kept on this device so Ask Monal can search it in a later
 * session (docmem.js writes and reads it, store.js holds it in the `doctext` store, keyed [dealId, sha256]). Never the
 * file. A record: { v, dealId, sha256, docId, name, type, readBy, ocrPages, pageCount, chars, z, pages, savedAt }.
 * `pages` is the JSON list of page strings (empty pages kept, so page 14 stays page 14), gzipped with the platform's
 * CompressionStream (z: 'gzip', bytes) or, where there is none, kept as plain text (z: 'none', a string).
 * A stored record is data from disk: unpacking re-checks every type and length, and the decompressed size is capped
 * as it is read, so a hostile or damaged record cannot grow the page. Pure apart from the streams; no DOM. */

/** Most pages kept for one document (the same cap docindex.js indexes; tests/doctext.test.js checks they agree). */
export const MAX_PAGES = 600;
export const DOCTEXT_VERSION = 1;
/** Most characters of text one document and one deal may hold (the same cap docsession.js keeps in memory). */
export const MAX_DOC_CHARS = 8e6;
/** Most bytes all stored document text may take together, on this device (like the history budget in store.js); past it nothing more is kept. */
export const DOCTEXT_LIMIT = 50 * 1024 * 1024;
const SHA = /^[0-9a-f]{64}$/;
const READ_BY = ['text', 'ocr', 'docx'];

const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && typeof Response === 'function';

async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
/** The text of gzipped bytes, read in pieces and stopped past `cap` characters (null then). */
export async function gunzip(bytes, cap) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const dec = new TextDecoder();
  let out = ''; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > cap * 4) { await reader.cancel().catch(() => {}); return null; }
    out += dec.decode(value, { stream: true });
    if (out.length > cap + 2 * MAX_PAGES + 16) { await reader.cancel().catch(() => {}); return null; }
  }
  return out + dec.decode();
}

/**
 * A record to store, or null when there is nothing to keep (no fingerprint, no text, over the cap).
 * @param {{ dealId: string, sha256?: string | null, docId?: string | null, name?: string, type?: string | null, pages: string[], readBy?: string, ocrPages?: number[], now?: number }} d
 * @param {{ zip?: boolean }} [opts]
 */
export async function packDoc(d, { zip = canZip() } = {}) {
  if (!d || !d.dealId || typeof d.sha256 !== 'string' || !SHA.test(d.sha256) || !Array.isArray(d.pages)) return null;
  const pages = d.pages.slice(0, MAX_PAGES).map((p) => String(p ?? ''));
  const chars = pages.reduce((n, p) => n + p.length, 0);
  if (!pages.some((p) => p.trim()) || chars > MAX_DOC_CHARS) return null;
  const json = JSON.stringify(pages);
  let z = 'none';
  /** @type {string | Uint8Array} */
  let body = json;
  if (zip) { try { body = await gzip(json); z = 'gzip'; } catch { body = json; } }
  return {
    v: DOCTEXT_VERSION, dealId: String(d.dealId), sha256: d.sha256, docId: d.docId ? String(d.docId).slice(0, 80) : null,
    name: String(d.name || 'document').slice(0, 200), type: d.type ? String(d.type).slice(0, 40) : null,
    readBy: READ_BY.includes(d.readBy || '') ? d.readBy : 'text', ocrPages: (d.ocrPages || []).filter((n) => Number.isInteger(n) && n > 0 && n <= MAX_PAGES).slice(0, MAX_PAGES),
    pageCount: pages.length, chars, z, pages: body, savedAt: d.now ?? Date.now(),
  };
}

/** A stored record's pages, or null when it is damaged (wrong shape, too long, will not decompress). */
export async function unpackDoc(rec) {
  try {
    if (!rec || typeof rec !== 'object' || rec.v !== DOCTEXT_VERSION || typeof rec.sha256 !== 'string' || !SHA.test(rec.sha256)) return null;
    let json;
    if (rec.z === 'gzip' && rec.pages instanceof Uint8Array && canZip()) json = await gunzip(rec.pages, MAX_DOC_CHARS);
    else if (rec.z === 'none' && typeof rec.pages === 'string' && rec.pages.length <= MAX_DOC_CHARS + 2 * MAX_PAGES + 16) json = rec.pages;
    else return null;
    if (json === null) return null;
    const pages = JSON.parse(json);
    if (!Array.isArray(pages) || pages.length > MAX_PAGES || !pages.every((p) => typeof p === 'string')) return null;
    if (pages.reduce((n, p) => n + p.length, 0) > MAX_DOC_CHARS) return null;
    return {
      sha256: rec.sha256, docId: typeof rec.docId === 'string' ? rec.docId : null, name: typeof rec.name === 'string' ? rec.name.slice(0, 200) : 'document',
      type: typeof rec.type === 'string' ? rec.type : null, pages,
    };
  } catch { return null; }
}

/** The bytes a record takes, for My data: the packed length (a string counts two bytes a character). */
export const recordBytes = (rec) => (rec && rec.pages instanceof Uint8Array ? rec.pages.length : rec && typeof rec.pages === 'string' ? rec.pages.length * 2 : 0);
