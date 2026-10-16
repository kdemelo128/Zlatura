/* textfile.js -- a text file's bytes as text, in the encoding it was saved in
 * (F2). Every file the app reads as text comes through here: a CSV (T-12 and
 * rent roll), a document sent to AI, a backup, a project and a template
 * package. Blob.text() always reads UTF-8, so an older Excel or Windows CSV
 * (Windows-1252) lost its accents and curly quotes to "�".
 *
 * The rule, in order, and never a silent guess:
 *  - a byte-order mark says the encoding: UTF-8, UTF-16 LE or UTF-16 BE;
 *  - bytes that are valid UTF-8 are UTF-8 (plain ASCII is the same in both).
 *    A few of them could also be Windows-1252: a capital accented letter then
 *    punctuation ("JOSÉ’S" in Windows-1252 is the bytes of "JOSɒS" in UTF-8).
 *    Then the note shows both readings of those words;
 *  - bytes that are not valid UTF-8 are Windows-1252, and the note says so,
 *    with the words to check; unless more of them are valid UTF-8 than not
 *    (a UTF-8 file with a stray byte): then they are UTF-8, and the note
 *    counts the characters that could not be read and gives their lines. */

/** Bytes 0x81, 0x8D, 0x8F, 0x90 and 0x9D have no Windows-1252 character: a file holding them may be in another encoding. */
const UNDEFINED_1252 = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);
const BAD = '�';
/**
 * Windows-1252 as the WHATWG Encoding Standard defines it: Latin-1, but for
 * 0x80 to 0x9F, which hold typographic marks (the five it leaves undefined
 * read as the control character of that number). Kept here because Node's
 * TextDecoder reads those 32 bytes as Latin-1; browsers follow the standard.
 */
const HIGH_1252 = '\u20AC\u0081\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u008D\u017D\u008F\u0090\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u009D\u017E\u0178';
const decode1252 = (b) => { let s = ''; for (const x of b) s += x >= 0x80 && x < 0xa0 ? HIGH_1252[x - 0x80] : String.fromCharCode(x); return s; };
/** How a piece of UTF-8 text would read had its bytes been Windows-1252. */
const as1252 = (s) => decode1252(new TextEncoder().encode(s));

/**
 * The bytes' multi-byte UTF-8 sequences: `valid` well-formed ones, `invalid`
 * bytes above 0x7F in none, and `lookalike`, the well-formed two-byte ones
 * that start 0xC6 to 0xDF (U+0180 to U+07FF), whose Windows-1252 reading is a
 * capital accented letter then punctuation, as a Windows-1252 name can be.
 */
function scan(b) {
  let valid = 0; let invalid = 0; let lookalike = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c < 0x80) continue;
    const len = c >= 0xc2 && c <= 0xdf ? 2 : c >= 0xe0 && c <= 0xef ? 3 : c >= 0xf0 && c <= 0xf4 ? 4 : 0;
    let ok = len > 0 && i + len <= b.length;
    for (let k = 1; ok && k < len; k++) if ((b[i + k] & 0xc0) !== 0x80) ok = false;
    // the shortest form only: no surrogates, nothing past U+10FFFF, no overlong three- or four-byte forms
    if (ok && len === 3) ok = !(c === 0xe0 && b[i + 1] < 0xa0) && !(c === 0xed && b[i + 1] >= 0xa0);
    if (ok && len === 4) ok = !(c === 0xf0 && b[i + 1] < 0x90) && !(c === 0xf4 && b[i + 1] >= 0x90);
    if (!ok) { invalid++; continue; }
    valid++;
    if (len === 2 && c >= 0xc6) lookalike++;
    i += len - 1;
  }
  return { valid, invalid, lookalike };
}

/** Up to three different words with a letter and a character outside plain ASCII (and passing `keep`), for the broker to check. */
function samples(text, keep = (w) => true) {
  const out = [];
  for (const m of text.matchAll(/[^\s,;"]*[^\x00-\x7f][^\s,;"]*/g)) {
    const w = m[0].replace(/^[()[\]'.:]+|[()[\]'.:]+$/g, '');
    if (/\p{L}/u.test(w) && keep(w) && !out.includes(w)) out.push(w);
    if (out.length === 3) break;
  }
  return out;
}

/** The 1-based lines of the text that hold `ch`, at most five. */
function linesWith(text, ch) {
  const out = [];
  text.split(/\r\n|\r|\n/).forEach((l, i) => { if (out.length < 5 && l.includes(ch)) out.push(i + 1); });
  return out;
}

/**
 * The text of a file's bytes: { text, encoding, note }. `encoding` is
 * 'utf-8', 'utf-16le', 'utf-16be' or 'windows-1252'. `note` is null when
 * nothing needs checking, and otherwise says which encoding was used and what to check.
 * @param {Uint8Array | ArrayBuffer} bytes
 * @returns {{ text: string, encoding: string, note: string | null }}
 */
export function decodeText(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0xff && b[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), encoding: 'utf-16le', note: null };
  if (b[0] === 0xfe && b[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), encoding: 'utf-16be', note: null };
  const bom = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
  const body = bom ? b.subarray(3) : b;
  const { valid, invalid, lookalike } = scan(body);
  if (!invalid) {
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(body);
    if (bom || !lookalike) return { text, encoding: 'utf-8', note: null };
    const words = samples(text, (w) => /[ƀ-߿]/.test(w));
    return {
      text, encoding: 'utf-8',
      note: `Read as UTF-8, but ${lookalike} character${lookalike === 1 ? '' : 's'} could also be Windows-1252 (an older Excel or Windows format). Check which is right: ${words.map((w) => `“${w}” or “${as1252(w)}”`).join(', ')}. If it’s the second, save the file as “CSV UTF-8” and import it again.`,
    };
  }
  if (bom || valid > invalid) {
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(body);
    const bad = [...text].filter((c) => c === BAD).length;
    const at = linesWith(text, BAD);
    return {
      text, encoding: 'utf-8',
      note: `Read as UTF-8, but the file mixes encodings: ${bad} character${bad === 1 ? '' : 's'} could not be read and show${bad === 1 ? 's' : ''} as “${BAD}” (line${at.length === 1 ? '' : 's'} ${at.join(', ')}${bad > at.length && at.length === 5 ? ' and more' : ''}). Check those, or save the file again as “CSV UTF-8” and import it again.`,
    };
  }
  const text = decode1252(body);
  const odd = [...body].filter((x) => UNDEFINED_1252.has(x)).length;
  const words = samples(text);
  return {
    text, encoding: 'windows-1252',
    note: `Read as Windows-1252 (an older Excel or Windows format), because the file isn’t UTF-8.${words.length ? ` Check that these read right: ${words.join(', ')}.` : ''}${odd ? ` ${odd} character${odd === 1 ? ' has' : 's have'} no Windows-1252 meaning, so the file may be in another encoding (such as Mac Roman): save it as “CSV UTF-8” to be sure.` : ''}`,
  };
}

/** A file's text and what was read: decodeText() of its bytes. */
export async function readText(file) {
  return decodeText(new Uint8Array(await file.arrayBuffer()));
}
