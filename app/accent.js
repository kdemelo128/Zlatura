/* accent.js -- the New look's accent colour is the person's choice. Plum is the default; any colour they pick is
 * adjusted (hue and saturation kept, lightness moved) until text in it reads at 4.5:1 and its focus ring at 3:1 on
 * the page and cards, in the light theme and in the dark one. Pure: no DOM, no storage (look.js keeps the choice). */

const BG = {
  light: ['#F7F4EF', '#FFFDF9', '#F5F0EB', '#ECE5E0'],
  dark: ['#211E25', '#2C2730', '#342D38', '#3D3541'],
};
const INK = { light: '#352B35', dark: '#F5E9EF' };
/** Swatches offered in Settings: name, colour. The first is the default and is stored as "no choice". */
export const SWATCHES = Object.freeze([['Plum', '#78516C'], ['Blue', '#2F5D9E'], ['Green', '#2F6B4F'], ['Clay', '#A24B2B'], ['Teal', '#1F6F78'], ['Slate', '#4A5A6A']]);
export const DEFAULT_ACCENT = SWATCHES[0][1];

const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
export const parseHex = (s) => {
  const m = typeof s === 'string' && s.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${h.toUpperCase()}`;
};
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => `#${c.map(hex2).join('').toUpperCase()}`;
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (h) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
/** WCAG contrast ratio of two #RRGGBB colours. */
export const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v * (1 - t) + y[i] * t)); };

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
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

/** The worst contrast of the accent as text or ring across the pages and cards, and as the chip on its own wash. */
function worst(accent, theme, soft) { return Math.min(...BG[theme].map((b) => ratio(accent, b)), ratio(accent, soft)); }

function forTheme(hex, theme) {
  const [h, s, l0] = toHsl(hex);
  const step = theme === 'light' ? -0.01 : 0.01;
  // a very light or dark pick keeps its hue; saturation is capped so the nudged colour is not neon
  const sat = Math.min(s, 0.75);
  let l = theme === 'light' ? Math.min(l0, 0.6) : Math.max(l0, 0.55);
  let accent = fromHsl(h, sat, l), soft = mix(BG[theme][1], accent, theme === 'light' ? 0.12 : 0.2);
  let ink = INK.light;
  for (let i = 0; i < 100; i++) {
    soft = mix(BG[theme][1], accent, theme === 'light' ? 0.12 : 0.2);
    // the button's label: the page's near-white on a dark accent, near-black on a light one; the hover goes 12% toward the ink
    const cands = ['#FFF9F4', '#30212D'].map((c) => ({ c, r: Math.min(ratio(c, accent), ratio(c, mix(accent, INK[theme], 0.12))) })).sort((a, b) => b.r - a.r);
    const cand = cands[0];
    ink = cand.c;
    if (worst(accent, theme, soft) >= 4.6 && cand.r >= 4.6) break;
    l = Math.max(0.02, Math.min(0.98, l + step));
    accent = fromHsl(h, sat, l);
  }
  return { accent, ink, soft };
}

/**
 * The accent set for a chosen colour: { light, dark } each with accent, ink and soft; `adjusted` says whether the
 * pick had to move to be readable in either theme. null for a value that is not a colour.
 * @param {string} input @returns {{ hex: string, light: {accent: string, ink: string, soft: string}, dark: {accent: string, ink: string, soft: string}, adjusted: boolean } | null}
 */
export function accentFor(input) {
  const hex = parseHex(input);
  if (!hex) return null;
  const light = forTheme(hex, 'light'), dark = forTheme(hex, 'dark');
  const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 6);
  const adjusted = !(close(rgb(hex), rgb(light.accent)) || close(rgb(hex), rgb(dark.accent)));
  return { hex, light, dark, adjusted };
}
/** Every colour that must pass, for the tests: [name, foreground, background, needed]. */
export function checksFor(a) {
  const out = [];
  for (const th of ['light', 'dark']) {
    const t = a[th];
    for (const b of BG[th]) out.push([`${th} accent on ${b}`, t.accent, b, 4.5]);
    out.push([`${th} accent on its wash`, t.accent, t.soft, 4.5], [`${th} button label`, t.ink, t.accent, 4.5], [`${th} focus ring`, t.accent, BG[th][1], 3], [`${th} focus ring on page`, t.accent, BG[th][0], 3]);
  }
  return out;
}
