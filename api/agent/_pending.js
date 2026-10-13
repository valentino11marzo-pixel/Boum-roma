// api/agent/_pending.js — le code 'pending' (agentNotifications, action_queue)
// col più RECENTE garantito dentro la finestra.
//
// LA STESSA LEZIONE DI api/leads/_fresh.js (30/09/2026), PAGATA DI NUOVO.
// notify-pending e la coda del demone sul Mac leggevano:
//
//     fsList('agentNotifications', { filter: status == 'pending', limit: 50 })
//
// senza orderBy: Firestore restituisce i primi 50 in ordine di NOME. Una
// card già spinta su Telegram resta 'pending' (si scrive solo
// telegramNotifiedAt) e, senza il demone del Mac che la reclama, ci resta
// per sempre. Oltre 50 card vecchie, gli id 'payrep_…' (bonifico segnalato
// dall'inquilino su /rata) e 'maint_…' (guasto da /guasto) — che vengono
// DOPO gran parte degli id automatici — non entravano più nella finestra:
// la card «💶 dice di aver pagato» non arrivava mai sul telefono, e la rata
// restava «In verifica» senza che nessuno lo sapesse.
//
// La cura non toglie niente: la lettura storica resta (nulla di ciò che
// partiva prima smette di partire) e le si AFFIANCA la finestra recente
// ordinata per createdAt. Due forme di createdAt esistono davvero (stringa
// ISO — quasi tutti i writer di agentNotifications — e timestamp — action_
// queue): Firestore confronta per TIPO, quindi due letture di intervallo.
// Solo indici a campo singolo, che Firestore crea da sé.
//
// Più lo SPAZZINO: una card 'pending' più vecchia di due settimane non la
// reclama più nessuno (il demone prende solo le ultime 24 ore, Telegram l'ha
// già avuta o non la avrà). Passa a 'expired' — mai cancellata, il registro
// resta — così la finestra storica smette di riempirsi di fossili.

import { fsList, fsPatch, fsGet } from '../homie/_lib.js';

const DAY = 86400000;

export const tsOf = (v) => {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'object' && typeof v._seconds === 'number') return v._seconds * 1000;
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
};

/**
 * I documenti 'pending' di `collection`: unione di (a) la finestra degli
 * ultimi `days` giorni per createdAt (più recenti prima, timestamp E
 * stringa ISO) e (b) la lettura storica per status. Dedup per id; filtrati
 * a status 'pending'; ordine: più recenti prima. Lancia solo se TUTTE le
 * letture falliscono.
 */
export async function pendingRecent(collection, { days = 3, limit = 100, legacyLimit = 50, now = Date.now(), list = fsList } = {}) {
  const since = new Date(now - days * DAY);
  const recent = (value) => list(collection, {
    filter: { field: 'createdAt', op: 'GREATER_THAN_OR_EQUAL', value },
    orderBy: { field: 'createdAt', direction: 'DESCENDING' },
    limit,
  });
  const settled = await Promise.allSettled([
    recent(since),
    recent(since.toISOString()),
    list(collection, { filter: { field: 'status', op: 'EQUAL', value: 'pending' }, limit: legacyLimit }),
  ]);
  if (settled.every((r) => r.status === 'rejected')) throw settled[0].reason;
  const byId = new Map();
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    for (const d of r.value || []) if (d && d.id && !byId.has(d.id)) byId.set(d.id, d);
  }
  return [...byId.values()]
    .filter((d) => d.status === 'pending')
    .sort((a, b) => tsOf(b.createdAt) - tsOf(a.createdAt));
}

/** Le notifiche agente 'pending' (la forma che usano notify-pending e la coda del Mac). */
export function pendingNotifications(opts = {}) {
  return pendingRecent('agentNotifications', opts);
}

// ── Lo spazzino ─────────────────────────────────────────────────────────────
// Al massimo una volta l'ora (heartbeat/agent-notifications-sweep), al
// massimo `max` card per giro: la storia si smaltisce a pezzi, senza mai
// allungare il giro di notify-pending.
export const SWEEP_MAX_AGE_DAYS = 14;
const SWEEP_EVERY_MS = 3600 * 1000;
const SWEEP_DOC = 'heartbeat/agent-notifications-sweep';

/** Pura: quali card scadono adesso. */
export function staleNotifications(rows, { now = Date.now(), maxAgeDays = SWEEP_MAX_AGE_DAYS } = {}) {
  const cutoff = now - maxAgeDays * DAY;
  return (rows || []).filter((d) => d && d.id && d.status === 'pending' && tsOf(d.createdAt) > 0 && tsOf(d.createdAt) < cutoff);
}

export async function sweepStaleNotifications({ now = Date.now(), max = 100, maxAgeDays = SWEEP_MAX_AGE_DAYS, force = false,
  list = fsList, patch = fsPatch, get = fsGet } = {}) {
  if (!force) {
    let last = null;
    try { last = await get(SWEEP_DOC); } catch { last = null; }
    if (last && now - tsOf(last.lastSweepAt) < SWEEP_EVERY_MS) return { skipped: 'recent' };
  }
  // il giro si prenota PRIMA di lavorare: due minuti di fila non spazzano due volte
  try { await patch(SWEEP_DOC, { lastSweepAt: new Date(now).toISOString() }); } catch { /* si spazza comunque */ }
  const rows = await list('agentNotifications', { filter: { field: 'status', op: 'EQUAL', value: 'pending' }, limit: 300 });
  const stale = staleNotifications(rows, { now, maxAgeDays }).slice(0, max);
  let expired = 0;
  for (const d of stale) {
    try {
      await patch('agentNotifications/' + d.id, { status: 'expired', expiredAt: new Date(now).toISOString(), expiredBy: 'sweeper' });
      expired++;
    } catch { /* la prossima ora */ }
  }
  return { scanned: (rows || []).length, expired };
}
