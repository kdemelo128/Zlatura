/* Ready for a rename: the product's name and mark live in app/brand.js and nowhere else, so changing
 * them is a one-file change. The manifest and index.html cannot import a module, so they are checked to
 * agree with it. What must NOT change on a rename is listed here too. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRODUCT, TAGLINE, MARK, DESCRIPTOR, KEY_PREFIX, FORMATS, FORMERLY, ABOUT_NAME, OLD_KEY_PREFIX, RENAMED_FLAG } from '../app/brand.js';
import { icsFor } from '../app/ics.js';
import { readBackup, planRestore, BACKUP_FORMAT, LOCAL_KEYS } from '../app/backup.js';

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
  const body = MARK.body.match(/<path[^>]* d="([^"]+)"/)[1];
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
  const cut = (s, open, close) => { // a plain scan, so no markup is ever filtered by pattern
    let out = '';
    for (let i = 0; ;) {
      const a = s.toLowerCase().indexOf(open, i);
      if (a < 0) return out + s.slice(i);
      const b = s.toLowerCase().indexOf(close, a + open.length);
      out += s.slice(i, a);
      if (b < 0) return out;
      i = b + close.length;
    }
  };
  const rest = cut(cut(html.replace(/<title>.*?<\/title>/, '').replace(/<meta [^>]*>/g, '').replace(/<h2>[^<]*<\/h2>/g, ''), '<script', '</script>'), '<!--', '-->');
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

});

// ---- PR 6: the display name is Monal; every storage id is still the old one (changed later, with a migration) ----

test('the visible name is Monal: brand.js, the title, the manifest, an export', () => {
  assert.equal(PRODUCT, 'Monal');
  assert.match(read(new URL('../index.html', import.meta.url)), /<title>Monal<\/title>/);
  const m = JSON.parse(read(new URL('../manifest.webmanifest', import.meta.url)));
  assert.equal(m.name, 'Monal');
  assert.equal(m.short_name, 'Monal');
  assert.ok(m.description.startsWith('Monal: '));
  const ics = icsFor([{ evId: 'u1@zlatura.invalid', date: '2027-03-01', title: 'Closing', alarms: [] }], { now: 0, version: '9.9.9' });
  assert.ok(ics.includes('PRODID:-//Monal//Monal 9.9.9//EN'), 'an exported calendar names the product');
  assert.match(FORMERLY, /Zlatura/);
  assert.ok(!ABOUT_NAME.includes('Zlatura'), 'the About text no longer explains the old name');
});

test('storage ids, backup ids, cache names and the manifest id did NOT change with the name', () => {
  assert.equal(KEY_PREFIX, 'zlatura.');
  assert.equal(OLD_KEY_PREFIX, 'comp-loader.');
  assert.equal(RENAMED_FLAG, 'zlatura.renamed');
  assert.equal(FORMATS.backup.write, 'zlatura-backup');
  assert.equal(FORMATS.project.write, 'zlatura-project');
  assert.equal(FORMATS.template.write, 'zlatura-template');
  assert.equal(BACKUP_FORMAT, 'zlatura-backup');
  assert.deepEqual(LOCAL_KEYS, ['zlatura.tools.v1', 'zlatura.subject.v1', 'zlatura.loan.v1']);
  assert.match(read(new URL('../app/store.js', import.meta.url)), /^const DB = 'zlatura';$/m);
  const sw = read(new URL('../sw.js', import.meta.url));
  assert.ok(sw.includes('const CACHE = `zlatura-${VERSION}`;'));
  assert.ok(sw.includes("const OCR_CACHE = 'zlatura-ocr-tesseract-7.0.0';"));
  assert.ok(sw.includes("const UW_CACHE = 'zlatura-uwfiller';"));
  const m = JSON.parse(read(new URL('../manifest.webmanifest', import.meta.url)));
  assert.equal(m.id, './');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
});

test('a backup made under the old name still restores', () => {
  const deal = { id: 'd1', name: '8820 Sample Pike', updatedAt: 5, inputs: {} };
  for (const format of ['zlatura-backup', 'comp-loader-backup']) {
    const b = readBackup(JSON.stringify({ format, version: 2, deals: [deal], kv: { 'crm.tasks': [{ id: 't1', title: 'Call' }] }, local: { 'zlatura.loan.v1': 'x' } }));
    const p = planRestore(b, { deals: [], kv: {}, session: null, local: {} });
    assert.deepEqual(p.deals.put.map((d) => d.id), ['d1'], format);
    assert.deepEqual(p.kv['crm.tasks'].map((t) => t.title), ['Call'], format);
    assert.equal(p.local['zlatura.loan.v1'], 'x', format);
  }
});

test('no string a person can see still says Zlatura, except the one "formerly" line', () => {
  // storage and format ids that must keep the old name until the data migration (PR 7): each is matched and removed
  const ALLOWED = [
    /zlatura\.[a-z']/gi, // localStorage keys 'zlatura.loan.v1', the renamed flag
    /zlatura:storage/g, /__zlatura[A-Za-z]*/g, // an internal event and window flags
    /'zlatura'/g, /'zlatura-(backup|project|template|abstracts|comps|uwfiller|ocr-tesseract-[\d.]+)'/g, /`zlatura-\$\{VERSION\}`/g, // database, format, profile and cache ids
    /zlatura\.invalid/g, // the host part of calendar UIDs
    /"Zlatura Serif"/g, // a font family id
    /'Zlatura Audit'/g, // the name of an audit sheet written by 4.7.128 and before, still recognised when refilling
    /FORMERLY = 'Formerly called Zlatura\.'/g,
  ];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(new URL(`${d.name}/`, dir)) : /\.(js|css)$/.test(d.name) ? [new URL(d.name, dir)] : []));
  const targets = [...walk(APP), new URL('../index.html', import.meta.url)];
  const bad = [];
  for (const u of targets) {
    let src = read(u);
    if (u.pathname.endsWith('.html')) { let prev; do { prev = src; src = src.replace(/<!--[\s\S]*?-->/g, ''); } while (src !== prev); }   // repeated until nothing is left: one pass can leave a new opener behind
    else src = stripComments(src);
    for (const re of ALLOWED) src = src.replace(re, '');
    src.split('\n').forEach((l, i) => { if (/zlatura/i.test(l)) bad.push(`${u.pathname.split('/').slice(-2).join('/')}:${i + 1}: ${l.trim().slice(0, 100)}`); });
  }
  assert.deepEqual(bad, []);
});

// The crest, plumage and feet are readable vector art, shared by all static assets.
test('the bird artwork is shared by the favicon and both wordmarks', () => {
  assert.equal(MARK.viewBox, '0 0 128 128');
  for (const asset of ['icons/favicon.svg', 'docs/brand/logo-light.svg', 'docs/brand/logo-dark.svg']) {
    const svg = read(new URL(`../${asset}`, import.meta.url));
    assert.ok(svg.includes(MARK.body), `${asset} must be regenerated from the brand record`);
  }
});
