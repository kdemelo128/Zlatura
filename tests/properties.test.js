/* properties.test.js -- property tests (fast-check, test-only): the money
 * rounding, the text decoder and the CSV and paste readers, each against what
 * its own comments say it guarantees, over generated inputs. The seed is
 * pinned so a failure repeats; a failing run prints its counterexample. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { roundTo, toCents, toRate } from '../app/engine/money.js';
import { decodeText } from '../app/textfile.js';
import { csvRows, detectDelimiter, pastedRows } from '../app/sheetread.js';

const RUN = { seed: 20261022, numRuns: 300 };
const prop = (arb, fn, opts = {}) => fc.assert(fc.property(...[].concat(arb), fn), { ...RUN, ...opts });

/* ------------------------------------------------------------- money.js */

// up to a trillion: String() of a number below 1e21 never uses an exponent, so decimals can be counted
const amount = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e12, max: 1e12 });
// === (not Object.is): a tiny negative amount rounds to -0, which is 0 everywhere it is stored or shown
const placesOf = (n) => (String(n).split('.')[1] || '').length;

test('money: toCents gives whole cents (at most two decimals) for any finite amount', () => {
  prop(amount, (x) => { const c = toCents(x); assert.ok(Number.isFinite(c)); assert.ok(placesOf(c) <= 2, `${x} -> ${c}`); });
});
test('money: roundTo gives at most dp decimals, for dp 0 to 4', () => {
  prop([amount, fc.integer({ min: 0, max: 4 })], (x, dp) => { assert.ok(placesOf(roundTo(x, dp)) <= dp, `${x}, ${dp}`); });
});
test('money: rounding twice is rounding once', () => {
  prop([amount, fc.integer({ min: 0, max: 4 })], (x, dp) => { const r = roundTo(x, dp); assert.ok(roundTo(r, dp) === r, `${x}, ${dp}`); });
});
test('money: the result is within half a place of the input', () => {
  prop([amount, fc.integer({ min: 0, max: 4 })], (x, dp) => {
    const half = 0.5 / 10 ** dp;
    assert.ok(Math.abs(roundTo(x, dp) - x) <= half + Math.abs(x) * 1e-12 + 1e-12, `${x}, ${dp}`);
  });
});
test('money: rounds half away from zero, so negatives mirror positives', () => {
  prop([amount, fc.integer({ min: 0, max: 4 })], (x, dp) => { assert.ok(roundTo(-x, dp) === -roundTo(x, dp), `${x}, ${dp}`); });
  // the documented example (1.005 gives 1.01), for every exact half cent: i.dd5 rounds up to (i.dd + 0.01)
  prop([fc.integer({ min: 0, max: 1e8 }), fc.integer({ min: 0, max: 99 })], (whole, dd) => {
    const half = Number(`${whole}.${String(dd).padStart(2, '0')}5`);
    const up = (whole * 100 + dd + 1) / 100;
    assert.equal(toCents(half), up, `${half}`);
    assert.equal(toCents(-half), -up, `-${half}`);
  });
});
test('money: toRate keeps four decimals', () => {
  prop(amount, (x) => { assert.ok(placesOf(toRate(x)) <= 4); });
});
test('money: anything that is not a finite number passes through, never becomes 0', () => {
  for (const v of [NaN, Infinity, -Infinity, undefined, null, '', ' ', '12.5', {}, []]) {
    const out = toCents(v);
    assert.ok(Object.is(out, v), `${String(v)} passes through`);
  }
  prop(fc.oneof(fc.string(), fc.constantFrom(undefined, null, NaN, Infinity, -Infinity)), (v) => { assert.ok(Object.is(toCents(v), v)); });
});

/* ---------------------------------------------------------- textfile.js */

const wellFormed = fc.string({ unit: 'binary', maxLength: 60 }).map((s) => s.toWellFormed());
const noLeadingBom = wellFormed.filter((s) => s[0] !== '﻿'); // a leading U+FEFF is read as a byte-order mark (the documented rule)
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const utf16 = (s, le) => { const u = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); u[2 * i + (le ? 0 : 1)] = c & 255; u[2 * i + (le ? 1 : 0)] = c >> 8; } return u; };

test('decodeText: UTF-8 round-trips exactly, with and without a byte-order mark', () => {
  prop(noLeadingBom, (s) => {
    const r = decodeText(new TextEncoder().encode(s));
    assert.equal(r.text, s); assert.equal(r.encoding, 'utf-8');
  });
  prop(wellFormed, (s) => {
    const r = decodeText(cat(Uint8Array.of(0xef, 0xbb, 0xbf), new TextEncoder().encode(s)));
    assert.equal(r.text, s); assert.equal(r.encoding, 'utf-8'); assert.equal(r.note, null);
  });
});
test('decodeText: UTF-16 LE and BE with a byte-order mark round-trip', () => {
  prop(noLeadingBom, (s) => {
    const le = decodeText(cat(Uint8Array.of(0xff, 0xfe), utf16(s, true)));
    assert.equal(le.text, s); assert.equal(le.encoding, 'utf-16le');
    const be = decodeText(cat(Uint8Array.of(0xfe, 0xff), utf16(s, false)));
    assert.equal(be.text, s); assert.equal(be.encoding, 'utf-16be');
  });
});
test('decodeText: arbitrary bytes never throw, and always give text in a named encoding', () => {
  prop(fc.uint8Array({ maxLength: 200 }), (b) => {
    const r = decodeText(b);
    assert.equal(typeof r.text, 'string');
    assert.ok(['utf-8', 'utf-16le', 'utf-16be', 'windows-1252'].includes(r.encoding));
    assert.ok(r.note === null || typeof r.note === 'string');
  }, { numRuns: 500 });
});

/* ---------------------------------------------------------- sheetread.js */

// the characters that matter to CSV: the delimiters, quotes, every line ending
const csvChar = fc.constantFrom('a', 'B', '7', ' ', ',', ';', '\t', '"', '"', '\n', '\r', '\r\n', 'é');
const grid = fc.array(fc.array(fc.string({ unit: csvChar, maxLength: 6 }), { minLength: 1, maxLength: 5 }), { maxLength: 6 });
const writeCsv = (rows, d) => rows.map((r) => r.map((c) => (/[",;\t\r\n]/.test(c) || c.includes(d) ? `"${c.replaceAll('"', '""')}"` : c)).join(d) + '\n').join('');

test('csvRows: a grid written as standard CSV reads back the same', () => {
  for (const d of [',', ';', '\t']) prop(grid, (g) => { assert.deepEqual(csvRows(writeCsv(g, d), { delimiter: d }), g); });
});
test('csvRows: CR LF line endings read the same as LF', () => {
  prop(grid, (g) => { assert.deepEqual(csvRows(writeCsv(g, ',').replace(/\n(?=(?:[^"]*"[^"]*")*[^"]*$)/g, '\r\n')), g); });
});

const plain = fc.stringMatching(/^[A-Za-z0-9]{1,8}$/);
test('detectDelimiter: finds the delimiter of a plain grid of 2+ columns and 2+ rows', () => {
  prop([fc.constantFrom('\t', ';', ','), fc.integer({ min: 2, max: 6 }), fc.integer({ min: 2, max: 40 })], (d, cols, n) => {
    return fc.assert(fc.property(fc.array(fc.array(plain, { minLength: cols, maxLength: cols }), { minLength: n, maxLength: n }), (g) => {
      assert.deepEqual(detectDelimiter(g.map((r) => r.join(d)).join('\n')), { delimiter: d, skipFirst: false });
    }), { seed: RUN.seed, numRuns: 5 });
  }, { numRuns: 40 });
});

test('pastedRows: tab-joined rows give back their cells trimmed, with 1-based line numbers', () => {
  const cell = fc.string({ unit: fc.constantFrom('a', 'Z', '4', ' ', ' ', '$', ',', '.'), maxLength: 6 });
  const last = cell.filter((c) => c.trim() !== '');
  const row = fc.tuple(fc.array(cell, { minLength: 1, maxLength: 4 }), last).map(([a, z]) => [...a, z]);
  prop([fc.array(row, { minLength: 1, maxLength: 6 }), fc.constantFrom('\n', '\r\n')], (g, eol) => {
    const got = pastedRows(g.map((r) => r.join('\t')).join(eol));
    assert.deepEqual(got, g.map((r, i) => ({ r: i + 1, cells: r.map((c) => c.trim()) })));
  });
});
