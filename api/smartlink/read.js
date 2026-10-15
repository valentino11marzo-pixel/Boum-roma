// Il destinatario vede esclusivamente i campi pubblici dello SmartLink.
import { fsGet } from '../homie/_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const id = String(req.query?.id || '');
  if (!/^[A-Za-z0-9_-]{20}$/.test(id)) return res.status(404).json({ ok: false, error: 'not_found' });
  try {
    const d = await fsGet('smartlinks/' + id);
    if (!d || d.active !== true) return res.status(404).json({ ok: false, error: 'not_found' });
    const { sourceUrl, source, title, price, zone, sqm, rooms, note, observedAt, availability } = d;
    return res.status(200).json({ ok: true, listing: { sourceUrl, source, title, price, zone, sqm, rooms, note, observedAt, availability } });
  } catch {
    return res.status(503).json({ ok: false, error: 'temporarily_unavailable' });
  }
}
