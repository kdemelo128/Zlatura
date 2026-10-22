/* escape.mjs -- the two escapes the release tools need: text placed inside a regular expression, and text placed
 * in a Markdown table cell. One copy, so a version number or a figure can never act as pattern syntax or break a row. */

/** Every regular-expression special character escaped: the text matches itself and nothing else. */
export const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/** Text safe inside a Markdown table cell: backslashes first, then pipes, and line breaks as spaces. */
export const mdCell = (s) => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
