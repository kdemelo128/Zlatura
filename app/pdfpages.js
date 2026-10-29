/* pdfpages.js -- the page list behind Documents > PDF pages: which pages from which files, in what order and
 * turned how far, the limits on what is accepted, and the page ranges a person types ("1-3, 7"). Pure: no page
 * and no PDF library (pdfpages-worker.js writes the file). Design: docs/proposals/documents-hub.md.
 *
 * A page is { f, p, base, rot }: file number, page number in that file (0-based), the turn the file already
 * gives it, and the extra turn asked for here (0, 90, 180 or 270, clockwise). Every edit returns a new list. */

import { LIMITS, sniff } from './filekind.js';

export const MAX_FILES = 20;
export const MAX_PAGES = 500;
/** The most bytes of PDF held at once: a phone's browser reloads the tab at around 1 GB. */
export const MAX_BYTES = { desktop: 150e6, phone: 60e6 };
/** A build that has not finished in this long is stopped. */
export const WATCHDOG_MS = 60000;

const mb = (n) => `${Math.round(n / 1e5) / 10} MB`;

/**
 * Can this file be added? Looked at before anything is read whole: its size first, then its first 8 KB.
 * `have` is what is already held: { files, bytes }. Resolves { ok: true } or { ok: false, reason }.
 * @param {{ name: string, size: number, slice: (a: number, b: number) => { arrayBuffer: () => Promise<ArrayBuffer> } }} file
 * @param {{ files: number, bytes: number }} have
 * @param {{ phone?: boolean }} [opts]
 */
export async function checkAdd(file, have, { phone = false } = {}) {
  const no = (reason) => ({ ok: false, reason });
  const name = file.name || 'That file';
  if (have.files >= MAX_FILES) return no(`${name} was not added: ${MAX_FILES} files is the most to combine at once.`);
  if (file.size === 0) return no(`${name} is empty: it probably did not finish downloading. Download it again.`);
  if (file.size > LIMITS.pdf) return no(`${name} is ${mb(file.size)}; a PDF is read up to ${LIMITS.pdf / 1e6} MB.`);
  const cap = phone ? MAX_BYTES.phone : MAX_BYTES.desktop;
  if (have.bytes + file.size > cap) return no(`${name} was not added: together the files would be ${mb(have.bytes + file.size)}, and ${cap / 1e6} MB is the most on this device.`);
  const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  if (sniff(head) !== 'pdf') return no(`${name} is not a PDF, whatever its name says. Only PDF files can be combined here.`);
  return { ok: true };
}

/** What went wrong opening a PDF, in words for the person. `kind` comes from the worker: 'encrypted', 'invalid' or 'other'. */
export function problemText(name, kind, detail = '') {
  if (kind === 'encrypted') return `${name} is password protected. Ask for an unlocked copy.`;
  if (kind === 'invalid') return `${name} is not a readable PDF: it may be damaged or only partly downloaded. Download it again, or export a fresh copy.`;
  return `${name} could not be opened${detail ? ` (${detail})` : ''}. Try again, or save a fresh copy of the PDF.`;
}

/** The pages of a file just added: `rotations[i]` is the turn page i already has. */
export const pagesOf = (f, rotations) => rotations.map((base, p) => ({ f, p, base: ((base % 360) + 360) % 360, rot: 0 }));

/** Would adding `n` pages go over the limit? */
export const overPages = (have, n) => have + n > MAX_PAGES;

/** Move page `i` one place up (`dir` -1, earlier) or down (+1, later). */
export function move(pages, i, dir) {
  const j = i + dir;
  if (!Number.isInteger(i) || i < 0 || i >= pages.length || j < 0 || j >= pages.length) return pages;
  const out = pages.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
/** Turn page `i` by `delta` degrees clockwise (a multiple of 90; negative turns the other way). */
export function rotate(pages, i, delta = 90) {
  if (!pages[i]) return pages;
  const out = pages.slice();
  out[i] = { ...pages[i], rot: ((((pages[i].rot + delta) % 360) + 360) % 360) };
  return out;
}
export function remove(pages, i) {
  if (!pages[i]) return pages;
  return pages.filter((_, k) => k !== i);
}

/** What a screen reader hears for page `i` (0-based) of `pages`. */
export function pageLabel(pages, i, files) {
  const pg = pages[i];
  const turn = (pg.base + pg.rot) % 360;
  return `Page ${i + 1} of ${pages.length}, from ${files[pg.f].name}${turn ? `, rotated ${turn}°` : ''}`;
}

/**
 * Page ranges typed by a person, against a list of `total` pages (numbered from 1 on screen).
 * "1-3, 7" is two groups: pages 1 to 3, and page 7. A dash typed by a phone's smart punctuation (– or —) counts.
 * Resolves { groups: number[][] } with 0-based indexes, or { error } in words. A page named twice is an error:
 * nothing is counted twice.
 */
export function parseRanges(text, total) {
  const src = String(text ?? '').trim();
  if (!src) return { error: 'Type the pages to use, like 1-3, 7.' };
  const seen = new Set();
  const groups = [];
  for (const raw of src.split(/[,;]/)) {
    const t = raw.trim();
    if (!t) return { error: 'There is an empty place between two commas. Type pages like 1-3, 7.' };
    const m = /^(\d+)(?:\s*[-–—]\s*(\d+))?$/.exec(t);
    if (!m) return { error: `“${t}” is not a page or a range. Use numbers like 1-3, 7.` };
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a < 1 || b < 1) return { error: 'Pages are numbered from 1.' };
    if (b < a) return { error: `${a}-${b} runs backwards. Write it as ${b}-${a}.` };
    if (b > total) return { error: `Page ${b} is past the last page (${total}).` };
    const g = [];
    for (let k = a; k <= b; k++) {
      if (seen.has(k)) return { error: `Page ${k} is listed twice.` };
      seen.add(k);
      g.push(k - 1);
    }
    groups.push(g);
  }
  return { groups };
}

/** What the worker is asked to write for the pages at `idxs` of the list: [{ f, p, rot }], where rot is the extra turn. */
export const orderFor = (pages, idxs = null) => (idxs || pages.map((_, i) => i)).map((i) => ({ f: pages[i].f, p: pages[i].p, rot: pages[i].rot }));

/** A name that ends in .pdf, once. */
export const withPdf = (name) => {
  const n = String(name ?? '').trim().replace(/\.pdf$/i, '').trim();
  return `${n || 'Documents'}.pdf`;
};
/** The name of part `k` of `n` (1-based) cut from a file called `base`. */
export const partName = (base, k, n) => withPdf(`${String(base ?? '').trim().replace(/\.pdf$/i, '') || 'Documents'} (part ${k} of ${n})`);
