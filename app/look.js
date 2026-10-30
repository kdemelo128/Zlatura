/* look.js -- Classic or the New look. The choice is kept on this device (like the theme) and applied
 * by a tiny script in index.html before the page first paints; Classic is the default and the
 * New look is only a [data-look="new"] attribute that styles.css reads. */
import { sync as syncTheme } from './theme.js';

const KEY = 'zlatura.look';

export function getLook() {
  try { return localStorage.getItem(KEY) === 'new' ? 'new' : 'classic'; } catch { return 'classic'; }
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
}

export function initLook() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-look-set]');
    if (b) setLook(b.dataset.lookSet);
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
  syncControls();
}
