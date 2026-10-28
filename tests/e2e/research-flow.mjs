/* Company research briefs end to end in the browser, at iPhone and desktop
 * size, against a stubbed POST /api/research (no server, no live model, no
 * network): the broker starts a brief from a contact and from the command
 * palette, adds a PDF and pasted text, and the request is checked for holding
 * only the company and the documents. The brief shows ten sections with each
 * claim's status in words; a tick confirms only a found, stated claim, saves at
 * once, can be undone and survives a reload; a refused or unfound claim can't
 * be ticked; a contact match is shown and nothing is written to contacts; the
 * server's refusals (429, 422) show its message. Companies and people are
 * invented. */
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => { R.push([c ? 'PASS' : 'FAIL', n, d]); if (process.env.E2E_LIVE) console.log(c ? 'PASS' : 'FAIL', '|', n); };
const AI = 'http://127.0.0.1:9';
const COMPANY = 'Harbor Example Holdings LLC';
const LINES = [
  'Harbor Example Holdings LLC is a wholly owned subsidiary of Northwind Sample Group Inc.',
  'Morgan Placeholder is the managing member of Harbor Example Holdings LLC.',
  'The registered agent for Harbor Example Holdings LLC and Quill Example Partners LP is Example Agents Inc.',
];
const TEXT = LINES.join('\n');
const claim = (ref, o) => ({ ref, section: 'S2', kind: 'subsidiary_of', subject: COMPANY, object: 'Northwind Sample Group Inc.', statement: '', quote: LINES[0], document: 1, page: null, basis: 'stated', inferredFrom: null, confidence: 'high', ...o });
const ANSWER = {
  claims: [
    claim('c1', { statement: 'Harbor is a subsidiary of Northwind' }),
    claim('c2', { section: 'S3', kind: 'officer_of', subject: 'Morgan Placeholder', object: COMPANY, statement: 'Morgan Placeholder manages Harbor', quote: LINES[1] }),
    claim('c3', { kind: 'affiliate_of', object: 'Quill Example Partners LP', statement: 'Harbor is affiliated with Quill', quote: LINES[2], basis: 'inferred', inferredFrom: 'registered_agent' }),
    claim('c4', { kind: 'owns', subject: 'Northwind Sample Group Inc.', object: 'Terrace Sample Plaza', statement: 'Northwind owns Terrace Sample Plaza', quote: 'Northwind Sample Group Inc. owns Terrace Sample Plaza outright' }),
    claim('c5', { section: 'S1', kind: 'entity_type', object: 'wholly owned subsidiary', statement: 'Harbor is a holding company', basis: 'inferred', inferredFrom: 'other' }),
    claim('c6', { section: 'S5', kind: 'party_to', statement: '<img src=x onerror="window.__pwned=1">', quote: '<img src=x onerror="window.__pwned=1"> Harbor Example Holdings LLC signed' , object: COMPANY }),
  ],
  sections: [
    { key: 'S1', text: 'Harbor is a holding company.', claimRefs: ['c5'] },
    { key: 'S2', text: 'Harbor sits under Northwind.', claimRefs: ['c1', 'c3', 'c4'] },
    { key: 'S3', text: 'Morgan Placeholder is named.', claimRefs: ['c2'] },
    { key: 'S5', text: '', claimRefs: ['c6'] },
  ],
  notChecked: ['No filings were supplied.'], notes: ['Two entities share an agent.'], model: 'claude-opus-5-5', chargedCents: 37,
};
const MANY = { // 150 claims, to time a tick on the biggest brief the app shows
  claims: Array.from({ length: 150 }, (_, i) => claim(`m${i}`, { document: 0, object: `Parent ${i} Example Corp`, statement: `Harbor is a subsidiary of Parent ${i}`, quote: `Harbor Example Holdings LLC is a wholly owned subsidiary of Parent ${i} Example Corp.` })),
  sections: [{ key: 'S2', text: '', claimRefs: Array.from({ length: 150 }, (_, i) => `m${i}`) }], notChecked: [], notes: [], model: 'claude-opus-5-5', chargedCents: 90,
};
const MANY_TEXT = Array.from({ length: 150 }, (_, i) => `Harbor Example Holdings LLC is a wholly owned subsidiary of Parent ${i} Example Corp.`).join('\n');

async function scenario(label, opts) {
  const { browser, page, errors } = await phone(opts);
  const bodies = [];
  let next = { status: 200, json: ANSWER };
  await page.route(`${AI}/**`, async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': new URL(BASE).origin, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    bodies.push(req.postData() || '');
    return route.fulfill({ status: next.status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(next.json) });
  });
  const kv = (key) => page.evaluate(async (k) => (await import(new URL('app/store.js', location.href).href)).kvGet(k), key);
  const key = async (k) => JSON.stringify(await kv(k));
  const pause = (ms = 350) => page.waitForTimeout(ms);
  const sheetText = async () => (await page.locator('#sheet-body').innerText()).replace(/\s+/g, ' ');
  const palette = async (q) => { await page.keyboard.press('Control+K'); await page.fill('#cmdk-input', q); await pause(400); await page.keyboard.press('Enter'); await pause(500); };
  const L = (s) => `${label}: ${s}`;
  const axe = async (name) => {
    await pause(450);
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
    const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'meta-viewport': { enabled: false } }, resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
    check(L(`axe: ${name}`), res.length === 0, res.join('\n    '));
  };
  const noOverflow = async (name) => check(L(`no sideways scroll: ${name}`), await page.evaluate(() => { const b = document.getElementById('sheet-body'); return b.scrollWidth <= b.clientWidth + 1; }));
  const row = (s) => page.locator('.rs-claim', { hasText: s }).first();
  const section = (k) => page.locator(`details[data-section="${k}"]`);
  const openSection = async (k) => { if (!(await section(k).evaluate((d) => d.open))) await section(k).locator('summary').click(); };

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  // AI on, pointed at the stub
  await palette('AI settings');
  await page.fill('#ai-url', AI);
  await page.fill('#ai-token', 'e2e-token-0123456789abcdef');
  await page.check('#ai-enabled');
  await page.click('#sheet-foot button:has-text("Save")');
  await pause();
  // two invented contacts: one at the company, one named as an officer in the answer
  for (const [name, company] of [['Dana Sample', COMPANY], ['Morgan Placeholder', 'Unrelated Example Partners']]) {
    await palette('New contact');
    await page.fill('#contact-name', name);
    await page.fill('#contact-company', company);
    await page.click('#contact-save');
    await pause();
  }
  const contactsBefore = await key('crm.contacts');

  // ---- start from a contact's sheet
  await palette('Dana Sample');
  await page.waitForSelector('#contact-research');
  check(L('the contact sheet offers "Research company"'), await page.locator('#contact-research').isVisible());
  await page.click('#contact-research');
  await page.waitForSelector('#rs-company');
  check(L('it prefills the company only'), (await page.inputValue('#rs-company')) === COMPANY && (await page.inputValue('#rs-state')) === '');
  check(L('the Research button waits for a source and the entitlement tick'), await page.locator('#rs-go').isDisabled());
  // typing, one character at a time
  await page.fill('#rs-state', '');
  let typedOk = true;
  const wanted = 'TX';
  await page.focus('#rs-state');
  for (let i = 0; i < wanted.length; i++) {
    await page.keyboard.type(wanted[i]);
    typedOk = typedOk && (await page.inputValue('#rs-state')) === wanted.slice(0, i + 1) && (await page.evaluate(() => document.activeElement.id)) === 'rs-state';
  }
  await page.focus('#rs-company');
  await page.keyboard.press('End');
  await page.keyboard.type(' Z');
  typedOk = typedOk && (await page.inputValue('#rs-company')) === `${COMPANY} Z`;
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  check(L('typing character by character keeps what was typed and the focus'), typedOk && (await page.inputValue('#rs-company')) === COMPANY);
  await page.setInputFiles('#rs-file', F + 'om-retail.pdf');
  await page.waitForSelector('#rs-sources li');
  check(L('an uploaded PDF is listed with its page count'), /om-retail\.pdf · \d+ pages/.test(await page.textContent('#rs-sources')), await page.textContent('#rs-sources'));
  await page.click('button:has-text("Paste text")');
  await page.fill('#rs-paste', TEXT);
  await page.click('#rs-paste-add');
  await page.waitForFunction(() => document.querySelectorAll('#rs-sources li').length === 2);
  check(L('pasted text is a source of its own'), /Pasted text 1/.test(await page.textContent('#rs-sources')));
  check(L('still disabled until the entitlement is ticked'), await page.locator('#rs-go').isDisabled());
  await noOverflow('start sheet');
  await axe('start sheet');
  await page.check('#rs-entitled');
  check(L('ticking the entitlement enables Research'), await page.locator('#rs-go').isEnabled());
  await page.screenshot({ path: `${SHOTS}research-start-${label}.png` });
  await page.click('#rs-go');
  await page.waitForSelector('dialog.action-sheet');
  const confirmText = (await page.textContent('dialog.action-sheet')).replace(/\s+/g, ' ');
  check(L('the send is confirmed first: host, source count and "Contact names on this device are not sent"'), /Send 2 sources to 127\.0\.0\.1:9\?/.test(confirmText) && /the 2 files and pasted texts, in full/.test(confirmText) && /Contact names on this device are not sent/.test(confirmText) && bodies.length === 0, confirmText);
  await page.locator('dialog.action-sheet .action-item', { hasText: 'Send and research' }).click();
  await page.waitForSelector('details[data-section="S10"]', { timeout: 20000 });
  const sent = JSON.parse(bodies[0]);
  check(L('the request holds only the company and the documents'), JSON.stringify(Object.keys(sent).sort()) === '["documents","subject"]' && sent.subject.name === COMPANY && sent.subject.state === 'TX' && sent.documents.length === 2 && sent.documents[0].mediaType === 'application/pdf' && sent.documents[1].text === TEXT);
  // the PDF's base64 is left out (random letters could spell a name); Morgan Placeholder is a contact AND named in the pasted source, so only the source text may carry that name
  const bare = JSON.stringify({ ...sent, documents: sent.documents.map((d) => ({ ...d, data: undefined })) });
  check(L('no contact name is in the request'), !/Dana|Unrelated Example/.test(bare) && JSON.stringify(sent.subject) === JSON.stringify({ name: COMPANY, state: 'TX' }) && sent.documents[1].text === TEXT);

  // ---- the brief
  check(L('the brief shows its ten sections in order'), JSON.stringify(await page.locator('details.rs-sec > summary').evaluateAll((s) => s.map((x) => x.firstChild.textContent))) === JSON.stringify(['Who they are', 'Parents and affiliates', 'People named', 'Property', 'Filings and transactions', 'Announcements', 'Why it may matter', 'Possible links to your contacts', 'Not accepted as evidence', 'What was not checked']));
  check(L('the cost the server charged is shown'), /Cost of this brief: \$0\.37/.test(await page.textContent('#rs-meta')), await page.textContent('#rs-meta'));
  check(L('the counts are in words'), (await page.textContent('#rs-counts')).replace(/\s+/g, ' ').trim() === '0 confirmed5 hypotheses1 refused', await page.textContent('#rs-counts'));
  await openSection('S2');
  check(L('the AI text is labelled'), /Written by AI from the claims below; only ticked claims are confirmed\./.test(await section('S2').innerText()));
  const c1 = row('Harbor is a subsidiary of Northwind');
  const t1 = (await c1.innerText()).replace(/\s+/g, ' ');
  check(L('a found, stated claim is a "Hypothesis: not confirmed" until ticked, with its reason'), /Hypothesis: not confirmed/.test(t1) && /Found in your source when checked/.test(t1) && /waiting for you to tick it/.test(t1), t1);
  check(L('and its checkbox is enabled'), await c1.locator('input').isEnabled() && !(await c1.locator('input').isChecked()));
  await openSection('S9'); // a refused claim is shown there, not in its own section
  check(L('a refused claim is not left in its own section'), !(await section('S2').innerText()).includes('affiliated with Quill'));
  const c3 = row('Harbor is affiliated with Quill');
  const t3 = (await c3.innerText()).replace(/\s+/g, ' ');
  check(L('a registered-agent claim reads "Refused as proof" with its reason'), /Refused as proof/.test(t3) && /registered agent is not evidence/.test(t3), t3);
  check(L('a refused claim can\'t be ticked'), await c3.locator('input').isDisabled());
  const c4 = row('Northwind owns Terrace');
  check(L('a quote not found in the source is a hypothesis that can\'t be ticked'), /Hypothesis: not confirmed/.test(await c4.innerText()) && /not found in the source you supplied/.test(await c4.innerText()) && await c4.locator('input').isDisabled());
  await openSection('S1');
  const c5 = row('Harbor is a holding company');
  check(L('an inferred claim can\'t be ticked, and says it is not stated'), await c5.locator('input').isDisabled() && /Inferred: other/.test(await c5.innerText()) && /does not state it/.test(await c5.innerText()));
  await c3.locator('input').click({ force: true, timeout: 2000 }).catch(() => {});
  await c4.locator('input').click({ force: true, timeout: 2000 }).catch(() => {});
  check(L('forcing a click on those changes nothing saved'), (await kv('research.briefs'))[0].claims.every((c) => c.ticked === false));
  await openSection('S5');
  check(L('markup in a claim stays text'), await page.locator('details[data-section="S5"] img').count() === 0 && (await page.evaluate(() => window.__pwned)) === undefined && /<img src=x onerror/.test(await section('S5').innerText()));
  check(L('"Not accepted as evidence" lists the refused claim'), /Harbor is affiliated with Quill/.test(await section('S9').innerText()));
  await openSection('S8');
  const s8 = (await section('S8').innerText()).replace(/\s+/g, ' ');
  check(L('a contact match reads "This may be your contact X" and "Not saved to the contact"'), /This may be your contact Morgan Placeholder/.test(s8) && /This may be your contact Dana Sample/.test(s8) && /Not saved to the contact/.test(s8), s8);
  check(L('nothing was written to contacts'), (await key('crm.contacts')) === contactsBefore);
  await openSection('S10');
  check(L('"What was not checked" shows the reader\'s gaps'), /No filings were supplied/.test(await section('S10').innerText()) && /Two entities share an agent/.test(await section('S10').innerText()));
  await noOverflow('brief');
  await axe('brief with sections open');
  await page.screenshot({ path: `${SHOTS}research-brief-${label}.png` });

  // ---- ticks
  await c1.locator('input').check();
  await page.waitForFunction(() => document.querySelector('.rs-claim[data-status="confirmed"]'));
  const saved = (await kv('research.briefs'))[0].claims.find((c) => c.statement === 'Harbor is a subsidiary of Northwind');
  check(L('a tick confirms a found, stated claim and is saved at once'), saved.ticked === true && typeof saved.tickedAt === 'number' && /Confirmed/.test(await row('Harbor is a subsidiary of Northwind').innerText()) && /ticked by you/.test(await row('Harbor is a subsidiary of Northwind').innerText()));
  const focusedClaim = () => page.evaluate(() => { const a = document.activeElement; return a && a.type === 'checkbox' && a.closest('.rs-claim') ? a.closest('.rs-claim').innerText : null; });
  check(L('after a tick the ticked checkbox still has focus'), /Harbor is a subsidiary of Northwind/.test((await focusedClaim()) || ''), String(await focusedClaim()));
  check(L('the tick is announced in a live region that was already on the page'), /Confirmed: Harbor is a subsidiary of Northwind/.test(await page.locator('#sheet-body [role=status]').textContent()) && (await page.locator('#sheet-body [role=status]').getAttribute('aria-live')) === 'polite');
  check(L('the counts follow'), /1 confirmed4 hypotheses1 refused/.test((await page.textContent('#rs-counts')).replace(/\s+/g, '')) || /1 confirmed/.test(await page.textContent('#rs-counts')));
  check(L('a tick comes with an Undo'), await page.locator('#sheet-body .undo-bar button:has-text("Undo")').isVisible());
  await page.click('#sheet-body .undo-bar button:has-text("Undo")');
  await page.waitForFunction(() => !document.querySelector('.rs-claim[data-status="confirmed"]'));
  check(L('after Undo the checkbox has focus again'), /Harbor is a subsidiary of Northwind/.test((await focusedClaim()) || ''), String(await focusedClaim()));
  check(L('Undo unticks it, saved at once'), (await kv('research.briefs'))[0].claims.every((c) => c.ticked === false));
  await row('Harbor is a subsidiary of Northwind').locator('input').check();
  await page.waitForFunction(() => document.querySelector('.rs-claim[data-status="confirmed"]'));
  await openSection('S3');
  await row('Morgan Placeholder manages Harbor').locator('input').check();
  await pause();
  // Review: one item per brief while claims wait; none once all are ticked
  await row('Morgan Placeholder manages Harbor').locator('input').uncheck();
  await pause();
  await page.click('#sheet-close');
  await page.evaluate(() => { location.hash = '#review'; });
  await page.waitForSelector('.review-research', { timeout: 5000 });
  check(L('Review has one item for the brief'), await page.locator('.review-research').count() === 1 && /1 claim to tick/.test(await page.locator('.review-research').innerText()), await page.locator('.review-research').innerText());
  await axe('review with a research item');
  // survives a reload
  await page.reload({ waitUntil: 'load' });
  await pause(600);
  await palette('Research briefs');
  await page.waitForSelector('.review-item[data-brief]');
  const listText = (await page.locator('#sheet-body').innerText()).replace(/\s+/g, ' ');
  check(L('the list shows subject, date, status and counts in words'), /Harbor Example Holdings LLC/.test(listText) && /Ready/.test(listText) && /1 confirmed, 4 hypotheses, 1 refused/.test(listText) && /Kept on this device until/.test(listText) && /Backups made earlier keep their own copy/.test(listText), listText);
  await axe('briefs list');
  await page.locator('.review-item[data-brief] button:has-text("Open")').click();
  await page.waitForSelector('details[data-section="S2"]');
  await openSection('S2');
  check(L('a tick survives a reload'), (await row('Harbor is a subsidiary of Northwind').getAttribute('data-status')) === 'confirmed' && await row('Harbor is a subsidiary of Northwind').locator('input').isChecked());

  // ---- delete with undo
  await page.click('#sheet-foot button:has-text("Delete brief")');
  await pause();
  check(L('Delete removes the brief and offers Undo'), (await kv('research.briefs')) === null && await page.locator('.toast button:has-text("Undo")').isVisible());
  await page.click('.toast button:has-text("Undo")');
  await pause();
  check(L('Undo brings it back with its tick'), (await kv('research.briefs'))?.length === 1 && (await kv('research.briefs'))[0].claims.some((c) => c.ticked === true));

  // ---- start from the command palette; the server refuses
  const refusals = [
    [429, { error: 'daily_budget', message: 'This device has used today\'s 200 AI requests. It resets at 00:00 UTC, in 3 h 2 min.' }, /used today's 200 AI requests/],
    [422, { error: 'job_over_budget', message: 'This job would cost more than the 300 cent limit. Send less text.' }, /more than the 300 cent limit/],
  ];
  for (const [status, json, re] of refusals) {
    next = { status, json };
    await palette('Research a company');
    await page.waitForSelector('#rs-company');
    check(L('from the palette the company starts empty'), (await page.inputValue('#rs-company')) === '');
    await page.fill('#rs-company', 'Quill Example Partners LP');
    await page.click('button:has-text("Paste text")');
    await page.fill('#rs-paste', 'Quill Example Partners LP is a limited partnership.');
    await page.click('#rs-paste-add');
    await page.check('#rs-entitled');
    await page.click('#rs-go');
    await page.locator('dialog.action-sheet .action-item', { hasText: 'Send and research' }).click();
    await page.waitForSelector('#rs-error', { timeout: 10000 });
    check(L(`a ${status} shows the server's message`), re.test(await page.textContent('#rs-error')), await page.textContent('#rs-error'));
    if (status === 429) await axe('error state');
  }
  await palette('Research briefs');
  await page.waitForSelector('.review-item[data-brief]');
  check(L('failed briefs are listed as Failed with the message'), (await page.locator('.review-item[data-brief]:has-text("Failed")').count()) === 2 && /more than the 300 cent limit/.test(await page.textContent('#sheet-body')));
  // delete from the list: focus goes to Undo, the deletion is announced, Undo puts the row back and focuses it
  const rows = await page.locator('.review-item[data-brief]').count();
  await page.locator('.review-item[data-brief]:has-text("Failed")').first().locator('button:has-text("Delete")').click();
  await page.waitForFunction((n) => document.querySelectorAll('.review-item[data-brief]').length === n - 1, rows);
  check(L('after Delete in the list the Undo button has focus'), await page.evaluate(() => document.activeElement.textContent === 'Undo' && !!document.activeElement.closest('.undo-bar')));
  check(L('the deletion is announced'), /deleted\./.test(await page.locator('#sheet-body [role=status]').textContent()));
  await page.keyboard.press('Enter');
  await page.waitForFunction((n) => document.querySelectorAll('.review-item[data-brief]').length === n, rows);
  check(L('Undo in the list brings the brief back'), (await kv('research.briefs')).length === rows);
  await page.click('#sheet-close');

  // ---- unsaved contact edits are not dropped by "Research company"
  await palette('Morgan Placeholder');
  await page.waitForSelector('#contact-research');
  const before2 = await key('crm.contacts');
  await page.fill('#contact-notes', 'Met at the invented conference');
  await page.click('#contact-research');
  await page.waitForSelector('dialog.action-sheet');
  check(L('with unsaved edits the sheet asks first'), /unsaved changes/.test(await page.textContent('dialog.action-sheet')) && (await key('crm.contacts')) === before2);
  await page.locator('dialog.action-sheet .action-item', { hasText: 'Research without saving' }).click();
  await page.waitForSelector('#rs-company');
  check(L('"Research without saving" leaves the contact as it was'), (await key('crm.contacts')) === before2 && (await page.inputValue('#rs-company')) === 'Unrelated Example Partners');
  await page.click('#sheet-close');
  await palette('Morgan Placeholder');
  await page.waitForSelector('#contact-research');
  await page.fill('#contact-notes', 'Met at the invented conference');
  await page.click('#contact-research');
  await page.locator('dialog.action-sheet .action-item', { hasText: 'Save, then research' }).click();
  await page.waitForSelector('#rs-company');
  check(L('"Save, then research" saves the edit first'), (await kv('crm.contacts')).some((k) => k.name === 'Morgan Placeholder' && k.notes === 'Met at the invented conference'));
  await page.click('#sheet-close');

  // ---- 150 claims: a tick stays quick
  next = { status: 200, json: MANY };
  await palette('Research a company');
  await page.fill('#rs-company', COMPANY);
  await page.click('button:has-text("Paste text")');
  await page.fill('#rs-paste', MANY_TEXT);
  await page.click('#rs-paste-add');
  await page.check('#rs-entitled');
  await page.click('#rs-go');
  await page.locator('dialog.action-sheet .action-item', { hasText: 'Send and research' }).click();
  await page.waitForSelector('details[data-section="S2"]', { timeout: 20000 });
  await openSection('S2');
  const ms = await page.evaluate(() => new Promise((res) => {
    const cb = document.querySelector('.rs-claim input:not(:disabled)');
    const t = performance.now();
    new MutationObserver((_, o) => { if (document.querySelector('.rs-claim[data-status="confirmed"]')) { o.disconnect(); res(performance.now() - t); } }).observe(document.getElementById('sheet-body'), { childList: true, subtree: true });
    cb.click();
  }));
  check(L('with 150 claims a tick shows in under 150 ms'), ms < 150, `${Math.round(ms)} ms`);
  await browser.close();
  return errors;
}

const errs = [];
const expected = /status of 42[29]/;
errs.push(...(await scenario('phone', {})).filter((e) => !expected.test(e)));
errs.push(...(await scenario('desktop', { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 })).filter((e) => !expected.test(e)));
for (const [st, n, d] of R) console.log(st, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errs);
