// L'interruttore della preparazione automatica, dal portal (Oggi).
// Fino al 21/09/2026 `settings/segretaria.prepareCases` e `prepareSince` non
// avevano NESSUNA superficie che li scrivesse: la Segreteria era costruita,
// deployata e spenta — un WhatsApp entrava in Inbox e non diventava mai un
// caso, perché il worker esce subito senza prepareCases e refreshTrackedFollowUp
// non iscrive nulla senza prepareSince. Qui l'operatore la accende (e la
// sospende) con un tap; prepareSince nasce alla PRIMA accensione e non si
// riavvolge mai: l'arretrato resta fuori dal rollout, come da disegno.
import { requireRole } from '../_auth.js';
import { fsGet, fsPatch, readJson } from '../homie/_lib.js';
import { readPreparationMonitor } from './_monitor.js';
import { checkTimestamp } from './_follow-up.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) return;
  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (!body || typeof body.prepareCases !== 'boolean') return res.status(400).json({ ok: false, error: 'invalid_request' });
  let raw;
  try { raw = (await fsGet('settings/segretaria')) || {}; }
  catch { return res.status(503).json({ ok: false, error: 'settings_unavailable' }); }
  // Il kill switch vince: una Segretaria spenta non prepara, e lo si dice
  // invece di accendere un flag che il worker ignorerebbe in silenzio.
  if (body.prepareCases && raw.enabled === false) return res.status(409).json({ ok: false, error: 'segretaria_disabled' });
  const now = new Date(Date.now());
  const fields = { prepareCases: body.prepareCases, preparationChangedAt: now, preparationChangedBy: auth.uid };
  if (body.prepareCases && !Number.isFinite(checkTimestamp(raw.prepareSince))) fields.prepareSince = now.toISOString();
  try { await fsPatch('settings/segretaria', fields); }
  catch { return res.status(503).json({ ok: false, error: 'settings_write_failed' }); }
  let monitoring = null;
  try { monitoring = await readPreparationMonitor({ now: now.getTime() }); } catch { /* lo stato lo rilegge la Home */ }
  return res.status(200).json({ ok: true, prepareCases: body.prepareCases,
    prepareSince: fields.prepareSince || raw.prepareSince || null, monitoring });
}
