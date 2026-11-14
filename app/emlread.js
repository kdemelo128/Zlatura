/* emlread.js -- an email file (.eml, RFC 5322 with MIME) read for what a broker logs: who it was from and to, the subject
 * and date, a short preview of the text, any calendar invite inside it, and the attachments. Pure: bytes in, plain records
 * out; no library, nothing fetched or stored.
 *
 * Handled: folded headers; encoded words in headers (=?UTF-8?B?..?=, =?ISO-8859-1?Q?..?=); address lists with quoted names
 * and groups; multipart (nested); base64 and quoted-printable bodies; charsets the browser's TextDecoder knows (an unknown
 * one is read as UTF-8 and the replaced characters are visible, never silently dropped); text/calendar parts.
 * Caps: 25 MB a file, 40 parts, 6 levels of nesting, 20 attachments, 25 people. */

export const MAX_BYTES = 25e6;
export const MAX_PARTS = 40;
export const MAX_DEPTH = 6;
export const MAX_ATTACH = 20;
export const MAX_PEOPLE = 25;

/** Bytes as a string of one character per byte (so a body is only decoded once its charset is known). */
function binary(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, /** @type {any} */ (bytes.subarray(i, i + 32768)));
  return s;
}
const toBytes = (bin) => { const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i) & 255; return b; };
/** A binary string decoded as `charset` (the label of an encoding), else UTF-8. */
function decode(bin, charset) {
  let label = String(charset || 'utf-8').trim().toLowerCase().replace(/^"|"$/g, '');
  if (label === 'us-ascii' || label === 'ascii') label = 'utf-8';
  let dec;
  try { dec = new TextDecoder(label); } catch { dec = new TextDecoder('utf-8'); }
  return dec.decode(toBytes(bin));
}

/** Quoted-printable to a binary string (soft line breaks removed). */
export function qpDecode(s) {
  return String(s).replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function b64Decode(s) {
  try { return atob(String(s).replace(/[^A-Za-z0-9+/=]/g, '')); } catch { return ''; }
}

/** Header text with its encoded words decoded; whitespace between two encoded words is dropped (RFC 2047). */
export function decodeWords(s, fromBinary = false) {
  const text = fromBinary ? decode(String(s), 'utf-8') : String(s);
  return text.replace(/(=\?[^?\s]+\?[bBqQ]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[bBqQ]\?)/g, '$1').replace(/=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g, (_, cs, enc, data) => {
    const bin = enc.toLowerCase() === 'b' ? b64Decode(data) : qpDecode(data.replace(/_/g, ' '));
    return decode(bin, cs.replace(/\*.*$/, ''));
  });
}

/** Headers and body of one part, from a binary string: { headers: { lower-name: [raw values] }, body }. */
function split(bin) {
  const m = /\r?\n\r?\n/.exec(bin);
  const head = m ? bin.slice(0, m.index) : bin;
  const body = m ? bin.slice(m.index + m[0].length) : '';
  const headers = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    (headers[k] ||= []).push(line.slice(i + 1).trim());
  }
  return { headers, body };
}
/** A structured header ("text/plain; charset=utf-8; name=\"a b.pdf\"") as { value, params }. Handles RFC 2231 name*=utf-8''... */
function structured(v) {
  const parts = []; let cur = ''; let q = false;
  for (const c of String(v || '')) { if (c === '"') { q = !q; cur += c; } else if (c === ';' && !q) { parts.push(cur); cur = ''; } else cur += c; }
  parts.push(cur);
  const value = parts.shift().trim().toLowerCase();
  const params = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 1) continue;
    let k = p.slice(0, eq).trim().toLowerCase();
    let val = decode(p.slice(eq + 1).trim().replace(/^"|"$/g, ''), 'utf-8');
    const star = /^([^*]+)\*(\d+)?(\*)?$/.exec(k);
    if (star) {
      k = star[1];
      if (star[3] || star[2] === undefined) { const m = /^([^']*)'[^']*'(.*)$/.exec(val); if (m) val = decode(m[2].replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), m[1] || 'utf-8'); }
    }
    params[k] = (params[k] || '') + val;
  }
  return { value, params };
}

/**
 * An address list as [{ name, email }]: "Jane Roe <jane@x.test>", quoted names with commas, bare addresses, groups. Anything
 * with no "@" is not an address and is dropped.
 */
export function addresses(v, fromBinary = false) {
  const s = fromBinary ? decode(String(v || ''), 'utf-8') : String(v || '');
  const out = [];
  let cur = ''; let q = false; let angle = false;
  const flush = () => {
    const t = cur.trim().replace(/(>)\s*\([^)]*\)\s*$/, '$1'); cur = '';
    if (!t) return;
    const m = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(t);
    let name; let email;
    if (m) { name = m[1].trim().replace(/^"|"$/g, '').replace(/\\(.)/g, '$1'); email = m[2]; } else { const b = /([^\s<>"(),;:]+@[^\s<>"(),;:]+)/.exec(t.replace(/\([^)]*\)/g, '')); if (!b) return; email = b[1]; name = ''; }
    name = decodeWords(name.replace(/^[^:]*:\s*/, '')).replace(/[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/g, ' ').trim();
    out.push({ name: name.slice(0, 90), email: email.toLowerCase() });
  };
  for (const c of s) {
    if (c === '"') { q = !q; cur += c; } else if (c === '<' && !q) { angle = true; cur += c; } else if (c === '>' && !q) { angle = false; cur += c; } else if ((c === ',' || c === ';') && !q && !angle) flush(); else cur += c;
  }
  flush();
  return out;
}

const ENTITY = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
/** Plain text of an HTML body. Tags are stripped until none are left (a nested `<scr<x>ipt>` cannot survive), and the
 * entities are decoded in one pass, so `&amp;lt;` stays the text `&lt;` rather than turning into `<`. */
const textOf = (html) => {
  let s = html, prev;
  do { prev = s; s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' '); } while (s !== prev);
  s = s.replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, '\n');
  do { prev = s; s = s.replace(/<[^>]*>/g, ' '); } while (s !== prev);
  return s.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m, k) => ENTITY[k]).replace(/[ \t]+/g, ' ');
};

/**
 * Read an email file. Returns { subject, date (ISO text or ''), instant (ms or null), from, to, cc, replyTo, text (plain
 * text, the first 4000 characters), calendars: [text], attachments: [{ name, type, size, bytes }], notes: [words] } or
 * { error } when it is not an email file. A "Date:" header that cannot be read gives instant null, never today.
 * @param {Uint8Array} bytes
 */
export function readEmail(bytes) {
  if (!(bytes instanceof Uint8Array)) return { error: 'That is not an email file.' };
  if (bytes.length > MAX_BYTES) return { error: `That email is ${Math.round(bytes.length / 1e6)} MB; the most read is ${MAX_BYTES / 1e6} MB.` };
  const top = split(binary(bytes));
  if (!top.headers.from && !top.headers.subject && !top.headers.date && !top.headers.to) return { error: 'That file has no email headers (From, To, Subject or Date), so it is not read as an email.' };
  const notes = [];
  const calendars = []; const attachments = []; let plain = ''; let html = '';
  let parts = 0;
  const visit = (part, depth) => {
    if (parts >= MAX_PARTS) { if (!notes.includes('Only the first 40 parts of this email were read.')) notes.push('Only the first 40 parts of this email were read.'); return; }
    parts += 1;
    const ct = structured((part.headers['content-type'] || ['text/plain'])[0]);
    const cd = structured((part.headers['content-disposition'] || [''])[0]);
    if (ct.value.startsWith('multipart/') && ct.params.boundary) {
      if (depth >= MAX_DEPTH) { notes.push('A part nested too deeply was not read.'); return; }
      const b = ct.params.boundary;
      const chunks = part.body.split(new RegExp(`\\r?\\n?--${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*\\r?\\n?`)).slice(1);
      for (const c of chunks) { if (!c.trim()) continue; visit(split(c.replace(/^\r?\n/, '')), depth + 1); }
      return;
    }
    const enc = ((part.headers['content-transfer-encoding'] || ['7bit'])[0] || '').toLowerCase();
    const bin = enc === 'base64' ? b64Decode(part.body) : enc === 'quoted-printable' ? qpDecode(part.body) : part.body;
    const name = decodeWords(cd.params.filename || ct.params.name || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').slice(0, 120);
    const isText = ct.value === 'text/plain' || ct.value === 'text/html';
    const attach = cd.value === 'attachment' || (!!name && !isText && ct.value !== 'text/calendar');
    if (ct.value === 'text/calendar' && cd.value !== 'attachment') { calendars.push(decode(bin, ct.params.charset)); return; }
    if (attach) {
      // a logo or picture embedded in the message body (inline, with a Content-ID) is not an attachment
      if (cd.value === 'inline' && part.headers['content-id'] && ct.value.startsWith('image/')) return;
      if (/\.ics$/i.test(name) || ct.value === 'text/calendar') { calendars.push(decode(bin, ct.params.charset)); return; }
      if (attachments.length >= MAX_ATTACH) { if (!notes.includes('Only the first 20 attachments are listed.')) notes.push('Only the first 20 attachments are listed.'); return; }
      attachments.push({ name: name || `attachment-${attachments.length + 1}`, type: ct.value, size: bin.length, bytes: toBytes(bin) });
      return;
    }
    if (ct.value === 'text/plain') plain += `${plain ? '\n' : ''}${decode(bin, ct.params.charset)}`;
    else if (ct.value === 'text/html') html += `${html ? '\n' : ''}${decode(bin, ct.params.charset)}`;
  };
  visit(top, 0);
  const h = top.headers;
  const dateText = h.date ? decodeWords(h.date[0], true).replace(/\s*\([^)]*\)\s*$/, '') : '';
  const t = dateText ? Date.parse(dateText) : NaN;
  const people = (k) => addresses((h[k] || []).join(', '), true);
  return {
    subject: decodeWords((h.subject || [''])[0], true).replace(/[\u0000-\u001f‪-‮⁦-⁩]/g, ' ').trim().slice(0, 200),
    messageId: decodeWords((h['message-id'] || [''])[0], true).replace(/[<>\s]/g, '').slice(0, 200),
    date: dateText, instant: Number.isNaN(t) ? null : t,
    from: people('from'), to: people('to'), cc: people('cc'), replyTo: people('reply-to'),
    text: (plain || textOf(html)).replace(/\r\n?/g, '\n').slice(0, 4000), calendars, attachments, notes,
  };
}
