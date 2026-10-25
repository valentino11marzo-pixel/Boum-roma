import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ensureSmartLinkIndex,inspectSmartLinkIndex,selectSmartLinkIndex} from '../../tools/ensure-smartlink-index.mjs';

const toolURL=new URL('../../tools/ensure-smartlink-index.mjs',import.meta.url);
const specURL=new URL('../../firestore.indexes.json',import.meta.url);
const spec=JSON.parse(await readFile(specURL,'utf8'));
const desired=selectSmartLinkIndex(spec);
const parent='projects/boom-property-dashboards/databases/(default)/collectionGroups/smartlinkImports';
const endpoint='https://firestore.googleapis.com/v1/'+parent+'/indexes';
const wildcardEndpoint=endpoint.replace('/collectionGroups/smartlinkImports/','/collectionGroups/-/');
const TEST_TOKEN='test-smartlink-index-token-never-log';
const remote=(state='READY',overrides={})=>({name:parent+'/indexes/idx123',queryScope:'COLLECTION',
  fields:[...desired.fields,{fieldPath:'__name__',order:'DESCENDING'}],state,...overrides});
const json=(body,status=200)=>Response.json(body,{status});
function scenario(replies) {
  let time=0,position=0;const calls=[];
  const options={now:()=>time,sleep:async ms=>{time+=ms;},timeoutMs:25,pollMs:5,
    fetchImpl:async(input,opts)=>{
      const url=new URL(input),method=opts.method;
      assert.equal(url.origin+url.pathname,method==='POST'?endpoint:wildcardEndpoint,
        'LIST uses the fixed database metadata endpoint; POST is restricted to smartlinkImports');
      assert.ok(['GET','POST'].includes(method),'Index bootstrap is additive: never PATCH/DELETE');
      assert.equal(opts.redirect,'error','Credentials must never follow redirects');
      assert.equal(opts.headers.Authorization,'Bearer '+TEST_TOKEN);
      const body=opts.body?JSON.parse(opts.body):undefined;
      if(method==='POST') {assert.deepEqual(body,desired);assert.equal(url.search,'');}
      else {assert.equal(body,undefined);assert.equal(url.searchParams.has('pageSize'),false);}
      calls.push({url:url.toString(),method,body});
      const reply=replies[Math.min(position++,replies.length-1)];
      return typeof reply==='function'?reply(url,opts):reply.clone();
    }};
  return {calls,run:(fn=ensureSmartLinkIndex,extra={})=>fn({...options,...extra})};
}

const previousToken=process.env.SMARTLINK_INDEX_TOKEN;
process.env.SMARTLINK_INDEX_TOKEN=TEST_TOKEN;
const temp=await mkdtemp(join(tmpdir(),'boom-smartlink-index-test-'));
const logs=[],oldConsole={log:console.log,warn:console.warn,error:console.error};
for(const key of Object.keys(oldConsole)) console[key]=(...args)=>logs.push(args.map(String).join(' '));
try {
  const existing=scenario([json({indexes:[remote()]})]);
  assert.deepEqual(await existing.run(),{state:'READY',created:false});
  assert.deepEqual(existing.calls.map(c=>c.method),['GET']);

  const paged=scenario([json({indexes:[remote('READY',{name:parent.replace('smartlinkImports','messages')+'/indexes/other'})],nextPageToken:'page 2/+='}),
    (url)=>{assert.equal(url.searchParams.get('pageToken'),'page 2/+=');return json({indexes:[remote()]});}]);
  assert.equal((await paged.run()).state,'READY');assert.equal(paged.calls.length,2);

  const creating=scenario([json({}),json({name:'projects/test/operations/create'}),json({indexes:[remote('CREATING')]}),json({indexes:[remote()]})]);
  assert.deepEqual(await creating.run(),{state:'READY',created:true});
  assert.deepEqual(creating.calls.map(c=>c.method),['GET','POST','GET','GET']);

  const concurrent=scenario([json({indexes:[]}),json({error:{message:TEST_TOKEN}},409),json({indexes:[remote('CREATING')]}),json({indexes:[remote()]})]);
  assert.deepEqual(await concurrent.run(),{state:'READY',created:false});
  assert.equal(concurrent.calls.filter(c=>c.method==='POST').length,1,'Concurrent creation is followed by a read, not another POST');

  for(const first of [[],[json({indexes:[]})]]) {
    const forbidden=scenario([...first,json({error:{message:TEST_TOKEN}},403)]);
    await assert.rejects(()=>forbidden.run(),error=>error.code==='index_permission_denied' && !error.message.includes(TEST_TOKEN));
    assert.equal(forbidden.calls.length,first.length+1,'403 must stop without an IAM retry');
  }
  const timedOut=scenario([json({indexes:[]}),json({done:true,response:remote('READY')}),json({indexes:[remote('CREATING')]})]);
  await assert.rejects(()=>timedOut.run(),{code:'index_timeout'});
  assert.equal(timedOut.calls.filter(c=>c.method==='POST').length,1,'An Operation success is not proof of index readiness');
  const repair=scenario([json({indexes:[remote('NEEDS_REPAIR')]})]);
  await assert.rejects(()=>repair.run(),{code:'index_needs_repair'});assert.equal(repair.calls.length,1);
  const unknown=scenario([json({indexes:[remote('STATE_UNSPECIFIED')]})]);
  await assert.rejects(()=>unknown.run(),{code:'index_unknown_state'});

  const wrong=[remote('READY',{name:parent.replace('boom-property-dashboards','other-project')+'/indexes/x'}),
    remote('READY',{queryScope:'COLLECTION_GROUP'}),remote('READY',{apiScope:'MONGODB_COMPATIBLE_API'}),
    remote('READY',{fields:[{fieldPath:'createdBy',order:'DESCENDING'},desired.fields[1]]}),
    remote('READY',{fields:[...desired.fields,{fieldPath:'__name__',order:'ASCENDING'}]}),
    remote('READY',{fields:[...desired.fields,{fieldPath:'extra',order:'DESCENDING'}]}),
    remote('READY',{fields:[desired.fields[1],desired.fields[0]]})];
  const unrelated=scenario([json({indexes:wrong}),json({name:'create-operation'}),json({indexes:[remote()]})]);
  assert.deepEqual(await unrelated.run(),{state:'READY',created:true});
  assert.equal(unrelated.calls.filter(c=>c.method==='POST').length,1,'Unrelated or wrongly ordered fields never certify the target index');

  const loop=scenario([json({nextPageToken:'again'})]);
  await assert.rejects(()=>loop.run(),{code:'invalid_index_pagination'});
  const missingAfterCreate=scenario([json({indexes:[]}),json({name:'create-operation'}),json({indexes:[]})]);
  await assert.rejects(()=>missingAfterCreate.run(),{code:'index_timeout'});
  assert.equal(missingAfterCreate.calls.filter(c=>c.method==='POST').length,1);

  let networkCalls=0;
  const neverFetch=async()=>{networkCalls++;throw new Error('must not call the network');};
  const valid=spec.indexes.find(i=>i.collectionGroup==='smartlinkImports');
  const invalid=[null,{indexes:[]},{indexes:[{...valid,queryScope:'COLLECTION_GROUP'}]},
    {indexes:[{...valid,fields:valid.fields.slice().reverse()}]},{indexes:[valid,valid]}];
  for(let i=0;i<invalid.length;i++) {
    const path=join(temp,'invalid-'+i+'.json');await writeFile(path,JSON.stringify(invalid[i]));
    await assert.rejects(()=>ensureSmartLinkIndex({indexesFile:path,fetchImpl:neverFetch}),{code:'invalid_index_spec'});
  }
  await assert.rejects(()=>ensureSmartLinkIndex({indexesFile:join(temp,'missing.json'),fetchImpl:neverFetch}),{code:'invalid_index_spec'});
  delete process.env.SMARTLINK_INDEX_TOKEN;
  await assert.rejects(()=>ensureSmartLinkIndex({fetchImpl:neverFetch}),{code:'missing_index_token'});
  process.env.SMARTLINK_INDEX_TOKEN=TEST_TOKEN;
  assert.equal(networkCalls,0,'Invalid specification and missing token fail before any remote request');
  await assert.rejects(()=>ensureSmartLinkIndex({timeoutMs:300001,fetchImpl:neverFetch}),{code:'invalid_wait_budget'});
  const leakingTransport=scenario([()=>{throw new Error(TEST_TOKEN);}]);
  await assert.rejects(()=>leakingTransport.run(),error=>error.code==='index_request_failed' && !error.message.includes(TEST_TOKEN));

  const remoteError={error:{status:'INVALID_ARGUMENT',message:TEST_TOKEN,details:[
    {'@type':'type.googleapis.com/google.rpc.BadRequest',fieldViolations:[
      {field:'parent',description:TEST_TOKEN},{field:TEST_TOKEN,description:TEST_TOKEN}]}]}};
  for(const first of [[],[json({indexes:[]})]]) {
    const rejected=scenario([...first,json(remoteError,400)]);
    await assert.rejects(()=>rejected.run(),error=>{
      assert.deepEqual(error.diagnostic,{phase:first.length?'CREATE':'LIST',method:first.length?'POST':'GET',httpStatus:400,
        rpcStatus:'INVALID_ARGUMENT',fields:['parent']});
      assert.ok(!JSON.stringify(error).includes(TEST_TOKEN));return error.code==='index_http_error';
    });
  }

  // The probe compares fixed REST contracts, including the Firebase CLI list
  // route. Even ABSENT/CREATING must never publish or wait for readiness.
  const probeURLs=[endpoint+'?pageSize=100',wildcardEndpoint+'?pageSize=100',wildcardEndpoint];
  const probeCalls=[];
  const probeOptions={fetchImpl:async(url,opts)=>{
    const position=probeCalls.length;
    assert.equal(url,probeURLs[position]);assert.equal(opts.method,'GET');assert.equal(opts.body,undefined);
    assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,'Bearer '+TEST_TOKEN);
    probeCalls.push(url);
    return [json(remoteError,400),json({indexes:[remote('CREATING'),...wrong]}),json({indexes:wrong})][position];
  },sleep:async()=>assert.fail('Read-only probe must not poll CREATING')};
  const probe=await inspectSmartLinkIndex(probeOptions);
  assert.equal(probe.readOnly,true);assert.equal(probeCalls.length,3);
  assert.deepEqual(probe.results.map(({variant,ok,state,count})=>({variant,ok,state,count})),[
    {variant:'scoped_page_size',ok:false,state:undefined,count:undefined},
    {variant:'wildcard_page_size',ok:true,state:'CREATING',count:1},
    {variant:'wildcard_cli',ok:true,state:'ABSENT',count:0}]);
  assert.deepEqual(probe.results[0].diagnostic,{phase:'LIST',method:'GET',httpStatus:400,rpcStatus:'INVALID_ARGUMENT',fields:['parent']});
  assert.ok(!JSON.stringify(probe).includes(TEST_TOKEN));
  const hostile=await inspectSmartLinkIndex({fetchImpl:async()=>json({error:{status:TEST_TOKEN,message:TEST_TOKEN}},403)});
  assert.equal(hostile.results.length,3);
  assert.ok(hostile.results.every(item=>item.code==='index_permission_denied' && item.diagnostic.method==='GET' && !item.diagnostic.rpcStatus));
  assert.ok(!JSON.stringify(hostile).includes(TEST_TOKEN));
  let probeClock=0,probeRequests=0;
  const probeTimeout=await inspectSmartLinkIndex({timeoutMs:25,now:()=>probeClock,fetchImpl:async()=>{
    probeRequests++;probeClock+=26;return json({indexes:[remote()]});
  }});
  assert.equal(probeRequests,3);assert.ok(probeTimeout.results.every(item=>item.code==='index_timeout'));
  const invalidInspect=await inspectSmartLinkIndex({indexesFile:join(temp,'missing.json'),fetchImpl:neverFetch});
  assert.ok(invalidInspect.results.every(item=>item.code==='invalid_index_spec'));assert.equal(networkCalls,0);
  assert.ok(logs.every(message=>!message.includes(TEST_TOKEN)),'Tokens and remote error bodies never enter logs');

  const cliEnv={...process.env};delete cliEnv.SMARTLINK_INDEX_TOKEN;
  const cli=spawnSync(process.execPath,[fileURLToPath(toolURL)],{env:cliEnv,encoding:'utf8'});
  assert.equal(cli.status,1);assert.match(cli.stderr,/missing_index_token/);
  assert.ok(!cli.stdout.includes(TEST_TOKEN) && !cli.stderr.includes(TEST_TOKEN));
  const inspectCLI=spawnSync(process.execPath,[fileURLToPath(toolURL),'--inspect'],{env:cliEnv,encoding:'utf8'});
  assert.equal(inspectCLI.status,1);assert.match(inspectCLI.stdout,/INSPECT \(sola lettura\)/);assert.doesNotMatch(inspectCLI.stdout,/READY:/);
  const badCLI=spawnSync(process.execPath,[fileURLToPath(toolURL),'--unexpected'],{env:cliEnv,encoding:'utf8'});
  assert.equal(badCLI.status,1);assert.match(badCLI.stderr,/invalid_index_arguments/);

  // Mutation: treat CREATING as usable. The same readiness check must then fail.
  const source=await readFile(toolURL,'utf8');
  // Regression from the actual WIF probe: both REST routes reject pageSize=100;
  // wildcard without it succeeds. Exercise create + READY through that contract.
  async function verifyListContract(fn) {
    let created=false;const methods=[];
    const result=await fn({fetchImpl:async(input,options)=>{
      const url=new URL(input);methods.push(options.method);
      if(options.method==='GET') {
        if(url.searchParams.has('pageSize')) return json({error:{status:'INVALID_ARGUMENT'}},400);
        assert.equal(url.origin+url.pathname,wildcardEndpoint);
        return json({indexes:created?[remote()]:[]});
      }
      assert.equal(options.method,'POST');assert.equal(url.toString(),endpoint);
      assert.deepEqual(JSON.parse(options.body),desired);created=true;
      return json({name:'create-operation'});
    }});
    assert.deepEqual(result,{state:'READY',created:true});assert.deepEqual(methods,['GET','POST','GET']);
  }
  await verifyListContract(ensureSmartLinkIndex);
  const listDefault='listVariant=LIST_VARIANTS[2]';
  assert.ok(source.includes(listDefault),'Mutation must change the real LIST variant');
  const pageSizeMutant=source.replace(listDefault,'listVariant=LIST_VARIANTS[1]')
    .replace("new URL('../firestore.indexes.json',import.meta.url)",`new URL(${JSON.stringify(specURL.href)})`);
  const changedList=await import('data:text/javascript,'+encodeURIComponent(pageSizeMutant));
  await assert.rejects(()=>verifyListContract(changedList.ensureSmartLinkIndex),error=>
    error.code==='index_http_error' && error.diagnostic?.phase==='LIST' && error.diagnostic?.httpStatus===400,
    'Reintroducing pageSize must reproduce and detect the real REST failure');

  const guard="if(matches.some(index=>index.state==='READY'))";
  assert.ok(source.includes(guard),'Mutation must replace the real readiness guard');
  const mutant=source.replace(guard,"if(matches.some(index=>index.state==='READY' || index.state==='CREATING'))")
    .replace("new URL('../firestore.indexes.json',import.meta.url)",`new URL(${JSON.stringify(specURL.href)})`);
  const changed=await import('data:text/javascript,'+encodeURIComponent(mutant));
  const mutantScenario=scenario([json({indexes:[remote('CREATING')]})]);
  await assert.rejects(()=>assert.rejects(()=>mutantScenario.run(changed.ensureSmartLinkIndex),{code:'index_timeout'}),
    {code:'ERR_ASSERTION'},'Removing the READY guard must be detected');

  const workflow=await readFile(new URL('../../.github/workflows/ci.yml',import.meta.url),'utf8');
  const start=workflow.indexOf('      - name: Verifica indice SmartLink pronto');
  const rulesDeploy=workflow.indexOf('npx firebase-tools deploy --only firestore:rules,storage');
  assert.ok(rulesDeploy>=0 && start>rulesDeploy,'Index verification runs after rules/storage deployment');
  const step=workflow.slice(start).split(/\n      - /)[0];
  assert.match(step,/if:\s*github\.ref\s*==\s*'refs\/heads\/main'\s*\n/,'Manual dispatch from a branch must not provision production indexes');
  assert.match(step,/SMARTLINK_INDEX_TOKEN:\s*\$\{\{ steps\.firebase_auth\.outputs\.access_token \}\}/);
  assert.match(workflow,/id: firebase_auth\s*\n/);assert.match(step,/timeout-minutes:\s*6\s*\n/);
  assert.match(step,/run: node tools\/ensure-smartlink-index\.mjs/);
} finally {
  for(const [key,value] of Object.entries(oldConsole)) console[key]=value;
  if(previousToken===undefined) delete process.env.SMARTLINK_INDEX_TOKEN;else process.env.SMARTLINK_INDEX_TOKEN=previousToken;
  await rm(temp,{recursive:true,force:true});
}
console.log('SmartLink index: fixed additive target, pagination, READY gate, concurrency, bounded failures, token privacy, main-only WIF and mutation ✓');
