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
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;if(req.method!=='GET'){res.writeHead(405).end();return}if(path==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return}if(/^\/(css|js)\/[a-z0-9-]+\.(css|js)$/.test(path)){res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(new URL(path.slice(1),root)));return}res.writeHead(404).end()});
await new Promise(r=>server.listen(Number(process.env.PORT)||0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
if(process.argv.includes('--serve')){console.log('Real Home/catalogue/nav · synthetic IO: '+base);await new Promise(()=>{})}
let browser,checks=0;const measurements=[],artifacts=await mkdtemp(join(tmpdir(),'boom-home-navigation-'));
try{
 const chromium=await loadChromium();assert(chromium,'Browser required');browser=await chromium.launch(launchOptions({headless:true}));
 for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[],external=[];page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():(external.push(r.request().url()),r.abort()));
  const check=async(name,fn)=>{await fn();checks++;console.log('PASS '+width+' '+name)};
  await page.goto(base);await page.waitForFunction(()=>window.testReady&&document.querySelector('.od-case'));await page.waitForTimeout(100);
  await check('all sixteen tools, expanded actual work, no horizontal overflow',async()=>{
   assert.equal(await page.locator('#ogQuickTools [data-og-tool]').count(),16);assert.equal(await page.locator('#ogDeskFold').evaluate(e=>e.open),true);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const tools=await page.locator('#ogQuickTools').boundingBox(),work=await page.locator('#ogDeskFold').boundingBox();measurements.push({width,toolsHeight:tools.height,workTop:work.y,columns:await page.locator('#ogQuickTools').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length)});assert(work.y<680);const priority=await page.locator('[data-desk-key="urgent"]').boundingBox();assert(priority&&priority.y+priority.height<(width<=920?784:844),'Priority action is visible above the phone tab bar');assert((await page.locator('#ogQuickTools [data-og-tool]').first().boundingBox()).height>=44);
   await page.screenshot({path:join(artifacts,'home-'+width+'.png')});
  });
  await check('six daily destinations and all thirty-eight original navigation actions remain accessible',async()=>{
   assert.equal(await page.locator('#sidebar .nav-item').count(),38);assert.equal(await page.locator('#sidebar .portal-nav-primary .nav-item').count(),6);assert.equal(await page.locator('#sidebar .portal-nav-group').count(),4);
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
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(await page.evaluate(()=>testIO.writes),[]);await page.close();
 }
 await writeFile(join(artifacts,'measurements.json'),JSON.stringify(measurements,null,2));console.log('Navigation/Home: '+checks+' passed. Screenshots: '+artifacts);console.log(JSON.stringify(measurements));
}finally{await browser?.close();await new Promise(r=>server.close(r))}
