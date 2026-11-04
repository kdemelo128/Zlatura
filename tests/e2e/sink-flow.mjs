/* S4: markup and link payloads, in the browser (tests/fixtures/hostile.js, SINK). Each payload is put into a contact
 * (name, company, phone, email), a comp name, a tenant, the deal name and a site-visit note, then shown on the
 * Deal screen, on Home and after a reload. Every one must come back exactly as text, make no element (no <img>, <svg>,
 * <script> or on* attribute that was not there before), run nothing (window.__pwned stays unset, no dialog) and leave
 * every link on an allowed scheme (http, https, mailto, tel) with nothing added to a mailto: (no ?bcc=). The source
 * side is tests/dom-sinks.test.js.
 *
 *   node sink-flow.mjs            # BASE=http://localhost:8080/ by default */
import { phone, BASE, finish } from './lib.mjs';
import { SINK } from '../fixtures/hostile.js';

const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();
page.setDefaultTimeout(15000);
const dialogs = [];
page.on('dialog', (d) => { dialogs.push(`${d.type()}: ${d.message()}`); d.dismiss(); });
const pause = (ms = 200) => page.waitForTimeout(ms);
const go = async (v) => { await page.evaluate((x) => { location.hash = x; }, `#${v}`); await pause(400); };
const ONE = (s) => s.replace(/[\r\n]/g, '').trim();
const short = (s) => JSON.stringify(String(s).length > 50 ? `${String(s).slice(0, 25)}…(${String(s).length})` : s);

/** What the page holds that script or markup would have left behind. */
const harm = () => page.evaluate(() => ({
  pwned: window.__pwned === undefined ? null : window.__pwned,
  proto: ({}).polluted === undefined && Object.prototype.polluted === undefined,
  made: document.querySelectorAll('img[src="x"], [onerror], [onload], [onfocus], [onclick], svg[onload], script:not([src])').length,
  badLinks: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => !/^(https?:|mailto:|tel:|#)/i.test(h)),
  mailExtras: [...document.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute('href')).filter((h) => /[?&#]/.test(h.slice(7))),
}));
const noHarm = async (where) => {
  const h = await harm();
  check(`${where}: nothing ran, no element made, no bad link`, dialogs.length === 0 && h.pwned === null && h.proto && h.made === baseline.made && h.badLinks.length === 0 && h.mailExtras.length === 0, `${dialogs.join(' | ')} ${JSON.stringify(h)}`);
};

await page.goto(BASE + '#comps', { waitUntil: 'load' });
await page.click('#example');
await page.waitForSelector('#sales-table tbody tr');
const baseline = await harm();   // index.html's own inline scripts count in `made`; every later check wants the same number
check('baseline page: no bad link, nothing run', baseline.pwned === null && baseline.badLinks.length === 0, JSON.stringify(baseline));

/* comps: one manual comp per payload */
const COMP_ROWS = '#sales-table tbody tr[data-key^="manual::"]';
for (const text of Object.values(SINK)) {
  const before = await page.$$eval(COMP_ROWS, (r) => r.map((x) => x.dataset.key));
  await page.locator('[data-add="sale"]').first().click();
  await pause(250);
  const key = (await page.$$eval(COMP_ROWS, (r) => r.map((x) => x.dataset.key))).find((k) => !before.includes(k));
  const input = page.locator(`tr[data-key="${key}"] input[aria-label="Property name"]`);
  await input.fill(text); await input.evaluate((e) => e.blur()); await pause(100);
}
const compNames = await page.$$eval(`${COMP_ROWS} input[aria-label="Property name"]`, (i) => i.map((x) => x.value));
const want = Object.values(SINK).map(ONE);
const missing = want.filter((w) => !compNames.includes(w));
check(`comp names: all ${want.length} payloads kept exactly as text`, missing.length === 0, missing.map(short).join(', '));
await noHarm('comps');

/* a deal: name, note, tenants, contacts */
await go('deal');
await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
await page.waitForSelector('#deal-tiles .tile');
const dealName = `${SINK.svgOnload} ${SINK.quoteBreak} ${SINK.jsUrl}`;
const h1 = page.locator('#deal-root h1').first();
await h1.fill(dealName); await h1.evaluate((e) => e.blur()); await pause();
await page.click('#tab-visit');
const note = Object.values(SINK).filter((t) => t !== SINK.tenK).join('\n');
await page.fill('#visit-notes', note); await page.locator('#visit-notes').evaluate((e) => e.blur()); await pause();
await page.click('#tab-rentroll');
const TENANT = '#deal-rentroll .rr-grid tbody tr input[aria-label^="Tenant"]:not([aria-label^="Tenant contact"])';
let i = 0;
for (const text of Object.values(SINK)) {
  await page.locator('#deal-rentroll button', { hasText: '+ Unit' }).click();
  await pause(150);
  const t = page.locator(TENANT).nth(i++);
  await t.fill(text); await t.evaluate((e) => e.blur()); await pause(80);
}
const tenants = await page.$$eval(TENANT, (x) => x.map((e) => e.value));
check('tenants: all payloads kept exactly as text', want.every((w) => tenants.includes(w)), want.filter((w) => !tenants.includes(w)).map(short).join(', '));
await noHarm('rent roll');

await page.click('#tab-overview');
// a click in the page itself: by the 20th contact the button sits under the tab bar
const newContact = () => page.locator('#deal-crm button', { hasText: '+ New contact' }).evaluate((b) => b.click());
for (const [k, text] of Object.entries(SINK)) {
  await newContact();
  await page.waitForSelector('#contact-name');
  await page.fill('#contact-name', text.slice(0, 200));
  await page.fill('#contact-company', text.slice(0, 200));
  await page.fill('#contact-phone', text.slice(0, 200));
  await page.evaluate((v) => { const e = document.getElementById('contact-email'); e.type = 'text'; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, `${text.slice(0, 100)}`);
  await page.locator('#contact-save').evaluate((b) => b.click());
  await page.waitForSelector('#contact-name', { state: 'detached', timeout: 4000 }).catch(() => {});
  if (await page.locator('#contact-name').count()) { check(`contact ${k}: saved`, false, `the form is still open: ${(await page.locator('#sheet').innerText()).slice(-200)}`); await page.keyboard.press('Escape'); await pause(); }
}
// an address with a header payload: the link must not carry it
await newContact();
await page.waitForSelector('#contact-name');
await page.fill('#contact-name', 'Header Probe');
await page.evaluate(() => { const e = document.getElementById('contact-email'); e.type = 'text'; e.value = 'probe@example.com?bcc=evil@example.com&subject=hi'; e.dispatchEvent(new Event('input', { bubbles: true })); });
await page.locator('#contact-save').evaluate((b) => b.click());
await pause(300);

check('Deal screen: a payload contact name is shown as text', (await page.locator('#deal-crm').innerText()).includes('<svg onload'), 'not found in #deal-crm');
await noHarm('deal screen');
const dealH1 = await page.locator('#deal-root h1').first().textContent();
check('deal name: shown as text, exactly', dealH1 === dealName, short(dealH1));

await go('home');
await page.waitForSelector('#home-contacts');
await pause(300);
const homeText = await page.locator('#home-contacts').innerText();
check('Home: payload contact names are shown as text', homeText.includes('<svg onload') && homeText.includes('javascript:window.__pwned=9'), short(homeText));
await noHarm('Home');
const mail = await page.$$eval('#home-contacts a[href^="mailto:"]', (a) => a.map((x) => x.getAttribute('href')));
check('mailto links: none carries ?, & or # after the address', mail.length > 0 && mail.every((h) => !/[?&#]/.test(h.slice(7))), JSON.stringify(mail.slice(0, 4)));

/* after a reload, and the Object prototype stays clean */
await page.reload({ waitUntil: 'load' });
await go('home'); await pause(500);
await noHarm('after reload (Home)');
await go('deal'); await pause(800);
if (!(await page.locator('#deal-tiles .tile').count())) await page.locator('#deal-root .list .li').first().click();
await page.waitForSelector('#deal-tiles .tile');
await noHarm('after reload (Deal)');
const keptNote = await page.evaluate(() => new Promise((res) => { const id = localStorage.getItem('zlatura.deal.current'); const q = indexedDB.open('zlatura'); q.onsuccess = () => { const g = q.result.transaction('deals').objectStore('deals').get(id); g.onsuccess = () => { res(g.result.visit.notes); q.result.close(); }; }; }));
check('site-visit note: saved exactly', keptNote === note, short(keptNote));

for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errors);
await browser.close();
