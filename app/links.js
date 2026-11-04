/* links.js -- the one gate for a link built from a value. A value that came from a person or a file never decides
 * the scheme: safeHref lets only http, https, mailto and tel through, so "javascript:", "data:", "vbscript:" and the
 * rest come back as '' (no link). tests/links.test.js; the source scan in tests/dom-sinks.test.js lists every place a
 * href is set. */
export const SAFE_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

/** The URL as the browser will read it, or '' when it is not absolute or its scheme is not on the list. */
export function safeHref(url) {
  try {
    const u = new URL(String(url ?? '').trim());
    return SAFE_SCHEMES.includes(u.protocol) ? u.href : '';
  } catch { return ''; }
}

/** mailto: for an address. A pasted leading "mailto:" is dropped; text with whitespace, a comma or semicolon, angle brackets or a control character is not an address and gets no link; "?", "&" and "#" are escaped, so it cannot add a cc, a bcc, a subject or a body. '' without an "@". */
export function mailtoHref(email) {
  const s = String(email ?? '').trim().replace(/^mailto:/i, '').trim();
  if (/[\s,;<>\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(s)) return '';
  const at = s.lastIndexOf('@');
  if (at < 1 || at === s.length - 1) return '';
  return safeHref(`mailto:${encodeURIComponent(s.slice(0, at))}@${encodeURIComponent(s.slice(at + 1))}`);
}

/** tel: for a number: digits, and a "+" only when it is the first character. '' when no digit is left. */
export function telHref(phone) {
  const s = String(phone ?? '').trim();
  const d = s.replace(/\D/g, '');
  return d ? safeHref(`tel:${s.startsWith('+') ? '+' : ''}${d}`) : '';
}
