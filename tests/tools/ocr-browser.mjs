/* tests/tools/ocr-browser.mjs -- not a test: the vendored on-device OCR engine (app/ocr.js, Tesseract in a Web Worker) cannot run in Node,
 * so doc-local.mjs --ocr runs it in Playwright's Chromium, on a page served from this repo by a throwaway local server (127.0.0.1 only,
 * no outside request). openOcrBrowser() -> { open(pdfjs, bytes), close() }; open() has the shape ocrpdf.js takes (read, restart, close).
 * Only the engine runs there: which pages to read, the caps, the confidence floor and the result are the app's own ocrpdf.js, in Node. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = new URL('../../', import.meta.url).pathname;
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.wasm': 'application/wasm' };
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not installed here */ }
  return createRequire('/opt/node-tools/node_modules/')('playwright');
}

export async function openOcrBrowser() {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent((req.url || '/').split('?')[0]);
    if (u === '/__host.html') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>ocr host</title>'); return; }
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; res.end(); return; }
    res.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream');
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const pw = await loadPlaywright();
  const P = pw.chromium ? pw : pw.default;
  const browser = await P.chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${origin}/__host.html`);
  await page.evaluate(async () => {
    const pdfjs = await import('/vendor/pdf-4.7.76-legacy.min.js');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf-4.7.76-legacy.worker.min.js';
    window.__pdfjs = pdfjs; window.__ocr = await import('/app/ocr.js'); window.__readers = {}; window.__seq = 0;
  });
  return {
    open(_pdfjs, bytes) {
      const id = page.evaluate(({ b64 }) => { const id = ++window.__seq; window.__readers[id] = window.__ocr.openScanReader(window.__pdfjs, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))); return id; }, { b64: Buffer.from(bytes).toString('base64') });
      return {
        read: async (p, o) => { const i = await id; return page.evaluate(({ i, p, blankBelow }) => window.__readers[i].read(p, { blankBelow }), { i, p, blankBelow: o && o.blankBelow }); },
        restart: async () => { const i = await id; await page.evaluate((i) => window.__readers[i].restart(), i); },
        close: async () => { const i = await id; await page.evaluate((i) => window.__readers[i].close(), i); },
      };
    },
    close: async () => { await browser.close(); server.close(); },
  };
}
