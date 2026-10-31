/* convert-worker.js -- writes PDFs for Documents > Convert, off the main thread, with the vendored @cantoo/pdf-lib.
 * A classic worker (importScripts), as pdfpages-worker.js is.
 *   in:  { id, type: 'image', file, kind: 'jpeg'|'png' }   out: { id, ok, bytes } | { id, ok: false, kind, message }
 *        { id, type: 'text', text }                          { id, progress, of }, then the same
 * The picture's own bytes are embedded unchanged (the worker never re-encodes). A text is set in Helvetica, wrapped
 * to the page; a character that font can't draw is refused (the caller has already named it). The caller stops a
 * run that is cancelled or too long with terminate(). */
/* global importScripts, self */

importScripts('../vendor/pdf-lib-cantoo-2.11.1.min.js');

const scope = /** @type {any} */ (self);
const LIB = scope.PDFLib;

const fail = (kind, message) => ({ ok: false, kind, message });
/** A text page: Letter, one inch margins, 11 pt on 14 pt lines. */
const PAGE = { w: 612, h: 792, margin: 72, size: 11, lead: 14 };
/** The most pages a text may fill (convert.js TEXT_PDF_PAGES). */
const MAX_TEXT_PAGES = 300;

async function image(msg) {
  const bytes = new Uint8Array(await msg.file.arrayBuffer());
  const doc = await LIB.PDFDocument.create();
  let img;
  try { img = msg.kind === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes); } catch (e) {
    return fail('invalid', `the ${msg.kind === 'png' ? 'PNG' : 'JPEG'} could not be read (${String((e && e.message) || e).slice(0, 80)})`);
  }
  // a page the size of the picture at 150 dpi; a PDF page is at most 14400 points a side
  const k = Math.min(72 / 150, 14400 / Math.max(img.width, img.height));
  const w = Math.max(1, img.width * k); const h = Math.max(1, img.height * k);
  const page = doc.addPage([w, h]);
  page.drawImage(img, { x: 0, y: 0, width: w, height: h });
  return { ok: true, bytes: await doc.save() };
}

async function text(msg, id) {
  const doc = await LIB.PDFDocument.create();
  const font = await doc.embedFont(LIB.StandardFonts.Helvetica);
  const width = PAGE.w - 2 * PAGE.margin;
  const lines = [];
  for (const para of String(msg.text).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    if (!para) { lines.push(''); continue; }
    let line = '';
    for (const word of para.split(/(?<= )/)) {
      let w = word;
      if (font.widthOfTextAtSize((line + w).trimEnd(), PAGE.size) <= width) { line += w; continue; }
      if (line) { lines.push(line.trimEnd()); line = ''; }
      // a word longer than a line is cut where it fills the line
      while (font.widthOfTextAtSize(w.trimEnd(), PAGE.size) > width) {
        let n = w.length - 1;
        while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), PAGE.size) > width) n--;
        lines.push(w.slice(0, n)); w = w.slice(n);
      }
      line = w;
    }
    lines.push(line.trimEnd());
  }
  const perPage = Math.floor((PAGE.h - 2 * PAGE.margin) / PAGE.lead);
  const pages = Math.max(1, Math.ceil(lines.length / perPage));
  if (pages > MAX_TEXT_PAGES) return fail('toolong', `the text would fill ${pages} pages and ${MAX_TEXT_PAGES} is the most`);
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([PAGE.w, PAGE.h]);
    lines.slice(p * perPage, (p + 1) * perPage).forEach((l, i) => {
      if (l) page.drawText(l, { x: PAGE.margin, y: PAGE.h - PAGE.margin - PAGE.size - i * PAGE.lead, size: PAGE.size, font, color: LIB.rgb(0, 0, 0) });
    });
    scope.postMessage({ id, progress: p + 1, of: pages });
  }
  return { ok: true, bytes: await doc.save() };
}

scope.onmessage = async (ev) => {
  const msg = ev.data;
  let r;
  try {
    r = msg.type === 'image' ? await image(msg) : msg.type === 'text' ? await text(msg, msg.id) : fail('other', 'unknown request');
  } catch (e) {
    r = fail(/encode|WinAnsi/i.test(String((e && e.message) || e)) ? 'charset' : 'other', String((e && e.message) || e).slice(0, 120));
  }
  scope.postMessage({ id: msg.id, ...r });
};
