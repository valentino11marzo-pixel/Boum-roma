// api/pfs/_health.js
// Heartbeat + alerting for the PFS radar pipeline. Every cron run writes a
// pfsRadarHealth/<source> doc the command center renders as a status bar,
// so a silent breakage is visible within one cron cycle instead of after a
// week of missed listings.
//
// Telegram alert fires only on sustained failure (3+ consecutive errors)
// and re-arms after ALERT_COOLDOWN_MS so a flapping source doesn't spam.

import { fsGet, fsPatch } from '../homie/_lib.js';

const H = 3600 * 1000;
const FAILURES_BEFORE_ALERT = 3;

// Il promemoria si dirada. Un guasto che dura tre settimane non va ricordato
// 96 volte: la prima volta è un'informazione, la novantaseiesima è rumore che
// ti INSEGNA a scartare gli allarmi del radar — e il giorno in cui muore
// davvero la fonte portante, scarterai anche quello.
export const ALERT_STEPS_MS = [6 * H, 24 * H, 72 * H, 168 * H];
const cooldownFor = n => ALERT_STEPS_MS[Math.min(n, ALERT_STEPS_MS.length - 1)];

/**
 * Decide cosa dire, e soprattutto quando TACERE. Pura ed esportata: è la
 * logica che consuma l'attenzione dell'operatore, quindi si testa.
 *
 * Tre stati, non due:
 *   ok       — funziona
 *   error    — si è rotto, e potrebbe riprendersi → promemoria che si dirada
 *   blocked  — NON PUÒ funzionare da qui (i portali rifiutano gli IP
 *              datacenter: è documentato in _fetch.js, non è passeggero).
 *              Si dice UNA volta, con la via d'uscita, poi silenzio finché
 *              lo stato non cambia davvero.
 *
 * @returns { kind:'error'|'blocked'|'recovery'|null, consecutiveErrors,
 *            blocked, alertCount }
 */
export function alertDecision(prev, result, now = Date.now()) {
  const wasBlocked = !!(prev && prev.blocked);
  const prevErrors = (prev && prev.consecutiveErrors) || 0;
  const prevCount = (prev && prev.alertCount) || 0;
  const lastAlertAt = prev && prev.lastAlertAt ? new Date(prev.lastAlertAt).getTime() : 0;

  // ── bloccata per costruzione ─────────────────────────────────────────────
  if (result.blocked) {
    return {
      // si parla solo alla TRANSIZIONE: da funzionante (o da guasto) a bloccata
      kind: wasBlocked ? null : 'blocked',
      consecutiveErrors: prevErrors,     // congelato: non sta fallendo, non può proprio
      blocked: true,
      alertCount: wasBlocked ? prevCount : prevCount + 1,
    };
  }

  // ── tornata a funzionare ─────────────────────────────────────────────────
  if (result.ok) {
    const wasBroken = wasBlocked || prevErrors >= FAILURES_BEFORE_ALERT;
    return { kind: wasBroken ? 'recovery' : null, consecutiveErrors: 0, blocked: false, alertCount: 0 };
  }

  // ── guasto vero ──────────────────────────────────────────────────────────
  const consecutiveErrors = prevErrors + 1;
  const due = !lastAlertAt || (now - lastAlertAt) >= cooldownFor(prevCount);
  const speak = consecutiveErrors >= FAILURES_BEFORE_ALERT && due;
  return {
    kind: speak ? 'error' : null,
    consecutiveErrors,
    blocked: false,
    alertCount: speak ? prevCount + 1 : prevCount,
  };
}

export async function tgNotify(text) {
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

// Il messaggio di una fonte bloccata deve fare tre cose: dire che NON è un
// guasto passeggero, dire cosa continua a funzionare (così non ti allarmi per
// il servizio), e dare la via d'uscita. Poi promettere silenzio — e mantenerlo.
const BLOCKED_TEXT = {
  market:
    `⛔ <b>PFS Radar — "market" non può funzionare da qui</b>\n` +
    `I portali rifiutano gli IP dei datacenter: lo scraping dal server è bloccato ` +
    `<b>per costruzione</b>, non è un guasto passeggero.\n\n` +
    `• La fonte portante resta l'email di alert (<code>scan-inbox</code>), che funziona.\n` +
    `• La via d'uscita è Homie: <code>/api/homie/searches</code> — IP residenziale, browser vero.\n\n` +
    `<i>Non ti avviso più su questa fonte finché lo stato non cambia.</i>`,
};

// source: 'inbox' | 'market' | 'sync' | 'homie-eyes' | …
// result: { ok:boolean, blocked?:boolean, stats?:object, error?:string }
export async function reportHealth(source, result) {
  const now = new Date();
  let prev = null;
  try { prev = await fsGet('pfsRadarHealth/' + source); } catch { /* first run */ }

  const d = alertDecision(prev, result, now.getTime());
  const doc = {
    source,
    lastRunAt: now,
    ok: !!result.ok,
    blocked: d.blocked,
    consecutiveErrors: d.consecutiveErrors,
    alertCount: d.alertCount,
    lastError: result.ok ? null : String(result.error || 'unknown').slice(0, 500),
    stats: result.stats || {},
  };
  if (result.ok) doc.lastOkAt = now;

  let alerted = false;
  if (d.kind === 'blocked') {
    alerted = await tgNotify(BLOCKED_TEXT[source] ||
      `⛔ <b>PFS Radar — fonte "${source}" bloccata all'origine</b>\n` +
      `${String(result.error || '').slice(0, 200)}\n` +
      `<i>Non è un guasto passeggero: non ti avviso più finché lo stato non cambia.</i>`);
    doc.blockedSince = (prev && prev.blockedSince) || now;
  } else if (d.kind === 'error') {
    const next = ALERT_STEPS_MS[Math.min(d.alertCount, ALERT_STEPS_MS.length - 1)] / (3600 * 1000);
    alerted = await tgNotify(
      `⚠️ <b>PFS Radar — fonte "${source}" ferma</b>\n` +
      `${d.consecutiveErrors} run falliti di fila.\n` +
      `Ultimo errore: ${String(result.error || '').slice(0, 200)}\n` +
      `Command center: https://boomrome.com/pfs-command\n` +
      `<i>Prossimo promemoria fra ~${next}h se resta così.</i>`
    );
  } else if (d.kind === 'recovery') {
    alerted = await tgNotify(`✅ PFS Radar — fonte "${source}" di nuovo operativa.`);
    doc.blockedSince = null;
  }
  if (alerted && d.kind !== 'recovery') doc.lastAlertAt = now;

  try { await fsPatch('pfsRadarHealth/' + source, doc); }
  catch (e) { console.error('[pfs/_health] write failed:', e.message); }
  return { consecutiveErrors: d.consecutiveErrors, blocked: d.blocked, alerted };
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
