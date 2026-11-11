/* uwfiller/tool.js -- the "Underwriting" card on the Underwrite tab: the owner's underwriting tool, built in
 * (app/uwtool/, made by tools/uwtool-import.mjs; sw.js serves it with a strict content policy and keeps it after the
 * first open). No package to load. It runs in a same-origin iframe made when the broker opens it, so the tab costs
 * nothing until then, and its own styles and scripts never touch this page. Built with el() and textContent only. */

import { el } from '../kit.js';
import { PRODUCT } from '../brand.js';

export const TOOL_SRC = () => new URL('app/uwtool/index.html', document.baseURI).href;
const btn = (cls, text, fn) => { const b = el('button', `btn ${cls}`.trim(), text); b.type = 'button'; b.addEventListener('click', fn); return b; };

let opened = false;   // the frame is on screen

/** The card; fill() draws it. */
export function toolCard() {
  const c = el('section', 'card uwf');
  c.id = 'uw-tool';
  c.setAttribute('aria-labelledby', 'uwt-title');
  opened = false;
  fill(c);
  return c;
}

function fill(c) {
  c.textContent = '';
  const head = el('div', 'card-head');
  const h2 = el('h2', null, 'Underwriting');
  h2.id = 'uwt-title';
  h2.tabIndex = -1;
  head.appendChild(h2);
  c.appendChild(head);
  const body = el('div', 'uwf-body');
  body.appendChild(el('p', 'hint-sm', `Read a rent roll, statements and leases into one reviewed model, explore the deal and export a workbook. It runs on this device and sends nothing anywhere. The first time you open it, about 3 MB is kept on this device so it works offline after that.`));
  const acts = el('div', 'uwf-acts');
  const open = btn('btn-primary', opened ? 'Close underwriting' : 'Open underwriting', () => { opened = !opened; fill(c); if (opened) { const f = document.getElementById('uwt-frame'); if (f) f.scrollIntoView({ block: 'nearest' }); } });
  open.id = 'uwt-open';
  open.setAttribute('aria-expanded', String(opened));
  const full = btn('', 'Open full screen', () => { window.open(TOOL_SRC(), '_blank', 'noopener'); });
  full.id = 'uwt-full';
  acts.append(open, full);
  body.appendChild(acts);
  if (opened) body.appendChild(frame());
  c.appendChild(body);
}

/** The iframe, made only when the broker opens the tool. */
function frame() {
  const f = el('iframe', 'uwf-frame');
  f.id = 'uwt-frame';
  f.title = `${PRODUCT} underwriting`;
  // scripts and its own storage, as it needs; never top navigation (a page inside it cannot take over this one)
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads');
  f.setAttribute('allow', 'clipboard-write');
  f.setAttribute('referrerpolicy', 'no-referrer');
  f.src = TOOL_SRC();
  return f;
}
