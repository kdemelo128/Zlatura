/* assistantact.js -- Monal, the on-device assistant: the things it can DO (release 2).
 *
 * Understanding a request (`understandAction`) and turning it into a preview (`previewFor`): a before/after list
 * the person reads and confirms. Nothing here writes anything; the writes are made by assistantui.js through the
 * app's own paths (dealui.js assistantApply, crm.js) after an explicit yes, and each can be undone.
 *
 * Rules that hold for every action:
 *   - money needs a k, m or b, a $ sign or commas: a bare number is asked about, never guessed;
 *   - a percent needs a % sign or the word percent: a bare number, or "points", is asked about;
 *   - text from a deal's notes or a document is never read here: only what the person typed in this request;
 *   - a figure the broker typed is shown first, as the old value, before it is replaced.
 * Pure, no DOM. */

import { parseNum, parsePct, money0, pct, int, times } from './kit.js';
import { runScenario, scenarioAnswers } from './deal.js';
import { toCents } from './engine/money.js';
import { DEAL_INPUTS } from './dealfields.js';
import { STAGES, CONTACT_ROLES } from './pipeline.js';
import { dueFrom } from './assistant.js';

const ok = (x) => typeof x === 'number' && Number.isFinite(x);
const LABEL = Object.fromEntries(DEAL_INPUTS.map((f) => [f.key, f.label]));
const result = (kind, lines, more = {}) => ({ kind, lines, items: [], cites: [], blanks: [], suggest: [], ...more });
const refuse = (lines, more = {}) => result('refuse', Array.isArray(lines) ? lines : [lines], more);
const day = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** The deal figures a request may set, how each is read, and the words that name it. */
const FIELDS = [
  { key: 'gpr', kind: 'money', re: 'gross potential rent|gpr' },
  { key: 'gross', kind: 'money', re: 'gross income|egi|effective gross income' },
  { key: 'price', kind: 'money', re: '(?:asking |list(?:ing)? |purchase )?price|asking' },
  { key: 'noi', kind: 'money', re: 'noi' },
  { key: 'cap', kind: 'pct', re: 'cap rate|cap' },
  { key: 'occ', kind: 'pct', re: 'occupancy|occupied' },
  { key: 'taxes', kind: 'money', re: '(?:real estate |re |property )?taxes' },
  { key: 'opex', kind: 'money', re: 'operating expenses|opex|expenses' },
  { key: 'bsf', kind: 'int', re: 'building (?:size|sf)|rentable (?:size|sf)|building' },
  { key: 'units', kind: 'int', re: '(?:unit count|units|number of units)' },
];
const lower = (raw) => String(raw ?? '').toLowerCase().replace(/[’‘]/g, '\'').replace(/[“”]/g, '"')
  .replace(/\bmillion\b/g, 'm').replace(/\bthousand\b/g, 'k').replace(/square f(ee|oo)t|sq\.? ?ft\.?/g, 'sf').replace(/\s+/g, ' ').trim().replace(/[?!.]+$/, '');

/** A money amount as typed. { value } | { bare } (no k, m, b, $ or commas: ask) | { bad }. Whole text must be the amount. */
export function strictMoney(s) {
  const t = String(s ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(\$)?(\d[\d,]*(?:\.\d+)?)(k|mm|m|b)?$/.exec(t);
  if (!m) return { bad: true };
  if (m[2].includes(',') && !/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(m[2])) return { bad: true };
  const marked = !!m[3] || (!!m[1] && Number(m[2].replace(/,/g, '')) >= 1000) || (m[2].includes(',') && Number(m[2].replace(/,/g, '')) >= 1000);
  if (!marked) return { bare: String(s).trim() };
  const v = parseNum(`${m[2]}${m[3] || ''}`);
  return v === null ? { bad: true } : { value: toCents(v) };
}
/** A percent as typed. { value } | { bare } (no % or "percent") | { points } | { bad }. */
export function strictPct(s) {
  const t = String(s ?? '').trim().toLowerCase();
  if (/(points?|pts?|bps|basis)/.test(t)) return { points: t };
  const m = /^(\d+(?:\.\d+)?)\s?(%|percent|pct)?$/.exec(t);
  if (!m) return { bad: true };
  if (!m[2]) return { bare: t };
  return { value: parsePct(`${m[1]}%`) };
}

/** @type {[string, RegExp][]} */
const stageWords = [
  ['offer', /^(offer|loi|offer \/ loi|offer and loi|letter of intent)$/], ['contract', /^(under contract|contract|in contract|psa)$/],
  ['diligence', /^(due diligence|diligence|dd)$/], ['dead', /^(lost|passed|pass|dead|lost or passed|killed)$/], ['closed', /^(closed|closing|close)$/],
];
/** The stage key a phrase names, by key, label or common name. Null when none. */
export function stageKey(phrase) {
  const t = String(phrase ?? '').toLowerCase().replace(/^(the |a )/, '').replace(/\s*stage$/, '').trim();
  for (const [k, l] of STAGES) if (t === k || t === l.toLowerCase()) return k;
  for (const [k, re] of stageWords) if (re.test(t)) return k;
  return null;
}

/**
 * Understand a request that changes something, or null when it is not one. Order matters: called before the
 * read-only questions, so a verb opens each pattern and "what is the price" can never be read as "set the price".
 * @param {string} raw @param {{ today?: Date }} [opts]
 */
export function understandAction(raw, { today = new Date() } = {}) {
  const orig = String(raw ?? '').trim().replace(/[’‘]/g, '\'');   // same length as typed, so a slice of it is the person's own words
  const t = lower(orig);
  if (!t) return null;
  const polite = '(?:please |can you |could you |i want to |i\'d like to |i need to )?';
  let m;

  // an export the deal screen already offers
  if (new RegExp(`^${polite}(?:export|download|share|start (?:an? )?export|fill|send)\\b`).test(t)) {
    const which = /template/.test(t) ? 'template' : /\b(excel|workbook|spreadsheet|xlsx)\b/.test(t) ? 'excel' : /\b(share|summary|text|copy)\b/.test(t) ? 'share' : null;
    return { id: 'start_export', which };
  }
  // a scenario
  if (new RegExp(`^${polite}(?:create|make|add|build|save|new|run)\\b`).test(t) && /\b(scenario|what ?if)\b/.test(t)) {
    const cap = /(\d+(?:\.\d+)?)\s?(%|percent|pct)?\s?cap\b/.exec(t) || /\bcap(?: rate)?\s?(?:of|at|=|to|is)?\s?(\d+(?:\.\d+)?)\s?(%|percent|pct)?/.exec(t);
    const pm = cap ? null : /(?:\bat\b|\bfor\b|\bof\b|=)\s*(\$?\s?\d[\d,]*(?:\.\d+)?\s?(?:k|mm|m|b)?)$/.exec(t);
    const price = pm ? strictMoney(pm[1]) : null;
    return { id: 'make_scenario', price, cap: cap ? strictPct(`${cap[1]}${cap[2] ? '%' : ''}`) : null, text: t };
  }
  // a contact
  if ((m = new RegExp(`^${polite}(?:add|create|new|save)(?: an?)?(?: new)? contact\\b[\\s:,-]*(.*)$`, 'i').exec(orig))) {
    const rest = orig.replace(/^.*?\bcontact\b[\s:,-]*/i, '');
    const email = (/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(rest) || [null])[0];
    const phone = (/(?:phone|tel|cell|mobile|call)?[\s:]*(\+?\d[\d\s().-]{6,}\d)/i.exec(rest.replace(email || '', '')) || [null, null])[1];
    let s = rest.replace(email || '', ' ').replace(phone || '', ' ').replace(/\b(phone|tel|cell|mobile|email|e-mail)\b\s*:?/gi, ' ');
    const role = CONTACT_ROLES.find((r) => new RegExp(`\\b${r.replace(/[’']/g, '.')}\\b`, 'i').test(s)) || (/\bbroker\b/i.test(s) ? 'Seller’s broker' : null);
    if (role) s = s.replace(new RegExp(`\\b${role.replace(/[’']/g, '.')}\\b`, 'i'), ' ').replace(/\bbroker\b/i, ' ');
    let company = '';
    const co = /(?:\b(?:at|from|with|of)\b|@)\s+([^,;]+)/i.exec(s);
    if (co) { company = co[1].trim(); s = s.replace(co[0], ' '); }
    const name = s.replace(/\b(as|the|a|an|for this deal|for the deal|to this deal)\b/gi, ' ').replace(/[,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { id: 'add_contact', name, role, company, phone: phone ? phone.trim() : '', email: email || '' };
  }
  // a note for the site visit notes: what is written after "note" is the broker's own text, kept as typed
  if ((m = new RegExp(`^${polite}(?:add|append|write|record|log|save|put|make)(?: an?| the)?(?: new)?(?: site[- ]?visit| visit| deal)? notes?\\b(?: to (?:the )?(?:site[- ]?visit )?(?:notes|deal))?\\s*(?:that|:|,|-)?\\s*`, 'i').exec(orig)) || (m = /^note (?:that|:)\s*/i.exec(orig))) {
    const body = orig.slice(m[0].length).trim();
    return { id: 'add_note', text: body };
  }
  // the next step, with a date
  if ((m = new RegExp(`^${polite}(?:set|change|update|move|make|put|add)(?: the| my)?(?: deal'?s)? next step\\b\\s*(?:to|as|is|:|-|=)?\\s*`, 'i').exec(orig))) {
    const body = orig.slice(m[0].length).trim();
    const due = dueFrom(body, today);
    const title = (due ? body.replace(due.words, ' ') : body).replace(/\b(by|on|before|due|for)\s*$/i, '').replace(/\s+/g, ' ').replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '');
    return { id: 'next_step', title: title ? title.charAt(0).toUpperCase() + title.slice(1) : '', due: due ? due.iso : null, dueWords: due ? due.words : null };
  }
  // a stage
  if ((m = new RegExp(`^${polite}(?:(move|advance|push|promote|mark|set|change|put|update)\\b)(?: this| the| my)?(?: deal)?(?: stage| status)?\\s*(?:of the deal)?\\s*(?:to|into|as|=)\\s+(.+)$`).exec(t))
    && (/^(move|advance|push|promote)$/.test(m[1]) || /\b(stage|status)\b/.test(t.slice(0, t.length - m[2].length)) || (m[1] === 'mark' && /\bdeal\b/.test(t)))) {
    return { id: 'set_stage', phrase: m[2], key: stageKey(m[2]) };
  }
  // a figure
  const names = FIELDS.map((f) => `(?<${f.key}>${f.re})`).join('|');
  const verbed = new RegExp(`^${polite}(?:set|change|update|make|put|correct|fix)(?: the| this deal'?s| my)* (?:${names})\\s*(?:to|at|as|=|is|should be)\\s*(.+)$`).exec(t);
  const stated = verbed ? null : new RegExp(`^(?:the |this deal'?s )?(?:${names})\\s*(?:is|=|are)\\s*(.+)$`).exec(t);
  const fm = verbed || stated;
  if (fm) {
    const f = FIELDS.find((x) => fm.groups[x.key]);
    const val = fm[fm.length - 1];
    return { id: 'set_figure', key: f.key, kind: f.kind, text: val };
  }
  return null;
}

/* ------------------------------------------------------------ previews */

/** The deal's figure as the deal holds it, and whether the broker typed it. */
function heldFigure(ctx, key) {
  const v = ctx.deal.figures[key];
  const s = ctx.deal.sources && ctx.deal.sources[key];
  return { value: ok(v) ? v : (v === undefined || v === null || v === '' ? null : v), typed: !!(s && s.hand) };
}
const showKind = (kind, v) => (v === null || v === undefined ? 'blank' : kind === 'money' ? money0(v) : kind === 'pct' ? pct(v, 2) : int(v));
const SAY = { price: 'asking price', noi: 'NOI', cap: 'cap rate', occ: 'occupancy', taxes: 'real estate taxes', opex: 'operating expenses', gross: 'gross income', gpr: 'gross potential rent', bsf: 'building SF', units: 'units' };
const DEAL_LINE = (ctx) => ({ text: `Deal: ${ctx.deal.name || ctx.deal.figures.address || 'the open deal'}` });
const SENT = 'Nothing is saved until you say yes. You can undo it afterwards.';

function setFigure(q, ctx) {
  const f = FIELDS.find((x) => x.key === q.key);
  const noun = SAY[q.key];
  if (f.kind === 'money') {
    const v = strictMoney(q.text);
    if (v.bare !== undefined) return refuse([`I read “${v.bare}” as a number with no k, m or $, so I can’t tell what amount you mean. Write it as $4.6M, 4.6m or $4,600,000. Nothing was changed.`]);
    if (v.bad) return refuse([`I couldn’t read “${q.text}” as one amount of money for ${noun}. Write it as $4.6M or $4,600,000. Nothing was changed.`]);
    if (!(v.value > 0)) return refuse([`The ${noun} has to be more than zero. Nothing was changed.`]);
    return confirmFigure(q, ctx, f, v.value);
  }
  if (f.kind === 'pct') {
    const v = strictPct(q.text);
    if (v.points) return refuse([`“${q.text}” is a number of points, a difference rather than a level. Tell me the ${noun} itself, as a percent, for example 6.5%. Nothing was changed.`]);
    if (v.bare !== undefined) return refuse([`I read “${v.bare}” as a number with no % sign, so I can’t tell if you mean percent. Write it as ${v.bare}% to set the ${noun}. Nothing was changed.`]);
    if (v.bad) return refuse([`I couldn’t read “${q.text}” as a percent for the ${noun}. Write it as 6.5%. Nothing was changed.`]);
    if (!(v.value > 0 && v.value <= (q.key === 'occ' ? 100 : 50))) return refuse([`${v.value}% is not a ${noun} I can set (it has to be above 0% and at most ${q.key === 'occ' ? '100' : '50'}%). Nothing was changed.`]);
    return confirmFigure(q, ctx, f, v.value);
  }
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)\s?(?:sf|units?)?$/.exec(q.text.trim());
  const n = m ? Number(m[1].replace(/,/g, '')) : null;
  if (!ok(n) || n <= 0) return refuse([`I couldn’t read “${q.text}” as a whole number for ${noun}. Nothing was changed.`]);
  return confirmFigure(q, ctx, f, n);
}
function confirmFigure(q, ctx, f, value) {
  const held = heldFigure(ctx, q.key);
  if (held.value === value) return result('answer', [`The ${SAY[q.key]} is already ${showKind(f.kind, value)}. Nothing to change.`]);
  const label = LABEL[q.key] || SAY[q.key];
  const change = { label, before: showKind(f.kind, held.value), after: showKind(f.kind, value), typed: held.typed && held.value !== null };
  const lines = ['I can change this figure. It will be marked as typed by you, as on the deal screen.'];
  if (change.typed) lines.push(`Careful: this replaces a figure you typed, ${change.before}.`);
  lines.push(SENT);
  return result('confirm', lines, { changes: [change], items: [DEAL_LINE(ctx)], action: { kind: 'figure', dealId: ctx.deal.id, key: q.key, before: held.value, value, yes: `Set the ${SAY[q.key]}` } });
}

function setStage(q, ctx) {
  if (!q.key) return refuse([`I don’t know a stage called “${q.phrase}”. The stages are: ${STAGES.map(([, l]) => l).join(', ')}. Nothing was changed.`]);
  const cur = ctx.deal.stage || 'underwriting';
  const name = (k) => (STAGES.find(([x]) => x === k) || [k, k])[1];
  if (cur === q.key) return result('answer', [`The deal is already in ${name(cur)}. Nothing to change.`]);
  return result('confirm', ['I can move the deal to this stage. It is the same change as the stage menu on the deal. ' + SENT],
    { changes: [{ label: 'Stage', before: name(cur), after: name(q.key) }], items: [DEAL_LINE(ctx)], action: { kind: 'stage', dealId: ctx.deal.id, from: cur, to: q.key, yes: `Move to ${name(q.key)}` } });
}

function nextStep(q, ctx) {
  const mine = (ctx.tasks || []).filter((t) => t.dealId === ctx.deal.id && !t.done);
  const first = mine.slice().sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')))[0] || null;
  if (!q.title) {
    // a date only: move the date of the step already set
    if (!q.due) return refuse(['What should the next step be, and by when? For example: “Set the next step: send the LOI by Friday”. Nothing was changed.']);
    if (!first) return refuse(['This deal has no next step to move. Say what it is: “Set the next step: send the LOI by Friday”. Nothing was changed.']);
    if (first.due === q.due) return result('answer', [`That next step is already due ${day(q.due)}. Nothing to change.`]);
    return result('confirm', ['I can change the date of the next step. ' + SENT],
      { changes: [{ label: `Due date of “${first.title}”`, before: first.due ? day(first.due) : 'no date', after: day(q.due), typed: !!first.due }], items: [DEAL_LINE(ctx)],
        action: { kind: 'taskdue', dealId: ctx.deal.id, taskId: first.id, before: first.due || null, due: q.due, yes: 'Change the date' } });
  }
  const changes = [{ label: 'Next step', before: first ? `${first.title}${first.due ? `, due ${day(first.due)}` : ''}` : 'none set', after: q.title }, { label: 'Due', before: '', after: q.due ? day(q.due) : 'no date' }];
  const lines = ['I can add this as the deal’s next step (a task on this deal).'];
  if (first) lines.push('The earlier next step stays on the list; I do not remove it.');
  lines.push(SENT);
  return result('confirm', lines, { changes, items: [DEAL_LINE(ctx)], action: { kind: 'task', dealId: ctx.deal.id, title: q.title, due: q.due, yes: 'Set the next step' } });
}

function addContact(q, ctx) {
  if (!q.name) return refuse(['Whose name? For example: “Add a contact Jane Roe, lender, at Example Bank”. Nothing was changed.']);
  const changes = [{ label: 'Contact', before: 'none', after: q.name }, { label: 'Role', before: '', after: q.role || 'Other' }];
  if (q.company) changes.push({ label: 'Company', before: '', after: q.company });
  if (q.phone) changes.push({ label: 'Phone', before: '', after: q.phone });
  if (q.email) changes.push({ label: 'Email', before: '', after: q.email });
  changes.push({ label: 'Linked to', before: '', after: ctx.deal.name || ctx.deal.figures.address || 'the open deal' });
  return result('confirm', ['I can add this contact and link it to the open deal. ' + SENT], { changes, action: { kind: 'contact', dealId: ctx.deal.id, name: q.name, role: q.role || 'Other', company: q.company, phone: q.phone, email: q.email, yes: 'Add the contact' } });
}

function addNote(q, ctx) {
  const text = String(q.text || '').trim().slice(0, 1000);
  if (!text) return refuse(['What should the note say? For example: “Add a note: owner says the roof was replaced in 2021”. Nothing was changed.']);
  const old = String(ctx.deal.notes || '');
  return result('confirm', ['I can add this to the end of the site visit notes, as written. I do not change what is already there. ' + SENT],
    { changes: [{ label: 'Site visit notes', before: old ? `${old.length} characters already written` : 'empty', after: `adds: ${text}` }], items: [DEAL_LINE(ctx)], action: { kind: 'note', dealId: ctx.deal.id, text, yes: 'Add the note' } });
}

function makeScenario(q, ctx) {
  const { m } = ctx;
  const priceAsked = q.price && !q.price.bad;
  if (q.price && q.price.bare !== undefined) return refuse([`I read “${q.price.bare}” as a number with no k, m or $, so I can’t tell what price you mean. Write it as $4.6M or $4,600,000. Nothing was changed.`]);
  if (q.cap && q.cap.bare !== undefined) return refuse([`I read “${q.cap.bare}” as a number with no % sign, so I can’t tell if it is a cap rate in percent. Write it as 7%. Nothing was changed.`]);
  if (q.cap && q.cap.points) return refuse(['A cap rate in points is a difference, not a level. Give the cap rate itself, for example 7%. Nothing was changed.']);
  let price = null; let name = '';
  if (priceAsked && q.price.value) { price = q.price.value; name = `Price ${money0(price)}`; }
  else if (q.cap && ok(q.cap.value)) {
    if (!(q.cap.value > 0 && q.cap.value <= 50)) return refuse(['I couldn’t read a cap rate between 0% and 50% in that. Nothing was changed.']);
    if (!ok(m.noi) || m.noi <= 0) return refuse(['I can’t work out a price for a cap rate without a positive NOI, and the NOI is blank or not positive. Nothing was changed.']);
    price = toCents(scenarioAnswers(ctx.input, m, {}, { targetCap: q.cap.value }).priceForCap);
    name = `${pct(q.cap.value)} cap`;
  } else return refuse(['At what price or cap rate? For example: “Create a scenario at $4.6M” or “Create a scenario at a 7% cap”. Nothing was changed.']);
  if (!ok(price) || price <= 0) return refuse(['That price can’t be worked out. Nothing was changed.']);
  const run = runScenario(ctx.input, m, { price });
  const changes = [{ label: 'New scenario', before: 'none', after: name }, { label: 'Purchase price in it', before: ok(m.price) ? money0(m.price) : 'blank', after: money0(price) },
    { label: 'Cap rate in it', before: ok(m.cap) ? pct(m.cap) : 'blank', after: ok(run.m.cap) ? pct(run.m.cap) : 'blank' }];
  if (ok(run.m.dscr)) changes.push({ label: 'DSCR in it', before: ok(m.dscr) ? times(m.dscr) : 'blank', after: times(run.m.dscr) });
  return result('confirm', ['I can save this as a scenario on the deal. The deal’s own figures are not changed. ' + SENT], { changes, items: [DEAL_LINE(ctx)], action: { kind: 'scenario', dealId: ctx.deal.id, name, over: { price }, yes: 'Save the scenario' } });
}

const EXPORTS = {
  excel: ['Excel workbook', 'This opens the deal screen’s Excel export, which then offers the file to save or share. Blue figures are inputs and every result is a live formula.'],
  share: ['the five-line summary', 'This opens your device’s share step with the deal screen’s summary text. It leaves this device only if you pick an app there.'],
  template: ['your Excel template', 'This opens the “Fill my Excel template” dialog, where you choose the file and the fields.'],
};
function startExport(q, ctx) {
  if (!q.which) return refuse(['Which export? Excel, share (the five-line summary) or your Excel template. For example: “Export this deal to Excel”.'], { suggest: ['Export this deal to Excel', 'Share this deal', 'Fill my Excel template'] });
  if (q.which === 'share' && ctx.deal.confidential) return refuse(['This deal is marked confidential, so I will not start a share of its summary. Nothing was started. The Excel export and the template stay available: they are marked confidential.']);
  const [what, how] = EXPORTS[q.which];
  return result('confirm', [`I can start the export of ${what}. ${how} Nothing in the deal changes, so there is nothing to undo.`],
    { changes: [{ label: 'Deal data', before: 'unchanged', after: 'unchanged' }, { label: 'Opens', before: '', after: what }], items: [DEAL_LINE(ctx)], action: { kind: 'export', dealId: ctx.deal.id, which: q.which, yes: 'Open it', noUndo: true } });
}

/** Documents are recorded, not stored: "open" means the document's row (its reader or menu) and the page its figures cite. */
function openDoc(q, ctx) {
  const rest = lower(q.rest || '');
  const docs = ctx.deal.docs || [];
  const byName = docs.find((d) => { const n = lower(String(d.name || '').replace(/\.[a-z0-9]{2,4}$/i, '')); return n.length >= 3 && rest.includes(n); });
  const byType = !byName && docs.find((d) => (d.type === 'om' && /\b(om|offering memorandum)\b/.test(rest)) || (d.type === 'rentroll' && /rent roll/.test(rest)) || (d.type === 't12' && /\bt12\b/.test(rest)) || (d.type === 'lease' && /\blease\b/.test(rest)));
  const doc = byName || byType || null;
  const page = q.page || null;
  const cites = page ? Object.entries(ctx.deal.sources || {}).filter(([k, s]) => s && s.page === page && !s.t12 && ctx.deal.figures[k] !== undefined).map(([k]) => k) : [];
  if (!doc && !cites.length) {
    return refuse([page ? `No figure of this deal cites page ${page}, and I can’t tell which document you mean.` : `I can’t find a document of this deal called that.`, 'The deal’s documents are listed on the Documents card.'],
      { blanks: [{ text: docs.length ? `${docs.length} document${docs.length === 1 ? '' : 's'} recorded on this deal.` : 'No documents are recorded on this deal.', go: { section: 'deal-dd' }, label: 'Open Documents' }] });
  }
  if (!page && doc) return result('open', [`Opening ${doc.name}.`], { go: { doc: doc.id } });
  if (!doc && cites.length === 1) return result('open', [`Opening the page that ${LABEL[cites[0]] || cites[0]} cites: page ${page}.`], { go: { source: cites[0] } });
  const r = result('answer', [`${doc ? `${doc.name} is recorded on this deal; the file itself is not kept on this device, so I can’t show page ${page}. ` : ''}These figures cite page ${page}:`], {});
  for (const k of cites) r.items.push({ text: `${LABEL[k] || k}: cited from page ${page}`, go: { source: k }, goLabel: 'Open the page it cites' });
  if (doc) r.items.push({ text: `${doc.name}: its row on the Documents card`, go: { doc: doc.id }, goLabel: 'Open the document' });
  return r;
}

/** The preview (or refusal) for one understood action. @param {any} q @param {any} ctx */
export function previewFor(q, ctx) {
  const f = { set_figure: setFigure, set_stage: setStage, next_step: nextStep, add_contact: addContact, add_note: addNote, make_scenario: makeScenario, start_export: startExport, open_doc: openDoc }[q.id];
  return f(q, ctx);
}
