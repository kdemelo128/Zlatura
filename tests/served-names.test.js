/* Content blockers match file names: EasyPrivacy blocks "/fingerprint.js" on every github.io site, and a blocked
 * module takes the whole app down. No served file may be named like a tracker. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

const BAD = /fingerprint|analytics|track|beacon|pixel|adserver|telemetry/i;
test('no file served from app/, vendor/, fonts/ or icons/ has a tracker-like name (blockers would stop the app loading)', () => {
  const root = new URL('../', import.meta.url);
  for (const d of ['app', 'vendor', 'fonts', 'icons']) {
    for (const f of readdirSync(new URL(d + '/', root))) {
      assert.ok(!BAD.test(f), `${d}/${f}: content blockers block files named like trackers (fingerprint, analytics, track, beacon, pixel, adserver, telemetry); rename it`);
    }
  }
});
