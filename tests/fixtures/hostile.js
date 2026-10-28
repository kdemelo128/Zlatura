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
