# STUDIO — L'ORGANICO · agosto 2026
### Formato: decisioni, non opzioni. La domanda dell'operatore è dentro.

*Agosto 2026. Domanda dell'operatore: "il lavoro sta diventando tanto — è
segnato che lavoro 2-3 ore al giorno ma da più di un anno ne faccio 7-8 tra
tutto, WhatsApp comprese le emergenze. Devo assumere un braccio operativo?
Creare una segreteria di livello eccellente che sembri umana come entry e
sales, e io gestire solo le trattative, il controllo e la burocrazia? Ho
paura di abbassare la qualità."*

---

## 0 · Le tre domande dentro la domanda

1. **Le ore segnate non tornano** (2-3 contro 7-8 reali).
2. **Serve assumere?** E chi: un braccio operativo? una segretaria?
3. **Il modello a regime**: entry+sales "che sembra umano", lui su
   trattative + controllo + burocrazia — senza perdere qualità.

Sono tre problemi diversi con tre risposte diverse. Trattarli come uno solo
("assumo qualcuno e si sistema tutto") è il modo di spendere uno stipendio
sul problema sbagliato.

---

## 1 · Le ore: nessuno le sta misurando (e il 2-3 non vive nel sistema)

Nel repo **non esiste** nessun contatore di ore lavorate: il "2-3 ore al
giorno" non è un dato BOOM. Le due letture possibili:

- **Inquadramento formale** (contratto part-time, posizione contributiva):
  se è lì che sta scritto 2-3 ore, è una questione da commercialista /
  consulente del lavoro, non da software — e va allineata alla realtà
  PRIMA di assumere qualcuno (chi assume con il proprio inquadramento
  storto parte col piede sbagliato su tutta la linea).
- **Percezione/strumenti esterni** (Screen Time, app): misurano lo schermo,
  non il lavoro — le visite, le chiamate, le chiavi, le emergenze in loco
  non lasciano traccia digitale.

Quello che il sistema SA misurare, l'ha già misurato, e racconta una cosa
precisa: **il carico vero non è il volume, è la frammentazione.** Su
29.255 messaggi dell'operatore (180 giorni, `scripts/wa-voce-locale.mjs`):
metà sta **sotto i 17 caratteri**, 3 su 4 sotto i 38. Non sono ore di
scrittura: sono **centinaia di interruzioni al giorno**, ognuna con il
costo di cambio-contesto sopra. 7-8 ore così stancano come 12 e rendono
come 4. È questo il numero da attaccare, non "le ore".

**La regola di casa vale anche qui: si misura prima di scegliere** (la
stessa che ha fatto nascere la Miniera). Prima di firmare un'assunzione:
un giro di `op:'study'` della Miniera + il misuratore della domanda danno
il quadro conversazionale; il Regista ha già i viaggi e le visite del
giorno — le ore di CAMPO si leggono da lì, settimana per settimana.

---

## 2 · La mappa del carico: quattro secchi, quattro risposte

| Secchio | Cosa contiene | Si automatizza? | Risposta |
|---|---|---|---|
| **A · Conversazione** | il "durante" delle chat WhatsApp, dopo la prima risposta | In buona parte SÌ | promuovere l'autonomia già disegnata (§4) |
| **B · Campo** | visite in persona, chiavi, inventario, foto, emergenze in loco | **NO, per natura** | l'unica vera assunzione (§5) |
| **C · Decisioni** | approvazioni, conferme visite, coda Oggi | NO, **per scelta** | restano sue: È il controllo che vuole tenere |
| **D · Burocrazia** | registrazioni, fascicoli, fatture, scadenze | GIÀ FATTO | ASPI/Pack/Fascicolo sono a un tap; il residuo è campo |

Il punto che cambia la decisione: **la macchina copre già l'entry e gran
parte del sales** — Centralino, Commerciale, Lead Brain, self-booking
istantaneo, Segugio, richiamo, 30 risposte rapide misurate sulla sua voce.
Dei ~22 agenti del registro, **19 agiscono da soli**; solo Commerciale,
Contatto e Gestore passano dall'approvazione. La coda che gli resta in
mano (secchio C) è fatta di TAP, non di ore.

E la qualità è **già** sotto pressione, non per colpa della delega ma per
la sua assenza: la Miniera ha contato **544 ultime parole di clienti
rimaste senza risposta**. Il collo di bottiglia è l'operatore stesso — la
paura "delego e perdo qualità" va rovesciata: sul secchio A, NON delegare
sta già costando qualità misurabile.

---

## 3 · La "segreteria eccellente che sembri umana": è già costruita all'80%

Quello che l'operatore descrive come cosa da creare esiste come software:

- **Entry telefonica**: la segreteria (via A) è viva; **la Receptionist
  (via B, ElevenLabs)** — bilingue, con catalogo e slot VERI in chiamata,
  consegna alla stessa pipeline — ha il mandato completo scritto
  (`bot/RECEPTIONIST.md`) e il webhook pronto. Se non è ancora attiva,
  l'attivazione è un numero SIP (DIDWW) + l'agente configurato: **giorni,
  non mesi, e nessuno stipendio.**
- **Entry scritta**: leads da portali/email/WhatsApp/telefono entrano da
  soli, il Brain li grada gratis, notify-pending li porta in tasca col
  messaggio già scritto nella lingua giusta.
- **Sales, prima battuta**: il Commerciale propone; l'operatore tocca
  Approva. **Sales, il durante**: le risposte rapide (misurate sulla sua
  voce vera) + il Segugio dei silenzi.
- **Agenda**: prenotazione istantanea con la geometria dei viaggi, il
  double-confirm, il foglio di chiamata alle 07:30.

**Una segretaria umana qui sarebbe un downgrade**: più lenta della
macchina sull'entry, non bilingue h24, e senza i binari testati (una
risposta sbagliata di un dipendente non passa da nessun approvalStats).
Ciò che manca non è una persona: è **girare le manopole di autonomia già
disegnate** — la scala della fiducia dello STUDIO_HOMIE §4: categorie con
≥95% di approvazioni storiche → auto-invio con ritardo di grazia
annullabile, kill switch, digest serale, sempre-escalation su rabbia/
soldi/legale. La promozione si decide sui numeri di `approvalStats()`,
mai a sensazione.

---

## 4 · Il verdetto sull'assunzione

**NO alla segretaria** (è software, vedi §3). **NO al "braccio operativo"
generico** (metà delle sue mansioni le fa già la macchina, e pagarle due
volte è il modo di abbassare i margini senza alzare la qualità).

**SÌ — quando i numeri lo dicono — a un OPERATIVO DI CAMPO**, part-time o
a task: l'unico secchio non automatizzabile.

- **Mansioni**: visite in persona, consegna/ritiro chiavi, il giro
  dell'inventario col telefono (lo strumento è fatto perché lo usi
  chiunque: filma, l'elenco si scrive da solo), foto/video grezzi (il
  Fotografo e il Media Studio rifiniscono; watermark-studio è già
  dichiarato "for interns/team"), presenza alle emergenze/manutenzioni.
- **Cosa NON gli si dà**: trattative, prezzi, promesse ai clienti, accesso
  admin (i ruoli owner/landlord/tenant esistono apposta; al campo basta
  il necessario).
- **Il trigger, misurato non sentito**: dal Regista/agenda, quando il campo
  supera stabilmente **~12-15 ore/settimana** o l'agenda genera conflitti
  ricorrenti (visite rifiutate per sovrapposizione = fatturato rifiutato).
  Sotto quella soglia, prima si spinge il video-first (già first-class:
  la maggioranza dei clienti è all'estero) e le catene stesso-immobile
  (tre clienti, un viaggio — la griglia le offre da sola).
- **Forma**: a task (per visita/per giro chiavi) prima che a stipendio —
  scala con la stagione, si prova senza impegno, e il costo si confronta
  col margine per contratto invece che col budget.

L'ora dell'operatore liberata dal campo va dove rende di più e dove
nessun altro può stare: **trattative, mandati** (il radar mandati già
produce i candidati), **il controllo** (Oggi + /team + le manopole della
Direzione — la pagina per dirigere esiste già), e la crescita (Executive,
La Réunion).

---

## 5 · La sequenza (90 giorni)

1. **Settimana 1 — misurare.** Giro completo della Miniera (`op:'study'`)
   + lettura di `approvalStats`; dal Regista, il conto delle ore di campo
   per settimana. In parallelo: **commercialista per l'inquadramento**
   delle ore formali (il "2-3" segnato).
2. **Settimane 1-2 — accendere la Receptionist** (via B): numero SIP,
   agente, deviazione condizionale `**004*`. Entry telefonica "umana"
   h24, zero chiamate perse, zero stipendi.
3. **Settimane 2-4 — la scala della fiducia.** Le categorie del
   Commerciale con ≥95% di approvazione passano ad auto-invio con ritardo
   di grazia; Segugio attivo sui silenzi. Le 544 ultime parole senza
   risposta smettono di accumularsi. Il telefono passa da "centinaia di
   micro-decisioni" a "la coda Oggi due volte al giorno".
4. **Mese 2 — decidere sul campo coi numeri.** Se le ore di campo
   superano la soglia: ingaggio a task. Formazione = gli strumenti già
   pronti (`/risposte`, `/inventario`, manuale casa, il foglio di
   chiamata anche per lui).
5. **Mese 3 — il modello a regime.** Operatore su trattative + mandati +
   controllo; campo delegato; entry e sales-primo-giro alla macchina con
   le escalation sempre verso di lui; burocrazia a tap.

---

## 6 · Le righe rosse (la qualità si difende così)

- **Mai** delegare trattativa e prezzo — né a un umano né all'AI.
- **Mai** promuovere un'autonomia senza il campione di approvalStats che
  la giustifica; **mai** promuovere le sempre-escalation (rabbia, soldi,
  legale, sconosciuto al primo messaggio).
- **Mai** un accesso più largo della mansione (la lezione vale per i
  dipendenti come per gli agenti: reach dichiarato, non ereditato).
- La qualità non cala delegando sui binari misurati: cala quando il collo
  di bottiglia è uno solo e la latenza cresce — ed è la situazione DI
  OGGI, già misurata. La delega giusta è la difesa della qualità, non la
  sua minaccia.
