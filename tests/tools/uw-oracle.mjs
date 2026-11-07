/* tests/tools/uw-oracle.mjs -- not a test: run invented underwriting cases through Zlatura's engine (app/deal.js
 * analyze and holdReturns) and print a field-by-field table. If UW_PACKAGE_DIR names an unzipped package, its
 * finance.js (which exposes UWFinance) is ALSO loaded, read-only, in a vm context (a window-like global, no network,
 * no require, no timers) and the fields that exist on both sides (IRR, DSCR, debt yield, cap rate) are compared.
 * A difference over 0.01 is reported, never adopted: the hand-worked value decides. The package's files are never
 * named in the output and nothing from it is copied anywhere. Without the variable it prints "not run".
 *
 *   node tests/tools/uw-oracle.mjs [cases.json] [--require-oracle]
 * Cases: [{ name, price, noi, growth, hold, exitCap, saleCost, loan: { ltv, rate, amort, io, closing } }], invented.
 * Exit: 0 done (with or without the package); 3 when --require-oracle and the package was not run. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { analyze, holdReturns } from '../../app/deal.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const args = process.argv.slice(2);
const casesPath = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(ROOT, 'tests/fixtures/uw-oracle-cases.json'));
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const TOL = 0.01;

/** Zlatura's figures for a case. */
export function zlaturaFigures(c) {
  const m = analyze({ price: c.price, noi: c.noi, loan: c.loan || {} });
  const h = holdReturns({ price: c.price, noi: c.noi, growth: c.growth, hold: c.hold, exitCap: c.exitCap, saleCost: c.saleCost, loan: c.loan || {} });
  return {
    cap: m.cap, dscr: m.dscr, debtYield: m.debtYield, debtService: m.debtService,
    unleveredIrr: h && h.unleveredIrr, leveredIrr: h && h.leveredIrr,
    unleveredMultiple: h && h.unleveredMultiple, leveredMultiple: h && h.leveredMultiple,
    exitValue: h && h.exitValue, equity: h && h.equity, flows: h ? { unlevered: h.unlevered, levered: h.levered } : null,
  };
}

const fmt = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 1e4) / 1e4) : v === null || v === undefined ? '-' : String(v));

/** The package's finance.js in a sandbox, or null (and why). Looks one or two folders down for a file named finance.js. */
function loadPackage(dir) {
  const find = (d, depth) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isFile() && e.name === 'finance.js') return path.join(d, e.name);
    }
    if (depth > 0) for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') { const f = find(path.join(d, e.name), depth - 1); if (f) return f; }
    return null;
  };
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { why: 'the folder does not exist' };
  const file = find(dir, 2);
  if (!file) return { why: 'no calculation script found in the folder' };
  const sandbox = { console: { log() {}, warn() {}, error() {} }, Math, Number, Date, JSON, Array, Object, String, Intl, isFinite, isNaN, parseFloat, parseInt };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  try { vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { timeout: 5000, filename: 'package-finance' }); } catch (e) { return { why: `the script did not run (${String(e && e.name)})` }; }
  const F = ctx.UWFinance || ctx.window.UWFinance;
  return F ? { F } : { why: 'the script does not expose UWFinance' };
}

/** The package's value for a field, trying the names such a function usually has; undefined where it has none. */
function packageValue(F, field, c, z) {
  const call = (names, ...a) => { for (const n of names) if (typeof F[n] === 'function') { try { const r = F[n](...a); return typeof r === 'number' ? r : r && typeof r === 'object' ? r.value ?? r.irr ?? undefined : undefined; } catch { return undefined; } } return undefined; };
  if (field === 'unleveredIrr') return z.flows ? call(['irr', 'IRR', 'calcIRR'], z.flows.unlevered) : undefined;
  if (field === 'leveredIrr') return z.flows ? call(['irr', 'IRR', 'calcIRR'], z.flows.levered) : undefined;
  if (field === 'dscr') return z.debtService ? call(['dscr', 'DSCR'], c.noi, z.debtService) : undefined;
  if (field === 'debtYield') return (c.loan || {}).ltv ? call(['debtYield', 'calcDebtYield'], c.noi, c.price * c.loan.ltv / 100) : undefined;
  if (field === 'cap') return call(['capRate', 'cap', 'calcCapRate'], c.noi, c.price);
  return undefined;
}

const pkgDir = process.env.UW_PACKAGE_DIR;
const pkg = pkgDir ? loadPackage(pkgDir) : null;
const FIELDS = ['cap', 'dscr', 'debtYield', 'debtService', 'unleveredIrr', 'leveredIrr', 'unleveredMultiple', 'leveredMultiple', 'exitValue', 'equity'];
const COMPARED = ['cap', 'dscr', 'debtYield', 'unleveredIrr', 'leveredIrr'];

console.log(`uw-oracle: ${cases.length} invented case(s) through Zlatura's engine`);
let compared = 0; let differ = 0;
for (const [i, c] of cases.entries()) {
  const z = zlaturaFigures(c);
  console.log(`\ncase ${i + 1}: ${c.name || ''}`);
  console.log('field | zlatura | package | result');
  for (const f of FIELDS) {
    let pv; let res = '';
    if (pkg && pkg.F && COMPARED.includes(f)) {
      pv = packageValue(pkg.F, f, c, z);
      if (typeof pv !== 'number' || typeof z[f] !== 'number') res = 'no match';
      else { compared += 1; const d = Math.abs(pv - z[f]); res = d > TOL ? `DIFFERS by ${fmt(d)}` : 'same'; if (d > TOL) differ += 1; }
    }
    console.log(`${f} | ${fmt(z[f])} | ${pkg && pkg.F && COMPARED.includes(f) ? fmt(pv) : '-'} | ${res}`);
  }
}
if (!pkgDir) console.log('\noracle: not run (set UW_PACKAGE_DIR)');
else if (!pkg.F) console.log(`\noracle: not run (${pkg.why})`);
else console.log(`\noracle: ran; ${compared} field(s) compared, ${differ} differ by more than ${TOL}`);
process.exit(args.includes('--require-oracle') && !(pkg && pkg.F) ? 3 : 0);
