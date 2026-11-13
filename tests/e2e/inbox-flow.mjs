/* The To file inbox: read an invented OM, see the people, dates and companies it names as proposed records (each with
 * its source), file one, merge one into an existing contact (the typed phone survives), dismiss one, and Undo each; the
 * automatic switch is off by default and, when on, files only clean new records; a confidential deal's records stay
 * out of the counts; a backup carries the items; axe; phone and desktop. */
import { createRequire } from 'module';
import fs from 'fs';
import { phone, BASE, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const SHOT = process.env.CONNECT_SHOTS || '';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function audit(page, name) {
  await page.waitForTimeout(500);
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  }, tags_);
  check(`axe: ${name}`, res.length === 0, res.join('\n    '));
}
const tags_ = TAGS;

for (const size of ['phone', 'desktop']) {
  const o = size === 'phone' ? {} : { viewport: { width: 1360, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 };
  const { browser, page, errors } = await phone(o);
  const outside = [];
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !/^(data|blob):/.test(r.url())) outside.push(r.url()); });
  const kv = (k) => page.evaluate((key) => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get(key); g.onsuccess = () => res(g.result ?? null); }; }), k);
  const kvPut = (k, v) => page.evaluate(([key, val]) => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(val, key); t.oncomplete = res; }; }), [k, v]);
  const contacts = async () => (await kv('crm.contacts')) || [];
  await page.goto(BASE + '#home', { waitUntil: 'load' });
  await page.waitForSelector('#view-home', { state: 'visible', timeout: 8000 });
  await page.evaluate(() => localStorage.setItem('zlatura.look', 'new'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#view-home', { state: 'visible', timeout: 8000 });

  // an existing contact whose email is on the OM and whose typed phone is not
  await kvPut('crm.contacts', [{ id: 'cpat', name: 'Pat Quill', company: '', role: 'Other', phone: '(555) 010-4444', email: 'pat@quill.example.test', notes: '', dealIds: [], createdAt: 1, updatedAt: 1 }]);
  check(`${size}: the automatic switch is off by default`, !(await kv('inbox.prefs')));

  // read the invented OM
  await page.goto(BASE + '#deal', { waitUntil: 'load' });
  await page.setInputFiles('#om-file', F + 'om-inbox.pdf');
  await page.waitForSelector('#deal-crm #deal-stage', { timeout: 30000 });
  await page.waitForFunction(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('inbox.items'); g.onsuccess = () => res(Array.isArray(g.result) && g.result.length > 3); }; }), null, { timeout: 15000 });
  const items = await kv('inbox.items');
  const names = items.map((x) => x.data.name || x.data.title || x.data.address);
  check(`${size}: the OM's people, company and dates became proposed items`, ['Jane Roe', 'Pat Quill', 'Example Holdings LLC', 'Offers due', 'Closing'].every((n) => names.includes(n)), names.join(' | '));
  check(`${size}: every item is pending and says where it came from`, items.every((x) => x.status === 'pending' && x.v === 1 && x.source.file === 'om-inbox.pdf' && x.source.page >= 1));
  check(`${size}: nothing was filed by reading (the contact list is unchanged)`, (await contacts()).length === 1 && (await contacts())[0].phone === '(555) 010-4444');

  // Home says so
  await page.evaluate(() => { location.hash = '#home'; });
  await page.waitForSelector('#home-attention');
  await page.waitForFunction(() => /waiting in To file/.test(document.querySelector('#home-attention')?.textContent || ''));
  check(`${size}: Home shows how many records wait`, /\d+ records? .* waiting in To file/.test(await page.textContent('#home-attention')));
  await page.click('#home-attention button:has-text("To file")');
  await page.waitForSelector('#connect-tab-inbox[aria-selected="true"]');
  await page.waitForSelector('.inbox-item');
  check(`${size}: that opens Connect on the To file tab, with the count on the tab`, /^To file \(\d+\)$/.test(await page.textContent('#connect-tab-inbox')));
  const card = (name) => page.locator('.inbox-item', { hasText: name }).first();
  check(`${size}: each proposed record shows its source and its match`, /From om-inbox\.pdf, page \d/.test(await card('Jane Roe').textContent()) && /Matches: Pat Quill \(the same email\)/.test(await card('Pat Quill').textContent()));
  await page.waitForTimeout(700);
  if (SHOT) await page.screenshot({ path: `${SHOT}/${size}-tofile.png`, fullPage: true });
  await audit(page, `${size} To file`);

  // File one: Jane Roe becomes a contact linked to the deal, with its source; Undo removes it
  await card('Jane Roe').locator('button:has-text("File")').first().click();
  await page.waitForFunction(() => !document.querySelector('.inbox-item[data-kind="contact"]:not(.inbox-doneitem) .inbox-main')?.textContent.includes('Jane Roe'));
  let cs = await contacts();
  const jane = cs.find((c) => c.name === 'Jane Roe');
  check(`${size}: File makes the contact, linked to the deal, with company, role and source`, !!jane && jane.company === 'Roe & Partners Realty' && jane.role === 'Seller’s broker' && jane.dealIds.length === 1 && jane.sources[0].file === 'om-inbox.pdf' && jane.v === 2, JSON.stringify(jane));
  await page.locator('.inbox-doneitem', { hasText: 'Jane Roe' }).locator('button:has-text("Undo")').click();
  await page.waitForFunction(() => document.querySelector('.inbox-list:not(.inbox-done)')?.textContent.includes('Jane Roe'));
  check(`${size}: Undo removes what was filed, and the item is waiting again`, !(await contacts()).some((c) => c.name === 'Jane Roe'));

  // Merge one: Pat Quill into the existing contact; the typed phone survives, the document's is kept as another value
  await card('Pat Quill').locator('button:has-text("Merge")').click();
  await page.waitForSelector('#sheet[open] fieldset[data-field="phone"]');
  await page.click('#inbox-merge-go');
  check(`${size}: a conflict needs a choice before anything merges`, (await page.isVisible('#sheet[open]')) && ((await contacts()).find((c) => c.id === 'cpat').sources || []).length === 0);
  await page.check('fieldset[data-field="phone"] input[value="keep"]');
  await page.click('#inbox-merge-go');
  await page.waitForFunction(() => !document.querySelector('#sheet[open]'));
  const pat = (await contacts()).find((c) => c.id === 'cpat');
  check(`${size}: Merge keeps the typed phone, keeps the document's under other values, adds the source and the deal`, pat.phone === '(555) 010-4444' && pat.otherValues.phone[0].value === '(555) 010-9999' && pat.sources.length === 1 && pat.dealIds.length === 1, JSON.stringify(pat));
  await page.locator('.inbox-doneitem', { hasText: 'Pat Quill' }).locator('button:has-text("Undo")').click();
  await page.waitForFunction(() => document.querySelector('.inbox-list:not(.inbox-done)')?.textContent.includes('Pat Quill'));
  const pat2 = (await contacts()).find((c) => c.id === 'cpat');
  check(`${size}: Undo puts the contact back as it was`, pat2.phone === '(555) 010-4444' && Object.keys(pat2.otherValues).length === 0 && pat2.sources.length === 0 && pat2.dealIds.length === 0, JSON.stringify(pat2));

  // Dismiss one, then Undo
  await card('Example Holdings LLC').locator('button:has-text("Dismiss")').click();
  await page.waitForFunction(() => !document.querySelector('.inbox-list:not(.inbox-done)')?.textContent.includes('Example Holdings LLC'));
  check(`${size}: Dismiss removes it from the list and records that`, (await kv('inbox.items')).find((x) => x.data.name === 'Example Holdings LLC').status === 'dismissed');
  await page.locator('.inbox-doneitem', { hasText: 'Example Holdings LLC' }).locator('button:has-text("Undo")').click();
  await page.waitForFunction(() => document.querySelector('.inbox-list:not(.inbox-done)')?.textContent.includes('Example Holdings LLC'));
  check(`${size}: Undo brings the dismissed item back`, (await kv('inbox.items')).find((x) => x.data.name === 'Example Holdings LLC').status === 'pending');

  // a date becomes a task; Undo removes it
  const tasksBefore = ((await kv('crm.tasks')) || []).length;
  await card('Closing').locator('button:has-text("File")').first().click();
  await page.waitForFunction(() => !document.querySelector('.inbox-list:not(.inbox-done)')?.textContent.includes('Closing:'));
  const tk = ((await kv('crm.tasks')) || []).find((t) => t.title === 'Closing');
  check(`${size}: filing a date makes a task due that day, with its source`, ((await kv('crm.tasks')) || []).length === tasksBefore + 1 && tk.due === '2027-01-15' && tk.source === 'document' && /om-inbox\.pdf/.test(tk.note), JSON.stringify(tk));
  await page.locator('.inbox-doneitem', { hasText: 'Closing' }).locator('button:has-text("Undo")').click();
  await page.waitForFunction(async () => true);
  await page.waitForTimeout(400);
  check(`${size}: Undo removes the task`, ((await kv('crm.tasks')) || []).length === tasksBefore);

  // the switch: Settings has it, off; on, a clean new record is filed by itself, one that matches someone is not
  await page.evaluate(() => { location.hash = '#settings'; });
  await page.waitForSelector('#inbox-auto');
  check(`${size}: Settings has the switch, unchecked`, !(await page.isChecked('#inbox-auto')));
  await page.check('#inbox-auto');
  await page.waitForFunction(() => true);
  await page.waitForTimeout(300);
  check(`${size}: turning it on is kept`, (await kv('inbox.prefs')).auto === true);
  const auto = await page.evaluate(async () => {
    const m = await import('./app/inboxstore.js');
    const deal = { id: 'dauto', figures: {}, confidential: false };
    const r = await m.proposeFromDocument({ deal, doc: { name: 'auto.pdf', type: 'om' }, pages: ['Tenant: Clean New Tenant LLC\nOwner: Pat Quill\nPat Quill'] });
    return r;
  });
  const afterAuto = await contacts();
  check(`${size}: automatic filing files the clean new record and nothing else`, auto.added >= 1 && afterAuto.some((c) => c.name === 'Clean New Tenant LLC' && c.sources.length === 1) && afterAuto.filter((c) => c.name === 'Pat Quill').length === 1 && afterAuto.find((c) => c.id === 'cpat').sources.length === 0, JSON.stringify(auto));
  await page.uncheck('#inbox-auto');
  await page.waitForTimeout(300);

  // a confidential deal's records stay out of the counts and the list until that deal is open
  // the deal is a real stored one, marked confidential: that is read from the deal each time, not copied onto its items
  await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const t = r.result.transaction('deals', 'readwrite'); t.objectStore('deals').put({ id: 'dsecret', name: 'Hidden deal', confidential: true, figures: {}, createdAt: 1, updatedAt: 1 }, 'dsecret'); t.oncomplete = res; }; }));
  await page.evaluate(async () => {
    const m = await import('./app/inboxstore.js');
    await m.proposeFromDocument({ deal: { id: 'dsecret', figures: {}, confidential: true }, doc: { name: 'secret.pdf', type: 'om' }, pages: ['Seller: Hidden Seller Trust'] });
  });
  const sec = (await kv('inbox.items')).find((x) => x.data.name === 'Hidden Seller Trust');
  check(`${size}: a confidential deal's item is stored with its deal's id and no copy of the flag`, !!sec && !('confidential' in sec) && sec.dealId === 'dsecret');
  await page.evaluate(() => { location.hash = '#connect'; });
  await page.click('#connect-tab-inbox');
  await page.waitForSelector('.inbox-item');
  const listText = await page.textContent('#connect-panel');
  check(`${size}: it is not shown, nor counted, while that deal is not open`, !/Hidden Seller Trust/.test(listText) && /confidential deal show here only while that deal is open/.test(listText));
  const omDealId = items[0].dealId;
  const pending = (await kv('inbox.items')).filter((x) => x.status === 'pending' && x.dealId === omDealId).length;
  check(`${size}: the tab count is the public items only`, (await page.textContent('#connect-tab-inbox')) === `To file (${pending})`, await page.textContent('#connect-tab-inbox'));

  // a backup carries the items
  await page.click('#connect-tab-mydata');
  await page.waitForSelector('#md-backup');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#md-backup')]);
  const bj = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check(`${size}: the backup holds the To file items and the switch`, Array.isArray(bj.kv['inbox.items']) && bj.kv['inbox.items'].length > 5 && 'inbox.prefs' in bj.kv, String(bj.kv['inbox.items']?.length));
  await page.waitForTimeout(600);
  check(`${size}: My data counts them`, (await page.$$eval('.md-kind[data-kind="inbox"] .md-count', (x) => x[0]?.textContent)) === String((await kv('inbox.items')).length), `${await page.$$eval('.md-kind[data-kind="inbox"] .md-count', (x) => x[0]?.textContent)} vs ${(await kv('inbox.items')).length}`);

  check(`${size}: no request left this origin`, outside.length === 0, outside.join(' '));
  check(`${size}: no console errors`, errors.length === 0, errors.join(' | '));
  await browser.close();
}
for (const r of R) console.log(r[0], '|', r[1], r[2] ? `| ${r[2]}` : '');
finish(R);
