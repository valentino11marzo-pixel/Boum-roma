// api/publisher/queue.js — LA CODA DEL PUBBLICISTA.
//
// GET  ?portal=immobiliare|idealista[&limit=N]
//      → la worklist viva: azioni (remove → create → update) con il payload
//        COMPLETO già normalizzato (api/publisher/_state.js). Il Mac non
//        deve pensare: esegue e riferisce.
// POST { portal, results:[{ id, op, hash, ok, remoteId?, remoteUrl?,
//        error? }], blocked?, error? }
//      → aggiorna lo stato (portalPubs/<portal>_<listingId>), scrive
//        l'heartbeat publisher-<portale> (l'allerta Telegram esistente — 3
//        fallimenti consecutivi — copre anche questo, api/pfs/_health.js) e
//        manda un recap Telegram SOLO quando qualcosa è cambiato davvero.
//
// Il Mac DEVE rimandare l'hash ricevuto nell'azione: lo stato registra il
// contenuto che è stato DAVVERO pubblicato, non quello che il catalogo ha
// nel momento del rapporto — se l'operatore edita il listing mentre il Mac
// lavora, il diff al giro dopo se ne accorge da solo.
//
// Kill switch: settings/publisher { enabled, portals:{ <p>:{enabled} } } —
// spento → worklist vuota, il Mac non fa nulla. Auth come i cron PFS
// (Bearer CRON_SECRET, X-Homie-Secret, o ID token admin).

import { requireCronOrAdmin } from '../pfs/_guard.js';
import { reportHealth, tgNotify } from '../pfs/_health.js';
import { fsList, fsGet, fsPatch, readJson } from '../homie/_lib.js';
import {
  PORTALS, SUGGESTED_INTERVAL_MINUTES,
  worklist, payloadFor, runVerdict,
} from './_state.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const q = req.query || {};
  const portal = String((req.method === 'GET' ? q.portal : null) || '').toLowerCase();

  // ── il rapporto del giro ────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body = {};
    try { body = (await readJson(req)) || {}; } catch { /* rapporto illeggibile = giro fallito */ }
    const p = String(body.portal || '').toLowerCase();
    if (!PORTALS.includes(p)) return res.status(400).json({ ok: false, error: 'bad_portal' });

    const results = Array.isArray(body.results) ? body.results.slice(0, 50) : [];
    let published = 0, removed = 0, failed = 0;
    const lines = [];

    for (const r of results) {
      if (!r || !r.id) continue;
      const docPath = 'portalPubs/' + p + '_' + r.id;
      let prev = null;
      try { prev = await fsGet(docPath); } catch { /* primo giro */ }
      const base = { portal: p, listingId: String(r.id), lastRunAt: new Date(), lastOp: String(r.op || '') };
      try {
        if (r.ok === true && (r.op === 'create' || r.op === 'update')) {
          published++;
          await fsPatch(docPath, {
            ...base, status: 'live', wasLive: true,
            hash: String(r.hash || ''), attempts: 0, lastError: null, failedHash: null,
            remoteId: r.remoteId ? String(r.remoteId) : ((prev && prev.remoteId) || null),
            remoteUrl: r.remoteUrl ? String(r.remoteUrl) : ((prev && prev.remoteUrl) || null),
            publishedAt: new Date(),
          });
          lines.push('✓ ' + (r.op === 'create' ? 'pubblicato' : 'aggiornato') + ' <b>' + esc(r.name || r.id) + '</b>'
            + (r.remoteUrl ? '\n   ' + esc(r.remoteUrl) : ''));
        } else if (r.ok === true && r.op === 'remove') {
          removed++;
          await fsPatch(docPath, { ...base, status: 'removed', wasLive: false, attempts: 0, lastError: null, removedAt: new Date() });
          lines.push('✕ tolto <b>' + esc(r.name || r.id) + '</b>');
        } else {
          failed++;
          await fsPatch(docPath, {
            ...base, status: 'error',
            attempts: ((prev && Number(prev.attempts)) || 0) + 1,
            failedHash: String(r.hash || ''),
            lastError: String(r.error || 'unknown').slice(0, 300),
          });
        }
      } catch (e) {
        console.error('[publisher/queue] state write failed for', docPath, e.message);
      }
    }

    const ok = runVerdict(body);
    await reportHealth('publisher-' + p, {
      ok,
      stats: { results: results.length, published, removed, failed, blocked: body.blocked === true },
      error: ok ? null : (body.error || (body.blocked ? 'sessione bloccata (login/captcha)' : `falliti ${failed}/${results.length}`)),
    });

    // Recap solo quando è successo qualcosa: il silenzio dei giri a vuoto è salute.
    if (published + removed > 0 || failed > 0) {
      const head = '📣 <b>Pubblicista — ' + esc(p) + '</b>\n';
      const tail = failed ? '\n⚠️ ' + failed + ' fallit' + (failed === 1 ? 'o' : 'i') + ' (riprovo al prossimo giro)' : '';
      await tgNotify(head + lines.slice(0, 8).join('\n') + tail);
    }

    return res.status(200).json({ ok: true, recorded: { published, removed, failed } });
  }

  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  // ── la worklist ─────────────────────────────────────────────────────────
  if (!PORTALS.includes(portal)) return res.status(400).json({ ok: false, error: 'bad_portal', portals: PORTALS });

  let cfg = null;
  try { cfg = await fsGet('settings/publisher'); } catch { /* mai un blocco: default acceso */ }
  const enabled = !(cfg && (cfg.enabled === false || (cfg.portals && cfg.portals[portal] && cfg.portals[portal].enabled === false)));
  if (!enabled) {
    return res.status(200).json({ ok: true, portal, enabled: false, actions: [], suggestedIntervalMinutes: SUGGESTED_INTERVAL_MINUTES });
  }

  let listings = [], pubs = [];
  try {
    listings = await fsList('listings', { limit: 400 });
    pubs = await fsList('portalPubs', { filter: { field: 'portal', op: 'EQUAL', value: portal }, limit: 800 });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'catalog_read_failed', detail: e.message });
  }

  const limit = Math.min(Number(q.limit) || 20, 50);
  const wl = worklist(listings, pubs, { portal, limit });
  const byId = new Map(listings.map((l) => [l.id, l]));
  const actions = wl.actions.map((a) => ({
    ...a,
    payload: a.op === 'remove' ? null : payloadFor(byId.get(a.id), portal),
  }));

  return res.status(200).json({
    ok: true,
    portal,
    enabled: true,
    suggestedIntervalMinutes: SUGGESTED_INTERVAL_MINUTES,
    // Il contratto in chiaro, così il Mac non deve ricordarselo: esegui le
    // azioni IN ORDINE (prima i remove), una alla volta, a ritmo umano;
    // rimanda ogni esito — con lo stesso `hash` dell'azione — a POST qui.
    reportTo: '/api/publisher/queue',
    stats: wl.stats,
    actions,
  });
}
