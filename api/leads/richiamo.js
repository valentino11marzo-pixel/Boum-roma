// api/leads/richiamo.js — la porta HTTP del Richiamo (la logica sta in
// _richiamo.js, come confirm.js → _apply.js: quattro superfici, un solo posto
// dove le cose accadono).
//
//   POST { op:'prepare', listingId }            → campagna per una casa
//   POST { op:'prepare', audience:'recenti', days? } → lead recenti senza seguito
//   POST { op:'send', id }                      → invia (idempotente)
//   POST { op:'cancel', id }                    → annulla una pending
//   GET  ?id=<campaignId>                       → stato campagna
//
// prepare NON invia niente: persiste la campagna e manda la card Telegram
// con ✅/✖️ — l'invio è il tap (o un op:'send' esplicito).
// Auth: X-Wizard-Secret / X-Homie-Secret (bot) oppure Bearer admin — come
// match-listing. maxDuration 60 in vercel.json (l'invio email è un loop).

import { fsGet, readJson, secretEqual } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { prepareCampaign, sendCampaign, cancelCampaign } from './_richiamo.js';

function botSecretOk(req) {
  const supplied = req.headers['x-wizard-secret'] || req.headers['x-homie-secret'];
  const expected = process.env.WIZARD_SECRET || process.env.HOMIE_SECRET;
  return !!expected && secretEqual(String(supplied || ''), expected);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!botSecretOk(req)) {
    const actor = await requireCronOrAdmin(req, res);
    if (!actor) return;
  }

  try {
    if (req.method === 'GET') {
      const id = String((req.query || {}).id || '').trim();
      if (!id) return res.status(400).json({ ok: false, error: 'id_required' });
      const c = await fsGet(`richiamoCampaigns/${id}`);
      if (!c) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.status(200).json({ ok: true, campaign: c });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

    let body;
    try { body = (await readJson(req)) || {}; } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
    const op = String(body.op || 'prepare');

    if (op === 'prepare') {
      const listingId = String(body.listingId || '').trim();
      const audience = String(body.audience || (listingId ? 'listing' : '')).trim();
      if (audience === 'recenti') {
        const r = await prepareCampaign({ type: 'recenti', days: body.days, requestedBy: 'api' });
        return res.status(r.ok ? 200 : 400).json(r);
      }
      if (!listingId) return res.status(400).json({ ok: false, error: 'listingId_or_audience_required' });
      const r = await prepareCampaign({ type: 'listing', listingId, requestedBy: 'api' });
      return res.status(r.ok ? 200 : r.error === 'listing_not_found' ? 404 : 400).json(r);
    }
    if (op === 'send') {
      const id = String(body.id || '').trim();
      if (!id) return res.status(400).json({ ok: false, error: 'id_required' });
      const r = await sendCampaign(id, { via: 'api' });
      return res.status(r.ok ? 200 : r.error === 'not_found' ? 404 : 409).json(r);
    }
    if (op === 'cancel') {
      const id = String(body.id || '').trim();
      if (!id) return res.status(400).json({ ok: false, error: 'id_required' });
      const r = await cancelCampaign(id);
      return res.status(r.ok ? 200 : r.error === 'not_found' ? 404 : 409).json(r);
    }
    return res.status(400).json({ ok: false, error: 'unknown_op' });
  } catch (e) {
    console.error('[leads/richiamo]', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
