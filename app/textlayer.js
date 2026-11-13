/* textlayer.js -- does a PDF page (or a whole PDF) have a real text layer, or is it a scan whose few characters are a stamp?
 *
 * One rule for the three places that ask (rrdoc.js docKind, ocrpdf.js hasNoTextLayer, leaseread.js needsOcr): text under
 * 200 characters needs OCR, unless what is there is real short text. Real short text is a table (two or more lines that
 * hold a word and two or more figures) or a cover page (two or more lines and six or more words of three letters or more,
 * once page numbers and scanner stamps are set aside), and every page of the PDF has some text of its own (a cover page beside
 * pages that are pictures is still a scan). Text that OCR wrote is never "real short text" (docKind's `ocr` option). A scan's own text layer is usually only such a stamp ("Page 1 of 3",
 * "Scanned by ..."), so it still reads as a scan. Pure. */

/** Characters (not counting white space) under which a page has too little text to be a text page, unless it is real short text. */
export const TEXT_CHARS = 200;

/** Characters under which a page has no text of its own (ocrpdf.js OCR_LIMITS.blankPage). */
const BLANK_PAGE = 20;
const chars = (t) => String(t ?? '').replace(/\s/g, '').length;
// a line that is only a page number, a "n of m", or what a scanner writes on the page
const STAMP = /^\W*(?:page\s*)?\d+(?:\s*(?:of|\/)\s*\d+)?\W*$|scanned\s+(?:by|with)|camscanner|adobe scan|\bbates\b/i;
const FIGURE = /\$?\d[\d,]*(?:\.\d+)?%?/g;

/** The lines of a text that are neither empty nor a stamp. */
const linesOf = (text) => String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !STAMP.test(l));

/** True when a short text is real: a small table (lines with a word and two or more figures), or a cover page (several lines, several words). */
export function realShortText(text) {
  const lines = linesOf(text);
  const tableRows = lines.filter((l) => /[A-Za-z]{2}/.test(l) && (l.match(FIGURE) || []).length >= 2).length;
  if (tableRows >= 2) return true;
  const words = lines.join(' ').match(/[A-Za-z]{3,}/g) || [];
  return lines.length >= 2 && words.length >= 6;
}

/** Does this one page need OCR: under 200 characters, and not real short text? */
export const pageNeedsOcr = (text) => chars(text) < TEXT_CHARS && !realShortText(text);

/** Is this PDF a scan: its whole text is under 200 characters and none of it is real short text, or a page has none? `ocr`: the text was written by OCR, so it is never real short text. (An empty list is not a scan: there is no PDF.) */
export const pagesAreScan = (pages, { ocr = false } = {}) => Array.isArray(pages) && pages.length > 0 && chars(pages.join('')) < TEXT_CHARS && (ocr || pages.some((p) => chars(p) < BLANK_PAGE) || !realShortText(pages.join('\n')));
