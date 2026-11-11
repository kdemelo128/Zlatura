/* tools/uwtool-import.mjs on an INVENTED stand-in package and an invented deny-list, both built here.
   Nothing of the real package or its rules is in this file: the rules the real run uses live under private/.
   Blind spot: this proves the engine, not that the private rules fit the real package (the local run reports that). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildImport, parseTerms, allowed, harvest, base64Runs, fingerprint, main, MANIFEST } from '../tools/uwtool-import.mjs';

const enc = (s) => new Uint8Array(Buffer.from(s));
const FIRM = ['Ac', 'meCorp'].join('');            // invented firm word, built at run time
const SECRET_SHEET = ['Zork', 'Sheet'].join('');
const PUB = JSON.parse(fs.readFileSync(new URL('../tools/uwtool-import.public.json', import.meta.url), 'utf8'));

/** The invented package: a tool folder with one data block, one firm line, plus things that must stay out. */
function standin() {
  return {
    'public/tool/index.html': enc(`<html><head><title>Tool</title></head><body>
<input id="cap1" value="6.25">
<script id="layoutspec" type="application/json">{"names":["${SECRET_SHEET} layout","plain sheet name"]}</script>
<script src="app.js"></script></body></html>`),
    'public/tool/app.js': enc(`const owner = '${FIRM}';\nconst fallback = 6.25;\nexport const ok = 1;\n`),
    'public/tool/firm-only.js': enc(`// fills the firm layout ${SECRET_SHEET}\n`),
    'public/tool/example.json': enc('{"real":"deal"}'),
    'public/tool/style.css': enc('body{margin:0}'),
    'public/tool/stray.xlsx': enc('not a tool file'),
    'notes.md': enc(`about ${FIRM}`),
    'scripts/x.cjs': enc('x'),
    'app/api/route.js': enc('x'),
  };
}
const RULES = () => ({
  edits: [
    { id: 'blk', category: 'd', op: 'removeBlock', file: 'public/tool/index.html'.replace('public/tool/', ''), start: '<script id="layoutspec"', end: '</script>', pack: true, harvest: true },
    { id: 'cap', category: 'c', op: 'replace', file: 'index.html', find: ' value="6.25"', replace: '' },
    { id: 'own', category: 'b', op: 'replace', file: 'app.js', find: `'${FIRM}'`, replace: `''` },
    { id: 'fb', category: 'c', op: 'replace', file: 'app.js', find: 'const fallback = 6.25;', replace: 'const fallback = null;' },
    { id: 'mv', category: 'd', op: 'dropFile', file: 'firm-only.js', pack: true },
    { id: 'ex', category: 'c', op: 'replaceFile', file: 'example.json', with: 'example.json' },
  ],
});
const run = (over = {}) => {
  const rules = over.rules || RULES();
  return buildImport({ pkg: over.pkg || standin(), pub: over.pub || PUB, rules, terms: over.terms || parseTerms(`# invented\n${FIRM}\n${SECRET_SHEET}\n`), extra: { 'example.json': enc('{"invented":true}') } });
};
const text = (r, f) => Buffer.from(r.out[f]).toString('utf8');

test('the allow-list copies only the tool folder and only listed file types', () => {
  assert.equal(allowed('a.js', ['public/tool/']), false);
  assert.equal(allowed('x/a.js', ['x/']), true);
  assert.equal(allowed('x/a.xlsx', ['x/'], ['js']), false);
  assert.equal(allowed('x/a.JS', ['x/'], ['js']), true);
  assert.equal(allowed('x/exact.js', ['x/exact.js']), true);
  const r = run();
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.deepEqual(Object.keys(r.out).sort(), ['app.js', 'example.json', 'index.html', 'style.css']);
  assert.equal(r.counts.outsideRoot, 3);
  assert.equal(r.counts.leftOutByAllowList, 1, 'the stray workbook inside the folder is left out by type');
});

test('edits apply: block removed, text replaced, file dropped and replaced, the rest untouched', () => {
  const r = run();
  assert.ok(r.ok, r.errors.join('\n'));
  assert.ok(!text(r, 'index.html').includes('layoutspec') && !text(r, 'index.html').includes('value='));
  assert.ok(text(r, 'index.html').includes('<script src="app.js">'));
  assert.equal(text(r, 'app.js'), `const owner = '';\nconst fallback = null;\nexport const ok = 1;\n`);
  assert.equal(text(r, 'example.json'), '{"invented":true}');
  assert.equal(text(r, 'style.css'), 'body{margin:0}');
  assert.deepEqual(Object.keys(r.pack).sort(), ['blk.txt', 'firm-only.js'], 'what was cut goes to the pack, never the output');
  assert.deepEqual(r.counts.editsByCategory, { d: 2, c: 3, b: 1 });
  assert.equal(r.counts.editsApplied, 6);
  assert.equal(r.counts.expectedTextMissing, 0);
  assert.ok(r.counts.bytesAfter < r.counts.bytesBefore);
});

test('MUTATION: a rule whose expected text is absent fails the run and names the edit id', () => {
  for (const [i, patch] of [[1, { find: ' value="9.99"' }], [2, { find: `'NoSuchWord'` }], [0, { start: '<script id="nope"' }]]) {
    const rules = RULES(); Object.assign(rules.edits[i], patch);
    const r = run({ rules });
    assert.equal(r.ok, false);
    assert.equal(r.counts.expectedTextMissing, 1);
    assert.ok(r.errors.some((e) => e.startsWith(`edit ${rules.edits[i].id}:`)), r.errors.join('|'));
  }
});

test('an edit matching a different number of times than expected fails; a stated count passes', () => {
  const pkg = standin(); pkg['public/tool/app.js'] = enc('a a a');
  const rules = { edits: [{ id: 'two', category: 'x', op: 'replace', file: 'app.js', find: 'a', replace: 'b', count: 2 }] };
  const none = parseTerms('zzzzz');
  assert.equal(run({ pkg, rules, terms: none }).ok, false);
  rules.edits[0].count = 3; const r = run({ pkg, rules, terms: none });
  assert.ok(r.ok); assert.equal(text(r, 'app.js'), 'b b b');
  assert.equal(run({ rules: { edits: [{ id: 'f', category: 'x', op: 'replace', file: 'gone.js', find: 'a', replace: 'b' }] } }).ok, false, 'edit of a file not in the output');
  assert.equal(run({ rules: { edits: [{ id: 'u', category: 'x', op: 'bogus', file: 'app.js' }] } }).ok, false);
});

test('MUTATION: a deny-listed term left in the output refuses the write, naming the line and never the term', () => {
  const rules = RULES(); rules.edits.splice(2, 1);          // forget to take the firm word out of app.js
  const r = run({ rules });
  assert.equal(r.ok, false);
  const msg = r.errors.join('\n');
  assert.ok(msg.includes('app.js: deny-list line 2'), msg);
  assert.ok(!msg.includes(FIRM) && !msg.includes(SECRET_SHEET), 'no term is ever printed');
  assert.equal(r.counts.findings >= 1, true);
  // case-insensitive, and in a path
  const pkg = standin(); pkg[`public/tool/${FIRM.toLowerCase()}.js`] = enc('x');
  const r2 = run({ pkg });
  assert.equal(r2.ok, false); assert.ok(!r2.errors.join('\n').includes(FIRM.toLowerCase()));
});

test('a string harvested from a removed block is refused if it survives elsewhere', () => {
  assert.deepEqual(harvest('{"a":"short","b":"long enough value"}'), ['long enough value']);
  const pkg = standin(); pkg['public/tool/style.css'] = enc('/* plain sheet name */');
  const r = run({ pkg });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('style.css') && e.includes('removed block')));
  assert.ok(r.counts.harvestedStrings >= 2, 'the strings of 8+ characters in the cut block, markup attributes included');
});

test('harvestIgnore lets a reviewed ordinary string through, and only that one', () => {
  const pkg = standin(); pkg['public/tool/style.css'] = enc('/* plain sheet name */');
  const rules = RULES(); rules.harvestIgnore = ['plain sheet name'];
  assert.equal(run({ pkg, rules }).ok, true);
  assert.equal(run({ pkg, rules: { ...rules, harvestIgnore: ['other'] } }).ok, false);
});

test('MUTATION: the base64 ceiling trips; the exact allow-list exempts only the named file', () => {
  const pkg = standin(); pkg['public/tool/big.js'] = enc(`var x="${'QUJD'.repeat(2000)}";`);   // 8000 chars
  const r = run({ pkg });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.startsWith('refused: big.js: base64 run of 8000')));
  assert.equal(run({ pkg, pub: { ...PUB, base64Allow: ['big.js'] } }).ok, true);
  assert.equal(run({ pkg, pub: { ...PUB, base64Ceiling: 8000 } }).ok, true, 'at the ceiling passes, over it fails');
  assert.deepEqual(base64Runs({ 'a.js': enc('A'.repeat(100)) }, 99), [{ path: 'a.js', length: 100 }]);
  assert.deepEqual(base64Runs({ 'a.bin': new Uint8Array([65, 0, 66]) }, 1), [], 'binary files are not read as text');
});

test('the manifest holds hashes and counts only, and the fingerprint matches the pkg.js recipe', () => {
  const r = run(); assert.ok(r.ok);
  const m = JSON.stringify(r.manifest);
  for (const bad of [FIRM, SECRET_SHEET, 'plain sheet name', '6.25', 'invented', 'layoutspec']) assert.ok(!m.includes(bad), `manifest leaks ${bad}`);
  assert.deepEqual(Object.keys(r.manifest.files).sort(), ['app.js', 'example.json', 'index.html', 'style.css']);
  assert.match(r.manifest.files['app.js'].out, /^[0-9a-f]{64}$/);
  assert.notEqual(r.manifest.files['app.js'].in, r.manifest.files['app.js'].out);
  assert.equal(r.manifest.files['style.css'].in, r.manifest.files['style.css'].out);
  assert.match(r.manifest.licence, /all rights reserved/);
  assert.deepEqual(Object.keys(r.manifest.edits[0]).sort(), ['applied', 'category', 'id', 'lines', 'op']);
  assert.equal(r.manifest.edits[0].lines, 0);
  const a = { 'x': enc('1'), 'y': enc('2') }, b = { 'y': enc('2'), 'x': enc('1') };
  assert.equal(fingerprint(a), fingerprint(b), 'order does not matter');
  assert.notEqual(fingerprint(a), fingerprint({ x: enc('1'), y: enc('3') }));
  // a changed package changes the fingerprint
  const p2 = standin(); p2['public/tool/style.css'] = enc('body{margin:1px}');
  assert.notEqual(run({ pkg: p2 }).manifest.package.fingerprint, r.manifest.package.fingerprint);
});

test('the command line writes the output and manifest; refuses with no deny-list, a bad rule or a dirty output folder; writes nothing on refusal', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-uwimport-'));
  try {
    const from = path.join(dir, 'pkg'), out = path.join(dir, 'out'), pack = path.join(dir, 'pack');
    for (const [k, v] of Object.entries(standin())) { fs.mkdirSync(path.dirname(path.join(from, k)), { recursive: true }); fs.writeFileSync(path.join(from, k), v); }
    fs.symlinkSync(path.join(from, 'notes.md'), path.join(from, 'public/tool/link.js'));
    const rulesF = path.join(dir, 'rules.json'); fs.writeFileSync(rulesF, JSON.stringify(RULES()));
    fs.writeFileSync(path.join(dir, 'example.json'), '{"invented":true}');
    const dl = path.join(dir, 'deny.txt'); fs.writeFileSync(dl, `${FIRM}\n${SECRET_SHEET}\n`);
    const quiet = (fn) => { const l = console.log, e = console.error; console.log = console.error = () => {}; try { return fn(); } finally { console.log = l; console.error = e; } };
    const base = ['--from', from, '--rules', rulesF, '--out', out, '--pack', pack];
    assert.equal(quiet(() => main([...base, '--denylist', path.join(dir, 'missing.txt')], {})), 1, 'no deny-list: refuses');
    assert.ok(!fs.existsSync(out));
    assert.equal(quiet(() => main([...base, '--denylist', dl], {})), 0);
    assert.deepEqual(fs.readdirSync(out).sort(), ['IMPORT-MANIFEST.json', 'app.js', 'example.json', 'index.html', 'style.css']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, MANIFEST), 'utf8')).edits.length, 6);
    assert.deepEqual(fs.readdirSync(pack).sort(), ['blk.txt', 'firm-only.js']);
    assert.equal(quiet(() => main([...base, '--denylist', ''], { DENYLIST: `${FIRM}\n` })), 0, 'env DENYLIST works and a previous import is replaced');
    // a bad rule: nothing is rewritten
    const before = fs.readFileSync(path.join(out, 'app.js'));
    const bad = RULES(); bad.edits[1].find = 'absent'; fs.writeFileSync(rulesF, JSON.stringify(bad));
    assert.equal(quiet(() => main([...base, '--denylist', dl], {})), 1);
    assert.deepEqual(fs.readFileSync(path.join(out, 'app.js')), before, 'the earlier output is untouched');
    // an output folder that is not an import is not wiped
    const other = path.join(dir, 'other'); fs.mkdirSync(other); fs.writeFileSync(path.join(other, 'mine.txt'), 'keep');
    fs.writeFileSync(rulesF, JSON.stringify(RULES()));
    assert.equal(quiet(() => main(['--from', from, '--rules', rulesF, '--out', other, '--denylist', dl], {})), 1);
    assert.ok(fs.existsSync(path.join(other, 'mine.txt')));
    assert.equal(quiet(() => main([], {})), 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the public settings hold no firm term: an allow-list, ceilings and nothing else', () => {
  assert.deepEqual(Object.keys(PUB).sort(), ['allow', 'allowExt', 'base64Allow', 'base64Ceiling', 'licence', 'minTermLength', 'root']);
  assert.deepEqual(PUB.allow, ['public/tool/']);
});

test('the shipped example is invented, has the shape the tool reads, and its totals add up', () => {
  const ex = JSON.parse(fs.readFileSync(new URL('../tools/uwtool-example.json', import.meta.url), 'utf8'));
  assert.equal(ex.rr.units.length, 4); assert.equal(ex.st.months.length, 12); assert.equal(ex.st.lines.length, 8);
  for (const l of ex.st.lines) {
    assert.equal(l.values.length, 12);
    assert.equal(l.total, l.values.reduce((a, b) => a + b, 0));
    assert.match(l.path, /^Statement > (Income|Expenses) > /);
  }
  assert.match(JSON.stringify(ex), /Example Plaza/);
  assert.ok(Buffer.byteLength(JSON.stringify(ex)) < 5000);
});

test('addFile brings in a new file from the tools folder (and refuses to overwrite); escapeControls writes the same string', () => {
  const rules = RULES();
  rules.edits.push({ id: 'add', category: 'docs', op: 'addFile', file: 'LICENSE', with: 'example.json' });
  const r = run({ rules });
  assert.equal(r.ok, true, r.errors.join(' | '));
  assert.equal(text(r, 'LICENSE'), '{"invented":true}');
  assert.ok(r.manifest.files.LICENSE && r.manifest.files.LICENSE.in === null, 'it is in the manifest as an added file');
  const clash = RULES(); clash.edits.push({ id: 'add', category: 'docs', op: 'addFile', file: 'app.js', with: 'example.json' });
  assert.match(run({ rules: clash }).errors.join(), /edit add: file is already in the output/);
  // a library string with a raw control byte: escaped, and the string means the same
  const pkg = standin(); pkg['public/tool/lib.js'] = enc('var s = "PK\u0003\u0004";\n');
  const er = RULES(); er.edits.push({ id: 'ctl', category: 'lib', op: 'escapeControls', file: 'lib.js', count: 2 });
  const ok = run({ pkg, rules: er });
  assert.equal(ok.ok, true, ok.errors.join(' | '));
  assert.equal(text(ok, 'lib.js'), 'var s = "PK\\u0003\\u0004";\n');
  assert.equal(eval(text(ok, 'lib.js').replace('var s =', '(') .replace(/;\n$/, ')')), 'PK\u0003\u0004');
  assert.equal(ok.counts.editsApplied, RULES().edits.length + 1, 'one edit, however many bytes');
});
test('MUTATION: escapeControls with the wrong count, or a control byte after a backslash, fails and names the edit', () => {
  const pkg = standin(); pkg['public/tool/lib.js'] = enc('var s = "PK\u0003\u0004";\n');
  const bad = RULES(); bad.edits.push({ id: 'ctl', category: 'lib', op: 'escapeControls', file: 'lib.js', count: 3 });
  assert.match(run({ pkg, rules: bad }).errors.join(), /edit ctl: found 2 control bytes, wanted 3/);
  const pkg2 = standin(); pkg2['public/tool/lib.js'] = enc('var s = "\\\u0003";\n');
  const e2 = RULES(); e2.edits.push({ id: 'ctl', category: 'lib', op: 'escapeControls', file: 'lib.js', count: 1 });
  assert.match(run({ pkg: pkg2, rules: e2 }).errors.join(), /edit ctl: a control byte follows a backslash/);
});
