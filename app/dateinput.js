/* dateinput.js -- the one date field every screen uses.
 *
 * A date is typed as text, the way a broker writes it (1/15/27, 01/15/2027,
 * Jan 2027), and read when the person leaves the field or presses Enter.
 * Nothing is read, reformatted or stored while keys are still going in, so a
 * half-typed year is never wiped and the field never loses focus. The browser's
 * own date control fires a change for every segment (an empty value, or the
 * year 0002, on the way to 2027), which is what used to delete typed dates.
 * A small calendar button opens the browser's picker as the second way in.
 *
 * parseDateText and fmtDate are pure and run in Node; dateInput builds the
 * element and touches the page only when it is called. */
import { icon } from './icons.js';

/** @typedef {string} IsoDay A calendar day as 'YYYY-MM-DD'. */

/** The earliest and latest year a typed date may name. */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';

const pad = (n, w = 2) => String(n).padStart(w, '0');
const leap = (y) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
const daysIn = (y, m) => (m === 2 ? (leap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);

/** A real calendar day as an ISO string, or null (no 02/30, years only 1900 to 2100). */
function make(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}
/** The first, or with `end` the last, day of a month. */
const monthDay = (y, m, end) => (m >= 1 && m <= 12 ? make(y, m, end ? daysIn(y, m) : 1) : null);
/** Two-digit years mean 20yy. */
const year2 = (s) => 2000 + Number(s);
const year = (s) => (s.length === 2 ? year2(s) : Number(s));

/**
 * Read a typed date.
 *
 * Returns the ISO day ('2027-01-15'), `''` when the text is empty (the date
 * was cleared) or `null` when it is not a date; callers tell a cleared field
 * from a bad one by comparing with ''. A month with no day (Jan 2027, 1/2027)
 * means its first day, or its last day when `end` is true (the fields that end
 * something: lease end, a period's To, an abatement's To).
 *
 * Accepted: 01/15/2027, 1/15/27 (20yy), 1-15-2027, 1.15.2027, 2027-01-15,
 * 01152027 and 011527 (what a phone's number pad gives), Jan 2027, January
 * 2027, Jan-27, Jan 15 2027, Jan 15, 2027 and 1/2027.
 * @param {unknown} s
 * @param {{ end?: boolean }} [opts]
 * @returns {IsoDay | '' | null}
 */
export function parseDateText(s, { end = false } = {}) {
  if (s === null || s === undefined) return '';
  const t = String(s).trim().replace(/\s+/g, ' ');
  if (t === '') return '';
  let m;
  // 2027-01-15
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t))) return make(+m[1], +m[2], +m[3]);
  // 01/15/2027, 1/15/27
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/.exec(t))) return make(year(m[3]), +m[1], +m[2]);
  // 1/2027
  if ((m = /^(\d{1,2})[-/.](\d{4})$/.exec(t))) return monthDay(+m[2], +m[1], end);
  // 01152027 or 011527, typed without separators
  if ((m = /^(\d{2})(\d{2})(\d{4})$/.exec(t))) return make(+m[3], +m[1], +m[2]) ?? make(+t.slice(0, 4), +t.slice(4, 6), +t.slice(6));
  if ((m = /^(\d{2})(\d{2})(\d{2})$/.exec(t))) return make(year2(m[3]), +m[1], +m[2]);
  // Jan 2027, January 2027, Jan-27 (a month and a year; "Jan 27" with a space could be a day, so it is not guessed)
  if ((m = new RegExp(`^${MONTH_RE}(?:[ ,./-]*(\\d{4})|[./-](\\d{2}))$`, 'i').exec(t))) return monthDay(year(m[2] || m[3]), MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, end);
  // Jan 15 2027, January 15, 2027, Jan 15 27
  if ((m = new RegExp(`^${MONTH_RE}[ ./-]*(\\d{1,2})(?:st|nd|rd|th)?[ ,/.-]+(\\d{4}|\\d{2})$`, 'i').exec(t))) return make(year(m[3]), MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]);
  return null;
}

/**
 * A day for display: 01/15/2027. Anything that is not an ISO day is shown as it is.
 * @param {unknown} iso
 */
export function fmtDate(iso) {
  if (iso === null || iso === undefined || iso === '') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[2]}/${m[3]}/${m[1]}` : String(iso);
}

/** What the hint says under a field that could not be read. */
export const DATE_HINT = 'Try 01/15/2027 or Jan 2027';

let seq = 0;

/**
 * A date field. The element returned wraps a text input, the hint and the
 * calendar button; read it with `.value` (the committed ISO day, or ''), set it
 * with `.value = iso`, focus it with `.focus()`, and reach the input as `.input`.
 *
 * Rules the field keeps: it never writes the input's value while keys are
 * being typed or while the input has focus on its own account; it reads the text
 * on blur and on Enter only; a good date shows as MM/DD/YYYY and goes to
 * `onCommit(iso)` if it changed (`onCommit('')` if it was cleared); text that is
 * not a date stays put with a hint and is not committed; Escape puts back the
 * last committed date.
 * @param {{
 *   value?: IsoDay | null, label?: string, id?: string, end?: boolean, required?: boolean,
 *   onCommit?: (iso: IsoDay | '') => void,
 * }} [opts]
 */
export function dateInput({ value = '', label = '', id = '', end = false, onCommit, required = false } = {}) {
  const n = ++seq;
  const wrap = /** @type {HTMLSpanElement & { value: string, input: HTMLInputElement, focus: () => void }} */ (document.createElement('span'));
  wrap.className = 'dateinput';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'di-text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off');
  input.placeholder = 'MM/DD/YYYY';
  if (id) input.id = id;
  if (label) input.setAttribute('aria-label', label);
  const hint = document.createElement('span');
  hint.className = 'di-hint';
  hint.id = `di-hint-${n}`;
  hint.setAttribute('aria-live', 'polite');
  const pick = document.createElement('button');
  pick.type = 'button';
  pick.className = 'di-pick';
  pick.tabIndex = -1; // typing is the way in from a keyboard; the button is for a finger or a mouse
  pick.setAttribute('aria-label', label ? `Pick a date for ${label}` : 'Pick a date');
  pick.innerHTML = icon('calendar', 18);
  const native = document.createElement('input');
  native.type = 'date';
  native.className = 'di-native';
  native.tabIndex = -1;
  native.min = `${MIN_YEAR}-01-01`;
  native.max = `${MAX_YEAR}-12-31`;
  native.setAttribute('aria-hidden', 'true');
  wrap.append(input, pick, native, hint);

  let committed = typeof value === 'string' && value ? value : '';
  let shown = fmtDate(committed);
  input.value = shown;

  const setInvalid = (text) => {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', hint.id);
    hint.textContent = text;
    wrap.classList.add('invalid');
  };
  const clearInvalid = () => {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    hint.textContent = '';
    wrap.classList.remove('invalid');
  };
  /** Put the committed date on show (never called for a keystroke). */
  const display = () => { shown = fmtDate(committed); input.value = shown; clearInvalid(); };

  /** Read the text: good dates are kept and reported, bad text is left alone. */
  function commit() {
    const text = input.value;
    if (text === shown) { clearInvalid(); return; } // the text is what is already kept
    const iso = parseDateText(text, { end });
    if (iso === null) { setInvalid(DATE_HINT); return; }
    if (iso === '' && required) { setInvalid('A date is needed here'); return; }
    const was = committed;
    committed = iso;
    display();
    if (iso !== was && onCommit) onCommit(iso);
  }

  input.addEventListener('input', () => { if (wrap.classList.contains('invalid')) clearInvalid(); });
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit(); // a form around the field still submits
    else if (e.key === 'Escape' && input.value !== shown) { e.preventDefault(); e.stopPropagation(); display(); }
  });

  const picked = () => {
    const v = native.value;
    if (!v || parseDateText(v) !== v) return; // a picker mid-way gives '' or a partial year: wait for a whole date
    const was = committed;
    committed = v;
    display();
    if (v !== was && onCommit) onCommit(v);
  };
  native.addEventListener('change', picked);
  pick.addEventListener('click', () => {
    native.value = committed || '';
    try { native.showPicker(); } catch { try { native.focus(); native.click(); } catch { /* text entry still works */ } }
  });

  Object.defineProperties(wrap, {
    input: { value: input },
    value: {
      get: () => committed,
      set: (v) => {
        const next = typeof v === 'string' && v ? v : '';
        const same = next === committed;
        committed = next;
        // a field being typed in keeps its text unless the date itself is being replaced
        if (document.activeElement === input && same) return;
        display();
      },
    },
    focus: { value: () => input.focus() },
  });
  return wrap;
}
