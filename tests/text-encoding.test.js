/* F2 (owner, 2026-10-16): a CSV saved by an older Excel or Windows
 * (Windows-1252) reads with its accents and curly quotes, and says how it was
 * read; a UTF-8 CSV reads exactly as before. Before 4.7.15 every file was read
 * as UTF-8 (Blob.text()), so "Café" became "Caf�". Each test below that reads
 * a Windows-1252, mixed or UTF-16 file failed on 4.7.14. Invented fixtures
 * only (tests/fixtures/encoding/). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readGrids } from '../app/sheetread.js';
import { decodeText } from '../app/textfile.js';
import { bestSheet } from '../app/t12.js';

const FIX = new URL('./fixtures/encoding/', import.meta.url);
const bytes = (name) => new Uint8Array(fs.readFileSync(new URL(name, FIX)));
const csv = (b, name = 'invented.csv') => new File([b], name, { type: 'text/csv' });
const noXlsx = () => { throw new Error('a CSV never loads ExcelJS'); };
const cells = (grids) => grids[0].rows.map((r) => r.cells);
const TENANTS = ['Café Lumière', 'O’Brien & Søn Bakery', 'Señor Taco – Plaza Mañana'];

test('a Windows-1252 CSV reads its accented names, curly apostrophe and en dash, and says it was Windows-1252', async () => {
  const g = await readGrids(csv(bytes('rentroll-windows-1252.csv')), noXlsx);
  assert.deepEqual(cells(g).slice(1).map((r) => r[1]), TENANTS, 'was “Caf� Lumi�re”, “O�Brien & S�n Bakery”…');
  assert.equal(g[0].encoding, 'windows-1252');
  assert.equal(g[0].note, 'Read as Windows-1252 (an older Excel or Windows format), because the file isn’t UTF-8. Check that these read right: Café, Lumière, O’Brien.');
});

test('the same rent roll saved as UTF-8 reads exactly as before, with no note', async () => {
  const b = bytes('rentroll-utf8.csv');
  const g = await readGrids(csv(b), noXlsx);
  assert.deepEqual(cells(g).slice(1).map((r) => r[1]), TENANTS);
  assert.equal(g[0].encoding, 'utf-8');
  assert.equal(g[0].note, null);
  // the cells are the ones Blob.text() (the old reading) gives
  const old = (await csv(b).text()).split('\r\n').filter(Boolean).map((l) => l.match(/("[^"]*"|[^,]+)/g).map((x) => x.replace(/^"|"$/g, '')));
  assert.deepEqual(cells(g).map((r) => r.filter((x) => x !== '')), old);
  // and both copies give the same cells
  assert.deepEqual(cells(await readGrids(csv(bytes('rentroll-windows-1252.csv')), noXlsx)), cells(g));
});

test('“CSV UTF-8” from Excel (with a byte-order mark) reads as UTF-8, the mark dropped, no note', async () => {
  const g = await readGrids(csv(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes('rentroll-utf8.csv')])), noXlsx);
  assert.equal(cells(g)[0][0], 'Suite', 'no stray mark before the first heading');
  assert.equal(cells(g)[1][1], 'Café Lumière');
  assert.equal(g[0].note, null);
});

test('a T-12 saved as Windows-1252 keeps its line labels', async () => {
  const t = bestSheet(await readGrids(csv(bytes('t12-windows-1252.csv'), 'invented-t12.csv'), noXlsx), { file: 'invented-t12.csv' });
  const labels = t.lines.map((l) => l.label);
  for (const l of ['Base Rent – Café Lumière', 'CAM Recoveries – O’Brien’s Deli', 'Repairs & Maintenance – Peña Services']) assert.ok(labels.includes(l), `${l} in ${labels.join(' | ')}`);
  assert.equal(t.lines.find((l) => l.label.startsWith('Base Rent')).total, 240000);
});

test('a file that mixes UTF-8 and other bytes is read as UTF-8, and the note counts what could not be read and where', async () => {
  const enc = new TextEncoder();
  const b = new Uint8Array([...enc.encode('Suite,Tenant\n101,Café Lumière\n102,Bistro '), 0xe9, ...enc.encode('t\n')]);
  const g = await readGrids(csv(b), noXlsx);
  assert.equal(cells(g)[1][1], 'Café Lumière', 'the UTF-8 part stays right');
  assert.equal(cells(g)[2][1], 'Bistro �t');
  assert.equal(g[0].encoding, 'utf-8');
  assert.equal(g[0].note, 'Read as UTF-8, but the file mixes encodings: 1 character could not be read and shows as “�” (line 3). Check those, or save the file again as “CSV UTF-8” and import it again.');
});

test('bytes with no Windows-1252 meaning say the file may be in another encoding, and still show the words to check', async () => {
  // Mac Roman writes é as 0x8E: as Windows-1252 that is Ž, and 0x8D (ç in Mac Roman) has no character at all
  const g = await readGrids(csv(new Uint8Array([...new TextEncoder().encode('Suite,Tenant\n101,Caf'), 0x8e, 0x20, 0x46, 0x72, 0x61, 0x8d, 0x61, 0x69, 0x73, 0x0a])), noXlsx);
  assert.equal(g[0].encoding, 'windows-1252');
  assert.match(g[0].note, /Check that these read right: CafŽ, Fra\u008dais\. 1 character has no Windows-1252 meaning, so the file may be in another encoding \(such as Mac Roman\): save it as “CSV UTF-8” to be sure\.$/);
});

test('a UTF-16 CSV (with its byte-order mark) reads as text, not as noise', async () => {
  const s = 'Suite,Tenant\n101,Café Lumière\n';
  const le = new Uint8Array(2 + s.length * 2); le[0] = 0xff; le[1] = 0xfe;
  for (let i = 0; i < s.length; i++) { le[2 + i * 2] = s.charCodeAt(i) & 0xff; le[3 + i * 2] = s.charCodeAt(i) >> 8; }
  const be = new Uint8Array(le.length); be[0] = 0xfe; be[1] = 0xff;
  for (let i = 2; i < le.length; i += 2) { be[i] = le[i + 1]; be[i + 1] = le[i]; }
  for (const b of [le, be]) assert.deepEqual(cells(await readGrids(csv(b), noXlsx)), [['Suite', 'Tenant'], ['101', 'Café Lumière']]);
});

// Windows-1252's 0x80 to 0x9F (the rest is Latin-1), written out here so the test doesn't use the decoder it checks
const HIGH = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';
const BYTE_1252 = new Map(Array.from({ length: 256 }, (_, b) => [b >= 0x80 && b < 0xa0 ? HIGH[b - 0x80] : String.fromCharCode(b), b]));
let seed = 7;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };

test('every valid UTF-8 text decodes to itself with no note', () => {
  // invented strings from plain, accented and typographic characters, and characters outside Windows-1252 (no capital accented letter then punctuation: see the lookalike test)
  const pool = [...'abcXYZ019 ,."\n\r', ...'éèêëñøåçüö’‘“”–—€…™', ...'中ł🏢ŞĀ'];
  for (let k = 0; k < 3000; k++) {
    const s = Array.from({ length: 1 + rnd(40) }, () => pool[rnd(pool.length)]).join('');
    const r = decodeText(new TextEncoder().encode(s));
    assert.deepEqual(r, { text: s, encoding: 'utf-8', note: null }, JSON.stringify(s));
  }
});

test('a Windows-1252 text never reads wrong without a note, but for a lowercase accent then two or three typographic marks', () => {
  const accents = [...'éèêëñøåçüöÉÑ’‘“”–—€…™'];
  let fallbacks = 0; let silent = 0;
  for (let k = 0; k < 3000; k++) {
    const s = Array.from({ length: 1 + rnd(40) }, () => (rnd(3) ? 'abc ,.Z0'[rnd(8)] : accents[rnd(accents.length)])).join('');
    const r = decodeText(Uint8Array.from([...s].map((c) => BYTE_1252.get(c))));
    if (r.encoding === 'windows-1252') { fallbacks++; assert.equal(r.text, s); assert.match(r.note, /^Read as Windows-1252/); continue; }
    if (r.text === s) { assert.equal(r.note, null); continue; } // plain ASCII
    if (r.note) continue; // read as UTF-8, and the note says so
    // the one silent case: its bytes are wholly valid UTF-8 of a kind real UTF-8 files hold (é’’ is the bytes of U+9492)
    silent++;
    assert.match(s, /[à-ï][’‘“”–—€…™]{2}|[ð-ô][’‘“”–—€…™]{3}/, JSON.stringify(s));
  }
  assert.ok(fallbacks > 2000, `${fallbacks} of 3000 read as Windows-1252`);
  assert.ok(silent < 30, `${silent} of 3000 silent`);
});

test('a name like JOSÉ’S, whose Windows-1252 bytes are also valid UTF-8, is read as UTF-8 and the note shows both readings', async () => {
  const s = 'Suite,Tenant\n101,JOSÉ’S TACOS\n';
  const g = await readGrids(csv(Uint8Array.from([...s].map((c) => BYTE_1252.get(c)))), noXlsx);
  assert.equal(cells(g)[1][1], 'JOSɒS TACOS');
  assert.equal(g[0].encoding, 'utf-8');
  assert.equal(g[0].note, 'Read as UTF-8, but 1 character could also be Windows-1252 (an older Excel or Windows format). Check which is right: “JOSɒS” or “JOSÉ’S”. If it’s the second, save the file as “CSV UTF-8” and import it again.');
});

test('the decoder calls bytes valid UTF-8 exactly when the browser’s strict UTF-8 reader does', () => {
  const strict = new TextDecoder('utf-8', { fatal: true });
  const hi = [0x80, 0x8f, 0x90, 0x9f, 0xa0, 0xbf, 0xc0, 0xc1, 0xc2, 0xc6, 0xdf, 0xe0, 0xe2, 0xed, 0xef, 0xf0, 0xf4, 0xf5, 0xff];
  for (let k = 0; k < 20000; k++) {
    const b = Uint8Array.from({ length: 1 + rnd(6) }, () => (rnd(3) ? hi[rnd(hi.length)] : 0x41));
    let ok = true;
    try { strict.decode(b); } catch { ok = false; }
    const r = decodeText(b);
    // valid: read as UTF-8, the same text; not valid: a note always
    if (ok && b[0] !== 0xef) assert.equal(r.text, new TextDecoder().decode(b), [...b].join(' '));
    if (!ok) assert.ok(r.note, [...b].join(' '));
  }
  // and the edges of each length, which random bytes seldom reach
  const edges = [[0xc0, 0x80], [0xc1, 0xbf], [0xc2, 0x80], [0xdf, 0xbf], [0xe0, 0x80, 0x80], [0xe0, 0x9f, 0xbf], [0xe0, 0xa0, 0x80], [0xed, 0x9f, 0xbf], [0xed, 0xa0, 0x80], [0xef, 0xbf, 0xbf],
    [0xf0, 0x80, 0x80, 0x80], [0xf0, 0x8f, 0xbf, 0xbf], [0xf0, 0x90, 0x80, 0x80], [0xf4, 0x8f, 0xbf, 0xbf], [0xf4, 0x90, 0x80, 0x80], [0xf5, 0x80, 0x80, 0x80]];
  for (const e of edges) {
    const b = Uint8Array.from([0x41, ...e]);
    let ok = true;
    try { strict.decode(b); } catch { ok = false; }
    const r = decodeText(b);
    if (ok) assert.equal(r.text, new TextDecoder().decode(b), e.join(' '));
    else assert.ok(r.note, `${e.join(' ')} is not UTF-8 and is never read silently`);
  }
});

test('as many lookalike UTF-8 pairs as stray bytes: Windows-1252, so JOSÉ’S and Café both read right', async () => {
  const s = 'Suite,Tenant\n101,JOSÉ’S Café\n';
  const g = await readGrids(csv(Uint8Array.from([...s].map((c) => BYTE_1252.get(c)))), noXlsx);
  assert.equal(cells(g)[1][1], 'JOSÉ’S Café');
  assert.equal(g[0].encoding, 'windows-1252');
});

test('a byte-order mark says UTF-8: a stray byte is then counted, not a reason to read Windows-1252', async () => {
  const g = await readGrids(csv(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Suite,Tenant\n101,Bistro '), 0xe9, 0x0a])), noXlsx);
  assert.equal(cells(g)[1][1], 'Bistro �');
  assert.match(g[0].note, /^Read as UTF-8, but the file mixes encodings: 1 character could not be read and shows as “�” \(line 2\)\./);
});

test('a byte-order mark says UTF-8: a UTF-8 name that could be Windows-1252 is then not questioned', async () => {
  const g = await readGrids(csv(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Suite,Tenant\n101,JOSɒS\n')])), noXlsx);
  assert.equal(cells(g)[1][1], 'JOSɒS');
  assert.equal(g[0].note, null);
});

test('the words to check are words: a lone dash is not one', async () => {
  const g = await readGrids(csv(bytes('t12-windows-1252.csv'), 'invented-t12.csv'), noXlsx);
  assert.match(g[0].note, /Check that these read right: Café, Lumière, O’Brien’s\.$/);
});
