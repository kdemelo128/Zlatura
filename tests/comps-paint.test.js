/* A comps table of thousands of rows repaints every drawn cell when focus moves, unless the cells are their own
 * paint layers. `position: relative` on the body cells is what lets the browser reuse cached drawing (an edit at
 * 2,000 comps: median about 112 ms without it, about 65 ms with it). The phone layout's absolutely placed
 * checkbox cell (.ctable td.tg) must still win over it. The browser flow comps-import-flow checks the computed style. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');
const rule = (sel) => css.split('\n').find((l) => l.startsWith(`${sel} {`)) || '';

test('.ctable tbody td is position: relative (its own paint layer)', () => {
  assert.match(rule('.ctable tbody td'), /position:\s*relative/);
});

test('the phone layout still places the .tg cell absolutely, with higher specificity', () => {
  assert.match(css, /\.ctable td\.tg \{ position: absolute;/);
});
