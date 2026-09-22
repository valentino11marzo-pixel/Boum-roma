// api/ai/status.js — LA CENTRALE AI, dalla porta HTTP.
//
// GET  → la fotografia: locale (configurato / acceso / raggiungibile, con la
//        sonda a /v1/models), la modalità in vigore per ogni scopo, i
//        contatori di oggi e del mese (chiamate, token, costo dal listino,
//        ricadute) e i verdetti dell'ombra. `?probe=0` salta la sonda.
// POST → cambia le impostazioni (SOLO admin): { purposes:{ '<scopo>':{ mode |
//        cloudModel | localModel } } } · { local:{ enabled, url, model,
//        visionModel, sttUrl, sttModel, timeoutMs, fallback } } · { shadow:
//        { minSample, minAgree } }. Un valore impossibile (uno scopo
//        `localOk:false` messo in locale, un http pubblico, un modello fuori
//        listino) torna 400 con `rejected` e NON si scrive.
//
// Auth come i cron PFS (api/pfs/_guard.js): Bearer CRON_SECRET · X-Homie-
// Secret · ID token admin. Il Mac (Homie) può leggere lo stato; scrivere
// resta dell'operatore.

import { requireCronOrAdmin } from '../pfs/_guard.js';
import { readJson } from '../homie/_lib.js';
import { aiSnapshot, setAiSettings } from './_status.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  if (req.method === 'GET') {
    const probe = String((req.query && req.query.probe) || '1') !== '0';
    try {
      const snap = await aiSnapshot({ probe, fresh: true });
      return res.status(200).json({ ...snap, actor });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'snapshot_failed', detail: String(e && e.message || e).slice(0, 120) });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!String(actor).startsWith('admin:')) return res.status(403).json({ ok: false, error: 'admin_required' });

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const patch = {};
  if (body && body.purposes && typeof body.purposes === 'object') patch.purposes = body.purposes;
  // forma corta: { purpose, mode|cloudModel|localModel }
  if (body && typeof body.purpose === 'string') {
    const v = {};
    if (body.mode != null) v.mode = body.mode;
    if (body.cloudModel != null) v.cloudModel = body.cloudModel;
    if (body.localModel != null) v.localModel = body.localModel;
    patch.purposes = { ...(patch.purposes || {}), [body.purpose]: v };
  }
  if (body && body.local && typeof body.local === 'object') patch.local = body.local;
  if (body && body.shadow && typeof body.shadow === 'object') patch.shadow = body.shadow;
  if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'nothing_to_set' });

  try {
    const r = await setAiSettings(patch);
    if (!r.ok) return res.status(400).json({ ok: false, error: 'rejected', rejected: r.rejected });
    return res.status(200).json({ ok: true, cfg: { local: r.cfg.local, purposes: r.cfg.purposes, shadow: r.cfg.shadow }, rejected: r.rejected });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'write_failed', detail: String(e && e.message || e).slice(0, 120) });
  }
}
