/* BOOM DataOps Engine — motore puro per LA BONIFICA e L'INNESTO.
 *
 * Nessuna dipendenza, nessun I/O: solo funzioni pure che decidono
 *   (a) quali documenti PUZZANO di dato di test  → LA BONIFICA
 *   (b) se un dato importato è valido e a chi va collegato → L'INNESTO
 *
 * Sta qui, fuori da portal-app.js, per un motivo preciso: queste decisioni
 * cancellano documenti veri e creano contratti veri, quindi devono essere
 * testabili senza browser e senza Firestore (`node tests/dataops/test.mjs`).
 *
 * Espone window.BOOM_DATAOPS (browser) e module.exports (node/test).
 *
 * PRINCIPIO NON NEGOZIABILE — "nel dubbio, si tiene":
 * il classificatore non cancella nulla e non seleziona nulla da solo. Marca,
 * spiega il perché in italiano leggibile, e mette un lucchetto (`protected`)
 * su tutto ciò che ha peso legale o economico. La spunta la mette l'umano.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.BOOM_DATAOPS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // ══════════════════════════════════════════════════════════════════
    // PARTE 1 — LA BONIFICA: riconoscere il dato di test
    // ══════════════════════════════════════════════════════════════════

    // Parole che in un dato REALE non compaiono quasi mai come nome/titolo.
    // Volutamente ancorate a confini di parola: "Prova" sì, "Provenzale" no,
    // "test" sì, "Testaccio" NO (è un quartiere di Roma vero: la parola
    // intera con confini lo salva, ed è esattamente il tipo di falso
    // positivo che qui costerebbe caro).
    var TEST_WORDS = [
        'test', 'testing', 'prova', 'prove', 'demo', 'esempio', 'example',
        'sample', 'fake', 'finto', 'dummy', 'placeholder', 'lorem', 'ipsum',
        'asdf', 'asd', 'qwerty', 'qwe', 'xxx', 'yyy', 'zzz', 'aaa',
        'foo', 'bar', 'baz', 'pippo', 'pluto', 'paperino', 'topolino',
        'mario rossi', 'john doe', 'jane doe', 'nome cognome', 'tizio', 'caio'
    ];
    var TEST_RE = new RegExp('(^|[^\\p{L}])(' + TEST_WORDS
        .map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); })
        .join('|') + ')($|[^\\p{L}])', 'iu');

    // Domini email che esistono per non esistere.
    var TEST_EMAIL_RE = /@(example\.(com|org|net)|test\.|testing\.|localhost|mailinator\.com|yopmail\.|tempmail|guerrillamail|10minutemail|fake\.|invalid)/i;
    var TEST_EMAIL_LOCAL_RE = /^(test|prova|demo|fake|asdf|qwerty|noreply|nessuno|xxx)[0-9._-]*@/i;

    // Numeri che nessuno ha mai risposto.
    var TEST_PHONE_RE = /^(\+?39)?[\s.-]*(0{5,}|1{5,}|1234567|12345678|9{5,}|123456789)/;

    function txt(v) { return v == null ? '' : String(v); }
    function low(v) { return txt(v).trim().toLowerCase(); }

    function looksTestString(s) {
        s = txt(s).trim();
        if (!s) return false;
        return TEST_RE.test(s);
    }
    function looksTestEmail(s) {
        s = low(s);
        if (!s) return false;
        return TEST_EMAIL_RE.test(s) || TEST_EMAIL_LOCAL_RE.test(s);
    }
    function looksTestPhone(s) {
        s = txt(s).replace(/[^\d+]/g, '');
        if (!s) return false;
        return TEST_PHONE_RE.test(s);
    }

    // I campi che descrivono "chi/cosa è" questo documento: solo su questi
    // cerchiamo le parole-spia. Cercarle in note/descrizioni libere farebbe
    // esplodere i falsi positivi ("contratto di prova gratuita", "demo
    // dell'appartamento al cliente"...).
    var NAME_FIELDS = ['name', 'title', 'nome', 'fullName', 'label',
        'propertyName', 'tenantName', 'landlordName', 'clientName', 'subject'];

    function anyNameLooksTest(d) {
        for (var i = 0; i < NAME_FIELDS.length; i++) {
            if (looksTestString(d[NAME_FIELDS[i]])) return NAME_FIELDS[i];
        }
        return null;
    }

    // ── Il lucchetto: cosa NON si tocca mai a cuor leggero ─────────────
    // Un documento è "protetto" quando cancellarlo distrugge una prova
    // legale o una traccia di denaro. Resta visibile e selezionabile a mano
    // (l'operatore comanda), ma parte sempre deselezionato e con l'avviso.
    function isProtected(collection, d) {
        d = d || {};
        switch (collection) {
            case 'payments':
                return d.status === 'paid' || !!d.paidVia || !!d.paidDate
                    || !!d.stripeSessionId || !!d.receiptUrl;
            case 'contracts':
                return !!d.tenantSignature || !!d.landlordSignature
                    || d.signatureStatus === 'signed' || d.signatureStatus === 'completed'
                    || !!d.registrationNumber || !!d.registeredAt;
            case 'invoices':
                return d.status === 'paid' || !!d.paidAt || !!d.number;
            case 'documents':
                return !!d.url || !!d.storagePath;
            case 'users':
                // Un utente con ruolo operativo o con contratti collegati non
                // è mai "dato di test" cancellabile in blocco.
                return d.role === 'admin';
            case 'preAgreements':
                return d.status === 'accepted' || d.status === 'paid';
            default:
                return false;
        }
    }

    // ── Riferimenti rotti (orfani) ─────────────────────────────────────
    // Un pagamento il cui contratto non esiste più è rumore puro: sporca i
    // totali, i badge e le notifiche. Ma è anche il segnale più delicato,
    // perché dipende da COSA è stato caricato. Regola: l'indice contiene una
    // chiave SOLO per le collezioni davvero caricate. Chiave assente = non so
    // → taccio (mai dichiarare orfano un dato che non ho letto). Chiave
    // presente e vuota = ho letto, è vuota davvero → l'orfano è reale.
    var REFS = {
        payments:      [['contractId', 'contracts'], ['propertyId', 'properties'], ['tenantId', 'users']],
        contracts:     [['propertyId', 'properties'], ['tenantId', 'users']],
        maintenance:   [['propertyId', 'properties']],
        notifications: [['userId', 'users']],
        documents:     [['userId', 'users']],
        properties:    [['ownerId', 'users']]
    };

    function orphanReasons(collection, d, index) {
        var out = [];
        var refs = REFS[collection] || [];
        for (var i = 0; i < refs.length; i++) {
            var field = refs[i][0], target = refs[i][1];
            var val = d[field];
            if (!val) continue;                       // campo assente: non è un orfano
            var ids = index[target];
            if (!ids) continue;                       // collezione non caricata: si tace
            if (!ids.has(String(val))) {
                out.push('riferimento rotto: ' + field + ' punta a un documento ' + target + ' che non esiste');
            }
        }
        return out;
    }

    /**
     * Classifica UN documento.
     * @returns {{flagged:boolean, reasons:string[], protected:boolean, severity:'alta'|'media'|'bassa'}}
     */
    function classifyDoc(collection, doc, opts) {
        opts = opts || {};
        var index = opts.index || {};
        var now = opts.now ? new Date(opts.now) : new Date();
        var d = doc || {};
        var reasons = [];

        var nameField = anyNameLooksTest(d);
        if (nameField) reasons.push('il campo "' + nameField + '" contiene una parola da dato di prova ("' + txt(d[nameField]).trim() + '")');
        if (looksTestEmail(d.email)) reasons.push('email non recapitabile (' + txt(d.email).trim() + ')');
        if (looksTestPhone(d.phone)) reasons.push('telefono non reale (' + txt(d.phone).trim() + ')');
        if (d.isTest === true || d.demo === true || d.seed === true) reasons.push('marcato come dato di prova nel documento stesso');

        reasons = reasons.concat(orphanReasons(collection, d, index));

        // Notifiche: la fonte principale di rumore. Una notifica già letta e
        // vecchia non serve più a nessuno; non ha alcun valore legale.
        if (collection === 'notifications') {
            var created = toDate(d.createdAt);
            var days = created ? Math.floor((now - created) / 86400000) : null;
            var keepDays = opts.notificationKeepDays == null ? 30 : opts.notificationKeepDays;
            if (d.read === true && days != null && days > keepDays) {
                reasons.push('notifica già letta e vecchia di ' + days + ' giorni');
            }
            if (days != null && days > 365) {
                reasons.push('notifica di oltre un anno fa');
            }
        }

        var prot = isProtected(collection, d);
        // Severità = quanto sono sicuro che sia spazzatura.
        //   alta  → più segnali indipendenti, oppure marcatura esplicita
        //   media → un segnale forte (nome/email di test, riferimento rotto)
        //   bassa → solo anzianità (notifiche)
        var strong = reasons.filter(function (r) {
            return r.indexOf('parola da dato di prova') >= 0
                || r.indexOf('non recapitabile') >= 0
                || r.indexOf('riferimento rotto') >= 0
                || r.indexOf('marcato come dato di prova') >= 0;
        }).length;
        var severity = strong >= 2 ? 'alta' : strong === 1 ? 'media' : 'bassa';

        return {
            flagged: reasons.length > 0,
            reasons: reasons,
            protected: prot,
            severity: severity
        };
    }

    function toDate(v) {
        if (!v) return null;
        if (v instanceof Date) return isNaN(v) ? null : v;
        if (typeof v === 'object' && typeof v.toDate === 'function') {
            try { var x = v.toDate(); return isNaN(x) ? null : x; } catch (e) { return null; }
        }
        if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
        var d = new Date(v);
        return isNaN(d) ? null : d;
    }

    /**
     * Scansiona l'intero dataset già in memoria nel portale.
     * @param {Object} dataset  { collezione: [ {id, ...campi} ] }
     * @returns {{groups:Array, totals:Object}}
     */
    function scanDataset(dataset, opts) {
        opts = opts || {};
        dataset = dataset || {};
        // Indice degli id realmente esistenti, per la caccia agli orfani.
        var index = {};
        Object.keys(dataset).forEach(function (c) {
            index[c] = new Set((dataset[c] || []).map(function (d) { return String(d.id); }));
        });

        var groups = [];
        var totals = { scanned: 0, flagged: 0, protected: 0, alta: 0, media: 0, bassa: 0 };

        Object.keys(dataset).forEach(function (collection) {
            var rows = dataset[collection] || [];
            var items = [];
            rows.forEach(function (doc) {
                totals.scanned++;
                var v = classifyDoc(collection, doc, { index: index, now: opts.now, notificationKeepDays: opts.notificationKeepDays });
                if (!v.flagged) return;
                totals.flagged++;
                if (v.protected) totals.protected++;
                totals[v.severity]++;
                items.push({
                    id: doc.id,
                    collection: collection,
                    label: docLabel(collection, doc),
                    reasons: v.reasons,
                    protected: v.protected,
                    severity: v.severity,
                    // Preselezione: SOLO alta severità e non protetto. Tutto il
                    // resto richiede una spunta consapevole.
                    preselected: v.severity === 'alta' && !v.protected
                });
            });
            if (items.length) {
                items.sort(function (a, b) {
                    var rank = { alta: 0, media: 1, bassa: 2 };
                    return rank[a.severity] - rank[b.severity] || String(a.label).localeCompare(String(b.label));
                });
                groups.push({ collection: collection, items: items });
            }
        });

        groups.sort(function (a, b) { return b.items.length - a.items.length; });
        return { groups: groups, totals: totals };
    }

    // Etichetta leggibile: l'operatore deve capire COSA sta per cancellare
    // senza aprire Firestore.
    function docLabel(collection, d) {
        d = d || {};
        switch (collection) {
            case 'notifications': return (d.title || 'Notifica') + (d.message ? ' — ' + txt(d.message).slice(0, 60) : '');
            case 'payments':      return '€' + (d.amount != null ? d.amount : '?') + ' · ' + (d.month || d.dueDate || '');
            case 'contracts':     return (d.type || 'contratto') + ' · ' + (d.startDate || '') + ' → ' + (d.endDate || '');
            case 'maintenance':   return d.title || d.category || 'Manutenzione';
            case 'documents':     return d.name || d.title || 'Documento';
            default:              return d.name || d.title || d.email || d.id || '(senza nome)';
        }
    }

    /**
     * Cancellare un contratto e lasciare vivi i suoi pagamenti crea proprio
     * gli orfani che stiamo togliendo. Questa funzione dice cosa si trascina
     * dietro una selezione, così la UI lo mostra PRIMA di eseguire.
     */
    function cascadeFor(selection, dataset) {
        var extra = [];
        var sel = {};
        (selection || []).forEach(function (s) {
            (sel[s.collection] = sel[s.collection] || new Set()).add(String(s.id));
        });
        var already = function (c, id) { return sel[c] && sel[c].has(String(id)); };

        if (sel.contracts) {
            (dataset.payments || []).forEach(function (p) {
                if (p.contractId && sel.contracts.has(String(p.contractId)) && !already('payments', p.id)) {
                    extra.push({ collection: 'payments', id: p.id, label: docLabel('payments', p),
                        reasons: ['resterebbe orfano: il suo contratto è tra i documenti selezionati'],
                        protected: isProtected('payments', p), severity: 'media', preselected: false });
                }
            });
        }
        if (sel.properties) {
            (dataset.contracts || []).forEach(function (c) {
                if (c.propertyId && sel.properties.has(String(c.propertyId)) && !already('contracts', c.id)) {
                    extra.push({ collection: 'contracts', id: c.id, label: docLabel('contracts', c),
                        reasons: ['resterebbe orfano: il suo immobile è tra i documenti selezionati'],
                        protected: isProtected('contracts', c), severity: 'media', preselected: false });
                }
            });
        }
        return extra;
    }

    // ══════════════════════════════════════════════════════════════════
    // PARTE 2 — L'INNESTO: validare e agganciare il dato reale
    // ══════════════════════════════════════════════════════════════════

    // ── Codice fiscale: checksum vero, non "sono 16 caratteri" ─────────
    var CF_ODD = { '0':1,'1':0,'2':5,'3':7,'4':9,'5':13,'6':15,'7':17,'8':19,'9':21,
        'A':1,'B':0,'C':5,'D':7,'E':9,'F':13,'G':15,'H':17,'I':19,'J':21,'K':2,'L':4,
        'M':18,'N':20,'O':11,'P':3,'Q':6,'R':8,'S':12,'T':14,'U':16,'V':10,'W':22,
        'X':25,'Y':24,'Z':23 };
    function cfEvenVal(ch) {
        if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
        return ch.charCodeAt(0) - 65;
    }
    // Il formato accetta le lettere di omocodia (L M N P Q R S T U V al posto
    // delle cifre): un CF omocodo è valido a tutti gli effetti e rifiutarlo
    // bloccherebbe una persona vera allo sportello.
    var CF_RE = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

    function validateCF(cf) {
        var s = txt(cf).toUpperCase().replace(/\s/g, '');
        if (!s) return { valid: false, reason: 'mancante' };
        if (s.length !== 16) return { valid: false, reason: 'deve essere di 16 caratteri (ne ha ' + s.length + ')' };
        if (!CF_RE.test(s)) return { valid: false, reason: 'formato non valido' };
        var sum = 0;
        for (var i = 0; i < 15; i++) {
            var ch = s[i];
            sum += (i % 2 === 0) ? CF_ODD[ch] : cfEvenVal(ch);   // i pari = posizioni DISPARI (1-based)
        }
        var expected = String.fromCharCode(65 + (sum % 26));
        if (expected !== s[15]) {
            return { valid: false, reason: 'carattere di controllo errato (atteso ' + expected + ', trovato ' + s[15] + ')' };
        }
        return { valid: true, value: s };
    }

    // ── IBAN: mod-97, così un refuso non diventa un bonifico perso ─────
    function validateIBAN(iban) {
        var s = txt(iban).toUpperCase().replace(/[\s-]/g, '');
        if (!s) return { valid: false, reason: 'mancante' };
        if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(s)) return { valid: false, reason: 'formato non valido' };
        if (s.slice(0, 2) === 'IT' && s.length !== 27) {
            return { valid: false, reason: 'un IBAN italiano ha 27 caratteri (ne ha ' + s.length + ')' };
        }
        var re = s.slice(4) + s.slice(0, 4);
        var rem = 0;
        for (var i = 0; i < re.length; i++) {
            var c = re[i];
            var val = (c >= '0' && c <= '9') ? c : String(c.charCodeAt(0) - 55);
            for (var j = 0; j < val.length; j++) rem = (rem * 10 + Number(val[j])) % 97;
        }
        if (rem !== 1) return { valid: false, reason: 'cifre di controllo errate (IBAN inesistente o con un refuso)' };
        return { valid: true, value: s };
    }

    function isISODate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(txt(s)); }

    // ── Partita IVA / CF numerico (11 cifre, Luhn mod 10) ──────────────
    // Il locatore può essere una società: «Il/La sig./soc.» sull'Allegato B.
    function validatePIva(p) {
        var s = txt(p).replace(/\s/g, '');
        if (!s) return { valid: false, reason: 'mancante' };
        if (!/^\d{11}$/.test(s)) return { valid: false, reason: 'deve essere di 11 cifre' };
        var sum = 0;
        for (var i = 0; i < 11; i++) {
            var d = Number(s[i]);
            if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
            sum += d;
        }
        if (sum % 10 !== 0) return { valid: false, reason: 'cifra di controllo errata' };
        return { valid: true, value: s };
    }

    // ── COSA IL CODICE FISCALE DICE (e che il documento deve confermare) ─
    // Un CF non è una stringa opaca: dentro ci sono la data di nascita, il
    // sesso e le consonanti di cognome e nome. Sono i controlli a costo
    // zero che nessun modello fa da solo — e che prendono i due errori
    // tipici di una lettura: la cifra scambiata (0/O, 1/I) e il CF di
    // un'ALTRA persona finito nella sezione sbagliata (in un contratto ci
    // sono due parti, e la seconda è a tre righe dalla prima).
    var CF_MONTHS = { A: 1, B: 2, C: 3, D: 4, E: 5, H: 6, L: 7, M: 8, P: 9, R: 10, S: 11, T: 12 };
    var OMOCODIA = { L: '0', M: '1', N: '2', P: '3', Q: '4', R: '5', S: '6', T: '7', U: '8', V: '9' };
    function cfDigits(s, from, to) {
        var out = '';
        for (var i = from; i < to; i++) out += OMOCODIA[s[i]] !== undefined ? OMOCODIA[s[i]] : s[i];
        return out;
    }
    /** @returns {{yy:number, month:number, day:number, sex:'M'|'F'}|null} null = CF non valido */
    function cfBirth(cf) {
        var v = validateCF(cf);
        if (!v.valid) return null;
        var s = v.value;
        var yy = Number(cfDigits(s, 6, 8)), month = CF_MONTHS[s[8]], day = Number(cfDigits(s, 9, 11));
        if (!month || isNaN(yy) || isNaN(day)) return null;
        var sex = day > 40 ? 'F' : 'M';
        if (day > 40) day -= 40;
        if (day < 1 || day > 31) return null;
        return { yy: yy, month: month, day: day, sex: sex };
    }
    /** true / false / null (null = manca uno dei due o il CF non è valido) */
    function cfBirthDateMatches(cf, isoDate) {
        var b = cfBirth(cf);
        if (!b || !isISODate(isoDate)) return null;
        return (Number(isoDate.slice(0, 4)) % 100) === b.yy
            && Number(isoDate.slice(5, 7)) === b.month
            && Number(isoDate.slice(8, 10)) === b.day;
    }
    function cfLetters(s) {
        return txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
    }
    function splitCV(letters) {
        var c = '', v = '';
        for (var i = 0; i < letters.length; i++) { if ('AEIOU'.indexOf(letters[i]) >= 0) v += letters[i]; else c += letters[i]; }
        return { c: c, v: v };
    }
    function cfSurnameCode(surname) {
        var p = splitCV(cfLetters(surname));
        return (p.c + p.v + 'XXX').slice(0, 3);
    }
    function cfNameCode(name) {
        var p = splitCV(cfLetters(name));
        var c = p.c.length >= 4 ? p.c[0] + p.c[2] + p.c[3] : p.c;
        return (c + p.v + 'XXX').slice(0, 3);
    }
    /**
     * Il CF appartiene a questo nome? Prova ogni divisione in cognome+nome
     * nei DUE ordini («Marco D'Angelo», «D'Angelo Marco», «Maria Grazia De
     * Luca»). true / false / null (null = CF non valido o nome troppo corto).
     */
    function cfMatchesName(cf, fullName) {
        var v = validateCF(cf);
        if (!v.valid) return null;
        var tokens = normName(fullName).split(' ').filter(function (t) { return cfLetters(t).length; });
        if (tokens.length < 2) return null;
        var head = v.value.slice(0, 6);
        for (var k = 1; k < tokens.length; k++) {
            var a = tokens.slice(0, k).join(' '), b = tokens.slice(k).join(' ');
            if (cfSurnameCode(b) + cfNameCode(a) === head) return true;   // Nome Cognome
            if (cfSurnameCode(a) + cfNameCode(b) === head) return true;   // Cognome Nome
        }
        return false;
    }

    // ── Le etichette, in UNA copia (le card del portale le leggono da qui) ─
    var LABELS = {
        lead: {
            name: 'Nome', email: 'Email', phone: 'Telefono', request: 'Richiesta (parole del cliente)', zone: 'Zona',
            budget: 'Budget mensile €', bedrooms: 'Camere', moveIn: 'Ingresso desiderato', durationMonths: 'Durata (mesi)',
            household: 'Chi abiterà', occupation: 'Situazione', language: 'Lingua', side: 'Chi scrive',
            listing: 'Immobile / annuncio', channel: 'Canale'
        },
        preagreement: {
            ref: 'Riferimento BOOM', isBoom: 'Proposta BOOM', status: 'Stato dichiarato', acceptedAt: 'Accettata il',
            feePct: 'Provvigione % annuo', feeMonths: 'Provvigione (mensilità)', feeEur: 'Provvigione €', feeVatPct: 'IVA provvigione %',
            feeDue: 'Provvigione dovuta', energyCredit: 'Quota energia €/mese', depositSplitPct: 'Deposito alla firma %',
            dueAtSigning: 'Dovuto alla firma €', validUntil: 'Valida fino al', extras: 'Altre voci'
        },
        person: {
            name: 'Nome e cognome', businessName: 'Ragione sociale', kind: 'Persona fisica / società',
            email: 'Email', phone: 'Telefono', codiceFiscale: 'Codice fiscale', partitaIva: 'Partita IVA',
            iban: 'IBAN', address: 'Residenza', birthDate: 'Data di nascita', birthPlace: 'Luogo di nascita',
            nationality: 'Nazionalità', docType: 'Documento', docNum: 'Numero documento',
            docIssuer: 'Rilasciato da', docIssueDate: 'Data di rilascio',
            permessoNumero: 'Permesso di soggiorno n.', permessoScadenza: 'Scadenza permesso'
        },
        property: {
            name: 'Nome', address: 'Indirizzo', city: 'Comune', rent: 'Canone mensile €', sqm: 'Metri quadri',
            rooms: 'Vani', bathrooms: 'Bagni', floor: 'Piano', scala: 'Scala', interno: 'Interno',
            accessories: 'Accessori', furnished: 'Ammobiliato', energyClass: 'Classe energetica',
            propertyType: 'Tipologia', sezione: 'Sezione urbana', foglio: 'Foglio', particella: 'Particella',
            sub: 'Subalterno', categoria: 'Categoria catastale', renditaCatastale: 'Rendita catastale €',
            cadastralData: 'Dati catastali (testo)'
        },
        contract: {
            type: 'Tipo', startDate: 'Inizio', endDate: 'Fine', durationMonths: 'Durata (mesi)',
            rent: 'Canone mensile €', deposit: 'Deposito €', depositMonths: 'Deposito (mensilità)',
            paymentDay: 'Giorno di pagamento', installmentMonths: 'Cadenza rate (mesi)',
            accessoryCharges: 'Oneri accessori €/mese', condoMode: 'Spese condominiali',
            cedolareSecca: 'Cedolare secca', transitionalReason: 'Esigenza transitoria',
            transitionalDocs: 'Documento dell\'esigenza', esigenzaDi: 'Esigenza di',
            cohabitants: 'Conviventi', otherClauses: 'Altre clausole', signaturePlace: 'Luogo di firma',
            signatureDate: 'Data di firma', paymentMethod: 'Modalità di pagamento', istatPct: 'Aggiornamento ISTAT %',
            notes: 'Note'
        },
        studenti: {
            corsoStudi: 'Corso di studi', universita: 'Università', universitaIndirizzo: 'Indirizzo università',
            tipoIscrizione: 'Tipo iscrizione', annoAccademico: 'Anno accademico'
        }
    };
    var DOC_TYPES = ['passport', 'id', 'permit', 'patente'];
    var CONTRACT_TYPES = ['transitorio', 'studenti', '3+2', '4+4', 'ordinaria'];
    var TYPE_ALIASES = { '32': '3+2', 'concordato': '3+2', '3 + 2': '3+2', '44': '4+4', '4 + 4': '4+4', 'libero': '4+4', 'canone libero': '4+4', 'universitari': 'studenti', 'studente': 'studenti', 'transitoria': 'transitorio', 'transitional': 'transitorio', 'students': 'studenti' };

    /**
     * Validazione di una proposta di import, campo per campo.
     * Restituisce errori (bloccanti) e avvisi (da guardare, non bloccanti):
     * il contratto non parte se una data è incoerente, ma un IBAN mancante
     * non deve impedire di caricare l'immobile.
     */
    function validateProposal(p) {
        p = p || {};
        var errors = [], warnings = [];
        var prop = p.property || {}, con = p.contract || {}, ten = p.tenant || {}, land = p.landlord || {};

        // Una persona: CF con checksum, e il CF che CONFERMA data e nome.
        function personChecks(who, d, opts) {
            opts = opts || {};
            if (!txt(d.name).trim() && !txt(d.businessName).trim()) errors.push(who + ': manca il nome.');
            if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(txt(d.email))) errors.push(who + ': email non valida.');
            var cf = txt(d.codiceFiscale).trim();
            if (cf) {
                if (opts.company && /^\d{11}$/.test(cf)) {
                    var vp = validatePIva(cf);
                    if (!vp.valid) errors.push(who + ': codice fiscale numerico — ' + vp.reason + '.');
                } else {
                    var vc = validateCF(cf);
                    if (!vc.valid) errors.push(who + ': codice fiscale — ' + vc.reason + '.');
                    else {
                        var bd = cfBirthDateMatches(cf, d.birthDate);
                        if (bd === false) {
                            var b = cfBirth(cf);
                            errors.push(who + ': il codice fiscale dice nato/a il ' + String(b.day).padStart(2, '0') + '/' + String(b.month).padStart(2, '0') + '/\'' + String(b.yy).padStart(2, '0')
                                + ', il documento dice ' + d.birthDate + ' — uno dei due è letto male.');
                        }
                        var nm = cfMatchesName(cf, d.name);
                        if (nm === false) warnings.push(who + ': il codice fiscale non corrisponde al nome «' + txt(d.name).trim() + '» (le prime sei lettere non tornano): verifica che non sia il CF di un\'altra persona.');
                    }
                }
            }
            if (d.partitaIva) {
                var vpi = validatePIva(d.partitaIva);
                if (!vpi.valid) errors.push(who + ': partita IVA — ' + vpi.reason + '.');
            }
            if (d.birthDate && !isISODate(d.birthDate)) errors.push(who + ': data di nascita non in formato AAAA-MM-GG.');
            if (d.docIssueDate && !isISODate(d.docIssueDate)) errors.push(who + ': data di rilascio del documento non in formato AAAA-MM-GG.');
            if (d.permessoScadenza && !isISODate(d.permessoScadenza)) errors.push(who + ': scadenza del permesso non in formato AAAA-MM-GG.');
        }

        if (p.property) {
            if (!txt(prop.name).trim() && !txt(prop.address).trim()) errors.push('Immobile: manca il nome (o l\'indirizzo).');
            if (prop.rent != null && Number(prop.rent) < 0) errors.push('Immobile: canone negativo.');
            if (prop.sqm != null && (Number(prop.sqm) < 5 || Number(prop.sqm) > 2000)) warnings.push('Immobile: ' + prop.sqm + ' mq — verifica il dato.');
            var hasCat = txt(prop.foglio).trim() || txt(prop.particella).trim() || txt(prop.sub).trim();
            if (hasCat && !(txt(prop.foglio).trim() && txt(prop.particella).trim() && txt(prop.sub).trim())) {
                warnings.push('Immobile: dati catastali incompleti (servono foglio, particella e subalterno per la registrazione).');
            }
        }
        if (p.tenant) {
            personChecks('Inquilino', ten);
            if (!ten.email) warnings.push('Inquilino senza email: non potrà ricevere il link di firma né accedere al portale.');
            if (!txt(ten.codiceFiscale).trim()) warnings.push('Inquilino senza codice fiscale: serve per la registrazione del contratto.');
        }
        (p.coTenants || []).forEach(function (co, i) {
            personChecks('Co-conduttore ' + (i + 1), co || {});
            if (!txt((co || {}).codiceFiscale).trim()) warnings.push('Co-conduttore ' + (i + 1) + ' senza codice fiscale: per l\'AdE ogni conduttore è una riga RLI con CF.');
        });
        if (p.landlord) {
            personChecks('Proprietario', land, { company: land.kind === 'giuridica' || !!txt(land.businessName).trim() });
            if (land.iban) {
                var vi = validateIBAN(land.iban);
                if (!vi.valid) errors.push('Proprietario: IBAN — ' + vi.reason + '.');
            }
        }
        if (p.lead) {
            var ld = p.lead;
            if (!txt(ld.name).trim() && !txt(ld.email).trim() && !txt(ld.phone).trim()) errors.push('Lead: serve almeno un nome, un\'email o un telefono.');
            if (ld.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(txt(ld.email))) errors.push('Lead: email non valida.');
            if (!txt(ld.email).trim() && !txt(ld.phone).trim()) warnings.push('Lead senza recapito: non lo si potrà ricontattare (la macchina parte solo con email o telefono).');
            if (ld.budget != null && Number(ld.budget) < 0) errors.push('Lead: budget negativo.');
        }
        if (p.preagreement) {
            var pa = p.preagreement;
            if (pa.feePct != null && (Number(pa.feePct) < 0 || Number(pa.feePct) > 100)) errors.push('Proposta: provvigione in % fuori da 0-100.');
            if (pa.depositSplitPct != null && (Number(pa.depositSplitPct) < 0 || Number(pa.depositSplitPct) > 100)) errors.push('Proposta: quota del deposito alla firma fuori da 0-100%.');
            if (pa.validUntil && !isISODate(pa.validUntil)) errors.push('Proposta: validità non in formato AAAA-MM-GG.');
            if (pa.ref && !/^BOOM-[A-Z0-9]{3,12}$/.test(pa.ref)) warnings.push('Proposta: il riferimento «' + pa.ref + '» non ha la forma BOOM-XXXXXX — verifica.');
        }
        if (p.contract) {
            if (!isISODate(con.startDate)) errors.push('Contratto: data di inizio mancante o non in formato AAAA-MM-GG.');
            if (!isISODate(con.endDate)) errors.push('Contratto: data di fine mancante o non in formato AAAA-MM-GG.');
            if (isISODate(con.startDate) && isISODate(con.endDate) && con.endDate <= con.startDate) {
                errors.push('Contratto: la fine (' + con.endDate + ') non è successiva all\'inizio (' + con.startDate + ').');
            }
            var rent = Number(con.rent);
            if (!(rent > 0)) errors.push('Contratto: canone mensile mancante o non valido.');
            if (rent > 20000) warnings.push('Canone di €' + rent + '/mese: verifica che non sia il totale annuo.');
            var pd = Number(con.paymentDay);
            if (con.paymentDay != null && (!(pd >= 1) || pd > 28)) {
                warnings.push('Giorno di pagamento ' + con.paymentDay + ': fuori dall\'intervallo 1-28, userò il 5.');
            }
            var im = Number(con.installmentMonths);
            if (con.installmentMonths != null && [1, 2, 3, 6, 12].indexOf(im) === -1) {
                warnings.push('Cadenza rata "' + con.installmentMonths + '" non riconosciuta: userò mensile.');
            }
            // Art. 11 L. 392/78: il deposito cauzionale non può superare tre
            // mensilità. Un deposito di quattro non è un refuso da correggere in
            // silenzio: è una clausola nulla che l'operatore deve vedere.
            if (con.deposit != null && rent > 0 && Number(con.deposit) > rent * 3 + 0.5) {
                warnings.push('Deposito di €' + con.deposit + ' = ' + (Math.round(Number(con.deposit) / rent * 10) / 10) + ' mensilità: la legge (art. 11 L. 392/78) ne ammette al massimo 3.');
            }
            if (con.depositMonths != null && Number(con.depositMonths) > 3) {
                warnings.push('Deposito di ' + con.depositMonths + ' mensilità: la legge (art. 11 L. 392/78) ne ammette al massimo 3.');
            }
            // La durata deve stare nel tipo: un transitorio oltre 18 mesi non è
            // più un transitorio (L. 431/98 art. 5), gli studenti vanno da 6 a
            // 36, il 3+2 sono tre anni esatti.
            var months = monthsSpan(con.startDate, con.endDate);
            if (months != null) {
                if (con.type === 'transitorio' && (months < 1 || months > 18)) warnings.push('Contratto transitorio di ' + months + ' mesi: la legge ammette da 1 a 18 mesi (art. 5 c. 1 L. 431/98).');
                if (con.type === 'studenti' && (months < 6 || months > 36)) warnings.push('Contratto studenti di ' + months + ' mesi: la legge ammette da 6 a 36 mesi (art. 5 c. 2-3 L. 431/98).');
                if (con.type === '3+2' && months !== 36) warnings.push('Contratto 3+2 di ' + months + ' mesi: la durata di legge è 36 mesi.');
            }
            if (con.type === 'transitorio' && !txt(con.transitionalReason).trim()) warnings.push('Transitorio senza esigenza dichiarata: l\'Allegato B la stampa e la registrazione la pretende.');
            if (con.type === 'studenti') {
                var st = con.studenti || {};
                if (!txt(st.corsoStudi).trim() || !txt(st.universita).trim()) warnings.push('Contratto studenti: mancano corso di studi e/o università (l\'Allegato C li stampa).');
            }
            if (con.signatureDate && !isISODate(con.signatureDate)) warnings.push('Contratto: data di firma non in formato AAAA-MM-GG, verrà ignorata.');
        }
        return { ok: errors.length === 0, errors: errors, warnings: warnings };
    }

    // Mesi INTERI fra due date ISO, fine inclusa (01/09/2026 → 31/08/2027 = 12;
    // 10/09 → 09/03 = 6; 10/09 → 01/03 = 5, il resto sono giorni). Si guarda
    // il giorno DOPO la fine: se cade sullo stesso giorno del mese dell'inizio
    // il periodo è di mesi pieni.
    function monthsSpan(a, b) {
        if (!isISODate(a) || !isISODate(b) || b < a) return null;
        var y1 = +a.slice(0, 4), m1 = +a.slice(5, 7), d1 = +a.slice(8, 10);
        var next = new Date(Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10) + 1));
        var months = (next.getUTCFullYear() - y1) * 12 + (next.getUTCMonth() + 1 - m1);
        if (next.getUTCDate() < d1) months -= 1;
        return months;
    }
    function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
    function addMonthsISO(iso, n) {
        var y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
        var t = m - 1 + n, ny = y + Math.floor(t / 12), nm = ((t % 12) + 12) % 12 + 1;
        var nd = Math.min(d, daysInMonth(ny, nm));
        return ny + '-' + String(nm).padStart(2, '0') + '-' + String(nd).padStart(2, '0');
    }
    function minusOneDayISO(iso) {
        var dt = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
        dt.setUTCDate(dt.getUTCDate() - 1);
        return dt.toISOString().slice(0, 10);
    }

    // ── Riconoscere che questa persona/casa C'È GIÀ ────────────────────
    // È la differenza tra "importare" e "duplicare l'archivio". Confronto
    // per identificatori forti (CF, email, IBAN) e, in mancanza, per nome
    // normalizzato + indirizzo.
    function normName(s) {
        return low(s)
            .normalize('NFD').replace(/[̀-ͯ]/g, '')   // via accenti
            .replace(/\b(sig|sig\.ra|dott|dr|ing|avv|arch|spa|srl|s\.r\.l|s\.p\.a)\b\.?/g, '')
            .replace(/[^a-z0-9 ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    function normAddress(s) {
        return normName(s)
            .replace(/\b(via|viale|piazza|piazzale|largo|vicolo|corso|lungotevere|v le|p zza)\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    // Nome uguale a parti invertite ("Rossi Mario" ≡ "Mario Rossi").
    function sameNameTokens(a, b) {
        var ta = normName(a).split(' ').filter(Boolean).sort().join(' ');
        var tb = normName(b).split(' ').filter(Boolean).sort().join(' ');
        return !!ta && ta === tb;
    }

    /**
     * @returns {{match:Object|null, score:number, why:string}} score 0..100
     */
    function findMatch(candidate, existing, kind) {
        candidate = candidate || {};
        existing = existing || [];
        var best = null, bestScore = 0, bestWhy = '';
        var cCf = low(candidate.codiceFiscale || candidate.cf);

        for (var i = 0; i < existing.length; i++) {
            var e = existing[i], score = 0, why = '';
            var eCf = low(e.codiceFiscale || e.cf);
            if (cCf && eCf && cCf === eCf) { score = 100; why = 'stesso codice fiscale'; }
            else if (candidate.email && e.email && low(candidate.email) === low(e.email)) { score = 96; why = 'stessa email'; }
            else if (candidate.iban && e.iban && low(candidate.iban).replace(/\s/g, '') === low(e.iban).replace(/\s/g, '')) { score = 94; why = 'stesso IBAN'; }
            else if (kind === 'property' && candidate.address && e.address
                && normAddress(candidate.address) === normAddress(e.address) && normAddress(candidate.address)) {
                score = 88; why = 'stesso indirizzo';
            }
            else if (candidate.name && e.name && normName(candidate.name) === normName(e.name) && normName(candidate.name)) {
                score = 85; why = 'stesso nome';
            }
            else if (candidate.name && e.name && sameNameTokens(candidate.name, e.name)) {
                score = 78; why = 'stesso nome (ordine invertito)';
            }
            else if (candidate.phone && e.phone
                && txt(candidate.phone).replace(/\D/g, '').slice(-9) === txt(e.phone).replace(/\D/g, '').slice(-9)
                && txt(e.phone).replace(/\D/g, '').length >= 9) {
                score = 74; why = 'stesso numero di telefono';
            }
            if (score > bestScore) { bestScore = score; best = e; bestWhy = why; }
        }
        // Sotto 70 non proponiamo un aggancio: meglio un doppione visibile
        // che un contratto attaccato alla persona sbagliata.
        if (bestScore < 70) return { match: null, score: bestScore, why: '' };
        return { match: best, score: bestScore, why: bestWhy };
    }

    // ── La proposta: solo le sezioni che il materiale PORTA ────────────
    // Con l'output strutturato il modello restituisce SEMPRE tutte le
    // sezioni (piene di null): una carta d'identità non deve far nascere una
    // card «Contratto» vuota. Una sezione esiste solo se porta un'ANCORA —
    // un dato che da solo identifica la cosa (un nome, un indirizzo, una
    // data, un canone) — non una spunta booleana che il modello riempie per
    // default.
    var ANCHORS = {
        landlord: ['name', 'businessName', 'codiceFiscale', 'partitaIva', 'iban', 'email'],
        tenant: ['name', 'codiceFiscale', 'email'],
        property: ['name', 'address', 'foglio'],
        contract: ['startDate', 'endDate', 'rent', 'deposit', 'durationMonths', 'type'],
        // Le due sezioni nate il 21/09/2026: il messaggio di un cliente
        // (→ lead) e i termini di una proposta / pre-accordo (→ preAgreements).
        lead: ['name', 'email', 'phone', 'request'],
        preagreement: ['ref', 'feePct', 'feeMonths', 'feeEur', 'dueAtSigning', 'validUntil', 'depositSplitPct', 'energyCredit']
    };
    // Che cos'è il materiale nel suo insieme: decide quali card la pagina
    // mette in testa, mai cosa si scrive.
    var MATERIALS = ['contratto', 'proposta', 'identita', 'immobile', 'messaggio', 'fattura', 'altro'];
    function filled(v) { return !(v == null || v === '' || (typeof v === 'number' && isNaN(v))); }
    function anchored(section, d) {
        if (!d || typeof d !== 'object') return false;
        var flat = Object.assign({}, d, d.cadastral || {});
        return ANCHORS[section].some(function (k) { return filled(flat[k]) && txt(flat[k]).trim() !== ''; });
    }
    function pruneProposal(raw) {
        raw = raw || {};
        var out = {};
        ['landlord', 'tenant', 'property', 'contract', 'lead', 'preagreement'].forEach(function (k) { if (anchored(k, raw[k])) out[k] = raw[k]; });
        var co = Array.isArray(raw.coTenants) ? raw.coTenants.filter(function (c) { return c && txt(c.name).trim(); }) : [];
        if (co.length) out.coTenants = co;
        var mat = low(raw.material);
        if (MATERIALS.indexOf(mat) >= 0) out.material = mat;
        return out;
    }

    // Normalizza quello che l'AI ha estratto nella forma ESATTA che il
    // portale salva (stessi nomi di campo di saveProperty/saveContract):
    // qualsiasi scostamento qui diventa un dato che le pagine non leggono.
    // Accetta sia la forma del modello (catasto e tabelle annidati, booleani)
    // sia la propria forma piatta: normalizzare due volte non cambia nulla.
    function normalizeProposal(raw) {
        raw = raw || {};
        var out = {};
        var num = function (v) {
            if (v == null || v === '') return null;
            if (typeof v === 'number') return isNaN(v) ? null : v;
            var n = Number(String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
            return isNaN(n) ? null : n;
        };
        var date = function (v) {
            var s = txt(v).trim();
            if (isISODate(s)) return s;
            var m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s);   // gg/mm/aaaa
            if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
            var m2 = /^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/.exec(s);     // aaaa/mm/gg
            if (m2) return m2[1] + '-' + String(m2[2]).padStart(2, '0') + '-' + String(m2[3]).padStart(2, '0');
            return '';
        };
        var str = function (v) { return txt(v).trim(); };
        var docType = function (v) { var s = low(v); return DOC_TYPES.indexOf(s) >= 0 ? s : (s === 'carta d\'identità' || s === 'carta identità' || s === 'ci' || s === 'id card' ? 'id' : s === 'passaporto' ? 'passport' : s === 'permesso di soggiorno' ? 'permit' : ''); };
        var yesno = function (v) { return v === true || low(v) === 'yes' || low(v) === 'si' || low(v) === 'sì' ? 'yes' : (v === false || low(v) === 'no' ? 'no' : ''); };

        function person(src, extra) {
            var o = {
                name: str(src.name), email: str(src.email).toLowerCase(), phone: str(src.phone),
                codiceFiscale: str(src.codiceFiscale || src.cf).toUpperCase().replace(/\s/g, ''),
                address: str(src.address), birthDate: date(src.birthDate || src.dob),
                birthPlace: str(src.birthPlace || src.pob), nationality: str(src.nationality),
                docType: docType(src.docType || src.idDocType), docNum: str(src.docNum || src.idDocNumber).toUpperCase(),
                docIssuer: str(src.docIssuer), docIssueDate: date(src.docIssueDate)
            };
            if (extra) Object.assign(o, extra(src));
            return o;
        }
        if (raw.landlord) {
            out.landlord = person(raw.landlord, function (s) {
                var kind = low(s.kind);
                return {
                    kind: kind === 'giuridica' || kind === 'societa' || kind === 'società' || kind === 'company' ? 'giuridica' : (kind === 'fisica' ? 'fisica' : (str(s.businessName) || str(s.partitaIva) ? 'giuridica' : '')),
                    businessName: str(s.businessName), partitaIva: str(s.partitaIva).replace(/\D/g, ''),
                    iban: str(s.iban).toUpperCase().replace(/[\s-]/g, '')
                };
            });
            if (!out.landlord.name && out.landlord.businessName) out.landlord.name = out.landlord.businessName;
        }
        if (raw.tenant) {
            out.tenant = person(raw.tenant, function (s) {
                return { permessoNumero: str(s.permessoNumero).toUpperCase(), permessoScadenza: date(s.permessoScadenza) };
            });
        }
        if (Array.isArray(raw.coTenants) && raw.coTenants.length) {
            out.coTenants = raw.coTenants.filter(function (c) { return c && str(c.name); }).map(function (c) { return person(c); });
            if (!out.coTenants.length) delete out.coTenants;
        }
        if (raw.property) {
            var pr = raw.property, cat = pr.cadastral || {}, tab = pr.tabelleMillesimali || pr.tabelle || {};
            out.property = {
                name: str(pr.name), address: str(pr.address), city: str(pr.city),
                rent: num(pr.rent), sqm: num(pr.sqm), rooms: num(pr.rooms), bathrooms: num(pr.bathrooms),
                floor: str(pr.floor), scala: str(pr.scala), interno: str(pr.interno || pr.unit),
                accessories: str(pr.accessories), furnished: yesno(pr.furnished),
                energyClass: str(pr.energyClass).toUpperCase(),
                propertyType: low(pr.propertyType) || 'apartment',
                sezione: str(pr.sezione || cat.sezione).toUpperCase(), foglio: str(pr.foglio || cat.foglio),
                particella: str(pr.particella || cat.particella), sub: str(pr.sub || cat.sub),
                categoria: str(pr.categoria || cat.categoria).toUpperCase().replace(/\s+/g, ''),
                renditaCatastale: num(pr.renditaCatastale != null ? pr.renditaCatastale : cat.rendita),
                cadastralData: str(pr.cadastralData),
                tabelleMillesimali: {
                    proprieta: num(tab.proprieta), riscaldamento: num(tab.riscaldamento),
                    acqua: num(tab.acqua), altre: str(tab.altre)
                }
            };
        }
        if (raw.contract) {
            var c = raw.contract;
            var im = num(c.installmentMonths);
            var pd = num(c.paymentDay);
            var t = low(c.type);
            t = TYPE_ALIASES[t] || t;
            var st = c.studenti && typeof c.studenti === 'object' ? c.studenti : null;
            var cedolare = c.cedolareSecca;
            out.contract = {
                type: CONTRACT_TYPES.indexOf(t) >= 0 ? t : 'transitorio',
                startDate: date(c.startDate), endDate: date(c.endDate),
                durationMonths: num(c.durationMonths),
                rent: num(c.rent), deposit: num(c.deposit),
                depositMonths: num(c.depositMonths),
                paymentDay: (pd >= 1 && pd <= 28) ? pd : 5,
                installmentMonths: [1, 2, 3, 6, 12].indexOf(im) >= 0 ? im : 1,
                accessoryCharges: num(c.accessoryCharges),
                condoMode: low(c.condoMode) === 'incluso' || low(c.condoMode) === 'consuntivo' ? low(c.condoMode) : '',
                cedolareSecca: (cedolare === false || low(cedolare) === 'no') ? 'no' : 'si',
                transitionalReason: str(c.transitionalReason), transitionalDocs: str(c.transitionalDocs),
                esigenzaDi: low(c.esigenzaDi) === 'locatore' ? 'locatore' : (low(c.esigenzaDi) === 'conduttore' ? 'conduttore' : ''),
                studenti: st && (str(st.corsoStudi) || str(st.universita)) ? {
                    corsoStudi: str(st.corsoStudi), universita: str(st.universita),
                    universitaIndirizzo: str(st.universitaIndirizzo), tipoIscrizione: str(st.tipoIscrizione),
                    annoAccademico: str(st.annoAccademico)
                } : null,
                cohabitants: str(c.cohabitants), otherClauses: str(c.otherClauses),
                signaturePlace: str(c.signaturePlace), signatureDate: date(c.signatureDate),
                paymentMethod: str(c.paymentMethod), istatPct: str(c.istatPct),
                notes: str(c.notes)
            };
            // Il canone del contratto è la fonte di verità: se l'immobile non
            // ne ha uno, eredita (evita immobili a canone 0 in dashboard).
            if (out.property && (out.property.rent == null) && out.contract.rent != null) {
                out.property.rent = out.contract.rent;
            }
        }
        if (raw.lead) {
            var L = raw.lead;
            var side = low(L.side), hh = low(L.household), occ = low(L.occupation), lang = low(L.language), ch = low(L.channel);
            var mi = str(L.moveIn);
            out.lead = {
                name: str(L.name), email: str(L.email).toLowerCase(), phone: str(L.phone).replace(/[\s().-]/g, ''),
                request: str(L.request || L.message).slice(0, 600), zone: str(L.zone),
                budget: num(L.budget), bedrooms: num(L.bedrooms),
                moveIn: isISODate(mi) || /^\d{4}-\d{2}$/.test(mi) ? mi : (date(mi) || mi),
                durationMonths: num(L.durationMonths),
                household: ['solo', 'couple', 'family', 'flatmates'].indexOf(hh) >= 0 ? hh : '',
                occupation: ['employed', 'self-employed', 'student', 'relocating'].indexOf(occ) >= 0 ? occ : '',
                language: lang === 'it' || lang === 'en' ? lang : '',
                side: side === 'landlord' || side === 'company' || side === 'tenant' ? side : '',
                listing: str(L.listing),
                channel: ['whatsapp', 'email', 'portal', 'phone', 'other'].indexOf(ch) >= 0 ? ch : ''
            };
        }
        if (raw.preagreement) {
            var PA = raw.preagreement;
            var ref = str(PA.ref).toUpperCase().replace(/\s+/g, '');
            var fd = low(PA.feeDue), pst = low(PA.status), ib = yesno(PA.isBoom);
            out.preagreement = {
                ref: ref,
                isBoom: ib === 'yes' || /^BOOM-/.test(ref) ? 'yes' : (ib === 'no' ? 'no' : ''),
                status: ['sent', 'accepted', 'paid', 'signed'].indexOf(pst) >= 0 ? pst : '',
                acceptedAt: date(PA.acceptedAt),
                feePct: num(PA.feePct), feeMonths: num(PA.feeMonths), feeEur: num(PA.feeEur), feeVatPct: num(PA.feeVatPct),
                feeDue: ['move-in', 'signing', 'separate'].indexOf(fd) >= 0 ? fd : '',
                energyCredit: num(PA.energyCredit), depositSplitPct: num(PA.depositSplitPct), dueAtSigning: num(PA.dueAtSigning),
                validUntil: date(PA.validUntil), extras: str(PA.extras)
            };
        }
        var mat = low(raw.material);
        if (MATERIALS.indexOf(mat) >= 0) out.material = mat;
        return out;
    }

    // ── L'INNESTO A PIÙ LETTURE ────────────────────────────────────────
    // Un fascicolo vero arriva a pezzi: il PDF del contratto, POI la foto
    // della carta d'identità, POI due righe di WhatsApp col telefono.
    // mergeProposal fonde una NUOVA lettura dentro la proposta che
    // l'operatore ha già davanti (e magari ha già corretto): riempie SOLO
    // i buchi. Un campo pieno non si tocca MAI — potrebbe essere una
    // correzione umana, e una correzione sovrascritta in silenzio è il
    // difetto peggiore che questo strumento possa avere.
    function fillHoles(target, extra) {
        Object.keys(extra).forEach(function (f) {
            var cur = target[f], nv = extra[f];
            if (nv && typeof nv === 'object' && !Array.isArray(nv)) {
                if (!cur || typeof cur !== 'object') { if (Object.keys(nv).some(function (k) { return filled(nv[k]) && nv[k] !== 0; })) target[f] = JSON.parse(JSON.stringify(nv)); }
                else fillHoles(cur, nv);
                return;
            }
            var curEmpty = cur == null || cur === '' || cur === 0;
            var nvFull = nv != null && nv !== '' && nv !== 0;
            if (curEmpty && nvFull) target[f] = nv;
        });
    }
    function mergeProposal(base, extra) {
        base = base || {}; extra = extra || {};
        var out = JSON.parse(JSON.stringify(base));
        ['landlord', 'tenant', 'property', 'contract', 'lead', 'preagreement'].forEach(function (k) {
            if (!extra[k]) return;
            if (!out[k]) { out[k] = JSON.parse(JSON.stringify(extra[k])); return; }
            fillHoles(out[k], extra[k]);
        });
        if (!out.material && extra.material) out.material = extra.material;
        // Co-conduttori: stessa persona (CF o nome) → si riempiono i buchi
        // della SUA riga; persona nuova → si aggiunge in coda.
        if (Array.isArray(extra.coTenants) && extra.coTenants.length) {
            out.coTenants = out.coTenants || [];
            extra.coTenants.forEach(function (co) {
                var hit = out.coTenants.find(function (x) {
                    return (co.codiceFiscale && x.codiceFiscale && low(co.codiceFiscale) === low(x.codiceFiscale))
                        || (co.name && x.name && (normName(co.name) === normName(x.name) || sameNameTokens(co.name, x.name)));
                });
                if (hit) fillHoles(hit, co); else out.coTenants.push(JSON.parse(JSON.stringify(co)));
            });
        }
        return out;
    }

    // Derivazioni che l'operatore non deve fare a mano: il deposito da
    // "N mensilità" × canone, il canone del contratto dall'immobile (il
    // verso opposto lo fa già normalizeProposal), il nome dell'immobile
    // dall'indirizzo, la fine dalla durata, il catasto composto dalle parti.
    // Mai una STIMA: solo aritmetica su dati dichiarati. Ogni derivazione
    // viene DETTA in `derived` (chiave → perché), così la card la mostra come
    // calcolata e non come letta.
    // `helpers.parseCadastral` (il dizionario del contratto) legge il blob
    // «foglio 12 part. 345 sub 6» nelle sue parti: la copia è UNA, quella.
    function deriveProposal(p, helpers) {
        p = p || {}; helpers = helpers || {};
        var c = p.contract, pr = p.property;
        var derived = p.derived || {};
        var note = function (path, why) { derived[path] = why; };
        if (c) {
            if (!c.rent && pr && pr.rent) { c.rent = pr.rent; note('contract.rent', 'dal canone dell\'immobile'); }
            if (!c.deposit && c.depositMonths && c.rent) {
                c.deposit = Math.round(c.depositMonths * c.rent * 100) / 100;
                note('contract.deposit', c.depositMonths + ' mensilità × €' + c.rent);
            }
            if (!c.depositMonths && c.deposit && c.rent) {
                var m = Math.round(c.deposit / c.rent * 100) / 100;
                if (m >= 1 && m <= 6 && Math.abs(m - Math.round(m)) < 0.01) { c.depositMonths = Math.round(m); note('contract.depositMonths', '€' + c.deposit + ' ÷ €' + c.rent); }
            }
            if (!c.endDate && isISODate(c.startDate) && c.durationMonths > 0) {
                c.endDate = minusOneDayISO(addMonthsISO(c.startDate, Math.round(c.durationMonths)));
                note('contract.endDate', 'inizio + ' + Math.round(c.durationMonths) + ' mesi');
            }
            if (!c.durationMonths && isISODate(c.startDate) && isISODate(c.endDate)) {
                var span = monthsSpan(c.startDate, c.endDate);
                if (span != null && span > 0) { c.durationMonths = span; note('contract.durationMonths', 'dalle date'); }
            }
        }
        if (pr) {
            if (!pr.name && pr.address) { pr.name = pr.address; note('property.name', 'dall\'indirizzo'); }
            var parts = ['sezione', 'foglio', 'particella', 'sub', 'categoria'];
            var hasParts = parts.some(function (k) { return txt(pr[k]).trim(); });
            if (!hasParts && pr.cadastralData && typeof helpers.parseCadastral === 'function') {
                var parsed = helpers.parseCadastral(pr.cadastralData) || {};
                parts.forEach(function (k) { if (parsed[k] && !pr[k]) { pr[k] = txt(parsed[k]); note('property.' + k, 'dai dati catastali in testo'); } });
                hasParts = parts.some(function (k) { return txt(pr[k]).trim(); });
            }
            if (hasParts && !pr.cadastralData) {
                var seg = [];
                if (pr.sezione) seg.push('sez. ' + pr.sezione);
                if (pr.foglio) seg.push('foglio ' + pr.foglio);
                if (pr.particella) seg.push('particella ' + pr.particella);
                if (pr.sub) seg.push('sub ' + pr.sub);
                if (pr.categoria) seg.push('cat. ' + pr.categoria);
                pr.cadastralData = seg.join(', ');
                note('property.cadastralData', 'composto dalle parti');
            }
        }
        if (Object.keys(derived).length) p.derived = derived;
        return p;
    }

    // ── LA MODIFICA PROPOSTA: il documento aggiorna chi c'è già ────────
    // Fino a qui l'Innesto sapeva solo CREARE (STUDIO_SCRIVANO §2, soffitto
    // 1): la carta d'identità di un inquilino già in archivio veniva letta e
    // buttata. Qui si confronta ciò che il documento dice con ciò che il
    // record ha, riga per riga, con la regola che rende sicura la cosa:
    //   · riempire un BUCO (before vuoto)  → 'fill'   → preselezionato
    //   · CAMBIARE un valore (before pieno) → 'change' → deselezionato
    //   · uguale                            → non compare
    // Le chiavi di scrittura seguono i DUE schemi di users (sign + wizard),
    // come magic-sign/submit: così Allegati, Scheda e RLI vedono il dato.
    var PERSON_MAP = [
        ['name', ['name']], ['businessName', ['businessName']], ['kind', ['kind']],
        ['email', ['email']], ['phone', ['phone']],
        ['codiceFiscale', ['codiceFiscale', 'cf']], ['partitaIva', ['partitaIva']], ['iban', ['iban']],
        ['address', ['address']], ['birthDate', ['birthDate', 'dob']], ['birthPlace', ['birthPlace', 'pob']],
        ['nationality', ['nationality']], ['docType', ['idDocType', 'docType']], ['docNum', ['idDocNumber', 'docNum']],
        ['docIssuer', ['docIssuer']], ['docIssueDate', ['docIssueDate']],
        ['permessoNumero', ['permessoNumero']], ['permessoScadenza', ['permessoScadenza']]
    ];
    var PROPERTY_MAP = [
        ['address', ['address']], ['city', ['city']], ['rent', ['rent']], ['sqm', ['sqm']], ['rooms', ['rooms']],
        ['bathrooms', ['bathrooms']], ['floor', ['floor']], ['scala', ['scala']], ['interno', ['interno', 'unit']],
        ['accessories', ['accessories']], ['furnished', ['furnished']], ['energyClass', ['energyClass', 'energyCert']],
        ['sezione', ['sezione']], ['foglio', ['foglio']], ['particella', ['particella']], ['sub', ['sub']],
        ['categoria', ['categoria']], ['renditaCatastale', ['renditaCatastale']], ['cadastralData', ['cadastralData']]
    ];
    function cmpKey(v) { return txt(v).trim().toLowerCase().replace(/\s+/g, ' '); }
    function cmpStrict(k, v) { return /^(codiceFiscale|iban|docNum|energyClass|categoria)$/.test(k) ? cmpKey(v).replace(/\s/g, '') : cmpKey(v); }
    /**
     * @param {'person'|'property'} kind
     * @returns {{rows:Array, fills:number, changes:number}}
     * row = { key, label, before, after, action:'fill'|'change', write:[recordKeys] }
     */
    function diffRecord(kind, proposed, existing) {
        proposed = proposed || {}; existing = existing || {};
        var map = kind === 'property' ? PROPERTY_MAP : PERSON_MAP;
        var labels = kind === 'property' ? LABELS.property : LABELS.person;
        var rows = [], fills = 0, changes = 0;
        map.forEach(function (pair) {
            var key = pair[0], writes = pair[1];
            var after = proposed[key];
            if (!filled(after) || (typeof after === 'string' && !after.trim())) return;
            if (kind === 'person' && key === 'kind' && after !== 'giuridica') return;   // 'fisica' è il default: non è un dato
            var before = '';
            for (var i = 0; i < writes.length; i++) { if (filled(existing[writes[i]]) && txt(existing[writes[i]]).trim()) { before = existing[writes[i]]; break; } }
            if (typeof after === 'number' && typeof before !== 'number' && before !== '') before = Number(before);
            if (before === '' || before == null) { rows.push({ key: key, label: labels[key] || key, before: '', after: after, action: 'fill', write: writes }); fills++; return; }
            if (cmpStrict(key, before) === cmpStrict(key, after)) return;
            rows.push({ key: key, label: labels[key] || key, before: before, after: after, action: 'change', write: writes });
            changes++;
        });
        return { rows: rows, fills: fills, changes: changes };
    }
    /** Il patch da scrivere: solo le righe scelte (fill di default, change mai da solo). */
    function applyDiff(diff, selected) {
        selected = selected || {};
        var patch = {};
        (diff && diff.rows || []).forEach(function (r) {
            var on = selected[r.key] !== undefined ? !!selected[r.key] : r.action === 'fill';
            if (!on) return;
            r.write.forEach(function (k) { patch[k] = r.after; });
        });
        return patch;
    }

    // ══════════════════════════════════════════════════════════════════
    // PARTE 3 — I DATI AZIENDALI (IBAN incluso) fuori dal codice
    // ══════════════════════════════════════════════════════════════════
    // L'IBAN dell'azienda finiva scritto nel sorgente con accanto un
    // "⚠️ UPDATE WITH REAL IBAN" mai fatto — e quel segnaposto veniva
    // stampato nei solleciti di pagamento e nelle fatture PDF. Un dato che
    // cambia (banca, sede, PEC) non deve richiedere un deploy: vive in
    // Firestore e si modifica dalle Impostazioni. Qui la parte pura:
    // whitelist dei campi, pulizia dei valori, e il riconoscimento del
    // segnaposto — perché "IT00X000…" non deve MAI raggiungere un inquilino.

    var COMPANY_FIELDS = ['name', 'legal', 'address', 'piva', 'codiceFiscale', 'email',
        'phone', 'website', 'iban', 'bankName', 'pec', 'rea', 'capitaleSociale'];

    // Un IBAN è "da compilare" se è vuoto, se è il vecchio segnaposto, o se
    // semplicemente non supera il mod-97 (un refuso vale quanto un finto:
    // in entrambi i casi il bonifico non arriva).
    function isPlaceholderIban(v) {
        var s = txt(v).toUpperCase().replace(/[\s-]/g, '');
        if (!s) return true;
        if (/^IT0*X?0+$/.test(s)) return true;          // IT00X000000000000000000000…
        if (/^(X|0)+$/.test(s.slice(4))) return true;
        return !validateIBAN(s).valid;
    }

    /**
     * Fonde i valori salvati su Firestore sopra i default del codice.
     * Ignora i campi non previsti e quelli vuoti (un campo vuoto non deve
     * cancellare un default buono).
     * @returns {{company:Object, warnings:string[]}}
     */
    function mergeCompany(defaults, remote) {
        var out = Object.assign({}, defaults || {});
        var warnings = [];
        remote = remote || {};
        COMPANY_FIELDS.forEach(function (k) {
            var v = remote[k];
            if (v == null) return;
            v = txt(v).trim();
            if (!v) return;
            if (k === 'iban') v = v.toUpperCase().replace(/[\s-]/g, '');
            if (k === 'piva' || k === 'codiceFiscale') v = v.toUpperCase().replace(/\s/g, '');
            out[k] = v;
        });
        if (isPlaceholderIban(out.iban)) {
            warnings.push('L\'IBAN aziendale non è configurato (o non è valido): i solleciti di '
                + 'pagamento e le fatture uscirebbero con un IBAN su cui nessuno può pagare. '
                + 'Impostalo in Impostazioni → Dati aziendali.');
        }
        return { company: out, warnings: warnings };
    }

    return {
        // bonifica
        classifyDoc: classifyDoc, scanDataset: scanDataset, cascadeFor: cascadeFor,
        // dati aziendali
        mergeCompany: mergeCompany, isPlaceholderIban: isPlaceholderIban,
        COMPANY_FIELDS: COMPANY_FIELDS,
        isProtected: isProtected, looksTestString: looksTestString,
        looksTestEmail: looksTestEmail, looksTestPhone: looksTestPhone,
        docLabel: docLabel,
        // innesto
        validateCF: validateCF, validateIBAN: validateIBAN, validatePIva: validatePIva,
        cfBirth: cfBirth, cfBirthDateMatches: cfBirthDateMatches, cfMatchesName: cfMatchesName,
        validateProposal: validateProposal, findMatch: findMatch,
        normalizeProposal: normalizeProposal, pruneProposal: pruneProposal,
        normName: normName, normAddress: normAddress,
        mergeProposal: mergeProposal, deriveProposal: deriveProposal,
        diffRecord: diffRecord, applyDiff: applyDiff, monthsSpan: monthsSpan,
        LABELS: LABELS, DOC_TYPES: DOC_TYPES, CONTRACT_TYPES: CONTRACT_TYPES, MATERIALS: MATERIALS
    };
});
