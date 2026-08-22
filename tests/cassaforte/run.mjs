// tests/cassaforte/run.mjs — IL BACKUP CHE NON MENTE.
//
// La Cassaforte esiste perché il database non aveva UNA copia. Le regole
// che la rendono affidabile, guidate sul run() VERO sopra un Firestore in
// memoria (pattern tests/hold):
//   - il dump contiene le collection coi loro documenti (ZIP STORE: il
//     contenuto si legge nei byte), e l'INDICE dice i conteggi VERI;
//   - una collection illeggibile non ferma le altre — ma finisce
//     nell'INDICE e su Telegram: un buco taciuto è un backup bugiardo;
//   - il secondo giro dello stesso giorno è un no-op (marker heartbeat);
//   - ?dry non scrive niente: né marker, né Storage, né email;
//   - se l'email salta, la copia Storage resta e Telegram avvisa;
//   - quando l'email PARTE, lo ZIP vero viaggia in allegato.
//
// nodemailer è mockato via loader: senza, sendEmail apre una VERA socket
// SMTP verso Gmail e la suite si pianta ad aspettare la rete.
//
//   node tests/cassaforte/run.mjs

import { register } from 'node:module';
register('./loader.mjs', import.meta.url);

process.env.FIREBASE_API_KEY = 'k';
process.env.FIREBASE_ADMIN_EMAIL = 'a@boom';
process.env.FIREBASE_ADMIN_PASS = 'p';
process.env.FIREBASE_PROJECT_ID = 'test-proj';
process.env.TELEGRAM_BOT_TOKEN = 'tg';
process.env.TELEGRAM_CHAT_ID = '1';
process.env.GMAIL_USER = 'boom@test';
globalThis.__mailFail = true;   // parte col guasto: resta la via Storage

const DB = new Map();
const TG = [];
const STORAGE = new Map();
let ROTTA = null;        // collection che simula il guasto
let STORAGE_GIU = false; // simula le rules non deployate (upload 403)

const toF = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toF) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toF(x)])) } };
  return { stringValue: String(v) };
};
const flds = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, toF(v)]));
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), m = (opts.method || 'GET').toUpperCase();
  if (u.includes('accounts:signInWithPassword')) return json({ idToken: 'T' });
  if (u.includes('api.telegram.org')) { TG.push(JSON.parse(opts.body).text); return json({ ok: true }); }
  if (u.includes('firebasestorage.googleapis.com')) {
    if (STORAGE_GIU) return json({ error: { code: 403 } }, 403);
    const name = decodeURIComponent(u.match(/name=([^&]+)/)[1]);
    STORAGE.set(name, opts.body);
    return json({ downloadTokens: 'tok123' });
  }
  if (!u.includes('firestore.googleapis.com')) throw new Error('fetch imprevisto: ' + u);
  if (u.includes(':runQuery')) {
    const coll = JSON.parse(opts.body).structuredQuery.from[0].collectionId;
    if (coll === ROTTA) return json({ error: { message: 'guasto simulato' } }, 500);
    const docs = [...DB.entries()].filter(([p]) => p.startsWith(coll + '/'))
      .map(([p, f]) => ({ document: { name: 'projects/x/databases/(default)/documents/' + p, fields: flds(f) } }));
    return json(docs);
  }
  const after = decodeURIComponent(u.split('/documents/')[1] || '');
  if (m === 'POST') {
    const coll = after.split('?')[0];
    const dm = u.match(/documentId=([^&]+)/);
    const id = dm ? decodeURIComponent(dm[1]) : 'auto_' + DB.size;
    const path = coll + '/' + id;
    if (DB.has(path)) return json({ error: { code: 409, status: 'ALREADY_EXISTS' } }, 409);
    DB.set(path, JSON.parse(opts.body || '{}').fields);
    return json({ name: path });
  }
  if (m === 'GET') return json({ error: { status: 'NOT_FOUND' } }, 404);
  if (m === 'PATCH') { DB.set(after.split('?')[0], {}); return json({ name: after }); }
  if (m === 'DELETE') { DB.delete(after.split('?')[0]); return json({}); }
  throw new Error('metodo imprevisto ' + m);
};

const { run, COLLECTIONS } = await import('../../api/ops/cassaforte.js');

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${cond || !extra ? '' : ` — ${extra}`}`);
  cond ? pass++ : fail++;
};

DB.set('listings/l1', { name: 'Casa A', price: 1200 });
DB.set('listings/l2', { name: 'Casa B', price: 900 });
DB.set('contracts/c1', { tenantName: 'Anna Rossi', rent: 1200 });
DB.set('payments/p1', { amount: 1200, status: 'paid' });

// ═══ 1. dry: conta senza scrivere ═══
console.log('\nDRY');
{
  const r = await run({ dry: true, dayOverride: '2026-08-18' });
  check('conta i documenti veri', r.counts.listings === 2 && r.counts.contracts === 1);
  check('lo zip esiste e pesa', r.zipBytes > 200);
  check('NIENTE marker, Storage o email', !DB.has('heartbeat/cassaforte-2026-08-18') && STORAGE.size === 0);
}

// ═══ 2. il giro vero ═══
console.log('\nIL GIRO VERO');
{
  const r = await run({ dayOverride: '2026-08-18' });
  check('lo zip e\' su Storage', STORAGE.has('backups/cassaforte-2026-08-18.zip'));
  const zip = Buffer.from(STORAGE.get('backups/cassaforte-2026-08-18.zip'));
  check('formato ZIP vero', zip.slice(0, 2).toString() === 'PK');
  const testo = zip.toString('utf8');
  check('il contenuto ci sta DAVVERO dentro (STORE)', testo.includes('Casa A') && testo.includes('Anna Rossi'));
  check('l\'INDICE dice i conteggi veri', testo.includes('listings: 2 documenti') && testo.includes('contracts: 1 documenti'));
  check('l\'email saltata non e\' silenzio: Telegram avvisa e la via Storage resta',
    r.emailed === false && r.url.includes('backups%2Fcassaforte-2026-08-18.zip')
    && TG.some(t => /non .{0,2} partita/.test(t) && /Resta la copia su Storage/.test(t)));
}

// ═══ 3. idempotenza ═══
console.log('\nIDEMPOTENZA');
{
  STORAGE.clear();
  const r = await run({ dayOverride: '2026-08-18' });
  check('il secondo giro dello stesso giorno e\' un no-op', r.done === 'già in cassaforte' && STORAGE.size === 0);
}

// ═══ 4. il buco dichiarato ═══
console.log('\nIL BUCO DICHIARATO');
{
  ROTTA = 'contracts'; TG.length = 0;
  const r = await run({ dayOverride: '2026-08-19' });
  check('le altre collection si salvano comunque', STORAGE.has('backups/cassaforte-2026-08-19.zip'));
  const testo = Buffer.from(STORAGE.get('backups/cassaforte-2026-08-19.zip')).toString('utf8');
  check('l\'INDICE dichiara il buco', testo.includes('contracts: ILLEGGIBILE'));
  check('Telegram nomina la collection rotta', TG.some(t => t.includes('contracts')));
  check('il buco e\' nel rapporto', r.buchi.length === 1 && r.buchi[0].startsWith('contracts'));
  ROTTA = null;
}

// ═══ 5. l'email che parte porta lo ZIP vero ═══
console.log('\nL\'EMAIL CHE PARTE');
{
  globalThis.__mailFail = false;
  const r = await run({ dayOverride: '2026-08-20' });
  const mail = (globalThis.__mails || [])[0];
  check('emailed e\' vero', r.emailed === true);
  check('l\'allegato E\' lo ZIP di Storage', !!mail
    && mail.attachments?.[0]?.filename === 'boom-cassaforte-2026-08-20.zip'
    && Buffer.from(mail.attachments[0].content).slice(0, 2).toString() === 'PK');
  check('il corpo porta il link Storage e l\'indice',
    !!mail && mail.text.includes('backups%2Fcassaforte-2026-08-20.zip')
    && mail.text.includes('listings: 2 documenti'));
}

// ═══ 6. il tetto dichiarato ═══
console.log('\nIL TETTO DICHIARATO');
{
  const r = await run({ dayOverride: '2026-08-21', limitPer: 2 });
  check('count == tetto viene DICHIARATO, mai sottinteso',
    r.buchi.some(b => /listings: raggiunto il tetto/.test(b)));
  const testo = Buffer.from(STORAGE.get('backups/cassaforte-2026-08-21.zip')).toString('utf8');
  check('l\'INDICE marca la possibile troncatura', testo.includes('(TETTO — forse troncata)'));
}

// ═══ 7. storage giù: l'email parte LO STESSO ═══
console.log('\nSTORAGE GIU (rules non deployate)');
{
  STORAGE_GIU = true; globalThis.__mails.length = 0;
  const r = await run({ dayOverride: '2026-08-22' });
  check('l\'email parte anche senza Storage', r.emailed === true && r.url === null);
  check('l\'allegato porta comunque lo ZIP',
    Buffer.from(globalThis.__mails[0].attachments[0].content).slice(0, 2).toString() === 'PK');
  check('il corpo dice che la copia e\' SOLO l\'allegato',
    /SOLO questo allegato/.test(globalThis.__mails[0].text));
  check('il buco storage e\' dichiarato', r.buchi.some(b => /^storage:/.test(b)));
}

// ═══ 8. NESSUNA copia = errore, e il retry non trova un falso "fatto" ═══
console.log('\nLA NOTTE SENZA COPIE');
{
  globalThis.__mailFail = true;  // storage ancora giu' + email giu'
  let err = null;
  try { await run({ dayOverride: '2026-08-23' }); } catch (e) { err = e; }
  check('il run FALLISCE (mai una notte verde senza copie)',
    !!err && /nessuna copia/.test(err.message));
  check('il marker del giorno e\' stato tolto: il retry puo\' correre',
    !DB.has('heartbeat/cassaforte-2026-08-23'));
  STORAGE_GIU = false; globalThis.__mailFail = false;
  const r2 = await run({ dayOverride: '2026-08-23' });
  check('e il retry salva davvero', r2.emailed === true
    && STORAGE.has('backups/cassaforte-2026-08-23.zip'));
}

check('\nle collection critiche ci sono tutte (unione con la lista audit)',
  ['listings', 'contracts', 'payments', 'leads', 'users', 'settings',
   'bankTransactions', 'propertyLocks', 'operatorTasks', 'rendiconti']
    .every(c => COLLECTIONS.includes(c)));

console.log(`\n${fail ? '\x1b[31m' : '\x1b[32m'}CASSAFORTE: ${pass} ok, ${fail} falliti\x1b[0m`);
process.exit(fail ? 1 : 0);
