/* js/squadra-registry.js — L'ORGANIGRAMMA. Chi lavora qui, e con quali chiavi.
 *
 * BOOM ha 23 cron e ~20 processi che agiscono da soli sui dati veri, sui
 * clienti veri e sui soldi veri. Fino a oggi l'unico posto che li elencava
 * era una lista scritta a mano dentro team.html: OTTO voci, ferme a quando
 * furono scritte. Mancavano — fra gli altri — il Selezionatore che archivia
 * lead, il Fotografo che alle 03:20 riscrive le foto degli annunci, il
 * Copywriter che ne riscrive i testi, il Rendiconto che il 1° del mese manda
 * un PDF a ogni proprietario e l'Archivista che spedisce fuori piattaforma
 * l'archivio legale. Nessuno di questi chiede il permesso a nessuno.
 *
 * IL PUNTO. Di un dipendente vero non ti basta sapere se è vivo: devi sapere
 * COSA FA DA SOLO. È la differenza fra un collega e un processo che gira. La
 * pagina mostrava il pallino verde (è vivo) e taceva sull'unica cosa che
 * conta davvero per fidarsi — e la risposta, letta sul codice, è netta:
 *
 *     su ~20 agenti, DUE passano da un'approvazione umana
 *     (il Gestore e il Commerciale, via `proposeAction` → action_queue).
 *     Tutti gli altri scrivono, spediscono e pubblicano da soli.
 *
 * Journey, Segugio, Rendiconto e Contabile mandano email a inquilini,
 * iscritti e proprietari senza che nessuno tocchi niente. Va benissimo che
 * sia così — è il motivo per cui la macchina regge senza personale — ma
 * dev'essere SCRITTO, non una scoperta archeologica nel sorgente.
 *
 * QUI STA SCRITTO. Una voce per agente, con tre liste che sono la sua lettera
 * di assunzione: `solo` (decide da sé), `porta` (arriva a te), `mai` (il
 * confine che non attraversa). Più `reach`, cioè le chiavi che gli abbiamo
 * dato: chi può parlare ai clienti, chi tocca i soldi, chi cambia la vetrina.
 *
 * NON PUÒ ANDARE ALLA DERIVA. `driftVsCrons()` confronta questo file con i
 * cron veri di vercel.json: un cron non dichiarato qui e un agente che punta
 * a un cron inesistente sono entrambi errori, e il test li fa fallire. È la
 * lezione della lista a mano: un organigramma che non si accorge di essere
 * incompleto torna incompleto in tre settimane.
 *
 * Puro: nessun Firebase, nessuna rete, nessun DOM. Gira nei test come in
 * pagina. window.BOOM_SQUADRA (UMD, come boom-geo / canone-engine).
 */
(function (root) {
  'use strict';

  /* Le chiavi che un agente ha in tasca. Vocabolario chiuso: se aggiungi un
   * valore qui, il desk deve sapere come dipingerlo — meglio pochi termini
   * veri che una tassonomia che nessuno legge. */
  var REACH = {
    clienti:   { label: 'Parla ai clienti', note: 'Manda email o messaggi a inquilini, proprietari o lead' },
    operatore: { label: 'Scrive a te',      note: 'Telegram o email all\'operatore, mai al cliente' },
    archivio:  { label: 'Scrive in archivio', note: 'Crea o modifica documenti su Firestore' },
    file:      { label: 'Carica file',      note: 'Scrive su Firebase Storage' },
    soldi:     { label: 'Tocca i soldi',    note: 'Legge o segna pagamenti, incassi, rate' },
    vetrina:   { label: 'Cambia la vetrina', note: 'Modifica ciò che il pubblico vede sugli annunci' },
    ai:        { label: 'Spende AI',        note: 'Chiama un modello a pagamento' }
  };

  /* approval: 'mai' = agisce senza chiedere · 'sempre' = ogni azione passa da
   * te · 'parziale' = una parte da solo, una parte proposta. */
  var TEAM = [
    /* ── COMMERCIALE — far entrare il lavoro ─────────────────────────── */
    {
      key: 'scout', emoji: '📡', name: 'Lo Scout', reparto: 'Commerciale',
      role: 'Radar di mercato per i clienti Property Finding',
      hired: 'Il cliente paga €350 perché qualcuno guardi il mercato prima di lui. Questo è quel qualcuno.',
      mandate: [
        'Legge gli alert email di Idealista e Immobiliare via IMAP e ricostruisce l\'annuncio vero dal link tracciato',
        'Il braccio sul Mac (LO SCATTO, bot/boom_scout.py) apre le ricerche dei clienti col browser VERO ogni ~10 minuti — la scansione costante che il server non può fare (i portali 403-ano i datacenter)',
        'Rigenera ogni giorno le ricerche dai criteri reali di ogni cliente attivo',
        'Assegna un punteggio annuncio↔cliente e spinge i match ≥60 nel mazzo di swipe',
        'Riconosce la STESSA casa su più portali (l\'impronta) e deduce la zona dal titolo quando la fonte non la dichiara',
        'Dà a ogni annuncio un punteggio-occasione (il fiuto) contro le statistiche di zona del Perito'
      ],
      autonomy: {
        solo:  ['Archivia ogni annuncio trovato', 'Punteggia e spinge i match nel portale del cliente', 'Fa scattare la notifica sul telefono del cliente', 'NON spinge due volte la stessa casa vista da due portali (de-dup di cluster)'],
        porta: ['Il brief operativo delle 06:00 su Telegram', 'Gli annunci che non è riuscito a ingerire (needsAttention)', 'La card 💎 quando il fiuto dice "occasione"'],
        mai:   ['Non contatta il proprietario dell\'annuncio', 'Non spinge annunci di agenzia — li archivia e basta', 'Non chiama "occasione" un annuncio in una zona senza campione sufficiente']
      },
      reach: ['archivio', 'operatore', 'ai'],
      approval: 'mai',
      crons: ['/api/pfs/scan-inbox', '/api/pfs/scan-market', '/api/pfs/sync-searches', '/api/pfs/brief'],
      health: { col: 'pfsRadarHealth', rollup: true },
      console: '/pfs-command', run: '/api/pfs/scan-inbox'
    },
    {
      key: 'orecchio', emoji: '👂', name: 'L\'Orecchio', reparto: 'Commerciale',
      role: 'Le richieste dai portali diventano lead, da sole',
      hired: 'Una richiesta da Immobiliare che resta in una casella email è un cliente perso.',
      mandate: [
        'Ogni 10 minuti legge la casella e riconosce le richieste dei portali',
        'Estrae la persona con Claude — non inventa mai un dato che non c\'è',
        'Aggancia l\'annuncio giusto nel catalogo vero',
        'Deduplica per messaggio E per persona (stessa email o telefono entro 7 giorni)'
      ],
      autonomy: {
        solo:  ['Crea il lead nel pipeline', 'Riconosce e scarta i doppioni di Homie'],
        porta: ['Il lead nuovo arriva su Telegram entro un minuto, con "Apri WhatsApp" se c\'è il numero'],
        mai:   ['Non risponde al prospect — quello è il Commerciale, e passa da te']
      },
      reach: ['archivio', 'operatore', 'ai'],
      approval: 'mai',
      crons: ['/api/leads/scan-inbox'],
      health: { col: 'pfsRadarHealth', doc: 'leads-inbox' },
      console: null, run: '/api/leads/scan-inbox'
    },
    {
      key: 'lead-brain', emoji: '🧠', name: 'Il Selezionatore', reparto: 'Commerciale',
      role: 'Legge ogni lead e decide quanto vale',
      hired: 'Rispondere a tutti allo stesso modo costa tempo sui curiosi e lo toglie a chi firma.',
      mandate: [
        'Regole gratuite prima del modello: spam e newsletter muoiono senza spendere un token',
        'Punteggio deterministico da telefono, email, profondità del messaggio, lavoro, budget, data di ingresso',
        'Solo la fascia ambigua sale a Claude, in UNA chiamata sola per run (max 20 lead)',
        'Tetto rigido di 12 chiamate al giorno, contate su Firestore'
      ],
      autonomy: {
        solo:  ['Assegna il voto A/B/C', 'ARCHIVIA i lead morti — spam e injection spariscono senza chiederti nulla'],
        porta: ['I voti guidano l\'ordine delle notifiche: 🔥A per primi, i morti mai'],
        mai:   ['Non archivia mai un essere umano raggiungibile: se è magro ma vero, resta C']
      },
      reach: ['archivio', 'ai'],
      approval: 'mai',
      crons: ['/api/leads/brain'],
      health: { col: 'teamHealth', doc: 'lead-brain' },
      console: null, run: '/api/leads/brain'
    },
    {
      key: 'commerciale', emoji: '🤝', name: 'Il Commerciale', reparto: 'Commerciale',
      role: 'Prima risposta e follow-up ai lead',
      hired: 'La prima risposta entro un\'ora è metà della trattativa. Di notte non c\'è nessuno.',
      mandate: [
        'Ogni due ore, dalle 06 alle 18, guarda i lead ancora "nuovi"',
        'Lascia 20 minuti di finestra umana: se rispondi tu, tace',
        'Scrive la bozza con Claude, conoscendo l\'immobile di cui si parla',
        'A 48 ore senza risposta, un solo follow-up (grade A/B o intenzione apply/reserve)'
      ],
      autonomy: {
        solo:  ['Scrive la bozza', 'Sceglie la lingua dalle parole vere del cliente'],
        porta: ['OGNI messaggio finisce in action_queue e parte col tuo ✅ — salvo i FOLLOW-UP template, SE li hai promossi tu dalla scala della fiducia (/fiducia, campione ≥30 al ≥95%)'],
        mai:   ['La prima risposta AI a un contatto nuovo non parte MAI da sola, nemmeno promossa', 'Se hai già risposto a mano, non scrive una seconda voce']
      },
      reach: ['operatore', 'archivio', 'ai'],
      approval: 'sempre',
      crons: ['/api/employees/commerciale'],
      health: { col: 'teamHealth', doc: 'commerciale' },
      console: null, run: '/api/employees/commerciale'
    },
    {
      key: 'segretaria', emoji: '💁', name: 'La Segretaria', reparto: 'Commerciale',
      role: 'Conduce la conversazione che le consegni, fino alla visita',
      hired: 'Il "durante" delle chat era l\'ultimo pezzo manuale del giro: metà dei tuoi messaggi sotto i 17 caratteri e 544 silenzi misurati sono il costo di quel collo di bottiglia.',
      mandate: [
        'Prende in mano una chat SOLO quando la consegni tu (🤖 sulla card del lead): il click è la firma',
        'Risponde con i fatti veri: stato dell\'immobile, alternative, slot visita dalla griglia vera, servizi dal catalogo',
        'Apre lei la conversazione (WhatsApp col numero, email senza) rispondendo alla richiesta originale',
        'Ogni 10 minuti raccoglie le risposte email dei clienti che segue e continua il filo'
      ],
      autonomy: {
        solo:  ['Conversa sulla chat consegnata: disponibilità, visite, link, un servizio al massimo', 'Propone gli slot VERI e il link di prenotazione'],
        porta: ['La consegna: senza il tuo 🤖 non scrive a nessuno', 'Trattative, sconti, questioni legali: ti passa la mano con la card 🖐'],
        mai:   ['Mai trattare il prezzo o promettere fuori catalogo', 'Mai con inquilini, proprietari o clienti PFS', 'Mai un link fuori da boomrome.com', 'Mai firmarsi con un nome di persona']
      },
      reach: ['clienti', 'operatore', 'archivio', 'ai'],
      approval: 'parziale',
      crons: ['/api/segretaria/scan-replies'],
      health: { col: 'teamHealth', doc: 'segretaria' },
      console: null, run: null
    },
    {
      key: 'recupero', emoji: '♻️', name: 'Il Recupero', reparto: 'Commerciale',
      role: 'I quasi-clienti di Stripe, ripresi per mano',
      hired: 'Chi è arrivato alla pagina di pagamento e non ha pagato è il lead più caldo che hai.',
      mandate: [
        'Ogni 4 ore legge le sessioni Stripe scadute degli ultimi 14 giorni',
        'PFS, servizi e prenotazioni → diventano lead nel pipeline esistente',
        'Pre-accordi, depositi e canoni → recap a te (il cliente è già dentro, serve una persona)',
        'Salta chi ha riprovato e pagato, chi è già in pipeline, e i tuoi test'
      ],
      autonomy: {
        solo:  ['Crea i lead di recupero (id deterministico, un rerun non duplica mai)'],
        porta: ['Il recap Telegram per i casi che richiedono te'],
        mai:   ['Non scrive al cliente: passa la palla alla macchina esistente, che passa da te']
      },
      reach: ['archivio', 'operatore', 'soldi'],
      approval: 'mai',
      crons: ['/api/payments/recover-checkouts'],
      health: { col: 'teamHealth', doc: 'recupero' },
      console: null, run: '/api/payments/recover-checkouts'
    },
    {
      key: 'perito', emoji: '📐', name: 'Il Perito', reparto: 'Commerciale',
      role: 'Il libro mastro del mercato: prezzi veri, assorbimento, comparabili',
      hired: 'Ogni decisione di prezzo si prendeva a memoria, mentre il radar buttava via ciò che vedeva. Un alert email racconta le nascite degli annunci — le morti, che sono metà del valore, le verifica lui.',
      mandate: [
        'Registra ogni annuncio visto da qualsiasi porta (alert, Homie, scan) nel libro mastro: prezzo, mq, zona, date — MAI i contatti del privato',
        'Tiene la storia dei prezzi e segna i ribassi dei competitor',
        'Fa verificare a Homie chi è ancora vivo: un annuncio sparito con prova (404, "non più disponibile") è un affitto concluso — tempo di assorbimento per zona',
        'Ogni mattina scrive le statistiche di zona: mediana €/mq, percentili, giorni-a-sparire',
        'Segnala i PRIVATI fermi oltre l\'assorbimento della loro zona come candidati mandato — card in /radar, mai un contatto automatico'
      ],
      autonomy: {
        solo:  ['Registra e aggiorna il libro mastro', 'Dichiara morto un annuncio SOLO con prova — un 403 o un captcha è "non so", mai "affittato"', 'Pubblica le statistiche di zona (solo con campione sufficiente)', 'Compila la lista dei candidati mandato'],
        porta: ['Il report del mattino coi numeri del libro', 'L\'allarme se le verifiche si arretrano (gli occhi di Homie fermi)', 'I candidati mandato, come card nella Centrale'],
        mai:   ['Non contatta nessuno', 'Non tiene contatti dei privati — statistica, non rubrica', 'Non pubblica un numero su un campione piccolo', 'Non tocca gli annunci nostri']
      },
      reach: ['archivio', 'operatore'],
      approval: 'mai',
      crons: ['/api/market/pulse'],
      health: { col: 'teamHealth', doc: 'perito' },
      console: '/pfs-command#mercato', run: '/api/market/pulse'
    },
    {
      key: 'contatto', emoji: '📨', name: 'Il Contatto', reparto: 'Commerciale',
      role: 'Il messaggio approvato arriva nella chat del portale',
      hired: 'Il primo contatto decide chi prende la visita, e un privato senza numero si raggiunge solo nella chat del portale. Scriverli a mano uno per uno teneva la qualità alta e la quantità impossibile.',
      mandate: [
        'L\'operatore rivede l\'annuncio in plancia, sceglie stile e voce, LEGGE il testo e tocca Approva: quel tap è la firma',
        'Il Mac (bot/boom_contatto.py) consegna il testo INTATTO nella chat/form del portale, a ritmo umano, max 6 per giro',
        'Un contatto per annuncio PER COSTRUZIONE: due clienti sulla stessa casa = una conversazione sola',
        'Esito incerto = parcheggio immediato (mai un retry cieco che rischia il doppio messaggio); captcha = STOP e rapporto blocked'
      ],
      autonomy: {
        solo:  ['Consegna il messaggio già approvato', 'Aggiorna da solo l\'outreach dell\'annuncio a "contattato" quando ha la prova dell\'invio'],
        porta: ['Il recap Telegram degli invii', 'I parcheggiati (falliti/incerti) restano visibili in plancia con il motivo'],
        mai:   ['Non scrive MAI a nessuno senza un\'approvazione umana per singolo messaggio', 'Non cambia una parola del testo approvato', 'Mai dati personali del cliente nel testo (il motore rifiuta i telefoni alla porta)']
      },
      // reach SENZA 'clienti': quella chiave marca chi scrive a qualcuno
      // SENZA passare da te — qui ogni singolo messaggio è un tuo tap
      // (stessa semantica del Commerciale, che propone e non spedisce).
      reach: ['archivio'],
      approval: 'sempre',
      crons: [],
      health: { col: 'pfsRadarHealth', doc: 'contatto' },
      console: '/pfs-command', run: null
    },
    {
      key: 'vedetta', emoji: '📡', name: 'La Vedetta', reparto: 'Commerciale',
      role: 'Le ricerche libere: alert istantanei a te, digest email a chi vuoi',
      hired: 'Il radar lavorava solo per i clienti PFS paganti. Le vedette sono gli occhi che punti dove vuoi tu: una zona, un budget, solo privati, solo occasioni — per te o per chiunque decidi.',
      mandate: [
        'Ogni annuncio ingerito passa dalle vedette accese (zona, prezzo, taglia, privati, solo occasioni 💎)',
        'Il Telegram a te parte ISTANTANEO, dentro l\'ingestione',
        'L\'email al destinatario esce come digest 3 volte al giorno: max 6 case, mai due volte lo stesso annuncio',
        'Una vedetta vede solo il FUTURO: ciò che era già in vetrina quando l\'hai creata non la fa scattare'
      ],
      autonomy: {
        solo:  ['MANDA I DIGEST EMAIL ai destinatari che hai impostato, senza ripasso'],
        porta: ['L\'alert Telegram istantaneo', 'Il recap quando i digest partono'],
        mai:   ['Non scrive a nessuno che tu non abbia impostato', 'Non rispedisce mai lo stesso annuncio', 'Non alza la voce su un ri-avvistamento (solo prime viste e ribassi)']
      },
      reach: ['clienti', 'operatore', 'archivio'],
      approval: 'mai',
      crons: ['/api/radar/digest'],
      health: { col: 'teamHealth', doc: 'vedetta' },
      console: '/pfs-command#mercato', run: '/api/radar/digest'
    },
    {
      key: 'segugio', emoji: '🐕', name: 'Il Segugio', reparto: 'Commerciale',
      role: 'Avvisa chi ha salvato una ricerca',
      hired: 'Chi lascia la sua email su una ricerca ha alzato la mano. Va richiamato quando esce la casa giusta.',
      mandate: [
        'Tre volte al giorno confronta ogni ricerca salvata col catalogo affittabile',
        'Il primo giro SEMINA in silenzio: si parla solo di case uscite DOPO l\'iscrizione',
        'Digest di massimo 6 case, con disiscrizione a un clic'
      ],
      autonomy: {
        solo:  ['MANDA LE EMAIL agli iscritti, senza passare da te'],
        porta: ['Niente: lavora in silenzio'],
        mai:   ['Non manda mai al primo giro (sarebbe uno spam di catalogo)', 'Non riscrive un iscritto disiscritto']
      },
      reach: ['clienti', 'archivio'],
      approval: 'mai',
      crons: ['/api/search/matcher'],
      health: null,
      console: null, run: '/api/search/matcher'
    },

    /* ── OPERATIVO — la giornata ──────────────────────────────────────── */
    {
      key: 'regista', emoji: '🎬', name: 'Il Regista', reparto: 'Operativo',
      role: 'Dirige la tua giornata: foglio di chiamata, task, agenda',
      hired: 'Serve qualcuno che alle 07:30 ti dica cosa succede oggi, coi viaggi veri fra una visita e l\'altra.',
      mandate: [
        'Il foglio di chiamata su Telegram: visite di oggi, viaggi reali fra una e l\'altra, cosa è successo stanotte',
        'Capisce i promemoria a voce ("ricordami le lampadine per Pigneto domani alle 15") con un parser a grammatica chiusa — mai un\'allucinazione',
        'Un task con orario diventa un VERO evento nel calendario del telefono',
        'Task automatici: preparazione chiavi per gli immobili con visite, esito visita per quelle di ieri'
      ],
      autonomy: {
        solo:  ['Crea task', 'SCRIVE EVENTI NEL TUO CALENDARIO (invito iCal)', 'Annulla il task di preparazione se le visite saltano'],
        porta: ['Il foglio di chiamata delle 07:30, coi bottoni ✓ Fatta / ⏰ +1g'],
        mai:   ['Non tocca le visite dei clienti', 'Tace a giornata vuota']
      },
      reach: ['operatore', 'archivio'],
      approval: 'mai',
      crons: ['/api/regista/cron'],
      health: { col: 'teamHealth', doc: 'regista' },
      console: null, run: '/api/regista/cron'
    },
    {
      key: 'metronomo', emoji: '⏱️', name: 'Il Metronomo', reparto: 'Operativo',
      role: 'Tutto ciò che deve succedere a un\'ora precisa',
      hired: 'Un promemoria a 30 minuti dalla visita non vale niente se arriva un\'ora dopo.',
      mandate: [
        'Il countdown visita: T-24h, T-3h, T-30m, poi "com\'è andata?" a T+2h',
        'Il journey dell\'inquilino: benvenuto, documenti, chiavi, recensione, rinnovo, uscita',
        'Il guardiano delle firme: firme parziali ferme da 48h, inviti freddi da 72h',
        'Lo spazzino dei lucchetti sugli immobili e i promemoria di pagamento'
      ],
      autonomy: {
        solo:  ['MANDA EMAIL A INQUILINI E CLIENTI (countdown, journey, solleciti)', 'Spinge i pass Wallet', 'Cambia stato alle visite'],
        porta: ['Gli avvisi all\'operatore su rinnovi e arretrati'],
        mai:   ['Non vende mai le chiavi', 'Se ci sono rate scadute, gli upsell tacciono', 'Non manda il benvenuto a chi non ha firmato']
      },
      reach: ['clienti', 'archivio', 'soldi', 'operatore'],
      approval: 'mai',
      crons: ['/api/reminder-cron'],
      health: null,
      console: null, run: null
    },
    {
      key: 'centralino', emoji: '☎️', name: 'Il Centralino', reparto: 'Operativo',
      role: 'Ogni minuto: cosa aspetta te, sul telefono',
      hired: 'Le approvazioni ferme in coda sono lavoro che non parte. Devono arrivarti addosso.',
      mandate: [
        'Ogni minuto guarda action_queue e manda su Telegram le proposte nuove con Approva / Rifiuta / Modifica',
        'I lead nuovi arrivano come scheda con contesto e "Apri WhatsApp" a un tocco',
        'Le richieste di visita arrivano con ✅ Conferma sull\'orario proposto, 🔁 Sposta, ✖️ Annulla',
        'Idempotente: quello che ti ha già mandato non te lo rimanda'
      ],
      autonomy: {
        solo:  ['Decide cosa merita una notifica e in che ordine'],
        porta: ['Tutto. È il suo unico mestiere: portare a te ciò che deve decidere una persona.'],
        mai:   ['Non decide niente al posto tuo', 'Non ripinga i lead morti']
      },
      reach: ['operatore'],
      approval: 'mai',
      crons: ['/api/telegram/notify-pending'],
      health: null,
      console: null, run: null
    },
    {
      key: 'gestore', emoji: '🏢', name: 'Il Gestore', reparto: 'Operativo',
      role: 'Solleciti, firme, rinnovi, scadenze',
      hired: 'La burocrazia di un immobile non urla: scade e basta. Serve qualcuno che la guardi ogni giorno.',
      mandate: [
        'Prepara i solleciti per le rate in ritardo da 3+ giorni, riproposti una volta a settimana',
        'Prepara i solleciti firma col link Magic-Sign della parte giusta',
        'Digest Telegram: rinnovi entro 90 giorni, scadenze di conformità, manutenzioni aperte da 48h'
      ],
      autonomy: {
        solo:  ['Decide chi va sollecitato e quando'],
        porta: ['OGNI email: finisce in action_queue e parte solo col tuo ✅'],
        mai:   ['Non spedisce niente da solo']
      },
      reach: ['operatore', 'archivio', 'soldi'],
      approval: 'sempre',
      crons: ['/api/employees/gestore'],
      health: { col: 'teamHealth', doc: 'gestore' },
      console: null, run: '/api/employees/gestore'
    },

    /* ── AMMINISTRAZIONE — i soldi e le carte ─────────────────────────── */
    {
      key: 'contabile', emoji: '🧮', name: 'Il Contabile', reparto: 'Amministrazione',
      role: 'Fisco, incassi, pacchetto commercialista',
      hired: 'Le scadenze fiscali non perdonano, e il commercialista chiede sempre le stesse carte.',
      mandate: [
        'Obblighi in scadenza e scaduti, per proprietario e per la società, dai dati veri',
        'Checklist dei documenti per il commercialista, contratto per contratto',
        'Incassi da inizio anno e ritardi',
        'Il quadro della banca: riconciliati, da confermare, consensi in scadenza'
      ],
      autonomy: {
        solo:  ['MANDA LA CHIUSURA DEL MESE via email al commercialista (il 1° del mese)'],
        porta: ['Il report Telegram, ma solo quando c\'è davvero qualcosa da fare'],
        mai:   ['Non paga niente', 'Non presenta niente all\'Agenzia delle Entrate']
      },
      reach: ['clienti', 'archivio', 'soldi', 'operatore'],
      approval: 'mai',
      crons: ['/api/employees/contabile'],
      health: { col: 'teamHealth', doc: 'contabile' },
      console: null, run: '/api/employees/contabile'
    },
    {
      key: 'banca', emoji: '🏦', name: 'La Banca', reparto: 'Amministrazione',
      role: 'Movimenti, riconciliazione, estratti',
      hired: 'Spuntare a mano i bonifici contro le rate è il lavoro più noioso e più facile da sbagliare.',
      mandate: [
        'Legge i movimenti (API PSD2 dove c\'è, altrimenti gli avvisi email della banca e l\'import CSV)',
        'Categorizza in prima nota',
        'Riconcilia gli accrediti contro le rate aperte: importo esatto + finestra di scadenza + candidato unico',
        'Esporta estratto conto e prima nota per il commercialista'
      ],
      autonomy: {
        solo:  ['SEGNA UNA RATA COME PAGATA quando il match è certo', 'Archivia ogni movimento'],
        porta: ['I match deboli: restano suggerimenti, li confermi tu con un tocco in /banca', 'L\'avviso quando un consenso bancario sta per scadere'],
        mai:   ['Non muove un euro', 'Non vede mai le tue credenziali bancarie', 'Un match dubbio non diventa mai un "pagato"']
      },
      reach: ['archivio', 'soldi', 'operatore', 'ai'],
      approval: 'parziale',
      crons: ['/api/banking/sync', '/api/banking/scan-inbox'],
      health: { col: 'teamHealth', doc: 'banca' },
      console: '/banca', run: '/api/banking/sync'
    },
    {
      key: 'rendiconto', emoji: '📊', name: 'Il Rendiconto', reparto: 'Amministrazione',
      role: 'Il 1° del mese, il PDF a ogni proprietario',
      hired: 'Il mandato si rinnova quando il proprietario VEDE il lavoro. Un PDF puntuale vale più di una telefonata.',
      mandate: [
        'Per ogni proprietario e ogni suo immobile: canoni incassati con data, rate ancora aperte, arretrati, manutenzioni',
        'Un PDF nel design BOOM, email in italiano',
        'Idempotente per proprietario e mese: un rerun non rispedisce'
      ],
      autonomy: {
        solo:  ['MANDA IL PDF AL PROPRIETARIO, senza che tu tocchi niente'],
        porta: ['Il recap Telegram di quanti sono partiti'],
        mai:   ['Non manda due volte lo stesso mese']
      },
      reach: ['clienti', 'archivio', 'file', 'soldi'],
      approval: 'mai',
      crons: ['/api/owners/rendiconto'],
      health: { col: 'teamHealth', doc: 'rendiconto' },
      console: null, run: '/api/owners/rendiconto'
    },
    {
      key: 'smistatore', emoji: '📥', name: 'Lo Smistatore', reparto: 'Amministrazione',
      role: 'Mandi un documento, si archivia da solo',
      hired: '"Mando qualsiasi cosa per il commercialista e si archivia da sola."',
      mandate: [
        'Manda una foto o un PDF al bot Telegram, oppure inoltra una email: Claude lo classifica contro gli immobili veri',
        'Sceglie anno fiscale e contratto, carica su Storage, archivia con categorie che spuntano da sole la checklist del commercialista',
        'Solo da mittenti fidati (i tuoi indirizzi + quelli che dichiari)'
      ],
      autonomy: {
        solo:  ['Archivia e classifica il documento', 'Spunta la checklist del pacchetto commercialista'],
        porta: ['Ti dice cosa ha capito e dove l\'ha messo', 'I documenti senza immobile certo finiscono in "99_DaSmistare" e li segnala il Contabile'],
        mai:   ['Non processa mai un mittente non fidato', 'Non indovina l\'immobile: se non è certo, lo dice']
      },
      reach: ['archivio', 'file', 'ai', 'operatore'],
      approval: 'mai',
      crons: ['/api/documents/scan-inbox'],
      health: null,
      console: null, run: '/api/documents/scan-inbox'
    },
    {
      key: 'archivista', emoji: '🗄️', name: 'L\'Archivista', reparto: 'Amministrazione',
      role: 'La copia dell\'archivio legale, fuori dalla piattaforma',
      hired: 'Contratti firmati, certificati e marche temporali vivono tutti dentro Firebase. Un account compromesso e spariscono con la piattaforma.',
      mandate: [
        'Il 2 del mese prende ogni contratto finalizzato nel mese chiuso',
        'Scarica contratto firmato, certificato FES, fascicolo fiscale, marca temporale, pack registrazione',
        'Uno ZIP con INDICE.txt alla tua casella: Gmail diventa la copia fuori piattaforma'
      ],
      autonomy: {
        solo:  ['Prepara e SPEDISCE lo ZIP alla tua casella'],
        porta: ['Lo ZIP stesso'],
        mai:   ['Non manda niente a nessun altro che te', 'Non cancella niente dalla piattaforma']
      },
      reach: ['operatore', 'file'],
      approval: 'mai',
      crons: ['/api/ops/conservazione'],
      health: null,
      console: null, run: '/api/ops/conservazione'
    },
    {
      key: 'cassaforte', emoji: '🧰', name: 'La Cassaforte', reparto: 'Amministrazione',
      role: 'Il backup notturno del database, fuori dalla piattaforma',
      hired: 'L\'audit del 18/08 l\'ha detto senza giri: il database non aveva UN backup. Contratti, pagamenti e clienti vivevano in un Firestore senza copia.',
      mandate: [
        'Ogni notte legge le collection critiche e le chiude in uno ZIP con INDICE',
        'Posa la copia su Storage (backups/) e la SPEDISCE alla tua casella: Gmail e\' la copia fuori piattaforma',
        'Se una collection e\' illeggibile lo scrive nell\'INDICE e lo dice su Telegram — un buco taciuto e\' un backup bugiardo'
      ],
      autonomy: {
        solo:  ['Prepara, posa su Storage e SPEDISCE lo ZIP alla tua casella'],
        porta: ['Lo ZIP stesso'],
        mai:   ['Non manda niente a nessun altro che te', 'Non cancella e non riscrive MAI un documento']
      },
      reach: ['operatore', 'file'],
      approval: 'mai',
      crons: ['/api/ops/cassaforte'],
      health: null,
      console: null, run: '/api/ops/cassaforte'
    },

    /* ── VETRINA — quello che vede il pubblico ────────────────────────── */
    {
      key: 'fotografo', emoji: '📷', name: 'Il Fotografo', reparto: 'Vetrina',
      role: 'Sceglie la copertina e rimette in ordine le foto',
      hired: 'La foto di copertina decide se un annuncio viene aperto. Nessuno ha tempo di curarle una per una.',
      mandate: [
        'Claude Vision classifica ogni foto: foto vera, render, planimetria, documento, stanza, rotazione, qualità, filigrana',
        'La miglior foto reale diventa copertina; la galleria va soggiorno→cucina→camere→bagno→esterni, planimetrie in fondo',
        'Ritocco con sharp: rotazione, contrasto, preset per foto (le planimetrie non si saturano mai)',
        'Ogni notte alle 03:20 ne cura 3, dalle gallerie più ricche in giù'
      ],
      autonomy: {
        solo:  ['RISCRIVE COPERTINA E GALLERIA DEGLI ANNUNCI PUBBLICI, di notte, senza chiedere'],
        porta: ['Niente: lavora in silenzio'],
        mai:   ['Non cancella mai gli originali (reversibile)', 'Non rimette in circolo le proprie uscite']
      },
      reach: ['vetrina', 'archivio', 'file', 'ai'],
      approval: 'mai',
      crons: ['/api/photos/enhance'],
      health: null,
      console: '/photo-lab', run: null
    },
    {
      key: 'pendolare', emoji: '🚇', name: 'Il Pendolare', reparto: 'Vetrina',
      role: 'I tempi porta-a-porta veri, dal GTFS di Roma Mobilità',
      hired: 'La vetrina prometteva minuti calcolati sulla linea d\'aria: sbagliati a caso. Qualcuno deve misurarli sulla rete vera.',
      mandate: [
        'Scarica il GTFS statico di Roma Mobilità (il sandbox di sviluppo non lo raggiunge: il server pensa)',
        'Costruisce il grafo del trasporto a frequenze: attesa = metà headway misurato, corse medie fra fermate, cambi a piedi',
        'Dijkstra all\'indietro dalle 9 mete (Termini, Sapienza, LUISS…) e griglia ~300 m sulla città',
        'Scrive publicGeo/tempi-roma (lettura pubblica): scheda e skyline lo leggono come leggono il catalogo'
      ],
      autonomy: {
        solo:  ['Rigenera la griglia quando ha più di 6 giorni', 'Aggiorna i minuti mostrati su /listing e /skyline'],
        porta: ['Niente: lavora in silenzio'],
        mai:   ['Non inventa un tempo dove la griglia non copre: la pagina degrada alla stima di prima, dichiarata col ≈', 'Non tocca mai un dato personale: solo orari pubblici e coordinate']
      },
      reach: ['vetrina'],
      approval: 'mai',
      crons: ['/api/ops/gtfs-tempi'],
      health: null,
      console: null, run: '/api/ops/gtfs-tempi'
    },
    {
      key: 'copywriter', emoji: '✍️', name: 'Il Copywriter', reparto: 'Vetrina',
      role: 'Riempie le schede mute',
      hired: 'Una scheda senza testo è invisibile ai motori e incitabile dalle AI. Il 28/07 ne avevamo 10 vuote e 10 col template del bot.',
      mandate: [
        'Ogni notte alle 03:35 riscrive fino a 6 descrizioni, prima le disponibili e mute',
        'Testo bilingue da Claude sui dati veri dell\'immobile'
      ],
      autonomy: {
        solo:  ['RISCRIVE IL TESTO PUBBLICO DELL\'ANNUNCIO'],
        porta: ['Niente: lavora in silenzio'],
        mai:   ['NON RISCRIVE MAI LE PAROLE DI UN UMANO — solo il vuoto e la firma del proprio template', 'Conserva sempre l\'originale in descriptionOriginal']
      },
      reach: ['vetrina', 'archivio', 'ai'],
      approval: 'mai',
      crons: ['/api/wizard/describe'],
      health: null,
      console: null, run: null
    },
    {
      key: 'pagella', emoji: '🎓', name: 'La Pagella', reparto: 'Vetrina',
      role: 'Il lunedì mattina, il voto a ogni annuncio',
      hired: 'Un annuncio senza video e con tre foto non si affitta. Meglio saperlo il lunedì che a fine mese.',
      mandate: [
        'Vota 0-10 ogni annuncio disponibile: video 3, ≥8 foto 2, descrizione ricca 2, data disponibilità 1, deposito 1, concordato 1',
        'Manda i buchi e il comando del bot per chiudere il più grosso'
      ],
      autonomy: {
        solo:  ['Assegna i voti'],
        porta: ['Il messaggio del lunedì mattina — e tace se il catalogo è tutto 10/10'],
        mai:   ['Non modifica gli annunci: dice solo cosa manca']
      },
      reach: ['operatore'],
      approval: 'mai',
      crons: ['/api/wizard/video-radar'],
      health: null,
      console: null, run: '/api/wizard/video-radar'
    },

    /* ── SISTEMI — chi guarda gli altri ───────────────────────────────── */
    {
      key: 'guardiano', emoji: '🛡️', name: 'Il Guardiano', reparto: 'Sistemi',
      role: 'Sorveglia il bot annunci sul Mac',
      hired: 'Un bot morto in silenzio è peggio di un bot che non c\'è: continui a contarci.',
      mandate: [
        'Il bot scrive un battito ogni 60 secondi; questo controlla ogni 10 minuti',
        'Oltre 5 minuti di silenzio → avviso su Telegram, poi uno solo ogni 6 ore, e un messaggio quando torna'
      ],
      autonomy: {
        solo:  ['Decide quando allarmare e quando tacere'],
        porta: ['L\'allarme, e il messaggio di ritorno'],
        mai:   ['Non riavvia niente: non ha le mani sul Mac']
      },
      reach: ['operatore'],
      approval: 'mai',
      crons: ['/api/wizard/health'],
      health: null,
      console: null, run: '/api/wizard/health'
    }
  ];

  var REPARTI = ['Commerciale', 'Operativo', 'Amministrazione', 'Vetrina', 'Sistemi'];

  /* Stato di salute — identico alla regola che team.html usava, in un posto solo. */
  function statusOf(h, now) {
    now = now || Date.now();
    if (!h || !h.lastRunAt) return 'off';
    if (!h.ok) return (h.consecutiveErrors || 0) >= 3 ? 'err' : 'warn';
    var d = h.lastRunAt.toDate ? h.lastRunAt.toDate() : new Date(h.lastRunAt);
    return (now - d.getTime()) > 30 * 3600 * 1000 ? 'warn' : 'ok';
  }

  /* Quanta attenzione merita. Non è "quanto è importante": è quanto costa
   * caro se sbaglia MENTRE nessuno guarda. Chi parla ai clienti o tocca la
   * vetrina senza approvazione sta in cima. */
  function attentionOf(a) {
    if (!a) return 0;
    if (a.approval === 'sempre') return 0;
    var n = 0;
    if (a.reach.indexOf('clienti') >= 0) n += 2;
    if (a.reach.indexOf('vetrina') >= 0) n += 2;
    if (a.reach.indexOf('soldi') >= 0) n += 1;
    if (a.approval === 'parziale') n -= 1;
    return Math.max(0, Math.min(3, n));
  }

  /* Chi può parlare ai tuoi clienti senza chiedertelo. La domanda che un
   * titolare fa per prima, e a cui oggi nessuna pagina risponde. */
  function speaksToClients(team) {
    return (team || TEAM).filter(function (a) {
      return a.approval !== 'sempre' && a.reach.indexOf('clienti') >= 0;
    });
  }

  function byReparto(team) {
    var t = team || TEAM, out = [];
    REPARTI.forEach(function (r) {
      var m = t.filter(function (a) { return a.reparto === r; });
      if (m.length) out.push({ reparto: r, agents: m });
    });
    return out;
  }

  function rollup(team, healthMap, now) {
    var t = team || TEAM, h = healthMap || {}, out = { ok: 0, warn: 0, err: 0, off: 0, total: t.length };
    t.forEach(function (a) { out[statusOf(h[a.key], now)]++; });
    return out;
  }

  /* L'ANTI-DERIVA. La lista a mano di team.html si era fermata a 8 voci e
   * nessuno se n'era accorto, perché niente la confrontava con la realtà.
   * Qui la realtà sono i cron di vercel.json:
   *   unclaimed  — gira un cron che nessun agente dichiara: un dipendente
   *                fantasma, che lavora sui dati veri e non è nell'organigramma
   *   missing    — un agente dichiara un cron che non esiste più
   * Entrambi fanno fallire il test. */
  function driftVsCrons(cronPaths) {
    var real = (cronPaths || []).map(function (p) { return String(p).split('?')[0]; });
    var declared = [];
    TEAM.forEach(function (a) { (a.crons || []).forEach(function (c) { declared.push(c); }); });
    return {
      unclaimed: real.filter(function (p) { return declared.indexOf(p) < 0; }),
      missing:   declared.filter(function (p) { return real.indexOf(p) < 0; })
    };
  }

  function get(key) {
    for (var i = 0; i < TEAM.length; i++) if (TEAM[i].key === key) return TEAM[i];
    return null;
  }

  /* ── LA DIREZIONE ──────────────────────────────────────────────────────
   * Vedere un dipendente e potergli dire "esegui ora" non è dirigerlo. Le
   * soglie con cui lavorano erano costanti nel sorgente: `LATE_AFTER_DAYS = 3`
   * dentro gestore.js, `HUMAN_WINDOW_MS = 20 min` dentro commerciale.js.
   * Cambiare "sollecita dopo 5 giorni invece di 3" voleva dire un deploy.
   *
   * Le manopole vivono qui — UNA definizione letta dal browser E dal server
   * (api/_squadra.js importa questo file), così la console non può mostrare
   * un default diverso da quello in vigore. È la lezione di _avail.js: far
   * modificare all'operatore una regola che non è quella applicata è peggio
   * che non fargli modificare niente.
   *
   * REGOLA DURA: qui stanno SOLO manopole realmente collegate a un agente.
   * Una manopola che non fa niente è peggio di nessuna manopola — la giri,
   * non succede nulla, e da lì in poi non ti fidi più della pagina. Un
   * agente senza `knobs` semplicemente non ne ha ancora.
   */
  var KNOBS = {
    gestore: [
      { key: 'lateAfterDays', label: 'Sollecita il pagamento dopo', unit: 'giorni di ritardo',
        def: 3, min: 0, max: 30, help: 'Sotto questa soglia il ritardo non produce nessuna proposta di sollecito.' },
      { key: 'unsignedAfterDays', label: 'Sollecita la firma dopo', unit: 'giorni dall\'invito',
        def: 3, min: 0, max: 60, help: 'Quanto aspettare prima di proporre il promemoria a chi non ha ancora firmato.' },
      { key: 'renewalHorizonDays', label: 'Segnala i rinnovi con', unit: 'giorni di anticipo',
        def: 90, min: 15, max: 365, help: 'I contratti che scadono entro questa finestra entrano nel digest.' }
    ],
    commerciale: [
      { key: 'humanWindowMin', label: 'Lascia a te i primi', unit: 'minuti',
        def: 20, min: 0, max: 240, help: 'Il tempo che si tiene da parte perché tu risponda a mano. Prima di questo non prepara nulla.' },
      { key: 'followupAfterHours', label: 'Follow-up dopo', unit: 'ore di silenzio',
        def: 48, min: 6, max: 240, help: 'Un solo follow-up, e solo per lead A/B o con intenzione di candidarsi.' },
      { key: 'maxLeadAgeDays', label: 'Non riesumare lead più vecchi di', unit: 'giorni',
        def: 14, min: 1, max: 90, help: 'Oltre questa età il lead è archeologia: nessuna bozza.' },
      { key: 'maxFirstPerRun', label: 'Massimo prime risposte per giro', unit: 'bozze',
        def: 5, min: 0, max: 20, help: 'Tetto per run (gira ogni 2h dalle 06 alle 18). A 0 smette di preparare prime risposte.' },
      { key: 'maxFollowupPerRun', label: 'Massimo follow-up per giro', unit: 'bozze',
        def: 3, min: 0, max: 20, help: 'Tetto per run. A 0 smette di preparare follow-up.' }
    ],
    'lead-brain': [
      { key: 'batchMax', label: 'Lead per chiamata AI', unit: 'lead',
        def: 20, min: 1, max: 50, help: 'Quanti lead ambigui entrano nella singola chiamata a Claude.' },
      { key: 'dailyAiCallCap', label: 'Tetto chiamate AI al giorno', unit: 'chiamate',
        def: 12, min: 0, max: 100, help: 'Il freno di spesa. A 0 il voto resta quello delle regole gratuite, senza AI.' }
    ],
    perito: [
      { key: 'deathcheckBatch', label: 'Verifiche di vita per giro di Homie', unit: 'annunci',
        def: 120, min: 0, max: 500, help: 'Quanti annunci il Mac verifica a ogni passaggio. A 0 le verifiche si fermano (l\'assorbimento invecchia).' },
      { key: 'enrichBatch', label: 'Arricchimenti per giro di Homie', unit: 'annunci',
        def: 40, min: 0, max: 200, help: 'Annunci senza mq o zona da completare leggendo la pagina — la statistica li aspetta.' },
      { key: 'minSample', label: 'Campione minimo per pubblicare un numero', unit: 'annunci',
        def: 5, min: 3, max: 50, help: 'Sotto questa soglia le statistiche di zona dicono "campione insufficiente" invece di un numero debole.' }
    ]
  };

  function knobsFor(key) { return KNOBS[key] || []; }

  /* Legge i valori salvati e restituisce quelli DA USARE.
   *
   * Due severità diverse, di proposito:
   *  • alla PORTA (console, prima di salvare) si RIFIUTA un valore impossibile
   *    invece di aggiustarlo di nascosto — un valore aggiustato in silenzio è
   *    una regola che l'operatore crede di aver messo e non è quella in vigore;
   *  • a RUNTIME (server) non si esplode mai: un valore corrotto — doc
   *    modificato a mano, campo di un'altra versione — torna al default e
   *    finisce in `rejected`, che il chiamante può stampare nel report.
   */
  function resolveKnobs(agentKey, stored) {
    var defs = knobsFor(agentKey), values = {}, rejected = [];
    var src = (stored && typeof stored === 'object') ? stored : {};
    defs.forEach(function (d) {
      var raw = src[d.key];
      if (raw === undefined || raw === null || raw === '') { values[d.key] = d.def; return; }
      var n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
      if (!isFinite(n)) { values[d.key] = d.def; rejected.push({ key: d.key, got: raw, why: 'non è un numero' }); return; }
      n = Math.round(n);
      if (n < d.min || n > d.max) {
        values[d.key] = d.def;
        rejected.push({ key: d.key, got: raw, why: 'fuori dall\'intervallo ' + d.min + '–' + d.max });
        return;
      }
      values[d.key] = n;
    });
    return { values: values, rejected: rejected };
  }

  /* La porta: valida ciò che l'operatore sta per salvare. Rifiuta, non
   * aggiusta. Restituisce { ok, values, errors[] }. */
  function validateKnobs(agentKey, input) {
    var defs = knobsFor(agentKey), values = {}, errors = [];
    defs.forEach(function (d) {
      var raw = (input || {})[d.key];
      if (raw === undefined || raw === null || raw === '') { values[d.key] = d.def; return; }
      var n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
      if (!isFinite(n)) { errors.push(d.label + ': "' + raw + '" non è un numero'); return; }
      if (n !== Math.round(n)) { errors.push(d.label + ': deve essere un numero intero'); return; }
      if (n < d.min || n > d.max) { errors.push(d.label + ': ammesso da ' + d.min + ' a ' + d.max + ' (' + d.unit + ')'); return; }
      values[d.key] = n;
    });
    return { ok: !errors.length, values: values, errors: errors };
  }

  /* Cosa è stato cambiato rispetto ai default — la pagina lo mostra così
   * l'operatore sa quali regole ha toccato senza rileggersele tutte. */
  function knobDiff(agentKey, stored) {
    var r = resolveKnobs(agentKey, stored), defs = knobsFor(agentKey), out = [];
    defs.forEach(function (d) {
      if (r.values[d.key] !== d.def) out.push({ key: d.key, label: d.label, from: d.def, to: r.values[d.key], unit: d.unit });
    });
    return out;
  }

  var API = {
    TEAM: TEAM, REPARTI: REPARTI, REACH: REACH, KNOBS: KNOBS,
    get: get, statusOf: statusOf, attentionOf: attentionOf,
    speaksToClients: speaksToClients, byReparto: byReparto,
    rollup: rollup, driftVsCrons: driftVsCrons,
    knobsFor: knobsFor, resolveKnobs: resolveKnobs,
    validateKnobs: validateKnobs, knobDiff: knobDiff
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_SQUADRA = API;
})(typeof window !== 'undefined' ? window : this);
