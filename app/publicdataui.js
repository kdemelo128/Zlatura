/* publicdataui.js -- the "Public data" card on a deal, the same lookup from the Connect page, and the Census key sheet.
 * The lookups themselves are publiclookup.js and publicdata.js; this file asks first and draws what came back.
 *
 *   - A lookup starts only from the broker's own button, after a consent sheet that names the sites and says the deal's figures
 *     are not sent (the first time for each deal in this session). A confidential deal gets a second, plainer confirm each time.
 *   - Results are rows with their source, its link and the date. They are not saved with the deal. A row has Use only where a
 *     deal field fits; Use records the source and its date as the figure's source, and can be undone. Blank stays blank.
 *   - The Census key is the broker's own, kept in this browser (kv "publicdata.key") and never in a backup (backup.js). */

import { el, toast, actionSheet, niceDate } from './kit.js';
import * as store from './store.js';
import { lookupProperty, sourceFor, SOURCES, addressLine } from './publiclookup.js';
import { keyLooksRight } from './publicdata.js';
import { safeHref } from './links.js';
import { openInButton } from './maplinksui.js';
import { PRODUCT } from './brand.js';

const KEY = 'publicdata.key';
/** Deals (by id) the broker has agreed to look up in this session; 'connect' is the Connect page's own. */
const agreed = new Set();
/** The last result for each deal, so a redraw of the deal keeps it on screen. Never stored. */
const last = new Map();

export const getCensusKey = async () => { const v = await store.kvGet(KEY); return typeof v === 'string' ? v : ''; };

/** The sites a lookup will reach, for the consent sheet: area and what each finds. */
export function consentLines(hasKey) {
  return SOURCES.filter((s) => s.host && (s.state === 'Ready' || (s.state === 'Needs a key' && hasKey))).map((s) => `${s.name} (${s.host}): ${s.what}`);
}

/** Ask. Resolves true to go ahead. */
async function consent(scope, { confidential, hasKey }) {
  if (!agreed.has(scope)) {
    const v = await actionSheet('Look up public data?', [
      { info: `${PRODUCT} will look up this address on these public sites:`, sub: consentLines(hasKey).join('\n') },
      { info: 'Your deal’s figures are not sent, only the address. The sites see this device’s internet address, as any site you visit does. Results are shown here and are not filled in until you press Use.' },
      { label: 'Look up', value: 'yes', primary: true, icon: 'search' },
    ]);
    if (v !== 'yes') return false;
    agreed.add(scope);
  }
  if (confidential) {
    const v = await actionSheet('This deal is confidential', [
      { info: 'Looking it up sends its address to public sites outside this device. Nothing else about the deal is sent.' },
      { label: 'Look up anyway', value: 'yes', danger: true },
    ]);
    if (v !== 'yes') return false;
  }
  return true;
}

// h is vetted by safeHref: http or https only, or there is no link
const link = (href, text) => {
  const h = safeHref(href);
  if (!h) return document.createTextNode(text);
  const a = el('a', null, text);
  a.href = h;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
};

/** One row, as a list item. `onUse` is given only where Use is allowed (a deal is open); `have` is the deal's value for the row's field. */
function rowItem(r, { onUse = null, fieldLabel = '', have = undefined } = {}) {
  const li = el('li', `pd-row${r.error ? ' pd-error' : ''}${r.warn ? ' pd-warn' : ''}`);
  li.dataset.id = r.id;
  const t = el('div', 'pd-text');
  t.appendChild(el('b', 'pd-label', r.label));
  t.appendChild(el('span', 'pd-value', r.error ? `Could not be looked up: ${r.error}` : r.value));
  if (r.note && !r.error) t.appendChild(el('span', 'pd-note', r.note));
  const meta = el('span', 'pd-meta');
  meta.append(link(r.source.link, r.source.name), ` · ${r.asOf && !/^\d{4}-\d{4}$/.test(r.asOf) ? `as of ${r.asOf}` : r.asOf ? r.asOf : 'looked up today'}`);
  t.appendChild(meta);
  li.appendChild(t);
  if (r.use && onUse) {
    const b = el('button', 'btn btn-sm btn-gray pd-use', 'Use');
    b.type = 'button';
    b.setAttribute('aria-label', `Use ${r.label} (${r.value}) as ${fieldLabel}`);
    b.addEventListener('click', () => onUse(r));
    const wrap = el('div', 'pd-act');
    if (have !== undefined && have !== null && String(have) !== String(r.use.value)) wrap.appendChild(el('span', 'pd-have', `The deal has ${have}.`));
    wrap.appendChild(b);
    li.appendChild(wrap);
  }
  return li;
}

/**
 * Draw a result into `host`.
 * @param {HTMLElement} host @param {{ rows: any[], attribution?: string }} res
 * @param {{ onUse?: ((row: any) => void) | null, fieldLabels?: Record<string, string>, haveOf?: ((key: string) => any) | null }} [o]
 */
function drawResult(host, res, { onUse = null, fieldLabels = {}, haveOf = null } = {}) {
  host.textContent = '';
  if (!res.rows.length) { host.appendChild(el('p', 'hint', 'Enter an address first.')); return; }
  const groups = [...new Set(res.rows.map((r) => r.group))];
  for (const g of groups) {
    const sec = el('section', 'pd-group');
    sec.appendChild(el('h3', null, g));
    const ul = el('ul', 'pd-list');
    for (const r of res.rows.filter((x) => x.group === g)) ul.appendChild(rowItem(r, { onUse, fieldLabel: r.use ? fieldLabels[r.use.key] || r.use.key : '', have: r.use && haveOf ? haveOf(r.use.key) : undefined }));
    sec.appendChild(ul);
    host.appendChild(sec);
  }
  const foot = el('p', 'hint-sm pd-foot');
  foot.append(`Looked up ${niceDate(new Date().toISOString())}. Not saved with the deal. `);
  if (res.attribution) { foot.append(`Address placed by OpenStreetMap Nominatim, ${res.attribution} (`); foot.appendChild(link('https://www.openstreetmap.org/copyright', 'licence')); foot.append('). '); }
  foot.append('These are public records as the sites publish them: check anything you rely on at the source.');
  host.appendChild(foot);
}

/**
 * The deal's card. box: the card; d: the open deal; hooks: { use(key, value, source), labels: { key: label } }.
 * @param {HTMLElement} box @param {any} d @param {{ use: (key: string, value: any, src: any) => void, labels?: Record<string, string> }} hooks
 */
export function renderPublicCard(box, d, { use, labels = {} }) {
  box.textContent = '';
  const h = el('div', 'card-head');
  h.appendChild(el('h2', null, 'Public data'));
  box.appendChild(h);
  box.appendChild(el('p', 'hint', 'Flood zone, parcel and assessed value, zoning, permits and rates for this address, from free government sites. Shown with the source and date; nothing is filled in until you press Use.'));
  const acts = el('div', 'pd-acts');
  const go = el('button', 'btn btn-sm btn-primary', last.has(d.id) ? 'Look up again' : 'Look up public data');
  go.type = 'button';
  go.id = 'public-lookup-btn';
  acts.appendChild(go);
  acts.appendChild(openInButton(() => ({ address: addressLine(d.figures), name: d.name || '' })));
  box.appendChild(acts);
  const out = el('div', 'pd-out');
  out.id = 'public-results';
  out.setAttribute('aria-live', 'polite');
  box.appendChild(out);
  const draw = () => { const r = last.get(d.id); if (r) drawResult(out, r, { onUse: (row) => use(row.use.key, row.use.value, sourceFor(row)), fieldLabels: labels, haveOf: (k) => d.figures[k] }); };
  draw();
  go.addEventListener('click', async () => {
    const f = d.figures;
    if (!String(f.address || '').trim()) { toast('Enter the deal’s address first.'); return; }
    const key = await getCensusKey();
    if (!(await consent(d.id, { confidential: !!d.confidential, hasKey: keyLooksRight(key) }))) return;
    go.disabled = true;
    out.textContent = '';
    out.appendChild(el('p', 'hint', 'Looking up…'));
    try {
      const res = await lookupProperty({ address: f.address, city: f.city, state: f.state, zip: f.zip }, { key: keyLooksRight(key) ? key : '' });
      last.set(d.id, res);
      if (out.isConnected) draw();
    } finally { go.disabled = false; if (go.isConnected) go.textContent = 'Look up again'; }
  });
}

/** The Connect page's lookup: type an address; results are shown without Use (no deal is open to take them). */
export function openPublicLookup(api) {
  const body = api.sheetOpen({ eyebrow: 'Ready', title: 'Public data for an address', sub: 'Free government sites, looked up when you ask. Open a deal to keep a figure with Use.' });
  const form = el('div', 'form-grid');
  const inputs = {};
  for (const [id, label, ac] of [['address', 'Street address', 'off'], ['city', 'City', 'off'], ['state', 'State (DC, MD or VA)', 'off'], ['zip', 'ZIP', 'off']]) {
    const f = el('div', 'field');
    const l = el('label', null, label);
    const i = el('input', 'input');
    i.type = 'text'; i.id = `pd-${id}`; i.autocomplete = ac; i.spellcheck = false;
    l.htmlFor = i.id;
    f.append(l, i);
    form.appendChild(f);
    inputs[id] = i;
  }
  const go = el('button', 'btn btn-primary', 'Look up');
  go.type = 'button';
  go.id = 'pd-go';
  const out = el('div', 'pd-out');
  out.id = 'public-results';
  out.setAttribute('aria-live', 'polite');
  body.append(form, go, out);
  go.addEventListener('click', async () => {
    const input = { address: inputs.address.value.trim(), city: inputs.city.value.trim(), state: inputs.state.value.trim(), zip: inputs.zip.value.trim() };
    if (!input.address) { toast('Enter a street address first.'); return; }
    const key = await getCensusKey();
    if (!(await consent('connect', { confidential: false, hasKey: keyLooksRight(key) }))) return;
    go.disabled = true;
    out.textContent = '';
    out.appendChild(el('p', 'hint', 'Looking up…'));
    try { drawResult(out, await lookupProperty(input, { key: keyLooksRight(key) ? key : '' })); } finally { go.disabled = false; }
  });
}

/** The Census key sheet (Connect page and Settings). */
export async function openCensusKey(api) {
  const body = api.sheetOpen({ eyebrow: 'Needs a key', title: 'Census key', sub: 'Population, households and income for a tract and county.' });
  body.appendChild(el('p', null, 'The Census Bureau gives a free key to anyone. Paste yours here to switch demographics on in the Public data card.'));
  const p = el('p', 'hint');
  p.append('Get one at ');
  p.appendChild(link('https://api.census.gov/data/key_signup.html', 'api.census.gov/data/key_signup.html'));
  p.append('. The key is kept in this browser only: it is never in a backup, never in a file you export, and is sent only to the Census Bureau when you look up an address.');
  body.appendChild(p);
  const have = await getCensusKey();
  const f = el('div', 'field');
  const l = el('label', null, 'Census key (40 letters and digits)');
  const i = el('input', 'input');
  i.type = 'password'; i.id = 'census-key'; i.autocomplete = 'off'; i.spellcheck = false; i.value = have;
  l.htmlFor = i.id;
  const status = el('p', 'hint');
  status.setAttribute('role', 'status');
  status.id = 'census-key-status';
  status.textContent = have ? 'A key is saved on this device.' : 'No key saved.';
  f.append(l, i);
  const save = el('button', 'btn btn-primary', 'Save key');
  save.type = 'button'; save.id = 'census-key-save';
  save.addEventListener('click', async () => {
    const v = i.value.trim();
    if (!keyLooksRight(v)) { status.textContent = 'That does not look like a Census key: it is 40 letters and digits.'; return; }
    await store.kvSet(KEY, v);
    status.textContent = 'Key saved on this device.';
  });
  const rm = el('button', 'btn btn-gray', 'Remove key');
  rm.type = 'button'; rm.id = 'census-key-remove';
  rm.addEventListener('click', async () => { await store.kvSet(KEY, null); i.value = ''; status.textContent = 'Key removed.'; });
  const row = el('div', 'pd-acts');
  row.append(save, rm);
  body.append(f, row, status);
}
