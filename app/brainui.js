/* brainui.js -- Settings > Documents and AI > the brain on this device": pick a size, see whether this device can
 * run it, turn it on (a download with progress and Cancel), and remove it. All of the work is in brain.js; this draws
 * it. Nothing is downloaded until the broker taps Turn on. */

import { el } from './kit.js';
import { PRODUCT } from './brand.js';
import { brain, MODELS, modelById } from './brain.js';

/**
 * The card. `section` is settings.js's card builder.
 * @param {(title: string, id?: string, sub?: string) => HTMLElement} section
 */
export function brainCard(section) {
  const card = section(`${PRODUCT}’s brain on this device`, 'settings-brain', brain.state.phase === 'ready' ? 'on' : 'off');
  const count = /** @type {HTMLElement} */ (card.querySelector('.count'));
  const body = el('div', 'brain-body');
  body.appendChild(el('p', 'hint', `A small open AI model that downloads once to this device and runs on its graphics chip. Nothing you type or read leaves the device, and there is no account and no cost per question. It is off until you turn it on. ${PRODUCT}’s figures still come from the app’s own calculations; the brain explains and drafts in words.`));

  const fs = el('fieldset', 'brain-sizes');
  fs.appendChild(el('legend', null, 'Size'));
  /** @type {Map<string, HTMLInputElement>} */
  const radios = new Map();
  for (const m of MODELS) {
    const lab = el('label', 'brain-size');
    const r = el('input');
    r.type = 'radio'; r.name = 'brain-size'; r.value = m.id; r.checked = m.id === brain.state.model;
    r.addEventListener('change', () => { if (r.checked) brain.choose(m.id); });
    const t = el('span', 'brain-size-text');
    t.append(el('b', null, m.label), el('span', null, `${m.size}, needs about ${(m.minMB / 1024).toFixed(1)} GB of graphics memory, ${m.licence}. ${m.note}`));
    lab.append(r, t);
    fs.appendChild(lab);
    radios.set(m.id, r);
  }

  const status = el('p', 'brain-status');
  status.setAttribute('role', 'status');
  const bar = el('div', 'progress brain-progress');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Download progress');
  bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-valuenow', '0');
  const fill = el('i');
  bar.appendChild(fill);

  const mk = (label, fn, cls = '') => { const b = el('button', `btn btn-sm ${cls}`.trim(), label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const on = mk('Turn on', () => { brain.turnOn(); });
  on.id = 'brain-on';
  const cancel = mk('Cancel', () => brain.cancel(), 'btn-gray');
  cancel.id = 'brain-cancel';
  const remove = mk('Remove the brain', () => { brain.remove(); }, 'btn-gray');
  remove.id = 'brain-remove';
  const acts = el('div', 'set-ctl');
  acts.append(on, cancel, remove);

  /** Which sizes can run here, said once the device has been asked (not on every redraw). */
  let support = { ok: true, why: '', model: '' };
  const draw = (/** @type {import('./brain.js').BrainState} */ s) => {
    const m = modelById(s.model);
    for (const [id, r] of radios) { r.checked = id === s.model; r.disabled = s.phase === 'downloading' || s.phase === 'checking'; }
    const busy = s.phase === 'downloading' || s.phase === 'checking';
    on.hidden = busy || s.phase === 'ready';
    on.textContent = s.phase === 'unsupported' ? 'Try again' : `Turn on (${m.label})`;
    cancel.hidden = !busy;
    remove.hidden = s.phase !== 'ready';
    bar.hidden = s.phase !== 'downloading';
    const pct = Math.round(s.progress * 100);
    fill.style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(pct));
    count.textContent = s.phase === 'ready' ? 'on' : 'off';
    status.textContent =
      s.phase === 'checking' ? 'Checking this device…'
      : s.phase === 'downloading' ? `Downloading the ${m.label} size: ${pct}%. It keeps going if you leave this screen; Cancel stops it.`
      : s.phase === 'ready' ? `Ready. The ${m.label} size is on this device, and ${PRODUCT} can use it. Nothing you type leaves the device.`
      : s.phase === 'unsupported' ? s.why
      : s.phase === 'removed' ? `Removed. The ${m.label} size’s files are deleted from this device.`
      : s.why || (support.model === s.model && support.why) || 'Off. Nothing is downloaded until you turn it on.';
  };
  const made = Date.now();
  const unsub = brain.subscribe((s) => {
    // Settings draws its cards before it attaches them (and draws again when data changes): a card that is gone, or never
    // attached, stops listening after a few seconds
    if (!body.isConnected && Date.now() - made > 5000) { unsub(); return; }
    draw(s);
    if (s.phase === 'off' && support.model !== s.model) askDevice();
  });
  draw(brain.state);
  // the device check for the chosen size, shown beside the sizes; it only asks the browser, it downloads nothing
  const askDevice = () => {
    const model = brain.state.model;
    brain.check().then((r) => { support = { ...r, model }; if (brain.state.model === model && (brain.state.phase === 'off' || brain.state.phase === 'removed')) draw(brain.state); }).catch(() => {});
  };
  askDevice();

  body.append(fs, status, bar, acts);
  card.appendChild(body);
  return card;
}
