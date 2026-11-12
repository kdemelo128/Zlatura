/* brand.js -- the product's name, and the move from the old one.
 *
 * Monal was called Zlatura until 4.7.128 and Comp Loader before 4.0. Only the DISPLAY name changed with Monal:
 * every storage id below (KEY_PREFIX, the database, backup ids, cache names, the manifest id) is still
 * `zlatura`, so saved data, old backups and installed copies need no migration (a later release moves them).
 * Zlatura was called Comp Loader until 4.0. Everything it kept on a device
 * under the old name still works:
 *   - localStorage keys `comp-loader.*` are copied to `zlatura.*` once, the
 *     first time 4.0 starts (below, before any other module reads a key);
 *   - the IndexedDB database `comp-loader` is copied to `zlatura` (store.js);
 *   - backup, project and template files with the old format ids are read
 *     for good, so a file made years ago still opens.
 * The old keys and database are left untouched until the move is safe to
 * finish (store.js `finishRename`): after a backup made since the move, or 30
 * days. Until then going back to the old copy loses nothing.
 *
 * This module is imported first by ui.js. It has no imports of its own, so it
 * runs before anything else reads localStorage. */

export const PRODUCT = 'Monal';
export const TAGLINE = 'Every source. Every assumption. Every number.';
export const ABOUT_NAME = 'Monal is named for the Himalayan monal, a mountain pheasant with bright, many-coloured plumage.';
/** Shown once, in About, so a person who knew the old name can tell it is the same product. */
export const FORMERLY = 'Formerly called Zlatura.';

/** The line under the name in the sidebar. */
export const DESCRIPTOR = 'Brokerage workspace';
/**
 * The mark, drawn once. installBrand() puts it in the page as one <symbol> and every place that shows
 * it (the sidebar, the top bar) is a <use> of that symbol, so a new mark is a change to this record.
 * Original feathered bird artwork, inspired by the owner’s underwriting companion. The same name and mark are what
 * the manifest, the <title> and the home-screen name say (tests/brand.test.js checks they agree).
 */
export const MARK = { viewBox: '0 0 128 128', stroke: 0, body: `<defs>
  <linearGradient id="monal-jade" x2="1" y2="1"><stop stop-color="#5ee4b0"/><stop offset=".5" stop-color="#138b70"/><stop offset="1" stop-color="#07565f"/></linearGradient>
  <linearGradient id="monal-copper" x2="1" y2="1"><stop stop-color="#ffe09a"/><stop offset=".45" stop-color="#ed9847"/><stop offset="1" stop-color="#b64f40"/></linearGradient>
  <linearGradient id="monal-wing" x2="1" y2="1"><stop stop-color="#47cad1"/><stop offset=".4" stop-color="#3974ce"/><stop offset="1" stop-color="#643da1"/></linearGradient>
</defs>
<g stroke="#172d40" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M47 76C31 66 17 71 7 85C20 97 40 100 57 93Z" fill="url(#monal-copper)"/>
  <path d="M13 85Q30 83 45 91M21 78Q36 77 50 86M23 92L43 94" fill="none" stroke="#ffe0a2"/>
  <path d="M52 99L50 115M78 97L81 115M43 117L56 117M75 117L89 117" fill="none" stroke="#b3b9bb" stroke-width="2.8"/>
  <path d="M29 79C29 61 44 52 63 58C74 60 85 69 88 81C90 96 77 106 57 104C43 103 32 94 29 79Z" fill="#202f47"/>
  <path d="M32 70Q38 63 45 64L45 83L34 86Z" fill="#f3eddb"/>
  <path d="M64 79C66 62 61 53 69 39C75 29 89 31 95 42C101 56 92 76 85 87Z" fill="url(#monal-copper)"/>
  <path d="M76 48Q82 53 94 51M73 55Q81 62 92 59M73 64Q80 69 89 68" fill="none" stroke="#ffe1a0"/>
  <path d="M39 71C46 59 66 60 79 74C78 90 63 99 47 94C39 88 35 80 39 71Z" fill="url(#monal-wing)"/>
  <path d="M43 74Q57 85 74 77M43 81Q55 91 69 85M48 67Q59 76 75 73M50 90Q58 94 63 90" fill="none" stroke="#9de0e2"/>
  <path d="M73 30Q65 20 64 11M81 27Q78 14 80 6M88 29Q90 18 96 12" fill="none" stroke="#69caaa" stroke-width="2"/>
  <ellipse cx="63" cy="10" rx="3" ry="4" fill="#58d6a2"/>
  <ellipse cx="80" cy="6" rx="3" ry="4" fill="#58d6a2"/>
  <ellipse cx="97" cy="11" rx="3" ry="4" fill="#58d6a2"/>
  <path d="M66 39C65 28 75 23 85 25C96 26 102 34 99 44C96 52 85 54 76 50C70 48 67 44 66 39Z" fill="url(#monal-jade)"/>
  <path d="M98 36L115 43L98 47Z" fill="#e7d8b4"/>
  <path d="M99 42L109 43" fill="none" stroke="#807a6d"/>
  <path d="M71 33Q78 27 86 30" fill="none" stroke="#a9efca"/>
  <ellipse cx="89" cy="37" rx="6" ry="6.5" fill="#58c7d5" stroke="none"/>
  <circle cx="90" cy="37" r="3.6" fill="#111f2c" stroke="none"/>
  <circle cx="91" cy="35.5" r="1.2" fill="#fff" stroke="none"/>
</g>` };

/** Draw the mark once and fill every [data-brand-mark], [data-brand-name] and [data-brand-sub] in the page. */
export function installBrand(doc = document) {
  if (!doc.getElementById('brand-sprite')) {
    const sp = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sp.id = 'brand-sprite';
    sp.setAttribute('aria-hidden', 'true');
    sp.setAttribute('width', '0');
    sp.setAttribute('height', '0');
    sp.style.position = 'absolute';
    sp.innerHTML = `<symbol id="brand-mark" viewBox="${MARK.viewBox}" fill="none" stroke="currentColor" stroke-width="${MARK.stroke}" stroke-linecap="round" stroke-linejoin="round">${MARK.body}</symbol>`;
    doc.body.prepend(sp);
  }
  for (const m of doc.querySelectorAll('[data-brand-mark]')) {
    m.innerHTML = '<svg width="17" height="17" aria-hidden="true"><use href="#brand-mark"/></svg>';
    m.firstElementChild?.setAttribute('width', '28');
    m.firstElementChild?.setAttribute('height', '28');
  }
  for (const n of doc.querySelectorAll('[data-brand-name]')) n.textContent = PRODUCT;
  for (const n of doc.querySelectorAll('[data-brand-sub]')) n.textContent = DESCRIPTOR;
}

export const OLD_PRODUCT = 'Comp Loader';
export const KEY_PREFIX = 'zlatura.';
export const OLD_KEY_PREFIX = 'comp-loader.';
/** Set once the localStorage keys have been copied; the copy never runs again. */
export const RENAMED_FLAG = 'zlatura.renamed';

/** File format ids: what is written now, and every id still read. */
export const FORMATS = {
  backup: { write: 'zlatura-backup', read: ['zlatura-backup', 'comp-loader-backup'] },
  project: { write: 'zlatura-project', read: ['zlatura-project', 'comp-loader-project'] },
  template: { write: 'zlatura-template', read: ['zlatura-template', 'comp-loader-template'] },
};

/** An old localStorage key under its new name (other keys unchanged). */
export const renameKey = (k) => (typeof k === 'string' && k.startsWith(OLD_KEY_PREFIX) ? KEY_PREFIX + k.slice(OLD_KEY_PREFIX.length) : k);

/**
 * Copy every `comp-loader.*` key to its `zlatura.*` name, once. A new key that
 * already exists is never overwritten. Old keys are kept (see finishRename).
 * Copying only once matters: the app deletes some keys on purpose (the
 * recovery copy of an unsaved deal, the open deal), and a later copy would
 * bring a stale one back. Returns how many keys were copied.
 */
export function migrateLocalKeys(ls) {
  if (!ls) return 0;
  try {
    if (ls.getItem(RENAMED_FLAG)) return 0;
    const old = [];
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(OLD_KEY_PREFIX)) old.push(k); }
    let n = 0;
    for (const k of old) {
      const nk = renameKey(k);
      if (ls.getItem(nk) === null) { ls.setItem(nk, ls.getItem(k)); n += 1; }
    }
    ls.setItem(RENAMED_FLAG, String(Date.now()));
    return n;
  } catch { return 0; } // storage blocked or full: the app works without it
}

/** Remove the old keys once the move is finished. */
export function removeOldLocalKeys(ls) {
  if (!ls) return 0;
  try {
    const old = [];
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(OLD_KEY_PREFIX)) old.push(k); }
    for (const k of old) ls.removeItem(k);
    return old.length;
  } catch { return 0; }
}

if (typeof localStorage !== 'undefined') {
  try { migrateLocalKeys(localStorage); } catch { /* blocked: nothing to move */ }
}
