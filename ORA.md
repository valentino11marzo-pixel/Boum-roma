# ORA — cosa si fa adesso

Aggiornato lunedì 12 ottobre 2026. Lo cambia Valentino, oppure Claude su sua
richiesta esplicita, nella stessa PR in cui un obiettivo si chiude o si apre.

Questo file comanda su tutto il resto: `CLAUDE.md`, `AGENTS.md`, studi e
prompt. Se una richiesta non è qui, chi lavora — Claude o Codex — si ferma e
chiede cosa esce per farle spazio.

## Ruoli

- **Costruisce: Claude**, una sessione alla volta.
- **Rivede: Codex.** Legge le PR che toccano soldi, contratti e firma e
  scrive le obiezioni. Non apre PR di funzionalità finché questo file non gli
  assegna un lavoro.
- **Decide e unisce: Valentino**, solo con la CI verde.

## Obiettivi fino a domenica 8 novembre (al massimo tre)

1. **Chiudere il lavoro aperto.** Da 77 rami e 12 PR a 2 rami aperti, secondo
   `docs/TRIAGE_2026-10-12.md`. Prima le correzioni già scritte per i
   difetti ancora vivi (§1 del triage: extra non addebitati alla ripresa del
   pagamento, riferimento di legge sbagliato sulle proposte studenti, doppia
   fattura ASPI, `/canone` sopra il massimo attestabile, `legalName` falso),
   una PR alla volta. Poi si uniscono solo: il Palazzo di Viale Provenzino
   (la parte che la proprietaria usa adesso), `/campo` per la collaboratrice
   e il registro dei rendiconti (PR #279). Tutto il resto diventa
   un'etichetta d'archivio: non si perde niente.
   *Fatto quando: al massimo 2 rami aperti.*
2. **Il numero del lunedì.** Ogni lunedì, con `/lunedi`: proposte pagate,
   fatture incassate, flusso Stripe (dichiarato come flusso: contiene soldi
   dei proprietari), lavoro aperto, guasti in produzione.
   *Fatto quando: quattro lunedì di fila, senza saltarne uno.*
3. **Il Palazzo come primo cliente di gestione.** Consegnare alla
   proprietaria ciò che le serve questo mese — incasso delle rate,
   registrazione, rendiconto — e niente di più.
   *Fatto quando: le rate di novembre del Palazzo sono incassate dal sistema.*

## Sempre ammesso

- Un guasto in produzione sul binario dei soldi: contatto, visita, proposta,
  contratto, firma, registrazione, incasso.
- Ciò che blocca un cliente pagante.

## In coda (entra solo quando un obiettivo si chiude)

1. Registrazione diretta dei contratti all'Agenzia delle Entrate: prima il
   percorso burocratico (abilitazione, costi, chi firma), poi il codice.
2. Catalogo onesto e dati pubblici ridotti (bozza Codex, PR #278): serve una
   prova sul telefono con le schede vere.
3. Riconciliazione delle fatture Zucchetti, Stripe e Sella (bozza Codex,
   PR #274): quando il numero del lunedì deve diventare fatturato al centesimo.
4. Avvio del PFS dopo il pagamento (bozza Codex, PR #275).

## Da decidere entro lunedì 19 ottobre

- **Segreteria e Oggi.** A fine settembre la preparazione automatica costava
  10–17 dollari al giorno di Opus. Se approvi le sue proposte ogni giorno,
  resta accesa; altrimenti si spegne da Oggi → «Sospendi».
- **«500+ happy tenants»** è su `about.html` e su una decina di pagine. Se è
  un dato vero, resta; se non si può provare, esce con le correzioni d'onestà.

## Non si fa fino al 10 gennaio 2027

- Redesign e nuovi linguaggi visivi: Scalo, Egidi in WebGL, home, Executive.
- Nuovi mercati e nuove pagine di servizio: La Réunion, Executive, servizi nuovi.
- Sviluppo di Radar, Perito, Meteo, Vedette, Centralino, Centrale AI, modelli
  locali sul Mac, Behavior Intelligence: restano come sono.
- Nuovi «dipendenti» AI, nuove integrazioni, nuovi connettori, nuovi cron.
- Studi, audit e sessioni di strategia: la strategia c'è già
  (`docs/audit-2026-08.md`) e va eseguita.
- Codice «per quando servirà».

## La domanda d'ingresso

Per qualunque cosa nuova: quale proposta pagata, o quale ora di Valentino,
libera nei prossimi 30 giorni? E chi la usa questa settimana? Senza una
risposta va in coda, non nel codice.

## Regole di lavoro

- Al massimo 2 rami aperti in tutto il repo; un ramo tocca un'area sola.
- Una sessione = un obiettivo = una PR piccola.
- Mai unire una PR prima che la CI sia verde.
