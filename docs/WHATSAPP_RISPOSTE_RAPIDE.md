# Risposte rapide WhatsApp Business — BOOM

> **Generato da `js/whatsapp-replies.js`.** Non modificare questo file a mano:
> cambia il modulo e rilancia `node scripts/wa-export.mjs`.
> I testi vivono in una copia sola, letta anche dalla pagina `/risposte`
> (da cui si copiano col pollice) e dai test.

**14 risposte da caricare nell'app** — circa 10 minuti, una volta sola.

Le altre 16 restano nel mazzo: vivono qui e su `/risposte`, si cercano e si
copiano quando capita il caso raro, senza occupare uno slot nel telefono. L'app ne accetta
50 in tutto, ma installarne 50 significa non trovare più quella giusta:
meglio poche, sapute a memoria.

## Come funzionano (il minimo da sapere)

In chat scrivi `/` e la scorciatoia: WhatsApp filtra man mano che digiti,
quindi non devi ricordarti niente a memoria — basta ricordare la **famiglia**
(la prima o le prime due lettere) e scorrere.

| Prefisso | A chi parla | Come si scrive |
|---|---|---|
| `/en…` | Cliente · English | Il grosso del lavoro: expat, studenti internazionali, chi scrive da fuori. |
| `/casa…` | Inquilino in casa · English | Dopo le chiavi: canone, guasti, manuale, recensione, uscita. |
| `/it…` | Cliente · Italiano | Chi scrive in italiano. Stesse cose, altra lingua. |
| `/pr…` | Proprietario · Italiano | Sempre in italiano e sempre col LEI. È il cliente che ci affida un bene. |
| `/az…` | Aziende ed enti | HR, università, centri di ricerca. Voce business: mai "ti va una visita?". |
| `/op…` | Link personali | Le risposte che accompagnano un link generato dal portale o dal bot. Il testo è fisso, il link lo incolli. |

**I limiti veri dell'app**, che è meglio conoscere prima di inventarne una tua:

- massimo **50 risposte rapide** in tutto;
- massimo **1024 caratteri** per messaggio (l'app salva il troncato senza avvisare);
- scorciatoia fino a **25 caratteri, senza spazi**;
- a una risposta rapida puoi **allegare una foto o un PDF**: utile per il listino,
  la locandina per le università, la planimetria tipo.

### Le tre regole che le rendono universali

1. **Ogni messaggio finisce con una domanda o un'azione.** Una risposta che informa
   e non chiede niente lascia la palla al cliente, e il cliente non la rilancia.
2. **I buchi da riempire sono `[MAIUSCOLO fra quadre]`.** Si vedono da lontano:
   un `[NOME]` partito così è l'unico modo di far sembrare finto un messaggio scritto a mano.
   *Regola: non mandare mai un messaggio che contiene ancora una parentesi quadra.*
3. **Si concatenano.** Nessuna risposta prova a dire tutto: due o tre di fila fanno
   la risposta completa. `/enhi` + `/enprice`, `/enhomes` + `/enbook`,
   `/prcanone` + `/prpack`. È per questo che sono poche e generiche invece di una per caso.

## Come si installano

**Android** → WhatsApp Business → ⋮ → *Strumenti per l'attività* → **Risposte rapide** → **+**
→ incolla il messaggio, scrivi la scorciatoia, salva.

**iPhone** → *Impostazioni* → *Strumenti per l'attività* → **Risposte rapide** → **+**.

**Desktop / Web** (la via più veloce per caricarle tutte: si incolla con Ctrl+V invece di
digitare sul telefono) → icona ⚙️ → *Strumenti per l'attività* → **Risposte rapide**.
Si sincronizzano poi sul telefono da sole.

Apri **`/risposte`** sul telefono (o sul computer, è la stessa pagina): ogni risposta ha
il tasto **Copia**. Copia → incolla nell'app → scorciatoia → avanti.

### Le 14 da caricare

- `/enlead` — Contatto dal portale → chiamata
- `/engone` — Quella casa è andata
- `/enprice` — Tutti i costi, in chiaro
- `/endocs` — Documenti per essere approvato
- `/enbook` — Prenota la visita
- `/enwho` — Chi può abitarci: coppia, amici, figli, animali
- `/enfeat` — Arredato? lavatrice, aria, ascensore
- `/enabroad` — È fuori Italia → visita video (€89 sulle case altrui)
- `/encheck` — Ha in mano il contratto di un altro
- `/enfind` — Non abbiamo niente per lui → cerchiamo noi (€350)
- `/enconc` — Burocrazia dell'arrivo (da €15 · pacchetto €390)
- `/enblock` — Bloccare la casa
- `/itciao` — Apertura in italiano
- `/prciao` — Primo contatto col proprietario

Tutto il resto è nel mazzo qui sotto: si copia dalla pagina quando serve.

---

## Le risposte

### Cliente · English — 19

*Il grosso del lavoro: expat, studenti internazionali, chi scrive da fuori.*

#### `/enlead` · Contatto dal portale → chiamata ⭐

**Quando:** Il tuo messaggio più ripetuto. Chiamare è ciò che chiude: si propone subito, e nel frattempo dici in una riga chi sei.

```
Hello [NOME], Valentino from BOOM Rome — you wrote about [CASA].

We're a licensed agency here in Rome: registered contracts in English, and every flat we list we've walked ourselves.

Two minutes on the phone and you'll have it all — availability, the real all-in price, what we need from you. When can I call you?
```
<sub>Da riempire: [NOME] · [CASA] — 315 caratteri</sub>

#### `/engone` · Quella casa è andata ⭐

**Quando:** Il momento in cui la gente sparisce. Non ci si scusa: si dice subito la verità e si riparte con tre domande.

```
Hello [NOME] — you wrote about [CASA]. That one is gone, and I'd rather tell you now than let you wait.

Send me zone, budget and move-in date and I'll come back today with what's really free — every flat walked by us, price all-in, no surprises.

https://www.boomrome.com/apartments
```
<sub>Da riempire: [NOME] · [CASA] — 283 caratteri</sub>

#### `/enprice` · Tutti i costi, in chiaro ⭐

**Quando:** La domanda che decide. Ogni voce, con la garanzia accanto: è la risposta che ti distingue da chi ne nasconde una.

```
Everything, so you can compare us properly:

• Rent — the figure on the listing, nothing added later
• Deposit — refundable, and we film the flat in and out so it comes back
• Our fee — 10% of the annual rent, once, and only if you actually move in
• €300 to hold a home — refundable, and deducted from what you owe

Euro by euro: https://www.boomrome.com/your-money
```
<sub>Pronta così com'è — 366 caratteri</sub>

#### `/endocs` · Documenti per essere approvato ⭐

**Quando:** Data in anticipo e per intero: nessuna richiesta a sorpresa dopo il sì, che è la cosa che fa scappare la gente dalle agenzie.

```
What we need to approve you — the same list for everyone, and nothing extra appears later:

• Passport
• Proof of income: contract, payslips, or your enrolment letter
• A guarantor if your income isn't in Italy yet — ask me, there are ways around it
• Codice fiscale — if you don't have one, we get it for you

Photos from your phone are fine — send them here, or upload them in the secure form: https://www.boomrome.com/booking

Either way I'll tell you today where you stand.
```
<sub>Pronta così com'è — 477 caratteri</sub>

#### `/enbook` · Prenota la visita ⭐

**Quando:** Gli orari nel link sono quelli davvero liberi della tua settimana. E resta aperta la chiamata, che per te funziona meglio.

```
The viewing is free and takes about 30 minutes — in person, or live on video if you're not in Rome yet: you direct the camera, I answer while we walk through it.

Pick a time that's genuinely free in my week:
https://www.boomrome.com/book

Or tell me when I can call and we fix it in a minute.
```
<sub>Pronta così com'è — 293 caratteri</sub>

#### `/enwho` · Chi può abitarci: coppia, amici, figli, animali ⭐

**Quando:** Una delle domande più frequenti. Non prometti al posto del proprietario e chiudi chiedendo chi arriva, così filtri le case giuste.

```
It depends on the flat, and I check the one you like before you commit to anything. As a rule:

• Couples and families — fine on most of our homes
• Friends sharing — where the layout really allows it, and everyone goes on the contract
• Pets — always the owner's decision, and I ask before you get attached to a place

Tell me who's coming: adults, children, pets. I'll only send you homes that work.
```
<sub>Pronta così com'è — 401 caratteri</sub>

#### `/enfeat` · Arredato? lavatrice, aria, ascensore ⭐

**Quando:** 95 conversazioni nella misura. Non elencare a memoria: la pagina è sempre aggiornata, e tu chiedi quali due contano davvero.

```
Each flat lists exactly what's inside — furniture, appliances, heating, lift, balcony — with photos we took ourselves, not the owner's:

https://www.boomrome.com/apartments

Most of ours come furnished and ready to live in. If something isn't written there, ask me: I check with the owner rather than guess.

Air conditioning, lift, washing machine — which are non-negotiable for you?
```
<sub>Pronta così com'è — 384 caratteri</sub>

#### `/enabroad` · È fuori Italia → visita video (€89 sulle case altrui) ⭐

**Quando:** I tuoi clienti sono quasi tutti all'estero e questo servizio l'hai proposto UNA volta in sei mesi. Il gratis apre, il pagato serve per le case degli altri.

```
You don't need to be in Rome to sort this out — most of our tenants sign before they land.

On our homes the live video viewing is free. On a flat that isn't ours we go in person, film it for you and send a written report with the red flags: €89, within 48 hours, credited to our fee if you then rent with us.

https://www.boomrome.com/virtual-viewing

Which one should I see first?
```
<sub>Pronta così com'è — 382 caratteri</sub>

#### `/encheck` · Ha in mano il contratto di un altro ⭐

**Quando:** Proposto 2 volte in sei mesi. La prima lettura gratis è onesta e apre la porta: chi ha paura di firmare torna sempre.

```
Send me the contract before you sign anything. The first read is free: I'll tell you what's unfair, what's missing, and whether the landlord is who he says he is.

https://www.boomrome.com/contract-check

If you want it in writing: €49 for a traffic-light verdict within 24 hours, or €249 with ownership checks and the negotiation handled by us.
```
<sub>Pronta così com'è — 345 caratteri</sub>

#### `/enfind` · Non abbiamo niente per lui → cerchiamo noi (€350) ⭐

**Quando:** Lo vendi già 49 volte in sei mesi: è il modo giusto di non perdere chi non trova casa da te. Da mandare SEMPRE prima di lasciarlo andare.

```
Straight answer: nothing we have right now fits what you asked.

Two ways forward — I keep you first in line for [ZONA], or we go and find it: the whole Rome market plus what never gets published, every match checked by a person before it reaches you. €350, deducted from our fee when you sign, refunded in full if we don't deliver.

https://www.boomrome.com/property-finding

Which one?
```
<sub>Da riempire: [ZONA] — 387 caratteri</sub>

#### `/enconc` · Burocrazia dell'arrivo (da €15 · pacchetto €390) ⭐

**Quando:** Lo nomini già 39 volte: i clienti lo capiscono al volo perché è la parte che li spaventa di più.

```
Codice fiscale, electricity and gas in your name, internet, SIM, residency, health card — this is the part that eats people's first month here. We do it while you're still packing.

Single tasks from €15, the whole landing handled from €390, with one person on WhatsApp for your first month.

https://www.boomrome.com/concierge

Which one do you need first?
```
<sub>Pronta così com'è — 357 caratteri</sub>

#### `/enblock` · Bloccare la casa ⭐

**Quando:** Il momento che vale di più. La riga finale evita le domande DOPO il pagamento, che sono quelle che fanno saltare i contratti.

```
You have everything you need to decide, [NOME].

To hold it: €300 — refundable, deducted from what you owe, and the flat stops being shown to anyone else. Then the pre-agreement, the registered contract, and the keys on your date.

If anything is still unclear, ask me now: I'd rather answer today than after you've paid.
```
<sub>Da riempire: [NOME] — 321 caratteri</sub>

#### `/enlink` · Mando l'annuncio · 🪑 panchina

**Quando:** Quando gli mandi una casa precisa. Una riga sul perché quel link vale, e si chiude con la visita.

```
Here it is: [LINK]

The price is all-in and the photos are ours — we walked the flat before publishing it.

Want to see it? In person, or live on video if you're not in Rome yet.
```
<sub>Da riempire: [LINK] — 178 caratteri</sub>

#### `/enserv` · Mando il link di un servizio da pagare · 🪑 panchina

**Quando:** Il tuo messaggio più ripetuto (18×): il link col modulo, pagamento diretto. Qui è già scritto, ti resta da dire cosa ti serve da lui.

```
Perfect. I'll send you the link with the form — you fill it in and pay right there (Apple Pay works): [LINK]

Before that I need [COSA TI SERVE].

As soon as it's in, we start: [QUANDO].
```
<sub>Da riempire: [LINK] · [COSA TI SERVE] · [QUANDO] — 186 caratteri</sub>

#### `/entrust` · "Come faccio a fidarmi?" · 🪑 panchina

**Quando:** La diffidenza è sana, Roma è piena di truffe. Dagli gli strumenti per verificarti invece di offenderti.

```
Fair question — you can check us in two minutes:

• Egidi Immobiliare S.r.l., VAT 17322991005 — a licensed agency, not a middleman
• 4.9★ on Google from real tenants
• Every contract registered with the Agenzia delle Entrate, every payment through Stripe with a receipt in your name

And the rule that protects you: we never ask for cash, or a transfer to a private person.
```
<sub>Pronta così com'è — 373 caratteri</sub>

#### `/enres` · Posso prendere la residenza? · 🪑 panchina

**Quando:** Rara ma decisiva per chi la chiede: tessera sanitaria, permesso, vita normale. Meglio dirlo prima della firma.

```
Yes — and it's worth doing: residency is what opens the tessera sanitaria and most of ordinary life here.

Two things make it smooth, and both are normal for us: a contract registered with the Agenzia delle Entrate (ours always are), and the owner knowing from the start.

If it's essential for you, tell me before we sign — on a few flats it's complicated, and I'd rather say so now.
```
<sub>Pronta così com'è — 384 caratteri</sub>

#### `/endeal` · Si può trattare sul prezzo · 🪑 panchina

**Quando:** Una risposta uguale per tutti vale più di uno sconto: dice che il prezzo non dipende da quanto insisti.

```
Straight with you: on our own homes the listed price is what the owner agreed to publish, so there's rarely room on the rent itself — I'd rather be boring than quote you one number and the next person another.

Where there sometimes is room: a longer stay, the move-in date, or what's included.

Tell me your real budget and your dates.
```
<sub>Pronta così com'è — 336 caratteri</sub>

#### `/endep` · Deposito trattenuto (lettera gratis o €99) · 🪑 panchina

**Quando:** Anche a chi non è mai stato cliente: risolvi un torto che nessun altro gli risolve, e il passaparola vale più del servizio.

```
Italian law is on your side — art. 1590 of the Civil Code, and a formal 15-day deadline.

Free: generate the demand letter yourself, in correct legal Italian → https://www.boomrome.com/deposit-letter

Or we handle it: €99 to start, then 20% only on what we actually recover → https://www.boomrome.com/deposit-recovery

How much are they holding, and what's their reason?
```
<sub>Pronta così com'è — 370 caratteri</sub>

#### `/enguide` · Le guide gratuite (per chi è ancora freddo) · 🪑 panchina

**Quando:** Chi chiede consigli senza comprare. Regalare valore vero è il modo più economico di restare in testa.

```
Free, no strings — what we'd tell a friend moving here:

• Codice fiscale, residency, health card, SIM, bank: https://www.boomrome.com/welcome-to-rome
• How not to get scammed renting in Rome: https://www.boomrome.com/blog-scam-bible

Read them before you talk to any agency, including us.
```
<sub>Pronta così com'è — 289 caratteri</sub>

### Inquilino in casa · English — 4

*Dopo le chiavi: canone, guasti, manuale, recensione, uscita.*

#### `/enpay` · Come si paga il canone · 🪑 panchina

**Quando:** Primo mese e ogni volta che lo chiedono. Spingi bonifico o addebito: costano meno a entrambi e non si dimenticano.

```
Everything about your rent — invoices, receipts and the button to pay: https://www.boomrome.com/casa

Three ways: card (instant), bank transfer (free, the page shows the details and the reference to copy), or automatic SEPA debit — you authorise once and each instalment collects itself.

Want me to set the automatic one up?
```
<sub>Pronta così com'è — 325 caratteri</sub>

#### `/enfix` · Guasto in casa · 🪑 panchina

**Quando:** Le tre domande evitano il ping-pong e ti dicono subito se devi muoverti oggi.

```
Sorry about that. Send me:
1. A photo or a short video
2. Which room
3. Is it urgent — no water, no heating, no power or a leak means I move today

You can also file it from https://www.boomrome.com/casa so it gets a ticket and a history.

If it's urgent, call me: don't wait for a reply here.
```
<sub>Pronta così com'è — 293 caratteri</sub>

#### `/enrev` · Chiedere la recensione · 🪑 panchina

**Quando:** Quando è contento e ha già le chiavi. Mai a chi ha un problema aperto.

```
[NOME], one small favour — worth more to us than any advertising.

If BOOM did right by you, two lines on Google help the next person trust an agency they've never met:

https://g.page/r/CfcpUptbNnvZEBM/review

And if something wasn't right, tell me first: I'd rather fix it than read it.
```
<sub>Da riempire: [NOME] — 288 caratteri</sub>

#### `/enrefer` · Referral: €50 a te, €50 a chi arriva · 🪑 panchina

**Quando:** Nella stessa settimana della recensione, non nello stesso messaggio.

```
Know anyone else moving to Rome? Send them over and you both get €50 when they rent:

https://www.boomrome.com/refer

No catch, no expiry — and they get exactly the treatment you got.
```
<sub>Pronta così com'è — 183 caratteri</sub>

### Cliente · Italiano — 2

*Chi scrive in italiano. Stesse cose, altra lingua.*

#### `/itciao` · Apertura in italiano ⭐

**Quando:** Stessa struttura: chi sei in una riga, tre informazioni, e la proposta di chiamata.

```
Ciao [NOME], sono Valentino di BOOM Rome — agenzia regolare, contratti registrati, e ogni casa che pubblichiamo l'abbiamo vista di persona.

Dimmi zona, budget e da quando ti serve: ti mando quello che è davvero libero.

https://www.boomrome.com/apartments

Oppure dimmi quando posso chiamarti due minuti.
```
<sub>Da riempire: [NOME] — 305 caratteri</sub>

#### `/itcosti` · I costi in italiano · 🪑 panchina

**Quando:** Quando chiede i numeri e scrive in italiano.

```
Tutto compreso, senza sorprese:

• Canone — quello scritto sull'annuncio, niente aggiunte dopo
• Deposito — restituito alla fine; filmiamo la casa all'ingresso e all'uscita
• Commissione — 10% del canone annuo, una volta sola e solo se entri davvero
• €300 per bloccare — rimborsabili e scalati da quello che devi

Il dettaglio: https://www.boomrome.com/your-money
```
<sub>Pronta così com'è — 364 caratteri</sub>

### Proprietario · Italiano — 2

*Sempre in italiano e sempre col LEI. È il cliente che ci affida un bene.*

#### `/prciao` · Primo contatto col proprietario ⭐

**Quando:** Dice CHI porti in casa sua e aggancia il concordato: è il motivo per cui un proprietario ti richiama invece di archiviarti.

```
Buongiorno [NOME], sono Valentino di BOOM (Egidi Immobiliare).

Affittiamo a stranieri di fascia alta a Roma — professionisti in trasferta, personale ONU e ambasciate, studenti internazionali — e gestiamo tutto: selezione documentata dell'inquilino, contratto registrato, incassi tracciati, scadenze fiscali.

Mi dice zona, metri quadri e se è arredato? Le dico a quanto si affitta davvero. Col canone concordato la cedolare scende al 10%: https://www.boomrome.com/canone
```
<sub>Da riempire: [NOME] — 471 caratteri</sub>

#### `/prpack` · Pacchetto canone concordato (€349) · 🪑 panchina

**Quando:** Dopo il calcolo, quando ha visto il risparmio ma non ha voglia della pratica. Che è sempre.

```
Il concordato conviene, la pratica è noiosa: verifica del canone, contratto conforme, attestazione di rispondenza, registrazione RLI.

La facciamo noi chiavi in mano: €349 una volta sola per immobile, con rimborso integrale se l'immobile non può rientrare in fascia.

https://www.boomrome.com/pacchetto-concordato

Se vuole glielo calcolo sui suoi numeri.
```
<sub>Pronta così com'è — 355 caratteri</sub>

### Aziende ed enti — 1

*HR, università, centri di ricerca. Voce business: mai "ti va una visita?".*

#### `/azimpresa` · Aziende che spostano personale · 🪑 panchina

**Quando:** HR o mobility manager: si parla di fattura e di persone che atterrano, mai di visite.

```
For companies moving people to Rome: one contact, verified homes, compliant leases in English, and a single VAT invoice from an Italian company — the document expense reports ask for.

https://www.boomrome.com/corporate

How many people, and when do they land?
```
<sub>Pronta così com'è — 260 caratteri</sub>

### Link personali — 2

*Le risposte che accompagnano un link generato dal portale o dal bot. Il testo è fisso, il link lo incolli.*

#### `/opsign` · Invito alla firma · 🪑 panchina

**Quando:** Col link Magic Sign. L'ultima riga ti evita le correzioni dopo la registrazione.

```
[NOME], the contract is ready to sign — no printer, no appointment: [LINK]

Read it (it's in English, the terms are the ones we agreed) and sign with your finger. The signed PDF reaches you by email the moment both sides are done.

Anything to change, tell me BEFORE you sign.
```
<sub>Da riempire: [NOME] · [LINK] — 276 caratteri</sub>

#### `/oppay` · Link di pagamento · 🪑 panchina

**Quando:** Per una rata o una fattura: il link resta valido, si può aprire anche più tardi o da un altro telefono.

```
[NOME], here's the secure link to pay [COSA] — [IMPORTO]: [LINK]

It's a Stripe page in your name: the receipt reaches your inbox in seconds. The link stays valid, so you can open it later too.

Prefer a bank transfer? Tell me and I'll send the details.
```
<sub>Da riempire: [NOME] · [COSA] · [IMPORTO] · [LINK] — 253 caratteri</sub>

---

## I due messaggi automatici

Non sono risposte rapide: sono due impostazioni a parte (*Strumenti per l'attività*
→ **Messaggio di benvenuto** e **Messaggio di assenza**), e non consumano gli slot.
Sono anche gli unici messaggi che partono **senza che tu li legga**: per questo non
possono contenere segnaposto.

### Messaggio di benvenuto

**Quando:** Parte da solo a chi ti scrive per la prima volta (o dopo 14 giorni di silenzio). Deve fare UNA cosa: far arrivare le tre informazioni mentre tu dormi.

```
BOOM Rome 👋 Verified apartments in Rome, contracts in English, move-in in 48h. Tell me zone, budget and move-in date and I'll send real options. Live homes: https://www.boomrome.com/apartments
```

### Messaggio di assenza

**Quando:** Fuori orario e nei giorni di chiusura. Chi scrive alle 23 da un altro fuso orario deve trovare qualcosa da fare comunque.

```
Thanks for writing — I'm away from the phone and will reply as soon as I'm back. Meanwhile: homes https://www.boomrome.com/apartments · book a free viewing https://www.boomrome.com/book
```

Per l'assenza imposta l'orario vero in cui non rispondi (es. 21:00–09:00 e la domenica):
un messaggio di assenza attivo 24 ore su 24 dice al cliente che non c'è mai nessuno.

## Le etichette (il pipeline dentro WhatsApp)

Le risposte rapide fanno risparmiare tempo; le etichette sono ciò che impedisce di
**perdere** una persona. Tienile poche: un'etichetta che non guardi mai è rumore.

| Etichetta | A cosa serve |
|---|---|
| 🆕 Nuovo | Ha scritto, non l'hai ancora qualificato. Deve svuotarsi ogni giorno. |
| 📄 Documenti | Interessato ma manca qualcosa da lui. Qui muoiono più trattative che altrove. |
| 📅 Visita | Appuntamento fissato, di persona o in video. |
| ⭐ Da chiudere | Proposta o pre-accordo inviati. È la lista che guardi per prima ogni mattina. |
| 🔑 Inquilino | Ha le chiavi. Non è più un lead: è il tuo fatturato ricorrente. |
| 🏠 Proprietario | Chi ti affida un immobile, attuale o potenziale. |
| 🏢 Azienda / Ente | HR, università, ricerca. Voce diversa, tempi diversi. |
| ❄️ Richiamare | Non ora ma reale. Con la data nella nota: senza data non richiami nessuno. |
| 🇷🇪 Réunion | Secondo mercato: non deve mai finire nei messaggi su Roma. |

Le due che valgono più delle altre: **📄 Documenti** (è lì che muoiono le trattative,
non nel prezzo) e **❄️ Richiamare**, dove ogni chat deve avere una data nella nota —
senza data non richiami nessuno. Per una campagna vera di richiamo usa `/richiama`
sul bot: manda a tutti insieme con un tap, coi veti già applicati.

---

## Libreria link

Tutti verificati: un test controlla che ognuno sia una rotta vera del sito.

### Case e visite

| Link | Cosa è |
|---|---|
| `https://www.boomrome.com/apartments` | Il catalogo live, con filtri per zona, budget e data |
| `https://www.boomrome.com/board` | Il tabellone: stato di ogni casa a colpo d'occhio |
| `https://www.boomrome.com/apartments-in` | I quartieri, con com'è viverci |
| `https://www.boomrome.com/skyline` | La mappa 3D: Roma vista dall'alto, casa per casa |
| `https://www.boomrome.com/book` | Prenotazione visita (di persona o video) sugli slot veri |
| `https://www.boomrome.com/book?zone=pigneto` | Come sopra, ma già sul quartiere (cambia il nome della zona) |
| `https://www.boomrome.com/booking` | Il modulo di candidatura con caricamento documenti |

### Come funziona e prezzi

| Link | Cosa è |
|---|---|
| `https://www.boomrome.com/how-it-works` | I passi dal primo messaggio alle chiavi |
| `https://www.boomrome.com/your-money` | Ogni euro spiegato: canone, deposito, commissione 10% |
| `https://www.boomrome.com/faq` | Le domande ricorrenti, già risposte |
| `https://www.boomrome.com/about` | Chi siamo — da mandare a chi diffida |
| `https://www.boomrome.com/contact` | Tutti i modi per raggiungerci |
| `https://www.boomrome.com/deals` | Promozioni e offerte in corso |

### Servizi a pagamento

| Link | Cosa è |
|---|---|
| `https://www.boomrome.com/services` | Tutti i servizi con il prezzo, su una pagina |
| `https://www.boomrome.com/property-finding` | Cerchiamo noi in tutta Roma — €350, rimborsati se non troviamo |
| `https://www.boomrome.com/virtual-viewing` | Visita video su qualsiasi annuncio — €89 |
| `https://www.boomrome.com/remote-move-pack` | Chiudere da fuori Italia — €299 |
| `https://www.boomrome.com/contract-check` | Controllo contratto GRATIS (il gancio migliore) |
| `https://www.boomrome.com/contract-check-express` | Verdetto scritto in 24h — €49 |
| `https://www.boomrome.com/deal-assistance` | Revisione clausola per clausola e trattativa — €249 |
| `https://www.boomrome.com/deposit-recovery` | Recupero del deposito — €99 + 20% sul recuperato |
| `https://www.boomrome.com/deposit-letter` | Diffida per il deposito, GRATIS e automatica |
| `https://www.boomrome.com/concierge` | Codice fiscale, utenze, SIM, residenza — da €15 |

### Guide gratuite

| Link | Cosa è |
|---|---|
| `https://www.boomrome.com/welcome-to-rome` | La guida di sopravvivenza per chi arriva |
| `https://www.boomrome.com/moving-to-rome` | Costi reali per quartiere e tempi dei documenti |
| `https://www.boomrome.com/moving-to-rome-from-us` | Versione per americani (visti, banca) |
| `https://www.boomrome.com/moving-to-rome-from-uk` | Versione per britannici (post-Brexit) |
| `https://www.boomrome.com/moving-to-rome-from-germany` | Versione per tedeschi |
| `https://www.boomrome.com/blog-scam-bible` | Come non farsi truffare a Roma — il pezzo più condiviso |
| `https://www.boomrome.com/blog-tenant-rights` | I diritti dell'inquilino in Italia |
| `https://www.boomrome.com/blog-cost-calculator` | Quanto costa vivere a Roma, davvero |
| `https://www.boomrome.com/blog-neighborhood-guide` | I quartieri messi a confronto |
| `https://www.boomrome.com/blog-visa-residency` | Visti e residenza |
| `https://www.boomrome.com/blog-contract-types` | I tipi di contratto italiani spiegati |
| `https://www.boomrome.com/blog` | Tutte le guide |

### Proprietari

| Link | Cosa è |
|---|---|
| `https://www.boomrome.com/owners` | La pagina per i proprietari (italiano) |
| `https://www.boomrome.com/canone` | Calcolo canone concordato — gratis |
| `https://www.boomrome.com/pacchetto-concordato` | Il concordato chiavi in mano — €349 |

### Aziende, enti, altri mercati

| Link | Cosa è |
|---|---|
| `https://www.boomrome.com/corporate` | Aziende che spostano personale |
| `https://www.boomrome.com/executive` | Professionisti in trasferta (ONU, ambasciate) |
| `https://www.boomrome.com/universities` | Università e international office |
| `https://www.boomrome.com/research` | Ricercatori ERC / Marie-Curie — da €690 |
| `https://www.boomrome.com/partners` | Tutto ciò che facciamo per le organizzazioni |
| `https://www.boomrome.com/reunion` | La Réunion (francese) — ?role=owner|tenant|buyer |
| `https://www.boomrome.com/match` | Quiz "quale quartiere è per te" (italiano) |

### Clienti e inquilini

| Link | Cosa è |
|---|---|
| `https://www.boomrome.com/casa` | La pagina dell'inquilino: canoni, ricevute, documenti, manuale |
| `https://www.boomrome.com/refer` | Referral: €50 a chi presenta, €50 a chi arriva |
| `https://www.boomrome.com/login` | Accesso a tutte le aree riservate |

### I link che NON si mettono in una risposta rapida

Perché sono **personali**: valgono per una persona sola e li genera il portale o il bot
al momento. Nelle risposte della famiglia `/op…` stanno come `[LINK]`, e tu incolli.

- pagina della visita del cliente (`/viewing?t=…`) — la genera la conferma;
- **Scheda** anagrafica (`/scheda?t=…`) — dal portale, Share Hub;
- **Magic Sign**, firma del contratto (`/sign?sign=…`) — dal portale o dalla console pre-accordo;
- **pre-accordo** (`/pre-agreement?t=…`) — dalla console;
- **link di pagamento** di una rata o fattura — bottone 💳 sulla riga, nel portale.

---

## Manutenzione

- **Cambiare un testo o un prezzo:** `js/whatsapp-replies.js` → `node scripts/wa-export.mjs`
  → ricopia la risposta modificata nell'app. `node tests/whatsapp/replies.mjs` dice subito
  se qualcosa non torna.
- **I prezzi sono agganciati** a `api/_catalog.js` dal test: se cambi il prezzo di un
  servizio nel catalogo e non qui, il test fallisce. È voluto — l'alternativa è promettere
  €89 su WhatsApp e chiedere €99 su Stripe.
- **Da verificare una volta, tu:**
  - il link recensione in `/enrev` (`g.page/r/…/review`): aprilo e controlla che si apra
    la scatola delle stelle di BOOM. È lo stesso che deve stare in `REVIEW_URL` su Vercel.
  - `/enpay` cita il bonifico: in `/casa` compare solo se hai impostato `settings/payout`
    (beneficiario + IBAN) dalle impostazioni del portale.
- **Cose che già fa la macchina**, e che quindi non serve mandare a mano:
  la prima risposta a un lead (il Commerciale la propone su Telegram),
  i solleciti dei canoni (il Gestore), la richiesta di recensione (`/recensione` sul bot),
  le email del percorso inquilino (T-30, T-14, T-7, T-1, T+3).
  Le risposte rapide servono nella **conversazione**, che resta tua.

