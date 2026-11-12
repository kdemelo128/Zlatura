/* Invented zips for the browser flow: one part password-protected (its flag set; the bytes are not really encrypted, and are never
 * read), and a zip whose part name is not UTF-8.  node tests/tools/zipfiles.mjs <dir> */
import fs from 'node:fs';
import * as fflate from 'fflate';

const d = process.argv[2];
if (d) {
  const enc = (s) => new TextEncoder().encode(s);
  const csv = 'Unit,Tenant,SF,Monthly Rent,Lease End\n101,Invented Co,1000,2400,2028-01-31\n102,Sample LLC,1500,3300,2029-06-30\n103,Vacant,800,0,\n';
  const z = fflate.zipSync({ 'rent-roll.csv': [enc(csv), { level: 6 }], 'locked-rent-roll.csv': [enc(csv.replace('Invented', 'Other')), { level: 6 }] });
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  for (let i = 0; i + 46 < z.length; i++) {
    if (dv.getUint32(i, true) !== 0x02014b50 || new TextDecoder().decode(z.subarray(i + 46, i + 52)) !== 'locked') continue;
    dv.setUint16(i + 8, dv.getUint16(i + 8, true) | 1, true);
    const local = dv.getUint32(i + 42, true);
    dv.setUint16(local + 6, dv.getUint16(local + 6, true) | 1, true);
  }
  fs.writeFileSync(`${d}/one-locked-part.zip`, z);
  console.log('ok');
}
