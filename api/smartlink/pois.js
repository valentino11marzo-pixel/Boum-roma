// POI pubblici solo per una scheda attiva con area approvata dall'admin.
import { fsGet } from '../homie/_lib.js';
import { nearbyPois } from './_pois.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'method_not_allowed' });
  const id = String(req.query?.id || '');
  if (!/^[A-Za-z0-9_-]{20}$/.test(id)) return res.status(404).json({ ok:false, error:'not_found' });
  try {
    const d = await fsGet('smartlinks/' + id);
    if (!d || d.active !== true || !d.map) return res.status(404).json({ ok:false, error:'not_found' });
    return res.status(200).json(await nearbyPois(d.map));
  } catch { return res.status(503).json({ ok:false, error:'temporarily_unavailable' }); }
}
