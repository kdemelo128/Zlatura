/* The DOM sink guard (security checklist ID 2, triage S4). Untrusted text (a tenant name, a rent roll cell, OM text,
 * a file name, a CSV cell, AI output, an imported project or backup) must never reach an HTML sink or a script
 * sink. This test parses every app/**.js file and sw.js with the TypeScript parser (already a devDependency; so
 * comments and strings are never mistaken for code) and fails on any sink that is not in the reviewed ALLOW list
 * below. A new sink in a PR therefore fails here until somebody reads it and adds a line with the reason.
 *
 * Sinks found: innerHTML, outerHTML, insertAdjacentHTML, srcdoc, createContextualFragment (as a property name, in
 * a call, an assignment or an object literal, with a string key too); document.write/writeln; eval, Function,
 * new Function; setTimeout/setInterval given a string; dynamic import() and importScripts() of a non-literal;
 * DOMParser.parseFromString; assignments to .href/.src/.action/.formAction, to location (.href, .assign, .replace),
 * window.open, and setAttribute of href/src/srcset/action/formaction/on*; { href|src|action } inside Object.assign.
 *
 * Blind spots, honestly: aliasing (const w = el.innerHTML; w.x ... or const set = Element.prototype.insertAdjacentHTML),
 * computed access with a variable key (el[name] = ...), HTML built in a template literal and then handed to a
 * sink the scan does not know, a sink reached through a library (vendor/ is not scanned), and code in a string passed
 * to something other than the functions above. The browser flow tests/e2e/hostile-flow.mjs and sink-flow.mjs
 * cover those from the other side by typing hostile text and checking that nothing runs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const list = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? (e.name === 'vendor' ? [] : list(`${dir}/${e.name}`)) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []));

const HTML_NAMES = new Set(['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'srcdoc', 'createContextualFragment']);
const URL_PROPS = new Set(['href', 'src', 'action', 'formAction']);
const URL_ATTRS = /^(href|src|srcset|action|formaction|xlink:href|on.*)$/i;
const nameOf = (n) => (n && (ts.isIdentifier(n) || ts.isStringLiteralLike(n)) ? n.text : null);
const isLiteralText = (n) => !!n && (ts.isStringLiteralLike(n));

/** Every sink in one source text: [{ line, rule, text }]. */
export function scan(source, file = 'x.js') {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const hits = [];
  const lines = source.split('\n');
  const add = (node, rule) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    hits.push({ line: line + 1, rule, text: lines[line].trim() });
  };
  const calleeName = (c) => (ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : null);
  const isLocation = (n) => (ts.isIdentifier(n) && n.text === 'location') || (ts.isPropertyAccessExpression(n) && n.name.text === 'location');
  const visit = (n) => {
    // property names: x.innerHTML, x['innerHTML'], { innerHTML: ... }, { innerHTML }
    if (ts.isPropertyAccessExpression(n) && HTML_NAMES.has(n.name.text)) add(n, `html:${n.name.text}`);
    else if (ts.isElementAccessExpression(n) && isLiteralText(n.argumentExpression) && HTML_NAMES.has(n.argumentExpression.text)) add(n, `html:${n.argumentExpression.text}`);
    else if ((ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) && HTML_NAMES.has(nameOf(n.name))) add(n, `html:${nameOf(n.name)}`);

    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const c = n.expression; const name = calleeName(c); const args = n.arguments || [];
      if (name === 'eval' || name === 'Function') add(n, `script:${name}`);
      else if ((name === 'write' || name === 'writeln') && ts.isPropertyAccessExpression(c) && /^(document|doc)$/.test(c.expression.getText(sf))) add(n, 'script:document.write');
      else if ((name === 'setTimeout' || name === 'setInterval') && args[0] && !ts.isFunctionLike(args[0]) && !ts.isIdentifier(args[0]) && !ts.isPropertyAccessExpression(args[0])) add(n, `script:${name}-string`);
      else if (name === 'importScripts' && args.some((a) => !isLiteralText(a))) add(n, 'script:importScripts');
      else if (c.kind === ts.SyntaxKind.ImportKeyword && args[0] && !isLiteralText(args[0])) add(n, 'script:import()');
      else if (name === 'parseFromString') add(n, 'html:parseFromString');
      else if (name === 'open' && ts.isPropertyAccessExpression(c) && c.expression.getText(sf) === 'window') add(n, 'nav:window.open');
      else if ((name === 'assign' || name === 'replace') && ts.isPropertyAccessExpression(c) && isLocation(c.expression)) add(n, `nav:location.${name}`);
      else if (name === 'setAttribute' && args[0] && (!isLiteralText(args[0]) || URL_ATTRS.test(args[0].text))) add(n, 'attr:setAttribute-url');
      else if (name === 'assign' && ts.isPropertyAccessExpression(c) && c.expression.getText(sf) === 'Object') {
        for (const a of args.slice(1)) {
          if (!ts.isObjectLiteralExpression(a)) continue;
          for (const p of a.properties) if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && URL_PROPS.has(nameOf(p.name))) add(p, `url:Object.assign-${nameOf(p.name)}`);
        }
      }
    }
    // assignments: x.href = ..., location = ..., location.href = ...
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const l = n.left;
      if (ts.isPropertyAccessExpression(l) && URL_PROPS.has(l.name.text)) add(n, `url:.${l.name.text}=`);
      else if (isLocation(l)) add(n, 'nav:location=');
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

/* The reviewed sites. `file` is exact; `re` is tested on the trimmed text of the line; `why` is the reading that was
 * done (triage section 4, re-read for this test). `n` is how many hits the entry must cover, so a second sink slipped
 * onto an allowed pattern still fails. */
const ICON = 'icon() returns markup only from the fixed ICONS table, and "" for an unknown name; size and extra are code constants';
const ALLOW = [
  // ---- fixed icon markup (class: fixed icon)
  { file: 'app/abstractui.js', re: /insertAdjacentHTML\('beforeend', icon\(/, n: 1, why: ICON },
  { file: 'app/command.js', re: /insertAdjacentHTML\('beforeend', icon\('search'/, n: 1, why: ICON },
  { file: 'app/command.js', re: /innerHTML = icon\(it\.icon \|\| 'arrow-right'/, n: 1, why: `${ICON}; it.icon is a constant on each command item` },
  { file: 'app/dateinput.js', re: /innerHTML = icon\(/, n: 1, why: ICON },
  { file: 'app/dealcrm.js', re: /innerHTML = icon\(/, n: 4, why: ICON },
  { file: 'app/dealui.js', re: /(innerHTML|insertAdjacentHTML).*icon\(/, n: 14, why: ICON },
  { file: 'app/impactui.js', re: /innerHTML = icon\(/, n: 1, why: ICON },
  { file: 'app/kit.js', re: /insertAdjacentHTML\('beforeend', icon\(it\.icon/, n: 1, why: `${ICON}; it.icon is a constant on each action-sheet item` },
  { file: 'app/libraryui.js', re: /innerHTML = icon\(/, n: 2, why: ICON },
  { file: 'app/pdfpagesui.js', re: /innerHTML = icon\(glyph/, n: 1, why: `${ICON}; glyph is an ICON constant` },
  { file: 'app/rentrollui.js', re: /innerHTML = icon\(/, n: 11, why: ICON },
  { file: 'app/settings.js', re: /innerHTML = icon\(glyph/, n: 1, why: `${ICON}; glyph is a constant of the theme list` },
  { file: 'app/toolsui.js', re: /innerHTML = icon\(/, n: 2, why: `${ICON}; t.icon is a constant of the tool table` },
  { file: 'app/ui.js', re: /innerHTML = icon\('file-text'/, n: 1, why: ICON },
  { file: 'app/ui.js', re: /^b\.innerHTML = glyph;/, n: 1, why: 'glyph is ICON_INFO, ICON_MOVE or ICON_DEL, constants made with icon() at the top of ui.js' },
  // ---- fixed SVG hydration from constants
  { file: 'app/icons.js', re: /^s\.innerHTML = d;/, n: 1, why: 'd is a path string from the ICONS table, looked up by a data-icon name that is written in index.html' },
  { file: 'app/brand.js', re: /innerHTML = /, n: 2, why: 'brand mark path data and a fixed svg string, both constants in brand.js' },
  // ---- static literal strings
  { file: 'app/command.js', re: /foot\.innerHTML = '<span>/, n: 1, why: 'a literal, no interpolation' },
  { file: 'app/dealui.js', re: /lg\.innerHTML = '<span class="src high">/, n: 1, why: 'a literal legend, no interpolation' },
  { file: 'app/rentrollui.js', re: /lg\.innerHTML = '<span><i class="k-doc">/, n: 1, why: 'a literal legend, no interpolation' },
  // ---- links and navigation: every one has a constant scheme and host, or goes through app/links.js
  { file: 'app/dealui.js', re: /window\.open\(`https:\/\/www\.google\.com\/maps/, n: 1, why: 'fixed https host; the address is encodeURIComponent-ed; noopener' },
  { file: 'app/ui.js', re: /a\.href = `https:\/\/www\.google\.com\/maps/, n: 1, why: 'fixed https host; the address is encodeURIComponent-ed' },
  { file: 'app/dealcrm.js', re: /a\.href = (tel|mail);/, n: 2, why: 'telHref / mailtoHref (app/links.js): a fixed tel:/mailto: scheme through the safeHref allowlist, or no link' },
  { file: 'app/kit.js', re: /Object\.assign\(a, \{ href: url, download: filename \}\)/, n: 1, why: 'url is a blob: URL from URL.createObjectURL, made on the line above' },
  { file: 'app/kit.js', re: /^s\.src = src;/, n: 1, why: 'loadScript: every caller passes a fixed ../vendor/ path built with new URL(..., import.meta.url)' },
  { file: 'app/kit.js', re: /import\(PDFJS\)/, n: 1, why: 'PDFJS is a vendored path constant' },
  { file: 'app/ocr.js', re: /import\(LIB\)/, n: 1, why: 'LIB is a vendored path constant' },
  { file: 'app/aiui.js', re: /au\.src = URL\.createObjectURL/, n: 1, why: 'blob: URL of a stored voice note' },
  { file: 'app/brief.js', re: /img\.src = url;/, n: 1, why: 'url is a blob: URL of a stored photo (brief.js builds the list)' },
  { file: 'app/dealui.js', re: /^(au|a|img)\.src = (url|u);/, n: 3, why: 'blob: URLs made with URL.createObjectURL from stored photos and voice notes' },
  { file: 'app/template.js', re: /parseFromString\(text, 'application\/xml'\)/, n: 1, why: 'parses an Office XML part as XML, never as HTML; the result is not inserted into the page' },
  // ---- SVG attribute helpers: the keys are fixed names at every call site (viewBox, x, y, class, aria-label ...); text goes in as textContent
  { file: 'app/glance.js', re: /n\.setAttribute\(k, v\)/, n: 1, why: 'svg(tag, attrs): every call passes fixed attribute names (x, y, d, class, role, aria-label); labels are set with textContent' },
  { file: 'app/rentrollui.js', re: /const mk = \(tag, attrs\)/, n: 1, why: 'mk(tag, attrs): every call passes fixed geometry and class names; labels are set with textContent' },
  { file: 'app/icons.js', re: /Object\.entries\(\{ fill: 'none'/, n: 1, why: 'a literal object of presentation attributes' },
  // ---- data fields that merely are called src: not DOM
  { file: 'app/abstracts.js', re: /^rec\.src = list;/, n: 1, why: 'a record field (source quotes), not an element' },
  { file: 'app/t12.js', re: /Object\.assign\(line, \{ src: \{ type:/, n: 1, why: 'a record field (where a line was read from), not an element' },
  { file: 'app/omroll.js', re: /^row\.src = \{/, n: 1, why: 'a record field (page, line, cells), not an element' },
];

test('no DOM or script sink in app/ or sw.js that is not in the reviewed allowlist', () => {
  const files = [...list('app'), 'sw.js'];
  assert.ok(files.length > 90, `scanned ${files.length} files`);
  const used = ALLOW.map(() => 0);
  const bad = [];
  for (const f of files) {
    for (const h of scan(fs.readFileSync(path.join(ROOT, f), 'utf8'), f)) {
      const i = ALLOW.findIndex((a) => a.file === f && a.re.test(h.text));
      if (i < 0) bad.push(`${f}:${h.line} [${h.rule}] ${h.text.slice(0, 120)}`); else used[i] += 1;
    }
  }
  assert.deepEqual(bad, [], `Unreviewed sinks. Read each one: if untrusted text can reach it, fix it (el(tag, cls, text), textContent, safeHref); if it cannot, add a line to ALLOW with the reason.\n${bad.join('\n')}`);
  const off = ALLOW.map((a, i) => ({ a, got: used[i] })).filter(({ a, got }) => got !== a.n).map(({ a, got }) => `${a.file} ${a.re} expected ${a.n}, matched ${got}`);
  assert.deepEqual(off, [], 'an ALLOW line no longer matches the code it was written for: update or delete it');
});

test('the scanner itself finds each kind of sink (so a quiet pass means something)', () => {
  const rules = (src) => scan(src).map((h) => h.rule);
  assert.deepEqual(rules('el.innerHTML = userText;'), ['html:innerHTML']);
  assert.deepEqual(rules("el['innerHTML'] = t;"), ['html:innerHTML']);
  assert.deepEqual(rules('Object.assign(d, { innerHTML: t });'), ['html:innerHTML']);
  assert.deepEqual(rules("el.insertAdjacentHTML('beforeend', t);"), ['html:insertAdjacentHTML']);
  assert.deepEqual(rules('el.outerHTML = t;'), ['html:outerHTML']);
  assert.deepEqual(rules('document.write(t);'), ['script:document.write']);
  assert.deepEqual(rules('eval(t);'), ['script:eval']);
  assert.deepEqual(rules('new Function(t);'), ['script:Function']);
  assert.deepEqual(rules("setTimeout('x()', 5);"), ['script:setTimeout-string']);
  assert.deepEqual(rules('setTimeout(() => x(), 5); setTimeout(fn, 5);'), []);
  assert.deepEqual(rules('a.href = t;'), ['url:.href=']);
  assert.deepEqual(rules('location.href = t;'), ['url:.href=']);
  assert.deepEqual(rules('location = t;'), ['nav:location=']);
  assert.deepEqual(rules('location.assign(t);'), ['nav:location.assign']);
  assert.deepEqual(rules('window.open(t);'), ['nav:window.open']);
  assert.deepEqual(rules("a.setAttribute('href', t);"), ['attr:setAttribute-url']);
  assert.deepEqual(rules("a.setAttribute('onclick', t);"), ['attr:setAttribute-url']);
  assert.deepEqual(rules("a.setAttribute(k, t);"), ['attr:setAttribute-url']);
  assert.deepEqual(rules("a.setAttribute('aria-label', t);"), []);
  assert.deepEqual(rules('Object.assign(a, { href: u });'), ['url:Object.assign-href']);
  assert.deepEqual(rules("import(p);"), ['script:import()']);
  assert.deepEqual(rules("import('./x.js');"), []);
  // comments and strings are not code
  assert.deepEqual(rules("// el.innerHTML = t\n/* eval(x) */ const s = 'el.innerHTML = t';"), []);
  assert.deepEqual(rules('const u = new URL(x).href; const n = o.src;'), []);
});
