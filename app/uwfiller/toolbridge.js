/* uwfiller/toolbridge.js -- gives the built-in tool's Model step the app's Quick check, calculators and "Save as deal".
 *
 * How the two sides meet (docs/proposals/one-underwriting-space.md B and F, release 3): the tool is a same-origin frame, so
 * the PAGE hands the frame one small frozen object, window.MonalApp, when the frame has loaded, and only to the window of the
 * page's own #uwt-frame whose address is the tool's own page. The frame never reaches out to the page: no postMessage, no
 * import of the app's modules from the frame (a second copy of each module, with none of the app's state, would run there),
 * so the engine, the calculators and the deal paths run once, here, as they do for Quick underwrite.
 *
 * Everything that crosses is plain data (strings, numbers, arrays of them), read defensively: the frame is the tool's code,
 * not the app's, so a value of any other type is treated as blank. The tool's text is parsed here, by the deal page's own
 * readers (quick.js), so percent against fraction and blank against zero are decided in one place. */

import { money2 } from '../kit.js';
import { toolIndex, openToolSheet } from '../toolsui.js';
import { quickFromTool, toolMeasures, measureFlags, changedPaths } from './bridge.js';
import { CHECK_FIELDS, plain, runText } from './quick.js';
import { saveQuickAsDeal } from './quickdeal.js';

const ok = (x) => typeof x === 'number' && Number.isFinite(x);
const IDS = CHECK_FIELDS.map((f) => f[0]);
const TOOL_PAGE = /\/app\/uwtool\/index\.html$/;

/** The typed text of the nine fields as strings; anything else is blank. */
const textOf = (t) => Object.fromEntries(IDS.map((id) => [id, t && typeof t[id] === 'string' ? t[id].slice(0, 40) : '']));
const measuresOf = (m) => ({ loan: ok(m?.loan) ? m.loan : null, equity: ok(m?.equity) ? m.equity : null });
const plainJson = (x) => { try { return JSON.parse(JSON.stringify(x)); } catch { return null; } };

/** The calculators that share a figure with the check, and which of its figures they take (their own input ids). */
const SEEDS = { value: ['price', 'noi'], loan: ['price', 'noi', 'ltv', 'rate', 'amort'] };

/**
 * Hand the bridge to the tool's window. Returns true when it was installed; false for any window that is not the page's own
 * tool frame (another origin, another address, a window that is not the frame element's).
 * @param {any} win the window to give it to
 * @param {{ api: any, frame: HTMLIFrameElement | null }} ctx
 */
export function installToolBridge(win, { api, frame }) {
  try {
    if (!win || !frame || frame.contentWindow !== win) return false;
    if (win.location.origin !== location.origin || !TOOL_PAGE.test(win.location.pathname)) return false;
  } catch { return false; }
  const bridge = Object.freeze({
    version: 1,
    fields: Object.freeze(CHECK_FIELDS.map(([id, label]) => Object.freeze({ id, label }))),
    /** The check's starting text from the tool's model: { text, blank: [{label, why}], tool: {loan, equity} }. */
    snapshot(input) {
      const x = plainJson(input) || {};
      const model = x.model && typeof x.model === 'object' ? x.model : {};
      const noi = ok(x.noi) ? x.noi : null;
      const defaults = x.defaults && typeof x.defaults === 'object' ? x.defaults : {};
      const { values, blank } = quickFromTool(model, { noi, defaults, changed: changedPaths(model) });
      return { text: Object.fromEntries(IDS.map((id) => [id, plain(id, values[id])])), blank, tool: toolMeasures(model, x.calc && typeof x.calc === 'object' ? x.calc : null) };
    },
    /** The engine's answer for the typed text, and the flags where the tool's own loan or equity differs by more than a cent. */
    run(text, tool) {
      const out = runText(textOf(text));
      const flags = measureFlags(out.measures, measuresOf(tool)).map((f) => ({ id: f.id, label: f.label, engine: money2(f.engine), tool: money2(f.tool) }));
      return { lines: out.lines, notes: out.notes, answers: out.answers, refused: out.refused, flags, canSave: ok(out.values.price) || ok(out.values.noi) };
    },
    /** Save as deal (a sheet asks first; Undo after). Resolves true when a deal was made or changed. */
    save(text, tool, name) {
      const out = runText(textOf(text));
      const flags = measureFlags(out.measures, measuresOf(tool));
      return saveQuickAsDeal(api, { values: out.values, record: out.record, flags, name: typeof name === 'string' && name !== 'Untitled property' ? name.slice(0, 200) : '' });
    },
    calculators() { return toolIndex().map((t) => ({ id: t.id, title: t.title, desc: t.desc, group: t.group })); },
    /** A calculator's sheet over the tool, with the check's figures where it shares one (blank stays blank). */
    openCalculator(id, text) {
      if (typeof id !== 'string') return false;
      const { values } = runText(textOf(text));
      const seed = Object.fromEntries((SEEDS[id] || []).filter((k) => ok(values[k])).map((k) => [k, values[k]]));
      return openToolSheet(id, seed);
    },
  });
  try { Object.defineProperty(win, 'MonalApp', { value: bridge, configurable: true }); win.dispatchEvent(new win.Event('monal-app-ready')); } catch { return false; }
  return true;
}
