/* A local stand-in for the Messages API plus the AI server in front of it, for
 * the limits and injection tests. No key, no network. */
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { handler, config } from '../index.mjs';

export const answer = (json, usage = { input_tokens: 1000, output_tokens: 100 }, stop = 'end_turn') => ({
  id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: stop, stop_sequence: null,
  content: [{ type: 'text', text: JSON.stringify(json) }], usage,
});
export const EMPTY_ASSIST = { answer: 'ok', citations: [], unknown: [] };

/**
 * rig({ env, deps, tweak }) -> { url, seen, mock: {reply, count, delayMs}, cfg, call(token, path, body), close() }
 * `mock.reply(body)` answers /v1/messages, `mock.count(body)` answers count_tokens.
 */
export async function rig({ env = {}, deps = {}, tweak } = {}) {
  const seen = [];
  const mock = { reply: () => answer(EMPTY_ASSIST), count: () => ({ input_tokens: 1000 }), delayMs: 0, down: false };
  const up = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', async () => {
      let body = {};
      try { body = JSON.parse(b || '{}'); } catch { /* the speech stand-in gets form data */ }
      seen.push({ url: req.url, body });
      if (mock.delayMs) await new Promise((r) => setTimeout(r, mock.delayMs));
      const counting = req.url.startsWith('/v1/messages/count_tokens');
      const r = counting ? mock.count(body) : mock.reply(body);
      if (r.drop) { req.socket.destroy(); return; } // the connection drops mid-call
      res.writeHead(r.status || 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.body ?? r));
    });
  });
  await new Promise((r) => up.listen(0, '127.0.0.1', r));
  const upUrl = `http://127.0.0.1:${up.address().port}`;
  const client = new Anthropic({ apiKey: 'sk-test-not-real', baseURL: upUrl, maxRetries: 0 });
  const cfg = config({ APP_TOKEN: 'test-token-0123456789', ANTHROPIC_API_KEY: 'sk-test-not-real', ...env });
  cfg.stt = { url: `${upUrl}/stt`, key: '', model: 'whisper-1' };
  if (tweak) tweak(cfg);
  const app = handler(cfg, client, deps);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url, seen, mock, cfg, app,
    messages: () => seen.filter((x) => x.url === '/v1/messages?beta=true'),
    call: (token, path, body) => fetch(url + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) }),
    close: () => { server.close(); up.close(); },
  };
}

export const EXTRACT_BODY = { documents: [{ name: 'om.txt', text: 'Asking Price $6,450,000' }], fields: [{ key: 'price', label: 'Asking price', kind: 'money' }] };
export const ASSIST_BODY = { question: 'What is the price?', facts: [{ id: 'f1', label: 'Price', value: '$6,450,000' }] };
export const MEETING_BODY = { transcript: 'Seller: we are 92% leased.', fields: [{ key: 'occ', label: 'Occupancy' }] };
