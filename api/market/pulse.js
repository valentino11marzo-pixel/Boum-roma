// api/market/pulse.js — IL PERITO, il battito quotidiano (cron 05:50 UTC).
//
// Non raccoglie niente (le porte sono l'ingestione PFS e gli occhi di Homie):
// AGGREGA. Ogni mattina legge il libro mastro e scrive le statistiche di zona
// in `marketStats/<zoneSlug>` — UN documento per zona, così la comps card nel
// portal legge un doc e mai il registro intero dal browser.
//
// L'onestà del campione vive nel motore (zoneStats: sotto minSample niente
// numeri) e il verdetto del run vive qui: un libro mastro VUOTO o un backlog
// di verifiche che cresce non sono un mercato fermo — sono un guasto a una
// porta, e il report lo dice con le parole giuste (la lezione di pfs/eyes).
//
// Auth come i cron PFS (Bearer CRON_SECRET / X-Homie-Secret / admin token);
// `?dry=1` calcola senza scrivere. Heartbeat `teamHealth/perito`.

import ME from '../../js/market-engine.js';
import RADAR from '../../js/radar-engine.js';
import { knobs, rejectedLine } from '../_squadra.js';
import {
  requireCronOrAdmin, fsList, fsPatch,
  reportEmployeeHealth, saveReport,
} from '../employees/_lib.js';

const EMPLOYEE = 'perito';
const LEDGER_LIMIT = 4000;   // tetto largo, mai orderBy+limit (doc legacy)

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = String(req.query?.dry || '') === '1';

  try {
    const out = await run({ dry });
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: true, stats: out.counts });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[perito]', e);
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function run({ dry }) {
  const { k, rejected } = await knobs(EMPLOYEE);
  const nowMs = Date.now();

  const ledger = await fsList('marketListings', { limit: LEDGER_LIMIT });

  // ── Il verdetto prima dei numeri ──────────────────────────────────────
  if (!ledger.length) {
    const summary = 'Libro mastro VUOTO — nessuna porta ha ancora registrato un annuncio. '
      + 'O il tap è appena nato, o l\'ingestione (alert email / occhi di Homie) è ferma: '
      + 'controlla pfsRadarHealth.';
    if (!dry) await saveReport(EMPLOYEE, { summary, counts: { ledger: 0 } });
    return { counts: { ledger: 0, zones: 0 }, summary };
  }

  const actives = ledger.filter(l => l.status === 'active');
  const gone = ledger.filter(l => l.status === 'gone');

  // Backlog verifiche: vivi mai controllati o non controllati da 7+ giorni.
  // Se cresce, gli occhi di Homie non stanno girando — va DETTO, perché
  // senza morti l'assorbimento invecchia in silenzio.
  const staleMs = 7 * 86400e3;
  const backlog = actives.filter(l => {
    const t = +new Date(l.lastCheckedAt || 0);
    return !t || (nowMs - t) > staleMs;
  }).length;

  // ── Le statistiche, una zona alla volta ───────────────────────────────
  const zones = [...new Set(ledger.map(l => l.zoneSlug).filter(Boolean))];
  const statsBySlug = {};
  let written = 0, published = 0;
  for (const zone of zones) {
    const stats = ME.zoneStats(ledger, { zone, minSample: k.minSample, nowMs });
    statsBySlug[zone] = stats;
    if (stats.asked.ok || stats.absorption.ok) published++;
    if (!dry) {
      await fsPatch('marketStats/' + zone, { ...stats, at: new Date(), minSample: k.minSample });
      written++;
    }
  }

  // ── IL RADAR MANDATI (card per l'operatore, MAI messaggi) ─────────────
  // Un PRIVATO fermo ben oltre l'assorbimento della sua zona è un
  // proprietario che sta scoprendo da solo quanto è faticoso affittare:
  // il candidato naturale per proporre la gestione BOOM. Lo studio Homie
  // lo sancisce così: CARD nella console, mai contatto automatico (la D5
  // del Perito — niente rubrica dei privati — non si tocca: qui viaggiano
  // solo i fatti dell'annuncio e il suo URL pubblico).
  const mandati = ledger
    .map(l => {
      const m = RADAR.mandatoCheck(l, l.zoneSlug ? statsBySlug[l.zoneSlug] : null, { nowMs });
      return m ? {
        id: l.id, title: l.title || null, zone: l.zone || null, zoneSlug: l.zoneSlug || null,
        price: l.price != null ? l.price : null, sqm: l.sqm != null ? l.sqm : null,
        url: l.sourceUrl, source: l.source || null,
        staleDays: m.staleDays, threshold: m.threshold, basis: m.basis,
        priceDropAt: l.priceDropAt || null, firstSeenAt: l.firstSeenAt || null,
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.staleDays - a.staleDays)
    .slice(0, 40);
  if (!dry) {
    await fsPatch('radarState/mandati', { items: mandati, updatedAt: new Date() }).catch(() => {});
  }

  const counts = {
    ledger: ledger.length, actives: actives.length, gone: gone.length,
    zones: zones.length, zonesPublished: published, checkBacklog: backlog,
    mandati: mandati.length,
  };
  const summary = [
    `${ledger.length} annunci a libro (${actives.length} vivi · ${gone.length} morti provate) · `
      + `${zones.length} zone, ${published} con campione sufficiente`,
    mandati.length ? `🎯 ${mandati.length} candidati mandato (privati fermi oltre l'assorbimento) → /radar` : '',
    backlog > 50 ? `⚠️ ${backlog} verifiche di vita arretrate — gli occhi di Homie girano?` : '',
    rejectedLine(rejected),
  ].filter(Boolean).join(' — ');

  if (!dry) await saveReport(EMPLOYEE, { summary, counts });
  return { counts, summary, written };
}
