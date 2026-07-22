// api/banking/institutions.js — bank picker for /banca (admin)
//
// POST { q?: string, country?: 'it' } → { ok, configured, institutions:[{id,name,logo,days}] }
// When GoCardless keys aren't configured yet, returns configured:false so the
// page can show the setup hint (and the manual CSV import still works).

import { requireCronOrAdmin } from '../pfs/_guard.js';
import { gc, gcConfigured } from './_lib.js';

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  if (!gcConfigured()) return res.status(200).json({ ok: true, configured: false, institutions: [] });

  try {
    const country = (req.body?.country || 'it').toLowerCase();
    const list = await gc(`/institutions/?country=${encodeURIComponent(country)}`);
    const q = String(req.body?.q || '').toLowerCase();
    const institutions = (Array.isArray(list) ? list : [])
      .filter(i => !q || i.name.toLowerCase().includes(q))
      .map(i => ({ id: i.id, name: i.name, logo: i.logo, days: Number(i.transaction_total_days) || 90 }))
      .slice(0, 40);
    return res.status(200).json({ ok: true, configured: true, institutions });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
}
