// Proactive preparation only. No recipient, reply sending or Telegram card.
import { fsGet, fsGetVersioned, fsCommit, fsPatch, secretEqual } from '../homie/_lib.js';
import { listFollowUps, followUpDecisionHash } from './_follow-up.js';
import { prepareCase } from './_prepare.js';
import PROPOSTA from '../../js/segretaria-proposta-engine.js';
import { runBudget } from '../_budget.js';

export async function prepareNextCase({ now = Date.now() } = {}) {
  const budget = runBudget(60_000, 7_000);
  const config = await fsGet('settings/segretaria');
  if (config?.enabled === false || config?.prepareCases !== true) return { enabled: false, prepared: 0 };
  const list = await listFollowUps();
  const candidates = list.rows.filter(t => {
    const blocked = t.preparationRetry?.messageId === t.followUp.lastMessageId && Date.parse(t.preparationRetry.after) > now;
    if (blocked) return false;
    if (!PROPOSTA.current(t)) return true;
    if ((t.preparation.approval?.followUpFingerprint || t.preparation.followUpFingerprint) !== followUpDecisionHash(t.followUp)) return true;
    return Date.parse(t.followUp.checkAt) <= now && t.preparation.recheckFor !== t.followUp.checkAt;
  });
  const errors = [];
  let last = null;
  // Bounded recovery: an unreadable first case must not monopolise every run.
  for (const next of candidates.slice(0, 3)) {
    if (!budget.afford(35_000)) break;
    let result;
    try { result = await prepareCase({ id: next.id, actor: 'segretaria-worker', now, background: true, budget }); }
    catch { result = { code: 503, error: 'preparation_unavailable' }; }
    last = { id: next.id, code: result.code, error: result.error || null };
    if (result.code !== 200) errors.push(last);
    // Failure to persist a retry is also secondary: continue within the same
    // budget and retain its error in the existing worker heartbeat.
    try {
      const cur = await fsGetVersioned('operatorTasks/' + next.id);
      if (cur?.data.followUp?.lastMessageId === next.followUp.lastMessageId)
        await fsCommit([{ docPath: 'operatorTasks/' + next.id, precondition: { updateTime: cur.updateTime },
          fields: { preparationError: result.code === 200 ? null : result.error,
            preparationRetry: result.code === 200 ? null : { messageId: next.followUp.lastMessageId, after: new Date(now + 600000).toISOString() } } }]);
    } catch { errors.push({ id: next.id, error: 'preparation_retry_not_saved' }); }
    if (result.code === 200) return { enabled: true, prepared: 1, ...last, errors, incomplete: list.incomplete };
    if (result.code === 429 || result.error === 'preparation_time_budget') break;
  }
  return { enabled: true, prepared: 0, ...last, errors, incomplete: list.incomplete };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!process.env.CRON_SECRET || !secretEqual(req.headers?.authorization || '', 'Bearer ' + process.env.CRON_SECRET))
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  try {
    const out = await prepareNextCase();
    if (out.enabled) await fsPatch('heartbeat/segretaria-preparer', { at: new Date(), ...out });
    return res.status(200).json({ ok: true, ...out });
  } catch { return res.status(503).json({ ok: false, error: 'preparation_unavailable' }); }
}
