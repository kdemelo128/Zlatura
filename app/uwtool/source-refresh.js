/* Three-way source refresh: distinguish a broker edit from an unchanged source value. */
((root)=>{'use strict';const n=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' '),identity=t=>n(t.unit)+'|'+n(t.tenant),fields=['unit','tenant','status','sqft','rent','charges','lease_from','lease_to','next_date','next_amt'];
function reference(prior,t){const rows=(prior?.tenants||[]).filter(p=>p.sourceId&&p.sourceId===t.sourceId);return rows.length===1?rows[0]:null;}
function candidates(old,prior,fresh){return old.filter(o=>{const before=reference(prior,o)||o;return identity(before)===identity(fresh);});}
function retain(current,old,before){const result={...current},changes=[];if(!before)return{tenant:result,changes};for(const k of fields)if(JSON.stringify(old[k]??null)!==JSON.stringify(before[k]??null)){result[k]=old[k];changes.push(k);}return{tenant:result,changes};}
function account(old,prior,fresh){const found=old.filter(o=>{const rows=(prior?.accounts||[]).filter(p=>p.sourceId&&p.sourceId===o.sourceId),p=rows.length===1?rows[0]:o;return n(p.label)===n(fresh.label)&&n(p.sourceGroup)===n(fresh.sourceGroup);});if(found.length!==1)return null;const o=found[0],rows=(prior?.accounts||[]).filter(p=>p.sourceId&&p.sourceId===o.sourceId),p=rows.length===1?rows[0]:null;return{old:o,current:{...fresh,...(p&&o.label!==p.label?{label:o.label}:{})}};}
root.UWSourceRefresh={identity,reference,candidates,retain,account};
})(typeof window==='undefined'?globalThis:window);
