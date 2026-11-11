/* Deterministic on-device triage. Suggestions are evidence, never certified interpretations. */
(function(root){'use strict';
const rules={rent_roll:[/rent\s*roll/i,/tenant.{0,30}(?:rent|suite)/i,/lease\s*(?:start|end|expiration)/i],statement:[/income\s*statement|operating\s*statement|profit\s*(?:and|&)\s*loss|trailing\s*12/i,/net\s*operating\s*income/i,/total\s*(?:income|expenses)/i],lease:[/lease\s*(?:agreement|amendment|summary|abstract)|agreement\s+of\s+lease/i,/landlord.{0,60}tenant/i,/premises|commencement|base\s*rent/i],drawing:[/alta|nsps|boundary\s*survey|floor\s*plan|site\s*plan/i,/scale\s*[:=]|architect|survey(or)?/i,/lot\s*area|gross\s*floor|rentable\s*area/i],supporting:[/environmental|appraisal|condition\s*assessment|title\s*commitment|insurance|tax\s*bill/i]};
function inspect(name,text){const sample=String(text||'');const ranks=Object.entries(rules).map(([kind,rs])=>({kind,hits:rs.filter(r=>r.test(sample)).length,nameHits:rs.filter(r=>r.test(name)).length})).sort((a,b)=>b.hits-a.hits||b.nameHits-a.nameHits);const top=ranks[0],tie=ranks[1].hits===top.hits;const kind=top.hits&&!tie?top.kind:'supporting';const evidence=[];let page=null;for(const line of sample.split(/\r?\n/)){const p=line.match(/^\s*PAGE\s+(\d+)\s*$/i);if(p){page=+p[1];continue;}if(line.trim()&&Object.values(rules).flat().some(r=>r.test(line)))evidence.push({page,quote:line.trim().slice(0,600)});}return {kind,label:kind==='supporting'?'Supporting document / review type':kind.replace('_',' '),basis:top.hits&&!tie?top.hits+' text signals matched':'No unique text match; choose a document type',evidence:evidence.slice(0,30),characters:sample.length};}
// A strict twelve-month ledger reader. Totals never become detail accounts.
function monthly(text,name,TB){
 const raw=String(text),year=/Through Period December (20\d{2})/i.exec(raw)?.[1];
 if(!year||!/January\s+February\s+March[\s\S]*?November\s+December\s+Total/i.test(raw))return null;
 if(/pro[ -]?forma/i.test(raw))return null;
 const amount=/\(?-?\$?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\)?/g;
 let section=null,page=1;const rows=[],totals=[];
 for(const line of raw.split(/\r?\n/)){
  if(/^PAGE \d+$/.test(line.trim())){page=+line.trim().split(' ')[1];continue;}
  if(/^REVENUE\s*$/.test(line.trim())){section='Income';continue;}
  if(/^EXPENSES\s*$/.test(line.trim())){section='Expense';continue;}
  if(!section)continue;const matches=[...line.matchAll(amount)];if(matches.length!==13)continue;
  const label=line.slice(0,matches[0].index).trim();if(!label)continue;
  const values=matches.slice(0,12).map(x=>TB.toNum(x[0])),total=TB.toNum(matches[12][0]);
  if(/^Total\b|^Net (?:Operating Income|Cash Flow)/i.test(label)){totals.push({label,values,total,type:section,page});continue;}
  rows.push({label,values,total,type:section,page});
 }
 if(!rows.length)return null;
 const income=totals.find(x=>/^TOTAL REVENUE$/i.test(x.label)),expense=totals.find(x=>/^Total Operating Expense$/i.test(x.label)),noi=totals.find(x=>/^Net Operating Income$/i.test(x.label));
 if(!income||!expense)return null;
 const doc=TB.fromAI('statement',{months:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(x=>x+' '+year),lines:rows,subtotals:[]},{file:name,method:'local-monthly-ledger',pages:page});
 doc.meta.property=/12 Month Income Statement[ \t]+([^\n]+)/i.exec(raw)?.[1]?.trim()||null;doc.meta.period_end=+year*100+12;doc.meta.title='Twelve-month operating statement';doc.issues=[];
 doc.tie_out=[];const check=(label,a,b)=>doc.tie_out.push({label,ok:Math.abs(a-b)<.02,expected:b,actual:a,delta:a-b});
 rows.forEach(r=>check(r.label+' · monthly sum',r.values.reduce((a,b)=>a+b,0),r.total));
 for(const [type,t]of [['Income',income],['Expense',expense]]){const rr=rows.filter(r=>r.type===type);check(type+' · printed annual total',rr.reduce((a,r)=>a+r.total,0),t.total);for(let i=0;i<12;i++)check(type+' · '+doc.months[i],rr.reduce((a,r)=>a+r.values[i],0),t.values[i]);}
 totals.forEach(t=>check(t.label+' · printed total vs months',t.values.reduce((a,b)=>a+b,0),t.total));
 if(noi)check('Printed NOI',income.total-expense.total,noi.total);
 doc.subtotals=totals;doc.issues.push('Local twelve-month ledger extraction: verify source pages. Repeated account labels remain separate.');
 return doc;
}
function parse(text,name,TB,opts,kind='auto',pages=[]){if(/\bpro[ -]?forma\b/i.test(text)&&kind!=='lease')return {error:'This contains pro forma assumptions. Review it as a broker model; it is not historical operating actuals.'};const guided=root.UWDocumentReader?.parse(text,name,TB,root.DocReaders,kind,opts,pages);if(guided?.doc||guided?.error&&kind!=='auto')return guided;if(/\bpro[ -]?forma\b/i.test(text))return {error:'This contains pro forma assumptions. Review it as a broker model; it is not historical operating actuals.'};const ledger=monthly(text,name,TB);if(ledger)return {kind:'statement',doc:ledger};const source={file:name,reader:'Built-in text reader'};const lines=String(text).split(/\r?\n/).filter(x=>x.trim());const grid=lines.map(l=>l.trim().split(/\t| {2,}/));for(const method of (kind==='statement'?['readStatementGrid']:['readRentRollGrid','readStatementGrid'])){try{return {kind:method==='readRentRollGrid'?'rent_roll':'statement',doc:TB[method](grid,source,opts||{})}}catch(e){if(e.name!=='UnsupportedLayout')return {error:e.message};}}try{return {kind:'statement',doc:TB.readAnnualStatement(text,source)}}catch(e){return {error:e.name==='UnsupportedLayout'?'No supported financial table found. Review text and source pages; enter missing values or use optional visual AI.':e.message};}}
function audit(doc,coverage){
 const missing=(coverage||[]).filter(p=>p.needsOCR);doc.issues=doc.issues||[];doc.tie_out=doc.tie_out||[];
 if(missing.length){const label='PDF text coverage · review pages '+missing.map(p=>p.page).join(', ');doc.issues.push(label+' (image-only or low text; not proof of a blank page).');doc.tie_out.push({label,ok:false,expected:coverage.length,actual:coverage.length-missing.length,delta:-missing.length});}
 const financial=doc.lines||[];for(const r of financial){if(r.values?.length===12&&Number.isFinite(r.total)&&r.values.every(Number.isFinite)){const sum=r.values.reduce((a,b)=>a+b,0);if(Math.abs(sum-r.total)>.02&&!doc.tie_out.some(c=>c.label===r.label+' · monthly sum'))doc.tie_out.push({label:r.label+' · monthly sum',ok:false,expected:r.total,actual:sum,delta:sum-r.total});}}
 return doc;
}
root.UWLocalReader={inspect,parse,monthly,audit};if(typeof module!=='undefined')module.exports=root.UWLocalReader;
})(typeof window==='undefined'?globalThis:window);
