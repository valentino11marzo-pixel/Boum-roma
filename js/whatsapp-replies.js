// js/whatsapp-replies.js — LE RISPOSTE RAPIDE DI WHATSAPP BUSINESS, UNA COPIA SOLA.
//
// Perché un modulo e non un documento: le stesse frasi servono in tre posti —
// la pagina /risposte (da cui si copia col pollice), il documento in
// docs/WHATSAPP_RISPOSTE_RAPIDE.md (che si GENERA da qui, non si riscrive) e i
// test. Tenute in due copie, dopo il primo cambio di prezzo divergono e da
// quel momento non ci si fida più di nessuna delle due.
//
// Le regole dure, tutte pinnate in tests/whatsapp/replies.mjs:
//  1. Un link che il sito non serve non può stare in una risposta salvata.
//     Una risposta rapida si manda a occhi chiusi mille volte: un 404 dentro
//     non lo scopre l'operatore, lo scopre il cliente.
//  2. Le scorciatoie stanno nei limiti dell'app (≤25 caratteri, senza spazi) e
//     sono uniche: due risposte sulla stessa scorciatoia = quella sbagliata a
//     caso, e per capirlo bisogna rileggere il messaggio già inviato.
//  3. Ogni testo sta sotto il limite del messaggio (1024). Il taglio non
//     avvisa: l'app salva il troncato.
//  4. I buchi da riempire a mano sono SEMPRE [MAIUSCOLO fra parentesi quadre].
//     Un segnaposto che assomiglia a testo normale finisce spedito così.
//
// Prezzi e condizioni vengono dalle pagine e da api/_catalog.js: quando cambia
// un prezzo si cambia QUI e si rigenera il documento (node scripts/wa-export.mjs).
//
// UMD come boom-geo / dispo-engine: window.BOOM_WA nel browser, import ESM
// negli script e nei test.

(function (root, factory) {
  var API = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_WA = API;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const SITE = 'https://www.boomrome.com';

  // I limiti dell'app WhatsApp Business. Il messaggio e la scorciatoia sono
  // quelli documentati; per saluto e assenza l'app è più stretta e non lo dice
  // uguale su tutte le versioni, quindi stiamo larghi (≤200) e la domanda non
  // si pone mai.
  const LIMITS = { text: 1024, shortcut: 25, total: 50, autoMessage: 200 };

  const FAMILIES = [
    { key: 'en', label: 'Cliente · English', note: 'Il grosso del lavoro: expat, studenti internazionali, chi scrive da fuori.' },
    { key: 'casa', label: 'Inquilino in casa · English', note: 'Dopo le chiavi: canone, guasti, manuale, recensione, uscita.' },
    { key: 'it', label: 'Cliente · Italiano', note: 'Chi scrive in italiano. Stesse cose, altra lingua.' },
    { key: 'pr', label: 'Proprietario · Italiano', note: 'Sempre in italiano e sempre col LEI. È il cliente che ci affida un bene.' },
    { key: 'az', label: 'Aziende ed enti', note: 'HR, università, centri di ricerca. Voce business: mai "ti va una visita?".' },
    { key: 'op', label: 'Link personali', note: 'Le risposte che accompagnano un link generato dal portale o dal bot. Il testo è fisso, il link lo incolli.' },
  ];

  // ---------------------------------------------------------------------------
  // LE RISPOSTE
  // sc    = scorciatoia (si digita /sc nella chat) — senza slash, minuscole
  // when  = quando usarla, per te che scegli in due secondi
  // text  = il messaggio esatto che parte
  // ---------------------------------------------------------------------------
  const REPLIES = [

    // ═══════════════════════════════════════════════════════════════════════
    // IL KIT — versione definitiva.
    // Tre regole, applicate a ognuna senza eccezioni:
    //  1. UNA PORTA per messaggio. Un servizio, un prezzo, un link. Chi ne
    //     propone due non ne vende nessuno, e chi insiste due volte perde
    //     anche la prima.
    //  2. Il prezzo si dice SEMPRE, e accanto la garanzia (rimborsato,
    //     scalato, gratis la prima lettura). Un prezzo senza garanzia è una
    //     richiesta; con la garanzia è un'offerta.
    //  3. Il valore si SPIEGA in una riga concreta — "le foto sono nostre",
    //     "filmiamo la casa all'ingresso e all'uscita", "controllo con il
    //     proprietario invece di tirare a indovinare" — mai aggettivi.
    // Lunghezza tarata sulla misura vera (mediana dei suoi messaggi: 17
    // caratteri, 3 su 4 sotto 38): qui si sta fra 230 e 430, cioè poche righe.
    // ═══════════════════════════════════════════════════════════════════════

    {
      sc: 'enlead', fam: 'en', star: true,
      title: 'Contatto dal portale → chiamata',
      when: 'Il tuo messaggio più ripetuto. Chiamare è ciò che chiude: si propone subito, e nel frattempo dici in una riga chi sei.',
      text: `Hello [NOME], Valentino from BOOM Rome — you wrote about [CASA].

We're a licensed agency here in Rome: registered contracts in English, and every flat we list we've walked ourselves.

Two minutes on the phone and you'll have it all — availability, the real all-in price, what we need from you. When can I call you?`,
    },
    {
      sc: 'engone', fam: 'en', star: true,
      title: 'Quella casa è andata',
      when: 'Il momento in cui la gente sparisce. Non ci si scusa: si dice subito la verità e si riparte con tre domande.',
      text: `Hello [NOME] — you wrote about [CASA]. That one is gone, and I'd rather tell you now than let you wait.

Send me zone, budget and move-in date and I'll come back today with what's really free — every flat walked by us, price all-in, no surprises.

${SITE}/apartments`,
    },
    {
      sc: 'enprice', fam: 'en', star: true,
      title: 'Tutti i costi, in chiaro',
      when: 'La domanda che decide. Ogni voce, con la garanzia accanto: è la risposta che ti distingue da chi ne nasconde una.',
      text: `Everything, so you can compare us properly:

• Rent — the figure on the listing, nothing added later
• Deposit — refundable, and we film the flat in and out so it comes back
• Our fee — 10% of the annual rent, once, and only if you actually move in
• €300 to hold a home — refundable, and deducted from what you owe

Euro by euro: ${SITE}/your-money`,
    },
    {
      sc: 'endocs', fam: 'en', star: true,
      title: 'Documenti per essere approvato',
      when: 'Data in anticipo e per intero: nessuna richiesta a sorpresa dopo il sì, che è la cosa che fa scappare la gente dalle agenzie.',
      text: `What we need to approve you — the same list for everyone, and nothing extra appears later:

• Passport
• Proof of income: contract, payslips, or your enrolment letter
• A guarantor if your income isn't in Italy yet — ask me, there are ways around it
• Codice fiscale — if you don't have one, we get it for you

Photos from your phone are fine — send them here, or upload them in the secure form: ${SITE}/booking

Either way I'll tell you today where you stand.`,
    },
    {
      sc: 'enbook', fam: 'en', star: true,
      title: 'Prenota la visita',
      when: 'Gli orari nel link sono quelli davvero liberi della tua settimana. E resta aperta la chiamata, che per te funziona meglio.',
      text: `The viewing is free and takes about 30 minutes — in person, or live on video if you're not in Rome yet: you direct the camera, I answer while we walk through it.

Pick a time that's genuinely free in my week:
${SITE}/book

Or tell me when I can call and we fix it in a minute.`,
    },
    {
      sc: 'enwho', fam: 'en', star: true,
      title: 'Chi può abitarci: coppia, amici, figli, animali',
      when: 'Una delle domande più frequenti. Non prometti al posto del proprietario e chiudi chiedendo chi arriva, così filtri le case giuste.',
      text: `It depends on the flat, and I check the one you like before you commit to anything. As a rule:

• Couples and families — fine on most of our homes
• Friends sharing — where the layout really allows it, and everyone goes on the contract
• Pets — always the owner's decision, and I ask before you get attached to a place

Tell me who's coming: adults, children, pets. I'll only send you homes that work.`,
    },
    {
      sc: 'enfeat', fam: 'en', star: true,
      title: 'Arredato? lavatrice, aria, ascensore',
      when: '95 conversazioni nella misura. Non elencare a memoria: la pagina è sempre aggiornata, e tu chiedi quali due contano davvero.',
      text: `Each flat lists exactly what's inside — furniture, appliances, heating, lift, balcony — with photos we took ourselves, not the owner's:

${SITE}/apartments

Most of ours come furnished and ready to live in. If something isn't written there, ask me: I check with the owner rather than guess.

Air conditioning, lift, washing machine — which are non-negotiable for you?`,
    },
    {
      sc: 'enabroad', fam: 'en', star: true,
      title: 'È fuori Italia → visita video (€89 sulle case altrui)',
      when: 'I tuoi clienti sono quasi tutti all\'estero e questo servizio l\'hai proposto UNA volta in sei mesi. Il gratis apre, il pagato serve per le case degli altri.',
      text: `You don't need to be in Rome to sort this out — most of our tenants sign before they land.

On our homes the live video viewing is free. On a flat that isn't ours we go in person, film it for you and send a written report with the red flags: €89, within 48 hours, credited to our fee if you then rent with us.

${SITE}/virtual-viewing

Which one should I see first?`,
    },
    {
      sc: 'encheck', fam: 'en', star: true,
      title: 'Ha in mano il contratto di un altro',
      when: 'Proposto 2 volte in sei mesi. La prima lettura gratis è onesta e apre la porta: chi ha paura di firmare torna sempre.',
      text: `Send me the contract before you sign anything. The first read is free: I'll tell you what's unfair, what's missing, and whether the landlord is who he says he is.

${SITE}/contract-check

If you want it in writing: €49 for a traffic-light verdict within 24 hours, or €249 with ownership checks and the negotiation handled by us.`,
    },
    {
      sc: 'enfind', fam: 'en', star: true,
      title: 'Non abbiamo niente per lui → cerchiamo noi (€350)',
      when: 'Lo vendi già 49 volte in sei mesi: è il modo giusto di non perdere chi non trova casa da te. Da mandare SEMPRE prima di lasciarlo andare.',
      text: `Straight answer: nothing we have right now fits what you asked.

Two ways forward — I keep you first in line for [ZONA], or we go and find it: the whole Rome market plus what never gets published, every match checked by a person before it reaches you. €350, deducted from our fee when you sign, refunded in full if we don't deliver.

${SITE}/property-finding

Which one?`,
    },
    {
      sc: 'enconc', fam: 'en', star: true,
      title: 'Burocrazia dell\'arrivo (da €15 · pacchetto €390)',
      when: 'Lo nomini già 39 volte: i clienti lo capiscono al volo perché è la parte che li spaventa di più.',
      text: `Codice fiscale, electricity and gas in your name, internet, SIM, residency, health card — this is the part that eats people's first month here. We do it while you're still packing.

Single tasks from €15, the whole landing handled from €390, with one person on WhatsApp for your first month.

${SITE}/concierge

Which one do you need first?`,
    },
    {
      sc: 'enblock', fam: 'en', star: true,
      title: 'Bloccare la casa',
      when: 'Il momento che vale di più. La riga finale evita le domande DOPO il pagamento, che sono quelle che fanno saltare i contratti.',
      text: `You have everything you need to decide, [NOME].

To hold it: €300 — refundable, deducted from what you owe, and the flat stops being shown to anyone else. Then the pre-agreement, the registered contract, and the keys on your date.

If anything is still unclear, ask me now: I'd rather answer today than after you've paid.`,
    },
    {
      sc: 'itciao', fam: 'it', star: true,
      title: 'Apertura in italiano',
      when: 'Stessa struttura: chi sei in una riga, tre informazioni, e la proposta di chiamata.',
      text: `Ciao [NOME], sono Valentino di BOOM Rome — agenzia regolare, contratti registrati, e ogni casa che pubblichiamo l'abbiamo vista di persona.

Dimmi zona, budget e da quando ti serve: ti mando quello che è davvero libero.

${SITE}/apartments

Oppure dimmi quando posso chiamarti due minuti.`,
    },
    {
      sc: 'prciao', fam: 'pr', star: true,
      title: 'Primo contatto col proprietario',
      when: 'Dice CHI porti in casa sua e aggancia il concordato: è il motivo per cui un proprietario ti richiama invece di archiviarti.',
      text: `Buongiorno [NOME], sono Valentino di BOOM (Egidi Immobiliare).

Affittiamo a stranieri di fascia alta a Roma — professionisti in trasferta, personale ONU e ambasciate, studenti internazionali — e gestiamo tutto: selezione documentata dell'inquilino, contratto registrato, incassi tracciati, scadenze fiscali.

Mi dice zona, metri quadri e se è arredato? Le dico a quanto si affitta davvero. Col canone concordato la cedolare scende al 10%: ${SITE}/canone`,
    },

    // ── NEL MAZZO: si copiano da /risposte quando serve, senza occupare slot ─
    {
      sc: 'enlink', fam: 'en', bench: true,
      title: 'Mando l\'annuncio',
      when: 'Quando gli mandi una casa precisa. Una riga sul perché quel link vale, e si chiude con la visita.',
      text: `Here it is: [LINK]

The price is all-in and the photos are ours — we walked the flat before publishing it.

Want to see it? In person, or live on video if you're not in Rome yet.`,
    },
    {
      sc: 'enserv', fam: 'en', bench: true,
      title: 'Mando il link di un servizio da pagare',
      when: 'Il tuo messaggio più ripetuto (18×): il link col modulo, pagamento diretto. Qui è già scritto, ti resta da dire cosa ti serve da lui.',
      text: `Perfect. I'll send you the link with the form — you fill it in and pay right there (Apple Pay works): [LINK]

Before that I need [COSA TI SERVE].

As soon as it's in, we start: [QUANDO].`,
    },
    {
      sc: 'entrust', fam: 'en', bench: true,
      title: '"Come faccio a fidarmi?"',
      when: 'La diffidenza è sana, Roma è piena di truffe. Dagli gli strumenti per verificarti invece di offenderti.',
      text: `Fair question — you can check us in two minutes:

• Egidi Immobiliare S.r.l., VAT 17322991005 — a licensed agency, not a middleman
• 4.9★ on Google from real tenants
• Every contract registered with the Agenzia delle Entrate, every payment through Stripe with a receipt in your name

And the rule that protects you: we never ask for cash, or a transfer to a private person.`,
    },
    {
      sc: 'enres', fam: 'en', bench: true,
      title: 'Posso prendere la residenza?',
      when: 'Rara ma decisiva per chi la chiede: tessera sanitaria, permesso, vita normale. Meglio dirlo prima della firma.',
      text: `Yes — and it's worth doing: residency is what opens the tessera sanitaria and most of ordinary life here.

Two things make it smooth, and both are normal for us: a contract registered with the Agenzia delle Entrate (ours always are), and the owner knowing from the start.

If it's essential for you, tell me before we sign — on a few flats it's complicated, and I'd rather say so now.`,
    },
    {
      sc: 'endeal', fam: 'en', bench: true,
      title: 'Si può trattare sul prezzo',
      when: 'Una risposta uguale per tutti vale più di uno sconto: dice che il prezzo non dipende da quanto insisti.',
      text: `Straight with you: on our own homes the listed price is what the owner agreed to publish, so there's rarely room on the rent itself — I'd rather be boring than quote you one number and the next person another.

Where there sometimes is room: a longer stay, the move-in date, or what's included.

Tell me your real budget and your dates.`,
    },
    {
      sc: 'endep', fam: 'en', bench: true,
      title: 'Deposito trattenuto (lettera gratis o €99)',
      when: 'Anche a chi non è mai stato cliente: risolvi un torto che nessun altro gli risolve, e il passaparola vale più del servizio.',
      text: `Italian law is on your side — art. 1590 of the Civil Code, and a formal 15-day deadline.

Free: generate the demand letter yourself, in correct legal Italian → ${SITE}/deposit-letter

Or we handle it: €99 to start, then 20% only on what we actually recover → ${SITE}/deposit-recovery

How much are they holding, and what's their reason?`,
    },
    {
      sc: 'enguide', fam: 'en', bench: true,
      title: 'Le guide gratuite (per chi è ancora freddo)',
      when: 'Chi chiede consigli senza comprare. Regalare valore vero è il modo più economico di restare in testa.',
      text: `Free, no strings — what we'd tell a friend moving here:

• Codice fiscale, residency, health card, SIM, bank: ${SITE}/welcome-to-rome
• How not to get scammed renting in Rome: ${SITE}/blog-scam-bible

Read them before you talk to any agency, including us.`,
    },
    {
      sc: 'enpay', fam: 'casa', bench: true,
      title: 'Come si paga il canone',
      when: 'Primo mese e ogni volta che lo chiedono. Spingi bonifico o addebito: costano meno a entrambi e non si dimenticano.',
      text: `Everything about your rent — invoices, receipts and the button to pay: ${SITE}/casa

Three ways: card (instant), bank transfer (free, the page shows the details and the reference to copy), or automatic SEPA debit — you authorise once and each instalment collects itself.

Want me to set the automatic one up?`,
    },
    {
      sc: 'enfix', fam: 'casa', bench: true,
      title: 'Guasto in casa',
      when: 'Le tre domande evitano il ping-pong e ti dicono subito se devi muoverti oggi.',
      text: `Sorry about that. Send me:
1. A photo or a short video
2. Which room
3. Is it urgent — no water, no heating, no power or a leak means I move today

You can also file it from ${SITE}/casa so it gets a ticket and a history.

If it's urgent, call me: don't wait for a reply here.`,
    },
    {
      sc: 'enrev', fam: 'casa', bench: true,
      title: 'Chiedere la recensione',
      when: 'Quando è contento e ha già le chiavi. Mai a chi ha un problema aperto.',
      text: `[NOME], one small favour — worth more to us than any advertising.

If BOOM did right by you, two lines on Google help the next person trust an agency they've never met:

https://g.page/r/CfcpUptbNnvZEBM/review

And if something wasn't right, tell me first: I'd rather fix it than read it.`,
    },
    {
      sc: 'enrefer', fam: 'casa', bench: true,
      title: 'Referral: €50 a te, €50 a chi arriva',
      when: 'Nella stessa settimana della recensione, non nello stesso messaggio.',
      text: `Know anyone else moving to Rome? Send them over and you both get €50 when they rent:

${SITE}/refer

No catch, no expiry — and they get exactly the treatment you got.`,
    },
    {
      sc: 'itcosti', fam: 'it', bench: true,
      title: 'I costi in italiano',
      when: 'Quando chiede i numeri e scrive in italiano.',
      text: `Tutto compreso, senza sorprese:

• Canone — quello scritto sull'annuncio, niente aggiunte dopo
• Deposito — restituito alla fine; filmiamo la casa all'ingresso e all'uscita
• Commissione — 10% del canone annuo, una volta sola e solo se entri davvero
• €300 per bloccare — rimborsabili e scalati da quello che devi

Il dettaglio: ${SITE}/your-money`,
    },
    {
      sc: 'prpack', fam: 'pr', bench: true,
      title: 'Pacchetto canone concordato (€349)',
      when: 'Dopo il calcolo, quando ha visto il risparmio ma non ha voglia della pratica. Che è sempre.',
      text: `Il concordato conviene, la pratica è noiosa: verifica del canone, contratto conforme, attestazione di rispondenza, registrazione RLI.

La facciamo noi chiavi in mano: €349 una volta sola per immobile, con rimborso integrale se l'immobile non può rientrare in fascia.

${SITE}/pacchetto-concordato

Se vuole glielo calcolo sui suoi numeri.`,
    },
    {
      sc: 'azimpresa', fam: 'az', bench: true,
      title: 'Aziende che spostano personale',
      when: 'HR o mobility manager: si parla di fattura e di persone che atterrano, mai di visite.',
      text: `For companies moving people to Rome: one contact, verified homes, compliant leases in English, and a single VAT invoice from an Italian company — the document expense reports ask for.

${SITE}/corporate

How many people, and when do they land?`,
    },
    {
      sc: 'opsign', fam: 'op', bench: true,
      title: 'Invito alla firma',
      when: 'Col link Magic Sign. L\'ultima riga ti evita le correzioni dopo la registrazione.',
      text: `[NOME], the contract is ready to sign — no printer, no appointment: [LINK]

Read it (it's in English, the terms are the ones we agreed) and sign with your finger. The signed PDF reaches you by email the moment both sides are done.

Anything to change, tell me BEFORE you sign.`,
    },
    {
      sc: 'oppay', fam: 'op', bench: true,
      title: 'Link di pagamento',
      when: 'Per una rata o una fattura: il link resta valido, si può aprire anche più tardi o da un altro telefono.',
      text: `[NOME], here's the secure link to pay [COSA] — [IMPORTO]: [LINK]

It's a Stripe page in your name: the receipt reaches your inbox in seconds. The link stays valid, so you can open it later too.

Prefer a bank transfer? Tell me and I'll send the details.`,
    },
  ];

  // ---------------------------------------------------------------------------
  // MESSAGGI AUTOMATICI (non sono risposte rapide: sono due impostazioni a sé)
  // ---------------------------------------------------------------------------
  const GREETING = {
    title: 'Messaggio di benvenuto',
    when: 'Parte da solo a chi ti scrive per la prima volta (o dopo 14 giorni di silenzio). Deve fare UNA cosa: far arrivare le tre informazioni mentre tu dormi.',
    text: `BOOM Rome 👋 Verified apartments in Rome, contracts in English, move-in in 48h. Tell me zone, budget and move-in date and I'll send real options. Live homes: ${SITE}/apartments`,
  };

  const AWAY = {
    title: 'Messaggio di assenza',
    when: 'Fuori orario e nei giorni di chiusura. Chi scrive alle 23 da un altro fuso orario deve trovare qualcosa da fare comunque.',
    text: `Thanks for writing — I'm away from the phone and will reply as soon as I'm back. Meanwhile: homes ${SITE}/apartments · book a free viewing ${SITE}/book`,
  };

  // Etichette: poche e che seguano il percorso vero, non l'umore.
  const LABELS = [
    { name: '🆕 Nuovo', what: 'Ha scritto, non l\'hai ancora qualificato. Deve svuotarsi ogni giorno.' },
    { name: '📄 Documenti', what: 'Interessato ma manca qualcosa da lui. Qui muoiono più trattative che altrove.' },
    { name: '📅 Visita', what: 'Appuntamento fissato, di persona o in video.' },
    { name: '⭐ Da chiudere', what: 'Proposta o pre-accordo inviati. È la lista che guardi per prima ogni mattina.' },
    { name: '🔑 Inquilino', what: 'Ha le chiavi. Non è più un lead: è il tuo fatturato ricorrente.' },
    { name: '🏠 Proprietario', what: 'Chi ti affida un immobile, attuale o potenziale.' },
    { name: '🏢 Azienda / Ente', what: 'HR, università, ricerca. Voce diversa, tempi diversi.' },
    { name: '❄️ Richiamare', what: 'Non ora ma reale. Con la data nella nota: senza data non richiami nessuno.' },
    { name: '🇷🇪 Réunion', what: 'Secondo mercato: non deve mai finire nei messaggi su Roma.' },
  ];

  // ---------------------------------------------------------------------------
  // LIBRERIA LINK — ogni indirizzo qui sotto esiste sul sito (i test lo verificano)
  // ---------------------------------------------------------------------------
  const LINKS = [
    { group: 'Case e visite', path: '/apartments', what: 'Il catalogo live, con filtri per zona, budget e data' },
    { group: 'Case e visite', path: '/board', what: 'Il tabellone: stato di ogni casa a colpo d\'occhio' },
    { group: 'Case e visite', path: '/apartments-in', what: 'I quartieri, con com\'è viverci' },
    { group: 'Case e visite', path: '/skyline', what: 'La mappa 3D: Roma vista dall\'alto, casa per casa' },
    { group: 'Case e visite', path: '/book', what: 'Prenotazione visita (di persona o video) sugli slot veri' },
    { group: 'Case e visite', path: '/book?zone=pigneto', what: 'Come sopra, ma già sul quartiere (cambia il nome della zona)' },
    { group: 'Case e visite', path: '/booking', what: 'Il modulo di candidatura con caricamento documenti' },

    { group: 'Come funziona e prezzi', path: '/how-it-works', what: 'I passi dal primo messaggio alle chiavi' },
    { group: 'Come funziona e prezzi', path: '/your-money', what: 'Ogni euro spiegato: canone, deposito, commissione 10%' },
    { group: 'Come funziona e prezzi', path: '/faq', what: 'Le domande ricorrenti, già risposte' },
    { group: 'Come funziona e prezzi', path: '/about', what: 'Chi siamo — da mandare a chi diffida' },
    { group: 'Come funziona e prezzi', path: '/contact', what: 'Tutti i modi per raggiungerci' },
    { group: 'Come funziona e prezzi', path: '/deals', what: 'Promozioni e offerte in corso' },

    { group: 'Servizi a pagamento', path: '/services', what: 'Tutti i servizi con il prezzo, su una pagina' },
    { group: 'Servizi a pagamento', path: '/property-finding', what: 'Cerchiamo noi in tutta Roma — €350, rimborsati se non troviamo' },
    { group: 'Servizi a pagamento', path: '/virtual-viewing', what: 'Visita video su qualsiasi annuncio — €89' },
    { group: 'Servizi a pagamento', path: '/remote-move-pack', what: 'Chiudere da fuori Italia — €299' },
    { group: 'Servizi a pagamento', path: '/contract-check', what: 'Controllo contratto GRATIS (il gancio migliore)' },
    { group: 'Servizi a pagamento', path: '/contract-check-express', what: 'Verdetto scritto in 24h — €49' },
    { group: 'Servizi a pagamento', path: '/deal-assistance', what: 'Revisione clausola per clausola e trattativa — €249' },
    { group: 'Servizi a pagamento', path: '/deposit-recovery', what: 'Recupero del deposito — €99 + 20% sul recuperato' },
    { group: 'Servizi a pagamento', path: '/deposit-letter', what: 'Diffida per il deposito, GRATIS e automatica' },
    { group: 'Servizi a pagamento', path: '/concierge', what: 'Codice fiscale, utenze, SIM, residenza — da €15' },

    { group: 'Guide gratuite', path: '/welcome-to-rome', what: 'La guida di sopravvivenza per chi arriva' },
    { group: 'Guide gratuite', path: '/moving-to-rome', what: 'Costi reali per quartiere e tempi dei documenti' },
    { group: 'Guide gratuite', path: '/moving-to-rome-from-us', what: 'Versione per americani (visti, banca)' },
    { group: 'Guide gratuite', path: '/moving-to-rome-from-uk', what: 'Versione per britannici (post-Brexit)' },
    { group: 'Guide gratuite', path: '/moving-to-rome-from-germany', what: 'Versione per tedeschi' },
    { group: 'Guide gratuite', path: '/blog-scam-bible', what: 'Come non farsi truffare a Roma — il pezzo più condiviso' },
    { group: 'Guide gratuite', path: '/blog-tenant-rights', what: 'I diritti dell\'inquilino in Italia' },
    { group: 'Guide gratuite', path: '/blog-cost-calculator', what: 'Quanto costa vivere a Roma, davvero' },
    { group: 'Guide gratuite', path: '/blog-neighborhood-guide', what: 'I quartieri messi a confronto' },
    { group: 'Guide gratuite', path: '/blog-visa-residency', what: 'Visti e residenza' },
    { group: 'Guide gratuite', path: '/blog-contract-types', what: 'I tipi di contratto italiani spiegati' },
    { group: 'Guide gratuite', path: '/blog', what: 'Tutte le guide' },

    { group: 'Proprietari', path: '/owners', what: 'La pagina per i proprietari (italiano)' },
    { group: 'Proprietari', path: '/canone', what: 'Calcolo canone concordato — gratis' },
    { group: 'Proprietari', path: '/pacchetto-concordato', what: 'Il concordato chiavi in mano — €349' },

    { group: 'Aziende, enti, altri mercati', path: '/corporate', what: 'Aziende che spostano personale' },
    { group: 'Aziende, enti, altri mercati', path: '/executive', what: 'Professionisti in trasferta (ONU, ambasciate)' },
    { group: 'Aziende, enti, altri mercati', path: '/universities', what: 'Università e international office' },
    { group: 'Aziende, enti, altri mercati', path: '/research', what: 'Ricercatori ERC / Marie-Curie — da €690' },
    { group: 'Aziende, enti, altri mercati', path: '/partners', what: 'Tutto ciò che facciamo per le organizzazioni' },
    { group: 'Aziende, enti, altri mercati', path: '/reunion', what: 'La Réunion (francese) — ?role=owner|tenant|buyer' },
    { group: 'Aziende, enti, altri mercati', path: '/match', what: 'Quiz "quale quartiere è per te" (italiano)' },

    { group: 'Clienti e inquilini', path: '/casa', what: 'La pagina dell\'inquilino: canoni, ricevute, documenti, manuale' },
    { group: 'Clienti e inquilini', path: '/refer', what: 'Referral: €50 a chi presenta, €50 a chi arriva' },
    { group: 'Clienti e inquilini', path: '/login', what: 'Accesso a tutte le aree riservate' },
  ];

  // ---------------------------------------------------------------------------
  // CONTROLLO (puro): quello che i test pretendono e la pagina mostra
  // ---------------------------------------------------------------------------
  const SC_RE = /^[a-z0-9]{2,25}$/;
  const PLACEHOLDER_RE = /\[[^\]]*\]/g;
  const LINK_RE = /https?:\/\/[^\s)]+/g;

  function linksIn(text) {
    return (String(text || '').match(LINK_RE) || []).map((u) => u.replace(/[.,;:]+$/, ''));
  }

  function placeholdersIn(text) {
    return (String(text || '').match(PLACEHOLDER_RE) || []);
  }

  // Un segnaposto valido si vede da lontano: MAIUSCOLO fra parentesi quadre.
  // "[nome]" o "[Data]" passerebbero inosservati dentro una frase e partirebbero.
  function badPlaceholders(text) {
    return placeholdersIn(text).filter((p) => {
      const inner = p.slice(1, -1);
      return !inner || inner !== inner.toUpperCase() || /[a-z]/.test(inner);
    });
  }

  function lint() {
    const errors = [];
    const warnings = [];
    const seen = new Map();

    // Il tetto dell'app vale per ciò che INSTALLI davvero. Una risposta in
    // PANCHINA (`bench`) resta nel mazzo — pagina e documento, si copia quando
    // serve — e non occupa uno slot. Senza questa distinzione ogni risposta
    // nuova dovrebbe uccidere una vecchia, e il catalogo smette di crescere
    // proprio quando i dati dicono che manca qualcosa.
    if (installed().length > LIMITS.total) {
      errors.push(`${installed().length} risposte da installare: l'app ne accetta ${LIMITS.total}`);
    }

    for (const r of REPLIES) {
      const id = `/${r.sc}`;
      if (!SC_RE.test(r.sc)) errors.push(`${id}: scorciatoia non valida (solo lettere e numeri minuscoli, max ${LIMITS.shortcut})`);
      if (seen.has(r.sc)) errors.push(`${id}: scorciatoia duplicata (già usata da "${seen.get(r.sc)}")`);
      seen.set(r.sc, r.title);
      if (!FAMILIES.some((f) => f.key === r.fam)) errors.push(`${id}: famiglia "${r.fam}" inesistente`);
      if (!r.title || !r.when) errors.push(`${id}: manca titolo o "quando usarla"`);
      const len = r.text.length;
      if (len > LIMITS.text) errors.push(`${id}: ${len} caratteri, il limite è ${LIMITS.text}`);
      else if (len > 900) warnings.push(`${id}: ${len} caratteri, vicino al limite`);
      const bad = badPlaceholders(r.text);
      if (bad.length) errors.push(`${id}: segnaposto non in maiuscolo ${bad.join(' ')}`);
      if (linksIn(r.text).length > 3) warnings.push(`${id}: più di 3 link, il messaggio sembra spam`);
    }

    for (const m of [GREETING, AWAY]) {
      if (m.text.length > LIMITS.autoMessage) {
        warnings.push(`"${m.title}": ${m.text.length} caratteri — l'app taglia i messaggi automatici molto prima delle risposte rapide, tienilo sotto ${LIMITS.autoMessage}`);
      }
      if (placeholdersIn(m.text).length) {
        errors.push(`"${m.title}": contiene un segnaposto, ma questo messaggio parte da solo e nessuno può riempirlo`);
      }
    }

    return { ok: errors.length === 0, errors, warnings };
  }

  // Tutti i link usati almeno una volta, risposte + libreria: è la lista che i
  // test confrontano con le rotte vere del sito.
  function allLinks() {
    const out = new Set();
    for (const r of REPLIES) linksIn(r.text).forEach((u) => out.add(u));
    for (const m of [GREETING, AWAY]) linksIn(m.text).forEach((u) => out.add(u));
    for (const l of LINKS) out.add(SITE + l.path);
    return [...out].sort();
  }

  /** Quelle che occupano davvero uno slot nel telefono (le altre: panchina). */
  function installed() { return REPLIES.filter(function (r) { return !r.bench; }); }

  return {
    SITE, LIMITS, FAMILIES, REPLIES, GREETING, AWAY, LABELS, LINKS, installed,
    linksIn, placeholdersIn, badPlaceholders, lint, allLinks,
  };
});
