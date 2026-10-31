/* icons.js -- the app's one icon set, drawn to one spec. The only place an icon's shapes live.
 *
 * Spec: a 24-unit grid with the drawing inside 3 to 21; one stroke weight (SPEC.stroke); round caps
 * and joins; colour is currentColor, so an icon takes the colour of its button or text; no fills (a
 * dot is a zero-length stroke or a small ring); only <path>, <circle> and <rect>. Every icon is
 * decorative (aria-hidden): the button or the text beside it carries the name. Use icon('name', px)
 * for markup, or <svg data-icon="name"> in index.html, which hydrateIcons() fills in. tests/icons.test.js
 * holds the spec, and fails on a name that is used and missing, or drawn and never used. */

export const SPEC = Object.freeze({ viewBox: '0 0 24 24', stroke: 1.75, tags: ['path', 'circle', 'rect'] });

const dots = (xs) => xs.map((x) => `<circle cx="${x}" cy="12" r="1"/>`).join('');
const doc = '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/>';

export const ICONS = {
  // the spine: one glyph for each place in the main navigation
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-6h4v6"/>',
  deals: '<path d="M3.5 8h17v11.5h-17z"/><path d="M8.5 8V5h7v3"/><path d="M3.5 13h17"/>',
  underwrite: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/><path d="M9 12.5h6"/><path d="M9 16h1.5M13.5 16H15M9 19h1.5M13.5 19H15"/>',
  comps: '<path d="M3.5 8.5h9v11h-9z"/><path d="M11.5 4.5h9v11h-8"/>',
  tools: '<path d="M4.5 15.5l11-11 4 4-11 11z"/><path d="M8 12l2 2M11 9l2 2M14 6l1.5 1.5"/>',
  review: '<path d="M4 13l2.5-8h11L20 13v6.5H4z"/><path d="M4 13h4.5l1 2h5l1-2H20"/>',
  settings: '<path d="M4 7h9.5M18.5 7H20M4 17h3.5M12.5 17H20"/><circle cx="16" cy="7" r="2.3"/><circle cx="10" cy="17" r="2.3"/>',
  contacts: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5"/>',
  // actions
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  more: dots([5.5, 12, 18.5]),
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  undo: '<path d="M9 6.5L4.5 11 9 15.5"/><path d="M4.5 11H14a5 5 0 0 1 0 10h-2"/>',
  redo: '<path d="M15 6.5l4.5 4.5-4.5 4.5"/><path d="M19.5 11H10a5 5 0 0 0 0 10h2"/>',
  rotate: '<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4.5V8h-3.5"/>',
  swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7"/><path d="M7 7l1 13h8l1-13"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  print: '<path d="M7 9V3.5h10V9"/><path d="M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2"/><path d="M7 14h10v6.5H7z"/>',
  save: '<path d="M5 3.5h11l3 3v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M8 3.5v5h7M8 20.5v-6h8v6"/>',
  export: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  upload: '<path d="M12 16V4M7.5 8.5L12 4l4.5 4.5"/><path d="M5 19.5h14"/>',
  share: '<path d="M12 15V4M8 7.5L12 4l4 3.5"/><path d="M7 10.5H5.5v9h13v-9H17"/>',
  // direction
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9.5 6l6 6-6 6"/>',
  up: '<path d="M12 19V5M6.5 10.5L12 5l5.5 5.5"/>',
  down: '<path d="M12 5v14M6.5 13.5L12 19l5.5-5.5"/>',
  'arrow-right': '<path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5"/>',
  // things
  calendar: '<path d="M4 6h16v14H4z"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  'file-text': `${doc}<path d="M9 12.5h6M9 16.5h6"/>`,
  'file-check': `${doc}<path d="M9.5 14.5l2 2 3.5-3.5"/>`,
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M9.5 9.5v10"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 9h8M8 12.5h8M8 16h5"/>',
  camera: '<path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  pin: '<path d="M12 20.5s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0c0 5.1-6.5 10.5-6.5 10.5z"/><circle cx="12" cy="10" r="2.3"/>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  shield: '<path d="M12 3.5l7 2.8v5.2c0 4.3-2.9 7.7-7 9-4.1-1.3-7-4.7-7-9V6.3z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  sparkle: '<path d="M11 4l1.7 4.8 4.8 1.7-4.8 1.7L11 17l-1.7-4.8-4.8-1.7 4.8-1.7z"/><path d="M18 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  chat: '<path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.3A7.5 7.5 0 1 1 20 11.5z"/>',
  nodes: '<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="12" r="2.2"/><circle cx="6" cy="18" r="2.2"/><path d="M8 6.8l7.8 4.2M8 17.2l7.8-4.2"/>',
  // light, dark and system theme
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  // the calculators in Tools: a figure each tool is known by
  trend: '<path d="M3.5 17l5.5-5.5 3.5 3.5L20.5 7"/><path d="M15 7h5.5v5.5"/>',
  bars: '<path d="M5 20v-7M9.5 20V5M14 20v-9M18.5 20V9"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/>',
  dollar: '<path d="M12 3.5v17"/><path d="M16.5 7.5H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7.5"/>',
  steps: '<path d="M3.5 20.5H8v-5h4.5v-5H17v-6h3.5"/>',
  percent: '<circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/><path d="M18 6L6 18"/>',
};

/** Markup for one icon at a size in px. `extra` is more attributes, e.g. ' class="chev"'. */
export const icon = (name, size = 18, extra = '') => {
  const d = ICONS[name];
  if (d === undefined) return ''; // tests/icons.test.js fails on any name that is not drawn
  return `<svg width="${size}" height="${size}" viewBox="${SPEC.viewBox}" fill="none" stroke="currentColor" stroke-width="${SPEC.stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
};

/** Fill in every <svg data-icon="name"> under root (the icons written into index.html). */
export function hydrateIcons(root = document) {
  for (const s of root.querySelectorAll('svg[data-icon]')) {
    const d = ICONS[s.dataset.icon];
    if (d === undefined) continue;
    s.setAttribute('viewBox', SPEC.viewBox);
    for (const [k, v] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': String(SPEC.stroke), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
    s.innerHTML = d;
  }
}
