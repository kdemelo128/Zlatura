/* shell.js -- mockup only. One icon set, one nav list, one brand record.
 * The brand (name and mark) lives here once, so a rename touches one record. */
const BRAND = {
  name: 'Zlatura',
  // the existing mark (docs/brand/logo-*.svg), drawn once
  mark: '<svg viewBox="0 0 26 26" aria-hidden="true"><rect x="1" y="1" width="24" height="24" rx="6" fill="var(--ink)"/><path d="M8.2 8.4h9.6L8.2 17.6h9.6M10.4 13h5.2" fill="none" stroke="var(--accent)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/* 24-unit grid, 1.75 stroke, round caps and joins, no fills. */
const ICONS = {
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-6h4v6"/>',
  deals: '<path d="M3.5 8h17v11.5h-17z"/><path d="M8.5 8V5h7v3"/><path d="M3.5 13h17"/>',
  underwrite: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/><path d="M9 12.5h6"/><path d="M9 16h1.5M13.5 16H15M9 19h1.5M13.5 19H15"/>',
  comps: '<path d="M3.5 8.5h9v11h-9z"/><path d="M11.5 4.5h9v11h-8"/>',
  more: '<path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke-width="2.6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  undo: '<path d="M9 6.5L4.5 11 9 15.5"/><path d="M4.5 11H14a5 5 0 0 1 0 10h-2"/>',
  redo: '<path d="M15 6.5l4.5 4.5-4.5 4.5"/><path d="M19.5 11H10a5 5 0 0 0 0 10h2"/>',
  review: '<path d="M4 13l2.5-8h11L20 13v6.5H4z"/><path d="M4 13h4.5l1 2h5l1-2H20"/>',
  contacts: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5"/>',
  templates: '<path d="M4 4h16v16H4z"/><path d="M4 9h16M10 9v11"/>',
  tools: '<path d="M4.5 15.5l11-11 4 4-11 11z"/><path d="M8 12l2 2M11 9l2 2M14 6l1.5 1.5"/>',
  documents: '<path d="M8.5 3.5H15l4 4v10H8.5z"/><path d="M15 3.5v4h4"/><path d="M5 7.5v13h10"/>',
  settings: '<path d="M4 7h9.5M18.5 7H20M4 17h3.5M12.5 17H20"/><circle cx="16" cy="7" r="2.3"/><circle cx="10" cy="17" r="2.3"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.6a2.4 2.4 0 1 1 3.3 2.2c-.7.3-1 .8-1 1.5v.3"/><path d="M12 16.8h.01" stroke-width="2.4"/>',
  rotate: '<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4.5V8h-3.5"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7"/><path d="M7 7l1 13h8l1-13"/>',
  up: '<path d="M12 19V5M6.5 10.5L12 5l5.5 5.5"/>',
  down: '<path d="M12 5v14M6.5 13.5L12 19l5.5-5.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><path d="M12 17h.01" stroke-width="2.4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><path d="M4 4l16 16"/>',
  merge: '<path d="M7 4v4c0 2.5 5 4 5 7v5M17 4v4c0 2.5-5 4-5 7"/>',
  split: '<path d="M12 4v5c0 2.5-5 4-5 7v4M12 9c0 2.5 5 4 5 7v4"/>',
  chev: '<path d="M9.5 6l6 6-6 6"/>',
  export: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  calendar: '<path d="M4 6h16v14H4z"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/>',
  workspace: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4z"/><path d="M13 16.5h7"/>',
};
const icon = (n, label) => `<svg class="i" viewBox="0 0 24 24" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${ICONS[n]}</svg>`;

/* one nav list: the phone bar takes the five spine items; the rail shows
   them plus the modules the broker has not hidden (My workspace). */
const SPINE = [['home', 'Home'], ['deals', 'Deals'], ['underwrite', 'Underwrite'], ['comps', 'Comps'], ['more', 'More']];
const RAIL = [['home', 'Home'], ['deals', 'Deals'], ['underwrite', 'Underwrite'], ['comps', 'Comps and Market'], ['tools', 'Tools'], ['review', 'Review', '3'], ['contacts', 'Contacts'], ['templates', 'Templates']];
const MODULES = [['documents', 'Documents']];

function shell(current, opts = {}) {
  const q = new URLSearchParams(location.search);
  if (q.get('theme')) document.documentElement.dataset.theme = q.get('theme');
  document.querySelectorAll('[data-brand]').forEach(el => { el.innerHTML = BRAND.mark + `<span>${BRAND.name}</span>`; });
  const rail = document.querySelector('.rail');
  if (rail) {
    const link = ([id, label, n]) => (n = opts.fresh ? '' : n, `<a class="nav" href="#${id}"${id === current ? ' aria-current="page"' : ''}>${icon(id)}<span>${label}</span>${n ? `<span class="n" aria-label="${n} waiting">${n}</span>` : ''}</a>`);
    rail.innerHTML = `<a class="wordmark" href="#home">${BRAND.mark}<span>${BRAND.name}</span></a>`
      + RAIL.map(link).join('')
      + `<p class="grp"><span>My workspace</span><a href="workspace.html"${current === 'workspace' ? ' aria-current="page"' : ''}>Edit</a></p>` + MODULES.map(link).join('')
      + `<div class="foot">${link(['help', 'Help'])}${link(['settings', 'Settings'])}</div>`;
  }
  const bar = document.querySelector('.bar');
  const inSpine = SPINE.some(([id]) => id === current);
  if (bar) bar.innerHTML = SPINE.map(([id, label]) => `<a href="#${id}"${id === current || (id === 'more' && !inSpine) ? ' aria-current="page"' : ''}>${icon(id)}<span>${label}</span>${id === 'more' && !opts.fresh ? '<span class="n" aria-label="3 to review">3</span>' : ''}</a>`).join('');
  document.querySelectorAll('[data-i]').forEach(el => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.i, el.dataset.label)); });
}
