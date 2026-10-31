globalThis.document ||= {createElement:()=>({}),addEventListener(){},documentElement:{style:{}},querySelector:()=>null,body:{}};globalThis.window ||= globalThis;
import fs from 'fs';
const { readBackup, planRestore } = await import(process.cwd()+'/app/backup.js');
const b = readBackup(fs.readFileSync('tests/fixtures/backup-3.1.0-before-rent-roll.json','utf8'));
const p = planRestore(b, {deals:[],kv:{},session:null,local:{}}, 'merge', 1);
const d = p.deals.put[0];
console.log(Object.keys(d).join(','), d.schema, JSON.stringify(d.abstracts), JSON.stringify(d.dd));
console.log(p.summary);
