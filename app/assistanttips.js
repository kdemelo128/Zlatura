/* assistanttips.js -- the Underwrite tool's "Monal's nest" tips as Ask Monal's suggested questions.
 *
 * The tool's bird hands the app its current step and its tips over the frame bridge (uwfiller/toolbridge.js). The frame is
 * the tool's code, not the app's, so everything is read defensively here: plain strings only, capped, anything else dropped.
 * The tips stay the tool's own text (uwtool/monal-guide.js); this file only cleans them and picks the ones for a step.
 * Pure, no DOM. */

export const STEPS = ['files', 'review', 'model', 'export'];
const MAX_TIPS = 30;
const str = (x, n) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/**
 * The step and tips of a payload from the frame: { step, tips: [{ id, steps, title, text, label }] }. A tip with no id, title
 * or text is dropped; an unknown step becomes 'model'; a tip's steps keep only the known ones.
 * @param {any} x
 * @returns {{ step: string, tips: { id: string, steps: string[], title: string, text: string, label: string }[] }}
 */
export function cleanTips(x) {
  const o = x && typeof x === 'object' ? x : {};
  const step = STEPS.includes(o.step) ? o.step : 'model';
  const seen = new Set();
  const tips = [];
  for (const t of Array.isArray(o.tips) ? o.tips.slice(0, MAX_TIPS) : []) {
    if (!t || typeof t !== 'object') continue;
    const id = str(t.id, 40);
    const title = str(t.title, 120);
    const text = str(t.text, 600);
    if (!id || !title || !text || seen.has(id)) continue;
    seen.add(id);
    tips.push({ id, steps: (Array.isArray(t.steps) ? t.steps : []).filter((s) => STEPS.includes(s)), title, text, label: str(t.label, 60) || 'Take me there' });
  }
  return { step, tips };
}

/** The tips that belong to a step (their own steps list), then every other tip: nothing is left out. */
export function splitTips(tips, step) {
  const mine = tips.filter((t) => t.steps.includes(step));
  return { mine, more: tips.filter((t) => !mine.includes(t)) };
}
