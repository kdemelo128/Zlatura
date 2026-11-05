/* Safari before 16.4 cannot parse a regular expression with a lookbehind ((?<= or (?<!): the file that holds one fails to
 * load, and when that file is loaded at start-up (a module the page imports) the whole app shows "didn't finish loading".
 * Nothing the app serves may contain one. Comments and strings are not checked (a plain scan, a known false positive). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const APP = new URL('../app/', import.meta.url);
const files = fs.readdirSync(APP).filter((f) => f.endsWith('.js'));

test('no file in app/ has a regular-expression lookbehind (older Safari cannot parse it)', () => {
  const bad = [];
  for (const f of files) {
    const lines = fs.readFileSync(new URL(f, APP), 'utf8').split('\n');
    lines.forEach((l, i) => { if (/\(\?<[=!]/.test(l) && !/^\s*(\/\/|\*)/.test(l)) bad.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(bad, [], 'a lookbehind breaks the app on Safari before 16.4: write the pattern without one');
});

test('the words of a plain-text line wrap keep their trailing spaces, as the pattern that replaced a lookbehind did', () => {
  const words = (s) => s.match(/[^ ]* |[^ ]+/g) || [];
  assert.deepEqual(words('a b c'), ['a ', 'b ', 'c']);
  assert.deepEqual(words('a  b'), ['a ', ' ', 'b']);
  assert.deepEqual(words('abc'), ['abc']);
  assert.deepEqual(words(' a'), [' ', 'a']);
  assert.deepEqual(words('a '), ['a ']);
  assert.deepEqual(words(''), []);
  for (const s of ['a b c', 'a  b', 'abc', ' a', 'a ', 'x y  z ']) {
    assert.deepEqual(words(s), s.split(/(?<= )/).filter((w) => w !== ''), `same split as the lookbehind for ${JSON.stringify(s)}`);
  }
});
