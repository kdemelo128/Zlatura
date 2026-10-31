/* compimportui.js -- the screen for importing comps from a spreadsheet or CSV: which sheet, what each column is
 * (Map), what will be added and what is already in the set (Preview), then Import. Loaded on first use. The
 * file is read on this device and never sent anywhere; only the comps, the file's hash and the layout are kept.
 * ui.js passes in what touches the comp set (h). The rules are in compimport.js; design: docs/proposals/comp-importer-c1-note.md. */
import { $, el, toast, getXlsx, getFflate, downloadName, int } from './kit.js';
import { PRODUCT } from './brand.js';
import { checkUpload } from './filekind.js';
import { readGrids, unreadable } from './sheetread.js';
import { sha256Hex } from './fingerprint.js';
import { LEVEL_WORD } from './dataqc.js';
import { kvTooNew } from './migrate.js';
import { LIMITS } from './compmodel.js';
import {
  FIELDS, READ_ROWS, findHeader, headerFingerprint, suggestMapping, startAnswers, questionsFor, setAnswer, readRows,
  normMappings, rememberMapping, mappingRecord, templateCsv,
} from './compimport.js';

const KEY = 'comps.mappings';
const SHOW = 50;
const money = (n) => (typeof n === 'number' ? `$${int(n)}` : 'no price');

/** The blank comp template as a CSV download. */
export async function downloadTemplate(h) {
  await h.deliver(downloadName(`${PRODUCT} comp template.csv`), new TextEncoder().encode(templateCsv()), 'text/csv', { map: 'none: a blank comp template' });
}

/** The sheets of a file that has a heading row and data under it; used to tell comps from a workbook template. [] when it can't be read. */
export async function compSheets(file) {
  try {
    if (unreadable(file, 'comps')) return [];
    const up = await checkUpload(file, { getFflate });
    if (up.refuse) return [];
    return (await readGrids(file, getXlsx, { maxRows: READ_ROWS, upload: up })).filter((g) => { const hd = findHeader(g); return !hd.refuse && g.rows.length - hd.idx - 1 >= 1; });
  } catch { return []; }
}

const btn = (label, cls, onClick) => { const b = el('button', `${cls || ''} ci44`.trim(), label); b.type = 'button'; if (onClick) b.addEventListener('click', onClick); return b; };

/**
 * Import comps from one file. `h` = { existing(): comps in the set, manualCount(), add(comps), snapshot(), restore(snap),
 * deliver, sheetOpen, sheetClose, focusBack }.
 * @param {File} file
 * @param {any} h
 */
export async function openCompImport(file, h) {
  const stop = unreadable(file, 'comps');
  if (stop) { toast(stop); return; }
  let up; let grids; let sha256;
  try {
    up = await checkUpload(file, { getFflate });
    if (up.refuse) { toast(up.refuse); return; }
    if (up.kind !== 'text' && up.kind !== 'xlsx') { toast('That file isn’t a comp report or a spreadsheet of comps.'); return; }
    grids = await readGrids(file, getXlsx, { maxRows: READ_ROWS, upload: up });
    sha256 = await sha256Hex(await file.arrayBuffer());
  } catch (err) { toast(err.message || 'That file could not be read.'); return; }
  const usable = grids.map((g) => ({ g, hd: findHeader(g) })).filter((x) => !x.hd.refuse);
  if (!usable.length) { toast(findHeader(grids[0] || { rows: [] }).refuse || 'No row of column headings was found.'); return; }

  const S = { sheet: usable[0], label: file.name.replace(/\.[^.]*$/, '').slice(0, LIMITS.source), mapping: null, answers: null, remember: true, skip: new Set(), rec: null, tooNew: false };
  const stored = await h.kvGet(KEY);
  S.tooNew = kvTooNew(KEY, stored);
  const memory = S.tooNew ? { v: 1, items: {} } : normMappings(stored);

  const body = h.sheetOpen({ eyebrow: 'Add comps', title: 'Import comps', sub: `${file.name} · read on this device, nothing is uploaded`, foot: [] });
  const foot = $('sheet-foot');
  const setFoot = (...nodes) => { foot.textContent = ''; foot.hidden = false; nodes.forEach((n) => foot.appendChild(n)); };

  // one label box, moved between steps so typing in it is never interrupted
  const labelIn = el('input', 'ci44'); labelIn.type = 'text'; labelIn.id = 'ci-label'; labelIn.maxLength = LIMITS.source; labelIn.value = S.label;
  labelIn.addEventListener('input', () => { S.label = labelIn.value; });
  const labelBox = el('div', 'field');
  const labelLab = el('label', null, 'Source label'); labelLab.htmlFor = 'ci-label';
  labelBox.append(labelLab, labelIn, el('div', 'hint-sm', 'Shown on every comp from this file, as its source.'));

  async function choose(entry) {
    S.sheet = entry;
    const fp = await headerFingerprint(entry.hd.headers);
    S.fp = fp;
    S.rec = fp ? memory.items[fp] || null : null;
    S.mapping = suggestMapping(entry.hd.headers, S.rec);
    S.answers = startAnswers(entry.g, S.mapping);
    S.skip = new Set();
    if (S.mapping.label) { S.label = S.mapping.label; labelIn.value = S.label; }
    const qs = questionsFor(entry.g, S.mapping, S.answers);
    const open = qs.some((x) => x.block || !x.options.some((o) => o[0] === x.value));
    if (S.mapping.how === 'guess' || open) stepMap(); else stepPreview();
  }

  /* ---------------- which sheet */
  function stepSheet() {
    body.textContent = '';
    setFoot(btn('Cancel', 'btn', () => h.sheetClose()));
    const fs = el('fieldset', 'field'); fs.appendChild(el('legend', null, 'Which sheet holds the comps?'));
    usable.forEach((x, i) => {
      const lab = el('label', 'radio-row ci44'); const r = el('input'); r.type = 'radio'; r.name = 'ci-sheet'; r.value = String(i);
      lab.append(r, document.createTextNode(` ${x.g.sheet} (${x.g.rows.length - x.hd.idx - 1} rows)`));
      r.addEventListener('change', () => choose(x));
      fs.appendChild(lab);
    });
    body.appendChild(fs);
  }

  /* ---------------- step 1: map */
  function stepMap() {
    const { g, hd } = S.sheet;
    const rows = g.rows.slice(hd.idx + 1);
    body.textContent = '';
    body.appendChild(labelBox);
    if (S.mapping.how !== 'guess') {
      body.appendChild(el('p', 'hint-sm', S.mapping.how === 'remembered' ? `Mapped as ${S.mapping.label}, used ${S.mapping.uses} time${S.mapping.uses === 1 ? '' : 's'}.` : `Recognised as the ${S.mapping.label}.`));
    }
    const qBox = el('div'); qBox.setAttribute('aria-live', 'polite');
    body.appendChild(qBox);
    const reason = el('span', 'hint-sm'); reason.setAttribute('role', 'status');
    const go = btn('Continue', 'btn btn-primary', () => stepPreview());
    let sig = '';
    const refresh = () => {
      const qs = questionsFor(g, S.mapping, S.answers);
      const next = qs.map((x) => x.id + (x.block || '')).join('\u0001');
      if (next !== sig) {
        sig = next; qBox.textContent = '';
        for (const x of qs) {
          if (x.block) { const p = el('p', x.fail ? 'chip chip-warn' : 'hint-sm', x.block); qBox.appendChild(p); continue; }
          const fs = el('fieldset', 'field'); fs.appendChild(el('legend', null, x.text));
          for (const [v, label] of x.options) {
            const lab = el('label', 'radio-row ci44'); const r = el('input'); r.type = 'radio'; r.name = `ci-q-${x.id}`; r.value = v; r.checked = x.value === v;
            r.addEventListener('change', () => { setAnswer(S.answers, x, v); refresh(); });
            lab.append(r, document.createTextNode(` ${label}`));
            fs.appendChild(lab);
          }
          qBox.appendChild(fs);
        }
      }
      const blocked = qs.find((x) => x.block);
      const unanswered = qs.find((x) => !x.block && !x.options.some((o) => o[0] === x.value));
      go.disabled = !!(blocked || unanswered);
      reason.textContent = blocked ? blocked.block : unanswered ? 'Answer the questions above to continue.' : '';
    };
    // one card per column
    const cards = el('div');
    cards.appendChild(el('h3', null, 'Columns'));
    hd.headers.forEach((head, i) => {
      if (!head) return;
      const card = el('div', 'card card-pad'); card.style.boxShadow = 'none';
      card.appendChild(el('div', 'li-title', head));
      const samples = rows.map((r) => String(r.cells[i] ?? '').slice(0, 40)).filter(Boolean).slice(0, 3);
      card.appendChild(el('div', 'hint-sm', samples.length ? samples.join(' · ') : 'no values'));
      const lab = el('label', null, `Use “${head.slice(0, 40)}” as`); lab.htmlFor = `ci-col-${i}`;
      const sel = el('select', 'compact ci44'); sel.id = `ci-col-${i}`;
      const opts = [['', 'Choose…'], ['none', 'Not used'], ...FIELDS.filter((f) => f.id !== 'comp_id' || S.mapping.columns[i] === 'comp_id').map((f) => [f.id, f.label])];
      for (const [v, l] of opts) { const o = el('option', null, l); o.value = v; sel.appendChild(o); }
      sel.value = S.mapping.columns[i] === null ? '' : S.mapping.columns[i];
      sel.addEventListener('change', () => { S.mapping.columns[i] = sel.value === '' ? null : sel.value; refresh(); });
      card.append(lab, sel);
      if (S.mapping.columns[i] && S.mapping.columns[i] !== 'none') card.appendChild(el('span', 'chip chip-good', 'recognised'));
      cards.appendChild(card);
    });
    body.appendChild(cards);
    const tpl = btn('Download comp template (CSV)', 'btn btn-gray', () => downloadTemplate(h));
    body.appendChild(tpl);
    setFoot(reason, btn('Cancel', 'btn', () => h.sheetClose()), go);
    refresh();
  }

  /* ---------------- step 2: preview */
  function stepPreview() {
    const { g } = S.sheet;
    const res = readRows(g, S.mapping, S.answers, { existing: h.existing(), file: file.name, sha256, source: S.label || file.name, sheet: g.sheet, now: new Date() });
    if (res.refuse) { stepMap(); return; }
    body.textContent = '';
    body.appendChild(labelBox);
    const line = el('p', 'hint-sm', S.mapping.how === 'remembered' ? `Mapped as ${S.mapping.label}, used ${S.mapping.uses} time${S.mapping.uses === 1 ? '' : 's'}. ` : S.mapping.how === 'profile' ? `Recognised as the ${S.mapping.label}. ` : '');
    line.appendChild(btn('Change', 'btn btn-plain', () => stepMap()));
    body.appendChild(line);
    const counts = el('p', 'li-title'); counts.setAttribute('role', 'status'); counts.setAttribute('aria-live', 'polite');
    body.appendChild(counts);
    const dupRows = res.rows.filter((r) => r.comp && r.dupe && r.dupe.level !== 'resale');
    for (const r of dupRows) if (r.dupe.level === 'same') S.skip.add(r);
    const outRows = res.rows.filter((r) => r.status === 'out');
    const addRows = res.rows.filter((r) => r.comp && !dupRows.includes(r));
    const checked = res.rows.filter((r) => r.comp && r.checks.some((c) => c.level === 'warn' || c.level === 'fail'));
    const going = () => [...addRows, ...dupRows.filter((r) => !S.skip.has(r))];
    const importBtn = btn('Import', 'btn btn-primary', doImport);
    const update = () => {
      const g2 = going(); const sales = g2.filter((r) => r.comp.kind === 'sale').length;
      const why = [...new Set(outRows.map((r) => r.why))].slice(0, 4).join(', ');
      counts.textContent = `${res.rows.length} rows: ${g2.length} to add (${sales} sales, ${g2.length - sales} listings), ${dupRows.length} already in the set, ${outRows.length} left out${why ? ` (${why})` : ''}, ${checked.length} with checks`;
      importBtn.textContent = g2.length ? `Import ${g2.length} comp${g2.length === 1 ? '' : 's'}` : 'Nothing to import';
      importBtn.disabled = !g2.length;
    };
    const group = (title, list, draw) => {
      if (!list.length) return;
      const sec = el('section'); sec.appendChild(el('h3', null, `${title} (${list.length})`));
      const ul = el('ul', 'plain-list'); sec.appendChild(ul);
      const fill = (n) => { ul.textContent = ''; list.slice(0, n).forEach((r) => ul.appendChild(draw(r))); };
      fill(SHOW);
      if (list.length > SHOW) { const more = btn(`Show all ${list.length}`, 'btn btn-plain', () => { fill(list.length); more.remove(); }); sec.appendChild(more); }
      body.appendChild(sec);
    };
    const what = (r) => {
      const c = r.comp; const li = el('li');
      li.appendChild(el('div', 'li-title', c.name));
      li.appendChild(el('div', 'hint-sm', `Row ${r.r} · ${c.kind === 'sale' ? 'Sale' : 'On market'} · ${money(c.price)} · ${c.bsf ? `${int(c.bsf)} SF` : 'no SF'}${c.exclude ? ` · set aside: ${c.bsf_basis === 'gross' ? 'gross area' : 'area basis?'}` : ''}`));
      for (const k of r.checks) li.appendChild(el('div', 'hint-sm', `${LEVEL_WORD[k.level] || k.level}: ${k.text}`));
      return li;
    };
    group('To add', addRows, what);
    group('Already in the set', dupRows, (r) => {
      const li = what(r);
      li.appendChild(el('div', 'hint-sm', `Already in the set as ${r.dupe.of.name} (${r.dupe.of.source || 'this set'}): ${r.dupe.why}`));
      const seg = el('div', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', `Row ${r.r}: ${r.comp.name}`);
      const pair = [['Skip', true], ['Add anyway', false]].map(([label, skip]) => {
        const b = btn(label, null); b.setAttribute('aria-pressed', String(S.skip.has(r) === skip));
        b.addEventListener('click', () => { if (skip) S.skip.add(r); else S.skip.delete(r); pair.forEach(([bb, s2]) => bb.setAttribute('aria-pressed', String(S.skip.has(r) === s2))); update(); });
        seg.appendChild(b); return [b, skip];
      });
      li.appendChild(seg);
      return li;
    });
    group('Left out', outRows, (r) => { const li = el('li'); li.appendChild(el('div', 'hint-sm', `Row ${r.r}: ${r.why}`)); return li; });
    const fileChecks = res.checks.map((c) => ({ r: null, c }));
    group('Checks', [...fileChecks, ...checked.flatMap((r) => r.checks.filter((c) => c.level !== 'info').map((c) => ({ r: r.r, c })))], ({ r, c }) => el('li', 'hint-sm', `${r ? `Row ${r}: ` : ''}${LEVEL_WORD[c.level]}: ${c.text}`));
    const rem = el('label', 'radio-row ci44'); const box = el('input'); box.type = 'checkbox'; box.checked = S.remember && !S.tooNew; box.disabled = S.tooNew;
    box.addEventListener('change', () => { S.remember = box.checked; });
    rem.append(box, document.createTextNode(' Remember this layout, so the next file like it is mapped for you. Remembered layouts are kept in backups.'));
    body.appendChild(rem);
    setFoot(btn('Cancel', 'btn', () => h.sheetClose()), importBtn);
    update();

    async function doImport() {
      const comps = going().map((r) => r.comp);
      if (h.manualCount() + comps.length > LIMITS.comps) { toast(`The comp set holds up to ${LIMITS.comps.toLocaleString('en-US')} comps; this would make ${(h.manualCount() + comps.length).toLocaleString('en-US')}.`); return; }
      const snap = h.snapshot();
      h.add(comps);
      if (S.remember && !S.tooNew && S.fp) {
        const rec = mappingRecord(S.sheet.hd.headers, S.mapping.columns, S.answers, S.label || file.name);
        try { await h.kvSet(KEY, rememberMapping(await h.kvGet(KEY), S.fp, rec, Date.now())); } catch { /* the comps are in; the layout just isn't remembered */ }
      }
      h.sheetClose();
      toast(`Imported ${comps.length} comp${comps.length === 1 ? '' : 's'} from ${S.label || file.name}.`, { label: 'Undo', run: () => h.restore(snap) });
      h.focusBack();
    }
  }

  if (usable.length > 1) stepSheet(); else await choose(usable[0]);
}
