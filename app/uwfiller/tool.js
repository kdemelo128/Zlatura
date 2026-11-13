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
  const f = frame();
  const skel = el('div', 'uwt-skel');   // a calm neutral stand-in until the tool has painted its final look
  skel.setAttribute('aria-hidden', 'true');
  for (const w of ['38%', '72%', '58%', '90%', '90%']) { const b = el('i'); b.style.width = w; skel.appendChild(b); }
  c.setAttribute('aria-busy', 'true');
  f.classList.add('uwt-wait');
  c.append(f, skel);
  // every load of the frame (the first, and any reload: a fill from the open deal, the tool's own Clear all) is hidden
  // behind the skeleton until the tool has painted its final look; the old guide bird is never on screen
  f.addEventListener('load', () => { if (!f.src) return; whenPainted(f, () => {   // (an empty frame's own about:blank load is not the tool)
    const sk = c.querySelector('.uwt-skel');
    f.classList.remove('uwt-wait');   // fades in (styles.css)
    try { f.contentWindow.dispatchEvent(new f.contentWindow.Event('uw-monal-pose')); } catch { /* the tool wakes its scene: its first frames waited for this */ }
    if (sk) { sk.classList.add('uwt-skel-out'); setTimeout(() => sk.remove(), 260); }
    c.removeAttribute('aria-busy');
  }); });
  armFallback(c, f);
  return c;
}

/** A tool that never reports (blocked, offline without its files) is shown anyway after a while, so the tab is never blank. */
function armFallback(c, f) {
  setTimeout(() => { if (f.classList.contains('uwt-wait')) { f.classList.remove('uwt-wait'); c.querySelector('.uwt-skel')?.remove(); c.removeAttribute('aria-busy'); } }, 12000);
}

/** Put the skeleton back over the frame: called the moment the tool is about to load again (a reload), so the early paint of
 * the new page is never on screen. The frame's next load removes it again. */
export function coverTool() {
  const f = document.getElementById('uwt-frame');
  const c = document.getElementById('uw-tool');
  if (!f || !c || f.classList.contains('uwt-wait')) return;
  f.classList.add('uwt-wait');
  c.setAttribute('aria-busy', 'true');
  if (!c.querySelector('.uwt-skel')) {
    const skel = el('div', 'uwt-skel');
    skel.setAttribute('aria-hidden', 'true');
    for (const w of ['38%', '72%', '58%', '90%', '90%']) { const b = el('i'); b.style.width = w; skel.appendChild(b); }
    c.appendChild(skel);
  }
  armFallback(c, f);
}

/** The tool paints in stages: its first paint still has the old guide bird ("One step at a time"), which its own last
 * scripts then rewrite. Wait until that is done (and the page has finished loading), then two frames, then call `done`.
 * No answer in 6 s (or a frame we cannot read): call it anyway. */
function whenPainted(f, done) {
  const t0 = performance.now();
  const tick = () => {
    let ready = false;
    try {
      const d = f.contentDocument;
      const g = d && d.querySelector('.juniper-guide strong');
      ready = !!d && d.readyState === 'complete' && (!g || g.textContent !== 'One step at a time.');
    } catch { ready = true; }
    if (ready || performance.now() - t0 > 6000) requestAnimationFrame(() => requestAnimationFrame(done));
    else setTimeout(() => tick(), 50);
  };
  tick();
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
  // the view is built at start-up, hidden. The tool loads when the tab is opened, or sooner: once the app has settled and
  // the browser is idle (see preloadWhenIdle), so that opening it is a reveal, not a load
  const load = () => { if (!f.src) f.src = TOOL_SRC(); };
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); } });
  io.observe(f);
  preloadWhenIdle(load);
  return f;
}

const PRELOAD_AFTER_MS = 3000;   // after the page has loaded: the first screen and its first edits are not competing with the tool

/** Load the tool (hidden, behind its skeleton) once the page has loaded and the browser is idle. Not on a connection that asks
 * to save data. The service worker keeps the files after the first fetch, so this costs the network once per release. */
function preloadWhenIdle(load) {
  let c = null;
  try { c = /** @type {any} */ (navigator).connection; } catch { /* fine */ }
  if (c && c.saveData) return;
  const idle = (fn) => { if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 8000 }); else setTimeout(fn, 1000); };
  const go = () => setTimeout(() => idle(load), PRELOAD_AFTER_MS);
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
}
