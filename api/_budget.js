// api/_budget.js — IL TEMPO CHE RESTA, E COSA CI STA DENTRO.
//
// LA LEZIONE DEL 31 AGOSTO 2026, letta nei log di produzione. I quattro
// scanner (leads, pfs, segretaria, commerciale) venivano uccisi dalla
// piattaforma a 60s — ancora 3 volte nelle ultime 24h — benché avessero TUTTI
// una scadenza morbida a 48s. La scadenza c'era e non teneva, perché faceva
// la domanda sbagliata:
//
//     if (Date.now() > softDeadline) break;      // «sono oltre il traguardo?»
//     const msg = await client.fetchOne(...);    // fino a 25s (socketTimeout)
//     const lead = await extractWithAI(...);     // una chiamata al modello
//
// Il controllo passa a 47,9s e poi si avvia un giro che può costarne 45: la
// funzione muore a 60 nel mezzo. La domanda giusta non è «sono in ritardo?»
// ma «CE LA FACCIO a pagare il prossimo passo?».
//
// Da cui `afford(costo)`: si dichiara quanto può costare al MASSIMO
// l'operazione che sta per iniziare, e la si inizia solo se il tempo residuo
// la copre. Un giro in meno è gratis — memoria e dedupe rendono il prossimo
// run un no-op sulle email già viste — mentre un kill a metà lavoro non
// scrive il battito, e un cron che muore in silenzio è cieco per definizione.
//
// `reserve` è la coda che deve avvenire COMUNQUE dopo il ciclo: battito,
// memoria dei messaggi visti, recap Telegram. Non è tempo disponibile: è
// tempo già speso.

/**
 * @param {number} totalMs  il limite VERO della funzione (maxDuration in vercel.json)
 * @param {number} reserveMs quanto serve dopo il ciclo (battito, memoria, recap)
 */
export function runBudget(totalMs = 60_000, reserveMs = 6_000) {
    const t0 = Date.now();
    const end = t0 + Math.max(0, totalMs - reserveMs);
    return {
        started: t0,
        spent: () => Date.now() - t0,
        left: () => Math.max(0, end - Date.now()),
        /** C'è tempo per un'operazione che può costare `costMs`? */
        afford: (costMs) => (Date.now() + Math.max(0, costMs || 0)) <= end,
        /** Il tetto da dare a UNA chiamata perché stia comunque dentro. */
        capFor: (wantMs) => Math.max(0, Math.min(wantMs, end - Date.now())),
    };
}

// Il tetto di tempo su una chiamata al modello, in una copia sola.
// Ventuno file chiamavano api.anthropic.com SENZA alcun tetto: una richiesta
// appesa non falliva: teneva la funzione occupata finché la piattaforma non la
// uccideva — errore di piattaforma, nessun battito, nessuna spiegazione. Con
// il tetto lo stallo diventa un errore NORMALE, che ogni chiamante già sa
// gestire (ripiego, ai_failed, riprova al giro dopo).
// `AbortSignal.timeout` si usa solo dove esiste (stessa cautela di
// photos/enhance): un runtime che non lo conosce non deve far fallire TUTTE
// le chiamate invece di nessuna.
export function aiSignal(ms) {
    return (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function')
        ? AbortSignal.timeout(ms)
        : undefined;
}
