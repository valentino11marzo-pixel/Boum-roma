// Real Home/catalogue/navigation renderers. Existing fixture owns synthetic IO.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadChromium,launchOptions} from '../_browser.mjs';
import {quickToolsHtml} from '../oggi/home-harness.mjs';
const root=new URL('../../',import.meta.url),source=readFileSync(new URL('js/portal-app.js',root),'utf8');
const extract=name=>{const m=new RegExp('^    (?:async )?function '+name+'\\(','m').exec(source);assert(m,'Missing '+name);const next=source.slice(m.index+5).search(/^    (?:async )?function /m);assert(next>=0);return source.slice(m.index,m.index+5+next)};
const functions=['buildNav','isOverdue','daysUntil','boomBusinessInvoices','accessDenied','toggleSidebar','closeSidebar'].map(extract).join('\n');
const shell='<div class="app active" id="app"><header class="header"><div class="header-left"><button class="menu-btn" onclick="toggleSidebar()" aria-label="Menu">☰</button><span class="logo-text">BOOM</span></div><span style="color:var(--text-secondary);font-size:11px">ANTEPRIMA LOCALE · DATI DEMO</span><span id="headerName">Valentino</span><span hidden id="headerBadge">Admin</span></header><div class="layout"><aside class="sidebar" id="sidebar"></aside><div class="sidebar-overlay" id="sidebarOverlay"></div><main id="main" class="main"></main></div></div>';
const html=quickToolsHtml
 .replace('const buildNav=()=>{};',functions)
 .replace(/<div class="demo-bar">[\s\S]*?<main id="main" class="main"><\/main>/,shell)
 .replace('</head>','<link rel="stylesheet" href="/css/portal-mobile.css"><link rel="stylesheet" href="/css/portal-desktop.css"></head>')
 .replace('</body>','<script>S.pfsClients=[];S.invoices=[];buildNav();window.testReady=true;</script><script src="/js/portal-mobile.js"></script><script src="/js/portal-desktop.js"></script></body>');
const boot="goTo(location.hash.slice(1)||'oggi',true);";
assert(html.includes(boot),'The briefing fixture seeds data before the actual Home mount');
const briefingHtml=html.replace(boot,`
S.maintenance=[];S.clients=[];S.viewingRequests=[];S.contracts=S.contracts.slice(0,1);S.contracts[0].signatureStatus='complete';
testIO.followUps=[caseRow('a',{})];
S.conversations=[{id:'conv-a',status:'open',channel:'email',contactType:'tenant',contactId:'p-demo',contactName:'Persona Demo',needsReply:true,lastDirection:'in',lastMessageAt:recentAt,lastMessagePreview:'Il tecnico può passare domani dalle 10 alle 12.'}];
testIO.followUps[0].preparation={version:4,coverage:{version:2,incomplete:true,reasons:['attachments_not_read']},revision:'navigation-proposal',contextRevision:0,status:'ready',messageId:'phone:demo-call',selectedPracticeRef:'contracts/contratto-demo',createdAt:new Date().toISOString(),
summary:'Il tecnico propone domani dalle 10 alle 12 per la perdita in cucina. Manca la conferma di chi gli aprirà e di chi avviserà il portiere.',
recommendation:'Chiarire chi apre al tecnico',sources:[{id:'source-demo',kind:'message'}],uncertainties:[{text:'Chi avvisa il portiere prima dell’arrivo?'},{text:'Chi sarà presente per aprire al tecnico?'}],
nextAction:{text:'Confermare chi apre al tecnico',reason:'Confermare l’accesso evita un intervento a vuoto.',checkAt:new Date(Date.now()+86400000).toISOString(),waitingOn:'valentino',waitingLabel:'Valentino'}};
`+boot);
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;if(req.method!=='GET'){res.writeHead(405).end();return}if(path==='/mail-source-api'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,email:{configured:false,lastScan:null},whatsapp:{bridgeFresh:false}}));return}if(path==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(new URL(req.url,'http://localhost').searchParams.has('briefing')?briefingHtml:html);return}if(/^\/(css|js)\/[a-z0-9-]+\.(css|js)$/.test(path)){res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(new URL(path.slice(1),root)));return}res.writeHead(404).end()});
await new Promise(r=>server.listen(Number(process.env.PORT)||0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
if(process.argv.includes('--serve')){console.log('Real Home/catalogue/nav · synthetic IO: '+base);await new Promise(()=>{})}
let browser,checks=0;const measurements=[],artifacts=await mkdtemp(join(tmpdir(),'boom-home-navigation-'));
try{
 const chromium=await loadChromium();assert(chromium,'Browser required');browser=await chromium.launch(launchOptions({headless:true}));
 for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[],external=[];page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():(external.push(r.request().url()),r.abort()));
  const check=async(name,fn)=>{await fn();checks++;console.log('PASS '+width+' '+name)};
  await page.goto(base);await page.waitForFunction(()=>window.testReady&&document.querySelector('.od-case')&&S.mailSources&&!S.mailSources.checking);await page.waitForTimeout(100);
  await check('all sixteen tools, expanded actual work, no horizontal overflow',async()=>{
   assert.equal(await page.locator('#ogQuickTools [data-og-tool]').count(),16);assert.equal(await page.locator('#ogDeskFold').evaluate(e=>e.open),true);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const tools=await page.locator('#ogQuickTools').boundingBox(),work=await page.locator('#ogDeskFold').boundingBox();measurements.push({width,toolsHeight:tools.height,workTop:work.y,columns:await page.locator('#ogQuickTools').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length)});assert(work.y<680);const priority=await page.locator('[data-desk-key="urgent"]').boundingBox();assert(priority&&priority.y+priority.height<(width<=920?784:844),'Priority action is visible above the phone tab bar');assert((await page.locator('#ogQuickTools [data-og-tool]').first().boundingBox()).height>=44);
   await page.screenshot({path:join(artifacts,'home-'+width+'.png')});
  });
  await check('search targets stay reachable and expanded sources do not sit under the email action',async()=>{
   const email=page.locator('.portal-mailbox-entry>button'),sources=page.locator('.portal-mailbox-entry>.ow-search-sources'),summary=sources.locator(':scope>summary');
   for(const target of [email,summary,page.locator('#ogWorkKind'),page.locator('#ogWorkQuery')])assert((await target.boundingBox()).height>=44,'Search controls retain a 44px touch target');
   const action=await email.boundingBox(),sourceTarget=await summary.boundingBox();assert(sourceTarget.x+sourceTarget.width<=action.x,'Source and email touch targets never overlap');
   // Opening details queues a toggle event whose real handler replaces the
   // source rows. Await that event before measuring/scrolling those rows.
   await sources.evaluate(el=>{window.testSourcesToggled=new Promise(resolve=>el.addEventListener('toggle',resolve,{once:true}));});
   await summary.click();await page.evaluate(()=>window.testSourcesToggled);
   const contents=await page.locator('#ogSearchSources').boundingBox();assert(contents.y>=action.y+action.height,'Expanded sources start below the email button');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const firstSource=page.locator('[data-search-source]').first();await firstSource.scrollIntoViewIfNeeded();assert(await firstSource.evaluate(button=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),'Expanded source action is not covered');
   await page.screenshot({path:join(artifacts,'sources-'+width+'.png')});await summary.click();await page.evaluate(()=>scrollTo(0,0));
  });
  await check('six daily destinations and all thirty-nine navigation actions (the 38 originals plus Catalogo) remain accessible',async()=>{
   assert.equal(await page.locator('#sidebar .nav-item').count(),39);assert.equal(await page.locator('#sidebar .portal-nav-primary .nav-item').count(),6);assert.equal(await page.locator('#sidebar .portal-nav-group').count(),4);
   assert.deepEqual(await page.locator('#sidebar .portal-nav-primary .nav-item').evaluateAll(rows=>rows.map(e=>e.getAttribute('onclick'))),['oggi','users','properties','contracts','payments','inbox'].map(id=>"goTo('"+id+"')"));
   if(width<=920){assert.deepEqual(await page.locator('.pm-tabbar [data-target]').evaluateAll(rows=>rows.map(e=>e.dataset.target)),['oggi','users','properties','contracts']);await page.locator('.pm-tab-menu').click();const menu=page.locator('.pm-sheet .portal-nav-group[data-nav-group="tools"]');await menu.locator('summary').click();assert(await menu.locator('[onclick="goTo(\'boom-tools\')"]').isVisible());await page.screenshot({path:join(artifacts,'menu-'+width+'.png')});await page.keyboard.press('Escape');await page.waitForTimeout(350);}
   else{await page.locator('#sidebar .portal-nav-group[data-nav-group="tools"]>summary').click();assert(await page.locator('#sidebar [onclick="goTo(\'boom-tools\')"]').isVisible());await page.screenshot({path:join(artifacts,'menu-'+width+'.png')})}
  });
  await check('Home catalogue entry opens the shared sixteen tools and the explicit payment form',async()=>{
   await page.locator('.ow-shortcuts [onclick="goTo(\'boom-tools\')"]').click();await page.waitForTimeout(250);assert.equal(await page.locator('[data-catalog-tool]').count(),16);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(artifacts,'catalogue-'+width+'.png')});
   await page.getByRole('button',{name:'＋ Nuova rata',exact:true}).click();await page.locator('#mForm select[name="contractId"]').waitFor({state:'visible'});assert.equal(await page.locator('#mForm select[name="contractId"]').inputValue(),'');assert(await page.locator('#mForm input[name="amount"]').isVisible());await page.evaluate(()=>closeModal());
  });
  await check('secondary specialist handlers survive and catalogue remains admin-only',async()=>{
   await page.locator('.portal-catalog-extra').first().locator('summary').click();assert.equal(await page.locator('.portal-catalog-specialist').count(),4);
   const handlers=await page.locator('.portal-catalog-specialist').evaluateAll(rows=>rows.map(e=>e.getAttribute('onclick')));assert(handlers.some(h=>h.includes('openMessageGeneratorLandlord')));assert(handlers.some(h=>h.includes('openMessageGeneratorClient')));assert(handlers.some(h=>h.includes('/boom_doc_parser.html')));assert(handlers.some(h=>h.includes('/pfs-command')));
   assert.equal(await page.evaluate(()=>{const role=S.profile.role;S.profile.role='tenant';const result=boomToolsPage();S.profile.role=role;return result.includes('data-catalog-tool')}),false);
  });
  await check('valid AI proposal is actionable without scrolling; full doubts and evidence survive refresh',async()=>{
   await page.goto(base+'/?briefing=1');
   await page.waitForFunction(()=>window.testReady&&oggiSegretaria.loaded&&!oggiSegretaria.loading&&S.mailSources&&!S.mailSources.checking);
   const card=page.locator('#ogDeskPanel [data-desk-item]').first(),evidence=card.locator('[data-desk-evidence]');
   assert.equal(await page.locator('#ogQueueArchive').evaluate(e=>e.open),false);
   assert.equal(await evidence.evaluate(e=>e.open),false);
   assert.equal(await card.locator('.od-ai-summary').innerText(),await page.evaluate(()=>testIO.followUps[0].preparation.summary));
   assert.match(await card.locator('.od-next').innerText(),/Passo proposto:\s+Confermare chi apre al tecnico/);
   assert.match(await card.innerText(),/Confermare l’accesso evita un intervento a vuoto/);
   const button=card.getByRole('button',{name:'Rivedi proposta ↗',exact:true});
   const geometry=await button.evaluate(el=>{
    const r=el.getBoundingClientRect(),bar=document.querySelector('.pm-tabbar')?.getBoundingClientRect(),header=document.querySelector('.header').getBoundingClientRect();
    return {top:r.top,bottom:r.bottom,viewport:innerHeight,boundary:bar?.top??innerHeight,headerBottom:header.bottom,scroll:scrollY,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
   });
   measurements.push({width,proposal:geometry});console.log('PROPOSAL '+JSON.stringify({width,...geometry}));
   assert.equal(geometry.scroll,0,'No interaction may scroll before measuring the initial proposal action');
   assert(geometry.top>=geometry.headerBottom&&geometry.bottom<=geometry.boundary,'First proposal action must fit above the actual phone tab bar: '+JSON.stringify(geometry));
   assert(geometry.hit,'The initial proposal action is not obscured by another element');
   assert.equal(await evidence.locator('summary').innerText(),'Da chiarire prima di decidere');
   assert(await evidence.locator('summary').isVisible());
   assert.equal(await evidence.locator('.sg-questions').isVisible(),false);
   await page.screenshot({path:join(artifacts,'proposal-'+width+'.png')});
   await evidence.locator('summary').click();
   assert(await evidence.locator('.sg-questions').isVisible());
   for(const question of await page.evaluate(()=>testIO.followUps[0].preparation.uncertainties.map(q=>q.text)))assert((await evidence.innerText()).includes(question));
   assert.match(await evidence.innerText(),/allegati non sono stati letti/i);
   assert.match(await evidence.innerText(),/Fonte ricevuta:.*Proposta preparata/s);
   assert.match(await evidence.innerText(),/Ricontrollo proposto/);
   assert.equal(await evidence.locator('.od-case-meta dd').last().innerText(),await page.evaluate(()=>oggiDeskTiming({timing:{value:testIO.followUps[0].preparation.nextAction.checkAt}})));
   await page.evaluate(()=>oggiSegretariaLoad(true));
   assert.equal(await evidence.evaluate(e=>e.open),true,'A real data refresh preserves the expanded evidence');
   for(const question of await page.evaluate(()=>testIO.followUps[0].preparation.uncertainties.map(q=>q.text)))assert((await evidence.innerText()).includes(question));
   assert.deepEqual(await page.evaluate(()=>[testIO.writes,testIO.demoWrites,testIO.responses]),[[],[],[]]);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(await page.evaluate(()=>testIO.writes),[]);await page.close();
 }
 await writeFile(join(artifacts,'measurements.json'),JSON.stringify(measurements,null,2));console.log('Navigation/Home: '+checks+' passed. Screenshots: '+artifacts);console.log(JSON.stringify(measurements));
}finally{await browser?.close();await new Promise(r=>server.close(r))}
