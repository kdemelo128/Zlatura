/* Regenerate static brand assets from the app's one artwork record.
 * Uses the browser-test prerequisite (Playwright/Chromium); no new app dependency.
 * Run from the repo root: node tools/brand-assets.mjs */
import fs from 'node:fs/promises';
import { MARK, PRODUCT } from '../app/brand.js';
import { chromium } from '../tests/e2e/lib.mjs';
const artwork = `<svg viewBox="${MARK.viewBox}" fill="none" xmlns="http://www.w3.org/2000/svg">${MARK.body}</svg>`;
const tile = (size, inset, background) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128"><rect width="128" height="128" rx="26" fill="${background}"/><g transform="translate(${inset} ${inset}) scale(${(128 - inset * 2) / 128})">${MARK.body}</g></svg>`;
for (const [scheme, ink] of [['light', '#16191e'], ['dark', '#eeece7']]) {
  const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 56" role="img" aria-label="${PRODUCT}"><svg x="0" y="0" width="56" height="56" viewBox="${MARK.viewBox}">${MARK.body}</svg><text x="66" y="38" font-family="Georgia, serif" font-size="27" font-weight="600" letter-spacing="-.3" fill="${ink}">${PRODUCT}</text></svg>\n`;
  await fs.writeFile(`docs/brand/logo-${scheme}.svg`, logo);
}
const favicon = tile(32, 2, '#16191e').replace('<rect ', '<style>@media(prefers-color-scheme:dark){rect{fill:#eeece7}}</style><rect ');
await fs.writeFile('icons/favicon.svg', favicon + '\n');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [file, size, inset] of [['icon-180.png', 180, 6], ['icon-192.png', 192, 6], ['icon-512.png', 512, 6], ['icon-maskable-512.png', 512, 20]]) {
    // The maskable variant's artwork stays inside the central safe circle.
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:#16191e}svg{display:block}</style>${tile(size, inset, '#16191e')}`);
    await page.screenshot({ path: `icons/${file}` });
  }
  await page.setViewportSize({ width: 860, height: 460 });
  await page.setContent(`<style>body{margin:0;background:#f4f3ef;font-family:Georgia,serif;color:#172d40}main{padding:36px;display:flex;align-items:center;gap:48px}section{width:370px}h1{font-size:38px;margin:0 0 12px}p{font:16px/1.6 system-ui}aside{display:flex;gap:18px;align-items:center}aside svg{width:30px;height:30px;background:#16191e;border-radius:8px}</style><main><section>${artwork}</section><section><h1>${PRODUCT}</h1><p>Himalayan monal<br>Jade crest · copper neck and tail<br>Layered blue-violet wing</p><aside>${tile(32, 2, '#16191e')}${tile(64, 6, '#16191e')}</aside><p>Logo proposal · header and app icon</p></section></main>`);
  await page.screenshot({ path: 'docs/brand/monal-preview.png' });
} finally { await browser.close(); }
