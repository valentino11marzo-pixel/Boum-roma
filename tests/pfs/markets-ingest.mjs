// tests/pfs/markets-ingest.mjs — IL RADAR PER MERCATO, il giro vero.
//
// Gli handler VERI (api/pfs/scan-inbox, api/homie/property,
// api/casafari/import, api/market/pulse, api/meteo, e — in sola lettura —
// api/leads/scan-inbox) su un Firestore in memoria; si finge SOLO la rete:
// IMAP (imapflow sostituito da una casella in memoria; mailparser è quello
// vero), Firestore REST, Telegram, Anthropic.
//
// Cosa deve essere vero, e cosa lo dimostra:
//   - un alert idealista.com di Madrid finisce SOLO nel mazzo della cliente di
//     Madrid; la cliente romana (con zona 'centro', il caso del difetto) mai;
//   - un alert romano non arriva mai alla cliente di Madrid;
//   - la città incerta (due città nel testo) o in conflitto (alias contro
//     testo) non si ingerisce: va fra i "da verificare";
//   - la zona di Madrid è canonica ('Madrid · Centro' → slug madrid-centro),
//     anche quando la fonte manda un 'Centro' nudo, e l'oggetto dell'email
//     (che porta il nome della ricerca) non diventa mai una zona;
//   - le statistiche di zona portano la città, i candidati mandato e il
//     bollettino pubblico restano di Roma;
//   - il volume di Madrid non affama Roma (tetti per gruppo);
//   - lo scanner dei LEAD (non toccato) non spende un token sugli alert
//     spagnoli.
// Ogni guardia è provata per MUTAZIONE (in coda): il sorgente vero viene
// riscritto al caricamento, la suite deve cadere. Due mutazioni a una guardia
// sola devono invece PASSARE: sono le due cinture della stessa regola.
//
// Fixture SINTETICHE: vedi fixtures/idealista-es.mjs per cosa è verificato e
// cosa no del formato delle email.
//
// node tests/pfs/markets-ingest.mjs

import { register, Module } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const MUT = process.env.BOOM_MARKETS_MUTATION || '';

// ── Le mutazioni: [file, testo vero, testo rotto]. cjs = js/*.js (UMD). ─────
const MUTATIONS = {
  // le due cinture della stessa regola, TOLTE INSIEME → deve cadere
  both_guards: [
    ['/api/pfs/_ingest.js', 'clients = clients.filter(c => RM.clientMarket(c) === market);', ''],
    ['/api/homie/_match.js', 'if (!cm || pm !== cm) {', 'if (false) {'],
  ],
  twin: [['/js/radar-engine.js', "if ((a.market || 'roma') !== (b.market || 'roma')) return { score: 0, why: ['mercati diversi'], reject: true };", '', 'cjs']],
  es_street: [['/js/radar-engine.js', "if (market && market !== 'roma') return streetOfEs(x);", '', 'cjs']],
  zone_ns: [['/api/pfs/_ingest.js', 'const fromRaw = canonicalZone(raw.zone, market);', 'const fromRaw = raw.zone || null;']],
  caps: [['/api/pfs/scan-inbox.js', '.sort((a, b) => a - b).slice(-MAX_CITY_MESSAGES);', '.sort((a, b) => a - b);']],
  es_negatives: [['/api/pfs/_alertparse.js', 'if (/mensaje|contacto|te ha escrito|respuesta|tu anuncio|factura|contrase|verifica|bienvenid|valoraci|desactiv|caducad|newsletter/i.test(s)) {', 'if (false) {']],
  subject_title: [['/api/pfs/scan-inbox.js', 'title: city ? (l.title || null) : (title || subject.slice(0, 120)),', 'title: l.title || title || subject.slice(0, 120),']],
  unknown_market: [['/api/pfs/scan-inbox.js', 'if (!mres.market) {', 'if (false) {']],
  pulse_rome: [['/api/market/pulse.js', ".filter(l => (l.market || 'roma') === 'roma')", '']],
  meteo_rome: [['/api/meteo.js', "if (d.market && d.market !== 'roma') continue;", '']],
  casafari_force: [['/api/casafari/import.js', 'if (!listingMarket || listingMarket !== clientMkt) {', 'if (false) {']],
  // la revisione del 25/10
  legacy_first: [
    ['/js/radar-markets.js', "if (aliasU) return { market: aliasU, via: 'alias' };", '', 'cjs'],
    ['/js/radar-markets.js', "if (saidU) return { market: saidU, via: 'text' };", '', 'cjs'],
  ],
  es_not_needs_city: [['/js/radar-markets.js', "/\\.(es|cat)$/.test(h)) return 'needs_city';", "/\\.(es|cat)$/.test(h)) return undefined;", 'cjs']],
  // la seconda cintura di match-test, tolta INSIEME al punteggio → deve cadere
  both_guards_match: [
    ['/api/admin/match-test.js', 'if (RM.clientMarket(client) !== testMarket) {', 'if (false) {'],
    ['/api/homie/_match.js', 'if (!cm || pm !== cm) {', 'if (false) {'],
  ],
  alias_seed: [['/api/pfs/scan-inbox.js', '    const emailMarkets = new Set();', '    const emailMarkets = new Set(aliasMarket ? [aliasMarket] : []);']],
  city_search_first: [['/api/pfs/scan-inbox.js', '      for (const from of SENDERS) {', '      for (const from of SENDERS.concat(CITY_SENDERS)) {']],
  market_changed_sticky: [['/api/pfs/sync-searches.js', "} else if (existing.enabled === false && existing.disabledReason === 'market_changed') {", '} else if (false) {']],
  scan_market_city: [['/api/pfs/scan-market.js', '      .filter(s => !CITY_ONLY_PORTALS.has(s.portal))\n', '']],
  valuta_cross: [['/api/radar/valuta.js', "const signedApplies = zoneMarket === 'roma';", 'const signedApplies = true;']],
  pulse_backlog: [['/api/market/pulse.js', '    if (!isRome(l)) return false;\n', '']],
  brief_agencies: [['/api/pfs/brief.js', "p.advertiser === 'agency' && RM.agencyPolicy(propCity(p)) === 'drop'", "p.advertiser === 'agency'"]],
  // UNA cintura sola tolta → la suite deve restare VERDE (l'altra regge)
  only_filter: [['/api/pfs/_ingest.js', 'clients = clients.filter(c => RM.clientMarket(c) === market);', '']],
  only_score: [['/api/homie/_match.js', 'if (!cm || pm !== cm) {', 'if (false) {']],
};
const EXPECT_GREEN = new Set(['only_filter', 'only_score']);

// ── IMAP finto + mutazioni ESM (thread dei loader) ──────────────────────────
const IMAP_STUB = `export class ImapFlow {
  constructor(o){ this.o=o; (globalThis.__imap.clients||(globalThis.__imap.clients=[])).push(o); }
  async connect(){ if(globalThis.__imap.down) throw new Error('imap down'); }
  async getMailboxLock(){ return { release(){} }; }
  async search(q){ if(globalThis.__imap.onSearch) globalThis.__imap.onSearch(q); const f=String(q.from||'').toLowerCase(); return globalThis.__imap.box.filter(m=>m.from.toLowerCase().includes(f)).map(m=>m.uid); }
  async fetchOne(uid){ const m=globalThis.__imap.box.find(x=>String(x.uid)===String(uid)); return m?{source:Buffer.from(m.raw)}:false; }
  async fetchAll(range){ const want=String(range).split(',').map(Number); const h=(m,k)=>((m.raw.match(new RegExp('^'+k+':(.*)$','mi'))||[])[1]||'').trim();
    return globalThis.__imap.box.filter(m=>want.includes(m.uid)).map(m=>({uid:m.uid,envelope:{subject:h(m,'Subject'),messageId:h(m,'Message-ID'),date:h(m,'Date')||null}})); }
  async logout(){}
}`;
const esmChanges = MUT ? (MUTATIONS[MUT] || []).filter((c) => c[3] !== 'cjs') : [];
const cjsChanges = MUT ? (MUTATIONS[MUT] || []).filter((c) => c[3] === 'cjs') : [];
if (MUT && !MUTATIONS[MUT]) { console.error('mutazione sconosciuta: ' + MUT); process.exit(3); }
register('data:text/javascript,' + encodeURIComponent(
  `const STUB=${JSON.stringify('data:text/javascript,' + encodeURIComponent(IMAP_STUB))};
   const CH=${JSON.stringify(esmChanges)};
   export async function resolve(s,c,next){ if(s==='imapflow') return {url:STUB,shortCircuit:true}; return next(s,c); }
   export async function load(url,c,next){
     const out=await next(url,c);
     const mine=CH.filter(x=>url.endsWith(x[0]));
     if(!mine.length) return out;
     let src=String(out.source);
     for(const [f,a,b] of mine){ if(!src.includes(a)) throw new Error('MUTATION_BOUNDARY_MISSING '+f); src=src.replace(a,b); }
     return {...out, source: src+'\\n;globalThis.__mutApplied=(globalThis.__mutApplied||0)+'+mine.length+';'};
   }`), import.meta.url);
if (cjsChanges.length) {
  const orig = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    for (const [f, a, b] of cjsChanges) {
      if (filename.endsWith(f)) {
        if (!content.includes(a)) throw new Error('MUTATION_BOUNDARY_MISSING ' + f);
        content = content.replace(a, b);
        globalThis.__mutApplied = (globalThis.__mutApplied || 0) + 1;
      }
    }
    return orig.call(this, content, filename);
  };
}

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

// ── Firestore in memoria (REST), identitytoolkit, Telegram, Anthropic ──────
const DB = new Map();
const TG = [];
let anthropicCalls = 0;
const EXTERNAL = [];   // ogni fetch fuori da Firestore/Telegram/Anthropic (detail page dei portali)
const enc = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { stringValue: String(v) };
};
const dec = (f) => {
  if (!f) return null;
  if ('nullValue' in f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return null;
};
const toDoc = (path, data) => ({ name: `projects/p/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) });
let autoId = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (u.includes('identitytoolkit')) return json({ idToken: 'fake', localId: 'admin', expiresIn: '3600' });
  if (u.includes('api.telegram.org')) { try { TG.push(JSON.parse(opts.body).text); } catch { TG.push(''); } return json({ ok: true }); }
  if (u.includes('api.anthropic.com')) { anthropicCalls++; return json({ content: [{ type: 'text', text: '{"name":null}' }], usage: { input_tokens: 1, output_tokens: 1 } }); }
  if (!u.includes('firestore.googleapis.com')) { EXTERNAL.push(u); return new Response('not found', { status: 404 }); }
  const body = opts.body ? JSON.parse(opts.body) : null;
  const m = u.match(/documents\/([^?:]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';
  if (u.includes(':runQuery')) {
    const q = body.structuredQuery;
    const coll = q.from[0].collectionId;
    const f = q.where && q.where.fieldFilter;
    let rows = [...DB.entries()].filter(([k]) => k.startsWith(coll + '/') && k.split('/').length === 2)
      .filter(([, v]) => !f || String(v[f.field.fieldPath]) === String(dec(f.value)));
    if (q.limit) rows = rows.slice(0, q.limit);
    return json(rows.map(([k, v]) => ({ document: toDoc(k, v) })));
  }
  if (u.includes(':commit') || u.includes(':batchGet')) return json({ writeResults: [] });
  if (opts.method === 'PATCH') {
    const prev = DB.get(path) || {};
    const next = { ...prev, ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) };
    DB.set(path, next);
    return json(toDoc(path, next));
  }
  if (opts.method === 'POST') {
    const want = (u.match(/documentId=([^&]+)/) || [])[1];
    const id = want ? decodeURIComponent(want) : 'doc' + (++autoId);
    const p = `${path}/${id}`;
    if (want && DB.has(p)) return json({ error: { status: 'ALREADY_EXISTS' } }, 409);
    DB.set(p, Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])));
    return json(toDoc(p, DB.get(p)));
  }
  if (DB.has(path)) return json(toDoc(path, DB.get(path)));
  return json({ error: { status: 'NOT_FOUND' } }, 404);
};

Object.assign(process.env, {
  HOMIE_SECRET: 'test-secret', FIREBASE_API_KEY: 'k', FIREBASE_ADMIN_EMAIL: 'a@example.invalid', FIREBASE_ADMIN_PASS: 'p',
  GMAIL_USER: 'valentino@boom-rome.com', GMAIL_APP_PASS: 'synthetic', ANTHROPIC_API_KEY: 'synthetic-key',
  TELEGRAM_BOT_TOKEN: 'tg', TELEGRAM_CHAT_ID: '1',
});
delete process.env.PFS_IMAP_USER; delete process.env.PFS_IMAP_PASS; delete process.env.CRON_SECRET;
globalThis.__imap = { box: [] };

const FX = await import('./fixtures/idealista-es.mjs');
const P2 = await import('../../api/pfs/_alertparse.js');
const { default: scanInbox } = await import('../../api/pfs/scan-inbox.js');
const { stableIdFromUrl } = await import('../../api/pfs/_ingest.js');
const { _resetTapCaches } = await import('../../api/radar/_tap.js');
const { default: homieProperty } = await import('../../api/homie/property.js');
const { default: casafariImport } = await import('../../api/casafari/import.js');
const { default: pulse } = await import('../../api/market/pulse.js');
const { default: meteo } = await import('../../api/meteo.js');
const { default: leadsScan } = await import('../../api/leads/scan-inbox.js');
const { default: matchTest } = await import('../../api/admin/match-test.js');
const { default: syncSearches } = await import('../../api/pfs/sync-searches.js');
const { default: scanMarket } = await import('../../api/pfs/scan-market.js');
const { default: homieSearches } = await import('../../api/homie/searches.js');
const { default: valuta } = await import('../../api/radar/valuta.js');
const { default: brief } = await import('../../api/pfs/brief.js');
await import('../../js/radar-engine.js');

if (MUT) {
  const want = MUTATIONS[MUT].length;
  const got = globalThis.__mutApplied || 0;
  if (got !== want) { console.log(`MUTATION_BOUNDARY_MISSING ${MUT} ${got}/${want}`); process.exit(3); }
  console.log(`MUTATION_APPLIED ${MUT} ${got}/${want}`);
}

const call = (handler, { method = 'POST', body = null, headers = {}, query = {} } = {}) => new Promise((resolve, reject) => {
  const req = { method, headers: { 'x-homie-secret': 'test-secret', ...headers }, body, query };
  const res = {
    _s: 200, _h: {},
    status(c) { this._s = c; return this; },
    setHeader(k, v) { this._h[k] = v; },
    json(o) { resolve({ status: this._s, body: o }); },
    end() { resolve({ status: this._s, body: null }); },
  };
  Promise.resolve(handler(req, res)).catch(reject);
});
const idOf = (url) => stableIdFromUrl(url);
const ES = (id) => `https://www.idealista.com/inmueble/${id}/`;
const deck = (cid) => (DB.get('pfsClients/' + cid).portalProperties || []).map((p) => p.id);
const box = (raws) => raws.map((raw, i) => ({ uid: i + 1, raw, from: (raw.match(/^From: (.*)$/m) || [])[1] || '' }));

function seedClients() {
  for (const k of [...DB.keys()]) if (k.startsWith('pfsClients/')) DB.delete(k);
  DB.set('pfsClients/cl_rome', { name: 'Giulia Roma', stage: 'searching', budget: 1500, zone: 'centro', bedrooms: '1', portalProperties: [], portalActivity: [] });
  DB.set('pfsClients/cl_mad', { name: 'Lucía Madrid', market: 'madrid', stage: 'searching', budget: 1500, zone: 'Chamberí, Malasaña', bedrooms: '1', portalProperties: [], portalActivity: [] });
  DB.set('pfsClients/cl_bcn', { name: 'Jordi BCN', market: 'barcelona', stage: 'searching', budget: 1800, zone: 'Gràcia, Eixample', bedrooms: '2', portalProperties: [], portalActivity: [] });
  DB.set('pfsClients/cl_typo', { name: 'Refuso', market: 'madird', stage: 'searching', budget: 9000, portalProperties: [], portalActivity: [] });
}

console.log('\n── 1. Gli alert della casella → i mazzi giusti ──────────────');
seedClients();
globalThis.__imap.box = box([FX.ES.a(), FX.ES.a2(), FX.ES.b(), FX.ES.c(), FX.ES.d(), FX.ES.d2(), FX.ES.g(), FX.ES.h(), FX.ES.i(), FX.IT_ROME()]);
const romeUrl = 'https://www.idealista.it/immobile/31000011/';
{
  const r = await call(scanInbox);
  const st = r.body && r.body.stats;
  ok('scan-inbox: 200 ok', r.status === 200 && r.body.ok === true, r.body);
  const mad = deck('cl_mad');
  ok('Madrid: i quattro annunci di Madrid nel mazzo di Lucía (alias, riepilogo, testo)',
    [100000001, 100000002, 100000003, 100000004].every((n) => mad.includes(idOf(ES(n)))), mad);
  const rome = deck('cl_rome');
  ok('Roma: nel mazzo di Giulia SOLO l\'annuncio romano (la cliente con zona "centro" del difetto)', rome.length === 1 && rome[0] === idOf(romeUrl), rome);
  ok('un alert romano non arriva mai alla cliente di Madrid', !mad.includes(idOf(romeUrl)));
  const bcn = deck('cl_bcn');
  ok('Barcellona: alias + oggetto neutro e alias + oggetto vero → mazzo di Jordi', bcn.includes(idOf(ES(100000006))) && bcn.includes(idOf(ES(100000009))) && bcn.length === 2, bcn);
  ok('nessun annuncio di Madrid a Barcellona e viceversa', !bcn.some((x) => mad.includes(x)));
  ok('cliente col mercato scritto male: niente, da nessuna città', deck('cl_typo').length === 0);

  const pa = DB.get('pfsProperties/' + idOf(ES(100000001)));
  ok('il master porta città, prova, zona canonica, inserzionista ignoto', pa && pa.market === 'madrid' && pa.marketVia === 'alias' && pa.zone === 'Madrid · Centro' && pa.advertiser === 'unknown', pa);
  ok('…e il titolo è quello del CORPO, mai l\'oggetto', pa && /^Piso en Calle de Santa Cruz/.test(pa.title || ''), pa && pa.title);
  const led = DB.get('marketListings/' + idOf(ES(100000001)));
  ok('libro mastro: slug madrid-centro e città', led && led.zoneSlug === 'madrid-centro' && led.market === 'madrid', led);
  const pc = DB.get('pfsProperties/' + idOf(ES(100000004)));
  ok('senza alias la città la dice il testo (marketVia text)', pc && pc.market === 'madrid' && pc.marketVia === 'text', pc);
  const p3 = DB.get('pfsProperties/' + idOf(ES(100000003)));
  ok('riepilogo inglese: il ribasso non è il canone (1690), zona Chamberí', p3 && p3.price === 1690 && p3.zone === 'Madrid · Chamberí', p3);
  const a2 = DB.get('pfsProperties/' + idOf(ES(100000007)));
  ok('corpo senza titolo: zona e titolo NULL (l\'oggetto "Chamberí" non diventa zona)', a2 && a2.zone === null && a2.title === null, a2);
  ok('due città nel testo → mai ingerito', !DB.has('pfsProperties/' + idOf(ES(100000005))));
  ok('alias contro testo → mai ingerito', !DB.has('pfsProperties/' + idOf(ES(100000008))));
  ok('"Te ha escrito…" all\'alias → mai un annuncio', !DB.has('pfsProperties/' + idOf(ES(100000099))));
  const att = (DB.get('pfsRadarHealth/inbox') || {}).needsAttention || [];
  ok('…e i due incerti sono "da verificare" col perché', att.some((x) => x.sourceUrl === ES(100000005) && x.reason === 'market_unknown')
    && att.some((x) => x.sourceUrl === ES(100000008) && x.reason === 'market_conflict'), att);
  const pr = DB.get('pfsProperties/' + idOf(romeUrl));
  // Roma com'era: senza pagina di dettaglio il titolo resta l'OGGETTO (e qui
  // l'oggetto "…: Centro" non dà zona: il lessico romano non ha 'centro'
  // nudo). Cambia solo l'aggiunta della città.
  ok('Roma: il master romano porta market roma; titolo e zona come prima (oggetto, nessuna zona)',
    pr && pr.market === 'roma' && pr.marketVia === 'domain' && pr.title === 'Nuovo appartamento di un privato della tua ricerca: Centro' && pr.zone === null, pr);

  // madrid 4, non 5: l'email (d2) arrivata all'alias di Madrid con un annuncio
  // di Barcellona (conflitto) NON dimostra che il flusso di Madrid sia vivo —
  // conta solo un'email con un annuncio che si è risolto lì.
  ok('stats per città: madrid 4 alert, barcellona 2, roma 1', st && st.byMarket.madrid.alerts === 4 && st.byMarket.barcelona.alerts === 2 && st.byMarket.roma.alerts === 1, st && st.byMarket);
  ok('stats: 2 annunci con città sconosciuta', st && st.marketUnknown === 2, st);
  const hm = DB.get('pfsRadarHealth/inbox-madrid');
  ok('battito inbox-madrid: ok, 1 cliente attivo (il refuso non conta), alert visto ora', hm && hm.ok === true && hm.stats.activeClients === 1 && !!hm.lastAlertEmailAt && !!hm.activeSince, hm);
  ok('battito inbox-barcelona scritto', (DB.get('pfsRadarHealth/inbox-barcelona') || {}).ok === true);
  const tgMad = TG.find((t) => /Match pronto/.test(t) && /Santa Cruz de Marcenado/.test(t));
  ok('Telegram: il match di Madrid porta 🇪🇸 Madrid davanti', tgMad && /🇪🇸 Madrid ·/.test(tgMad), tgMad);
  const tgRome = TG.find((t) => /Match pronto/.test(t) && /della tua ricerca: Centro/.test(t));
  ok('Telegram: il match romano resta com\'era (nessuna città davanti)', tgRome && /^🏠 <b>Match pronto!<\/b>/.test(tgRome), tgRome);
  ok('nessun detail fetch verso idealista.com (IP datacenter: mai)', !EXTERNAL.some((x) => /idealista\.com/.test(x)), EXTERNAL);
}

console.log('\n── 1b. L\'ora dell\'ultimo alert è la data dell\'EMAIL ──────');
{
  // La casella si rilegge per 3 giorni: un alert vecchio riletto non prova
  // che la ricerca salvata sia viva. Fixture (h): alias SOLO in Delivered-To.
  const HB = 'pfsRadarHealth/inbox-barcelona';
  DB.delete(HB);
  const t30 = Date.now() - 30 * 3600e3;
  globalThis.__imap.box = box([FX.ES.h({ date: t30 })]);
  await call(scanInbox);
  let hb = DB.get(HB) || {};
  ok('alert riletto di 30h fa: lastAlertEmailAt = la data dell\'email, non l\'ora del giro (e ancora ok)',
    hb.ok === true && Math.abs(+new Date(hb.lastAlertEmailAt) - t30) < 2000, hb);
  globalThis.__imap.box = box([FX.ES.h({ date: Date.now() - 60 * 3600e3 })]);
  await call(scanInbox);
  hb = DB.get(HB) || {};
  ok('un alert più VECCHIO riletto non fa arretrare l\'ora', Math.abs(+new Date(hb.lastAlertEmailAt) - t30) < 2000, hb);
  DB.set(HB, { activeSince: new Date(Date.now() - 72 * 3600e3).toISOString(), lastAlertEmailAt: null });
  globalThis.__imap.box = box([FX.ES.h({ date: Date.now() - 60 * 3600e3 })]);
  await call(scanInbox);
  hb = DB.get(HB) || {};
  ok('solo un alert di 60h fa, cliente attivo da 72h → guasto detto col perché', hb.ok === false && /48h/.test(hb.lastError || ''), hb);
  DB.delete(HB);
}

console.log('\n── 2. Lo scanner dei LEAD non spende sugli alert spagnoli ───');
{
  const before = [...DB.keys()].filter((k) => k.startsWith('leads/')).length;
  anthropicCalls = 0;
  const r = await call(leadsScan, { method: 'GET' });
  const after = [...DB.keys()].filter((k) => k.startsWith('leads/')).length;
  ok('leads/scan-inbox: 0 chiamate al modello e 0 lead sugli alert di questa casella', r.status === 200 && anthropicCalls === 0 && after === before, { status: r.status, anthropicCalls, before, after, stats: r.body && r.body.stats });
}

console.log('\n── 3. Le porte di Homie: agenzie, refusi, zona canonica ─────');
{
  TG.length = 0;
  const ag = await call(homieProperty, { body: { sourceUrl: ES(100000201), source: 'idealista_es', market: 'madrid', price: 1400, bedrooms: 1, advertiser: 'agency', title: 'Piso en Calle de Ponzano, Chamberí, Madrid' } });
  ok('Madrid: un annuncio d\'AGENZIA passa (Full Search promette le agenzie) ed è segnato', ag.status === 200 && ag.body.droppedAgency === false
    && deck('cl_mad').includes(idOf(ES(100000201))), ag.body);
  const entry = (DB.get('pfsClients/cl_mad').portalProperties || []).find((p) => p.id === idOf(ES(100000201)));
  ok('…la voce del mazzo dice città e inserzionista', entry && entry.market === 'madrid' && entry.advertiser === 'agency', entry);
  ok('…e la card Telegram lo dice ("🏢 agencia")', TG.some((t) => /agencia — verificar honorarios/.test(t)));
  const agR = await call(homieProperty, { body: { sourceUrl: 'https://www.immobiliare.it/annunci/31000202/', source: 'immobiliare', price: 1300, bedrooms: 1, advertiser: 'agency', zone: 'Centro Storico', title: 'Bilocale centro storico' } });
  ok('Roma: l\'agenzia resta scartata come prima', agR.status === 200 && agR.body.droppedAgency === true && !deck('cl_rome').includes(idOf('https://www.immobiliare.it/annunci/31000202/')), agR.body);
  const bad = await call(homieProperty, { body: { sourceUrl: ES(100000202), source: 'idealista_es', market: 'paris', price: 1000 } });
  ok('una città spenta dichiarata → 400', bad.status === 400, bad.body);
  const unk = await call(homieProperty, { body: { sourceUrl: ES(100000203), source: 'idealista_es', price: 1000, title: 'Piso luminoso' } });
  ok('idealista.com senza città → 200 marketUnknown, nessun push', unk.status === 200 && unk.body.marketUnknown === true && unk.body.pushedTo.length === 0, unk.body);
  // L'annuncio rimasto senza città torna CON la città dentro la finestra di
  // freschezza: non è un ri-avvistamento, è la sua prima consegna.
  const again = await call(homieProperty, { body: { sourceUrl: ES(100000203), source: 'idealista_es', market: 'madrid', price: 1000, bedrooms: 1, title: 'Piso luminoso, Chamberí, Madrid', skipFreshHours: 12 } });
  const p203 = DB.get('pfsProperties/' + idOf(ES(100000203)));
  ok('città arrivata dopo: consegna piena (non skippedFresh), flag "sconosciuta" spento', again.status === 200 && !again.body.skippedFresh
    && deck('cl_mad').includes(idOf(ES(100000203))) && p203.market === 'madrid' && p203.marketUnknown === false, { body: again.body, p203 });
  const third = await call(homieProperty, { body: { sourceUrl: ES(100000203), source: 'idealista_es', market: 'madrid', price: 1000, bedrooms: 1, title: 'Piso luminoso, Chamberí, Madrid', skipFreshHours: 12 } });
  ok('…e il giro dopo è un normale ri-avvistamento', third.status === 200 && (third.body.pushedTo || []).length === 0 && deck('cl_mad').filter((x) => x === idOf(ES(100000203))).length === 1, third.body);
  const z = await call(homieProperty, { body: { sourceUrl: ES(100000204), source: 'idealista_es', market: 'madrid', price: 1450, bedrooms: 1, zone: 'Centro', title: 'Piso luminoso, Madrid' } });
  const pz = DB.get('pfsProperties/' + idOf(ES(100000204)));
  ok('un "Centro" nudo da Homie diventa Madrid · Centro (mai lo slug romano)', z.status === 200 && pz && pz.zone === 'Madrid · Centro' && pz.zoneRaw === 'Centro', pz);
  ok('…e nel libro mastro lo slug è madrid-centro', (DB.get('marketListings/' + idOf(ES(100000204))) || {}).zoneSlug === 'madrid-centro');
}

console.log('\n── 4. Le gemelle non attraversano le città ──────────────────');
{
  _resetTapCaches();
  const rU = 'https://www.immobiliare.it/annunci/31000301/';
  await call(homieProperty, { body: { sourceUrl: rU, source: 'immobiliare', price: 1500, sqm: 60, bedrooms: 1, zone: 'Centro', title: 'Bilocale centro', advertiser: 'private' } });
  await call(homieProperty, { body: { sourceUrl: ES(100000301), source: 'idealista_es', market: 'madrid', price: 1500, sqm: 60, bedrooms: 1, zone: 'Madrid · Centro', title: 'Piso centro Madrid' } });
  const pm = DB.get('pfsProperties/' + idOf(ES(100000301)));
  ok('la casa di Madrid non entra nel cluster della casa romana (stesso prezzo, mq, "centro")',
    pm && pm.radar && pm.radar.clusterId === idOf(ES(100000301)), pm && pm.radar);
  ok('l\'indice dei recenti ricorda la città', ((DB.get('radarState/index') || {}).entries || []).some((e) => e.id === idOf(ES(100000301)) && e.market === 'madrid'));
  // Due case di Madrid su VIE diverse, stesso prezzo/mq/camere, da due fonti:
  // la regola "vie diverse = mai gemelle" deve valere anche per "Calle de …".
  const fcU = 'https://www.fotocasa.es/es/alquiler/vivienda/madrid-capital/x/100000602/d';
  await call(homieProperty, { body: { sourceUrl: ES(100000601), source: 'idealista_es', market: 'madrid', price: 1600, sqm: 70, bedrooms: 2, title: 'Piso en Calle de Ponzano, Chamberí, Madrid' } });
  await call(homieProperty, { body: { sourceUrl: fcU, source: 'manual', market: 'madrid', price: 1600, sqm: 70, bedrooms: 2, title: 'Piso en Calle de Santa Engracia, Chamberí, Madrid' } });
  const pf = DB.get('pfsProperties/' + idOf(fcU));
  ok('Madrid: vie diverse ("Calle de Ponzano" ≠ "Calle de Santa Engracia") → mai gemelle', pf && pf.market === 'madrid' && pf.radar && pf.radar.clusterId === idOf(fcU), pf && pf.radar);
}

console.log('\n── 5. «Proponi a…» (casafari/import) non attraversa le città ─');
{
  const romeBefore = JSON.stringify(DB.get('pfsClients/cl_rome').portalProperties);
  const r = await call(casafariImport, { body: { clientId: 'cl_rome', force: true, listing: { sourceUrl: ES(100000401), source: 'idealista_es', market: 'madrid', price: 1300, title: 'Piso en Calle X, Retiro, Madrid' } } });
  const res = r.body && r.body.results && r.body.results[0];
  ok('Madrid → cliente romana, anche con force: market_mismatch', res && res.error === 'market_mismatch' && res.listingMarket === 'madrid' && res.clientMarket === 'roma', r.body);
  ok('…nessuna scrittura: mazzo identico, nessun master', JSON.stringify(DB.get('pfsClients/cl_rome').portalProperties) === romeBefore && !DB.has('pfsProperties/' + idOf(ES(100000401))));
  const r2 = await call(casafariImport, { body: { clientId: 'cl_mad', force: true, listing: { sourceUrl: ES(100000402), source: 'idealista_es', market: 'madrid', price: 1300, title: 'Piso en Calle X, Retiro, Madrid' } } });
  ok('Madrid → cliente di Madrid: entra, con la città sulla voce', r2.body.results[0].pushed === true
    && (DB.get('pfsClients/cl_mad').portalProperties || []).some((p) => p.id === idOf(ES(100000402)) && p.market === 'madrid'), r2.body);
  const r3 = await call(casafariImport, { body: { clientId: 'cl_rome', force: true, listing: { sourceUrl: 'https://www.casafari.com/property/9900001', price: 1200, title: 'Bilocale Monti' } } });
  ok('Roma → cliente romana: come prima', r3.body.results[0].pushed === true, r3.body);
  const r4 = await call(casafariImport, { body: { clientId: 'cl_rome', force: true, listing: { sourceUrl: ES(100000403), source: 'idealista_es', price: 1300, title: 'Piso luminoso' } } });
  ok('idealista.com senza città → non diventa romano per difetto', r4.body.results[0].error === 'market_mismatch', r4.body);
}

console.log('\n── 6. Le statistiche portano la città; mandati e meteo restano di Roma ─');
{
  const old = new Date(Date.now() - 100 * 86400e3).toISOString();
  const fresh = new Date().toISOString();
  for (let i = 0; i < 6; i++) {
    DB.set('marketListings/mad' + i, { sourceUrl: ES(100000500 + i), source: 'idealista_es', market: 'madrid', zone: 'Madrid · Retiro', zoneSlug: 'madrid-retiro', price: 1200 + i * 50, sqm: 55 + i, status: 'active', advertiser: 'unknown', firstSeenAt: fresh, lastSeenAt: fresh });
    DB.set('marketListings/rom' + i, { sourceUrl: 'https://www.immobiliare.it/annunci/3100050' + i + '/', source: 'immobiliare', zone: 'Monti', zoneSlug: 'monti', price: 1300 + i * 40, sqm: 60 + i, status: 'active', advertiser: 'unknown', firstSeenAt: fresh, lastSeenAt: fresh });
  }
  DB.set('marketListings/madstale', { sourceUrl: ES(100000599), source: 'idealista_es', market: 'madrid', zone: 'Madrid · Retiro', zoneSlug: 'madrid-retiro', price: 1400, sqm: 60, status: 'active', advertiser: 'private', firstSeenAt: old, lastSeenAt: fresh });
  DB.set('marketListings/romstale', { sourceUrl: 'https://www.immobiliare.it/annunci/31000599/', source: 'immobiliare', zone: 'Monti', zoneSlug: 'monti', price: 1400, sqm: 60, status: 'active', advertiser: 'private', firstSeenAt: old, lastSeenAt: fresh });
  const r = await call(pulse, { method: 'GET' });
  ok('pulse: 200', r.status === 200 && r.body.ok === true, r.body);
  const sm = DB.get('marketStats/madrid-retiro'), sr = DB.get('marketStats/monti');
  ok('marketStats/madrid-retiro porta market madrid (e il suo campione)', sm && sm.market === 'madrid' && sm.asked && sm.asked.ok === true && sm.asked.sample === 7, sm);
  ok('marketStats/monti (righe di prima, senza città) porta market roma', sr && sr.market === 'roma' && sr.asked && sr.asked.sample === 7, sr);
  ok('le statistiche non si mescolano: Monti non conta Madrid', sr && sm && sr.activeCount === 7 && sm.activeCount === 7, { sr: sr && sr.activeCount, sm: sm && sm.activeCount });
  const items = ((DB.get('radarState/mandati') || {}).items || []).map((x) => x.id);
  ok('candidati mandato: il privato romano fermo sì, quello di Madrid MAI', items.includes('romstale') && !items.includes('madstale'), items);
  const mt = await call(meteo, { method: 'GET' });
  const slugs = (mt.body.zones || []).map((z) => z.slug).concat((mt.body.measuring || []).map((n) => n.toLowerCase()));
  ok('meteo pubblico: nessuna zona di Madrid o Barcellona', mt.status === 200 && slugs.includes('monti') && !slugs.some((s) => /madrid|barcelona/.test(s)), slugs);
}

console.log('\n── 7. Il volume di Madrid non affama Roma ───────────────────');
{
  seedClients();
  _resetTapCaches();
  const raws = [];
  for (let i = 0; i < 5; i++) raws.push(FX.romeBulk(i));
  for (let i = 0; i < 60; i++) raws.push(FX.madridBulk(i));
  globalThis.__imap.box = box(raws);   // uid 1-5 Roma (i più vecchi), 6-65 Madrid
  const r = await call(scanInbox);
  const st = r.body && r.body.stats;
  ok('tutte e 5 le email romane lette (Roma prima, col suo tetto)', st && st.byMarket.roma && st.byMarket.roma.alerts === 5, st && st.byMarket);
  ok('Madrid al suo tetto: 25 email, non 60', st && st.byMarket.madrid && st.byMarket.madrid.alerts === 25, st && st.byMarket);
  ok('email viste = 30', st && st.emailsSeen === 30, st);
  ok('la cliente romana ha i suoi 5, nessuno di Madrid', deck('cl_rome').length === 5, deck('cl_rome').length);
}

// ── La revisione del 25/10: le correzioni, sul giro vero ────────────────────
// match-test vuole un token Firebase vero: lo stub risponde all'«accounts:lookup».
const fetch0 = globalThis.fetch;
let anthropicBodies = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('accounts:lookup')) return new Response(JSON.stringify({ users: [{ localId: 'adm1' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.includes('api.anthropic.com')) { try { anthropicBodies.push(JSON.parse(opts.body)); } catch { /* */ } }
  return fetch0(url, opts);
};
DB.set('users/adm1', { role: 'admin', name: 'Admin' });
const admin = { authorization: 'Bearer token-admin' };

console.log('\n── 9. Il dominio che tace: l\'alias e il testo vengono prima di "è Roma" ─');
{
  seedClients();
  EXTERNAL.length = 0;
  // A. un alert Casafari arrivato all'alias di Madrid, link nativo casafari
  const html = '<html><body><p>Nueva propiedad para tu búsqueda</p>' +
    '<a href="https://www.casafari.com/property/98765432">Piso en Calle de la Magdalena, Centro, Madrid</a>' +
    '<p>1.300 € al mese</p><p>1 camera 55 m²</p></body></html>';
  globalThis.__imap.box = box([FX.rfc822({ from: 'Casafari <alerts@casafari.com>', to: FX.ALIAS_MADRID, deliveredTo: FX.ALIAS_MADRID, subject: 'Nuevas propiedades: Madrid Centro', html })]);
  await call(scanInbox);
  const pid = idOf('https://www.casafari.com/property/98765432');
  const pm = DB.get('pfsProperties/' + pid);
  ok('Casafari all\'alias di Madrid → market madrid (via alias), mai Roma legacy', pm && pm.market === 'madrid' && pm.marketVia === 'alias', pm && { market: pm.market, via: pm.marketVia });
  ok('…e finisce nel mazzo di Lucía, MAI in quello di Giulia (Roma)', deck('cl_mad').includes(pid) && !deck('cl_rome').includes(pid), { rome: deck('cl_rome'), mad: deck('cl_mad') });

  // C. «Aggiungi annuncio» della plancia: Fotocasa di Madrid
  seedClients();
  const fc = 'https://www.fotocasa.es/es/alquiler/vivienda/madrid-capital/ascensor/187654321/d';
  const r = await call(matchTest, { headers: admin, body: { dryRun: false, sourceUrl: fc, source: 'manual', price: 1300, bedrooms: 1, title: 'Piso en Calle de Atocha, Centro, Madrid', zone: 'Centro' } });
  ok('match-test, Fotocasa «…, Madrid»: alla cliente di Madrid, MAI alla romana (era: score 100 a Giulia)',
    r.status === 200 && (r.body.pushedTo || []).every((x) => x.clientId !== 'cl_rome') && deck('cl_mad').includes(idOf(fc)) && !deck('cl_rome').includes(idOf(fc)), { status: r.status, pushedTo: r.body.pushedTo });
  const fc2 = 'https://www.fotocasa.es/es/alquiler/vivienda/madrid-capital/ascensor/187654322/d';
  const r2 = await call(matchTest, { headers: admin, body: { dryRun: false, sourceUrl: fc2, source: 'manual', price: 1300, bedrooms: 1, title: 'Piso luminoso' } });
  ok('match-test, Fotocasa SENZA città: 400 market_unknown (mai Roma per difetto)', r2.status === 400 && r2.body.error === 'market_unknown', r2.body);
  const r3 = await call(matchTest, { headers: admin, body: { dryRun: false, sourceUrl: fc2, source: 'manual', price: 1300, bedrooms: 1, title: 'Piso luminoso', market: 'madrid' } });
  ok('…con la città dichiarata dal modale (market: madrid): alla cliente di Madrid', r3.status === 200 && deck('cl_mad').includes(idOf(fc2)) && !deck('cl_rome').includes(idOf(fc2)), r3.body);
  // il «da verificare» market_unknown di scan-inbox, ingerito con la città dichiarata
  const r4 = await call(matchTest, { headers: admin, body: { dryRun: true, sourceUrl: ES(100000005), source: 'idealista_es', price: 1100 } });
  const r5 = await call(matchTest, { headers: admin, body: { dryRun: true, sourceUrl: ES(100000005), source: 'idealista_es', price: 1100, market: 'barcelona' } });
  ok('un «da verificare» market_unknown: 400 senza città, 200 con la città scelta', r4.status === 400 && r5.status === 200 && r5.body.property && r5.body.property.market === 'barcelona', { r4: r4.body, r5: r5.status });
}

console.log('\n── 10. Il battito della città: solo un alert CON annunci lo tiene verde ──');
{
  seedClients();
  const HB = 'pfsRadarHealth/inbox-madrid';
  const sixty = new Date(Date.now() - 60 * 3600e3).toISOString();
  DB.set(HB, { activeSince: new Date(Date.now() - 72 * 3600e3).toISOString(), lastAlertEmailAt: sixty });
  const nl = FX.rfc822({ from: FX.FROM_ES, to: FX.ALIAS_MADRID, deliveredTo: FX.ALIAS_MADRID, subject: 'Hemos desactivado tu alerta de búsqueda', html: '<html><body><p>Tu alerta ha caducado. Reactívala.</p></body></html>' });
  const nl2 = FX.rfc822({ from: FX.FROM_ES, to: FX.ALIAS_MADRID, deliveredTo: FX.ALIAS_MADRID, subject: 'Las novedades de idealista de este mes', html: '<html><body><p>Newsletter</p></body></html>' });
  const empty = FX.rfc822({ from: FX.FROM_ES, to: FX.ALIAS_MADRID, deliveredTo: FX.ALIAS_MADRID, subject: 'Novedades para ti', html: '<html><body><p>Nada nuevo hoy.</p></body></html>' });
  globalThis.__imap.box = box([nl, nl2, empty]);
  const r = await call(scanInbox);
  const hb = DB.get(HB) || {};
  ok('avviso «desactivado» + newsletter + alias senza annunci: nessun alert contato per Madrid', !(r.body.stats.byMarket.madrid && r.body.stats.byMarket.madrid.alerts), r.body.stats.byMarket);
  ok('…l\'ora dell\'ultimo alert NON si rinfresca e il battito resta ROSSO (48h passate)', hb.ok === false && hb.lastAlertEmailAt === sixty && /48h/.test(hb.lastError || ''), hb);
  ok('«desactivado» e la newsletter non sono nemmeno alert', P2.classifyAlertEmail({ from: FX.FROM_ES, subject: 'Hemos desactivado tu alerta de búsqueda', aliasMarket: 'madrid' }).isSearchAlert === false
    && P2.classifyAlertEmail({ from: FX.FROM_ES, subject: 'Newsletter de idealista', aliasMarket: 'madrid' }).isSearchAlert === false);
  DB.delete(HB);
}

console.log('\n── 11. Le ricerche di chi cambia città, e torna ───────────────');
{
  for (const k of [...DB.keys()]) if (k.startsWith('radarSearches/') || k.startsWith('pfsClients/')) DB.delete(k);
  DB.set('pfsClients/cl_r', { name: 'Rita Roma', stage: 'searching', budget: 1500, zone: 'Prati', bedrooms: '1', portalProperties: [] });
  DB.set('pfsClients/cl_off', { name: 'Ugo Spento', stage: 'searching', budget: 1500, zone: 'Monti', portalProperties: [] });
  await call(syncSearches, { method: 'GET' });
  const ids = [...DB.keys()].filter((k) => k.startsWith('radarSearches/pfs_cl_r_')).sort();
  ok('Roma: due ricerche (immobiliare + idealista.it), accese', ids.length === 2 && ids.every((k) => DB.get(k).enabled === true), ids);
  DB.set('radarSearches/pfs_cl_r_immobiliare', { ...DB.get('radarSearches/pfs_cl_r_immobiliare'), urlOverride: 'https://www.immobiliare.it/affitto-case/roma/prati/?a=1' });
  // un'altra ricerca spenta A MANO, e una del cliente che andrà inattivo
  DB.set('radarSearches/pfs_cl_off_idealista', { ...DB.get('radarSearches/pfs_cl_off_idealista'), enabled: false });
  DB.set('pfsClients/cl_r', { ...DB.get('pfsClients/cl_r'), market: 'madrid', zone: 'Chamberí' });
  await call(syncSearches, { method: 'GET' });
  ok('cambio città → le romane spente (market_changed), la spagnola creata',
    ['immobiliare', 'idealista'].every((p) => DB.get('radarSearches/pfs_cl_r_' + p).enabled === false && DB.get('radarSearches/pfs_cl_r_' + p).disabledReason === 'market_changed')
    && (DB.get('radarSearches/pfs_cl_r_idealista_es') || {}).enabled === true);
  DB.set('pfsClients/cl_r', { ...DB.get('pfsClients/cl_r'), market: 'roma', zone: 'Prati' });
  const back = await call(syncSearches, { method: 'GET' });
  const im = DB.get('radarSearches/pfs_cl_r_immobiliare'), id = DB.get('radarSearches/pfs_cl_r_idealista');
  ok('torna a Roma → le romane si RIACCENDONO, motivo tolto, urlOverride intatto',
    im.enabled === true && id.enabled === true && !im.disabledReason && !im.disabledAt && im.urlOverride === 'https://www.immobiliare.it/affitto-case/roma/prati/?a=1', { im, back: back.body.reenabled });
  ok('…e la spagnola si spegne (market_changed)', (DB.get('radarSearches/pfs_cl_r_idealista_es') || {}).enabled === false);
  ok('una ricerca spenta A MANO resta spenta', DB.get('radarSearches/pfs_cl_off_idealista').enabled === false);
  const hs = await call(homieSearches, { method: 'GET' });
  ok('gli occhi di Homie rivedono le due ricerche romane di Rita', (hs.body.searches || []).filter((x) => x.clientId === 'cl_r').length === 2, hs.body.searches);
  // il cliente inattivo: le sue ricerche spente per client_inactive restano spente se torna? (regola di prima: sì)
  DB.set('pfsClients/cl_off', { ...DB.get('pfsClients/cl_off'), stage: 'placed' });
  await call(syncSearches, { method: 'GET' });
  ok('un cliente uscito: client_inactive (non toccato dalla riaccensione)', DB.get('radarSearches/pfs_cl_off_immobiliare').disabledReason === 'client_inactive');
}

console.log('\n── 12. scan-market non apre idealista.com dal server ───────────');
{
  for (const k of [...DB.keys()]) if (k.startsWith('radarSearches/') || k.startsWith('pfsClients/')) DB.delete(k);
  DB.set('pfsClients/cl_m', { name: 'Marta Madrid', market: 'madrid', stage: 'searching', budget: 1500, zone: 'Chamberí', portalProperties: [] });
  DB.set('pfsClients/cl_b', { name: 'Bea BCN', market: 'barcelona', stage: 'searching', budget: 1500, zone: 'Gràcia', portalProperties: [] });
  DB.set('pfsClients/cl_r2', { name: 'Remo Roma', stage: 'searching', budget: 1500, zone: 'Prati', portalProperties: [] });
  await call(syncSearches, { method: 'GET' });
  EXTERNAL.length = 0;
  const r = await call(scanMarket, { method: 'GET' });
  ok('nessun fetch del server verso idealista.com (le ricerche delle città restano modelli per gli alert)', !EXTERNAL.some((x) => /idealista\.com/.test(x)), EXTERNAL);
  ok('…le romane si scansionano come prima, le città dichiarate saltate', r.status === 200 && r.body.searches === 2 && r.body.citySkipped === 2, r.body);
}

console.log('\n── 13. Il Valutatore non attraversa le città ──────────────────');
{
  for (let i = 0; i < 4; i++) {
    DB.set('properties/vp' + i, { zone: 'Centro', sqm: 60, address: 'Via X ' + i });
    DB.set('contracts/vc' + i, { propertyId: 'vp' + i, rent: 2400, status: 'active' });
  }
  DB.set('marketStats/madrid-centro', { market: 'madrid', asked: { ok: true, sample: 20, medianEurSqm: 25, p25: 22, p75: 28 } });
  DB.set('marketStats/centro', { market: 'roma', asked: { ok: true, sample: 20, medianEurSqm: 25, p25: 22, p75: 28 } });
  const m = await call(valuta, { body: { zone: 'Madrid · Centro', sqm: 60 } });
  const v = m.body && m.body.valuation;
  ok('Madrid · Centro: i contratti ROMANI non correggono (signedSample 0, niente «firmati BOOM in zona»)',
    m.status === 200 && v && v.ok && v.signedSample === 0 && !v.reasons.some((x) => /firmati BOOM in zona/i.test(x)) && v.reasons.some((x) => /sono di Roma/.test(x)) && m.body.zone.market === 'madrid', v);
  const rr = await call(valuta, { body: { zone: 'Centro', sqm: 60 } });
  ok('Roma · Centro: la correzione sui firmati resta com\'era (4 contratti)', rr.status === 200 && rr.body.valuation.signedSample === 4, rr.body.valuation);
}

console.log('\n── 14. Il Perito: le righe delle città non sono «verifiche arretrate» ──');
{
  for (const k of [...DB.keys()]) if (k.startsWith('marketListings/')) DB.delete(k);
  const fresh = new Date().toISOString();
  for (let i = 0; i < 60; i++) DB.set('marketListings/bm' + i, { sourceUrl: ES(100000700 + i), source: 'idealista_es', market: 'madrid', zone: 'Madrid · Retiro', zoneSlug: 'madrid-retiro', price: 1200, sqm: 55, status: 'active', firstSeenAt: fresh, lastSeenAt: fresh });
  for (let i = 0; i < 5; i++) DB.set('marketListings/br' + i, { sourceUrl: 'https://www.immobiliare.it/annunci/3100070' + i + '/', source: 'immobiliare', zone: 'Monti', zoneSlug: 'monti', price: 1300, sqm: 60, status: 'active', firstSeenAt: fresh, lastSeenAt: fresh, lastCheckedAt: fresh });
  const r = await call(pulse, { method: 'GET', query: { dry: '1' } });
  ok('60 vivi di Madrid mai verificati: checkBacklog 0, nessun «gli occhi di Homie girano?»', r.status === 200 && r.body.counts.checkBacklog === 0 && !/arretrate/.test(r.body.summary) && r.body.counts.cityUnchecked === 60, r.body);
}

console.log('\n── 15. Il briefing: le agenzie delle città non sono «scartate» ──');
{
  for (const k of [...DB.keys()]) if (k.startsWith('pfsProperties/')) DB.delete(k);
  const now = new Date().toISOString();
  DB.set('pfsProperties/bR', { sourceUrl: 'https://www.immobiliare.it/annunci/31000801/', source: 'immobiliare', market: 'roma', advertiser: 'agency', price: 1300, lastSeenAt: now });
  DB.set('pfsProperties/bM', { sourceUrl: ES(100000801), source: 'idealista_es', market: 'madrid', advertiser: 'agency', price: 1300, lastSeenAt: now, matchSummary: { pushedTo: [{ name: 'Lucía', score: 80 }] } });
  anthropicBodies = [];
  const r = await call(brief, { method: 'GET' });
  const st = r.body && r.body.stats;
  ok('agenzieScartate conta SOLO Roma (1), le città segnalate a parte (1)', r.status === 200 && st.agenzieScartate === 1 && st.agenzieSegnalateCitta === 1, st);
  const sent = anthropicBodies[0] || {};
  const data = JSON.parse(((sent.messages || [])[0] || {}).content || '{}');
  ok('ogni annuncio del briefing porta la sua città; il prompt nomina Madrid e Barcellona e il Contatto solo Roma',
    (data.annunciUltime48h || []).some((x) => x.citta === 'madrid') && /Madrid e Barcellona/.test(String(sent.system || '')) && /SOLO per Roma/.test(String(sent.system || '')), { sys: String(sent.system || '').slice(0, 200), items: data.annunciUltime48h });
}

console.log('\n── 16. Una search IMAP lenta delle città non affama Roma ───────');
{
  seedClients();
  _resetTapCaches();
  globalThis.__imap.box = box([FX.romeBulk(7)]);
  let skew = 0;
  const realNow = Date.now;
  Date.now = () => realNow() + skew;
  globalThis.__imap.onSearch = () => { skew += 8000; };   // ogni search costa 8s (socket malato)
  let r;
  try { r = await call(scanInbox); } finally { Date.now = realNow; globalThis.__imap.onSearch = null; }
  const st = r.body && r.body.stats;
  ok('quattro search da 8s: l\'email romana è letta e consegnata (prima: timeBoxed, mazzo vuoto)', st && st.emailsSeen === 1 && st.ingested === 1 && deck('cl_rome').length === 1, st);
}

globalThis.fetch = fetch0;

console.log(`\n  ${passed} passati, ${failed} falliti`);

// ── Le mutazioni (solo nel processo padre) ─────────────────────────────────
if (!MUT) {
  console.log('\n── 8. Mutazioni: ogni guardia tolta deve far cadere la suite ─');
  for (const name of Object.keys(MUTATIONS)) {
    const r = spawnSync(process.execPath, [SELF], { encoding: 'utf8', env: { ...process.env, BOOM_MARKETS_MUTATION: name }, timeout: 120000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const applied = out.includes('MUTATION_APPLIED ' + name);
    const fails = (out.match(/^\s+FAIL /gm) || []).length;
    if (EXPECT_GREEN.has(name)) {
      ok(`mutazione ${name}: una cintura sola tolta → la suite resta VERDE (l'altra regge)`, applied && r.status === 0 && fails === 0, { status: r.status, applied, fails });
    } else {
      const first = (out.match(/^\s+FAIL .*$/m) || [''])[0].trim().slice(0, 140);
      ok(`mutazione ${name}: presa (${fails} FAIL; es. ${first})`, applied && r.status !== 0 && fails > 0, { status: r.status, applied, fails, tail: out.slice(-400) });
    }
  }
  console.log(`\n  ${passed} passati, ${failed} falliti (mutazioni comprese)`);
}
process.exit(failed ? 1 : 0);
