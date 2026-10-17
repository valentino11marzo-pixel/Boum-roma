// tests/listing/run.mjs — LA SCHEDA DICE LA VERITÀ ANCHE SENZA JAVASCRIPT
// (suite `listingssr`).
//
// IL DIFETTO (ottobre 2026). /listing/<id> serviva la testa giusta sopra il
// CORPO di un'altra casa: il template apartment-detail.html porta cotta la
// casa d'esempio del builder (CASE[0], «Bilocale Trastevere»), e chi non
// esegue JavaScript — crawler AI, anteprime, lettori — leggeva quell'H1,
// quel quartiere, quello stato. In più: un id inesistente rispondeva 200
// (la casa d'esempio, indicizzabile), le bozze erano indicizzabili, due
// BreadcrumbList, og:image relativa, «48h move-in» anche sulle case
// occupate, «all-in» su ogni canone, l'onorario senza IVA, «24/7». E il
// modulo APPLY diceva «Sent» anche quando il server rispondeva 400.
//
// Questa suite guida gli handler VERI (api/listing.js, api/llms-listings.js,
// api/sitemap-listings.js, api/ask-listing.js) con globalThis.fetch finto
// come Firestore REST, e — se c'è playwright — apre la pagina servita dal
// server in un Chromium vero per il modulo APPLY e il prezzo sui Solari.
//
// MUTAZIONE (verificata a mano, 15/10/2026): rimettendo in api/listing.js
// la riga dell'H1 come prima (cioè togliendo la sostituzione
// `<h1 id="nomeCasa">…</h1>`), cadono «A: nessuna casa d'esempio fuori da
// noscript» e «A: un solo <h1>, ed è il nome della casa» — la suite esce 1.
// Stesso esito togliendo `if (r.status === 404) return NOT_FOUND;` (cade
// «E: 404») e facendo passare il ramo di successo dell'apply senza
// guardare la risposta del server (cadono «APPLY 400: niente "Sent"» e i
// due check sulla sorgente dell'apply).
// Secondo giro (revisione, 15/10/2026), mutazioni verificate a mano:
// rimettendo nella FAQ «How fast…» il vecchio `c.dal ? … : ' is available
// now.'` cadono C/B/R1 e le due prove sulla fotografia di build; servendo
// il ripiego di un guasto col 200 cacheabile di prima cadono F/G (503,
// no-store); rimettendo in llms-listings il ripiego su DISPO.resolve() cade
// «righe available now = conteggio»; togliendo la riga «Availability:» dai
// fatti di ask-listing cadono A/R1/C/H/D.
// Terzo giro (release GEO/SEO, 15/10/2026), ogni blocco con la sua
// MUTAZIONE verificata a mano accanto: le schede fuori mercato (badge «Not
// on the market», nessuna Offer, CTA «Ask about this home» anche quando la
// build le fotografava libere), gli id che Firestore non può contenere (404
// senza lettura), la sitemap che su un guasto risponde 503 no-store e segue
// nextPageToken, la cache di llms-listings fedele ai «10 minutes», la casa
// chiesta e sconosciuta che non diventa mai CASE[0], il Solari del canone
// montato una volta sola, generate_lead solo a conferma del server e lo
// stesso requestId a ogni tentativo, e il verbale di consegna firmato al
// posto del «filmed in and out».

import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import DISPO from '../../js/dispo-engine.js';
import FACTS from '../../js/listing-facts.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
// la casa d'esempio del template: il nome di CASE[0], letto dal file — i
// nomi cambiano (scripts/catalogo-nomi.mjs, 15/10/2026: «Bilocale
// Trastevere» è diventata il nome della via), la regola no: un nome fisso
// qui farebbe passare il controllo a vuoto. Senza CASE[0] leggibile i
// controlli cadono: un esempio introvabile non è un esempio assente.
const ESEMPIO = (() => {
  const m = src('apartment-detail.html').match(/var CASE = \[\{"id": "[^"]*", "nome": ("(?:[^"\\]|\\.)*")/);
  return m ? JSON.parse(m[1]) : null;
})();
const haEsempio = (t) => ESEMPIO == null || String(t).includes(ESEMPIO);

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + String(detail).slice(0, 400) : '')); }
}

// ── Firestore finto ────────────────────────────────────────────────────
const ANNO = new Date().getFullYear() + 1;          // le date restano future
const FUT = (mm, dd) => `${ANNO}-${mm}-${dd}`;
const LONG = 'A quiet two-room flat on Via dei Coronari, a few steps from Piazza Navona and the river. '
  + 'Fully furnished, with a renovated kitchen, a double bedroom facing the inner courtyard and a '
  + 'bathroom with shower. The building has a lift and a porter in the morning; the street is '
  + 'pedestrian after eight in the evening, which keeps the nights silent in a district that never sleeps.';

const DOCS = {
  A: { name: 'Coronari Classic', zone: 'Centro Storico', address: 'Via dei Coronari 181', price: 1800,
    status: 'available', availableDate: 'Subito', tags: ['All inclusive'], features: ['Elevator'], sqm: 60, bedrooms: 1, bathrooms: 1,
    description: LONG, images: ['/foto-catalogo/coronari.jpg', 'https://example.org/b.jpg'],
    lat: 41.8995123, lng: 12.4709876, geo: { src: 'nominatim', q: 'Via dei Coronari 181, Roma' } },
  B: { name: 'Levico', zone: 'Trieste', price: 1500, status: 'waitlist', availableFrom: FUT('03', '01'),
    tags: ['Garden'], images: ['https://example.org/l.jpg'],
    lat: 41.92, lng: 12.51, geo: { src: 'zone', q: 'zone:Trieste' } },
  C: { name: 'Monti Rented', zone: 'Monti', price: 1400, status: 'rented', images: ['https://example.org/m.jpg'] },
  D: { name: 'Draft Home', zone: 'Prati', price: 1300, status: 'draft' },
  // per llms-listings e sitemap
  // R1: affittata con la data del CONTRATTO (availableFrom) e un residuo
  // passato in availableDate — la FAQ deve dire la data della corsia, mai
  // il residuo; e il documento dichiara le mensilità di deposito
  R1: { name: 'Pigneto Contract', zone: 'Pigneto', price: 1100, status: 'rented',
    availableFrom: FUT('05', '01'), availableDate: '2026-06-01', depositMonths: 2,
    furnished: true, updatedAt: '__TS__2026-09-30T10:00:00Z' },
  R2: { name: 'Reserved Flat', zone: 'Prati', price: 1700, status: 'reserved' },
  H: { name: 'Ask Date', zone: 'Ostiense', price: 1250, status: 'available', availableDate: 'da concordare',
    furnished: 'no' },
  N: { name: 'Missing Date', zone: 'Prati', price: 1300, status: 'available' },
  O: { name: 'Off Market', zone: 'Parioli', price: 2500, status: 'off_market', availableFrom: FUT('06', '01') },
};
const STATUS_ONLY = { E: 404, F: 500 };

function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') {
    if (v.startsWith('__TS__')) return { timestampValue: v.slice(6) };
    return { stringValue: v };
  }
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  const fields = {}; for (const k in v) fields[k] = toFs(v[k]);
  return { mapValue: { fields } };
}
const fsDoc = (id) => {
  const fields = {}; for (const k in DOCS[id]) fields[k] = toFs(DOCS[id][k]);
  return { name: `projects/boom-property-dashboards/databases/(default)/documents/listings/${id}`,
    fields, updateTime: '2026-08-01T09:00:00.000000Z' };
};
let ANTHROPIC_BODY = null;
// quante letture di UNA scheda sono partite (un id impossibile non ne fa)
let ONE_FETCHES = 0;
// la lista (sitemap/llms): 'ok' · '500' · '403' · 'throw' · 'paged' · 'paged-fail'
let LIST_MODE = 'ok';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
// il login admin del server (il budget AI legge settings/ai con le credenziali
// admin): risponde SOLO dentro la sezione del concierge, così le altre sezioni
// vedono la rete di sempre
let SIGNIN = false;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (SIGNIN && u.startsWith('https://identitytoolkit.googleapis.com/')) return json({ idToken: 'T', expiresIn: '3600' });
  if (u.startsWith('https://api.anthropic.com/')) {
    ANTHROPIC_BODY = JSON.parse(opts.body);
    return json({ content: [{ type: 'text', text: 'Fine.' }], usage: { input_tokens: 1, output_tokens: 1 }, model: 'x' });
  }
  if (/\/documents\/listings\//.test(u)) ONE_FETCHES++;
  const one = u.match(/\/documents\/listings\/([^?/]+)\?/);
  if (one) {
    const id = decodeURIComponent(one[1]);
    // come il Firestore vero: un id riservato o oltre 1500 byte è un 400
    // (verificato in produzione), non un 404 — senza la guardia diventava 503
    if (/^__.*__$/.test(id) || Buffer.byteLength(id, 'utf8') > 1500) return json({ error: { code: 400 } }, 400);
    if (id === 'G') throw new TypeError('fetch failed');            // rete caduta
    if (STATUS_ONLY[id]) return json({ error: { code: STATUS_ONLY[id] } }, STATUS_ONLY[id]);
    if (!DOCS[id]) return json({ error: { code: 404 } }, 404);
    return json(fsDoc(id));
  }
  if (/\/documents\/listings\?/.test(u)) {
    if (LIST_MODE === '500') return json({ error: { code: 500 } }, 500);
    if (LIST_MODE === '403') return json({ error: { code: 403 } }, 403);
    if (LIST_MODE === 'throw') throw new TypeError('fetch failed');
    const all = Object.keys(DOCS).map(fsDoc);
    if (LIST_MODE === 'paged' || LIST_MODE === 'paged-fail') {
      const half = Math.ceil(all.length / 2);
      if (!/pageToken=/.test(u)) return json({ documents: all.slice(0, half), nextPageToken: 'P2' });
      if (LIST_MODE === 'paged-fail') return json({ error: { code: 500 } }, 500);
      return json({ documents: all.slice(half) });
    }
    return json({ documents: all });
  }
  return json({ error: { code: 404 } }, 404);
};

function mkRes() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = JSON.stringify(o); return this; },
    end(b) { this.body = b == null ? '' : String(b); return this; },
  };
}
const meta = (h, n) => ((h.match(new RegExp('<meta name="' + n + '" content="([^"]*)">')) || [])[1]);
const prop = (h, n) => ((h.match(new RegExp('<meta property="' + n + '" content="([^"]*)">')) || [])[1]);
const noScriptsStylesNoscript = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
const lds = (h) => [...h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => JSON.parse(m[1]));
const noscriptOf = (h) => ((h.match(/<noscript><section[\s\S]*?<\/noscript>/) || [])[0] || '');
// ciò che il SERVER scrive per questa casa: le descrizioni, il noscript, i
// JSON-LD iniettati e gli slot del corpo (il template ha i suoi «48 hours»
// dell'hold e delle FAQ, che non sono promesse sulla casa)
const ssrText = (h) => [meta(h, 'description'), prop(h, 'og:description'), meta(h, 'twitter:description'),
  noscriptOf(h),
  ...[...h.matchAll(/<script type="application\/ld\+json" data-seo-dynamic>([\s\S]*?)<\/script>/g)].map((m) => m[1]),
  ...['nomeCasa', 'doveCasa', 'statoCasa', 'raccontoCasa'].map((id) => (h.match(new RegExp('id="' + id + '">([^<]*)<')) || [])[1] || ''),
].join('\n');

// ═══ 1. /listing/:id ════════════════════════════════════════════════════
console.log('\n/listing/:id — il corpo è quello della casa');
const listing = (await import('../../api/listing.js')).default;
const OUT = {};
for (const id of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'R1', 'N']) {
  const res = mkRes();
  await listing({ query: { id } }, res);
  OUT[id] = res;
}
const A = OUT.A.body, B = OUT.B.body, C = OUT.C.body, D = OUT.D.body;

// Anche il dato strutturato deve tacere la disponibilità quando non è
// conosciuta, sia per la casa libera sia per il rilascio di una occupata.
for (const data of [
  { status: 'available', availableDate: 'quando capita' },
  { status: 'waitlist' },
]) {
  DOCS.UNKNOWN = { name: 'Unknown availability', price: 1200, ...data };
  const res = mkRes();
  try { await listing({ query: { id: 'UNKNOWN' } }, res); } finally { delete DOCS.UNKNOWN; }
  const ap = lds(res.body).find((o) => o['@type'] === 'Apartment');
  check(`${data.status}, data sconosciuta: offerta senza InStock/PreOrder o data inventata`,
    res.statusCode === 200 && ap && ap.offers && ap.offers.availability === undefined
    && ap.offers.availabilityStarts === undefined);
}

for (const id of ['A', 'B', 'C', 'D']) {
  const h = OUT[id].body, v = noScriptsStylesNoscript(h);
  const h1s = [...v.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1]);
  check(`${id}: nessuna casa d'esempio («${ESEMPIO}») fuori da noscript/script`, !haEsempio(v));
  check(`${id}: un solo <h1>, ed è il nome della casa`, h1s.length === 1 && h1s[0] === DOCS[id].name, JSON.stringify(h1s));
  check(`${id}: il noscript non porta un secondo <h1>`, !/<h1/.test(noscriptOf(h)));
}
const robotsOk = (h, re) => re.test(meta(h, 'robots') || '') && re.test(meta(h, 'googlebot') || '');
check('A, B, C: robots e googlebot index (dichiarati esplicitamente)',
  ['A', 'B', 'C'].every((id) => robotsOk(OUT[id].body, /^index, follow, max-image-preview:large/)));
check('D (draft): robots e googlebot noindex', robotsOk(D, /^noindex, follow$/));
{
  const res = mkRes(); const saved = DOCS.O;
  await listing({ query: { id: 'O' } }, res);
  check('off_market: noindex anche con una data dal contratto', robotsOk(res.body, /^noindex/));
  DOCS.O = saved;
  OUT.O = res;
}

// FUORI MERCATO (15/10/2026). Nascosta, bozza, archiviata, fuori mercato:
// noindex c'era già, ma la corsia le legge «now» (o «ahead» con una data) e
// la pagina diceva «Available now» nel badge e InStock/PreOrder nel
// JSON-LD — che i crawler AI leggono qualunque cosa dica il noindex.
// MUTAZIONE (verificata a mano): rimettendo `if (price)` al posto di
// `if (price && !hiddenDoc)` cadono i tre «niente Offer»; rimettendo
// laneCopy(...).short nello slot cadono i tre «Not on the market».
DOCS.X = { name: 'Old Home', zone: 'Monti', price: 1500, status: 'archived', images: ['https://example.org/x.jpg'] };
{
  const res = mkRes();
  try { await listing({ query: { id: 'X' } }, res); } finally { delete DOCS.X; }
  OUT.X = res;
}
for (const id of ['D', 'O', 'X']) {
  const h = OUT[id].body;
  const stato = (h.match(/id="statoCasa">([^<]*)</) || [])[1];
  const ap = lds(h).find((o) => o['@type'] === 'Apartment');
  check(`${id} (${DOCS[id] ? DOCS[id].status : 'archived'}): stato «Not on the market»`, stato === 'Not on the market', stato);
  check(`${id}: nessuna Offer nel JSON-LD (né InStock né PreOrder)`,
    !!ap && !ap.offers && !/InStock|PreOrder|SoldOut/.test(h), ap && JSON.stringify(ap.offers));
  check(`${id}: noindex, meta «not currently on the market», nessun «Available now» scritto dal server`,
    robotsOk(h, /^noindex/) && /not currently on the market/.test(meta(h, 'description') || '')
    && !/Available now/.test(ssrText(h)), meta(h, 'description'));
}

// Una casa FOTOGRAFATA libera dalla build e poi archiviata: il client parte
// dal CASE (libera) e il documento iniettato la dichiara fuori mercato — il
// browser deve passare a «Not on the market», non lasciare «Send application».
const CASE_BUILD = JSON.parse((src('apartment-detail.html').match(/var CASE = (\[.*\]);\n/) || [])[1] || '[]');
const LIBERA_BUILD = CASE_BUILD.find((x) => x.libera && x.prezzo && x.cover);
if (LIBERA_BUILD) {
  DOCS[LIBERA_BUILD.id] = { name: LIBERA_BUILD.nome, zone: LIBERA_BUILD.zona, price: LIBERA_BUILD.prezzo,
    status: 'archived', images: [LIBERA_BUILD.cover] };
  const res = mkRes();
  try { await listing({ query: { id: LIBERA_BUILD.id } }, res); } finally { delete DOCS[LIBERA_BUILD.id]; }
  OUT[LIBERA_BUILD.id] = res;
  check('una casa libera nella build e archiviata in Firestore: il server la dice «Not on the market»',
    res.statusCode === 200 && /id="statoCasa">Not on the market</.test(res.body));
}

// GLI ID IMPOSSIBILI. Firestore risponde 400 (non 404) a un id che non può
// contenere: prima il 400 cadeva nel ramo «guasto» e /listing/__x__ era un
// 503 senza fine. Ora 404 noindex, senza chiedere niente a Firestore.
// MUTAZIONE (verificata a mano): togliendo `if (impossibleId(id)) return
// notFound(res);` cadono tutti i «404 senza lettura».
{
  const IMPOSSIBILI = { '__x__': '__x__', '1501 caratteri': 'a'.repeat(1501),
    '1502 byte (751 «è»)': 'è'.repeat(751), '.': '.', '..': '..', 'con una /': 'a/b' };
  for (const [nome, id] of Object.entries(IMPOSSIBILI)) {
    const before = ONE_FETCHES;
    const res = mkRes();
    await listing({ query: { id } }, res);
    check(`id impossibile (${nome}): 404 noindex «no longer listed», senza leggere Firestore`,
      res.statusCode === 404 && /<meta name="robots" content="noindex, follow">/.test(res.body)
      && /This home is no longer listed/.test(res.body) && ONE_FETCHES === before
      && /s-maxage=300/.test(res.headers['cache-control'] || ''), res.statusCode + ' fetch ' + (ONE_FETCHES - before));
  }
  // controprova: i confini non bloccano un id possibile
  for (const [nome, id] of Object.entries({ '1500 caratteri': 'b'.repeat(1500), '__x (non riservato)': '__x', 'x__': 'x__' })) {
    const before = ONE_FETCHES;
    const res = mkRes();
    await listing({ query: { id } }, res);
    check(`id possibile (${nome}): si chiede a Firestore (e il suo 404 resta 404)`,
      ONE_FETCHES === before + 1 && res.statusCode === 404, res.statusCode + ' fetch ' + (ONE_FETCHES - before));
  }
}
check('E (404 di Firestore): status 404', OUT.E.statusCode === 404, OUT.E.statusCode);
check('E: pagina noindex, html, «no longer listed», link alla vetrina',
  /<meta name="robots" content="noindex, follow">/.test(OUT.E.body)
  && /text\/html/.test(OUT.E.headers['content-type'] || '')
  && /This home is no longer listed/.test(OUT.E.body) && /href="\/apartments"/.test(OUT.E.body));
check('E: cache breve (s-maxage=300)', /s-maxage=300/.test(OUT.E.headers['cache-control'] || ''));
// Un guasto non è un 404 (la casa c'è) e non è un 200 cacheabile: il
// template è noindex, e un «noindex» tenuto all'edge per cinque minuti su
// una casa vera è ciò che un crawler registrerebbe. 503 + Retry-After:
// Google riprova senza deindicizzare; il browser rende comunque il corpo.
for (const id of ['F', 'G']) {
  const r = OUT[id], cc = r.headers['cache-control'] || '';
  check(`${id} (${id === 'F' ? '500 di Firestore' : 'rete caduta'}): MAI un 404 su un guasto — 503 con Retry-After`,
    r.statusCode !== 404 && r.statusCode === 503 && /^\d+$/.test(String(r.headers['retry-after'] || '')), r.statusCode);
  check(`${id}: la risposta di ripiego non si tiene all'edge (no-store, niente s-maxage)`,
    /no-store/.test(cc) && !/s-maxage/.test(cc), cc);
  check(`${id}: il corpo resta la pagina (html, il browser la rende)`,
    /text\/html/.test(r.headers['content-type'] || '') && r.body.length > 1000);
}
check('A: il successo resta cacheabile all\'edge (s-maxage=300)', /s-maxage=300/.test(OUT.A.headers['cache-control'] || ''));
check('F: il template senza documento resta noindex (le copie non sono canoniche)', robotsOk(OUT.F.body, /^noindex/));

for (const id of ['A', 'B', 'C', 'D']) {
  const n = lds(OUT[id].body).filter((o) => o['@type'] === 'BreadcrumbList').length;
  check(`${id}: un solo BreadcrumbList`, n === 1, n);
}
{
  const bc = lds(A).find((o) => o['@type'] === 'BreadcrumbList');
  const last = bc.itemListElement[bc.itemListElement.length - 1];
  check('A: il BreadcrumbList finisce sulla canonical della casa', last.item === 'https://www.boomrome.com/listing/A' && last.name === 'Coronari Classic');
}
check('A: og:image assoluta (il documento porta /foto-catalogo/…)',
  prop(A, 'og:image') === 'https://www.boomrome.com/foto-catalogo/coronari.jpg'
  && meta(A, 'twitter:image') === 'https://www.boomrome.com/foto-catalogo/coronari.jpg', prop(A, 'og:image'));
{
  const ap = lds(A).find((o) => o['@type'] === 'Apartment');
  check('A: JSON-LD image tutte assolute', ap.image.every((u) => /^https:\/\//.test(u)), JSON.stringify(ap.image));
  const ds = ap.description;
  const body = ds.slice(0, -1);
  check('A: JSON-LD description tagliata all\'ultimo spazio entro 300, coi puntini',
    ds.endsWith('…') && body.length <= 300 && LONG.startsWith(body) && /[\s,.]/.test(LONG.charAt(body.length) || ' ')
    && /\w$/.test(body), JSON.stringify(ds.slice(-40)));
  check('A: JSON-LD InStock', ap.offers.availability === 'https://schema.org/InStock');
  const bp = lds(B).find((o) => o['@type'] === 'Apartment');
  check('B: JSON-LD PreOrder con availabilityStarts', bp.offers.availability === 'https://schema.org/PreOrder'
    && bp.offers.availabilityStarts === FUT('03', '01'));
  const cp = lds(C).find((o) => o['@type'] === 'Apartment');
  check('C: JSON-LD SoldOut', cp.offers.availability === 'https://schema.org/SoldOut');
  const np = lds(OUT.N.body).find((o) => o['@type'] === 'Apartment');
  check('N (data assente): casa visibile, offerta senza disponibilità inventata',
    OUT.N.statusCode === 200 && np && np.offers && np.offers.availability === undefined
    && /id="statoCasa">Ask us for the date</.test(OUT.N.body));
  check('N (data assente): il server chiede la data, nessuna promessa now/48h',
    /Availability on request/.test(noscriptOf(OUT.N.body))
    && !/Available now|48h|48 hours|InStock|PreOrder/i.test(ssrText(OUT.N.body)));
}
for (const id of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
  const m = OUT[id].body.match(/all-in|24\/7/i);
  check(`${id}: niente «all-in» né «24/7» nell'output`, !m, m && m[0]);
}
for (const id of ['A', 'B', 'C', 'D']) {
  const has = /48h|48 hours/.test(ssrText(OUT[id].body));
  check(`${id}: «48h/48 hours» ${id === 'A' ? 'presente (entra adesso)' : 'assente (non entra adesso)'}`, id === 'A' ? has : !has);
}
{
  const fee = Math.round(1800 * 12 * 0.122);
  const t = ssrText(A);
  check(`A: onorario €${fee.toLocaleString('en-US')} accanto a «VAT»`,
    new RegExp('€' + fee.toLocaleString('en-US').replace(',', ',') + ' incl\\. VAT').test(t), t.match(/Agency fee[^<]*/));
  check('A: FACTS.agencyFeeEur coincide col conto della scheda', FACTS.agencyFeeEur(1800) === fee);
  check('A: dice «bills included» (etichetta «All inclusive»)', /bills included/.test(noscriptOf(A)));
  check('B: dice «not included»', /not included/.test(noscriptOf(B)));
  // nessuna imposta di registro «sempre dovuta»: con la cedolare secca (il
  // default dei modelli, js/contract-pdf.js) non ce n'è; senza, si divide
  check('B: tasse e oneri «as the lease states», con la cedolare secca nominata',
    /condominium charges and any registration tax or stamp duty are shared as the lease states/.test(noscriptOf(B))
    && /cedolare secca/.test(noscriptOf(B)), noscriptOf(B).match(/Monthly rent[^<]*/));
  check('nessuna superficie del server dice «registration tax are not included» / «paid … to the State»',
    ['A', 'B', 'C'].every((id) => !/registration tax are not included|registration tax are paid/i.test(OUT[id].body.replace(/<script[\s\S]*?<\/script>/g, ''))));
  check('A: il contratto è la lease italiana spiegata in inglese', /Registered Italian standard-form lease \(L\. 431\/98\), explained in English/.test(noscriptOf(A)));
  check('A: niente più «English contract»/«in English and Italian»', !/English contract|in English and Italian/i.test(ssrText(A)));
}
// gli slot del corpo
{
  const slot = (h, id) => (h.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<')) || [])[1];
  check('A: dove = zona · indirizzo (regola del client)', slot(A, 'doveCasa') === 'Centro Storico · Via dei Coronari 181', slot(A, 'doveCasa'));
  check('A: stato «Available now»', slot(A, 'statoCasa') === 'Available now', slot(A, 'statoCasa'));
  const bShort = DISPO.laneCopy(DISPO.marketLane(DOCS.B), 'en').short;
  check(`B: stato dalla corsia («${bShort}»)`, slot(B, 'statoCasa') === bShort && /^Free from/.test(bShort), slot(B, 'statoCasa'));
  check('C: stato «Rented»', slot(C, 'statoCasa') === 'Rented');
  check('A: canone in chiaro e in data-p (€1,800)',
    /<span class="flap-prezzo flap-scale" id="canoneCasa" data-p="€1,800">€1,800<\/span>/.test(A));
  check('A: il racconto è la descrizione della casa', (slot(A, 'raccontoCasa') || '').startsWith('A quiet two-room flat'));
  check('A: briciola di zona verso /apartments#zona=Centro%20Storico',
    /<a href="\/apartments#zona=Centro%20Storico" id="briZona">Centro Storico<\/a>/.test(A));
  check('B: meta description «free from …, reservable today» e niente 48h',
    /free from [^,]+, reservable today/.test(meta(B, 'description')) && !/48/.test(meta(B, 'description')), meta(B, 'description'));
  check('C: meta description «currently rented»', /currently rented/.test(meta(C, 'description')), meta(C, 'description'));
  check('A: meta description «move-in in as little as 48h»', /move-in in as little as 48h/.test(meta(A, 'description')));
  // un'altra casa d'esempio cotta dal builder non può tornare: le regex
  // prendono QUALUNQUE contenuto. Si ricuoce davvero il template (un'altra
  // casa in ogni slot, prezzo compreso) e lo si fa leggere a un'istanza
  // fresca del modulo, dalla cartella di lavoro.
  const tpl = src('apartment-detail.html')
    .replace(/<h1 id="nomeCasa">[^<]*<\/h1>/, '<h1 id="nomeCasa">Altra Casa Cotta</h1>')
    .replace(/<p class="dove" id="doveCasa">[^<]*<\/p>/, '<p class="dove" id="doveCasa">Monti · Via Cotta 1</p>')
    .replace(/<span class="stato-grande" id="statoCasa">[^<]*<\/span>/, '<span class="stato-grande" id="statoCasa">Waitlist open</span>')
    .replace(/<span class="flap-prezzo flap-scale" id="canoneCasa" data-p="[^"]*">[^<]*<\/span>/,
      '<span class="flap-prezzo flap-scale" id="canoneCasa" data-p="€999">€999</span>')
    .replace(/<p id="raccontoCasa">[^<]*<\/p>/, '<p id="raccontoCasa">Racconto cotto di un\'altra casa.</p>')
    .replace(/<a href="[^"]*" id="briZona">[^<]*<\/a>/, '<a href="/apartments#zona=Monti" id="briZona">Monti</a>');
  const tmp = mkdtempSync(join(tmpdir(), 'listing-ricotto-'));
  writeFileSync(join(tmp, 'apartment-detail.html'), tpl);
  const cwd = process.cwd();
  let R = '';
  try {
    process.chdir(tmp);
    const fresh = (await import('../../api/listing.js?ricotto=1')).default;
    const res = mkRes(); await fresh({ query: { id: 'A' } }, res); R = res.body;
  } finally { process.chdir(cwd); rmSync(tmp, { recursive: true, force: true }); }
  const vR = noScriptsStylesNoscript(R);
  check('template ricotto con un\'altra casa: il ricotto è stato davvero letto', /Altra Casa Cotta/.test(tpl) && R.length > 1000);
  check('template ricotto: nessuno slot cotto sopravvive (nome, dove, stato, prezzo, racconto, zona)',
    !/Altra Casa Cotta|Via Cotta|Waitlist open|€999|Racconto cotto|zona=Monti/.test(vR)
    && /<h1 id="nomeCasa">Coronari Classic<\/h1>/.test(vR) && /data-p="€1,800">€1,800</.test(vR), vR.match(/id="(nomeCasa|statoCasa|canoneCasa)"[^<]*</g));
}
// IL DOLLARO (15/10/2026). Il testo di Firestore entrava in
// String.prototype.replace come STRINGA di rimpiazzo, dove $' $` $& $$ sono
// pattern: un `$'` nel nome incollava il resto del template nella pagina
// (36 MB, 128 <body>, __LISTING illeggibile). Ogni sostituzione che porta
// un dato è ora una funzione. MUTAZIONE (verificata a mano): rimettendo la
// stringa in `html.replace('</head>', scripts)` o nel <title>, cadono i
// check qui sotto.
{
  const DOLLAR_NAME = "Loft $' Navona $& $$";
  const DOLLAR_DESC = "Price in USD: $'s quoted on request. Bills $& extras, ask about $` and $$1.";
  DOCS.S = { name: DOLLAR_NAME, zone: 'Monti', address: 'Via $` Panisperna', price: 1500, status: 'available',
    description: DOLLAR_DESC, features: ['$& lift', "$' terrace"], notes: "$'$'$'", images: ['https://example.org/s.jpg'] };
  const res = mkRes();
  try { await listing({ query: { id: 'S' } }, res); } finally { delete DOCS.S; }
  const h = res.body, tplLen = src('apartment-detail.html').length;
  const count = (re) => (h.match(re) || []).length;
  check('dollaro: un solo <body>, un solo </head>, un solo </html>',
    count(/<body>/g) === 1 && count(/<\/head>/g) === 1 && count(/<\/html>/g) === 1,
    [count(/<body>/g), count(/<\/head>/g), count(/<\/html>/g)].join('/'));
  check('dollaro: risposta sotto 1,2× il template (niente template incollato)', h.length < tplLen * 1.2, h.length + ' vs ' + tplLen);
  const titles = [...h.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
  check('dollaro: un solo <title>, col nome letterale',
    titles.length === 1 && titles[0].startsWith("Loft $' Navona $&amp; $$ "), JSON.stringify(titles));
  check('dollaro: og:title, meta e canonical letterali',
    (prop(h, 'og:title') || '').startsWith("Loft $' Navona $&amp; $$ ")
    && (meta(h, 'twitter:title') || '').startsWith("Loft $' Navona $&amp; $$ ")
    && /<link rel="canonical" href="https:\/\/www\.boomrome\.com\/listing\/S">/.test(h), prop(h, 'og:title'));
  const m = h.match(/window\.__LISTING=([\s\S]*?);window\.__LISTING_ID=/);
  let parsed = null; try { parsed = m && JSON.parse(m[1]); } catch { parsed = null; }
  check('dollaro: __LISTING si legge ed è il documento, dollari compresi',
    !!parsed && parsed.name === DOLLAR_NAME && parsed.description === DOLLAR_DESC && parsed.notes === "$'$'$'",
    m && m[1].slice(0, 120));
  let ld = null; try { ld = lds(h).find((o) => o['@type'] === 'Apartment'); } catch { ld = null; }
  check('dollaro: JSON-LD leggibile, nome e descrizione letterali', !!ld && ld.name === DOLLAR_NAME && ld.description === DOLLAR_DESC);
  check('dollaro: un solo noscript, col racconto letterale',
    count(/<noscript><section/g) === 1 && noscriptOf(h).includes("Price in USD: $'s quoted on request. Bills $&amp; extras"),
    noscriptOf(h).slice(0, 200));
  check('dollaro: H1 e dove letterali', h.includes('<h1 id="nomeCasa">Loft $\' Navona $&amp; $$</h1>')
    && h.includes('id="doveCasa">Monti · Via $` Panisperna</p>'));
}

// ═══ 2. /llms-listings.txt ══════════════════════════════════════════════
console.log('\n/llms-listings.txt — solo ciò che è vero per QUELLA casa');
{
  const res = mkRes();
  // Il riepilogo include l'ora di generazione: 14:48 non è una promessa
  // di ingresso in 48 ore. Riproduci sempre il minuto che faceva fallire CI.
  const RealDate = globalThis.Date;
  const fixedNow = RealDate.parse(new RealDate().toISOString().slice(0, 10) + 'T14:48:00Z');
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow; }
  };
  try { await (await import('../../api/llms-listings.js')).default({ query: {} }, res); }
  finally { globalThis.Date = RealDate; }
  const t = res.body;
  check('prova deterministica: orario generato contiene 14:48', /generated \d{4}-\d{2}-\d{2}T14:48Z/.test(t));
  const blocks = t.split('\n## ').slice(1).filter((b) => !b.startsWith('How to rent'));
  const block = (name) => blocks.find((b) => b.startsWith(name)) || '';
  check('status 200, markdown', res.statusCode === 200 && /markdown/.test(res.headers['content-type'] || ''));
  check('l\'affittata con la data dal contratto (availableFrom futura) c\'è', !!block('Pigneto Contract'));
  check('la riservata no', !block('Reserved Flat'));
  check('la bozza no, la fuori mercato no, l\'affittata senza data no',
    !block('Draft Home') && !block('Off Market') && !block('Monti Rented'));
  const bad = t.match(/all-in|24\/7|60-second|building-exact/i);
  check('niente «all-in», «24/7», «60-second», «building-exact»', !bad, bad && bad[0]);
  check('«furnished» solo dove il documento lo dice',
    !/Specs:[^\n]*furnished/i.test(block('Coronari Classic')) && /Specs:[^\n]*\bfurnished\b/.test(block('Pigneto Contract'))
    && /Specs:[^\n]*\bunfurnished\b/.test(block('Ask Date')));
  const m = t.match(/_(\d+) homes \((\d+) available now · (\d+) occupied, reservable ahead with a release date · (\d+) reservable or available, date on request\)/);
  check('i tre conteggi sommano al numero di case elencate',
    !!m && +m[2] + +m[3] + +m[4] === +m[1] && +m[1] === blocks.length, m && m[0] + ' vs ' + blocks.length);
  check('conteggi giusti: 1 ora (A) · 2 con data (B, R1) · 2 su richiesta (H, N)', !!m && m[2] === '1' && m[3] === '2' && m[4] === '2', m && m[0]);
  // etichette e conteggi seguono la STESSA corsia: tante righe «available
  // now» quante il conteggio; solo A dichiara esplicitamente «Subito».
  const nowLines = (t.match(/^- Availability: available now$/gm) || []).length;
  check('righe «- Availability: available now» = conteggio «N available now»', !!m && nowLines === +m[2], nowLines + ' vs ' + (m && m[2]));
  check('A (Subito) è «available now», H (data illeggibile) e N (data assente) «on request»',
    /- Availability: available now/.test(block('Coronari Classic'))
    && /- Availability: availability on request/.test(block('Ask Date'))
    && /- Availability: availability on request/.test(block('Missing Date')));
  check('R1: la data del contratto, non il residuo di availableDate',
    new RegExp('- Availability: reservable ahead — occupied now, free from ' + FUT('05', '01')).test(block('Pigneto Contract')));
  check('testata: nessuna imposta di registro «sempre dovuta», cedolare secca nominata',
    !/registration tax are paid to the providers and to the State/.test(t)
    && /any registration tax or stamp duty are shared as the lease states/.test(t) && /cedolare secca/.test(t));
  check('A: canone con «bills included» e onorario IVA compresa',
    /Rent: €1,800\/month — listed with bills included/.test(block('Coronari Classic'))
    && /Agency fee: €2,635 incl\. VAT, once/.test(block('Coronari Classic')));
  check('B: «bills not included»', /Rent: €1,500\/month — bills not included/.test(block('Levico')));
  check('posizione del pin col suo grado di verità (portone · quartiere · niente)',
    /Map position: exact address/.test(block('Coronari Classic'))
    && /Map position: Approximate position in Trieste/.test(block('Levico'))
    && !/Map position/.test(block('Ask Date')));
  check('la testata dichiara onorario con IVA e lease italiana spiegata in inglese',
    /10% of one year's rent plus 22% VAT, charged once/.test(t) && /explained in English/.test(t));
  check('le 48 ore solo per chi è «available now»', (t.match(/\b48(?:\s*hours?\b|h\b)/gi) || []).length === 1 && /"available now" can be moved into as fast as 48 hours/.test(t));
  check('nessun video tour promesso se nessuna casa ce l\'ha', !/video tour/i.test(t));
  check('2-minute eligibility check', /2-minute eligibility check/.test(t));
  // «cached up to 10 minutes» (la riga in fondo) resta vero: con swr=86400
  // l'edge poteva servire una copia di un giorno mentre rivalidava
  const cc = res.headers['cache-control'] || '';
  const swr = +((cc.match(/stale-while-revalidate=(\d+)/) || [])[1] || 0);
  check('cache: s-maxage=600 e stale-while-revalidate ≤ 60 («cached up to 10 minutes» resta vero)',
    /s-maxage=600\b/.test(cc) && swr > 0 && swr <= 60 && /cached up to 10 minutes/.test(t), cc);
}

// ═══ 3. /listings-sitemap.xml ═══════════════════════════════════════════
console.log('\n/listings-sitemap.xml — la corsia decide chi va trovato');
{
  const res = mkRes();
  await (await import('../../api/sitemap-listings.js')).default({ query: {} }, res);
  const x = res.body;
  const has = (id) => x.includes('/listing/' + id + '<');
  check('l\'affittata con availableFrom c\'è', has('R1'));
  check('la riservata, la bozza, la fuori mercato e l\'affittata senza data no',
    !has('R2') && !has('D') && !has('O') && !has('C'));
  check('A, B, data illeggibile (H) e data assente (N) ci sono', has('A') && has('B') && has('H') && has('N'));
  check('lastmod da updatedAt timestampValue (2026-09-30)', /listing\/R1<\/loc><lastmod>2026-09-30<\/lastmod>/.test(x));
  check('senza updatedAt, lastmod dal updateTime del documento', /listing\/A<\/loc><lastmod>2026-08-01<\/lastmod>/.test(x));
  check('lettura riuscita: 200 xml e cacheabile (s-maxage=3600)',
    res.statusCode === 200 && /xml/.test(res.headers['content-type'] || '') && /s-maxage=3600/.test(res.headers['cache-control'] || ''));
  // UNA LETTURA FALLITA NON È UN CATALOGO VUOTO (15/10/2026). Prima: 200
  // con un <urlset> vuoto e s-maxage=3600 + swr=86400 — una rivalidazione
  // andata male sostituiva la sitemap buona all'edge per un giorno.
  // MUTAZIONE (verificata a mano): rimettendo `if (r.ok) { … }` senza il
  // ramo 503, cadono «500» e «403»; rimettendo il catch muto cade «throw».
  const sitemap = (await import('../../api/sitemap-listings.js')).default;
  for (const mode of ['500', '403', 'throw', 'paged-fail']) {
    LIST_MODE = mode;
    const r2 = mkRes();
    try { await sitemap({ query: {} }, r2); } finally { LIST_MODE = 'ok'; }
    const cc = r2.headers['cache-control'] || '';
    check(`lista ${mode === 'throw' ? 'con la rete caduta' : mode === 'paged-fail' ? 'con la SECONDA pagina in errore' : 'in errore ' + mode}: 503 + Retry-After 300 + no-store, nessun <urlset>`,
      r2.statusCode === 503 && String(r2.headers['retry-after']) === '300' && /no-store/.test(cc) && !/s-maxage/.test(cc)
      && !/<urlset/.test(r2.body), r2.statusCode + ' · ' + cc + ' · ' + r2.body.slice(0, 80));
  }
  // tutte le pagine: oltre la prima, la sitemap non si ferma a metà
  LIST_MODE = 'paged';
  const r3 = mkRes();
  try { await sitemap({ query: {} }, r3); } finally { LIST_MODE = 'ok'; }
  const ids = [...r3.body.matchAll(/\/listing\/([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  const idsAll = [...x.matchAll(/\/listing\/([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  check('nextPageToken seguito: le stesse schede della lettura in una pagina',
    r3.statusCode === 200 && ids.length > 0 && ids.join() === idsAll.join(), ids.join() + ' vs ' + idsAll.join());
}

// ═══ 4. il concierge AI ═════════════════════════════════════════════════
console.log('\n/api/ask-listing — le politiche che il codice applica davvero');
{
  const s = src('api/ask-listing.js');
  const SYSTEM = s.slice(s.indexOf('const SYSTEM = `'), s.indexOf('`;', s.indexOf('const SYSTEM = `')));
  check('SYSTEM: «22% VAT»', /22% VAT/.test(SYSTEM));
  check('SYSTEM: niente «24/7» né «available in English»', !/24\/7/.test(SYSTEM) && !/available in English/.test(SYSTEM));
  check('SYSTEM: nessuna promessa di tempi di risposta in numeri', !/within \d+ hours?|under \d+ minutes/i.test(SYSTEM));
  check('SYSTEM: niente «held safe with guarantees» né «whichever»', !/held safe|whichever/i.test(SYSTEM));
  check('SYSTEM: il deposito non è «one month on most» (1 casa su 26 lo dichiara, ed è 2)',
    !/one month on most/i.test(SYSTEM) && /three months' rent \(art\. 11, L\. 392\/1978\)/.test(SYSTEM)
    && /if it is not set, say the team will confirm it/.test(SYSTEM));
  check('SYSTEM: niente «filmed» (l\'inventario video non è universale), il verbale di consegna firmato sì',
    !/film/i.test(SYSTEM) && /recorded at check-in in a signed handover report \(verbale di consegna\) and checked against it at move-out/.test(SYSTEM));
  check('FALLBACK: nessuna promessa in ore', !/\d+ hours?/.test((s.match(/const FALLBACK = `([^`]*)`/) || [])[1] || 'x'));
  // la durata (15/10/2026, decisione del fondatore): con BOOM almeno 3 mesi
  // — lo dicono le Condizioni (terms.html) —, il transitorio fino a 18; chi
  // chiede meno di 3 mesi riceve un no, mai una conferma
  const DURATA = /- Lease length: every lease through BOOM is at least 3 months \(Terms of service\); a transitional lease runs up to 18 months\. If someone needs less than 3 months, say BOOM can't offer that stay — never confirm a shorter one\./;
  check('SYSTEM: la durata fra le politiche — almeno 3 mesi (Condizioni), transitorio fino a 18, sotto i 3 mesi un no',
    DURATA.test(SYSTEM) && SYSTEM.indexOf('- Lease length:') > SYSTEM.indexOf('BOOM policies (always true):'));
  check('SYSTEM: nessuna durata sotto i 3 mesi («1 month», «one month», «1–18», «from 1 month»)',
    !/\b(?:1|one)[- ]month\b|\b1\s*[–-]\s*18\b|from (?:1|one) month/i.test(SYSTEM));
  check('le Condizioni dicono davvero il minimo di 3 mesi che il SYSTEM cita',
    /All leases through BOOM have a minimum duration of 3 months/.test(src('terms.html')));
  // il giro vero: i fatti mandati al modello portano billsIncluded e i mesi di deposito
  // settings/ai assente (404 → null) = budget di default, spento: la chiamata passa
  const ENV_ADMIN = { e: process.env.FIREBASE_ADMIN_EMAIL, p: process.env.FIREBASE_ADMIN_PASS };
  process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c'; process.env.FIREBASE_ADMIN_PASS = 'x';
  SIGNIN = true;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  DOCS.A.depositMonths = 2;
  const ask = (await import('../../api/ask-listing.js')).default;
  const res = mkRes();
  await ask({ method: 'POST', headers: { 'x-forwarded-for': '10.9.9.9' }, body: { id: 'A', question: 'Are bills included?' } }, res);
  delete process.env.ANTHROPIC_API_KEY;
  const user = ANTHROPIC_BODY && ANTHROPIC_BODY.messages[ANTHROPIC_BODY.messages.length - 1].content;
  check('i fatti al modello: billsIncluded: true e depositMonths: 2',
    typeof user === 'string' && /billsIncluded: true/.test(user) && /depositMonths: 2/.test(user), user && user.slice(0, 300));
  check('i fatti al modello: onorario IVA compresa di QUESTA casa', typeof user === 'string' && /€2,635 incl\. VAT/.test(user));
  const sysSent = ANTHROPIC_BODY ? (Array.isArray(ANTHROPIC_BODY.system)
    ? ANTHROPIC_BODY.system.map((b) => (b && b.text) || '').join('\n') : String(ANTHROPIC_BODY.system || '')) : '';
  check('al modello arriva il SYSTEM con la riga della durata (il prompt spedito, non solo la sorgente)',
    DURATA.test(sysSent), sysSent.slice(0, 200));
  check('la risposta arriva', res.statusCode === 200 && /Fine\./.test(res.body), res.body);
  check('A: al modello «Availability: Available now.»', typeof user === 'string' && /^Availability: Available now\.$/m.test(user), user);
  // la corsia arriva al modello: un'affittata col contratto non è «libera»
  const factsOf = async (id) => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    ANTHROPIC_BODY = null;
    const r = mkRes();
    await ask({ method: 'POST', headers: { 'x-forwarded-for': '10.9.9.' + id.length }, body: { id, question: 'When can I move in?' } }, r);
    delete process.env.ANTHROPIC_API_KEY;
    return ANTHROPIC_BODY ? ANTHROPIC_BODY.messages[ANTHROPIC_BODY.messages.length - 1].content : '';
  };
  const fR1 = await factsOf('R1');
  check('R1 (affittata, availableFrom dal contratto): «Availability: Occupied now, free from …» e mai «Available now»',
    /^Availability: Occupied now, free from [^\n]+\(release date \d{4}-05-01\)$/m.test(fR1) && !/Available now/.test(fR1), fR1);
  check('R1: il testo libero dell\'operatore arriva etichettato come nota, non come data',
    /^Availability note \(operator text\): 2026-06-01$/m.test(fR1) && !/^Available from:/m.test(fR1), fR1);
  const fC = await factsOf('C');
  check('C (affittata senza data): «Availability: Currently rented.»', /^Availability: Currently rented\.$/m.test(fC), fC);
  const fH = await factsOf('H');
  check('H (data illeggibile): «Ask us for the exact move-in date.», mai «Available now»',
    /^Availability: Ask us for the exact move-in date\.$/m.test(fH) && !/Available now/.test(fH), fH);
  const fN = await factsOf('N');
  check('N (data assente): anche al modello data da chiedere, mai disponibilità immediata',
    /^Availability: Ask us for the exact move-in date\.$/m.test(fN) && !/Available now/.test(fN), fN);
  const fD = await factsOf('D');
  check('D (bozza): «Not currently on the market.»', /^Availability: Not currently on the market\.$/m.test(fD), fD);
  SIGNIN = false;
  if (ENV_ADMIN.e === undefined) delete process.env.FIREBASE_ADMIN_EMAIL; else process.env.FIREBASE_ADMIN_EMAIL = ENV_ADMIN.e;
  if (ENV_ADMIN.p === undefined) delete process.env.FIREBASE_ADMIN_PASS; else process.env.FIREBASE_ADMIN_PASS = ENV_ADMIN.p;
}

// ═══ 5. apartment-detail.html, la sorgente ═══════════════════════════════
console.log('\napartment-detail.html — template, onorario, apply');
{
  const s = src('apartment-detail.html');
  check('template: robots e googlebot noindex', /<meta name="robots" content="noindex, follow">/.test(s)
    && /<meta name="googlebot" content="noindex, follow">/.test(s));
  check('template: la canonical resta', /<link rel="canonical" href="https:\/\/www\.boomrome\.com\/apartment-detail">/.test(s));
  check('onorario: × 1.22 (IVA)', /onorario = Math\.round\(c\.prezzo \* 12 \* \.10 \* 1\.22\);/.test(s));
  const apStart = s.indexOf("var errore = f.querySelector('#apErrore')");
  const ap = s.slice(apStart, s.indexOf('LA LENTE: la foto a tutto schermo', apStart));
  check('apply: keepalive', /keepalive: true/.test(ap));
  const okBranch = ap.indexOf('if (res.ok && j && j.ok) {');
  const okEnd = ap.indexOf('return;', okBranch);
  const calls = [...ap.matchAll(/\bfatto\(\);/g)].map((m) => m.index);
  const demo = ap.indexOf('if (!VERO) {');
  check('apply: la classe di successo si aggiunge solo dentro fatto()', (ap.match(/classList\.add\('si'\)/g) || []).length === 1
    && ap.indexOf("classList.add('si')") > ap.indexOf('function fatto()') && ap.indexOf("classList.add('si')") < demo);
  check('apply: fatto() solo nel ramo res.ok (e nella demo, come prima)',
    okBranch > 0 && calls.length === 2 && calls.every((i) => (i > okBranch && i < okEnd) || (i > demo && i < ap.indexOf('return;', demo))));
  check('apply: boom-conversion solo a conferma del server',
    ap.indexOf("new CustomEvent('boom-conversion'") > okBranch && ap.indexOf("new CustomEvent('boom-conversion'") < okEnd);
  check('apply: errore visibile con role="alert"', /<p class="applica-nota" id="apErrore" role="alert" hidden><\/p>/.test(s));
  check('niente più «within 2 hours» nella scheda', !/within 2 hours/i.test(s));
  // il deposito si versa al LOCATORE e torna «previa verifica» (contratto
  // tipo, js/contract-pdf.js): BOOM non lo tiene e non lo promette nudo
  check('deposito: niente «held, not spent», «comes back to you at the end — held», «returned after the final walkthrough»',
    !/held, not spent|comes back to you at the end|returned after the final walkthrough|it comes back at '\s*\+\s*'the end/.test(s));
  check('registrazione: niente «never passes through us» né «registration tax are paid»',
    !/never passes through us|registration tax are paid|registration tax\. Both/.test(s));
  check('FAQ «quando entro» costruita dalla corsia (quandoEntri), non da `dal` nudo',
    /This one' \+ quandoEntri\(\)/.test(s) && !/This one'\s*\n\s*\+ \(c\.dal \?/.test(s));
  check('listing-facts.js caricato prima della regia', s.indexOf('/js/listing-facts.js') > 0
    && s.indexOf('/js/listing-facts.js') < s.indexOf('LA REGIA DELLA CASA'));
  check('Solari: il montatore svuota l\'host prima delle celle',
    /host\.textContent = '';\s*\n\s*var b = new BS\.Board\(host/.test(s) && /function Board\(host, len, drum\) \{\s*host\.textContent = '';/.test(s));
  check('Solari: il montaggio generico lascia #canoneCasa alla regia',
    /querySelectorAll\('\.flap-prezzo:not\(#canoneCasa\)'\)/.test(s) && !/querySelectorAll\('\.flap-prezzo'\)/.test(s));
  // GA generate_lead: il form si dichiara manuale (boom-track non lo conta
  // al submit) e l'evento parte SOLO nel ramo della conferma del server
  check('apply: <form id="modApplica"> porta data-analytics-manual', /<form id="modApplica"[^>]*\bdata-analytics-manual\b/.test(s));
  const okB = ap.indexOf('if (res.ok && j && j.ok) {'), okE = ap.indexOf('return;', okB);
  const gl = [...ap.matchAll(/generate_lead/g)].map((m) => m.index);
  check('apply: generate_lead una volta sola, dentro il ramo res.ok, con form_id e item_id',
    gl.length === 1 && gl[0] > okB && gl[0] < okE && (s.match(/generate_lead/g) || []).length === 1
    && /'generate_lead',\s*\{ form_id: 'modApplica', item_id: c\.id \|\| '' \}/.test(ap), gl.join());
  // l'idempotenza: UNA chiave per pagina, nel corpo di ogni tentativo
  check('apply: requestId nel corpo, generato una volta fuori dal listener di submit',
    /requestId: apReq/.test(ap) && ap.indexOf('var apReq') > 0
    && ap.indexOf('var apReq') < ap.indexOf("f.addEventListener('submit'") && /crypto\.randomUUID\(\)/.test(ap), '');
  // il controllo alla riconsegna è sul verbale di consegna firmato: il video
  // dell'inventario è uno strumento, non una promessa per ogni casa
  const film = s.match(/filmed in and out|filmed at move-in|is filmed|we filmed it/i);
  check('niente «filmed in and out» / «filmed at move-in» / «we filmed it»', !film, film && film[0]);
  check('il deposito torna dopo il controllo sul verbale firmato (nota statica, nota viva e FAQ)',
    /<em id="cauzioneNota">returned at the end, after the move-out check against the signed check-in report<\/em>/.test(s)
    && /after the move-out check against the signed '\s*\+ 'check-in report'/.test(s)
    && /recorded at check-in in a signed handover '\s*\+ 'report \(verbale di consegna\) and checked against it at move-out/.test(s));
  // una casa CHIESTA e sconosciuta (ripiego 503, casa nata dopo la build)
  // non diventa mai CASE[0]
  const vIdx = s.indexOf('if (!c && ide) { casaIrraggiungibile(); return; }');
  check('via(): un id chiesto e sconosciuto si ferma PRIMA del ripiego su CASE[0]',
    vIdx > 0 && vIdx < s.indexOf('c = c || CASE[0];'));
  check('statoDa(): nascosta/bozza/archiviata/fuori mercato → «Not on the market», «Ask about this home»',
    /if \(\/hidden\|draft\|archived\|off_market\/\.test\(String\(s2 \|\| ''\)\)\)\s*\n\s*return \{ eti: 'Not on the market', lib: false, lane: 'closed',\s*\n\s*cta: 'Ask about this home'/.test(s));
}

// ═══ 6. nel browser: la pagina servita dal server ═══════════════════════
const { loadChromium, launchOptions } = await import('../_browser.mjs');
const chromium = await loadChromium();
if (!chromium) {
  console.log('\nSKIP (browser): playwright non disponibile — le prove della pagina viva non girano');
} else {
  console.log('\nnel browser — APPLY e Solari sulla pagina servita da /listing/A');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
  let applyMode = 400, applyHits = 0;
  const applyBodies = [];
  const server = createServer(async (req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (p.startsWith('/listing/')) {
      const lid = decodeURIComponent(p.slice('/listing/'.length));
      // il ripiego del server su un guasto (503, template nudo) per una casa
      // pubblicata DOPO la build: non è nel CASE e non c'è __LISTING
      if (lid.startsWith('NUOVA')) {
        res.writeHead(503, { 'Content-Type': 'text/html', 'Retry-After': '120' });
        return res.end(OUT.F.body);
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end((OUT[lid] && OUT[lid].statusCode === 200) ? OUT[lid].body : A);
    }
    if (p === '/api/apply-lead') {
      applyHits++;
      let raw = '';
      for await (const ch of req) raw += ch;
      try { applyBodies.push(JSON.parse(raw)); } catch { applyBodies.push(null); }
      if (applyMode === 'down') { req.socket.destroy(); return; }
      res.writeHead(applyMode, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(applyMode === 200 ? { ok: true, id: 'lead1' } : { ok: false, error: 'x' }));
    }
    // cleanUrls come Vercel: /apartment-detail serve apartment-detail.html
    // (è la rotta statica del cancel_url di reserve-checkout)
    const fp = (!extname(p) && p !== '/') ? p + '.html' : p;
    try {
      const buf = await readFile(join(ROOT, fp));
      res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'text/plain' }); res.end(buf);
    } catch { res.writeHead(404); res.end('nope'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch(launchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    await page.addInitScript(() => {
      window.__conv = [];
      window.addEventListener('boom-conversion', (e) => window.__conv.push(e.detail));
      // quante volte si COSTRUISCE un tabellone Solari su #canoneCasa: il
      // montaggio generico e la regia lo facevano entrambi (prezzo che
      // frullava due volte)
      window.__tabelloniCanone = 0;
      let BSv;
      Object.defineProperty(window, 'BoomSolari', {
        configurable: true,
        get() { return BSv; },
        set(v) {
          if (v && typeof v.Board === 'function') {
            const B = v.Board;
            const W = function (host, len, drum) {
              if (host && host.id === 'canoneCasa') window.__tabelloniCanone++;
              return new B(host, len, drum);
            };
            W.prototype = B.prototype;
            v = Object.assign({}, v, { Board: W });
          }
          BSv = v;
        },
      });
    });
    await page.goto(BASE + '/listing/A', { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const prezzo = await page.evaluate(() => {
      const h = document.getElementById('canoneCasa');
      const testi = [...h.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).length;
      return { testi, celle: h.children.length, dp: h.dataset.p };
    });
    check('Solari: niente cifra del server stampata due volte (nessun nodo testo accanto alle celle)',
      prezzo.testi === 0 && prezzo.celle > 0 && prezzo.dp === '€1,800', JSON.stringify(prezzo));
    // MUTAZIONE (verificata a mano): rimettendo querySelectorAll('.flap-prezzo')
    // nel montaggio generico, i tabelloni su #canoneCasa tornano 2
    const tab = await page.evaluate(() => window.__tabelloniCanone);
    check('Solari: #canoneCasa ha UN tabellone (la regia), non due', tab === 1, tab);
    check('apply: il form vivo porta data-analytics-manual',
      await page.evaluate(() => document.getElementById('modApplica').hasAttribute('data-analytics-manual')));
    check('bollette: il paragrafo dice «bills included» per la casa etichettata',
      /bills included/.test(await page.textContent('#chiaviFuori')));
    check('onorario IVA compresa in pagina (€2,635)', (await page.textContent('#voceOnorario')).trim() === '€2,635');

    const leadsGA = () => page.evaluate(() => (window.dataLayer || [])
      .map((a) => Array.prototype.slice.call(a))
      .filter((a) => a[0] === 'event' && a[1] === 'generate_lead' && a[2] && a[2].item_id === 'A'
        && a[2].form_id === 'modApplica').length);

    // 1) validazione: email sbagliata e nessun telefono → niente richiesta
    await page.fill('#apNome', 'Ada Lovelace');
    await page.fill('#apMail', 'ada-at-example');
    await page.click('#modApplica button[type="submit"]');
    await page.waitForTimeout(200);
    check('validazione: messaggio, focus sull\'email, nessuna richiesta',
      applyHits === 0 && !(await page.isHidden('#apErrore'))
      && /Check your email address/.test(await page.textContent('#apErrore'))
      && (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'apMail');

    // 2) il server risponde 400 → niente «Sent»
    await page.fill('#apMail', 'ada@example.org');
    applyMode = 400;
    await page.click('#modApplica button[type="submit"]');
    await page.waitForTimeout(400);
    const st400 = await page.evaluate(() => ({
      fatto: document.getElementById('applicaFatto').classList.contains('si'),
      form: getComputedStyle(document.getElementById('modApplica')).display !== 'none',
      btn: document.querySelector('#modApplica button[type="submit"]').disabled,
      err: document.getElementById('apErrore').hidden ? '' : document.getElementById('apErrore').textContent,
      conv: window.__conv.length,
    }));
    check('APPLY 400: niente «Sent», form visibile, bottone riattivato, errore col WhatsApp',
      applyHits === 1 && !st400.fatto && st400.form && !st400.btn && /\+39 331 325 1961/.test(st400.err) && st400.conv === 0, JSON.stringify(st400));
    check('APPLY 400: nessun generate_lead (la validazione o il server dicono no)', (await leadsGA()) === 0);

    // 3) rete caduta → stesso trattamento
    applyMode = 'down';
    await page.click('#modApplica button[type="submit"]');
    await page.waitForTimeout(500);
    const stDown = await page.evaluate(() => ({
      fatto: document.getElementById('applicaFatto').classList.contains('si'),
      btn: document.querySelector('#modApplica button[type="submit"]').disabled,
      err: !document.getElementById('apErrore').hidden }));
    check('APPLY rete caduta: niente «Sent», bottone riattivato, errore visibile',
      !stDown.fatto && !stDown.btn && stDown.err, JSON.stringify(stDown));
    check('APPLY rete caduta: nessun generate_lead', (await leadsGA()) === 0);

    // 4) il server conferma → «Sent» + boom-conversion
    applyMode = 200;
    await page.click('#modApplica button[type="submit"]');
    await page.waitForTimeout(500);
    const st200 = await page.evaluate(() => ({
      fatto: document.getElementById('applicaFatto').classList.contains('si'),
      form: getComputedStyle(document.getElementById('modApplica')).display,
      conv: window.__conv }));
    check('APPLY 200 {ok:true}: «Sent» e un solo boom-conversion',
      st200.fatto && st200.form === 'none' && st200.conv.length === 1
      && st200.conv[0].label === 'Application sent' && st200.conv[0].section === 'apply', JSON.stringify(st200));
    // MUTAZIONE (verificata a mano): spostando il gtag fuori dal ramo res.ok
    // (prima del fetch) il conteggio dopo il 400 non è più zero
    check('APPLY 200: UN generate_lead (form_id modApplica, item_id della casa), a conferma del server',
      (await leadsGA()) === 1);
    // l'idempotenza: tre tentativi (400, rete caduta, 200) con la STESSA
    // chiave — il server scrive `apply_<requestId>` una volta sola
    const rids = applyBodies.map((b) => b && b.requestId);
    check('APPLY: ogni tentativo porta requestId, valido per il server (/^[\\w-]{8,64}$/) e UGUALE fra i tentativi',
      // ≥ 3: sulla rete caduta Chromium ritenta da solo la richiesta — è
      // proprio il caso in cui la chiave unica evita il lead doppio
      rids.length >= 3 && rids.every((r) => typeof r === 'string' && /^[\w-]{8,64}$/.test(r))
      && new Set(rids).size === 1 && applyBodies.every((b) => b.listingId === 'A'), JSON.stringify(rids));
    check('nessun errore JS nella pagina', errors.length === 0, errors.join(' | '));

    // ── «quando entro?»: la FAQ visibile e il FAQPage (#faqLd) seguono la
    // corsia. Prima un'affittata senza data diceva «This one is available
    // now» sotto il badge «Rented», e la frase finiva nel dato strutturato.
    const leggi = async (url) => {
      const pg = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errs = [];
      pg.on('pageerror', (e) => errs.push(String(e)));
      await pg.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
      await pg.goto(BASE + url, { waitUntil: 'load' });
      await pg.waitForTimeout(900);
      const out = await pg.evaluate(() => {
        let faq = null;
        try { faq = JSON.parse(document.getElementById('faqLd').textContent); } catch (e) {}
        const q = faq && faq.mainEntity.find((x) => /How fast can I actually move in/.test(x.name));
        const vis = [...document.querySelectorAll('#chiediLista details')]
          .find((d) => /How fast can I actually move in/.test(d.querySelector('summary').textContent));
        return {
          ld: q ? q.acceptedAnswer.text : '',
          vis: vis ? vis.querySelector('p').textContent : '',
          ldAll: faq ? JSON.stringify(faq) : '',
          stato: (document.getElementById('statoCasa') || {}).textContent || '',
          dur: (document.getElementById('durNota') || {}).textContent || '',
          cauz: (document.getElementById('cauzioneNota') || {}).textContent || '',
          voceCauz: (document.getElementById('voceCauzione') || {}).textContent || '',
        };
      });
      await pg.close();
      return { ...out, errs };
    };
    const fA = await leggi('/listing/A');
    check('A (Subito): «This one is available now.» nella FAQ e nel FAQPage',
      /This one is available now\.$/.test(fA.ld) && fA.ld === fA.vis, JSON.stringify(fA.ld));
    check('A (bollette incluse): la nota della durata non dice «utilities are paid to the providers»',
      /listed with bills included/.test(fA.dur) && !/Utilities are paid/.test(fA.dur), fA.dur);
    check('A (mensilità di deposito non dichiarate): «confirmed in your pre-agreement»',
      /confirmed in your pre-agreement/.test(fA.cauz) && /shown as one month/.test(fA.ldAll), fA.cauz);
    const fN = await leggi('/listing/N');
    check('N (data assente): badge e FAQ visibile/schema chiedono la data senza dire available now',
      fN.stato === 'Ask us for the date' && /This one: ask us for the exact move-in date\.$/.test(fN.ld)
      && fN.ld === fN.vis && !/available now/i.test(fN.ldAll), JSON.stringify(fN));
    const fC = await leggi('/listing/C');
    check('C (affittata, senza data): badge «Rented» e FAQ «is rented right now», mai «available now» nel FAQPage',
      fC.stato === 'Rented' && /This one is rented right now\.$/.test(fC.ld) && !/available now/i.test(fC.ldAll)
      && fC.ld === fC.vis, JSON.stringify({ stato: fC.stato, ld: fC.ld }));
    const fB = await leggi('/listing/B');
    const bIso = DISPO.marketLane(DOCS.B).iso;
    const bDay = new Date(bIso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    check(`B (waitlist con data): FAQ «is free from ${bDay} and can be reserved today»`,
      fB.ld.endsWith('This one is free from ' + bDay + ' and can be reserved today.') && !/available now/i.test(fB.ld), fB.ld);
    check('B (bollette non incluse): la nota della durata dice utenze ai fornitori, tasse «follow the lease»',
      /Utilities are paid to the providers; condominium charges and any registration tax follow the lease\./.test(fB.dur), fB.dur);
    const fR = await leggi('/listing/R1');
    const rDay = new Date(FUT('05', '01') + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    check(`R1 (affittata, contratto fino al ${rDay}, residuo 2026-06-01): la FAQ dice la data della corsia`,
      fR.ld.endsWith('This one is free from ' + rDay + ' and can be reserved today.') && !/June 2026/.test(fR.ld), fR.ld);
    check('R1 (depositMonths: 2 dichiarato): deposito €2,200 e nota senza «confirmed in your pre-agreement»',
      fR.voceCauz.trim() === '€2,200' && !/confirmed in your pre-agreement/.test(fR.cauz)
      && /after the move-out check/.test(fR.cauz) && !/shown as one month/.test(fR.ldAll), JSON.stringify({ v: fR.voceCauz, n: fR.cauz }));
    // la fotografia di build (template statico, nessun documento, rete
    // finta giù): la corsia si deduce dal badge, e nel dubbio mai «now»
    const CASE = JSON.parse((src('apartment-detail.html').match(/var CASE = (\[.*\]);\n/) || [])[1] || '[]');
    const oggi = new Date().toISOString().slice(0, 10);
    const rented = CASE.find((x) => x.stato === 'Rented' && x.dal && x.dal > oggi);
    if (rented) {
      const fS = await leggi('/apartment-detail.html?id=' + encodeURIComponent(rented.id));
      check(`fotografia di build: «${rented.nome}» Rented con dal futuro → «is rented right now», mai «available from»`,
        /This one is rented right now\.$/.test(fS.ld) && !/available/i.test(fS.ld), fS.ld);
    } else check('fotografia di build: nessuna casa Rented con dal futuro nel CASE (niente da provare)', true);
    const vecchia = CASE.find((x) => /wait/i.test(x.stato) && x.dal && x.dal <= oggi);
    if (vecchia) {
      const fW = await leggi('/apartment-detail.html?id=' + encodeURIComponent(vecchia.id));
      check(`fotografia di build: «${vecchia.nome}» in attesa con dal passato → «ask us for the release date»`,
        /This one can be reserved ahead — ask us for the release date\.$/.test(fW.ld), fW.ld);
    } else check('fotografia di build: nessuna casa in attesa con dal passato nel CASE (niente da provare)', true);
    const errFaq = [fA, fB, fC, fR].flatMap((x) => x.errs);
    check('nessun errore JS sulle pagine della FAQ', errFaq.length === 0, errFaq.join(' | '));

    // ── FUORI MERCATO e CASA SCONOSCIUTA: cosa vede chi arriva da un vecchio
    // link. Un'archiviata non invita ad APPLY; una casa chiesta che la pagina
    // non conosce (ripiego 503, nata dopo la build) non diventa CASE[0].
    const apri = async (url) => {
      const pg = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errs = [];
      pg.on('pageerror', (e) => errs.push(String(e)));
      await pg.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
      await pg.goto(BASE + url, { waitUntil: 'load' });
      await pg.waitForTimeout(900);
      const vis = (id) => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== 'none'; };
      const out = await pg.evaluate((visSrc) => {
        const vis = new Function('return ' + visSrc)();
        let faq = null;
        try { faq = JSON.parse(document.getElementById('faqLd').textContent); } catch (e) {}
        const q = faq && faq.mainEntity.find((x) => /How fast can I actually move in/.test(x.name));
        const det = [...document.querySelectorAll('#chiediLista details')]
          .find((d) => /How fast can I actually move in/.test(d.querySelector('summary').textContent));
        const btn = document.querySelector('#modApplica button[type="submit"]');
        return {
          h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
          stato: (document.getElementById('statoCasa') || {}).textContent || '',
          btn: btn ? btn.textContent.trim() : '',
          sotto: (document.getElementById('applicaSotto') || {}).textContent || '',
          applica: vis('applica'), form: vis('modApplica'), presa: vis('presaCasa'), denaro: vis('denaro'),
          decVai: (document.getElementById('decVai') || {}).textContent || '',
          decHidden: (document.getElementById('decisione') || {}).hidden,
          dove: (document.getElementById('doveCasa') || {}).innerHTML || '',
          ld: q ? q.acceptedAnswer.text : '', visFaq: det ? det.querySelector('p').textContent : '',
          title: document.title,
        };
      }, vis.toString());
      return { pg, out, errs };
    };
    {
      const { pg, out, errs } = await apri('/listing/D');
      check('D (bozza) nel browser: badge «Not on the market», CTA «Ask about this home» (mai Apply), niente hold',
        out.stato === 'Not on the market' && out.btn === 'Ask about this home' && !/apply/i.test(out.btn)
        && !out.presa && /not on the market right now/.test(out.sotto) && out.decVai === 'Ask', JSON.stringify(out));
      check('D: la FAQ «quando entro» dice «not on the market», uguale nel FAQPage',
        /This one is not on the market right now\.$/.test(out.ld) && out.ld === out.visFaq, out.ld);
      check('D: nessun errore JS', errs.length === 0, errs.join(' | '));
      await pg.close();
    }
    if (LIBERA_BUILD) {
      // MUTAZIONE (verificata a mano): togliendo rifaiCta() dall'idrante il
      // bottone resta «Send application» su una casa archiviata
      const { pg, out, errs } = await apri('/listing/' + encodeURIComponent(LIBERA_BUILD.id));
      check(`«${LIBERA_BUILD.nome}» libera nella build, archiviata nel documento: il browser passa a «Not on the market» e «Ask about this home»`,
        out.stato === 'Not on the market' && out.btn === 'Ask about this home' && !out.presa
        && out.decVai === 'Ask' && /not on the market right now/.test(out.sotto), JSON.stringify(out));
      check('…e nessun errore JS', errs.length === 0, errs.join(' | '));
      await pg.close();
    }
    {
      const hitsPrima = applyHits;
      const { pg, out, errs } = await apri('/listing/NUOVA42');
      check('casa chiesta e sconosciuta (503, nata dopo la build): «This home is temporarily unavailable», mai la casa d\'esempio',
        out.h1.length === 1 && out.h1[0] === 'This home is temporarily unavailable'
        && !haEsempio(out.h1.join() + out.title) && /temporarily unavailable/.test(out.title), JSON.stringify(out.h1));
      check('…Retry e WhatsApp al posto dell\'indirizzo',
        /id="riprovaCasa"[^>]*>Retry<\/a>/.test(out.dove) && /href="https:\/\/wa\.me\/393313251961[^"]*"[^>]*>WhatsApp BOOM<\/a>/.test(out.dove), out.dove);
      check('…APPLY, hold, soldi e barra di decisione nascosti',
        !out.applica && !out.presa && !out.denaro && out.decHidden === true, JSON.stringify(out));
      // nemmeno un submit forzato parte: niente lead col listingId di un'altra casa
      const urlPrima = pg.url();
      await pg.evaluate(() => {
        const f = document.getElementById('modApplica');
        f.querySelector('#apNome').value = 'Ada'; f.querySelector('#apMail').value = 'ada@example.org';
        if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit', { cancelable: true }));
        const h = document.getElementById('presaForma');
        if (h && h.requestSubmit) h.requestSubmit();
      });
      await pg.waitForTimeout(300);
      check('…un submit forzato non manda niente e non naviga', applyHits === hitsPrima && pg.url() === urlPrima,
        (applyHits - hitsPrima) + ' · ' + pg.url());
      check('…nessun errore JS', errs.length === 0, errs.join(' | '));
      check('…su /listing/<id> (SSR) Retry ricarica la stessa pagina',
        /id="riprovaCasa"/.test(out.dove) && /href="https?:\/\/[^"]*\/listing\/NUOVA42"/.test(out.dove), out.dove);
      await pg.close();
    }
    {
      // LA ROTTA STATICA /apartment-detail?id=<id>: ci atterra chi annulla
      // l'hold da €300 su Stripe (cancel_url di reserve-checkout). Lì non c'è
      // SSR né __LISTING, quindi una casa nata dopo la build non si risolve
      // MAI: Retry che ricaricava la stessa URL era un vicolo cieco. Deve
      // portare alla rotta del server. E su desktop la rotaia e «Three more»
      // non devono restare sopra sezioni nascoste e una griglia vuota.
      // MUTAZIONE (verificata a mano): rimesso rip.href = location.href, il
      // primo check cade; tolto l'occultamento, cadono rotaia e altre.
      const hitsPrima = applyHits;
      const pg = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errs = [];
      pg.on('pageerror', (e) => errs.push(String(e)));
      await pg.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
      const resp = await pg.goto(BASE + '/apartment-detail?id=NUOVA42', { waitUntil: 'load' });
      await pg.waitForTimeout(900);
      const out = await pg.evaluate(() => {
        const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
        const rip = document.getElementById('riprovaCasa');
        const altre = document.getElementById('altre');
        const altreH = altre && altre.closest('.sale') ? altre.closest('.sale').querySelector('h2') : null;
        return {
          h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
          ripHref: rip ? rip.getAttribute('href') : null,
          rotaia: vis(document.getElementById('rotaia')),
          altre: vis(altre), altreH: vis(altreH),
          applica: vis(document.getElementById('applica')),
          presa: vis(document.getElementById('presaCasa')),
        };
      });
      check('rotta statica /apartment-detail?id=NUOVA42: servita, «This home is temporarily unavailable»',
        resp && resp.status() === 200 && out.h1.length === 1 && out.h1[0] === 'This home is temporarily unavailable', JSON.stringify(out));
      check('…Retry porta alla rotta del server /listing/NUOVA42 (mai la stessa URL statica)',
        out.ripHref === '/listing/NUOVA42', String(out.ripHref));
      check('…su desktop la rotaia non punta a sezioni nascoste e «Three more» non sta sopra una griglia vuota',
        !out.rotaia && !out.altre && !out.altreH, JSON.stringify(out));
      check('…APPLY e hold nascosti anche qui', !out.applica && !out.presa, JSON.stringify(out));
      // il tap su Retry naviga davvero alla rotta del server (che qui, nel
      // finto server, risponde col ripiego 503: basta che ci arrivi)
      const [nav] = await Promise.all([
        pg.waitForNavigation({ waitUntil: 'load' }).catch(() => null),
        pg.click('#riprovaCasa'),
      ]);
      check('…il tap su Retry apre /listing/NUOVA42', new URL(pg.url()).pathname === '/listing/NUOVA42', pg.url());
      check('…nessuna candidatura partita, nessun errore JS', applyHits === hitsPrima && errs.length === 0,
        (applyHits - hitsPrima) + ' · ' + errs.join(' | '));
      await pg.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}

console.log(fail
  ? `\nLISTING: ${fail} GUASTI su ${pass + fail}`
  : `\nLISTING: TUTTO VERDE (${pass} check)`);
process.exit(fail ? 1 : 0);
