globalThis.document ||= {createElement:()=>({}),addEventListener(){},documentElement:{style:{}},querySelector:()=>null,body:{}};globalThis.window ||= globalThis;
const A=await import(process.cwd()+'/app/abstracts.js');
const ab=A.newAbstract({title:'x'});
console.log(A.setValue(ab,'commencement',null,{rel:'the day after delivery'}), JSON.stringify(ab.fields));
