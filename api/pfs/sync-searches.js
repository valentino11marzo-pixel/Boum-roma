// api/pfs/sync-searches.js
// "Crea gli alert da solo": for every active PFS client this upserts one
// radarSearches doc per portal (id pfs_<clientId>_<portal>), generated
// from the client's stored criteria. When criteria change the URLs follow;
// when a client goes inactive (placed/archived) their searches switch off.
// scan-market.js then scans whatever is enabled.
//
// Auth: Vercel cron (Bearer CRON_SECRET), Homie (X-Homie-Secret), or the
// command center (Firebase admin ID token). GET or POST.
//
// Manual knobs preserved on update: `enabled` and `urlOverride` are only
// set on first creation — re-syncs never clobber what Valentino tuned.

import { fsGet, fsPatch, fsList, logActivity } from '../homie/_lib.js';
import { requireCronOrAdmin } from './_guard.js';
import { listActiveClients } from './_ingest.js';
import { buildSearchUrls } from './_searchurls.js';
import { reportHealth } from './_health.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const now = new Date();
  const created = [];
  const updated = [];
  const disabled = [];
  const errors = [];

  let clients;
  try { clients = await listActiveClients(); }
  catch (e) {
    await reportHealth('sync', { ok: false, error: 'client_list_failed: ' + e.message });
    return res.status(500).json({ ok: false, error: 'client_list_failed', detail: e.message });
  }

  const activeIds = new Set(clients.map(c => c.id));

  for (const client of clients) {
    for (const s of buildSearchUrls(client)) {
      const docId = `pfs_${client.id}_${s.portal}`;
      try {
        const existing = await fsGet('radarSearches/' + docId);
        const base = {
          name: `PFS · ${client.name || client.id} · ${s.portal}`,
          portal: s.portal,
          searchUrl: s.url,
          label: s.label,
          clientId: client.id,
          clientName: client.name || null,
          auto: true,
          syncedAt: now,
        };
        if (!existing) {
          await fsPatch('radarSearches/' + docId, { ...base, enabled: true, createdAt: now });
          created.push(docId);
        } else {
          await fsPatch('radarSearches/' + docId, base);
          updated.push(docId);
        }
      } catch (e) {
        errors.push({ docId, error: e.message });
      }
    }
  }

  // Switch off auto-searches whose client is no longer active
  try {
    const all = await fsList('radarSearches', { limit: 200 });
    for (const s of all) {
      if (s.auto === true && s.clientId && !activeIds.has(s.clientId) && s.enabled !== false) {
        await fsPatch('radarSearches/' + s.id, { enabled: false, disabledAt: now, disabledReason: 'client_inactive' });
        disabled.push(s.id);
      }
    }
  } catch (e) {
    errors.push({ step: 'disable_inactive', error: e.message });
  }

  await logActivity('pfs_searches_synced', 'pfs_radar', {
    activeClients: clients.length,
    created: created.length,
    updated: updated.length,
    disabled: disabled.length,
    errors: errors.length,
  }, actor);

  await reportHealth('sync', {
    ok: errors.length === 0,
    error: errors.length ? `${errors.length} error(s), first: ${JSON.stringify(errors[0]).slice(0, 200)}` : null,
    stats: { activeClients: clients.length, created: created.length, updated: updated.length, disabled: disabled.length },
  });

  return res.status(200).json({
    ok: errors.length === 0,
    activeClients: clients.length,
    created, updated, disabled, errors,
  });
}
