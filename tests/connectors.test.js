/* The Connect page's list (app/connectors.js): only the four allowed states, every row that opens something opens
 * something real, a row that waits says what for, no row has an image or a logo, and the search and the monogram behave. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATEGORIES, STATES, OPENS, allRows, filterCategories, monogram } from '../app/connectors.js';

const APP = new URL('../app/', import.meta.url);
const KEYS = new Set(['id', 'name', 'desc', 'state', 'module', 'opens', 'wait']);

test('every row uses one of the four allowed states', () => {
  assert.deepEqual([...STATES], ['Built in', 'Import file', 'Coming soon', 'Needs your approval']);
  for (const r of allRows()) assert.ok(STATES.includes(r.state), `${r.id}: “${r.state}”`);
});

test('every row that opens something names a module that exists and an action the page answers', () => {
  const ui = fs.readFileSync(new URL('connectui.js', APP), 'utf8');
  for (const r of allRows()) {
    if (r.state === 'Built in' || r.state === 'Import file') {
      assert.ok(r.module && fs.existsSync(new URL(r.module, APP)), `${r.id}: module ${r.module}`);
      assert.ok(OPENS.includes(r.opens), `${r.id}: opens ${r.opens}`);
    } else {
      assert.ok(!r.module && !r.opens, `${r.id}: a row that waits opens nothing`);
      assert.ok(r.wait && r.wait.length > 20, `${r.id}: says what it waits for`);
    }
  }
  for (const o of OPENS) assert.ok(new RegExp(`(^|\\s)'?${o}'?:`, 'm').test(ui), `connectui.js answers “${o}”`);
});

test('no row has an image, a logo or any field beyond the listed ones', () => {
  for (const r of allRows()) for (const k of Object.keys(r)) assert.ok(KEYS.has(k) || k === 'category', `${r.id} has “${k}”`);
  const code = (f) => fs.readFileSync(new URL(f, APP), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const src = code('connectors.js') + code('connectui.js');
  assert.ok(!/<img|\.svg|\.png|\.jpe?g|\.webp|logo\s*:|image\s*:|fetch\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(src), 'no image, logo or network call');
});

test('ids are unique and the nine categories the owner asked for are all there', () => {
  const ids = allRows().map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(CATEGORIES.map((c) => c.id), ['assistants', 'crm', 'deals', 'property', 'market', 'public', 'files', 'automation', 'api']);
  const has = (id, state) => assert.equal(allRows().find((r) => r.id === id)?.state, state, id);
  has('monal-assistant', 'Built in'); has('ai-link', 'Coming soon'); has('zapier', 'Needs your approval'); has('api-keys', 'Coming soon');
  for (const n of ['Zapier', 'Make', 'Webhooks']) assert.ok(allRows().some((r) => r.name === n), n);
});

test('search: every word must match; an empty query keeps everything; a miss returns nothing', () => {
  const all = allRows().length;
  assert.equal(filterCategories('').reduce((a, c) => a + c.rows.length, 0), all);
  const z = filterCategories('zapier');
  assert.deepEqual(z.map((c) => c.id), ['automation']);
  assert.deepEqual(z[0].rows.map((r) => r.id), ['zapier']);
  assert.ok(filterCategories('IMPORT FILE').flatMap((c) => c.rows).every((r) => r.state === 'Import file'));
  assert.equal(filterCategories('zapier costar').length, 0);
  assert.equal(filterCategories('qqqqq').length, 0);
});

test('monogram: initials, a stable tone from 1 to 4, never an image', () => {
  assert.deepEqual(monogram('Microsoft Dynamics 365'), { text: 'MD', tone: monogram('Microsoft Dynamics 365').tone });
  assert.equal(monogram('Zapier').text, 'ZA');
  assert.equal(monogram('Licensed data (ATTOM, Regrid)').text, 'LD');
  for (const r of allRows()) { const m = monogram(r.name); assert.ok(m.tone >= 1 && m.tone <= 4 && /^[A-Z0-9?]{1,2}$/.test(m.text), r.name); assert.deepEqual(m, monogram(r.name)); }
});
