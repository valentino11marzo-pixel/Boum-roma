// api/phone/agent-tools.js — gli occhi della receptionist durante la chiamata.
//
// L'agente ElevenLabs, MENTRE parla col cliente, chiama questi tool per non
// inventare mai niente (la regola d'oro di ogni bot BOOM):
//   GET ?k=<chiave>&op=catalog            → le case DAVVERO disponibili
//   GET ?k=<chiave>&op=slots&mode=video   → gli slot visita DAVVERO liberi
//
// Il catalogo è il Firestore vero; gli slot escono da viewings/_avail.js —
// la STESSA griglia di book.html, della pagina self-service e del picker
// Telegram (la disciplina "una copia sola": la voce al telefono non può
// promettere uno slot che la pagina web negherebbe un minuto dopo).
//
// La receptionist NON prenota qui: propone lo slot e promette il link su
// WhatsApp — la prenotazione vera resta sulle rail esistenti (book.html /
// operatore), dove email e conferme funzionano già. Un booking a voce senza
// email produrrebbe una visita senza kit: mezza feature è peggio di nessuna.
//
// Auth: ?k=<phoneKey derivata> o X-Homie-Secret (come le altre porte phone).
// Risposte PICCOLE e parlabili: finiscono nel contesto vocale dell'agente.

import { fsList } from '../homie/_lib.js';
import { checkPhoneAuth, qparam } from './_lib.js';
import { TZ, loadConfig, busyBlocks, buildSlots, listingCtx } from '../viewings/_avail.js';

const HIDDEN_STATUSES = new Set(['rented', 'draft', 'hidden', 'archived']);

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
      const rows = await fsList('listings', { limit: 60 });
      const listings = (rows || [])
        .filter((l) => !HIDDEN_STATUSES.has(String(l.status || '').toLowerCase()))
        .slice(0, 25)
        .map((l) => ({
          id: l.id,
          name: l.name || null,
          zone: l.zone || null,
          priceEurMonth: l.price != null ? Number(l.price) : null,
          bedrooms: l.bedrooms != null ? Number(l.bedrooms) : null,
          sqm: l.sqm != null ? Number(l.sqm) : null,
          furnished: l.furnished != null ? !!l.furnished : null,
          availableFrom: l.availableFrom || l.availableDate || null,
          url: `https://boomrome.com/listing/${l.id}`,
        }));
      return res.status(200).json({ ok: true, count: listings.length, listings });
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
        note: flat.length
          ? (cfg.requireApproval
            ? 'These times are held on request: the team confirms within a few hours.'
            : 'These times are instantly bookable.')
          : 'No open slots in the next days — offer a WhatsApp follow-up instead.',
      });
    }

    return res.status(400).json({ ok: false, error: 'unknown_op', ops: ['catalog', 'slots'] });
  } catch (e) {
    console.error('[phone/agent-tools]', op, e.message);
    // la voce non deve mai restare muta su un nostro errore: risposta parlabile
    return res.status(200).json({ ok: false, error: 'temporarily_unavailable', say: 'I cannot check that right now — I will have the team confirm on WhatsApp.' });
  }
}
