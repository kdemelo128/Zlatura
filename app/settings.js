/* settings.js -- the Settings screen: appearance, templates, pipeline
 * stages, the AI connection, and the data kept on this device. Each row
 * opens the real control; nothing here is decorative. */

import { $, el, icon, niceDate, parseNum, parsePct } from './kit.js';
import { getTheme } from './theme.js';
import { getLook, getSolid, getMotion, getAccent, setAccent, TEXT_SIZES, getTextSize } from './look.js';
import { SWATCHES } from './accent.js';
import * as ai from './ai.js';
import { renderDataCard } from './backupui.js';
import { autoSwitch } from './inboxui.js';
import { openAiSettings } from './aiui.js';
import { brainCard } from './brainui.js';
import { openTemplates } from './dealui.js';
import { editStages } from './home.js';
import { listTemplates } from './library.js';
import { VERSION } from './exporters.js';
import { PRODUCT, TAGLINE, ABOUT_NAME, FORMERLY } from './brand.js';
import { listLabels, forgetLabel } from './t12labels.js';
import { CATEGORY } from './t12.js';
import { CONVENTIONS, conv, setConventions, conventionValues } from './engine/conventions.js';
import { kvSet } from './store.js';
import { workspaceSettings } from './workspaceui.js';

let api = null;

const section = (title, id, sub) => {
  const c = el('section', 'card');
  if (id) c.id = id;
  const h = el('div', 'card-head');
  h.appendChild(el('h2', null, title));
  if (sub) h.appendChild(el('span', 'count', sub));
  c.appendChild(h);
  return c;
};
const row = (title, desc, controls) => {
  const r = el('li', 'set-row');
  const t = el('div', 'set-text');
  t.appendChild(el('b', null, title));
  if (desc) t.appendChild(el('span', null, desc));
  const c = el('div', 'set-ctl');
  for (const x of controls) c.appendChild(x);
  r.append(t, c);
  return r;
};
const btn = (label, fn, cls = '') => { const b = el('button', `btn btn-sm ${cls}`.trim(), label); b.type = 'button'; b.addEventListener('click', fn); return b; };

/**
 * A collapsible group of Settings cards: a native <details> (keyboard and screen reader operable), closed unless `open`.
 * Which groups were open is kept across the re-draws Settings does when data changes (see renderSettings), and a group
 * can be asked open from elsewhere with a `settingsgroup` event (the backup reminder on Home opens "Data and backup").
 */
const group = (id, title, hint, cards, { open = false, solo = false } = {}) => {
  const d = el('details', `set-group${solo ? ' solo' : ''}`);
  d.id = `set-g-${id}`;
  if (open) d.open = true;
  const sm = el('summary');
  sm.append(el('span', 'set-g-title', title), el('span', 'set-g-hint', hint));
  const body = el('div', 'set-g-body');
  for (const c of cards) body.appendChild(c);
  d.append(sm, body);
  return d;
};
let wantGroup = null;
document.addEventListener('settingsgroup', (e) => {
  wantGroup = e.detail;
  const d = document.getElementById(`set-g-${wantGroup}`);
  if (d) { d.open = true; wantGroup = null; }
});

/** A number setting's text, as shown at rest: no thousands marks, so what is typed back reads the same. */
const numText = (v) => String(v);
// a number that must stay on one side of its partner (conventions.js setConventions keeps each pair in order): what to tell the person
const PAIRS = {
  'noi.agree': ['below', 'warning level', 'noi.warn', '%'], 'noi.warn': ['above', 'agree level', 'noi.agree', '%'],
  'rr.psf.low': ['below', 'note-above level', 'rr.psf.high', '$'], 'rr.psf.high': ['above', 'note-below level', 'rr.psf.low', '$'],
  'rr.psf.mfLow': ['below', 'note-above level', 'rr.psf.mfHigh', '$'], 'rr.psf.mfHigh': ['above', 'note-below level', 'rr.psf.mfLow', '$'],
};
const pairText = (c) => { const [side, name, other, u] = PAIRS[c.id]; return `Must stay ${side} the ${name} (${u === '$' ? '$' : ''}${conv(other)}${u === '%' ? '%' : ''})`; };
const rangeText = (c) => { const f = (v) => `${c.unit === '$' ? '$' : ''}${v.toLocaleString('en-US')}${c.unit === '%' ? '%' : ''}`; return `Between ${f(c.min)} and ${f(c.max)}`; };

/**
 * A number setting (T-12 thresholds, the NOI levels): a text box read only when it is left or Enter is pressed, as
 * the date field is (dateinput.js), so nothing is reformatted or redrawn while it is typed in. A value that is not
 * a number, or out of its range, puts the last good value back and says why in a live region.
 */
function numberRow(c) {
  const id = `conv-${c.id.replace(/\./g, '-')}`;
  const inp = el('input', 'input n conv-num');
  inp.type = 'text';
  inp.inputMode = 'decimal';
  inp.autocomplete = 'off';
  inp.spellcheck = false;
  inp.id = id;
  inp.setAttribute('aria-label', c.label);
  let shown = numText(conv(c.id));
  inp.value = shown;
  const msg = el('span', 'conv-msg');
  msg.id = `${id}-msg`;
  msg.setAttribute('aria-live', 'polite');
  const put = () => { shown = numText(conv(c.id)); inp.value = shown; };
  const bad = (text) => { put(); inp.setAttribute('aria-invalid', 'true'); inp.setAttribute('aria-describedby', msg.id); msg.textContent = `${text}; kept at ${shown}`; };
  const commit = async () => {
    if (inp.value === shown) { msg.textContent = ''; inp.removeAttribute('aria-invalid'); return; }
    const v = c.unit === '%' ? parsePct(inp.value, { fraction: false }) : parseNum(inp.value);
    if (v === null || v < c.min || v > c.max) { bad(rangeText(c)); return; }
    if (c.whole && !Number.isInteger(v)) { bad('Whole numbers only'); return; }
    setConventions({ [c.id]: v });
    if (conv(c.id) !== v) { bad(pairText(c)); return; }
    msg.textContent = '';
    inp.removeAttribute('aria-invalid');
    inp.removeAttribute('aria-describedby');
    put();
    await kvSet('conventions', conventionValues());
    document.dispatchEvent(new CustomEvent('conventionchange'));
  };
  inp.addEventListener('input', () => { if (inp.hasAttribute('aria-invalid')) { inp.removeAttribute('aria-invalid'); msg.textContent = ''; } });
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape' && inp.value !== shown) { e.preventDefault(); put(); }
  });
  return row(c.label, c.help, [inp, el('span', 'conv-unit', c.unit), msg]);
}

export async function renderSettings() {
  const root = $('settings-root');
  if (!root) return;
  const [aiSet, templates] = await Promise.all([ai.getSettings(), listTemplates().catch(() => [])]);
  const wasOpen = new Map(/** @type {HTMLDetailsElement[]} */ ([...root.querySelectorAll('details.set-group')]).map((d) => [d.id, d.open]));
  root.textContent = '';
  const head = el('div', 'view-head');
  head.appendChild(el('h1', null, 'Settings'));
  head.appendChild(el('p', null, 'How the app looks, your templates and calculations, AI, and your data and backups.'));
  root.appendChild(head);
  const stack = el('div', 'stack');
  const cards = {};

  // appearance
  const look = section('Appearance', 'settings-look');
  const ul = el('ul', 'set-list');
  const seg = el('div', 'seg theme-seg wide');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', 'Theme');
  const mode = getTheme();
  for (const [v, label, glyph] of [
    ['system', 'System', 'monitor'],
    ['light', 'Light', 'sun'],
    ['dark', 'Dark', 'moon'],
  ]) {
    const b = el('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.themeSet = v;
    b.setAttribute('aria-checked', String(v === mode));
    b.innerHTML = icon(glyph, 15);
    b.appendChild(el('span', null, label));
    seg.appendChild(b);
  }
  ul.appendChild(row('Theme', 'System follows your device.', [seg]));
  const lookSeg = el('div', 'seg theme-seg wide');
  lookSeg.setAttribute('role', 'radiogroup');
  lookSeg.setAttribute('aria-label', 'Look');
  for (const [v, label] of [['classic', 'Classic'], ['new', 'New look']]) {
    const b = el('button', null, label);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.lookSet = v;
    b.setAttribute('aria-checked', String(v === getLook()));
    lookSeg.appendChild(b);
  }
  ul.appendChild(row('Look', 'Classic is the look you know. The New look is calmer, with new type and colors. You can switch back at any time.', [lookSeg]));
  const solid = el('button', 'btn btn-sm', 'Solid controls');
  solid.type = 'button';
  solid.setAttribute('role', 'switch');
  solid.dataset.solidToggle = '1';
  solid.setAttribute('aria-checked', String(getSolid()));
  ul.appendChild(row('Solid controls', 'New look only: make the step bar, messages and search menu solid instead of see-through.', [solid]));
  // accent colour: swatches and a custom colour; a pick that would not read is adjusted, and the person is told
  const accRow = el('div', 'acc-picker');
  const accSeg = el('div', 'acc-swatches');
  accSeg.setAttribute('role', 'radiogroup');
  accSeg.setAttribute('aria-label', 'Accent colour');
  for (const [name, hex] of SWATCHES) {
    const b = el('button', 'acc-swatch');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', name);
    b.title = name;
    b.dataset.accentSet = hex;
    b.style.setProperty('--sw', hex);
    b.setAttribute('aria-checked', String(hex === (getAccent() ? getAccent().hex : SWATCHES[0][1])));
    accSeg.appendChild(b);
  }
  const custom = el('input');
  custom.type = 'text'; custom.id = 'accent-custom'; custom.placeholder = '#2F5D9E'; custom.maxLength = 7; custom.autocomplete = 'off'; custom.spellcheck = false;
  custom.setAttribute('aria-label', 'Custom accent colour, as #RRGGBB');
  const apply = el('button', 'btn btn-sm', 'Use this colour');
  apply.type = 'button'; apply.id = 'accent-apply';
  const say = el('p', 'hint-sm');
  say.id = 'accent-say'; say.setAttribute('role', 'status');
  const a0 = getAccent();
  if (a0 && a0.adjusted) say.textContent = `${a0.hex} was adjusted so text in it stays readable.`;
  apply.addEventListener('click', () => {
    const r = setAccent(custom.value);
    if (!r) { say.textContent = 'That is not a colour. Type it as #RRGGBB, for example #2F5D9E.'; custom.focus(); return; }
    say.textContent = r.adjusted ? `${r.hex} was adjusted to ${r.shown} so text in it stays readable.` : `Accent set to ${r.hex}.`;
  });
  custom.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply.click(); } });
  accRow.append(accSeg, custom, apply);
  ul.appendChild(row('Accent colour', 'The colour of buttons, links, the current step and the focus ring, in both looks. A colour that would be hard to read is adjusted a little. Kept on this device only.', [accRow, say]));
  const motion = el('button', 'btn btn-sm', 'Motion');
  motion.type = 'button';
  motion.setAttribute('role', 'switch');
  motion.dataset.motionToggle = '1';
  motion.setAttribute('aria-checked', String(getMotion()));
  ul.appendChild(row('Motion', 'New look only: cards lift a little and previews fade in. Turn off to keep everything still. Your device’s reduce-motion setting always wins.', [motion]));
  const sizeSeg = el('div', 'seg theme-seg wide');
  sizeSeg.setAttribute('role', 'radiogroup');
  sizeSeg.setAttribute('aria-label', 'Text size');
  for (const n of TEXT_SIZES) {
    const b = el('button', null, `${n}%`);
    b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.sizeSet = String(n);
    b.setAttribute('aria-checked', String(n === getTextSize()));
    sizeSeg.appendChild(b);
  }
  ul.appendChild(row('Text size', 'Make text larger across the app, up to 130%. Kept on this device only.', [sizeSeg]));
  look.appendChild(ul);
  cards.look = look;

  // templates and reports
  const tpl = section('Templates', 'settings-templates');
  const tl = el('ul', 'set-list');
  const live = templates.filter((t) => !t.archived).length;
  tl.appendChild(row('Template library', live ? `${live} workbook${live === 1 ? '' : 's'} mapped and ready to fill from any deal.` : 'Map your firm’s underwriting or rent roll workbook once, then fill it for any deal.', [btn('Open library', () => openTemplates())]));
  tl.appendChild(row('Comp workbook output', `Choose between the ${PRODUCT} comp workbook and your own comp template on the Comps screen.`, [btn('Go to Comps', () => api.showView('comps'))]));
  tpl.appendChild(tl);
  cards.tpl = tpl;

  // pipeline
  const pipe = section('Pipeline', 'settings-pipeline');
  const pl = el('ul', 'set-list');
  pl.appendChild(row('Deal stages', 'Rename stages to your firm’s words, or hide the ones you do not use.', [btn('Edit stages', () => editStages())]));
  pipe.appendChild(pl);
  cards.pipe = pipe;

  cards.ws = workspaceSettings(section, row, btn);

  // AI
  const aic = section('AI connection', 'settings-ai', ai.isReady(aiSet) ? 'on' : 'off');
  const al = el('ul', 'set-list');
  let host = '';
  try { host = aiSet.url ? new URL(aiSet.url).host : ''; } catch { host = aiSet.url; }
  al.appendChild(row('AI server', ai.isReady(aiSet) ? `On, through ${host}. Documents, questions and recordings are sent only when you confirm each one.` : 'Off. Reading documents with AI, the deal assistant and transcription need your firm’s AI server; with AI off nothing leaves this device.', [btn('AI settings…', () => openAiSettings(api))]));
  aic.appendChild(al);
  cards.ai = aic;
  cards.brain = brainCard(section);

  // calculation conventions: the two that are settings, and every other one stated
  const cv = section('Calculation rules', 'settings-conventions');
  const cl = el('ul', 'set-list');
  for (const c of CONVENTIONS) {
    if (c.settable && c.kind === 'number') cl.appendChild(numberRow(c));
    else if (c.settable) {
      const sel = el('select', 'compact');
      sel.id = `conv-${c.id.replace('.', '-')}`;
      sel.setAttribute('aria-label', c.label);
      for (const [v, label] of c.options) { const o = el('option', null, label); o.value = v; sel.appendChild(o); }
      sel.value = conv(c.id);
      sel.addEventListener('change', async () => {
        setConventions({ [c.id]: sel.value });
        await kvSet('conventions', conventionValues());
        document.dispatchEvent(new CustomEvent('conventionchange'));
      });
      cl.appendChild(row(c.label, c.help, [sel]));
    } else cl.appendChild(row(c.label, c.value, []));
  }
  cv.appendChild(cl);
  cards.cv = cv;

  // the T-12 labels filed by hand: matched that way on every statement after; any can be forgotten
  const t12s = section('T-12 labels you filed', 'settings-t12');
  const labels = await listLabels();
  if (!labels.length) t12s.appendChild(el('p', 'hint', 'None yet. When you file a T-12 line under a category with “Remember this label”, the label is matched the same way on every statement after. Only the label and the category are kept.'));
  else {
    const ll = el('ul', 'set-list');
    for (const x of labels) {
      const forget = btn('Forget', async () => { await forgetLabel(x.key); renderSettings(); });
      forget.setAttribute('aria-label', `Forget “${x.key}”`);
      ll.appendChild(row(`“${x.key}”`, `${CATEGORY[x.category] ? CATEGORY[x.category].label : x.category} · filed ${niceDate(x.at)}`, [forget]));
    }
    t12s.appendChild(ll);
  }
  cards.t12 = t12s;

  // data
  const data = el('section', 'card');
  data.id = 'settings-data';

  // about
  const about = section('About', 'settings-about', `${PRODUCT} ${VERSION}`);
  const p = el('div', 'about');
  p.appendChild(el('p', 'about-tagline', TAGLINE));
  const nm = el('p');
  nm.style.marginTop = '8px';
  nm.append(el('b', null, 'About the name. '), `${ABOUT_NAME} ${FORMERLY}`);
  p.appendChild(nm);
  const kept = el('p', null, 'Everything you add (deals, comps, templates, tasks, contacts, recordings) is kept in this browser on this device. Nothing is uploaded unless you turn AI on and confirm a send.');
  kept.style.marginTop = '8px';
  p.appendChild(kept);
  const k = el('p');
  k.style.marginTop = '8px';
  k.append('Press ', Object.assign(el('kbd', 'kbd', '⌘K'), {}), ' or ', el('kbd', 'kbd', 'Ctrl K'), ' anywhere to search deals, contacts and tools, and ', el('kbd', 'kbd', '?'), ' for every shortcut. ');
  const keys = el('button', 'btn btn-sm btn-gray', 'Keyboard shortcuts');
  keys.type = 'button';
  keys.id = 'settings-shortcuts';
  keys.dataset.shortcuts = '';
  k.appendChild(keys);
  p.appendChild(k);
  p.appendChild(Object.assign(el('p', null, '© 2026 Kyle Alexander De Melo · MIT License'), { style: 'margin-top:8px' }));
  about.appendChild(p);
  // the To file inbox's one switch: off unless chosen (inboxui.js)
  const tofile = section('To file', 'settings-tofile', 'Records found in documents');
  tofile.appendChild(el('p', 'hint data-hint', 'Documents you read add proposed records (people, companies, the property, dates) to To file under Connect. By default nothing is filed until you tap File.'));
  tofile.appendChild(await autoSwitch('inbox-auto'));
  // a few clearly named groups; only Appearance is open at first. Every card and control is still here, under one of them.
  const groups = [
    group('appearance', 'Appearance', 'Theme, look, accent colour, text size', [cards.look], { open: true, solo: true }),
    group('work', 'Workspace and templates', 'Workspace, pipeline stages, template library', [cards.ws, cards.pipe, cards.tpl]),
    group('calc', 'Calculations', 'Calculation rules and the T-12 labels you filed', [cards.cv, cards.t12]),
    group('ai', 'Documents and AI', 'The AI connection, what is sent, and the brain on this device', [cards.ai, cards.brain]),
    group('data', 'Data and backup', 'Backups, restore, storage, To file', [data, tofile], { solo: true }),
    group('about', 'About', 'Version, name, shortcuts', [about], { solo: true }),
  ];
  for (const g of groups) {
    if (wasOpen.has(g.id)) g.open = wasOpen.get(g.id);
    if (wantGroup && g.id === `set-g-${wantGroup}`) { g.open = true; wantGroup = null; }
    stack.appendChild(g);
  }

  root.appendChild(stack);
  await renderDataCard(data, api);
}

export function initSettings(compsApi) {
  api = compsApi;
  let visible = false;
  document.addEventListener('viewchange', (e) => { visible = e.detail === 'settings'; if (visible) renderSettings(); });
  document.addEventListener('crmchange', () => { if (visible) renderSettings(); });
}
