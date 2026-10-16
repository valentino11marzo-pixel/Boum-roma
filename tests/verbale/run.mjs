// tests/verbale/run.mjs — il verbale di consegna chiavi, blindato.
// Handler REALE (api/contracts/verbale.js), pdf-lib REALE, nodemailer
// mockato via il loader della suite notify, Firestore/Storage/Identity
// su stub in-memory. LE REGOLE: un owner non genera il verbale sul
// contratto di un immobile altrui; senza firma del conduttore o del
// consegnante il PDF non nasce; il PDF vero finisce su Storage e VIAGGIA
// IN ALLEGATO a conduttori (EN), co-conduttori, proprietario (IT) e
// admin; il contratto viene marcato (senza mai persistere i dataURI
// delle firme) e il documento entra nell'archivio con categoria
// 'verbale' — quella che il taxpack riconosce già.
// Uso: node tests/verbale/run.mjs
import { register } from 'node:module';
register('../notify/loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@b.c';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.HOMIE_SECRET = 'test-secret-verbale';
process.env.GMAIL_USER = 'sistema@test.it';
process.env.GMAIL_APP_PASS = 'x';
delete process.env.ADMIN_NOTIFY_EMAIL;

let passed = 0, failed = 0;
const bad = [];
const check = (name, cond) => { cond ? passed++ : (failed++, bad.push(name)); console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const mails = () => globalThis.__mails || [];
const mailTo = (addr) => mails().filter(m => m.to === addr);

// ── Stub: Firestore in-memory + Storage con ritenzione byte + Identity ──
const store = new Map();
const storageFiles = new Map();
const okJson = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const f = {}; for (const [k, x] of Object.entries(v)) f[k] = toFs(x); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
const toFsFields = (o) => { const f = {}; for (const [k, v] of Object.entries(o || {})) f[k] = toFs(v); return f; };
function fromFs(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(fromFs);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries((v.mapValue || {}).fields || {})) o[k] = fromFs(x); return o; }
  return null;
}
const fromFsFields = (f) => { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = fromFs(v); return o; };

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.includes('identitytoolkit')) return okJson({ idToken: 'tok', users: [{ localId: 'caller1', email: 'op@boom.it' }] });
  if (url.includes('firebasestorage.googleapis.com')) {
    if (url.includes('inventario-test.pdf')) return new Response(Buffer.from('%PDF-1.4 inventario di prova'), { status: 200 });
    if (opts.method === 'POST') {
      const name = new URL(url).searchParams.get('name');
      if (name) storageFiles.set(name, Buffer.from(opts.body));
      return okJson({ downloadTokens: 'dltok' });
    }
    return okJson({ downloadTokens: 'dltok' });
  }
  if (url.includes('firestore.googleapis.com')) {
    // Ancorato a "(default)/documents": la collection si chiama proprio
    // "documents" e uno split ingenuo su '/documents' la mangerebbe.
    const path = (url.split('(default)/documents')[1] || '').replace(/^\//, '').split('?')[0];
    const qs = new URL(url).searchParams;
    if (opts.method === 'POST' && !path.startsWith(':')) {
      const docId = qs.get('documentId') || 'auto_' + (store.size + 1);
      const key = path + '/' + docId;
      store.set(key, fromFsFields(JSON.parse(opts.body).fields));
      return okJson({ name: 'projects/p/databases/(default)/documents/' + key });
    }
    if (opts.method === 'PATCH') {
      const cur = store.get(path) || {};
      Object.assign(cur, fromFsFields(JSON.parse(opts.body).fields));
      store.set(path, cur);
      return okJson({ name: 'projects/p/databases/(default)/documents/' + path });
    }
    const doc = store.get(path);
    if (!doc) return new Response('not found', { status: 404 });
    return okJson({ name: 'projects/p/databases/(default)/documents/' + path, fields: toFsFields(doc) });
  }
  throw new Error('fetch non stubbata: ' + url);
};

// ── Dati production-shaped ──────────────────────────────────────────────
const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function seed(callerRole, ownerId) {
  store.clear(); storageFiles.clear(); globalThis.__mails = [];
  store.set('users/caller1', { role: callerRole, name: 'Valentino', email: 'op@boom.it' });
  store.set('properties/p1', { ownerId, address: 'Via Squarcialupo 36, int. 8', name: 'Squarcialupo' });
  store.set('users/own1', { role: 'landlord', name: 'Stefano C', email: 'stefano@landlord.it' });
  store.set('users/t1', { role: 'tenant', name: 'Julie', email: 'julie@tenant.fr' });
  store.set('contracts/ctr1', {
    propertyId: 'p1', tenantId: 't1', type: 'transitorio',
    tenantName: 'Julie Verbrugghe', tenantEmail: 'julie@tenant.fr',
    coTenants: [{ name: 'Anouk Garot', email: 'anouk@tenant.fr', tenantIndex: 1 }],
    landlordName: 'Stefano Compierchio',
    startDate: '2026-09-01', endDate: '2027-08-31', rent: 1400,
  });
}
const mkRes = () => ({ code: 0, body: null, headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } });
const drive = async (body) => {
  const handler = (await import('../../api/contracts/verbale.js')).default;
  const res = mkRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body }, res);
  return res;
};
const FULL = () => ({
  contractId: 'ctr1',
  keys: [{ label: 'Portone', qty: 2 }, { label: 'Appartamento', qty: 2 }, { label: 'Cassetta postale', qty: 1 }],
  meters: { luce: { lettura: '48213,7', pod: 'IT001E123' }, gas: { lettura: '1240,551', pdr: '00881234567890' }, acqua: { lettura: '812,44' } },
  condition: 'buono',
  notes: 'Tende cucina da fissare → ok entro settembre ✓',   // WinAnsi-ostile di proposito
  firme: [
    { name: 'Julie Verbrugghe', kind: 'conduttore', sig: PNG1 },
    { name: 'Anouk Garot', kind: 'conduttore', sig: PNG1 },
    { name: 'Valentino', kind: 'consegnante', sig: PNG1 },
  ],
  photos: [{ label: 'Contatore luce', base64: PNG1 }],
});

// ═══ 1. Happy path (admin): PDF vero, patch, archivio, email ═══════════
{
  seed('admin', 'own1');
  const res = await drive(FULL());
  check('admin: 200 con url', res.code === 200 && res.body && res.body.ok === true && /verbale-consegna_\d+\.pdf/.test(res.body.url));

  const stored = [...storageFiles.keys()].find(k => k.startsWith('contracts/ctr1/verbale-consegna_'));
  const bytes = stored && storageFiles.get(stored);
  check('PDF su Storage sotto contracts/<id>/', !!stored);
  check('il PDF è un PDF (magic %PDF, testo WinAnsi-ostile sopravvissuto)', !!bytes && bytes.slice(0, 4).toString() === '%PDF' && bytes.length > 2000);

  const c = store.get('contracts/ctr1');
  check('contratto marcato verbaleConsegna (url+at+by)', !!(c.verbaleConsegna && c.verbaleConsegna.url && c.verbaleConsegna.at && c.verbaleConsegna.by === 'op@boom.it'));
  check('keysCount = 5', c.verbaleConsegna && c.verbaleConsegna.keysCount === 5);
  check('le firme sul contratto sono SOLO nomi (mai dataURI)', JSON.stringify(c.verbaleConsegna.firme || []).indexOf('base64') === -1);

  const docs = [...store.keys()].filter(k => k.startsWith('documents/')).map(k => store.get(k));
  const filed = docs.find(d => d.category === 'verbale');
  check('archiviato in documents con categoria verbale + aggancio contratto', !!filed && filed.contractId === 'ctr1' && filed.propertyId === 'p1' && filed.needsFiling === false);

  const jm = mailTo('julie@tenant.fr'), am = mailTo('anouk@tenant.fr'), lm = mailTo('stefano@landlord.it'), vm = mailTo('valentino@boom-rome.com');
  check('email conduttrice principale (EN, con allegato PDF identico allo Storage)', jm.length === 1 && /handover/i.test(jm[0].subject) && jm[0].attachments && jm[0].attachments[0] && Buffer.compare(jm[0].attachments[0].content, bytes) === 0);
  check('email co-conduttrice', am.length === 1);
  check('email proprietario (IT)', lm.length === 1 && /Consegna chiavi/i.test(lm[0].subject));
  check('copia admin a valentino@boom-rome.com', vm.length === 1);
}

// ═══ 2. Autorizzazione object-level ═════════════════════════════════════
{
  seed('landlord', 'ALTRO_OWNER');   // il caller NON possiede p1
  const res = await drive(FULL());
  check('landlord su immobile altrui: 403 not_your_property', res.code === 403 && res.body.error === 'not_your_property');
  check('403 = zero scritture, zero email', !store.get('contracts/ctr1').verbaleConsegna && mails().length === 0 && storageFiles.size === 0);

  seed('landlord', 'caller1');       // il caller POSSIEDE p1
  const res2 = await drive(FULL());
  check('landlord sul PROPRIO immobile: 200', res2.code === 200 && res2.body.ok === true);
}

// ═══ 3. Validazione firme ═══════════════════════════════════════════════
{
  seed('admin', 'own1');
  const noTen = FULL(); noTen.firme = noTen.firme.filter(f => f.kind === 'consegnante');
  const r1 = await drive(noTen);
  check('senza firma conduttore: 400', r1.code === 400 && r1.body.error === 'tenant_signature_required');

  const noOp = FULL(); noOp.firme = noOp.firme.filter(f => f.kind !== 'consegnante');
  const r2 = await drive(noOp);
  check('senza firma consegnante: 400', r2.code === 400 && r2.body.error === 'operator_signature_required');

  const badSig = FULL(); badSig.firme[0].sig = 'data:image/png;base64,'; // vuota
  const r3 = await drive(badSig);
  check('firma dichiarata ma vuota: 400 anche se un altro conduttore firma', r3.code === 400 && r3.body.error === 'signature_unreadable');

  const r4 = await drive({ ...FULL(), contractId: 'sparito' });
  check('contratto inesistente: 404', r4.code === 404 && r4.body.error === 'contract_not_found');
}

// ═══ 4. L'inventario viaggia col verbale (15/10/2026) ═══════════════════
{
  seed('admin', 'own1');
  const c = store.get('contracts/ctr1');
  c.inventario = { url: 'https://firebasestorage.googleapis.com/v0/b/x/o/contracts%2Fctr1%2Finventario-test.pdf?alt=media', items: 12 };
  const res = await drive(FULL());
  const jm = mailTo('julie@tenant.fr'), lm = mailTo('stefano@landlord.it');
  const names = (m) => (m && m.attachments || []).map(a => a.filename);
  check('inventario: allegato al verbale per conduttrice e proprietario', res.code === 200
    && names(jm[0]).includes('BOOM_Inventario.pdf') && names(lm[0]).includes('BOOM_Inventario.pdf')
    && names(jm[0]).includes('BOOM_Verbale_consegna.pdf'));
  const inv = jm[0].attachments.find(a => a.filename === 'BOOM_Inventario.pdf');
  check('inventario: sono i byte del file archiviato', !!inv && inv.content.toString().startsWith('%PDF-1.4 inventario'));

  seed('admin', 'own1');
  store.get('contracts/ctr1').inventario = { url: 'https://evil.example.com/inventario-test.pdf' };
  await drive(FULL());
  check('inventario: un URL fuori dal nostro Storage non viene MAI scaricato né allegato', !names(mailTo('julie@tenant.fr')[0]).includes('BOOM_Inventario.pdf'));

  seed('admin', 'own1');
  await drive(FULL());
  check('senza inventario: il verbale parte come prima, un solo allegato', names(mailTo('julie@tenant.fr')[0]).join(',') === 'BOOM_Verbale_consegna.pdf');
}

// Nessun verbale «firmato» o messaggio se una firma dichiarata non può
// essere rappresentata sul PDF. Il decoder pdf-lib è quello reale.
for (const [label, edit, error] of [
  ['nome vuoto', f => { f.name = '  '; }, 'signer_name_required'],
  ['PNG corrotto', f => { f.sig = 'data:image/png;base64,Ym9vbQ=='; }, 'signature_unreadable'],
  ['JPEG corrotto', f => { f.sig = 'data:image/jpeg;base64,Ym9vbQ=='; }, 'signature_unreadable'],
]) {
  for (const idx of [0, 2]) {
    seed('admin', 'own1');
    const body = FULL(); edit(body.firme[idx]);
    const response = await drive(body);
    check(`${label}, firmatario ${idx}: 400 esplicito`, response.code === 400 && response.body.error === error);
    check(`${label}, firmatario ${idx}: zero Storage, archivio, stato o email`,
      storageFiles.size === 0 && !store.get('contracts/ctr1').verbaleConsegna
      && ![...store.keys()].some(k => k.startsWith('documents/')) && mails().length === 0);
  }
}

// ═══ Esito ══════════════════════════════════════════════════════════════
console.log(`\nVerbale: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLITI: ' + bad.join(' | ')); process.exit(1); }
