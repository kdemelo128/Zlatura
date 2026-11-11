// The New look's design tokens (app/styles.css, [data-look="new"]): every colour pair meets its stated
// WCAG contrast ratio, light and dark, the worst case under the glass included; Classic's block is pinned;
// fonts are vendored and cached; glass is on the floating controls only. The ratios are computed here from
// the hex values, never typed in (docs/proposals/ui-filler-design-language.md sections 1 and 2).
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

// [foreground, background, minimum]: 4.5 for text, 3 for borders, edges and marks
const PAIRS = [];
for (const fg of ['--ink', '--muted', '--faint']) for (const bg of ['--bg', '--surface', '--surface-2', '--accent-soft']) PAIRS.push([fg, bg, 4.5]);
for (const fg of ['--accent', '--good', '--warn', '--critical']) for (const bg of ['--bg', '--surface']) PAIRS.push([fg, bg, 4.5]);
PAIRS.push(['--good', '--good-soft', 4.5], ['--warn', '--warn-soft', 4.5], ['--critical', '--critical-soft', 4.5], ['--accent', '--accent-soft', 4.5]);
for (const fg of ['--sale', '--list', '--trend']) PAIRS.push([fg, '--surface', 4.5]);
PAIRS.push(['--accent-ink', '--accent', 4.5], ['--primary-ink', '--primary', 4.5]);
for (const i of [1, 2, 3, 4]) PAIRS.push([`--tone-${i}`, `--wash-${i}`, 4.5]);
for (const fg of ['--line-strong', '--edge']) for (const bg of ['--bg', '--surface', '--surface-2']) PAIRS.push([fg, bg, 3]);
for (const bg of ['--bg', '--surface']) PAIRS.push(['--accent', bg, 3]); // the focus ring

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

test('New look tokens: the ratios the proposal states (section 1) are the ones computed', () => {
  const want = {
    light: { '--ink': [15.72, '--bg'], '--accent': [6.17, '--surface'], '--good': [5.35, '--surface'], '--warn': [6.10, '--surface'], '--critical': [5.45, '--surface'] },
    dark: { '--ink': [17.32, '--bg'], '--accent': [6.53, '--surface'] },
  };
  for (const [theme, rows] of Object.entries(want)) {
    const t = THEMES[theme]();
    for (const [k, [v, on]] of Object.entries(rows)) assert.ok(Math.abs(ratio(t[k], t[on]) - v) < 0.011, `${theme} ${k} on ${on}: ${ratio(t[k], t[on]).toFixed(2)}, stated ${v}`);
  }
  assert.ok(Math.abs(ratio(THEMES.light()['--accent-ink'], THEMES.light()['--accent']) - 6.17) < 0.011);
  assert.ok(Math.abs(ratio(THEMES.dark()['--accent-ink'], THEMES.dark()['--accent']) - 7.30) < 0.011);
});

test('New look tokens: the system-dark rule and the chosen-dark rule set the same names to the same values; light sets every one of them', () => {
  const [a, b, l] = [THEMES['dark (system)'](), THEMES.dark(), THEMES.light()];
  assert.deepEqual(a, b);
  for (const k of Object.keys(a)) assert.ok(k in l, `light has no ${k}`);
});

test('New look tokens: type, radius and elevation follow the proposal', () => {
  const t = THEMES.light();
  assert.match(t['--ui'], /^"IBM Plex Sans",/, 'Plex Sans comes before the system font');
  assert.equal(t['--serif'], 'var(--ui)', 'one family: the serif falls out of the New look');
  assert.match(t['--mono'], /^"IBM Plex Mono",/);
  assert.deepEqual([t['--fs-cap'], t['--fs-small'], t['--fs-body'], t['--fs-h3'], t['--fs-h2'], t['--fs-fig']], ['.8125rem', '.9375rem', '1rem', '1.1875rem', '1.5rem', '1.875rem']);
  const allowed = new Set(['.8125rem', '.9375rem', '1rem', '1.1875rem', '1.5rem', '1.875rem']);
  for (const k of Object.keys(t).filter((x) => /^--t-\d+$/.test(x))) assert.ok(allowed.has(t[k]), `${k}: ${t[k]} is off the type scale or under 13 px`);
  assert.deepEqual([t['--r-sm'], t['--r-md'], t['--r'], t['--r-lg'], t['--r-pill']], ['8px', '12px', '16px', '22px', '999px']);
  assert.equal(t['--shadow'], 'none'); assert.equal(t['--shadow-md'], 'none');
  assert.match(t['--shadow-lg'], /^0 \d+px \d+px rgba/, 'one floating shadow');
  assert.equal(t['--d3'], '260ms'); assert.equal(t['--blur'], '20px');
  assert.equal(t['--line-strong'], t['--edge'], 'input borders use the 3:1 edge');
  for (const k of ['--glass', '--glint', '--tone-1', '--wash-4', '--edge']) for (const th of Object.values(THEMES)) assert.ok(k in th(), `${k} is set in every theme`);
});

// ------------------------------------------------------------ the New look block, rule by rule
const START = css.indexOf('New look tokens');
const END = css.indexOf('@media (min-width: 960px) { :root { --gutter');
const block = css.slice(START, END);
/** The innermost rules of a stylesheet slice: [selectors, body]. An at-rule's own prelude is not part of the selector. */
const rulesOf = (src) => [...src.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].replace(/^\s*@[^{]*$/, '').trim().split(',').map((s) => s.replace(/\s+/g, ' ').trim()), m[2]]);
const GLASS = new Set([':root[data-look="new"] .stepper-bar', ':root[data-look="new"] .cmdk-card', ':root[data-look="new"] .toast', ':root[data-look="new"] .tip-bubble']);

test('New look: no gradient, and the bars stay solid', () => {
  assert.ok(START > 0 && END > START);
  assert.doesNotMatch(block, /gradient/);
  assert.match(block, /\[data-look="new"\] \.appbar, :root\[data-look="new"\] \.tabbar \{[^}]*backdrop-filter: none/);
  for (const m of [THEMES.light(), THEMES.dark()]) assert.match(m['--bar'], /^#[0-9A-Fa-f]{6}$/, 'the bar colour is opaque');
});

test('New look glass: the listed floating controls only, one blur, never a table, bar, card or sheet', () => {
  const blurred = rulesOf(block).filter(([, body]) => /blur\(/.test(body) && !/^\s*--/.test(body));
  assert.ok(blurred.length >= 1, 'the glass rule exists');
  const sels = new Set();
  for (const [ss, body] of blurred) {
    for (const s of ss) { assert.ok(GLASS.has(s), `${s} may not be glass`); sels.add(s); }
    assert.match(body, /blur\(var\(--glass-blur, var\(--blur\)\)\)/, 'the blur is the one token');
    assert.doesNotMatch(body, /blur\(\d/, 'no literal blur values');
  }
  assert.equal(sels.size, GLASS.size, 'all four floating controls are glass');
  assert.doesNotMatch(block, /(table|\bt[dh]\b|\.ctable|\.mini|\.rr-grid|\.appbar|\.tabbar|\.sheet-card|\.card)[^{}]*\{[^}]*(backdrop-filter: blur|var\(--glass)/);
  // wrapped so a browser that cannot blur keeps the solid controls
  assert.match(block, /@supports \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{\s*:root\[data-look="new"\] \.stepper-bar/);
});

test('New look glass: opaque to 92% at least, and legible over the worst backdrop', () => {
  const over = (rgba, bg) => { const m = rgba.match(/rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/); assert.ok(m, `${rgba} is rgba()`); const a = +m[4]; assert.ok(a >= 0.92, `glass ${rgba} is ${a * 100}% opaque, needs 92%`); return '#' + [1, 2, 3].map((i) => Math.round(+m[i] * a + bg * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase(); };
  for (const [name, get] of Object.entries(THEMES)) {
    const t = get();
    for (const bg of [0, 255]) { // black or white scrolling underneath: the two extremes
      const g = over(t['--glass'], bg);
      for (const fg of ['--ink', '--muted', '--faint', '--accent']) assert.ok(ratio(t[fg], g) >= 4.5, `${name}: ${fg} on glass over ${bg ? 'white' : 'black'} is ${ratio(t[fg], g).toFixed(2)}:1`);
    }
  }
});

test('New look glass: solid for less transparency, more contrast and the Solid controls switch', () => {
  for (const sel of ['@media (prefers-reduced-transparency: reduce) { :root[data-look="new"]', '@media (prefers-contrast: more) { :root[data-look="new"]', ':root[data-look="new"][data-solid]']) {
    const i = block.indexOf(sel);
    assert.ok(i > 0, `${sel} exists`);
    assert.match(block.slice(i, block.indexOf('}', i)), /--glass-bg: var\(--surface\); --glass-blur: 0px/, sel);
  }
});

test('New look: sentence case and a 13 px floor (the Classic rules that break either are undone)', () => {
  assert.doesNotMatch(block, /text-transform: uppercase|letter-spacing: \.0[1-9]/, 'no capitals in the New look block');
  const i = block.indexOf('.view-head .eyebrow-line');
  const list = block.slice(i, block.indexOf(') { font-size: var(--fs-cap)', i));
  assert.match(block, /\) \{ font-size: var\(--fs-cap\); text-transform: none; letter-spacing: 0; \}/);
  const classic = css.slice(0, START) + css.slice(END);
  // left alone on purpose: the tab bar's 11 px labels (addendum 3.2), the chart's SVG labels, print
  const KEEP = new Set(['.tab', '.tab .badge', '.chart .axis', '.chart .lbl', '.chart .val', '.tl-label']);
  const missing = [];
  for (const [ss, body] of rulesOf(classic)) {
    const up = /text-transform:\s*uppercase/.test(body);
    const small = [...body.matchAll(/font(?:-size)?:\s*([^;]*)/g)].some((f) => [...f[1].matchAll(/(?<![\d.])(\d+(?:\.\d+)?)px/g)].some((x) => +x[1] < 13));
    if (!up && !small) continue;
    for (const s of ss) if (!s.startsWith('.ps-') && !KEEP.has(s) && !list.includes(s)) missing.push(s);
  }
  assert.deepEqual(missing, [], 'these Classic rules capitalise or size a label under 13 px and are not undone in the New look');
});

test('New look: focus ring is 3 px, targets are 44 px on touch, motion stops on request', () => {
  assert.match(block, /\[data-look="new"\] :focus-visible \{ outline: 3px solid var\(--accent\)/);
  assert.match(block, /@media \(pointer: coarse\) \{\s*:root\[data-look="new"\] \{ --ctl-h: 44px; --ctl-h-sm: 44px; \}/);
  assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{[^@]*transform: none/);
  assert.match(block, /\.btn:active:not\(:disabled\) \{ transform: scale\(\.97\)/);
});

test('Classic tokens are unchanged, and so is every byte of Classic\'s token block', () => {
  const a = css.indexOf('/* ================================================================ tokens */');
  const b = css.indexOf('/* ====================================================== New look tokens');
  assert.equal(crypto.createHash('sha256').update(css.slice(a, b)).digest('hex'), '08f056c7bb4aa40d604dd99dc9b59a0d727db5bba234655f4ef31ebf49dc1869', "Classic's :root block changed (re-pinned in 4.7.132: px font sizes now multiply by --ts, unset at 100%, so computed sizes are identical)");
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

test('IBM Plex Sans and Mono: vendored with licence and checksum, cached for offline use, in the New look only', () => {
  const third = read('THIRD_PARTY.md'), sw = read('sw.js');
  const files = [['sans', 400], ['sans', 500], ['sans', 600], ['mono', 400], ['mono', 500]];
  for (const [kind, w] of files) {
    const f = `fonts/ibm-plex-${kind}-latin-${w}-normal.woff2`;
    const sha = crypto.createHash('sha256').update(fs.readFileSync(new URL(f, ROOT))).digest('hex');
    assert.ok(third.includes(`${sha}  ${f}`), `THIRD_PARTY.md lists ${f} with its SHA-256`);
    assert.ok(sw.includes(`'${f}'`), `${f} is precached`);
    assert.match(css, new RegExp(`font-family: "IBM Plex ${kind === 'sans' ? 'Sans' : 'Mono'}"; font-style: normal; font-weight: ${w}; font-display: swap; src: url\\("\\.\\./${f}"\\)`));
  }
  for (const l of ['ibm-plex-sans-5.3.0.OFL-1.1.LICENSE', 'ibm-plex-mono-5.3.0.OFL-1.1.LICENSE']) assert.match(read(`vendor/licenses/${l}`), /SIL Open Font License, Version 1\.1/);
  // Classic never names Plex, so it never downloads it
  const classic = css.slice(0, START) + css.slice(END);
  assert.doesNotMatch(classic.replace(/@font-face[^}]*\}/g, ''), /Plex/);
  // the content policy is unchanged: fonts come from this origin already, no font-src needed
  assert.match(read('index.html'), /content="object-src 'none'; base-uri 'self'; form-action 'none'"/);
});

test('Solid controls: a device preference, applied before paint, never in a backup', async () => {
  assert.match(read('index.html'), /getItem\('zlatura\.solid'\) === '1'\) document\.documentElement\.dataset\.solid = '1'/);
  assert.match(read('app/look.js'), /SOLID_KEY = 'zlatura\.solid'/);
  assert.match(read('app/settings.js'), /'Solid controls'/);
  const { LOCAL_KEYS } = await import('../app/backup.js');
  assert.ok(!LOCAL_KEYS.includes('zlatura.solid') && !LOCAL_KEYS.includes('zlatura.look'));
});

test('The base components are exported by kit.js', () => {
  const kit = read('app/kit.js');
  for (const n of ['stepper', 'dropZone', 'statusChip', 'notice']) assert.match(kit, new RegExp(`export (function|const) ${n}\\b`));
});
