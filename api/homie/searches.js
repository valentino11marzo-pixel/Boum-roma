// api/homie/searches.js — LA LISTA DI LAVORO PER GLI OCCHI DI HOMIE.
//
// IL PROBLEMA, scritto nel codice stesso del radar:
//   api/pfs/_fetch.js  → "both portals run anti-bot protection and may 403
//                         datacenter IPs … the email-alert path is the
//                         LOAD-BEARING source, this is enrichment"
//   api/pfs/scan-market → "best-effort … failures are expected and tracked"
//
// Tradotto: per il servizio che i clienti PAGANO (Property Finding, €350), il
// radar scopre un immobile QUANDO IL PORTALE DECIDE DI MANDARE L'EMAIL. Gli
// alert arrivano raggruppati e in ritardo, e a Roma un buon affitto da privato
// raccoglie decine di contatti nelle prime ore. Arrivare col digest significa
// arrivare ultimi — sul prodotto la cui unica promessa è arrivare primi.
//
// Il server non può risolverlo: 403 da IP datacenter, per costruzione. Homie
// sì — Mac a Roma, IP residenziale, browser vero, sessioni autenticate. È
// l'unica cosa che il server non potrà mai fare, ed è esattamente il punto in
// cui il radar si rompe.
//
// LA PIPELINE ESISTE GIÀ TUTTA: POST /api/homie/property → api/pfs/_ingest.js
// (dedupe su sha1(sourceUrl) → filtro agenzie → punteggio su OGNI cliente
// attivo → push nel mazzo di swipe, alert sul telefono del cliente). Mancava
// solo che Homie sapesse COSA guardare, senza hardcodare niente sul Mac.
//
// GET  → la lista viva delle ricerche da aprire (una per cliente per portale,
//        già auto-generata da pfs/sync-searches dai criteri reali del cliente)
// POST → il rapporto del giro, che diventa un heartbeat: se gli occhi di
//        Homie si spengono, l'allerta Telegram esistente (3 fallimenti
//        consecutivi, api/pfs/_health.js) se ne accorge da sola.
//
// Auth: X-Homie-Secret, come tutti gli endpoint /api/homie/*.

import { fsList, requireSecret, readJson } from './_lib.js';
import { reportHealth } from '../pfs/_health.js';

// Ogni quanto ha senso rifare il giro. Non è un limite tecnico: è il
// compromesso fra "arrivare primi" e "non farsi notare da un antibot".
export const SUGGESTED_INTERVAL_MINUTES = 10;

/**
 * Le ricerche che Homie deve davvero aprire.
 * `urlOverride` vince sempre su `searchUrl`: è la manopola manuale che
 * l'operatore usa quando la URL auto-generata non rende bene, e sync-searches
 * ha cura di non sovrascriverla mai.
 * Esportata pura per i test.
 */
export function activeSearches(rows, clientsById = new Map()) {
  return (rows || [])
    .filter(s => s && s.enabled !== false)
    .map(s => ({
      id: s.id,
      portal: s.portal || null,
      url: s.urlOverride || s.searchUrl || null,
      label: s.label || s.name || null,
      clientId: s.clientId || null,
      clientName: (clientsById.get(s.clientId) || {}).name || null,
    }))
    .filter(s => s.url && /^https?:\/\//i.test(s.url));
}

/**
 * Il giro è andato bene?
 * LA REGOLA CHE TIENE IN PIEDI TUTTO: un radar CIECO non deve mai sembrare un
 * mercato fermo. "Zero risultati" e "il portale mi ha sbattuto fuori" arrivano
 * entrambi come un giro senza annunci, ma solo il secondo è un guasto — e se
 * non lo diciamo, il radar muore in silenzio proprio mentre il cliente paga
 * per essere il primo. Esportata perché è la logica che decide se scatta
 * l'allerta Telegram: va testata, non riscritta altrove.
 */
export function runVerdict(body = {}) {
  const searches = Number(body.searches) || 0;
  const blocked = Number(body.blocked) || 0;
  if (body.ok === false) return false;
  if (!searches) return false;              // nessuna ricerca aperta = giro morto
  return blocked < searches;                 // tutto bloccato = occhi chiusi
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Homie-Secret');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!requireSecret(req, res)) return;

  // ── il rapporto del giro ────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body = {};
    try { body = (await readJson(req)) || {}; } catch { /* rapporto vuoto = giro fallito */ }
    const stats = {
      searches: Number(body.searches) || 0,
      found: Number(body.found) || 0,
      ingested: Number(body.ingested) || 0,
      blocked: Number(body.blocked) || 0,
    };
    const ok = runVerdict(body);
    await reportHealth('homie-eyes', {
      ok,
      stats,
      error: ok ? null : (body.error || `blocked ${stats.blocked}/${stats.searches}`),
    });
    return res.status(200).json({ ok: true, recorded: stats });
  }

  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  // ── la lista di lavoro ──────────────────────────────────────────────────
  let rows = [];
  try { rows = await fsList('radarSearches', { limit: 200 }); }
  catch (e) { return res.status(500).json({ ok: false, error: 'searches_read_failed', detail: e.message }); }

  // i nomi dei clienti servono solo a rendere leggibili i log di Homie;
  // se la lettura fallisce la lista resta perfettamente utilizzabile
  const clientsById = new Map();
  try {
    for (const c of await fsList('pfsClients', { limit: 100 })) clientsById.set(c.id, c);
  } catch { /* best effort */ }

  const searches = activeSearches(rows, clientsById);
  return res.status(200).json({
    ok: true,
    count: searches.length,
    suggestedIntervalMinutes: SUGGESTED_INTERVAL_MINUTES,
    // Il contratto in chiaro, così il Mac non deve ricordarselo: apri ogni
    // url, estrai gli annunci, manda OGNUNO qui. I duplicati sono gratis
    // (dedupe su sha1 della sourceUrl), quindi nel dubbio manda.
    postTo: '/api/homie/property',
    reportTo: '/api/homie/searches',
    searches,
  });
}
