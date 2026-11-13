/* The Underwrite tool's nest tips as Ask Monal's suggested questions (app/assistanttips.js, uwtool/monal-guide.js,
 * uwfiller/toolbridge.js). Every tip of the old nest stays reachable; the frame's data is cleaned, never trusted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { cleanTips, splitTips, STEPS } = await import('../app/assistanttips.js');
const guide = fs.readFileSync(new URL('../app/uwtool/monal-guide.js', import.meta.url), 'utf8');

// the old nest's tips by title: the dynamic first one is "next step"
const OLD_TITLES = ['Find a record without opening every tab', 'See every value you overrode', 'Why does this download need rebuilding?', 'A lease has steps or free rent?', 'Taxes or utilities are seasonal?', 'A document is not recognized?', 'You can start without documents', 'A number needs correcting?', 'See what drives the NOI change', 'Which leases expire soon?', 'Preview the workbook you will fill', 'Write 3% or 0.03 explicitly', 'Keep notes outside the client report', 'A source uses unfamiliar columns?', 'Make the reader work your way'];

test('the tool lists every old tip with an id and its steps, in the order of its tips', () => {
  const meta = [...guide.matchAll(/\['([a-z-]+)',\[((?:'[a-z]+',?)+)\]\]/g)].map((m) => ({ id: m[1], steps: m[2].match(/[a-z]+/g) }));
  const bodies = guide.match(/const tips=\[(.*?)\];\nconst meta/s)[1];
  const titles = [...bodies.matchAll(/title:'([^']*)'/g)].map((m) => m[1]);
  assert.equal(meta.length, 16);
  assert.equal(titles.length + 1, meta.length, 'one dynamic tip (next step) plus the written ones');
  for (const t of OLD_TITLES) assert.ok(titles.includes(t), `tip kept: ${t}`);
  assert.equal(new Set(meta.map((m) => m.id)).size, 16);
  for (const m of meta) assert.ok(m.steps.every((s) => STEPS.includes(s)), `${m.id} names only known steps`);
  for (const s of STEPS) assert.ok(meta.some((m) => m.steps.includes(s)), `step ${s} has tips`);
});

test('cleanTips keeps plain text, caps it and drops anything else', () => {
  const r = cleanTips({ step: 'review', tips: [
    { id: 'a', steps: ['review', 'bogus'], title: ' A  tip ', text: 'x'.repeat(900), label: 'Go' },
    { id: 'a', steps: [], title: 'dup', text: 'dup' },
    { id: 'b', title: 'no text' },
    { id: 7, title: 't', text: 't' },
    null, 'x', { id: 'c', steps: 'review', title: 't', text: 't' },
  ] });
  assert.equal(r.step, 'review');
  assert.deepEqual(r.tips.map((t) => t.id), ['a', 'c']);
  assert.deepEqual(r.tips[0].steps, ['review']);
  assert.equal(r.tips[0].title, 'A tip');
  assert.equal(r.tips[0].text.length, 600);
  assert.equal(r.tips[1].label, 'Take me there');
  assert.equal(cleanTips('x').step, 'model');
  assert.deepEqual(cleanTips({ step: 'nope', tips: 5 }), { step: 'model', tips: [] });
});

test('splitTips: this step first, every other tip behind it, none lost', () => {
  const tips = ['files', 'model', 'export'].map((s, i) => ({ id: `t${i}`, steps: [s], title: s, text: s, label: 'Go' }));
  const { mine, more } = splitTips(tips, 'model');
  assert.deepEqual(mine.map((t) => t.id), ['t1']);
  assert.equal(mine.length + more.length, 3);
});
