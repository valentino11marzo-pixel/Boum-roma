// tests/invoice/link.mjs — il link di pagamento della fattura.
//
// Il link È la credenziale: chi ce l'ha vede il documento e può pagarlo. Le
// tre cose che questa suite tiene ferme sono quelle che, sbagliate, fanno
// danno vero: che il token non si possa forgiare, che una fattura già
// incassata non si possa ripagare, e che la pagina pubblica non mostri più
// di quanto deve.
//
//   node tests/invoice/link.mjs

process.env.HOMIE_SECRET = process.env.HOMIE_SECRET || 'test-secret-for-links';

const L = await import('../../api/invoices/_link.js');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('  \x1b[32m✓\x1b[0m ' + name); pass++; }
  catch (e) { console.log('  \x1b[31m✗\x1b[0m ' + name + '\n      ' + e.message); fail++; }
};
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' atteso ' + JSON.stringify(b) + ', ottenuto ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'atteso true'); };

console.log('\nTOKEN — derivato, non memorizzato');

t('andata e ritorno', () => {
  const ref = L.payRef('inv_abc123');
  eq(L.parsePayRef(ref), 'inv_abc123');
});

t('stabile: la stessa fattura dà sempre lo stesso link', () => {
  eq(L.payToken('inv_x'), L.payToken('inv_x'));
});

t('ogni fattura ha il SUO token — nessuna migrazione, nessun campo da tenere in sync', () => {
  ok(L.payToken('inv_a') !== L.payToken('inv_b'));
  // Il punto della derivazione: anche una fattura creata prima che questo
  // codice esistesse ha già un link valido.
  ok(L.parsePayRef(L.payRef('fattura-del-2019')) === 'fattura-del-2019');
});

t('un token forgiato non passa', () => {
  const ref = L.payRef('inv_abc123');
  const [, tok] = ref.split('.');
  eq(L.parsePayRef('inv_altro.' + tok), null, 'id sostituito');
  eq(L.parsePayRef('inv_abc123.' + 'f'.repeat(24)), null, 'token inventato');
  eq(L.parsePayRef('inv_abc123.' + tok.slice(0, -1)), null, 'token troncato');
  eq(L.parsePayRef('inv_abc123'), null, 'token assente');
  eq(L.parsePayRef(''), null);
  eq(L.parsePayRef(null), null);
});

t('un id che contiene punti resta leggibile (si spezza sull\'ULTIMO)', () => {
  const ref = L.payRef('inv.con.punti');
  eq(L.parsePayRef(ref), 'inv.con.punti');
});

t('il tipo di documento entra nella derivazione', async () => {
  // Un token /fattura non deve valere per una visita o una scheda: se la
  // derivazione fosse solo sull'id, gli id collidenti aprirebbero l'una
  // con il token dell'altra.
  const V = await import('../../api/viewings/_lib.js');
  ok(L.payToken('X1') !== V.manageToken('X1'), 'stesso id, token identici fra domini diversi');
});

t('ruotare il segreto revoca tutti i link', async () => {
  const before = L.payToken('inv_1');
  process.env.HOMIE_SECRET = 'un-altro-segreto';
  const mod = await import('../../api/invoices/_link.js?v=2');
  ok(mod.payToken('inv_1') !== before);
  process.env.HOMIE_SECRET = 'test-secret-for-links';
});

console.log('\nPAGABILITÀ — quello che il bottone può fare');

const base = {
  status: 'issued', number: '12/2026', docType: 'TD01',
  totals: { total: 1991.44, netToPay: 1991.44 },
};

t('una fattura emessa e non pagata è pagabile', () => {
  ok(L.isPayable(base));
  eq(L.amountCents(base), 199144);
});

t('una fattura già incassata NON si ripaga', () => {
  // Il caso reale: il link resta in una chat WhatsApp e qualcuno lo ritocca
  // un mese dopo, quando l'hai già incassata per bonifico.
  ok(!L.isPayable({ ...base, status: 'paid' }));
});

t('una bozza non è pagabile (non esiste ancora)', () => {
  ok(!L.isPayable({ ...base, status: 'draft' }));
  ok(!L.isPayable({ ...base, number: null }));
});

t('una nota di credito restituisce soldi, non li chiede', () => {
  ok(!L.isPayable({ ...base, docType: 'TD04' }));
});

t('un documento annullato non è pagabile', () => {
  ok(!L.isPayable({ ...base, status: 'void' }));
});

t('a importo zero non c\'è niente da incassare', () => {
  ok(!L.isPayable({ ...base, totals: { total: 0, netToPay: 0 } }));
});

t('con la ritenuta si addebita il NETTO, non il lordo', () => {
  // Addebitare il totale documento farebbe pagare al cliente anche la
  // ritenuta che lui deve versare all'Erario: un incasso in eccesso.
  eq(L.amountCents({ ...base, totals: { total: 1220, netToPay: 1105 } }), 110500);
});

t('documenti legacy senza `totals`: si ripiega su `amount`', () => {
  eq(L.amountCents({ ...base, totals: undefined, amount: 350 }), 35000);
  ok(L.isPayable({ status: 'issued', number: '3/2025', amount: 350 }));
});

console.log('\nVISTA PUBBLICA — il link apre una fattura, non l\'archivio');

const full = {
  ...base,
  date: '2026-07-31', dueDate: '2026-08-30',
  buyer: { name: 'Rossi Srl', vat: '12345678903', cf: 'RSSMRA80A01H501U', sdiCode: 'ABC1234', pec: 'x@pec.it', address: 'Via Cavour 3' },
  sellerSnapshot: { name: 'Egidi Immobiliare S.r.l.', vat: '17322991005', iban: 'IT60X0542811101000000123456', reaNumber: '1723456' },
  lines: [{ description: 'Provvigione', qty: 1, unitPrice: 1632.33, vatRate: 22 }],
  totals: { taxable: 1632.33, vat: 359.11, total: 1991.44, netToPay: 1991.44 },
  payment: { iban: 'IT60X0542811101000000123456' },
  causale: 'Contratto del 15/07/2026',
  internalNote: 'cliente lento a pagare, sollecitare',
};

t('mostra quello che serve a riconoscere e pagare il documento', () => {
  const v = L.publicView(full, 'inv1');
  eq(v.number, '12/2026');
  eq(v.buyerName, 'Rossi Srl');
  eq(v.sellerName, 'Egidi Immobiliare S.r.l.');
  eq(v.total, 1991.44);
  eq(v.netToPay, 1991.44);
  eq(v.lines.length, 1);
  ok(v.payable);
});

t('NON espone i dati fiscali del cliente né le note interne', () => {
  const v = L.publicView(full, 'inv1');
  const flat = JSON.stringify(v);
  ['12345678903', 'RSSMRA80A01H501U', 'ABC1234', 'x@pec.it', 'sollecitare', '17322991005', '1723456']
    .forEach((secret) => ok(!flat.includes(secret), 'trapelato nel payload pubblico: ' + secret));
});

t('l\'IBAN del bonifico invece SÌ — è il punto della pagina', () => {
  eq(L.publicView(full, 'inv1').iban, 'IT60X0542811101000000123456');
});

t('una fattura pagata espone la ricevuta, non il bottone', () => {
  const v = L.publicView({ ...full, status: 'paid', paidDate: '2026-08-02', receiptUrl: 'https://pay.stripe.com/receipts/x' }, 'inv1');
  ok(!v.payable);
  eq(v.receiptUrl, 'https://pay.stripe.com/receipts/x');
  eq(v.paidDate, '2026-08-02');
});

t('publicView regge un documento vuoto senza esplodere', () => {
  eq(L.publicView(null, 'x'), null);
  const v = L.publicView({}, 'x');
  eq(v.total, 0);
  eq(v.lines.length, 0);
  ok(!v.payable);
});

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' passati, ' + fail + ' falliti\x1b[0m\n');
process.exit(fail ? 1 : 0);
