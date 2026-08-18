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
    // LA DOTTRINA — perché ogni messaggio è costruito così.
    //
    //  1. Non si vende il servizio: si vende COSA SAPRAI DOMANI. Nessuno
    //     compra una "visita virtuale": compra il non mandare tremila euro a
    //     uno sconosciuto fidandosi delle sue fotografie.
    //  2. L'ancora è la PERDITA, non il prezzo. €49 non si confronta con
    //     zero: si confronta con la clausola d'uscita che non hai letto.
    //  3. Il prezzo sparisce dentro una transazione che il cliente sta già
    //     facendo — scalato dalla commissione, rimborsato se non consegniamo.
    //     Non sta spendendo: sta spostando.
    //  4. La prova è un MECCANISMO, mai un aggettivo. "Filmiamo la casa
    //     all'ingresso e all'uscita" è una prova; "agenzia affidabile" è
    //     rumore che chiunque può scrivere.
    //  5. Una porta sola, aperta una volta. Chi insiste non è premium.
    //  6. Generosità asimmetrica: il primo passo è gratis e vale davvero
    //     (la lettura del contratto, la visita video sulle nostre case),
    //     altrimenti quello a pagamento sa di esca.
    //  7. Prima persona singolare. "Noi" è un ufficio; "io" è qualcuno che
    //     risponde del risultato.
    //
    // `sell` dichiara che porta apre ogni messaggio e su cosa è ancorata:
    // serve a te per scegliere in due secondi, e al test per pretendere che
    // ogni servizio a pagamento abbia la SUA porta, col prezzo e la garanzia.
    // ═══════════════════════════════════════════════════════════════════════

    {
      sc: 'enlead', fam: 'en', star: true,
      title: 'Primo contatto — la telefonata',
      when: 'Chi scrive da un portale. Non elenca, non si presenta: offre in due minuti quello che nessun annuncio può dare, e mette in conto anche il no.',
      sell: { service: null, anchor: 'un\'altra sera passata a confrontare annunci' },
      text: `[NOME], I'm Valentino — I run BOOM Rome, and [CASA] is one of ours.

Before you spend another evening comparing listings: I've walked that flat. I know how quiet it is at night, what the street does on a Saturday morning, and which of the photos flatters it.

Two minutes on the phone today and you'll know whether it deserves your time — including if the answer is no.

When suits you?`,
    },
    {
      sc: 'engone', fam: 'en', star: true,
      title: 'Quella casa è andata',
      when: 'Il vicolo cieco che fa sparire la gente. Si dice la verità sul mercato e si offre qualcosa che vale più del link: essere avvisato prima degli altri.',
      sell: { service: null, anchor: 'restare a sperare su una casa già presa' },
      text: `[NOME], that one went — and I'd rather tell you now than let you keep hoping.

Rome moves quickly in this season: a good flat is taken in about a day, often before it's public.

So let me do something more useful than sending you a link. Tell me three things — zone, budget, month — and you'll hear from me before the next one is published.

${SITE}/apartments`,
    },
    {
      sc: 'enprice', fam: 'en', star: true,
      title: 'Ogni euro, compresi quelli che tornano',
      when: 'La domanda che decide. La trasparenza totale qui è una mossa di posizionamento: l\'ultima riga fa il lavoro competitivo senza nominare nessuno.',
      sell: { service: null, anchor: 'le voci che le altre agenzie ti dicono dopo' },
      text: `Here is every euro, including the ones that come back to you.

Rent: exactly what the listing says. Nothing appears later.
Deposit: yours. I film the flat on the way in and on the way out, so its condition is never a matter of opinion.
My fee: 10% of the year, once, and only if you actually move in.
€300 to hold a home: refundable, and deducted from the above.

The arithmetic in full: ${SITE}/your-money

If an agency won't put this list in writing, that tells you what you need to know.`,
    },
    {
      sc: 'endocs', fam: 'en', star: true,
      title: 'Documenti — la stessa lista per tutti',
      when: 'Qui la paura vera è la discriminazione, non la burocrazia. La prima riga la disinnesca, ed è il motivo per cui questo messaggio si ricorda.',
      sell: { service: null, anchor: 'la paura di essere trattato diversamente' },
      text: `The same list for everyone. Nobody is asked for more because of the passport they hold.

Passport. Proof of income — work contract, payslips, or your enrolment letter. A guarantor if your income isn't Italian yet: and if you haven't got one, tell me, because there are other ways and I'll show you them.

No codice fiscale? I obtain it for you before you land.

Photos from your phone are fine, or use the secure form: ${SITE}/booking`,
    },
    {
      sc: 'enbook', fam: 'en', star: true,
      title: 'La visita',
      when: 'Mezz\'ora, nessun costo, nessun venditore. La promessa di dire "non fa per te" prima che si innamori è ciò che rende credibile tutto il resto.',
      sell: { service: null, anchor: 'una visita con qualcuno che deve venderti qualcosa' },
      text: `Half an hour, no cost, and no salesman in the room: you ask, I answer, and if the flat isn't right for you I'll say so before you like it too much.

In person, or live on video with you directing — I hold the phone and go where you point.

These are the times genuinely free in my week: ${SITE}/book

If it's easier, tell me when to call you.`,
    },
    {
      sc: 'enwho', fam: 'en', star: true,
      title: 'Chi può abitarci',
      when: 'Non si promette al posto del proprietario. La chiusura — "solo case che possono dire di sì" — vale più di qualunque rassicurazione generica.',
      sell: { service: null, anchor: 'innamorarsi di una casa che poi dice no' },
      text: `It depends on the flat, and I check it before you fall for the place — not after.

Couples and families: welcome in most of mine. Friends sharing: where the layout genuinely allows it, with everyone named on the contract, which protects you as much as the owner. Pets: the owner's decision, always — so I ask before you have to.

Tell me who's coming, adults and children and animals, and you'll only see homes that can say yes.`,
    },
    {
      sc: 'enfeat', fam: 'en', star: true,
      title: 'Cosa c\'è dentro casa',
      when: 'La pagina è sempre aggiornata, tu no. E la riga finale — non tiro a indovinare sulle cose con cui vivrai — è la differenza fra un\'agenzia e un portale.',
      sell: { service: null, anchor: 'scoprire dopo la firma cosa mancava' },
      text: `Each flat lists exactly what's inside — furniture, appliances, heating, lift, terrace — and the photographs are mine, taken the day I walked it. You're looking at the flat, not at a render.

${SITE}/apartments

If something isn't written there, ask me and I'll call the owner. I don't guess about the things you'll be living with.`,
    },
    {
      sc: 'enabroad', fam: 'en', star: true,
      title: 'È lontano → la visita video (€89 sulle case altrui)',
      when: 'L\'ancora è il deposito che sta per mandare a uno sconosciuto, non il prezzo del servizio. Gratis sulle nostre, a pagamento sulle altrui: la scala è onesta.',
      sell: { service: 'virtual-viewing', anchor: 'migliaia di euro impegnati sulle fotografie di uno sconosciuto' },
      text: `You're about to commit thousands of euro to a flat you have only seen in someone else's photographs. That is the real risk here — not the rent.

On my homes I walk you through it live, free, whenever you're awake.

On a flat that isn't mine I go in person: filmed for you, plus a written report of what the photos hid. €89, within 48 hours, credited back against my fee if you rent through me, refunded if I can't get in.

${SITE}/virtual-viewing`,
    },
    {
      sc: 'encheck', fam: 'en', star: true,
      title: 'Il contratto di un altro → lettura gratis, poi €49 / €249',
      when: 'Si ancora sulla clausola d\'uscita, non sul prezzo. La lettura gratis è generosità vera: chi ha paura di firmare torna sempre.',
      sell: { service: 'contract-check-express', anchor: 'un contratto facile da firmare e difficile da lasciare' },
      text: `Send it to me before you sign. The first read costs you nothing and takes me twenty minutes.

An Italian lease is easy to sign and hard to leave. The clauses that hurt are the ones on exit, deposit and repairs — and they are never where you'd think to look.

Written verdict within 24 hours: €49. Ownership verified and the negotiation handled by me: €249 — less than a month's rent, and it is the month you would otherwise lose.

${SITE}/contract-check`,
    },
    {
      sc: 'enfind', fam: 'en', star: true,
      title: 'Niente fa per lui → cerco io (€350)',
      when: 'Il rifiuto onesto in apertura è ciò che rende credibile l\'offerta che segue. Due porte, una gratis e una a pagamento, e si sceglie lui.',
      sell: { service: null, anchor: 'continuare a cercare da solo su annunci che spariscono in un giorno' },
      text: `Nothing I have right now is right for you, and I won't pretend otherwise to keep the conversation going.

Two ways from here. I keep your brief and you hear from me before the next flat is published — no charge, no expiry.

Or I go and find it: the whole market, plus what never reaches the portals, every option checked by a person before it reaches you. €350, deducted from my fee when you sign, refunded in full if I don't deliver.

${SITE}/property-finding`,
    },
    {
      sc: 'enconc', fam: 'en', star: true,
      title: 'L\'arrivo (da €15 · tutto da €390)',
      when: 'Non si vende un servizio: si nomina la settimana che li aspetta. "In italiano, di persona, in uffici che chiudono a mezzogiorno" fa tutto il lavoro.',
      sell: { service: 'movein-pack', anchor: 'il primo mese consumato negli uffici invece che a Roma' },
      text: `The flat is the easy part. What ruins people's first month here is the codice fiscale, the utilities in your name, the residency appointment and the health card — in Italian, in person, in offices that close at midday.

I take that off your hands while you're still packing. Single items from €15; the whole landing handled from €390, with one person on WhatsApp for your first month.

${SITE}/concierge

Which of them worries you most?`,
    },
    {
      sc: 'enblock', fam: 'en', star: true,
      title: 'Chiudere',
      when: 'Il momento che vale di più. L\'ultima riga — meglio perdere un\'ora oggi che farti firmare con un dubbio — è ciò che impedisce i ripensamenti dopo il pagamento.',
      sell: { service: null, anchor: 'firmare con un dubbio in testa' },
      text: `[NOME], you have everything you need — and for what my opinion is worth, this is the one.

€300 holds it: refundable, deducted from what you owe, and the flat comes off the market. Nobody views it after you.

Then the agreement, the registered contract, and the keys on your date.

If anything is still unclear, ask me now. I would rather lose an hour today than have you sign with a doubt.`,
    },
    {
      sc: 'itciao', fam: 'it', star: true,
      title: 'Primo contatto in italiano',
      when: 'Niente listino: tre domande e una promessa che si può verificare — il prezzo definitivo, non quello da cui si parte.',
      sell: { service: null, anchor: 'i prezzi "da" che poi crescono' },
      text: `[NOME], sono Valentino, BOOM Rome.

Prima di mandarti un listino: dimmi zona, budget e da quando ti serve. Ti mando solo case che ho visto di persona, con il prezzo definitivo — non quello da cui si parte.

${SITE}/apartments

Se preferisci, dimmi quando posso chiamarti: in due minuti capiamo se ha senso.`,
    },
    {
      sc: 'prciao', fam: 'pr', star: true,
      title: 'Primo contatto col proprietario',
      when: 'A un proprietario non interessa il servizio: gli interessa CHI entra in casa sua e se paga. La riga sulla ricevuta chiesta dal datore vale l\'intero messaggio.',
      // La porta del pacchetto è /prpack: qui si apre col calcolo GRATIS, che è
      // il primo passo della scala. Dichiarare di vendere il pacchetto in un
      // messaggio che non ne dice il prezzo è la bugia che il test ha preso.
      sell: { service: null, anchor: 'un inquilino sbagliato e mesi di sfitto' },
      text: `Buongiorno [NOME], sono Valentino di BOOM — Egidi Immobiliare.

Affittiamo a chi sceglie Roma per lavoro: professionisti in trasferta, personale ONU e ambasciate, ricercatori. Persone che pagano puntuali anche perché il datore di lavoro chiede la ricevuta.

Selezione documentata, contratto registrato, incassi tracciati e scadenze seguite da noi: lei riceve un rendiconto il primo del mese.

Mi dica zona, metri quadri e se è arredato: le dico a quanto si affitta davvero. ${SITE}/canone`,
    },

    // ── NEL MAZZO ──────────────────────────────────────────────────────────
    {
      sc: 'entrust', fam: 'en', bench: true,
      title: '"Come faccio a fidarmi?"',
      when: 'Domanda sana in una città piena di truffe. Si risponde con verifiche che può fare senza di te, e con la regola che ti costa dire.',
      sell: { service: null, anchor: 'la truffa che tutti conoscono per sentito dire' },
      text: `A fair question, and here's how to answer it without taking my word for anything.

Egidi Immobiliare S.r.l., VAT 17322991005 — look it up. Every contract registered with the Agenzia delle Entrate. Every payment through Stripe, receipt in your name, never to a person.

And the rule that costs me money and protects you: no cash, ever, and nothing is paid before you have read the terms in writing.`,
    },
    {
      sc: 'endep', fam: 'en', bench: true,
      title: 'Deposito trattenuto — lettera gratis, poi €99',
      when: 'Anche a chi non è mai stato cliente. Si regala lo strumento che risolve il 70% dei casi; chi ha bisogno di più torna, e intanto racconta di te.',
      sell: { service: 'deposit-recovery', anchor: 'un deposito dato per perso' },
      text: `Italian law is on your side more than people think: article 1590 of the Civil Code, and fifteen days for them to answer.

Most landlords pay when the letter arrives written properly. So take it, free, and send it yourself: ${SITE}/deposit-letter

If they don't move, I take it from there — €99 to start, then 20% only of what actually comes back.

How much are they holding, and what reason did they give you?`,
    },
    {
      sc: 'enres', fam: 'en', bench: true,
      title: 'Residenza',
      when: 'Rara, ma per chi la chiede decide tutto. E si dice prima della firma, perché dopo non si sistema.',
      sell: { service: null, anchor: 'scoprire dopo il trasloco che la residenza non si può prendere' },
      text: `Yes — and it matters more than people expect: the health card, and half of ordinary life here, hang on it.

Two conditions make it straightforward, and both are normal with me: a contract registered with the Agenzia delle Entrate, and an owner who knows from the start.

If residency is essential for you, say so before we sign. On a few flats it is complicated, and you should hear that from me now rather than in three months.`,
    },
    {
      sc: 'endeal', fam: 'en', bench: true,
      title: 'Trattativa',
      when: 'Il prezzo uguale per tutti è una posizione, non una rigidità: dice che non paghi il fatto di non saper insistere.',
      sell: { service: null, anchor: 'pagare più del vicino per non aver contrattato' },
      text: `On my own homes the price is the price the owner agreed to publish — and I'd rather be dull than quote one number to you and another to the next person.

Where there is room, sometimes: a longer stay, a move-in date that suits an empty flat, or what's included in it.

Tell me your real budget and your dates and I'll tell you honestly whether anything can move.`,
    },
    {
      sc: 'enlink', fam: 'en', bench: true,
      title: 'Mando l\'annuncio',
      when: 'Quando gli mandi una casa precisa. Una riga di prova, e la visita proposta subito.',
      sell: { service: null, anchor: 'un altro link fra i venti che sta guardando' },
      text: `Here it is: [LINK]

The price is final and the photographs are mine — I walked it before publishing it.

Shall I show it to you? In person, or live on video if you're not in Rome yet.`,
    },
    {
      sc: 'enserv', fam: 'en', bench: true,
      title: 'Mando il link di un servizio',
      when: 'Il tuo messaggio più ripetuto: il modulo e il pagamento. Qui è già scritto, resta da dire cosa ti serve da lui e quando si parte.',
      sell: { service: null, anchor: null },
      text: `Here's the link — the form takes two minutes and you can pay straight from it: [LINK]

Before I start I need [COSA TI SERVE].

The moment it's in, we begin: [QUANDO].`,
    },
    {
      sc: 'enpay', fam: 'casa', bench: true,
      title: 'Come si paga il canone',
      when: 'Primo mese e ogni volta che lo chiedono. L\'addebito automatico conviene a entrambi: nessuno se lo dimentica più.',
      sell: { service: null, anchor: 'il canone dimenticato e il sollecito imbarazzante' },
      text: `Everything about your rent lives in one place — invoices, receipts, and the button to pay: ${SITE}/casa

Card, if you want it done now. Bank transfer, free, with the reference already written for you. Or automatic debit: you authorise once and it collects itself before each due date.

Want me to set the automatic one up? Then neither of us thinks about it again.`,
    },
    {
      sc: 'enfix', fam: 'casa', bench: true,
      title: 'Guasto in casa',
      when: 'Tre domande e sai se devi muoverti oggi. La riga finale evita che aspetti una risposta scritta mentre l\'acqua scende.',
      sell: { service: null, anchor: null },
      text: `Sorry about that. Three things and I can act today:

1. A photo or a short video
2. Which room
3. Whether it's urgent — no water, no heating, no power or a leak means I move today

You can also open it from ${SITE}/casa so it has a ticket and a history.

If it's urgent, call me. Don't wait for a written reply.`,
    },
    {
      sc: 'enrev', fam: 'casa', bench: true,
      title: 'La recensione',
      when: 'Quando è contento e ha le chiavi da qualche settimana. Mai a chi ha un problema aperto.',
      sell: { service: null, anchor: null },
      text: `[NOME], one favour, and it's worth more to me than any advertising.

If I did right by you, two lines on Google help the next person trust an agency they have never met — which, in this city, is not a small thing.

https://g.page/r/CfcpUptbNnvZEBM/review

And if anything wasn't right, tell me first. I'd rather fix it than read it.`,
    },
    {
      sc: 'enrefer', fam: 'casa', bench: true,
      title: 'Referral (€50 + €50)',
      when: 'Nella stessa settimana della recensione, non nello stesso messaggio.',
      sell: { service: null, anchor: null },
      text: `If someone you know is moving to Rome, send them to me: you both get €50 when they rent.

${SITE}/refer

No catch and no expiry — and they get exactly the treatment you got.`,
    },
    {
      sc: 'itcosti', fam: 'it', bench: true,
      title: 'I costi in italiano',
      when: 'Stessa trasparenza, altra lingua.',
      sell: { service: null, anchor: 'le voci che si scoprono alla firma' },
      text: `Ogni euro, compresi quelli che tornano indietro.

Canone: quello scritto sull'annuncio. Dopo non compare nient'altro.
Deposito: suo. Filmo la casa il giorno dell'ingresso e il giorno dell'uscita, così non è questione di opinioni.
Commissione: 10% del canone annuo, una volta sola e solo se entra davvero.
€300 per bloccarla: rimborsabili e scalati da quanto sopra.

Il conto completo: ${SITE}/your-money`,
    },
    {
      sc: 'prpack', fam: 'pr', bench: true,
      title: 'Pacchetto concordato (€349)',
      when: 'Dopo il calcolo, quando ha visto il risparmio e non ha voglia della pratica.',
      sell: { service: 'concordato-pack', anchor: 'il 21% di tasse invece del 10%' },
      text: `Il vantaggio è la cedolare al 10% invece del 21%. Il fastidio sono verifica del canone, contratto conforme, attestazione e registrazione RLI.

Ce ne occupiamo noi: €349 una volta sola per immobile, rimborsati per intero se l'immobile non può rientrare in fascia.

${SITE}/pacchetto-concordato

Se mi manda i dati glielo calcolo sui suoi numeri, prima di decidere.`,
    },
    {
      sc: 'azimpresa', fam: 'az', bench: true,
      title: 'Aziende ed enti',
      when: 'HR e mobility manager: si parla di persone che atterrano e di fattura, mai di visite.',
      sell: { service: null, anchor: 'un dipendente che arriva e non ha dove dormire' },
      text: `For companies moving people to Rome: one contact, homes we have seen ourselves, compliant leases in English, and a single VAT invoice from an Italian company — the document your expense process actually needs.

${SITE}/corporate

How many people, and when do they land?`,
    },
    {
      sc: 'opsign', fam: 'op', bench: true,
      title: 'Invito alla firma',
      when: 'Col link Magic Sign. L\'ultima riga evita le correzioni dopo la registrazione.',
      sell: { service: null, anchor: null },
      text: `[NOME], the contract is ready — no printer and no appointment: [LINK]

Read it (English, and the terms are the ones we agreed), then sign with your finger. The signed PDF reaches you by email the moment both sides are done.

Anything you want changed, tell me before you sign: after registration it is a different conversation.`,
    },
    {
      sc: 'oppay', fam: 'op', bench: true,
      title: 'Link di pagamento',
      when: 'Per una rata o una fattura. Il link resta valido: si può aprire più tardi o da un altro telefono.',
      sell: { service: null, anchor: null },
      text: `[NOME], here is the secure link for [COSA] — [IMPORTO]: [LINK]

It's a Stripe page in your name and the receipt arrives in seconds. The link stays valid, so you can also open it later.

If a bank transfer is easier, say so and I'll send the details.`,
    },
  ];

  // ---------------------------------------------------------------------------
  // MESSAGGI AUTOMATICI (non sono risposte rapide: sono due impostazioni a sé)
  // ---------------------------------------------------------------------------
  const GREETING = {
    title: 'Messaggio di benvenuto',
    when: 'Parte da solo a chi ti scrive per la prima volta. Ha un compito: far arrivare le tre informazioni mentre tu dormi, e dire in sei parole perché non sei un portale.',
    text: `BOOM Rome — I'm Valentino. Tell me the zone, your budget and the month you need, and I'll send only flats I have walked myself: ${SITE}/apartments`,
  };

  const AWAY = {
    title: 'Messaggio di assenza',
    when: 'Fuori orario. Chi scrive alle 23 da un altro fuso deve trovare qualcosa di vero da fare, non una scusa.',
    text: `Out of hours here in Rome — I read everything and reply first thing. Meanwhile, the homes I have walked myself are here: ${SITE}/apartments`,
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
