// Il destinatario vede esclusivamente i campi pubblici dello SmartLink.
import { fsGet } from '../homie/_lib.js';
import RULES from '../../js/smartlink-engine.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const id = String(req.query?.id || '');
  if (!/^[A-Za-z0-9_-]{20}$/.test(id)) return res.status(404).json({ ok: false, error: 'not_found' });
  try {
    const d = await fsGet('smartlinks/' + id);
    if (!d || d.active !== true) return res.status(404).json({ ok: false, error: 'not_found' });
    return res.status(200).json({ ok: true, listing: RULES.publicRecord(d) });
  } catch {
    return res.status(503).json({ ok: false, error: 'temporarily_unavailable' });
  }
}
