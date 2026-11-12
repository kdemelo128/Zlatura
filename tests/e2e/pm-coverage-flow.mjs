/* A filtered PM report stays behind the existing explicit QC/Use/Undo workflow. */
import {createRequire} from 'node:module';
import {phone,BASE,finish} from './lib.mjs';
import {pmCoveragePdf} from '../pmcoverage-fixtures.js';
const AXE=createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R=[];const check=(n,c,d='')=>R.push([c?'PASS':'FAIL',n,d]);
for(const[size,opts]of [['phone',{}],['desktop',{viewport:{width:1280,height:900},isMobile:false,hasTouch:false,userAgent:undefined}]]){
 const{browser,page,errors}=await phone(opts);
 try{
  await page.goto(BASE+'#deal',{waitUntil:'load'});
  await page.getByRole('button',{name:'Enter figures by hand',exact:true}).click();
  await page.click('#tab-rentroll');
  const saved=()=>page.evaluate(async()=>{const m=await import('./app/dealui.js');return (await m.listAllDeals()).find(d=>d.id===m.currentDealId());});
  const open=async(filtered)=>{
   await page.locator('#deal-rentroll button[aria-label="More rent roll actions"]').click();
   const[chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('.action-sheet .action-item',{hasText:'Import from PDF'}).click()]);
   await chooser.setFiles({name:filtered?'invented-filtered-pm.pdf':'invented-complete-pm.pdf',mimeType:'application/pdf',buffer:Buffer.from(pmCoveragePdf(filtered))});
   await page.waitForSelector('#rrpdf-use');await page.locator('.rrpdf-rows tbody tr').first().waitFor();
  };
  await open(false);
  check(`${size}: All/All report has no failed coverage check`,await page.locator('[data-check="layout:report-scope"]').count()===0);
  await page.click('#rrpdf-use');
  await page.locator('.toast',{hasText:'3 units imported from invented-complete-pm.pdf'}).waitFor();
  const original=await saved();
  check(`${size}: the original rent roll has three source-marked leases`,original.rr.leases.length===3&&original.rr.leases.every(l=>l.source.file==='invented-complete-pm.pdf'));
  await open(true);
  const failed=page.locator('#rrpdf-qc .qc-item.qc-fail[data-check="layout:report-scope"]');
  const found=await failed.count()===1;
  check(`${size}: filtered report has a failed coverage check`,found);
  if(!found){await page.click('#sheet-close');continue;} // archived app still reports the missing guard
  check(`${size}: the check identifies the printed filter`,/Unit Filter: All.*Status Filter: Occupied/s.test(await failed.textContent()));
  await page.locator('input[name="rrpdf-mode"][value="replace"]').check();
  check(`${size}: Replace stays disabled while coverage fails`,await page.locator('#rrpdf-use').isDisabled());
  check(`${size}: preview leaves prior leases and figures intact`,JSON.stringify((await saved()).rr.leases)===JSON.stringify(original.rr.leases)&&JSON.stringify((await saved()).figures)===JSON.stringify(original.figures));
  await page.addScriptTag({path:AXE});
  const violations=await page.evaluate(async()=>(await window.axe.run(document.querySelector('#sheet'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>v.id));
  check(`${size}: held preview has no axe violations`,!violations.length,violations.join(', '));
  await page.locator('#rrpdf-qc button',{hasText:'Accept the reading as it stands'}).click();
  check(`${size}: explicit acceptance enables Use`,!await page.locator('#rrpdf-use').isDisabled());
  await page.click('#sheet-close');await page.waitForFunction(()=>!history.state?.sheet);
  check(`${size}: cancelling after acceptance still preserves the old leases`,JSON.stringify((await saved()).rr.leases)===JSON.stringify(original.rr.leases));
  await open(true);
  check(`${size}: a new preview requires its own acceptance`,await failed.count()===1);
  await page.locator('input[name="rrpdf-mode"][value="replace"]').check();
  check(`${size}: the new preview is held until accepted again`,await page.locator('#rrpdf-use').isDisabled());
  await page.locator('#rrpdf-qc button',{hasText:'Accept the reading as it stands'}).click();
  await page.click('#rrpdf-use');
  await page.locator('.toast',{hasText:'3 units imported from invented-filtered-pm.pdf'}).waitFor();
  check(`${size}: confirmed replacement records the chosen PDF source`,(await saved()).rr.leases.every(l=>l.source.kind==='pdf'&&l.source.page===1));
  // Read history after its storage-backed Undo label refreshes, rather than
  // treating the in-memory deal as evidence that autosave has completed.
  await page.locator('#deal-undo[aria-label*="invented-filtered-pm.pdf"][aria-label*="1 failed check accepted"]').waitFor({state:'attached'});
  const history=await page.evaluate(async()=>{const s=await import('./app/store.js');const m=await import('./app/dealui.js');return await s.historyOf(m.currentDealId());});
  check(`${size}: the import history records the accepted failed check`,history.some(h=>/invented-filtered-pm.pdf/.test(h.label)&&/1 failed check accepted/.test(h.label)),history.map(h=>h.label).join(' | '));
  const undoLabel=await page.locator('#deal-undo').getAttribute('aria-label');
  await page.locator('.toast button',{hasText:'Undo'}).click();
  check(`${size}: Undo restores the prior leases and source`,JSON.stringify((await saved()).rr.leases)===JSON.stringify(original.rr.leases));
  check(`${size}: imported rows never silently apply deal figures`,JSON.stringify((await saved()).figures)===JSON.stringify(original.figures));
  await page.waitForFunction(label=>document.getElementById('deal-undo').getAttribute('aria-label')!==label,undoLabel);
  const persisted=await page.evaluate(async()=>{const s=await import('./app/store.js');const m=await import('./app/dealui.js');return await s.loadDeal(m.currentDealId());});
  check(`${size}: Undo is durably saved`,persisted.rr.leases.every(l=>l.source.file==='invented-complete-pm.pdf'));
  await page.reload({waitUntil:'load'});await page.waitForSelector('#fig-price');
  check(`${size}: the restored prior source survives reload`,(await saved()).rr.leases.every(l=>l.source.file==='invented-complete-pm.pdf'));
  check(`${size}: no browser errors`,!errors.length,errors.join('\n'));
 }finally{await browser.close();}
}
for(const[s,n,d]of R)console.log(s,'|',n,d);finish(R);
