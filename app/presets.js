/* presets.js -- import and export presets for the broker's OWN exports from a CRM, a deal system or a property-management
 * system, as CSV or Excel: people, companies, deals and tenant lists. A preset is a list of Monal fields and the common
 * column words each is known by ("First Name", "Account", "Close Date"); it is not any vendor's file layout, and nothing
 * here knows one. Pure: grids in, proposed records out (the To file inbox files them; inboxstore.js), and records in,
 * CSV text out. Nothing is fetched or stored (importui.js draws it and keeps the column mapping).
 *
 * Rules (docs/proposals/connectivity-and-market-data.md, K4):
 *  - A blank is blank, never zero. A date the file does not make clear (3/4/2027 could be either order) is left blank
 *    and counted, never guessed. A deal's amount is kept as the file wrote it, in the deal's notes, and is never the price.
 *  - A column is never guessed when two headings claim one field: the later one is left unused and the page says so.
 *  - Text that reads like an instruction is kept as text and flagged; it is never acted on.
 *  - Re-importing the same file: a stable id column (or this app's own id) finds the record again; without one the inbox's
 *    match rules do. A row that changes nothing is counted and not proposed.
 *  - Export leaves out every confidential deal, its tasks and its contacts. */

import { PRODUCT } from './brand.js';
import { cell } from './exporters.js';
import { looksLikeInstruction } from './docfacts.js';
import { nameKey, isOrg } from './inbox.js';
import { CONTACT_ROLES, STAGES } from './pipeline.js';

export const MAX_COLS = 80;
export const MAX_ROWS = 5000;
const LEN = 160;

const clip = (v, n = LEN) => (v === null || v === undefined || typeof v === 'object' ? '' : String(v).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n));
/** A heading as compared: Unicode-normalised, lower case, "&" as "and", every run of other characters one space. */
export const norm = (s) => String(s ?? '').slice(0, LEN).normalize('NFKC').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const F = (id, label, syn) => ({ id, label, syn: syn.map(norm) });
const ID = F('ext', 'Id in the source system (a stable id)', ['id', 'record id', 'external id', 'contact id', 'person id', 'account id', 'company id', 'deal id', 'opportunity id', 'tenant id', 'unique id', 'guid']);
const OWN = F('monalId', `${PRODUCT} ID`, [`${PRODUCT} id`]);
const EMAIL = F('email', 'Email', ['email', 'e mail', 'email address', 'primary email', 'work email', 'business email']);
const PHONE = F('phone', 'Phone', ['phone', 'phone number', 'work phone', 'business phone', 'direct', 'direct phone', 'telephone', 'tel', 'main phone', 'office phone']);
const NOTES = F('notes', 'Notes', ['notes', 'note', 'description', 'comments']);

/** The presets. `needs` lists fields of which at least one must be mapped; `kind` is what a row becomes. */
export const PRESETS = Object.freeze([
  { id: 'people', label: 'People', kind: 'contact', noun: 'contact', needs: ['name', 'first', 'last', 'email'], fields: [
    F('first', 'First name', ['first name', 'firstname', 'given name', 'first']),
    F('last', 'Last name', ['last name', 'lastname', 'surname', 'family name', 'last']),
    F('name', 'Full name', ['name', 'full name', 'contact name', 'contact', 'display name']),
    F('company', 'Company', ['company', 'company name', 'account', 'account name', 'organization', 'organisation', 'organization name', 'employer', 'firm']),
    F('role', 'Role', ['role', 'contact role', 'relationship', 'contact type', 'type']),
    F('jobtitle', 'Job title', ['title', 'job title', 'position']),
    EMAIL, PHONE,
    F('mobile', 'Mobile phone', ['mobile', 'mobile phone', 'cell', 'cell phone', 'mobile number']),
    NOTES, ID, OWN] },
  { id: 'companies', label: 'Companies', kind: 'contact', noun: 'company', needs: ['name'], fields: [
    F('name', 'Company name', ['name', 'company', 'company name', 'account', 'account name', 'organization', 'organisation', 'organization name']),
    PHONE, EMAIL, NOTES, ID, OWN] },
  { id: 'deals', label: 'Deals and pipeline', kind: 'deal', noun: 'deal', needs: ['name', 'address'], fields: [
    F('name', 'Deal name', ['deal name', 'opportunity name', 'opportunity', 'deal', 'name', 'title', 'deal title', 'project', 'property', 'property name']),
    F('address', 'Property address', ['address', 'property address', 'street address', 'street']),
    F('stage', 'Stage', ['stage', 'deal stage', 'pipeline stage', 'status', 'phase']),
    F('amount', 'Amount (kept as written, never the price)', ['amount', 'deal amount', 'value', 'deal value', 'price', 'asking price', 'expected revenue', 'deal size']),
    F('close', 'Close date', ['close date', 'expected close date', 'closing date', 'expected closing', 'estimated close', 'closing']),
    F('company', 'Account or company (kept in the notes)', ['account', 'account name', 'company', 'organization']),
    ID, OWN] },
  { id: 'tenants', label: 'Tenant list', kind: 'contact', noun: 'tenant', needs: ['tenant', 'contactName'], fields: [
    F('tenant', 'Tenant (business)', ['tenant', 'tenant name', 'lessee', 'occupant', 'business name', 'company', 'dba', 'resident']),
    F('contactName', 'Contact person', ['contact', 'contact name', 'primary contact', 'name']),
    F('suite', 'Suite or unit', ['suite', 'unit', 'space', 'unit number', 'suite number', 'unit no']),
    F('leaseStart', 'Lease start', ['lease start', 'lease from', 'commencement', 'lease start date', 'start date']),
    F('leaseEnd', 'Lease end', ['lease end', 'lease expiration', 'lease expires', 'expiration', 'expiration date', 'lease to', 'lease end date', 'expiry']),
    EMAIL, PHONE, ID, OWN] },
]);
export const PRESET_BY_ID = Object.freeze(Object.fromEntries(PRESETS.map((p) => [p.id, p])));
const fieldIds = (p) => new Set(p.fields.map((f) => f.id));

/* -------------------------------------------------------- the heading row */

const text = (v) => typeof v === 'string' && v.trim() !== '' && !/^[\d\s.,$%()-]+$/.test(v.trim());
const lastUsed = (cells) => { let n = cells.length; while (n && (cells[n - 1] === null || cells[n - 1] === undefined || String(cells[n - 1]).trim() === '')) n--; return n; };

/**
 * The heading row of a grid ({ rows: [{ r, cells }] }) for a preset: among the first 15 rows, the one whose headings
 * name the most of the preset's fields (at least 2 text cells). { idx, headers } or { refuse }.
 */
export function findHeader(grid, preset) {
  const rows = grid.rows || [];
  const known = new Set(preset.fields.flatMap((f) => f.syn));
  /** @type {any} */
  let best = null;
  rows.slice(0, 15).forEach((row, idx) => {
    const cs = row.cells.slice(0, lastUsed(row.cells));
    const texts = cs.filter(text);
    if (texts.length < 2) return;
    const hits = texts.filter((t) => known.has(norm(t))).length;
    if (!best || hits > best.hits) best = { idx, hits, cs };
  });
  if (!best) return { refuse: 'No row of column headings was found.' };
  if (best.cs.length > MAX_COLS) return { refuse: `This file has ${best.cs.length} columns; it reads up to ${MAX_COLS}. Remove the extra columns and try again.` };
  const n = rows.length - best.idx - 1;
  if (n > MAX_ROWS) return { refuse: `This file has ${n.toLocaleString('en-US')} rows; it reads up to ${MAX_ROWS.toLocaleString('en-US')}. Split it and import each part.` };
  return { idx: best.idx, headers: best.cs.map((c) => clip(c)), hits: best.hits };
}

/** How well a file's headings fit each preset, best first: lets the page suggest which kind of file this is. */
export function rankPresets(headers) {
  const have = new Set(headers.map(norm));
  return PRESETS.map((p) => ({ id: p.id, hits: p.fields.filter((f) => f.syn.some((s) => have.has(s))).length })).sort((a, b) => b.hits - a.hits);
}

/* -------------------------------------------------------------- the mapping */

/**
 * What each column is, as field ids ('none' = not used), from the headings' words: a remembered layout first (its
 * `columns` by normalised heading). Two headings that claim one field: the first keeps it and `dupes` lists the rest.
 * @returns {{ columns: string[], dupes: number[], how: 'remembered' | 'guess' }}
 */
export function suggestMapping(headers, preset, remembered = null) {
  const ids = fieldIds(preset);
  const memory = remembered && remembered.columns && typeof remembered.columns === 'object' ? remembered.columns : null;
  const columns = headers.map((h) => {
    const k = norm(h);
    if (memory && Object.hasOwn(memory, k)) { const f = memory[k]; return f === 'none' || ids.has(f) ? f : 'none'; }
    const f = preset.fields.find((x) => x.syn.includes(k));
    return f ? f.id : 'none';
  });
  const seen = new Set();
  const dupes = [];
  columns.forEach((f, i) => { if (f === 'none') return; if (seen.has(f)) { columns[i] = 'none'; dupes.push(i); } else seen.add(f); });
  return { columns, dupes, how: memory ? 'remembered' : 'guess' };
}

/** Whether a mapping gives the preset what it needs to make a record. */
export const mappingOk = (preset, columns) => preset.needs.some((n) => columns.includes(n));

/** Stored layouts made safe: { v: 1, items: { [fingerprint]: { preset, columns, stages, source, uses, savedAt } } }, at most 50. */
export function normMappings(raw) {
  const items = {};
  const src = raw && typeof raw === 'object' && raw.items && typeof raw.items === 'object' ? Object.entries(raw.items) : [];
  for (const [fp, r] of src) {
    if (!/^[0-9a-f]{64}$/.test(fp) || !r || typeof r !== 'object' || !Object.hasOwn(PRESET_BY_ID, r.preset)) continue;
    const ids = fieldIds(PRESET_BY_ID[r.preset]);
    const columns = Object.fromEntries(Object.entries(r.columns && typeof r.columns === 'object' ? r.columns : {}).slice(0, MAX_COLS)
      .filter(([k, v]) => typeof k === 'string' && k.length <= LEN && (v === 'none' || ids.has(v))));
    const keys = new Set([...STAGES.map(([k]) => k), 'none']);
    const stages = Object.fromEntries(Object.entries(r.stages && typeof r.stages === 'object' ? r.stages : {}).slice(0, 40).filter(([k, v]) => k.length <= LEN && keys.has(v)));
    const n = (x, hi) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= hi ? Math.floor(x) : 0);
    items[fp] = { preset: r.preset, columns, stages, source: typeof r.source === 'string' ? clip(r.source, 120) : '', uses: n(r.uses, 1e6), savedAt: n(r.savedAt, 1e15) };
  }
  const top = Object.entries(items).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, 50);
  return { v: 1, items: Object.fromEntries(top) };
}

/** The stored layouts with this one added or refreshed (its use count up by one). Returns a new object. */
export function rememberMapping(store, fp, rec, now) {
  const cur = normMappings(store).items;
  return normMappings({ v: 1, items: { ...cur, [fp]: { ...rec, uses: (cur[fp] ? cur[fp].uses : 0) + 1, savedAt: now } } });
}

/** What to store after an import: the headings (normalised) and what each was set to, and the stage answers. */
export const mappingRecord = (preset, headers, columns, stages, source) => ({
  preset: preset.id, columns: Object.fromEntries(headers.map((h, i) => [norm(h), columns[i]]).filter(([k]) => k)), stages: { ...stages }, source: clip(source, 120), uses: 0, savedAt: 0,
});

/* ------------------------------------------------------------------- stages */

const STAGE_WORDS = new Map(Object.entries({
  prospect: ['lead', 'prospect', 'prospecting', 'new', 'qualified', 'target', 'open'],
  listing: ['listing', 'listed', 'pitch', 'listing agreement'],
  underwriting: ['underwriting', 'analysis', 'evaluating', 'under review', 'review', 'valuation'],
  marketing: ['marketing', 'on market', 'active listing', 'marketed', 'campaign', 'proposal'],
  offer: ['offer', 'loi', 'negotiation', 'negotiating', 'bid', 'under offer'],
  contract: ['contract', 'under contract', 'psa', 'contract signed', 'pending'],
  diligence: ['diligence', 'due diligence', 'inspection', 'dd'],
  closed: ['closed', 'closed won', 'won', 'sold', 'completed', 'funded'],
  dead: ['lost', 'closed lost', 'dead', 'passed', 'dropped', 'cancelled', 'canceled', 'withdrawn', 'abandoned'],
}).flatMap(([k, ws]) => ws.map((w) => [w, k])));

/** The Monal stage a source's stage text names: the app's own stage names (as the firm has set them) first, then common words; else null (asked, never guessed). */
export function stageFor(textValue) {
  const t = norm(textValue);
  if (!t) return null;
  for (const [k, label] of STAGES) if (norm(label) === t || k === t) return k;
  return STAGE_WORDS.get(t) || null;
}

/* ------------------------------------------------------------------- values */

/** A date as an ISO day, '' when blank, null when it cannot be read or is ambiguous (3/4/2027: either order) and `order` ('mdy' or 'dmy', the person's answer) does not settle it. */
export function dayOf(v, order = null) {
  const s = clip(v, 40);
  if (!s) return '';
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  let y; let mo; let d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; } else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) {
    const a = +m[1]; const b = +m[2];
    if (a > 12 && b <= 12) { d = a; mo = b; } else if (b > 12 && a <= 12) { mo = a; d = b; } else if (a === b || order === 'mdy') { mo = a; d = b; } else if (order === 'dmy') { d = a; mo = b; } else return null; // either order: not guessed
    y = +m[3];
  } else return null;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}

/** A role word as one of the app's roles, or null. */
const roleOf = (v) => { const t = norm(v); return CONTACT_ROLES.find((r) => norm(r) === t) || null; };

/** A short stable hash of a record's values, so the same row in a re-imported file is recognised. */
export function hashOf(o) {
  let h = 2166136261;
  for (const ch of JSON.stringify(o)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}

/**
 * Proposed records from a grid's data rows. `stages` = { [stage text]: Monal stage key | 'none' } (a deal file's own
 * answers). Returns { cands, skipped: [{ row, why }], blankDates } where each candidate is
 *   contact: { kind: 'contact', name, company, role, email, phone, notes, ext, monalId, suspicious, rowKey, idKey, line }
 *   deal:    { kind: 'deal', name, address, stage (key or null), crmStage, amount (as written), close (ISO or ''), company, ext, monalId, ... }
 * `ext` is { src, id } for the file's own id column; `src` is the preset id, so two systems' ids never collide.
 */
export function readRows(rows, headers, columns, preset, { stages = {}, dateOrder = null, file = '' } = {}) {
  const cands = [];
  const skipped = [];
  let blankDates = 0;
  const col = (f) => columns.indexOf(f);
  rows.forEach((row) => {
    const get = (f) => { const i = col(f); return i < 0 ? '' : clip(row.cells[i]); };
    if (!row.cells.some((c) => clip(c))) return;
    const idv = get('ext');
    // an id belongs to the file and kind it came from: two sheets may number their rows alike
    const ext = idv ? { src: `${preset.id}:${clip(file, 120).toLowerCase()}`, id: idv } : null;
    const monalId = get('monalId');
    /** @type {any} */
    let c;
    if (preset.kind === 'contact') {
      let name; let company = ''; let role = 'Other'; let notes = get('notes');
      if (preset.id === 'companies') { name = get('name'); company = name; }
      else if (preset.id === 'tenants') {
        company = get('tenant'); name = get('contactName') || company;
        const bits = [get('suite') && `Suite ${get('suite')}`, get('leaseStart') && `lease from ${get('leaseStart')}`, get('leaseEnd') && `lease ends ${get('leaseEnd')}`].filter(Boolean);
        if (bits.length) notes = [notes, `Tenant: ${bits.join(', ')}`].filter(Boolean).join('\n');
        role = 'Tenant';
      } else {
        name = get('name') || [get('first'), get('last')].filter(Boolean).join(' ') || '';
        company = get('company');
        if (!name && !get('email') && !company) { skipped.push({ row: row.r, why: 'no name, company or email' }); return; }
        if (!name) name = company || get('email');
        const r = get('role');
        if (r) { role = roleOf(r) || 'Other'; if (!roleOf(r)) notes = [notes, `Role in the file: ${r}`].filter(Boolean).join('\n'); }
        if (get('jobtitle')) notes = [notes, `Title: ${get('jobtitle')}`].filter(Boolean).join('\n');
      }
      if (!name) { skipped.push({ row: row.r, why: 'no name' }); return; }
      const phone = get('phone') || get('mobile');
      const email = get('email');
      c = { kind: 'contact', name, company, role, email, phone, notes: clip(notes, 400), ext, monalId };
      c.suspicious = looksLikeInstruction([name, company, notes].join(' ')) || undefined;
    } else {
      const name = get('name') || get('address');
      if (!name) { skipped.push({ row: row.r, why: 'no deal name or address' }); return; }
      const st = get('stage');
      const stage = st ? ((Object.hasOwn(stages, st) ? (stages[st] === 'none' ? null : stages[st]) : stageFor(st))) : null;
      const close = dayOf(get('close'), dateOrder);
      if (close === null) blankDates += 1;
      c = { kind: 'deal', name, address: get('address'), stage, crmStage: st, amount: get('amount'), close: close || '', company: get('company'), ext, monalId };
      c.suspicious = looksLikeInstruction([name, c.address, st, c.company].join(' ')) || undefined;
    }
    if (c.suspicious === undefined) delete c.suspicious;
    const own = c.kind === 'contact' ? `${nameKey(c.name)}|${c.email.toLowerCase()}|${nameKey(c.company)}` : `${nameKey(c.name)}|${nameKey(c.address)}`;
    c.idKey = ext ? `${ext.src}|x:${ext.id}|${nameKey(c.name)}` : `${preset.id}|${own}`;
    c.rowKey = `${c.idKey}|${hashOf({ ...c, line: undefined })}`;
    c.line = row.r;
    cands.push(c);
  });
  return { cands, skipped, blankDates };
}

/** Whether any close-date cell reads either way round (3/4/2027), so the page must ask. */
export function datesAmbiguous(rows, columns) {
  const idx = columns.map((f, i) => (f === 'close' ? i : -1)).filter((i) => i >= 0);
  return rows.some((r) => idx.some((i) => { const v = clip(r.cells[i]); return v && dayOf(v) === null && dayOf(v, 'mdy') !== null; }));
}

/** The distinct stage texts of a deal file, in order of first use, at most 40. */
export function stageTexts(rows, columns) {
  const i = columns.indexOf('stage');
  if (i < 0) return [];
  const out = [];
  for (const r of rows) { const t = clip(r.cells[i]); if (t && !out.includes(t)) out.push(t); if (out.length >= 40) break; }
  return out;
}

/* ------------------------------------------------------------------- export */

const BOM = '﻿';
const csv = (head, rows) => `${BOM}${[head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
const CONF = (deals) => new Set((deals || []).filter((d) => d && d.confidential).map((d) => d.id));
const nameOfDeal = (deals) => new Map((deals || []).map((d) => [d.id, d.name || (d.figures && d.figures.address) || 'Untitled deal']));
const money = (n) => (typeof n === 'number' && Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : '');

/** Export layouts: `neutral` uses this app's own words; `crm` uses the common column names of the import presets, so a CRM can map them. */
export const LAYOUTS = Object.freeze([['neutral', `${PRODUCT}'s own column names`], ['crm', 'Common CRM column names (First Name, Last Name, Account…)']]);

/** Contacts as CSV. Contacts on a confidential deal are left out; `left` counts them. @returns {{ csv: string, count: number, left: number }} */
export function contactsCsv(contacts, deals, layout = 'neutral') {
  const secret = CONF(deals);
  const names = nameOfDeal(deals);
  const rows = []; let left = 0;
  for (const c of contacts || []) {
    if ((c.dealIds || []).some((id) => secret.has(id))) { left += 1; continue; }
    const linked = (c.dealIds || []).map((id) => names.get(id)).filter(Boolean).join('; ');
    if (layout === 'crm') {
      const org = isOrg(c.name);
      const parts = String(c.name || '').trim().split(/\s+/);
      rows.push([org ? '' : parts[0], org ? c.name : parts.slice(1).join(' '), c.email, c.phone, c.company, c.role, c.notes, c.id]);
    } else rows.push([c.name, c.company, c.role, c.email, c.phone, c.notes, linked, c.id]);
  }
  const head = layout === 'crm' ? ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Role', 'Notes', `${PRODUCT} ID`] : ['Name', 'Company', 'Role', 'Email', 'Phone', 'Notes', 'Deals', `${PRODUCT} ID`];
  return { csv: csv(head, rows), count: rows.length, left };
}

/** Deals as CSV: name, address, stage, asking price, the earliest open closing date. Confidential deals are left out. */
export function dealsCsv(deals, layout = 'neutral', stageLabel = (k) => k) {
  const rows = []; let left = 0;
  for (const d of deals || []) {
    if (d.confidential) { left += 1; continue; }
    const f = d.figures || {};
    const closing = (d.keyDates || []).filter((k) => k.label === 'Closing' && !k.done && /^\d{4}-\d\d-\d\d/.test(String(k.date))).map((k) => String(k.date).slice(0, 10)).sort()[0] || '';
    rows.push([d.name || f.address || '', f.address || '', stageLabel(d.stage), money(f.price), closing, d.id]);
  }
  const head = layout === 'crm' ? ['Deal Name', 'Address', 'Deal Stage', 'Amount', 'Close Date', `${PRODUCT} ID`] : ['Deal', 'Address', 'Stage', 'Asking price', 'Closing date', `${PRODUCT} ID`];
  return { csv: csv(head, rows), count: rows.length, left };
}

/** Tasks as CSV. A task on a confidential deal is left out. */
export function tasksCsv(tasks, deals, contacts, layout = 'neutral') {
  const secret = CONF(deals);
  const names = nameOfDeal(deals);
  const who = new Map((contacts || []).filter((c) => !(c.dealIds || []).some((id) => secret.has(id))).map((c) => [c.id, c.name]));
  const rows = []; let left = 0;
  for (const t of tasks || []) {
    if (t.dealId && secret.has(t.dealId)) { left += 1; continue; }
    const done = layout === 'crm' ? (t.done ? 'Completed' : 'Open') : (t.done ? 'Done' : 'Open');
    rows.push([t.title, t.due || '', done, t.dealId ? names.get(t.dealId) || '' : '', t.contactId ? who.get(t.contactId) || '' : '', t.note || '', t.id]);
  }
  const head = layout === 'crm' ? ['Subject', 'Due Date', 'Status', 'Related Deal', 'Related Contact', 'Description', `${PRODUCT} ID`] : ['Task', 'Due', 'Done', 'Deal', 'Contact', 'Note', `${PRODUCT} ID`];
  return { csv: csv(head, rows), count: rows.length, left };
}
