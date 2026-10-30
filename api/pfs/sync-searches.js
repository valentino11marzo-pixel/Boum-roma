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
// set on first creation — re-syncs never clobber what Valentino tuned. The
// one exception is our own switch-off: a search this file disabled because
// the client changed city (disabledReason 'market_changed') is switched back
// on when the client's city brings that portal back.

import { fsGet, fsPatch, fsList, logActivity } from '../homie/_lib.js';
import { requireCronOrAdmin } from './_guard.js';
import { listActiveClients } from './_ingest.js';
import { buildSearchUrlsFor } from './_searchurls.js';
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
  const reenabled = [];
  const errors = [];

  let clients;
  try { clients = await listActiveClients(); }
  catch (e) { return res.status(500).json({ ok: false, error: 'client_list_failed', detail: e.message }); }

  const activeIds = new Set(clients.map(c => c.id));
  // I portali giusti per la città di ogni cliente (Roma: immobiliare +
  // idealista.it; Madrid/Barcellona: idealista.com). Serve sotto, per
  // spegnere le ricerche di un cliente che ha cambiato città.
  const portalsByClient = new Map();

  for (const client of clients) {
    const wanted = buildSearchUrlsFor(client);
    portalsByClient.set(client.id, new Set(wanted.map(w => w.portal)));
    for (const s of wanted) {
      const docId = `pfs_${client.id}_${s.portal}`;
      try {
        const existing = await fsGet('radarSearches/' + docId);
        const base = {
          name: `PFS · ${client.name || client.id} · ${s.portal}`,
          portal: s.portal,
          searchUrl: s.url,
          label: s.label,
          // La zona PULITA della ricerca (mai la label): scan-market la
          // passa all'ingestione quando l'annuncio non dichiara la sua.
          zoneName: s.zone || null,
          market: s.market || 'roma',
          clientId: client.id,
          clientName: client.name || null,
          auto: true,
          syncedAt: now,
        };
        if (!existing) {
          await fsPatch('radarSearches/' + docId, { ...base, enabled: true, createdAt: now });
          created.push(docId);
        } else if (existing.enabled === false && existing.disabledReason === 'market_changed') {
          // La spense QUESTO file quando il cliente cambiò città; ora la città
          // è tornata quella del portale: la si riaccende (urlOverride e
          // knownListings restano). Uno spegnimento A MANO (nessun motivo) o
          // per cliente inattivo non si tocca: non è nostro da annullare.
          await fsPatch('radarSearches/' + docId, { ...base, enabled: true, disabledAt: null, disabledReason: null, reenabledAt: now });
          updated.push(docId);
          reenabled.push(docId);
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
      } else if (s.auto === true && s.clientId && activeIds.has(s.clientId) && s.enabled !== false &&
                 !(portalsByClient.get(s.clientId) || new Set()).has(s.portal)) {
        // Il cliente è attivo ma in un'altra città: le ricerche del portale
        // vecchio si spengono (mai cancellate: l'urlOverride resta).
        await fsPatch('radarSearches/' + s.id, { enabled: false, disabledAt: now, disabledReason: 'market_changed' });
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
    reenabled: reenabled.length,
    errors: errors.length,
  }, actor);

  // Il battito che mancava: pfs-command e /api/pfs/health leggevano
  // pfsRadarHealth/sync ma NESSUNO lo scriveva — la fonte sembrava
  // eternamente stantia (o assente) qualunque cosa facesse davvero.
  await reportHealth('sync', {
    ok: errors.length === 0,
    error: errors.length ? `${errors.length} errori (primo: ${JSON.stringify(errors[0]).slice(0, 160)})` : null,
    stats: { activeClients: clients.length, created: created.length, updated: updated.length, disabled: disabled.length, reenabled: reenabled.length },
  });

  return res.status(200).json({
    ok: errors.length === 0,
    activeClients: clients.length,
    created, updated, disabled, reenabled, errors,
  });
}
