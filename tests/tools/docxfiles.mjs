/* Invented Word (.docx) files for the Word reader's tests and browser flow: paragraphs and tables as word/document.xml.
 * Run by hand to write the files the browser flow drops:  node tests/tools/docxfiles.mjs <dir> */
import fs from 'node:fs';
import * as fflate from 'fflate';
import { C9, r1, r2, r3, r4, r5 } from '../rr-fixtures.js';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
export const P = (t) => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
export const TC = (t, span) => `<w:tc><w:tcPr>${span ? `<w:gridSpan w:val="${span}"/>` : ''}</w:tcPr>${P(t)}</w:tc>`;
/** rows of cells; a cell is text, or [text, gridSpan] */
export const TABLE = (rows) => `<w:tbl><w:tblPr><w:tblW w:w="0"/></w:tblPr><w:tblGrid/>${rows.map((r) => `<w:tr><w:trPr/>${r.map((c) => (Array.isArray(c) ? TC(c[0], c[1]) : TC(c))).join('')}</w:tr>`).join('')}</w:tbl>`;
export const docx = (body) => fflate.zipSync({ '[Content_Types].xml': fflate.strToU8('<Types/>'), 'word/document.xml': fflate.strToU8(`<?xml version="1.0"?><w:document xmlns:w="w" xmlns:mc="mc"><w:body>${body}</w:body></w:document>`) });
export const rollRows = [C9.map((c) => c.h), r1, r2, r3, r4, r5];

if (process.argv[1] && process.argv[1].endsWith('docxfiles.mjs') && process.argv[2]) {
  const d = process.argv[2];
  fs.writeFileSync(`${d}/word-rent-roll.docx`, docx(P('Rent roll as of January 31, 2026') + TABLE(rollRows)));
  fs.writeFileSync(`${d}/word-memo.docx`, docx(P('Notes from the site visit. The roof was replaced in 2019.') + P('Parking is shared with the neighbour.')));
  console.log('ok');
}
