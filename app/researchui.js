/* researchui.js -- the company research screens: start a brief from sources
 * the broker pastes or uploads (nothing is fetched), read a brief, tick the
 * claims that check out. The rules are in claims.js and research.js; this file
 * only draws them. The AI proposes; a claim is "Confirmed" only when its quote
 * was found in the broker's own source, the words state it, and the broker
 * ticked it. Contact names are never sent: contacts are matched when a brief is
 * drawn, shown as "This may be your contact", and never written. Everything
 * from the model or a source is drawn as text, never as HTML. */

import * as ai from './ai.js';
import { decodeText } from './textfile.js';
import { ready, pdfText, host, STATUS, MAX_SEND, cents } from './aiui.js';
import { listContacts } from './crm.js';
import { editContact } from './dealcrm.js';
import { tickable, matchContacts } from './claims.js';
import { newBrief, requestBody, receive, fail, readBrief, tickClaim, loadBriefs, saveBrief, deleteBrief, expiry, SECTIONS } from './research.js';
import { el, toast, actionSheet, niceDate } from './kit.js';

let api = null;
export function initResearch(compsApi) { api = compsApi; }

const MAX_SOURCES = 10;
const MAX_TEXT = 60000; // the server refuses more text than this in all
const btn = (cls, text, fn) => { const b = el('button', `btn ${cls}`.trim(), text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const countWords = (c) => `${c.confirmed} confirmed, ${plural(c.hypothesis, 'hypothesis', 'hypotheses')}, ${c.refused} refused`;
const changed = () => document.dispatchEvent(new CustomEvent('reviewchange'));
const sha256 = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((x) => x.toString(16).padStart(2, '0')).join('');
const INFERRED = { registered_agent: 'registered agent', mailing_address: 'mailing address', shared_surname: 'shared surname', other: 'other' };

/* ---------------------------------------------------------------- start */

/** The sheet that starts a brief. pre: { company } (the contact's company; never a contact name). */
export async function startResearch(pre = {}) {
  const s = await ready(api);
  if (!s) return;
  const sources = []; // { name, kind, pages, chars, sha256, scanned, texts, doc, bytes }
  const go = btn('', 'Research');
  go.id = 'rs-go';
  go.disabled = true;
  const body = api.sheetOpen({ eyebrow: 'Research', title: 'Research a company', sub: 'From sources you provide. Nothing is fetched from the web.', foot: [go] });
  const form = el('div', 'grid-form');
  form.style.padding = '0';
  const field = (id, label, value, wide) => {
    const f = el('div', `field${wide ? ' wide' : ''}`);
    const l = el('label', null, label);
    const i = el('input');
    i.id = id; i.type = 'text'; i.value = value || ''; i.autocomplete = 'off'; l.htmlFor = id;
    f.append(l, i);
    form.appendChild(f);
    return i;
  };
  const company = field('rs-company', 'Company', pre.company, true);
  const state = field('rs-state', 'State (optional)', pre.state, false);
  body.appendChild(form);
  const list = el('ul', 'ps-list');
  list.id = 'rs-sources';
  const status = el('p', 'hint-sm');
  status.setAttribute('role', 'status');
  const entitled = el('input');
  entitled.type = 'checkbox'; entitled.id = 'rs-entitled';
  const check = () => { go.disabled = !(company.value.trim() && sources.length && entitled.checked); };
  const draw = () => {
    list.textContent = '';
    sources.forEach((src, i) => {
      const li = el('li', null, `${src.name} · ${src.kind === 'pdf' ? plural(src.pages, 'page', 'pages') : `${src.chars} characters`}${src.scanned ? ' · scan: can’t be checked' : ''} `);
      const x = btn('btn-plain btn-sm', 'Remove', () => { sources.splice(i, 1); draw(); check(); });
      x.setAttribute('aria-label', `Remove ${src.name}`);
      li.appendChild(x);
      list.appendChild(li);
    });
    status.textContent = sources.length ? '' : 'Add at least one source.';
  };
  const textChars = () => sources.reduce((t, x) => t + (x.kind === 'pdf' ? 0 : x.chars), 0);
  const add = (src) => {
    if (sources.length >= MAX_SOURCES) { toast(`At most ${MAX_SOURCES} sources in one brief.`); return false; }
    if (src.kind !== 'pdf' && textChars() + src.chars > MAX_TEXT) { toast(`Text sources can come to ${MAX_TEXT.toLocaleString('en-US')} characters in all; this would pass it.`, null, 7000); return false; }
    if (sources.reduce((t, x) => t + x.bytes, 0) + src.bytes > MAX_SEND) { toast(`Send ${Math.round(MAX_SEND / 1048576)} MB or less at a time.`, null, 7000); return false; }
    sources.push(src); draw(); check();
    return true;
  };
  const pick = el('input');
  pick.type = 'file'; pick.id = 'rs-file'; pick.multiple = true; pick.accept = '.pdf,.txt,.md,.csv'; pick.hidden = true;
  pick.addEventListener('change', async () => {
    for (const f of [...pick.files]) {
      if (!/\.(pdf|txt|md|csv)$/i.test(f.name)) { toast(`${f.name}: research reads PDFs and plain text (TXT, MD, CSV).`, null, 7000); continue; }
      const bytes = new Uint8Array(await f.arrayBuffer());
      const name = f.name.slice(0, 200);
      if (/\.pdf$/i.test(f.name)) {
        let pages = [];
        try { pages = await pdfText(api, bytes); } catch { pages = []; }
        const scanned = !pages.some((p) => p && p.trim());
        add({ name, kind: 'pdf', pages: pages.length || null, chars: pages.join('').length, sha256: await sha256(bytes), scanned, texts: scanned ? null : pages, bytes: bytes.length, doc: { name, mediaType: 'application/pdf', data: ai.toBase64(bytes) } });
      } else {
        const { text, note } = decodeText(bytes);
        if (!text.trim()) { toast(`${f.name} is empty.`); continue; }
        if (note) toast(`${f.name}: ${note}`, null, 7000);
        add({ name, kind: 'text', pages: null, chars: text.length, sha256: await sha256(bytes), scanned: false, texts: [text], bytes: bytes.length, doc: { name, mediaType: 'text/plain', text } });
      }
    }
    pick.value = '';
  });
  const addFile = btn('btn-gray', 'Add PDF or text', () => pick.click());
  const paste = el('textarea');
  paste.id = 'rs-paste'; paste.rows = 5; paste.hidden = true; paste.setAttribute('aria-label', 'Pasted text'); paste.placeholder = 'Paste text from a filing, a press release or a web page you have open';
  const pasteAdd = btn('btn-gray btn-sm', 'Add pasted text', async () => {
    const text = paste.value;
    if (!text.trim()) return;
    const n = sources.filter((x) => x.kind === 'pasted').length + 1;
    if (add({ name: `Pasted text ${n}`, kind: 'pasted', pages: null, chars: text.length, sha256: await sha256(new TextEncoder().encode(text)), scanned: false, texts: [text], bytes: new TextEncoder().encode(text).length, doc: { name: `Pasted text ${n}`, mediaType: 'text/plain', text } })) { paste.value = ''; paste.hidden = true; pasteAdd.hidden = true; }
  });
  pasteAdd.id = 'rs-paste-add'; pasteAdd.hidden = true;
  const pasteBtn = btn('btn-gray', 'Paste text', () => { paste.hidden = false; pasteAdd.hidden = false; paste.focus(); });
  const bar = el('div', 'addbar');
  bar.append(addFile, pasteBtn);
  const sec = el('section');
  sec.append(el('h3', null, 'Sources'), bar, pick, paste, pasteAdd, list, status);
  body.appendChild(sec);
  const chk = el('label', 'chk');
  chk.append(entitled, document.createTextNode(' I’m entitled to use these sources'));
  body.append(chk, el('p', 'hint-sm', 'A source is sent in full (a PDF as the whole file) to your firm’s AI server and on to Anthropic’s API. Contact names on this device are not sent.'));
  company.addEventListener('input', check);
  entitled.addEventListener('change', check);
  draw();
  go.addEventListener('click', async () => {
    const subject = { name: company.value.trim(), state: state.value.trim() || null };
    const n = sources.length;
    const v = await actionSheet(`Send ${plural(n, 'source', 'sources')} to ${host(s)}?`, [
      { label: 'Send and research', sub: `The company name${subject.state ? ', the state' : ''} and ${n === 1 ? 'the 1 file or pasted text' : `the ${n} files and pasted texts`}, in full, go to your firm’s AI server and on to Anthropic’s API. Nothing is fetched from the web. Contact names on this device are not sent.`, value: 'yes', primary: true },
    ]);
    if (v !== 'yes') return;
    let brief = newBrief(subject, sources);
    try { await saveBrief(brief); } catch (e) { status.textContent = e.message; return; }
    changed();
    const wait = api.sheetOpen({ eyebrow: 'Research', title: `Researching ${subject.name}`, sub: sources.map((x) => x.name).join(', ') });
    const note = el('p', 'hint', 'This can take a minute. The brief is saved as sending; you can close this and find it under Research briefs.');
    wait.appendChild(note);
    try {
      const out = await ai.research(requestBody(subject, sources.map((x) => x.doc)));
      brief = receive(brief, out, sources.map((x) => x.texts));
      await saveBrief(brief);
      changed();
      if (note.isConnected) openBrief(brief.id); else toast(`Research brief ready: ${subject.name}.`, { label: 'Open', run: () => openBrief(brief.id) });
    } catch (e) {
      brief = fail(brief, e.message);
      await saveBrief(brief).catch(() => {});
      if (note.isConnected) {
        note.remove();
        const p = el('p', 'warn-text', e.message);
        p.id = 'rs-error';
        p.setAttribute('role', 'alert');
        wait.append(p, btn('btn-gray', 'Research briefs', () => openBriefs()));
      } else toast(e.message, null, 7000);
    }
  });
  setTimeout(() => { if (!document.activeElement?.matches('#sheet input, #sheet textarea')) (pre.company ? addFile : company).focus(); }, 50);
}

/* ---------------------------------------------------------------- list */

/**
 * One announcement slot per sheet, kept outside the part that is redrawn so a screen reader hears each change
 * (a live region only speaks when its text changes in place) and focus is not lost: the text is set on the
 * same node, with an Undo button beside it. A toast sits behind a modal sheet, out of reach, hence this.
 */
function announcer() {
  const wrap = el('div');
  const say = el('span', 'undo-text');
  say.setAttribute('role', 'status');
  say.setAttribute('aria-live', 'polite');
  say.setAttribute('aria-atomic', 'true');
  const undo = btn('btn-sm btn-gray', 'Undo');
  undo.hidden = true;
  let fn = null;
  undo.addEventListener('click', () => { const f = fn; fn = null; undo.hidden = true; if (f) f(); });
  wrap.append(say, undo);
  return {
    el: wrap, undo,
    /** Says `text`; with `onUndo` the Undo button shows. */
    tell(text, onUndo = null) { fn = onUndo; undo.hidden = !onUndo; wrap.className = 'undo-bar'; say.textContent = text; },
  };
}

export async function openBriefs() {
  const note = announcer();
  const render = async () => {
    const briefs = (await loadBriefs()).map((b) => readBrief(b)).sort((a, b) => b.createdAt - a.createdAt);
    content.textContent = '';
    if (!briefs.length) content.appendChild(el('p', 'hint', 'No research briefs yet. Start one with “Research a company”.'));
    const ul = el('ul', 'review-list');
    for (const b of briefs) {
      const li = el('li', 'review-item');
      li.dataset.brief = b.id;
      const text = el('div', 'review-text');
      text.append(el('b', null, b.subject.name), el('span', 'sub', ` ${niceDate(b.createdAt)}${b.subject.state ? ` · ${b.subject.state}` : ''}`));
      const tags = el('div', 'ai-tags');
      if (b.status === 'ready') {
        tags.appendChild(el('span', 'chip chip-plain', 'Ready'));
        tags.appendChild(el('span', 'chip chip-plain', countWords(b.counts)));
      } else if (b.status === 'sending') tags.appendChild(el('span', 'chip chip-warn', 'Waiting for the answer'));
      else tags.appendChild(el('span', 'chip chip-bad', 'Failed'));
      text.appendChild(tags);
      if (b.status === 'failed' && b.error) text.appendChild(el('p', 'hint-sm warn-text', b.error));
      text.appendChild(el('p', 'hint-sm', `Kept on this device until ${niceDate(expiry(b))}.`));
      const acts = el('div', 'review-acts');
      const open = btn('btn-sm btn-primary', 'Open', () => openBrief(b.id));
      open.setAttribute('aria-label', `Open the brief on ${b.subject.name}`);
      const del = btn('btn-sm btn-gray', 'Delete', async () => {
        const gone = await removeBrief(b.id);
        if (!gone) return;
        note.tell(`Brief on ${gone.subject.name} deleted.`, async () => {
          await saveBrief(gone).catch((e) => toast(e.message));
          changed();
          note.tell(`Brief on ${gone.subject.name} restored.`);
          await render();
          content.querySelector(`[data-brief="${gone.id}"] .btn-primary`)?.focus();
        });
        await render();
        note.undo.focus(); // the row that held focus is gone
      });
      del.setAttribute('aria-label', `Delete the brief on ${b.subject.name}`);
      acts.append(open, del);
      li.append(text, acts);
      ul.appendChild(li);
    }
    content.appendChild(ul);
    content.appendChild(el('p', 'hint-sm', 'Backups made earlier keep their own copy of a brief you delete here.'));
  };
  const body = api.sheetOpen({ eyebrow: 'Research', title: 'Research briefs', sub: 'Kept on this device for 365 days, then removed.', foot: [btn('', 'Research a company', () => startResearch())] });
  const content = el('div');
  body.append(note.el, content);
  await render();
}

/** Deletes a brief and returns the stored copy, for Undo to put back. */
async function removeBrief(id) {
  const gone = (await loadBriefs()).find((b) => b.id === id);
  if (!gone) return null;
  await deleteBrief(id);
  changed();
  return gone;
}

/* --------------------------------------------------------------- a brief */

function claimRow(c, b, onTick) {
  const row = el('div', 'ai-row rs-claim');
  row.dataset.claim = c.id;
  row.dataset.status = c.status;
  const top = el('label', 'ai-row-top');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.checked = c.status === 'confirmed';
  cb.disabled = !tickable(c);
  top.append(cb, el('span', 'ai-label', c.statement || `${c.subject}: ${c.object}`));
  cb.addEventListener('change', () => onTick(c, cb.checked));
  row.appendChild(top);
  const tags = el('div', 'ai-tags');
  tags.appendChild(c.status === 'confirmed' ? el('span', 'chip chip-good', 'Confirmed')
    : c.status === 'refused' ? el('span', 'chip chip-bad', 'Refused as proof') : el('span', 'chip chip-warn', 'Hypothesis: not confirmed'));
  const k = (c.check && c.check.status) || 'unchecked';
  const [label, cls] = k === 'verified' ? ['Found in your source when checked', 'chip-good'] : STATUS[k] || ['Quote too short to check', 'chip-warn'];
  tags.appendChild(el('span', `chip ${cls}`, label));
  const src = b.sources[c.document];
  tags.appendChild(el('span', 'chip chip-plain', `Source ${c.document + 1}${src ? ` (${src.name})` : ''}${c.page ? ` p.${c.page}` : ''}`));
  if (c.basis === 'inferred') tags.appendChild(el('span', 'chip chip-warn', c.inferredFrom ? `Inferred: ${INFERRED[c.inferredFrom]}` : 'Inferred: not stated outright'));
  if (c.confidence !== 'high') tags.appendChild(el('span', 'chip chip-plain', `${c.confidence} confidence`));
  row.appendChild(tags);
  row.appendChild(el('p', `hint-sm${c.status === 'confirmed' ? '' : ' warn-text'}`, c.status === 'confirmed' ? 'Found in your source when checked, stated outright, and ticked by you.' : c.reason));
  row.appendChild(el('div', 'snippet', c.quote));
  if (c.check && c.check.note && k !== 'verified') row.appendChild(el('p', 'hint-sm', c.check.note));
  for (const a of c.also || []) row.appendChild(el('p', 'hint-sm', `Also in source ${a.document + 1}${a.page ? ` p.${a.page}` : ''}.`));
  return row;
}

/** Opens a brief: ten sections, each claim with its status in words and a tick that saves at once. */
export async function openBrief(id) {
  let raw = (await loadBriefs()).find((b) => b.id === id);
  if (!raw) { toast('That brief is no longer on this device.'); return; }
  const contacts = await listContacts().catch(() => []);
  const open = new Set();
  const note = announcer();
  // load the stored brief fresh, change it, save it, say it, draw it once, and put focus back on the claim's checkbox
  // (the redraw replaces it): so Undo never overwrites a later tick
  const mutate = async (fn, claimId, say, onUndo) => {
    const cur = (await loadBriefs()).find((x) => x.id === id);
    if (!cur) throw new Error('This brief is no longer on this device.');
    raw = fn(cur);
    await saveBrief(raw);
    changed();
    note.tell(say, onUndo);
    render();
    content.querySelector(`[data-claim="${claimId}"] input`)?.focus();
  };
  const onTick = async (c, on) => {
    const what = c.statement || `${c.subject}: ${c.object}`;
    const flip = (to, say, onUndo) => mutate((cur) => tickClaim(cur, c.id, to), c.id, say, onUndo);
    try { await flip(on, on ? `Confirmed: ${what}` : `Unticked: ${what}`, () => flip(!on, `Undone: ${what}`).catch((e) => toast(e.message))); } catch (e) { toast(e.message); render(); }
  };
  const del = btn('btn-gray', 'Delete brief', async () => {
    const gone = await removeBrief(id);
    api.sheetClose();
    if (gone) toast(`Brief on ${gone.subject.name} deleted.`, { label: 'Undo', run: async () => { await saveBrief(gone).catch((e) => toast(e.message)); changed(); } });
  });
  const all = btn('btn-gray', 'All briefs', () => openBriefs());
  const body = api.sheetOpen({ eyebrow: 'Research', title: raw.subject.name, sub: '', foot: [del, all] });
  const content = el('div');
  body.append(note.el, content);
  const render = () => {
    const top = body.scrollTop;
    const b = readBrief(raw);
    const byId = new Map(b.claims.map((c) => [c.id, c]));
    document.getElementById('sheet-sub').textContent = `${b.subject.state ? `${b.subject.state} · ` : ''}${niceDate(b.createdAt)}`;
    content.textContent = '';
    if (b.status !== 'ready') {
      content.appendChild(el('p', `hint${b.status === 'failed' ? ' warn-text' : ''}`, b.status === 'failed' ? (b.error || 'The research failed.') : 'Still waiting for the answer.'));
    }
    const meta = el('p', 'hint-sm', `${b.model ? `Model ${b.model} · ` : ''}${Number.isInteger(b.chargedCents) ? `Cost of this brief: ${cents(b.chargedCents)}` : 'Cost not reported'} · Kept on this device until ${niceDate(expiry(b))}.`);
    meta.id = 'rs-meta';
    content.appendChild(meta);
    if (b.status === 'ready') {
      const tags = el('div', 'ai-tags');
      tags.id = 'rs-counts';
      tags.append(el('span', 'chip chip-good', `${b.counts.confirmed} confirmed`), el('span', 'chip chip-warn', plural(b.counts.hypothesis, 'hypothesis', 'hypotheses')), el('span', 'chip chip-bad', `${b.counts.refused} refused`));
      content.append(tags, el('p', 'hint-sm', 'Confirmed means the quoted words were found in a source you supplied when the answer arrived, they state the point outright, and you ticked it. Nothing is looked up again.'));
    }
    const srcs = el('section');
    srcs.appendChild(el('h3', null, 'Sources'));
    const ul = el('ul', 'ps-list');
    for (const s of b.sources) {
      const li = el('li', null, `Source ${s.index + 1}: ${s.name}${s.kind === 'pdf' && s.pages ? ` · ${plural(s.pages, 'page', 'pages')}` : s.chars ? ` · ${s.chars} characters` : ''} `);
      if (s.scanned) li.appendChild(el('span', 'chip chip-warn', 'Scan: can’t be checked'));
      ul.appendChild(li);
    }
    srcs.appendChild(ul);
    content.appendChild(srcs);
    const matches = matchContacts(b.claims, contacts, b.subject);
    const cMap = new Map(contacts.map((k) => [k.id, k]));
    for (const sec of b.sections) {
      const d = el('details', 'fold rs-sec');
      d.dataset.section = sec.key;
      d.open = open.has(sec.key);
      d.addEventListener('toggle', () => { if (d.open) open.add(sec.key); else open.delete(sec.key); });
      const claims = sec.claimIds.map((x) => byId.get(x)).filter(Boolean);
      const n = sec.key === 'S8' ? new Set(matches.map((m) => m.contactId)).size : sec.key === 'S10' ? b.notChecked.length + b.notes.length : claims.length;
      const sum = el('summary', null, sec.title);
      sum.appendChild(el('span', 'count', plural(n, sec.key === 'S8' ? 'contact' : sec.key === 'S10' ? 'note' : 'claim', sec.key === 'S8' ? 'contacts' : sec.key === 'S10' ? 'notes' : 'claims')));
      d.appendChild(sum);
      const panel = el('div', 'panel');
      if (sec.text && sec.key !== 'S8') {
        panel.appendChild(el('p', 'hint-sm', 'Written by AI from the claims below; only ticked claims are confirmed.'));
        panel.appendChild(el('p', 'rs-text', sec.text));
      }
      if (sec.key === 'S8') {
        // one row per contact, with every reason it matched
        const byContact = new Map();
        for (const m of matches) { if (!cMap.has(m.contactId)) continue; if (!byContact.has(m.contactId)) byContact.set(m.contactId, new Set()); byContact.get(m.contactId).add(m.why); }
        for (const [cid, whys] of byContact) {
          const k = cMap.get(cid);
          const row = el('div', 'ai-row rs-match');
          row.appendChild(el('p', null, `This may be your contact ${k.name}`));
          for (const w of [...whys].slice(0, 3)) row.appendChild(el('p', 'hint-sm', `${w}.`));
          const tg = el('div', 'ai-tags');
          tg.appendChild(el('span', 'chip chip-plain', 'Not saved to the contact'));
          row.appendChild(tg);
          row.appendChild(btn('btn-gray btn-sm', 'Open contact', () => editContact(api, k, [])));
          panel.appendChild(row);
        }
        if (!matches.length) panel.appendChild(el('p', 'hint-sm', 'No contact on this device matches a full name or a company in this brief.'));
      } else if (sec.key === 'S10') {
        if (b.notChecked.length) { const l = el('ul', 'ps-list'); for (const t of b.notChecked) l.appendChild(el('li', null, t)); panel.appendChild(l); }
        if (b.notes.length) { panel.appendChild(el('h3', null, 'Also noted by the reader')); const l = el('ul', 'ps-list'); for (const t of b.notes) l.appendChild(el('li', null, t)); panel.appendChild(l); }
        if (!n) panel.appendChild(el('p', 'hint-sm', 'Nothing was listed.'));
      } else {
        const rows = el('div', 'ai-rows');
        for (const c of claims) rows.appendChild(claimRow(c, b, onTick));
        panel.appendChild(rows);
        if (!claims.length) panel.appendChild(el('p', 'hint-sm', sec.key === 'S9' ? 'Nothing was refused.' : 'Nothing here.'));
      }
      d.appendChild(panel);
      content.appendChild(d);
    }
    body.scrollTop = top;
  };
  render();
}
