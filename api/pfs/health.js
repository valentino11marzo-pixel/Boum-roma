// api/pfs/health.js
// Read-only health snapshot for the command center. Exists so the UI's
// status bar works even when the pfsRadarHealth Firestore rule hasn't
// been deployed yet (server reads run under admin credentials) — the UI
// listens to Firestore first and falls back here on permission errors.
//
// Auth: cron secret / Homie secret / admin Firebase ID token (_guard.js).

import { fsGet } from '../homie/_lib.js';
import { requireCronOrAdmin } from './_guard.js';

const SOURCES = ['inbox', 'market', 'sync'];

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const health = {};
  for (const s of SOURCES) {
    try { health[s] = await fsGet('pfsRadarHealth/' + s); }
    catch (e) { health[s] = { source: s, error: e.message }; }
  }
  return res.status(200).json({ ok: true, health });
}
