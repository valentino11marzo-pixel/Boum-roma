// api/meteo.js — IL METEO DEL MERCATO (STUDIO_AVIATION, W2).
//
// Il bollettino pubblico zona per zona, servito dai numeri del PERITO
// (`marketStats/<zoneSlug>`, scritti ogni mattina da api/market/pulse.js).
// La collection è admin-only nelle rules — giusto così: il registro non si
// espone. Questa porta pubblica NE RIPUBBLICA SOLO GLI AGGREGATI, con una
// whitelist esplicita campo per campo: mediana/p25/p75 del CHIESTO,
// assorbimento (SOLO morti provate), ribassi 30gg, conteggi campione.
// Mai un annuncio, mai un URL sorgente, mai un contatto.
//
// La disciplina del Perito passa intatta: una zona sotto `minSample` non
// porta NUMERI — finisce nell'elenco `measuring`, col solo nome. Riscrivere
// qui una soglia diversa significherebbe pubblicare mediane su 3 annunci.
//
// Cache CDN 30' (il dato cambia una volta al giorno): il costo di questa
// pagina per Firestore è ~zero.

import { fsList } from './homie/_lib.js';

const num = (v) => (Number.isFinite(+v) ? +v : null);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const docs = await fsList('marketStats', { limit: 200 });

    const zones = [];
    const measuring = [];
    let minSample = null;

    for (const d of docs || []) {
      const slug = String(d.zone || d.id || '').trim();
      if (!slug) continue;
      const name = slug.replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      if (d.minSample != null && minSample == null) minSample = num(d.minSample);

      const asked = d.asked || {};
      const abs = d.absorption || {};
      if (!asked.ok && !abs.ok) { measuring.push(name); continue; }

      zones.push({
        zone: name,
        slug,
        activeCount: num(d.activeCount),
        asked: asked.ok ? {
          medianEurSqm: num(asked.medianEurSqm),
          p25: num(asked.p25),
          p75: num(asked.p75),
          sample: num(asked.sample),
        } : null,
        absorptionDays: abs.ok ? num(abs.medianDays) : null,
        absorptionSample: abs.ok ? num(abs.sample) : null,
        priceDrops30d: num(d.priceDrops30d) || 0,
        updatedAt: d.at || null,
      });
    }

    zones.sort((a, b) =>
      ((b.asked && b.asked.sample) || 0) - ((a.asked && a.asked.sample) || 0)
      || a.zone.localeCompare(b.zone));
    measuring.sort();

    res.setHeader('Cache-Control',
      'public, max-age=0, s-maxage=1800, stale-while-revalidate=86400');
    return res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      minSample,
      zones,
      measuring,
    });
  } catch (e) {
    console.error('[meteo]', e);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
