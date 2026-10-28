/* Key dates to the calendar: a deal's open key dates and task due dates become one .ics download. The sheet is
 * axe-clean, works by keyboard alone, offers the 1031 dates only from one Closing date, and the file parses. */
import fs from 'fs';
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';

const F = new URL('./files/', import.meta.url).pathname;
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();

await page.goto(`${BASE}#deal`, { waitUntil: 'load' });
await page.setInputFiles('#om-file', `${F}om-retail.pdf`);
await page.waitForSelector('#deal-crm #deal-stage');
const addDate = async (label, date) => {
  await page.selectOption('#deal-date-label', label);
  await page.fill('#deal-date', date);
  await page.locator('#deal-crm form').filter({ has: page.locator('#deal-date') }).locator('button[type=submit]').click();
  await page.waitForTimeout(300);
};
await addDate('Due diligence expires', '2031-01-31');
await addDate('Closing', '2031-03-01');
await page.fill('#deal-task-title', 'Order the appraisal, rush; ask');
await page.fill('#deal-task-due', '2031-01-12');
await page.press('#deal-task-title', 'Enter');
await page.waitForFunction(() => /Order the appraisal/.test(document.querySelector('#deal-crm').textContent));

await page.click('#deal-crm button:has-text("Add to calendar…")');
await page.waitForSelector('dialog[open] button:has-text("Make calendar file")');
const sheet = page.locator('dialog[open]');
check('a box for each date and task, all ticked', await sheet.locator('input:checked').count() >= 3);
check('the 1031 dates are offered, unticked', await sheet.locator('label:has-text("Add the 1031 dates from the closing on")').locator('input:not(:checked):not(:disabled)').count() === 1);
check('the shared-calendar warning is on the sheet', /others may see it/.test(await sheet.innerText()));
await page.addScriptTag({ path: AXE });
const ax = await page.evaluate(async () => (await window.axe.run(document.querySelector('dialog[open]'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map((v) => v.id));
check('axe finds nothing on the sheet', ax.length === 0, ax.join(','));

// keyboard alone: tab to the 1031 box, press space, tab on to the name box, then to the button, press enter
await sheet.locator('label:has-text("Add the 1031 dates") input').focus();
await page.keyboard.press('Space');
check('space ticks the 1031 box', await sheet.locator('label:has-text("Add the 1031 dates") input').isChecked());
await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
check('tab reaches the Make button', (await page.evaluate(() => document.activeElement.textContent)) === 'Make calendar file');
const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
const text = fs.readFileSync(await dl.path(), 'utf8');
check('the file is named .ics', /-dates\.ics$/.test(dl.suggestedFilename()), dl.suggestedFilename());
const lines = text.split('\r\n');
check('CRLF lines, calendar wrapper', lines[0] === 'BEGIN:VCALENDAR' && lines.at(-2) === 'END:VCALENDAR' && lines.at(-1) === '');
check('two key dates, one task and two 1031 events, one VEVENT each', lines.filter((l) => l === 'BEGIN:VEVENT').length === 5 && lines.filter((l) => l === 'END:VEVENT').length === 5);
check('all-day with the end on the next day', text.includes('DTSTART;VALUE=DATE:20310301\r\nDTEND;VALUE=DATE:20310302'));
check('day 45 and day 180 are there', text.includes('DTSTART;VALUE=DATE:20310415') && text.includes('DTSTART;VALUE=DATE:20310828'));
check('commas and semicolons in a task title are escaped', lines.some((l) => /^SUMMARY:.*Order the appraisal\\, rush\\; ask$/.test(l)));
check('every line is at most 75 octets', lines.every((l) => Buffer.byteLength(l) <= 75));
check('the sheet says re-adding does not remove', /not removed from Calendar/.test(await sheet.innerText()));

// one date from its own button: a one-event file with the name hidden once the box is unticked
await sheet.locator('label:has-text("Show the deal name") input').uncheck();
await Promise.all([page.waitForEvent('download'), sheet.locator('button:has-text("Make calendar file")').click()]);
await page.click('dialog[open] .action-cancel');
await page.click('#deal-crm button[aria-label^="Add to calendar: Closing"]');
const one = page.locator('dialog[open]');
await one.locator('label:has-text("Show the deal name") input').waitFor();
check('the hidden-name choice is kept', !(await one.locator('label:has-text("Show the deal name") input').isChecked()));
const [d2] = await Promise.all([page.waitForEvent('download'), one.locator('button:has-text("Make calendar file")').click()]);
const t2 = fs.readFileSync(await d2.path(), 'utf8');
check('one date gives one event titled without the deal name', t2.split('\r\n').filter((l) => l === 'BEGIN:VEVENT').length === 1 && t2.includes('SUMMARY:Zlatura deal: Closing'));

for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errors);
await browser.close();
