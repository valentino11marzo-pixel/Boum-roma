// api/scrivano/worker.js — il braccio dello Scrivano (cron ogni minuto).
// Prende UNA lettura dalla coda (scrivanoProposals) e la esegue col cuore
// dell'Innesto; la card con il link al portal parte da _core.js. Auth come
// i cron PFS (Bearer CRON_SECRET · X-Homie-Secret · admin). `?dry=1` dice
// cosa farebbe. Battito su teamHealth/scrivano (card 🖋 in /team).
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { reportEmployeeHealth } from '../employees/_lib.js';
import { processQueue } from './_core.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const who = await requireCronOrAdmin(req, res);
  if (!who) return;
  const dry = String((req.query && req.query.dry) || '') === '1';
  try {
    const out = await processQueue({ dry });
    if (!dry) await reportEmployeeHealth('scrivano', { ok: true, stats: out.stats }).catch(() => {});
    return res.status(200).json(out);
  } catch (e) {
    console.error('[scrivano/worker]', e && e.message);
    if (!dry) await reportEmployeeHealth('scrivano', { ok: false, error: e && e.message }).catch(() => {});
    return res.status(500).json({ ok: false, error: 'worker_failed' });
  }
}
