// api/radar/valuta.js — IL VALUTATORE: "quanto affitta questa casa?", coi numeri.
//
// POST { zone*, sqm*, rooms? } → la fascia di canone per la zona:
//   - base = quantili del CHIESTO (marketStats/<zona>, scritti dal Perito);
//   - correzione = rapporto chiesto→FIRMATO misurato sui contratti BOOM veri
//     della stessa zona (≥3 firme, cap ±[-20%,+10%], sempre dichiarata) —
//     il dato che Casafari non ha;
//   - comparabili vivi dal libro mastro (stessa zona, ±25% mq, mai un morto).
//
// L'onestà del campione arriva dal motore: zona senza campione → ok:false
// 'small_sample', mai un numero debole spacciato per solido. La matematica
// vive in js/radar-engine.js (valuta(), esportata e testata); qui solo I/O.
//
// Auth: come i cron PFS (Bearer CRON_SECRET / X-Homie-Secret / token admin
// owner landlord) — così un domani anche il bot Telegram può chiedere una
// valutazione senza una porta nuova.

import RADAR from '../../js/radar-engine.js';
import { fsGet, fsList, readJson } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';

const DEAD_CONTRACT = new Set(['cancelled', 'terminated', 'annullato', 'draft']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  let body;
  try { body = await readJson(req); }
  catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const zoneName = String(body && body.zone || '').trim();
  const sqm = Number(body && body.sqm);
  const rooms = body && body.rooms != null ? Number(body.rooms) : null;
  if (!zoneName) return res.status(400).json({ ok: false, error: 'zone_required' });
  if (!isFinite(sqm) || sqm < 15 || sqm > 500) {
    return res.status(400).json({ ok: false, error: 'sqm_required', detail: 'mq tra 15 e 500' });
  }
  const zoneSlug = RADAR.normalizeZone(zoneName);
  if (!zoneSlug) return res.status(400).json({ ok: false, error: 'zone_invalid' });

  try {
    // Le quattro letture, in parallelo: statistiche di zona, comparabili
    // vivi della zona, contratti e immobili per i canoni FIRMATI.
    const [stats, zoneActives, contracts, properties] = await Promise.all([
      fsGet('marketStats/' + zoneSlug).catch(() => null),
      fsList('marketListings', { filter: { field: 'zoneSlug', op: 'EQUAL', value: zoneSlug }, limit: 400 }).catch(() => []),
      fsList('contracts', { limit: 300 }).catch(() => []),
      fsList('properties', { limit: 300 }).catch(() => []),
    ]);

    // I canoni firmati della zona: rent dal contratto, mq e zona dalla
    // property collegata. Chi non ha mq o zona non entra — mai inventare.
    const propById = {};
    for (const p of properties) propById[p.id] = p;
    const signed = [];
    for (const c of contracts) {
      if (DEAD_CONTRACT.has(String(c.status || '').toLowerCase())) continue;
      const rent = Number(c.rent);
      if (!isFinite(rent) || rent <= 0) continue;
      const p = c.propertyId ? propById[c.propertyId] : null;
      const pSqm = p ? Number(p.sqm || p.size) : NaN;
      const pZone = RADAR.normalizeZone(p && p.zone);
      if (!p || !isFinite(pSqm) || pSqm < 15 || !pZone) continue;
      if (pZone !== zoneSlug && RADAR.zoneCompat(pZone, zoneSlug) === 0) continue;
      signed.push({ rent, sqm: pSqm });
    }

    const out = RADAR.valuta(
      { zone: zoneName, sqm, rooms },
      { stats, actives: zoneActives.filter(l => l && l.status === 'active'), signed }
    );

    return res.status(200).json({
      ok: true,
      zone: { name: zoneName, slug: zoneSlug },
      subject: { sqm, rooms },
      valuation: out,
    });
  } catch (e) {
    console.error('[radar/valuta]', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
