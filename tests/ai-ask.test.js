/* The bird's web questions: what the guard lets through, what goes with a question, and how a reply is made safe
 * to draw. Invented names only. */
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window ||= {}; globalThis.document ||= { addEventListener() {}, dispatchEvent() {} };
const { blockReason } = await import('../app/ai.js');
const { planAsk, safeBlocks, safeUrl, sourceText, errorText, CONFIDENTIAL_NOTE } = await import('../app/askweb.js');

const open = { id: 'dOpen', name: 'Sample Court', confidential: false };
const secret = { id: 'dSecret', name: 'Invented Plaza', confidential: true };

test('/api/ask takes a deal scope (a confidential deal refused, as for any deal call) or an ask scope', () => {
  assert.equal(blockReason('/api/ask', { deal: open }), null);
  assert.match(blockReason('/api/ask', { deal: secret }), /confidential/);
  assert.match(blockReason('/api/ask', { deal: { ...open, confidential: 1 } }), /confidential/, 'a hand-edited flag blocks');
  assert.match(blockReason('/api/ask', { deal: open }, { stored: secret }), /confidential/, 'the saved copy counts');
  assert.equal(blockReason('/api/ask', { ask: true }), null);
});

test('an ask scope fits only /api/ask, and the other scope rules are unchanged', () => {
  for (const p of ['/api/extract', '/api/assist', '/api/research', '/api/health', '/api/transcribe', '/api/meeting']) assert.match(blockReason(p, { ask: true }), /does not match/, p);
  for (const s of [undefined, {}, { ask: true, deal: open }, { ask: true, health: true }]) assert.match(blockReason('/api/ask', s), /scope/, JSON.stringify(s));
  assert.match(blockReason('/api/ask', { research: { company: 'X' } }), /does not match/);
  assert.match(blockReason('/api/health', { deal: open }), /does not match/);
});

test('planAsk: no deal open sends the question alone, in an ask scope', () => {
  const p = planAsk(null, 'What are cap rates doing?', () => { throw new Error('no facts without a deal'); });
  assert.deepEqual(p, { scope: { ask: { question: p.scope.ask.question } }, facts: [], note: '' });
});

test('planAsk: an open deal sends its facts, in a deal scope', () => {
  const facts = [{ id: 'f1', label: 'Price', value: '$1', source: 'typed' }];
  const p = planAsk(open, 'Anything?', () => facts);
  assert.deepEqual(p.scope, { deal: { id: 'dOpen', confidential: false } });
  assert.equal(p.facts, facts);
});

test('planAsk: a confidential deal sends no facts, says so, and a question that names it is refused', () => {
  const p = planAsk(secret, 'How are office rents trending?', () => { throw new Error('facts must not be read'); });
  assert.deepEqual(p, { scope: { ask: { question: p.scope.ask.question } }, facts: [], note: CONFIDENTIAL_NOTE });
  assert.equal(CONFIDENTIAL_NOTE, 'This deal is confidential, so only your question was sent.');
  assert.match(planAsk(secret, 'Tell me about INVENTED PLAZA', () => []).refuse, /confidential/);
  assert.match(planAsk({ ...secret, name: 'Invented Plaza (draft)' }, 'what about invented plaza?', () => []).refuse, /confidential/, 'a note in brackets is not part of what is said');
});

test('safeBlocks keeps text and http(s) sources only, deduped, and never builds HTML', () => {
  const r = safeBlocks({ blocks: [
    { text: 'Rates near 6%.', sources: [{ url: 'https://example.com/a', title: '<b>A</b>' }, { url: 'https://example.com/a', title: 'dup' }, { url: 'javascript:alert(1)', title: 'x' }, { url: 'data:text/html,1', title: 'y' }, { url: 'ftp://h/f' }, { url: 'not a url' }, { title: 'no url' }, null, { url: 'http://example.org/b' }] },
    { text: '   ', sources: [] }, { text: 5 }, null, { text: 'No sources.' },
  ] });
  assert.deepEqual(r, [
    { text: 'Rates near 6%.', sources: [{ url: 'https://example.com/a', text: '<b>A</b>' }, { url: 'http://example.org/b', text: 'example.org' }] },
    { text: 'No sources.', sources: [] },
  ]);
  for (const bad of [null, undefined, {}, { blocks: 'x' }, []]) assert.deepEqual(safeBlocks(bad), []);
});

test('safeUrl and sourceText', () => {
  assert.equal(safeUrl('https://a.example/x?y=1'), 'https://a.example/x?y=1');
  for (const u of ['javascript:1', 'file:///etc/passwd', '', null, undefined, 'blob:https://a']) assert.equal(safeUrl(u), null);
  assert.equal(sourceText({ url: 'https://a.example/x', title: '  ' }), 'a.example');
  assert.equal(sourceText({ url: 'https://a.example/x', title: 'T'.repeat(300) }).length, 120);
});

test('errorText shows the message and the code plainly', () => {
  assert.equal(errorText(Object.assign(new Error('This device has used today’s allowance.'), { code: 'daily_limit' })), 'This device has used today’s allowance. (daily_limit)');
  assert.equal(errorText(new Error('Plain.')), 'Plain.');
  assert.match(errorText(null), /did not answer/);
});

test('an ask with no deal open is refused when the question names any confidential deal, by name or address', async () => {
  const { namesConfidential } = await import('../app/ai.js');
  const deals = [
    { id: 'a', name: 'Willow Court (draft)', confidential: true, figures: { address: '12 Harbor Lane' } },
    { id: 'b', name: 'Open Plaza', confidential: false, figures: { address: '9 Elm St' } },
  ];
  assert.match(blockReason('/api/ask', { ask: { question: 'What cap rate for WILLOW   court?' } }, { deals }), /confidential deal/);
  assert.match(blockReason('/api/ask', { ask: { question: 'flood zone at 12 harbor lane' } }, { deals }), /confidential deal/);
  assert.equal(blockReason('/api/ask', { ask: { question: 'What is a cap rate at Open Plaza?' } }, { deals }), null);
  assert.equal(blockReason('/api/ask', { ask: { question: 'Ten-year Treasury today?' } }, { deals }), null);
  assert.equal(namesConfidential('anything', [{ name: 'ab', confidential: true }]), false, 'names under 3 characters never match');
});
