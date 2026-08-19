# STUDIO PROTOCOLLI — BOOM gestita come un'azienda globale (2026-08-19)

Richiesta del fondatore: *«rifai un'analisi come un'azienda globale di
successo e proponi che protocolli o iter dovrebbe avere in più o
modificare»*.

Lente diversa dall'Arsenale (che giudicava tool e sezioni): qui si
giudicano gli **iter** — le procedure ripetibili con innesco, passi,
responsabile, SLA, prova d'esecuzione. Un'azienda globale non è fatta di
feature: è fatta di protocolli che reggono anche quando nessuno ci pensa.

Il vincolo di BOOM, che è anche il suo vantaggio: ogni protocollo deve
essere eseguibile da **la macchina + un solo umano**. Se richiede un
reparto, è scritto male.

---

## 0 · L'onestà prima: dove BOOM è GIÀ sopra lo standard

Va detto senza falsa modestia, perché i protocolli nuovi si innestano su
questi: dunning a scala con diffida legale · countdown visite T-24/3/30′
· journey inquilino con gate firme · watchdog firme con re-invito ·
riconciliazione bancaria multi-via · heartbeat su ogni cron con allerta
che si dirada (blocked ≠ error) · backup giornaliero cifrato fuori
piattaforma · conservazione legale mensile via email · CI con 65 suite ·
organigramma degli agenti con lettere di autonomia e anti-deriva in CI ·
kill switch su ogni automazione che spende. **La maggior parte delle PMI
immobiliari non ha nulla di tutto questo.** I buchi sotto sono buchi da
azienda vera, non da principiante.

---

## 1 · IL CICLO DELLA CASA — i tre protocolli mancanti più gravi

### P1. Il check-OUT (verbale di riconsegna + saldo deposito) — IL BUCO №1
Esiste il verbale di CONSEGNA (`/verbale`, firmato sullo schermo, PDF alle
parti, letture contatori). **Il gemello d'uscita non esiste** — e è il
momento a più alto rischio legale e reputazionale del ciclo: trattenute
contestate, deposito restituito in ritardo, foto che non ci sono quando
servono.
**Iter proposto** (specchio del verbale esistente, stessa pagina, modo
`uscita`): T-14 dalla fine → task Regista "programma riconsegna" · il
giorno: letture contatori + foto per stanza + danni oltre il normale
deperimento (con riferimento al verbale d'INGRESSO, che è la prova) +
firme → PDF alle parti · **T+X giorni: lettera di saldo deposito**
(restituzione integrale o trattenute documentate voce per voce) con
scadenza dichiarata e bonifico tracciato in `payments`
(`type:'deposit-return'`). Il journey ha già lo slot (email di uscita).

### P2. Gli interessi sul deposito (obbligo, non scelta)
Il contratto studenti (Allegato C art. 4) prevede **interessi legali
annuali sul deposito** — e la pagina tenant lo PROMETTE già ("returned
with interest"). Nessun punto del sistema li calcola. Con l'interesse
legale attuale è poco denaro, ma è un obbligo contrattuale scritto da noi:
un inquilino attento lo può esigere, un giudice lo dà per scontato.
**Iter**: al check-out (P1) il saldo deposito calcola gli interessi
maturati per anno al tasso legale vigente (tabella nel fiscal-engine);
sulla riconsegna compaiono come voce.

### P3. Mandato → vetrina in 7 giorni (l'onboarding proprietario come SLA)
L'onboarding inquilino è una macchina (journey). Quello del PROPRIETARIO
non è un iter: è una serie di gesti sparsi (foto, manuale, dossier ARPE,
listing, pubblicista). Un'azienda globale lo vende come **promessa con
scadenza**: *"dalla firma del mandato alla casa online in 7 giorni"*.
**Iter**: checklist a 8 passi con giorno-bersaglio (chiavi+verbale ·
shooting/media studio · manuale casa · dossier ARPE slot · scheda canone ·
listing+pagella ≥8 · pubblicista queue · prezzo validato dal Valutatore),
generata come task del Regista alla creazione del mandato, con la data
promessa in vista. È anche l'argomento di vendita della Proposta al
Proprietario (Arsenale, tool B).

---

## 2 · SOLDI — chiudere il fondo del funnel

### P4. L'end-game degli arretrati
La scala esiste fino alla diffida (art. 1590, 15 giorni). Poi il nulla
formale. **Iter**: diffida scaduta → decisione tracciata a 3 vie (piano di
rientro scritto · passaggio legale con data · accantonamento a perdita con
motivo e firma). Una rata può stare "in ritardo" per sempre solo se
nessuno deve mai deciderne il destino; il quadro OGGI la porta in coda
finché la decisione non è presa.

### P5. La chiusura mensile con checklist e firma
Il Contabile manda il recap il 1° del mese; il rendiconto parte da solo.
Manca il **rito di chiusura**: banca riconciliata al 100% (o eccezioni
nominate) · sospesi Stripe = 0 · fee misurate riviste vs buffer · arretrati
classificati (P4) · rendiconti spediti. Dieci minuti, una checklist, un
"chiuso da Valentino il …" persistito. La differenza tra "il sistema manda
email" e "i libri sono chiusi".

### P6. Revisione trimestrale delle manopole dei prezzi
`rentFee` si misura da sola, `SDD_FEE_BUFFER` ha un default, il canone
concordato ha la calibrazione pArr/pDur. **Iter**: ogni trimestre un task
del Regista "rivedi le manopole" con i numeri già pronti (costo medio
carta reale vs fee, costo SDD vs buffer, quante proposte fuori fascia).
Le manopole esistono (La Direzione); manca la cadenza che le guarda.

---

## 3 · ESPERIENZA CLIENTE — dagli automatismi agli standard

### P7. SLA di risposta dichiarato e misurato
La Miniera ha già provato che la latenza di prima risposta muove la
conversione. Renderlo protocollo: **target dichiarato** (es. prima
risposta < 30′ in orario 9-21) · misura continua (i dati ci sono) ·
breach in coda OGGI quando il target salta. Non serve rispondere più in
fretta di così: serve SAPERE quando non è successo.

### P8. SLA manutenzione + registro fornitori
Le manutenzioni hanno priorità ma **nessun impegno di tempo** e — buco
verificato — **zero registro fornitori** (0 occorrenze nel portale): il
numero dell'idraulico vive nel telefono. Iter: matrice
urgente<24h/alta<72h/normale<7g con escalation in OGGI; collection
`vendors` (mestiere, zona, telefono, tariffa, voto post-intervento) e il
bottone "chiama il fornitore" sulla riga guasto. Con un CSAT a 1 tap
post-risoluzione (il pattern post-visita esiste già).

### P9. Il protocollo dell'emergenza fuori orario
Il manuale casa ha la sezione emergenze per immobile. Manca la promessa
di COPERTURA: cosa è emergenza (acqua, gas, serratura), chi risponde
alle 2 di notte (fornitore reperibile del registro P8), cosa NON è coperto.
Una pagina, scritta una volta, linkata nel manuale e nel welcome.

---

## 4 · GOVERNANCE, RISCHIO, CONTINUITÀ

### P10. Il restore drill (un backup mai provato non è un backup)
Trimestrale: ripristina il gzip più recente in un progetto Firebase varo,
conta i documenti per collection vs manifest, apri 3 record a caso, firma
l'esito. L'audit lo dice da giorni; un'azienda globale lo mette a
calendario, non nelle intenzioni.

### P11. Ambiente di prova separato (la preview non tocca i clienti)
Oggi ogni preview Vercel parla col **Firebase di produzione** — ogni demo
è a un click da un dato vero. Iter: secondo progetto Firebase per le
preview (config da env), seed sintetico (l'Innesto sa già generare
proposte). È il protocollo più costoso di questa lista e quello che ogni
azienda vera considera non negoziabile.

### P12. Release discipline: CI bloccante + rules deploy
La CI oggi è consultiva (Vercel deploya comunque) e `deploy-rules` salta
senza `FIREBASE_TOKEN` (ancora mancante). Iter: branch protection su main
con `full-suite` requisito + il secret configurato. Mezz'ora di setup,
chiude per sempre la classe "il repo è avanti, la produzione no".

### P13. Rotazione segreti + revisione accessi, a calendario
`HOMIE_SECRET` è la radice di tutti i token derivati (ruotarlo revoca
tutto — by design). Iter semestrale: ruota → aggiorna i 4 posti (Vercel,
Mac bots) → verifica heartbeat verdi. E ogni trimestre: chi ha ruolo
admin? (query da un minuto, in checklist P5).

### P14. GDPR: ritenzione e oblio come procedura
La Bonifica è un ottimo strumento MANUALE. Iter dichiarato: lead morti
anonimizzati dopo N mesi (semi-assistito: la Bonifica propone, l'operatore
conferma — mai cancellazione automatica), registro trattamenti aggiornato
quando nasce una collection nuova, e la risposta a una richiesta di
cancellazione scritta come runbook (dove vive la persona: leads, users,
minieraThreads, storage).

### P15. La scala della fiducia degli agenti, a cadenza
L'organigramma dichiara l'autonomia; la Miniera misura le approvazioni.
**Iter trimestrale**: per Gestore e Commerciale, % proposte approvate
senza modifica → sopra soglia per 2 trimestri = promozione di UNA tacca
(es. follow-up templati senza approvazione), sotto = retrocessione. La
macchina cresce di grado come un dipendente vero, coi numeri.

---

## 5 · PROTOCOLLI DI SVILUPPO (il costo delle chat parallele)

### P16. Il contratto della collection nuova
Lezione pagata più volte (propertyLocks, portalPubs): una collection
nuova entra SOLO con — riga nelle rules · owner dichiarato
nell'organigramma se un cron la scrive · heartbeat se autonoma · voce in
CLAUDE.md. Checklist di 4 righe in CLAUDE.md, verificabile dal test
anti-deriva esistente.

### P17. Definition of done
Già praticata in questa sessione, mai scritta: motore puro se c'è
giudizio · test che si rompe se la promessa si rompe · kill switch se
tocca clienti · CLAUDE.md aggiornato · screenshot se cambia l'occhio.
Cinque righe in CLAUDE.md, così anche le chat parallele la ereditano.

---

## 6 · Priorità (impatto × urgenza, non completezza)

| # | Protocollo | Perché primo |
|---|---|---|
| 1 | **P1+P2 Check-out + interessi deposito** | Rischio legale attivo su ogni contratto che finisce; il gemello d'ingresso esiste già |
| 2 | **P12 CI bloccante + FIREBASE_TOKEN** | Mezz'ora, chiude la classe di guasto più citata degli audit |
| 3 | **P10 Restore drill** | Finché non gira una volta, il backup è una speranza |
| 4 | **P8 SLA manutenzione + fornitori** | L'unico pezzo di CX senza standard; il registro serve anche a P9 |
| 5 | **P3 Mandato→vetrina 7 giorni** | Trasforma l'onboarding in argomento di vendita (si sposa con l'Arsenale B) |
| 6 | **P4+P5 End-game arretrati + chiusura mensile** | I soldi si chiudono, non si osservano |
| 7 | **P7 SLA risposta dichiarato** | La misura c'è già: manca solo il target e l'allarme |
| 8 | **P11 Ambiente di prova** | Il più costoso; da fare prima di far entrare un secondo umano |
| 9 | P13-P15, P16-P17 | Cadenze e igiene: si scrivono in un'ora, rendono per anni |

La riga finale: BOOM ha già i protocolli che le aziende normali non hanno
(automazione, osservabilità, firma). Le mancano quelli che le aziende
GLOBALI hanno e le startup dimenticano: **la fine dei cicli** (check-out,
end-game arretrati, chiusura mensile), **le prove periodiche** (restore,
rotazioni, revisioni) e **le promesse dichiarate** (SLA). Sono tutti iter
da macchina+1: nessuno richiede di assumere.
