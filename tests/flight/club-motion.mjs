// The real Solari/Canvas engine in Chromium. Only RAF delivery, viewport
// observation and random noise are controlled; cells and drawing remain real.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadChromium,launchOptions} from '../_browser.mjs';
const source=readFileSync(new URL('../../assets/boom-flight-next-motion.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../../assets/boom-flight-next-motion.css',import.meta.url),'utf8');
const chromium=await loadChromium();
console.log('\n▸ flightclubmotion  One Solari clock, honest light palette and six geometric city patterns');
if(!chromium){console.log('  SKIP: playwright unavailable — motion checks did not run');process.exit(0);}
let browser,passed=0,failed=0;
const harness=`
window.__q=new Map();window.__tick=0;window.__sequence=0;window.__gold=[];window.__goldTotal=0;window.__green=0;window.__paintCount=0;
requestAnimationFrame=fn=>{const id=++__sequence;__q.set(id,fn);return id;};cancelAnimationFrame=id=>__q.delete(id);
Math.random=()=>.2;
window.__intersections=[];
IntersectionObserver=class {constructor(fn){this.fn=fn;__intersections.push(this);}observe(){this.fn([{isIntersecting:true}]);}disconnect(){}};
ResizeObserver=class {observe(){}disconnect(){}};
const proto=CanvasRenderingContext2D.prototype,clear=proto.clearRect,rect=proto.roundRect,fill=proto.fill,image=proto.drawImage;
proto.clearRect=function(){if(this.canvas.id==='nextSolariField'){__gold=[];__paintCount++;}return clear.apply(this,arguments);};
proto.roundRect=function(x,y,w,h){if(this.canvas.id==='nextSolariField')this.__box=[x,y,w,h];return rect.apply(this,arguments);};
proto.fill=function(){if(this.canvas.id==='nextSolariField'){const c=this.fillStyle.replace(/ /g,'');if(c.startsWith('rgba(255,215,0,')){__gold.push({box:this.__box,alpha:Number(c.slice(15,-1))});__goldTotal++;}if(c.startsWith('rgba(0,255,136,'))__green++;}return fill.apply(this,arguments);};
proto.drawImage=function(base){if(this.canvas.id==='nextSolariField')window.__base=base;return image.apply(this,arguments);};
window.__advance=ms=>{for(let i=0;i<Math.ceil(ms/16);i++){__tick+=16;const callbacks=Array.from(__q.values());__q.clear();callbacks.forEach(fn=>fn(__tick));}return BoomFlightNextMotion.state();};
window.__shown=value=>__intersections.forEach(observer=>observer.fn([{isIntersecting:value}]));
`;
async function fixture({code=source,theme='light',city='rome',paused=false,fieldEnabled=true}={}){
 const page=await browser.newPage({viewport:{width:900,height:700},reducedMotion:'no-preference'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort());
 const before=`window.__pre={theme:BoomFlightNextMotion.setTheme(${JSON.stringify(theme)}),city:BoomFlightNextMotion.setCityPattern(${JSON.stringify(city)})};BoomFlightNextMotion.setDestination('AMSTERDAM');BoomFlightNextMotion.setPaused(${paused});`;
 await page.setContent('<!doctype html><html><head><style>'+css+'#nextHero{width:720px;height:420px}#nextDestinationBoard{font:60px sans-serif}#nextSolariField{width:720px;height:420px;'+(fieldEnabled?'':'display:none;')+'}</style><script>'+harness+'</script><script>'+code.replace(/<\/script/gi,'<\\/script')+'</script><script>'+before+'</script></head><body><section id="nextHero" data-next-field="'+(fieldEnabled?'on':'off')+'"><canvas id="nextSolariField"></canvas><div id="nextDestinationBoard">ROME</div></section></body></html>');
 await page.waitForFunction(()=>BoomFlightNextMotion.state().elapsedMs!==null,null,{polling:25,timeout:5000});
 return {page,errors};
}
async function check(name,fn){try{await fn();passed++;console.log('  ✓ '+name);}catch(e){failed++;console.log('  ✗ '+name+' — '+e.message);}}
async function close(t){assert.deepEqual(t.errors,[],'no browser errors');await t.page.close();}
async function firstPulse(page){return page.evaluate(()=>{let state=BoomFlightNextMotion.state();for(let i=0;i<100&&state.nextPulseAt===700;i++)state=__advance(16);return state;});}
function cadence(state){assert.equal(state.nextPulseAt-state.elapsedMs,8200,'the next automatic beat remains exactly 8.2 seconds away');}
try{
 browser=await chromium.launch(await launchOptions());
 await check('The original dark composition keeps its classic field until a city pattern is explicitly selected',async()=>{
  const t=await fixture({theme:'dark',city:null}),p=t.page;
  const state=await p.evaluate(()=>BoomFlightNextMotion.state());assert.equal(state.theme,'dark');assert.equal(state.cityPattern,'classic');assert.equal(await p.evaluate(()=>__base.getContext('2d').getImageData(6,6,1,1).data[3]),8);
  cadence(await firstPulse(p));await p.evaluate(()=>__advance(7500));assert.ok(await p.evaluate(()=>__green)>0,'legacy green cascades remain in the unmodified dark mode');assert.equal(await p.evaluate(()=>__q.size),1);await close(t);
 });
 await check('Theme and city work before boot; light cells use the real neutral grid with no green',async()=>{
  const t=await fixture({paused:true}),p=t.page;
  assert.deepEqual(await p.evaluate(()=>__pre),{theme:true,city:true});
  const state=await p.evaluate(()=>BoomFlightNextMotion.state());assert.equal(state.theme,'light');assert.equal(state.cityPattern,'rome');assert.equal(state.paused,true);assert.equal(state.rafPending,false);
  assert.equal(await p.locator('#nextDestinationBoard').getAttribute('aria-label'),'AMSTERDAM');
  assert.equal(await p.locator('#nextDestinationBoard .fc2').count(),9);
  const ink=await p.evaluate(()=>{const c=__base.getContext('2d');return {cell:Array.from(c.getImageData(6,6,1,1).data),crease:Array.from(c.getImageData(6,Math.ceil(27*.48),1,1).data)};});
  assert.ok(ink.cell[3]>=34&&ink.cell[3]<=37,'the light grid is a faint14% layer, not opaque tiles');
  assert.ok(ink.cell.slice(0,3).every(v=>v>=210&&v<=230),'neutral light grid ink');
  assert.ok(ink.crease[0]<ink.cell[0]&&ink.crease[3]>ink.cell[3]&&ink.crease[3]<80,'the crease stays visible without filling the white field');
  assert.deepEqual(await p.evaluate(()=>[BoomFlightNextMotion.setTheme('sepia'),BoomFlightNextMotion.setCityPattern('unknown'),BoomFlightNextMotion.setCityPattern(['rome'])]),[false,false,false]);
  assert.equal(await p.evaluate(()=>BoomFlightNextMotion.state().theme),'light');
  await p.evaluate(()=>{BoomFlightNextMotion.setPaused(false);__advance(12000);});assert.equal(await p.evaluate(()=>__green),0,'light mode never paints a green cascade or sparkle');
  assert.ok(await p.evaluate(()=>__goldTotal)>0,'the gold pulse/cascade is still present');await close(t);
 });
 await check('All six cities produce distinct gold geometry without a second RAF or changed beat interval',async()=>{
  const signatures=[];
  for(const city of ['rome','madrid','barcelona','amsterdam','london','milan']){
   const t=await fixture({city});cadence(await firstPulse(t.page));
   const drawing=await t.page.evaluate(()=>{__advance(848);return {gold:__gold.map(c=>[...c.box.slice(0,2),Math.round(c.alpha*1000)]),q:__q.size,green:__green};});
   assert.ok(drawing.gold.length,city+' has a visible gold front');assert.equal(drawing.q,1,'one animation callback for '+city);assert.equal(drawing.green,0);
   signatures.push(JSON.stringify(drawing.gold));await close(t);
  }
  assert.equal(new Set(signatures).size,6,'directions and compact ring differ in the actual rendered cells');
 });
 await check('Live theme/pattern changes preserve elapsed time, next beat and original Solari cell nodes',async()=>{
  const t=await fixture(),p=t.page;
  const result=await p.evaluate(()=>{
   __advance(1568);const before=BoomFlightNextMotion.state(),cell=document.querySelector('.fc2'),queue=__q.size;
   BoomFlightNextMotion.setTheme('dark');BoomFlightNextMotion.setCityPattern('madrid');BoomFlightNextMotion.setTheme('light');
   return {before,after:BoomFlightNextMotion.state(),same:cell===document.querySelector('.fc2'),queueBefore:queue,queueAfter:__q.size,word:document.getElementById('nextDestinationBoard').getAttribute('aria-label')};
  });
  assert.equal(result.before.elapsedMs,result.after.elapsedMs);assert.equal(result.before.nextPulseAt,result.after.nextPulseAt);assert.equal(result.same,true);assert.equal(result.word,'AMSTERDAM');assert.equal(result.queueBefore,1);assert.equal(result.queueAfter,1);
  const pulse=await p.evaluate(()=>{let previous=BoomFlightNextMotion.state().nextPulseAt,state;for(let i=0;i<600;i++){state=__advance(16);if(state.nextPulseAt!==previous)return state;}throw Error('No second beat');});cadence(pulse);await close(t);
 });
 await check('Pause, offscreen, reduced motion and page exit cancel work; resume reuses one loop',async()=>{
  const t=await fixture(),p=t.page;
  await p.evaluate(()=>{__advance(1200);BoomFlightNextMotion.setPaused(true);});
  const stopped=await p.evaluate(()=>({state:BoomFlightNextMotion.state(),paints:__paintCount,q:__q.size}));assert.equal(stopped.q,0);assert.equal(await p.evaluate(()=>BoomFlightNextMotion.isPaused()),true);
  assert.equal(await p.evaluate(()=>{__advance(2000);return __paintCount;}),stopped.paints,'pause means no drawing');
  await p.evaluate(()=>{BoomFlightNextMotion.setTheme('dark');BoomFlightNextMotion.setCityPattern('london');});assert.equal(await p.evaluate(()=>__q.size),0,'changing presentation never resumes a paused user');
  await p.evaluate(()=>{BoomFlightNextMotion.setPaused(false);__shown(false);});assert.equal(await p.evaluate(()=>__q.size),0);assert.equal(await p.evaluate(()=>BoomFlightNextMotion.isPaused()),false,'offscreen is distinct from manual pause');
  await p.evaluate(()=>__shown(true));assert.equal(await p.evaluate(()=>__q.size),1);
  await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>document.getElementById('nextHero').dataset.nextMotion==='reduced',null,{polling:25,timeout:5000});assert.equal(await p.evaluate(()=>__q.size),0);
  await p.emulateMedia({reducedMotion:'no-preference'});await p.waitForFunction(()=>BoomFlightNextMotion.state().running,null,{polling:25,timeout:5000});assert.equal(await p.evaluate(()=>__q.size),1);
  await p.evaluate(()=>dispatchEvent(new Event('pagehide')));assert.equal(await p.evaluate(()=>__q.size),0);
  await p.evaluate(()=>dispatchEvent(new Event('pageshow')));assert.equal(await p.evaluate(()=>__q.size),1);
  await p.evaluate(()=>BoomFlightNextMotion.destroy());assert.equal(await p.evaluate(()=>__q.size),0);await close(t);
 });
 await check('A disabled, zero-sized field keeps finite Solari flips and responsive calibration without canvas work',async()=>{
  const t=await fixture({fieldEnabled:false}),p=t.page;
  assert.deepEqual(await p.evaluate(()=>({enabled:BoomFlightNextMotion.state().fieldEnabled,paints:__paintCount,q:__q.size,fieldWidth:document.getElementById('nextSolariField').getBoundingClientRect().width})),{enabled:false,paints:0,q:0,fieldWidth:0});
  async function flipTo(word){
   await p.evaluate(value=>BoomFlightNextMotion.setDestination(value),word);
   await p.waitForFunction(()=>Array.from(document.querySelectorAll('.lt,.lb')).some(el=>el.style.animation),null,{polling:10,timeout:2000});
   await p.waitForFunction(value=>Array.from(document.querySelectorAll('.fc2 .st b')).map(el=>el.textContent).join('')===value&&!Array.from(document.querySelectorAll('.lt,.lb')).some(el=>el.style.animation),word,{polling:25,timeout:5000});
  }
  await flipTo('LONDON');
  const shift=await p.evaluate(()=>{window.__originalCell=document.querySelector('.fc2');return document.getElementById('nextDestinationBoard').style.getPropertyValue('--gs');});
  await p.setViewportSize({width:390,height:700});
  await p.evaluate(()=>{document.getElementById('nextDestinationBoard').style.fontSize='24px';dispatchEvent(new Event('resize'));});
  await p.waitForFunction(prior=>document.getElementById('nextDestinationBoard').style.getPropertyValue('--gs')!==prior,shift,{polling:25,timeout:2000});
  assert.equal(await p.evaluate(()=>__originalCell===document.querySelector('.fc2')),true,'recalibration preserves the mechanical cells');
  await flipTo('BARCELONA');
  await p.evaluate(()=>{BoomFlightNextMotion.setTheme('dark');__advance(2000);});
  assert.deepEqual(await p.evaluate(()=>({paints:__paintCount,q:__q.size})),{paints:0,q:0},'finite flips never start or paint the hidden field');
  await p.emulateMedia({reducedMotion:'reduce'});
  await p.waitForFunction(()=>document.getElementById('nextHero').dataset.nextMotion==='reduced',null,{polling:25,timeout:2000});
  await p.evaluate(()=>BoomFlightNextMotion.setDestination('MADRID'));
  assert.equal(await p.locator('.fc2 .st b').allTextContents().then(chars=>chars.join('')),'MADRID');
  assert.equal(await p.evaluate(()=>Array.from(document.querySelectorAll('.lt,.lb')).some(el=>el.style.animation)),false,'reduced motion keeps the finite board static too');
  assert.deepEqual(await p.evaluate(()=>({paints:__paintCount,q:__q.size})),{paints:0,q:0});await close(t);
 });
 await check('Mutation: changing the 8.2-second cadence is caught by the real engine check',async()=>{
  const mutant=source.replace('battito = t + 8200;','battito = t + 4000;');assert.notEqual(mutant,source);
  const t=await fixture({code:mutant});
  const state=await firstPulse(t.page);assert.throws(()=>cadence(state),/8.2 seconds/);await close(t);
 });
 await check('Mutation: resetting the clock during a theme change breaks continuity',async()=>{
  const mutant=source.replace('theme = value; hero.dataset.nextTheme = value;','clock = 0; theme = value; hero.dataset.nextTheme = value;');assert.notEqual(mutant,source);
  const t=await fixture({code:mutant});const pair=await t.page.evaluate(()=>{__advance(1200);const before=BoomFlightNextMotion.state().elapsedMs;BoomFlightNextMotion.setTheme('dark');return [before,BoomFlightNextMotion.state().elapsedMs];});
  assert.throws(()=>assert.equal(pair[0],pair[1]),assert.AssertionError);await close(t);
 });
}finally{if(browser)await browser.close();}
console.log('\n'+passed+' passed · '+failed+' failed');process.exitCode=failed?1:0;
