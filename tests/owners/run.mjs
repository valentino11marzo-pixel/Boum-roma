// tests/owners/run.mjs — la dashboard del proprietario: ognuno vede SOLO il
// suo, e i numeri sono quelli del rendiconto — dal vivo.
//
// Le promesse che contano:
// 1. PERIMETRO: un landlord vede i SUOI immobili e basta. Chiedere la
//    dashboard di un altro è un 403, mai una risposta parziale o degradata.
//    L'admin può aprire quella di chiunque (è lo strumento del pitch), e
//    senza target riceve l'ELENCO, mai i dati di tutti in un colpo.
// 2. ARITMETICA: incassato = SOLO le rate pagate di quest'anno; arretrato =
//    solo le scadute non pagate; la prossima rata è la più vicina nel
//    futuro. Le rate di un altro immobile non inquinano mai i totali.
// 3. Le lezioni di produzione restano pagate: cedolareSecca arriva come
//    'si' (stringa) dai contratti veri — il booleano va derivato, non
//    confrontato con true (il bug trovato dai test notify).
//
// Run: node tests/owners/run.mjs

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); }
};

// ── Date relative a OGGI: la suite non deve marcire col calendario ──
const D = (days) => new Date(Date.now() + days * 86400e3).toISOString().slice(0, 10);
const THIS_YEAR = new Date().toISOString().slice(0, 4);
const LAST_YEAR = String(Number(THIS_YEAR) - 1);

// ── Il mondo finto ──────────────────────────────────────────────────────────
const USERS = {
  own1: { role: 'landlord', name: 'Franca Egidi', email: 'franca@example.it' },
  own2: { role: 'landlord', name: 'Altro Proprietario', email: 'altro@example.it' },
  adm: { role: 'admin', name: 'Valentino' },
  ten: { role: 'tenant', name: 'Un Inquilino' },
};
const TOKENS = { 'tk-own1': 'own1', 'tk-own2': 'own2', 'tk-adm': 'adm', 'tk-ten': 'ten' };

const DATA = {
  properties: [
    { id: 'p1', ownerId: 'own1', name: 'Bilocale Pigneto', address: 'Via del Pigneto 12', zone: 'Pigneto', status: 'rented', dossier: { visura: { url: 'x' }, planimetria: { url: 'x' } } },
    { id: 'p2', ownerId: 'own2', name: 'Trilocale Prati', address: 'Via Cola di Rienzo 1', zone: 'Prati', status: 'rented' },
    { id: 'p3', ownerId: 'own1', name: 'Studio Monti', address: 'Via dei Serpenti 8', zone: 'Monti', status: 'available' },
  ],
  contracts: [
    { id: 'c1', propertyId: 'p1', status: 'active', tenantName: 'John Smith', rent: 900, startDate: `${LAST_YEAR}-10-01`, endDate: `${THIS_YEAR}-09-30`, cedolareSecca: 'si', installmentMonths: 1, signedPdfUrl: 'https://storage/x.pdf' },
    { id: 'c2', propertyId: 'p2', status: 'active', tenantName: 'Maria Rossi', rent: 1400, startDate: `${LAST_YEAR}-01-01`, endDate: `${THIS_YEAR}-12-31` },
  ],
  payments: [
    // p1 — quest'anno: 2 pagate, 1 scaduta, 1 futura. Una pagata l'ANNO SCORSO (fuori dall'YTD).
    { id: 'y1', contractId: 'c1', propertyId: 'p1', status: 'paid', amount: 900, month: `${THIS_YEAR}-01`, paidDate: `${THIS_YEAR}-01-03`, paidVia: 'bank' },
    { id: 'y2', contractId: 'c1', propertyId: 'p1', status: 'paid', amount: 900, month: `${THIS_YEAR}-02`, paidDate: `${THIS_YEAR}-02-05`, paidVia: 'stripe' },
    { id: 'old', contractId: 'c1', propertyId: 'p1', status: 'paid', amount: 900, month: `${LAST_YEAR}-12`, paidDate: `${LAST_YEAR}-12-28` },
    { id: 'late1', contractId: 'c1', propertyId: 'p1', status: 'pending', amount: 900, month: `${THIS_YEAR}-03`, dueDate: D(-12) },
    { id: 'next1', contractId: 'c1', propertyId: 'p1', status: 'pending', amount: 900, month: `${THIS_YEAR}-04`, dueDate: D(9) },
    // p2 (dell'ALTRO proprietario): non deve mai apparire nei numeri di own1
    { id: 'z1', contractId: 'c2', propertyId: 'p2', status: 'paid', amount: 1400, month: `${THIS_YEAR}-01`, paidDate: `${THIS_YEAR}-01-02` },
    { id: 'z2', contractId: 'c2', propertyId: 'p2', status: 'pending', amount: 1400, month: `${THIS_YEAR}-03`, dueDate: D(-3) },
    // rata cancellata: non è né arretrato né prossima
    { id: 'k1', contractId: 'c1', propertyId: 'p1', status: 'cancelled', amount: 900, month: `${THIS_YEAR}-05`, dueDate: D(20) },
  ],
  maintenance: [
    { id: 'm1', propertyId: 'p1', status: 'open', title: 'Caldaia rumorosa', createdAt: `${THIS_YEAR}-03-01` },
    { id: 'm2', propertyId: 'p1', status: 'resolved', title: 'Tapparella', createdAt: `${THIS_YEAR}-01-10` },
    { id: 'm3', propertyId: 'p2', status: 'open', title: 'Infiltrazione', createdAt: `${THIS_YEAR}-02-01` },
  ],
};

const toFs = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, x] of Object.entries(v)) fields[k] = toFs(x);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
};

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const body = opts.body ? JSON.parse(opts.body) : {};
  if (u.includes('accounts:lookup')) {
    const uid = TOKENS[body.idToken];
    return { ok: true, status: 200, json: async () => (uid ? { users: [{ localId: uid, email: (USERS[uid] || {}).email }] } : {}) };
  }
  if (u.includes('signInWithPassword')) {
    return { ok: true, status: 200, json: async () => ({ idToken: 'admin-token' }) };
  }
  if (u.includes('firestore.googleapis.com')) {
    if (u.includes(':runQuery')) {
      const coll = body.structuredQuery.from[0].collectionId;
      const rows = (DATA[coll] || []).map(({ id, ...rest }) => ({
        document: {
          name: `projects/p/databases/(default)/documents/${coll}/${id}`,
          fields: toFs(rest).mapValue.fields,
        },
      }));
      return { ok: true, status: 200, json: async () => rows };
    }
    const m = u.match(/documents\/(.+)$/);
    const path = m ? decodeURIComponent(m[1]) : '';
    const [coll, id] = path.split('/');
    if (coll === 'users' && USERS[id]) {
      return { ok: true, status: 200, json: async () => ({ name: 'projects/p/databases/(default)/documents/' + path, fields: toFs(USERS[id]).mapValue.fields }) };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
};

process.env.FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'test-key';
const mod = await import('../../api/owners/summary.js');
const handler = mod.default;
const { buildOwnerView } = mod;

function call(token, query) {
  let code = 0, payload = null;
  const res = {
    setHeader() {}, status(c) { code = c; return this; },
    json(j) { payload = j; return this; }, end() { return this; },
  };
  const req = {
    method: 'GET',
    headers: token ? { authorization: 'Bearer ' + token } : {},
    query: query || {},
  };
  return handler(req, res).then(() => ({ code, payload }));
}

console.log('\n\x1b[1m▸ la porta: chi entra e con che ruolo\x1b[0m');
{
  const r = await call(null);
  ok('senza token: 401', r.code === 401, r.code);
}
{
  const r = await call('tk-ten');
  ok('un inquilino non ha una dashboard proprietario: 403', r.code === 403 && r.payload.error === 'forbidden');
}
{
  const r = await call('tk-own1', { ownerId: 'own2' });
  ok('chiedere la dashboard di un ALTRO: 403 esplicito, mai una vista parziale', r.code === 403 && r.payload.error === 'not_your_dashboard');
}

console.log('\n\x1b[1m▸ il perimetro e l\'aritmetica del proprietario\x1b[0m');
{
  const r = await call('tk-own1');
  ok('200 con la vista', r.code === 200 && r.payload.ok, r.payload);
  ok('vede i SUOI immobili (2), mai quelli altrui', r.payload.properties.length === 2 && r.payload.properties.every(p => ['p1', 'p3'].includes(p.id)));
  const p1 = r.payload.properties.find(p => p.id === 'p1');
  ok('incassato anno = SOLO le rate pagate di quest\'anno (900+900)', r.payload.totals.paidYtd === 1800, r.payload.totals);
  ok('la rata pagata l\'anno scorso NON conta nell\'YTD', !JSON.stringify(p1.money.recentPaid).includes(`${LAST_YEAR}-12-28`) || r.payload.totals.paidYtd === 1800);
  ok('arretrati = solo la scaduta non pagata (900), mai quelle di p2', r.payload.totals.arrears === 900 && r.payload.totals.lateCount === 1);
  ok('la prossima rata è la più vicina nel futuro', p1.money.next && p1.money.next.dueDate === D(9) && p1.money.next.amount === 900, p1.money.next);
  ok('una rata cancellata non è né arretrato né prossima', !JSON.stringify(p1.money).includes(`${THIS_YEAR}-05`));
  ok('lo storico recente porta data e via d\'incasso', p1.money.recentPaid.some(x => x.paidVia === 'bank') && p1.money.recentPaid.some(x => x.paidVia === 'stripe'));
  ok('contratto: inquilino, canone, scadenza', p1.contract.tenantName === 'John Smith' && p1.contract.rent === 900 && p1.contract.endDate === `${THIS_YEAR}-09-30`);
  ok("cedolareSecca 'si' (stringa dei contratti veri) → true", p1.contract.cedolareSecca === true);
  ok('il PDF firmato viaggia (è il SUO contratto)', p1.contract.signedPdfUrl === 'https://storage/x.pdf');
  ok('manutenzioni: solo le APERTE del suo immobile', p1.maintenance.length === 1 && p1.maintenance[0].title === 'Caldaia rumorosa');
  ok('fascicolo ARPE: luci accese solo sugli slot pieni', p1.dossier.visura === true && p1.dossier.planimetria === true && p1.dossier.ape === false && p1.dossier.delega === false);
  const p3 = r.payload.properties.find(p => p.id === 'p3');
  ok('immobile senza contratto: la vista lo dice invece di rompersi', p3.contract === null && p3.money.paidYtd === 0);
  ok('l\'identità del proprietario arriva dal profilo', r.payload.owner.name === 'Franca Egidi');
  ok('un solo contratto attivo nei totali', r.payload.totals.activeContracts === 1);
}
{
  const r = await call('tk-own1', { ownerId: 'own1' });
  ok('chiedere ESPLICITAMENTE sé stessi è lecito', r.code === 200 && r.payload.properties.length === 2);
}
{
  const r = await call('tk-own2');
  ok('l\'altro proprietario vede l\'altro perimetro (1 immobile, 1400 YTD)', r.code === 200 && r.payload.properties.length === 1 && r.payload.totals.paidYtd === 1400);
}

console.log('\n\x1b[1m▸ l\'admin: il picker e la vista-cliente (lo strumento del pitch)\x1b[0m');
{
  const r = await call('tk-adm');
  ok('admin senza target: l\'ELENCO dei proprietari, mai i dati di tutti', r.code === 200 && Array.isArray(r.payload.owners) && !r.payload.properties);
  ok('l\'elenco conta gli immobili e mette il nome', r.payload.owners.some(o => o.id === 'own1' && o.properties === 2 && o.name === 'Franca Egidi'), r.payload.owners);
  ok('ordinato per immobili (own1 prima di own2)', r.payload.owners[0].id === 'own1');
}
{
  const r = await call('tk-adm', { ownerId: 'own1' });
  ok('admin con target: la STESSA vista del cliente', r.code === 200 && r.payload.totals.paidYtd === 1800 && r.payload.properties.length === 2);
  ok('...marcata come anteprima (il banner in pagina)', r.payload.viewer.preview === true);
}

console.log('\n\x1b[1m▸ l\'aggregazione pura non perde pezzi (buildOwnerView)\x1b[0m');
{
  const v = buildOwnerView('own1', DATA);
  ok('stessi totali della via HTTP', v.totals.paidYtd === 1800 && v.totals.arrears === 900);
  const empty = buildOwnerView('nessuno', DATA);
  ok('un proprietario senza immobili: vista vuota, zero rumore', empty.properties.length === 0 && empty.totals.paidYtd === 0);
  const crossCheck = buildOwnerView('own2', DATA);
  ok('i numeri di own1 non trapelano mai in own2', crossCheck.totals.paidYtd === 1400 && crossCheck.totals.arrears === 1400, crossCheck.totals);
}

console.log('\n\x1b[1m▸ la pagina è una SPA vera (mai più la statica)\x1b[0m');
{
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../../owner-dashboard.html', import.meta.url), 'utf8');
  ok('carica Firebase + BoomPortal (la statica non li aveva)', page.includes('firebase-app-compat.js') && page.includes('/js/boom-portal.js'));
  ok('passa dal guard condiviso coi ruoli giusti', /requireAuth\(\['owner',\s*'landlord',\s*'admin'\]/.test(page));
  ok('legge il SUO endpoint', page.includes('/api/owners/summary'));
  ok('la fetch ha un guinzaglio (mai una pagina appesa — regola Safari)', page.includes('AbortController') && page.includes('15000'));
  ok('il fallimento è azionabile (Riprova), non un limbo', page.includes('renderFail') && page.includes('Riprova'));
  ok('l\'anteprima admin è dichiarata a schermo', page.includes('Vista amministratore'));
  ok('l\'empty state vende la valutazione, non il vuoto', page.includes('/valuta'));
  ok('noindex: è una pagina privata', page.includes('noindex'));
  const vercel = readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8');
  const grpPrivate = vercel.indexOf('|owner-dashboard|owner-dashboard.html|');
  ok('vercel.json la tratta da superficie autenticata (private, no-store)', grpPrivate > -1);
}

console.log(`\n${fail === 0 ? '\x1b[32m\x1b[1m' : '\x1b[31m\x1b[1m'}Owner dashboard: ${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
