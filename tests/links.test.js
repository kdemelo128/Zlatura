import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeHref, mailtoHref, telHref, SAFE_SCHEMES } from '../app/links.js';

test('safeHref lets only http, https, mailto and tel through', () => {
  assert.deepEqual(SAFE_SCHEMES, ['http:', 'https:', 'mailto:', 'tel:']);
  for (const ok of ['http://a.test/x', 'https://a.test/?q=1', 'mailto:a@b.test', 'tel:+15551234567', '  https://a.test  ']) assert.ok(safeHref(ok), ok);
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', '\u0001javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'file:///etc/passwd', 'blob:https://a.test/x', 'ftp://a.test', '//a.test', '/relative', 'a.test', '', null, undefined, {}, 0]) {
    assert.equal(safeHref(bad), '', String(bad));
  }
});

test('mailtoHref cannot add a header, and refuses text that is not an address', () => {
  assert.equal(mailtoHref('a@b.test'), 'mailto:a@b.test');
  assert.equal(mailtoHref("o'brien@b.test"), "mailto:o'brien@b.test");
  const h = mailtoHref('a@b.test?bcc=evil@x.test&subject=hi#frag');
  assert.ok(h.startsWith('mailto:'), h);
  assert.ok(!/[?&#]/.test(h.slice(7)), h);
  assert.equal(mailtoHref('javascript:alert(1)'), '');
  assert.equal(mailtoHref(''), ''); assert.equal(mailtoHref(null), ''); assert.equal(mailtoHref('@b.test'), ''); assert.equal(mailtoHref('a@'), '');
});

test('telHref keeps digits and a plus, and nothing else', () => {
  assert.equal(telHref('(555) 123-4567'), 'tel:5551234567');
  assert.equal(telHref('+1 555 123 4567'), 'tel:+15551234567');
  assert.equal(telHref('javascript:alert(1)'), 'tel:1');
  assert.equal(telHref('call me'), ''); assert.equal(telHref(null), ''); assert.equal(telHref('+'), '');
});
