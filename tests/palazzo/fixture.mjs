// Il palazzo sintetico: dati dimostrativi, nessun cliente vero. Le date sono
// RELATIVE a `now`, così la stessa fixture vale nel test del motore (data
// fissa) e nel browser (data di oggi) senza diventare stantia.
function romeDay(now) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).forEach(x => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}`;
}
const monthAdd = (m, k) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + k, 1)).toISOString().slice(0, 7);
const dayAdd = (d, k) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };

export function buildFixture(now = new Date()) {
  const today = romeDay(now), month = today.slice(0, 7);
  const M = k => monthAdd(month, k), D = k => dayAdd(today, k);
  const ADDR = 'Viale Esempio 12, 00197 Roma';
  const owner = { id: 'owner-demo', role: 'landlord', name: 'Proprietaria Demo', email: 'owner@example.invalid', phone: '+39 000 000 9999' };
  const prop = (n, floor, extra = {}) => ({ id: 'u' + n, name: 'Viale Esempio 12 int. ' + n, address: ADDR, interno: String(n), floor, ownerId: owner.id, rent: 900 + n * 10, ...extra });
  const properties = [
    prop(1, 'PT', { pod: 'IT001E00000001', pdr: '00000000000001' }), prop(2, 'Piano terra'),
    prop(3, '1° / 5'), prop(4, '1'), prop(5, 'primo piano'),
    prop(6, 2), prop(7, '2nd Floor', { pod: 'IT001E0000007' }), prop(8, '2'),   // int. 7: un POD con una cifra in meno
    prop(9, '3° con ascensore'), prop(10, '3'),
    prop(11, 'Attico'),
    prop(12, ''),
    { id: 'u13', name: 'Viale Esempio, 12 - int 13', address: 'V.le Esempio, 12 int. 13 Roma', interno: '13', floor: '3', ownerId: null, ownerName: 'Proprietaria Demo', rent: 1000 },
    { id: 'altra-1', name: 'Via Altra 3 int. 1', address: 'Via Altra 3, Roma', interno: '1', floor: '1', ownerId: 'owner-altro' },
    { id: 'altra-2', name: 'Via Altra 3 int. 2', address: 'Via Altra 3, Roma', interno: '2', floor: '2', ownerId: 'owner-altro' }
  ];
  // Recapiti finti e dichiarati tali (+39 000…, example.invalid): servono al
  // giro dei contatti, mai a raggiungere qualcuno.
  const lease = (n, rent, extra = {}) => ({ id: 'c' + n, propertyId: 'u' + n, status: 'active', tenantName: 'Inquilino ' + n + ' Demo', rent, startDate: M(-14) + '-01', endDate: M(20) + '-28',
    tenantPhone: '+39000000' + String(n).padStart(4, '0'), tenantEmail: 'inquilino' + n + '@example.invalid', deposit: rent * 2, type: 'transitorio',
    rliRegisteredAt: M(-14) + '-20', cedolareSecca: 'si', ...extra });
  const contracts = [
    lease(1, 900), lease(3, 1000), lease(4, 1100),
    // int. 5: registrazione mai segnata, decorrenza di 14 mesi fa → "Da sistemare"
    lease(5, 950, { rliRegisteredAt: '' }),
    // int. 6: senza cedolare, dichiarato
    lease(6, 1200, { cedolareSecca: 'no' }),
    lease(7, 1000, { endDate: D(60) }),
    // int. 8: inviato ad ASPI, registrazione non ancora segnata
    lease(8, 1050, { rliRegisteredAt: '', registrationStatus: 'sent', aspiRequestedAt: M(-13) + '-02' }),
    lease(9, 980, { status: 'pending', startDate: M(1) + '-01', endDate: M(13) + '-28' }),
    lease(10, 1300, { installmentMonths: 3 }),
    lease(11, 2000, { coTenants: [{ name: 'Coinquilina Demo', phone: '+390000000111' }] }),
    lease(12, 800, { tenantPhone: '', tenantEmail: '', cedolareSecca: undefined }),
    // int. 2: c'era qualcuno, ha chiuso in anticipo due mesi fa
    { id: 'c2old', propertyId: 'u2', status: 'terminated', tenantName: 'Uscito Demo', rent: 900, startDate: M(-14) + '-01', endDate: M(20) + '-28', terminatedAt: M(-2) + '-15' },
    // int. 13: "attivo" in archivio ma scaduto da 4 mesi
    { id: 'c13', propertyId: 'u13', status: 'active', tenantName: 'Vecchio Demo', rent: 1000, startDate: M(-30) + '-01', endDate: M(-4) + '-30' },
    { id: 'c-altra', propertyId: 'altra-1', status: 'active', tenantName: 'Altro Demo', rent: 700, startDate: M(-3) + '-01', endDate: M(9) + '-28' }
  ];
  const pay = (n, k, amount, status, extra = {}) => ({ id: `p${n}_${M(k)}`, propertyId: 'u' + n, contractId: 'c' + n, type: 'rent', month: M(k), amount, status, dueDate: M(k) + '-05', ...(status === 'paid' ? { paidDate: M(k) + '-03' } : {}), ...extra });
  const payments = [];
  for (const [n, amount] of [[1, 900], [4, 1100], [7, 1000], [11, 2000]]) {
    for (let k = -5; k <= 0; k++) payments.push(pay(n, k, amount, 'paid', k === 0 ? { dueDate: D(-1), paidDate: D(-2) } : {}));
  }
  for (let k = -5; k <= -3; k++) payments.push(pay(3, k, 1000, 'paid'));
  payments.push(pay(3, -2, 1000, 'overdue'));            // la forma rinominata in memoria dal portal
  payments.push(pay(3, -1, 1000, 'pending'));            // scaduta il 5 del mese scorso
  payments.push(pay(3, 0, 1000, 'pending', { dueDate: D(-3) }));
  payments.push(pay(5, 0, 950, 'pending', { dueDate: D(4) }));
  payments.push(pay(5, -1, 950, 'paid', { paidDate: M(-1) + '-12' }));   // pagata con 7 giorni di ritardo
  payments.push(pay(6, 0, 1200, 'pending', { dueDate: D(-1), tenantReported: true, tenantReportDate: D(-1), tenantNotes: 'pagato dal conto di mia madre',
    proofUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/payment-proofs%2Flink-p6%2Fricevuta.jpg?alt=media' }));
  payments.push(pay(6, -1, 1200, 'paid'));
  payments.push({ id: 'p10_q', propertyId: 'u10', contractId: 'c10', type: 'rent', month: M(-1), coversTo: M(1), amount: 3900, status: 'paid', dueDate: M(-1) + '-05', paidDate: M(-1) + '-04', installmentMonths: 3 });
  payments.push(pay(12, 0, 800, 'pending', { dueDate: D(-6) }));
  payments.push({ id: 'dep12', propertyId: 'u12', contractId: 'c12', type: 'deposit-balance', amount: 400, status: 'pending', dueDate: M(-1) + '-10' });
  payments.push({ id: 'pa1', propertyId: 'altra-1', contractId: 'c-altra', type: 'rent', month: M(0), amount: 700, status: 'paid', dueDate: D(-1), paidDate: D(-1) });
  const preAgreements = [
    { id: 'pa2', ref: 'BOOM-NEG2', status: 'viewed', propertyId: 'u2', tenant: { fullName: 'Candidata Demo', email: 'cand@example.invalid' }, lease: { startDate: M(1) + '-01', endDate: M(13) + '-28' }, money: { rent: 980 } },
    { id: 'pa13', ref: 'BOOM-RES13', status: 'paid', paidAt: D(-4), propertyId: 'u13', tenant: { fullName: 'Prenotata Demo' }, lease: { startDate: M(1) + '-01', endDate: M(13) + '-28' }, money: { rent: 1050 } },
    { id: 'pa-old', ref: 'BOOM-OLD', status: 'revoked', propertyId: 'u2', tenant: { fullName: 'Revocata Demo' }, lease: { startDate: M(-3) + '-01' }, money: { rent: 900 } },
    { id: 'pa-conv', ref: 'BOOM-CONV', status: 'paid', paidAt: M(-14) + '-01', propertyId: 'u4', contractId: 'c4', tenant: { fullName: 'Inquilino 4 Demo' }, lease: { startDate: M(-14) + '-01' }, money: { rent: 1100 } }
  ];
  const listings = [{ id: 'lst2', propertyId: 'u2', status: 'available', name: 'Bilocale Esempio' }];
  // Manutenzione: i due vocabolari che convivono (portal: plumbing/urgent; /casa: riscaldamento/emergency)
  const maintenance = [
    { id: 'mt7', propertyId: 'u7', title: 'Caldaia ferma', category: 'riscaldamento', priority: 'emergency', status: 'pending', createdAt: D(-1), tenantName: 'Inquilino 7 Demo' },
    { id: 'mt11', propertyId: 'u11', title: 'Scarico lento in bagno', category: 'plumbing', priority: 'medium', status: 'in_progress', createdAt: D(-6), reporter: { role: 'owner' } },
    { id: 'mt4', propertyId: 'u4', title: 'Serratura dura', category: 'locks', priority: 'low', status: 'resolved', createdAt: D(-40), resolvedAt: D(-35) },
    { id: 'mt-altra', propertyId: 'altra-1', title: 'Non è di questo palazzo', category: 'other', priority: 'urgent', status: 'open', createdAt: D(-2) }
  ];
  const users = [owner, { id: 'owner-altro', role: 'landlord', name: 'Altro Proprietario', email: 'altro@example.invalid' }, { id: 'demo-admin', role: 'admin', name: 'Operatore demo' }];
  return { today, month, M, D, state: { profile: { id: 'demo-admin', role: 'admin', name: 'Operatore demo' }, users, properties, contracts, payments, preAgreements, listings, maintenance } };
}
