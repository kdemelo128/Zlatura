/* The icon sheet: every icon in app/icons.js at 20 and 32 px, with its name, and the brand mark, drawn by the
 * app's own code and styles in the New look and Classic, light and dark. For the owner to look at; it checks
 * nothing. Run: node tests/e2e/icon-sheet.mjs  (writes docs/proposals/ui/shots/icons-*.png) */
import fs from 'node:fs';
import { phone, BASE } from './lib.mjs';

const OUT = new URL('../../docs/proposals/ui/shots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const { browser, page } = await phone({ viewport: { width: 980, height: 800 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForSelector('#view-home', { state: 'visible' });
for (const look of ['new', 'classic']) for (const scheme of ['light', 'dark']) {
  await page.emulateMedia({ colorScheme: scheme });
  await page.evaluate(async (l) => {
    if (l === 'new') document.documentElement.dataset.look = 'new'; else delete document.documentElement.dataset.look;
    const { ICONS, icon } = await import(new URL('app/icons.js', document.baseURI).href);
    document.getElementById('sheet')?.remove();
    const s = document.createElement('div');
    s.id = 'sheet';
    s.style.cssText = 'position:fixed;inset:0;overflow:auto;background:var(--bg);color:var(--ink);padding:20px;z-index:99999;font:13px var(--ui)';
    s.innerHTML = `<div style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px 6px">${Object.keys(ICONS).map((n) => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 0;border-top:1px solid var(--line)"><div style="display:flex;gap:10px;align-items:center">${icon(n, 20)}${icon(n, 32)}</div><span style="color:var(--muted);font-size:11px">${n}</span></div>`).join('')}</div>`;
    document.body.appendChild(s);
  }, look);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}icons-${look}-${scheme}.png`, clip: { x: 0, y: 0, width: 980, height: 640 } });
}
await browser.close();
console.log('wrote', fs.readdirSync(OUT).filter((f) => f.startsWith('icons-')).join(' '));
