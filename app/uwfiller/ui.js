/* uwfiller/ui.js -- the "Firm template pack (advanced)" card on the Underwrite tab, kept from embed P1: the broker's own
 * full package, with their firm's template, for the one case the built-in tool (tool.js) does not cover. The filler is the broker's own package (a zip
 * or the public/tool folder from their computer, loaded once, kept in Cache Storage by pkg.js and served by sw.js at
 * uw-filler/). It runs untouched in an iframe made when the broker opens it; this card only loads it, opens it, opens it
 * full screen and erases it. Built with el() and textContent only. */

import { el, toast, actionSheet, getFflate } from '../kit.js';
import { PRODUCT } from '../brand.js';
import { BUCKET, MAX_ZIP, filesFromZip, filesFromFolder, loadPackage, packageInfo, erasePackage } from './pkg.js';

const FRAME_SRC = () => new URL('uw-filler/index.html', document.baseURI).href;
const base = () => document.baseURI;
const btn = (cls, text, fn, label) => { const b = el('button', `btn ${cls}`.trim(), text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); if (fn) b.addEventListener('click', fn); return b; };
const say = (t) => { const s = document.getElementById('uwf-status'); if (s) s.textContent = t; };
const mb = (n) => (n >= 1e5 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

let working = false;
let opened = false;   // the frame is on screen

/** The card, empty; fill() draws it. */
export function fillerCard() {
  const c = el('details', 'card uwf uwf-adv');   // collapsed: the built-in tool above is the normal way in
  c.id = 'uw-filler';
  opened = false;
  fill(c);
  return c;
}

async function fill(c = document.getElementById('uw-filler')) {
  if (!c) return;
  let info = null;
  try { info = await packageInfo({ base: base() }); } catch { /* no Cache Storage here: treated as not loaded */ }
  c.textContent = '';
  const sum = el('summary', 'uwf-sum', `Advanced: load my firm's template pack`);
  sum.id = 'uwf-title';
  c.appendChild(sum);
  const body = el('div', 'uwf-body');
  if (!info) {
    body.appendChild(el('p', 'hint-sm', `Load your firm's template pack: your own full underwriting package, with your firm's template, from this computer. It is kept on this device only: it is not part of a backup, and ${PRODUCT} sends nothing anywhere for it. Only a package version the owner has approved will load.`));
    const acts = el('div', 'uwf-acts');
    const zip = el('input'); zip.type = 'file'; zip.accept = '.zip,application/zip'; zip.hidden = true; zip.id = 'uwf-zip'; zip.setAttribute('aria-label', 'Choose the filler package zip');
    zip.addEventListener('change', () => { const f = zip.files[0]; zip.value = ''; if (f) loadZip(f); });
    const dir = el('input'); dir.type = 'file'; dir.hidden = true; dir.id = 'uwf-dir'; dir.setAttribute('aria-label', 'Choose the filler package folder');
    dir.setAttribute('webkitdirectory', ''); dir.multiple = true;
    dir.addEventListener('change', () => { const fs = [...dir.files]; dir.value = ''; if (fs.length) loadFolder(fs); });
    const bz = btn('btn-primary', 'Load package…', () => zip.click());
    bz.id = 'uwf-load';
    const bd = btn('', 'Load folder…', () => dir.click());
    bd.id = 'uwf-load-dir';
    acts.append(bz, bd, zip, dir);
    body.appendChild(acts);
  } else {
    body.appendChild(el('p', 'hint-sm', `Loaded on this device: ${info.label}, ${info.files} files, ${mb(info.bytes)}. Fingerprint ${info.hash.slice(0, 12)}. It is not part of a backup.`));
    const acts = el('div', 'uwf-acts');
    const open = btn('btn-primary', opened ? 'Close filler' : 'Open filler', () => toggle(c));
    open.id = 'uwf-open';
    const full = btn('', 'Open full screen', () => { window.open(FRAME_SRC(), '_blank', 'noopener'); });
    full.id = 'uwf-full';
    const erase = btn('btn-danger', 'Erase package', () => erase_(c));
    erase.id = 'uwf-erase';
    acts.append(open, full, erase);
    body.appendChild(acts);
    if (opened) body.appendChild(frame());
  }
  const status = el('p', 'hint-sm uwf-status');
  status.id = 'uwf-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  body.appendChild(status);
  c.appendChild(body);
}

/** The iframe: made only when the broker opens the filler, so the tab costs nothing until then. */
function frame() {
  const f = el('iframe', 'uwf-frame');
  f.id = 'uwf-frame';
  f.title = 'Underwriting filler';
  // scripts and its own storage, as it needs; never top navigation (a page inside it cannot take over this one)
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads');
  f.setAttribute('allow', 'clipboard-write');
  f.setAttribute('referrerpolicy', 'no-referrer');
  f.src = FRAME_SRC();
  return f;
}

async function toggle(c) {
  if (!opened) {
    // the package is served by the service worker, which only answers pages it controls
    if (!('serviceWorker' in navigator)) { say('This browser or page cannot run the service worker the filler is served by.'); return; }
    if (!navigator.serviceWorker.controller) {
      try { await navigator.serviceWorker.ready; } catch { /* below */ }
      if (!navigator.serviceWorker.controller) { say(`Reload ${PRODUCT} once, then open the filler: the offline copy has not taken over this page yet.`); return; }
    }
  }
  opened = !opened;
  await fill(c);
  const f = document.getElementById(opened ? 'uwf-frame' : 'uwf-open');
  if (f && opened) f.scrollIntoView({ block: 'nearest' });
}

async function loadZip(file) {
  if (working) return;
  if (file.size > MAX_ZIP) { say(`That file is ${mb(file.size)}; the most is ${mb(MAX_ZIP)}. It was not opened.`); return; }
  await run(async () => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error('That is not a zip file.');
    return filesFromZip(bytes, await getFflate());
  });
}
async function loadFolder(list) { if (!working) await run(() => filesFromFolder(list)); }

async function run(read) {
  working = true;
  say('Reading the package…');
  try {
    const files = await read();
    say('Checking and keeping the package…');
    const info = await loadPackage(files, { base: base() });
    try { await navigator.storage?.persist?.(); } catch { /* best effort: iOS may still evict a site that is not installed */ }
    opened = false;
    working = false;
    await fill();
    say(`Loaded ${info.files} files.`);
    toast('Filler package loaded on this device.');
  } catch (e) {
    working = false;
    say((e && e.message) || 'The package could not be loaded.');
  }
}

async function erase_(c) {
  const pick = await actionSheet('Erase the filler package from this device?', [
    { label: 'Erase package', sub: 'The package is deleted from this device. Your deals and backups are not touched. Load it again to use the filler.', value: 'erase', danger: true },
  ]);
  if (pick !== 'erase') return;
  opened = false;
  try { await erasePackage(); } catch (e) { say(`The package could not be erased: ${(e && e.message) || e}`); return; }
  await fill(c);
  say('The package was erased from this device.');
}

export { BUCKET };
