// The New look's design tokens (app/styles.css, [data-look="new"]): every colour pair meets its stated
// WCAG contrast ratio, light and dark; Classic's tokens are unchanged; fonts are vendored and cached;
// the bars are solid. The ratios are computed here from the hex values, never typed in.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const css = read('app/styles.css');

/** Custom properties declared in the first rule whose selector is exactly `selector`, inside `src`. */
function tokens(src, selector) {
  const i = src.indexOf(`${selector} {`);
  assert.ok(i >= 0, `no rule for ${selector}`);
  const ends = [src.indexOf('\n  }', i), src.indexOf('\n}', i)].filter((n) => n > 0);
  const body = src.slice(i + selector.length + 2, Math.min(...ends));
  const out = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const LIGHT = ':root[data-look="new"]';
const DARK_SYSTEM = ':root[data-look="new"]:not([data-theme="light"])';
const DARK_SET = ':root[data-look="new"][data-theme="dark"]';
const THEMES = { light: () => tokens(css, LIGHT), dark: () => tokens(css, DARK_SET), 'dark (system)': () => tokens(css, DARK_SYSTEM) };

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, background, minimum]: 4.5 for text, 3 for borders and marks
const PAIRS = [];
for (const fg of ['--ink', '--muted', '--faint']) for (const bg of ['--bg', '--surface', '--surface-2']) PAIRS.push([fg, bg, 4.5]);
for (const fg of ['--accent', '--good', '--warn', '--critical']) for (const bg of ['--bg', '--surface']) PAIRS.push([fg, bg, 4.5]);
for (const fg of ['--sale', '--list', '--trend']) PAIRS.push([fg, '--surface', 4.5]);
PAIRS.push(['--accent-ink', '--accent', 4.5], ['--primary-ink', '--primary', 4.5]);
for (const bg of ['--bg', '--surface']) PAIRS.push(['--line-strong', bg, 3]);

for (const [name, get] of Object.entries(THEMES)) {
  test(`New look tokens, ${name}: every colour pair meets its contrast ratio`, () => {
    const t = get();
    for (const [fg, bg, min] of PAIRS) {
      assert.match(t[fg] || '', /^#[0-9A-Fa-f]{6}$/, `${fg} is a hex colour`);
      assert.match(t[bg] || '', /^#[0-9A-Fa-f]{6}$/, `${bg} is a hex colour`);
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= min, `${fg} ${t[fg]} on ${bg} ${t[bg]} is ${r.toFixed(2)}:1, needs ${min}:1`);
    }
  });
}

test('New look tokens: the ratios the addendum states (3.3) are the ones computed', () => {
  const want = {
    light: { '--ink': 17.82, '--muted': 7.43, '--faint': 5.72, '--accent': 5.52, '--line-strong': 3.31, '--good': 5.82, '--warn': 6.19, '--critical': 6.57, '--sale': 5.19, '--list': 5.02, '--trend': 5.86 },
    dark: { '--ink': 14.48, '--muted': 7.98, '--faint': 5.85, '--accent': 8.97, '--line-strong': 3.80, '--good': 8.57, '--warn': 8.86, '--critical': 6.87, '--sale': 7.57, '--list': 7.75, '--trend': 6.32 },
  };
  for (const [theme, rows] of Object.entries(want)) {
    const t = THEMES[theme]();
    for (const [k, v] of Object.entries(rows)) assert.ok(Math.abs(ratio(t[k], t['--surface']) - v) < 0.011, `${theme} ${k} on surface: ${ratio(t[k], t['--surface']).toFixed(2)}, stated ${v}`);
  }
});

test('New look tokens: the system-dark rule and the chosen-dark rule set the same names to the same values; light sets every one of them', () => {
  const [a, b, l] = [THEMES['dark (system)'](), THEMES.dark(), THEMES.light()];
  assert.deepEqual(a, b);
  for (const k of Object.keys(a)) assert.ok(k in l, `light has no ${k}`);
});

test('New look tokens: type, radius and elevation follow the addendum', () => {
  const t = THEMES.light();
  assert.match(t['--ui'], /^"Public Sans",/, 'our sans comes before the system font');
  assert.match(t['--serif'], /^"Zlatura Serif",/, 'our serif comes before the system serif');
  assert.deepEqual([t['--fs-cap'], t['--fs-small'], t['--fs-body'], t['--fs-h3'], t['--fs-h2'], t['--fs-fig']], ['.8125rem', '.9375rem', '1rem', '1.1875rem', '1.5rem', '1.875rem']);
  const allowed = new Set(['.6875rem', '.8125rem', '.9375rem', '1rem', '1.1875rem', '1.5rem', '1.875rem']);
  for (const k of Object.keys(t).filter((x) => /^--t-\d+$/.test(x))) assert.ok(allowed.has(t[k]), `${k}: ${t[k]} is off the type scale`);
  assert.deepEqual([t['--r-sm'], t['--r-md'], t['--r']], ['8px', '10px', '14px']);
  assert.equal(t['--shadow'], 'none'); assert.equal(t['--shadow-md'], 'none');
  assert.match(t['--shadow-lg'], /^0 \d+px \d+px rgba/, 'one floating shadow');
});

test('New look: no gradient, no translucent or blurred bars', () => {
  const start = css.indexOf('New look tokens');
  const end = css.indexOf('@media (min-width: 960px) { :root { --gutter');
  const block = css.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(block, /gradient/);
  assert.match(block, /\[data-look="new"\] \.appbar, :root\[data-look="new"\] \.tabbar \{[^}]*backdrop-filter: none/);
  for (const m of [THEMES.light(), THEMES.dark()]) assert.match(m['--bar'], /^#[0-9A-Fa-f]{6}$/, 'the bar colour is opaque');
});

test('Classic tokens are unchanged', () => {
  const snap = JSON.parse(read('tests/look-classic-tokens.json'));
  for (const [sel, want] of Object.entries(snap)) assert.deepEqual(tokens(css, sel), want, `Classic ${sel}`);
});

test('Source Serif 4: vendored with its licence and checksum, cached for offline use, swapped in', () => {
  const third = read('THIRD_PARTY.md'), sw = read('sw.js');
  for (const w of [400, 600]) {
    const f = `fonts/source-serif-4-latin-${w}-normal.woff2`;
    const sha = crypto.createHash('sha256').update(fs.readFileSync(new URL(f, ROOT))).digest('hex');
    assert.ok(third.includes(`${sha}  ${f}`), `THIRD_PARTY.md lists ${f} with its SHA-256`);
    assert.ok(sw.includes(`'${f}'`), `${f} is precached`);
    assert.match(css, new RegExp(`font-family: "Zlatura Serif"; font-style: normal; font-weight: ${w}; font-display: swap; src: url\\("\\.\\./${f}"\\)`));
  }
  assert.ok(fs.existsSync(new URL('vendor/licenses/source-serif-4-5.3.1.OFL-1.1.LICENSE', ROOT)));
  assert.ok(sw.includes("'app/look.js'"), 'look.js is precached');
});

test('The look is Classic unless the person turned the New look on', () => {
  const html = read('index.html');
  assert.match(html, /getItem\('zlatura\.look'\) === 'new'\) document\.documentElement\.dataset\.look = 'new'/);
  assert.match(read('app/look.js'), /=== 'new' \? 'new' : 'classic'/);
});
