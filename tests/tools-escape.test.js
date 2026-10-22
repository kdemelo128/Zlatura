/* The release tools' escapes (tests/tools/escape.mjs, CodeQL alerts 1-6) and the sign of OM figures written with a
 * k/M suffix (app/omstatement.js readCell, CodeQL alert 7). The escape tests fail on 4.7.42, which has no escape.mjs;
 * the sign tests are guards: the over-wide character range could not change a result there, as its pattern only lets
 * "(", "-", "–" or "$" reach it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeRegExp, mdCell } from './tools/escape.mjs';
import { fold } from './tools/changelog.mjs';
import { readCell } from '../app/omstatement.js';

test('escapeRegExp: any text matches itself and nothing else', () => {
  for (const s of ['4.7.43', 'a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o/p-q', '1x2', '.*']) {
    assert.ok(new RegExp(`^${escapeRegExp(s)}$`).test(s), s);
  }
  assert.ok(!new RegExp(`^${escapeRegExp('4.7.43')}$`).test('4x7y43'), 'a dot is a dot, not any character');
  assert.ok(!new RegExp(`^${escapeRegExp('.*')}$`).test('anything'));
});

test('the changelog fold finds an existing entry by its exact version only', () => {
  const log = '# Changelog\n\n## 4.7.42: earlier (on the development branch; not merged or deployed)\n\nbody\n';
  assert.throws(() => fold(log, '4.7.42', { title: 't', body: 'b' }), /already has an entry for 4\.7\.42/);
  assert.doesNotThrow(() => fold(log.replace('4.7.42', '4x7x42'), '4.7.42', { title: 't', body: 'b' }), 'a lookalike is not a match');
});

test('mdCell: backslashes, pipes and line breaks never break a table row', () => {
  assert.equal(mdCell('a|b'), 'a\\|b');
  assert.equal(mdCell('a\\|b'), 'a\\\\\\|b', 'a backslash before a pipe is escaped too, so the pipe stays escaped');
  assert.equal(mdCell('x\ny'), 'x y');
  assert.equal(mdCell(12.5), '12.5');
});

test('OM figures with a k or M suffix keep their sign', () => {
  assert.equal(readCell('$1.5M').value, 1500000);
  assert.equal(readCell('$250k').value, 250000);
  assert.equal(readCell('($1.5M)').value, -1500000);
  assert.equal(readCell('-$1.5M').value, -1500000);
  assert.equal(readCell('–$2k').value, -2000);
});
