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
import { publishable, typologyId, feedKey, isRoom } from '../feed/immobiliare.js';
import { FEATURE_LABELS } from '../wizard/describe.js';
import GEO from '../../js/boom-geo.js';
import DISPO from '../../js/dispo-engine.js';
import FACTS from '../../js/listing-facts.js';
import { publicationBlocked } from './_adoption.js';

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

// L'arredo come lo scrive il catalogo: il bot e il suo interprete
// (api/wizard/interpret.js) scrivono 'yes' · 'partial' · 'no', i dati storici
// a volte un booleano. Fino al 15/10/2026 coreContent accettava SOLO il
// booleano, quindi ogni casa vera arrivava al pannello con furnished null:
// «arredato» non c'era mai. Ora: sì → true, no → false; parzialmente arredato
// è un terzo fatto, né sì né no, e viaggia come 'partial' (mai arrotondato a
// true o a false). Chi legge il campo confronta con === true / === false,
// come field_rows sul Mac (bot/boom_publisher.py), che per 'partial'
// compila «parzialmente arredato». Un valore sconosciuto → null. La regola
// vive in UNA copia (js/listing-facts.js), la stessa che legge il telefono.
export const furnishedOf = FACTS.furnishedOf;

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
    // «Camere» nel pannello: la regola unica (js/listing-facts.js), non più
    // `Number(l.beds || l.bedrooms)` — che sul testo libero del bot («1
    // bedroom», «2 BR») dava null e su «3» (un bilocale) dava 3. Il valore
    // cambia per quelle case, quindi cambia l'hash e il loro update torna
    // in coda per ogni portale: voluto, il contenuto pubblicato era sbagliato.
    // 0 (monolocale) resta fuori come prima: num() scarta lo zero.
    beds: num(FACTS.bedroomsOf(l)),
    bathrooms: num(l.bathrooms || l.baths),
    floor: str(l.floor),
    furnished: furnishedOf(l.furnished),
    // La data NORMALIZZATA entra nel contenuto: il pannello del portale
    // riceve "2026-09-01", non "Sep 2026". Aggiungerla qui cambia l'hash di
    // ogni annuncio e rimette in coda un update per portale — che è
    // esattamente ciò che deve succedere, perché il contenuto è cambiato.
    availableFrom: str(DISPO.resolve(l).iso || (DISPO.resolve(l).kind === 'now' ? 'Subito' : '')),
    availableDate: str(l.availableDate),
    energyClass: str(l.energyClass),
    concordato: typeof l.concordato === 'boolean' ? l.concordato : null,
    // Le lingue VERE del catalogo: `description` è l'INGLESE (bot, sweep di
    // api/wizard/describe.js, Media Studio), `descriptionIt` l'italiano.
    // Fino al 15/10/2026 descriptionIt era `description || descriptionIt`:
    // il pannello riceveva come italiano il testo inglese di ogni casa.
    // Senza italiano il campo è null (il Mac non compila la riga), mai la
    // traduzione che non abbiamo. Stessa regola del feed (language="it").
    descriptionIt: str(l.descriptionIt),
    descriptionEn: str(l.descriptionEn) || str(l.description),
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
      // la stessa regola del feed (parola intera, tipo o nome): con
      // /stanza|room/ sul tipo «Capri 2 Bed» (" Spacious 2 Bedroom flat ")
      // andava a Idealista come stanza
      propertyType: isRoom(l) ? 'stanza' : 'appartamento',
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
  const blockedListings = new Set();
  for (const p of pubs || []) {
    if (!p) continue;
    if (portal && p.portal && p.portal !== portal) continue;
    const lid = p.listingId || String(p.id || '').replace(new RegExp('^' + portal + '_'), '');
    if (lid) byListing.set(lid, p);
    if (lid && publicationBlocked(p)) blockedListings.add(lid);
  }

  const actions = [];
  const stats = { publishable: 0, live: 0, parked: 0, referenceOnly: 0, toCreate: 0, toUpdate: 0, toRemove: 0 };

  for (const l of listings || []) {
    if (!l || !l.id) continue;
    const pub = byListing.get(l.id) || null;
    const wanted = publishable(l);
    const isLive = !!(pub && pub.wasLive === true);
    if (wanted) stats.publishable++;
    if (isLive) stats.live++;

    // Adoption records identify an existing ad; they authorize no operation,
    // including removal. A changed price/hash must never unlock this veto.
    if (blockedListings.has(l.id)) { stats.referenceOnly++; continue; }

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
