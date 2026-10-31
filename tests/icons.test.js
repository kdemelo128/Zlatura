/* The icon set (app/icons.js): one spec, every name used is drawn, every name drawn is used, and no
 * icon is drawn anywhere else. Rendered size and look are checked in tests/e2e/ui-d2-flow.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ICONS, SPEC, icon } from '../app/icons.js';

const APP = new URL('../app/', import.meta.url);
const files = fs.readdirSync(APP).filter((f) => f.endsWith('.js') && f !== 'icons.js');
const src = Object.fromEntries(files.map((f) => [f, fs.readFileSync(new URL(f, APP), 'utf8')]));
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** s without every open...close stretch (a plain scan, so no markup is ever filtered by pattern). */
function cut(s, open, close) {
  let out = '';
  for (let i = 0; ;) {
    const a = s.indexOf(open, i);
    if (a < 0) return out + s.slice(i);
    const b = s.indexOf(close, a + open.length);
    out += s.slice(i, a);
    if (b < 0) return out;
    i = b + close.length;
  }
}

/** Every icon name the app asks for, found by the shapes a call takes. */
function usedNames() {
  const out = new Map(); // name -> where
  const add = (n, where) => { if (!out.has(n)) out.set(n, where); };
  for (const [f, s] of Object.entries(src)) {
    for (const m of s.matchAll(/\bicon\(\s*'([\w-]+)'/g)) add(m[1], f);
    for (const m of s.matchAll(/\bicon:\s*'([\w-]+)'/g)) add(m[1], f);
    // a button(cls, text, fn, 'name') call, or a menu list of [title, sub, 'name'] rows
    for (const m of s.matchAll(/\bbutton\([^\n]*,\s*'([a-z-]+)'\)\s*[;,)]/g)) add(m[1], f);
    if (f === 'dealui.js') {
      const blk = s.match(/for \(const \[t, s, p\] of \[([\s\S]*?)\n  \]\) \{/)[1];
      for (const m of blk.matchAll(/, '([a-z-]+)'\],?$/gm)) add(m[1], f);
    }
    // a name chosen by a condition, on a line that draws an icon or is the record button
    for (const line of s.split('\n')) if (/\bicon\(|recording \?/.test(line)) for (const m of line.matchAll(/\? '([a-z-]+)' : '([a-z-]+)'/g)) { add(m[1], f); add(m[2], f); }
    // the name map in pdfpagesui.js, and the theme choices
    if (f === 'pdfpagesui.js') for (const m of s.match(/const ICON = \{([\s\S]*?)\n\};?/)[1].matchAll(/\w+:\s*'([a-z-]+)'/g)) add(m[1], f);
    if (f === 'command.js') add('arrow-right', f); // the fallback when an item names no icon
    for (const m of s.matchAll(/\['(?:system|light|dark)', '\w+', '([a-z-]+)'\]/g)) add(m[1], f);
    for (const m of s.matchAll(/\bAFFECTS_ICON = '([a-z-]+)'/g)) add(m[1], f);
  }
  for (const m of html.matchAll(/data-icon="([\w-]+)"/g)) add(m[1], 'index.html');
  return out;
}

test('the spec is one 24-unit grid and one stroke weight', () => {
  assert.equal(SPEC.viewBox, '0 0 24 24');
  assert.equal(SPEC.stroke, 1.75);
  const s = icon('home', 20);
  assert.match(s, /viewBox="0 0 24 24"/);
  assert.match(s, /fill="none"/);
  assert.match(s, /stroke="currentColor"/);
  assert.match(s, /stroke-width="1\.75"/);
  assert.match(s, /stroke-linecap="round" stroke-linejoin="round"/);
  assert.match(s, /aria-hidden="true"/);
  assert.match(s, /width="20" height="20"/);
});

test('every icon is built only from path, circle and rect, with no colour, fill or weight of its own', () => {
  assert.ok(Object.keys(ICONS).length >= 40, 'the set is about 40 icons or more');
  const ALLOWED = { path: ['d'], circle: ['cx', 'cy', 'r'], rect: ['x', 'y', 'width', 'height', 'rx'] };
  for (const [name, body] of Object.entries(ICONS)) {
    const tags = [...body.matchAll(/<(\w+)([^>]*?)\/>/g)];
    assert.ok(tags.length > 0, `${name} has shapes`);
    assert.equal(tags.map((m) => m[0]).join(''), body, `${name} holds only self-closed shapes`);
    for (const [, tag, attrs] of tags) {
      assert.ok(ALLOWED[tag], `${name}: <${tag}> is not allowed`);
      const names = [...attrs.matchAll(/([\w-]+)="/g)].map((m) => m[1]);
      for (const a of names) assert.ok(ALLOWED[tag].includes(a), `${name}: <${tag} ${a}> is not allowed (no fill, stroke or stroke-width on a shape)`);
      assert.deepEqual([...names].sort(), [...ALLOWED[tag]].filter((a) => names.includes(a)).sort());
    }
    // the drawing stays inside the 24-unit box
    for (const m of body.matchAll(/\b(?:cx|cy|x|y)="(-?[\d.]+)"/g)) assert.ok(+m[1] >= 0 && +m[1] <= 24, `${name}: ${m[0]} is outside the grid`);
    for (const m of body.matchAll(/\bd="([^"]*)"/g)) assert.match(m[1], /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,-]+$/, `${name}: a path holds something that is not a path`);
  }
});

test('every icon name the app uses is drawn, and every icon drawn is used', () => {
  const used = usedNames();
  assert.ok(used.size >= 40, `found ${used.size} used names: the scan has stopped matching the code`);
  for (const [n, where] of used) assert.ok(ICONS[n] !== undefined, `${where} asks for the icon "${n}", which is not in icons.js`);
  for (const n of Object.keys(ICONS)) assert.ok(used.has(n), `the icon "${n}" is drawn and never used: delete it or use it`);
});

test('an unknown name draws nothing instead of breaking the page', () => {
  assert.equal(icon('no-such-icon'), '');
});

test('no icon is drawn anywhere but icons.js (and the brand mark in brand.js)', () => {
  for (const [f, s] of Object.entries(src)) {
    if (f === 'brand.js') continue;
    const code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
    assert.ok(!/<(svg|path|circle|rect|line|symbol)\b/.test(code), `${f} draws a shape by hand: add it to icons.js`);
  }
  assert.ok(!/<(path|circle|rect)\b/.test(cut(html, '<!--', '-->')), 'index.html draws a shape by hand: use <svg data-icon="name">');
  assert.ok(!/stroke-width="/.test(html), 'index.html sets a stroke weight by hand');
});

test('no local variable or parameter named icon hides the icon() function in a file that calls it', () => {
  for (const [f, s] of Object.entries(src)) {
    const code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
    if (!/[^.\w]icon\(/.test(code)) continue;
    assert.ok(!/\b(const|let|var)\s+icon\b/.test(code), `${f} declares a variable named icon and also calls icon()`);
    assert.ok(!/\(\s*(?:[\w$]+\s*,\s*)*icon\s*(?:,[^)]*)?\)\s*=>/.test(code), `${f} has a parameter named icon and also calls icon()`);
  }
});
