/* The built-in tool's .docx text extraction (app/uwtool/parsers.js, made by tools/uwtool-import.mjs from its public
 * "docx-text-sanitize" edit; CodeQL alerts js/double-escaping and js/incomplete-multi-character-sanitization):
 * tags are stripped until the text stops changing, and entities are decoded in one pass, so "&amp;lt;" is "&lt;" and
 * nested fragments cannot rebuild a tag. Invented document text only. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSZip = createRequire(import.meta.url)('jszip');

/** The tool's own scripts, loaded the way its page loads them (no `module`, so each registers itself on the global). */
function pipeline() {
  const ctx = { DOMParser: class {}, XMLSerializer: class {}, console, TextDecoder, TextEncoder, Uint8Array, Math, JSON };
  ctx.self = ctx; vm.createContext(ctx);
  for (const f of ['md5.js', 'extract.js', 'pdftext.js', 'tabular.js', 'docs.js', 'xlpatch.js', 'parsers.js']) {
    const file = path.join(ROOT, 'app/uwtool', f);
    if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: f });
  }
  return ctx.Pipeline;
}
async function docx(xml) {
  const z = new JSZip(); z.file('word/document.xml', xml);
  return new Uint8Array(await z.generateAsync({ type: 'uint8array' }));
}
const read = async (xml) => (await pipeline().readFile({ JSZip }, { name: 'invented.docx', bytes: await docx(xml) })).text;

test('docx text: nested tag fragments cannot rebuild a tag', async () => {
  const t = await read('<w:p><w:r><w:t>a <scr<x>ipt>b</w:t></w:r></w:p>');
  assert.ok(!/<[a-z]/i.test(t), t);
  assert.equal(t, 'a ipt>b\n');
  assert.ok(!(await read('<w:t>x<<b>script>y</w:t>')).includes('<script'));
});

test('docx text: entities are decoded once, so &amp;lt; stays &lt;', async () => {
  assert.equal(await read('<w:t>&amp;lt;b&amp;gt; &amp;amp; &lt;i&gt; &quot;q&quot; &apos;s&apos;</w:t>'), '&lt;b&gt; &amp; <i> "q" \'s\'');
});

test('docx text: paragraphs and tabs still become line breaks and tabs', async () => {
  assert.equal(await read('<w:p><w:t>one</w:t><w:tab/><w:t>two</w:t></w:p><w:p><w:t>three</w:t></w:p>'), 'one\ttwo\nthree\n');
});
