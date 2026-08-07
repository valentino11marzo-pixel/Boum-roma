// tests/pfs/health.mjs — quando parlare, e soprattutto quando TACERE.
//
// Il caso reale che ha prodotto questo file: la fonte "market" del radar PFS
// ha accumulato 1145 run falliti di fila, con un allarme Telegram ogni 6 ore
// per circa tre settimane — ~96 messaggi identici per una condizione che NON
// PUÒ risolversi da sola (i portali rifiutano gli IP dei datacenter: è
// documentato in api/pfs/_fetch.js, non è un guasto passeggero).
//
// Il danno non è il rumore. È che un promemoria non azionabile ABITUA
// l'operatore a scartare gli allarmi del radar — e il giorno in cui muore
// `scan-inbox`, che è la fonte PORTANTE, quell'allarme verrà scartato con gli
// altri. Un sistema di monitoraggio che grida sempre è un sistema spento.
//
// Esegui: node tests/pfs/health.mjs

import { alertDecision, ALERT_STEPS_MS } from '../../api/pfs/_health.js';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(cond ? `PASS ${name}` : `FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!cond) fails++;
};

const H = 3600 * 1000;
const T0 = Date.parse('2026-08-01T10:00:00Z');

// ── 1. una fonte bloccata parla UNA volta sola ─────────────────────────────
{
  let state = null;   // prima esecuzione
  const say = [];
  // 200 run consecutivi con i portali che rifiutano: è il caso reale
  for (let i = 0; i < 200; i++) {
    const d = alertDecision(state, { ok: false, blocked: true }, T0 + i * 30 * 60 * 1000);
    if (d.kind) say.push({ run: i, kind: d.kind });
    state = { ...state, blocked: d.blocked, consecutiveErrors: d.consecutiveErrors, alertCount: d.alertCount,
              lastAlertAt: d.kind ? new Date(T0 + i * 30 * 60 * 1000).toISOString() : (state && state.lastAlertAt) };
  }
  ok('200 run bloccati → UN messaggio solo', say.length === 1, say);
  ok('…ed è il messaggio "bloccata", non "ferma"', say[0] && say[0].kind === 'blocked', say[0]);
  ok('…detto al primo run, non dopo tre settimane', say[0] && say[0].run === 0, say[0]);
  ok('lo stato resta marcato bloccato', state.blocked === true);
  ok('non finge fallimenti che non ci sono', state.consecutiveErrors === 0, state.consecutiveErrors);
}

// ── 2. un guasto VERO parla, ma si dirada ──────────────────────────────────
// Un errore potrebbe risolversi (IMAP giù, credenziali scadute): va ricordato.
// Ma non 96 volte: 6h → 24h → 72h → una settimana.
{
  let state = null;
  const spoke = [];
  // un run ogni 15 minuti per 40 giorni
  for (let i = 0; i < 40 * 96; i++) {
    const now = T0 + i * 15 * 60 * 1000;
    const d = alertDecision(state, { ok: false, error: 'imap_auth_failed' }, now);
    if (d.kind === 'error') spoke.push(now);
    state = { blocked: d.blocked, consecutiveErrors: d.consecutiveErrors, alertCount: d.alertCount,
              lastAlertAt: d.kind ? new Date(now).toISOString() : (state && state.lastAlertAt) };
  }
  ok('un guasto vero viene detto', spoke.length >= 1);
  ok('…ma in 40 giorni non 96 volte', spoke.length <= 8, spoke.length);
  const gaps = spoke.slice(1).map((t, i) => Math.round((t - spoke[i]) / H));
  ok('…e gli intervalli crescono', gaps.every((g, i) => i === 0 || g >= gaps[i - 1]), gaps);
  ok('…fino al tetto settimanale', gaps[gaps.length - 1] >= 168 - 1, gaps);
  console.log(`     ↳ 40 giorni di guasto = ${spoke.length} promemoria, a ${gaps.join('h, ')}h di distanza`);
}

// ── 3. i primi due fallimenti non svegliano nessuno ────────────────────────
// Un 500 isolato o un timeout non sono un guasto: capitano.
{
  let state = null;
  const d1 = alertDecision(state, { ok: false, error: 'timeout' }, T0);
  state = { consecutiveErrors: d1.consecutiveErrors, alertCount: d1.alertCount };
  const d2 = alertDecision(state, { ok: false, error: 'timeout' }, T0 + H);
  state = { consecutiveErrors: d2.consecutiveErrors, alertCount: d2.alertCount };
  const d3 = alertDecision(state, { ok: false, error: 'timeout' }, T0 + 2 * H);
  ok('primo fallimento → silenzio', d1.kind === null);
  ok('secondo → silenzio', d2.kind === null);
  ok('terzo → parla', d3.kind === 'error', d3);
}

// ── 4. il ritorno si sente sempre ──────────────────────────────────────────
{
  const fromBlocked = alertDecision({ blocked: true, alertCount: 1 }, { ok: true }, T0);
  ok('bloccata che torna → recovery', fromBlocked.kind === 'recovery', fromBlocked);
  ok('…e lo stato si pulisce', fromBlocked.blocked === false && fromBlocked.consecutiveErrors === 0);
  ok('…e il contatore riparte', fromBlocked.alertCount === 0);

  const fromError = alertDecision({ consecutiveErrors: 9, alertCount: 3 }, { ok: true }, T0);
  ok('guasta che torna → recovery', fromError.kind === 'recovery');

  const neverBroken = alertDecision({ consecutiveErrors: 1 }, { ok: true }, T0);
  ok('un singolo intoppo rientrato non merita un messaggio', neverBroken.kind === null, neverBroken);

  const healthy = alertDecision(null, { ok: true }, T0);
  ok('una fonte sana non dice niente', healthy.kind === null);
}

// ── 5. i passaggi di stato che contano ─────────────────────────────────────
{
  // funzionava, poi il portale inizia a rifiutare → va detto una volta
  const toBlocked = alertDecision({ blocked: false, consecutiveErrors: 0, alertCount: 0 }, { ok: false, blocked: true }, T0);
  ok('sana → bloccata: si dice', toBlocked.kind === 'blocked');

  // era un guasto, si scopre che è un blocco strutturale → si ridice una volta
  const errToBlocked = alertDecision({ blocked: false, consecutiveErrors: 12, alertCount: 2 }, { ok: false, blocked: true }, T0 + 100 * H);
  ok('guasta → bloccata: si ridice (è un\'altra notizia)', errToBlocked.kind === 'blocked', errToBlocked);

  // bloccata che diventa un errore diverso: torna a contare come guasto
  const blockedToErr = alertDecision({ blocked: true, consecutiveErrors: 0, alertCount: 1 }, { ok: false, error: 'boom' }, T0 + 200 * H);
  ok('bloccata → guasto diverso: riparte il conteggio', blockedToErr.blocked === false && blockedToErr.consecutiveErrors === 1, blockedToErr);
}

// ── 6. la scala è dichiarata, non improvvisata ─────────────────────────────
{
  ok('scala crescente', ALERT_STEPS_MS.every((v, i) => i === 0 || v > ALERT_STEPS_MS[i - 1]), ALERT_STEPS_MS);
  ok('parte da 6h', ALERT_STEPS_MS[0] === 6 * H);
  ok('si ferma a una settimana', ALERT_STEPS_MS[ALERT_STEPS_MS.length - 1] === 168 * H);
}

console.log(fails ? `\n${fails} FALLITI` : '\nTutto verde.');
process.exit(fails ? 1 : 0);
