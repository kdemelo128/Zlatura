/* Invented rent roll tables, as OM page text and as PDFs, for the rent roll
 * reader's tests (tests/om.test.js, tests/reconcile.test.js) and the browser
 * flow (tests/e2e/omrr-flow.mjs, via tests/e2e/make_pdfs.py). Every tenant,
 * suite and figure is made up. */

/** A fixed-width table: cols [{ h, w, r }] (h may hold "\n" for a header over several lines; r: right-aligned). */
export function tbl(cols, rows) {
  const pad = (s, w, r) => (r ? String(s).padStart(w) : String(s).padEnd(w));
  const hl = Math.max(...cols.map((c) => c.h.split('\n').length));
  const out = [];
  for (let i = 0; i < hl; i++) out.push(cols.map((c) => pad(c.h.split('\n')[i] || '', c.w, c.r)).join('   ').trimEnd());
  out.push('');
  for (const row of rows) out.push(cols.map((c, k) => pad(row[k] ?? '', c.w, c.r)).join('   ').trimEnd());
  return out.join('\n');
}

export const C9 = [
  { h: 'Suite', w: 5 }, { h: 'Tenant', w: 26 }, { h: 'SF', w: 6, r: 1 }, { h: 'Lease Start', w: 11 }, { h: 'Lease End', w: 14 },
  { h: 'Annual Rent', w: 11, r: 1 }, { h: 'Rent/SF', w: 7, r: 1 }, { h: 'Monthly Rent', w: 12, r: 1 }, { h: 'Bumps', w: 10 },
];
export const R = (s, t, sf, a, b, ann, psf, mo, bump) => [s, t, sf, a, b, ann, psf, mo, bump];
export const r1 = R('101', 'Maple Leaf Bakery', '2,000', '01/01/2021', '12/31/2030', '$60,000', '$30.00', '$5,000', '3% annual');
export const r2 = R('102', 'Quillfeather Books', '1,500', '06/01/2022', '05/31/2027', '$42,000', '$28.00', '$3,500', '$1.00/yr');
export const r3 = R('103', 'Copperline Yoga', '1,200', '03/01/2023', '02/28/2033', '$36,000', '$30.00', '$3,000', '2.5%');
export const r4 = R('104', 'Bluefin Sushi Bar', '1,800', '09/01/2020', '08/31/2028', '$54,000', '$30.00', '$4,500', '3%');
export const r5 = R('105', 'Harrow & Finch Tailors', '1,000', '02/01/2024', '01/31/2029', '$32,000', '$32.00', '$2,667', 'None');
const total = (sf, ann) => R('', 'Total', sf, '', '', ann, '', '', '');

export const cases = {
  // 1. the table carries on to the next page with no header
  continued: ['Rent Roll\n\n' + tbl(C9, [r1, r2, r3]), tbl(C9, [r4, r5, total('7,500', '$224,000')]).split('\n').slice(2).join('\n')],
  // 2. the header repeated on each page, with a page number at the foot
  repeated: ['Rent Roll\n\n' + tbl(C9, [r1, r2, r3]) + '\n\n                         Page 7', 'Rent Roll (continued)\n\n' + tbl(C9, [r4, r5, total('7,500', '$224,000')])],
  // 2b. a lease comparables table later in the OM is not more of the rent roll
  comps: ['Rent Roll\n\n' + tbl(C9, [r1, r2, total('3,500', '$102,000')]),
    'Lease Comparables\n\n' + tbl([{ h: 'Tenant', w: 22 }, { h: 'Address', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Rent/SF', w: 7, r: 1 }, { h: 'Signed', w: 8 }],
      [['Elmstead Pilates', '12 Sample Road', '1,400', '$34.00', '03/2025'], ['Gable Street Pizza', '90 Invented Way', '2,100', '$31.50', '11/2024']])],
  // 3a. a wrapped name, the figures on its first line
  wrapBelow: ['Rent Roll\n\n' + tbl(C9, [r1, R('102', 'Northgate Family', '1,500', '06/01/2022', '05/31/2027', '$42,000', '$28.00', '$3,500', '3%'), R('', 'Dentistry, PC'), r3])],
  // 3b. a wrapped name with the figures centred between its two lines
  wrapCentred: ['Rent Roll\n\n' + tbl(C9, [r1, R('', 'Northgate Family'), R('102', '', '1,500', '06/01/2022', '05/31/2027', '$42,000', '$28.00', '$3,500', '3%'), R('', 'Dentistry, PC'), r3])],
  // 4b. one "Lease Term" cell holding both dates
  termRange: ['Rent Roll\n\n' + tbl([{ h: 'Suite', w: 5 }, { h: 'Tenant', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Lease Term', w: 23 }, { h: 'Annual Rent', w: 11, r: 1 }],
    [['101', 'Maple Leaf Bakery', '2,000', '01/01/2021 - 12/31/2030', '$60,000'], ['102', 'Quillfeather Books', '1,500', '06/2022 - 05/2027', '$42,000']])],
  // 4c. a bumps figure beside a blank monthly rent
  bumpsBesideBlank: ['Rent Roll\n\n' + tbl(C9, [r1, R('102', 'Quillfeather Books', '1,500', '06/01/2022', '05/31/2027', '$42,000', '$28.00', '', '3.0%')])],
  // 5. vacancies (one with no SF) and month-to-month written four ways
  vacantMtm: ['Rent Roll\n\n' + tbl(C9, [
    r1,
    R('102', 'Vacant', '1,500', '', '', '', '', '', ''),
    R('103', 'VACANT - Available', '', '', '', '', '', '', ''),
    R('104', 'Bluefin Sushi Bar', '1,800', '09/01/2020', 'MTM', '$54,000', '$30.00', '$4,500', ''),
    R('105', 'Harrow & Finch Tailors', '1,000', '02/01/2024', 'Month-to-Month', '$32,000', '$32.00', '$2,667', ''),
    R('106', 'Pinecrest Cobbler', '800', '05/01/2019', 'Holdover', '$20,000', '$25.00', '$1,667', ''),
    R('107', 'Saltmarsh Vintage', '900', '05/01/2019', 'M-T-M', '$22,500', '$25.00', '$1,875', ''),
  ])],
  // 6a. section headings and subtotals
  sections: ['Rent Roll\n\n' + tbl(C9, [
    R('', 'RETAIL'), r1, r2, R('', 'Retail Subtotal', '3,500', '', '', '$102,000', '', '', ''),
    R('', 'OFFICE'), R('201', 'Ledgerwise Accounting', '3,000', '01/01/2022', '12/31/2028', '$75,000', '$25.00', '$6,250', '3%'),
    R('', 'Office Subtotal', '3,000', '', '', '$75,000', '', '', ''), total('6,500', '$177,000'),
  ])],
  // 6b. a "Subtotal" first, then more rows before the Total
  subtotalFirst: ['Rent Roll\n\n' + tbl(C9, [r1, r2, R('', 'Subtotal - Occupied', '3,500', '', '', '$102,000', '', '', ''), R('103', 'Vacant', '1,200'), total('4,700', '$102,000')])],
  // 6c. a tenant whose name starts with a total word
  totalTenant: ['Rent Roll\n\n' + tbl(C9, [r1, R('102', 'Total Body Fitness', '2,500', '01/01/2022', '12/31/2029', '$62,500', '$25.00', '$5,208', '3%'), r3, total('5,700', '$158,500')])],
  // 6d. a totals row labelled in the tenant column, with "All" as its suite
  totalsAverages: ['Rent Roll\n\n' + tbl(C9, [r1, r2, R('All', 'Totals / Averages', '3,500', '', '', '$102,000', '$29.14', '$8,500', '')])],
  // 7b. "Escalation Rate" before "Rent/SF"
  escalation: ['Rent Roll\n\n' + tbl([{ h: 'Suite', w: 5 }, { h: 'Tenant', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Escalation Rate', w: 15 }, { h: 'Annual Rent', w: 11, r: 1 }, { h: 'Rent/SF', w: 7, r: 1 }],
    [['101', 'Maple Leaf Bakery', '2,000', '3.0%', '$60,000', '$30.00'], ['102', 'Quillfeather Books', '1,500', '2.5%', '$42,000', '$28.00']])],
  // 7c. multifamily: "Resident", not "Tenant"
  resident: ['Rent Roll\n\n' + tbl([{ h: 'Unit', w: 5 }, { h: 'Resident', w: 18 }, { h: 'Type', w: 6 }, { h: 'Sq Ft', w: 6, r: 1 }, { h: 'Market Rent', w: 11, r: 1 }, { h: 'Actual Rent', w: 11, r: 1 }, { h: 'Lease End', w: 10 }],
    [['1A', 'Occupied', '1BR', '720', '$1,700', '$1,650', '08/31/2027'], ['1B', 'Vacant', '2BR', '980', '$2,200', '', '']])],
  // 8a. a "Rent" column that is monthly
  rentMonthly: ['Rent Roll\n\n' + tbl([{ h: 'Unit', w: 5 }, { h: 'Tenant', w: 18 }, { h: 'SF', w: 6, r: 1 }, { h: 'Rent', w: 8, r: 1 }, { h: 'Lease End', w: 10 }],
    [['1A', 'Resident A', '720', '$1,650', '08/31/2027'], ['1B', 'Resident B', '980', '$2,150', '03/31/2027']])],
  // 8b. rent per SF a month ("Rent/SF/Mo")
  psfMonth: ['Rent Roll\n\n' + tbl([{ h: 'Suite', w: 5 }, { h: 'Tenant', w: 22 }, { h: 'RSF', w: 6, r: 1 }, { h: 'Rent/SF/Mo', w: 10, r: 1 }, { h: 'Lease Exp', w: 10 }],
    [['101', 'Ledgerwise Accounting', '3,000', '$3.25', '12/31/2028'], ['102', 'Quillfeather Books', '1,500', '$2.90', '05/31/2027']])],
  // 8c. "Monthly Rent/SF" beside the annual rent
  monthlyPsf: ['Rent Roll\n\n' + tbl([{ h: 'Suite', w: 5 }, { h: 'Tenant', w: 22 }, { h: 'RSF', w: 6, r: 1 }, { h: 'Monthly Rent/SF', w: 15, r: 1 }, { h: 'Annual Rent', w: 11, r: 1 }],
    [['101', 'Ledgerwise Accounting', '3,000', '$3.25', '$117,000']])],
  // 8d. an "Annual Rent" column whose figures are rent per SF
  annualIsPsf: ['Rent Roll\n\n' + tbl([{ h: 'Suite', w: 5 }, { h: 'Tenant', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Annual Rent', w: 11, r: 1 }],
    [['101', 'Maple Leaf Bakery', '2,000', '$30.00'], ['102', 'Quillfeather Books', '1,500', '$28.00']])],
  // 8e. rents printed in thousands
  thousands: ['Rent Roll\n\n' + tbl([{ h: 'Suite', w: 5 }, { h: 'Tenant', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Annual Rent', w: 11, r: 1 }],
    [['101', 'Maple Leaf Bakery', '2,000', '$60.0K'], ['102', 'Quillfeather Books', '1,500', '$42.0K']])],
};

/* 10. An OM that states its building SF, occupancy and in-place rent, with a
 * rent roll whose vacancy prints no SF and whose Total row doesn't add up. */
export const statedOm = [
  'Investment Summary\n\n  Asking Price        $3,000,000\n  Building Size       10,000 SF\n  Occupancy           70.0%\n  Base Rent           $140,000\n',
  'Rent Roll\n\n' + tbl(C9, [r1, r2, r3, R('104', 'Vacant'), total('4,700', '$140,000')]),
];

/* ------------------------------------------------------------ the PDFs */

/**
 * A PDF of text drawn at positions, in Courier (so a right-aligned figure's
 * place is exact): pages: [[{ x, y, s, right?, center?, size?, bold? }]]. Small and
 * dependency-free, for reading through pdf.js in Node exactly as the app does.
 */
export function pdfOf(pages) {
  const esc = (s) => String(s).replace(/[\\()]/g, (c) => `\\${c}`);
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>');
  const pagesId = objs.length + 1 + pages.length * 2;
  const kids = [];
  for (const page of pages) {
    const items = Array.isArray(page) ? page : [];
    const ops = items.map((it) => {
      const size = it.size || 8;
      const w = String(it.s).length * 0.6 * size;
      const x = it.right ? it.x - w : it.center ? it.x - w / 2 : it.x;
      return `BT /${it.bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${it.y.toFixed(2)} Td (${esc(it.s)}) Tj ET`;
    }).join('\n');
    const content = add(`<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
  const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((b, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${b}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/* The invented rent roll typeset as an OM does it: columns at fixed points,
 * figures right-aligned, a two-line name with its figures centred between. */
const COLS = [[40, 0], [80, 0], [250, 1], [265, 0], [325, 0], [430, 1], [480, 1], [540, 1], [550, 0]];
const HEAD = ['Suite', 'Tenant', 'SF', 'Lease Start', 'Lease End', 'Annual Rent', 'Rent/SF', 'Monthly', 'Bumps'];
export const PDF_ROWS = [
  ['101', ['Maple Leaf Bakery'], '2,000', '01/01/2021', '12/31/2030', '$60,000', '$30.00', '$5,000', '3%'],
  ['102', ['Northgate Family', 'Dentistry, PC'], '1,500', '06/01/2022', '05/31/2027', '$42,000', '$28.00', '$3,500', '3%'],
  ['103', ['Copperline Yoga'], '1,200', '03/01/2023', '02/28/2033', '$36,000', '$30.00', '$3,000', '2.5%'],
  ['104', ['Vacant'], '1,800', '', '', '', '', '', ''],
  ['105', ['Harrow & Finch Tailors'], '1,000', '02/01/2024', 'MTM', '$32,000', '$32.00', '$2,667', ''],
  ['106', ['Bluefin Sushi Bar'], '1,500', '09/01/2020', '08/31/2028', '$45,000', '$30.00', '$3,750', '3%'],
];
function rowItems(r, y) {
  const out = [];
  const names = r[1];
  const ny = names.length === 2 ? [y + 4.5, y - 4.5] : [y];
  names.forEach((n, i) => out.push({ x: COLS[1][0], y: ny[i], s: n, size: 7 }));
  r.forEach((v, i) => { if (i !== 1 && v) out.push({ x: COLS[i][0], y, s: v, right: !!COLS[i][1], size: 7 }); });
  return { items: out, step: names.length === 2 ? 22 : 14 };
}
const headItems = (y) => HEAD.map((h, i) => ({ x: COLS[i][0], y, s: h, right: !!COLS[i][1], bold: true, size: 7 }));
const summary = [{ x: 40, y: 740, s: 'Investment Summary', size: 14, bold: true },
  ...[['Asking Price', '$3,100,000'], ['Building Size', '9,000 SF'], ['Occupancy', '80.0%'], ['Cap Rate', '6.25%']].flatMap(([k, v], i) => [{ x: 40, y: 700 - i * 16, s: k, size: 10 }, { x: 300, y: 700 - i * 16, s: v, right: true, size: 10 }])];

const totalItems = (y, sf, ann) => [{ x: 80, y, s: 'Total', bold: true, size: 7 }, { x: 250, y, s: sf, right: true, bold: true, size: 7 }, { x: 430, y, s: ann, right: true, bold: true, size: 7 }];
function rowsFrom(rows, y0) {
  const out = []; let y = y0;
  for (const r of rows) { const { items, step } = rowItems(r, y); out.push(...items); y -= step; }
  return { items: out, y };
}

/* Each PDF as pages of positioned text; { scan: items } is a page that is
 * only a picture of that text (no text layer), as a scanned page is. The
 * Node writer (pdfOf) draws a scan page as an empty page; the browser suite's
 * generator (tests/e2e/make_pdfs.py) draws it as an image, for OCR. */
export function specContinued() {
  const a = rowsFrom(PDF_ROWS.slice(0, 3), 690);
  const b = rowsFrom(PDF_ROWS.slice(3), 740);
  return [summary, [{ x: 40, y: 740, s: 'Rent Roll', size: 14, bold: true }, ...headItems(710), ...a.items], [...b.items, ...totalItems(b.y - 4, '9,000', '$215,000')]];
}
export function specWrapped() {
  const a = rowsFrom(PDF_ROWS, 690);
  return [summary, [{ x: 40, y: 740, s: 'Rent Roll', size: 14, bold: true }, ...headItems(710), ...a.items, ...totalItems(a.y - 4, '9,000', '$215,000')]];
}
/* The browser flow's OM: a summary stating building SF, occupancy and in-place
 * rent; the rent roll over two pages, the second without a header, whose
 * Total row prints more rent than its rows add up to; then a scanned page
 * holding two more suites. */
export const SCAN_ROWS = [
  ['107', ['Wrenfield Optics'], '1,100', '07/01/2023', '06/30/2028', '$33,000', '$30.00', '$2,750', '3%'],
  ['108', ['Vacant'], '900', '', '', '', '', '', ''],
];
export function specQcOm() {
  const a = rowsFrom(PDF_ROWS.slice(0, 3), 690);
  const b = rowsFrom(PDF_ROWS.slice(3), 740);
  const sum = [{ x: 40, y: 740, s: 'Investment Summary', size: 14, bold: true },
    ...[['Asking Price', '$3,400,000'], ['Building Size', '9,000 SF'], ['Occupancy', '80.0%'], ['Base Rent', '$215,000'], ['Cap Rate', '6.10%']]
      .flatMap(([k, v], i) => [{ x: 40, y: 700 - i * 16, s: k, size: 10 }, { x: 300, y: 700 - i * 16, s: v, right: true, size: 10 }]),
    { x: 40, y: 600, s: '4410 Invented Commons, Sampletown, MD 20000', size: 10 }];
  const scan = rowsFrom(SCAN_ROWS, 690);
  return [
    sum,
    [{ x: 40, y: 740, s: 'Rent Roll', size: 14, bold: true }, ...headItems(710), ...a.items],
    [...b.items, ...totalItems(b.y - 4, '9,000', '$220,000')],
    { scan: [{ x: 40, y: 740, s: 'Annex Rent Roll', size: 14, bold: true }, ...headItems(710).map((h) => ({ ...h, size: 7.5 })), ...scan.items.map((it) => ({ ...it, size: 8 }))] },
  ];
}
/* The same rent roll printed in thousands: "($ in thousands)" under the title, the annual rent as 60.0 and the
 * monthly rent as 5.000, rent per SF still in dollars. Its Total row prints 215.0. Built so the reader has to
 * scale it to read $60,000 rents (and so a reader with no scale reads $60). */
export function specThousands() {
  const k = (v, d) => (v ? (Number(v.replace(/[$,]/g, '')) / 1000).toFixed(d) : '');
  const rows = PDF_ROWS.map((r) => [r[0], r[1], r[2], r[3], r[4], k(r[5], 1), r[6], k(r[7], 3), r[8]]);
  const a = rowsFrom(rows, 676);
  const sum = [{ x: 40, y: 740, s: 'Investment Summary', size: 14, bold: true },
    ...[['Asking Price', '$3,400,000'], ['Building Size', '9,000 SF'], ['Occupancy', '80.0%'], ['Base Rent', '$215,000'], ['Cap Rate', '6.10%']]
      .flatMap(([kk, v], i) => [{ x: 40, y: 700 - i * 16, s: kk, size: 10 }, { x: 300, y: 700 - i * 16, s: v, right: true, size: 10 }])];
  return [sum, [{ x: 40, y: 740, s: 'Rent Roll', size: 14, bold: true }, { x: 40, y: 726, s: '($ in thousands)', size: 7 }, ...headItems(710), ...a.items, ...totalItems(a.y - 4, '9,000', '215.0')]];
}
export const PDF_SPECS = { 'rr-continued': specContinued, 'rr-wrapped': specWrapped, 'om-rr-qc': specQcOm, 'om-rr-thousands': specThousands };

/** Case 1 as a PDF: the rent roll split over two pages, no header on the second. */
export const pdfContinued = () => pdfOf(specContinued());
/** Case 3b as a PDF: one page, the two-line name's figures centred between its lines. */
export const pdfWrapped = () => pdfOf(specWrapped());
