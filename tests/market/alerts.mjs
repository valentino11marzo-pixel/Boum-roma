// tests/market/alerts.mjs — DALL'ALERT EMAIL AL METEO, il giro intero.
//
// LA LEZIONE DEL 30 SETTEMBRE 2026. In produzione GET /api/meteo rispondeva
// {"ok":true,"minSample":null,"zones":[],"measuring":[]}: nessun documento
// marketStats. Il Perito (pulse) girava ogni mattina con 200 e nessun
// errore. Nella casella degli alert (valentino@boom-rome.com) c'erano 12
// alert di ricerca in 120 giorni, tutti da UNA ricerca Idealista — e di
// VENDITA ("Case e appartamenti a Centro", 475.000 €). Il parser:
//   • leggeva come canone il 6.507 €/m² del prezzo di vendita;
//   • buttava via il titolo dell'annuncio ("Trilocale in Via Domenichino,
//     4, Monti, Roma") e passava l'oggetto dell'email, da cui la zona non
//     si deduce → zoneSlug null → pulse non scriveva nessuna zona.
// Correggere solo la zona sarebbe stato PEGGIO: la casa in vendita sarebbe
// finita nella statistica di Monti come affitto da 89 €/m².
//
// Qui si guida la catena VERA — scan-inbox (mailparser vero, IMAP finto),
// _ingest, libro mastro, pulse, meteo — su un Firestore in memoria, con
// l'alert reale del 20/09 (tests/pfs/fixtures, identificativi redatti) e
// alert di AFFITTO costruiti dallo stesso modello HTML.

import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 400) : '')); }
};

const SALE_HTML = read('tests/pfs/fixtures/idealista-alert-vendita-2026-09-20.html');
const SALE_SUBJECT = 'Nuovo trilocale di un privato della tua ricerca: Case e appartamenti a Centro!';

// Un alert di AFFITTO dallo stesso modello: cambia solo ciò che distingue
// un affitto (campagna, percorso della ricerca, parole, prezzo al mese).
// Il nome della campagna d'affitto è sintetico: il parser lo tratta come
// qualunque altra campagna, la prova che conta qui è il percorso e "/mese".
function rentAlert({ id, title, price, eurSqm, sqm }) {
  return SALE_HTML
    .replace(/express_newAd_sale_particular/g, 'express_newAd_rent_particular')
    .replace(/\/vendita-case\/roma\/centro\//g, '/affitto-case/roma/centro/')
    .replace(/36876692/g, String(id))
    .replace(/Trilocale in Via Domenichino, 4, Monti, Roma/g, title)
    .replace('475.000 €', `${price.toLocaleString('de-DE')} €/mese`)
    .replace('6.507 €/m²', `${eurSqm} €/m²`)
    .replace('73 m²', `${sqm} m²`)
    .replace('Trilocale in vendita ESCLUSE AGENZIE.', 'Casa in affitto da privato, contratto transitorio.');
}

// ── A. Il parser, puro ────────────────────────────────────────────────────
console.log('\nA. il parser degli alert\n');
const P = await import('../../api/pfs/_alertparse.js');
const RADAR = (await import('../../js/radar-engine.js')).default;
{
  const [l] = P.extractListings(SALE_HTML);
  ok('vendita: il prezzo è 475.000, MAI il 6.507 €/m² (il difetto in produzione)', l && l.price === 475000, l);
  ok('vendita: dichiarata come tale dalla prova nell\'email', l && l.transaction === 'sale', l);
  ok('vendita: il titolo è quello dell\'ANNUNCIO, non l\'etichetta della ricerca',
    l && l.title === 'Trilocale in Via Domenichino, 4, Monti, Roma', l && l.title);
  ok('vendita: il cancello la ferma prima del radar', P.rentGate(l, l.price).ok === false && P.rentGate(l, l.price).reason === 'sale_listing');
  ok('dall\'oggetto dell\'email la zona NON si deduce (era la sola fonte di titolo)', RADAR.inferZone(SALE_SUBJECT) === null);
  ok('dal titolo dell\'annuncio sì', (RADAR.inferZone(l.title) || {}).zone === 'Monti');

  const [r] = P.extractListings(rentAlert({ id: 111, title: 'Bilocale in Via dei Serpenti, 12, Monti, Roma', price: 1200, eurSqm: 20, sqm: 60 }));
  ok('affitto: "/mese" vince sul "€/m²" accanto', r && r.price === 1200 && r.sqm === 60, r);
  ok('affitto: dichiarato come tale', r && r.transaction === 'rent', r);
  ok('affitto: passa il cancello', P.rentGate(r, r.price).ok === true);

  ok('la sottopagina "segnalazione" non presta il suo title alla casa',
    !P.extractListings(SALE_HTML).some(x => /avisar|particular/i.test(x.title || '')));
  const [amp] = P.extractListings(SALE_HTML.replace(/Trilocale in Via Domenichino, 4, Monti, Roma/g,
    'Trilocale in Via di Monserrato, 98, Campo de&#39; Fiori, Roma'));
  ok('entità HTML decodificate: "Campo de&#39; Fiori" diventa Centro Storico',
    amp && (RADAR.inferZone(amp.title) || {}).zone === 'Centro Storico', amp && amp.title);

  // Le prove strutturali vincono sulle parole della descrizione.
  const condo = SALE_HTML.replace('Trilocale in vendita ESCLUSE AGENZIE.', 'Spese condominiali 120 €/mese.');
  ok('una vendita con "spese 120 €/mese" nel testo resta vendita (la campagna e il percorso vincono)',
    P.extractListings(condo)[0].transaction === 'sale');
  ok('prove strutturali opposte → null (non si indovina)',
    P.transactionOf('utm_campaign=x_sale_y /affitto-case/roma/') === null);
  ok('solo parole: "1.100 € al mese" → affitto', P.transactionOf('Bilocale, 1.100 € al mese') === 'rent');
  ok('nessuna prova → null', P.transactionOf('Bilocale, 1.100 €') === null);
  ok('rete sotto il cancello: 31.000 € senza dichiarazione non è un canone',
    P.rentGate({ transaction: null }, 31000).reason === 'price_not_rent'
    && P.rentGate({ transaction: null }, 2400).ok === true);
  ok('prezzo in testa "€ 1.350 al mese"', P.extractListings(
    '<a href="https://www.immobiliare.it/annunci/555/">Bilocale via Ostiense, Roma</a> € 1.350 al mese · 18 €/m²')[0].price === 1350);
}

// ── B. Le giunzioni, sulla sorgente ───────────────────────────────────────
console.log('\nB. le giunzioni\n');
{
  const src = read('api/pfs/scan-inbox.js');
  const loopAt = src.indexOf('for (const l of listings)');
  const gateAt = src.indexOf('rentGate(l, l.price)', loopAt);
  ok('scan-inbox: il cancello sta PRIMA del fetch di dettaglio (niente budget su ciò che si scarta)',
    gateAt > loopAt && gateAt < src.indexOf('fetchHtml(', loopAt));
  ok('scan-inbox: e prima dell\'ingestione', gateAt > 0 && gateAt < src.indexOf('ingestProperty(', loopAt));
  ok('scan-inbox: il titolo dell\'annuncio viene prima dell\'oggetto dell\'email',
    /title:\s*title\s*\|\|\s*l\.title\s*\|\|\s*subject/.test(src));
  ok('pfs-command: lo scarto delle vendite ha un nome nel battito', read('pfs-command.html').includes("skippedSale:"));
}

// ── C. Il giro vero ───────────────────────────────────────────────────────
console.log('\nC. il giro vero: alert → scan-inbox → libro mastro → pulse → meteo\n');
try { await import('mailparser'); }
catch {
  console.log(`\nSKIP: mailparser non installato (npm ci) — parti A e B: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

const imapSource = `export class ImapFlow {
  async connect() {}
  async getMailboxLock() { return { release() {} }; }
  async search({ from }) {
    return globalThis.__imap.filter(m => m.from.includes(from)).map(m => m.uid);
  }
  async fetchOne(uid) {
    const m = globalThis.__imap.find(x => x.uid === Number(uid));
    return m ? { source: Buffer.from(m.raw) } : null;
  }
  async logout() {}
}`;
const imapURL = 'data:text/javascript,' + encodeURIComponent(imapSource);
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, next) {
  if (s === 'imapflow') return { url: ${JSON.stringify(imapURL)}, shortCircuit: true };
  return next(s, c);
}`), import.meta.url);

Object.assign(process.env, {
  FIREBASE_API_KEY: 'k', FIREBASE_ADMIN_EMAIL: 'a@b.c', FIREBASE_ADMIN_PASS: 'p',
  CRON_SECRET: 'cron-test', PFS_IMAP_USER: 'alerts@example.test', PFS_IMAP_PASS: 'x',
});
delete process.env.TELEGRAM_BOT_TOKEN;

const mime = (uid, subject, html) => ({
  uid, from: 'nonrispondere@idealista.it',
  raw: [
    'From: idealista <nonrispondere@idealista.it>',
    'To: alerts@example.test',
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'Date: Sun, 20 Sep 2026 19:23:49 +0000',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html).toString('base64').replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n'),
});

// Firestore REST in memoria (lo stesso stub di tests/radar/run.mjs).
const DB = new Map();
const network = [];
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
  if (!f || 'nullValue' in f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return null;
};
const toDoc = (path, data) => ({ name: `projects/p/databases/(default)/documents/${path}`,
  fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) });
let autoId = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('identitytoolkit')) return json({ idToken: 'fake', localId: 'admin' });
  if (!u.includes('firestore.googleapis.com')) { network.push(u); return json({}, 403); }
  const body = opts.body ? JSON.parse(opts.body) : null;
  const m = u.match(/documents\/([^?:]+)/);
  const path = m ? decodeURIComponent(m[1]) : '';
  if (u.includes(':runQuery')) {
    const coll = body.structuredQuery.from[0].collectionId;
    const rows = [...DB.entries()].filter(([k]) => k.startsWith(coll + '/') && k.split('/').length === 2);
    return json(rows.map(([k, v]) => ({ document: toDoc(k, v) })));
  }
  if (opts.method === 'PATCH') {
    const next = { ...(DB.get(path) || {}), ...Object.fromEntries(Object.entries(body.fields || {}).map(([k, v]) => [k, dec(v)])) };
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

const { default: scanInbox } = await import('../../api/pfs/scan-inbox.js');
const { default: pulse } = await import('../../api/market/pulse.js');
const { default: meteo } = await import('../../api/meteo.js');
const call = (handler, method = 'GET') => new Promise((resolve) => {
  const res = {
    code: 0, h: {},
    setHeader(k, v) { this.h[k] = v; },
    status(c) { this.code = c; return this; },
    json(b) { resolve({ status: this.code, body: b, h: this.h }); return this; },
    end() { resolve({ status: this.code, body: null, h: this.h }); },
  };
  handler({ method, query: {}, body: {}, headers: { authorization: 'Bearer cron-test' } }, res);
});
const keys = (prefix) => [...DB.keys()].filter(k => k.startsWith(prefix + '/'));

// C1 — la produzione di oggi: una sola ricerca, ed è di VENDITA.
{
  DB.clear(); network.length = 0;
  globalThis.__imap = [mime(1, SALE_SUBJECT, SALE_HTML)];
  const scan = await call(scanInbox);
  const st = (scan.body || {}).stats || {};
  ok('scan-inbox: l\'alert è letto (1 alert, 1 annuncio trovato)', scan.status === 200 && st.alerts === 1 && st.listingsFound === 1, scan.body);
  ok('scan-inbox: la VENDITA è scartata e contata, non ingerita', st.skippedSale === 1 && st.ingested === 0, st);
  ok('nessun annuncio nel radar PFS, nessuno nel libro mastro', !keys('pfsProperties').length && !keys('marketListings').length,
    [...keys('pfsProperties'), ...keys('marketListings')]);
  ok('nessun fetch di dettaglio verso il portale (budget non speso)', !network.some(u => u.includes('idealista')), network);
  ok('il battito dell\'Inbox porta il conteggio', (DB.get('pfsRadarHealth/inbox') || {}).stats?.skippedSale === 1);

  const p = await call(pulse);
  ok('pulse: libro vuoto detto con le parole giuste, nessuna zona scritta',
    p.status === 200 && p.body.counts.ledger === 0 && /VUOTO/.test(p.body.summary) && !keys('marketStats').length, p.body);
  const w = await call(meteo);
  ok('meteo: niente zone e niente "measuring" — nessun numero inventato',
    w.status === 200 && w.body.zones.length === 0 && w.body.measuring.length === 0, w.body);
  ok('meteo: la soglia IN VIGORE è dichiarata anche senza documenti (era null)', w.body.minSample === 5, w.body.minSample);
}

// C2 — la stessa pipeline con ricerche d'AFFITTO: la zona viene dal titolo
// dell'annuncio (mai dalla ricerca), il campione decide chi ha i numeri.
{
  DB.clear(); network.length = 0;
  const monti = [
    { id: 101, title: 'Bilocale in Via dei Serpenti, 12, Monti, Roma',   price: 1200, eurSqm: 20, sqm: 60 },
    { id: 102, title: 'Trilocale in Via Panisperna, 30, Monti, Roma',    price: 1540, eurSqm: 22, sqm: 70 },
    { id: 103, title: 'Bilocale in Via del Boschetto, 5, Monti, Roma',   price: 1200, eurSqm: 24, sqm: 50 },
    { id: 104, title: 'Quadrilocale in Via dei Capocci, 8, Monti, Roma', price: 2080, eurSqm: 26, sqm: 80 },
    { id: 105, title: 'Bilocale in Via Urbana, 44, Monti, Roma',         price: 1540, eurSqm: 28, sqm: 55 },
  ];
  // L'oggetto nomina Monti, la casa è a Trastevere: col vecchio parser la
  // zona veniva dall'oggetto (l'etichetta della ricerca).
  const trastevere = { id: 201, title: 'Bilocale in Via della Lungaretta, 8, Trastevere, Roma', price: 1500, eurSqm: 25, sqm: 60 };
  globalThis.__imap = [
    ...monti.map((x, i) => mime(10 + i, 'Nuovo bilocale di un privato della tua ricerca: Affitto Centro!', rentAlert(x))),
    mime(20, 'Nuovo bilocale di un privato della tua ricerca: Affitto Monti!', rentAlert(trastevere)),
  ];
  const scan = await call(scanInbox);
  const st = (scan.body || {}).stats || {};
  ok('scan-inbox: sei affitti ingeriti, nessuno scartato', scan.status === 200 && st.ingested === 6 && st.skippedSale === 0, st);
  const ledger = keys('marketListings').map(k => DB.get(k));
  const slugs = ledger.map(l => l.zoneSlug).sort();
  ok('libro mastro: ogni annuncio ha la zona del SUO titolo',
    JSON.stringify(slugs) === JSON.stringify(['monti', 'monti', 'monti', 'monti', 'monti', 'trastevere']), slugs);
  ok('libro mastro: il canone è quello al mese (1200…2080), mai un €/m²',
    ledger.every(l => l.price >= 1200 && l.price <= 2080), ledger.map(l => l.price));
  ok('nessun fetch di dettaglio (prezzo e privato già nell\'email)', !network.length, network);

  const p = await call(pulse);
  ok('pulse: due zone scritte, una con campione sufficiente',
    p.status === 200 && p.body.counts.zones === 2 && p.body.counts.zonesPublished === 1 && p.body.counts.noZone === 0, p.body.counts);
  const w = await call(meteo);
  const z = (w.body.zones || [])[0];
  ok('meteo: Monti pubblicata coi numeri del Perito (mediana 24 €/m², p25 22, p75 26, n=5)',
    w.body.zones.length === 1 && z.slug === 'monti' && z.asked.medianEurSqm === 24 && z.asked.p25 === 22 && z.asked.p75 === 26 && z.asked.sample === 5, w.body.zones);
  ok('meteo: Trastevere sotto campione — solo il nome', JSON.stringify(w.body.measuring) === '["Trastevere"]', w.body.measuring);
  ok('meteo: soglia dai documenti del Perito', w.body.minSample === 5);
}

// C3 — il silenzio che non deve più ripetersi: annunci a libro ma senza zona.
{
  DB.clear();
  DB.set('marketListings/h_x', { sourceUrl: 'https://www.idealista.it/immobile/1/', zoneSlug: null, status: 'active', price: 1000, sqm: 50 });
  const p = await call(pulse);
  ok('pulse: annunci senza zona detti nel report (prima: "1 annunci · 0 zone" e basta)',
    p.body.counts.noZone === 1 && /SENZA zona/.test(p.body.summary) && /meteo resta vuoto/.test(p.body.summary), p.body.summary);
}

console.log(`\n${fail ? '✗' : '✓'} market alerts: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
