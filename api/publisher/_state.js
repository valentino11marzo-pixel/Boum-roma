// api/publisher/_state.js — IL PUBBLICISTA, il motore puro.
//
// IL PROBLEMA: pubblicare su Immobiliare e Idealista oggi dipende da una
// risposta che non arriva. Il feed 2.0 è pronto (api/feed/immobiliare.js) ma
// l'attivazione passa dal Support tecnico — che non risponde; Idealista apre
// il caricamento real-time SOLO ai software partner (Miogest, Gestim…),
// nessuna specifica pubblica. Aspettare = non pubblicare.
//
// LA SOLUZIONE: un binario di pubblicazione INDIPENDENTE dalle loro risposte.
// Il server fa TUTTO il pensiero (cosa va creato/aggiornato/rimosso, con il
// payload completo già normalizzato); il Mac di Homie fa solo il gesto
// meccanico — e può usare QUALUNQUE porta sia aperta in quel momento:
//
//   Porta A (quando/se il Support attiva): REST PUT del nodo XML singolo
//            (?id= sul feed) o consegna FTP del batch. Zero rilavorazione.
//   Porta B (OGGI): il pannello agenzia dei portali stessi — l'account è
//            NOSTRO, gli annunci sono NOSTRI: è l'automazione del proprio
//            back office, la stessa cosa che fa un gestionale.
//
// Il diff è guidato dallo STATO, non dalla memoria del Mac: ogni listing ha
// un hash del contenuto pubblicabile; hash diverso da quello pubblicato =
// serve un update. Il Mac può morire a metà giro e niente si duplica, niente
// si perde — al giro dopo la worklist è ricalcolata da zero.
//
// Regole d'onestà che viaggiano nel payload:
//   · la precisione del pin NON si spaccia (showExactAddress solo su
//     via+civico veri, da boom-geo — stessa regola del sito e del feed);
//   · le feature arrivano UMANIZZATE in IT e EN (mai "washing_machine" in
//     un annuncio pubblico — la lezione del template del wizard);
//   · un campo che il listing non ha NON esiste nel payload: mai inventare.
//
// Tutto esportato e testato: node tests/publisher/run.mjs

import crypto from 'node:crypto';
import { publishable, typologyId, feedKey } from '../feed/immobiliare.js';
import { FEATURE_LABELS } from '../wizard/describe.js';
import GEO from '../../js/boom-geo.js';

export { publishable }; // UNA regola di pubblicabilità: vetrina, feed e Pubblicista non possono divergere

export const PORTALS = ['immobiliare', 'idealista'];
export const MAX_ATTEMPTS = 3;          // dopo 3 fallimenti sullo STESSO contenuto: parcheggiato, non a vuoto
export const SUGGESTED_INTERVAL_MINUTES = 30;

const FEATURE_LABELS_IT = {
  ac: 'aria condizionata', elevator: 'ascensore', balcony: 'balcone',
  terrace: 'terrazzo', washing_machine: 'lavatrice', dishwasher: 'lavastoviglie',
  parking: 'posto auto', storage: 'cantina', pets_allowed: 'animali ammessi',
  wifi: 'WiFi incluso', double_glazing: 'doppi vetri', doorman: 'portineria',
};
// Un codice sconosciuto non passa mai grezzo: underscore → spazio.
const label = (code, map) => map[code] || String(code || '').replace(/_/g, ' ').trim();

const num = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };
const str = (v) => { const s = String(v == null ? '' : v).trim(); return s || null; };

/**
 * Il CONTENUTO pubblicabile di un listing — la parte che, se cambia, deve
 * cambiare anche sull'annuncio online. È usata SIA dall'hash SIA dal payload:
 * una sola funzione, così non possono divergere (un campo aggiunto qui entra
 * nell'hash e fa ripartire gli update — che è esattamente ciò che deve fare).
 * Campi volatili (viste, interessati, photosEnhancedBy…) restano fuori.
 */
export function coreContent(l) {
  const photos = (Array.isArray(l.images) ? l.images : (l.image ? [l.image] : []))
    .filter(Boolean).map(String).slice(0, 30);
  return {
    id: str(l.id),
    name: str(l.name),
    type: str(l.type),
    zone: str(l.zone),
    address: str(l.address),
    price: num(l.price),
    depositMonths: num(l.depositMonths),
    deposit: num(l.deposit),
    sqm: num(l.sqm || l.size),
    beds: num(l.beds || l.bedrooms),
    bathrooms: num(l.bathrooms || l.baths),
    floor: str(l.floor),
    furnished: typeof l.furnished === 'boolean' ? l.furnished : null,
    availableDate: str(l.availableDate),
    energyClass: str(l.energyClass),
    concordato: typeof l.concordato === 'boolean' ? l.concordato : null,
    descriptionIt: str(l.description || l.descriptionIt),
    descriptionEn: str(l.descriptionEn || l.description),
    features: (Array.isArray(l.features) ? l.features : []).filter(Boolean).map(String),
    video: str(l.video || l.videoUrl),
    photos, // l'ordine conta: la prima è la copertina
  };
}

export function publishHash(l) {
  return crypto.createHash('sha1').update(JSON.stringify(coreContent(l))).digest('hex');
}

/**
 * Il payload che il Mac riceve: il contenuto + la geografia onesta + i
 * suggerimenti specifici del portale. Tutto ciò che serve per riempire un
 * pannello (o un PUT REST) senza pensare — e senza mai inventare.
 */
export function payloadFor(l, portal) {
  const core = coreContent(l);
  const lat = Number((l.geo && l.geo.lat) != null ? l.geo.lat : l.lat);
  const lng = Number((l.geo && l.geo.lng) != null ? l.geo.lng : l.lng);
  const prec = ((GEO && GEO.pinPrecision) ? GEO.pinPrecision({ ...l, lat, lng }) : { level: 'none' }).level;
  const payload = {
    ...core,
    featuresLabels: {
      it: core.features.map((f) => label(f, FEATURE_LABELS_IT)),
      en: core.features.map((f) => label(f, FEATURE_LABELS)),
    },
    geo: (isFinite(lat) && isFinite(lng) && lat !== 0)
      ? { lat, lng, precision: prec }
      : { lat: null, lng: null, precision: 'none' },
    // Il toggle "mostra indirizzo esatto" dei pannelli segue boom-geo:
    // su una via senza civico il portone sotto il pin è arbitrario.
    showExactAddress: prec === 'exact',
    url: 'https://boomrome.com/listing/' + core.id,
  };
  if (portal === 'immobiliare') {
    payload.hints = {
      typologyId: typologyId(l),
      istatCity: '058091',
      // La porta REST già pronta: il nodo <property> di QUESTO listing.
      xmlNodePath: '/api/feed/immobiliare.xml?k=' + feedKey() + '&id=' + encodeURIComponent(core.id || ''),
    };
  } else if (portal === 'idealista') {
    payload.hints = {
      operation: 'rent',
      propertyType: /stanza|room/i.test(core.type || '') ? 'stanza' : 'appartamento',
    };
  } else {
    payload.hints = {};
  }
  return payload;
}

/**
 * La worklist: cosa il Mac deve fare ADESSO su un portale, calcolata da
 * catalogo + stato pubblicazioni. Ordine = onestà prima del fatturato:
 *   1. remove  — un annuncio online per una casa affittata genera lead da
 *                rifiutare e visite a vuoto: è la prima cosa da togliere;
 *   2. create  — il nuovo pubblicabile;
 *   3. update  — il già pubblicato il cui contenuto è cambiato.
 * Un fallimento ripetuto (MAX_ATTEMPTS sullo stesso hash) PARCHEGGIA
 * l'azione invece di girare a vuoto — ma se l'operatore modifica il listing
 * (hash nuovo) il parcheggio si sblocca da solo: la correzione arriva quasi
 * sempre da lì.
 */
export function worklist(listings, pubs, { portal, limit = 20 } = {}) {
  const byListing = new Map();
  for (const p of pubs || []) {
    if (!p) continue;
    if (portal && p.portal && p.portal !== portal) continue;
    const lid = p.listingId || String(p.id || '').replace(new RegExp('^' + portal + '_'), '');
    if (lid) byListing.set(lid, p);
  }

  const actions = [];
  const stats = { publishable: 0, live: 0, parked: 0, toCreate: 0, toUpdate: 0, toRemove: 0 };

  for (const l of listings || []) {
    if (!l || !l.id) continue;
    const pub = byListing.get(l.id) || null;
    const wanted = publishable(l);
    const isLive = !!(pub && pub.wasLive === true);
    if (wanted) stats.publishable++;
    if (isLive) stats.live++;

    const h = publishHash(l);
    let op = null;
    if (wanted && !isLive) op = 'create';
    else if (wanted && isLive && pub.hash !== h) op = 'update';
    else if (!wanted && isLive) op = 'remove';
    if (!op) continue;

    // parcheggio: stesso contenuto già fallito MAX_ATTEMPTS volte
    const parked = pub && pub.status === 'error' && (Number(pub.attempts) || 0) >= MAX_ATTEMPTS
      && (op === 'remove' || pub.failedHash === h);
    if (parked) { stats.parked++; continue; }

    if (op === 'create') stats.toCreate++;
    if (op === 'update') stats.toUpdate++;
    if (op === 'remove') stats.toRemove++;
    actions.push({
      op, id: l.id, name: l.name || l.id, hash: h,
      remoteId: (pub && pub.remoteId) || null,
      remoteUrl: (pub && pub.remoteUrl) || null,
      attempts: (pub && pub.status === 'error' && Number(pub.attempts)) || 0,
    });
  }

  const rank = { remove: 0, create: 1, update: 2 };
  actions.sort((a, b) => rank[a.op] - rank[b.op]);
  return { actions: actions.slice(0, Math.max(1, limit)), stats };
}

/**
 * Il giro è andato bene? La lezione degli occhi di Homie, applicata alla
 * pubblicazione: "niente da fare" e "il pannello mi ha sbattuto fuori"
 * arrivano entrambi come un giro senza pubblicazioni, ma solo il secondo è
 * un guasto — e se non lo distinguiamo, l'operatore crede che il catalogo
 * sia online mentre non lo è. Un giro a vuoto (worklist vuota) è SALUTE:
 * il catalogo è già allineato. Tutto fallito o sessione bloccata è guasto.
 */
export function runVerdict(body = {}) {
  if (body.ok === false || body.blocked === true) return false;
  const rs = Array.isArray(body.results) ? body.results : [];
  if (!rs.length) return true;
  return rs.some((r) => r && r.ok === true);
}
