/* look.js -- Classic or the New look. The choice is kept on this device (like the theme) and applied
 * by a tiny script in index.html before the page first paints; Classic is the default and the
 * New look is only a [data-look="new"] attribute that styles.css reads. */
import { sync as syncTheme } from './theme.js';
import { accentFor, DEFAULT_ACCENT } from './accent.js';

const KEY = 'zlatura.look';
/** Solid controls: the New look's floating controls (step bar, messages, palette, tips) opaque instead of frosted.
 * A device preference like the look: localStorage only, never in a backup or in a deal. */
const SOLID_KEY = 'zlatura.solid';

/** Device-only New look choices, kept like the look and the solid switch: localStorage, never a backup or a deal. */
const ACCENT_KEY = 'zlatura.accent';
const MOTION_KEY = 'zlatura.motion';
const SIZE_KEY = 'zlatura.textsize';
const ACC_VARS = ['la', 'li', 'ls', 'da', 'di', 'ds'];
export const TEXT_SIZES = Object.freeze([100, 110, 120, 130]);

export function getLook() {
  try { return localStorage.getItem(KEY) === 'new' ? 'new' : 'classic'; } catch { return 'classic'; }
}

export function getSolid() {
  try { return localStorage.getItem(SOLID_KEY) === '1'; } catch { return false; }
}

export function setSolid(on) {
  try { if (on) localStorage.setItem(SOLID_KEY, '1'); else localStorage.removeItem(SOLID_KEY); } catch { /* blocked: this session only */ }
  if (on) document.documentElement.dataset.solid = '1'; else delete document.documentElement.dataset.solid;
  syncControls();
}

/** The accent choice as { hex, adjusted }; null when the default plum is in use. */
export function getAccent() {
  try { const a = JSON.parse(localStorage.getItem(ACCENT_KEY) || 'null'); return a && typeof a.h === 'string' && Array.isArray(a.c) && a.c.length === 6 ? { hex: a.h, adjusted: !!a.adj } : null; } catch { return null; }
}

/**
 * Choose the accent. The colour is adjusted until text in it reads (accent.js); a value that is not a colour is refused
 * (null). The default plum clears the choice. Returns { hex, adjusted, shown } for what the person should be told.
 * @param {string | null} input
 */
export function setAccent(input) {
  const root = document.documentElement;
  const a = input === null ? null : accentFor(input);
  if (input !== null && !a) return null;
  if (!a || a.hex === DEFAULT_ACCENT) {
    try { localStorage.removeItem(ACCENT_KEY); } catch { /* this session only */ }
    delete root.dataset.accent;
    for (const n of ACC_VARS) root.style.removeProperty(`--acc-${n}`);
    syncControls();
    return { hex: DEFAULT_ACCENT, adjusted: false, shown: DEFAULT_ACCENT };
  }
  const c = [a.light.accent, a.light.ink, a.light.soft, a.dark.accent, a.dark.ink, a.dark.soft];
  try { localStorage.setItem(ACCENT_KEY, JSON.stringify({ h: a.hex, adj: a.adjusted, c })); } catch { /* this session only */ }
  root.dataset.accent = '1';
  ACC_VARS.forEach((n, i) => root.style.setProperty(`--acc-${n}`, c[i]));
  syncControls();
  return { hex: a.hex, adjusted: a.adjusted, shown: a.light.accent };
}

/** Motion: on unless the person turned it off (the pointer glow, the lift and the preview's fade). The system's reduce setting always wins. */
export const getMotion = () => { try { return localStorage.getItem(MOTION_KEY) !== 'off'; } catch { return true; } };
export function setMotion(on) {
  try { if (on) localStorage.removeItem(MOTION_KEY); else localStorage.setItem(MOTION_KEY, 'off'); } catch { /* this session only */ }
  if (on) delete document.documentElement.dataset.motion; else document.documentElement.dataset.motion = 'off';
  syncControls();
}

/** Text size in percent, 100 to 130; 100 is the default and clears the choice. */
export function getTextSize() {
  try { const n = +localStorage.getItem(SIZE_KEY); return TEXT_SIZES.includes(n) ? n : 100; } catch { return 100; }
}
export function setTextSize(n) {
  const v = TEXT_SIZES.includes(n) ? n : 100;
  const root = document.documentElement;
  try { if (v === 100) localStorage.removeItem(SIZE_KEY); else localStorage.setItem(SIZE_KEY, String(v)); } catch { /* this session only */ }
  if (v === 100) { delete root.dataset.textsize; root.style.removeProperty('--ts'); } else { root.dataset.textsize = '1'; root.style.setProperty('--ts', String(v)); }
  syncControls();
}

export function setLook(v) {
  const look = v === 'new' ? 'new' : 'classic';
  try { if (look === 'new') localStorage.setItem(KEY, 'new'); else localStorage.removeItem(KEY); } catch { /* blocked: this session only */ }
  if (look === 'new') document.documentElement.dataset.look = 'new'; else delete document.documentElement.dataset.look;
  syncControls();
  syncTheme();
}

function syncControls() {
  const mode = getLook();
  document.querySelectorAll('[data-look-set]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lookSet === mode)));
  document.querySelectorAll('[data-solid-toggle]').forEach((b) => b.setAttribute('aria-checked', String(getSolid())));
  document.querySelectorAll('[data-motion-toggle]').forEach((b) => b.setAttribute('aria-checked', String(getMotion())));
  document.querySelectorAll('[data-size-set]').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.sizeSet === getTextSize())));
  const acc = getAccent();
  document.querySelectorAll('[data-accent-set]').forEach((b) => b.setAttribute('aria-checked', String(acc ? b.dataset.accentSet.toUpperCase() === acc.hex : b.dataset.accentSet.toUpperCase() === DEFAULT_ACCENT)));
}

export function initLook() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-look-set]');
    if (b) setLook(b.dataset.lookSet);
    const s = e.target.closest('[data-solid-toggle]');
    if (s) setSolid(!getSolid());
    const m = e.target.closest('[data-motion-toggle]');
    if (m) setMotion(!getMotion());
    const z = e.target.closest('[data-size-set]');
    if (z) setTextSize(+z.dataset.sizeSet);
    const c = e.target.closest('[data-accent-set]');
    if (c) setAccent(c.dataset.accentSet);
  });
  document.addEventListener('keydown', (e) => {
    const b = e.target.closest && e.target.closest('[data-look-set]');
    if (!b || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const all = [...b.parentElement.querySelectorAll('[data-look-set]')];
    const i = (all.indexOf(b) + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length;
    e.preventDefault();
    setLook(all[i].dataset.lookSet);
    all[i].focus();
  });
  if (getLook() === 'new') document.documentElement.dataset.look = 'new';
  if (getSolid()) document.documentElement.dataset.solid = '1';
  // the accent, motion and text size are applied before first paint by index.html; this keeps them if that script was skipped
  const a = getAccent();
  if (a && !document.documentElement.dataset.accent) setAccent(a.hex);
  if (!getMotion()) document.documentElement.dataset.motion = 'off';
  if (getTextSize() !== 100 && !document.documentElement.dataset.textsize) setTextSize(getTextSize());
  syncControls();
}
