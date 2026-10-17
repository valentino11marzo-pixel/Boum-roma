import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=new URL('../../',import.meta.url);
const files=['api/package.json','api/_auth.js','api/homie/_lib.js','api/tenant/maintenance.js','api/tenant/documents.js','api/tenant/notifications.js','js/tenant-workspace-engine.js','tests/tenant-workspace/run.mjs','firestore.rules'];
const mutations=[
  ['notification ownership','api/tenant/notifications.js',"(actor.profile.role!=='admin'&&c.tenantId!==actor.uid)",'false'],
  ['archive ownership','js/tenant-workspace-engine.js',"d.userId===uid||(d.shared===true&&d.contractId===c.id&&!d.userId)",'true'],
  ['contract ownership','api/tenant/maintenance.js',"(!admin&&c.tenantId!==actor.uid)",'false'],
  ['edit revision','api/tenant/maintenance.js',"b.revision!==record.data.revision",'false'],
  ['create retry idempotency','api/tenant/maintenance.js',"if(!record)fields=",'if(true)fields='],
  ['workflow field protection','firestore.rules',"'source', 'revision', 'requestHash', 'delivery', 'previousDelivery'","'unrelated'"],
];
for(const [name,file,from,to] of mutations){
  const dir=mkdtempSync(join(tmpdir(),'boom-workspace-mutation-'));
  try{
    for(const f of files){mkdirSync(dirname(join(dir,f)),{recursive:true});copyFileSync(new URL(f,root),join(dir,f))}
    const path=join(dir,file),source=readFileSync(path,'utf8');assert.ok(source.includes(from),name+' target exists');writeFileSync(path,source.replace(from,to));
    const result=spawnSync(process.execPath,['tests/tenant-workspace/run.mjs'],{cwd:dir,encoding:'utf8',timeout:20000});
    assert.notEqual(result.status,0,name+' mutation must fail');assert.match(result.stderr,/AssertionError/,name+' must fail an assertion, not setup');console.log('PASS rejected '+name);
  }finally{rmSync(dir,{recursive:true,force:true})}
}
console.log(`${mutations.length} tenant workspace mutations rejected`);
