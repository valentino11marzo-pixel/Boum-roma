import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const file=new URL('../../api/listings-availability.js',import.meta.url);
const original=readFileSync(file,'utf8');
const cases=[
 ['anteprima superata',"u.expected !== undefined && u.expected !== DISPO.availabilityKey(l)",'false'],
 ['commit concorrente','precondition: { updateTime: current.updateTime }','precondition: { exists: true }'],
 ['falso successo parziale','ok: failed.length === 0, applied, failed, plan','ok: true, applied, failed, plan'],
 ['scrittura proprietario globale',"new Set(['admin'])","new Set(['admin', 'landlord'])"]
];
try{
 for(const [label,from,to] of cases){
  assert(original.includes(from),label+' mutation target missing');
  writeFileSync(file,original.replace(from,to));
  const r=spawnSync(process.execPath,['tests/dispo/run.mjs'],{encoding:'utf8'});
  assert.notEqual(r.status,0,label+' mutation escaped');
  assert.match(r.stdout,/✗/,label+' must fail an assertion');
  console.log('✓ difetto rilevato: '+label);
 }
}finally{writeFileSync(file,original)}
