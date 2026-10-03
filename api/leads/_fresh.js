// api/leads/_fresh.js — i lead «nuovi» che hanno ancora del lavoro da fare,
// col più RECENTE garantito dentro la finestra.
//
// LA LEZIONE DEL 30 SETTEMBRE 2026. Il Lead Brain (voto) e notify-pending
// (la card Telegram) leggevano i lead così:
//
//     fsList('leads', { filter: status == 'new', limit: 50 })
//
// senza orderBy. Firestore allora restituisce i documenti in ordine di NOME
// — cioè di id automatico, una stringa casuale — e i primi 50 sono 50 lead
// qualunque, non i più nuovi. Un lead resta 'new' finché l'operatore non
// risponde, quindi i vecchi 'new' si accumulano: oltre i 50, una candidatura
// appena arrivata ha una probabilità 50/N di cadere nella finestra. Fuori
// finestra non viene votata dal Brain e non riceve la card Telegram — MAI,
// perché gli stessi 50 id bassi, già votati e già notificati, occupano la
// finestra a ogni giro. La candidatura era in Firestore; l'operatore non la
// vedeva arrivare da nessuna parte.
//
// La cura non toglie niente: la vecchia lettura resta (nulla di ciò che
// partiva prima smette di partire, compresi i lead scritti senza createdAt)
// e le si AFFIANCA la finestra recente ordinata per createdAt, che non
// dipende dal caso. Due forme di createdAt esistono davvero nella collezione:
// timestamp (quasi tutti i writer) e stringa ISO (payments/recover-checkouts)
// — Firestore confronta per TIPO, quindi servono due letture di intervallo.
// Nessun indice composito: filtro di intervallo e orderBy sullo STESSO campo
// usano l'indice a campo singolo, che Firestore crea da sé.

import { fsList } from '../homie/_lib.js';

const DAY = 86400000;

export const tsOf = (v) => {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'object' && typeof v._seconds === 'number') return v._seconds * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
};

/**
 * Lead con status 'new': unione di (a) la finestra degli ultimi `days`
 * giorni per createdAt, più recenti prima, e (b) la lettura storica per
 * status. Dedup per id; ordine: più recenti prima (senza data in coda).
 * Lancia solo se TUTTE le letture falliscono (chi chiama decide cosa fare).
 */
export async function pendingNewLeads({ days = 7, limit = 200, legacyLimit = 50, now = Date.now(), list = fsList } = {}) {
  const since = new Date(now - days * DAY);
  const recent = (value) => list('leads', {
    filter: { field: 'createdAt', op: 'GREATER_THAN_OR_EQUAL', value },
    orderBy: { field: 'createdAt', direction: 'DESCENDING' },
    limit,
  });
  const settled = await Promise.allSettled([
    recent(since),
    recent(since.toISOString()),
    list('leads', { filter: { field: 'status', op: 'EQUAL', value: 'new' }, limit: legacyLimit }),
  ]);
  if (settled.every((r) => r.status === 'rejected')) throw settled[0].reason;
  const byId = new Map();
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    for (const l of r.value || []) if (l && l.id && !byId.has(l.id)) byId.set(l.id, l);
  }
  return [...byId.values()]
    .filter((l) => l.status === 'new')
    .sort((a, b) => tsOf(b.createdAt) - tsOf(a.createdAt));
}
