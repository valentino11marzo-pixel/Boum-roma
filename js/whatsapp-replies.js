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
    { key: 'fr', label: 'La Réunion · Français', note: 'Secondo mercato. Mai proporre Roma a chi scrive dall\'isola.' },
    { key: 'op', label: 'Link personali', note: 'Le risposte che accompagnano un link generato dal portale o dal bot. Il testo è fisso, il link lo incolli.' },
  ];

  // ---------------------------------------------------------------------------
  // LE RISPOSTE
  // sc    = scorciatoia (si digita /sc nella chat) — senza slash, minuscole
  // when  = quando usarla, per te che scegli in due secondi
  // text  = il messaggio esatto che parte
  // ---------------------------------------------------------------------------
  const REPLIES = [

    // ======================= CLIENTE · ENGLISH ==============================
    {
      sc: 'enhi', fam: 'en', star: true,
      title: 'Prima risposta a chi scrive per una casa',
      when: 'Il messaggio numero uno, quello che manderai più di ogni altro. Chiude sempre chiedendo le tre cose senza cui non puoi lavorare.',
      text: `Hi [NOME], Valentino from BOOM Rome 👋

We're a licensed Rome agency (Egidi Immobiliare) renting verified homes to internationals — registered contracts in English, transparent prices, move-in as fast as 48 hours.

So I can send you real options instead of a random list, three things:
1. Zone, or the university/office you need to be near
2. Monthly budget
3. Move-in date and how many months

Everything live right now: ${SITE}/apartments

What are your three?`,
    },
    {
      sc: 'enhomes', fam: 'en', star: true,
      title: 'Il catalogo — tre modi di guardarlo',
      when: 'Chiede "cosa avete?". Non mandare mai uno screenshot: manda le pagine, si aggiornano da sole.',
      text: `Here's everything we actually have free right now, with real prices and availability dates:

${SITE}/apartments

Two other ways to look at the same homes:
• The live board, status of every flat: ${SITE}/board
• By neighbourhood, with what it's like to live there: ${SITE}/apartments-in

Every home on those pages has been walked by us in person — the photos are ours, not the landlord's.

Tell me the two you'd like to see and I'll check the times.`,
    },
    {
      sc: 'enprice', fam: 'en', star: true,
      title: 'Quanto costa davvero — tutti i numeri',
      when: 'La domanda che decide se resti o spariscono. Rispondi con tutti i numeri, subito: chi nasconde una voce la fa scoprire dopo, e allora è una lite.',
      text: `Straight numbers, nothing hidden:

• Monthly rent — exactly the figure on the listing
• Deposit — refundable, returned at the end. We film the flat in and out, so nobody argues about it later
• Agency fee — a flat 10% of the annual rent, once, and only if you actually rent
• €300 to lock a home — refundable, and it counts toward what you owe

The full breakdown, euro by euro: ${SITE}/your-money

Viewings are free. No file-opening fee, no monthly service charge, no fee to the landlord's cousin.`,
    },
    {
      sc: 'enbook', fam: 'en', star: true,
      title: 'Prenota la visita (di persona o in video)',
      when: 'Appena c\'è interesse su una casa. Il link mostra solo gli orari davvero liberi della tua settimana.',
      text: `Viewings are free and take about 30 minutes — in person with me, or live on video if you're not in Rome yet (I hold the camera, you tell me where to point it).

Pick a slot here:
${SITE}/book

The slot is held for you and I confirm within a few hours. If you want a specific home, open its page and book from there.`,
    },
    {
      sc: 'envideo', fam: 'en',
      title: 'Visita video su una casa NON nostra (€89)',
      when: 'Ha trovato un annuncio altrove e non è a Roma. Si vende da sé: la sola alternativa è fidarsi delle foto del proprietario.',
      text: `If the apartment isn't ours we can still go and see it for you: live video tour with you directing, a full HD photo set, and an honest written report — red flags included.

€89, scheduled within 48 hours. Credited to your agency fee if you end up renting through us, refunded in full if we can't get in.

${SITE}/virtual-viewing

Send me the listing link and I'll tell you if we can reach it this week.`,
    },
    {
      sc: 'endocs', fam: 'en', star: true,
      title: 'Che documenti servono',
      when: 'Prima o poi la chiedono tutti. Darla per intero e in anticipo è ciò che ti distingue: nessuna richiesta a sorpresa dopo il sì.',
      text: `What we need to approve you — the same list for everyone, and nothing extra appears later:

• Passport or ID
• Proof of income: work contract, payslips, or your enrolment letter if you're a student
• A guarantor, if your income isn't in Italy yet — there are alternatives, ask me
• Codice fiscale — if you don't have one, we get it for you remotely

Phone photos are fine, send them here whenever you like. And nothing is paid before you've read the contract.`,
    },
    {
      sc: 'enapply', fam: 'en',
      title: 'Come si chiude — i quattro passi',
      when: 'Gli piace una casa e chiede "e adesso?". Togli l\'ansia mostrando che è tutto online e in ordine.',
      text: `How it works from here — four steps, all online:

1. You see the home, in person or on video
2. A 2-minute eligibility check, then I send you the pre-agreement: the real terms, in English, on one page
3. You read it, fill in your details, sign with your finger, pay the hold by card
4. The registered contract arrives to e-sign. Keys on your date — as fast as 48 hours

The whole process step by step: ${SITE}/how-it-works

Where are you in this right now?`,
    },
    // ── LE QUATTRO NATE DALLA MISURA (1.004 conversazioni, agosto 2026) ──
    // Non erano nel catalogo scritto a ragionamento: le ha trovate il
    // misuratore, contando le domande vere. chi_abita da sola vale 255
    // conversazioni su 1.004 — una su quattro — ed era la buca più grande.
    {
      sc: 'enwho', fam: 'en', star: true,
      title: 'Chi può abitarci: coppia, amici, figli, animali',
      when: 'LA domanda più frequente dei tuoi clienti (255 conversazioni su 1.004). Non promette nulla al posto del proprietario: chiede chi arriva e sposta la conversazione sulla casa giusta.',
      text: `Good question, and the honest answer is: it depends on the flat, so I check the specific one before you commit to anything.

• Couples and families — fine on most of our homes. Everyone living there is named in the contract, as co-tenant or as declared occupant, so nobody ends up in a weak position later
• Friends sharing — possible where the layout genuinely allows it; I'll tell you which ones do
• Children — no problem, and I'll point out the flats with a lift and a quiet street
• Pets — never an automatic no, but always the owner's decision. I ask BEFORE you fall in love with a place, not after

Tell me who's coming — how many adults, children, pets — and I'll send you the homes that actually work for you, instead of a list to filter yourself.

Everything we have live: ${SITE}/apartments`,
    },
    {
      sc: 'enfeat', fam: 'en', star: true,
      title: 'Arredato? lavatrice, aria condizionata, ascensore',
      when: '95 conversazioni. Non elencare a memoria: manda la pagina (che è sempre aggiornata) e chiedi quali due o tre contano davvero per lui.',
      text: `Everything that's inside a flat is on its own page — furniture, appliances, heating, lift, balcony — with photos we took ourselves, so what you see is what you get:

${SITE}/apartments

Most of our homes are furnished and ready to live in, and the listing says exactly what's included. If something isn't written there, ask me: I'd rather check than guess.

The three that vary most from flat to flat are air conditioning, lift and washing machine. Which of them are must-haves for you? I'll filter on those before you spend time on a viewing.`,
    },
    {
      sc: 'endeal', fam: 'en',
      title: 'Si può trattare sul prezzo',
      when: '20 conversazioni. Una risposta netta e uguale per tutti vale più di uno sconto: dice che il prezzo non dipende da quanto insisti.',
      text: `Straight with you: on our own homes the listed price is what the owner agreed to publish, so there is rarely room on the rent itself — and I'd rather be boring than quote you one number and the next person another.

Where there sometimes IS room: a longer stay, a move-in date that suits a flat standing empty, or what's included in the price.

Tell me your real budget and your dates, and I'll tell you honestly whether anything can move — or show you what fits without a discount.

And if the flat is someone else's listing, negotiating it is exactly what we do for you: ${SITE}/deal-assistance`,
    },
    {
      sc: 'enres', fam: 'en',
      title: 'Posso prendere la residenza?',
      when: '17 conversazioni, e per chi la chiede è spesso decisiva (tessera sanitaria, permesso, vita normale). Meglio dirlo prima della firma che scoprirlo dopo.',
      text: `Short answer: yes, and it's worth doing — residency is what opens the tessera sanitaria (public health card) and a lot of ordinary life here.

Two things make it smooth, and both are normal for us: the contract has to be registered with the Agenzia delle Entrate (ours always are), and the owner has to know from the start. We put it on the table before signing, so it never becomes an argument six months in.

If residency is essential for you, tell me now: on a few flats the owner's own situation makes it complicated, and I'd rather say so upfront than let you find out after you've moved in.

The whole bureaucracy, step by step: ${SITE}/welcome-to-rome`,
    },
    {
      sc: 'enfind', fam: 'en',
      title: 'Property Finding — cerchiamo noi (€350)',
      when: 'Quando il catalogo non basta. Da usare SEMPRE prima di lasciarlo andare: è la differenza fra un no e un incarico.',
      text: `If nothing in our portfolio fits, we hunt the whole city for you.

Your brief becomes a live search: the entire Rome market plus the off-market we hear about first, scanned around the clock, and every match verified by a human before it reaches you. You swipe yes or no from your phone.

€350 flat — deducted from the agency fee when you sign, refunded if we don't find your home.

${SITE}/property-finding

Want me to set up your brief now?`,
    },
    {
      sc: 'enremote', fam: 'en',
      title: 'Chiudere da fuori Italia (€299)',
      when: 'Arriva a settembre e vuole la casa prima di atterrare. Il pacchetto che risolve la paura di firmare a distanza.',
      text: `Closing from abroad is how we normally work, not the exception.

Remote Move Pack — €299:
• Two live video viewings, you directing
• Your contract read clause by clause in English before you sign
• Landlord and ownership verified
• Negotiation on price and terms
• Arrival setup: utilities plan, codice fiscale guidance

Bought separately those services are €427+. Credited toward the agency fee if you take a BOOM home.

${SITE}/remote-move-pack`,
    },
    {
      sc: 'encheck', fam: 'en',
      title: 'Controllo del contratto (gratis · €49 · €249)',
      when: 'Ha un contratto in mano, di chiunque. Il livello gratuito apre la porta: molti tornano per il resto.',
      text: `Never sign an Italian lease nobody has read for you. Three levels:

• Free — send me the contract and I flag scams, unfair clauses and deposit traps: ${SITE}/contract-check
• €49 Express — written traffic-light verdict within 24 hours, credited in full if you upgrade
• €249 Deal Assistance — clause by clause, landlord verified, and we negotiate for you: ${SITE}/deal-assistance

Send the PDF here and I'll tell you which one you actually need.`,
    },
    {
      sc: 'endep', fam: 'en',
      title: 'Deposito trattenuto — lettera gratis o €99',
      when: 'Anche a chi non è mai stato cliente. È il servizio che genera passaparola: risolvi un torto che nessuno gli risolve.',
      text: `Landlord keeping your deposit? Italian law is on your side — art. 1590 of the Civil Code, with a formal 15-day deadline.

Free: generate the formal demand letter yourself, in correct Italian legal language, ready to sign and send: ${SITE}/deposit-letter

If you'd rather we handle it — demand, negotiation, escalation with partner lawyers: €99 to start, then 20% only on what we actually recover: ${SITE}/deposit-recovery

We're a licensed agency, not a law firm; for court we bring lawyers in.

How much are they holding, and what's their reason?`,
    },
    {
      sc: 'enconc', fam: 'en',
      title: 'Burocrazia e arrivo (da €15 · pacchetto da €390)',
      when: 'La parte che spaventa più dell\'affitto. Da mandare anche a chi la casa l\'ha già trovata altrove.',
      text: `The bureaucracy is the part that breaks people. We do it for you:

• Codice fiscale — remotely, before you land
• Electricity, gas and internet in your name
• SIM card, bank account, residency registration
• Tessera sanitaria (public health card)

Single tasks from €15; the whole landing handled from €390, with one human on WhatsApp for your first month.

${SITE}/concierge

Which of these do you need first?`,
    },
    {
      sc: 'enguide', fam: 'en', star: true,
      title: 'Le guide gratuite (fiducia, zero costo)',
      when: 'Chi è ancora freddo, o chiede consigli senza comprare. Regalare valore vero è il modo più economico di restare in testa.',
      text: `Free, no strings — this is what we'd tell a friend moving here:

• Welcome to Rome Kit: codice fiscale, residency, health card, SIM, bank, transport — ${SITE}/welcome-to-rome
• How not to get scammed renting in Rome — ${SITE}/blog-scam-bible

Real costs by neighbourhood and the documents timeline: ${SITE}/moving-to-rome

Read them before you talk to any agency, including us.`,
    },
    {
      sc: 'ennone', fam: 'en',
      title: 'Non abbiamo niente per lui (le tre uscite)',
      when: 'Mai dire solo "no". Un no nudo chiude la conversazione, un no con tre porte la tiene aperta per mesi.',
      text: `Being straight with you: nothing we have right now matches what you asked for.

Three options, pick any:
1. I put you on the waitlist for [ZONA / CASA] — our homes often free up months ahead, and the waitlist gets them first
2. Save your search on the apartments page and you'll get an email the day something fits: ${SITE}/apartments
3. We hunt the whole city for you — €350, refunded if we don't deliver: ${SITE}/property-finding

Which one?`,
    },
    {
      sc: 'enstud', fam: 'en',
      title: 'Studenti internazionali',
      when: 'LUISS, Sapienza, John Cabot, Roma Tre, LUMSA. Parla di tragitto e di contratto, che sono le due cose che contano.',
      text: `For a student in Rome, two things decide everything: the commute and the contract.

• Every home on our map shows the live travel time to LUISS, Sapienza, Roma Tre, John Cabot and LUMSA: ${SITE}/apartments
• The neighbourhoods described honestly — San Lorenzo for Sapienza, Trastevere for John Cabot, Trieste for LUISS: ${SITE}/apartments-in

Contracts are registered and in English, with your enrolment letter as the documented reason for the term.

Which university, and from when?`,
    },
    {
      sc: 'enexec', fam: 'en',
      title: 'Professionista in trasferta (ONU, ambasciate, aziende)',
      when: 'Chi arriva per lavoro 1–18 mesi. Qui la casa è il minimo: quello che compra è la carta che il datore accetta.',
      text: `Posted to Rome for work — that's the desk you're writing to.

The lease we use is the contratto transitorio (art. 5, law 431/98): 1 to 18 months, registered with the Agenzia delle Entrate, it ends on its date, and your assignment letter is the documented need it requires.

What your employer will ask for, and you'll have: registered lease in English, monthly rent receipts from your tenant portal, agency fees invoiced by an Italian company.

${SITE}/executive

Is the company paying, or you? The paperwork differs.`,
    },
    {
      sc: 'entrust', fam: 'en', star: true,
      title: '"Come faccio a fidarmi?" — la verifica in 2 minuti',
      when: 'La diffidenza è sana: Roma è piena di truffe. Non offenderti, dagli gli strumenti per controllarti.',
      text: `Fair question — here's how to check us in two minutes:

• Egidi Immobiliare S.r.l., VAT 17322991005 — a licensed Rome agency, not a middleman
• 4.9★ on Google, from real tenants
• Every contract registered with the Agenzia delle Entrate; every payment through Stripe, with a receipt in your name

And the rule that protects you: nothing is paid before you've read the terms in writing, and we never ask for cash or a transfer to a private person. If anyone ever does, it isn't us.

${SITE}/about`,
    },
    {
      sc: 'enwait', fam: 'en',
      title: '"Ci sto lavorando" — il messaggio che compra tempo',
      when: 'Quando non puoi rispondere bene adesso. Un\'attesa annunciata non è un\'attesa: il silenzio sì.',
      text: `Got it, [NOME] — give me [TEMPO] and I'll come back with a real answer instead of a guess. I need to check with the owner / on the ground.

If it's urgent, just write "urgent" and I'll jump it up the queue.`,
    },

    // ==================== INQUILINO IN CASA · ENGLISH =======================
    {
      sc: 'enpay', fam: 'casa',
      title: 'Come si paga il canone (le tre vie)',
      when: 'Primo mese e ogni volta che qualcuno chiede. Spingi il bonifico o l\'addebito automatico: ti costano meno e non si dimenticano.',
      text: `Everything about your rent lives in your own page — invoices, receipts, and the button to pay:

${SITE}/casa

Three ways, all fine:
• Card, from that page — instant, receipt in seconds
• Bank transfer — the page shows the account details and the reference code to copy. Free
• Automatic SEPA direct debit — you authorise it once and each instalment collects itself before the due date

Cheapest is the transfer, calmest is the direct debit. Want me to set the automatic one up?`,
    },
    {
      sc: 'enlate', fam: 'casa',
      title: 'Sollecito gentile (canone in ritardo)',
      when: 'Dopo qualche giorno. Il tono è tutto: chiedere invece di accusare tiene il rapporto e fa arrivare i soldi comunque.',
      text: `Hi [NOME], quick one — the [MESE] rent hasn't landed yet. It's probably already on its way or just late; I'd rather ask than assume.

You can settle it in a tap here: ${SITE}/casa

And if something has come up, tell me now: there's almost always a way to arrange it, and it's always better than silence.`,
    },
    {
      sc: 'enfix', fam: 'casa',
      title: 'Guasto o manutenzione',
      when: 'Prima segnalazione. Le tre domande evitano il ping-pong e ti dicono subito se devi muoverti oggi.',
      text: `Sorry about that. So it gets fixed fast, send me:
1. A photo or a short video of the problem
2. Which room
3. Whether it's urgent — no water, no heating, no power or a leak means urgent, and I move today

You can also file it from your page, so it enters our system with a ticket: ${SITE}/casa

If it's urgent, call me. Don't wait for a reply here.`,
    },
    {
      sc: 'enkeys', fam: 'casa',
      title: 'Giorno delle chiavi — cosa succede',
      when: 'Il giorno prima della consegna. Anticipare il verbale evita ogni discussione sul deposito, un anno dopo.',
      text: `Move-in day: [DATA] at [ORA], [INDIRIZZO].

What happens, in about 30 minutes: keys handed over with every copy listed, meter readings for electricity, gas and water photographed, condition of the flat checked room by room, then we both sign the handover report on my phone. You get the PDF by email the same minute — that document is what protects your deposit.

Bring your ID. Anything you want checked before we sign?`,
    },
    {
      sc: 'enhome', fam: 'casa',
      title: 'Manuale della casa (wifi, rifiuti, quartiere)',
      when: 'Subito dopo le chiavi, e ogni volta che chiedono la password del wifi o il giorno della differenziata.',
      text: `Everything about your flat is in one place: Wi-Fi password with a copy button, heating, which day the bins go out, appliances, emergency numbers, and the neighbourhood places we actually use:

${SITE}/casa

And the survival guide to the city itself: ${SITE}/welcome-to-rome

If something isn't in there, ask me and I'll add it.`,
    },
    {
      sc: 'enrev', fam: 'casa', star: true,
      title: 'Chiedere la recensione Google',
      when: 'Da mandare quando è contento e ha già le chiavi: dopo il primo mese, o dopo che gli hai risolto un problema.',
      text: `[NOME], one small favour — worth more to us than any advertising.

If BOOM did right by you, two lines on Google help the next person moving to Rome trust an agency they've never met:

https://g.page/r/CfcpUptbNnvZEBM/review

It takes a minute. And if something wasn't right, tell me first — I'd much rather fix it than read it.`,
    },
    {
      sc: 'enrefer', fam: 'casa',
      title: 'Referral — €50 a te, €50 a chi arriva',
      when: 'Nella stessa settimana della recensione, non nello stesso messaggio. Gli inquilini contenti sono il canale che costa zero.',
      text: `Know anyone else moving to Rome? Send them to us and you both get €50 when they rent:

${SITE}/refer

Your personal code and a share button are in your page as well: ${SITE}/casa

No catch, no expiry — and they get exactly the treatment you got.`,
    },
    {
      sc: 'enend', fam: 'casa',
      title: 'Fine contratto, uscita e deposito',
      when: 'Da mandare tu, prima che lo chieda lui. Chi sa come uscirà è anche chi rinnova più volentieri.',
      text: `Your lease ends on [DATA]. What happens, so nothing is a surprise:

• Notice — [PREAVVISO] in writing. A message here counts, if you confirm it
• Final readings and a walkthrough on your last day, exactly like move-in: photographed and signed
• Deposit back within [GIORNI] days, to the account you give me, minus only what's written and evidenced in the report

Any open rent or bills get settled first.

Or would you rather renew? Tell me now and I'll hold it for you.`,
    },

    // ======================== CLIENTE · ITALIANO ============================
    {
      sc: 'itciao', fam: 'it',
      title: 'Prima risposta in italiano',
      when: 'Chi scrive in italiano. Stessa struttura dell\'inglese: chiudi chiedendo le tre informazioni.',
      text: `Ciao [NOME], sono Valentino di BOOM Rome.

Siamo un'agenzia regolare di Roma (Egidi Immobiliare): affittiamo case verificate per periodi da 1 a 12+ mesi, con contratti registrati, prezzi trasparenti e ingresso anche in 48 ore.

Per mandarti case vere e non un listino a caso mi servono tre cose:
1. Zona, o il punto di riferimento (università, ufficio)
2. Budget mensile
3. Da quando e per quanti mesi

Quelle libere adesso: ${SITE}/apartments

Mi dici le tue tre?`,
    },
    {
      sc: 'itcase', fam: 'it',
      title: 'Il catalogo in italiano',
      when: '"Cosa avete disponibile?" — manda le pagine, non gli screenshot.',
      text: `Questo è tutto quello che abbiamo davvero libero adesso, con prezzi e date reali:

${SITE}/apartments

Altri due modi di guardarlo:
• Il tabellone live con lo stato di ogni casa: ${SITE}/board
• Per quartiere, con com'è viverci: ${SITE}/apartments-in

Ogni casa l'abbiamo vista di persona: le foto sono nostre, non del proprietario.

Dimmi quali due ti interessano e controllo gli orari.`,
    },
    {
      sc: 'itcosti', fam: 'it',
      title: 'I costi, tutti',
      when: 'La domanda che decide. Rispondi con ogni voce: quello che nascondi oggi diventa una lite fra due mesi.',
      text: `I numeri, senza sorprese:

• Canone mensile — esattamente quello scritto sull'annuncio
• Deposito — cauzionale, restituito alla fine. Filmiamo la casa all'ingresso e all'uscita, così non si discute
• Commissione — 10% del canone annuo, una volta sola, e solo se firmi davvero
• €300 per bloccare la casa — rimborsabili e scalati da quello che devi

Il dettaglio euro per euro: ${SITE}/your-money

Le visite sono gratuite. Nessun costo di pratica, nessun canone di servizio.`,
    },
    {
      sc: 'itvisita', fam: 'it',
      title: 'Prenota la visita (italiano)',
      when: 'Appena c\'è interesse. Gli orari nel link sono quelli davvero liberi della tua settimana.',
      text: `La visita è gratuita e dura una mezz'ora: di persona con me, oppure in video in diretta se non sei a Roma (la telecamera la muovo io dove dici tu).

Scegli qui uno slot:
${SITE}/book

Lo slot resta tenuto per te e ti confermo entro poche ore.`,
    },
    {
      sc: 'itdoc', fam: 'it',
      title: 'Documenti richiesti (italiano)',
      when: 'Darla per intero e in anticipo: nessuna richiesta a sorpresa dopo il sì.',
      text: `Cosa ci serve per approvarti — la stessa lista per tutti, e dopo non compare nient'altro:

• Documento d'identità
• Prova del reddito: contratto, buste paga, o l'iscrizione se studi
• Un garante, se il reddito non è in Italia — ci sono alternative, chiedimi
• Codice fiscale: se non l'hai, lo otteniamo noi

Le foto fatte col telefono vanno benissimo, mandale qui quando vuoi. E non si paga niente prima di aver letto il contratto.`,
    },

    // ====================== PROPRIETARIO · ITALIANO =========================
    {
      sc: 'prciao', fam: 'pr', star: true,
      title: 'Primo contatto col proprietario',
      when: 'Il messaggio che apre un mandato. Dice subito CHI porti in casa sua: è quello che gli interessa davvero.',
      text: `Buongiorno [NOME], sono Valentino di BOOM Rome (Egidi Immobiliare).

Affittiamo a stranieri di fascia alta a Roma — professionisti in trasferta, personale di agenzie ONU e ambasciate, studenti internazionali — e gestiamo tutto: annuncio, selezione, contratto registrato, incassi e scadenze fiscali.

Come lavoriamo e a quali condizioni: ${SITE}/owners

Mi dice dov'è l'immobile, quanti metri quadri e se è arredato? Le dico a quanto si affitta davvero.`,
    },
    {
      sc: 'prgest', fam: 'pr',
      title: 'Cosa facciamo per lui (la gestione)',
      when: 'Quando chiede "ma voi cosa fate esattamente?". Ogni riga è una cosa che altrimenti farebbe lui.',
      text: `Come lavoriamo, in breve:

• Selezione vera dell'inquilino: reddito, garanzie e documenti verificati prima di fargli firmare qualsiasi cosa
• Contratto conforme e registrato all'Agenzia delle Entrate, con l'attestazione dove serve
• Foto e video professionali, annuncio sui portali e sul nostro sito
• Incassi tracciati, ricevute automatiche, solleciti gestiti da noi
• Rendiconto mensile in PDF e scadenzario fiscale sempre aggiornato

Condizioni: ${SITE}/owners

Quando possiamo vedere l'immobile?`,
    },
    {
      sc: 'prcanone', fam: 'pr', star: true,
      title: 'Canone concordato — il calcolo gratis',
      when: 'Prima di parlare di prezzo. È il gancio migliore che hai su un proprietario: gli fai vedere un risparmio fiscale, non uno sconto.',
      text: `Prima di decidere il prezzo, una cosa che conviene sapere: con il canone concordato la cedolare secca scende al 10% invece del 21%, l'IMU si riduce del 25% e la registrazione non costa nulla.

Quanto può chiedere la sua casa in fascia concordata, calcolato sull'Accordo di Roma del 2023 (90+ zone), gratis:
${SITE}/canone

Mi manda zona, metri quadri e piano e glielo calcolo io in due minuti.`,
    },
    {
      sc: 'prpack', fam: 'pr',
      title: 'Pacchetto concordato chiavi in mano (€349)',
      when: 'Dopo il calcolo, quando ha visto il risparmio ma non ha voglia della pratica. Che è sempre.',
      text: `Il concordato conviene, ma la pratica è noiosa: verifica del canone, contratto conforme, attestazione di rispondenza con un'organizzazione firmataria, registrazione RLI.

La facciamo noi chiavi in mano: €349 una volta sola per immobile, con rimborso integrale se l'immobile non può rientrare in fascia.

${SITE}/pacchetto-concordato

Di solito il risparmio del primo anno supera il costo: se vuole glielo calcolo sui suoi numeri.`,
    },
    {
      sc: 'prdoc', fam: 'pr',
      title: 'Documenti dell\'immobile',
      when: 'Dopo il sì. Chiederli tutti in una volta, spiegando che le foto col telefono bastano, li fa arrivare davvero.',
      text: `Per pubblicare e affittare in regola mi servono, quando ha un momento:

• Visura catastale e planimetria
• APE, l'attestato di prestazione energetica (è obbligatorio allegarlo al contratto)
• Documento d'identità e codice fiscale del proprietario
• Delega a gestire l'immobile — la preparo io, si firma dal telefono
• IBAN per l'accredito dei canoni

Le foto dei documenti fatte col telefono vanno bene. Li carico io nel fascicolo dell'immobile: da lì escono contratto e registrazione senza chiederle più niente.`,
    },
    {
      sc: 'prfoto', fam: 'pr',
      title: 'Sopralluogo, foto e video',
      when: 'Per fissare la visita tecnica. La frase sullo sfitto è quella che convince a preparare la casa come si deve.',
      text: `Per il sopralluogo mi bastano 45 minuti: foto professionali, video per le visite a distanza, misure e letture dei contatori.

Come dovrebbe essere la casa quel giorno: libera da oggetti personali, tapparelle alzate, luci tutte funzionanti, superfici sgombre. A Roma, tra una casa fotografata bene e una fotografata male, ci sono settimane di sfitto.

Le va bene [DATA] alle [ORA]?`,
    },
    {
      sc: 'prconto', fam: 'pr',
      title: 'Rendiconto e scadenze fiscali',
      when: 'Da mandare al primo mese di gestione: è ciò che trasforma un proprietario diffidente in uno che ti lascia fare.',
      text: `Ogni primo del mese le arriva per email il rendiconto del mese chiuso, in PDF: canoni incassati con data e modalità, rate ancora aperte, eventuali arretrati, manutenzioni fatte.

Le scadenze fiscali dell'immobile — registro, IMU, cedolare, aggiornamento ISTAT, rinnovi — le teniamo noi a calendario e la avvisiamo prima, non dopo.

Se le serve un documento in qualsiasi momento me lo chieda qui: glielo mando in giornata.`,
    },

    // ========================= AZIENDE ED ENTI ==============================
    {
      sc: 'azimpresa', fam: 'az',
      title: 'Aziende che spostano personale',
      when: 'HR o mobility manager. Voce business: nessun "ti va una visita?", si parla di fattura e di persone che atterrano.',
      text: `For companies moving people to Rome: one contact, verified homes, compliant leases, one invoice.

• Transitional or company-name leases, registered, in English
• The employee housed before day one, video viewings from wherever they are
• Utilities, codice fiscale and residency handled
• A single VAT invoice from an Italian company — the document expense reports ask for

${SITE}/corporate

How many people, and when do they land? (Possiamo parlarne in italiano, se preferite.)`,
    },
    {
      sc: 'azuni', fam: 'az',
      title: 'Università e international office',
      when: 'Il canale che costa zero e porta studenti a ondate. Il valore per loro è non essere quelli che hanno consigliato un truffatore.',
      text: `For international offices and student services: we're the English-first, anti-scam housing partner you can recommend without risk — verified homes, remote viewings, registered contracts, and free to partner with.

${SITE}/universities

Everything we do for organisations: ${SITE}/partners

Happy to send a one-page PDF your students can read, and to be the name you give when someone gets scammed in September.`,
    },
    {
      sc: 'azric', fam: 'az', bench: true,
      title: 'Ricercatori ERC / Marie-Curie',
      when: 'Dipartimenti e centri di ricerca. Qui la parola che conta è "grant-invoiceable": possono pagarci col progetto.',
      text: `For incoming researchers and ERC / MSCA fellows: verified housing in Rome, support for families, the bureaucracy handled, and fees that are grant-invoiceable. From €690.

${SITE}/research

Tell me how many fellows and their arrival window, and I'll come back with what we can hold for them.`,
    },

    // ======================= LA RÉUNION · FRANÇAIS ==========================
    {
      sc: 'frbonjour', fam: 'fr', bench: true,
      title: 'Premier contact La Réunion',
      when: 'Chi scrive dall\'isola. Prima cosa: capire da che lato sta — proprietario, inquilino o acquirente.',
      text: `Bonjour [NOM], Valentino de BOOM.

À La Réunion nous intervenons sur trois besoins : les propriétaires qui veulent louer sans y penser, les locataires qui cherchent un bien réellement visité, et les acheteurs à 9 000 km qui ont besoin que quelqu'un aille voir sur place.

Tout est expliqué ici : ${SITE}/reunion

Vous êtes de quel côté — propriétaire, locataire ou acheteur ? Je vous réponds dans la journée.`,
    },
    {
      sc: 'frachat', fam: 'fr', bench: true,
      title: 'Acquirente in metropole (visita + rapporto)',
      when: 'La richiesta più comune sull\'isola. La riga sulla carte T non è un limite da nascondere: è il motivo per cui ti credono.',
      text: `Vous avez trouvé un bien à La Réunion mais vous êtes en métropole.

Nous y allons pour vous : visite vidéo en direct, vous dirigez la caméra, puis un compte rendu écrit — état réel, exposition, humidité, normes cycloniques, travaux prévisibles — et la lecture des diagnostics et des documents de copropriété avec vous.

${SITE}/reunion?role=buyer

Dit clairement : la recherche et la négociation pour un acheteur relèvent de la carte T, que nous n'exerçons pas encore. Ce que nous faisons, c'est aller voir et vous rapporter la vérité.

Envoyez-moi l'annonce.`,
    },

    // ========================= LINK PERSONALI ===============================
    {
      sc: 'opvisit', fam: 'op',
      title: 'Visita confermata + link personale',
      when: 'Dopo aver confermato dal portale o da Telegram. Il [LINK] è la pagina della visita del cliente.',
      text: `[NOME], your viewing is set: [DATA] at [ORA] — [INDIRIZZO O LINK VIDEO].

Your own page for this appointment — address, directions, Wallet pass, and the buttons to move or cancel it yourself:
[LINK]

If you're running late just write here. Ten minutes is never a problem; silence is.`,
    },
    {
      sc: 'opsched', fam: 'op',
      title: 'Link della Scheda (anagrafica + documento)',
      when: 'Per raccogliere dati e documento senza rincorrere nessuno. Il link lo generi dal portale (Share Hub).',
      text: `[NOME], one link and the paperwork is done: your details and a photo of your ID, straight from your phone. Two minutes — the form fills itself from the photo.

[LINK]

Nothing is published and nothing is shared: it goes into your file with us, and it's what lets me prepare the contract without asking you the same questions twice.`,
    },
    {
      sc: 'opsign', fam: 'op',
      title: 'Invito alla firma (English)',
      when: 'Con il link Magic Sign dell\'inquilino. La riga finale ti evita le correzioni dopo la registrazione.',
      text: `[NOME], the contract is ready to sign — no printer, no appointment:

[LINK]

Open it, read it (it's in English, and the terms are exactly the ones we agreed), then sign with your finger. The signed PDF and the signature certificate reach you by email the moment both sides are done.

If anything in there should change, tell me BEFORE you sign: afterwards it's a registered act.`,
    },
    {
      sc: 'opfirma', fam: 'op',
      title: 'Invito alla firma (italiano, proprietario)',
      when: 'Con il link di firma del locatore. Lui firma dopo l\'inquilino: il link gli arriva quando tocca a lui.',
      text: `[NOME], il contratto è pronto per la firma, senza stampante e senza appuntamento:

[LINK]

Apre il link, legge e firma dal telefono. Appena hanno firmato entrambe le parti, le arrivano per email il PDF firmato e il certificato di firma.

Se c'è qualcosa da correggere me lo dica PRIMA di firmare: dopo è un atto registrato.`,
    },
    {
      sc: 'oppay', fam: 'op',
      title: 'Link di pagamento',
      when: 'Per una rata o una fattura. Il link si genera dal portale (💳 sulla riga) e resta valido nel tempo.',
      text: `[NOME], here's the secure link to pay [COSA] — [IMPORTO]:

[LINK]

It's a Stripe page in your name: pay by card and the receipt reaches your email in seconds. The link stays valid, so you can also open it later or from another phone.

Prefer a bank transfer? Say so and I'll send you the account details with the reference code to write in it.`,
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
