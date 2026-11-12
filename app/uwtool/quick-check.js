/* Quick check and Calculators, at the top of the Model step. The page that holds this tool gives it window.MonalApp (the app's
 * own engine, calculators and deal paths: app/uwfiller/toolbridge.js); this file only draws the panel and passes text across.
 * No figure is worked out here. Without the app around it (the tool opened on its own) the panel is not shown. */
(()=>{'use strict';
const host=document.getElementById('stepModel');if(!host)return;
const DEBOUNCE=250;
let app=null,panel,fields={},touched=new Set(),tool={loan:null,equity:null},timer=0,runTimer=0,els={};
const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const text=()=>Object.fromEntries(Object.keys(fields).map(id=>[id,fields[id].value]));
const model=()=>window.UWEditor&&window.UWEditor.model&&window.UWEditor.model();

/** The tool's own figures, as plain data for the app to read (it decides what is the broker's and what is a starting value). */
function toolFigures(){
  const m=model();if(!m||!window.UWFinance)return null;
  let noi=null,calc=null;
  try{if(typeof UW!=='undefined')noi=UW.calc(m,Number(m.forecastStart)).totals.noi;}catch{noi=null;}
  try{const c=UWFinance.calculate(m);calc={errors:c.errors||[],equity:c.equity};}catch{calc=null;}
  const slim={name:m.name,finance:m.finance,tenants:(m.tenants||[]).length?[0]:[],accounts:(m.accounts||[]).length?[0]:[],changeLog:(Array.isArray(m.changeLog)?m.changeLog:[]).map(e=>({changes:(Array.isArray(e&&e.changes)?e.changes:[]).map(c=>({path:c&&c.path}))}))};
  return{model:slim,noi:Number.isFinite(noi)?noi:null,defaults:UWFinance.defaults(),calc};
}

function build(){
  panel=make('section','quick-check');panel.id='quickCheck';panel.setAttribute('aria-labelledby','qcTitle');
  const head=make('div','qc-head');head.append(make('h3',null,'Quick check'));head.firstChild.id='qcTitle';
  head.append(make('p','small','The app’s own engine, on a price, NOI and loan terms. It starts from this tool’s figures. A blank stays blank, and nothing here changes the model.'));
  const grid=make('div','grid qc-grid');
  for(const f of app.fields){
    const lab=make('label',null,f.label);const inp=make('input');inp.id='qc_'+f.id;inp.inputMode='decimal';inp.autocomplete='off';inp.setAttribute('aria-describedby','qc_err_'+f.id);
    const err=make('span','small qc-err');err.id='qc_err_'+f.id;
    inp.addEventListener('input',()=>{touched.add(f.id);scheduleRun();});
    lab.append(inp,err);grid.append(lab);fields[f.id]=inp;els['err_'+f.id]=err;
  }
  els.blank=make('p','small qc-blank');els.blank.id='qcBlank';
  els.flag=make('div','msg warn qc-flag');els.flag.id='qcFlag';els.flag.setAttribute('role','status');els.flag.hidden=true;
  els.notes=make('div','qc-notes');els.notes.setAttribute('role','status');
  els.res=make('ul','qc-results');els.res.id='qcResults';els.res.setAttribute('aria-label','Quick check results');
  const acts=make('div','row qc-acts');
  const use=make('button','ghost','Use this tool’s figures');use.type='button';use.id='qcRefill';use.addEventListener('click',()=>{touched.clear();snapshot(true);});
  const save=make('button',null,'Save as deal');save.type='button';save.id='qcSave';save.disabled=true;els.save=save;
  save.addEventListener('click',async()=>{const m=model();try{await app.save(text(),tool,m&&m.name);}catch{}});
  acts.append(save,use);
  const calcs=make('details','optional-panel qc-calcs');calcs.id='qcCalcs';calcs.append(make('summary',null,'Calculators'));
  const note=make('p','small','Quick value, loan sizing, offer and seller net, net effective rent, WALT and more. They open over this page and start from the figures above where they share one.');
  els.calcs=make('div','qc-calc-list');calcs.append(note,els.calcs);
  panel.append(head,grid,els.blank,els.flag,els.notes,els.res,acts,calcs);
  const intro=host.querySelector('h2')?.nextElementSibling;
  if(intro)intro.after(panel);else host.prepend(panel);
  drawCalculators();
}

function drawCalculators(){
  const groups=new Map();
  for(const c of app.calculators()){if(!groups.has(c.group))groups.set(c.group,[]);groups.get(c.group).push(c);}
  els.calcs.textContent='';
  for(const [g,list] of groups){
    const box=make('div','qc-group');box.append(make('span','small',g));
    const row=make('div','row');
    for(const c of list){const b=make('button','ghost',c.title);b.type='button';b.dataset.calc=c.id;b.title=c.desc||'';b.addEventListener('click',()=>app.openCalculator(c.id,text()));row.append(b);}
    box.append(row);els.calcs.append(box);
  }
}

/** Fill from the tool: fields the broker has typed into here are left alone (unless `all`). */
function snapshot(all){
  const f=toolFigures();if(!f)return;
  const s=app.snapshot(f);
  for(const id of Object.keys(fields)){if(all||!touched.has(id))fields[id].value=s.text[id];}
  tool=s.tool;
  els.blank.textContent=s.blank.length?'Left blank, as the tool has no figure of yours for it: '+s.blank.map(b=>b.label.toLowerCase()+' ('+b.why+')').join('; ')+'.':'';
  run();
}

function scheduleRun(){clearTimeout(runTimer);runTimer=setTimeout(run,60);}
function run(){
  const r=app.run(text(),tool);
  for(const id of Object.keys(fields)){const bad=!!r.refused[id];els['err_'+id].textContent=bad?'This can’t be used here; the engine’s default is used instead.':'';fields[id].setAttribute('aria-invalid',bad?'true':'false');}
  els.res.textContent='';
  for(const x of r.lines.concat(r.answers)){const li=make('li',x.strong?'strong':null);const s=make('span',null,x.k);if(x.why)s.append(make('span','small qc-why',x.why));li.append(s,make('b',null,x.v));els.res.append(li);}
  els.notes.textContent='';for(const n of r.notes)els.notes.append(make('p','msg warn',n));
  els.flag.textContent='';
  for(const f of r.flags){els.flag.append(make('p',null,f.label+': the app works out '+f.engine+'; this tool has '+f.tool+'. A deal keeps the app’s figure.'));}
  els.flag.hidden=!r.flags.length;
  els.save.disabled=!r.canSave;
}

function start(){
  if(panel||!window.MonalApp||!model()||!window.UWFinance)return;
  app=window.MonalApp;build();snapshot(true);
  window.addEventListener('uw-model-change',()=>{clearTimeout(timer);timer=setTimeout(()=>snapshot(false),DEBOUNCE);});
}
const arrive=()=>{if(window.MonalApp&&!panel){let n=0;const wait=()=>{if(model()&&window.UWFinance)start();else if(n++<50)setTimeout(wait,100);};wait();}};
window.addEventListener('monal-app-ready',arrive);
if(document.readyState==='complete')arrive();else window.addEventListener('load',arrive);
})();
