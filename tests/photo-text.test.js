/* L5: text in a photo. The line tidying uses invented signs only; the last test guards the rule that no
 * face detection ships. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { signLines } from '../app/ocr.js';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

test('signLines tags a phone number and a street address, and leaves other lines alone', () => {
  const out = signLines([
    { text: 'FOR LEASE', conf: 91 },
    { text: 'Call 555-0100', conf: 88.4 },
    { text: '(555) 555-0142', conf: 70 },
    { text: '100 Example Street', conf: 75 },
    { text: '2200 Sample Ave.', conf: 66 },
  ]);
  assert.deepEqual(out.map((l) => l.kind), [null, 'phone', 'phone', 'address', 'address']);
  assert.equal(out[1].conf, 88);
  assert.equal(out[1].text, 'Call 555-0100');
});

test('signLines drops blank, symbol-only, low-confidence and malformed lines, and tidies spaces', () => {
  const out = signLines([
    { text: '   ', conf: 99 }, { text: '|||  ---', conf: 90 }, { text: 'Sample Bakery', conf: 12 },
    { text: 'SAMPLE   BAKERY ', conf: 55 }, { text: 'no conf' }, null, { text: 'Suite 4', conf: NaN },
  ]);
  assert.deepEqual(out.map((l) => l.text), ['SAMPLE BAKERY']);
  assert.deepEqual(signLines(undefined), []);
});

test('a bare number is not an address, and a year is not a phone number', () => {
  const out = signLines([{ text: '2026 Grand Opening', conf: 80 }, { text: '555 units', conf: 80 }]);
  assert.deepEqual(out.map((l) => l.kind), [null, null]);
});

test('no face detection or recognition code or model ships', () => {
  const bad = /\b(?:faceDetector|face[-_ ]?api|blazeface|face[-_ ]?detect|face[-_ ]?mesh|face[-_ ]?landmark|face[-_ ]?recogni|mediapipe|facenet|haarcascade|dlib)/i;
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'private') continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { walk(f); continue; }
      if (/face|mediapipe|blazeface/i.test(e.name) && !/\.(md|txt)$/.test(e.name)) found.push(`${f} (name)`);
      if (/\.(m?js|json|html|css|webmanifest|tflite|onnx|pb|bin|wasm)$/.test(e.name) && !/\.test\.js$/.test(e.name)) {
        const txt = fs.readFileSync(f, 'latin1');
        if (bad.test(txt)) found.push(f);
        if (/\.(tflite|onnx|pb)$/.test(e.name)) found.push(`${f} (model)`);
      }
    }
  };
  walk(path.join(root, 'app'));
  walk(path.join(root, 'vendor'));
  assert.deepEqual(found, []);
});
