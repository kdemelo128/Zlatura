/* Settings > Documents and AI > the brain on this device, with a stub engine in place of WebLLM (window.__monalBrainTest,
 * set by addInitScript; the app reads it only when present), so nothing is downloaded. No WebGPU: a plain message and no
 * download. A fake GPU: Turn on, progress, Ready (kept across a reload), Remove; Cancel mid-download; New look and Classic;
 * 44 px targets, real labels, axe-clean. */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const errs = [];

const stubScript = (mode) => {
  const adapter = { features: new Set(['shader-f16']), limits: { maxBufferSize: 4 * 2 ** 30 } };
  const hook = { log: [] };
  if (mode === 'nogpu') hook.gpu = null;
  else {
    hook.gpu = { requestAdapter: async () => adapter };
    hook.deviceMemory = 8;   // the browser's own report depends on the machine
    hook.factory = async () => {
      let loaded = false;
      return {
        async load(id, onProgress) {
          hook.log.push(['load', id]);
          for (const p of [0.2, 0.5, 0.8]) { onProgress(p); await new Promise((r) => setTimeout(r, 250)); }
          if (window.__brainHold) await new Promise((r) => { window.__brainRelease = r; });
          onProgress(1); loaded = true;
        },
        async chat() { return 'stub'; },
        async has() { return loaded; },
        async remove(id) { hook.log.push(['remove', id]); },
        terminate() { hook.log.push(['terminate']); },
      };
    };
  }
  window.__monalBrainTest = hook;
};

async function open(look, mode, { keep = false } = {}) {
  const p = await phone();
  const requests = [];
  p.page.on('request', (r) => requests.push(r.url()));
  await p.ctx.addInitScript(stubScript, mode);
  if (look) await p.ctx.addInitScript((l) => { try { localStorage.setItem('zlatura.look', l); } catch { /* */ } }, look);
  await p.page.goto(BASE + '#settings', { waitUntil: 'load' });
  await p.page.waitForSelector('#settings-brain', { state: 'attached' });
  await p.page.waitForTimeout(300);
  return { ...p, requests };
}
const txt = (page, s) => page.$eval(s, (e) => e.textContent.trim());
const hooked = (page, k) => page.evaluate((x) => window.__monalBrainTest[x], k);

async function audit(page, name) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => (await window.axe.run(document.querySelector('#settings-brain'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`));
  check(`axe: ${name}`, res.length === 0, res.join('\n    '));
}
async function targets(page, name) {
  const small = await page.$$eval('#settings-brain label.brain-size, #settings-brain button', (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && r.height < 44; }).map((e) => `${e.textContent.trim().slice(0, 20)} ${Math.round(e.getBoundingClientRect().height)}`));
  check(`${name}: every size and button is at least 44 px tall`, small.length === 0, small.join(', '));
}

// 1. no WebGPU: the message, and nothing is downloaded
{
  const { browser, page, errors, requests } = await open(null, 'nogpu');
  check('the card is in Settings under Documents and AI', await page.$eval('#settings-brain', (c) => !!c.closest('#set-g-ai')));
  check('three sizes as labelled radios, Standard chosen', JSON.stringify(await page.$$eval('#settings-brain input[type=radio]', (r) => r.map((x) => [x.closest('label').querySelector('b').textContent, x.checked]))) === JSON.stringify([['Small', false], ['Standard', true], ['Large', false]]));
  check('the card says it is off', (await txt(page, '#settings-brain .count')) === 'off');
  check('before anything is tapped the line says nothing was checked or downloaded', (await txt(page, '.brain-status')).startsWith('Off. Nothing is downloaded'));
  await page.click('#brain-check');
  await page.waitForFunction(() => /WebGPU/.test(document.querySelector('.brain-status').textContent));
  check('Check this device says WebGPU is missing', /does not offer WebGPU/.test(await txt(page, '.brain-status')));
  await page.click('#brain-on');
  await page.waitForFunction(() => /WebGPU/.test(document.querySelector('.brain-status').textContent));
  const msg = await txt(page, '.brain-status');
  check('Turn on without WebGPU explains why and stays off', /does not offer WebGPU/.test(msg) && (await txt(page, '#settings-brain .count')) === 'off', msg);
  check('the button becomes "Try again"; no Cancel, no Remove', (await txt(page, '#brain-on')) === 'Try again' && !(await page.isVisible('#brain-cancel')) && !(await page.isVisible('#brain-remove')));
  check('nothing was downloaded: no request to the model host or the library', !requests.some((u) => /huggingface|githubusercontent|web-llm/.test(u)), requests.filter((u) => /huggingface|githubusercontent|web-llm/.test(u)).join(' '));
  check('nothing was saved', (await page.evaluate(() => localStorage.getItem('monal.brain'))) === null);
  await audit(page, 'no WebGPU'); await targets(page, 'no WebGPU');
  await browser.close(); errs.push(...errors);
}

// 2. a (fake) GPU: turn on, progress, ready, kept across a reload, remove; in both looks
for (const look of ['new', 'classic']) {
  const { browser, page, errors, requests } = await open(look, 'gpu');
  const L = await page.evaluate(() => document.documentElement.dataset.look);
  check(`[${look}] the look is applied`, L === look || (look === 'classic' && L !== 'new'), String(L));
  await page.click('#brain-check');
  await page.waitForFunction(() => /can run/.test(document.querySelector('.brain-status').textContent));
  check(`[${look}] the device line says it can run the Standard size`, /can run the Standard size/.test(await txt(page, '.brain-status')));
  await page.evaluate(() => { window.__brainHold = true; });
  await page.click('#brain-on');
  await page.waitForFunction(() => document.querySelector('.brain-progress') && !document.querySelector('.brain-progress').hidden && Number(document.querySelector('.brain-progress').getAttribute('aria-valuenow')) >= 20);
  const mid = Number(await page.getAttribute('.brain-progress', 'aria-valuenow'));
  check(`[${look}] a progress bar shows while downloading`, mid >= 20 && mid < 100, String(mid));
  check(`[${look}] sizes are locked, Cancel shows, Turn on is hidden`, (await page.$$eval('#settings-brain input[type=radio]', (r) => r.every((x) => x.disabled))) && await page.isVisible('#brain-cancel') && !(await page.isVisible('#brain-on')));
  check(`[${look}] the status names the size and percent`, /Downloading the Standard size: \d+%/.test(await txt(page, '.brain-status')));
  await audit(page, `${look} downloading`); await targets(page, `${look} downloading`);
  await page.waitForFunction(() => !!window.__brainRelease);   // the stub is holding at 80%
  await page.evaluate(() => window.__brainRelease());
  await page.waitForFunction(() => /^Ready/.test(document.querySelector('.brain-status').textContent));
  check(`[${look}] Ready: the card says on, Remove shows, progress is gone`, (await txt(page, '#settings-brain .count')) === 'on' && await page.isVisible('#brain-remove') && !(await page.isVisible('.brain-progress')) && !(await page.isVisible('#brain-on')));
  check(`[${look}] the choice is kept on the device`, JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('monal.brain')))) === JSON.stringify({ model: 'Qwen3-1.7B-q4f16_1-MLC', on: true }));
  check(`[${look}] nothing real was downloaded (only the stub ran)`, !requests.some((u) => /huggingface|githubusercontent|web-llm/.test(u)));
  await audit(page, `${look} ready`); await targets(page, `${look} ready`);
  await page.screenshot({ path: new URL(`./shots/brain-${look}.png`, import.meta.url).pathname, fullPage: false });
  // a reload: still ready, with no engine started
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#settings-brain', { state: 'attached' });
  check(`[${look}] after a reload it is still Ready and nothing was loaded`, /^Ready/.test(await txt(page, '.brain-status')) && (await hooked(page, 'log')).length === 0);
  await page.click('#brain-remove');
  await page.waitForFunction(() => /^Removed/.test(document.querySelector('.brain-status').textContent));
  check(`[${look}] Remove deletes the model files and turns it off`, (await hooked(page, 'log')).some((l) => l[0] === 'remove' && l[1] === 'Qwen3-1.7B-q4f16_1-MLC') && (await txt(page, '#settings-brain .count')) === 'off' && await page.isVisible('#brain-on') && JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('monal.brain')))) === JSON.stringify({ model: 'Qwen3-1.7B-q4f16_1-MLC', on: false }));
  // a different size, then Cancel mid-download
  await page.check('#settings-brain input[value="Qwen3-0.6B-q4f16_1-MLC"]');
  await page.evaluate(() => { window.__brainHold = true; });
  check(`[${look}] the button names the chosen size`, (await txt(page, '#brain-on')) === 'Turn on (Small)');
  await page.click('#brain-on');
  await page.waitForSelector('#brain-cancel', { state: 'visible' });
  await page.click('#brain-cancel');
  await page.waitForFunction(() => /^Cancelled/.test(document.querySelector('.brain-status').textContent));
  check(`[${look}] Cancel stops the download and keeps nothing`, (await hooked(page, 'log')).some((l) => l[0] === 'terminate') && (await txt(page, '#settings-brain .count')) === 'off' && await page.isVisible('#brain-on') && JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('monal.brain')))) === JSON.stringify({ model: 'Qwen3-0.6B-q4f16_1-MLC', on: false }));
  await browser.close(); errs.push(...errors);
}
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errs);
