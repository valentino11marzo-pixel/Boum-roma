// api/outreach/draft.js — IL CONTATTO: l'anteprima del messaggio, rifinita.
//
// POST { listingId*, style?, voice?, note?, clientId?, ai? } →
//   { ok, message, source: 'template'|'ai', listing: {…} }
//
// Il messaggio BASE esce dal motore condiviso (js/outreach-engine.js — la
// stessa copia che la plancia usa per l'anteprima istantanea nel browser).
// Con ai:true, Claude haiku lo RIFINISCE sui dettagli veri dell'annuncio
// (fluidità, un aggancio concreto al testo dell'inserzione) dentro binari
// stretti: stessa lingua, stessa lunghezza, niente dati nuovi, niente
// telefoni, la domanda finale resta. Qualunque errore o deriva → si torna
// al template: un'anteprima che non arriva è un difetto, una inventata è
// un danno. La chiave ANTHROPIC resta server-side.
//
// Auth: come i cron PFS (Bearer CRON_SECRET / X-Homie-Secret / token admin)
// — così anche il bot Telegram potrà chiedere bozze senza una porta nuova.

import OUT from '../../js/outreach-engine.js';
import { fsGet, readJson } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';

const MODEL = 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const listingId = String(body && body.listingId || '').trim();
  if (!listingId) return res.status(400).json({ ok: false, error: 'listingId_required' });

  const listing = await fsGet('pfsProperties/' + listingId).catch(() => null);
  if (!listing) return res.status(404).json({ ok: false, error: 'listing_not_found' });

  let client = null;
  if (body.clientId) client = await fsGet('pfsClients/' + String(body.clientId)).catch(() => null);

  const opts = {
    style: body.style, voice: body.voice,
    note: body.note, client,
  };
  const base = OUT.buildMessage(listing, opts);
  let message = base;
  let source = 'template';

  if (body.ai === true && process.env.ANTHROPIC_API_KEY) {
    try {
      const refined = await aiPolish(base, listing, opts);
      if (refined) { message = refined; source = 'ai'; }
    } catch (e) {
      console.warn('[outreach/draft] ai fallback:', e.message);
    }
  }

  return res.status(200).json({
    ok: true, message, source,
    listing: {
      id: listingId, title: listing.title || null, zone: listing.zone || null,
      price: listing.price || null, sourceUrl: listing.sourceUrl || null,
      portal: listing.source || null, advertiser: listing.advertiser || 'unknown',
    },
  });
}

async function aiPolish(base, listing, opts) {
  const facts = [
    listing.title ? 'Titolo: ' + String(listing.title).slice(0, 120) : null,
    listing.zone ? 'Zona: ' + listing.zone : null,
    listing.price ? 'Prezzo: €' + listing.price + '/mese' : null,
    listing.sqm ? 'Metri: ' + listing.sqm + ' mq' : null,
    listing.description ? 'Descrizione annuncio: ' + String(listing.description).slice(0, 500) : null,
  ].filter(Boolean).join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(9000),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      messages: [{
        role: 'user',
        content:
          'Rifinisci questo messaggio di primo contatto per un annuncio di affitto, da inviare nella chat del portale immobiliare.\n\n' +
          'MESSAGGIO BASE:\n' + base + '\n\nFATTI DELL\'ANNUNCIO (usa SOLO questi):\n' + facts + '\n\n' +
          'REGOLE FERREE:\n' +
          '- stessa lingua del messaggio base, stessa voce (chi scrive resta chi scrive);\n' +
          '- lunghezza simile, mai oltre ' + OUT.MAX_LEN + ' caratteri;\n' +
          '- puoi aggiungere UN aggancio concreto preso dai fatti (es. un dettaglio della descrizione) — MAI inventare dettagli non elencati;\n' +
          '- niente numeri di telefono, niente email, niente nomi propri nuovi;\n' +
          '- il messaggio deve chiudere con la richiesta di visita.\n' +
          'Rispondi SOLO col messaggio finale, nessun commento.',
      }],
    }),
  });
  if (!r.ok) throw new Error('anthropic ' + r.status);
  const j = await r.json();
  const text = String((j.content && j.content[0] && j.content[0].text) || '').trim();
  if (!text || text.length < 40 || text.length > OUT.MAX_LEN + 50) return null;
  // La rete di sicurezza del motore vale anche per l'AI: un telefono nel
  // testo (comunque ci sia finito) butta la rifinitura, non il template.
  const v = OUT.validateJob({ sourceUrl: 'https://x/', portal: 'immobiliare', message: text });
  return v.ok ? text.slice(0, OUT.MAX_LEN) : null;
}
