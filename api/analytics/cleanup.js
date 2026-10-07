// Daily 90-day retention sweep. Vercel cron only.
import { fsDelete, fsList } from '../homie/_lib.js';

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET)
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  try {
    const expired = await fsList('webJourneys', {
      filter: { field: 'expiresAt', op: 'LESS_THAN', value: new Date() }, limit: 250
    });
    await Promise.all(expired.map(x => fsDelete('webJourneys/' + x.id)));
    return res.status(200).json({ ok: true, deleted: expired.length, more: expired.length === 250 });
  } catch (e) {
    console.error('[analytics/cleanup] failed:', e.message);
    return res.status(503).json({ ok: false, error: 'cleanup_failed' });
  }
}
