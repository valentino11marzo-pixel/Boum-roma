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
    // RISCRITTE SULLA MISURA DELLA VOCE (agosto 2026, 29.255 messaggi veri).
    // Tre cose che i dati hanno detto e che hanno cambiato tutto:
    //  · metà dei messaggi dell'operatore sta sotto 17 caratteri, 3 su 4
    //    sotto 38: le versioni da 800 caratteri erano un muro, non una
    //    risposta. Qui si sta sotto i 400, e si va a capo poco.
    //  · nell'1% dei messaggi c'è un link: il link è un'ECCEZIONE che deve
    //    valere il tap, non la firma di ogni frase.
    //  · la mossa che chiude è CHIAMARE ("let me know when I can call you",
    //    11 volte fra i ripetuti). Quindi la proposta di chiamata sta nelle
    //    risposte d'apertura, non un invito a compilare qualcosa.
    // I sei messaggi che l'operatore già riscrive a mano ogni volta sono
    // diventati sei scorciatoie: sono le prime della lista.
    // ═══════════════════════════════════════════════════════════════════════

    {
      sc: 'enlead', fam: 'en', star: true,
      title: 'Ha scritto da un portale — apri e proponi la chiamata',
      when: 'Il tuo messaggio più ripetuto (11×): "you contacted us for X, let me know when I can call you". Chiamare è ciò che chiude, quindi si propone subito.',
      text: `Hello [NOME], Valentino from BOOM Rome — you wrote about [CASA].

Fastest way: tell me when I can call you for two minutes, I'll have everything ready (availability, real all-in price, documents).

Or here: zone, budget, move-in date.`,
    },
    {
      sc: 'engone', fam: 'en', star: true,
      title: 'Quella casa è andata — e non perdi la persona',
      when: 'Il tuo secondo ripetuto (13×). Una casa affittata è il momento in cui la gente sparisce: non si scusa, si chiedono le tre cose e si riparte.',
      text: `Hello [NOME] — you contacted us for [CASA]. That one has just been rented.

Tell me three things and I'll send what's really free today: zone, budget, move-in date.

Everything live: ${SITE}/apartments`,
    },
    {
      sc: 'enlink', fam: 'en', star: true,
      title: 'Mando l\'annuncio',
      when: 'Il tuo terzo ripetuto (15×). Aggiunge in una riga il perché quel link vale più di un altro, e chiude con la visita.',
      text: `Here it is: [LINK]

The price is all-in and the photos are ours — we walked the flat before publishing it.

Want to see it? In person, or live on video if you're not in Rome yet.`,
    },
    {
      sc: 'enserv', fam: 'en', star: true,
      title: 'Vendo un servizio — link col modulo e pagamento',
      when: 'Il tuo ripetuto numero uno (18×): "I send you the link of the service with the form, pay with Apple Pay". Qui è già scritto, ti resta da dire cosa ti serve da lui.',
      text: `Perfect. I'll send you the link with the form — you fill it in and pay right there (Apple Pay works): [LINK]

Before that I need [COSA TI SERVE].

As soon as it's in, we start: [QUANDO].`,
    },
    {
      sc: 'enblock', fam: 'en', star: true,
      title: 'Bloccare la casa — l\'ultimo passo prima del sì',
      when: 'Il tuo ripetuto (11×) nel momento che vale di più. La riga finale ("chiedi adesso") evita le domande dopo il pagamento, che sono quelle che fanno annullare.',
      text: `You have everything you need to decide, [NOME].

To block it: €300 hold — refundable, and deducted from what you owe. Then we prepare the agreement and the registered contract.

Anything unclear, ask me now: after the hold I'd rather you had no questions left.`,
    },
    {
      sc: 'enprice', fam: 'en', star: true,
      title: 'Quanto costa, tutto',
      when: 'La domanda che decide. Tutte le voci in quattro righe: chi ne nasconde una la fa scoprire dopo, e allora è una lite.',
      text: `All in, nothing hidden:

• Rent — the figure on the listing
• Deposit — refundable, we film the flat in and out
• Agency fee — 10% of the annual rent, once, only if you rent
• €300 to block a home — refundable, deducted from what you owe

Euro by euro: ${SITE}/your-money`,
    },
    {
      sc: 'endocs', fam: 'en', star: true,
      title: 'Documenti',
      when: 'La stessa lista per tutti, data in anticipo: è ciò che ti distingue dalle agenzie che aggiungono richieste dopo il sì.',
      text: `Same list for everyone, and nothing extra appears later:

• Passport
• Proof of income — contract, payslips, or enrolment letter
• A guarantor if your income isn't in Italy yet (there are alternatives, ask me)
• Codice fiscale — we get it for you if you don't have one

Phone photos are fine.`,
    },
    {
      sc: 'enwho', fam: 'en', star: true,
      title: 'Chi può abitarci: coppia, amici, figli, animali',
      when: 'Arriva spesso e non si può rispondere a caso: non prometti al posto del proprietario, e chiedi chi arriva.',
      text: `Depends on the flat, and I check the one you like before you commit:

• Couples and families — fine almost everywhere
• Friends sharing — where the layout really allows it
• Pets — always the owner's call, and I ask before you fall in love with a place

Who's coming? Adults, children, pets.`,
    },
    {
      sc: 'enbook', fam: 'en', star: true,
      title: 'Prenota la visita',
      when: 'Gli orari nel link sono quelli davvero liberi della tua settimana. E lasci aperta la chiamata, che per te funziona meglio.',
      text: `Viewing is free, about 30 minutes — in person, or live on video if you're not in Rome yet (I hold the camera, you tell me where to look).

Real free slots here: ${SITE}/book

Or tell me when I can call you and we fix it in a minute.`,
    },
    {
      sc: 'enabroad', fam: 'en', star: true,
      title: 'È all\'estero — la visita video (€89 se la casa non è nostra)',
      when: 'Il servizio che vendi 1 volta su 180 giorni, e i tuoi clienti sono quasi tutti fuori Italia. Il gratis apre, il pagato serve per le case degli altri.',
      text: `You don't need to be in Rome to sort this out.

• On our homes: live video viewing, free — you direct the camera
• On a flat that isn't ours: we go, film it and write you an honest report, red flags included. €89 → ${SITE}/virtual-viewing

Which one do you want seen first?`,
    },
    {
      sc: 'encheck', fam: 'en', star: true,
      title: 'Ha un contratto di qualcun altro in mano',
      when: 'Altro servizio quasi mai proposto (2 volte in 6 mesi). La prima lettura gratis apre la porta, ed è onesta: molti tornano per il resto.',
      text: `Don't sign an Italian lease nobody has read for you.

First read is free — I tell you what's unfair and what's missing: ${SITE}/contract-check

If you want it done properly: €49 for a written verdict in 24h, or €249 with landlord check and negotiation on your side.

Send me the PDF.`,
    },
    {
      sc: 'enfind', fam: 'en', star: true,
      title: 'Non abbiamo niente per lui — cerchiamo noi (€350)',
      when: 'Lo vendi già (49 volte), ed è il modo giusto di non perdere chi non trova casa da te. Da mandare SEMPRE prima di lasciarlo andare.',
      text: `Straight with you: nothing we have fits what you asked.

Two ways forward — I keep you first in line for [ZONA], or we hunt the whole city for you: €350, deducted when you sign, refunded if we don't find it.

${SITE}/property-finding

Which one?`,
    },
    {
      sc: 'itciao', fam: 'it', star: true,
      title: 'Apertura in italiano',
      when: 'Stessa struttura, altra lingua: tre informazioni e la proposta di chiamata.',
      text: `Ciao [NOME], sono Valentino di BOOM Rome.

Dimmi zona, budget e da quando ti serve: ti mando quello che è davvero libero.

${SITE}/apartments

Oppure dimmi quando posso chiamarti due minuti.`,
    },
    {
      sc: 'prciao', fam: 'pr', star: true,
      title: 'Primo contatto col proprietario',
      when: 'Dice subito CHI porti in casa sua, e aggancia il concordato — che è il motivo per cui un proprietario ti richiama.',
      text: `Buongiorno [NOME], sono Valentino di BOOM (Egidi Immobiliare).

Affittiamo a stranieri di fascia alta a Roma — professionisti in trasferta, personale ONU e ambasciate — e gestiamo tutto: selezione, contratto registrato, incassi, scadenze.

Mi dice zona, metri quadri e se è arredato? Le dico a quanto si affitta davvero. E col canone concordato la cedolare scende al 10%: ${SITE}/canone`,
    },

    {
      sc: 'enfeat', fam: 'en', star: true,
      title: 'Arredato? lavatrice, aria, ascensore',
      when: '95 conversazioni nella misura. Non elencare a memoria: la pagina è sempre aggiornata, e tu chiedi quali due contano davvero.',
      text: `Everything inside a flat is on its page — furniture, appliances, heating, lift, balcony — with our own photos: ${SITE}/apartments

Most of ours come furnished and ready to live in. If something isn't written there, ask me: I check, I don't guess.

Air conditioning, lift, washing machine — which are must-haves for you?`,
    },

    // ── NEL MAZZO (non occupano uno slot: si copiano da /risposte) ─────────
    {
      sc: 'enres', fam: 'en', bench: true,
      title: 'Posso prendere la residenza?',
      when: 'Rara ma decisiva per chi la chiede (tessera sanitaria, permesso). Meglio dirlo prima della firma che scoprirlo dopo.',
      text: `Yes — and it's worth it: residency opens the tessera sanitaria and a lot of ordinary life here.

Two things make it smooth: a contract registered with the Agenzia delle Entrate (ours always are), and the owner knowing from the start. We put it on the table before signing.

If it's essential for you, tell me now.`,
    },
    {
      sc: 'endeal', fam: 'en', bench: true,
      title: 'Si può trattare sul prezzo',
      when: 'Una risposta netta e uguale per tutti vale più di uno sconto: dice che il prezzo non dipende da quanto insisti.',
      text: `Straight with you: on our own homes the listed price is what the owner agreed to publish, so there's rarely room on the rent itself — I'd rather be boring than quote you one number and the next person another.

Where there sometimes is room: a longer stay, the move-in date, what's included.

Your real budget and dates?`,
    },
    {
      sc: 'enconc', fam: 'en', bench: true,
      title: 'Burocrazia: codice fiscale, utenze, SIM, residenza',
      when: 'Lo nomini già 39 volte: è il servizio che i tuoi clienti capiscono al volo.',
      text: `The bureaucracy is the part that breaks people. We do it for you: codice fiscale (remotely, before you land), electricity and gas in your name, internet, SIM, residency, health card.

Single tasks from €15, the whole landing from €390: ${SITE}/concierge

Which one do you need first?`,
    },
    {
      sc: 'endep', fam: 'en', bench: true,
      title: 'Deposito trattenuto (lettera gratis o €99)',
      when: 'Anche a chi non è mai stato cliente: risolve un torto che nessuno gli risolve, e il passaparola vale più del servizio.',
      text: `Italian law is on your side — art. 1590 c.c., 15 days to answer.

Free: generate the formal demand letter yourself → ${SITE}/deposit-letter

Or we handle it: €99 to start, then 20% only on what we actually recover → ${SITE}/deposit-recovery

How much are they holding, and why do they say so?`,
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
      sc: 'entrust', fam: 'en', bench: true,
      title: '"Come faccio a fidarmi?"',
      when: 'La diffidenza è sana, Roma è piena di truffe. Dagli gli strumenti per controllarti invece di offenderti.',
      text: `Fair question — check us in two minutes:

• Egidi Immobiliare S.r.l., VAT 17322991005 — licensed Rome agency
• 4.9★ on Google, real tenants
• Every contract registered with the Agenzia delle Entrate, every payment by Stripe with a receipt in your name

And the rule: we never ask for cash, or a transfer to a private person.`,
    },
    {
      sc: 'enpay', fam: 'casa', bench: true,
      title: 'Come si paga il canone',
      when: 'Primo mese e ogni volta che lo chiedono. Spingi bonifico o addebito: costano meno e non si dimenticano.',
      text: `Everything about your rent — invoices, receipts, the button to pay: ${SITE}/casa

Three ways: card (instant), bank transfer (free, the page shows the details and the reference), or automatic SEPA debit — you authorise once and it collects itself.

Want me to set the automatic one up?`,
    },
    {
      sc: 'enfix', fam: 'casa', bench: true,
      title: 'Guasto in casa',
      when: 'Le tre domande evitano il ping-pong e ti dicono subito se devi muoverti oggi.',
      text: `Sorry about that. Send me:
1. A photo or a short video
2. Which room
3. Is it urgent — no water, no heating, no power, a leak = I move today

You can also file it from ${SITE}/casa so it gets a ticket.

If it's urgent, call me.`,
    },
    {
      sc: 'enrev', fam: 'casa', bench: true,
      title: 'Chiedere la recensione',
      when: 'Da mandare quando è contento e ha già le chiavi. Mai a chi ha un problema aperto.',
      text: `[NOME], one small favour — worth more than any advertising for us.

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

No catch, no expiry — and they get the same treatment you got.`,
    },
    {
      sc: 'itcosti', fam: 'it', bench: true,
      title: 'I costi in italiano',
      when: 'Quando chiede i numeri e scrive in italiano.',
      text: `Tutto compreso, senza sorprese:

• Canone — quello scritto sull'annuncio
• Deposito — restituito alla fine, filmiamo la casa all'ingresso e all'uscita
• Commissione — 10% del canone annuo, una volta sola e solo se firmi
• €300 per bloccare — rimborsabili e scalati

Il dettaglio: ${SITE}/your-money`,
    },
    {
      sc: 'prpack', fam: 'pr', bench: true,
      title: 'Pacchetto canone concordato (€349)',
      when: 'Dopo il calcolo, quando ha visto il risparmio ma non ha voglia della pratica. Che è sempre.',
      text: `Il concordato conviene, la pratica è noiosa: verifica del canone, contratto conforme, attestazione, registrazione RLI.

La facciamo noi: €349 una volta sola, rimborso integrale se l'immobile non può rientrare in fascia.

${SITE}/pacchetto-concordato

Se vuole glielo calcolo sui suoi numeri.`,
    },
    {
      sc: 'azimpresa', fam: 'az', bench: true,
      title: 'Aziende che spostano personale',
      when: 'HR o mobility manager: si parla di fattura e di persone che atterrano, non di visite.',
      text: `For companies moving people to Rome: one contact, verified homes, compliant leases in English, one VAT invoice from an Italian company — the document expense reports ask for.

${SITE}/corporate

How many people, and when do they land?`,
    },
    {
      sc: 'opsign', fam: 'op', bench: true,
      title: 'Invito alla firma',
      when: 'Col link Magic Sign. L\'ultima riga ti evita le correzioni dopo la registrazione.',
      text: `[NOME], the contract is ready to sign — no printer, no appointment: [LINK]

Read it (it's in English, the terms are the ones we agreed) and sign with your finger. You'll get the signed PDF by email the moment both sides are done.

Anything to change, tell me BEFORE you sign.`,
    },
    {
      sc: 'oppay', fam: 'op', bench: true,
      title: 'Link di pagamento',
      when: 'Per una rata o una fattura: il link resta valido nel tempo, si può aprire anche dopo.',
      text: `[NOME], here's the secure link to pay [COSA] — [IMPORTO]: [LINK]

Stripe page in your name, receipt in your inbox in seconds. The link stays valid, so you can also open it later.

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
