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

        if (p.property) {
            if (!txt(prop.name).trim()) errors.push('Immobile: manca il nome.');
            if (prop.rent != null && Number(prop.rent) < 0) errors.push('Immobile: canone negativo.');
        }
        if (p.tenant) {
            if (!txt(ten.name).trim()) errors.push('Inquilino: manca il nome.');
            if (ten.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(txt(ten.email))) errors.push('Inquilino: email non valida.');
            if (!ten.email) warnings.push('Inquilino senza email: non potrà ricevere il link di firma né accedere al portale.');
            if (ten.codiceFiscale) {
                var vc = validateCF(ten.codiceFiscale);
                if (!vc.valid) errors.push('Inquilino: codice fiscale — ' + vc.reason + '.');
            } else warnings.push('Inquilino senza codice fiscale: serve per la registrazione del contratto.');
        }
        if (p.landlord) {
            if (!txt(land.name).trim()) errors.push('Proprietario: manca il nome.');
            if (land.codiceFiscale) {
                var vl = validateCF(land.codiceFiscale);
                if (!vl.valid) errors.push('Proprietario: codice fiscale — ' + vl.reason + '.');
            }
            if (land.iban) {
                var vi = validateIBAN(land.iban);
                if (!vi.valid) errors.push('Proprietario: IBAN — ' + vi.reason + '.');
            }
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
            if (con.installmentMonths != null && [1,2,3,6,12].indexOf(im) === -1) {
                warnings.push('Cadenza rata "' + con.installmentMonths + '" non riconosciuta: userò mensile.');
            }
            if (con.deposit != null && rent > 0 && Number(con.deposit) > rent * 6) {
                warnings.push('Deposito pari a più di 6 mensilità: verifica il dato.');
            }
        }
        return { ok: errors.length === 0, errors: errors, warnings: warnings };
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

        for (var i = 0; i < existing.length; i++) {
            var e = existing[i], score = 0, why = '';
            if (candidate.codiceFiscale && e.codiceFiscale
                && low(candidate.codiceFiscale) === low(e.codiceFiscale)) { score = 100; why = 'stesso codice fiscale'; }
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

    // Normalizza quello che l'AI ha estratto nella forma ESATTA che il
    // portale salva (stessi nomi di campo di saveProperty/saveContract):
    // qualsiasi scostamento qui diventa un dato che le pagine non leggono.
    function normalizeProposal(raw) {
        raw = raw || {};
        var out = {};
        var num = function (v) {
            if (v == null || v === '') return null;
            var n = Number(String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
            return isNaN(n) ? null : n;
        };
        var date = function (v) {
            var s = txt(v).trim();
            if (isISODate(s)) return s;
            var m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s);   // gg/mm/aaaa
            if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
            return '';
        };
        var str = function (v) { return txt(v).trim(); };

        if (raw.landlord) {
            out.landlord = {
                name: str(raw.landlord.name), email: str(raw.landlord.email),
                phone: str(raw.landlord.phone), codiceFiscale: str(raw.landlord.codiceFiscale).toUpperCase(),
                iban: str(raw.landlord.iban).toUpperCase().replace(/\s/g, ''),
                address: str(raw.landlord.address), birthDate: date(raw.landlord.birthDate),
                birthPlace: str(raw.landlord.birthPlace)
            };
        }
        if (raw.tenant) {
            out.tenant = {
                name: str(raw.tenant.name), email: str(raw.tenant.email),
                phone: str(raw.tenant.phone), codiceFiscale: str(raw.tenant.codiceFiscale).toUpperCase(),
                address: str(raw.tenant.address), birthDate: date(raw.tenant.birthDate),
                birthPlace: str(raw.tenant.birthPlace), nationality: str(raw.tenant.nationality)
            };
        }
        if (raw.property) {
            out.property = {
                name: str(raw.property.name), address: str(raw.property.address),
                rent: num(raw.property.rent), sqm: num(raw.property.sqm),
                rooms: num(raw.property.rooms), bathrooms: num(raw.property.bathrooms),
                floor: str(raw.property.floor), scala: str(raw.property.scala),
                interno: str(raw.property.interno), cadastralData: str(raw.property.cadastralData),
                energyClass: str(raw.property.energyClass).toUpperCase(),
                propertyType: str(raw.property.propertyType) || 'apartment'
            };
        }
        if (raw.contract) {
            var im = num(raw.contract.installmentMonths);
            var pd = num(raw.contract.paymentDay);
            out.contract = {
                type: ['transitorio', 'studenti', 'ordinaria', '4+4', '3+2'].indexOf(low(raw.contract.type)) >= 0
                    ? low(raw.contract.type) : 'transitorio',
                startDate: date(raw.contract.startDate), endDate: date(raw.contract.endDate),
                rent: num(raw.contract.rent), deposit: num(raw.contract.deposit),
                depositMonths: num(raw.contract.depositMonths),
                paymentDay: (pd >= 1 && pd <= 28) ? pd : 5,
                installmentMonths: [1, 2, 3, 6, 12].indexOf(im) >= 0 ? im : 1,
                accessoryCharges: num(raw.contract.accessoryCharges),
                cedolareSecca: raw.contract.cedolareSecca === false ? 'no' : 'si',
                transitionalReason: str(raw.contract.transitionalReason),
                notes: str(raw.contract.notes)
            };
            // Il canone del contratto è la fonte di verità: se l'immobile non
            // ne ha uno, eredita (evita immobili a canone 0 in dashboard).
            if (out.property && (out.property.rent == null) && out.contract.rent != null) {
                out.property.rent = out.contract.rent;
            }
        }
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
    function mergeProposal(base, extra) {
        base = base || {}; extra = extra || {};
        var out = JSON.parse(JSON.stringify(base));
        ['landlord', 'tenant', 'property', 'contract'].forEach(function (k) {
            if (!extra[k]) return;
            if (!out[k]) { out[k] = JSON.parse(JSON.stringify(extra[k])); return; }
            Object.keys(extra[k]).forEach(function (f) {
                var cur = out[k][f], nv = extra[k][f];
                var curEmpty = cur == null || cur === '' || cur === 0;
                var nvFull = nv != null && nv !== '' && nv !== 0;
                if (curEmpty && nvFull) out[k][f] = nv;
            });
        });
        return out;
    }

    // Derivazioni che l'operatore non deve fare a mano: il deposito da
    // "N mensilità" × canone, il canone del contratto dall'immobile (il
    // verso opposto lo fa già normalizeProposal), il nome dell'immobile
    // dall'indirizzo. Mai una STIMA: solo aritmetica su dati dichiarati.
    function deriveProposal(p) {
        p = p || {};
        var c = p.contract, pr = p.property;
        if (c) {
            if (!c.rent && pr && pr.rent) c.rent = pr.rent;
            if (!c.deposit && c.depositMonths && c.rent) {
                c.deposit = Math.round(c.depositMonths * c.rent * 100) / 100;
            }
        }
        if (pr && !pr.name && pr.address) pr.name = pr.address;
        return p;
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
        validateCF: validateCF, validateIBAN: validateIBAN,
        validateProposal: validateProposal, findMatch: findMatch,
        normalizeProposal: normalizeProposal, normName: normName, normAddress: normAddress,
        mergeProposal: mergeProposal, deriveProposal: deriveProposal
    };
});
