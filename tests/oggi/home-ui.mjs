import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { html } from './home-harness.mjs';
import { loadChromium, launchOptions } from '../_browser.mjs';
const chromium=await loadChromium();assert(chromium,'Browser required');
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
let browser,checks=0;const check=async(name,fn)=>{await fn();console.log('PASS '+name);checks++;};
try{
 browser=await chromium.launch(launchOptions({headless:true}));
 for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(4000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  await page.goto(base);await page.waitForFunction(()=>oggiSegretaria.loaded);
  await check(width+' home utile prima dei pannelli lunghi, senza invii',async()=>{
   assert.equal(await page.locator('#ogOwnerTools').evaluate(e=>e.open),false);
   assert.equal(await page.locator('#ogFollowTools').evaluate(e=>e.open),false);
   assert.equal(await page.evaluate(()=>testIO.writes.length),0);
   assert(await page.locator('#ogAgendaPanel').getByText('Casa Aurora',{exact:true}).isVisible());
  });
  await check(width+' ricerca per tipo prima del limite e selezione esplicita',async()=>{
   await page.locator('#ogWorkQuery').fill('Aurora');
   assert.equal(await page.locator('.ow-result').count(),1);assert.equal(await page.evaluate(()=>testIO.actions.length),0);
   await page.locator('.ow-result').click();await page.getByRole('button',{name:'Inventario dal video',exact:true}).click();
   assert.deepEqual(await page.evaluate(()=>testIO.actions.at(-1)),['open','/inventario?p=casa-demo']);
   await page.locator('#ogWorkKind').selectOption('person');await page.locator('#ogWorkQuery').fill('Persona');
   await page.locator('.ow-result').click();assert(await page.locator('.ow-context-actions button').count()>0);
   await page.locator('.ow-context-actions button').first().click();assert.equal(await page.evaluate(()=>testIO.actions.at(-1)[0]),'openPerson');
   await page.locator('#ogWorkKind').selectOption('contract');await page.locator('#ogWorkQuery').fill('Aurora');assert.equal(await page.locator('.ow-result').count(),1);
  });
  await check(width+' data mostrata e precompilata rispettano lo spostamento',async()=>{
   await page.locator('#ogAgendaPanel').getByRole('button',{name:/Verifica e conferma/}).click();
   const action=await page.evaluate(()=>testIO.actions.at(-1));assert.equal(action[0],'confirmViewingModal');
   const expected=await page.evaluate(()=>{const d=new Date(S.viewingRequests[1].proposedDateTime);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')});
   assert.equal(action[2].time,expected);
  });
  await check(width+' aggiornamento e nascondi conservano bozza, ricerca e pannelli',async()=>{
   await page.getByRole('button',{name:/Prepara una risposta/}).click();await page.locator('#ogOwnerInstruction').fill('Bozza da conservare');
   await page.locator('#ogWorkQuery').fill('Aurora');await page.locator('#ogOwnerTools > summary').click();
   await page.evaluate(()=>{document.getElementById('ogOwnerTools').open=true;oggiDismiss(window.__oggiLast[0].id);});await page.waitForTimeout(220);
   assert.equal(await page.locator('#ogOwnerInstruction').inputValue(),'Bozza da conservare');assert.equal(await page.locator('#ogWorkQuery').inputValue(),'Aurora');assert.equal(await page.locator('#ogOwnerTools').evaluate(e=>e.open),true);
  });
  await check(width+' errore lettura conserva dati e non dichiara agenda libera',async()=>{
   await page.evaluate(async()=>{testIO.failViewings=true;await oggiLoadViewings();});await page.waitForTimeout(220);
   assert.match(await page.locator('#ogAgendaPanel').innerText(),/Non riesco ad aggiornare/);assert.match(await page.locator('#ogAgendaPanel').innerText(),/Casa Aurora/);
   await page.evaluate(async()=>{testIO.failProposals=true;await oggiLoadProposals(true);});await page.waitForTimeout(220);
   assert.match(await page.locator('#ogDecisionPanel').innerText(),/Proposte non aggiornate/);
   await page.evaluate(async()=>{testIO.failViewings=false;testIO.failProposals=false;await oggiLoadViewings();await oggiLoadProposals(true);});await page.waitForTimeout(220);
  });
  await check(width+' permessi, escaping e nessun overflow',async()=>{
   await page.evaluate(()=>{S.properties.push({id:'test-xss',name:'<img src=x onerror=alert(1)>',address:'test'});});await page.locator('#ogWorkKind').selectOption('property');await page.locator('#ogWorkQuery').fill('<img');
   assert.equal(await page.locator('#ogWorkResults img').count(),0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const n=await page.evaluate(()=>testIO.actions.length);await page.evaluate(()=>{S.profile.role='tenant';oggiWorkspaceSelect(0);oggiAgendaAction(0);});assert.equal(await page.evaluate(()=>testIO.actions.length),n);
   await page.evaluate(()=>{S.profile.role='admin';});assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>testIO.writes.length),0);
  });
  await page.evaluate(()=>{document.getElementById('ogOwnerTools').open=false;document.getElementById('toasts').textContent='';document.activeElement.blur();document.getElementById('ogWorkQuery').value='';oggiWorkspaceSearch('');});
  await mkdir('tests/oggi/artifacts',{recursive:true});await page.screenshot({path:'tests/oggi/artifacts/home-'+width+'.png',fullPage:true});
  await page.close();
 }
 const page=await browser.newPage();await page.goto(base);await page.waitForFunction(()=>oggiSegretaria.loaded);
 await check('cambio identità scarta una lettura vecchia e non mostra la vecchia agenda',async()=>{
  await page.evaluate(()=>{testIO.holdViewings=true;window.oldRead=oggiLoadViewings();});
  await page.waitForFunction(()=>testIO.pendingReads.length===1);
  await page.evaluate(async()=>{auth.currentUser={uid:'second-admin'};document.getElementById('ogAgendaPanel').innerHTML=oggiAgendaPanel();});
  assert.doesNotMatch(await page.locator('#ogAgendaPanel').innerText(),/Casa Aurora/);
  await page.evaluate(async()=>{testIO.holdViewings=false;testIO.pendingReads.shift()();await oldRead;});
  assert.doesNotMatch(await page.locator('#ogAgendaPanel').innerText(),/Casa Aurora/);
 });
 console.log(checks+' verifiche home superate.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
