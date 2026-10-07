// Il palazzo da 18 interni dell'anteprima: la forma di un caso vero (quasi
// tutto affittato, due ritardi, due contratti in scadenza, un libero sul sito,
// uno in trattativa, uno in arrivo) con dati INVENTATI — nessun nome, numero
// o indirizzo reale. Recapiti +39 000… ed example.invalid: non raggiungono
// nessuno. Date relative a `now`, come fixture.mjs.
function romeDay(now) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).forEach(x => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}`;
}
const monthAdd = (m, k) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + k, 1)).toISOString().slice(0, 7);
const dayAdd = (d, k) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };

const NOMI = ['Giulia Ferri', 'Marco Lodi', 'Sara Conti', 'Luca Neri', 'Anna Riva', 'Paolo Greco', 'Elena Sala',
  'Davide Moro', 'Chiara Villa', 'Tommaso Bassi', 'Irene Fabbri', 'Nicola Serra', 'Marta Galli', 'Pietro Rinaldi',
  'Alice Monti', 'Fabio Testa', 'Laura Pace', 'Simone Vitale'];

export function buildFixture18(now = new Date()) {
  const today = romeDay(now), month = today.slice(0, 7);
  const M = k => monthAdd(month, k), D = k => dayAdd(today, k);
  const ADDR = 'Piazza Esempio 42, 00176 Roma';
  const owner = { id: 'owner-demo', role: 'landlord', name: 'Proprietaria Demo', email: 'owner@example.invalid', phone: '+39 000 000 9999' };
  // PT: 2 interni · dal 1° al 5°: 3 per piano · attico: 1 → 18
  const plan = [[1, 'PT'], [2, 'PT']];
  let n = 3;
  for (let f = 1; f <= 5; f++) for (let k = 0; k < 3; k++) plan.push([n++, f + '°']);
  plan.push([18, 'Attico']);
  const look = { palazzoPersiane: 'verde', palazzoIntonaco: 'ocra', ultimoPiano: 6 };
  const properties = plan.map(([i, floor]) => ({ id: 'u' + i, name: 'Piazza Esempio 42 int. ' + i, address: ADDR, interno: String(i), floor,
    ownerId: owner.id, rent: 850 + (i % 5) * 60, ...(i === 1 ? look : {}),
    // POD/PDR inventati, nella forma vera; l'int. 9 ne ha uno scritto male
    pod: i === 9 ? 'IT002E1234' : 'IT002E' + String(10000000 + i).slice(0, 8), pdr: i % 3 ? '0088' + String(1000000000 + i).slice(0, 10) : '' }));

  // Chi è dentro: tutti tranne 6 (libero, sul sito), 14 (in trattativa), 17 (in arrivo).
  const rent = i => 850 + (i % 5) * 60;
  const contracts = [];
  const payments = [];
  for (const [i] of plan) {
    if (i === 6 || i === 14) continue;
    const c = { id: 'c' + i, propertyId: 'u' + i, status: 'active', tenantName: NOMI[i - 1], rent: rent(i), deposit: rent(i) * 2,
      type: i % 4 === 0 ? 'studenti' : i === 18 ? '3+2' : 'transitorio',
      startDate: M(-10 - (i % 6)) + '-01', endDate: M(8 + (i % 9)) + '-' + (i % 2 ? '30' : '28'),
      tenantPhone: '+39000000' + String(i).padStart(4, '0'), tenantEmail: NOMI[i - 1].toLowerCase().replace(/\s+/g, '.') + '@example.invalid',
      rliRegisteredAt: M(-10 - (i % 6)) + '-18', cedolareSecca: i === 13 ? 'no' : 'si' };
    if (i === 4) c.rliRegisteredAt = '';                                                   // registrazione mai segnata
    if (i === 10) Object.assign(c, { rliRegisteredAt: '', registrationStatus: 'sent', aspiRequestedAt: M(-9) + '-03' }); // inviato ad ASPI
    if (i === 3) c.endDate = D(24);                    // in scadenza fra poco più di tre settimane
    if (i === 11) c.endDate = D(70);                   // in scadenza fra due mesi
    if (i === 9) c.coTenants = [{ name: 'Coinquilino Demo', phone: '+390000000909', email: 'coinquilino@example.invalid' }];
    if (i === 15) { c.tenantPhone = ''; }              // un numero che manca: l'admin lo vede in «Da sistemare»
    if (i === 17) Object.assign(c, { status: 'pending', startDate: M(1) + '-01', endDate: M(13) + '-28' });
    contracts.push(c);
    if (i === 17) continue;
    for (let k = -11; k <= 0; k++) {
      if (k < -10 - (i % 6) + 0) continue;
      const id = `p${i}_${M(k)}`, base = { id, propertyId: 'u' + i, contractId: 'c' + i, type: 'rent', month: M(k), amount: rent(i), dueDate: M(k) + '-05' };
      if (k === 0) {
        if (i === 5) { payments.push({ ...base, status: 'pending', dueDate: D(-9) }); continue; }       // non ha pagato
        if (i === 12) { payments.push({ ...base, status: 'pending', dueDate: D(-3) }); continue; }      // non ha pagato
        if (i === 8) { payments.push({ ...base, status: 'pending', dueDate: D(5) }); continue; }        // deve ancora pagare
        if (i === 16) { payments.push({ ...base, status: 'pending', dueDate: D(-1), tenantReported: true }); continue; } // dice di aver pagato
        payments.push({ ...base, dueDate: D(-2), status: 'paid', paidDate: D(-3 - (i % 3)) });
        continue;
      }
      if (i === 5 && k === -1) { payments.push({ ...base, status: 'pending' }); continue; }            // due rate arretrate
      const late = (i === 12 && k > -4) ? 6 : (i % 7 === 0 ? 2 : 0);
      payments.push({ ...base, status: 'paid', paidDate: dayAdd(M(k) + '-05', late - 2) });
    }
  }
  // L'interno 6 è libero da un mese e mezzo: c'era qualcuno.
  contracts.push({ id: 'c6old', propertyId: 'u6', status: 'terminated', tenantName: 'Uscito Demo', rent: rent(6), startDate: M(-20) + '-01', endDate: D(-45) });
  const preAgreements = [
    { id: 'pa14', ref: 'BOOM-DEMO14', status: 'viewed', propertyId: 'u14', tenant: { fullName: 'Candidata Demo' }, lease: { startDate: M(1) + '-01', endDate: M(13) + '-28' }, money: { rent: rent(14) } }
  ];
  const listings = [{ id: 'lst6', propertyId: 'u6', status: 'available', name: 'Bilocale Esempio' }];
  const maintenance = [
    { id: 'mt13', propertyId: 'u13', title: 'Caldaia in blocco (E01)', category: 'heating', priority: 'urgent', status: 'open', createdAt: D(-1), reporter: { role: 'tenant', name: NOMI[12] } },
    { id: 'mt7', propertyId: 'u7', title: 'Infiltrazione sul soffitto del bagno', category: 'leaks', priority: 'medium', status: 'in_progress', createdAt: D(-8), reporter: { role: 'owner' } },
    { id: 'mt2', propertyId: 'u2', title: 'Tapparella bloccata', category: 'other', priority: 'low', status: 'resolved', createdAt: D(-30), resolvedAt: D(-26) }
  ];
  const users = [owner, { id: 'demo-admin', role: 'admin', name: 'Operatore demo' }];
  return { today, month, state: { profile: { id: 'demo-admin', role: 'admin', name: 'Operatore demo' }, users, properties, contracts, payments, preAgreements, listings, maintenance } };
}
