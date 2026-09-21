# Prompt d'apertura per Codex — Lotto 3 «le rotaie della Segreteria in Oggi»

*Da incollare in una chat di Codex aperta sul repo
`valentino11marzo-pixel/Boum-roma`, DOPO che il Lotto 1 (la PR della catena
`codex/admin-mobile-20260920` verso `main`) è unita. Prerequisito: leggere
`AGENTS.md`, poi `STUDIO_OGGI_SEGRETERIA_2026-09.md` per intero — sono i
fatti misurati in produzione il 21/09 e le decisioni D1–D7.*

---

Lavori nel repo BOOM Roma. Il tuo perimetro è il **Lotto 3** dello studio
`STUDIO_OGGI_SEGRETERIA_2026-09.md` §4: `api/segretaria/*`,
`api/telegram/webhook.js` (solo il comando `/segretaria`), il blocco
«SEGRETERIA · SEGUITI IN OGGI» di `js/portal-app.js`, i test in
`tests/segretaria/`. Non toccare `api/homie/_lib.js`, `api/portal/ingest.js`,
`.github/workflows/*`: sono il Lotto 2 (Claude), in lavorazione su un altro
ramo. Crea il ramo `codex/segreteria-rotaie`.

## Compito

**1. Lo stato del canale sopra ogni bozza WhatsApp (D2).** Il pannello legge
`heartbeat/wa-outbox` (lo scrive già `api/homie/wa-outbox.js` a ogni pull) e
mostra, sopra ogni proposta con `draft.channel === 'whatsapp'` e nel passo
«Invio WhatsApp» del piano, una riga vera: «Mac: ultimo ritiro N min fa» se
l'ultimo pull è entro 10 minuti; altrimenti «**Mac non ritira da N ore: la
bozza non partirà**». Il dato viaggia dentro `monitoring` della GET
`/api/segretaria/follow-up` (una lettura in più, mai una collection nuova).
Con il Mac fermo il bottone «Esegui piano» resta attivo — la conferma è
dell'operatore — ma la riga rossa sta sopra il bottone, non sotto.

**2. L'interruttore della preparazione (D3).** `settings/segretaria.prepareCases`
oggi si accende solo a mano su Firestore. Aggiungi: in `/segretaria` su
Telegram un tasto inline «▶ Prepara i casi» / «⏸ Ferma la preparazione»
(callback ≤ 64 byte, come `sgk`), e nel pannello lo stesso interruttore nella
testata. All'accensione scrivi `prepareSince = adesso` (ISO con timezone) SOLO
se manca: mai retroattivo, un arretrato non parte da solo. Il monitor
(`_monitor.js`) e la riga di stato del pannello dicono «Preparazione SPENTA
dal <data>» quando è spenta — mai «Ultimo ciclo: …» su un battito fermo.
Il worker, quando è spento, scrive comunque UNA volta al giorno
`heartbeat/segretaria-preparer` con `enabled:false` e la data, così il
pannello non deve indovinare.

**3. Test.** Per mutazione, nelle suite esistenti (`tests/segretaria/monitor.mjs`,
`realtime-ui.mjs`, `run.mjs`): Mac fermo → la riga rossa c'è e il piano
mostra «Da verificare» già PRIMA della conferma; interruttore spento → il
pannello dice SPENTA e non «Ultimo ciclo»; accensione → `prepareSince` scritto
una volta sola; un secondo tap non lo sposta. `npm test -- segretaria
segretariamonitor segretarialiveui` verde.

**4. Documentazione.** Nella sezione «LA SEGRETARIA» di `CLAUDE.md`, 4–8
righe nello stile del file: cos'era (opt-in nascosto, coda muta), cosa
cambia, dove sta il test.

## Domande da chiudere nella PR (non indovinando)

- Perché `_postino.js` esclude le proposte della Segreteria dalla card 📮? Se
  la ragione è «claim già avvenuta», dillo nella PR e lascia l'esclusione; se
  no, rimetti la card.
- L'indice `messages` (conversationId, at DESC) esiste in produzione? Quante
  proposte attuali sono `needs_context` per `latest_history_not_verified`?

## Regole dure

Firestore solo via `api/homie/_lib.js`; nessuna collection nuova; nessuna
dipendenza; nessun URL sull'apex (`www`); nei log mai il contenuto delle
conversazioni. Non modificare né saltare test esistenti.

## Fatto quando

PR verso `main` dal ramo `codex/segreteria-rotaie`, diff limitato ai file del
Lotto 3, descrizione con cosa/perché, l'output delle suite, e le due domande
sopra con la loro risposta.
