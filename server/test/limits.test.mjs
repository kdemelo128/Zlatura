/* The AI server's limits: a token per device, and what a call may cost in
 * whole cents. Against a local stand-in for the Messages API (no key, no
 * network); the clock is injected so a minute or a UTC day passes instantly. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { rig, answer, EXTRACT_BODY, ASSIST_BODY } from './mockkit.mjs';
import { config } from '../index.mjs';

const sha = async (t) => (await import('node:crypto')).createHash('sha256').update(t).digest('hex');
const T0 = Date.UTC(2026, 9, 22, 18, 0, 0); // 18:00 UTC: six hours to the reset
const clock = (start = T0) => { const c = { t: start, now: () => c.t }; return c; };
// the model's answer used 1000 input and 16,000 output tokens: ceil((1000*1500 + 16000*7500) / 1e6) = 122 cents.
// An assist job reserves its worst case first: 1000 in and max_tokens 8000 = 62 cents.
const BIG = { input_tokens: 1000, output_tokens: 16000 };

test('1: two devices from a file are accepted; deleting a line revokes within the reload, with no restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-tok-'));
  const file = path.join(dir, 'tokens.txt');
  const a = 'a'.repeat(48); const b = 'b'.repeat(48);
  fs.writeFileSync(file, `# devices\nkyle-phone ${await sha(a)}\nanna-laptop ${await sha(b)}  # second\n`);
  const c = clock();
  const r = await rig({ env: { APP_TOKEN: '', APP_TOKENS_FILE: file }, deps: { now: c.now } });
  assert.equal((await r.call(a, '/api/health')).status, 200);
  assert.equal((await r.call(b, '/api/health')).status, 200);
  assert.equal((await r.call('c'.repeat(48), '/api/health')).status, 401);
  fs.writeFileSync(file, `anna-laptop ${await sha(b)}\n`);
  fs.utimesSync(file, new Date(T0 + 5000), new Date(T0 + 5000));
  c.t += 11000;
  const gone = await r.call(a, '/api/health');
  assert.equal(gone.status, 401, 'the withdrawn token stops working');
  assert.match((await gone.json()).message, /missing or wrong/);
  assert.equal((await r.call(b, '/api/health')).status, 200, 'the other device carries on');
  // a malformed file fails closed, naming no token
  fs.writeFileSync(file, `anna-laptop not-a-hash\n`);
  fs.utimesSync(file, new Date(T0 + 9000), new Date(T0 + 9000));
  c.t += 11000;
  const down = await r.call(b, '/api/health');
  assert.equal(down.status, 503);
  const j = await down.json();
  assert.equal(j.error, 'tokens_unavailable');
  assert.ok(!JSON.stringify(j).includes(b));
  fs.writeFileSync(file, `anna-laptop ${await sha(b)}\n`);
  fs.utimesSync(file, new Date(T0 + 20000), new Date(T0 + 20000));
  r.app.reload();
  assert.equal((await r.call(b, '/api/health')).status, 200, 'SIGHUP (reload) picks up the fix at once');
  r.close();
});

test('2: the single APP_TOKEN still works, as device legacy', async () => {
  const r = await rig();
  assert.equal((await r.call('test-token-0123456789', '/api/health')).status, 200);
  assert.equal((await r.call('test-token-0123456789', '/api/assist', ASSIST_BODY)).status, 200);
  assert.equal((await r.call('wrong-token-0123456789', '/api/health')).status, 401);
  r.close();
});

test('3: the rate limit is per device: A is limited and B is not, from the same address', async () => {
  const a = 'a'.repeat(48); const b = 'b'.repeat(48);
  const r = await rig({ env: { RATE_PER_MIN: '1', APP_TOKEN: '', APP_TOKEN_HASHES: `dev-a:${await sha(a)},dev-b:${await sha(b)}` }, tweak: (cfg) => { cfg.aiConfigured = false; } });
  assert.equal((await r.call(a, '/api/assist', {})).status, 501);
  assert.equal((await r.call(a, '/api/assist', {})).status, 429);
  assert.equal((await r.call(b, '/api/assist', {})).status, 501, 'B is not held back by A');
  r.close();
});

test('4: costCents rounds up to a whole cent, prices input and output apart, counts cache tokens as input', async () => {
  const { costCents } = await import('../budget.mjs');
  const p = { inCentsPerMTok: 1500, outCentsPerMTok: 7500 };
  assert.equal(costCents({ input_tokens: 100000, output_tokens: 16000 }, p), 270, 'the note’s worked example: 150 + 120');
  assert.equal(costCents({ input_tokens: 1, output_tokens: 1 }, p), 1, 'a fraction of a cent is a cent');
  assert.equal(costCents({ input_tokens: 0, output_tokens: 0 }, p), 0);
  assert.equal(costCents({ input_tokens: 1000000, output_tokens: 0 }, p), 1500, 'input at the input price');
  assert.equal(costCents({ input_tokens: 0, output_tokens: 1000000 }, p), 7500, 'output at the output price');
  assert.equal(costCents({ input_tokens: 1000000, cache_creation_input_tokens: 1000000, cache_read_input_tokens: 1000000, output_tokens: 0 }, p), 4500, 'cache tokens count');
  assert.equal(costCents(undefined, p), 0);
  assert.ok(Number.isInteger(costCents({ input_tokens: 123457, output_tokens: 7919 }, p)));
});

test('5: a job over the cap is refused with 422 before any model call', async () => {
  const r = await rig();
  r.mock.count = () => ({ input_tokens: 400000 }); // 600 + 120 cents worst case, over the 300 job cap
  const res = await r.call('test-token-0123456789', '/api/extract', EXTRACT_BODY);
  assert.equal(res.status, 422);
  const j = await res.json();
  assert.equal(j.error, 'job_over_budget');
  assert.equal(j.estimateCents, 720); assert.equal(j.capCents, 300);
  assert.match(j.message, /could cost up to \$7\.20, over the \$3\.00 a single job may use/);
  assert.equal(r.messages().length, 0, 'the model was never called');
  r.close();
});

test('5b: when counting tokens fails, bytes/3 over-estimates and the job is still checked', async () => {
  const r = await rig();
  r.mock.count = () => ({ status: 500, body: { type: 'error', error: { type: 'api_error', message: 'x' } } });
  const big = { ...EXTRACT_BODY, documents: [{ name: 'big.txt', text: 'x'.repeat(1500000) }] }; // ~500k estimated tokens
  const res = await r.call('test-token-0123456789', '/api/extract', big);
  assert.equal(res.status, 422);
  assert.equal(r.messages().length, 0);
  r.close();
});

test('6: device-day cap: 429 daily_limit with Retry-After to the UTC reset; the next UTC day starts afresh', async () => {
  const c = clock();
  const r = await rig({ env: { AI_DEVICE_DAY_CAP_CENTS: '150' }, deps: { now: c.now } });
  r.mock.reply = () => answer(ASSIST_OUT, BIG);
  const t = 'test-token-0123456789';
  assert.equal((await r.call(t, '/api/assist', ASSIST_BODY)).status, 200);
  const res = await r.call(t, '/api/assist', ASSIST_BODY); // 122 used + 62 worst case > 150
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '21600');
  const j = await res.json();
  assert.equal(j.error, 'daily_limit');
  assert.equal(j.usedCents, 122); assert.equal(j.capCents, 150);
  assert.equal(j.resetAt, '2026-10-23T00:00:00.000Z');
  assert.match(j.message, /This device has used today's AI allowance \(\$1\.50\)\. It resets at 00:00 UTC, in 6 h 0 min\./);
  assert.equal(r.messages().length, 1, 'the refused job never reached the model');
  c.t = Date.UTC(2026, 9, 23, 0, 0, 1);
  assert.equal((await r.call(t, '/api/assist', ASSIST_BODY)).status, 200, 'after 00:00 UTC the counters are fresh');
  assert.equal((await (await r.call(t, '/api/health')).json()).budget.usedCents, 122);
  r.close();
});

const ASSIST_OUT = { answer: 'ok', citations: [], unknown: [] };

test('6b: the daily request limit', async () => {
  const r = await rig({ env: { AI_DAILY_REQUESTS: '1' } });
  const t = 'test-token-0123456789';
  assert.equal((await r.call(t, '/api/assist', ASSIST_BODY)).status, 200);
  const res = await r.call(t, '/api/assist', ASSIST_BODY);
  assert.equal(res.status, 429);
  const j = await res.json();
  assert.equal(j.error, 'daily_limit'); assert.equal(j.requestLimit, 1);
  assert.ok(Number(res.headers.get('retry-after')) > 0);
  r.close();
});

test('6c: server-day cap holds for everyone, and says so', async () => {
  const a = 'a'.repeat(48); const b = 'b'.repeat(48);
  const r = await rig({ env: { AI_SERVER_DAY_CAP_CENTS: '150', APP_TOKEN: '', APP_TOKEN_HASHES: `dev-a:${await sha(a)},dev-b:${await sha(b)}` } });
  r.mock.reply = () => answer(ASSIST_OUT, BIG);
  assert.equal((await r.call(a, '/api/assist', ASSIST_BODY)).status, 200);
  const res = await r.call(b, '/api/assist', ASSIST_BODY);
  assert.equal(res.status, 429);
  const j = await res.json();
  assert.equal(j.error, 'server_daily_limit');
  assert.ok(Number(res.headers.get('retry-after')) > 0);
  r.close();
});

test('6d: two parallel jobs cannot both pass a cap that fits only one', async () => {
  const r = await rig({ env: { AI_DEVICE_DAY_CAP_CENTS: '100' } }); // one reservation is 62 cents, two are 124
  r.mock.delayMs = 150;
  r.mock.reply = () => answer(ASSIST_OUT, BIG);
  const t = 'test-token-0123456789';
  const both = await Promise.all([r.call(t, '/api/assist', ASSIST_BODY), r.call(t, '/api/assist', ASSIST_BODY)]);
  assert.deepEqual(both.map((x) => x.status).sort(), [200, 429]);
  r.close();
});

test('6e: a failed model call gives its hold back', async () => {
  const r = await rig({ env: { AI_DEVICE_DAY_CAP_CENTS: '100' } });
  const t = 'test-token-0123456789';
  r.mock.reply = () => ({ status: 500, body: { type: 'error', error: { type: 'api_error', message: 'x' } } });
  assert.equal((await r.call(t, '/api/assist', ASSIST_BODY)).status, 500);
  r.mock.reply = () => answer(ASSIST_OUT, BIG);
  assert.equal((await r.call(t, '/api/assist', ASSIST_BODY)).status, 200, 'the failed call did not use the allowance');
  assert.equal((await (await r.call(t, '/api/health')).json()).budget.usedCents, 122);
  r.close();
});

test('6f: transcription counts one request and is settled by the minute (or the job cap when the length is missing)', async () => {
  const body = { name: 'm.m4a', mediaType: 'audio/mp4', data: Buffer.from('abc').toString('base64') };
  const t = 'test-token-0123456789';
  let r = await rig({ tweak: (cfg) => { cfg.stt = { url: 'https://stt.invalid/x', key: '', model: 'w' }; } });
  const mk = (duration) => async () => ({ ok: true, json: async () => ({ text: 'hi', segments: [], duration }) });
  r.close();
  for (const [duration, cents] of [[125, 6], [undefined, 300]]) {
    r = await rig({ deps: { fetch: mk(duration) } });
    assert.equal((await r.call(t, '/api/transcribe', body)).status, 200);
    const u = (await (await r.call(t, '/api/health')).json()).budget;
    assert.equal(u.usedCents, cents); assert.equal(u.requests, 1);
    r.close();
  }
});

test('7: a new handler starts with zero counters (a restart resets the day: documented)', async () => {
  const r1 = await rig();
  r1.mock.reply = () => answer(ASSIST_OUT, BIG);
  await r1.call('test-token-0123456789', '/api/assist', ASSIST_BODY);
  assert.equal((await (await r1.call('test-token-0123456789', '/api/health')).json()).budget.usedCents, 122);
  const r2 = await rig();
  assert.equal((await (await r2.call('test-token-0123456789', '/api/health')).json()).budget.usedCents, 0);
  r1.close(); r2.close();
});

test('8: startup refuses bad hashes, duplicate labels and cents that are not whole numbers', async () => {
  for (const bad of ['1.5', '-3', 'abc', '1e3']) assert.throws(() => config({ APP_TOKEN: 'x'.repeat(20), AI_JOB_CAP_CENTS: bad }), /whole number/, `AI_JOB_CAP_CENTS=${bad}`);
  assert.throws(() => config({ AI_PRICE_IN_CENTS_PER_MTOK: '15.5' }), /whole number/);
  assert.throws(() => config({ STT_PRICE_CENTS_PER_MIN: '0.5' }), /whole number/);
  assert.throws(() => config({ APP_TOKEN_HASHES: 'dev:nothex' }), /64 hex/);
  const h = await sha('x');
  assert.throws(() => config({ APP_TOKEN_HASHES: `dev:${h},dev:${h}` }), /used twice/);
  assert.throws(() => config({ APP_TOKEN_HASHES: `Bad Label:${h}` }), /label/);
  assert.equal(config({ AI_JOB_CAP_CENTS: ' 450 ' }).jobCents, 450);
  // the real process stops, with a message and no stack
  const run = spawnSync(process.execPath, [new URL('../index.mjs', import.meta.url).pathname], { env: { PATH: process.env.PATH, APP_TOKEN: 'x'.repeat(20), AI_JOB_CAP_CENTS: '1.5', PORT: '18991' }, encoding: 'utf8', timeout: 4000 });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /whole number/);
  // and a tokens file that is missing
  const run2 = spawnSync(process.execPath, [new URL('../index.mjs', import.meta.url).pathname], { env: { PATH: process.env.PATH, APP_TOKENS_FILE: '/nonexistent/zl-tokens', PORT: '18992' }, encoding: 'utf8', timeout: 4000 });
  assert.equal(run2.status, 1);
});

test('tokens.mjs new prints a token once and the line to paste, and the line matches it', async () => {
  const out = spawnSync(process.execPath, [new URL('../tokens.mjs', import.meta.url).pathname, 'new', 'kyle-phone'], { encoding: 'utf8' }).stdout;
  const token = out.match(/\n  ([0-9a-f]{48})\n/)[1];
  const line = out.match(/\n  (kyle-phone [0-9a-f]{64})\n?$/)[1];
  assert.equal(line, `kyle-phone ${await sha(token)}`);
});
