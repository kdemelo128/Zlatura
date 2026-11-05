/* leaseread.js -- reads a lease's pages into candidates for the lease abstract, by fixed rules (no AI, no network).
 *
 * Pure: no DOM, no pdf.js, no clock, no abstract. Every reader takes the page model and returns candidates; none writes into
 * an abstract (leasestage.js does that, with the broker's tick). Each candidate carries its page, a short quote that was
 * checked to sit on that page, and a confidence word. What cannot be read honestly comes back as "not found" (with the pages
 * looked at) or "needs your choice", never as a guess:
 *   - a blank is never zero; a $0.00 or abated rent row is a flag, never a step;
 *   - a unit (month, year, $/SF) comes only from the words beside the figure, never from arithmetic;
 *   - a relative date ("90 days after delivery") stays relative; a month with no day is not a date;
 *   - numeric dates are month first (US order); a figure with a letter in it is not a number;
 *   - two sources that disagree are both kept as "needs your choice"; the first is never picked.
 * Money is whole cents (toCents), rates four places (toRate), as the abstract stores them. The designer's note is
 * docs/proposals/lease-abstract-l3-note.md; the owner's decisions it records are marked "decision n" below.
 *
 * Page = { n, text, source: 'pdftext'|'ocr', conf, poor, lines: [{ s, e, furniture }], clean }  (`clean` is `text` with
 *   furniture lines blanked, same offsets: readers match inside it, quotes are cut from `text`)
 * Cand = { key, value, unit, basis, rel, status: 'found'|'ambiguous'|'not-found', confidence, note, from, page, start, len,
 *   quote, sources: [{ page, start, len, quote, confidence, from, ocrConf }], choices? }
 */

import { classify } from './ddtypes.js';
import { verifyQuote } from './reconcile.js';
import { parseDateText } from './dateinput.js';
import { toCents, toRate } from './engine/money.js';

export const QUOTE_MAX = 240;
export const POOR_CONF = 75;
export const NEEDS_OCR_CHARS = 200;
const TEXT_MAX = 200;

const cut = (s, n) => { const t = String(s ?? '').slice(0, n); return /[\uD800-\uDBFF]$/.test(t) ? t.slice(0, -1) : t; };
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const trimEnd = (s) => s.replace(/[\s,;:]+$/, '');
const sq = (s) => flat(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Does a page's own text hold too little to be a text page (so the broker may offer OCR for it)? */
export const needsOcr = (text) => String(text ?? '').replace(/\s+/g, '').length < NEEDS_OCR_CHARS;

/* ------------------------------------------------------------ the page model */

/**
 * The pages of a document. texts[i] is page i+1's text from pdfPages; ocr[n] = { text, conf } replaces page n (a scan). A page is
 * `poor` when its OCR confidence is under 75. Furniture (a line repeated at the edge of at least half the pages once digits are
 * squashed: page numbers, initials footers; or a line that is only a number) stays in `text` so offsets hold, but readers never
 * match inside it. Ligatures are written out and a word hyphenated across a line break is joined.
 * @param {string[]} texts @param {{ ocr?: Record<number, { text: string, conf: number }> }} [o]
 */
export function pageModel(texts, { ocr = {} } = {}) {
  const pages = texts.map((raw, i) => {
    const o = ocr[i + 1];
    const base = o && typeof o.text === 'string' ? o.text : String(raw ?? '');
    const text = base.replace(/[ﬀ-ﬆ]/g, (c) => c.normalize('NFKC')).replace(/([a-z])-\n([ \t]*)([a-z]+)/g, '$1$3\n$2');
    const conf = o && Number.isFinite(o.conf) ? o.conf : null;
    const lines = [];
    let at = 0;
    for (const ln of text.split('\n')) { lines.push({ s: at, e: at + ln.length, furniture: false }); at += ln.length + 1; }
    return { n: i + 1, text, source: o ? 'ocr' : 'pdftext', conf, poor: conf !== null && conf < POOR_CONF, lines, clean: text };
  });
  const key = (p, l) => p.text.slice(l.s, l.e).replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  const edge = new Map();
  const counts = new Map();
  for (const p of pages) {
    const body = p.lines.filter((l) => p.text.slice(l.s, l.e).trim());
    const set = new Set([...body.slice(0, 3), ...body.slice(-3)]);
    edge.set(p, set);
    for (const k of new Set([...set].map((l) => key(p, l)))) if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  const need = Math.max(2, Math.ceil(pages.length / 2));
  for (const p of pages) {
    for (const l of p.lines) {
      const t = p.text.slice(l.s, l.e);
      if (!t.trim()) continue;
      if (/^\s*(?:page\s+)?\d{1,4}(?:\s+of\s+\d{1,4})?\s*$/i.test(t) || (edge.get(p).has(l) && !/\$\s?\d/.test(t) && !RENT_HEAD.test(t) && (counts.get(key(p, l)) || 0) >= need)) l.furniture = true; // a rent row or a rent table's heading repeats down a table; a footer carries neither
    }
    let clean = p.text;
    for (const l of p.lines) if (l.furniture) clean = clean.slice(0, l.s) + ' '.repeat(l.e - l.s) + clean.slice(l.e);
    p.clean = clean;
  }
  return pages;
}

const cleanLine = (p, l) => p.clean.slice(l.s, l.e);

/** The pages the model read: [{ n, source, conf, poor, chars }]. */
export const pageInfo = (pages) => pages.map((p) => ({ n: p.n, source: p.source, conf: p.conf, poor: p.poor, chars: p.text.replace(/\s+/g, '').length }));

/* ------------------------------------------------------------ quotes */

/** The sentence (or the table or label line) holding text[start, end): [a, b). Never across a page. */
function sentenceSpan(text, start, end) {
  const ls = text.lastIndexOf('\n', start - 1) + 1;
  let le = text.indexOf('\n', end);
  if (le < 0) le = text.length;
  const line = text.slice(ls, le);
  if (/\S {2,}\S/.test(line.trim()) || /^\s*[A-Z][A-Za-z' /&-]{2,40}\s*:\s+\S/.test(line)) return [ls, le];
  const lo = Math.max(0, start - 500);
  const win = text.slice(lo, Math.min(text.length, end + 500));
  let a = 0; let b = win.length;
  for (const m of win.matchAll(/[.;!?]\s+(?=[A-Z0-9(“"‘'])|\n\s*\n/g)) {
    const next = m.index + m[0].length;
    const last = /\n\s*\n/.test(m[0]) ? m.index : m.index + 1;
    if (next <= start - lo) a = next;
    if (last >= end - lo && last < b) b = last;
  }
  return [lo + a, lo + b];
}
const sentenceOf = (p, s, e) => { const [a, b] = sentenceSpan(p.text, s, e); return p.text.slice(a, b); };

/**
 * The quote for a match: widened to its sentence or table line (never across a page), space runs collapsed, cut to 240
 * characters on a character boundary with the match kept inside, then checked with verifyQuote against the page.
 * Returns { quote, start, len, ok }: start is the quote's offset in page.text, len its length; ok is false when the quote
 * did not check out (the caller then makes the candidate not-found).
 * @param {{ text: string, n?: number }} page @param {number} start @param {number} len @param {string} [token]
 */
export function makeQuote(page, start, len, token) {
  const text = page.text;
  let [a, b] = sentenceSpan(text, start, start + len);
  if (a > start) a = start;
  if (b < start + len) b = start + len;
  if (b - a > QUOTE_MAX * 1.6) { // a long passage: a window with the match inside
    a = Math.max(a, start - 100);
    b = Math.min(b, start + len + 140);
    const sp = text.slice(a, start).search(/\s/);
    if (a > 0 && /\S/.test(text[a - 1] || '') && sp >= 0) a += sp;
  }
  let s = ''; let first = -1; let prevSp = true;
  for (let i = a; i < b; i++) {
    if (/\s/.test(text[i])) { if (!prevSp) s += ' '; prevSp = true; } else { if (first < 0) first = i; s += text[i]; prevSp = false; }
  }
  s = s.trimEnd();
  let quote = cut(s, QUOTE_MAX);
  const tok = token === undefined ? text.slice(start, start + len) : token;
  if (!squashHas(quote, tok)) { // the cut lost the match: begin at it
    quote = cut(flat(text.slice(start, Math.max(b, start + len))), QUOTE_MAX); // from the match to the end of its sentence, never on into the next section
    first = start;
  }
  const v = verifyQuote([text], 1, quote, tok, 'text');
  return { quote, start: Math.max(0, first), len: quote.length, ok: v.status === 'verified' && quote.length >= 3 };
}
/**
 * Where a candidate's quote sits in its page text. `start` indexes page.text itself; `len` counts the quote's own characters,
 * which are the page text from `start` with each run of white space written as one space: quoteAt(text, start, len) is that quote.
 * @param {string} text @param {number} start @param {number} len
 */
export const quoteAt = (text, start, len) => flat(String(text).slice(start)).slice(0, len);
const squashHas = (quote, tok) => sq(quote).includes(sq(tok));

/* ------------------------------------------------------------ amounts, units, dates */

const BAD_LETTERS = /[OolISB]/;
/**
 * The first dollar amount in a text: { type: 'amount', value (dollars, whole cents), token, index, length }, or
 * { type: 'bad', token, index, length } when a token that looks like an amount has a letter in it ($1,OOO.00) or is not
 * written to the cent (a letter is never repaired). A bare integer with no $ and no cents is not money. null when there is none.
 */
export function readAmount(text) { return amountsIn(text)[0] || null; }

/**
 * A plain number token ("3,400", "3400.5", "125.000", "1.250,50"): { value } when it can only mean one thing, otherwise
 * { ambiguous, why }. A comma group of three is thousands; a lone point with one or two digits after it is a decimal; a point
 * followed by exactly three digits, a comma used as the decimal mark, or any other grouping could be either way of writing it
 * (125,000 or 125.000?), so it is never guessed. The decimal part is never dropped.
 * @param {string} tok
 * @returns {{ value: number } | { ambiguous: true, why: string }}
 */
export function numberToken(tok) {
  const t = String(tok);
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(t)) return { value: Number(t.replace(/,/g, '')) };
  if (/^\d+(?:\.\d{1,2}|\.\d{4,})?$/.test(t)) return { value: Number(t) };
  return { ambiguous: true, why: `${t}: a point or a comma may be a thousands mark or a decimal mark here (125,000 or 125.000?)` };
}

/** Every amount token in a text, in order (see readAmount). */
/** @returns {any[]} */
export function amountsIn(text) {
  /** @type {any[]} */ const out = [];
  const re = /\$\s?[\dOolISB,.]+|\d{1,3}(?:,\d{3})*\.\d{2}(?!\d)/g;
  const src = String(text ?? '');
  for (const m of src.matchAll(re)) {
    // a bare amount may not follow a digit, $, comma or point (no lookbehind: older Safari cannot parse it)
    if (m[0][0] !== '$' && /[\d$,.]/.test(src[m.index - 1] ?? '')) continue;
    const token = m[0].replace(/[.,]+$/, '');
    const hasDigit = /\d/.test(token);
    if (!hasDigit) continue;
    const at = { token, index: m.index, length: token.length };
    if (BAD_LETTERS.test(token.replace(/^\$/, ''))) { out.push({ type: 'bad', ...at }); continue; }
    const num = token.replace(/^\$\s?/, '');
    if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?$/.test(num)) { out.push({ type: 'bad', ...at }); continue; }
    out.push({ type: 'amount', value: toCents(Number(num.replace(/,/g, ''))), ...at });
  }
  return out;
}

const MON = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthNo = (s) => MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1;
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
const ordNo = (w) => {
  const s = w.toLowerCase().replace(/\s+/g, '-');
  if (ORD.includes(s)) return ORD.indexOf(s) + 1;
  if (s === 'thirtieth') return 30;
  if (s === 'thirty-first') return 31;
  const m = /^twenty-(\w+)$/.exec(s);
  return m && ORD.indexOf(m[1]) >= 0 && ORD.indexOf(m[1]) < 9 ? 20 + ORD.indexOf(m[1]) + 1 : null;
};
const iso = (y, m, d) => parseDateText(`${m}/${d}/${y}`);

/**
 * Every absolute date written as a number or with a month name, in order: { type: 'date', iso, token, index, length, y2 }, or
 * { type: 'ambiguous', why, token, index, length } for one that cannot be read (a first number over 12, "March 2027" with no day,
 * a day that does not exist, a date in words). Numeric dates are month first. "March 2027" is never passed to parseDateText.
 */
export function datesIn(text) {
  const t = String(text ?? '');
  const found = [];
  const add = (m, make) => found.push({ index: m.index, length: m[0].length, token: m[0], ...make(m) });
  const taken = (i, l) => found.some((f) => i < f.index + f.length && f.index < i + l);
  const run = (re, make) => { for (const m of t.matchAll(re)) if (!taken(m.index, m[0].length)) add(m, make); };
  run(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g, (m) => {
    if (+m[1] > 12) return { type: 'ambiguous', why: `${m[0]}: the first number is over 12, and dates here are read month first` };
    const v = iso(m[3].length === 2 ? 2000 + +m[3] : m[3], m[1], m[2]);
    return v ? { type: 'date', iso: v, y2: m[3].length === 2 } : { type: 'ambiguous', why: `${m[0]} is not a real date` };
  });
  run(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => { const v = iso(m[1], m[2], m[3]); return v ? { type: 'date', iso: v, y2: false } : { type: 'ambiguous', why: `${m[0]} is not a real date` }; });
  run(new RegExp(`\\b(${MON})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi'), (m) => { const v = iso(m[3], monthNo(m[1]), m[2]); return v ? { type: 'date', iso: v, y2: false } : { type: 'ambiguous', why: `${m[0]} is not a real date` }; });
  run(new RegExp(`\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)\\s+day\\s+of\\s+(${MON})\\.?,?\\s+(\\d{4})\\b`, 'gi'), (m) => { const v = iso(m[3], monthNo(m[2]), m[1]); return v ? { type: 'date', iso: v, y2: false } : { type: 'ambiguous', why: `${m[0]} is not a real date` }; });
  run(new RegExp(`\\b(?:the\\s+)?([a-z]+(?:[- ][a-z]+)?)(?:\\s*\\(\\d{1,2}(?:st|nd|rd|th)\\))?\\s+day\\s+of\\s+(${MON})\\.?,?\\s+(\\d{4})\\b`, 'gi'), (m) => {
    const d = ordNo(m[1]);
    const v = d ? iso(m[3], monthNo(m[2]), d) : null;
    return v ? { type: 'date', iso: v, y2: false } : { type: 'ambiguous', why: `${m[0]} is not a date this reader can read` };
  });
  run(new RegExp(`\\b(${MON})\\.?,?\\s+(\\d{4})\\b`, 'gi'), (m) => ({ type: 'ambiguous', why: `${m[0]}: no day given` }));
  run(/\btwo\s+thousand\b[^.;\n]{0,60}/gi, (m) => ({ type: 'ambiguous', why: `a date written in words (${flat(m[0])}) is not read` }));
  return found.sort((a, b) => a.index - b.index);
}

const REL = [
  /\b(?:\d{1,3}|[a-z]+(?:-[a-z]+)?\s*\(\d{1,3}\))\s+(?:calendar\s+|business\s+)?(?:days?|weeks?|months?)\s+(?:after|following|before|from)\b/i,
  /\bthe\s+(?:first|last)\s+day\s+of\s+the\s+(?:[a-z0-9()-]+\s+){0,5}?month\s+(?:after|following|in\s+which|of)\b/i,
  /\bthe\s+(?:earlier|later)\s+of\b/i,
  /\bthe\s+date\s+(?:that\s+)?(?:landlord|tenant)\s+(?:delivers|tenders|gives|delivered)\b/i,
  /\b(?:upon|on)\s+(?:the\s+)?(?:date\s+of\s+)?(?:delivery|substantial\s+completion)\b/i,
];

/** The relative date in a text: { index, phrase } (the phrase as written to the end of its clause, at most 200 characters), or null. */
function relativeIn(text) {
  let best = null;
  for (const re of REL) { const m = re.exec(text); if (m && (!best || m.index < best.index)) best = m; }
  if (!best) return null;
  const rest = text.slice(best.index);
  const end = rest.search(/[.;](?=\s|$)|\n\s*\n/);
  return { index: best.index, phrase: cut(flat(end < 0 ? rest : rest.slice(0, end)), TEXT_MAX) };
}

/**
 * The date in a clause: { type: 'date', iso, token, index, length, y2 } | { type: 'rel', rel, index, length } |
 * { type: 'ambiguous', why, index, length } | null. A relative date wins when it begins first (it may hold dates inside it);
 * a date followed by a relative one, or two different dates, is ambiguous: nothing is chosen for the broker.
 */
export function readDate(text) {
  const t = String(text ?? '');
  const dates = datesIn(t);
  const rel = relativeIn(t);
  if (rel && (!dates.length || rel.index <= dates[0].index)) return { type: 'rel', rel: rel.phrase, index: rel.index, length: Math.max(1, Math.min(rel.phrase.length, t.length - rel.index)) };
  if (!dates.length) return null;
  if (rel) return { type: 'ambiguous', why: 'a date and a relative date both appear: ' + flat(t.slice(0, 120)), index: dates[0].index, length: dates[0].length };
  const real = dates.filter((d) => d.type === 'date');
  if (new Set(real.map((d) => d.iso)).size > 1) return { type: 'ambiguous', why: `more than one date: ${real.map((d) => d.token).join(' and ')}`, index: dates[0].index, length: dates[0].length };
  return dates[0];
}

/** What unit a text names, from its words only: { unit, basis, unsure }. `unsure` is a $/SF with no month or year word. */
export function unitFrom(s) {
  const t = String(s ?? '').toLowerCase();
  const basis = /\busable\b|\busf\b/.test(t) ? 'usable' : /gross/.test(t) ? 'gross' : /rentable|\brsf\b|net\s+rentable/.test(t) ? 'rentable' : null;
  const psf = /\bp\.?s\.?f\b|\brsf\b|\busf\b|per\s+(?:rentable\s+|usable\s+|gross\s+)?(?:square|sq\.?|s\.?f\.?\b|rsf)|\/\s*(?:r?sf|sq\.?\s*ft)/.test(t);
  const month = /\bper\s+month\b|\bmonthly\b|\/\s*mo\b|\bmonth\b/.test(t);
  const year = /\bper\s+annum\b|\bannual(?:ly)?\b|\bper\s+year\b|\/\s*yr\b|\byearly\b|\bannum\b|\byear\b/.test(t);
  if (psf) return month && !year ? { unit: 'psf_month', basis } : year && !month ? { unit: 'psf_year', basis } : { unit: null, basis, unsure: true };
  if (month && !year) return { unit: 'month', basis };
  if (year && !month) return { unit: 'year', basis };
  return { unit: null, basis };
}

/* ------------------------------------------------------------ headings, defined terms, basic terms, type */

const SEQ = (list, first) => {
  const out = [];
  let want = first;
  for (const h of list) { if (h.num === want || (out.length === 0 && h.num === first)) { out.push(h); want = h.num + 1; } }
  return out;
};

/**
 * The numbered headings of a lease: [{ num, title|null, style, page, start }], in order. Styles: dot ("2. TERM."), paren ("3)"),
 * article ("ARTICLE 4", "Section 4.1") and recital ("WHEREAS", ending at "NOW, THEREFORE"). A number counts only when it
 * continues the sequence, so a list's "2." inside a paragraph is dropped. With no headings the lease is one section.
 */
export function findHeadings(pages) {
  const all = { dot: [], paren: [], article: [], recital: [] };
  for (const p of pages) {
    const t = p.clean;
    for (const m of t.matchAll(/^[ \t]*(\d{1,3})\.[ \t]+([A-Z][A-Z0-9 &,'/()-]{2,60})\./gm)) all.dot.push({ num: +m[1], title: m[2].trim(), style: 'dot', page: p.n, start: m.index });
    for (const m of t.matchAll(/^[ \t]*(\d{1,3})\)[ \t]/gm)) all.paren.push({ num: +m[1], title: null, style: 'paren', page: p.n, start: m.index });
    for (const m of t.matchAll(/^[ \t]*(ARTICLE|Section)[ \t]+(\d+|[IVXLC]+)((?:\.\d+)*)/gm)) all.article.push({ num: /^\d+$/.test(m[2]) ? +m[2] : roman(m[2]), title: null, style: 'article', page: p.n, start: m.index, sub: m[3], word: m[1] });
    for (const m of t.matchAll(/^[ \t]*WHEREAS\b/gm)) all.recital.push({ num: all.recital.length + 1, title: 'Recital', style: 'recital', page: p.n, start: m.index });
  }
  const dot = SEQ(all.dot, 1); const paren = SEQ(all.paren, 1);
  const art = SEQ(all.article.filter((h) => h.word === 'ARTICLE' || !h.sub), 1);
  const best = [dot, paren, art].sort((a, b) => b.length - a.length)[0];
  const out = [...all.recital, ...(best.length >= 2 ? best : [])];
  return out.map(({ sub, word, ...h }) => h).sort((a, b) => a.page - b.page || a.start - b.start);
}
function roman(s) {
  const v = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let n = 0;
  for (let i = 0; i < s.length; i++) n += v[s[i]] < (v[s[i + 1]] || 0) ? -v[s[i]] : v[s[i]];
  return n;
}

/**
 * The defined terms: Map(name -> { page, start, len }) from (the “Name”), "hereinafter referred to as the “Name”", and the
 * label lines of a basic-terms page ("Landlord: ..."). Names as written; match case-insensitively on squashed text.
 */
export function findDefinedTerms(pages) {
  const map = new Map();
  const put = (name, page, start, len) => { const k = flat(name); if (k && !map.has(k)) map.set(k, { page, start, len }); };
  for (const p of pages) {
    for (const m of p.clean.matchAll(/\((?:the\s+)?["“]([A-Z][\w'’ -]{1,60})["”]\)/g)) put(m[1], p.n, m.index, m[0].length);
    for (const m of p.clean.matchAll(/(?:hereinafter|herein)\s+(?:referred\s+to\s+as|called)\s+(?:the\s+)?["“]([^"”]{2,60})["”]/gi)) put(m[1], p.n, m.index, m[0].length);
    if (p.n <= 5) for (const l of p.lines) {
      if (l.furniture) continue;
      const m = /^\s*([A-Z][A-Za-z' ]{2,40})\s*[:.]\s+(.+)$/.exec(cleanLine(p, l));
      if (m) put(m[1], p.n, l.s, l.e - l.s);
    }
  }
  return map;
}

const LABEL_LINE = /^\s*([A-Z][A-Za-z' /&-]{2,40}?)\s*[:.]\s+(\S.*)$/;
function labelLines(p) {
  const out = [];
  for (const l of p.lines) {
    if (l.furniture) continue;
    const m = LABEL_LINE.exec(cleanLine(p, l));
    if (m) out.push({ label: m[1].trim(), value: m[2].trim(), start: l.s + cleanLine(p, l).indexOf(m[2]), lineStart: l.s });
  }
  return out;
}

/**
 * The basic-terms page: the best of the first 5 pages with at least 4 label lines and either 2+ dollar amounts or 3+ defined
 * terms. { page, lines: [{ label, value, start }], extra: [{ page, lines }] } or null. A second page within one point of the
 * best is read too (extra); where they disagree the value is ambiguous.
 */
export function findBasicTerms(pages, terms = new Map()) {
  const scored = [];
  for (const p of pages.slice(0, 5)) {
    const lines = labelLines(p);
    const amounts = amountsIn(p.clean).filter((a) => a.type === 'amount').length;
    const defs = [...terms.values()].filter((t) => t.page === p.n).length;
    if (lines.length >= 4 && (amounts >= 2 || defs >= 3)) scored.push({ page: p.n, lines, score: lines.length });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score || a.page - b.page);
  const [best, ...rest] = scored;
  return { page: best.page, lines: best.lines, extra: rest.filter((x) => best.score - x.score <= 1).map(({ page, lines }) => ({ page, lines })) };
}

/**
 * What a document is, from its first 3 pages: { type: 'lease'|'amendment'|'summary'|'other', ask }. A "summary" has a title
 * like "lease abstract" in its first 400 characters and none of "by and between", "WITNESSETH" or By/Name lines (it is someone's
 * reading, not the lease). An unclear score is 'other', and `ask` lists what to offer.
 */
export function docType(pages, name = '') {
  const first = pages.slice(0, 3).map((p) => p.text).join('\n');
  const head = first.slice(0, 400);
  if (/lease\s+abstract|lease\s+summary|abstract\s+of\s+(?:the\s+)?lease|summary\s+of\s+(?:the\s+)?lease/i.test(head) && !/by\s+and\s+between|witnesseth|^\s*(?:By|Name)\s*:/im.test(first)) return { type: 'summary', ask: [] };
  if (/\b(?:first|second|third|fourth|fifth|\w+)\s+amendment\s+to\b|\blease\s+amendment\b/i.test(head)) return { type: 'amendment', ask: [] };
  const c = classify(first, name);
  if (c.type === 'lease' || c.type === 'amendment') return { type: c.type, ask: [] };
  return { type: 'other', ask: ['lease', 'amendment'] };
}

/* ------------------------------------------------------------ candidates */

const confOf = (p, { loose = false, y2 = false } = {}) => {
  if (p.poor) return 'low';
  const c = p.source === 'ocr' ? 'medium' : 'high'; // the page average cannot vouch for one digit: no per-word confidence reaches the reader, so OCR is never above medium
  return (loose || y2) && c === 'high' ? 'medium' : c;
};

/** One reading of a field, with its quote checked; a quote that does not check out makes it not-found. */
function cand(p, key, start, len, value, o = {}) {
  const q = makeQuote(p, start, len, o.token);
  const base = {
    key, value, unit: o.unit ?? null, basis: o.basis ?? null, rel: o.rel ?? '', status: o.status || 'found', confidence: confOf(p, o), note: o.note || '', from: o.from || 'body',
    page: p.n, start: q.start, len: q.len, quote: q.quote, hit: cut(flat(o.token === undefined ? p.text.slice(start, start + len) : o.token), 80), ocrConf: p.source === 'ocr' && Number.isFinite(p.conf) ? Math.round(p.conf) : null,
  };
  if (o.choices) base.choices = o.choices;
  if (!q.ok) return { ...base, value: null, rel: '', unit: null, basis: null, status: 'not-found', note: 'The quote did not check out', quote: '', len: 0 };
  return base;
}

/** The window of text after a label: up to 160 characters, cut at the end of the sentence, a paragraph break, or a stop word. */
function windowAfter(p, end, stop) {
  let w = p.clean.slice(end, end + 160);
  const cuts = [w.search(/[.;](?=\s+[A-Z(])|\n\s*\n|\n[ \t]*[A-Z][\w' /&-]{2,40}:[ \t]/), stop ? w.search(stop) : -1].filter((i) => i >= 0);
  if (cuts.length) w = w.slice(0, Math.min(...cuts));
  return w;
}

const DATE_FIELDS = [
  { key: 'leaseDate', kind: 'date', stop: null, labels: [/\b(?:lease\s+date|date\s+of\s+(?:this\s+)?lease)\s*[:.-]?\s*/gi, /\b(?:made|entered\s+into|dated)(?:\s+and\s+entered\s+into)?\s+(?:as\s+of|on|this)\s+/gi] },
  { key: 'possession', kind: 'dateRel', stop: null, labels: [/\b(?:possession|delivery)\s+date\s*[:.-]?\s*/gi, /\bdate\s+of\s+possession\s*[:.-]?\s*/gi] },
  { key: 'rentCommencement', kind: 'dateRel', stop: /\b(?:expir\w*|terminat\w*)\b/i, labels: [/\brent\s+commencement(?:\s+date)?\s*[:.-]?\s*(?:shall\s+be\s+|is\s+|will\s+be\s+)?/gi, /\brent\s+(?:shall\s+)?commences?\s+(?:on\s+|in\s+)?/gi] },
  { key: 'commencement', kind: 'dateRel', stop: /\b(?:expir\w*|terminat\w*)\b/i, labels: [/\bcommencement\s+date\s*[:.-]?\s*(?:shall\s+be\s+|is\s+|will\s+be\s+)?/gi, /\bshall\s+commence\s+(?:on\s+)?/gi] },
  { key: 'expiration', kind: 'dateRel', stop: null, labels: [/\b(?:lease\s+)?expiration\s+date\s*[:.-]?\s*(?:shall\s+be\s+|is\s+|will\s+be\s+)?/gi, /\b(?:shall\s+)?expire(?:s)?\s+(?:on\s+)?/gi] },
];

/** A date field's candidate from the text after a label (null when the text holds no date). */
function dateCand(p, f, start, w, from, loose) {
  const d = readDate(w);
  if (!d) return null;
  const at = start + d.index;
  if (d.type === 'date') return cand(p, f.key, at, d.length, d.iso, { token: d.token, from, loose, y2: d.y2 });
  if (d.type === 'rel') {
    if (f.kind === 'date') return cand(p, f.key, at, d.length, null, { token: w.slice(d.index, d.index + 20), status: 'ambiguous', rel: '', note: `Only a relative date is given: ${d.rel}`, from, loose });
    return cand(p, f.key, at, d.length, null, { token: w.slice(d.index, d.index + Math.min(d.length, 30)), rel: d.rel, from, loose });
  }
  return cand(p, f.key, at, d.length, null, { token: w.slice(d.index, d.index + d.length), status: 'ambiguous', note: d.why, from, loose });
}

/* ------------------------------------------------------------ the field readers */

/** Parties: landlord, tenant, trade name, guarantor. Entity text as written, cut to 200. */
export function readParties(pages, { basic } = /** @type {{ basic?: any }} */ ({})) {
  const out = [];
  const entity = (s) => cut(trimEnd(flat(s).replace(/^(?:by\s+and\s+)?between\s+/i, '').replace(/^(?:and|by)\s+/i, '')), TEXT_MAX);
  // the opening paragraph: "between X (the “Landlord”) and Y (the “Tenant”)". Found from the defined name, then looking back
  // a bounded way for the entity (a pattern that started at every word would be slow on a page of junk).
  const anchor = (n) => new RegExp(`\\(\\s*(?:the\\s+)?["“'‘]?\\s*${n}\\s*["”'’]?\\s*\\)`, 'gi');
  for (const p of pages.slice(0, 2)) {
    const t = p.clean;
    const la = anchor('Landlord').exec(t);
    if (la) {
      const lo = Math.max(0, la.index - 280);
      const win = t.slice(lo, la.index);
      const bm = [...win.matchAll(/(?:between|among)\s+/gi)].pop();
      if (bm) {
        const s0 = lo + bm.index + bm[0].length;
        const text = entity(t.slice(s0, la.index));
        if (text) out.push(cand(p, 'landlord', s0, la.index - s0, text, { from: 'preamble' }));
        const rest = t.slice(la.index + la[0].length);
        const ta = anchor('Tenant').exec(rest.slice(0, 300));
        const lead = ta && /^\s*(?:,\s*)?and\s+/i.exec(rest);
        if (ta && lead && lead[0].length < ta.index) {
          const s1 = la.index + la[0].length + lead[0].length;
          const tt = entity(t.slice(s1, la.index + la[0].length + ta.index));
          if (tt) out.push(cand(p, 'tenant', s1, la.index + la[0].length + ta.index - s1, tt, { from: 'preamble' }));
        }
      }
    }
  }
  for (const p of pages.slice(0, 3)) {
    for (const m of p.clean.matchAll(/\b(?:[Dd]\/[Bb]\/[Aa]|[Dd]oing\s+[Bb]usiness\s+[Aa]s|[Dd][Bb][Aa])\s+([A-Z][^,.;()\n]{1,80})/g)) {
      const name = trimEnd(flat(m[1]));
      out.push(cand(p, 'tradeName', m.index + m[0].indexOf(m[1]), name.length, name, { from: 'preamble' }));
    }
    const ga = anchor('Guarantor').exec(p.clean);
    if (ga) {
      const lo = Math.max(0, ga.index - 220);
      const win = p.clean.slice(lo, ga.index);
      const cutAt = Math.max(win.lastIndexOf('('), win.lastIndexOf(')'));
      const s0 = lo + cutAt + 1;
      const name = entity(p.clean.slice(s0, ga.index).replace(/^[\s\S]*?\b(?:guaranteed|guaranty|executed)\s+by\s+/i, ''));
      if (name) out.push(cand(p, 'guarantor', s0, ga.index - s0, name, { from: 'preamble', loose: true }));
    }
  }
  const tables = basic ? [basic, ...basic.extra.map((x) => ({ ...x }))] : [];
  for (const b of tables) {
    const p = pages[b.page - 1];
    for (const l of b.lines) {
      const key = /^landlord$/i.test(l.label) ? 'landlord' : /^tenant$/i.test(l.label) ? 'tenant' : /trade\s+name|d\/b\/a|doing\s+business/i.test(l.label) ? 'tradeName' : /^guarantor/i.test(l.label) ? 'guarantor' : null;
      if (!key || /^(?:none|n\/a)\b/i.test(l.value)) continue;
      out.push(cand(p, key, l.start, l.value.length, cut(trimEnd(flat(l.value)), TEXT_MAX), { from: 'basic' }));
    }
  }
  return out;
}

const PREM_CTX = /premises|suite|space|demised|rentable|usable|\brsf\b|\busf\b|leased|tenant/i;
const BASIS_WORD = /gross\s+leasable|\bgla\b|gross\s+building|net\s+rentable|rentable|\brsf\b|usable|\busf\b/gi;
const basisOfWord = (w) => { const t = w.toLowerCase(); return /gross\s+leasable|^gla$/.test(t) ? 'gla' : /gross/.test(t) ? 'gross' : /usable|usf/.test(t) ? 'usable' : 'rentable'; };

/** Premises: suite, floor, square feet with their basis (from the adjacent words only), pro-rata share. */
export function readPremises(pages, { basic } = /** @type {{ basic?: any }} */ ({})) {
  const out = [];
  const inPremises = (p, s, e) => PREM_CTX.test(sentenceOf(p, s, e)) && /premises|demised|leased|suite|space|unit/i.test(sentenceOf(p, s, e));
  for (const p of pages.slice(0, 4)) {
    for (const m of p.clean.matchAll(/\b(?:Suite|Ste\.?|Unit|Space)\s+#?([A-Z]?\d{1,5}[A-Z]?(?:-\d{1,3})?)\b/g)) {
      if (inPremises(p, m.index, m.index + m[0].length)) out.push(cand(p, 'suite', m.index + m[0].indexOf(m[1]), m[1].length, m[1], { from: 'body' }));
    }
    for (const m of p.clean.matchAll(/\b(\d{1,2}(?:st|nd|rd|th))\s+floor\b|\bfloor\s*(?:no\.?|number|#)?\s*:?\s*(\d{1,2})\b|\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+floor\b/gi)) {
      const v = m[1] || m[2] || m[3];
      if (inPremises(p, m.index, m.index + m[0].length)) out.push(cand(p, 'floor', m.index + m[0].indexOf(v), v.length, v, { from: 'body' }));
    }
  }
  for (const p of pages) {
    const text = p.clean;
    const hits = [];
    for (const m of text.matchAll(/(\d[\d.,]*\d|\d)\s*(?:(rentable|usable|net\s+rentable|gross\s+leasable|gross\s+building|gross)\s+)?(square\s+(?:feet|foot)|sq\.?\s*ft\.?|rsf|usf|sf)\b/gi)) if (!/[\d,.$]/.test(text[m.index - 1] ?? '')) hits.push({ m, num: m[1], word: m[2], unit: m[3], at: m.index });
    for (const m of text.matchAll(/\b(rentable|usable|net\s+rentable|gross\s+leasable|gross\s+building)\s+(?:area|square\s+(?:feet|footage)|sf)\s*(?:of\s+the\s+premises\s*)?[:-]?\s*(?:approximately\s+)?(\d[\d.,]*\d|\d)(?![\d.,]*\d)/gi)) hits.push({ m, num: m[2], word: m[1], unit: '', at: m.index });
    for (const h of hits) {
      const nr = numberToken(h.num);
      if ('value' in nr && !(h.num.includes(',') || nr.value >= 100)) continue; // "5 sf" is not an area
      const end = h.at + h.m[0].length;
      const ls = text.lastIndexOf('\n', h.at) + 1;
      const around = text.slice(Math.max(ls, h.at - 40), h.at);
      const after = text.slice(end, Math.min(text.indexOf('\n', end) < 0 ? text.length : text.indexOf('\n', end), end + 25));
      let basisWord = h.word || (/^[ru]sf$/i.test(h.unit) ? h.unit : null);
      if (!basisWord) { const b = [...around.matchAll(BASIS_WORD)].pop(); basisWord = b ? b[0] : null; }
      if (!basisWord) { const b = [...after.matchAll(BASIS_WORD)][0]; basisWord = b ? b[0] : null; }
      const basis = basisWord ? basisOfWord(basisWord) : null;
      const ctx = sentenceOf(p, h.at, end);
      const bare = ctx.replace(/gross\s+building/gi, '');
      if (!PREM_CTX.test(ctx) || (/\b(?:building|project|center|property)\b/i.test(bare) && !/premises|suite/i.test(bare))) continue;
      const numAt = h.at + h.m[0].indexOf(h.num);
      if ('ambiguous' in nr) { out.push({ ...cand(p, 'sf', numAt, h.m[0].length - (numAt - h.at), null, { token: h.m[0], basis: null, from: 'body', status: 'ambiguous', note: nr.why }), gla: false }); continue; }
      const value = toRate(nr.value);
      out.push({ ...cand(p, 'sf', numAt, h.m[0].length - (numAt - h.at), value, { token: h.m[0], basis: basis === 'gla' ? null : basis, from: 'body', note: basis ? '' : 'basis not stated' }), gla: basis === 'gla' });
    }
    for (const m of text.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g)) {
      if (/[\d.,]/.test(text[m.index - 1] ?? '')) continue; // no lookbehind: older Safari cannot parse it
      const w = text.slice(Math.max(0, m.index - 90), m.index + m[0].length + 60);
      if (/pro[\s-]*rata|proportionate\s+share|tenant['’]?s\s+share/i.test(w)) {
        const nr = /^\d{1,3}(?:\.\d{1,2}|\.\d{4})?$/.test(m[1]) ? { value: Number(m[1]) } : { ambiguous: true, why: `${m[0]}: a point or a comma may be a decimal or a thousands mark here (12.500 or 12,500?)` };
        const v = 'value' in nr ? nr.value : null;
        const bad = 'ambiguous' in nr ? nr.why : v > 100 ? `${m[0]} is over 100 percent` : '';
        out.push(cand(p, 'proRata', m.index, m[0].length, bad ? null : v, { from: 'body', status: bad ? 'ambiguous' : 'found', note: bad }));
      }
    }
  }
  if (basic) for (const b of [basic, ...basic.extra]) {
    const p = pages[b.page - 1];
    for (const l of b.lines) {
      if (/^premises$|^suite|^space|^unit/i.test(l.label)) {
        const sm = /\b(?:Suite|Ste\.?|Unit|Space)\s+#?([A-Z]?\d{1,5}[A-Z]?(?:-\d{1,3})?)\b/.exec(l.value);
        if (sm) out.push(cand(p, 'suite', l.start + sm.index + sm[0].indexOf(sm[1]), sm[1].length, sm[1], { from: 'basic' }));
        const fm = /\b(\d{1,2}(?:st|nd|rd|th))\s+floor\b|\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+floor\b/i.exec(l.value);
        if (fm) { const v = fm[1] || fm[2]; out.push(cand(p, 'floor', l.start + fm.index, v.length, v, { from: 'basic' })); }
      }
    }
  }
  return out;
}

const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
/** "sixty-three" or "one hundred twenty" as a number, or null when the words are not a number. */
export function wordsToNumber(s) {
  const ws = String(s ?? '').toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (!ws.length) return null;
  let n = 0; let cur = 0;
  for (const w of ws) {
    if (w in UNITS) cur += UNITS[w];
    else if (w in TENS) cur += TENS[w];
    else if (w === 'hundred') cur = (cur || 1) * 100;
    else if (w === 'and') continue;
    else return null;
  }
  n += cur;
  return n;
}
const tailNumber = (words) => { const ws = words.trim().split(/\s+/); for (let k = Math.min(3, ws.length); k >= 1; k--) { const n = wordsToNumber(ws.slice(-k).join(' ')); if (n !== null) return { n, k, text: ws.slice(-k).join(' ') }; } return null; };

const TERM_RE = /\b(?:([A-Za-z]+(?:[- ][A-Za-z]+){0,2})\s*\((\d{1,3})\)|(\d{1,3}))\s*(years?|months?)\b/g;
/** The initial term: termMonths (a whole number of months, years times 12) and termText (as written). Words and figure must agree. */
export function readTerm(pages, { basic } = /** @type {{ basic?: any }} */ ({})) {
  const out = [];
  const one = (p, m, from, ctxOk) => {
    const figure = m[2] !== undefined ? +m[2] : +m[3];
    const tail = m[1] ? tailNumber(m[1]) : null;
    const words = tail ? tail.n : null;
    if (!ctxOk) return;
    const text = tail ? `${tail.text} (${figure}) ${m[4]}` : trimEnd(flat(m[0]));
    const years = /^y/i.test(m[4]);
    if (words !== null && words !== figure) {
      out.push(cand(p, 'termText', m.index, m[0].length, text, { status: 'ambiguous', note: `The words say ${words} ${m[4].toLowerCase()} but the figure says ${figure}`, from }));
      out.push(cand(p, 'termMonths', m.index, m[0].length, null, { token: m[0], status: 'ambiguous', note: `The words say ${words} ${m[4].toLowerCase()} but the figure says ${figure}`, from }));
      return;
    }
    out.push(cand(p, 'termText', m.index, m[0].length, text, { from }));
    out.push(cand(p, 'termMonths', m.index, m[0].length, years ? figure * 12 : figure, { token: m[0], from }));
  };
  for (const p of pages) {
    for (const m of p.clean.matchAll(TERM_RE)) {
      const s = sentenceOf(p, m.index, m.index + m[0].length);
      if (/\bterm\b/i.test(s) && !/renew|option|extend|extension|additional|holdover|abate|free\s+rent|notice/i.test(s)) one(p, m, 'body', true);
    }
  }
  if (basic) for (const b of [basic, ...basic.extra]) {
    const p = pages[b.page - 1];
    for (const l of b.lines) if (/^(?:lease\s+)?term$|^initial\s+term/i.test(l.label)) {
      TERM_RE.lastIndex = 0;
      const m = TERM_RE.exec(l.value);
      if (m) one({ ...p, text: p.text }, { ...m, index: l.start - 0 + m.index, 0: m[0], 1: m[1], 2: m[2], 3: m[3], 4: m[4] }, 'basic', true);
    }
  }
  const dateOut = [];
  for (const f of DATE_FIELDS) {
    for (const p of pages) for (const re of f.labels) {
      for (const m of p.clean.matchAll(re)) {
        if (f.key === 'commencement' && /rent\s$/i.test(p.clean.slice(Math.max(0, m.index - 5), m.index))) continue; // "rent commencement" is its own field
        const before = p.clean.slice(Math.max(0, m.index - 3), m.index);
        if (/["“]\s*$/.test(before) || /^["”]/.test(p.clean.slice(m.index + m[0].length, m.index + m[0].length + 1))) continue; // a definition: the date comes before the label
        const w = windowAfter(p, m.index + m[0].length, f.stop);
        const c = dateCand(p, f, m.index + m[0].length, w, 'body', false);
        if (c) dateOut.push(c);
      }
    }
  }
  if (basic) for (const b of [basic, ...basic.extra]) {
    const p = pages[b.page - 1];
    for (const l of b.lines) {
      const f = /^lease\s+date|^date\s+of\s+lease/i.test(l.label) ? 'leaseDate' : /^rent\s+commencement/i.test(l.label) ? 'rentCommencement' : /commencement/i.test(l.label) ? 'commencement' : /expiration|expiry/i.test(l.label) ? 'expiration' : /possession|delivery/i.test(l.label) ? 'possession' : null;
      if (!f) continue;
      const c = dateCand(p, DATE_FIELDS.find((x) => x.key === f), l.start, l.value, 'basic', false);
      if (c) dateOut.push(c);
    }
  }
  return [...out, ...dateOut];
}

/** The security deposit (an amount, or none) and how it is held (cash or letter of credit, by the words). */
export function readDeposit(pages, { basic } = /** @type {{ basic?: any }} */ ({})) {
  const out = [];
  for (const p of pages) {
    const t = p.clean;
    for (const m of t.matchAll(/\bno\s+security\s+deposit\b|\bsecurity\s+deposit\s*(?:is|shall\s+be)?\s*[:.-]?\s*(?:none|not\s+required|waived|n\/a)\b/gi)) out.push(cand(p, 'deposit', m.index, m[0].length, 0, { unit: 'total', from: 'body' }));
    for (const m of t.matchAll(/\bsecurity\s+deposit\b/gi)) {
      const s = sentenceOf(p, m.index, m.index + m[0].length);
      if (/\bno\s+security\s+deposit\b|\bnone\b|not\s+required|waived/i.test(s)) continue;
      const w = t.slice(m.index, m.index + 200);
      const end = w.search(/[.;](?=\s|$)/);
      const a = amountsIn(end < 0 ? w : w.slice(0, end));
      const first = a[0];
      if (!first) continue;
      if (first.type === 'bad') { out.push(cand(p, 'deposit', m.index + first.index, first.length, null, { status: 'ambiguous', note: `${first.token} has a letter in it, so it is not read as an amount`, token: first.token, from: 'body' })); continue; }
      out.push(cand(p, 'deposit', m.index + first.index, first.length, first.value, { unit: 'total', token: first.token, from: 'body' }));
      const form = [/letter\s+of\s+credit/i.test(s) && 'letter of credit', /\bcash\b/i.test(s) && 'cash'].filter(Boolean);
      if (form.length === 1) { const at = s.search(/letter\s+of\s+credit|\bcash\b/i); const i = p.text.indexOf(s.trim().slice(0, 30)); const start = i >= 0 ? i + Math.max(0, at) : m.index; out.push(cand(p, 'depositForm', start, form[0].length, form[0], { from: 'body', token: form[0] === 'cash' ? 'cash' : 'letter of credit' })); }
      else if (form.length === 2) out.push(cand(p, 'depositForm', m.index, m[0].length, null, { status: 'ambiguous', note: 'Both cash and a letter of credit are named', token: m[0], from: 'body' }));
    }
  }
  if (basic) for (const b of [basic, ...basic.extra]) {
    const p = pages[b.page - 1];
    for (const l of b.lines) {
      if (!/security\s+deposit|^deposit$/i.test(l.label)) continue;
      if (/^(?:none|no|n\/a|not\s+required|waived)\b/i.test(l.value)) { out.push(cand(p, 'deposit', l.start, l.value.length, 0, { unit: 'total', token: l.value, from: 'basic' })); continue; }
      const a = readAmount(l.value);
      if (!a) continue;
      if (a.type === 'bad') out.push(cand(p, 'deposit', l.start + a.index, a.length, null, { status: 'ambiguous', note: `${a.token} has a letter in it, so it is not read as an amount`, token: a.token, from: 'basic' }));
      else out.push(cand(p, 'deposit', l.start + a.index, a.length, a.value, { unit: 'total', token: a.token, from: 'basic' }));
    }
  }
  return out;
}

/** The narrative escalation, as written (it fills only the text field; steps come only from the broker's tap). */
export function readEscalation(pages) {
  const out = [];
  for (const p of pages) for (const m of p.clean.matchAll(/(\d+(?:\.\d+)?)\s*%\s*(?:per\s+annum|annually|each\s+year|per\s+year|on\s+each\s+anniversary)/gi)) {
    const s = sentenceOf(p, m.index, m.index + m[0].length);
    if (/escalat|increase/i.test(s)) out.push(cand(p, 'escalation', m.index, m[0].length, cut(flat(s), TEXT_MAX), { from: 'body', token: m[0] }));
  }
  return out;
}

/* ------------------------------------------------------------ rent steps */

const RENT_HEAD = /\b(?:base|basic|minimum|monthly|annual|fixed)\s+rent(?:al)?\b|\brent\s+(?:schedule|table)\b|\brental\s+rate/i;
const ABATED = /\b(?:abated|abatement|free\s+rent|rent[-\s]free|waived|no\s+rent)\b/i;
const DASH = '(?:-|–|—|to|through|thru)';

/** The cells of a header line: [{ s, e, text }], split at runs of two or more spaces. */
function cellsOf(line) {
  const out = [];
  for (const m of line.matchAll(/\S+(?: \S+)*/g)) out.push({ s: m.index, e: m.index + m[0].length, text: m[0] });
  return out;
}

/**
 * A rent row: a line with a period (Year n, Years n-m, Months n-m, a date range, or a bare "n through m" under a heading that
 * says months or years) and an amount (or the word abated). `hint` is the text of the heading above, for the bare form.
 */
function rowOf(p, l, hint) {
  const t = cleanLine(p, l);
  let label = ''; let mFrom = null; let mTo = null; let from = null; let to = null; let y2 = false; let m = null;
  if ((m = new RegExp(`\\bmonths?\\s+(\\d{1,3})\\s*${DASH}\\s*(\\d{1,3})\\b`, 'i').exec(t))) { mFrom = +m[1]; mTo = +m[2]; label = cut(flat(m[0]), 40); }
  else if ((m = new RegExp(`\\b(?:lease\\s+)?years?\\s+(\\d{1,2})(?:\\s*${DASH}\\s*(\\d{1,2}))?\\b`, 'i').exec(t))) label = cut(flat(m[0]), 40);
  else {
    const ds = datesIn(t).filter((d) => d.type === 'date');
    if (ds.length >= 2 && new RegExp(`^\\s*${DASH}\\s*$`, 'i').test(t.slice(ds[0].index + ds[0].length, ds[1].index))) {
      from = ds[0].iso; to = ds[1].iso; y2 = ds[0].y2 || ds[1].y2;
      m = { 0: t.slice(ds[0].index, ds[1].index + ds[1].length), index: ds[0].index };
      label = cut(flat(m[0]), 40);
    } else if ((m = new RegExp(`^\\s*(\\d{1,3})\\s*${DASH}\\s*(\\d{1,3})\\b`, 'i').exec(t))) {
      if (/\bmonths?\b/i.test(hint)) { mFrom = +m[1]; mTo = +m[2]; label = cut(`Months ${m[1]}-${m[2]}`, 40); }
      else if (/\byears?\b/i.test(hint)) label = cut(`Years ${m[1]}-${m[2]}`, 40);
      else m = null;
    }
  }
  if (!m) return null;
  const end = m.index + m[0].length;
  const amounts = amountsIn(t.slice(end)).map((a) => ({ ...a, index: a.index + end }));
  const abated = ABATED.test(t);
  if (!amounts.length && !abated) return null;
  return { label, mFrom, mTo, from, to, y2, amounts, abated, text: t, line: l };
}

/** The unit of one amount on a row: the words just after it, else the words of the column heading above it. */
function unitOfAmount(a, row, cells, nextAt) {
  const inline = unitFrom(row.text.slice(a.index + a.length, Math.min(nextAt, a.index + a.length + 40)));
  if (inline.unit || inline.unsure) return inline;
  const lo = a.index; const hi = a.index + a.length;
  const words = [];
  for (const line of cells) for (const c of line) if (c.s - 2 < hi && c.e + 2 > lo) words.push(c.text);
  return unitFrom(words.join(' '));
}

const isHeaderLine = (t) => { const c = cellsOf(t); return c.length >= 2 || t.trim().length <= 40; };
const headKeyOf = (t) => sq(t.replace(/\(?\bcontinued\b\)?/gi, ''));

/**
 * The rent tables: { terms, steps, flags }. A table starts at a heading that names base, minimum, monthly or annual rent (or a
 * rent schedule) within 6 lines above its first row; a row is a line with a period and an amount (rowOf). A table carries onto
 * the next page only when that page repeats the heading line (with or without "(continued)"), otherwise it ends: rows with no
 * heading are left, an honest limit. Units come from the words by the figure or the column heading, never from arithmetic;
 * a $0.00 or abated row is a flag, never a step. "Year n" rows keep their label and no dates (decision 3). Two lease tables
 * that disagree become one ambiguous term and no steps. Arithmetic (monthly x 12 against annual, annual against $/SF) is L1's
 * own check, run in leasestage.js on a scratch abstract.
 * @param {any[]} pages @param {{ docType?: string }} [o]
 */
export function readRentSteps(pages, { docType: type = 'lease' } = {}) {
  const tables = []; const flags = [];
  let open = null;
  for (const p of pages) {
    const L = p.lines.filter((l) => !l.furniture && cleanLine(p, l).trim());
    const hint = (k) => L.slice(Math.max(0, k - 8), k).map((l) => cleanLine(p, l)).join(' ');
    const isRow = L.map((l, k) => !!rowOf(p, l, hint(k)));
    for (let i = 0; i < L.length; i++) {
      if (!isRow[i]) continue;
      let j = i; while (j < L.length && isRow[j]) j += 1;
      const above = [];
      for (let k = i - 1; k >= 0 && above.length < 6; k--) above.unshift({ k, t: cleanLine(p, L[k]) });
      const head = [...above].reverse().find((x) => RENT_HEAD.test(x.t) && !isHeaderLine(x.t)) || above.find((x) => RENT_HEAD.test(x.t));
      const first = i; i = j - 1;
      if (!head) continue;
      const headers = above.filter((x) => x.k > head.k - 1 && isHeaderLine(x.t)).slice(-3).map((x) => x.t);
      const key = headKeyOf(head.t);
      let tab = open && open.page === p.n - 1 && open.key === key ? open : null;
      if (!tab) { tab = { page: p.n, key, headText: head.t.trim(), p, headAt: L[head.k].s, rows: [], steps: [] }; tables.push(tab); }
      tab.page = p.n; open = tab;
      const cells = headers.map(cellsOf);
      for (let r = first; r < j; r++) tab.rows.push({ row: rowOf(p, L[r], hint(r)), p, cells, headers });
    }
  }
  for (const tab of tables) {
    for (const { row, p, cells, headers } of tab.rows) {
      if (row.abated || (row.amounts.length && row.amounts.every((a) => a.type === 'amount' && a.value === 0))) {
        const months = row.mFrom !== null ? ` in months ${row.mFrom}-${row.mTo}` : row.label ? ` in ${row.label}` : '';
        flags.push({ text: cut(`Rent abated${months}, p.${p.n}: record it as free rent`, 200), page: p.n, kind: 'abated' });
      } else tab.steps.push(stepCand(p, row, cells, headers, tab.headText));
    }
  }
  const steps = []; const terms = [];
  const withSteps = tables.filter((t) => t.steps.length);
  const sigOf = (t) => t.steps.map((s) => `${s.label}|${JSON.stringify(s.amounts)}|${s.mFrom}-${s.mTo}|${s.from}|${s.to}`).join(';');
  if (type !== 'amendment') {
    if (withSteps.length) {
      const sigs = new Set(withSteps.map(sigOf));
      const t0 = withSteps[0];
      if (sigs.size === 1) { // identical tables collapse; any difference is shown, never merged (the rent would be counted twice)
        terms.push(termCand(t0, true, 'found', ''));
        const all = withSteps.flatMap((t) => t.steps);
        const seen = new Set();
        for (const s of all) { const k = `${s.label}|${JSON.stringify(s.amounts)}`; if (seen.has(k)) continue; seen.add(k); steps.push({ ...s, termIndex: 0 }); }
      } else {
        const pgs = [...new Set(withSteps.map((t) => t.page))].map((n) => `p.${n}`).join(' and ');
        const show = (t) => `p.${t.page}: ${t.steps.slice(0, 2).map((s) => `${s.label} ${Object.entries(s.amounts).map(([u, v]) => `${v} ${u}`).join(', ')}`).join('; ')}`;
        terms.push(termCand(t0, true, 'ambiguous', cut(`Two rent tables disagree (${pgs}): ${withSteps.map(show).join(' / ')}`, 300)));
      }
    }
  } else {
    withSteps.slice(0, 5).forEach((t, idx) => {
      const before = t.p.text.slice(Math.max(0, t.headAt - 900), t.headAt + t.headText.length + 20);
      const ext = /\bextend|extension|extended\s+term/i.test(before);
      terms.push(termCand(t, false, ext ? 'found' : 'ambiguous', ext ? '' : 'For the original term or an extension?', ext ? 'extension' : null));
      steps.push(...t.steps.map((s) => ({ ...s, termIndex: idx })));
    });
  }
  return { terms, steps, flags };
}

function termCand(tab, lease, status, note, kind = lease ? 'initial' : null) {
  const q = makeQuote(tab.p, tab.headAt, tab.headText.length);
  return {
    kind, label: lease ? 'Original term' : kind === 'extension' ? 'Extension' : 'Amendment rent', status, note, page: tab.p.n, start: q.start, len: q.len, quote: q.quote,
    confidence: confOf(tab.p), supersedes: !lease, ocrConf: tab.p.source === 'ocr' && Number.isFinite(tab.p.conf) ? Math.round(tab.p.conf) : null,
  };
}

function stepCand(p, row, cells, headers, headText) {
  const amounts = {}; const notes = []; const figures = []; const units = [];
  let status = 'found';
  const headBasis = unitFrom(`${headText} ${headers.join(' ')}`).basis;
  let basis = null;
  row.amounts.forEach((a, k) => {
    figures.push(a.token);
    if (a.type === 'bad') { status = 'ambiguous'; notes.push(`${a.token} has a letter in it, so it is not read as an amount`); return; }
    if (a.value === 0) { status = 'ambiguous'; notes.push('a $0.00 figure among other amounts'); return; }
    const u = unitOfAmount(a, row, cells, k + 1 < row.amounts.length ? row.amounts[k + 1].index : Infinity);
    if (u.basis && !basis) basis = u.basis;
    if (!u.unit) { status = 'ambiguous'; notes.push(`${a.token}: ${u.unsure ? 'a $/SF figure with no month or year word' : 'no unit (month, year or $/SF) is stated'}`); return; }
    if (amounts[u.unit] !== undefined) { status = 'ambiguous'; notes.push(`two ${u.unit} figures on one row`); return; }
    amounts[u.unit] = a.value; units.push(u.unit);
  });
  if (!basis && units.some((u) => u.startsWith('psf'))) basis = headBasis;
  const q = makeQuote(p, row.line.s, row.line.e - row.line.s, row.text.trim());
  const psfWords = /per\s+(?:rentable\s+)?(?:square|sq|sf|rsf)|\/\s*sf|psf/i.test(`${row.text} ${headers.join(' ')}`);
  const choices = status === 'ambiguous' && !units.length && row.amounts.length ? { figures, units: psfWords ? ['psf_year', 'psf_month'] : ['month', 'year'] } : null;
  const conf = confOf(p, { y2: row.y2 });
  return {
    label: row.label, mFrom: row.mFrom, mTo: row.mTo, from: row.from, to: row.to, amounts, primary: units.length === 1 && status === 'found' ? units[0] : null, basis: basis || null,
    status, note: notes.join('; '), figures, page: p.n, start: q.start, len: q.len, quote: q.ok ? q.quote : '', confidence: conf, ...(choices ? { choices } : {}),
    sources: [{ page: p.n, start: q.start, len: q.len, quote: q.ok ? q.quote : '', confidence: conf, from: 'body', hit: row.text.trim(), ocrConf: p.source === 'ocr' && Number.isFinite(p.conf) ? Math.round(p.conf) : null }],
  };
}

/* ------------------------------------------------------------ the whole lease */

const KEYS = ['landlord', 'tenant', 'tradeName', 'guarantor', 'suite', 'floor', 'sf', 'proRata', 'leaseDate', 'possession', 'commencement', 'rentCommencement', 'expiration', 'termMonths', 'termText', 'deposit', 'depositForm', 'escalation'];
/** The fields the reader reads (each gets a candidate in a lease's Result, a "not found" one included). */
export const READ_KEYS = Object.freeze(KEYS);
const NAMES = new Set(['landlord', 'tenant', 'guarantor', 'tradeName']);
/** What makes two readings "the same": a party by its name before the first comma, text by its letters and digits, the rest as it is. */
const sig = (c) => JSON.stringify([NAMES.has(c.key) ? sq(String(c.value ?? '').split(',')[0]) : typeof c.value === 'string' ? sq(c.value) : c.value, c.rel ? sq(c.rel) : '', c.unit, c.basis]);
const RANK = { high: 3, medium: 2, low: 1 };
const PRIORITY = { basic: 0, preamble: 1, body: 2 };
const srcOf = (c) => ({ page: c.page, start: c.start, len: c.len, quote: c.quote, hit: c.hit || '', confidence: c.confidence, from: c.from, ocrConf: c.ocrConf ?? null });
const where = (c) => (c.from === 'basic' ? 'The basic terms page' : c.from === 'preamble' ? 'The opening paragraph' : 'The text');
const says = (c) => `${where(c)} says ${c.status === 'ambiguous' ? `something unclear (${c.note})` : c.rel ? `“${c.rel}”` : c.value === null ? 'nothing readable' : c.value}, p.${c.page}`;

/**
 * Settle the hits for one key into one candidate: found when every reading agrees (up to 3 sources, the best confidence),
 * ambiguous when they differ or any is unclear (every source named, nothing picked), not-found with the pages looked at when none.
 */
function settle(key, all, range) {
  const seen = new Set();
  const hits = all.filter((h) => { const k = `${h.page}|${h.quote}|${sig(h)}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const good = hits.filter((h) => h.status !== 'not-found');
  if (!good.length) {
    const bad = hits.find((h) => h.status === 'not-found');
    return { key, value: null, unit: null, basis: null, rel: '', status: 'not-found', confidence: 'low', note: bad ? bad.note : range, from: 'body', page: null, start: null, len: 0, quote: '', sources: [], ocrConf: null };
  }
  const groups = [];
  for (const h of good.filter((x) => x.status === 'found')) { const g = groups.find((x) => sig(x[0]) === sig(h)); if (g) g.push(h); else groups.push([h]); }
  const unclear = good.filter((h) => h.status === 'ambiguous');
  if (groups.length === 1 && !unclear.length) {
    const g = groups[0].sort((a, b) => PRIORITY[a.from] - PRIORITY[b.from]);
    const best = [...g].sort((a, b) => RANK[b.confidence] - RANK[a.confidence])[0];
    return { ...g[0], confidence: best.confidence, note: [...new Set(g.map((h) => h.note).filter(Boolean))].join('; '), sources: g.slice(0, 3).map(srcOf) };
  }
  const named = [...groups.map((g) => g[0]), ...unclear];
  return { ...good[0], value: null, basis: null, rel: '', status: 'ambiguous', note: cut(named.map(says).join('; '), 300), confidence: 'low', sources: named.slice(0, 3).map(srcOf) };
}

/** An amendment's effective date: "effective as of <date>", "Effective Date: <date>" or "dated as of <date>". */
export function readEffective(pages) {
  const f = { key: 'effective', kind: 'date' };
  const hits = [];
  for (const p of pages.slice(0, 3)) for (const re of [/\beffective\s+(?:as\s+of|on)\s+/gi, /\beffective\s+date\s*[:.-]?\s*(?:is\s+|shall\s+be\s+)?/gi, /\bdated\s+as\s+of\s+/gi]) {
    for (const m of p.clean.matchAll(re)) {
      const c = dateCand(p, f, m.index + m[0].length, windowAfter(p, m.index + m[0].length, null), 'body', false);
      if (c) hits.push(c);
    }
  }
  return hits;
}

/**
 * Read a lease (or amendment) page model into a Result: { docType, ask, sections, terms, cands, steps, flags, effective, pages,
 * warnings }. `as` forces the type when the broker answered "lease or amendment?". A summary writes nothing; "other" asks.
 * @param {any[]} pages @param {{ name?: string, as?: 'lease' | 'amendment' | null }} [o]
 */
export function readLease(pages, { name = '', as = null } = {}) {
  const info = pageInfo(pages);
  const dt = as ? { type: as, ask: [] } : docType(pages, name);
  const poor = info.filter((x) => x.poor).map((x) => x.n);
  const result = { docType: dt.type, ask: dt.ask, sections: [], terms: [], cands: [], steps: [], flags: [], effective: null, pages: info, warnings: [] };
  if (dt.type === 'summary') { result.warnings.push('This looks like a lease summary, not the lease. Its values are someone’s reading, so add the lease itself.'); return result; }
  if (dt.type === 'other') return result;
  const lease = dt.type !== 'amendment';
  if (poor.length) { result.flags.push({ text: cut(`Pages ${ranges(poor)} read poorly by OCR (confidence under ${POOR_CONF}): check every value from them against the page`, 200), page: poor[0], kind: 'poor' }); result.warnings.push(`Pages ${ranges(poor)} read poorly`); }
  const defs = findDefinedTerms(pages);
  const basic = findBasicTerms(pages, defs);
  result.sections = findHeadings(pages);
  const hits = [...readParties(pages, { basic }), ...readPremises(pages, { basic }), ...readTerm(pages, { basic }), ...readDeposit(pages, { basic }), ...readEscalation(pages)];
  if (basic) for (const h of hits) if (h.from === 'body' && [basic.page, ...basic.extra.map((x) => x.page)].includes(h.page) && /^\s*[A-Z][A-Za-z' /&-]{2,40}?\s*[:.]\s+\S/.test(h.quote)) h.from = 'basic';
  const range = `Not found in pages 1–${pages.length} (${pages.length} read, ${poor.length} poor)`;
  for (const key of KEYS) {
    let hs = hits.filter((h) => h.key === key);
    if (key === 'sf') {
      // basis comes from the adjacent words only: usable is a flag, never the square feet; gross leasable area always asks (decision 4)
      const usable = hs.filter((h) => h.basis === 'usable');
      for (const h of usable) result.flags.push({ text: cut(`Usable area ${h.value} SF, p.${h.page}: not used as the square feet`, 200), page: h.page, kind: 'usable' });
      hs = hs.filter((h) => h.basis !== 'usable');
      const gla = hs.filter((h) => h.gla);
      if (gla.length) {
        const choices = [...new Map(hs.map((h) => { const basis = h.gla ? 'gross' : h.basis; return [`${h.value}|${basis}`, { label: h.gla ? 'Gross' : basis || 'basis not stated', value: h.value, basis }]; })).values()];
        const note = cut(`${hs.map((h) => `${h.value} SF${h.gla ? ' of gross leasable area' : h.basis ? ` ${h.basis}` : ''}, p.${h.page}`).join('; ')}: rentable or gross?`, 300);
        result.cands.push({ ...gla[0], value: null, basis: null, status: 'ambiguous', note, confidence: 'low', choices, sources: hs.slice(0, 3).map(srcOf) });
        continue;
      }
    }
    if (!hs.length && !lease) continue;
    result.cands.push(settle(key, hs, range));
  }
  const rent = readRentSteps(pages, { docType: dt.type });
  result.terms = rent.terms; result.steps = rent.steps; result.flags.push(...rent.flags);
  if (!lease) {
    const eff = readEffective(pages);
    const real = [...new Map(eff.filter((h) => h.status === 'found').map((h) => [h.value, h])).values()];
    result.effective = real.length === 1 && eff.every((h) => h.status === 'found' || h.value === real[0].value) ? { iso: real[0].value, page: real[0].page, quote: real[0].quote, confidence: real[0].confidence }
      : { iso: null, page: eff[0] ? eff[0].page : null, quote: eff[0] ? eff[0].quote : '', confidence: 'low', note: eff.length ? 'The effective date could not be read as one date' : 'No effective date was found' };
  }
  const dedup = new Set();
  result.flags = result.flags.filter((f) => !dedup.has(f.text) && dedup.add(f.text));
  return result;
}

/** "3, 4, 5, 9" as "3–5, 9". */
export function ranges(ns) {
  const out = [];
  for (const n of [...ns].sort((a, b) => a - b)) { const last = out[out.length - 1]; if (last && n === last[1] + 1) last[1] = n; else out.push([n, n]); }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
}
