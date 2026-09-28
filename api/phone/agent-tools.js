// api/phone/agent-tools.js — gli occhi della receptionist durante la chiamata.
//
// L'agente ElevenLabs, MENTRE parla col cliente, chiama questi tool per non
// inventare mai niente (la regola d'oro di ogni bot BOOM):
//   GET ?k=<chiave>&op=catalog            → le case DAVVERO disponibili
//       &reference=<id|url|remoteId>       → UNA casa verificata, se mappata
//       &query=<nome|indirizzo>&type=&zone=&maxPrice=&moveIn=
//                                          → al massimo due candidati
//   GET ?k=<chiave>&op=slots&mode=video   → gli slot visita DAVVERO liberi
//
// Il catalogo è il Firestore vero; gli slot escono da viewings/_avail.js —
// la STESSA griglia di book.html, della pagina self-service e del picker
// Telegram (la disciplina "una copia sola": la voce al telefono non può
// promettere uno slot che la pagina web negherebbe un minuto dopo).
//
// La receptionist NON prenota qui e NON promette messaggi che nessuno manda.
// A fine chiamata il webhook (api/phone/elevenlabs.js) scrive phoneCalls,
// crea il lead e manda a Valentino la card Telegram con la bozza: se e quando
// ricontattare lo decide lui. Quindi le note dette al telefono non promettono
// niente, nemmeno il richiamo — la lezione del 15/09/2026: «held», «the team
// confirms within a few hours», «booking link on WhatsApp shortly» e poi
// «he will get back to you» erano tutte promesse senza un esecutore dietro.
// Un orario preferito è una richiesta, non una prenotazione. La prenotazione
// vera resta sulle rail esistenti (book.html / operatore): un booking a voce
// senza email produrrebbe una visita senza kit.
//
// Auth: ?k=<phoneKey derivata> o X-Homie-Secret (come le altre porte phone).
// Risposte PICCOLE e parlabili: finiscono nel contesto vocale dell'agente.

import { fsGet, fsList } from '../homie/_lib.js';
import DISPO from '../../js/dispo-engine.js';
import { checkPhoneAuth, qparam } from './_lib.js';
import { TZ, loadConfig, busyBlocks, buildSlots, listingCtx } from '../viewings/_avail.js';

const HIDDEN_STATUSES = new Set(['draft', 'hidden', 'archived']);
const UNAVAILABLE_STATUSES = new Set(['rented', 'affittato', 'off_market', 'reserved']);
const CATALOG_SCAN_LIMIT = 60;
const CATALOG_RESPONSE_LIMIT = 25;
const UNAVAILABLE_RESPONSE_LIMIT = 8;
const CATALOG_LIMIT = 200;
const PORTAL_PUBS_LIMIT = 800;
const text = (v, max = 180) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
const floorText = (v) => typeof v === 'number' && Number.isFinite(v) ? String(v) : text(v);
const number = (v) => (typeof v === 'number' || typeof v === 'string' && v.trim())
  && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;
const fold = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const searchTokens = (v) => [...new Set(fold(v).split(' ').filter(w => w.length >= 4))];
const isoDay = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

// Projection pubblica soltanto: il tool voce non deve mai ricevere note,
// telefoni del proprietario o altri campi privati del documento Firestore.
// DISPO resta l'unica autorita sulla data; lo status esplicito vince sulla
// descrizione commerciale e una waitlist non diventa "libera ora".
function catalogEntry(l, today) {
  const status = text(l.status)?.toLowerCase() || null;
  const normalized = { ...l, status };
  const lane = DISPO.marketLane(normalized, today);
  const unavailable = UNAVAILABLE_STATUSES.has(status);
  const state = unavailable ? 'unavailable'
    : !['available', 'waitlist'].includes(status) || lane.dateUnreadable ? 'needs_confirmation'
    : lane.lane === 'ahead' ? 'available_later' : lane.lane === 'now' ? 'available_now' : 'unavailable';
  return {
    id: l.id, name: text(l.name), address: text(l.address), zone: text(l.zone),
    type: text(l.type), status,
    priceEurMonth: number(l.price), bedrooms: number(l.bedrooms ?? l.beds),
    sqm: number(l.sqm ?? l.size), bathrooms: number(l.bathrooms), floor: floorText(l.floor),
    furnished: typeof l.furnished === 'boolean' ? l.furnished : null,
    depositMonths: number(l.depositMonths),
    availableFrom: text(l.availableFrom) || text(l.availableDate),
    availability: { state, date: lane.iso, precision: lane.precision,
      yearInferred: lane.yearGuessed, source: lane.source },
    description: text(l.description, 600), descriptionIt: text(l.descriptionIt, 600),
    descriptionTruncated: typeof l.description === 'string' && l.description.trim().length > 600
      || typeof l.descriptionIt === 'string' && l.descriptionIt.trim().length > 600,
    features: Array.isArray(l.features) ? l.features.map(v => text(v, 80)).filter(Boolean).slice(0, 15) : [],
    url: `https://www.boomrome.com/listing/${encodeURIComponent(l.id)}`,
  };
}

// Il catalogo generico entra intero nel contesto della chiamata: resta
// intenzionalmente piccolo e compatibile col contratto storico. I dettagli
// costosi servono soltanto al resolver mirato (massimo due schede).
function catalogSummary(entry) {
  return {
    id: entry.id, name: entry.name, type: entry.type, zone: entry.zone,
    priceEurMonth: entry.priceEurMonth, bedrooms: entry.bedrooms, sqm: entry.sqm,
    furnished: entry.furnished, availableFrom: entry.availableFrom, url: entry.url,
  };
}

// Ponte compatto per il tool live ancora senza parametri dinamici: permette
// di riconoscere una casa chiusa senza offrirla come alternativa. Non ripete
// descrizioni e feature (sono nel lookup mirato), non fa altre letture e ha
// un cap separato per non rallentare la conversazione.
function unavailableIdentity(entry) {
  return {
    id: entry.id, name: entry.name, address: entry.address, type: entry.type,
    status: entry.status, priceEurMonth: entry.priceEurMonth, url: entry.url,
  };
}

function inputValue(req, name, max = 240) {
  const raw = qparam(req, name);
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value.trim().slice(0, max) : value == null ? '' : String(value).trim().slice(0, max);
}

function normalizedUrl(raw) {
  try {
    const url = new URL(raw);
    url.hash = '';
    url.search = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/$/, '');
  } catch { return null; }
}

function boomListingId(raw) {
  try {
    const url = new URL(raw);
    if (!['boomrome.com', 'www.boomrome.com'].includes(url.hostname.toLowerCase())) return null;
    const m = url.pathname.match(/^\/listing\/([^/]+)\/?$/);
    if (!m) return null;
    return decodeURIComponent(m[1]).slice(0, 180);
  } catch { return null; }
}

function externalPortal(raw) {
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'boomrome.com') return null;
    if (host === 'immobiliare.it' || host.endsWith('.immobiliare.it')) return 'immobiliare';
    if (host === 'idealista.it' || host.endsWith('.idealista.it')) return 'idealista';
    return 'external';
  } catch { return null; }
}

function remoteIdFromUrl(raw) {
  try {
    const parts = new URL(raw).pathname.split('/').filter(Boolean);
    const candidate = parts.reverse().find(part => /^[\w.-]{2,180}$/.test(part));
    return candidate || null;
  } catch { return null; }
}

// Il riferimento arriva da una conversazione: non diventa mai liberamente
// un path Firestore. Accettiamo un singolo segmento (anche per eventuali id
// Unicode esistenti), poi lo codifichiamo prima del GET.
function safeListingId(raw) {
  const id = typeof raw === 'string' ? raw.trim() : '';
  return id && id.length <= 180 && id !== '.' && id !== '..'
    && !/[\/\u0000-\u001f\u007f]/.test(id) ? id : null;
}

async function getPublicListing(id, today) {
  const safeId = safeListingId(id);
  if (!safeId) return null;
  const listing = await fsGet(`listings/${encodeURIComponent(safeId)}`);
  if (!listing || HIDDEN_STATUSES.has(String(listing.status || '').trim().toLowerCase())) return null;
  return catalogEntry(listing, today);
}

function criteriaMatch(entry, filters) {
  return criteriaMismatches(entry, filters).length === 0;
}

function criteriaMismatches(entry, filters) {
  const mismatches = [];
  if (filters.type && fold(entry.type) !== fold(filters.type)) mismatches.push('type');
  if (filters.zone && !fold(`${entry.zone || ''} ${entry.address || ''}`).includes(fold(filters.zone))) {
    mismatches.push('zone');
  }
  if (filters.maxPrice != null && (entry.priceEurMonth == null || entry.priceEurMonth > filters.maxPrice)) {
    mismatches.push('maxPrice');
  }
  if (filters.moveIn && entry.availability.state !== 'available_now'
    && (entry.availability.state !== 'available_later' || !entry.availability.date
      || entry.availability.date > filters.moveIn)) {
    mismatches.push('moveIn');
  }
  return mismatches;
}

function conservativeQuery(query, entries) {
  const q = fold(query);
  if (!q) return { match: 'none', rows: [] };
  const exact = entries.filter(row => [row.id, row.name, row.address].some(v => fold(v) === q));
  if (exact.length === 1) return { match: 'exact', rows: exact };
  if (exact.length > 1) return { match: 'ambiguous', rows: exact };

  // Riusa il matcher conservativo esistente; la guardia di evidenza evita il
  // suo fallback storico "un solo record = quello" quando la query non cita
  // davvero nome, indirizzo, zona o id.
  const resolved = DISPO.matchListing(query, entries);
  const hasEvidence = row => {
    if (String(row.id || '') && q.includes(fold(row.id))) return true;
    const identity = new Set(searchTokens(`${row.name || ''} ${row.address || ''} ${row.zone || ''}`));
    return searchTokens(query).some(token => identity.has(token));
  };
  if (resolved?.id && hasEvidence(resolved.listing)) return { match: 'exact', rows: [resolved.listing] };
  if (Array.isArray(resolved?.ambiguous)) {
    const names = new Set(resolved.ambiguous.map(fold));
    const rows = entries.filter(row => names.has(fold(row.name || row.id)) && hasEvidence(row));
    if (rows.length) return { match: rows.length === 1 ? 'exact' : 'ambiguous', rows };
  }
  return { match: 'none', rows: [] };
}

function portalListingIds(reference, pubs) {
  const refUrl = normalizedUrl(reference);
  const portal = externalPortal(reference);
  const urlRemoteId = refUrl ? remoteIdFromUrl(reference) : null;
  const ids = [];
  for (const pub of pubs || []) {
    if (!pub?.listingId) continue;
    const sameUrl = refUrl && pub.remoteUrl && normalizedUrl(pub.remoteUrl) === refUrl;
    const sameRemote = String(pub.remoteId || '') === String(reference)
      || !!(urlRemoteId && String(pub.remoteId || '') === urlRemoteId
        && portal && portal !== 'external' && pub.portal === portal);
    if ((sameUrl || sameRemote) && !ids.includes(String(pub.listingId))) ids.push(String(pub.listingId));
  }
  return ids;
}

function resolverNote(reason) {
  if (reason === 'exact') return 'This BOOM property identity is verified. Use only the returned fields and preserve any needs_confirmation availability state.';
  if (reason === 'unverified_external_reference') return 'This external listing reference is not mapped to a BOOM property. Do not claim its availability, price or identity; ask for the BOOM listing or say it needs verification.';
  if (reason === 'ambiguous') return 'More than one BOOM property matches. Ask for one distinguishing detail, preferably the full address or BOOM link; do not choose one.';
  if (reason === 'coverage_incomplete') return 'The checked source is only partially covered, so absence or uniqueness is not verified. Ask for the full BOOM link, listing id or exact address before making a claim.';
  if (reason === 'none') return 'No verified BOOM property matches these facts. Do not invent a listing or treat an external portal ad as current.';
  return 'Use the verified status and availability fields. An unavailable property may be identified, but it is never an alternative to offer.';
}

async function resolveCatalog(req, entries, listingCoverage, checkedAt, today) {
  const reference = inputValue(req, 'reference');
  const query = inputValue(req, 'query');
  const type = inputValue(req, 'type', 80);
  const zone = inputValue(req, 'zone', 120);
  const rawMaxPrice = inputValue(req, 'maxPrice', 30);
  const moveIn = inputValue(req, 'moveIn', 20);
  const maxPrice = rawMaxPrice === '' ? null : Number(rawMaxPrice);
  if (rawMaxPrice !== '' && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
    return { status: 400, body: { ok: false, error: 'invalid_max_price' } };
  }
  if (moveIn && !isoDay(moveIn)) {
    return { status: 400, body: { ok: false, error: 'invalid_move_in' } };
  }
  const filters = { type, zone, maxPrice, moveIn };
  const hasFilters = Object.values(filters).some(value => value !== '' && value != null);

  const coverage = {
    listings: { complete: listingCoverage.complete, scanned: listingCoverage.scanned,
      limit: CATALOG_LIMIT, directChecked: false },
    portalPubs: { checked: false, complete: null, scanned: 0, limit: PORTAL_PUBS_LIMIT },
  };
  let source = 'BOOM listings';
  let resolution = { match: 'none', rows: [], proof: 'listings_scan' };
  let reason = 'none';

  if (reference) {
    const boomId = boomListingId(reference);
    const rawId = !normalizedUrl(reference) ? safeListingId(reference) : null;
    const directId = boomId || rawId;
    let direct = null;
    if (directId) {
      coverage.listings.directChecked = true;
      direct = await getPublicListing(directId, today);
    }
    if (direct) {
      resolution = { match: 'exact', rows: [direct], proof: 'direct_document' };
    } else if (boomId) {
      // Un URL BOOM porta un id canonico: il GET del documento e un controllo
      // completo per quell'identita, anche quando il catalogo supera il cap.
      resolution = { match: 'none', rows: [], proof: 'direct_document' };
    } else {
      const pubRows = await fsList('portalPubs', { limit: PORTAL_PUBS_LIMIT + 1 });
      coverage.portalPubs = { checked: true, complete: pubRows.length <= PORTAL_PUBS_LIMIT,
        scanned: Math.min(pubRows.length, PORTAL_PUBS_LIMIT), limit: PORTAL_PUBS_LIMIT };
      source = 'BOOM listings + portalPubs';
      const ids = portalListingIds(reference, pubRows.slice(0, PORTAL_PUBS_LIMIT));
      // Tre letture bastano a provare un conflitto e tengono il costo bounded;
      // la risposta pubblica mostra comunque al massimo due risultati.
      const mapped = (await Promise.all(ids.slice(0, 3).map(id => getPublicListing(id, today)))).filter(Boolean);
      if (mapped.length) resolution = {
        match: mapped.length === 1 && ids.length === 1 ? 'exact' : 'ambiguous',
        rows: mapped, proof: 'portal_mapping', candidateCount: Math.max(ids.length, mapped.length),
      };
      else if (ids.length > 3) resolution = {
        match: 'ambiguous', rows: [], proof: 'portal_mapping', candidateCount: ids.length,
      };
      else {
        resolution = { match: 'none', rows: [], proof: 'portal_mapping' };
        reason = ids.length === 0 && externalPortal(reference)
          ? 'unverified_external_reference' : 'none';
      }
    }
  } else {
    if (query) {
      // Prima si stabilisce QUALE casa il cliente ha nominato. Budget, zona e
      // data descrivono poi se quella casa soddisfa la richiesta: non possono
      // cancellarne l'identita e farla sembrare inesistente.
      resolution = { ...conservativeQuery(query, entries), proof: 'listings_scan' };
    }
    else {
      const filtered = entries.filter(row => criteriaMatch(row, filters));
      // Senza un'identita da riconoscere stiamo cercando alternative: una
      // casa chiusa non entra mai nei suggerimenti, neppure se zona/prezzo
      // coincidono. Con query/reference resta invece identificabile.
      const offerable = filtered.filter(row => row.availability.state !== 'unavailable');
      resolution = offerable.length === 1 ? { match: 'exact', rows: offerable, proof: 'listings_scan' }
        : offerable.length > 1 ? { match: 'ambiguous', rows: offerable, proof: 'listings_scan' }
        : { match: 'none', rows: [], proof: 'listings_scan' };
    }
  }

  const proofComplete = resolution.proof === 'direct_document'
    || resolution.proof === 'portal_mapping' && coverage.portalPubs.complete === true
    || resolution.proof === 'listings_scan' && coverage.listings.complete === true;
  let match = resolution.match;
  let certainty = match === 'ambiguous' ? 'needs_confirmation' : 'verified';
  if (!proofComplete) {
    // Un cap raggiunto non dimostra ne assenza ne unicita. L'esito resta
    // esplicitamente da confermare, anche quando il primo blocco ha trovato
    // zero o una sola scheda.
    if (match === 'exact' || match === 'none') match = 'ambiguous';
    certainty = 'needs_confirmation';
    reason = 'coverage_incomplete';
  } else if (match === 'exact') reason = 'exact';
  else if (match === 'ambiguous') reason = 'ambiguous';
  else if (reason !== 'unverified_external_reference') reason = 'none';

  const candidateCount = resolution.candidateCount ?? resolution.rows.length;
  const results = resolution.rows.slice().sort((a, b) => String(a.id).localeCompare(String(b.id))).slice(0, 2)
    .map(row => {
      if (!hasFilters) return row;
      const mismatches = criteriaMismatches(row, filters);
      return { ...row, criteriaMatch: mismatches.length === 0, criteriaMismatches: mismatches };
    });
  const mismatchedCriteria = [...new Set(results.flatMap(row => row.criteriaMismatches || []))];
  const filterNote = mismatchedCriteria.length
    ? ` The identified property does not satisfy these requested filters: ${mismatchedCriteria.join(', ')}. Do not describe it as within the caller's criteria, unavailable, or nonexistent.`
    : '';
  return { status: 200, body: {
    ok: true, match, certainty, reason, source, checkedAt, coverage,
    candidateCount, truncated: candidateCount > results.length, results,
    ...(match === 'none' && reason === 'unverified_external_reference' ? { error: reason } : {}),
    note: resolverNote(reason) + filterNote,
  } };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Homie-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!checkPhoneAuth(req)) return res.status(401).json({ ok: false, error: 'invalid_key' });

  const op = String(qparam(req, 'op') || '').toLowerCase();

  try {
    if (op === 'catalog') {
      const hasInput = ['reference', 'query', 'type', 'zone', 'maxPrice', 'moveIn']
        .some(name => inputValue(req, name) !== '');
      // Il record sentinella rende esplicito un catalogo oltre il limite.
      // Senza input si conserva la lettura corta storica: questo JSON entra
      // nel contesto live, quindi 200 descrizioni sarebbero latenza e token.
      const scanLimit = hasInput ? CATALOG_LIMIT : CATALOG_SCAN_LIMIT;
      const rows = await fsList('listings', { limit: scanLimit + 1 });
      const sourceComplete = rows.length <= scanLimit;
      const checkedAt = new Date().toISOString();
      const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
      const entries = rows.slice(0, scanLimit)
        .filter(l => !HIDDEN_STATUSES.has(String(l.status || '').trim().toLowerCase()))
        .map(l => catalogEntry(l, today));
      if (hasInput) {
        const resolved = await resolveCatalog(req, entries,
          { complete: sourceComplete, scanned: Math.min(rows.length, CATALOG_LIMIT) }, checkedAt, today);
        return res.status(resolved.status).json(resolved.body);
      }

      const offerable = entries.filter(l => !UNAVAILABLE_STATUSES.has(l.status));
      const unavailable = entries.filter(l => UNAVAILABLE_STATUSES.has(l.status));
      const listings = offerable.slice(0, CATALOG_RESPONSE_LIMIT).map(catalogSummary);
      const unavailableListings = unavailable.slice(0, UNAVAILABLE_RESPONSE_LIMIT).map(unavailableIdentity);
      const complete = sourceComplete && offerable.length <= CATALOG_RESPONSE_LIMIT;
      const unavailableComplete = sourceComplete && unavailable.length <= UNAVAILABLE_RESPONSE_LIMIT;
      return res.status(200).json({
        ok: true, source: 'BOOM listings', checkedAt,
        coverage: { listings: { complete, sourceComplete,
          scanned: Math.min(rows.length, CATALOG_SCAN_LIMIT), returned: listings.length,
          scanLimit: CATALOG_SCAN_LIMIT, responseLimit: CATALOG_RESPONSE_LIMIT,
          unavailableComplete, unavailableReturned: unavailableListings.length,
          unavailableResponseLimit: UNAVAILABLE_RESPONSE_LIMIT } },
        complete, count: listings.length, listings, unavailableListings,
        note: 'Use each listing\'s type to distinguish rooms from entire apartments. A room is not an entire apartment. Do not infer accommodation type or total room count from bedrooms, size, price or title. If type is missing, unknown or unclear, say the accommodation type needs verification instead of calling it a room, apartment or bilocale. listings contains only offerable homes. unavailableListings is a compact identity index of rented/reserved homes: recognize them but never offer them, and use a targeted reference or query lookup for details. Both lists are bounded; if complete or unavailableComplete is false, or the caller cites a name, address, BOOM link or portal reference, call this tool again with reference or query instead of assuming absence. This is the BOOM catalog, not a fresh search of external portals; a portal ad may be stale.',
      });
    }

    if (op === 'slots') {
      const mode = String(qparam(req, 'mode') || 'person').toLowerCase() === 'video' ? 'video' : 'person';
      const cfg = await loadConfig();
      const ctx = await listingCtx(String(qparam(req, 'listingId') || '').slice(0, 80));
      const days = buildSlots(cfg, await busyBlocks(cfg), mode, new Date(), ctx);
      // appiattito e capato: una voce legge 8 orari, non 80
      const flat = [];
      for (const d of days || []) {
        for (const t of d.times || []) {
          flat.push({ iso: t.iso, say: `${d.label} ${t.label}` });
          if (flat.length >= 8) break;
        }
        if (flat.length >= 8) break;
      }
      return res.status(200).json({
        ok: true, timezone: TZ, mode,
        requireApproval: !!cfg.requireApproval,
        slots: flat,
        // Istruzioni al modello, non frasi da recitare (la lezione del 15/09: una
        // frase «esatta» ferma la conversazione). Nessuna promette ciò che nessuno
        // esegue: né uno slot «tenuto», né un link, un messaggio o un richiamo.
        note: flat.length
          ? 'Offer 2-3 of these times and ask which one the caller prefers. A preferred time is a request, not a booking: confirmation is still required, and nothing is booked, held or sent by this call. Do not promise a link, a message or a call back.'
          : 'No open slots in the next days. Tell the caller, then ask for what is still missing (preferred days, name or contact number). Nothing is booked, held or sent by this call: do not promise a link, a message or a call back.',
      });
    }

    return res.status(400).json({ ok: false, error: 'unknown_op', ops: ['catalog', 'slots'] });
  } catch (e) {
    console.error('[phone/agent-tools]', op, e.message);
    // la voce non deve mai restare muta su un nostro errore: un'istruzione al
    // modello (limite vero + UNA domanda), non una frase da recitare
    return res.status(200).json({ ok: false, error: 'temporarily_unavailable', note: 'Live data is not reachable right now. Tell the caller briefly that you cannot check this at the moment, then ask ONE question only, about a single missing detail (what they are looking for, or their budget, or the move-in date, or a contact number; never two questions at once). Never invent listings, prices, availability or times.' });
  }
}
