/* dataqc.js -- Data QC: the checks an import ran, in one shape any import can
 * use (an OM's rent roll now; the T-12 and Bug B's import next). A check is
 *
 *   { id, kind, level: 'pass'|'warn'|'fail'|'info', text,
 *     page, line, row, col, colLabel, cell: { text }, lineText, amount,
 *     stated?: { page, line }, resolved?: { how, at, note } }
 *
 * A fail holds the import back until the broker resolves it or accepts the
 * reading as it stands; a warn is shown and waits in Review; info and pass are
 * shown only. Resolving is recorded on the check itself, where it lives (the
 * deal), so it travels in backups and the deal's history can undo it. Pure:
 * dataqcui.js draws it. Design: docs/proposals/data-qc.md. */

export const LEVELS = ['fail', 'warn', 'info', 'pass'];
export const LEVEL_WORD = { fail: 'Fail', warn: 'Check', info: 'Note', pass: 'Pass' };

/** Checks waiting for a person: fails and warns not yet resolved. */
export const openChecks = (qc) => (qc && Array.isArray(qc.checks) ? qc.checks.filter((c) => (c.level === 'fail' || c.level === 'warn') && !c.resolved) : []);

/** Fails not yet resolved: while there is one, the import is held back. */
export const blockingChecks = (qc) => openChecks(qc).filter((c) => c.level === 'fail');

/** How many of each level, and how many are still open. */
export function qcCounts(qc) {
  const out = { fail: 0, warn: 0, info: 0, pass: 0, open: 0, blocking: 0 };
  for (const c of (qc && qc.checks) || []) if (c.level in out) out[c.level] += 1;
  out.open = openChecks(qc).length;
  out.blocking = blockingChecks(qc).length;
  return out;
}

/** Record a check as resolved, where it lives. Returns the check, or null. */
export function resolveCheck(qc, id, how = 'accepted', at = Date.now(), note = '') {
  const c = qc && Array.isArray(qc.checks) ? qc.checks.find((x) => x.id === id) : null;
  if (!c) return null;
  c.resolved = { how, at, ...(note ? { note } : {}) };
  return c;
}

/** The words on the button that resolves a check: a fail is accepted as read; a page with no text is let be. */
export const resolveLabel = (c) => (c.level === 'fail' ? 'Accept as read' : c.kind === 'scanned' ? 'Nothing to read there' : 'It’s right');

/** Where a check points, in words: "page 5, line 9, row 3, column SF (“1,800”)". */
export function whereText(c) {
  const bits = [];
  if (c.page) bits.push(`page ${c.page}`);
  if (c.line) bits.push(`line ${c.line}`);
  if (c.row) bits.push(`row ${c.row}`);
  if (c.colLabel) bits.push(`column ${c.colLabel}${c.cell && c.cell.text ? ` (“${c.cell.text}”)` : ''}`);
  else if (c.cell && c.cell.text) bits.push(`“${c.cell.text}”`);
  return bits.join(', ');
}
