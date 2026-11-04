/* The hostile-text pack (invented): names and notes that break careless code. Each text must come back exactly as
 * typed, through a reload, a backup and every export, and none may turn into a formula or into markup. */
export const LONG = `${'a'.repeat(31998)}&${'b'.repeat(40000 - 31999)}`;   // 40,000 characters, an "&" at position 31,998
export const PACK = {
  apostrophe: "O'Brien",
  curly: 'O’Brien',
  emoji: '👩🏽‍💼 Café',
  arabic: 'مكتب Suite 101',
  bidi: 'x‮evil',
  img: '<img src=x onerror=alert(1)>',
  script: '<script>window.__pwned=1</script>',
  cmd: "=cmd|' /C calc'!A0",
  plus: '+SUM(1)',
  at: '@x',
  tabFormula: '\t=1+1',
  crFormula: '\r=1+1',
  midTab: 'Acme\t=1+1',
  long: LONG,
  control: 'A\u0000B\u0007C',
};

/* The markup and link payloads (invented), for tests/e2e/sink-flow.mjs: each must be shown as plain text, make no
 * element, run nothing (window.__pwned stays unset) and change no link. Kept apart from PACK because PACK is also
 * pushed through every export, where its 14 fixed entries are counted. */
export const SINK = {
  svgOnload: '<svg onload="window.__pwned=1">',
  svgScript: '<svg><script>window.__pwned=2</script></svg>',
  imgOnerror: '<img src=x onerror="window.__pwned=3">',
  quoteBreak: '"><script>window.__pwned=4</script>',
  attrBreak: '" onfocus="window.__pwned=5" autofocus x="',
  apostrophe: "'><img src=x onerror=window.__pwned=6>",
  backtick: '`${window.__pwned=7}` `><svg onload=window.__pwned=8>',
  jsUrl: 'javascript:window.__pwned=9',
  jsUrlCase: ' JaVa\tScRiPt:window.__pwned=10',
  dataUrl: 'data:text/html,<script>window.__pwned=11</script>',
  vbsUrl: 'vbscript:msgbox(12)',
  bidiOverride: 'invoice‮fdp.exe',
  zeroWidth: 'a​b‍c﻿d',
  combining: 'Z̀́̂̃̄̅̆̇̈̉̊̋̌',
  tenK: `${'x'.repeat(4999)}<${'y'.repeat(4999)}>`,   // 10,000 characters
  proto: '__proto__',
  ctor: 'constructor',
  protoJson: '{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}}}',
};
