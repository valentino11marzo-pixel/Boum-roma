// tests/radar/run.mjs — IL RADAR 2.0: l'impronta, il fiuto, le vedette, il valutatore.
//
// Tre piani, come le suite sorelle (miniera, market):
//   A. il MOTORE puro (js/radar-engine.js), con le mutazioni che contano:
//      vie diverse non si fondono MAI, stessa-fonte esige un segnale
//      identitario, niente verdetto senza campione, una truffa non è
//      un'occasione, una vedetta vede solo il futuro;
//   B. le GIUNZIONI asserite sulla sorgente: il tap best-effort DOPO il
//      libro mastro, la zona pulita al posto della label spazzatura, il
//      battito di sync che ora esiste, gli occhi del Perito sotto
//      l'allerta vera, rules/cron/registro presenti;
//   C. il GIRO VERO su un Firestore in memoria: due portali → UNA casa nel
//      mazzo del cliente, occasione segnalata una volta sola, la coda
//      della vedetta, il Valutatore coi canoni firmati, e l'ingestione
//      che sopravvive a un radar rotto (il servizio pagato prima di tutto).
//
// node tests/radar/run.mjs

import { createRequire, register } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// nodemailer mockato via loader (stesso mock della suite notify: cattura in
// globalThis.__mails) — la CI gira a zero dipendenze e così il digest si
// testa PER DAVVERO: invio, notifiedIds, coda svuotata, idempotenza.
register('../notify/loader.mjs', import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const R = createRequire(import.meta.url)(join(root, 'js', 'radar-engine.js'));

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 220) : '')); }
}
const iso = ms => new Date(ms).toISOString();
const NOW = Date.now();

console.log('\n── A. Il motore ──────────────────────────────────────────────');

// ── inferZone: la zona dedotta, mai indovinata ─────────────────────────────
{
  ok('inferZone: il titolo nomina la zona', R.inferZone('Bilocale luminoso al Pigneto').zone === 'Pigneto');
  ok('inferZone: alias multi-parola batte il corto contenuto (monti tiburtini → Tiburtino, non Monti)',
    R.inferZone('Appartamento viale dei Monti Tiburtini 44').zone === 'Tiburtino');
  ok('inferZone: due zone diverse nel testo → null (ambiguo, mai indovinare)',
    R.inferZone('Trilocale tra Trastevere e Testaccio') === null);
  ok('inferZone: parole intere — "monteverde" non accende "monti"',
    R.inferZone('Monolocale a Monteverde').zone === 'Monteverde');
  ok('inferZone: nessun toponimo → null', R.inferZone('Bilocale in via Merulana 140') === null);
  ok('inferZone: accenti pieghevoli (Cinecittà → Tuscolano)', R.inferZone('Bilocale zona Cinecittà').zone === 'Tuscolano');
}

// ── L'impronta: gemelli veri, mai falsi merge ──────────────────────────────
{
  const A = { id: 'a', source: 'immobiliare', zone: 'Pigneto', price: 1200, sqm: 65, bedrooms: 2, title: 'Bilocale via del Pigneto 12' };
  const B = { id: 'b', source: 'idealista', zone: 'Pigneto', price: 1200, sqm: 65, bedrooms: 2, title: 'Appartamento in via del Pigneto, Roma' };
  ok('gemello cross-portale: stessa zona/prezzo/mq/via → twin', !!R.findTwin(A, [B]));

  // MUTAZIONE CHIAVE: due case identiche in tutto ma su VIE diverse non si
  // fondono mai — dieci unità gemelle della stessa agenzia hanno prezzo e
  // mq uguali e vie diverse; fonderle nasconde una casa a un cliente.
  const C = { ...B, id: 'c', title: 'Bilocale via Fanfulla da Lodi 20' };
  ok('vie diverse → MAI gemelli (anche con tutto il resto identico)', R.findTwin(A, [C]) === null);
  ok('…e il rifiuto è motivato', R.twinScore(A, C).why.join(' ').includes('vie diverse'));

  ok('prezzi lontani (>10%) → mai gemelli', R.findTwin(A, [{ ...B, price: 1400 }]) === null);
  ok('metrature lontane → mai gemelli', R.findTwin(A, [{ ...B, sqm: 78 }]) === null);
  ok('2+ stanze di scarto → mai gemelli', R.findTwin(A, [{ ...B, bedrooms: 4 }]) === null);
  ok('zona incompatibile → mai gemelli', R.findTwin(A, [{ ...B, zone: 'Prati' }]) === null);
  ok('zona per contenimento (prenestino-pigneto ⊃ pigneto) compatibile',
    R.zoneCompat('prenestino-pigneto', 'pigneto') > 0);

  // Stessa FONTE = la trappola delle unità gemelle: serve un segnale
  // identitario (via/titoli), non bastano prezzo+mq.
  const D1 = { id: 'd1', source: 'immobiliare', zone: 'EUR', price: 900, sqm: 55, bedrooms: 1, title: 'Bilocale nuovo EUR' };
  const D2 = { id: 'd2', source: 'immobiliare', zone: 'EUR', price: 900, sqm: 55, bedrooms: 1, title: 'Bilocale panoramico EUR' };
  ok('stessa fonte SENZA segnale identitario → mai gemelli (unità gemelle)', R.findTwin(D1, [D2]) === null);
  const D3 = { id: 'd3', source: 'immobiliare', zone: 'EUR', price: 900, sqm: 55, bedrooms: 1, title: 'Bilocale viale America 20 EUR' };
  const D4 = { id: 'd4', source: 'immobiliare', zone: 'EUR', price: 900, sqm: 55, bedrooms: 1, title: 'Ripubblicato: viale America 20, EUR' };
  ok('stessa fonte CON stessa via+civico → gemello (ripubblicazione)', !!R.findTwin(D3, [D4]));

  const info = R.clusterInfo([
    { id: 'a', source: 'immobiliare', advertiser: 'private', price: 1200, firstSeenAt: iso(NOW - 10 * 86400e3) },
    { id: 'b', source: 'idealista', advertiser: 'agency', price: 1250, firstSeenAt: iso(NOW - 2 * 86400e3) },
  ]);
  ok('clusterInfo: multi-portale + privato&agenzia + miglior prezzo + nascita più vecchia',
    info.multiPortal && info.privateAndAgency && info.bestPrice.id === 'a'
    && info.firstSeenAt === iso(NOW - 10 * 86400e3), info);
}

// ── L'indice dei recenti ───────────────────────────────────────────────────
{
  const e1 = R.indexEntry('x1', { source: 's', zone: 'Prati', price: 1000, sqm: 50, bedrooms: 1, title: 't', scrapedAt: iso(NOW) });
  let idx = R.indexUpsert([], e1, { nowMs: NOW });
  idx = R.indexUpsert(idx, { ...e1, price: 990 }, { nowMs: NOW });
  ok('indexUpsert: stesso id si sostituisce, non si duplica', idx.length === 1 && idx[0].price === 990);
  const old = { ...e1, id: 'vecchio', t: iso(NOW - 120 * 86400e3) };
  idx = R.indexUpsert(idx.concat([]), old, { nowMs: NOW });
  idx = R.indexUpsert(idx, { ...e1, id: 'x2' }, { nowMs: NOW });
  ok('indexUpsert: le voci oltre maxAge si potano da sole', !idx.some(e => e.id === 'vecchio'));
  const many = [];
  let acc = [];
  for (let i = 0; i < 12; i++) acc = R.indexUpsert(acc, { ...e1, id: 'm' + i, t: iso(NOW - i * 1000) }, { cap: 5, nowMs: NOW });
  ok('indexUpsert: il cap tiene i più recenti', acc.length === 5);
}

// ── Il fiuto ───────────────────────────────────────────────────────────────
{
  const stats = { asked: { ok: true, sample: 20, medianEurSqm: 18, p25: 15, p75: 21 } };
  const f1 = R.fiuto({ price: 980, sqm: 70, advertiser: 'private', scrapedAt: iso(NOW) }, { stats, nowMs: NOW });
  ok('sotto-p25 + privato + fresco = occasione', f1.verdict === 'occasione' && f1.score >= 60, f1);
  const f2 = R.fiuto({ price: 980, sqm: 70 }, { stats: { asked: { ok: false, sample: 2 } }, nowMs: NOW });
  // MUTAZIONE: senza campione NIENTE verdetto — mai un "occasione" su 3 annunci.
  ok('zona senza campione → verdetto NULL, con la ragione scritta', f2.verdict === null && f2.score === null
    && f2.reasons.join(' ').includes('campione'), f2);
  const f3 = R.fiuto({ price: 300, sqm: 90 }, { stats, nowMs: NOW });
  // MUTAZIONE: un prezzo irrealistico è SOSPETTO, mai occasione (le truffe
  // vivono sotto p25 — segnalarle come affari brucia la fiducia nel radar).
  ok('prezzo irrealistico → "sospetto", mai occasione', f3.verdict === 'sospetto' && f3.score === 0, f3);
  const f4 = R.fiuto({ price: 1150, sqm: 70 }, { stats, ledger: { priceDropAt: iso(NOW - 3 * 86400e3) }, nowMs: NOW });
  ok('ribasso recente aggiunge punti e la ragione', f4.reasons.join(' ').includes('ribasso'), f4);
  const f5 = R.fiuto({ price: 1150, sqm: 70 }, { stats, ledger: { relistedAt: iso(NOW - 5 * 86400e3) }, nowMs: NOW });
  ok('rientro sul mercato aggiunge la ragione', f5.reasons.join(' ').includes('tornato'), f5);
  const f6 = R.fiuto({ price: 1400, sqm: 70 }, { stats, nowMs: NOW });
  ok('sopra la mediana non è mai occasione', f6.verdict !== 'occasione', f6);
  ok('senza mq il fiuto non giudica', R.fiuto({ price: 900 }, { stats, nowMs: NOW }).verdict === null);
}

// ── Il radar mandati ───────────────────────────────────────────────────────
{
  const stats = { absorption: { ok: true, sample: 8, medianDays: 20 } };
  const led = { status: 'active', advertiser: 'private', firstSeenAt: iso(NOW - 50 * 86400e3) };
  const m1 = R.mandatoCheck(led, stats, { nowMs: NOW });
  ok('privato fermo oltre 1.5× assorbimento → candidato mandato', m1 && m1.staleDays === 50 && m1.threshold === 45, m1);
  // MUTAZIONE: un'agenzia non è MAI un candidato mandato.
  ok('agenzia → mai candidato', R.mandatoCheck({ ...led, advertiser: 'agency' }, stats, { nowMs: NOW }) === null);
  ok('morto → mai candidato', R.mandatoCheck({ ...led, status: 'gone' }, stats, { nowMs: NOW }) === null);
  ok('fresco → non ancora', R.mandatoCheck({ ...led, firstSeenAt: iso(NOW - 10 * 86400e3) }, stats, { nowMs: NOW }) === null);
  const m2 = R.mandatoCheck({ ...led, firstSeenAt: iso(NOW - 70 * 86400e3) }, { absorption: { ok: false } }, { nowMs: NOW });
  ok('senza assorbimento: soglia fissa 60g, DICHIARATA', m2 && m2.threshold === 60 && m2.basis.includes('senza campione'), m2);
}

// ── Le vedette ─────────────────────────────────────────────────────────────
{
  const w = {
    enabled: true, createdAt: iso(NOW - 30 * 86400e3),
    criteria: { zones: ['Pigneto'], priceMax: 1300, advertiser: 'private' },
    channel: { telegram: true },
  };
  const L = { zone: 'Pigneto', price: 1100, sqm: 60, bedrooms: 2, advertiser: 'private', firstSeenAt: iso(NOW) };
  ok('vedetta: match pieno con i perché', R.watcherMatch(L, w, null).match === true);
  // MUTAZIONE: una vedetta vede SOLO il futuro — il magazzino non la fa scattare.
  ok('annuncio nato PRIMA della vedetta → mai match', R.watcherMatch({ ...L, firstSeenAt: iso(NOW - 60 * 86400e3) }, w, null).match === false);
  ok('fuori zona → no', R.watcherMatch({ ...L, zone: 'Prati' }, w, null).match === false);
  ok('sopra budget → no', R.watcherMatch({ ...L, price: 1500 }, w, null).match === false);
  ok('agenzia con filtro privati → no', R.watcherMatch({ ...L, advertiser: 'agency' }, w, null).match === false);
  ok('vedetta spenta → no', R.watcherMatch(L, { ...w, enabled: false }, null).match === false);
  const wS = { ...w, criteria: { ...w.criteria, sqmMin: 50 } };
  const mS = R.watcherMatch({ ...L, sqm: null }, wS, null);
  ok('criterio dichiarato + dato mancante → NO, e dice perché (fail closed)', mS.match === false && /mq/.test(mS.reason), mS);
  const wD = { ...w, criteria: { ...w.criteria, dealsOnly: true } };
  ok('dealsOnly: senza verdetto occasione → no', R.watcherMatch(L, wD, { verdict: 'interessante' }).match === false);
  ok('dealsOnly: con occasione → sì', R.watcherMatch(L, wD, { verdict: 'occasione', score: 70 }).match === true);

  let q = [];
  for (let i = 0; i < 35; i++) q = R.queueUpsert(q, R.queueEntry('id' + i, L, null));
  ok('la coda della vedetta ha un tetto', q.length === R.QUEUE_CAP);
  q = R.queueUpsert(q, R.queueEntry('id34', L, null));
  ok('la coda non duplica lo stesso annuncio', q.filter(e => e.id === 'id34').length === 1);

  const picked = R.digestPick({ queue: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], notifiedIds: ['b'] });
  // MUTAZIONE: mai due volte lo stesso annuncio nella stessa casella.
  ok('digestPick: i già notificati NON ripartono', picked.send.map(e => e.id).join(',') === 'a,c', picked);
  const big = R.digestPick({ queue: Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i })), notifiedIds: [] });
  ok('digestPick: massimo 6 per email, il resto dichiarato', big.send.length === 6 && big.leftover === 4);
}

// ── Il valutatore ──────────────────────────────────────────────────────────
{
  const stats = { asked: { ok: true, sample: 20, medianEurSqm: 18, p25: 15, p75: 21 } };
  const v1 = R.valuta({ zone: 'Pigneto', sqm: 70 }, { stats, actives: [], signed: [] });
  ok('fascia dai quantili del chiesto', v1.ok && v1.range.low === 1050 && v1.range.point === 1260 && v1.range.high === 1470, v1.range);
  ok('senza 3 firme: nessuna correzione, DICHIARATA', v1.signedDelta === null && v1.reasons.join(' ').includes('nessuna correzione'));
  const signed = [{ rent: 1100, sqm: 70 }, { rent: 1150, sqm: 68 }, { rent: 1000, sqm: 62 }];
  const v2 = R.valuta({ zone: 'Pigneto', sqm: 70 }, { stats, actives: [], signed });
  ok('coi canoni FIRMATI la fascia si corregge e lo dice', v2.signedDelta !== null && v2.range.point < v1.range.point
    && v2.reasons.join(' ').includes('FIRMATI'), v2);
  const v3 = R.valuta({ zone: 'Pigneto', sqm: 70 }, { stats, actives: [], signed: [{ rent: 300, sqm: 70 }, { rent: 310, sqm: 70 }, { rent: 290, sqm: 70 }] });
  ok('la correzione ha un pavimento (−20%): fuori è un artefatto, non un mercato', v3.signedDelta === -20, v3.signedDelta);
  const v4 = R.valuta({ zone: 'Pigneto', sqm: 70 }, { stats: { asked: { ok: false, sample: 3 } }, actives: [], signed });
  // MUTAZIONE: sotto campione il Valutatore NON stampa un numero.
  ok('zona senza campione → ok:false small_sample, mai un numero debole', v4.ok === false && v4.reason === 'small_sample', v4);
  ok('mq fuori scala → rifiutati', R.valuta({ zone: 'x', sqm: 8 }, { stats }).ok === false);
}

console.log('\n── B. Le giunzioni (asserite sulla sorgente) ─────────────────');
{
  const src = p => readFileSync(join(root, p), 'utf8');
  const ingest = src('api/pfs/_ingest.js');
  const iMaster = ingest.indexOf("fsPatch('pfsProperties/' + stableId, property)");
  const iLedger = ingest.indexOf('recordObservation(stableId, property)');
  const iRadar = ingest.indexOf('radarTap(stableId, property)');
  ok('_ingest: il tap del radar viene DOPO il libro mastro (che viene dopo il master)',
    iMaster > -1 && iLedger > iMaster && iRadar > iLedger, { iMaster, iLedger, iRadar });
  const radarLine = ingest.split('\n').find(l => l.includes('radarTap(stableId, property)'));
  ok('_ingest: il tap è best-effort (try sulla stessa riga — mai bloccante)', /try\s*\{/.test(radarLine || ''), radarLine);
  ok('_ingest: il mazzo de-duplica sui GEMELLI di cluster', ingest.includes('clusterMates') && ingest.includes('clusterIds.includes') === false
    ? ingest.includes('clusterMates.includes(p.id)') : ingest.includes('clusterMates.includes(p.id)'));
  ok('_ingest: la zona si deduce dal titolo quando la fonte tace', ingest.includes('RADAR.inferZone') && ingest.includes('zoneInferred'));

  const scanMarket = src('api/pfs/scan-market.js');
  ok('scan-market: MAI più la label come zona (slug spazzatura)', !scanMarket.includes('zone: search.label'));
  ok('scan-market: passa la zona PULITA della ricerca', scanMarket.includes('zone: search.zoneName || null'));

  const sync = src('api/pfs/sync-searches.js');
  ok('sync-searches: scrive la zona pulita sul doc ricerca', sync.includes('zoneName: s.zone || null'));
  ok('sync-searches: il battito che mancava ora esiste', sync.includes("reportHealth('sync'"));

  const eyes = src('api/homie/market.js');
  ok('occhi del Perito: heartbeat via reportHealth (allerta vera), non scrittura diretta',
    eyes.includes("reportHealth('perito-eyes'") && !eyes.includes('const HEARTBEAT'));

  const pulse = src('api/market/pulse.js');
  ok('pulse: i candidati mandato si calcolano col motore e finiscono in radarState/mandati',
    pulse.includes('mandatoCheck') && pulse.includes("radarState/mandati"));

  const rules = src('firestore.rules');
  ok('rules: radarWatchers admin-only', /match \/radarWatchers\/\{x\}\s*\{ allow read, write: if isAdmin\(\); \}/.test(rules));
  ok('rules: radarState admin-only', /match \/radarState\/\{x\}\s*\{ allow read, write: if isAdmin\(\); \}/.test(rules));

  const vercel = src('vercel.json');
  ok('vercel: il cron del digest è dichiarato', vercel.includes('"/api/radar/digest"'));
  ok('vercel: /radar ha noindex + no-store (pagina admin)', vercel.includes('|radar|') && vercel.includes('|radar.html|'));
  ok('vercel: il digest ha maxDuration 60', /"api\/radar\/digest\.js":\s*\{\s*"maxDuration":\s*60/.test(vercel));

  const registry = src('js/squadra-registry.js');
  ok('organigramma: La Vedetta dichiara il suo cron', registry.includes("key: 'vedetta'") && registry.includes("'/api/radar/digest'"));
  ok('organigramma: il Perito ha la sua console (/radar)', /key: 'perito'[\s\S]{0,2200}console: '\/radar'/.test(registry));

  const nav = src('js/portal-app.js');
  ok('portal: la Centrale è nel gruppo Console', nav.includes("window.open('/radar','_blank')"));

  const page = src('radar.html');
  ok('radar.html: market-engine caricato PRIMA di radar-engine (dipendenza UMD)',
    page.indexOf('market-engine.js') > -1 && page.indexOf('market-engine.js') < page.indexOf('radar-engine.js'));

  const digest = src('api/radar/digest.js');
  const iSend = digest.indexOf('await sendEmail(');
  const iNotified = digest.indexOf('notifiedIds: notified');
  ok('digest: notifiedIds si scrive SOLO DOPO l\'invio riuscito (mai "notificato" senza email)',
    iSend > -1 && iNotified > iSend, { iSend, iNotified });
}

console.log('\n── C. Il giro vero (Firestore in memoria) ────────────────────');

// ── Lo stub: Firestore REST + identitytoolkit + Telegram ───────────────────
const DB = new Map();
const enc = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { stringValue: String(v) };
};
const dec = f => {
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
let breakRadarIO = false;   // fase "radar rotto": le sue letture/scritture esplodono
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('identitytoolkit')) return json({ idToken: 'fake', localId: 'admin' });
  if (u.includes('api.telegram.org')) return json({ ok: true });
  if (breakRadarIO && /radarState|radarWatchers|marketStats/.test(u)) throw new Error('radar_io_down');
  const body = opts.body ? JSON.parse(opts.body) : null;
  const m = u.match(/documents\/([^?:]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';
  if (u.includes(':runQuery')) {
    const q = body.structuredQuery;
    const coll = q.from[0].collectionId;
    if (breakRadarIO && /radarWatchers/.test(coll)) throw new Error('radar_io_down');
    const filter = q.where && q.where.fieldFilter;
    const rows = [...DB.entries()]
      .filter(([k]) => k.startsWith(coll + '/'))
      .filter(([, v]) => !filter || String(v[filter.field.fieldPath]) === String(dec(filter.value)));
    return json(rows.map(([k, v]) => ({ document: toDoc(k, v) })));
  }
  if (opts.method === 'PATCH') {
    const prev = DB.get(path) || {};
    const next = { ...prev, ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) };
    DB.set(path, next);
    return json(toDoc(path, next));
  }
  if (opts.method === 'POST') {
    const id = 'doc' + (++autoId);
    DB.set(`${path}/${id}`, Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])));
    return json(toDoc(`${path}/${id}`, DB.get(`${path}/${id}`)));
  }
  if (DB.has(path)) return json(toDoc(path, DB.get(path)));
  return json({ error: { status: 'NOT_FOUND' } }, 404);
};

process.env.HOMIE_SECRET = 'test-secret';
process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
delete process.env.TELEGRAM_BOT_TOKEN;

const { ingestProperty, stableIdFromUrl } = await import('../../api/pfs/_ingest.js');
const { _resetTapCaches } = await import('../../api/radar/_tap.js');
const { default: valutaHandler } = await import('../../api/radar/valuta.js');
const { default: digestHandler } = await import('../../api/radar/digest.js');

const call = (handler, method, body, headers = {}, query = {}) => new Promise(resolve => {
  const req = { method, headers, body, query };
  const res = {
    _status: 0,
    status(c) { this._status = c; return this; },
    json(o) { resolve({ status: this._status, body: o }); },
    end() { resolve({ status: this._status, body: null }); },
  };
  handler(req, res);
});

// ── Semina: statistiche di zona, cliente PFS attivo, vedetta email ─────────
DB.set('marketStats/pigneto', {
  zone: 'pigneto', activeCount: 12,
  asked: { ok: true, sample: 20, medianEurSqm: 18, p25: 15, p75: 21 },
  absorption: { ok: true, sample: 8, medianDays: 18 },
  priceDrops30d: 2,
});
DB.set('pfsClients/cl1', {
  name: 'Marco Test', stage: 'searching', portalEnabled: true,
  budget: 1500, portalProperties: [], portalActivity: [],
});
DB.set('radarWatchers/w1', {
  name: 'Pigneto sotto 1300', enabled: true,
  createdAt: iso(NOW - 30 * 86400e3),
  criteria: { zones: ['Pigneto'], priceMax: 1300 },
  channel: { telegram: false, email: 'dest@example.com' },
  queue: [], notifiedIds: [], matchCount: 0,
});
DB.set('radarWatchers/w2', {
  name: 'Solo tg', enabled: true,
  createdAt: iso(NOW - 30 * 86400e3),
  criteria: { zones: ['Pigneto'] },
  channel: { telegram: true, email: null },
  matchCount: 0,
});

const urlA = 'https://www.immobiliare.it/annunci/111/';
const urlB = 'https://www.idealista.it/immobile/222/';
const urlC = 'https://www.subito.it/annunci/333.htm';
const idA = stableIdFromUrl(urlA), idB = stableIdFromUrl(urlB), idC = stableIdFromUrl(urlC);

// ── 1. Prima vista: zona dedotta, fiuto, mazzo, vedette ────────────────────
{
  const r = await ingestProperty({
    sourceUrl: urlA, source: 'immobiliare', price: 980, sqm: 70, bedrooms: 2,
    title: 'Bilocale in via del Pigneto 12', advertiser: 'private',
  }, { ingestedBy: 'test' });
  ok('ingest A: ok e spinto al cliente', r.ok && r.pushedTo.length === 1, r);
  const doc = DB.get('pfsProperties/' + idA);
  ok('la zona è stata DEDOTTA dal titolo (e marcata come dedotta)', doc.zone === 'Pigneto' && doc.zoneInferred === true, doc && doc.zone);
  ok('il libro mastro ha lo slug giusto (niente slug spazzatura)', DB.get('marketListings/' + idA).zoneSlug === 'pigneto');
  ok('il fiuto è scritto sul doc: occasione', doc.radar && doc.radar.fiuto.verdict === 'occasione', doc && doc.radar);
  const occ = DB.get('radarState/occasioni');
  ok('l\'occasione è nel feed', occ && occ.items.length === 1 && occ.items[0].id === idA);
  const w1 = DB.get('radarWatchers/w1');
  ok('la vedetta email ha la casa in coda', w1.queue.length === 1 && w1.queue[0].id === idA, w1.queue);
  const w2 = DB.get('radarWatchers/w2');
  ok('la vedetta telegram ricorda cosa ha già visto (tgSeenIds)', Array.isArray(w2.tgSeenIds) && w2.tgSeenIds.includes(idA));
  const deck = DB.get('pfsClients/cl1').portalProperties;
  ok('nel mazzo del cliente c\'è la zona', deck[0].zone === 'Pigneto');
}

// ── 2. Il GEMELLO su un altro portale: una casa sola, ovunque ──────────────
{
  const r = await ingestProperty({
    sourceUrl: urlB, source: 'idealista', price: 980, sqm: 70, bedrooms: 2,
    title: 'Appartamento via del Pigneto 12', zone: 'Pigneto', advertiser: 'unknown',
  }, { ingestedBy: 'test' });
  ok('ingest B: ok ma NON rispinto al cliente (de-dup di cluster)',
    r.ok && r.pushedTo.length === 0 && r.skipped.length === 1, r);
  ok('il mazzo del cliente ha ANCORA una sola casa', DB.get('pfsClients/cl1').portalProperties.length === 1);
  const docB = DB.get('pfsProperties/' + idB);
  ok('B è agganciato al cluster di A', docB.radar && docB.radar.clusterId === idA, docB && docB.radar);
  ok('il feed occasioni NON ha raddoppiato la stessa casa', DB.get('radarState/occasioni').items.length === 1);
  ok('la coda della vedetta NON ha raddoppiato la stessa casa', DB.get('radarWatchers/w1').queue.length === 1);
}

// ── 3. Il gemello d'AGENZIA: niente mazzi, ma il cluster lo sa ─────────────
{
  const r = await ingestProperty({
    sourceUrl: urlC, source: 'subito', price: 1000, sqm: 70, bedrooms: 2,
    title: 'Bilocale via del Pigneto 12 — agenzia', zone: 'Pigneto', advertiser: 'agency',
  }, { ingestedBy: 'test' });
  ok('ingest C (agenzia): archiviato ma mai spinto', r.ok && r.droppedAgency === true, r);
  const docC = DB.get('pfsProperties/' + idC);
  ok('anche l\'agenzia entra nel cluster (serve a leggere il mercato)', docC.radar && docC.radar.clusterId === idA);
  ok('il cluster dichiara privato+agenzia', docC.radar.privateAndAgency === true, docC.radar);
}

// ── 4. skipFresh con RIBASSO: il prezzo si aggiorna e la notizia passa ─────
{
  const r = await ingestProperty({
    sourceUrl: urlA, source: 'immobiliare', price: 940, sqm: 70, bedrooms: 2,
    title: 'Bilocale in via del Pigneto 12', advertiser: 'private',
  }, { ingestedBy: 'test', skipFreshHours: 12 });
  ok('ri-avvistamento fresco → corto-circuito', r.ok && r.skippedFresh === true, r);
  ok('…ma il prezzo NON resta stantio sul doc', DB.get('pfsProperties/' + idA).price === 940);
  const led = DB.get('marketListings/' + idA);
  ok('il libro mastro registra il ribasso', led.price === 940 && !!led.priceDropAt, led && led.priceHistory);
}

// ── 5. Il Valutatore: quantili + canoni FIRMATI ────────────────────────────
{
  DB.set('contracts/ct1', { rent: 1050, propertyId: 'p1', status: 'active' });
  DB.set('contracts/ct2', { rent: 1100, propertyId: 'p2', status: 'active' });
  DB.set('contracts/ct3', { rent: 980, propertyId: 'p3', status: 'active' });
  DB.set('properties/p1', { zone: 'Pigneto', sqm: 68 });
  DB.set('properties/p2', { zone: 'Pigneto', sqm: 72 });
  DB.set('properties/p3', { zone: 'Pigneto', sqm: 60 });

  const r401 = await call(valutaHandler, 'POST', { zone: 'Pigneto', sqm: 70 }, {});
  ok('valuta: senza credenziali → 401 (porta chiusa)', r401.status === 401);
  const r = await call(valutaHandler, 'POST', { zone: 'Pigneto', sqm: 70 }, { 'x-homie-secret': 'test-secret' });
  const v = r.body && r.body.valuation;
  ok('valuta: risponde con la fascia', r.status === 200 && v && v.ok === true, r.body);
  ok('valuta: la correzione sul firmato è applicata e dichiarata',
    v && v.signedDelta !== null && v.signedSample === 3 && v.reasons.join(' ').includes('FIRMATI'), v);
  ok('valuta: i comparabili vivi della zona ci sono', v && v.comps.length >= 1, v && v.comps);
  const rBad = await call(valutaHandler, 'POST', { zone: 'Pigneto', sqm: 3 }, { 'x-homie-secret': 'test-secret' });
  ok('valuta: mq assurdi → 400', rBad.status === 400);
}

// ── 6. Il digest delle vedette: dry conta, il run vero spedisce UNA volta ──
{
  const r = await call(digestHandler, 'GET', null, { 'x-homie-secret': 'test-secret' }, { dry: '1' });
  ok('digest dry: vede la coda e conterebbe 1 email', r.status === 200 && r.body.emailed === 1 && r.body.listings === 1, r.body);
  ok('digest dry: NON tocca i dati', DB.get('radarWatchers/w1').notifiedIds.length === 0 && DB.get('radarWatchers/w1').queue.length === 1);

  globalThis.__mails = [];
  const r2 = await call(digestHandler, 'GET', null, { 'x-homie-secret': 'test-secret' }, {});
  ok('digest vero: UNA email al destinatario impostato', r2.body.emailed === 1
    && globalThis.__mails.length === 1 && globalThis.__mails[0].to === 'dest@example.com', globalThis.__mails);
  ok('…col nome della vedetta o della zona nell\'oggetto',
    /Pigneto/.test(globalThis.__mails[0].subject || ''), globalThis.__mails[0].subject);
  const w1After = DB.get('radarWatchers/w1');
  ok('dopo l\'invio: notificato e coda svuotata', w1After.notifiedIds.includes(idA) && w1After.queue.length === 0, w1After);
  const r3 = await call(digestHandler, 'GET', null, { 'x-homie-secret': 'test-secret' }, {});
  ok('un secondo giro NON rispedisce niente (idempotenza nei dati)', r3.body.emailed === 0 && globalThis.__mails.length === 1, r3.body);
}

// ── 7. Radar ROTTO: il servizio pagato non si ferma ────────────────────────
{
  _resetTapCaches();
  breakRadarIO = true;
  const r = await ingestProperty({
    sourceUrl: 'https://www.immobiliare.it/annunci/999/', source: 'immobiliare',
    price: 1200, sqm: 55, bedrooms: 1, title: 'Bilocale Garbatella via Passino', advertiser: 'private',
  }, { ingestedBy: 'test' });
  ok('con TUTTO il radar giù, l\'ingestione PFS spinge comunque al cliente',
    r.ok === true && r.pushedTo.length === 1, r);
  breakRadarIO = false;
  _resetTapCaches();
}

console.log(`\n  ${passed} passati, ${failed} falliti`);
process.exit(failed ? 1 : 0);
