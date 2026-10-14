import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadChromium,launchOptions } from '../_browser.mjs';
import { createHarnessServer } from './harness.mjs';
const server=createHarnessServer();await new Promise(r=>server.listen(Number(process.env.PORT)||0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
if(process.argv.includes('--serve')){console.log('Portal workspace · real UI / synthetic data: '+base+'/#users · Home '+base+'/home');await new Promise(()=>{});}
const artifacts=await mkdtemp(join(tmpdir(),'boom-portal-workspace-'));let browser,checks=0;const measurements=[];
try{
 const chromium=await loadChromium();assert(chromium,'Real browser required');browser=await chromium.launch(launchOptions({headless:true}));
 for(const width of [390,320,1280]){
  const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(6000);const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():(external.push(r.request().url()),r.abort()));
  const check=async(name,fn)=>{await fn();checks++;console.log('PASS '+width+' '+name)};
  const fresh=async(section)=>{await page.goto(base+'/#'+section);await page.waitForFunction(()=>window.testReady);await page.waitForTimeout(140);assert.deepEqual(errors,[])};
  await fresh('properties');
  await check('property dossier → linked communications → real chat → return retains the same property',async()=>{
   await page.locator('[data-property-id="casa-demo"]').click();await page.waitForSelector('#pdos-title');
   await page.getByRole('button',{name:'Comunicazioni collegate',exact:true}).scrollIntoViewIfNeeded();
   const origin=await page.evaluate(()=>({page:S.page,scroll:scrollY}));
   await page.getByRole('button',{name:'Comunicazioni collegate',exact:true}).click();await page.waitForFunction(()=>S.inboxContext&&!S.inboxContext.loading);
   assert.equal(await page.evaluate(()=>S.inboxContext.error),false);assert.equal(await page.locator('.inbox-conversations>[onclick]').count(),1);
   assert.deepEqual(await page.evaluate(()=>testIO.reads),[{name:'operatorTasks',field:'followUp.propertyRef',op:'==',value:'properties/casa-demo',limit:101,source:'server'},{name:'conversations',id:'conversation-0',source:'server'}]);
   await page.locator('[onclick="inboxSelect(\'conversation-0\')"]').click();await page.waitForSelector('#inboxBody');
   assert.match(await page.locator('.inbox-thread-head').innerText(),/Persona Demo 0/);
   await page.screenshot({path:join(artifacts,'property-linked-chat-'+width+'.png')});
   if(width<=920)await page.locator('.inbox-back').click();
   await page.getByRole('button',{name:'← Torna al contesto',exact:true}).click();await page.waitForSelector('#pdos-title');
   assert.equal(await page.locator('#pdos-title').innerText(),'Casa Aurora');assert.equal(await page.evaluate(()=>S.page),origin.page);
   await page.waitForFunction(y=>Math.abs(scrollY-y)<4,origin.scroll);assert.equal(await page.evaluate(()=>S.inboxContext),null);
   await page.screenshot({path:join(artifacts,'property-return-'+width+'.png')});
  });
  if(process.argv.includes('--property-context')){assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(await page.evaluate(()=>testIO.writes),[]);await page.close();continue;}
  await fresh('users');
  await check('people search comes before records; summaries are secondary',async()=>{
   assert.equal(await page.locator('.users-extras').evaluate(e=>e.open),false);
   assert((await page.locator('.user-item').first().boundingBox()).y<400);
   await page.locator('#userSearch').pressSequentially('maria');assert.equal(await page.locator('.user-item:visible').count(),1);assert.match(await page.locator('.user-item:visible').innerText(),/Della Rovere/);
   assert.equal(await page.locator('#userSearch').evaluate(e=>e===document.activeElement),true);
   await page.locator('.user-filter').filter({hasText:'Proprietari'}).first().click();assert.equal(await page.locator('.user-item:visible').count(),0);assert(await page.locator('#usersEmptySearch').isVisible());
   await page.getByRole('button',{name:'Mostra tutte',exact:true}).click();assert.equal(await page.locator('.user-item:visible').count(),2);
   await page.screenshot({path:join(artifacts,'people-'+width+'.png')});
  });
  for(const section of ['properties','contracts','maintenance']){
   await fresh(section);const first=await page.locator('.list-item').first().boundingBox();measurements.push({width,section,firstRowTop:first?.y});
   await check(section+' fits and keeps the first record within the first screen',async()=>{assert(first&&first.y<650);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(artifacts,section+'-'+width+'.png')})});
   if(section==='contracts')await check('future draft is Bozza; status and search combine without changing canonical records',async()=>{
    const original=await page.evaluate(()=>JSON.stringify(S.contracts));
    assert.match(await page.locator('.contract-item[data-status="draft"]').innerText(),/Bozza/i);assert.doesNotMatch(await page.locator('.contract-item[data-status="draft"]').innerText(),/Scaduto/i);
    await page.locator('[data-contract-filter="draft"]').click();assert.equal(await page.locator('.contract-item:visible').count(),1);
    await page.locator('#contractSearch').fill('Aurora');assert.equal(await page.locator('.contract-item:visible').count(),1);
    await page.locator('#contractSearch').fill('Nessun immobile');assert.equal(await page.locator('.contract-item:visible').count(),0);
    await page.locator('#contractSearch').fill('');assert.equal(await page.locator('.contract-item:visible').count(),1);
    assert.equal(await page.evaluate(()=>{contractsPage();return JSON.stringify(S.contracts)}),original);
   });
   if(section==='maintenance')await check('urgent comes first and rendering preserves canonical maintenance order',async()=>{
    assert.equal(await page.locator('.maintenance-item').first().getAttribute('data-priority'),'urgent');
    assert.deepEqual(await page.evaluate(()=>{const before=JSON.stringify(S.maintenance);maintenancePage();return[before===JSON.stringify(S.maintenance),S.maintenance.map(m=>m.id)]}),[true,['ordinary','urgent']]);
   });
  }
  await fresh('inbox');
  await check('search keeps every typed character and focus',async()=>{await page.locator('#inboxSearch').pressSequentially('Persona');assert.equal(await page.locator('#inboxSearch').inputValue(),'Persona');assert.equal(await page.locator('#inboxSearch').evaluate(e=>e===document.activeElement),true);await page.screenshot({path:join(artifacts,'inbox-list-'+width+'.png')})});
  await page.locator('[onclick="inboxSelect(\'conversation-0\')"]').click();
  await page.locator('#inboxBody').fill('Bozza da conservare');await page.locator('#inboxSubject').fill('Oggetto da conservare');
  await check('live refresh preserves body, subject, focus and selection',async()=>{
   await page.locator('#inboxBody').focus();await page.locator('#inboxBody').evaluate(e=>e.setSelectionRange(3,8));await page.evaluate(()=>inboxLiveRefresh());
   assert.equal(await page.locator('#inboxBody').inputValue(),'Bozza da conservare');assert.equal(await page.locator('#inboxSubject').inputValue(),'Oggetto da conservare');assert.deepEqual(await page.locator('#inboxBody').evaluate(e=>[e===document.activeElement,e.selectionStart,e.selectionEnd]),[true,3,8]);
  });
  if(width<=920){
   await check('thread replaces list, back restores list and conversation draft',async()=>{
    assert.equal(await page.locator('.inbox-list-pane').isVisible(),false);assert(await page.locator('.inbox-back').isVisible());await page.screenshot({path:join(artifacts,'inbox-thread-'+width+'.png')});
    await page.locator('.inbox-back').click();assert(await page.locator('.inbox-list-pane').isVisible());assert.equal(await page.locator('#inboxSearch').inputValue(),'Persona');
    await page.locator('[onclick="inboxSelect(\'conversation-1\')"]').click();assert.equal(await page.locator('#inboxBody').inputValue(),'');await page.locator('.inbox-back').click();
    await page.locator('[onclick="inboxSelect(\'conversation-0\')"]').click();assert.equal(await page.locator('#inboxBody').inputValue(),'Bozza da conservare');assert.equal(await page.locator('#inboxSubject').inputValue(),'Oggetto da conservare');
   });
   await check('composer stays reachable above the simulated keyboard',async()=>{
    await page.evaluate(()=>{window.testViewport={height:430,offsetTop:0,scale:1,handlers:{},addEventListener(name,fn){this.handlers[name]=fn}};Object.defineProperty(window,'visualViewport',{configurable:true,value:window.testViewport});window.dispatchEvent(new Event('resize'))});
    await page.waitForFunction(()=>document.body.classList.contains('pm-kb'));await page.locator('#inboxBody').focus();
    const pane=await page.locator('.inbox-thread-pane').boundingBox();assert(pane.y>=0&&pane.y+pane.height<=431);await page.locator('#inboxBody').scrollIntoViewIfNeeded();
    for(const selector of ['.inbox-back','#inboxBody','[onclick="inboxSendEmail(\'conversation-0\')"]']){const box=await page.locator(selector).boundingBox();assert(box&&box.y>=0&&box.y+box.height<=431,selector+' must be above the keyboard');}
    assert((await page.locator('.inbox-thread-head>div').first().boundingBox()).width>230);
    await page.screenshot({path:join(artifacts,'inbox-keyboard-'+width+'.png')});
   });
  }else await check('desktop keeps list and thread side by side',async()=>{const l=await page.locator('.inbox-list-pane').boundingBox(),r=await page.locator('.inbox-thread-pane').boundingBox();assert(l&&r&&r.x>=l.x+l.width);assert.equal(await page.locator('.inbox-back').isVisible(),false);await page.screenshot({path:join(artifacts,'inbox-thread-'+width+'.png')})});
  await check('real context helpers load only the selected contact and return to the origin',async()=>{
   await page.evaluate(()=>inboxOpenContext({kind:'lead',id:'lead-0'},'email'));await page.waitForFunction(()=>S.inboxContext&&!S.inboxContext.loading);
   assert.equal(await page.locator('.inbox-conversations>[onclick]').count(),1);assert.match(await page.locator('[aria-label="Comunicazioni del contesto"]').innerText(),/Persona Demo 0/);
   await page.getByRole('button',{name:'← Torna al contesto',exact:true}).click();assert.equal(await page.evaluate(()=>S.inboxContext),null);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(await page.evaluate(()=>testIO.writes),[]);await page.close();
 }
 await writeFile(join(artifacts,'measurements.json'),JSON.stringify(measurements,null,2));console.log('Portal workspace: '+checks+' passed. Screenshots: '+artifacts);
}finally{await browser?.close();await new Promise(r=>server.close(r))}
