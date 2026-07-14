# Il Protocollo BOOM

**La filosofia operativa, resa testabile.** Cinque principi, ognuno con regole
verificabili e un test finale. Nessun sistema, pagina, email o processo esce
senza passare da qui. Non è un manifesto da cornice: è una checklist da usare.

> Ultra qualità di design. Ultra semplicità. Ultra professionalità.
> Brutalmente onesto. Caldo.

---

## 1 · Ultra qualità di design

La qualità sta in quello che togli, non in quello che aggiungi.

- **Un solo sistema di design.** Nero `#08080A`, oro `#D4AF37`, Helvetica Neue
  300, spaziatura larga. Ogni superficie nuova parte dai token esistenti — mai
  da zero, mai "una variante".
- **Niente esce a metà.** Una pagina o è finita (mobile verificato, zero
  overflow, zero errori JS, reduced-motion rispettato) o non esce. "La
  sistemiamo dopo" non esiste: dopo è adesso.
- **Il dettaglio È il prodotto.** L'animazione dell'anello d'oro, il morph del
  listing, il pass nel Wallet: sono queste cose che fanno dire "questi fanno
  sul serio". Se un dettaglio non regge questo standard, si toglie.

**Test:** *aprendola sul telefono, questa cosa sembra fatta da BOOM o "fatta
in fretta"? Cosa posso togliere senza perdere nulla?*

## 2 · Ultra semplicità

Se un processo va spiegato, non è finito.

- **Contare i tap.** Ogni percorso cliente si misura in passi: Magic Sign è
  link → firma. Pre-agreement è link → compila → accetta. Ogni processo nuovo
  dichiara il suo numero di passi PRIMA di essere costruito, e ogni revisione
  deve toglierne, mai aggiungerne.
- **Una sola fonte di verità.** Un dato vive in UN posto (Firestore) e tutto
  il resto lo legge. Se la stessa informazione va aggiornata in due posti, il
  sistema è sbagliato — si corregge il sistema, non l'abitudine.
- **Il cliente sa sempre cosa succede dopo.** Ogni fine-passo dice
  esplicitamente il passo successivo e chi lo farà. Zero limbo.
- **Semplice per il cliente > comodo per noi.** Se la semplicità del cliente
  costa complessità interna, la complessità la assorbiamo noi (e poi la
  automatizziamo).

**Test:** *quanti tap? Chi lo usa per la prima volta, arriva in fondo senza
chiedere niente a nessuno?*

## 3 · Ultra professionalità

Professionale = scritto, tracciato, mai a memoria.

- **Tutto scritto.** Ogni processo ha la sua pagina nel Manuale Operativo:
  trigger → passi → chi agisce → SLA → cosa può andare storto. Se lo sai solo
  tu, non è un processo: è un rischio.
- **Tutto tracciato.** Ogni azione — umana o di Homie — finisce
  nell'`activityLog`. Le scadenze vivono nei motori (fiscal-engine, reminder
  cron), mai nella testa.
- **Gli errori si presentano da soli.** Un fallimento silenzioso è il peggior
  bug possibile: ogni sistema nuovo nasce con il suo heartbeat, il suo alert,
  la sua coda `needsAttention`. Se si rompe alle 3 di notte, alle 6 lo
  sappiamo già.
- **Puntualità come prodotto.** Risposta ai lead < 2 ore lavorative. Le
  promesse hanno una data, e la data si rispetta o si rinegozia PRIMA.

**Test:** *se domani dovessi delegare questo processo, la pagina scritta
basta? Se fallisce, chi lo scopre — noi o il cliente?*

## 4 · Brutalmente onesto

La verità è la strategia, non un vincolo.

- **Se non è verificato di persona, non è su BOOM.** Nessuna eccezione, mai —
  nemmeno per crescere più in fretta, nemmeno in una città nuova.
- **Il prezzo si decodifica, non si nasconde.** Registrazione, cedolare, TARI,
  condominio, utenze: tutto in chiaro, prima della firma ("money decoded").
- **Zero teatro.** Niente urgenza finta, niente contatori, niente dark
  pattern, niente recensioni pilotate. La regola è già nel codice: i dati di
  esempio si NASCONDONO sui listing reali di altre zone — si estende a tutto.
- **I difetti si dichiarano.** Quinto piano senza ascensore? Sta nel listing.
  Il difetto detto da noi costruisce più fiducia del pregio scoperto da loro.
- **Onesti anche verso l'interno.** Lo stato dei sistemi si guarda nei log,
  non nei ricordi ("Homie è connesso" era vero; "Homie lavora" no — l'hanno
  detto i numeri). Costruito ≠ funzionante.

**Test:** *c'è qualcosa qui dentro che non diremmo a voce, guardando il
cliente negli occhi?*

## 5 · Caldo

L'automazione fa la parte fredda, così l'umano può fare quella calda.

- **Ogni parola sembra scritta da una persona.** Email, toast, errori,
  documenti: si scrivono come li scriverebbe Valentino a voce. Vietato il
  corporatese ("La informiamo che…"), vietato il gelo tecnico negli errori.
- **L'automazione libera tempo umano, non lo sostituisce.** Homie scansiona,
  compila, propone (tier 1); la firma umana resta su tutto ciò che tocca le
  persone (tier 2: messaggi, contratti, appuntamenti). È un principio, non un
  limite tecnico.
- **Il momento caldo si protegge.** Viewing, consegna chiavi, benvenuto:
  lì si investe il tempo che i sistemi hanno liberato. Un pass nel Wallet e
  un messaggio personale valgono più di dieci follow-up automatici.
- **Caldo non è morbido.** Si può dire un no netto con calore. Brutalmente
  onesto E caldo: le due cose insieme sono il tono BOOM.

**Test:** *questa email/schermata/risposta, la manderesti così a un amico che
si trasferisce a Roma? Ti vergogneresti a leggerla ad alta voce?*

---

## La checklist di uscita (prima di ogni ship)

Ogni sistema, pagina, processo o email nuova risponde a queste sette domande.
Una risposta storta = non esce.

1. Cosa ho **tolto** rispetto alla prima versione?
2. Quanti **tap/passi** per il cliente? Erano di meno la settimana scorsa?
3. Il cliente sa sempre **cosa succede dopo**?
4. È **scritto** (Manuale Operativo) così che un altro possa operarlo?
5. Quando **fallisce**, chi lo scopre e come? (heartbeat / alert / needsAttention)
6. C'è qualcosa di **non vero, non verificato o non detto**?
7. Sembra scritto da una **persona**? Lo firmeresti a voce?

---

## Applicato a noi, oggi (brutalmente onesto, appunto)

Dove il repo già incarna il protocollo: Magic Sign, pre-agreement, i pass,
la regola dell'onestà sui sample data, il tier 2 di Homie, gli alert health
del radar. Dove lo viola, e va sanato ad agosto:

- `portal.html` da ~21.000 righe: ultra-semplice per chi lo usa, ma non per
  chi lo mantiene. Non si riscrive; si smette di farlo crescere.
- ~30 pagine `preview-*` e ~50 progetti Vercel di esperimenti: la creatività
  va bene, i residui no. Si decide, si tiene UNA versione, si cancella il resto.
- Homie che osserva senza agire da settimane: un sistema costruito ma non
  operante è un debito, non un asset (→ `docs/homie-claude-bridge.md`).
- Documentazione in ritardo sul codice (CLAUDE.md non conosceva il layer
  agent): il protocollo vale anche per i protocolli.

---

*Questo documento governa `PIANO-AGOSTO-2026.md` (il Manuale Operativo della
Fase 2 si scrive DENTRO queste regole) ed è richiamato da `CLAUDE.md`: ogni
sessione di lavoro — umana o AI — lo eredita. Si cambia solo al cambio di
convinzioni, non di umore.*
