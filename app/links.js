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

/** mailto: for an address; "?", "&" and "#" in it are escaped, so it cannot add a cc, a bcc, a subject or a body. '' without an "@". */
export function mailtoHref(email) {
  const s = String(email ?? '').trim();
  const at = s.lastIndexOf('@');
  if (at < 1 || at === s.length - 1) return '';
  return safeHref(`mailto:${encodeURIComponent(s.slice(0, at))}@${encodeURIComponent(s.slice(at + 1))}`);
}

/** tel: for a number: digits and a leading "+" only. '' when no digit is left. */
export function telHref(phone) {
  const d = String(phone ?? '').replace(/[^\d+]/g, '');
  return /\d/.test(d) ? safeHref(`tel:${d}`) : '';
}
