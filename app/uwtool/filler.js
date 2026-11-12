
(function(){
'use strict';
const $=id=>document.getElementById(id);
const TB=Tabular,EX=Extract,P=Pipeline,DR=DocReaders;
function el(t,a,...k){const e=document.createElement(t);if(a)for(const x in a){if(a[x]===null||a[x]===undefined||a[x]===false)continue;if(x==='class')e.className=a[x];else if(x==='text')e.textContent=a[x];else if(x.startsWith('on'))e.addEventListener(x.slice(2),a[x]);else e.setAttribute(x,a[x]);}for(const c of k.flat())if(c!==null&&c!==undefined)e.append(c);return e;}
const b64=s=>{const bin=atob(s.replace(/\s+/g,'')),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u;};
let spec,templateBytes,ctx,fatal=null;
try{
  spec=null;templateBytes=(window.UWTemplate&&window.UWTemplate.bytes)||null;
  pdfjsLib.GlobalWorkerOptions.workerSrc='pdf.worker.js';
  ctx={pdfjs:pdfjsLib,XLSX:XLSX,JSZip:JSZip,spec,templateBytes,opts:{}};
}catch(e){fatal=e;}

const S={reimbTouched:false,reimbAuto:false,why:'checking',pick:{},files:[],sample:null,dl:null,imgs:false,busy:false,result:null};
let seq=0;


// ---- own-key Claude connection (only when the page runs outside claude.ai)
const toB64=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.onerror=rej;r.readAsDataURL(b);});
function offFetch(){throw new Error('off');}
function useKey(key,quiet){
  S.key=key;
  const fn=async(input,opts)=>{
    opts=opts||{};const content=[];
    for(const im of (opts.images||[]))content.push({type:'image',source:{type:'base64',media_type:(im.type&&/^image\/(png|jpeg|webp|gif)$/.test(im.type))?im.type:'image/png',data:await toB64(im)}});
    content.push({type:'text',text:String(input)});
    let r;
    try{r=await offFetch({method:'POST',signal:opts.signal,headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify(Object.assign({model:$('f_model').value.trim()||'claude-sonnet-5-5',max_tokens:16000,messages:[{role:'user',content}]},opts.webSearch?{tools:[{type:'web_search_20250305',name:'web_search',max_uses:8}]}:{}))});}
    catch(e){throw Object.assign(new Error('Outside AI reading is turned off in this build. Use the manual and paste paths.'),{code:'network'});}
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw Object.assign(new Error((j.error&&j.error.message)||('HTTP '+r.status)),{code:r.status===401?'bad_key':r.status===429?'rate_limited':'api'});
    {const tb=(j.content||[]).filter(x=>x.type==='text').map(x=>x.text);const withJson=tb.filter(t=>t.includes('{'));return {text:opts.webSearch&&withJson.length?withJson[withJson.length-1]:tb.join(''),truncated:j.stop_reason==='max_tokens'};}
  };
  fn.limits=async()=>({images:true});fn.web=true;
  S.sample=fn;S.imgs=true;S.why='ok';S.ownKey=true;
  if(!quiet)render();
}
$('b_key').addEventListener('click',()=>{const k=$('f_key').value.trim();const m=$('keymsg');if(!/^sk-ant-/.test(k)){m.hidden=false;m.className='msg bad';m.textContent='That does not look like an Anthropic API key (it starts with sk-ant-).';return;}
  m.hidden=false;m.className='msg bad';m.textContent='Outside AI reading is turned off in this build. Use the manual and paste paths.';try{localStorage.removeItem('uw_key');}catch(e){}$('f_key').value='';});
$('b_unkey').addEventListener('click',()=>{S.sample=null;S.imgs=false;S.ownKey=false;S.key=null;S.why='noclaude';try{localStorage.removeItem('uw_key');}catch(e){}render();});

// ---- intake
const drop=$('drop'),pick=$('pick');
drop.addEventListener('click',()=>pick.click());
drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick.click();}});
['dragenter','dragover'].forEach(n=>drop.addEventListener(n,e=>{e.preventDefault();drop.classList.add('over');}));
['dragleave','drop'].forEach(n=>drop.addEventListener(n,e=>{e.preventDefault();drop.classList.remove('over');}));
drop.addEventListener('drop',e=>addFiles([...e.dataTransfer.files]));
pick.addEventListener('change',()=>{addFiles([...pick.files]);pick.value='';});

async function addFiles(list,depth=0){
  $('ack').checked=false;
  if(fatal){return;}
  for(const f of list){
    if(/\.zip$/i.test(f.name)){try{if(depth>=3)throw Error('Nested ZIP limit reached. Extract this folder locally and upload its documents.');const z=await JSZip.loadAsync(await f.arrayBuffer());const entries=Object.values(z.files).filter(x=>!x.dir&&!x.name.startsWith('__MACOSX/')&&!x.name.split('/').some(p=>p.startsWith('.')));let expanded=0;for(const x of entries){if(/\.(mp4|mov|psd|exe|dmg)$/i.test(x.name)){UWEditor.toast('Skipped unsupported media: '+x.name);continue;}const size=x._data?.uncompressedSize||0;if(size>100*1024*1024||expanded+size>512*1024*1024)throw Error('ZIP expansion limit reached. Upload remaining documents separately.');const b=await x.async('uint8array');expanded+=b.byteLength;await addFiles([{name:x.name,arrayBuffer:async()=>b.buffer}],depth+1);}}catch(e){UWEditor.toast('Could not open ZIP: '+e.message)}continue;}
    const ent={id:++seq,name:f.name,state:'reading',kind:null,doc:null,text:'',notes:[],bytes:null,scanned:false,err:null,ai:{busy:false,msg:null,kind:'auto',paste:''}};
    S.files.push(ent);render();
    try{
      const bytes=new Uint8Array(await f.arrayBuffer());const same=S.files.find(x=>x!==ent&&x.bytes&&x.bytes.length===bytes.length&&x.bytes.every((v,i)=>v===bytes[i]));if(same){same.aliases=[...new Set([...(same.aliases||[]),f.name])];same.notes=[...(same.notes||[]),'Identical upload skipped: '+f.name];S.files=S.files.filter(x=>x!==ent);UWEditor.toast('Already added: '+same.name);render();continue;}ent.bytes=bytes;
      const r=await P.readFile(ctx,{name:f.name,bytes:bytes.slice()});
      for(const candidate of r.alternatives||[])S.files.push({id:++seq,name:f.name+' · '+candidate.sheet,state:'done',kind:candidate.kind,doc:candidate.doc,text:'',notes:['Separate worksheet candidate. Select the correct rent roll or statement; duplicate versions are not summed.'],bytes:bytes.slice(),sheet:candidate.sheet,scanned:false,ai:{busy:false,msg:null,kind:candidate.kind,paste:''}});
      ent.wordPages=r.wordPages||[];ent.layoutText=r.layoutText||'';ent.pageCoverage=r.pageCoverage||[];ent.kind=r.kind;ent.doc=r.doc||null;ent.text=r.text||'';ent.notes=r.notes||[];ent.sheet=r.sheet;ent.image=!!r.image;ent.mime=r.mime;if(r.hint&&r.hint!=='auto')ent.ai.kind=r.hint;ent.src=r.src;ent.scanned=!!r.scanned;ent.err=r.error||null;ent.state='done';if(ent.image&&!ent.ai.kind)ent.ai.kind='auto';
      if(!ent.doc&&(ent.scanned||ent.text)||ent.pageCoverage.some(p=>p.needsOCR)){let lastProgress=0;await builtInRead(ent,{set textContent(v){ent.progress=v;const now=performance.now();if(now-lastProgress>200){lastProgress=now;render();}}});}
    }catch(e){ent.state='done';ent.kind='error';ent.err=String(e&&e.message||e);}
    S.result=null;render();
  }
  autoPublicLookup();
}

// ---- derived
const rrKey=d=>String(d.meta.as_of||d.meta.created_on||'');
const statementKey=d=>{const v=String(d.meta?.period_end||'');const match=v.match(/(20\d{2})[-/]?(\d{2})/);if(match)return match[1]+match[2];const month=d.months?.[11]||'';const y=month.match(/20\d{2}/)?.[0]||'0000',mi=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(month.slice(0,3).toLowerCase())+1;return y+String(mi).padStart(2,'0');};
const pickDoc=k=>{const l=S.files.filter(x=>x.kind===k&&x.doc);if(k==='statement')l.sort((a,b)=>statementKey(b.doc).localeCompare(statementKey(a.doc)));else if(k==='rent_roll')l.sort((a,b)=>rrKey(b.doc).localeCompare(rrKey(a.doc)));const ch=S.pick[k]&&l.find(x=>x.id===S.pick[k]);if(ch){l.splice(l.indexOf(ch),1);l.unshift(ch);}return l;};
const rrEnt=()=>pickDoc('rent_roll')[0]||null,stEnt=()=>pickDoc('statement')[0]||null,csEnt=()=>S.files.find(x=>x.kind==='costar')||null;
const fails=()=>{let n=S.files.filter(e=>e.pageCoverage?.some(p=>p.needsOCR)||e.ocrReviewRequired||e.doc?.issues?.some(x=>/circular|no printed totals/i.test(x))).length;for(const e of [rrEnt(),stEnt()])if(e)n+=e.doc.tie_out.filter(t=>!t.ok).length;return n;};

// ---- Claude reader
const RR_SCHEMA='{"property":string|null,"address":string|null,"as_of":"YYYY-MM-DD"|null,"created_on":"YYYY-MM-DD"|null,"rent_basis":"monthly"|"annual","units":[{"unit":string,"tenant":string|null,"sqft":number|null,"rent":number|null,"charges":number|null,"lease_from":"YYYY-MM-DD"|null,"lease_to":"YYYY-MM-DD"|null,"next_date":"YYYY-MM-DD"|null,"next_amt":number|null,"deposit":number|null,"past_due":number|null,"lease_type":"NNN"|"Modified Gross"|"Gross"|null (only if the document states it for this tenant or for all leases),"escalation_pct":number|null (annual % rent escalation if stated for this tenant),"page":number}],"all_leases_nnn":true|false (true only if the document states all leases are triple net),"escalation_note":string|null,"column_used":string|null,"reader_notes":[strings: anything illegible, ambiguous or assumed],"printed_totals":{"units":number|null,"sqft":number|null,"rent":number|null,"charges":number|null,"deposit":number|null,"past_due":number|null,"monthly_total":number|null (printed combined monthly total, rent + charges),"annual_rent":number|null (printed annual base-rent total)}|null}';
const IS_SCHEMA='{"property":string|null,"address":string|null,"basis":"Cash"|"Accrual"|null,"created_on":"YYYY-MM-DD"|null,"period":"months"|"annual"|"ytd","year":number|null (annual/ytd: the year the statement ends in),"through_month":number|null (ytd: month number the statement runs to, e.g. 6 for "ending 6/30"),"column_used":string|null,"reader_notes":[strings: anything illegible, ambiguous or assumed],"months":["Jan 2026", ... exactly 12 labels in order] (period "months" only),"lines":[{"label":string,"type":"Income"|"Expense","group":string|null,"monthly_due":number|null (annual/ytd statements that print a monthly base rent due per tenant),"values":[12 numbers, one per month] (period "months" only),"total":number,"below_noi":true|false,"page":number}],"subtotals":[{"label":string,"type":"Income"|"Expense","group":string|null,"values":[12 numbers],"total":number|null,"closes_header":string|null}]}';
function prompt(kind,text){
  if(kind==='supporting')return UWDiligence.prompt(text);
  const common='You are extracting data from a commercial real estate document. Return ONLY one JSON object, with no commentary and no code fence. Copy every number exactly as printed. Do not estimate, round, infer or fill gaps: use null when a value is not printed. Do not invent units, accounts or months. Documents come in any layout: read what is printed.\n';
  const rrp='RENT ROLL (a list of leased/vacant units with tenants). Add "doc_type":"rent_roll". One entry in "units" per leasable unit or suite, including vacant ones (tenant null). A tenant may be printed over several sub-rows (base rent, CAM, tax, future steps): fold them into ONE unit entry. "rent" = base rent only; "charges" = recurring additional charges (CAM, tax, insurance reimbursements, other monthly charges), both per MONTH. If the document prints annual amounts, divide nothing yourself: set "rent_basis":"annual" and give the annual figures. If a category recap is printed, use it for rent vs charges. "next_date"/"next_amt" = the next scheduled rent step (base rent). Dates are YYYY-MM-DD; if only month and year are printed use the first day of the month. "as_of" = the as-of date; if only a report/run date is printed use that date. Put the printed total row(s) in "printed_totals" (null for any figure that is not printed; use only what is actually printed, never add numbers up yourself). If an annual escalation or step schedule is described (e.g. 3% annual), put it in "escalation_note". If several amount columns exist (e.g. monthly vs annual), use the monthly figures for rent and charges and set "column_used". Do not put the total row in "units".\nSchema:\n'+RR_SCHEMA;
  const isp='INCOME STATEMENT / OPERATING STATEMENT. Add "doc_type":"statement". If it has twelve monthly columns, set "period":"months" with 12 consecutive month labels and each line\'s 12 values. If it prints ONE total column for a full year, set "period":"annual" and "year". If it covers part of a year (year-to-date, "ending 6/30"), set "period":"ytd", "year" and "through_month". In both cases give only each line\'s "total" (no values, no months). If several amount columns are printed (estimates, monthly amount due, income received / actual, derived NOI columns), use the ACTUAL / RECEIVED amount for the period, set "column_used" to the column heading, and ignore the others. Income printed per tenant: one line per printed amount row (a tenant\'s total, and separately printed reimbursement or deferred-rent rows), with "group" = the tenant name. Each "label" must say WHAT the line is (for example "Base rent received", "Operating expense reimbursement", "Deferred rent repayment", "Property insurance", "Property taxes"), never just a tenant or property name. Never add numbers up yourself and never make a printed total balance: copy what is printed, and list doubts in "reader_notes". Every account line goes in "lines". Anything that is a total, subtotal, NOI or net income row goes in "subtotals", not in "lines". Mark financing and non-operating lines printed AFTER the net operating income row (interest, principal, owner fees) with "below_noi":true. "group" is the nearest printed sub-heading above the line (null if none). "closes_header" on a subtotal names the heading it totals.\nSchema:\n'+IS_SCHEMA;
  if(kind==='rent_roll')return common+'\nDocument type: '+rrp+'\n\nDOCUMENT TEXT:\n'+text;
  if(kind==='statement')return common+'\nDocument type: '+isp+'\n\nDOCUMENT TEXT:\n'+text;
  return common+'\nFirst decide which of the two document types this is, then answer with that schema only.\n\nTYPE A - '+rrp+'\n\nTYPE B - '+isp+'\n\nThe document may be a photo or scan: read it carefully, and if a figure is hard to read, give your best reading but list it in \"reader_notes\". If it is neither, return {"doc_type":"other","reason":string}.\n\nDOCUMENT TEXT:\n'+text;
}
function jsonOf(t){const a=t.indexOf('{'),b=t.lastIndexOf('}');if(a<0||b<a)throw new Error('The answer did not contain a JSON object.');return JSON.parse(t.slice(a,b+1));}
function ingestAI(ent,kind,obj){$('ack').checked=false;ent.aiUsed=true;
  if(kind==='supporting'||obj?.doc_type==='supporting'){ent.doc=UWDiligence.normalize(obj);ent.kind='supporting';ent.ai.msg={t:'warn',s:'Evidence extracted. Review each source before using a value; financial inputs have not changed.'};return;}
  if(kind==='lease'||kind==='drawing'||(obj&&(kind==='auto'||!kind)&&(obj.doc_type==='lease'||obj.doc_type==='drawing'))){
    kind=kind==='lease'||kind==='drawing'?kind:obj.doc_type;
    if(kind==='lease'){ent.doc=DR.normLease(obj,ent.name);ent.doc.source={file:ent.name,method:'ai-or-pasted'};}else{ent.doc=DR.normDrawing(obj,ent.name);}
    ent.kind=kind;ent.ai.msg={t:'ok',s:'Extracted values are candidates. Review source pages and approve any tenant changes below.'};return;
  }
  if(kind==='auto'||!kind){const d=obj&&obj.doc_type;if(d==='rent_roll'||d==='statement')kind=d;else throw Object.assign(new Error(d==='other'?('Claude says this is neither a rent roll nor an income statement'+(obj.reason?': '+obj.reason:'')):'The answer did not say which kind of document this is.'),{name:'UnsupportedLayout'});}
  const src=Object.assign({},ent.src||{},{file:ent.name});
  if(kind==='rent_roll'&&obj&&obj.rent_basis==='annual'){const d=v=>typeof v==='number'?Math.round(v/12*100)/100:v;(obj.units||[]).forEach(u=>{u.rent=d(u.rent);u.charges=d(u.charges);});if(obj.printed_totals){obj.printed_totals.rent=d(obj.printed_totals.rent);obj.printed_totals.charges=d(obj.printed_totals.charges);}}
  const doc=TB.fromAI(kind,obj,src);
  if(kind==='rent_roll'&&obj.rent_basis==='annual')doc.issues.push('amounts were printed annually and divided by 12 here');
  ent.doc=doc;ent.kind=kind;ent.ai.msg={t:'ok',s:'Read by Claude. Tie-out result is shown above; every value still needs checking against the source.'};
}
async function classify(ent){
  const opts={modelTier:'quick',cache:false};let input=DR.CLASSIFY_PROMPT;
  if(ent.scanned||!ent.text){if(!S.imgs)throw Object.assign(new Error('Image reading is not available here.'),{code:'noimg'});opts.images=await pageImages(ent,1,1200);input+='\n\n(see the attached image)';}
  else input+='\n\nDOCUMENT TEXT (start):\n'+ent.text.slice(0,6000);
  const r=await S.sample(input,opts),w=String(r.text||'').toLowerCase();
  for(const k of ['rent_roll','statement','lease','drawing','other'])if(w.includes(k))return k;
  throw new Error('Claude did not say what kind of document this is.');
}
async function askClaude(ent){
 if(!S.sample){ent.ai.msg={t:'warn',s:'Connect Claude above, or copy the prompt and paste JSON from another AI tool.'};return;}
 ent.ai.busy=true;ent.ai.msg={t:'warn',s:'Reading document…'};render();
 try{let kind=ent.ai.kind;if(kind==='auto'){kind=await classify(ent);if(kind==='other')kind='supporting';ent.ai.kind=kind;}
 const visual=kind==='drawing'||ent.scanned||ent.image;
 let input,opts={modelTier:'complex',cache:false};let batches=[];
 if(visual){if(!S.imgs)throw Error('Image reading is unavailable. Use local OCR or attach the file to another AI tool with the copied prompt.');const total=await pageCount(ent);ent.totalPages=total;for(let first=1;first<=total;first+=6){ent.ai.msg={t:'warn',s:'Reading pages '+first+'–'+Math.min(first+5,total)+' of '+total+'…'};render();const images=await pageImages(ent,6,1800,first);const text='These are original document pages '+first+' through '+Math.min(first+5,total)+'. Use original page numbers in every record. This may be one batch of a larger file; return only records visible in these images. Never invent missing values.';input=kind==='drawing'?DR.drawingPrompt(text):kind==='lease'?DR.leasePrompt(text):prompt(kind,text);const response=await S.sample(input,{...opts,images});if(response.truncated)throw Error('AI response was truncated; no partial result was applied. Use a smaller document or pasted JSON.');batches.push(jsonOf(response.text));}}
 else{const text=ent.text||'';if(text.length>300000)throw Error('This text is too long for one read. Split the document or paste a reviewed JSON extraction; no text has been silently dropped.');input=kind==='lease'?DR.leasePrompt(text):prompt(kind,text);const r=await S.sample(input,opts);if(r.truncated)throw Error('AI answer was cut off; no partial extraction applied.');batches=[jsonOf(r.text)];}
 let obj=batches[0];if(batches.length>1){if(kind==='supporting')obj={...obj,facts:batches.flatMap(b=>b.facts||[]),issues:batches.flatMap(b=>b.issues||[])};else if(kind==='drawing')obj={...obj,items:batches.flatMap(b=>b.items||[]),reader_notes:batches.flatMap(b=>b.reader_notes||[])};else if(kind==='lease'){obj={...obj,base_rent:batches.flatMap(b=>b.base_rent||[]),reimbursements:batches.flatMap(b=>b.reimbursements||[]),reader_notes:[...batches.flatMap(b=>b.reader_notes||[]),'Read in page batches. Confirm conflicting terms and amendments before approving.']};for(const key of ['tenant','unit','sqft','commencement','expiration','lease_type','annual_escalation_pct']){const vs=batches.map(b=>b[key]).filter(v=>v!==null&&v!==undefined&&v!=='');if(vs.length&&!obj[key])obj[key]=vs[0];if(new Set(vs.map(String)).size>1)obj.reader_notes.push('Conflicting '+key+': '+[...new Set(vs.map(String))].join(' / '));}}else{throw Error('All '+ent.totalPages+' pages were read, but this rent roll / statement spans multiple batches. To prevent duplicated subtotals, use “Copy extraction prompt” with the complete file and paste one consolidated JSON answer.');}}
 ingestAI(ent,kind,obj);ent.coverage=visual?'All '+ent.totalPages+' page(s) read visually':'Complete embedded text read';
 }catch(e){ent.ai.msg={t:'bad',s:e.message||String(e)};}
 ent.ai.busy=false;S.result=null;render();
}
async function pageCount(ent){if(ent.image)return 1;if(!ent.bytes)throw Error('Re-upload this document to preview original pages.');const d=await pdfjsLib.getDocument({data:ent.bytes.slice(),isEvalSupported:false}).promise;const count=d.numPages;await d.destroy();return count;}
async function renderImages(bytes,max,target,first=1){const doc=await pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false}).promise,out=[];try{for(let i=first;i<=Math.min(doc.numPages,first+(max||doc.numPages)-1);i++){const pg=await doc.getPage(i),v=pg.getViewport({scale:1}),vp=pg.getViewport({scale:Math.min(3,(target||1800)/Math.max(v.width,v.height))}),c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;out.push(await new Promise(r=>c.toBlob(r,'image/png')));c.width=c.height=0;}}finally{await doc.destroy();}return out;}
const pageImages=async(ent,max,target,first=1)=>ent.image?[new Blob([ent.bytes],{type:ent.mime||'image/png'})]:renderImages(ent.bytes,max,target,first);
function pastePrompt(ent){if(ent.ai.kind==='supporting')return UWDiligence.prompt(ent.text||'Read the attached original file, preserving page numbers.');const text=ent.scanned||ent.image?'The original document is attached. Read all pages; preserve original page numbers.':ent.text||'';if(ent.ai.kind==='lease')return DR.leasePrompt(text);if(ent.ai.kind==='drawing')return DR.drawingPrompt(text);if(ent.ai.kind==='auto')return 'First classify this attachment as rent_roll, statement, lease, drawing or supporting. For all other diligence documents use supporting. Then extract using the corresponding schema below. Return a single JSON object with doc_type. Preserve original page numbers. Unknown values must be null.\n'+prompt('auto','')+'\n'+DR.leasePrompt('')+'\n'+DR.drawingPrompt('')+'\n'+UWDiligence.prompt('')+'\nDOCUMENT: '+text;return prompt(ent.ai.kind,text);}

// ---- render
function tieBlock(ent){
  const t=ent.doc.tie_out,bad=t.filter(x=>!x.ok),box=el('div',{class:'row'});
  box.append(el('span',{class:'tag '+(bad.length?'t-bad':'t-ok'),text:(t.length-bad.length)+' of '+t.length+' checks pass'}));
  return box;
}
function fileCard(ent){
  const c=el('div',{class:'file','data-doc-entry-id':ent.id}),h=el('div',{class:'fh'});
  h.append(el('span',{class:'fn',text:ent.name}));
  const right=el('div',{class:'row'});
  const lab={rent_roll:'Rent roll',statement:'Operating statement',lease:'Lease',drawing:'Plat / drawing',supporting:'Supporting evidence',costar:'CoStar text',unknown:'Needs review',error:'Error',reading:'Reading…'};
  const k=ent.state==='reading'?'reading':ent.kind;
  right.append(el('span',{class:'tag '+(k==='unknown'||k==='error'?'t-bad':k==='reading'?'t-mute':'t-ok'),text:(k==='unknown'&&ent.ai.kind!=='auto'?'Likely '+(lab[ent.ai.kind]||ent.ai.kind)+' · review':lab[k])+((ent.doc&&ent.doc.source&&ent.doc.source.method==='ai')?' · AI-read':ent.doc&&ent.doc.source&&ent.doc.source.method==='excel'?' · Excel':'')}));
  right.append(el('button',{class:'ghost',text:'Remove',onclick:()=>{S.files=S.files.filter(x=>x!==ent);S.result=null;render();}}));
  h.append(right);c.append(h);
  if(ent.state==='reading'){c.append(el('p',{class:'small',role:'status',text:ent.progress||'Reading text and matching document columns…'}));return c;}
  if(ent.err)c.append(el('div',{class:'msg bad',text:ent.err}));
  if(ent.doc&&ent.kind==='lease'){const d=ent.doc,sc=DR.scheduleAt(d,null);c.append(el('p',{class:'small',text:[d.tenant||'tenant not found',d.unit?'unit '+d.unit:'',d.sqft?d.sqft.toLocaleString()+' SF':'',d.lease_type||'',d.commencement&&d.expiration?d.commencement+' to '+d.expiration:'',sc.cur?'rent $'+sc.cur.monthly.toLocaleString()+'/mo':'',d.schedule.length>1?d.schedule.length+' rent periods':'',d.reimb.length?d.reimb.length+' recovery line(s)':''].filter(Boolean).join(' · ')}));(d.reader_notes||[]).slice(0,3).forEach(n=>c.append(el('div',{class:'msg warn',text:n})));}
  if(ent.doc&&ent.kind==='drawing'){const d=ent.doc;d.items.slice(0,40).forEach(it=>{const a=DR.itemArea(it);c.append(el('div',{class:'msg '+(a.flags.length||a.area===null?'warn':'ok'),text:(it.label||it.unit||'item')+': '+(a.area===null?'no area':Math.round(a.area).toLocaleString()+' SF ('+a.method+')')+(a.flags.length?' · '+a.flags.join('; '):'')}));});if(!d.items.length)c.append(el('div',{class:'msg warn',text:'No areas or dimensions were found on this drawing.'}));}
  if(ent.doc&&ent.doc.tie_out){
    c.append(tieBlock(ent));
    const bad=ent.doc.tie_out.filter(x=>!x.ok);
    bad.slice(0,4).forEach(b=>c.append(el('div',{class:'msg bad',text:b.name||b.label||JSON.stringify(b)})));
    (ent.doc.issues||[]).slice(0,6).forEach(s=>c.append(el('div',{class:'msg warn',text:s})));
    const sm=ent.kind==='rent_roll'?ent.doc.units.length+' units read':ent.doc.lines.length+' account lines, '+ent.doc.months[0]+' to '+ent.doc.months[11];
    c.append(el('p',{class:'small',text:sm+(ent.sheet?' · sheet "'+ent.sheet+'"':'')}));
  }
  if(ent.kind==='costar')c.append(el('p',{class:'small',text:'Used as reference data on the CoStar sheet.'}));
  if(false){
    (ent.notes||[]).slice(0,4).forEach(s=>c.append(el('div',{class:'msg warn',text:s})));
    if(ent.scanned)c.append(el('div',{class:'msg warn',text:ent.coverage||'Built-in OCR is available here. Drawings and complex layouts still need source review; visual AI is optional.'}));
    if(ent.pageCoverage?.some(p=>p.needsOCR)||ent.ocrReviewRequired)c.append(el('p',{class:'msg warn',text:'Scan review required. Compare every page against the extracted figures. Printed totals alone cannot prove all lines were read.'}));
    if(ent.progress)c.append(el('p',{class:'small',role:'status',text:ent.progress}));
    if(ent.localReview)c.append(el('p',{class:'small',text:'Suggested type: '+ent.localReview.label+' · '+ent.localReview.basis}));
    const kindSel=el('select',{'aria-label':'Document type',onchange:e=>{ent.ai.kind=e.target.value;}},el('option',{value:'auto',text:'Let Claude work out what this is'}),el('option',{value:'rent_roll',text:'This is a rent roll'}),el('option',{value:'statement',text:'This is an operating / income statement'}),el('option',{value:'lease',text:'This is a lease'}),el('option',{value:'drawing',text:'This is a plat, survey or drawing'}));
    kindSel.value=ent.ai.kind;
    const act=el('div',{class:'row'},kindSel);
    if(ent.kind==='unknown'){
      if(S.sample)act.append(el('button',{text:ent.ai.busy?'Reading…':'Read with Claude',disabled:ent.ai.busy?'':null,onclick:()=>askClaude(ent)}));
      c.append(act);
      if(ent.ai.msg)c.append(el('div',{class:'msg '+ent.ai.msg.t,text:ent.ai.msg.s}));
      if(ent.text||ent.scanned){
        const ta=el('textarea',{placeholder:'Paste the JSON answer here',oninput:e=>{ent.ai.paste=e.target.value;}});ta.value=ent.ai.paste;
        const use=el('button',{class:'ghost',text:'Use pasted answer',onclick:()=>{try{ingestAI(ent,ent.ai.kind,jsonOf(ent.ai.paste));}catch(e){ent.ai.msg={t:'bad',s:'Pasted answer not usable: '+e.message};}S.result=null;render();}});
        const cp=el('button',{class:'ghost',text:'Copy prompt',onclick:async e=>{try{await navigator.clipboard.writeText(pastePrompt(ent));e.target.textContent='Copied';}catch(x){e.target.textContent='Copy failed';ta.value=pastePrompt(ent);}}});
        if(ent.scanned&&!ent.image)act.append(el('button',{class:'ghost',text:'Save page images',onclick:async e=>{e.target.disabled=true;try{const bl=await renderImages(ent.bytes);for(let i=0;i<bl.length;i++){const fn=ent.name.replace(/\.pdf$/i,'')+'_p'+(i+1)+'.png';if(S.dl)await S.dl.save({filename:fn,data:bl[i]});else{const a=document.createElement('a');a.href=URL.createObjectURL(bl[i]);a.download=fn;document.body.append(a);a.click();a.remove();await new Promise(r=>setTimeout(r,300));}}}catch(x){if(!x||x.code!=='declined')ent.ai.msg={t:'bad',s:'Could not save images: '+((x&&(x.message||x.code))||x)};}e.target.disabled=false;render();}}));
        c.append(el('details',null,el('summary',{text:'Use another Claude or an AI tool instead'}),el('div',{class:'row',style:'margin:8px 0'},cp,use),ta));
      }
    }
  }
  if(ent.coverage)c.append(el('p',{class:'small',text:ent.coverage}));c.append(el('button',{class:'ghost review-file',text:ent.doc?'Review source & extracted values':'Review / read this document',onclick:()=>reviewDocument(ent)}));if(ent.ai.msg)c.append(el('p',{class:'msg '+ent.ai.msg.t,text:ent.ai.msg.s}));
  return c;
}
function render(){
  {const standalone=!window.claude;$('keybox').hidden=true;$('b_unkey').hidden=!S.ownKey;$('f_key').hidden=!!S.ownKey;$('b_key').hidden=!!S.ownKey;$('f_rem').parentElement.hidden=!!S.ownKey;const m=$('keymsg');if(S.ownKey){m.hidden=false;m.className='msg ok';m.textContent='Connected with your API key. Reads of scans and unusual layouts now run from this page.';}else if(m.className.indexOf('bad')<0)m.hidden=true;}
  const fl=$('files');fl.replaceChildren(...S.files.map(fileCard));
  const rr=rrEnt(),st=stEnt(),cs=csEnt(),sl=$('slots');
  const slot=(t,e,ok,txt)=>el('div',{class:'slot '+(ok?'ok':'miss')},el('b',{text:t}),el('span',{text:txt}));
  sl.replaceChildren(
    slot('Rent roll',rr,!!rr||(!st&&hasExtras()),rr?rr.name:(!st&&hasExtras()?'Not needed: building from the other documents':'Not added · partial model available')),
    slot('Operating statement',st,!!st||(!rr&&hasExtras()),st?st.name:(!rr&&hasExtras()?'Not needed: building from the other documents':'Not added · partial model available')),
    slot('CoStar page text',cs,!!cs,cs?cs.name:'Optional'),
    slot('Leases',null,S.files.some(x=>x.kind==='lease'&&x.doc),S.files.filter(x=>x.kind==='lease'&&x.doc).length?S.files.filter(x=>x.kind==='lease'&&x.doc).length+' read':'Optional'),
    slot('Plats and drawings',null,S.files.some(x=>x.kind==='drawing'&&x.doc),S.files.filter(x=>x.kind==='drawing'&&x.doc).length?S.files.filter(x=>x.kind==='drawing'&&x.doc).reduce((a,x)=>a+x.doc.items.length,0)+' area item(s) measured':'Optional'),
    slot('Public-record lookup',null,!!S.lookup,S.lookup?Object.keys(S.lookup.values).length+' fact(s) found':'Optional'));
  for(const [k,lab] of [['rent_roll','rent roll'],['statement','operating statement']]){const l=pickDoc(k);if(l.length>1){
    const sel=el('select',{'aria-label':'Which '+lab+' to use',onchange:e=>{S.pick[k]=+e.target.value;S.result=null;render();}},l.map(x=>el('option',{value:x.id,text:x.name+(k==='statement'?' · '+(x.doc.meta.period_range||''):' · '+(x.doc.meta.as_of||''))})));sel.value=l[0].id;
    sl.append(el('div',{class:'slot ok',style:'grid-column:1/-1'},el('b',{text:l.length+' '+lab+'s loaded: one feeds the template'}),sel,el('span',{class:'small',text:'Defaults to the most recent. The others stay loaded for reference only; the template holds one period of each.'})));}}
  const rrm=rr?rr.doc.meta:{},stm=st?st.doc.meta:{};
  $('h_run').textContent=(rrm.created_on||stm.created_on)?'Found in file: '+(rrm.created_on||stm.created_on):'Not found in the files';
  $('h_asof').textContent=rrm.as_of?'Found in file: '+rrm.as_of:(rr?'Not found in the file':'');
  {const us=rr?rr.doc.units.filter(u=>u.tenant):[];const nnn=!!rr&&(rr.doc.meta.all_nnn||(us.length>0&&us.every(u=>u.lease_type==='NNN')));const sel=$('f_reimb');
   if(nnn&&!S.reimbTouched){$('h_reimb').textContent='NNN is stated in the rent roll. Review which expense categories each lease actually recovers.';}
   $('h_reimb').textContent=nnn?'The documents say the leases are triple net, Review recovery categories in each lease before selecting an all-expense recovery assumption.':'';}
  if(rrm.property&&!$('f_prop').value&&!$('f_prop').dataset.t)$('f_prop').placeholder=rrm.property;
  const nf=fails();$('ackrow').hidden=!nf;
  const ready=(!!rr||!!st||hasExtras()||UWEditor.model().tenants.length>0||UWEditor.model().accounts.length>0)&&!S.busy&&!fatal&&(!nf||$('ack').checked);
  $('build').disabled=!ready;
  $('bstate').textContent=fatal?'Page failed to start: '+fatal.message:(rr&&!st)||(!rr&&st)?'Partial model: the missing source will remain blank and flagged for review.':!rr&&!st&&!hasExtras()?'Add documents, or add tenants and accounts in step 3, to begin.':'';
  const rs=$('result');rs.replaceChildren();
  if(S.result)rs.append(resultView(S.result));
  $('b_look').disabled=!(S.sample&&S.sample.web)||S.busy;$('b_look').title=S.sample&&S.sample.web?'':'Needs your own Anthropic API key (web search); in claude.ai use Copy prompt instead';lookView();UWEditor.sync(rr?.doc,st?.doc);UWEditor.supporting(S.files.filter(e=>!['rent_roll','statement'].includes(e.kind)));window.UWWorkspace?.update(S.files);UWEditor.commit();if(S.lookup)UWEditor.setFacts(S.lookup.values);window.dispatchEvent(new Event('uw-documents-change'));
}
['f_prop','f_addr'].forEach(i=>$(i).addEventListener('input',e=>{e.target.dataset.t=1;}));
$('ack').addEventListener('change',render);

$('f_reimb').addEventListener('change',()=>{S.reimbTouched=true;UWEditor.reimbursement($('f_reimb').value);});
$('f_fees').addEventListener('change',()=>UWEditor.fees($('f_fees').value));
// ---- public-record lookup
const lookAddr=()=>$('f_addr').value.trim()||(rrEnt()&&rrEnt().doc.meta.address)||(stEnt()&&stEnt().doc.meta.address)||'';
const lookName=()=>$('f_prop').value.trim()||(rrEnt()&&rrEnt().doc.meta.property)||'';
function lookMsg(t,s2){const m=$('lookmsg');m.replaceChildren(el('div',{class:'msg '+t,text:s2}));}
function ingestLookup(obj,file){
  const lk=DR.normLookup(obj,file);if(!Object.keys(lk.values).length)throw new Error('No usable values in that answer.');
  S.lookup=lk;S.result=null;render();
}
function lookView(){
  const m=$('lookmsg');if(!S.lookup){return;}
  const lk=S.lookup,box=el('div',{class:'file'});
  if(lk.matched_address)box.append(el('p',{class:'small',text:'Pages describe: '+lk.matched_address+(lookAddr()?'   (you entered: '+lookAddr()+')':'')+'. Confirm this is the right property.'}));
  Object.entries(lk.values).forEach(([k,e])=>{const lab=(DR.LOOKUP_KEYS.find(x=>x[0]===k)||[k,k])[1];box.append(el('div',{class:'it'},el('b',{text:lab.split(' (')[0]+': '+(typeof e.value==='number'&&k!=='year_built'?e.value.toLocaleString(undefined,{maximumFractionDigits:4}):e.value)}),el('div',{class:'small',text:'Source: '+(e.source||'not stated')+(e.url?' · '+e.url:'')})));});
  box.append(el('div',{class:'row'},el('button',{class:'ghost',text:'Clear lookup',onclick:()=>{S.lookup=null;S.result=null;render();}})));
  m.replaceChildren(box);
}
$('b_look').addEventListener('click',async()=>{
  const addr=lookAddr();if(!addr){lookMsg('warn','Enter the property address in the box above first.');return;}
  $('b_look').disabled=true;$('lookstate').textContent='Searching the web… this can take a minute.';
  try{const r=await S.sample(DR.lookupPrompt(addr,lookName()),{webSearch:true,modelTier:'complex',cache:false});ingestLookup(jsonOf(r.text),'web lookup');$('lookstate').textContent='';}
  catch(e){$('lookstate').textContent='';lookMsg('bad','Lookup failed: '+(e.message||e.code)+'. You can copy the prompt and run it in a Claude with web search instead.');}
  $('b_look').disabled=false;
});
$('b_lcopy').addEventListener('click',async e=>{const addr=lookAddr();if(!addr){lookMsg('warn','Enter the property address in the box above first.');return;}const t=DR.lookupPrompt(addr,lookName());try{await navigator.clipboard.writeText(t);e.target.textContent='Copied';}catch(x){$('t_look').value=t;e.target.textContent='Copy failed: prompt placed in the paste box';$('t_look').closest('details').open=true;}});
$('b_luse').addEventListener('click',()=>{try{ingestLookup(jsonOf($('t_look').value),'pasted answer');}catch(e){lookMsg('bad','Pasted answer not usable: '+e.message);}});

// ---- build
function exportContext(){const form=Object.fromEntries(['f_prop','f_addr','f_y1','f_c1','f_c2','f_c3','f_tax','f_asof','f_run','f_reimb','f_fees'].map(id=>[id,$(id)?.value||'']));return {form,selected:{rentRoll:rrEnt()?.name||'',statement:stEnt()?.name||'',rentSheet:rrEnt()?.sheet||'',statementSheet:stEnt()?.sheet||''},documents:S.files.map(f=>({name:f.name,kind:f.kind||'',state:f.state,reading:!!f.readBusy,aiUsed:UWDocumentReader.usedOptionalAI(f),scanReview:!!f.ocrReviewRequired,approvedFor:f.approvedFor||''})),evidence:collectEvidence()};}
function exportIsCurrent(result){return !!result?.receipt&&UWHandoff.current(result.receipt,UWEditor.model(),UWTemplateMapping.identity(),exportContext());}
const pct=v=>{v=String(v).trim().replace('%','');if(v==='')return undefined;const n=Number(v);return isFinite(n)?n/100:NaN;};
const extrasNow=()=>({leases:S.files.filter(x=>x.kind==='lease'&&x.doc).map(x=>x.doc),drawings:S.files.filter(x=>x.kind==='drawing'&&x.doc).map(x=>x.doc),lookup:S.lookup||null});
const hasExtras=()=>{const x=extrasNow();return x.leases.length>0||x.drawings.length>0||!!x.lookup;};
$('build').addEventListener('click',async()=>{
  const rr=rrEnt(),st=stEnt(),cs=csEnt();if(!rr&&!st&&!hasExtras()&&!UWEditor.model().tenants.length&&!UWEditor.model().accounts.length)return;
  S.busy=true;$('bstate').textContent='Building…';$('build').disabled=true;
  try{
    const run=$('f_run').value||null,asof=$('f_asof').value||null;
    const rrd=rr?rr.doc:null,std=st?st.doc:null;
    if(run&&rrd){if(!rrd.meta.created_on)rrd.meta.created_on=run;if(std&&!std.meta.created_on)std.meta.created_on=run;}
    if(asof&&rrd&&!rrd.meta.as_of)rrd.meta.as_of=asof;
    UWEditor.sync(rrd,std);
    const cfg={generic:true};const bad=[];
    {const y=$('f_y1').value.trim();if(y){if(!/^20\d\d$/.test(y))bad.push('scenario year');else cfg.year1=+y;}else if(std&&(std.issues||[]).some(t=>/ONE annual total/.test(t))&&rrd?.meta.as_of)cfg.year1=+String(rrd.meta.as_of).slice(0,4);}
    if($('f_prop').value.trim())cfg.property=$('f_prop').value.trim();
    if($('f_addr').value.trim())cfg.address=$('f_addr').value.trim();
    [['f_c1','cap1'],['f_c2','cap2'],['f_c3','cap3']].forEach(([i,k])=>{const v=pct($(i).value);if(v===undefined)return;if(Number.isNaN(v)||v<=0||v>0.3)bad.push(k);else cfg[k]=v;});
    const tx=pct($('f_tax').value);if(tx===undefined)cfg.tax_rate=null;else if(Number.isNaN(tx)||tx<0||tx>0.2)bad.push('tax rate');else cfg.tax_rate=tx;
    if(bad.length)throw new Error('Check these inputs: '+bad.join(', ')+'.');
    cfg.reimb=$('f_reimb').value;cfg.fees=$('f_fees').value;
    if(!rrd){cfg.asof=asof||run||new Date().toISOString().slice(0,10);}
    let res={bytes:(templateBytes||new Uint8Array(0)).slice(),importer:{items:[]},shell:!rrd||!std};
    // The connected UW model fills the supplied Summary; legacy inputs remain reference only.
    if(!rrd)res.importer.items.push({sev:'Warning',rec:'No source rent roll',reason:'Tenant assumptions are manual or lease-derived and require review.'});if(!std)res.importer.items.push({sev:'Warning',rec:'No source operating statement',reason:'Expenses require assumptions or manual entry and source review.'});
    res.importer.items=res.importer.items.concat(UW.checks(UWEditor.model()).filter(c=>!c.ok).map(c=>({sev:'Warning',rec:c.label,reason:c.detail})).concat(S.files.filter(e=>['lease','drawing'].includes(e.kind)||['unknown','error'].includes(e.kind)).map(e=>({sev:'Warning',rec:e.name,reason:e.kind==='unknown'||e.kind==='error'?'Document needs review. No values from it have been inferred.':'Verify the extracted values and any approved changes against the source.'}))));
    const evidence=collectEvidence(),snapshot=await UWEditor.exportSnapshot(res.bytes,evidence,exportContext());res.bytes=snapshot.bytes;res.receipt=snapshot.receipt;

    const prop=(cfg.property||(rrd&&rrd.meta.property)||(std&&std.meta.property)||'Property').replace(/[^\w .-]+/g,'').trim().replace(/\s+/g,'_')||'Property';
    S.result={bytes:res.bytes,receipt:res.receipt,items:res.importer.items,name:prop+'_UW_'+(run||(rrd&&rrd.meta.created_on)||(std&&std.meta.created_on)||new Date().toISOString().slice(0,10))+'.xlsx',aiUsed:[rr,st,...S.files.filter(x=>(x.kind==='lease'||x.kind==='drawing')&&x.doc)].some(e=>UWDocumentReader.usedOptionalAI(e)),fail:fails(),shell:!!res.shell};
    window.dispatchEvent(new Event('uw-workbook-ready'));
    $('bstate').textContent='';
  }catch(e){S.result=null;$('bstate').textContent='';$('result').replaceChildren(el('div',{class:'msg bad',text:e.name==='UnsupportedLayout'?e.message:'Could not build: '+(e.message||e)}));S.busy=false;$('build').disabled=false;return;}
  S.busy=false;render();
});

function resultView(R){
  const w=el('div',{style:'display:flex;flex-direction:column;gap:12px'});
  const cnt={};R.items.forEach(i=>{cnt[i.sev]=(cnt[i.sev]||0)+1;});
  w.append(el('div',{class:'msg ok','data-workbook-ready':'true',text:'Workbook built. '+R.items.length+' items to review: '+['Critical','Warning','Informational'].map(k=>(cnt[k]||0)+' '+k.toLowerCase()).join(', ')+'.'}));
  if(R.aiUsed)w.append(el('div',{class:'msg warn',text:'Some values came from optional AI or a pasted extraction. Compare those values against the original source.'}));
  if(R.fail)w.append(el('div',{class:'msg bad',text:R.fail+' tie-out check(s) failed. They are listed on the checks sheet.'}));
  const row=el('div',{class:'row'});
  const dl=el('button',{text:'Download '+R.name,onclick:async e=>{
    if(!exportIsCurrent(R)){note.textContent='The model, sources or template changed. Fill the template again before downloading.';UWEditor.toast(note.textContent);return;}
    const blob=new Blob([R.bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    try{
      if(S.dl){await S.dl.save({filename:R.name,data:blob});e.target.textContent='Saved';return;}
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=R.name;document.body.append(a);a.click();a.remove();
    }catch(x){if(x&&x.code!=='declined')note.textContent='Download did not start ('+((x&&x.code)||x)+').';}
  }});
  const note=el('span',{class:'small'});dl.dataset.workbookDownload='true';dl.setAttribute('aria-describedby','exportSnapshotStatus');row.append(dl,note);w.append(row);const snapshotStatus=el('p',{id:'exportSnapshotStatus',class:'snapshot-status',role:'status',text:exportIsCurrent(R)?'Current captured model · '+new Date(R.receipt.at).toLocaleString():'The model changed after this workbook was built. Rebuild to download current values.'});w.prepend(snapshotStatus);
  window.UWWorkbookPreview?.attach(dl,R.bytes,R.name,'generated');
  const crit=R.items.filter(i=>i.sev!=='Informational').slice(0,12);
  if(crit.length){
    w.append(el('h2',{text:'Needs your decision'}));
    w.append(el('div',{class:'items'},crit.map(i=>el('div',{class:'it '+i.sev},el('b',{text:i.rec+' · '+i.sev}),el('div',{text:(i.reason||'').slice(0,320)})))));
    if(R.items.filter(i=>i.sev!=='Informational').length>crit.length)w.append(el('p',{class:'small',text:'Review the source checks and document evidence tabs for supporting detail.'}));
  }
  w.append(el('p',{class:'small',text:'Open UW Read me first. Review UW Source actuals and UW Document evidence, then edit the visible UW input sheets. Hidden original tabs are retained reference, not the active detailed model.'}));
  return w;
}
// Consistent source review for parsed files, scans, drawings and leases.
let previewURL=null;
function collectEvidence(){const out=[];for(const e of S.files){if(e.kind==='drawing'&&e.doc)for(const it of e.doc.items){const a=DR.itemArea(it);out.push({file:e.name,page:it.page||'',type:it.area_type||it.kind||'Area',label:it.label||it.unit||'',printed:a.printed,calculated:a.area,method:a.method,confidence:it.confidence||'Not stated',notes:[...(a.flags||[]),it.notes||'',e.coverage||''].join('; '),approved:it.approvedFor||''});}else if(e.kind==='lease'&&e.doc){const d=e.doc;for(const v of d.evidence||[])out.push({file:e.name,page:v.page||'',type:'Lease term',label:v.field,printed:v.value,method:d.reader||'Lease extraction',notes:v.quote,approved:e.approvedFor||''});for(const [type,rs]of [['Base rent',d.schedule],['Optional renewal — excluded',d.renewal_schedule],['Operating-expense reimbursement',d.recovery_schedule]])for(const r of rs||[])out.push({file:e.name,page:r.page||'',type,label:(r.from||'?')+' to '+(r.to||'?'),printed:r.monthly,method:'Printed monthly amount',notes:(type.startsWith('Optional')?'Not applied to the forecast. ':type==='Operating-expense reimbursement'&&!e.recoveriesApproved?'Evidence only; not applied. ':'')+(r.quote||'')+(r.annual!=null?' · printed annual '+r.annual:''),approved:type.startsWith('Optional')?'Evidence only':e.approvedFor||''});}else out.push({file:e.name,page:(e.pageCoverage||[]).map(p=>p.page).join(', '),type:e.kind||e.ai.kind,label:e.kind==='lease'?e.doc?.tenant||'Lease':'Document',notes:[e.coverage||'',e.ai.msg?.s||''].join('; '),approved:e.approvedFor||''});}return out;}
function tenantSelector(){const sel=el('select',{'aria-label':'Tenant receiving approved values'},el('option',{value:'',text:'Choose a tenant / suite'}));for(const t of UWEditor.model().tenants)sel.append(el('option',{value:t.id,text:t.unit+' · '+(t.tenant||'Vacant')+' · '+Number(t.sqft||0).toLocaleString()+' SF'}));return sel;}
async function reviewDocument(ent,initialPage=1){
 const dialog=$('documentReview'),box=$('documentContent');$('documentTitle').textContent=ent.name;box.replaceChildren();
 if(!ent.doc&&!ent.readAttempted&&!ent.readBusy){ent.readAttempted=true;const progress=el('p',{role:'status',text:'Reading this document locally…'});box.append(progress);if(!dialog.open)dialog.showModal();try{await builtInRead(ent,progress);render();}catch(e){ent.coverage='Could not finish reading: '+e.message;}if(dialog.open)return reviewDocument(ent);return;}
 box.append(el('p',{class:'small',text:'Choose the document type to read it locally. Review the extracted rows below, then use them in the model. AI is optional.'}));
 const kind=el('select',{'aria-label':'Document type'},...Object.entries({auto:'Detect automatically',rent_roll:'Rent roll',statement:'Operating statement',lease:'Lease / lease summary / amendment',drawing:'Plat / survey / floor plan / building layout',supporting:'Other diligence / supporting evidence'}).map(([k,v])=>el('option',{value:k,text:v})));
 kind.value=['rent_roll','statement','lease','drawing','supporting'].includes(ent.kind)?ent.kind:ent.ai.kind;ent.ai.kind=kind.value;kind.onchange=async()=>{ent.ai.kind=kind.value;kind.disabled=true;try{await builtInRead(ent,status,true);if(ent.doc&&ent.kind===kind.value&&['rent_roll','statement'].includes(ent.kind))S.pick[ent.kind]=ent.id;render();await reviewDocument(ent);}catch(e){status.textContent=e.message;}finally{kind.disabled=false;}};
 const status=el('p',{class:'small',role:'status',text:ent.coverage||'Source retained. No page limit is silently applied.'});
 const localRead=el('button',{text:'Read document again',onclick:async()=>{localRead.disabled=true;try{await builtInRead(ent,status,true);render();reviewDocument(ent);}catch(e){status.textContent=e.message;}finally{localRead.disabled=false;}}});
 const read=el('button',{text:S.sample?'Optional: read with Claude':'Optional AI reader (not connected)',disabled:!S.sample||ent.ai.busy?'':null,onclick:async()=>{read.disabled=true;status.textContent='Reading all pages in batches…';await askClaude(ent);reviewDocument(ent);}});
 box.append(el('div',{class:'row'},kind,localRead,read),status);globalThis.UWScanUI?.panel(ent,box,async scanStatus=>{await ocrDocument(ent,scanStatus);await builtInRead(ent,scanStatus,true,{skipOCR:true});render();reviewDocument(ent);});globalThis.UWSourceTableUI?.panel(ent,box,mappedKind=>{S.pick[mappedKind]=ent.id;render();reviewDocument(ent);});if(ent.ai.msg)box.append(el('p',{class:'msg '+ent.ai.msg.t,text:ent.ai.msg.s}));
 if(!ent.doc){box.append(el('div',{class:'document-next-step'},el('h3',{text:'You can keep going'}),el('p',{text:ent.coverage||'Check the type above. You can enter a missing tenant or expense now and keep the source document beside it.'}),el('div',{class:'row'},el('button',{text:'Add a tenant / space manually',onclick:()=>{dialog.close();UWEditor.act('addTenant');}}),el('button',{class:'ghost',text:'Add income or expense manually',onclick:()=>{dialog.close();UWEditor.act('addAccount');}}))));}
 if(ent.ocrPages){const pages=el('details',null,el('summary',{text:'Scan quality by page'}));for(const p of ent.ocrPages)pages.append(el('p',{class:'small',text:'Page '+p.page+' · '+(p.method==='embedded text'?'Original PDF text retained':'OCR text confidence '+Math.round(p.confidence)+'%')+(p.retried?' · higher-resolution retry':'')+' · '+p.text.trim().length+' characters'}));pages.append(el('p',{class:'small',text:'OCR confidence is an engine signal, not a probability that numbers are correct.'}));box.append(pages);}
 if(ent.ocrPages?.some(p=>p.numericDifferences?.length)){const differences=el('details',null,el('summary',{text:'OCR attempts disagree on numeric text — compare the original'}));for(const p of ent.ocrPages.filter(p=>p.numericDifferences?.length)){differences.append(el('p',{class:'msg warn',text:'Page '+p.page+' · '+p.numericDifferences.length+' numeric token positions differ. The higher-confidence attempt was retained; it can still be wrong.'}));for(const d of p.numericDifferences.slice(0,30))differences.append(el('p',{class:'small',text:'Token '+d.index+': '+(d.first??'not read')+' → '+(d.retry??'not read')}));if(p.numericDifferences.length>30)differences.append(el('p',{class:'small',text:'First 30 differences shown. Compare the entire source page.'}));}box.append(differences);}if(ent.textOCRWarnings?.length){const names=el('details',null,el('summary',{text:ent.textOCRWarnings.length+' lower-confidence labels / names need review'}),el('p',{class:'small',text:'Suite identifiers, tenant names and labels can also be misread. These words were not silently corrected.'}));for(const w of ent.textOCRWarnings.slice(0,40))names.append(el('p',{class:'small',text:'Page '+w.page+' · “'+w.text+'” · OCR score '+Math.round(w.confidence)}));if(ent.textOCRWarnings.length>40)names.append(el('p',{class:'small',text:'First 40 words shown. Review all original pages.'}));box.append(names);}if(ent.numericOCRWarnings?.length){const warning=el('details',null,el('summary',{text:ent.numericOCRWarnings.length+' numeric OCR tokens need a source check'}),el('p',{class:'small',text:'These tokens had lower OCR confidence. Confidence is a text-recognition score, not a probability that an amount is correct. No characters or amounts were silently corrected.'}));for(const w of ent.numericOCRWarnings.slice(0,40))warning.append(el('p',{class:'small',text:'Page '+w.page+' · “'+w.text+'” · OCR score '+Math.round(w.confidence)}));if(ent.numericOCRWarnings.length>40)warning.append(el('p',{class:'small',text:'First 40 tokens shown. Review all source pages and printed totals.'}));box.append(warning);}
 if(ent.doc&&(ent.ocrReviewRequired||ent.doc.source?.localOCR?.required||ent.ocrReviewedAt)){const done=!!(ent.ocrReviewedAt||ent.doc.source?.localOCR?.reviewedAt),check=el('input',{type:'checkbox',checked:done?'':null});check.checked=done;check.onchange=()=>{ent.ocrReviewRequired=!check.checked;ent.numericOCRReviewed=check.checked;ent.ocrReviewedAt=check.checked?new Date().toISOString():'';ent.doc.source??={file:ent.name};ent.doc.source.localOCR={required:true,reviewedAt:ent.ocrReviewedAt,numericWarnings:ent.numericOCRWarnings?.length||ent.doc.source.localOCR?.numericWarnings||0};render();};box.append(el('label',{class:'ocr-review-ack'},check,' I compared the scanned amounts and printed totals with the source. This records my review; it does not certify the document.'));}
 if(ent.localReview){const evidence=el('details',null,el('summary',{text:'Why this document type was suggested'}),el('p',{class:'small',text:ent.localReview.basis}));for(const x of ent.localReview.evidence)evidence.append(el('p',{class:'small',text:(x.page?'Page '+x.page+' · ':'Page not available · ')+x.quote}));box.append(evidence);}
 if(ent.bytes&&(/\.pdf$/i.test(ent.name)||ent.image)){
  const preview=el('details',null,el('summary',{text:'View original pages'}));const page=el('input',{type:'number',min:1,value:Number.isInteger(+initialPage)&&+initialPage>0?+initialPage:1,'aria-label':'Source page number',style:'max-width:90px'}),count=el('span',{class:'small',text:''}),img=el('img',{alt:'Original source document page',class:'source-preview'});
  const show=async()=>{try{const n=await pageCount(ent);count.textContent='of '+n+' pages';const p=Number(page.value);if(!Number.isInteger(p)||p<1||p>n)throw Error('Choose a page from 1 to '+n);const blob=(await pageImages(ent,1,2200,p))[0];if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(blob);img.src=previewURL;img.alt=ent.name+' · original page '+p;}catch(e){count.textContent=e.message;}};
  preview.append(el('div',{class:'row'},el('span',{text:'Page'}),page,count,el('button',{class:'ghost',text:'Show page',onclick:show})),img);preview.addEventListener('toggle',()=>{if(preview.open&&!img.src)show()});box.append(preview);
 }
 const paste=el('details',null,el('summary',{text:'Use Claude or another AI tool · paste an extraction'}));const ta=el('textarea',{rows:8,placeholder:'Paste JSON returned with the copied prompt',oninput:e=>{ent.ai.paste=e.target.value;}});ta.value=ent.ai.paste||'';
 paste.append(el('p',{class:'small',text:'Copy the extraction prompt, attach the original file in your AI chat, then paste its JSON here. This works without connecting an API key.'}),el('div',{class:'row'},el('button',{class:'ghost',text:'Copy extraction prompt',onclick:async()=>{const t=pastePrompt(ent);try{await navigator.clipboard.writeText(t);status.textContent='Prompt copied. Attach the original file in your AI chat.';}catch{ta.value=t;status.textContent='Copy the prompt from the text box.';}}}),el('button',{class:'ghost',text:'Use pasted extraction',onclick:()=>{try{ingestAI(ent,ent.ai.kind,jsonOf(ta.value));ent.coverage='Pasted extraction · page coverage requires review';render();reviewDocument(ent);}catch(e){status.textContent=e.message;}}})),ta);box.append(paste);
 const local=el('details',null,el('summary',{text:'Fix a missing value or inspect extracted text'})),text=el('textarea',{rows:10,'aria-label':'Extracted document text'});text.value=ent.text||'';
 local.append(el('p',{class:'small',text:'OCR reads text from scans; it does not interpret a building layout. Use visual AI or the manual area entry below for plans. Engine files download from a public CDN; page images are processed locally.'}),el('div',{class:'row'},el('button',{class:'ghost',text:'Run local OCR',disabled:!ent.bytes?'':null,onclick:async e=>{e.target.disabled=true;try{await ocrDocument(ent,status);text.value=ent.text;await builtInRead(ent,status,true,{skipOCR:true});render();reviewDocument(ent);}catch(x){status.textContent=x.message;}finally{e.target.disabled=false;}}}),el('button',{class:'ghost',text:'Try reading this text',onclick:async()=>{try{ent.text=text.value;const r=UWLocalReader.parse(ent.text,ent.name,TB,ctx.opts,ent.ai.kind,[]);if(!r.doc)throw Error(r?.error||'Text was read. Check the chosen document type, or add the missing tenant or account below.');const scanReview=globalThis.UWScan?.sourceReview(ent);if(scanReview){r.doc.source??={file:ent.name};r.doc.source.localOCR=scanReview;}ent.kind=r.kind;ent.doc=r.doc;ent.aiUsed=false;ent.layoutText='';ent.wordPages=[];ent.coverage='Local text extraction · review against original pages';render();reviewDocument(ent);}catch(x){status.textContent=x.message;}}})),text);box.append(local);
 if(ent.doc?.tie_out){box.append(el('div',{class:'msg ok',text:ent.kind==='rent_roll'?ent.doc.units.length+' tenant / space rows extracted. Review the source rows below; use this rent roll to see them in the tenant table and forecast.':ent.doc.lines.length+' account lines extracted. Use this statement to see them in income and expenses.'}),el('button',{class:'ghost',text:ent.kind==='rent_roll'?'Use this rent roll · view tenants':'Use this statement · view expenses',onclick:()=>{S.pick[ent.kind]=ent.id;render();dialog.close();UWEditor.showSection(ent.kind==='rent_roll'?'Tenants':'Income & expenses');}}));box.append(tieBlock(ent));const data=ent.doc.units||ent.doc.lines;const table=el('table',null,el('thead',null,el('tr',null,...(ent.kind==='rent_roll'?['Suite / tenant','SF','Base rent / month','CAM / month','Page']:['Account line','Source total','Group','Page']).map(h=>el('th',{text:h})))),el('tbody',null,...data.map(r=>el('tr',null,...(ent.kind==='rent_roll'?[r.unit+' · '+(r.tenant||'Vacant'),r.sqft,r.rent,r.charges,r.page]:[r.label,r.total,r.path||r.group,r.page]).map(v=>el('td',{text:v??'—'}))))));box.append(el('div',{class:'table-wrap'},table));}
 if(ent.doc&&ent.kind==='lease'){
  const d=ent.doc;box.append(el('h3',{text:'Lease terms to review'}),el('p',{text:[d.tenant,d.unit,d.commencement+' → '+d.expiration,d.sqft?d.sqft+' SF ('+(d.sqft_basis||'basis not stated')+')':null].filter(Boolean).join(' · ')}));
  for(const r of d.schedule)box.append(el('p',{class:'small',text:(r.from||'?')+' – '+(r.to||'?')+' · '+(r.monthly!=null?'$'+r.monthly+'/mo':r.annual!=null?'$'+r.annual+'/yr':'$'+r.psf+'/SF/yr')+' · page '+(r.page||'?')}));
  for(const r of d.reimb)box.append(el('p',{class:'small',text:'Recovery: '+r.category+' · '+r.share+(r.pct!=null?' '+r.pct+'%':'')+' · '+(r.note||'')+' · page '+(r.page||'?')}));
  for(const note of d.reader_notes||[])box.append(el('p',{class:'msg warn',text:note}));
  const leaseChecks=el('details',null,el('summary',{text:'Renewals, reimbursements and source checks'}));for(const r of d.renewal_schedule||[])leaseChecks.append(el('p',{class:'small',text:'Optional renewal · '+r.from+' to '+r.to+' · $'+r.monthly+'/month · excluded until exercised'}));for(const r of d.recovery_schedule||[])leaseChecks.append(el('p',{class:'small',text:'Operating-expense reimbursement · '+r.from+' to '+r.to+' · $'+r.monthly+'/month · separate from base rent'}));for(const c of d.arithmetic_checks||[])if(!c.ok)leaseChecks.append(el('p',{class:'msg warn',text:c.label+': printed '+c.expected+', calculated '+c.actual}));box.append(leaseChecks);const applyRecovery=el('input',{type:'checkbox'});box.append(el('label',null,applyRecovery,' Replace monthly CAM overrides for covered months with the printed reimbursement schedule'));if(d.rent_commencement)box.append(el('p',{class:'small',text:'Rent commencement: '+d.rent_commencement+' · legal lease commencement: '+(d.commencement||'not stated')}));
  const sel=tenantSelector();box.append(el('button',{text:'Add reviewed tenant from this lease',onclick:()=>{try{const id=UWEditor.addLease(d,applyRecovery.checked);ent.recoveriesApproved=applyRecovery.checked;ent.approvedFor=UWEditor.model().tenants.find(t=>t.id===id).unit;status.textContent='Tenant added. The lease schedule now feeds the forecast.';render();reviewDocument(ent);}catch(e){status.textContent=e.message;}}}));box.append(el('p',{class:'small',text:'Approval replaces the selected tenant’s lease dates and stated rent schedule. Existing broker overrides remain active. Printed reimbursement periods apply only when the checkbox is selected; other recovery clauses remain evidence. SF is approved separately.'}),el('div',{class:'row'},sel,el('button',{text:'Apply reviewed lease terms',onclick:()=>{try{UWEditor.applyLease(sel.value,d,applyRecovery.checked);ent.recoveriesApproved=applyRecovery.checked;ent.approvedFor=sel.options[sel.selectedIndex].text;status.textContent='Lease terms applied to '+ent.approvedFor;render();}catch(e){status.textContent=e.message;}}})));
  if(d.sqft)areaReview(box,ent,{label:'Lease premises',area_type:'suite',unit:d.unit,printed_area_sf:d.sqft,confidence:'Source transcription',notes:d.sqft_basis||'Area basis not stated',page:d.area_page||''},status);
 }
 if(ent.kind==='drawing'&&ent.doc){box.append(el('h3',{text:'Area evidence · keep land, building and tenant areas separate'}));for(const it of ent.doc.items)areaReview(box,ent,it,status);}

 const category=el('select',{'aria-label':'Diligence category'},el('option',{value:'',text:'Choose a checklist category'}),...UWDiligence.catalog.filter(x=>x.group!=='Model and assumptions').map(x=>el('option',{value:x.id,text:x.group+' · '+x.label})));category.value=ent.category||UWDiligence.suggest(ent.name,ent.kind);category.onchange=()=>{ent.category=category.value;render();};box.append(el('label',null,'Diligence category',category));
 if(ent.kind==='supporting'&&ent.doc){window.UWDevelopmentEvidence?.panel(box,ent);box.append(el('h3',{text:'Source evidence — first 50 facts; all numeric workbook facts available in the mapping selector'}));for(const f of ent.doc.facts.slice(0,50))box.append(el('div',{class:'area-evidence'},el('b',{text:f.field+': '+(f.value??'Not stated')+' '+f.unit}),el('p',{class:'small',text:'Page '+(f.page??'not supplied')+' · '+f.confidence+' confidence'}),el('p',{text:f.quote})));for(const issue of ent.doc.issues)box.append(el('p',{class:'msg warn',text:issue}));}
 const manual=el('details',null,el('summary',{text:'Enter a printed area manually'}));const label=el('input',{placeholder:'Area label / suite','aria-label':'Area label'}),sf=el('input',{type:'number',min:0,placeholder:'Printed SF','aria-label':'Printed square feet'}),pg=el('input',{type:'number',min:1,placeholder:'Source page','aria-label':'Manual source page'}),typ=el('select',{'aria-label':'Area type'},...['suite','land','building','floor','other'].map(v=>el('option',{value:v,text:v})));
 manual.append(el('div',{class:'grid'},label,sf,pg,typ),el('button',{class:'ghost',text:'Add area candidate',onclick:()=>{if(!label.value||!(+sf.value>0)||!(+pg.value>=1)){status.textContent='Enter a label, positive SF and original page number.';return;}if(ent.kind!=='drawing'){ent.kind='drawing';ent.doc=DR.normDrawing({kind:'other',items:[]},ent.name);}ent.doc.items.push({label:label.value,area_type:typ.value,printed_area_sf:+sf.value,page:+pg.value,confidence:'broker entered',notes:'Manual transcription from source; check area basis.'});render();reviewDocument(ent);}}));box.append(manual);
 UWCorrections.panel(ent,box,()=>{render();reviewDocument(ent);});
 if(!dialog.open)dialog.showModal();
}
function areaReview(box,ent,it,status){const a=DR.itemArea(it),type=it.area_type||'other';const panel=el('div',{class:'area-evidence'});panel.append(el('b',{text:(it.label||it.unit||'Area')+' · '+type}),el('p',{class:'small',text:ent.name+' · page '+(it.page||'not supplied')+' · confidence: '+(it.confidence||'not supplied')}),el('p',{text:'Printed: '+(a.printed??'—')+' SF · Calculated: '+(a.area??'—')+' SF · '+(a.method||'No usable dimensions')}));if(it.notes)panel.append(el('p',{class:'small',text:String(it.notes)}));for(const flag of a.flags)panel.append(el('p',{class:'msg warn',text:flag}));
 if(type==='suite'){
 const tenants=tenantSelector(),value=el('input',{type:'number',min:0,value:a.printed??a.area??'', 'aria-label':'Reviewed tenant SF',style:'max-width:140px'}),note=el('input',{placeholder:'Why this is the correct rentable area', 'aria-label':'Reason for area choice'});panel.append(el('p',{class:'small',text:'Compare the candidate with the current tenant SF in the selector. A printed area is not automatically rentable area. Explain your choice, then approve.'}),el('div',{class:'row'},tenants,value),note,el('button',{class:'ghost',text:'Approve SF for selected tenant',onclick:()=>{try{if(!(+value.value>0)||!note.value.trim())throw Error('Enter positive SF and a reason for the selected area basis.');const t=UWEditor.model().tenants.find(t=>t.id===tenants.value);if(!t)throw Error('Select a tenant.');UWEditor.applyArea(t.id,+value.value,{file:ent.name,page:it.page||'',printed:a.printed,computed:a.area,previousSF:t.sqft,reason:note.value});it.approvedFor=t.unit+' · '+(t.tenant||'Vacant');status.textContent='Approved '+value.value+' SF for '+it.approvedFor;render();}catch(e){status.textContent=e.message;}}}));
 }else panel.append(el('p',{class:'small',text:'Retained as '+type+' evidence. It will not overwrite tenant SF.'}));box.append(panel);}
async function builtInRead(ent,status,force=false,{skipOCR=false}={}){
 const selected=ent.ai.kind||'auto';ent.readBusy=true;try{
 status.textContent='Reading document text and matching '+(selected==='auto'?'its layout':selected.replace('_',' '))+'…';
 if(!ent.text&&ent.bytes&&!ent.image){const r=await P.readFile(ctx,{name:ent.name,bytes:ent.bytes.slice()});ent.text=r.text||ent.text;ent.layoutText=r.layoutText||ent.layoutText;ent.wordPages=r.wordPages||ent.wordPages||[];ent.pageCoverage=r.pageCoverage||ent.pageCoverage||[];if(r.doc&&(selected==='auto'||selected===r.kind)){ent.doc=r.doc;ent.kind=r.kind;}}
 if(!skipOCR&&(ent.image||ent.scanned||ent.pageCoverage?.some(p=>p.needsOCR))&&(!ent.text||ent.pageCoverage?.some(p=>p.needsOCR))){if(!force&&globalThis.UWScan?.preferences().autoScan===false){ent.coverage='Image-only pages are waiting. Open Scan controls or Read document again to scan locally.';status.textContent=ent.coverage;return;}try{await ocrDocument(ent,status,true);}catch(e){ent.coverage='The scan engine could not read the image pages: '+e.message;ent.progress='Add the missing values manually, or retry the scan.';status.textContent=ent.coverage;return;}}
 ent.localReview=UWLocalReader.inspect(ent.name,ent.text);let r;
 if(/\.(?:xlsx|xlsm|xls|csv|tsv)$/i.test(ent.name)&&ent.bytes&&selected==='rent_roll'){const wb=ctx.XLSX.read(ent.bytes,{type:'array',cellNF:true});for(const sheet of wb.SheetNames){if(ent.sheet&&sheet!==ent.sheet)continue;try{r={kind:'rent_roll',doc:TB.readRentRollGrid(TB.sheetGrid(ctx.XLSX,wb.Sheets[sheet]),{file:ent.name,sheet},ctx.opts)};break;}catch{}}}
 r??=UWLocalReader.parse(ent.layoutText||ent.text,ent.name,TB,ctx.opts,selected,ent.wordPages||[]);
 if(r?.doc){const scanReview=globalThis.UWScan?.sourceReview(ent);ent.doc=r.doc;if(scanReview){ent.doc.source??={file:ent.name};ent.doc.source.localOCR=scanReview;}ent.aiUsed=false;ent.kind=r.kind;ent.ai.kind=r.kind;ent.err=null;ent.coverage=(r.kind==='rent_roll'?r.doc.units.length+' tenant / space rows':r.kind==='lease'?r.doc.schedule.length+' base-rent periods':r.doc.lines?.length+' account lines')+' extracted locally. Review against the source.';ent.progress='Ready to review';}
 else if(ent.doc&&(selected==='auto'||selected===ent.kind)){ent.progress='Extracted values are shown below.';}
 else{ent.coverage=r?.error||'The text was read, but this layout needs a column match. Add the missing tenant, expense or lease terms below.';ent.progress='Needs your review';ent.err=null;}
 status.textContent=ent.coverage||ent.progress;
 }finally{ent.readBusy=false;}
}
let ocrEngineLoad=null;
async function ocrDocument(ent,status,onlyMissing=false){
 if(ent.ocrBusy)throw Error('This document is already being scanned. Wait or cancel it.');ent.ocrBusy=true;ent.scanController=new AbortController();
 try{if(!window.Tesseract){throw Error('Local OCR is turned off in this build. Enter source values manually or paste the text.');}
 const next=await UWScan.scan(ent,{pageCount,pageImages,onlyMissing,preferences:ent.scanPreferences||UWScan.preferences(),signal:ent.scanController.signal,progress:message=>status.textContent=message,createWorker:(language,logger)=>Tesseract.createWorker(language,1,{logger})});Object.assign(ent,next);status.textContent=next.coverage;
 }finally{ent.ocrBusy=false;ent.scanController=null;}
}
$('closeDocument').onclick=()=>$('documentReview').close();
$('b_public').onclick=async()=>{const addr=lookAddr();if(!addr)return lookMsg('warn','Enter the property address first.');$('b_public').disabled=true;try{const r=await Promise.resolve({ok:false,json:async()=>({error:'Public-data lookup is turned off in this build. Enter the facts by hand.'})}),d=await r.json();if(!r.ok)throw Error(d.error||'Lookup unavailable');if(addr!==lookAddr())return;const out=$('lookmsg');out.replaceChildren(el('p',{class:'small',text:d.note||'Review the property match and sources.'}));for(const f of d.facts||[]){const key=({ 'Land area (SF)':'land_sf','Parcel / SSL':'parcel','Year built':'year_built','Walk Score (Powered by Walk Score)':'walk','Walk Score':'walk','Transit Score':'transit','Bike Score':'bike'})[f.label]||f.label;const button=el('button',{class:'ghost',text:'Accept fact',onclick:()=>{if(!S.lookup||S.lookup.matched_address!==addr)S.lookup={file:'Public address lookup',matched_address:addr,values:{}};S.lookup.values[key]={value:f.value,url:f.source,source:f.source};UWEditor.setFacts(S.lookup.values);button.textContent='Accepted';button.disabled=true;}});out.append(el('div',{class:'file'},el('b',{text:f.label+': '+f.value}),el('a',{href:/^https?:\/\//.test(f.source)?f.source:'#',target:'_blank',rel:'noopener',text:'View source'}),button));}}catch(e){lookMsg('warn',e.message+' You can use Claude web search or paste a sourced answer.');}finally{$('b_public').disabled=false;}};
let lastAutoAddress='';
function autoPublicLookup(){const address=lookAddr();if(!$('autoPublic')?.checked||address.length<8||address===lastAutoAddress||$('b_public').disabled)return;lastAutoAddress=address;$('b_public').click();}
$('f_addr').addEventListener('change',autoPublicLookup);
$('autoPublic').addEventListener('change',autoPublicLookup);

window.UWFiller={exportContext,exportIsCurrent,result:()=>S.result,addFiles,files:()=>S.files,review(id,page=1){const ent=S.files.find(f=>f.id===id);if(ent)reviewDocument(ent,page);},setDocuments(rr,st,history=[],support=[]){
 S.files=[];S.lookup=null;S.result=null;S.reimbTouched=false;const retained=[...support,...history.filter(e=>e.name!==st?.source?.file)];for(const e of retained)S.files.push({...e,id:++seq,state:'done',bytes:null,text:e.text||'',notes:e.notes||[],ai:{kind:e.kind,busy:false,paste:'',msg:null}});
 for(const [kind,doc]of [['rent_roll',rr],['statement',st]])if(doc)S.files.push({id:++seq,name:doc.source?.file||kind,state:'done',kind,doc,text:'',notes:[],bytes:null,scanned:false,ocrReviewRequired:!!doc.source?.localOCR?.required&&!doc.source.localOCR.reviewedAt,ocrReviewedAt:doc.source?.localOCR?.reviewedAt||'',ai:{kind,busy:false,paste:'',msg:null}});S.pick={};render();},getEvidence:collectEvidence};
const retained=UWEditor.model();UWFiller.setDocuments(retained.baseline?.rr,retained.baseline?.st,retained.historicalDocuments||[],retained.supportingDocuments||[]);

// ---- Claude (optional)
(async()=>{try{if(window.claude){S.sample=await claude.use('sample');S.dl=await claude.use('downloads');if(S.sample){try{S.imgs=!!(await S.sample.limits()).images;}catch(e){}}}}catch(e){}if(!S.sample){try{localStorage.removeItem('uw_key');}catch(e){}}S.why=!S.sample?'noclaude':(S.imgs?'ok':'noimages');render();})();

render();
})();
