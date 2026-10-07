// IL PALAZZO nel browser vero. Le funzioni del portal sono quelle VERE
// (estratte da js/portal-app.js: goTo, buildNav, renderPage, rotta,
// adattatore, il collegamento al profilo), i layer mobile/desktop sono
// quelli veri; Firestore è finto e registra le scritture. Dati sintetici.
//   SCREENSHOT_DIR=…  salva le schermate (1440, 390)
//   PREVIEW_PORT=8123 PREVIEW_ONLY=1  anteprima locale da aprire a mano
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChromium, launchOptions } from '../_browser.mjs';
import { buildFixture } from './fixture.mjs';
import { buildFixture18 } from './fixture18.mjs';
import { contactsOf } from '../../api/owners/contatti.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const src = readFileSync(new URL('../../js/portal-app.js', import.meta.url), 'utf8');
function extract(name) {
  let start = src.indexOf('    function ' + name + '(');
  if (start < 0) start = src.indexOf('    async function ' + name + '(');
  if (start < 0) throw Error('Missing ' + name);
  const next = src.slice(start + 5).search(/\n    (?:async )?function /);
  return next < 0 ? src.slice(start) : src.slice(start, start + 5 + next);
}
const names = ['goTo', 'buildNav', 'renderPage', 'closeSidebar', 'toggleSidebar', 'accessDenied', 'isAdmin', 'isLandlord', 'isTenant', 'esc', 'daysUntil', 'isOverdue', 'isPaymentLate', 'isPaymentOpen',
  'getMyProperties', 'getMyContracts', 'getMyPayments', 'getMyMaintenance', 'boomBusinessInvoices', 'closeModal', 'palazzoLinkOwner', 'palazzoSaveLook', 'palazzoImport'];
const functions = names.map(extract).join('\n');
const cfgStart = src.indexOf('    window.BOOM_PALAZZO_UI?.configure({');
const config = src.slice(cfgStart, src.indexOf('    // L\'unica scrittura della vista', cfgStart));

function page(state, hash) {
  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Il Palazzo · anteprima BOOM</title>
<link rel="stylesheet" href="/css/portal.css"><link rel="stylesheet" href="/css/portal-finish.css"><link rel="stylesheet" href="/css/palazzo.css"><link rel="stylesheet" href="/css/portal-mobile.css"><link rel="stylesheet" href="/css/portal-desktop.css"></head><body>
<div class="app active" id="app"><header class="header"><div class="header-left"><button class="menu-btn" onclick="toggleSidebar()" aria-label="Menu">☰</button><span class="logo-text">BOOM</span></div><span style="color:var(--text-secondary);font-size:11px">ANTEPRIMA LOCALE · DATI DEMO</span><span id="headerName">Demo</span></header><div class="layout"><aside class="sidebar" id="sidebar"></aside><div class="sidebar-overlay" id="sidebarOverlay"></div><main class="main" id="main"></main></div><div id="modals"></div><div id="toasts"></div></div>
<script src="/js/rent-engine.js"></script><script src="/js/palazzo-engine.js"></script><script src="/js/palazzo.js"></script><script>
const S=${JSON.stringify(state)}; Object.assign(S,{page:'',_paLoaded:true,invoices:[],maintenance:[],conversations:[],viewingRequests:[],actionQueue:[],deadlines:[],leads:[],notifications:[],documents:[]}); window.testState=S;
window.demoActions=[]; window.writes=[];
function toast(...a){demoActions.push(['toast',...a]);}
function openRentUnit(id,month){demoActions.push(['rent',id,month]);}
function viewContract(id){demoActions.push(['contract',id]);}
function showPaymentLink(kind,id){demoActions.push(['payLink',kind,id]);}
function openModal(type,data){demoActions.push([type,data&&data.id]);}
function downloadContractPDF(id){demoActions.push(['pdf',id]);}
function openFirmaOra(id){demoActions.push(['firma',id]);}
function markRliRegistered(id){demoActions.push(['rli',id]);}
function openAspi(id){demoActions.push(['aspi',id]);}
function openFascicolo(id){demoActions.push(['fiscale',id]);}
function openSchedaArpe(id){demoActions.push(['arpe',id]);}
function logActivity(){}
function innestoSeedFromHash(){return false;}
window.confirm=()=>true;
const firebase={firestore:{FieldValue:{serverTimestamp:()=>'SERVER_TS'}},auth(){return{currentUser:{getIdToken:async()=>'demo-'+S.profile.id}};}};
const db={batch(){const ops=[];return{update(ref,data){ops.push([ref.path,data]);},set(ref,data){ops.push([ref.path,data]);},async commit(){writes.push(...ops);}};},collection(c){return{doc(id){return{path:c+'/'+id,async get(){return{exists:!!(S[c]||[]).find(x=>x.id===id)};}};},where(f,op,v){return{async get(){const arr=(S[c]||[]).filter(x=>op==='in'?v.includes(x[f]):x[f]===v);return{docs:arr.map(x=>({id:x.id}))};}};}};}};
${functions}
${config}
goTo(${JSON.stringify(hash)});
</script><script src="/js/portal-mobile.js"></script><script src="/js/portal-desktop.js"></script></body></html>`;
}

// PREVIEW_FIXTURE=18: l'anteprima a mano sul palazzo da 18 interni.
const F = process.env.PREVIEW_FIXTURE === '18' ? buildFixture18(new Date()) : buildFixture(new Date());
const admin = F.state;
const landlord = { ...F.state, profile: { id: 'owner-demo', role: 'landlord', name: 'Proprietaria Demo' },
  // dal suo accesso il loader porta solo i suoi immobili (rules + query ownerId)
  properties: F.state.properties.filter(p => p.ownerId === 'owner-demo'), users: [F.state.users[0]] };

const contactCalls = [], contactFail = { on: false };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'), path = url.pathname;
    // La porta dei contatti, finta ma con la regola VERA: il chiamante
    // proprietario riceve solo i contratti dei suoi immobili, e i recapiti
    // escono dalla stessa contactsOf del server.
    if (path === '/api/owners/contatti' && req.method === 'POST') {
      let body = ''; for await (const ch of req) body += ch;
      const who = String(req.headers.authorization || '').replace(/^Bearer demo-/, '');
      contactCalls.push({ who, ids: JSON.parse(body).contractIds });
      if (process.env.CONTACTS_FAIL === '1' || contactFail.on) { res.statusCode = 500; res.end('{"ok":false,"error":"lookup_failed"}'); return; }
      const out = {};
      for (const id of JSON.parse(body).contractIds) {
        const c = F.state.contracts.find(x => x.id === id); if (!c) continue;
        const p = F.state.properties.find(x => x.id === c.propertyId);
        if (who !== 'demo-admin' && (!p || p.ownerId !== who)) continue;
        out[id] = contactsOf(c, null, null);
      }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, contacts: out }));
      return;
    }
    if (path === '/admin' || path === '/owner') {
      res.setHeader('Content-Type', 'text/html');
      res.end(page(path === '/admin' ? admin : landlord, url.searchParams.get('page') || 'palazzo'));
      return;
    }
    const file = resolve(ROOT, '.' + path);
    if (!file.startsWith(ROOT)) throw Error('bad path');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'text/plain');
    res.end(await readFile(file));
  } catch (_) { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(Number(process.env.PREVIEW_PORT || 0), '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
if (process.env.PREVIEW_ONLY) { console.log('Anteprima ' + base + '/admin  ·  ' + base + '/owner'); await new Promise(() => {}); }

const chromium = await loadChromium();
if (!chromium) { server.close(); console.log('SKIP: playwright non disponibile'); process.exit(0); }
let count = 0; const errors = [];
const browser = await chromium.launch(launchOptions({ headless: true }));
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
    const pg = await context.newPage();
    pg.on('pageerror', e => { errors.push(e.message); console.error('Browser:', e.message); });
    await pg.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const check = async (label, fn) => { await fn(); count++; console.log('✓ ' + width + ' ' + label); };

    const calls0 = contactCalls.length;
    await pg.goto(base + '/admin');
    await pg.waitForSelector('.plz');
    if (width <= 600) await check('telefono: si apre in Semplice', async () => { assert.equal(await pg.locator('.plz').getAttribute('data-view'), 'simple'); });
    else await pg.locator('[data-plz="view"][data-v="simple"]').click();
    await pg.waitForSelector('.plz-facade');
    await check('Semplice: il mese in una frase scritta dai numeri', async () => {
      assert.equal(await pg.locator('.plz-lead').innerText(), '10 interni su 13 sono pieni, 1 libero, 2 in arrivo.');
      const rest = await pg.locator('.plz-rest').innerText();
      assert.ok(rest.includes('5 hanno pagato su 9 (€5.000 di €8.950).') && rest.includes('2 sono in ritardo per €1.800: int. 12, int. 3.'), rest);
    });
    await check('Semplice: la facciata, una finestra per interno, dall\'alto', async () => {
      assert.equal(await pg.locator('.plz-win[data-id]').count(), 13);
      assert.ok(/^at$/i.test(await pg.locator('.plz-fac-lab').first().innerText()));
      assert.equal(await pg.locator('.plz-win[data-state="late"]').count(), 2);
      assert.equal(await pg.locator('.plz-win[data-id="u2"]').getAttribute('data-pipe'), 'nego');
      // Le finestre senza numero non sono interni: non si toccano, non si leggono
      const blind = pg.locator('.plz-win.is-blind');
      assert.ok(await blind.count() > 0);
      assert.equal(await blind.first().evaluate(e => e.tagName + ':' + e.getAttribute('aria-hidden')), 'SPAN:true');
    });
    await check('Semplice: le luci si accendono e le persiane si aprono; il libero resta chiuso', async () => {
      await pg.waitForFunction(() => { const f = document.getElementById('plz-fac'); return f && !f.classList.contains('is-intro'); });
      await pg.waitForTimeout(2800);
      const tf = id => pg.locator('.plz-win[data-id="' + id + '"] .plz-shut-l').evaluate(e => getComputedStyle(e).transform);
      assert.equal(await tf('u2'), 'none');            // libero: persiane chiuse
      assert.notEqual(await tf('u1'), 'none');         // pagato: aperte contro il muro
      assert.notEqual(await tf('u9'), 'none');         // in arrivo: socchiuse
      assert.notEqual(await tf('u1'), await tf('u9'));
    });
    await check('Semplice: la targa e il civico dal vero indirizzo, aspetto neutro finché nessuno lo dichiara', async () => {
      assert.equal(await pg.locator('.plz-targa').evaluate(e => e.textContent), 'Viale Esempio');
      assert.equal(await pg.locator('.plz-civ').evaluate(e => e.textContent), '12');
      assert.ok((await pg.locator('#plz-fac').getAttribute('style')).includes('--wall:#A9A193'));
      assert.equal(await pg.locator('#plz-look-badge').evaluate(e => e.textContent), 'neutro');
    });
    await check('Semplice 3D: ogni finestra numerata riceve il SUO click (Chrome sbagliava piano)', async () => {
      const miss = await pg.evaluate(() => [...document.querySelectorAll('.plz-win[data-id]')].filter(w => {
        w.scrollIntoView({ block: 'center' });
        const c = w.getBoundingClientRect();
        const e = document.elementFromPoint(c.left + c.width / 2, c.top + c.height * 0.3);
        return !(e && e.closest('.plz-win') === w);
      }).map(w => w.dataset.id));
      assert.deepEqual(miss, []);
    });
    await check('Semplice 3D: trascinare gira il palazzo e non apre una scheda; le frecce pure', async () => {
      const stage = pg.locator('#plz-fac-stage');
      await stage.scrollIntoViewIfNeeded();
      const fy = () => pg.locator('#plz-fac-body').evaluate(e => e.style.getPropertyValue('--fy'));
      const before = await fy();
      const sel0 = await pg.evaluate(() => BOOM_PALAZZO_UI.ui.selected);
      const b = await stage.boundingBox();
      const cx = b.x + b.width / 2, cy = b.y + Math.min(b.height / 2, 300);
      await pg.mouse.move(cx, cy); await pg.mouse.down();
      await pg.mouse.move(cx + 120, cy, { steps: 6 }); await pg.mouse.up();
      assert.notEqual(await fy(), before);
      assert.equal(await pg.evaluate(() => BOOM_PALAZZO_UI.ui.selected), sel0, 'un trascinamento non è un tocco');
      await pg.mouse.move(cx + 120, cy); await pg.mouse.down();
      await pg.mouse.move(cx, cy, { steps: 6 }); await pg.mouse.up();
      await stage.focus();
      const k0 = await fy();
      await pg.keyboard.press('ArrowRight');
      assert.notEqual(await fy(), k0);
      await pg.keyboard.press('ArrowLeft');
      assert.equal(await fy(), k0);
    });
    await check('Semplice: cambio mese, la facciata resta (cambia la luce, non il disegno)', async () => {
      const h = await pg.locator('.plz-win[data-id="u1"]').elementHandle();
      await pg.locator('[data-plz="prev"]').click();
      assert.ok(await h.evaluate(e => e.isConnected));
      assert.equal(await pg.locator('#plz-fac.is-intro').count(), 0);
      await pg.locator('[data-plz="today"]').click();
      assert.ok(await h.evaluate(e => e.isConnected));
    });
    await check('Semplice: chi non ha pagato, con UN tasto per sollecitare', async () => {
      const card = pg.locator('.plz-scard.is-late');
      assert.equal(await card.locator('.plz-srow').count(), 2);
      await card.locator('[data-plz="paylink"]').first().click();
      const last = await pg.evaluate(() => demoActions.at(-1));
      assert.deepEqual(last.slice(0, 2), ['payLink', 'pay']);
      assert.ok(/^p12_/.test(last[2]), last[2]);
    });
    await check('Semplice: i liberi dicono cosa succede (trattativa, sito, da quanto)', async () => {
      const txt = await pg.locator('.plz-scard').filter({ hasText: 'Liberi' }).innerText();
      assert.ok(txt.includes('in trattativa con Candidata Demo') && txt.includes('pubblicato sul sito') && /libero da \d+ giorni/.test(txt), txt);
      assert.ok(txt.includes('proposta pagata, contratto da creare'), txt);
    });
    await check('contatti: UNA richiesta per palazzo, con tutti i contratti del mese', async () => {
      await pg.waitForFunction(() => document.querySelectorAll('.plz-win[data-id]').length > 0);
      assert.equal(contactCalls.length - calls0, 1);
      const ids = contactCalls[calls0].ids.slice().sort();
      for (const id of ['c1', 'c3', 'c11', 'c12', 'c9']) assert.ok(ids.includes(id), id + ' · ' + ids.join(','));
      assert.equal(contactCalls[calls0].who, 'demo-admin');
    });
    await check('scheda: chi abita qui, con Chiama · WhatsApp · Email, e quanto manca alla scadenza', async () => {
      await pg.locator('.plz-win[data-id="u7"]').click();
      await pg.waitForSelector('#plz-panel .plz-person');
      const card = pg.locator('#plz-panel');
      assert.equal(await card.locator('a[href="tel:+390000000007"]').count(), 1);
      assert.equal(await card.locator('a[href="https://wa.me/390000000007"]').count(), 1);
      assert.equal(await card.locator('a[href="mailto:inquilino7@example.invalid"]').count(), 1);
      const txt = await card.innerText();
      assert.ok(/scade tra 60 giorni/.test(txt), txt);
      assert.ok(/transitorio/i.test(txt) && /deposito/i.test(txt) && txt.includes('€2.000'), txt);
      assert.equal(await pg.locator('#plz-panel .plz-term.is-leaving').count(), 1);
      assert.equal(await pg.locator('#plz-panel .plz-unitcard.is-enter').count(), 1);
      assert.equal(contactCalls.length - calls0, 1, 'la scheda non richiede di nuovo');
    });
    await check('scheda: il co-intestatario ha la sua riga, il numero mancante lo dice', async () => {
      await pg.locator('.plz-win[data-id="u11"]').click();
      await pg.waitForSelector('#plz-panel .plz-person');
      assert.equal(await pg.locator('#plz-panel .plz-person').count(), 2);
      assert.ok((await pg.locator('#plz-panel').innerText()).includes('Coinquilina Demo'));
      assert.equal(await pg.locator('#plz-panel a[href="tel:+390000000111"]').count(), 1);
      await pg.locator('.plz-win[data-id="u12"]').click();
      await pg.waitForSelector('#plz-unit-h');
      assert.ok((await pg.locator('#plz-panel').innerText()).includes('telefono non in archivio'));
      assert.equal(await pg.locator('#plz-panel a[href^="tel:"]').count(), 0);
      assert.ok((await pg.locator('.plz-issues').innerText()).includes('1 inquilino senza telefono'));
      await pg.locator('[data-plz="deselect"]').click();
    });
    await check('contatti giù: la scheda lo dice e «Riprova» li ricarica', async () => {
      contactFail.on = true;
      await pg.evaluate(() => { const C = BOOM_PALAZZO_UI.ui.contacts; C.byId = Object.create(null); C.failed = Object.create(null); });
      await pg.locator('.plz-win[data-id="u4"]').click();
      await pg.waitForSelector('#plz-panel [data-plz="contacts-retry"]');
      contactFail.on = false;
      await pg.locator('#plz-panel [data-plz="contacts-retry"]').click();
      await pg.waitForSelector('#plz-panel a[href="tel:+390000000004"]');
      await pg.locator('[data-plz="deselect"]').click();
    });
    await check('Semplice: tocco una finestra e si apre la scheda', async () => {
      await pg.locator('.plz-win[data-id="u3"]').click();
      await pg.waitForSelector('#plz-unit-h');
      assert.equal(await pg.locator('#plz-unit-h').innerText(), 'Int. 3');
      await pg.locator('[data-plz="deselect"]').click();
    });
    await pg.locator('[data-plz="view"][data-v="3d"]').click();
    await pg.waitForSelector('.plz-unit');
    await check('admin: il palazzo più grande, un cubo per ogni interno con piano', async () => {
      assert.equal(await pg.locator('#plz-h1').innerText(), 'Viale Esempio 12');
      assert.equal(await pg.locator('.plz-unit').count(), 12); // il 12 è nel cortile
      assert.equal(await pg.locator('.plz-tray .plz-chip').count(), 1);
      assert.equal(await pg.locator('.plz-level').count(), 5);
    });
    await check('lo stato del mese sul colore di ogni cubo', async () => {
      const st = await pg.$$eval('.plz-unit', els => Object.fromEntries(els.map(e => [e.dataset.id, e.dataset.state])));
      assert.deepEqual([st.u1, st.u3, st.u5, st.u6, st.u8, st.u9, st.u13, st.u2], ['paid', 'late', 'due', 'review', 'norate', 'incoming', 'incoming', 'vacant']);
      assert.equal(await pg.locator('.plz-unit[data-id="u2"]').getAttribute('data-pipe'), 'nego');
      const late = await pg.locator('.plz-unit[data-id="u3"] .plz-f-front').evaluate(e => getComputedStyle(e).backgroundImage);
      assert.ok(late.includes('rgb(255, 77, 90)'), late);
    });
    await check('i numeri del mese: pieni, pagati, non pagati, arretrati', async () => {
      const k = await pg.locator('#plz-kpis').innerText();
      assert.ok(/Pieni\s*10\s*\/13\s*1 libero · 2 in arrivo · 1 in scadenza/i.test(k), k);
      assert.ok(/Hanno pagato[^\n]*\n\s*5\s*\/9\s*€5\.000 di €8\.950/i.test(k), k);
      assert.ok(/Non hanno pagato\s*2\s*€1\.800 in ritardo/i.test(k), k);
      assert.ok(k.includes('€4.200'), k);
    });
    await check('il mese in parole: chi non ha pagato, per primo il ritardo più lungo', async () => {
      const blocks = await pg.locator('.plz-block h3').allInnerTexts();
      assert.ok(/^non hanno pagato/i.test(blocks[0]), blocks[0]);
      const first = await pg.locator('.plz-block').first().locator('.plz-line').allInnerTexts();
      assert.equal(first.length, 2);
      assert.ok(first[0].includes('Int. 12') && first[1].includes('Int. 3'), first.join(' | '));
    });
    await check('da sistemare (solo admin): cortile, accesso, contratti, rate', async () => {
      const txt = await pg.locator('.plz-issues').innerText();
      for (const s of ['senza piano', 'non collegato', 'attivo ma è scaduto', 'senza rata']) assert.ok(txt.includes(s), s + ' · ' + txt);
    });
    await check('tocco un interno: il pannello dice tutto e il cubo si alza', async () => {
      await pg.locator('.plz-unit[data-id="u3"]').evaluate(e => e.scrollIntoView({ block: 'center' }));
      await pg.locator('.plz-unit[data-id="u3"]').click({ force: true });
      await pg.waitForSelector('#plz-unit-h');
      assert.equal(await pg.locator('#plz-unit-h').innerText(), 'Int. 3');
      const p = await pg.locator('#plz-panel').innerText();
      assert.ok(p.includes('Inquilino 3 Demo') && p.includes('€3.000') && /3 rate/.test(p), p);
      assert.equal(await pg.locator('.plz-unit.is-sel').count(), 1);
    });
    await check('azioni admin → i flussi esistenti del portal', async () => {
      await pg.locator('[data-plz="rent"][data-id="u3"]').click();
      await pg.locator('#plz-panel [data-plz="contract"]').click();
      await pg.locator('#plz-panel [data-plz="edit"]').click();
      const acts = await pg.evaluate(() => demoActions.filter(a => a[0] !== 'toast'));
      assert.deepEqual(acts.slice(-3), [['rent', 'property:u3', acts.at(-3)[2]], ['contract', 'c3'], ['editProperty', 'u3']]);
    });
    await check('scheda admin: registrazione e cedolare, le leve raggruppate per mestiere', async () => {
      await pg.locator('.plz-unit[data-id="u5"]').evaluate(e => e.scrollIntoView({ block: 'center' }));
      await pg.locator('.plz-unit[data-id="u5"]').click({ force: true });
      await pg.waitForSelector('#plz-panel .plz-agroup');
      const p = await pg.locator('#plz-panel').innerText();
      assert.ok(/Registrazione\s*non segnata · oltre 30 giorni dalla decorrenza/i.test(p) && /Cedolare secca\s*sì/i.test(p), p);
      assert.deepEqual(await pg.locator('#plz-panel .plz-agroup-l').allInnerTexts(), ['SOLDI', 'CONTRATTO', 'REGISTRAZIONE', 'INTERNO'], 'gruppi');
      for (const a of ['rli', 'aspi', 'fiscale', 'arpe', 'pdf', 'firma']) await pg.locator('#plz-panel [data-plz="' + a + '"]').click();
      const acts = await pg.evaluate(() => demoActions.filter(a => a[0] !== 'toast').slice(-6));
      assert.deepEqual(acts, [['rli', 'c5'], ['aspi', 'c5'], ['fiscale', 'c5'], ['arpe', 'c5'], ['pdf', 'c5'], ['firma', 'c5']]);
      await pg.locator('.plz-unit[data-id="u1"]').click({ force: true });
      await pg.waitForFunction(() => /Int\. 1$/.test(document.getElementById('plz-unit-h')?.textContent || ''));
      assert.ok(/registrato all’Agenzia delle Entrate il \d{1,2} [a-z]{3} \d{4}/.test(await pg.locator('#plz-panel').innerText()));
      assert.equal(await pg.locator('#plz-panel [data-plz="rli"]').count(), 0, 'già registrato: niente ✓ RLI');
      await pg.locator('[data-plz="deselect"]').click();
    });
    await check('da sistemare: i contratti in corso senza registrazione segnata', async () => {
      assert.ok((await pg.locator('.plz-issues').innerText()).includes('2 contratti in corso senza registrazione segnata'));
    });
    await check('per il commercialista: il mese e l\'anno in CSV, dallo stesso motore', async () => {
      await pg.locator('[data-plz="view"][data-v="list"]').click();
      await pg.waitForSelector('.plz-export');
      const [dl] = await Promise.all([pg.waitForEvent('download'), pg.locator('[data-plz="csv"][data-span="month"]').click()]);
      assert.ok(/^BOOM_Viale-Esempio-12_\d{4}-\d{2}\.csv$/.test(dl.suggestedFilename()), dl.suggestedFilename());
      const csv = readFileSync(await dl.path(), 'utf8');
      assert.ok(csv.startsWith('﻿Mese;Interno;Piano;Inquilino;'), csv.slice(0, 60));
      const rows = csv.trim().split('\r\n');
      assert.equal(rows.length, 1 + 13);
      assert.ok(rows.some(r => r.includes(';Inquilino 5 Demo;') && r.includes(';Non segnata;')), csv);
      const [dy] = await Promise.all([pg.waitForEvent('download'), pg.locator('[data-plz="csv"][data-span="year"]').click()]);
      const ycsv = readFileSync(await dy.path(), 'utf8').trim().split('\r\n');
      assert.equal(ycsv.length, 1 + 13 * Number(F.month.slice(5, 7)), 'un anno fino al mese corrente, mai oltre');
      await pg.locator('[data-plz="view"][data-v="3d"]').click();
      await pg.waitForSelector('.plz-unit');
    });
    await check('👁 come la vede la proprietaria: i suoi interni, la sua lingua, nessun tasto dell\'operatore', async () => {
      await pg.locator('[data-plz="as-owner"][data-owner="owner-demo"]').click();
      await pg.waitForSelector('.plz-preview');
      assert.equal(await pg.locator('.plz-issues').count(), 0);
      assert.equal(await pg.locator('.plz-otools').count(), 0);
      assert.equal(await pg.locator('.plz-unit[data-id="u13"]').count(), 0, 'un interno non collegato a lei non c\'è, come dal suo accesso');
      await pg.locator('.plz-unit[data-id="u5"]').evaluate(e => e.scrollIntoView({ block: 'center' }));
      await pg.locator('.plz-unit[data-id="u5"]').click({ force: true });
      await pg.waitForSelector('#plz-unit-h');
      const p = await pg.locator('#plz-panel').innerText();
      assert.ok(/Registrazione\s*in verifica da BOOM/i.test(p), p);
      assert.equal(await pg.locator('#plz-panel [data-plz="rent"], #plz-panel .plz-agroup').count(), 0);
      assert.equal(await pg.locator('#plz-panel [data-plz="inbox"]').count(), 1);
      await pg.locator('.plz-preview [data-plz="as-owner"]').click();
      await pg.waitForSelector('.plz-otools');
      assert.equal(await pg.locator('.plz-preview').count(), 0);
      assert.equal(await pg.locator('.plz-issues').count(), 1);
    });
    await check('invia alla proprietaria: il messaggio pronto col link, WhatsApp ed email', async () => {
      await pg.locator('[data-plz="share"]').click();
      await pg.waitForSelector('#plz-share-t');
      const t = await pg.locator('#plz-share-t').inputValue();
      assert.ok(t.startsWith('Buongiorno Proprietaria,') && t.includes('https://www.boomrome.com/login?next=%2Fportal%23palazzo') && t.includes('Forgot?'), t);
      assert.ok((await pg.locator('.plz-share a[href^="https://wa.me/390000009999?text="]').count()) === 1);
      assert.ok((await pg.locator('.plz-share a[href^="mailto:owner@example.invalid?subject="]').count()) === 1);
      await pg.locator('[data-plz="share"]').click();
      assert.equal(await pg.locator('#plz-share-t').count(), 0);
    });
    await check('andamento: 12 barre, incassato su scaduto, puntualità, scadenze', async () => {
      assert.equal(await pg.locator('.plz-abar').count(), 12);
      const a = await pg.locator('#plz-analytics').innerText();
      assert.ok(/Incassato su scaduto\s*89%/i.test(a) && a.includes('€39.050 di €44.050'), a);
      assert.ok(/Puntualità\s*97%/i.test(a) && a.includes('29 rate su 30'), a);
      assert.ok(/Occupazione 12 mesi\s*88%/i.test(a), a);
      assert.ok(a.includes('Int. 7'), a);
      const tip = await pg.locator('.plz-abar.is-on').getAttribute('aria-label');
      assert.ok(tip.includes('incassato €5.000 su €8.950'), tip);
    });
    await check('scheda dell\'interno: puntualità, mesi occupati, proposta in corso', async () => {
      await pg.locator('.plz-unit[data-id="u2"]').evaluate(e => e.scrollIntoView({ block: 'center' }));
      await pg.locator('.plz-unit[data-id="u2"]').click({ force: true });
      await pg.waitForSelector('#plz-unit-h');
      const p = await pg.locator('#plz-panel').innerText();
      assert.ok(p.includes('occupato 10 mesi su 12') && p.includes('Proposta inviata · Candidata Demo'), p);
      await pg.locator('[data-plz="deselect"]').click();
    });
    await check('il filtro "In ritardo" spegne gli altri cubi senza toglierli', async () => {
      await pg.locator('[data-plz="filter"][data-f="late"]').click();
      assert.equal(await pg.locator('.plz-unit:not(.is-dim)').count(), 1);
      assert.equal(await pg.locator('.plz-unit').count(), 12);
      await pg.locator('[data-plz="filter"][data-f="all"]').click();
    });
    await check('il mese scorso: stessi cubi, nuovi colori (int. 6 pagato)', async () => {
      await pg.locator('[data-plz="prev"]').click();
      assert.equal(await pg.locator('.plz-unit[data-id="u6"]').getAttribute('data-state'), 'paid');
      assert.equal(await pg.locator('.plz-unit[data-id="u3"]').getAttribute('data-state'), 'late');
      assert.equal(await pg.locator('.plz-unit').count(), 12);
      await pg.locator('[data-plz="today"]').click();
      assert.equal(await pg.locator('.plz-unit[data-id="u6"]').getAttribute('data-state'), 'review');
    });
    await check('trascinare ruota il palazzo, i tasti pure', async () => {
      const before = await pg.locator('#plz-world').evaluate(e => e.style.getPropertyValue('--ry'));
      await pg.locator('#plz-stage').scrollIntoViewIfNeeded();
      const box = await pg.locator('#plz-stage').boundingBox();
      await pg.mouse.move(box.x + 40, box.y + 40); await pg.mouse.down(); await pg.mouse.move(box.x + 200, box.y + 50, { steps: 6 }); await pg.mouse.up();
      const after = await pg.locator('#plz-world').evaluate(e => e.style.getPropertyValue('--ry'));
      assert.notEqual(before, after);
      await pg.locator('[data-plz="reset"]').click();
      assert.equal(await pg.locator('#plz-world').evaluate(e => e.style.getPropertyValue('--ry')), '34deg');
    });
    await check('elenco: una riga per interno, i piani dall\'alto, 12 mesi a riga', async () => {
      await pg.locator('[data-plz="view"][data-v="list"]').click();
      await pg.waitForSelector('.plz-roll');
      assert.equal(await pg.locator('.plz-rrow:not(.plz-rhead)').count(), 13);
      assert.ok(/^attico$/i.test(await pg.locator('.plz-rfloor-l').first().innerText()));
      assert.equal(await pg.locator('.plz-rrow:not(.plz-rhead)').first().locator('.plz-dot').count(), 12);
      // il numero è nella riga, e toccarlo chiama (non apre la scheda)
      const tel = pg.locator('.plz-rrow[data-id="u1"] a.plz-tel');
      assert.equal(await tel.getAttribute('href'), 'tel:+390000000001');
      await pg.evaluate(() => document.addEventListener('click', e => { if (e.target.closest('a[href^="tel:"]')) e.preventDefault(); }, true));
      await tel.click();
      assert.equal(await pg.locator('#plz-unit-h').count(), 0);
      assert.ok(/scade tra 60 giorni/i.test(await pg.locator('.plz-rrow[data-id="u7"]').innerText()));
      await pg.locator('[data-plz="view"][data-v="3d"]').click();
      await pg.waitForSelector('.plz-unit');
    });
    await check('collega l\'interno non collegato: una scrittura, sola, sul suo immobile', async () => {
      await pg.locator('.plz-issues [data-plz="link"]').click();
      await pg.waitForFunction(() => writes.length > 0);
      const w = await pg.evaluate(() => writes);
      assert.deepEqual(w.map(x => x[0]), ['properties/u13']);
      assert.equal(w[0][1].ownerId, 'owner-demo');
      assert.ok(!(await pg.locator('.plz-issues').innerText()).includes('non collegato'));
    });
    await check('nessuno scorrimento orizzontale', async () => {
      assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });
    // ── L'aspetto del palazzo (admin) ─────────────────────────────────
    await pg.locator('[data-plz="view"][data-v="simple"]').click();
    await pg.waitForSelector('#plz-look');
    await pg.evaluate(() => { writes.length = 0; });
    await check('aspetto: anteprima dal vivo, nessuna scrittura finché non salvi', async () => {
      await pg.locator('#plz-look summary').click();
      await pg.locator('input[data-look="ultimoPiano"]').fill('5');
      const labs = await pg.locator('.plz-fac-lab').evaluateAll(els => els.map(e => e.textContent));
      assert.deepEqual(labs, ['AT', 'P4', 'P3', 'P2', 'P1', 'PT']);
      assert.equal(await pg.locator('.plz-fac-fl.is-ghost').count(), 1);
      await pg.locator('.plz-sw input[value="ocra"]').check({ force: true });
      await pg.locator('.plz-sw input[value="verde"]').check({ force: true });
      const st = await pg.locator('#plz-fac').getAttribute('style');
      assert.ok(st.includes('--wall:#C4874C') && st.includes('--shut:#2D4A38'), st);
      assert.equal(await pg.locator('#plz-look-badge').evaluate(e => e.textContent), 'anteprima');
      assert.equal(await pg.evaluate(() => writes.length), 0);
    });
    await check('aspetto: rifiuta un ultimo piano più basso di un interno gestito', async () => {
      await pg.locator('input[data-look="ultimoPiano"]').fill('2');
      await pg.locator('[data-plz="look-save"]').click();
      assert.ok((await pg.locator('#plz-look-err').innerText()).includes('non può essere più basso di 4'));
      assert.equal(await pg.evaluate(() => writes.length), 0);
    });
    await check('aspetto: salva su TUTTI gli interni, solo ciò che è cambiato', async () => {
      await pg.locator('input[data-look="ultimoPiano"]').fill('5');
      await pg.locator('[data-plz="look-save"]').click();
      await pg.waitForFunction(() => writes.length > 0);
      const w = await pg.evaluate(() => writes);
      assert.equal(w.length, 13);
      assert.ok(w.every(x => x[0].startsWith('properties/u')), JSON.stringify(w.map(x => x[0])));
      assert.ok(w.every(x => x[1].ultimoPiano === 5 && x[1].palazzoIntonaco === 'ocra' && x[1].palazzoPersiane === 'verde' && !('palazzoNome' in x[1])), JSON.stringify(w[0][1]));
      await pg.waitForFunction(() => document.getElementById('plz-look-badge')?.textContent === 'dichiarato');
      assert.ok((await pg.locator('#plz-fac').getAttribute('style')).includes('--wall:#C4874C'));
      await pg.evaluate(() => { writes.length = 0; });
    });
    await check('aspetto: Annulla butta l\'anteprima', async () => {
      await pg.locator('.plz-sw input[value="rosso"]').check({ force: true });
      assert.ok((await pg.locator('#plz-fac').getAttribute('style')).includes('--wall:#A2573C'));
      await pg.locator('[data-plz="look-cancel"]').click();
      await pg.waitForSelector('#plz-fac');
      assert.ok((await pg.locator('#plz-fac').getAttribute('style')).includes('--wall:#C4874C'));
      assert.equal(await pg.evaluate(() => writes.length), 0);
    });
    await check('facciata: nessuno scorrimento orizzontale', async () => {
      assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });
    if (width === 1440) await check('presa in carico: la tabella diventa interni, contratti e rate — solo dopo l\'anteprima', async () => {
      const w0 = await pg.evaluate(() => writes.length);
      const key0 = await pg.evaluate(() => BOOM_PALAZZO_UI.ui.key);
      await pg.locator('.plz-otools [data-plz="imp-open"]').click();
      await pg.waitForSelector('.plz-import');
      assert.equal(await pg.locator('[data-imp="address"]').inputValue(), 'Viale Esempio 12');
      assert.equal(await pg.locator('[data-imp="ownerId"]').inputValue(), 'owner-demo');
      await pg.locator('[data-imp="address"]').fill('Piazzale Prenestino 42, Roma');
      const mon = await pg.locator('[data-imp="from"]').inputValue();
      const paid = '03/' + mon.slice(5, 7) + '/' + mon.slice(0, 4);
      const bad = ['Interno\tPiano\tInquilino\tTelefono\tCanone\tDal\tAl\tPagato il', '1\tPT\tMario Rossi\t333 1234567\t1.250\t01/09/2025\t31/08/2027\t' + paid, '2\t1\t\t\t900\t\t\t', '3\t1\tAnna Bianchi\t\tabc\t01/01/2026\t31/12/2027\t'].join('\n');
      await pg.locator('[data-imp="text"]').fill(bad);
      await pg.locator('[data-plz="imp-read"]').click();
      await pg.waitForSelector('.plz-import-tab tr.is-bad');
      assert.ok(await pg.locator('[data-plz="imp-go"]').isDisabled(), 'con una riga in rosso non si carica niente');
      assert.ok((await pg.locator('#plz-imp-out').innerText()).includes('canone «abc» non è un numero'));
      await pg.locator('[data-imp="text"]').fill(bad.replace('\tabc\t', '\t950\t'));
      await pg.locator('[data-plz="imp-read"]').click();
      await pg.waitForFunction(() => !document.querySelector('[data-plz="imp-go"]')?.disabled);
      assert.equal(await pg.evaluate(() => writes.length), w0, 'leggere non scrive niente');
      const label = await pg.locator('[data-plz="imp-go"]').innerText();
      assert.ok(/^Crea 3 interni, 2 contratti, \d+ rate$/.test(label), label);
      await pg.locator('[data-plz="imp-go"]').click();
      await pg.waitForFunction(() => /Piazzale Prenestino 42/.test(document.getElementById('plz-h1')?.textContent || ''));
      const w = await pg.evaluate(n => writes.slice(n).map(x => x[0]), w0);
      assert.equal(w.filter(x => x.startsWith('properties/')).length, 3);
      assert.equal(w.filter(x => x.startsWith('contracts/')).length, 2);
      assert.ok(w.every(x => /^(properties|contracts|payments)\//.test(x)), w.join(','));
      const firstPay = await pg.evaluate(n => writes.slice(n).filter(x => x[0].startsWith('payments/')).map(x => x[1].month).sort()[0], w0);
      assert.equal(firstPay, mon, 'le rate partono dalla gestione, mai dalla decorrenza del 2025');
      assert.equal(await pg.locator('.plz-win[data-id]').count(), 3);
      assert.equal(await pg.locator('.plz-win[data-id="plz_piazzale-prenestino-42_1"]').getAttribute('data-state'), 'paid');
      assert.ok((await pg.locator('.plz-sub').innerText()).includes('gestione dal'));
      await pg.locator('select[data-plz="building"]').selectOption(key0);
      await pg.waitForFunction(() => /Viale Esempio/.test(document.getElementById('plz-h1')?.textContent || ''));
    });
    if (process.env.SCREENSHOT_DIR) {
      await pg.locator('[data-plz="deselect"]').click().catch(() => {});
      await pg.waitForTimeout(1800);
      await pg.screenshot({ path: join(process.env.SCREENSHOT_DIR, 'palazzo-admin-' + width + '.png'), fullPage: true });
    }

    // ── La proprietaria ───────────────────────────────────────────────
    // nessuna vista salvata: la proprietaria apre su Semplice anche da desktop
    await pg.evaluate(() => localStorage.removeItem('boom_palazzo'));
    await pg.goto(base + '/owner?page=');
    await pg.waitForSelector('.plz');
    await check('proprietaria: senza una scelta salvata apre su Semplice (chi ha pagato, subito)', async () => {
      assert.equal(await pg.locator('.plz').getAttribute('data-view'), 'simple');
    });
    await pg.locator('[data-plz="view"][data-v="3d"]').click();
    await pg.waitForSelector('.plz-unit');
    await check('proprietaria: atterra sul SUO palazzo, solo i suoi interni', async () => {
      assert.ok(pg.url().endsWith('#palazzo'));
      assert.equal(await pg.locator('#plz-h1').innerText(), 'Viale Esempio 12');
      assert.equal(await pg.locator('.plz-unit').count() + await pg.locator('.plz-tray .plz-chip').count(), 12);
      assert.ok((await pg.locator('.plz-sub').innerText()).includes('gestiti da BOOM'));
    });
    await check('proprietaria: i contatti dei SUOI inquilini, chiesti a suo nome', async () => {
      const mine = contactCalls.filter(c => c.who === 'owner-demo');
      assert.ok(mine.length >= 1);
      assert.ok(!mine.some(c => c.ids.includes('c-altra')), 'mai i contratti di un altro proprietario');
      await pg.locator('.plz-unit[data-id="u3"]').evaluate(e => e.scrollIntoView({ block: 'center' }));
      await pg.locator('.plz-unit[data-id="u3"]').click({ force: true });
      await pg.waitForSelector('#plz-panel a[href="tel:+390000000003"]');
      assert.equal(await pg.locator('#plz-panel a[href="https://wa.me/390000000003"]').count(), 1);
      await pg.locator('[data-plz="deselect"]').click();
    });
    await check('proprietaria: niente "da sistemare", niente azioni dell\'operatore', async () => {
      assert.equal(await pg.locator('.plz-issues').count(), 0);
      await pg.locator('.plz-unit[data-id="u3"]').evaluate(e => e.scrollIntoView({ block: 'center' }));
      await pg.locator('.plz-unit[data-id="u3"]').click({ force: true });
      await pg.waitForSelector('#plz-unit-h');
      assert.equal(await pg.locator('#plz-panel [data-plz="rent"], #plz-panel [data-plz="edit"], #plz-panel [data-plz="dossier"]').count(), 0);
      assert.equal(await pg.locator('#plz-panel [data-plz="inbox"]').count(), 1);
      assert.ok(!(await pg.locator('#plz-panel').innerText()).includes('Proposta'), 'le proposte restano all\'operatore');
    });
    await check('proprietaria: il CSV per il commercialista, nella sua lingua e solo coi suoi interni', async () => {
      await pg.locator('[data-plz="view"][data-v="simple"]').click();
      await pg.waitForSelector('.plz-export');
      const [dl] = await Promise.all([pg.waitForEvent('download'), pg.locator('[data-plz="csv"][data-span="month"]').click()]);
      const csv = readFileSync(await dl.path(), 'utf8');
      assert.ok(csv.includes(';Inquilino 5 Demo;') && /;In verifica da BOOM;/.test(csv) && !/Non segnata|Senza rata/.test(csv), csv);
      assert.ok(!csv.includes('Altro Demo') && !csv.includes('Vecchio Demo'), 'mai un interno che non è suo');
    });
    await check('proprietaria: in Semplice parla la sua lingua (mai "rata non registrata")', async () => {
      await pg.locator('[data-plz="view"][data-v="simple"]').click();
      await pg.waitForSelector('.plz-brief');
      const txt = await pg.locator('#plz-simple').innerText();
      assert.ok(txt.includes('in verifica da BOOM') && !/non registrata|non ha la rata/i.test(txt), txt);
      assert.equal(await pg.locator('[data-plz="paylink"]').count(), 0);
      assert.ok(!txt.includes('trattativa'), 'le proposte restano all\'operatore');
      assert.equal(await pg.locator('#plz-look').count(), 0, 'l\'aspetto lo dichiara l\'operatore');
      assert.equal(await pg.locator('.plz-win[data-pipe="nego"]').count(), 0, 'nessuna luce di trattativa per la proprietaria');
      await pg.locator('[data-plz="view"][data-v="3d"]').click();
      await pg.waitForSelector('.plz-unit');
    });
    await check('proprietaria: la voce nel menu e il badge dei ritardi', async () => {
      const nav = await pg.locator('#sidebar').innerText();
      assert.ok(nav.includes('Il Palazzo'));
      assert.ok(/Pagamenti\s*\d/.test(nav), nav); // il badge contava 0: le rate rinominate "overdue" sparivano
    });
    if (process.env.SCREENSHOT_DIR) {
      await pg.locator('[data-plz="deselect"]').click().catch(() => {});
      await pg.waitForTimeout(1800);
      await pg.screenshot({ path: join(process.env.SCREENSHOT_DIR, 'palazzo-owner-' + width + '.png'), fullPage: true });
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`\n${count} check nel browser — funzioni vere del portal, dati sintetici, nessuna scrittura reale.`);
} finally { await browser.close(); await new Promise(r => server.close(r)); }
