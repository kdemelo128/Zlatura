/* dataqcui.js -- the Data QC panel: one line per check an import ran, each
 * saying pass, check, fail or note in words (not only by colour), what was
 * compared, and where it points (page, line, row and cell, with the line as
 * printed). Generic: the caller says what resolving a check does and what
 * else a line offers (the OM's rent roll adds "Read this scanned page").
 * The checks themselves are dataqc.js's shape. */

import { el } from './kit.js';
import { LEVELS, LEVEL_WORD, qcCounts, whereText, resolveLabel } from './dataqc.js';

/**
 * opts: { id, title, qc, intro, blockedText, onResolve(check), onAcceptAll(), extra(check) => Node[] }
 * Returns the panel element.
 */
export function qcPanel({ id, title = 'Data QC', qc, intro = '', blockedText = '', onResolve = null, onAcceptAll = null, extra = null }) {
  const box = el('section', 'qc');
  if (id) box.id = id;
  const head = el('div', 'qc-head');
  const h = el('h3', null, title);
  const hid = `${id || 'qc'}-title`;
  h.id = hid;
  box.setAttribute('aria-labelledby', hid);
  head.appendChild(h);
  const n = qcCounts(qc);
  const parts = [n.fail && `${n.fail} fail`, n.warn && `${n.warn} to check`, n.pass && `${n.pass} pass`, n.info && `${n.info} note${n.info === 1 ? '' : 's'}`].filter(Boolean);
  head.appendChild(el('span', 'qc-count', parts.join(' · ')));
  box.appendChild(head);
  if (intro) box.appendChild(el('p', 'hint-sm qc-intro', intro));
  if (n.blocking && blockedText) {
    const b = el('div', 'qc-blocked');
    b.setAttribute('role', 'status');
    b.appendChild(el('p', null, blockedText));
    if (onAcceptAll) {
      const all = el('button', 'btn btn-sm btn-gray', 'Accept the reading as it stands');
      all.type = 'button';
      all.addEventListener('click', () => onAcceptAll());
      b.appendChild(all);
    }
    box.appendChild(b);
  }
  const ul = el('ul', 'qc-list');
  const order = [...((qc && qc.checks) || [])].sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
  for (const c of order) {
    const li = el('li', `qc-item qc-${c.level}${c.resolved ? ' qc-resolved' : ''}`);
    li.dataset.check = c.id;
    const lvl = el('span', `qc-level chip ${c.level === 'fail' ? 'chip-bad' : c.level === 'warn' ? 'chip-warn' : c.level === 'pass' ? 'chip-good' : ''}`, LEVEL_WORD[c.level] || c.level);
    li.appendChild(lvl);
    const body = el('div', 'qc-body');
    body.appendChild(el('span', 'qc-text', c.text));
    const where = whereText(c);
    if (where || c.lineText || (c.stated && c.stated.page)) {
      const d = el('details', 'qc-where');
      d.appendChild(el('summary', null, where || 'Where'));
      if (c.lineText) d.appendChild(el('code', 'qc-line', c.lineText));
      if (c.stated && c.stated.page) d.appendChild(el('p', 'hint-sm', `The OM states it on page ${c.stated.page}${c.stated.line ? `: “${c.stated.line}”` : ''}.`));
      body.appendChild(d);
    }
    const acts = el('div', 'qc-acts');
    if (c.resolved) acts.appendChild(el('span', 'qc-done', c.resolved.how === 'accepted' ? 'Accepted' : 'Resolved'));
    else if (onResolve && (c.level === 'fail' || c.level === 'warn')) {
      const b = el('button', `btn btn-sm ${c.level === 'fail' ? 'btn-primary' : 'btn-gray'}`, resolveLabel(c));
      b.type = 'button';
      b.addEventListener('click', () => onResolve(c));
      acts.appendChild(b);
    }
    if (extra) for (const x of extra(c) || []) acts.appendChild(x);
    if (acts.childNodes.length) body.appendChild(acts);
    li.appendChild(body);
    ul.appendChild(li);
  }
  box.appendChild(ul);
  return box;
}
