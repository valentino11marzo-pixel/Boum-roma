# STUDIO — LA SEGRETARIA · agosto 2026
### Formato: decisioni, non opzioni. Lo schema completo del lavoro dell'operatore.

*Agosto 2026. Domanda dell'operatore: "voglio ricreare perfettamente lo schema
del mio lavoro: dai portali arrivano le mail già gradate e analizzate, così le
chiamate dal centralino. Tutto ciò che ricevo e a cui non posso rispondere,
clicco — e lo manda a questa segretaria: «ti interessa questo? è disponibile?
quando vuoi vederlo? non è disponibile? ti aiutiamo noi — ci lasci i tuoi
dati? offriamo anche la ricerca su misura» — link, informazioni, automazioni.
Quello che devo fare IO l'abbiamo individuato; tutto il resto automatizzarlo
senza perdere qualità e controllo."*

---

## 0 · La diagnosi: manca UN pezzo, non un prodotto

Lo schema che l'operatore descrive esiste già per 4/5:

| Fase | Chi la fa OGGI | Stato |
|---|---|---|
| Intake (portali, sito, WhatsApp, telefono) | scan-inbox · homie/message · centralino · apply-lead | ✅ vive |
| Grading + analisi | Lead Brain (gratis, batch) + card Telegram col messaggio pronto | ✅ vive |
| Prima risposta | Commerciale (bozza, un tap) · scala della fiducia sui template | ✅ vive |
| **Il DURANTE della conversazione** | **l'operatore, a mano, dal telefono** | ❌ il buco |
| Visita → pre-accordo → firma → casa | book/slots · PA · Magic Sign · journey | ✅ vive |

Il buco è il più costoso: è il "durante" — disponibilità, alternative, date,
documenti, «quando puoi vederla?» — che genera la frammentazione misurata
(metà dei messaggi ≤17 caratteri) e i 544 silenzi. Non serve un nuovo
prodotto né una nuova organizzazione: serve **la Segretaria**, il cervello
conversazionale che prende in mano una chat QUANDO l'operatore gliela
consegna, e la porta fino alla visita prenotata o all'escalation.

E non è nemmeno un'idea nuova in casa: è **il cervello della Receptionist
(bot/RECEPTIONIST.md) applicato a WhatsApp** — stessa regola d'oro (mai
inventare: sa solo ciò che i tool dicono), stessi occhi (catalogo vero,
griglia slot vera via `viewings/_avail`), altra porta.

---

## 1 · Le decisioni

- **D1 — La consegna è PER CONVERSAZIONE, e il click è la firma.** Non una
  categoria promossa a priori: l'operatore vede la card del lead (già
  gradata) e tocca **🤖 Segretaria** — da quel momento LEI risponde su
  quella chat, subito, senza altre approvazioni per turno. È il modello che
  l'operatore ha chiesto ("io clicco e la manda a questa segretaria") ed è
  complementare alla scala della fiducia: la scala promuove CATEGORIE di
  bozze one-shot sul provato; la consegna affida UNA conversazione con un
  gesto esplicito. Default: **nessuna conversazione consegnata ⇒ zero
  invii** (il deploy non cambia comportamento).
- **D2 — Un cervello, più porte.** Voce (ElevenLabs, già scritta), WhatsApp
  (questa tranche), email (tranche 2). Tutte leggono le STESSE fonti:
  catalogo con lo stato vero (la lezione del Commerciale: dire "è libera"
  di una casa affittata brucia lead e reputazione insieme), corsie dispo,
  slot di `viewings/_avail` (la griglia che book.html non può smentire),
  servizi da `api/_catalog.js` (mai un prezzo a memoria).
- **D3 — I binari duri stanno nel MOTORE, non nel prompt.** Il prompt guida
  lo stile; le regole che contano si applicano PRIMA (turnVerdict) e DOPO
  (sanitizeReply) la chiamata al modello, e si testano per mutazione:
  mai trattare il prezzo, escalation legale/rabbia → all'operatore (la
  STESSA regex della scala della fiducia — una copia sola), tetto turni per
  conversazione, tetto giornaliero globale, mai un link fuori da
  boomrome.com/wa.me, risposte corte (la voce misurata: mediana 262
  caratteri), mai la Segretaria su inquilini/proprietari/PFS.
- **D4 — Il rientro è sempre dell'operatore, senza cerimonie.** Un suo
  messaggio manuale nella chat spegne la Segretaria su quella conversazione
  (la disciplina `direction:'out'` che già zittisce il Commerciale). La
  trappola vera: le risposte della Segretaria TORNANO dal Mac come `out` —
  senza il riconoscimento dell'eco (`isSegretariaEcho`, hash del testo,
  finestra 48h) si spegnerebbe da sola al primo turno.
- **D5 — L'escalation è un passaggio di testimone, non un errore.** Parole
  legali/di rabbia, tetto turni raggiunto, il modello stesso che dichiara
  `escalate`: la Segretaria si spegne su quella chat e l'operatore riceve
  la card 🖐 con le ultime battute e il link wa.me — riprende A METÀ
  conversazione, non da zero.
- **D6 — La voce è "noi di BOOM", mai la firma di una persona.** La
  Segretaria scrive in prima persona plurale, nella lingua del cliente
  (`replyLang`), corta come l'operatore vero. Non si firma "Valentino":
  una firma personale su un messaggio che quella persona non ha letto è il
  tipo di bugia che si scopre alla prima visita. "Ti metto in contatto con
  Valentino" È l'escalation.
- **D7 — Stesse rotaie, zero superficie nuova.** Ogni turno esce come
  azione `action_queue` (proposedBy `segretaria`, contextHash
  `segretaria:turn:<conv>:<msgId>` → un retry di Homie non risponde due
  volte) eseguita dallo STESSO executor del tap manuale → outbox WhatsApp
  → messageLog → Inbox. Tutto ciò che manda è leggibile dove l'operatore
  già guarda.

## 2 · Il controllo (la qualità si difende così)

- **Prima del click**: il lead arriva già gradato (Brain) e con la card; la
  consegna è una scelta per persona, non un automatismo.
- **Durante**: `/segretaria` su Telegram = il quadro vivo (chat attive,
  turni, spegni-tutto); ogni conversazione resta in Inbox in tempo reale;
  kill switch `settings/segretaria.enabled` che vince subito.
- **Dopo**: escalation immediate con contesto; `segretariaTurns` sul doc
  conversazione; messageLog come per ogni messaggio della macchina.
- **Mai**: prezzo/trattativa, promesse fuori catalogo, contatti che non
  sono lead, invenzioni (i fatti nel prompt vengono SOLO dalle fonti vere,
  e quando un dato manca la regola è dichiararlo e promettere la verifica).

## 3 · Le tranche

1. **ORA — WhatsApp** (questa release): consegna dalla card Telegram,
   turni auto con binari duri, escalation, /segretaria, test sul giro vero.
2. **Email**: stesso cervello, transport nodemailer (reply nel thread), per
   i lead dei portali che non hanno ancora un numero.
3. **Centralino → Segretaria**: la promessa della receptionist ("ti scrivo
   su WhatsApp") diventa un handover automatico proposto — il lead da
   chiamata arriva con la card e il 🤖 già suggerito.
4. **La promozione della consegna**: quando i numeri della Segretaria
   reggono (escalation rare, esiti buoni), la consegna stessa può diventare
   proponibile dalla macchina ("questo lead te lo gestisco io?") — sempre
   un tap, mai da sola.

## 4 · Cosa resta all'operatore (il suo lavoro, per contratto)

Trattative e prezzo · mandati e proprietari · visite in persona ·
escalation · il click della consegna · le manopole. Tutto il resto —
intake, grading, prima risposta, il durante, prenotazione, promemoria,
burocrazia — è macchina, con le prove nei test.
