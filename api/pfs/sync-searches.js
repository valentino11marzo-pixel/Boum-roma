// api/pfs/sync-searches.js
// "Crea gli alert da solo": once daily after 04:00 UTC (or on admin request) this upserts one
// radarSearches doc per portal (id pfs_<clientId>_<portal>), generated
// from the client's stored criteria. When criteria change the URLs follow;
// when a client goes inactive (placed/archived) their searches switch off.
// scan-market.js then scans whatever is enabled.
// Every other five-minute cron run repairs only paid PFS kickoffs left pending.
//
// Auth: Vercel cron (Bearer CRON_SECRET), Homie (X-Homie-Secret), or the
// command center (Firebase admin ID token). GET or POST.
//
// Manual knobs preserved on update: `enabled` and `urlOverride` are only
// set on first creation — re-syncs never clobber what Valentino tuned.

import { fsGet, fsPatch, fsList, logActivity } from '../homie/_lib.js';
import { requireCronOrAdmin } from './_guard.js';
import { isActivePfsClient, listActiveClients } from './_ingest.js';
import { ensurePfsKickoff, syncClientSearches } from './_kickoff.js';
import { reportHealth } from './_health.js';

// A delayed cron must not miss the daily reconcile. The attempt marker also
// prevents a broken full sync from rewriting every search every five minutes:
// it retries once an hour until one complete run succeeds.
export function dailySyncDue(now, state = {}) {
  if (now.getUTCHours() < 4) return false;
  const day = now.toISOString().slice(0, 10);
  if (state.lastFullSyncDay === day) return false;
  const attempted = Date.parse(state.lastFullSyncAttemptAt || '');
  return !Number.isFinite(attempted) || now.getTime() - attempted >= 3600_000;
}

export const dailyMarkerEligible = now => now.getUTCHours() >= 4;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const now = new Date();
  let syncState = null;
  try { syncState = await fsGet('pfsRadarHealth/sync'); }
  catch (e) { return res.status(500).json({ ok: false, error: 'sync_state_read_failed', detail: e.message }); }
  // One cron endpoint serves two rhythms: five-minute pending retries and
  // one durable daily reconciliation after 04:00 UTC.
  const fullSync = actor !== 'cron' || dailySyncDue(now, syncState || {});
  // A manual sync before 04:00 cannot satisfy (or postpone) the scheduled
  // daily reconcile that follows it.
  if (fullSync && dailyMarkerEligible(now)) try { await fsPatch('pfsRadarHealth/sync', { lastFullSyncAttemptAt: now.toISOString() }); }
  catch (e) { return res.status(500).json({ ok: false, error: 'sync_state_write_failed', detail: e.message }); }
  const created = [];
  const updated = [];
  const disabled = [];
  const errors = [];

  let clients;
  try {
    clients = fullSync ? await listActiveClients() : (await fsList('pfsClients', {
      filter: { field: 'pfsKickoffStatus', op: 'EQUAL', value: 'pending' }, limit: 200,
    })).filter(isActivePfsClient);
  }
  catch (e) { return res.status(500).json({ ok: false, error: 'client_list_failed', detail: e.message }); }

  // Quiet empty polling: no Firestore activity/heartbeat writes 287 times a
  // day when there is no pending paid checkout. The daily heartbeat remains.
  if (!fullSync && clients.length === 0) return res.status(200).json({
    ok: true, mode: 'pending', activeClients: 0,
    created: [], updated: [], disabled: [], errors: [],
  });

  const activeIds = fullSync ? new Set(clients.map(c => c.id)) : null;

  for (const client of clients) {
    const r = client.pfsKickoffStatus === 'pending'
      ? await ensurePfsKickoff(client, now)
      : await syncClientSearches(client, now);
    created.push(...r.created);
    updated.push(...r.updated);
    errors.push(...r.errors);
  }

  // Switch off auto-searches whose client is no longer active
  if (fullSync) try {
    const all = await fsList('radarSearches', { limit: 200 });
    const verified = new Map();
    for (const s of all) {
      if (s.auto === true && s.clientId && !activeIds.has(s.clientId) && s.enabled !== false) {
        // The active-client list is capped at 200. Absence from that page is
        // not evidence of inactivity; verify the actual client before off.
        if (!verified.has(s.clientId)) {
          try { verified.set(s.clientId, await fsGet('pfsClients/' + s.clientId)); }
          catch (e) { errors.push({ step: 'verify_inactive', clientId: s.clientId, error: e.message }); continue; }
        }
        if (isActivePfsClient(verified.get(s.clientId))) continue;
        await fsPatch('radarSearches/' + s.id, { enabled: false, disabledAt: now, disabledReason: 'client_inactive' });
        disabled.push(s.id);
      }
    }
  } catch (e) {
    errors.push({ step: 'disable_inactive', error: e.message });
  }

  if (fullSync && dailyMarkerEligible(now) && errors.length === 0) try {
    await fsPatch('pfsRadarHealth/sync', { lastFullSyncDay: now.toISOString().slice(0, 10), lastFullSyncAt: now.toISOString() });
  } catch (e) { errors.push({ step: 'full_sync_marker', error: e.message }); }

  await logActivity('pfs_searches_synced', 'pfs_radar', {
    activeClients: clients.length, mode: fullSync ? 'full' : 'pending',
    created: created.length,
    updated: updated.length,
    disabled: disabled.length,
    errors: errors.length,
  }, actor);

  // Il battito che mancava: pfs-command e /api/pfs/health leggevano
  // pfsRadarHealth/sync ma NESSUNO lo scriveva — la fonte sembrava
  // eternamente stantia (o assente) qualunque cosa facesse davvero.
  await reportHealth('sync', {
    ok: errors.length === 0,
    error: errors.length ? `${errors.length} errori (primo: ${JSON.stringify(errors[0]).slice(0, 160)})` : null,
    stats: { activeClients: clients.length, mode: fullSync ? 'full' : 'pending', created: created.length, updated: updated.length, disabled: disabled.length },
  });

  return res.status(200).json({
    ok: errors.length === 0,
    mode: fullSync ? 'full' : 'pending',
    activeClients: clients.length,
    created, updated, disabled, errors,
  });
}
