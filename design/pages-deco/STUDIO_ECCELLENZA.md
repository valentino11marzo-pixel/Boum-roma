# Studio dell'eccellenza — la rifinitura e cosa costruire dopo

Riferimento per la Console (property-finding) e **modello da riusare
sulle altre pagine servizio** (virtual-viewing, deal-assistance,
concierge, contract-check-express, deposit-recovery, remote-move-pack).

## Parte 1 — La rifinitura fatta (misurata, non dichiarata)

| Difetto misurato | Correzione | Verifica |
|---|---|---|
| 11 misure di corpo fisse nei componenti nuovi | scala a 4 gradini (9 · 11 · 12,5 · 14,5) + 5 display fluidi | 9 misure totali nei miei componenti |
| chip prova 34px, link risposta 34px, apri-tutto 28px | ≥44px sotto i 620px, righe console ≥56px | 44 · 44 · 40px |
| nessun anello di fuoco coerente | `:focus-visible` unico (oro, offset 3px) su link, bottoni, summary, campi | tastiera |
| cifre che ballano al cambio (orologio, contatore) | `tabular-nums` su tutte le cifre d'oro | orologio a 1 Hz |
| selezione testo di sistema | `::selection` oro al 28% | — |
| barra di scorrimento di sistema | filo d'oro sottile, WebKit + Firefox | — |
| `prefers-contrast: more` ignorato | testi e fili si alzano davvero | media query |
| `forced-colors` (Windows alto contrasto) | i pannelli prendono un bordo vero, i segmenti usano Highlight | media query |
| parole lunghe che sfondano a 320px | `overflow-wrap:anywhere` sui titoli | 0 sfori |
| la barra fissa copriva l'ultima riga | `padding-bottom` al piede sotto i 900px | — |
| punto «letta» + spunta si accavallavano | colonna 50px, `nowrap`, il punto sparisce quando è aperta | occhio |
| tempi/curve d'animazione ad hoc | token `--e`, `--e-soft`, `--d1..3` | — |

## Parte 2 — Gli strumenti aggiunti (perché alzano davvero la percezione)

1. **Link profondo per risposta** (`/property-finding#q4`) — apre quella
   domanda e ci scorre. Serve a te: nella risposta WhatsApp allo scettico
   mandi la RISPOSTA, non la pagina.
2. **Copia il link a questa risposta** — chip dentro ogni risposta, con
   le tre reti di Safari (clipboard → execCommand → prompt).
3. **Tastiera**: `1`–`8` aprono, `esc` chiude tutto, mai dentro un campo.
   Il suggerimento compare solo dove una tastiera esiste davvero.
4. **Apri/chiudi tutto** — per chi vuole leggere il documento intero.
5. **Memoria della lettura** (localStorage, avvolto in try/catch — Safari
   privato LANCIA): le domande già lette restano marcate, ma **non si
   riaprono da sole**: la pagina resta corta.
6. **Prefetch al passaggio del dito** sulle prove interne (app demo,
   /try): il tap è istantaneo.
7. **Misure**: `pfs_q_open` (quale obiezione pesa), `pfs_q_share`,
   `pfs_hud_click`. Dopo il live sai QUALE dubbio blocca le vendite.

## Parte 3 — Cosa costruire dopo (in ordine di resa)

1. **La foto e i clienti citabili.** Lo slot `#vFoto` è ancora una «V».
   2–3 clienti con nome, nazionalità, zona e una frase. È la cosa che
   manca di più e non si può inventare.
2. **La rete d'uscita** — dopo l'ultima risposta, la chiamata gratuita di
   15 minuti (il closer misurato: 11 volte fra i messaggi ripetuti). Non
   in cima: in fondo, dove intercetta chi se ne stava andando.
3. **Il consolato delle prove** — una pagina `/prove` che raccoglie tutti
   i reperti (clausole, regole, verifica, demo) e che ogni servizio possa
   linkare: si scrive una volta, serve sette pagine.
4. **Il modello Console per gli altri servizi**: stessa griglia (biglietto
   → lastra del patto → console delle obiezioni → chiusura), obiezioni
   diverse. Virtual Viewing: «perché non ci va un amico?»; Deal
   Assistance: «il contratto me lo legge il commercialista»; Deposit
   Recovery: «tanto il deposito è perso».
5. **Il generatore di pagine servizio** — un builder unico (come questo)
   che prende un dizionario di obiezioni+prove e produce la pagina: le
   sette pagine restano coerenti per costruzione, non per disciplina.
6. **Il test di regressione visiva** — screenshot di riferimento a 390 e
   1440 confrontati a ogni build: oggi il difetto lo trovo guardando.
7. **La pagella della pagina** — un check automatico (target ≥44px,
   scala tipografica, contrasti, sfori orizzontali, ordine FAQ↔JSON-LD)
   eseguibile su tutte le pagine servizio.

## Le regole dure (valgono per ogni pagina servizio)

- Ogni cifra in pagina esiste già nel repo o nei terms. Mai inventata.
- Il movimento è informazione: se non dice nulla, non si muove.
- Senza JS la pagina è intera; con `reduced-motion` è ferma ma completa.
- Il testo delle FAQ strutturate deve esistere come `<summary>` VISIBILE.
- Nessun target sotto 44px sotto i 620px di viewport.
- Il logo non si tocca.
