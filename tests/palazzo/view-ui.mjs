// IL PALAZZO SUI DATI NUOVI, nel browser vero (S3). Le funzioni del portal
// sono quelle VERE estratte da js/portal-app.js (rotta, adattatore, presa in
// carico, carta su /rata, rendiconto, link per la password, scansione su
// carta); Firestore e Storage sono finti e registrano le scritture. Dati
// sintetici: nomi inventati, telefoni +39 000…, email @example.invalid.
//   1. presa in carico con differenze: il tasto non dice MAI «Niente da
//      cambiare» con una differenza applicabile; «Applica» ricalcola il piano
//      e le rate già in archivio si rileggono una per una (una segnalata nel
//      frattempo NON si tocca);
//   2. contratto su carta: niente «Firma ora», la scansione si allega come
//      PDF; segnaposto: «Carica il contratto», mai PDF/Firma/RLI/ASPI/
//      Fascicolo/ARPE; Cambia canone, Chiudi contratto, Annulla incasso
//      passano dalle funzioni del portal;
//   3. carta su /rata: il pannello scrive rataCard su tutti gli interni e
//      dice la regola dell'art. 62;
//   4. proprietaria: rendiconto (modalità, anteprima), link per la password;
//   5. un mese tutto prima della gestione BOOM: UNA riga, mai «in regola»;
//   6. la scheda chiusa riporta il focus su ciò che l'aveva aperta;
//   7. Elenco senza scorrimento orizzontale a 1440, 1024 e 390;
//   8. un numero senza prefisso certo: niente WhatsApp, e lo si dice;
//   9. la proprietaria con una lettura fallita vede «Riprova», mai un
//      palazzo «tutto libero».
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChromium, launchOptions } from '../_browser.mjs';
import { buildFixture } from './fixture.mjs';
import { contactsOf } from '../../api/owners/contatti.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const src = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
function extract(name) {
  let start = src.indexOf('\n    function ' + name + '(');
  if (start < 0) start = src.indexOf('\n    async function ' + name + '(');
  if (start < 0) throw Error('Missing ' + name);
  start += 1;
  const next = src.slice(start + 5).search(/\n    (?:async )?function /);
  return next < 0 ? src.slice(start) : src.slice(start, start + 5 + next);
}
const names = ['goTo', 'buildNav', 'renderPage', 'closeSidebar', 'toggleSidebar', 'accessDenied', 'isAdmin', 'isLandlord', 'isTenant', 'esc', 'fmtDate', 'daysUntil', 'isOverdue',
  'isPaymentLate', 'isPaymentOpen', 'getMyProperties', 'getMyContracts', 'getMyPayments', 'getMyMaintenance', 'boomBusinessInvoices', 'closeModal',
  'contractIsPaper', 'contractIsPlaceholder', 'palazzoAdminOnly', 'palazzoMissing', 'palazzoTerminate', 'palazzoLinkOwner', 'palazzoSaveLook', 'palazzoImport',
  'palazzoLogSent', 'palazzoSetRendiconto', 'palazzoSaveRataCard', 'palazzoUploadPaper', 'palazzoSendPasswordLink', 'palazzoCompany', 'palazzoBoomText', 'palazzoWriteBoom', 'palazzoReload'];
const functions = names.map(extract).join('\n');
const cfgStart = src.indexOf('    window.BOOM_PALAZZO_UI?.configure({');
const config = src.slice(cfgStart, src.indexOf('    // L\'unica scrittura della vista', cfgStart));

const F = buildFixture(new Date());
const M = F.M, D = F.D;
const it = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
const base0 = JSON.parse(JSON.stringify(F.state));
// int. 4: firmato su carta e preso in carico dalla tabella → niente Firma ora
Object.assign(base0.contracts.find(c => c.id === 'c4'), { signatureStatus: 'paper', source: 'palazzo-import' });
// int. 6: un numero alla nazionale che comincia per 0 (fisso o estero): niente WhatsApp
Object.assign(base0.contracts.find(c => c.id === 'c6'), { tenantPhone: '0532 123 45 67' });
// int. 14: occupato, contratto non ancora in archivio (segnaposto)
base0.properties.push({ id: 'u14', name: 'Viale Esempio 12 int. 14', address: 'Viale Esempio 12, 00197 Roma', interno: '14', floor: '4', ownerId: 'owner-demo' });
base0.contracts.push({ id: 'c14', propertyId: 'u14', status: 'active', contractMissing: true, source: 'palazzo-import', tenantName: 'Gaia Demo' });
// Un secondo palazzo preso in carico da questo mese: il mese scorso è tutto «prima di BOOM»
for (const n of [1, 2]) {
  base0.properties.push({ id: 's' + n, name: 'Via Seconda 7 int. ' + n, address: 'Via Seconda 7, Roma', interno: String(n), floor: String(n), ownerId: 'owner-demo', gestioneDal: M(0), source: 'palazzo-import' });
  base0.contracts.push({ id: 'cs' + n, propertyId: 's' + n, status: 'active', signatureStatus: 'paper', source: 'palazzo-import', tenantName: 'Seconda ' + n + ' Demo', rent: 800, startDate: M(-14) + '-01', endDate: M(20) + '-28', tenantPhone: '+39000000080' + n });
  base0.payments.push({ id: 'pay_cs' + n + '_' + M(0), propertyId: 's' + n, contractId: 'cs' + n, type: 'rent', month: M(0), amount: 800, status: 'paid', dueDate: M(0) + '-05', paidDate: M(0) + '-03', paidVia: 'dichiarato' });
}
base0.users[0].rendicontoMode = 'auto';
const admin = base0;
const landlord = { ...base0, profile: { id: 'owner-demo', role: 'landlord', name: 'Proprietaria Demo' },
  properties: base0.properties.filter(p => p.ownerId === 'owner-demo'), users: [base0.users[0]] };

function page(state, hash) {
  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Il Palazzo · dati nuovi</title>
<link rel="stylesheet" href="/css/portal.css"><link rel="stylesheet" href="/css/portal-finish.css"><link rel="stylesheet" href="/css/palazzo.css"><link rel="stylesheet" href="/css/portal-mobile.css"><link rel="stylesheet" href="/css/portal-desktop.css"></head><body>
<div class="app active" id="app"><header class="header"><div class="header-left"><button class="menu-btn" onclick="toggleSidebar()" aria-label="Menu">☰</button><span class="logo-text">BOOM</span></div><span id="headerName">Demo</span></header><div class="layout"><aside class="sidebar" id="sidebar"></aside><div class="sidebar-overlay" id="sidebarOverlay"></div><main class="main" id="main"></main></div><div id="modals"></div><div id="toasts"></div></div>
<script src="/js/contract-state.js"></script><script src="/js/rent-engine.js"></script><script src="/js/palazzo-engine.js"></script><script src="/js/palazzo.js"></script><script>
const S=${JSON.stringify(state)}; Object.assign(S,{page:'',_paLoaded:true,invoices:[],maintenance:S.maintenance||[],conversations:[],viewingRequests:[],actionQueue:[],deadlines:[],leads:[],notifications:[],documents:[]}); window.testState=S;
window.demoActions=[]; window.writes=[];
function toast(...a){demoActions.push(['toast',...a]);}
function openRentUnit(id,month){demoActions.push(['rent',id,month]);}
function viewContract(id){demoActions.push(['contract',id]);}
function showPaymentLink(kind,id){demoActions.push(['payLink',kind,id]);}
function confirmRentPayment(id){demoActions.push(['record',id]);}
function openModal(type,data){demoActions.push([type,data&&data.id]);}
function downloadContractPDF(id){demoActions.push(['pdf',id]);}
function openFirmaOra(id){demoActions.push(['firma',id]);}
function markRliRegistered(id){demoActions.push(['rli',id]);}
function openAspi(id){demoActions.push(['aspi',id]);}
function openFascicolo(id){demoActions.push(['fiscale',id]);}
function openSchedaArpe(id){demoActions.push(['arpe',id]);}
function undoIncasso(id){demoActions.push(['undo',id]);return true;}
function applyRentFuture(cid,v){demoActions.push(['setRent',cid,v]);return true;}
function applyOneriFuture(cid,v){demoActions.push(['setOneri',cid,v]);return true;}
function innestoOpenFor(kind,id){demoActions.push(['innesto',kind,id]);return true;}
async function loadDataFresh(){demoActions.push(['reload']);}
function logActivity(){}
function innestoSeedFromHash(){return false;}
window.confirm=(t)=>{demoActions.push(['confirm',String(t)]);return true;};
const FV={serverTimestamp:()=>'SERVER_TS',arrayUnion:(...v)=>({arrayUnion:v}),delete:()=>'DELETE'};
const firebase={firestore:{FieldValue:FV},auth(){return{currentUser:{getIdToken:async()=>'demo-'+S.profile.id}};}};
const auth={languageCode:'',async sendPasswordResetEmail(e,o){demoActions.push(['pwd',e,o&&o.url,auth.languageCode]);}};
const storage={ref(path){return{async put(file,meta){demoActions.push(['upload',path,meta&&meta.contentType,file.size]);return{ref:{async getDownloadURL(){return 'https://firebasestorage.googleapis.com/v0/b/demo/o/'+encodeURIComponent(path)+'?alt=media';}}};}};}};
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
function dref(c,id){return{path:c+'/'+id,async get(){const x=(S[c]||[]).find(y=>y.id===id);return{exists:!!x,data:()=>clone(x)};},async update(data){writes.push([c+'/'+id,data]);}};}
const db={batch(){const ops=[];return{update(ref,data){ops.push([ref.path,data]);},set(ref,data){ops.push([ref.path,data]);},async commit(){writes.push(...ops);}};},
  collection(c){const q=(fs)=>({where(f,op,v){return q(fs.concat([[f,op,v]]));},async get(){const arr=(S[c]||[]).filter(x=>fs.every(([f,op,v])=>op==='in'?v.includes(x[f]):x[f]===v));return{docs:arr.map(x=>({id:x.id,data:()=>clone(x)}))};}});
    return{doc(id){return dref(c,id);},where(f,op,v){return q([[f,op,v]]);}};},
  async runTransaction(fn){const ops=[];const tx={get:r=>r.get(),update(r,d){ops.push([r.path,d]);},set(r,d){ops.push([r.path,d]);}};const out=await fn(tx);writes.push(...ops);return out;}};
${functions}
${config}
goTo(${JSON.stringify(hash)});
</script><script src="/js/portal-mobile.js"></script><script src="/js/portal-desktop.js"></script></body></html>`;
}

const rendCalls = [];
let ownerError = '';
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'), path = url.pathname;
    const body = async () => { let b = ''; for await (const ch of req) b += ch; return b ? JSON.parse(b) : {}; };
    const who = String(req.headers.authorization || '').replace(/^Bearer demo-/, '');
    res.setHeader('Content-Type', 'application/json');
    if (path === '/api/owners/contatti' && req.method === 'POST') {
      const b = await body(), out = {};
      for (const id of b.contractIds) {
        const c = admin.contracts.find(x => x.id === id); if (!c) continue;
        const p = admin.properties.find(x => x.id === c.propertyId);
        if (who !== 'demo-admin' && (!p || p.ownerId !== who)) continue;
        out[id] = contactsOf(c, null, null);
      }
      res.end(JSON.stringify({ ok: true, contacts: out })); return;
    }
    if (path === '/api/owners/rendiconto' && req.method === 'POST') {
      rendCalls.push({ who, q: url.search });
      res.end(JSON.stringify({ ok: true, label: 'Settembre 2026', counts: { previews: url.searchParams.get('preview') ? 1 : 0, sent: url.searchParams.get('force') ? 1 : 0 },
        results: [{ month: M(-1), to: url.searchParams.get('preview') ? 'valentino@boom-rome.com' : 'owner@example.invalid' }] })); return;
    }
    if (path === '/api/maintenance/guasto' || path === '/api/payments/rata') { res.end(JSON.stringify({ ok: true, links: {}, skipped: {} })); return; }
    if (path === '/admin' || path === '/owner') {
      const st = path === '/admin' ? admin : { ...landlord, scopedLoadError: ownerError || null };
      res.setHeader('Content-Type', 'text/html');
      res.end(page(st, url.searchParams.get('page') || 'palazzo'));
      return;
    }
    const file = resolve(ROOT, '.' + path);
    if (!file.startsWith(ROOT)) throw Error('bad path');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8' })[extname(file)] || 'text/plain');
    res.end(await readFile(file));
  } catch (_) { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

const chromium = await loadChromium();
if (!chromium) { server.close(); console.log('SKIP: playwright non disponibile'); process.exit(0); }
let count = 0; const errors = [];
const browser = await chromium.launch(launchOptions({ headless: true }));
const acts = (pg, kind) => pg.evaluate(k => demoActions.filter(a => a[0] === k), kind);
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
    const pg = await context.newPage();
    pg.on('pageerror', e => { errors.push(e.message); console.error('Browser:', e.message); });
    await pg.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const check = async (label, fn) => { await fn(); count++; console.log('✓ ' + width + ' ' + label); };
    const openUnit = async (id) => {
      await pg.locator('[data-plz="view"][data-v="3d"]').click();
      await pg.waitForSelector('.plz-unit[data-id="' + id + '"]');
      await pg.locator('.plz-unit[data-id="' + id + '"]').evaluate(e => e.scrollIntoView({ block: 'center' }));
      await pg.locator('.plz-unit[data-id="' + id + '"]').click({ force: true });
      await pg.waitForSelector('#plz-unit-h');
    };
    // SCREENSHOT_DIR=… salva le schermate dei passaggi (1440 e 390).
    const shot = async (name, full = true) => { if (process.env.SCREENSHOT_DIR) { await pg.waitForTimeout(400); await pg.screenshot({ path: join(process.env.SCREENSHOT_DIR, 'view-' + name + '-' + width + '.png'), fullPage: full }); } };
    const closeUnit = async () => { await pg.locator('[data-plz="deselect"]').first().click(); await pg.waitForFunction(() => !document.getElementById('plz-unit-h')); };

    await pg.goto(base + '/admin');
    await pg.waitForSelector('.plz');
    if (process.env.SCREENSHOT_DIR) {
      await pg.locator('[data-plz="view"][data-v="simple"]').click();
      await pg.waitForSelector('.plz-facade');
      await pg.waitForTimeout(1800);
      await shot('semplice');
    }

    await check('contratto su carta: niente «Firma ora», la scansione firmata si allega come PDF', async () => {
      await openUnit('u4');
      const panel = pg.locator('#plz-panel');
      assert.equal(await panel.locator('[data-plz="firma"]').count(), 0, 'su carta non si firma in digitale');
      const input = panel.locator('input[data-plz-file="paper"]');
      assert.equal(await input.count(), 1);
      assert.ok((await panel.locator('label.plz-file').innerText()).includes('Allega contratto firmato (PDF)'));
      const w0 = await pg.evaluate(() => writes.length);
      await input.setInputFiles({ name: 'contratto.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%demo\n') });
      await pg.waitForFunction(n => writes.length > n, w0);
      const w = await pg.evaluate(n => writes.slice(n), w0);
      assert.deepEqual(w.map(x => x[0]), ['contracts/c4']);
      assert.ok(/^https:\/\/firebasestorage\.googleapis\.com\/.*contracts%2Fc4%2Fcontratto-carta-\d+\.pdf/.test(w[0][1].paperPdfUrl), w[0][1].paperPdfUrl);
      assert.equal((await acts(pg, 'upload'))[0][2], 'application/pdf');
      // ora la scansione È il PDF del contratto
      await pg.waitForFunction(() => /Contratto firmato \(PDF\)/.test(document.getElementById('plz-panel')?.textContent || ''));
      await closeUnit();
    });

    await check('il segnaposto: «Carica il contratto» apre la tabella con l\'interno già scritto; mai PDF, Firma, RLI, ASPI, Fascicolo, ARPE', async () => {
      await openUnit('u14');
      const panel = pg.locator('#plz-panel');
      await shot('segnaposto', false);
      for (const a of ['pdf', 'firma', 'rli', 'aspi', 'fiscale', 'arpe', 'terms', 'terminate']) assert.equal(await panel.locator('[data-plz="' + a + '"]').count(), 0, a);
      assert.ok((await panel.innerText()).includes('Gaia Demo'));
      await panel.locator('[data-plz="innesto"]').click();
      assert.deepEqual((await acts(pg, 'innesto')).at(-1), ['innesto', 'property', 'u14']);
      await panel.locator('[data-plz="load-contract"]').click();
      await pg.waitForSelector('.plz-import [data-imp="text"]');
      const t = await pg.locator('[data-imp="text"]').inputValue();
      assert.ok(t.startsWith('Interno\tPiano\tInquilino') && t.split('\n')[1].startsWith('14\t4\tGaia Demo'), t);
      await pg.locator('[data-plz="imp-close"]').click();
      await closeUnit();
    });

    await check('le leve sul contratto: Cambia canone, Chiudi contratto, Annulla incasso passano dalle funzioni del portal', async () => {
      await openUnit('u3');
      const panel = pg.locator('#plz-panel');
      await panel.locator('[data-plz="terms"][data-f="rent"]').click();
      await pg.locator('#plz-terms input[name="v"]').fill('1.050');
      await shot('scheda-3d');
      await pg.locator('#plz-terms button[type="submit"]').click();
      await pg.waitForFunction(() => demoActions.some(a => a[0] === 'setRent'));
      assert.deepEqual((await acts(pg, 'setRent')).at(-1), ['setRent', 'c3', 1050]);
      await panel.locator('[data-plz="terminate"]').click();
      assert.deepEqual((await acts(pg, 'terminateContract')).at(-1), ['terminateContract', 'c3']);
      await closeUnit();
      await openUnit('u4');
      // la rata del mese pagata a mano: si può annullare l'incasso
      await pg.locator('#plz-panel [data-plz="undo-record"]').first().click();
      await pg.waitForFunction(() => demoActions.some(a => a[0] === 'undo'));
      assert.deepEqual((await acts(pg, 'undo')).at(-1), ['undo', 'p4_' + M(0)]);
      await closeUnit();
    });

    await check('un numero senza prefisso certo: Chiama sì, WhatsApp no, e la scheda dice perché', async () => {
      await openUnit('u6');
      const person = pg.locator('#plz-panel .plz-person').first();
      await person.waitFor();
      assert.equal(await person.locator('a[href^="https://wa.me/"]').count(), 0);
      assert.equal(await person.locator('a[href^="tel:"]').count(), 1);
      const pt = await person.innerText();
      assert.ok(/fisso, oppure un cellulare estero senza prefisso/i.test(pt), pt);
      assert.ok(/0532 ?123 ?45 ?67/.test(pt) && !pt.includes('+39'), 'scritto com\'è stato dato, senza un prefisso inventato: ' + pt);
      await closeUnit();
    });

    await check('la scheda chiusa riporta il focus su ciò che l\'aveva aperta', async () => {
      await pg.locator('[data-plz="view"][data-v="simple"]').click();
      await pg.waitForSelector('.plz-win[data-id="u7"]');
      await pg.locator('.plz-win[data-id="u7"]').scrollIntoViewIfNeeded();
      await pg.locator('.plz-win[data-id="u7"]').click();
      await pg.waitForSelector('#plz-unit-h');
      await pg.locator('[data-plz="deselect"]').first().click();
      await pg.waitForFunction(() => { const a = document.activeElement; return !!(a && a.matches('.plz-win[data-id="u7"]')); }, null, { timeout: 3000 });
    });

    await check('Elenco: la tabella sta nella pagina, nessuno scorrimento orizzontale', async () => {
      await pg.locator('[data-plz="view"][data-v="list"]').click();
      await pg.waitForSelector('.plz-roll');
      await shot('elenco');
      for (const w of width === 1440 ? [1440, 1024] : [390]) {
        await pg.setViewportSize({ width: w, height: 1000 });
        await pg.waitForTimeout(120);
        const m = await pg.evaluate(() => { const r = document.querySelector('.plz-roll'); return { doc: document.documentElement.scrollWidth, vw: innerWidth, sw: r.scrollWidth, cw: r.clientWidth }; });
        assert.ok(m.doc <= m.vw + 1 && m.sw <= m.cw + 1, w + ': ' + JSON.stringify(m));
      }
      await pg.setViewportSize({ width, height: 1000 });
    });

    if (width === 1440) await check('carta su /rata: accesa solo con la data del mandato, scritta su TUTTI gli interni, con la regola dell\'art. 62', async () => {
      await pg.locator('[data-plz="view"][data-v="3d"]').click();
      await pg.waitForSelector('#plz-card');
      await pg.locator('#plz-card summary').click();
      const card = pg.locator('#plz-card');
      assert.ok((await card.innerText()).includes('art. 62 Codice del consumo'));
      await card.locator('input[data-card="on"]').check();
      assert.ok((await pg.locator('#plz-card-effect').innerText()).includes('Senza la data del mandato la carta resta SPENTA'));
      await card.locator('input[data-card="mandateAt"]').fill(D(-3));
      await card.locator('input[data-card="note"]').fill('Mandato prot. demo');
      await card.scrollIntoViewIfNeeded();
      await shot('carta', false);
      const w0 = await pg.evaluate(() => writes.length);
      await card.locator('[data-plz="card-save"]').click();
      await pg.waitForFunction(n => writes.length > n, w0);
      const w = await pg.evaluate(n => writes.slice(n), w0);
      assert.ok(w.length >= 13 && w.every(x => /^properties\/u\d+$/.test(x[0])), w.map(x => x[0]).join(','));
      const v = w[0][1].rataCard;
      assert.deepEqual([v.on, v.mandateAt, v.fee, v.note], [true, D(-3), 'absorbed', 'Mandato prot. demo']);
      assert.ok((await acts(pg, 'confirm')).at(-1)[1].includes('carta ACCESA su /rata'));
    });

    if (width === 1440) await check('presa in carico con differenze: mai «Niente da cambiare», le rate in archivio rilette una per una', async () => {
      // 1) un palazzo nuovo, un interno, rate da questo mese
      const dal = M(0) + '-01', al = new Date(Date.UTC(+M(11).slice(0, 4), +M(11).slice(5, 7), 0)).toISOString().slice(0, 10);   // 12 mesi interi
      const row = (canone) => ['Interno\tPiano\tInquilino\tTelefono\tCanone\tDal\tAl', ['1', '2', 'Rosa Demo', '+39 000 000 0071', canone, it(dal), it(al)].join('\t')].join('\n');
      await pg.locator('.plz-otools [data-plz="imp-open"]').click();
      await pg.waitForSelector('.plz-import');
      await pg.locator('[data-imp="address"]').fill('Via Prova 9, Roma');
      await pg.locator('[data-imp="from"]').fill(M(0));
      await pg.locator('[data-imp="text"]').fill(row('1000'));
      await pg.locator('[data-plz="imp-read"]').click();
      await pg.waitForFunction(() => !document.querySelector('[data-plz="imp-go"]')?.disabled);
      await pg.locator('[data-plz="imp-go"]').click();
      await pg.waitForFunction(() => /Via Prova 9/.test(document.getElementById('plz-h1')?.textContent || ''));
      const rates = await pg.evaluate(() => testState.payments.filter(p => p.contractId && /via-prova-9/.test(p.contractId)).map(p => ({ id: p.id, month: p.month, amount: p.amount })));
      assert.ok(rates.length >= 10 && rates.every(r => r.amount === 1000), JSON.stringify(rates));
      // 2) la stessa tabella col canone nuovo: una differenza, e il tasto lo dice
      await pg.locator('.plz-otools [data-plz="imp-open"]').click();
      await pg.waitForSelector('.plz-import');
      assert.equal(await pg.locator('[data-imp="from"]').inputValue(), M(0), '«gestione BOOM dal» parte da quella del palazzo');
      await pg.locator('[data-imp="text"]').fill(row('1100'));
      await pg.locator('[data-plz="imp-read"]').click();
      await pg.waitForSelector('.plz-imp-diff');
      assert.ok(/canone: €1\.000 → €1\.100 · \d+ rate — non applicata/.test(await pg.locator('.plz-imp-diff').first().innerText()), await pg.locator('.plz-imp-diff').first().innerText());
      const btns = await pg.locator('#plz-imp-out .plz-import-b button').allInnerTexts();
      assert.ok(!btns.some(t => /Niente da cambiare/.test(t)), btns.join(' | '));
      assert.ok(btns.some(t => /1 differenza con l’archivio: applicala|Applica anche la differenza/.test(t)), btns.join(' | '));
      assert.ok((await pg.locator('.plz-imp-msgs').innerText()).includes('differenza con l’archivio'));
      await pg.locator('.plz-import').scrollIntoViewIfNeeded();
      await shot('import-differenze', false);
      // 3) applica: il piano si ricalcola e il tasto dice quante rate cambiano
      await pg.locator('[data-plz="imp-apply"]').first().click();
      await pg.waitForFunction(() => /ricalcola \d+ rat/i.test(document.querySelector('[data-plz="imp-go"]')?.textContent || ''));
      assert.ok(await pg.locator('input[data-imp-flag="applyDiffs"]').isChecked());
      await shot('import-applica', false);
      const plan = await pg.evaluate(() => BOOM_PALAZZO_UI.ui.imp.plan.paymentUpdates.map(u => ({ id: u.id, amount: u.data.amount, expect: u.expect.amount })));
      assert.ok(plan.length >= 10 && plan.every(u => u.amount === 1100 && u.expect === 1000), JSON.stringify(plan));
      // nel frattempo l'inquilino segnala il bonifico di una rata: quella non si tocca
      const reported = plan[1].id;
      await pg.evaluate(id => { const p = testState.payments.find(x => x.id === id); p.tenantReported = true; p.tenantReportDate = new Date().toISOString().slice(0, 10); }, reported);
      const w0 = await pg.evaluate(() => writes.length);
      await pg.locator('[data-plz="imp-go"]').click();
      await pg.waitForFunction(() => demoActions.some(a => a[0] === 'toast' && a[2] === 'Palazzo caricato' && /ricalcolat/.test(a[3] || '')));
      const conf = (await acts(pg, 'confirm')).at(-1)[1];
      assert.ok(/differenza con l’archivio applicata/.test(conf) && /rate da pagare ricalcolate/.test(conf), conf);
      const w = await pg.evaluate(n => writes.slice(n), w0);
      const pw = w.filter(x => x[0].startsWith('payments/'));
      assert.equal(pw.length, plan.length - 1, 'una per rata, tranne la segnalata');
      assert.ok(!pw.some(x => x[0] === 'payments/' + reported), 'la rata segnalata nel frattempo resta com\'è');
      assert.ok(pw.every(x => x[1].amount === 1100 && x[1].amountChange && x[1].amountChange.was === 1000), JSON.stringify(pw[0]));
      const t = (await acts(pg, 'toast')).filter(a => a[2] === 'Palazzo caricato').at(-1);
      assert.equal(t[1], 'warning');
      assert.ok(/1 rata era cambiata nel frattempo/.test(t[3]), t[3]);
      // torna al palazzo di prima
      await pg.locator('select[data-plz="building"]').selectOption({ label: /Viale Esempio 12/ }).catch(async () => {
        const v = await pg.locator('select[data-plz="building"] option').evaluateAll(os => os.find(o => /Viale Esempio/.test(o.textContent)).value);
        await pg.locator('select[data-plz="building"]').selectOption(v);
      });
      await pg.waitForFunction(() => /Viale Esempio/.test(document.getElementById('plz-h1')?.textContent || ''));
    });

    await check('un mese tutto prima della gestione BOOM: una riga sola, mai «tutti in regola» né arretrati', async () => {
      await pg.locator('[data-plz="view"][data-v="simple"]').click();
      const v = await pg.locator('select[data-plz="building"] option').evaluateAll(os => os.find(o => /Via Seconda 7/.test(o.textContent)).value);
      await pg.locator('select[data-plz="building"]').selectOption(v);
      await pg.waitForFunction(() => /Via Seconda 7/.test(document.getElementById('plz-h1')?.textContent || ''));
      await pg.locator('[data-plz="prev"]').click();
      await pg.waitForSelector('.plz-before-line');
      await shot('prima-di-boom');
      const txt = await pg.locator('.plz').innerText();
      assert.ok(/Prima della gestione BOOM \(da \w+ \d{4}\)/.test(await pg.locator('.plz-before-line').innerText()), await pg.locator('.plz-before-line').innerText());
      assert.ok(!/non hanno pagato|in regola|tutto pieno/i.test(txt.replace(/Prima della gestione BOOM[^\n]*/g, '')), txt);
      assert.equal(await pg.locator('.plz-scard').count(), 0, 'nessuna scheda del mese');
      assert.equal(await pg.locator('.plz-before-line').count(), 1, 'la frase UNA volta');
      assert.equal(await pg.locator('[data-plz="rata-all"]').count(), 0, 'nessun «manda i link» per un mese di cui BOOM non sa niente');
      // anche nel 3D: una riga al posto dei numeri, nessun «in breve» ripetuto accanto
      await pg.locator('[data-plz="view"][data-v="3d"]').click();
      await pg.waitForSelector('#plz-kpis .plz-before-line');
      assert.equal(await pg.locator('.plz-before-line').count(), 1);
      assert.ok(/Prima di BOOM/.test(await pg.locator('.plz-legend, .plz-filters, .plz').first().innerText()), 'la legenda dice «Prima di BOOM»');
      await pg.locator('[data-plz="view"][data-v="simple"]').click();
      await pg.locator('[data-plz="today"]').click();
      const v0 = await pg.locator('select[data-plz="building"] option').evaluateAll(os => os.find(o => /Viale Esempio/.test(o.textContent)).value);
      await pg.locator('select[data-plz="building"]').selectOption(v0);
      await pg.waitForFunction(() => /Viale Esempio/.test(document.getElementById('plz-h1')?.textContent || ''));
    });

    if (width === 1440) await check('Invia alla proprietaria: link per la password (in italiano, di ritorno al Palazzo) e rendiconto', async () => {
      await pg.locator('[data-plz="share"]').click();
      await pg.waitForSelector('#plz-share-t');
      assert.ok((await pg.locator('#plz-share-t').inputValue()).includes('«Password dimenticata?»'));
      await pg.locator('[data-plz="pwd-link"]').click();
      await pg.waitForFunction(() => /Link per la password inviato/.test(document.querySelector('[data-plz="pwd-link"]')?.textContent || ''));
      assert.deepEqual((await acts(pg, 'pwd')).at(-1), ['pwd', 'owner@example.invalid', 'https://www.boomrome.com/login?next=%2Fportal%23palazzo', 'it']);
      // rendiconto: la modalità scritta in archivio è «Automatico a lei»
      assert.equal(await pg.locator('[data-plz="rend-mode"][aria-pressed="true"]').getAttribute('data-mode'), 'auto');
      const w0 = await pg.evaluate(() => writes.length);
      await pg.locator('[data-plz="rend-mode"][data-mode="preview"]').click();
      await pg.waitForFunction(n => writes.length > n, w0);
      const w = await pg.evaluate(n => writes.slice(n), w0);
      assert.deepEqual([w[0][0], w[0][1].rendicontoMode], ['users/owner-demo', 'preview']);
      await pg.waitForFunction(() => document.querySelector('[data-plz="rend-mode"][aria-pressed="true"]')?.getAttribute('data-mode') === 'preview');
      await pg.locator('[data-plz="rend-run"][data-kind="preview"]').click();
      await pg.waitForFunction(() => /Anteprima di/.test(document.querySelector('.plz-rend')?.textContent || ''));
      assert.ok(rendCalls.at(-1).q.includes('ownerId=owner-demo') && rendCalls.at(-1).q.includes('preview=1'), rendCalls.at(-1).q);
      assert.ok((await pg.locator('.plz-rend').innerText()).includes('lei non riceve niente'));
      await pg.locator('.plz-share').scrollIntoViewIfNeeded();
      await shot('invia-proprietaria', false);
      await pg.locator('[data-plz="share"]').click();
    });

    // ── La proprietaria con una lettura fallita ────────────────────────
    ownerError = 'Non sono riuscito a leggere contratti e rate.';
    await pg.goto(base + '/owner?page=');
    await pg.waitForSelector('.plz');
    await check('proprietaria con una lettura fallita: «Riprova», mai un palazzo che sembra tutto libero', async () => {
      await shot('proprietaria-riprova', false);
      const txt = await pg.locator('.plz').innerText();
      assert.ok(txt.includes('Il tuo palazzo non è arrivato') && txt.includes('Riprova'), txt);
      assert.equal(await pg.locator('.plz-win, .plz-unit, .plz-scard').count(), 0, 'il mese resta nascosto');
      assert.ok(!/libero|liberi|tutto pieno/i.test(txt), txt);
      await pg.locator('[data-plz="reload"]').click();
      await pg.waitForSelector('.plz-win[data-id]');
      assert.equal((await acts(pg, 'reload')).length, 1);
      assert.equal(await pg.locator('.plz-alert').count(), 0);
    });
    ownerError = '';
    await check('proprietaria: Scrivi a BOOM in WhatsApp o email, con l\'interno già scritto; nessuno strumento dell\'operatore', async () => {
      await pg.locator('.plz-win[data-id="u5"]').scrollIntoViewIfNeeded();
      await pg.locator('.plz-win[data-id="u5"]').click();
      await pg.waitForSelector('#plz-unit-h');
      await shot('proprietaria-scheda');
      await pg.evaluate(() => { window.__opened = []; window.open = (u) => { __opened.push(u); return {}; }; });
      await pg.locator('#plz-panel [data-plz="inbox"]:not([data-ch])').click();
      const wa = decodeURIComponent(await pg.evaluate(() => __opened.at(-1)));
      assert.ok(wa.startsWith('https://wa.me/393313251961?text=') && wa.includes('Viale Esempio 12, int. 5'), wa);
      assert.equal(await pg.locator('#plz-card, [data-plz="pwd-link"], [data-plz="rend-mode"], [data-plz="imp-open"], #plz-panel input[data-plz-file]').count(), 0);
      await pg.locator('[data-plz="deselect"]').first().click();
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`\n${count} check nel browser — il Palazzo sui dati nuovi, funzioni vere del portal, dati sintetici, nessuna scrittura reale.`);
} finally { await browser.close(); await new Promise(r => server.close(r)); }
