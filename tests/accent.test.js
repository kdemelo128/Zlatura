/* The New look's accent is the person's choice: whatever they pick, text in it reads at 4.5:1 and the focus ring at
 * 3:1 on the pages and cards in both themes, or it is adjusted until it does. Bad picks included. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accentFor, checksFor, parseHex, SWATCHES, DEFAULT_ACCENT } from '../app/accent.js';

const fails = (c) => { const a = accentFor(c); return checksFor(a).filter(([, f, b, n]) => ratioOf(f, b) < n).map(([n, f, b]) => `${c}: ${n} ${f} on ${b}`); };
import { ratio as ratioOf } from '../app/accent.js';

test('accent: a range of colours, bad ones included, always passes 4.5:1 and 3:1 in both themes', () => {
  const bad = ['#FFFF99', '#FFFFFF', '#000000', '#FFFF00', '#00FFFF', '#FF00FF', '#F0F0F0', '#101010', '#CCFFCC', '#FFD700', '#7FFF00', '#222222'];
  const sweep = [];
  for (let h = 0; h < 360; h += 15) for (const s of [0.2, 0.6, 1]) for (const l of [0.05, 0.25, 0.5, 0.75, 0.95]) sweep.push(`hsl:${h},${s},${l}`);
  const toHex = (str) => { const [h, s, l] = str.slice(4).split(',').map(Number); const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join(''); };
  const all = [...bad, ...sweep.map(toHex), ...SWATCHES.map((s) => s[1])];
  const out = all.flatMap(fails);
  assert.deepEqual(out.slice(0, 5), [], `${out.length} failures of ${all.length} colours`);
  assert.ok(all.length > 300);
});

test('accent: a pale yellow is adjusted and says so; the default plum and the swatches are not', () => {
  assert.equal(accentFor('#FFFF99').adjusted, true);
  assert.equal(accentFor(DEFAULT_ACCENT).adjusted, false);
  for (const [, c] of SWATCHES) assert.equal(accentFor(c).adjusted, false, c);
  assert.ok(accentFor('#FFFF99').light.accent !== '#FFFF99');
});

test('accent: a value that is not a colour is refused; short hex and a missing # are read', () => {
  for (const v of ['', 'red', '#12', '#GGGGGG', null, undefined, '#1234567']) assert.equal(accentFor(v), null, String(v));
  assert.equal(parseHex('abc'), '#AABBCC');
  assert.equal(parseHex(' #78516c '), '#78516C');
});
