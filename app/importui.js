/* importui.js -- the screens for a CRM, deal or tenant file: which kind of file it is, what each column is (with a preview
 * of the records it would make), then Send to To file; and Export, the other way. Loaded by the Connect page. The file is
 * read on this device and never sent anywhere; only the proposed records (inboxstore.js proposeRows) and the column layout
 * are kept. The rules are in presets.js; every record goes through the To file inbox, so nothing is filed until a person taps. */
import { el, toast, getXlsx, getFflate, downloadName, deliver } from './kit.js';
import { PRODUCT } from './brand.js';
import { checkUpload } from './filekind.js';
import { readGrids, unreadable } from './sheetread.js';
import { sha256Hex } from './filehash.js';
import { kvTooNew } from './migrate.js';
import * as store from './store.js';
import * as crm from './crm.js';
import { STAGES, STAGE_LABEL } from './pipeline.js';
import { matchScope, upToDate } from './inbox.js';
import { proposeRows } from './inboxstore.js';
import {
  PRESETS, PRESET_BY_ID, MAX_ROWS, findHeader, rankPresets, suggestMapping, mappingOk, normMappings, rememberMapping, mappingRecord,
  readRows, stageTexts, stageFor, datesAmbiguous, contactsCsv, dealsCsv, tasksCsv, LAYOUTS, norm,
} from './presets.js';

const KEY = 'import.mappings';
const SHOW = 5;
const btn = (label, cls, onClick) => { const b = el('button', `btn btn-sm conn-btn ${cls || ''} ci44`.trim(), label); b.type = 'button'; if (onClick) b.addEventListener('click', onClick); return b; };
const sample = (grid, hdIdx, i) => { for (const r of grid.rows.slice(hdIdx + 1, hdIdx + 8)) { const v = r.cells[i]; if (v !== null && v !== undefined && String(v).trim()) return String(v).slice(0, 40); } return ''; };

/** The one line a candidate shows in the preview. */
const line = (c) => (c.kind === 'deal' ? [c.name, c.address, c.crmStage].filter(Boolean).join(' · ') : [c.name, c.company && c.company !== c.name ? c.company : '', c.email, c.phone].filter(Boolean).join(' · '));

/**
 * Import one file. `preset` is the kind the Connect row names ('people', 'companies', 'deals', 'tenants'; the page may change it).
 * `h` = { api: { sheetOpen, sheetClose }, done(): called after rows were sent, to show To file }.
 * @param {File} file @param {string} preset @param {any} h
 */
export async function openImport(file, preset, h) {
  const stop = unreadable(file, 'a contact or deal list');
  if (stop) { toast(stop); return; }
  let grids; let sha256;
  try {
    const up = await checkUpload(file, { getFflate });
    if (up.refuse) { toast(up.refuse); return; }
    if (up.kind !== 'text' && up.kind !== 'xlsx') { toast('That is not a CSV or Excel file.'); return; }
    grids = await readGrids(file, getXlsx, { maxRows: MAX_ROWS + 20, upload: up });
    sha256 = await sha256Hex(await file.arrayBuffer());
  } catch (err) { toast(err.message || 'That file could not be read.'); return; }
  if (!grids.length) { toast('That file has no rows.'); return; }

  const stored = await store.kvGet(KEY);
  const tooNew = kvTooNew(KEY, stored);
  const memory = tooNew ? { v: 1, items: {} } : normMappings(stored);
  const [contacts, deals] = await Promise.all([crm.listContacts(), store.listDeals()]);
  const scope = matchScope(contacts, deals, null);

  const S = { grid: grids[0], preset: PRESET_BY_ID[preset] || PRESETS[0], dateOrder: null, remember: true, stages: {}, columns: [], hd: null, fp: '', how: 'guess', dupes: [] };
  const body = h.api.sheetOpen({ eyebrow: 'Connect', title: 'Bring in a file', sub: `${file.name} · read on this device, nothing is uploaded` });

  async function setup() {
    S.hd = findHeader(S.grid, S.preset);
    if (S.hd.refuse) return;
    S.fp = await sha256Hex(new TextEncoder().encode(`${S.preset.id}\u0001${[...S.hd.headers.map(norm)].sort().join('\u0001')}`));
    const rec = memory.items[S.fp] && memory.items[S.fp].preset === S.preset.id ? memory.items[S.fp] : null;
    const m = suggestMapping(S.hd.headers, S.preset, rec);
    S.columns = m.columns; S.dupes = m.dupes; S.how = m.how;
    S.stages = rec ? { ...rec.stages } : {};
  }

  const rowsOf = () => S.grid.rows.slice(S.hd.idx + 1);
  const run = () => readRows(rowsOf(), S.hd.headers, S.columns, S.preset, { stages: S.stages, dateOrder: S.dateOrder });

  async function draw() {
    body.textContent = '';
    // 1. what kind of file
    const kinds = el('fieldset', 'field');
    kinds.appendChild(el('legend', null, 'What does this file list?'));
    for (const p of PRESETS) {
      const lab = el('label', 'radio-row ci44');
      const r = el('input'); r.type = 'radio'; r.name = 'imp-kind'; r.value = p.id; r.checked = p.id === S.preset.id;
      r.addEventListener('change', async () => { S.preset = p; S.dateOrder = null; await setup(); draw(); });
      lab.append(r, document.createTextNode(` ${p.label}`));
      kinds.appendChild(lab);
    }
    body.appendChild(kinds);
    if (grids.length > 1) {
      const sel = el('select', 'input ci44'); sel.id = 'imp-sheet'; sel.setAttribute('aria-label', 'Which sheet');
      grids.forEach((g, i) => { const o = el('option', null, `${g.sheet} (${g.rows.length} rows)`); o.value = String(i); sel.appendChild(o); });
      sel.value = String(grids.indexOf(S.grid));
      sel.addEventListener('change', async () => { S.grid = grids[+sel.value]; await setup(); draw(); });
      body.appendChild(sel);
    }
    if (S.hd.refuse) { body.appendChild(el('p', 'hint inbox-conflict', S.hd.refuse)); body.appendChild(btn('Close', 'btn-gray', () => h.api.sheetClose())); return; }

    // 2. the columns
    body.appendChild(el('p', 'conn-desc', S.how === 'remembered' ? 'The layout you chose for a file like this is back. Change any column below.' : 'Each column is matched by its heading. Check them, and change any that is wrong.'));
    const list = el('ul', 'imp-cols');
    list.setAttribute('aria-label', 'Columns');
    S.hd.headers.forEach((hd, i) => {
      const li = el('li', 'imp-col');
      const lab = el('label', null, hd || `Column ${i + 1}`); lab.htmlFor = `imp-col-${i}`;
      const sel = el('select', 'input ci44'); sel.id = `imp-col-${i}`;
      for (const [v, t] of [['none', 'Not used'], ...S.preset.fields.map((f) => [f.id, f.label])]) { const o = el('option', null, t); o.value = v; sel.appendChild(o); }
      sel.value = S.columns[i];
      sel.addEventListener('change', () => {
        // a field has one column: choosing it here frees it from any other
        if (sel.value !== 'none') S.columns = S.columns.map((c, j) => (j !== i && c === sel.value ? 'none' : c));
        S.columns[i] = sel.value; S.dupes = S.dupes.filter((d) => d !== i);
        draw();
      });
      li.append(lab, el('span', 'conn-desc imp-sample', sample(S.grid, S.hd.idx, i) ? `e.g. ${sample(S.grid, S.hd.idx, i)}` : 'empty'), sel);
      list.appendChild(li);
    });
    body.appendChild(list);
    if (S.dupes.length) body.appendChild(el('p', 'hint-sm inbox-conflict', `Two columns named the same field: “${S.dupes.map((i) => S.hd.headers[i]).join('”, “')}” is not used. Choose it above if it is the right one.`));

    // 3. questions the file does not settle
    const rows = rowsOf();
    if (S.preset.kind === 'deal' && S.columns.includes('stage')) {
      const fs = el('fieldset', 'field imp-stages');
      fs.appendChild(el('legend', null, 'Which stage is each one?'));
      for (const t of stageTexts(rows, S.columns)) {
        const lab = el('label', 'imp-stage', `“${t}” is `);
        const sel = el('select', 'input ci44'); sel.setAttribute('aria-label', `Stage for ${t}`); sel.dataset.stage = t;
        for (const [v, tx] of [['none', 'Not set (kept in the notes)'], ...STAGES.map(([k]) => [k, STAGE_LABEL[k]])]) { const o = el('option', null, tx); o.value = v; sel.appendChild(o); }
        sel.value = Object.hasOwn(S.stages, t) ? S.stages[t] : (stageFor(t) || 'none');
        sel.addEventListener('change', () => { S.stages[t] = sel.value; draw(); });
        lab.appendChild(sel); fs.appendChild(lab);
      }
      body.appendChild(fs);
    }
    const askOrder = S.preset.kind === 'deal' && S.columns.includes('close') && datesAmbiguous(rows, S.columns);
    if (askOrder) {
      const fs = el('fieldset', 'field imp-dates');
      fs.appendChild(el('legend', null, 'Dates like 3/4/2027: which comes first?'));
      for (const [v, t] of [['mdy', 'Month first (March 4)'], ['dmy', 'Day first (3 April)']]) {
        const lab = el('label', 'radio-row ci44');
        const r = el('input'); r.type = 'radio'; r.name = 'imp-order'; r.value = v; r.checked = S.dateOrder === v;
        r.addEventListener('change', () => { S.dateOrder = v; draw(); });
        lab.append(r, document.createTextNode(` ${t}`));
        fs.appendChild(lab);
      }
      body.appendChild(fs);
    }

    // 4. what it would make
    const out = el('div', 'imp-preview'); out.id = 'imp-preview'; out.setAttribute('aria-live', 'polite');
    body.appendChild(out);
    if (!mappingOk(S.preset, S.columns)) { out.appendChild(el('p', 'hint inbox-conflict', `Nothing to make yet: choose which column is the ${S.preset.noun}’s ${S.preset.needs.map((n) => S.preset.fields.find((f) => f.id === n).label.toLowerCase()).join(' or ')}.`)); return; }
    const { cands, skipped, blankDates } = run();
    const same = cands.filter((c) => upToDate(c, contacts, deals, scope)).length;
    out.appendChild(el('p', 'conn-lede', `${cands.length} ${S.preset.noun}${cands.length === 1 ? '' : 's'} read${same ? `; ${same} already up to date and left out` : ''}${skipped.length ? `; ${skipped.length} row${skipped.length === 1 ? '' : 's'} with no ${S.preset.kind === 'deal' ? 'deal name' : 'name'} skipped` : ''}.`));
    if (blankDates) out.appendChild(el('p', 'hint-sm', `${blankDates} date${blankDates === 1 ? '' : 's'} could not be read and ${blankDates === 1 ? 'was' : 'were'} left blank.`));
    const ul = el('ul', 'imp-sample-list'); ul.setAttribute('aria-label', 'First records');
    for (const c of cands.slice(0, SHOW)) ul.appendChild(el('li', null, line(c)));
    out.appendChild(ul);

    const rem = el('label', 'chk');
    const box = el('input'); box.type = 'checkbox'; box.id = 'imp-remember'; box.checked = S.remember && !tooNew; box.disabled = tooNew;
    box.addEventListener('change', () => { S.remember = box.checked; });
    rem.append(box, document.createTextNode(' Remember these columns for files like this one'));
    body.appendChild(rem);

    const go = btn(`Send ${cands.length - same} to To file`, 'btn-primary', async () => {
      go.disabled = true;
      try {
        const r = await proposeRows({ cands, source: { file: file.name, docRole: S.preset.id, sha256 } });
        if (S.remember && !tooNew) {
          const cur = await store.kvGet(KEY);
          if (!kvTooNew(KEY, cur)) await store.kvSet(KEY, rememberMapping(cur, S.fp, mappingRecord(S.preset, S.hd.headers, S.columns, S.stages, file.name.replace(/\.[^.]*$/, '')), Date.now()));
        }
        h.api.sheetClose();
        const bits = [`${r.added} sent to To file`, r.replaced && `${r.replaced} replaced a waiting copy`, r.unchanged && `${r.unchanged} already up to date`, r.seen && `${r.seen} seen before`, r.flagged && `${r.flagged} flagged as text`, r.left && `${r.left} more not sent (To file holds 500; file these and import again)`].filter(Boolean);
        toast(`${bits.join('; ')}.`, null, 8000);
        h.done();
      } catch (e) { go.disabled = false; toast(e.message || 'That could not be saved.'); }
    });
    go.id = 'imp-go';
    go.disabled = cands.length - same === 0 || (askOrder && !S.dateOrder);
    body.appendChild(go);
  }

  const best = rankPresets(findHeader(S.grid, S.preset).headers || []);
  if (preset === 'auto' && best[0] && best[0].hits > 0) S.preset = PRESET_BY_ID[best[0].id];
  await setup();
  await draw();
}

/** The Export sheet: contacts, deals and tasks as CSV, in this app's own column names or the common CRM ones. */
export async function openExport(api) {
  const [contacts, deals, tasks] = await Promise.all([crm.listContacts(), store.listDeals(), crm.listTasks()]);
  const body = api.sheetOpen({ eyebrow: 'Connect', title: `Export from ${PRODUCT}`, sub: 'CSV files made on this device. Confidential deals, their tasks and their contacts are left out.' });
  let layout = 'neutral';
  const fs = el('fieldset', 'field');
  fs.appendChild(el('legend', null, 'Column names'));
  for (const [v, t] of LAYOUTS) {
    const lab = el('label', 'radio-row ci44');
    const r = el('input'); r.type = 'radio'; r.name = 'exp-layout'; r.value = v; r.checked = v === layout;
    r.addEventListener('change', () => { layout = v; });
    lab.append(r, document.createTextNode(` ${t}`));
    fs.appendChild(lab);
  }
  body.appendChild(fs);
  const make = (label, id, fn, name) => {
    const b = btn(label, 'btn-gray', async () => {
      try {
        const r = fn();
        if (!r.count) { toast(`There are no ${name} to export${r.left ? ' outside confidential deals' : ''}.`); return; }
        await deliver(downloadName(`${PRODUCT} ${name}.csv`), new TextEncoder().encode(r.csv), 'text/csv', { map: 'none: a list of contacts, deals or tasks, not a deal workbook' });
        toast(`${r.count} ${name} exported${r.left ? `; ${r.left} on confidential deals left out` : ''}.`);
      } catch (e) { toast(e.message || 'That could not be exported.'); }
    });
    b.id = id;
    return b;
  };
  const acts = el('div', 'md-acts');
  acts.append(
    make(`Contacts (${contacts.length})`, 'exp-contacts', () => contactsCsv(contacts, deals, layout), 'contacts'),
    make(`Deals (${deals.length})`, 'exp-deals', () => dealsCsv(deals, layout, (k) => STAGE_LABEL[k] || STAGE_LABEL.underwriting), 'deals'),
    make(`Tasks (${tasks.length})`, 'exp-tasks', () => tasksCsv(tasks, deals, contacts, layout), 'tasks'),
  );
  body.append(acts, el('p', 'hint-sm', 'Dates are written 2027-03-04. Each file also carries a Monal ID column: leave it in, and loading the file back here finds the same records instead of adding them twice.'.replace('Monal', PRODUCT)));
}
