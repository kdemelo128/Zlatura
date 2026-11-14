/* maplinksui.js -- the "Open in…" button and its menu: one 44 px icon button that opens a small sheet of links (maplinks.js
 * builds them). Each is a real link, so the keyboard, long-press and "copy link" work; it opens in a new tab with
 * rel="noopener noreferrer", so the other site learns nothing about this page. Nothing is sent until a link is opened. */

import { el, icon, toast, openSheet, closeSheet, backdropCloses } from './kit.js';
import { openInLinks } from './maplinks.js';

/** Open the menu for `parts` (see openInLinks). Returns false when there is nothing to open. */
export function openInMenu(parts, { returnTo = null } = {}) {
  const links = openInLinks(parts);
  if (!links.length) return false;
  const dlg = el('dialog', 'sheet action-sheet openin-sheet');
  dlg.setAttribute('aria-label', 'Open in');
  const box = el('div', 'sheet-card');
  box.appendChild(el('div', 'action-title', 'Open in…'));
  const list = el('div', 'action-list');
  list.setAttribute('role', 'list');
  for (const l of links) {
    const a = el('a', 'action-item openin-link');
    a.setAttribute('role', 'listitem');
    a.href = l.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.dataset.link = l.id;
    const ic = l.id.startsWith('search') ? 'search' : 'pin';
    a.insertAdjacentHTML('beforeend', icon(ic, 20));
    a.appendChild(el('span', 'action-text', l.label));
    a.addEventListener('click', () => setTimeout(() => close(), 0));
    list.appendChild(a);
  }
  box.appendChild(list);
  const cancel = el('button', 'action-cancel', 'Cancel');
  cancel.type = 'button';
  dlg.append(box, cancel);
  document.body.appendChild(dlg);
  const close = () => { closeSheet(dlg); dlg.remove(); if (returnTo && returnTo.isConnected) returnTo.focus(); };
  cancel.addEventListener('click', close);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('close', () => { if (dlg.isConnected) { dlg.remove(); if (returnTo && returnTo.isConnected) returnTo.focus(); } }, { once: true });
  backdropCloses(dlg);
  openSheet(dlg);
  return true;
}

/**
 * The button. `parts` is an object, or a function called when it is pressed (so the menu follows what is typed now).
 * It stays on screen while the address is blank (the pressed button says what to enter), so the layout does not jump.
 */
export function openInButton(parts, { label = 'Open in…', cls = 'btn btn-sm btn-icon openin-btn' } = {}) {
  const get = () => (typeof parts === 'function' ? parts() : parts);
  const b = /** @type {HTMLButtonElement} */ (el('button', cls));
  b.type = 'button';
  b.insertAdjacentHTML('beforeend', icon('pin', 18));
  b.setAttribute('aria-label', `${label} maps and search`);
  b.setAttribute('aria-haspopup', 'dialog');
  b.title = label;
  b.addEventListener('click', () => { if (!openInMenu(get(), { returnTo: b })) toast('Enter an address or a name first.'); });
  return b;
}

/** The Connect page's "Maps and search" row: type an address, a name or an owner, then open the menu. `api` is the app's sheet host. */
export function openMapsSheet(api) {
  const body = api.sheetOpen({ eyebrow: 'Ready', title: 'Maps and search', sub: 'Links only: nothing is sent until you open one, and no key is used.' });
  const form = el('div', 'form-grid');
  const inputs = {};
  for (const [id, label] of [['address', 'Address'], ['name', 'Property or company name'], ['owner', 'Owner name']]) {
    const f = el('div', 'field');
    const l = el('label', null, label);
    const i = el('input', 'input');
    i.type = 'text'; i.id = `maps-${id}`; i.autocomplete = 'off'; i.spellcheck = false;
    l.htmlFor = i.id;
    f.append(l, i);
    form.appendChild(f);
    inputs[id] = i;
  }
  const go = el('button', 'btn btn-primary', 'Open in…');
  go.type = 'button';
  go.id = 'maps-go';
  go.addEventListener('click', () => { if (!openInMenu({ address: inputs.address.value, name: inputs.name.value, owner: inputs.owner.value }, { returnTo: go })) toast('Enter an address or a name first.'); });
  body.append(form, go);
}
