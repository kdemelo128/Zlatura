/* The tool's accent colour. One choice, three sources, in this order:
 *   1. the tool's own choice (Display & feel: a swatch or a custom colour, kept in uw-interface);
 *   2. otherwise the accent the app itself has chosen (the app keeps it in zlatura.accent, same origin and same device;
 *      this reads it and listens for it changing, so the tool follows at once);
 *   3. otherwise the tool's own colours, untouched.
 * A chosen colour is moved in lightness until text in it, and the accent as text or a focus ring, reads at 4.5:1 or more on
 * the tool's pages and cards in the light theme and in the dark one (the same rule the app uses). It is applied as four
 * custom properties and a data attribute; polish.css turns them into --accent, --accent-ink and --uw-accent per theme.
 * Nothing here touches the model or any amount. */
(() => {
  'use strict';
  const root = document.documentElement;
  const APP_KEY = 'zlatura.accent';
  const SWATCHES = Object.freeze([['Blue', '#1961B3'], ['Plum', '#78516C'], ['Green', '#2F6B4F'], ['Clay', '#A24B2B'], ['Teal', '#1F6F78'], ['Slate', '#4A5A6A']]);
  const BG = { light: ['#FFFFFF', '#FFFDF9', '#F5F0EB'], dark: ['#111113', '#1C1C1F', '#26262A'] };
  const HEX = /^#[0-9a-f]{6}$/i;
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hex = (c) => '#' + c.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('').toUpperCase();
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (h) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function toHsl(h) {
    const [r, g, b] = rgb(h).map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const hu = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [hu * 60, s, l];
  }
  function fromHsl(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return hex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
  }
  /** The pick for one theme: { accent, ink }, moved until it reads on every background and carries its label. */
  function fit(pick, theme) {
    const [h, s0, l0] = toHsl(pick), s = Math.min(s0, 0.75);
    let l = theme === 'light' ? Math.min(l0, 0.6) : Math.max(l0, 0.55), accent = fromHsl(h, s, l), ink = '#FFFFFF';
    for (let i = 0; i < 100; i++) {
      const best = ['#FFFFFF', '#101012'].map((c) => [c, ratio(c, accent)]).sort((a, b) => b[1] - a[1])[0];
      ink = best[0];
      if (BG[theme].every((b) => ratio(accent, b) >= 4.6) && best[1] >= 4.6) break;
      l = Math.max(0.02, Math.min(0.98, l + (theme === 'light' ? -0.01 : 0.01)));
      accent = fromHsl(h, s, l);
    }
    return { accent, ink };
  }
  /** The app's own accent as the tool's four values, or null when the app has not chosen one. */
  function appAccent() {
    try {
      const a = JSON.parse(localStorage.getItem(APP_KEY) || 'null');
      if (a && Array.isArray(a.c) && a.c.length === 6 && a.c.every((x) => typeof x === 'string' && HEX.test(x))) return { la: a.c[0], li: a.c[1], da: a.c[3], di: a.c[4] };
    } catch { /* no choice, or unreadable */ }
    return null;
  }
  let own = '';
  const clear = () => { for (const n of ['la', 'li', 'da', 'di']) root.style.removeProperty('--tl-' + n); delete root.dataset.toolAccent; };
  function apply() {
    let v = null, source = '';
    if (HEX.test(own)) { const l = fit(own, 'light'), d = fit(own, 'dark'); v = { la: l.accent, li: l.ink, da: d.accent, di: d.ink }; source = 'own'; }
    else if ((v = appAccent())) source = 'app';
    if (!v) { clear(); return; }
    for (const n of ['la', 'li', 'da', 'di']) root.style.setProperty('--tl-' + n, v[n]);
    root.dataset.toolAccent = source;
  }
  /** The colour the tool is using now, for the current theme (the favicon and the swatch row read it). */
  const current = () => (root.dataset.theme === 'dark' ? root.style.getPropertyValue('--tl-da') : root.style.getPropertyValue('--tl-la')) || getComputedStyle(root).getPropertyValue('--accent').trim() || '#78516C';
  window.UWAccent = Object.freeze({
    SWATCHES, fit, ratio, current,
    /** Set the tool's own choice ('' follows the app) and apply it. */
    set(hexValue) { own = HEX.test(hexValue) ? hexValue.toUpperCase() : ''; apply(); },
    source: () => root.dataset.toolAccent || '',
  });
  // a choice made in the app while the tool is open: the page writes zlatura.accent, this window hears it
  window.addEventListener('storage', (e) => { if (e.key === APP_KEY || e.key === null) apply(); });
  try { const p = JSON.parse(localStorage.getItem('uw-interface') || '{}'); own = p && HEX.test(p.accent) && p.accent.toUpperCase() !== '#755099' ? p.accent.toUpperCase() : ''; } catch { own = ''; }
  apply();
})();
