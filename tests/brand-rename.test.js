/* Ready for a rename: the product's name and mark live in app/brand.js and nowhere else, so changing
 * them is a one-file change. The manifest and index.html cannot import a module, so they are checked to
 * agree with it. What must NOT change on a rename is listed here too. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRODUCT, TAGLINE, MARK, DESCRIPTOR, KEY_PREFIX } from '../app/brand.js';

const APP = new URL('../app/', import.meta.url);
const read = (u) => fs.readFileSync(u, 'utf8');
const files = fs.readdirSync(APP).filter((f) => f.endsWith('.js') && f !== 'brand.js');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');

test('the product name is written in app/brand.js only (comments aside)', () => {
  for (const f of files) {
    const hits = stripComments(read(new URL(f, APP))).split('\n').filter((l) => l.includes(PRODUCT));
    assert.deepEqual(hits, [], `${f} writes the name "${PRODUCT}" itself: use PRODUCT from brand.js`);
  }
  // the CSS may name the product only in the font family "Zlatura Serif", an id that is not shown to anyone
  const st = stripComments(read(new URL('styles.css', APP))).replaceAll(`"${PRODUCT} Serif"`, '');
  assert.ok(!st.includes(PRODUCT), 'styles.css names the product');
});

test('the mark is drawn once, in brand.js', () => {
  const body = MARK.body.match(/d="([^"]+)"/)[1];
  for (const f of files) assert.ok(!read(new URL(f, APP)).includes(body), `${f} holds a copy of the mark`);
  const html = read(new URL('../index.html', import.meta.url));
  assert.ok(!html.includes(body), 'index.html holds a copy of the mark');
  assert.equal((html.match(/data-brand-mark/g) || []).length, 2, 'the sidebar and the top bar each show the mark by reference');
  assert.ok((html.match(/data-brand-name/g) || []).length >= 2 && html.includes('data-brand-sub'));
  assert.ok(DESCRIPTOR && !html.includes(DESCRIPTOR), 'the line under the name comes from brand.js');
});

test('index.html names the product only where no module can: the title, two meta lines and the load-failure panels', () => {
  const html = read(new URL('../index.html', import.meta.url));
  assert.match(html, new RegExp(`<title>${PRODUCT}</title>`));
  assert.match(html, new RegExp(`name="apple-mobile-web-app-title" content="${PRODUCT}"`));
  assert.match(html, new RegExp(`name="description" content="${PRODUCT}, `));
  assert.ok(html.includes(TAGLINE), 'the description carries the tagline');
  // everything else that says the name is a fallback panel or a script (storage keys), none shown by the app
  const rest = html
    .replace(/<title>.*?<\/title>/, '').replace(/<meta [^>]*>/g, '')
    .replace(/<h2>[^<]*<\/h2>/g, '').replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const left = rest.split('\n').filter((l) => l.includes(PRODUCT));
  assert.deepEqual(left, [], 'index.html names the product somewhere not listed');
});

test('the manifest agrees with brand.js', () => {
  const m = JSON.parse(read(new URL('../manifest.webmanifest', import.meta.url)));
  assert.equal(m.name, PRODUCT);
  assert.equal(m.short_name, PRODUCT);
  assert.ok(m.description.startsWith(`${PRODUCT}: `) && m.description.includes(TAGLINE));
});

test('what must not change on a rename is still the same', () => {
  assert.equal(KEY_PREFIX, 'zlatura.', 'saved settings are read under this prefix; a rename never moves them');
  assert.equal(MARK.viewBox, '0 0 24 24');
});
