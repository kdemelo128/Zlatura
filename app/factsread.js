/* factsread.js -- small readers for three documents the app can name but had no reader for: a property tax bill, a utility
 * bill and a unit mix table. Each reads only what the page labels plainly, and shows it (with its page and line, or its
 * sheet and row) for the broker to check. Nothing here changes a deal: the deal has no field for most of these figures, so
 * they are shown in review and not stored; the one number a deal could take (a year's tax) is still the broker's to enter.
 *
 * Input is the document's text, page by page (pdftext.js, or the OCR text of a scan, ocrpdf.js), or a workbook's grids
 * (sheetread.js). Output: { type, fields, asks, notes }:
 *   fields  [{ key, label, text (as read), value (dollars to the cent / whole number / ISO date / words), where: { page, line } or { sheet, row } }]
 *   asks    [{ id, question, options: [{ value, label }] }]: what the page does not settle (which year, monthly or annual,
 *           day-month or month-day, which unit); a figure that depends on the answer is left out until it is answered
 *   notes   plain sentences (a two-month period is not a monthly bill; an installment is not the year)
 * `answers` is { askId: option value }. A blank is never zero; a period or unit is never guessed; money is whole cents.
 * Pure: no page, no storage, no network. */
import { toCents } from './engine/money.js';

export const FACT_TYPES = Object.freeze(['taxbill', 'utilities', 'unitMix']);

/** @typedef {{ page: number, line: number } | { sheet: string, row: number }} Where */
/** @typedef {{ key: string, label: string, text: string, value: any, where: Where }} Fact */
/** @typedef {{ id: string, question: string, options: { value: string, label: string }[] }} Ask */

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const MON_NUM = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const DATE_RE = new RegExp(`\\b(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/.-]\\d{1,2}[/.-](?:\\d{4}|\\d{2})|(?:${MONTHS})[a-z]*\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+(?:${MONTHS})[a-z]*\\.?,?\\s+\\d{4})\\b`, 'gi');

const $ = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const iso = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);
const fullYear = (y) => (y < 100 ? 2000 + y : y);
const sheetWhere = (s, r) => ({ sheet: s, row: r });
export const whereText = (w) => (w && 'page' in w ? `page ${w.page}, line ${w.line}` : w ? `sheet ${w.sheet}, row ${w.row}` : '');

/** The document as lines: { text, where } from pages, or from workbook grids (cells joined by wide gaps, as a table prints). */
export function linesOf(src) {
  const out = [];
  if (src && Array.isArray(src.pages)) src.pages.forEach((t, pi) => String(t || '').split('\n').forEach((s, i) => { if (s.trim()) out.push({ text: s.replace(/\s+$/, ''), cells: null, where: { page: pi + 1, line: i + 1 } }); }));
  else if (src && Array.isArray(src.grids)) for (const g of src.grids) for (const row of g.rows || []) { const cells = (row.cells || []).map((c) => String(c ?? '').trim()); if (cells.some(Boolean)) out.push({ text: cells.join('   ').replace(/\s+$/, ''), cells, where: sheetWhere(g.sheet, row.r) }); }
  return out;
}

/** A calendar date in a text: { iso } when it is plain, { a, b, y } when it could be month-day or day-month. `order`: 'mdy' | 'dmy' once known. */
function readDate(s, order) {
  const t = String(s).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return { iso: iso(+m[1], +m[2], +m[3]) };
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(t);
  if (m) {
    const a = +m[1]; const b = +m[2]; const y = fullYear(+m[3]);
    if (a > 12 && b <= 12) return { iso: iso(y, b, a) };
    if (b > 12 && a <= 12) return { iso: iso(y, a, b) };
    if (a === b || order === 'mdy') return { iso: iso(y, a, b) };
    if (order === 'dmy') return { iso: iso(y, b, a) };
    return { a, b, y };
  }
  m = new RegExp(`^(${MONTHS})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})$`, 'i').exec(t);
  if (m) return { iso: iso(+m[3], MON_NUM[m[1].toLowerCase()], +m[2]) };
  m = new RegExp(`^(\\d{1,2})\\s+(${MONTHS})[a-z]*\\.?,?\\s+(\\d{4})$`, 'i').exec(t);
  if (m) return { iso: iso(+m[3], MON_NUM[m[2].toLowerCase()], +m[1]) };
  return null;
}
/** What the document's own dates say about month-day order: 'mdy', 'dmy', or null (nothing settles it, or they disagree). */
function dateOrder(lines) {
  let mdy = false; let dmy = false;
  for (const l of lines) for (const x of l.text.matchAll(DATE_RE)) {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(x[1]);
    if (m) { if (+m[1] > 12 && +m[2] <= 12) dmy = true; if (+m[2] > 12 && +m[1] <= 12) mdy = true; }
  }
  return mdy && !dmy ? 'mdy' : dmy && !mdy ? 'dmy' : null;
}
const DATE_ASK = (id) => ({ id, question: 'These dates could be month/day or day/month. Which is it?', options: [{ value: 'mdy', label: 'Month/day/year (12/31/2026 is December 31)' }, { value: 'dmy', label: 'Day/month/year (12/11/2026 is 12 November)' }] });
const dayNumber = (isoDate) => Math.round(Date.UTC(+isoDate.slice(0, 4), +isoDate.slice(5, 7) - 1, +isoDate.slice(8, 10)) / 864e5);
const dateText = (isoDate) => new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });

/** A money amount at the start of `s` ($ and commas, at most two decimals), or null; a percent, a longer decimal or a unit after it is not money. */
function readMoney(s) {
  const m = /^[\s:=.\-–]*(\(?)\s*(-?)\$?\s*(-?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(\)?)(?![\d%]|\.\d)/.exec(String(s));
  if (!m) return null;
  if (m[5] && m[5].length > 3) return null;
  const v = Number(`${m[4].replace(/,/g, '')}${m[5] || ''}`);
  const neg = !!(m[2] || m[3] || (m[1] && m[6]));
  return Number.isFinite(v) ? { amt: toCents(neg ? -v : v), text: m[0].trim().replace(/^[:=.\-–\s]+/, '') } : null;
}
/** What follows a label on its line, or the next line when nothing but the label is on this one. */
function afterLabel(lines, i, re) {
  const m = re.exec(lines[i].text);
  if (!m) return null;
  let rest = lines[i].text.slice(m.index + m[0].length);
  let at = lines[i];
  if (!/\S/.test(rest.replace(/[:.\-–\s]/g, '')) && lines[i + 1]) { rest = lines[i + 1].text.trim(); at = lines[i + 1]; }
  return { rest, at };
}
const find = (lines, re) => lines.map((l, i) => (re.test(l.text) ? i : -1)).filter((i) => i >= 0);
const out = (key, label, text, value, where) => ({ key, label, text, value, where });

/* ------------------------------------------------------------ property tax bill */

const YEAR_RE = /\b(?:tax(?:able)? year|levy year|bill year|fiscal year|fy)\b[\s:.\-#]{0,60}((?:19|20)\d\d)(?:\s*[-–/]\s*((?:19|20)?\d\d))?/i;
const PARCEL_RE = /\b(?:parcel(?:\s*(?:id|number|no\.?|#))?|apn|pin)\b\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9 .\-/]{3,24}[A-Z0-9])/i;
const ASSESSED_RE = /\b((?:total\s+)?(?:net\s+)?assessed\s+value(?:\s*\(?total\)?)?)\b/i;
const TOTAL_TAX_RE = /\b(total\s+(?:real\s+(?:estate\s+|property\s+)?)?tax(?:es)?(?:\s+(?:levied|billed|for\s+(?:the\s+)?(?:tax\s+)?year))?|annual\s+(?:real\s+(?:estate\s+|property\s+)?)?tax(?:es)?|total\s+annual\s+tax(?:es)?|net\s+(?:real\s+(?:estate\s+|property\s+)?)?tax(?:es)?|tax(?:es)?\s+for\s+(?:the\s+)?year|tax\s+levy)\b/i; // "total tax due" is not here: it is what is due now, and is asked about (DUE_TAX_RE)
const DUE_TAX_RE = /\b(total\s+(?:tax(?:es)?\s+)?(?:amount\s+)?due|amount\s+due|total\s+tax(?:es)?\s+due)\b/i;
const INSTALL_RE = /\b(1st|first|2nd|second|3rd|third|4th|fourth)\s+(?:half|install?ment|payment|quarter)\b|\binstall?ment\s*(?:no\.?\s*)?([1-4])\b|\b(spring|fall|winter|summer)\s+(?:install?ment|payment|bill)\b/i;
const ORD = { '1st': 1, first: 1, '2nd': 2, second: 2, '3rd': 3, third: 3, '4th': 4, fourth: 4, spring: 1, fall: 2, winter: 1, summer: 2 };

function readTaxBill(lines, answers) {
  const fields = []; const asks = []; const notes = [];
  const order = answers.dateOrder || dateOrder(lines);
  // the tax year: more than one labelled year (a prior-year comparison) is asked, not picked
  const years = new Map();
  for (const i of find(lines, YEAR_RE)) { const m = YEAR_RE.exec(lines[i].text); const y = m[1] + (m[2] ? `-${m[2].slice(-2)}` : ''); if (!years.has(y)) years.set(y, i); }
  if (years.size > 1 && !answers.taxYear) asks.push({ id: 'taxYear', question: 'The bill names more than one tax year. Which is this bill for?', options: [...years.keys()].map((y) => ({ value: y, label: y })) });
  const year = years.size === 1 ? [...years.keys()][0] : answers.taxYear && years.has(answers.taxYear) ? answers.taxYear : null;
  if (year) fields.push(out('taxYear', 'Tax year', year, year, lines[years.get(year)].where));
  const pi = find(lines, PARCEL_RE)[0];
  if (pi !== undefined) { const m = PARCEL_RE.exec(lines[pi].text); const id = m[1].trim().replace(/\s{2,}.*$/, ''); fields.push(out('parcel', 'Parcel', id, id, lines[pi].where)); }
  // the assessed value: the line that says total, or the one line; several different ones are asked
  const av = [];
  for (const i of find(lines, ASSESSED_RE)) { const a = afterLabel(lines, i, ASSESSED_RE); const mv = a && readMoney(a.rest); if (mv) av.push({ ...mv, label: ASSESSED_RE.exec(lines[i].text)[1], where: a.at.where }); }
  const avTotal = av.filter((x) => /total|net/i.test(x.label));
  const avPick = avTotal.length ? avTotal : av;
  const avVals = [...new Set(avPick.map((x) => x.amt))];
  if (avVals.length === 1) { const x = avPick[0]; fields.push(out('assessed', 'Assessed value', $(x.amt), x.amt, x.where)); }
  else if (avVals.length > 1 && !answers.assessed) asks.push({ id: 'assessed', question: 'The bill shows more than one assessed value. Which is the total for the parcel?', options: avVals.map((v) => ({ value: String(v), label: $(v) })) });
  else if (avVals.length > 1) { const x = avPick.find((y) => String(y.amt) === answers.assessed); if (x) fields.push(out('assessed', 'Assessed value', $(x.amt), x.amt, x.where)); }
  // installments: each with its own amount and due date; an installment is never the year
  const inst = []; const seen = new Set();
  for (let k = 0; k < lines.length; k++) {
    const m = INSTALL_RE.exec(lines[k].text);
    if (!m) continue;
    const num = ORD[(m[1] || m[3] || '').toLowerCase()] || (m[2] ? +m[2] : 0);
    const win = [lines[k], lines[k + 1]].filter(Boolean);
    const joined = lines[k].text.slice(m.index + m[0].length).replace(/^\s*of\s+\d+\s*/i, '');
    const amt = readMoney(joined.replace(DATE_RE, ' ').replace(/^[^$\d(]*(?=[$(\d])/, '')) || (lines[k + 1] ? readMoney(lines[k + 1].text.replace(DATE_RE, ' ').replace(/^[^$\d(]*(?=[$(\d])/, '')) : null);
    if (!amt || amt.amt <= 0) continue;
    const dm = win.map((w) => w.text).join(' ').match(DATE_RE);
    const due = dm ? readDate(dm[0], order) : null;
    const key = `${num}:${amt.amt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    inst.push({ n: num, amt: amt.amt, dueText: dm ? dm[0] : '', due, label: m[0].replace(/\s+/g, ' '), where: lines[k].where });
  }
  let needDates = false;
  for (const x of inst) {
    const d = x.due;
    const dueIso = d && d.iso ? d.iso : null;
    if (d && !d.iso) needDates = true;
    fields.push(out(`installment${x.n || ''}`, `Installment (${x.label})`, `${$(x.amt)}${x.dueText ? `, due ${x.dueText}` : ''}`, { amt: x.amt, due: dueIso }, x.where));
  }
  if (needDates && !answers.dateOrder) asks.push(DATE_ASK('dateOrder'));
  // the annual total: a line that says it is the total for the year; a total due or an installment is not the year
  const totals = [];
  for (const i of find(lines, TOTAL_TAX_RE)) { const a = afterLabel(lines, i, TOTAL_TAX_RE); const mv = a && readMoney(a.rest); if (mv && mv.amt > 0) totals.push({ ...mv, where: a.at.where }); }
  const totalVals = [...new Set(totals.map((x) => x.amt))];
  const nums = inst.map((x) => x.n).filter(Boolean);
  const allParts = inst.length >= 2 && new Set(nums).size === inst.length && nums.every((n, i) => n === Math.min(...nums) + i) && Math.min(...nums) === 1;
  const sum = toCents(inst.reduce((s, x) => s + x.amt, 0));
  if (totalVals.length > 1 && !answers.annual) asks.push({ id: 'annual', question: 'The bill shows more than one total tax. Which is the full year’s tax?', options: totalVals.map((v) => ({ value: String(v), label: $(v) })) });
  else if (totalVals.length >= 1) {
    const pick = totalVals.length > 1 ? totals.find((x) => String(x.amt) === answers.annual) : totals[0];
    if (allParts && Math.abs(sum - pick.amt) > 100 && answers.annualConflict !== 'total' && answers.annualConflict !== 'sum') asks.push({ id: 'annualConflict', question: `The installments add up to ${$(sum)} but the bill’s total tax is ${$(pick.amt)}. Which is the full year’s tax?`, options: [{ value: 'total', label: `The total, ${$(pick.amt)}` }, { value: 'sum', label: `The installments, ${$(sum)}` }] });
    else if (allParts && Math.abs(sum - pick.amt) > 100) fields.push(out('annualTax', 'Total tax for the year', answers.annualConflict === 'sum' ? $(sum) : $(pick.amt), answers.annualConflict === 'sum' ? sum : pick.amt, pick.where));
    else {
      fields.push(out('annualTax', 'Total tax for the year', $(pick.amt), pick.amt, pick.where));
      if (inst.length) notes.push(allParts ? 'The installments are parts of that total: the year’s tax is counted once.' : 'An installment shown is part of the year’s tax, not an addition to it.');
    }
  } else if (allParts && !answers.annualFromParts) {
    asks.push({ id: 'annualFromParts', question: `No total for the year is printed. The ${inst.length} installments add up to ${$(sum)}. Take that as the year’s tax?`, options: [{ value: 'yes', label: `Yes, ${$(sum)}` }, { value: 'no', label: 'No, leave it blank' }] });
  } else if (allParts && answers.annualFromParts === 'yes') fields.push(out('annualTax', 'Total tax for the year', `${$(sum)} (the installments added up)`, sum, inst[0].where));
  else if (!allParts) {
    const due = [];
    for (const i of find(lines, DUE_TAX_RE)) { const a = afterLabel(lines, i, DUE_TAX_RE); const mv = a && readMoney(a.rest); if (mv && mv.amt > 0) due.push({ ...mv, where: a.at.where }); }
    const dv = [...new Set(due.map((x) => x.amt))];
    if (dv.length === 1 && !inst.length && !answers.dueIsYear) asks.push({ id: 'dueIsYear', question: `The bill shows ${$(dv[0])} as the amount due. Is that the full year’s tax, or only what is due now?`, options: [{ value: 'yes', label: 'The full year’s tax' }, { value: 'no', label: 'Only what is due now' }] });
    else if (dv.length === 1 && answers.dueIsYear === 'yes') fields.push(out('annualTax', 'Total tax for the year', $(dv[0]), dv[0], due[0].where));
    else if (inst.length) notes.push('Only part of the year is shown (an installment), so the year’s tax is not read from it.');
  }
  return { type: 'taxbill', fields, asks, notes };
}

/* ------------------------------------------------------------ utility bill */

const PERIOD_RE = /\b(?:service|billing|bill|statement|usage|meter)\s*(?:period|dates?|from|through)\b|\bperiod\s*(?:covered|from)?\b|\bservice\s+from\b/i;
/** @type {[RegExp, string][]} */
const USAGE_UNIT = [[/^kwh$/i, 'kWh'], [/^therms?$/i, 'therms'], [/^ccf$/i, 'CCF'], [/^hcf$/i, 'HCF'], [/^mcf$/i, 'MCF'], [/^(?:gal|gallons?)$/i, 'gallons'], [/^(?:cf|cubic\s*feet)$/i, 'cubic feet'], [/^(?:kgal|1,?000\s*gal(?:lons)?)$/i, 'thousand gallons']];
const UNIT_RE = /\b(kwh|therms?|ccf|hcf|mcf|kgal|gallons?|gal|cubic\s*feet|cf)\b/i;
const CHARGE_RE = /\b((?:total\s+)?(?:new|current)\s+charges?(?:\s+this\s+(?:bill|period))?|total\s+charges?\s+this\s+(?:bill|period)|total\s+(?:for\s+)?this\s+(?:bill|period)|amount\s+of\s+this\s+bill|this\s+period['’]?s?\s+charges)\b/i;
const AMT_DUE_RE = /\b(total\s+amount\s+due|amount\s+due|total\s+due|balance\s+due|please\s+pay)\b/i;
const PREV_RE = /\b(previous\s+balance|prior\s+balance|past\s+due|balance\s+forward|unpaid\s+balance|arrears)\b/i;
const USAGE_RE = /\b((?:total\s+)?(?:usage|consumption|used|kwh\s+used|energy\s+used))\b/i;
/** @type {[string, string, RegExp][]} */
const UTYPES = [['electric', 'Electric', /\b(electric(?:ity)?|kwh|kilowatt)\b/i], ['gas', 'Natural gas', /\b(natural gas|therms?|gas service|gas bill)\b/i], ['water', 'Water and sewer', /\b(water|sewer|sewage|wastewater)\b/i], ['trash', 'Trash and recycling', /\b(trash|refuse|solid waste|recycling|garbage)\b/i]];

function readUtilityBill(lines, answers) {
  const fields = []; const asks = []; const notes = [];
  const order = answers.dateOrder || dateOrder(lines);
  const all = lines.map((l) => l.text).join('\n');
  // the kind of utility: one family on the bill, or the broker's answer
  const kinds = UTYPES.filter(([, , re]) => re.test(all));
  const kindId = kinds.length === 1 ? kinds[0][0] : answers.utilType && UTYPES.some((u) => u[0] === answers.utilType) ? answers.utilType : null;
  if (kinds.length > 1 && !kindId) asks.push({ id: 'utilType', question: 'This bill mentions more than one kind of service. Which is it for?', options: kinds.map(([id, label]) => ({ value: id, label })) });
  if (kindId) { const u = UTYPES.find((x) => x[0] === kindId); const wi = lines.findIndex((l) => u[2].test(l.text)); fields.push(out('utilityType', 'Utility', u[1], u[1], wi >= 0 ? lines[wi].where : lines[0].where)); }
  // the service period: two dates after a period label; both dates must be unambiguous to be read
  let per = null;
  for (const i of find(lines, PERIOD_RE)) {
    const win = [lines[i].text, lines[i + 1] ? lines[i + 1].text : ''].join(' ');
    const d = [...win.matchAll(DATE_RE)].map((x) => x[1]);
    if (d.length >= 2) { per = { a: d[0], b: d[1], where: lines[i].where }; break; }
  }
  if (per) {
    const a = readDate(per.a, order); const b = readDate(per.b, order);
    if (a && b && (!a.iso || !b.iso)) asks.push(DATE_ASK('dateOrder'));
    else if (a && b && a.iso && b.iso) {
      const days = dayNumber(b.iso) - dayNumber(a.iso) + 1;
      if (days < 1) asks.push({ id: 'periodOrder', question: `The period reads ${per.a} to ${per.b}, which ends before it starts. Check the dates on the bill; nothing was read.`, options: [] });
      else {
        fields.push(out('periodFrom', 'Service period from', per.a, a.iso, per.where), out('periodTo', 'Service period to', per.b, b.iso, per.where));
        fields.push(out('periodDays', 'Days in the period', `${days} day${days === 1 ? '' : 's'}`, days, per.where));
        const months = days / 30.4;
        if (months > 1.4) notes.push(`This bill covers ${dateText(a.iso)} to ${dateText(b.iso)}, ${days} days (about ${Math.round(months)} months). Its amount is for the whole period, not one month; it is not divided or scaled.`);
        else if (months < 0.6) notes.push(`The period is only ${days} days: the amount is for those days, not a month.`);
      }
    }
  }
  // the charge for the period: "current charges", not an amount due that may carry an earlier balance
  const chg = [];
  for (const i of find(lines, CHARGE_RE)) { const a = afterLabel(lines, i, CHARGE_RE); const mv = a && readMoney(a.rest); if (mv) chg.push({ ...mv, where: a.at.where }); }
  const chgVals = [...new Set(chg.map((x) => x.amt))];
  const prev = [];
  for (const i of find(lines, PREV_RE)) { const a = afterLabel(lines, i, PREV_RE); const mv = a && readMoney(a.rest); if (mv && mv.amt !== 0) prev.push(mv); }
  if (chgVals.length === 1) fields.push(out('charge', 'Charges for the period', $(chgVals[0]), chgVals[0], chg[0].where));
  else if (chgVals.length > 1 && !answers.charge) asks.push({ id: 'charge', question: 'More than one current-charges total is printed. Which is this bill’s charge?', options: chgVals.map((v) => ({ value: String(v), label: $(v) })) });
  else if (chgVals.length > 1) { const x = chg.find((y) => String(y.amt) === answers.charge); if (x) fields.push(out('charge', 'Charges for the period', $(x.amt), x.amt, x.where)); }
  else {
    const due = [];
    for (const i of find(lines, AMT_DUE_RE)) { const a = afterLabel(lines, i, AMT_DUE_RE); const mv = a && readMoney(a.rest); if (mv) due.push({ ...mv, where: a.at.where }); }
    const dv = [...new Set(due.map((x) => x.amt))];
    if (dv.length === 1 && !prev.length) fields.push(out('charge', 'Amount due', $(dv[0]), dv[0], due[0].where));
    else if (dv.length >= 1) {
      if (!answers.amountIsPeriod) asks.push({ id: 'amountIsPeriod', question: `The bill shows ${dv.map($).join(' and ')} as the amount due${prev.length ? ' and also an earlier balance' : ''}. Is that this period’s charge alone?`, options: [{ value: 'yes', label: 'Yes, this period’s charge only' }, { value: 'no', label: 'No, leave it blank' }] });
      else if (answers.amountIsPeriod === 'yes' && dv.length === 1) fields.push(out('charge', 'Charges for the period', $(dv[0]), dv[0], due[0].where));
    }
  }
  // usage and its unit: the unit is printed or asked, never assumed from the kind of utility
  const use = [];
  for (const i of find(lines, USAGE_RE)) {
    const a = afterLabel(lines, i, USAGE_RE);
    if (!a) continue;
    const m = /^[\s:=.\-–]*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*([A-Za-z][A-Za-z ]{0,14})?/.exec(a.rest);
    if (!m || (m[2] && m[2].length > 4)) continue;
    const um = m[3] ? UNIT_RE.exec(m[3]) : null;
    use.push({ n: Number(`${m[1].replace(/,/g, '')}${m[2] || ''}`), unit: um ? USAGE_UNIT.find(([re]) => re.test(um[1].replace(/\s+/g, '')))?.[1] || um[1] : null, text: m[0].trim(), where: a.at.where });
  }
  const useKeys = [...new Set(use.map((u) => `${u.n}|${u.unit}`))];
  if (useKeys.length === 1) {
    const u = use[0];
    const unit = u.unit || answers.usageUnit || null;
    if (!u.unit && !answers.usageUnit) asks.push({ id: 'usageUnit', question: `The bill shows a usage of ${u.n.toLocaleString('en-US')} with no unit. What is it measured in?`, options: ['kWh', 'therms', 'CCF', 'gallons', 'cubic feet'].map((x) => ({ value: x, label: x })) });
    else fields.push(out('usage', 'Usage', `${u.n.toLocaleString('en-US')} ${unit}`, { amount: u.n, unit }, u.where));
  } else if (useKeys.length > 1) {
    const tot = use.find((u) => /total/i.test(lines.find((l) => l.where === u.where)?.text || ''));
    if (tot && tot.unit) fields.push(out('usage', 'Usage', `${tot.n.toLocaleString('en-US')} ${tot.unit}`, { amount: tot.n, unit: tot.unit }, tot.where));
    else notes.push('More than one usage figure is printed (more than one meter or rate?); none was picked.');
  }
  return { type: 'utilities', fields, asks, notes };
}

/* ------------------------------------------------------------ unit mix */

const H = {
  type: /\b(unit\s*type|floor\s*plan|plan|type|style|description|bed(?:room)?s?|unit\s*mix)\b/i,
  count: /(?:#|no\.?|number)\s*(?:of\s*)?units?|^units?$|unit\s*count|^count$|^qty$|^total\s+units$|^#$/i,
  sf: /\b(sf|sq\.?\s*ft\.?|square\s*f(?:ee|oo)t(?:age)?|size)\b/i,
  rent: /\brent\b|\brate\b/i,
  inPlace: /(in[- ]?place|current|actual|contract|effective)/i,
  market: /(market|asking|pro ?forma|potential)/i,
  month: /\bmonthly\b|\bmonth\b|\/\s?mo\b|\bper mo/i,
  year: /\bannual(?:ly)?\b|\byearly\b|\/\s?yr\b|\bper year\b|\bper annum\b/i,
  avg: /\b(avg|average|per unit|each|unit size)\b/i,
  total: /\btotal\b|\bsum\b|\baggregate\b/i,
};
const cellsOf = (l) => l.cells || l.text.trim().split(/\s{2,}/).map((c) => c.trim());
const hasDigit = (c) => /\d/.test(c);

function kindOfHeader(h) {
  const t = h.trim();
  if (!t) return null;
  if (/\/\s?(?:sf|sq)|per\s+(?:sf|sq)|\bpsf\b/i.test(t)) return { kind: 'other' }; // a rent per SF is not the rent
  if (H.rent.test(t) && !H.count.test(t)) return { kind: 'rent', place: H.inPlace.test(t) ? 'inPlace' : H.market.test(t) ? 'market' : null, period: H.month.test(t) ? 'month' : H.year.test(t) ? 'year' : null };
  if (H.sf.test(t)) return { kind: 'sf', basis: H.avg.test(t) ? 'avg' : H.total.test(t) ? 'total' : null };
  if (H.count.test(t) || /^units?$/i.test(t)) return { kind: 'count' };
  if (H.type.test(t)) return { kind: 'type' };
  return { kind: 'other' };
}
const num = (s) => { const m = /^\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s*(?:sf|sq\.?\s*ft\.?)?\s*$/i.exec(String(s)); return m ? Number(`${m[1].replace(/,/g, '')}${m[2] || ''}`) : null; };

function readUnitMix(lines, answers) {
  const fields = []; const asks = []; const notes = [];
  // the header: a row naming a type (or "units") and at least two of count, SF, rent
  let hi = -1; let cols = null;
  const qualifies = (ks) => { const s = new Set(ks.filter((k) => k && k.kind !== 'other').map((k) => k.kind)); return (s.has('type') || s.has('count')) && [s.has('count'), s.has('sf'), s.has('rent')].filter(Boolean).length >= 2; };
  for (let i = 0; i < lines.length && hi < 0; i++) {
    let cells = cellsOf(lines[i]);
    if (cells.length < 3) continue;
    let ks = cells.map(kindOfHeader); let skip = 0;
    // a header split over two rows ("Avg" over "SF", "In-Place" over "Rent"): the next row's words are added when it holds no figures
    const nx = lines[i + 1] ? cellsOf(lines[i + 1]) : null;
    if (!qualifies(ks) && nx && nx.some(Boolean) && !nx.some(hasDigit) && Math.abs(nx.length - cells.length) <= 1) {
      const merged = cells.map((c, j) => `${c} ${nx[j] || ''}`.trim());
      const k2 = merged.map(kindOfHeader);
      if (qualifies(k2)) { cells = merged; ks = k2; skip = 1; }
    }
    if (qualifies(ks)) { hi = i; cols = { cells, ks, skip }; }
  }
  if (hi < 0) return { type: 'unitMix', fields, asks, notes: ['No table with unit types, counts, SF and rents was found.'] };
  const idx = (kind) => cols.ks.map((k, j) => (k && k.kind === kind ? j : -1)).filter((j) => j >= 0);
  const typeCol = idx('type')[0] ?? 0;
  const countCol = idx('count')[0];
  const sfCols = idx('sf'); const rentCols = idx('rent');
  const rows = []; let total = null;
  for (let i = hi + 1 + cols.skip; i < lines.length; i++) {
    const c = cellsOf(lines[i]);
    const label = (c[typeCol] || '').trim();
    if (!label && !c.some(hasDigit)) break;
    if (/^total|^all units|^overall/i.test(label)) { total = { c, where: lines[i].where }; break; }
    if (/^(?:average|avg|weighted)/i.test(label)) continue;
    const count = countCol !== undefined ? num(c[countCol]) : null;
    if (!label || !c.slice(1).some(hasDigit)) { if (rows.length) break; continue; }
    rows.push({ label, c, count: count !== null && Number.isInteger(count) && count > 0 && count < 5000 ? count : null, where: lines[i].where });
  }
  if (!rows.length) return { type: 'unitMix', fields, asks, notes: ['The unit mix header was found but no unit rows under it.'] };
  // SF: a column that says average or total, or the Total row decides; else it is asked, never assumed
  let sfBasis = null; const sfCol = sfCols[0];
  if (sfCol !== undefined) {
    sfBasis = cols.ks[sfCol].basis || answers.sfBasis || null;
    if (!sfBasis && total && num(total.c[sfCol]) !== null && rows.every((r) => num(r.c[sfCol]) !== null && r.count)) {
      const t = num(total.c[sfCol]); const s1 = rows.reduce((s, r) => s + num(r.c[sfCol]), 0); const s2 = rows.reduce((s, r) => s + num(r.c[sfCol]) * r.count, 0);
      if (Math.abs(t - s1) <= 1 && Math.abs(t - s2) > 1) sfBasis = 'total'; else if (Math.abs(t - s2) <= Math.max(1, t * 0.002) && Math.abs(t - s1) > 1) sfBasis = 'avg';
      if (sfBasis) notes.push(`The SF column is ${sfBasis === 'avg' ? 'per unit' : 'the total for each type'}: the Total row adds up that way.`);
    }
    if (!sfBasis) asks.push({ id: 'sfBasis', question: 'Is the SF column the size of one unit, or the total SF of all the units of that type?', options: [{ value: 'avg', label: 'Size of one unit' }, { value: 'total', label: 'Total for the type' }] });
  }
  // rent: the column says in-place or market, monthly or annual; what it does not say is asked
  const rentInfo = rentCols.map((j) => ({ j, ...cols.ks[j] }));
  const unplaced = rentInfo.filter((r) => !r.place);
  if (unplaced.length && rentInfo.length === 1 && !answers.rentPlace) asks.push({ id: 'rentPlace', question: 'Is the rent column what tenants pay now (in-place), or the market rent?', options: [{ value: 'inPlace', label: 'In-place (what is paid now)' }, { value: 'market', label: 'Market (asking)' }] });
  else if (unplaced.length && rentInfo.length > 1) notes.push('Rent columns that do not say in-place or market were not read.');
  const periodOf = (r) => r.period || answers.rentPeriod || null;
  if (rentInfo.some((r) => !r.period) && !answers.rentPeriod) asks.push({ id: 'rentPeriod', question: 'Are the rents per month or per year?', options: [{ value: 'month', label: 'Per month' }, { value: 'year', label: 'Per year' }] });
  const placeOf = (r) => r.place || (rentInfo.length === 1 ? answers.rentPlace || null : null);
  const unitWord = (p) => (p === 'year' ? '/yr' : '/mo');
  let units = 0; let blanks = 0;
  for (const r of rows) {
    const bits = [];
    const v = { type: r.label, count: r.count };
    if (r.count) { bits.push(`${r.count} unit${r.count === 1 ? '' : 's'}`); units += r.count; } else { bits.push('units not read'); blanks++; }
    if (sfCol !== undefined) { const sf = num(r.c[sfCol]); if (sf !== null && sfBasis) { v.sf = sf; v.sfBasis = sfBasis; bits.push(`${sf.toLocaleString('en-US')} SF ${sfBasis === 'avg' ? 'each' : 'in total'}`); } else if (sf !== null) bits.push(`${sf.toLocaleString('en-US')} SF (per unit or total: asked)`); }
    for (const ri of rentInfo) {
      const m = num(r.c[ri.j]);
      if (m === null) continue;
      const p = periodOf(ri); const pl = placeOf(ri);
      if (!p || !pl) { bits.push(`rent ${$(toCents(m))} (${!pl ? 'in-place or market' : 'monthly or annual'}: asked)`); continue; }
      v[pl === 'inPlace' ? 'inPlaceRent' : 'marketRent'] = { amt: toCents(m), period: p };
      bits.push(`${pl === 'inPlace' ? 'in-place' : 'market'} ${$(toCents(m))}${unitWord(p)}`);
    }
    fields.push(out('unitType', `Unit type ${r.label}`, bits.join(' · '), v, r.where));
  }
  if (total && countCol !== undefined) {
    const t = num(total.c[countCol]);
    if (t !== null && !blanks && t !== units) notes.push(`The Total row says ${t.toLocaleString('en-US')} units but the rows add up to ${units.toLocaleString('en-US')}.`);
    else if (t !== null && !blanks) notes.push(`The ${units.toLocaleString('en-US')} units add up to the Total row.`);
  }
  if (blanks) notes.push(`${blanks} row${blanks === 1 ? '' : 's'} had no clear unit count: left blank.`);
  return { type: 'unitMix', fields, asks, notes };
}

/* ------------------------------------------------------------ one entry */

/** @param {string} type 'taxbill' | 'utilities' | 'unitMix' @param {{ pages?: string[], grids?: any[] }} src @param {Record<string, string>} [answers] */
export function readFacts(type, src, answers = {}) {
  const lines = linesOf(src);
  if (!lines.length) return { type, fields: [], asks: [], notes: ['There was no text to read.'] };
  if (type === 'taxbill') return readTaxBill(lines, answers);
  if (type === 'utilities') return readUtilityBill(lines, answers);
  if (type === 'unitMix') return readUnitMix(lines, answers);
  return { type, fields: [], asks: [], notes: [] };
}

/** One short sentence for a status line: what was read, and that figures are to be checked. */
export function factsLine(f) {
  if (!f || (!f.fields.length && !f.asks.length)) return '';
  const first = f.fields.slice(0, 3).map((x) => `${x.label.toLowerCase()} ${x.text}`).join(', ');
  return `${f.fields.length ? `Read ${f.fields.length} figure${f.fields.length === 1 ? '' : 's'} (${first}${f.fields.length > 3 ? ', …' : ''}); check each against the page.` : ''}${f.asks.length ? ` ${f.asks.length} question${f.asks.length === 1 ? '' : 's'} to answer.` : ''}`.trim();
}
