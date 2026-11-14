/* The bird with the brain on this device (a stub engine in place of WebLLM, set with window.__monalBrainTest; nothing is
 * downloaded). Routes: the front desk first; then the brain when it is ready (a question it maps to a task runs on the app's
 * own calculation and shows where it came from; anything else is talk from the deal's facts, streamed, a figure not in the
 * facts marked "not from your data"); then the firm's server when AI is on, only if the brain could not answer. "Think it
 * through" switch, the first-load and error states, a confidential deal read on this device, brain off = today's behaviour.
 * Phone and desktop; axe on the panel. Invented data only. */
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const SERVER = 'https://ai.example.test';
const SIZES = [['phone', {}], ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }]];

const stub = () => {
  const hook = { log: [], gpu: null };
  hook.factory = async () => ({
    async load() { hook.log.push(['load']); await new Promise((r) => setTimeout(r, 150)); },
    async has() { return true; }, async remove() {}, terminate() {},
    async chat(messages, { think, onToken }) {
      const sys = messages[0].content;
      const q = messages[messages.length - 1].content;
      hook.log.push(['chat', /match a real estate/.test(sys) ? 'map' : 'talk', think, q, sys]);
      if (/explode/.test(q)) throw new Error('out of memory');
      if (/match a real estate/.test(sys)) {
        if (/four point six million/.test(q)) return '<think>\n\n</think>\n{"task": "cap_at_price", "inputs": {"price": 4600000}}';
        if (/targeting/.test(q)) return '{"task": "price_for_cap", "inputs": {}}';
        return '{"task": "none"}';
      }
      const full = 'Thank you for the tour. The asking price is $4,500,000 and the NOI is $330,000, so it is a solid fit.';
      const cut = full.indexOf('NOI');
      if (onToken) {
        onToken('<think>\n\n</think>\n\n' + full.slice(0, cut));
        if (window.__gate) await new Promise((r) => { window.__release = r; });
        onToken('<think>\n\n</think>\n\n' + full);
      }
      return full;
    },
  });
  window.__monalBrainTest = hook;
};

async function seed(page, confidential) {
  return page.evaluate(async (secret) => {
    const D = await import(new URL('app/dealui.js', location.href).href);
    const d = await D.createDeal({
      name: secret ? 'Invented Plaza (fictional)' : 'Example Plaza (fictional)', source: 'example-om.pdf', confidential: secret,
      figures: { address: '1 Example Way', city: 'Sampletown', state: 'MD', ptype: 'Retail', price: 4500000, noi: 315000, bsf: 10000, gross: 480000, opex: 165000 },
      sources: { noi: { page: 4, line: 'Net operating income 315,000', confidence: 'high', orig: 315000 } },
      loan: { ltv: 60, rate: 6, amort: 30, io: true, closing: 2, minDscr: 1.25, minDy: 8 },
    }, 'Seeded for the brain flow');
    await D.showDeal(d.id);
    return d.id;
  }, confidential);
}
const setAi = (page, on) => page.evaluate(async (v) => { const a = await import(new URL('app/ai.js', location.href).href); await a.saveSettings(v); }, on ? { url: SERVER, token: 'device-token-0123456789', enabled: true } : { url: '', token: '', enabled: false });
const errs = [];

for (const [size, opts] of SIZES) {
  for (const brainOn of [true, false]) {
    if (!brainOn && size === 'desktop') continue;
    const { browser, ctx, page, errors } = await phone(opts);
    const L = (s) => `${size}${brainOn ? '' : ' (brain off)'}: ${s}`;
    await ctx.addInitScript(stub);
    if (brainOn) await ctx.addInitScript(() => { try { localStorage.setItem('monal.brain', JSON.stringify({ model: 'Qwen3-1.7B-q4f16_1-MLC', on: true })); } catch { /* */ } });
    const sent = [];
    await page.route(`${SERVER}/**`, async (route) => {
      const req = route.request();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      sent.push(req.url());
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ blocks: [{ text: 'From the firm server.', sources: [] }], searches: 0, model: 'x' }) });
    });
    const away = []; const origin = new URL(BASE).origin;
    page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && !r.url().startsWith(SERVER)) away.push(r.url()); });
    const log = () => page.evaluate(() => window.__monalBrainTest.log);
    const open = async () => { await page.click('#assistant-fab'); await page.waitForSelector('dialog.assist[open]'); await page.waitForTimeout(150); };
    const close = async () => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('dialog.assist[open]')); };
    const ask = async (q) => { await page.fill('#assist-input', q); await page.press('#assist-input', 'Enter'); };
    try {
      await page.goto(BASE + '#home', { waitUntil: 'load' });
      await page.waitForSelector('#home-root h1');
      await setAi(page, false);
      await seed(page, false);
      await open();

      if (!brainOn) {
        check(L('no think switch'), !(await page.locator('.assist-think').isVisible()));
        await ask('If somebody paid four point six million, what return would I get?');
        await page.waitForSelector('.assist-refuse');
        await page.waitForTimeout(300);
        check(L('the front desk answers as before, and the engine is never started'), /can’t answer that yet/.test(await page.locator('#assist-log').innerText()) && (await log()).length === 0);
        await browser.close(); errs.push(...errors); continue;
      }

      check(L('the think switch is drawn, unticked, with a 44 px target'), await page.locator('#assist-think').isVisible() && !(await page.locator('#assist-think').isChecked()) && (await page.locator('.assist-think').boundingBox()).height >= 44);
      // the front desk first: a question it knows never reaches the brain
      await ask('What is the DSCR?');
      await page.waitForSelector('.assist-answer:not(.assist-wait) .assist-cites');
      check(L('a question the front desk knows is answered there, with no engine call'), (await log()).length === 0);

      // a task: the brain maps it, the app's own engine answers
      await ask('If somebody paid four point six million, what return would I get?');
      await page.waitForFunction(() => /Loading .* brain on this device/.test(document.querySelector('#assist-log').innerText) || document.querySelector('.assist-brain-task, .assist-answer .assist-note'));
      await page.waitForFunction(() => [...document.querySelectorAll('.assist-note')].some((n) => /matched to/.test(n.textContent)));
      const taskText = await page.locator('#assist-log').innerText();
      check(L('the task ran on the app’s calculation: cap rate 6.85% at $4,600,000, with where it came from'), /6\.85%/.test(taskText) && /Where this came from/.test(taskText), taskText.slice(-400));
      check(L('the answer says it was On this device and matched by the brain'), /On this device\. Nothing you typed left it\. Your question was matched/.test(taskText));
      check(L('the model never produced the figure: the answer is the engine’s, not the stub’s'), !/6\.85/.test(JSON.stringify((await log()).filter((l) => l[1] === 'talk'))));
      const l1 = await log();
      check(L('the first question loaded the model once; the mapping ran with thinking off'), l1.filter((l) => l[0] === 'load').length === 1 && l1.find((l) => l[1] === 'map')[2] === false);
      check(L('a task asks for what is missing rather than guessing'), await (async () => { await ask('which yield should I be targeting'); await page.waitForFunction(() => /What cap rate\?|I need the cap rate/.test(document.querySelector('#assist-log').innerText)); return true; })());

      // free talk, streamed, with Think on; an invented figure is marked
      await page.evaluate(() => { window.__gate = true; });
      await page.check('#assist-think');
      await ask('Write a thank-you note to the owner for the tour');
      await page.waitForSelector('.assist-streaming .assist-brain-text');
      await page.waitForFunction(() => /Thank you for the tour/.test(document.querySelector('.assist-streaming .assist-brain-text').textContent));
      const partial = await page.locator('.assist-streaming .assist-brain-text').innerText();
      check(L('the reply streams into the panel, thinking text hidden'), /^Thank you for the tour\./.test(partial) && !/think/.test(partial) && !/NOI is/.test(partial), partial);
      await page.evaluate(() => window.__release());
      await page.waitForSelector('mark.assist-ungrounded');
      const marks = await page.locator('mark.assist-ungrounded').allInnerTexts();
      check(L('only the invented figure is marked "not from your data"; the deal’s own price is not'), marks.length === 1 && marks[0] === '$330,000', JSON.stringify(marks));
      const talkText = await page.locator('.assist-brain').last().innerText();
      check(L('the answer carries the warning and the On this device label'), /Not from your data: \$330,000/.test(talkText) && /On this device\. Nothing you typed left it\./.test(talkText) && !/confidential/.test(talkText));
      const talk = (await log()).filter((l) => l[1] === 'talk').pop();
      check(L('Think it through reached the model; the deal’s facts did too'), talk[2] === true && /Asking price: \$4,500,000/.test(talk[4]) && /NOI, in place: \$315,000/.test(talk[4]));
      await page.screenshot({ path: new URL(`./shots/brain-bird-${size}.png`, import.meta.url).pathname });
      // axe on the panel
      if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
      const viol = await page.evaluate(async () => (await window.axe.run(document.querySelector('dialog.assist'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`));
      check(L('axe: the panel with a brain answer and a marked figure'), viol.length === 0, viol.join('\n    '));

      // the error state, then the server as the last route
      await page.evaluate(() => { window.__gate = false; });
      await ask('please explode');
      await page.waitForSelector('.assist-refuse .warn-text');
      const errText = await page.locator('#assist-log').innerText();
      check(L('an engine error is shown plainly, and the front desk’s reply stands'), /brain on this device could not answer \(out of memory\)/.test(errText) && /can’t answer that yet/.test(errText));
      check(L('with AI off the server is never asked'), sent.length === 0);
      await close();
      await setAi(page, true);
      await open();
      await ask('please explode again');
      await page.waitForSelector('.assist-web');
      check(L('AI on: when the brain cannot answer, the firm server is the last route'), sent.length === 1);
      await ask('Write a thank-you note to the owner for the tour');
      await page.waitForFunction(() => document.querySelectorAll('.assist-brain').length >= 2);
      await page.waitForTimeout(300);
      check(L('AI on: when the brain answers, the server is not asked'), sent.length === 1);
      await close();

      // a confidential deal is read on this device and labelled so; nothing leaves
      await setAi(page, false);
      await seed(page, true);
      await open();
      await ask('Write a thank-you note to the owner for the tour');
      await page.waitForFunction(() => [...document.querySelectorAll('.assist-note')].some((n) => /confidential/.test(n.textContent)));
      const conf = (await log()).filter((l) => l[1] === 'talk').pop();
      check(L('confidential deal: the brain read its facts, and the answer says it stayed on this device'), /Invented Plaza|Asking price/.test(conf[4]) && /This deal is confidential: it was read on this device only/.test(await page.locator('#assist-log').innerText()));
      check(L('nothing went to any outside host'), away.length === 0, away.join(' '));
    } catch (e) { check(L('flow ran to the end'), false, String(e && e.stack || e).slice(0, 600)); }
    await browser.close(); errs.push(...errors);
  }
}
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errs);
