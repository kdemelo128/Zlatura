/* The invented OM and CoStar page text from the unit-test fixtures, and the invented rent roll and operating statement PDFs' positioned text, for make_pdfs.py to typeset. */
import fs from 'fs';
import * as om from '../om-fixtures.js';
import * as cs from '../fixtures.js';
import { PDF_SPECS } from '../rr-fixtures.js';
import { PDF_SPECS as STMT_SPECS } from '../om-statement-fixtures.js';

fs.writeFileSync(process.argv[2], JSON.stringify({
  om_retail: om.retail, om_netlease: om.netlease, om_multifamily: om.multifamily,
  costar_set: [cs.classicSale, cs.activeListing, cs.statusListing, cs.flyerEscrow, cs.landValue, cs.saleWithParties],
  // invented rent rolls as positioned text (tests/rr-fixtures.js), for make_pdfs.py to typeset as an OM's designer would
  rr_specs: Object.fromEntries(Object.entries(PDF_SPECS).map(([k, fn]) => [k, fn()])),
  // invented operating statements (tests/om-statement-fixtures.js), headings centred over their columns
  stmt_specs: Object.fromEntries(Object.entries(STMT_SPECS).map(([k, fn]) => [k, fn()])),
}));
