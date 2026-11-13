/* art.js -- the monal's drawing (monal-vector.js, shared with the underwriting tool) for the app's own modules.
 * The drawing is a classic script that sets a global; this loads it and hands back a ready SVG node. */
import './monal-vector.js';

/** One bird as an SVG element (its gradient ids start with `prefix`), or null if the drawing did not load. Parsed as XML, not HTML. */
export function birdNode(prefix) {
  const art = /** @type {any} */ (globalThis).UWMonalArt;
  if (!art) return null;
  return document.importNode(new DOMParser().parseFromString(art.svg(prefix).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), 'image/svg+xml').documentElement, true);
}
