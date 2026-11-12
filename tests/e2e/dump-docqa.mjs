/* The invented documents of tests/doc-fixtures.js (an OM, a lease, a T-12, a Word memo, a scanned page) as page text for
 * make_docqa.py to typeset, and the memo as a real .docx.   node dump-docqa.mjs files */
import fs from 'fs';
import { OM_PAGES, LEASE_PAGES, T12_PAGES, WORD_TEXT, SCAN_PAGES } from '../doc-fixtures.js';
import { docx, P } from '../tools/docxfiles.mjs';

const d = process.argv[2];
fs.writeFileSync(`${d}/docqa.json`, JSON.stringify({ om: OM_PAGES, lease: LEASE_PAGES, t12: T12_PAGES, scan: SCAN_PAGES.map((t) => t.replace('Bui1t', 'Built')) }));
fs.writeFileSync(`${d}/docqa-memo.docx`, docx(WORD_TEXT.split('. ').map((s, i, a) => P(i < a.length - 1 ? `${s}.` : s)).join('')));
