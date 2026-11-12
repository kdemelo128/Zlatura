/* uwfiller/tool.js -- the "Underwriting" card on the Underwrite tab: the owner's underwriting tool, built in
 * (app/uwtool/, made by tools/uwtool-import.mjs; sw.js serves it with a strict content policy and keeps it after the
 * first open). No package to load. It runs in a same-origin iframe made when the broker opens it, so the tab costs
 * nothing until then, and its own styles and scripts never touch this page. Built with el() and textContent only. */

import { el } from '../kit.js';
import { PRODUCT } from '../brand.js';

export const TOOL_SRC = () => new URL('app/uwtool/index.html', document.baseURI).href;

/** The tool itself, inline: the Underwrite tab shows it as soon as the tab opens (no package, no open step). */
export function toolCard() {
  const c = el('section', 'uwt');
  c.id = 'uw-tool';
  c.setAttribute('aria-label', `${PRODUCT} underwriting`);
  c.appendChild(frame());
  return c;
}

/** The iframe, with no address until it is on screen. */
function frame() {
  const f = el('iframe', 'uwt-frame');
  f.id = 'uwt-frame';
  f.title = `${PRODUCT} underwriting`;
  // scripts and its own storage, as it needs; never top navigation (a page inside it cannot take over this one)
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads');
  f.setAttribute('allow', 'clipboard-write');
  f.setAttribute('referrerpolicy', 'no-referrer');
  // the page is told when the tool has loaded, so Escape inside it can leave the full screen (underwrite.js)
  f.addEventListener('load', () => { try { if (f.contentWindow?.document) document.dispatchEvent(new CustomEvent('uwtoolload', { detail: { document: f.contentWindow.document } })); } catch { /* not reachable */ } });
  // loaded only when the tab is on screen (the view is built at start-up, hidden): the 3 MB is not fetched until it is wanted
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); f.src = TOOL_SRC(); } });
  io.observe(f);
  return f;
}
