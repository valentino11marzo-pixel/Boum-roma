// tests/owner/fixtures.mjs — i casi dell'Archivio del Proprietario.
//
// Consumato in SOLA LETTURA dai pacchetti A (motore), B (API), C (invito),
// D (pagina). Ogni scenario è un `input` di BOOM_OWNER.build fresco (clone
// profondo a ogni chiamata: un test che lo muta non sporca gli altri).
//
//   import { scenarios, POISON, projection, input, deps, NOW, BUCKET, su } from './fixtures.mjs';
//
//   scenarios            nomi → descrizione (ok, osservo, nonso, tu, vuoto, renewal, rooms, paper)
//   input(name)          l'input grezzo dello scenario (records come in Firestore)
//   projection(name, o)  BOOM_OWNER.build(input(name), deps) col motore VERO e le deps VERE
//                        o = { viewAs?: bool, now?, mutate?: (input) => void, deps? }
//   seedFor(name)        { 'collection/id': data } — lo stesso scenario come seme per
//                        createHarness({ seed }) (tests/owner/_harness.mjs)
//   POISON               stringhe che NON devono mai uscire (proiezione, JSON, HTML)
//   deps                 { rent, fields, dossier, schedaUrl } reali
//   NOW / TODAY          22/09/2026 10:42 a Roma
//   BUCKET, su(path)     il bucket e un URL Storage tokenizzato (come storageUpload)
//   OWNER_UID            'own_1'  ·  OTHER_UID 'own_2'  ·  ADMIN_UID 'admin_1'
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export const OWNER = require('../../js/owner-archive-engine.js');
export const RENT = require('../../js/rent-engine.js');
export const FIELDS = require('../../js/contract-fields.js');
export const DOSSIER = require('../../js/property-dossier-engine.js');

export const NOW = new Date('2026-09-22T08:42:00Z');   // 10:42 a Roma
export const TODAY = '2026-09-22';
export const BUCKET = 'boom-property-dashboards.firebasestorage.app';
export const OWNER_UID = 'own_1';
export const OTHER_UID = 'own_2';
export const ADMIN_UID = 'admin_1';
export const SCHEDA_BASE = 'https://www.boomrome.com/scheda?t=';
export const deps = {
  rent: RENT, fields: FIELDS, dossier: DOSSIER,
  schedaUrl: (cid) => SCHEDA_BASE + cid + '.l.schedatok',
};

// Un URL Storage come quello che scrive storageUpload (tokenizzato).
export const su = (path, tok = 'DLTOK', bucket = BUCKET) =>
  `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(path)}?alt=media&token=${tok}`;

// ── Il veleno: se una di queste stringhe esce, è una fuga ─────────────────
export const POISON = [
  'mario.rossi@example.com',          // email del conduttore sul contratto
  '+393331234567', '3331234567',      // telefono del conduttore
  'RSSMRA80A01H501U',                 // codice fiscale del conduttore
  'TENANT-SIGN-TOKEN',                // token di firma del conduttore
  'token=IDTOK',                      // URL di un documento d'identità
  'IDTOK',
  'marginEur', '7.77',                // margine BOOM su una rata
  'pay.stripe.com',                   // ricevuta Stripe
  'PROOFPATH',                        // prova di bonifico del conduttore
  'tenant.user@example.com',          // record users del conduttore
  'IT60X0542811101000000123456',      // IBAN del locatore
  'firebasestorage.googleapis.com',   // nessun URL Storage nella proiezione
  'DLTOK',                            // nessun token di download
  'identita-conduttore',              // percorso del documento d'identità
];

const clone = (o) => JSON.parse(JSON.stringify(o));

// Il contratto firmato «normale» di un proprietario in ordine.
function signedContract(over = {}) {
  const id = over.id || 'c1';
  return {
    id, propertyId: 'p1', status: 'active', type: 'transitorio', unit: '',
    tenantId: 't1', tenantName: 'Mario Rossi',
    tenantEmail: 'mario.rossi@example.com', tenantPhone: '+393331234567', tenantCF: 'RSSMRA80A01H501U',
    tenantSignToken: 'TENANT-SIGN-TOKEN', landlordSignToken: 'LL-SIGN-TOKEN-OK',
    landlordIban: 'IT60X0542811101000000123456',
    tenantSignature: 'data:image/png;base64,AAAA', landlordSignature: 'data:image/png;base64,BBBB',
    tenantSignedAt: '2026-01-10T09:00:00Z', landlordSignedAt: '2026-01-11T09:00:00Z',
    tenantSignedIP: '10.0.0.1',
    signatureStatus: 'complete', fullySignedAt: '2026-01-11T09:00:00Z', finalizedAt: '2026-01-11T09:05:00Z',
    startDate: '2026-02-01', endDate: '2027-01-31', rent: 1250, deposit: 2500, installmentMonths: 1,
    cedolareSecca: 'si', createdAt: '2026-01-05T10:00:00Z', preAgreementId: 'pa1', pdfGeneratedBy: 'server',
    generatedPDF: su(`contracts/${id}/contract.pdf`),
    pdfGeneratedAt: '2026-01-05T10:00:00Z',
    signedPdfUrl: su(`contracts/${id}/contratto-firmato.pdf`),
    signingCertificateUrl: su(`contracts/${id}/signing-certificate.pdf`),
    timestampTsrUrl: su(`contracts/${id}/timestamp.tsr`),
    schedaCanoneUrl: su(`contracts/${id}/scheda-canone-arpe.pdf`), schedaCanoneAt: '2026-01-11T09:06:00Z',
    fascicoloFiscaleUrl: su(`contracts/${id}/fascicolo-fiscale.pdf`),
    registrationPackUrl: su(`contracts/${id}/pack-registrazione.zip`),
    identityDocs: [{ url: su(`contracts/${id}/identity/identita-conduttore.jpg`, 'IDTOK'), name: 'passaporto', role: 'tenant' }],
    tenantMandate: { given: true, docUrl: su(`contracts/${id}/mandato-conduttore.pdf`), ip: '10.0.0.1' },
    rliRegisteredAt: '2026-02-10',
    verbaleConsegna: { at: '2026-02-01T10:00:00Z', url: su(`contracts/${id}/verbale-consegna_1.pdf`), by: 'valentino@boom-rome.com', keysCount: 3 },
    inventario: { at: '2026-02-01T11:00:00Z', url: su(`contracts/${id}/inventario-consegna_1.pdf`), by: 'valentino@boom-rome.com', shots: [su('property-docs/p1/inventario/2026-02-01_consegna_1.jpg')] },
    ...over,
  };
}
function paidMonths(cid, from, to, over = {}) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ id: `pay_${cid}_${ym}`, contractId: cid, propertyId: 'p1', tenantId: 't1', month: ym, dueDate: `${ym}-05`,
      amount: 1250, status: 'paid', paidDate: `${ym}-04`, paidVia: 'stripe', receiptUrl: 'https://pay.stripe.com/receipts/x',
      marginEur: 7.77, stripeCostEur: 3, serviceFeeEur: 10.77, cardBrand: 'visa', ...over });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
function baseProperty(over = {}) {
  return {
    id: 'p1', ownerId: OWNER_UID, name: 'Via Cavour 12', address: 'Via Cavour 12, Roma', status: 'rented',
    foglio: '481', particella: '120', sub: '7', categoria: 'A/2',
    dossier: { ape: { url: su('property-docs/p1/ape_1_ape.pdf'), name: 'ape.pdf', at: '2026-01-02T10:00:00Z', by: 'valentino@boom-rome.com' },
      visura: { url: su('property-docs/p1/visura_1_visura.pdf'), name: 'visura.pdf', at: '2026-01-02T10:00:00Z', by: OWNER_UID } },
    valutazioneBoomUrl: su('property-docs/p1/valutazione-boom.pdf'), valutazioneBoomAt: '2025-12-20T10:00:00Z', valutazioneBoomCanone: 1300,
    ...over,
  };
}
const landlordProfile = {
  name: 'Marco Bianchi', role: 'landlord', email: 'marco@example.com',
  cf: 'BNCMRC70A01H501Z', dob: '1970-01-01', pob: 'Roma', address: 'Via Po 1, Roma',
  docType: 'id', docNum: 'CA00000AA', nationality: 'italiana',
};
// Il record users VERO del conduttore: il motore non deve mai usarlo.
const tenantUser = { id: 't1', role: 'tenant', email: 'tenant.user@example.com', phone: '+393331234567' };

function base(extra = {}) {
  return {
    ownerUid: OWNER_UID, aliases: [], viewer: { uid: OWNER_UID, role: 'landlord' }, owner: { name: 'Marco Bianchi' },
    landlordProfile, users: [tenantUser],
    properties: [], contracts: [], payments: [], maintenance: [], documents: [], deadlines: [], rendiconti: [], invoices: [],
    rendicontiFiles: {}, partial: [], buckets: [BUCKET], uploadBucket: BUCKET, now: NOW,
    ...extra,
  };
}

const SCEN = {
  // Tutto in ordine: firmato, registrato, rate pagate, fascicolo completo.
  ok: () => base({
    properties: [baseProperty()],
    contracts: [signedContract()],
    payments: [
      ...paidMonths('c1', '2026-02', '2026-09'),
      { id: 'depbal_c1', contractId: 'c1', propertyId: 'p1', tenantId: 't1', type: 'deposit-balance', amount: 1250, dueDate: '2026-02-01', status: 'paid', paidDate: '2026-02-01', paidVia: 'bank', proofUrl: su('payment-proofs/t1/PROOFPATH.jpg') },
    ],
    maintenance: [{ id: 'm1', propertyId: 'p1', category: 'plumbing', title: 'Perdita lavello', status: 'resolved', priority: 'medium',
      createdAt: '2026-09-01T09:00:00Z', resolvedAt: '2026-09-03T09:00:00Z', cost: 180, photoUrl: su('maintenance/t1/foto.jpg'), description: 'Chiamare Mario al 3331234567' }],
    documents: [
      { id: 'd_f24', propertyId: 'p1', category: 'F24 IMU', type: 'other', fileUrl: su('smistatore/2026/f24.pdf'), docDate: '2026-06-16', source: 'smistatore', shared: false },
      { id: 'd_rli', propertyId: 'p1', contractId: 'c1', category: 'registrazione RLI', type: 'other', fileUrl: su('smistatore/2026/rli.pdf'), docDate: '2026-02-10', source: 'smistatore' },
      { id: 'd_id', propertyId: 'p1', contractId: 'c1', category: 'documento identità carta ID', type: 'id', fileUrl: su('smistatore/2026/identita-conduttore.jpg', 'IDTOK') },
      { id: 'd_rcpt', propertyId: 'p1', category: 'ricevuta canone incasso', type: 'receipt', userId: 't1', fileUrl: su('documents/t1/archive/receipt.pdf') },
      { id: 'd_mine', propertyId: 'p1', userId: OWNER_UID, category: 'documento generico', type: 'other', name: 'Mio appunto', fileUrl: su(`documents/${OWNER_UID}/nota.pdf`) },
      { id: 'd_mine_ok', propertyId: 'p1', userId: OWNER_UID, category: 'visura catastale', type: 'other', name: 'Visura aggiornata', fileUrl: su(`documents/${OWNER_UID}/visura2.pdf`) },
    ],
    rendiconti: [{ id: `${OWNER_UID}_2026-08`, ownerId: OWNER_UID, month: '2026-08', at: '2026-09-01T06:10:00Z' },
      { id: `${OWNER_UID}_2026-07`, ownerId: OWNER_UID, month: '2026-07', at: '2026-08-01T06:10:00Z' },
      { id: `${OWNER_UID}_2026-06`, ownerId: OWNER_UID, month: '2026-06', at: '2026-07-01T06:10:00Z' }],
    rendicontiFiles: { [`${OWNER_UID}_2026-08`]: true, [`${OWNER_UID}_2026-07`]: false, [`${OWNER_UID}_2026-06`]: null },
    invoices: [{ id: 'aspi_registrazione_c1', recipientId: OWNER_UID, number: 'BOOM-2026-014', service: 'Registrazione contratto', amount: 89, date: '2026-02-09', status: 'pending', contractId: 'c1', source: 'aspi' }],
  }),

  // Una rata in ritardo, con due solleciti.
  osservo: () => base({
    properties: [baseProperty()],
    contracts: [signedContract()],
    payments: [
      ...paidMonths('c1', '2026-02', '2026-08'),
      { id: 'pay_c1_2026-09', contractId: 'c1', propertyId: 'p1', tenantId: 't1', month: '2026-09', dueDate: '2026-09-05', amount: 1250,
        status: 'pending', remindersSent: 2, lastReminderDate: '2026-09-15' },
    ],
  }),

  // Una rata senza stato leggibile e una senza importo: non posso dirlo.
  nonso: () => base({
    properties: [baseProperty()],
    contracts: [signedContract()],
    payments: [
      ...paidMonths('c1', '2026-02', '2026-08'),
      { id: 'pay_c1_2026-09', contractId: 'c1', propertyId: 'p1', tenantId: 't1', month: '2026-09', dueDate: '2026-09-05', amount: null, status: 'strano' },
    ],
  }),

  // Serve il proprietario: firma, dati mancanti, una scadenza.
  tu: () => base({
    landlordProfile: { name: 'Marco Bianchi', role: 'landlord' },
    properties: [baseProperty({ dossier: {} , foglio: '', particella: '', sub: '', categoria: '' })],
    contracts: [signedContract({
      signatureStatus: 'partial', landlordSignature: null, landlordSignedAt: null, fullySignedAt: null, finalizedAt: null,
      signedPdfUrl: null, signingCertificateUrl: null, timestampTsrUrl: null, schedaCanoneUrl: null, rliRegisteredAt: null,
      verbaleConsegna: null, inventario: null, startDate: '2026-10-01', endDate: '2027-09-30',
      landlordSignToken: 'LL-SIGN-TOKEN-123', signInviteLandlordAt: '2026-09-20T10:00:00Z', signingOrder: 'sequential',
    })],
    payments: [],
    deadlines: [
      { id: 'dlfin_c1_0', owner: 'landlord', status: 'pending', date: '2026-10-02', title: 'Imposta di registro 2% del canone annuo (min €67) – F24 ELIDE', legalRef: 'DPR 131/1986', linkedContractId: 'c1', linkedPropertyId: 'p1' },
      { id: 'dlfin_c1_1', owner: 'landlord', status: 'pending', date: '2026-09-01', title: 'Imposta di bollo €16 (per copia)', legalRef: 'DPR 642/1972', linkedContractId: 'c1', linkedPropertyId: 'p1' },
      { id: 'dlfin_c1_2', owner: 'tenant', status: 'pending', date: '2026-10-01', title: 'Voltura utenze', linkedContractId: 'c1', linkedPropertyId: 'p1' },
      { id: 'dlfin_c1_3', owner: 'landlord', status: 'done', date: '2026-10-01', title: 'Fatto', linkedContractId: 'c1', linkedPropertyId: 'p1' },
    ],
  }),

  vuoto: () => base({ properties: [] }),

  // Rinnovo: il contratto nuovo eredita per clonazione verbale, registrazione
  // e delega del vecchio. Niente di tutto questo è suo.
  renewal: () => base({
    properties: [baseProperty()],
    contracts: [
      signedContract({ id: 'c_old', status: 'renewed', renewedToId: 'c_new', startDate: '2025-02-01', endDate: '2026-01-31',
        registrationStatus: 'registered', registeredAt: '2025-02-20T10:00:00Z', rliRegisteredAt: null,
        renewalHistory: [{ date: '2026-01-15', newContractId: 'c_new' }],
        fullySignedAt: '2025-01-11T09:00:00Z', createdAt: '2025-01-05T10:00:00Z', landlordDelegate: { name: 'Valentino', at: '2025-01-06T10:00:00Z' } }),
      signedContract({ id: 'c_new', renewalOf: 'c_old', createdAt: '2026-01-15T10:00:00Z', startDate: '2026-02-01', endDate: '2027-01-31',
        signatureStatus: 'partial', landlordSignature: null, landlordSignedAt: null, fullySignedAt: null, finalizedAt: null,
        signedPdfUrl: null, signingCertificateUrl: null, schedaCanoneUrl: null, rliRegisteredAt: null,
        timestampTsrUrl: su('contracts/c_old/timestamp.tsr'),
        registrationStatus: 'registered', registrationCode: 'OLD', registeredAt: '2025-02-20T10:00:00Z',
        verbaleConsegna: { at: '2025-02-01T10:00:00Z', url: su('contracts/c_old/verbale-consegna_1.pdf'), by: 'valentino@boom-rome.com' },
        inventario: { at: '2025-02-01T11:00:00Z', url: su('contracts/c_old/inventario-consegna_1.pdf'), by: 'valentino@boom-rome.com' },
        landlordDelegate: { name: 'Valentino', at: '2025-01-06T10:00:00Z' },
        landlordSignToken: 'LL-SIGN-TOKEN-NEW', signInviteLandlordAt: '2026-01-20T10:00:00Z', signingOrder: 'any',
        generatedPDF: su('contracts/c_new/contract.pdf') }),
    ],
    payments: paidMonths('c_new', '2026-02', '2026-09'),
  }),

  // Due stanze, due contratti attivi su interni distinti: normale.
  rooms: () => base({
    properties: [baseProperty()],
    contracts: [
      signedContract({ id: 'cA', unit: 'A', tenantId: 'tA', tenantName: 'Anna Verdi', rent: 600 }),
      signedContract({ id: 'cB', unit: 'B', tenantId: 'tB', tenantName: 'Bruno Neri', rent: 650 }),
    ],
    payments: [
      ...paidMonths('cA', '2026-02', '2026-09', { tenantId: 'tA', amount: 600 }),
      ...paidMonths('cB', '2026-02', '2026-09', { tenantId: 'tB', amount: 650 }),
    ],
  }),

  // Un contratto la cui firma NON è registrata: nessuna firma, nessun invito,
  // nessuna proposta, nessun PDF del server — ma i token di firma coniati,
  // come li conia sempre saveContract del portal (anche per un contratto
  // firmato su carta e inserito a mano). Chiusura del 23/09: i token non
  // provano un giro digitale, quindi lo stato è neutro («firma non
  // registrata a sistema») e il verdetto «non posso dirlo».
  paper: () => {
    const c = signedContract({ id: 'cp' });
    ['tenantSignature', 'landlordSignature', 'tenantSignedAt', 'landlordSignedAt', 'fullySignedAt', 'finalizedAt', 'preAgreementId',
      'pdfGeneratedBy', 'signedPdfUrl', 'signingCertificateUrl', 'timestampTsrUrl', 'schedaCanoneUrl', 'rliRegisteredAt', 'verbaleConsegna', 'inventario'].forEach((k) => delete c[k]);
    c.signatureStatus = 'none'; c.cedolareSecca = null; delete c.cedolareSecca; c.type = 'ordinaria'; c.startDate = '2025-06-01'; c.endDate = '2029-05-31';
    return base({ properties: [baseProperty()], contracts: [c], payments: paidMonths('cp', '2026-01', '2026-09') });
  },
};

export const scenarios = {
  ok: 'firmato, registrato, rate pagate: «Tutto in ordine»',
  osservo: 'la rata di settembre è in ritardo, due solleciti',
  nonso: 'una rata senza stato e senza importo',
  tu: 'serve la sua firma, mancano suoi dati, una scadenza',
  vuoto: 'nessun immobile collegato',
  renewal: 'rinnovo che eredita verbale, registrazione e delega del vecchio',
  rooms: 'due contratti attivi su interni distinti',
  paper: 'firma non registrata a sistema (token coniati, nessuna prova del giro digitale)',
};

export function input(name) {
  if (!SCEN[name]) throw new Error('scenario sconosciuto: ' + name);
  return clone(SCEN[name]());
}
function reviveNow(inp) { inp.now = new Date(inp.now); return inp; }

export function projection(name, opts = {}) {
  const inp = reviveNow(input(name));
  if (opts.viewAs) inp.viewer = { uid: ADMIN_UID, role: 'admin' };
  if (opts.now) inp.now = opts.now;
  if (typeof opts.mutate === 'function') opts.mutate(inp);
  const engine = opts.engine || OWNER;
  return engine.build(inp, opts.deps || deps);
}

// Lo stesso scenario come seme Firestore per createHarness({ seed }).
export function seedFor(name) {
  const inp = input(name), seed = {};
  const put = (col, list) => (list || []).forEach((d) => { const { id, ...rest } = d; seed[`${col}/${id}`] = rest; });
  put('properties', inp.properties); put('contracts', inp.contracts); put('payments', inp.payments);
  put('maintenance', inp.maintenance); put('documents', inp.documents); put('deadlines', inp.deadlines);
  put('rendiconti', inp.rendiconti); put('invoices', inp.invoices);
  seed[`users/${OWNER_UID}`] = { ...inp.landlordProfile, role: 'landlord', name: 'Marco Bianchi', email: 'marco@example.com', ownerAliases: inp.aliases };
  seed[`users/${OTHER_UID}`] = { role: 'landlord', name: 'Altro Proprietario', email: 'altro@example.com' };
  seed[`users/${ADMIN_UID}`] = { role: 'admin', name: 'Valentino', email: 'valentino@boom-rome.com' };
  seed['users/t1'] = { role: 'tenant', email: 'tenant.user@example.com', phone: '+393331234567' };
  seed['properties/p_other'] = { ownerId: OTHER_UID, name: 'Via Giulia 3', address: 'Via Giulia 3, Roma', status: 'vacant' };
  return seed;
}
