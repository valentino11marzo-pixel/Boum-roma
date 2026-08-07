# STUDIO — /executive come pagina di CONVERSIONE (2026-08)

Terzo verdetto del fondatore, sulla v3: *«chaotic, dispersive, not clear,
overwhelming, identical to other shit»* — e l'istruzione: studiare prima gli
argomenti e l'esperienza, poi confrontarsi coi competitor **che convertono
davvero**, e solo dopo rifare. Questo documento è quello studio. La v3 aveva
risolto il problema della MARCA (stile BOOM vero — vedi
`STUDIO_EXECUTIVE_UIX.md`, che resta valido); non aveva nemmeno affrontato il
problema della CONVERSIONE. Sono due problemi diversi.

---

## 1. L'audit della v3 — il caos, misurato

Numeri presi dal sorgente, non impressioni:

| misura | v3 | effetto |
|---|---|---|
| parole (EN) PRIMA del form | **2.003** | il visitatore deve leggere un saggio prima di poter agire |
| CTA diverse nel solo hero | **3** (paybtn + ghost + nav-cta) | tre inviti diversi = nessun invito |
| piastre oro `paybtn` totali | **4** | la CTA "di firma" ripetuta 4 volte smette di essere una firma |
| card informative (`g-it`) | **9** | nove argomenti pesano come nessuno |
| blocchi/section totali | ~16 (hero pieno + 8 section + band) | nessun filo: si "visita" la pagina, non la si percorre |
| device simultanei | 3 (console + board + contratto) | ogni schermata ha un oggetto che chiede attenzione |

La diagnosi in una riga: **la v3 è una brochure che parla; le pagine che
convertono sono un corridoio che porta a UNA porta.** E siccome ogni pagina
servizio BOOM usa la stessa ricetta (hero → steps → get → trio → truth →
faq → band), riempire la ricetta per intero produce anche l'effetto
"identical to other shit": la ricetta completa È il template.

---

## 2. Gli argomenti — cosa fa dire "sì" a QUESTO cliente

Il visitatore è un professionista con un incarico: tempo zero, rischio
percepito alto (paese straniero, contratto in una lingua che non legge, un
datore che chiederà documenti). La sua decisione non è "che bel servizio":
è **"mi fido abbastanza da lasciare i miei dati adesso?"**. Le domande che
si fa, in quest'ordine:

1. **È per me?** → una riga che nomina la sua situazione (incarico, date).
2. **Che cosa ottengo?** → il risultato concreto, non i valori: casa vista
   in video, contratto registrato che finisce con l'incarico, ricevute per
   il datore, chiavi all'atterraggio.
3. **Posso fidarmi?** → prova concreta subito: recensioni, contratti
   registrati, i NOMI di chi serviamo (FAO, ambasciate, LUISS…).
4. **Cosa mi costa farlo ORA?** → un form che sembra un minuto, non un
   interrogatorio; "risposta in giornata, senza impegno".
5. *(dopo, se vuole)* i dettagli → FAQ richiudibili e fact sheet: la
   profondità c'è, ma non pesa sul percorso.

Ogni sezione che non risponde a una di queste domande — o che risponde a
una domanda già risolta — è attrito. La v3 rispondeva alla domanda 2 nove
volte.

---

## 3. Il benchmark — chi converte davvero, e come

Metodo: fetch diretto bloccato dalla rete del sandbox (egress proxy);
struttura verificata via ricerca (tagline e modello attuali) + pattern
stabili e noti di questi prodotti. Fonti in coda.

**Blueground** (il riferimento mondiale del furnished mid-term, tagline
**#ShowUpStartLiving**): hero = UNA riga + UN box di ricerca
(città/date). Il PRODOTTO — appartamenti veri, foto, prezzi — arriva entro
il secondo scroll. Come funziona in 3 passi, recensioni, ~6-7 sezioni in
tutto. "Search live listings, book instantly, move in easily": la stessa
azione, ripetuta identica, mai tre azioni diverse.

**Homelike** (business apartments, forte su aziende tech/finance): search
first, e — la lezione più utile per noi — **il binario corporate è
separato e silenzioso** (un link "for companies", non un pezzo della
pagina persona): il B2B non inquina mai il flusso della persona.

**Spotahome** (professionisti europei in trasferimento): la promessa
OPERATIVA in una riga — prenoti online, visite video al posto delle visite
di persona — poi ricerca subito e trust in numeri. Il loro intero modello
è la nostra sezione "remote closing": loro ci hanno costruito la homepage.

**Il modello relocation** (servizio su misura, il nostro caso quando non
c'è un catalogo da mille annunci): la conversione è "parla con noi" — form
CORTO (3–5 campi) o calendario, subito, e tutto il resto della pagina è
prova. È il modello giusto per /executive, con la disciplina del
marketplace presa in prestito: **il form trattato come Blueground tratta
il search box** — leggero, nell'hero, un'unica azione.

Denominatori comuni misurabili dei convertitori:
- **UNA azione primaria**, ripetuta identica (mai 3 CTA diverse);
- prodotto o prova **visibile subito** (non manifesti);
- **6–8 sezioni** totali;
- form **≤5 campi visibili** (il resto opzionale, a scomparsa);
- copy scandibile: titoli corti, **nessun paragrafo sopra le 2 righe** nel
  percorso principale;
- social proof concreta **presto** (numeri, nomi, recensioni).

---

## 4. Le regole della v4 (la spec)

- **R1 — Una porta sola.** Il form È l'hero (colonna destra), trattato
  come un search box: **5 campi visibili** (nome, email, arrivo, durata,
  budget) + "More details" a scomparsa (telefono, datore, settore, zona,
  note — l'attribuzione per flusso non si perde, si nasconde). Una sola
  etichetta d'azione, ovunque identica: *Get options today*. Nav-cta,
  paybar e band puntano TUTTI lì.
- **R2 — ≤8 blocchi.** hero+form → come funziona (3 passi) → chi serviamo
  (6 voci CORTE, ancore `#seg-*` conservate) → il contratto (una striscia)
  → onestà (mini) → fact sheet (GEO) → FAQ → band. Tagliati: console
  gigante, board a paragrafi, get-6, trio-3, zone-3, paywrap corporate
  (il corporate vive in fam strip, footer e una riga — lezione Homelike).
- **R3 — ~60 parole prima del form**, non 2.003. La profondità va dove non
  pesa: FAQ richiudibili e fact sheet.
- **R4 — Un solo device, sussurrato.** La macchina (e-sign, REGISTERED·RLI,
  ricevute) è UNA riga mono sotto il form + la striscia contratto compatta
  più in basso. Mai due device nella stessa schermata.
- **R5 — La prova subito.** Sotto il form: ★4.9 Google · contratti
  registrati · *serving people at* FAO · WFP · IFAD · embassies · LUISS ·
  Cinecittà. I nomi sono la prova; arrivano prima di qualsiasi racconto.
- **R6 — GEO intoccabile** (il canale organico via AI): « in brief »
  citabile, FAQ visibili = FAQPage, `speakable`, llms.txt — la profondità
  per i motori di risposta vive lì, asserita dai test.
- **R7 — Lo stile resta la v3** (sistema 2026 + layer tech quieto +
  lockup BOOM │ EXECUTIVE): l'eleganza adesso è la **spaziatura**, non
  l'aggiunta. Distinto dalle altre pagine BOOM per architettura (form-hero,
  una porta), non per decorazione.

Bersagli misurabili v3 → v4: blocchi 16 → **8** · parole prima del form
2.003 → **~60** · campi visibili 9 → **5** · CTA in hero 3 → **1** ·
device 3 → **1**.

---

Fonti benchmark: [Blueground](https://www.theblueground.com/) ·
[Blueground corporate](https://www.theblueground.com/furnished-corporate-apartments) ·
[Blueground — funding/press](https://www.prnewswire.com/news-releases/blueground-tops-28-million-in-funding-to-expand-its-network-of-beautifully-designed-tech-powered-apartments-300807146.html) ·
[AltoVita — corporate housing companies 2026](https://www.altovita.com/blog/corporate-housing-companies) ·
[CHPA — what is corporate housing](https://www.chpaonline.org/what-is-corporate-housing/)
