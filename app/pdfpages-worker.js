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
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber, PDFRawStream, decodePDFRawStream, degrees } = scope.PDFLib;

/** Actions that run something: a script, a program, a form sent away, a rendition. */
const RUNS = new Set(['/JavaScript', '/Launch', '/SubmitForm', '/ImportData', '/Rendition']);
/** Annotations that carry a file or run media. */
/** The only actions a kept annotation may keep: a web address, a named reader command, a layer switch, a transition.
 *  Anything else (a go-to, a form reset or hide, a script) can lead to a page that was not picked, or run something. */
const SAFE = new Set(['/URI', '/Named', '/SetOCGState', '/Trans']);
/** The most actions followed from one annotation; a chain with more is treated as unsafe. */
const MAX_ACTIONS = 2000;
/** The resource kinds cut down to what a page's content names. */
const KINDS = ['XObject', 'Font', 'ExtGState', 'Pattern', 'Shading', 'Properties', 'ColorSpace'];
const CARRIES = new Set(['/FileAttachment', '/Screen', '/Movie', '/Sound', '/RichMedia', '/3D']);

const problem = (kind, message) => Object.assign(new Error(message), { kind });

/** Load one PDF strictly: a password-protected file and a damaged one are refused, never guessed at. */
async function load(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { throwOnInvalidObject: true });
  } catch (e) {
    // an encrypted file fails to parse before it can be recognised: look again without parsing its objects strictly
    let locked = false;
    try { locked = (await PDFDocument.load(bytes, { ignoreEncryption: true })).isEncrypted; } catch { /* not readable either way */ }
    const msg = String((e && e.message) || e);
    throw problem(locked || /encrypted/i.test(msg) ? 'encrypted' : 'invalid', msg);
  }
  if (doc.isEncrypted) throw problem('encrypted', 'encrypted');
  // a file cut short has no end marker near its end
  const tail = String.fromCharCode(...bytes.subarray(Math.max(0, bytes.length - 1024)));
  if (!tail.includes('%%EOF')) throw problem('invalid', 'the end of the file is missing');
  // a page tree that states more pages than it holds means objects were lost (a file cut short)
  const tree = doc.catalog.lookup(PDFName.of('Pages'));
  const declared = tree instanceof PDFDict ? tree.lookup(PDFName.of('Count')) : null;
  if (declared instanceof PDFNumber && declared.asNumber() !== doc.getPageCount()) throw problem('invalid', 'the page count does not match the pages');
  if (!doc.getPageCount()) throw problem('invalid', 'no pages');
  // a page whose content is missing would be copied as a blank page
  for (const page of doc.getPages()) {
    if (contentParts(doc, page) === null) throw problem('invalid', 'a page\'s content is missing');
  }
  return doc;
}

/** The content streams of a page, as objects: an array (inline or by reference) or one stream; null if any part does not resolve. */
function contentParts(doc, page) {
  const raw = page.node.get(PDFName.of('Contents'));
  if (!raw) return [];
  const got = doc.context.lookup(raw);
  if (got === undefined) return null;
  const parts = got instanceof PDFArray ? got.asArray() : [raw];
  const streams = parts.map((r) => doc.context.lookup(r));
  return streams.some((x) => x === undefined) ? null : streams;
}

/** Every action reachable from `action` through /Next, each once; null when there are too many to be a real chain (or to follow at all). */
function actionsFrom(ctx, action) {
  const seen = new Set();
  const stack = [action];
  try {
    while (stack.length) {
      if (seen.size > MAX_ACTIONS) return null;
      const a = ctx.lookup(stack.pop());
      if (!(a instanceof PDFDict) || seen.has(a)) continue;
      seen.add(a);
      const next = a.get(PDFName.of('Next'));
      const n = next && ctx.lookup(next);
      if (n instanceof PDFArray) { for (const r of n.asArray()) stack.push(r); } else if (next) stack.push(next);
    }
  } catch { return null; }
  return [...seen];
}
const typeOf = (a) => { const t = a.lookup(PDFName.of('S')); return t instanceof PDFName ? t.asString() : ''; };
/** Does this action, or one chained after it, run something? Too many to follow counts as yes. */
const runs = (ctx, action) => { const all = actionsFrom(ctx, action); return all === null || all.some((a) => RUNS.has(typeOf(a))); };
/** Is every action in the chain one a kept link may have? */
const safe = (ctx, action) => { const all = actionsFrom(ctx, action); return all !== null && all.every((a) => SAFE.has(typeOf(a))); };

/** The names a content stream uses (/Im1, /F1 …): every /Name token, with #hh escapes read. Over-keeping is safe, under-keeping is not.
 *  A name ends at a PDF white-space byte (NUL, tab, line feed, form feed, carriage return, space) or a delimiter, and at nothing else. */
function namesIn(bytes) {
  const names = new Set();
  const text = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  for (const m of text.matchAll(/\/([^\x00\t\n\f\r /[\]<>()%{}]+)/g)) {
    names.add(m[1]);
    names.add(m[1].replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
  }
  return names;
}
const bytesOf = (stream) => (stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents());

const nameOf = (d, key) => { const v = d.lookup(PDFName.of(key)); return v instanceof PDFName ? v.asString() : ''; };

/** Does a thing this holder draws carry resources of its own that fall back to the holder's, or could reach other pages' pictures
 *  by a route not cut here? Then the holder is left whole: a font or picture lost from a page is worse than one kept. */
function hazard(ctx, kind, v) {
  const x = ctx.lookup(v);
  const dict = x instanceof PDFRawStream ? x.dict : x;
  if (!(dict instanceof PDFDict)) return false;
  if (kind === 'Font') return nameOf(dict, 'Subtype') === '/Type3';
  if (kind === 'Pattern') return x instanceof PDFRawStream; // a tiling pattern (a stream) draws with its own or the page's resources
  if (kind === 'ExtGState') { const m = dict.lookup(PDFName.of('SMask')); return m instanceof PDFDict; } // a soft mask draws a group
  if (kind === 'XObject') return nameOf(dict, 'Subtype') === '/Form' && !(dict.lookup(PDFName.of('Resources')) instanceof PDFDict);
  return false;
}

/** Cut a form XObject's own resources by its own content (once); false if that was not possible. */
function cutForm(doc, x, seen) {
  if (!seen.has(x)) {
    seen.set(x, true);
    let ok = false;
    try { ok = prune(doc, x.dict, bytesOf(x), seen); } catch { ok = false; }
    seen.set(x, ok);
  }
  return seen.get(x);
}

/**
 * Cut a resources holder (a page, or a form XObject's stream) down to what `bytes` name, so pictures and fonts that
 * only other pages use are not copied with it. Each kind is rebuilt as a new dictionary, never edited, because
 * pages often share one. A form XObject that is kept is cut the same way, by its own content.
 * Returns false when the holder was left whole or something could not be read: a kept form without resources of its
 * own, a Type 3 font, a tiling pattern or a soft mask is drawn with resources that cannot be told apart, so nothing is cut.
 * `seen` maps each form already cut to that answer.
 */
function prune(doc, holder, bytes, seen) {
  const ctx = doc.context;
  // a page may inherit its resources from the page tree
  const res = typeof holder.Resources === 'function' ? holder.Resources() : holder.lookup(PDFName.of('Resources'));
  if (!(res instanceof PDFDict)) return true;
  const used = namesIn(bytes);
  const wanted = (name) => used.has(name.asString().slice(1)) || used.has(name.decodeText());
  // first look, changing nothing: is anything drawn here one that needs the whole dictionary?
  for (const [key, value] of res.entries()) {
    const kind = key.asString().slice(1);
    const sub = KINDS.includes(kind) ? ctx.lookup(value) : null;
    if (!(sub instanceof PDFDict)) continue;
    for (const [name, v] of sub.entries()) if (wanted(name) && hazard(ctx, kind, v)) return false;
  }
  const fresh = ctx.obj({});
  let whole = true;
  for (const [key, value] of res.entries()) {
    const kind = key.asString().slice(1);
    const sub = KINDS.includes(kind) ? ctx.lookup(value) : null;
    if (!(sub instanceof PDFDict)) { fresh.set(key, value); continue; }
    const keep = ctx.obj({});
    for (const [name, v] of sub.entries()) {
      if (!wanted(name)) continue;
      keep.set(name, v);
      const x = kind === 'XObject' ? ctx.lookup(v) : null;
      if (x instanceof PDFRawStream && nameOf(x.dict, 'Subtype') === '/Form') {
        if (!cutForm(doc, x, seen)) whole = false;
      }
    }
    fresh.set(key, keep);
  }
  holder.set(PDFName.of('Resources'), fresh);
  return whole;
}

/** Cut what can run something, and what leads to another page, from a page of the source document, before the page is copied.
 *  Returns false when the page's resources could not be cut down and are copied whole. */
function clean(doc, page, seen) {
  const ctx = doc.context;
  const appearances = [];
  // links to articles, attached files and the scripts on the page itself
  for (const k of ['AA', 'B', 'AF']) page.node.delete(PDFName.of(k));
  const annots = page.node.lookup(PDFName.of('Annots'));
  if (annots instanceof PDFArray) {
    const keep = annots.asArray().filter((ref) => {
      const a = ctx.lookup(ref);
      if (!(a instanceof PDFDict)) return false;
      const sub = a.lookup(PDFName.of('Subtype'));
      if (sub instanceof PDFName && CARRIES.has(sub.asString())) return false;
      const act = a.get(PDFName.of('A'));
      if (act && runs(ctx, act)) return false;
      if (act && !safe(ctx, act)) a.delete(PDFName.of('A'));
      // each of these can lead copyPages to a page that was not picked, to the form's other fields and their scripts, or to a file
      for (const k of ['AA', 'Dest', 'P', 'Parent', 'IRT', 'PA', 'Kids', 'AF', 'FS']) a.delete(PDFName.of(k));
      // the drawn look of the annotation (normal, rollover, down): a form, or a form for each state
      const ap = a.lookup(PDFName.of('AP'));
      if (ap instanceof PDFDict) {
        for (const k of ['N', 'D', 'R']) {
          const x = ap.get(PDFName.of(k)) && ctx.lookup(ap.get(PDFName.of(k)));
          if (x instanceof PDFRawStream) appearances.push(x);
          else if (x instanceof PDFDict) for (const [, v] of x.entries()) { const y = ctx.lookup(v); if (y instanceof PDFRawStream) appearances.push(y); }
        }
      }
      return true;
    });
    page.node.set(PDFName.of('Annots'), ctx.obj(keep));
  }
  // pictures and fonts only another page uses. An appearance without resources of its own draws with the page's: then nothing is cut.
  try {
    let whole = true;
    for (const x of appearances) {
      if (!(x.dict.lookup(PDFName.of('Resources')) instanceof PDFDict)) return false;
      if (!cutForm(doc, x, seen)) whole = false;
    }
    const parts = contentParts(doc, page) || [];
    const bytes = new Uint8Array(parts.reduce((n, x) => n + bytesOf(x).length + 1, 0));
    let at = 0;
    for (const x of parts) { const b = bytesOf(x); bytes.set(b, at); at += b.length; bytes[at++] = 32; }
    return prune(doc, page.node, bytes, seen) && whole;
  } catch { return false; }
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
  let unpruned = false;
  const seen = new Map();
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
      for (const p of idx) if (!clean(src, src.getPage(p), seen)) unpruned = true;
      const pages = await out.copyPages(src, idx);
      idx.forEach((p, k) => copied.set(`${f}:${p}`, pages[k]));
    }
    for (const { f, p, rot } of order) {
      const page = copied.get(`${f}:${p}`);
      if (rot) page.setRotation(degrees((page.getRotation().angle + rot) % 360));
      out.addPage(page);
      tick(++done, total);
    }
    // nothing from a page that was not picked may have come along (a link, a form field or a bookmark can lead to one)
    const kept = new Set(out.getPages().map((pg) => pg.node));
    for (const [, obj] of out.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFDict && obj.get(PDFName.of('Type')) === PDFName.of('Page') && !kept.has(obj)) throw problem('other', 'a page that was not picked would have been copied');
    }
    // plain objects, not object streams, so the file reads in any viewer and its content can be inspected
    results.push(await out.save({ useObjectStreams: false }));
  }
  return { results, unpruned };
}

scope.zlPdfPages = { inspect, build };

scope.onmessage = async (ev) => {
  const { id, type } = ev.data;
  try {
    if (type === 'inspect') {
      scope.postMessage({ id, ok: true, ...(await inspect(ev.data.file)) });
    } else if (type === 'build') {
      const { results: files, unpruned } = await build(ev.data.files, ev.data.outputs, (done, of) => scope.postMessage({ id, progress: done, of }));
      scope.postMessage({ id, ok: true, files, unpruned }, files.map((b) => b.buffer));
    }
  } catch (e) {
    scope.postMessage({ id, ok: false, kind: e && e.kind ? e.kind : 'other', file: e && e.file !== undefined ? e.file : null, message: String((e && e.message) || e) });
  }
};
