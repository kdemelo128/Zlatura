/* focuskeep.js -- keep the cursor where the person put it when a screen redraws.
 *
 * Several screens rebuild a block of fields after every committed edit (the
 * lease editor, the What-if answers, the assumptions). A redraw throws away
 * the field that has focus, and the one Tab was about to move to, so the next
 * keystroke went nowhere. `redrawKeepingFocus` finds the focused field again by
 * its id or aria-label once the new one is drawn, and puts the cursor back.
 *
 * A change fires while Tab is still on its way (focus is on nothing yet), so
 * then the redraw waits a beat for focus to land and restores that field. */

const FIELDS = 'input, select, textarea, button, a[href], [tabindex]';

/** How a field is found again after a redraw: its id, its tag and aria-label, or (a checkbox with only a text label beside it) its place among the fields. */
function keyOf(node, root) {
  if (!node || !node.tagName) return null;
  if (node.id) return { id: node.id };
  const label = node.getAttribute('aria-label');
  if (label) return { tag: node.tagName, label };
  const n = [...root.querySelectorAll(FIELDS)].indexOf(node);
  return n >= 0 ? { tag: node.tagName, n } : null;
}
function find(root, key) {
  if (key.id) { const x = document.getElementById(key.id); return x && root.contains(x) ? x : null; }
  if (key.label === undefined) { const x = root.querySelectorAll(FIELDS)[key.n]; return x && x.tagName === key.tag ? x : null; }
  for (const x of root.querySelectorAll(key.tag)) if (x.getAttribute('aria-label') === key.label) return x;
  return null;
}
const text = (node) => node && node.tagName === 'INPUT' && /^(text|search|tel|url|email|password|number|)$/.test(node.type);

/**
 * Run `redraw()` (which rebuilds something inside `root`), then give focus back
 * to the field that had it, caret and selection included.
 * @param {any} root @param {() => void} redraw
 */
export function keepFocus(root, redraw) {
  const a = /** @type {any} */ (document.activeElement);
  const inside = a && a !== document.body && root.contains(a);
  const key = inside ? keyOf(a, root) : null;
  let sel = null;
  try { if (inside && text(a) && a.type !== 'number') sel = [a.selectionStart, a.selectionEnd, a.selectionDirection]; } catch { sel = null; }
  redraw();
  if (!key) return;
  const now = document.activeElement;
  if (now && now !== document.body && root.contains(now)) return; // focus survived (or already moved on)
  const t = find(root, key);
  if (!t) return;
  t.focus({ preventScroll: true });
  try { if (sel && text(t)) t.setSelectionRange(sel[0], sel[1], sel[2] || 'none'); } catch { /* not a field with a caret */ }
}

/**
 * Redraw `root` with `redraw`, keeping focus. When no field has focus because
 * Tab or a click is still moving it, the redraw is done as soon as focus has
 * landed, and the field it landed on is the one kept.
 * @param {any} root @param {() => void} redraw
 */
export function redrawKeepingFocus(root, redraw) {
  const a = document.activeElement;
  if (!a || a === document.body) {
    setTimeout(() => keepFocus(root, redraw), 0);
    return;
  }
  keepFocus(root, redraw);
}
