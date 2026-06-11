// api/pfs/_health.js
// Heartbeat + alerting for the PFS radar pipeline. Every cron run writes a
// pfsRadarHealth/<source> doc the command center renders as a status bar,
// so a silent breakage is visible within one cron cycle instead of after a
// week of missed listings.
//
// Telegram alert fires only on sustained failure (3+ consecutive errors)
// and re-arms after ALERT_COOLDOWN_MS so a flapping source doesn't spam.

import { fsGet, fsPatch } from '../homie/_lib.js';

const ALERT_COOLDOWN_MS = 6 * 3600 * 1000;
const FAILURES_BEFORE_ALERT = 3;

async function tgNotify(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    return r.ok;
  } catch { return false; }
}

// source: 'inbox' | 'market' | 'sync'
// result: { ok: boolean, stats?: object, error?: string }
export async function reportHealth(source, result) {
  const now = new Date();
  let prev = null;
  try { prev = await fsGet('pfsRadarHealth/' + source); } catch { /* first run */ }

  const consecutiveErrors = result.ok ? 0 : ((prev && prev.consecutiveErrors) || 0) + 1;
  const doc = {
    source,
    lastRunAt: now,
    ok: !!result.ok,
    consecutiveErrors,
    lastError: result.ok ? null : String(result.error || 'unknown').slice(0, 500),
    stats: result.stats || {},
  };
  if (result.ok) doc.lastOkAt = now;

  let alerted = false;
  const lastAlertAt = prev && prev.lastAlertAt ? new Date(prev.lastAlertAt) : null;
  const cooledDown = !lastAlertAt || (now - lastAlertAt) > ALERT_COOLDOWN_MS;
  if (!result.ok && consecutiveErrors >= FAILURES_BEFORE_ALERT && cooledDown) {
    alerted = await tgNotify(
      `⚠️ <b>PFS Radar — fonte "${source}" ferma</b>\n` +
      `${consecutiveErrors} run falliti di fila.\n` +
      `Ultimo errore: ${String(result.error || '').slice(0, 200)}\n` +
      `Controlla il command center: https://boomrome.com/pfs-command`
    );
    if (alerted) doc.lastAlertAt = now;
  }
  // Recovery note (once) when a previously-broken source comes back
  if (result.ok && prev && (prev.consecutiveErrors || 0) >= FAILURES_BEFORE_ALERT) {
    await tgNotify(`✅ PFS Radar — fonte "${source}" di nuovo operativa.`);
  }

  try { await fsPatch('pfsRadarHealth/' + source, doc); }
  catch (e) { console.error('[pfs/_health] write failed:', e.message); }
  return { consecutiveErrors, alerted };
}

// Append listings we could not ingest automatically (e.g. price missing and
// detail page unreachable) so nothing is ever silently dropped — the
// command center shows them under "Da verificare" for manual add.
export async function reportNeedsAttention(source, items) {
  if (!items || !items.length) return;
  try {
    const prev = await fsGet('pfsRadarHealth/' + source);
    const existing = (prev && Array.isArray(prev.needsAttention)) ? prev.needsAttention : [];
    const merged = [...existing];
    for (const it of items) {
      if (!merged.some(m => m && m.sourceUrl === it.sourceUrl)) {
        merged.push({ ...it, at: new Date().toISOString() });
      }
    }
    await fsPatch('pfsRadarHealth/' + source, { needsAttention: merged.slice(-30) });
  } catch (e) {
    console.error('[pfs/_health] needsAttention write failed:', e.message);
  }
}
