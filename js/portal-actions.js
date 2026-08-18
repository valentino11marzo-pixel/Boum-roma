// ═══════════════════════════════════════════════════════════════════════════
// IL PRONTUARIO — js/portal-actions.js
//
// Tutto quello che il portale sa fare, in UNA lista sola.
//
// IL PROBLEMA CHE RISOLVE (segnalato dall'operatore, 2026-08-18): le funzioni
// più utili sono SEPOLTE. Per emettere una ricevuta di pigione oggi si fa
// Contratti → 📜 Template → scorri fino alla card giusta → clic: quattro passi
// per una cosa che si fa dieci volte al mese. E i Template sono solo l'esempio
// più vistoso: la stessa profondità la pagano decine di capacità vere.
//
// La risposta NON è spostare bottoni pagina per pagina (fragile, infinito, e
// ogni pagina diventa una discarica di scorciatoie). La risposta è che le due
// facce del portale hanno già un ingresso universale ciascuna — la Command
// Palette ⌘K sul desktop, il Menu sul telefono — e va riempito con TUTTO.
//
// DISCIPLINA (la stessa di M2/D1: una copia sola):
//   · Questo file è un REGISTRO, non un motore: dichiara, non esegue. Nessuna
//     dipendenza, nessun accesso a Firestore, nessuna logica di dominio.
//   · Un'azione è `{ fn, args }`, MAI una stringa di codice: chi la lancia fa
//     `window[fn](...args)`. Niente eval, e un test può verificare che ogni
//     `fn` dichiarata esista davvero in portal-app.js (la stessa disciplina
//     della mappa WIZ: ciò che è dichiarato deve esistere).
//   · Le azioni CONTESTUALI (il fascicolo di QUEL contratto, il pack di QUEL
//     deal) non stanno qui: senza un record selezionato sarebbero un bottone
//     che non sa su cosa agire. Qui stanno le azioni che hanno senso da
//     qualunque punto — più le sezioni dove quelle contestuali vivono.
//
// Chi lo legge: js/portal-desktop.js (⌘K) e js/portal-mobile.js (Menu).
// Test: node tests/actions/run.mjs — ogni fn esiste, ogni template è reale.
// ═══════════════════════════════════════════════════════════════════════════
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.BOOM_ACTIONS = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ── I 22 documenti al volo (openTemplateModal) ──────────────────────
    // Etichette e ordine presi dalla mappa `titles` di openTemplateModal:
    // se là cambia un tipo, il test lo prende prima della produzione.
    var DOCS = [
        ['ricevuta_pigione',     '💰', 'Ricevuta pigione',        'ricevuta canone pigione affitto quietanza mensile'],
        ['sollecito_pagamento',  '⚠️', 'Sollecito pagamento',     'sollecito ritardo insoluto mora arretrato'],
        ['deposit_receipt',      '🏦', 'Ricevuta deposito',       'ricevuta deposito cauzione caparra'],
        ['ricevuta_provvigione', '💼', 'Ricevuta provvigione',    'ricevuta provvigione commissione compenso'],
        ['disdetta',             '❌', 'Disdetta contratto',      'disdetta recesso cessazione fine contratto'],
        ['proposta_locazione',   '📨', 'Proposta di locazione',   'proposta locazione offerta affitto'],
        ['accettazione_proposta','✅', 'Accettazione proposta',   'accettazione proposta conferma'],
        ['lettera_incarico',     '📝', "Lettera d'incarico",      'incarico mandato lettera nomina'],
        ['mandato_gestione',     '📜', 'Mandato di gestione',     'mandato gestione property management'],
        ['rental_transitorio',   '⏱️', 'Contratto transitorio',   'contratto transitorio locazione 18 mesi'],
        ['rental_studenti',      '🎓', 'Contratto studenti',      'contratto studenti universitario allegato c'],
        ['rental_4plus4',        '🏢', 'Contratto 4+4',           'contratto 4+4 ordinario libero'],
        ['handover',             '🔑', 'Verbale di consegna',     'verbale consegna chiavi riconsegna'],
        ['inventory',            '📦', 'Inventario',              'inventario arredi mobili elenco'],
        ['stato_immobile',       '🏠', "Stato dell'immobile",     'stato immobile condizioni sopralluogo'],
        ['comunicazione_istat',  '📈', 'Comunicazione ISTAT',     'istat adeguamento aggiornamento canone'],
        ['rendiconto_annuale',   '📊', 'Rendiconto annuale',      'rendiconto annuale proprietario resoconto'],
        ['quote',                '💰', 'Preventivo',              'preventivo quote offerta prezzo'],
        ['proposal',             '📊', 'Proposta servizi',        'proposta servizi presentazione'],
        ['pfs',                  '🏠', 'Contratto Property Finding', 'pfs property finding ricerca casa 350'],
        ['das',                  '📋', 'Contratto Deal Assistance',  'das deal assistance assistenza 249'],
        ['vv',                   '🎥', 'Contratto Virtual Viewing',  'vv virtual viewing visita video 89']
    ];

    var ACTIONS = [];

    DOCS.forEach(function (d) {
        ACTIONS.push({
            id: 'doc:' + d[0], group: 'Documenti', icon: d[1], label: d[2],
            keywords: d[3] + ' documento modulo template stampa pdf',
            fn: 'openTemplateModal', args: [d[0]], admin: true
        });
    });

    // ── Creare (i modali di inserimento) ────────────────────────────────
    [
        ['addContract', '📋', 'Nuovo contratto',   'contratto nuovo locazione stipula', 'n c'],
        ['addProperty', '🏠', 'Nuovo immobile',    'immobile casa appartamento nuovo',  'n i'],
        ['addUser',     '👥', 'Nuovo utente',      'utente inquilino proprietario anagrafica', 'n u'],
        ['addPayment',  '💳', 'Registra pagamento','pagamento rata incasso registra',   'n p'],
        ['addInvoice',  '🧾', 'Nuova fattura',     'fattura fatturazione emetti',       'n f'],
        ['addMaintenance', '🔧', 'Nuova manutenzione', 'manutenzione guasto intervento riparazione', ''],
        ['addTask',     '✅', 'Nuovo task',        'task attività promemoria da fare',  ''],
        ['addDeadline', '📅', 'Nuova scadenza',    'scadenza deadline termine',         ''],
        ['addListing',  '🏢', 'Nuovo annuncio vetrina', 'annuncio vetrina listing pubblica', ''],
        ['addClient',   '💼', 'Nuovo cliente CRM', 'cliente crm lead trattativa',       ''],
        ['bulkPayments','📅', 'Genera pagamenti multipli', 'pagamenti multipli bulk scadenzario genera rate', '']
    ].forEach(function (c) {
        ACTIONS.push({
            id: 'new:' + c[0], group: 'Crea', icon: c[1], label: c[2],
            keywords: c[3] + ' crea nuovo aggiungi', chord: c[4],
            fn: 'openModal', args: [c[0]], admin: true
        });
    });

    // ── Strumenti (azioni globali che non aprono un semplice form) ──────
    ACTIONS.push(
        { id: 'tool:availability', group: 'Strumenti', icon: '📅', label: 'Disponibilità visite',
          keywords: 'disponibilita visite orari finestre calendario slot prenotazioni',
          fn: 'openModal', args: ['availability'], admin: true },
        { id: 'tool:magicsign', group: 'Strumenti', icon: '✨', label: 'Magic Sign — editor',
          keywords: 'magic sign firma editor pdf campi firmare',
          fn: 'openMagicSignEditor', args: [], admin: true },
        { id: 'tool:auditcanone', group: 'Strumenti', icon: '🔍', label: 'Audit canone su tutti i contratti',
          keywords: 'audit canone verifica matematica controllo contratti',
          fn: 'boomAuditAllContracts', args: [], admin: true },
        { id: 'tool:newclient', group: 'Strumenti', icon: '🚀', label: 'Nuovo cliente → contratto firmato',
          keywords: 'wizard nuovo cliente contratto firmato deal completo',
          fn: 'openNewClientWizard', args: [], admin: true },

        // ── Le altre capacità che il censimento (2026-08-18) ha trovato
        //    sepolte a 2-3 passi dentro una pagina specifica. Qui entrano
        //    SOLO quelle lanciabili senza un record già scelto: una funzione
        //    che pretende un contractId non saprebbe su cosa agire da una
        //    ricerca globale, e resta dove vive (nella riga del record).
        { id: 'tool:onboardlink', group: 'Strumenti', icon: '🔗', label: 'Copia link onboarding cliente',
          keywords: 'onboarding link invito registrazione nuovo cliente copia',
          fn: 'copyOnboardingLink', args: [], admin: true },
        { id: 'tool:viewhours', group: 'Strumenti', icon: '🕐', label: 'Orari disponibilità visite',
          keywords: 'orari visite agenda finestre disponibilita appuntamenti slot',
          fn: 'openAvailabilityModal', args: [], admin: true },
        { id: 'tool:checkin', group: 'Strumenti', icon: '📷', label: 'Check-in visita (scansiona QR)',
          keywords: 'checkin check-in qr scan visita pass arrivo',
          fn: 'openCheckInScan', args: [], admin: true },
        { id: 'tool:docupload', group: 'Strumenti', icon: '📤', label: 'Carica documento (con OCR)',
          keywords: 'carica documento upload ocr scansione allega file',
          fn: 'openDocUploadModal', args: [], admin: true },
        { id: 'tool:msgportali', group: 'Strumenti', icon: '📣', label: 'Messaggi per i portali (IT)',
          keywords: 'messaggio portali immobiliare idealista annuncio testo proprietario',
          fn: 'openMessageGeneratorLandlord', args: [], admin: true },
        { id: 'tool:msgclienti', group: 'Strumenti', icon: '💬', label: 'Messaggi WhatsApp ai clienti (EN)',
          keywords: 'messaggio whatsapp cliente follow up testo inglese',
          fn: 'openMessageGeneratorClient', args: [], admin: true },
        { id: 'tool:referral', group: 'Strumenti', icon: '🎁', label: 'Genera Referral Pass',
          keywords: 'referral pass codice invito amico segnalazione',
          fn: 'openModal', args: ['generateReferral'], admin: true },
        { id: 'tool:landlorddata', group: 'Strumenti', icon: '📨', label: 'Chiedi i dati a tutti i proprietari',
          keywords: 'proprietari dati richiesta massivo anagrafica locatori',
          fn: 'bulkRequestLandlordData', args: [], admin: true },
        { id: 'tool:newreg', group: 'Strumenti', icon: '📝', label: 'Nuova registrazione RLI',
          keywords: 'rli registrazione agenzia entrate contratto adempimento',
          fn: 'openNewRegistration', args: [], admin: true },
        { id: 'tool:radarnew', group: 'Strumenti', icon: '📡', label: 'Radar: nuova ricerca',
          keywords: 'radar ricerca annunci nuova portali monitoraggio',
          fn: 'openRadarEditor', args: [], admin: true },
        { id: 'tool:radarscan', group: 'Strumenti', icon: '🛰️', label: 'Radar: scansiona adesso',
          keywords: 'radar scansiona scan adesso annunci aggiorna',
          fn: 'scanAllRadar', args: [], admin: true },
        { id: 'tool:newlandlord', group: 'Strumenti', icon: '🏘️', label: 'Nuovo proprietario in rubrica',
          keywords: 'proprietario landlord rubrica contatto nuovo',
          fn: 'openAddLandlord', args: [], admin: true },
        { id: 'tool:newpfs', group: 'Strumenti', icon: '🔎', label: 'Nuovo cliente PFS',
          keywords: 'pfs cliente ricerca casa property finding nuovo',
          fn: 'openPFSAddClient', args: [], admin: true },
        { id: 'tool:newconv', group: 'Strumenti', icon: '📨', label: 'Nuova conversazione (Inbox)',
          keywords: 'conversazione inbox messaggio nuovo contatto',
          fn: 'inboxOpenNewModal', args: [], admin: true },
        { id: 'tool:rules', group: 'Strumenti', icon: '⚡', label: 'Esegui tutte le automazioni',
          keywords: 'automazioni regole esegui trigger adesso',
          fn: 'runAllRules', args: [], admin: true },
        { id: 'tool:newrule', group: 'Strumenti', icon: '⚙️', label: 'Nuova regola automatica',
          keywords: 'regola automazione trigger nuova crea',
          fn: 'openRuleModal', args: [], admin: true },
        { id: 'tool:automations', group: 'Strumenti', icon: '🔁', label: 'Controlla scadenze e avvisi',
          keywords: 'automazioni scadenze avvisi controlli run boom',
          fn: 'runBoomAutomations', args: [], admin: true },
        { id: 'tool:refresh', group: 'Strumenti', icon: '🔄', label: 'Ricarica i dati dal database',
          keywords: 'ricarica refresh aggiorna dati sincronizza',
          fn: 'forceRefreshData', args: [], admin: true },
        { id: 'tool:docparser', group: 'Strumenti', icon: '🤖', label: 'Doc Parser AI (estrai dati da PDF)',
          keywords: 'parser ai documento estrai pdf lettura automatica',
          fn: 'open', args: ['/boom_doc_parser.html'], admin: true },
        // Recuperata: il bottone esiste SOLO nell'empty-state di AdminFlats,
        // quindi spariva per sempre appena c'era un annuncio in catalogo.
        { id: 'tool:seedlistings', group: 'Strumenti', icon: '📥', label: 'Importa annunci esistenti',
          keywords: 'importa annunci seed listing esistenti caricamento massivo',
          fn: 'open', args: ['/seed-listings.html'], admin: true }
    );

    // ── Esportazioni (erano un bottone per pagina, ora si cercano) ──────
    [
        ['exportPropertiesCSV', '📊', 'Esporta immobili in CSV', 'csv export immobili excel elenco scarica'],
        ['exportPaymentsCSV',   '📊', 'Esporta pagamenti in CSV', 'csv export pagamenti excel rate scarica'],
        ['exportInvoicesCSV',   '📊', 'Esporta fatture in CSV',   'csv export fatture excel scarica'],
        ['exportDocumentsCSV',  '📊', 'Esporta documenti in CSV', 'csv export documenti excel elenco scarica']
    ].forEach(function (e) {
        ACTIONS.push({
            id: 'exp:' + e[0], group: 'Esporta', icon: e[1], label: e[2],
            keywords: e[3], fn: e[0], args: [], admin: true
        });
    });

    // ── Fattura rapida di servizio (il tipo è una scelta chiusa) ────────
    [['DAS', '💼', 'Deal Assistance'], ['VV', '🔑', 'Virtual Viewing'],
     ['PM', '🏠', 'Property Management'], ['custom', '🧾', 'importo libero']].forEach(function (q) {
        ACTIONS.push({
            id: 'inv:' + q[0], group: 'Crea', icon: q[1],
            label: 'Fattura rapida — ' + q[2],
            keywords: 'fattura rapida servizio incasso ' + q[0] + ' ' + q[2],
            fn: 'openQuickInvoiceModal', args: [q[0]], admin: true
        });
    });

    // ── Le sezioni (per arrivarci scrivendo, e per le azioni contestuali:
    //    "il fascicolo di QUEL contratto" vive nella riga del contratto) ──
    [
        ['dashboard',   '📊', 'Oggi — dashboard',    'oggi dashboard home riepilogo'],
        ['contracts',   '📋', 'Contratti',           'contratti locazioni fascicolo pack verbale firme'],
        ['payments',    '💳', 'Pagamenti',           'pagamenti rate incassi scaduti canone'],
        ['viewings',    '📅', 'Visite',              'visite appuntamenti viewing sopralluoghi'],
        ['leads',       '📬', 'Lead',                'lead richieste contatti pipeline'],
        ['clienti',     '👥', 'Clienti',             'clienti crm pfs anagrafiche'],
        ['properties',  '🏠', 'Immobili',            'immobili case appartamenti portafoglio'],
        ['invoices',    '🧾', 'Fatture',             'fatture fatturazione incassi'],
        ['maintenance', '🔧', 'Manutenzioni',        'manutenzioni guasti interventi'],
        ['documents',   '📁', 'Documenti',           'documenti archivio file caricati'],
        ['templates',   '📜', 'Template documenti',  'template modelli documenti moduli'],
        ['users',       '👤', 'Utenti',              'utenti account ruoli'],
        ['commercialista', '🧮', 'Commercialista',   'commercialista fiscale tasse taxpack'],
        ['burocrazia',  '📝', 'Burocrazia',          'burocrazia registrazioni rli adempimenti'],
        ['inbox',       '📨', 'Inbox',               'inbox messaggi whatsapp conversazioni'],
        ['squadra',     '🤖', 'La Squadra',          'squadra agenti automazioni cron salute'],
        ['rules',       '⚡', 'Regole & automazioni','regole automazioni trigger'],
        ['bonifica',    '🧹', 'Bonifica dati',       'bonifica pulizia dati test duplicati'],
        ['innesto',     '🌱', 'Innesto dati',        'innesto importa incolla contratto ai'],
        ['settings',    '⚙️', 'Impostazioni',        'impostazioni configurazione azienda iban']
    ].forEach(function (s) {
        ACTIONS.push({
            id: 'go:' + s[0], group: 'Vai a', icon: s[1], label: s[2],
            keywords: s[3] + ' sezione pagina vai apri', fn: 'goTo', args: [s[0]], admin: false
        });
    });

    // ── Le console satellite (pagine proprie, si aprono in una scheda) ──
    [
        ['/team',    '🤖', 'Console — La Squadra',   'squadra team agenti salute cron'],
        ['/banca',   '🏦', 'Console — Banca & Fisco','banca movimenti riconciliazione estratto conto'],
        ['/pfs-command', '🛰️', 'Console — PFS Command', 'pfs radar command center ricerche clienti'],
        ['/photo-lab', '🎞️', 'Console — Photo Lab',  'foto photo lab migliora immagini ai'],
        ['/media-studio', '🎨', 'Console — Media Studio', 'media studio foto video reel copy'],
        ['/manuale', '🏠', 'Console — Manuale casa', 'manuale casa wifi istruzioni inquilino'],
        ['/salute',  '🩺', 'Console — Salute sistema', 'salute sistema errori heartbeat stato'],
        ['/scheda-canone', '📐', 'Console — Scheda canone', 'canone concordato scheda calcolo fasce arpe'],
        ['/pre-agreement-admin', '🖋️', 'Console — Pre-agreement', 'preagreement proposta deal atto magic sign']
    ].forEach(function (c) {
        ACTIONS.push({
            id: 'console:' + c[0], group: 'Console', icon: c[1], label: c[2],
            keywords: c[3] + ' console strumento pagina', fn: 'open', args: [c[0]], admin: true
        });
    });

    // ── Ricerca: normalizzazione + punteggio ────────────────────────────
    // Accento-insensibile e parola-per-parola: "ricev pig" trova la ricevuta
    // di pigione. L'operatore non scrive mai il nome esatto.
    function norm(s) {
        s = String(s == null ? '' : s).toLowerCase();
        try { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { return s; }
    }
    function scoreOne(a, term) {
        var lab = norm(a.label), kw = norm(a.keywords || '');
        if (lab.indexOf(term) === 0) return 100;              // inizia col termine
        if (lab.indexOf(' ' + term) !== -1) return 70;        // inizio di una parola
        if (lab.indexOf(term) !== -1) return 45;              // dentro l'etichetta
        if ((' ' + kw).indexOf(' ' + term) !== -1) return 30; // parola chiave intera
        if (kw.indexOf(term) !== -1) return 12;               // dentro una chiave
        return 0;
    }
    // TUTTI i termini devono trovare qualcosa (AND): due parole restringono,
    // non allargano — altrimenti la seconda parola non servirebbe a niente.
    function score(a, terms) {
        var tot = 0;
        for (var i = 0; i < terms.length; i++) {
            var s = scoreOne(a, terms[i]);
            if (!s) return 0;
            tot += s;
        }
        return tot;
    }
    function search(query, opts) {
        opts = opts || {};
        var isAdmin = opts.isAdmin !== false;
        var pool = ACTIONS.filter(function (a) { return isAdmin || !a.admin; });
        var terms = norm(query).split(/\s+/).filter(Boolean);
        if (!terms.length) {
            var head = opts.limit || 8;
            return pool.filter(function (a) { return a.group === 'Crea' || a.group === 'Vai a'; }).slice(0, head);
        }
        return pool
            .map(function (a) { return { a: a, s: score(a, terms) }; })
            .filter(function (x) { return x.s > 0; })
            .sort(function (x, y) { return y.s - x.s; })
            .slice(0, opts.limit || 12)
            .map(function (x) { return x.a; });
    }
    // L'esecuzione sta QUI in un posto solo: chi chiama non compone mai codice.
    function run(action, win) {
        var w = win || (typeof window !== 'undefined' ? window : null);
        if (!w || !action) return false;
        var f = w[action.fn];
        if (typeof f !== 'function') return false;
        f.apply(w, action.args || []);
        return true;
    }

    return {
        version: 'P1',
        ACTIONS: ACTIONS,
        DOC_TYPES: DOCS.map(function (d) { return d[0]; }),
        search: search,
        run: run,
        norm: norm
    };
}));
