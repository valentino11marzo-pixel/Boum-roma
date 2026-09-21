// tests/dataops/test.mjs
// Il motore che decide COSA SI CANCELLA e COSA SI CREA. Qui si verifica che
//   1) non marchi mai come "test" un dato reale (i falsi positivi qui
//      costano un immobile vero cancellato);
//   2) metta il lucchetto su tutto ciò che ha peso legale o economico;
//   3) rifiuti codici fiscali e IBAN sbagliati PRIMA che diventino contratti;
//   4) riconosca che una persona è già in archivio invece di duplicarla.
//
//   node tests/dataops/test.mjs

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../../js/dataops-engine.js');

let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { passed++; console.log(`\x1b[32m✓\x1b[0m ${name}`); }
  else { failed++; fails.push(name); console.log(`\x1b[31m✗\x1b[0m ${name}${detail ? ' — ' + detail : ''}`); }
}
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`);

console.log('\n── LA BONIFICA: riconoscere il dato di test ──────────────');

ok('"Appartamento Test" è dato di prova', E.looksTestString('Appartamento Test'));
ok('"Prova Contratto" è dato di prova', E.looksTestString('Prova Contratto'));
ok('"asdf" è dato di prova', E.looksTestString('asdf'));
ok('"Mario Rossi" è dato di prova', E.looksTestString('Mario Rossi'));

// I falsi positivi che ci costerebbero cari: nomi VERI di Roma e persone.
ok('"Testaccio" NON è dato di prova', !E.looksTestString('Attico Testaccio'));
ok('"Trastevere" NON è dato di prova', !E.looksTestString('Bilocale Trastevere'));
ok('"Provenzale" NON è dato di prova', !E.looksTestString('Giulia Provenzale'));
ok('"Demolli" NON è dato di prova', !E.looksTestString('Andrea Demolli'));
ok('"Barberini" NON è dato di prova', !E.looksTestString('Palazzo Barberini'));
ok('"Prati" NON è dato di prova', !E.looksTestString('Casa Prati'));

ok('email @example.com è finta', E.looksTestEmail('a@example.com'));
ok('test@qualcosa.it è finta', E.looksTestEmail('test@qualcosa.it'));
ok('email vera non è finta', !E.looksTestEmail('valentino@boomrome.com'));
ok('email vera .it non è finta', !E.looksTestEmail('giulia.rossi@gmail.com'));

ok('+39 000000000 è telefono finto', E.looksTestPhone('+39 000000000'));
ok('1234567 è telefono finto', E.looksTestPhone('1234567'));
ok('cellulare vero non è finto', !E.looksTestPhone('+39 331 325 1961'));

console.log('\n── Il lucchetto sui documenti che pesano ─────────────────');

ok('pagamento incassato è protetto', E.isProtected('payments', { status: 'paid', amount: 1200 }));
ok('pagamento via Stripe è protetto', E.isProtected('payments', { stripeSessionId: 'cs_1' }));
ok('pagamento pendente NON è protetto', !E.isProtected('payments', { status: 'pending' }));
ok('contratto firmato è protetto', E.isProtected('contracts', { tenantSignature: 'data:image/png…' }));
ok('contratto registrato è protetto', E.isProtected('contracts', { registrationNumber: 'RM123' }));
ok('bozza di contratto NON è protetta', !E.isProtected('contracts', { signatureStatus: 'none' }));
ok('documento con file è protetto', E.isProtected('documents', { url: 'https://…/f.pdf' }));
ok('utente admin è protetto', E.isProtected('users', { role: 'admin' }));

// Il caso che conta: un pagamento INCASSATO ma con nome di test resta
// visibile, spiegato, ma MAI preselezionato.
{
  const v = E.classifyDoc('payments', { id: 'p1', name: 'test', status: 'paid', amount: 900 }, { index: {} });
  ok('pagamento incassato con nome di test: marcato ma protetto', v.flagged && v.protected);
}

console.log('\n── Riferimenti rotti (orfani) ────────────────────────────');
{
  const index = { contracts: new Set(['c1']), properties: new Set(['pr1']), users: new Set(['u1']) };
  const orphan = E.classifyDoc('payments', { id: 'p9', contractId: 'SPARITO', amount: 100 }, { index });
  ok('pagamento senza contratto è marcato orfano',
    orphan.flagged && orphan.reasons.some(r => r.includes('riferimento rotto')));

  const good = E.classifyDoc('payments', { id: 'p1', contractId: 'c1', amount: 100 }, { index });
  ok('pagamento con contratto vivo non è marcato', !good.flagged);

  // Il caso che salva la vita: se la collezione NON è stata caricata (chiave
  // assente dall'indice) non si dichiara orfano nessuno — altrimenti al primo
  // caricamento parziale si proporrebbe di cancellare mezzo archivio.
  const notLoaded = E.classifyDoc('payments', { id: 'p9', contractId: 'zzz', amount: 100 }, { index: {} });
  ok('collezione non caricata → nessun orfano dichiarato', !notLoaded.flagged);

  // Ma se la collezione È stata caricata ed è davvero vuota, l'orfano è reale.
  const loadedEmpty = E.classifyDoc('payments', { id: 'p9', contractId: 'zzz', amount: 100 }, { index: { contracts: new Set() } });
  ok('collezione caricata e vuota → orfano reale', loadedEmpty.flagged);
}

console.log('\n── Notifiche vecchie ─────────────────────────────────────');
{
  const now = new Date('2026-07-28T12:00:00Z');
  const old = E.classifyDoc('notifications',
    { id: 'n1', title: 'Pagamento ricevuto', read: true, createdAt: '2026-01-01T10:00:00Z' },
    { index: {}, now });
  ok('notifica letta di 6 mesi fa è marcata', old.flagged && old.severity === 'bassa');

  const recent = E.classifyDoc('notifications',
    { id: 'n2', title: 'Pagamento ricevuto', read: true, createdAt: '2026-07-20T10:00:00Z' },
    { index: {}, now });
  ok('notifica letta di 8 giorni fa NON è marcata', !recent.flagged);

  const unread = E.classifyDoc('notifications',
    { id: 'n3', title: 'Contratto in scadenza', read: false, createdAt: '2026-01-01T10:00:00Z' },
    { index: {}, now });
  ok('notifica NON letta non viene marcata per anzianità',
    !unread.reasons.some(r => r.includes('già letta')));
}

console.log('\n── Scansione completa + preselezione prudente ────────────');
{
  const dataset = {
    users: [{ id: 'u1', name: 'Valentino', email: 'v@boomrome.com', role: 'admin' },
            { id: 'u2', name: 'Test Utente', email: 'test@example.com' }],
    properties: [{ id: 'pr1', name: 'Attico Testaccio', ownerId: 'u1' }],
    payments: [{ id: 'p1', contractId: 'FANTASMA', amount: 500, status: 'pending' },
               { id: 'p2', contractId: 'FANTASMA', amount: 500, status: 'paid' }],
    contracts: []
  };
  const r = E.scanDataset(dataset, { now: new Date('2026-07-28') });
  const flat = r.groups.flatMap(g => g.items);
  const byId = Object.fromEntries(flat.map(i => [i.id, i]));

  ok('utente di test trovato', !!byId.u2);
  ok('utente di test: due segnali → severità alta', byId.u2.severity === 'alta');
  ok('utente di test preselezionato', byId.u2.preselected === true);
  ok('immobile "Testaccio" NON marcato', !byId.pr1);
  ok('admin NON marcato', !byId.u1);
  ok('pagamento orfano pendente trovato', !!byId.p1);
  ok('pagamento orfano INCASSATO non è preselezionato', byId.p2 && byId.p2.preselected === false);
  eq('totale documenti scansionati', r.totals.scanned, 5);   // 2 utenti + 1 immobile + 2 pagamenti
}

console.log('\n── Effetti a cascata mostrati PRIMA di cancellare ────────');
{
  const dataset = {
    contracts: [{ id: 'c1', propertyId: 'pr1' }],
    payments: [{ id: 'p1', contractId: 'c1', amount: 100 }, { id: 'p2', contractId: 'c2', amount: 100 }],
    properties: [{ id: 'pr1', name: 'Casa' }]
  };
  const extra = E.cascadeFor([{ collection: 'contracts', id: 'c1' }], dataset);
  eq('cancellando un contratto si segnala 1 pagamento a rischio', extra.length, 1);
  eq('è il pagamento giusto', extra[0].id, 'p1');
  ok('non è preselezionato', extra[0].preselected === false);

  const extra2 = E.cascadeFor([{ collection: 'properties', id: 'pr1' }], dataset);
  eq('cancellando un immobile si segnala il suo contratto', extra2.length, 1);
  eq('è il contratto giusto', extra2[0].id, 'c1');
}

console.log("\n── L'INNESTO: codice fiscale ─────────────────────────────");

ok('CF valido accettato (RSSMRA85T10A562S)', E.validateCF('RSSMRA85T10A562S').valid);
ok('CF valido accettato (MRTMTT25D09F205Z)', E.validateCF('MRTMTT25D09F205Z').valid);
ok('CF valido accettato (MLLSNT82P65Z404U)', E.validateCF('MLLSNT82P65Z404U').valid);
ok('CF con carattere di controllo sbagliato rifiutato', !E.validateCF('RSSMRA85T10A562A').valid);
ok('CF troppo corto rifiutato', !E.validateCF('RSSMRA85T10').valid);
ok('CF con mese inesistente rifiutato', !E.validateCF('RSSMRA85Z10A562S').valid);
ok('CF vuoto rifiutato', !E.validateCF('').valid);
ok('spazi e minuscole tollerati', E.validateCF(' rssmra85t10a562s ').valid);
ok('il motivo del rifiuto è spiegato', /controllo/.test(E.validateCF('RSSMRA85T10A562A').reason));

console.log("\n── L'INNESTO: IBAN ───────────────────────────────────────");
ok('IBAN italiano valido accettato', E.validateIBAN('IT60X0542811101000000123456').valid);
ok('IBAN con refuso rifiutato', !E.validateIBAN('IT60X0542811101000000123457').valid);
ok('IBAN italiano di lunghezza sbagliata rifiutato', !E.validateIBAN('IT60X05428111010000001234').valid);
ok('IBAN con spazi tollerato', E.validateIBAN('IT60 X054 2811 1010 0000 0123 456').valid);
ok('IBAN vuoto rifiutato', !E.validateIBAN('').valid);

console.log('\n── Validazione della proposta di import ──────────────────');
{
  const good = E.validateProposal({
    property: { name: 'Bilocale Pigneto', rent: 1100 },
    tenant: { name: 'Giulia Verdi', email: 'g@gmail.com', codiceFiscale: 'MRTMTT25D09F205Z' },
    contract: { startDate: '2026-09-01', endDate: '2027-08-31', rent: 1100, paymentDay: 5, installmentMonths: 1 }
  });
  ok('proposta coerente passa', good.ok, JSON.stringify(good.errors));

  const bad = E.validateProposal({
    contract: { startDate: '2027-01-01', endDate: '2026-01-01', rent: 0 }
  });
  ok('date invertite bloccano', !bad.ok && bad.errors.some(e => e.includes('successiva')));
  ok('canone zero blocca', bad.errors.some(e => e.includes('canone')));

  const warn = E.validateProposal({
    tenant: { name: 'Luca Bianchi' },
    contract: { startDate: '2026-01-01', endDate: '2027-01-01', rent: 25000, paymentDay: 31 }
  });
  ok('inquilino senza email → avviso, non errore', warn.warnings.some(w => w.includes('senza email')));
  ok('canone sospetto → avviso', warn.warnings.some(w => w.includes('totale annuo')));
  ok('giorno pagamento 31 → avviso', warn.warnings.some(w => w.includes('1-28')));
  ok('gli avvisi non bloccano', warn.ok);

  const badCf = E.validateProposal({ tenant: { name: 'X', email: 'x@y.it', codiceFiscale: 'RSSMRA85T10A562A' } });
  ok('CF sbagliato blocca l\'import', !badCf.ok);
}

console.log('\n── Riconoscere chi è già in archivio ─────────────────────');
{
  const existing = [
    { id: 'u1', name: 'Giulia Verdi', email: 'giulia@gmail.com', codiceFiscale: 'MRTMTT25D09F205Z' },
    { id: 'u2', name: 'Marco Neri', email: 'marco@gmail.com' }
  ];
  eq('stesso CF → aggancio certo',
    E.findMatch({ name: 'G. Verdi', codiceFiscale: 'MRTMTT25D09F205Z' }, existing).match.id, 'u1');
  eq('stessa email → aggancio',
    E.findMatch({ name: 'Altro Nome', email: 'MARCO@gmail.com' }, existing).match.id, 'u2');
  eq('stesso nome invertito → aggancio',
    E.findMatch({ name: 'Verdi Giulia' }, existing).match.id, 'u1');
  eq('persona nuova → nessun aggancio',
    E.findMatch({ name: 'Chiara Blu', email: 'chiara@gmail.com' }, existing).match, null);
  ok('il motivo dell\'aggancio è dichiarato',
    E.findMatch({ codiceFiscale: 'MRTMTT25D09F205Z' }, existing).why === 'stesso codice fiscale');

  const props = [{ id: 'pr1', name: 'Bilocale Pigneto', address: 'Via del Pigneto 12' }];
  eq('stesso indirizzo scritto diverso → aggancio',
    E.findMatch({ name: 'Altra cosa', address: 'via del pigneto  12' }, props, 'property').match.id, 'pr1');
}

console.log('\n── Normalizzazione verso lo schema del portale ───────────');
{
  const n = E.normalizeProposal({
    property: { name: '  Bilocale Pigneto ', rent: '1.100', sqm: '55 mq', energyClass: 'c' },
    contract: { type: 'TRANSITORIO', startDate: '01/09/2026', endDate: '2027-08-31',
                rent: '€ 1.100,00', paymentDay: '5', installmentMonths: '3', cedolareSecca: true },
    tenant: { name: 'Giulia Verdi', codiceFiscale: 'mrtmtt25d09f205z' }
  });
  eq('data italiana convertita in ISO', n.contract.startDate, '2026-09-01');
  eq('importo con separatori interpretato', n.contract.rent, 1100);
  eq('metri quadri estratti dal testo', n.property.sqm, 55);
  eq('cadenza trimestrale conservata', n.contract.installmentMonths, 3);
  eq('CF in maiuscolo', n.tenant.codiceFiscale, 'MRTMTT25D09F205Z');
  eq('classe energetica in maiuscolo', n.property.energyClass, 'C');
  eq('nome ripulito dagli spazi', n.property.name, 'Bilocale Pigneto');
  eq('cedolare secca in formato portale', n.contract.cedolareSecca, 'si');

  const n2 = E.normalizeProposal({
    property: { name: 'Casa' },
    contract: { startDate: '2026-01-01', endDate: '2027-01-01', rent: 900, installmentMonths: 7, paymentDay: 99 }
  });
  eq('immobile eredita il canone dal contratto', n2.property.rent, 900);
  eq('cadenza non valida → mensile', n2.contract.installmentMonths, 1);
  eq('giorno pagamento fuori scala → 5', n2.contract.paymentDay, 5);
}

console.log('\n── Dati aziendali fuori dal codice (IBAN incluso) ────────');
{
  ok('il vecchio segnaposto è riconosciuto', E.isPlaceholderIban('IT00X0000000000000000000000'));
  ok('IBAN vuoto è "da compilare"', E.isPlaceholderIban(''));
  ok('IBAN con refuso vale quanto un finto', E.isPlaceholderIban('IT60X0542811101000000123457'));
  ok('IBAN vero non è segnaposto', !E.isPlaceholderIban('IT60X0542811101000000123456'));
  ok('IBAN vero con spazi non è segnaposto', !E.isPlaceholderIban('IT60 X054 2811 1010 0000 0123 456'));

  const defaults = { name: 'BOOM', legal: 'Egidi Immobiliare S.r.l.', iban: 'IT00X0000000000000000000000', email: 'info@boomrome.com' };

  const m1 = E.mergeCompany(defaults, { iban: 'it60 x054 2811 1010 0000 0123 456', phone: '+39 331 325 1961' });
  eq('IBAN normalizzato in maiuscolo senza spazi', m1.company.iban, 'IT60X0542811101000000123456');
  eq('campo nuovo aggiunto', m1.company.phone, '+39 331 325 1961');
  eq('default conservato se non sovrascritto', m1.company.legal, 'Egidi Immobiliare S.r.l.');
  eq('nessun avviso con IBAN valido', m1.warnings.length, 0);

  const m2 = E.mergeCompany(defaults, {});
  ok('IBAN non configurato → avviso esplicito', m2.warnings.length === 1 && /IBAN aziendale/.test(m2.warnings[0]));
  ok("l'avviso dice dove sistemarlo", /Impostazioni/.test(m2.warnings[0]));

  const m3 = E.mergeCompany(defaults, { iban: '   ', email: '' });
  eq('un valore vuoto non cancella il default', m3.company.email, 'info@boomrome.com');

  const m4 = E.mergeCompany(defaults, { role: 'admin', __proto__: { x: 1 }, evil: 'drop', piva: ' 17546591000 ' });
  ok('campo fuori whitelist ignorato', m4.company.evil === undefined && m4.company.role === undefined);
  eq('partita IVA ripulita', m4.company.piva, '17546591000');
}


console.log('\n── Il fascicolo a più letture (merge + derivazioni) ──────');
{
  // Il PDF del contratto, POI la carta d'identità: la seconda lettura
  // riempie i buchi e non tocca MAI un campo pieno (che potrebbe essere
  // una correzione dell'operatore).
  const base = {
    tenant: { name: 'Oyku Testa', email: '', codiceFiscale: '' },
    contract: { startDate: '2026-09-01', endDate: '2027-08-31', rent: 1100, deposit: null, depositMonths: 2 }
  };
  const extra = {
    tenant: { name: 'OYKU TESTA (dal documento)', email: 'oyku@example.com', codiceFiscale: 'TSTOYK95A41Z243X', birthDate: '1995-01-01' },
    property: { name: 'Via Simeto 12', address: 'Via Simeto 12, Roma', rent: 1100 }
  };
  const m = E.mergeProposal(base, extra);
  eq('un campo PIENO non si tocca mai (il nome resta quello a video)', m.tenant.name, 'Oyku Testa');
  eq('i buchi si riempiono (email dal documento)', m.tenant.email, 'oyku@example.com');
  eq('i campi nuovi entrano (CF dal documento)', m.tenant.codiceFiscale, 'TSTOYK95A41Z243X');
  ok('una sezione assente arriva intera', m.property && m.property.address === 'Via Simeto 12, Roma');
  eq('le sezioni non toccate restano identiche', m.contract, base.contract);
  ok('merge non muta gli argomenti', base.tenant.email === '' && !base.property);

  const d = E.deriveProposal({ contract: { rent: 1100, deposit: null, depositMonths: 2 }, property: { name: '', address: 'Via Simeto 12, Roma', rent: null } });
  eq('deposito derivato: mensilità × canone', d.contract.deposit, 2200);
  eq("il nome dell'immobile nasce dall'indirizzo", d.property.name, 'Via Simeto 12, Roma');
  const d2 = E.deriveProposal({ contract: { rent: null, deposit: 500, depositMonths: 2 }, property: { name: 'Casa', rent: 900 } });
  eq('il canone del contratto eredita dall\'immobile', d2.contract.rent, 900);
  eq('un deposito DICHIARATO non viene mai ricalcolato', d2.contract.deposit, 500);
}

console.log('\n── Cosa il codice fiscale DICE (data, sesso, nome) ───────');
{
  // RSSMRA85T10A562S: Mario Rossi, nato il 10/12/1985 (T = dicembre), uomo.
  const b = E.cfBirth('RSSMRA85T10A562S');
  eq('il CF porta giorno, mese, anno e sesso', b, { yy: 85, month: 12, day: 10, sex: 'M' });
  ok('la data del documento che CONFERMA il CF passa', E.cfBirthDateMatches('RSSMRA85T10A562S', '1985-12-10') === true);
  ok('giorno e mese invertiti (10/12 vs 12/10) → NON tornano', E.cfBirthDateMatches('RSSMRA85T10A562S', '1985-10-12') === false);
  ok('senza data non si giudica (null, non false)', E.cfBirthDateMatches('RSSMRA85T10A562S', '') === null);
  ok('CF non valido → null, mai un verdetto', E.cfBirthDateMatches('RSSMRA85T10A562X', '1985-12-10') === null);
  // Donna: giorno + 40. RSSNNA80A41H501L → 01/01/1980, F (checksum reale).
  const f = E.cfBirth('RSSNNA80A41H501L');
  ok('il +40 del giorno dice donna e riporta il giorno vero', f && f.sex === 'F' && f.day === 1 && f.month === 1 && f.yy === 80, JSON.stringify(f));
  ok('il nome nell\'ordine Nome Cognome torna', E.cfMatchesName('RSSMRA85T10A562S', 'Mario Rossi') === true);
  ok('…e nell\'ordine Cognome Nome pure', E.cfMatchesName('RSSMRA85T10A562S', 'Rossi Mario') === true);
  ok('…anche con un titolo davanti', E.cfMatchesName('RSSMRA85T10A562S', 'Sig. Mario Rossi') === true);
  ok('il CF di un\'ALTRA persona non torna', E.cfMatchesName('RSSMRA85T10A562S', 'Anna Verdi') === false);
  ok('un nome solo non si giudica (null)', E.cfMatchesName('RSSMRA85T10A562S', 'Mario') === null);
  // Nome con meno di tre consonanti e cognome composto: la regola vocali/X.
  ok('cognome composto con apostrofo (D\'Angelo)', E.cfMatchesName('DNGMRC90A01H501V', 'Marco D\'Angelo') !== null);
  ok('partita IVA valida (Luhn)', E.validatePIva('01234567897').valid, E.validatePIva('01234567897').reason);
  ok('partita IVA con refuso rifiutata', !E.validatePIva('01234567890').valid);
}

console.log('\n── La proposta ampia: solo le sezioni che il materiale porta ──');
{
  // Con l'output strutturato arrivano SEMPRE quattro sezioni piene di null:
  // una carta d'identità non deve far nascere una card «Contratto».
  const pruned = E.pruneProposal({
    landlord: { name: null, email: null, kind: 'fisica' },
    tenant: { name: 'Marta Neri', codiceFiscale: null },
    property: { name: null, address: null, cadastral: { foglio: null } },
    contract: { cedolareSecca: true, rent: null, type: null },
    coTenants: [{ name: '' }, { name: 'Luca Bianchi' }],
  });
  eq('restano solo inquilino e co-conduttore vero', Object.keys(pruned).sort(), ['coTenants', 'tenant']);
  ok('un booleano di default non è un\'ancora per il contratto', !pruned.contract);
  const withCat = E.pruneProposal({ property: { name: null, address: null, cadastral: { foglio: '12' } } });
  ok('il foglio catastale è un\'ancora per l\'immobile (una visura)', !!withCat.property);

  const n = E.normalizeProposal({
    landlord: { name: 'Rossi Immobiliare', businessName: 'Rossi Immobiliare S.r.l.', partitaIva: '01234567897', kind: 'giuridica', iban: 'it60 x054 2811 1010 0000 0123 456' },
    tenant: { name: 'Marta Neri', codiceFiscale: 'nremrt99t41h501k ', birthDate: '01/12/1999', docType: 'Carta d\'identità', docNum: 'ca123', permessoScadenza: '2027/03/01' },
    coTenants: [{ name: 'Luca Bianchi', birthDate: '2000-02-02' }, { name: '' }],
    property: { address: 'Via Cavour 12', cadastral: { foglio: '12', particella: '345', sub: '6', categoria: 'a/2', rendita: '812,50' }, tabelle: { proprieta: '45,5' }, furnished: true },
    contract: { type: '32', rent: '1.100,00', cedolareSecca: null, startDate: '2026-09-01', durationMonths: 36, installmentMonths: '3', condoMode: 'incluso', studenti: { corsoStudi: null } },
  });
  eq('il tipo «32» diventa 3+2', n.contract.type, '3+2');
  eq('cedolare non detta = sì (come la legge il modello C e _finalize)', n.contract.cedolareSecca, 'si');
  eq('cadenza dalla stringa "3"', n.contract.installmentMonths, 3);
  eq('il canone italiano «1.100,00» è 1100', n.contract.rent, 1100);
  eq('il catasto annidato del modello diventa piatto', [n.property.foglio, n.property.particella, n.property.sub, n.property.categoria, n.property.renditaCatastale], ['12', '345', '6', 'A/2', 812.5]);
  eq('le tabelle millesimali', n.property.tabelleMillesimali.proprieta, 45.5);
  eq('ammobiliato true → yes', n.property.furnished, 'yes');
  eq('ammobiliato "si" (la forma del nuovo schema, senza null) → yes; "" → vuoto', [E.normalizeProposal({ property: { address: 'x', furnished: 'si' } }).property.furnished, E.normalizeProposal({ property: { address: 'x', furnished: '' } }).property.furnished], ['yes', '']);
  eq('i numeri come stringhe di cifre: sqm "65" → 65, "" → null', [E.normalizeProposal({ property: { address: 'x', sqm: '65' } }).property.sqm, E.normalizeProposal({ property: { address: 'x', sqm: '' } }).property.sqm], [65, null]);
  eq('propertyType senza maiuscole garantite dall\'API: «Apartment» → apartment', E.normalizeProposal({ property: { address: 'x', propertyType: 'Apartment' } }).property.propertyType, 'apartment');
  eq('il documento in italiano diventa il codice', n.tenant.docType, 'id');
  eq('numero documento maiuscolo', n.tenant.docNum, 'CA123');
  eq('data aaaa/mm/gg letta', n.tenant.permessoScadenza, '2027-03-01');
  eq('la società: kind, ragione sociale e P.IVA', [n.landlord.kind, n.landlord.businessName, n.landlord.partitaIva], ['giuridica', 'Rossi Immobiliare S.r.l.', '01234567897']);
  eq('IBAN senza spazi, maiuscolo', n.landlord.iban, 'IT60X0542811101000000123456');
  eq('il co-conduttore senza nome sparisce', n.coTenants.length, 1);
  ok('un blocco studenti vuoto è null', n.contract.studenti === null);
  eq('normalizzare due volte non cambia nulla', E.normalizeProposal(n), n);

  const d = E.deriveProposal(JSON.parse(JSON.stringify(n)));
  eq('la fine nasce dalla durata (inizio + 36 mesi − 1 giorno)', d.contract.endDate, '2029-08-31');
  eq('il catasto in testo si compone dalle parti', d.property.cadastralData, 'foglio 12, particella 345, sub 6, cat. A/2');
  ok('ogni derivazione è DICHIARATA', d.derived && d.derived['contract.endDate'] && d.derived['property.cadastralData']);
  const d2 = E.deriveProposal({ contract: { rent: 900, deposit: 1800, depositMonths: null, startDate: '2026-09-01', endDate: '2027-08-31' } });
  eq('le mensilità del deposito dal rapporto deposito/canone', d2.contract.depositMonths, 2);
  eq('la durata in mesi dalle date', d2.contract.durationMonths, 12);
  const d3 = E.deriveProposal({ property: { cadastralData: 'Foglio 12 Part. 345 Sub. 6 cat. A/2' } }, { parseCadastral: (b) => ({ foglio: '12', particella: '345', sub: '6', categoria: 'A/2', sezione: '' }) });
  eq('il blob catastale si legge nelle parti col dizionario (una copia sola)', [d3.property.foglio, d3.property.sub], ['12', '6']);

  eq('mesi pieni: 01/09 → 31/08 = 12', E.monthsSpan('2026-09-01', '2027-08-31'), 12);
  eq('mesi pieni: 10/09 → 09/03 = 6', E.monthsSpan('2026-09-10', '2027-03-09'), 6);
  eq('mesi parziali contano i soli interi: 10/09 → 01/03 = 5', E.monthsSpan('2026-09-10', '2027-03-01'), 5);
}

console.log('\n── I controlli che un modello non fa da solo ──────────────');
{
  const v = E.validateProposal({ tenant: { name: 'Mario Rossi', email: 'm@x.it', codiceFiscale: 'RSSMRA85T10A562S', birthDate: '1985-10-12' } });
  ok('CF valido ma data invertita → ERRORE bloccante', !v.ok && v.errors.some(e => /letto male/.test(e)), JSON.stringify(v));
  const v2 = E.validateProposal({ tenant: { name: 'Anna Verdi', email: 'a@x.it', codiceFiscale: 'RSSMRA85T10A562S', birthDate: '1985-12-10' } });
  ok('CF di un\'altra persona → AVVISO col nome', v2.ok && v2.warnings.some(w => /non corrisponde al nome/.test(w)), JSON.stringify(v2));
  const v3 = E.validateProposal({ tenant: { name: 'Mario Rossi', email: 'm@x.it', codiceFiscale: 'RSSMRA85T10A562S', birthDate: '1985-12-10' } });
  ok('CF coerente con data e nome → nessun rilievo', v3.ok && !v3.warnings.some(w => /codice fiscale/.test(w)), JSON.stringify(v3));
  const v4 = E.validateProposal({ contract: { type: 'transitorio', startDate: '2026-09-01', endDate: '2028-08-31', rent: 1000, deposit: 4000, depositMonths: 4 } });
  ok('deposito oltre 3 mensilità → avviso art. 11 L. 392/78', v4.warnings.some(w => /art\. 11 L\. 392\/78/.test(w)), JSON.stringify(v4.warnings));
  ok('transitorio di 24 mesi → avviso sulla durata di legge', v4.warnings.some(w => /da 1 a 18 mesi/.test(w)), JSON.stringify(v4.warnings));
  ok('transitorio senza esigenza → avviso', v4.warnings.some(w => /esigenza/.test(w)));
  const v5 = E.validateProposal({ contract: { type: '3+2', startDate: '2026-09-01', endDate: '2029-08-31', rent: 1000, transitionalReason: '' } });
  ok('un 3+2 di 36 mesi non riceve l\'avviso del transitorio', !v5.warnings.some(w => /18 mesi|esigenza/.test(w)), JSON.stringify(v5.warnings));
  const v6 = E.validateProposal({ landlord: { name: 'Rossi S.r.l.', kind: 'giuridica', codiceFiscale: '01234567897' } });
  ok('una società: CF di 11 cifre valido (Luhn), nessun errore', v6.ok, JSON.stringify(v6.errors));
  const v7 = E.validateProposal({ landlord: { name: 'Rossi S.r.l.', kind: 'giuridica', codiceFiscale: '01234567890' } });
  ok('…e con un refuso viene fermata', !v7.ok);
  const v8 = E.validateProposal({ coTenants: [{ name: '', codiceFiscale: '' }] });
  ok('co-conduttore senza nome → errore', !v8.ok && v8.errors.some(e => /Co-conduttore 1: manca il nome/.test(e)));
}

console.log('\n── La modifica proposta: prima → dopo sul record che c\'è già ──');
{
  const rec = { id: 'u1', name: 'Marta Neri', email: '', address: 'Via Cavour 12', codiceFiscale: '', role: 'tenant' };
  const diff = E.diffRecord('person', { name: 'Marta Neri', email: 'marta@x.it', address: 'Via Cavour 12/B', codiceFiscale: 'NREMRT99T41H501X', birthDate: '' }, rec);
  eq('due buchi da riempire, un valore che cambia', [diff.fills, diff.changes], [2, 1]);
  ok('il nome uguale NON compare', !diff.rows.some(r => r.key === 'name'));
  ok('il campo vuoto della proposta NON compare', !diff.rows.some(r => r.key === 'birthDate'));
  const patch = E.applyDiff(diff, {});
  eq('di default si scrivono SOLO i buchi (nei due schemi users)', patch, { email: 'marta@x.it', codiceFiscale: 'NREMRT99T41H501X', cf: 'NREMRT99T41H501X' });
  ok('…un valore che cambia NON parte da solo', !('address' in patch));
  eq('spuntato dall\'operatore, il cambio entra', E.applyDiff(diff, { address: true }).address, 'Via Cavour 12/B');
  eq('e un buco de-spuntato resta fuori', 'email' in E.applyDiff(diff, { email: false }), false);
  const same = E.diffRecord('person', { codiceFiscale: 'nremrt99t41h501x' }, { cf: 'NREMRT99T41H501X' });
  eq('il CF letto nell\'altro schema (cf) e con altra grafia è UGUALE', same.rows.length, 0);
  const pd = E.diffRecord('property', { interno: '7', foglio: '12', rent: 1200 }, { unit: '7', rent: 1100 });
  ok('interno letto da unit: uguale; il canone diverso è un cambio', pd.rows.length === 2 && pd.rows.some(r => r.key === 'foglio' && r.action === 'fill') && pd.rows.some(r => r.key === 'rent' && r.action === 'change'), JSON.stringify(pd));
  ok('«fisica» non è un dato da scrivere', E.diffRecord('person', { kind: 'fisica' }, {}).rows.length === 0);

  // Il merge dei co-conduttori: stessa persona → i suoi buchi; nuova → in coda.
  const m = E.mergeProposal(
    { tenant: { name: 'A' }, coTenants: [{ name: 'Luca Bianchi', codiceFiscale: '', email: 'l@x.it' }] },
    { coTenants: [{ name: 'Bianchi Luca', codiceFiscale: 'BNCLCU00B02H501C', email: 'altro@x.it' }, { name: 'Sara Blu', codiceFiscale: '' }] });
  eq('lo stesso co-conduttore (nome invertito) riceve il CF mancante', m.coTenants[0].codiceFiscale, 'BNCLCU00B02H501C');
  eq('…ma la sua email piena non si tocca', m.coTenants[0].email, 'l@x.it');
  eq('la persona nuova si aggiunge', m.coTenants.length, 2);
  const m2 = E.mergeProposal({ contract: { type: 'studenti', studenti: { corsoStudi: 'Economia', universita: '' } } }, { contract: { studenti: { corsoStudi: 'Altro', universita: 'LUISS' } } });
  eq('gli oggetti annidati si fondono campo per campo', m2.contract.studenti, { corsoStudi: 'Economia', universita: 'LUISS' });
}

console.log('\n' + '─'.repeat(56));
if (failed) {
  console.log(`\x1b[31mDataOps: ${passed} passed, ${failed} failed\x1b[0m`);
  fails.forEach(f => console.log('   ✗ ' + f));
  process.exit(1);
}
console.log(`\x1b[1mDataOps: ${passed} passed, 0 failed\x1b[0m`);
console.log('\x1b[32mIl motore non cancella dati veri e non crea contratti sbagliati.\x1b[0m');
