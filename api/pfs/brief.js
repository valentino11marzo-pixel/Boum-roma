// api/pfs/brief.js
// "Il punto della situazione" — AI daily briefing for the PFS operation.
// Reads the last 48h of radar activity (properties, matches, outreach,
// client feedback, source health) and asks Claude for a terse Italian
// operational brief: what came in, what's ready to propose, what to chase.
//
// Two invocation modes:
//   - Vercel cron (mattina) → sends the brief to Telegram
//   - Command center button → returns { ok, brief, stats } as JSON
//
// Anthropic call follows the project's raw-fetch pattern (api/documents/
// ocr.js, api/parse-docs.js) — key stays server-side.
//
// Auth: cron secret / Homie secret / admin Firebase ID token (_guard.js).

import { fsList, fsGet, logActivity } from '../homie/_lib.js';
import { requireCronOrAdmin } from './_guard.js';
import { listActiveClients } from './_ingest.js';
import { tgNotify } from './_health.js';

const MODEL = 'claude-opus-4-8';
const MAX_TOKENS = 1200;

function hoursAgo(h) { return new Date(Date.now() - h * 3600 * 1000); }

function compactProperty(p) {
  return {
    titolo: (p.title || p.address || p.sourceUrl || '').slice(0, 80),
    prezzo: p.price,
    cam: p.bedrooms,
    mq: p.sqm,
    fonte: p.source,
    inserzionista: p.advertiser,
    visto: p.lastSeenAt || p.scrapedAt,
    pushATo: ((p.matchSummary && p.matchSummary.pushedTo) || []).map(x => `${x.name}:${x.score}`),
    outreach: p.outreach ? { stato: p.outreach.status, nota: (p.outreach.note || '').slice(0, 60) } : null,
    url: p.sourceUrl,
  };
}

function compactClient(c) {
  const deck = Array.isArray(c.portalProperties) ? c.portalProperties : [];
  return {
    nome: c.name,
    stage: c.stage || c.portalStage,
    budget: c.budget,
    zona: c.preferred_areas || c.zone || null,
    proposte: deck.length,
    like: deck.filter(p => p && p.clientLiked).length,
    scartate: deck.filter(p => p && p.clientRejected).length,
    nuoveNonViste: deck.filter(p => p && p.isNew).length,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: 'server_missing_anthropic_key' });

  // ── Gather the operational picture ────────────────────────
  let properties = [];
  let clients = [];
  const health = {};
  try {
    const all = await fsList('pfsProperties', {
      orderBy: { field: 'lastSeenAt', direction: 'DESCENDING' }, limit: 60,
    });
    const cutoff = hoursAgo(48);
    properties = all.filter(p => {
      const seen = p.lastSeenAt || p.scrapedAt;
      return seen && new Date(seen) > cutoff;
    });
  } catch (e) { console.warn('[pfs/brief] properties read failed:', e.message); }
  try { clients = await listActiveClients(); } catch (e) { console.warn('[pfs/brief] clients read failed:', e.message); }
  for (const s of ['inbox', 'market', 'sync']) {
    try {
      const h = await fsGet('pfsRadarHealth/' + s);
      if (h) health[s] = { ok: h.ok, ultimoRun: h.lastRunAt, erroriConsecutivi: h.consecutiveErrors || 0, daVerificare: (h.needsAttention || []).length };
    } catch { /* health doc may not exist yet */ }
  }

  const stats = {
    annunci48h: properties.length,
    privati: properties.filter(p => p.advertiser === 'private').length,
    agenzieScartate: properties.filter(p => p.advertiser === 'agency').length,
    conMatch: properties.filter(p => (p.matchSummary?.pushedTo || []).length > 0).length,
    clientiAttivi: clients.length,
  };

  const data = {
    oggi: new Date().toISOString().slice(0, 10),
    statistiche: stats,
    fonti: health,
    clienti: clients.map(compactClient),
    annunciUltime48h: properties.slice(0, 40).map(compactProperty),
  };

  // ── Ask Claude for the brief ──────────────────────────────
  const system =
    'Sei l\'analista operativo del servizio Property Finding di BOOM Roma (ricerca casa per clienti paganti, Roma). ' +
    'Ricevi un JSON con lo stato delle ultime 48 ore: annunci entrati dal radar, match pushati ai clienti, stato outreach ' +
    '(contatto dei proprietari privati), feedback dei clienti (like/scartate) e salute delle fonti. ' +
    'Scrivi il briefing operativo del giorno in italiano, per Valentino che lo legge dal telefono. ' +
    'Formato: HTML minimale compatibile Telegram (solo <b> e <i>, niente markdown, niente liste annidate). ' +
    'Struttura: 1) una riga di sintesi; 2) "Da proporre ora" — gli annunci con match non ancora gestiti, con prezzo e cliente; ' +
    '3) "Outreach" — chi contattare o sollecitare; 4) "Clienti" — segnali dal feedback (like/scartate/non visti); ' +
    '5) "Sistema" — solo se una fonte è ferma o ci sono annunci da verificare; 6) "Le 3 azioni di oggi" — priorità concrete. ' +
    'Massimo ~200 parole. Concreto e diretto: nomi, cifre, zone. Ometti le sezioni vuote. Non inventare nulla che non sia nel JSON.';

  let brief;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: JSON.stringify(data) }],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error('[pfs/brief] anthropic', resp.status, t.slice(0, 300));
      return res.status(502).json({ ok: false, error: 'anthropic_failed', status: resp.status });
    }
    const out = await resp.json();
    if (out.stop_reason === 'refusal' || !Array.isArray(out.content)) {
      return res.status(502).json({ ok: false, error: 'anthropic_no_content' });
    }
    brief = out.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'anthropic_request_failed', detail: e.message });
  }

  // ── Deliver ───────────────────────────────────────────────
  let sentToTelegram = false;
  if (actor === 'cron') {
    sentToTelegram = await tgNotify('📡 <b>BOOM Radar — briefing del giorno</b>\n\n' + brief);
  }

  await logActivity('pfs_daily_brief', 'pfs_radar', { actor, stats, sentToTelegram }, actor);
  return res.status(200).json({ ok: true, brief, stats, sentToTelegram });
}
