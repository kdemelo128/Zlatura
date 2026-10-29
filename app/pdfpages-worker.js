/* pdfpages-worker.js -- reads and writes PDFs for Documents > PDF pages, off the main thread, with the vendored
 * @cantoo/pdf-lib. A classic worker (importScripts), so Safari 15 and later run it.
 *   in:  { id, type: 'inspect', file }                       out: { id, ok, pages, rotations } | { id, ok: false, kind, file, message }
 *        { id, type: 'build', files, outputs: [order, …] }        { id, progress, of }, then { id, ok, files: [bytes, …] }
 * where `order` is [{ f, p, rot }]: file number, page (0-based), extra turn in degrees. The caller stops a build
 * that runs too long or is cancelled with terminate(), so nothing here needs to cope with being interrupted.
 *
 * What is written is a NEW document holding only the copied pages: the old document's open action, scripts,
 * embedded files, bookmarks and form tree are never carried over. Page actions and the links, attachments and
 * media on a page that can run something are cut from the pages before they are copied. */
/* global importScripts, self */

importScripts('../vendor/pdf-lib-cantoo-2.11.1.min.js');

// the worker's global scope (typed loosely: it is not a window)
const scope = /** @type {any} */ (self);
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber, degrees } = scope.PDFLib;

/** Actions that run something: a script, a program, a form sent away, a rendition. */
const RUNS = new Set(['/JavaScript', '/Launch', '/SubmitForm', '/ImportData', '/Rendition']);
/** Annotations that carry a file or run media. */
const CARRIES = new Set(['/FileAttachment', '/Screen', '/Movie', '/Sound', '/RichMedia', '/3D']);

const problem = (kind, message) => Object.assign(new Error(message), { kind });

/** Load one PDF strictly: a password-protected file and a damaged one are refused, never guessed at. */
async function load(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { throwOnInvalidObject: true });
  } catch (e) {
    const msg = String((e && e.message) || e);
    throw problem(/encrypted/i.test(msg) ? 'encrypted' : 'invalid', msg);
  }
  // a page tree that states more pages than it holds means objects were lost (a file cut short)
  const tree = doc.catalog.lookup(PDFName.of('Pages'));
  const declared = tree instanceof PDFDict ? tree.lookup(PDFName.of('Count')) : null;
  if (declared instanceof PDFNumber && declared.asNumber() !== doc.getPageCount()) throw problem('invalid', 'the page count does not match the pages');
  if (!doc.getPageCount()) throw problem('invalid', 'no pages');
  return doc;
}

/** Does this action, or one chained after it, run something? */
function runs(ctx, action, depth = 0) {
  const a = ctx.lookup(action);
  if (!(a instanceof PDFDict) || depth > 8) return false;
  const s = a.lookup(PDFName.of('S'));
  if (s instanceof PDFName && RUNS.has(s.asString())) return true;
  const next = a.lookup(PDFName.of('Next'));
  const chain = next instanceof PDFArray ? next.asArray() : (next ? [a.get(PDFName.of('Next'))] : []);
  return chain.some((n) => runs(ctx, n, depth + 1));
}

/** Cut what can run something from a page of the source document, before the page is copied. */
function clean(doc, page) {
  const ctx = doc.context;
  page.node.delete(PDFName.of('AA'));
  const annots = page.node.lookup(PDFName.of('Annots'));
  if (!(annots instanceof PDFArray)) return;
  const keep = annots.asArray().filter((ref) => {
    const a = ctx.lookup(ref);
    if (!(a instanceof PDFDict)) return false;
    const sub = a.lookup(PDFName.of('Subtype'));
    if (sub instanceof PDFName && CARRIES.has(sub.asString())) return false;
    const act = a.get(PDFName.of('A'));
    if (act && runs(ctx, act)) return false;
    a.delete(PDFName.of('AA'));
    // a form field's own actions sit on its parents
    for (let p = a.lookup(PDFName.of('Parent')), n = 0; p instanceof PDFDict && n < 32; p = p.lookup(PDFName.of('Parent')), n++) p.delete(PDFName.of('AA'));
    return true;
  });
  page.node.set(PDFName.of('Annots'), ctx.obj(keep));
}

async function inspect(blob) {
  const doc = await load(blob);
  const rotations = doc.getPages().map((p) => p.getRotation().angle);
  return { pages: rotations.length, rotations };
}

/** Write each output: its pages in order, each turned by its extra degrees on top of the turn it already has. */
async function build(blobs, outputs, tick) {
  const need = outputs.map((o) => Array.from(o));
  const total = need.reduce((s, o) => s + o.length, 0);
  const docs = new Map();
  let done = 0;
  const results = [];
  for (const order of need) {
    const out = await PDFDocument.create();
    // one copy call per source file, so a font shared by its pages is written once
    const wanted = new Map();
    for (const { f, p } of order) (wanted.get(f) || wanted.set(f, new Set()).get(f)).add(p);
    const copied = new Map();
    for (const [f, set] of wanted) {
      if (!docs.has(f)) docs.set(f, await load(blobs[f]).catch((e) => { e.file = f; throw e; }));
      const src = docs.get(f);
      const idx = Array.from(set).sort((a, b) => a - b);
      idx.forEach((p) => clean(src, src.getPage(p)));
      const pages = await out.copyPages(src, idx);
      idx.forEach((p, k) => copied.set(`${f}:${p}`, pages[k]));
    }
    for (const { f, p, rot } of order) {
      const page = copied.get(`${f}:${p}`);
      if (rot) page.setRotation(degrees((page.getRotation().angle + rot) % 360));
      out.addPage(page);
      tick(++done, total);
    }
    // plain objects, not object streams, so the file reads in any viewer and its content can be inspected
    results.push(await out.save({ useObjectStreams: false }));
  }
  return results;
}

scope.zlPdfPages = { inspect, build };

scope.onmessage = async (ev) => {
  const { id, type } = ev.data;
  try {
    if (type === 'inspect') {
      scope.postMessage({ id, ok: true, ...(await inspect(ev.data.file)) });
    } else if (type === 'build') {
      const files = await build(ev.data.files, ev.data.outputs, (done, of) => scope.postMessage({ id, progress: done, of }));
      scope.postMessage({ id, ok: true, files }, files.map((b) => b.buffer));
    }
  } catch (e) {
    scope.postMessage({ id, ok: false, kind: e && e.kind ? e.kind : 'other', file: e && e.file !== undefined ? e.file : null, message: String((e && e.message) || e) });
  }
};
