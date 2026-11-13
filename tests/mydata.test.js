/* "My data" (app/mydata.js): counts by kind match invented data, every stored key has a kind, and the space line
 * never invents a figure the browser did not give. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, KEY_KIND, countKinds, storageLine, countText } from '../app/mydata.js';
import { KV_KEYS } from '../app/backup.js';

test('every kv key a backup may carry has a kind (a new store cannot skip its row)', () => {
  for (const k of KV_KEYS) assert.ok(Object.hasOwn(KEY_KIND, k), `${k} has no kind in mydata.js`);
  for (const [k, kind] of Object.entries(KEY_KIND)) assert.ok(kind === '' || KINDS.some((x) => x.id === kind), `${k}: ${kind}`);
});

test('counts match invented data, kind by kind', () => {
  const n = countKinds({
    deals: [{ dd: { docs: [{}, {}] } }, { dd: { docs: [{}] } }, {}],
    kv: {
      'crm.contacts': [{}, {}, {}, {}], 'crm.tasks': [{}, {}], 'crm.activity': [{}], 'research.briefs': [{}],
      'tpl.library': [{}, {}], template: { name: 'x' }, 'tools.scenarios': { loan: [{}, {}], yield: [{}] },
      'uw.scratch': [{}, {}, {}], conventions: { a: 1 }, 'ui.prefs': {}, 'crm.stages': null, 'backup.last': 5,
    },
    session: { manual: [{}, {}], docs: [] }, local: { 'uw-v3': '{}' },
  });
  assert.deepEqual(n, { deals: 3, contacts: 4, tasks: 2, comps: 2, documents: 3, templates: 3, scenarios: 3, projects: 4, activity: 1, briefs: 1, settings: 2 });
});

test('nothing stored counts zero; wrong shapes count none; no session is no comps', () => {
  assert.ok(Object.values(countKinds()).every((x) => x === 0));
  const n = countKinds({ deals: null, kv: { 'crm.contacts': 'x', 'tools.scenarios': [1, 2], 'uw.scratch': {} }, session: null });
  assert.equal(n.contacts, 0); assert.equal(n.scenarios, 0); assert.equal(n.projects, 0);
});

test('space: percent when both are known; a fallback sentence otherwise; never a guess', () => {
  const a = storageLine({ usage: 5 * 1048576, quota: 500 * 1048576, persisted: true });
  assert.match(a.text, /5\.0 MB used of about 500\.0 MB.*\(1%\)/); assert.match(a.text, /agreed not to clear/); assert.equal(a.share, 0.01);
  assert.match(storageLine({ usage: 1000, quota: 1e12 }).text, /under 1%/);
  const none = storageLine({});
  assert.equal(none.share, null); assert.match(none.text, /does not say how much space/);
  const part = storageLine({ usage: 2048, quota: null, persisted: false });
  assert.equal(part.share, null); assert.match(part.text, /2 KB used\. This browser does not say how much it allows\..*may clear/);
});

test('countText is singular for one', () => {
  assert.equal(countText(KINDS[0], 1), '1 deal'); assert.equal(countText(KINDS[0], 0), '0 deals');
  assert.equal(countText(KINDS.find((k) => k.id === 'activity'), 2), '2 entries');
});
