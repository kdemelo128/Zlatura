/* Role workspaces (app/workspaces.js, docs/proposals/role-workspaces.md, WS0): the registry, the stored choice and its
 * sanitising, the backup, and the rule that a workspace never takes a tool or a screen away. The browser side
 * (the switcher, the tabs, the Homes, Tools and search per workspace) is tests/e2e/workspace-flow.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORKSPACES, GROUPS, DEFAULT_ID, MAX_PINNED, workspaceById, sanitiseWorkspace, withActive, withPinned } from '../app/workspaces.js';
import { buildBackup, readBackup, planRestore, KV_KEYS } from '../app/backup.js';

globalThis.window ||= {}; // kit.js reads window.claude when it loads; the tool table only needs its formatters
const { MORE_TOOLS } = await import('../app/toolsdefs.js');
const read = (f) => fs.readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
/** Every tool id Tools lists: the calculators in toolsdefs.js and the ones written in toolsui.js (it cannot load in Node). */
const TOOL_IDS = [...MORE_TOOLS.map((t) => t.id), ...[...read('toolsui.js').matchAll(/^\s+id: '([a-z0-9-]+)', group: /gm)].map((m) => m[1])];
/** Today's Home sections, read from home.js itself. */
const HOME_IDS = [...read('home.js').matchAll(/section\('[^']+', '(home-[a-z]+)'\)/g)].map((m) => m[1]);

test('nine workspaces, frozen, in three groups, each with a plain line', () => {
  assert.deepEqual(WORKSPACES.map((w) => w.id), ['brokerage', 'underwriting', 'lending', 'development', 'investing', 'occupier', 'asset', 'capital', 'leases']);
  assert.ok(Object.isFrozen(WORKSPACES));
  for (const w of WORKSPACES) {
    for (const k of ['homeCards', 'tools', 'newMenu', 'checklists', 'exports']) assert.ok(Object.isFrozen(w[k]), `${w.id}.${k}`);
    assert.ok(Object.isFrozen(w) && Object.isFrozen(w.words), w.id);
    assert.ok(w.name && w.line.endsWith('.') && GROUPS.includes(w.group), w.id);
  }
  assert.equal(DEFAULT_ID, 'brokerage');
  assert.equal(workspaceById('nonsense').id, 'brokerage');
});

test('the tool ids the tool table lists are found (so the next tests mean something)', () => {
  assert.ok(TOOL_IDS.length >= 30, `${TOOL_IDS.length}`);
  for (const id of ['value', 'loan', 'dcf', 'pdf-pages', 'doc-convert', 'draws']) assert.ok(TOOL_IDS.includes(id), id);
  assert.equal(new Set(TOOL_IDS).size, TOOL_IDS.length, 'a tool id is used twice');
});

test('every tool a workspace names exists, once, and a workspace lists only some tools (nothing is removed from Tools)', () => {
  for (const w of WORKSPACES) {
    assert.ok(w.tools.length >= 5, `${w.id} has too few tools`);
    assert.equal(new Set(w.tools).size, w.tools.length, `${w.id} repeats a tool`);
    for (const id of w.tools) assert.ok(TOOL_IDS.includes(id), `${w.id}: no tool "${id}" in Tools`);
    assert.ok(w.tools.length < TOOL_IDS.length);
  }
});

test('Brokerage Home is today\'s Home, card for card; the others hold the same sections in their order plus one tools card', () => {
  const TODAY = ['home-continue', 'home-attention', 'home-dates', 'home-pipeline', 'home-tasks', 'home-activity', 'home-contacts'];
  assert.deepEqual([...HOME_IDS].sort(), [...TODAY].sort(), 'home.js has these sections and no others');
  assert.deepEqual(workspaceById('brokerage').homeCards, TODAY);
  for (const w of WORKSPACES.filter((x) => x.id !== 'brokerage')) {
    assert.equal(w.homeCards.filter((c) => c === 'home-ws-tools').length, 1, w.id);
    assert.deepEqual([...w.homeCards].filter((c) => c !== 'home-ws-tools').sort(), [...HOME_IDS].sort(), `${w.id} must hold every Home section exactly once`);
    assert.notDeepEqual(w.homeCards, HOME_IDS, `${w.id} should differ from Brokerage`);
  }
});

test('a workspace changes only Home headings and empty-state lines (the words it may set are fixed)', () => {
  for (const w of WORKSPACES) for (const k of Object.keys(w.words)) assert.ok(['pipeline', 'continue', 'empty'].includes(k), `${w.id}.${k}`);
  assert.deepEqual(workspaceById('brokerage').words, {});
  for (const w of WORKSPACES) assert.deepEqual([...w.newMenu].sort(), ['comps', 'contact', 'deal', 'om', 'quick', 'task'], `${w.id}: the New actions are the same six`);
  // Brokerage keeps the palette's order of today
  assert.deepEqual(workspaceById('brokerage').newMenu, ['om', 'comps', 'deal', 'quick', 'task', 'contact']);
});

test('sanitising: a missing or broken record is Brokerage; unknown ids are dropped; pinned is cut to 3; active is repaired', () => {
  const base = { v: 1, active: 'brokerage', pinned: ['brokerage'], picked: false };
  for (const bad of [undefined, null, 7, 'lending', [], {}, { pinned: 'lending' }, { active: 5, pinned: [5, {}, null] }]) assert.deepEqual(sanitiseWorkspace(bad), base, JSON.stringify(bad));
  assert.deepEqual(sanitiseWorkspace({ v: 1, active: 'lending', pinned: ['lending', 'nope', '<img src=x onerror=1>', 'lending', 'investing'], picked: true }), { v: 1, active: 'lending', pinned: ['lending', 'investing'], picked: true });
  assert.deepEqual(sanitiseWorkspace({ active: 'lending', pinned: ['brokerage', 'investing', 'occupier', 'asset', 'capital'] }).pinned, ['brokerage', 'investing', 'lending'], 'trimmed to 3 and the active one kept');
  assert.equal(sanitiseWorkspace({ active: 'lending', pinned: ['brokerage'] }).active, 'lending');
  assert.deepEqual(sanitiseWorkspace({ active: 'lending', pinned: ['brokerage'] }).pinned, ['brokerage', 'lending'], 'an active that is not pinned is added');
  assert.equal(sanitiseWorkspace({ active: 'ghost', pinned: ['investing', 'lending'] }).active, 'investing', 'an unknown active falls back to the first pinned');
  assert.equal(sanitiseWorkspace({ picked: 'yes' }).picked, false, 'picked is only ever true or false');
  for (const w of WORKSPACES) { const s = sanitiseWorkspace({ active: w.id, pinned: [w.id] }); assert.ok(s.pinned.length >= 1 && s.pinned.length <= MAX_PINNED && s.pinned.includes(s.active)); }
});

test('switching and pinning keep the choice valid and never refuse a tool', () => {
  let w = withActive(undefined, 'lending');
  assert.deepEqual([w.active, w.pinned, w.picked], ['lending', ['brokerage', 'lending'], true]);
  w = withPinned(w, 'investing', true);
  assert.deepEqual(w.pinned, ['brokerage', 'lending', 'investing']);
  assert.deepEqual(withPinned(w, 'occupier', true).pinned, w.pinned, 'a fourth pin is refused');
  assert.equal(withPinned(w, 'nope', true).pinned.length, 3);
  const un = withPinned(w, 'lending', false);
  assert.deepEqual(un.pinned, ['brokerage', 'investing']);
  assert.equal(un.active, 'brokerage', 'unpinning the active one moves active to another pinned');
  assert.deepEqual(withPinned({ active: 'lending', pinned: ['lending'] }, 'lending', false).pinned, ['lending'], 'the last pin stays');
  assert.equal(withActive(w, 'occupier').active, 'occupier');
  assert.deepEqual(withActive(w, 'occupier').pinned, ['brokerage', 'lending', 'occupier']);
});

test('the choice is a small device setting on the backup list; a backup carries it and old backups restore to Brokerage', async () => {
  assert.ok(KV_KEYS.includes('ui.prefs'));
  const prefs = { workspace: { v: 1, active: 'lending', pinned: ['lending', 'investing'], picked: true }, modules: { keep: 1 } };
  const b = readBackup(JSON.stringify(await buildBackup({ deals: [], kv: { 'ui.prefs': prefs, 'crm.tasks': [] } })));
  assert.deepEqual(b.kv['ui.prefs'], prefs);
  const here = { deals: [], kv: { 'ui.prefs': prefs }, session: null, local: {} };
  for (const f of fs.readdirSync(new URL('./fixtures/', import.meta.url)).filter((x) => /^backup-.*\.json$/.test(x))) {
    const old = readBackup(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
    assert.ok(!('ui.prefs' in old.kv), `${f} has no workspace choice`);
    assert.deepEqual(sanitiseWorkspace(old.kv['ui.prefs'] && old.kv['ui.prefs'].workspace).active, 'brokerage', f);
    const replaced = planRestore(old, here, 'replace');
    assert.ok(replaced.removeKv.includes('ui.prefs'), `${f}: a replace restore returns this device to Brokerage`);
  }
  // a hostile record in a backup is cut down on read
  const evil = readBackup(JSON.stringify(await buildBackup({ deals: [], kv: { 'ui.prefs': { workspace: { active: '<script>', pinned: ['<script>', 'asset'] } } } })));
  assert.deepEqual(sanitiseWorkspace(evil.kv['ui.prefs'].workspace), { v: 1, active: 'asset', pinned: ['asset'], picked: false });
});

test('the workspace code touches no deal and holds no maths', () => {
  for (const f of ['workspaces.js', 'workspaceui.js']) {
    const src = read(f);
    assert.ok(!/\b(updateDeal|saveDeal|putDeal|createDeal|analyze|quantize)\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), `${f} must not write a deal or calculate`);
  }
  assert.ok(!/from '\.\/(engine|deal|calc)/.test(read('workspaces.js')));
});
