import {spawnSync} from 'node:child_process';
const mutations=['adopt-stale','unsigned-send','receipt-without-evidence','magic-sign-reopens'];
for(const mutation of mutations){
 const r=spawnSync(process.execPath,[new URL('./run.mjs',import.meta.url).pathname],{env:{...process.env,EXTERNAL_MUTATION:mutation},encoding:'utf8',timeout:20000});
 const out=String(r.stdout||'')+String(r.stderr||'');
 if(r.error||r.status===0||!out.includes('AssertionError'))throw Error('Mutation not caught: '+mutation+'\n'+out);
 console.log('KILLED '+mutation);
}
console.log(`External contract: ${mutations.length} mutations killed`);
