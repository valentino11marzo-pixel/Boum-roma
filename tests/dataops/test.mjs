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

console.log('\n' + '─'.repeat(56));
if (failed) {
  console.log(`\x1b[31mDataOps: ${passed} passed, ${failed} failed\x1b[0m`);
  fails.forEach(f => console.log('   ✗ ' + f));
  process.exit(1);
}
console.log(`\x1b[1mDataOps: ${passed} passed, 0 failed\x1b[0m`);
console.log('\x1b[32mIl motore non cancella dati veri e non crea contratti sbagliati.\x1b[0m');
