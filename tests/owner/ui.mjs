// tests/owner/ui.mjs — /owner in un Chromium VERO, a 390px e a 1440px.
//
// La pagina è quella vera (owner-dashboard.html servita dal repo); finti
// solo i confini: Firebase (auth), BoomPortal.requireAuth (utente già
// loggato), e le tre porte /api/owners/vault · /activate · /api/properties/
// dossier. La cassaforte che la pagina riceve la calcola il MOTORE VERO
// (js/owner-vault-engine.js) su dati sintetici — la pagina disegna ciò che
// il server manderebbe davvero, non un JSON scritto a mano.
//
// Si pretende: la risposta a «devo fare qualcosa?» in testa, i documenti in
// cartelle, il conduttore chiuso prima della firma, nessun HTML iniettato da
// un nome, EN a un tocco, niente scroll orizzontale, l'attivazione dal link
// e il caricamento di un documento dove manca.
// Uso: node tests/owner/ui.mjs  (senza playwright → SKIP)
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { loadChromium, launchOptions } from '../_browser.mjs';

const chromium = await loadChromium();
if (!chromium) { console.log('SKIP: playwright non disponibile'); process.exit(0); }

let passed = 0, failed = 0; const bad = [];
const check = (n, c, extra) => { c ? passed++ : (failed++, bad.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n + (c || extra === undefined ? '' : ' — ' + extra)); };

const ROOT = new URL('../../', import.meta.url).pathname;
const OWNER = (await import('../../js/owner-vault-engine.js')).default;
const FS = 'https://firebasestorage.googleapis.com/v0/b/x/o/';

const vault = OWNER.buildVault({
  now: '2026-09-30',
  properties: [
    { id: 'p1', name: 'Levico <img src=x onerror="window.__xss=1">', address: 'Via Levico 7', dossier: { ape: { url: FS + 'ape?alt=media', at: '2026-05-01' } } },
    { id: 'p2', name: 'Cavour', address: 'Via Cavour 12' },
  ],
  contracts: [
    { id: 'c1', propertyId: 'p1', tenantName: 'Tina Rossi', rent: 1200, startDate: '2026-01-01', endDate: '2026-12-15', signatureStatus: 'complete', tenantSignedAt: '2025-12-10', landlordSignedAt: '2025-12-11', rliRegisteredAt: '2025-12-20',
      signedPdfUrl: FS + 'signed?alt=media', signingCertificateUrl: FS + 'cert?alt=media', identityDocs: [{ url: FS + 'pass?alt=media', role: 'tenant', name: 'passport.jpg' }],
      verbaleConsegna: { url: FS + 'verb?alt=media', at: '2026-01-01', keysCount: 3 } },
    { id: 'c2', propertyId: 'p2', tenantName: 'Marco Verdi', rent: 900, startDate: '2026-11-01', endDate: '2027-10-31', signatureStatus: 'partial', tenantSignature: 'x', tenantSignedAt: '2026-09-28',
      landlordSignToken: 'LTOK', generatedPDF: FS + 'draft?alt=media', identityDocs: [{ url: FS + 'marco?alt=media', role: 'tenant' }] },
  ],
  payments: [
    { contractId: 'c1', propertyId: 'p1', amount: 1200, month: '2026-08', dueDate: '2026-08-05', status: 'paid', paidDate: '2026-08-04' },
    { contractId: 'c1', propertyId: 'p1', amount: 1200, month: '2026-09', dueDate: '2026-09-05', status: 'pending' },
  ],
  documents: [{ propertyId: 'p1', category: 'F24 IMU', name: 'F24 IMU · Levico · 2026', fileUrl: FS + 'f24?alt=media', docDate: '2026-06-16' }],
  rendiconti: [{ ownerId: 'anna', month: '2026-08', url: FS + 'rend?alt=media', at: '2026-09-01' }],
  signable: { c2: true },
  schedaUrls: { c2: 'https://www.boomrome.com/scheda?t=c2.l.x' },
});
const VAULT = { ok: true, preview: false, since: '2026-08-20T10:00:00.000Z', owner: { name: 'Anna Bianchi', email: 'anna@own.it' }, vault };

// ── server statico del repo ────────────────────────────────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/owner') p = '/owner-dashboard.html';
  const f = join(ROOT, p);
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port;

const FAKE_FIREBASE = `window.firebase={apps:[1],initializeApp:function(){},
  auth:function(){return{currentUser:window.__USER||null,signOut:function(){return Promise.resolve()},
    signInWithEmailAndPassword:function(e,p){window.__signIn={e:e,p:p};window.__USER={uid:'anna',getIdToken:function(){return Promise.resolve('TOK')}};return Promise.resolve({user:window.__USER})}}},
  firestore:function(){return{}}};`;
const FAKE_PORTAL = `window.BoomPortal={
  escapeHtml:function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})},
  toast:function(m){(window.__toasts=window.__toasts||[]).push(m)},registerServiceWorker:function(){},
  withTimeout:function(p){return p},
  requireAuth:function(){window.__USER=window.__USER||{uid:'anna',getIdToken:function(){return Promise.resolve('TOK')}};return Promise.resolve({user:window.__USER,profile:{role:'landlord',name:'Anna'}})}};`;

const browser = await chromium.launch(launchOptions());
async function page(w, h, url, hooks = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: hooks.rm || 'no-preference' });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(e.message));
  hooks.reqs = [];
  await pg.route('**/*', async (route) => {
    const u = route.request().url();
    hooks.reqs.push(u);
    if (/gstatic\.com\/firebasejs\/.*app-compat/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: FAKE_FIREBASE });
    if (/gstatic\.com\/firebasejs/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: '' });
    if (u.endsWith('/js/firebase-config.js') || u.endsWith('/js/boom-err.js')) return route.fulfill({ contentType: 'text/javascript', body: '' });
    if (u.endsWith('/js/boom-portal.js')) return route.fulfill({ contentType: 'text/javascript', body: FAKE_PORTAL });
    if (u.includes('/api/owners/vault')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(hooks.vault || VAULT) });
    if (u.includes('/api/owners/activate')) { const b = JSON.parse(route.request().postData() || '{}'); (hooks.act = hooks.act || []).push(b);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(b.op === 'check' ? { ok: true, email: 'anna@own.it' } : { ok: true, email: 'anna@own.it' }) }); }
    if (u.includes('/api/properties/dossier')) { hooks.upload = JSON.parse(route.request().postData() || '{}'); hooks.uploadAuth = route.request().headers().authorization;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, slot: hooks.upload.slot, url: FS + 'new' }) }); }
    if (u.startsWith(BASE)) return route.continue();
    return route.fulfill({ status: 204, body: '' });
  });
  await pg.goto(BASE + url);
  return { pg, ctx, errors };
}

for (const [w, h] of [[390, 844], [1440, 900]]) {
  console.log(`\n── ${w}px`);
  const { pg, ctx, errors } = await page(w, h, '/owner');
  await pg.waitForSelector('.verdict', { timeout: 8000 });
  const txt = await pg.textContent('#app');
  check(`${w}: saluto col nome e la risposta «devo fare qualcosa?» in testa`, /(Buongiorno|Buon pomeriggio|Buonasera), Anna/.test(txt) && /cose richiedono te|cosa richiede te/.test(txt), txt.slice(0, 120));
  check(`${w}: «Richiede te» con la firma e il link del proprietario`, await pg.$('a.gbtn[href*="sign?sign=LTOK"]') !== null);
  const pnumOk = await pg.waitForFunction(() => /1\.200/.test(document.querySelector('.pulse .pnum').textContent), null, { timeout: 4000 }).then(() => true, () => false);
  check(`${w}: canone in gestione nel polso (il numero che sale arriva al valore vero)`, pnumOk);
  check(`${w}: due immobili, quello in firma per primo`, (await pg.$$eval('.prop .nm', (n) => n.map((x) => x.textContent)))[0] === 'Cavour');
  check(`${w}: nessun HTML iniettato dal nome dell'immobile`, (await pg.evaluate(() => window.__xss)) === undefined && (await pg.$$('.prop .nm img, .phero img')).length === 0);
  check(`${w}: senza foto la casa ha una facciata disegnata, non una foto finta`, (await pg.$$('.prop .cov svg.fac')).length === 2 && (await pg.$$('.prop .cov img')).length === 0);
  check(`${w}: ogni sezione ha il suo emblema, «Richiede te» in oro`, (await pg.$$('.sh .emb')).length >= 5 && (await pg.$('#s-needs .emb.gold')) !== null);
  // il polso: 12 mesi, la tabella per chi non vede il grafico, il tooltip
  check(`${w}: grafico dei canoni su 12 mesi con la tabella equivalente`, (await pg.$$('.chart[data-c="home"] .bc')).length === 12 && (await pg.$$('.chart[data-c="home"] table.sr tbody tr')).length === 12);
  await pg.evaluate(() => document.getElementById('s-money').scrollIntoView());
  await pg.click('.chart[data-c="home"] .bc.cur');
  const tip = await pg.textContent('.chart[data-c="home"] .tip');
  // settembre: rata scaduta il 5 e non pagata al 30 → in ritardo, in rosso (mai «in arrivo»)
  check(`${w}: tocco su una barra → il mese con l'importo per stato`, /settembre 2026/i.test(tip) && /In ritardo/.test(tip) && !/In arrivo/.test(tip) && /1\.200/.test(tip), tip);
  check(`${w}: la rata in ritardo è una barra rossa`, (await pg.$('.chart[data-c="home"] .bc.cur .s.late')) !== null);
  // «dalla tua ultima visita»: il rendiconto di settembre è nuovo, la firma del conduttore anche
  const since = await pg.textContent('.since');
  check(`${w}: dalla tua ultima visita → 1 documento nuovo + la firma del conduttore`, /1 documento nuovo/.test(since) && /Il conduttore ha firmato/.test(since), since);
  await pg.click('.since .chip.new[data-tab="new"]');
  const newRows = await pg.$$eval('#dres .dlink', (n) => n.map((x) => x.textContent));
  check(`${w}: il chip apre i documenti nuovi (solo quelli)`, newRows.length === 1 && /Rendiconto/.test(newRows[0]) && (await pg.$('#dres .dlink .ic.new')) !== null, newRows.join('|'));
  await pg.click('.tabs [data-tab="all"]');
  const dockShown = await pg.evaluate(() => { const d = document.getElementById('dock'); return !d.hidden && getComputedStyle(d).display !== 'none'; });
  check(`${w}: il dock c'è solo su telefono`, w < 761 ? dockShown : !dockShown);
  if (w < 761) {
    await pg.click('[data-dock="s-docs"]');
    await pg.waitForTimeout(900);
    check(`${w}: dock → Documenti porta lì e si accende`, (await pg.getAttribute('[data-dock="s-docs"]', 'aria-current')) === 'true' && await pg.evaluate(() => document.getElementById('s-docs').getBoundingClientRect().top < innerHeight / 2));
  }
  check(`${w}: i documenti recenti e il rendiconto nella ricerca`, /Contratto firmato|Rendiconto/.test(await pg.textContent('#dres')));
  await pg.fill('#dsearch', 'f24');
  check(`${w}: la ricerca filtra i documenti`, (await pg.$$('#dres .dlink')).length === 1);
  check(`${w}: nessuno scroll orizzontale`, await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  // dettaglio: Levico (firmato) → conduttore visibile; Cavour (in firma) → chiuso
  await pg.click('.prop:has-text("Levico")');
  await pg.waitForSelector('.fh');
  const folders = await pg.$$eval('.fh', (n) => n.map((x) => x.textContent));
  check(`${w}: cartelle Contratto / Fiscale / Conduttore / Immobile`, folders.some((f) => /Contratto/.test(f)) && folders.some((f) => /Conduttore/.test(f)) && folders.some((f) => /Immobile/.test(f)), folders.join('|'));
  check(`${w}: i link dei documenti aprono in una scheda nuova, senza opener`, await pg.$$eval('.dlink', (n) => n.every((a) => a.target === '_blank' && /noopener/.test(a.rel))));
  check(`${w}: storia fatta di fatti (chiavi consegnate)`, /Chiavi consegnate/.test(await pg.textContent('#app')));
  check(`${w}: fascicolo dell'immobile a 4 caselle, APE già archiviato (1/4)`, (await pg.$$('#s-dossier .slot')).length === 4 && (await pg.$$('#s-dossier .slot.ok')).length === 1 && /1\/4/.test(await pg.textContent('#s-dossier .cnt')));
  check(`${w}: nessuno scroll orizzontale nel dettaglio`, await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await pg.click('[data-home]');
  await pg.click('.prop:has-text("Cavour")');
  await pg.waitForSelector('.lockn');
  check(`${w}: a contratto non firmato il conduttore è chiuso e lo si spiega`, /diventano visibili quando il contratto è firmato/.test(await pg.textContent('.lockn')) && !/marco/.test(await pg.content()));
  check(`${w}: contratto non ancora iniziato → niente «€0 incassati» in testa, il canone`, /Canone mensile/.test(await pg.textContent('.pulse .pk')) && !/€0\b/.test(await pg.textContent('.pulse .pnum')));
  // EN a un tocco
  await pg.click('#langBtn');
  check(`${w}: EN a un tocco`, /Tenant|Lease/.test(await pg.textContent('#app')) && (await pg.textContent('#langBtn')) === 'IT');
  // upload dove manca: visura su Cavour
  await pg.click('#langBtn');
  const hooks = {};
  await ctx.close();
  const b = await page(w, h, '/owner#immobile/p2', hooks);
  await b.pg.waitForSelector('[data-up]');
  const [chooser] = await Promise.all([b.pg.waitForEvent('filechooser'), b.pg.click('[data-up*="visura"]')]);
  await chooser.setFiles({ name: 'visura.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await b.pg.waitForFunction(() => (window.__toasts || []).length > 0, null, { timeout: 5000 });
  check(`${w}: caricamento della visura → POST col token del proprietario`, hooks.upload && hooks.upload.propertyId === 'p2' && hooks.upload.slot === 'visura' && /^data:application\/pdf;base64,/.test(hooks.upload.base64) && hooks.uploadAuth === 'Bearer TOK');
  check(`${w}: nessun errore JS`, errors.length === 0 && b.errors.length === 0, errors.concat(b.errors).join(' | '));
  await b.ctx.close();
}

// ── movimento ridotto: tutto al valore finale, subito ───────────────────
console.log('\n── reduced motion');
{
  const hooks = { rm: 'reduce' };
  const { pg, ctx, errors } = await page(390, 844, '/owner', hooks);
  await pg.waitForSelector('.verdict');
  check('reduced motion: il numero è già quello vero, senza conteggio', /1\.200/.test(await pg.textContent('.pulse .pnum')));
  check('reduced motion: niente sezioni invisibili in attesa di un\'animazione', await pg.$$eval('#app .rv', (n) => n.every((x) => getComputedStyle(x).opacity === '1')));
  check('reduced motion: nessun errore JS', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ── la demo pubblica: il convertitore è l'area vera ──────────────────────
console.log('\n── demo');
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const hooks = {};
  const { pg, ctx, errors } = await page(w, h, '/owner?demo=1', hooks);
  await pg.waitForSelector('.verdict', { timeout: 8000 });
  check(`demo ${w}: nastro «esempio dal vivo» con la chiamata all'azione`, /Esempio dal vivo/.test(await pg.textContent('.demo-rib')) && (await pg.$('.demo-rib a[href*="wa.me"]')) !== null);
  check(`demo ${w}: nessuna porta del server, nessun Firebase`, !hooks.reqs.some((u) => /\/api\/|gstatic\.com/.test(u)), hooks.reqs.filter((u) => /\/api\/|gstatic/.test(u)).join(' '));
  check(`demo ${w}: la cassaforte la calcola il motore vero (due case, due cose da fare)`, (await pg.$$('.prop')).length === 2 && /2 cose richiedono te/.test(await pg.textContent('.verdict')));
  const before = pg.url();
  await pg.click('#dres .dlink');
  await pg.waitForTimeout(150);
  check(`demo ${w}: un documento d'esempio non porta a un file inesistente, lo dice`, pg.url() === before && (await pg.evaluate(() => (window.__toasts || []).some((m) => /area vera/.test(m)))));
  await pg.click('.prop:has-text("Trilocale")');
  await pg.waitForSelector('#s-dossier');
  check(`demo ${w}: fascicolo 3/4 prima`, /3\/4/.test(await pg.textContent('#s-dossier .cnt')));
  await pg.click('#s-dossier [data-up*="delega"]');
  await pg.waitForFunction(() => /4\/4/.test((document.querySelector('#s-dossier .cnt') || {}).textContent || ''), null, { timeout: 5000 });
  check(`demo ${w}: «carica» chiude il fascicolo (4/4) senza mandare niente a nessuno`, /Fascicolo completo/.test(await pg.textContent('#s-dossier')) && !hooks.reqs.some((u) => /\/api\//.test(u)));
  check(`demo ${w}: nessuno scroll orizzontale`, await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  check(`demo ${w}: nessun errore JS`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ── attivazione dal link dell'invito ─────────────────────────────────────
console.log('\n── attivazione');
{
  const hooks = {};
  const { pg, ctx, errors } = await page(390, 844, '/owner?attiva=uid_9.' + 'a'.repeat(32), hooks);
  await pg.waitForSelector('#aPwd');
  check('il link mostra l\'email con cui si entrerà', (await pg.inputValue('#aEmail')) === 'anna@own.it');
  await pg.fill('#aPwd', 'unaPasswordMoltoLunga!');
  check('la forza della password si vede mentre la scrivi', /Ottima/.test(await pg.textContent('#aMlab')));
  await pg.click('.eye');
  check('l\'occhio mostra la password (entrambi i campi)', (await pg.getAttribute('#aPwd', 'type')) === 'text' && (await pg.getAttribute('#aPwd2', 'type')) === 'text');
  await pg.click('.eye');
  await pg.fill('#aPwd', 'corta'); await pg.fill('#aPwd2', 'corta'); await pg.click('#aGo');
  check('password corta → rifiutata prima di chiamare il server', /almeno 8/.test(await pg.textContent('#aMsg')) && hooks.act.filter((x) => x.op === 'set').length === 0);
  await pg.fill('#aPwd', 'unaPasswordLunga!'); await pg.fill('#aPwd2', 'altraPassword!!'); await pg.click('#aGo');
  check('password diverse → rifiutate', /non coincidono/.test(await pg.textContent('#aMsg')));
  await pg.fill('#aPwd2', 'unaPasswordLunga!'); await pg.click('#aGo');
  await pg.waitForSelector('.verdict', { timeout: 8000 });
  check('attivazione → entra con la password scelta e apre l\'area', (await pg.evaluate(() => window.__signIn)).p === 'unaPasswordLunga!' && hooks.act.some((x) => x.op === 'set'));
  check('il link sparisce dalla barra dell\'indirizzo', !/attiva=/.test(pg.url()));
  check('attivazione: nessun errore JS', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close(); srv.close();
console.log(`\n${passed} passati, ${failed} falliti`);
if (failed) { console.log('FALLITI:\n - ' + bad.join('\n - ')); process.exit(1); }
