/* A Word (.docx) file in "Start from documents" (app/docxread.js): its tables read as rows by the readers that already exist,
 * its text classified, nothing guessed, and a damaged or empty file said so. Invented documents only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fflate from 'fflate';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const D = await import('../app/docxread.js');
const I = await import('../app/intake.js');

import { P, TABLE, docx, rollRows } from './tools/docxfiles.mjs';
const TC = (t, span) => `<w:tc><w:tcPr>${span ? `<w:gridSpan w:val="${span}"/>` : ''}</w:tcPr><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
const asFile = (name, bytes) => ({ name, size: bytes.length, type: '', slice: (a, b) => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset + a, bytes.byteOffset + Math.min(b, bytes.length)) }), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
const deps = { getFflate: async () => fflate, getXlsx: async () => ({ fflate }), readPdf: async () => ({ pages: [], layouts: [] }), problem: (e) => String(e.message || e) };
const stageOne = async (name, bytes) => { const plan = I.newPlan(); await I.stageFiles(plan, [asFile(name, bytes)], deps); return plan.items; };

test('a table keeps its rows and merged cells, and a cell with several paragraphs is one cell', () => {
  const xml = `<w:body>${P('Heading text')}${TABLE([['Suite', 'Tenant', 'Rent'], [['Spans two', 2], '$1,000'], [`${P('A')}${P('B')}`.replace(/<\/?w:tc>/g, ''), 'x', 'y']])}</w:body>`;
  const t = D.docxTables(xml);
  assert.equal(t.length, 1);
  assert.deepEqual(t[0][0], ['Suite', 'Tenant', 'Rent']);
  assert.deepEqual(t[0][1], ['Spans two', '', '$1,000']);
});

test('entities are decoded once: &amp;lt; stays the text "&lt;", and text between tags is not parsed as a tag', () => {
  const xml = `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A &amp;lt; B &amp; C</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>&lt;b&gt;x&lt;/b&gt;</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
  assert.deepEqual(D.docxTables(xml)[0][0], ['A &lt; B & C', '<b>x</b>']);
});

test('a nested table is flattened into its cell, not made a second table', () => {
  const inner = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>inner</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
  const xml = `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>first</w:t></w:r></w:p></w:tc><w:tc>${inner}<w:p><w:r><w:t>outer</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
  const t = D.docxTables(xml);
  assert.equal(t.length, 1);
  assert.equal(t[0][0][0], 'first');
  assert.match(t[0][0][1], /inner/);
  assert.match(t[0][0][1], /outer/);
});

test('the table is written as CSV with quotes where needed, and the limits hold', () => {
  assert.equal(D.tableCsv([['a,b', 'say "hi"'], ['1', '']]), '"a,b","say ""hi"""\n1,\n');
  const xml = `<w:body>${Array.from({ length: 30 }, () => TABLE([['a', 'b'], ['c', 'd']])).join('')}</w:body>`;
  assert.equal(D.docxTables(xml).length, D.DOCX_LIMITS.tables);
});

test('a Word file holding an invented rent roll table is read as a rent roll through the same intake, from its table, with a note and no page numbers', async () => {
  const items = await stageOne('Offering notes.docx', docx(P('Rent roll as of January 31, 2026') + TABLE(rollRows)));
  assert.equal(items.length, 1, 'the table is the item; the Word file is not staged a second time as prose');
  const it = items.find((x) => /table 1/.test(x.name));
  assert.ok(it, items.map((x) => x.name).join());
  assert.equal(it.type, 'rentroll');
  assert.equal(it.from, 'Offering notes.docx');
  assert.match(it.reason, /table 1 of 1 in the Word document/);
  assert.match(it.reason, /no page numbers; check every figure/);
  assert.equal(it.kind, 'csv');
  assert.equal(it.state, 'staged');
  const csv = new TextDecoder().decode(new Uint8Array(await it.file.arrayBuffer()));
  assert.match(csv, /Maple Leaf Bakery/);
  assert.equal(csv.trim().split('\n').length, 6);
});

test('a monthly statement table is typed by the T-12 reader, not by the Word wrapper', async () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => `${m} 2025`);
  const line = (n, v) => [n, ...months.map(() => String(v)), String(v * 12)];
  const rows = [['Account', ...months, 'Total'], line('Rental income', 10000), line('Other income', 500), line('Total income', 10500), line('Property taxes', 2000), line('Insurance', 600), line('Total operating expenses', 2600), line('Net operating income', 7900)];
  const items = await stageOne('Operating statement.docx', docx(P('Operating statement, calendar 2025') + TABLE(rows)));
  assert.ok(items.some((x) => x.type === 't12'), items.map((x) => `${x.name}:${x.type}`).join());
});

test('a Word file with only prose is one item: its text is classified, never typed by itself, and it says there are no page numbers', async () => {
  const items = await stageOne('Memo.docx', docx(P('Notes from the site visit. The roof was replaced in 2019.') + P('Parking is shared with the neighbour.')));
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Memo.docx');
  assert.equal(items[0].type, null);
  assert.match(items[0].reason, /Text read from the Word document/);
  assert.match(items[0].reason, /no page numbers/);
  assert.doesNotMatch(items[0].reason, /no text layer|OCR/, 'a short Word text is not a scan');
});

test('a damaged Word file and one with no text say so, and stay a question rather than vanish', async () => {
  const bad = fflate.zipSync({ '[Content_Types].xml': fflate.strToU8('<Types/>'), 'word/document.xml': fflate.strToU8('<w:document/>'), 'word/_rels/x.xml': fflate.strToU8('x') });
  const items = await stageOne('Empty.docx', bad);
  assert.equal(items.length, 1);
  assert.match(items[0].reason, /no text in its body|no body text/);
  assert.equal(items[0].type, null);
});

test('a one-column list in a Word file is not a table to read', async () => {
  const items = await stageOne('List.docx', docx(P('Intro') + TABLE([['one'], ['two'], ['three']])));
  assert.ok(!items.some((x) => /table 1/.test(x.name)));
});

test('a Word file in a zip is read the same way', async () => {
  const z = fflate.zipSync({ 'notes.docx': docx(P('Rent roll') + TABLE(rollRows)) });
  const items = await stageOne('bundle.zip', z);
  assert.ok(items.some((x) => /table 1/.test(x.name) && x.type === 'rentroll'), items.map((x) => `${x.name}:${x.type}`).join());
});
