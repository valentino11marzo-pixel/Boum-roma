// tests/smoke.mjs — smoke test Playwright del flusso di autenticazione.
// Serve il repo in locale, stubba Firebase e verifica i comportamenti chiave:
//   1. /portal da sloggato → redirect a /login?next=… (hash preservato)
//   2. null spurio seguito dall'utente (Safari) → NESSUN redirect
//   3. dopo 2 rimbalzi login⇄portal → stop (niente redirect)
//   4. /login mostra il form senza errori JS e lancia il warm-up del portale
// Uso: node tests/smoke.mjs   (richiede playwright + chromium installati)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  const file = join(root, path === '/' ? 'index.html' : path.replace(/^\/(login|portal)$/, '/$1.html'));
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;

const stub = (emissions) => `
  const mk = { onAuthStateChanged(cb){ ${JSON.stringify(emissions)}.forEach(([v,t])=>setTimeout(()=>cb(v==='USER'?{uid:'u1',email:'a@b.c',isAnonymous:false}:null),t)); return ()=>{}; }, setPersistence: async()=>{}, signOut: async()=>{}, currentUser: null };
  const fsStub = () => ({ collection(){ return { doc(){ return { get: async()=>({exists:true,data:()=>({role:'admin',name:'T'})}), update: async()=>{}, set: async()=>{} }; }, where(){ return this; }, limit(){ return this; }, orderBy(){ return this; }, get: async()=>({empty:true,docs:[],forEach(){}}) }; }, enablePersistence: async()=>{} });
  Object.defineProperty(window,'firebase',{value:{ initializeApp(){return{};}, auth: Object.assign(()=>mk,{Auth:{Persistence:{LOCAL:'l',SESSION:'s'}}}), firestore: Object.assign(fsStub,{FieldValue:{serverTimestamp:()=>null,increment:()=>null,arrayUnion:()=>null,delete:()=>null},Timestamp:{now:()=>({toDate:()=>new Date()})}}), storage: ()=>({ref(){return{};}}), apps:[{}] }});
`;
const SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
let failures = 0;
const assert = (name, cond, detail) => { console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail ? ' — ' + detail : ''}`); if (!cond) failures++; };

// Test ermetico: niente rete esterna. Senza questo blocco il vero SDK
// Firebase (gstatic) caricherebbe e proverebbe a sovrascrivere lo stub
// window.firebase (non-writable) → pageerror spurio.
async function hermetic(ctx) {
  await ctx.route('**/*', (route) => {
    route.request().url().startsWith(BASE) ? route.continue() : route.abort();
  });
}

async function scenario({ ua, emissions, bounces, path = '/portal.html#contracts', wait = 6000 }) {
  const ctx = await browser.newContext(ua ? { userAgent: ua } : {});
  await hermetic(ctx);
  await ctx.addInitScript(stub(emissions));
  if (bounces) await ctx.addInitScript((b) => { try { sessionStorage.setItem('boomLoginBounce', String(b)); } catch {} }, bounces);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(wait);
  const url = page.url();
  await ctx.close();
  return { url, errors };
}

// 1. sloggato → redirect con next+hash
const r1 = await scenario({ emissions: [['NULL', 300]] });
assert('portal sloggato → /login con next', r1.url.includes('/login?next=%2Fportal.html%23contracts'));

// 2. Safari, null spurio poi utente → resta sul portale
const r2 = await scenario({ ua: SAFARI_UA, emissions: [['NULL', 300], ['USER', 1500]], wait: 7000 });
assert('null spurio (Safari) → nessun redirect', !r2.url.includes('/login'));

// 3. anti-loop: 2 rimbalzi già fatti → niente redirect
const r3 = await scenario({ ua: SAFARI_UA, emissions: [['NULL', 300]], bounces: 2 });
assert('anti-loop dopo 2 rimbalzi', !r3.url.includes('/login'));

// 4. login: form visibile, zero errori, warm-up parte
{
  const ctx = await browser.newContext();
  await hermetic(ctx);
  await ctx.addInitScript(stub([['NULL', 300]]));
  const page = await ctx.newPage();
  const errors = [];
  const warmed = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (/portal-app\.js|portal\.css|portal\.html/.test(r.url())) warmed.push(r.url()); });
  await page.goto(BASE + '/login?next=%2Fportal', { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  assert('login: form visibile', await page.isVisible('#loginForm'));
  assert('login: zero errori JS', errors.length === 0, errors[0]);
  assert('login: warm-up portale partito', warmed.length >= 1);
  await ctx.close();
}

await browser.close();
server.close();
if (failures) { console.error(`\n${failures} scenari falliti.`); process.exit(1); }
console.log('\nSmoke test OK.');
