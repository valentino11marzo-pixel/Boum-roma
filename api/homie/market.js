// api/homie/market.js — gli occhi del Perito sul ciclo di vita.
//
// Il server non può verificare da solo se un annuncio è ancora vivo: i
// portali 403-ano gli IP datacenter a piacere (scritto in pfs/_fetch.js, ed
// è il motivo per cui l'email-alert è la fonte portante). Il Mac di Homie —
// IP residenziale, browser vero — sì. Questo endpoint è il contratto:
//
//   GET  → il LOTTO di lavoro: { checks: [{id,url}], enrich: [{id,url}] }
//          · checks: vivi da più tempo senza verifica (coda del motore)
//          · enrich: annunci senza mq o zona — la statistica li aspetta
//   POST → gli esiti:
//          { checks:  [{ id, httpStatus, marker? }],
//            listings: [{ sourceUrl, price?, sqm?, zone?, rooms?, ... }] }
//
// IL VERDETTO LO DÀ IL SERVER, non il Mac: gli esiti passano da
// deathVerdict/applyCheck del motore, dove "un blocco non è una morte" è
// asserito per mutazione. Homie riporta fatti (status HTTP, marker della
// pagina); la decisione resta in un posto solo.
//
// marker che il Mac deve riportare quando lo status è 200:
//   'listing'      la pagina è ancora un annuncio
//   'unavailable'  "annuncio non più disponibile" / "non più in affitto"
//   'search'       il portale ha rediretto a una pagina di ricerca
// In dubbio: niente marker → il server dirà 'unknown', che è la risposta
// giusta al dubbio. Nel dubbio manda: i duplicati sono gratis.
//
// Auth: X-Homie-Secret (come ogni porta di Homie). Heartbeat
// `pfsRadarHealth/perito-eyes` → l'allerta Telegram esistente (3 run
// falliti) copre anche questi occhi senza codice nuovo.

import ME from '../../js/market-engine.js';
import { knobs } from '../_squadra.js';
import { fsList, fsPatch, fsGet, requireSecret, readJson } from './_lib.js';
import { recordObservation } from '../market/_ledger.js';
import { stableIdFromUrl } from '../pfs/_ingest.js';
import { reportHealth } from '../pfs/_health.js';

export default async function handler(req, res) {
  if (!requireSecret(req, res)) return;

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[homie/market]', e);
    // reportHealth, non una scrittura diretta: il commento in testa a questo
    // file PROMETTEVA "l'allerta Telegram esistente (3 run falliti)" ma il
    // battito scritto a mano bypassava alertDecision — gli occhi del Perito
    // potevano morire in silenzio per sempre. Ora la promessa è vera.
    try { await reportHealth('perito-eyes', { ok: false, error: e.message }); }
    catch { /* il battito non deve uccidere la risposta */ }
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function handleGet(req, res) {
  const { k } = await knobs('perito');

  // Tetto largo, niente orderBy server-side (doc legacy senza campo
  // sparirebbero): si ordina in memoria con la coda del motore.
  const ledger = await fsList('marketListings', { limit: 3000 });

  const checks = ME.checkQueue(ledger, {
    batch: k.deathcheckBatch, minIntervalHours: 20,
  }).map(l => ({ id: stableIdFromUrl(l.sourceUrl), url: l.sourceUrl }));

  const enrich = ledger
    .filter(l => l.status === 'active' && l.needsEnrich && l.sourceUrl)
    .slice(0, k.enrichBatch)
    .map(l => ({ id: stableIdFromUrl(l.sourceUrl), url: l.sourceUrl }));

  return res.status(200).json({ ok: true, checks, enrich });
}

async function handlePost(req, res) {
  const body = await readJson(req);
  const checks = Array.isArray(body?.checks) ? body.checks : [];
  const listings = Array.isArray(body?.listings) ? body.listings : [];

  let goneN = 0, aliveN = 0, unknownN = 0, enriched = 0;

  for (const c of checks.slice(0, 500)) {
    if (!c || !c.id) continue;
    const existing = await fsGet('marketListings/' + c.id).catch(() => null);
    if (!existing) continue;
    const verdict = ME.deathVerdict(c);                 // la decisione è del motore
    const next = ME.applyCheck(existing, verdict, c);
    await fsPatch('marketListings/' + c.id, next);
    if (verdict === 'gone') goneN++;
    else if (verdict === 'alive') aliveN++;
    else unknownN++;
  }

  for (const l of listings.slice(0, 200)) {
    if (!l || !l.sourceUrl) continue;
    const id = stableIdFromUrl(l.sourceUrl);
    const r = await recordObservation(id, l);
    if (r.ok) {
      await fsPatch('marketListings/' + id, { enrichedAt: new Date() }).catch(() => {});
      enriched++;
    }
  }

  await reportHealth('perito-eyes', {
    ok: true,
    stats: { checks: checks.length, gone: goneN, alive: aliveN, unknown: unknownN, enriched },
  }).catch(() => {});

  // Il verdetto del giro, esplicito: tutti unknown = radar CIECO su questo
  // lotto (blocchi), non un mercato immobile — chi legge non deve dedurlo.
  const blind = checks.length > 0 && goneN === 0 && aliveN === 0;
  return res.status(200).json({
    ok: true, gone: goneN, alive: aliveN, unknown: unknownN, enriched,
    verdict: blind ? 'blind_run' : 'ok',
  });
}
