/* tests/tools/om-roll-corpus.mjs -- writes the invented OMs of tests/om-roll-fixtures.js as PDFs into a folder, for a before/after
 * measurement of the OM rent roll reader with the OM diagnostic:
 *   node tests/tools/om-roll-corpus.mjs /tmp/om-roll-corpus
 *   node tests/tools/doc-local.mjs /tmp/om-roll-corpus --allow-outside-private --om --reasons
 * Every name and figure is invented; not shipped, not a test. */
import fs from 'node:fs';
import path from 'node:path';
import { pdfOf } from '../rr-fixtures.js';
import * as F from '../om-roll-fixtures.js';
import { FIXTURES as D } from '../om-diag-fixtures.js';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tests/tools/om-roll-corpus.mjs <folder>'); process.exit(2); }
fs.mkdirSync(dir, { recursive: true });
const grid = (cols, rows, o = {}) => [F.grid({ cols, rows, ...o })];
const corpus = {
  'plain': D.plain,
  'multifamily-no-tenant': () => grid(F.MF_COLS, F.MF_ROWS),
  'multifamily-total-year': () => F.mfTotal('$86,400'),
  'suite-only': F.suiteOnly,
  'tenant-called-name': () => F.tenantWord('Name'),
  'tenant-called-leaseholder': () => F.tenantWord('Leaseholder'),
  'unit-mix-not-a-roll': F.unitMix,
  'comps-not-a-roll': F.compsTable,
  'no-key-column': F.noKey,
  'tight-header': F.tightHeader,
  'tight-rows': F.tightRows,
  'size-drift-pages': F.sizeDrift,
  'wide-figures': () => F.wideFigures(),
  'gaps-between-groups': () => F.gapped({ heading: true }),
  'continued-header': F.continuedHeader,
  'accounting-dollar-cells': F.accounting2,
  'running-page-totals': () => F.pageTotals({ running: true }),
  'sidebar-text': () => F.sidebar({ heading: false }),
  'long-roll-bare-pages': () => F.longRoll({ pages: 6, mode: 'bare' }),
  'long-roll-repeat-pages': () => F.longRoll({ pages: 6, mode: 'repeat' }),
  'whole-header-one-item': D.merged,
  'scanned-roll': D.scannedRoll,
};
for (const [name, make] of Object.entries(corpus)) fs.writeFileSync(path.join(dir, `invented-${name}-offering-memorandum.pdf`), pdfOf(make()));
console.log(`${Object.keys(corpus).length} invented OMs in ${dir}`);
