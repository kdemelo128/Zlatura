/* layout.js -- rebuild fixed-width, column-preserving text from PDF text items.
 *
 * The CoStar parser reads labelled fields by their column gaps ("Cap Rate" and
 * its value are separated by two or more spaces). pdftotext -layout produces
 * that; pdf.js gives positioned fragments instead. This module turns fragments
 * back into the same shape.
 *
 * The contract the parser depends on, in order of importance:
 *   1. items that sit on one visual line end up on one text line
 *   2. a visible horizontal gap becomes TWO OR MORE spaces
 *   3. adjacent words stay separated by exactly one space
 *   4. leading indent is proportional to the distance from the page's left edge
 * Column positions are therefore approximate; gap classification is not.
 */

const WS = /^[\s ]*$/;

// Characters per point, estimated from the glyph widths actually on the page.
// Space-only fragments are excluded: pdf.js reports their width as the size of
// the gap they stand for, not the width of a space glyph.
export function charWidth(items) {
  const w = [];
  for (const it of items) {
    const s = it.str || '';
    if (s.length < 3 || WS.test(s) || !it.width) continue;
    w.push(it.width / s.length);
  }
  if (!w.length) return 5;
  w.sort((a, b) => a - b);
  const cw = w[Math.floor(w.length / 2)];
  return cw > 0.5 ? cw : 5;
}

function lineOf(it) {
  // transform = [a, b, c, d, e, f]; e,f is the baseline origin.
  const t = it.transform;
  return { x: t[4], y: t[5], w: it.width || 0, h: it.height || Math.abs(t[3]) || 8, s: it.str, conf: it.conf };
}

/**
 * Group fragments into visual lines, then render each as fixed-width text.
 * With `geom` (an object), also record where everything sits, for readers
 * that work by position (omroll.js): geom.cw, the character width used, and
 * geom.lines[i] for text line i (null for a blank line): { y, h, frags }, y
 * the baseline in PDF units (up is larger), each frag { s, e, x0, x1 }: its
 * character span on the line and its x extent in PDF units.
 */
export function layoutPage(items, viewportHeight, geom = null) {
  const frags = [];
  for (const raw of items) {
    if (!raw || typeof raw.str !== 'string') continue;
    if (raw.str === '') continue;
    const f = lineOf(raw);
    if (WS.test(f.s)) continue;            // spacing fragment: the gap is implied by x
    frags.push(f);
  }
  if (geom) { geom.cw = charWidth(items); geom.lines = []; }
  if (!frags.length) return '';

  const cw = charWidth(items);
  let left = Infinity;
  for (const f of frags) if (f.x < left) left = f.x;   // no spread: a dense page can exceed the argument limit

  // bucket by baseline, top of page first
  frags.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const f of frags) {
    const last = lines[lines.length - 1];
    const tol = Math.max(1.8, 0.28 * (f.h || 8));
    if (last && Math.abs(last.y - f.y) <= tol) {
      last.items.push(f);
      last.y = (last.y * (last.items.length - 1) + f.y) / last.items.length;
    } else {
      lines.push({ y: f.y, items: [f] });
    }
  }

  const out = [];
  let prevY = null;
  for (const ln of lines) {
    ln.items.sort((a, b) => a.x - b.x);

    // blank lines between rows keep paragraph structure readable, and the
    // parser's section headings rely on standing alone.
    if (prevY !== null) {
      const h = ln.items[0].h || 8;
      const blanks = Math.min(3, Math.max(0, Math.round((prevY - ln.y) / (h * 1.35)) - 1));
      for (let i = 0; i < blanks; i++) { out.push(''); if (geom) geom.lines.push(null); }
    }
    prevY = ln.y;

    let text = ' '.repeat(Math.max(0, Math.round((ln.items[0].x - left) / cw)));
    let endX = ln.items[0].x;
    const fr = geom ? [] : null;
    for (let i = 0; i < ln.items.length; i++) {
      const it = ln.items[i];
      if (i > 0) {
        const gap = it.x - endX;
        let n;
        if (gap < 0.3 * cw) n = 0;
        else if (gap <= 1.15 * cw) n = 1;
        else n = Math.max(2, Math.round(gap / cw));
        text += ' '.repeat(n);
      }
      if (fr) fr.push({ s: text.length, e: text.length + it.s.length, x0: it.x, x1: it.x + (it.w || it.s.length * cw) });
      text += it.s;
      endX = it.x + it.w;
    }
    out.push(text.replace(/\s+$/, ''));
    if (geom) {
      const conf = ln.items.filter((f) => Number.isFinite(f.conf));
      geom.lines.push({ y: ln.y, h: ln.items[0].h || 8, frags: fr, ...(conf.length ? { ocr: true, conf: Math.min(...conf.map((f) => f.conf)) } : {}) });
    }
  }
  return out.join('\n');
}

/**
 * Words read by OCR from a page image ({ text, conf, x0, y0, x1, y1, base }:
 * pixels, y down; `base` the baseline of the word's OCR line, if known) as
 * text items in the shape pdf.js gives (y up), so layoutPage and the readers
 * after it run on a scanned page as they do on a text page. Each item keeps
 * the OCR confidence (0 to 100), which layoutPage's geometry carries per line.
 */
export function itemsFromWords(words, height) {
  const out = [];
  for (const w of words || []) {
    const s = String((w && w.text) || '').trim();
    if (!s) continue;
    const h = Math.max(1, w.y1 - w.y0);
    out.push({ str: s, transform: [h, 0, 0, h, w.x0, height - (Number.isFinite(w.base) ? w.base : w.y1)], width: Math.max(1, w.x1 - w.x0), height: h, conf: Number.isFinite(w.conf) ? w.conf : 0 });
  }
  return out;
}
