/* The New look makes the current deal's existing sections easier to reach.
 * No navigation applies a figure or a scenario. Classic keeps its toolbar. */
import {createRequire} from 'node:module';
import {phone, BASE, SHOTS, finish} from './lib.mjs';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const R=[]; const check=(n,c,d='')=>R.push([c?'PASS':'FAIL',n,d]);
const sizes=[['compact-phone',{viewport:{width:320,height:720}}],['phone',{viewport:{width:390,height:844}}],['tablet',{viewport:{width:820,height:1180},isMobile:false,hasTouch:true,userAgent:undefined}],['desktop',{viewport:{width:1280,height:900},isMobile:false,hasTouch:false,userAgent:undefined,deviceScaleFactor:1}]];
for (const [size,opts] of sizes) {
  const {browser,page,errors}=await phone(opts);
  try {
    await page.goto(BASE+'#deal',{waitUntil:'load'});
    await page.getByRole('button',{name:'Enter figures by hand',exact:true}).click();
    await page.waitForSelector('#fig-price');
    check(`${size}: Classic keeps the section jump hidden`, !(await page.locator('#deal-jump').isVisible()));
    await page.evaluate(async()=>{(await import('./app/look.js')).setLook('new');});
    const jump=page.locator('#deal-jump');
    const present=await jump.isVisible();
    check(`${size}: New look offers a named section jump`,present);
    if (!present) continue; // archived pre-change app still reports the failed new behavior
    await page.locator('#deal-card h1').fill('Invented long example property for navigation review');
    await page.locator('#deal-card h1').press('Tab');
    const input=page.locator('#fig-price');
    await input.focus();
    for (const ch of '4.5m') await page.keyboard.type(ch);
    await page.keyboard.press('Tab');
    for (const [key,value] of [['noi','300k'],['bsf','12000'],['units','10'],['occ','95%']]) {
      await page.locator('#fig-'+key).fill(value); await page.locator('#fig-'+key).press('Tab');
    }
    await page.waitForFunction(async()=>{const m=await import('./app/dealui.js');return (await m.listAllDeals()).some(d=>d.figures.price===4500000);});
    const saved=()=>page.evaluate(async()=>{const m=await import('./app/dealui.js');return {id:m.currentDealId(),deal:(await m.listAllDeals()).find(d=>d.id===m.currentDealId())};});
    const before=await saved();
    const destinations=[['Key figures','dsec-figures','overview'],['Documents','deal-dd','overview'],['Operating statement','dsec-statement','overview'],['Financing','dsec-finance','overview'],['Rent roll','deal-rentroll','rentroll'],['Scenarios','pane-whatif','whatif'],['Contacts and follow-ups','dsec-crm','overview'],['Site visit','pane-visit','visit'],['Excel and Share','deal-toolbar',null,'deal-workbook'],['Templates and deal brief','deal-outputs',null,'deal-template']];
    for (const [name,id,pane,focusId] of destinations) {
      await jump.click();
      await page.getByRole('button',{name,exact:false}).filter({has:page.locator('.action-label')}).click();
      await page.waitForFunction(id=>{const e=document.getElementById(id);return e&&e.contains(document.activeElement);},id);
      check(`${size}: ${name} opens and receives keyboard focus`,await page.locator('#'+id).isVisible()&&(!pane||await page.locator('#tab-'+pane).getAttribute('aria-selected')==='true')&&(!focusId||await page.evaluate(()=>document.activeElement.id)===focusId));
      await page.evaluate(()=>new Promise(requestAnimationFrame));
      const visible=await page.evaluate(()=>{
        const rect=document.activeElement.getBoundingClientRect();let top=0,bottom=innerHeight;
        for(const e of document.querySelectorAll('.appbar,.deal-nav')){
          const r=e.getBoundingClientRect(),s=getComputedStyle(e),p=parseFloat(s.top);
          if(r.width&&r.height&&['fixed','sticky'].includes(s.position)&&Math.abs(r.top-(Number.isFinite(p)?p:0))<1)top=Math.max(top,r.bottom);
        }
        const bar=document.querySelector('.tabbar');if(bar){const r=bar.getBoundingClientRect();if(r.width&&r.height&&getComputedStyle(bar).position==='fixed')bottom=Math.min(bottom,r.top);}
        return {focusTop:rect.top,focusBottom:rect.bottom,top,bottom};
      });
      check(`${size}: ${name} focus is unobscured by the bars`,visible.focusTop>=visible.top-0.5&&visible.focusBottom<=visible.bottom+0.5,JSON.stringify(visible));
      const after=await saved();
      check(`${size}: ${name} preserves the deal and its figures`,after.id===before.id&&JSON.stringify(after.deal.figures)===JSON.stringify(before.deal.figures));
    }
    check(`${size}: the sticky deal name follows a rename`,await page.locator('.ws-name').textContent()===await page.locator('#deal-card h1').textContent());
    await jump.click();
    await page.addScriptTag({path:AXE});
    check(`${size}: the section dialog has its accessible name`,await page.getByRole('dialog',{name:'Jump to a deal section',exact:true}).count()===1);
    check(`${size}: the section dialog identifies the current deal`,await page.locator('.action-sheet .action-info').textContent()===before.deal.name);
    const menuAxe=await page.evaluate(async()=>(await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']},rules:{'meta-viewport':{enabled:false}}})).violations.map(x=>x.id+' '+x.nodes.map(n=>n.target.join(' ')).join(' | ')));
    check(`${size}: the open section dialog has an accessible name and no axe violations`,!menuAxe.length,menuAxe.join(', '));
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.activeElement?.id==='deal-jump');
    check(`${size}: Escape returns focus to the section jump`,true);
    await page.waitForFunction(()=>!history.state?.sheet);
    await jump.click();
    await page.goBack();
    await page.waitForFunction(()=>!document.querySelector('.action-sheet[open]'));
    check(`${size}: Back closes the section menu and keeps the deal open`,await page.evaluate(()=>location.hash)===`#deal/${before.id}`&&(await saved()).id===before.id);
    check(`${size}: Back returns focus to the section jump`,await jump.evaluate(e=>document.activeElement===e));
    const removed=await page.locator('.action-sheet').waitFor({state:'detached',timeout:1500}).then(()=>true,()=>false);
    check(`${size}: Back removes the closed section dialog`,removed);
    await page.click('#tab-overview');
    await page.locator('#tab-overview').focus(); await page.keyboard.press('ArrowRight');
    const right=await page.locator('#tab-rentroll').getAttribute('aria-selected')==='true'&&await page.locator('#tab-rentroll').evaluate(e=>document.activeElement===e);
    await page.keyboard.press('ArrowLeft');
    check(`${size}: arrow keys still select and focus the existing tabs`,right&&await page.locator('#tab-overview').getAttribute('aria-selected')==='true'&&await page.locator('#tab-overview').evaluate(e=>document.activeElement===e));
    for (const theme of ['light','dark']) {
      await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
      await page.evaluate(async()=>{(await import('./app/look.js')).setTextSize(130);});
      if(theme==='light'){
        await page.evaluate(()=>{window.__dealNavEdits=[];for(const id of ['deal-task-title','deal-task-due','deal-date'])document.getElementById(id).addEventListener('input',()=>{const t=performance.now();requestAnimationFrame(()=>window.__dealNavEdits.push(performance.now()-t));});});
        for(const[id,text,iso]of [['deal-task-title','Review the invented statement',null],['deal-task-due','01/05/2027','2027-01-05'],['deal-date','1/5/27','2027-01-05']]){
          const input=page.locator('#'+id);await input.focus();let prefix='';const bad=[];
          for(const ch of text){await page.keyboard.type(ch);prefix+=ch;if(await input.inputValue()!==prefix||!await input.evaluate(e=>document.activeElement===e&&e.isConnected))bad.push(prefix);}
          check(`${size}: ${id} keeps every typed character and focus at 130% text`,!bad.length,bad.join(', '));
          await page.keyboard.press('Tab');
          if(iso)check(`${size}: ${id} keeps the chosen day on blur`,await input.evaluate(e=>e.closest('.dateinput').value)===iso&&await input.inputValue()==='01/05/2027');
        }
        await page.locator('#deal-date-label').focus();await page.keyboard.press('ArrowDown');
        check(`${size}: the date label remains keyboard operable at enlarged text`,await page.locator('#deal-date-label').evaluate(e=>document.activeElement===e&&e.getBoundingClientRect().width>=44));
        const timings=await page.evaluate(()=>window.__dealNavEdits);
        check(`${size}: every measured CRM edit stays within 150 ms`,timings.length>0&&timings.every(t=>t<=150),`${Math.max(...timings).toFixed(1)} ms`);
      }
      check(`${size}, ${theme}: long names and 130% text fit the page`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const bad=await page.evaluate(async()=>(await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']},rules:{'meta-viewport':{enabled:false}}})).violations.map(x=>x.id+' '+x.nodes.map(n=>n.target.join(' ')).join(' | ')));
      check(`${size}, ${theme}: axe finds no accessibility violations`,!bad.length,bad.join(', '));
    }
    if (size==='phone'||size==='compact-phone') {
      const layout=await page.evaluate(()=>{const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};return {undo:box('deal-undo'),redo:box('deal-redo'),more:box('deal-more'),excel:box('deal-workbook'),share:box('deal-share'),jump:box('deal-jump')};});
      check(`${size}: Undo and Redo share the first row`,Math.abs(layout.undo.y-layout.redo.y)<1&&layout.redo.y+layout.redo.h<=layout.excel.y,JSON.stringify(layout));
      check(`${size}: Excel, Share and More follow in the next row`,Math.abs(layout.excel.y-layout.share.y)<1&&Math.abs(layout.excel.y-layout.more.y)<1&&layout.more.x>=layout.share.x+layout.share.w-1,JSON.stringify(layout));
      check(`${size}: every new or repositioned control has a 44 px target`,Object.values(layout).every(r=>r.w>=43.5&&r.h>=43.5),JSON.stringify(layout));
    }
    await page.evaluate(async()=>{(await import('./app/look.js')).setTextSize(100);});
    const order=await page.evaluate(()=>{
      const dom=[...document.querySelectorAll('#deal-toolbar button')].filter(e=>!e.disabled);
      const visual=[...dom].sort((a,b)=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return x.top<y.bottom&&y.top<x.bottom?x.left-y.left:x.top-y.top;});
      return dom.every((e,i)=>e===visual[i]);
    });
    check(`${size}: toolbar keyboard order follows its visual order`,order);
    await page.emulateMedia({colorScheme:'light'});
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:SHOTS+`deal-navigation-${size}.png`});
    await page.reload({waitUntil:'load'});await page.waitForSelector('#fig-price');
    const reopened=await saved();
    check(`${size}: the same edited deal survives navigation and reload`,reopened.id===before.id&&reopened.deal.figures.price===4500000);
    check(`${size}: no browser errors`,!errors.length,errors.join('\n'));
  } finally {await browser.close();}
}
for(const [s,n,d] of R)console.log(s,'|',n,d);
finish(R);
