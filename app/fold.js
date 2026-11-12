/* fold.js -- collapsible sections that remember their state on this device. A section is a button
 * (aria-expanded, aria-controls) over a body; a closed one shows a one-line summary. The state is a
 * choice the person made, kept per scope (the Home screen, or one deal) in localStorage. */

import { el } from './kit.js';

const KEY = (scope) => `zl.fold.${scope}`;

/** The remembered choice for one section: true (open), false (closed) or undefined (never chosen). */
export function foldGet(scope, id) {
  try { const v = JSON.parse(localStorage.getItem(KEY(scope)) || '{}')[id]; return typeof v === 'boolean' ? v : undefined; } catch { return undefined; }
}
export function foldSet(scope, id, open) {
  try { const o = JSON.parse(localStorage.getItem(KEY(scope)) || '{}'); o[id] = open; localStorage.setItem(KEY(scope), JSON.stringify(o)); } catch { /* private mode: it works, it is just not remembered */ }
}

/**
 * Put a fold control on a title. `body` is what opens and closes; `summary` is the one-line text
 * shown while it is closed. Returns { btn, sum, set(open, remember), isOpen() }.
 */
export function foldControl({ scope, id, title, body, open = false, summary = '', labelFor = null }) {
  const stored = foldGet(scope, id);
  const btn = el('button', 'fold-btn');
  btn.type = 'button';
  btn.appendChild(el('span', 'fold-title', title));
  btn.appendChild(el('span', 'fold-chev'));
  if (labelFor) btn.setAttribute('aria-label', labelFor);
  if (!body.id) body.id = `fold-${scope}-${id}`.replace(/[^\w-]/g, '-');
  btn.setAttribute('aria-controls', body.id);
  if (stored !== undefined) btn.dataset.user = '1';
  const sum = el('span', 'fold-sum', summary);
  const set = (o, remember = true) => {
    btn.setAttribute('aria-expanded', String(o));
    body.hidden = !o;
    sum.hidden = o;
    btn.closest('.fold')?.classList.toggle('folded', !o);
    if (remember) { foldSet(scope, id, o); btn.dataset.user = '1'; }
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  set(stored === undefined ? open : stored, false);
  return { btn, sum, set, isOpen: () => btn.getAttribute('aria-expanded') === 'true' };
}
