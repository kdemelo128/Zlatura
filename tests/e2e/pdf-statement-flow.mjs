/* Explicit full-year PDF actuals: choose the column/number format, then separately confirm using the figures. */
import { createRequire } from 'node:module';
import { phone, BASE, finish } from './lib.mjs';
import { statementPdf } from '../pdfstatement-fixtures.js';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R = []; const check = (n,c,d='') => R.push([c?'PASS':'FAIL',n,d]);
const file = { name: 'invented-annual-statement.pdf', mimeType: 'application/pdf', buffer: Buffer.from(statementPdf()) };
for (const [size, opts] of [['phone',{}],['desktop',{viewport:{width:1280,height:900},isMobile:false,hasTouch:false,userAgent:undefined}]]) {
  const {browser,page,errors}=await phone(opts);
  try {
    await page.goto(BASE+'#deal',{waitUntil:'load'});
    await page.getByRole('button',{name:'Enter figures by hand',exact:true}).click();
    await page.waitForSelector('#t12-import');
    const saved=()=>page.evaluate(async()=>{const m=await import('./app/dealui.js');return (await m.listAllDeals()).find(d=>d.id===localStorage.getItem('zlatura.deal.current'));});
    const pick=async()=>{const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.click('#t12-import')]);await chooser.setFiles(file);};
    await pick();
    const hasChoice=await page.locator('.action-sheet .action-item').filter({hasText:'Actual 2025'}).first().waitFor({state:'visible',timeout:5000}).then(()=>true,()=>false);
    check(`${size}: importing a PDF offers its actual annual column`,hasChoice);
    if(!hasChoice) continue; // the archived old app has no PDF import route
    check(`${size}: choosing a file has not changed the statement or figures`,!(await saved()).t12&&Object.keys((await saved()).figures).length===0);
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    check(`${size}: cancelling the column leaves the deal untouched`,!(await saved()).t12);
    await pick();
    await page.locator('.action-sheet .action-item').filter({hasText:'Actual 2025'}).click();
    await page.locator('.action-sheet .action-item').filter({hasText:'Comma for thousands, point for cents'}).waitFor();
    check(`${size}: ambiguous separators ask before anything is imported`,!(await saved()).t12);
    await page.locator('.action-sheet .action-item').filter({hasText:'Comma for thousands, point for cents'}).click();
    await page.waitForSelector('#t12-use');
    let d=await saved();
    check(`${size}: PDF source and annual period are kept without invented month columns`,d.t12.source.type==='pdf'&&d.t12.months.length===0&&d.t12.period.basis==='annual'&&/PDF page 1.*2025/.test(d.t12.sheet));
    check(`${size}: the PDF read is recorded with its page count`,d.dd.docs.some(x=>x.kind==='pdf'&&x.pages===1&&x.type==='t12'));
    check(`${size}: parsing the statement has not changed deal figures`,d.figures.noi==null&&d.figures.gross==null);
    check(`${size}: the card identifies the PDF and its annual basis`,/invented-annual-statement.pdf/.test(await page.textContent('#deal-t12'))&&/annual total only/.test(await page.textContent('#deal-t12')));
    await page.click('#t12-use');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    check(`${size}: cancelling use keeps deal figures blank`,(await saved()).figures.noi==null);
    await page.click('#t12-use');
    await page.locator('.action-sheet .action-item').filter({hasText:/^Use them/}).click();
    await page.waitForFunction(async()=>{const m=await import('./app/dealui.js');return (await m.listAllDeals()).some(d=>d.figures.noi===111000);});
    d=await saved();
    check(`${size}: confirmed figures equal the independently worked totals`,d.figures.noi===111000&&d.figures.gross===126000&&d.figures.opex===15000&&d.figures.taxes===12000);
    check(`${size}: confirmed figures keep T-12 provenance`,d.sources.noi.t12===true&&d.sources.gross.t12===true);
    await page.click('#deal-undo');
    await page.waitForFunction(async()=>{const m=await import('./app/dealui.js');return (await m.listAllDeals()).every(d=>d.figures.noi==null);});
    check(`${size}: Undo removes applied figures and keeps the imported statement`,(await saved()).figures.noi==null&&!!(await saved()).t12);
    await page.reload({waitUntil:'load'});await page.waitForSelector('#t12-use');
    check(`${size}: the annual statement and Undo survive reload`,(await saved()).t12.source.type==='pdf'&&(await saved()).figures.noi==null);
    await page.addScriptTag({path:AXE});
    const bad=await page.evaluate(async()=>(await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']},rules:{'meta-viewport':{enabled:false}}})).violations.map(v=>v.id));
    check(`${size}: axe finds no accessibility violations`,!bad.length,bad.join(', '));
    await page.evaluate(()=>{location.hash='#underwrite';});
    await page.click('#uw-view-quick');   // Start from documents is in the Quick underwrite view
    await page.waitForSelector('#uwi-files',{state:'attached'});
    await page.setInputFiles('#uwi-files',file);
    await page.locator('#uw-intake [data-use]').waitFor();
    check(`${size}: Start from documents offers the annual PDF as T-12`,await page.locator('#uw-intake [data-use]').textContent()==='Use as T-12');
    check(`${size}: staging the PDF changes no figures`,(await saved()).figures.noi==null);
    // the Underwrite tab opens on the built-in tool: Chrome's note about its frame's sandbox, and the tool's files cut off when the test moves on at once, are not faults
    const real = errors.filter((e) => !/can escape its sandboxing|\/app\/uwtool\/.*ERR_ABORTED/.test(e));
    check(`${size}: no browser errors`, !real.length, real.join('\n'));
  } finally {await browser.close();}
}
for(const [s,n,d] of R) console.log(s,'|',n,d);
finish(R);
