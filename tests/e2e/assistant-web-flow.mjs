/* The bird asking with the web, against a stub server (page.route: no network). With AI off: one line and a button to
 * AI settings, and nothing sent. With AI on: a question the device cannot answer, or the "Ask with the web" button, goes
 * to /api/ask; the reply is drawn as text (an <img onerror> in it stays text), its source is a new-tab link with rel
 * noopener noreferrer; an open deal's facts go along; a confidential deal sends no facts and says so; a server error
 * is shown with its code. Phone and desktop size. Invented data only. */
import { phone, BASE, finish } from './lib.mjs';
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const SERVER = 'https://ai.example.test';
const SIZES = [['phone', {}], ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }]];
const EVIL = 'Rates are near 6%. <img src=x onerror="window.__pwned=1"> <script>window.__pwned=2</script>';

async function seed(page, confidential) {
  return page.evaluate(async (secret) => {
    const D = await import(new URL('app/dealui.js', location.href).href);
    const d = await D.createDeal({
      name: secret ? 'Invented Plaza (fictional)' : 'Example Plaza (fictional)', source: 'example-om.pdf', confidential: secret,
      figures: { address: '1 Example Way', city: 'Sampletown', state: 'MD', ptype: 'Retail', price: 4500000, noi: 315000, bsf: 10000, gross: 480000, opex: 165000 },
      sources: { noi: { page: 4, line: 'Net operating income 315,000', confidence: 'high', orig: 315000 } },
      loan: { ltv: 60, rate: 6, amort: 30, io: true, closing: 2, minDscr: 1.25, minDy: 8 },
    }, 'Seeded for the web flow');
    await D.showDeal(d.id);
    return d.id;
  }, confidential);
}
const setAi = (page, on) => page.evaluate(async (v) => { const a = await import(new URL('app/ai.js', location.href).href); await a.saveSettings(v); }, on ? { url: SERVER, token: 'device-token-0123456789', enabled: true } : { url: '', token: '', enabled: false });

for (const [size, opts] of SIZES) {
  const { browser, page, errors } = await phone(opts);
  const L = (s) => `${size}: ${s}`;
  const sent = []; let reply = null;
  await page.route(`${SERVER}/**`, async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    sent.push({ url: req.url(), auth: req.headers().authorization, body: JSON.parse(req.postData() || '{}') });
    const r = reply || { status: 200, json: { blocks: [{ text: EVIL, sources: [{ url: 'https://example.com/rates', title: 'Example Rates Survey' }, { url: 'javascript:alert(1)', title: 'bad' }] }], searches: 1, model: 'claude-opus-5-5' } };
    return route.fulfill({ status: r.status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(r.json) });
  });
  const outside = []; page.on('request', (r) => { if (r.url().startsWith(SERVER) && r.method() !== 'OPTIONS') outside.push(r.url()); });
  const open = async () => { await page.click('#assistant-fab'); await page.waitForSelector('dialog.assist[open]'); await page.waitForTimeout(150); };
  const close = async () => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('dialog.assist[open]')); };
  const typeAndAsk = async (q, web) => {
    const n = await page.locator('#assist-log > *').count();
    await page.fill('#assist-input', q);
    if (web) await page.click('.assist-web-btn'); else await page.press('#assist-input', 'Enter');
    return n;
  };
  try {
    await page.goto(BASE + '#home', { waitUntil: 'load' });
    await page.waitForSelector('#home-root h1');
    await setAi(page, false);

    // AI off: one line, a button to AI settings, nothing sent
    await open();
    await typeAndAsk('What is the weather on Mars?');
    await page.waitForSelector('.assist-off');
    check(L('AI off: the line "Monal AI is off. Set it up to ask anything, with the web."'), (await page.locator('.assist-off p').innerText()) === 'Monal AI is off. Set it up to ask anything, with the web.');
    check(L('AI off: a button opens AI settings'), (await page.locator('.assist-off button').innerText()) === 'AI settings…');
    await typeAndAsk('Mortgage rates today?', true);
    await page.waitForFunction(() => document.querySelectorAll('.assist-off').length === 2);
    check(L('AI off: nothing was sent, from either path'), outside.length === 0, outside.join());
    await page.click('.assist-off button >> nth=0');
    await page.waitForSelector('dialog:has-text("AI settings")[open]');
    check(L('the AI settings button leaves the bird and opens AI settings'), (await page.locator('dialog.assist[open]').count()) === 0 && (await page.locator('#ai-url').count()) === 1);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);

    // AI on, no deal open: the question alone, in an ask scope; the answer as text with a safe source link
    await setAi(page, true);
    await open();
    await typeAndAsk('Where are cap rates for strip centers heading?');
    await page.waitForSelector('.assist-web');
    check(L('AI on: an unanswerable question went to /api/ask with the device token'), sent.length === 1 && sent[0].url === `${SERVER}/api/ask` && sent[0].auth === 'Bearer device-token-0123456789', JSON.stringify(sent[0]));
    check(L('no deal open: the question only, no facts'), sent[0].body.question.startsWith('Where are cap rates') && Array.isArray(sent[0].body.facts) && sent[0].body.facts.length === 0, JSON.stringify(sent[0].body));
    const w = page.locator('.assist-web').last();
    check(L('the reply is text: the <img> and <script> stay as written, and nothing ran'), (await w.innerText()).includes('<img src=x onerror') && (await w.locator('img, script').count()) === 0 && (await page.evaluate(() => window.__pwned)) === undefined);
    const link = w.locator('a');
    check(L('one source link (the javascript: one dropped), new tab, rel noopener noreferrer, titled'), (await link.count()) === 1 && (await link.getAttribute('href')) === 'https://example.com/rates' && (await link.getAttribute('target')) === '_blank' && /noopener/.test(await link.getAttribute('rel')) && /noreferrer/.test(await link.getAttribute('rel')) && (await link.innerText()) === 'Example Rates Survey');
    check(L('"From Monal AI. Figures from the web are not checked."'), (await w.innerText()).includes('From Monal AI. Figures from the web are not checked.'));
    check(L('focus is back in the question box'), await page.evaluate(() => document.activeElement && document.activeElement.id === 'assist-input'));
    check(L('the answer is announced (live status has text)'), (await page.locator('.assist-sr[role=status]').innerText()).startsWith('Rates are near 6%'));

    // a server error is shown plainly, with its code
    reply = { status: 429, json: { error: 'daily_limit', message: 'This device has used today’s AI allowance ($15.00). It resets at 00:00 UTC, in 3 h 2 min.' } };
    await typeAndAsk('Anything on Friday?', true);
    await page.waitForFunction(() => document.querySelector('#assist-log').textContent.includes('daily_limit'));
    check(L('a server error shows its message and code'), /allowance \(\$15\.00\)[\s\S]*\(daily_limit\)/.test(await page.locator('#assist-log').innerText()));
    reply = null;
    await close();

    // an open deal that is not confidential: its facts go along
    await seed(page, false);
    await page.evaluate(() => { location.hash = '#deal'; }); await page.waitForSelector('#fig-price');
    await open();
    const before = sent.length;
    const webN = await page.locator('.assist-web').count();
    await typeAndAsk('Is 6.5% a fair cap for this kind of center?', true);
    await page.waitForFunction((n) => document.querySelectorAll('.assist-web').length > n, webN);
    const withDeal = sent[before];
    check(L('an open deal: its facts go with the question (ids, labels, sources)'), withDeal && withDeal.body.facts.length > 3 && withDeal.body.facts.every((f) => f.id && f.label && 'value' in f) && withDeal.body.facts.some((f) => /315,000/.test(f.value)), JSON.stringify(withDeal && withDeal.body.facts.slice(0, 2)));
    check(L('the history carries the earlier web turns'), Array.isArray(withDeal.body.history) && withDeal.body.history.length >= 2 && withDeal.body.history[0].role === 'user');
    await close();

    // a confidential deal: no facts, said so; a question that names it is refused
    await seed(page, true);
    await page.evaluate(() => { location.hash = '#deal'; }); await page.waitForSelector('#fig-price');
    await open();
    const b2 = sent.length;
    await typeAndAsk('How are office rents trending nationally?', true);
    await page.waitForFunction(() => [...document.querySelectorAll('.assist-web')].some((n) => n.textContent.includes('only your question was sent')));
    check(L('confidential deal: the request carried no facts'), sent.length === b2 + 1 && sent[b2].body.facts.length === 0 && !/Invented Plaza|315,000/.test(JSON.stringify(sent[b2].body)), JSON.stringify(sent[b2] && sent[b2].body).slice(0, 300));
    check(L('confidential deal: "This deal is confidential, so only your question was sent."'), (await page.locator('.assist-web').last().innerText()).includes('This deal is confidential, so only your question was sent.'));
    await typeAndAsk('Tell me about Invented Plaza', true);
    await page.waitForFunction(() => document.querySelector('#assist-log').textContent.includes('names a confidential deal'));
    check(L('a question that names the confidential deal is refused, nothing sent'), sent.length === b2 + 1);
    await close();
    const bad = errors.filter((e) => !/status of 429/.test(e)); // the 429 is the stub's own error answer
    check(L('no console errors'), bad.length === 0, bad.join('\n'));
  } catch (err) { check(L('ran'), false, String((err && err.stack) || err).slice(0, 700)); }
  await browser.close();
}
for (const r of R) console.log(r.join(' | '));
finish(R);
