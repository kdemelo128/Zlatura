/* docindex.js -- a small on-device search index over a deal's document text (assistant release 3).
 *
 * Pages are split into passages that are exact slices of the page text (so a passage is always quoted exactly),
 * and ranked with BM25 over light stems plus real-estate synonym concepts (NOI = net operating income, CAM = common
 * area maintenance, ...). Numbers and dates are normalised with the app's own parsers (kit.js parseNum,
 * dateinput.js parseDateText) so "$4.6M" and "4,600,000", "Mar 31, 2027" and "3/31/2027" meet. Nothing here
 * reads a figure out of a passage (docfacts.js does, and only next to a label); nothing is stored, sent or run:
 * document text is data. Pure, no DOM. */

import { parseNum } from './kit.js';
import { parseDateText } from './dateinput.js';

/** Most characters in one passage; a block longer than this is cut at line ends. */
export const PASSAGE_CHARS = 420;
/** The most pages and passages one deal's index holds (a runaway document cannot grow the session without bound). */
export const MAX_PAGES = 600;
export const MAX_PASSAGES = 20000;

/** Synonym groups: any of the phrases adds the concept token (and the words themselves still count). */
const SYN = {
  noi: ['noi', 'net operating income'],
  cap: ['cap rate', 'capitalization rate', 'cap-rate', 'going-in cap', 'going in cap'],
  cam: ['cam', 'common area maintenance', 'common area expenses', 'common area charges', 'common area costs'],
  ti: ['ti', 'tenant improvements', 'tenant improvement', 'tenant improvement allowance', 'ti allowance'],
  lc: ['lc', 'lcs', 'leasing commissions', 'leasing commission'],
  expire: ['expire', 'expires', 'expired', 'expiring', 'expiration', 'expiry', 'term end', 'end of term', 'lease end', 'lease ends', 'ends on', 'end date', 'termination date', 'lease term ends'],
  escal: ['escalation', 'escalations', 'escalator', 'escalators', 'bump', 'bumps', 'step-up', 'step-ups', 'step up', 'step ups', 'steps', 'annual increase', 'annual increases', 'rent increase', 'rent increases', 'increase', 'increases', 'escalate', 'escalates'],
  sf: ['sf', 'sq ft', 'sq. ft.', 'sqft', 'square feet', 'square foot', 'rsf', 'psf'],
  area: ['rentable area', 'net rentable area', 'nra', 'gla', 'gross leasable area', 'building size', 'building area'],
  renew: ['renewal', 'renewals', 'renew', 'renews', 'option to extend', 'option to renew', 'extension option', 'extension options', 'renewal option', 'renewal options', 'extend'],
  built: ['year built', 'built in', 'constructed in', 'construction year', 'year constructed', 'date of construction', 'year of construction', 'built', 'constructed'],
  price: ['asking price', 'list price', 'offering price', 'purchase price', 'guidance price'],
  occ: ['occupancy', 'occupied', 'percent leased', '% leased', 'leased percentage', 'leased'],
  parking: ['parking', 'parking spaces', 'parking ratio', 'parking stalls'],
  opex: ['operating expenses', 'operating expense', 'opex'],
  tax: ['real estate taxes', 'real estate tax', 'property taxes', 'property tax', 're taxes'],
  rent: ['base rent', 'minimum rent', 'annual rent', 'monthly rent', 'rental rate', 'contract rent'],
  deposit: ['security deposit', 'deposit'],
  zoning: ['zoning', 'zoned'],
  tenant: ['tenant', 'tenants', 'lessee', 'occupant'],
  landlord: ['landlord', 'lessor', 'owner'],
  nnn: ['nnn', 'triple net', 'triple-net', 'net lease'],
};
const SYN_RE = Object.entries(SYN).map(([id, ps]) => [id, new RegExp(`(?<![a-z0-9])(?:${ps.slice().sort((a, b) => b.length - a.length).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|')})(?![a-z0-9])`, 'g')]);

/** Words that carry no topic: question words, fillers and the document nouns a question names the source with. */
const STOP = new Set(('a an the and or of to in on at for from by with without as is are was were be been being am do does did done has have had having it its this that these those there here what whats which who whom whose when where why how ' +
  'say says said tell show give find search look looking mention mentions mentioned state states stated regarding regard information info details detail document documents doc docs om memorandum offering ' +
  'can could would should will shall may might me my our us we you your i any some about please also if then than so such per not no yes does into over under up out off s ' +
  'much many amount number total').split(/\s+/));
/** Words kept but counted for little: they appear in nearly every question about a figure. */
const WEAK = new Set(['charge', 'charg', 'cost', 'fee', 'rate', 'value', 'figure', 'price', 'year']);

const stem = (w) => {
  if (w.length <= 3 || /^\d/.test(w)) return w;
  if (/ies$/.test(w) && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(w)) return w;
  if (/(ches|shes|xes|zes|sses)$/.test(w)) return w.slice(0, -2);
  if (/ments?$/.test(w) && w.length > 8) return w.replace(/ments?$/, '');
  if (/s$/.test(w)) return w.slice(0, -1);
  if (/ing$/.test(w) && w.length > 5) return w.slice(0, -3);
  if (/ed$/.test(w) && w.length > 4) return w.slice(0, -2);
  return w;
};

const DATE_RE = /\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b/g;
const MONEY_RE = /\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|mm|m|b|million|billion|thousand)?\b|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?\s?(?:mm|million|k)\b/g;
const PCT_RE = /\b\d+(?:\.\d+)?\s?%/g;
const money = (s) => parseNum(s.replace(/\s?million/i, 'm').replace(/\s?billion/i, 'b').replace(/\s?thousand/i, 'k'));

/**
 * The tokens of a text: stems, synonym concepts (`~noi`), normalised amounts (`#4600000`), percents (`%7.25`) and
 * days (`@2027-03-31`). Stop words are dropped. `fold` (a question) drops the words a concept already stands for.
 * @param {string} raw @param {{ fold?: boolean }} [opts]
 * @returns {string[]}
 */
export function tokens(raw, { fold = false } = {}) {
  let text = String(raw ?? '').toLowerCase().replace(/[’‘]/g, '\'').replace(/'s\b/g, '').replace(/\bt[- ]?12\b/g, 't12');
  const out = [];
  // a question's words that make up a concept are one idea with it (not weighed twice); a passage keeps both
  for (const [id, re] of SYN_RE) { re.lastIndex = 0; if (re.test(text)) { out.push(`~${id}`); if (fold) text = text.replace(re, ' '); } }
  // an amount, percent or day is one token, and its digits are not also words
  text = text.replace(DATE_RE, (m) => { const iso = parseDateText(m); if (!iso) return m; out.push(`@${iso}`, iso.slice(0, 4)); return ' '; });
  text = text.replace(MONEY_RE, (m) => { const v = money(m); if (v === null || v < 1000) return m; out.push(`#${v}`); return ' '; });
  text = text.replace(PCT_RE, (m) => { const v = parseNum(m); if (v === null) return m; out.push(`%${v}`); return ' '; });
  for (const w of text.match(/[a-z0-9]+(?:[-.][a-z0-9]+)*/g) || []) {
    const plain = w.replace(/\./g, '');
    for (const part of plain.split('-')) {
      if (!part || STOP.has(part)) continue;
      if (/^\d+$/.test(part) && part.length === 1) continue;
      out.push(stem(part));
    }
  }
  return out;
}

/**
 * Split a page into passages that are exact slices of it: blocks at blank lines, and a block longer than
 * PASSAGE_CHARS is cut at line ends (a table's rows stay whole). Returns [{ start, end }] over the page text.
 * @param {string} page
 */
export function passageSpans(page) {
  const spans = [];
  const text = String(page ?? '');
  const lines = [];
  for (const m of text.matchAll(/[^\n]*\n?/g)) { if (m[0] === '' && m.index >= text.length) break; lines.push({ s: m.index, e: m.index + m[0].length, blank: !m[0].trim() }); }
  let cur = null;
  let carry = -1;   // where a short heading began: it goes with the block under it
  let nLines = 0;
  const flush = () => {
    if (!cur) return;
    const one = nLines === 1 && cur.end - cur.start <= 60 && !/[.:;,]\s*$/.test(text.slice(cur.start, cur.end));
    if (one) { if (carry < 0) carry = cur.start; } else { if (carry >= 0 && !one) cur.start = carry; carry = -1; spans.push(cur); }
    cur = null; nLines = 0;
  };
  for (const ln of lines) {
    if (ln.blank) { flush(); continue; }
    if (cur && ln.e - (carry >= 0 ? carry : cur.start) > PASSAGE_CHARS) flush();
    if (!cur) cur = { start: ln.s, end: ln.e }; else cur.end = ln.e;
    nLines += 1;
  }
  flush();
  if (carry >= 0) spans.push({ start: carry, end: Math.max(...lines.filter((l) => !l.blank).map((l) => l.e)) });
  // a single very long line (a Word paragraph) is cut at sentence ends or spaces
  const out = [];
  for (const sp of spans) {
    if (sp.end - sp.start <= PASSAGE_CHARS * 1.5) { out.push(sp); continue; }
    let s = sp.start;
    while (s < sp.end) {
      let e = Math.min(sp.end, s + PASSAGE_CHARS);
      if (e < sp.end) {
        const sentence = text.lastIndexOf('. ', e - 2); const space = text.lastIndexOf(' ', e - 1);
        if (sentence > s + PASSAGE_CHARS / 2) e = sentence + 2; else if (space > s + PASSAGE_CHARS / 2) e = space + 1;
      }
      out.push({ start: s, end: e });
      s = e;
    }
  }
  return out.filter((x) => text.slice(x.start, x.end).trim().length > 0);
}

/**
 * Build the index of a deal's documents.
 * @param {{ id: string, name: string, role?: string | null, pages: string[] }[]} docs
 * @returns {Index}
 *
 * @typedef {{ doc: number, page: number, start: number, end: number, tf: Map<string, number>, len: number }} Passage
 * @typedef {{ docs: { id: string, name: string, role: string | null, pages: string[] }[], passages: Passage[], df: Map<string, number>, avg: number }} Index
 */
export function buildIndex(docs) {
  /** @type {Passage[]} */ const passages = [];
  const df = new Map();
  let total = 0; let pageCount = 0;
  const kept = [];
  for (const d of docs) {
    const pages = (d.pages || []).map((p) => String(p ?? ''));
    kept.push({ id: d.id, name: d.name, role: d.role || null, pages });
    const di = kept.length - 1;
    for (let pi = 0; pi < pages.length && pageCount < MAX_PAGES; pi++) {
      pageCount += 1;
      for (const sp of passageSpans(pages[pi])) {
        if (passages.length >= MAX_PASSAGES) break;
        const toks = tokens(pages[pi].slice(sp.start, sp.end));
        if (!toks.length) continue;
        const tf = new Map();
        for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
        for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
        passages.push({ doc: di, page: pi + 1, start: sp.start, end: sp.end, tf, len: toks.length });
        total += toks.length;
      }
    }
  }
  return { docs: kept, passages, df, avg: passages.length ? total / passages.length : 1 };
}

/** The text of one passage, exactly as it is on the page. @param {Index} ix @param {Passage} p */
export const passageText = (ix, p) => ix.docs[p.doc].pages[p.page - 1].slice(p.start, p.end).replace(/^\n+|\s+$/g, '');

const K1 = 1.2; const B = 0.5;
const idfOf = (ix, t) => { const n = ix.df.get(t) || 0; return Math.log(1 + (ix.passages.length - n + 0.5) / (n + 0.5)); };

const ROLE_WORDS = { om: 'om', offering: 'om', memorandum: 'om', lease: 'lease', leases: 'lease', t12: 't12', statement: 't12', rentroll: 'rentroll' };
const wordsOf = (name) => String(name).toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/t-12/g, 't12').split(/[^a-z0-9]+/).filter((w) => w.length >= 2);

/**
 * The documents a question names ("in the lease", "does the memo say", "the T-12 shows", "per the OM"), as
 * { docs: Set, drop: words that named them } or null when it names none that exist: then every document is searched.
 * A name inside a longer phrase ("the Harbor Bakery lease") is a tenant, not a document, and scopes nothing.
 * @param {string} query @param {Index} ix
 */
export function scopeOf(query, ix) {
  const q = String(query).toLowerCase().replace(/t-12/g, 't12').replace(/rent ?roll/g, 'rentroll').replace(/offering memorandum/g, 'om').replace(/operating statement/g, 't12');
  const named = new Set();
  const A = /\b(?:in|from|per|under|on|according to|using)\s+(?:the\s+|this\s+|that\s+|my\s+)?([a-z0-9]+)\b(?=\s*(?:,|\?|$|about|for|regarding|say|state|show))/g;
  const B = /\b(?:does|do|did|what does|what do)\s+(?:the|this|that|my)\s+([a-z0-9]+)\s+(?:say|says|said|state|states|mention|mentions|cover|covers|include|includes|show|shows)\b/g;
  for (const re of [A, B]) for (const m of q.matchAll(re)) named.add(m[1]);
  const docs = new Set(); const drop = [];
  ix.docs.forEach((d, i) => {
    const ws = wordsOf(d.name);
    for (const w of named) if ((ROLE_WORDS[w] && d.role === ROLE_WORDS[w]) || (w.length >= 3 && ws.includes(w))) { docs.add(i); if (!drop.includes(w)) drop.push(w); }
  });
  return docs.size ? { docs, drop } : null;
}

/**
 * Rank the passages for a question. Returns { hits, terms, missing, covered }: up to `limit` hits { passage, score,
 * coverage, text }, best first, only passages that carry at least half the weight of the question's topic words;
 * `missing` lists the topic words no document uses at all. An empty `hits` means the documents do not answer.
 * @param {Index} ix @param {string} query @param {{ limit?: number, scope?: Set<number> | null }} [opts]
 */
export function search(ix, query, { limit = 3, scope } = {}) {
  const named = scope === undefined ? scopeOf(query, ix) : scope ? { docs: scope, drop: [] } : null;
  const sc = named ? named.docs : null;
  const dropped = new Set((named ? named.drop : []).flatMap((w) => tokens(w)));
  const terms = [...new Set(tokens(query, { fold: true }))].filter((t) => !dropped.has(t));
  // "~" concepts are counted once; their words (stems) are counted too but a concept and its own words are one idea
  const weights = new Map();
  for (const t of terms) {
    let w = idfOf(ix, t);
    if (!ix.df.get(t)) w = Math.log(1 + (ix.passages.length + 0.5) / 0.5);   // never seen: the rarest there is
    if (WEAK.has(t)) w *= 0.3;
    weights.set(t, w);
  }
  // a plain word that is part of a concept the question names (cam, noi) is not weighed twice
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  const missing = terms.filter((t) => !ix.df.get(t) && !/^[~#%@]/.test(t) && !WEAK.has(t));
  if (!terms.length || !ix.passages.length || total === 0) return { hits: [], terms, missing, covered: 0 };
  /** @type {{ passage: Passage, score: number, coverage: number, text: string }[]} */
  const scored = [];
  for (const p of ix.passages) {
    if (sc && !sc.has(p.doc)) continue;
    let score = 0; let got = 0;
    for (const [t, w] of weights) {
      const f = p.tf.get(t);
      if (!f) continue;
      got += w;
      score += w * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (p.len / ix.avg))));
    }
    if (!got) continue;
    scored.push({ passage: p, score, coverage: got / total, text: '' });
  }
  scored.sort((a, b) => b.score - a.score || a.passage.page - b.passage.page);
  // the best passages, but not three from one page: a second from the same page or document counts for less, so
  // the lease's clause and the OM's summary of it can both be shown
  const top = scored.length ? scored[0].score : 0;
  const pool = scored.filter((x) => x.coverage >= 0.5 && x.score >= top * 0.5).slice(0, 24);
  const hits = [];
  while (hits.length < limit && pool.length) {
    let best = 0; let bestV = -1;
    pool.forEach((x, i) => {
      const samePage = hits.filter((h) => h.passage.doc === x.passage.doc && h.passage.page === x.passage.page).length;
      const sameDoc = hits.filter((h) => h.passage.doc === x.passage.doc).length;
      const v = x.score * 0.6 ** samePage * 0.85 ** sameDoc;
      if (v > bestV) { bestV = v; best = i; }
    });
    const [x] = pool.splice(best, 1);
    x.text = passageText(ix, x.passage);
    hits.push(x);
  }
  return { hits, terms, missing, covered: scored.length ? scored[0].coverage : 0 };
}
