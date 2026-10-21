import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
for(const mutation of ['locked','stale','cents','links','coverage']){
 const r=spawnSync(process.execPath,['--import',new URL('./register.mjs',import.meta.url).href,new URL('./run.mjs',import.meta.url).pathname],{encoding:'utf8',env:{...process.env,RENT_WRITE_MUTATION:mutation}});
 assert.ok(r.status!==0&&r.stderr.includes('AssertionError'),mutation+' escaped tests: '+r.stdout+r.stderr);
 console.log('PASS restored '+mutation+' defect rejected by actual handler tests');
}
